#!/usr/bin/env node
/*
 * driver_bgm_title.js — タイトル画面 (title.html) の専用 BGM 配線の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 入れたもの (実装依頼書/2026-08-25_title-bgm-opening.md)
 *   title.html (開始画面 → 名乗り = キャラ選択) は #6 の Phase 1 から **完全に無音**だった。
 *   専用 mp3 を敷く:  タイトル → title (assets/bgm/opening.mp3 / 魔王魂 / volume 0.33)
 *
 * ■ 測り方の方針
 *   ⭐ 音は headless で聴けない。**2 経路**で測る (片方の写経にしない):
 *     経路 A … playBgm に**渡された ID**   (どのキーを渡したか)
 *     経路 B … GameAudio.__bgmFileState()  (実際にどの mp3 を掴んで鳴らしているか)
 *
 *   ⚠⚠⚠ **この改修の本当の罠 (依頼書 §2-2)。**
 *     ブラウザはユーザー操作の外で音を出せないので、ロード時の playBgm は pendingBgm へ
 *     落ちて、最初の pointerdown の unlock() が鳴らす。ところが audio.js:119 の
 *         if (pendingBgm) { var p = pendingBgm; pendingBgm = null; playBgm(p); }
 *     が呼ぶのは **クロージャ内のローカル関数** であって GameAudio.playBgm ではない。
 *     ⇒ window.GameAudio.playBgm を包んだスパイでは **pendingBgm からの再生を 1 件も数えられない**。
 *     だから title.html 側は「ロード時」と「最初の pointerdown の中」の 2 本を持ち
 *     (town.html と同じ形)、ここでは経路 B を必ず併走させる。
 *
 *   ⚠⚠ **計測機構は driver_bgm_town の写経が要る。** title.html は BGM 呼び出しが
 *     **ページロード中に走る**ので、ロード後に包んでは間に合わない。
 *     → evaluateOnNewDocument で window.GameAudio に **setter を仕掛け**、audio.js 末尾の
 *       `global.GameAudio = GameAudio;` が走った瞬間に playBgm / playSfx を包む。
 *
 *   ⚠ タイトルの「最初のジェスチャ」は **実座標クリック**にする。合成イベントでは
 *     画面 2 (名乗り) へ進まないので (2c) が測れない。スロット 1 の「はじめから」を押すと
 *     pointerdown (= 解錠 + BGM) と画面遷移が 1 回で両方起きる = 本番と同じ道。
 *
 * ■ ⛔ 測らないこと
 *   **volume の値は assert しない。** タイトルは安全地帯なので耳で下げる余地を残す
 *   (依頼書 §8「測らないこと」)。代わりに「数値で 0 < v <= 1」だけ見る。
 *   ⭐ 既存 9 件についても **id / src / credit だけ**を固定し volume は縛らない
 *     — #17 が「街と酒場の volume は耳で下げてよい」と明示的に決めているため
 *     (依頼書 §8 (4b) は volume も固定と書いていたが、それは #17 の決定を壊す。
 *      逸脱として依頼書 §12 に記録した)。
 *
 * ── 負のコントロール (--negative / 配信をメモリ上で差し替える) ─────────────────
 *   port   | mutate    | 注入する欠陥                                   | 赤くなるべき節
 *   9110   | (素)      | —                                              | —
 *   9111   | silent    | title.html の **ロード時の呼び口 1 本**を消す   | (0a) (2a)
 *   9112   | badsrc    | BGM_FILES.title の src を存在しないパスへ       | (1a)
 *   9113   | shadow    | ID を title でなく **tavern** で登録            | (3a)
 *   9114   | wrongkey  | TITLE_BGM_ID を "tavern_room" へ差し替える      | (2b) (2d)
 *
 *   ⭐⭐ **silent が §2-2 の罠を突く。** ロード時の呼びを消しても pointerdown の 1 本は
 *     残るので **(2b) は緑のまま** — 捉えられるのは母集団ガード (0a) と (2a) だけ。
 *     「装置が空振りしていない」ことを機械で見せるのがこの変異の役目。
 *
 * 使い方:
 *   node tools/driver_bgm_title.js              # 受入条件 (素の配信)
 *   node tools/driver_bgm_title.js --negative   # 負のコントロール (赤くならなければ exit 1)
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
/* ⚠ ポートは既存ドライバと空ける。9090-9093 = driver_bgm_mine / 9100-9105 = driver_bgm_town。
 *   9102〜9309 が空いていることは `grep -rn "arg('port'" tools/*.js` の数え上げで実測済み。
 *   本ドライバは PORT..PORT+4 の 5 本。 */
