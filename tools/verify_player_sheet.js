#!/usr/bin/env node
/*
 * tools/verify_player_sheet.js — プレイヤーシート v1 + 言語 (実装依頼書 #29 §9)
 * ════════════════════════════════════════════════════════════════════════════
 * 何を担保するか (依頼書 §9 の §0〜§5 を 1 つ残らず宣言する)
 *   §0 装置   母集団 (5 ページ) / DFSheet の搭載 / **開いたことの確認** / 言語マスタの件数
 *   §1 呼出口 3 経路 (partyPanel の子 / townHud の子 / body へ fixed) と、覆われていないこと
 *   §2 中身   6 能力 (CHA 込み) / 修正値が DFAbilities 由来 / 取れない区画は行ごと消える / 技能 12
 *   §3 言語   選択チップ / 未充足で出発不可 / 保存は選択分だけ / 表示は固定+選択 / 職替えでリセット
 *   §4 恒等   既存 HUD が 1px も動かない / XP_THRESHOLDS の写しが index.html と一致 /
 *             pageerror 0 / 増えた localStorage キーは 1 本だけ
 *   §5 撤退   ?sheet=0 で何も注入されない / 言語キー無しでも固定分だけ出て落ちない
 *   §6 空欄枠 宣言した「空の枠」と「取れなかった区画」を混同していない (#36)
 *   §7 体裁   3 段組が 3/2/1 に畳まれる / 能力値ボックスが縦 1 列 / 横スクロールしない (#36)
 *   §8 出所   セーヴ・先制・攻撃が **実際に振られている値** と一致する 2 経路照合 (#36)
 *   §9 恒等   撤退 ?sheet5e=0 で #29 の姿へ戻り、非退行であること (#36)
 *
 * ⭐⭐⭐ 本ファイルは **dev-loop 項目 1 の成果物**である。
 *   項目 1 の時点では 5 ページに `<script src="js/player-sheet.js">` が **まだ 1 行も無い**
 *   (HTML を触るのは項目 2 の担当)。よって実ページが要る受入条件は **1 つも測れない**。
 *   ⛔ 測れないものを「緑」にしない。**pending() で理由つきに PENDING 出力**する。
 *   → 出力は PASSED / FAILED / **PENDING** の 3 値。項目 2〜4 の worker は
 *     「どれを埋めるか」「黙って緑にしていないか」を末尾の合計行だけで確認できる。
 *   ⭐ 完了条件 (項目 4) = **PENDING 0** かつ **FAILED 0** かつ **変異 7 本すべて実装**。
 *
 * ⭐ この時点で測れるもの (= 実ページを開かずに済むもの) は全部埋めてある:
 *   共有モジュール単体の契約を、`__sheet_probe.html` という **最小スタブページ**を配信して測る。
 *   (abilities.js + player-sheet.js だけを載せた HTML。本番 HTML は 1 バイトも触らない)
 *
 * ⛔ 測らないこと (依頼書 §9「測らないこと」)
 *   - 見た目の寸法・色・フォント (実機の目視で決める)
 *   - assets/sheet_frame.png の有無 (絵の到着待ちで赤にしない。§7)
 *   - 言語の効き目 (判定・イベント分岐)。v1 では存在しない
 *
 * 使い方:
 *     node tools/verify_player_sheet.js                    # 素
 *     node tools/verify_player_sheet.js --negative         # 負のコントロール (空振り 1 本で exit 1)
 *     node tools/verify_player_sheet.js --mutate nocha     # 単一変異で走らせる
 *     node tools/verify_player_sheet.js --port 9470 --headful
 *
 * ⚠ ポート: 既定 9470。`grep -rnoE "'9[0-9]{3}'" tools/` で 2026-08-28 に実測し、
 *   9470〜9479 が**丸ごと空き**であることを確認して選んだ。
 *   ⛔ 依頼を受けた既定値 8935 は採らなかった: 変異 7 本ぶんの 8936〜8942 が
 *   driver_choice_logslot (8940) / driver_mapeditor_waterkit (8941) と、
 *   さらに verify_ability_scores の変異ポート帯 (8931〜8936) と重なる。
 */
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const argv  = process.argv.slice(2);
const arg   = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag  = (n) => argv.includes('--' + n);
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE   = arg('mutate', null);
const PORT     = parseInt(arg('port', '9470'), 10);

const SHEET_JS     = 'js/player-sheet.js';
const ABILITIES_JS = 'js/abilities.js';
const HERO_JS      = 'js/hero-classes.js';
const SKILL_JS     = 'js/skill-check.js';
const INDEX_HTML   = 'index.html';
const TITLE_HTML   = 'title.html';
const PAGES = ['index.html', 'tavern.html', 'town.html', 'world.html', 'title.html'];

/* ── スタブページ ────────────────────────────────────────────────────────
 *  ⭐ ゲーム本体を開かないのは軽さのためではなく、**データ層と結線を別々に測る**ため。
 *    結線 (5 ページへの <script src>) は §0(0b) / §1 の担当で、そちらは項目 2 が入るまで測れない。
 *  ⚠ 本番 HTML を 1 バイトも触らずにモジュールを評価するための器なので、
 *    ここに本番の CSS も HUD も入れないこと (入れると「本番で動く」の証拠に化けてしまう)。 */
const STUB_REL  = '__sheet_probe.html';
const STUB_HTML = '<!doctype html><meta charset="utf-8"><title>sheet probe</title>\n'
  + '<script src="' + ABILITIES_JS + '"></script>\n'
  + '<script src="' + SHEET_JS + '"></script>\n';

/* HERO_CLASSES を載せた版。⭐ シートが自前で持つ CLASS_LABELS が
 *   js/hero-classes.js の表示名とズレていないかを **2 経路**で照合するためだけに使う。 */
const STUB_HC_REL  = '__sheet_probe_hc.html';
const STUB_HC_HTML = '<!doctype html><meta charset="utf-8"><title>sheet probe (hero-classes)</title>\n'
  + '<script src="' + ABILITIES_JS + '"></script>\n'
  + '<script src="' + HERO_JS + '"></script>\n'
  + '<script src="' + SHEET_JS + '"></script>\n';

// ══════════════════════════════════════════════════════════════════════════════
// 変異表 (負のコントロール) — 依頼書 §9 の表そのもの
//   ⭐ 項目 1 では **7 本すべて impl:false = 宣言のみ**。実装は項目 4 の担当。
//   ⚠ 実装するとき: file/from/to は「配信スナップショットへの 1 行置換」。
//     ちょうど 1 箇所ヒットが起動時の条件で、2 箇所ヒットなら exit 3 で即死する。
//   ⚠ 変異アンカーは **部分文字列で照合**する。同じ処理をインデント違いで 2 箇所へ置くと
//     必ず 2 ヒットして exit 3 になる (2026-08-25 に BGM で実測済み)。
//   ⚠ verify_ability_scores.js も `nocha` という名前の変異を持つが、
//     あちらの対象は js/abilities.js、こちらは js/player-sheet.js。**対象ファイルが
//     違うので衝突しない**。本ドライバが触る対象は js/player-sheet.js と
//     title.html に閉じること。
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐⭐ 2026-08-29 に `--mutate <k>` を 7 本とも単体で回して実測した「赤くなった節」。
 *   evaluable / allowRed はこの実測から決めた (机上で決めない — 巻き込みは必ず出る)。
 *     wipeorder  → 3c 3d 4d          (担当 3c / 3d は言語欄が固定分だけになる副作用)
 *     fixedsave  → 3c                (⭐ languagesOf が重複を潰すので 3d は緑のまま)
 *     nocha      → 2a 2b             (2b は cha 行が消えることの副作用)
 *     ownmod     → 0s13 2b           (⭐ 2a は緑 = 5e では同じ数字になるから)
 *     blankrow   → 2c 2d
 *     fixedbtn   → 1b                (⭐ 1a/1c は緑 = z-index 62 なので押せてはしまう)
 *     closedread → 0c 1c 2a 2b 2c 2d (開かないので中身が全部空になる)
 *   ⚠ 4d / 2b のように **その変異の want で測っていない節**は evaluable に載せない。
 *     母集団 0 の述語は一律 false を返すので「偽の赤」= 空振りの見逃しになる。
 */
const MUTATIONS = {
  wipeorder: {
    impl: true, file: TITLE_HTML, targets: ['3c'],
    /* ⭐ 「保存を前へ移す」を 1 行置換で作る。素直に行を入れ替えると 2 行の置換になり、
       CRLF/LF 差で空振りしうる (from は 1 行しか許していない)。
       → newGame() の **手前** で書き、同じ式で LANG_ON を落として後段の保存を殺す。
         結果は「newGame より前に 1 回だけ書いた」= 罠 B そのもの。 */
    from: '      try { if (window.DFSlots) DFSlots.newGame(pendingSlot); } catch (e) {}',
    to:   '      try { if (LANG_ON) { localStorage.setItem(LANG_KEY, JSON.stringify(pickedLangs)); LANG_ON = false; } } catch (e) {}\n'
        + '      try { if (window.DFSlots) DFSlots.newGame(pendingSlot); } catch (e) {}',
    want: { title: true }, evaluable: ['3a', '3b', '3c', '3d', '3e'], allowRed: ['3d'],
    why: '⭐⭐⭐ 依頼書 §2-2 罠 B の再現。languages の保存を DFSlots.newGame() の **前** へ移す。'
       + ' newGame() は dragonfighters.* を prefix 総なめで消すので、書いた直後に消える'
       + ' (しかもエラーは 1 つも出ない = 振る舞いのテストでしか捕まらない)。',
  },
  fixedsave: {
    impl: true, file: TITLE_HTML, targets: ['3c'],
    from: '        if (LANG_ON) localStorage.setItem(LANG_KEY, JSON.stringify(pickedLangs));',
    to:   '        if (LANG_ON) localStorage.setItem(LANG_KEY, JSON.stringify((((langDefOf(chosenClass) || {}).fixed) || []).concat(pickedLangs)));',
    want: { title: true }, evaluable: ['3a', '3b', '3c', '3d', '3e'], allowRed: [],
    why: '固定分 (CLASS_LANGUAGES.fixed) も dragonfighters.languages へ保存する。'
       + ' ⛔ 依頼書 §2-5 の禁止事項。混ぜると職の固定言語を直したとき既存セーブだけ古くなる。'
       + ' ⭐ languagesOf() が重複を潰すので **表示 (3d) は正しいまま** = 保存の中身を'
       + ' 直接見る (3c) だけが赤くなる。',
  },
  nocha: {
    impl: true, file: SHEET_JS, targets: ['2a'],
    from: '      var keys = A.ABILITY_KEYS || ["str", "dex", "con", "int", "wis", "cha"];',
    to:   '      var keys = (A.ABILITY_KEYS || ["str", "dex", "con", "int", "wis"]).filter(function (x) { return x !== "cha"; });',
    want: { pages: true }, evaluable: ['2a', '2c', '2d'], allowRed: [],
    /* ⛔ (2b) を evaluable に入れない: want に pagesBX を含めていないので母集団 0 で
       「述語が false」= 偽の赤になる。測っていない節は載せない (依頼書 §9 の作法)。 */
    why: 'シートの能力値行から CHA を落とす。#28 で CHA 込みへ一本化した意味が死ぬ。',
  },
  ownmod: {
    impl: true, file: SHEET_JS, targets: ['2b'],
    from: '          mod: A.abilityMod(sc[k]),',
    to:   '          mod: Math.floor((sc[k] - 10) / 2),',
    want: { pages: true, pagesBX: true },
    evaluable: ['0s13', '2a', '2b', '2c', '2d'], allowRed: ['0s13'],
    why: '⭐ シートが修正値を Math.floor((s-10)/2) で自前計算する。'
       + ' 見た目は同じ数字になるので (2a) は緑のまま — 赤くなるのは ?ability5e=0 を'
       + ' 当てた (2b) だけ。「撤退スイッチが効かなくなる」を機械証明する。'
       + ' ⭐ ソース文字列を見る (0s13) も同時に赤くなる (振る舞いと文字列の 2 経路)。',
  },
  blankrow: {
    impl: true, file: SHEET_JS, targets: ['2c'],
    /* ⚠⚠ #36 で renderV1 / renderV2 の 2 箇所に `LAST_AVAIL = avail;` が並んだため、
       アンカーを **renderV2 にしか無い 1 行** へ張り直した (2 ヒットすると exit 3 で即死する)。
       ⭐ 既に DOM に居る区画は飛ばす = 宣言済みの空欄枠 (Persona) を二重に置かない。
          「取れなかった区画を空文字で描く」だけを純粋に再現する。 */
    from: '    if (placed) host.appendChild(cols);',
    to:   '    if (placed) host.appendChild(cols);\n'
        + '    for (var _bz = 0; _bz < SECTION_IDS.length; _bz++) { if (!avail[SECTION_IDS[_bz]] && !host.querySelector("#" + SECTION_IDS[_bz])) host.appendChild(sectionEl(defOf(SECTION_IDS[_bz]), document.createElement("div"))); }',
    want: { pages: true }, evaluable: ['2a', '2c', '2d'], allowRed: ['2d'],
    why: '⭐⭐ 取れない区画を「行ごと消す」でなく空文字で描く。'
       + ' 画面はどちらも同じに見えるので、__state() の avail と inDom を'
       + ' **別々に**返していないと原理的に検出できない (依頼書 §2-4)。'
       + ' ⭐ hidden 配列だけを見ると inDom から作った値を inDom と比べる自己参照になり永久緑。',
  },
  fixedbtn: {
    impl: true, file: SHEET_JS, targets: ['1b'],
    from: '  function pickHost() {',
    to:   '  function pickHost() { return { host: document.body, fixed: true, via: "body" };',
    want: { pages: true }, evaluable: ['1a', '1b', '1c'], allowRed: [],
    why: '⭐ 依頼書 §2-1 の再現。#partyPanel / #townHud を無視して常に position:fixed で'
       + ' 注入する。index.html は上下左右すべて既存 HUD が占有しているので必ず衝突する。',
  },
  closedread: {
    impl: true, file: null, driverSide: true, targets: ['0c'],
    probeOpts: { skipOpen: true },
    want: { pages: true }, evaluable: ['0c', '1c'], allowRed: ['1c'],
    why: '⭐⭐⭐ 装置側の変異: シートを **開かずに** 中身を採る。'
       + ' (0c) が無いと「閉じたままの空 DOM を測って全部緑」になることを機械証明する。'
       + ' ⚠ ファイル置換ではなく、probeRealPage の opts.skipOpen で押下ごと省く経路を通す。',
  },

  /* ══ #36 で足す 8 本。⭐ 項目 1 では **全部 impl:false = 宣言のみ**。実装は項目 4 の担当。
     ⚠⚠⚠ 実装するときは **1 本ずつ単体で回して** evaluable / allowRed を実測から決める
       (#29 で 7 本中 5 本が担当外を巻き込み、#34 で「全部同時だと互いを覆い隠す」を踏んだ)。 */
  savesfrom5e: {
    impl: false, file: SHEET_JS, targets: ['8b'],
    why: '⭐⭐⭐ 依頼書 #36 §2-2 罠 A の再現。セーヴを playerStats (戦闘系) ではなく'
       + ' DFAbilities.abilityMod() から出す。画面の数字が「実際に振られている値」と割れる。',
  },
  blankdata: {
    impl: false, file: SHEET_JS, targets: ['6c'],
    why: '⭐⭐⭐ 依頼書 #36 §2-4 罠 C の再現。能力値の区画から data-ability を落として'
       + ' data-blank に置き換える = 実データのある区画を空欄枠にすり替える。',
  },
  blankundeclared: {
    impl: false, file: SHEET_JS, targets: ['6a'],
    why: 'ホワイトリストに無い空欄セル (data-blank="foo") を 1 つ足す。'
       + ' 宣言と実物がズレていることを機械証明する。',
  },
  headmix: {
    impl: false, file: INDEX_HTML, targets: ['8c'],
    why: '⭐ 依頼書 #36 §2-7 の罠。供給口の新フィールドだけ heroIsHead の分岐を通さず'
       + ' playerStats を直読みする = 「HP は主人公 / セーヴは頭の NPC」の混ざった紙が出る。',
  },
  emptycol: {
    impl: false, file: SHEET_JS, targets: ['7b'],
    why: '中身が 0 の段も常に描く。title/town/world では B 段が丸ごと空なので、'
       + ' 置くと右に幅ぶんの余白が出る (見た目だけの欠陥は DOM の件数でしか捕まらない)。',
  },
  abilrow: {
    impl: false, file: SHEET_JS, targets: ['7c'],
    why: '能力値ボックスを横並びに戻す。5E シートの顔は「縦 1 列に積まれた 6 個」なので、'
       + ' 数字が全部合っていても体裁としては失敗している。',
  },
  retreatkeep: {
    impl: false, file: SHEET_JS, targets: ['8a'],
    why: '?sheet5e=0 でも 11 区画のまま = 撤退スイッチが効かない。'
       + ' ⭐ 撤退路は「付ければ #29 の姿へ戻る」ことまで含めて機械証明する。',
  },
  initfrom5e: {
    impl: false, file: SHEET_JS, targets: ['8d'],
    why: '先制を DFAbilities.abilityMod(DEX スコア) から出す。罠 A と同根で、'
       + ' index.html:19774 の u.initiative = d20() + u.dex とは別系統の数字になる。',
  },
};
const MUT_ORDER = ['wipeorder', 'fixedsave', 'nocha', 'ownmod', 'blankrow', 'fixedbtn', 'closedread',
  'savesfrom5e', 'blankdata', 'blankundeclared', 'headmix', 'emptycol', 'abilrow', 'retreatkeep', 'initfrom5e'];
