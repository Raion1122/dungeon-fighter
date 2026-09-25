#!/usr/bin/env node
/*
 * verify_pen_narration.js — 実装依頼書 #73「語りをペンの音へ」の受入ドライバ (依頼書 §8 を §12-0 / §12-0b / §12-3 / §12-4 で読み替え)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_pen_narration.js                          # 素 (全ユニット)
 *   node tools/verify_pen_narration.js --negative               # 変異 9 本 (port 10442〜10450)。先に素の基準を走らせる
 *   node tools/verify_pen_narration.js --negative --only durleak,uiroute
 *   node tools/verify_pen_narration.js --mutate durleak         # 変異 1 本を載せて全ユニットを手回し (担当表を実走で決める用)
 *   node tools/verify_pen_narration.js --units WAVE,PARTS       # 素の一部だけ (デバッグ用。判定は走ったユニットの分だけ出る)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足・例外 / 3=変異アンカーの腐敗
 *
 * ■ 方針 — 「声が鳴らない」を 2 経路 (ネットワークに mp3 の要求が出ない / 声の長さが 0 として扱われる) で、
 *   「ペンの音になった」を 2 経路 (オフライン描画の波形 / ページ内で実際に作られる音の部品と出口のバス) で突き合わせる。
 *   素の腕 = 撤退スイッチなし / off の腕 = ?penvoice=0 (audio.js の PEN_NARRATION。逐語 get("penvoice") が 1 箇所)。
 *
 * ■ ユニット
 *   META     … 配信物を http で読む: (0b) 声 id の導出 / (0c) sfx-manifest.json に narration が無い / (0d) get("penvoice") が 1 箇所 / (0e) 変異アンカー
 *   NARR_IDX … index.html を **?autoplay 無し** で開き、開始の関門「▶ クリックして物語を始める」をクリックで越え、導入の語り (4 段落) を
 *               250ms 毎のクリックで送る (素 / off の 2 腕)。⚠ ?autoplay は声の経路を丸ごと迂回する (依頼書 §2-6 罠3)
 *   NARR_TAV … tavern.html を直に開き (⛔ openPrep を経由しない)、A = 酒場の前口上 (initTavernPrologue・関門あり・クリック送りの口が
 *               元から無い = 2.5 秒の自動送りのみ) → B = 依頼人の語り playQuestAcceptNarration(goblin-mine) (quest_dialog_*・クリック送りあり)
 *   PARTS    … index / tavern × 素 / off を開いて GameAudio.playSfx("narration") を 1 回: 部品 (BufferSource / Oscillator) と出口のバス /
 *               設定モーダルのつまみ (名前と、動かすと GameSettings.voice が変わるか)
 *   WAVE     … 軽量ページ (audio.js だけを読む) で __renderSfxOffline を固定種で描く: (2a) 波形 / (4a) off の narration が 0e8370d と一致 /
 *               (4b) narration 以外の全レシピが 0e8370d と一致 (許容 1e-6・自己比較の揺れも実測して併記)
 *
 * ■ 測っているもの (依頼書 §12-4 の表が正)
 *   §0 (0a) off の腕で manifest が読まれ、実在 id で getVoiceDuration > 0・ページが描けた (document.title / 開始の関門)
 *      (0b) 期待する id は assets/voice/manifest.json から導出 (⛔ 写経しない)。導入 / 前口上 / 依頼人の 3 群が 1 件以上・file と durationSec を持つ
 *      (0c) 配信された assets/sfx/sfx-manifest.json に narration キーが無い (あれば playSampled が合成レシピより先に鳴る = 罠5)
 *      (0d) 配信された audio.js に逐語 get("penvoice") がちょうど 1 箇所 (⛔ 語 penvoice の件数で数えない)
 *      (0e) 変異 9 本の注入点が原本でちょうど 1 箇所  (0f) 開いたページが全部起動し pageerror 0
 *   §1 (1a) 声の mp3 (クリップ) の要求: 素 = 0 件 (導入 + 前口上 + 依頼人) / off = 導入・前口上・依頼人のそれぞれで 1 件以上
 *      (1a') manifest.json の要求: 素 = 0 件 (loadVoiceManifest の呼び口は通った上で) / off = 1 件以上   ⭐ mp3 と manifest を分けて数える
 *      (1b) manifest の id で getVoiceDuration(id) === 0 (素) / > 0 (off)
 *      (1c) ⭐ 罠1: **全段落** のヒントが「クリックで続ける」・「♪ 語りに耳をかたむけよう…」が一度も出ない (文字列が主) /
 *           クリック送りの口がある語り (導入・依頼人) は全段落で打ち終わり → 次段落 < 1000ms、前口上は 2000〜3200ms (自動送り) (秒数は従) /
 *           段落数 = 導出 id 数 / off は全段落が「♪ 語りに耳をかたむけよう…」
 *      (1d) ⭐ 罠2 (構造で測る): 開始のクリック後、1 文字目が出た時点で mp3 の要求 0 件 (素・事前読み込みの口 index:導入 / tavern:前口上 に到達した上で) /
 *           off は同じ時点で 1 件以上 (= 事前読み込みが本当に走る)。⛔ 秒数では測らない (localhost では 43ms vs 34ms で差が出ない = 永久緑)
 *   §2 (2a) 波形 (mulberry32 固定種): 素 = 200 種すべてゼロ交差率 > 0.08 かつ振幅の山 = 3 / off = ゼロ交差率 0.0399±0.004 かつ山 = 1
 *      (2b) playSfx("narration") 1 回で 素 = BufferSource 3・Oscillator 0 / off = Oscillator 1・BufferSource 0 (index / tavern の実ページ)
 *      (2c) その出口: 素 = 3 画すべて voice バス / off = ui バス (Gain の名前付けの装置: master→destination / bgm→master / voice→master を確認)
 *   §3 (3a) 設定モーダル: 素 = 「語り 音量」あり・「ボイス音量」なし / off = 逆 (index / tavern の実ページ)
 *      (3b) そのつまみを動かすと GameSettings.get().voice が変わり、他の音量は変わらない
 *   §4 (4a) off の narration が 0e8370d の audio.js (git show で配信スナップショットへ) と **サンプル単位で完全一致** (差 0・2 種)・無音でない
 *      (4b) narration 以外の全レシピが両版で最大差 ≤ 1e-6 (素・off 両腕 / 2 種)。⚠ 厳密一致にできない = Chrome のオフライン描画は
 *           同じ版・同じ種の自己比較でも多音源レシピが ~6e-8 揺れる ⇒ 自己比較の揺れも同じ走行で実測して併記・同じ許容で縛る
 *   §5 (5a) index?penvoice=0 / tavern?penvoice=0 (+ 軽量ページ off) で §1〜§3 の従来側の期待が全部成り立つ
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。変異は **配信スナップショットをメモリ上で差し替える** (⛔ 本番ファイルは 1 バイトも触らない)。
 *     audio.js / sfx-manifest.json は起動時に 1 回だけ読んで凍結 (走行中に別窓が保存しても混合ビルドにならない)。
 *   - 旧版 = git show 0e8370d:audio.js を /__old/audio.js で配る (0e8370d と 59fce15 と fd67cfe の audio.js は同じ blob b3aaa1fd…)。
 *   - バスの特定: evaluateOnNewDocument で AudioContext の createGain / AudioNode.prototype.connect を包み、最初の 5 個の Gain に
 *     master / bgm / sfx / ui / voice の名前を付ける (audio.js の buildBuses の順)。⛔ 検証用の読み取り口を audio.js に足さない。
 *   - ⭐ 観測先は測る直前に空へ戻し、本番の口にだけ書かせる (「呼ばれた / 在る」で緑にしない)。
 *   - 腕ごとに別の BrowserContext (localStorage / sessionStorage が混ざらない。前口上は prologueSeen が無いときだけ語られる)。
 *   - Chrome は --autoplay-policy=no-user-gesture-required (AudioContext が suspended にならない)。
 *   - ⛔ このドライバを timeout コマンドで包まない (打ち切ると node が孤児としてポートを掴む)。
 *   - 後始末はこのドライバが起動したもの (内蔵 http サーバとこのブラウザ・プロファイル) だけ。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *
 * ■ ポート = **10441** (素) / 変異 **10442〜10450** (9 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-09-25 この機械の実測) = 素 約 170 秒 (19 assert・前口上の自動送り 47 秒 / 声ペース 62 秒が大半) /
 *   --negative 約 912 秒 (素の基準 170 秒 + 変異 9 本。声が戻る変異 3 本は各 約 230 秒)。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10441'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const UNITS_ARG = (arg('units', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCEN = 'goblin-mine';     // 導入の語り (index) と依頼人の語り (tavern) の舞台。声 id は manifest から導出する
const OLD_REV = '0e8370d';      // 着手前の audio.js (依頼書 §8 (4a))
const HINT_VOICE = '\u266a \u8a9e\u308a\u306b\u8033\u3092\u304b\u305f\u3080\u3051\u3088\u3046\u2026';   // ♪ 語りに耳をかたむけよう…
const HINT_TEXT = '\u30af\u30ea\u30c3\u30af\u3067\u7d9a\u3051\u308b';                                    // クリックで続ける
const HINT_BEGIN = '\u25b6 \u30af\u30ea\u30c3\u30af\u3057\u3066\u7269\u8a9e\u3092\u59cb\u3081\u308b';   // ▶ クリックして物語を始める
const LABEL_PEN = '\u8a9e\u308a \u97f3\u91cf';        // 語り 音量
const LABEL_VOICE = '\u30dc\u30a4\u30b9\u97f3\u91cf'; // ボイス音量
const ZCR_SINE = 2 * 880 / 44100;     // 880Hz 正弦のゼロ交差率 (物理で決まる) = 0.0399
const ZCR_NOISE_MIN = 0.08;           // 素の閾値 (項目2b 実測: 素 0.158〜0.198 / 200 種・off 0.03986 ⇒ 余裕約 2 倍)
const WAVE_SEEDS_ON = 200;            // (2a) 素の種の数 (項目2b で山の数え方を決めた 200 種と同じ 1..200)
const WAVE_SEEDS_OFF = 5;
const EQ_SEEDS = [7, 12345];          // (4a)(4b) の種
const EQ_TOL = 1e-6;                  // (4b) の許容 (自己比較の揺れ ~6e-8 の約 17 倍)

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_AUDIO = 'audio.js';
const F_SFXMAN = 'assets/sfx/sfx-manifest.json';
const PRISTINE = {};
PRISTINE[F_AUDIO] = fs.readFileSync(path.join(ROOT, F_AUDIO), 'utf8');
PRISTINE[F_SFXMAN] = fs.readFileSync(path.join(ROOT, F_SFXMAN), 'utf8');
let OLD_AUDIO = null, BLOBS = '';
try {
  OLD_AUDIO = cp.execFileSync('git', ['show', OLD_REV + ':audio.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  BLOBS = cp.execFileSync('git', ['rev-parse', OLD_REV + ':audio.js', 'HEAD:audio.js'], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\s+/).join(' / ');
} catch (e) {
  console.error('[vpn] git show ' + OLD_REV + ':audio.js に失敗 (旧版の基準が取れない): ' + ((e && e.message) || e)); process.exit(2);
}
const LIGHT_HTML = (src) => '<!doctype html><html><head><meta charset="utf-8"><title>pen73 light</title></head><body><script src="' + src + '"></script></body></html>';

/* 声 id の導出 (⛔ 写経しない)。assets/voice/manifest.json は配信物をそのまま (変異しない)。 */
const VOICE_MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/voice/manifest.json'), 'utf8'));
const idsWith = (p) => Object.keys(VOICE_MAN).filter((k) => k.indexOf(p) === 0 && /^\d+$/.test(k.slice(p.length)))
  .sort((a, b) => (+a.slice(p.length)) - (+b.slice(p.length)));