const PORT = parseInt(arg('port', '9110'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。title.html / audio.js は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b-*) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ══════════════════════════════════════════════════════════════════════════════
const TITLE_ENTRY = '    title:          { src: "assets/bgm/opening.mp3",             loop: true, volume: 0.33, credit: "魔王魂" },';
const MUTATIONS = {
  /* ⚠⚠⚠ アンカーには末尾コメント「// ロード時 …」まで含めること。
   *   ロード時の行 (インデント 4) は pointerdown の中の行 (インデント 6) の **部分文字列**なので、
   *   コメント抜きだと 2 箇所ヒットして起動時ガードが exit 3 になる (実測で踏んだ)。 */
  silent: { file: 'title.html',
    from: '    try { if (TITLE_BGM_ID && window.GameAudio && GameAudio.playBgm) GameAudio.playBgm(TITLE_BGM_ID); } catch (e) {}   // ロード時 (pendingBgm へ落ちる)',
    to:   '    /* mut-silent ロード時の呼び口を消した (pointerdown の 1 本だけ残る) */' },
  badsrc: { file: 'audio.js',
    from: TITLE_ENTRY,
    to:   '    title: { src: "assets/bgm/__no_such_file.mp3", loop: true, volume: 0.33, credit: "魔王魂" },   /* mut-badsrc */' },
  /* ⭐ 依頼書 §2-4 の罠 (#17 の再演) そのものを再現する変異。ID を tavern で登録すると
   *   BGM_FILES と TRACKS が同じ名前を持つ = (3a) が赤くなる。 */
  shadow: { file: 'audio.js',
    from: TITLE_ENTRY,
    to:   '    tavern: { src: "assets/bgm/opening.mp3", loop: true, volume: 0.33, credit: "魔王魂" },   /* mut-shadow ID を tavern で登録 */' },
  wrongkey: { file: 'title.html',
    from: '    var TITLE_BGM_ID = "title";',
    to:   '    var TITLE_BGM_ID = "tavern_room";   /* mut-wrongkey 酒場の曲を渡す */' },
};
const MUT_ORDER = ['silent', 'badsrc', 'shadow', 'wrongkey'];
/* 変異 → 赤くなるべき assert キー (複数可)。⭐ **同じ assert 関数**を素と変異の両方で回す
 *   (ドライバが変異用に別の式を書くと、負のコントロールが受入条件を検査しなくなる)。 */
const MUT_TARGET = {
  silent:   ['0a', '2a'],
  badsrc:   ['1a'],
  shadow:   ['3a'],
  wrongkey: ['2b', '2d'],
};
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC = {
  'title.html': fs.readFileSync(path.join(ROOT, 'title.html'), 'utf8'),
  'audio.js':   fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8'),
};
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const m = MUTATIONS[k];
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
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
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置くこと (helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/title.html';
        if (mutKey && u === '/' + MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()]);
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const fp = path.join(ROOT, u);
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
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}
function httpStatus(url) {
  return new Promise((res) => {
    const r = http.get(url, (resp) => { resp.resume(); res(resp.statusCode); });
    r.on('error', () => res(0));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ページを起こす。
 * ⚠⚠⚠ **playBgm の包み込みはページのどのスクリプトより先**。title.html は audio.js の直後の
 *   インラインスクリプトが**即時**に playBgm を呼ぶので、goto の後に包んでは間に合わない。
 *   → evaluateOnNewDocument で window.GameAudio に setter を仕掛ける。 */
async function bootPage(browser, port, file, query, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const tag = '[:' + port + file + query + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push(tag + 'CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument(() => {
    window.__bgmCalls = [];
    window.__sfxCalls = [];
    window.__spyInstalled = false;
    let _ga;
    Object.defineProperty(window, 'GameAudio', {
      configurable: true,
      get() { return _ga; },
      set(v) {
        _ga = v;
        if (v && typeof v.playBgm === 'function') {
          const ob = v.playBgm;
          v.playBgm = function (n) { try { window.__bgmCalls.push(n); } catch (e) {} return ob.apply(this, arguments); };
          window.__spyInstalled = true;
        }
        if (v && typeof v.playSfx === 'function') {
          const osx = v.playSfx;
          v.playSfx = function (n) { try { window.__sfxCalls.push(n); } catch (e) {} return osx.apply(this, arguments); };
        }
      },
    });
  });
  await page.goto('http://localhost:' + port + file + query, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.GameAudio', { timeout: 20000 });
  return page;
}

/* ファイル BGM の実体の状態を読む (経路 B)。
 * ⚠ paused は play() が実際に走ってからでないと false にならないので少し待つ。
 *   待っても false にならなければ「鳴っていない」= そのまま assert に落とす。 */
async function readFileState(page) {
  await page.waitForFunction(() => {
    try { const s = window.GameAudio.__bgmFileState(); return !!s && !!s.id && s.paused === false; }
    catch (e) { return false; }
  }, { timeout: 6000 }).catch(() => {});
  return page.evaluate(() => {
    try { return window.GameAudio.__bgmFileState(); } catch (e) { return { err: String((e && e.message) || e) }; }
  });
}

/* タイトルの「最初のジェスチャ」= スロット 1 の「はじめから」を実座標クリックする。
 * ⚠ page.click は pointerdown → mousedown → mouseup → click を出すので、本番と同じく
 *   { once:true } の pointerdown リスナ (= 解錠 + BGM) が発火し、そのまま画面 2 へ進む。 */
async function firstTapToNaming(page) {
  await page.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]');
  await page.waitForFunction(() => {
    const e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
  }, { timeout: 10000 });
}

/* 街用の合成ジェスチャ (非退行の腕。画面遷移は要らない)。
 * ⚠ 実クリックにしない。街は pointerdown で walkTo が走るので、座標つきの本物を送ると
 *   測りたい経路と関係ない移動が始まる。 */
async function synthGesture(page) {
  await page.evaluate(() => {
    const ev = (typeof PointerEvent === 'function')
      ? new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
      : new Event('pointerdown', { bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
  });
  await sleep(250);
}

/* 1 ポートぶんの観測をまとめて採る。⭐ 素と変異で **同じ関数**を回す。 */
async function measure(browser, port, errs) {
  const m = { port: port };

  // ── タイトル (素) ────────────────────────────────────────────────────────
  const pT = await bootPage(browser, port, '/title.html', '', errs);
  m.spyInstalled = await pT.evaluate(() => window.__spyInstalled === true);
  m.loadCalls    = await pT.evaluate(() => window.__bgmCalls.slice());   // ★ どのクリックよりも前
  m.files        = await pT.evaluate(() => window.GameAudio.__bgmFiles());
  /* (3a) BGM_FILES の ID が TRACKS と 1 つも衝突していないか
   *   ⭐ renderBgmOffline は TRACKS しか見ない → resolve したら「合成トラックにも同じ名前が在る」。 */
  m.collide = await pT.evaluate(async () => {
    const out = [];
    for (const f of window.GameAudio.__bgmFiles()) {
      try { await window.GameAudio.__renderBgmOffline(f.id, 0.2); out.push(f.id); } catch (e) {}
    }
    return out;
  });
  await firstTapToNaming(pT);
  m.tapCalls  = await pT.evaluate(() => window.__bgmCalls.slice());
  m.sfxCalls  = await pT.evaluate(() => window.__sfxCalls.slice());
  m.stateTap  = await readFileState(pT);
  /* (2c) 名乗り画面でカードを 1 枚選んでも曲が頭出しへ戻らないこと */
  await pT.click('#classCards .classCard[data-class-key="rogue"]');
  await sleep(400);
  m.stateNaming = await pT.evaluate(() => {
    try { return window.GameAudio.__bgmFileState(); } catch (e) { return { err: String((e && e.message) || e) }; }
  });
  await pT.close();

  // ── 撤退 ?titlebgm=0 ────────────────────────────────────────────────────
  const pOff = await bootPage(browser, port, '/title.html', '?titlebgm=0', errs);
  await firstTapToNaming(pOff);
  await sleep(400);
  m.offCalls = await pOff.evaluate(() => window.__bgmCalls.slice());
  m.offSfx   = await pOff.evaluate(() => window.__sfxCalls.slice());
  m.offState = await pOff.evaluate(() => {
    try { return window.GameAudio.__bgmFileState(); } catch (e) { return { err: String((e && e.message) || e) }; }
  });
  await pOff.close();

  // ── 街 (非退行。タイトルの追加で巻き込んでいないこと) ────────────────────
  const pTown = await bootPage(browser, port, '/town.html', '', errs);
  await synthGesture(pTown);
  m.townCalls = await pTown.evaluate(() => window.__bgmCalls.slice());
  await pTown.close();

  // ── 素材の HTTP ステータス (⚠ 404 は静かに無音になるだけで画面に出ない) ──
  m.status = [];
  for (const f of m.files) m.status.push({ id: f.id, src: f.src, st: await httpStatus('http://localhost:' + port + '/' + f.src) });

  return m;
}

/* ══ 受入条件 ═════════════════════════════════════════════════════════════════
 * ⭐ 1 つの assert = 1 つの純粋な述語。素でも変異でも**この同じ式**を回す。 */
/* ⚠ volume は入れない。#17 が「街と酒場の volume は耳で下げてよい」と決めているので、
 *   ここで固定すると耳の調整がドライバを赤くする (依頼書 §8 (4b) からの逸脱。§12 に記録)。 */
const EXISTING_9 = [
  ['dungeon_normal', 'assets/bgm/maou_game_dangeon22.mp3',  '魔王魂'],
  ['dungeon_climax', 'assets/bgm/maou_bgm_orchestra25.mp3', '魔王魂'],
  ['boss_battle',    'assets/bgm/maou_bgm_fantasy12.mp3',   '魔王魂'],
  ['pharaxus_stage', 'assets/bgm/Ariadne-LastBoss.mp3',     'ユーフルカ'],
  ['town',           'assets/bgm/village08.mp3',            '魔王魂'],
  ['tavern_room',    'assets/bgm/酒場.mp3',                 '魔王魂'],
  ['mine_entrance',  'assets/bgm/d1.mp3',                   '魔王魂'],
  ['mine_depths',    'assets/bgm/haikou.mp3',               '魔王魂'],
  ['mine_boss',      'assets/bgm/boss01.mp3',               '魔王魂'],
];
const findFile = (m, id) => m.files.find(f => f.id === id);

const ASSERTS = [
  ['0a', '装置: タイトルを開いただけ (どのクリックよりも前) で playBgm ラッパが 1 回以上 ID を捉えている',
    m => [m.spyInstalled === true && m.loadCalls.length >= 1,
          'installed=' + m.spyInstalled + ' loadCalls=' + JSON.stringify(m.loadCalls)]],
  /* ⚠ 件数は **わざと直書き**。曲を足したら必ずここが赤くなり「気づかず増やした」を止める。
   *   赤くなったら期待値を書き換える前に理由を突き止めること (退行か、新チケットの追加か)。
   *   2026-08-25: 依頼書 #21 が world (fierd.mp3) を足したので 10 → 11。
   *     切り分け = HEAD の worktree で同じドライバを走らせて 16/16 を確認済み
   *     (既存 10 件の id は 1 つも欠けておらず、増えたのは world だけ = 退行ではない)。
   *   ⚠⚠ 同じ直書きが tools/driver_bgm_town.js の (0b) にも在る。**曲を足す時は 2 本とも直す**。 */
  ['0b', '装置: __bgmFiles() が 11 件返り既存の代表を含む (表を写経せず実体から引いている)',
    m => [m.files.length === 11 && ['town', 'tavern_room', 'mine_depths'].every(id => !!findFile(m, id)),
          'n=' + m.files.length + ' ids=' + JSON.stringify(m.files.map(f => f.id))]],
  ['0c', '装置: 同じスパイ機構が **効果音は数えている** (「音が丸ごと死んだ実装」で緑になっていない)',
    m => [m.sfxCalls.length >= 1, 'sfx=' + JSON.stringify(m.sfxCalls)]],

  ['1a', 'BGM_FILES.title の src が assets/bgm/opening.mp3 で 200 が返る (404 は無音になるだけ)',
    m => {
      const f = findFile(m, 'title'); const s = m.status.find(x => x.id === 'title');
      return [!!f && f.src === 'assets/bgm/opening.mp3' && !!s && s.st === 200,
              JSON.stringify({ src: f && f.src, st: s && s.st })];
    }],
  ['1b', 'BGM_FILES.title の credit が空文字でない',
    m => { const f = findFile(m, 'title'); return [!!f && typeof f.credit === 'string' && f.credit.length > 0, JSON.stringify(f && f.credit)]; }],
  ['1c', '全 10 件の volume が数値で 0 < v <= 1 (⛔ 値そのものは assert しない = 耳で動かせる)',
    m => [m.files.every(f => typeof f.volume === 'number' && f.volume > 0 && f.volume <= 1),
          JSON.stringify(m.files.map(f => f.id + '=' + f.volume))]],

  ['2a', '[経路A] タイトルはロード中に playBgm("title") を渡している (どのクリックよりも前)',
    m => [m.loadCalls.length === 1 && m.loadCalls[0] === 'title', 'loadCalls=' + JSON.stringify(m.loadCalls)]],
  ['2b', '[経路B] 最初のタップ後、実際に title の mp3 を掴んで鳴っている (id/srcId/paused)',
    m => [!!m.stateTap && m.stateTap.id === 'title' && m.stateTap.srcId === 'title' && m.stateTap.paused === false,
          JSON.stringify(m.stateTap)]],
  ['2c', '名乗り (キャラ選択) 画面へ進んでも title のまま (画面 1 → 2 で頭出しへ戻らない)',
    m => [!!m.stateNaming && m.stateNaming.id === 'title' && m.stateNaming.paused === false,
          JSON.stringify(m.stateNaming)]],
  ['2d', 'タイトルで title 以外の ID を 1 度も渡していない (別の曲へ逸れていない)',
    m => [m.tapCalls.length >= 1 && m.tapCalls.every(n => n === 'title'), 'calls=' + JSON.stringify(m.tapCalls)]],

  ['3a', 'BGM_FILES の ID が合成トラックと 1 つも衝突しない (#17 の二重定義が復活していない)',
    m => [m.collide.length === 0, '衝突=' + JSON.stringify(m.collide)]],

  ['4a', '街 (town.html) は town のまま (タイトルの追加で巻き込んでいない)',
    m => [m.townCalls.indexOf('town') >= 0 && m.townCalls.indexOf('title') < 0,
          'calls=' + JSON.stringify(m.townCalls)]],
  ['4b', '既存 9 件の id / src / credit が 1 件も変わっていない (⛔ volume は縛らない)',
    m => {
      const bad = EXISTING_9.filter(e => {
        const f = findFile(m, e[0]);
        return !f || f.src !== e[1] || f.credit !== e[2];
      });
      return [bad.length === 0, bad.length ? JSON.stringify(bad) : 'ok'];
    }],

  ['5a', '?titlebgm=0 で playBgm が 1 度も呼ばれず、ファイル BGM も掴まれない (無音へ戻る)',
    m => [m.offCalls.length === 0 && !!m.offState && m.offState.id === null,
          'calls=' + JSON.stringify(m.offCalls) + ' state=' + JSON.stringify(m.offState)]],
  ['5b', '?titlebgm=0 でも効果音は鳴る (音まわりが丸ごと死んだのではない)',
    m => [m.offSfx.length >= 1, 'sfx=' + JSON.stringify(m.offSfx)]],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_bgmtitle_');
  const browserPath = findBrowser();
  console.log('[drv] serving ' + ROOT + (NEGATIVE ? '   [負のコントロール]' : ''));
  console.log('[drv]   base:' + PORT + '   ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ══════════════════════════════════════════════════════════
      mark('素の配信で受入条件を測る');
      const m = await measure(browser, PORT, errs);
      for (const a of ASSERTS) {
        const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }
      mark('ページエラーが出ていないこと');
      check('(6a) 測定ページで pageerror / console.error が出ていない',
        errs.length === 0, errs.slice(0, 6).join(' | '));
    } else {
      // ══ 負のコントロール ══════════════════════════════════════════════════
      mark('変異が素の配信に無く、変異ポートにだけ載っていること');
      for (const k of MUT_ORDER) {
        const f = '/' + MUT_SRC[k].file;
        const pure = await httpGet('http://localhost:' + PORT + f);
        const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
        check('(0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
          pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
        check('(0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
          pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
      }
      mark('欠陥を注入すると担当の節が赤くなること');
      for (const k of MUT_ORDER) {
        const negErrs = [];
        const m = await measure(browser, PORT_OF[k], negErrs);
        for (const key of MUT_TARGET[k]) {
          const a = ASSERT_OF[key];
          const r = a[2](m);
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const bad = results.filter(r => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) {
    console.log('  FAIL:');
    for (const b of bad) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(bad.length ? 1 : 0);
})();
