#!/usr/bin/env node
/*
 * verify_road_ambush.js — 街道の襲撃 (#51 隊商が魔物に襲われている現場に居合わせる)
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-04_road-caravan-ambush.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§5 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_cone_cast.js / tools/verify_road_events.js の項目 1)。
 *
 * ■ 項目 1 (このコミット) で足したもの — **§0 装置 (0a)〜(0e) だけ**
 *     (0a) 表     … window.ROAD_EVENTS.AMBUSH が実在し、choices が
 *                   **判定つき 1 つ + 判定なし 1 つ**にちょうど分割される
 *                   (⛔ 2 を直書きせず実体から数えて整合だけ見る)。
 *                   成功文 ≠ 失敗文 / checkKey は SkillCheck.CHECKS 内 / dc は DC_TIERS 内。
 *                   ⭐ 装置としての最低条件 = ambRoll / ambSeed が関数として取れること
 *                     (依頼書 §5-1「公開は AMBUSH / ambRoll / ambSeed の 3 つ」)。
 *                     ⛔ これが無いと (0c)(0d)(0e) が全部空振りする。
 *     (0b) 写経   … world.html の **配信バイト**に AMBUSH の title / intro / label /
 *                   結末文が **1 つも出てこない** (verify_road_events (0b) と同じ物差し)。
 *     (0c) 決定論 … 襲撃が **必ず出る種**と**必ず出ない種**が両方存在する。
 *                   ⭐ 種の走査 (ambRoll の列) だけで満足せず、**実際に歩かせて**
 *                     「出る種では器が開き / 出ない種では 1 度も開かない」まで見る。
 *     (0d) 恒等   … 同じ種で ROAD_EVENTS.rnd() を N 回引いた列が、
 *                   **襲撃機能を通す前と 1 つも変わらない** (⭐ 罠 B の検出器。依頼書 §2-4)。
 *     (0e) 3 経路 … 判定なし / 判定つき成功 / 判定つき失敗 の **それぞれ**で襲撃が発火し、
 *                   結末の文が AMBUSH の実体 (result / success / fail) と一致する。
 *                   ⛔ 「発火が 1 件以上」で満足しない。
 *
 *   ⛔ §1〜§5 は**この項目では実装しない** (項目 2 / 項目 3 の担当)。全部 PENDING で並べてある。
 *   ⛔ 負のコントロール (--negative の 20 本) は **項目 4 の担当**。
 *      名前と担当節だけ下の MUT_TODO に並べてある (ポートは 1 つも開かない)。
 *
 * ■ 項目 4 (締め) で足したもの — **負のコントロール 20 本 (--negative)**
 *   ⭐ 依頼書 §8 の変異表 20 行を全部 from/to の逐語置換として実装し、**担当の節が
 *     実際に赤くなる**ことを機械で確かめる (緑のままなら「その受入条件は何も検出していない」
 *     証拠なので FAILED)。⭐ (n9a)(n9b) が「実装漏れ 0 件 / 20 行そろっている」を締める。
 *   ⚠⚠ **依頼書どおりでは赤にできず作り替えた変異が 1 本** = woundtoolate
 *     (「適用を consumeRoadBoon の後へ動かす」は 1 行置換にならない → 欠陥そのものの
 *      再現「適用した hp が後から maxHp で上書きされる」へ書き直した。⛔ assert は 1 文字も
 *      緩めていない)。
 *   ⚠⚠ **担当節を広げた変異が 1 本** = nospawnresume ((3a) → (3a)(3c))。項目 3 の実装で
 *     敗北の帰還も同じ resume 枝を通るようになったため。⭐ 実走で確定した (⛔ 机上ではない)。
 *   ⭐ 走らせるレグは LEG_NEED / LEG_DEP から **targets ∪ record の和集合**で決める
 *     (20 本 x 全レグは実時間で 1 時間を超える。⛔ 母集団は 1 つも削っていない)。
 *
 * ■ 項目 2 (街道側の実装) で足したもの — **§1 (1a)〜(1g) と §4 の (4c)**
 *     (1a) 4 経路 … 判定なし / 判定つき成功 / 判定つき失敗 / **判定が null** を実際に押す。
 *                   ⭐ 4 本目 (null) は js/skill-check.js を 1 バイトも触らず、ページの中で
 *                     resolveSkillCheck を「null を返す関数」へ差し替えて作る
 *                     (= 未知の checkKey / 代表者が選べない で実際に起きる姿)。
 *                     ⚠ null は **失敗ではない** = 結末は出るが戦闘へは行かない。
 *     (1b) 見捨てた … storage が **走行前も走行後も空**。⭐ 走行前を AND で見るのは
 *                   「元から在った値が残っているだけ」を「書いていない」と読み違えないため。
 *     (1c) 助けた   … waves 1 件 / roadBattle.at と roadReturn が**器が開いた停留所そのもの**で、
 *                   細分化グラフ (NODES ∪ STEPS) に実在する。盤面が空でないことも AND。
 *     (1d) 奇襲     … 同じ種・同じ停留所で d20=20 / d20=1 の surprise が true / false に割れる。
 *     (1e) 遷移先   … 「先へ進む」を押して index.html / search === ""。
 *                   ⚠⚠⚠ **押す腕は fireWin ただ 1 本**。遷移すると window.__ambOpen ごと
 *                     消えるので、他の腕でも押すと ambushOpens が 0 になり (0c)(0e)(1a) が
 *                     **偽の赤**になる。⇒ captureOpens() を **遷移の前に**必ず通す。
 *     (1f) 編成なし … 同じ種で partyMembers だけ抜くと襲撃 0 件。母集団 = 対照が発火すること。
 *     (1g) 器       … compact 390x844 で **導入 + 結末 3 種**の 4 枚。閉じたあとボタン 0 個まで。
 *     (4c) 恒等     … EVENTS の [id, terrain] の並びと停留所の地形分布が着手前の固定表と一致。
 *   ⛔ (3c) は index.html 側の書き出しに依存するので **PENDING のまま**残した (項目 3 の担当)。
 *
 * ■ ⭐⭐⭐ 項目 1 の時点で赤いのが**正しい** assert
 *   本番 (js/road-events.js / world.html) にはまだ AMBUSH も ambRoll も無いので:
 *     (0a) … window.ROAD_EVENTS.AMBUSH が undefined → **正しい赤**
 *     (0b) … 検索する文言が 0 本 = 母集団が立たない → **正しい赤**
 *             ⚠⚠ 依頼書は「(0b) は写経していないので緑」と予測しているが、
 *               母集団ガード (検索対象が 1 本も無いなら「出てこない」は**自明に真**) を
 *               入れると赤になる。#48 の作法どおり **assert を緩めず予測のほうを訂正**した
 *               (⛔ 母集団が立たなかったら FAIL。skip = 緑にすると assert が静かに消える)。
 *     (0c) … ambRoll が無いので種を 1 つも分類できない → **正しい赤**
 *     (0e) … 襲撃が 1 度も発火しない → **正しい赤**
 *   ⭐ 緑になるのは **(0d) だけ** (基準列は「襲撃機能を通す前」の木から採ってあるので、
 *     本番が未実装のいまは必ず一致する = 装置が正しく立っていることの証明)。
 *   ⛔ 赤を消すために本番コードを書かない (項目 2 の仕事)。
 *   ⛔ 赤を消すために assert を緩めない / skip して緑にしない。
 *
 * ■ ⚠⚠⚠ (0d) の基準列は **固定値**で持つ (走行時に自分で採って自分と比べない)
 *   実行時に基準を採り直す形にすると **永久緑**になる。下の BASE_RND は
 *   **2026-09-04 / HEAD = bdc6880 (襲撃機能を 1 バイトも入れていない木)** で実測した
 *   `ROAD_EVENTS.rnd()` の先頭 32 値そのもの。採取条件:
 *     world.html?roadseed=<種> を load → window.__world が立つまで待つ → 400ms settle →
 *     RE.rnd() を 32 回。3 種とも RE.seed()==種 / fromUrl==true / roadEvent().fired==0 /
 *     typeof RE.ambRoll==="undefined" / typeof RE.AMBUSH==="undefined" を同時に確認済み。
 *   ⛔ 項目 2 以降でこの表を採り直さないこと (採り直した瞬間に (0d)(4a) が死ぬ)。
 *
 * ■ ⭐⭐⭐ (0d) が実際に捕まえる欠陥は 3 つ。**素の boot 列だけでは足りない**
 *   1. 素の列   … 読み込みの最中に rnd() が引かれていないか (列が丸ごとずれる)
 *   2. 挟み込み … rnd() を 16 回引く → **ambRoll() を 8 回呼ぶ** → さらに 16 回引く。
 *                 連結が基準列と一致すること。⭐⭐⭐ 罠 B (`ambRnd` をやめて `rnd()` を
 *                 呼ぶ = 変異 sharedrng) は **ここでしか捕まらない** ——
 *                 boot 時点ではまだ 1 度も襲撃を振っていないので素の列は無傷に見える。
 *   3. 静的     … world.html の配信バイトに `rnd(` が **0 件** (着手前実測 = 0)。
 *                 ⭐ world.html が ambRoll を経由せず `RE.rnd()` を直接叩く形の罠 B は
 *                   1. でも 2. でも届かない (ドライバは歩かせずに測るため)。ここで塞ぐ。
 *
 * ■ 測り方の規律 (verify_road_events からそのまま継いだもの)
 *   ⛔ `?autoplay` / `opts.auto` は使わない (SkillCheck が UI を出さず即解決してしまう)。
 *   ⛔ goToPoint() / goToNode() を page.evaluate から呼ばない。⭐ **実クリックだけで歩く**。
 *   ⛔ ROAD_EVENTS.close() を evaluate から呼ばない (押し口が壊れていても永久に緑になる)。
 *   ⛔ 襲撃の id ("road_caravan_ambush") をドライバへ写経しない —— 分類は
 *      **ページの中で `ev.id === RE.AMBUSH.id`** を見る (実体から引く)。
 *   ⚠ 器を開いてから ROAD_EVENTS.ARM_MS (ゴーストクリック除け) を必ず待ってから押す。
 *   ⚠ 行き先に phlan を選ばない (enter を持つただ 1 つのノード = 着いた瞬間に town.html へ飛ぶ)。
 *   ⚠ 襲撃は **partyMembers (rich) が無いと出ない** (依頼書 §5-3 の hasRealParty)。
 *     歩行の観測では sessionStorage へ **partyMembers と partyComposition の両方**を仕込む。
 *     ⭐ (1f) はその逆 (partyMembers を空にしたら出ない) を測る = 項目 2 の担当。
 *   ⚠⚠⚠ [[project-headless-verification]] の実測 = 実プレイ系ドライバを他の headless Chrome と
 *     並走させると偽の赤が出る。**逐次で走らせること**。
 *
 * ■ ⛔ 測らないこと (依頼書 §8)
 *   AMBUSH_RATE の具体値 (0.06) / 敵の構成と count / 文言の中身 / WAGON_TARGET_CHANCE。
 *
 * ■ ⚠ ポート **9970**。変異 20 本ぶんを **9971〜9990** で予約してある
 *   (PORT_OF[k] = PORT + 1 + i なので **変異を 1 本足すごとに占有が 1 つ伸びる**)。
 *   ⭐ 撤退アーム (?ambush=0) は **クエリ**なので base と同じポートで開く = 追加のポートを取らない
 *     (#47 / #48 の「ポートは base でなく --negative で開くレンジで数える」の実践)。
 *   2026-09-04 実測 (`grep -rhoE "9[0-9]{3}" tools/*.js | sort -n | uniq | tail -25`) =
 *   既存の最大は **9960** (verify_cone_cast の撤退アーム) / 9999 は別用途。**9970〜9990 は衝突 0 本**。
 *   ⭐ 受入条件 (--negative なし) が listen するのは **9970 の 1 本だけ**。
 *     --negative では 9971〜9990 を **20 本ぶん**開く (2026-09-04 実測でも衝突 0 本)。
 *
 * ■ 使い方
 *     node tools/verify_road_ambush.js               受入条件
 *     node tools/verify_road_ambush.js --negative    負のコントロール (変異 20 本)
 *     node tools/verify_road_ambush.js --negative --mut sharedrng,copytext   一部だけ (デバッグ用)
 *     node tools/verify_road_ambush.js --headful     目で見る
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '9970'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 負のコントロール (--negative) — ⭐ 項目 4 で **20 本すべて実装** = PENDING 0
//   ⛔ 20 本を表から隠さない (--negative が「実装を忘れた変異」を件数から隠さない)。
//   ⚠⚠ 作法 (verify_cone_cast の起動時検算をそのまま写した。下の検算ループが強制する):
//      ① 置換文字列は **1 行**に閉じる (world.html は CRLF / js/*.js は LF)
//      ② 置換前後で **バイト長を変える** (同じ長さだと配信の検算が誤報する)
//      ③ 当て先は **ちょうど 1 箇所**。0 or 2 箇所なら走らせる前に exit 3
//      ④ 変異は「仕様の言葉」ではなく **その assert が実際に読む値の供給口**へ当てる
//   ⭐⭐⭐ targets = 「赤くなること」を判定する節 / record = 「ついでにどうなったか」を
//      記録するだけの節 (⛔ 判定しない)。**担当節は机上で書かず実走で確定した**。
//   ⚠⚠⚠ **同じアンカーを 2 本の変異が共有してよい** (worldremove / resumesticky と
//      gameoveramb / gameovernever)。各変異は素のソースから独立に組むので、
//      一意性検算はそれぞれ 1 件で通る。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ⭐ 罠 B (依頼書 §2-4) の再現。⚠ 当て先は ambRnd の**中身**ではなく ambRoll の
     **引き口** —— ambRnd の式を書き換えると verify_road_events の変異 seedignore の
     逐語アンカー (`return ((t ^ (t >>> 14)) >>> 0) / 4294967296;`) の件数が動いて
     あちらが起動時検算で exit 3 になる (#51 項目 2 が実際に踏んだ制約)。 */
  sharedrng: { file: 'js/road-events.js', targets: ['0d', '4a'],
    from: '  function ambRoll() { return ambRnd() < AMBUSH_RATE; }',
    to: '  function ambRoll() { return rnd() < AMBUSH_RATE; /* neg:sharedrng 共有ストリーム */ }',
    why: '⭐ 罠 B の再現: ambRnd をやめて rnd() を呼ぶ (既存 golden の決定論が 1 つずれる)' },

  /* ⭐ 罠 C (依頼書 §2-5) の再現。⚠ 「助けに入る」を判定なしにすると、既存 golden 3 本
     (verify_world_steps:774 / verify_world_map:683 / verify_quest_walk:831) が押す
     `filter(x => !x.check)[0]` が **戦闘へ行く枝**になる。⭐ その 3 本は AMBUSH を
     見ない (EVENTS に入れていない) ので、番人はこちらの (0a)(1a) しか居ない。 */
  helpnocheck: { file: 'js/road-events.js', targets: ['0a', '1a'], record: ['0e'],
    from: '        label: "茂みから回り込み、隙を突く", check: true,',
    to: '        label: "茂みから回り込み、隙を突く", check: false,  /* neg:helpnocheck */',
    why: '⭐ 罠 C の再現: 「助けに入る」を check:false にする' },

  /* ⭐ 罠 A (依頼書 §2-3) の再現。⚠ 当て先は「表そのもの」ではなく **文の位置** ——
     AMBUSH の定義の直後で EVENTS へ push する。⛔ EVENTS のリテラルへ足す形は
     複数行になるので作法①に反する。 */
  intoevents: { file: 'js/road-events.js', targets: ['4c'], record: ['0a'],
    from: '  var PARTY_KEY = "dragonfighters.partyComposition";',
    to: '  EVENTS.push(AMBUSH); /* neg:intoevents */ var PARTY_KEY = "dragonfighters.partyComposition";',
    why: '⭐ 罠 A の再現: AMBUSH を EVENTS へ push する (pickEvent の引きが動く)' },

  /* ⭐ 器を閉じずに描き直す。⚠⚠ 当て先は close() ではなく **paint() の側** ——
     close() を壊しても (1g) の afterClose しか動かないが、paint() を壊すと
     「結末の画面に前の二択が残る」= プレイヤーが実際に見る壊れ方になる。
     ⚠ `    n.innerHTML = "";` は close() 側の `if (n) n.innerHTML = "";` と字面が
       重なるので、次行を足した 2 行アンカーで paint() 側へ絞る (LF ファイル)。 */
  boxleak: { file: 'js/road-events.js', targets: ['1g'], multiline: true,
    from: '    n.innerHTML = "";\n    setBoonLine("");   /* ⭐ #47: 器を描く共通口。',
    to: '    /* neg:boxleak 前のボタンを消さない */\n    setBoonLine("");   /* ⭐ #47: 器を描く共通口。',
    why: '器を閉じずに描き直す (結末の画面に前の二択のボタンが残る)' },

  /* ⭐ 依頼書 §2-6 の罠 D。⛔ world.html で removeItem を 2 本目にすると
     verify_road_events (2c) も同時に赤くなる (件数で縛られている)。 */
  worldremove: { file: 'world.html', targets: ['4b'], record: ['3b'],
    from: '    if (ambResume) { try { sessionStorage.setItem(ROAD_RETURN_KEY, ""); } catch (e) {} }',
    to: '    if (ambResume) { try { sessionStorage.removeItem(ROAD_RETURN_KEY); } catch (e) {} } /* neg:worldremove */',
    why: '⭐ 罠 D の再現: roadReturn の消費を removeItem にする' },

  /* ⭐ 依頼書 §2-7 の罠 E。⚠⚠ 担当節は (3a) だけでなく **(3c) も**。項目 3 の実装で
     敗北の帰還も同じ resume 枝を通るようになった (roadReturn へ "phlan" を書く形へ
     訂正したため) ので、この枝を潰すと負けたときも spawnFor の答え (= 目的地の前) に
     立つ = (3c) も赤くなる。⭐ 机上ではなく実走で確定した (依頼書 §12)。 */
  nospawnresume: { file: 'world.html', targets: ['3a', '3c'], record: ['3b'],
    from: '    if (ambResume && Object.prototype.hasOwnProperty.call(WM.walkNodes(), ambResume)) {',
    to: '    if (false /* neg:nospawnresume */ && Object.prototype.hasOwnProperty.call(WM.walkNodes(), ambResume)) {',
    why: '⭐ 罠 E の再現: roadReturn を見ずに spawnFor だけ使う' },

  resumesticky: { file: 'world.html', targets: ['3b'], record: ['3a'],
    from: '    if (ambResume) { try { sessionStorage.setItem(ROAD_RETURN_KEY, ""); } catch (e) {} }',
    to: '    if (ambResume) { /* neg:resumesticky 空文字で潰さない */ }',
    why: 'roadReturn を空文字で潰さない (襲撃地点に立ち続ける)' },

  /* ⚠⚠ (1b) は走行前 storagePre も見ているので「元から在った値を残す」形の変異は
     **空振りする**。⇒ 見捨てた枝で **実際に setItem する**形にする (項目 3 の申し送り)。 */
  dismisswrite: { file: 'world.html', targets: ['1b'], record: ['1a'],
    from: '      if (!fight) { RE.showResult(ev, text, null, null); return; }',
    to: '      if (!fight) { writeAmbushBattle(atId, false); /* neg:dismisswrite */ RE.showResult(ev, text, null, null); return; }',
    why: '見捨てた枝でも roadBattle / roadReturn を書く' },

  nullfight: { file: 'world.html', targets: ['1a'],
    from: '      var fight = !!(choice && choice.check && outcome);',
    to: '      var fight = !!(choice && choice.check); /* neg:nullfight null でも戦う */',
    why: 'resolveSkillCheck が null でも戦闘へ行く (null を失敗と取り違える)' },

  nosurprise: { file: 'world.html', targets: ['1d'],
    from: '      writeAmbushBattle(atId, !!outcome.success);',
    to: '      writeAmbushBattle(atId, true); /* neg:nosurprise 常に奇襲 */',
    why: 'surprise を常に true (d20 を振る意味が消える)' },

  nopartyguard: { file: 'world.html', targets: ['1f'],
    from: '      if (!hasRealParty()) return false;                /* ⭐ 編成が無いなら出さない (§5-3) */',
    to: '      if (false) return false;  /* neg:nopartyguard 編成の門番を外す */',
    why: 'hasRealParty() を外す (受注なしで歩いていても戦闘へ飛ぶ)' },

  /* ⭐ (0b) の番人。⚠⚠ ヒットの判定は **文言の全文一致** (indexOf) なので、断片ではなく
     **選択肢のラベル 1 本を丸ごと**写す。⭐ 素の world.html には AMBUSH の文言が
     1 つも無い (本番のコメントは「街道**での**襲撃」と書き分けてある = 2026-09-04 実測)。 */
  copytext: { file: 'world.html', targets: ['0b'],
    from: '    var ROAD_BATTLE_KEY = "dragonfighters.roadBattle";',
    to: '    var ROAD_BATTLE_KEY = "dragonfighters.roadBattle"; /* neg:copytext 見つからぬよう街道を外れて通り過ぎる */',
    why: '⭐ AMBUSH の文言を world.html へ写経する' },

  /* ⭐ 罠 F (依頼書 §2-8) の再現。⛔ 「currentScenario を読む」ではなく **書く**形。 */
  overwritescen: { file: 'index.html', targets: ['2b'],
    from: '      scenarioId = "road-ambush";',
    to: '      scenarioId = "road-ambush"; try { sessionStorage.setItem("dragonfighters.currentScenario", "road-ambush"); } catch (e) {} /* neg:overwritescen */',
    why: '⭐ 罠 F の再現: currentScenario を襲撃で上書きする' },

  woundzero: { file: 'index.html', targets: ['2d'],
    from: 'const put = (m, r) => Math.max(1, Math.min(m, Math.round(m * r)));',
    to: 'const put = (m, r) => Math.min(m, Math.round(m * r)); /* neg:woundzero 下限なし */',
    why: '下限 1 HP のクランプを外す (次の潜行が開始即死になる)' },

  woundpartial: { file: 'index.html', targets: ['2e'],
    from: '      if (o.n !== n || o.hp.length !== n) return;    /* ⛔ 人数不一致は丸ごと捨てる */',
    to: '      if (o.hp.length !== n) return; /* neg:woundpartial n を見ない */',
    why: '人数が食い違っても先頭から適用する' },

  /* ⚠⚠ 依頼書 §8 の「適用を consumeRoadBoon の後へ動かす」は **1 行置換にならない**
     (ブロックの移動)。⇒ #48 の作法どおり assert を緩めず **欠陥そのものを再現**する形へ
     書き直した = 適用した hp が後から maxHp で上書きされる (consumeRoadBoon の「糧」が
     後に来たときに実際に起きる姿)。⭐ 依頼書 §12 へ転記済み。 */
  woundtoolate: { file: 'index.html', targets: ['2c'], record: ['2d'],
    from: '        a.hp = put(a.maxHp || 1, want[i + 1]);',
    to: '        a.hp = put(a.maxHp || 1, want[i + 1]); hp = maxHp; /* neg:woundtoolate 後から全快 */',
    why: '⭐ 消耗を適用した後で hp が全快で上書きされる (適用位置が遅すぎる欠陥の再現)' },

  woundonlose: { file: 'index.html', targets: ['3c'],
    from: '        if (win) writeRoadWounds();',
    to: '        if (win || true) writeRoadWounds(); /* neg:woundonlose */',
    why: '敗北時にも roadWounds を書く (負けても傷だけ持ち越す)' },

  goldalways: { file: 'index.html', targets: ['2f'],
    from: '        const clearGold = (currentScenario && currentScenario.clearGold > 0 && !escortWagonLost())',
    to: '        const clearGold = (currentScenario && currentScenario.clearGold > 0 /* neg:goldalways */)',
    why: '馬車全損でも clearGold を入れる (守っても守らなくても同額)' },

  /* ⭐⭐⭐ (2g) の 2 本は **供給口 (関数の return)** へ当てる。⛔ 敗北確定の枝側を
     `if (true)` に潰す形でも赤くなるが、それは (2g) の**静的アンカー**が赤くなるだけで
     値の腕は緑のまま = 検出の筋が違う (項目 3 の申し送り)。 */
  gameoveramb: { file: 'index.html', targets: ['2g'],
    from: '    function escortWagonLossEndsRun() { return !roadAmbushRun; }',
    to: '    function escortWagonLossEndsRun() { return true; /* neg:gameoveramb */ }',
    why: '街道の襲撃でも gameOver を立てる (通りすがりの襲撃で潜行が終わる)' },

  gameovernever: { file: 'index.html', targets: ['2g'],
    from: '    function escortWagonLossEndsRun() { return !roadAmbushRun; }',
    to: '    function escortWagonLossEndsRun() { return false; /* neg:gameovernever */ }',
    why: '7.9-3 (闇市の隊商護衛) でも gameOver を立てない (既存の敗北条件が消える)' },
};
/* ══ #52 街道の卓上マップ (10 本) ══════════════════════════════════════════════
   ⭐ index.html は **CRLF**、js/road-events.js は **LF**。複数行アンカーは改行を間違えると
     置換対象 0 件で起動時 exit 3 になる (それが番人)。 */