const IDS = {
  intro: idsWith('dungeon_intro_' + SCEN + '_'),       // index.html 導入 (voicePrefix = "dungeon_intro_" + scenarioId)
  prologue: idsWith('dungeon_intro_prologue_'),        // tavern.html 前口上
  quest: idsWith('quest_dialog_' + SCEN + '_'),        // tavern.html 依頼人の語り
};

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (負のコントロール)
 *   file の edits[] = { from: 原本にちょうど 1 箇所ある逐語 (1 行の中), to: 置き換え }。
 *   ⚠⚠⚠ 逐語は #73 実装後 (HEAD 1df0eca・audio.js は 2f31ce6 の姿) で取り直したもの。依頼書 §8 の逐語 (0e8370d) は使っていない。
 *   ⭐ 撤退スイッチで分岐する形にしてある (PEN_NARRATION を見る) ⇒ off の腕は変異の影響を受けない = 恒等を壊さない。
 *   json = 配信スナップショットの JSON を変換する変異 (sampledpen)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const GATE_FROM = 'if (PEN_NARRATION) return;   // #73 manifest を読まない';
const GATE_TO = '/* ★変異: loadVoiceManifest の関門を外す */   // #73 manifest を読まない';
const MUTATIONS = {
  /* 関門を外す = 声が丸ごと戻る。 */
  manifestleak: { units: ['NARR_IDX', 'NARR_TAV'], files: { 'audio.js': [
    { from: GATE_FROM, to: GATE_TO }] } },
  /* ⭐ 罠1: 関門を外し、代わりに playVoiceClip と preloadVoiceClips だけ止める (getVoiceDuration は生かす) = 無音のまま声ペースで固まる。 */
  durleak: { units: ['NARR_IDX', 'NARR_TAV'], files: { 'audio.js': [
    { from: GATE_FROM, to: GATE_TO },
    { from: 'function playVoiceClip(id) {', to: 'function playVoiceClip(id) { if (PEN_NARRATION) return;   /* ★変異durleak */' },
    { from: 'function preloadVoiceClips(ids) {', to: 'function preloadVoiceClips(ids) { if (PEN_NARRATION) return Promise.resolve();   /* ★変異durleak */' }] } },
  /* 罠2: 関門を外し、playVoiceClip と getVoiceDuration だけ止める = 事前読み込みだけが mp3 を取りに行く。 */
  preloadleak: { units: ['NARR_IDX', 'NARR_TAV'], files: { 'audio.js': [
    { from: GATE_FROM, to: GATE_TO },
    { from: 'function playVoiceClip(id) {', to: 'function playVoiceClip(id) { if (PEN_NARRATION) return;   /* ★変異preloadleak */' },
    { from: 'function getVoiceDuration(id) {', to: 'function getVoiceDuration(id) { if (PEN_NARRATION) return 0;   /* ★変異preloadleak */' }] } },
  /* 素の腕でも従来の正弦を鳴らす。 */
  blipback: { units: ['PARTS', 'WAVE'], files: { 'audio.js': [
    { from: 'if (PEN_NARRATION) { penStrokes(c, d, t); return; }', to: '/* ★変異blipback: 素でも従来の正弦 */' }] } },
  /* ペンの音の出口を ui バスへ戻す。 */
  uiroute: { units: ['PARTS'], files: { 'audio.js': [
    { from: 'var route = (PEN_NARRATION && name === "narration") ? buses.voice : (isUi ? buses.ui : buses.sfx);',
      to: 'var route = (isUi ? buses.ui : buses.sfx);   /* ★変異uiroute */' }] } },
  /* つまみの名前を「ボイス音量」のままにする。 */
  sliderdead: { units: ['PARTS'], files: { 'audio.js': [
    { from: 'volRow(PEN_NARRATION ? "語り 音量" : "ボイス音量",', to: 'volRow("ボイス音量" /* ★変異sliderdead */,' }] } },
  /* 従来のレシピの freq を 880 → 881 (off の腕だけが通る行)。 */
  oldchanged: { units: ['WAVE'], files: { 'audio.js': [
    { from: 'tone(c, d, t, { type: "sine", freq: 880, dur: 0.012, peak: 0.05, a: 0.001 });   // 従来',
      to: 'tone(c, d, t, { type: "sine", freq: 881, dur: 0.012, peak: 0.05, a: 0.001 });   /* ★変異oldchanged */ // 従来' }] } },
  /* 罠5: sfx-manifest.json に narration の録音素材を足す (配信スナップショット上で・ui_tap の定義を写す)。 */
  sampledpen: { units: ['PARTS'], json: { file: F_SFXMAN, copyFrom: 'ui_tap', key: 'narration' } },
  /* 撤退スイッチを常に真にする (逐語 get("penvoice") は残す)。 */
  switchdead: { units: ['NARR_IDX', 'NARR_TAV', 'PARTS', 'WAVE'], files: { 'audio.js': [
    { from: 'return new URLSearchParams(global.location.search).get("penvoice") !== "0";',
      to: 'return (new URLSearchParams(global.location.search).get("penvoice") !== "0") || true;   /* ★変異switchdead */' }] } },
};
/* 変異 → 赤くなるべき assert (担当) / 緑のままであるべき assert。⚠⚠⚠ 机上で書かない。--mutate <key> で **全ユニット** を
 * 1 本ずつ実走し、実際に赤くなった集合を見て決めた (2026-09-25・HEAD 1df0eca の上。依頼書 §12-4 の担当表):
 *   manifestleak … (1a)(1a')(1b)(1c)(1d)          durleak … (1a')(1b)(1c)  ⭐ (1a) は緑のまま (mp3 は取りに行かない)
 *   preloadleak  … (1a)(1a')(1d)  ⭐ (1b)(1c) は緑のまま (尺 0 = テキストペースへ落ちる)
 *   blipback     … (2a)(2b)(2c)(4a)  ⚠ (2c) = 画が 1 つ ["voice"] しか出ない / (4a) = 対照「素は旧版と異なる」が崩れる
 *   uiroute … (2c)   sliderdead … (3a)   oldchanged … (4a)
 *   sampledpen   … (0c)(2b)(2c) (+ 全ユニットなら (5a))  ⭐ 実ページは sfx-manifest を先読みするので録音素材が実際に鳴る (bs1・ui バス) = 番人 (0c) だけでなく挙動でも赤
 *   switchdead   … (0a)(1a)(1a')(1b)(1c)(1d)(2a)(2b)(2c)(3a)(4a)(5a)  ⭐ off の腕を持つ assert が総崩れ ((3b) はつまみが両腕とも生きているので緑)
 * --negative では変異ごとに units だけを走らせ、その units で出る赤を担当にした (units に無い assert は出ない = 担当に入れない)。 */
