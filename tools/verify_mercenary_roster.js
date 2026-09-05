#!/usr/bin/env node
/*
 * tools/verify_mercenary_roster.js — 傭兵名簿 (実装依頼書 #38) の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_mercenary_roster.js [--headful] [--port N]
 *   node tools/verify_mercenary_roster.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_mercenary_roster.js --negative --only badprefix
 *
 * ⚠ ポートの既定は **8931**。既存 golden (8891 前後) と当たらないようにしてある。
 *
 * ── 担当表 (どの節が何を守っているか) ─────────────────────────────────────
 *   §0 装置  … 母集団。⭐⭐⭐ (0a) が無いと「名簿から引けていないのに全部緑」になる
 *   §1 再登板… 同じ顔が返ってくる。2 経路 (名簿の実体 / 出発が焼いた partyMembers) で突き合わせ
 *   §2 成長  … 生還で増え、敗北で増えない。主人公 Lv による clamp は出発時と表示時で同じ関数
 *   §3 器    … 前置詞・スロット・上限・見送り
 *   §5 恒等  … 名簿が空なら従来と 1 バイトも変わらない / 装備 3 キーが動かない / lastResult の既存キー
 *   §6 帰還  … index が書いた lastResult を酒場の consumeResult() が消費して名簿が育つ (項目2)
 *   §4 パネル… HUD の入口 (左上の縦列 3 段目) と名簿パネルの開閉・重なり・スクロール (項目3)
 *   §撤退… ?roster=0 で名簿を **書かない / 読まない / 入口を出さない**、それでも
 *            既に貯まった名簿を **消さない** (項目4)
 *   ⛔ この窓のスコープ外の受入条件は **ドライバにまだ書かない** (PENDING を残さない)。
 *   ⭐ 項目4 で変異表が 10/10 本そろった (依頼書 §9 の 9 本 + 項目2 の nolevelclamp)。
 *
 * ── ⛔ 測らないこと (依頼書 §9 の末尾) ────────────────────────────────────
 *   パネルの配色・文言・行の並び順 / 「何回の生還で Lv+1 か」という数値 / 名簿から引く確率。
 *   ⭐ 測るのは「生還で増え、敗北で増えない」という **向き** と、
 *      「引かれることがある」「空なら必ず新顔」の 2 点だけ。
 *
 * ── ⚠⚠ 名簿は「本番の関数で」育てる ──────────────────────────────────────
 *   ⛔ localStorage へ手で JSON を書いて名簿を作らない (実装とドライバが同じ間違いを共有する)。
 *   本番の regeneratePartyMembers() → departToScenario() を実際に走らせて育てる。
 *   ⚠ departToScenario() は最後に location.href を書くので **遷移を横取りする**
 *     (setRequestInterception で tavern.html 以外の main-frame ナビゲーションを abort。
 *      verify_quest_walk / probe_party_size と同じ作法)。
 *
 * ── ⛔⛔⛔ 計測シームは本番ファイルに置かない ────────────────────────────
 *   (0a) は pickCompanion() の **どの枝を通ったか** を数える必要がある。しかし本番ファイルへ
 *   計測シームを置く設計は、このリポジトリでは原理的にコミットできない
 *   (changelog ガード / --no-verify のハードブロック。probe_party_size.js の冒頭に実測記録)。
 *   ⭐ 結論 = **シームは検証ツール側へ寄せる**。起動時に凍結した配信スナップショットへ注入し、
 *     ディスクの tavern.html は 1 バイトも変えない。(0z1) が両側で機械検査する。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ────────────────────────────
 *  - classic script 直下の let/const/function は window に載らない。evaluate の中の
 *    **裸の識別子**なら読める (scenarios / selection / prepScenario / NPC_NAMES …)。
 *  - evaluateOnNewDocument は **全ナビゲーションで再実行される**。purge は 1 タブ 1 回だけ。
 *  - tavern.html はディスク上 **CRLF**。アンカーは **1 行に収める** (改行を生成しない)。
 *  - 変異はディスクを書き換えず **配信を差し替える** (復元漏れが原理的に起きない)。
 *  - 「変異を入れたのに緑」は受入条件が何も検出していない証拠。空振りしたら exit 1。
 *
 * exit 0 = 期待どおり / 1 = assert が落ちた or 負のコントロールが空回り
 *        / 2 = 環境不足 / 3 = 装置の故障 (アンカーが腐った等)
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
/* ⚠ 既定 8931。orchestrator が既存 golden を 8891 前後で回すので当てない。 */
const PORT     = parseInt(arg('port', '8931'), 10);
const HEADFUL  = argv.includes('--headful');
const NEGATIVE = argv.includes('--negative');
const ONLY     = (arg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);

/* 名簿を育てる腕。orc-fort = ★3 → NPC 3 人 (recruitCountOf)。
   ⭐ 人数はドライバが写経せず、本番が焼いた partyMembers の実体から数える。 */
const GROW_SCEN  = 'orc-fort';
const GROW_MAIN  = 14;   /* §0 §1 §3d 用の最低周回数 */
const GROW_MAX   = 40;   /* 同・上限。⭐ 名簿が満杯になるまで回す (必要周回数は抽選運でばらつく) */
const GROW_SMALL = 6;    /* §2 §3 用 */

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結
 *   起動時に 1 回だけ読んでメモリへ載せ、以後はそこからだけ返す = **1 起動 = 1 ビルド**。
 *   走行中に別窓が tavern.html を保存しても、前半と後半で別ビルドを測ることが起きない。
 *   ⭐ 変異 (--negative) と計測シームの注入は、どちらも **このスナップショットにだけ**掛かる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {};
(function freezeAll() {
  ['index.html', 'tavern.html', 'world.html', 'town.html', 'title.html', 'audio.js'].forEach((f) => {
    const fp = path.join(ROOT, f);
    if (fs.existsSync(fp)) FROZEN['/' + f] = fs.readFileSync(fp, 'utf8');
  });
  const jsDir = path.join(ROOT, 'js');
  fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).forEach((f) => {
    FROZEN['/js/' + f] = fs.readFileSync(path.join(jsDir, f), 'utf8');
  });
})();

/* ── 置換の共通口。アンカーが期待した数だけ当たらなければ **走らせる前に exit 3**。
      腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ。 */
function patch(kind, label, key, from, to, wantHits) {
  const src = FROZEN[key];
  if (src === undefined) {
    console.error('[driver] ' + kind + ' ' + label + ': 配信スナップショットに ' + key + ' がありません');
    process.exit(3);
  }
  const want = (wantHits === undefined) ? 1 : wantHits;
  const hits = src.split(from).length - 1;
  if (hits !== want) {
    console.error('[driver] ' + kind + ' ' + label + ' の注入点が ' + hits + ' 箇所 (期待 ' + want + ')。'
      + 'アンカーが腐っています:');
    console.error('         ' + JSON.stringify(from.slice(0, 160)));
    process.exit(3);
  }
  FROZEN[key] = src.split(from).join(to);
  return hits;
}

/* index.html の lastResult 書き込みブロックを配信バイトから切り出す (§5 (5c2) / §6 用)。
   ⭐ 撤退経路 (retreated: true) は実プレイで踏むのが難しい —— 撤退ボタンは gameStarted かつ
     非交戦中でしか押せず、押してから 4 秒以上の演出を待つ。そこで「書き込み点が 2 つあり、
     両方が roster を載せている」だけは **構造** で縛る。
   ⚠⚠ #34 の罠「配信バイトを正規表現で数える assert の近くではコメントも数えられる」を避けるため、
     探すのは実際の呼び `roster: rosterResultPayload(` にする (私が書いたコメントには
     "?roster=0" とは書いてあるが "roster: rosterResultPayload(" は 1 度も出てこない)。 */
