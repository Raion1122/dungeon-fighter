#!/usr/bin/env node
/*
 * driver_action_priority.js — 実装依頼書 #19「行動の優先度」+ #34「戦士の仲間」検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/driver_action_priority.js [--headful] [--port N] [--browser <path>]
 *   node tools/driver_action_priority.js --negative     ← 負のコントロール
 *   node tools/driver_action_priority.js --baseline <hash>   ← §7 の非退行比較の基準
 *
 * ── セクションと実装状況 (段階的に足していく骨組み) ───────────────────────
 *   §0 装置 (母集団の確認 / index↔tavern の二重定義突合)   … 実装済 (項目②)
 *   §1 主人公 — 重み倍率がクランプに食われていない          … 実装済 (項目②)
 *   §2 仲間 — 先出しが効き、指定外は不変                    … 実装済 (項目③)
 *   §3 道中詠唱                                             … 実装済 (項目④)
 *   §4 バフ退避 (戦闘開始で主人公だけ剥がれない)            … 実装済 (項目④)
 *   §5 撤退スイッチ ?actionpri=0                            … 実装済 (項目④)
 *   §6 酒場 UI                                              … 実装済 (本ファイル)
 *   §7 戦士の仲間 (実装依頼書 #34)                          … 実装済 (#34)
 *
 * ── ⚠⚠⚠ §7 の非退行比較 (7a-0)/(7k) の基準コミット ──────────────────────
 *   BASE_REF は **#34 に着手する直前のコミット** を直書きで固定する。
 *   ⛔ ここを HEAD にすると、#34 を commit した瞬間に「自分自身との比較」になり
 *      **永久に緑** になる (= 最悪の空振り)。--baseline で上書きできる。
 *
 *   ⛔ PENDING は **黙って緑にしない**。RESULT 行に PASSED / FAILED / PENDING の
 *      3 つの数を必ず出し、「まだ測っていない」を数で見えるようにする。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ────────────────────────────
 *  - ROOT は必ず path.resolve を通す。区切り文字のまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない。
 *  - classic script 直下の let/const/function は **window に載らない**。
 *    page.evaluate(() => PARTY_SLOTS) のように **裸の識別子**で読む。
 *  - same-origin の localStorage / sessionStorage はページ遷移をまたいで生き残る →
 *    seed() で毎回 purge してからリロードする。
 *  - openPrep() を **await してはいけない**。マッチング演出はタップを待って止まるので
 *    headless では永久に固まる。発火だけさせ、画面中央をタップし続けて #prep を出す。
 *  - ⭐⭐ 本番ファイルに計測シームを置かない (CLAUDE.md の changelog ガード)。
 *    必要な細工は **配信スナップショットへ実行時に注入**する (下の NEG_ANCHOR)。
 *  - ⭐⭐ 配信バイトを起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *
 * ── 負のコントロール (--negative) ──────────────────────────────────────────
 *   N1: pickLeaderAction の `w *= AP_BOOST` を `Math.min(LEADER_W_MAX,...)` の **前** へ
 *       移す (依頼書 §2-4 の罠そのもの) → **(1c) が赤くなる**こと。
 *   N2: apGateP を Math.max(base, AP_P) → Math.min(base, AP_P) へ反転 (上げずに下げる)
 *       → **(2c) が赤くなる**こと。⚠ 赤くならなければゲート 20 本のラップは信用できない。
 *   N3: renderActionPriority() の「装備している技だけに絞る」フィルタを外す
 *       (= 候補を skillPool 全部にする) → **(6b) が赤くなる**こと。
 *       どれも赤くならなければ exit 1 (テストが空振りしている証拠)。
 *       ⚠ 注入点が 1 箇所ちょうど見つからなければ、走らせる前に exit 1 で止まる
 *         (アンカーが腐ったまま「注入したつもり」で緑になるのを防ぐ)。
 *   N4: apTryTravelCast の AP_TRAVEL_CASTABLE ガードを index 側だけ外す (依頼書 §2-6 の罠)
 *       → **(3d) が赤くなる**こと。1戦1回スキルを道中で唱えられてしまう = 戦闘開始の
 *       skillsUsedInEncounter.clear() で記録が消え、実質 2 回撃てる抜け道の再現。
 *   N5: apCaptureTravelBuffs を no-op (常に null) にする (依頼書 §2-5 の罠)
 *       → **(4a) が赤くなる**こと。戦闘開始で **主人公のバフだけ** 剥がれる非対称の再現。
 *   N6: apTryTravelCast の apTravelCastDone ラッチを外す
 *       → **(3c) が赤くなる**こと。1 回の接敵で何度も唱えてスロットを溶かす。
 *
 *   ── #34 で追加した 5 本 ───────────────────────────────────────────────
 *   ⚠ 依頼書 #34 §8 の表は N4〜N8 と書いてあるが、**N4/N5/N6 は #19 で既に使用済**
 *     だったので N7〜N11 へ繰り下げた (依頼書 §12 に記録)。
 *   N7:  allyBasicAttack の `o.dmgBonus != null` を `o.dmgBonus ||` へ (0 を潰す変異)
 *        → **(7b-2) が赤くなる**こと。STR 修正 0 の戦士でスキルの威力が武器値へ化ける。
 *   N8 ⭐: allyFinisher の `ally.stunned = ...` を `ally.buffs.skipNextTurn = true` へ
 *        (依頼書 §2-4 の罠そのもの) → **(7d) が赤くなる**こと。誰も読まない死にフィールド
 *        へ書くのでセルフスタンが黙って消え、3d10 がノーリスクの上位互換になる。
 *   N9:  apIsWastedCast の morale の行を削る (依頼書 §2-5 の罠)
 *        → **(7f) が赤くなる**こと。効いている最中も毎手番撃ち直してターンを溶かす。
 *   N10 ⭐: executeSkillOn の warrior 枝から isLeader の分岐を外し、仲間も
 *        executeWarriorSkill へ流す (依頼書 §2-2 の罠) → **(7h) が赤くなる**こと。
 *        仲間の戦士が唱えた闘志で **主人公の HP が回復する**。
 *   N11: warriorAI のゲート 1 本を apGateP から裸の Math.random() < へ戻す
 *        → **(2e) が赤くなる**こと。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ⚠ path.resolve 必須
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const PORT     = parseInt(arg('port', '8843'), 10);

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {};
for (const rel of ['tavern.html', 'index.html']) {
  FROZEN['/' + rel] = fs.readFileSync(path.join(ROOT, rel));
}

/* ── §7 (#34) の非退行比較用: 着手前のスナップショットを別 URL で同時に配信する ──
 * ⛔⛔ 既定を HEAD にしてはいけない。#34 を commit した瞬間に「自分自身との比較」に
 *    化けて **永久に緑** になる (memory: 期待値の写経回避は着手前 hash で採る)。
 * ⚠ 取得に失敗したら (7a-0)/(7k) は PENDING にする。黙って緑にはしない。
 * ⚠ git show が返すのは blob (LF) で、作業ツリー (CRLF) とは改行が違う。JS の意味は
 *   変わらないので比較には影響しない (比べるのはバイトではなく実行時の観測列)。 */
const BASE_REF = arg('baseline', 'c226acf');   // #29 着地直後 = #34 に 1 バイトも触る前
let BASE_ERR = null;
try {
  FROZEN['/index_base.html'] = require('child_process')
    .execFileSync('git', ['show', BASE_REF + ':index.html'], { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 });
} catch (e) { BASE_ERR = (e && e.message) || String(e); }

/* ── index.html を行単位で書き換えるユーティリティ ─────────────────────────────
 * ⚠⚠ index.html は CRLF。'\n' 決め打ちで split すると各行末に '\r' が残るので、
 *    比較は trim してから行い、書き戻す行には '\r' を付け直す。
 * ⚠ アンカーがちょうど 1 箇所見つからなければ **走らせる前に exit 1**
 *   (腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ)。 */
function editIndexLines(label, mutate) {
  const lines = FROZEN['/index.html'].toString('utf8').split('\n');
  const trimCR = (s) => s.replace(/\r$/, '').trim();
  if (!mutate(lines, trimCR)) {
    console.error('[driver] ' + label + ' の注入点が腐っています。走らせずに止めます。');
    process.exit(1);
  }
  FROZEN['/index.html'] = Buffer.from(lines.join('\n'), 'utf8');
}

/* ── 計測シーム: executeSkillOn の呼び出しログ ────────────────────────────────
 * ⛔ 本番ファイルに計測シームを置かない (CLAUDE.md: プレイヤーに見える変化の無い
 *    本番改変は changelog ガードに掛かる) → **配信スナップショットへ実行時に注入**する。
 * 関数本体の先頭へ 1 行だけ差し込むので、呼び出しを 1 件も取りこぼさない。
 * ⭐⭐⭐ このログが空のまま §2 の assert が全部緑になるのが最悪の空振り → (0c) で見る。 */
const SEAM_FN   = 'async function executeSkillOn(actor, classKey, skillId, targetIdx) {';
const SEAM_LINE = '      try { (window.__apLog = window.__apLog || []).push({ classKey: classKey, skillId: skillId,'
  + ' isLeader: !!(actor && actor.isLeader), targetIdx: targetIdx,'
  + ' phase: (typeof currentPhase !== "undefined" ? currentPhase : null),'
  + ' enc: (typeof encounterActive !== "undefined" ? encounterActive : null) }); } catch (e) {}';
editIndexLines('計測シーム (executeSkillOn)', (lines, trimCR) => {
  const spots = [];
  for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === SEAM_FN) spots.push(i);
  if (spots.length !== 1) {
    console.error('[driver] executeSkillOn の定義が ' + spots.length + ' 箇所 (期待 1):  ' + SEAM_FN);
    return false;
  }
  lines.splice(spots[0] + 1, 0, SEAM_LINE + '\r');
  return true;
});

/* ── 計測シーム: 戦闘開始の「バフ退避 → resetPlayerBuffs → 復元」直後の実測値 ────────
 * ⭐⭐⭐ (4a) は「主人公と仲間が一致するか」を **その一瞬** で見ないと意味が無い。
 *   後からポーリングで読むと、戦闘ターンでバフが減って **両方 0 = 一致** に化け、
 *   退避を外しても緑になる (最悪の空振り)。→ 復元行の直後で 1 回だけ写し取る。
 * ⛔ 本番ファイルには置かない。配信スナップショットへ実行時に注入する。 */
const BUFF_ANCHOR = 'if (__apKeep) apRestoreTravelBuffs(__apKeep);';
const BUFF_LINE = '        try { (window.__apBuffLog = window.__apBuffLog || []).push({ keep: !!__apKeep,'
  + ' logN: ((window.__apLog || []).length),'
  + ' player: { atk: playerBuffs.atkBonusRemaining || 0, atkAmt: playerBuffs.atkBonusAmount || 0,'
  + ' ac: playerBuffs.acBonusRemaining || 0, striking: playerBuffs.strikingRemaining || 0,'
  + ' hasted: playerBuffs.hastedRemaining || 0, move: playerBuffs.blessMoveRemaining || 0 },'
  + ' allies: allies.filter(a => a.alive).map(a => ({ cls: a.classKey, atk: a.buffs.atkBonusRemaining || 0 }))'
  + ' }); } catch (e) {}';
editIndexLines('計測シーム (バフ退避)', (lines, trimCR) => {
  const spots = [];
  for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === BUFF_ANCHOR) spots.push(i);
  if (spots.length !== 1) {
    console.error('[driver] バフ退避の復元行が ' + spots.length + ' 箇所 (期待 1):  ' + BUFF_ANCHOR);
    return false;
  }
  lines.splice(spots[0] + 1, 0, BUFF_LINE + '\r');
  return true;
});

// ⚠ 実装側のこの 1 行が「装備している技だけに絞る」フィルタの入口。
const NEG_ANCHOR = 'const equippedIds = apEquippedIdsFor(slot, classKey);';
const NEG_PATCH  = 'const equippedIds = slot.skillPool.map(sk => sk.id); /* N3: フィルタを外した変異 */';
if (NEGATIVE) {
  const src   = FROZEN['/tavern.html'].toString('utf8');
  const parts = src.split(NEG_ANCHOR);
  const hits  = parts.length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール N3 の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + NEG_ANCHOR);
    process.exit(1);
  }
  FROZEN['/tavern.html'] = Buffer.from(parts.join(NEG_PATCH), 'utf8');
  console.log('[driver] ★ 負のコントロール N3 を注入しました (renderActionPriority の絞り込みを外す)');

  // ── N1 (依頼書 §2-4 の罠): 倍率をクランプの **前** へ移す ─────────────────
  //   ⚠ index.html は CRLF。改行を '\n' 決め打ちで探すと注入点 0 で止まるので行単位で扱う。
  const iLines = FROZEN['/index.html'].toString('utf8').split('\n');
  const trimCR = (s) => s.replace(/\r$/, '').trim();
  const L_CLAMP = 'w = Math.min(LEADER_W_MAX, Math.max(LEADER_W_FLOOR, w));';
  const L_BOOST = 'if (apPrefId && id === apPrefId) w *= AP_BOOST;';
  const n1Spots = [];
  for (let i = 0; i + 1 < iLines.length; i++)
    if (trimCR(iLines[i]) === L_CLAMP && trimCR(iLines[i + 1]) === L_BOOST) n1Spots.push(i);
  if (n1Spots.length !== 1) {
    console.error('[driver] 負のコントロール N1 の注入点が ' + n1Spots.length + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + L_CLAMP + '  /  ' + L_BOOST);
    process.exit(1);
  }
  {
    const i = n1Spots[0];
    const a = iLines[i], b = iLines[i + 1];
    iLines[i]     = b.replace(/(\r?)$/, ' /* N1: クランプの前へ移した変異 */$1');
    iLines[i + 1] = a;
    FROZEN['/index.html'] = Buffer.from(iLines.join('\n'), 'utf8');
  }
  console.log('[driver] ★ 負のコントロール N1 を注入しました (倍率を Math.min クランプの前へ移動)');

  // ── N2 (依頼書 §8): apGateP を「上げる」から「下げる」へ反転させる ──────────
  //   Math.max(base, AP_P) → Math.min(base, AP_P)。20 本のゲートのラップが実際に
  //   効いているかを (2c) が見ている。⚠ これが赤くならなければラップは信用できない。
  const N2_OLD = 'return (apPreferredId(cls, apSituationNow()) === skillId) ? Math.max(base, AP_P) : base;';
  const N2_NEW = 'return (apPreferredId(cls, apSituationNow()) === skillId) ? Math.min(base, AP_P) : base;'
               + '   /* N2: 上げずに下げた変異 */';
  editIndexLines('負のコントロール N2 (apGateP)', (lines, trimCR) => {
    const spots = [];
    for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === N2_OLD) spots.push(i);
    if (spots.length !== 1) {
      console.error('[driver] N2 の注入点が ' + spots.length + ' 箇所 (期待 1):  ' + N2_OLD);
      return false;
    }
    lines[spots[0]] = '      ' + N2_NEW + '\r';
    return true;
  });
  console.log('[driver] ★ 負のコントロール N2 を注入しました (apGateP を Math.min = 引き下げへ反転)');

  // ── N4 (依頼書 §2-6 の罠): 道中許可リストのガードを index 側だけ外す ────────
  //   酒場側 (TRAVEL_CASTABLE_IDS) は素のまま = 「片方だけ忘れた」実装ミスの再現。
  const N4_OLD = 'if (!AP_TRAVEL_CASTABLE.has(id)) return false;';
  editIndexLines('負のコントロール N4 (道中許可リスト)', (lines, trimCR) => {
    const spots = [];
    for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === N4_OLD) spots.push(i);
    if (spots.length !== 1) {
      console.error('[driver] N4 の注入点が ' + spots.length + ' 箇所 (期待 1):  ' + N4_OLD);
      return false;
    }
    lines[spots[0]] = '      /* N4: 道中許可リストのガードを外した変異 */\r';
    return true;
  });
  console.log('[driver] ★ 負のコントロール N4 を注入しました (AP_TRAVEL_CASTABLE のガードを index 側だけ外す)');

  // ── N5 (依頼書 §2-5 の罠): 道中バフの退避を no-op にする ───────────────────
  const N5_OLD = 'if (!playerBuffs.__apTravel) return null;';
  editIndexLines('負のコントロール N5 (バフ退避)', (lines, trimCR) => {
    const spots = [];
    for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === N5_OLD) spots.push(i);
    if (spots.length !== 1) {
      console.error('[driver] N5 の注入点が ' + spots.length + ' 箇所 (期待 1):  ' + N5_OLD);
      return false;
    }
    lines[spots[0]] = '      return null;   /* N5: 退避を no-op にした変異 */\r';
    return true;
  });
  console.log('[driver] ★ 負のコントロール N5 を注入しました (apCaptureTravelBuffs を常に null へ)');

  // ── N6: 「1 接敵 1 回」のラッチを外す ──────────────────────────────────────
  const N6_OLD = 'if (apTravelCastDone.has(latch)) return false;';
  editIndexLines('負のコントロール N6 (ラッチ)', (lines, trimCR) => {
    const spots = [];
    for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === N6_OLD) spots.push(i);
    if (spots.length !== 1) {
      console.error('[driver] N6 の注入点が ' + spots.length + ' 箇所 (期待 1):  ' + N6_OLD);
      return false;
    }
    lines[spots[0]] = '      /* N6: 1 接敵 1 回のラッチを外した変異 */\r';
    return true;
  });
  console.log('[driver] ★ 負のコントロール N6 を注入しました (apTravelCastDone のラッチを外す)');

  /* ══ #34 の 5 本 (N7〜N11) ══════════════════════════════════════════════
   * ⚠ 依頼書 #34 §8 は N4〜N8 と書いているが、N4/N5/N6 は #19 で使用済だったので
   *   繰り下げた。番号だけの違いで、変異の中身は依頼書の表と 1 対 1 に対応する。 */
  const oneLine = (label, oldTrim, newLine) => {
    editIndexLines(label, (lines, trimCR) => {
      const spots = [];
      for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === oldTrim) spots.push(i);
      if (spots.length !== 1) {
        console.error('[driver] ' + label + ' の注入点が ' + spots.length + ' 箇所 (期待 1):  ' + oldTrim);
        return false;
      }
      lines[spots[0]] = newLine + '\r';
      return true;
    });
    console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました');
  };

  // N7: 0 を潰す || へ戻す (dmgBonus: 0 の戦士でスキル威力が武器値へ化ける)
  oneLine('N7 (allyBasicAttack の dmgBonus 判定)',
    'const skillDmgBonus = (o.dmgBonus != null) ? o.dmgBonus : effectiveAllyDmgBonus(ally);',
    '      const skillDmgBonus = (o.dmgBonus || effectiveAllyDmgBonus(ally));   /* N7: 0 を潰す変異 */');

  // N8 ⭐ 依頼書 §2-4 の罠そのもの: 誰も読まない死にフィールドへ書く
  oneLine('N8 (allyFinisher のセルフスタン)',
    'ally.stunned = Math.max(ally.stunned || 0, 1);',
    '      ally.buffs.skipNextTurn = true;   /* N8: 死にフィールドへ書いた変異 */');

  // N9 依頼書 §2-5 の罠: 士気高揚の無駄撃ち判定を落とす
  oneLine('N9 (apIsWastedCast の morale)',
    'if (skillId === "morale")      return (b.atkBonusRemaining || 0) > 0;        // #34',
    '      /* N9: morale の無駄撃ち判定を落とした変異 */');

  // N11 (2e) 用: ゲート 1 本を裸の Math.random() < へ戻す
  oneLine('N11 (warriorAI のゲート)',
    '&& Math.random() < apGateP(ally, "strong-cleave", 0.5)) {',
    '          && Math.random() < 0.5) {   /* N11: apGateP を外した裸のゲート */');

  // N10 ⭐ 依頼書 §2-2 の罠: 仲間もリーダー用実装へ流す (2 行を 1 行へ潰す)
  {
    const L1 = 'if (isLeader) { await executeWarriorSkill(skillId, targetIdx); return true; }';
    const L2 = 'if (!WARRIOR_ALLY_ON) return false;      // #34 撤退スイッチ ?warally=0';
    editIndexLines('負のコントロール N10 (executeSkillOn の warrior 枝)', (lines, trimCR) => {
      const spots = [];
      for (let i = 0; i + 1 < lines.length; i++)
        if (trimCR(lines[i]) === L1 && trimCR(lines[i + 1]) === L2) spots.push(i);
      if (spots.length !== 1) {
        console.error('[driver] N10 の注入点が ' + spots.length + ' 箇所 (期待 1)');
        return false;
      }
      lines[spots[0]]     = '        await executeWarriorSkill(skillId, targetIdx); return true;   /* N10: 仲間もリーダー用実装へ流す変異 */\r';
      lines[spots[0] + 1] = '\r';
      return true;
    });
    console.log('[driver] ★ 負のコントロール N10 を注入しました (仲間の戦士を executeWarriorSkill へ流す)');
  }
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません');
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)');
  process.exit(2);
}
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) {                                     // ← 凍結済み (+ 変異済み) を優先
          rs.setHeader('Content-Type', MIME['.html']);
          rs.end(FROZEN[u]);
          return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 集計 (PASSED / FAILED / PENDING の 3 値)
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, ok: false, pending: true, detail: why || '' });
  console.log('  --  ' + name + '   [PENDING] ' + (why || ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * 期待表 — 依頼書の実測 (§2-6 / §2-9) をドライバ側に持つ。
 * ⚠ 実装からコピーしない。実装が変わったらここが赤くなるのが正しい。
 * ══════════════════════════════════════════════════════════════════════════ */
const CLASS_KEYS = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
const SITUATIONS = ['general', 'mob', 'boss', 'travel'];
// §2-6: 「呪文スロットを消費し、敵を対象に取らない呪文」の全数 = 10 件
const EXPECT_TRAVEL_IDS = ['bless', 'shield-of-faith', 'striking',
  'cure-light-wounds', 'cure-moderate-wounds', 'cure-serious-wounds', 'cure-critical-wounds',
  'arcane-shield', 'cure-minor', 'haste'];
// §2-9 の表: 道中の行が出るのは僧侶・魔法使い・エルフだけ (戦士/ドワーフ/盗賊は 0 件)
const EXPECT_TRAVEL_CLASSES = ['cleric', 'mage', 'elf'];

const setEq = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};

/* ══════════════════════════════════════════════════════════════════════════
 * ページ内: 初期化。
 *   Lv5 (累積 XP 10000) にする = スキル枠 3。既定の 3 スキルがそのまま枠に収まり、
 *   (6c) で外した技を戻せる (Lv1 は枠 1 なので再装備が塞がり、後片付けができない)。
 * ══════════════════════════════════════════════════════════════════════════ */
function seed() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '10000');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
  } catch (e) {}
}

