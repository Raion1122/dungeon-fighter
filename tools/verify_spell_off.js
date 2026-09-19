#!/usr/bin/env node
/*
 * verify_spell_off.js — 実装依頼書 #70「使わない魔法・特技の見分け + 僧侶の除外」の受入 (§8)
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_spell_off.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_spell_off.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_spell_off.js --negative --only slice5
 *
 * ── 方針 (依頼書 §8 冒頭) ─────────────────────────────────────────────────
 *   **実プレイは使わない。** 酒場の DOM・保存と読み込みの往復・本体の配分関数を、
 *   仕込んだ localStorage で決定論的に測る。
 *
 * ── 測っているもの ─────────────────────────────────────────────────────────
 *   §0 装置  (0a) 配信バイトの判定がちょうど 1 箇所ずつ
 *            (0b) 引き出しに個数の行・入れ外しの行・僧侶の行がそれぞれ 1 行以上
 *            (0c) 除外なしの腕の僧侶の仲間の maxSpellSlots のキーが 2 個以上
 *            (0d) 往復の節が同じタブで、1 回目に保存したキーが 2 回目の読み込み前に残っている
 *            (0e) pageerror / console error が 0 件
 *   §1 見せ方 (1a) 魔法使いの印 == 使えて個数 0 の集合   (1a2) 印とタグが一致
 *            (1b) 戦士の印 == 未選択の集合               (1b2) 1 つ外すと増え、戻すと消える
 *            (1c) 僧侶の「使わない」で保存・印・自動 0   (1c2) もう一度で戻る
 *            (1d) 除外中は #19 の候補 apEquippedIdsFor から消える
 *   §2 往復  (2a) スリープ 0 が保たれる + 対照 (空の初回は index 1 へ差し込み)
 *            (2a2) 無保存の開き直しでは差し込まれたまま (読み込みで印を書かない)
 *            (2b) 12 個 (sleep 込み) が減らない          (2b2) 戦士は 5 件で切られたまま
 *            (2b3) ⭐ sleep を含まない 12 個 → 素 13 個 / 撤退 6 個 の対照
 *            (2c) 除外リストが残る + 酒場の配分から消える
 *   §3 配分  (3a) 除外 ID だけ消え残りは完全一致 (差) (3a2) 表の実体と突き合わせ (絶対量)
 *            (3a3) 枠を他へ回さない                    (3b) レベルアップでも消えたまま
 *            (3c) 先頭の経路でも消える                 (3d) NPC の空配列が空のまま (実導線)
 *            (3d2) プリセット経路と既定経路の対照 (両腕共通の恒等)
 *            (3e) clericAI を回しても除外した呪文の詠唱 0 回・枠の消費 0 (対照つき)
 *   §4 キー  (4a) 新 2 キーが dragonfighters. 始まり・DFSlots.snapshot() に含まれ KEEP に無い
 *   §5 撤退  (5a-*) 酒場 ?spelloff=0  /  (5b-*) 本体 ?spelloff=0
 *            ⭐ 素の腕と **同じ assert 本体** を当て、期待値だけ撤退側へ入れ替えて崩れを見る。
 *
 * ── ⛔ 測らないこと (依頼書 §8。後続が善意で縛りにいかないよう明記する) ──
 *   ・印の色 / 減光の度合い / 「使わない」の文言          (§9 の実機体感)
 *   ・引き出しの寸法 (max-height / overflow は既存 verify_pm_drawer_fit が守る)
 *   ・実プレイの発射率・難易度                            (§9)
 *   ・除外した僧侶の枠の行き先 (回さないのが既定 = (3a3) で「回っていない」だけ見る)
 *
 * ── ⚠ 計測機構 (踏みやすい罠。全部 #70 の項目1〜3 が実測したもの) ──────────
 *  - ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になる)。
 *  - ⚠ ポートは **10351**。⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56)。
 *    負のコントロールの子プロセスは 10352〜10363 (変異 12 本)。
 *  - ⚠ index.html / tavern.html はディスク上 **CRLF**。複数行アンカーは CRLF で書く。
 *  - ⚠⚠ (0a) を「語の件数」で書かない。`spelloff` の**語**は tavern に 4 / index に 2 あるが、
 *    **判定**の逐語 `get("spelloff")` は各 1 箇所。数えるのは判定のほう。
 *  - ⛔ window に載るのはトップレベルの function だけ。const は載らない
 *    (selection / PARTY_SLOTS / CLERIC_SLOTS_TABLE は **裸の識別子**で読む)。
 *  - ⚠ 「読み込み直し」は **同じタブで page.goto をもう一度**踏む (新しいタブにしない = #22)。
 *    ⚠ evaluateOnNewDocument で毎回 localStorage.clear() すると往復が測れない
 *      ⇒ 往復の節では消去系を仕込みに置かず、節ごとに evaluate で作り直す。
 *  - ⚠⚠⚠ (2b) の 12 個の一覧には **sleep を必ず含める**。含めないと直った後も
 *    withInnateSleepListTV が index 1 へ 1 個足して 13 個になり、**直っているのに赤**になる。
 *    ⇒ sleep を含まない一覧は (2b3) で別に測る (素 13 / 撤退 6 = 欠陥 2 つの合成)。
 *  - ⚠⚠⚠ (5a) の期待値は「仕込んだ一覧に sleep が在るか」で分岐する。
 *      sleep 在り … 撤退側は **5 個** (切り詰めのみ) / sleep 無し … 撤退側は **6 個**。
 *    ⛔ どちらか一方を決め打ちしない。この道具は両方を別 assert で持つ。
 *  - ⭐ (3a) の期待集合は getClericSlots の戻り値ではなく **CLERIC_SLOTS_TABLE の実体**と
 *    自分が仕込んだ除外リストから独立に組む (2 経路。⛔ 本番の判定関数を期待値にしない)。
 *  - ⚠ apEquippedIdsFor は getLevelFromXP(inventory.xp) を見る ⇒ xp を仕込まないと Lv1 で
 *    候補が 2 件しかない。**xp = 45000 (Lv10) を仕込む**。
 *  - ⭐ (0b) の引き出しは本番の導線 (openPrep → マッチング演出) まで進めて開く。顔ぶれは
 *    本番の makeHeroMember / makeNpcMember / orderFormation で **決定論的に**組む
 *    (#54 以後の既定はソロなので、抽選任せだと魔法使いと僧侶のカードが出ない)。
 *    ⭐ 開くのは pmOpenDrawer(idx) を直接呼ぶ。⛔ 実座標クリックは #56 の地雷
 *      (器がスクロールすると画面外へ落ちて別の物に当たる)。(0b) は測定対象ではなく装置。
 *  - ⭐ (3d) は **実導線**で測る = localStorage に partySkills {mage:[], elf:[]} を仕込んで
 *    index.html を開き、本番が組んだ NPC の equippedSkills を読む。
 *    ⛔ hasPreset の式をドライバへ書き写さない (実装とドライバが同じ誤りを持つ事故になる)。
 *  - ⭐ (3e) は本番の clericAI をそのまま回す。枠は補充せず「初期値 − 最終値」で詠唱回数を数える
 *    (関数の差し替えに依存しない経路)。⛔ clericAI の梯子を写経しない。
 *  - 後始末は **このドライバが起動したもの** (内蔵サーバとこのブラウザ) だけ。
 *    ⛔ 8765 (ユーザーの試遊サーバ) には触らない。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §8 の変異表 12 本。⚠⚠⚠ **1 本ずつ** `--only <tag>` で確定させる
 *   (同時に入れると互いを覆い隠す)。--only 無しの --negative は自分自身を 1 本ずつ
 *   子プロセスで呼び直す。
 *   ⚠ NEG_EXPECT は机上で書かない。1 本ずつ実走して**実際に赤くなったラベル**を書いた。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
/* ⚠⚠⚠ 10080 は Chrome の制限ポート (net::ERR_UNSAFE_PORT)。
   base 10351 は #70 項目1 が実測して未使用 (既存 base の最大は 10343)。 */
const PORT     = parseInt(arg('port', '10351'), 10);
const SCENARIO = arg('scenario', 'goblin-mine');      // ⛔ orc-fort は locked:true で受注できない

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {
  '/index.html':  fs.readFileSync(path.join(ROOT, 'index.html')),
  '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')),
};
const PRISTINE = {
  '/index.html':  FROZEN['/index.html'].toString('utf8'),
  '/tavern.html': FROZEN['/tavern.html'].toString('utf8'),
};
const CRLF = PRISTINE['/index.html'].includes('\r\n') ? '\r\n' : '\n';
const INJECTED = [];

/* ⭐⭐⭐ アンカー健在チェックは **手つかずの原本** に対して行う (#56 の教訓)。
   変異後のバッファで数えると、同じアンカーを共有する 2 本目が「注入点 0 箇所」=
   偽のアンカー腐敗 (exit 3) になり、いちばん大事な変異が 1 度も走らない。 */