const MUT_IMPL  = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_TODO  = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING / 項目 4 の担当)');
  process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// 配信バイトの凍結 (別窓が同じリポを触っても測定が汚れないように)
// ══════════════════════════════════════════════════════════════════════════════
const SNAP = new Map();
function frozen(rel) {
  if (SNAP.has(rel)) return SNAP.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAP.set(rel, buf);
  return buf;
}
for (const rel of [SHEET_JS, ABILITIES_JS, HERO_JS, SKILL_JS].concat(PAGES)) frozen(rel);

const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  if (m.driverSide) continue;                     // 装置側の変異はファイル置換を持たない
  const body = frozen(m.file);
  if (body === null) { console.error('[drv] ⛔ 変異 ' + k + ' の対象 ' + m.file + ' が読めない'); process.exit(3); }
  const src = body.toString('utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換**前**文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
  }
  const n = src.split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: src.split(m.from).join(m.to) };
}
const PORT_OF = {};
MUT_IMPL.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
/** 変異ポートで実際に配信されるソース (変異対象でなければ凍結バイト) */
function servedSrc(mutKey, rel) {
  if (mutKey && MUT_SRC[mutKey] && MUT_SRC[mutKey].file === rel) return MUT_SRC[mutKey].body;
  const b = frozen(rel);
  return b === null ? '' : b.toString('utf8');
}

// ══════════════════════════════════════════════════════════════════════════════
// ソースからの抽出 (ブラウザを通さない 2 経路目)
// ══════════════════════════════════════════════════════════════════════════════
/** `XP_THRESHOLDS = [0, 1000, ...]` を数値配列で採る。無ければ null。 */
function parseXpThresholds(src) {
  if (!src) return null;
  const m = src.match(/XP_THRESHOLDS\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  const nums = m[1].split(',').map(s => s.trim()).filter(s => s.length).map(s => parseInt(s, 10));
  return nums.some(n => !isFinite(n)) ? null : nums;
}
/** 素朴なコメント除去。⭐ 「自前で式を書いていない」を**コメントを勘定に入れずに**見るため。 */
function stripComments(src) {
  if (!src) return '';
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.split('\n').map(line => {
    const t = line.replace(/^\s+/, '');
    if (t.startsWith('//') || t.startsWith('*')) return '';
    return line;
  }).join('\n');
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
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると startServer の
 *   try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '') || 'index.html';
        if (rel === STUB_REL || rel === STUB_HC_REL) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(rel === STUB_REL ? STUB_HTML : STUB_HC_HTML); return;
        }
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const buf = frozen(rel);
        if (buf === null) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

// ══════════════════════════════════════════════════════════════════════════════
// 測定 — スタブページで共有モジュール単体の契約を採る
// ══════════════════════════════════════════════════════════════════════════════
async function openPage(browser, url, seed) {
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  /* ⚠ localStorage は origin が決まってからでないと触れない。
     evaluateOnNewDocument は「ページのスクリプトより前・origin 確定後」に走るので、
     モジュールが読む前に種を仕込める (goto 後に setItem しても手遅れ)。 */
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s) for (const k in s) if (s[k] !== null && s[k] !== undefined) localStorage.setItem(k, s[k]);
    } catch (e) { /* private mode 等 */ }
  }, seed || null);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await sleep(120);
  return { page, errs };
}

/** モジュール単体の契約を 1 ページで全部採る。 */
async function probeModule(browser, base, query) {
  const o = { errs: [], has: false };
  const r = await openPage(browser, base + '/' + STUB_REL + (query || ''), null);
  o.errs = r.errs;
  const d = await r.page.evaluate(() => {
    const out = { has: false };
    const S = window.DFSheet;
    out.has = !!S;
    out.hasBtn = !!document.getElementById('dfSheetBtn');
    out.hasOverlay = !!document.getElementById('dfSheetOverlay');
    if (!S) return out;
    out.api = ['LANGUAGES', 'CLASS_LANGUAGES', 'open', 'close', 'isOpen', 'render',
      'languagesOf', '__state'].filter(k => S[k] === undefined);
    out.languages   = JSON.parse(JSON.stringify(S.LANGUAGES || []));
    out.classLang   = JSON.parse(JSON.stringify(S.CLASS_LANGUAGES || {}));
    out.classLabels = JSON.parse(JSON.stringify(S.CLASS_LABELS || {}));
    out.sectionIds  = (S.SECTION_IDS || []).slice();
    /* ★#36: 段組の割り付けと空欄枠のホワイトリスト。
       ⭐ (0s14)(0s15) の母集団。これが無いと §6 の assert が全部空振りで永久緑になる。 */
    out.sectionCols   = JSON.parse(JSON.stringify(S.SECTION_COLS || {}));
    out.blankSecIds   = (S.BLANK_SECTION_IDS || []).slice();
    out.blankFieldIds = (S.BLANK_FIELD_IDS || []).slice();
    out.sheet5e       = S.SHEET5E;
    out.xp          = (S.XP_THRESHOLDS || []).slice();
    out.langKey     = S.LANG_KEY;

    const setLang = (v) => {
      try { if (v === null) localStorage.removeItem(S.LANG_KEY); else localStorage.setItem(S.LANG_KEY, v); }
      catch (e) { /* noop */ }
    };
    const call = (k) => { try { return S.languagesOf(k); } catch (e) { return 'THROW: ' + e.message; } };
    const forAll = () => {
      const m = {};
      for (const k of Object.keys(out.classLang)) m[k] = call(k);
      return m;
    };

    // (契約 1) キー無し → 固定分だけ
    setLang(null);                        out.cNoKey = forAll();
    // (契約 2) 壊れた JSON → 固定分だけ・例外なし
    setLang('{ not json at all');         out.cBroken = forAll();
    // (契約 3) 配列でない JSON → 固定分だけ
    setLang('"just a string"');           out.cNotArray = forAll();
    // (契約 4) 未知の言語 id → 捨てる
    setLang(JSON.stringify(['klingon'])); out.cUnknownId = call('warrior');
    // (契約 5) 選択分がマージされる
    setLang(JSON.stringify(['dwarvish', 'goblin'])); out.cMerge = call('warrior');
    // (契約 6) 固定分と重複する選択を入れても重複しない
    setLang(JSON.stringify(['common', 'dwarvish', 'dwarvish'])); out.cDup = call('dwarf');
    // (契約 7) 未知 classKey / null / undefined → warrior へ落ちる・例外なし
    setLang(null);
    out.cUnknownClass = { paladin: call('paladin'), nul: call(null), undef: call(undefined) };
    out.cWarrior = call('warrior');

    // (契約 8) ⛔ languagesOf / open / render が localStorage へ 1 バイトも書かない
    try { localStorage.clear(); } catch (e) {}
    const before = [];
    try { for (let i = 0; i < localStorage.length; i++) before.push(localStorage.key(i)); } catch (e) {}
    S.languagesOf('dwarf'); S.open(); S.render(); S.close();
    const after = [];
    try { for (let i = 0; i < localStorage.length; i++) after.push(localStorage.key(i)); } catch (e) {}
    out.writeBefore = before.slice().sort();
    out.writeAfter  = after.slice().sort();
    out.langKeyAfterOpen = (function () { try { return localStorage.getItem(S.LANG_KEY); } catch (e) { return null; } })();

    // (契約 9) 開閉が効く + __state() の形
    out.openBefore = S.isOpen();
    out.openRet    = S.open();
    out.openAfter  = S.isOpen();
    out.state      = JSON.parse(JSON.stringify(S.__state()));
    S.close();
    out.closedAfter = S.isOpen();
    return out;
  });
  await r.page.close();
  return Object.assign(o, d);
}

/** HERO_CLASSES 同載スタブ — 職業表示名の 2 経路照合だけに使う。 */
async function probeLabels(browser, base) {
  const o = { ok: false, mismatch: [], n: 0, errs: [] };
  const r = await openPage(browser, base + '/' + STUB_HC_REL, null);
  o.errs = r.errs;
  const d = await r.page.evaluate(() => {
    const S = window.DFSheet, HC = window.HERO_CLASSES;
    if (!S || !HC) return { ok: false, why: 'DFSheet=' + !!S + ' HERO_CLASSES=' + !!HC };
    const bad = [];
    for (const c of HC) {
      const own = (S.CLASS_LABELS || {})[c.classKey];
      if (own !== c.name) bad.push(c.classKey + ' 自前"' + own + '" vs HERO_CLASSES"' + c.name + '"');
    }
    return { ok: bad.length === 0, mismatch: bad, n: HC.length };
  });
  await r.page.close();
  return Object.assign(o, d);
}

/**
 * (5b) 言語キーが無いセーブ (= title.html?sheet=0 で作ったキャラ) でシートを開く。
 *   ⭐ 固定分だけが出て、例外を投げないこと。
 */
async function probeNoLangKey(browser, base) {
  const o = { errs: [] };
  const r = await openPage(browser, base + '/' + STUB_REL, {
    'dragonfighters.partyComposition': JSON.stringify(['dwarf']),
    'dragonfighters.xp': '3000',
    /* ⭐ dragonfighters.languages は **あえて入れない** = ?sheet=0 で作ったキャラの再現 */
  });
  o.errs = r.errs;
  const d = await r.page.evaluate(() => {
    const S = window.DFSheet;
    if (!S) return { has: false };
    const out = { has: true };
    out.hadKey = (function () { try { return localStorage.getItem(S.LANG_KEY); } catch (e) { return null; } })();
    let threw = null;
    try { S.open(); } catch (e) { threw = e.message; }
    out.threw = threw;
    out.open = S.isOpen();
    out.classKey = S.heroClassKey();
    out.expect = S.languagesOf(out.classKey);
    const sec = document.getElementById('dfSheetSecLanguages');
    out.secPresent = !!sec;
    out.chips = sec ? Array.prototype.slice.call(sec.querySelectorAll('[data-lang]'))
      .map(el => ({ id: el.getAttribute('data-lang'), fixed: el.getAttribute('data-fixed') === '1',
                    text: (el.textContent || '').trim() })) : [];
    out.state = JSON.parse(JSON.stringify(S.__state()));
    S.close();
    return out;
  });
  await r.page.close();
  return Object.assign(o, d);
}

/** 撤退 ?sheet=0 — モジュールが丸ごと居なくなること。 */
async function probeRetreat(browser, base) {
  const o = { errs: [] };
  const r = await openPage(browser, base + '/' + STUB_REL + '?sheet=0', null);
  o.errs = r.errs;
  const d = await r.page.evaluate(() => ({
    hasDFSheet: typeof window.DFSheet !== 'undefined',
    btn: !!document.getElementById('dfSheetBtn'),
    overlay: !!document.getElementById('dfSheetOverlay'),
    style: !!document.getElementById('dfSheetStyle'),
  }));
  await r.page.close();
  return Object.assign(o, d);
}


/* ══════════════════════════════════════════════════════════════════════════════
 * 実ページの測定 (dev-loop 項目 2 で追加) — スタブではなく **本番の 5 枚**を開く
 * ⭐ スタブ (__sheet_probe.html) はデータ層の契約、ここは **結線** の担保。
 *   両方要る: 5 枚に <script src> を書き忘れても、スタブ側は緑のままだから。
 * ══════════════════════════════════════════════════════════════════════════════ */
const PAGE_MATRIX = [
  { label: 'index',  file: 'index.html',  w: 1280, h: 900, mobile: false },
  { label: 'tavern', file: 'tavern.html', w: 1280, h: 900, mobile: false },
  { label: 'town',   file: 'town.html',   w: 1280, h: 900, mobile: false },
  { label: 'world',  file: 'world.html',  w: 1280, h: 900, mobile: false },
  { label: 'title',  file: 'title.html',  w: 1280, h: 900, mobile: false },
];
/* ⭐ 町だけ 2 点で測る。呼び出し口が **画面幅で切り替わる**唯一のページだから
 *   (compact = #townHud の子 / デスクトップ = #townHud が display:none なので body へ fixed)。
 *   ⚠ 390x844 は verify_town_map の compact390 と同じ点。 */
const TOWN_COMPACT = { label: 'town(compact390)', file: 'town.html', w: 390, h: 844, mobile: true };

/* 種。⭐ dwarf を選ぶ理由 = 5e と B/X で修正値が **2 マス割れる** (str 14 → +2/+1, con 15 → +2/+1)。
 *   全マス同値の職を種にすると (2b) の ?ability5e=0 側が空振りする (数字が動かないので
 *   自前計算していても気づけない)。⚠ この「割れる」ことは (2b) の中で母集団ガードとして数える。
 * ⚠⚠ prologueSeen を立てないと tavern の前口上オーバーレイ (#prologueOverlay) が
 *   #dfSheetBtn を丸ごと覆い、(1a) が「覆われている」で赤くなる (2026-08-29 実測)。
 *   これは演出であって欠陥ではない (他ドライバも同じ種を使っている)。 */
const PAGE_SEED = {
  'dragonfighters.partyComposition': JSON.stringify(['dwarf']),
  'dragonfighters.xp': '6000',
  'dragonfighters.prologueSeen': '1',
  'dragonfighters.languages': JSON.stringify(['goblin']),
};
const HUD_IDS = ['settingsBtn', 'partyToggleBtn', 'combatLog'];
/* ★#36 (8b)(8c) の種。⭐ 主人公の職を localStorage (シートが読む) と sessionStorage
 *   (index.html の編成が読む) の **両方** へ撒いて、紙と本番の中身を同じ人物に揃える。
 *   warrior は前衛なので隊列の頭 = 主人公 / mage は後衛なので頭は NPC になる。 */
const heroSeed = (cls) => ({
  ls: Object.assign({}, PAGE_SEED, { 'dragonfighters.partyComposition': JSON.stringify([cls]) }),
  ss: { 'dragonfighters.partyComposition': JSON.stringify([cls]) },
});
const PAGE_SETTLE = 1500;   // index/town は JS が HUD を後から組む。⚠ 縮めると mountVia が body へ化ける