const PREP_SCENARIO = 'goblin-mine';

async function openPrepScreen(browser, viewport, opts) {
  opts = opts || {};
  const qs = opts.qs ? ('?' + opts.qs) : '';
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(viewport.name + ' :: ' + e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.goto('http://localhost:' + PORT + '/tavern.html' + qs, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(seed);
  // ⚠ seed() が dragonfighters.* を全部消すので、保存値の seed は **その後** に置く ((5b) 用)。
  if (opts.seedAp) await page.evaluate((ap) => {
    try { localStorage.setItem('dragonfighters.actionPriority', JSON.stringify(ap)); } catch (e) {}
  }, opts.seedAp);
  await page.goto('http://localhost:' + PORT + '/tavern.html' + qs, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 20000 });
  // ⚠ await しない (マッチング演出がタップ待ちで止まるため)
  await page.evaluate((scId) => {
    const sc = scenarios.find(s => s.id === scId);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  }, PREP_SCENARIO);
  const shownNow = () => page.evaluate((expectRows) => {
    const p = document.getElementById('prep');
    if (!p || getComputedStyle(p).display === 'none') return false;
    if (!expectRows) return true;   // ?actionpri=0 では #apRows が空のまま = 幅で待てない
    const rows = document.getElementById('apRows');
    return !!rows && rows.getBoundingClientRect().width > 1;
  }, opts.expectRows !== false);
  let shown = false;
  for (let i = 0; i < 45 && !shown; i++) {
    shown = await shownNow();
    if (shown) break;
    /* #35: 全確定後の「背景タップ = 出発」は廃止され、出発の口は #pmDepart になった。
       ⚠ 画面中央は 4 列のカードの上か隙間なので、叩いても先へ進まなくなった。
       ⚠ 開示中はスキップのために背景を叩く必要が残るので **2 段**にする。
       ⭐ #pmDepart が無い (?pmsetup=0 / 旧版) ときは従来の中央クリックへ落ちる。 */
    const pressedDepart = await page.evaluate(() => {
      const dep = document.getElementById('pmDepart');
      if (dep && dep.getClientRects().length > 0) { dep.click(); return true; }
      return false;
    });
    if (!pressedDepart)
      await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    await sleep(550);
  }
  if (!shown) throw new Error('準備画面 (#prep) が可視にならなかった — 演出の進行に失敗 [' + viewport.name + ']');
  await page.evaluate(() => { const ov = document.getElementById('prologueOverlay'); if (ov) ov.style.display = 'none'; });
  await sleep(300);
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
 * index.html 側の測定装置 (§0 / §1)
 * ══════════════════════════════════════════════════════════════════════════ */
// 仕込む優先度。⚠ localStorage は **遷移前** に書く
// (loadPersistentProgress はページ読み込み時に 1 回しか走らない)。
const AP_SEED = {
  warrior: { general: null, mob: null, boss: 'strong-cleave', travel: null },
  cleric:  { general: null, mob: null, boss: 'bless',         travel: null },
  mage:    { general: null, mob: null, boss: 'fireball',      travel: null },
};
// §2 (仲間) 用の仕込み。⭐ 「その職の AI が自力では絶対に選ばない技」を指定して、
//   先出しが既存の判断 (threatScore の梯子 / if 連鎖の順序) を素通りできるかを見る。
const AP_SEED_ALLY = {
  mage:    { general: null, mob: null, boss: 'fireball',       travel: null },
  rogue:   { general: null, mob: null, boss: 'thrown-dagger',  travel: null },
  warrior: { general: null, mob: null, boss: 'strong-cleave',  travel: null },
};
/* ── §3/§4 (道中詠唱・バフ退避) 用の seed ────────────────────────────────────
 * ⭐ 実プレイで観測するので、隊列も習得呪文も装備スキルも **本番の読み口** へ流し込む
 *   (index.html は sessionStorage.partyMembers / localStorage.knownSpells /
 *    localStorage.partySkills をページ読み込み時に 1 回だけ読む)。
 * ⚠⚠ 僧侶の bless は **スクロール習得制** で DEFAULT_KNOWN に入っていない (index.html:12254)。
 *    ここを seed しないと equippedSkills に bless が入らず、§3 の assert が全部空振りする。
 *    → (3a-0) が母集団ガードとして先に赤くなる。 */
const TRAVEL_PARTY = [
  { classKey: 'warrior', isHero: true, name: '勇者',   level: 5 },
  { classKey: 'cleric',  name: 'リタ',   level: 5 },
  { classKey: 'dwarf',   name: 'グリム', level: 5 },
];
const TRAVEL_KNOWN  = { cleric: ['cure-light-wounds', 'shield-of-faith', 'turn-undead', 'bless'], mage: [], elf: [] };
// ドワーフに battle-roar (1戦1回・mpCost 無し) を持たせる = (3d) の抜け道テストの母集団。
const TRAVEL_SKILLS = { dwarf: ['battle-roar', 'power-attack', 'shield-wall'] };
const AP_SEED_TRAVEL = {
  cleric: { general: null, mob: null, boss: null, travel: 'bless' },
  dwarf:  { general: null, mob: null, boss: null, travel: 'battle-roar' },   // 許可リスト外 = 一生撃てないのが正
};
// (4b) 用: 優先度そのものは生きているが「道中」だけ未設定 → 退避が常時バフ持ち越しに化けていないか。
const AP_SEED_NOTRAVEL = { cleric: { general: null, mob: null, boss: 'bless', travel: null } };
const TRAVEL_OPTS = { party: TRAVEL_PARTY, known: TRAVEL_KNOWN, skills: TRAVEL_SKILLS, xp: 10000 };

// ダイス表記の期待値。⛔ 重みの再実装ではない (「2d8 は今の武器より強い」を言うためだけ)。
const diceEV = (s) => {
  const m = /^(\d+)d(\d+)$/.exec(String(s || ''));
  return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : 0;
};

// 戦闘の自走が測定を汚さないよう敵を遠ざけて静穏化する (driver_leader_ai の QUIET を踏襲)
const QUIET = `
  try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
  try { encounterActive = false; } catch (e) {}
`;

const AP_HELPERS = `
  window.__apSample = function (choices, ctx, n) {
    const tally = {};
    for (const c of choices) tally[c] = 0;
    for (let i = 0; i < n; i++) { const r = window.pickLeaderAction(choices, ctx); tally[r.id] = (tally[r.id] || 0) + 1; }
    const share = {};
    for (const c of choices) share[c] = tally[c] / n;
    return { tally: tally, share: share };
  };
  window.__apMkTarget = function (opt) {
    opt = opt || {};
    const mx = (opt.maxHp != null ? opt.maxHp : 40);
    return { hp: (opt.hp != null ? opt.hp : mx), maxHp: mx, alive: true,
             def: opt.def || { name: 'ダミー', hp: mx } };
  };
  // 「ボス戦の最中」を **同期のうちに** 作って必ず戻す。pickLeaderAction のサンプリングは
  // 完全に同期なので、この間に非同期のゲームループが割り込むことは原理的に無い。
  // ⚠ enemies へ素の object を push しない (parallel array が並走している) → 配列ごと差し替えて戻す。
  window.__apWithBoss = function (fn) {
    const prevEnemies = enemies, prevIdx = encounterEnemyIndices, prevActive = encounterActive;
    try {
      enemies = [{ alive: true, hp: 100, maxHp: 100, def: { name: 'ボス', isBoss: true, hp: 100 } }];
      encounterEnemyIndices = [0];
      encounterActive = true;
      return fn();
    } finally {
      enemies = prevEnemies; encounterEnemyIndices = prevIdx; encounterActive = prevActive;
    }
  };
  // 指定あり / 指定なし を同一ページ・同一 RNG ストリームで採る。
  // ⭐ 本番の let をそのまま切り替えているだけ (計測用の分岐を本番へ足していない)。
  window.__apWithMap = function (map, fn) {
    const prev = actionPriorityMap;
    try { actionPriorityMap = map; return fn(); } finally { actionPriorityMap = prev; }
  };
`;

/* ── §2 (仲間) 用の測定装置 ─────────────────────────────────────────────────
 * ⭐⭐ 本物の ally* 関数は 1 手番あたり数秒の演出を回すので、分布を採る回数を稼げない。
 *    そこで **「実行」だけを記録用スタブへ差し替える**。決定ロジック (mageAI の
 *    threatScore 梯子・rogueAI の if 連鎖・apTryPreferred) は 1 行も触らない。
 * ⚠⚠ enemies / encounterEnemyIndices / encounterActive / actionPriorityMap は
 *    ループ全体を 1 回だけ包んで必ず戻す。スタブは即座に解決する async なので
 *    ループ中に **マクロタスクへ降りない** = 走行中のゲームループが割り込めない。
 * ⚠ enemies へ素の object を push しない (parallel array が並走している) → 配列ごと差し替える。
 */
const AP_ALLY_HELPERS = `
  window.__apMkAlly = function (classKey, equipped, slots, opt) {
    opt = opt || {};
    return {
      classKey: classKey, alive: true, stunned: 0, confused: 0, wildConfused: 0,
      hp: (opt.hp != null ? opt.hp : 30), maxHp: 30,
      x: (opt.x != null ? opt.x : 0), y: (opt.y != null ? opt.y : 0),
      def: { name: 'テスト' + classKey, displaySize: 96, role: 'backline', weaponRange: 'melee' },
      weaponRange: 'melee',
      statusEffects: [],
      buffs: { acBonusRemaining: 0, atkBonusRemaining: 0, strikingRemaining: 0, hastedRemaining: 0,
               blessMoveRemaining: 0, dmgReductionRemaining: 0, dmgReductionFlatRemaining: 0,
               antiKnockbackRemaining: 0, evasionRemaining: 0, luckyRemaining: 0,
               statusImmunityCharges: 0, frightenedRemaining: 0, fearImmuneRemaining: 0,
               dmgReductionDice: null, dmgReductionFlat: 0, luckyCritWiden: 0, sleepWatchHp: null },
      equippedSkills: equipped.slice(),
      spellSlots: Object.assign({}, slots || {}),
      maxSpellSlots: Object.assign({}, slots || {}),
      skillsUsedInEncounter: new Set(),
      skillCooldowns: {},
      el: null,
    };
  };
  window.__apMkBoss = function (ally, cfg) {
    cfg = cfg || {};
    return { alive: true, inactive: false, stunned: 0,
             hp: (cfg.bossHp != null ? cfg.bossHp : 10), maxHp: 40,
             x: ally.x + (cfg.dx != null ? cfg.dx : 96), y: ally.y,
             poisonRemaining: 0, huntMarkRemaining: 0,
             def: { name: 'ボス', isBoss: true, hp: 40, displaySize: 96 } };
  };
  // cfg = { classKey, equipped, slots, stubs, map, n, ai, bossHp, dx }
  // 返り = { tally: {スタブ名 or '(none)': 回数}, seamDelta: executeSkillOn 呼び出し増分 }
  window.__apAllyRun = async function (cfg) {
    const prevE = enemies, prevI = encounterEnemyIndices, prevA = encounterActive, prevM = actionPriorityMap;
    const seamBefore = (window.__apLog || []).length;
    const saved = {}, tally = {}, seq = [];
    let lastFn = null;
    for (const nm of cfg.stubs) { saved[nm] = window[nm]; }
    for (const nm of cfg.stubs) window[nm] = async function () { lastFn = nm; return true; };
    try {
      actionPriorityMap = cfg.map;
      for (let i = 0; i < cfg.n; i++) {
        const ally = window.__apMkAlly(cfg.classKey, cfg.equipped, cfg.slots, cfg);
        enemies = [window.__apMkBoss(ally, cfg)];
        encounterEnemyIndices = [0];
        encounterActive = true;
        lastFn = null;
        const fired = await window[cfg.ai](ally);
        const key = lastFn ? lastFn : (fired ? '(fired-unknown)' : '(none)');
        tally[key] = (tally[key] || 0) + 1;
        seq.push(key);
      }
    } finally {
      for (const nm of cfg.stubs) window[nm] = saved[nm];
      enemies = prevE; encounterEnemyIndices = prevI; encounterActive = prevA; actionPriorityMap = prevM;
    }
    return { tally: tally, seq: seq, seamDelta: (window.__apLog || []).length - seamBefore };
  };
`;

/* ── §7 (#34) 戦士の仲間 用の測定装置 ──────────────────────────────────────────
 * ⭐⭐⭐ §2 の装置 (__apAllyRun) は「実行」をスタブへ差し替えて **判断だけ** を採る。
 *   #34 は「指定した技が実際に実行され、盤面が動いたか」まで見るので、
 *   **演出だけを黙らせて本物の ally* 実装を走らせる** 別装置が要る (= 2 経路目)。
 * ⚠ 差し替えるのは描画・音・待ちだけ。判断とダイスは 1 行も触らない。
 * ⚠⚠ sleepMs を「即解決の Promise」へ差し替えるのでループ全体がマイクロタスクだけで
 *   回り、ゲームループ (マクロタスク) が割り込めない = 測定が原子的になる。
 * ⚠ 差し替えた描画関数は観測列 (__warTrace) へ書き出すので「何が起きたか」は失われない。 */
const WAR_HELPERS = `
  window.__warTrace = [];
  window.__warQuiet = function () {
    const T = window.__warTrace;
    const names = ['flashAction','startAllyAttackAnim','triggerLungeAlly','spawnSlashArc',
      'showRollAtAlly','showRollAtEnemy','showDmgAt','showHealAt','showHitSpark',
      'triggerEnemyDamageFlash','noteDisplacementHit','playMeleeSwing','playMeleeHit',
      'updateInfo','sayCritLine','spawnArrow','showSkillAnnounce','showBuffPop',
      'sleepMs','applyWeaponSpecialEffects','allyAdvanceTowardPoint','defeatEnemy',
      'tryDisplacement','golemPhysImmune','golemPhysResist','triggerRecoilAlly',
      'checkDwarvenGritTrigger',
      // ⚠ 負のコントロール N10 は仲間をリーダー用実装 (playerSingleAttack) へ流すので、
      //   頭側の演出も黙らせておかないと測定が DOM 例外で汚れる。
      'showRollAtPlayer','triggerLungePlayer','triggerRecoilPlayer','runSwingNoHit',
      'updateFacingFromMouse','sfx'];
    const saved = {};
    for (const nm of names) saved[nm] = window[nm];
    window.showRollAtPlayer = function (h, t) { T.push('RP:' + t + ':' + h); };
    window.triggerLungePlayer = function () {};
    window.triggerRecoilPlayer = function () {};
    window.runSwingNoHit = function () { return Promise.resolve(); };
    window.updateFacingFromMouse = function () {};
    window.sfx = function () {};
    window.sleepMs = function () { return Promise.resolve(); };
    window.flashAction = function () {};
    window.startAllyAttackAnim = function () {};
    window.triggerLungeAlly = function () {};
    window.spawnSlashArc = function () {};
    window.showHitSpark = function () {};
    window.triggerEnemyDamageFlash = function () {};
    window.triggerRecoilAlly = function () {};
    window.noteDisplacementHit = function () {};
    window.playMeleeSwing = function () {};
    window.playMeleeHit = function () {};
    window.sayCritLine = function () {};
    window.showSkillAnnounce = function () {};
    window.checkDwarvenGritTrigger = function () { return Promise.resolve(); };
    window.tryDisplacement = function () { return false; };
    window.golemPhysImmune = function () { return false; };
    window.golemPhysResist = function () { return false; };
    window.spawnArrow = function () { T.push('ARROW'); return Promise.resolve(); };
    window.applyWeaponSpecialEffects = function () { return Promise.resolve(); };
    window.allyAdvanceTowardPoint = function () { T.push('ADV'); return Promise.resolve(); };
    window.defeatEnemy = function (i) { T.push('DEAD:' + i); if (enemies[i]) enemies[i].alive = false; };
    window.showBuffPop = function (h) { T.push('BP:' + h); };
    window.showRollAtAlly  = function (a, h, t) { T.push('RA:' + t + ':' + h); };
    window.showRollAtEnemy = function (i, h, t) { T.push('RE:' + t + ':' + h); };
    window.showDmgAt  = function (x, y, d, c) { T.push('D:' + d + (c ? ':crit' : '')); };
    window.showHealAt = function (x, y, h) { T.push('HEAL:' + h); };
    window.updateInfo = function (m) { T.push('I:' + m); };
    return function () {
      for (const nm of names) {
        if (saved[nm] !== undefined) window[nm] = saved[nm];
        else { try { delete window[nm]; } catch (e) {} }
      }
    };
  };
  // 決定論の乱数 (mulberry32)。⚠ Math.random を丸ごと差し替えて必ず戻す。
  window.__warSeed = function (seed) {
    const prev = Math.random;
    let a = (seed >>> 0) || 1;
    Math.random = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return function () { Math.random = prev; };
  };
  window.__warMkEnemy = function (ally, cfg, k) {
    cfg = cfg || {}; k = k || 0;
    return { alive: true, inactive: false, stunned: 0, phase: 0,
             hp: (cfg.bossHp != null ? cfg.bossHp : 999), maxHp: 999,
             x: ally.x + (cfg.dx != null ? cfg.dx : 96) + k * 8, y: ally.y,
             poisonRemaining: 0, huntMarkRemaining: 0, huntMarkDie: 0,
             def: { name: 'ダミー' + k, isBoss: !!cfg.boss, hp: 999,
                    ac: (cfg.ac != null ? cfg.ac : 13), displaySize: 96 } };
  };
  // (7a-0)/(7k): opts を渡さない allyBasicAttack の観測列。
  //   ⭐⭐⭐ 返り値では比べない。着手前の版は返り値そのものを持たないので、返り値で
  //     比べると「従来の攻撃が変わったか」ではなく「口が開いたか」を見てしまう。
  window.__warBasicSeq = async function (classKey, n, seed) {
    const prevE = enemies, prevI = encounterEnemyIndices, prevA = encounterActive;
    window.__warTrace = [];
    const unquiet = window.__warQuiet();
    const unseed  = window.__warSeed(seed);
    try {
      encounterActive = true;
      for (let i = 0; i < n; i++) {
        const ally = createAlly(classKey, playerX, playerY);
        enemies = [window.__warMkEnemy(ally, {})];
        encounterEnemyIndices = [0];
        await allyBasicAttack(ally, 0);
      }
    } finally {
      unseed(); unquiet();
      enemies = prevE; encounterEnemyIndices = prevI; encounterActive = prevA;
    }
    const t = window.__warTrace; window.__warTrace = [];
    return t;
  };
  // 戦士 仲間版 7 本。⭐⭐⭐ **スタブではなく薄いラッパ**で「実際に走ったか」を記録する。
  //   ⚠ 既定の連鎖は executeSkillOn を通らず ally* を直に呼ぶので、__apLog (経路①) だけ
  //     見ていると (7j) が「そもそも記録されない」で自明に緑になる = 最悪の空振り。
  window.__WAR_FNS = ['allyStrongCleave', 'allySweep', 'allyFinisher', 'allyShieldBash',
                      'allyIronGuard', 'allyMorale', 'allyFightingSpirit'];
  window.__warWrap = function (buf) {
    const saved = {};
    for (const nm of window.__WAR_FNS) {
      saved[nm] = window[nm];
      if (typeof saved[nm] === 'function') {
        (function (n, f) {
          window[n] = async function () { buf.push(n); return await f.apply(null, arguments); };
        })(nm, saved[nm]);
      }
    }
    /* ⚠⚠⚠ 通常攻撃も記録する。⭐ これが無いと「先出しが外れて通常攻撃した手番」の
     *   ダメージ (= 武器の修正値が乗る) をスキルのダメージと取り違える。#34 実装中に
     *   (7b-2) が 54 ダメージで誤って赤くなったのがこれ。
     *   basicPlain = opts 無し (従来の通常攻撃) / basicOpts = スキル経由。 */
    const savedBA = window.allyBasicAttack;
    window.allyBasicAttack = async function (a, i, o) {
      buf.push(o ? 'basicOpts' : 'basicPlain');
      return await savedBA.apply(null, arguments);
    };
    return function () {
      for (const nm of window.__WAR_FNS) {
        if (saved[nm] !== undefined) window[nm] = saved[nm];
      }
      window.allyBasicAttack = savedBA;
    };
  };
  // (7c): 本番の apTryPreferred を 1 回だけ直に叩き、返り値と盤面の両方を採る。
  window.__warTryPreferred = async function (cfg) {
    const prevE = enemies, prevI = encounterEnemyIndices, prevA = encounterActive, prevM = actionPriorityMap;
    window.__warTrace = [];
    const ran = [];
    const unwrap  = window.__warWrap(ran);
    const unquiet = window.__warQuiet();
    const unseed  = window.__warSeed(cfg.seed || 31415);
    const out = { r: null, ran: ran, seamDelta: 0, enemyDmg: 0, playerHpDelta: 0, err: null };
    try {
      actionPriorityMap = cfg.map || null;
      encounterActive = true;
      const ally = createAlly('warrior', playerX, playerY);
      if (cfg.equipped) ally.equippedSkills = cfg.equipped.slice();
      if (cfg.hp != null) ally.hp = cfg.hp;
      const nE = (cfg.enemies != null) ? cfg.enemies : 1;
      enemies = []; encounterEnemyIndices = [];
      for (let k = 0; k < nE; k++) { enemies.push(window.__warMkEnemy(ally, cfg, k)); encounterEnemyIndices.push(k); }
      const seamBefore = (window.__apLog || []).length;
      const eHpBefore = enemies.reduce((s, e) => s + e.hp, 0);
      const pHpBefore = hp;
      out.r = await apTryPreferred(ally);
      out.seamDelta = (window.__apLog || []).length - seamBefore;
      out.enemyDmg = eHpBefore - enemies.reduce((s, e) => s + e.hp, 0);
      out.playerHpDelta = hp - pHpBefore;
      out.allyHp = ally.hp;
    } catch (e) { out.err = String((e && e.message) || e); }
    finally {
      unseed(); unquiet(); unwrap();
      enemies = prevE; encounterEnemyIndices = prevI; encounterActive = prevA; actionPriorityMap = prevM;
    }
    return out;
  };
  // §7 本体: 本物の allyAttackTurn を n 手番まわし、毎手番の盤面を写し取る。
  window.__warRun = async function (cfg) {
    const prevE = enemies, prevI = encounterEnemyIndices, prevA = encounterActive, prevM = actionPriorityMap;
    window.__warTrace = [];
    const ranBuf = [];
    const unwrap  = window.__warWrap(ranBuf);
    const unquiet = window.__warQuiet();
    const unseed  = window.__warSeed(cfg.seed || 20260829);
    /* ⚠⚠⚠ 主人公の hp を任意の値から始められるようにする。⭐ 満タンのまま測ると
     *   「仲間の闘志で主人公が回復する」欠陥 (N10) が Math.min(maxHp, ...) に吸われて
     *   **主人公の hp が動かない = 正常** に見えてしまう (#34 実装中に実際に空振りした)。 */
    const prevPlayerHp = hp;
    if (cfg.playerHp != null) hp = cfg.playerHp;
    const out = { turns: [], skills: [], ran: ranBuf, playerHpStart: hp, playerHpEnd: null, err: null, trace: null };
    try {
      actionPriorityMap = cfg.map || null;
      encounterActive = true;
      const ally = createAlly('warrior', playerX, playerY);
      ally.npcName = 'テスト戦士';
      if (cfg.equipped) ally.equippedSkills = cfg.equipped.slice();
      if (cfg.hp != null) ally.hp = cfg.hp;
      if (cfg.str != null) ally.str = cfg.str;
      if (cfg.dmgBonus != null) ally.dmgBonus = cfg.dmgBonus;
      const nE = (cfg.enemies != null) ? cfg.enemies : 1;   // ⚠ 0 を 1 へ潰さない (7i の母集団)
      enemies = []; encounterEnemyIndices = [];
      for (let k = 0; k < nE; k++) { enemies.push(window.__warMkEnemy(ally, cfg, k)); encounterEnemyIndices.push(k); }
      out.allyStart = { hp: ally.hp, maxHp: ally.maxHp, str: ally.str, critMult: ally.critMult,
                        dmgDice: ally.dmgDice, dmgBonus: ally.dmgBonus,
                        equipped: ally.equippedSkills.slice() };
      for (let t = 0; t < cfg.n; t++) {
        // ⚠⚠ 敵のスタンは誰も減らさないので、消さないと 1 回当たった時点で以後ずっと
        //   helpless = 自動クリになり、(7e) の「外した試行」が作れなくなる。
        if (cfg.clearEnemyStun) for (const e of enemies) e.stunned = 0;
        const before = (window.__apLog || []).length;
        const ranBefore = ranBuf.length;
        const rec = { t: t,
          stunBefore: ally.stunned || 0,
          atkRemBefore: ally.buffs.atkBonusRemaining || 0,
          drRemBefore: ally.buffs.dmgReductionRemaining || 0,
          hpBefore: ally.hp,
          eHpBefore: enemies.map(e => e.hp) };
        await allyAttackTurn(ally);
        rec.fired = (window.__apLog || []).slice(before).map(r => r.skillId);
        rec.ran   = ranBuf.slice(ranBefore);   // ⭐ 実際に走った ally* (既定の連鎖もここに出る)
        rec.stunAfter    = ally.stunned || 0;
        rec.skipNextTurn = !!(ally.buffs && ally.buffs.skipNextTurn);
        rec.atkRemAfter  = ally.buffs.atkBonusRemaining || 0;
        rec.drRemAfter   = ally.buffs.dmgReductionRemaining || 0;
        rec.hpAfter      = ally.hp;
        rec.eHpAfter     = enemies.map(e => e.hp);
        rec.eStunned     = enemies.map(e => e.stunned || 0);
        rec.dmg = rec.eHpBefore.reduce((s, v, i) => s + (v - rec.eHpAfter[i]), 0);
        out.turns.push(rec);
        out.skills = out.skills.concat(rec.fired);
        if (cfg.reviveEnemies !== false) {
          for (let k = 0; k < enemies.length; k++)
            if (!enemies[k].alive || enemies[k].hp <= 0) enemies[k] = window.__warMkEnemy(ally, cfg, k);
        }
      }
      out.allyEnd = { hp: ally.hp, maxHp: ally.maxHp, stunned: ally.stunned || 0 };
    } catch (e) { out.err = String((e && e.message) || e); }
    finally {
      unseed(); unquiet(); unwrap();
      enemies = prevE; encounterEnemyIndices = prevI; encounterActive = prevA; actionPriorityMap = prevM;
    }
    out.playerHpEnd = hp;
    if (cfg.playerHp != null) hp = prevPlayerHp;   // ⚠ 必ず戻す (以後の測定を汚さない)
    out.trace = window.__warTrace.slice(0, 400); window.__warTrace = [];
    return out;
  };
`;

async function openIndexPage(browser, qs, seedAp, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push('index :: ' + e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((ap, o) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      if (ap) localStorage.setItem('dragonfighters.actionPriority', JSON.stringify(ap));
      else localStorage.removeItem('dragonfighters.actionPriority');
      // ⚠ 隊列 / 習得呪文 / 装備スキルは **遷移前** に置く (どれも読み込み時に 1 回しか読まれない)。
      if (o && o.party) sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(o.party));
      else sessionStorage.removeItem('dragonfighters.partyMembers');
      if (o && o.known)  localStorage.setItem('dragonfighters.knownSpells', JSON.stringify(o.known));
      if (o && o.skills) localStorage.setItem('dragonfighters.partySkills', JSON.stringify(o.skills));
      if (o && o.xp)     localStorage.setItem('dragonfighters.xp', String(o.xp));
    } catch (e) {}
    /* 実プレイ観測用の連続サンプラ。
     * ⭐⭐⭐ 固定時間窓のポーリングでは「敵が alert になった一瞬」を取りこぼす
     *   (alertTimer は約 480ms で chase へ抜け、接敵まではさらに短い)。
     *   → 50ms の常設サンプラで **回数** を数える。(0d) の母集団はこれで採る。
     * __apEarlyCast = 「まだ誰にも気づかれていないのに道中詠唱が記録された」回数 = (3b) の実プレイ版。
     *   ⚠ 一度 aware になった後は数えない (過去のログを数え続けて永久に赤くなるのを防ぐ)。 */
    window.__apAware = 0;
    window.__apEarlyCast = 0;
    try {
      setInterval(function () {
        try {
          if (typeof window.apTravelEnemyAware !== 'function') return;
          if (typeof encounterActive === 'undefined' || encounterActive) return;
          if (typeof currentPhase === 'undefined' || currentPhase !== 'explore') return;
          if (window.apTravelEnemyAware()) { window.__apAware++; return; }
          if (window.__apAware > 0) return;
          if ((window.__apLog || []).some(function (r) { return r.phase === 'explore' && !r.isLeader; }))
            window.__apEarlyCast++;
        } catch (e) {}
      }, 50);
    } catch (e) {}
  }, seedAp || null, { party: opts.party || null, known: opts.known || null,
                       skills: opts.skills || null, xp: opts.xp || null });
  await page.goto('http://localhost:' + PORT + (opts.path || '/index.html') + '?' + (qs || 'autoplay=30&diag=1'),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
    { timeout: 45000 });
  await sleep(400);
  // 実プレイ観測ページ (quiet:false) だけは静穏化しない。歩いて・見つかって・戦うのが測定対象。
  if (opts.quiet !== false) await page.evaluate(QUIET);
  await page.evaluate(AP_HELPERS);
  return page;
}

