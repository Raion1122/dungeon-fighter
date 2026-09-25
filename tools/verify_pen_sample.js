#!/usr/bin/env node
/*
 * verify_pen_sample.js — 実装依頼書 #74「ペンの音を録音へ」の受入ドライバ (依頼書 2026-09-25_pen-sample.md §8 を §12-4 で読み替え)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_pen_sample.js                         # 素 (全ユニット)
 *   node tools/verify_pen_sample.js --negative              # 変異 7 本 (port 10452〜10458)。先に素の基準を走らせる
 *   node tools/verify_pen_sample.js --negative --only busui,nogate
 *   node tools/verify_pen_sample.js --mutate busui          # 変異 1 本を載せて全ユニットを手回し (担当表を実走で決める用)
 *   node tools/verify_pen_sample.js --units META,GRAIN      # 素の一部だけ (デバッグ用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない / 2=環境不足・例外 / 3=変異アンカーの腐敗
 *
 * ■ 方針 — 「録音のペンが鳴る」を 2 経路で測る: ① 配信された mp3 そのもの (ページ内 decodeAudioData + node で MPEG フレームヘッダ)
 *   ② 実ページ (index / tavern) で GameAudio.playSfx("narration") が作る部品・入れた buffer の出所 URL・出口のバス。
 *   ⛔ ?autoplay は使わない (#73 罠3: 声/語りの経路を迂回する)。
 *
 * ■ ユニット
 *   META  … 配信物を http で読む: manifest の narration.files (N を実体から導出) / 全粒の HTTP status と MPEG ヘッダ / CREDITS.md
 *   GRAIN … 空ページで全粒を fetch → OfflineAudioContext.decodeAudioData (長さ・チャンネル・峰・先頭無音)
 *   PLAY  … index / tavern × 4 腕 (smp = スイッチ無し / ps0 = ?pensample=0 / pv0 = ?penvoice=0 / fb = manifest から narration を抜いた配信)
 *           GameAudio.preloadSfx(["narration"]) → 全粒 decode を待つ → playSfx("narration") 1 回 + button / hit + 200 回 +
 *           設定モーダル (「語り 音量」つまみを 37 へ → バスの利得 / クレジット行)
 *   GATE  … index / tavern を開き、開始の関門をクリックで越えて語りの 1 文字目が出た時点の粒の要求 (preload eager = 罠E)
 *
 * ■ 測っているもの (依頼書 §12-4 の表が正)
 *   §0 (0a) 配信 manifest の narration.files の本数 N を実体から導出・20 ≤ N ≤ 40・全粒が HTTP 200
 *      (0b) git ls-files sfx-pipeline/raw = 0 件 (元素材をコミットしていない)
 *      (0c) 変異 7 本の注入点が原本 (起動時に凍結した配信スナップショット) でちょうど 1 箇所ずつ
 *      (0f) 開いたページが全部起動し pageerror 0
 *   §1 (1a) 全粒の長さ 40〜420ms (切り出し 40〜400 + preMs 5 + mp3 の端数)  (1b) 各粒で最初に -40dBFS を超えるのが 15ms 以内
 *      (1c) 全粒の峰 ≤ -1.0 dBFS  (1d) ★ 峰の最大 − 最小 ≥ 6dB (罠C)
 *      (1e) モノラル (decode の numberOfChannels) かつ 44.1kHz・モノラル (配信バイトの MPEG フレームヘッダ)
 *           ⚠ decodeAudioData は文脈の sampleRate へリサンプルするので、decode 側の sampleRate は常に文脈の値 = 測れない (§12-4)
 *   §2 (2a) 全粒 decode 済の上で playSfx("narration") 1 回 = BufferSource ちょうど 1 (buffer の出所が manifest の粒)・出所の無い buffer 0・Oscillator 0
 *      (2b) ★ その出口 = voice バス (罠A)。button = ui / hit = sfx は不変
 *      (2c) 「語り 音量」つまみを 37 へ → 録音が流れ込むバス (2b の出口) と voice バスの利得が 0.95 → 0.37・sfx / ui / master は不変
 *           ⭐ 依頼書の文言「voice バスが変わる」だけだと出口が ui へ戻っても緑 (voice バスは変わる) ⇒ 「録音の出口のバス」を足した (§12-4)
 *      (2d) 200 回鳴らして選ばれた粒 (buffer の出所 URL) が N/2 種以上 (⛔ 長さでは数えない = 33 本で 18 種しかない)
 *      (2e) 開始のクリック → 語りの 1 文字目の時点で、全粒の要求が発行済み (preload eager = 罠E)
 *   §3 (3a) manifest から narration を抜いた配信 → playSfx("narration") は #73 の合成 3 画 (出所の無い buffer 3)・voice バス・粒の要求 0
 *   §4 (4a) ?pensample=0 → 全粒 decode 済でも合成 3 画・voice バス・録音の粒 0  (4b) ★ ?penvoice=0 → Oscillator 1・ui バス・録音 0 (罠B)
 *   §5 (5a) 配信 CREDITS.md に narration 行があり、出典 / ライセンス欄が仮置きでない・配信 manifest の全 ID に行がある (罠D)
 *      (5b) openSettings() のクレジット行に OtoLogic (スイッチ無し・?pensample=0 の両腕 × index / tavern)
 *   ⛔ 測らないこと (依頼書 §8): volume / pitchVar の値・粒の正確な本数 (範囲だけ)・切り出しのしきい値・粒の重なり・音色
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。変異は **配信スナップショットをメモリ上で差し替える** (⛔ 本番ファイルは 1 バイトも触らない)。
 *     audio.js / sfx-manifest.json / CREDITS.md は起動時に 1 回だけ読んで凍結。
 *   - flatgrain / leadpad は配信 mp3 を **同じ URL のまま** 差し替える (sfxBufCache は URL が鍵)。ffmpeg で作り直し、
 *     os.tmpdir()/df_pen74_<pid>/ に置いて配り、終わったら消す。⚠ ffmpeg が無いとこの 2 本は走らない (exit 3)。
 *   - バスの特定: evaluateOnNewDocument で AudioContext の createGain / AudioNode.prototype.connect を包み、最初の 5 個の Gain に
 *     master / bgm / sfx / ui / voice の名前を付ける (audio.js の buildBuses の順)。buffer の出所 = Response.arrayBuffer →
 *     decodeAudioData (⚠ decode で ab は detach される = 呼ぶ前に引く) → AudioBufferSourceNode.buffer の setter。
 *   - ⭐ PLAY は playSfx の前に全粒の decode を待つ (未 decode は playSampled が無言で合成へ落ちる = 緑が嘘になる)。
 *   - 腕ごとに別の BrowserContext。Chrome は --autoplay-policy=no-user-gesture-required --mute-audio。
 *   - ⛔ このドライバを timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *
 * ■ ポート = **10451** (素) / 変異 **10452〜10458** (7 本・MUTATIONS の並び順)。
 *   - (2c) のバスの利得は **audio.js が書いた目標値** (AudioParam.setTargetAtTime / value= を包んで記録) で読む。⚠ gain.value の読みは
 *     鳴っていないバスでは描画スレッドが進めないので古いまま (設定 0.37 でも 0.95 を返した = §12-4)。
 * ■ 所要 (2026-09-26 この機械の実測) = 素 14.4 秒 (19 assert・3 回とも同じ) / --negative 114.5 秒 (素の基準 + 変異 7 本 × 全ユニット)。
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
const PORT = parseInt(arg('port', '10451'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const UNITS_ARG = (arg('units', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCEN = 'goblin-mine';     // index の導入の語りの舞台 (GATE)
const HINT_BEGIN = '\u25b6 \u30af\u30ea\u30c3\u30af\u3057\u3066\u7269\u8a9e\u3092\u59cb\u3081\u308b';   // ▶ クリックして物語を始める
const LABEL_PEN = '\u8a9e\u308a \u97f3\u91cf';        // 語り 音量
const N_MIN = 20, N_MAX = 40;                         // (0a) 粒数の範囲 (依頼書 §2-8: 定数で焼かない)
const DUR_MIN_MS = 40, DUR_MAX_MS = 420;              // (1a) minMs 40 / maxMs 400 + preMs 5 + mp3 の端数
const LEAD_DB = -40, LEAD_MAX_MS = 15;                // (1b)
const PEAK_MAX_DB = -1.0;                             // (1c)
const PEAK_SPREAD_MIN_DB = 6;                         // (1d)
const PLAYS_2D = 200;                                 // (2d)
const VOL_BEFORE = 0.95, VOL_AFTER = 0.37;            // (2c)
const PLACEHOLDER_LICENSE = '(\u8981 inbox \u306e\u51fa\u5178\u8a18\u5165)';   // (要 inbox の出典記入) = build_sfx.py pack_meta の仮置き
const PLACEHOLDER_SOURCE = 'inbox(\u624b\u52d5)';                                // inbox(手動)

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_AUDIO = 'audio.js';
const F_SFXMAN = 'assets/sfx/sfx-manifest.json';
const F_CRED = 'assets/sfx/CREDITS.md';
const SFX_DIR = 'assets/sfx/';
const PRISTINE = {};
for (const f of [F_AUDIO, F_SFXMAN, F_CRED]) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
let PRISTINE_MAN = null;
try { PRISTINE_MAN = JSON.parse(PRISTINE[F_SFXMAN]); } catch (e) { console.error('[vps] sfx-manifest.json が JSON として読めない: ' + e.message); process.exit(2); }
const PRISTINE_GRAINS = (PRISTINE_MAN.narration && Array.isArray(PRISTINE_MAN.narration.files)) ? PRISTINE_MAN.narration.files.slice() : [];
const BLANK_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>pen74 blank</title></head><body></body></html>';

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (負のコントロール)
 *   files[f] = [{ from: 原本にちょうど 1 箇所ある逐語 (1 行の中), to }] / json = 配信 manifest の変換 / grains = 配信 mp3 の差し替え (ffmpeg)
 *   ⚠ 逐語は #74 実装後 (HEAD 9fc7ae6・audio.js は 8a1b8e2 の姿) で取った。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* 罠A: 録音の出口を ui バスへ戻す。 */
  busui: { files: { 'audio.js': [
    { from: 'var route = (name === "narration") ? buses.voice', to: 'var route = (name === "narration") ? buses.ui /* ★変異busui */' }] } },
  /* 罠B: playSampled の関門を外す (撤退の腕でも録音が鳴る)。 */
  nogate: { files: { 'audio.js': [
    { from: 'if (name === "narration" && !(PEN_NARRATION && PEN_SAMPLE)) return false;', to: '/* ★変異nogate: 関門を外す */' }] } },
  /* 罠C: 全粒を同じ峰へ揃える (粒ごとに正規化した姿の再現)。 */
  flatgrain: { grains: 'flat' },
  /* 罠E: manifest の narration.preload を外す。 */
  lazy: { json: 'lazy' },
  /* manifest から narration を消す。 */
  nonarr: { json: 'nonarr' },
  /* 全粒の頭に 150ms の無音を足す (元素材の先頭無音が残った姿)。 */
  leadpad: { grains: 'lead' },
  /* 罠D: CREDITS.md の narration 行を inbox の仮置きへ。 */
  nocredit: { files: { 'assets/sfx/CREDITS.md': [
    { from: '| OtoLogic | CC BY 4.0 |', to: '| ' + PLACEHOLDER_SOURCE + ' | ' + PLACEHOLDER_LICENSE + ' |' }] } },
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で全ユニットを 1 本ずつ実走し、実際に赤くなった集合で決めた
 * (2026-09-26・HEAD 9fc7ae6 の上。依頼書 §12-4 の担当表)。
 * ⭐ NEG_GREEN 相当のガード = --negative は全ユニットを走らせ、「赤の集合が担当と完全一致」を要求する
 *   (担当の外が 1 つでも赤くなれば「担当が絞れていない」で exit 1)。 */