const M52_ROW8 = '               "......................######.",   //  8  石積みが row8 へ降りる東側 + 東の森。橋 (9-10) は空ける';
const M52_ROW9 = '               ".............................",   //  9  ★街道の通し行。ここが 1 マスでも切れると詰む (規則④)';
const M52_ROW0 = '               ".............................",   //  0  外周 (フェザー帯) — 規則①。塞ぐのは sealRing の仕事';
const M52_ROW18 = '               ".............................",   // 18  外周 (フェザー帯) — 規則①';
Object.assign(MUTATIONS, {
  /* ⭐⭐⭐ 罠 A の本体。テーマ名を 1 変数に寄せてあるので、この 1 行で
     「積荷側 (FIELD_MODE) と mapDef 側 (resolve 規則④)」の両方が同時に屋外へ倒れる。 */
  fieldtheme: { file: 'js/road-events.js', targets: ['6c', '6d'],
    from: '  var AMBUSH_THEME = "bandits-forest";',
    to: '  var AMBUSH_THEME = "caravan-road";   /* neg:fieldtheme */',
    why: '⭐ 罠 A の再現: themeId を屋外テーマへ戻す (絵が 1 枚も出ず、空と丘だけが描かれる)' },

  /* ⭐⭐⭐ 罠 A の裏。「屋外テーマを外せば卓上マップが載る」という回避が 7.9-3 を壊すこと。 */
  fieldset: { file: 'index.html', targets: ['9a'],
    from: '    const FIELD_THEMES = new Set(["caravan-road"]);',
    to: '    const FIELD_THEMES = new Set([]);   /* neg:fieldset */',
    why: '⭐ 罠 A の裏: FIELD_THEMES から caravan-road を外す (7.9-3 隊商護衛が全損する)' },

  aspectskew: { file: 'js/road-events.js', targets: ['6b'],
    from: '        { id: "r0", role: "boss", rect: [4, 21, 22, 49],',
    to: '        { id: "r0", role: "boss", rect: [4, 21, 22, 48],   /* neg:aspectskew */',
    why: 'rooms[0].rect と tileBounds を食い違わせる (絵が縦横比の違う枠へ引き伸ばされる)' },

  bridgefill: { file: 'index.html', targets: ['7a', '7b'], multiline: true,
    from: M52_ROW8 + '\r\n' + M52_ROW9,
    to: '               ".........##...........######.",   //  8  neg:bridgefill\r\n'
      + '               ".........##..................",   //  9  neg:bridgefill',
    why: '橋の 4 マスを塞ぐ (街道が切れ、東西が最初から分断される)' },

  roadcut: { file: 'index.html', targets: ['7a'],
    from: M52_ROW9,
    to: '               "....................#........",   //  9  neg:roadcut',
    why: '街道の通し行を 1 マスだけ塞ぐ (迂回はできるので「経路が在るか」だけでは捕まらない)' },

  ringmark: { file: 'index.html', targets: ['7d'],
    from: M52_ROW0,
    to: '               "#............................",   //  0  neg:ringmark',
    why: 'マスクの外周に # を書く (sealRing の仕事を二重管理にする)' },

  maskshort: { file: 'index.html', targets: ['7e'],
    from: M52_ROW18,
    to: '               "............................",   // 18  neg:maskshort (1 桁足りない)',
    why: '⭐ blocked の 1 行を 1 桁削る (DFMapDef がマスクを丸ごと捨てる = 母集団が消える)' },

  srcbake: { file: 'js/road-events.js', targets: ['6b'],
    from: '          painting: { theme: "bandits-forest", key: "road_ambush" },',
    to: '          painting: { src: "assets/room_caravan-road_ambush.jpg" },   /* neg:srcbake */',
    why: 'painting に theme+key ではなく src を焼き込む (差し替えに追従できなくなる)' },

  nosealring: { file: 'index.html', targets: ['7c'],
    from: '             sealRing: true,   /* 街道の外周 1 タイルを通行不能に = 歩ける「壁抜けの帯」を作らない */',
    to: '             sealRing: false,  /* neg:nosealring */',
    why: '外周封鎖を外す (絵のフェザー帯を歩けてしまう)' },

  gateadd: { file: 'index.html', targets: ['6b'],
    from: '             tileBounds: [4, 21, 22, 49], node: true,      // 19 行 x 29 列。⚠ 行が先',
    to: '             tileBounds: [4, 21, 22, 49], node: true, gates: { left: [0, 9] },   /* neg:gateadd */',
    why: 'gates を足す (1 部屋で完結する戦場なのに出口の矢印と扉が出る)' },
});
const MUT_ORDER = ['sharedrng', 'helpnocheck', 'intoevents', 'boxleak', 'worldremove',
  'nospawnresume', 'resumesticky', 'dismisswrite', 'nullfight', 'nosurprise', 'nopartyguard',
  'copytext', 'overwritescen', 'woundzero', 'woundpartial', 'woundtoolate', 'woundonlose',
  'goldalways', 'gameoveramb', 'gameovernever',
  /* ⭐ #52 街道の卓上マップ (10 本)。⛔ 既存 20 本の**並びは動かさない**
     (ポートは並び順で 9971〜 と固定的に割り当てられるので、間に挿すと番号がずれる)。 */
  'fieldtheme', 'fieldset', 'aspectskew', 'bridgefill', 'roadcut',
  'ringmark', 'maskshort', 'srcbake', 'nosealring', 'gateadd'];
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].from);
/* ⭐ デバッグ用 —— `--mut sharedrng,copytext` で一部だけ回す。⛔ 既定は全 20 本。 */
const MUT_PICK = arg('mut', null);
const MUT_RUN = MUT_PICK ? MUT_PICK.split(',').map(s => s.trim()).filter(Boolean) : MUT_ORDER;
for (const k of MUT_RUN) {
  if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) {
    console.error('[drv] 未知の --mut: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');
    process.exit(3);
  }
}

/* ⭐⭐⭐ 配信バイトの凍結 (起動時検算)。⚠ アンカーが 1 箇所にヒットしなければ **ここで exit 3**。
 *  ⛔ リクエストのたびに readFileSync しない —— 別窓が保存すると走行中に
 *     「素の行」と「変異後の行」が混ざったビルドを配ってしまう。 */
const SRC = {};
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const mu = MUTATIONS[k];
  if (!mu.from) continue;
  if (!SRC[mu.file]) SRC[mu.file] = fs.readFileSync(path.join(ROOT, mu.file), 'utf8');
  const body = SRC[mu.file];
  const at = ' 変異 ' + k;
  if (typeof mu.from !== 'string' || typeof mu.to !== 'string') {
    console.error('[drv] ⛔' + at + ' の from/to が文字列でない'); process.exit(3);
  }
  if (!mu.multiline && (mu.from.indexOf('\n') >= 0 || mu.to.indexOf('\n') >= 0)) {
    console.error('[drv] ⛔' + at + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (mu.from.length === mu.to.length) {
    console.error('[drv] ⛔' + at + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
  }
  const n = body.split(mu.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔' + at + ' の置換対象が ' + mu.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(mu.from.slice(0, 100)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: mu.file, body: body.split(mu.from).join(mu.to) };
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
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const PAGE_PATH = '/world.html';
/* 撤退のクエリ (依頼書 §7)。§5 (5a) が項目 3/4 で使う。⭐ クエリなので追加のポートを取らない。 */
const RETREAT_QUERY = '?ambush=0';

/* ⭐ mutKey を渡すと、そのポートだけ **1 ファイルを変異後のバイトへ差し替えて**配る。
   ⛔ 素のポート (PORT) には絶対に渡さない = 受入条件は常に素の木で測る。 */
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const ov = mutKey ? (MUT_SRC[mutKey] || null) : null;
        if (ov && rel === ov.file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(ov.body); return;
        }
        const fp = path.join(ROOT, rel);
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* 書体 + 画像が届いて layout() が落ち着くまで待つ。⛔ 固定時間だけに頼らない。 */
async function settle(page) {
  try { await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null); } catch (e) {}
  await sleep(300);
}
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}
/* ★[#52 (6a)] 焼き上がりの JPEG を **バイトで**取る。⛔ utf8 で読むと寸法が読めない。 */
function httpGetBin(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', rej);
  });
}
/* JPEG の SOF マーカーから寸法を読む。⭐ 焼き付けツールの数値を写経せず**配信物そのもの**を測る。
   ⚠ SOF0/1/2/3/5/6/7/9/10/11/13/14/15 だけが寸法を持つ (DHT/DQT/SOS 等は読み飛ばす)。 */
function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const mk = buf[i + 1];
    if (mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const isSOF = (mk >= 0xC0 && mk <= 0xCF) && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC;
    if (isSOF) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    if (mk === 0xDA) return null;                 // 走査開始 = ここより先に SOF は無い
    i += 2 + len;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name: name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

/* ⚠⚠⚠ 母集団が立たなかったときの返し方。⛔ 「スキップして緑」は禁止。
 *  ⭐ 本体の assert は必ずこれを通して赤を返す = detail に `population: none` が出るので
 *    「測れないから赤」と「値が悪いから赤」が記録の上で区別できる。
 *  ⚠ 項目 2 以降が §1〜§5 を実装するときも、母集団ガードが偽の枝で **必ず** これを呼ぶこと。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定パラメタ
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 街道の襲撃が使う storage のキー (依頼書 §5-5 / §6-1 / §6-4)。
 *  ⛔ assert 側に literal を散らさない = 名前が変わってもここ 1 箇所を直す。 */
const KEY_BATTLE = 'dragonfighters.roadBattle';
const KEY_RETURN = 'dragonfighters.roadReturn';
const KEY_WOUNDS = 'dragonfighters.roadWounds';
const KEY_SCEN = 'dragonfighters.currentScenario';
const KEY_GENSCEN = 'dragonfighters.generatedScenario';
const KEY_BOON = 'dragonfighters.roadBoon';
const KEY_PARTY_COMP = 'dragonfighters.partyComposition';
const KEY_PARTY_MEM = 'dragonfighters.partyMembers';

/* ⭐ 編成。⚠⚠ **2 本とも要る** ——
 *   partyComposition … ROAD_EVENTS.buildParty() が読む (判定パネルのロスター)
 *   partyMembers     … 依頼書 §5-3 の hasRealParty() が読む (**無いと襲撃が出ない**)
 *  ⛔ partyComposition で代用しない (職業キーだけでは rich な編成にならない = 依頼書 §5-3)。 */
const PARTY4 = ['warrior', 'dwarf', 'elf', 'cleric'];
const PARTY_MEMBERS = [
  { classKey: 'warrior', isHero: true, name: '勇者', level: 3 },
  { classKey: 'dwarf', name: 'グリム', level: 3 },
  { classKey: 'elf', name: 'シルフィ', level: 3 },
  { classKey: 'cleric', name: 'リタ', level: 3 },
];

/* ⭐ js/skill-check.js の d20 は **Math.random 由来**で ?roadseed の PRNG とは別系統。
 *  成功と失敗の**両方**を引くにはここを固定するしかない
 *  (⛔ js/skill-check.js は 1 バイトも触らない / ⛔ opts.auto も ?autoplay も使わない)。 */
const D20_WIN = 0.999;    /* → d20 = 20 (クリティカル成功) */
const D20_LOSE = 0.0;     /* → d20 = 1  (ファンブル失敗) */

/* ── 潜行側 (index.html) の測定パラメタ — 項目 3 が足した §2 / (3c) / (5b) ──────
 * ⭐⭐⭐ 測り方 = sessionStorage へ値を置いてから index.html を開き、モジュール直下の
 *   let/const (scenarioId / currentScenario / hp / maxHp / allies / roadAmbushRun …) を
 *   **グローバル字句環境ごしに**読む (verify_road_boon の観測 C と同じ型)。
 *   ⛔ 本番へ測定専用の window シームを 1 つも足していない。
 * ⚠ index.html の run 開始 (formation 構築 → applyAccessoryHpBonus → consumeRoadWounds →
 *   consumePendingSummon → consumeRoadBoon) は **読み込み時**に走る。gameStarted は false の
 *   ままでよく、「キーかマウスを押すとスタート」の前でも hp / currentScenario は読める。 */
const PAGE_INDEX = '/index.html';
/* ★[#52] 焼き上がりの配信先。⛔ make_grid_map.py の台帳を写経せず、**この 1 本**だけを持つ。 */
const JPG_PATH = '/assets/room_caravan-road_ambush.jpg';
/* ★[#52 (9a)] 7.9-3「隊商護衛」の観測値。⭐⭐⭐ **#52 を 1 バイトも適用していない木**
   (c0a9134 = #53 起草のコミット / #52 の変更はまだ 1 つも入っていない) を実ブラウザで
   走らせて採った固定値。⛔ 実装後に採り直すと「自分と自分を比べる」形になり永久緑になる
   (#51 (0d) で実証済みの型)。⚠ 値を更新するときは必ず #52 以前の木で採り直すこと。 */
const ESCORT_BASE = {
  theme: 'caravan-road', fieldMode: true, isFieldTheme: true,
  isCustom: false, mapdefId: 'df-default-field', bandMask: true,
  openRows: '13:67 14:67 15:67', wagons: 1,
};
/* 盤面レグの取り出し。⛔ 無ければ null (捏造しない)。 */
function boardOf(m) {
  const L = legOf(m, 'board');
  return (L && L.board) ? L.board : null;
}
/* 本番から引いたマスク。⭐ ドライバは行文字列を 1 つも持たない。 */
function maskOf(m) {
  const b = boardOf(m);
  if (!b) return { ok: false, why: 'board レグが走っていない' };
  const cat = b.catalog;
  if (!cat) return { ok: false, why: 'painting の参照が無い (theme+key が引けない)' };
  if (cat.err) return { ok: false, why: 'DFMapDef がマスクを捨てた: ' + cat.err };
  const rows = cat.rows;
  if (!Array.isArray(rows) || rows.length < 2) return { ok: false, why: 'blocked が行文字列の配列でない' };
  const widths = Array.from(new Set(rows.map(r => (typeof r === 'string' ? r.length : -1))));
  if (widths.length !== 1 || widths[0] < 2) return { ok: false, why: '行の桁数が揃っていない: ' + JSON.stringify(widths) };
  return { ok: true, rows: rows, cols: widths[0] };
}
/* ⚠⚠⚠ §7 の母集団ガード。**(7e) を AND で内包する**ためにここを通す。
   ⛔ これが無いと「1 つも無い」型の assert (7c)(7d) がマスク欠損で自明に真になる。 */
function guardMask(m, tag) {
  const b = boardOf(m);
  if (!b) return popFail(tag + ' 盤面の観測', 'board レグが走っていない');
  const mk = maskOf(m);
  if (!mk.ok) return [false, '⛔ 母集団が立っていない (マスクが採れない): ' + mk.why
    + '  ⇒ この節は (7e) と一緒に赤にする (skip で緑にしない)'];
  if (!b.geo) return [false, '⛔ 幾何を測れていない (rect が無い)'];
  if (!(b.geo.open >= 200)) return [false, '⛔ 歩けるマスが ' + b.geo.open + ' 件しかない'
    + ' (卓上バトルマップとして母集団が立っていない)'];
  return null;
}
const WAIT_INDEX = 'typeof maxHp !== "undefined" && typeof allies !== "undefined"'
  + ' && typeof currentScenario !== "undefined" && !!document.getElementById("combatLog")';
const KEY_LAST = 'dragonfighters.lastResult';
const KEY_EXIT_VIA = 'dragonfighters.exitVia';
/* ⭐ 本命のクエスト。⛔ 街道の襲撃は **この 2 キーを 1 バイトも動かしてはいけない** ((2b) の罠 F)。
 * ⚠⚠⚠ MAIN_SCEN は js/world-map.js の SITES に **実在する** id を選ぶ —— (3c) の対照
 *   「roadReturn を消しただけでは spawnFor が目的地の前へ立たせる」を測るのに要る
 *   (2026-09-04 実測: spawnFor("dungeon","lizard-swamp") は phlan ではなく swamp を返す)。 */
const MAIN_SCEN = 'lizard-swamp';
const MAIN_GEN = JSON.stringify({ title: '本命の依頼', themeId: 'lizard-swamp',
  clearXp: 111, spawns: [['goblin', 30, 14]] });
/* ⭐ 7.9-3 (闇市の隊商護衛) の腕。⛔ tavern.html は 1 バイトも触らないので、ドライバが
 *   同じ形のペイロードを置いて **同じ配線**を通す ((2g) の対照 = 従来どおり敗北すること)。
 * ⚠ 敵キー / 座標は index.html の検疫を通る実在値 (未知キーだと spawns が空になって化ける)。 */
const ESCORT_GEN = JSON.stringify({ title: '隊商護衛', themeId: 'caravan-road',
  clearXp: 300, trapCount: 0, hiddenChestCount: 0,
  wagonSpawns: [{ tx: 9, ty: 14 }],
  waves: [{ count: 3, pool: ['goblin', 'goblinArcher'] }],
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]] });
/* ⭐ (2c) が使う消耗の比率。⛔ ドライバが roadWounds を組み立てるのではなく、
 *   **本番の showResult(true) に書かせた JSON をそのまま**次の起動へ渡す (2 経路の突き合わせ)。 */
const WOUND_RATIOS = [0.62, 1, 0.31, 0.85];
const WOUND_TOL = 0.03;      /* hp は整数なので 1/maxHp ぶんの丸めが必ず乗る */
/* ── (4b) world.html の storage の数 (⛔ 着手前の実測。緩めない) ────────────────
 * 2026-09-04 実測 = sessionStorage.removeItem 1 件 (questDest) / localStorage 0 件。
 * ⭐ 罠 D (#51 §2-6) の番人。index.html 側は removeItem を使ってよいが world 側は不可。 */
const BASE_WORLD_SREMOVE = 1;
const BASE_WORLD_LSET = 0;
const BASE_WORLD_LREMOVE = 0;

/* ── (0d) 基準列 ─────────────────────────────────────────────────────────────
 * ⚠⚠⚠ **固定値**。2026-09-04 / HEAD = bdc6880 (襲撃機能が 1 バイトも無い木) の実測。
 *   採取: world.html?roadseed=<種> → __world が立つまで待つ → 400ms → RE.rnd() を 32 回。
 *   3 種とも RE.seed()==種 / fromUrl==true / roadEvent().fired==0 /
 *   typeof RE.ambRoll==="undefined" / typeof RE.AMBUSH==="undefined" を同時確認。
 * ⛔ **項目 2 以降で採り直さない。** 採り直した瞬間に (0d)(4a) は「自分と自分を比べる」形になり
 *   永久緑になる (依頼書 §4 の ⛔ そのもの)。 */
const RND_N = 32;          /* 1 種あたりの標本数 */
const RND_SPLIT = 16;      /* 挟み込みレグ: ここまで引いてから ambRoll を呼ぶ */
const AMB_PROBE = 8;       /* 挟み込みレグ: ambRoll() を呼ぶ回数 */
const BASE_RND = {
  7: [0.011704753153026104, 0.06195825757458806, 0.97690763277933, 0.6990287057124078,
    0.5214452685322613, 0.4055216880515218, 0.4662326325196773, 0.23992518591694534,
    0.5533256039489061, 0.729822089895606, 0.2578155610244721, 0.15594836394302547,
    0.7640898865647614, 0.5184025457128882, 0.19713726011104882, 0.3679585934150964,
    0.2932473379187286, 0.5347395255230367, 0.29633024823851883, 0.9779461044818163,
    0.2475335942581296, 0.877779595553875, 0.19079170934855938, 0.14365738607011735,
    0.1546440301463008, 0.2909512131009251, 0.5479014315642416, 0.7618736950680614,
    0.07451809011399746, 0.912940707989037, 0.5537107479758561, 0.6216248339042068],
  282: [0.40777430683374405, 0.1446307108271867, 0.9229709794744849, 0.11600858136080205,
    0.7545002282131463, 0.1188534777611494, 0.3129070873837918, 0.06703401450067759,
    0.5456868710462004, 0.7917405148036778, 0.3246378938201815, 0.733020132407546,
    0.08682905579917133, 0.057574220933020115, 0.02822994999587536, 0.11735730059444904,
    0.3071178023237735, 0.6111718157771975, 0.8848649936262518, 0.48806294007226825,
    0.6890409996267408, 0.4404337622690946, 0.6373068469110876, 0.9080638629384339,
    0.1623329147696495, 0.007549267960712314, 0.9228398934938014, 0.5054758952464908,
    0.603676495142281, 0.16355515690520406, 0.5760502018965781, 0.9136626359540969],
  20260904: [0.2836113073863089, 0.7002657032571733, 0.2636048069689423, 0.12938253255560994,
    0.4539600021671504, 0.406421143328771, 0.6441473837476224, 0.5354480571113527,
    0.10883750882931054, 0.28774678334593773, 0.8387800641357899, 0.8721048752777278,
    0.026622960343956947, 0.25313783227466047, 0.08785659773275256, 0.9977368796244264,
    0.5859071926679462, 0.8229232744779438, 0.7313378467224538, 0.2988471288699657,
    0.5563449438195676, 0.193243277259171, 0.31781989173032343, 0.635414776392281,
    0.2197718946263194, 0.1784068455453962, 0.8697180827148259, 0.44697407609783113,
    0.9239281753543764, 0.20730730262584984, 0.4951795481611043, 0.9454052308574319],
};
const RND_SEEDS = Object.keys(BASE_RND).map(Number);
/* ⭐ (0d) の 3 本目 = 静的。world.html の配信バイトに `rnd(` が **0 件**
 *  (2026-09-04 実測 `grep -c "rnd(" world.html` = 0)。⛔ ここを 1 に緩めない ——
 *  world.html が ambRoll を経由せず ROAD_EVENTS.rnd() を直接叩く形の罠 B を塞ぐ唯一の関門。 */
const BASE_WORLD_RND = 0;

/* ── (4c) 既存 6 件の基準 ────────────────────────────────────────────────────
 * ⚠⚠ **固定値**。2026-09-04 の着手前 (HEAD = 4dbdd25 / 襲撃機能を 1 バイトも入れていない木) で
 *   `grep -n 'id: "\|terrain: "' js/road-events.js` と依頼書 §2-5 から採った実測。
 *   ⛔ 実行時に自分で採り直さない (採り直した瞬間に「自分と自分を比べる」形になり永久緑)。
 * ⭐ 2 本立てにしてある理由:
 *   ① EVENTS の [id, terrain] の並び … AMBUSH を EVENTS へ push する罠 A (変異 intoevents) は
 *      **7 件目が生える**ので、件数を直書きしなくても並びの不一致で捕まる。
 *   ② 停留所の地形の分布 … 地形は WORLD_MAP.STEPS[id].on の両端から TERRAIN_RANK 順で
 *      引かれるので、ランクを並べ替えたり刻み点の粒度が動いたりすると **ここだけが動く**。
 *      (依頼書 §2-5 = coast 2 / woods 2 / lake 5 / mountain 4 / swamp 4 = 17) */
const BASE_EVENT_ROWS = [
  ['coast_dock_quarrel', 'coast'],
  ['woods_woodcutter', 'woods'],
  ['lake_ripple', 'lake'],
  ['mountain_rockfall', 'mountain'],
  ['swamp_marker', 'swamp'],
  ['swamp_pilgrim', 'swamp'],
];
const BASE_STOP_TERRAIN = { coast: 2, woods: 2, lake: 5, mountain: 4, swamp: 4 };

/* ── (0c) 種の走査 ───────────────────────────────────────────────────────────
 * ⭐ 1 種 = 1 回の page.goto。ambRoll() を SCAN_K 回引いた列で分類する:
 *     出る種   = どこかで true (⭐ 早く出る種ほど歩数が少なくて済むので firstFire 昇順で選ぶ)
 *     出ない種 = SCAN_K 回すべて false
 * ⛔ 「ambRoll の列」だけで (0c) を緑にしない —— **実際に歩かせた結果**と突き合わせる
 *   (ambRoll は真でも world.html が呼んでいなければ襲撃は起きない)。
 * ⚠ AMBUSH_RATE の具体値は測らない (依頼書 §8「⛔ 測らないこと」)。ここで使うのは
 *   「両方の腕が実在する」ことだけ。 */
const SCAN_SEEDS = [7, 282, 20260904, 1, 2, 3, 4, 5, 6, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const SCAN_K = 12;         /* 1 走行で踏みうる「襲撃を振る停留所」の上限の目安 */
const SCAN_WANT_FIRE = 2;  /* これだけ集まったら打ち切る */
const SCAN_WANT_QUIET = 2;
/* ⚠⚠⚠ **DEST_FIRE の経路で襲撃を振る停留所は 2 つしか無い** (2026-09-04 実測)。
 *   pier → swamp の到着列は ["phlan", "cross_n", "cross_n__swamp@1", "swamp"] で、
 *     phlan … 通りすがりの **拠点** = isRoadSite() で落ちる (振らない)
 *     swamp … 押した行き先 = onArriveStep が onArriveNode へ倒す (振らない)
 *   ⇒ ambRoll() を消費するのは cross_n と cross_n__swamp@1 の **2 回だけ**。
 * ⭐ だから「早く出る種」は firstFire <= 1 で選ぶ。⛔ 2 以上を選ぶと歩き切っても発火せず、
 *   (0c)(0e) が「腕が立たない」で赤くなる (装置のせいで本番が疑われる = 最悪の形)。 */
const SCAN_EARLY = 1;
/* ⭐ 出る種の候補を上から順に試す本数。1 本目が空振りしても装置のせいで諦めない。
 *  ⛔ 「緑になるまで試す」ではない —— (0c) は実際に器が開いたことを要求し続ける。 */
const FIRE_TRIES = 3;

/* ── 歩行 ────────────────────────────────────────────────────────────────────
 * ⚠ 行き先に phlan を選ばない (着いた瞬間に town.html へ飛び、以後の測定が全部死ぬ)。
 * ⭐ DEST_FIRE は近め (2 タップで届く)、DEST_QUIET は遠め (停留所を多く踏ませて
 *   「出ない」の母集団を厚くする)。verify_road_events の SEED_NEAR / SEED_MAIN と同じ考え方。 */
const DEST_FIRE = 'swamp';
const DEST_QUIET = 'fort';
const SEED_FALLBACK = 7;   /* ⭐ 種を分類できないとき (= 本番未実装) でも歩行ハーネスを 1 回通す */
const MAX_TAPS = 24;
const TAP_SETTLE_MS = 140;
const ARM_PAD_MS = 200;    /* ROAD_EVENTS.ARM_MS への上乗せ (#35 のゴーストクリック除け) */
const QUIET_MIN_ARRIVALS = 3;   /* ⛔ 1 歩も進まずに「出なかった」を緑にしない */

// ══════════════════════════════════════════════════════════════════════════════
// 観測の下回り
// ══════════════════════════════════════════════════════════════════════════════
async function safeEval(page, fn, a) {
  try { return await page.evaluate(fn, a); } catch (e) { return null; }
}
function hookErrors(page, errs, tag) {
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
}
async function openWorld(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  hookErrors(page, errs, '[:' + port + (opts.query || '') + ' ' + (opts.tag || 'boot') + '] ');
  /* ⭐ 編成の仕込みは **遷移前**。⚠ localStorage はプロファイル共有なので、
     指定が無い走行では明示的に消す (前の走行の残りが次の走行の期待値を汚す)。 */
  await page.evaluateOnNewDocument((s) => {
    try {
      if (s.comp) sessionStorage.setItem(s.kComp, JSON.stringify(s.comp));
      else sessionStorage.removeItem(s.kComp);
    } catch (e) {}
    try {
      if (s.mem) sessionStorage.setItem(s.kMem, JSON.stringify(s.mem));
      else sessionStorage.removeItem(s.kMem);
    } catch (e) {}
    try { localStorage.removeItem(s.kComp); } catch (e) {}
  }, { kComp: KEY_PARTY_COMP, kMem: KEY_PARTY_MEM,
    comp: opts.comp || null, mem: opts.mem || null });
  if (typeof opts.force === 'number') {
    await page.evaluateOnNewDocument((v) => { Math.random = function () { return v; }; }, opts.force);
  }
  await page.setViewport(opts.viewport || { width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);
  return page;
}
async function readPlay(page) {
  /* ⚠ try/catch は必須。ページが world.html を離れると evaluate は
     "Execution context was destroyed" で **投げる**。⭐ 投げたら dead 扱いで返す。 */
  try {
    return await page.evaluate(() => {
      const W = window.__world;
      if (!W) return { dead: true, path: location.pathname, search: location.search };
      return {
        dead: false, node: W.heroNode(), px: W.heroPx(),
        arrivals: W.arrivalCount(), last: W.lastArrival(),
        askOpen: W.askOpen(), moving: W.isMoving(),
        walkOff: W.walkStepOff(),
        road: (typeof W.roadEvent === 'function') ? W.roadEvent() : null,
        path: location.pathname, search: location.search,
      };
    });
  } catch (e) {
    return { dead: true, path: '(evaluate 失敗: ' + String(e && e.message).slice(0, 80) + ')', search: '' };
  }
}
/* 襲撃が書く storage の実体。⛔ 「書いていない」を言うために **毎回**読む。 */
async function readAmbStorage(page) {
  return safeEval(page, (K) => {
    const g = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    const o = {};
    Object.keys(K).forEach(n => { o[n] = g(K[n]); });
    return o;
  }, { battle: KEY_BATTLE, ret: KEY_RETURN, wounds: KEY_WOUNDS,
    scen: KEY_SCEN, gen: KEY_GENSCEN, boon: KEY_BOON });
}
async function waitStill(page) {
  try {
    await page.waitForFunction('!window.__world || !window.__world.isMoving()',
      { timeout: 40000, polling: 60 });
    return true;
  } catch (e) { return false; }
}
/* 停留所 id を 1 回押す (client 座標はその都度ページから引く)。
   ⛔ goToPoint を evaluate から呼ばない (当たり判定が壊れていても永久に緑になる)。 */
async function tapPoint(page, id, why) {
  const before = await readPlay(page);
  if (before.dead) {
    return { ok: false, id: id, why: why, before: before, after: before,
      err: 'ページが world.html を離れている: ' + before.path };
  }
  const pt = await safeEval(page, i => window.__world.clientFromPoint(i), id);
  if (!pt) {
    return { ok: false, id: id, why: why, before: before, after: before,
      err: 'clientFromPoint が null: ' + id };
  }
  await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
  const still = await waitStill(page);
  await sleep(TAP_SETTLE_MS);
  const after = await readPlay(page);
  return {
    ok: still && !after.dead, id: id, why: why, before: before, after: after,
    err: !still ? '到着待ちタイムアウト'
      : (after.dead ? 'タップ後にページが遷移した: ' + after.path : null),
  };
}
async function eventState(page) {
  return safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    const box = document.getElementById('worldEventBox');
    const ov = document.getElementById('skillCheckOverlay');
    const t = document.getElementById('worldEventTitle');
    const x = document.getElementById('worldEventText');
    return {
      open: !!(RE && typeof RE.isOpen === 'function' && RE.isOpen()),
      boxShow: !!(box && box.classList.contains('show')),
      title: t ? t.textContent : null,
      text: x ? x.textContent : null,
      btns: Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'))
        .map(b => b.textContent),
      overlayShow: !!(ov && ov.classList.contains('show')),
      /* ⭐ 「いま開いているのは襲撃か」は **ページの実体**から引く
         (⛔ ドライバへ id を写経しない)。 */
      current: (RE && typeof RE.current === 'function' && RE.current()) ? RE.current().id : null,
      ambushId: (RE && RE.AMBUSH) ? RE.AMBUSH.id : null,
    };
  });
}
async function clickEventBtn(page, label) {
  const r = await safeEval(page, (lab) => {
    const bs = Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'));
    const b = lab ? bs.filter(x => x.textContent === lab)[0] : bs[0];
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
  }, label || null);
  if (!r) return false;
  await page.mouse.click(Math.round(r.x), Math.round(r.y));
  return true;
}
/* 開いている器を 1 つ畳む。mode: 'none' = 判定なしの枝 / 'check' = 判定つきの枝。
   ⛔ ROAD_EVENTS.close() を evaluate から呼ばない (押し口が壊れていても永久に緑になる)。
   ⛔ 「先へ進む」は押さない —— 押すと (判定つきの枝では) index.html へ遷移してしまい、
      §0 の観測 (結末の文 / storage) が採れなくなる。遷移は (1e) の担当 = 項目 2。 */