/** 本番ページを 1 枚、開く前 → 押す → 開いている間 → 閉じた後 の 4 相で測る。 */
async function probeRealPage(browser, base, spec, query, opts) {
  const o = { label: spec.label, file: spec.file, w: spec.w, h: spec.h, errs: [], status: 0, has: false };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: spec.w, height: spec.h, deviceScaleFactor: 1,
    isMobile: !!spec.mobile, hasTouch: !!spec.mobile });
  /* ★#36 (8b)(8c): index.html の編成は **sessionStorage** の partyMembers / partyComposition が
     決めている (localStorage ではない)。頭が主人公か NPC かを作り分けるため、両方を種にできる。
     ⚠ 既定は今までどおり localStorage だけ = 既存の測定は 1 バイトも変わらない。 */
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.ls) for (const k in s.ls) localStorage.setItem(k, s.ls[k]);
      if (s.ss) { sessionStorage.clear(); for (const k in s.ss) sessionStorage.setItem(k, s.ss[k]); }
    } catch (e) { /* private mode 等 */ }
  }, { ls: (opts && opts.ls) || PAGE_SEED, ss: (opts && opts.ss) || null });
  let resp = null;
  try { resp = await page.goto(base + '/' + spec.file + (query || ''), { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { o.errs.push('goto: ' + ((e && e.message) || e)); }
  o.status = resp ? resp.status() : 0;
  await sleep(PAGE_SETTLE);

  // ── 相 1: 押す前 (⭐ elementFromPoint はここで採る。開いた後はオーバーレイが覆う) ──
  const pre = await page.evaluate((HUD) => {
    const S = window.DFSheet;
    const out = { has: !!S, btn: false, overlay: !!document.getElementById('dfSheetOverlay') };
    const btn = document.getElementById('dfSheetBtn');
    out.btn = !!btn;
    if (btn) {
      const b = btn.getBoundingClientRect();
      out.rect = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
      out.cx = Math.round(b.left + b.width / 2);
      out.cy = Math.round(b.top + b.height / 2);
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      out.inViewport = b.width >= 8 && b.height >= 8 && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh;
      const hit = document.elementFromPoint(out.cx, out.cy);
      out.covered = !(hit && (hit === btn || btn.contains(hit)));
      out.hitDesc = hit ? (hit.id ? '#' + hit.id : (hit.tagName + (hit.className ? '.' + String(hit.className).split(' ')[0] : ''))) : '(none)';
      const pp = document.getElementById('partyPanel'), hud = document.getElementById('townHud');
      out.inPartyPanel = !!(pp && pp.contains(btn));
      out.inTownHud = !!(hud && hud.contains(btn));
      out.isFixed = getComputedStyle(btn).position === 'fixed';
      out.tag = btn.tagName;
      out.parentId = btn.parentNode ? (btn.parentNode.id || btn.parentNode.tagName) : null;
    }
    out.openBefore = S ? S.isOpen() : null;
    const R = {};
    for (const id of HUD) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      R[id] = [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100,
               Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
    }
    out.hudBefore = R;
    const ls = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) ls.push(k); } } catch (e) {}
    out.lsBefore = ls.sort();
    return out;
  }, HUD_IDS);
  Object.assign(o, pre);

  /* ── 相 2: **実際のマウスで押す** ──────────────────────────────────────
   *  ⛔ el.click() で済ませないこと。覆われていても通ってしまうので、
   *    「押せる」ではなく「イベントが繋がっている」しか測れなくなる。
   *  ⭐ 変異 closedread (項目 4) は、この押下ごと省く経路を通す。 */
  o.clicked = false;
  if (!(opts && opts.skipOpen) && o.btn && o.rect && o.rect.w > 0) {
    try { await page.mouse.click(o.cx, o.cy); o.clicked = true; }
    catch (e) { o.errs.push('click: ' + ((e && e.message) || e)); }
    await sleep(220);
  }

  // ── 相 3: 開いている間に中身を採る ──
  const post = await page.evaluate((HUD) => {
    const S = window.DFSheet;
    const out = { openAfter: S ? S.isOpen() : null };
    out.state = S ? JSON.parse(JSON.stringify(S.__state())) : null;
    const bodyEl = document.getElementById('dfSheetBody');
    out.bodyTextLen = bodyEl ? String(bodyEl.textContent || '').replace(/\s+/g, '').length : 0;
    /* ⭐ 区画の実在は **document 全体** で見る。#dfSheetBody の中だけ見ると
       「別の場所に空で置いた」が素通りする。 */
    out.secInDom = {};
    if (S) for (const id of S.SECTION_IDS) out.secInDom[id] = !!document.getElementById(id);

    const ck = S ? S.heroClassKey() : null;
    out.classKey = ck;

    // ── 能力値: DOM (経路 1)
    out.abilDom = Array.prototype.slice.call(document.querySelectorAll('[data-ability]')).map(el => ({
      key: el.getAttribute('data-ability'),
      score: parseInt(el.getAttribute('data-score'), 10),
      mod: parseInt(el.getAttribute('data-mod'), 10),
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim(),
    }));
    // ── 能力値: モジュールをブラウザで評価 (経路 2)。⛔ ドライバへ数値を写経しない
    const A = window.DFAbilities;
    out.hasAbilities = !!A;
    out.use5e = (A && A.use5e) ? A.use5e() : null;
    out.abilExpect = (A && ck && A.CLASS_ABILITIES && A.CLASS_ABILITIES[ck])
      ? (A.ABILITY_KEYS || []).map(k => ({
          key: k, score: A.CLASS_ABILITIES[ck][k],
          mod: A.abilityMod(A.CLASS_ABILITIES[ck][k]),
          mod5e: A.mod5e(A.CLASS_ABILITIES[ck][k]),
        }))
      : null;

    // ── 技能
    const SC = window.SkillCheck;
    out.hasSkillCheck = !!SC;
    out.skillDom = Array.prototype.slice.call(document.querySelectorAll('[data-skill]')).map(el => ({
      key: el.getAttribute('data-skill'),
      score: parseInt(el.getAttribute('data-score'), 10),
      prof: el.getAttribute('data-prof') === '1',
    }));
    out.skillExpect = null;
    if (SC && SC.CHECKS && typeof SC.checkScore === 'function' && ck && S) {
      const member = { classKey: ck, name: S.classLabel(ck) };
      const profs = (SC.CLASS_PROFICIENCIES && SC.CLASS_PROFICIENCIES[ck]) || [];
      out.skillExpect = Object.keys(SC.CHECKS).map(k => ({
        key: k, score: SC.checkScore(member, SC.CHECKS[k]),
        prof: profs.indexOf(SC.CHECKS[k].profKey) >= 0,
      }));
    }

    // ── 言語
    out.langDom = Array.prototype.slice.call(document.querySelectorAll('[data-lang]'))
      .map(el => ({ id: el.getAttribute('data-lang'), fixed: el.getAttribute('data-fixed') === '1' }));
    out.langExpect = (S && ck) ? S.languagesOf(ck) : null;

    // ── 見出し / 体
    const hd = document.getElementById('dfSheetSecHeader');
    out.headerText = hd ? String(hd.textContent || '').replace(/\s+/g, ' ').trim() : null;
    const bd = document.getElementById('dfSheetSecBody');
    out.bodyText = bd ? String(bd.textContent || '').replace(/\s+/g, ' ').trim() : null;
    out.xpSeed = (function () { try { return parseInt(localStorage.getItem('dragonfighters.xp') || '0', 10); } catch (e) { return 0; } })();
    out.levelExpect = S ? S.levelFromXp(out.xpSeed) : null;

    /* ══ ★#36 ここから ═══════════════════════════════════════════════════
       ⭐ 「何を描いたか」(DOM) と「どこから取ったか」(供給口 / 本番の実体) を **別々に** 採る。
       ⛔ ドライバに数式を写経しない — 実装と同じ間違いを共有すると両方緑になる。 */
    out.blankIdsDecl = S ? (S.BLANK_FIELD_IDS || []).slice() : [];
    out.blankSecDecl = S ? (S.BLANK_SECTION_IDS || []).slice() : [];
    out.sheet5e = S ? S.SHEET5E : null;
    out.blankDom = Array.prototype.slice.call(document.querySelectorAll('[data-blank]')).map(el => ({
      id: el.getAttribute('data-blank'),
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim(),
    }));
    out.saveDom = Array.prototype.slice.call(document.querySelectorAll('[data-save]')).map(el => ({
      key: el.getAttribute('data-save'),
      mod: parseInt(el.getAttribute('data-mod'), 10),
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim(),
    }));
    out.statDom = {};
    for (const el of document.querySelectorAll('[data-stat]')) {
      const k = el.getAttribute('data-stat');
      const vEl = el.querySelector('.v') || el.querySelector('.rv');
      out.statDom[k] = { v: vEl ? String(vEl.textContent || '').trim() : '',
                         text: String(el.textContent || '').replace(/\s+/g, ' ').trim() };
    }
    out.colsInDom = Array.prototype.slice.call(document.querySelectorAll('.dfSheetCol'))
      .map(e => e.getAttribute('data-col'));
    /* 経路 2: 供給口を **そのまま** 呼んだ生値 */
    out.body = (S && typeof S.__body === 'function')
      ? (function () { try { return JSON.parse(JSON.stringify(S.__body())); } catch (e) { return null; } })() : null;
    /* 経路 2: 受動知覚 / 習熟ボーナスを SkillCheck から直接 */
    out.passiveExpect = null; out.profBonusExpect = null;
    if (SC && SC.CHECKS && SC.CHECKS.perception && typeof SC.checkScore === 'function' && ck && S) {
      try { out.passiveExpect = 10 + SC.checkScore({ classKey: ck, name: S.classLabel(ck) }, SC.CHECKS.perception); }
      catch (e) { out.passiveExpect = null; }
      out.profBonusExpect = (typeof SC.PROFICIENCY_BONUS === 'number') ? SC.PROFICIENCY_BONUS : null;
    }
    /* 経路 2: 「誰が頭か」「主人公の実体はどれか」を **本番の検証シーム** から。
       ⭐ window.__heroMark / window.__plaza は index.html が常時生やしている読み取り窓。
       ⛔ ここでシートの供給口を見ない (見ると自己参照になり headmix が検出できない)。 */
    out.heroIsHead = (window.__heroMark && typeof window.__heroMark.heroIsHead === 'function')
      ? window.__heroMark.heroIsHead() : null;
    out.heroAlly = null; out.headAc = null; out.headAtk = null;
    if (window.__plaza) {
      try {
        const a = (typeof window.__plaza.allies === 'function')
          ? window.__plaza.allies().find(x => x && x.isHero) : null;
        if (a) out.heroAlly = { classKey: a.classKey, ac: a.ac, str: a.str, dex: a.dex, con: a.con,
          int: a.int, wis: a.wis, atkBonus: a.atkBonus, dmgDice: a.dmgDice, dmgBonus: a.dmgBonus,
          weaponName: (a.def && a.def.weaponName) || null };
      } catch (e) { out.heroAlly = null; }
      try { out.headAc = (typeof window.__plaza.pAc === 'function') ? window.__plaza.pAc() : null; } catch (e) {}
      try { out.headAtk = (typeof window.__plaza.pAtk === 'function') ? window.__plaza.pAtk() : null; } catch (e) {}
    }

    const R = {};
    for (const id of HUD) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      R[id] = [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100,
               Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
    }
    out.hudOpen = R;
    return out;
  }, HUD_IDS);
  Object.assign(o, post);
  try { Object.assign(o, await page.evaluate(LAYOUT_JS)); } catch (e) { o.errs.push('layout: ' + ((e && e.message) || e)); }

  // ── 相 4: Esc で閉じる (⭐ 本番の閉じ口をそのまま通す) ──
  try { await page.keyboard.press('Escape'); } catch (e) { /* noop */ }
  await sleep(160);
  const fin = await page.evaluate((HUD) => {
    const S = window.DFSheet;
    const out = { openAfterClose: S ? S.isOpen() : null };
    const R = {};
    for (const id of HUD) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      R[id] = [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100,
               Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
    }
    out.hudClosed = R;
    const ls = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) ls.push(k); } } catch (e) {}
    out.lsAfter = ls.sort();
    return out;
  }, HUD_IDS);
  Object.assign(o, fin);

  await page.close();
  return o;
}

/* ★#36 §7: レイアウトの測り方を **1 箇所** に畳む (probeRealPage と probeWidths が共有)。
 * ⭐ 実効文字高は「祖先の transform scale を掛けた font-size」で見る (#15 と同じ罠)。
 * ⚠ 文字を実際に持つ要素だけを数える。空の罫線 <span> まで数えると最小値が意味を失う。 */
const LAYOUT_JS = `(() => {
  const out = { paper: null, gridTracks: 0, abilRects: [] };
  const paper = document.getElementById('dfSheetPaper');
  if (paper) {
    let mn = Infinity;
    for (const el of paper.querySelectorAll('*')) {
      let hasText = false;
      for (const n of el.childNodes) if (n.nodeType === 3 && String(n.nodeValue).trim()) hasText = true;
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const fs = parseFloat(cs.fontSize) || 0;
      let sc = 1, p = el;
      while (p && p !== document.documentElement) {
        const t = getComputedStyle(p).transform;
        /* ⚠⚠ ここはテンプレートリテラルの中なので、正規表現の \( や \s は
           **テンプレートリテラルのエスケープに食われて消える** (2026-08-29 に実測)。
           -> 正規表現を使わず indexOf / slice で採る。 */
        if (t && t !== 'none') {
          const i0 = t.indexOf('('), i1 = t.indexOf(',');
          if (i0 > 0 && i1 > i0) { const av = parseFloat(t.slice(i0 + 1, i1)); if (av) sc *= Math.abs(av); }
        }
        p = p.parentElement;
      }
      if (fs * sc < mn) mn = fs * sc;
    }
    out.paper = { scrollW: paper.scrollWidth, clientW: paper.clientWidth,
                  minFont: isFinite(mn) ? Math.round(mn * 100) / 100 : null };
    const colsEl = paper.querySelector('.dfSheetCols');
    if (colsEl) {
      const g = String(getComputedStyle(colsEl).gridTemplateColumns || '').trim();
      out.gridTracks = (g && g !== 'none') ? g.split(' ').filter(Boolean).length : 0;
    }
  }
  out.abilRects = Array.prototype.slice.call(document.querySelectorAll('.dfSheetAbilBox')).map(el => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left * 100) / 100, top: Math.round(r.top * 100) / 100 };
  });
  return out;
})()`;

/**
 * ★#36 §7: **1 ページロードのまま** 幅を 1200 -> 760 -> 390 と変えて三段組の畳まれ方を測る。
 * ⭐ 開くのは DFSheet.open()。ボタンで開けることは §1 が別に担保しているので、ここは
 *   **レイアウトだけ** を見る (390px では #partyPanel が畳まれてボタンの座標が変わるため)。
 */