const NEG_EXPECT = {
  manifestleak: ['(1a)', "(1a')", '(1b)', '(1c)', '(1d)'],
  durleak:      ["(1a')", '(1b)', '(1c)'],
  preloadleak:  ['(1a)', "(1a')", '(1d)'],
  blipback:     ['(2a)', '(2b)', '(2c)', '(4a)'],
  uiroute:      ['(2c)'],
  sliderdead:   ['(3a)'],
  oldchanged:   ['(4a)'],
  sampledpen:   ['(0c)', '(2b)', '(2c)'],
  switchdead:   ['(0a)', '(1a)', "(1a')", '(1b)', '(1c)', '(1d)', '(2a)', '(2b)', '(2c)', '(3a)', '(4a)', '(5a)'],
};
/* ⭐ 担当が絞られていることの番人: この assert が赤くなったら「変異の作りが間違っている」(依頼書 §8 の durleak の注記)。 */
const NEG_GREEN = {
  durleak: ['(1a)'],
  preloadleak: ['(1b)', '(1c)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 9) { console.error('[vpn] 変異は 9 本まで (ポート 10442〜10450)'); process.exit(3); }
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[vpn] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3);
}
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) {
  console.error('[vpn] 未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3);
}

/* ── (0e) 変異アンカーの起動時検算 — **手つかずの原本** に対して数える (同じ逐語を共有する変異があるので変異後のバッファでは数えない) ── */
function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
function auditMutation(key) {
  const m = MUTATIONS[key]; const rows = [];
  for (const f of Object.keys(m.files || {})) {
    for (const e of m.files[f]) {
      const n = countOf(PRISTINE[f], e.from);
      const lineNo = n === 1 ? PRISTINE[f].slice(0, PRISTINE[f].indexOf(e.from)).split('\n').length : null;
      rows.push({ where: f + ':' + lineNo, ok: n === 1 && e.from !== e.to && !/[\r\n]/.test(e.from + e.to), n });
    }
  }
  if (m.json) {
    let ok = false, why = '';
    try {
      const o = JSON.parse(PRISTINE[m.json.file]);
      ok = !Object.prototype.hasOwnProperty.call(o, m.json.key) && !!o[m.json.copyFrom] && Array.isArray(o[m.json.copyFrom].files) && o[m.json.copyFrom].files.length > 0;
      why = 'キー ' + Object.keys(o).length + ' 件 / ' + m.json.key + ' ' + (Object.prototype.hasOwnProperty.call(o, m.json.key) ? '有り' : '無し') + ' / 写し元 ' + m.json.copyFrom + ' ' + (o[m.json.copyFrom] ? '有り' : '無し');
    } catch (e) { why = 'JSON 解析失敗 ' + e.message; }
    rows.push({ where: m.json.file + ' (' + why + ')', ok, n: ok ? 1 : 0 });
  }
  return { key, ok: rows.length > 0 && rows.every((r) => r.ok), rows };
}
const AUDIT = MUT_ORDER.map(auditMutation);
console.log('[vpn] §0e 変異アンカーの検算 (原本・逐語の件数):');
for (const a of AUDIT) console.log('   ' + (a.ok ? 'OK ' : '⛔ ') + a.key.padEnd(12) + ' ' + a.rows.map((r) => r.where + ' ×' + r.n).join(' + '));
const AUDIT_BAD = AUDIT.filter((a) => !a.ok);
if (AUDIT_BAD.length && (NEGATIVE || MUTATE)) {
  console.error('[vpn] ⛔ 変異アンカーが ' + AUDIT_BAD.length + ' 本腐っている (' + AUDIT_BAD.map((a) => a.key).join(',') + ') → 負のコントロールが空振りするので走らせない');
  process.exit(3);
}
const _mutCache = {};
function servedSources(key) {
  if (_mutCache[key || '']) return _mutCache[key || ''];
  const out = {};
  out[F_AUDIO] = PRISTINE[F_AUDIO];
  out[F_SFXMAN] = PRISTINE[F_SFXMAN];
  out['__old/audio.js'] = OLD_AUDIO;
  out['__pen_light.html'] = LIGHT_HTML('audio.js');
  out['__pen_light_old.html'] = LIGHT_HTML('__old/audio.js');
  if (key) {
    const m = MUTATIONS[key];
    for (const f of Object.keys(m.files || {})) {
      let s = PRISTINE[f];
      for (const e of m.files[f]) {
        if (countOf(PRISTINE[f], e.from) !== 1) { console.error('[vpn] ⛔ 変異 ' + key + ' の注入点がちょうど 1 箇所ではない: ' + e.from); process.exit(3); }
        if (countOf(s, e.from) !== 1) { console.error('[vpn] ⛔ 変異 ' + key + ' の注入点が先行の edit に食われた: ' + e.from); process.exit(3); }
        s = s.replace(e.from, () => e.to);
      }
      const d = PRISTINE[f].split('\n').filter((l, i) => l !== s.split('\n')[i]).length;
      if (s.split('\n').length !== PRISTINE[f].split('\n').length || d !== m.files[f].length) {
        console.error('[vpn] ⛔ 変異 ' + key + ' の差し替えが edits の行数に閉じていない (diff=' + d + ')'); process.exit(3);
      }
      out[f] = s;
    }
    if (m.json) {
      const o = JSON.parse(PRISTINE[m.json.file]);
      o[m.json.key] = JSON.parse(JSON.stringify(o[m.json.copyFrom]));
      o[m.json.key].bus = 'ui';
      out[m.json.file] = JSON.stringify(o, null, 2);
    }
  }
  _mutCache[key || ''] = out;
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[vpn] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[vpn] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const srcs = servedSources(mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/tavern.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (Object.prototype.hasOwnProperty.call(srcs, rel)) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
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
function httpGet(port, rel) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/' + rel }, (res) => {
      const bufs = []; res.on('data', (b) => bufs.push(b)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs).toString('utf8') }));
    }).on('error', (e) => resolve({ status: 0, body: '', err: String(e) }));
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側のコード (⛔ ここに判定ロジックを書かない = 生データを採るだけ)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* evaluateOnNewDocument で全ページに入れる。scen があれば index の舞台を固定する (sessionStorage)。 */
function PAGE_PROBES(scen) {
  try { if (scen) sessionStorage.setItem('dragonfighters.currentScenario', scen); } catch (e) {}
  /* 固定種の擬似乱数 (mulberry32)。__seed(n) を呼んだときだけ Math.random を差し替える。 */
  let st = 1;
  const rnd = function () { st |= 0; st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__seed = function (n) { st = n >>> 0; Math.random = rnd; };
  /* 音の部品とバス (AudioContext のみ。OfflineAudioContext は数えない)。 */
  window.__probe = { bs: 0, osc: 0, edges: [], busEdges: [], bus: {} };
  try {
    const AC = window.AudioContext;
    const BAC = window.BaseAudioContext || AC;
    if (AC && BAC) {
      const oBS = BAC.prototype.createBufferSource, oOsc = BAC.prototype.createOscillator, oGain = BAC.prototype.createGain;
      BAC.prototype.createBufferSource = function () { const n = oBS.apply(this, arguments); if (this instanceof AC) window.__probe.bs++; return n; };
      BAC.prototype.createOscillator = function () { const n = oOsc.apply(this, arguments); if (this instanceof AC) window.__probe.osc++; return n; };
      const NAMES = ['master', 'bgm', 'sfx', 'ui', 'voice'];
      let gainCount = 0;
      BAC.prototype.createGain = function () {
        const n = oGain.apply(this, arguments);
        if (this instanceof AC) { if (gainCount < 5) { n.__bus = NAMES[gainCount]; window.__probe.bus[NAMES[gainCount]] = true; } gainCount++; }
        return n;
      };
      const oConn = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dst) {
        try {
          if (this.context instanceof AC) {
            if (this.__bus) window.__probe.busEdges.push(this.__bus + '->' + (dst && dst.__bus ? dst.__bus : (dst === this.context.destination ? 'destination' : 'node')));
            else if (dst && dst.__bus) window.__probe.edges.push(dst.__bus);
          }
        } catch (e) {}
        return oConn.apply(this, arguments);
      };
    }
  } catch (e) {}
  /* 声の API の呼び口 (本体はそのまま通す = 呼ばれたかどうかだけを記録)。 */
  window.__calls = { loadVoiceManifest: 0, preloadVoice: [], playVoice: 0 };
  try {
    let ga;
    Object.defineProperty(window, 'GameAudio', {
      configurable: true,
      get: function () { return ga; },
      set: function (v) {
        ga = v;
        try {
          const wrap = function (name, rec) {
            const orig = v[name];
            if (typeof orig !== 'function') return;
            v[name] = function () { try { rec(Array.prototype.slice.call(arguments)); } catch (e) {} return orig.apply(this, arguments); };
          };
          wrap('loadVoiceManifest', function () { window.__calls.loadVoiceManifest++; });
          wrap('preloadVoice', function (a) { window.__calls.preloadVoice.push((a[0] || []).slice()); });
          wrap('playVoice', function () { window.__calls.playVoice++; });
        } catch (e) {}
      },
    });
  } catch (e) {}
  /* 語りの観測: #dmHint (表示中の文字列) と #dmBody (文字数) を 20ms 毎に変化点だけ記録。 */
  window.__pen = { samples: [], hints: {}, t0: Date.now() };
  setInterval(function () {
    const h = document.getElementById('dmHint');
    const b = document.getElementById('dmBody');
    if (!h || !b) return;
    const hintTxt = (h.textContent || '').trim();
    const shown = h.classList.contains('show');
    const len = (b.textContent || '').length;
    const P = window.__pen, s = P.samples, last = s.length ? s[s.length - 1] : null;
    if (!last || last.hint !== hintTxt || last.shown !== shown || last.len !== len) {
      s.push({ t: Date.now() - P.t0, hint: hintTxt, shown: shown, len: len });
      if (s.length > 8000) s.shift();
    }
    if (shown && hintTxt) { P.hints[hintTxt] = (P.hints[hintTxt] || 0) + 1; }
  }, 20);
}