async function resolveOpenBox(page, mode, armWait, evDef, opts) {
  opts = opts || {};
  const st0 = await eventState(page);
  if (!st0 || !st0.open) return null;
  const rec = { mode: mode, event: st0.current, title: st0.title, intro: st0.text,
    btns: st0.btns, isAmbush: !!(st0.ambushId && st0.current === st0.ambushId), why: '' };
  await sleep(armWait);
  /* 押す選択肢は **ページの実体**から引く (⛔ 「1 番目」で決め打ちしない)。 */
  const label = await safeEval(page, (o) => {
    const RE = window.ROAD_EVENTS;
    let ev = null;
    if (RE.AMBUSH && RE.AMBUSH.id === o.id) ev = RE.AMBUSH;
    else if (typeof RE.byId === 'function') ev = RE.byId(o.id);
    if (!ev) return null;
    const c = (ev.choices || []).filter(x => !!x.check === o.want)[0];
    return c ? c.label : null;
  }, { id: st0.current, want: mode === 'check' });
  rec.label = label;
  if (!label) { rec.why = '選択肢が引けない (id=' + st0.current + ')'; return rec; }
  await clickEventBtn(page, label);
  /* ⭐ opts.skipPanel = 「判定つきの枝を押すが、判定パネルは出ない」腕 ((1a) の null 経路)。
     ⛔ ここで待つと 9 秒を無駄にしたうえで why に「パネルが出ない」が残り、
       null が**欠陥ではなく設計**であることが記録から読めなくなる。 */
  if (mode === 'check' && !opts.skipPanel) {
    try {
      await page.waitForFunction(
        "!!document.getElementById('skillCheckOverlay') && document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 9000, polling: 60 });
      rec.panel = await safeEval(page, () => {
        const ov = document.getElementById('skillCheckOverlay');
        const rows = Array.prototype.slice.call(ov.querySelectorAll('.scRoster .scRow'));
        return { rows: rows.length,
          names: rows.map(r => ((r.querySelector('.scName') || {}).textContent || '').trim()) };
      });
    } catch (e) { rec.panel = null; rec.why += ' 判定パネルが出ない'; }
    /* AUTO_ROLL_MS(2000) → 演出 → RESULT_HOLD_MS(3600) で自動的に閉じる。⛔ 尺は触らない。 */
    try {
      await page.waitForFunction(
        "!document.getElementById('skillCheckOverlay') || !document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 25000, polling: 100 });
    } catch (e) { rec.why += ' 判定が閉じない'; }
  }
  /* 結末の 1 文 + 「先へ進む」の 1 ボタンへ変わるのを待つ。 */
  try {
    await page.waitForFunction(
      "(function(){var b=document.getElementById('worldEventBtns');return !!b && b.children.length===1;})()",
      { timeout: 12000, polling: 80 });
  } catch (e) { rec.why += ' 結末が出ない'; }
  const st1 = await eventState(page);
  rec.resultText = st1 ? st1.text : null;
  rec.doneBtns = st1 ? st1.btns : null;
  /* ⭐ 結末の文が **AMBUSH の実体のどれ**と一致するか。⛔ 文言をドライバへ写経しない。 */
  if (rec.isAmbush && evDef) {
    const cCheck = (evDef.choices || []).filter(c => c.check)[0] || {};
    const cPlain = (evDef.choices || []).filter(c => !c.check)[0] || {};
    rec.matched = (rec.resultText === cCheck.success) ? 'success'
      : (rec.resultText === cCheck.fail) ? 'fail'
        : (rec.resultText === cPlain.result) ? 'result' : null;
  }
  return rec;
}
/* 街道の出来事 (#45 の 6 件) が先に開いたときは、判定なしの枝で畳んで歩行を続ける。
   ⛔ ここで恩恵は付かない (check:false の枝は boonOf が null を返す = #47 の規律)。 */
async function dismissRoadEvent(page, armWait) {
  const rec = await resolveOpenBox(page, 'none', armWait, null);
  if (!rec) return null;
  /* ⚠⚠⚠ **結末の画面でも armAt はリセットされる** (js/road-events.js の paint() が
     showResult からも呼ばれる)。ここで待たずに押すとゴーストクリック除けに弾かれ、
     器が開いたままになって歩行が止まる (2026-09-04 の初回実走で実際に踏んだ:
     「街道の出来事を畳めなかった」でタップ 2 回目で停止した)。 */
  await sleep(armWait);
  await clickEventBtn(page, null);   /* 「先へ進む」 (1 ボタンなので先頭でよい) */
  await sleep(220);
  const st = await eventState(page);
  rec.closed = !!(st && !st.open);
  return rec;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 A) 素のページ — (0a)(0b) の材料
// ══════════════════════════════════════════════════════════════════════════════
async function measureBoot(browser, port, errs) {
  const page = await openWorld(browser, port, errs, { tag: 'boot' });
  const out = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS, SC = window.SkillCheck, WM = window.WORLD_MAP;
    const A = RE ? RE.AMBUSH : undefined;
    const strOf = (v) => (typeof v === 'string' ? v : null);
    const cs = (A && Array.isArray(A.choices)) ? A.choices : [];
    /* ⭐ (0b) が world.html の配信バイトを全文検索する文言。**実体から組む**
       (⛔ ドライバへ 1 文字も写経しない)。 */
    const strings = [];
    if (A) {
      if (strOf(A.title)) strings.push(['AMBUSH.title', A.title]);
      if (strOf(A.intro)) strings.push(['AMBUSH.intro', A.intro]);
      cs.forEach((c, i) => {
        if (strOf(c.label)) strings.push(['choices[' + i + '].label', c.label]);
        ['result', 'success', 'fail'].forEach(k => {
          if (strOf(c[k])) strings.push(['choices[' + i + '].' + k, c[k]]);
        });
      });
    }
    return {
      reType: typeof RE,
      seam: {
        AMBUSH: typeof A, ambRoll: RE ? typeof RE.ambRoll : 'undefined',
        ambSeed: RE ? typeof RE.ambSeed : 'undefined',
        rnd: RE ? typeof RE.rnd : 'undefined', open: RE ? typeof RE.open : 'undefined',
        showResult: RE ? typeof RE.showResult : 'undefined',
      },
      ambush: A ? {
        id: A.id || null, checkKey: A.checkKey || null, dc: A.dc || null,
        nChoices: cs.length,
        choices: cs.map(c => ({
          label: strOf(c.label), check: !!c.check,
          result: strOf(c.result), success: strOf(c.success), fail: strOf(c.fail),
        })),
      } : null,
      strings: strings,
      checkKeys: (SC && SC.CHECKS) ? Object.keys(SC.CHECKS) : null,
      dcTiers: (SC && SC.DC_TIERS) ? Object.keys(SC.DC_TIERS) : null,
      /* ⭐ 記録のみ (⛔ 判定しない) — AMBUSH が EVENTS に混ざっていないか。判定は (4c) の担当。 */
      eventIds: (RE && RE.EVENTS) ? RE.EVENTS.map(e => e.id) : null,
      /* ⭐ (4c) の材料 — id と terrain の対。⛔ 件数を直書きせず**実体から並べる**。 */
      eventRows: (RE && RE.EVENTS) ? RE.EVENTS.map(e => [e.id, e.terrain || null]) : null,
      /* ⭐ (4c) の材料 — 停留所の地形の分布。⛔ 17 も 5 も直書きせず実体から数える
         (地形は WORLD_MAP.STEPS[id].on の両端から引かれるので、TERRAIN_RANK を
          並べ替えると件数が動く = ここが番人になる)。 */
      stopTerrain: (RE && typeof RE.stops === 'function' && typeof RE.terrainOf === 'function')
        ? (function () {
          const h = {};
          RE.stops().forEach(function (s) { const t = RE.terrainOf(s) || '(none)'; h[t] = (h[t] || 0) + 1; });
          return h;
        })()
        : null,
      /* ⭐ (1c) の材料 — 細分化グラフ (NODES ∪ STEPS) の id。⛔ ドライバへ写経しない。 */
      walkNodeIds: (WM && typeof WM.walkNodes === 'function') ? Object.keys(WM.walkNodes()) : null,
      pop: WM ? {
        ways: Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'way').length,
        sites: Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'site').length,
        steps: Object.keys(WM.STEPS || {}).length,
      } : null,
      heroNode: window.__world.heroNode(),
      /* 撤退の腕が読めるか (⛔ ここでは判定しない。(5a) は項目 3/4 の担当)。 */
      roadAmbushSeam: (window.__world && typeof window.__world.roadAmbush === 'function')
        ? 'function' : 'undefined',
    };
  });
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 B) (0d) 恒等 — 素の列 + **挟み込み**の列
//   ⭐⭐⭐ 挟み込みが罠 B (sharedrng) の唯一の検出器。boot の列だけでは無傷に見える。
// ══════════════════════════════════════════════════════════════════════════════
async function measureRnd(browser, port, errs, seed) {
  const out = { seed: seed };
  /* ① 素の列 (読み込み中に rnd() が引かれていないか) */
  {
    const page = await openWorld(browser, port, errs, { tag: 'rnd', query: '?roadseed=' + seed });
    out.plain = await safeEval(page, (n) => {
      const RE = window.ROAD_EVENTS;
      if (!RE || typeof RE.rnd !== 'function') return null;
      const v = []; for (let i = 0; i < n; i++) v.push(RE.rnd());
      return { values: v, seed: RE.seed(), fromUrl: RE.seedFromUrl() };
    }, RND_N);
    await page.close();
  }
  /* ② 挟み込み: RND_SPLIT 回 → ambRoll を AMB_PROBE 回 → 残りを引く */
  {
    const page = await openWorld(browser, port, errs, { tag: 'rnd2', query: '?roadseed=' + seed });
    out.split = await safeEval(page, (o) => {
      const RE = window.ROAD_EVENTS;
      if (!RE || typeof RE.rnd !== 'function') return null;
      const v = []; for (let i = 0; i < o.split; i++) v.push(RE.rnd());
      let calls = 0; const rolls = [];
      if (typeof RE.ambRoll === 'function') {
        for (let i = 0; i < o.probe; i++) { rolls.push(!!RE.ambRoll()); calls++; }
      }
      let ambSeed = null;
      if (typeof RE.ambSeed === 'function') { try { ambSeed = RE.ambSeed(); } catch (e) { ambSeed = null; } }
      for (let i = o.split; i < o.n; i++) v.push(RE.rnd());
      return { values: v, calls: calls, rolls: rolls, ambSeed: ambSeed, seed: RE.seed() };
    }, { n: RND_N, split: RND_SPLIT, probe: AMB_PROBE });
    await page.close();
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 C) (0c) 種の走査 — 「必ず出る種」と「必ず出ない種」を探す
//   ⛔ ここで見つけただけでは (0c) は緑にしない。歩行 (観測 D) と突き合わせる。
// ══════════════════════════════════════════════════════════════════════════════
async function measureScan(browser, port, errs) {
  const out = { supported: null, probed: 0, rows: [], fire: [], quiet: [] };
  for (const seed of SCAN_SEEDS) {
    const page = await openWorld(browser, port, errs, { tag: 'scan', query: '?roadseed=' + seed });
    const r = await safeEval(page, (k) => {
      const RE = window.ROAD_EVENTS;
      if (!RE || typeof RE.ambRoll !== 'function') {
        return { supported: false, type: RE ? typeof RE.ambRoll : 'no-RE' };
      }
      const v = []; for (let i = 0; i < k; i++) v.push(!!RE.ambRoll());
      return { supported: true, rolls: v };
    }, SCAN_K);
    await page.close();
    out.probed++;
    if (!r || !r.supported) {
      out.supported = false;
      out.why = 'ROAD_EVENTS.ambRoll が関数でない (typeof = ' + ((r && r.type) || '?') + ')';
      return out;   /* ⭐ 1 回で打ち切る (本番未実装なら 24 回開いても同じ) */
    }
    out.supported = true;
    const first = r.rolls.indexOf(true);
    out.rows.push({ seed: seed, first: first, nTrue: r.rolls.filter(Boolean).length });
    if (first >= 0) out.fire.push({ seed: seed, first: first });
    else out.quiet.push({ seed: seed });
    const earlyFire = out.fire.filter(f => f.first <= SCAN_EARLY).length;
    if (earlyFire >= SCAN_WANT_FIRE && out.quiet.length >= SCAN_WANT_QUIET) break;
  }
  out.fire.sort((a, b) => a.first - b.first);
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 D) 歩行 — 実クリックだけで歩き、襲撃の器が開いたら押す
//   ⭐ 分類 (襲撃 か 街道の出来事 か) は **ページの中で ev.id === RE.AMBUSH.id** を見る。
//   ⚠ 途中で街道の出来事 (#45 の 6 件) が開いたら判定なしの枝で畳んで歩き続ける。
// ══════════════════════════════════════════════════════════════════════════════
/* window.__ambOpen (器が開いた瞬間の記録) を out へ吸い出す。
   ⚠⚠⚠ **遷移の前に必ず呼ぶこと。** index.html へ移ると window.__ambOpen ごと消えるので、
     後から採ると ambushOpens が 0 になり (0c)(0e)(1a) が**偽の赤**になる。 */
async function captureOpens(page, out) {
  out.opens = (await safeEval(page, () => window.__ambOpen || [])) || [];
  out.ambushOpens = out.opens.filter(o => o.isAmbush).length;
  out.roadOpens = out.opens.filter(o => !o.isAmbush).length;
  out.opensCaptured = true;
}
/* 結末の「先へ進む」を押して遷移まで見届ける ((1e) の腕だけが使う)。
   ⚠⚠ **押す前に armWait を待つ。** showResult も paint() を通るので、結末画面でも
     armAt がリセットされる (項目 1 が実際に踏んだ)。
   ⛔ waitForNavigation に頼らず location を polling する —— 遷移の途中で evaluate が
     "Execution context was destroyed" を投げるが、safeEval が null で受けて次の周へ回る。 */
async function advanceFromResult(page, armWait) {
  const out = { pressed: false, nav: null, polls: 0 };
  await sleep(armWait);
  out.pressed = await clickEventBtn(page, null);
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    out.polls++;
    const n = await safeEval(page, () => ({ path: location.pathname, search: location.search,
      ready: document.readyState }));
    if (n) out.nav = n;
    if (n && /\/index\.html$/.test(n.path)) break;
  }
  return out;
}

async function measureAmbush(browser, port, errs, opts) {
  opts = opts || {};
  const seed = opts.seed;
  const dest = opts.dest || DEST_FIRE;
  const mode = opts.mode || 'none';
  const query = '?roadseed=' + seed + (opts.extraQuery || '');
  const out = { label: opts.label || '', seed: seed, dest: dest, mode: mode, query: query,
    taps: [], arrivals: [], opens: [], ambushOpens: 0, roadOpens: 0, amb: null,
    opensCaptured: false, noParty: !!opts.noParty, nullRoll: !!opts.nullRoll };
  const page = await openWorld(browser, port, errs, {
    tag: 'walk', query: query, force: opts.force, viewport: opts.viewport,
    comp: opts.noParty ? null : PARTY4, mem: opts.noParty ? null : PARTY_MEMBERS,
  });
  out.storagePre = await readAmbStorage(page);
  /* ⭐⭐⭐ 器が **開いた瞬間**を同期で捕まえる。⚠ MutationObserver では間に合わない
     (rAF の 1 ブロックの中で「開く → stopWalk()」まで走り切る)。
     ⛔ これは「駆動」ではなく「計測」。歩くのは実クリックだけ。 */
  await safeEval(page, () => {
    window.__ambOpen = [];
    const RE = window.ROAD_EVENTS;
    if (!RE || typeof RE.open !== 'function') return;
    const ambId = (RE.AMBUSH && RE.AMBUSH.id) || null;
    const orig = RE.open;
    RE.open = function (ev, cb) {
      const rec = { id: (ev && ev.id) || null, isAmbush: !!(ambId && ev && ev.id === ambId),
        at: null, moving: !!(window.__world && window.__world.isMoving()),
        askOpen: !!(window.__world && window.__world.askOpen()) };
      try {
        const la = window.__world.lastArrival();
        rec.at = la ? la.at : null;
      } catch (e) {}
      const ret = orig.apply(this, arguments);
      try {
        const b = document.getElementById('worldEventBox');
        rec.boxShow = !!(b && b.classList.contains('show'));
      } catch (e) {}
      window.__ambOpen.push(rec);
      return ret;
    };
  });
  /* ⭐ (1a) の 4 本目 = **判定が null を返す腕**。js/skill-check.js は 1 バイトも触らず、
     ページの中で resolveSkillCheck を「null を返す関数」に差し替える (未知の checkKey /
     代表者が選べない、で実際に起きる姿の再現)。
     ⚠ null は **失敗ではない** —— 結末の文は出るが戦闘へは行かないのが正しい
     (依頼書 §5-4。変異 nullfight が番人)。 */
  if (opts.nullRoll) {
    out.nullStub = await safeEval(page, () => {
      const SC = window.SkillCheck;
      if (!SC || typeof SC.resolveSkillCheck !== 'function') return false;
      SC.resolveSkillCheck = function () { return Promise.resolve(null); };
      return true;
    });
  }
  /* AMBUSH の実体 (結末の文の突き合わせ用)。⛔ ドライバへ写経しない。 */
  out.evDef = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    if (!RE || !RE.AMBUSH) return null;
    const A = RE.AMBUSH;
    return { id: A.id, choices: (A.choices || []).map(c => ({
      label: c.label, check: !!c.check, result: c.result, success: c.success, fail: c.fail })) };
  });
  out.start = await readPlay(page);
  out.destPick = await safeEval(page, (d) => {
    const WM = window.WORLD_MAP, W = window.__world;
    const from = W.heroNode();
    return { from: from, dest: d, hops: (WM.findWalkPath(from, d) || []).length };
  }, dest);
  const armWait = ((await safeEval(page, () => (window.ROAD_EVENTS && window.ROAD_EVENTS.ARM_MS) || 0)) || 0)
    + ARM_PAD_MS;
  out.armWait = armWait;

  if (out.destPick && out.destPick.hops > 0) {
    let lastNode = null;
    for (let i = 0; i < MAX_TAPS; i++) {
      const t = await tapPoint(page, dest, 'tap#' + (i + 1));
      out.taps.push({ ok: t.ok, err: t.err || null,
        at: (t.after && !t.after.dead && t.after.last) ? t.after.last.at : null,
        node: (t.after && !t.after.dead) ? t.after.node : null });
      if (!t.ok) break;
      if (t.after.last) out.arrivals.push(t.after.last.at);
      const st = await eventState(page);
      if (st && st.open) {
        const isAmb = !!(st.ambushId && st.current === st.ambushId);
        if (isAmb) {
          out.amb = await resolveOpenBox(page, mode, armWait, out.evDef,
            { skipPanel: !!opts.skipPanel });
          out.storagePost = await readAmbStorage(page);
          out.endAtOpen = await readPlay(page);
          /* ⚠⚠⚠ **opens はここで採る** (遷移すると window.__ambOpen ごと消える)。 */
          await captureOpens(page, out);
          /* ⭐ 「先へ進む」を押すのは (1e) の腕だけ。⛔ 既定では押さない ——
             押すと index.html へ移り、§0 の観測 (結末の文 / storage) が採れなくなる。 */
          if (opts.advance) out.advance = await advanceFromResult(page, armWait);
          break;   /* ⭐ 襲撃を観測したらそこで止める */
        }
        const r = await dismissRoadEvent(page, armWait);
        if (!r || !r.closed) { out.stuck = '街道の出来事を畳めなかった'; break; }
      }
      if (t.after.node === dest) break;
      if (t.after.node === lastNode) break;   /* 進まなくなった */
      lastNode = t.after.node;
    }
  } else {
    out.stuck = '行き先まで経路が無い: ' + JSON.stringify(out.destPick);
  }
  if (!out.opensCaptured) await captureOpens(page, out);
  if (!out.storagePost) out.storagePost = await readAmbStorage(page);
  out.end = await readPlay(page);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 E) (1g) 器の幾何 — compact (390x844) で襲撃の器と **3 つの結末画面**を測る
//   ⭐ AMBUSH は EVENTS に入っていないので verify_road_events (1d) は 1 度も測らない。
//     **ここで測らないと誰も測らない。**
//   ⭐ 導入 (二択) だけでなく結末 (1 ボタン) も測る —— 器を閉じずに描き直す欠陥
//     (変異 boxleak) は「前の選択肢が残る」= ボタン数で出る。
//   ⛔ 文言をドライバへ写経しない (結末の文は AMBUSH の実体から引く)。
//   ⛔ ここで測るのは **幾何と層だけ**。「いつ出るか」は測らない (それは (0c)(1a) の仕事)。
// ══════════════════════════════════════════════════════════════════════════════
async function measureBoxAmbush(browser, port, errs, opts) {
  opts = opts || {};
  const vp = opts.viewport || { width: 390, height: 844 };
  const page = await openWorld(browser, port, errs,
    { tag: 'box ' + vp.width + 'x' + vp.height, viewport: vp, query: opts.query || '' });
  const out = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    const res = { compact: document.body.classList.contains('compact'),
      moduleOk: !!(RE && typeof RE.open === 'function' && typeof RE.showResult === 'function'),
      views: [], afterClose: null };
    if (!RE || !RE.AMBUSH) return res;
    const A = RE.AMBUSH;
    const snap = (tag, opened) => {
      const box = document.getElementById('worldEventBox');
      const card = box ? box.querySelector('#worldEventCard') : null;
      const btns = card ? Array.prototype.slice.call(card.querySelectorAll('.worldEventBtn')) : [];
      const r = card ? card.getBoundingClientRect() : null;
      return { tag: tag, opened: !!opened, isOpen: RE.isOpen(),
        display: box ? getComputedStyle(box).display : null,
        rect: r ? { x: r.left, y: r.top, w: r.width, h: r.height,
          right: r.right, bottom: r.bottom } : null,
        clipY: card ? (card.scrollHeight - card.clientHeight) : null,
        clipX: card ? (card.scrollWidth - card.clientWidth) : null,
        nBtns: btns.length,
        btnRects: btns.map(b => {
          const q = b.getBoundingClientRect();
          return { label: b.textContent, x: q.left, y: q.top, right: q.right, bottom: q.bottom };
        }),
        vw: window.innerWidth, vh: window.innerHeight };
    };
    res.views.push(snap('intro', RE.open(A, function () {})));
    const cCheck = (A.choices || []).filter(c => c.check)[0] || {};
    const cPlain = (A.choices || []).filter(c => !c.check)[0] || {};
    [['success', cCheck.success], ['fail', cCheck.fail], ['result', cPlain.result]]
      .forEach(row => { res.views.push(snap(row[0], RE.showResult(A, row[1], null, null))); });
    RE.close();
    res.afterClose = { isOpen: RE.isOpen(),
      nBtns: document.querySelectorAll('#worldEventBtns .worldEventBtn').length };
    return res;
  });
  await page.close();
  return Object.assign({ viewport: vp }, out || {});
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 F) (3a)(3b)(3d) 帰還 — roadReturn を storage へ直に注入して world.html を開き直す
//   ⭐ 項目 3 (index.html 側) が未実装でも街道側だけで測れる形にしてある
//     (index が書くはずの値を、ドライバが同じ形で置くだけ)。
//   ⚠⚠⚠ **evaluateOnNewDocument で注入しない。** reload のたびに再注入されて
//     (3b) の一回性が **原理的に**測れなくなる (永久緑)。⇒ 1 度開いてから evaluate で置く。
//   ⭐⭐⭐ 注入する停留所は **WM.has() が false になる刻み点**を実体から選ぶ ——
//     罠 E の核心は「NODES にしか居ない fail-safe に刻み点が落ちる」ことなので、
//     way ノードを注入すると **罠 E をすり抜けたまま緑**になる。
// ══════════════════════════════════════════════════════════════════════════════
const RESUME_QUEST = 'lizard-swamp';   /* js/world-map.js の SITES に実在する依頼先 */
const RESUME_SCEN = 'road-ambush';     /* ⭐ SITES に無い = spawnFor は phlan へ倒れる */