/* 「出るまでポーリング」。⭐ 固定 sleep は共有キュー (ゲームループ) のある所では原理的にフレークする。 */
async function pollUntil(page, fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await page.evaluate(fn);
    if (last && last.done) return last;
    await sleep(stepMs || 400);
  }
  return last;
}

/* ── 道中詠唱を「決定論の盤面」で叩くための装置 (QUIET 済みページ専用) ──────────
 * ⭐ 叩くのは **本番の apTryTravelCast** そのもの。決定ロジックは 1 行も触らない。
 * ⚠ 敵は QUIET で遠方へ退避済みなので、state を書き換えても交戦は始まらない
 *   (= 条件 6 だけを独立に動かせる)。 */
const AP_CTL_HELPERS = `
  window.__apCtlSetup = function (state) {
    for (const e of enemies) { if (!e.alive) continue; e.state = state; e.alertTimer = 9999; }
    return enemies.filter(e => e.alive).map(e => e.state);
  };
  // 「祝福が切れた」状態を作る。⭐ これが無いと apIsWastedCast が先に止めてしまい、
  //   ラッチ (条件 7) が効いているのかどうかを区別できない = N6 が空振りする。
  window.__apCtlClearBuffs = function () {
    playerBuffs.atkBonusRemaining = 0; playerBuffs.atkBonusAmount = 0; playerBuffs.blessMoveRemaining = 0;
    for (const a of allies) {
      a.buffs.atkBonusRemaining = 0; a.buffs.atkBonusAmount = 0; a.buffs.blessMoveRemaining = 0;
    }
  };
  window.__apCtlAlly  = function (cls) { return allies.find(a => a.classKey === cls) || null; };
  window.__apCtlCount = function (id) {
    return (window.__apLog || []).filter(r => r.skillId === id).length;
  };
  window.__apCtlRun = async function (cls, n, opt) {
    opt = opt || {};
    const out = { fired: [], aware: [], states: null, before: window.__apCtlCount(opt.id), after: 0 };
    for (let i = 0; i < n; i++) {
      if (opt.state) out.states = window.__apCtlSetup(opt.state);
      if (opt.clearBuffs) window.__apCtlClearBuffs();
      // ⭐ state を書いてから apTryTravelCast の条件 6 判定までは **完全に同期** なので、
      //   ゲームループ (setInterval/rAF = マクロタスク) は割り込めない。
      //   1 発も撃たない回は await がマイクロタスクしか消費しない = ループ全体が原子的。
      out.aware.push(window.apTravelEnemyAware());
      out.fired.push(!!(await window.apTryTravelCast(window.__apCtlAlly(cls))));
    }
    out.after = window.__apCtlCount(opt.id);
    return out;
  };
`;