/* 段落の解析 (node 側)。段落境界 = #dmBody の文字数が減った点。打ち終わり → 次段落の開始 = 保持 (hold)。 */
function paragraphs(samples) {
  const paras = [];
  let cur = { startT: samples.length ? samples[0].t : 0, maxLen: 0, typeEndT: null, hintAtEnd: null };
  for (const s of samples) {
    if (s.len < cur.maxLen) { paras.push(cur); cur = { startT: s.t, maxLen: s.len, typeEndT: null, hintAtEnd: null }; continue; }
    if (s.len > cur.maxLen) { cur.maxLen = s.len; cur.typeEndT = s.t; }
    if (cur.typeEndT !== null && s.shown && s.hint) cur.hintAtEnd = s.hint;
  }
  paras.push(cur);
  const rows = paras.filter((p) => p.maxLen > 0);
  return rows.map((p, i) => ({ len: p.maxLen, hint: p.hintAtEnd, holdMs: (i + 1 < rows.length && p.typeEndT !== null) ? rows[i + 1].startT - p.typeEndT : null }));
}
const isMp3 = (r) => /\.mp3$/i.test(r.u);
const isMan = (r) => /\/assets\/voice\/manifest\.json$/i.test(r.u);

/* 波形の解析 (ページ内で実行するので文字列で渡す。項目2b で 200 種を検証した数え方そのまま)。
 *   ゼロ交差率 = 有効域 (|x| > gmax*1e-3 の最初〜最後) の符号反転 / サンプル。
 *   山 = 5ms 窓 RMS 包絡を両端 0 で挟み、極大が emax の 25% 超を山候補。隣の山との谷が「低い方の山の 50%」を超えたら併合 (プロミネンス)。
 *   ⛔ ヒステリシス (25%/8%) は 200 種中 6 種で 2 と数えるので使わない (項目2b 実測)。 */
const ANALYSE_SRC = String(function analyse(x) {
  let gmax = 0; for (let i = 0; i < x.length; i++) gmax = Math.max(gmax, Math.abs(x[i]));
  const gate = gmax * 1e-3;
  let a = -1, b = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > gate) { if (a < 0) a = i; b = i; }
  let zc = 0, n = 0, prev = 0;
  for (let i = a; i <= b && a >= 0; i++) { const v = x[i]; if (v === 0) continue; if (prev !== 0 && (v > 0) !== (prev > 0)) zc++; prev = v; n++; }
  const W = 220; const env = [];
  for (let i = 0; i + W <= x.length; i += W) { let s = 0; for (let j = i; j < i + W; j++) s += x[j] * x[j]; env.push(Math.sqrt(s / W)); }
  env.unshift(0); env.push(0);
  let emax = 0; for (const e of env) emax = Math.max(emax, e);
  const cand = [];
  for (let i = 1; i < env.length - 1; i++) if (env[i] >= env[i - 1] && env[i] > env[i + 1] && env[i] > 0.25 * emax) cand.push(i);
  const keep = [];
  for (const p of cand) {
    if (!keep.length) { keep.push(p); continue; }
    const q = keep[keep.length - 1]; let v = Infinity; for (let j = q; j <= p; j++) v = Math.min(v, env[j]);
    if (v > 0.5 * Math.min(env[p], env[q])) { if (env[p] > env[q]) keep[keep.length - 1] = p; } else keep.push(p);
  }
  return { zcr: n > 1 ? zc / (n - 1) : 0, peaks: keep.length, gmax: gmax };
});

/* ══════════════════════════════════════════════════════════════════════════════
 * ユニット
 * ══════════════════════════════════════════════════════════════════════════════ */
async function newPage(ctx, tag, scen) {
  const bctx = await ctx.browser.createBrowserContext();
  const page = await bctx.newPage();
  page.__tag = tag; page.__errs = []; page.__bctx = bctx; page.__reqs = []; page.__t0 = Date.now();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => page.__errs.push(String((e && e.message) || e).slice(0, 200)));
  page.on('request', (r) => { const u = r.url(); if (u.indexOf('/assets/voice/') >= 0) page.__reqs.push({ t: Date.now() - page.__t0, u: u.replace(/^https?:\/\/[^/]+/, '') }); });
  await page.evaluateOnNewDocument(PAGE_PROBES, scen || null);
  ctx.pages.push(page);
  return page;
}
async function closePage(ctx, page) {
  const i = ctx.pages.indexOf(page);
  if (i < 0) return;
  ctx.pages.splice(i, 1);
  for (const e of page.__errs.filter((m) => !/favicon/i.test(m))) ctx.errs.push(page.__tag + ' :: ' + e);
  try { await page.__bctx.close(); } catch (e) {}
}
const readSamples = (page) => page.evaluate(() => ({ samples: window.__pen.samples.slice(), hints: Object.assign({}, window.__pen.hints) }));
const resetObs = (page) => page.evaluate(() => { window.__pen.samples = []; window.__pen.hints = {}; });
const readDur = (page, ids) => page.evaluate((ids) => { const r = {}; for (const id of ids) { try { r[id] = window.GameAudio.getVoiceDuration(id); } catch (e) { r[id] = 'ERR'; } } return r; }, ids);

/* 開始の関門を越えて、1 文字目が出た時点の mp3 の要求件数を採る (⭐ 罠2 は構造で測る)。 */
async function passGate(page, kind) {
  await page.waitForFunction((hb) => { const h = document.getElementById('dmHint'); return !!h && h.classList.contains('show') && (h.textContent || '').trim() === hb; },
    { timeout: 45000, polling: 50 }, HINT_BEGIN);
  await sleep(500);   // manifest の非同期読み込みに猶予 (素 / off 両腕で同じ待ち)
  const boot = await page.evaluate(() => ({ title: document.title, ga: !!(window.GameAudio && window.GameSettings) }));
  const g = { gate: true, boot, reqsBeforeGate: page.__reqs.length };
  await resetObs(page);
  const tGate = Date.now();
  if (kind === 'tavern') await page.click('#prologueOverlay'); else await page.mouse.click(640, 400);
  await page.waitForFunction(() => { const b = document.getElementById('dmBody'); return !!b && (b.textContent || '').length >= 1; }, { timeout: 30000, polling: 10 });
  g.firstCharMs = Date.now() - tGate;
  g.mp3AtFirst = page.__reqs.filter(isMp3).length;
  return g;
}