async function readResume(page) {
  return safeEval(page, (K) => {
    const W = window.__world, WM = window.WORLD_MAP;
    const g = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    return {
      node: W.heroNode(), px: W.heroPx(),
      spawnVia: W.spawnVia(), questDest: W.questDest(),
      /* ⛔ #51 は __world に窓を足さない (verify_road_events (4b) が窓の集合を固定している)。
         ⇒ 帰還の観測は heroNode / heroPx / sessionStorage の実体だけで組む。 */
      hasNode: WM.has(W.heroNode()),
      store: { ret: g(K.ret), quest: g(K.quest), scen: g(K.scen), via: g(K.via) },
    };
  }, { ret: KEY_RETURN, quest: 'dragonfighters.questDest', scen: KEY_SCEN, via: 'dragonfighters.exitVia' });
}
async function reopenWorld(page, port, query) {
  await page.goto('http://localhost:' + port + PAGE_PATH + (query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);
}
async function measureResume(browser, port, errs, opts) {
  opts = opts || {};
  const query = opts.query || '';
  const out = { query: query };
  const page = await openWorld(browser, port, errs,
    { tag: 'resume', query: query, comp: PARTY4, mem: PARTY_MEMBERS });
  /* ⭐ 注入する刻み点を **実体から**選ぶ (⛔ ドライバへ id を写経しない)。 */
  out.pick = await safeEval(page, () => {
    const WM = window.WORLD_MAP;
    const g = WM.walkNodes();
    const step = Object.keys(g).filter(k => !WM.has(k))[0] || null;
    return { step: step, hasNode: step ? WM.has(step) : null, inWalk: !!(step && g[step]),
      nWalk: Object.keys(g).length, nNodes: Object.keys(WM.NODES).length };
  });
  /* ① 対照 = 何も注入していない素の姿 */
  out.control = await readResume(page);
  /* ② index.html が帰りに書くはずの値を置く (⛔ evaluateOnNewDocument は使わない) */
  out.seeded = await safeEval(page, (o) => {
    const g = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    const s = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
    s(o.kRet, o.at); s(o.kVia, 'dungeon'); s(o.kScen, o.scen); s(o.kQuest, o.quest);
    return { ret: g(o.kRet), via: g(o.kVia), scen: g(o.kScen), quest: g(o.kQuest) };
  }, { kRet: KEY_RETURN, kVia: 'dragonfighters.exitVia', kScen: KEY_SCEN,
    kQuest: 'dragonfighters.questDest',
    at: (out.pick && out.pick.step) || '', scen: RESUME_SCEN, quest: RESUME_QUEST });
  /* ③ 開き直す = 帰還 */
  await reopenWorld(page, port, query);
  out.back = await readResume(page);
  /* ④ もう一度開き直す = 一回性 */
  await reopenWorld(page, port, query);
  out.again = await readResume(page);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 G) 潜行側 (index.html) — §2 (2a)〜(2g) / §3 (3c) / §5 (5b)
//   ⭐⭐⭐ 駆動は **本番の関数を叩くだけ** (showResult / escortWagonLost /
//     escortWagonLossEndsRun)。⛔ 測定専用のシームを index.html へ 1 つも足していない。
//   ⛔ ?autoplay を使わない —— 分単位で揺れるうえ、勝敗を選べない。
//   ⚠ 1 ページ = 1 回の showResult (resultShown のラッチがあるので 2 回目は黙って無視される)。
// ══════════════════════════════════════════════════════════════════════════════
/* ⚠ この関数は puppeteer がページへ**丸ごと送る**。ドライバのスコープを 1 つも掴まないこと
   (掴むと "X is not defined" になり、症状は「値が全部 null」= 実装の欠陥に見える)。 */
function readIndexAmbush(K) {
  const g = (f) => { try { return f(); } catch (e) { return '(ERR ' + String(e && e.message).slice(0, 60) + ')'; } };
  const s = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return '(throw)'; } };
  return {
    href: location.href,
    scenarioId: g(() => scenarioId),
    ambushOn: g(() => ROAD_AMBUSH_ON),
    ambushRun: g(() => roadAmbushRun),
    theme: g(() => _scenIdForTex),
    scen: g(() => ({
      title: currentScenario.title,
      waves: Array.isArray(currentScenario.waves) ? currentScenario.waves.length : null,
      wagons: Array.isArray(currentScenario.wagonSpawns) ? currentScenario.wagonSpawns.length : null,
      spawns: Array.isArray(currentScenario.spawns) ? currentScenario.spawns.length : null,
      clearXp: currentScenario.clearXp || 0,
      clearGold: currentScenario.clearGold || 0,
      trap: currentScenario.trapCount, chest: currentScenario.hiddenChestCount,
    })),
    /* ⭐ 盤面に馬車が **実際に湧いたか** ((2f)(2g) の母集団)。⛔ ペイロードの件数では代用しない
       —— wagonSpawns を素通ししても spawnWagon が落ちれば 0 体になる。 */
    wagons: g(() => wagonIndices.length),
    wagonLost: g(() => escortWagonLost()),
    /* ⭐ (2g) が読む値の**唯一の供給口**。⛔ typeof で守る (未実装のときに ReferenceError で
       他の観測ごと落とさない)。 */
    endsRun: g(() => (typeof escortWagonLossEndsRun === 'function')
      ? escortWagonLossEndsRun() : '(escortWagonLossEndsRun が無い)'),
    /* ★[#52 (9a)] 7.9-3「隊商護衛」が無傷であることの挟み込み用。⛔ 屋外の帯マスクも
       地平線レンダラも **themeId から**引かれるので、テーマ / FIELD_MODE / 帯マスク /
       実際に歩ける行 の 4 点で締める (「両方 true だから緑」で済ませない)。 */
    fieldMode: g(() => FIELD_MODE), isFieldTheme: g(() => IS_FIELD_THEME),
    isCustom: g(() => MAPDEF.isCustom), mapdefId: g(() => MAPDEF.id),
    bandMask: g(() => !!(MAPDEF.flags && MAPDEF.flags.bandMask)),
    openRows: g(() => {
      const o = [];
      for (let r = 0; r < MAP_H; r++) {
        let n = 0;
        for (let c = 0; c < MAP_W; c++) if (!isTileWall(c, r)) n++;
        if (n > 0) o.push(r + ':' + n);
      }
      return o.join(' ');
    }),
    coins: g(() => coins),
    hp: g(() => hp), maxHp: g(() => maxHp),
    allies: g(() => allies.map(a => ({ cls: a.classKey, hp: a.hp, maxHp: a.maxHp }))),
    store: { battle: s(K.battle), ret: s(K.ret), wounds: s(K.wounds),
      scen: s(K.scen), gen: s(K.gen), last: s(K.last) },
  };
}
const IDX_KEYS = { battle: KEY_BATTLE, ret: KEY_RETURN, wounds: KEY_WOUNDS,
  scen: KEY_SCEN, gen: KEY_GENSCEN, last: KEY_LAST };