function mutate(file, label, anchor, patch) {
  const tag  = label.split(' ')[0];
  const hits = PRISTINE[file].split(anchor).length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + file + '  ' + anchor.slice(0, 160));
    process.exit(3);
  }
  if (anchor === patch || anchor.length === patch.length) {
    console.error('[driver] ' + label + ' は置換前後が同一 / 同じバイト長です (起動時検算に落ちる形)');
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  const parts = FROZEN[file].toString('utf8').split(anchor);
  if (parts.length - 1 !== 1) {
    console.error('[driver] ' + label + ' は同 tag の先行変異にアンカーを食われました (' + (parts.length - 1) + ' 箇所)。');
    process.exit(3);
  }
  FROZEN[file] = Buffer.from(parts.join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました (' + file + ')');
}

/* 変異 → 赤くなるべきラベルの担当表。
   ⚠⚠⚠ 机上で書いてはいけない。`--only <tag>` で **1 本ずつ**走らせ、実際に赤くなった
     ラベルを見てから書いた (2026-09-19 実測。依頼書 §8 の変異表は「赤くなるべき節」を
     1〜2 個しか挙げていないが、実測では下のとおり連鎖して赤くなる)。
   ⭐ ここに挙げたものは全部「本物の検出」であって、母集団が消えた偽の赤ではない
     (素の腕は 2 回走らせて assert 列が完全一致することを確かめてある)。 */
const NEG_EXPECT = {
  /* 依頼書の期待 (3a)(3e) に加え、酒場側の口を殺したので (1d)(2c)、
     口 1 点であることの帰結として (3a3)(3b)(3c) も赤くなる。 */
  viewonly:    ['(1d)', '(2c)', '(3a)', '(3a3)', '(3b)', '(3c)', '(3e)'],
  initonly:    ['(3b)', '(3c)'],
  tablerow:    ['(1c)'],
  apcand:      ['(1d)'],
  sleepevery:  ['(2a)'],
  /* 読み込みで印を書くと、印のある状態で開き直したときに差し込みが消える ⇒ (2b3) も落ちる。
     さらに saveSelections が印を書かなくなるので (4a) も落ちる。 */
  markonload:  ['(2a2)', '(2b3)', '(4a)'],
  presetlen:   ['(3d)'],
  slice5:      ['(2b)', '(2b3)'],
  /* 前置詞を外すと酒場の読み書きが別キーへ逸れる ⇒ 行の往復 (1c)(1c2)・候補 (1d)・
     往復 (2c) も落ちる。⭐ (4a) が「本番が書いたキー」を見ている唯一の網。 */
  noprefix:    ['(1c)', '(1c2)', '(1d)', '(2c)', '(4a)'],
  offfull:     ['(1a)'],
  offselected: ['(1b)', '(1b2)'],
  /* 撤退スイッチを殺すと、撤退の腕が素の腕と同じ振る舞いになる = §5 が総崩れになる。 */
  switchdead:  ['(5a-1a)', '(5a-1b)', '(5a-1b2)', '(5a-1c)', '(5a-1c2)', '(5a-1d)',
                '(5a-2a)', '(5a-2b)', '(5a-2b3)', '(5a-2c)',
                '(5b-3d)', '(5b-3a)', '(5b-3a3)', '(5b-3b)', '(5b-3c)'],
};

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad  = [];
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます'
    + '  ⚠ 同時注入は互いを覆い隠すので必ず 1 本ずつ');
  tags.forEach((tag, i) => {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT + 1 + i)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  });
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}

if (NEGATIVE) {
  /* ── viewonly: 僧侶の除外を保存・表示するが、配分表の口では消さない ──────
       = 2026-09-16 の「見せ方だけ足す」案の再現。両ファイルの 1 点を殺す。 */
  mutate('/index.html', 'viewonly (本体の配分から除外を消さない = 見せ方だけ)',
    '      if (isSpellOffOn()) for (const id of clericSpellsOffIds()) delete out[id];',
    '      void 0;   /* viewonly: 配分からは消さない */');
  mutate('/tavern.html', 'viewonly (酒場の配分から除外を消さない = 見せ方だけ)',
    '    if (isSpellOffOnTV()) for (const id of clericSpellsOffTV()) delete out[id];',
    '    void 0;   /* viewonly */');
  /* ── initonly: 除外を initAllySpellSlots の中だけで掛ける (口 1 点でない) ── */
  mutate('/index.html', 'initonly (除外を getClericSlots から降ろす)',
    '      if (isSpellOffOn()) for (const id of clericSpellsOffIds()) delete out[id];',
    '      void 0;   /* initonly: ここでは消さない */');
  mutate('/index.html', 'initonly (除外を initAllySpellSlots の中だけで掛ける)',
    '        allocMap = getClericSlots(lv);' + CRLF
    + '        // 完全ゲート: 未習得(聖典未読)の呪文は配分から除外',
    '        allocMap = getClericSlots(lv);' + CRLF
    + '        if (isSpellOffOn()) for (const __id of clericSpellsOffIds()) delete allocMap[__id];   /* initonly */' + CRLF
    + '        // 完全ゲート: 未習得(聖典未読)の呪文は配分から除外');
  /* ── tablerow: 僧侶の行の「自動 N」を表から直接読んだまま ───────────────── */
  mutate('/tavern.html', 'tablerow (自動 N が除外を見ずに CLERIC_SLOTS_TABLE を直読みする)',
    '    const autoShown = (isAuto && known && !clericOff) ? autoFromTable : 0;',
    '    const autoShown = (isAuto && known) ? autoFromTable : 0;   /* tablerow */');
  /* ── apcand: #19 の候補が getClericSlotsTV を通さず表を読む ──────────────── */
  mutate('/tavern.html', 'apcand (apEquippedIdsFor が除外を見ずに表を直読みする)',
    '      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));',
    '      const auto = (function () { const o = {}, c = Math.max(0, Math.min(10, getLevelFromXP(inventory.xp)));'
    + ' for (const [k, t] of Object.entries(CLERIC_SLOTS_TABLE)) { const n = t[c] || 0; if (n > 0) o[k] = n; } return o; })();   /* apcand */');
  /* ── sleepevery: 印に関係なくスリープを毎回差し込む (§2-3 ② の再現) ─────── */
  mutate('/tavern.html', 'sleepevery (スリープを毎回差し込む = 0 にしても戻る)',
    '    if (partySkills.mage && !(isSpellOffOnTV() && mageSleepSeededTV()))',
    '    if (partySkills.mage || false)   /* sleepevery */');
  /* ── markonload: 印を saveSelections でなく読み込みの中で書く (§5-4 の罠) ── */
  mutate('/tavern.html', 'markonload (保存では印を書かない)',
    '      markMageSleepSeededTV();   // ★[#70] 印は**保存と一緒に**書く (§5-4。読み込みの中では書かない)',
    '      void 0;   /* markonload: 保存では書かない */');
  mutate('/tavern.html', 'markonload (読み込みの中で印を書く)',
    '      partySkills.mage = withInnateSleepListTV(partySkills.mage);',
    '      partySkills.mage = withInnateSleepListTV(partySkills.mage);' + CRLF
    + '    markMageSleepSeededTV();   /* markonload: 読み込みで印を書く */');
  /* ── presetlen: hasPreset に length > 0 を戻す (§2-3 ③ の再現) ───────────
       ⚠⚠ アンカーは **2 行の逐語**。1 行で探すと 0 件 = exit 3。 */
  mutate('/index.html', 'presetlen (NPC の空配列をまた「未設定」扱いにする)',
    '        const hasPreset = !!(partySkillsMap && Array.isArray(partySkillsMap[ally.classKey])' + CRLF
    + '          && (isSpellOffOn() || partySkillsMap[ally.classKey].length > 0));',
    '        const hasPreset = !!(partySkillsMap && Array.isArray(partySkillsMap[ally.classKey])' + CRLF
    + '          && partySkillsMap[ally.classKey].length > 0);   /* presetlen */');
  /* ── slice5: 呪文職も 5 件で切る (§2-4 の再現) ──────────────────────────
       ⚠⚠ `.slice(0, skillSlotsForLevel(10))` 単体は ⛔ 触らない戦士の旧キー移行にも在る。
          実装後は `.slice(0, keepCap);` がちょうど 1 箇所なのでこちらを指す。 */
  mutate('/tavern.html', 'slice5 (読み込みで呪文職も一律 5 件に切る)',
    '              .slice(0, keepCap);',
    '              .slice(0, skillSlotsForLevel(10));   /* slice5 */');
  /* ── noprefix: 除外キーを dragonfighters. で始まらない名前にする (§2-6 の罠) ─ */
  mutate('/tavern.html', 'noprefix (除外キーの前置詞を外す = スロットに付いてこない)',
    '  const CLERIC_OFF_KEY_TV = "dragonfighters.clericSpellsOff";',
    '  const CLERIC_OFF_KEY_TV = "dfClericSpellsOff";   /* noprefix */');
  /* ── offfull: Lv 不足・未習得の行にも印を付ける ─────────────────────────── */
  mutate('/tavern.html', 'offfull (選べない行 (.full) にも「使わない」を付ける)',
    '    const isOff = isSpellOffOnTV() && (isAuto ? clericOff : (usable && cnt <= 0));',
    '    const isOff = isSpellOffOnTV() && (isAuto ? clericOff : (cnt <= 0));   /* offfull */');
  /* ── offselected: 入れ外しの行で選択中にも印を付ける ─────────────────────── */
  mutate('/tavern.html', 'offselected (選択中の特技にも「使わない」を付ける)',
    '    const isOff = isSpellOffOnTV() && !selected;',
    '    const isOff = isSpellOffOnTV();   /* offselected */');
  /* ── switchdead: 両ページの撤退判定を常に真にする ───────────────────────
       ⭐ `get("spelloff")` の逐語は残す = (0a) を巻き添えにしない形で殺す。 */
  mutate('/tavern.html', 'switchdead (酒場の ?spelloff=0 を無視する)',
    '    try { return new URLSearchParams(location.search).get("spelloff") !== "0"; }',
    '    try { return (new URLSearchParams(location.search).get("spelloff") !== "0") || true; }   /* switchdead */');
  mutate('/index.html', 'switchdead (本体の ?spelloff=0 を無視する)',
    '      try { return new URLSearchParams(window.location.search).get("spelloff") !== "0"; }',
    '      try { return (new URLSearchParams(window.location.search).get("spelloff") !== "0") || true; }   /* switchdead */');
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
        if (FROZEN[u]) { rs.setHeader('Content-Type', MIME['.html']); rs.end(FROZEN[u]); return; }
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
 * 集計
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];
const J = (v) => JSON.stringify(v);
const sortJ = (a) => J((a || []).slice().sort());

