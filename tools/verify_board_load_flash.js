#!/usr/bin/env node
/*
 * verify_board_load_flash.js — 実装依頼書 #85「クエスト開始時に白い石床が一瞬見える」の受入ドライバ
 *   (依頼書 2026-10-04_board-load-flash.md §8 + §12-1b の (3b) / noreq)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_board_load_flash.js                       # 素 (port 10567)
 *   node tools/verify_board_load_flash.js --negative            # 素の基準 + 変異 6 本 (port 10568〜10573)
 *   node tools/verify_board_load_flash.js --negative --only nogate,noreq
 *   node tools/verify_board_load_flash.js --mutate noloop       # 変異 1 本を載せて手回し (担当表を実走で決める用)
 *   node tools/verify_board_load_flash.js --base-index <file>   # (5a) の基準 index.html を git でなくファイルから
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 内蔵サーバで §2-3 の正規表現 (SLOW_RE) に当たる素材 = シナリオ別の床 PNG と卓上マップの絵 JPG だけを
 *     遅らせる / 404 にする。390x844 で開き、DM の語りで止まっている静止した盤面を観測する。
 *   - 2 経路で突き合わせる: ① 画素 (#mapCanvas の平均輝度と toDataURL の sha1) ② 呼び出しの記録
 *     (evaluateOnNewDocument で drawImage を包み、床2.png の Image を描いた時刻を全部控える)。
 *     ⭐ #mapCanvas だけを読むので HUD と語りの枠 (DOM) は最初から入らない。
 *   - 撮る時刻はページ内の setTimeout で取る (node 側のポーリングだと +100ms の撮影が遅れる)。
 *     「揃った」= floorPattern が非 null かつ全部の絵が loaded (10ms 間隔の見張り)。
 *   - 腕ごとに配信の条件 (遅延・404・index の版・キャッシュ) を変えるので、ページは /__arm/<id>/index.html から開く
 *     (index.html の素材参照は全部相対 ⇒ 素材の URL にも腕の id が乗り、サーバが腕を見分けられる)。
 *   - (5a) の基準は e3ce2b0 (= #85 着手前) の index.html。`git show e3ce2b0:index.html` を起動時に 1 回取り出し、
 *     作業ツリーと同じ CRLF へ戻して配る (影のツリーは作らない・依頼書 §12-0)。
 *   - ⚠ K8: 撤退の腕で「届いた後の最終盤面」を比べる assert は作らない (e3ce2b0 にもある既存の競合で不安定)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] 遅延が効いている: 遅延の腕 (素 / 撤退 / 基準 × 6 シナリオ) の 1500ms で floorPattern === null・
 *           絵が 1 枚以上で全部 loaded === false
 *      (0b) [装置] 同じ 18 腕の 1500ms で floorTexLoaded === true (予備床は届いている = 直す前なら白い丸石の状況)
 *      (0c) [装置] 撤退の腕 ?boardfade=0 + 遅延で、1500ms までに床2.png の drawImage が 1 回以上 (6 シナリオ)
 *      (0d) [装置] 全ページで pageerror 0 件 (本ドライバ独自の追加)
 *   §1 (1a) 遅延 4000ms・6 シナリオで、1500ms までの床2.png の drawImage が 0 回
 *      (1b) 同じ腕の 1500ms の平均輝度が 30 以下 かつ 同じ腕の ?boardfade=0 より 100 以上低い (閾値の根拠は依頼書 §12-2)
 *   §2 (2a) 森・遅延 4000ms: 揃った +100ms の平均輝度が、暗い時点 (1500ms) と落ち着いた時点 (+1500ms) のあいだ (各 5 の余白)
 *      (2b) 揃った +1000ms と +1500ms のハッシュが一致し、+1500ms の後に renderMap() を強制しても盤面が変わらない
 *           (= ループが最後の濃さまで描いて止まった。⭐ 強制描画の比較が無いと noloop で両方「途中の濃さ」のまま一致して緑になる)
 *      (2c) (2b) の盤面が、遅延なしで開いて落ち着いた森の盤面 (揃った +1000ms) と同じハッシュ
 *   §3 (3a) 遅延なし・6 シナリオ: 揃った瞬間のハッシュ = 揃った +1000ms のハッシュ (揃うのは 1500ms より前)
 *      (3b) 砦・遅延なし・キャッシュを許す配信: 盤面が揃ってから enterNode("n7") → enterNode("n4") (再訪)。
 *           どちらも絵の待ち時間 (読み始め→到着) が 1500ms 未満で、入場直後 / +50 / +150 / +1000ms の
 *           boardFadeAlpha が全部 1、#mapCanvas への絵の drawImage が 1 回以上で globalAlpha < 1 が 0 回。
 *           対照: 絵だけ 2500ms 遅らせた別ページで enterNode("n7") すると待ち時間 > 1500 で globalAlpha < 1 が出る
 *           (K7 / ユーザー決定「待ち時間で判定」の受入・依頼書 §12-1b)
 *   §4 (4a) 森・本来の床と絵を 404: 3000ms までに床2.png の drawImage が 1 回以上 (予備床で盤面が見える)
 *           ⚠ 依頼書 §8 の「1500ms 以降に」は崩れ (K9): 404 は 200ms 台に確定し、予備床はその時の描画 (208〜220ms) だけで
 *             以後は描き直されない (静止盤面)。「見えている」は (4b) の 1500 / 3000ms の輝度で測る
 *      (4b) 同じ腕の 3000ms の平均輝度が、§1 の森の暗い盤面より 100 以上高い (永久に暗くならない)
 *   §5 (5a) ?boardfade=0 + 遅延 4000ms の 1500ms の盤面ハッシュが、e3ce2b0 の index.html を配った同じ腕と一致 (6 シナリオ)
 *   ⛔ 測らないこと (依頼書 §8): フェードの見た目 (300ms・ease の形)・暗い盤面の正確な色・壁 (Pass 2 以降)
 *
 * ■ ⚠ 計測機構
 *   - index.html は起動時に 1 回だけ readFileSync して凍結し、変異はその文字列をメモリ上で差し替える
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。素と各変異はポート = オリジンが違う。
 *   - 起動時に全変異のアンカーを原本で検算する (index.html でちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。崩れたら素でも exit 3。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。担当は --mutate で実走して決めた。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10567** (素) / 変異 **10568〜10573** (6 本・MUTATIONS の並び順)。次の新規ドライバ base = 10574。
 * ■ 所要は依頼書 §12-2 に記録。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10567'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const BASE_INDEX_FILE = arg('base-index', null);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = (s) => (s ? crypto.createHash('sha1').update(s).digest('hex').slice(0, 12) : null);

/* 依頼書が決めた条件 (データ) */
const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const FOREST = 'bandits-forest', FORT = 'orc-fort';
const SLOW_RE = /(シナリオ\d床|床1|caravan_road_floor)\.png$|room_[^/]*\.jpg$/;   // 依頼書 §2-3
const DELAY_MS = 4000;
const SHOT_MS = 1500;               // 依頼書 §8 の「1500ms の時点」
const SHOT_404_MS = 3000;
const FADE_REL = [100, 1000, 1500]; // 揃った時刻からの撮影 (依頼書 §8 §2)
const MIN_WAIT_MS = 1500;           // 依頼書 §5 BOARD_FADE_MIN_WAIT_MS
const ENTER_SLOW_MS = 2500;         // (3b) 対照: 絵だけ遅らせる
const BASE_REV = 'e3ce2b0';
/* 閾値 (根拠は依頼書 §12-2): 暗い盤面 = #0a0a0a の輝度 10.0 / 白い丸石 186.2 / 落ち着いた盤面 52〜86 */
const DARK_MAX = 30;
const GAP_MIN = 100;
const MID_MARGIN = 5;
const VIEW = { width: 390, height: 844, deviceScaleFactor: 1 };

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const PRISTINE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
let BASE_HTML;
try {
  const raw = BASE_INDEX_FILE ? fs.readFileSync(BASE_INDEX_FILE, 'utf8')
    : execFileSync('git', ['show', BASE_REV + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  BASE_HTML = raw.replace(/\r?\n/g, '\r\n');   // ⚠ blob は LF・作業ツリーは CRLF (依頼書 §12-0)
} catch (e) { envFail('(5a) の基準 index.html を取り出せない (git show ' + BASE_REV + ':index.html / --base-index): ' + ((e && e.message) || e)); }
if (BASE_HTML.indexOf('BOARD_FADE_ON') >= 0) vetFail('基準 ' + BASE_REV + ' の index.html に既に BOARD_FADE_ON が在る (基準を取り違えている)');
if (PRISTINE.indexOf('BOARD_FADE_ON') < 0) vetFail('配信する index.html に BOARD_FADE_ON が無い (#85 実装前のツリーで走らせている)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 5 本 + §12-1b の noreq)。アンカーは依頼書 §12-1b の表 (index.html で 1 件)。
 * ⚠ 置換は 1 行の中だけ (行数不変)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* Pass 1b のフォールバック枝を元へ戻す (floorTex1Failed を見ない = 待っている間も床2.png を敷く) */
  fallback: [
    { from: '      } else if (!boardFloorWaiting) {', to: '      } else { /* ★変異fallback */' }],
  /* フェードの rAF ループを消す (依頼書 §2-4 の罠) */
  noloop: [
    { from: '      requestAnimationFrame(boardFadeTick);', to: '      /* ★変異noloop requestAnimationFrame */' }],
  /* 閾値 0 = 常にフェード (依頼書 §2-5 の罠) */
  nogate: [
    { from: '    const BOARD_FADE_MIN_WAIT_MS = 1500;', to: '    const BOARD_FADE_MIN_WAIT_MS = 0; /* ★変異nogate */' }],
  /* 404 の印を立てない (依頼書 §2-6 の罠): 床の onerror と絵の failed の 2 か所 */
  nofail: [
    { from: '    floorTex1.onerror = () => { floorTex1Failed = true; if (BOARD_FADE_ON) renderMap(); };', to: '    floorTex1.onerror = () => {}; /* ★変異nofail */' },
    { from: '          entry.failed = true;', to: '          /* ★変異nofail */' }],
  /* ?boardfade=0 を読まない */
  nooff: [
    { from: '    const BOARD_FADE_ON = new URLSearchParams(window.location.search).get("boardfade") !== "0";', to: '    const BOARD_FADE_ON = true; /* ★変異nooff */' }],
  /* 待ち時間でなくページ開始からの時刻で判定 (= 項目2 の挙動・K7) */
  noreq: [
    { from: '      if (!BOARD_FADE_ON || at == null || at - (requestedAt || 0) < BOARD_FADE_MIN_WAIT_MS) return 1;',
      to: '      if (!BOARD_FADE_ON || at == null || at - 0 < BOARD_FADE_MIN_WAIT_MS) return 1; /* ★変異noreq */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-2)。
 * 予想より広い 2 本:
 *   fallback … (2a) の「暗い時点」= 同じ森の腕の 1500ms が予備床で 45.9 に上がり、+100ms (37〜42) が下回る (連鎖)。
 *              ⚠ 鉱山は 1500ms でも 床2.png 0 回・輝度 10 (絵が画面全体を覆い、待っている絵のマスは塗らない) = 鉱山単独では検出できない (K10)
 *   noloop   … (2a) の +100ms が届いた瞬間の 1 コマ (13.2) のまま = 落ち着いた時点 (同じ 13.2) との余白が無い
 *   nooff    … (1b) の比較相手 (?boardfade=0 の腕) も暗くなる (連鎖) */
const NEG_EXPECT = {
  fallback: ['(1a)', '(1b)', '(2a)'],
  noloop:   ['(2a)', '(2b)', '(2c)'],
  nogate:   ['(3a)', '(3b)'],
  nofail:   ['(4a)', '(4b)'],
  nooff:    ['(0c)', '(1b)', '(5a)'],
  noreq:    ['(3b)'],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可)。理由は依頼書 §12-2。 */
const NEG_MAYBE = { fallback: [], noloop: [], nogate: [], nofail: [], nooff: [], noreq: [] };
/* 依頼書 §8 / §12-1b の予想 */
const NEG_PREDICTED = {
  fallback: ['(1a)', '(1b)'], noloop: ['(2b)', '(2c)'], nogate: ['(3a)'], nofail: ['(4a)', '(4b)'], nooff: ['(0c)', '(5a)'], noreq: ['(3b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 6) vetFail('変異は 6 本まで (ポート 10568〜10573)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書の予想 ' + J(NEG_PREDICTED[k]) + ' を必ず赤に含まない (' + miss.join(',') + ')');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self);
  const src = peers.map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
    const core = e.from.trim();
    const clash = src.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
  }
}
const _mutCache = {};
function servedIndex(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key] !== undefined) return _mutCache[key];
  let s = PRISTINE;
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE, e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (index.html に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE, e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    s = s.split(e.from).join(e.to);
  }
  if (s.split('\n').length !== PRISTINE.split('\n').length) vetFail('変異 ' + key + ' が index.html の行数を変えた');
  if (s === PRISTINE) vetFail('変異 ' + key + ' が何も変えていない');
  _mutCache[key] = s;
  return s;
}
for (const k of MUT_ORDER) servedIndex(k);
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本 index.html で 1 箇所・行数不変・他ドライバとアンカーの重なり 0 / 基準 ' + BASE_REV
  + ' の index.html ' + BASE_HTML.length + ' 文字 (CRLF ' + countOf(BASE_HTML, '\r\n') + ')');

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  envFail('puppeteer-core が見つかりません');
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  envFail('Chrome/Edge が見つかりません (--browser <path>)');
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
/* 腕の配信条件 (id → { index: 'live'|'base', floorDelay, jpgDelay, mode: 'delay'|'404', cache }) */
const ARM_CFG = {};
const SERVERS = [];
function startServer(port, mutKey) {
  const live = Buffer.from(servedIndex(mutKey), 'utf8');
  const base = Buffer.from(BASE_HTML, 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let u = decodeURIComponent(req.url.split('?')[0]);
        const m = /^\/__arm\/([^/]+)\/(.*)$/.exec(u);
        const cfg = m ? ARM_CFG[m[1]] : null;
        let rel = (m ? m[2] : u).replace(/^\/+/, '');
        if (rel === '') rel = 'index.html';
        const send = () => {
          if (res.writableEnded || res.destroyed) return;
          res.setHeader('Cache-Control', cfg && cfg.cache ? 'max-age=3600' : 'no-store');
          if (rel === 'index.html') { res.setHeader('Content-Type', MIME['.html']); res.end(cfg && cfg.index === 'base' ? base : live); return; }
          const fp = path.join(ROOT, rel);
          if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
          res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
          fs.createReadStream(fp).pipe(res);
        };
        const slow = !!cfg && SLOW_RE.test(rel);
        if (slow && cfg.mode === '404') { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); res.end('404'); return; }
        const dl = slow ? (/\.jpg$/.test(rel) ? cfg.jpgDelay : cfg.floorDelay) : 0;
        if (dl > 0) setTimeout(send, dl); else send();
      } catch (e) { try { res.statusCode = 500; res.end('500'); } catch (e2) {} }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => { SERVERS.push(srv); resolve(srv); });
  });
}
function stopServer(srv) {
  return new Promise((resolve) => {
    try { srv.closeAllConnections(); } catch (e) {}
    try { srv.close(() => resolve()); } catch (e) { resolve(); }
    const i = SERVERS.indexOf(srv); if (i >= 0) SERVERS.splice(i, 1);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(4a)', '(4b)', '(5a)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 400 : 1200));
  };
  return R;
}
function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING 0' + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 500)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const PAGE_HOOK = (cfg) => {
  try { sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen); } catch (e) {}
  const W = window.__v85 = { fb2T: [], tFloor: null, tPaint: null, tAll: null, caps: {}, draws: [], on: false };
  const dI = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img) {
    try {
      if (img && img.src && /(%E5%BA%8A2|床2)\.png$/.test(img.src)) W.fb2T.push(Math.round(performance.now()));
      if (W.on && this.canvas && this.canvas.id === 'mapCanvas') {
        const ps = roomPaintings;
        for (let i = 0; i < ps.length; i++) if (img === ps[i].canvas || img === ps[i].img) W.draws.push(+this.globalAlpha.toFixed(4));
      }
    } catch (e) {}
    return dI.apply(this, arguments);
  };
  const cap = (tag) => {
    const r = { tag, t: Math.round(performance.now()) };
    try { r.floorPattern = floorPattern !== null; } catch (e) { r.floorPattern = 'ERR'; }
    try { r.floorTexLoaded = floorTexLoaded === true; } catch (e) { r.floorTexLoaded = 'ERR'; }
    try { r.paints = roomPaintings.map((p) => ({ f: String((p.img && p.img.src) || '').split('/').pop(), loaded: !!p.loaded, failed: !!p.failed })); } catch (e) { r.paints = 'ERR'; }
    r.fb2 = W.fb2T.length;
    try {
      const c = document.getElementById('mapCanvas');
      r.url = c.toDataURL();
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let s = 0, n = 0, bright = 0;
      for (let i = 0; i < d.length; i += 16) { const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += L; n++; if (L > 120) bright++; }
      r.lum = +(s / n).toFixed(1); r.brightPct = +(100 * bright / n).toFixed(1); r.cw = c.width; r.ch = c.height;
    } catch (e) { r.lum = null; r.err = String(e && e.message); }
    W.caps[tag] = r;
  };
  for (const t of cfg.abs) setTimeout(() => cap('abs' + t), Math.max(0, t - performance.now()));
  const iv = setInterval(() => {
    const now = Math.round(performance.now());
    try { if (W.tFloor === null && floorPattern) W.tFloor = now; } catch (e) {}
    try { if (W.tPaint === null && roomPaintings.length > 0 && roomPaintings.every((p) => p.loaded)) W.tPaint = now; } catch (e) {}
    if (W.tAll === null && W.tFloor !== null && W.tPaint !== null) {
      W.tAll = now; cap('all');
      for (const dt of cfg.rel) setTimeout(() => cap('rel' + dt), Math.max(0, W.tAll + dt - performance.now()));
      clearInterval(iv);
    }
  }, 10);
};
/* 分岐ノードへの入場 (item2b/probe85h.js の手順)。絵の積み直し (requestedAt が入場後) が届くのを待つ */
const ENTER = async (id) => {
  const W = window.__v85; W.draws = []; const t0 = performance.now(); W.on = true;
  let kick = null;
  try { kick = enterNode(id, null); } catch (e) { W.on = false; return { id, err: String((e && e.message) || e) }; }
  const fresh = () => roomPaintings.length > 0 && roomPaintings.every((p) => p.requestedAt != null && p.requestedAt >= t0);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5));
    if (currentNodeId === id && fresh() && roomPaintings.every((p) => p.loaded || p.failed)) break;
    if (performance.now() - t0 > 10000) break;
  }
  const tLoad = performance.now();
  const samples = [];
  for (const dt of [0, 50, 150, 1000]) {
    while (performance.now() - tLoad < dt) await new Promise((r) => setTimeout(r, 5));
    samples.push({ dt, alpha: roomPaintings.map((p) => (p.loaded ? +boardFadeAlpha(p.loadedAt, p.requestedAt).toFixed(3) : null)) });
  }
  try { await Promise.race([kick, new Promise((r) => setTimeout(r, 3000))]); } catch (e) {}
  W.on = false;
  const draws = W.draws.slice();
  return { id, node: currentNodeId, fresh: fresh(),
    paints: roomPaintings.map((p) => ({ f: String(p.img.src).split('/').pop(), loaded: p.loaded, failed: !!p.failed,
      wait: (p.requestedAt != null && p.loadedAt != null) ? +(p.loadedAt - p.requestedAt).toFixed(1) : null })),
    samples, nDraw: draws.length, minDraw: draws.length ? Math.min.apply(null, draws) : null, nBelow1: draws.filter((a) => a < 0.999).length };
};