const NEG_EXPECT = {
  busui:     ['(2b)', '(2c)'],
  nogate:    ['(4a)', '(4b)'],
  flatgrain: ['(1d)'],
  lazy:      ['(2e)'],
  nonarr:    ['(0a)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(4a)', '(4b)'],
  leadpad:   ['(1a)', '(1b)'],
  nocredit:  ['(5a)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 7) { console.error('[vps] 変異は 7 本まで (ポート 10452〜10458)'); process.exit(3); }
if (MUT_ORDER.some((k) => !NEG_EXPECT[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) { console.error('[vps] NEG_EXPECT と MUTATIONS が揃っていない'); process.exit(3); }
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) { console.error('[vps] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3); }
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) { console.error('[vps] 未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3); }

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
function hasFfmpeg() { try { cp.execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } }
/* (0c) 注入点の検算 — **手つかずの原本** に対して数える。 */
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
    /* JSON の注入点 = narration キーがちょうど 1 つ (lazy はさらに preload === "eager")。⚠ 逐語 "preload": "eager" は ui_tap と共有 = 2 件なので文字列で差さない。 */
    const n = countOf(PRISTINE[F_SFXMAN], '"narration":');
    const ok = n === 1 && !!PRISTINE_MAN.narration && (m.json !== 'lazy' || PRISTINE_MAN.narration.preload === 'eager');
    rows.push({ where: F_SFXMAN + ' narration' + (m.json === 'lazy' ? '.preload=' + J((PRISTINE_MAN.narration || {}).preload) : ''), ok, n: ok ? 1 : n });
  }
  if (m.grains) {
    /* 配信 mp3 の差し替え = manifest の粒が 1 本以上・全部が実在・ffmpeg が在る。 */
    const exist = PRISTINE_GRAINS.filter((g) => fs.existsSync(path.join(ROOT, SFX_DIR, g))).length;
    const ff = hasFfmpeg();
    rows.push({ where: 'narration 粒 ' + exist + '/' + PRISTINE_GRAINS.length + ' 実在 / ffmpeg ' + (ff ? '有り' : '無し'), ok: PRISTINE_GRAINS.length > 0 && exist === PRISTINE_GRAINS.length && ff, n: exist === PRISTINE_GRAINS.length && PRISTINE_GRAINS.length > 0 ? 1 : 0 });
  }
  return { key, ok: rows.length > 0 && rows.every((r) => r.ok), rows };
}
const AUDIT = MUT_ORDER.map(auditMutation);
console.log('[vps] §0c 変異アンカーの検算 (原本・逐語の件数):');
for (const a of AUDIT) console.log('   ' + (a.ok ? 'OK ' : '⛔ ') + a.key.padEnd(10) + ' ' + a.rows.map((r) => r.where + ' ×' + r.n).join(' + '));
const AUDIT_BAD = AUDIT.filter((a) => !a.ok);
if (AUDIT_BAD.length && (NEGATIVE || MUTATE)) {
  console.error('[vps] ⛔ 変異アンカーが ' + AUDIT_BAD.length + ' 本腐っている (' + AUDIT_BAD.map((a) => a.key).join(',') + ') → 負のコントロールが空振りするので走らせない');
  process.exit(3);
}

/* 配信 mp3 の差し替え (ffmpeg)。flat = 全粒の峰を -6dBFS へ / lead = 頭に 150ms の無音。出力は 128kbps モノラル 44.1kHz (build_sfx と同じ)。 */
let TMP_DIR = null;
function ffmpegGrains(kind) {
  if (!TMP_DIR) TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'df_pen74_' + process.pid + '_'));
  const out = {};
  PRISTINE_GRAINS.forEach((g, i) => {
    const src = path.join(ROOT, SFX_DIR, g);
    const dst = path.join(TMP_DIR, kind + '_' + i + '.mp3');
    let af;
    if (kind === 'flat') {
      const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
      const mm = /max_volume:\s*(-?[\d.]+) dB/.exec((r.stderr || '') + (r.stdout || ''));
      if (!mm) { console.error('[vps] ⛔ volumedetect が峰を返さない: ' + g); process.exit(2); }
      af = 'volume=' + (-6 - parseFloat(mm[1])).toFixed(2) + 'dB';
    } else {
      af = 'adelay=delays=150:all=1';
    }
    cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '128k', dst], { stdio: 'ignore' });
    out[SFX_DIR + g] = fs.readFileSync(dst);
  });
  return out;
}
const _mutCache = {};
function servedSources(key) {
  if (_mutCache[key || '']) return _mutCache[key || ''];
  const out = {};
  for (const f of [F_AUDIO, F_SFXMAN, F_CRED]) out[f] = PRISTINE[f];
  out['__pen74_blank.html'] = BLANK_HTML;
  if (key) {
    const m = MUTATIONS[key];
    for (const f of Object.keys(m.files || {})) {
      let s = PRISTINE[f];
      for (const e of m.files[f]) {
        if (countOf(PRISTINE[f], e.from) !== 1) { console.error('[vps] ⛔ 変異 ' + key + ' の注入点がちょうど 1 箇所ではない: ' + e.from); process.exit(3); }
        s = s.replace(e.from, () => e.to);
      }
      const d = PRISTINE[f].split('\n').filter((l, i) => l !== s.split('\n')[i]).length;
      if (s.split('\n').length !== PRISTINE[f].split('\n').length || d !== m.files[f].length) {
        console.error('[vps] ⛔ 変異 ' + key + ' の差し替えが edits の行数に閉じていない (diff=' + d + ')'); process.exit(3);
      }
      out[f] = s;
    }
    if (m.json) {
      const o = JSON.parse(PRISTINE[F_SFXMAN]);
      if (m.json === 'lazy') delete o.narration.preload;
      if (m.json === 'nonarr') delete o.narration;
      out[F_SFXMAN] = JSON.stringify(o, null, 2) + '\n';
    }
    if (m.grains) Object.assign(out, ffmpegGrains(m.grains));
  }
  _mutCache[key || ''] = out;
  return out;
}
/* fb の腕 (§3a) が配る manifest = 同じ配信スナップショットから narration を抜いたもの。 */
function manifestWithoutNarration(src) { const o = JSON.parse(src); delete o.narration; return JSON.stringify(o, null, 2) + '\n'; }

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[vps] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[vps] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
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
          res.end(Buffer.isBuffer(srcs[rel]) ? srcs[rel] : Buffer.from(srcs[rel], 'utf8')); return;
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
function httpGetBuf(port, rel) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/' + rel.split('/').map(encodeURIComponent).join('/') }, (res) => {
      const bufs = []; res.on('data', (b) => bufs.push(b)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs) }));
    }).on('error', (e) => resolve({ status: 0, body: Buffer.alloc(0), err: String(e) }));
  });
}
/* MPEG オーディオの最初のフレームヘッダ (ID3v2 を飛ばす)。sampleRate と channelMode (3 = mono)。 */
function mpegHeader(buf) {
  let p = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const sz = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    p = 10 + sz + ((buf[5] & 0x10) ? 10 : 0);
  }
  for (; p + 4 <= buf.length; p++) {
    if (buf[p] !== 0xff || (buf[p + 1] & 0xe0) !== 0xe0) continue;
    const ver = (buf[p + 1] >> 3) & 3, layer = (buf[p + 1] >> 1) & 3, sri = (buf[p + 2] >> 2) & 3, bri = (buf[p + 2] >> 4) & 15;
    if (ver === 1 || layer === 0 || sri === 3 || bri === 15) continue;
    const base = [11025, 12000, 8000][sri];
    const sampleRate = ver === 3 ? base * 4 : (ver === 2 ? base * 2 : base);
    return { sampleRate, channelMode: (buf[p + 3] >> 6) & 3, layer: 4 - layer, offset: p };
  }
  return null;
}
function parseCredits(md) {
  const rows = {};
  for (const line of md.split(/\r?\n/)) {
    if (!/^\|/.test(line) || /^\|\s*-/.test(line)) continue;
    const c = line.split('|').slice(1, -1).map((s) => s.trim());
    if (c.length >= 5 && c[0] !== 'ID') rows[c[0]] = { files: c[1], source: c[2], license: c[3], credit: c[4] };
  }
  return rows;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側のコード (⛔ ここに判定ロジックを書かない = 生データを採るだけ)
 * ══════════════════════════════════════════════════════════════════════════════ */
function PAGE_PROBES(scen) {
  try { if (scen) sessionStorage.setItem('dragonfighters.currentScenario', scen); } catch (e) {}
  window.__probe = { bs: 0, osc: 0, edges: [], busEdges: [], bus: {}, busNode: {}, decoded: [], srcBufs: [] };
  try {
    const AC = window.AudioContext;
    const BAC = window.BaseAudioContext || AC;
    const abUrl = new WeakMap(), bufUrl = new WeakMap();
    if (window.Response && Response.prototype.arrayBuffer) {
      const oAB = Response.prototype.arrayBuffer;
      Response.prototype.arrayBuffer = function () {
        let u = null; try { u = new URL(this.url).pathname; } catch (e) {}
        return oAB.apply(this, arguments).then(function (ab) { try { if (u) abUrl.set(ab, u); } catch (e) {} return ab; });
      };
    }
    if (AC && BAC && BAC.prototype.decodeAudioData) {
      const oDec = BAC.prototype.decodeAudioData;
      BAC.prototype.decodeAudioData = function (ab) {
        const u = (ab && typeof ab === 'object') ? abUrl.get(ab) : undefined;   // ⚠ decode で ab は detach される = 先に引く
        const p = oDec.apply(this, arguments);
        if (u && p && typeof p.then === 'function' && this instanceof AC) return p.then(function (b) { try { bufUrl.set(b, u); window.__probe.decoded.push(u); } catch (e) {} return b; });
        return p;
      };
    }
    if (AC && window.AudioBufferSourceNode) {
      const dB = Object.getOwnPropertyDescriptor(AudioBufferSourceNode.prototype, 'buffer');
      if (dB && dB.set) Object.defineProperty(AudioBufferSourceNode.prototype, 'buffer', { configurable: true, enumerable: dB.enumerable, get: dB.get,
        set: function (v) { try { if (this.context instanceof AC) window.__probe.srcBufs.push((v && bufUrl.get(v)) || null); } catch (e) {} return dB.set.call(this, v); } });
    }
    if (AC && BAC) {
      const oBS = BAC.prototype.createBufferSource, oOsc = BAC.prototype.createOscillator, oGain = BAC.prototype.createGain;
      BAC.prototype.createBufferSource = function () { const n = oBS.apply(this, arguments); if (this instanceof AC) window.__probe.bs++; return n; };
      BAC.prototype.createOscillator = function () { const n = oOsc.apply(this, arguments); if (this instanceof AC) window.__probe.osc++; return n; };
      const NAMES = ['master', 'bgm', 'sfx', 'ui', 'voice'];
      let gainCount = 0;
      BAC.prototype.createGain = function () {
        const n = oGain.apply(this, arguments);
        if (this instanceof AC) { if (gainCount < 5) { n.__bus = NAMES[gainCount]; window.__probe.bus[NAMES[gainCount]] = true; window.__probe.busNode[NAMES[gainCount]] = n; } gainCount++; }
        return n;
      };
      /* (2c): バスの利得は audio.js の setGain が setTargetAtTime (失敗時 value =) で書く。⚠ gain.value の読みは、入力の無い (鳴っていない)
       * ノードでは描画スレッドが進めないので古いまま (2026-09-26 実測: 設定は 0.37 なのに value 0.95 のまま) ⇒ 書かれた目標値を記録して読む。 */
      if (window.AudioParam) {
        const oST = AudioParam.prototype.setTargetAtTime;
        AudioParam.prototype.setTargetAtTime = function (v) { try { this.__target = v; } catch (e) {} return oST.apply(this, arguments); };
        const dV = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value');
        if (dV && dV.set) Object.defineProperty(AudioParam.prototype, 'value', { configurable: true, enumerable: dV.enumerable, get: dV.get,
          set: function (v) { try { this.__target = v; } catch (e) {} return dV.set.call(this, v); } });
      }
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
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ユニット
 * ══════════════════════════════════════════════════════════════════════════════ */
const GRAIN_RX = /\/assets\/sfx\/(ui\/narration_[^/?#]+\.mp3)/;
async function newPage(ctx, tag, scen) {
  const bctx = await ctx.browser.createBrowserContext();
  const page = await bctx.newPage();
  page.__tag = tag; page.__errs = []; page.__bctx = bctx; page.__grainReqs = []; page.__t0 = Date.now();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => page.__errs.push(String((e && e.message) || e).slice(0, 200)));
  page.on('request', (r) => { const m = GRAIN_RX.exec(r.url()); if (m) page.__grainReqs.push('/' + SFX_DIR + m[1]); });
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
const ARM_QS = { smp: '', ps0: '?pensample=0', pv0: '?penvoice=0', fb: '' };

const UNITS = {
  async META(ctx) {
    const m = await httpGetBuf(ctx.port, F_SFXMAN), c = await httpGetBuf(ctx.port, F_CRED);
    let man = null; try { man = JSON.parse(m.body.toString('utf8')); } catch (e) {}
    const files = (man && man.narration && Array.isArray(man.narration.files)) ? man.narration.files : [];
    const grains = [];
    for (const f of files) {
      const g = await httpGetBuf(ctx.port, SFX_DIR + f);
      grains.push({ f, url: '/' + SFX_DIR + f, status: g.status, bytes: g.body.length, hdr: g.status === 200 ? mpegHeader(g.body) : null });
    }
    let raw = null;
    try { raw = cp.execFileSync('git', ['ls-files', 'sfx-pipeline/raw'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { raw = null; }
    ctx.D.META = { manStatus: m.status, manKeys: man ? Object.keys(man) : null, narr: man ? man.narration || null : null,
      urls: grains.map((g) => g.url), grains, credStatus: c.status, credits: parseCredits(c.body.toString('utf8')), rawFiles: raw };
  },
  async GRAIN(ctx) {
    const urls = (ctx.D.META || {}).urls || [];
    const page = await newPage(ctx, 'grain', null);
    try {
      await page.goto('http://127.0.0.1:' + ctx.port + '/__pen74_blank.html', { waitUntil: 'load', timeout: 60000 });
      ctx.D.GRAIN = await page.evaluate(async (urls, LEAD_DB) => {
        const thr = Math.pow(10, LEAD_DB / 20);
        const out = [];
        for (const u of urls) {
          try {
            const ab = await (await fetch(u, { cache: 'no-store' })).arrayBuffer();
            const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab);
            let pk = 0, lead = -1;
            for (let ch = 0; ch < b.numberOfChannels; ch++) {
              const d = b.getChannelData(ch);
              for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; if (a > thr && (lead < 0 || i < lead)) { lead = i; } }
            }
            out.push({ u, durMs: b.duration * 1000, ch: b.numberOfChannels, ctxSr: b.sampleRate, peakDb: pk > 0 ? 20 * Math.log10(pk) : -Infinity, leadMs: lead < 0 ? null : lead / b.sampleRate * 1000 });
          } catch (e) { out.push({ u, err: String((e && e.message) || e).slice(0, 120) }); }
        }
        return out;
      }, urls, LEAD_DB);
      ctx.D.GRAIN_TITLE = await page.evaluate(() => document.title);
    } catch (e) { ctx.unitErr.GRAIN = String((e && e.message) || e).slice(0, 300); }
    await closePage(ctx, page);
  },
  async PLAY(ctx) {
    const D = {};
    const NU = (ctx.D.META || {}).urls || [];
    const fbMan = manifestWithoutNarration(servedSources(ctx.mutKey)[F_SFXMAN]);
    for (const kind of ['index', 'tavern']) {
      for (const arm of ['smp', 'ps0', 'pv0', 'fb']) {
        const page = await newPage(ctx, 'play:' + kind + ':' + arm, kind === 'index' ? SCEN : null);
        const o = { kind, arm };
        try {
          if (arm === 'fb') {
            await page.setRequestInterception(true);
            page.on('request', (r) => {
              if (r.isInterceptResolutionHandled && r.isInterceptResolutionHandled()) return;
              if (/\/assets\/sfx\/sfx-manifest\.json(\?|$)/.test(r.url())) r.respond({ status: 200, contentType: MIME['.json'], body: fbMan, headers: { 'Cache-Control': 'no-store' } });
              else r.continue();
            });
          }
          await page.goto('http://127.0.0.1:' + ctx.port + '/' + kind + '.html' + ARM_QS[arm], { waitUntil: 'load', timeout: 60000 });
          await page.waitForFunction(() => !!(window.GameAudio && window.GameSettings && document.body && GameAudio.__sfxManifestLoaded && GameAudio.__sfxManifestLoaded()), { timeout: 30000, polling: 50 });
          await sleep(300);
          Object.assign(o, await page.evaluate(async (NU, LP, arm, PLAYS, VB, VA) => {
            const sl = (ms) => new Promise((res) => setTimeout(res, ms));
            const r = { title: document.title };
            GameAudio.unlock();
            await sl(250);
            const P = window.__probe;
            /* 先読みを確実に済ませる (⭐ (2e) が eager を別に測る)。未 decode は playSampled が合成へ落ちる = 緑が嘘になる。 */
            try { GameAudio.preloadSfx(['narration']); } catch (e) {}
            const nDec = () => NU.filter((u) => P.decoded.indexOf(u) >= 0).length;
            const tW = Date.now();
            if (arm !== 'fb') while (NU.length && nDec() < NU.length && Date.now() - tW < 15000) await sl(50);
            r.narrDecoded = nDec(); r.narrTotal = NU.length; r.decodeWaitMs = Date.now() - tW;
            r.busEdges = P.busEdges.slice(); r.busNames = Object.keys(P.bus);
            GameAudio.setVoiceVolume(VB);
            await sl(400);
            /* ⭐ 観測先を空へ戻してから本番の口 (playSfx) だけに書かせる (同期実行 = 割り込みなし)。 */
            P.bs = 0; P.osc = 0; P.edges = []; P.srcBufs = [];
            GameAudio.playSfx('narration');
            r.one = { bs: P.bs, osc: P.osc, edges: P.edges.slice(), srcBufs: P.srcBufs.slice() };
            P.edges = []; GameAudio.playSfx('button'); r.button = P.edges.slice();
            P.edges = []; GameAudio.playSfx('hit'); r.hit = P.edges.slice();
            if (arm === 'smp') {
              const seen = {}; let single = 0;
              for (let k = 0; k < PLAYS; k++) {
                P.bs = 0; P.osc = 0; P.srcBufs = [];
                GameAudio.playSfx('narration');
                if (P.bs === 1 && P.osc === 0 && P.srcBufs.length === 1 && P.srcBufs[0]) { single++; seen[P.srcBufs[0]] = (seen[P.srcBufs[0]] || 0) + 1; }
              }
              r.plays = { n: PLAYS, single, distinct: Object.keys(seen) };
              await sl(500);
            }
            const gains = () => { const g = {}; for (const k of ['master', 'sfx', 'ui', 'voice']) g[k] = (P.busNode[k] && typeof P.busNode[k].gain.__target === 'number') ? +P.busNode[k].gain.__target.toFixed(4) : null; return g; };
            GameAudio.openSettings();
            const ov = document.getElementById('gameSettingsOverlay');
            const txt = ov ? ov.textContent : '';
            const iO = txt.indexOf('OtoLogic');
            r.credit = iO >= 0 ? txt.slice(Math.max(0, iO - 20), iO + 30) : null;
            if (arm === 'smp') {
              let sldr = null;
              if (ov) ov.querySelectorAll('input[type=range]').forEach((el) => {
                let nd = el;
                for (let i = 0; i < 4 && nd && !sldr; i++) { nd = nd.parentElement; if (nd && nd.firstChild && nd.firstChild.textContent === LP) sldr = el; }
              });
              r.gainsBefore = gains(); r.voiceBefore = GameSettings.get().voice;
              if (sldr) { sldr.value = String(Math.round(VA * 100)); sldr.dispatchEvent(new Event('input', { bubbles: true })); }
              r.sliderFound = !!sldr;
              await sl(600);
              r.gainsAfter = gains(); r.voiceAfter = GameSettings.get().voice;
              try { r.ctxState = P.busNode.voice ? P.busNode.voice.context.state + '@' + P.busNode.voice.context.currentTime.toFixed(2) : null; } catch (e) {}
            }
            try { GameAudio.closeSettings(); } catch (e) {}
            return r;
          }, NU, LABEL_PEN, arm, PLAYS_2D, VOL_BEFORE, VOL_AFTER));
          o.grainReqs = Array.from(new Set(page.__grainReqs));
        } catch (e) { o.err = String((e && e.message) || e).slice(0, 300); }
        await closePage(ctx, page);
        D[kind + ':' + arm] = o;
        console.log('[vps]   play:' + kind + ':' + arm + ' decode ' + o.narrDecoded + '/' + o.narrTotal + ' (' + o.decodeWaitMs + 'ms) 1回 ' + J(o.one ? [o.one.bs, o.one.osc, o.one.edges] : null)
          + (o.plays ? ' / 200回 散らばり ' + o.plays.distinct.length + ' 種 (単発 ' + o.plays.single + ')' : '') + ' / 粒の要求 ' + (o.grainReqs || []).length + (o.err ? ' / ERR ' + o.err : ''));
      }
    }
    ctx.D.PLAY = D;
  },
  async GATE(ctx) {
    const D = {};
    const NU = (ctx.D.META || {}).urls || [];
    for (const kind of ['index', 'tavern']) {
      const page = await newPage(ctx, 'gate:' + kind, kind === 'index' ? SCEN : null);
      const o = { kind };
      try {
        await page.goto('http://127.0.0.1:' + ctx.port + '/' + kind + '.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction((hb) => { const h = document.getElementById('dmHint'); return !!h && h.classList.contains('show') && (h.textContent || '').trim() === hb; },
          { timeout: 45000, polling: 50 }, HINT_BEGIN);
        o.gate = true;
        o.title = await page.evaluate(() => document.title);
        o.reqsAtGate = Array.from(new Set(page.__grainReqs)).length;
        const tG = Date.now();
        if (kind === 'tavern') await page.click('#prologueOverlay'); else await page.mouse.click(640, 400);
        await page.waitForFunction(() => { const b = document.getElementById('dmBody'); return !!b && (b.textContent || '').length >= 1; }, { timeout: 30000, polling: 10 });
        o.firstCharMs = Date.now() - tG;
        const at = Array.from(new Set(page.__grainReqs));
        o.reqsAtFirst = at.length;
        o.missing = NU.filter((u) => at.indexOf(u) < 0);
      } catch (e) { o.err = String((e && e.message) || e).slice(0, 300); }
      await closePage(ctx, page);
      D[kind] = o;
      console.log('[vps]   gate:' + kind + ' 粒の要求 関門 ' + o.reqsAtGate + ' → 1文字目 ' + o.reqsAtFirst + '/' + NU.length + ' (' + o.firstCharMs + 'ms)' + (o.err ? ' / ERR ' + o.err : ''));
    }
    ctx.D.GATE = D;
  },
};
const UNIT_ORDER = ['META', 'GRAIN', 'PLAY', 'GATE'];

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
const f1 = (x) => (typeof x === 'number' && isFinite(x)) ? x.toFixed(1) : String(x);
const f2 = (x) => (typeof x === 'number' && isFinite(x)) ? x.toFixed(2) : String(x);
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.01;

function judge(ctx, R) {
  const D = ctx.D;
  const ran = (u) => ctx.ran.has(u);
  const E = (u) => ctx.unitErr[u] ? ' / ⛔ユニット例外 ' + u + ': ' + ctx.unitErr[u] : '';
  const M = D.META || {};
  const NU = M.urls || [];
  const N = NU.length;
  const isNarr = (u) => !!u && NU.indexOf(u) >= 0;

  /* ── §0 装置 ── */
  if (ran('META')) {
    const st = (M.grains || []).map((g) => g.status);
    R.check('(0a)', '[装置] 配信 manifest の narration.files の本数 N を実体から導出・' + N_MIN + ' ≤ N ≤ ' + N_MAX + '・全粒が HTTP 200 (⭐ これが無いと §1 / §2 が空振りで永久緑)',
      M.manStatus === 200 && N >= N_MIN && N <= N_MAX && st.length === N && st.every((s) => s === 200),
      'manifest ' + M.manStatus + ' キー ' + (M.manKeys || []).length + ' 件 / N = ' + N + ' / 200 = ' + st.filter((s) => s === 200).length + '/' + st.length);
    R.check('(0b)', '[装置] git ls-files sfx-pipeline/raw = 0 件 (元素材をコミットしていない)',
      Array.isArray(M.rawFiles) && M.rawFiles.length === 0, M.rawFiles === null ? 'git 失敗' : M.rawFiles.length + ' 件 ' + J(M.rawFiles.slice(0, 3)));
    R.check('(0c)', '[装置] 変異 ' + MUT_ORDER.length + ' 本の注入点が原本 (起動時に凍結した配信スナップショット) でちょうど 1 箇所ずつ',
      AUDIT_BAD.length === 0, AUDIT.map((a) => (a.ok ? '' : '⛔') + a.key + '@' + a.rows.map((r) => r.where + '×' + r.n).join('+')).join(' / '));
  }

  /* ── §1 粒の中身 ── */
  if (ran('META') && ran('GRAIN')) {
    const G = D.GRAIN || [];
    const ok = G.filter((g) => !g.err);
    const all = N >= 1 && G.length === N && ok.length === N;
    const durs = ok.map((g) => g.durMs), leads = ok.map((g) => g.leadMs), peaks = ok.map((g) => g.peakDb);
    const mn = (a) => a.length ? Math.min.apply(null, a) : NaN, mx = (a) => a.length ? Math.max.apply(null, a) : NaN;
    const decErr = G.filter((g) => g.err).map((g) => g.u + ':' + g.err).slice(0, 2).join(' | ');
    R.check('(1a)', '全粒の長さ ' + DUR_MIN_MS + '〜' + DUR_MAX_MS + 'ms (配信 mp3 をページ内 decodeAudioData・切り出し 40〜400 + preMs + mp3 の端数)',
      all && durs.every((d) => d >= DUR_MIN_MS && d <= DUR_MAX_MS),
      'decode ' + ok.length + '/' + N + ' 長さ ' + f1(mn(durs)) + '〜' + f1(mx(durs)) + 'ms' + (decErr ? ' / ⛔' + decErr : '') + E('GRAIN'));
    R.check('(1b)', '先頭無音なし: 各粒で最初に ' + LEAD_DB + ' dBFS を超えるのが ' + LEAD_MAX_MS + 'ms 以内 (元素材の 113〜192ms が残っていない)',
      all && leads.every((l) => l !== null && l <= LEAD_MAX_MS),
      '最初の超え ' + f1(mn(leads.filter((l) => l !== null))) + '〜' + f1(mx(leads.filter((l) => l !== null))) + 'ms / 超えない粒 ' + leads.filter((l) => l === null).length);
    R.check('(1c)', '割れなし: 全粒の峰 ≤ ' + PEAK_MAX_DB + ' dBFS',
      all && peaks.every((p) => p <= PEAK_MAX_DB), '峰の最大 ' + f2(mx(peaks)) + ' dBFS');
    R.check('(1d)', '★ 強弱が残っている (罠C): 粒の峰の最大 − 最小 ≥ ' + PEAK_SPREAD_MIN_DB + 'dB (粒ごとに正規化すると ≈0dB に潰れる)',
      all && (mx(peaks) - mn(peaks)) >= PEAK_SPREAD_MIN_DB, '峰 ' + f2(mn(peaks)) + '〜' + f2(mx(peaks)) + ' dBFS / 幅 ' + f2(mx(peaks) - mn(peaks)) + 'dB');
    const hdrs = (M.grains || []).map((g) => g.hdr);
    R.check('(1e)', 'モノラル・44.1kHz: decode の numberOfChannels = 1 かつ配信バイトの MPEG フレームヘッダが 44100Hz・mono (⚠ decode 側の sampleRate は文脈の値 = 測れない)',
      all && ok.every((g) => g.ch === 1) && hdrs.length === N && hdrs.every((h) => h && h.sampleRate === 44100 && h.channelMode === 3),
      'ch ' + J(Array.from(new Set(ok.map((g) => g.ch)))) + ' / ヘッダ sr ' + J(Array.from(new Set(hdrs.map((h) => h && h.sampleRate)))) + ' mode ' + J(Array.from(new Set(hdrs.map((h) => h && h.channelMode))))
      + ' (3 = mono) / decode 文脈 sr ' + J(Array.from(new Set(ok.map((g) => g.ctxSr)))));
  }

  /* ── §2〜§5 実ページ ── */
  const PL = D.PLAY || {};
  const P = (k) => PL[k] || {};
  const pages = ['index', 'tavern'];
  const decodedAll = (o) => N >= 1 && o.narrTotal === N && o.narrDecoded === N;
  const one = (o) => o.one || { bs: -1, osc: -1, edges: [], srcBufs: [] };
  const wired = (o) => ['master->destination', 'bgm->master', 'voice->master'].every((e) => (o.busEdges || []).indexOf(e) >= 0) && (o.busNames || []).length === 5;
  const synth3 = (o) => one(o).bs === 3 && one(o).osc === 0 && one(o).srcBufs.length === 3 && one(o).srcBufs.every((u) => u === null) && J(one(o).edges) === J(['voice', 'voice', 'voice']);
  const armStr = (k) => { const o = P(k), x = one(o); return k + ' dec ' + o.narrDecoded + '/' + o.narrTotal + ' bs' + x.bs + '/osc' + x.osc + ' 粒 ' + x.srcBufs.filter(isNarr).length + ' 出所無し ' + x.srcBufs.filter((u) => u === null).length + ' 出口 ' + J(x.edges) + (o.err ? ' ⛔' + o.err : ''); };
  if (ran('PLAY')) {
    R.check('(2a)', '★ 全粒 decode 済の上で playSfx("narration") 1 回 = BufferSource ちょうど 1 (buffer の出所が manifest の粒)・出所の無い buffer 0・Oscillator 0 (index / tavern・スイッチ無し)',
      pages.every((k) => { const o = P(k + ':smp'), x = one(o); return decodedAll(o) && x.bs === 1 && x.osc === 0 && x.srcBufs.length === 1 && isNarr(x.srcBufs[0]); }),
      pages.map((k) => armStr(k + ':smp')).join(' / ') + E('PLAY'));
    R.check('(2b)', '★ 罠A: その出口 = voice バス (1 本だけ)。他の音 (button = ui / hit = sfx) は不変 [装置: 最初の 5 個の Gain が master→destination / bgm→master / voice→master と繋がる]',
      pages.every((k) => { const o = P(k + ':smp'); return wired(o) && J(one(o).edges) === J(['voice']) && J(o.button) === J(['ui']) && (o.hit || []).length > 0 && o.hit.every((e) => e === 'sfx'); }),
      pages.map((k) => { const o = P(k + ':smp'); return k + ' 出口 ' + J(one(o).edges) + ' button ' + J(o.button) + ' hit ' + J(o.hit) + ' 配線 ' + wired(o); }).join(' / '));
    const knob = (o) => {
      const b = o.gainsBefore || {}, a = o.gainsAfter || {}, route = one(o).edges.length === 1 ? one(o).edges[0] : null;
      return o.sliderFound === true && near(o.voiceBefore, VOL_BEFORE) && near(o.voiceAfter, VOL_AFTER) && near(b.voice, VOL_BEFORE) && near(a.voice, VOL_AFTER)
        && !!route && near(b[route], VOL_BEFORE) && near(a[route], VOL_AFTER)
        && ['master', 'sfx', 'ui'].every((n) => typeof b[n] === 'number' && Math.abs(a[n] - b[n]) < 1e-4);
    };
    R.check('(2c)', '★ 「語り 音量」つまみを 37 へ → 録音が流れ込むバス (2b の出口) と voice バスの利得が ' + VOL_BEFORE + ' → ' + VOL_AFTER + '・sfx / ui / master は不変',
      pages.every((k) => knob(P(k + ':smp'))),
      pages.map((k) => { const o = P(k + ':smp'); return k + ' つまみ ' + o.sliderFound + ' voice 設定 ' + o.voiceBefore + '→' + o.voiceAfter + ' 出口 ' + J(one(o).edges) + ' 前 ' + J(o.gainsBefore) + ' 後 ' + J(o.gainsAfter) + ' (ctx ' + o.ctxState + ')'; }).join(' / '));
    R.check('(2d)', '200 回鳴らして選ばれた粒 (buffer の出所 URL) が N/2 種以上 (⛔ 長さでは数えない)',
      N >= 1 && pages.every((k) => { const p = P(k + ':smp').plays; return !!p && p.single === PLAYS_2D && p.distinct.every(isNarr) && p.distinct.length >= N / 2; }),
      pages.map((k) => { const p = P(k + ':smp').plays || {}; return k + ' ' + (p.distinct || []).length + ' 種 / N/2 = ' + (N / 2) + ' (粒 1 つの回 ' + p.single + '/' + PLAYS_2D + ')'; }).join(' / '));
    R.check('(3a)', 'fallback: manifest から narration を抜いた配信 → playSfx("narration") は #73 の合成 3 画 (出所の無い buffer 3・Oscillator 0)・3 画すべて voice バス・粒の要求 0',
      pages.every((k) => { const o = P(k + ':fb'); return !o.err && synth3(o) && (o.grainReqs || []).length === 0; }),
      pages.map((k) => armStr(k + ':fb') + ' 粒の要求 ' + (P(k + ':fb').grainReqs || []).length).join(' / '));
    R.check('(4a)', '撤退 ?pensample=0: 全粒 decode 済でも合成 3 画 (出所の無い buffer 3)・3 画すべて voice バス・録音の粒 0 (index / tavern)',
      pages.every((k) => { const o = P(k + ':ps0'); return decodedAll(o) && synth3(o); }),
      pages.map((k) => armStr(k + ':ps0')).join(' / '));
    R.check('(4b)', '★ 罠B: ?penvoice=0 → 全粒 decode 済 (= manifest に narration が在る) でも Oscillator 1 (「ピッ」)・BufferSource 0・ui バス (index / tavern)',
      pages.every((k) => { const o = P(k + ':pv0'), x = one(o); return decodedAll(o) && x.osc === 1 && x.bs === 0 && x.srcBufs.length === 0 && J(x.edges) === J(['ui']); }),
      pages.map((k) => armStr(k + ':pv0')).join(' / '));
    R.check('(5b)', 'openSettings() のクレジット行に OtoLogic (スイッチ無し・?pensample=0 の両腕 × index / tavern)',
      pages.every((k) => ['smp', 'ps0'].every((a) => !!P(k + ':' + a).credit)),
      pages.map((k) => ['smp', 'ps0'].map((a) => k + ':' + a + ' ' + J(P(k + ':' + a).credit)).join(' ')).join(' / '));
  }
  if (ran('GATE')) {
    const G = D.GATE || {};
    R.check('(2e)', '罠E: 開始のクリック → 語りの 1 文字目の時点で、全粒 (N 本) の要求が発行済み (preload: "eager"・index / tavern)',
      N >= 1 && pages.every((k) => { const o = G[k] || {}; return o.gate && !o.err && Array.isArray(o.missing) && o.missing.length === 0; }),
      pages.map((k) => { const o = G[k] || {}; return k + ' 関門 ' + o.reqsAtGate + ' → 1文字目 ' + o.reqsAtFirst + '/' + N + ' (' + o.firstCharMs + 'ms)' + (o.err ? ' ⛔' + o.err : ''); }).join(' / ') + E('GATE'));
  }
  if (ran('META')) {
    const C = M.credits || {};
    const nr = C.narration;
    const keys = M.manKeys || [];
    const missing = keys.filter((k) => !C[k]);
    R.check('(5a)', '罠D: 配信 CREDITS.md に narration 行があり、出典 / ライセンス欄が仮置き (' + PLACEHOLDER_SOURCE + ' / ' + PLACEHOLDER_LICENSE + ') でない・配信 manifest の全 ID に行がある',
      M.credStatus === 200 && !!nr && !!nr.license && nr.license !== PLACEHOLDER_LICENSE && nr.license.indexOf('\u8981 inbox') < 0 && !!nr.source && nr.source !== PLACEHOLDER_SOURCE && !!nr.credit
        && keys.length > 0 && missing.length === 0,
      'status ' + M.credStatus + ' 行 ' + Object.keys(C).length + ' / narration ' + (nr ? J([nr.source, nr.license]) : '無し') + ' / manifest ' + keys.length + ' ID のうち行が無い ' + J(missing));
  }
  /* ── (0f) 起動 ── */
  const boots = [];
  if (ran('GRAIN')) boots.push({ k: 'GRAIN', ok: !!D.GRAIN_TITLE && !ctx.unitErr.GRAIN });
  if (ran('PLAY')) for (const k of Object.keys(PL)) boots.push({ k: 'PLAY:' + k, ok: !!PL[k].title && !PL[k].err });
  if (ran('GATE')) for (const k of Object.keys(D.GATE || {})) boots.push({ k: 'GATE:' + k, ok: !!D.GATE[k].title && !!D.GATE[k].gate && !D.GATE[k].err });
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

async function runUnits(browser, port, units, R, label, mutKey) {
  const ctx = { browser, port, mutKey: mutKey || null, D: {}, ran: new Set(), unitErr: {}, errs: [], pages: [] };
  const list = ['META'].concat(UNIT_ORDER.filter((u) => u !== 'META' && units.indexOf(u) >= 0));
  for (const u of list) {
    const t0 = Date.now();
    ctx.ran.add(u);
    try { await UNITS[u](ctx); }
    catch (e) { ctx.unitErr[u] = String((e && e.message) || e).slice(0, 300); console.log('  ⛔ ユニット ' + u + ' 例外: ' + ctx.unitErr[u]); }
    for (const p of ctx.pages.slice()) await closePage(ctx, p);
    console.log('[vps] ' + label + ' ユニット ' + u + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
  }
  judge(ctx, R);
  return ctx;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_pensample_');
  console.log('[vps] 原本の narration 粒 = ' + PRISTINE_GRAINS.length + ' 本 / preload ' + J((PRISTINE_MAN.narration || {}).preload));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ALL = UNIT_ORDER.slice();
  let exitCode = 0;
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準 (全ユニット)。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const srv0 = await startServer(PORT, null);
      const R0 = mkResults();
      await runUnits(browser, PORT, ALL, R0, '(素・基準)', null);
      await stopServer(srv0);
      const s0 = summarize(R0, '[素・基準]');
      if (s0.failed) {
        console.error('[vps] ⛔ 素の基準で FAIL がある — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        const allIds = R0.map((r) => r.id);
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const srv = await startServer(port, key);
          console.log('\n[vps] ════════ 変異 ' + key + ' (port ' + port + ' / ' + auditMutation(key).rows.map((r) => r.where).join(' + ') + ') ════════');
          const R = mkResults();
          try { await runUnits(browser, port, ALL, R, '[変異 ' + key + ']', key); }
          catch (e) { console.log('  ⛔ ドライバ例外: ' + String((e && e.message) || e)); }
          await stopServer(srv);
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0f = R.filter((r) => r.id === '(0f)')[0];
          /* ⭐ 起動確認 = (0f) が緑 = 構文破壊で全部赤になる偽の検出を見分ける。 */
          const bootOk = !!r0f && r0f.ok;
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          /* ⭐ NEG_GREEN 相当: 担当の外は全部緑のまま + 素と同じ assert が全部出た (赤の集合 = 担当 に完全一致)。 */
          const leak = red.filter((x) => want.indexOf(x) < 0);
          const absent = allIds.filter((id) => !R.some((r) => r.id === id));
          const ok = bootOk && want.length > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vps] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + ' / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ ' + (!bootOk ? '起動確認 NG ' : '') + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, red, ok, bootOk });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (赤 = 担当に完全一致)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(10) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vps] --negative OK: ' + report.length + ' 本すべて担当ラベルだけが赤くなりました (空振り 0・漏れ 0)');
        else console.error('[vps] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const srv = await startServer(port, MUTATE);
      const R = mkResults();
      await runUnits(browser, port, UNITS_ARG.length ? UNITS_ARG : ALL, R, '[変異 ' + MUTATE + ' (手回し)]', MUTATE);
      await stopServer(srv);
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vps] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const srv = await startServer(PORT, null);
      const R = mkResults();
      await runUnits(browser, PORT, UNITS_ARG.length ? UNITS_ARG : ALL, R, '(素)', null);
      await stopServer(srv);
      const s = summarize(R, '');
      exitCode = s.failed ? 1 : 0;
    }
  } catch (e) {
    console.error('[vps] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
    if (TMP_DIR) { try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) {} }
  }
  console.log('[vps] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