/* 可視判定。checkVisibility は祖先の display:none までまとめて見てくれる。 */
const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* ══════════════════════════════════════════════════════════════════════════
 * 仕込みとページの開き方
 * ══════════════════════════════════════════════════════════════════════════ */
const TAVERN_URL = (arm) => 'http://localhost:' + PORT + '/tavern.html' + (arm || '');
const INDEX_URL  = (arm) => 'http://localhost:' + PORT + '/index.html'  + (arm || '');

/* 酒場の素の仕込み。⚠ prologueSeen / prepOnboardingSeen は #70 と無関係な初回ナレ。
   ⚠ xp は 45000 = Lv10 (apEquippedIdsFor が getLevelFromXP(inventory.xp) を見るため。
     仕込まないと Lv1 で候補が 2 件しか無く、(1d) の母集団が痩せる)。 */
function seedTavern() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '45000');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
    localStorage.setItem('dragonfighters.soloWarnSeen', '1');
  } catch (e) {}
}

function attachLogs(page, tag) {
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけに絞る
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
}

async function openTavern(browser, arm, tag, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  attachLogs(page, tag);
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const url = TAVERN_URL(arm);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!opts.noSeed) { await page.evaluate(seedTavern); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  /* ⚠ 裸の識別子で待つ (classic script 直下の const/let は window に載らない)。 */
  await page.waitForFunction(
    "typeof openPrep === 'function' && typeof selection !== 'undefined'"
    + " && typeof PARTY_SLOTS !== 'undefined' && typeof renderSpellSlotItem === 'function'"
    + " && typeof renderSkillItem === 'function' && typeof CLERIC_SLOTS_TABLE !== 'undefined'",
    { timeout: 25000 });
  return page;
}

/* 受注 → マッチング演出が【開いた瞬間】まで進める (手本 = verify_party_match_setup)。
   ⚠ openPrep は await しない (演出がタップ待ちで止まるため)。
   ⭐ 顔ぶれは本番の makeHeroMember / makeNpcMember / orderFormation で決定論的に組む。
   ⚠⚠⚠ **openPrep の前に仕込んでも消える。** openPrep は冒頭で `regeneratePartyMembers()` を
     **無条件に**呼ぶ (tavern.html の「仲間を新規抽選 (Q3=A: 出発のたび再抽選)」の行)。
     #54 以後の既定は「声を掛けた相手だけ」= 誰も誘っていないのでソロになる ⇒ 魔法使いと僧侶の
     カードが 1 枚も出ず、(0b) が永久に赤いまま「装置が壊れている」ようにしか見えない。
   ⇒ **受注ナレ (約 20 秒) の間に入れ直す**。playPartyMatchCinematic は
     ナレの await の **後** で selection.partyMembers を読むので、これで決定論になる。
   ⛔ 抽選を止める改造は本番側に 1 バイトも入れない (これは装置であって測定対象ではない)。 */
const FORCE_PARTY = () => {
  const used = new Set();
  selection.partyMembers = orderFormation([
    makeHeroMember('warrior'),
    makeNpcMember('mage', used),
    makeNpcMember('cleric', used),
    makeNpcMember('elf', used),
  ]);
  return selection.partyMembers.map((m) => m.classKey);
};
async function advanceToCinema(page, scId, budgetMs) {
  await page.evaluate((id) => {
    const sc = scenarios.find((s) => s.id === id);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  }, scId);
  const t0 = Date.now();
  let lastClick = 0;
  let seeded = null;
  while (Date.now() - t0 < (budgetMs || 90000)) {
    const st = await page.evaluate((visSrc, forceSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      const ov = q('partyMatchOverlay');
      const cinema = !!(ov && ov.style.display === 'flex' && !ov.classList.contains('fading'));
      /* ⭐ 演出が開く前は毎回入れ直す (openPrep の抽選より後・演出が読むより前に置くため)。 */
      let forced = null;
      if (!cinema) { try { forced = eval('(' + forceSrc + ')')(); } catch (e) { forced = ['ERR ' + e.message]; } }
      return { cinema: cinema, prep: vis(q('prep')), prol: vis(q('prologueOverlay')), forced: forced,
               ordered: (typeof pmOrdered !== 'undefined') ? pmOrdered.map((m) => m.classKey) : null };
    }, VIS_FN, FORCE_PARTY.toString());
    if (st.forced) seeded = st.forced;
    if (st.cinema) return { reached: true, seeded: seeded, ordered: st.ordered, ms: Date.now() - t0 };
    if (st.prep)   return { reached: false, why: 'prep へ落ちた', seeded: seeded, ms: Date.now() - t0 };
    if (st.prol && Date.now() - lastClick > 400) {
      await page.evaluate(() => { const o = document.getElementById('prologueOverlay'); if (o) o.click(); });
      lastClick = Date.now();
    }
    await sleep(60);
  }
  return { reached: false, why: 'time out', seeded: seeded, ms: Date.now() - t0 };
}

