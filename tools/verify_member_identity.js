#!/usr/bin/env node
/*
 * verify_member_identity.js — 実装依頼書 #72「誰が来るのか分かるようにする」の受入ドライバ (依頼書 §8 を §12-0 で読み替え)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_member_identity.js                        # 素 (全ユニット)
 *   node tools/verify_member_identity.js --negative             # 変異 12 本 (port 10402〜10413)。変異ごとに必要なユニットだけ
 *   node tools/verify_member_identity.js --negative --only lvhero,sharedpool
 *   node tools/verify_member_identity.js --mutate lvhero        # 変異 1 本を載せて全ユニットを手回し (担当表を実走で決める用)
 *   node tools/verify_member_identity.js --units P1,P0          # 素の一部だけ (デバッグ用。判定は走ったユニットの分だけ出る)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足・例外 / 3=変異アンカーの腐敗
 *
 * ■ 方針 — 酒場 (tavern.html) を直に開き、既存シーム window.__pmTest.play(sc) でマッチング画面だけを開いて DOM と保存物を読む。
 *   ⛔ 実プレイ (index.html の戦闘) は 1 走行も回さない。⛔ 顔ぶれを openPrep 経由で仕込まない
 *   (openPrep は冒頭で regeneratePartyMembers() を無条件に呼ぶ = 仕込みが消える)。openPrep を通すのは (2j) の H 腕だけ
 *   (= 保存済みの僧侶の傾向が「openPrep の見えない準備画面の描画」で消えていた経路そのものを測るため・§12-0 追補 2b2 (10) の 5)。
 *
 * ■ ⚠⚠⚠ 3 つの柱は「ほかの柱を止めた腕」で測る (依頼書 §8 冒頭。表示の柱が判定の柱に救われて緑、を防ぐ)
 *   A1 = ?drawerlv=0&namejob=0        … §1 表示 (柱1 だけ生きている)
 *   A2 = ?whois=0&namejob=0           … §2 判定 Lv (柱2 だけ)
 *   A3 = ?whois=0&drawerlv=0          … §3 名前とジョブ (柱3 だけ)
 *   A0 = ?whois=0&drawerlv=0&namejob=0 … §4 恒等 (3 本とも 0 = 0e8370d の姿) — §2 の「欠陥の再現」腕もこれを兼ねる
 *   N  = ?namejob=0                   … 同職の注記だけ (注記は表示 × 判定の交差 = 両方が生きているときだけ新しい文面)
 *   撤退スイッチ = ?whois=0 / ?drawerlv=0 / ?namejob=0 (tavern.html の isWhoisOn / isDrawerLvOn / isNameJobOn。呼ぶたびに URL を読む)
 *
 * ■ 測っているもの (id / 腕 / 何を見るか) — 依頼書 §12-0 追補 (項目4) の表が正
 *   §0 (0a) 引き出しが実際に開き (pmDrawerIdx = 押したカード・番兵が消えた)、対象職の行が 1 行以上
 *      (0b) 期待値は盤面から導出: 主人公 Lv = ページの getLevelFromXP(仕込んだ XP) / 職名 = PARTY_SLOTS / 名前表 = NPC_NAMES_BY_CLASS /
 *           1 職の名前数 = DFRoster.CAP − 1 + RECRUIT_MAX + 1 (ページの定数) / 本体の levelReq = index.html のファイル
 *      (0c) 開いたページが全部起動した (document.title が空でない + #72 のヘルパ 8 つが在る)
 *      (0d) 「呼ばれた/在る」でなく値: 読む器 (カード列 / 引き出し / #recruitRole) へ測る直前に番兵を置き、本番の口が消した/書いた
 *      (0e) 変異 12 本の注入点が原本の「属する範囲」の中でちょうど 1 行 (素の側でも赤で見える)  (0f) pageerror / console.error 0
 *   §1 (1a) カードの Lv の逐語 (.pmClass の先頭テキストノード = 職名・.pmLv = "Lv" + 本人の Lv・剥いだ残り = 職名) / A0 で .pmLv 0 個
 *      (1b) 見出し = 「職名 — 名前 LvN」(2 経路: 見出しの文字 と levelOfMember(開いた本人)) / A0 で Lv 無し
 *      (1c) 声掛け: 名簿の顔 =「職名 LvN — 性格」(N = 保存 Lv を主人公 Lv で clamp)・初めての顔 = Lv なし・A0 = Lv なし
 *      (1d) 傭兵名簿パネル (#rosterBody / #rosterSub) と頭上札が A1 と A0 で完全一致
 *   §2 (2a) 主人公 Lv7 × 仲間の魔法使い Lv2: LB の行に [Lv3 必要] + .full (3 = 本体 index.html の levelReq)・A0 では出ない
 *      (2b) + を押しても増えない (A0 では増える)  (2c) 仲間 Lv3 なら置ける  (2e) 枠の上限は本人基準 (A0 は主人公基準)
 *      (2d) 主人公が魔法使いで同職の仲間なし・主人公 Lv ≥ 5: 4 枚の引き出しが A0 と innerHTML 完全一致 (⚠ 恒等はこの条件付き)
 *      (2f) 同職 2 人は最も低い Lv で判定 + 注記の逐語 (2 人「低い方の」/ 3 人「最も低い」/ 表示か判定が 0 なら従来の文面)
 *      (2g) 新顔の Lv はマッチング画面で確定し、出発で振り直さない (出発の乱数を「振り直せば必ず別の値」に固定して測る)
 *      (2h) エルフ・僧侶の NPC にも効く (バッジの付く行の集合 = 本人の Lv から導いた集合)
 *      (2i) 僧侶のカードの「技」行 = 本人の Lv の集合 (getClericSlotsTV(本人 Lv) と表の直読みの 2 経路・「・」で割らない)
 *      (2j) 保存済みの僧侶の傾向 (hold-person) が消えない (M = マッチングの腕 / H = 本番の openPrep の腕)
 *      (2k) (α) 酒場の呪文表の levelReq が本体 index.html と同値
 *   §3 (3a) 新顔の名前はその職の名前表に含まれる (makeNpcMember / pickCompanion / 卓 / buildParty / regeneratePartyMembers)
 *      (3b) 名前 → 職業が単射 + どの職も表を全部使う  (3b') 名簿・約束 (旧規則の顔を含む) の名前を新顔が使わない + 上限の盤面
 *      (3c) A0 では共有 16 名 (NPC_NAMES) から引き、単射でなく、名簿の名前と衝突する (= 従来の姿)
 *      (3d) 名簿・約束の保存物: 読み込み・抽選・声掛け・出発の後も既存の値は 1 バイトも変わらず、新しい要素のキー集合も従来の形
 *   §4 (4a) 3 本とも 0 = 0e8370d の姿 (Lv 表示なし / α なし / 判定は主人公 Lv / 新顔の Lv は出発で振る / 僧侶のカード = 主人公 Lv / 共有 16 名)
 *      (4b) Lv の表示の有無でカード・職業行・引き出し・見出しの高さが変わらない (4 画面 × A1 vs A0。viewport は幅と高さだけ)
 *
 * ■ ⚠ 計測機構 (#72 項目1〜3 のプローブで実証済みの型)
 *   - document-start で dragonfighters.* を消してから仕込む (タブの sessionStorage の印で 1 回だけ)。⭐ 「消す」は「素」ではないので
 *     partySkills は仕込まない (酒場が既定を組む)。
 *   - 新顔 = level も mercId も無い形 / 名簿の顔 = mercId + level。⚠ 主人公の m.level は出発まで undefined。
 *   - 出発の遷移 (index.html / world.html) は abort('aborted') で止める (既定の 'failed' はエラーページへ差し替わり sessionStorage が読めない)。
 *   - ⚠ viewport は幅と高さだけ (isMobile / hasTouch を付けると寸法が別の値になる = 項目2b (5))。
 *   - ⛔ classic script 直下の const / let は window に載らない ⇒ 裸の識別子で読む (selection / PARTY_SLOTS / todaysPatrons …)。
 *   - 変異は **配信スナップショットだけ** を書き換える (⛔ 本番ファイルは 1 バイトも触らない)。健在チェックは手つかずの原本で。
 *   - ⛔ このドライバを timeout コマンドで包まない (打ち切ると node が孤児としてポートを掴む)。
 *   - 後始末はこのドライバが起動したもの (内蔵 http サーバとこのブラウザ・プロファイル) だけ。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *
 * ■ ポート = **10401** (素) / 変異 **10402〜10413** (12 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-09-22 この機械の実測) = 素 約 156 秒 (26 ページ・うち openPrep の腕 1 本が約 25 秒) / --negative 約 216 秒 (素の基準 8 ユニット + 変異 12 本)。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10401'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const UNITS_ARG = (arg('units', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SC_ID = 'bandits-forest';     // recommendedLevel 4 = tier1。⛔ 帯そのものは測らない (依頼書 §8 ⛔)
const HERO_XP = 21000;              // 盤面の仕込み。主人公 Lv はページの getLevelFromXP で読む (⛔ 7 を写経しない)
const DIMS_XP = 45000;              // (4b) の最悪の見出し用 (Lv が 2 桁)
const ARM = {
  A1: '?drawerlv=0&namejob=0',
  A2: '?whois=0&namejob=0',
  A3: '?whois=0&drawerlv=0',
  A0: '?whois=0&drawerlv=0&namejob=0',
  N:  '?namejob=0',
};

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結 = 走行中に別窓が保存しても混合ビルドにならない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const SRC_FILES = ['tavern.html'];
const PRISTINE = {};
for (const f of SRC_FILES) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');   // (2a)(2k) の本体側の levelReq を読むだけ (配信はしない = 作業ツリーのまま)

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (負のコントロール)
 *   edits[] = { scope: 注入点が属する範囲の先頭行 (逐語・行末の \r を除く), from: 範囲の中でちょうど 1 行一致すべき行, to: 置き換える 1 行 }
 *   範囲の終わり = scope が `{` で終わる → 同じ字下げの `}` / `[` で終わる → 同じ字下げの `];`。
 *   units = --negative でその変異のときに走らせるユニット (担当の assert が要るもの + 起動確認)。
 *   ⚠⚠⚠ 逐語は #72 実装後 (HEAD 837d36d) の tavern.html で取り直したもの。依頼書 §8 の表・申し送りの行番号は使っていない。
 * ══════════════════════════════════════════════════════════════════════════════ */
