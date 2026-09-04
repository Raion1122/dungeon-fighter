#!/usr/bin/env node
/*
 * verify_cone_cast.js — 円錐呪文の発射率 (#50 バーニングハンズが撃たれない)
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-04_cone-spell-cast-rate.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§6 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_roll_target.js の項目 1 コミット bbcb091)。
 *
 * ■ 項目 1 (このコミット) で足したもの — **§0 装置 (0a)〜(0d) だけ**
 *     (0a) 装置   … window.__cone が実在し pickConeDirection / coneTilesFrom /
 *                   CONE_CAST_ON / CONE_REACH_TILES の 4 つが取れる
 *                   ⭐⭐⭐ これが無いと §1〜§4 の全 assert が「関数が無いので false」で空振りする
 *     (0b) 母集団 … 合成盤面の標本が 200 件以上あり、そのうち
 *                   **「4 方向・拒否権あり」では撃てないが「8 方向・2 段」では撃てる**標本が 50 件以上
 *                   ⭐ 差の出ない盤面で測ると (2a)(2b) が自明に緑になる
 *                   ⭐⭐⭐ **本番実装の有無に依存しない** — 差の件数は
 *                     **ドライバが独立に持つ旧/新アルゴリズムの鏡**で算出する。
 *                     よって (0b) は項目 1 の時点から緑にできる (盤面の質を測る assert)。
 *     (0c) 母集団 … 実プレイ 90 秒で window.__aoeStats["バーニングハンズ"].attempts >= 5
 *                   ⭐ **経路が本当に走っている**ことの直接証明。0 件なら仕込みが失敗している
 *     (0d) 母集団 … 魔法使いの equippedSkills に "burning-hands" があり spellSlots が 1 以上
 *
 *   ⛔ §1〜§6 は**この項目では実装しない** (項目 2 の担当)。全部 PENDING で並べてある。
 *   ⭐⭐⭐ **項目 1 の時点では本番 (index.html) に window.__cone も新ヘルパーも無いので、
 *     (0a) が赤いのが正しい。** 赤いこと自体は失敗ではない。
 *     ⚠ ただし「なぜ赤いか」がログから読めること — (0a) の detail に
 *       `typeof window.__cone` と各キーの typeof をそのまま出す。
 *
 * ■ ⚠⚠⚠ §0 の全ガードに共通の規則 — **母集団が立たなかったら「スキップして緑」にしない**
 *   母集団が偽になったら、そのガード自身を FAIL にし、それを母集団とする本体の assert も
 *   FAIL にする (popFail が `population: none` を detail に出す = 「測れないから赤」と
 *   「値が悪いから赤」を記録の上で区別する)。#43/#44 の教訓。
 *
 * ■ ⭐⭐⭐ 計測は実プレイに頼らない (依頼書 §8「測り方の方針」)
 *   探索は Math.random を 1 度も引かない**純粋な関数**なので、実プレイの運に頼らずに測れる。
 *   実マップ・実 partyInArea / enemiesInArea の上に、**決定論 LCG** で
 *   「敵の塊 + その手前に前衛 + さらに後ろに術者」を大量に敷き、pickConeDirection を直接叩く
 *   (tools/driver_field_step7.js の標本生成の流儀)。
 *   実プレイが要るのは §0 の (0c)(0d) と (5a)(5b) だけ。
 *   ⚠ [[project-headless-verification]] の実測 = 実プレイ系ドライバを他の headless Chrome と
 *     並走させると偽の赤が出る (run_chronicle 73/73 が並走で 71/73)。**逐次で走らせること**。
 *
 * ■ ⭐⭐⭐ 鏡 (mirror) の作り方 — ⛔ 本番のソースを見ながら写経しない
 *   - legacyPick … **依頼書 §2-2 に引用された擬似コード**から起こす (4 方向 / 拒否権が絶対 /
 *                  break での短絡 / cnt > bestCount)。項目 2 の (1a) がこれと突き合わせる。
 *   - neoPick    … **依頼書 §1 のユーザー決定**(8 方向 / 清潔な方向を先に探し、1 つも無いときだけ
 *                  味方入りを許す 2 段構え)から起こす。⛔ §4 のコード片を写経しない。
 *   ⭐ 両方をドライバが持つので、(0b) の「差が 50 件以上」は本番の実装が 1 行も無くても測れる。
 *
 * ■ ⭐⭐⭐ 配信バイトは **起動時に 1 回だけ読んで凍結する** (下の SRC / MUT_SRC)。
 *   別窓が index.html を保存しても、走行中に混合ビルドにならない。
 *   ⛔ **本番ファイルは 1 バイトも書き換えない**。負のコントロールはメモリ上の
 *      スナップショットへ注入し、変異ポートからだけ配る。
 *   ⚠ index.html は **CRLF**。'\n' で split したら各行末の '\r' を trim してから比較し、
 *     書き戻す行には '\r' を付け直す (先例: driver_action_priority.js editIndexLines)。
 *     → 下の mutLines() がその作法を 1 本にまとめてある (項目 3 の transform 用)。
 *     ⚠ from/to の逐語置換を使う変異は **置換文字列を 1 行に閉じる**こと
 *       (複数行アンカーは CRLF/LF の食い違いで必ず空振りする)。
 *
 * ■ ⚠ 魔法使いにバーニングハンズを持たせるには **遷移前**に仕込む (依頼書 §2-7)
 *   実物を index.html で確かめた結果 (2026-09-04 実測):
 *     - localStorage["dragonfighters.knownSpells"]  = { mage:[...], cleric:[...], elf:[...] }
 *       … loadKnownSpells (index.html:12496) が DEFAULT_KNOWN と**和集合**にする。
 *         mage の既定は ["magic-missile","fire-bolt","arcane-shield"] = burning-hands は入っていない。
 *     - localStorage["dragonfighters.partySkills"]  = { mage:["burning-hands", …] } (**配列**)
 *       … normalizePartySkillsMap (index.html:32939) が配列 → { id: 個数 } へ畳む。
 *         initAllySpellSlots (index.html:12846) が個数を呪文スロットへ配り、
 *         **equippedSkills = Object.keys(allocMap)** になる。
 *   ⚠ Lv3 の魔法使いの呪文スロット上限は **5** (SPELL_SLOT_CURVE_MAGE[3] = 5)。
 *     burning-hands ×4 + magic-missile ×1 = 5 でちょうど収まる (超えると黙って切られる)。
 *   ⚠ さらに **sessionStorage["dragonfighters.partyMembers"]** で編成に mage を入れる。
 *     入れないと buildParty (index.html:12393) がランダムに組むので、
 *     魔法使いが 1 人も来ない run が出る。
 *   **どれか 1 つでも欠けると equippedSkills に入らず、全 assert が空振りする。**
 *
 * ■ ⚠ 実プレイのアーム = `?autoplay=30&diag=1` /
 *     sessionStorage["dragonfighters.currentScenario"] = "goblin-mine" / xp=3000 (Lv3)
 *   (依頼書 §8「⚠ 計測機構」。起草時の実測もこの条件で採られている)
 *   ⚠ ?diag=1 は index.html:3329 で ?autoplay と OR されるので実質的な差は無いが、
 *     依頼書が名指ししているのでそのまま揃える。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   味方が円錐に何人まで入ってよいかの上限 / mageAI の梯子の閾値と fallbackOrder /
 *   ダメージ量・セーヴ DC・エフェクトの見た目。
 *
 * ■ ⚠ ポート **9940** (変異 9941〜9958 = 18 枠 / 予備 9959 / 撤退アームの基準ページ 9960)。
 *   依頼書 §2-7 の実測 = 既存ドライバが使う番号の最大は 9880 (#49 が 9880 + 変異 9881-9896
 *   + 予備 9897 + 撤退 9898 を占有)。⭐ #47/#48 の教訓どおり **base だけでなく `--negative` の
 *   レンジまで数えた**。**9900〜9999 は衝突 0 本**。
 *   ⭐ PORT_OF[k] = PORT + 1 + i なので **変異を 1 本足すごとに占有が 1 つ伸びる**。
 *   ⭐ 項目 1 が実際に listen するのは **9940 の 1 本だけ** (変異が 1 本も実装されておらず、
 *     撤退アームを見る (1a)(6a) もまだ PENDING のため)。番号だけ先に予約してある。
 *   ⛔ 他のドライバのポートは 1 つも触らない。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⭐ 項目 3 で **14 本すべて impl: true** にする。1 本ずつ別ポートから
 *     「欠陥入りの index.html」を配り、担当の assert が**実際に赤くなる**ことを機械証明する。
 *   ⚠⚠⚠ 変異は「仕様の言葉」ではなく「その assert が実際に読む値の供給口」へ当てる
 *     (#47 の taintlabel の教訓)。**注入点がちょうど 1 箇所見つからなければ走らせる前に exit 3**。
 *   ⚠ 「1 行消す」で終わらせず、消して欠陥が実際に発現するかまで筋を追う。
 *     vetoback は特に注意 —— **only4dir と効果が重なる**ので、
 *     **片方だけを注入したときに (2a) が赤くなるか**を 1 本ずつ確認すること。
 *   ⚠ 変異が原理的に赤にできないと分かったら、#38/#43/#45 の作法どおり
 *     **変異のほうを作り替える** (assert を緩めない)。その経緯は依頼書 §12 に必ず書く。
 *
 * 使い方:
 *   node tools/verify_cone_cast.js               # 受入条件 (素の配信)
 *   node tools/verify_cone_cast.js --negative    # 負のコントロール (項目 3 で実装)
 *   node tools/verify_cone_cast.js --mutate seamonly   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える (2026-08-12 の実測)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9940'), 10);

/* ── CRLF 安全な行編集 (項目 3 の transform 用ヘルパー) ────────────────────────
 * ⚠⚠ index.html はディスク上 **CRLF**。'\n' 決め打ちで split すると各行末に '\r' が残るので、
 *    比較は trim してから行い、書き戻す行には '\r' を付け直す
 *    (先例: tools/driver_action_priority.js の editIndexLines)。
 * 返り = { body, hits } / 当たらなければ hits === 0 (呼び出し側が exit 3 にする)。 */