/* [player, ...allies] の hp/maxHp。⛔ 生の hp では比べない (maxHp は編成で変わる)。 */
function ratiosOf(v) {
  if (!v || typeof v.maxHp !== 'number' || !Array.isArray(v.allies)) return null;
  const r = (h, m) => ((typeof m === 'number' && m > 0) ? h / m : null);
  return [r(v.hp, v.maxHp)].concat(v.allies.map(a => r(a.hp, a.maxHp)));
}
/* reward.gold は lastResult にしか出ない (画面の innerHTML は整形済み)。 */
function rewardOf(v) {
  const raw = (v && v.store) ? v.store.last : null;
  if (!raw) return null;
  try { return (JSON.parse(raw) || {}).reward || null; } catch (e) { return null; }
}
async function measureIndexAmbush(browser, port, errs, opts) {
  opts = opts || {};
  const out = { tag: opts.tag || 'idx', query: opts.query || '', errs: [],
    seeded: { battle: !!opts.battle, wounds: opts.wounds || null,
      scen: opts.scen || null, gen: !!opts.gen } };
  const page = await browser.newPage();
  hookErrors(page, out.errs, '[:' + port + PAGE_INDEX + (opts.query || '') + ' ' + out.tag + '] ');
  /* ⭐ 仕込みは **遷移前**。⚠ 指定が無いキーは明示的に消す (前の走行の残りが次の期待値を汚す)。 */
  await page.evaluateOnNewDocument((s) => {
    const set = (k, v) => {
      try { if (v === null || v === undefined) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {}
    };
    set(s.kMem, s.mem); set(s.kComp, s.comp);
    set(s.kBattle, s.battle); set(s.kWounds, s.wounds);
    set(s.kScen, s.scen); set(s.kGen, s.gen); set(s.kRet, s.ret);
    set(s.kLast, null);
  }, { kMem: KEY_PARTY_MEM, kComp: KEY_PARTY_COMP, kBattle: KEY_BATTLE, kWounds: KEY_WOUNDS,
    kScen: KEY_SCEN, kGen: KEY_GENSCEN, kRet: KEY_RETURN, kLast: KEY_LAST,
    mem: JSON.stringify(PARTY_MEMBERS), comp: JSON.stringify(PARTY4),
    battle: opts.battle || null, wounds: opts.wounds || null,
    scen: opts.scen || null, gen: opts.gen || null, ret: opts.ret || null });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_INDEX + (opts.query || ''),
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(WAIT_INDEX, { timeout: 45000 });
  await settle(page);
  out.boot = await page.evaluate(readIndexAmbush, IDX_KEYS);
  /* ⭐ 消耗を「作る」= 本番の hp をこのランで削る。⛔ roadWounds を直に書かない
     (書き出しの経路そのものを (2c) が測るため)。 */
  if (Array.isArray(opts.hpSet)) {
    out.hpApplied = await safeEval(page, (rs) => {
      const put = (m, r) => Math.max(1, Math.min(m, Math.round(m * r)));
      hp = put(maxHp, rs[0]);
      for (let i = 0; i < allies.length; i++) {
        allies[i].hp = put(allies[i].maxHp, (rs[i + 1] === undefined) ? 1 : rs[i + 1]);
      }
      return { hp: hp, maxHp: maxHp, allies: allies.map(a => ({ hp: a.hp, maxHp: a.maxHp })) };
    }, opts.hpSet);
  }
  /* ⭐ 馬車の全損。⛔ ダメージ計算を再実装しない —— alive を落として本番の
     escortWagonLost() が真になることまで確かめる。 */
  if (opts.killWagon) {
    out.killed = await safeEval(page, () => {
      const idx = wagonIndices.slice();
      idx.forEach(i => { if (enemies[i]) { enemies[i].alive = false; enemies[i].hp = 0; } });
      return { n: idx.length, lost: escortWagonLost() };
    });
  }
  if (typeof opts.result === 'boolean') {
    out.resultCall = await safeEval(page, (w) => {
      try { showResult(w); return 'ok'; } catch (e) { return 'ERR ' + ((e && e.message) || e); }
    }, opts.result);
    await sleep(500);
    out.after = await page.evaluate(readIndexAmbush, IDX_KEYS);
  }
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 I) #52 街道の卓上マップ — 盤面そのもの
//   ⭐⭐⭐ 測るのは **本番の isTileWall / __paintBlockProbe / DFMapDef** だけ。
//     ⛔ マスクの行文字列も座標もドライバへ写経しない (写すと実装とドライバが同じ誤りを
//        共有して**両方緑**になる)。マスクは DFMapDef.paintingBlockedFor から**引く**。
//   ⭐ 「橋が唯一の渡り」もマスクから**導出**する: 塞がれている割合が高い列 = 障壁 (小川)、
//     その列で開いているマス = 渡り。⛔ 「col 9-10 / rows 8-9」を書き写さない。
// ══════════════════════════════════════════════════════════════════════════════
function readBoard() {
  const g = (f) => { try { return f(); } catch (e) { return '(ERR ' + String(e && e.message).slice(0, 80) + ')'; } };
  const room = (typeof MAPDEF !== 'undefined' && MAPDEF && Array.isArray(MAPDEF.rooms))
    ? MAPDEF.rooms[0] : null;
  const rect = (room && Array.isArray(room.rect)) ? room.rect.slice() : null;
  const cat = g(() => {
    const pg = room && room.painting;
    if (!pg || !window.DFMapDef) return null;
    const b = DFMapDef.paintingBlockedFor(pg.theme, pg.key);
    let gates = null, gateErr = null;
    try {
      const gt = DFMapDef.paintingGatesFor(pg.theme, pg.key);
      gates = (gt && gt.gates && typeof gt.gates === 'object') ? Object.keys(gt.gates) : [];
      gateErr = gt ? gt.error : null;
    } catch (e) { gates = null; gateErr = String(e && e.message).slice(0, 60); }
    return { theme: pg.theme, key: pg.key,
             src: DFMapDef.paintingSrcFor(pg.theme, pg.key),
             bounds: DFMapDef.paintingBoundsFor(pg.theme, pg.key),
             rows: (b && Array.isArray(b.rows)) ? b.rows.slice() : null,
             err: b ? b.error : null, gates: gates, gateErr: gateErr };
  });
  /* ⭐ 幾何の計測はすべて本番の isTileWall。extra = 追加で塞ぐマス (橋の実験用)。 */
  const geo = g(() => {
    if (!rect) return null;
    const [r1, c1, r2, c2] = rect;
    const K = (c, r) => r * 4096 + c;
    const comps = (extra) => {
      const seen = new Set(); const sizes = [];
      const blocked = (c, r) => isTileWall(c, r) || (extra && extra.has(K(c, r)));
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        if (blocked(c, r) || seen.has(K(c, r))) continue;
        const st = [[c, r]]; seen.add(K(c, r)); let n = 0;
        while (st.length) {
          const cur = st.pop(); n++;
          for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = cur[0] + d[0], nr = cur[1] + d[1];
            if (nc < c1 || nc > c2 || nr < r1 || nr > r2) continue;
            if (blocked(nc, nr) || seen.has(K(nc, nr))) continue;
            seen.add(K(nc, nr)); st.push([nc, nr]);
          }
        }
        sizes.push(n);
      }
      return sizes.sort((a, b) => b - a);
    };
    let open = 0;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!isTileWall(c, r)) open++;
    /* 起点から 4 近傍で届くマス。⛔ 斜めを踏まない (本番の aStar と同じ)。 */
    const st = [[MAPDEF.start.tx, MAPDEF.start.ty]];
    const seen = new Set([K(st[0][0], st[0][1])]);
    while (st.length) {
      const cur = st.pop();
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = cur[0] + d[0], nr = cur[1] + d[1];
        if (nc < c1 || nc > c2 || nr < r1 || nr > r2) continue;
        if (isTileWall(nc, nr) || seen.has(K(nc, nr))) continue;
        seen.add(K(nc, nr)); st.push([nc, nr]);
      }
    }
    /* 「通し行」= 外周 1 タイルを除いた内側が 1 マスも塞がっていない行。
       ⭐ 何行目かは**書かない** —— 在るかどうかだけを見る (街道の位置は好みで動かせる)。 */
    const unbroken = [];
    for (let r = r1 + 1; r <= r2 - 1; r++) {
      let ok = true;
      for (let c = c1 + 1; c <= c2 - 1 && ok; c++) if (isTileWall(c, r)) ok = false;
      if (ok) unbroken.push(r - r1);
    }
    /* 障壁の列 (= 小川) と渡り (= 橋) をマスクから導出する。 */
    let barrierCols = [], crossing = [];
    const rows = cat && Array.isArray(cat.rows) ? cat.rows : null;
    if (rows && rows.length) {
      const H = rows.length, W = rows[0].length;
      /* ⚠ 外周のフェザー帯に隣接する列は障壁ではない (東の樹林帯を「小川」と誤検出して
         連結成分が 3 つに割れた実測がある)。内側の列だけを見る。 */
      for (let c = 2; c <= W - 3; c++) {
        let n = 0;
        for (let r = 0; r < H; r++) if (rows[r].charAt(c) === '#') n++;
        if (n >= Math.ceil(H * 0.6)) barrierCols.push(c);
      }
      for (const c of barrierCols) {
        for (let r = 0; r < H; r++) {
          if (rows[r].charAt(c) !== '#' && !isTileWall(c1 + c, r1 + r)) crossing.push([c, r]);
        }
      }
    }
    const extra = new Set(crossing.map(([c, r]) => K(c1 + c, r1 + r)));
    return { open: open, reachable: seen.size, unbroken: unbroken,
             comps: comps(null), compsNoBridge: crossing.length ? comps(extra) : null,
             barrierCols: barrierCols, crossing: crossing,
             ringOpen: (() => {
               let n = 0;
               for (let c = c1; c <= c2; c++) { if (!isTileWall(c, r1)) n++; if (!isTileWall(c, r2)) n++; }
               for (let r = r1 + 1; r <= r2 - 1; r++) { if (!isTileWall(c1, r)) n++; if (!isTileWall(c2, r)) n++; }
               return n;
             })() };
  });
  return {
    href: location.href,
    scenarioId: g(() => scenarioId), theme: g(() => _scenIdForTex),
    isFieldTheme: g(() => IS_FIELD_THEME), fieldMode: g(() => FIELD_MODE),
    isCustom: g(() => MAPDEF.isCustom), mapdefId: g(() => MAPDEF.id),
    bandMask: g(() => !!(MAPDEF.flags && MAPDEF.flags.bandMask)),
    rect: rect, painting: g(() => (room && room.painting) ? room.painting : null),
    catalog: cat,
    paintings: g(() => roomPaintings.map(p => ({
      tx: p.tx, ty: p.ty, tw: p.tw, th: p.th, seal: !!p.sealRing,
      rows: p.blocked ? p.blocked.length : null,
      cols: (p.blocked && p.blocked[0]) ? p.blocked[0].length : null,
      src: String((p.img && p.img.src) || '').split('/').pop() }))),
    probe: g(() => {
      const pb = window.__paintBlockProbe ? window.__paintBlockProbe() : null;
      return pb ? { entries: pb.entries, applied: pb.applied, ring: pb.ring,
                    skipGate: pb.skipGate, skipStart: pb.skipStart, skipSpawn: pb.skipSpawn,
                    onWall: pb.onWall, perEntry: pb.perEntry } : null;
    }),
    start: g(() => ({ tx: START_TX, ty: START_TY })),
    startWall: g(() => isTileWall(START_TX, START_TY)),
    spawns: g(() => ENEMY_SPAWNS.map(s => ({ k: s[0], tx: s[1], ty: s[2], wall: isTileWall(s[1], s[2]) }))),
    wagons: g(() => wagonIndices.length),
    wagonAt: g(() => wagonIndices.map(i => {
      const e = enemies[i];
      return e ? { tx: Math.round(e.x / TILE_SIZE), ty: Math.round(e.y / TILE_SIZE) } : null;
    })),
    wagonProbe: g(() => (window.__wagonProbe || []).map(w => ({ raw: w.raw, tx: w.tx, ty: w.ty, outcome: w.outcome }))),
    geo: geo,
  };
}
/* 盤面の観測レグ。⭐ 積荷は **world.html が実際に書いた bytes** を渡す (ドライバが組まない)。 */
async function measureBoard(browser, port, errs, opts) {
  opts = opts || {};
  const out = { tag: opts.tag || 'board', query: opts.query || '', errs: [] };
  const page = await browser.newPage();
  hookErrors(page, out.errs, '[:' + port + PAGE_INDEX + (opts.query || '') + ' ' + out.tag + '] ');
  await page.evaluateOnNewDocument((s) => {
    const set = (k, v) => {
      try { if (v === null || v === undefined) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {}
    };
    set(s.kMem, s.mem); set(s.kComp, s.comp); set(s.kBattle, s.battle);
    set(s.kScen, null); set(s.kGen, null); set(s.kWounds, null); set(s.kLast, null);
  }, { kMem: KEY_PARTY_MEM, kComp: KEY_PARTY_COMP, kBattle: KEY_BATTLE, kScen: KEY_SCEN,
    kGen: KEY_GENSCEN, kWounds: KEY_WOUNDS, kLast: KEY_LAST,
    mem: JSON.stringify(PARTY_MEMBERS), comp: JSON.stringify(PARTY4), battle: opts.battle || null });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_INDEX + (opts.query || ''),
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(WAIT_INDEX, { timeout: 45000 });
  await settle(page);
  /* 絵の読み込みは当たり判定に**関係しない** (blocked は img.onload を待たない) が、
     (6b) の「貼られた src」を見たいので少しだけ待つ。 */
  await sleep(900);
  out.board = await page.evaluate(readBoard);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 H) (3c) 負けたら港町 — world → index (敗北) → world → world
//   ⭐⭐⭐ 注入元を **index.html の敗北そのもの**にしてある (measureResume のように
//     ドライバが roadReturn を書き換えるのではなく、本番の showResult(false) に書かせる)。
//   ⭐ 3 つ目の開き直しが **対照**: 「キーを消しただけ」なら spawnFor が返すのは
//     SITES[currentScenario] = 本命クエストの地であって phlan ではない、という実測を残す。
// ══════════════════════════════════════════════════════════════════════════════
async function measureDefeatReturn(browser, port, errs, opts) {
  opts = opts || {};
  const out = { battleSeeded: !!opts.battle };
  const page = await openWorld(browser, port, errs,
    { tag: 'defeat', comp: PARTY4, mem: PARTY_MEMBERS });
  /* 刻み点 (WM.has が偽) と、本命クエストの地の両方を **実体から**引く。⛔ 写経しない。 */
  out.pick = await safeEval(page, (o) => {
    const WM = window.WORLD_MAP, g = WM.walkNodes();
    return { step: Object.keys(g).filter(k => !WM.has(k))[0] || null,
      site: (WM.SITES || {})[o.scen] || null, nWalk: Object.keys(g).length };
  }, { scen: MAIN_SCEN });
  out.seeded = await safeEval(page, (o) => {
    const s = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
    s(o.kRet, o.step || ''); s(o.kVia, 'dungeon'); s(o.kScen, o.scen); s(o.kBattle, o.battle);
    try { sessionStorage.removeItem(o.kWounds); } catch (e) {}
    const g = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    return { ret: g(o.kRet), scen: g(o.kScen), battle: !!g(o.kBattle) };
  }, { kRet: KEY_RETURN, kVia: KEY_EXIT_VIA, kScen: KEY_SCEN, kBattle: KEY_BATTLE,
    kWounds: KEY_WOUNDS, step: (out.pick && out.pick.step) || '',
    scen: MAIN_SCEN, battle: opts.battle || '' });
  await page.goto('http://localhost:' + port + PAGE_INDEX, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(WAIT_INDEX, { timeout: 45000 });
  await settle(page);
  out.idxBoot = await page.evaluate(readIndexAmbush, IDX_KEYS);
  out.resultCall = await safeEval(page, () => {
    try { showResult(false); return 'ok'; } catch (e) { return 'ERR ' + ((e && e.message) || e); }
  });
  await sleep(500);
  out.idxAfter = await page.evaluate(readIndexAmbush, IDX_KEYS);
  await reopenWorld(page, port, '');
  out.back = await readResume(page);
  await reopenWorld(page, port, '');
  out.again = await readResume(page);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 小道具
// ══════════════════════════════════════════════════════════════════════════════
function eqNums(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function firstDiff(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return -1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return (a.length === b.length) ? -1 : n;
}
function nOf(hay, needle) { return String(hay).split(needle).length - 1; }
const legOf = (m, k) => (m.legs && m.legs[k]) ? m.legs[k] : null;
/* 襲撃の器が **開いた停留所**。⛔ ドライバが期待する id を持たない (実体の記録から引く)。 */
function openedAt(L) {
  if (!L || !Array.isArray(L.opens)) return null;
  const r = L.opens.filter(o => o.isAmbush)[0];
  return r ? r.at : null;
}
/* sessionStorage の roadBattle を解く。⛔ 壊れていたら null (握り潰して緑にしない)。 */
function battleOf(L) {
  const raw = (L && L.storagePost) ? L.storagePost.battle : null;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
/* readAmbStorage が返す 6 キーのうち「値が生えている」ものの名前。 */
const STORE_KEYS = ['battle', 'ret', 'wounds', 'scen', 'gen', 'boon'];
function dirtyKeys(store) {
  const s = store || {};
  return STORE_KEYS.filter(k => s[k] !== null && s[k] !== undefined);
}
/* ⭐⭐⭐ (0d) と (4a) の本体。**同じ物差しを 2 度使う**のがこの節の設計 ——
 *  (0d) は「装置が立った時点」で、(4a) は「本実装が入った後」で同じ固定基準列と突き合わせる。
 *  ⛔ 走行時に基準を採り直さない (BASE_RND は 2026-09-04 / bdc6880 の実測固定値)。 */
function rndIdentity(m) {
  const rows = m.rnd || [];
  if (!rows.length) return popFail('rnd の観測', 'measureRnd が 1 種も返していない');
  const det = [];
  let ok = true, calls = 0;
  for (const r of rows) {
    const base = BASE_RND[r.seed];
    const p = r.plain, s = r.split;
    const pOk = !!(p && eqNums(p.values, base));
    const sOk = !!(s && eqNums(s.values, base));
    if (s) calls += s.calls;
    if (!pOk || !sOk) ok = false;
    det.push('種 ' + r.seed + ': 素=' + (pOk ? '一致' : '⛔不一致@' + firstDiff(p ? p.values : null, base))
      + ' 挟込=' + (sOk ? '一致' : '⛔不一致@' + firstDiff(s ? s.values : null, base))
      + ' (ambRoll ' + (s ? s.calls : 0) + ' 回'
      + (s && s.rolls && s.rolls.length ? ' → ' + JSON.stringify(s.rolls) : '')
      + (s && s.ambSeed !== null && s.ambSeed !== undefined ? ' / ambSeed=' + s.ambSeed : '')
      + ')');
  }
  /* ③ 静的 — world.html が ambRoll を経由せず rnd() を直接叩く形の罠 B を塞ぐ。 */
  const worldRnd = (typeof m.served === 'string') ? nOf(m.served, 'rnd' + '(') : -1;
  const staticOk = worldRnd === BASE_WORLD_RND;
  if (!staticOk) ok = false;
  return [ok, { det: det, calls: calls, worldRnd: worldRnd }];
}
/* 器の矩形が画面に収まっているか (verify_road_events (1d) と同じ物差し)。 */
function boxWhy(v) {
  const why = [];
  if (!v.opened || !v.isOpen) why.push('開かない');
  if (!v.rect || v.rect.w <= 0 || v.rect.h <= 0) why.push('矩形が無い');
  else {
    if (v.rect.x < -0.5 || v.rect.right > v.vw + 0.5)
      why.push('fitsX 違反 x=' + v.rect.x.toFixed(1) + ' right=' + v.rect.right.toFixed(1) + ' vw=' + v.vw);
    if (v.rect.y < -0.5 || v.rect.bottom > v.vh + 0.5)
      why.push('fitsY 違反 y=' + v.rect.y.toFixed(1) + ' bottom=' + v.rect.bottom.toFixed(1) + ' vh=' + v.vh);
  }
  if (v.clipY > 1 || v.clipX > 1)
    why.push('中身が器からはみ出して隠れている clipX=' + v.clipX + ' clipY=' + v.clipY);
  const wantBtns = (v.tag === 'intro') ? 2 : 1;
  if (v.nBtns !== wantBtns)
    why.push('ボタンが ' + v.nBtns + ' 個 (期待 ' + wantBtns + ' = ⭐ 器を閉じずに描き直していないか)');
  for (const q of (v.btnRects || [])) {
    if (q.x < -0.5 || q.right > v.vw + 0.5 || q.y < -0.5 || q.bottom > v.vh + 0.5)
      why.push('ボタンが画面外: ' + JSON.stringify(String(q.label).slice(0, 10)));
  }
  return why;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 — [id, 見出し, m => [ok, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 (先に母集団を確かめる) ────────────────────────────────────────
  ['0a', '[装置] window.ROAD_EVENTS.AMBUSH が実在し、choices が **判定つき 1 つ + 判定なし 1 つ**に'
    + 'ちょうど分割される (⛔ 2 を直書きせず実体から数えて整合だけ見る) / 成功文 ≠ 失敗文 /'
    + ' checkKey は SkillCheck.CHECKS 内・dc は DC_TIERS 内 / ambRoll・ambSeed が関数'
    + '  ⭐⭐⭐ これが無いと (0c)(0d)(0e) と §1〜§5 の全 assert が空振りする',
    (m) => {
      const b = m.boot;
      if (!b) return popFail('(0a) world.html の起動', 'measureBoot が値を返していない');
      const s = b.seam || {};
      const A = b.ambush;
      if (!A) {
        return [false, 'typeof window.ROAD_EVENTS = ' + b.reType
          + ' / typeof ROAD_EVENTS.AMBUSH = ' + s.AMBUSH
          + ' / ambRoll = ' + s.ambRoll + ' / ambSeed = ' + s.ambSeed
          + '  ⛔ 襲撃の表が本番に無い = 依頼書 §5-1 の AMBUSH / ambRoll / ambSeed が未実装'];
      }
      const cs = A.choices || [];
      const withCheck = cs.filter(c => c.check);
      const plain = cs.filter(c => !c.check);
      /* ⛔ 件数を直書きせず、**分割が漏れなく 1 対 1 か**だけを見る。 */
      const splitOk = (withCheck.length + plain.length === cs.length)
        && withCheck.length === 1 && plain.length === 1;
      const c1 = withCheck[0] || {}, c0 = plain[0] || {};
      const textOk = !!c1.success && !!c1.fail && c1.success !== c1.fail && !!c0.result;
      const keyOk = !!(b.checkKeys && A.checkKey && b.checkKeys.indexOf(A.checkKey) >= 0);
      const dcOk = !!(b.dcTiers && A.dc && b.dcTiers.indexOf(A.dc) >= 0);
      const seamOk = s.ambRoll === 'function' && s.ambSeed === 'function';
      const ok = splitOk && textOk && keyOk && dcOk && seamOk;
      const inEvents = !!(b.eventIds && b.eventIds.indexOf(A.id) >= 0);
      return [ok,
        'id=' + JSON.stringify(A.id) + ' checkKey=' + JSON.stringify(A.checkKey)
        + ' dc=' + JSON.stringify(A.dc)
        + ' / choices ' + cs.length + ' 件 (判定つき ' + withCheck.length
        + ' / 判定なし ' + plain.length + ')'
        + ' / 成功文≠失敗文=' + (c1.success !== c1.fail)
        + ' / checkKey∈CHECKS=' + keyOk + ' dc∈DC_TIERS=' + dcOk
        + ' / seam ambRoll=' + s.ambRoll + ' ambSeed=' + s.ambSeed
        + '  [記録・⛔判定しない] AMBUSH は EVENTS に混ざっているか = ' + inEvents
        + ' ((4c) の担当)'
        + (ok ? '' : '  ⛔ '
          + (!splitOk ? '選択肢の分割が 判定つき1+判定なし1 になっていない ' : '')
          + (!textOk ? '成功文/失敗文/判定なしの結末文のどれかが欠けている (or 成功文=失敗文) ' : '')
          + (!keyOk ? 'checkKey が CHECKS 外 (⚠ survival / nature は存在せず判定ごと静かに消える) ' : '')
          + (!dcOk ? 'dc が DC_TIERS 外 ' : '')
          + (!seamOk ? 'ambRoll / ambSeed が公開されていない' : ''))];
    }],

  ['0b', '[装置] 襲撃の文言は js/road-events.js から引いている — world.html の **配信バイト**に'
    + ' AMBUSH の title / intro / label / 結末文が 1 つも出てこない'
    + ' (⛔ 写経の検出。verify_road_events (0b) と同じ物差し。変異 copytext が番人)',
    (m) => {
      if (typeof m.served !== 'string' || !m.served.length)
        return [false, 'world.html の配信バイトを読めていない'];
      const b = m.boot;
      const strs = (b && b.strings) ? b.strings : [];
      /* ⛔ 短すぎる語は誤検出になるので 4 文字以上だけ見る。 */
      const checked = strs.filter(s => typeof s[1] === 'string' && s[1].length >= 4);
      /* ⭐⭐⭐ 母集団ガード — 検索する文言が 0 本なら「出てこない」は **自明に真**。
         AMBUSH 1 件につき最低 4 本 (title / intro / label x2) は必ず在る。
         ⚠⚠ 依頼書は「(0b) は緑」と予測しているが、本番未実装のいまは母集団が立たない。
           #48 の作法どおり **assert を緩めず予測のほうを訂正**する (⛔ skip = 緑にしない)。 */
      const MIN_STRINGS = 4;
      const enough = !!(b && b.ambush) && checked.length >= MIN_STRINGS;
      if (!enough) {
        return popFail('(0b) 検索する文言',
          '検索対象が ' + checked.length + ' 本 (期待 >= ' + MIN_STRINGS + ')'
          + ' — AMBUSH が未実装なので「写経していない」は自明に真になる'
          + ' / world.html 配信 ' + m.served.length + 'B');
      }
      const hits = checked.filter(s => m.served.indexOf(s[1]) >= 0);
      return [hits.length === 0,
        'world.html 配信 ' + m.served.length + 'B / 検索した文言 ' + checked.length + ' 本'
        + ' (title + intro + label + 結末文) / 母集団ガード=' + enough
        + (hits.length
          ? ' / ⛔ 写経ヒット ' + hits.length + ' 本: '
            + hits.slice(0, 3).map(s => s[0] + '=' + JSON.stringify(s[1].slice(0, 20))).join(' , ')
          : ' / ヒット 0 本')];
    }],

  ['0c', '[母集団] 決定論の腕が両方立つ — 襲撃が **必ず出る種**と**必ず出ない種**が'
    + '両方存在し、**実際に歩かせて**「出る種では器が開く / 出ない種では 1 度も開かない」'
    + 'ところまで確かめられる  ⛔ どちらか片方しか作れないなら §1〜§5 は全部空振りする',
    (m) => {
      const sc = m.scan;
      if (!sc || sc.supported !== true) {
        return popFail('(0c) 種の走査',
          ((sc && sc.why) || 'ROAD_EVENTS.ambRoll が無い')
          + ' — 種を 1 つも分類できないので「出る種 / 出ない種」を作れない');
      }
      const fireLeg = legOf(m, 'fireNone');
      const quietLeg = legOf(m, 'quiet');
      const scanOk = sc.fire.length >= 1 && sc.quiet.length >= 1;
      const fireOk = !!(fireLeg && fireLeg.ambushOpens >= 1);
      const quietOk = !!(quietLeg && quietLeg.ambushOpens === 0
        && (quietLeg.arrivals || []).length >= QUIET_MIN_ARRIVALS);
      const ok = scanOk && fireOk && quietOk;
      return [ok,
        '走査 ' + sc.probed + ' 種 → 出る種 ' + sc.fire.length + ' / 出ない種 ' + sc.quiet.length
        + ' (先頭: ' + JSON.stringify(sc.rows.slice(0, 6)) + ')'
        + '  / 出る種の試行 = ' + JSON.stringify((m.seedPick || {}).tries || [])
        + ' 採用 = ' + JSON.stringify((m.seedPick || {}).used)
        + '  / 歩行[出る種 ' + (fireLeg ? fireLeg.seed : '—') + '→' + (fireLeg ? fireLeg.dest : '—')
        + '] 襲撃 ' + (fireLeg ? fireLeg.ambushOpens : '—') + ' 件'
        + ' / 出来事 ' + (fireLeg ? fireLeg.roadOpens : '—') + ' 件'
        + ' / 到着 ' + (fireLeg ? (fireLeg.arrivals || []).length : '—') + ' 件'
        + '  / 歩行[出ない種 ' + (quietLeg ? quietLeg.seed : '—') + '→' + (quietLeg ? quietLeg.dest : '—')
        + '] 襲撃 ' + (quietLeg ? quietLeg.ambushOpens : '—') + ' 件'
        + ' / 到着 ' + (quietLeg ? (quietLeg.arrivals || []).length : '—')
        + ' 件 (期待 >= ' + QUIET_MIN_ARRIVALS + ')'
        + (ok ? '' : '  ⛔ '
          + (!scanOk ? '走査で片方の腕しか作れていない ' : '')
          + (!fireOk ? '出る種で歩かせても器が 1 度も開かない (world.html が ambRoll を呼んでいない疑い) ' : '')
          + (!quietOk ? '出ない種の歩行が短すぎる or 襲撃が出てしまった' : ''))];
    }],

  ['0d', '[恒等] 既存の引きが 1 つも動いていない — 同じ種で ROAD_EVENTS.rnd() を ' + RND_N
    + ' 回引いた列が、**襲撃機能を通す前に採った固定の基準列**と完全一致する。'
    + ' ①素の列 ②' + RND_SPLIT + ' 回引いて ambRoll() を ' + AMB_PROBE + ' 回呼んでから残りを引いた列'
    + ' ③world.html の配信バイトの rnd 呼び出しが ' + BASE_WORLD_RND + ' 件'
    + '  ⭐⭐⭐ 罠 B (依頼書 §2-4) の検出器。②が無いと sharedrng は無傷に見える',
    (m) => {
      const r = rndIdentity(m);
      if (typeof r[1] === 'string') return r;    /* popFail はそのまま返す */
      const d = r[1];
      return [r[0],
        d.det.join(' | ')
        + ' / world.html の rnd 呼び出し = ' + d.worldRnd + ' 件 (着手前 ' + BASE_WORLD_RND + ' 件)'
        + '  [記録] ambRoll を呼べた合計 ' + d.calls + ' 回'
        + (d.calls === 0 ? ' (⚠ 本番未実装のあいだは 0 = 挟み込みレグはまだ罠 B を測っていない。'
          + '(0a) が赤いことでそれが分かる)' : '')
        + (r[0] ? '' : '  ⛔ 既存の乱数列が動いた = 罠 B (依頼書 §2-4)。'
          + 'ambRnd 専用ストリームを使わず rnd() を共有している疑い')];
    }],

  ['0e', '[母集団] 3 経路の腕が全部立つ — **判定なし / 判定つき成功 / 判定つき失敗**の'
    + 'それぞれで襲撃が発火し、結末の文が AMBUSH の実体 (result / success / fail) と一致する'
    + '  ⛔ 「発火が 1 件以上」で満足しない (依頼書 §4)',
    (m) => {
      const want = [['fireNone', 'none', 'result', '判定なし'],
        ['fireWin', 'check', 'success', '判定つき成功'],
        ['fireLose', 'check', 'fail', '判定つき失敗']];
      const rows = want.map(w => {
        const L = legOf(m, w[0]);
        const a = L ? L.amb : null;
        return { tag: w[3], leg: w[0], ran: !!L, fired: !!(L && L.ambushOpens >= 1),
          matched: a ? a.matched : null, wantMatch: w[2],
          ok: !!(L && L.ambushOpens >= 1 && a && a.matched === w[2]),
          why: (a && a.why) ? a.why : '' };
      });
      if (!rows.some(r => r.ran)) {
        return popFail('(0e) 3 経路の歩行', '1 本も走っていない');
      }
      if (!rows.some(r => r.fired)) {
        return popFail('(0e) 襲撃の発火',
          '3 経路とも器が 1 度も開かない — ' + ((m.scan && m.scan.supported === true)
            ? '出る種で歩いても world.html が襲撃を出していない'
            : 'ROAD_EVENTS.ambRoll が無い (本番未実装)')
          + ' / 走った腕 = ' + rows.filter(r => r.ran).map(r => r.tag).join(' , '));
      }
      const ok = rows.every(r => r.ok);
      return [ok, rows.map(r => '[' + r.tag + '] '
        + (r.ran ? (r.fired ? '発火○' : '発火✕') : '未実行')
        + ' 結末=' + JSON.stringify(r.matched) + '(期待 ' + r.wantMatch + ')'
        + (r.why ? ' ⛔' + r.why : '')).join('  |  ')
        + (ok ? '' : '  ⛔ 3 経路の全部で襲撃が発火し、正しい結末の文が出るまでは'
          + ' (1a)(1d)(2c) は空振りする')];
    }],

  // ── §1 街道側 ────────────────────────────────────────────────────────────
  ['1a', '4 経路を**実際に押して**観測する — 判定なし / 判定つき成功 / 判定つき失敗 /'
    + ' **判定が null**。押す札は AMBUSH の実体から引き (⛔ 「1 番目」で決め打ちしない)、'
    + '結末の文・判定パネルの有無・**戦闘へ行ったかどうか**の 3 つを同時に見る。'
    + '  ⚠⚠ null は **失敗ではない** = 結末は出るが戦闘へは行かない (依頼書 §5-4 / 変異 nullfight)',
    (m) => {
      const want = [
        ['fireNone', 'none', 'result', false, '判定なし (見捨てる)'],
        ['fireWin', 'check', 'success', true, '判定つき成功'],
        ['fireLose', 'check', 'fail', true, '判定つき失敗'],
        ['fireNull', 'check', 'result', false, '判定つき + 判定が null'],
      ];
      const rows = want.map(w => {
        const L = legOf(m, w[0]);
        const a = L ? L.amb : null;
        const def = L ? L.evDef : null;
        const wantLabel = def
          ? (((def.choices || []).filter(c => !!c.check === (w[1] === 'check'))[0]) || {}).label
          : null;
        /* 判定パネルは「判定つき かつ 判定が生きている」腕だけに出る。 */
        const wantPanel = (w[1] === 'check' && w[0] !== 'fireNull');
        const panelOk = wantPanel ? !!(a && a.panel && a.panel.rows >= 1) : !(a && a.panel);
        const fought = !!(L && L.storagePost && L.storagePost.battle);
        return { tag: w[4], leg: w[0], ran: !!L, fired: !!(L && L.ambushOpens >= 1),
          label: a ? a.label : null, wantLabel: wantLabel,
          labelOk: !!(a && wantLabel && a.label === wantLabel),
          matched: a ? a.matched : null, wantMatch: w[2],
          panelRows: (a && a.panel) ? a.panel.rows : null, panelOk: panelOk,
          fought: fought, wantFight: w[3],
          ok: !!(L && L.ambushOpens >= 1 && a && a.matched === w[2]
            && wantLabel && a.label === wantLabel && panelOk && fought === w[3]) };
      });
      if (!rows.some(r => r.ran)) return popFail('(1a) 4 経路の歩行', '1 本も走っていない');
      if (!rows.some(r => r.fired)) {
        return popFail('(1a) 襲撃の発火',
          '4 経路とも器が 1 度も開かない / 走った腕 = ' + rows.filter(r => r.ran).map(r => r.tag).join(' , '));
      }
      const ok = rows.every(r => r.ok);
      return [ok, rows.map(r => '[' + r.tag + '] '
        + (r.ran ? (r.fired ? '発火○' : '発火✕') : '未実行')
        + ' 押した札=' + JSON.stringify(String(r.label || '').slice(0, 12))
        + (r.labelOk ? '(実体一致)' : '(⛔実体と不一致 期待 ' + JSON.stringify(String(r.wantLabel || '').slice(0, 12)) + ')')
        + ' 結末=' + JSON.stringify(r.matched) + '(期待 ' + r.wantMatch + ')'
        + ' パネル=' + (r.panelRows === null ? 'なし' : r.panelRows + ' 行') + (r.panelOk ? '' : '⛔')
        + ' 戦闘へ=' + r.fought + '(期待 ' + r.wantFight + ')').join('  |  ')
        + (ok ? '' : '  ⛔ 4 経路のどれかが期待どおりに動いていない')];
    }],

  ['1b', '見捨てたときは storage に **1 バイトも書かない** — roadBattle も roadReturn も'
    + ' roadWounds も生えない。⭐ 走行前も空だったこと (storagePre) を AND で見る'
    + ' (⛔ 「元から在った値が残っているだけ」を「書いていない」と読み違えないため。変異 dismisswrite)',
    (m) => {
      const L = legOf(m, 'fireNone');
      if (!L) return popFail('(1b) 見捨てる腕', '走っていない');
      if (L.ambushOpens < 1) return popFail('(1b) 襲撃の発火', '見捨てる腕で器が 1 度も開いていない');
      const preDirty = dirtyKeys(L.storagePre);
      const postDirty = dirtyKeys(L.storagePost);
      const ok = preDirty.length === 0 && postDirty.length === 0;
      return [ok,
        '腕 = 種 ' + L.seed + ' → ' + L.dest + ' / 襲撃 ' + L.ambushOpens + ' 件 / 押した札 = 判定なし'
        + ' / 走行前に生えていたキー = ' + JSON.stringify(preDirty)
        + ' / 走行後に生えていたキー = ' + JSON.stringify(postDirty)
        + ' (見た 6 キー: ' + STORE_KEYS.join(' , ') + ')'
        + (ok ? '' : '  ⛔ 見捨てた枝で storage が動いた')];
    }],

  ['1c', '助けたときだけ書かれる — roadBattle の waves が **1 件**、roadBattle.at と roadReturn が'
    + '**器が開いた停留所そのもの**で、かつ細分化グラフ (NODES ∪ STEPS) に実在する。'
    + '⭐ 盤面 (spawns / wagonSpawns / themeId) が空でないことも AND で見る'
    + ' (⛔ 中身は測らない —— spawns が空だと goblin-mine へフォールバックして化ける)。'
    + '⭐ currentScenario / generatedScenario が world 側で 1 バイトも動いていないこと (罠 F の街道側)',
    (m) => {
      const walk = (m.boot && Array.isArray(m.boot.walkNodeIds)) ? m.boot.walkNodeIds : null;
      if (!walk) return popFail('(1c) 停留所の母集団', 'WORLD_MAP.walkNodes() を読めていない');
      const rows = ['fireWin', 'fireLose'].map(k => {
        const L = legOf(m, k);
        const b = battleOf(L);
        const at = openedAt(L);
        const ret = (L && L.storagePost) ? L.storagePost.ret : null;
        const wavesOk = !!(b && Array.isArray(b.waves) && b.waves.length === 1);
        const atOk = !!(b && at && b.at === at);
        const retOk = !!(at && ret === at);
        const inGraph = !!(at && walk.indexOf(at) >= 0);
        const fieldOk = !!(b && Array.isArray(b.spawns) && b.spawns.length >= 1
          && Array.isArray(b.wagonSpawns) && b.wagonSpawns.length >= 1
          && typeof b.themeId === 'string' && b.themeId.length > 0);
        const cleanOk = !!(L && L.storagePost && L.storagePost.scen === null && L.storagePost.gen === null);
        return { leg: k, ran: !!L, fired: !!(L && L.ambushOpens >= 1), at: at, ret: ret,
          nWaves: b && Array.isArray(b.waves) ? b.waves.length : null,
          keys: b ? Object.keys(b) : null,
          wavesOk, atOk, retOk, inGraph, fieldOk, cleanOk,
          ok: wavesOk && atOk && retOk && inGraph && fieldOk && cleanOk };
      });
      if (!rows.some(r => r.fired)) return popFail('(1c) 助ける腕', '判定つきの腕で器が 1 度も開いていない');
      const ok = rows.every(r => r.ok);
      return [ok, rows.map(r => '[' + r.leg + '] 発火=' + r.fired
        + ' 開いた停留所=' + JSON.stringify(r.at) + '(グラフ内=' + r.inGraph + ')'
        + ' roadBattle.at 一致=' + r.atOk + ' roadReturn=' + JSON.stringify(r.ret) + '(一致=' + r.retOk + ')'
        + ' waves=' + r.nWaves + ' 件' + (r.wavesOk ? '' : '⛔')
        + ' 盤面(spawns/wagonSpawns/themeId)=' + r.fieldOk
        + ' 本命が無傷=' + r.cleanOk
        + ' キー=' + JSON.stringify(r.keys)).join('  |  ')
        + '  [記録] 停留所の母集団 ' + walk.length + ' 箇所'];
    }],

  ['1d', '奇襲は成否で変わる — 同じ種・同じ停留所で d20=20 と d20=1 を撃つと'
    + ' roadBattle.surprise が **true / false** に割れる (⛔ 片方だけ見ない。変異 nosurprise)',
    (m) => {
      const w = legOf(m, 'fireWin'), l = legOf(m, 'fireLose');
      const bw = battleOf(w), bl = battleOf(l);
      if (!bw || !bl) {
        return popFail('(1d) 2 本の roadBattle',
          '成功 ' + (bw ? '有' : '無') + ' / 失敗 ' + (bl ? '有' : '無')
          + ' — 両方が書かれないと「割れる」を測れない');
      }
      const sameSeed = !!(w && l && w.seed === l.seed);
      const sameAt = bw.at === bl.at;
      const ok = bw.surprise === true && bl.surprise === false && sameSeed && sameAt;
      return [ok,
        '成功 (d20=20 / Math.random=' + D20_WIN + ') surprise=' + JSON.stringify(bw.surprise)
        + ' / 失敗 (d20=1 / Math.random=' + D20_LOSE + ') surprise=' + JSON.stringify(bl.surprise)
        + ' / 同じ種=' + sameSeed + ' (種 ' + (w ? w.seed : '—') + ')'
        + ' 同じ停留所=' + sameAt + ' (' + JSON.stringify(bw.at) + ')'
        + (ok ? '' : '  ⛔ 成否で surprise が割れていない')];
    }],

  ['1e', '遷移先 — 結末の「先へ進む」を押すと **location.search === "" の index.html** へ移る'
    + ' (⛔ クエリを 1 文字も足していない = world → index の唯一の入場口と同じ形)',
    (m) => {
      const L = legOf(m, 'fireWin');
      const adv = L ? L.advance : null;
      if (!adv) return popFail('(1e) 「先へ進む」の押下', '遷移する腕を走らせていない');
      if (!adv.pressed) return popFail('(1e) 「先へ進む」の押下', 'ボタンを押せなかった');
      if (!battleOf(L)) return popFail('(1e) 戦闘の積荷', 'roadBattle が書かれていないので遷移する理由が無い');
      const nav = adv.nav || {};
      const pathOk = /\/index\.html$/.test(String(nav.path || ''));
      const qOk = nav.search === '';
      const ok = pathOk && qOk;
      return [ok,
        '押した=' + adv.pressed + ' / ' + adv.polls + ' 回の観測で location = '
        + JSON.stringify(nav.path) + JSON.stringify(nav.search)
        + ' (readyState=' + JSON.stringify(nav.ready) + ')'
        + (ok ? '' : '  ⛔ ' + (!pathOk ? 'index.html へ移っていない ' : '')
          + (!qOk ? 'クエリが付いている (⛔ 依頼書 §5-4 / world.html:1083 の規律違反)' : ''))];
    }],

  ['1f', '編成が無ければ出ない — partyMembers を空にして同じ種で歩くと襲撃が **0 件**'
    + ' (⭐ 母集団 = 同じ種に編成を積めば発火すること。⛔ 「出なかった」だけでは'
    + '歩けていないのと区別がつかない。変異 nopartyguard)',
    (m) => {
      const base = legOf(m, 'fireNone'), off = legOf(m, 'noParty');
      if (!base || base.ambushOpens < 1) {
        return popFail('(1f) 対照の腕', '編成ありの同じ種で襲撃が発火していない');
      }
      if (!off) return popFail('(1f) 編成なしの腕', '走っていない');
      const walked = (off.arrivals || []).length;
      if (walked < 2) {
        return popFail('(1f) 編成なしの歩行',
          '到着 ' + walked + ' 件 (期待 >= 2) — 停留所を踏んでいないので「出ない」を測れていない');
      }
      const dirty = dirtyKeys(off.storagePost);
      const ok = off.ambushOpens === 0 && dirty.length === 0;
      return [ok,
        '編成あり (種 ' + base.seed + ') 襲撃 ' + base.ambushOpens + ' 件 / 到着 ' + (base.arrivals || []).length + ' 件'
        + '  ⇄  編成なし (種 ' + off.seed + ') 襲撃 ' + off.ambushOpens + ' 件 / 到着 ' + walked + ' 件'
        + ' / 出来事 ' + off.roadOpens + ' 件 (⭐ 街道の出来事は従来どおり出てよい)'
        + ' / 生えたキー = ' + JSON.stringify(dirty)
        + (ok ? '' : '  ⛔ 編成が無いのに襲撃が出た or storage が動いた')];
    }],

  ['1g', '器が compact (390x844) に収まる — **導入 (二択) と 3 つの結末画面**をすべて測る。'
    + '⭐ AMBUSH は EVENTS に入っていないので verify_road_events (1d) は 1 度も測らない'
    + ' = **ここで測らないと誰も測らない**。⛔ 中身を隠して「収まった」ことにしていないか'
    + ' (scrollHeight vs clientHeight) とボタンの矩形も同じ視野に入れ、'
    + '閉じたあとにボタンが 1 つも残らないことまで見る (変異 boxleak)',
    (m) => {
      const x = m.box;
      if (!x) return popFail('(1g) 器の観測', 'measureBoxAmbush が値を返していない');
      if (!x.moduleOk) return popFail('(1g) 器の口', 'ROAD_EVENTS.open / showResult が関数でない');
      const views = x.views || [];
      if (views.length < 4) {
        return popFail('(1g) 器の腕',
          '測れた画面が ' + views.length + ' 枚 (期待 4 = 導入 + 結末 3 種) — AMBUSH の実体が足りない');
      }
      if (!x.compact) {
        return [false, 'compact になっていない (viewport '
          + x.viewport.width + 'x' + x.viewport.height + ')'];
      }
      const bad = [];
      for (const v of views) {
        const why = boxWhy(v);
        if (why.length) bad.push(v.tag + ' → ' + why.join(' / '));
      }
      const ac = x.afterClose || {};
      const closeOk = ac.isOpen === false && ac.nBtns === 0;
      if (!closeOk) bad.push('閉じたあと isOpen=' + ac.isOpen + ' 残ったボタン ' + ac.nBtns + ' 個');
      const ok = bad.length === 0;
      return [ok,
        'viewport ' + x.viewport.width + 'x' + x.viewport.height + ' compact=' + x.compact
        + ' / 測った画面 ' + views.length + ' 枚 (' + views.map(v => v.tag + ':' + v.nBtns + 'btn').join(' ') + ')'
        + ' / 器の高さ = ' + views.map(v => v.rect ? Math.round(v.rect.h) : '—').join(' , ') + 'px'
        + ' / 閉じたあと isOpen=' + ac.isOpen + ' ボタン ' + ac.nBtns + ' 個'
        + (ok ? '' : '  ⛔ ' + bad.join(' ; '))];
    }],

  // ── §2 潜行側 (index.html) — 項目 3 が実装 ───────────────────────────────
  ['2a', '消費 — roadBattle が **removeItem** され、waves が 1 件の ad-hoc シナリオが立つ。'
    + '⭐ scenarioId は "road-ambush" 固定 / テーマは積荷の themeId / 盤面 (spawns・wagonSpawns) が'
    + '素通しされ、**馬車が実際に湧いている** (⛔ ペイロードの件数で代用しない —— 素通ししても'
    + ' spawnWagon が落ちれば 0 体になる)。⭐ 積荷は **world.html が実際に書いた bytes** をそのまま使う',
    (m) => {
      const L = legOf(m, 'idxAmbush');
      if (!m.realBattle) return popFail('(2a) 積荷', '歩行で書かれた roadBattle の実物が採れていない');
      if (!L || !L.boot) return popFail('(2a) 潜行側の起動', 'index.html を開けていない');
      let payload = null;
      try { payload = JSON.parse(m.realBattle); } catch (e) { payload = null; }
      if (!payload) return popFail('(2a) 積荷', 'roadBattle の JSON を解けない');
      const b = L.boot, sc = b.scen || {};
      const consumed = b.store.battle === null;
      const idOk = b.scenarioId === 'road-ambush';
      const runOk = b.ambushRun === true;
      const waveOk = sc.waves === 1;
      const fieldOk = sc.wagons >= 1 && sc.spawns >= 1;
      const themeOk = b.theme === payload.themeId;
      const wagonOk = typeof b.wagons === 'number' && b.wagons >= 1;
      const xpOk = sc.clearXp === (payload.clearXp || 0);
      const ok = consumed && idOk && runOk && waveOk && fieldOk && themeOk && wagonOk && xpOk;
      return [ok,
        '積荷 (world.html が書いた実物) = ' + m.realBattle.slice(0, 120)
        + ' / 起動後の roadBattle = ' + JSON.stringify(b.store.battle) + '(消えた=' + consumed + ')'
        + ' / scenarioId = ' + JSON.stringify(b.scenarioId)
        + ' roadAmbushRun = ' + JSON.stringify(b.ambushRun)
        + ' / themeId = ' + JSON.stringify(b.theme) + '(積荷と一致=' + themeOk + ')'
        + ' / currentScenario = ' + JSON.stringify(sc)
        + ' / 実際に湧いた馬車 = ' + b.wagons + ' 体'
        + (ok ? '' : '  ⛔ '
          + (!consumed ? 'roadBattle が消えていない (2 回目の潜行でも襲撃が立つ) ' : '')
          + (!idOk ? 'scenarioId が "road-ambush" でない ' : '')
          + (!runOk ? 'roadAmbushRun が真になっていない ' : '')
          + (!waveOk ? 'waves が 1 件でない ' : '')
          + (!fieldOk ? '盤面 (spawns / wagonSpawns) が素通しされていない ' : '')
          + (!themeOk ? 'テーマが積荷の themeId になっていない ' : '')
          + (!wagonOk ? '馬車が 1 体も湧いていない ' : '')
          + (!xpOk ? 'clearXp が素通しされていない' : ''))];
    }],

  ['2b', '本命が汚れない — 走行の **前も後も** currentScenario / generatedScenario が'
    + '仕込んだ値と **1 バイトも違わない** (⭐ 罠 F。酒場が焼いた本命のクエストを襲撃で上書きすると、'
    + '次にクエスト地へ入場したとき襲撃シナリオが起動する。変異 overwritescen)',
    (m) => {
      const L = legOf(m, 'idxAmbush');
      if (!L || !L.boot) return popFail('(2b) 潜行側の起動', 'index.html を開けていない');
      if (L.boot.ambushRun !== true) {
        return popFail('(2b) 襲撃の腕', 'roadAmbushRun が真でない = 襲撃として起動していない');
      }
      const bootOk = L.boot.store.scen === MAIN_SCEN && L.boot.store.gen === MAIN_GEN;
      const a = L.after;
      const afterOk = !!(a && a.store.scen === MAIN_SCEN && a.store.gen === MAIN_GEN);
      const ok = bootOk && afterOk;
      return [ok,
        '仕込み currentScenario = ' + JSON.stringify(MAIN_SCEN)
        + ' / generatedScenario = ' + MAIN_GEN.length + 'B'
        + ' / 起動直後 = ' + JSON.stringify(L.boot.store.scen)
        + ' + ' + JSON.stringify(String(L.boot.store.gen || '').length + 'B') + '(一致=' + bootOk + ')'
        + ' / showResult 後 = ' + JSON.stringify(a ? a.store.scen : null)
        + ' + ' + JSON.stringify(String((a && a.store.gen) || '').length + 'B') + '(一致=' + afterOk + ')'
        + (ok ? '' : '  ⛔ 街道の襲撃が本命のクエストを書き換えた')];
    }],

  ['2c', '消耗の往復 — 勝利後に roadWounds が書かれ、**次の起動でその比率どおりの hp** で始まる。'
    + '⭐ 2 経路で突き合わせる: ①showResult(true) が書いた JSON の比率 と ②次の起動の'
    + ' 実際の hp/maxHp。⛔ 対照 (roadWounds なし) では全員 hp = maxHp であることも AND'
    + ' (変異 woundtoolate = 適用を consumeRoadBoon の後へ動かすと ①だけ緑になる)',
    (m) => {
      const w = legOf(m, 'idxAmbush'), r = legOf(m, 'idxWoundRead'), c = legOf(m, 'idxPlain');
      if (!w || !w.after) return popFail('(2c) 書き出しの腕', '勝利の showResult を走らせていない');
      if (!w.hpApplied) return popFail('(2c) 消耗そのもの', 'このランで hp を削れていない');
      const raw = w.after.store.wounds;
      if (!raw) {
        return [false, '⛔ 勝利しても roadWounds が書かれていない (store = '
          + JSON.stringify(w.after.store.wounds) + ')'];
      }
      let J = null;
      try { J = JSON.parse(raw); } catch (e) { J = null; }
      if (!J || !Array.isArray(J.hp)) return [false, '⛔ roadWounds が解けない: ' + String(raw).slice(0, 80)];
      const madeRatios = ratiosOf(w.hpApplied) || [];
      const nOk = J.n === madeRatios.length && J.hp.length === madeRatios.length;
      const writeOk = nOk && J.hp.every((v, i) => Math.abs(v - madeRatios[i]) <= WOUND_TOL);
      if (!r || !r.boot) return popFail('(2c) 読み込みの腕', '次の起動を走らせていない');
      const got = ratiosOf(r.boot) || [];
      const readOk = got.length === J.hp.length
        && got.every((v, i) => typeof v === 'number' && Math.abs(v - J.hp[i]) <= WOUND_TOL);
      const ctrl = c ? (ratiosOf(c.boot) || []) : [];
      const ctrlOk = ctrl.length >= 1 && ctrl.every(v => v === 1);
      const consumed = r.boot.store.wounds === null;
      const ok = writeOk && readOk && ctrlOk && consumed;
      return [ok,
        '① このランで削った比率 = ' + JSON.stringify(madeRatios.map(v => +v.toFixed(3)))
        + ' → 書かれた JSON = ' + raw
        + ' (n 一致=' + nOk + ' / 比率一致=' + writeOk + ')'
        + '  ② 次の起動の hp/maxHp = ' + JSON.stringify(got.map(v => (typeof v === 'number' ? +v.toFixed(3) : v)))
        + ' (一致=' + readOk + ' / 許容 ±' + WOUND_TOL + ')'
        + ' / 起動後に roadWounds が消えた=' + consumed
        + '  ③ 対照 (roadWounds なし) = ' + JSON.stringify(ctrl) + ' (全員 1 = ' + ctrlOk + ')'
        + (ok ? '' : '  ⛔ '
          + (!writeOk ? '書かれた比率がこのランの消耗と合わない ' : '')
          + (!readOk ? '次の起動の hp が比率どおりでない ' : '')
          + (!consumed ? 'roadWounds が消費されていない (毎回の潜行で傷が復活する) ' : '')
          + (!ctrlOk ? '対照が hp = maxHp になっていない (母集団が壊れている)' : ''))];
    }],

  ['2d', '下限 — 比率 **0** を注入しても hp は **1 以上**。⭐ 同時に「1 未満へ落ちていない」だけでなく'
    + '「ちゃんと減っている (hp < maxHp)」も見る (⛔ クランプを maxHp 側へ倒して緑にする逃げ道を塞ぐ。'
    + '変異 woundzero)',
    (m) => {
      const L = legOf(m, 'idxWoundZero');
      if (!L || !L.boot) return popFail('(2d) 下限の腕', 'index.html を開けていない');
      const v = L.boot;
      const units = [{ hp: v.hp, maxHp: v.maxHp }].concat(v.allies || []);
      if (units.length < 2) return popFail('(2d) 編成', '人数が ' + units.length + ' 人 (期待 >= 2)');
      const aliveOk = units.every(u => typeof u.hp === 'number' && u.hp >= 1);
      const hurtOk = units.every(u => typeof u.maxHp === 'number' && u.maxHp > 1 && u.hp < u.maxHp);
      const consumed = v.store.wounds === null;
      const ok = aliveOk && hurtOk && consumed;
      return [ok,
        '注入 = 比率 0 x ' + units.length + ' 人 / 起動後の hp/maxHp = '
        + JSON.stringify(units.map(u => u.hp + '/' + u.maxHp))
        + ' (全員 >= 1 = ' + aliveOk + ' / 全員 < maxHp = ' + hurtOk + ')'
        + ' / roadWounds 消費済み=' + consumed
        + (ok ? '' : '  ⛔ '
          + (!aliveOk ? 'hp が 0 以下 = 次の潜行が開始即死になる ' : '')
          + (!hurtOk ? '比率 0 なのに減っていない (消耗が 1 も適用されていない) ' : '')
          + (!consumed ? 'roadWounds が消えていない' : ''))];
    }],

  ['2e', '人数不一致は丸ごと捨てる — n を偽装すると消耗が **1 も適用されない** (全員 hp = maxHp)。'
    + '⭐ 母集団 = 同じ比率 (0) で n が正しければ (2d) の腕が実際に減っていること'
    + ' (⛔ 「減らなかった」だけでは「そもそも消費経路が死んでいる」と区別がつかない。変異 woundpartial)',
    (m) => {
      const bad = legOf(m, 'idxWoundBadN'), good = legOf(m, 'idxWoundZero');
      if (!good || !good.boot) return popFail('(2e) 対照', 'n が正しい腕を走らせていない');
      const gu = [{ hp: good.boot.hp, maxHp: good.boot.maxHp }].concat(good.boot.allies || []);
      if (!gu.every(u => u.hp < u.maxHp)) {
        return popFail('(2e) 対照の消耗', 'n が正しい腕でも hp が減っていない = 消費経路が死んでいる');
      }
      if (!bad || !bad.boot) return popFail('(2e) 偽装の腕', 'index.html を開けていない');
      const v = bad.boot;
      const units = [{ hp: v.hp, maxHp: v.maxHp }].concat(v.allies || []);
      const intactOk = units.every(u => u.hp === u.maxHp);
      const ok = intactOk;
      return [ok,
        '対照 (n = 実人数 / 比率 0) = ' + JSON.stringify(gu.map(u => u.hp + '/' + u.maxHp))
        + '  ⇄  偽装 (n を実人数と食い違わせる / 比率 0) = '
        + JSON.stringify(units.map(u => u.hp + '/' + u.maxHp))
        + ' (全員 hp = maxHp = ' + intactOk + ')'
        + ' / 偽装した JSON = ' + JSON.stringify(bad.seeded.wounds)
        + (ok ? '' : '  ⛔ 人数が食い違うのに先頭から部分適用している')];
    }],

  ['2f', '馬車全損で金貨が 0 — 馬車を殺して勝つと **clearGold 分が入らない**。'
    + '⭐ 2 本立て: 守り切った腕は coins + clearGold / 全損の腕は coins ちょうど'
    + ' (⛔ 片方だけ見ない。変異 goldalways)',
    (m) => {
      const alive = legOf(m, 'idxAmbush'), lost = legOf(m, 'idxWagonLost');
      if (!alive || !alive.after) return popFail('(2f) 守り切った腕', '勝利の showResult を走らせていない');
      if (!lost || !lost.after) return popFail('(2f) 全損の腕', '勝利の showResult を走らせていない');
      const gold = (alive.boot.scen || {}).clearGold || 0;
      if (!(gold > 0)) return popFail('(2f) clearGold', '積荷の clearGold が 0 = 差が出ようがない');
      if (!(alive.boot.wagons >= 1 && lost.boot.wagons >= 1)) {
        return popFail('(2f) 馬車', '盤面に馬車が湧いていない (alive ' + alive.boot.wagons
          + ' / lost ' + lost.boot.wagons + ')');
      }
      if (!(lost.killed && lost.killed.lost === true)) {
        return popFail('(2f) 全損', 'escortWagonLost() が真になっていない: ' + JSON.stringify(lost.killed));
      }
      const rA = rewardOf(alive.after), rL = rewardOf(lost.after);
      if (!rA || !rL) return popFail('(2f) lastResult', 'reward を読めない');
      const aliveOk = rA.gold === (alive.boot.coins || 0) + gold;
      const lostOk = rL.gold === (lost.boot.coins || 0);
      const gapOk = rA.gold > rL.gold;
      const ok = aliveOk && lostOk && gapOk;
      return [ok,
        '積荷の clearGold = ' + gold
        + ' / 守り切った (馬車 ' + alive.boot.wagons + ' 体・全損=' + alive.boot.wagonLost + ') gold = '
        + rA.gold + ' (拾った coins ' + alive.boot.coins + ' + clearGold ' + gold + ' = ' + aliveOk + ')'
        + ' / 全損 (殺した ' + lost.killed.n + ' 体) gold = ' + rL.gold
        + ' (拾った coins ' + lost.boot.coins + ' ちょうど = ' + lostOk + ')'
        + (ok ? '' : '  ⛔ '
          + (!aliveOk ? 'クリア報酬の金貨が入っていない ' : '')
          + (!lostOk ? '馬車を守れなかったのに金貨が入った ' : '')
          + (!gapOk ? '守っても守らなくても同額' : ''))];
    }],

  ['2g', '馬車全損で gameOver が立たない — 街道の襲撃は文だけ出して潜行を続ける。'
    + '⛔ 7.9-3 (闇市の隊商護衛) は **従来どおり敗北**する = **両方**測る。'
    + '⭐ 値の供給口 escortWagonLossEndsRun() を 2 つの腕で読み、'
    + '**その値が実際に敗北確定の枝で使われている**ことを配信バイトの局所性で確かめる'
    + ' (変異 gameoveramb / gameovernever)',
    (m) => {
      const amb = legOf(m, 'idxAmbush'), esc = legOf(m, 'idxEscort');
      if (!amb || !amb.boot || !esc || !esc.boot) {
        return popFail('(2g) 2 つの腕', '襲撃 / 7.9-3 のどちらかを走らせていない');
      }
      if (typeof amb.boot.endsRun !== 'boolean' || typeof esc.boot.endsRun !== 'boolean') {
        return [false, '⛔ escortWagonLossEndsRun() が本番に無い (襲撃側 = '
          + JSON.stringify(amb.boot.endsRun) + ' / 7.9-3 側 = ' + JSON.stringify(esc.boot.endsRun) + ')'];
      }
      if (!(amb.boot.wagons >= 1 && esc.boot.wagons >= 1)) {
        return popFail('(2g) 馬車', '盤面に馬車が湧いていない (襲撃 ' + amb.boot.wagons
          + ' / 7.9-3 ' + esc.boot.wagons + ') = 敗北条件そのものが立たない');
      }
      const ambOk = amb.boot.endsRun === false;
      const escOk = esc.boot.endsRun === true;
      /* ⭐ 呼ばれ口の証明 — 「隊商は失われた…」の直後の枝がこの関数を通っているか。
         ⛔ 値だけ見ていると、枝から呼び口を外す変異 (if (true) …) が素通りする。 */
      const src = (typeof m.servedIndex === 'string') ? m.servedIndex : '';
      /* ⚠⚠ アンカーは **呼び口の実体** (updateInfo の 1 行) にする。⛔ 文言だけで探すと
         14058 行目の注記コメント (「15285「隊商は失われた…」= 馬車全損での敗北」) に先に
         当たり、260B 先には枝が 1 つも無いので恒久的に赤くなる (2026-09-04 に実際に踏んだ)。 */
      const ANCHOR = 'updateInfo("隊商は失われた…");';
      const nAnchor = nOf(src, ANCHOR);
      const at = src.indexOf(ANCHOR);
      const near = at >= 0 ? src.slice(at, at + 260) : '';
      const nearOk = nAnchor === 1 && near.indexOf('escortWagonLossEndsRun()') >= 0
        && near.indexOf('gameOver = true;') >= 0;
      const nDef = nOf(src, 'function escortWagonLossEndsRun(');
      const defOk = nDef === 1;
      const ok = ambOk && escOk && nearOk && defOk;
      return [ok,
        '街道の襲撃 escortWagonLossEndsRun() = ' + amb.boot.endsRun + ' (期待 false / 馬車 '
        + amb.boot.wagons + ' 体)'
        + '  ⇄  7.9-3 隊商護衛 = ' + esc.boot.endsRun + ' (期待 true / 馬車 ' + esc.boot.wagons + ' 体)'
        + ' / 7.9-3 の scenarioId = ' + JSON.stringify(esc.boot.scenarioId)
        + ' / 敗北確定の枝が供給口を通っている = ' + nearOk
        + ' (定義 ' + nDef + ' 件 / 呼び口のアンカー ' + nAnchor + ' 件)'
        + (ok ? '' : '  ⛔ '
          + (!ambOk ? '街道の襲撃でも潜行が終わる ' : '')
          + (!escOk ? '7.9-3 の敗北条件が消えた ' : '')
          + (!nearOk ? '「隊商は失われた…」の直後の枝が escortWagonLossEndsRun() を通っていない '
            + '(実測 260B: ' + JSON.stringify(near.replace(/\s+/g, ' ').slice(0, 140)) + ') ' : '')
          + (!defOk ? '供給口の定義が ' + nDef + ' 件' : ''))];
    }],

  // ── §3 帰還 (world.html 単独で証明できる 3 本。(3c) は index 側なので項目 3) ──
  ['3a', '襲撃地点に戻る — roadReturn に **刻み点** (⭐ WM.has() が false = 罠 E がまさに落とす形) を'
    + '置いて world.html を開くと、__world.heroNode() がその刻み点になる。'
    + '⭐ 対照 (注入なし) / フォールバック (消費後) の **どちらとも違う**ことまで見る'
    + ' (⛔ 「たまたま同じ場所だった」を緑にしない。変異 nospawnresume)',
    (m) => {
      const r = m.resume;
      if (!r) return popFail('(3a) 帰還の観測', 'measureResume が値を返していない');
      const step = r.pick ? r.pick.step : null;
      if (!step) return popFail('(3a) 刻み点', '細分化グラフに刻み点が 1 つも無い');
      if (r.pick.hasNode !== false || r.pick.inWalk !== true) {
        return popFail('(3a) 刻み点の性質',
          'WM.has=' + r.pick.hasNode + ' walkNodes 内=' + r.pick.inWalk
          + ' — 罠 E が落とす形 (NODES に居ない / 細分化グラフには居る) になっていない');
      }
      const back = r.back || {}, ctrl = r.control || {}, again = r.again || {};
      const onStep = back.node === step;
      const diffCtrl = back.node !== ctrl.node;
      const diffFall = back.node !== again.node;
      const pxOk = !!(back.px && isFinite(back.px.x) && isFinite(back.px.y));
      const ok = onStep && diffCtrl && diffFall && pxOk;
      return [ok,
        '注入した刻み点 = ' + JSON.stringify(step) + ' (WM.has=' + r.pick.hasNode
        + ' / 細分化グラフ ' + r.pick.nWalk + ' 箇所 ⊃ NODES ' + r.pick.nNodes + ' 箇所)'
        + ' / 対照 (注入なし) = ' + JSON.stringify(ctrl.node)
        + ' / **帰還後** = ' + JSON.stringify(back.node) + ' (WM.has=' + back.hasNode + ')'
        + ' 座標 = ' + JSON.stringify(back.px)
        + ' / 消費後 (フォールバック) = ' + JSON.stringify(again.node)
        + ' / spawnVia = ' + JSON.stringify(back.spawnVia)
        + (ok ? '' : '  ⛔ '
          + (!onStep ? '襲撃地点に立っていない (罠 E = 港町へ化けている疑い) ' : '')
          + (!diffCtrl ? '対照と同じ場所なので注入が効いた証拠にならない ' : '')
          + (!diffFall ? 'フォールバックと同じ場所 ' : '')
          + (!pxOk ? '座標が引けていない (NODES から引いている疑い)' : ''))];
    }],

  ['3b', '一回性 — もう一度 world.html を開くと roadReturn は **空文字**で (⛔ removeItem ではない)、'
    + '立ち位置は従来の spawnFor へ戻る (変異 resumesticky)',
    (m) => {
      const r = m.resume;
      if (!r) return popFail('(3b) 帰還の観測', 'measureResume が値を返していない');
      const back = r.back || {}, again = r.again || {};
      const step = r.pick ? r.pick.step : null;
      if (back.node !== step) {
        return popFail('(3b) 帰還そのもの',
          '1 回目の帰還で刻み点に立てていない (heroNode=' + JSON.stringify(back.node) + ')'
          + ' — 「消費された」を測る前提が立たない');
      }
      const backStore = (back.store || {}).ret;
      const againStore = (again.store || {}).ret;
      const emptied = backStore === '';           /* ⭐ null ではなく空文字 = 罠 D の作法 */
      const stillEmpty = againStore === '';       /* 2 回目も書き戻していない */
      const notNull = backStore !== null && againStore !== null;
      const fellBack = again.node !== step;
      const fallbackOk = again.node === 'phlan';  /* ⭐ spawnFor の fail-safe へ戻っている */
      const ok = emptied && stillEmpty && notNull && fellBack && fallbackOk;
      return [ok,
        '帰還直後の roadReturn = ' + JSON.stringify(backStore)
        + ' / もう一度開いた後 = ' + JSON.stringify(againStore)
        + ' (⭐ どちらも null でない = removeItem ではなく空文字で消している)'
        + ' / 立ち位置 ' + JSON.stringify(back.node) + ' → ' + JSON.stringify(again.node)
        + ' (exitVia=dungeon / currentScenario=' + JSON.stringify(RESUME_SCEN)
        + ' は SITES に無いので spawnFor は phlan へ倒れる)'
        + (ok ? '' : '  ⛔ '
          + (!emptied ? '空文字で消えていない ' : '')
          + (!stillEmpty ? '2 回目に書き戻している ' : '')
          + (!notNull ? 'キーごと消えている (⛔ removeItem を使った疑い = 罠 D) ' : '')
          + (!fellBack ? '2 回目もまだ襲撃地点に立つ ' : '')
          + (!fallbackOk ? '従来の spawnFor の結果 (phlan) に戻っていない' : ''))];
    }],

  ['3c', '負けたら港町 — 襲撃で全滅すると roadWounds が **書かれず**、帰った先が **phlan**。'
    + '⭐⭐⭐ 対照を 2 本取る: ①勝っていれば立っていたはずの襲撃地点 (刻み点) と違う'
    + ' ②**もう一度開き直したときの spawnFor の答え**とも違う —— ⚠⚠⚠ 依頼書 §6-5 の'
    + '「キーを消せば spawnFor のフォールバックで港町へ戻る」は実測で崩れており'
    + ' (currentScenario は本命クエストのままなので SITES に当たって目的地の前に立つ)、'
    + '②はその実測をそのまま記録に残す (変異 woundonlose / nospawnresume)',
    (m) => {
      const r = m.defeat;
      if (!r) return popFail('(3c) 敗北の観測', 'measureDefeatReturn が値を返していない');
      if (!r.battleSeeded) return popFail('(3c) 積荷', 'roadBattle の実物が採れていない');
      const step = r.pick ? r.pick.step : null;
      const site = r.pick ? r.pick.site : null;
      if (!step || !site) {
        return popFail('(3c) 母集団', '刻み点 = ' + JSON.stringify(step)
          + ' / SITES[' + MAIN_SCEN + '] = ' + JSON.stringify(site));
      }
      if (!r.idxBoot || r.idxBoot.ambushRun !== true) {
        return popFail('(3c) 襲撃として起動', 'roadAmbushRun = '
          + JSON.stringify(r.idxBoot ? r.idxBoot.ambushRun : null));
      }
      if (r.resultCall !== 'ok') return popFail('(3c) 敗北', 'showResult(false) が走っていない: ' + r.resultCall);
      const noWounds = r.idxAfter && r.idxAfter.store.wounds === null;
      const back = r.back || {}, again = r.again || {};
      const homeOk = back.node === 'phlan';
      const notStep = back.node !== step;
      const notFallback = again.node === site && site !== 'phlan';
      const ok = !!noWounds && homeOk && notStep && notFallback;
      return [ok,
        '襲撃した刻み点 = ' + JSON.stringify(step)
        + ' / 敗北後の roadWounds = ' + JSON.stringify(r.idxAfter ? r.idxAfter.store.wounds : null)
        + '(書かれていない=' + noWounds + ')'
        + ' / roadReturn = ' + JSON.stringify(r.idxAfter ? r.idxAfter.store.ret : null)
        + ' / **帰った先** = ' + JSON.stringify(back.node) + ' (期待 phlan)'
        + ' / もう一度開き直すと = ' + JSON.stringify(again.node)
        + '  ⭐ = spawnFor("dungeon", ' + JSON.stringify(MAIN_SCEN) + ') = '
        + JSON.stringify(site) + ' ≠ phlan'
        + '  ⇒ 「キーを消すだけ」では港町へ戻らない (依頼書 §6-5 の前提が崩れている実測)'
        + (ok ? '' : '  ⛔ '
          + (!noWounds ? '負けたのに roadWounds を書いた ' : '')
          + (!homeOk ? '港町フランに戻っていない ' : '')
          + (!notStep ? '襲撃地点に立っている (負けの代償が消えている) ' : '')
          + (!notFallback ? '対照 (spawnFor の答え) が採れていない = 測定が成り立っていない' : ''))];
    }],

  ['3d', '依頼の目印が残る — 帰還のために立ち位置を差し替えても questDest を 1 バイトも消さない'
    + ' (⛔ world.html の removeItem は questDest の 1 本だけ = そこを増やさない)',
    (m) => {
      const r = m.resume;
      if (!r) return popFail('(3d) 帰還の観測', 'measureResume が値を返していない');
      const seeded = (r.seeded || {}).quest;
      if (seeded !== RESUME_QUEST) {
        return popFail('(3d) 目印の仕込み',
          'questDest を置けていない (' + JSON.stringify(seeded) + ')');
      }
      const back = r.back || {}, again = r.again || {};
      const storeOk = (back.store || {}).quest === RESUME_QUEST;
      const readOk = back.questDest === RESUME_QUEST;
      const stillOk = (again.store || {}).quest === RESUME_QUEST;
      const ok = storeOk && readOk && stillOk;
      return [ok,
        '仕込み = ' + JSON.stringify(seeded)
        + ' / 帰還後 storage = ' + JSON.stringify((back.store || {}).quest)
        + ' __world.questDest() = ' + JSON.stringify(back.questDest)
        + ' / もう一度開いた後 = ' + JSON.stringify((again.store || {}).quest)
        + (ok ? '' : '  ⛔ 帰還の処理が依頼の目印を巻き添えにした')];
    }],

  ['4a', '既存の引きが不変 (本検査) — (0d) と **同じ固定基準列**を、本実装が全部入った木で'
    + 'もう一度突き合わせる。⭐⭐⭐ 罠 B (依頼書 §2-4) の本番。'
    + '⛔ (0d) と同じ関数を通す = 片方だけ緩める逃げ道を作らない (変異 sharedrng)',
    (m) => {
      const r = rndIdentity(m);
      if (typeof r[1] === 'string') return r;
      const d = r[1];
      return [r[0],
        d.det.join(' | ')
        + ' / world.html の rnd 呼び出し = ' + d.worldRnd + ' 件 (着手前 ' + BASE_WORLD_RND + ' 件)'
        + '  [記録] 挟み込みで ambRoll を呼べた合計 ' + d.calls + ' 回'
        + (d.calls === 0 ? '  ⚠⚠ 0 回 = 挟み込みレグが罠 B を 1 度も測っていない'
          + ' ((0a) が緑なのにここが 0 なら装置の故障)' : '')
        + (r[0] ? '' : '  ⛔ 街道の襲撃を入れたことで既存の乱数列が動いた')];
    }],

  ['4b', 'world.html の storage の数 — 配信バイトの sessionStorage.removeItem が **依然 ' + BASE_WORLD_SREMOVE
    + ' 件**・localStorage は setItem / removeItem とも 0 件。'
    + '⭐ 罠 D (依頼書 §2-6) の番人 —— roadReturn の消費に removeItem を使うと即赤になる'
    + ' (⛔ 基準値を緩めない。変異 worldremove)。⚠ index.html 側は removeItem を使ってよい'
    + ' = 制約は world.html だけ、を明示的に記録する',
    (m) => {
      if (typeof m.served !== 'string' || !m.served.length) {
        return popFail('(4b) 配信バイト', 'world.html を読めていない');
      }
      const rm = nOf(m.served, 'sessionStorage.removeItem');
      const lset = nOf(m.served, 'localStorage.setItem');
      const lrm = nOf(m.served, 'localStorage.removeItem');
      const ok = rm === BASE_WORLD_SREMOVE && lset === BASE_WORLD_LSET && lrm === BASE_WORLD_LREMOVE;
      /* ⭐ 記録のみ — index.html 側の removeItem は制約の外 (⛔ 判定しない)。 */
      const idxRm = (typeof m.servedIndex === 'string')
        ? nOf(m.servedIndex, 'removeItem("dragonfighters.roadBattle")') : -1;
      return [ok,
        'world.html 配信 ' + m.served.length + 'B / sessionStorage.removeItem = ' + rm
        + ' 件 (着手前 ' + BASE_WORLD_SREMOVE + ')'
        + ' / localStorage.setItem = ' + lset + ' 件 (着手前 ' + BASE_WORLD_LSET + ')'
        + ' / localStorage.removeItem = ' + lrm + ' 件 (着手前 ' + BASE_WORLD_LREMOVE + ')'
        + '  [記録・⛔判定しない] index.html の roadBattle removeItem = ' + idxRm + ' 件'
        + ' (index 側は removeItem を使ってよい = 制約は world.html だけ)'
        + (ok ? '' : '  ⛔ world.html の storage の使い方が着手前と変わった (罠 D)')];
    }],

  // ── §4 恒等 (このうち (4c) だけが項目 2 の担当) ───────────────────────────
  ['4c', '既存 6 件が同じ — EVENTS の [id, terrain] の並びと、停留所の地形の分布が'
    + '**着手前の固定表**と一致する。⭐ AMBUSH を EVENTS へ push する罠 A (変異 intoevents) は'
    + '7 件目が生えるので、件数を直書きしなくても並びの不一致で捕まる',
    (m) => {
      const b = m.boot;
      if (!b) return popFail('(4c) 起動', 'measureBoot が値を返していない');
      const rows = b.eventRows;
      if (!Array.isArray(rows)) return popFail('(4c) EVENTS', 'ROAD_EVENTS.EVENTS を読めていない');
      const got = JSON.stringify(rows), wantRows = JSON.stringify(BASE_EVENT_ROWS);
      const rowsOk = got === wantRows;
      const hist = b.stopTerrain;
      if (!hist) return popFail('(4c) 地形割り', 'ROAD_EVENTS.stops / terrainOf を読めていない');
      const keys = Object.keys(BASE_STOP_TERRAIN).sort();
      const gotKeys = Object.keys(hist).sort();
      const histOk = JSON.stringify(gotKeys) === JSON.stringify(keys)
        && keys.every(k => hist[k] === BASE_STOP_TERRAIN[k]);
      const nStops = Object.keys(hist).reduce((s, k) => s + hist[k], 0);
      const ok = rowsOk && histOk;
      return [ok,
        'EVENTS ' + rows.length + ' 件 = ' + (rowsOk ? '着手前と一致' : '⛔ 不一致')
        + (rowsOk ? '' : '\n           実測 ' + got + '\n           基準 ' + wantRows)
        + ' / 地形割り ' + JSON.stringify(hist) + ' 計 ' + nStops + ' 箇所 = '
        + (histOk ? '着手前と一致' : '⛔ 不一致 (基準 ' + JSON.stringify(BASE_STOP_TERRAIN) + ')')];
    }],

  // ── §5 撤退 ?ambush=0 (⚠⚠⚠ 撤退アームだけを受入条件にしない = #39 の「永久緑」の轍) ──
  ['5a', 'world.html' + RETREAT_QUERY + ' → 襲撃が **0 件**・storage に 0 バイト。'
    + '⭐ 母集団 = 同じ種を素で歩けば発火すること。'
    + '⭐⭐ 「既存の出来事は従来どおり出る」は **恒等**で測る —— 襲撃が元から出ない種で'
    + '素の腕と撤退の腕を歩かせ、到着列と街道の出来事の件数が **完全に一致**すること'
    + ' (⛔ 「0 件でなければよい」では、撤退が既存の出来事まで消しても気づけない)',
    (m) => {
      const base = legOf(m, 'fireNone'), off = legOf(m, 'retreatFire');
      const q0 = legOf(m, 'quiet'), q1 = legOf(m, 'retreatQuiet');
      if (!base || base.ambushOpens < 1) {
        return popFail('(5a) 対照', '素の腕 (同じ種) で襲撃が発火していない');
      }
      if (!off) return popFail('(5a) 撤退の腕', '走っていない');
      const walked = (off.arrivals || []).length;
      if (walked < 2) {
        return popFail('(5a) 撤退の歩行', '到着 ' + walked + ' 件 (期待 >= 2) — 停留所を踏んでいない');
      }
      const dirty = dirtyKeys(off.storagePost);
      const preDirty = dirtyKeys(off.storagePre);
      const quietOk = !!(q0 && q1
        && JSON.stringify(q0.arrivals) === JSON.stringify(q1.arrivals)
        && q0.roadOpens === q1.roadOpens && q1.ambushOpens === 0);
      const ok = off.ambushOpens === 0 && dirty.length === 0 && preDirty.length === 0 && quietOk;
      return [ok,
        '素 (種 ' + base.seed + ') 襲撃 ' + base.ambushOpens + ' 件'
        + '  ⇄  ' + RETREAT_QUERY + ' (種 ' + off.seed + ') 襲撃 ' + off.ambushOpens + ' 件'
        + ' / 到着 ' + walked + ' 件 / 生えたキー = ' + JSON.stringify(dirty)
        + ' (走行前 ' + JSON.stringify(preDirty) + ')'
        + '  / 恒等: 出ない種 ' + (q0 ? q0.seed : '—') + ' → ' + (q0 ? q0.dest : '—')
        + ' 素 [到着 ' + (q0 ? q0.arrivals.length : '—') + ' / 出来事 ' + (q0 ? q0.roadOpens : '—') + ']'
        + ' ⇄ 撤退 [到着 ' + (q1 ? q1.arrivals.length : '—') + ' / 出来事 ' + (q1 ? q1.roadOpens : '—') + ']'
        + ' 一致=' + quietOk
        + (ok ? '' : '  ⛔ '
          + (off.ambushOpens ? '撤退したのに襲撃が出た ' : '')
          + (dirty.length ? '撤退したのにキーが生えた ' : '')
          + (!quietOk ? '撤退が既存の街道の出来事まで変えた (到着列 or 件数が素と違う)' : ''))];
    }],

  ['5b', 'index.html' + RETREAT_QUERY + ' → roadBattle を注入しても **通常の潜行**が立つ。'
    + '⛔ キーを消しもしない (撤退を解けば元どおり襲撃が立つ) / roadWounds も読まない。'
    + '⚠ 判定は 2 ページで独立 (world.html は index へクエリを足さないので、この腕は'
    + '「URL に直接付けたとき」だけの話 = #47 ?roadboon=0 と同じ作法)',
    (m) => {
      const L = legOf(m, 'idxRetreat');
      if (!L || !L.boot) return popFail('(5b) 撤退の腕', 'index.html を開けていない');
      if (!m.realBattle) return popFail('(5b) 積荷', 'roadBattle の実物が採れていない');
      const ctrl = legOf(m, 'idxAmbush');
      if (!ctrl || !ctrl.boot || ctrl.boot.ambushRun !== true) {
        return popFail('(5b) 対照', '素の腕で襲撃シナリオが立っていない');
      }
      const b = L.boot;
      const offOk = b.ambushOn === false && b.ambushRun === false;
      const idOk = b.scenarioId === 'goblin-mine';
      const keptBattle = b.store.battle === m.realBattle;
      const keptWounds = b.store.wounds !== null;
      const units = [{ hp: b.hp, maxHp: b.maxHp }].concat(b.allies || []);
      const intact = units.length >= 2 && units.every(u => u.hp === u.maxHp);
      const ok = offOk && idOk && keptBattle && keptWounds && intact;
      return [ok,
        'ROAD_AMBUSH_ON = ' + JSON.stringify(b.ambushOn) + ' / roadAmbushRun = ' + JSON.stringify(b.ambushRun)
        + ' / scenarioId = ' + JSON.stringify(b.scenarioId) + ' (期待 goblin-mine)'
        + ' [対照: 撤退なしでは ' + JSON.stringify(ctrl.boot.scenarioId) + ']'
        + ' / roadBattle が残っている = ' + keptBattle
        + ' / roadWounds が残っている = ' + keptWounds
        + ' (' + JSON.stringify(b.store.wounds) + ')'
        + ' / hp = ' + JSON.stringify(units.map(u => u.hp + '/' + u.maxHp)) + ' (無傷=' + intact + ')'
        + (ok ? '' : '  ⛔ '
          + (!offOk ? '撤退スイッチが効いていない ' : '')
          + (!idOk ? '通常の潜行が立っていない ' : '')
          + (!keptBattle ? 'roadBattle を消した (撤退中は読みも消しもしない、が規律) ' : '')
          + (!keptWounds ? 'roadWounds を消した ' : '')
          + (!intact ? '撤退中なのに消耗が適用された' : ''))];
    }],

  // ══ #52 街道の卓上マップ ══════════════════════════════════════════════════
  // ── §6 絵が実際に出ている ────────────────────────────────────────────────
  ['6a', '[#52] 焼き上がりが配信されている — ' + JPG_PATH + ' が 200 で返り、寸法が'
    + ' **マスクの桁数 x 行数の整数倍**で縦横とも同じ倍率'
    + ' (⭐ 台帳 (make_grid_map.py) の数値を写経せず、配信物とマスクだけで締める)',
    (m) => {
      const j = m.jpg;
      if (!j) return [false, 'JPEG を取得していない (レグが走っていない)'];
      if (j.status !== 200) return [false, 'status = ' + j.status + ' ⛔ 焼き上がりが配信されていない'];
      if (!j.size) return [false, 'JPEG として読めない (' + j.bytes + ' bytes)'];
      const mk = maskOf(m);
      if (!mk.ok) return [false, 'マスクが採れないので倍率を検算できない: ' + mk.why];
      const kx = j.size.w / mk.cols, ky = j.size.h / mk.rows.length;
      const ok = Number.isInteger(kx) && Number.isInteger(ky) && kx === ky && kx >= 32;
      return [ok, j.size.w + 'x' + j.size.h + ' / マスク ' + mk.cols + 'x' + mk.rows.length
        + ' → 1 マス ' + kx + 'x' + ky + 'px (' + j.bytes + ' bytes)'
        + (ok ? '' : '  ⛔ 焼き上がりがマスクの整数倍になっていない')];
    }],

  ['6b', '[#52] 貼られている — 街道の襲撃で 1 枚絵が **ちょうど 1 枚**積まれ、貼り先の rect が'
    + ' カタログの tileBounds と**同じ値** / painting は theme+key の参照 (⛔ src の焼き込みでない) /'
    + ' ゲートを 1 つも宣言していない (1 部屋完結)',
    (m) => {
      const b = boardOf(m);
      if (!b) return popFail('(6b) 盤面の観測', 'board レグが走っていない');
      const cat = b.catalog;
      const ps = Array.isArray(b.paintings) ? b.paintings : [];
      const one = ps.length === 1;
      const p = ps[0] || {};
      const rectOfPaint = one ? [p.ty, p.tx, p.ty + p.th - 1, p.tx + p.tw - 1] : null;
      const bounds = cat && Array.isArray(cat.bounds) ? cat.bounds : null;
      const same = !!(rectOfPaint && bounds && rectOfPaint.join(',') === bounds.join(','));
      const rectSame = !!(Array.isArray(b.rect) && bounds && b.rect.join(',') === bounds.join(','));
      const byRef = !!(b.painting && b.painting.theme && b.painting.key);
      const noGate = !!(cat && Array.isArray(cat.gates) && cat.gates.length === 0);
      const ok = one && same && rectSame && byRef && noGate;
      return [ok,
        '絵 ' + ps.length + ' 枚 / 貼り先 rect = ' + JSON.stringify(rectOfPaint)
        + ' / tileBounds = ' + JSON.stringify(bounds) + ' / rooms[0].rect = ' + JSON.stringify(b.rect)
        + ' / painting = ' + JSON.stringify(b.painting)
        + ' / gates = ' + JSON.stringify(cat ? cat.gates : null)
        + ' / src = ' + JSON.stringify(ps.map(x => x.src))
        + (ok ? '' : '  ⛔ '
          + (!one ? '絵が 1 枚ではない ' : '')
          + (!same ? '貼り先の rect が tileBounds と違う ' : '')
          + (!rectSame ? 'rooms[0].rect が tileBounds と違う (縦横比が食い違う) ' : '')
          + (!byRef ? 'painting が theme+key の参照になっていない ' : '')
          + (!noGate ? 'gates を宣言している (1 部屋完結なのに出口が出る)' : ''))];
    }],

  ['6c', '[#52] ⭐⭐⭐ **罠 A の本検査** — MAPDEF.isCustom === true'
    + ' (⛔ false なら絵は 1 枚も出ない。屋外テーマ x カスタム幾何は resolve() 規則④で排他)',
    (m) => {
      const b = boardOf(m);
      if (!b) return popFail('(6c) 盤面の観測', 'board レグが走っていない');
      const ok = b.isCustom === true;
      return [ok, 'isCustom = ' + JSON.stringify(b.isCustom) + ' / mapDef.id = ' + JSON.stringify(b.mapdefId)
        + ' / themeId = ' + JSON.stringify(b.theme) + ' / scenarioId = ' + JSON.stringify(b.scenarioId)
        + (ok ? '' : '  ⛔ カスタム幾何として採用されていない = 絵も情景の停止も効いていない')];
    }],

  ['6d', '[#52] 空と丘が描かれていない — FIELD_MODE === false かつ 帯マスク false'
    + ' (= themeId が屋外テーマでない)',
    (m) => {
      const b = boardOf(m);
      if (!b) return popFail('(6d) 盤面の観測', 'board レグが走っていない');
      const ok = b.fieldMode === false && b.isFieldTheme === false && b.bandMask === false;
      return [ok, 'FIELD_MODE = ' + JSON.stringify(b.fieldMode)
        + ' / IS_FIELD_THEME = ' + JSON.stringify(b.isFieldTheme)
        + ' / bandMask = ' + JSON.stringify(b.bandMask) + ' / themeId = ' + JSON.stringify(b.theme)
        + (ok ? '' : '  ⛔ 屋外の地平線レンダラが生きている = カスタム幾何の上に空と丘が乗る')];
    }],

  // ── §7 マスクが通っている ───────────────────────────────────────────────
  //   ⚠⚠⚠ (7a)〜(7d) はすべて (7e) を **AND で内包**する。母集団 (マスクそのもの) が
  //     立っていないと「1 つも無い」型の assert は自明に真になる (#51 (0b) の轍)。
  ['7a', '[#52] 街道が東西に貫通している — 外周 1 タイルを除いた内側が **1 マスも塞がっていない行**が'
    + ' 少なくとも 1 行ある (⭐ 何行目かは縛らない = 街道の位置は好みで動かせる)',
    (m) => {
      const gd = guardMask(m, '(7a)');
      if (gd) return gd;
      const b = boardOf(m), G = b.geo;
      const ok = Array.isArray(G.unbroken) && G.unbroken.length >= 1;
      return [ok, '通し行 (絵ローカルの行番号) = ' + JSON.stringify(G.unbroken)
        + ' / 歩けるマス ' + G.open
        + (ok ? '' : '  ⛔ 端から端まで切れずに歩ける行が 1 行も無い = 街道が途切れている')];
    }],

  ['7b', '[#52] 橋が唯一の渡り — 素の盤面は **ひとつながり**で、マスクから導いた「障壁の列で'
    + '開いているマス」(= 渡り) を塞ぐと **2 つ以上に割れる**'
    + ' (⭐ 橋の座標はドライバに書かず、塞がれた割合の高い列から導出する)',
    (m) => {
      const gd = guardMask(m, '(7b)');
      if (gd) return gd;
      const b = boardOf(m), G = b.geo;
      const one = Array.isArray(G.comps) && G.comps.length === 1;
      const has = Array.isArray(G.crossing) && G.crossing.length >= 1;
      const split = Array.isArray(G.compsNoBridge) && G.compsNoBridge.length >= 2;
      const ok = one && has && split;
      return [ok, '素の連結成分 = ' + JSON.stringify(G.comps)
        + ' / 障壁の列 = ' + JSON.stringify(G.barrierCols)
        + ' / 渡り ' + (G.crossing || []).length + ' マス ' + JSON.stringify(G.crossing)
        + ' → 塞ぐと ' + JSON.stringify(G.compsNoBridge)
        + (ok ? '' : '  ⛔ '
          + (!one ? '素の盤面が最初から分断されている ' : '')
          + (!has ? '渡りが 1 マスも無い (母集団ゼロ) ' : '')
          + (!split ? '渡りを塞いでも割れない = 別の道がある' : ''))];
    }],

  ['7c', '[#52] 孤立ゼロ — 歩けるマスが全部、起点から 4 近傍で到達可能。かつ **外周封鎖が'
    + '効いている** (sealRing が 1 マス以上塞いでいる = 絵のフェザー帯を歩けない)',
    (m) => {
      const gd = guardMask(m, '(7c)');
      if (gd) return gd;
      const b = boardOf(m), G = b.geo;
      const pb = b.probe || {};
      const reach = G.reachable === G.open;
      const sealed = (pb.ring || 0) > 0;
      const ok = reach && sealed;
      return [ok, '歩けるマス ' + G.open + ' / 起点から到達 ' + G.reachable
        + ' / sealRing が塞いだ外周 ' + pb.ring + ' マス (出口として除外 ' + pb.skipGate + ')'
        + ' / 外周で歩けるマス ' + G.ringOpen
        + (ok ? '' : '  ⛔ '
          + (!reach ? '到達できない歩けるマスがある (孤立) ' : '')
          + (!sealed ? '外周が 1 マスも塞がれていない (sealRing が効いていない)' : ''))];
    }],

  ['7d', '[#52] マスクの外周に `#` が無い — 外周を塞ぐのは sealRing の仕事'
    + ' (絵の外周 1 タイルは描画のフェザー帯)',
    (m) => {
      const gd = guardMask(m, '(7d)');
      if (gd) return gd;
      const mk = maskOf(m);
      const bad = [];
      for (let c = 0; c < mk.cols; c++) {
        if (mk.rows[0].charAt(c) === '#') bad.push([c, 0]);
        if (mk.rows[mk.rows.length - 1].charAt(c) === '#') bad.push([c, mk.rows.length - 1]);
      }
      for (let r = 0; r < mk.rows.length; r++) {
        if (mk.rows[r].charAt(0) === '#') bad.push([0, r]);
        if (mk.rows[r].charAt(mk.cols - 1) === '#') bad.push([mk.cols - 1, r]);
      }
      return [bad.length === 0, '外周の `#` = ' + bad.length + ' 件 ' + JSON.stringify(bad.slice(0, 8))
        + (bad.length ? '  ⛔ 外周は sealRing が塞ぐ (マスクで塞ぐと二重管理になる)' : '')];
    }],

  ['7e', '[#52] ⭐ 寸法一致 (母集団そのもの) — blocked の行数と各行の桁数が tileBounds の'
    + ' 高さ・幅と厳密に一致し、DFMapDef がマスクを **捨てていない**'
    + '  ⚠⚠⚠ ここが赤なら (7a)〜(7d) は自明に真になるので、4 本ともこれを AND で内包している',
    (m) => {
      const b = boardOf(m);
      if (!b) return popFail('(7e) 盤面の観測', 'board レグが走っていない');
      const mk = maskOf(m);
      const cat = b.catalog || {};
      const bounds = Array.isArray(cat.bounds) ? cat.bounds : null;
      const th = bounds ? (bounds[2] - bounds[0] + 1) : null;
      const tw = bounds ? (bounds[3] - bounds[1] + 1) : null;
      const dimOk = !!(mk.ok && th === mk.rows.length && tw === mk.cols);
      const applied = !!(b.probe && b.probe.applied > 0);
      const ok = dimOk && !cat.err && applied;
      return [ok, 'blocked = ' + (mk.ok ? (mk.rows.length + ' 行 x ' + mk.cols + ' 桁') : ('採れない: ' + mk.why))
        + ' / tileBounds = ' + JSON.stringify(bounds) + ' (' + th + ' 行 x ' + tw + ' 桁)'
        + ' / DFMapDef の error = ' + JSON.stringify(cat.err)
        + ' / 実際に塞いだマス = ' + (b.probe ? b.probe.applied : null)
        + (ok ? '' : '  ⛔ '
          + (!dimOk ? '寸法が食い違う (マスクは丸ごと捨てられる) ' : '')
          + (cat.err ? 'DFMapDef がマスクを捨てた ' : '')
          + (!applied ? 'マスクが 1 マスも塞いでいない' : ''))];
    }],

  // ── §9 恒等 (非退行) ────────────────────────────────────────────────────
  ['9a', '[#52] ⭐⭐⭐ 7.9-3「隊商護衛」が無傷 — **#52 適用前の木 (c0a9134) で採った固定値**と'
    + '一致し、かつ **#52 の盤面を通した後にもう一度測っても同じ** (挟み込み)'
    + '  ⛔ 「両方 true だから緑」で済ませない。⭐ 罠 A の裏 = FIELD_THEMES を触っていないことの証明',
    (m) => {
      const pre = legOf(m, 'idxEscort'), post = legOf(m, 'idxEscortPost');
      if (!pre || !pre.boot) return popFail('(9a) 7.9-3 の観測', 'idxEscort レグが走っていない');
      const shape = (v) => (v && v.boot) ? {
        theme: v.boot.theme, fieldMode: v.boot.fieldMode, isFieldTheme: v.boot.isFieldTheme,
        isCustom: v.boot.isCustom, mapdefId: v.boot.mapdefId, bandMask: v.boot.bandMask,
        openRows: v.boot.openRows, wagons: v.boot.wagons,
      } : null;
      const a = shape(pre), b = shape(post);
      const baseOk = !!a && JSON.stringify(a) === JSON.stringify(ESCORT_BASE);
      const sandOk = !!b && JSON.stringify(a) === JSON.stringify(b);
      const ok = baseOk && sandOk;
      return [ok, '前 = ' + JSON.stringify(a) + '\n         後 = ' + JSON.stringify(b)
        + '\n         基準 (c0a9134) = ' + JSON.stringify(ESCORT_BASE)
        + (ok ? '' : '  ⛔ '
          + (!baseOk ? '#52 適用前の固定値と違う ' : '')
          + (!sandOk ? '#52 の盤面を通した後で値が変わった (挟み込みで検出)' : ''))];
    }],

  ['9b', '[#52] #51 の §1〜§5 が全部緑のまま (座標を動かしても導線は変わらない)',
    (m) => {
      const keys = ['1a', '1b', '1c', '1d', '1e', '1f', '1g',
        '2a', '2b', '2c', '2d', '2e', '2f', '2g', '3a', '3b', '3c', '3d',
        '4a', '4b', '4c', '5a', '5b'];
      const red = [];
      for (const k of keys) {
        const a = ASSERT_OF[k];
        if (!a) { red.push(k + '(配線漏れ)'); continue; }
        let r;
        try { r = a[2](m); } catch (e) { r = [false, 'throw ' + (e && e.message)]; }
        if (!r[0]) red.push(k);
      }
      return [red.length === 0, '#51 の ' + keys.length + ' 本のうち赤 = ' + red.length
        + (red.length ? ' → ' + JSON.stringify(red) : ' (全部緑)')];
    }],

  // ── §10 撤退 ────────────────────────────────────────────────────────────
  ['10a', '[#52] ?ambush=0 → 従来どおり襲撃が出ない (⭐ (5a)(5b) が既に縛っているので、'
    + 'ここは **盤面が 1 枚絵にならない**ことだけを見る)',
    (m) => {
      const r = legOf(m, 'idxRetreat');
      if (!r || !r.boot) return popFail('(10a) 撤退の観測', 'idxRetreat レグが走っていない');
      const b = r.boot;
      const ctrl = legOf(m, 'board');
      /* ⚠⚠ 依頼書起草時の予測「撤退なら isCustom=false」は **実測で崩れた** (2026-09-05)。
         撤退の対照ランは廃坑で、廃坑は分岐グラフのノード mapDef を持つので isCustom は
         **元から true**。⇒ isCustom では締められないので、
         「街道のテーマでも街道の scenarioId でもない」で締める (assert は緩めていない —
          対照 = 襲撃側の theme / scenarioId を board レグから引いて突き合わせる)。 */
      const ambTheme = (ctrl && ctrl.board) ? ctrl.board.theme : null;
      const ok = b.ambushOn === false && b.ambushRun === false
        && b.scenarioId !== 'road-ambush' && b.theme !== ambTheme && b.theme === 'goblin-mine';
      return [ok, 'ROAD_AMBUSH_ON = ' + JSON.stringify(b.ambushOn)
        + ' / roadAmbushRun = ' + JSON.stringify(b.ambushRun)
        + ' / scenarioId = ' + JSON.stringify(b.scenarioId)
        + ' / themeId = ' + JSON.stringify(b.theme)
        + ' [対照: 襲撃側は ' + JSON.stringify(ambTheme) + ']'
        + ' [記録・⛔判定しない] isCustom = ' + JSON.stringify(b.isCustom)
        + ' (廃坑は分岐グラフのノード mapDef を持つので元から true)'
        + (ok ? '' : '  ⛔ 撤退中なのに街道の襲撃が立っている')];
    }],

  ['10b', '[#52] ?mapdef=0 → **絵が消えて従来の幾何へ戻る** (⛔ クラッシュしない)。'
    + '⭐ 街道の絵は node:true なので従来経路では貼られない = 森の山場/ボスの絵に置き換わる',
    (m) => {
      const off = legOf(m, 'boardOff');
      if (!off || !off.board) return popFail('(10b) ?mapdef=0 の観測', 'boardOff レグが走っていない');
      const b = off.board;
      const ps = Array.isArray(b.paintings) ? b.paintings : [];
      const roadPainted = ps.some(p => String(p.src).indexOf('caravan-road_ambush') >= 0);
      const errs = (off.errs || []).filter(e => /pageerror/.test(e));
      const ok = b.isCustom === false && !roadPainted && errs.length === 0
        && b.scenarioId === 'road-ambush';
      return [ok, 'isCustom = ' + JSON.stringify(b.isCustom)
        + ' / mapDef.id = ' + JSON.stringify(b.mapdefId)
        + ' / scenarioId = ' + JSON.stringify(b.scenarioId)
        + ' / 貼られた絵 = ' + JSON.stringify(ps.map(p => p.src))
        + ' / pageerror ' + errs.length + ' 件'
        + (ok ? '' : '  ⛔ '
          + (b.isCustom !== false ? '?mapdef=0 が効いていない ' : '')
          + (roadPainted ? '街道の絵が従来経路で貼られている (node:true が抜けている) ' : '')
          + (errs.length ? '例外が出た' : ''))];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 節の枠組み (⭐ 後続の項目は keys へキーを足し、pend から同じキーを外すだけでよい)
//   ⛔ keys と pend の両方に同じキーを置かないこと (数が合わなくなる)。
//   ⛔ 節ごと削除しないこと — 削ると「宣言してから実装する」型そのものが消える。
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// 観測レグの選択 — ⭐ どの assert がどのレグを要るか
//   ⚠⚠⚠ 受入条件 (--negative なし) は **常に全レグ**を走らせる。ここが効くのは
//     負のコントロールだけ —— 20 本 x 全レグは実時間で 1 時間を超えるので、
//     **その変異の targets ∪ record が読む値の供給レグだけ**を走らせる。
//   ⛔ 「速いから」で母集団を削らない = 和集合を必ず取る (対照の腕もこの表に入っている)。
//   ⭐ 'scan' は種の走査 **+ 出る種を決めるための歩行 (fireNone)** まで含む
//     (種を実際に歩いて確かめないと以降の腕が組めないため、分けられない)。
// ══════════════════════════════════════════════════════════════════════════════
const LEG_NEED = {
  '0a': ['boot'], '0b': ['boot'], '0c': ['scan', 'walkQuiet'], '0d': ['rnd'],
  '0e': ['scan', 'walkWin', 'walkLose'],
  '1a': ['scan', 'walkWin', 'walkLose', 'walkNull'], '1b': ['scan'],
  '1c': ['boot', 'scan', 'walkWin', 'walkLose'], '1d': ['scan', 'walkWin', 'walkLose'],
  '1e': ['scan', 'walkWin'], '1f': ['scan', 'walkNoParty'], '1g': ['box'],
  '2a': ['idxAmb'], '2b': ['idxAmb'], '2c': ['idxAmb', 'idxWoundRead', 'idxPlain'],
  '2d': ['idxZero'], '2e': ['idxZero', 'idxBadN'], '2f': ['idxAmb', 'idxWagon'],
  '2g': ['idxAmb', 'idxEscort'],
  '3a': ['resume'], '3b': ['resume'], '3c': ['defeat'], '3d': ['resume'],
  '4a': ['rnd'], '4b': [], '4c': ['boot'],
  '5a': ['scan', 'walkQuiet', 'walkRetFire', 'walkRetQuiet'], '5b': ['idxRetreat', 'idxAmb'],
  /* ── #52 街道の卓上マップ ─────────────────────────────────────────────── */
  '6a': ['board'], '6b': ['board'], '6c': ['board'], '6d': ['board'],
  '7a': ['board'], '7b': ['board'], '7c': ['board'], '7d': ['board'], '7e': ['board'],
  /* ⭐ (9a) は挟み込み = **escort → board → escortPost** の順で走らせる必要がある。
     順序は collect() の呼び出し位置が決めるので、ここでは要るレグを並べるだけ。 */
  '9a': ['idxEscort', 'board', 'idxEscortPost'],
  /* (9b) は §1〜§5 の assert を全部呼び直すので、母集団も全部要る。 */
  '9b': ['boot', 'rnd', 'scan', 'walkWin', 'walkLose', 'walkNull', 'walkNoParty', 'walkQuiet',
    'box', 'resume', 'walkRetFire', 'walkRetQuiet', 'idxAmb', 'idxWagon', 'idxWoundRead',
    'idxRetreat', 'defeat', 'idxPlain', 'idxZero', 'idxBadN', 'idxEscort'],
  /* ⭐ (10a) は「撤退の腕」だけでなく **襲撃側の腕 (board)** も要る = 対照が無いと
     「撤退が効いている」を襲撃と区別できない (#39 の永久緑の轍)。 */
  '10a': ['idxRetreat', 'board'], '10b': ['boardOff'],
};
/* レグどうしの依存。⭐ 潜行側の腕は **world.html が実際に書いた roadBattle** を使うので、
   必ず walkWin (= scan) を先に通す (⛔ ドライバが JSON を組み立てない、が §2 の設計)。 */
const LEG_DEP = {
  walkWin: ['scan'], walkLose: ['scan'], walkNull: ['scan'], walkNoParty: ['scan'],
  walkQuiet: ['scan'], walkRetFire: ['scan'], walkRetQuiet: ['scan'],
  idxAmb: ['walkWin'], idxWagon: ['walkWin'], idxRetreat: ['walkWin'],
  idxWoundRead: ['idxAmb'], defeat: ['walkWin'],
  /* ★[#52] 盤面のレグも **world.html が実際に書いた積荷**を使うので walkWin が要る。
     ⭐ (9a) の挟み込みは「escort → board → escortPost」の順で走らせる = 依存を張っておく。 */
  board: ['walkWin'], boardOff: ['walkWin'], idxEscortPost: ['idxEscort', 'board'],
};
const ALL_LEGS = ['boot', 'rnd', 'scan', 'walkWin', 'walkLose', 'walkNull', 'walkNoParty',
  'walkQuiet', 'box', 'resume', 'walkRetFire', 'walkRetQuiet', 'idxAmb', 'idxWagon',
  'idxWoundRead', 'idxRetreat', 'defeat', 'idxPlain', 'idxZero', 'idxBadN', 'idxEscort',
  'board', 'boardOff', 'idxEscortPost'];
function legsFor(keys) {
  if (!keys) return new Set(ALL_LEGS);
  const need = new Set();
  const add = (t) => {
    if (need.has(t)) return;
    need.add(t);
    for (const d of (LEG_DEP[t] || [])) add(d);
  };
  for (const k of keys) for (const t of (LEG_NEED[k] || [])) add(t);
  return need;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測をまとめて採る — ⭐ 素のポートでも変異ポートでも **同じ関数**を通す
//   ⛔ NEGATIVE を見て測り方を分岐させない (#48 の「期待側を切り替えると黙って空振り」の裏返し)。
// ══════════════════════════════════════════════════════════════════════════════
async function collect(browser, port, errs, keys) {
  const need = legsFor(keys);
  const served = await httpGet('http://localhost:' + port + PAGE_PATH);
  /* ⭐ (2g) の「呼ばれ口の証明」と (4b) の記録が読む index.html の配信バイト。 */
  const servedIndex = await httpGet('http://localhost:' + port + PAGE_INDEX);
  const m = { served: served.body, servedIndex: servedIndex.body, errs: errs, legs: {},
    legsRun: Array.from(need) };

  if (need.has('boot')) m.boot = await measureBoot(browser, port, errs);
  if (need.has('rnd')) {
    m.rnd = [];
    for (const s of RND_SEEDS) m.rnd.push(await measureRnd(browser, port, errs, s));
  }
  m.seedPick = { cands: [], used: null, quiet: null, fallback: null, tries: [] };
  if (need.has('scan')) {
    m.scan = await measureScan(browser, port, errs);
    /* ⭐ 歩行の腕。種を分類できたときだけ 3 経路 + 静けさの 4 本を走らせる。
       ⛔ 分類できないとき (= 本番未実装) でも **1 本は歩かせる** —— 歩行ハーネスそのものが
          立っていることを記録に残すため (⛔ ただし (0c)(0e) は緑にしない)。 */
    const cands = (m.scan && m.scan.fire) ? m.scan.fire.slice(0, FIRE_TRIES) : [];
    const quietSeed = (m.scan && m.scan.quiet && m.scan.quiet.length) ? m.scan.quiet[0].seed : null;
    m.seedPick = { cands: cands, used: null, quiet: quietSeed,
      fallback: cands.length ? null : SEED_FALLBACK, tries: [] };
    if (cands.length) {
      /* ⭐ 候補を上から順に 1 本ずつ歩かせ、**実際に器が開いた種**を採る。
         ⛔ 「緑になるまで試す」ではない —— 開かなければ (0c)(0e) は赤のまま。 */
      for (const c of cands) {
        const leg = await measureAmbush(browser, port, errs,
          { label: '判定なし', seed: c.seed, dest: DEST_FIRE, mode: 'none' });
        m.legs.fireNone = leg;
        m.seedPick.tries.push({ seed: c.seed, first: c.first, opens: leg.ambushOpens });
        if (leg.ambushOpens >= 1) { m.seedPick.used = c.seed; break; }
      }
      if (m.seedPick.used !== null) {
        /* ⭐ (1e) の腕だけが「先へ進む」を押して index.html まで見届ける
           (⛔ 他の腕で押すと window.__ambOpen ごと消えて (0c)(0e)(1a) が偽の赤になる)。 */
        if (need.has('walkWin')) {
          m.legs.fireWin = await measureAmbush(browser, port, errs,
            { label: '判定つき成功 (+ 先へ進む)', seed: m.seedPick.used, dest: DEST_FIRE,
              mode: 'check', force: D20_WIN, advance: true });
        }
        if (need.has('walkLose')) {
          m.legs.fireLose = await measureAmbush(browser, port, errs,
            { label: '判定つき失敗', seed: m.seedPick.used, dest: DEST_FIRE, mode: 'check', force: D20_LOSE });
        }
        /* ⭐ (1a) の 4 本目 = 判定が null を返す腕。⛔ 失敗扱いにせず、戦闘へも行かない。 */
        if (need.has('walkNull')) {
          m.legs.fireNull = await measureAmbush(browser, port, errs,
            { label: '判定つき + 判定が null', seed: m.seedPick.used, dest: DEST_FIRE,
              mode: 'check', nullRoll: true, skipPanel: true });
        }
        /* ⭐ (1f) = 同じ種で編成だけ抜く。⛔ 対照 (fireNone) が発火していることが母集団。 */
        if (need.has('walkNoParty')) {
          m.legs.noParty = await measureAmbush(browser, port, errs,
            { label: '編成なし', seed: m.seedPick.used, dest: DEST_FIRE, mode: 'none', noParty: true });
        }
      }
    } else {
      m.legs.fireNone = await measureAmbush(browser, port, errs,
        { label: '判定なし (⚠ 出る種が無いので既定の種で歩行ハーネスだけ通す)',
          seed: SEED_FALLBACK, dest: DEST_FIRE, mode: 'none' });
    }
    if (need.has('walkQuiet') && quietSeed !== null) {
      m.legs.quiet = await measureAmbush(browser, port, errs,
        { label: '出ない種', seed: quietSeed, dest: DEST_QUIET, mode: 'none' });
    }
  }
  /* ⭐ (1g) 器の幾何。⛔ 歩かない (器は ROAD_EVENTS.open / showResult で直に開く) ——
     測るのは **幾何と層だけ**で、「いつ出るか」は (0c)(1a) の担当。 */
  if (need.has('box')) {
    m.box = await measureBoxAmbush(browser, port, errs, { viewport: { width: 390, height: 844 } });
  }
  /* ⭐ (3a)(3b)(3d) 帰還。index.html が書くはずの roadReturn をドライバが同じ形で置く。
     ⛔ 歩かない (立ち位置の決定は起動時の 1 度きりなので、歩行は測定に寄与しない)。 */
  if (need.has('resume')) m.resume = await measureResume(browser, port, errs, {});

  /* ══ §5 (5a) 撤退の歩行 2 本 ═══════════════════════════════════════════
     ⭐ 1 本目 = 出る種で「出ない」ことを見る (母集団 = fireNone が発火していること)。
     ⭐ 2 本目 = **出ない種で恒等**を見る (撤退が既存の街道の出来事まで消していないか)。
     ⛔ クエリなので追加のポートを取らない。 */
  if (need.has('walkRetFire') && m.seedPick.used !== null) {
    m.legs.retreatFire = await measureAmbush(browser, port, errs,
      { label: '撤退 ' + RETREAT_QUERY + ' (出る種)', seed: m.seedPick.used, dest: DEST_FIRE,
        mode: 'none', extraQuery: '&ambush=0' });
  }
  if (need.has('walkRetQuiet') && m.seedPick.quiet !== null) {
    m.legs.retreatQuiet = await measureAmbush(browser, port, errs,
      { label: '撤退 ' + RETREAT_QUERY + ' (出ない種)', seed: m.seedPick.quiet, dest: DEST_QUIET,
        mode: 'none', extraQuery: '&ambush=0' });
  }

  /* ══ §2 / (3c) / (5b) 潜行側 ═══════════════════════════════════════════
     ⭐⭐⭐ 注入する積荷は **world.html が実際に書いた bytes そのもの**
       (⛔ ドライバが JSON を組み立てない = 街道側と潜行側の食い違いをここで捕まえる)。 */
  m.realBattle = (function () {
    const L = legOf(m, 'fireWin');
    return (L && L.storagePost && L.storagePost.battle) ? L.storagePost.battle : null;
  })();
  if (m.realBattle) {
    /* ① 襲撃の潜行 → hp を削る → 勝利。(2a)(2b)(2c①)(2f 守り切った腕)(2g 襲撃の腕) */
    if (need.has('idxAmb')) {
      m.legs.idxAmbush = await measureIndexAmbush(browser, port, errs,
        { tag: 'amb', battle: m.realBattle, scen: MAIN_SCEN, gen: MAIN_GEN,
          hpSet: WOUND_RATIOS, result: true });
    }
    /* ② 馬車を全損させて勝つ。(2f 全損の腕) */
    if (need.has('idxWagon')) {
      m.legs.idxWagonLost = await measureIndexAmbush(browser, port, errs,
        { tag: 'wagonlost', battle: m.realBattle, scen: MAIN_SCEN,
          killWagon: true, result: true });
    }
    /* ③ ①が書いた roadWounds をそのまま次の潜行へ。(2c②) */
    if (need.has('idxWoundRead')) {
      const woundsJson = (m.legs.idxAmbush && m.legs.idxAmbush.after && m.legs.idxAmbush.after.store)
        ? m.legs.idxAmbush.after.store.wounds : null;
      if (woundsJson) {
        m.legs.idxWoundRead = await measureIndexAmbush(browser, port, errs,
          { tag: 'woundread', wounds: woundsJson, scen: 'goblin-mine' });
      }
    }
    /* ⑧ 撤退 ?ambush=0。(5b) */
    if (need.has('idxRetreat')) {
      m.legs.idxRetreat = await measureIndexAmbush(browser, port, errs,
        { tag: 'retreat', query: RETREAT_QUERY, battle: m.realBattle,
          wounds: JSON.stringify({ n: 4, hp: [0, 0, 0, 0] }), scen: 'goblin-mine' });
    }
    /* ⑨ (3c) 敗北 → 帰還。⛔ 注入元は index.html の showResult(false) 自身。 */
    if (need.has('defeat')) {
      m.defeat = await measureDefeatReturn(browser, port, errs, { battle: m.realBattle });
    }
  }
  /* ④ 対照 (roadWounds なし)。(2c③) */
  if (need.has('idxPlain')) {
    m.legs.idxPlain = await measureIndexAmbush(browser, port, errs,
      { tag: 'plain', scen: 'goblin-mine' });
  }
  /* ⑤ 比率 0。(2d) と (2e) の対照 */
  if (need.has('idxZero')) {
    m.legs.idxWoundZero = await measureIndexAmbush(browser, port, errs,
      { tag: 'woundzero', wounds: JSON.stringify({ n: 4, hp: [0, 0, 0, 0] }), scen: 'goblin-mine' });
  }
  /* ⑥ n を偽装。(2e) ⚠ hp の本数は正しいまま = 「先頭から部分適用」だけを捕まえる形 */
  if (need.has('idxBadN')) {
    m.legs.idxWoundBadN = await measureIndexAmbush(browser, port, errs,
      { tag: 'woundbadn', wounds: JSON.stringify({ n: 99, hp: [0, 0, 0, 0] }), scen: 'goblin-mine' });
  }
  /* ⑦ 7.9-3 隊商護衛。(2g の対照 = 従来どおり敗北すること) / ⭐ (9a) の挟み込みの **前**の腕 */
  if (need.has('idxEscort')) {
    m.legs.idxEscort = await measureIndexAmbush(browser, port, errs,
      { tag: 'escort', gen: ESCORT_GEN, scen: 'generated-quest' });
  }
  /* ══ #52 盤面 ══════════════════════════════════════════════════════════
     ⭐⭐⭐ 積荷は **world.html が実際に書いた bytes**。⛔ ドライバが座標を組み立てない。
     ⚠ 順序が意味を持つ: idxEscort (前) → board (#52 の機能を通す) → idxEscortPost (後)。
       (9a) はこの 3 本の挟み込みで「7.9-3 が無傷」を見る。 */
  if (need.has('board') && m.realBattle) {
    m.legs.board = await measureBoard(browser, port, errs, { tag: 'board', battle: m.realBattle });
  }
  if (need.has('boardOff') && m.realBattle) {
    m.legs.boardOff = await measureBoard(browser, port, errs,
      { tag: 'mapdefoff', battle: m.realBattle, query: '?mapdef=0' });
  }
  if (need.has('idxEscortPost')) {
    m.legs.idxEscortPost = await measureIndexAmbush(browser, port, errs,
      { tag: 'escortPost', gen: ESCORT_GEN, scen: 'generated-quest' });
  }
  /* ★[#52 (6a)] 焼き上がりそのもの。⭐ HTTP なのでレグ (ブラウザ) を消費しない。 */
  if (need.has('board')) {
    const j = await httpGetBin('http://localhost:' + port + JPG_PATH);
    m.jpg = { status: j.status, bytes: j.buf.length, size: jpegSize(j.buf) };
  }
  return m;
}

const SECTIONS = [
  { title: '§0 装置 (先に母集団を確かめる) — ⭐ ここが立たないと §1〜§5 は全部空振りで永久緑',
    keys: ['0a', '0b', '0c', '0d', '0e'], pend: [] },

  { title: '§1 街道側 (js/road-events.js + world.html) — ⭐ 項目 2 が実装',
    keys: ['1a', '1b', '1c', '1d', '1e', '1f', '1g'], pend: [] },

  { title: '§2 潜行側 (index.html) — ⭐ 項目 3 が実装',
    keys: ['2a', '2b', '2c', '2d', '2e', '2f', '2g'], pend: [] },

  { title: '§3 帰還 — ⭐ (3a)(3b)(3d) は world.html 単独 / (3c) は index.html の敗北から測る',
    keys: ['3a', '3b', '3c', '3d'], pend: [] },

  { title: '§4 恒等 (非退行) — ⭐ 全部そろった (4a) が罠 B の本検査',
    keys: ['4a', '4b', '4c'], pend: [] },

  { title: '§5 撤退 ' + RETREAT_QUERY + ' — ⭐ 項目 3 が実装'
      + ' (⚠⚠⚠ 撤退アームだけを受入条件にしない = #39 の「永久緑」の轍)',
    keys: ['5a', '5b'], pend: [] },

  // ══ #52 街道の卓上マップ ══════════════════════════════════════════════════
  { title: '§6 絵が実際に出ている (#52) — ⭐⭐⭐ (6c) が罠 A (屋外テーマ x カスタム幾何) の本検査',
    keys: ['6a', '6b', '6c', '6d'], pend: [] },

  { title: '§7 マスクが通っている (#52) — ⚠⚠⚠ (7a)〜(7d) は母集団ガードとして (7e) を'
      + ' AND で内包する (「1 つも無い」型は母集団 0 で自明に真になるため)',
    keys: ['7e', '7a', '7b', '7c', '7d'], pend: [] },

  { title: '§9 恒等 (非退行) (#52) — ⭐ (9a) は **#52 適用前の固定値** + 挟み込みの 2 段',
    keys: ['9a', '9b'], pend: [] },

  { title: '§10 撤退 (#52) — ?ambush=0 (襲撃ごと出ない) / ?mapdef=0 (絵だけ消えて幾何が戻る)',
    keys: ['10a', '10b'], pend: [] },
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_roadamb_');
  const browserPath = findBrowser();
  /* ⚠ ポートは **MUT_ORDER の並び**で固定的に割り当てる (実装の増減で番号が動かないように)。
     PORT_OF[k] = PORT + 1 + i → 9971〜9990 が変異 20 本ぶんの予約。
     ⭐ 受入条件 (--negative なし) が listen するのは base の 9970 だけ。 */
  const PORT_OF = {};
  MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_road_ambush.js' + (NEGATIVE ? '  [負のコントロール]' : '') + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   撤退アーム: 同じポートの ' + RETREAT_QUERY
    + ' (クエリなので追加のポートを取らない)');
  console.log('[drv]   変異の予約: ' + (PORT + 1) + '〜' + (PORT + MUT_ORDER.length)
    + ' (' + MUT_ORDER.length + ' 本 / 実装済 ' + (MUT_ORDER.length - MUT_TODO.length) + ' 本'
    + (NEGATIVE ? ' / 今回 listen する: ' + MUT_RUN.map(k => k + ':' + PORT_OF[k]).join(' ')
      : ' / ⛔ 受入条件では 1 本も listen しない') + ')');

  const servers = [await startServer(PORT, null)];
  if (NEGATIVE) for (const k of MUT_RUN) servers.push(await startServer(PORT_OF[k], k));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];
  try {
    if (NEGATIVE) {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      /* ① 配信の検算 — 変異が **素のポートに無く、変異ポートにだけ**在ること。
         ⛔ ここを飛ばすと「実は素の木を 2 回測っていた」に気づけない。 */
      mark('変異が素の配信に無く、変異ポートにだけ載っていること');
      for (const k of MUT_RUN) {
        const f = '/' + MUT_SRC[k].file;
        const pure = await httpGet('http://localhost:' + PORT + f);
        const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
        check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
          nOf(pure.body, MUTATIONS[k].to) === 0 && nOf(mut.body, MUTATIONS[k].to) === 1,
          f + '  素 ' + nOf(pure.body, MUTATIONS[k].to) + ' 件 / 変異 '
          + nOf(mut.body, MUTATIONS[k].to) + ' 件');
        check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
          pure.body.length !== mut.body.length,
          '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
      }

      /* ② 欠陥を注入すると担当の節が **赤くなる**こと。
         ⛔ 「緑のまま」= その受入条件が何も検出していない証拠なので、そこで FAILED を出す。 */
      mark('欠陥を注入すると担当の節が赤くなること');
      for (const k of MUT_RUN) {
        const M = MUTATIONS[k];
        const negErrs = [];
        const port = PORT_OF[k];
        const wants = M.targets.concat(M.record || []);
        const legs = Array.from(legsFor(wants));
        console.log('       [変異 ' + k + ' :' + port + '] ' + M.file
          + '  担当 (' + M.targets.join(')(') + ')'
          + ((M.record || []).length ? ' / 記録 (' + M.record.join(')(') + ')' : '')
          + '  走らせるレグ = ' + legs.join(','));
        const mm = await collect(browser, port, negErrs, wants);
        for (const key of M.targets) {
          const a = ASSERT_OF[key];
          if (!a) {
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
              false, '⛔ (' + key + ') が ASSERTS に無い = 配線漏れ');
            continue;
          }
          const r = a[2](mm);
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + M.why,
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + String(r[1]).slice(0, 420));
        }
        for (const key of (M.record || [])) {
          const a = ASSERT_OF[key];
          if (!a) continue;
          const r = a[2](mm);
          console.log('       [記録・⛔ 判定しない] 変異 ' + k + ' で ('
            + key + ') は ' + (r[0] ? '緑のまま' : '⛔ 赤になった')
            + '  — ' + String(r[1]).slice(0, 260));
        }
        if (negErrs.length) {
          console.log('       [記録] pageerror/console.error ' + negErrs.length + ' 件: '
            + negErrs.slice(0, 3).join(' | '));
        }
      }

      /* ③ 実装漏れ。⛔ 件数から隠さない (最終項目の完了条件 = PENDING 0)。 */
      mark('変異の実装漏れ');
      if (MUT_TODO.length) {
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ('
            + MUTATIONS[k].targets.join(')(') + ') が赤くなる', MUTATIONS[k].why);
        }
      } else {
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
        /* ⭐ #51 の 20 行 + #52 の 10 行。⛔ 本数を減らして通さない
           (「実装を忘れた変異」を件数から隠さない、が #48 以来の則)。 */
        check('(n9b) [装置] 依頼書の変異表 30 行 (#51 20 + #52 10) がすべて表に在る',
          MUT_ORDER.length === 30, MUT_ORDER.length + ' 本');
      }
    } else {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      const m = await collect(browser, PORT, errs, null);

      for (const sec of SECTIONS) {
        if (sec.keys.length === 0 && sec.pend.length === 0) continue;
        mark(sec.title);
        for (const key of sec.keys) {
          const a = ASSERT_OF[key];
          if (!a) { pending('(' + key + ') ⛔ SECTIONS に載っているが ASSERTS に無い', '配線漏れ'); continue; }
          const r = a[2](m);
          check('(' + a[0] + ') ' + a[1], r[0], r[1]);
        }
        for (const p of sec.pend) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      // ── 記録 (⛔ 期待値ではない。読み解き用 / 項目 2 への材料) ────────────────
      mark('[記録] 装置の下見 (⛔ 判定しない)');
      const b = m.boot || {};
      console.log('       ROAD_EVENTS = ' + b.reType + ' / seam = ' + JSON.stringify(b.seam));
      console.log('       AMBUSH = ' + JSON.stringify(b.ambush));
      console.log('       CHECKS = ' + JSON.stringify(b.checkKeys));
      console.log('       DC_TIERS = ' + JSON.stringify(b.dcTiers));
      console.log('       EVENTS の id = ' + JSON.stringify(b.eventIds));
      console.log('       停留所の実体 = ' + JSON.stringify(b.pop) + ' / 起点 = ' + b.heroNode);
      console.log('       __world.roadAmbush = ' + b.roadAmbushSeam
        + '  ⛔⛔⛔ **undefined が正しい** —— verify_road_events (4b) が __world の窓を'
        + ' 「既存 25 + #45 の roadEvent = ちょうど 26 個」で集合固定しているので、'
        + '#51 は窓を 1 つも足せない (2026-09-04 に足して赤にして戻した)。項目 3 / 項目 4 も同じ。');
      console.log('       種の走査 = ' + JSON.stringify(m.seedPick)
        + ' / supported=' + (m.scan ? m.scan.supported : null)
        + (m.scan && m.scan.why ? ' (' + m.scan.why + ')' : '')
        + ' / 走査 ' + (m.scan ? m.scan.probed : 0) + ' 種');
      if (m.resume) {
        const R = m.resume;
        console.log('       [帰還] 注入した刻み点 = ' + JSON.stringify(R.pick)
          + '\n         対照 = ' + JSON.stringify((R.control || {}).node)
          + ' / 帰還後 = ' + JSON.stringify((R.back || {}).node)
          + ' / 消費後 = ' + JSON.stringify((R.again || {}).node)
          + '\n         storage 帰還後 = ' + JSON.stringify((R.back || {}).store)
          + '\n         storage 消費後 = ' + JSON.stringify((R.again || {}).store)
          + '\n         spawnVia 帰還後 = ' + JSON.stringify((R.back || {}).spawnVia));
      }
      if (m.box) {
        console.log('       [器 ' + m.box.viewport.width + 'x' + m.box.viewport.height + '] compact='
          + m.box.compact + ' / ' + (m.box.views || []).map(v => v.tag + ' ' + v.nBtns + 'btn '
            + (v.rect ? Math.round(v.rect.w) + 'x' + Math.round(v.rect.h) : '—')).join(' | ')
          + ' / 閉じたあと = ' + JSON.stringify(m.box.afterClose));
      }
      if (m.defeat) {
        const D = m.defeat;
        console.log('       [敗北→帰還] 刻み点 = ' + JSON.stringify((D.pick || {}).step)
          + ' / SITES[' + MAIN_SCEN + '] = ' + JSON.stringify((D.pick || {}).site)
          + ' / showResult(false) = ' + JSON.stringify(D.resultCall)
          + '\n         index 起動 = ' + JSON.stringify({ id: (D.idxBoot || {}).scenarioId,
            run: (D.idxBoot || {}).ambushRun, wagons: (D.idxBoot || {}).wagons })
          + '\n         敗北後の storage = ' + JSON.stringify((D.idxAfter || {}).store)
          + '\n         帰還後 = ' + JSON.stringify((D.back || {}).node)
          + ' / もう一度 = ' + JSON.stringify((D.again || {}).node));
      }
      for (const k of Object.keys(m.legs)) {
        const L = m.legs[k];
        /* ⭐ 潜行側 (index.html) の腕は歩かないので別の書式で記録する。
           ⛔ 歩行の書式へ流すと L.taps が undefined で落ちる。 */
        if (!Array.isArray(L.taps)) {
          console.log('       [潜行 ' + k + '] ' + L.tag + L.query
            + '  仕込み = ' + JSON.stringify(L.seeded)
            + '\n         起動 = ' + JSON.stringify({ id: L.boot && L.boot.scenarioId,
              on: L.boot && L.boot.ambushOn, run: L.boot && L.boot.ambushRun,
              theme: L.boot && L.boot.theme, wagons: L.boot && L.boot.wagons,
              endsRun: L.boot && L.boot.endsRun, coins: L.boot && L.boot.coins,
              scen: L.boot && L.boot.scen })
            + '\n         hp = ' + JSON.stringify(L.boot ? ratiosOf(L.boot) : null)
            + (L.hpApplied ? ' / 削った後 = ' + JSON.stringify(ratiosOf(L.hpApplied)) : '')
            + (L.killed ? ' / 馬車を殺した = ' + JSON.stringify(L.killed) : '')
            + '\n         storage(起動後) = ' + JSON.stringify(L.boot && L.boot.store)
            + (L.after ? '\n         showResult=' + JSON.stringify(L.resultCall)
              + ' storage(後) = ' + JSON.stringify(L.after.store)
              + ' / reward = ' + JSON.stringify(rewardOf(L.after)) : '')
            + (L.errs && L.errs.length ? '\n         ⚠ errs ' + L.errs.length + ' 件: '
              + L.errs.slice(0, 3).join(' | ') : ''));
          continue;
        }
        console.log('       [歩行 ' + k + '] ' + L.label + '  種=' + L.seed + ' → ' + L.dest
          + '  タップ ' + L.taps.length + ' / 到着 ' + L.arrivals.length
          + ' / 器 ' + L.opens.length + ' (襲撃 ' + L.ambushOpens + ' / 出来事 ' + L.roadOpens + ')'
          + (L.stuck ? '  ⛔ ' + L.stuck : ''));
        console.log('         到着列 = ' + JSON.stringify(L.arrivals.slice(0, 10))
          + '  終点 = ' + (L.end && !L.end.dead ? L.end.node : '(離脱 ' + (L.end || {}).path + ')'));
        console.log('         storage(後) = ' + JSON.stringify(L.storagePost));
        if (L.amb) console.log('         襲撃の器 = ' + JSON.stringify(L.amb).slice(0, 400));
        if (L.advance) console.log('         「先へ進む」= ' + JSON.stringify(L.advance));
        if (L.nullRoll) console.log('         判定 null の仕込み = ' + JSON.stringify(L.nullStub));
      }
      mark('[記録] pageerror / console.error');
      console.log('       ' + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 8).join('\n         ') : ''));
    }
  } catch (e) {
    /* ⛔ 例外を黙って捨てない —— 捨てると「0/0 PASSED」で exit 0 = 永久緑になる。 */
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    try { await browser.close(); } catch (e) {}
    for (const s of servers) { try { s.close(); } catch (e) {} }
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + (pend.length ? '   **PENDING** ' + pend.length + ' 件' : ''));
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (最終項目の完了条件 = ここが 0 件):');
    for (const b of pend) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