async function probeWidths(browser, base, file) {
  const o = { file: file, errs: [], marks: [] };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.clear(); if (s) for (const k in s) localStorage.setItem(k, s[k]); } catch (e) {}
  }, PAGE_SEED);
  try { await page.goto(base + '/' + file, { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { o.errs.push('goto: ' + ((e && e.message) || e)); }
  await sleep(PAGE_SETTLE);
  for (const w of [1200, 760, 390]) {
    await page.setViewport({ width: w, height: (w === 390 ? 844 : 900), deviceScaleFactor: 1,
      isMobile: w === 390, hasTouch: w === 390 });
    await sleep(280);
    let mk = { open: false };
    try {
      mk = await page.evaluate(() => {
        const S = window.DFSheet;
        if (!S) return { open: false };
        S.open();
        return { open: S.isOpen() };
      });
      Object.assign(mk, await page.evaluate(LAYOUT_JS));
    } catch (e) { o.errs.push('w' + w + ': ' + ((e && e.message) || e)); }
    o.marks.push(Object.assign({ w: w }, mk));
  }
  await page.close();
  return o;
}

/** ?sheet=0 — 本番 5 枚で「丸ごと居なくなる」ことだけを見る軽い測定。 */
async function probeRetreatPage(browser, base, spec) {
  const o = { label: spec.label, errs: [], status: 0 };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: spec.w, height: spec.h, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.clear(); if (s) for (const k in s) localStorage.setItem(k, s[k]); } catch (e) {}
  }, PAGE_SEED);
  let resp = null;
  try { resp = await page.goto(base + '/' + spec.file + '?sheet=0', { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { o.errs.push('goto: ' + ((e && e.message) || e)); }
  o.status = resp ? resp.status() : 0;
  await sleep(600);
  const d = await page.evaluate(() => ({
    hasDFSheet: typeof window.DFSheet !== 'undefined',
    btn: !!document.getElementById('dfSheetBtn'),
    overlay: !!document.getElementById('dfSheetOverlay'),
    style: !!document.getElementById('dfSheetStyle'),
  }));
  await page.close();
  return Object.assign(o, d);
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §3 言語 — title.html の「汝は何者か」で言の葉を選ぶ (dev-loop 項目 3 で追加)
 * ⭐ ここだけは **本番の名乗りフローを実マウスで踏む**。
 *   モジュール単体 (スタブ) では「選ばせる UI」も「出発時の保存」も原理的に測れない。
 * ⚠⚠ 属性名は data-pick-lang / data-fixed-lang。
 *   ⛔ data-lang / data-fixed は **シートのチップ**が名乗っており、probeRealPage が
 *     document 全体から拾っている。名乗り画面で同じ名前を使うと (3d) の母集団が汚れる。
 * ══════════════════════════════════════════════════════════════════════════════ */

/** 名乗り画面の今の姿を丸ごと採る。⭐ 読み取りは 1 箇所に畳む (経路が増えると食い違う)。 */
const READ_LANG = function () {
  const S = window.DFSheet;
  const sec = document.getElementById('langPick');
  const dep = document.getElementById('btnDepart');
  const chips = (root, attr) => root
    ? Array.prototype.slice.call(root.querySelectorAll('[' + attr + ']')).map(el => ({
        id: el.getAttribute(attr),
        on: el.getAttribute('aria-pressed') === 'true',
        text: String(el.textContent || '').trim(),
      }))
    : [];
  const out = {
    hasDFSheet: !!S,
    secInDom: !!sec,
    secHidden: sec ? !!sec.hidden : null,
    dataPicks: sec ? sec.getAttribute('data-picks') : null,
    fixed: chips(document.getElementById('langFixed'), 'data-fixed-lang'),
    choices: chips(document.getElementById('langChoices'), 'data-pick-lang'),
    departDisabled: dep ? !!dep.disabled : null,
    hint: (document.getElementById('langHint') || {}).textContent || '',
  };
  out.selected = out.choices.filter(c => c.on).map(c => c.id);
  return out;
};

/** title.html を開いて名乗り画面まで進める。⚠ 記録が残っていると 2 段タップになるので両方踏む。 */
async function openNaming(browser, base, query) {
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
  /* ⭐ 種は空。スロット 1 が「記録なし」= 1 タップで名乗りへ入れる。
     ⚠ PAGE_SEED を使うと 2 段タップ確認が挟まり、手順が測定ごとにブレる。
     ⚠⚠⚠ **title.html のときだけ**消すこと。evaluateOnNewDocument は
       この page が開く **すべての document** で走るので、無条件に clear() すると
       出発した先 (world.html) でも走り、出発フローが書いた languages を
       着いた瞬間に消してしまう。症状は「保存が 1 本も無い」= 罠 B と見分けが付かない
       (2026-08-29 に実測で踏んだ)。 */
  await page.evaluateOnNewDocument(() => {
    try { if (/title\.html$/.test(location.pathname)) localStorage.clear(); } catch (e) {}
  });
  const resp = await page.goto(base + '/title.html' + (query || ''), { waitUntil: 'load', timeout: 45000 });
  await sleep(400);
  await page.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]');
  await sleep(200);
  const needConfirm = await page.$('#slotList button[data-act="confirm-yes"]');
  if (needConfirm) { await page.click('#slotList button[data-act="confirm-yes"]'); await sleep(200); }
  await page.waitForFunction(() => {
    const e = document.getElementById('screenNaming');
    return !!e && e.classList.contains('active');
  }, { timeout: 15000 });
  return { page, errs, status: resp ? resp.status() : 0 };
}

/**
 * 6 職ぶんの言語選択を **1 ページロード**で回る ((3a)(3b)(3e))。
 * ⭐ 名乗り画面は職を選び直せるので、ロードし直す必要がない。
 *   = 職替えそのものが (3e) の手順になる。
 */
async function probeTitleLangPick(browser, base) {
  const o = { errs: [], classes: [], switchCase: null, retreat: null };
  const r = await openNaming(browser, base, '');
  const page = r.page; o.errs = r.errs; o.status = r.status;

  o.def = await page.evaluate(() => {
    const S = window.DFSheet;
    return S ? { classLang: JSON.parse(JSON.stringify(S.CLASS_LANGUAGES)),
                 langIds: (S.LANGUAGES || []).map(x => x.id) } : null;
  });
  const keys = o.def ? Object.keys(o.def.classLang) : [];

  for (const key of keys) {
    const def = o.def.classLang[key];
    const picks = def.picks;
    const rec = { key: key, picks: picks, fixedWant: def.fixed.slice(), steps: [] };
    await page.click('#classCards .classCard[data-class-key="' + key + '"]');
    await sleep(90);
    rec.afterClass = await page.evaluate(READ_LANG);

    const ids = rec.afterClass.choices.map(c => c.id);
    /* picks 個 選ぶ → もう 1 つ押しても増えない (上限) → 1 つ外すと戻る、まで踏む。
       ⭐ 「picks 個ぶんの選択チップ」= 個数の宣言ではなく **picks 個で打ち止め**という
         振る舞い。数を数えるだけだと「何個でも選べる」実装が素通りする。 */
    rec.picked = [];
    for (let i = 0; i < picks && i < ids.length; i++) {
      await page.click('#langChoices [data-pick-lang="' + ids[i] + '"]');
      await sleep(70);
      rec.picked.push(ids[i]);
      rec.steps.push(await page.evaluate(READ_LANG));
    }
    if (ids.length > picks) {
      await page.click('#langChoices [data-pick-lang="' + ids[picks] + '"]');
      await sleep(70);
      rec.overflow = await page.evaluate(READ_LANG);
      rec.overflowId = ids[picks];
    }
    if (ids.length) {
      await page.click('#langChoices [data-pick-lang="' + ids[0] + '"]');   // 外す
      await sleep(70);
      rec.afterDeselect = await page.evaluate(READ_LANG);
      await page.click('#langChoices [data-pick-lang="' + ids[0] + '"]');   // 戻す
      await sleep(70);
      rec.afterReselect = await page.evaluate(READ_LANG);
    }
    o.classes.push(rec);
  }

  /* ── (3e) の本命: 戦士で「ドワーフ語」を選んでから ドワーフ へ替える ──
   *  ⭐ dwarf の fixed は common + dwarvish。リセットしないと **固定分と重複**する。
   *  ⚠ 言語 id をここへ書き写しているが、これは「重複が起きる組み合わせ」を作るための
   *    入力であって期待値ではない。実在することは下の assert が classLang 側で確かめる。 */
  const CROSS_FROM = 'warrior', CROSS_TO = 'dwarf', CROSS_LANG = 'dwarvish';
  if (keys.indexOf(CROSS_FROM) >= 0 && keys.indexOf(CROSS_TO) >= 0) {
    await page.click('#classCards .classCard[data-class-key="' + CROSS_FROM + '"]');
    await sleep(90);
    await page.click('#langChoices [data-pick-lang="' + CROSS_LANG + '"]');
    await sleep(90);
    const before = await page.evaluate(READ_LANG);
    await page.click('#classCards .classCard[data-class-key="' + CROSS_TO + '"]');
    await sleep(120);
    const after = await page.evaluate(READ_LANG);
    o.switchCase = { from: CROSS_FROM, to: CROSS_TO, lang: CROSS_LANG, before: before, after: after };
  }
  await page.close();

  /* ── 撤退 ?sheet=0 の名乗り画面 ──────────────────────────────────────
   *  ⭐ 「言語 UI が出ない」だけでなく **「出発」が押せる (詰まない)** まで見る。
   *    UI を消しただけで disabled が解けていないと、撤退したのに新規が始められない。 */
  const rr = await openNaming(browser, base, '?sheet=0');
  await rr.page.click('#classCards .classCard[data-class-key="' + (keys[0] || 'warrior') + '"]');
  await sleep(120);
  o.retreat = await rr.page.evaluate(READ_LANG);
  o.retreat.errs = rr.errs;
  await rr.page.close();
  return o;
}

/**
 * 名乗り → 言の葉を選ぶ → 出発 → 行き先で localStorage とシートを読む ((3c)(3d)(4d))。
 * @param {string} classKey  選ぶ職
 * @param {boolean} retreat  true なら ?sheet=0 (言語 UI なし = 従来どおりの出発)
 */
async function probeTitleDepart(browser, base, classKey, retreat) {
  const o = { classKey: classKey, retreat: !!retreat, errs: [], picked: [], fixedWant: [] };
  const r = await openNaming(browser, base, retreat ? '?sheet=0' : '');
  const page = r.page; o.errs = r.errs;

  const def = await page.evaluate((k) => {
    const S = window.DFSheet;
    return S ? JSON.parse(JSON.stringify(S.CLASS_LANGUAGES[k])) : null;
  }, classKey);
  o.fixedWant = def ? def.fixed.slice() : [];
  o.picksWant = def ? def.picks : 0;

  await page.click('#classCards .classCard[data-class-key="' + classKey + '"]');
  await sleep(120);
  const snap = await page.evaluate(READ_LANG);
  o.beforeDepart = snap;
  if (!retreat) {
    const ids = snap.choices.map(c => c.id);
    for (let i = 0; i < (def ? def.picks : 0) && i < ids.length; i++) {
      await page.click('#langChoices [data-pick-lang="' + ids[i] + '"]');
      await sleep(70);
      o.picked.push(ids[i]);
    }
  }
  o.readyDisabled = await page.evaluate(() => {
    const d = document.getElementById('btnDepart'); return d ? !!d.disabled : null;
  });

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }),
      page.click('#btnDepart'),
    ]);
  } catch (e) { o.errs.push('depart: ' + ((e && e.message) || e)); }
  await sleep(900);
  o.dest = await page.evaluate(() => location.pathname + location.search);

  /* 行き先 (既定 world.html) は同一オリジンなので localStorage をそのまま読める。
     ⭐ シートもそこで開く = (3d) は「保存した言語が本当にシートへ出る」を測る。 */
  const d = await page.evaluate(() => {
    const out = Object.assign({}, (function () {
      const keys = [];
      let langs = null, party = null;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('dragonfighters.') === 0) keys.push(k);
        }
        langs = localStorage.getItem('dragonfighters.languages');
        party = localStorage.getItem('dragonfighters.partyComposition');
      } catch (e) { /* noop */ }
      return { keys: keys.sort(), langsRaw: langs, partyRaw: party };
    })());
    const S = window.DFSheet;
    out.hasDFSheet = !!S;
    if (S) {
      let threw = null;
      try { S.open(); } catch (e) { threw = e.message; }
      out.threw = threw;
      out.open = S.isOpen();
      out.sheetClassKey = S.heroClassKey();
      out.expect = S.languagesOf(out.sheetClassKey);
      const sec = document.getElementById('dfSheetSecLanguages');
      out.secPresent = !!sec;
      out.chips = sec ? Array.prototype.slice.call(sec.querySelectorAll('[data-lang]'))
        .map(el => ({ id: el.getAttribute('data-lang'), fixed: el.getAttribute('data-fixed') === '1' })) : [];
      S.close();
    }
    return out;
  });
  await page.close();
  return Object.assign(o, d);
}

// ══════════════════════════════════════════════════════════════════════════════
// assert 一覧 (id / 見出し / 述語)。述語は測定結果 M だけを見る純関数。
// ══════════════════════════════════════════════════════════════════════════════
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameSet = (a, b) => deepEq((a || []).slice().sort(), (b || []).slice().sort());