function mutLines(body, fn) {
  const eol = body.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lines = body.split('\n').map(s => s.replace(/\r$/, ''));
  const trimCR = (s) => String(s).trim();
  const hits = fn(lines, trimCR) | 0;
  return { body: lines.join(eol), hits: hits };
}

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (依頼書 §8 の変異表 14 行。⭐ 項目 1 では **全部 impl: false = PENDING**)
//   ⛔ MUT_ORDER には常に 14 本並べる = --negative が「実装を忘れた変異」を件数から隠さない。
//   ⭐ `plan` = 項目 3 への申し送り (どこへ何を当てる予定か)。⚠ **実測で数え直してから**
//     from/to へ昇格させること。plan のまま impl: true にしてはいけない。
//
//   ⭐⭐⭐ 依頼書 §2-2 / §2-4 / §4 の ⚠⚠ が、それぞれ vetoback / reachdrift / nobreak
//     としてこの表に内蔵されている。起草中にしか見えなかった知見が、実装後も
//     機械で守られる唯一の形。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  vetoback: { impl: false, file: 'index.html', targets: ['2a'],
    plan: 'STEP1 の `const passes = CONE_CAST_ON ? [0, 1] : [0];` を `[0]` 固定へ。'
      + ' ⚠ only4dir と効果が重なるので **片方だけ注入して (2a) が赤くなるか**を 1 本ずつ確かめる',
    why: '⭐ 依頼書 §2-2 の罠の再現 — 味方入りパスを消す (「起きえない誤射」を防ぐために発射率を捨てる)' },

  only4dir: { impl: false, file: 'index.html', targets: ['2a'],
    plan: 'STEP1 の `const dirs = CONE_CAST_ON ? CONE_DIRS_8 : CONE_DIRS_4;` を CONE_DIRS_4 固定へ',
    why: '斜め 4 方向を消す (依頼書 §2-5 の実測 = これだけでは 20.4% 止まり)' },

  dirtyfirst: { impl: false, file: 'index.html', targets: ['2b'],
    plan: 'STEP1 の passes を `[1, 0]` へ逆順にする',
    why: '常に味方入りを先に採る (「味方入りを許す」を「常に味方入りを選ぶ」と取り違える実装)' },

  nobreak: { impl: false, file: 'index.html', targets: ['1a'],
    plan: 'STEP1 の `if (pass === 0) { rejected = true; break; }` から break を落として'
      + ' `rejected = true;` だけにする',
    why: '⭐ 依頼書 §4 の ⚠⚠ の再現 — 清潔パスの短絡を消すと cnt が最後まで足され、'
      + ' 従来コード (break した時点の中途半端な cnt) と最良方向の選び方がずれる' },

  zerofoe: { impl: false, file: 'index.html', targets: ['2c'],
    plan: 'STEP1 の `if (cnt <= 0) continue;` を消す',
    why: '敵 0 体の方向を採る (呪文を空撃ちする)' },

  noadvance: { impl: false, file: 'index.html', targets: ['3a'],
    plan: 'STEP3 の `await allyAdvanceTowardPoint(ally, ex, ey);` を allyBasicAttack へ戻す。'
      + ' ⚠ allyBurningHands 側と allyConeOfCold 側で**同じ行が 2 本**になる見込み →'
      + ' from/to が一意にならないので transform + mutLines で狙った 1 本だけ差し替える',
    why: '「詰め寄る」を消す (依頼書 §2-5 の残り 35% が回収されない)' },

  alwaysadvance: { impl: false, file: 'index.html', targets: ['3b'],
    plan: 'STEP3 の `dist <= rangeTiles` を条件から外す',
    why: '射程外でも歩き続ける (medium=8 マスの外の敵へ無限に寄る)' },

  advadjacent: { impl: false, file: 'index.html', targets: ['3c'],
    plan: 'STEP3 の `dist > CONE_REACH_TILES` を条件から外す',
    why: '隣接しているのに円錐へ入らない盤面でも歩く (その場で足踏みする)' },

  reachdrift: { impl: false, file: 'index.html', targets: ['3a', '3c'],
    plan: 'coneTilesFrom の `step <= CONE_REACH_TILES` を `step <= 4` の直書きへ'
      + ' (CONE_REACH_TILES は 3 のまま)',
    why: '⭐ 依頼書 §4 の「⚠ coneTilesFrom の上限と STEP3 の距離判定が **この 1 本**を読む」の再現 —'
      + ' 円錐の実効射程と STEP3 の距離判定が食い違う' },

  retreatdead: { impl: false, file: 'index.html', targets: ['6a'],
    plan: '`const CONE_CAST_ON =` の**次行の式**を `true;` へ (const の行は他所と紛れるので式の行を狙う)',
    why: '撤退スイッチを殺す (?conecast=0 が効かない)' },

  coldstale: { impl: false, file: 'index.html', targets: ['4a', '4b'],
    plan: 'allyConeOfCold の `const best = pickConeDirection(aTX, aTY);` だけを旧探索ブロックへ戻す'
      + ' (transform + mutLines で 4 方向 + 拒否権の写しを差し込む)',
    why: 'コーンオブコールドだけ 1 本化から取り残される (探索が 2 本に戻る)' },

  seamonly: { impl: false, file: 'index.html', targets: ['0a'],
    plan: '`window.__cone = {` の行を `window.__coneREMOVED = {` へ',
    why: '⭐ 検証シームを消す (装置そのものが立たない = (0a) の存在理由)' },

  noknown: { impl: false, file: 'driver', targets: ['0c', '0d'],
    plan: '⭐ **ドライバ側の変異** — 仕込む knownSpells から "burning-hands" を抜く'
      + ' (seedPayload({ dropKnown: true }) が既に実装済)。'
      + ' ⚠ 期待側でなく**測定側**を切り替えるので playOpts で渡す'
      + ' (#48 の「driverSide の変異で --negative が空振りする罠」を踏まないこと)',
    why: '仕込みが 1 つ欠けると全 assert が空振りすることの機械証明' },

  flatpop: { impl: false, file: 'driver', targets: ['0b'],
    plan: '⭐ **ドライバ側の変異** — 合成盤面の生成を「敵と味方を同じ 1 マスに固める」へ潰す'
      + ' (boardOpts { flat: true } が既に実装済)。'
      + ' ⚠ 全員が同じマスに乗ると円錐 (step >= 1) にそのマスが入らないので敵 0 体 →'
      + ' legacy も neo も null → 差 0 件で (0b) が赤くなる、という筋を項目 3 で実測すること',
    why: '差の出ない盤面で測ると (2a)(2b) が自明に緑になる、を機械証明する' },
};
const MUT_ORDER = ['vetoback', 'only4dir', 'dirtyfirst', 'nobreak', 'zerofoe',
  'noadvance', 'alwaysadvance', 'advadjacent', 'reachdrift', 'retreatdead',
  'coldstale', 'seamonly', 'noknown', 'flatpop'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
/* 配信バイトを差し替える変異だけがポートを消費する (file: 'driver' はドライバ側の切り替え)。 */
const MUT_SERVED = MUT_IMPL.filter(k => MUTATIONS[k].file !== 'driver');
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

/* ⭐ 対照ページ (?conecast=0) を必要とする assert。⛔ 全変異で対照を開くと走行時間が
 *  倍になるだけなので、targets / record にこれらを含む変異のときだけ開く (項目 3 が使う)。 */
const REF_ASSERTS = { '1a': 1, '1b': 1, '1c': 1, '2a': 1, '3d': 1, '6a': 1 };
/* ⭐ 実プレイ (?autoplay で戦闘を回す) を必要とする assert。1 走 ≒ 90 秒なので、
 *  これ以外しか見ない変異では measurePlay を回さない。
 *  ⚠ 母集団の意味は変わらない — 走らせないのは「その assert が読まないデータ」だけ。 */
const PLAY_ASSERTS = { '0c': 1, '0d': 1, '5a': 1, '5b': 1 };

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

/* ⭐⭐⭐ 配信バイトの凍結。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。
 *  ⛔ リクエストのたびに fs.readFileSync しない — 別窓が index.html を保存すると
 *     走行中に「素の行」と「変異後の行」が混ざったビルドを配ってしまう。
 *  ⭐ 変異は 2 通り: ① from/to (または edits) の**逐語置換** ② transform の**変換関数**
 *     (transform には mutLines を使ってよい = CRLF を壊さない)。
 *  ⚠ 項目 1 では MUT_SERVED が空なのでこのループは 1 周もしない (正しい)。 */
const SRC = {};
const MUT_SRC = {};
function editsOf(m) { return m.edits ? m.edits : [{ from: m.from, to: m.to }]; }
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  let body = SRC[m.file];
  if (typeof m.transform === 'function') {
    const t = m.transform(body);
    if (!t || typeof t.body !== 'string' || t.body === body) {
      console.error('[drv] ⛔ 変異 ' + k + ' の transform が ' + m.file
        + ' を 1 バイトも変えなかった → 負のコントロールが空振りする');
      process.exit(3);
    }
    MUT_SRC[k] = { file: m.file, body: t.body, note: t.note || '' };
    continue;
  }
  const eds = editsOf(m);
  for (let i = 0; i < eds.length; i++) {
    const e = eds[i];
    const at = ' 変異 ' + k + (eds.length > 1 ? ' の置換 ' + (i + 1) + '/' + eds.length : '');
    if (typeof e.from !== 'string' || typeof e.to !== 'string') {
      console.error('[drv] ⛔' + at + ' の from/to が文字列でない'); process.exit(3);
    }
    if (e.from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔' + at + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)'); process.exit(3);
    }
    if (e.from.length === e.to.length) {
      console.error('[drv] ⛔' + at + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
    }
    const n = body.split(e.from).length - 1;
    if (n !== 1) {
      console.error('[drv] ⛔' + at + ' の置換対象が ' + m.file + ' 内に ' + n
        + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(e.from.slice(0, 90)));
      process.exit(3);
    }
    body = body.split(e.from).join(e.to);
  }
  MUT_SRC[k] = { file: m.file, body: body };
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

const PAGE_PATH = '/index.html';
/* 撤退のクエリ (依頼書 §7)。§1/§3/§6 が項目 2 で使う。 */
const RETREAT_QUERY = '?conecast=0';
/* シナリオは **廃坑 (goblin-mine = シナリオ1)** に固定する (依頼書 §8「⚠ 計測機構」)。 */
const SCENARIO_KEY = 'dragonfighters.currentScenario';
const SCENARIO_ID = 'goblin-mine';
/* 実プレイのクエリ。⭐ ?autoplay=N は sleepMs を 1/N に短縮して自動進行させる。
 * ⚠ ?diag=1 は依頼書 §8 の指定どおり付ける (index.html:3329 で ?autoplay と OR されるので
 *   実質の差は無いが、起草時の計測条件と 1 文字も違えない)。 */
const PLAY_QUERY = 'autoplay=30&diag=1';
/* 合成盤面のアーム。⛔ autoplay を付けない = 盤面が勝手に動かない。 */
const BOARD_QUERY = 'diag=1';

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
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
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
 *  ⚠ 項目 2 以降が §1〜§6 を実装するときも、母集団ガードが偽の枝で **必ず** これを呼ぶこと。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定パラメタ
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 検証シームの名前と、そこから取れるべき 4 つ (依頼書 §8 (0a))。
 *  ⛔ 項目 2 が名前を変えるなら**ここ 1 箇所**を直す (assert 側に literal を散らさない)。
 *  ⭐ classic script 直下の const/function は window に自動で載らないので、本番側は
 *    `window.__cone = { pickConeDirection, coneTilesFrom, CONE_CAST_ON, CONE_REACH_TILES }`
 *    を明示公開する必要がある (先例 = window.pickLeaderAction / window.apGateP)。 */
const SEAM_NAME = '__cone';
const SEAM_FNS = ['pickConeDirection', 'coneTilesFrom'];
const SEAM_VALS = ['CONE_CAST_ON', 'CONE_REACH_TILES'];
const SEAM_KEYS = SEAM_FNS.concat(SEAM_VALS);

/* ⭐ 依頼書 §8 (0b) の下限。⛔ ここを緩めない (盤面の質が落ちると (2a)(2b) が自明に緑になる)。 */
const BOARD_MIN_SAMPLES = 200;
const BOARD_MIN_DIFF = 50;
/* 標本生成の上限。⚠ 壁ばかりの座標を引くと null が返るので、200 件揃うまで多めに回す。 */
const BOARD_WANT = BOARD_MIN_SAMPLES + 40;
const BOARD_MAX_TRIES = 2000;
const BOARD_SEED0 = 20260904;

/* ── §3 (STEP3) の合成盤面 ────────────────────────────────────────────────────
 * ⚠⚠⚠ 「距離 4〜8 なら円錐の外」は **偽**。円錐は斜め方向の step3 lat=±2 で
 *   (5,±1) = chebyshev 5 のマスまで届く。よって (3a)(3b) の盤面は
 *   **ドライバ側の独立な幾何で「円錐に入らないオフセット」を先に作り、そこからだけ選ぶ**。
 * ⚠⚠ (3c) の測定点を移した経緯 (依頼書 §12 へ記録すること):
 *   依頼書 §8 の文言は「対象が隣接 (1 マス) なのに円錐へ入らない盤面」だが、
 *   **8 方向にすると隣接 8 マスは必ずどれかの円錐の step1 に入る**ので、その盤面は
 *   原理的に作れない (円錐の被覆は chebyshev<=3 を全部覆う = 下の coneSet で実測できる)。
 *   → 依頼書が定める作法「assert を緩めず**測定点を移す**」に従い、
 *     「**円錐の実効射程内 (0〜3 マス) では 1 件も詰め寄らない**」+
 *     「そのうち**円錐が立たない盤面 (術者と同じマス) では allyBasicAttack へ落ちる**」へ移した。
 *     ⭐ 変異 advadjacent (dist > CONE_REACH_TILES を外す) は距離 0 の盤面で必ず赤くなる。 */
const ADV_FAR  = [4, 5, 6, 7, 8];    // (3a) 円錐の外だが medium(8 マス) の内 → 詰め寄る
const ADV_OUT  = [9, 10, 11, 12];    // (3b) medium の外 → 歩かない
const ADV_NEAR = [0, 1, 2, 3];       // (3c) 円錐の実効射程の内 → 歩かない
const ADV_SPEC = []
  .concat(ADV_FAR.map(d => ({ tag: 'far', dist: d, outside: true, spell: 'allyBurningHands' })))
  .concat(ADV_OUT.map(d => ({ tag: 'out', dist: d, outside: true, spell: 'allyBurningHands' })))
  .concat(ADV_NEAR.map(d => ({ tag: 'near', dist: d, outside: false, spell: 'allyBurningHands' })));
/* ⛔ 「見つかった盤面だけ緑」にしない = 距離ごとの下限を先に決めておく (母集団ガード)。
 *  ⚠ 境界 (8 = medium ちょうど / 9 = medium の 1 つ外) は**必ず**要る。 */
const ADV_FAR_REQUIRED = [4, 8];
const ADV_OUT_REQUIRED = [9];
const ADV_NEAR_REQUIRED = [0, 1];

/* ⭐ (4b) 用。**同じ seed 列 = 同じ盤面**を 2 つの呪文に見せる。 */
const RATE_WANT = 120;
const RATE_MIN_ATTEMPTS = 100;
const RATE_SPELLS = [
  { fn: 'allyBurningHands', key: 'バーニングハンズ' },
  { fn: 'allyConeOfCold', key: 'コーンオブコールド' },
];
/* (4a) が配信ソースから切り出す 2 関数の見出し。⭐ ⛔ ディスクを読み直さない。 */
const CONE_FN_HEADS = ['async function allyBurningHands(ally, enemyIdx) {',
  'async function allyConeOfCold(ally, enemyIdx) {'];
const LEGACY_DIR_MARK = 'const directions = [';

/* ⭐ 実プレイの母集団 (依頼書 §8 (0c))。 */
const PLAY_MIN_ATTEMPTS = 5;
const PLAY_ENOUGH_ATTEMPTS = 8;   // これだけ出たら打ち切る (⭐ 打ち切りは測りたい対象そのもので数える)
const PLAY_MAX_MS = 90000;        // 依頼書の「実プレイ 90 秒」
const PLAY_POLL_MS = 500;
/* ⭐ noteAoeOutcome が計上するキーは **skill.name** = 日本語名 (index.html:21031 の実測)。
 *  ⛔ "burning-hands" ではない。 */
const AOE_KEY_BH = 'バーニングハンズ';
const SPELL_ID_BH = 'burning-hands';

/* ── 遷移前に仕込む状態 (依頼書 §2-7 / §8「⚠ 計測機構」) ────────────────────
 * ⚠⚠ **どれか 1 つでも欠けると equippedSkills に burning-hands が入らず全 assert が空振りする**。
 *   ① partyMembers … 編成に魔法使いを必ず入れる (無いと buildParty がランダムに組む)
 *   ② knownSpells  … 巻物で覚える設計なので DEFAULT_KNOWN に入っていない (index.html:12489)
 *   ③ partySkills  … 酒場の配分。**配列**で渡すと normalizePartySkillsMap が個数へ畳む
 *   ④ xp           … 3000 = Lv3 (累積 XP = 500×Lv×(Lv-1))。Lv3 の呪文スロット上限は 5
 * ⭐ 配分 burning-hands ×4 + magic-missile ×1 = 5 は起草時の実測と同じ (依頼書 §2-5)。 */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true, name: '勇者', level: 3 },
  { classKey: 'mage', name: 'ミラ', level: 3 },
  { classKey: 'dwarf', name: 'グリム', level: 3 },
  { classKey: 'cleric', name: 'リタ', level: 3 },
];
const SEED_KNOWN = {
  mage: ['magic-missile', 'fire-bolt', 'arcane-shield', SPELL_ID_BH],
  cleric: ['cure-light-wounds', 'shield-of-faith', 'turn-undead'],
  elf: ['aimed-shot', 'magic-arrow', 'hunters-mark', 'cure-minor'],
};
const SEED_SKILLS = {
  mage: [SPELL_ID_BH, SPELL_ID_BH, SPELL_ID_BH, SPELL_ID_BH, 'magic-missile'],
};
const SEED_XP = 3000;