const UNITS = {
  /* 配信物を http で読む (本番ファイルでなく「ページが受け取る物」を見る)。 */
  async META(ctx) {
    const a = await httpGet(ctx.port, F_AUDIO), s = await httpGet(ctx.port, F_SFXMAN);
    let sfx = null; try { sfx = JSON.parse(s.body); } catch (e) {}
    ctx.D.META = { audioStatus: a.status, penvoiceCount: countOf(a.body, 'get("penvoice")'), penvoiceWordCount: countOf(a.body, 'penvoice'),
      sfxStatus: s.status, sfxKeys: sfx ? Object.keys(sfx) : null };
  },
  async NARR_IDX(ctx) {
    const D = {};
    for (const mode of ['on', 'off']) {
      const page = await newPage(ctx, 'index:' + mode, SCEN);
      const o = { mode };
      try {
        await page.goto('http://127.0.0.1:' + ctx.port + '/index.html' + (mode === 'off' ? '?penvoice=0' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
        Object.assign(o, await passGate(page, 'index'));
        /* 250ms 毎にクリック (クリック送りの口がある語り)。 */
        let clicking = true, clicks = 0;
        const spam = (async () => { while (clicking) { try { await page.mouse.click(640, 400); clicks++; } catch (e) { break; } await sleep(250); } })();
        const t0 = Date.now();
        try {
          await page.waitForFunction(() => { const n = document.getElementById('dmNarration'); return !!n && (n.style.display === 'none' || n.classList.contains('fading')); }, { timeout: 180000, polling: 100 });
          o.finished = true;
        } catch (e) { o.finished = false; }
        clicking = false; await spam;
        o.totalMs = Date.now() - t0; o.clicks = clicks;
        const S = await readSamples(page);
        o.paras = paragraphs(S.samples); o.hints = S.hints;
        o.dur = await readDur(page, IDS.intro);
        o.calls = await page.evaluate(() => JSON.parse(JSON.stringify(window.__calls)));
        o.reqs = page.__reqs.slice();
      } catch (e) { o.err = String((e && e.message) || e).slice(0, 300); }
      await closePage(ctx, page);
      D[mode] = o;
      console.log('[vpn]   index:' + mode + ' 1文字目 ' + o.firstCharMs + 'ms (mp3 ' + o.mp3AtFirst + ') / 語り ' + o.totalMs + 'ms クリック ' + o.clicks + ' / 保持 ' + (o.paras || []).map((p) => p.holdMs).join(',') + (o.err ? ' / ERR ' + o.err : ''));
    }
    ctx.D.NARR_IDX = D;
  },
  async NARR_TAV(ctx) {
    const D = {};
    for (const mode of ['on', 'off']) {
      const page = await newPage(ctx, 'tavern:' + mode, null);
      const o = { mode };
      try {
        await page.goto('http://127.0.0.1:' + ctx.port + '/tavern.html' + (mode === 'off' ? '?penvoice=0' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
        /* A = 前口上 (クリック送りの口が元から無い = 触らずに 2.5 秒の自動送りを待つ)。 */
        Object.assign(o, await passGate(page, 'tavern'));
        const tA = Date.now();
        try {
          await page.waitForFunction(() => { const n = document.getElementById('prologueOverlay'); return !!n && n.style.display === 'none'; }, { timeout: 180000, polling: 100 });
          o.finishedA = true;
        } catch (e) { o.finishedA = false; }
        o.totalMsA = Date.now() - tA;
        const SA = await readSamples(page);
        o.parasA = paragraphs(SA.samples); o.hintsA = SA.hints;
        const nReqA = page.__reqs.length;
        /* B = 依頼人の語り (quest_dialog_*)。⛔ openPrep を経由しない = 受注の語りの関数を直に呼ぶ。観測先を空へ戻してから始める。 */
        await page.evaluate(() => { window.__pen.samples = []; window.__pen.hints = {}; const b = document.getElementById('dmBody'); if (b) b.textContent = ''; });
        o.questStart = await page.evaluate((scen) => {
          const sc = (typeof scenarios !== 'undefined') ? scenarios.find((s) => s.id === scen) : null;
          if (!sc || typeof playQuestAcceptNarration !== 'function') return { ok: false, sc: !!sc };
          window.__qaDone = false;
          playQuestAcceptNarration(sc).then(() => { window.__qaDone = true; }, (e) => { window.__qaDone = 'ERR ' + e; });
          return { ok: true, hasDialog: !!sc.dialog };
        }, SCEN);
        let clicking = true, clicks = 0;
        const spam = (async () => { while (clicking) { try { await page.evaluate(() => { const ov = document.getElementById('prologueOverlay'); if (ov) ov.click(); }); clicks++; } catch (e) { break; } await sleep(250); } })();
        const tB = Date.now();
        try { await page.waitForFunction(() => window.__qaDone === true, { timeout: 120000, polling: 100 }); o.finishedB = true; } catch (e) { o.finishedB = false; }
        clicking = false; await spam;
        o.totalMsB = Date.now() - tB; o.clicksB = clicks;
        const SB = await readSamples(page);
        o.parasB = paragraphs(SB.samples); o.hintsB = SB.hints;
        o.dur = await readDur(page, IDS.prologue.concat(IDS.quest));
        o.calls = await page.evaluate(() => JSON.parse(JSON.stringify(window.__calls)));
        o.reqs = page.__reqs.slice(); o.reqsA = page.__reqs.slice(0, nReqA); o.reqsB = page.__reqs.slice(nReqA);
      } catch (e) { o.err = String((e && e.message) || e).slice(0, 300); }
      await closePage(ctx, page);
      D[mode] = o;
      console.log('[vpn]   tavern:' + mode + ' 1文字目 ' + o.firstCharMs + 'ms (mp3 ' + o.mp3AtFirst + ') / 前口上 ' + o.totalMsA + 'ms 保持 ' + (o.parasA || []).map((p) => p.holdMs).join(',')
        + ' / 依頼人 ' + o.totalMsB + 'ms クリック ' + o.clicksB + ' 保持 ' + (o.parasB || []).map((p) => p.holdMs).join(',') + (o.err ? ' / ERR ' + o.err : ''));
    }
    ctx.D.NARR_TAV = D;
  },
  async PARTS(ctx) {
    const D = {};
    for (const kind of ['index', 'tavern']) {
      for (const mode of ['on', 'off']) {
        const page = await newPage(ctx, 'parts:' + kind + ':' + mode, kind === 'index' ? SCEN : null);
        const o = { kind, mode };
        try {
          await page.goto('http://127.0.0.1:' + ctx.port + '/' + kind + '.html' + (mode === 'off' ? '?penvoice=0' : ''), { waitUntil: 'load', timeout: 60000 });
          await page.waitForFunction(() => !!(window.GameAudio && window.GameSettings && document.body), { timeout: 30000, polling: 50 });
          await sleep(300);
          Object.assign(o, await page.evaluate(async (LP, LV) => {
            const r = { title: document.title };
            GameAudio.unlock();
            await new Promise((res) => setTimeout(res, 250));
            const P = window.__probe;
            r.busEdges = P.busEdges.slice(); r.busNames = Object.keys(P.bus);
            /* ⭐ 観測先を空へ戻してから本番の口 (playSfx) だけに書かせる。同期実行なので BGM の setInterval は割り込まない。 */
            P.bs = 0; P.osc = 0; P.edges = [];
            GameAudio.playSfx('narration');
            r.bs = P.bs; r.osc = P.osc; r.edges = P.edges.slice();
            P.edges = []; GameAudio.playSfx('button'); r.button = P.edges.slice();
            P.edges = []; GameAudio.playSfx('hit'); r.hit = P.edges.slice();
            /* 設定モーダル。 */
            GameAudio.setVoiceVolume(0.95);
            GameAudio.openSettings();
            const ov = document.getElementById('gameSettingsOverlay');
            const txt = ov ? ov.textContent : '';
            r.hasPen = txt.indexOf(LP) >= 0; r.hasVoice = txt.indexOf(LV) >= 0;
            const label = r.hasPen ? LP : LV;
            let sl = null;
            if (ov) ov.querySelectorAll('input[type=range]').forEach((el) => {
              let nd = el;
              for (let i = 0; i < 4 && nd && !sl; i++) { nd = nd.parentElement; if (nd && nd.firstChild && nd.firstChild.textContent === label) sl = el; }
            });
            const G = () => GameSettings.get();
            r.before = G().voice; r.otherBefore = [G().master, G().sfx, G().bgm];
            if (sl) { sl.value = '37'; sl.dispatchEvent(new Event('input', { bubbles: true })); }
            r.found = !!sl; r.after = G().voice; r.otherAfter = [G().master, G().sfx, G().bgm];
            try { GameAudio.closeSettings(); } catch (e) {}
            return r;
          }, LABEL_PEN, LABEL_VOICE));
        } catch (e) { o.err = String((e && e.message) || e).slice(0, 300); }
        await closePage(ctx, page);
        D[kind + ':' + mode] = o;
      }
    }
    ctx.D.PARTS = D;
  },
  async WAVE(ctx) {
    const open = async (tag, file, off) => {
      const page = await newPage(ctx, 'wave:' + tag, null);
      await page.goto('http://127.0.0.1:' + ctx.port + '/' + file + (off ? '?penvoice=0' : ''), { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => !!(window.GameAudio && window.GameSettings), { timeout: 30000 });
      return page;
    };
    const stats = (page, seeds) => page.evaluate(async (src, seeds) => {
      const analyse = (0, eval)('(' + src + ')');
      const out = [];
      for (const s of seeds) { window.__seed(s); const a = await GameAudio.__renderSfxOffline('narration'); out.push(analyse(a)); }
      return out;
    }, ANALYSE_SRC, seeds);
    const render = async (page, names, seed) => {
      const b64 = await page.evaluate(async (names, seed) => {
        const out = {};
        for (const n of names) {
          window.__seed(seed);
          const a = await GameAudio.__renderSfxOffline(n);
          const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
          let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          out[n] = btoa(s);
        }
        return out;
      }, names, seed);
      const out = {};
      for (const n of Object.keys(b64)) { const b = Buffer.from(b64[n], 'base64'); out[n] = new Float32Array(new Uint8Array(b).buffer); }
      return out;
    };
    const maxDiff = (A, B) => { if (!A || !B || A.length !== B.length) return Infinity; let m = 0; for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d > m) m = d; } return m; };
    const O = {};
    const pOn = await open('cur-on', '__pen_light.html', false);
    const pOff = await open('cur-off', '__pen_light.html', true);
    const pOld = await open('old-off', '__pen_light_old.html', true);
    const pOldOn = await open('old-on', '__pen_light_old.html', false);
    try {
      O.title = await pOn.evaluate(() => document.title);
      const seedsOn = []; for (let s = 1; s <= WAVE_SEEDS_ON; s++) seedsOn.push(s);
      const seedsOff = []; for (let s = 1; s <= WAVE_SEEDS_OFF; s++) seedsOff.push(s);
      O.on = await stats(pOn, seedsOn);
      O.off = await stats(pOff, seedsOff);
      O.names = await pOn.evaluate(() => GameAudio.sfxNames());
      O.oldNames = await pOld.evaluate(() => GameAudio.sfxNames());
      const others = O.names.filter((n) => n !== 'narration');
      O.nar = []; O.cross = []; O.self = [];
      for (const seed of EQ_SEEDS) {
        const wOff = await render(pOff, O.names, seed), wOn = await render(pOn, O.names, seed);
        const wOld = await render(pOld, O.names, seed), wOldOn = await render(pOldOn, ['narration'], seed);
        const wOn2 = await render(pOn, others, seed), wOld2 = await render(pOld, others, seed);
        let nz = false; for (let i = 0; i < wOff.narration.length && !nz; i++) if (wOff.narration[i] !== 0) nz = true;
        O.nar.push({ seed, offVsOld: maxDiff(wOff.narration, wOld.narration), oldOnVsOff: maxDiff(wOldOn.narration, wOff.narration), nonSilent: nz,
          onVsOld: maxDiff(wOn.narration, wOld.narration) });
        for (const n of others) {
          O.cross.push({ n, seed, arm: 'off', d: maxDiff(wOff[n], wOld[n]) });
          O.cross.push({ n, seed, arm: 'on', d: maxDiff(wOn[n], wOld[n]) });
          O.self.push({ n, seed, arm: 'cur-on', d: maxDiff(wOn[n], wOn2[n]) });
          O.self.push({ n, seed, arm: 'old', d: maxDiff(wOld[n], wOld2[n]) });
        }
      }
    } catch (e) { O.err = String((e && e.stack) || e).slice(0, 400); }
    for (const p of [pOn, pOff, pOld, pOldOn]) await closePage(ctx, p);
    ctx.D.WAVE = O;
  },
};
const UNIT_ORDER = ['META', 'NARR_IDX', 'NARR_TAV', 'PARTS', 'WAVE'];

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
const allGt0 = (dur, ids) => ids.length > 0 && ids.every((i) => typeof (dur || {})[i] === 'number' && dur[i] > 0);
const allEq0 = (dur, ids) => ids.length > 0 && ids.every((i) => (dur || {})[i] === 0);
const hintsOf = (ps) => (ps || []).map((p) => p.hint === HINT_TEXT ? 'T' : (p.hint === HINT_VOICE ? 'V' : String(p.hint)));
const holdsOf = (ps) => (ps || []).map((p) => p.holdMs);
const holdsLt = (ps, ms) => (ps || []).length > 1 && ps.slice(0, -1).every((p) => p.holdMs !== null && p.holdMs < ms);
const holdsIn = (ps, lo, hi) => (ps || []).length > 1 && ps.slice(0, -1).every((p) => p.holdMs !== null && p.holdMs >= lo && p.holdMs <= hi);
const allHint = (ps, h, n) => (ps || []).length === n && ps.every((p) => p.hint === h);
const J2 = (o) => J(o === undefined ? null : o).replace(/(\d+\.\d{3})\d+/g, '$1');

function judge(ctx, R) {
  const D = ctx.D;
  const ran = (u) => ctx.ran.has(u);
  const E = (u) => ctx.unitErr[u] ? ' / ⛔ユニット例外 ' + u + ': ' + ctx.unitErr[u] : '';
  const IX = D.NARR_IDX || {}, TV = D.NARR_TAV || {}, PT = D.PARTS || {}, WV = D.WAVE || {};
  const ixOn = IX.on || {}, ixOff = IX.off || {}, tvOn = TV.on || {}, tvOff = TV.off || {};
  const narr = ran('NARR_IDX') && ran('NARR_TAV');
  const tavIds = IDS.prologue.concat(IDS.quest);
  const offSide = {};   // (5a) の材料 = 各節の「従来側」の判定

  /* ── §0 装置 ─────────────────────────────────────────────────────────────── */
  if (narr) {
    const okIx = ixOff.gate && !!(ixOff.boot || {}).title && (ixOff.reqs || []).some(isMan) && allGt0(ixOff.dur, IDS.intro);
    const okTv = tvOff.gate && !!(tvOff.boot || {}).title && (tvOff.reqs || []).some(isMan) && allGt0(tvOff.dur, tavIds);
    R.check('(0a)', '[装置] ?penvoice=0 の腕で manifest.json が読まれ、manifest から導出した実在 id で getVoiceDuration > 0・ページが描けた (document.title + 開始の関門)'
      + ' ⇒ 素の腕の「声が鳴らない」が manifest の配信失敗で緑になっていない',
      okIx && okTv,
      'index title="' + (ixOff.boot || {}).title + '" manifest要求 ' + (ixOff.reqs || []).filter(isMan).length + ' dur ' + J2(ixOff.dur)
      + ' ‖ tavern title="' + (tvOff.boot || {}).title + '" manifest要求 ' + (tvOff.reqs || []).filter(isMan).length + ' dur ' + J2(tvOff.dur) + E('NARR_IDX') + E('NARR_TAV'));
  }
  if (ran('META')) {
    const all = [].concat(IDS.intro, IDS.prologue, IDS.quest);
    R.check('(0b)', '[装置] 期待する声 id を assets/voice/manifest.json から導出 (⛔ 写経しない): 導入 dungeon_intro_' + SCEN + '_* / 前口上 dungeon_intro_prologue_* /'
      + ' 依頼人 quest_dialog_' + SCEN + '_* が各 1 件以上・全 id が file と durationSec > 0 を持つ',
      IDS.intro.length > 0 && IDS.prologue.length > 0 && IDS.quest.length > 0 && all.every((i) => !!VOICE_MAN[i].file && VOICE_MAN[i].durationSec > 0),
      '導入 ' + IDS.intro.length + ' / 前口上 ' + IDS.prologue.length + ' / 依頼人 ' + IDS.quest.length + ' (manifest 全 ' + Object.keys(VOICE_MAN).length + ' 件)');
    const M = D.META || {};
    R.check('(0c)', '[装置] ★ 罠5: 配信された assets/sfx/sfx-manifest.json に narration キーが無い (あれば playSampled が合成レシピより先に鳴り §2 が無意味)',
      M.sfxStatus === 200 && Array.isArray(M.sfxKeys) && M.sfxKeys.length > 0 && M.sfxKeys.indexOf('narration') < 0,
      'status ' + M.sfxStatus + ' キー ' + J(M.sfxKeys));
    R.check('(0d)', '[装置] 撤退の判定は配信された audio.js に逐語 get("penvoice") がちょうど 1 箇所 (⛔ 語 penvoice の件数では数えない)',
      M.audioStatus === 200 && M.penvoiceCount === 1,
      'get("penvoice") ×' + M.penvoiceCount + ' (参考: 語 penvoice ×' + M.penvoiceWordCount + ')');
    R.check('(0e)', '[装置] 変異 ' + MUT_ORDER.length + ' 本の注入点が原本 (起動時に凍結した配信スナップショット) でちょうど 1 箇所',
      AUDIT_BAD.length === 0, AUDIT.map((a) => (a.ok ? '' : '⛔') + a.key + '@' + a.rows.map((r) => r.where).join('+')).join(' / '));
  }

  /* ── §1 声が止まる ──────────────────────────────────────────────────────────── */
  if (narr) {
    const onMp3 = [].concat(ixOn.reqs || [], tvOn.reqs || []).filter(isMp3);
    const offIx = (ixOff.reqs || []).filter(isMp3).length, offTA = (tvOff.reqsA || []).filter(isMp3).length, offTB = (tvOff.reqsB || []).filter(isMp3).length;
    const offA = offIx >= 1 && offTA >= 1 && offTB >= 1;
    offSide['1a'] = offA;
    R.check('(1a)', '★ 声の mp3 (クリップ) の要求: 素 = 0 件 (導入の語り + 前口上 + 依頼人の語り) / off = 導入・前口上・依頼人それぞれ 1 件以上',
      !ixOn.err && !tvOn.err && onMp3.length === 0 && offA,
      '素 ' + onMp3.length + ' 件 ' + J(onMp3.slice(0, 4).map((r) => r.u)) + ' ‖ off 導入 ' + offIx + ' / 前口上 ' + offTA + ' / 依頼人 ' + offTB + E('NARR_IDX') + E('NARR_TAV'));
    const onMan = [].concat(ixOn.reqs || [], tvOn.reqs || []).filter(isMan).length;
    const lvm = ((ixOn.calls || {}).loadVoiceManifest || 0) + ((tvOn.calls || {}).loadVoiceManifest || 0);
    const offMan = (ixOff.reqs || []).filter(isMan).length >= 1 && (tvOff.reqs || []).filter(isMan).length >= 1;
    offSide["1a'"] = offMan;
    R.check("(1a')", '★ manifest.json の要求 (mp3 とは分けて数える): 素 = 0 件 (loadVoiceManifest の呼び口は index / tavern とも通った上で) / off = 各 1 件以上',
      onMan === 0 && (ixOn.calls || {}).loadVoiceManifest >= 1 && (tvOn.calls || {}).loadVoiceManifest >= 1 && offMan,
      '素 manifest要求 ' + onMan + ' 件 / loadVoiceManifest 呼び口 ' + lvm + ' 回 ‖ off manifest要求 index ' + (ixOff.reqs || []).filter(isMan).length + ' tavern ' + (tvOff.reqs || []).filter(isMan).length);
    const offB = allGt0(ixOff.dur, IDS.intro) && allGt0(tvOff.dur, tavIds);
    offSide['1b'] = offB;
    R.check('(1b)', '★ manifest の id で getVoiceDuration(id) === 0 (素・導入 ' + IDS.intro.length + ' + 前口上 ' + IDS.prologue.length + ' + 依頼人 ' + IDS.quest.length + ' id) / off は全 id で > 0',
      allEq0(ixOn.dur, IDS.intro) && allEq0(tvOn.dur, tavIds) && offB,
      '素 index ' + J2(ixOn.dur) + ' tavern ' + J2(tvOn.dur) + ' ‖ off index ' + J2(ixOff.dur) + ' tavern ' + J2(tvOff.dur));
    const nI = IDS.intro.length, nP = IDS.prologue.length, nQ = IDS.quest.length;
    const onC = allHint(ixOn.paras, HINT_TEXT, nI) && !(ixOn.hints || {})[HINT_VOICE] && holdsLt(ixOn.paras, 1000)
      && allHint(tvOn.parasA, HINT_TEXT, nP) && !(tvOn.hintsA || {})[HINT_VOICE] && holdsIn(tvOn.parasA, 2000, 3200)
      && allHint(tvOn.parasB, HINT_TEXT, nQ) && !(tvOn.hintsB || {})[HINT_VOICE] && holdsLt(tvOn.parasB, 1000)
      && ixOn.finished && tvOn.finishedA && tvOn.finishedB && !!(tvOn.questStart || {}).ok;
    const offC = allHint(ixOff.paras, HINT_VOICE, nI) && allHint(tvOff.parasA, HINT_VOICE, nP) && allHint(tvOff.parasB, HINT_VOICE, nQ);
    offSide['1c'] = offC;
    R.check('(1c)', '★★ 罠1: **全段落** のヒントが「クリックで続ける」で「♪ 語りに耳をかたむけよう…」が一度も出ない (導入 / 前口上 / 依頼人・段落数 = 導出 id 数) /'
      + ' クリック送りの口がある語り (導入・依頼人) は全段落で打ち終わり → 次段落 < 1000ms・前口上 (口が元から無い) は 2000〜3200ms の自動送り /'
      + ' off は全段落が「♪ 語りに耳をかたむけよう…」 [⭐ 文字列が主・秒数は従]',
      onC && offC,
      '素 導入 ' + hintsOf(ixOn.paras).join('') + ' 保持 ' + J(holdsOf(ixOn.paras)) + ' ♪=' + ((ixOn.hints || {})[HINT_VOICE] || 0)
      + ' / 前口上 ' + hintsOf(tvOn.parasA).join('') + ' 保持 ' + J(holdsOf(tvOn.parasA)) + ' ♪=' + ((tvOn.hintsA || {})[HINT_VOICE] || 0)
      + ' / 依頼人 ' + hintsOf(tvOn.parasB).join('') + ' 保持 ' + J(holdsOf(tvOn.parasB)) + ' ♪=' + ((tvOn.hintsB || {})[HINT_VOICE] || 0)
      + ' ‖ off 導入 ' + hintsOf(ixOff.paras).join('') + ' 前口上 ' + hintsOf(tvOff.parasA).join('') + ' 依頼人 ' + hintsOf(tvOff.parasB).join('')
      + ' (T=クリックで続ける V=♪) / id 数 ' + [nI, nP, nQ].join('/'));
    const pre = (o, ids) => ((o.calls || {}).preloadVoice || []).some((a) => J(a) === J(ids));
    const offD = ixOff.mp3AtFirst >= 1 && tvOff.mp3AtFirst >= 1;
    offSide['1d'] = offD;
    R.check('(1d)', '★★ 罠2 (構造で測る): 開始のクリックの後、1 文字目が出た時点で mp3 の要求 0 件 (素・事前読み込みの口 index:導入 / tavern:前口上 に全 id で到達した上で) /'
      + ' off は同じ時点で 1 件以上 (= 事前読み込みが本当に走る) [⛔ 秒数では測らない = localhost では差が出ない]',
      ixOn.mp3AtFirst === 0 && tvOn.mp3AtFirst === 0 && pre(ixOn, IDS.intro) && pre(tvOn, IDS.prologue) && offD,
      '素 index ' + ixOn.mp3AtFirst + ' 件 (' + ixOn.firstCharMs + 'ms) / tavern ' + tvOn.mp3AtFirst + ' 件 (' + tvOn.firstCharMs + 'ms) / 口 ' + pre(ixOn, IDS.intro) + ',' + pre(tvOn, IDS.prologue)
      + ' ‖ off index ' + ixOff.mp3AtFirst + ' 件 (' + ixOff.firstCharMs + 'ms) / tavern ' + tvOff.mp3AtFirst + ' 件 (' + tvOff.firstCharMs + 'ms)');
  }

  /* ── §2 ペンの音 ──────────────────────────────────────────────────────────── */
  if (ran('WAVE')) {
    const on = WV.on || [], off = WV.off || [];
    const zOn = on.map((r) => r.zcr), zOff = off.map((r) => r.zcr);
    const hist = (a) => { const h = {}; a.forEach((r) => { h[r.peaks] = (h[r.peaks] || 0) + 1; }); return h; };
    const offOk = off.length === WAVE_SEEDS_OFF && off.every((r) => Math.abs(r.zcr - ZCR_SINE) < 0.004 && r.peaks === 1);
    offSide['2a'] = offOk;
    R.check('(2a)', '★ __renderSfxOffline("narration") の波形 (mulberry32 固定種): 素 = ' + WAVE_SEEDS_ON + ' 種すべてゼロ交差率 > ' + ZCR_NOISE_MIN + ' (雑音系・880Hz 正弦 '
      + ZCR_SINE.toFixed(4) + ' の約 2 倍) かつ振幅の山 = 3 / off = ' + WAVE_SEEDS_OFF + ' 種すべてゼロ交差率 ' + ZCR_SINE.toFixed(4) + '±0.004 (正弦系) かつ山 = 1',
      !WV.err && on.length === WAVE_SEEDS_ON && on.every((r) => r.zcr > ZCR_NOISE_MIN && r.peaks === 3) && offOk,
      '素 zcr ' + (zOn.length ? Math.min(...zOn).toFixed(4) + '〜' + Math.max(...zOn).toFixed(4) : '-') + ' 山 ' + J(hist(on))
      + ' ‖ off zcr ' + (zOff.length ? Math.min(...zOff).toFixed(5) + '〜' + Math.max(...zOff).toFixed(5) : '-') + ' 山 ' + J(hist(off)) + E('WAVE'));
  }
  if (ran('PARTS')) {
    const P = (k) => PT[k] || {};
    const pages = ['index', 'tavern'];
    const offB = pages.every((k) => P(k + ':off').osc === 1 && P(k + ':off').bs === 0);
    offSide['2b'] = offB;
    R.check('(2b)', '★ ページ内で GameAudio.playSfx("narration") を 1 回: 素 = BufferSource 3・Oscillator 0 / off = Oscillator 1・BufferSource 0 (index / tavern の実ページ)',
      pages.every((k) => P(k + ':on').bs === 3 && P(k + ':on').osc === 0) && offB,
      pages.map((k) => k + ' 素 bs' + P(k + ':on').bs + '/osc' + P(k + ':on').osc + ' off bs' + P(k + ':off').bs + '/osc' + P(k + ':off').osc).join(' / ') + E('PARTS'));
    const wired = (o) => ['master->destination', 'bgm->master', 'voice->master'].every((e) => (o.busEdges || []).indexOf(e) >= 0) && (o.busNames || []).length === 5;
    const offC = pages.every((k) => J(P(k + ':off').edges) === J(['ui']));
    offSide['2c'] = offC;
    R.check('(2c)', '★ その出口: 素 = 3 画すべて voice バス / off = ui バス。他の音 (button = ui / hit = sfx) は両腕で不変'
      + ' [装置: 最初の 5 個の Gain が master→destination / bgm→master / voice→master と繋がる = audio.js のバス]',
      pages.every((k) => ['on', 'off'].every((m) => wired(P(k + ':' + m)) && J(P(k + ':' + m).button) === J(['ui']) && (P(k + ':' + m).hit || []).length > 0 && P(k + ':' + m).hit.every((e) => e === 'sfx')))
        && pages.every((k) => J(P(k + ':on').edges) === J(['voice', 'voice', 'voice'])) && offC,
      pages.map((k) => k + ' 素 ' + J(P(k + ':on').edges) + ' off ' + J(P(k + ':off').edges) + ' button ' + J(P(k + ':on').button) + '/' + J(P(k + ':off').button)
        + ' hit ' + J(P(k + ':on').hit) + ' 配線 ' + wired(P(k + ':on')) + '/' + wired(P(k + ':off'))).join(' / '));
    /* ── §3 設定 ── */
    const offA3 = pages.every((k) => !P(k + ':off').hasPen && P(k + ':off').hasVoice);
    offSide['3a'] = offA3;
    R.check('(3a)', '★ GameAudio.openSettings() のモーダル: 素 = 「語り 音量」あり・「ボイス音量」なし / off = 逆 (index / tavern の実ページ)',
      pages.every((k) => P(k + ':on').hasPen && !P(k + ':on').hasVoice) && offA3,
      pages.map((k) => k + ' 素 語り=' + P(k + ':on').hasPen + ' ボイス=' + P(k + ':on').hasVoice + ' / off 語り=' + P(k + ':off').hasPen + ' ボイス=' + P(k + ':off').hasVoice).join(' ‖ '));
    const knob = (o) => o.found === true && o.before === 0.95 && o.after === 0.37 && J(o.otherBefore) === J(o.otherAfter);
    offSide['3b'] = pages.every((k) => knob(P(k + ':off')));
    R.check('(3b)', '★ そのつまみ (素 = 語り 音量 / off = ボイス音量) を 37 へ動かすと GameSettings.get().voice が 0.95 → 0.37・他の音量は不変 (つまみが死んでいない)',
      pages.every((k) => knob(P(k + ':on')) && knob(P(k + ':off'))),
      pages.map((k) => ['on', 'off'].map((m) => k + ':' + m + ' ' + P(k + ':' + m).before + '→' + P(k + ':' + m).after + (P(k + ':' + m).found ? '' : ' (つまみ無し)')).join(' ')).join(' / '));
  }

  /* ── §4 恒等 ────────────────────────────────────────────────────────────────── */
  if (ran('WAVE')) {
    const nar = WV.nar || [];
    R.check('(4a)', '★★ 恒等: off の narration のオフライン描画が ' + OLD_REV + ' の audio.js (git show で配信) と **サンプル単位で完全一致** (最大差 0・種 ' + EQ_SEEDS.join(',') + ')・無音でない /'
      + ' 旧版は penvoice を知らない = 旧版の素の腕も同じ [対照: 素の narration は旧版と異なる]',
      !WV.err && nar.length === EQ_SEEDS.length && nar.every((r) => r.offVsOld === 0 && r.oldOnVsOff === 0 && r.nonSilent && r.onVsOld > 0),
      nar.map((r) => 'seed' + r.seed + ' off-旧 ' + r.offVsOld + ' 旧素-off ' + r.oldOnVsOff + ' 素-旧 ' + (+r.onVsOld).toExponential(2) + (r.nonSilent ? '' : ' ⛔無音')).join(' / ') + ' (blob ' + BLOBS + ')' + E('WAVE'));
    const cross = WV.cross || [], self = WV.self || [];
    const worst = (a) => a.reduce((m, r) => Math.max(m, r.d), 0);
    const exact = cross.filter((r) => r.d === 0).length;
    const bad = cross.filter((r) => !(r.d <= EQ_TOL));
    const selfNz = self.filter((r) => r.d > 0).map((r) => r.n + '@' + r.arm);
    R.check('(4b)', '★ narration 以外の全 ' + ((WV.names || []).length - 1) + ' レシピが両版で最大差 ≤ ' + EQ_TOL + ' (素・off 両腕 / 種 ' + EQ_SEEDS.join(',') + ') + sfxNames が両版で同一 /'
      + ' ⚠ 許容の根拠 = 同じ走行で測った自己比較 (同じ版・同じ種の 2 回描画) の揺れも ≤ ' + EQ_TOL,
      !WV.err && J(WV.names) === J(WV.oldNames) && cross.length === ((WV.names || []).length - 1) * 2 * EQ_SEEDS.length && bad.length === 0 && worst(self) <= EQ_TOL,
      '比較 ' + cross.length + ' 件 (完全一致 ' + exact + ') 最大差 ' + worst(cross).toExponential(2) + (bad.length ? ' ⛔超過 ' + J(bad.slice(0, 6).map((r) => r.n + '@' + r.arm + '/' + r.seed + '=' + r.d)) : '')
      + ' ‖ 自己比較 ' + self.length + ' 件 最大 ' + worst(self).toExponential(2) + ' 揺れたレシピ ' + J(Array.from(new Set(selfNz))));
  }

  /* ── §5 撤退 ────────────────────────────────────────────────────────────────── */
  if (narr && ran('PARTS')) {
    const keys = ['1a', "1a'", '1b', '1c', '1d', '2b', '2c', '3a', '3b'].concat(ran('WAVE') ? ['2a'] : []);
    const bad = keys.filter((k) => offSide[k] !== true);
    R.check('(5a)', '★★ 撤退: index.html?penvoice=0 と tavern.html?penvoice=0 (+ 軽量ページ ?penvoice=0) で §1〜§3 の従来側の期待が全部成り立つ'
      + ' (声の mp3・manifest・声の尺・声ペースのヒント・事前読み込み・正弦 1 つ・ui バス・「ボイス音量」とそのつまみ)',
      bad.length === 0, '従来側 ' + keys.length + ' 項目' + (bad.length ? ' ⛔崩れた ' + bad.join(',') : ' すべて成立'));
  }
  const boots = [];
  for (const u of ['NARR_IDX', 'NARR_TAV']) if (ran(u)) for (const m of ['on', 'off']) { const o = (D[u] || {})[m] || {}; boots.push({ k: u + ':' + m, ok: !!o.gate && !!(o.boot || {}).title && (o.boot || {}).ga && !o.err }); }
  if (ran('PARTS')) for (const k of Object.keys(PT)) boots.push({ k: 'PARTS:' + k, ok: !!PT[k].title && !PT[k].err });
  if (ran('WAVE')) boots.push({ k: 'WAVE', ok: !!WV.title && !WV.err });
  R.check('(0f)', '[装置] 開いたページが全部起動した (document.title・GameAudio・開始の関門) + pageerror 0 件 (favicon は除外)',
    boots.every((b) => b.ok) && ctx.errs.length === 0 && Object.keys(ctx.unitErr).length === 0,
    'ページ ' + boots.filter((b) => b.ok).length + '/' + boots.length + (boots.some((b) => !b.ok) ? ' ⛔' + boots.filter((b) => !b.ok).map((b) => b.k).join(',') : '')
    + ' / pageerror ' + (ctx.errs.slice(0, 3).join(' | ') || '(なし)') + (Object.keys(ctx.unitErr).length ? ' / ⛔ユニット例外 ' + J(ctx.unitErr) : ''));
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

async function runUnits(browser, port, units, R, label) {
  const ctx = { browser, port, D: {}, ran: new Set(), unitErr: {}, errs: [], pages: [] };
  const list = ['META'].concat(UNIT_ORDER.filter((u) => u !== 'META' && units.indexOf(u) >= 0));
  for (const u of list) {
    const t0 = Date.now();
    ctx.ran.add(u);
    try { await UNITS[u](ctx); }
    catch (e) { ctx.unitErr[u] = String((e && e.message) || e).slice(0, 300); console.log('  ⛔ ユニット ' + u + ' 例外: ' + ctx.unitErr[u]); }
    for (const p of ctx.pages.slice()) await closePage(ctx, p);
    console.log('[vpn] ' + label + ' ユニット ' + u + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
  }
  judge(ctx, R);
  return ctx;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_pennarr_');
  console.log('[vpn] 声 id (manifest から導出): 導入 ' + J(IDS.intro) + ' / 前口上 ' + IDS.prologue.length + ' 件 / 依頼人 ' + J(IDS.quest));
  console.log('[vpn] 旧版 = git show ' + OLD_REV + ':audio.js (blob ' + BLOBS.split(' / ')[0] + ') / HEAD:audio.js blob ' + BLOBS.split(' / ')[1]);
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
      /* 素の基準 (変異が使うユニットだけ)。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const srv0 = await startServer(PORT, null);
      const R0 = mkResults();
      await runUnits(browser, PORT, need, R0, '(素・基準)');
      await stopServer(srv0);
      const s0 = summarize(R0, '[素・基準 ' + need.join(',') + ']');
      if (s0.failed) {
        console.error('[vpn] ⛔ 素の基準で FAIL がある — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const srv = await startServer(port, key);
          console.log('\n[vpn] ════════ 変異 ' + key + ' (port ' + port + ' / ' + auditMutation(key).rows.map((r) => r.where).join(' + ') + ' / ユニット ' + MUTATIONS[key].units.join(',') + ') ════════');
          const R = mkResults();
          try { await runUnits(browser, port, MUTATIONS[key].units, R, '[変異 ' + key + ']'); }
          catch (e) { console.log('  ⛔ ドライバ例外: ' + String((e && e.message) || e)); }
          await stopServer(srv);
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0f = R.filter((r) => r.id === '(0f)')[0];
          /* ⭐ 起動確認 = (0f) が緑 (開いたページが全部起動・pageerror 0) = 構文破壊で全部赤になる偽の検出を見分ける。 */
          const bootOk = !!r0f && r0f.ok;
          const want = NEG_EXPECT[key] || [];
          const keepGreen = NEG_GREEN[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = keepGreen.filter((g) => red.indexOf(g) >= 0 || !R.some((r) => r.id === g));
          const ok = bootOk && want.length > 0 && miss.length === 0 && leak.length === 0;
          console.log('[vpn] --negative ' + key + ': 担当=' + want.join(',') + (keepGreen.length ? ' / 緑のまま=' + keepGreen.join(',') : '') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + ' / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ ' + (!bootOk ? '起動確認 NG' : (miss.length ? '空振り ' + miss.join(',') : '') + (leak.length ? ' 担当が絞れていない ' + leak.join(',') : ''))));
          report.push({ key, want, keepGreen, red, ok, bootOk });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(12) + ' 担当 ' + r.want.join(',') + (r.keepGreen.length ? ' (緑のまま ' + r.keepGreen.join(',') + ')' : '') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vpn] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
        else console.error('[vpn] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const srv = await startServer(port, MUTATE);
      const R = mkResults();
      await runUnits(browser, port, UNITS_ARG.length ? UNITS_ARG : ALL, R, '[変異 ' + MUTATE + ' (手回し)]');
      await stopServer(srv);
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vpn] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const srv = await startServer(PORT, null);
      const R = mkResults();
      await runUnits(browser, PORT, UNITS_ARG.length ? UNITS_ARG : ALL, R, '(素)');
      await stopServer(srv);
      const s = summarize(R, '');
      exitCode = s.failed ? 1 : 0;
    }
  } catch (e) {
    console.error('[vpn] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[vpn] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