const ASSERTS = [
  // ── §0 装置 (この項目で測れる分) ───────────────────────────────────────
  ['0s1', 'スタブページで window.DFSheet が生えている (公開 API が欠けていない)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ DFSheet が無い — 以降が undefined 比較で空振りし、永久緑になる'];
    return [(m.api || []).length === 0,
      (m.api || []).length ? '⛔ 欠けている API: ' + m.api.join(',')
        : 'open/close/isOpen/render/languagesOf/__state 有り'];
  }],
  ['0s2', 'スタブページで pageerror ゼロ (モジュール単体が例外を投げない)', (M) => {
    const e = (M.mod && M.mod.errs) || [];
    return [e.length === 0, e.length ? '⛔ ' + e.slice(0, 3).join(' | ') : '0 件'];
  }],
  ['0d', '言語マスタが 14 件 / CLASS_LANGUAGES が 6 職 (rogue だけ picks 2)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const L = m.languages || [], C = m.classLang || {};
    const ids = L.map(x => x.id);
    const uniq = new Set(ids).size === ids.length;
    const std = L.filter(x => x.tier === 'standard').length;
    const exo = L.filter(x => x.tier === 'exotic').length;
    const cls = Object.keys(C);
    const picks2 = cls.filter(k => C[k].picks === 2);
    const picks1 = cls.filter(k => C[k].picks === 1);
    const ok = L.length === 14 && uniq && std === 8 && exo === 6
      && cls.length === 6 && picks2.length === 1 && picks2[0] === 'rogue' && picks1.length === 5;
    return [ok, L.length + ' 言語 (標準 ' + std + ' / 異種 ' + exo + ', id 重複 ' + (uniq ? '無' : '⛔有') + ')'
      + '  ' + cls.length + ' 職  picks2=' + (picks2.join(',') || '(無し)')
      + (ok ? '' : '  ⛔ 期待 14 件 (8/6) / 6 職 / picks2 = rogue のみ')];
  }],
  ['0s3', '各職の fixed が LANGUAGES に実在し、全職が common を含む', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const ids = new Set((m.languages || []).map(x => x.id));
    const bad = [], noCommon = [];
    for (const k of Object.keys(m.classLang || {})) {
      const f = m.classLang[k].fixed || [];
      for (const id of f) if (!ids.has(id)) bad.push(k + '.' + id);
      if (f.indexOf('common') < 0) noCommon.push(k);
    }
    return [bad.length === 0 && noCommon.length === 0,
      (bad.length ? '⛔ マスタに無い id: ' + bad.join(',') + '  ' : '')
      + (noCommon.length ? '⛔ common を持たない職: ' + noCommon.join(',')
        : '6 職とも common 有り・id は全部実在')];
  }],
  ['0s4', 'languagesOf: 保存キー無しなら **固定分だけ**が返る (6 職すべて)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const bad = [];
    for (const k of Object.keys(m.classLang)) {
      const got = m.cNoKey[k];
      if (!Array.isArray(got) || !deepEq(got, m.classLang[k].fixed)) {
        bad.push(k + ' ' + JSON.stringify(got) + '≠' + JSON.stringify(m.classLang[k].fixed));
      }
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : '6 職とも fixed と一致 (warrior=' + JSON.stringify(m.cNoKey.warrior) + ')'];
  }],
  ['0s5', 'languagesOf: 壊れた JSON / 配列でない値でも **例外を投げず**固定分だけ', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const bad = [];
    for (const k of Object.keys(m.classLang)) {
      const cases = [['壊れたJSON', m.cBroken], ['配列でない', m.cNotArray]];
      for (let i = 0; i < cases.length; i++) {
        const tag = cases[i][0], got = cases[i][1][k];
        if (typeof got === 'string' && got.indexOf('THROW') === 0) { bad.push(k + '/' + tag + ' ' + got); continue; }
        if (!deepEq(got, m.classLang[k].fixed)) bad.push(k + '/' + tag + ' ' + JSON.stringify(got));
      }
    }
    const unknownOk = deepEq(m.cUnknownId, m.classLang.warrior.fixed);
    return [bad.length === 0 && unknownOk,
      (bad.length ? '⛔ ' + bad.join(' / ') + '  ' : '')
      + '未知の言語 id は捨てる: ' + JSON.stringify(m.cUnknownId) + (unknownOk ? '' : ' ⛔')];
  }],
  ['0s6', 'languagesOf: 未知 classKey / null / undefined は warrior へ落ちる (例外なし)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const w = m.cWarrior;
    const bad = Object.keys(m.cUnknownClass || {}).filter(k => !deepEq(m.cUnknownClass[k], w));
    return [bad.length === 0 && Array.isArray(w),
      bad.length ? '⛔ warrior へ落ちていない: '
        + bad.map(k => k + '=' + JSON.stringify(m.cUnknownClass[k])).join(' / ')
        : 'paladin / null / undefined → ' + JSON.stringify(w)];
  }],
  ['0s7', 'languagesOf: 選択分がマージされ、固定分との重複が出ない', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const wantMerge = m.classLang.warrior.fixed.concat(['dwarvish', 'goblin']);
    const dup = m.cDup;
    const dupOk = Array.isArray(dup) && new Set(dup).size === dup.length
      && sameSet(dup, m.classLang.dwarf.fixed);
    return [deepEq(m.cMerge, wantMerge) && dupOk,
      'merge=' + JSON.stringify(m.cMerge) + ' (期待 ' + JSON.stringify(wantMerge) + ')'
      + '  dedup=' + JSON.stringify(dup) + (dupOk ? '' : ' ⛔ 重複または固定分と不一致')];
  }],
  ['0s8', '⛔ languagesOf / open / render が localStorage へ 1 バイトも書かない (fixed を保存しない)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const added = (m.writeAfter || []).filter(k => (m.writeBefore || []).indexOf(k) < 0);
    return [added.length === 0 && m.langKeyAfterOpen === null,
      added.length ? '⛔ 増えたキー: ' + added.join(',')
        : (m.langKeyAfterOpen === null ? '増減 0 件 / languages キーも未生成'
          : '⛔ languages キーが書かれた: ' + m.langKeyAfterOpen)];
  }],
  /* ⚠⚠ #36 で 5 -> 11。件数の直書きは 3 箇所。**区画を足した瞬間に赤くなる**のは
     退行ではなく設計どおり (依頼書 #36 §2-3 罠 B)。 */
  ['0s9', '区画 id が 11 件で、__state() が avail / blank / inDom を **別々に** 返す', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const st = m.state || {};
    const secs = st.sections || [];
    const shape = secs.length === 11 && secs.every(s =>
      typeof s.id === 'string' && typeof s.avail === 'boolean' && typeof s.inDom === 'boolean'
      && typeof s.blank === 'boolean');
    const ids = (m.sectionIds || []);
    const idsOk = ids.length === 11 && sameSet(ids, secs.map(s => s.id));
    const listOk = Array.isArray(st.shown) && Array.isArray(st.hidden)
      && st.shown.length + st.hidden.length === 11;
    return [shape && idsOk && listOk,
      '区画 ' + ids.length + ' 件 ' + JSON.stringify(ids)
      + '  shown=' + JSON.stringify(st.shown) + ' hidden=' + JSON.stringify(st.hidden)
      + (shape && idsOk && listOk ? '' : '  ⛔ __state() の形が契約と違う')];
  }],
  ['0s10', 'スタブページでシートが開いて閉じる (isOpen が false→true→false)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const ok = m.openBefore === false && m.openRet === true && m.openAfter === true && m.closedAfter === false;
    return [ok, 'before=' + m.openBefore + ' open()=' + m.openRet + ' after=' + m.openAfter
      + ' closed=' + m.closedAfter + (ok ? '' : '  ⛔ 期待 false/true/true/false')];
  }],
  ['0s11', '?sheet=0 で window.DFSheet が生えず、ボタンもオーバーレイも注入されない', (M) => {
    const r = M.off;
    if (!r) return [false, '⛔ 測定が無い'];
    const ok = r.hasDFSheet === false && r.btn === false && r.overlay === false && r.style === false;
    return [ok, 'DFSheet=' + r.hasDFSheet + ' btn=' + r.btn + ' overlay=' + r.overlay + ' style=' + r.style
      + (ok ? '  (pageerror ' + (r.errs || []).length + ' 件)' : '  ⛔ 期待 全部 false')];
  }],
  ['0s12', '自前の職業表示名が js/hero-classes.js の HERO_CLASSES と 6 職とも一致 (2 経路)', (M) => {
    const r = M.labels;
    if (!r) return [false, '⛔ 測定が無い'];
    return [r.ok === true && r.n === 6,
      r.ok ? 'HERO_CLASSES ' + r.n + ' 職と一致'
        : '⛔ ' + ((r.mismatch || []).join(' / ') || r.why || '不明')];
  }],
  ['0s13', 'シートが修正値を自前計算していない (js/player-sheet.js のコード部に Math.floor が無い)', (M) => {
    const code = stripComments(M.sheetSrc || '');
    const floors = (code.split('Math.floor').length - 1);
    const halves = (code.split('- 10) / 2').length - 1) + (code.split('-10)/2').length - 1);
    return [floors === 0 && halves === 0,
      floors === 0 && halves === 0
        ? 'Math.floor 0 箇所 / (s-10)/2 0 箇所 (DFAbilities.abilityMod が唯一の入口)'
        : '⛔ Math.floor ' + floors + ' 箇所 / (s-10)/2 ' + halves
          + ' 箇所 — #28 の ?ability5e=0 が効かなくなる'];
  }],
  ['0s15', '★#36 SECTION_COLS が full/A/B/C の 4 種だけで、A/B/C それぞれに 1 件以上ある', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const cols = m.sectionCols || {};
    const ids = (m.sectionIds || []);
    if (!ids.length) return [false, '⛔ 区画が 0 件'];
    const vals = ids.map(id => cols[id]);
    const bad = ids.filter(id => ['full', 'A', 'B', 'C'].indexOf(cols[id]) < 0);
    const n = (c) => vals.filter(v => v === c).length;
    const ok = bad.length === 0 && Object.keys(cols).length === ids.length
      && n('A') >= 1 && n('B') >= 1 && n('C') >= 1 && n('full') >= 1;
    return [ok, 'full=' + n('full') + ' A=' + n('A') + ' B=' + n('B') + ' C=' + n('C')
      + '  (割り付け表 ' + Object.keys(cols).length + ' 件 / 区画 ' + ids.length + ' 件)'
      + (bad.length ? '  ⛔ 未知の段: ' + bad.map(id => id + '=' + cols[id]).join(',') : '')
      + (ok ? '' : '  ⛔ 3 段のどれかが空 = 段組の割り付け表が壊れている')];
  }],

  // ── §4 恒等 (この項目で測れる分) ───────────────────────────────────────
  ['4b', 'シートの XP_THRESHOLDS の写しが index.html の実体と完全一致 (10 要素すべて)', (M) => {
    const a = M.xpSheet, b = M.xpIndex, c = (M.mod && M.mod.has) ? M.mod.xp : null;
    if (!a || !b) return [false, '⛔ 母集団が無い (sheet=' + JSON.stringify(a) + ' index=' + JSON.stringify(b) + ')'];
    const ok = a.length === 10 && deepEq(a, b) && (c === null || deepEq(a, c));
    return [ok, 'sheet=' + JSON.stringify(a)
      + (deepEq(a, b) ? ' == index.html' : ' ⛔≠ index.html ' + JSON.stringify(b))
      + (c === null ? '' : (deepEq(a, c) ? '  (ブラウザ評価も一致)' : '  ⛔ ブラウザ評価 ' + JSON.stringify(c)))];
  }],

  // ── §5 撤退 (この項目で測れる分) ───────────────────────────────────────
  ['5b', '言語キーが無いセーブでも **固定分だけ**が出て、エラーにならない', (M) => {
    const r = M.nolang;
    if (!r || !r.has) return [false, '⛔ 母集団が無い'];
    const wantIds = r.expect || [];
    const gotIds = (r.chips || []).map(c => c.id);
    const allFixed = (r.chips || []).length > 0 && (r.chips || []).every(c => c.fixed === true);
    const ok = r.hadKey === null && r.threw === null && r.open === true
      && r.secPresent === true && deepEq(gotIds, wantIds) && allFixed
      && (r.errs || []).length === 0;
    return [ok, 'classKey=' + r.classKey + '  languages キー=' + JSON.stringify(r.hadKey)
      + '  チップ=' + JSON.stringify(gotIds) + ' (期待 ' + JSON.stringify(wantIds) + ')'
      + '  全部 fixed=' + allFixed + '  例外=' + JSON.stringify(r.threw)
      + '  pageerror=' + (r.errs || []).length
      + (ok ? '' : '  ⛔ 固定分だけが出てエラー 0 であること')];
  }],

  // ══ 実ページの受入条件 (dev-loop 項目 2 で実装) ══════════════════════════════
  //  ⚠ 母集団は「5 ページ」。1 枚でも欠けたら赤にする (欠けたページを黙って飛ばさない)。
  ['0a', '[装置] 5 ページすべてが HTTP 200 で読めている (母集団 = 5)', (M) => {
    const P = M.pages || [];
    const bad = P.filter(p => p.status !== 200).map(p => p.label + '=' + p.status);
    const files = P.map(p => p.file);
    const covers = PAGES.every(f => files.indexOf(f) >= 0);
    return [P.length === 5 && bad.length === 0 && covers,
      P.map(p => p.label + ':' + p.status).join(' ')
      + (M.townCompact ? '  + ' + M.townCompact.label + ':' + M.townCompact.status : '')
      + (P.length === 5 && !bad.length && covers ? '' : '  ⛔ 期待 = PAGES 5 枚すべて 200')];
  }],
  ['0b', '5 ページすべてで window.DFSheet が truthy (1 枚でも欠けたら赤)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない (' + P.length + ')'];
    const bad = P.filter(p => !p.has).map(p => p.label);
    return [bad.length === 0,
      bad.length ? '⛔ DFSheet が無い: ' + bad.join(',') + ' — <script src="js/player-sheet.js"> の書き忘れ'
        : '5 枚とも搭載 (' + P.map(p => p.label).join(',') + ')'];
  }],
  ['0c', '[装置] 各ページで実際にシートが開いた (isOpen()===true) を確認してから中身を採る', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない (' + P.length + ')'];
    /* ⭐ 「開いた」の証拠は 3 つ重ねる: isOpen() / __state().open / 中身の文字数。
       どれか 1 つだけだと「開いたことにして空を測る」経路が素通りする。 */
    const bad = P.filter(p => !(p.openBefore === false && p.openAfter === true
      && p.state && p.state.open === true && (p.bodyTextLen || 0) >= 20));
    return [bad.length === 0,
      P.map(p => p.label + ':' + p.openBefore + '→' + p.openAfter + '/' + (p.bodyTextLen || 0) + '字').join(' ')
      + (bad.length ? '  ⛔ 開けていない: ' + bad.map(p => p.label).join(',') : '')];
  }],

  // ── §1 呼び出し口 (キュー訂正版の 3 経路) ───────────────────────────────
  ['1a', 'tavern / world / title / town(compact) で #dfSheetBtn が覆われていない (elementFromPoint)', (M) => {
    const P = M.pages || [];
    const t = ['tavern', 'world', 'title'].map(l => P.find(p => p.label === l)).filter(Boolean);
    if (M.townCompact) t.push(M.townCompact);
    if (t.length !== 4) return [false, '⛔ 母集団が 4 でない (' + t.length + ') — 測れていないページがある'];
    const bad = t.filter(p => !(p.btn === true && p.inViewport === true && p.covered === false));
    return [bad.length === 0,
      t.map(p => p.label + ':' + (p.btn ? (p.covered ? '⛔覆' + p.hitDesc : 'OK@' + p.rect.x + ',' + p.rect.y) : '⛔無')).join('  ')
      + (bad.length ? '  ⛔ 存在だけでは足りない。中心の elementFromPoint が自分自身か子孫であること' : '')];
  }],
  ['1b', 'index では #partyPanel の子孫 / town(compact) では #townHud の子孫 (どちらも fixed でない)', (M) => {
    const P = M.pages || [];
    const idx = P.find(p => p.label === 'index');
    const tc  = M.townCompact;
    const td  = P.find(p => p.label === 'town');
    if (!idx || !tc || !td) return [false, '⛔ 母集団が足りない (index/town/town-compact)'];
    const okIdx = idx.btn === true && idx.inPartyPanel === true && idx.isFixed === false
      && idx.state && idx.state.mountVia === 'partyPanel';
    const okTc  = tc.btn === true && tc.inTownHud === true && tc.isFixed === false
      && tc.state && tc.state.mountVia === 'townHud';
    /* ⭐ 3 経路目も一緒に固定する。デスクトップの町は #townHud が display:none なので
       中へ入れたら永久に押せない = body へ fixed が正しい (キュー訂正版 §2)。 */
    const okTd  = td.btn === true && td.inTownHud === false && td.isFixed === true
      && td.state && td.state.mountVia === 'body';
    return [okIdx && okTc && okTd,
      'index: partyPanel子=' + idx.inPartyPanel + ' fixed=' + idx.isFixed + ' via=' + (idx.state && idx.state.mountVia)
      + ' | town(compact): townHud子=' + tc.inTownHud + ' fixed=' + tc.isFixed + ' via=' + (tc.state && tc.state.mountVia)
      + ' | town(desktop): fixed=' + td.isFixed + ' via=' + (td.state && td.state.mountVia)
      + (okIdx && okTc && okTd ? '' : '  ⛔ 期待 partyPanel / townHud / body の 3 経路')];
  }],
  ['1c', '5 ページとも、ボタンを **実マウスで押す** 前後で isOpen() が false → true', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = P.filter(p => !(p.clicked === true && p.openBefore === false && p.openAfter === true));
    /* Esc で閉じるところまで通す (開きっぱなしだと「開けた」しか言えない) */
    const noClose = P.filter(p => p.openAfterClose !== false).map(p => p.label);
    return [bad.length === 0 && noClose.length === 0,
      P.map(p => p.label + ':' + (p.clicked ? '押' : '⛔未押') + p.openBefore + '→' + p.openAfter
        + '→Esc' + p.openAfterClose).join(' ')
      + (noClose.length ? '  ⛔ Esc で閉じない: ' + noClose.join(',') : '')];
  }],

  // ── §2 中身 ────────────────────────────────────────────────────────────
  ['2a', '6 能力すべて (CHA 含む) が描かれ、値が DFAbilities.CLASS_ABILITIES と一致 (2 経路)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let cells = 0;
    for (const p of P) {
      if (!p.abilExpect) { bad.push(p.label + ' ⛔ DFAbilities が読めない'); continue; }
      const keys = p.abilDom.map(a => a.key);
      if (keys.indexOf('cha') < 0) { bad.push(p.label + ' ⛔ CHA が無い (' + keys.join(',') + ')'); continue; }
      if (keys.length !== p.abilExpect.length) { bad.push(p.label + ' ⛔ ' + keys.length + ' 件 (期待 ' + p.abilExpect.length + ')'); continue; }
      for (const e of p.abilExpect) {
        const got = p.abilDom.find(a => a.key === e.key);
        cells++;
        if (!got) { bad.push(p.label + '/' + e.key + ' ⛔ 無い'); continue; }
        if (got.score !== e.score) bad.push(p.label + '/' + e.key + ' score ' + got.score + '≠' + e.score);
      }
    }
    return [bad.length === 0 && cells === 30,
      '照合 ' + cells + ' マス (5 ページ × 6 能力) classKey=' + (P[0] && P[0].classKey)
      + '  ' + (P[0] ? P[0].abilDom.map(a => a.key + a.score).join(' ') : '')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['2b', '修正値が DFAbilities.abilityMod() と一致し、?ability5e=0 でシートも B/X へ戻る', (M) => {
    const P = M.pages || [], Q = M.pagesBX || [];
    if (P.length !== 5 || Q.length !== 5) return [false, '⛔ 母集団が 5/5 でない (' + P.length + '/' + Q.length + ')'];
    const bad = [];
    for (const p of P) {
      if (p.use5e !== true) bad.push(p.label + ' ⛔ 素なのに use5e=' + p.use5e);
      for (const e of (p.abilExpect || [])) {
        const got = p.abilDom.find(a => a.key === e.key);
        if (!got || got.mod !== e.mod) bad.push(p.label + '/' + e.key + ' mod ' + (got && got.mod) + '≠' + e.mod);
      }
    }
    /* ⭐ 母集団ガード: 5e と B/X で **実際に数字が動くマス**が無いと、
       自前計算していても気づけない (種の職を変えたときに空振りする)。 */
    let diffCells = 0;
    for (const q of Q) {
      if (q.use5e !== false) bad.push(q.label + ' ⛔ ?ability5e=0 なのに use5e=' + q.use5e);
      for (const e of (q.abilExpect || [])) {
        if (e.mod !== e.mod5e) diffCells++;
        const got = q.abilDom.find(a => a.key === e.key);
        if (!got) { bad.push(q.label + '/' + e.key + ' ⛔ 無い'); continue; }
        if (got.mod !== e.mod) bad.push('BX ' + q.label + '/' + e.key + ' mod ' + got.mod + '≠' + e.mod + ' (5e なら ' + e.mod5e + ')');
      }
    }
    return [bad.length === 0 && diffCells >= 5,
      '素: 5 ページとも abilityMod と一致  ?ability5e=0: 一致 かつ 5e と割れるマス ' + diffCells + ' 個'
      + (Q[0] ? ' (例 ' + Q[0].abilDom.map(a => a.key + (a.mod >= 0 ? '+' : '') + a.mod).join(' ') + ')' : '')
      + (diffCells >= 5 ? '' : '  ⛔ 割れるマスが少なすぎる = 種の職が悪く空振りする')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['2c', '取れない区画は行ごと消え、宣言済みの空欄枠だけが例外 (inDom === avail || blank)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    /* ★#36 §5-2 の表そのもの。⭐ 伏せる理由は「供給口が無い」「SkillCheck が無い」の 2 つだけ。 */
    const SUPPLY = ['dfSheetSecSaves', 'dfSheetSecCombat', 'dfSheetSecBody', 'dfSheetSecAttacks'];
    const SKILLC = ['dfSheetSecProficiency', 'dfSheetSecSkills'];
    const wantHidden = {
      'index.html': [], 'tavern.html': SUPPLY,
      'town.html': SUPPLY.concat(SKILLC), 'world.html': SUPPLY.concat(SKILLC),
      'title.html': SUPPLY.concat(SKILLC),
    };
    const bad = [];
    for (const p of P) {
      const st = p.state;
      if (!st) { bad.push(p.label + ' ⛔ __state() が無い'); continue; }
      /* ⭐ avail (実データが取れた) / blank (空欄枠と宣言済み) / inDom (DOM に居る) の 3 値。
         規則は inDom === (avail || blank)。⛔ #29 の規律を緩めるのではなく広げた形。
         hidden 配列だけを見ると inDom から作った値を inDom と比べる自己参照になり永久緑。 */
      if ((st.mismatch || []).length) bad.push(p.label + ' ⛔ inDom≠(avail||blank): ' + st.mismatch.join(','));
      if (!sameSet(st.hidden || [], wantHidden[p.file]))
        bad.push(p.label + ' 伏せ ' + JSON.stringify(st.hidden) + ' (期待 ' + JSON.stringify(wantHidden[p.file]) + ')');
      // 独立した期待: 技能/習熟は SkillCheck の有無、供給口の 4 区画は index だけ
      const has = (id) => !!(p.secInDom && p.secInDom[id]);
      for (const id of SKILLC) if (has(id) !== (p.hasSkillCheck === true)) bad.push(p.label + ' ' + id + '=' + has(id));
      for (const id of SUPPLY) if (has(id) !== (p.file === 'index.html')) bad.push(p.label + ' ' + id + '=' + has(id));
      for (const id of ['dfSheetSecHeader', 'dfSheetSecAbilities', 'dfSheetSecLanguages',
                        'dfSheetSecTraits', 'dfSheetSecPersona']) {
        if (!has(id)) bad.push(p.label + ' ⛔ ' + id + ' が無い');
      }
      // 「空文字で描いた」の直接検出: DOM に居る区画は必ず中身を持つ
      for (const s of (st.sections || [])) {
        if (s.inDom && s.textLen < 2) bad.push(p.label + '/' + s.id + ' ⛔ DOM に居るのに中身が空 (' + s.textLen + '字)');
      }
    }
    /* 母集団ガード: 期待は 伏せた区画 計 22 (0+4+6+6+6) / 全部出たページ 1 (index)。 */
    const hiddenTotal = P.reduce((n, p) => n + ((p.state && p.state.hidden) || []).length, 0);
    const allShown = P.filter(p => ((p.state && p.state.hidden) || []).length === 0).length;
    return [bad.length === 0 && hiddenTotal === 22 && allShown === 1,
      P.map(p => p.label + ':伏' + JSON.stringify(((p.state && p.state.hidden) || []).map(s => s.replace('dfSheetSec', '')))).join(' ')
      + '  伏せた区画 計 ' + hiddenTotal + ' / 全部出たページ ' + allShown
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')
      + (hiddenTotal === 22 && allShown === 1 ? '' : '  ⛔ 母集団ガード: 期待は 22 / 1')];
  }],
  ['2d', '技能 12 種が描かれ、合計が SkillCheck.checkScore と一致 (載っていないページでは区画ごと伏せる)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let cells = 0, withSC = 0, withoutSC = 0;
    for (const p of P) {
      if (p.hasSkillCheck) {
        withSC++;
        const exp = p.skillExpect || [];
        if (exp.length !== 12) { bad.push(p.label + ' ⛔ SkillCheck.CHECKS が ' + exp.length + ' 件 (期待 12)'); continue; }
        if (p.skillDom.length !== 12) { bad.push(p.label + ' ⛔ DOM の技能 ' + p.skillDom.length + ' 件'); continue; }
        for (const e of exp) {
          const got = p.skillDom.find(s => s.key === e.key);
          cells++;
          if (!got) { bad.push(p.label + '/' + e.key + ' ⛔ 無い'); continue; }
          if (got.score !== e.score) bad.push(p.label + '/' + e.key + ' ' + got.score + '≠' + e.score);
          if (got.prof !== e.prof) bad.push(p.label + '/' + e.key + ' 習熟 ' + got.prof + '≠' + e.prof);
        }
      } else {
        withoutSC++;
        if (p.skillDom.length !== 0) bad.push(p.label + ' ⛔ SkillCheck が無いのに技能 ' + p.skillDom.length + ' 件');
        if (p.secInDom && p.secInDom.dfSheetSecSkills) bad.push(p.label + ' ⛔ 技能区画が残っている');
      }
    }
    return [bad.length === 0 && cells === 24 && withSC === 2 && withoutSC === 3,
      'SkillCheck 有り ' + withSC + ' 枚 (照合 ' + cells + ' マス) / 無し ' + withoutSC + ' 枚は区画ごと伏せる'
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],

  // ── §3 言語 — title.html の「汝は何者か」 ──────────────────────────────
  ['3a', 'title.html で職を選ぶと CLASS_LANGUAGES[key].picks 個ぶんの選択チップが出る (6 職・rogue だけ 2)', (M) => {
    const L = M.langPick;
    if (!L || !L.def) return [false, '⛔ 母集団が無い (名乗り画面まで進めていない)'];
    const C = L.classes || [];
    if (C.length !== 6) return [false, '⛔ 測れた職が ' + C.length + ' (期待 6)'];
    const allIds = L.def.langIds || [];
    const bad = [];
    for (const r of C) {
      const a = r.afterClass;
      if (!a.secInDom || a.secHidden !== false) { bad.push(r.key + ' ⛔ #langPick が出ていない'); continue; }
      if (a.dataPicks !== String(r.picks)) bad.push(r.key + ' ⛔ data-picks=' + a.dataPicks + ' (期待 ' + r.picks + ')');
      if (!deepEq(a.fixed.map(c => c.id), r.fixedWant)) {
        bad.push(r.key + ' ⛔ 固定分 ' + JSON.stringify(a.fixed.map(c => c.id)) + '≠' + JSON.stringify(r.fixedWant));
      }
      /* ⛔ 固定分は選択肢に出さない = 重複を作らせない (依頼書 §6) */
      const want = allIds.filter(id => r.fixedWant.indexOf(id) < 0);
      const got = a.choices.map(c => c.id);
      if (!deepEq(got, want)) bad.push(r.key + ' ⛔ 選択肢 ' + got.length + ' 件 (期待 ' + want.length + ' = 14 - 固定 ' + r.fixedWant.length + ')');
      if (a.selected.length !== 0) bad.push(r.key + ' ⛔ 職を選んだ直後なのに ' + a.selected.length + ' 個が選択済み');
      // picks 個 選べる
      const last = r.steps[r.steps.length - 1];
      if (!last || last.selected.length !== r.picks) bad.push(r.key + ' ⛔ ' + r.picks + ' 個 選べていない');
      // ⭐ picks 個で打ち止め (もう 1 つ押しても増えない)
      if (r.overflow && r.overflow.selected.length !== r.picks) {
        bad.push(r.key + ' ⛔ 上限を超えて ' + r.overflow.selected.length + ' 個 選べた (期待 ' + r.picks + ')');
      }
      if (r.overflow && r.overflow.selected.indexOf(r.overflowId) >= 0) {
        bad.push(r.key + ' ⛔ 上限後に押した ' + r.overflowId + ' が選択に入った');
      }
    }
    const p2 = C.filter(r => r.picks === 2).map(r => r.key);
    const okPicks = p2.length === 1 && p2[0] === 'rogue' && C.filter(r => r.picks === 1).length === 5;
    return [bad.length === 0 && okPicks,
      C.map(r => r.key + ':固' + r.fixedWant.length + '/選' + r.afterClass.choices.length + '/picks' + r.picks).join(' ')
      + (okPicks ? '' : '  ⛔ picks=2 は rogue 1 職だけのはず (' + p2.join(',') + ')')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['3b', 'picks 未充足では「出発」が disabled (充足で有効化・外すとまた disabled)', (M) => {
    const L = M.langPick;
    if (!L) return [false, '⛔ 母集団が無い'];
    const C = L.classes || [];
    if (C.length !== 6) return [false, '⛔ 測れた職が ' + C.length + ' (期待 6)'];
    const bad = []; let midChecked = 0;
    for (const r of C) {
      if (r.afterClass.departDisabled !== true) bad.push(r.key + ' ⛔ 職を選んだだけで押せる');
      for (let i = 0; i < r.steps.length; i++) {
        const want = (i + 1) < r.picks;              // 途中は disabled のまま
        if (want) midChecked++;
        if (r.steps[i].departDisabled !== want) {
          bad.push(r.key + ' ⛔ ' + (i + 1) + '/' + r.picks + ' 個で disabled=' + r.steps[i].departDisabled + ' (期待 ' + want + ')');
        }
      }
      if (r.afterDeselect && r.afterDeselect.departDisabled !== true) bad.push(r.key + ' ⛔ 1 つ外しても押せたまま');
      if (r.afterReselect && r.afterReselect.departDisabled !== false) bad.push(r.key + ' ⛔ 選び直しても押せない');
    }
    /* ⭐ 撤退 ?sheet=0: 言語 UI が **DOM ごと居らず**、職を選んだだけで押せる (詰まない)。
       ⚠ UI を消しただけで disabled が解けていないと、撤退したのに新規が始められない。 */
    const R = L.retreat || {};
    const okOff = R.hasDFSheet === false && R.secInDom === false && R.departDisabled === false
      && (R.errs || []).length === 0;
    /* ⭐ 母集団ガード: 「途中」の状態が 1 度も現れないと (3b) は
       「0 個 → 1 個」しか見ていない = rogue の 2 個目が空振りする。 */
    return [bad.length === 0 && okOff && midChecked >= 1,
      '6 職とも 0 個=disabled / 充足=有効 / 外すと disabled  (途中状態 ' + midChecked + ' 回 = rogue の 1/2)'
      + '  ?sheet=0: DFSheet=' + R.hasDFSheet + ' #langPick=' + R.secInDom + ' 出発disabled=' + R.departDisabled
      + (okOff ? '' : '  ⛔ 撤退で詰まっている / UI が残っている')
      + (midChecked >= 1 ? '' : '  ⛔ 母集団ガード: picks 2 の職が測れていない')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['3c', '出発後 localStorage["dragonfighters.languages"] が **選択分だけ** (固定分を含まない・順序も一致)', (M) => {
    const D = M.departs || [];
    if (D.length !== 2) return [false, '⛔ 母集団が 2 でない (' + D.length + ')'];
    const bad = [];
    for (const d of D) {
      if (d.langsRaw === null) { bad.push(d.classKey + ' ⛔ languages キーが無い — 罠 B (newGame より前に書いた) か保存漏れ'); continue; }
      let got = null;
      try { got = JSON.parse(d.langsRaw); } catch (e) { bad.push(d.classKey + ' ⛔ JSON でない: ' + d.langsRaw); continue; }
      if (!Array.isArray(got)) { bad.push(d.classKey + ' ⛔ 配列でない: ' + d.langsRaw); continue; }
      if (!deepEq(got, d.picked)) bad.push(d.classKey + ' ⛔ ' + JSON.stringify(got) + '≠選んだ分 ' + JSON.stringify(d.picked));
      const mixed = got.filter(id => d.fixedWant.indexOf(id) >= 0);
      if (mixed.length) bad.push(d.classKey + ' ⛔ 固定分が混ざっている: ' + mixed.join(','));
      if (got.length !== d.picksWant) bad.push(d.classKey + ' ⛔ ' + got.length + ' 件 (picks ' + d.picksWant + ')');
      if (d.partyRaw !== JSON.stringify([d.classKey])) bad.push(d.classKey + ' ⛔ partyComposition=' + d.partyRaw);
    }
    /* ⭐ 母集団ガード: 「固定分と選択分の両方が空でない」職で測っていること。
       fixed が 0 件の職だけで測ると「混ざっていない」が自明になる。 */
    const guard = D.filter(d => d.fixedWant.length >= 1 && d.picked.length >= 1).length;
    return [bad.length === 0 && guard === 2,
      D.map(d => d.classKey + ' 固' + JSON.stringify(d.fixedWant) + ' 選' + JSON.stringify(d.picked)
        + ' → 保存 ' + d.langsRaw + ' @' + d.dest).join('   ')
      + (guard === 2 ? '' : '  ⛔ 母集団ガード: 固定分と選択分が両方ある職で測ること')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['3d', 'シートの言語欄が DFSheet.languagesOf(classKey) と一致し、固定分 + 選択分が両方出ている (2 経路)', (M) => {
    const D = M.departs || [];
    if (D.length !== 2) return [false, '⛔ 母集団が 2 でない'];
    const bad = [];
    for (const d of D) {
      if (!d.hasDFSheet) { bad.push(d.classKey + ' ⛔ 行き先 (' + d.dest + ') に DFSheet が無い'); continue; }
      if (d.threw) { bad.push(d.classKey + ' ⛔ open() が例外: ' + d.threw); continue; }
      if (d.open !== true || d.secPresent !== true) { bad.push(d.classKey + ' ⛔ 言語区画が出ていない'); continue; }
      if (d.sheetClassKey !== d.classKey) { bad.push(d.classKey + ' ⛔ シートが見ている職 ' + d.sheetClassKey + ' が違う'); continue; }
      const domIds = (d.chips || []).map(c => c.id);
      /* 経路 1 = DOM のチップ / 経路 2 = モジュールの返り値。⛔ ドライバに言語 id を写経しない */
      if (!deepEq(domIds, d.expect)) bad.push(d.classKey + ' ⛔ DOM ' + JSON.stringify(domIds) + '≠languagesOf ' + JSON.stringify(d.expect));
      const domFixed  = (d.chips || []).filter(c => c.fixed).map(c => c.id);
      const domPicked = (d.chips || []).filter(c => !c.fixed).map(c => c.id);
      if (!deepEq(domFixed, d.fixedWant)) bad.push(d.classKey + ' ⛔ 固定分 ' + JSON.stringify(domFixed) + '≠' + JSON.stringify(d.fixedWant));
      if (!sameSet(domPicked, d.picked)) bad.push(d.classKey + ' ⛔ 選択分 ' + JSON.stringify(domPicked) + '≠' + JSON.stringify(d.picked));
      if (!domFixed.length || !domPicked.length) bad.push(d.classKey + ' ⛔ 片方しか出ていない');
    }
    return [bad.length === 0,
      D.map(d => d.classKey + ' シート=' + JSON.stringify((d.chips || []).map(c => c.id + (c.fixed ? '(固)' : '')))
        + ' == languagesOf ' + JSON.stringify(d.expect)).join('   ')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['3e', '職を選び直すと選択済みがリセットされる (固定分との重複が起きない)', (M) => {
    const L = M.langPick;
    if (!L) return [false, '⛔ 母集団が無い'];
    const S = L.switchCase;
    if (!S) return [false, '⛔ 職替えの測定が無い'];
    const bad = [];
    /* 前提 (母集団ガード): 替える前に確かに 1 つ選ばれていて、
       その言語が **替えた先の固定分** に在ること = 重複が起きうる組み合わせであること。 */
    if (!deepEq(S.before.selected, [S.lang])) bad.push('⛔ 替える前に ' + S.lang + ' が選ばれていない: ' + JSON.stringify(S.before.selected));
    const toFixed = S.after.fixed.map(c => c.id);
    if (toFixed.indexOf(S.lang) < 0) bad.push('⛔ 母集団ガード: ' + S.to + ' の固定分に ' + S.lang + ' が無い = 重複が起きない組み合わせ');
    // 本体
    if (S.after.selected.length !== 0) bad.push('⛔ 職替え後も ' + JSON.stringify(S.after.selected) + ' が選択に残っている');
    if (S.after.choices.map(c => c.id).indexOf(S.lang) >= 0) bad.push('⛔ ' + S.lang + ' が固定分なのに選択肢にも出ている');
    if (S.after.departDisabled !== true) bad.push('⛔ 職替え後に「出発」が押せたまま');
    /* 6 職を順に回るループ側でも同じ性質を確かめる (afterClass.selected が毎回 0 件)。 */
    const loopBad = (L.classes || []).filter(r => r.afterClass.selected.length !== 0).map(r => r.key);
    if (loopBad.length) bad.push('⛔ 職替え直後に選択が残った職: ' + loopBad.join(','));
    return [bad.length === 0,
      S.from + ' で ' + S.lang + ' を選ぶ → ' + S.to + ' へ替える: 選択 '
      + JSON.stringify(S.before.selected) + ' → ' + JSON.stringify(S.after.selected)
      + '  (' + S.to + ' の固定分 ' + JSON.stringify(toFixed) + ' と重複しない)'
      + '  出発disabled=' + S.after.departDisabled
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],

  // ── §4 恒等 ────────────────────────────────────────────────────────────
  ['4a', 'シートを開閉しても既存 HUD (#settingsBtn / #partyToggleBtn / #combatLog) の矩形が 1px も動かない', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let measured = 0, meaningful = 0;
    for (const p of P) {
      for (const id of HUD_IDS) {
        const a = (p.hudBefore || {})[id], b = (p.hudOpen || {})[id], c = (p.hudClosed || {})[id];
        if (!a) continue;
        measured++;
        if (a[2] > 0 && a[3] > 0) meaningful++;   // 実体のある要素だけを母集団として数える
        if (!deepEq(a, b)) bad.push(p.label + '/#' + id + ' 開いたら ' + JSON.stringify(a) + '→' + JSON.stringify(b));
        if (!deepEq(a, c)) bad.push(p.label + '/#' + id + ' 閉じたら ' + JSON.stringify(a) + '→' + JSON.stringify(c));
      }
    }
    return [bad.length === 0 && meaningful >= 3,
      '測った HUD ' + measured + ' 件 (うち実体あり ' + meaningful + ' 件) — 開く前 / 開いている間 / 閉じた後 の 3 点比較'
      + (meaningful >= 3 ? '' : '  ⛔ 母集団ガード: 実体のある HUD が 3 件未満 = 空振り')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 4).join(' / ') : '')];
  }],
  ['4c', '5 ページすべてで pageerror ゼロ (素 / ?ability5e=0 / ?sheet=0 / 名乗りフロー の 4 経路とも)', (M) => {
    /* ⭐ 名乗りフロー (項目 3) も勘定に入れる。title.html で職を選び言の葉を押す経路は
       ここでしか通らないので、外すと「新しく足した UI だけ例外を投げていても緑」になる。 */
    const title = [];
    if (M.langPick) {
      title.push({ label: 'title(名乗り)', errs: M.langPick.errs });
      if (M.langPick.retreat) title.push({ label: 'title(?sheet=0 名乗り)', errs: M.langPick.retreat.errs });
    }
    for (const d of (M.departs || [])) title.push({ label: 'title→出発(' + d.classKey + ')', errs: d.errs });
    if (M.departOff) title.push({ label: 'title→出発(?sheet=0)', errs: M.departOff.errs });
    const all = [].concat(M.pages || [], M.pagesBX || [], M.retreat || [],
      M.townCompact ? [M.townCompact] : [], title);
    const bad = all.filter(p => (p.errs || []).length)
      .map(p => p.label + ': ' + p.errs.slice(0, 2).join(' | '));
    return [all.length >= 20 && bad.length === 0,
      '測ったページロード ' + all.length + ' 回 (素 5 + BX 5 + 撤退 5 + 町 compact 1 + 名乗り ' + title.length + ')'
      + (bad.length ? '  ⛔ ' + bad.slice(0, 4).join('  //  ') : '  pageerror 0 件')];
  }],
  ['4d', 'title の出発フローで増える localStorage キーは dragonfighters.languages の 1 本だけ (シートの開閉では 0 本)', (M) => {
    /* ⭐⭐ 「増えた 1 本」は **?sheet=0 で出発した記録との差**で測る。
       newGame() が dragonfighters.* を prefix 総なめで消すので、
       出発前後の単純な差分では「増えた」を定義できない (前が全部消える)。
       → 従来どおりの出発 (撤退アーム) と、言語つきの出発 (本番アーム) を
         **同じ職・同じ手順**で走らせ、鍵の集合の差だけを見る。 */
    const A = M.departOff, B = (M.departs || []).find(d => d.classKey === (A && A.classKey));
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    if (!A || !B) return [false, '⛔ 出発アームが揃っていない (撤退=' + !!A + ' 本番=' + !!B + ')'];
    const bad = [];
    // ① シートの開閉では 1 本も増えない (項目 2 からの担保をそのまま残す)
    for (const p of P) {
      const added = (p.lsAfter || []).filter(k => (p.lsBefore || []).indexOf(k) < 0);
      if (added.length) bad.push(p.label + ' ⛔ シート開閉で +' + added.join(','));
      if ((p.lsBefore || []).length === 0) bad.push(p.label + ' ⛔ 種が入っていない = 差分が空振り');
    }
    // ② 出発フローで増えたのは languages 1 本だけ / 減ったキーは 0 本
    const gained = (B.keys || []).filter(k => (A.keys || []).indexOf(k) < 0);
    const lost   = (A.keys || []).filter(k => (B.keys || []).indexOf(k) < 0);
    const okGain = deepEq(gained, ['dragonfighters.languages']) && lost.length === 0;
    if (!okGain) bad.push('⛔ 出発フローの差分 +' + JSON.stringify(gained) + ' -' + JSON.stringify(lost));
    // 母集団ガード: 両アームが実際に同じ職で出発し、鍵を持って着いていること
    if (!(A.keys || []).length || !(B.keys || []).length) bad.push('⛔ 母集団ガード: 行き先で鍵が 0 本 = 差分が空振り');
    if (A.langsRaw !== null) bad.push('⛔ ?sheet=0 なのに languages が書かれた: ' + A.langsRaw);
    return [bad.length === 0,
      'シート開閉 +0 本 × 5 ページ (種 ' + ((P[0] && P[0].lsBefore) || []).length + ' 本)'
      + '   出発 ?sheet=0 ' + (A.keys || []).length + ' 本 → 素 ' + (B.keys || []).length + ' 本'
      + '  差分 +' + JSON.stringify(gained) + ' -' + JSON.stringify(lost)
      + (bad.length ? '  ⛔ ' + bad.slice(0, 4).join(' / ') : '')];
  }],

  // ── §5 撤退 ────────────────────────────────────────────────────────────
  ['5a', '?sheet=0 で 5 ページとも #dfSheetBtn も #dfSheetOverlay も存在しない', (M) => {
    const R = M.retreat || [];
    if (R.length !== 5) return [false, '⛔ 母集団が 5 でない (' + R.length + ')'];
    const bad = R.filter(r => !(r.status === 200 && r.hasDFSheet === false
      && r.btn === false && r.overlay === false && r.style === false));
    return [bad.length === 0,
      R.map(r => r.label + ':' + (r.status === 200 ? '' : '⛔' + r.status)
        + 'DFSheet=' + r.hasDFSheet + ' btn=' + r.btn + ' ov=' + r.overlay).join('  ')
      + (bad.length ? '  ⛔ 期待 全部 false' : '')];
  }],

  // ══ ★#36 §6 空欄枠 ═══════════════════════════════════════════════════
  ['0s14', '★#36 空欄枠の宣言 (区画 1 件 / セル 10 件) が SECTION_DEFS / __state() と食い違わない', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const secIds = m.sectionIds || [];
    const bs = m.blankSecIds || [], bf = m.blankFieldIds || [];
    const st = (m.state && m.state.sections) || [];
    const notASection = bs.filter(id => secIds.indexOf(id) < 0);
    const crossed = bs.filter(id => bf.indexOf(id) >= 0);
    const flagged = st.filter(s => s.blank).map(s => s.id);
    const uniq = bf.filter((x, i) => bf.indexOf(x) === i).length === bf.length;
    const ok = bs.length === 1 && bf.length === 10 && notASection.length === 0
      && crossed.length === 0 && uniq && sameSet(flagged, bs);
    return [ok, '区画 ' + JSON.stringify(bs) + ' / セル ' + bf.length + ' 件 ' + JSON.stringify(bf)
      + '  __state() が blank と言った区画 ' + JSON.stringify(flagged)
      + (ok ? '' : '  ⛔ ' + (bs.length === 1 ? '' : '区画の件数 ')
          + (bf.length === 10 ? '' : 'セルの件数 ')
          + (notASection.length ? '区画 id が SECTION_DEFS に無い ' : '')
          + (crossed.length ? '区画とセルで id が衝突 ' : '')
          + (uniq ? '' : 'セル id が重複 ')
          + (sameSet(flagged, bs) ? '' : '__state() の blank と宣言が食い違う'))];
  }],
  ['6a', '★#36 DOM の [data-blank] が宣言の中だけで、index では 10 件ちょうど', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = [];
    for (const p of P) {
      const decl = p.blankIdsDecl || [];
      if (decl.length !== 10) bad.push(p.label + ' ⛔ 宣言が ' + decl.length + ' 件');
      const ids = (p.blankDom || []).map(x => x.id);
      const outside = ids.filter(id => decl.indexOf(id) < 0);
      if (outside.length) bad.push(p.label + ' ⛔ 宣言に無い空欄セル: ' + outside.join(','));
      if (ids.filter((x, i) => ids.indexOf(x) === i).length !== ids.length)
        bad.push(p.label + ' ⛔ 同じ id の空欄セルが 2 つ以上');
    }
    const idx = P.find(p => p.file === 'index.html');
    const idxN = idx ? (idx.blankDom || []).length : -1;
    return [bad.length === 0 && idxN === 10,
      P.map(p => p.label + ':' + (p.blankDom || []).length + '個').join(' ') + '  (index は 10 件ちょうど)'
      + (idxN === 10 ? '' : '  ⛔ index の空欄セルが ' + idxN + ' 件')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' / ') : '')];
  }],
  ['6b', '★#36 空欄枠の区画は 実データ 0 かつ 空欄セル 1 以上 (5 ページとも)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let n = 0;
    for (const p of P) for (const s of ((p.state && p.state.sections) || [])) {
      if (!s.blank) continue;
      n++;
      if (!s.inDom) bad.push(p.label + '/' + s.id + ' ⛔ DOM に居ない');
      if (s.dataCells !== 0) bad.push(p.label + '/' + s.id + ' ⛔ 実データのセルが ' + s.dataCells + ' 個');
      if (!(s.blankCells >= 1)) bad.push(p.label + '/' + s.id + ' ⛔ 空欄セルが 0 個');
    }
    return [bad.length === 0 && n === 5, '空欄枠の区画 ' + n + ' 件 (5 ページ × 1) を検査'
      + (n === 5 ? '' : '  ⛔ 母集団が 5 でない')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' / ') : '')];
  }],
  ['6c', '★#36 空欄枠でない区画が DOM に居るなら、必ず実データのセルを持つ', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let n = 0;
    for (const p of P) for (const s of ((p.state && p.state.sections) || [])) {
      if (s.blank || !s.inDom) continue;
      n++;
      if (!(s.dataCells >= 1)) bad.push(p.label + '/' + s.id + ' ⛔ 実データのセルが 0 個');
    }
    return [bad.length === 0 && n >= 25,
      '実データを持つはずの区画 ' + n + ' 件を検査 (index 10 + tavern 6 + 他 4×3)'
      + (n >= 25 ? '' : '  ⛔ 母集団が小さすぎる')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' / ') : '')];
  }],
  ['6d', '★#36 空欄セルに — / 0 / - を書いていない (「取れなかった」に見せない)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let n = 0;
    for (const p of P) for (const b of (p.blankDom || [])) {
      n++;
      if (/[\u2014\u30140\-]/.test(String(b.text || ''))) bad.push(p.label + '/' + b.id + ' "' + b.text + '"');
    }
    return [bad.length === 0 && n >= 10, '空欄セル ' + n + ' 個の文字を検査 (5 ページ合計)'
      + (n >= 10 ? '' : '  ⛔ 母集団が小さすぎる')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' / ') : '')];
  }],

  // ══ ★#36 §7 5E の体裁 ════════════════════════════════════════════════
  ['7a', '★#36 幅 1200 / 760 / 390 で三段組が 3 / 2 / 1 列に畳まれる', (M) => {
    const W = M.widths;
    if (!W || (W.marks || []).length !== 3) return [false, '⛔ 幅の測定が無い'];
    const want = { 1200: 3, 760: 2, 390: 1 };
    const bad = W.marks.filter(k => k.gridTracks !== want[k.w] || k.open !== true);
    return [bad.length === 0,
      W.marks.map(k => k.w + 'px:' + k.gridTracks + '列' + (k.open ? '' : '(⛔開いていない)')).join('  ')
      + (bad.length ? '  ⛔ 期待 1200:3 / 760:2 / 390:1' : '')];
  }],
  ['7b', '★#36 中身が 0 の段は DOM に置かない (index は A/B/C・他 4 枚は A/C)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const want = { 'index.html': ['A', 'B', 'C'], 'tavern.html': ['A', 'C'],
      'town.html': ['A', 'C'], 'world.html': ['A', 'C'], 'title.html': ['A', 'C'] };
    const bad = P.filter(p => !deepEq(p.colsInDom || [], want[p.file]));
    return [bad.length === 0,
      P.map(p => p.label + ':' + JSON.stringify(p.colsInDom || [])).join(' ')
      + (bad.length ? '  ⛔ B 段 (供給口の 4 区画) は index にしか中身が無い' : '')];
  }],
  ['7c', '★#36 6 つの能力値ボックスが縦 1 列に積まれている (left 同一 / top 単調増加)', (M) => {
    const p = (M.pages || []).find(x => x.file === 'index.html');
    if (!p) return [false, '⛔ index の測定が無い'];
    const r = p.abilRects || [];
    if (r.length !== 6) return [false, '⛔ 能力値ボックスが ' + r.length + ' 個 (期待 6)'];
    const sameLeft = r.every(x => Math.abs(x.left - r[0].left) <= 0.5);
    let mono = true;
    for (let i = 1; i < r.length; i++) if (!(r[i].top > r[i - 1].top + 8)) mono = false;
    return [sameLeft && mono,
      'left=' + r.map(x => x.left).join('/') + '  top=' + r.map(x => x.top).join('/')
      + (sameLeft && mono ? '' : '  ⛔ ' + (sameLeft ? '' : 'left が揃っていない ') + (mono ? '' : 'top が単調増加でない'))];
  }],
  ['7d', '★#36 3 幅とも紙が横スクロールしない (scrollWidth <= clientWidth + 1)', (M) => {
    const W = M.widths;
    if (!W || (W.marks || []).length !== 3) return [false, '⛔ 幅の測定が無い'];
    const bad = W.marks.filter(k => !(k.paper && k.paper.scrollW <= k.paper.clientW + 1));
    return [bad.length === 0,
      W.marks.map(k => k.w + 'px:' + (k.paper ? k.paper.scrollW + '/' + k.paper.clientW : '⛔無')).join('  ')
      + (bad.length ? '  ⛔ 紙がはみ出している' : '')];
  }],
  ['7e', '★#36 390px 幅で紙の実効文字高が 11px 以上 (縮小がかかると読めなくなる)', (M) => {
    const W = M.widths;
    const k = W && (W.marks || []).find(x => x.w === 390);
    if (!k || !k.paper) return [false, '⛔ 390px の測定が無い'];
    const mn = k.paper.minFont;
    const ok = typeof mn === 'number' && mn >= 11;
    return [ok, '最小の実効文字高 ' + mn + 'px (祖先の transform scale 込み)'
      + (ok ? '' : '  ⛔ 11px 未満')];
  }],

  // ══ ★#36 §8 数字の出所 ═══════════════════════════════════════════════
  ['8a', '★#36 ?sheet5e=0 で 5 ページとも #29 の 5 区画へ戻る (段組も空欄枠も出ない)', (M) => {
    const R = M.retreat5e || [];
    if (R.length !== 5) return [false, '⛔ 母集団が 5 でない (' + R.length + ')'];
    const want = { 'index.html': [], 'tavern.html': ['dfSheetSecBody'],
      'town.html': ['dfSheetSecSkills', 'dfSheetSecBody'],
      'world.html': ['dfSheetSecSkills', 'dfSheetSecBody'],
      'title.html': ['dfSheetSecSkills', 'dfSheetSecBody'] };
    const bad = [];
    for (const p of R) {
      const st = p.state;
      if (!st) { bad.push(p.label + ' ⛔ __state() が無い'); continue; }
      if (p.sheet5e !== false) bad.push(p.label + ' ⛔ SHEET5E=' + p.sheet5e);
      if ((st.sectionIds || []).length !== 5) bad.push(p.label + ' ⛔ 区画 ' + (st.sectionIds || []).length + ' 件');
      if (!sameSet(st.hidden || [], want[p.file])) bad.push(p.label + ' 伏せ ' + JSON.stringify(st.hidden));
      if ((p.colsInDom || []).length !== 0) bad.push(p.label + ' ⛔ 三段組の器が残っている');
      if ((p.blankDom || []).length !== 0) bad.push(p.label + ' ⛔ 空欄枠が残っている');
      if ((p.bodyTextLen || 0) < 20) bad.push(p.label + ' ⛔ 中身が空 (' + p.bodyTextLen + '字)');
    }
    return [bad.length === 0,
      R.map(p => p.label + ':' + ((p.state && p.state.sectionIds) || []).length + '区画/伏'
        + JSON.stringify((((p.state && p.state.hidden) || [])).map(s => s.replace('dfSheetSec', '')))).join(' ')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' / ') : '')];
  }],
  ['8b', '★#36 セーヴ 5 行が供給口の saves + saveBonus と一致し、5e 修正値とは割れている', (M) => {
    const p = M.numHead;
    if (!p || !p.body || !p.body.saves) return [false, '⛔ 供給口の saves が無い'];
    if (p.heroIsHead !== true) return [false, '⛔ 母集団: 頭が主人公でない (heroIsHead=' + p.heroIsHead + ')'];
    const bad = []; let diverge = 0;
    const dom = p.saveDom || [];
    if (dom.length !== 5) bad.push('⛔ セーヴ行が ' + dom.length + ' 本 (期待 5)');
    if (dom.some(r => r.key === 'cha')) bad.push('⛔ 魅力の行が在る (playerStats に cha は無い)');
    for (const k of ['str', 'dex', 'con', 'int', 'wis']) {
      const got = dom.find(r => r.key === k);
      const w = p.body.saves[k] + p.body.saveBonus;
      if (!got) { bad.push(k + ' ⛔ 行が無い'); continue; }
      if (got.mod !== w) bad.push(k + ' DOM ' + got.mod + '≠' + w);
      const e = (p.abilExpect || []).find(a => a.key === k);
      if (e && w !== e.mod) diverge++;
    }
    return [bad.length === 0 && diverge >= 1,
      '供給口 ' + JSON.stringify(p.body.saves) + ' 装備' + p.body.saveBonus
      + '  DOM ' + dom.map(r => r.key + (r.mod >= 0 ? '+' : '') + r.mod).join(' ')
      + '  5e 修正値と割れるマス ' + diverge + ' 個'
      + (diverge >= 1 ? '' : '  ⛔ 母集団ガード: 割れていないと 5e から出しても気づけない')
      + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
  }],
  ['8c', '★#36 頭が NPC の編成でも、紙は主人公 (heroRef) の数字を出す', (M) => {
    const p = M.numAlly;
    if (!p || !p.body) return [false, '⛔ 測定が無い'];
    if (p.heroIsHead !== false) return [false, '⛔ 母集団: 頭が NPC になっていない (heroIsHead=' + p.heroIsHead + ')'];
    const h = p.heroAlly;
    if (!h) return [false, '⛔ 母集団: allies の中に主人公が居ない'];
    const divergent = (typeof p.headAc === 'number' && h.ac !== p.headAc)
      || (typeof p.headAtk === 'number' && h.atkBonus !== p.headAtk);
    const bad = [];
    const sd = p.saveDom || [];
    for (const k of ['str', 'dex', 'con', 'int', 'wis']) {
      const got = sd.find(r => r.key === k);
      const w = (h[k] | 0) + p.body.saveBonus;
      if (!got) { bad.push('セーヴ ' + k + ' ⛔ 行が無い'); continue; }
      if (got.mod !== w) bad.push('セーヴ ' + k + ' ' + got.mod + '≠' + w + ' (主人公の値)');
    }
    const S = p.statDom || {};
    const eq = (key, w) => { if (!S[key] || S[key].v !== String(w)) bad.push(key + ' ' + (S[key] ? S[key].v : '無') + '≠' + w); };
    eq('ac', h.ac);
    eq('initiative', (h.dex >= 0 ? '+' : '') + h.dex);
    eq('atkBonus', (h.atkBonus >= 0 ? '+' : '') + h.atkBonus);
    if (h.weaponName) eq('weapon', h.weaponName);
    return [bad.length === 0 && divergent,
      '主人公=' + h.classKey + ' (ac' + h.ac + ' atk' + h.atkBonus + ' ' + h.weaponName + ')'
      + '  頭=ac' + p.headAc + ' atk' + p.headAtk
      + (divergent ? '' : '  ⛔ 母集団ガード: 頭と主人公の数字が割れていない = 頭の値を出しても気づけない')
      + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' / ') : '')];
  }],
  ['8d', '★#36 先制が供給口の initiative (= u.dex 系統) と一致し、5e 修正値とは別物', (M) => {
    const arms = [M.numHead, M.numAlly].filter(Boolean);
    if (arms.length !== 2) return [false, '⛔ 母集団が 2 でない'];
    const bad = []; let diverge = 0;
    for (const p of arms) {
      if (!p.body || typeof p.body.initiative !== 'number') { bad.push(p.label + ' ⛔ 供給口の initiative が無い'); continue; }
      const S = p.statDom || {};
      const w = (p.body.initiative >= 0 ? '+' : '') + p.body.initiative;
      if (!S.initiative || S.initiative.v !== w) bad.push(p.label + ' DOM ' + (S.initiative ? S.initiative.v : '無') + '≠' + w);
      const e = (p.abilExpect || []).find(a => a.key === 'dex');
      if (e && p.body.initiative !== e.mod) diverge++;
    }
    return [bad.length === 0 && diverge >= 1,
      arms.map(p => p.label + ':' + (p.body ? (p.body.initiative >= 0 ? '+' : '') + p.body.initiative : '⛔')).join('  ')
      + '  DFAbilities の DEX 修正値と割れた腕 ' + diverge + ' 本'
      + (diverge >= 1 ? '' : '  ⛔ 母集団ガード: 割れていないと 5e から出しても気づけない')
      + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
  }],
  ['8e', '★#36 攻撃欄の武器名 / 命中 / ダメージが供給口と一致する (2 経路)', (M) => {
    const arms = [M.numHead, M.numAlly].filter(Boolean);
    if (arms.length !== 2) return [false, '⛔ 母集団が 2 でない'];
    const bad = []; const names = [];
    for (const p of arms) {
      const S = p.statDom || {}, b = p.body || {};
      if (!b.weaponName) { bad.push(p.label + ' ⛔ 供給口の weaponName が無い'); continue; }
      names.push(b.weaponName);
      if (!S.weapon || S.weapon.v !== b.weaponName) bad.push(p.label + ' 武器 ' + (S.weapon ? S.weapon.v : '無') + '≠' + b.weaponName);
      const w = (b.atkBonus >= 0 ? '+' : '') + b.atkBonus;
      if (!S.atkBonus || S.atkBonus.v !== w) bad.push(p.label + ' 命中 ' + (S.atkBonus ? S.atkBonus.v : '無') + '≠' + w);
      if (!S.damage || !S.damage.v || S.damage.v.indexOf(b.dmgDice) < 0)
        bad.push(p.label + ' ダメージ ' + (S.damage ? S.damage.v : '無') + ' に ' + b.dmgDice + ' が無い');
    }
    const distinct = names.length === 2 && names[0] !== names[1];
    return [bad.length === 0 && distinct,
      arms.map((p, i) => p.label + ':' + names[i]).join('  ')
      + (distinct ? '' : '  ⛔ 母集団ガード: 2 本の腕で武器が同じだと固定文字列でも通る')
      + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
  }],
  ['8f', '★#36 受動知覚 = 10 + SkillCheck.checkScore(知覚) / 習熟ボーナスも 2 経路 (index / tavern)', (M) => {
    const P = M.pages || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let withSC = 0, withoutSC = 0;
    for (const p of P) {
      const S = p.statDom || {};
      if (p.hasSkillCheck) {
        withSC++;
        if (typeof p.passiveExpect !== 'number') { bad.push(p.label + ' ⛔ 期待値が採れない'); continue; }
        if (!S.passivePerception || S.passivePerception.v !== String(p.passiveExpect))
          bad.push(p.label + ' 受動知覚 ' + (S.passivePerception ? S.passivePerception.v : '無') + '≠' + p.passiveExpect);
        const pb = (p.profBonusExpect >= 0 ? '+' : '') + p.profBonusExpect;
        if (!S.profBonus || S.profBonus.v !== pb)
          bad.push(p.label + ' 習熟 ' + (S.profBonus ? S.profBonus.v : '無') + '≠' + pb);
      } else {
        withoutSC++;
        if (S.passivePerception) bad.push(p.label + ' ⛔ SkillCheck が無いのに受動知覚が出ている');
        if (S.profBonus) bad.push(p.label + ' ⛔ SkillCheck が無いのに習熟ボーナスが出ている');
      }
    }
    return [bad.length === 0 && withSC === 2 && withoutSC === 3,
      P.filter(p => p.hasSkillCheck).map(p => p.label + ':受動知覚 '
        + (((p.statDom || {}).passivePerception || {}).v) + ' (期待 ' + p.passiveExpect + ')').join('  ')
      + '  SkillCheck 無し ' + withoutSC + ' 枚は習熟の区画ごと伏せる'
      + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' / ') : '')];
  }],

  // ══ ★#36 §9 恒等 (撤退路) ════════════════════════════════════════════
  ['9a', '★#36 ?sheet5e=0 の 5 ページで pageerror ゼロ', (M) => {
    const R = M.retreat5e || [];
    if (R.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = R.filter(p => (p.errs || []).length || p.status !== 200);
    return [bad.length === 0,
      '測ったページロード ' + R.length + ' 回  pageerror ' + R.reduce((n, p) => n + (p.errs || []).length, 0) + ' 件'
      + (bad.length ? '  ⛔ ' + bad.map(p => p.label + ':' + ((p.errs || [])[0] || p.status)).join(' / ') : '')];
  }],
  ['9b', '★#36 ?sheet5e=0 でもシートの開閉で localStorage のキーが 0 本増えない', (M) => {
    const R = M.retreat5e || [];
    if (R.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = R.filter(p => !deepEq(p.lsBefore || [], p.lsAfter || []));
    return [bad.length === 0,
      R.map(p => p.label + ':' + (p.lsBefore || []).length + '→' + (p.lsAfter || []).length + '本').join(' ')
      + (bad.length ? '  ⛔ 増減した: ' + bad.map(p => p.label).join(',') : '')];
  }],
  ['9c', '★#36 ?sheet5e=0 でも既存 HUD の矩形が 1px も動かない', (M) => {
    const R = M.retreat5e || [];
    if (R.length !== 5) return [false, '⛔ 母集団が 5 でない'];
    const bad = []; let n = 0;
    for (const p of R) for (const id of HUD_IDS) {
      if (!p.hudBefore || !p.hudBefore[id]) continue;
      n++;
      if (!deepEq(p.hudBefore[id], (p.hudOpen || {})[id]) || !deepEq(p.hudBefore[id], (p.hudClosed || {})[id]))
        bad.push(p.label + '/' + id);
    }
    return [bad.length === 0 && n >= 3, '測った HUD ' + n + ' 件 — 開く前 / 開いている間 / 閉じた後 の 3 点比較'
      + (n >= 3 ? '' : '  ⛔ 母集団が小さすぎる')
      + (bad.length ? '  ⛔ 動いた: ' + bad.join(',') : '')];
  }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* ══ まだ測れない受入条件 (依頼書 §9 そのまま) ══════════════════════════════
 *  ⭐ 項目 1 は HTML を 1 枚も触らないので、5 ページに <script src> がまだ無い。
 *    → 実ページを開いて測る条件は **全部 PENDING**。理由を必ず添える。
 *  ⛔ 「測れないから消す」も「測れないけど緑にする」も禁止。 */
/* ⭐ 項目 2 で 5 枚へ <script src> を入れたので、この理由を使う PENDING はもう無い。
   定数だけ残す (項目 3/4 が同じ罠を再利用しないように、使わなくなったことを明記する)。 */
const HTML_YET = '(未使用) 実ページへの <script src> は項目 2 で完了した';
/* ⭐ 項目 3 で §3 の 5 本 (3a〜3e) を実装したので、受入条件側の PENDING は 0 件になった。
   残る PENDING は `--negative` の変異 7 本だけ (= 項目 4 の担当)。
   ⛔ この器を消さないこと。項目 4 が変異を実装するまでは「空でも在る」ことに意味がある。 */
/* ⚠⚠⚠ #36 項目 1: 区画は 11 になったが **描くのは項目 2 の担当**。
   よって「11 区画が実ページに出る」ことを前提にする節は 1 つも測れない。
   ⛔ 測れないものを緑にしない。項目 3 が全部埋めて PENDING 0 にする。 */
/* ⭐ #36 項目 3 で §6〜§9 の 20 件をすべて実装した。受入条件側の PENDING は 0 件。
   残る PENDING は `--negative` の変異だけ (= 項目 4 の担当)。
   ⛔ この器を消さないこと。「測れないものは緑にしない」経路そのものなので、
      次のチケットが同じ形で使えるように空でも残す。 */
const PENDING_OF = {};

const SECTIONS = [
  ['§0 装置 — 共有モジュール単体の契約 (項目 1 で測れる分)',
    ['0s1', '0s2', '0d', '0s3', '0s4', '0s5', '0s6', '0s7', '0s8', '0s9', '0s10', '0s11', '0s12', '0s13',
     '0s14', '0s15']],
  ['§0 装置 — 実ページの母集団 (5 枚)', ['0a', '0b', '0c']],
  ['§1 呼び出し口 — 3 経路 (キュー訂正版)', ['1a', '1b', '1c']],
  ['§2 中身 — 能力値 / 技能 / 伏せた区画', ['2a', '2b', '2c', '2d']],
  ['§3 言語 — 選択 UI と保存', ['3a', '3b', '3c', '3d', '3e']],
  ['§4 恒等 — 非退行', ['4a', '4b', '4c', '4d']],
  ['§5 撤退 — ?sheet=0', ['5a', '5b']],
  ['§6 空欄枠 — 宣言した空欄と「取れなかった区画」を混同していない (#36)', ['6a', '6b', '6c', '6d']],
  ['§7 5E の体裁 — 3 段組と縦積み (#36)', ['7a', '7b', '7c', '7d', '7e']],
  ['§8 数字の出所 — 2 経路の突き合わせ (#36)', ['8a', '8b', '8c', '8d', '8e', '8f']],
  ['§9 恒等 — 撤退 ?sheet5e=0 の非退行 (#36)', ['9a', '9b', '9c']],
];

function emit(id, M) {
  if (PENDING_OF[id]) { pending('(' + id + ') ' + PENDING_OF[id][0], PENDING_OF[id][1]); return; }
  const a = ASSERT_OF[id];
  if (!a) { check('(' + id + ') ⛔ 未定義の assert', false); return; }
  let r;
  try { r = a[2](M); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_player_sheet — プレイヤーシート v1 + 言語 (依頼書 #29 §9) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT
    + '  変異 実装 ' + MUT_IMPL.length + ' / 宣言 ' + MUT_ORDER.length
    + (NEGATIVE && MUT_IMPL.length ? '  変異ポート=' + MUT_IMPL.map(k => k + ':' + PORT_OF[k]).join(' ') : ''));

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_sheet_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /**
   * 1 ポート分を丸ごと測る。want で「要る測定だけ」に絞る (変異ごとの時短)。
   * @param {object|null} popts probeRealPage へ渡す装置側のオプション。
   *   ⭐ 変異 closedread はここに { skipOpen: true } を渡して「開かずに採る」経路を通す
   *     (ファイル置換ではなく装置の変異)。
   */
  async function measureAll(port, mutKey, want, popts) {
    const base = 'http://localhost:' + port;
    const m = {};
    m.sheetSrc = servedSrc(mutKey, SHEET_JS);
    m.indexSrc = servedSrc(mutKey, INDEX_HTML);
    m.xpSheet  = parseXpThresholds(m.sheetSrc);
    m.xpIndex  = parseXpThresholds(m.indexSrc);
    m.mod    = (!want || want.mod)    ? await probeModule(browser, base, '')  : { has: false, errs: [] };
    m.off    = (!want || want.off)    ? await probeRetreat(browser, base)     : null;
    m.labels = (!want || want.labels) ? await probeLabels(browser, base)      : null;
    m.nolang = (!want || want.nolang) ? await probeNoLangKey(browser, base)   : null;

    /* ── 実ページ (項目 2) ─────────────────────────────────────
     *  ⭐ 素 5 枚 + ?ability5e=0 の 5 枚 + ?sheet=0 の 5 枚 + 町 compact 1 枚 = 16 ロード。
     *  ⚠ index.html は重いので、変異ごとに全部測ると時間が爆発する。
     *    項目 4 で変異を実装するときは want で必要な分だけに絞ること。 */
    const PO = popts || null;
    m.pages = [];
    if (!want || want.pages) {
      for (const spec of PAGE_MATRIX) m.pages.push(await probeRealPage(browser, base, spec, '', PO));
    }
    m.townCompact = (!want || want.pages) ? await probeRealPage(browser, base, TOWN_COMPACT, '', PO) : null;
    m.pagesBX = [];
    if (!want || want.pagesBX) {
      for (const spec of PAGE_MATRIX) m.pagesBX.push(await probeRealPage(browser, base, spec, '?ability5e=0', PO));
    }
    m.retreat = [];
    if (!want || want.retreat) {
      for (const spec of PAGE_MATRIX) m.retreat.push(await probeRetreatPage(browser, base, spec));
    }

    /* ── ★#36 §7〜§9 ────────────────────────────────────────────────
     *  retreat5e … ?sheet5e=0 の 5 枚。⭐ 撤退路は「付ければ #29 の姿へ戻る」まで機械証明する。
     *  widths    … index を 1 ロードして 3 幅ぶん測る。
     *  numHead / numAlly … 頭が主人公 (warrior) / 頭が NPC (主人公 mage) の 2 本の腕。
     *    ⚠ 編成を決めているのは **sessionStorage** なので、そちらにも種を撒く。 */
    m.retreat5e = [];
    if (!want || want.retreat5e) {
      for (const spec of PAGE_MATRIX) m.retreat5e.push(await probeRealPage(browser, base, spec, '?sheet5e=0', PO));
    }
    m.widths = (!want || want.widths) ? await probeWidths(browser, base, 'index.html') : null;
    m.numHead = null; m.numAlly = null;
    if (!want || want.numbers) {
      m.numHead = await probeRealPage(browser, base, PAGE_MATRIX[0], '', Object.assign({}, PO, heroSeed('warrior')));
      if (m.numHead) m.numHead.label = 'index(頭=主人公 warrior)';
      m.numAlly = await probeRealPage(browser, base, PAGE_MATRIX[0], '', Object.assign({}, PO, heroSeed('mage')));
      if (m.numAlly) m.numAlly.label = 'index(頭=NPC / 主人公 mage)';
    }

    /* ── §3 言語: title.html の名乗りフロー (項目 3) ────────────────────
     *  ⭐ langPick = 1 ページロードで 6 職を回る (職替えが (3e) の手順そのもの) + ?sheet=0 の 1 枚。
     *  ⭐ departs = 実際に出発して行き先で localStorage とシートを読む。
     *    dwarf (固定 2 / picks 1) と rogue (固定 1 / picks 2) の 2 職で、
     *    「固定分と選択分が両方ある」母集団を作る (どちらかが 0 だと (3c) が自明になる)。
     *  ⚠ 変異ごとに全部やると時間が爆発するので want.title で絞れるようにしてある。 */
    m.langPick  = (!want || want.title) ? await probeTitleLangPick(browser, base) : null;
    m.departs   = [];
    m.departOff = null;
    if (!want || want.title) {
      for (const k of ['dwarf', 'rogue']) m.departs.push(await probeTitleDepart(browser, base, k, false));
      m.departOff = await probeTitleDepart(browser, base, 'dwarf', true);   // (4d) の比較アーム
    }
    return m;
  }

  try {
    mark('装置 — 変異アンカーが 1 箇所にヒットするか');
    if (!MUT_IMPL.length) {
      console.log('  (実装済みの変異が 0 本 — 項目 1 の設計どおり。--negative で PENDING 一覧が出る)');
    }
    for (const k of MUT_IMPL) {
      check('(0m-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' の 1 箇所にヒットする',
        !!MUT_SRC[k] || !!MUTATIONS[k].driverSide,
        MUTATIONS[k].driverSide ? '装置側の変異 (ファイル置換なし)'
          : '置換 ' + MUTATIONS[k].from.length + ' → ' + MUTATIONS[k].to.length + ' bytes');
    }

    mark('測定 — モジュール単体 / 撤退 / 表示名 / 言語キー無し');
    /* ⭐ --mutate <k> の単体診断でも装置側の変異 (closedread) が効くように popts を渡す。
       ここだけ null にすると「closedread を単体で当てても全部緑」= 診断が嘘をつく。 */
    const M = await measureAll(PORT, MUTATE, null,
      MUTATE ? (MUTATIONS[MUTATE].probeOpts || null) : null);
    console.log('[drv]   DFSheet=' + (M.mod.has ? '有り' : '⛔無し')
      + '  言語 ' + ((M.mod.languages || []).length) + ' 件'
      + '  職 ' + Object.keys(M.mod.classLang || {}).length
      + '  区画 ' + ((M.mod.sectionIds || []).length) + ' 件'
      + '  XP_THRESHOLDS sheet=' + JSON.stringify(M.xpSheet));
    if ((M.mod.errs || []).length) console.log('[drv]   ⚠ スタブの pageerror: ' + M.mod.errs.slice(0, 3).join(' | '));

    for (const sec of SECTIONS) { mark(sec[0]); for (const id of sec[1]) emit(id, M); }

    /* ── 負のコントロール ──────────────────────────────────────────────────
     *  ⭐ 各変異について「赤くなるべき節」が実際に赤くなったかを数える。
     *    赤くならなかった変異が 1 本でもあれば **空振り** = exit 1。
     *  ⚠ 項目 1 では 7 本すべて未実装なので、ここは PENDING の一覧になる。 */
    if (NEGATIVE) {
      for (const k of MUT_IMPL) {
        const mu = MUTATIONS[k];
        mark('負のコントロール — 変異 ' + k + ' → (' + mu.targets.join(')(') + ') が赤くなる');
        const ev = mu.evaluable || [];
        /* ⚠ want で測定を絞る = 時短だが、**測っていない節を evaluable に載せない**こと。
           母集団 0 の述語は一律 false を返すので「偽の赤」= 空振りの見逃しになる。 */
        const mm = await measureAll(PORT_OF[k], k, mu.want || null, mu.probeOpts || null);
        const res = {};
        for (const id of ev) {
          try { res[id] = ASSERT_OF[id][2](mm); }
          catch (e) { res[id] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const id of mu.targets) {
          const r = res[id] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + id + ') 変異 ' + k + ' で (' + id + ') が赤くなる',
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = ev.filter(id => res[id][0] === false);
        const extra = red.filter(id => mu.targets.indexOf(id) < 0);
        const unexpected = extra.filter(id => (mu.allowRed || []).indexOf(id) < 0);
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (見た節=' + ev.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)') + '  担当=' + mu.targets.join(',')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : ''));
      }
      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (完了条件 = ここが 0 件 / 項目 4 の担当)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('')
            + ' が赤くなる  [' + (MUTATIONS[k].file || '装置側') + ']', MUTATIONS[k].why);
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, (e && e.message) + '\n' + ((e && e.stack) || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend   = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length
    + (NEGATIVE ? '   [負のコントロール]' : (MUTATE ? '   [変異 ' + MUTATE + ']' : '')));
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (項目 2〜4 で埋める):');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