/* ⭐ 変異 noknown 用 (項目 3)。⚠ **測定側**の切り替えなので playOpts で渡す
 *  (#48 の「driverSide の変異のフラグを const で持つと --negative で空振りする」罠)。 */
function seedPayload(opts) {
  opts = opts || {};
  const known = JSON.parse(JSON.stringify(SEED_KNOWN));
  if (opts.dropKnown) known.mage = known.mage.filter(id => id !== SPELL_ID_BH);
  return {
    scenarioKey: SCENARIO_KEY, scenarioId: SCENARIO_ID,
    party: SEED_PARTY, known: known, skills: SEED_SKILLS, xp: SEED_XP,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 合成盤面のハーネス (ページ内)
//   ⭐⭐⭐ 実マップ・実 partyInArea / enemiesInArea の上に決定論 LCG で盤面を敷き、
//     ①ドライバの旧探索の鏡 ②ドライバの新探索の鏡 ③本番の pickConeDirection
//     の 3 つを同じ盤面で叩く。
//   ⛔ 鏡は本番のソースを見ながら書かない (依頼書 §8 (1a))。
//     legacy = 依頼書 §2-2 の擬似コード / neo = 依頼書 §1 のユーザー決定 から起こしたもの。
// ══════════════════════════════════════════════════════════════════════════════
function installBoard(page, boardOpts) {
  return page.evaluate((SEAM, opt) => {
    /* 描画と敵 AI を静粛化 (enemies[] を作り替えるので描画側が壊れる)。 */
    try { window.renderWorld = function () {}; } catch (e) {}
    try { window.renderWorldWithShake = function () {}; } catch (e) {}
    try { window.moveEnemies = function () {}; } catch (e) {}

    const TILE = TILE_SIZE;
    const REACH = 3;   /* ⚠ 依頼書 §2-4 の実測「円錐は術者起点で前方 3 マス」。
                          ⛔ 本番の CONE_REACH_TILES を読まない (鏡が本番へ追随すると
                             「腐った鏡どうしの一致」で永久緑になる)。 */
    const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const D8 = D4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);

    const mkLcg = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    const setUnit = (u, tx, ty) => { const s = u.def.displaySize; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };

    /* 円錐のタイル (依頼書 §2-2 の geometry: step 1..3 / 横幅 1→3→5)。 */
    function tilesOf(aTX, aTY, d) {
      const out = [];
      for (let step = 1; step <= REACH; step++) {
        const hw = step;
        for (let lat = -hw + 1; lat <= hw - 1; lat++) {
          out.push({ tx: aTX + d[0] * step + (-d[1]) * lat, ty: aTY + d[1] * step + (d[0]) * lat });
        }
      }
      return out;
    }
    const keyOf = (tiles) => tiles.map(t => t.tx + ',' + t.ty).join(';');

    /* ── 旧探索の鏡 (依頼書 §2-2 の擬似コードから起こす) ──────────────────
       4 方向 / 味方が 1 人でも入ったら方向ごと破棄 (break で短絡) / cnt > bestCount。 */
    function legacyPick(aTX, aTY) {
      let best = null, bestCount = 0;
      for (const d of D4) {
        const tiles = tilesOf(aTX, aTY, d);
        let safe = true, cnt = 0;
        for (const t of tiles) {
          if (partyInArea(t.tx, t.ty, 1, 1)) { safe = false; break; }
          cnt += enemiesInArea(t.tx, t.ty, 1, 1).length;
        }
        if (!safe) continue;
        if (cnt > bestCount) { best = { d: d, tiles: tiles, count: cnt, party: 0 }; bestCount = cnt; }
      }
      return (best && bestCount > 0) ? best : null;
    }

    /* ── 新探索の鏡 (依頼書 §1 のユーザー決定から起こす) ──────────────────
       8 方向 / 「味方が入らない方向」を先に探し、1 つも無いときだけ味方入りを許す 2 段構え /
       敵 0 体の方向は両パスとも採らない。 */
    function neoPick(aTX, aTY) {
      for (let pass = 0; pass <= 1; pass++) {
        let best = null, bestCount = 0;
        for (const d of D8) {
          const tiles = tilesOf(aTX, aTY, d);
          let party = 0, cnt = 0, rejected = false;
          for (const t of tiles) {
            if (partyInArea(t.tx, t.ty, 1, 1)) {
              party++;
              if (pass === 0) { rejected = true; break; }
            }
            cnt += enemiesInArea(t.tx, t.ty, 1, 1).length;
          }
          if (rejected) continue;
          if (cnt <= 0) continue;
          if (cnt > bestCount) { best = { d: d, tiles: tiles, count: cnt, party: party }; bestCount = cnt; }
        }
        if (best) return best;
      }
      return null;
    }

    /* 「清潔な方向 (味方 0 人 かつ 敵 1 体以上) が実在するか」
       = (2b) が項目 2 で読む**独立**指標 (⛔ 本番の返り値からは作らない)。 */
    function hasCleanDir(aTX, aTY) {
      for (const d of D8) {
        const tiles = tilesOf(aTX, aTY, d);
        let dirty = false, cnt = 0;
        for (const t of tiles) {
          if (partyInArea(t.tx, t.ty, 1, 1)) { dirty = true; break; }
          cnt += enemiesInArea(t.tx, t.ty, 1, 1).length;
        }
        if (!dirty && cnt > 0) return true;
      }
      return false;
    }

    /* 開いているタイル (盤面の敷き場所)。 */
    const openTiles = [];
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      for (let tx = 1; tx < MAP_W - 1; tx++) if (!isTileWall(tx, ty)) openTiles.push([tx, ty]);
    }

    const foeDef = { displaySize: 96, name: 'probe-foe' };
    const allyDef = { displaySize: 96, name: 'probe-ally' };

    window.__coneProbe = {
      info: function () {
        const seam = {};
        let present = false;
        try {
          const C = window[SEAM];
          present = !!C;
          if (C) for (const k of Object.keys(C)) seam[k] = typeof C[k];
        } catch (e) { seam.__err = String((e && e.message) || e); }
        return {
          seamPresent: present, seamType: typeof window[SEAM], seamTypes: seam,
          mapW: MAP_W, mapH: MAP_H, tile: TILE, openTiles: openTiles.length,
          hasPartyInArea: typeof partyInArea === 'function',
          hasEnemiesInArea: typeof enemiesInArea === 'function',
          scenario: (function () { try { return sessionStorage.getItem('dragonfighters.currentScenario'); } catch (e) { return null; } })(),
        };
      },

      /* 1 標本 = 「敵の塊 + その手前に前衛 + さらに後ろに術者」。
       * ⚠ 実 partyInArea / enemiesInArea / isTileWall / mapData を使う (鏡は探索だけ)。
       * ⭐ opt.flat = 変異 flatpop 用 (敵も味方も術者も同じ 1 マスへ潰す)。 */
      sample: function (seed) {
        const rnd = mkLcg(seed);
        allies.length = 0;
        enemies.length = 0;
        const taken = new Set();
        const free = (tx, ty) => !isTileWall(tx, ty);
        const put = (tx, ty) => { const k = tx + ',' + ty; if (taken.has(k)) return false; taken.add(k); return true; };

        const c = openTiles[Math.floor(rnd() * openTiles.length)];
        if (!c) return null;

        if (opt && opt.flat) {
          /* ⭐ 変異 flatpop: 全員を 1 マスへ固める (差が原理的に出ない盤面)。 */
          for (let i = 0; i < 3; i++) {
            const e = { alive: true, inactive: false, x: 0, y: 0, hp: 10, def: foeDef };
            setUnit(e, c[0], c[1]); enemies.push(e);
          }
          const a = { alive: true, x: 0, y: 0, facing: 'right', def: allyDef };
          setUnit(a, c[0], c[1]); allies.push(a);
          playerX = c[0] * TILE; playerY = c[1] * TILE;
          const legF = legacyPick(c[0], c[1]);
          const neoF = neoPick(c[0], c[1]);
          return { seed: seed, foes: enemies.length, allies: allies.length,
            caster: [c[0], c[1]], nFront: 0, backDist: 0, clean: hasCleanDir(c[0], c[1]),
            legacy: legF ? { dx: legF.d[0], dy: legF.d[1], count: legF.count, party: 0, key: keyOf(legF.tiles) } : null,
            neo: neoF ? { dx: neoF.d[0], dy: neoF.d[1], count: neoF.count, party: neoF.party, key: keyOf(neoF.tiles) } : null,
            prod: null, prodErr: 'flatpop (ドライバ側の変異)' };
        }

        /* ── ① 敵の塊: 中心 c の 3x3 から穴の空いた塊を作る ── */
        const foeTiles = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (rnd() < 0.4) continue;              // 塊に穴を空ける (一様な四角にしない)
            const tx = c[0] + dx, ty = c[1] + dy;
            if (!free(tx, ty)) continue;
            if (!put(tx, ty)) continue;
            foeTiles.push([tx, ty]);
          }
        }
        if (foeTiles.length < 2) return null;
        for (const t of foeTiles) {
          const e = { alive: true, inactive: false, x: 0, y: 0, hp: 10, def: foeDef };
          setUnit(e, t[0], t[1]); enemies.push(e);
        }

        /* ── ② 術者: 塊の中心から 8 方向のどれかへ 1〜5 マス下がった床 ──
           ⚠ 円錐は 3 マスしか伸びないので、遠い標本は「どの方向にも敵 0 体」になる。
           ⭐ **それでよい** — 起草時の実測 (依頼書 §2-5 の距離分布) では
             **18/29 が距離 4 以上**だった。近距離だけの盤面にすると旧探索が不当に高い
             発射率を出し、(2a) の「3 倍以上」が原理的に成立しなくなる
             (項目 1 の初回実走で実際にそうなった: 旧 52.5% / 新 100% = 1.9 倍)。 */
        const u = D8[Math.floor(rnd() * D8.length)];
        let cast = null, backDist = 0;
        const d0 = 1 + Math.floor(rnd() * 5);
        for (let d = d0; d >= 1 && !cast; d--) {
          const tx = c[0] - u[0] * d, ty = c[1] - u[1] * d;
          if (free(tx, ty) && !taken.has(tx + ',' + ty)) { cast = [tx, ty]; backDist = d; }
        }
        if (!cast) return null;
        put(cast[0], cast[1]);

        /* ── ③ 前衛: 敵に隣接する床のうち **術者に近い順** に 1〜3 人 ──
           ⭐ ここが肝。allyAdvanceTowardPoint は対象に隣接するまで詰めるので、実戦の前衛は
             敵の隣に立つ。術者に近い側から埋めると「術者と敵の間に味方が立つ」= 拒否権が
             効く盤面が自然に出る (依頼書 §2-2 の罠そのもの)。 */
        const adj = [];
        for (const t of foeTiles) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const tx = t[0] + dx, ty = t[1] + dy;
              if (!free(tx, ty) || taken.has(tx + ',' + ty)) continue;
              adj.push([tx, ty]);
            }
          }
        }
        const distTo = (t) => Math.abs(t[0] - cast[0]) + Math.abs(t[1] - cast[1]);
        adj.sort((a, b) => distTo(a) - distTo(b));
        /* ⭐ 2〜4 人。起草時の編成は 勇者(戦士) / ドワーフ / 僧侶 の 3 人が前へ出る形
           (依頼書 §2-5)。1 人しか置かないと拒否権がほとんど働かず、旧探索が実プレイより
           はるかに高い発射率を出す (項目 1 の初回実走 = 旧 52.5%。実プレイは 5.6%)。 */
        const nFront = 2 + Math.floor(rnd() * 3);
        const front = [];
        for (const t of adj) {
          if (front.length >= nFront) break;
          if (!put(t[0], t[1])) continue;
          front.push(t);
        }
        if (front.length < 1) return null;

        /* リーダー = 前衛の 1 人目 (⚠ partyInArea はリーダーも見る。
           判定は Math.floor((playerX + 48) / TILE) なので tx*TILE を置けばそのマスに乗る)。 */
        playerX = front[0][0] * TILE;
        playerY = front[0][1] * TILE;
        for (let i = 1; i < front.length; i++) {
          const a = { alive: true, x: 0, y: 0, facing: 'right', def: allyDef };
          setUnit(a, front[i][0], front[i][1]); allies.push(a);
        }
        /* 術者も味方の 1 人 (自分のマスは円錐 step>=1 に入らないので拒否権には効かない)。 */
        const caster = { alive: true, x: 0, y: 0, facing: 'right', def: allyDef };
        setUnit(caster, cast[0], cast[1]); allies.push(caster);

        const aTX = cast[0], aTY = cast[1];
        const leg = legacyPick(aTX, aTY);
        const neo = neoPick(aTX, aTY);

        /* ── ④ 本番の探索 (無ければ prodErr に理由を残す。⛔ null へ丸めない) ── */
        let prod = null, prodErr = null;
        try {
          const C = window[SEAM];
          if (!C) prodErr = 'window.' + SEAM + ' is ' + typeof C;
          else if (typeof C.pickConeDirection !== 'function') prodErr = 'pickConeDirection is ' + typeof C.pickConeDirection;
          else {
            const r = C.pickConeDirection(aTX, aTY);
            prod = r ? { dx: r.d && r.d.dx, dy: r.d && r.d.dy, count: r.count,
              party: r.partyInCone, key: (r.tiles ? keyOf(r.tiles) : null) } : null;
          }
        } catch (e) { prodErr = String((e && e.message) || e); }

        return {
          seed: seed, foes: enemies.length, allies: allies.length,
          caster: [aTX, aTY], nFront: front.length, backDist: backDist,
          clean: hasCleanDir(aTX, aTY),
          legacy: leg ? { dx: leg.d[0], dy: leg.d[1], count: leg.count, party: 0, key: keyOf(leg.tiles) } : null,
          neo: neo ? { dx: neo.d[0], dy: neo.d[1], count: neo.count, party: neo.party, key: keyOf(neo.tiles) } : null,
          prod: prod, prodErr: prodErr,
        };
      },

      /* n 件そろうまで回す (壁ばかりの座標を引くと null が返るので多めに試行)。 */
      run: function (seed0, want, maxTries) {
        const out = [];
        let tries = 0;
        for (let s = seed0; out.length < want && tries < maxTries; s++, tries++) {
          const r = window.__coneProbe.sample(s);
          if (r) out.push(r);
        }
        return { samples: out, tries: tries };
      },
    };
    return window.__coneProbe.info();
  }, SEAM_NAME, boardOpts || {});
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP3 の観測装置 (§3 (3a)〜(3d) と §4 (4b) が読む)
//   ⭐ driver_action_priority.js の __warQuiet の流儀 — **演出だけ黙らせ、判断は 1 行も触らない**。
//     allyAdvanceTowardPoint / allyBasicAttack をスタブへ差し替えて「どちらへ落ちたか」を採る。
//   ⛔ hasLineOfSight / tileChebyshev / getRange / pickConeDirection は差し替えない
//     (STEP3 の判断そのもの。ここを黙らせたら測っているものが消える)。
// ══════════════════════════════════════════════════════════════════════════════
function installAdvance(page) {
  return page.evaluate((SEAM) => {
    const TILE = TILE_SIZE;
    const REACH = 3;   /* ⛔ 本番の CONE_REACH_TILES を読まない (腐った鏡どうしの一致を避ける)。
                          依頼書 §2-4 の実測「円錐は術者起点で前方 3 マス」。 */
    const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    /* 円錐が覆うオフセット集合 (ドライバ側の独立な幾何)。
       ⚠⚠⚠ 斜め方向の step3 lat=±2 は (5,±1) = **chebyshev 5** まで届く。
         よって「距離 4〜8 なら円錐の外」は偽。ここから引いて盤面を選ぶ。 */
    const coneSet = new Set();
    for (const d of D8) {
      for (let step = 1; step <= REACH; step++) {
        for (let lat = -step + 1; lat <= step - 1; lat++) {
          coneSet.add((d[0] * step + (-d[1]) * lat) + ',' + (d[1] * step + d[0] * lat));
        }
      }
    }
    const open = [];
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) if (!isTileWall(tx, ty)) open.push([tx, ty]);
    }
    const cx = (t) => t[0] * TILE + TILE / 2;
    const cy = (t) => t[1] * TILE + TILE / 2;
    const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

    /* 実マップの上で「距離 dist / 視線が通る / (指定あれば) 円錐の外」の 1 組を探す。 */
    function findPair(dist, outside) {
      if (dist === 0) {
        for (const c of open) if (hasLineOfSight(cx(c), cy(c), cx(c), cy(c))) return { c: c, t: c, inCone: false };
        return null;
      }
      for (const c of open) {
        for (const t of open) {
          if (cheb(c, t) !== dist) continue;
          const off = (t[0] - c[0]) + ',' + (t[1] - c[1]);
          const inCone = coneSet.has(off);
          if (outside && inCone) continue;
          if (!hasLineOfSight(cx(c), cy(c), cx(t), cy(t))) continue;
          return { c: c, t: t, inCone: inCone };
        }
      }
      return null;
    }

    /* 演出だけ黙らせる。⛔ 判断・ダイス・射程・視線は 1 行も触らない。 */
    const QUIET = ['allyAdvanceTowardPoint', 'allyBasicAttack', 'sleepMs', 'flashAction',
      'showRollAtAlly', 'showRollAtEnemy', 'startAllyAttackAnim', 'spawnCastOrb', 'dfPlayCast',
      'spawnConeFlames', 'spawnConeCrystals', 'spawnFireImpactBurst', 'spawnGroundFx',
      'updateInfo', 'showDmgAt', 'triggerEnemyDamageFlash', 'noteDisplacementHit',
      'defeatEnemy', 'tryDisplacement', 'renderWorld', 'renderWorldWithShake', 'moveEnemies'];
    function quiet(T) {
      const saved = {};
      for (const nm of QUIET) saved[nm] = window[nm];
      const nop = function () {};
      window.allyAdvanceTowardPoint = function () { T.push('ADV'); return Promise.resolve(); };
      window.allyBasicAttack = function () { T.push('BASIC'); return Promise.resolve(); };
      window.sleepMs = function () { return Promise.resolve(); };
      window.dfPlayCast = function () { return Promise.resolve(); };
      window.flashAction = nop; window.startAllyAttackAnim = nop; window.spawnCastOrb = nop;
      window.spawnConeFlames = nop; window.spawnConeCrystals = nop;
      window.spawnFireImpactBurst = nop; window.spawnGroundFx = nop;
      window.showRollAtAlly = nop; window.showRollAtEnemy = nop; window.showDmgAt = nop;
      window.triggerEnemyDamageFlash = nop; window.noteDisplacementHit = nop;
      window.renderWorld = nop; window.renderWorldWithShake = nop; window.moveEnemies = nop;
      window.updateInfo = function (msg) { T.push('I:' + msg); };
      window.tryDisplacement = function () { return false; };
      window.defeatEnemy = function (i) { if (enemies[i]) enemies[i].alive = false; };
      return function () {
        for (const nm of QUIET) {
          if (saved[nm] !== undefined) window[nm] = saved[nm];
          else { try { delete window[nm]; } catch (e) {} }
        }
      };
    }

    const mkAlly = (t) => ({ alive: true, classKey: 'mage', level: 5, mp: 30, int: 4,
      facing: 'right', x: t[0] * TILE + TILE / 2 - 48, y: t[1] * TILE + TILE / 2 - 48,
      spellSlots: {}, buffs: {}, def: { name: '術者', displaySize: 96 } });
    const mkFoe = (t) => ({ alive: true, inactive: false, stunned: 0, hp: 999, maxHp: 999,
      poisonRemaining: 0, x: t[0] * TILE + TILE / 2 - 48, y: t[1] * TILE + TILE / 2 - 48,
      def: { name: '的', displaySize: 96, hp: 999, ac: 13, dex: 0, con: 0 } });

    window.__coneAdv = {
      info: function () {
        return { open: open.length, mapW: MAP_W, mapH: MAP_H, coneOffsets: coneSet.size,
          seam: typeof window[SEAM],
          hasBH: typeof window.allyBurningHands, hasCC: typeof window.allyConeOfCold,
          hasAdvance: typeof window.allyAdvanceTowardPoint,
          hasBasic: typeof window.allyBasicAttack };
      },

      /* spec = [{ tag, dist, outside, spell }] → 1 件ずつ盤面を作って呪文を 1 回だけ走らせる。 */
      run: async function (spec) {
        const out = [];
        for (const s of spec) {
          const pair = findPair(s.dist, !!s.outside);
          if (!pair) { out.push({ tag: s.tag, dist: s.dist, found: false, spell: s.spell }); continue; }
          allies.length = 0; enemies.length = 0;
          const ally = mkAlly(pair.c);
          allies.push(ally);
          playerX = pair.c[0] * TILE; playerY = pair.c[1] * TILE;
          enemies.push(mkFoe(pair.t));
          /* [記録・⛔ 判定に使わない] この盤面で本番の探索が null かどうか。 */
          let prodNull = null;
          try {
            const C = window[SEAM];
            if (C && typeof C.pickConeDirection === 'function') {
              prodNull = !C.pickConeDirection(Math.floor((ally.x + 48) / TILE),
                Math.floor((ally.y + 48) / TILE));
            }
          } catch (e) { prodNull = null; }
          const T = [];
          const unquiet = quiet(T);
          let err = null;
          try { await window[s.spell](ally, 0); }
          catch (e) { err = String((e && e.message) || e); }
          finally { unquiet(); }
          out.push({ tag: s.tag, dist: s.dist, found: true, spell: s.spell,
            caster: pair.c, target: pair.t, inCone: !!pair.inCone, prodNull: prodNull,
            adv: T.indexOf('ADV') >= 0, basic: T.indexOf('BASIC') >= 0,
            trace: T.filter(x => x === 'ADV' || x === 'BASIC'), err: err });
        }
        return out;
      },

      /* (4b): **同じ seed 列 = 同じ盤面**を 2 つの呪文に見せて、既存シーム __aoeStats で
         発射率を採る。⭐ noteAoeOutcome は STEP3 の分岐より前で呼ばれるので、
         詰め寄りに落ちた手番も attempts に入る = 分母が揃う。 */
      spellRates: async function (seed0, want, maxTries, spells) {
        const res = {};
        const prevStats = window.__aoeStats;
        for (const sp of spells) {
          window.__aoeStats = {};
          let n = 0, errs = 0, first = null;
          for (let s = seed0, tries = 0; n < want && tries < maxTries; s++, tries++) {
            const r = window.__coneProbe.sample(s);
            if (!r) continue;
            n++;
            const ally = allies[allies.length - 1];
            const T = [];
            const unquiet = quiet(T);
            try { await window[sp.fn](ally, 0); }
            catch (e) { errs++; if (!first) first = String((e && e.message) || e); }
            finally { unquiet(); }
          }
          const st = window.__aoeStats[sp.key] || null;
          res[sp.fn] = { n: n, key: sp.key, attempts: st ? st.attempts : 0,
            cast: st ? st.cast : 0, demoted: st ? st.demoted : 0, errs: errs, firstErr: first };
        }
        window.__aoeStats = prevStats;
        return res;
      },
    };
    return window.__coneAdv.info();
  }, SEAM_NAME);
}