/* 本体。⭐ (3d) を **実導線**で測るため、partySkills は goto の前に仕込む。 */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'メイ', trait: null, line: null },
  { classKey: 'elf',     isHero: false, zone: 'mid',   name: 'エラ', trait: null, line: null },
];
async function openIndex(browser, arm, tag) {
  const page = await browser.newPage();
  attachLogs(page, tag);
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  /* ⚠ evaluateOnNewDocument は全ナビゲーションで再実行される。消去系はここへ置かない。
     ⚠ 除外リスト (clericSpellsOff) は **ここには置かない** —— (0c)(3d) は除外なしの盤面で測り、
       (3a) 以降は evaluate で仕込んでから本番の関数を呼び直す (呼ぶたびに localStorage を読む)。 */
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.partySkills', JSON.stringify(seed.skills));
    } catch (e) {}
  }, { scen: SCENARIO, party: SEED_PARTY, xp: 45000, skills: { mage: [], elf: [] } });
  await page.goto(INDEX_URL(arm), { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(
    "typeof allies !== 'undefined' && allies.length > 0"
    + " && typeof enemies !== 'undefined' && typeof createEnemy === 'function'"
    + " && typeof initAllySpellSlots === 'function' && typeof getClericSlots === 'function'"
    + " && typeof clericAI === 'function' && !!mapData",
    { timeout: 60000 });
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 仕込む一覧 (⚠⚠ (2b) の 12 個には sleep を必ず含める = §8 の明示指示)
 * ══════════════════════════════════════════════════════════════════════════ */
const TWELVE_WITH_SLEEP = ['sleep',
  'magic-missile', 'magic-missile', 'magic-missile', 'magic-missile',
  'fire-bolt', 'fire-bolt', 'fire-bolt', 'fire-bolt',
  'arcane-shield', 'arcane-shield', 'arcane-shield'];
const TWELVE_NO_SLEEP = [
  'magic-missile', 'magic-missile', 'magic-missile', 'magic-missile', 'magic-missile', 'magic-missile',
  'fire-bolt', 'fire-bolt', 'fire-bolt',
  'arcane-shield', 'arcane-shield', 'arcane-shield'];

/* ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_spelloff_');
  const server  = await startServer();
  console.log('[driver] 配信 http://localhost:' + PORT + '/  ROOT=' + ROOT
    + (INJECTED.length ? '   ★変異 = ' + Array.from(new Set(INJECTED)).join(',') : ''));

  /* ── §0 (0a) 配信バイトの判定がちょうど 1 箇所ずつ ────────────────────────
     ⚠⚠ 語ではなく **判定の逐語** を数える (`spelloff` の語は tavern 4 / index 2 ある)。 */
  const jTav = PRISTINE['/tavern.html'].split('get("spelloff")').length - 1;
  const jIdx = PRISTINE['/index.html'].split('get("spelloff")').length - 1;
  const jTavSrv = FROZEN['/tavern.html'].toString('utf8').split('get("spelloff")').length - 1;
  const jIdxSrv = FROZEN['/index.html'].toString('utf8').split('get("spelloff")').length - 1;
  check('(0a) [装置] 配信 tavern.html / index.html に撤退の**判定** `get("spelloff")` が'
    + ' **ちょうど 1 箇所ずつ** (⛔ `spelloff` の語では数えない)',
    jTavSrv === 1 && jIdxSrv === 1,
    '配信 tavern=' + jTavSrv + ' index=' + jIdxSrv + ' / 原本 tavern=' + jTav + ' index=' + jIdx
    + ' / 配信バイト tavern=' + FROZEN['/tavern.html'].length + ' index=' + FROZEN['/index.html'].length);

  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--user-data-dir=' + profile],
  });

  try {
    /* ══════════════════════════════════════════════════════════════════════
     * §0 (0b) 引き出しの 3 種類の行 — 本番の導線でマッチング画面まで進めて開く
     *   ⭐ 変異の走行でも必ず通す = 「変異ページが起動したこと」の証拠になる。
     * ══════════════════════════════════════════════════════════════════════ */
    {
      const page = await openTavern(browser, '', 'tavern-0b');
      const adv = await advanceToCinema(page, SCENARIO);
      console.log('[driver] (0b) 演出へ到達 = ' + adv.reached + ' / ' + adv.ms + 'ms / 仕込んだ顔ぶれ = ' + J(adv.seeded)
        + ' / 演出が並べた顔ぶれ = ' + J(adv.ordered) + (adv.why ? ' / ' + adv.why : ''));
      let drawer = { err: '演出に到達しなかった' };
      if (adv.reached) {
        drawer = await page.evaluate(() => {
          const out = { classes: [], counts: {}, boot: null };
          const d = () => document.getElementById('pmDrawer');
          const n = (sel) => d() ? d().querySelectorAll(sel).length : 0;
          for (let i = 0; i < pmOrdered.length; i++) {
            const cls = pmOrdered[i].classKey;
            pmOpenDrawer(i);
            out.classes.push(cls);
            out.counts[cls] = {
              spellCount: n('.skillItem.spellCountItem .spellCountCtrl'),
              plain:      n('.skillItem:not(.spellCountItem)'),
              auto:       n('.skillItem.spellCountItem .spellAuto'),
              off:        n('.skillItem.skillOff'),
              rows:       n('.skillItem'),
            };
            pmCloseDrawer();
          }
          out.boot = { hasIsOff: typeof isSpellOffOnTV === 'function', on: isSpellOffOnTV() };
          return out;
        });
      }
      const c = drawer.counts || {};
      const nSpell = (c.mage || {}).spellCount || 0;
      const nPlain = (c.warrior || {}).plain || 0;
      const nAuto  = (c.cleric || {}).auto || 0;
      console.log('[driver] (0b) 引き出しの行数 = ' + J(c) + ' / boot = ' + J(drawer.boot));
      check('(0b) [装置] 引き出しに **個数の行・入れ外しの行・僧侶の行がそれぞれ 1 行以上** 描かれる'
        + ' (⭐ 0 行なら §1 が空振りで永久緑になる)',
        adv.reached && nSpell >= 1 && nPlain >= 1 && nAuto >= 1,
        '個数の行 (mage) ' + nSpell + ' / 入れ外しの行 (warrior) ' + nPlain + ' / 僧侶の行 (cleric) ' + nAuto
        + ' / 演出到達 ' + adv.reached + (drawer.err ? ' / ' + drawer.err : ''));
      await page.close();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * §1 見せ方 + §4 保存キー  (素 / 撤退 の 2 腕)
     * ══════════════════════════════════════════════════════════════════════ */
    for (const arm of ['', '?spelloff=0']) {
      const ON = arm === '';
      const P = ON ? '' : '5a-';
      console.log('\n[driver] ── §1 酒場 (腕 = ' + (ON ? '素' : arm) + ') ───────────────');
      const page = await openTavern(browser, arm, 'tavern-s1' + arm);

      /* ── (1a) 魔法使い: 印の集合 == 使えて個数 0 の集合 ──────────────────
         ⭐ 期待集合はドライバが selection.partySkills と Lv・習得から**独立に**計算する。 */
      const r1 = await page.evaluate(() => {
        const slot = PARTY_SLOTS.find((s) => s.classKey === 'mage');
        selection.partySkills.mage = ['magic-missile', 'magic-missile', 'fire-bolt'];
        const arr = selection.partySkills.mage;
        const lv = getLevelFromXP(inventory.xp);
        const totalMax = getMaxSpellSlotsForClassTV('mage', lv);
        const spells = slot.skillPool.filter((sk) => sk.mpCost > 0);
        const rows = spells.map((sk) => {
          const el = renderSpellSlotItem(sk, 'mage', arr.length, totalMax, lv);
          return {
            id: sk.id,
            off:   el.classList.contains('skillOff'),
            tag:   !!el.querySelector('.offTag'),
            full:  el.classList.contains('full'),
            cnt:   arr.filter((x) => x === sk.id).length,
            lvOk:  lv >= (sk.levelReq || 1),
            known: isSpellKnownTV('mage', sk.id),
          };
        });
        return { lv: lv, totalMax: totalMax, rows: rows };
      });
      const marked1   = r1.rows.filter((r) => r.off).map((r) => r.id);
      const expected1 = r1.rows.filter((r) => r.lvOk && r.known && r.cnt === 0).map((r) => r.id);
      const popFull   = r1.rows.filter((r) => !(r.lvOk && r.known) && r.cnt === 0).map((r) => r.id);
      const popHave   = r1.rows.filter((r) => r.cnt > 0).map((r) => r.id);
      check('(' + P + '1a) 魔法使いの印 (.skillOff) の集合が **使えて個数 0** の呪文の集合と一致'
        + (ON ? '' : ' (撤退では 0 個)')
        + ' [装置: 選べない行 (.full) と個数 1 以上の行がそれぞれ 1 行以上ある]',
        (ON ? sortJ(marked1) === sortJ(expected1) : marked1.length === 0)
        && popFull.length >= 1 && popHave.length >= 1,
        'lv=' + r1.lv + ' 印=' + sortJ(marked1) + ' 期待=' + sortJ(expected1)
        + ' / 選べない行 ' + popFull.length + ' 件 ' + sortJ(popFull) + ' / 個数 1+ ' + sortJ(popHave));
      check('(' + P + '1a2) どの行でも `.skillOff` クラスと `.offTag` の有無が一致する (印の二重化が無い)',
        r1.rows.every((r) => r.off === r.tag),
        r1.rows.filter((r) => r.off !== r.tag).map((r) => r.id + ':' + r.off + '/' + r.tag).join(',') || '(全行一致)');

      /* ── (1b) 戦士: 印の集合 == 未選択の集合 / 1 つ外すと増え戻すと消える ── */
      const r2 = await page.evaluate(() => {
        const slot = PARTY_SLOTS.find((s) => s.classKey === 'warrior');
        const plain = slot.skillPool.filter((sk) => !sk.mpCost);
        const base = plain.slice(0, 2).map((sk) => sk.id);
        const snap = (ids) => {
          selection.partySkills.warrior = ids.slice();
          const set = new Set(ids);
          const limit = skillLimitForClass('warrior');
          const full = set.size >= limit;
          return {
            limit: limit, full: full,
            rows: plain.map((sk) => {
              const el = renderSkillItem(sk, set, full, 'warrior');
              return { id: sk.id, off: el.classList.contains('skillOff'),
                       tag: !!el.querySelector('.offTag'), sel: set.has(sk.id) };
            }),
          };
        };
        const a = snap(base);
        const b = snap(base.slice(0, 1));      // 1 つ外す
        const c = snap(base);                  // 戻す
        return { a: a, b: b, c: c, base: base };
      });
      const markOf = (s) => s.rows.filter((r) => r.off).map((r) => r.id);
      const unselOf = (s) => s.rows.filter((r) => !r.sel).map((r) => r.id);
      check('(' + P + '1b) 戦士の印の集合が **未選択** の特技の集合と一致' + (ON ? '' : ' (撤退では 0 個)')
        + ' [装置: 選択中が 1 行以上・未選択が 1 行以上]',
        (ON ? sortJ(markOf(r2.a)) === sortJ(unselOf(r2.a)) : markOf(r2.a).length === 0)
        && r2.a.rows.some((r) => r.sel) && r2.a.rows.some((r) => !r.sel),
        '印=' + markOf(r2.a).length + ' 件 / 未選択=' + unselOf(r2.a).length + ' 件 / 枠 ' + r2.a.limit
        + ' / 選択中=' + J(r2.base));
      const droppedId = r2.base[1];
      const grew = markOf(r2.b).filter((x) => markOf(r2.a).indexOf(x) < 0);
      check('(' + P + '1b2) 1 つ外すと印がちょうどその 1 件だけ増え、戻すと消える'
        + (ON ? '' : ' (撤退ではどちらも 0 個のまま)'),
        ON ? (sortJ(grew) === J([droppedId]) && sortJ(markOf(r2.c)) === sortJ(markOf(r2.a)))
           : (markOf(r2.b).length === 0 && markOf(r2.c).length === 0),
        '外した=' + droppedId + ' / 増えた=' + sortJ(grew)
        + ' / 戻した後 ' + markOf(r2.c).length + ' 件 (最初 ' + markOf(r2.a).length + ' 件)');

      /* ── (1c) 僧侶: 「使わない」で保存 + 印 + 自動 0 / もう一度で戻る ────── */
      const r3 = await page.evaluate(() => {
        const slot = PARTY_SLOTS.find((s) => s.classKey === 'cleric');
        const sk = slot.skillPool.find((x) => x.id === 'shield-of-faith');
        const lv = getLevelFromXP(inventory.xp);
        const mk = () => renderSpellSlotItem(sk, 'cleric', 0, 99, lv);
        const pick = (el) => ({ off: el.classList.contains('skillOff'), tag: !!el.querySelector('.offTag'),
          btn: !!el.querySelector('.clericOffBtn'),
          btnText: (el.querySelector('.clericOffBtn') || {}).textContent || null,
          auto: (el.querySelector('.spellAuto b') || {}).textContent || null });
        try { localStorage.removeItem('dragonfighters.clericSpellsOff'); } catch (e) {}
        const host = document.createElement('div'); document.body.appendChild(host);
        const el0 = mk(); host.appendChild(el0);
        const before = pick(el0);
        const b0 = el0.querySelector('.clericOffBtn');
        if (b0) b0.click();
        const stored1 = localStorage.getItem('dragonfighters.clericSpellsOff');
        const el1 = mk(); host.appendChild(el1);
        const after = pick(el1);
        let stored2 = stored1;
        const b1 = el1.querySelector('.clericOffBtn');
        if (b1) { b1.click(); stored2 = localStorage.getItem('dragonfighters.clericSpellsOff'); }
        const back = pick(mk());
        host.remove();
        try { localStorage.removeItem('dragonfighters.clericSpellsOff'); } catch (e) {}
        return { lv: lv, before: before, after: after, back: back, stored1: stored1, stored2: stored2,
                 tableAt: (CLERIC_SLOTS_TABLE['shield-of-faith'] || [])[Math.max(0, Math.min(10, lv))] || 0 };
      });
      check('(' + P + '1c) 僧侶の行の「使わない」を押すと `dragonfighters.clericSpellsOff` にその ID が入り、'
        + '行に印 + `自動 0` が出る' + (ON ? '' : ' (撤退では切り替えボタン自体が無く、保存もされない)'),
        ON ? (r3.before.btn === true && r3.stored1 === J(['shield-of-faith'])
              && r3.after.off === true && r3.after.tag === true && r3.after.auto === '0'
              && r3.before.auto === String(r3.tableAt) && r3.tableAt > 0)
           : (r3.before.btn === false && r3.stored1 === null),
        'ボタン=' + r3.before.btn + ' 保存=' + r3.stored1 + ' 除外前の自動=' + r3.before.auto
        + ' (表の実体 ' + r3.tableAt + ') 除外後の自動=' + r3.after.auto + ' 印=' + r3.after.off);
      check('(' + P + '1c2) もう一度押すと除外リストから消え、印も `自動 0` も戻る'
        + (ON ? '' : ' (撤退では最初から何も起きない)'),
        ON ? (r3.stored2 === J([]) && r3.back.off === false && r3.back.auto === String(r3.tableAt))
           : (r3.stored2 === null && r3.back.off === false),
        '2 回目の保存=' + r3.stored2 + ' / 戻した後 印=' + r3.back.off + ' 自動=' + r3.back.auto);

      /* ── (1d) 除外中は #19 の候補 apEquippedIdsFor から消える ───────────── */
      const r4 = await page.evaluate(() => {
        const slot = PARTY_SLOTS.find((s) => s.classKey === 'cleric');
        const set = (a) => { try { localStorage.setItem('dragonfighters.clericSpellsOff', JSON.stringify(a)); } catch (e) {} };
        set([]);
        const lv = getLevelFromXP(inventory.xp);
        const all = apEquippedIdsFor(slot, 'cleric');
        set(['shield-of-faith']);
        const off = apEquippedIdsFor(slot, 'cleric');
        set([]);
        const back = apEquippedIdsFor(slot, 'cleric');
        return { lv: lv, all: all, off: off, back: back };
      });
      const gone4 = r4.all.filter((x) => r4.off.indexOf(x) < 0);
      check('(' + P + '1d) 僧侶の除外中は #19 優先度の候補 (apEquippedIdsFor) からその呪文が消え、戻すと現れる'
        + (ON ? '' : ' (撤退では消えない)') + ' [装置: 候補が 2 件以上]',
        (ON ? (J(gone4) === J(['shield-of-faith']) && J(r4.back) === J(r4.all))
            : (gone4.length === 0 && J(r4.back) === J(r4.all)))
        && r4.all.length >= 2,
        'lv=' + r4.lv + ' 候補=' + J(r4.all) + ' 除外中=' + J(r4.off) + ' 戻した後=' + J(r4.back));

      /* ── §4 (4a) 新しい 2 キーがスロットへ載る (素の腕だけ) ──────────────
         ⭐ 既存 golden の空白地帯 = verify_save_slots (5z) は `localStorage.clear()` の直後に
            **自分で蒔いた 4 キー**を同じ evaluate の中で数えるだけで、本番が書いたキーを 1 つも見ない。
         ⚠⚠⚠ 同じ穴をこちらで開けないこと。2026-09-19 に実際に踏んだ ——
            上の (1d) が `dragonfighters.clericSpellsOff` に `[]` を書いたまま残しており、
            変異 `noprefix` (キーの前置詞を外す) を入れても「キーは在る」= **空振り**になった。
         ⇒ **測る直前に両方のキーを消し、本番の口 (ボタン / saveSelections) にだけ書かせる**。
            値まで突き合わせる (⛔ 「キーが在る」だけで緑にしない)。 */
      if (ON) {
        const r5 = await page.evaluate(() => {
          const K1 = 'dragonfighters.clericSpellsOff', K2 = 'dragonfighters.mageSleepSeeded';
          try { localStorage.removeItem(K1); localStorage.removeItem(K2); } catch (e) {}
          const before = { off: localStorage.getItem(K1), mark: localStorage.getItem(K2) };
          const slot = PARTY_SLOTS.find((s) => s.classKey === 'cleric');
          const sk = slot.skillPool.find((x) => x.id === 'turn-undead');
          const host = document.createElement('div'); document.body.appendChild(host);
          const el = renderSpellSlotItem(sk, 'cleric', 0, 99, getLevelFromXP(inventory.xp));
          host.appendChild(el);
          const b = el.querySelector('.clericOffBtn');
          if (b) b.click();                       // ★ 除外リストを本番の口で書かせる
          host.remove();
          saveSelections();                        // ★ スリープの印を本番の口で書かせる
          const snap = (window.DFSlots && DFSlots.snapshot) ? DFSlots.snapshot() : null;
          const data = (snap && snap.data) ? Object.keys(snap.data) : [];
          const live = Object.keys(localStorage).filter((k) => k.indexOf('dragonfighters.') === 0);
          return {
            prefix: window.DFSlots ? DFSlots.LIVE_PREFIX : null,
            keep: window.DFSlots ? Object.keys(DFSlots.KEEP) : null,
            data: data, live: live, before: before,
            rawOff: localStorage.getItem(K1), rawMark: localStorage.getItem(K2),
          };
        });
        const K1 = 'dragonfighters.clericSpellsOff', K2 = 'dragonfighters.mageSleepSeeded';
        const inSnap = (k) => r5.data.indexOf(k) >= 0;
        const inKeep = (k) => (r5.keep || []).indexOf(k) >= 0;
        check('(4a) 新しい 2 キー (`' + K1 + '` / `' + K2 + '`) を **本番の口だけに書かせる** と、'
          + '`dragonfighters.` で始まる名前で実体が書かれ、`DFSlots.snapshot()` の中身に含まれ、`KEEP` に入っていない'
          + ' [⚠ 測る直前に両キーを消して「自分で蒔いたキーを数える」事故を塞いである]',
          r5.prefix === 'dragonfighters.'
          && r5.before.off === null && r5.before.mark === null
          && K1.indexOf(r5.prefix) === 0 && K2.indexOf(r5.prefix) === 0
          && r5.rawOff === J(['turn-undead']) && r5.rawMark !== null
          && inSnap(K1) && inSnap(K2) && !inKeep(K1) && !inKeep(K2),
          'prefix=' + r5.prefix + ' KEEP=' + J(r5.keep)
          + ' / 書かせる前 off=' + J(r5.before.off) + ' mark=' + J(r5.before.mark)
          + ' / 書かれた実体 off=' + r5.rawOff + ' mark=' + r5.rawMark
          + ' / snapshot に off=' + inSnap(K1) + ' mark=' + inSnap(K2)
          + ' / snapshot のキー数=' + r5.data.length);
        check('(4a2) [装置] `DFSlots.snapshot()` が空でなく、ライブのキー集合と同じものを見ている',
          r5.data.length >= 5 && r5.live.length >= 5
          && r5.data.every((k) => r5.live.indexOf(k) >= 0),
          'snapshot ' + r5.data.length + ' キー / ライブ ' + r5.live.length + ' キー'
          + ' / 差 = ' + J(r5.data.filter((k) => r5.live.indexOf(k) < 0)));
      }
      await page.close();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * §2 保存と読み込みの往復 (素 / 撤退 の 2 腕)
     *   ⚠ 同じタブで page.goto をもう一度踏む。⛔ 新しいタブにしない (#22)。
     * ══════════════════════════════════════════════════════════════════════ */
    for (const arm of ['', '?spelloff=0']) {
      const ON = arm === '';
      const P = ON ? '' : '5a-';
      console.log('\n[driver] ── §2 往復 (腕 = ' + (ON ? '素' : arm) + ') ───────────────');
      const page = await openTavern(browser, arm, 'tavern-s2' + arm);
      const url = TAVERN_URL(arm);
      const reload = async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction("typeof loadSelections === 'function' && typeof selection !== 'undefined'", { timeout: 25000 });
      };

      /* ── (2a) スリープを 0 にして保存 → 読み込み直し ────────────────────── */
      await page.evaluate(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('dragonfighters.xp', '45000');
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        window.name = 'DF_SPELLOFF_TAB';            // ★ (0d) 同じタブであることの印
      });
      await reload();
      const s1 = await page.evaluate(() => {
        const atLoad = selection.partySkills.mage.slice();
        selection.partySkills.mage = selection.partySkills.mage.filter((x) => x !== 'sleep');
        saveSelections();
        return { atLoad: atLoad,
                 saved: JSON.parse(localStorage.getItem('dragonfighters.partySkills') || 'null'),
                 mark: localStorage.getItem('dragonfighters.mageSleepSeeded'),
                 tabName: window.name };
      });
      const beforeReload = await page.evaluate(() => ({
        stillThere: localStorage.getItem('dragonfighters.partySkills') !== null,
        tabName: window.name }));
      await reload();
      const s2 = await page.evaluate(() => ({ mage: loadSelections().partySkills.mage.slice(),
                                              tabName: window.name }));
      check('(' + P + '0d) [装置] 往復が **同じタブ** で行われ、1 回目に保存したキーが 2 回目の読み込み前に残っている',
        s1.tabName === 'DF_SPELLOFF_TAB' && beforeReload.tabName === 'DF_SPELLOFF_TAB'
        && s2.tabName === 'DF_SPELLOFF_TAB' && beforeReload.stillThere === true,
        'window.name = ' + J([s1.tabName, beforeReload.tabName, s2.tabName])
        + ' / 2 回目の前にキーが残っている = ' + beforeReload.stillThere);
      check('(' + P + '2a) 魔法使いのスリープを 0 にして保存 → 読み込み直しても **0 のまま**'
        + (ON ? '' : ' (撤退では戻る)')
        + ' [対照: localStorage が空の初回は index 1 に差し込まれる]',
        s1.atLoad.indexOf('sleep') === 1
        && (ON ? s2.mage.indexOf('sleep') < 0 : s2.mage.indexOf('sleep') >= 0),
        '初回の一覧=' + J(s1.atLoad) + ' (sleep の位置 ' + s1.atLoad.indexOf('sleep') + ')'
        + ' / 保存=' + J(s1.saved && s1.saved.mage) + ' / 印=' + J(s1.mark)
        + ' / 開き直し後=' + J(s2.mage));

      /* ── (2a2) 無保存の開き直しでは差し込まれたまま (markonload の網) ───── */
      await page.evaluate(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('dragonfighters.xp', '45000');
        localStorage.setItem('dragonfighters.prologueSeen', '1');
      });
      await reload();
      const m1 = await page.evaluate(() => ({ mark: localStorage.getItem('dragonfighters.mageSleepSeeded'),
                                              mage: selection.partySkills.mage.slice() }));
      await reload();
      const m2 = await page.evaluate(() => ({ mage: loadSelections().partySkills.mage.slice(),
                                              mark: localStorage.getItem('dragonfighters.mageSleepSeeded') }));
      check('(' + P + '2a2) 何も保存せずに開き直すと、スリープは **差し込まれたまま** '
        + '(⭐ 読み込みの中で印を書かない = 保存していない一覧が黙って壊れない)',
        m1.mark === null && m2.mage.indexOf('sleep') >= 0,
        '1 回目の印=' + J(m1.mark) + ' 一覧=' + J(m1.mage)
        + ' / 2 回目の一覧=' + J(m2.mage) + ' 印=' + J(m2.mark));

      /* ── (2b) 12 個 (sleep 込み) 配分 → 開き直し ───────────────────────── */
      const put12 = async (list) => {
        await page.evaluate((l) => {
          localStorage.clear(); sessionStorage.clear();
          localStorage.setItem('dragonfighters.xp', '45000');
          localStorage.setItem('dragonfighters.prologueSeen', '1');
          localStorage.setItem('dragonfighters.partySkills', JSON.stringify({ mage: l }));
        }, list);
        await reload();
        return page.evaluate(() => {
          const s = loadSelections();
          return { mage: s.partySkills.mage.slice(),
                   cap: getMaxSpellSlotsForClassTV('mage', 10), skcap: skillSlotsForLevel(10),
                   raw: JSON.parse(localStorage.getItem('dragonfighters.partySkills') || 'null') };
        });
      };
      const t12 = await put12(TWELVE_WITH_SLEEP);
      check('(' + P + '2b) `sleep` を含む 12 個を配分して保存 → 開き直しても **12 個** '
        + (ON ? '' : '→ 撤退では **5 個** (一律 5 件の切り詰め。差し込みは起きない)')
        + ' [⚠ 一覧に sleep が無いと直っても 13 個になるので (2b3) で別に測る]',
        t12.mage.length === (ON ? 12 : 5),
        '開き直し後 ' + t12.mage.length + ' 個 (期待 ' + (ON ? 12 : 5) + ') / 上限 '
        + t12.cap + '+' + t12.skcap + ' / localStorage は ' + ((t12.raw && t12.raw.mage) || []).length + ' 個のまま');
      const w8 = await page.evaluate(() => {
        const pool = PARTY_SLOTS.find((s) => s.classKey === 'warrior').skillPool.filter((s) => !s.mpCost).map((s) => s.id);
        localStorage.setItem('dragonfighters.partySkills', JSON.stringify({ warrior: pool.slice(0, 8) }));
        return { seeded: Math.min(8, pool.length) };
      });
      await reload();
      const w8b = await page.evaluate(() => ({ warrior: loadSelections().partySkills.warrior.slice() }));
      check('(' + P + '2b2) 戦士は職別化の後も **5 件で切られたまま** (絶対量。呪文職だけ上限が伸びた証拠)',
        w8b.warrior.length === 5 && w8.seeded >= 6,
        '仕込み ' + w8.seeded + ' 件 → 読み込み ' + w8b.warrior.length + ' 件 ' + J(w8b.warrior));
      const t12n = await put12(TWELVE_NO_SLEEP);
      check('(' + P + '2b3) ⭐ `sleep` を含まない 12 個 (印もまだ無い) は '
        + (ON ? '**13 個** (切り詰め無し + #54 の差し込み 1)' : '**6 個** (5 件への切り詰め + 差し込み 1 = 欠陥 2 つの合成)')
        + ' — ⛔ (2b) と同じ「5」「12」で書かない',
        t12n.mage.length === (ON ? 13 : 6) && t12n.mage.indexOf('sleep') >= 0,
        '開き直し後 ' + t12n.mage.length + ' 個 (期待 ' + (ON ? 13 : 6) + ') sleep の位置 '
        + t12n.mage.indexOf('sleep') + ' / ' + J(t12n.mage));

      /* ── (2c) 除外リストは開き直しても残る + 酒場の配分から消える ───────── */
      await page.evaluate(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('dragonfighters.xp', '45000');
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        localStorage.setItem('dragonfighters.clericSpellsOff', JSON.stringify(['turn-undead']));
      });
      await reload();
      const c1 = await page.evaluate(() => ({
        off: clericSpellsOffTV(),
        raw: localStorage.getItem('dragonfighters.clericSpellsOff'),
        slots5: getClericSlotsTV(5),
        tableAt5: (CLERIC_SLOTS_TABLE['turn-undead'] || [])[5] || 0,
      }));
      check('(' + P + '2c) 僧侶の除外リストは読み込み直しても残り、酒場の配分表からその呪文が消える'
        + (ON ? '' : ' (撤退ではリストは残るが配分からは消えない)'),
        J(c1.raw) !== 'null' && c1.tableAt5 > 0
        && (ON ? (J(c1.off) === J(['turn-undead']) && !('turn-undead' in c1.slots5))
               : c1.slots5['turn-undead'] === c1.tableAt5),
        '残ったリスト=' + J(c1.off) + ' (raw ' + c1.raw + ')'
        + ' / getClericSlotsTV(5)=' + J(c1.slots5) + ' / 表の実体 Lv5 = ' + c1.tableAt5);
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      await page.close();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * §3 ゲーム本体の配分 (素 / 撤退 の 2 腕)
     * ══════════════════════════════════════════════════════════════════════ */
    for (const arm of ['', '?spelloff=0']) {
      const ON = arm === '';
      const P = ON ? '' : '5b-';
      console.log('\n[driver] ── §3 本体 (腕 = ' + (ON ? '素' : arm) + ') ───────────────');
      const page = await openIndex(browser, arm, 'index' + arm);

      /* ── (3d) NPC の「全部 0」— **実導線**で測る (partySkills は goto の前に仕込み済) ─ */
      const d1 = await page.evaluate(() => {
        const pick = (cls) => {
          const a = allies.find((x) => x.classKey === cls && !x.isHero);
          return a ? { eq: (a.equippedSkills || []).slice(),
                       max: Object.assign({}, a.maxSpellSlots || {}),
                       lv: a.level } : null;
        };
        return { mage: pick('mage'), elf: pick('elf'), cleric: pick('cleric'),
                 raw: JSON.parse(localStorage.getItem('dragonfighters.partySkills') || 'null'),
                 classes: allies.map((a) => a.classKey + (a.isHero ? '*' : '')) };
      });
      check('(' + P + '3d) `partySkills.mage = []` / `elf = []` を仕込んで本番の導線でパーティを組むと、'
        + 'NPC の魔法使い・エルフの `equippedSkills` が ' + (ON ? '**空のまま**' : '既定の呪文へ戻る')
        + ' [装置: 両方の NPC が実在する]',
        !!d1.mage && !!d1.elf
        && (ON ? (d1.mage.eq.length === 0 && d1.elf.eq.length === 0)
               : (d1.mage.eq.length > 0 && d1.elf.eq.length > 0)),
        '編成=' + J(d1.classes) + ' / 仕込み=' + J(d1.raw)
        + ' / mage.eq=' + J(d1.mage && d1.mage.eq) + ' / elf.eq=' + J(d1.elf && d1.elf.eq));
      check('(' + P + '0c) [装置] 除外を仕込んでいないこの盤面で、NPC 僧侶の `maxSpellSlots` のキーが **2 個以上**'
        + ' (除外の差が出る母集団)',
        !!d1.cleric && Object.keys(d1.cleric.max).length >= 2,
        'cleric.max=' + J(d1.cleric && d1.cleric.max) + ' / lv=' + (d1.cleric && d1.cleric.lv));

      /* ── (3d2) プリセット経路と既定経路の対照 (両腕で同じ = 恒等) ────────
         ⛔ hasPreset の式は写経しない。本番が選ぶ 2 つの行き先を別々に作って、
            (3d) の実導線がどちらへ落ちたかを読み解くための対照だけを取る。 */
      const d2 = await page.evaluate(() => {
        const probe = (cls, list) => {
          const a = { classKey: cls, level: 5, isHero: false };
          const psm = (list === null) ? {} : { [cls]: list };
          initAllySpellSlots(a, cls, 5, normalizePartySkillsMap(psm));
          const viaPreset = (a.equippedSkills || []).slice();
          initAllySpellSlots(a, cls, 5, defaultCasterMap(cls, 5));
          const viaDefault = (a.equippedSkills || []).slice();
          return { viaPreset: viaPreset, viaDefault: viaDefault };
        };
        return { one: probe('mage', ['magic-missile']), none: probe('mage', null) };
      });
      check('(' + P + '3d2) [対照] 1 件だけ配分した魔法使いはその 1 件 / 既定配分は 1 件以上'
        + ' (両腕で同じ = 行き先そのものは壊れていない)',
        J(d2.one.viaPreset) === J(['magic-missile']) && d2.none.viaDefault.length >= 1,
        '1 件あり(preset)=' + J(d2.one.viaPreset) + ' / 既定=' + J(d2.none.viaDefault));

      /* ── (3a)(3a2)(3a3)(3b)(3c) 僧侶の除外 ──────────────────────────────
         ⭐ 期待集合は CLERIC_SLOTS_TABLE の実体と仕込んだ除外リストから独立に組む
            (⛔ getClericSlots の戻り値を期待値にしない)。 */
      const OFF_ID = 'shield-of-faith';
      const s3 = await page.evaluate((offId) => {
        const set = (a) => { try { localStorage.setItem('dragonfighters.clericSpellsOff', JSON.stringify(a)); } catch (e) {} };
        const mk = (lv) => { const a = { classKey: 'cleric', level: lv }; initAllySpellSlots(a, 'cleric', lv, undefined); return a; };
        const LV = 5;
        set([]);
        const base = mk(LV);
        const lvupBase = mk(LV); recalcAllySpellSlotsOnLevelUp(lvupBase, 'cleric', 7);
        initLeaderSpellSlots('cleric', LV, {});
        const leaderBase = Object.assign({}, currentMaxSpellSlots);
        set([offId]);
        const off = mk(LV);
        const lvup = mk(LV); recalcAllySpellSlotsOnLevelUp(lvup, 'cleric', 7);
        initLeaderSpellSlots('cleric', LV, {});
        const leader = Object.assign({}, currentMaxSpellSlots);
        set([]);
        /* 表の実体 (⛔ getClericSlots は通さない) */
        const table = {};
        for (const [id, t] of Object.entries(CLERIC_SLOTS_TABLE)) {
          const n = t[LV] || 0; if (n > 0) table[id] = n;
        }
        return { LV: LV, base: base.maxSpellSlots, baseTotal: base.maxSpellSlotsTotal,
                 baseEq: base.equippedSkills, off: off.maxSpellSlots, offTotal: off.maxSpellSlotsTotal,
                 offEq: off.equippedSkills, lvup: lvup.maxSpellSlots, lvupBase: lvupBase.maxSpellSlots,
                 leader: leader, leaderBase: leaderBase, table: table };
      }, OFF_ID);
      const restKeys = Object.keys(s3.base).filter((k) => k !== OFF_ID);
      const restSame = restKeys.every((k) => s3.off[k] === s3.base[k]) && Object.keys(s3.off).length === restKeys.length;
      check('(' + P + '3a) `clericSpellsOff = ["' + OFF_ID + '"]` を仕込むと、僧侶の仲間の `maxSpellSlots` から'
        + ' **その ID だけ** が消え、残りのキーと個数は除外なしの腕と完全一致'
        + (ON ? '' : ' (撤退では 1 ビットも変わらない)'),
        ON ? (!(OFF_ID in s3.off) && restSame && (OFF_ID in s3.base))
           : J(s3.off) === J(s3.base),
        '除外なし=' + J(s3.base) + ' / 除外あり=' + J(s3.off) + ' / 残り完全一致=' + restSame);
      const tableOk = Object.keys(s3.base).every((k) => (k in s3.table) && s3.base[k] === s3.table[k]);
      check('(' + P + '3a2) [絶対量・2 経路目] 除外なしの `maxSpellSlots` の個数が **CLERIC_SLOTS_TABLE の実体**と'
        + '一致し、除外する ID が表に Lv' + s3.LV + ' で 1 枠以上ある (⛔ getClericSlots の戻り値は使わない)',
        tableOk && (s3.table[OFF_ID] || 0) >= 1 && Object.keys(s3.base).length >= 2,
        '表 (Lv' + s3.LV + ')=' + J(s3.table) + ' / 観測=' + J(s3.base)
        + ' / ' + OFF_ID + ' の枠=' + (s3.table[OFF_ID] || 0));
      check('(' + P + '3a3) 除外した枠を **他の呪文へ回さない** (合計が表の枠数ぶんだけ減る)'
        + (ON ? '' : ' (撤退では合計が動かない)'),
        ON ? (s3.offTotal === s3.baseTotal - s3.table[OFF_ID]
              && s3.offEq.indexOf(OFF_ID) < 0 && s3.baseEq.indexOf(OFF_ID) >= 0)
           : (s3.offTotal === s3.baseTotal && J(s3.offEq) === J(s3.baseEq)),
        '合計 ' + s3.baseTotal + ' → ' + s3.offTotal + ' (表の枠 ' + s3.table[OFF_ID] + ')'
        + ' / equippedSkills 除外後=' + J(s3.offEq));
      check('(' + P + '3b) `recalcAllySpellSlotsOnLevelUp` (Lv5→7) を掛けても消えたまま'
        + ' (⭐ 口 1 点で除外した証拠。除外なしの腕では Lv7 でも在る)',
        ON ? (!(OFF_ID in s3.lvup) && (OFF_ID in s3.lvupBase))
           : ((OFF_ID in s3.lvup) && (OFF_ID in s3.lvupBase)),
        'Lv7 除外あり=' + J(s3.lvup) + ' / Lv7 除外なし=' + J(s3.lvupBase));
      check('(' + P + '3c) 先頭の経路 `initLeaderSpellSlots` の `currentMaxSpellSlots` からも消える'
        + ' (除外なしの腕では在る)',
        ON ? (!(OFF_ID in s3.leader) && (OFF_ID in s3.leaderBase))
           : ((OFF_ID in s3.leader) && (OFF_ID in s3.leaderBase)),
        '先頭 除外あり=' + J(s3.leader) + ' / 除外なし=' + J(s3.leaderBase));

      /* ── (3e) 本番の clericAI を回す (素の腕だけ。撤退は (5b-3a) が担う) ──
         ⭐ 枠は補充せず「初期値 − 最終値」で詠唱回数を数える = 関数の差し替えに依存しない。 */
      if (ON) {
        const ai = await page.evaluate(async () => {
          /* 隔離レシピ (2026-06-08 に確立) */
          gameOver = true;
          try { encounterActive = false; } catch (e) {}
          window.sleepMs = () => new Promise((r) => setTimeout(r, 0));
          try { window.moveEnemies = function () {}; } catch (e) {}
          window.dfPlayCast = function () { return Promise.resolve(); };
          const TILE = TILE_SIZE, FAR = -999999;
          const setUnit = (u, tx, ty) => {
            const s = (u.def && u.def.displaySize) || 96;
            u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2;
          };
          /* 横に連続した床が 10 マス以上ある行 (⛔ 絶対タイル座標を直書きしない) */
          let lane = null;
          for (let ty = 1; ty < MAP_H - 1 && !lane; ty++) {
            let run = 0;
            for (let tx = 1; tx < MAP_W - 1; tx++) {
              if (!isTileWall(tx, ty)) { run++; if (run >= 10) { lane = { ty: ty, tx0: tx - run + 1 }; break; } }
              else run = 0;
            }
          }
          if (!lane) return { err: 'lane なし' };
          const roomEnemies = enemies.slice();
          for (const e of roomEnemies) { if (e) { e.x = FAR; e.y = FAR; } }
          const cleric = allies.find((a) => a.classKey === 'cleric');
          if (!cleric) return { err: 'cleric なし' };
          /* 回復の枝を消す (⛔ clericAI の閾値を写経しない = 満タンならどんな閾値でも成立しない) */
          try { hp = maxHp; } catch (e) {}
          for (const a of allies) { a.hp = a.maxHp; if (a !== cleric) { a.x = FAR; a.y = FAR; } }
          cleric.alive = true;
          setUnit(cleric, lane.tx0, lane.ty);
          const idx = enemies.length;
          const foe = createEnemy('orc', lane.tx0 + 2, lane.ty);
          enemies.push(foe); createEnemyDom(idx, foe.def, foe.type);
          foe.alive = true; foe.maxHp = 400; foe.hp = 400;

          const run = async (offList, tries) => {
            try { localStorage.setItem('dragonfighters.clericSpellsOff', JSON.stringify(offList)); } catch (er) {}
            initAllySpellSlots(cleric, 'cleric', 10, null);
            /* 前の腕の結果を持ち越さない (⛔ 盤面は作り直さない = 同じ舞台で比べる) */
            try { if (foe.statusEffects) foe.statusEffects = []; } catch (er) {}
            foe.alive = true; foe.hp = foe.maxHp;
            const slotBefore = (cleric.spellSlots || {})['hold-person'];
            const eqBefore = (cleric.equippedSkills || []).slice();
            let ran = 0;
            for (let k = 0; k < (tries || 6); k++) {
              try { await clericAI(cleric); ran++; }
              catch (er) { return { err: 'clericAI 例外: ' + String(er && er.message) }; }
            }
            return { ran: ran, eq: eqBefore, slotBefore: slotBefore,
                     slotAfter: (cleric.spellSlots || {})['hold-person'],
                     held: hasStatus(foe, 'held'), lane: lane, roomEnemies: roomEnemies.length };
          };
          const excluded = await run(['hold-person'], 6);
          const control  = await run([], 6);
          try { localStorage.removeItem('dragonfighters.clericSpellsOff'); } catch (er) {}
          return { excluded: excluded, control: control };
        });
        const ex = ai.excluded || {}, ct = ai.control || {};
        const dropOf = (r) => (typeof r.slotBefore === 'number' && typeof r.slotAfter === 'number')
          ? (r.slotBefore - r.slotAfter) : null;
        check('(3e) 本番の `clericAI` を ' + (ex.ran || 0) + ' 回まわしても、除外した呪文 (hold-person) の'
          + ' **詠唱 0 回・枠の消費 0** (枠も装備キーも生まれない)'
          + ' [対照: 除外を外した同じ盤面では 1 回以上詠唱し枠が減る]',
          !ai.err && !ex.err && !ct.err
          && ex.slotBefore === undefined && (ex.eq || []).indexOf('hold-person') < 0 && ex.held === false
          && typeof ct.slotBefore === 'number' && ct.slotBefore >= 1 && dropOf(ct) >= 1,
          '除外あり: 枠=' + J(ex.slotBefore) + ' 装備=' + J(ex.eq) + ' held=' + J(ex.held) + ' 実行 ' + ex.ran + ' 回'
          + ' / 対照: 枠 ' + J(ct.slotBefore) + '→' + J(ct.slotAfter) + ' held=' + J(ct.held)
          + ' 実行 ' + ct.ran + ' 回' + (ai.err || ex.err || ct.err ? ' / ERR ' + (ai.err || ex.err || ct.err) : ''));
        check('(3e2) [装置] 合成盤面が成立している (lane が見つかり、部屋の敵を退け、対照の腕で'
          + ' hold-person が装備キーに在る)',
          !!(ct.lane) && (ct.eq || []).indexOf('hold-person') >= 0,
          'lane=' + J(ct.lane) + ' / 退けた部屋の敵 ' + ct.roomEnemies + ' 体'
          + ' / 対照の装備キー=' + J(ct.eq));
      }
      await page.close();
    }

    check('(0e) ページエラー / console error が 0 件 (favicon の 404 は除外済み)',
      pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');

  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    try { await browser.close(); } catch (e2) {}
    try { server.closeAllConnections && server.closeAllConnections(); server.close(); } catch (e2) {}
    process.exit(2);
  }

  await browser.close();
  /* ⚠ Node 24 の http.Server#close() は Chrome の先読み接続を待って長く止まる。 */
  try { server.closeAllConnections && server.closeAllConnections(); } catch (e) {}
  server.close();

  /* ══ 集計 ══════════════════════════════════════════════════════════════ */
  const passed   = results.filter((r) => r.ok).length;
  const pendingN = results.filter((r) => r.pending).length;
  const failed   = results.filter((r) => !r.ok && !r.pending).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   PENDING ' + pendingN);
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok && !r.pending).forEach((r) => console.log('    ' + r.name + '  -- ' + r.detail));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = NEG_EXPECT[tag] || [];
    const red = new Set(results.filter((r) => !r.ok && !r.pending)
      .map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]));
    const miss = want.filter((w) => !red.has(w));
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',')
      + ' / 実際に赤くなった=' + Array.from(red).join(','));
    if (miss.length) {
      console.error('[driver] ✗ ' + tag + ' の担当ラベルが赤くなりませんでした (空振り): ' + miss.join(','));
      process.exit(1);
    }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