/* 1 職ぶんの観測。⭐ 「今の枠」はドライバが **selection.partySkills / CLERIC 表から独立に**
   組み立て、実装が描いた option と突き合わせる (2 経路)。 */
async function readClass(page, classKey) {
  return page.evaluate((ck) => {
    window.__equipTV.setTab(ck);
    const slot = PARTY_SLOTS.find(s => s && s.classKey === ck);
    const out = {
      classKey: ck,
      poolIds: slot.skillPool.map(sk => sk.id),
      selectCount: document.querySelectorAll('#apRows select').length,
      rowCount: document.querySelectorAll('#apRows .apRow').length,
      hintText: (document.getElementById('apHint') || {}).textContent || '',
      rows: {},
    };
    // ── 経路 B: ドライバが元データから組み立てる「今そのキャラが枠に入れている技」 ──
    if (ck === 'cleric') {
      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));
      out.equippedByData = slot.skillPool
        .filter(sk => (auto[sk.id] || 0) > 0 && isSpellKnownTV(ck, sk.id)).map(sk => sk.id);
    } else {
      const owned = new Set(Array.isArray(selection.partySkills[ck]) ? selection.partySkills[ck] : []);
      out.equippedByData = slot.skillPool.filter(sk => owned.has(sk.id)).map(sk => sk.id);
    }
    for (const sit of ['general', 'mob', 'boss', 'travel']) {
      const sel = document.getElementById('apSel_' + ck + '_' + sit);
      if (!sel) { out.rows[sit] = { exists: false }; continue; }
      const rowEl = sel.closest('.apRow');
      out.rows[sit] = {
        exists: true,
        visible: !!rowEl && getComputedStyle(rowEl).display !== 'none',
        values: Array.prototype.map.call(sel.options, o => o.value),
        labels: Array.prototype.map.call(sel.options, o => o.textContent),
        value: sel.value,
      };
    }
    return out;
  }, classKey);
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT + (NEGATIVE ? '   [NEGATIVE]' : ''));

  const profile = require('./_pptr_profile')('df_actionpri_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  try {
    /* ════════════════════════════════════════════════════════════════════
     * §0 装置 + §1 主人公 — index.html 側 (項目② の担当)
     * ════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§0) 装置: 母集団と二重定義の突合 ---');
    const idxPage = await openIndexPage(browser, 'autoplay=30&diag=1', AP_SEED);

    const seam0 = await idxPage.evaluate(() => ({
      hasPreferred: typeof window.apPreferredId === 'function',
      hasSituation: typeof window.apSituationNow === 'function',
      hasGate:      typeof window.apGateP === 'function',
      on:           window.ACTION_PRIORITY_ON,
      boost:        window.AP_BOOST,
      // 注意: LEADER_PICK_T / LEADER_W_MAX は classic script 直下の const = window に載らない → 裸で読む
      pickT:        (typeof LEADER_PICK_T !== 'undefined') ? LEADER_PICK_T : null,
      wMax:         (typeof LEADER_W_MAX  !== 'undefined') ? LEADER_W_MAX  : null,
      travel:       window.AP_TRAVEL_CASTABLE ? Array.from(window.AP_TRAVEL_CASTABLE) : null,
      mageBoss:     window.apPreferredId('mage',    'boss'),
      clericBoss:   window.apPreferredId('cleric',  'boss'),
      warriorBoss:  window.apPreferredId('warrior', 'boss'),
      dwarfBoss:    window.apPreferredId('dwarf',   'boss'),
      mageMob:      window.apPreferredId('mage',    'mob'),
      sitQuiet:     window.apSituationNow(),
      sitBoss:      window.__apWithBoss(() => window.apSituationNow()),
    }));

    check('(0a-0) 装置: apPreferredId / apSituationNow / apGateP / AP_BOOST が window に載っている',
      seam0.hasPreferred && seam0.hasSituation && seam0.hasGate && typeof seam0.boost === 'number',
      JSON.stringify({ pref: seam0.hasPreferred, sit: seam0.hasSituation, gate: seam0.hasGate,
                       boost: seam0.boost, on: seam0.on, T: seam0.pickT, wMax: seam0.wMax }));
    // ⭐⭐⭐ ここが null のまま §1 が全部緑になるのが最悪の空振り。
    check('(0a) window.apPreferredId("mage","boss") が仕込んだ ID を返す',
      seam0.mageBoss === AP_SEED.mage.boss && seam0.clericBoss === AP_SEED.cleric.boss
        && seam0.warriorBoss === AP_SEED.warrior.boss,
      'mage/boss=' + JSON.stringify(seam0.mageBoss) + ' cleric/boss=' + JSON.stringify(seam0.clericBoss)
        + ' warrior/boss=' + JSON.stringify(seam0.warriorBoss));
    check('(0a-2) 仕込んでいない職は null / general 未設定の枠も null (何でも返す実装ではない)',
      seam0.dwarfBoss === null && seam0.mageMob === null,
      'dwarf/boss=' + JSON.stringify(seam0.dwarfBoss) + ' mage/mob=' + JSON.stringify(seam0.mageMob));
    check('(0a-3) apSituationNow が travel / boss を実際に作り分ける (§1 のボス状況が本物である証明)',
      seam0.sitQuiet === 'travel' && seam0.sitBoss === 'boss',
      '非戦闘=' + JSON.stringify(seam0.sitQuiet) + ' ボス格交戦中=' + JSON.stringify(seam0.sitBoss));

    // ── (0b) 二重定義の突合 (tavern ↔ index) ────────────────────────────
    const tPeek = await browser.newPage();
    tPeek.on('pageerror', e => pageErrors.push('tavern-peek :: ' + e.message));
    await tPeek.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await tPeek.waitForFunction("typeof TRAVEL_CASTABLE_IDS !== 'undefined'", { timeout: 20000 });
    const tavernTravel = await tPeek.evaluate(() => TRAVEL_CASTABLE_IDS.slice());
    await tPeek.close();
    const tvArr = Array.isArray(tavernTravel) ? tavernTravel : [];
    const ixArr = Array.isArray(seam0.travel) ? seam0.travel : [];
    const travelDiff = tvArr.filter(x => ixArr.indexOf(x) < 0).concat(ixArr.filter(x => tvArr.indexOf(x) < 0));
    check('(0b) tavern の TRAVEL_CASTABLE_IDS と index の AP_TRAVEL_CASTABLE が集合として一致 (10 件)',
      tvArr.length === 10 && ixArr.length === 10 && setEq(tvArr, ixArr) && setEq(ixArr, EXPECT_TRAVEL_IDS),
      'tavern n=' + tvArr.length + ' index n=' + ixArr.length + ' 片側にしか無い ID=' + JSON.stringify(travelDiff));

    console.log('  ..  (0c) 計測シームの母集団ガードは §2 の計測後に出す (下の "(0c)" を見ること)');
    console.log('  ..  (0d) 道中の母集団ガードは §3 の実プレイ観測後に出す (下の "(0d)" を見ること)');

    console.log('\n--- (§1) 主人公: 重み倍率がクランプに食われていない ---');
    const AP_N = 6000;

    // ── (1a)(1b) 僧侶リーダー・boss = bless ──────────────────────────────
    const s1 = await idxPage.evaluate((N) => {
      leaderClassKey = 'cleric';
      encounterRound = 1;        // bless は開幕バフ = 実際に張る場面
      hp = maxHp;                // 回復候補が混ざらない状態に固定
      const cs = ['normal', 'bless'];
      const target = window.__apMkTarget({ hp: 40, maxHp: 40, def: { name: 'ボス', isBoss: true, hp: 40 } });
      const saved = actionPriorityMap;
      return window.__apWithBoss(() => ({
        sit:    window.apSituationNow(),
        prefId: window.apPreferredId('cleric', window.apSituationNow()),
        none:   window.__apWithMap(null,  () => window.__apSample(cs, { target: target }, N)).share,
        pref:   window.__apWithMap(saved, () => window.__apSample(cs, { target: target }, N)).share,
      }));
    }, AP_N);

    check('(1a-0) 前提: 状況が boss と判定され、僧侶の指定が bless に解決している',
      s1.sit === 'boss' && s1.prefId === 'bless',
      'sit=' + s1.sit + ' prefId=' + JSON.stringify(s1.prefId));
    check('(1a) 僧侶リーダー boss=bless でシェアが有意に上がる',
      s1.pref.bless > s1.none.bless + 0.05,
      '指定なし=' + s1.none.bless.toFixed(4) + ' → 指定あり=' + s1.pref.bless.toFixed(4) + ' (N=' + AP_N + '/両側)');

    // ⭐ 2 経路目: ページから読んだ AP_BOOST と LEADER_PICK_T だけで期待シェアを独立計算する。
    //   倍率はクランプ後の重みに掛かるので、勝った候補の最終重みはちょうど B = AP_BOOST^(1/T) 倍。
    //   他候補の重みは 1 ビットも動かないので、指定なしのシェア s0 から
    //     s = s0*B / (1 - s0 + s0*B)
    //   が一意に決まる。⛔ ドライバ側で重み式を再実装していない (s0 は実測値)。
    const apT   = Math.min(4, Math.max(0.2, Number(seam0.pickT)));   // 実装と同じ温度クランプ
    const apB   = Math.pow(Number(seam0.boost), 1 / apT);
    const s0    = s1.none.bless;
    const s1exp = (s0 * apB) / (1 - s0 + s0 * apB);
    check('(1b) シェア差が AP_BOOST^(1/T) から独立計算した期待シェアと一致 (±0.05)',
      apB > 1 && Math.abs(s1exp - s1.pref.bless) <= 0.05,
      'B=' + apB.toFixed(4) + ' 期待=' + s1exp.toFixed(4) + ' 実測=' + s1.pref.bless.toFixed(4)
        + ' 差=' + Math.abs(s1exp - s1.pref.bless).toFixed(4));

    // ── (1c) クランプに張り付く候補でも効くか (§2-4 の罠の本丸) ──────────
    const s1c = await idxPage.evaluate((N) => {
      leaderClassKey = 'warrior';
      encounterRound = 5;        // バフ加点を切って攻撃同士の比較にする
      hp = maxHp;
      // ⭐ 撃破圏 (hp=1) のボス格にすると、通常攻撃も強斬りも生重みが LEADER_W_MAX=3 を超えて
      //    上限に張り付く。鉄壁の構え (dmgDice も healDice も持たない = その他扱いで常に 1.0) だけが
      //    張り付かないので、3 者のシェアで「クランプが効いている」ことが読める。
      const target = window.__apMkTarget({ hp: 1, maxHp: 40, def: { name: 'ボス', isBoss: true, hp: 40 } });
      const cs = ['normal', 'strong-cleave', 'iron-guard'];
      const saved = actionPriorityMap;
      const wpn = (typeof getCurrentWeapon === 'function' && getCurrentWeapon()) || null;
      return window.__apWithBoss(() => ({
        prefId:     window.apPreferredId('warrior', window.apSituationNow()),
        weaponDice: (wpn && wpn.dmgDice) || (typeof playerStats !== 'undefined' ? playerStats.dmgDice : null),
        skillDice:  (CLASS_SKILL_DICTS.warrior['strong-cleave'] || {}).dmgDice,
        none: window.__apWithMap(null,  () => window.__apSample(cs, { target: target }, N)).share,
        pref: window.__apWithMap(saved, () => window.__apSample(cs, { target: target }, N)).share,
      }));
    }, AP_N);

    check('(1c-0) 前提: 指定が強斬りに解決し、強斬り (2d8) の期待値が今の武器より厳密に大きい',
      s1c.prefId === 'strong-cleave' && diceEV(s1c.skillDice) > diceEV(s1c.weaponDice),
      'prefId=' + JSON.stringify(s1c.prefId) + ' 技=' + s1c.skillDice + '(EV ' + diceEV(s1c.skillDice) + ')'
        + ' 武器=' + s1c.weaponDice + '(EV ' + diceEV(s1c.weaponDice) + ')');
    check('(1c-1) 前提: 指定なしで 通常攻撃 と 強斬り のシェアが一致し 鉄壁の構え だけ低い (上限に張り付いている証拠)',
      Math.abs(s1c.none['normal'] - s1c.none['strong-cleave']) <= 0.03
        && s1c.none['iron-guard'] < s1c.none['normal'] - 0.05,
      'normal=' + s1c.none['normal'].toFixed(4) + ' cleave=' + s1c.none['strong-cleave'].toFixed(4)
        + ' guard=' + s1c.none['iron-guard'].toFixed(4));
    check('(1c) LEADER_W_MAX に張り付く候補でもシェアが上がる (罠 §2-4 の本丸)',
      s1c.pref['strong-cleave'] > s1c.none['strong-cleave'] + 0.05,
      '指定なし=' + s1c.none['strong-cleave'].toFixed(4) + ' → 指定あり=' + s1c.pref['strong-cleave'].toFixed(4));

    // ── (1d) RNG パリティ (driver_leader_ai G2 と同じ測り方) ─────────────
    const s1d = await idxPage.evaluate(() => {
      leaderClassKey = 'warrior';
      encounterRound = 1;
      hp = maxHp;
      const target = window.__apMkTarget({ hp: 20, maxHp: 40, def: { name: 'ボス', isBoss: true, hp: 40 } });
      const real = Math.random;
      let n = 0;
      Math.random = function () { n++; return real.apply(this, arguments); };
      const out = {};
      try {
        window.__apWithBoss(() => {
          out.prefId = window.apPreferredId('warrior', window.apSituationNow());
          for (const cs of [['normal'], ['normal', 'strong-cleave'],
                            ['normal', 'strong-cleave', 'iron-guard', 'morale']]) {
            n = 0;
            window.pickLeaderAction(cs, { target: target });
            out['n' + cs.length] = n;
          }
        });
      } finally { Math.random = real; }
      return out;
    });
    check('(1d) RNG パリティ: pickLeaderAction 1 回あたり Math.random ちょうど 1 回',
      s1d.prefId === 'strong-cleave' && s1d.n1 === 1 && s1d.n2 === 1 && s1d.n4 === 1,
      '倍率が乗る指定=' + JSON.stringify(s1d.prefId) + ' 候補1=' + s1d.n1 + ' 候補2=' + s1d.n2 + ' 候補4=' + s1d.n4);

    await idxPage.close();

    console.log('\n--- (§2) 仲間: 先出しが効き、指定外は不変 ---');
    const allyPage = await openIndexPage(browser, 'autoplay=30&diag=1', AP_SEED_ALLY);
    await allyPage.evaluate(AP_ALLY_HELPERS);

    const seamOk = await allyPage.evaluate(() => ({
      hasRun:   typeof window.__apAllyRun === 'function',
      hasTry:   typeof window.apTryPreferred === 'function',
      hasExec:  typeof window.executeSkillOn === 'function',
      logIsArr: Array.isArray(window.__apLog) || window.__apLog === undefined,
      mageBoss: window.apPreferredId('mage', 'boss'),
      rogueBoss: window.apPreferredId('rogue', 'boss'),
    }));
    check('(2-装置) apTryPreferred / executeSkillOn が実在し、仲間の指定が解決している',
      seamOk.hasRun && seamOk.hasTry && seamOk.hasExec
        && seamOk.mageBoss === AP_SEED_ALLY.mage.boss && seamOk.rogueBoss === AP_SEED_ALLY.rogue.boss,
      JSON.stringify(seamOk));

    // ── (2a) 魔法使い: threatScore の梯子を素通りできているか ──────────────────
    //   equip = [fire-bolt, magic-missile, fireball, ice-storm] / 敵 HP 10 → threatScore ≤ 25。
    //   梯子は 32/30/25/25/20 の閾値をどれも満たさず fallbackOrder の先頭 = ice-storm へ落ちる。
    //   ⭐ つまり **指定なしでは fireball が 1 回も出ない盤面**。ここで fireball が出れば
    //      「梯子を素通りした」ことの直接証拠になる。
    const MAGE_N = 300;
    const MAGE_STUBS = ['allyMagicMissile', 'allyFireBolt', 'allySleep', 'allyArcaneShield',
                        'allyFireball', 'allyLightningBolt', 'allyConeOfCold', 'allyBurningHands', 'allyIceStorm'];
    const mageCfg = {
      classKey: 'mage', ai: 'mageAI', n: MAGE_N, bossHp: 10, dx: 96, stubs: MAGE_STUBS,
      equipped: ['fire-bolt', 'magic-missile', 'fireball', 'ice-storm'],
      slots: { 'fire-bolt': 9, 'magic-missile': 9, 'fireball': 9, 'ice-storm': 9 },
    };
    const mageNone = await allyPage.evaluate((c) => window.__apAllyRun(Object.assign({}, c, { map: null })), mageCfg);
    const magePref = await allyPage.evaluate((c, m) => window.__apAllyRun(Object.assign({}, c, { map: m })), mageCfg, AP_SEED_ALLY);
    const mageFbNone = (mageNone.tally.allyFireball || 0) / MAGE_N;
    const mageFbPref = (magePref.tally.allyFireball || 0) / MAGE_N;
    check('(2a-0) 母集団: 指定なしでは 300 回すべて梯子の結論 (ice-storm) に落ち、fireball が 0 回',
      (mageNone.tally.allyIceStorm || 0) === MAGE_N && mageFbNone === 0,
      '指定なしの内訳 = ' + JSON.stringify(mageNone.tally));
    check('(2a) 魔法使い仲間 boss=fireball で fireball のシェアが上がる (threatScore の梯子を素通り)',
      mageFbPref > mageFbNone + 0.2,
      '指定なし=' + mageFbNone.toFixed(3) + ' → 指定あり=' + mageFbPref.toFixed(3)
        + '  指定ありの内訳 = ' + JSON.stringify(magePref.tally));
    check('(2a-2) 先出しが外れた手番は従来の連鎖 (ice-storm) へ落ちている (手番を潰していない)',
      (magePref.tally['(none)'] || 0) === 0
        && (magePref.tally.allyFireball || 0) + (magePref.tally.allyIceStorm || 0) === MAGE_N,
      JSON.stringify(magePref.tally));

    // ── (2b) 盗賊 (確率ゲート 0 本 = 完全に決定論) でも先出しが効くか ───────────
    //   敵は隣接 (dist=1)。rogueAI の ① 毒塗り短剣が無条件で先に決まる盤面で、
    //   ③ 投げナイフ (dist 2〜3 が条件なので **絶対に選ばれない**) を指定する。
    const ROGUE_N = 300;
    const ROGUE_STUBS = ['allyPoisonBlade', 'allyShadowStep', 'allyThrownDagger', 'allySmokeBomb',
                         'allyLucky', 'allyEvasion'];
    const rogueCfg = {
      classKey: 'rogue', ai: 'rogueAI', n: ROGUE_N, bossHp: 10, dx: 96, stubs: ROGUE_STUBS,
      equipped: ['poison-blade', 'thrown-dagger', 'smoke-bomb', 'lucky', 'evasion'], slots: {},
    };
    const rogueNone = await allyPage.evaluate((c) => window.__apAllyRun(Object.assign({}, c, { map: null })), rogueCfg);
    const roguePref = await allyPage.evaluate((c, m) => window.__apAllyRun(Object.assign({}, c, { map: m })), rogueCfg, AP_SEED_ALLY);
    const rgTdNone = (rogueNone.tally.allyThrownDagger || 0) / ROGUE_N;
    const rgTdPref = (roguePref.tally.allyThrownDagger || 0) / ROGUE_N;
    check('(2b-0) 母集団: 指定なしでは 300 回すべて 毒塗り短剣 で、投げナイフは 0 回',
      (rogueNone.tally.allyPoisonBlade || 0) === ROGUE_N && rgTdNone === 0,
      '指定なしの内訳 = ' + JSON.stringify(rogueNone.tally));
    check('(2b) 盗賊 (確率ゲート 0 本) でも先出しが効く',
      rgTdPref > rgTdNone + 0.2,
      '指定なし=' + rgTdNone.toFixed(3) + ' → 指定あり=' + rgTdPref.toFixed(3)
        + '  指定ありの内訳 = ' + JSON.stringify(roguePref.tally));

    // ── (0c) 母集団ガード: 計測シームが実際に捕まえているか ────────────────────
    //   ⭐⭐⭐ ここが 0 のまま §2 が緑になるのが最悪の空振り。
    const seamCount = await allyPage.evaluate(() => ({
      total: (window.__apLog || []).length,
      byId: (window.__apLog || []).reduce((m, r) => { m[r.classKey + '/' + r.skillId] = (m[r.classKey + '/' + r.skillId] || 0) + 1; return m; }, {}),
    }));
    check('(0c) 計測シームが executeSkillOn を 1 回以上捕まえている (ログが空でない)',
      seamCount.total > 0, 'n=' + seamCount.total + ' ' + JSON.stringify(seamCount.byId));
    check('(0c-2) 捕まえた呼び出しがすべて仲間経路 (isLeader=false) で、指定した技だけ',
      await allyPage.evaluate((seed) => (window.__apLog || []).every(r =>
        r.isLeader === false && seed[r.classKey] && seed[r.classKey].boss === r.skillId), AP_SEED_ALLY),
      JSON.stringify(seamCount.byId));

    // ── (2c) 指定外の非退行: apGateP は「上げるだけ」で「下げない」 ─────────────
    //   ⚠ N2 (Math.max → Math.min) はここで赤くなる。
    const GATE_BASES = [0.3, 0.35, 0.4, 0.5, 0.6, 0.7];
    const g2c = await allyPage.evaluate((bases) => {
      const unit = { classKey: 'cleric' };
      return window.__apWithBoss(() => {
        const out = { sit: window.apSituationNow(), apP: window.AP_P, none: [], pref: [], other: [] };
        window.__apWithMap(null, () => { for (const b of bases) out.none.push(window.apGateP(unit, 'bless', b)); });
        window.__apWithMap({ cleric: { general: null, mob: null, boss: 'bless', travel: null } }, () => {
          for (const b of bases) out.pref.push(window.apGateP(unit, 'bless', b));
          for (const b of bases) out.other.push(window.apGateP(unit, 'striking', b));
        });
        return out;
      });
    }, GATE_BASES);
    check('(2c-0) 母集団: AP_P が最大の base (0.7) より大きい = 引き上げが実際に起きる帯にいる',
      g2c.sit === 'boss' && g2c.apP > Math.max.apply(null, GATE_BASES),
      'sit=' + g2c.sit + ' AP_P=' + g2c.apP + ' base 最大=' + Math.max.apply(null, GATE_BASES));
    check('(2c-1) 指定なしのとき 20 箇所の base 値 (0.3/0.35/0.4/0.5/0.6/0.7) が厳密にそのまま返る',
      GATE_BASES.every((b, i) => g2c.none[i] === b),
      JSON.stringify(g2c.none));
    check('(2c-2) 指定ありのとき Math.max(base, AP_P) と厳密に一致する (上げるだけで下げない)',
      GATE_BASES.every((b, i) => g2c.pref[i] === Math.max(b, g2c.apP)),
      '実測=' + JSON.stringify(g2c.pref) + ' 期待=' + JSON.stringify(GATE_BASES.map(b => Math.max(b, g2c.apP))));
    check('(2c-3) 指定した技以外は 1 ビットも動かない (同じ職の別の技は base のまま)',
      GATE_BASES.every((b, i) => g2c.other[i] === b),
      JSON.stringify(g2c.other));

    /* ── (2d) は #34 で **削除** した ────────────────────────────────────────
     * 旧 (2d-1)/(2d-2) は「戦士の仲間は executeSkillOn を 1 回も呼ばない /
     * apTryPreferred が false を返す」を主張していた。#34 でこれは仕様ごと逆転し、
     * 呼ばれるのが正しい振る舞いになったので **コメントアウトで残さず消し**、
     * §7 (7b)/(7c) へ書き直した。旧主張は「?warally=0 のときだけ成立する」ので
     * (7l) がその形で引き継いでいる。 */

    await allyPage.close();

    // ── (2e) 確率ゲートが漏れなくラップされているか (配信バイトを直接数える) ──
    //   ⚠ 実装から数字を写してくるのではなく、「仲間 AI の中に裸の確率ゲートが
    //     1 本も残っていない」を見る。1 本でも取りこぼせばここが赤くなる。
    //   ⚠⚠ #34 で warriorAI が同じ region (clericAI 〜 executeWarriorSkill) の内側へ
    //     入り、ゲートが 4 本増えた → 期待値 20 → 24。これは退行ではない。
    //   ⚠⚠⚠ region 内のコメントに「乱数 < apGateP(」の文字列を書くと、それも 1 本として
    //     数えられる (#34 実装中に実際に踏んで 25 本になった)。
    {
      const src = FROZEN['/index.html'].toString('utf8');
      const s = src.indexOf('async function clericAI(ally) {');
      const e = src.indexOf('async function executeWarriorSkill(');
      const region = (s >= 0 && e > s) ? src.slice(s, e) : '';
      const all     = (region.match(/Math\.random\(\) </g) || []).length;
      const wrapped = (region.match(/Math\.random\(\) < apGateP\(ally,/g) || []).length;
      check('(2e) 仲間 AI (clericAI〜warriorAI) の確率ゲート 24 本がすべて apGateP でラップされている',
        region.length > 0 && all === 24 && wrapped === 24,
        'ゲート総数=' + all + ' / ラップ済=' + wrapped + ' (裸で残り=' + (all - wrapped) + ')');
    }

    /* ══════════════════════════════════════════════════════════════════
     * §7 戦士の仲間にも行動の優先度を効かせる (実装依頼書 #34)
     *   ⭐ 2 経路で突き合わせる。片方の写経にしない。
     *     経路① executeSkillOn の呼び出しログ (配信スナップショットへ注入した計測シーム)
     *     経路② ally* が実際に走ったか (__warWrap の薄いラッパ) + バフ/HP/スタンの盤面変化
     *   ⚠⚠ 既定の連鎖は executeSkillOn を通らず ally* を直に呼ぶので、経路①だけ見ると
     *     (7j) が「そもそも記録されない」で自明に緑になる。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§7) 戦士の仲間: 指定した技が実際に出て、盤面が動くか (#34) ---');
    // 依頼書 #34 §2-8 の表 (reactive / outOfCombat を除いた 7 本)。⛔ 実装から写さない。
    const EXPECT_WARRIOR_AP_IDS = ['strong-cleave', 'sweep', 'finisher',
      'iron-guard', 'shield-bash', 'morale', 'fighting-spirit'];
    const warMap = (id) => ({ warrior: { general: id, mob: id, boss: id, travel: null } });
    const ALL7 = EXPECT_WARRIOR_AP_IDS.slice();
    const firstDiff = (a, b) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++)
        if (a[i] !== b[i]) return '#' + i + ' 今=' + JSON.stringify(a[i]) + ' 基準=' + JSON.stringify(b[i]);
      return '(差なし)';
    };
    const tallyOf = (arr) => arr.reduce((o, k) => { o[k] = (o[k] || 0) + 1; return o; }, {});
    const ranCnt  = (r, fn) => r.ran.filter(x => x === fn).length;
    const firedCnt = (r, id) => r.skills.filter(x => x === id).length;
    // 通常攻撃 (basicPlain/basicOpts) を除いた「技だけ」の観測列。
    const skillRan = (r) => r.ran.filter(x => x.indexOf('basic') !== 0);
    /* ⚠⚠⚠ 判断時のバフ残ターン。allyAttackTurn は **手番の冒頭でバフを 1 減らしてから**
     *   AI を呼ぶので、手番開始時の値をそのまま「効いているか」に使うと、
     *   「切れた瞬間に掛け直した」正しい動作を撃ち直しと誤検出する
     *   (#34 実装中に (7f)/(7g) が実際にこれで赤くなった)。 */
    const remAtDecision = (v) => Math.max(0, (v || 0) - 1);

    const warPage = await openIndexPage(browser, 'autoplay=30&diag=1', AP_SEED_ALLY);
    await warPage.evaluate(AP_ALLY_HELPERS);
    await warPage.evaluate(WAR_HELPERS);

    // ── (7a-1) 母集団: 指定できる戦士の技はちょうど 7 本 ────────────────────
    const w7 = await warPage.evaluate(() => {
      const ids = Object.keys(WARRIOR_SKILLS);
      const ok = ids.filter(id => {
        const sk = WARRIOR_SKILLS[id];
        return !(sk.reactive || sk.passive || sk.outOfCombat);
      });
      return { all: ids, ok: ok };
    });
    check('(7a-1) 母集団: WARRIOR_SKILLS 10 件のうち apTryPreferred を通るのはちょうど 7 件',
      w7.all.length === 10 && w7.ok.length === 7 && setEq(w7.ok, EXPECT_WARRIOR_AP_IDS),
      '全 ' + w7.all.length + ' 件 / 通る ' + w7.ok.length + ' 件 = ' + JSON.stringify(w7.ok));

    // ── (7a-2) 母集団: 戦士の仲間が作れて、warriorAI が実在する ─────────────
    const wMk = await warPage.evaluate(() => {
      const a = createAlly('warrior', playerX, playerY);
      return { cls: a.classKey, eq: (a.equippedSkills || []).slice(), hp: a.hp, maxHp: a.maxHp,
               str: a.str, hasAI: typeof warriorAI === 'function',
               hasRun: typeof window.__warRun === 'function', on: window.WARRIOR_ALLY_ON };
    });
    check('(7a-2) 母集団: 戦士の仲間が生成でき枠が空でない / warriorAI が実在し ?warally は on',
      wMk.cls === 'warrior' && wMk.eq.length > 0 && wMk.hp > 0
        && wMk.hasAI === true && wMk.hasRun === true && wMk.on === true,
      JSON.stringify(wMk));

    // ── (7a-0)/(7k) 非退行: opts を渡さない allyBasicAttack が着手前と 1 ビットも変わらない ──
    //   ⭐⭐⭐ これが無いと「口を開けたついでに従来の攻撃が変わった」を見逃す。
    //   ⭐ allyBasicAttack は 6 職すべてが通る共有点なので、ここが本当の非退行検査。
    let basePage = null;
    if (BASE_ERR) {
      pending('(7a-0) opts 無しの allyBasicAttack が着手前と厳密一致 (戦士)',
        '基準スナップショット ' + BASE_REF + ' を取得できなかった: ' + BASE_ERR);
      pending('(7k) 他 5 職の allyBasicAttack も着手前と厳密一致', '同上');
    } else {
      basePage = await openIndexPage(browser, 'autoplay=30&diag=1', AP_SEED_ALLY, { path: '/index_base.html' });
      await basePage.evaluate(WAR_HELPERS);
      const curW = await warPage.evaluate(() => window.__warBasicSeq('warrior', 200, 12345));
      const basW = await basePage.evaluate(() => window.__warBasicSeq('warrior', 200, 12345));
      check('(7a-0) opts 無しの allyBasicAttack の観測列が着手前 (' + BASE_REF + ') と厳密一致 (戦士 200 回)',
        curW.length > 0 && JSON.stringify(curW) === JSON.stringify(basW),
        '今 ' + curW.length + ' 件 / 基準 ' + basW.length + ' 件 / 先頭差=' + firstDiff(curW, basW));
      const others = ['cleric', 'mage', 'dwarf', 'elf', 'rogue'];
      const diffs = [];
      let dmgSeen = 0;
      for (const ck of others) {
        const c = await warPage.evaluate((k) => window.__warBasicSeq(k, 100, 24680), ck);
        const b = await basePage.evaluate((k) => window.__warBasicSeq(k, 100, 24680), ck);
        dmgSeen += c.filter(x => x.indexOf('D:') === 0).length;
        if (JSON.stringify(c) !== JSON.stringify(b)) diffs.push(ck + ' ' + firstDiff(c, b));
      }
      check('(7k) 他 5 職 (僧侶/魔法使い/ドワーフ/エルフ/盗賊) の allyBasicAttack も着手前と厳密一致',
        diffs.length === 0 && dmgSeen > 0,
        diffs.length ? diffs.join(' | ') : '5 職とも一致 (ダメージが出た試行 ' + dmgSeen + ' 件 = 自明な空振りではない)');
      await basePage.close();
    }

    // ── (7b-0)/(7j) 指定なしの既定の連鎖 ──────────────────────────────────
    const noPref = await warPage.evaluate((eq) => window.__warRun({
      map: null, n: 300, seed: 777, boss: true, clearEnemyStun: true, equipped: eq,
    }), ALL7);
    check('(7b-0) 母集団: 指定なしでは 盾バッシュ が 300 手番で 1 回も出ない (= 指定に意味がある盤面)',
      !noPref.err && noPref.turns.length === 300 && ranCnt(noPref, 'allyShieldBash') === 0
        && skillRan(noPref).length > 0,
      'err=' + noPref.err + ' 実際に走った技=' + JSON.stringify(tallyOf(skillRan(noPref))));
    check('(7j) 既定の連鎖では 渾身の一撃 / 盾バッシュ / 鉄壁の構え が 300 手番で 0 回 (§6 の設計)',
      ranCnt(noPref, 'allyFinisher') === 0 && ranCnt(noPref, 'allyShieldBash') === 0
        && ranCnt(noPref, 'allyIronGuard') === 0,
      'finisher=' + ranCnt(noPref, 'allyFinisher') + ' shieldBash=' + ranCnt(noPref, 'allyShieldBash')
        + ' ironGuard=' + ranCnt(noPref, 'allyIronGuard'));

    // ── (7b) 指定すると、その技だけが出る ──────────────────────────────────
    const prefSB = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 60, seed: 909, boss: true, clearEnemyStun: true, equipped: eq,
    }), warMap('shield-bash'), ALL7);
    const sbFired = firedCnt(prefSB, 'shield-bash');
    const sbRan   = ranCnt(prefSB, 'allyShieldBash');
    check('(7b) ボス=盾バッシュ を指定すると executeSkillOn 経由で盾バッシュだけが実行される (60 手番)',
      !prefSB.err && sbFired >= 30 && sbRan === sbFired
        && prefSB.skills.every(s => s === 'shield-bash'),
      '経路① executeSkillOn=' + JSON.stringify(tallyOf(prefSB.skills))
        + ' / 経路② 実行=' + JSON.stringify(tallyOf(prefSB.ran)));

    // ── (7c) apTryPreferred が true を返し、盤面 (敵 HP) が実際に動く ────────
    const tp = await warPage.evaluate((m, eq) => window.__warTryPreferred({
      map: m, equipped: eq, seed: 5150, boss: true,
    }), warMap('strong-cleave'), ALL7);
    check('(7c) apTryPreferred(戦士の仲間) が true を返し、敵の HP が実際に減っている (2 経路)',
      tp.err === null && tp.r === true && tp.seamDelta === 1
        && tp.ran.indexOf('allyStrongCleave') >= 0 && tp.enemyDmg > 0,
      '返り=' + tp.r + ' シーム増分=' + tp.seamDelta + ' 実行=' + JSON.stringify(tp.ran)
        + ' 敵ダメージ=' + tp.enemyDmg);

    // ── (7b-2) dmgBonus に 0 を渡しても武器の値へ落ちない (N7 の検出器) ──────
    //   ⚠ STR 修正 0 の戦士に dmgBonus:50 の武器を持たせる。正しい実装なら強斬りの
    //     ダメージは 2d8 (クリで 4d8) = 最大 32 に収まる。|| で判定すると 50 が乗る。
    const zero = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 40, seed: 2468, boss: true, clearEnemyStun: true, equipped: eq,
      str: 0, dmgBonus: 50,
    }), warMap('strong-cleave'), ALL7);
    //   ⚠⚠ 通常攻撃の手番 (basicPlain = opts 無し → 武器の +50 が乗る) を必ず除く。
    //     混ぜると 2d8+0 ではなく 武器+50 を測ってしまい、正しい実装でも赤くなる。
    const zeroSkillTurns = zero.turns.filter(t =>
      t.ran.indexOf('allyStrongCleave') >= 0 && t.ran.indexOf('basicPlain') < 0);
    const zeroMax = zeroSkillTurns.reduce((mx, t) => Math.max(mx, t.dmg), 0);
    //   上限 = 2d8 をクリティカル倍率だけ振った値。⛔ 実装から写さず ally の実体から引く。
    const zeroCap = 16 * ((zero.allyStart && zero.allyStart.critMult) || 2);
    check('(7b-2) dmgBonus: 0 (STR 修正 0) が武器の修正値へ黙って落ちない (強斬りの最大ダメージ <= 2d8×クリ倍率)',
      !zero.err && zeroSkillTurns.length > 0 && zeroMax > 0 && zeroMax <= zeroCap,
      '強斬りだけの手番=' + zeroSkillTurns.length + ' 回 / 最大ダメージ=' + zeroMax
        + ' / 上限=' + zeroCap + ' (武器の修正値は ' + (zero.allyStart && zero.allyStart.dmgBonus) + ')');

    // ── (7d) 渾身の一撃 = ally.stunned へ書き、次の手番が実際に飛ぶ ──────────
    const fin = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 8, seed: 1357, boss: true, clearEnemyStun: true, equipped: eq,
    }), warMap('finisher'), ALL7);
    const finIdx = fin.turns.findIndex(t => t.ran.indexOf('allyFinisher') >= 0);
    const finT   = finIdx >= 0 ? fin.turns[finIdx] : null;
    const nextT  = (finIdx >= 0 && finIdx + 1 < fin.turns.length) ? fin.turns[finIdx + 1] : null;
    check('(7d) 渾身の一撃で ally.stunned が立ち (skipNextTurn は false のまま)、次の手番が実際に飛ぶ',
      !!finT && finT.stunAfter >= 1 && finT.skipNextTurn === false
        && !!nextT && nextT.stunBefore >= 1 && nextT.ran.length === 0 && nextT.dmg === 0,
      finT ? ('発動手番 stunned=' + finT.stunAfter + ' skipNextTurn=' + finT.skipNextTurn
              + ' / 次手番 実行=' + JSON.stringify(nextT && nextT.ran) + ' ダメージ=' + (nextT && nextT.dmg))
           : '渾身の一撃が 1 回も出なかった (母集団ゼロ)');

    // ── (7e) 盾バッシュ = 命中したときだけ敵がスタンする ────────────────────
    const sbHit  = prefSB.turns.filter(t => t.ran.indexOf('allyShieldBash') >= 0 && t.dmg > 0);
    const sbMiss = prefSB.turns.filter(t => t.ran.indexOf('allyShieldBash') >= 0 && t.dmg === 0);
    check('(7e) 盾バッシュは命中した試行だけ敵が stunned=1、外した試行は 0 のまま (res.missed が効いている)',
      sbHit.length > 0 && sbMiss.length > 0
        && sbHit.every(t => t.eStunned[0] === 1) && sbMiss.every(t => t.eStunned[0] === 0),
      '命中 ' + sbHit.length + ' 回 / 空振り ' + sbMiss.length + ' 回'
        + ' / 命中側のスタン=' + JSON.stringify(sbHit.map(t => t.eStunned[0]).slice(0, 8))
        + ' 空振り側=' + JSON.stringify(sbMiss.map(t => t.eStunned[0]).slice(0, 8)));

    // ── (7f) 士気高揚 = 効いている間は撃ち直さない (N9 の検出器) ─────────────
    const mor = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 20, seed: 8642, boss: true, clearEnemyStun: true, equipped: eq,
    }), warMap('morale'), ALL7);
    const morRedundant = mor.turns.filter(t =>
      remAtDecision(t.atkRemBefore) > 0
        && (t.ran.indexOf('allyMorale') >= 0 || t.fired.indexOf('morale') >= 0));
    /*   ⭐ 2 経路目: 20 手番あたりの発動回数が「効果時間ぶんの間隔」に収まる。
     *     duration 3 + 1 = 4 ターン持続なので 20/4 = 5 回前後が上限。
     *   ⚠⚠⚠ 回数は **経路①(executeSkillOn)と経路②(実際に走った ally*)の大きい方** で数える。
     *     片方だけ見ると、別の変異 (N10 = 仲間をリーダー用実装へ流す) が入ったときに
     *     「仲間側では 1 回も走っていない」ので N9 の証拠が消え、**変異どうしが
     *     互いを覆い隠して両方とも空振りする** (#34 実装中に実測した)。 */
    const morCasts = Math.max(ranCnt(mor, 'allyMorale'), firedCnt(mor, 'morale'));
    check('(7f) 士気高揚は効いている最中に撃ち直されず、20 手番の発動が効果時間ぶんに収まる',
      !mor.err && morCasts > 0 && morRedundant.length === 0 && morCasts <= 6,
      '発動 ' + morCasts + ' 回 / 20 手番中 (上限 6) / 効いている最中の撃ち直し='
        + morRedundant.length + ' 回 (残ターンの推移='
        + JSON.stringify(mor.turns.map(t => t.atkRemAfter)) + ')');

    // ── (7g) 鉄壁の構えも同じ ───────────────────────────────────────────────
    const ig = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 20, seed: 8643, boss: true, clearEnemyStun: true, equipped: eq,
    }), warMap('iron-guard'), ALL7);
    const igRedundant = ig.turns.filter(t =>
      remAtDecision(t.drRemBefore) > 0
        && (t.ran.indexOf('allyIronGuard') >= 0 || t.fired.indexOf('iron-guard') >= 0));
    //   duration 1 + 1 = 2 ターン持続なので 20/2 = 10 回前後が上限。⚠ 回数は 2 経路の最大値。
    const igCasts = Math.max(ranCnt(ig, 'allyIronGuard'), firedCnt(ig, 'iron-guard'));
    check('(7g) 鉄壁の構えも効いている最中は撃ち直さず、発動が効果時間ぶんに収まる',
      !ig.err && igCasts > 0 && igRedundant.length === 0 && igCasts <= 11,
      '発動 ' + igCasts + ' 回 / 20 手番中 (上限 11) / 効いている最中の撃ち直し=' + igRedundant.length
        + ' 回 (残ターンの推移=' + JSON.stringify(ig.turns.map(t => t.drRemAfter)) + ')');

    // ── (7h) 仲間の闘志で主人公の HP が 1 も動かない (N10 の検出器) ──────────
    //   ⚠⚠⚠ executeWarriorSkill へ流れていないことの直接証明。⭐ 「主人公が動かない」
    //     だけだと満タン時に自明に緑になるので、**仲間の HP が実際に増えた** も見る。
    //   ⚠⚠ 主人公を **わざと削っておく** (playerHp)。満タンだとリーダー用実装へ流れても
    //     Math.min(maxHp, ...) に吸われて「主人公の hp が動かない = 正常」に化ける。
    //   ⚠⚠ 仲間の HP は maxHp の半分より上にする。半分未満だと warriorAI の既定の連鎖 ①
    //     が闘志を直に撃ってしまい、executeSkillOn を通らないので N10 が観測できない。
    const fspirit = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 6, seed: 1123, boss: true, clearEnemyStun: true, equipped: eq,
      hp: 20, playerHp: 10,
    }), warMap('fighting-spirit'), ALL7);
    const fsTurn = fspirit.turns.find(t => t.ran.indexOf('allyFightingSpirit') >= 0);
    check('(7h) 仲間の戦士の闘志で 主人公の hp は 1 も動かず、仲間自身の HP が増えている',
      !fspirit.err && !!fsTurn && fsTurn.hpAfter > fsTurn.hpBefore
        && fspirit.playerHpStart === fspirit.playerHpEnd,
      '主人公 hp ' + fspirit.playerHpStart + ' → ' + fspirit.playerHpEnd
        + ' / 仲間 hp ' + (fsTurn && fsTurn.hpBefore) + ' → ' + (fsTurn && fsTurn.hpAfter)
        + ' / 実行=' + JSON.stringify(tallyOf(fspirit.ran)));

    // ── (7i) 交戦敵が 1 体も居なければ撃たずに false (手番を潰さない) ─────────
    //   ⚠ 依頼書 §2-8 の「射程外なら撃たずに false」は実測すると **成立しない**。
    //     pickClosestEngagedEnemyFromAlly に射程の絞り込みが無く、最寄りの交戦敵を
    //     距離に関係なく返すため。撃たずに false になるのは「交戦敵ゼロ」のときだけで、
    //     射程外のときは既存 ally* (allyPowerAttack 等) と同じく **前進して間合いを詰める**。
    //     → (7i) は「交戦敵ゼロ」、(7i-2) は「射程外は前進に化けて敵は減らない」で測る。
    const noEnemy = await warPage.evaluate((m, eq) => window.__warTryPreferred({
      map: m, equipped: eq, seed: 6180, enemies: 0,
    }), warMap('strong-cleave'), ALL7);
    check('(7i) 交戦敵が 0 体なら 強斬り 指定でも撃たずに false を返す (手番を潰さない)',
      noEnemy.err === null && noEnemy.r === false && noEnemy.ran.length === 0 && noEnemy.seamDelta === 0,
      '返り=' + noEnemy.r + ' 実行=' + JSON.stringify(noEnemy.ran) + ' シーム増分=' + noEnemy.seamDelta);
    const farAway = await warPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 5, seed: 6181, boss: true, equipped: eq, dx: 96 * 20,
    }), warMap('strong-cleave'), ALL7);
    check('(7i-2) 射程外のときは前進に化け、敵の HP は 1 も減らない (既存 ally* と同じ作法)',
      !farAway.err && farAway.turns.every(t => t.dmg === 0)
        && farAway.trace.indexOf('ADV') >= 0,
      '総ダメージ=' + farAway.turns.reduce((s, t) => s + t.dmg, 0)
        + ' / 前進した=' + (farAway.trace.indexOf('ADV') >= 0));

    await warPage.close();

    // ── (7l-0)/(7l)/(7m) 撤退スイッチ ?warally=0 ────────────────────────────
    const warOffPage = await openIndexPage(browser, 'autoplay=30&diag=1&warally=0', AP_SEED_ALLY);
    await warOffPage.evaluate(AP_ALLY_HELPERS);
    await warOffPage.evaluate(WAR_HELPERS);
    const warOffFlag = await warOffPage.evaluate(() => window.WARRIOR_ALLY_ON);
    check('(7l-0) 母集団: ?warally=0 で WARRIOR_ALLY_ON が false になり、(7b) と同じ盤面を張れる',
      warOffFlag === false && firedCnt(prefSB, 'shield-bash') > 0,
      'WARRIOR_ALLY_ON=' + warOffFlag + ' / スイッチ無しでは同条件で ' + firedCnt(prefSB, 'shield-bash') + ' 回撃てていた');
    const warOff = await warOffPage.evaluate((m, eq) => window.__warRun({
      map: m, n: 60, seed: 909, boss: true, clearEnemyStun: true, equipped: eq,
    }), warMap('shield-bash'), ALL7);
    //   ⚠ 「何も起きない」ではなく「技が 1 本も走らず、通常攻撃だけになる」が正。
    //     ran が空だと母集団ゼロ (そもそも手番が回っていない) と区別できない。
    check('(7l) ?warally=0 なら戦士の仲間は executeSkillOn を 1 回も呼ばず、技も 1 本も走らない (通常攻撃だけ)',
      !warOff.err && warOff.skills.length === 0 && skillRan(warOff).length === 0
        && warOff.ran.length > 0 && warOff.turns.length === 60,
      'executeSkillOn=' + JSON.stringify(tallyOf(warOff.skills))
        + ' 技=' + JSON.stringify(tallyOf(skillRan(warOff)))
        + ' 手番の中身=' + JSON.stringify(tallyOf(warOff.ran)));
    const warOffMage = await warOffPage.evaluate((m) => window.__apAllyRun({
      classKey: 'mage', ai: 'mageAI', n: 200, bossHp: 10, dx: 96,
      stubs: ['allyFireball', 'allyIceStorm', 'allyMagicMissile', 'allyFireBolt'],
      equipped: ['fire-bolt', 'magic-missile', 'fireball', 'ice-storm'],
      slots: { 'fire-bolt': 9, 'magic-missile': 9, 'fireball': 9, 'ice-storm': 9 }, map: m,
    }), AP_SEED_ALLY);
    check('(7m) ?warally=0 でも他 5 職の先出しは従来どおり効く (?actionpri=0 とは別物)',
      (warOffMage.tally.allyFireball || 0) > 100,
      'fireball=' + (warOffMage.tally.allyFireball || 0) + ' / 200  内訳=' + JSON.stringify(warOffMage.tally));
    await warOffPage.close();

    /* ══════════════════════════════════════════════════════════════════
     * §3 道中詠唱 / §4 バフ退避 / §5 撤退 — 測り方は 2 系統
     *   ① 実プレイ観測 (TR / NT ページ)  … 本番の呼び口 exploreAllyTurn がそのまま走る。
     *      「出るまでポーリング」で採る (固定時間窓はゲームループの前で必ずフレークする)。
     *   ② 決定論の盤面 (CTL ページ)      … QUIET で敵を遠ざけ、state だけを動かして
     *      条件 6 / 条件 7 を独立に検査する。交戦が始まらないので測定が汚れない。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§3) 道中詠唱: 実プレイ観測 ---');
    const trPage = await openIndexPage(browser, 'autoplay=20&diag=1', AP_SEED_TRAVEL,
      Object.assign({ quiet: false }, TRAVEL_OPTS));
    const trSetup = await trPage.evaluate(() => {
      const cl = allies.find(a => a.classKey === 'cleric');
      const dw = allies.find(a => a.classKey === 'dwarf');
      return {
        party: [leaderClassKey].concat(allies.map(a => a.classKey)),
        clericEquipped: cl ? (cl.equippedSkills || []).slice() : null,
        clericBlessSlots: cl ? ((cl.spellSlots || {})['bless'] || 0) : 0,
        dwarfHasRoar: !!dw && (dw.equippedSkills || []).indexOf('battle-roar') >= 0,
        travelCleric: window.apPreferredId('cleric', 'travel'),
        travelDwarf: window.apPreferredId('dwarf', 'travel'),
        on: window.ACTION_PRIORITY_ON,
      };
    });
    check('(3a-0) 母集団: 僧侶仲間が bless を枠に入れ・スロットも残り・指定が travel=bless に解決している',
      !!trSetup.clericEquipped && trSetup.clericEquipped.indexOf('bless') >= 0
        && trSetup.clericBlessSlots > 0 && trSetup.travelCleric === 'bless' && trSetup.on === true,
      JSON.stringify(trSetup));

    // ⭐ 「出るまでポーリング」: 道中 bless が記録され、かつ戦闘開始のスナップショットが 1 件出るまで。
    const tr = await pollUntil(trPage, () => {
      const log  = (window.__apLog || []);
      const buff = (window.__apBuffLog || []);
      const bless = log.filter(r => r.classKey === 'cleric' && r.skillId === 'bless' && r.phase === 'explore');
      return {
        done: bless.length > 0 && buff.length > 0,
        aware: window.__apAware || 0,
        early: window.__apEarlyCast || 0,
        gameOver: (typeof gameOver !== 'undefined') ? gameOver : null,
        blessExplore: bless.length,
        blessEnc: bless.map(r => r.enc),
        roar: log.filter(r => r.skillId === 'battle-roar').length,
        log: log.map(r => r.classKey + '/' + r.skillId + '@' + r.phase + (r.enc ? '/enc' : '')),
        latch: Array.from(window.apTravelCastDone || []),
        buff: buff.slice(),
      };
    }, 150000, 500);
    const trOk = !!tr;

    // ⭐⭐⭐ 母集団ガード: 条件 6 が一度も真にならなければ §3 の assert は全部空振りする。
    check('(0d) 道中テストで「敵が alert/chase になった」瞬間が 1 回以上ある (条件 6 の母集団)',
      trOk && tr.aware > 0,
      trOk ? ('50ms サンプラの当たり回数=' + tr.aware + ' / gameOver=' + tr.gameOver) : '(観測できず)');

    check('(3a) 僧侶仲間 travel=bless が **探索フェーズ中に** 発動する (phase:"explore" の記録)',
      trOk && tr.blessExplore >= 1 && tr.blessEnc.every(e => e === false),
      trOk ? ('道中 bless=' + tr.blessExplore + ' enc=' + JSON.stringify(tr.blessEnc)
              + ' ラッチ=' + JSON.stringify(tr.latch) + ' 全ログ=' + JSON.stringify(tr.log)) : '(観測できず)');
    check('(3b-2) 実プレイ: 誰にも気づかれていない間に道中詠唱が記録されたことは一度も無い',
      trOk && tr.early === 0,
      trOk ? ('気づかれる前の記録=' + tr.early + ' 回 (0 が正) / aware=' + tr.aware) : '(観測できず)');
    check('(3d-2) 実プレイ: 許可リスト外の battle-roar は道中で一度も撃たれない',
      trOk && tr.roar === 0,
      trOk ? ('battle-roar の記録=' + tr.roar + ' 回 (0 が正)') : '(観測できず)');

    console.log('\n--- (§4) バフ退避 (罠 §2-5) ---');
    const b0 = (trOk && tr.buff && tr.buff[0]) || null;
    const b0Allies = (b0 && b0.allies) || [];
    check('(4a-0) 母集団: 道中詠唱の **後** に戦闘開始のスナップショットが 1 件以上ある',
      !!b0 && b0.logN >= 1 && trOk && tr.blessExplore >= 1 && b0Allies.length > 0,
      b0 ? ('戦闘開始時点の executeSkillOn 記録数=' + b0.logN + ' 生存仲間=' + b0Allies.length) : '(記録なし)');
    // ⚠⚠⚠ 片方だけ見ると、退避を外しても仲間側だけで緑になる。必ず両方を突き合わせる。
    check('(4a) 戦闘開始の瞬間、主人公と仲間で atkBonusRemaining>0 が一致する (主人公だけ剥がれていない)',
      !!b0 && b0.player.atk > 0 && b0.player.atkAmt > 0 && b0Allies.every(a => a.atk > 0),
      b0 ? ('主人公 atk=' + b0.player.atk + '(+' + b0.player.atkAmt + ') move=' + b0.player.move
            + ' / 仲間 ' + JSON.stringify(b0Allies.map(a => a.cls + ':' + a.atk))
            + ' / keep=' + b0.keep) : '(記録なし)');
    await trPage.close();

    // (4b) 優先度は生きているが「道中」だけ未設定 → 退避が「常時バフ持ち越し」に化けていないか
    const ntPage = await openIndexPage(browser, 'autoplay=20&diag=1', AP_SEED_NOTRAVEL,
      Object.assign({ quiet: false }, TRAVEL_OPTS));
    const ntPre = await ntPage.evaluate(() => ({
      on: window.ACTION_PRIORITY_ON,
      travel: window.apPreferredId('cleric', 'travel'),
      boss: window.apPreferredId('cleric', 'boss'),
    }));
    const nt = await pollUntil(ntPage, () => {
      const buff = (window.__apBuffLog || []);
      return { done: buff.length > 0, buff: buff.slice(),
               gameOver: (typeof gameOver !== 'undefined') ? gameOver : null,
               log: (window.__apLog || []).map(r => r.classKey + '/' + r.skillId + '@' + r.phase) };
    }, 150000, 500);
    const nb0 = (nt && nt.buff && nt.buff[0]) || null;
    check('(4b-0) 母集団: 優先度そのものは生きているが「道中」だけ未設定 (退避が動く余地はある)',
      ntPre.on === true && ntPre.travel === null && ntPre.boss === 'bless',
      JSON.stringify(ntPre));
    check('(4b) 道中詠唱をしていない戦闘では、開始時の playerBuffs が従来どおり全部 0',
      !!nb0 && nb0.keep === false && nb0.player.atk === 0 && nb0.player.atkAmt === 0
        && nb0.player.ac === 0 && nb0.player.striking === 0 && nb0.player.hasted === 0
        && nb0.player.move === 0,
      nb0 ? JSON.stringify(nb0) : '(戦闘開始の記録なし / ' + JSON.stringify(nt && nt.log) + ')');
    await ntPage.close();

    console.log('\n--- (§3) 道中詠唱: 決定論の盤面 (条件 6 / 条件 7 の分離) ---');
    const ctlPage = await openIndexPage(browser, 'autoplay=20&diag=1', AP_SEED_TRAVEL, TRAVEL_OPTS);
    await ctlPage.evaluate(AP_CTL_HELPERS);

    // (3b) 敵が idle しかいない間は一度も発動しない (条件 6)
    const c3b = await ctlPage.evaluate(async () =>
      ({ r: await window.__apCtlRun('cleric', 6, { state: 'idle', clearBuffs: true, id: 'bless' }) }));
    check('(3b-0) 母集団: 全敵を idle に固定した 6 回とも条件 6 が偽になっている',
      c3b.r.aware.length === 6 && c3b.r.aware.every(a => a === false)
        && !!c3b.r.states && c3b.r.states.length > 0,
      'aware=' + JSON.stringify(c3b.r.aware) + ' 敵の state=' + JSON.stringify(c3b.r.states));
    check('(3b) 敵が idle しかいない間は一度も発動しない (6 回叩いて 0 発)',
      (c3b.r.after - c3b.r.before) === 0 && c3b.r.fired.every(f => f === false),
      '発火=' + JSON.stringify(c3b.r.fired) + ' bless 記録の増分=' + (c3b.r.after - c3b.r.before));

    // (3c) ラッチ。⭐ 毎回バフを消すので apIsWastedCast は止めない = 残る歯止めはラッチだけ。
    const c3c = await ctlPage.evaluate(async () => {
      const cl = window.__apCtlAlly('cleric');
      const slotsBefore = (cl.spellSlots || {})['bless'] || 0;
      const r = await window.__apCtlRun('cleric', 4, { state: 'alert', clearBuffs: true, id: 'bless' });
      return { r: r, slotsBefore: slotsBefore, slotsAfter: (cl.spellSlots || {})['bless'] || 0,
               latch: Array.from(window.apTravelCastDone || []) };
    });
    check('(3c-0) 母集団: 4 回とも条件 6 が真で、スロットが 2 発以上残っている (ラッチが唯一の歯止め)',
      c3c.r.aware.every(a => a === true) && c3c.slotsBefore >= 2 && (c3c.r.after - c3c.r.before) >= 1,
      'aware=' + JSON.stringify(c3c.r.aware) + ' bless スロット ' + c3c.slotsBefore + '→' + c3c.slotsAfter
        + ' 増分=' + (c3c.r.after - c3c.r.before));
    check('(3c) 1 回の接敵で 2 回以上は撃たない (バフを毎回消しても 4 回中 1 発だけ)',
      (c3c.r.after - c3c.r.before) === 1,
      '発火=' + JSON.stringify(c3c.r.fired) + ' bless 増分=' + (c3c.r.after - c3c.r.before)
        + ' ラッチ=' + JSON.stringify(c3c.latch));

    // (3d) 抜け道封じ。⚠ 「許可リストに無い」以外の条件は全部満たした状態にしてから叩く。
    const c3d = await ctlPage.evaluate(async () => {
      window.__apCtlClearBuffs();
      const st = window.__apCtlSetup('alert');
      const dw = window.__apCtlAlly('dwarf');
      const sk = ((typeof CLASS_SKILL_DICTS !== 'undefined' && CLASS_SKILL_DICTS.dwarf) || {})['battle-roar'] || {};
      const pre = {
        prefId: window.apPreferredId('dwarf', 'travel'),
        equipped: (dw.equippedSkills || []).indexOf('battle-roar') >= 0,
        inTravelList: window.AP_TRAVEL_CASTABLE.has('battle-roar'),
        aware: window.apTravelEnemyAware(),
        phase: currentPhase, enc: encounterActive,
        atk: dw.buffs.atkBonusRemaining || 0,
        latched: Array.from(window.apTravelCastDone || []).indexOf(allies.indexOf(dw) + ':battle-roar') >= 0,
        mpCost: sk.mpCost || 0,
        once: !!sk.oncePerEncounter,
        used: !!(dw.skillsUsedInEncounter && dw.skillsUsedInEncounter.has('battle-roar')),
        cooldown: (dw.skillCooldowns && dw.skillCooldowns['battle-roar']) || 0,
        states: st,
      };
      const r = await window.__apCtlRun('dwarf', 4, { state: 'alert', clearBuffs: true, id: 'battle-roar' });
      return { pre: pre, r: r };
    });
    check('(3d-0) 母集団: battle-roar は「道中許可リストに無い」以外の条件を全部満たしている',
      c3d.pre.prefId === 'battle-roar' && c3d.pre.equipped === true && c3d.pre.inTravelList === false
        && c3d.pre.aware === true && c3d.pre.phase === 'explore' && c3d.pre.enc === false
        && c3d.pre.atk === 0 && c3d.pre.latched === false && c3d.pre.mpCost === 0
        && c3d.pre.once === true && c3d.pre.used === false && c3d.pre.cooldown === 0,
      JSON.stringify(c3d.pre));
    check('(3d) travel に battle-roar (1戦1回) を localStorage へ手で書き込んでも発動しない (2 重ガード)',
      (c3d.r.after - c3d.r.before) === 0 && c3d.r.fired.every(f => f === false),
      '発火=' + JSON.stringify(c3d.r.fired) + ' battle-roar 記録の増分=' + (c3d.r.after - c3d.r.before));
    await ctlPage.close();

    console.log('\n--- (§5) 撤退スイッチ ?actionpri=0 ---');
    const offPage = await openIndexPage(browser, 'actionpri=0&autoplay=20&diag=1', AP_SEED_TRAVEL, TRAVEL_OPTS);
    await offPage.evaluate(AP_CTL_HELPERS);
    const off = await offPage.evaluate(async () => {
      window.__apCtlSetup('alert');
      window.__apCtlClearBuffs();
      const cl = window.__apCtlAlly('cleric');
      const before = (window.__apLog || []).length;
      const fired = await window.apTryTravelCast(cl);
      playerBuffs.__apTravel = true;                 // 道中詠唱があったことにしても…
      const cap = window.apCaptureTravelBuffs();     // …退避は動かない
      playerBuffs.__apTravel = false;
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        on: window.ACTION_PRIORITY_ON,
        travel: window.apPreferredId('cleric', 'travel'),
        dwarfTravel: window.apPreferredId('dwarf', 'travel'),
        gate: window.apGateP({ classKey: 'cleric' }, 'bless', 0.5),
        aware: window.apTravelEnemyAware(),
        hasBless: (cl.equippedSkills || []).indexOf('bless') >= 0,
        slots: (cl.spellSlots || {})['bless'] || 0,
        fired: fired, delta: (window.__apLog || []).length - before,
        cap: cap,
        lsTravel: (ls && ls.cleric) ? ls.cleric.travel : '(キー無し)',
      };
    });
    check('(5a-0) 母集団: ?actionpri=0 が無ければ撃てた盤面 (条件 6 が真・bless を装備・スロット残)',
      off.aware === true && off.hasBless === true && off.slots > 0,
      'aware=' + off.aware + ' bless 装備=' + off.hasBless + ' スロット=' + off.slots);
    check('(5a) index.html?actionpri=0 で優先度が全部 no-op (指定は null / ゲートは base / 道中詠唱も撃たない)',
      off.on === false && off.travel === null && off.dwarfTravel === null && off.gate === 0.5
        && off.fired === false && off.delta === 0 && off.cap === null,
      JSON.stringify({ on: off.on, travel: off.travel, dwarfTravel: off.dwarfTravel, gate: off.gate,
                       fired: off.fired, delta: off.delta, cap: off.cap }));
    check('(5a-2) 保存済みの値は消えていない (スイッチを外せば戻る)',
      off.lsTravel === 'bless', 'localStorage の cleric.travel=' + JSON.stringify(off.lsTravel));
    await offPage.close();

    const offPrep = await openPrepScreen(browser, { name: 'tavern-off', width: 1280, height: 900 },
      { qs: 'actionpri=0', expectRows: false, seedAp: AP_SEED_TRAVEL });
    const b5 = await offPrep.evaluate(() => {
      const sec = document.getElementById('actionPrioritySection');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        exists: !!sec,
        display: sec ? getComputedStyle(sec).display : null,
        selects: document.querySelectorAll('#apRows select').length,
        prepShown: (function () { const p = document.getElementById('prep'); return !!p && getComputedStyle(p).display !== 'none'; })(),
        lsTravel: (ls && ls.cleric) ? ls.cleric.travel : '(キー無し)',
        memTravel: (selection.actionPriority && selection.actionPriority.cleric) ? selection.actionPriority.cleric.travel : '(キー無し)',
      };
    });
    check('(5b-0) 母集団: ?actionpri=0 でも「出発の準備」画面そのものは開いている',
      b5.prepShown === true && b5.exists === true,
      '#prep 可視=' + b5.prepShown + ' #actionPrioritySection 存在=' + b5.exists);
    check('(5b) tavern.html?actionpri=0 で #actionPrioritySection が非表示 (select も 0 個)',
      b5.display === 'none' && b5.selects === 0,
      'display=' + b5.display + ' select 数=' + b5.selects);
    check('(5b-2) 保存済みの値は消えていない (localStorage / selection の両方)',
      b5.lsTravel === 'bless' && b5.memTravel === 'bless',
      'localStorage=' + JSON.stringify(b5.lsTravel) + ' selection=' + JSON.stringify(b5.memTravel));
    await offPrep.close();

    /* ════════════════════════════════════════════════════════════════════
     * §6 — 酒場 UI (本項目の担当)
     * ════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§6-装置) 母集団ガード ---');
    const page = await openPrepScreen(browser, { name: 'desktop', width: 1280, height: 900 });

    const seams = await page.evaluate(() => ({
      hasSituations: typeof AP_SITUATIONS !== 'undefined' && Array.isArray(AP_SITUATIONS),
      situationKeys: (typeof AP_SITUATIONS !== 'undefined' ? AP_SITUATIONS : []).map(s => s.key),
      travelIds:     (typeof TRAVEL_CASTABLE_IDS !== 'undefined') ? TRAVEL_CASTABLE_IDS.slice() : null,
      hasRender:     typeof renderActionPriority === 'function',
      apKeys:        Object.keys((selection && selection.actionPriority) || {}),
      apShape:       Object.keys(((selection && selection.actionPriority) || {}).mage || {}),
      heroLv:        getLevelFromXP(inventory.xp),
      sectionExists: !!document.getElementById('actionPrioritySection'),
      // 「道中に選べる ID」が本当に呪文 (mpCost>0) で、呪文職のプールに実在するか
      travelIdFacts: ((typeof TRAVEL_CASTABLE_IDS !== 'undefined') ? TRAVEL_CASTABLE_IDS : []).map(id => {
        for (const slot of PARTY_SLOTS) {
          const hit = (slot.skillPool || []).find(sk => sk.id === id);
          if (hit) return { id, classKey: slot.classKey, mpCost: hit.mpCost || 0 };
        }
        return { id, classKey: null, mpCost: 0 };
      }),
    }));
    check('(S1) AP_SITUATIONS / TRAVEL_CASTABLE_IDS / renderActionPriority が裸の識別子で読める',
      seams.hasSituations && Array.isArray(seams.travelIds) && seams.hasRender && seams.sectionExists,
      JSON.stringify({ sit: seams.hasSituations, travel: !!seams.travelIds, render: seams.hasRender, dom: seams.sectionExists }));
    check('(S2) AP_SITUATIONS の 4 状況が general/mob/boss/travel',
      setEq(seams.situationKeys, SITUATIONS) && seams.situationKeys.length === 4,
      JSON.stringify(seams.situationKeys));
    check('(S3) TRAVEL_CASTABLE_IDS が §2-6 の全数 10 件と集合として一致',
      Array.isArray(seams.travelIds) && seams.travelIds.length === 10 && setEq(seams.travelIds, EXPECT_TRAVEL_IDS),
      'n=' + (seams.travelIds || []).length + ' ' + JSON.stringify(seams.travelIds));
    // ⭐ 2 経路目: 「呪文スロットを消費する呪文だけ」を **本番のスキル定義から** 検算する。
    //    1戦1回スキル (battle-roar 等 = mpCost 無し) が紛れ込んだらここが赤くなる。
    const badTravel = (seams.travelIdFacts || []).filter(f => !(f.mpCost > 0) || ['cleric', 'mage', 'elf'].indexOf(f.classKey) < 0);
    check('(S4) TRAVEL_CASTABLE_IDS の全件が「呪文スロットを消費する呪文 (mpCost>0)」で呪文職のプールに実在',
      badTravel.length === 0, badTravel.length ? JSON.stringify(badTravel) : '10/10 OK');
    check('(S5) selection.actionPriority が 6 職 × 4 枠で初期化されている',
      setEq(seams.apKeys, CLASS_KEYS) && setEq(seams.apShape, SITUATIONS),
      JSON.stringify(seams.apKeys) + ' / mage=' + JSON.stringify(seams.apShape));
    check('(S6) 主人公 Lv がスキル枠 3 の帯にいる (外した技を戻せる = (6c) の後片付けが成立する)',
      seams.heroLv >= 5, 'Lv=' + seams.heroLv);

    // 6 職ぶんの観測
    const obs = {};
    for (const ck of CLASS_KEYS) obs[ck] = await readClass(page, ck);

    check('(S7) 母集団: 6 職すべてで #apRows に select が 4 個ある',
      CLASS_KEYS.every(ck => obs[ck].selectCount === 4),
      CLASS_KEYS.map(ck => ck + ':' + obs[ck].selectCount).join(' '));
    // ⚠⚠ (6b) が空振りしない証明。「装備していない技」が 1 つも無いなら包含は自明で無意味。
    const notEquipped = CLASS_KEYS.map(ck => ({
      ck, n: obs[ck].poolIds.filter(id => obs[ck].equippedByData.indexOf(id) < 0).length,
    }));
    check('(S8) 母集団: 6 職すべてで「装備していない技」が 1 つ以上実在する ((6b) が自明でない証明)',
      notEquipped.every(x => x.n > 0), notEquipped.map(x => x.ck + ':' + x.n).join(' '));
    check('(S9) 母集団: 6 職すべてで「枠に入れている技」が 1 つ以上ある (候補が空でないこと)',
      CLASS_KEYS.every(ck => obs[ck].equippedByData.length > 0),
      CLASS_KEYS.map(ck => ck + ':' + obs[ck].equippedByData.length).join(' '));
    check('(S10) #apHint が「傾向」であることを明示している',
      /傾向/.test(obs.warrior.hintText) && /射程|スロット/.test(obs.warrior.hintText),
      JSON.stringify(obs.warrior.hintText));

    console.log('\n--- (§6) 酒場 UI ---');

    // ── (6a) 4 枠の存在と、道中行の出し分け ──────────────────────────────
    const missing = [];
    for (const ck of CLASS_KEYS) {
      for (const sit of ['general', 'mob', 'boss']) {
        const r = obs[ck].rows[sit];
        if (!r.exists || !r.visible) missing.push(ck + '/' + sit + (r.exists ? '(非表示)' : '(不在)'));
      }
    }
    check('(6a-1) apSel_<classKey>_<sit> が general/mob/boss は 6 職すべてで存在し可視',
      missing.length === 0, missing.length ? missing.join(' ') : '18/18 OK');

    const travelSeen = CLASS_KEYS.filter(ck => obs[ck].rows.travel.exists && obs[ck].rows.travel.visible);
    check('(6a-2) 道中の行は僧侶・魔法使い・エルフのみ表示 (戦士・ドワーフ・盗賊は非表示)',
      setEq(travelSeen, EXPECT_TRAVEL_CLASSES),
      '表示された職 = ' + JSON.stringify(travelSeen) + ' / 期待 ' + JSON.stringify(EXPECT_TRAVEL_CLASSES));
    // ⭐ 2 経路目: 「道中の候補が実在するか」を元データ (枠 ∩ 道中許可リスト) から独立に決めて突合
    const travelByData = CLASS_KEYS.filter(ck =>
      obs[ck].equippedByData.some(id => EXPECT_TRAVEL_IDS.indexOf(id) >= 0));
    check('(6a-3) 2 経路突合: 「枠 ∩ 道中許可リストが非空」の職と、実際に道中行が出た職が一致',
      setEq(travelByData, travelSeen),
      'データ由来 = ' + JSON.stringify(travelByData) + ' / 描画 = ' + JSON.stringify(travelSeen));

    // ── (6b) 装備していない技は選択肢に出ない ────────────────────────────
    const leak = [];
    const wholePool = [];
    for (const ck of CLASS_KEYS) {
      for (const sit of SITUATIONS) {
        const r = obs[ck].rows[sit];
        if (!r.exists) continue;
        const vals = r.values.filter(v => v !== '');
        const allowed = (sit === 'travel')
          ? obs[ck].equippedByData.filter(id => EXPECT_TRAVEL_IDS.indexOf(id) >= 0)
          : obs[ck].equippedByData;
        const extra = vals.filter(v => allowed.indexOf(v) < 0);
        if (extra.length) leak.push(ck + '/' + sit + ' -> ' + JSON.stringify(extra));
        if (vals.length && setEq(vals, obs[ck].poolIds)) wholePool.push(ck + '/' + sit);
      }
    }
    check('(6b-1) 装備していない技が選択肢に 1 つも出ていない (24 枠すべて)',
      leak.length === 0, leak.length ? leak.join(' ') : '漏れ 0');
    check('(6b-2) 選択肢が skillPool 丸ごとになっている枠が 1 つも無い (絞り込みが実際に効いている)',
      wholePool.length === 0, wholePool.length ? wholePool.join(' ') : '0 枠');
    check('(6b-3) 先頭の選択肢は必ず「おまかせ」(value="")',
      CLASS_KEYS.every(ck => SITUATIONS.every(sit => {
        const r = obs[ck].rows[sit];
        return !r.exists || (r.values[0] === '' && r.labels[0] === 'おまかせ');
      })), 'ok');

    // ── (6c) 装備を外すと「おまかせ」へ戻り、localStorage も null ────────
    const set6c = await page.evaluate(() => {
      window.__equipTV.setTab('warrior');
      const sel = document.getElementById('apSel_warrior_general');
      if (!sel) return { ok: false, why: 'apSel_warrior_general が無い' };
      const values = Array.prototype.map.call(sel.options, o => o.value);
      if (values.indexOf('strong-cleave') < 0) return { ok: false, why: '強斬りが候補に無い', values };
      sel.__apMark = 'before-change';                       // ⛔ 再帰再描画の検出用マーカー
      sel.value = 'strong-cleave';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const after = document.getElementById('apSel_warrior_general');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        ok: true,
        mem: selection.actionPriority.warrior.general,
        ls: (ls && ls.warrior) ? ls.warrior.general : '(キー無し)',
        sameNode: after === sel,
        markSurvived: after ? after.__apMark === 'before-change' : false,
        selValue: after ? after.value : null,
      };
    });
    check('(6c-1) change で selection と localStorage の両方に skillId が入る',
      set6c.ok && set6c.mem === 'strong-cleave' && set6c.ls === 'strong-cleave',
      JSON.stringify(set6c));
    // ⛔ 依頼書の禁止事項「change で renderCharLoadout() を再帰で呼ばない」の機械検査。
    //    再帰すると select が作り直されてノードが入れ替わり、プルダウンが選べなくなる。
    check('(6c-2) change ハンドラが select を作り直していない (再帰再描画をしていない)',
      set6c.sameNode === true && set6c.markSurvived === true && set6c.selValue === 'strong-cleave',
      'sameNode=' + set6c.sameNode + ' mark=' + set6c.markSurvived + ' value=' + set6c.selValue);

    const drop6c = await page.evaluate(() => {
      // 本番の経路で装備を外す (.skillItem のクリック → saveSelections + renderCharLoadout)
      const slot = PARTY_SLOTS.find(s => s && s.classKey === 'warrior');
      const skills = slot.skillPool.filter(sk => !sk.mpCost);
      const idx = skills.findIndex(sk => sk.id === 'strong-cleave');
      const items = document.querySelectorAll('#skillList .skillItem');
      if (idx < 0 || !items[idx]) return { ok: false, idx, n: items.length };
      const before = (selection.partySkills.warrior || []).slice();
      items[idx].click();
      const sel = document.getElementById('apSel_warrior_general');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        ok: true, before, after: (selection.partySkills.warrior || []).slice(),
        selValue: sel ? sel.value : '(select 無し)',
        selValues: sel ? Array.prototype.map.call(sel.options, o => o.value) : [],
        mem: selection.actionPriority.warrior.general,
        ls: (ls && ls.warrior) ? ls.warrior.general : '(キー無し)',
      };
    });
    check('(6c-3) 前提: 本番の経路で 強斬り の装備が実際に外れた',
      drop6c.ok && drop6c.before.indexOf('strong-cleave') >= 0 && drop6c.after.indexOf('strong-cleave') < 0,
      JSON.stringify({ before: drop6c.before, after: drop6c.after }));
    check('(6c-4) 装備を外して再描画すると select が「おまかせ」へ戻り、候補からも消える',
      drop6c.selValue === '' && drop6c.selValues.indexOf('strong-cleave') < 0,
      'value=' + JSON.stringify(drop6c.selValue) + ' values=' + JSON.stringify(drop6c.selValues));
    check('(6c-5) selection と localStorage の値も null へ書き戻されている (古い ID を黙って残さない)',
      drop6c.mem === null && drop6c.ls === null,
      'mem=' + JSON.stringify(drop6c.mem) + ' ls=' + JSON.stringify(drop6c.ls));

    // 後片付け: 強斬り を戻す (以降の観測を汚さない)
    const restore = await page.evaluate(() => {
      const slot = PARTY_SLOTS.find(s => s && s.classKey === 'warrior');
      const skills = slot.skillPool.filter(sk => !sk.mpCost);
      const idx = skills.findIndex(sk => sk.id === 'strong-cleave');
      const items = document.querySelectorAll('#skillList .skillItem');
      if (idx >= 0 && items[idx]) items[idx].click();
      return (selection.partySkills.warrior || []).slice();
    });
    check('(6c-6) 後片付け: 強斬り を再装備できた (Lv 帯とスキル枠の前提が生きている)',
      restore.indexOf('strong-cleave') >= 0, JSON.stringify(restore));

    await page.close();

    // ── (6d) compact (iPhone 幅) で横スクロールしない ───────────────────
    const pageM = await openPrepScreen(browser, { name: 'iphone', width: 390, height: 844 });
    const m = await pageM.evaluate(() => {
      const out = {};
      const keys = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
      for (const ck of keys) {
        window.__equipTV.setTab(ck);
        const rows = document.getElementById('apRows');
        const sec  = document.getElementById('actionPrioritySection');
        out[ck] = {
          selects: document.querySelectorAll('#apRows select').length,
          scrollW: rows ? rows.scrollWidth : -1,
          clientW: rows ? rows.clientWidth : -1,
          secScrollW: sec ? sec.scrollWidth : -1,
          secClientW: sec ? sec.clientWidth : -1,
        };
      }
      return out;
    });
    const mKeys = Object.keys(m);
    check('(6d-0) 母集団: iPhone 幅でも 6 職すべてで #apRows に select が 4 個ある',
      mKeys.every(ck => m[ck].selects === 4), mKeys.map(ck => ck + ':' + m[ck].selects).join(' '));
    check('(6d-1) 母集団: #apRows が実際に幅を持って描かれている (0 幅で自明に緑にならない)',
      mKeys.every(ck => m[ck].clientW > 50), mKeys.map(ck => ck + ':' + m[ck].clientW).join(' '));
    const over = mKeys.filter(ck => m[ck].scrollW > m[ck].clientW);
    check('(6d-2) compact (390px) で #apRows が横スクロールを起こさない (scrollWidth <= clientWidth)',
      over.length === 0,
      over.length ? over.map(ck => ck + ' ' + m[ck].scrollW + '>' + m[ck].clientW).join(' ')
                  : mKeys.map(ck => ck + ' ' + m[ck].scrollW + '<=' + m[ck].clientW).join(' '));
    const secOver = mKeys.filter(ck => m[ck].secScrollW > m[ck].secClientW);
    check('(6d-3) compact で #actionPrioritySection 自体も横スクロールを起こさない',
      secOver.length === 0,
      secOver.length ? secOver.map(ck => ck + ' ' + m[ck].secScrollW + '>' + m[ck].secClientW).join(' ') : 'OK');

    await pageM.close();
  } catch (e) {
    check('(FATAL) ドライバが最後まで走った', false, e && e.message);
  }

  await browser.close();
  srv.close();

  const realErrs = pageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode|play\(\) failed|NotAllowedError/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok && !r.pending).length;
  const pend   = results.filter(r => r.pending).length;
  console.log('\n[driver] RESULT: PASSED ' + passed + ' / FAILED ' + failed + ' / PENDING ' + pend);
  if (failed) console.log('[driver] FAILED: ' + results.filter(r => !r.ok && !r.pending).map(r => r.name).join(' | '));
  if (pend)   console.log('[driver] PENDING: まだ測っていない節があります (黙って緑にしていない)');

  if (NEGATIVE) {
    // 負のコントロールの判定。⚠ 1 本でも「注入したのに緑」があれば exit 1 (空振りの証拠)。
    let negNg = 0;
    const judge = (label, prefix, note) => {
      const grp  = results.filter(r => r.name.indexOf(prefix) === 0 && !r.pending);
      const reds = grp.filter(r => !r.ok);
      console.log('\n[driver] 負のコントロール ' + label + ' の判定 (' + note + '): '
        + reds.length + '/' + grp.length + ' 本が赤');
      if (grp.length === 0) {
        console.log('[driver] NG: ' + note + ' の assert が 1 本も走っていません (母集団ゼロ)');
        negNg++; return;
      }
      if (reds.length === 0) {
        console.log('[driver] NG: ' + label + ' を注入したのに ' + note + ' が緑のまま = テストが空振りしています');
        negNg++; return;
      }
      console.log('[driver] OK: ' + label + ' で ' + note + ' が赤くなった: ' + reds.map(r => r.name).join(' , '));
    };
    // ⚠ '(1c)' で始まる名前は本体 1 本だけ ((1c-0)/(1c-1) は前提ガードなので N1 では赤くならない)
    judge('N1', '(1c)', '(1c) 倍率がクランプに食われていないか');
    // ⚠ (2c-1) は「指定なし」の検査なので N2 でも緑のまま。赤くなるのは (2c-0)/(2c-2)。
    judge('N2', '(2c', '(2c) apGateP が上げるだけで下げていないか');
    judge('N3', '(6b-', '(6b) 装備していない技が候補に出ないか');
    // ⚠ '(3d' は (3d-0)/(3d)/(3d-2) に当たる。N4 では本体 (3d)/(3d-2) が赤くなる。
    judge('N4', '(3d', '(3d) 1戦1回スキルが道中で撃てないか (§2-6 の罠)');
    // ⚠ '(4a' は (4a-0)/(4a) に当たる。N5 で赤くなるのは本体 (4a)。
    judge('N5', '(4a', '(4a) 主人公のバフだけ剥がれていないか (§2-5 の罠)');
    // ⚠ '(3c' は (3c-0)/(3c) に当たる。N6 で赤くなるのは本体 (3c)。
    judge('N6', '(3c', '(3c) 1 接敵 1 回のラッチが効いているか');
    // ── #34 の 5 本 ──────────────────────────────────────────────────────────
    judge('N7',  '(7b-2)', '(7b-2) dmgBonus: 0 が武器の修正値へ落ちていないか');
    judge('N8',  '(7d)',   '(7d) 渾身の一撃のセルフスタンが死にフィールドへ消えていないか (§2-4 の罠)');
    judge('N9',  '(7f)',   '(7f) 士気高揚を効いている最中に撃ち直していないか (§2-5 の罠)');
    judge('N10', '(7h)',   '(7h) 仲間の闘志で主人公が回復していないか (§2-2 の罠)');
    judge('N11', '(2e)',   '(2e) 確率ゲートがすべて apGateP でラップされているか');
    process.exit(negNg === 0 ? 0 : 1);
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