/* ── 合成盤面の測定 (⛔ autoplay を付けない = 実プレイに頼らない) ────────────── */
async function measureBoard(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[board :' + port + (opts.query ? ' ' + opts.query : '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  /* ⚠ evaluateOnNewDocument は**全ナビゲーションで再実行される**。
     ここには消去系 (removeItem) を置かない (2026-06-05 の最頻ハマり)。 */
  await page.evaluateOnNewDocument((k, v) => {
    try { sessionStorage.setItem(k, v); } catch (e) {}
  }, SCENARIO_KEY, SCENARIO_ID);

  const url = 'http://localhost:' + port + PAGE_PATH + '?' + BOARD_QUERY
    + (opts.query ? '&' + String(opts.query).replace(/^[?&]/, '') : '');
  const out = { url: url, booted: false, info: null, samples: [], tries: 0, err: null };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    /* ⚠ 裸の識別子で待つ。classic script 直下の const/let/function は window に載らない。
       ⭐ startGame は待つが**呼ばない** (盤面を静止させたいので autoplay もしない)。 */
    await page.waitForFunction(
      'typeof startGame === "function" && !!mapData'
      + ' && typeof partyInArea === "function" && typeof enemiesInArea === "function"'
      + ' && typeof isTileWall === "function"',
      { timeout: 45000 });
    out.booted = true;
  } catch (e) {
    out.err = 'ページが起動しなかった: ' + String((e && e.message) || e);
  }
  if (out.booted) {
    try {
      out.info = await installBoard(page, { flat: !!opts.flat });
      const r = await page.evaluate((s0, want, tries) => window.__coneProbe.run(s0, want, tries),
        BOARD_SEED0, BOARD_WANT, BOARD_MAX_TRIES);
      out.samples = r.samples; out.tries = r.tries;
    } catch (e) {
      out.err = (out.err ? out.err + ' / ' : '') + '合成盤面を回せない: ' + String((e && e.message) || e);
    }
    /* ── §3 (STEP3) の盤面 + §4 (4b) の発射率 ── */
    try {
      out.advInfo = await installAdvance(page);
      out.adv = await page.evaluate((spec) => window.__coneAdv.run(spec), ADV_SPEC);
    } catch (e) { out.advErr = String((e && e.message) || e); }
    /* ⭐ (4b) は素のアームだけが読む (撤退アームでは走らせない = 走行時間を倍にしない)。 */
    if (!opts.query) {
      try {
        out.rates = await page.evaluate((s0, want, tries, sp) =>
          window.__coneAdv.spellRates(s0, want, tries, sp),
        BOARD_SEED0, RATE_WANT, BOARD_MAX_TRIES, RATE_SPELLS);
      } catch (e) { out.ratesErr = String((e && e.message) || e); }
    }
  }
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 実プレイの観測 (§0 の (0c)(0d) と、項目 2 の (5a)(5b) だけが読む)
//   ⭐ window.__aoeStats は index.html:26803 の **既存**シーム (既定 undefined = no-op)。
//     ⛔ 新しい計測シームを本番へ足さない (CLAUDE.md の changelog ガードに掛かる)。
//   ⚠ 仕込み (partyMembers / knownSpells / partySkills / xp) は **遷移前**。
// ══════════════════════════════════════════════════════════════════════════════
async function measurePlay(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[play :' + port + (opts.query ? ' ' + opts.query : '') + '] ';
  const consoleErrs = [];
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    consoleErrs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem(seed.scenarioKey, seed.scenarioId);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify(seed.known));
      localStorage.setItem('dragonfighters.partySkills', JSON.stringify(seed.skills));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
    } catch (e) {}
    /* ⭐ 既存の観測シームを有効化する (定義したときだけ計上される no-op シーム)。
       ⚠ ページのどのスクリプトより先に置く = 1 回目の呼び出しから数えられる。 */
    try { window.__aoeStats = {}; } catch (e) {}
  }, seedPayload(opts));

  const url = 'http://localhost:' + port + PAGE_PATH + '?' + PLAY_QUERY
    + (opts.query ? '&' + String(opts.query).replace(/^[?&]/, '') : '');
  const out = { url: url, started: false, elapsedMs: 0, stats: null, mage: null,
    seamType: null, consoleErrs: consoleErrs, err: null };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
      { timeout: 60000 });
    out.started = true;
  } catch (e) {
    out.err = 'ゲームが起動しなかった: ' + String((e && e.message) || e);
  }

  /* ⭐ (0d) の魔法使いのロードアウトは **開幕直後** に採る
     (spellSlots は撃つたびに減るので、走り終わってから読むと「1 以上」が run の運になる)。 */
  if (out.started) {
    try {
      out.mage = await page.evaluate(() => {
        try {
          const list = (typeof allies !== 'undefined' && allies) ? allies : [];
          const m = list.filter(a => a && a.classKey === 'mage')
            .map(a => ({
              name: (a.def && a.def.name) || null, level: a.level || null, isHero: !!a.isHero,
              equippedSkills: Array.isArray(a.equippedSkills) ? a.equippedSkills.slice() : null,
              spellSlots: a.spellSlots ? JSON.parse(JSON.stringify(a.spellSlots)) : null,
              maxSpellSlots: a.maxSpellSlots ? JSON.parse(JSON.stringify(a.maxSpellSlots)) : null,
            }));
          return { casters: m,
            leaderClass: (typeof leaderClassKey !== 'undefined') ? leaderClassKey : null,
            party: list.map(a => a && a.classKey),
            knownMage: (typeof knownSpells !== 'undefined' && knownSpells) ? knownSpells.mage : null };
        } catch (e) { return { err: String((e && e.message) || e) }; }
      });
    } catch (e) { out.mage = { err: String((e && e.message) || e) }; }
  }
  try { out.seamType = await page.evaluate((s) => typeof window[s], SEAM_NAME); }
  catch (e) { out.seamType = 'unreadable'; }

  /* ── 出るまでポーリング (⛔ 固定 sleep は共有キューのある所で原理的にフレークする) ──
     ⭐ 打ち切りは **測りたい対象そのもの** (バーニングハンズの attempts) で数える。
        ⛔ 「戦闘が起きた回数」のような代理指標で打ち切らない (#49 項目 1 の轍)。 */
  if (out.started) {
    const t0 = Date.now();
    for (;;) {
      let snap = null;
      try {
        snap = await page.evaluate((k) => {
          const st = window.__aoeStats;
          if (!st) return { missing: true };
          return { missing: false, all: JSON.parse(JSON.stringify(st)),
            attempts: (st[k] && st[k].attempts) || 0 };
        }, AOE_KEY_BH);
      } catch (e) { break; }
      if (snap && !snap.missing) out.stats = snap.all;
      if (snap && snap.attempts >= PLAY_ENOUGH_ATTEMPTS) break;
      if (Date.now() - t0 >= PLAY_MAX_MS) break;
      await sleep(PLAY_POLL_MS);
    }
    out.elapsedMs = Date.now() - t0;
  }
  await page.close();
  return out;
}