function lastResultBlocks(src) {
  const MARK = 'sessionStorage.setItem("dragonfighters.lastResult", JSON.stringify({';
  const out = [];
  let i = 0;
  for (;;) {
    const at = src.indexOf(MARK, i);
    if (at < 0) break;
    const end = src.indexOf('}));', at);
    out.push(src.slice(at, end < 0 ? Math.min(at + 4000, src.length) : end));
    i = at + MARK.length;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 計測シームの実行時注入 — pickCompanion() の **枝カウンタ**
 *   ⭐⭐⭐ (0a) の本体。「名簿から引いたのか / 新顔を作ったのか」を、返り値の mercId ではなく
 *     **通った枝そのもの**で数える (mercId で数えると、書き戻し側と同じ間違いを共有する)。
 *   ⚠ 改行を 1 つも生成しない = tavern.html が CRLF でも LF でも当たり方が変わらない。
 *   ⚠ window.__rosterSeam が無い間は何もしない (ReferenceError を作らない)。
 * ══════════════════════════════════════════════════════════════════════════ */
const BUMP = (k) => ' if (window.__rosterSeam) { window.__rosterSeam.calls++; window.__rosterSeam.'
  + k + '++; }';
const SEAM_INJECTIONS = [
  { label: '(a) 名簿 OFF の枝',
    from: '    if (!(window.DFRoster && DFRoster.enabled())) return makeNpcMember(classKey, usedNames);   // 名簿 OFF の枝',
    to:   '    if (!(window.DFRoster && DFRoster.enabled())) {' + BUMP('off')
        + ' return makeNpcMember(classKey, usedNames); }   // 名簿 OFF の枝' },
  { label: '(b) 満杯かつその職が 0 人の枝',
    from: '    if (n <= 0) return makeNpcMember(classKey, usedNames);   // 満杯かつその職が名簿に 0 人の枝',
    to:   '    if (n <= 0) {' + BUMP('fullMiss') + BUMP('fromNew')
        + ' return makeNpcMember(classKey, usedNames); }   // 満杯かつその職が名簿に 0 人の枝' },
  { label: '(c) 新顔を作る枝',
    from: '    if (i >= vets.length) return makeNpcMember(classKey, usedNames);   // 新顔を作る枝',
    to:   '    if (i >= vets.length) {' + BUMP('fromNew')
        + ' return makeNpcMember(classKey, usedNames); }   // 新顔を作る枝' },
  { label: '(d) 名簿から引く枝',
    from: '    const v = vets[i];                                                 // 名簿から引く枝',
    to:   '    const v = vets[i];' + BUMP('fromRoster') + '   // 名簿から引く枝' },
];
SEAM_INJECTIONS.forEach((inj) => patch('計測シーム', inj.label, '/tavern.html', inj.from, inj.to, 1));

/* ⚠⚠ 注入順は **シーム → 変異**。だから「シームが書き換えた行」を変異の対象にするときは、
   ディスクの原文ではなく **注入後の文字列** をアンカーにしなければ当たらない (patch() が exit 3)。
   ⛔ 番号 (SEAM_INJECTIONS[2]) で引かない —— 並びが変わると黙って別の枝を壊す。 */
function seamTo(prefix) {
  const hit = SEAM_INJECTIONS.filter((x) => x.label.indexOf(prefix) === 0);
  if (hit.length !== 1) {
    console.error('[driver] seamTo(' + prefix + ') が ' + hit.length + ' 件に当たりました');
    process.exit(3);
  }
  return hit[0].to;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 負のコントロール (--negative)
 *   ⛔⛔ 本番ファイルは 1 バイトも書き換えない。**配信バイトだけ**を変異させて配る。
 *   ⚠⚠ 変異は **1 本ずつ**注入する。全部同時に入れると互いを覆い隠す
 *      (#34 / #37 で実測)。素の --negative は自分自身を子プロセスで 1 タグずつ呼び直す。
 *
 *   ⭐ 項目1 が用意したのは **badprefix 1 本 + 注入機構**。項目2 が **nolevelclamp** を足した
 *      (項目2 で新設した受入条件 (2e) 専用。依頼書 §9 の 9 本の表には無い 10 本目)。
 *      依頼書 §9 の残り 8 本 (noclamp / defeatgrows / nocap / alwaysroster / reuseid /
 *      switchleak / noretreatswitch / fadeclose) は **項目4 の仕事**。⛔ 表に嘘の行を足さないこと。
 *   ⚠ 項目4 へ: 依頼書の `noclamp` (assignCompanionLevels から clamp を外す → (2c) が赤) の
 *      アンカーは項目2 で変わった。いまの clamp は clampCompanionLevel() 1 関数に集約されており、
 *      出発時は `m.level = clampCompanionLevel(m.level, heroLevel);` の 1 行。
 *      ⛔ clampCompanionLevel() の中身を壊すと (2c) と (2e) が **同時に** 赤くなって
 *        「どちらの欠陥を検出したのか」が判らなくなる。noclamp は出発側の呼びだけを外すこと。
 * ══════════════════════════════════════════════════════════════════════════ */
const NEG_EXPECT = {
  /* キーの前置詞を dragonfighters. から外す = js/save-slots.js の keysOf() (前置詞総なめ) が
     黙って効かなくなる。依頼書 §2-3 の罠そのもの。 */
  badprefix: ['(3a)', '(3b)', '(3c)'],
  /* 準備画面の表示 Lv を clamp せず素の名簿 Lv で返す = 項目1 の worker が見つけた欠陥そのもの。
     recordRun() が主人公 Lv を超えて育てた Lv がそのまま skillLimitForClass() に渡り、
     **出発後の実 Lv より多いスキルスロット**が準備画面に出る。 */
  nolevelclamp: ['(2e)'],
  /* ══ ここから下は依頼書 §9 の残り 8 本 (項目4 で実装) ══════════════════════
     ⚠ 「赤くなるべき節」は依頼書 §9 の表のとおり。⛔ 表に無いラベルを期待に足して
        「巻き添えも想定内」ということにしない —— 巻き添えは報告する対象であって、
        期待に混ぜてしまうと二重検出を隠すことになる。 */
  /* 閉じるボタンが display ではなく opacity だけを落とす = 見えないのに押せる板が残る。 */
  fadeclose: ['(4c)'],
  /* ?roster=0 を無視する (酒場側の 2 つのゲート = 入口の門番 と enabled() を両方潰す)。 */
  noretreatswitch: ['(6a)'],
  /* CAP を無視して名簿が無限に増える。 */
  nocap: ['(3d)'],
  /* release() が next を巻き戻し、単調増加の押し上げも失って id が再利用される。 */
  reuseid: ['(3e)'],
  /* 敗北でも runs を増やす (「今回は仲間を死なせない = 敗北の罰は名簿に無い」が壊れる)。 */
  defeatgrows: ['(2b)', '(2f2)'],
  /* 名簿が空でも makeNpcMember へ落ちず、名簿の形をした半端な人物を作って登録する。 */
  alwaysroster: ['(0a)', '(5a)'],
  /* 出発時の clamp の **呼びだけ** を外す (⛔ clampCompanionLevel() の中身は壊さない)。 */
  noclamp: ['(2c)'],
  /* snapshot() の data から名簿が落ちる (スロットへ焼かれない)。 */
  switchleak: ['(3c)'],
};
const NEG_MUTATE = {
  badprefix: () => patch('負のコントロール', 'badprefix (キーの前置詞を外す)',
    '/js/mercenary-roster.js',
    'var KEY = "dragonfighters.mercRoster";',
    'var KEY = "df.mercRoster";   /* badprefix */', 1),
  nolevelclamp: () => patch('負のコントロール', 'nolevelclamp (表示 Lv の clamp を外す)',
    '/tavern.html',
    'if (m && typeof m.level === "number" && m.level > 0) return clampCompanionLevel(m.level, heroLv);',
    'if (m && typeof m.level === "number" && m.level > 0) return m.level;   /* nolevelclamp */', 1),

  /* ══ 依頼書 §9 の残り 8 本 (項目4) ═══════════════════════════════════════ */

  /* (4c) 閉じるのを display ではなく opacity にする。
     ⚠ aria-hidden の行は **残す** —— 消すと「aria も見ている」ぶんだけ余計に赤くなり、
       何を検出したのか判らなくなる。 */
  fadeclose: () => patch('負のコントロール', 'fadeclose (閉じるとき display でなく opacity を落とす)',
    '/tavern.html',
    '    ov.classList.remove("show");        /* ★ 閉じるのは display。⛔ opacity で消さない */',
    '    ov.style.opacity = "0";   /* fadeclose */', 1),

  /* (6a) 撤退スイッチを無視する。酒場側のゲートは 2 つあるので **両方**潰す
     (片方だけだと「入口は消えるが名簿は書く」等の半端な状態になり、何を測ったのか濁る)。 */
  noretreatswitch: () => {
    patch('負のコントロール', 'noretreatswitch-1 (入口を消す門番を外す)', '/tavern.html',
      '    if (!rosterOnTv()) { btn.remove(); return; }',
      '    /* noretreatswitch: 入口を消さない */', 1);
    patch('負のコントロール', 'noretreatswitch-2 (?roster=0 を読まない)', '/js/mercenary-roster.js',
      '    try { return new URLSearchParams(global.location.search).get("roster") !== "0"; }',
      '    try { return true; }   /* noretreatswitch */', 1);
  },

  /* (3d) 上限を無視する。
     ⚠⚠ enroll() の門番だけ外しても **空振りする** —— save()/load() が CAP で切り詰めるので
       在籍数は 12 のまま戻り、(3d) が緑になる。上限は 3 箇所 (enroll の門番 / load の切り詰め /
       save の切り詰め) で守られているので全部外す。さらに抽選側の full 判定も外して
       「満杯でも新顔を作り続ける」ようにしないと、増え方が止まって偽の緑になり得る。 */
  nocap: () => {
    patch('負のコントロール', 'nocap-1 (enroll の満杯判定)', '/js/mercenary-roster.js',
      '    if (r.list.length >= CAP) return null;',
      '    /* nocap: 満杯でも登録する */', 1);
    patch('負のコントロール', 'nocap-2 (load の切り詰め)', '/js/mercenary-roster.js',
      'for (var i = 0; i < o.list.length && list.length < CAP; i++) {',
      'for (var i = 0; i < o.list.length; i++) {   /* nocap */', 1);
    patch('負のコントロール', 'nocap-3 (save の切り詰め)', '/js/mercenary-roster.js',
      'for (var i = 0; i < src.length && norm.list.length < CAP; i++) {',
      'for (var i = 0; i < src.length; i++) {   /* nocap */', 1);
    patch('負のコントロール', 'nocap-4 (抽選側の満杯判定)', '/tavern.html',
      'full = roster.length >= DFRoster.CAP;',
      'full = false;   /* nocap */', 1);
  },

  /* (3e) 見送った id が再利用される。
     ⚠⚠ 依頼書の「release() の save(r) の前に r.next = 1 を挿す」だけでは **空振りする** ——
       save()/load() が「next は既存 id より大きい」を毎回押し上げ直すので next は元へ戻る。
       ⭐ その押し上げこそが id 再利用を防いでいる防具なので、防具ごと外して初めて欠陥になる。 */
  reuseid: () => {
    patch('負のコントロール', 'reuseid-1 (release が next を巻き戻す)', '/js/mercenary-roster.js',
      '    return save(r);',
      '    r.next = 1;   /* reuseid */ return save(r);', 1);
    patch('負のコントロール', 'reuseid-2 (load の押し上げ)', '/js/mercenary-roster.js',
      'for (var j = 0; j < list.length; j++) if (list[j].id >= next) next = list[j].id + 1;',
      '/* reuseid: 押し上げない */', 1);
    patch('負のコントロール', 'reuseid-3 (save の押し上げ)', '/js/mercenary-roster.js',
      'for (var j = 0; j < norm.list.length; j++) if (norm.list[j].id >= next) next = norm.list[j].id + 1;',
      '/* reuseid: 押し上げない */', 1);
  },

  /* (2b)(2f2) 敗北でも runs を増やす。 */
  defeatgrows: () => patch('負のコントロール', 'defeatgrows (敗北でも runs を増やす)',
    '/js/mercenary-roster.js',
    '    if (survived !== true) return 0;',
    '    /* defeatgrows: 敗北でも通す */', 1),

  /* (0a)(5a) 名簿が空でも makeNpcMember へ落ちない。
     ⭐ 「新顔を作らない」を素直に `return null` で書くと編成そのものが例外になり、
       §1 §3d §4 まで巻き添えで全滅して何を検出したのか判らなくなる。
     ⭐⭐ 実際に起こしたい欠陥は「新顔も名簿の顔として扱ってしまう」= 性格も口癖も持たない
       半端な人物が編成に入り、その場で名簿へ登録される、という形。これなら名簿は正しく育つので
       §1 §3d §4 は生き残り、(0a)(5a) だけが赤くなる。
     ⚠ 枝カウンタ (BUMP) は残す。枝は現に通っているので、そこを消すと計測器のほうを壊すことになる。 */
  alwaysroster: () => patch('負のコントロール',
    'alwaysroster (名簿が空でも makeNpcMember へ落ちない)', '/tavern.html',
    seamTo('(c)'),
    '    if (i >= vets.length) {' + BUMP('fromNew')
      + ' const nf = { classKey: classKey, isHero: false, zone: PARTY_ZONES[classKey],'
      + ' name: pickUniqueName(usedNames), trait: "", line: "", variant: 0, level: 1 };'
      + ' try { const nid = DFRoster.enroll(nf); if (nid != null) nf.mercId = nid; } catch (e) {}'
      + ' return nf; }   /* alwaysroster */', 1),

  /* (2c) 出発時の clamp の **呼びだけ** を外す。
     ⛔ clampCompanionLevel() の中身を壊さないこと —— 壊すと (2c) と (2e) が同時に赤くなる。 */
  noclamp: () => patch('負のコントロール', 'noclamp (出発時の clamp の呼びを外す)',
    '/tavern.html',
    '        m.level = clampCompanionLevel(m.level, heroLevel);',
    '        /* noclamp (⛔ clampCompanionLevel() 自体は無傷) */', 1),

  /* (3c) snapshot() の data から名簿を落とす。
     ⭐ keysOf() を直接いじると wipeLive() まで道連れになり (3b) が巻き添えで赤くなる。
       欠陥は「スロットへ焼かれない」なので、焼く側 (liveData) だけを壊す。 */
  switchleak: () => patch('負のコントロール', 'switchleak (snapshot の data から名簿を落とす)',
    '/js/save-slots.js',
    'keysOf(global.localStorage).forEach(function (k) {',
    'keysOf(global.localStorage).filter(function (k) { return k.indexOf("mercRoster") < 0; })'
      + '.forEach(function (k) {   /* switchleak */', 1),
};
const INJECTED = [];

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad  = [];
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます');
  console.log('[driver] 変異表は ' + tags.length + '/10 本 (依頼書 §9 の 9 本 + 項目2 が新設した '
    + 'nolevelclamp) —— 項目4 でそろった。');
  tags.forEach((tag, i) => {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT + 1 + i)];
    if (HEADFUL) a.push('--headful');
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  });
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本とも担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  ONLY.forEach((tag) => {
    if (!NEG_MUTATE[tag]) {
      console.error('[driver] 未知の変異タグ: ' + tag + ' (在るのは ' + Object.keys(NEG_MUTATE).join(',') + ')');
      process.exit(3);
    }
    NEG_MUTATE[tag]();
    INJECTED.push(tag);
    console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (配信のみ・ディスクは無傷)');
  });
}

/* ══════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[driver] ブラウザが見つかりません'); process.exit(2);
}
/* ⚠ MIME を落とすと全 500 = 白紙になり、シームが undefined に見える */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u] !== undefined) {
          rs.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'text/plain');
          rs.setHeader('Cache-Control', 'no-store');
          rs.end(FROZEN[u]);
          return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          rs.statusCode = 404; rs.end('404'); return;
        }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, state: cond ? 'PASS' : 'FAIL' });
  console.log((cond ? '  OK   ' : '  NG   ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側で走らせる本番の 1 周 (= 1 回の出発)。
 *   ⭐ ドライバは sessionStorage へ 1 行も書かない。書くのは本番の departToScenario()。
 *   ⭐ 「名簿から引いたか」は **抽選直後 (departToScenario の前)** にしか現れない
 *     (出発処理が新顔にも mercId を書き戻すため)。だから pre / post を両方採る。
 * ══════════════════════════════════════════════════════════════════════════ */
const ROUND_FN = function (sid) {
  const snapMember = (m) => ({
    isHero: !!m.isHero, classKey: m.classKey, name: m.name, trait: m.trait,
    line: m.line, variant: m.variant, level: m.level,
    mercId: (m.mercId === undefined || m.mercId === null) ? null : m.mercId,
    keys: Object.keys(m),
  });
  const out = { err: '' };
  try {
    const sc = scenarios.find((s) => s.id === sid);
    if (!sc) { out.err = 'シナリオが見つからない: ' + sid; return out; }
    prepScenario = sc;
    if (window.__rosterSeam) {
      window.__rosterSeam.calls = 0; window.__rosterSeam.off = 0;
      window.__rosterSeam.fromNew = 0; window.__rosterSeam.fromRoster = 0;
      window.__rosterSeam.fullMiss = 0;
    }
    out.rosterBefore = (window.DFRoster ? DFRoster.all() : []).length;
    regeneratePartyMembers();
    out.seam = window.__rosterSeam ? JSON.parse(JSON.stringify(window.__rosterSeam)) : null;
    out.pre = selection.partyMembers.map(snapMember);
    sessionStorage.removeItem('dragonfighters.partyMembers');   /* 前周の値を残さない */
    departToScenario();                                          /* ★本番。ここで名簿へ登録される */
    const raw = sessionStorage.getItem('dragonfighters.partyMembers');
    out.wrote = raw !== null;
    let arr = null;
    try { arr = JSON.parse(raw); } catch (e) {}
    out.post = Array.isArray(arr) ? arr.map(snapMember) : null;
    out.persist = {
      allyEquip:      localStorage.getItem('dragonfighters.allyEquip'),
      partySkills:    localStorage.getItem('dragonfighters.partySkills'),
      actionPriority: localStorage.getItem('dragonfighters.actionPriority'),
    };
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* 名簿の実体と、名簿キーの在り処。⭐ 前置詞は DFSlots.LIVE_PREFIX から読む (写経しない)。 */
const PROBE_FN = function () {
  const out = { err: '' };
  try {
    out.livePrefix = (window.DFSlots && DFSlots.LIVE_PREFIX) || null;
    out.cap        = (window.DFRoster && DFRoster.CAP) || null;
    out.namePool   = (typeof NPC_NAMES !== 'undefined') ? NPC_NAMES.length : null;
    out.roster     = window.DFRoster ? DFRoster.load() : null;
    out.allLen     = window.DFRoster ? DFRoster.all().length : null;
    out.lsKeys     = Object.keys(localStorage).filter((k) => k.indexOf('mercRoster') >= 0);
    out.band       = null;
    try {
      const tier = QuestGen.qGetTier(6);
      out.band = { tier: tier, BAND: { tier1: [2, 4], tier2: [5, 8], tier3: [9, 10], tier4: [10, 10] }[tier] };
    } catch (e) {}
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const profile = require('./_pptr_profile')('df_mercroster_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
    defaultViewport: { width: 1280, height: 900 },
  });

  /* ⚠ purge は「1 タブにつき 1 回だけ」。evaluateOnNewDocument は新しい document ができる
     たびに走るので、無条件だとページ自身が書いた値を潰す。
     ⭐ 枠 (__rosterSeam) の初期化だけは毎回やる (ページ側スクリプトより先に必要)。 */
  const PURGE_MARK = '__dfMercPurged';
  const BOOT = (o) => {
    try {
      window.__rosterSeam = { calls: 0, off: 0, fromNew: 0, fromRoster: 0, fullMiss: 0 };
      if (sessionStorage.getItem(o.mark)) return;
      const kill = (store) => Object.keys(store).forEach((k) => {
        if (k.indexOf('df.') === 0 || k.indexOf('dragonfighters.') === 0) store.removeItem(k);
      });
      kill(localStorage); kill(sessionStorage);
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (o.xp) localStorage.setItem('dragonfighters.xp', String(o.xp));
      sessionStorage.setItem(o.mark, '1');
    } catch (e) {}
  };

  /* 酒場を開く共通口。⚠ departToScenario() は location.href を書くので、
     tavern.html 以外の main-frame ナビゲーションを **abort** して 1 タブに留める。 */
  /* ⚠⚠[#54] このドライバは **自動編成モデル**(主人公 1 + 抽選 NPC)を測る。
   * #54 で既定の編成は「酒場で声を掛けた相手だけ」に変わり、誰も誘っていなければ
   * **ソロ**になった (ユーザー決定)。⇒ 自動編成はもう既定の腕には現れない。
   * ⛔ assert を緩めない / 期待人数を書き換えない。**assert が走る母集団を移す** —
   *   自動編成は今も `?recruittalk=0` で生きており、そこでは着手前と 1 assert も減らない。
   * ⭐ 勧誘モデル側は tools/verify_recruit_talk.js が測る。 */
  function withAutoParty(p) {
    return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'recruittalk=0';
  }
  async function openTavern(query, xp) {
    const page = await browser.newPage();
    const tag = 'tavern' + (query || '');
    page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
    await page.evaluateOnNewDocument(BOOT, { mark: PURGE_MARK, xp: xp || null });
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame()
            && !/\/tavern\.html/.test(r.url())) { r.abort('aborted'); return; }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });
    await page.goto('http://localhost:' + PORT + withAutoParty('/tavern.html' + (query || '')),
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof pickCompanion === 'function'"
      + " && typeof selection !== 'undefined' && selection && Array.isArray(selection.partyComposition)",
      { timeout: 30000 });
    await sleep(400);
    return page;
  }
  /* 酒場タブを **同じタブのまま** 開き直す (§6 の帰還)。
     ⚠⚠⚠ 新しいタブで openTavern すると BOOT の purge が走って localStorage の名簿ごと消える。
       purge の番人 (PURGE_MARK) は sessionStorage なので、**同じタブの reload なら生き残る** =
       名簿も lastResult も残ったまま consumeResult() だけをもう一度走らせられる。 */
  async function reloadTavern(page) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof selection !== 'undefined' && selection && !!window.DFRoster"
      + " && typeof departToScenario === 'function'", { timeout: 30000 });
    await sleep(600);   /* consumeResult → setTimeout(…,100) の帰還バナーまで待つ */
  }

  /* 同じタブのまま **別のクエリで** 酒場を開き直す (§撤退 の (6a)(6c) 用)。
     ⚠⚠⚠ openTavern (= 新しいタブ) にすると BOOT の purge が走って **育てた名簿ごと消える**。
       purge の番人 (PURGE_MARK) は sessionStorage なので、同じタブの遷移なら残る。
     ⚠ 遷移横取り (setRequestInterception) は tavern.html を通すので、クエリ付きでも goto できる。 */
  async function gotoTavern(page, query) {
    await page.goto('http://localhost:' + PORT + withAutoParty('/tavern.html' + (query || '')),
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && !!window.DFRoster"
      + " && typeof selection !== 'undefined' && selection", { timeout: 30000 });
    await sleep(400);
  }

  /* index.html を開く共通口 (§5 (5c) / §6 (6b) 用)。
     ⛔⛔ ここでは localStorage を **1 バイトも消さない**。酒場タブと同じオリジンなので、
       purge すると育てたばかりの名簿が消えて §6 の母集団が丸ごと無くなる。
       消してよいのはタブ固有の sessionStorage だけ (seed で上書きする)。
     ⚠ 種に渡す party は **本番の departToScenario() が焼いた JSON そのもの**。
       ドライバが手で組んだ配列だと mercId の作り方まで自分で決めてしまう。 */
  async function openIndexPage(query, partyJson) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => pageErrors.push('index' + (query || '') + ' :: ' + e.message));
    await page.evaluateOnNewDocument((o) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        sessionStorage.removeItem('dragonfighters.lastResult');
        if (o.party) sessionStorage.setItem('dragonfighters.partyMembers', o.party);
      } catch (e) {}
    }, { party: partyJson || null });
    await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1'
      + (query || ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
      { timeout: 60000 });
    await sleep(400);
    return page;
  }

  /* 本番の出発処理を n 周させる。⭐ 名簿は必ずこれで育てる (手で JSON を書かない)。 */
  async function grow(page, n) {
    const rounds = [];
    for (let i = 0; i < n; i++) {
      rounds.push(await page.evaluate(ROUND_FN, GROW_SCEN));
      await sleep(40);
    }
    return rounds;
  }
  /* (3d) は「満杯に達した状態」でしか何も測れないので、**達するまで回す**。
     ⚠ 固定周回数にすると、抽選運が悪い日だけ満杯に届かず (3d) が偽の赤になる
       (新顔が出る確率は在籍が増えるほど下がるので、必要周回数は run ごとにばらつく)。
     ⛔ 無限には回さない。届かなかったら **届かなかったことを (3d) の詳細に出す**
       (黙って打ち切って緑にしない)。 */
  async function growUntilFull(page, minRounds, maxRounds, cap) {
    const rounds = [];
    for (let i = 0; i < maxRounds; i++) {
      const r = await page.evaluate(ROUND_FN, GROW_SCEN);
      rounds.push(r);
      await sleep(40);
      if (rounds.length >= minRounds && r.rosterBefore >= cap) break;
    }
    return rounds;
  }

  let exitCode = 0;
  try {
    // ══════════════════════════════════════════════════════════════════
    // §0 装置 — 先に母集団を確かめる
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §0 装置 (母集団) ---');
    {
      const served = FROZEN['/tavern.html'];
      const disk   = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
      const diskJs = fs.readFileSync(path.join(ROOT, 'js', 'mercenary-roster.js'), 'utf8');
      const servedHits = served.split('__rosterSeam').length - 1;
      check('(0z0) [装置] 配信の tavern.html が空でない', served.length > 100000, served.length + ' 文字');
      check('(0z1) [装置] 枝カウンタ ' + SEAM_INJECTIONS.length + ' 点が配信バイトに在り、'
          + '**ディスクの tavern.html / js/mercenary-roster.js には 1 つも無い**',
        servedHits >= SEAM_INJECTIONS.length
          && disk.indexOf('__rosterSeam') < 0 && diskJs.indexOf('__rosterSeam') < 0,
        '配信 ' + servedHits + ' 箇所 / ディスク tavern='
          + (disk.indexOf('__rosterSeam') < 0 ? '0 件 (無改修)' : '★汚している')
          + ' / ディスク js=' + (diskJs.indexOf('__rosterSeam') < 0 ? '0 件 (無改修)' : '★汚している'));
    }

    const p1 = await openTavern('');
    /* ⭐ CAP は実体から読む (12 を直書きしない)。満杯に届くまで回す条件にも使う。 */
    const cap0 = await p1.evaluate(() => (window.DFRoster && window.DFRoster.CAP) || 0);
    const r1 = await growUntilFull(p1, GROW_MAIN, GROW_MAX, cap0);
    const probe1 = await p1.evaluate(PROBE_FN);
    console.log('  [装置] ' + r1.length + ' 周まわして名簿を育てた (CAP=' + cap0
      + ' に達したら打ち切り / 上限 ' + GROW_MAX + ' 周)');
    const errs1 = r1.map((r, i) => r.err ? ('#' + (i + 1) + ' ' + r.err) : '').filter(Boolean);
    if (errs1.length) console.log('  [!] 走行中の例外: ' + errs1.join(' / '));

    const npc1 = (r1[0].post || []).filter((m) => !m.isHero).length;
    check('(0a) まっさらなプロファイルでは名簿が空で、pickCompanion が makeNpcMember へ 100% 落ちる '
        + '(1 周目 fromRoster=0 / fromNew=NPC 人数 / 抽選直後に mercId 持ちが 0 人)',
      r1[0] && !r1[0].err && r1[0].rosterBefore === 0 && r1[0].seam
        && r1[0].seam.fromRoster === 0 && r1[0].seam.fromNew === npc1 && npc1 > 0
        && (r1[0].pre || []).every((m) => m.mercId === null),
      '1 周目: 名簿 ' + (r1[0] && r1[0].rosterBefore) + ' 人 / seam='
        + JSON.stringify(r1[0] && r1[0].seam) + ' / NPC ' + npc1 + ' 人 / 抽選直後の mercId 持ち '
        + (r1[0].pre || []).filter((m) => m.mercId !== null).length + ' 人');

    check('(0b) 本番の出発処理を ' + r1.length + ' 周させたあと、名簿に 1 人以上いる',
      !!(probe1.roster && probe1.roster.list.length >= 1),
      '在籍 ' + (probe1.roster ? probe1.roster.list.length : 'null') + ' 人 / next='
        + (probe1.roster ? probe1.roster.next : '-'));

    check('(0c) 上限を写経していない — DFRoster.CAP を実体から読み、それが NPC_NAMES (実体) より小さい '
        + '(= 名簿が満杯でも名前が衝突しない、の根拠)',
      typeof probe1.cap === 'number' && probe1.cap >= 1
        && typeof probe1.namePool === 'number' && probe1.cap < probe1.namePool,
      'CAP=' + probe1.cap + ' / NPC_NAMES=' + probe1.namePool + ' 要素');

    // ══════════════════════════════════════════════════════════════════
    // §1 同じ顔が返ってくる
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §1 同じ顔が返ってくる ---');
    const rosterIds = new Set((probe1.roster ? probe1.roster.list : []).map((m) => m.id));
    const postCount = new Map();     /* id -> 出た周の数 */
    const preIds    = new Set();     /* 抽選の時点で名簿から引いた id */
    const byId      = new Map();     /* id -> [{round, name, trait, line, variant}] */
    r1.forEach((r, i) => {
      (r.pre || []).forEach((m) => { if (m.mercId !== null) preIds.add(m.mercId); });
      const seen = new Set();
      (r.post || []).forEach((m) => {
        if (m.mercId === null || seen.has(m.mercId)) return;
        seen.add(m.mercId);
        postCount.set(m.mercId, (postCount.get(m.mercId) || 0) + 1);
        if (!byId.has(m.mercId)) byId.set(m.mercId, []);
        byId.get(m.mercId).push({ round: i + 1, name: m.name, trait: m.trait,
                                  line: m.line, variant: m.variant });
      });
    });
    const outside = Array.from(postCount.keys()).filter((id) => !rosterIds.has(id));
    const repeats = Array.from(postCount.entries()).filter((kv) => kv[1] >= 2);
    const fromRosterTotal = r1.reduce((a, r) => a + ((r.seam && r.seam.fromRoster) || 0), 0);

    check('(1z1) [母集団] 名簿から引く枝を実際に通っている (通っていなければ §1 は全部空振り)',
      fromRosterTotal >= 1 && preIds.size >= 1,
      '枝 fromRoster 合計 ' + fromRosterTotal + ' 回 / 抽選時に名簿から来た人 ' + preIds.size + ' 人');

    check('(1a) 2 経路が一致する — 出発が焼いた mercId の集合が名簿の id 集合の部分集合で、'
        + 'かつ 2 回以上出た id が 1 つ以上ある (= 再登板が実在する)',
      postCount.size > 0 && outside.length === 0 && repeats.length >= 1,
      '名簿 ' + rosterIds.size + ' 人 / 出発に出た id ' + postCount.size + ' 種 / 名簿外 '
        + outside.length + ' 件 / 2 回以上 ' + repeats.length + ' 人 (最多 '
        + Math.max.apply(null, [0].concat(Array.from(postCount.values()))) + ' 周)');

    const drift = [];
    byId.forEach((list, id) => {
      if (list.length < 2) return;
      const a = list[0];
      list.slice(1).forEach((b) => {
        if (a.name !== b.name || a.trait !== b.trait || a.line !== b.line || a.variant !== b.variant) {
          drift.push('id=' + id + ' 周' + a.round + ' vs 周' + b.round);
        }
      });
      const rec = ((probe1.roster && probe1.roster.list) || []).find((m) => m.id === id);
      if (rec && (rec.name !== a.name || rec.trait !== a.trait
                  || rec.line !== a.line || rec.variant !== a.variant)) {
        drift.push('id=' + id + ' 名簿の記録と食い違う');
      }
    });
    check('(1b) 再登板した人物の name / trait / line / variant が 1 文字も変わっていない '
        + '(周をまたいだ比較 + 名簿の記録との比較の 2 経路)',
      repeats.length >= 1 && drift.length === 0,
      '再登板 ' + repeats.length + ' 人 / 食い違い ' + drift.length + ' 件'
        + (drift.length ? ' -- ' + drift.slice(0, 4).join(' , ') : ''));

    const dupRounds = [];
    r1.forEach((r, i) => {
      const ids = (r.post || []).filter((m) => m.mercId !== null).map((m) => m.mercId);
      if (new Set(ids).size !== ids.length) dupRounds.push('周' + (i + 1) + ' id 重複 [' + ids.join(',') + ']');
      const names = (r.post || []).filter((m) => !m.isHero).map((m) => m.name);
      if (new Set(names).size !== names.length) dupRounds.push('周' + (i + 1) + ' 名前重複 [' + names.join(',') + ']');
    });
    check('(1c) 1 回の編成に同じ mercId (と同じ名前) が 2 回入らない',
      r1.length > 0 && dupRounds.length === 0,
      dupRounds.length ? dupRounds.slice(0, 4).join(' / ') : r1.length + ' 周とも重複なし');

    // ══════════════════════════════════════════════════════════════════
    // §3d 上限 (§1 と同じ走行から読む)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §3 名簿の器 (上限は §1 の走行から) ---');
    const over  = r1.filter((r) => r.rosterBefore > probe1.cap).length;
    const sizes = r1.map((r) => (r.post || []).length);
    const expectSize = sizes[0];
    check('(3d) 上限 CAP に達したら在籍数が増えない。かつ **その状態でも編成が完成する** '
        + '(人数が足りない編成にならない)',
      !!(probe1.roster) && probe1.roster.list.length === probe1.cap && over === 0
        && expectSize > 1 && sizes.every((n) => n === expectSize),
      '在籍 ' + (probe1.roster ? probe1.roster.list.length : '-') + '/' + probe1.cap
        + ' 人 (' + r1.length + ' 周) / 超過周 ' + over + ' 件 / 各周の編成人数 '
        + JSON.stringify(sizes)
        + (probe1.roster && probe1.roster.list.length < probe1.cap
            ? '  ★' + GROW_MAX + ' 周まわしても満杯に届かなかった = (3d) の母集団に未到達' : ''));

    // §5 の (5a) 名簿 ON 側 と (5b) は §1 の走行から読む
    const persists = r1.map((r) => JSON.stringify(r.persist));
    const persistStable = persists.every((s) => s === persists[0])
      && r1[0].persist && r1[0].persist.allyEquip !== null
      && r1[0].persist.partySkills !== null && r1[0].persist.actionPriority !== null;

    // ══════════════════════════════════════════════════════════════════
    // §4 傭兵名簿パネル (項目3 = 依頼書 §7)
    //   ⭐ p1 を使い回すのは「12 行を出す」ためだけではない。ここまでの走行で名簿は CAP まで
    //     埋まっており、育て直すと 14〜40 周ぶんの時間が二重に掛かる。
    //   ⛔ 測らないもの: パネルの配色・行の並び順・文言 (依頼書 §9 末尾)。
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §4 傭兵名簿パネル (項目3) ---');
    {
      /* ⚠⚠ HUD の重なりは **矩形の比較では見えない**。効くのは「その点で elementFromPoint が
         何を返すか」だけ (#12 / #37 の実測)。verify_run_chronicle.js の hitOf() をそのまま使う。 */
      const HUD_FN = function () {
        const hitOf = (id) => {
          const el = document.getElementById(id);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return 'hidden';
          const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return (h && (h === el || el.contains(h))) ? 'self' : ((h && h.id) || (h && h.tagName) || 'none');
        };
        const topOf = (id) => {
          const el = document.getElementById(id);
          return el ? getComputedStyle(el).top : null;
        };
        const box = (id) => {
          const el = document.getElementById(id);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return [Math.round(r.top), Math.round(r.bottom)];
        };
        const sh = document.getElementById('chronicleShelf');
        return {
          hasEntry: !!document.getElementById('rosterEntry'),
          shelfShown: !!(sh && sh.classList.contains('show')),
          hitEntry: hitOf('rosterEntry'), hitShelf: hitOf('chronicleShelf'), hitTown: hitOf('townExit'),
          topEntry: topOf('rosterEntry'), topShelf: topOf('chronicleShelf'), topTown: topOf('townExit'),
          boxEntry: box('rosterEntry'), boxShelf: box('chronicleShelf'), boxTown: box('townExit'),
        };
      };
      /* 状態 A = 記録 0 件 (BOOT が dragonfighters.* を purge したまま) → 記録棚は非表示。 */
      const hudA = await p1.evaluate(HUD_FN);
      /* 状態 B = 記録棚を表示中にする。
         ⛔ localStorage へ手で JSON を書かない —— 本番の保存経路 (pushShelf) を
            window.__chronicle.shelfPush 越しに呼ぶ。
         ⚠ .show を付けるのは読み込み時の initChronicleShelf() なので **同じタブで reload** する。
            新しいタブで開き直すと BOOT の purge が育てた名簿ごと消える。 */
      const pushed = await p1.evaluate(() => {
        if (!window.__chronicle) return null;
        const a = window.__chronicle.shelfPush({
          at: Date.now(), scenarioId: 'orc-fort', scenarioTitle: '(装置) 記録棚を 1 件にする',
          outcome: 'clear', ch: { events: [], roster: [] },
        });
        return a ? a.length : null;
      });
      await reloadTavern(p1);
      const hudB = await p1.evaluate(HUD_FN);
      console.log('  [HUD A 記録棚なし] ' + JSON.stringify(hudA));
      console.log('  [HUD B 記録棚あり] ' + JSON.stringify(hudB));

      check('(4z0) [装置] 記録棚の 2 状態を実際に作り分けられた '
          + '(0 件 → 非表示 / 本番の保存経路で 1 件積んで同じタブを reload → 表示)',
        pushed === 1 && hudA.shelfShown === false && hudB.shelfShown === true
          && hudA.hasEntry === true && hudB.hasEntry === true,
        '棚 ' + pushed + ' 件 / shelfShown A=' + hudA.shelfShown + ' B=' + hudB.shelfShown
          + ' / #rosterEntry の在否 A=' + hudA.hasEntry + ' B=' + hudB.hasEntry);

      /* ⚠⚠ 「閉じた」を **200ms 後の display** で測らない。フェード中は display:flex のままなので
         永久緑になる (既知の罠)。効くのは display:none / visibility:hidden / hidden 属性で
         **本当に不活性になったか**。⛔ opacity は数えない —— opacity だけで消す実装は
         「見えないのに押せる板」を残すので、それを閉じたと呼ばない。 */
      const VIS_FN = function (id) {
        const el = document.getElementById(id);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r  = el.getBoundingClientRect();
        return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
                 hidden: el.hidden === true, aria: el.getAttribute('aria-hidden'),
                 w: Math.round(r.width), h: Math.round(r.height),
                 rows: el.querySelectorAll('.mrRow').length };
      };
      const isClosed = (s) => !!s
        && (s.display === 'none' || s.visibility === 'hidden' || s.hidden === true);
      const isOpen = (s) => !!s && !isClosed(s) && s.w > 0 && s.h > 0;

      const ovBefore = await p1.evaluate(VIS_FN, 'rosterOverlay');
      await p1.click('#rosterEntry');          /* ★ 実際のクリック (中心座標の hit-test を通る) */
      await sleep(150);
      const ovAfter = await p1.evaluate(VIS_FN, 'rosterOverlay');
      check('(4a) #rosterEntry が HUD にあり、**実際に押すと** #rosterOverlay が可視になる '
          + '(押す前は閉じている)',
        hudB.hasEntry === true && isClosed(ovBefore) && isOpen(ovAfter) && ovAfter.aria === 'false',
        '押す前=' + JSON.stringify(ovBefore) + ' / 押した後=' + JSON.stringify(ovAfter));

      const z = await p1.evaluate(() => {
        const zi = (id) => {
          const el = document.getElementById(id);
          return el ? getComputedStyle(el).zIndex : null;
        };
        return { roster: zi('rosterOverlay'), pm: zi('partyMatchOverlay'),
                 chronicle: zi('chronicleOverlay'), prologue: zi('prologueOverlay') };
      });
      const zr = parseInt(z.roster, 10);
      const zp = parseInt(z.pm, 10);
      check('(4b) #rosterOverlay の z-index が #partyMatchOverlay より小さい '
          + '(⛔ 数値を直書きせず getComputedStyle で **両方**を読んで比べる。grep で数えると'
          + 'コメントの「z-index 170」まで数えてしまう = #34 の罠)',
        isFinite(zr) && isFinite(zp) && zr < zp,
        '名簿=' + z.roster + ' / マッチング=' + z.pm + ' / 年代記=' + z.chronicle
          + ' / プロローグ=' + z.prologue);

      const closeArm = await p1.evaluate(function () {
        const ovEl = () => document.getElementById('rosterOverlay');
        const btn  = () => document.getElementById('rosterClose');
        const st = () => {
          const el = ovEl(); if (!el) return null;
          const cs = getComputedStyle(el);
          const r  = el.getBoundingClientRect();
          return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
                   hidden: el.hidden === true, aria: el.getAttribute('aria-hidden'),
                   w: Math.round(r.width), h: Math.round(r.height) };
        };
        /* ⚠ 合成イベントで **1 種類ずつ**撃つ。puppeteer の touchscreen.tap は互換 click まで
           生むので、「click だけ配線」の実装でも tap で閉じてしまい **偽の緑**になる。 */
        const fire = (type) => {
          const b = btn(); if (!b) return false;
          b.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
          return true;
        };
        const out = { hasBtn: !!btn(), tap: null };
        const b = btn();
        if (b) { const r = b.getBoundingClientRect();
                 out.tap = { w: Math.round(r.width), h: Math.round(r.height) }; }
        window.__roster.open(); out.openA = st(); out.firedA = fire('click');    out.afterClick = st();
        window.__roster.open(); out.openB = st(); out.firedB = fire('touchend'); out.afterTouch = st();
        return out;
      });
      console.log('  [4c] ' + JSON.stringify(closeArm));
      check('(4c) 閉じるボタンに click と touchend が **両方**配線されている (合成イベントで 1 種類ずつ'
          + '撃って確かめる)。⚠ 「閉じた」は 200ms 後の display ではなく '
          + 'display:none / visibility:hidden / hidden 属性で測る (フェード中は display:flex の'
          + 'まま = 永久緑の罠)。かつタップ域 44px 以上',
        closeArm.hasBtn === true && closeArm.firedA === true && closeArm.firedB === true
          && isOpen(closeArm.openA) && isClosed(closeArm.afterClick)
          && isOpen(closeArm.openB) && isClosed(closeArm.afterTouch)
          && closeArm.afterClick.aria === 'true' && closeArm.afterTouch.aria === 'true'
          && !!closeArm.tap && closeArm.tap.h >= 44,
        'click 後=' + JSON.stringify(closeArm.afterClick) + ' / touchend 後='
          + JSON.stringify(closeArm.afterTouch) + ' / ボタン '
          + (closeArm.tap ? closeArm.tap.w + 'x' + closeArm.tap.h : 'なし'));

      check('(4e) #rosterEntry / #chronicleShelf / #townExit の 3 つとも、中心の elementFromPoint が'
          + '自分自身 (またはその子孫) を返す —— 3 つが同じ縦列に並んだ状態で測る。'
          + '⚠ 重なりは矩形の比較では見えない (#12 / #37 が同じ罠を踏んだ)',
        hudB.hitEntry === 'self' && hudB.hitShelf === 'self' && hudB.hitTown === 'self',
        '名簿=' + hudB.hitEntry + ' / 記録棚=' + hudB.hitShelf + ' / 街へ出る=' + hudB.hitTown
          + ' / 縦位置 街[' + hudB.boxTown + '] 棚[' + hudB.boxShelf + '] 名簿[' + hudB.boxEntry + ']');

      const gapA = (hudA.boxEntry && hudA.boxTown)  ? hudA.boxEntry[0] - hudA.boxTown[1]  : null;
      const gapB = (hudB.boxEntry && hudB.boxShelf) ? hudB.boxEntry[0] - hudB.boxShelf[1] : null;
      check('(4f) 記録棚が非表示のとき #rosterEntry の実効 top が 74px、表示中は 130px。'
          + 'かつ **どちらの状態でも** 見えている HUD の中心の elementFromPoint が自分自身 '
          + '(⛔ top が変わることだけを測ると、詰めた結果 #townExit に重なっても緑になる)',
        hudA.topEntry === '74px' && hudB.topEntry === '130px'
          && hudA.hitEntry === 'self' && hudA.hitTown === 'self' && hudA.hitShelf === 'hidden'
          && hudB.hitEntry === 'self' && hudB.hitTown === 'self'
          && gapA !== null && gapA >= 0 && gapB !== null && gapB >= 0,
        '棚なし: top=' + hudA.topEntry + ' hit 名簿=' + hudA.hitEntry + ' 街=' + hudA.hitTown
          + ' 棚=' + hudA.hitShelf + ' 隙間 ' + gapA + 'px / 棚あり: top=' + hudB.topEntry
          + ' hit 名簿=' + hudB.hitEntry + ' 棚=' + hudB.hitShelf + ' 街=' + hudB.hitTown
          + ' 隙間 ' + gapB + 'px');

      /* ⚠ 12 行がはみ出すのは狭幅のとき。iPhone 相当まで縮めてから測る。
         ⭐ 行数はドライバが写経せず、名簿の実体 (DFRoster.all()) と描かれた行の両方から採る。 */
      await p1.setViewport({ width: 390, height: 844 });
      await sleep(400);
      const sc = await p1.evaluate(() => {
        const out = { err: '' };
        try {
          document.body.classList.add('ui-compact');
          out.opened    = window.__roster.open();
          const b       = document.getElementById('rosterBody');
          const cs      = b ? getComputedStyle(b) : null;
          out.cap       = (window.DFRoster && DFRoster.CAP) || 0;
          out.n         = window.DFRoster ? DFRoster.all().length : -1;
          out.rows      = b ? b.querySelectorAll('.mrRow').length : -1;
          out.releases  = b ? b.querySelectorAll('.mrRelease').length : -1;
          out.overflowY = cs ? cs.overflowY : null;
          out.scrollH   = b ? b.scrollHeight : -1;
          out.clientH   = b ? b.clientHeight : -1;
          if (b) b.scrollTop = 99999;
          out.scrolled  = b ? b.scrollTop : -1;
        } catch (e) { out.err = String((e && e.message) || e); }
        return out;
      });
      console.log('  [4d] ' + JSON.stringify(sc));
      check('(4z1) [母集団] 名簿が上限まで埋まっており (在籍 >= CAP)、パネルがその人数ぶんの行と'
          + '「見送る」ボタンを実際に描いている (行が少ないと (4d) はスクロールの有無を測れない)。'
          + '⚠ 「= CAP」でなく「>= CAP」で書く —— 上限を壊す欠陥の担当は (3d) であって、'
          + 'ここまで一緒に赤くなると何を検出したのか判らなくなる',
        !sc.err && sc.cap >= 1 && sc.n >= sc.cap && sc.rows === sc.n && sc.releases === sc.n,
        '在籍 ' + sc.n + '/' + sc.cap + ' 人 / 行 ' + sc.rows + ' / 「見送る」' + sc.releases + ' 個');
      check('(4d) body.ui-compact (iPhone 相当の狭幅) で 12 行がスクロールできる '
          + '(#rosterBody の scrollHeight > clientHeight かつ overflow-y が auto / scroll)。'
          + '⚠ スクロールを持つのは器ではなく本文 (器ごと動かすと閉じるボタンが流れて届かない)',
        !sc.err && sc.opened === true && sc.scrollH > sc.clientH
          && ['auto', 'scroll'].indexOf(sc.overflowY) >= 0 && sc.scrolled > 0,
        'overflow-y=' + sc.overflowY + ' / scrollH=' + sc.scrollH + ' clientH=' + sc.clientH
          + ' / scrollTop=' + sc.scrolled + ' (' + sc.rows + ' 行)');
    }

    await p1.close();

    // ══════════════════════════════════════════════════════════════════
    // §撤退 ?roster=0 — (6a) (6c)  (項目4 = 依頼書 §9 の §6)
    //   ⭐ 2 本の腕で挟む。片方だけでは「書かない」か「消さない」の一方しか言えない。
    //     腕A = まっさらなプロファイルで ?roster=0。8 周まわしても名簿が **生えない**。
    //     腕B = 先に名簿を育ててから ?roster=0 へ切り替える。**読まない** が **消さない**。
    //   ⚠⚠⚠ 腕B は **同じタブで遷移** すること。新しいタブで開き直すと BOOT の purge が走り、
    //     「消えていないこと」を測る母集団そのものが消える。
    //   ⛔ 腕B の OFF 中に出発を回さない。回すと (6c) まで noretreatswitch で赤くなり、
    //     (6a) と二重に鳴って何を検出したのか判らなくなる (「撤退中に書かない」は腕A の担当)。
    //   ⚠ 生バイトは **DFRoster.KEY 越し** に読む。キー名を直書きすると badprefix のとき
    //     「名簿が育っていない」に見えて、担当外の変異で母集団ガードが落ちる。
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §撤退 ?roster=0 (項目4) ---');
    {
      /* ── 腕A: まっさら + ?roster=0 で 8 周 ── */
      const pa = await openTavern('?roster=0');
      const ra = await grow(pa, 8);
      const offA = await pa.evaluate(() => {
        const out = { err: '' };
        try {
          out.raw      = localStorage.getItem('dragonfighters.mercRoster');
          out.lsKeys   = Object.keys(localStorage).filter((k) => k.indexOf('mercRoster') >= 0);
          out.hasEntry = !!document.getElementById('rosterEntry');
          out.on       = !!(window.DFRoster && DFRoster.enabled());
          out.all      = window.DFRoster ? DFRoster.all().length : -1;
        } catch (e) { out.err = String((e && e.message) || e); }
        return out;
      });
      await pa.close();
      const npcA  = ra.reduce((a, r) => a + (r.post || []).filter((m) => !m.isHero).length, 0);
      const mercA = ra.reduce((a, r) => a
        + (r.post || []).filter((m) => m.mercId !== null).length
        + (r.pre  || []).filter((m) => m.mercId !== null).length, 0);
      const errA  = ra.filter((r) => r.err).length;

      /* ── 腕B: 名簿を育てる → ?roster=0 へ切り替え → 戻す (ぜんぶ同じタブ) ── */
      const pb = await openTavern('');
      await grow(pb, GROW_SMALL);
      const snapB = () => pb.evaluate(() => {
        const key = (window.DFRoster && DFRoster.KEY) || 'dragonfighters.mercRoster';
        return {
          list: (window.DFRoster ? DFRoster.load().list : []).map((m) => ({
            id: m.id, classKey: m.classKey, name: m.name, trait: m.trait,
            line: m.line, variant: m.variant, level: m.level, runs: m.runs })),
          raw: localStorage.getItem(key),
          all: window.DFRoster ? DFRoster.all().length : -1,
          on: !!(window.DFRoster && DFRoster.enabled()),
          hasEntry: !!document.getElementById('rosterEntry'),
          opened: (window.__roster ? window.__roster.open() : null),
        };
      });
      const bOn1 = await snapB();
      await gotoTavern(pb, '?roster=0');
      const bOff = await snapB();
      await gotoTavern(pb, '');
      const bOn2 = await snapB();
      await pb.close();
      console.log('  [腕A ?roster=0 まっさら] ' + JSON.stringify(offA) + ' / NPC ' + npcA
        + ' 人 / mercId ' + mercA + ' 件 / 例外 ' + errA + ' 件 (' + ra.length + ' 周)');
      console.log('  [腕B ON→OFF→ON] 在籍 ' + bOn1.list.length + '→' + bOff.list.length + '→'
        + bOn2.list.length + ' / all() ' + bOn1.all + '→' + bOff.all + '→' + bOn2.all
        + ' / 入口 ' + bOn1.hasEntry + '→' + bOff.hasEntry + '→' + bOn2.hasEntry
        + ' / open() ' + bOn1.opened + '→' + bOff.opened + '→' + bOn2.opened);

      check('(6z4) [装置] 腕A で NPC が実際に編成され、腕B では名簿が 1 人以上まで育った '
          + '(どちらかが 0 だと (6a)(6c) は丸ごと空振りする)',
        errA === 0 && npcA > 0 && bOn1.list.length >= 1 && !!bOn1.raw && bOn1.on === true
          && bOn1.hasEntry === true && bOn1.opened === true,
        '腕A の NPC ' + npcA + ' 人 (' + ra.length + ' 周) / 腕B の在籍 ' + bOn1.list.length
          + ' 人 / 生バイト ' + (bOn1.raw ? bOn1.raw.length + ' 文字' : 'null'));

      check('(6a) ★tavern.html?roster=0 — ① まっさらな腕で 8 周まわしても '
          + 'dragonfighters.mercRoster が null のまま (mercRoster を含む localStorage キーが 0 本) '
          + '② #rosterEntry が DOM に出ない ③ partyMembers に mercId が 0 件 '
          + '④ 既に名簿が在る腕へ切り替えても DFRoster.all() が 0 人 (データを読まない)・'
          + '入口が消える・パネルが開かない',
        !offA.err && offA.raw === null && offA.lsKeys.length === 0
          && offA.hasEntry === false && offA.on === false && offA.all === 0
          && mercA === 0 && errA === 0
          && bOff.on === false && bOff.all === 0 && bOff.hasEntry === false
          && bOff.opened === false && bOff.list.length >= 1,
        '腕A raw=' + JSON.stringify(offA.raw) + ' キー=' + JSON.stringify(offA.lsKeys)
          + ' 入口=' + offA.hasEntry + ' enabled=' + offA.on + ' all()=' + offA.all
          + ' mercId ' + mercA + ' 件 / 腕B(OFF) enabled=' + bOff.on + ' all()=' + bOff.all
          + ' 入口=' + bOff.hasEntry + ' open()=' + bOff.opened
          + ' 生の在籍=' + bOff.list.length + ' 人');

      const sameRoster = JSON.stringify(bOn1.list) === JSON.stringify(bOn2.list);
      check('(6c) ★?roster=0 を **外すと** 既に貯まっている名簿がそのまま復活する '
          + '(撤退スイッチは名簿を消していない)。⭐ 撤退中も生バイトが 1 文字も変わらず、'
          + '戻したあとの在籍が id/名前/性格/口癖/variant/Lv/同行回数まで出発前と完全一致する',
        bOn1.list.length >= 1 && sameRoster
          && bOff.raw === bOn1.raw && bOn2.raw === bOn1.raw
          && bOn2.on === true && bOn2.hasEntry === true && bOn2.all === bOn1.all,
        '在籍 ' + bOn1.list.length + ' 人 / 撤退中の生バイト '
          + (bOff.raw === bOn1.raw ? '不変' : '★変化') + ' / 復帰後 ' + bOn2.list.length
          + ' 人 (完全一致 ' + sameRoster + ') / all() ' + bOn1.all + '→' + bOn2.all);
    }

    // ══════════════════════════════════════════════════════════════════
    // §2 成長
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §2 成長 ---');
    const p2 = await openTavern('');
    await grow(p2, GROW_SMALL);
    const g = await p2.evaluate(() => {
      const out = { err: '' };
      try {
        const snap = (r) => r.list.map((m) => ({ id: m.id, level: m.level, runs: m.runs }));
        const base = DFRoster.load();
        out.base = snap(base);
        out.ids  = base.list.map((m) => m.id);
        /* (2a) 生還 3 回 → runs +3 / Lv +1 */
        for (let i = 0; i < 3; i++) DFRoster.recordRun(out.ids, true);
        out.afterWin = snap(DFRoster.load());
        /* (2b) 敗北 5 回 → 何も動かない */
        for (let i = 0; i < 5; i++) DFRoster.recordRun(out.ids, false);
        out.afterLose = snap(DFRoster.load());
        /* (2d) 上限 10 */
        for (let i = 0; i < 30; i++) DFRoster.recordRun(out.ids, true);
        out.afterMany = snap(DFRoster.load());
        /* (3e) 見送り → その id は二度と配られない */
        const before = DFRoster.load();
        out.relId      = before.list[0].id;
        out.nextBefore = before.next;
        out.beforeN    = before.list.length;
        out.released   = DFRoster.release(out.relId);
        const afterRel = DFRoster.load();
        out.afterRel = { n: afterRel.list.length, next: afterRel.next,
                         has: afterRel.list.some((m) => m.id === out.relId) };
        /* 空いた枠へ登録し直しても、外した id は配られない (next は巻き戻らない) */
        out.newId = DFRoster.enroll({ classKey: 'warrior', name: '__reissue_probe__',
                                      trait: 't', line: 'l', variant: 1, level: 1 });
        const afterAdd = DFRoster.load();
        out.afterAdd = { n: afterAdd.list.length, next: afterAdd.next };
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    if (g.err) console.log('  [!] §2 の走行で例外: ' + g.err);

    check('(2z1) [母集団] §2 の名簿に 1 人以上いる',
      !g.err && !!g.base && g.base.length >= 1, '在籍 ' + ((g.base || []).length) + ' 人');
    {
      const bad = (g.base || []).map((b, i) => {
        const a = g.afterWin[i];
        const want = Math.min(b.level + 1, 10);
        return (a.runs === b.runs + 3 && a.level === want) ? null
          : ('id=' + b.id + ' Lv' + b.level + '→' + a.level + '(期待 ' + want + ') runs '
             + b.runs + '→' + a.runs + '(期待 ' + (b.runs + 3) + ')');
      }).filter(Boolean);
      check('(2a) recordRun(ids, true) を 3 回 → runs が +3 で Lv が +1',
        !g.err && (g.base || []).length >= 1 && bad.length === 0,
        bad.length ? bad.slice(0, 4).join(' / ') : (g.base || []).length + ' 人とも成立');
    }
    {
      const bad = (g.afterWin || []).map((b, i) => {
        const a = g.afterLose[i];
        return (a.runs === b.runs && a.level === b.level) ? null
          : ('id=' + b.id + ' Lv' + b.level + '→' + a.level + ' runs ' + b.runs + '→' + a.runs);
      }).filter(Boolean);
      check('(2b) recordRun(ids, false) を 5 回 → runs も level も 1 も動かない',
        !g.err && (g.afterWin || []).length >= 1 && bad.length === 0,
        bad.length ? bad.slice(0, 4).join(' / ') : (g.afterWin || []).length + ' 人とも不変');
    }
    {
      const lv = (g.afterMany || []).map((m) => m.level);
      check('(2d) level の上限が 10 (生還を積み増しても 10 を超えない)',
        !g.err && lv.length >= 1 && lv.every((v) => v <= 10)
          && Math.max.apply(null, lv) === 10,
        'Lv=' + JSON.stringify(lv));
    }
    check('(3e) release(id) で 1 人減り、**その id は二度と配られない** (next は減らない)',
      !g.err && g.released === true && !!g.afterRel && g.afterRel.n === g.beforeN - 1
        && g.afterRel.has === false && g.afterRel.next === g.nextBefore
        && g.newId !== null && g.newId !== g.relId && g.newId >= g.nextBefore
        && !!g.afterAdd && g.afterAdd.n === g.afterRel.n + 1,
      '外した id=' + g.relId + ' / 在籍 ' + g.beforeN + '→' + (g.afterRel && g.afterRel.n)
        + '→' + (g.afterAdd && g.afterAdd.n) + ' / next ' + g.nextBefore + '→'
        + (g.afterRel && g.afterRel.next) + ' / 次に配った id=' + g.newId);
    await p2.close();

    // ── (2c) 主人公 Lv による clamp が **出発時に** 効く ────────────────────
    //   ⭐ 2 本の腕で挟む。orc-fort は推奨 Lv 6 = tier2 で帯 [5,8] なので、
    //     名簿の Lv 9 は **帯の外**。主人公 Lv 10 の腕で 9 のまま出れば
    //     「振り直していない」、主人公 Lv 3 の腕で 3 になれば「clamp が効いている」。
    //   ⚠⚠ 観測の母集団は **Lv を書き換えた当人だけ** に絞る。2 度目の grow 中に
    //     新しく登録された顔は、その時の帯 / cap で決まった Lv を持つのが **正しい**
    //     (名簿が満杯でなければ必ず起きる)。絞らずに測ると、その正常な値を欠陥と読み違える
    //     ——実際 1 回目の実行で Lv3 側の名簿が [9,…,9,3] になって偽の赤が出た。
    async function clampArm(xp, forceLevel) {
      const page = await openTavern('', xp);
      await grow(page, GROW_SMALL);
      const set = await page.evaluate((lv) => {
        /* ⚠ localStorage へ手で JSON を書かない。名簿自身の load()/save() を往復させる。 */
        const r = DFRoster.load();
        r.list.forEach((m) => { m.level = lv; });
        return { saved: DFRoster.save(r), n: r.list.length, ids: r.list.map((m) => m.id) };
      }, forceLevel);
      const forced = new Set(set.ids || []);
      const rounds = await grow(page, GROW_SMALL);
      const after  = await page.evaluate(PROBE_FN);
      const heroLv = await page.evaluate(() => {
        try { return getLevelFromXP(inventory.xp); } catch (e) { return null; }
      });
      await page.close();
      const seenLv = [];
      rounds.forEach((r) => {
        /* 「抽選の時点で名簿から来た」かつ「Lv を 9 に書き換えた当人」だけを数える */
        const known = new Set((r.pre || []).filter((m) => m.mercId !== null && forced.has(m.mercId))
          .map((m) => m.mercId));
        (r.post || []).forEach((m) => { if (known.has(m.mercId)) seenLv.push(m.level); });
      });
      const rosterLv = ((after.roster && after.roster.list) || [])
        .filter((m) => forced.has(m.id)).map((m) => m.level);
      return { set, heroLv, seenLv, band: after.band, forced: forced.size, rosterLv: rosterLv };
    }
    const armHi = await clampArm(45000, 9);   /* 主人公 Lv10 */
    const armLo = await clampArm(3000, 9);    /* 主人公 Lv3  */
    console.log('  帯 (orc-fort 推奨 Lv6): ' + JSON.stringify(armHi.band)
      + ' / 名簿の Lv を 9 に固定 (帯の外)');
    check('(2z2) [母集団] 両腕とも「Lv を書き換えた当人が名簿から引かれた」ところを実際に観測した',
      armHi.seenLv.length >= 1 && armLo.seenLv.length >= 1
        && armHi.rosterLv.length >= 1 && armLo.rosterLv.length >= 1,
      '主人公 Lv' + armHi.heroLv + ' 側 ' + armHi.seenLv.length + ' 人 (書き換え対象 '
        + armHi.forced + ' 人) / Lv' + armLo.heroLv + ' 側 ' + armLo.seenLv.length
        + ' 人 (書き換え対象 ' + armLo.forced + ' 人)');
    check('(2c) 主人公 Lv による clamp が出発時に効く — 主人公 Lv10 では名簿の Lv9 がそのまま出て '
        + '(帯 [5,8] の外 = 振り直していない証拠)、主人公 Lv3 では 3 に落ちる。'
        + 'かつ **名簿側の 9 は保存されたまま**',
      armHi.heroLv === 10 && armLo.heroLv === 3
        && armHi.seenLv.length >= 1 && armHi.seenLv.every((v) => v === 9)
        && armLo.seenLv.length >= 1 && armLo.seenLv.every((v) => v === 3)
        && armLo.rosterLv.length >= 1 && armLo.rosterLv.every((v) => v === 9),
      'Lv10 側の出発 Lv=' + JSON.stringify(armHi.seenLv) + ' / Lv3 側の出発 Lv='
        + JSON.stringify(armLo.seenLv) + ' / Lv3 側の名簿 Lv=' + JSON.stringify(armLo.rosterLv));

    // ── (2e) 準備画面の **表示** Lv にも同じ clamp が効く (項目2 で新設) ──────────
    //   ⚠⚠ (2c) は「出発が焼いた partyMembers の level」を見ている。それだけでは、
    //     **出発する前** に準備画面が出しているスキルスロット数は縛れない。
    //     recordRun() が主人公 Lv を超えて名簿を育てた直後、pickCompanion() は名簿の生 Lv を
    //     載せる → assignCompanionLevels() が走るのは departToScenario() の中 → その間、
    //     memberLevelOf() が生 Lv を返すと skillLimitForClass() が実 Lv より多い枠を出す。
    //   ⭐ だから測るのは「名簿 Lv 9 / 主人公 Lv 3 のとき、準備画面のスロット数が Lv3 相当」。
    //   ⛔ partySkills の中身も allyEquip も読まない。見るのは **枠の数** だけ。
    console.log('\n--- §2 (2e) 準備画面の表示 Lv (項目2 で新設) ---');
    {
      const page = await openTavern('', 3000);      /* 主人公 Lv3 */
      await grow(page, GROW_SMALL);
      const set = await page.evaluate(() => {
        /* ⚠ localStorage へ手で JSON を書かない。名簿自身の load()/save() を往復させる。 */
        const r = DFRoster.load();
        r.list.forEach((m) => { m.level = 9; });
        return { saved: DFRoster.save(r), n: r.list.length };
      });
      const slotArm = await page.evaluate(() => {
        const o = { err: '', tries: 0 };
        try {
          o.heroLv  = getLevelFromXP(inventory.xp);
          o.slotAt3 = skillSlotsForLevel(3);
          o.slotAt9 = skillSlotsForLevel(9);
          /* 名簿から引いた顔が編成に入るまで引き直す。⚠ 抽選なので 1 回では入らないことがある。
             ⭐ 選ぶのは「その classKey で **先頭** の人」だけ —— memberLevelOf() は
               ms.find(x => x.classKey === classKey) なので、同職が 2 人いると別人を測る。 */
          let pick = null;
          for (let t = 0; t < 40 && !pick; t++) {
            o.tries = t + 1;
            regeneratePartyMembers();
            const ms = selection.partyMembers;
            pick = ms.find((x, i) => x && !x.isHero && x.mercId != null
              && ms.findIndex((y) => y && y.classKey === x.classKey) === i) || null;
          }
          if (!pick) { o.err = '名簿から引いた顔が編成に入らなかった'; return o; }
          o.classKey    = pick.classKey;
          o.rawLevel    = pick.level;                          /* 名簿がそのまま載せた Lv (期待 9) */
          o.memberLevel = memberLevelOf(pick.classKey);        /* 準備画面が使う Lv (期待 3)      */
          o.slots       = skillLimitForClass(pick.classKey);   /* 準備画面のスロット数 (期待 Lv3) */
          o.rosterLv    = DFRoster.load().list.map((m) => m.level);
        } catch (e) { o.err = String((e && e.message) || e); }
        return o;
      });
      await page.close();
      console.log('  [2e] ' + JSON.stringify(slotArm));

      check('(2z3) [母集団] 主人公 Lv3・名簿 Lv9 の状態を実際に作れて、しかも '
          + 'Lv3 相当と Lv9 相当のスロット数が **違う** (同じなら (2e) は何も検出できない)',
        !slotArm.err && set.saved === true && set.n >= 1 && slotArm.heroLv === 3
          && slotArm.rawLevel === 9 && slotArm.slotAt3 !== slotArm.slotAt9,
        '主人公 Lv=' + slotArm.heroLv + ' / 編成に載った生 Lv=' + slotArm.rawLevel
          + ' / スロット Lv3=' + slotArm.slotAt3 + ' vs Lv9=' + slotArm.slotAt9
          + ' / 引き直し ' + slotArm.tries + ' 回 (名簿 ' + set.n + ' 人)'
          + (slotArm.err ? ' / err=' + slotArm.err : ''));
      check('(2e) 名簿 Lv 9・主人公 Lv 3 のとき、準備画面の仲間スキルスロット数が **Lv3 相当** '
          + '(Lv9 相当の多い枠が出ない)。かつ **名簿側の 9 は保存されたまま**',
        !slotArm.err && slotArm.memberLevel === 3
          && slotArm.slots === slotArm.slotAt3 && slotArm.slots !== slotArm.slotAt9
          && Array.isArray(slotArm.rosterLv) && slotArm.rosterLv.length >= 1
          && slotArm.rosterLv.every((v) => v === 9),
        'memberLevelOf=' + slotArm.memberLevel + ' (期待 3) / スロット=' + slotArm.slots
          + ' (Lv3 相当 ' + slotArm.slotAt3 + ' / Lv9 相当 ' + slotArm.slotAt9 + ') / 名簿 Lv='
          + JSON.stringify(slotArm.rosterLv));
    }

    // ══════════════════════════════════════════════════════════════════
    // §3 名簿の器 (前置詞 / スロット / 新規ゲーム)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §3 名簿の器 (前置詞・スロット) ---');
    const p4 = await openTavern('');
    await grow(p4, GROW_SMALL);
    const slot = await p4.evaluate(() => {
      const out = { err: '' };
      try {
        const hit = (o) => Object.keys(o).filter((k) => k.indexOf('mercRoster') >= 0);
        out.livePrefix  = DFSlots.LIVE_PREFIX;
        out.lsKeys      = hit(localStorage);
        out.before      = DFRoster.all().length;
        const snap      = DFSlots.snapshot();
        out.snapKeys    = (snap && snap.data) ? hit(snap.data) : [];
        out.snapAllKeys = (snap && snap.data) ? Object.keys(snap.data).length : 0;
        DFSlots.wipeLive();
        out.afterWipeLs  = hit(localStorage);
        out.afterWipeAll = DFRoster.all().length;
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    if (slot.err) console.log('  [!] §3 の走行で例外: ' + slot.err);
    check('(3a) 名簿のキーが localStorage にちょうど 1 本あり、その前置詞が DFSlots.LIVE_PREFIX と'
        + '一致する (= 前置詞総なめで拾われる形になっているか)',
      !slot.err && !!slot.lsKeys && slot.lsKeys.length === 1
        && typeof slot.livePrefix === 'string' && slot.livePrefix.length > 0
        && slot.lsKeys[0].indexOf(slot.livePrefix) === 0 && slot.before >= 1,
      'キー=' + JSON.stringify(slot.lsKeys) + ' / LIVE_PREFIX=' + JSON.stringify(slot.livePrefix)
        + ' / 在籍 ' + slot.before + ' 人');
    check('(3c) DFSlots.snapshot() の data に名簿が含まれる (= スロットごとに別の名簿になる)',
      !slot.err && !!slot.snapKeys && slot.snapKeys.length === 1
        && slot.snapKeys[0].indexOf(slot.livePrefix) === 0,
      'snapshot.data の名簿キー=' + JSON.stringify(slot.snapKeys)
        + ' (data 全体 ' + slot.snapAllKeys + ' キー)');
    check('(3b) DFSlots.wipeLive() の後、名簿が消える (= 新規ゲームで消える)。'
        + '⭐ 「dragonfighters.mercRoster が null」だけでは前置詞違いを見逃すので、'
        + 'DFRoster.all() と localStorage の両方で測る',
      !slot.err && !!slot.afterWipeLs && slot.afterWipeLs.length === 0 && slot.afterWipeAll === 0,
      '残ったキー=' + JSON.stringify(slot.afterWipeLs) + ' / DFRoster.all()='
        + slot.afterWipeAll + ' 人 (wipe 前は ' + slot.before + ' 人)');
    await p4.close();

    // ══════════════════════════════════════════════════════════════════
    // §5 恒等 (非退行)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §5 恒等 (非退行) ---');
    const p5 = await openTavern('?roster=0');
    const r5 = await grow(p5, 3);
    await p5.close();

    const keyset = (rounds) => {
      const s = new Set();
      rounds.forEach((r) => (r.post || []).forEach((m) => {
        if (!m.isHero) m.keys.forEach((k) => s.add(k));
      }));
      return s;
    };
    const legacyKeys = keyset(r5);
    const rosterKeys = keyset([r1[0]]);            /* 名簿が空だった 1 周目 */
    const rosterMinusMerc = new Set(Array.from(rosterKeys).filter((k) => k !== 'mercId'));
    const same = legacyKeys.size > 0 && rosterMinusMerc.size === legacyKeys.size
      && Array.from(legacyKeys).every((k) => rosterMinusMerc.has(k));
    const legacyHasMerc = Array.from(legacyKeys).indexOf('mercId') >= 0;
    /* ⭐⭐⭐ キー集合だけでは「形が一致する」と言い切れない。名簿の形をした **半端な人物** を
       作る欠陥 (負のコントロール alwaysroster) は、キー名は全部そろったまま値だけが空になる。
       → 値の「型」と「空文字でないこと」まで従来と突き合わせる。
       ⛔ 中身 (どの性格が出たか) は見ない —— そこは抽選なので、比べられるのは型と空でないことだけ。 */
    const shapeOf = (rounds) => {
      const s = {};
      rounds.forEach((r) => (r.post || []).forEach((m) => {
        if (m.isHero) return;
        ['name', 'trait', 'line', 'variant', 'level'].forEach((k) => {
          const v = m[k];
          const t = (v === null) ? 'null' : typeof v;
          const tag = (t === 'string') ? ('string' + (v.length > 0 ? '' : ':empty')) : t;
          if (!s[k]) s[k] = [];
          if (s[k].indexOf(tag) < 0) s[k].push(tag);
        });
      }));
      Object.keys(s).forEach((k) => s[k].sort());
      return s;
    };
    const legacyShape = shapeOf(r5);
    const rosterShape = shapeOf([r1[0]]);
    const sameShape = Object.keys(legacyShape).length === 5
      && JSON.stringify(legacyShape) === JSON.stringify(rosterShape);
    check('(5a) 名簿が空のとき partyMembers の形が従来と完全に一致する '
        + '(① キー集合が mercId を除いて同一 ② name/trait/line/variant/level の型と'
        + '「空文字でないこと」も同一。?roster=0 の腕を基準にする)',
      same && sameShape && !legacyHasMerc && r5.every((r) => !r.err) && !r1[0].err,
      '従来=' + JSON.stringify(Array.from(legacyKeys).sort())
        + ' / 名簿 ON 1 周目=' + JSON.stringify(Array.from(rosterKeys).sort())
        + ' / 値の形 従来=' + JSON.stringify(legacyShape)
        + ' vs 名簿 ON=' + JSON.stringify(rosterShape));

    check('(5b) allyEquip / partySkills / actionPriority の 3 キーが出発の前後で 1 バイトも変わらない '
        + '(' + r1.length + ' 周ぶん)',
      persistStable,
      persistStable ? '3 キーとも ' + r1.length + ' 周ぜんぶ同一'
        : '★変化した -- 差分のあった周 ' + persists.filter((s) => s !== persists[0]).length + ' 件');

    // ══════════════════════════════════════════════════════════════════
    // §6 帰還時の書き戻し (項目2 = 依頼書 §6)
    //   ⭐⭐⭐ ここだけは **本番の 2 ページを実際に往復させる**。
    //     ⛔ localStorage へ手で JSON を書いて「帰還した」ことにしない。
    //     ① 酒場の departToScenario() が名簿へ登録し、partyMembers を焼く
    //     ② index.html がその formation を読み、showResult() が lastResult へ roster を載せる
    //     ③ 酒場を **同じタブで開き直し**、consumeResult() にその lastResult を消費させる
    //     ④ 名簿の runs / level が動いたかを見る
    //   ⭐ 「2 経路で突き合わせる」= ① index が焼いた roster.ids と ② 名簿の runs 差分。
    //     どちらか片方だけだと、ids が空でも runs が全部増えても緑になってしまう。
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §6 帰還時の書き戻し (index → 酒場の往復) ---');
    {
      /* 配信バイトの構造 —— 書き込み点 2 つ (クリア/敗北 と 撤退) の両方に roster が載っているか。
         ⭐ 撤退経路は実プレイで踏むのが難しいので、ここだけ構造で縛る (理由は lastResultBlocks)。 */
      const blocks = lastResultBlocks(FROZEN['/index.html']);
      const withRoster  = blocks.filter((b) => b.indexOf('roster: rosterResultPayload(') >= 0);
      const withRetreat = blocks.filter((b) => b.indexOf('retreated: true') >= 0);
      const NEED5 = ['scenarioId', 'scenarioTitle', 'cleared', 'defeated', 'reward', 'chronicle'];
      /* ⚠⚠ キーの在り方は 2 通りある —— `reward,` (短縮記法) と `reward: {` (コロン付き)。
         `k + ":"` だけで探すと scenarioId / reward を取りこぼして **偽の赤**になる。
         ⚠ 逆に素の indexOf(k) だと ?chronicle=0 と書いたコメントまで数えてしまう (#34 の罠)。
         → 「行頭 or { or , のあと」+ k + 「, か :」= プロパティの位置にあるものだけ数える。 */
      const hasKey = (b, k) => new RegExp('(?:^|[\\n{,])\\s*' + k + '\\s*[,:]').test(b);
      const lackKeys = blocks.map((b, i) => {
        const miss = NEED5.filter((k) => !hasKey(b, k));
        return miss.length ? ('#' + (i + 1) + ' 欠け=' + JSON.stringify(miss)) : '';
      }).filter(Boolean);
      check('(5c2) index.html の lastResult 書き込みは 2 箇所で、**両方**が roster を載せている。'
          + 'うち 1 つが撤退経路 (retreated: true) で、既存キーはどちらのブロックでも欠けていない',
        blocks.length === 2 && withRoster.length === 2 && withRetreat.length === 1
          && lackKeys.length === 0,
        '書き込み点 ' + blocks.length + ' 箇所 / roster 付き ' + withRoster.length
          + ' / retreated:true 付き ' + withRetreat.length
          + ' / 既存キーの欠け ' + (lackKeys.length ? lackKeys.join(' , ') : 'なし'));

      /* ── ① 酒場で名簿を育て、本番が焼いた partyMembers をそのまま持ち出す ── */
      const p6 = await openTavern('');
      await grow(p6, GROW_SMALL);
      const seed = await p6.evaluate(() => {
        const out = { err: '' };
        try {
          out.party  = sessionStorage.getItem('dragonfighters.partyMembers');
          out.roster = DFRoster.load().list.map((m) => ({ id: m.id, level: m.level, runs: m.runs }));
          const arr  = JSON.parse(out.party || '[]');
          out.mercIds = arr.filter((m) => m && m.mercId != null).map((m) => m.mercId);
        } catch (e) { out.err = String((e && e.message) || e); }
        return out;
      });
      check('(6z0) [装置] 本番の出発が焼いた partyMembers に mercId が 1 件以上ある '
          + '(0 件だと index 側の roster.ids が空になり §6 が丸ごと空振りする)',
        !seed.err && !!seed.party && (seed.mercIds || []).length >= 1
          && (seed.roster || []).length >= 1,
        '同行 ' + (seed.mercIds || []).length + ' 人 mercId=' + JSON.stringify(seed.mercIds)
          + ' / 名簿 ' + (seed.roster || []).length + ' 人');

      /* ── ② index.html に本番の formation を読ませ、showResult() に lastResult を書かせる ──
         ⭐ 敗北 (survived=false) と クリア (survived=true) を **同じページで対にして** 採る。
           対で採らないと「そもそも書いていない実装」でも「増えない」で緑になる。 */
      const PROBE_INDEX = function () {
        const out = { err: '' };
        try {
          out.on    = (typeof ROSTER_ON !== 'undefined') ? ROSTER_ON : null;
          out.hasFn = (typeof window.showResult === 'function');
          out.formationMerc = (typeof formation !== 'undefined' && formation)
            ? formation.filter((m) => m && m.mercId != null).map((m) => m.mercId) : null;
          const shot = (win) => {
            sessionStorage.removeItem('dragonfighters.lastResult');
            resultShown = false;                       /* 既に出ていても書き直させる */
            if (out.hasFn) window.showResult(win);
            return sessionStorage.getItem('dragonfighters.lastResult');
          };
          out.loseRaw = shot(false);
          out.winRaw  = shot(true);
          const p = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
          out.loseKeys = p(out.loseRaw) ? Object.keys(p(out.loseRaw)) : null;
          out.winKeys  = p(out.winRaw)  ? Object.keys(p(out.winRaw))  : null;
          out.lose     = p(out.loseRaw) ? p(out.loseRaw).roster : undefined;
          out.win      = p(out.winRaw)  ? p(out.winRaw).roster  : undefined;
        } catch (e) { out.err = String((e && e.message) || e); }
        return out;
      };
      const pIdxOn = await openIndexPage('', seed.party);
      const idxOn  = await pIdxOn.evaluate(PROBE_INDEX);
      await pIdxOn.close();
      const pIdxOff = await openIndexPage('&roster=0', seed.party);
      const idxOff  = await pIdxOff.evaluate(PROBE_INDEX);
      await pIdxOff.close();
      console.log('  [index ON ] ' + JSON.stringify({ on: idxOn.on, keys: idxOn.winKeys,
        lose: idxOn.lose, win: idxOn.win, err: idxOn.err }));
      console.log('  [index OFF] ' + JSON.stringify({ on: idxOff.on, keys: idxOff.winKeys,
        lose: idxOff.lose, err: idxOff.err }));

      check('(6z1) [装置] 両方の index で showResult が実際に走り lastResult が書かれた。'
          + 'かつ formation が酒場の焼いた mercId をそのまま読めている',
        idxOn.hasFn === true && idxOff.hasFn === true && !!idxOn.winKeys && !!idxOff.loseKeys
          && JSON.stringify((idxOn.formationMerc || []).slice().sort())
             === JSON.stringify((seed.mercIds || []).slice().sort()),
        'index の formation の mercId=' + JSON.stringify(idxOn.formationMerc)
          + ' / 酒場が焼いた mercId=' + JSON.stringify(seed.mercIds)
          + ' / err on=' + idxOn.err + ' off=' + idxOff.err);

      check('(6z2) [装置] ★対の片方 — 撤退スイッチ無しなら roster キーが **載る** '
          + '(これが無いと (6b) は「そもそも載せない実装」でも緑になる)。'
          + 'クリア=survived true / 敗北=survived false',
        idxOn.on === true
          && !!idxOn.win  && idxOn.win.survived === true
          && !!idxOn.lose && idxOn.lose.survived === false
          && JSON.stringify((idxOn.win.ids || []).slice().sort())
             === JSON.stringify((seed.mercIds || []).slice().sort()),
        'ROSTER_ON=' + idxOn.on + ' / クリア側=' + JSON.stringify(idxOn.win)
          + ' / 敗北側=' + JSON.stringify(idxOn.lose));

      check('(6b) ★index.html?roster=0 → lastResult に roster キーが載らない',
        idxOff.on === false && idxOff.lose === undefined
          && (idxOff.loseKeys || ['roster']).indexOf('roster') < 0,
        'ROSTER_ON=' + idxOff.on + ' / keys=' + JSON.stringify(idxOff.loseKeys));

      const NEED = ['scenarioId', 'scenarioTitle', 'cleared', 'defeated', 'reward'];
      const lack = (keys) => NEED.filter((k) => (keys || []).indexOf(k) < 0);
      const lackCh = (keys) => ((keys || []).indexOf('chronicle') < 0);
      check('(5c) lastResult の既存キー (scenarioId/scenarioTitle/cleared/defeated/reward) が '
          + '?roster=0 の有無どちらでも 1 つも欠けていない。⚠ #37 が足した chronicle キーも消えていない',
        lack(idxOn.winKeys).length === 0 && lack(idxOn.loseKeys).length === 0
          && lack(idxOff.loseKeys).length === 0
          && !lackCh(idxOn.winKeys) && !lackCh(idxOn.loseKeys) && !lackCh(idxOff.loseKeys),
        '欠け on(clear)=' + JSON.stringify(lack(idxOn.winKeys))
          + ' on(defeat)=' + JSON.stringify(lack(idxOn.loseKeys))
          + ' off=' + JSON.stringify(lack(idxOff.loseKeys))
          + ' / chronicle 欠け=' + JSON.stringify([lackCh(idxOn.winKeys),
              lackCh(idxOn.loseKeys), lackCh(idxOff.loseKeys)]));

      /* ── ③④ 酒場を同じタブで開き直し、consumeResult() に消費させて名簿の差分を見る ── */
      const consume = async (raw) => {
        await p6.evaluate((s) => {
          sessionStorage.setItem('dragonfighters.lastResult', s);
        }, raw);
        await reloadTavern(p6);
        return p6.evaluate(() => DFRoster.load().list
          .map((m) => ({ id: m.id, level: m.level, runs: m.runs })));
      };
      const afterLose = await consume(idxOn.loseRaw);
      const afterWin  = await consume(idxOn.winRaw);
      const byId = (a) => { const m = {}; (a || []).forEach((x) => { m[x.id] = x; }); return m; };
      const aL = byId(afterLose), aW = byId(afterWin);
      const inRun = new Set(seed.mercIds || []);
      const badLose = (seed.roster || []).filter((x) => !aL[x.id]
        || aL[x.id].runs !== x.runs || aL[x.id].level !== x.level)
        .map((x) => 'id=' + x.id + ' runs ' + x.runs + '→' + (aL[x.id] && aL[x.id].runs));
      /* ⭐ 生還ぶんの差分は **敗北を消費した直後 (afterLose) を基準** に採る。seed を基準にすると
         「敗北でも増える」欠陥 (負のコントロール defeatgrows) がここでも赤くなり、(2f2) と
         二重に鳴って何を検出したのか判らなくなる。
         ⛔ 弱めてはいない —— 「同行者だけ +1 / 留守は 0」という主張は基準をずらしても 1 ミリも
           緩まない (「敗北でも増える」を捕まえるのは (2f2) の担当)。 */
      const badWin = (seed.roster || []).map((x) => {
        const base = aL[x.id];
        const want = (base ? base.runs : x.runs) + (inRun.has(x.id) ? 1 : 0);
        const got  = aW[x.id];
        return (base && got && got.runs === want) ? null
          : ('id=' + x.id + (inRun.has(x.id) ? '(同行)' : '(留守)') + ' runs '
             + (base ? base.runs : x.runs) + '→' + (got && got.runs) + ' 期待 ' + want);
      }).filter(Boolean);
      console.log('  [往復] 出発前 runs=' + JSON.stringify((seed.roster || []).map((x) => x.runs))
        + ' / 敗北の帰還後=' + JSON.stringify((afterLose || []).map((x) => x.runs))
        + ' / 生還の帰還後=' + JSON.stringify((afterWin || []).map((x) => x.runs)));

      check('(2f) ★index が書いた lastResult を酒場の consumeResult() が消費すると、'
          + '**同行して生還した顔だけ** runs が +1 になる (留守番は動かない)。'
          + '2 経路 = ① index が焼いた roster.ids ② 名簿の runs 差分',
        !!(idxOn.win && (idxOn.win.ids || []).length >= 1) && inRun.size >= 1
          && (seed.roster || []).length >= 1 && badWin.length === 0
          && (seed.roster || []).some((x) => !inRun.has(x.id)),
        '同行 ' + inRun.size + ' 人 / 留守 '
          + ((seed.roster || []).length - inRun.size) + ' 人 / 食い違い '
          + badWin.length + (badWin.length ? ' -- ' + badWin.slice(0, 4).join(' , ') : ''));

      check('(2f2) ★敗北 (survived: false) で帰ってきた lastResult を消費しても、'
          + 'runs も level も 1 も動かない (生還と敗北を同じ往復の対で測る)',
        !!(idxOn.lose && idxOn.lose.survived === false)
          && (seed.roster || []).length >= 1 && badLose.length === 0
          && (afterLose || []).length === (seed.roster || []).length,
        '在籍 ' + (seed.roster || []).length + '→' + (afterLose || []).length
          + ' 人 / 動いた人 ' + badLose.length
          + (badLose.length ? ' -- ' + badLose.slice(0, 4).join(' , ') : ''));

      await p6.close();
    }

    check('(Z) pageerror ゼロ', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 5)));

  } catch (e) {
    console.error('[driver] FATAL ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  const pass = results.filter((r) => r.state === 'PASS').length;
  const fail = results.filter((r) => r.state === 'FAIL').length;
  const pend = results.filter((r) => r.state === 'PENDING').length;
  console.log('\n[mercenary-roster] ' + pass + ' PASSED / ' + fail + ' FAILED / ' + pend + ' PENDING'
    + '  (' + pass + '/' + results.length + ')');
  if (fail > 0) {
    console.log('[mercenary-roster] NG: ' + results.filter((r) => r.state === 'FAIL')
      .map((r) => r.name.split(' ')[0]).join(' | '));
  }
  if (exitCode === 3) process.exit(3);

  if (NEGATIVE) {
    /* 変異を入れたのに担当ラベルが緑のまま = 空振り。⛔ 黙って成功させない。 */
    const red  = new Set(results.filter((r) => r.state === 'FAIL').map((r) => r.name.split(' ')[0]));
    const miss = [];
    INJECTED.forEach((tag) => (NEG_EXPECT[tag] || []).forEach((lab) => {
      if (!red.has(lab)) miss.push(tag + '→' + lab);
    }));
    console.log('[driver] --negative: 注入=' + (INJECTED.join(',') || 'なし')
      + ' / 赤くなったラベル=' + (Array.from(red).join(',') || '(なし)'));
    if (!INJECTED.length) { console.error('[driver] 変異を 1 つも注入していません'); process.exit(1); }
    if (miss.length) { console.error('[driver] 空振り: ' + miss.join(' , ')); process.exit(1); }
    console.log('[driver] --negative OK (担当ラベルが全部赤くなりました)');
    process.exit(0);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