let ARM_SEQ = 0;
async function runArm(browser, port, ctx, a) {
  const id = 'a' + (++ARM_SEQ) + '_' + a.scen.replace(/[^a-z]/g, '');
  ARM_CFG[id] = { index: a.index || 'live', floorDelay: a.floorDelay || 0, jpgDelay: a.jpgDelay || 0, mode: a.mode || 'delay', cache: !!a.cache };
  const page = await browser.newPage();
  ctx.pages++;
  const errs = [];
  page.on('pageerror', (e) => { errs.push(String((e && e.message) || e).slice(0, 200)); });
  const out = { label: a.label, scen: a.scen };
  try {
    await page.setViewport(VIEW);
    await page.evaluateOnNewDocument(PAGE_HOOK, { scen: a.scen, abs: a.abs || [], rel: a.rel || [] });
    await page.goto('http://127.0.0.1:' + port + '/__arm/' + id + '/index.html' + (a.q ? '?' + a.q : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
    const now = () => page.evaluate(() => performance.now());
    const waitUntil = async (t) => { for (;;) { const n = await now(); if (n >= t) return; await sleep(Math.min(100, Math.max(10, t - n))); } };
    if (a.abs && a.abs.length) await waitUntil(Math.max.apply(null, a.abs) + 150);
    if (a.rel && a.rel.length) {
      const lim = a.relLimit || 15000;
      for (;;) {
        const s = await page.evaluate(() => ({ n: performance.now(), all: window.__v85.tAll }));
        if (s.all !== null) { await waitUntil(s.all + Math.max.apply(null, a.rel) + 150); break; }
        if (s.n > lim) break;
        await sleep(50);
      }
    }
    if (a.forced) {
      out.forced = await page.evaluate(() => {
        const c = document.getElementById('mapCanvas'); const x = c.toDataURL(); renderMap(); const y = c.toDataURL(); return { changed: x !== y };
      });
    }
    if (a.enter) {
      await waitUntil(a.settleAt);
      out.start = await page.evaluate(() => ({ node: currentNodeId, ids: (typeof RUN !== 'undefined' && RUN && RUN.byId) ? Object.keys(RUN.byId) : null,
        paints: roomPaintings.map((p) => String(p.img.src).split('/').pop() + ':' + p.loaded) }));
      out.entries = [];
      for (const nid of a.enter) out.entries.push(await page.evaluate(ENTER, nid));
    }
    const w = await page.evaluate(() => { const W = window.__v85; return { tFloor: W.tFloor, tPaint: W.tPaint, tAll: W.tAll, fb2T: W.fb2T.slice(), caps: W.caps }; });
    out.tAll = w.tAll; out.tFloor = w.tFloor; out.tPaint = w.tPaint; out.fb2T = w.fb2T;
    out.caps = {};
    for (const k of Object.keys(w.caps)) { const c = w.caps[k]; c.hash = H(c.url); delete c.url; out.caps[k] = c; }
  } catch (e) {
    out.err = String((e && e.message) || e).slice(0, 300);
  } finally {
    await page.close().catch(() => {});
    delete ARM_CFG[id];
  }
  out.errs = errs;
  for (const m of errs) ctx.errs.push(a.label + ': ' + m);
  const c15 = out.caps && out.caps['abs' + SHOT_MS];
  console.log('    [腕] ' + a.label + ' ' + a.scen + (out.err ? ' 例外 ' + out.err : '')
    + (c15 ? ' @1500 lum=' + c15.lum + ' fb2=' + c15.fb2 + ' fp=' + c15.floorPattern + ' #' + c15.hash : '')
    + (out.tAll !== null && out.tAll !== undefined ? ' tAll=' + out.tAll : '') + ' fb2total=' + (out.fb2T ? out.fb2T.length : '?')
    + (errs.length ? ' pageerror=' + errs.length : ''));
  return out;
}

async function runSuite(browser, port, key, label) {
  const R = mkResults();
  const ctx = { errs: [], pages: 0 };
  try {
    const D = {}, OFF = {}, BASE = {}, FAST = {};
    for (const s of SCENS) {
      D[s] = await runArm(browser, port, ctx, { label: 'D', scen: s, floorDelay: DELAY_MS, jpgDelay: DELAY_MS, abs: [SHOT_MS],
        rel: s === FOREST ? FADE_REL : [], forced: s === FOREST });
      OFF[s] = await runArm(browser, port, ctx, { label: 'OFF', scen: s, q: 'boardfade=0', floorDelay: DELAY_MS, jpgDelay: DELAY_MS, abs: [SHOT_MS] });
      BASE[s] = await runArm(browser, port, ctx, { label: 'BASE', scen: s, index: 'base', q: 'boardfade=0', floorDelay: DELAY_MS, jpgDelay: DELAY_MS, abs: [SHOT_MS] });
      FAST[s] = await runArm(browser, port, ctx, { label: 'FAST', scen: s, rel: [1000] });
    }
    const F404 = await runArm(browser, port, ctx, { label: '404', scen: FOREST, mode: '404', abs: [SHOT_MS, SHOT_404_MS] });
    const ENT = await runArm(browser, port, ctx, { label: 'ENTER', scen: FORT, cache: true, enter: ['n7', 'n4'], settleAt: 4000 });
    const ENTC = await runArm(browser, port, ctx, { label: 'ENTER対照', scen: FORT, cache: true, jpgDelay: ENTER_SLOW_MS, enter: ['n7'], settleAt: 6000 });

    const at15 = (arm) => (arm && arm.caps && arm.caps['abs' + SHOT_MS]) || null;
    const fb2Upto = (arm, t) => (arm && arm.fb2T ? arm.fb2T.filter((x) => x <= t).length : null);
    /* ── §0 ── */
    const delayed = [];
    for (const s of SCENS) delayed.push(['D', s, D[s]], ['OFF', s, OFF[s]], ['BASE', s, BASE[s]]);
    const v0a = delayed.map(([l, s, a]) => { const c = at15(a); return { arm: l + ':' + s, ok: !!c && c.floorPattern === false && Array.isArray(c.paints) && c.paints.length >= 1 && c.paints.every((p) => !p.loaded), fp: c && c.floorPattern, paints: c && c.paints && c.paints.map((p) => p.f + ':' + p.loaded) }; });
    R.check('(0a)', '[装置] 遅延が効いている: 遅延の腕 18 本の 1500ms で floorPattern === null・絵が 1 枚以上で全部 loaded === false',
      v0a.every((x) => x.ok), v0a.filter((x) => !x.ok).concat(v0a.filter((x) => x.ok).slice(0, 2)));
    const v0b = delayed.map(([l, s, a]) => { const c = at15(a); return { arm: l + ':' + s, v: c ? c.floorTexLoaded : null }; });
    R.check('(0b)', '[装置] 予備床は届いている: 同じ 18 腕の 1500ms で floorTexLoaded === true',
      v0b.every((x) => x.v === true), v0b.filter((x) => x.v !== true).length ? v0b.filter((x) => x.v !== true) : 'all true (18)');
    const v0c = SCENS.map((s) => ({ s, n: fb2Upto(OFF[s], SHOT_MS), base: fb2Upto(BASE[s], SHOT_MS) }));
    R.check('(0c)', '[装置] 撤退の腕 ?boardfade=0 + 遅延で 1500ms までに床2.png の drawImage が 1 回以上 (6 シナリオ)',
      v0c.every((x) => typeof x.n === 'number' && x.n >= 1), v0c);
    R.check('(0d)', '[装置] 全ページで pageerror 0 件', ctx.pages > 0 && ctx.errs.length === 0, 'ページ ' + ctx.pages + ' 枚 / pageerror ' + J(ctx.errs.slice(0, 3)));
    /* ── §1 ── */
    const v1a = SCENS.map((s) => ({ s, n: fb2Upto(D[s], SHOT_MS), total: D[s].fb2T ? D[s].fb2T.length : null }));
    R.check('(1a)', '遅延 4000ms・6 シナリオで 1500ms までの床2.png の drawImage が 0 回',
      v1a.every((x) => x.n === 0) && !!at15(D[FOREST]), v1a);
    const v1b = SCENS.map((s) => { const a = at15(D[s]), o = at15(OFF[s]); return { s, lum: a && a.lum, off: o && o.lum, ok: !!a && !!o && typeof a.lum === 'number' && typeof o.lum === 'number' && a.lum <= DARK_MAX && (o.lum - a.lum) >= GAP_MIN }; });
    R.check('(1b)', '同じ腕の 1500ms の平均輝度が ' + DARK_MAX + ' 以下 かつ ?boardfade=0 より ' + GAP_MIN + ' 以上低い (6 シナリオ)',
      v1b.every((x) => x.ok), v1b);
    /* ── §2 ── */
    const Fc = D[FOREST].caps || {};
    const dark = Fc['abs' + SHOT_MS], c100 = Fc.rel100, c1000 = Fc.rel1000, c1500 = Fc.rel1500;
    const v2a = { tAll: D[FOREST].tAll, dark: dark && dark.lum, mid: c100 && c100.lum, midAt: c100 && c100.t, settled: c1500 && c1500.lum };
    R.check('(2a)', '森・遅延: 揃った +100ms の平均輝度が暗い時点 (1500ms) と落ち着いた時点 (+1500ms) のあいだ (余白 ' + MID_MARGIN + ')',
      !!dark && !!c100 && !!c1500 && c100.lum > dark.lum + MID_MARGIN && c100.lum < c1500.lum - MID_MARGIN, v2a);
    R.check('(2b)', '森・遅延: 揃った +1000ms と +1500ms のハッシュが一致し、強制 renderMap() で盤面が変わらない',
      !!c1000 && !!c1500 && !!c1000.hash && c1000.hash === c1500.hash && !!D[FOREST].forced && D[FOREST].forced.changed === false,
      { h1000: c1000 && c1000.hash, h1500: c1500 && c1500.hash, lum1000: c1000 && c1000.lum, forced: D[FOREST].forced || null });
    const fastF = FAST[FOREST].caps && FAST[FOREST].caps.rel1000;
    R.check('(2c)', '(2b) の盤面 = 遅延なしで落ち着いた森の盤面 (揃った +1000ms) のハッシュ',
      !!c1500 && !!fastF && !!fastF.hash && c1500.hash === fastF.hash, { delayed: c1500 && c1500.hash, fast: fastF && fastF.hash });
    /* ── §3 ── */
    const v3a = SCENS.map((s) => { const c = FAST[s].caps || {}; return { s, tAll: FAST[s].tAll, hAll: c.all && c.all.hash, h1000: c.rel1000 && c.rel1000.hash, fb2: FAST[s].fb2T ? FAST[s].fb2T.length : null }; });
    R.check('(3a)', '遅延なし・6 シナリオ: 揃った瞬間のハッシュ = 揃った +1000ms のハッシュ (揃うのは ' + MIN_WAIT_MS + 'ms より前)',
      v3a.every((x) => typeof x.tAll === 'number' && x.tAll < MIN_WAIT_MS && !!x.hAll && x.hAll === x.h1000), v3a);
    const entOk = (e) => !!e && !e.err && e.node === e.id && e.fresh === true && e.paints.length >= 1
      && e.paints.every((p) => p.loaded && typeof p.wait === 'number' && p.wait < MIN_WAIT_MS)
      && e.samples.every((s) => s.alpha.every((x) => x === 1)) && e.nDraw >= 1 && e.nBelow1 === 0;
    const ec = ENTC.entries && ENTC.entries[0];
    const ctlOk = !!ec && !ec.err && ec.node === ec.id && ec.paints.length >= 1 && ec.paints.some((p) => typeof p.wait === 'number' && p.wait > MIN_WAIT_MS) && ec.nBelow1 > 0;
    const ents = ENT.entries || [];
    R.check('(3b)', '砦・遅延なし: enterNode("n7") → enterNode("n4") の絵が待ち < ' + MIN_WAIT_MS + 'ms で入場直後から α=1 (drawImage の globalAlpha < 1 が 0 回)・対照 (絵 ' + ENTER_SLOW_MS + 'ms 遅延) はフェード',
      ents.length === 2 && ents.every(entOk) && !!ENT.start && ENT.start.node === 'n4' && ctlOk,
      { start: ENT.start, entries: ents.map((e) => ({ id: e.id, node: e.node, fresh: e.fresh, err: e.err, paints: e.paints, alpha: e.samples && e.samples.map((s) => s.alpha), nDraw: e.nDraw, minDraw: e.minDraw, nBelow1: e.nBelow1 })),
        control: ec ? { node: ec.node, err: ec.err, paints: ec.paints, alpha0: ec.samples && ec.samples[0].alpha, nDraw: ec.nDraw, minDraw: ec.minDraw, nBelow1: ec.nBelow1 } : null });
    /* ── §4 ── */
    const c404a = F404.caps && F404.caps['abs' + SHOT_MS], c404 = F404.caps && F404.caps['abs' + SHOT_404_MS];
    const n404 = fb2Upto(F404, SHOT_404_MS), n404after = F404.fb2T ? F404.fb2T.filter((x) => x >= SHOT_MS).length : null;
    R.check('(4a)', '森・床と絵を 404: ' + SHOT_404_MS + 'ms までに床2.png の drawImage が 1 回以上',
      typeof n404 === 'number' && n404 >= 1, { upto3000: n404, after1500: n404after, firstAt: F404.fb2T && F404.fb2T[0], lastAt: F404.fb2T && F404.fb2T[F404.fb2T.length - 1] });
    R.check('(4b)', '同じ腕の ' + SHOT_404_MS + 'ms の平均輝度が §1 の森の暗い盤面より ' + GAP_MIN + ' 以上高い',
      !!c404 && !!dark && typeof c404.lum === 'number' && typeof dark.lum === 'number' && c404.lum - dark.lum >= GAP_MIN,
      { lum3000: c404 && c404.lum, lum1500: c404a && c404a.lum, darkForest: dark && dark.lum });
    /* ── §5 ── */
    const v5a = SCENS.map((s) => { const a = at15(OFF[s]), b = at15(BASE[s]); return { s, off: a && a.hash, base: b && b.hash, ok: !!a && !!b && !!a.hash && a.hash === b.hash }; });
    R.check('(5a)', '?boardfade=0 + 遅延の 1500ms の盤面ハッシュ = ' + BASE_REV + ' の index.html を配った同じ腕 (6 シナリオ)',
      v5a.every((x) => x.ok), v5a);
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_board_load_flash_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, lab) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + lab + ' (port ' + port + ') ════════');
    const t0 = Date.now();
    const R = await runSuite(browser, port, key, lab);
    console.log('[vet] ' + lab + ' 所要 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
    await stopServer(srv);
    return R;
  };
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      if (s0.failed || R0.length !== ALL_IDS.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const want = NEG_EXPECT[key], maybe = NEG_MAYBE[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0 && maybe.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '')
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' → ' + (ok ? '✓ OK' : '✗ '
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(9) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤・担当外の赤 0');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const R = await run(port, MUTATE, '[変異 ' + MUTATE + ' (手回し)]');
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const R = await run(PORT, null, '(素)');
      const s = summarize(R, '');
      exitCode = (s.failed || R.length !== ALL_IDS.length) ? 1 : 0;
    }
  } catch (e) {
    console.error('[vet] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[vet] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