/* ⭐⭐⭐ (0c) の母集団は **run の運** で揺れる。項目 1 の実走 2 本は 90 秒で
 *   attempts = 7 と 6 (閾値 5) = 余裕が 1〜2 件しかない。
 *   ⛔ 閾値は依頼書 §8 (0c) の値なので **1 も動かさない**。
 *   ⭐ 代わりに [[project-headless-verification]] の恒久ルール「単発の赤はまず 1 回だけ
 *     再実行する」を装置へ内蔵する (先例 = verify_roll_target.js の measureRetreat)。
 *   ⚠⚠ 引き直すのは **母集団が閾値に届かなかったときだけ**。
 *     ⛔ 「値が悪い」ときに引き直してはいけない (負のコントロールが空振りする)。
 *     ⭐ ここでの「値」は (5a) の cast 数であって attempts ではない —— attempts は
 *       「経路が走ったか」だけを表す純粋な母集団なので、引き直しても検査は鈍らない。
 *       実際、変異 noknown は装備そのものを消すので 2 回引いても attempts は 0 のまま。 */
async function measurePlayOnce(browser, port, errs, opts) {
  let best = await measurePlay(browser, port, errs, opts);
  const attemptsOf = (p) => (p && p.stats && p.stats[AOE_KEY_BH] && p.stats[AOE_KEY_BH].attempts) || 0;
  if (best.started && attemptsOf(best) < PLAY_MIN_ATTEMPTS) {
    errs.push('[play :' + port + '] ' + AOE_KEY_BH + ' の attempts が ' + attemptsOf(best)
      + ' 件 (< ' + PLAY_MIN_ATTEMPTS + ') だったので 1 回だけ引き直す (母集団の運)');
    const again = await measurePlay(browser, port, errs, opts);
    if (attemptsOf(again) > attemptsOf(best)) { again.retried = true; best = again; }
    else { best.retried = true; }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════════════
// 標本の集計 (⛔ ここで判定しない。母集団の切り出しと材料づくりだけ)
// ══════════════════════════════════════════════════════════════════════════════
function boardSamples(m) { return (m && m.board && Array.isArray(m.board.samples)) ? m.board.samples : []; }
/* 撤退アーム (?conecast=0) の標本。§1 / (3d) / (6a) が読む。 */
function refSamples(m) { return (m && m.ref && Array.isArray(m.ref.samples)) ? m.ref.samples : []; }
/* STEP3 の観測。arm = 'board' (素) / 'ref' (撤退)。 */
function advCases(m, arm, tag) {
  const b = m ? m[arm] : null;
  const list = (b && Array.isArray(b.adv)) ? b.adv : [];
  return tag ? list.filter(c => c.tag === tag) : list;
}
/* 返り値の同一性 (方向・タイル集合・count)。⛔ party は比べない
   = 旧探索は partyInCone を持たないので、そこを比べると型の違いで必ず落ちる。 */
function pickEq(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.dx === b.dx && a.dy === b.dy && a.count === b.count && a.key === b.key;
}
/* (4a): 配信ソースから 1 関数の本文を切り出す (次の 4 スペース宣言まで)。 */
function fnBodyOf(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const rest = src.slice(i + head.length);
  const m = rest.search(/\r?\n {4}(?:async function |function |\/\/ ══)/);
  return m < 0 ? rest : rest.slice(0, m);
}
function pageErrorsOf(m) {
  const all = (m && Array.isArray(m.errs)) ? m.errs : [];
  return all.filter(e => String(e).indexOf('PAGEERROR') >= 0);
}
function boardTally(m) {
  const s = boardSamples(m);
  const t = {
    n: s.length,
    legacyCast: 0, neoCast: 0, prodCast: 0, prodErr: 0,
    diff: 0,          // legacy が撃てず neo が撃てる = (0b) の本命
    reverse: 0,       // legacy が撃てて neo が撃てない
    bothNull: 0, bothCast: 0,
    neoDiag: 0,       // neo が斜めを選んだ件数
    neoDirty: 0,      // neo が味方入りの方向を選んだ件数
    cleanExists: 0,   // 清潔な方向が実在する標本
    casterTiles: {},
  };
  for (const r of s) {
    if (r.legacy) t.legacyCast++;
    if (r.neo) t.neoCast++;
    if (r.prod) t.prodCast++;
    if (r.prodErr) t.prodErr++;
    if (!r.legacy && r.neo) t.diff++;
    if (r.legacy && !r.neo) t.reverse++;
    if (!r.legacy && !r.neo) t.bothNull++;
    if (r.legacy && r.neo) t.bothCast++;
    if (r.neo && r.neo.dx !== 0 && r.neo.dy !== 0) t.neoDiag++;
    if (r.neo && r.neo.party > 0) t.neoDirty++;
    if (r.clean) t.cleanExists++;
    const k = r.caster[0] + ',' + r.caster[1];
    t.casterTiles[k] = (t.casterTiles[k] || 0) + 1;
  }
  t.distinctCasters = Object.keys(t.casterTiles).length;
  return t;
}
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—');

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 — [id, 見出し, m => [ok, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 (先に母集団を確かめる) ────────────────────────────────────────
  ['0a', '[装置] window.' + SEAM_NAME + ' が実在し ' + SEAM_KEYS.join(' / ')
    + ' の ' + SEAM_KEYS.length + ' つが取れる'
    + '  ⭐⭐⭐ これが無いと §1〜§4 の全 assert が「関数が無いので false」で空振りする',
    m => {
      const b = m.board;
      if (!b || !b.booted) {
        return popFail('(0a) 合成盤面ページの起動',
          'ページが起動しないとシームの有無も読めない: ' + ((b && b.err) || '—'));
      }
      const info = b.info || {};
      const types = info.seamTypes || {};
      const missFn = SEAM_FNS.filter(k => types[k] !== 'function');
      const missVal = SEAM_VALS.filter(k => types[k] === undefined);
      const ok = !!info.seamPresent && missFn.length === 0 && missVal.length === 0;
      return [ok,
        'typeof window.' + SEAM_NAME + ' = ' + JSON.stringify(info.seamType)
        + '  取れた鍵 = ' + JSON.stringify(types)
        + (ok ? '' : '  ⛔ '
          + (!info.seamPresent
            ? '検証シームが本番に無い = 依頼書 §8 の '
              + 'window.' + SEAM_NAME + ' = { ' + SEAM_KEYS.join(', ') + ' } が未実装'
            : '足りない鍵: ' + missFn.concat(missVal).join(', '))
          + '  (実プレイ側でも typeof = ' + JSON.stringify(m.play ? m.play.seamType : null) + ')')];
    }],

  ['0b', '[母集団] 合成盤面の標本が ' + BOARD_MIN_SAMPLES + ' 件以上あり、そのうち'
    + '**「4 方向・拒否権あり」では撃てないが「8 方向・2 段」では撃てる**標本が '
    + BOARD_MIN_DIFF + ' 件以上ある'
    + '  ⭐ 差の出ない盤面で測ると (2a)(2b) が自明に緑になる'
    + '  ⭐⭐⭐ 差の件数は**ドライバが独立に持つ旧/新の鏡**で算出する = 本番実装の有無に依存しない',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(0b) 合成盤面ページの起動', (b && b.err) || '—');
      const s = boardSamples(m);
      if (s.length === 0) {
        return popFail('(0b) 合成盤面の標本', '1 件も採れていない: ' + (b.err || '生成が全部 null'));
      }
      const t = boardTally(m);
      const ok = t.n >= BOARD_MIN_SAMPLES && t.diff >= BOARD_MIN_DIFF;
      return [ok,
        '標本 ' + t.n + ' 件 (試行 ' + b.tries + ' / 期待 >= ' + BOARD_MIN_SAMPLES + ')'
        + '  旧(4方向・拒否権あり) が撃てた ' + t.legacyCast + ' 件 ' + pct(t.legacyCast, t.n)
        + ' / 新(8方向・2段) が撃てた ' + t.neoCast + ' 件 ' + pct(t.neoCast, t.n)
        + '  **差 (旧✕ → 新○) ' + t.diff + ' 件** (期待 >= ' + BOARD_MIN_DIFF + ')'
        /* ⭐ 記録のみ・⛔ 判定しない。項目 2 の (2a)「素 / 撤退 が 3 倍以上」が
           この盤面で原理的に成立するかの下見 (鏡どうしの比 = 到達可能な上限)。 */
        + '  [記録] 鏡どうしの比 新/旧 = '
        + (t.legacyCast > 0 ? (t.neoCast / t.legacyCast).toFixed(2) + ' 倍' : '∞ (旧が 0 件)')
        + '  逆転 (旧○ → 新✕) ' + t.reverse + ' 件'
        + '  新が斜めを選んだ ' + t.neoDiag + ' 件 / 味方入りを選んだ ' + t.neoDirty + ' 件'
        + '  清潔な方向が実在する標本 ' + t.cleanExists + ' 件'
        + '  術者マスの異なり数 ' + t.distinctCasters
        + (ok ? '' : '  ⛔ '
          + (t.n < BOARD_MIN_SAMPLES ? '標本が足りない (盤面生成が null を返しすぎている) ' : '')
          + (t.diff < BOARD_MIN_DIFF ? '差の出る標本が足りない = この盤面では (2a)(2b) が自明に緑になる' : ''))];
    }],

  ['0c', '[母集団] 実プレイ (シナリオ1 ' + SCENARIO_ID + ' を ?' + PLAY_QUERY + ' で '
    + (PLAY_MAX_MS / 1000) + ' 秒) で window.__aoeStats["' + AOE_KEY_BH + '"].attempts >= '
    + PLAY_MIN_ATTEMPTS
    + '  ⭐ **経路が本当に走っている**ことの直接証明。0 件なら仕込み (partyMembers / knownSpells /'
    + ' partySkills) が失敗している',
    m => {
      const p = m.play;
      if (!p || !p.started) {
        return popFail('(0c) 実プレイの起動', (p && p.err) || 'measurePlay が走っていない');
      }
      if (!p.stats) {
        return popFail('(0c) 観測シーム', 'window.__aoeStats が undefined のまま'
          + ' (evaluateOnNewDocument が効いていない)');
      }
      const e = p.stats[AOE_KEY_BH] || null;
      const attempts = e ? (e.attempts || 0) : 0;
      const ok = attempts >= PLAY_MIN_ATTEMPTS;
      const others = Object.keys(p.stats).filter(k => k !== AOE_KEY_BH);
      return [ok,
        AOE_KEY_BH + ': ' + (e ? JSON.stringify(e) : '(1 度も呼ばれていない)')
        + '  観測 ' + (p.elapsedMs / 1000).toFixed(1) + ' 秒 (打ち切り = attempts >= '
        + PLAY_ENOUGH_ATTEMPTS + ' or ' + (PLAY_MAX_MS / 1000) + ' 秒)'
        + '  他に計上された呪文 = ' + JSON.stringify(others)
        + (ok ? '' : '  ⛔ allyBurningHands が ' + attempts + ' 回しか走っていない'
          + ' — 魔法使いが編成に居ないか、burning-hands が equippedSkills に入っていない疑い'
          + ' ((0d) を先に見ること)')];
    }],

  ['0d', '[母集団] 魔法使いの equippedSkills に "' + SPELL_ID_BH + '" があり spellSlots が 1 以上',
    m => {
      const p = m.play;
      if (!p || !p.started) return popFail('(0d) 実プレイの起動', (p && p.err) || '—');
      const mg = p.mage;
      if (!mg || mg.err) return popFail('(0d) 仲間の読み出し', (mg && mg.err) || 'allies を読めていない');
      const casters = mg.casters || [];
      if (casters.length === 0) {
        return popFail('(0d) 魔法使い',
          '編成に mage が 1 人も居ない (party = ' + JSON.stringify(mg.party)
          + ' / leader = ' + JSON.stringify(mg.leaderClass) + ')'
          + ' — sessionStorage["dragonfighters.partyMembers"] の仕込みが効いていない');
      }
      const good = casters.filter(a => Array.isArray(a.equippedSkills)
        && a.equippedSkills.indexOf(SPELL_ID_BH) >= 0
        && a.spellSlots && (a.spellSlots[SPELL_ID_BH] || 0) >= 1);
      const ok = good.length >= 1;
      return [ok,
        '魔法使い ' + casters.length + ' 人: '
        + JSON.stringify(casters.map(a => ({ name: a.name, lv: a.level,
          skills: a.equippedSkills, slots: a.spellSlots })))
        + '  knownSpells.mage = ' + JSON.stringify(mg.knownMage)
        + (ok ? '' : '  ⛔ ' + SPELL_ID_BH + ' が装備/配分に入っていない'
          + ' — localStorage["dragonfighters.knownSpells"] と ["dragonfighters.partySkills"] の'
          + ' **両方**を遷移前に仕込む必要がある (依頼書 §2-7)')];
    }],

  // ── §1 STEP1 の恒等 (振る舞いを 1 ビットも変えていない) ──────────────────────
  ['1a', RETREAT_QUERY + ' のアームで、全標本 (' + BOARD_MIN_SAMPLES + ' 件以上) について'
    + ' pickConeDirection の返り値 (方向・タイル集合・count) が'
    + ' **ドライバ側が独立に書いた旧アルゴリズムの再実装**と完全一致する',
    m => {
      const r = m.ref;
      if (!r || !r.booted) return popFail('(1a) 撤退アームの起動', (r && r.err) || 'measureBoard が走っていない');
      const s = refSamples(m);
      if (s.length < BOARD_MIN_SAMPLES) {
        return popFail('(1a) 撤退アームの標本', s.length + ' 件 (< ' + BOARD_MIN_SAMPLES + '): ' + (r.err || '—'));
      }
      const bad = [];
      let legCast = 0, prodCast = 0, prodErr = 0;
      for (const x of s) {
        if (x.legacy) legCast++;
        if (x.prod) prodCast++;
        if (x.prodErr) prodErr++;
        if (!pickEq(x.legacy, x.prod)) bad.push({ seed: x.seed, caster: x.caster, legacy: x.legacy, prod: x.prod, prodErr: x.prodErr });
      }
      const ok = bad.length === 0;
      return [ok,
        '標本 ' + s.length + ' 件  旧アルゴリズムの鏡が撃てた ' + legCast + ' 件 ' + pct(legCast, s.length)
        + ' / 本番が撃てた ' + prodCast + ' 件 ' + pct(prodCast, s.length)
        + '  不一致 ' + bad.length + ' 件  (本番シームが読めなかった標本 ' + prodErr + ' 件)'
        + (ok ? '' : '  ⛔ 先頭 3 件 = ' + JSON.stringify(bad.slice(0, 3)))];
    }],

  ['1b', RETREAT_QUERY + ' のアームで「味方入りの方向」が **1 件も選ばれていない**'
    + ' (拒否権が絶対に戻っている)',
    m => {
      const r = m.ref;
      if (!r || !r.booted) return popFail('(1b) 撤退アームの起動', (r && r.err) || '—');
      const s = refSamples(m);
      if (s.length < BOARD_MIN_SAMPLES) return popFail('(1b) 撤退アームの標本', s.length + ' 件');
      const cast = s.filter(x => x.prod);
      if (cast.length === 0) {
        return popFail('(1b) 撤退アームで撃てた標本', '0 件 — 「1 件も選ばれていない」が自明に緑になる');
      }
      const dirty = cast.filter(x => (x.prod.party || 0) > 0);
      const ok = dirty.length === 0;
      return [ok, '撃てた標本 ' + cast.length + ' 件中、味方入りの方向 ' + dirty.length + ' 件'
        + (ok ? '' : '  ⛔ 先頭 3 件 = ' + JSON.stringify(dirty.slice(0, 3).map(x => ({ seed: x.seed, prod: x.prod }))))];
    }],

  ['1c', RETREAT_QUERY + ' のアームで **斜め方向が 1 件も選ばれていない**',
    m => {
      const r = m.ref;
      if (!r || !r.booted) return popFail('(1c) 撤退アームの起動', (r && r.err) || '—');
      const s = refSamples(m);
      if (s.length < BOARD_MIN_SAMPLES) return popFail('(1c) 撤退アームの標本', s.length + ' 件');
      const cast = s.filter(x => x.prod);
      if (cast.length === 0) return popFail('(1c) 撤退アームで撃てた標本', '0 件 — 自明に緑になる');
      const diag = cast.filter(x => x.prod.dx !== 0 && x.prod.dy !== 0);
      const ok = diag.length === 0;
      return [ok, '撃てた標本 ' + cast.length + ' 件中、斜め方向 ' + diag.length + ' 件'
        + '  (参考: 素のアームの斜め ' + boardSamples(m).filter(x => x.prod && x.prod.dx !== 0 && x.prod.dy !== 0).length + ' 件)'
        + (ok ? '' : '  ⛔ 先頭 3 件 = ' + JSON.stringify(diag.slice(0, 3).map(x => ({ seed: x.seed, prod: x.prod }))))];
    }],

  // ── §2 STEP2 発射率 ─────────────────────────────────────────────────────────
  ['2a', '素のアームの発射率 (= pickConeDirection が非 null を返す割合) が **撤退アームの 3 倍以上**'
    + '  ⛔ 実プレイの % を写経しない (合成盤面なので絶対値は違って当然)。比だけを縛る',
    m => {
      const b = m.board, r = m.ref;
      if (!b || !b.booted) return popFail('(2a) 素のアームの起動', (b && b.err) || '—');
      if (!r || !r.booted) return popFail('(2a) 撤退アームの起動', (r && r.err) || '—');
      const sb = boardSamples(m), sr = refSamples(m);
      if (sb.length < BOARD_MIN_SAMPLES) return popFail('(2a) 素のアームの標本', sb.length + ' 件');
      if (sr.length < BOARD_MIN_SAMPLES) return popFail('(2a) 撤退アームの標本', sr.length + ' 件');
      const cb = sb.filter(x => x.prod).length, cr = sr.filter(x => x.prod).length;
      const rb = cb / sb.length, rr = cr / sr.length;
      const ok = (rb > 0) && (rr > 0 ? rb >= rr * 3 : true);
      return [ok,
        '素 ' + cb + '/' + sb.length + ' = ' + pct(cb, sb.length)
        + '  撤退 ' + cr + '/' + sr.length + ' = ' + pct(cr, sr.length)
        + '  比 = ' + (rr > 0 ? (rb / rr).toFixed(2) + ' 倍' : (rb > 0 ? '∞ (撤退が 0 件)' : '—'))
        + ' (期待 >= 3.00 倍)'
        + (ok ? '' : '  ⛔ ' + (rb <= 0 ? '素のアームで 1 件も撃てていない' : '3 倍に届いていない'))];
    }],

  ['2b', '素のアームで、**清潔な方向 (partyInCone === 0) が実在する標本では必ず清潔な方向が選ばれている**'
    + ' (2 段構えの順序が守られている)'
    + '  ⭐ 母集団 = ドライバ側の独立実装 hasCleanDir が true を返した標本',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(2b) 素のアームの起動', (b && b.err) || '—');
      const sb = boardSamples(m);
      if (sb.length < BOARD_MIN_SAMPLES) return popFail('(2b) 素のアームの標本', sb.length + ' 件');
      const pop = sb.filter(x => x.clean === true);
      if (pop.length < BOARD_MIN_DIFF) {
        return popFail('(2b) 清潔な方向が実在する標本',
          pop.length + ' 件 (< ' + BOARD_MIN_DIFF + ') — この盤面では順序を測れない');
      }
      const bad = pop.filter(x => !x.prod || (x.prod.party || 0) > 0);
      const ok = bad.length === 0;
      return [ok, '母集団 (清潔な方向が実在) ' + pop.length + ' 件中、'
        + '清潔でない方向を選んだ/撃てなかった ' + bad.length + ' 件'
        + '  [記録] 素のアーム全体で味方入りを選んだ ' + sb.filter(x => x.prod && (x.prod.party || 0) > 0).length + ' 件'
        + (ok ? '' : '  ⛔ 先頭 3 件 = ' + JSON.stringify(bad.slice(0, 3).map(x => ({ seed: x.seed, caster: x.caster, prod: x.prod }))))];
    }],

  ['2c', '素のアームで、**敵 0 体の方向は 1 件も選ばれていない** (呪文を空撃ちしない)',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(2c) 素のアームの起動', (b && b.err) || '—');
      const sb = boardSamples(m);
      if (sb.length < BOARD_MIN_SAMPLES) return popFail('(2c) 素のアームの標本', sb.length + ' 件');
      const cast = sb.filter(x => x.prod);
      if (cast.length === 0) return popFail('(2c) 撃てた標本', '0 件 — 自明に緑になる');
      const empty = cast.filter(x => !(x.prod.count >= 1));
      const ok = empty.length === 0;
      return [ok, '撃てた標本 ' + cast.length + ' 件中、敵 0 体の方向 ' + empty.length + ' 件'
        + (ok ? '' : '  ⛔ 先頭 3 件 = ' + JSON.stringify(empty.slice(0, 3).map(x => ({ seed: x.seed, prod: x.prod }))))];
    }],

  // ── §3 STEP3 「届かないときは詰め寄る」 ─────────────────────────────────────
  ['3a', '「対象が 4〜8 マス・視線が通る・円錐の外」の合成盤面で、allyBurningHands が'
    + ' **allyAdvanceTowardPoint を呼び、allyBasicAttack を呼ばない**'
    + '  ⭐ 演出だけ黙らせ、射程/視線/円錐の判断は 1 行も触らない',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(3a) 素のアームの起動', (b && b.err) || '—');
      if (b.advErr) return popFail('(3a) STEP3 の観測装置', b.advErr);
      const found = advCases(m, 'board', 'far').filter(c => c.found);
      const miss = ADV_FAR_REQUIRED.filter(d => !found.some(c => c.dist === d));
      if (miss.length) {
        return popFail('(3a) 盤面', '距離 ' + miss.join('/') + ' マスの「円錐の外・視線が通る」盤面が'
          + '実マップ上に見つからない (作れた距離 = ' + JSON.stringify(found.map(c => c.dist)) + ')');
      }
      const bad = found.filter(c => !(c.adv && !c.basic));
      const ok = bad.length === 0;
      return [ok, found.map(c => c.dist + 'マス→' + (c.adv ? 'ADV' : '') + (c.basic ? 'BASIC' : '')
        + (!c.adv && !c.basic ? '(詠唱した)' : '')).join(' / ')
        + (ok ? '' : '  ⛔ ' + JSON.stringify(bad.slice(0, 3)))];
    }],

  ['3b', '「対象が 9 マス以上 (= medium の 8 マスの外)」では **allyAdvanceTowardPoint を呼ばず'
    + ' allyBasicAttack へ落ちる** (無限に歩き続けない)',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(3b) 素のアームの起動', (b && b.err) || '—');
      if (b.advErr) return popFail('(3b) STEP3 の観測装置', b.advErr);
      const found = advCases(m, 'board', 'out').filter(c => c.found);
      const miss = ADV_OUT_REQUIRED.filter(d => !found.some(c => c.dist === d));
      if (miss.length) {
        return popFail('(3b) 盤面', '距離 ' + miss.join('/') + ' マスの「視線が通る」盤面が見つからない'
          + ' (作れた距離 = ' + JSON.stringify(found.map(c => c.dist)) + ')');
      }
      const bad = found.filter(c => !(c.basic && !c.adv));
      const ok = bad.length === 0;
      return [ok, found.map(c => c.dist + 'マス→' + (c.adv ? 'ADV' : '') + (c.basic ? 'BASIC' : '')
        + (!c.adv && !c.basic ? '(詠唱した)' : '')).join(' / ')
        + (ok ? '' : '  ⛔ ' + JSON.stringify(bad.slice(0, 3)))];
    }],

  ['3c', '「対象が円錐の実効射程内 (0〜3 マス)」では **1 件も allyAdvanceTowardPoint を呼ばない**。'
    + 'うち **円錐が 1 方向も立たない盤面 (術者と同じマス) は allyBasicAttack へ落ちる** (その場で足踏みしない)'
    + '  ⚠ 依頼書 §8 の「隣接 1 マスなのに円錐へ入らない」は 8 方向では原理的に作れないので測定点を移した'
    + ' (隣接 8 マスは必ずどれかの円錐の step1 に入る)',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(3c) 素のアームの起動', (b && b.err) || '—');
      if (b.advErr) return popFail('(3c) STEP3 の観測装置', b.advErr);
      const found = advCases(m, 'board', 'near').filter(c => c.found);
      const miss = ADV_NEAR_REQUIRED.filter(d => !found.some(c => c.dist === d));
      if (miss.length) {
        return popFail('(3c) 盤面', '距離 ' + miss.join('/') + ' マスの盤面が見つからない'
          + ' (作れた距離 = ' + JSON.stringify(found.map(c => c.dist)) + ')');
      }
      const walked = found.filter(c => c.adv);
      const zero = found.filter(c => c.dist === 0);
      const zeroBad = zero.filter(c => !(c.basic && !c.adv));
      const ok = walked.length === 0 && zeroBad.length === 0;
      return [ok, found.map(c => c.dist + 'マス' + (c.inCone ? '(円錐内)' : '(円錐外)') + '→'
        + (c.adv ? 'ADV' : '') + (c.basic ? 'BASIC' : '')
        + (!c.adv && !c.basic ? '詠唱' : '')).join(' / ')
        + (ok ? '' : '  ⛔ ' + (walked.length ? '詰め寄った ' + walked.length + ' 件 ' : '')
          + (zeroBad.length ? '距離 0 で allyBasicAttack へ落ちていない ' + JSON.stringify(zeroBad) : ''))];
    }],

  ['3d', RETREAT_QUERY + ' では (3a) の盤面でも **allyAdvanceTowardPoint を呼ばない**'
    + ' (2026-09-04 以前の挙動へ完全に戻る)',
    m => {
      const r = m.ref;
      if (!r || !r.booted) return popFail('(3d) 撤退アームの起動', (r && r.err) || '—');
      if (r.advErr) return popFail('(3d) STEP3 の観測装置 (撤退アーム)', r.advErr);
      const found = advCases(m, 'ref', 'far').filter(c => c.found);
      const miss = ADV_FAR_REQUIRED.filter(d => !found.some(c => c.dist === d));
      if (miss.length) {
        return popFail('(3d) 盤面', '距離 ' + miss.join('/') + ' マスの盤面が撤退アームで作れない'
          + ' (作れた距離 = ' + JSON.stringify(found.map(c => c.dist)) + ')');
      }
      const bad = found.filter(c => c.adv || !c.basic);
      const ok = bad.length === 0;
      return [ok, found.map(c => c.dist + 'マス→' + (c.adv ? 'ADV' : '') + (c.basic ? 'BASIC' : '')
        + (!c.adv && !c.basic ? '(詠唱した)' : '')).join(' / ')
        + (ok ? '' : '  ⛔ ' + JSON.stringify(bad.slice(0, 3)))];
    }],

  // ── §4 コーンオブコールドにも同じ改善が効く ────────────────────────────────
  ['4a', '配信ソース上で、allyBurningHands / allyConeOfCold の本文に `' + LEGACY_DIR_MARK + '` が **0 件**'
    + ' かつ pickConeDirection の呼び出しが在る (旧探索ブロックが 2 本とも残っていない)',
    m => {
      const src = m ? m.served : null;
      if (typeof src !== 'string' || src.length < 100000) {
        return popFail('(4a) 配信ソース', '配信バイトが読めていない (' + (src ? src.length : 'null') + 'B)');
      }
      const rows = CONE_FN_HEADS.map(h => {
        const body = fnBodyOf(src, h);
        const name = h.replace('async function ', '').replace('(ally, enemyIdx) {', '');
        return { fn: name, found: body !== null, bytes: body ? body.length : 0,
          legacyDirs: body ? (body.split(LEGACY_DIR_MARK).length - 1) : -1,
          helper: body ? (body.split('pickConeDirection(').length - 1) : 0 };
      });
      const ok = rows.every(r => r.found && r.legacyDirs === 0 && r.helper >= 1);
      return [ok, JSON.stringify(rows)
        + '  [記録] 配信全体の `' + LEGACY_DIR_MARK + '` = '
        + (src.split(LEGACY_DIR_MARK).length - 1) + ' 件 (allyLightningBolt の 8 方向は別物なので残る)'
        + (ok ? '' : '  ⛔ 旧探索ブロックが残っている / ヘルパーを呼んでいない')];
    }],

  ['4b', '同じ合成盤面 (同じ seed 列) で、コーンオブコールドの発射率もバーニングハンズと **同じ値**になる'
    + '  ⭐ 探索が 1 本のヘルパーへ寄っていることの機械的証明',
    m => {
      const b = m.board;
      if (!b || !b.booted) return popFail('(4b) 素のアームの起動', (b && b.err) || '—');
      if (b.ratesErr || !b.rates) return popFail('(4b) 発射率の観測', b.ratesErr || 'rates が採れていない');
      const bh = b.rates.allyBurningHands, cc = b.rates.allyConeOfCold;
      if (!bh || !cc) return popFail('(4b) 発射率の観測', JSON.stringify(b.rates));
      if (bh.attempts < RATE_MIN_ATTEMPTS || cc.attempts < RATE_MIN_ATTEMPTS) {
        return popFail('(4b) 母集団', 'attempts = ' + bh.attempts + ' / ' + cc.attempts
          + ' (< ' + RATE_MIN_ATTEMPTS + ') — noteAoeOutcome が呼ばれていない疑い: '
          + JSON.stringify({ bh: bh, cc: cc }));
      }
      const ok = bh.attempts === cc.attempts && bh.cast === cc.cast;
      return [ok,
        'バーニングハンズ ' + bh.cast + '/' + bh.attempts + ' = ' + pct(bh.cast, bh.attempts)
        + '  コーンオブコールド ' + cc.cast + '/' + cc.attempts + ' = ' + pct(cc.cast, cc.attempts)
        + '  (盤面 ' + bh.n + ' / ' + cc.n + ' 件、実行時の例外 ' + bh.errs + ' / ' + cc.errs + ' 件'
        + (bh.firstErr || cc.firstErr ? ' 先頭 = ' + JSON.stringify(bh.firstErr || cc.firstErr) : '') + ')'
        + (ok ? '' : '  ⛔ 発射率が違う = 探索が 1 本に寄っていない')];
    }],

  // ── §5 実プレイ (母集団と非退行の確認のみ) ─────────────────────────────────
  ['5a', (PLAY_MAX_MS / 1000) + ' 秒の実プレイで __aoeStats["' + AOE_KEY_BH + '"].cast >= 1'
    + '  ⭐ 「1 発以上撃った」だけを見る (率は合成盤面で測る)',
    m => {
      const p = m.play;
      if (!p || !p.started) return popFail('(5a) 実プレイの起動', (p && p.err) || 'measurePlay が走っていない');
      if (!p.stats) return popFail('(5a) 観測シーム', 'window.__aoeStats が undefined のまま');
      const e = p.stats[AOE_KEY_BH] || null;
      const attempts = e ? (e.attempts || 0) : 0;
      if (attempts < PLAY_MIN_ATTEMPTS) {
        return popFail('(5a) 実プレイの母集団', AOE_KEY_BH + ' の attempts = ' + attempts
          + ' (< ' + PLAY_MIN_ATTEMPTS + ') — (0c)(0d) を先に見ること');
      }
      const cast = e ? (e.cast || 0) : 0;
      const ok = cast >= 1;
      return [ok, AOE_KEY_BH + ': ' + JSON.stringify(e)
        + '  観測 ' + (p.elapsedMs / 1000).toFixed(1) + ' 秒'
        + (ok ? '' : '  ⛔ ' + attempts + ' 回選ばれて 1 度も発射できていない (= 報告された症状そのもの)')];
    }],

  ['5b', 'pageerror が 0 件',
    m => {
      const bad = pageErrorsOf(m);
      const p = m.play;
      const ok = bad.length === 0;
      return [ok, 'pageerror ' + bad.length + ' 件'
        + '  (参考: 実プレイの console.error ' + ((p && p.consoleErrs) ? p.consoleErrs.length : 0) + ' 件)'
        + (ok ? '' : '  ⛔ ' + bad.slice(0, 4).join(' | '))];
    }],

  // ── §6 撤退 ────────────────────────────────────────────────────────────────
  ['6a', 'index.html' + RETREAT_QUERY + ' で (1a)(1b)(1c)(3d) が全部成立する'
    + '  ⚠⚠⚠ これだけを受入条件にしない — 素のアームの (2a)(2b)(2c)(3a)(3b)(3c) と**対**で見ること',
    m => {
      const keys = ['1a', '1b', '1c', '3d'];
      const rows = keys.map(k => {
        const a = ASSERT_OF[k];
        if (!a) return { key: k, ok: false, detail: '⛔ ASSERTS に無い' };
        const r = a[2](m);
        return { key: k, ok: !!r[0], detail: r[1] };
      });
      const ok = rows.every(r => r.ok);
      return [ok, rows.map(r => '(' + r.key + ')' + (r.ok ? '○' : '✕')).join(' ')
        + (ok ? '' : '  ⛔ ' + rows.filter(r => !r.ok).map(r => '(' + r.key + ') ' + r.detail).join('  ||  '))];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 節の枠組み (⭐ 後続の項目は keys へキーを足し、pend から同じキーを外すだけでよい)
//   ⛔ keys と pend の両方に同じキーを置かないこと (数が合わなくなる)。
//   ⛔ 節ごと削除しないこと — 削ると「宣言してから実装する」型そのものが消える。
// ══════════════════════════════════════════════════════════════════════════════
const SECTIONS = [
  { title: '§0 装置 (先に母集団を確かめる) — ⭐ ここが立たないと §1〜§6 は全部空振りで永久緑',
    keys: ['0a', '0b', '0c', '0d'], pend: [] },

  { title: '§1 STEP1 の恒等 (振る舞いを 1 ビットも変えていない) — アーム ' + RETREAT_QUERY,
    keys: ['1a', '1b', '1c'], pend: [] },

  { title: '§2 STEP2 — 発射率が上がる (⛔ 実プレイの % を写経しない。合成盤面で測る)',
    keys: ['2a', '2b', '2c'], pend: [] },

  { title: '§3 STEP3 — 届かないときは詰め寄る (⭐ 呼び出しはスタブで観測する。判断は 1 行も触らない)',
    keys: ['3a', '3b', '3c', '3d'], pend: [] },

  { title: '§4 コーンオブコールドにも同じ改善が効く (探索が 1 本に寄っていることの機械的証明)',
    keys: ['4a', '4b'], pend: [] },

  { title: '§5 実プレイ (母集団と非退行の確認のみ。⛔ 率は合成盤面で測る)',
    keys: ['5a', '5b'], pend: [] },

  { title: '§6 撤退 ' + RETREAT_QUERY
      + ' — ⚠⚠⚠ **(6a) だけを受入条件にしない** (#39 の「撤退アームだけの受入条件は永久緑」の轍)',
    keys: ['6a'], pend: [] },
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_conecast_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  /* ⚠ ポートは **MUT_ORDER の並び**で固定的に割り当てる (impl の増減で番号が動かないように)。
     9941〜9954 が変異 14 本ぶん (予約は 9958 まで / 予備 9959)。撤退アームの基準ページは 9960。 */
  MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
  const RETREAT_PORT = PORT + 20;

  console.log('=== verify_cone_cast.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   撤退アーム:' + RETREAT_PORT + ' (' + RETREAT_QUERY + ')'
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない = 項目 3 の担当)'));

  /* ⭐ 撤退アームを見る assert ((1a)(1b)(1c)(2a)(3d)(6a)) はまだ 1 本も実装されていないので、
     項目 1 が実際に listen するのは base の 1 本だけ。⛔ 使わないポートは開かない。 */
  const needRetreat = !NEGATIVE && SECTIONS.some(s => s.keys.some(k => REF_ASSERTS[k]));
  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (needRetreat) servers.push(await startServer(RETREAT_PORT, null));
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      const served = await httpGet('http://localhost:' + PORT + PAGE_PATH);
      const m = { servedBytes: served.body.length, served: served.body, errs: errs };
      /* ⭐ 合成盤面を**先**に採る (数秒)。実プレイは 90 秒かかるので、そこで転んでも
         §0 の (0a)(0b) の記録が残る。 */
      m.board = await measureBoard(browser, PORT, errs, {});
      m.play = await measurePlayOnce(browser, PORT, errs, {});
      if (needRetreat) {
        m.refErrs = [];
        m.ref = await measureBoard(browser, RETREAT_PORT, m.refErrs, { query: RETREAT_QUERY });
        for (const e of m.refErrs) errs.push(e);
      }

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

      mark('[記録] 合成盤面 (⛔ 期待値ではない。読み解き用 / 項目 2 への材料)');
      const t = boardTally(m);
      const b = m.board;
      console.log('       URL ' + (b ? b.url : '—') + '  起動 ' + (b && b.booted ? 'OK' : '⛔ NG')
        + (b && b.err ? '  err=' + b.err : ''));
      console.log('       盤面情報 ' + JSON.stringify(b && b.info ? b.info : null));
      console.log('       標本 ' + t.n + ' 件 / 試行 ' + (b ? b.tries : 0)
        + '   旧 ' + t.legacyCast + ' (' + pct(t.legacyCast, t.n) + ')'
        + ' → 新 ' + t.neoCast + ' (' + pct(t.neoCast, t.n) + ')'
        + '   差 ' + t.diff + ' / 逆転 ' + t.reverse
        + '   両方 null ' + t.bothNull + ' / 両方 cast ' + t.bothCast);
      console.log('       新の内訳: 斜め ' + t.neoDiag + ' 件 / 味方入り ' + t.neoDirty + ' 件'
        + '   清潔な方向が在る標本 ' + t.cleanExists + ' 件'
        + '   本番 pickConeDirection: cast ' + t.prodCast + ' / 取れなかった ' + t.prodErr + ' 件');
      const firstErr = boardSamples(m).map(r => r.prodErr).filter(Boolean)[0] || null;
      if (firstErr) console.log('       本番シームが読めない理由 (先頭 1 件): ' + JSON.stringify(firstErr));
      for (const r of boardSamples(m).slice(0, 3)) {
        console.log('         seed=' + r.seed + ' caster=' + JSON.stringify(r.caster)
          + ' foes=' + r.foes + ' allies=' + r.allies + ' front=' + r.nFront + ' back=' + r.backDist
          + ' clean=' + r.clean
          + '\n           legacy=' + JSON.stringify(r.legacy)
          + '\n           neo   =' + JSON.stringify(r.neo)
          + '\n           prod  =' + JSON.stringify(r.prod));
      }

      mark('[記録] STEP3 の盤面と §4 の発射率 (⛔ 期待値ではない。読み解き用)');
      for (const arm of ['board', 'ref']) {
        const bb = m[arm];
        if (!bb) { console.log('       ' + arm + ': —'); continue; }
        console.log('       ' + arm + ' (' + (arm === 'ref' ? RETREAT_QUERY : '素')
          + ') 装置 = ' + JSON.stringify(bb.advInfo || null) + (bb.advErr ? '  ⛔ ' + bb.advErr : ''));
        for (const c of (bb.adv || [])) {
          console.log('         [' + c.tag + '] 距離 ' + c.dist
            + (c.found ? ' 術者' + JSON.stringify(c.caster) + '→的' + JSON.stringify(c.target)
              + ' 円錐内=' + c.inCone + ' 本番探索null=' + c.prodNull
              + '  → ' + (c.trace.length ? c.trace.join(',') : '(どちらも呼ばれず=詠唱した)')
              + (c.err ? '  err=' + c.err : '')
              : '  ⛔ 盤面が作れない'));
        }
      }
      console.log('       (4b) 発射率 = ' + JSON.stringify(m.board ? (m.board.rates || m.board.ratesErr || null) : null));

      mark('[記録] 実プレイ (⛔ 期待値ではない。母集団の材料)');
      const p = m.play;
      console.log('       URL ' + (p ? p.url : '—') + '  起動 ' + (p && p.started ? 'OK' : '⛔ NG')
        + '  観測 ' + (p ? (p.elapsedMs / 1000).toFixed(1) : '—') + ' 秒'
        + (p && p.err ? '  err=' + p.err : ''));
      console.log('       __aoeStats = ' + JSON.stringify(p && p.stats ? p.stats : null));
      console.log('       編成 = ' + JSON.stringify(p && p.mage ? p.mage.party : null)
        + '  頭 = ' + JSON.stringify(p && p.mage ? p.mage.leaderClass : null));
      console.log('       魔法使い = ' + JSON.stringify(p && p.mage ? p.mage.casters : null));
      console.log('       撤退アーム ' + (m.ref
        ? ':' + RETREAT_PORT + RETREAT_QUERY + '  起動 ' + (m.ref.booted ? 'OK' : '⛔ NG')
          + '  標本 ' + (m.ref.samples || []).length + ' 件'
        : '— (needRetreat=false / (1a)(6a) は項目 2 の担当)'));

      mark('事故の記録 (判定は (5b) = 項目 2 の担当。⛔ ここで黙って捨てない)');
      console.log('       pageerror: ' + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 6).join('\n         ') : ''));
      const cerr = (p && p.consoleErrs) ? p.consoleErrs : [];
      console.log('       実プレイの console.error: ' + cerr.length + ' 件'
        + (cerr.length ? '\n         ' + cerr.slice(0, 6).join('\n         ') : ''));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          if (typeof MUTATIONS[k].verifyServed === 'function') {
            const v = MUTATIONS[k].verifyServed(pure.body, mut.body);
            check('(n0a-' + k + ') 変換で配った欠陥が素に無く、変異側にだけ在る', v[0],
              f + '  ' + v[1] + (MUT_SRC[k].note ? '  [' + MUT_SRC[k].note + ']' : ''));
          } else {
            const eds = editsOf(MUTATIONS[k]);
            const bad = eds.filter(e =>
              !(pure.body.split(e.to).length - 1 === 0 && mut.body.split(e.to).length - 1 === 1));
            check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある'
              + (eds.length > 1 ? ' (置換 ' + eds.length + ' 箇所すべて)' : ''),
              bad.length === 0,
              f + (bad.length ? '  ⛔ 当たっていない置換: '
                + bad.map(e => JSON.stringify(String(e.to).slice(0, 50))).join(' / ') : ''));
          }
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length,
            '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }
      }

      if (MUT_IMPL.length) {
        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = (MUTATIONS[k].file === 'driver') ? PORT : PORT_OF[k];
          const wants = MUTATIONS[k].targets.concat(MUTATIONS[k].record || []);
          const wantPlay = wants.some(x => PLAY_ASSERTS[x]);
          const wantRef = wants.some(x => REF_ASSERTS[x]);
          /* ⭐ ドライバ側の変異は **測定側**へ渡す (#48 の「期待側を const で切り替えると
             --negative で黙って空振りする」罠の裏返し)。⛔ MUTATE を見て分岐しない。 */
          const boardOpts = (k === 'flatpop') ? { flat: true } : {};
          const playOpts = (k === 'noknown') ? { dropKnown: true } : {};
          console.log('       [変異 ' + k + ' :' + port + '] 実プレイ '
            + (wantPlay ? 'あり' : 'なし (合成盤面のみ)') + ' / 撤退アーム ' + (wantRef ? 'あり' : 'なし'));
          const servedNeg = await httpGet('http://localhost:' + port + PAGE_PATH);
          const mm = { servedBytes: servedNeg.body.length, served: servedNeg.body, errs: negErrs };
          mm.board = await measureBoard(browser, port, negErrs, boardOpts);
          if (wantPlay) mm.play = await measurePlayOnce(browser, port, negErrs, playOpts);
          if (wantRef) {
            mm.refErrs = [];
            mm.ref = await measureBoard(browser, port, mm.refErrs,
              Object.assign({ query: RETREAT_QUERY }, boardOpts));
          }
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](mm);
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
              r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
          }
          for (const key of (MUTATIONS[k].record || [])) {
            const a = ASSERT_OF[key];
            if (!a) continue;
            const r = a[2](mm);
            console.log('       [記録・⛔ 判定しない] 変異 ' + k + ' でも ('
              + key + ') は ' + (r[0] ? '緑のまま' : '⛔ 赤になった') + '  — ' + r[1]);
          }
        }
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⛔ 件数から隠さない)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file
            + ' / 当て先の下見: ' + MUTATIONS[k].plan + ']');
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length);
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