const FN_DRAWER = '  function pmRenderDrawer(idx) {';
const MUTATIONS = {
  /* 柱2 を殺す: 引き出しの判定 Lv (と同じ Lv を使う枠の上限) を主人公 Lv へ戻す = 依頼書 §2-2 の欠陥の再現。 */
  lvhero: { units: ['P2', 'P0'], edits: [{ scope: FN_DRAWER,
    from: '      const lv = isDrawerLvOn() ? lowestLevelOfClass(classKey) : getLevelFromXP(inventory.xp);',
    to:   '      const lv = getLevelFromXP(inventory.xp);   /* ★変異lvhero */' }] },
  /* 枠の上限だけ主人公 Lv (判定の Lv は本人のまま)。 */
  capfromhero: { units: ['P2', 'P0'], edits: [{ scope: FN_DRAWER,
    from: '      const totalMax = getMaxSpellSlotsForClassTV(classKey, lv);',
    to:   '      const totalMax = getMaxSpellSlotsForClassTV(classKey, getLevelFromXP(inventory.xp));   /* ★変異capfromhero */' }] },
  /* (α) を殺す: 酒場の鏡の LB から levelReq を外す (= 0e8370d の鏡 = 判定 Lv を直しても [Lv3 必要] が一度も出ない)。 */
  lvreqdrop: { units: ['P2', 'P0'], edits: [{ scope: '  const MAGE_SKILLS_UI = [',
    from: '    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, levelReq: 3, flavor: "敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },',
    to:   '    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, flavor: "敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },   /* ★変異lvreqdrop */' }] },
  /* 柱1: カードの Lv の文字を消す (要素は残る)。 */
  lvnoshow: { units: ['P1', 'P0'], edits: [{ scope: '  function buildPmColumn(m, i) {',
    from: '        lvEl.textContent = "Lv" + cardLv;',
    to:   '        lvEl.textContent = "";   /* ★変異lvnoshow */' }] },
  /* 柱1: 見出しの Lv の文字を消す。 */
  headnolv: { units: ['P1', 'P0'], edits: [{ scope: FN_DRAWER,
    from: '      titleLvEl.textContent = "Lv" + titleLv;',
    to:   '      titleLvEl.textContent = "";   /* ★変異headnolv */' }] },
  /* 柱3: 職業別の表を使わない (共有 16 名へ戻す)。 */
  sharedpool: { units: ['S3'], edits: [{ scope: '  function pickUniqueName(usedSet, classKey) {',
    from: '    const byClass = (classKey && isNameJobOn()) ? NPC_NAMES_BY_CLASS[classKey] : null;',
    to:   '    const byClass = (classKey && isNameJobOn()) ? null : null;   /* ★変異sharedpool */' }] },
  /* 柱3 の 2 本目: 名簿・約束の名前を避けない (職業別の表は使う = (3a)(3b) は緑のまま)。 */
  noexcl: { units: ['S3'], edits: [{ scope: '  function pickClassNameTV(list, usedSet) {',
    from: '    let pool = list.filter(function (n) { return !usedSet.has(n) && !taken.has(n); });',
    to:   '    let pool = list.filter(function (n) { return !usedSet.has(n); });   /* ★変異noexcl */' }] },
  /* (β) を殺す: 新顔の Lv をマッチング画面で決めない (出発で振る = 0e8370d の姿)。 */
  earlyoff: { units: ['P1', 'P0', 'P2g'], edits: [{ scope: '  function fixCompanionLevelsEarly(sc) {',
    from: '    if (!isEarlyLevelOn() || !sc) return;',
    to:   '    return;   /* ★変異earlyoff */' }] },
  /* 項目2b2: 僧侶のカードの「技」行を主人公 Lv の集合へ戻す。 */
  cardhero: { units: ['P2i'], edits: [{ scope: '  function apEquippedIdsFor(slot, classKey, ownLv) {',
    from: '      const pool = (typeof ownLv === "number" && ownLv > 0) ? getClericSlotsTV(ownLv) : auto;',
    to:   '      const pool = auto;   /* ★変異cardhero */' }] },
  /* 項目2b の副作用①の再現: 傾向段の候補を最も低い Lv に絞る ⇒ 既存の正規化が保存済みの傾向を null へ書き戻す。 */
  apclamp: { units: ['P2j'], edits: [{ scope: '  function apEquippedIdsFor(slot, classKey, ownLv) {',
    from: '      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));',
    to:   '      const auto = getClericSlotsTV(lowestLevelOfClass(classKey));   /* ★変異apclamp */' }] },
  /* (3d): 名前を避けるついでに名簿を書き換える (= 依頼書 §5-3 が禁じた「移行」)。 */
  rosterwrite: { units: ['S3d'], edits: [{ scope: '  function namesTakenTV() {',
    from: '    try { if (window.DFRoster) DFRoster.all().forEach(function (m) { if (m && m.name) s.add(m.name); }); } catch (e) {}',
    to:   '    try { if (window.DFRoster) DFRoster.all().forEach(function (m) { if (m && m.name) s.add(m.name); }); } catch (e) {} try { var __k = "dragonfighters.mercRoster", __r = JSON.parse(localStorage.getItem(__k) || "null"); if (__r && __r.list && __r.list.length) { __r.list.forEach(function (x) { x.migrated = 1; }); localStorage.setItem(__k, JSON.stringify(__r)); } } catch (e) {}   /* ★変異rosterwrite */' }] },
  /* 撤退スイッチ 3 本の判定を常に真にする (撤退路が死ぬ)。⭐ get("…") の逐語は残す。 */
  switchdead: { units: ['P0', 'P1'], edits: [
    { scope: '  function isDrawerLvOn() {',
      from: '    try { return new URLSearchParams(location.search).get("drawerlv") !== "0"; }',
      to:   '    try { return (new URLSearchParams(location.search).get("drawerlv") !== "0") || true; }   /* ★変異switchdead */' },
    { scope: '  function isWhoisOn() {',
      from: '    try { return new URLSearchParams(location.search).get("whois") !== "0"; }',
      to:   '    try { return (new URLSearchParams(location.search).get("whois") !== "0") || true; }   /* ★変異switchdead */' },
    { scope: '  function isNameJobOn() {',
      from: '    try { return new URLSearchParams(location.search).get("namejob") !== "0"; }',
      to:   '    try { return (new URLSearchParams(location.search).get("namejob") !== "0") || true; }   /* ★変異switchdead */' }] },
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で **全ユニット** を 1 本ずつ実走し、
 * 実際に赤くなった集合を見て決めた (2026-09-22・HEAD 837d36d の上。ログ = 依頼書 §12-0 追補 (項目4) の担当表):
 *   lvhero      … (2a)(2b)(2e)(2h)(2f)          capfromhero … (2e)            ⭐ 最も鋭い (判定の Lv は本人のまま・枠だけ)
 *   lvreqdrop   … (2a)(2b)(2f)(2k)(4a)          ⚠ (4a) は ② の「ON の表と比べて (α) の levelReq が外れている」が ON 側で崩れる巻き添え
 *   lvnoshow    … (1a)                          headnolv    … (1b)
 *   sharedpool  … (3a)(3b)(3b')                 noexcl      … (3b')           ⭐ 柱3 の 2 本目 (職業別の表は使うので (3a)(3b) は緑)
 *   earlyoff    … (1a)(1b)(2g)                  ⚠ (1a)(1b) は新顔のカード・見出しに Lv が出なくなる巻き添え
 *   cardhero    … (2i)                          apclamp     … (2j)(4a)        ⚠ (4a) ⑤ = A0 の僧侶のカードも最低 Lv の集合になる巻き添え
 *   rosterwrite … (3d)
 *   switchdead  … (1a)(1b)(1c)(2a)(2b)(2e)(2h)(2f)(3c)(4a)(4b)   ⭐ 撤退の腕を持つ assert が総崩れ ((1d) は表示を持たない名簿パネルなので緑のまま)
 * --negative では変異ごとに units だけを走らせ、その units で出る赤を担当にした (units に無い assert は出ない = 担当に入れない)。 */
const NEG_EXPECT = {
  lvhero:      ['(2a)', '(2b)', '(2e)', '(2h)'],
  capfromhero: ['(2e)'],
  lvreqdrop:   ['(2a)', '(2b)', '(2k)', '(4a)'],
  lvnoshow:    ['(1a)'],
  headnolv:    ['(1b)'],
  sharedpool:  ['(3a)', '(3b)', "(3b')"],
  noexcl:      ["(3b')"],
  earlyoff:    ['(1a)', '(1b)', '(2g)'],
  cardhero:    ['(2i)'],
  apclamp:     ['(2j)'],
  rosterwrite: ['(3d)'],
  switchdead:  ['(1a)', '(1b)', '(3c)', '(4a)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 12) { console.error('[vmi] 変異は 12 本まで (ポート 10402〜10413)'); process.exit(3); }
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[vmi] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3);
}
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) {
  console.error('[vmi] 未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3);
}

/* ── (0e) 変異アンカーの起動時検算 — **手つかずの原本** に対して行単位 + 範囲で数える (verify_bolt_bounce と同じ規則) ── */
function splitLines(text) { return text.split('\n'); }
function bare(line) { return line.endsWith('\r') ? line.slice(0, -1) : line; }
function scopeRange(lines, scope) {
  const starts = [];
  for (let i = 0; i < lines.length; i++) if (bare(lines[i]) === scope) starts.push(i);
  if (starts.length !== 1) return { starts: starts.length, start: -1, end: -1 };
  const s = starts[0];
  const indent = (scope.match(/^\s*/) || [''])[0];
  let closeTest;
  if (/\{\s*$/.test(scope)) closeTest = (l) => l === indent + '}';
  else if (/\[\s*$/.test(scope)) closeTest = (l) => l === indent + '];';
  else return { starts: 1, start: s, end: -1 };
  for (let j = s + 1; j < lines.length; j++) if (closeTest(bare(lines[j]))) return { starts: 1, start: s, end: j };
  return { starts: 1, start: s, end: -1 };
}
const PRISTINE_LINES = splitLines(PRISTINE['tavern.html']);
function auditEdit(e) {
  const lines = PRISTINE_LINES;
  const sr = scopeRange(lines, e.scope);
  const inScope = [];
  let inFile = 0;
  for (let i = 0; i < lines.length; i++) {
    if (bare(lines[i]) !== e.from) continue;
    inFile++;
    if (sr.end > 0 && i > sr.start && i <= sr.end) inScope.push(i);
  }
  const multiline = /[\r\n]/.test(e.from) || /[\r\n]/.test(e.to);
  const sameLen = e.from.length === e.to.length;
  return { ok: sr.starts === 1 && sr.end > 0 && inScope.length === 1 && !multiline && !sameLen,
    scopeStarts: sr.starts, scopeLines: sr.end > 0 ? (sr.end - sr.start + 1) : null,
    inScope: inScope.length, inFile: inFile, line: inScope.length === 1 ? inScope[0] + 1 : null, multiline, sameLen };
}
function auditMutation(key) {
  const eds = MUTATIONS[key].edits.map(auditEdit);
  return { key, ok: eds.every((a) => a.ok), edits: eds };
}
const AUDIT = MUT_ORDER.map(auditMutation);
console.log('[vmi] §0e 変異アンカーの検算 (原本 tavern.html・行単位 + 属する範囲):');
for (const a of AUDIT) {
  console.log('   ' + (a.ok ? 'OK ' : '⛔ ') + a.key.padEnd(12) + ' ' + a.edits.map((e) => 'tavern:' + e.line
    + ' (範囲の先頭 ' + e.scopeStarts + ' 箇所 ' + e.scopeLines + ' 行 / 範囲内 ' + e.inScope + ' 行 / 全体 ' + e.inFile + ' 行'
    + (e.multiline ? ' / ⛔複数行' : '') + (e.sameLen ? ' / ⛔同長' : '') + ')').join(' + '));
}
const AUDIT_BAD = AUDIT.filter((a) => !a.ok);
if (AUDIT_BAD.length && (NEGATIVE || MUTATE)) {
  console.error('[vmi] ⛔ 変異アンカーが ' + AUDIT_BAD.length + ' 本腐っている (' + AUDIT_BAD.map((a) => a.key).join(',')
    + ') → 負のコントロールが空振りするので走らせない');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  const a = auditMutation(key);
  if (!a.ok) { console.error('[vmi] ⛔ 変異 ' + key + ' の注入点がちょうど 1 行ではない'); process.exit(3); }
  const lines = PRISTINE_LINES.slice();
  MUTATIONS[key].edits.forEach((e, k) => {
    const i = a.edits[k].line - 1;
    const cr = lines[i].endsWith('\r') ? '\r' : '';
    lines[i] = e.to + cr;
  });
  let diff = 0;
  for (let j = 0; j < lines.length; j++) if (lines[j] !== PRISTINE_LINES[j]) diff++;
  if (diff !== MUTATIONS[key].edits.length) { console.error('[vmi] ⛔ 変異 ' + key + ' の差し替えが edits の行数に閉じていない (diff=' + diff + ')'); process.exit(3); }
  _mutCache[key] = { 'tavern.html': lines.join('\n') };
  return _mutCache[key];
}

/* ── 本体 index.html の levelReq (ファイルから読む。(2a)(2k) の期待値の出所 = ユーザー決定 (α)「本体と同値」) ── */
function bodyLevelReq(id) {
  const esc = id.replace(/[-]/g, '\\-');
  const heads = INDEX_SRC.split('"' + id + '": {').length - 1;
  const m = INDEX_SRC.match(new RegExp('"' + esc + '":\\s*\\{[^}]*?levelReq:\\s*(\\d+)'));
  return { heads, levelReq: m ? parseInt(m[1], 10) : null };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[vmi] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[vmi] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const srcs = mutatedSources(mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/tavern.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (Object.prototype.hasOwnProperty.call(srcs, rel)) {
          res.setHeader('Content-Type', MIME['.html']);
          res.end(Buffer.from(srcs[rel], 'utf8')); return;
        }
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
    try { srv.closeAllConnections(); } catch (e) {}   // ⚠ 先読み接続を切らないと close が長く止まる
    try { srv.close(() => resolve()); } catch (e) { resolve(); }
    const i = SERVERS.indexOf(srv); if (i >= 0) SERVERS.splice(i, 1);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側のコード (⛔ ここに判定ロジックを書かない = 生データを採るだけ)
 * ══════════════════════════════════════════════════════════════════════════════ */
function seedOnce(spec) {
  try {
    if (sessionStorage.getItem('__vmi_seeded') === spec.tag) return;
    [localStorage, sessionStorage].forEach(function (st) {
      const kill = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach(function (k) { st.removeItem(k); });
    });
    Object.keys(spec.ls || {}).forEach(function (k) { localStorage.setItem(k, spec.ls[k]); });
    sessionStorage.setItem('__vmi_seeded', spec.tag);
  } catch (e) {}
}
/* 決定論の乱数 (mulberry32)。ページの最初から入れる = 卓の init まで 2 腕で揃う ((1d))。 */
function installRng(seed) {
  let a = seed >>> 0;
  Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TAVERN_READY = "typeof openPrep === 'function' && typeof scenarios !== 'undefined' && !!(window.__pmTest && typeof __pmTest.play === 'function')"
  + " && (typeof isRecruitTalkOn !== 'function' || !isRecruitTalkOn() || (typeof todaysPatrons !== 'undefined' && todaysPatrons && Object.keys(todaysPatrons).length === 4))";
const BOOT = () => {
  const need = { levelOfMember: typeof levelOfMember, shownLevelOf: typeof shownLevelOf, lowestLevelOfClass: typeof lowestLevelOfClass,
    isWhoisOn: typeof isWhoisOn, isDrawerLvOn: typeof isDrawerLvOn, isNameJobOn: typeof isNameJobOn,
    pickClassNameTV: typeof pickClassNameTV, fixCompanionLevelsEarly: typeof fixCompanionLevelsEarly };
  return { title: document.title, missing: Object.keys(need).filter((k) => need[k] !== 'function'),
    sw: { whois: isWhoisOn(), drawerlv: isDrawerLvOn(), namejob: isNameJobOn() } };
};

const READ_CARDS = () => Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn')).map((c) => {
  const cl = c.querySelector('.pmClass');
  const lvs = cl ? Array.prototype.slice.call(cl.querySelectorAll('.pmLv')).map((x) => x.textContent) : [];
  let rest = null;
  if (cl) { const k = cl.cloneNode(true); Array.prototype.slice.call(k.querySelectorAll('.pmLv')).forEach((x) => x.remove()); rest = k.textContent.trim(); }
  const f = cl && cl.firstChild;
  const b = c.getBoundingClientRect(); const cb = cl ? cl.getBoundingClientRect() : null;
  const i = parseInt(c.dataset.memberIdx, 10);
  const m = pmOrdered[i];
  return { i, cls: m ? m.classKey : null, classText: cl ? cl.textContent : null,
    classFirst: (f && f.nodeType === 3) ? String(f.nodeValue).trim() : '', rest, lvs,
    name: (c.querySelector('.pmName') || {}).textContent || null,
    skills: (c.querySelector('.pmSkillsVal') || {}).textContent || null,
    h: Math.round(b.height * 10) / 10, classH: cb ? Math.round(cb.height * 10) / 10 : null,
    m: m ? { name: m.name, cls: m.classKey, hero: !!m.isHero, level: (typeof m.level === 'number') ? m.level : null, mercId: (m.mercId != null) ? m.mercId : null } : null,
    lom: m ? levelOfMember(m) : null };
});
const READ_DRAWER = (want) => {
  const d = document.getElementById('pmDrawer');
  const t = document.getElementById('pmDrawerTitle');
  const idx = (typeof pmDrawerIdx !== 'undefined') ? pmDrawerIdx : null;
  const m = (idx != null && idx >= 0) ? pmOrdered[idx] : null;
  const cls = m ? m.classKey : null;
  const slot = cls ? PARTY_SLOTS.find((s) => s && s.classKey === cls) : null;
  const pool = slot ? slot.skillPool : [];
  const idOf = (txt) => { let best = null; pool.forEach((sk) => { if (txt.indexOf(']' + sk.name) >= 0 && (!best || sk.name.length > best.name.length)) best = sk; }); return best ? best.id : null; };
  const rows = d ? Array.prototype.slice.call(d.querySelectorAll('.skillItem.spellCountItem')).map((it) => {
    const nm = it.querySelector('.sName'); const txt = nm ? nm.textContent : '';
    const bm = txt.match(/\[Lv(\d+) 必要\]/); const plus = it.querySelector('.spcPlus');
    return { id: idOf(txt), full: it.classList.contains('full'), badge: bm ? bm[0] : null, plusDisabled: plus ? !!plus.disabled : null };
  }) : [];
  const f = t && t.firstChild;
  const r = (el) => el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
  return { want, idx, open: !!(d && !d.hidden), sentinelGone: !document.getElementById('__vmiDrawerSentinel'),
    nItems: d ? d.querySelectorAll('.skillItem').length : 0, nSpellRows: rows.length,
    title: t ? t.textContent : null, titleFirst: (f && f.nodeType === 3) ? String(f.nodeValue) : null,
    titleLvs: t ? Array.prototype.slice.call(t.querySelectorAll('.pmDrawerLv')).map((x) => x.textContent) : [],
    note: (document.getElementById('pmDrawerNote') || {}).textContent || null,
    skillHead: (document.getElementById('pmDrawerSkillHead') || {}).textContent || null,
    rows, apVals: d ? Array.prototype.slice.call(d.querySelectorAll('select.apSel')).map((s) => s.value) : [],
    m: m ? { name: m.name, cls, hero: !!m.isHero, level: (typeof m.level === 'number') ? m.level : null } : null,
    lom: m ? levelOfMember(m) : null,
    h: r(d), sh: d ? d.scrollHeight : null, ch: d ? d.clientHeight : null, titleH: r(t),
    html: d ? d.innerHTML : null };
};
const PRESS_PLUS = (id) => {
  const d = document.getElementById('pmDrawer');
  const m = pmOrdered[pmDrawerIdx]; const cls = m.classKey;
  const slot = PARTY_SLOTS.find((s) => s && s.classKey === cls);
  const sk = slot.skillPool.find((x) => x.id === id);
  const it = sk && Array.prototype.slice.call(d.querySelectorAll('.skillItem.spellCountItem'))
    .find((x) => ((x.querySelector('.sName') || {}).textContent || '').indexOf(']' + sk.name) >= 0);
  if (!it) return { found: false };
  const b = it.querySelector('.spcPlus');
  const n0 = (selection.partySkills[cls] || []).filter((x) => x === id).length;
  const dis = b ? !!b.disabled : null;
  if (b) b.click();
  const n1 = (selection.partySkills[cls] || []).filter((x) => x === id).length;
  return { found: true, disabled: dis, n0, n1 };
};
const READ_AP = () => {
  let o = null; try { o = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
  const c = o && o.cleric ? o.cleric : null;
  return c ? [c.general, c.boss] : null;
};
const PREP_SNAP = () => {
  const vis = (el) => !!(el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const d = document.getElementById('pmDepart');
  return { prolVis: vis(document.getElementById('prologueOverlay')),
    cinemaVis: !!(document.getElementById('partyMatchOverlay') && document.getElementById('partyMatchOverlay').style.display === 'flex'),
    departVis: !!(d && !d.hidden && d.getClientRects().length > 0) };
};
const DIALOG_READ = () => {
  const res = { seats: [], heroLv: getLevelFromXP(inventory.xp) };
  const role = document.getElementById('recruitRole');
  Object.keys(todaysPatrons || {}).forEach((k) => {
    const m = todaysPatrons[k];
    role.textContent = '∅vmi';                // (0d) 番兵
    openRecruitDialog(m);
    const txt = role.textContent;
    res.seats.push({ k, name: m.name, cls: m.classKey, label: recruitClassLabel(m.classKey), trait: m.trait,
      level: (typeof m.level === 'number') ? m.level : null, mercId: (m.mercId != null) ? m.mercId : null,
      lom: levelOfMember(m), role: txt, sentinel: txt === '∅vmi' });
    closeRecruitDialog();
  });
  return res;
};
/* 本物の抽選 drawTodaysPatrons() を引き直して、保存 Lv が主人公 Lv を超える名簿の顔を得る (clamp の網)。 */
const CLAMP_READ = () => {
  const heroLv = getLevelFromXP(inventory.xp);
  const keep = todaysPatrons;
  try {
    for (let t = 0; t < 300; t++) {
      const seats = drawTodaysPatrons();
      const k = Object.keys(seats || {}).find((x) => seats[x] && typeof seats[x].level === 'number' && seats[x].level > heroLv);
      if (!k) continue;
      const m = seats[k];
      const role = document.getElementById('recruitRole');
      role.textContent = '∅vmi';
      openRecruitDialog(m);
      const txt = role.textContent;
      closeRecruitDialog();
      return { t, heroLv, name: m.name, cls: m.classKey, label: recruitClassLabel(m.classKey), trait: m.trait, level: m.level, lom: levelOfMember(m), role: txt };
    }
    return { heroLv, notFound: true };
  } finally { todaysPatrons = keep; }
};
const DOM_SNAP = () => {
  renderRosterPanel();
  const labels = Array.prototype.slice.call(document.querySelectorAll('.patronLabel')).map((l) => ({ p: l.getAttribute('data-patron'), t: l.textContent, c: l.className }));
  return { rosterBody: (document.getElementById('rosterBody') || {}).innerHTML || null, rosterSub: (document.getElementById('rosterSub') || {}).textContent || null,
    labels, seats: Object.keys(todaysPatrons || {}).map((k) => k + ':' + todaysPatrons[k].name + '/' + todaysPatrons[k].classKey + '/' + todaysPatrons[k].level) };
};
/* 名前の生成口を全部回して、新顔の名前を集める (⛔ 表は写経しない = ページの NPC_NAMES_BY_CLASS を読む)。 */
const COLLECT = (cfg) => {
  const out = { has: typeof NPC_NAMES_BY_CLASS !== 'undefined', rtOn: isRecruitTalkOn(), nj: isNameJobOn(), src: {}, seen: {} };
  const tbl = out.has ? NPC_NAMES_BY_CLASS : null;
  const perCls = {};
  function rec(s, m) {
    if (!m || m.isHero || m.mercId != null) return;
    const r = out.src[s] || (out.src[s] = { n: 0, notInList: 0, notInOld: 0, ex: [] });
    r.n++;
    if (tbl && (!tbl[m.classKey] || tbl[m.classKey].indexOf(m.name) < 0)) { r.notInList++; if (r.ex.length < 4) r.ex.push(m.classKey + ':' + m.name); }
    if (NPC_NAMES.indexOf(m.name) < 0) r.notInOld++;
    const e = out.seen[m.name] || (out.seen[m.name] = {});
    e[m.classKey] = (e[m.classKey] || 0) + 1;
    (perCls[m.classKey] = perCls[m.classKey] || {})[m.name] = 1;
  }
  const N = cfg.N;
  for (const k of ALL_CLASS_KEYS) for (let i = 0; i < N; i++) rec('makeNpcMember', makeNpcMember(k, new Set()));
  for (const k of ALL_CLASS_KEYS) for (let i = 0; i < N; i++) rec('pickCompanion', pickCompanion(k, new Set()));
  if (out.rtOn) {
    const keep = todaysPatrons;
    for (let i = 0; i < N * 2; i++) { const p = drawTodaysPatrons(); RECRUIT_SEATS.forEach((s) => rec('drawTodaysPatrons', p[s])); }
    todaysPatrons = keep;
  } else {
    for (const h of ALL_CLASS_KEYS) for (let i = 0; i < N; i++) buildParty(h, 4).forEach((m) => rec('buildParty', m));
    const keepS = prepScenario; prepScenario = scenarios.find((s) => s.id === 'bandits-forest');
    const keepC = selection.partyComposition;
    for (const h of ALL_CLASS_KEYS) { selection.partyComposition = [h]; for (let i = 0; i < Math.ceil(N / 4); i++) { regeneratePartyMembers(); selection.partyMembers.forEach((m) => rec('regeneratePartyMembers', m)); } }
    prepScenario = keepS; selection.partyComposition = keepC;
  }
  out.multi = Object.keys(out.seen).filter((n) => Object.keys(out.seen[n]).length > 1);
  out.coverFull = tbl ? ALL_CLASS_KEYS.every((c) => tbl[c].every((n) => perCls[c] && perCls[c][n])) : null;
  out.perClassDistinct = {}; ALL_CLASS_KEYS.forEach((c) => { out.perClassDistinct[c] = perCls[c] ? Object.keys(perCls[c]).length : 0; });
  return out;
};
/* 名簿と約束を本番の口 (DFRoster.enroll / DFRecruits.add) で仕込む。
 *   mode 'oldrule' … 旧規則の顔 = 共有 16 名の先頭 8 名を **表と別の職** で名簿へ + 次の 2 名を別の職の新顔として約束へ
 *   mode 'bound'   … 上限の盤面 = 名簿に魔法使い CAP−1 人 (表の先頭から) + 約束に魔法使いの新顔 RECRUIT_MAX 人 (その次から) */
const SETUP = (cfg) => {
  DFRoster._wipe(); DFRecruits.clear();
  const ks = ALL_CLASS_KEYS;
  const other = (nm, i) => { const own = ks.find((k) => NPC_NAMES_BY_CLASS[k].indexOf(nm) >= 0); return ks[(ks.indexOf(own) + 1 + (i % (ks.length - 1))) % ks.length]; };
  let roster = [], cands = [];
  if (cfg.mode === 'oldrule') {
    roster = NPC_NAMES.slice(0, 8).map((nm, i) => ({ classKey: other(nm, i), name: nm }));
    if (cfg.cands !== false) cands = NPC_NAMES.slice(8, 10).map((nm, i) => ({ classKey: other(nm, i + 3), name: nm }));
  } else if (cfg.mode === 'bound') {
    const L = NPC_NAMES_BY_CLASS.mage;
    roster = L.slice(0, DFRoster.CAP - 1).map((nm) => ({ classKey: 'mage', name: nm }));
    if (cfg.cands !== false) cands = L.slice(DFRoster.CAP - 1, DFRoster.CAP - 1 + RECRUIT_MAX).map((nm) => ({ classKey: 'mage', name: nm }));
  }
  const ids = roster.map((p) => DFRoster.enroll({ classKey: p.classKey, name: p.name, trait: NPC_TRAITS[0], line: NPC_LINES[0], variant: 1, level: 2 }));
  const adds = cands.map((p) => DFRecruits.add({ classKey: p.classKey, isHero: false, zone: PARTY_ZONES[p.classKey], name: p.name, trait: NPC_TRAITS[1], line: NPC_LINES[1], variant: 1 }, RECRUIT_MAX).reason);
  return { ids, adds, roster: DFRoster.all().map((m) => m.classKey + ':' + m.name), cands: DFRecruits.all().map((m) => m.classKey + ':' + m.name),
    left: cfg.mode === 'bound' ? NPC_NAMES_BY_CLASS.mage[DFRoster.CAP - 1 + RECRUIT_MAX] : null,
    tableSize: NPC_NAMES_BY_CLASS.mage.length };
};
const GEN = (cfg) => {
  const taken = new Set(); DFRoster.all().forEach((m) => taken.add(m.name)); DFRecruits.all().forEach((m) => taken.add(m.name));
  const tbl = (typeof NPC_NAMES_BY_CLASS !== 'undefined') ? NPC_NAMES_BY_CLASS : null;
  const r = { taken: Array.from(taken), n: 0, coll: 0, notInList: 0, ex: [], names: {}, dupInFormation: 0, errs: 0, errMsg: '' };
  const rec = (m) => {
    if (!m || m.isHero || m.mercId != null) return;
    r.n++;
    if (taken.has(m.name)) { r.coll++; if (r.ex.length < 4) r.ex.push(m.classKey + ':' + m.name); }
    if (tbl && tbl[m.classKey].indexOf(m.name) < 0) r.notInList++;
    const k = m.classKey + ':' + m.name; r.names[k] = (r.names[k] || 0) + 1;
  };
  for (const k of (cfg.classes || [])) for (let i = 0; i < cfg.N; i++) { rec(makeNpcMember(k, new Set())); rec(pickCompanion(k, new Set())); }
  if (cfg.patrons) {
    const keep = todaysPatrons;
    for (let i = 0; i < cfg.N; i++) {
      try { const p = drawTodaysPatrons(); const ms = RECRUIT_SEATS.map((s) => p[s]); ms.forEach(rec); if (new Set(ms.map((m) => m.name)).size !== ms.length) r.dupInFormation++; }
      catch (e) { r.errs++; r.errMsg = String(e && e.message); }
    }
    todaysPatrons = keep;
  }
  if (cfg.party) for (const h of ALL_CLASS_KEYS) for (let i = 0; i < cfg.N; i++) {
    try { const ms = buildParty(h, cfg.party); ms.forEach(rec); const nm = ms.filter((m) => !m.isHero).map((m) => m.name); if (new Set(nm).size !== nm.length) r.dupInFormation++; }
    catch (e) { r.errs++; r.errMsg = String(e && e.message); }
  }
  r.newNames = Object.keys(r.names);
  delete r.names;
  return r;
};

/* ══════════════════════════════════════════════════════════════════════════════
 * ページの開き方 / マッチング画面の開き方
 * ══════════════════════════════════════════════════════════════════════════════ */
async function openTavern(ctx, tag, ls, qs, opts) {
  opts = opts || {};
  const page = await ctx.browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e && e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let u = ''; try { u = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;   // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push('CONSOLE ' + String(m.text()).slice(0, 200));
  });
  page.__nav = [];
  page.__tag = tag;
  page.__errs = errs;
  ctx.pages.push(page);
  await page.setRequestInterception(true);
  page.on('request', (rq) => {
    const u = rq.url();
    if (rq.isNavigationRequest() && rq.frame() === page.mainFrame() && /\/(index|world)\.html/.test(u)) { page.__nav.push(u); rq.abort('aborted').catch(() => {}); return; }
    rq.continue().catch(() => {});
  });
  const vp = opts.vp || { width: 1280, height: 900 };
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  if (opts.rng) await page.evaluateOnNewDocument(installRng, opts.rng);
  await page.evaluateOnNewDocument(seedOnce, { tag: tag + '#' + (++ctx.seq), ls: ls });
  let boot = null;
  try {
    await page.goto('http://127.0.0.1:' + ctx.port + '/tavern.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(TAVERN_READY, { timeout: 60000 });
    boot = await page.evaluate(BOOT);
  } catch (e) {
    boot = { title: '', missing: ['(起動失敗) ' + String((e && e.message) || e).slice(0, 160)], sw: null };
  }
  ctx.boots.push(Object.assign({ tag, qs: qs || '' }, boot));
  if (!boot.title || boot.missing.length) throw new Error('ページが起動しなかった: ' + tag + ' ' + J(boot));
  return page;
}
async function closePage(ctx, page) {
  for (const e of (page.__errs || [])) ctx.errs.push(page.__tag + ' :: ' + e);
  page.__errs = [];
  await page.close().catch(() => {});
}
/* 顔ぶれを直接与えて演出だけを開く (既存シーム __pmTest.play)。rngConst を渡すと play の同期部分 (= fixCompanionLevelsEarly
 * がカードを描く前に振る区間) だけ Math.random をその定数に差し替える。 */
async function playForced(ctx, page, members, opts) {
  opts = opts || {};
  const r = await page.evaluate((ms, psm, scId, rc) => {
    selection.partyComposition = [ms.find((m) => m.isHero).classKey];
    selection.partyMembers = ms.map((m) => Object.assign({ zone: PARTY_ZONES[m.classKey], variant: m.isHero ? 0 : 1, trait: null, line: null }, m));
    if (psm) selection.partySkills.mage = psm.slice();
    const cols = document.getElementById('pmColumns');
    if (cols) { const s = document.createElement('div'); s.id = '__vmiColSentinel'; cols.appendChild(s); }   // (0d) 番兵
    const sc = scenarios.find((s) => s.id === scId);
    const R0 = Math.random;
    if (typeof rc === 'number') Math.random = function () { return rc; };
    try { Promise.resolve(window.__pmTest.play(sc)).catch(() => {}); } finally { Math.random = R0; }
    return { scFound: !!sc };
  }, members, opts.psm || null, opts.sc || SC_ID, (typeof opts.rngConst === 'number') ? opts.rngConst : null);
  let out = Object.assign({ reached: false }, r);
  for (let i = 0; i < 600; i++) {
    const ok = await page.evaluate(() => { const d = document.getElementById('pmDepart'); return !!(d && !d.hidden && d.getClientRects().length > 0); });
    if (ok) {
      const s = await page.evaluate(() => ({ sentinelGone: !document.getElementById('__vmiColSentinel'),
        nCols: document.querySelectorAll('#pmColumns .pmColumn').length, n: selection.partyMembers.length }));
      out = Object.assign({ reached: true }, r, s);
      break;
    }
    await sleep(50);
  }
  ctx.plays.push(Object.assign({ tag: page.__tag }, out));
  return out;
}
async function openDrawer(ctx, page, idx) {
  await page.evaluate((w) => {
    const d = document.getElementById('pmDrawer');
    if (d) { const s = document.createElement('div'); s.id = '__vmiDrawerSentinel'; d.appendChild(s); }   // (0d) 番兵
    const c = document.querySelector('#pmColumns .pmColumn[data-member-idx="' + w + '"]');
    if (c) c.click();
  }, idx);
  await sleep(380);
  const dr = await page.evaluate(READ_DRAWER, idx);
  ctx.drawerReads.push({ tag: page.__tag, want: idx, idx: dr.idx, open: dr.open, sentinelGone: dr.sentinelGone,
    nItems: dr.nItems, nSpellRows: dr.nSpellRows, cls: dr.m && dr.m.cls });
  return dr;
}
async function closeDrawer(page) {
  await page.evaluate(() => { const b = document.getElementById('pmDrawerClose'); if (b) b.click(); });
  await sleep(300);
}
async function readAllDrawers(ctx, page) {
  const order = await page.evaluate(() => pmOrdered.map((m, i) => i));
  const out = [];
  for (const i of order) { out.push(await openDrawer(ctx, page, i)); await closeDrawer(page); }
  return out;
}
async function idxOf(page, cls, hero) {
  return page.evaluate((c, h) => pmOrdered.findIndex((m) => m && m.classKey === c && (h === null || !!m.isHero === h)), cls, hero === undefined ? null : hero);
}
async function driveOpenPrep(page, scId, budgetMs) {
  await page.evaluate((id) => { const sc = scenarios.find((s) => s.id === id); Promise.resolve(openPrep(sc)).catch((e) => { window.__prepErr = String(e); }); }, scId);
  const t0 = Date.now(); let last = 0;
  while (Date.now() - t0 < (budgetMs || 150000)) {
    const s = await page.evaluate(PREP_SNAP);
    if (s.cinemaVis && s.departVis) return true;
    if (s.prolVis && Date.now() - last > 400) { await page.evaluate(() => { const o = document.getElementById('prologueOverlay'); if (o) o.click(); }); last = Date.now(); }
    await sleep(80);
  }
  return false;
}

/* 顔の作り方: 名簿の顔 = mercId + level / 新顔 = level も mercId も無い / 主人公 = isHero。名前は仕込み (⛔ 名前表を測る節では使わない)。 */
const HERO = (ck) => ({ classKey: ck, isHero: true, name: null });
const ROSTER = (ck, name, lv, id) => ({ classKey: ck, isHero: false, name, level: lv, mercId: id, variant: 1, trait: '理屈っぽいが頼りになる', line: '「報酬は山分けだ。それでいいな？」' });
const NEWF = (ck, name) => ({ classKey: ck, isHero: false, name, variant: 1, trait: '酒好きで宵越しの金を持たない', line: '「久々の大仕事だ、腕が鳴るぜ。」' });
const PSM = ['sleep', 'lightning-bolt'];

/* ══════════════════════════════════════════════════════════════════════════════
 * ユニット (1 ユニット = 1〜4 ページ)。データは ctx.D へ置くだけ。判定は最後の judge() が一括で出す。
 * ══════════════════════════════════════════════════════════════════════════════ */
function baseLs(ctx, xp, extra) {
  const M = ctx.D.meta;
  const known = M ? { mage: M.slots.mage.spells.map((s) => s.id), cleric: M.slots.cleric.spells.map((s) => s.id), elf: M.slots.elf.spells.map((s) => s.id) } : null;
  return Object.assign({ 'dragonfighters.prologueSeen': '1', 'dragonfighters.prepOnboardingSeen': '1', 'dragonfighters.soloWarnSeen': '1',
    'dragonfighters.xp': String(xp) }, known ? { 'dragonfighters.knownSpells': J(known) } : {}, extra || {});
}

const UNITS = {
  /* meta — 期待値の出所をページから読む ((0b))。⭐ 既定の腕 (3 本とも ON)。 */
  async meta(ctx) {
    const p = await openTavern(ctx, 'meta', baseLs(ctx, HERO_XP), '');
    const M = await p.evaluate((xps) => {
      const slots = {};
      PARTY_SLOTS.forEach((s) => { if (s) slots[s.classKey] = { name: s.name, spells: s.skillPool.filter((sk) => sk.mpCost > 0).map((sk) => ({ id: sk.id, name: sk.name, levelReq: (typeof sk.levelReq === 'number') ? sk.levelReq : null })) }; });
      const labels = {}; ALL_CLASS_KEYS.forEach((k) => { labels[k] = recruitClassLabel(k); });
      return { slots, labels, classKeys: ALL_CLASS_KEYS.slice(), traits: NPC_TRAITS.slice(), lines: NPC_LINES.slice(),
        namesByClass: (typeof NPC_NAMES_BY_CLASS !== 'undefined') ? NPC_NAMES_BY_CLASS : null, oldNames: NPC_NAMES.slice(),
        cap: (window.DFRoster && DFRoster.CAP) || null, recruitMax: RECRUIT_MAX,
        lvOf: xps.map((x) => getLevelFromXP(x)), xp: inventory.xp, heroLv: getLevelFromXP(inventory.xp),
        mageUi: MAGE_SKILLS_UI.map((s) => ({ id: s.id, levelReq: (typeof s.levelReq === 'number') ? s.levelReq : null })) };
    }, [HERO_XP, DIMS_XP]);
    await closePage(ctx, p);
    M.body = {};
    for (const s of M.mageUi) M.body[s.id] = bodyLevelReq(s.id);
    ctx.D.meta = M;
  },

  /* P1 — §1 表示 (A1)。名簿の魔法使い Lv2 / 名簿の僧侶 保存 Lv9 (主人公 Lv を超える = clamp の網) / 新顔のエルフ (マッチングで振られる)。 */
  async P1(ctx) {
    const p = await openTavern(ctx, 'P1', baseLs(ctx, HERO_XP), ARM.A1);
    const party = [HERO('warrior'), ROSTER('mage', 'ロルフ', 2, 9001), ROSTER('cleric', 'リタ', 9, 9002), NEWF('elf', 'ニカ')];
    const play = await playForced(ctx, p, party, { psm: PSM });
    const cards = await p.evaluate(READ_CARDS);
    const drawers = await readAllDrawers(ctx, p);
    const heroLv = await p.evaluate(() => getLevelFromXP(inventory.xp));
    await closePage(ctx, p);
    ctx.D.P1 = { party, play, cards, drawers, heroLv };
  },

  /* P0 — 3 本とも 0 (A0)。§2 の欠陥の再現・(1a)(1b) の撤退の腕・(3c)・(4a) を 1 ページで。 */
  async P0(ctx) {
    const p = await openTavern(ctx, 'P0', baseLs(ctx, HERO_XP), ARM.A0);
    const party = [HERO('warrior'), ROSTER('mage', 'ロルフ', 2, 9001), ROSTER('cleric', 'リタ', 2, 9002), NEWF('elf', 'ニカ')];
    const play = await playForced(ctx, p, party, { psm: PSM });
    const cards = await p.evaluate(READ_CARDS);
    const selAtMatch = await p.evaluate(() => selection.partyMembers.map((m) => ({ cls: m.classKey, hero: !!m.isHero, name: m.name, level: (typeof m.level === 'number') ? m.level : null })));
    const drawers = await readAllDrawers(ctx, p);
    const D = await clericElfMageProbe(ctx, p);
    const mageUi = await p.evaluate(() => MAGE_SKILLS_UI.map((s) => ({ id: s.id, levelReq: (typeof s.levelReq === 'number') ? s.levelReq : null })));
    const clericTruth = await p.evaluate(CLERIC_TRUTH);
    const names = await p.evaluate(COLLECT, { N: 120 });
    const setupA = await p.evaluate(SETUP, { mode: 'oldrule' });
    const genA = await p.evaluate(GEN, { classes: ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'], N: 60, patrons: true });
    const dep = await departProbe(ctx, p, 'elf', null);
    await closePage(ctx, p);
    ctx.D.P0 = Object.assign({ party, play, cards, selAtMatch, drawers, mageUi, clericTruth, names, setupA, genA, dep }, D);
  },

  /* P2 — §2 判定 Lv (A2)。名簿の魔法使い / 僧侶 / エルフ いずれも Lv2。 */
  async P2(ctx) {
    const p = await openTavern(ctx, 'P2', baseLs(ctx, HERO_XP), ARM.A2);
    const party = [HERO('warrior'), ROSTER('mage', 'ロルフ', 2, 9001), ROSTER('cleric', 'リタ', 2, 9002), ROSTER('elf', 'エル', 2, 9003)];
    const play = await playForced(ctx, p, party, { psm: PSM });
    const D = await clericElfMageProbe(ctx, p);
    const mageUi = await p.evaluate(() => MAGE_SKILLS_UI.map((s) => ({ id: s.id, levelReq: (typeof s.levelReq === 'number') ? s.levelReq : null })));
    await closePage(ctx, p);
    ctx.D.P2 = Object.assign({ party, play, mageUi }, D);
  },

  /* P2c — 仲間の魔法使い Lv3 なら置ける (A2)。 */
  async P2c(ctx) {
    const p = await openTavern(ctx, 'P2c', baseLs(ctx, HERO_XP), ARM.A2);
    const party = [HERO('warrior'), ROSTER('mage', 'ロルフ', 3, 9001), ROSTER('cleric', 'リタ', 2, 9002), ROSTER('elf', 'エル', 2, 9003)];
    const play = await playForced(ctx, p, party, { psm: PSM });
    const mi = await idxOf(p, 'mage');
    const dr = await openDrawer(ctx, p, mi);
    const press = await p.evaluate(PRESS_PLUS, 'lightning-bolt');
    await closeDrawer(p);
    await closePage(ctx, p);
    ctx.D.P2c = { party, play, dr, press, npcLv: 3 };
  },

  /* P2d — 主人公が魔法使いで同職の仲間なし (A2 vs A0)。仲間は呪文を持たない職 (⚠ 呪文職の仲間は柱2 で当然変わる = 2a の崩れた主張 2)。 */
  async P2d(ctx) {
    const party = [HERO('mage'), ROSTER('warrior', 'ガイ', 2, 9201), ROSTER('dwarf', 'ダグ', 2, 9204), ROSTER('rogue', 'ブラン', 2, 9205)];
    const out = {};
    for (const [k, qs] of [['on', ARM.A2], ['off', ARM.A0]]) {
      const p = await openTavern(ctx, 'P2d_' + k, baseLs(ctx, HERO_XP), qs);
      const play = await playForced(ctx, p, party, { psm: PSM });
      const drawers = await readAllDrawers(ctx, p);
      const heroLv = await p.evaluate(() => getLevelFromXP(inventory.xp));
      await closePage(ctx, p);
      out[k] = { play, drawers, heroLv };
    }
    ctx.D.P2d = out;
  },

  /* P2f — 同職の判定 (A2: 主人公の魔法使い + 仲間 Lv2) と注記の逐語 (N: 2 人 / 3 人・A1: 撤退の文面)。 */
  async P2f(ctx) {
    const two = [HERO('mage'), ROSTER('mage', 'ロルフ', 2, 9001), ROSTER('warrior', 'ガイ', 2, 9201), ROSTER('cleric', 'リタ', 2, 9002)];
    const three = [HERO('mage'), ROSTER('mage', 'ロルフ', 2, 9001), ROSTER('mage', 'ミラ', 4, 9004), ROSTER('warrior', 'ガイ', 2, 9201)];
    const out = {};
    for (const [k, qs, party] of [['A2', ARM.A2, two], ['N2', ARM.N, two], ['N3', ARM.N, three], ['A1', ARM.A1, two]]) {
      const p = await openTavern(ctx, 'P2f_' + k, baseLs(ctx, HERO_XP), qs);
      const play = await playForced(ctx, p, party, { psm: PSM });
      const idxs = await p.evaluate(() => pmOrdered.map((m, i) => (m.classKey === 'mage' ? i : -1)).filter((i) => i >= 0));
      const drawers = [];
      for (const i of idxs) { drawers.push(await openDrawer(ctx, p, i)); await closeDrawer(p); }
      const heroLv = await p.evaluate(() => getLevelFromXP(inventory.xp));
      await closePage(ctx, p);
      out[k] = { party, play, drawers, heroLv };
    }
    ctx.D.P2f = out;
  },

  /* P2g — 新顔の Lv はマッチング画面で確定し、出発で振り直さない (A2)。
   *   マッチングの同期区間は Math.random = 0.999 (帯の上端) / 出発の区間は Math.random = 0 (帯の下端) に固定する
   *   ⇒ 出発で振り直せば **必ず** 別の値になる盤面で「同じ値のまま」を見る (装置 = 下端 ≠ 上端)。 */
  async P2g(ctx) {
    const p = await openTavern(ctx, 'P2g', baseLs(ctx, HERO_XP), ARM.A2);
    const party = [HERO('warrior'), NEWF('mage', 'ヨナ'), ROSTER('cleric', 'リタ', 2, 9002), ROSTER('elf', 'エル', 2, 9003)];
    const play = await playForced(ctx, p, party, { psm: PSM, rngConst: 0.999 });
    const atMatch = await p.evaluate(() => { const m = selection.partyMembers.find((x) => x.classKey === 'mage'); return { level: (typeof m.level === 'number') ? m.level : null, lom: levelOfMember(m), mercId: m.mercId != null ? m.mercId : null }; });
    const dep = await departProbe(ctx, p, 'mage', 0);
    await closePage(ctx, p);
    ctx.D.P2g = { party, play, atMatch, dep };
  },

  /* P2i — 僧侶のカードの「技」行 = 本人の Lv (A2)。主人公の僧侶 + 名簿の僧侶 Lv2。 */
  async P2i(ctx) {
    const p = await openTavern(ctx, 'P2i', baseLs(ctx, HERO_XP), ARM.A2);
    const party = [HERO('cleric'), ROSTER('cleric', 'リタ', 2, 9101), ROSTER('mage', 'ロルフ', 3, 9001), ROSTER('warrior', 'ガイ', 2, 9201)];
    const play = await playForced(ctx, p, party, { psm: PSM });
    await sleep(300);
    const cards = await p.evaluate(READ_CARDS);
    const truth = await p.evaluate(CLERIC_TRUTH);
    await closePage(ctx, p);
    ctx.D.P2i = { party, play, cards, truth };
  },

  /* P2j — 保存済みの僧侶の傾向が消えない (A2)。M = マッチング → 僧侶の引き出し / H = 本番の openPrep (主人公が僧侶 + 名簿の僧侶 Lv2)。 */
  async P2j(ctx) {
    const AP = J({ cleric: { general: 'hold-person', mob: null, boss: 'hold-person', travel: null } });
    const out = {};
    { const p = await openTavern(ctx, 'P2j_M', baseLs(ctx, HERO_XP, { 'dragonfighters.actionPriority': AP }), ARM.A2);
      const t0 = await p.evaluate(READ_AP);
      const party = [HERO('warrior'), ROSTER('cleric', 'リタ', 2, 9101), ROSTER('mage', 'ロルフ', 3, 9001), ROSTER('elf', 'エル', 2, 9102)];
      const play = await playForced(ctx, p, party, { psm: PSM });
      const t1 = await p.evaluate(READ_AP);
      const ci = await idxOf(p, 'cleric');
      const dr = await openDrawer(ctx, p, ci);
      const t2 = await p.evaluate(READ_AP);
      await closeDrawer(p);
      await readAllDrawers(ctx, p);
      const t3 = await p.evaluate(READ_AP);
      const holdAt = await p.evaluate(() => ({ lv2: (getClericSlotsTV(2) || {})['hold-person'] || 0, hero: (getClericSlotsTV(getLevelFromXP(inventory.xp)) || {})['hold-person'] || 0 }));
      await closePage(ctx, p);
      out.M = { play, t0, t1, t2, t3, apVals: dr.apVals, holdAt }; }
    { const RC = [Object.assign({ zone: 'mid' }, ROSTER('cleric', 'リタ', 2, 9101))];
      const p = await openTavern(ctx, 'P2j_H', baseLs(ctx, HERO_XP, { 'dragonfighters.actionPriority': AP,
        'dragonfighters.partyComposition': J(['cleric']), 'dragonfighters.recruitCandidates': J(RC) }), ARM.A2);
      const t0 = await p.evaluate(READ_AP);
      const reached = await driveOpenPrep(p, SC_ID);
      const t1 = await p.evaluate(READ_AP);
      const mem = await p.evaluate(() => (selection.partyMembers || []).map((m) => m.classKey + (m.isHero ? '★' : '') + ':' + (typeof m.level === 'number' ? m.level : '-')));
      const drawers = await readAllDrawers(ctx, p);
      const t2 = await p.evaluate(READ_AP);
      await closePage(ctx, p);
      out.H = { reached, t0, t1, t2, mem, clericAp: drawers.filter((d) => d.m && d.m.cls === 'cleric').map((d) => d.apVals) }; }
    ctx.D.P2j = out;
  },

  /* S3 — §3 名前とジョブ (A3 と A3 + ?recruittalk=0)。 */
  async S3(ctx) {
    const out = {};
    { const p = await openTavern(ctx, 'S3', baseLs(ctx, HERO_XP), ARM.A3);
      out.col = await p.evaluate(COLLECT, { N: 200 });
      out.setA = await p.evaluate(SETUP, { mode: 'oldrule' });
      out.genA = await p.evaluate(GEN, { classes: ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'], N: 100, patrons: true });
      out.setB = await p.evaluate(SETUP, { mode: 'bound' });
      out.genB = await p.evaluate(GEN, { classes: ['mage'], N: 150, patrons: true });
      await closePage(ctx, p); }
    { const p = await openTavern(ctx, 'S3_rt0', baseLs(ctx, HERO_XP), ARM.A3 + '&recruittalk=0');
      out.colRt = await p.evaluate(COLLECT, { N: 200 });
      out.setRt = await p.evaluate(SETUP, { mode: 'oldrule', cands: false });
      out.genRt = await p.evaluate(GEN, { N: 60, party: 4 });
      await closePage(ctx, p); }
    ctx.D.S3 = out;
  },

  /* S3d — 名簿・約束の保存物 (A3)。本番の口で旧規則の名簿 (同名 2 人を含む) と約束を作り、別のページで読み込み → 抽選 → 声掛け → 出発。 */
  async S3d(ctx) {
    const sp = await openTavern(ctx, 'S3d_seed', baseLs(ctx, HERO_XP), ARM.A3);
    const seed = await sp.evaluate(() => {
      DFRoster._wipe(); DFRecruits.clear();
      const ks = ALL_CLASS_KEYS;
      const faces = NPC_NAMES.slice(0, 8).map((nm, i) => { const own = ks.find((k) => NPC_NAMES_BY_CLASS[k].indexOf(nm) >= 0); return { classKey: ks[(ks.indexOf(own) + 1 + (i % 5)) % 6], name: nm, level: 1 + (i % 9) }; });
      faces.push({ classKey: faces[1].classKey, name: faces[0].name, level: 3 });   // 旧規則の同名の別人 (移行しないことの証拠)
      const ids = faces.map((f) => DFRoster.enroll({ classKey: f.classKey, name: f.name, trait: NPC_TRAITS[2], line: NPC_LINES[2], variant: 2, level: f.level }));
      DFRoster.recordRun([ids[0], ids[2]], true); DFRoster.recordRun([ids[0]], true); DFRoster.recordRun([ids[0]], true);
      const v = DFRoster.all()[0];
      DFRecruits.add({ classKey: v.classKey, isHero: false, zone: PARTY_ZONES[v.classKey], name: v.name, trait: v.trait, line: v.line, variant: v.variant, level: v.level, mercId: v.id }, RECRUIT_MAX);
      const nf = makeNpcMember('mage', new Set());   // 新顔の約束 = 本番の口が作る形そのもの
      DFRecruits.add(nf, RECRUIT_MAX);
      return { r: localStorage.getItem('dragonfighters.mercRoster'), c: localStorage.getItem('dragonfighters.recruitCandidates'), ids };
    });
    await closePage(ctx, sp);
    const p = await openTavern(ctx, 'S3d', baseLs(ctx, HERO_XP, { 'dragonfighters.mercRoster': seed.r, 'dragonfighters.recruitCandidates': seed.c }), ARM.A3, { rng: 2468 });
    const r = {};
    r.afterLoad = await p.evaluate((sr, sc) => ({ r: localStorage.getItem('dragonfighters.mercRoster') === sr, c: localStorage.getItem('dragonfighters.recruitCandidates') === sc }), seed.r, seed.c);
    r.afterGen = await p.evaluate((sr, sc) => {
      const keep = todaysPatrons; let n = 0;
      for (let i = 0; i < 200; i++) { const s = drawTodaysPatrons(); n += Object.keys(s || {}).length; }
      ALL_CLASS_KEYS.forEach((k) => { for (let i = 0; i < 60; i++) { makeNpcMember(k, new Set()); pickCompanion(k, new Set()); n += 2; } });
      todaysPatrons = keep;
      return { n, r: localStorage.getItem('dragonfighters.mercRoster') === sr, c: localStorage.getItem('dragonfighters.recruitCandidates') === sc };
    }, seed.r, seed.c);
    r.recruit = await p.evaluate((sc0) => {
      const seat = RECRUIT_SEATS.find((s) => todaysPatrons[s] && todaysPatrons[s].mercId == null);
      if (!seat) return { err: 'no new-face seat' };
      const m = todaysPatrons[seat];
      openRecruitDialog(m);
      document.getElementById('btnRecruitYes').click();
      const arr = JSON.parse(localStorage.getItem('dragonfighters.recruitCandidates'));
      const old = JSON.parse(sc0);
      const sig = (x) => Object.keys(x).sort().map((k) => k + ':' + (x[k] === null ? 'null' : typeof x[k])).join(',');
      const oldNew = old.filter((x) => x.mercId == null);
      return { seat, n0: old.length, n: arr.length, oldSame: old.every((o, i) => JSON.stringify(o) === JSON.stringify(arr[i])),
        newSig: arr.slice(old.length).map(sig), refSig: oldNew.map(sig) };
    }, seed.c);
    r.depart = await p.evaluate((sr0) => {
      prepScenario = scenarios.find((s) => s.id === 'bandits-forest');
      selection.partyComposition = ['warrior'];
      regeneratePartyMembers();
      sessionStorage.removeItem('dragonfighters.partyMembers');
      let err = '';
      try { departToScenario(); } catch (e) { err = String(e && e.message); }
      const pm = JSON.parse(sessionStorage.getItem('dragonfighters.partyMembers') || 'null');
      const ro = JSON.parse(localStorage.getItem('dragonfighters.mercRoster'));
      const old = JSON.parse(sr0);
      const keys = (x) => Object.keys(x).sort().join(',');
      const heroRef = Object.keys(makeHeroMember('warrior')).concat(['level']).sort().join(',');
      const npcRef = Object.keys(makeNpcMember('mage', new Set())).concat(['level', 'mercId']).sort().join(',');
      return { err, pmKeys: pm ? pm.map((m) => (m.isHero ? 'H:' : 'N:') + keys(m)) : null, heroRef, npcRef,
        rosterTop: Object.keys(ro).sort().join(','), rosterTopOld: Object.keys(old).sort().join(','),
        oldSame: old.list.every((o, i) => JSON.stringify(o) === JSON.stringify(ro.list[i])),
        oldKeys: Array.from(new Set(old.list.map(keys))), newKeys: ro.list.slice(old.list.length).map(keys), nOld: old.list.length, nNow: ro.list.length,
        dupNames: ro.list.length - new Set(ro.list.map((m) => m.name)).size };
    }, seed.r);
    for (let i = 0; i < 40 && !p.__nav.length; i++) await sleep(100);   // 出発の遷移は非同期 (abort で止めたことを確かめる)
    r.nav = p.__nav.slice();
    await closePage(ctx, p);
    ctx.D.S3d = Object.assign({ seed }, r);
  },

  /* DLG — 声掛けダイアログ (1c) と傭兵名簿パネル (1d)。A1 の満杯の名簿 / A1 の空の名簿 / A0 の満杯の名簿 (乱数はページの最初から同じ種)。 */
  async DLG(ctx) {
    const M = ctx.D.meta;
    const LVS = [2, 9, 3, 5, 10, 4, 6, 1, 7, 8, 2, 3];
    const list = [];
    for (let i = 0; i < M.cap; i++) {
      const ck = M.classKeys[i % M.classKeys.length];
      const nm = M.namesByClass ? M.namesByClass[ck][Math.floor(i / M.classKeys.length)] : ('N' + i);
      list.push({ id: i + 1, classKey: ck, name: nm, trait: M.traits[i % M.traits.length], line: M.lines[0], variant: 1, level: LVS[i % LVS.length], runs: i });
    }
    const roster = J({ v: 1, next: list.length + 1, list });
    const out = { rosterList: list };
    for (const [k, qs, ls] of [['A1full', ARM.A1, { 'dragonfighters.mercRoster': roster }], ['A1empty', ARM.A1, {}], ['A0full', ARM.A0, { 'dragonfighters.mercRoster': roster }]]) {
      const p = await openTavern(ctx, 'DLG_' + k, baseLs(ctx, HERO_XP, ls), qs, { rng: 12345 });
      await sleep(400);
      const snap = await p.evaluate(DOM_SNAP);
      const dlg = await p.evaluate(DIALOG_READ);
      const clamp = (k === 'A1full') ? await p.evaluate(CLAMP_READ) : null;
      await closePage(ctx, p);
      out[k] = { snap, dlg, clamp };
    }
    ctx.D.DLG = out;
  },

  /* DIMS — (4b) 寸法。最悪の見出し (ドワーフ — ガウェイン Lv10) を含む編成を A1 と A0 で、2 画面。 */
  async DIMS(ctx) {
    const party = [HERO('dwarf'), ROSTER('dwarf', 'ガウェイン', 10, 9301), ROSTER('mage', 'ベルント', 10, 9302), ROSTER('cleric', 'セシリア', 10, 9303)];
    const out = {};
    for (const vp of DIMS_VPS) {
      for (const [k, qs] of [['on', ARM.A1], ['off', ARM.A0]]) {
        const p = await openTavern(ctx, 'DIMS_' + vp.tag + '_' + k, baseLs(ctx, DIMS_XP), qs, { vp });
        const play = await playForced(ctx, p, party, { psm: PSM });
        await sleep(300);
        const cards = await p.evaluate(READ_CARDS);
        const drawers = await readAllDrawers(ctx, p);
        await closePage(ctx, p);
        out[vp.tag + '_' + k] = { play, cards: cards.map((c) => ({ h: c.h, classH: c.classH, lvs: c.lvs })),
          drawers: drawers.map((d) => ({ h: d.h, sh: d.sh, ch: d.ch, titleH: d.titleH, titleLvs: d.titleLvs })) };
      }
    }
    ctx.D.DIMS = out;
  },
};
const DIMS_VPS = [{ tag: '1280x900', width: 1280, height: 900 }, { tag: '1366x768', width: 1366, height: 768 },
  { tag: '390x844', width: 390, height: 844 }, { tag: '390x667', width: 390, height: 667 }];
const UNIT_ORDER = ['meta', 'P1', 'P0', 'P2', 'P2c', 'P2d', 'P2f', 'P2g', 'P2i', 'P2j', 'S3', 'S3d', 'DLG', 'DIMS'];

/* 同じページで 魔法使い / 僧侶 / エルフ の引き出しを開き、LB を押し、枠を埋めてもう一度押す (P2 と P0 で同じ手順)。 */
async function clericElfMageProbe(ctx, p) {
  const out = {};
  const mi = await idxOf(p, 'mage');
  out.mage = await openDrawer(ctx, p, mi);
  out.pressLB = await p.evaluate(PRESS_PLUS, 'lightning-bolt');
  await closeDrawer(p);
  for (const c of ['cleric', 'elf']) { const i = await idxOf(p, c); out[c] = await openDrawer(ctx, p, i); await closeDrawer(p); }
  /* (2e) 枠: 仲間の Lv (仕込み) の上限ちょうどまでマジックミサイルで埋める。上限は getMaxSpellSlotsForClassTV(職, Lv) = 枠の曲線。 */
  out.cap = await p.evaluate(() => {
    const m = pmOrdered.find((x) => x.classKey === 'mage');
    const heroLv = getLevelFromXP(inventory.xp);
    const npcLv = (typeof m.level === 'number') ? Math.min(m.level, heroLv) : null;
    const capLow = getMaxSpellSlotsForClassTV('mage', npcLv), capHero = getMaxSpellSlotsForClassTV('mage', heroLv);
    const psm = ['sleep']; while (psm.length < capLow) psm.push('magic-missile');
    selection.partySkills.mage = psm;
    return { npcLv, heroLv, capLow, capHero, n: psm.length };
  });
  out.mageCap = await openDrawer(ctx, p, mi);
  out.pressMM = await p.evaluate(PRESS_PLUS, 'magic-missile');
  await closeDrawer(p);
  return out;
}
/* 僧侶のカードの「技」行の期待値 (同じページの getClericSlotsTV を本人の Lv で呼ぶ / 2 経路目 = 表の直読み − 除外)。 */
const CLERIC_TRUTH = () => {
  const slot = PARTY_SLOTS.find((s) => s.classKey === 'cleric');
  const heroLv = getLevelFromXP(inventory.xp);
  const off = (typeof clericSpellsOffTV === 'function') ? clericSpellsOffTV() : [];
  const viaFn = (lv) => { const a = getClericSlotsTV(lv); return slot.skillPool.filter((sk) => (a[sk.id] || 0) > 0 && isSpellKnownTV('cleric', sk.id)).map((sk) => sk.name).join('・'); };
  const viaTbl = (lv) => slot.skillPool.filter((sk) => ((CLERIC_SLOTS_TABLE[sk.id] || [])[Math.max(0, Math.min(10, lv))] || 0) > 0 && isSpellKnownTV('cleric', sk.id) && off.indexOf(sk.id) < 0).map((sk) => sk.name).join('・');
  return { heroLv, per: pmOrdered.map((m, i) => {
    const lv = m.isHero ? heroLv : (typeof m.level === 'number' ? Math.min(m.level, heroLv) : null);
    return { i, cls: m.classKey, hero: !!m.isHero, lv, fn: (m.classKey === 'cleric' && lv) ? viaFn(lv) : null, tbl: (m.classKey === 'cleric' && lv) ? viaTbl(lv) : null, heroFn: viaFn(heroLv) };
  }) };
};
/* 出発 (本番の departToScenario。遷移は abort)。rngConst を渡すと出発の区間だけ Math.random をその定数へ。
 *   lo / hi = 同じページの assignCompanionLevels を「帯の下端 (0)」と「上端 (0.999)」で空の顔に当てた値 (帯の端を写経しない)。 */
async function departProbe(ctx, p, cls, rngConst) {
  const r = await p.evaluate((c, rc, scId) => {
    const sc = scenarios.find((s) => s.id === scId);
    const heroLv = getLevelFromXP(inventory.xp);
    const R0 = Math.random;
    const pv = (v) => { const x = { classKey: c, isHero: false }; Math.random = function () { return v; }; try { assignCompanionLevels([x], questLevelOf(sc, heroLv), heroLv); } finally { Math.random = R0; } return x.level; };
    const lo = pv(0), hi = pv(0.999);
    const before = selection.partyMembers.filter((m) => m.classKey === c && !m.isHero).map((m) => (typeof m.level === 'number') ? m.level : null);
    prepScenario = sc;
    sessionStorage.removeItem('dragonfighters.partyMembers');
    let err = '';
    if (typeof rc === 'number') Math.random = function () { return rc; };
    try { departToScenario(); } catch (e) { err = String(e && e.message); } finally { Math.random = R0; }
    const pm = JSON.parse(sessionStorage.getItem('dragonfighters.partyMembers') || 'null');
    return { lo, hi, before, err, after: pm ? pm.filter((m) => m.classKey === c && !m.isHero).map((m) => m.level) : null, pmN: pm ? pm.length : null };
  }, cls, (typeof rngConst === 'number') ? rngConst : null, SC_ID);
  for (let i = 0; i < 40 && !p.__nav.length; i++) await sleep(100);   // 出発の遷移は非同期 (abort で止めたことを確かめる)
  r.nav = p.__nav.slice();
  return r;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 判定 (走ったユニットの分だけ出す)
 * ══════════════════════════════════════════════════════════════════════════════ */
function mkResults() {
  const R = [];
  R.check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
    console.log((cond ? '  OK  ' : '  NG  ') + id + ' ' + name + (detail !== undefined ? '  -- ' + detail : ''));
  };
  return R;
}
const sortJ = (a) => J((a || []).slice().sort());
const rowOf = (dr, id) => ((dr && dr.rows) || []).find((r) => r.id === id) || null;
const badged = (dr) => ((dr && dr.rows) || []).filter((r) => r.badge).map((r) => r.id).sort();
const rowBrief = (r) => r ? (r.id + (r.badge ? ' ' + r.badge : '') + (r.full ? ' .full' : '') + (r.plusDisabled ? ' +無効' : ' +有効')) : '(行なし)';

function judge(ctx, R, isPlain) {
  const D = ctx.D, M = D.meta;
  const ran = (u) => ctx.ran.has(u);
  const E = (u) => ctx.unitErr[u] ? ' / ⛔ユニット例外 ' + u + ': ' + ctx.unitErr[u] : '';
  const nameOf = (ck) => (M && M.slots[ck]) ? M.slots[ck].name : '?';
  const heroLv = M ? M.heroLv : null;
  /* 職の呪文のうち「その Lv で [LvN 必要] が付くべき」集合 (酒場の skillPool の levelReq・無ければ 1)。rows = 実際に描かれた行 */
  const expBadged = (ck, lv, dr) => { const ids = new Set(((dr && dr.rows) || []).map((r) => r.id)); return M.slots[ck].spells.filter((s) => ids.has(s.id) && (s.levelReq || 1) > lv).map((s) => s.id).sort(); };

  /* ── §0 ─────────────────────────────────────────────────────────────────── */
  if (isPlain) {
    R.check('(0e)', '[装置] 変異 ' + MUT_ORDER.length + ' 本の注入点が、原本の「属する範囲」の中でちょうど 1 行 (⭐ 腐ると --negative が走る前に exit 3。素の側でも赤で見える)',
      AUDIT_BAD.length === 0, AUDIT.map((a) => a.key + '=' + a.edits.map((e) => e.line).join('+')).join(' '));
  }
  const anyRan = (us) => us.some(ran);
  if (anyRan(['P1', 'P0', 'P2', 'P2c', 'P2d', 'P2f', 'P2j', 'DIMS'])) {   // 引き出しを開くユニットが走ったときだけ
    const reads = ctx.drawerReads;
    const bad = reads.filter((x) => !(x.open && x.idx === x.want && x.sentinelGone && x.nItems >= 1
      && (['mage', 'cleric', 'elf'].indexOf(x.cls) < 0 || x.nSpellRows >= 1)));
    R.check('(0a)', '[装置] 引き出しが実際に開き (pmDrawerIdx = 押したカード・測る直前に置いた番兵が消えた)、対象職の行が 1 行以上 (呪文職は個数の行が 1 行以上)',
      reads.length >= 1 && bad.length === 0, '開いた ' + reads.length + ' 回 / 崩れ ' + bad.length + ' ' + J(bad.slice(0, 3))); }
  if (ran('meta')) {
    const want = (M && M.cap != null) ? M.cap - 1 + M.recruitMax + 1 : null;
    const tbl = M && M.namesByClass;
    const all = tbl ? [].concat.apply([], Object.keys(tbl).map((k) => tbl[k])) : [];
    const lbBody = M ? M.body['lightning-bolt'] : null;
    R.check('(0b)', '[装置] 期待値は盤面から導出: 主人公 Lv = ページの getLevelFromXP(仕込んだ XP ' + HERO_XP + ') が仲間の仕込み Lv2 より高い (差が立つ) /'
      + ' 職名 = PARTY_SLOTS / 名前表 = NPC_NAMES_BY_CLASS (職キー = ALL_CLASS_KEYS・各職 = DFRoster.CAP − 1 + RECRUIT_MAX + 1・表どうしで重複なし) /'
      + ' 本体 index.html の LB の levelReq がファイルから 1 箇所で読める',
      !!M && M.xp === HERO_XP && heroLv > 3 && M.classKeys.every((k) => M.slots[k] && M.slots[k].name)
        && !!tbl && sortJ(Object.keys(tbl)) === sortJ(M.classKeys) && Object.keys(tbl).every((k) => tbl[k].length === want) && new Set(all).size === all.length
        && !!lbBody && lbBody.heads === 1 && typeof lbBody.levelReq === 'number',
      M ? ('xp=' + M.xp + ' 主人公 Lv=' + heroLv + ' / Lv(' + DIMS_XP + ')=' + M.lvOf[1] + ' / 職名=' + J(M.classKeys.map((k) => M.slots[k] && M.slots[k].name))
        + ' / 表 ' + (tbl ? J(Object.keys(tbl).map((k) => k + ':' + tbl[k].length)) : 'なし') + ' 期待 ' + want + ' (CAP ' + M.cap + ' RECRUIT_MAX ' + M.recruitMax + ') 重複 ' + (all.length - new Set(all).size)
        + ' / 本体 LB ' + J(lbBody)) : '(meta なし)' + E('meta'));
  }
  { const bad = ctx.boots.filter((b) => !b.title || (b.missing || []).length);
    R.check('(0c)', '[装置] 開いたページが全部起動した (document.title が空でない + #72 のヘルパ 8 つが在る)',
      ctx.boots.length >= 1 && bad.length === 0, ctx.boots.length + ' ページ / 崩れ ' + bad.length + ' ' + J(bad.slice(0, 2)) + ' / 例 title=' + J((ctx.boots[0] || {}).title)); }
  if (anyRan(['P1', 'P0', 'P2', 'P2c', 'P2d', 'P2f', 'P2g', 'P2i', 'P2j', 'DIMS', 'DLG'])) {   // マッチング画面か声掛けを開くユニットが走ったときだけ
    const pl = ctx.plays.filter((x) => !(x.reached && x.sentinelGone && x.nCols === x.n && x.scFound));
    const dl = [];
    if (D.DLG) ['A1full', 'A1empty', 'A0full'].forEach((k) => { const o = D.DLG[k]; if (o) o.dlg.seats.forEach((s) => { if (s.sentinel) dl.push(k + ':' + s.k); }); });
    R.check('(0d)', '[装置] 「呼ばれた/在る」で緑にしない: 測る直前に器へ番兵を置き、本番の口が消した/書き換えた (カード列 = マッチングを開くたび・声掛けの #recruitRole = 開くたび・引き出し = (0a))。'
      + ' 以降の判定は値 (テキストの逐語 / 行の class / localStorage の値) で比べる',
      (ctx.plays.length >= 1 || ran('DLG')) && pl.length === 0 && dl.length === 0
        && (!ran('DLG') || (!!D.DLG && ['A1full', 'A1empty', 'A0full'].every((k) => D.DLG[k] && D.DLG[k].dlg.seats.length === 4))),
      'マッチング ' + ctx.plays.length + ' 回 / 崩れ ' + J(pl.slice(0, 2)) + ' / 声掛け番兵が残った ' + J(dl)); }

  /* ── §1 表示 (A1 / 撤退側は A0) ─────────────────────────────────────────────── */
  const expLv = (m, rolled) => m.isHero ? heroLv : (typeof m.level === 'number' ? Math.min(m.level, heroLv) : rolled);
  const who = (m) => m.isHero ? 'あなた' : m.name;
  if (ran('P1') && ran('P0') && ran('meta')) {
    const P1 = D.P1 || { party: [] }, P0 = D.P0 || { party: [] };
    const rows1 = (P1.cards || []).map((c) => {
      const src = c.m ? P1.party.find((x) => x.classKey === c.cls && !!x.isHero === c.m.hero && (x.isHero || x.name === c.m.name)) : null;
      const e = src ? expLv(src, c.m.level) : null;
      const ok = !!src && typeof e === 'number' && c.classFirst === nameOf(c.cls) && c.rest === nameOf(c.cls) && c.lvs.length === 1 && c.lvs[0] === 'Lv' + e
        && c.classText === nameOf(c.cls) + ' Lv' + e && c.lom === e;
      return { ok, s: c.cls + (c.m && c.m.hero ? '★' : '') + ' "' + c.classText + '" 期待 Lv' + e + ' lom=' + c.lom + (src && !src.isHero && typeof src.level !== 'number' ? ' (新顔: マッチングで振られた ' + c.m.level + ')' : '') };
    });
    const newRolled = (P1.cards || []).filter((c) => c.m && !c.m.hero && c.m.mercId === null);
    const off = (P0.cards || []).map((c) => ({ ok: c.lvs.length === 0 && c.classText === nameOf(c.cls), s: c.cls + ' "' + c.classText + '"' }));
    R.check('(1a)', '★ カードの職業行 = 職名 + " " + <.pmLv>Lv本人</.pmLv>: 先頭テキストノード = 職名 (PARTY_SLOTS)・.pmLv 1 個の逐語 = "Lv" + 本人の Lv・剥いだ残り = 職名・'
      + '本人の Lv は 主人公 = XP / 名簿の顔 = 保存 Lv を主人公 Lv で clamp / 新顔 = マッチングで振られた Lv (2 経路目 = levelOfMember)。'
      + ' 撤退 (A0 = ?whois=0 を含む) では .pmLv 0 個で職名だけ',
      !!P1.play && P1.play.reached && rows1.length === P1.party.length && rows1.every((x) => x.ok) && newRolled.length === 1 && typeof newRolled[0].m.level === 'number'
        && !!P0.play && P0.play.reached && off.length === P0.party.length && off.every((x) => x.ok),
      rows1.map((x) => (x.ok ? '' : '✗') + x.s).join(' / ') + ' ‖ A0: ' + off.map((x) => (x.ok ? '' : '✗') + x.s).join(' / ') + E('P1') + E('P0'));
    const rowsB = (P1.drawers || []).map((d) => {
      const src = d.m ? P1.party.find((x) => x.classKey === d.m.cls && !!x.isHero === d.m.hero && (x.isHero || x.name === d.m.name)) : null;
      const e = src ? expLv(src, d.m.level) : null;
      const head = src ? nameOf(src.classKey) + ' — ' + who(src) : '?';
      const ok = !!src && typeof e === 'number' && d.title === head + ' Lv' + e && d.titleFirst === head && J(d.titleLvs) === J(['Lv' + e]) && d.lom === e;
      return { ok, s: J(d.title) + ' lom=' + d.lom };
    });
    const offB = (P0.drawers || []).map((d) => { const src = d.m ? P0.party.find((x) => x.classKey === d.m.cls && !!x.isHero === d.m.hero && (x.isHero || x.name === d.m.name)) : null;
      return { ok: !!src && d.titleLvs.length === 0 && d.title === nameOf(src.classKey) + ' — ' + who(src), s: J(d.title) }; });
    R.check('(1b)', '★ 引き出しの見出し = 「職名 — 名前 LvN」(主人公は「あなた」)・N = 開いた本人の Lv: 経路1 = 見出しの文字 (先頭テキストノード + .pmDrawerLv の逐語) /'
      + ' 経路2 = levelOfMember(開いた本人)・期待値は盤面から。撤退 (A0) では .pmDrawerLv 無しの「職名 — 名前」',
      rowsB.length === P1.party.length && rowsB.every((x) => x.ok) && offB.length === P0.party.length && offB.every((x) => x.ok),
      rowsB.map((x) => (x.ok ? '' : '✗') + x.s).join(' / ') + ' ‖ A0: ' + offB.map((x) => (x.ok ? '' : '✗') + x.s).join(' / '));
  }
  if (ran('DLG') && ran('meta')) {
    const G = D.DLG || {};
    const full = (G.A1full || {}).dlg || { seats: [] }, empty = (G.A1empty || {}).dlg || { seats: [] }, off = (G.A0full || {}).dlg || { seats: [] };
    const cl = (G.A1full || {}).clamp || {};
    const rosterSeat = (s) => typeof s.mercId === 'number' && typeof s.level === 'number';
    const okFull = full.seats.length === 4 && full.seats.every((s) => rosterSeat(s) && s.role === s.label + ' Lv' + Math.min(s.level, heroLv) + ' — ' + s.trait && s.lom === Math.min(s.level, heroLv));
    const okClamp = !cl.notFound && cl.level > heroLv && cl.role === cl.label + ' Lv' + heroLv + ' — ' + cl.trait && cl.lom === heroLv;
    const okEmpty = empty.seats.length === 4 && empty.seats.every((s) => s.level === null && s.mercId === null && s.role === s.label + ' — ' + s.trait && !/Lv\d/.test(s.role));
    const okOff = off.seats.length === 4 && off.seats.every((s) => rosterSeat(s) && s.role === s.label + ' — ' + s.trait);
    R.check('(1c)', '★ 声掛けダイアログ #recruitRole: 名簿の顔 (mercId + 数値の level) =「職名 LvN — 性格」(N = 保存 Lv を主人公 Lv で clamp = levelOfMember の 2 経路・'
      + '保存 Lv > 主人公 Lv の顔は本物の drawTodaysPatrons で引いて主人公 Lv) / 初めての顔 = Lv なしの「職名 — 性格」/ 撤退 (A0) = 名簿の顔でも Lv なし',
      okFull && okClamp && okEmpty && okOff,
      '名簿の顔 ' + full.seats.map((s) => J(s.role) + ' (保存 Lv' + s.level + ')').join(' / ') + ' ‖ clamp ' + J(cl) + ' ‖ 新顔 ' + empty.seats.map((s) => J(s.role)).join(' / ')
      + ' ‖ A0 ' + off.seats.map((s) => J(s.role)).join(' / ') + E('DLG'));
    const a = (G.A1full || {}).snap || {}, b = (G.A0full || {}).snap || {};
    R.check('(1d)', '★ 傭兵名簿パネル (#rosterBody の innerHTML / #rosterSub) と卓の頭上札 (.patronLabel) が A1 (表示 ON) と A0 (?whois=0) で完全一致 (恒等)'
      + ' [装置: 名簿は満杯で .mrMeta を含む・同じ乱数の種で卓の顔ぶれが 2 腕で同じ]',
      !!a.rosterBody && a.rosterBody === b.rosterBody && a.rosterSub === b.rosterSub && J(a.labels) === J(b.labels) && (a.labels || []).length === 4
        && a.rosterBody.indexOf('mrMeta') >= 0 && J(a.seats) === J(b.seats) && (a.seats || []).length === 4,
      'rosterBody ' + (a.rosterBody || '').length + ' 字 一致=' + (a.rosterBody === b.rosterBody) + ' / sub=' + J(a.rosterSub) + ' 一致=' + (a.rosterSub === b.rosterSub)
      + ' / 札 ' + J((a.labels || []).map((l) => l.t)) + ' 一致=' + (J(a.labels) === J(b.labels)) + ' / 席 ' + J(a.seats));
  }

  /* ── §2 判定 Lv (A2 / 欠陥の再現は A0) ──────────────────────────────────────── */
  if (ran('P2') && ran('P0') && ran('meta')) {
    const P2 = D.P2 || {}, P0 = D.P0 || {};
    const body = M.body['lightning-bolt'].levelReq;
    const lbUi = (P2.mageUi || []).find((s) => s.id === 'lightning-bolt') || {};
    const on = rowOf(P2.mage, 'lightning-bolt'), off = rowOf(P0.mage, 'lightning-bolt');
    const npcLv = P2.cap ? P2.cap.npcLv : null;
    R.check('(2a)', '★★ 主人公 Lv' + heroLv + ' × 名簿の魔法使い Lv' + npcLv + ': LB の行に [Lv' + body + ' 必要] + .full (' + body + ' = 本体 index.html の levelReq をファイルから・酒場の表も同値)。'
      + ' A0 (?drawerlv=0 を含む) では出ない = 依頼書 §2-2 の欠陥の再現',
      !!P2.play && P2.play.reached && typeof body === 'number' && body > npcLv && lbUi.levelReq === body
        && !!on && on.badge === '[Lv' + body + ' 必要]' && on.full === true && on.plusDisabled === true
        && !!off && off.badge === null && off.full === false,
      'A2 ' + rowBrief(on) + ' (酒場の levelReq ' + lbUi.levelReq + ' / 本体 ' + body + ') ‖ A0 ' + rowBrief(off) + E('P2') + E('P0'));
    const pOn = P2.pressLB || {}, pOff = P0.pressLB || {};
    R.check('(2b)', '★ その状態で LB の + を押しても個数が増えない (A0 では増える = 欠陥の再現)',
      pOn.found && pOn.n1 === pOn.n0 && pOff.found && pOff.n1 === pOff.n0 + 1, 'A2 ' + J(pOn) + ' ‖ A0 ' + J(pOff));
    const cOn = P2.cap || {}, cOff = P0.cap || {};
    const mmOn = rowOf(P2.mageCap, 'magic-missile'), mmOff = rowOf(P0.mageCap, 'magic-missile');
    R.check('(2e)', '★ 枠の上限は本人基準: 仲間の Lv の上限 (getMaxSpellSlotsForClassTV(魔法使い, 仲間 Lv) = ' + cOn.capLow + ') ちょうどまで埋めると'
      + ' マジックミサイルの + が無効で増えない (主人公基準なら ' + cOn.capHero + ' まで置ける)。A0 では + が有効で増える',
      typeof cOn.capLow === 'number' && cOn.capHero > cOn.capLow && cOn.n === cOn.capLow && !!mmOn && mmOn.badge === null && mmOn.plusDisabled === true
        && !!(P2.pressMM || {}).found && P2.pressMM.n1 === P2.pressMM.n0
        && cOff.n === cOff.capLow && !!mmOff && mmOff.plusDisabled === false && !!(P0.pressMM || {}).found && P0.pressMM.n1 === P0.pressMM.n0 + 1,
      'A2 ' + J(cOn) + ' ' + rowBrief(mmOn) + ' 押す ' + J(P2.pressMM) + ' ‖ A0 ' + rowBrief(mmOff) + ' 押す ' + J(P0.pressMM));
    const rowsH = [];
    let okH = true;
    for (const ck of ['cleric', 'elf']) {
      const dOn = P2[ck], dOff = P0[ck];
      const lvOn = dOn && dOn.lom, eOn = dOn ? expBadged(ck, lvOn, dOn) : null, eOff = dOff ? expBadged(ck, heroLv, dOff) : null;
      const good = !!dOn && !!dOff && lvOn === 2 && dOn.nSpellRows === M.slots[ck].spells.length && J(badged(dOn)) === J(eOn) && eOn.length >= 1
        && J(badged(dOff)) === J(eOff) && J(eOn) !== J(eOff)
        && dOn.rows.filter((r) => r.badge).every((r) => r.full);
      if (!good) okH = false;
      rowsH.push(ck + ' Lv' + lvOn + ': [必要] の行 ' + J(badged(dOn)) + ' 期待 ' + J(eOn) + ' ‖ A0 ' + J(badged(dOff)) + ' 期待(主人公 Lv' + heroLv + ') ' + J(eOff));
    }
    R.check('(2h)', '★ 柱2 はエルフ・僧侶の NPC にも効く: Lv2 の仲間の引き出しで [LvN 必要] (+ .full) の付く行の集合 = 酒場の skillPool の levelReq > 本人の Lv から導いた集合'
      + ' (全呪文を習得にした盤面)。A0 では主人公 Lv から導いた集合 (= 依頼書 §8 の空白地帯だった)',
      okH, rowsH.join(' / '));
  }
  if (ran('P2c') && ran('meta')) {
    const X = D.P2c || {}; const r = rowOf(X.dr, 'lightning-bolt');
    const body = M.body['lightning-bolt'].levelReq;
    R.check('(2c)', '★ 仲間の魔法使いが Lv' + X.npcLv + ' (≥ 本体の levelReq ' + body + ') なら LB の行にバッジも .full も無く、+ で置ける',
      !!X.play && X.play.reached && X.npcLv >= body && !!r && r.badge === null && r.full === false && !!X.press && X.press.found && X.press.n1 === X.press.n0 + 1,
      rowBrief(r) + ' 押す ' + J(X.press) + E('P2c'));
  }
  if (ran('P2d')) {
    const X = D.P2d || {}; const a = (X.on || {}).drawers || [], b = (X.off || {}).drawers || [];
    const diff = a.map((d, i) => (b[i] && d.html === b[i].html) ? null : i).filter((i) => i !== null);
    const cond = !!X.on && X.on.heroLv >= 5;
    R.check('(2d)', '★ 恒等 (条件付き): 主人公が魔法使い・同職の仲間なし (仲間は呪文を持たない職)・主人公 Lv ≥ 5 のとき、4 枚の引き出しの innerHTML が A0 と完全一致'
      + ' (⚠ 主人公 Lv1〜4 は (α) で主人公の 1 枚が変わる / 同職の仲間が低 Lv なら (γ) で縛られる = 2a の崩れた主張 1)',
      cond && a.length === 4 && b.length === 4 && diff.length === 0 && !!(X.on.play || {}).reached && !!(X.off.play || {}).reached,
      '主人公 Lv' + (X.on || {}).heroLv + ' / 引き出し ' + a.length + '・' + b.length + ' 枚 / 食い違い ' + J(diff) + E('P2d'));
  }
  if (ran('P2f') && ran('meta')) {
    const X = D.P2f || {};
    const nm = nameOf('mage');
    const lbA2 = ((X.A2 || {}).drawers || []).map((d) => rowOf(d, 'lightning-bolt'));
    const low = 2;
    const newTxt = (n) => '⚠ ' + nm + ' ' + n + ' 人に共通・判定は' + (n === 2 ? '低い方の' : '最も低い') + ' Lv' + low;
    const oldTxt = (n) => '⚠ この設定は ' + nm + ' ' + n + ' 人に共通で適用されます';
    const notes = (k) => ((X[k] || {}).drawers || []).map((d) => d.note);
    const body = M.body['lightning-bolt'].levelReq;
    const ok = lbA2.length === 2 && lbA2.every((r) => r && r.badge === '[Lv' + body + ' 必要]' && r.full)
      && notes('A2').length === 2 && notes('A2').every((t) => t === oldTxt(2))
      && notes('N2').length === 2 && notes('N2').every((t) => t === newTxt(2))
      && notes('N3').length === 3 && notes('N3').every((t) => t === newTxt(3))
      && notes('A1').length === 2 && notes('A1').every((t) => t === oldTxt(2));
    R.check('(2f)', '★ 同職 2 人は最も低い Lv で判定: 主人公の魔法使い Lv' + heroLv + ' + 仲間 Lv2 で **両方** の引き出しの LB に [Lv' + body + ' 必要] + .full (A2)。'
      + ' 注記の逐語 (表示と判定が両方生きている N の腕): 2 人 =「' + newTxt(2) + '」/ 3 人 =「' + newTxt(3) + '」。表示か判定が 0 (A2 / A1) なら従来の「' + oldTxt(2) + '」',
      ok, 'A2 LB ' + lbA2.map(rowBrief).join(' | ') + ' / 注記 A2 ' + J(notes('A2')) + ' N2 ' + J(notes('N2')) + ' N3 ' + J(notes('N3')) + ' A1 ' + J(notes('A1')) + E('P2f'));
  }
  if (ran('P2g')) {
    const X = D.P2g || {}; const dep = X.dep || {};
    const Lm = (X.atMatch || {}).level;
    R.check('(2g)', '★★ 新顔の Lv はマッチング画面で確定し、出発で振り直さない: 画面を開いた時点で新顔の魔法使いに数値の Lv (= 本番の assignCompanionLevels を'
      + ' 同じ乱数で呼んだ値) があり、出発 (本番の departToScenario・乱数を「振り直せば必ず別の値」に固定) の後の sessionStorage の level が同じ',
      !!X.play && X.play.reached && typeof Lm === 'number' && Lm === dep.hi && dep.lo !== dep.hi && (X.atMatch || {}).lom === Lm
        && !dep.err && (dep.nav || []).length >= 1 && J(dep.after) === J([Lm]),
      '画面の Lv=' + Lm + ' (lom ' + (X.atMatch || {}).lom + ') / 帯の端 下=' + dep.lo + ' 上=' + dep.hi + ' / 出発後=' + J(dep.after) + ' / 遷移 ' + (dep.nav || []).length + (dep.err ? ' ERR ' + dep.err : '') + E('P2g'));
  }
  if (ran('P2i')) {
    const X = D.P2i || {}; const per = (X.truth || {}).per || [];
    const cl = (X.cards || []).filter((c) => c.cls === 'cleric');
    const rows = cl.map((c) => { const t = per.find((p) => p.i === c.i) || {}; return { ok: !!t.fn && c.skills === t.fn && t.fn === t.tbl, s: (c.m.hero ? '★' : '') + 'Lv' + t.lv + ' "' + c.skills + '" 期待 "' + t.fn + '"' }; });
    const hero = per.find((p) => p.cls === 'cleric' && p.hero) || {}, npc = per.find((p) => p.cls === 'cleric' && !p.hero) || {};
    R.check('(2i)', '★ 僧侶のカードの「技」行 = **本人の Lv** の集合: 主人公の僧侶 = 主人公 Lv・名簿の僧侶 Lv2 = Lv2 (期待値 = 同じページの getClericSlotsTV(本人の Lv) と'
      + ' CLERIC_SLOTS_TABLE の直読みの 2 経路。⛔「・」で割らない = 連結文字列で比べる) [装置: 2 人の集合が違う盤面]',
      !!X.play && X.play.reached && cl.length === 2 && rows.every((x) => x.ok) && !!hero.fn && !!npc.fn && hero.fn !== npc.fn,
      rows.map((x) => (x.ok ? '' : '✗') + x.s).join(' / ') + E('P2i'));
  }
  if (ran('P2j')) {
    const X = D.P2j || {}; const HP = J(['hold-person', 'hold-person']);
    const Mm = X.M || {}, H = X.H || {};
    const okM = !!Mm.play && Mm.play.reached && J(Mm.t0) === HP && J(Mm.t1) === HP && J(Mm.t2) === HP && J(Mm.t3) === HP
      && (Mm.apVals || []).filter((v) => v === 'hold-person').length === 2 && !!Mm.holdAt && Mm.holdAt.lv2 === 0 && Mm.holdAt.hero > 0;
    const okH = !!H.reached && J(H.t0) === HP && J(H.t1) === HP && J(H.t2) === HP && (H.mem || []).indexOf('cleric★:-') === 0 && (H.mem || []).indexOf('cleric:2') >= 1
      && (H.clericAp || []).length === 2 && H.clericAp.every((v) => v.filter((x) => x === 'hold-person').length === 2);
    R.check('(2j)', '★★ 保存済みの僧侶の傾向 (general / boss = hold-person) が消えない: M = マッチング → 僧侶 Lv2 の引き出し → 全員の引き出しの後も localStorage と select が hold-person /'
      + ' H = 主人公が僧侶 + 名簿の僧侶 Lv2 を **本番の openPrep** で (見えない準備画面の描画で消えていた経路) → 両方の僧侶の引き出しの後も残る'
      + ' [装置: hold-person は Lv2 の自動配分に無い = 絞れば消える盤面]',
      okM && okH,
      'M ' + J([Mm.t0, Mm.t1, Mm.t2, Mm.t3]) + ' select ' + J(Mm.apVals) + ' holdAt ' + J(Mm.holdAt) + ' ‖ H reached=' + H.reached + ' 編成 ' + J(H.mem) + ' ' + J([H.t0, H.t1, H.t2]) + ' select ' + J(H.clericAp) + E('P2j'));
  }
  if (ran('meta') && M) {
    const rows = M.mageUi.filter((s) => M.body[s.id] && M.body[s.id].heads === 1 && typeof M.body[s.id].levelReq === 'number')
      .map((s) => ({ id: s.id, tv: s.levelReq, body: M.body[s.id].levelReq }));
    const bad = rows.filter((r) => r.tv !== r.body);
    R.check('(2k)', '★ (α) 酒場の呪文表 MAGE_SKILLS_UI の levelReq が本体 index.html (ファイルから読んだ値) と同値 (本体に levelReq がある呪文すべて)',
      rows.length >= 3 && bad.length === 0 && rows.some((r) => r.id === 'lightning-bolt'),
      rows.map((r) => r.id + ' 酒場 ' + r.tv + ' / 本体 ' + r.body).join(' / '));
  }

  /* ── §3 名前とジョブ (A3) ───────────────────────────────────────────────────── */
  if (ran('S3') && ran('meta')) {
    const S = D.S3 || {}; const c = S.col || { src: {} }, r = S.colRt || { src: {} };
    const srcOk = (o, s) => !!o.src[s] && o.src[s].n > 0 && o.src[s].notInList === 0;
    R.check('(3a)', '★ 新しく作られた NPC の名前がその職の名前表に含まれる (表はページの NPC_NAMES_BY_CLASS を読む): makeNpcMember / pickCompanion / 既定の卓 drawTodaysPatrons /'
      + ' ?recruittalk=0 の buildParty / regeneratePartyMembers',
      !!c.has && srcOk(c, 'makeNpcMember') && srcOk(c, 'pickCompanion') && srcOk(c, 'drawTodaysPatrons') && srcOk(r, 'buildParty') && srcOk(r, 'regeneratePartyMembers'),
      J(Object.keys(c.src).map((k) => k + ' ' + c.src[k].n + '/外 ' + c.src[k].notInList)) + ' ‖ rt0 ' + J(Object.keys(r.src).map((k) => k + ' ' + r.src[k].n + '/外 ' + r.src[k].notInList)) + E('S3'));
    const uni = {};
    [c, r].forEach((o) => Object.keys(o.seen || {}).forEach((n) => { uni[n] = Object.assign(uni[n] || {}, o.seen[n]); }));
    const multi = Object.keys(uni).filter((n) => Object.keys(uni[n]).length > 1);
    R.check('(3b)', '★ 名前 → 職業が単射 (既定の卓 + ?recruittalk=0 の buildParty で集めた新顔の名前) + どの職も表の名前を全部使う (抽選が表の一部に偏って止まっていない)',
      multi.length === 0 && Object.keys(uni).length >= M.classKeys.length * ((M.cap || 0) - 1 + M.recruitMax + 1) && c.coverFull === true && r.coverFull === true,
      '名前 ' + Object.keys(uni).length + ' 種 / 2 職に出た名前 ' + multi.length + ' ' + J(multi.slice(0, 4)) + ' / 職ごとの種類 ' + J(c.perClassDistinct));
    const ga = S.genA || {}, gb = S.genB || {}, gr = S.genRt || {}, sa = S.setA || {}, sb = S.setB || {};
    const mageNew = (gb.newNames || []).filter((k) => k.indexOf('mage:') === 0);
    R.check("(3b')", '★★ 名簿・約束に居る名前 (旧規則の顔 = 共有 16 名の先頭 8 名を表と別の職で名簿へ + 約束 2 人) を新顔が使わない (makeNpcMember / pickCompanion / 卓 / ?recruittalk=0 の buildParty) /'
      + ' 上限の盤面 (名簿に魔法使い CAP−1 人 + 約束に魔法使いの新顔 RECRUIT_MAX 人) では新しい魔法使いが必ず「残った 1 名」',
      !!sa.roster && sa.roster.length === 8 && (sa.cands || []).length === 2 && ga.n > 0 && ga.coll === 0 && ga.notInList === 0 && ga.errs === 0
        && gr.n > 0 && gr.coll === 0 && gr.dupInFormation === 0 && gr.errs === 0
        && !!sb.roster && sb.roster.length === M.cap - 1 && (sb.cands || []).length === M.recruitMax && mageNew.length === 1 && mageNew[0] === 'mage:' + sb.left && gb.coll === 0,
      '旧規則 ' + J(sa.roster) + ' 約束 ' + J(sa.cands) + ' → 新顔 ' + ga.n + ' 人 衝突 ' + ga.coll + ' ' + J(ga.ex) + ' / rt0 ' + gr.n + ' 人 衝突 ' + gr.coll
      + ' / 上限の盤面: 新しい魔法使いの名前 ' + J(mageNew) + ' 残り=' + sb.left);
  }
  if (ran('P0') && ran('meta')) {
    const P0 = D.P0 || {}; const n = P0.names || { src: {} }; const g = P0.genA || {};
    const oldOnly = Object.keys(n.src).length >= 3 && Object.keys(n.src).every((s) => n.src[s].n > 0 && n.src[s].notInOld === 0);
    R.check('(3c)', '★ 撤退 (A0 = ?namejob=0 を含む) では従来どおり共有 16 名 (NPC_NAMES) から引く: 生成口 3 つの新顔の名前がすべて NPC_NAMES・名前 → 職業は単射でない・'
      + '旧規則の名簿と同名の新顔が出る (= 0e8370d の姿。比較器が空振りしないことの対照も兼ねる)',
      n.nj === false && oldOnly && (n.multi || []).length > 0 && g.coll > 0,
      J(Object.keys(n.src).map((k) => k + ' ' + n.src[k].n + '/16 名の外 ' + n.src[k].notInOld)) + ' / 2 職に出た名前 ' + (n.multi || []).length + ' / 名簿と同名 ' + g.coll + '/' + g.n + E('P0'));
  }
  if (ran('S3d')) {
    const X = D.S3d || {}; const rc = X.recruit || {}, dp = X.depart || {};
    const pmOk = (dp.pmKeys || []).length >= 2 && dp.pmKeys.every((k) => k === 'H:' + dp.heroRef || k === 'N:' + dp.npcRef);
    R.check('(3d)', '★★ 名簿・約束の保存物: 旧規則の名簿 (同名の別人 2 人を含む・recordRun 済み) と約束を本番の口で作って仕込み、酒場の読み込み・抽選・新顔の生成の後も'
      + ' 1 バイトも変わらない / 声掛けで約束へ足しても既存は不変で、足した 1 件のキー集合と値の型は本番が作った新顔の約束と同じ /'
      + ' 出発の後も名簿の既存は不変 (同名の 2 人も残る = 移行しない)・新しい名簿の人と partyMembers のキー集合は従来の形 (makeHeroMember / makeNpcMember + level (+ mercId))',
      !!X.afterLoad && X.afterLoad.r && X.afterLoad.c && !!X.afterGen && X.afterGen.r && X.afterGen.c && X.afterGen.n > 0
        && !rc.err && rc.oldSame && rc.n === rc.n0 + 1 && J(rc.newSig) === J(rc.refSig) && (rc.newSig || []).length === 1
        && !dp.err && dp.oldSame && dp.rosterTop === dp.rosterTopOld && (dp.newKeys || []).length >= 1 && dp.newKeys.every((k) => dp.oldKeys.length === 1 && k === dp.oldKeys[0])
        && dp.dupNames >= 1 && pmOk && (X.nav || []).length >= 1,
      '読み込み ' + J(X.afterLoad) + ' 抽選 ' + J(X.afterGen) + ' / 声掛け ' + J({ n0: rc.n0, n: rc.n, oldSame: rc.oldSame, newSig: rc.newSig, refSig: rc.refSig })
      + ' / 出発 ' + J({ oldSame: dp.oldSame, n: [dp.nOld, dp.nNow], newKeys: dp.newKeys, oldKeys: dp.oldKeys, dup: dp.dupNames, pm: dp.pmKeys, heroRef: dp.heroRef, npcRef: dp.npcRef })
      + ' / 遷移 ' + (X.nav || []).length + (dp.err ? ' ERR ' + dp.err : '') + E('S3d'));
  }

  /* ── §4 恒等 ────────────────────────────────────────────────────────────────── */
  if (ran('P0') && ran('meta')) {
    const P0 = D.P0 || {}; const parts = [];
    const pa = (P0.cards || []).length === 4 && P0.cards.every((c) => c.lvs.length === 0 && c.classText === nameOf(c.cls))
      && (P0.drawers || []).length === 4 && P0.drawers.every((d) => d.titleLvs.length === 0);
    parts.push('① Lv 表示なし ' + pa);
    const ui = {}; (P0.mageUi || []).forEach((s) => { ui[s.id] = s.levelReq; });
    const onUi = {}; M.mageUi.forEach((s) => { onUi[s.id] = s.levelReq; });
    const changed = Object.keys(onUi).filter((k) => onUi[k] !== ui[k]);
    const pb = ui['lightning-bolt'] === null && changed.indexOf('lightning-bolt') >= 0 && changed.every((k) => ui[k] === null);
    parts.push('② (α) なし ' + pb + ' (外れた levelReq ' + J(changed) + ')');
    const mmCap = rowOf(P0.mageCap, 'magic-missile');
    const pc = ['mage', 'cleric', 'elf'].every((ck) => !!P0[ck] && J(badged(P0[ck])) === J(expBadged(ck, heroLv, P0[ck])))
      && !!P0.cap && P0.cap.n === P0.cap.capLow && !!mmCap && mmCap.plusDisabled === false;
    parts.push('③ 判定と枠は主人公 Lv ' + pc);
    const elfAt = (P0.selAtMatch || []).find((m) => m.cls === 'elf') || {};
    const dep = P0.dep || {};
    const pd = elfAt.level === null && (dep.after || []).length === 1 && typeof dep.after[0] === 'number' && dep.after[0] >= dep.lo && dep.after[0] <= dep.hi && (dep.nav || []).length >= 1;
    parts.push('④ 新顔の Lv は出発で振る ' + pd + ' (画面 ' + elfAt.level + ' → 出発 ' + J(dep.after) + ' 帯 ' + dep.lo + '..' + dep.hi + ')');
    const ct = (P0.clericTruth || {}).per || [];
    const pe = (P0.cards || []).filter((c) => c.cls === 'cleric').length === 1 && (P0.cards || []).filter((c) => c.cls === 'cleric').every((c) => { const t = ct.find((x) => x.i === c.i) || {}; return !!t.heroFn && c.skills === t.heroFn; })
      && ct.some((x) => x.cls === 'cleric' && !x.hero && x.fn && x.fn !== x.heroFn);
    parts.push('⑤ 僧侶のカード = 主人公 Lv の集合 ' + pe);
    const n = P0.names || { src: {} };
    const pf = n.nj === false && Object.keys(n.src).length >= 3 && Object.keys(n.src).every((s) => n.src[s].notInOld === 0);
    parts.push('⑥ 名前は共有 16 名 ' + pf);
    R.check('(4a)', '★★★ 恒等 — 3 本とも 0 (?whois=0&drawerlv=0&namejob=0) は着手前 0e8370d の姿: ① カード・見出しに Lv が無い ② 酒場の呪文表に (α) の levelReq が無い'
      + ' ③ 魔法使い・僧侶・エルフの判定と枠の上限は主人公 Lv ④ 新顔の Lv はマッチング画面では無く出発で振られる ⑤ 僧侶のカードは主人公 Lv の集合 ⑥ 名前は共有 16 名',
      pa && pb && pc && pd && pe && pf, parts.join(' / ') + E('P0'));
  }
  if (ran('DIMS')) {
    const X = D.DIMS || {}; const rows = [];
    let ok = true;
    for (const vp of DIMS_VPS.map((v) => v.tag)) {
      const a = X[vp + '_on'], b = X[vp + '_off'];
      const good = !!a && !!b && a.cards.length === 4 && b.cards.length === 4 && a.drawers.length === 4 && b.drawers.length === 4
        && a.cards.every((c) => c.lvs.length === 1) && b.cards.every((c) => c.lvs.length === 0)
        && a.drawers.every((d) => d.titleLvs.length === 1) && b.drawers.every((d) => d.titleLvs.length === 0)
        && J(a.cards.map((c) => [c.h, c.classH])) === J(b.cards.map((c) => [c.h, c.classH]))
        && J(a.drawers.map((d) => [d.h, d.sh, d.ch, d.titleH])) === J(b.drawers.map((d) => [d.h, d.sh, d.ch, d.titleH]));
      if (!good) ok = false;
      rows.push(vp + (good ? ' ✓' : ' ✗') + ' カード ' + (a ? J(a.cards.map((c) => c.h)) : '-') + ' / ' + (b ? J(b.cards.map((c) => c.h)) : '-')
        + ' 職業行 ' + (a ? J(a.cards.map((c) => c.classH)) : '-') + ' 引き出し ' + (a ? J(a.drawers.map((d) => [d.h, d.titleH])) : '-') + ' / ' + (b ? J(b.drawers.map((d) => [d.h, d.titleH])) : '-'));
    }
    R.check('(4b)', '★★ Lv の表示の有無でカード・職業行・引き出し (rect.h / scrollHeight / clientHeight)・見出しの高さが 1px も変わらない: 最悪の見出し「ドワーフ — ガウェイン Lv10」を含む編成を'
      + ' A1 (表示 ON) と A0 (?whois=0) で 4 画面 (1280x900 / 1366x768 / 390x844 / 390x667・viewport は幅と高さだけ) [装置: A1 は .pmLv 4 個 + 見出しの Lv 4 個・A0 は 0 個]',
      ok, rows.join(' / ') + E('DIMS'));
  }
  R.check('(0f)', '[装置] 開いたページで pageerror / console.error が 0 件 (favicon の 404 は除外)', ctx.errs.length === 0, ctx.errs.slice(0, 4).join('  |  ') || '(なし)');
}

function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed: passed, failed: failed };
}

async function runUnits(browser, port, units, R, label, isPlain) {
  const ctx = { browser, port, seq: 0, D: {}, ran: new Set(), unitErr: {}, boots: [], plays: [], drawerReads: [], errs: [], pages: [] };
  const list = ['meta'].concat(UNIT_ORDER.filter((u) => u !== 'meta' && units.indexOf(u) >= 0));
  for (const u of list) {
    const t0 = Date.now();
    ctx.ran.add(u);
    try { await UNITS[u](ctx); }
    catch (e) { ctx.unitErr[u] = String((e && e.message) || e).slice(0, 300); console.log('  ⛔ ユニット ' + u + ' 例外: ' + ctx.unitErr[u]); }
    for (const p of ctx.pages) { if (!p.isClosed()) { for (const e of (p.__errs || [])) ctx.errs.push(p.__tag + ' :: ' + e); await p.close().catch(() => {}); } }
    ctx.pages = [];
    console.log('[vmi] ' + label + ' ユニット ' + u + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
  }
  judge(ctx, R, isPlain);
  return ctx;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_memberid_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ALL = UNIT_ORDER.slice();
  let exitCode = 0;
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      const need = Array.from(new Set([].concat.apply([], order.map((k) => MUTATIONS[k].units))));
      /* 素の基準 (変異が使うユニットだけ)。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない (#71 の m8 = 赤の上では担当の判定が無条件に真へ縮退する)。 */
      const srv0 = await startServer(PORT, null);
      const R0 = mkResults();
      await runUnits(browser, PORT, need, R0, '(素・基準)', true);
      await stopServer(srv0);
      const s0 = summarize(R0, '[素・基準 ' + need.join(',') + ']');
      if (s0.failed) {
        console.error('[vmi] ⛔ 素の基準で FAIL がある — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const srv = await startServer(port, key);
          console.log('\n[vmi] ════════ 変異 ' + key + ' (port ' + port + ' / tavern:' + auditMutation(key).edits.map((e) => e.line).join('+') + ' / ユニット ' + MUTATIONS[key].units.join(',') + ') ════════');
          const R = mkResults();
          let ctx = null;
          try { ctx = await runUnits(browser, port, MUTATIONS[key].units, R, '[変異 ' + key + ']', false); }
          catch (e) { console.log('  ⛔ ドライバ例外: ' + String((e && e.message) || e)); }
          await stopServer(srv);
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0c = R.filter((r) => r.id === '(0c)')[0];
          /* ⭐ 起動確認 = (0c) が緑 (開いたページが全部起動し、#72 のヘルパが在る) = 構文破壊で全部赤になる偽の検出を見分ける。 */
          const bootOk = !!ctx && !!r0c && r0c.ok;
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const ok = bootOk && want.length > 0 && miss.length === 0;
          console.log('[vmi] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(',') + ' / 起動確認 ' + (bootOk ? 'OK' : 'NG')
            + ' → ' + (ok ? '✓ OK' : '✗ ' + (bootOk ? '空振り ' + miss.join(',') : '起動確認 NG')));
          report.push({ key, want, red, ok, bootOk });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(12) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + r.red.join(',') + ' / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vmi] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
        else console.error('[vmi] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const srv = await startServer(port, MUTATE);
      const R = mkResults();
      await runUnits(browser, port, UNITS_ARG.length ? UNITS_ARG : ALL, R, '[変異 ' + MUTATE + ' (手回し)]', false);
      await stopServer(srv);
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vmi] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const srv = await startServer(PORT, null);
      const R = mkResults();
      await runUnits(browser, PORT, UNITS_ARG.length ? UNITS_ARG : ALL, R, '(素)', true);
      await stopServer(srv);
      const s = summarize(R, '');
      exitCode = s.failed ? 1 : 0;
    }
  } catch (e) {
    console.error('[vmi] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[vmi] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
