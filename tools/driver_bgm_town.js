#!/usr/bin/env node
/*
 * driver_bgm_town.js — 街 (港町フラン) と酒場 (銀の鹿亭) の専用 BGM 配線の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 入れたもの (実装依頼書/2026-08-23_town-tavern-bgm.md)
 *   town.html / tavern.html はどちらも合成トラック TRACKS.tavern を鳴らしていた
 *   (= 街と酒場がまったく同じ音)。専用 mp3 の別曲へ分ける。
 *     街   → town        (assets/bgm/village08.mp3)
 *     酒場 → tavern_room (assets/bgm/酒場.mp3)
 *
 * ■ 測り方の方針
 *   ⭐ 音は headless で聴けない。**「どのキーを渡したか」で測る** (driver_bgm_mine と同じ)。
 *
 *   ⚠⚠⚠ **計測機構がここだけ廃坑ドライバの写経では動かない。**
 *     廃坑は startGame() を**ドライバが呼ぶ**ので、その前に playBgm を包めた。
 *     街は **BGM 呼び出しがページロード中に走る** (town.html:654 が即時) ので、
 *     ロード後に包んでは間に合わない。
 *     → evaluateOnNewDocument で window.GameAudio に **setter を仕掛け**、audio.js 末尾の
 *       `global.GameAudio = GameAudio;` が走った瞬間に playBgm を包む。
 *     ⭐ この機構なら **AudioContext が解錠されていなくても測れる**
 *       (playBgm は未解錠だと pendingBgm へ落ちるが、渡された引数は記録される)。
 *
 *   ⚠⚠ **酒場は街と非対称**。依頼書 §8 は「街と酒場は BGM 呼び出しがページロード中に走る」
 *     と書いているが、tavern.html の呼び口は :5981 の 1 本だけで
 *     `document.addEventListener("pointerdown", …, { once: true })` の中に在る
 *     = **素のページロードでは 1 度も呼ばれない**。
 *     → 酒場を測る腕は **必ず pointerdown を 1 回送ってから** assert する。
 *       送らずに書くと (2a)/(6b) が「呼ばれていないから tavern も含まれない」で
 *       **永久に緑**になる。(0c) がその母集団ガード。
 *
 * ■ ⚠⚠⚠ この改修の本当の罠 (依頼書 §2-2)
 *   playBgm は BGM_FILES を TRACKS より**先に**見る:
 *       if (BGM_FILES[name]) { playBgmFile(name); return; }   // ← TRACKS[name] より前
 *   したがって ID を "tavern" で登録すると、**呼び口を 1 行も直していない** playBgm("tavern") が
 *   黙って mp3 へ逸れ、renderBgmOffline("tavern") だけが合成トラックを指す
 *   = **同じ名前が 2 つの別物を指す**。→ ID は town / tavern_room にして呼び口を明示的に直した。
 *
 *   ⭐⭐⭐ **依頼書 §8 の (5b) は、実測したら shadow 変異で赤くならない。**
 *     依頼書は「shadow 変異 → (5b) renderBgmOffline("tavern") が reject する」と書いていたが、
 *     renderBgmOffline は **TRACKS しか見ない** (audio.js の実装を読んで確認)。BGM_FILES に
 *     "tavern" を足しても TRACKS.tavern は生きたままなので **(5b) は緑のまま**で、
 *     負のコントロールが空振りする。
 *     ⇒ 罠の本体は「**同じ ID が BGM_FILES と TRACKS の両方に在る**」ことなので、
 *       **(5c) = BGM_FILES の全 ID について renderBgmOffline(id) が reject する**
 *       (= 合成トラックと ID が 1 つも衝突しない) を足し、shadow はここへ当てる。
 *
 * ■ ⛔ 測らないこと
 *   **volume の値は assert しない。** 街と酒場は安全地帯なので耳で下げる余地を残す
 *   (依頼書 §2-3)。代わりに「数値で 0 < v <= 1」だけ見る。
 *
 * ── 負のコントロール (--negative / 配信をメモリ上で差し替える) ─────────────────
 *   port   | mutate        | 注入する欠陥                              | 赤くなるべき節
 *   PORT   | (素)          | —                                          | —
 *   PORT+1 | revert_town   | 街の ID を "tavern" へ戻す                 | (1a)
 *   PORT+2 | revert_tavern | 酒場の ID を "tavern" へ戻す               | (2a)
 *   PORT+3 | badsrc        | BGM_FILES.town の src を存在しないパスへ   | (3a)
 *   PORT+4 | emptycredit   | mine_depths の credit を "" へ戻す         | (4a)
 *   PORT+5 | shadow        | ID を tavern_room でなく "tavern" で登録   | (5c)
 *
 * 使い方:
 *   node tools/driver_bgm_town.js              # 受入条件 (素の配信)
 *   node tools/driver_bgm_town.js --negative   # 負のコントロール (赤くならなければ exit 1)
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
/* ⚠ ポートは既存ドライバと空ける。9080-9085 = driver_mine_wall / 9090-9093 = driver_bgm_mine。
 *   本ドライバは PORT..PORT+5 の 6 本。 */
const PORT = parseInt(arg('port', '9100'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。tavern.html / audio.js は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  revert_town: { file: 'town.html',
    from: '    var TOWN_BGM_ID = "town";',
    to:   '    var TOWN_BGM_ID = "tavern";   /* mut-revert_town 街を合成トラックへ戻す */' },
  revert_tavern: { file: 'tavern.html',
    from: '    var TAVERN_BGM_ID = "tavern_room";',
    to:   '    var TAVERN_BGM_ID = "tavern";   /* mut-revert_tavern 酒場を合成トラックへ戻す */' },
  badsrc: { file: 'audio.js',
    from: '    town:           { src: "assets/bgm/village08.mp3",           loop: true, volume: 0.54, credit: "魔王魂" },',
    to:   '    town: { src: "assets/bgm/__no_such_file.mp3", loop: true, volume: 0.54, credit: "魔王魂" },   /* mut-badsrc */' },
  emptycredit: { file: 'audio.js',
    from: '    mine_depths:    { src: "assets/bgm/haikou.mp3",               loop: true, volume: 0.43, credit: "魔王魂" },',
    to:   '    mine_depths: { src: "assets/bgm/haikou.mp3", loop: true, volume: 0.43, credit: "" },   /* mut-emptycredit */' },
  /* ⭐ 依頼書 §2-2 の罠そのものを再現する変異。ID を tavern で登録すると
   *   BGM_FILES と TRACKS が同じ名前を持つ = (5c) が赤くなる。 */
  shadow: { file: 'audio.js',
    from: '    tavern_room:    { src: "assets/bgm/酒場.mp3",              loop: true, volume: 0.43, credit: "魔王魂" },',
    to:   '    tavern: { src: "assets/bgm/酒場.mp3", loop: true, volume: 0.43, credit: "魔王魂" },   /* mut-shadow ID を tavern で登録 */' },
};
const MUT_ORDER = ['revert_town', 'revert_tavern', 'badsrc', 'emptycredit', 'shadow'];
/* 変異 → 赤くなるべき assert キー。⭐ **同じ assert 関数**を素と変異の両方で回す
 *   (ドライバが変異用に別の式を書くと、負のコントロールが受入条件を検査しなくなる)。 */
const MUT_TARGET = {
  revert_town:   '1a',
  revert_tavern: '2a',
  badsrc:        '3a',
  emptycredit:   '4a',
  shadow:        '5c',
};
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC = {
  'town.html':   fs.readFileSync(path.join(ROOT, 'town.html'), 'utf8'),
  'tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8'),
  'audio.js':    fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8'),
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
        if (u === '/') u = '/town.html';
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
 * ⚠⚠⚠ **playBgm の包み込みはページのどのスクリプトより先**。街は audio.js の直後の
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
    let _ga;
    Object.defineProperty(window, 'GameAudio', {
      configurable: true,
      get() { return _ga; },
      set(v) {
        _ga = v;
        if (v && typeof v.playBgm === 'function') {
          const orig = v.playBgm;
          v.playBgm = function (n) { try { window.__bgmCalls.push(n); } catch (e) {} return orig.apply(this, arguments); };
        }
      },
    });
  });
  await page.goto('http://localhost:' + port + file + query, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.GameAudio', { timeout: 20000 });
  return page;
}
/* 最初のジェスチャを送る (iOS 解錠経路 = **酒場が BGM を鳴らす唯一の入口**)。
 * ⚠ 実クリックにしない。街は pointerdown で walkTo が走るので、座標つきの本物を送ると
 *   測りたい経路と関係ない移動が始まる。listener に届けばよいので合成イベントで足りる。
 * ⚠ document へ送る。街の listener は window、酒場の listener は document なので、
 *   document から bubbles:true で上げれば両方に届く。 */
async function firstGesture(page) {
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

  // ── 街 (素) ──────────────────────────────────────────────────────────────
  const pT = await bootPage(browser, port, '/town.html', '', errs);
  m.townCalls = await pT.evaluate(() => window.__bgmCalls.slice());
  await firstGesture(pT);
  m.townCallsAfter = await pT.evaluate(() => window.__bgmCalls.slice());
  m.files = await pT.evaluate(() => window.GameAudio.__bgmFiles());
  /* (5b) TRACKS.tavern が生きているか */
  m.renderTavern = await pT.evaluate(async () => {
    try { const d = await window.GameAudio.__renderBgmOffline('tavern', 0.5); return { ok: true, n: d ? d.length : 0 }; }
    catch (e) { return { ok: false, msg: String((e && e.message) || e) }; }
  });
  /* (5c) BGM_FILES の ID が TRACKS と 1 つも衝突していないか
   *   ⭐ renderBgmOffline は TRACKS しか見ない → resolve したら「合成トラックにも同じ名前が在る」。 */
  m.collide = await pT.evaluate(async () => {
    const out = [];
    for (const f of window.GameAudio.__bgmFiles()) {
      try { await window.GameAudio.__renderBgmOffline(f.id, 0.2); out.push(f.id); } catch (e) {}
    }
    return out;
  });
  /* (4b) 設定モーダルの**直書き**クレジット行 (データと画面は別ソース) */
  m.creditText = await pT.evaluate(() => {
    try {
      window.GameAudio.openSettings();
      const ov = document.getElementById('gameSettingsOverlay');
      const t = ov ? ov.textContent : '';
      window.GameAudio.closeSettings();
      return t;
    } catch (e) { return 'ERR:' + ((e && e.message) || e); }
  });
  await pT.close();

  // ── 酒場 (素) ⚠ pointerdown の前後で 2 回採る (呼び口が once:true の中に在るため) ──
  const pV = await bootPage(browser, port, '/tavern.html', '', errs);
  m.tavernCallsBefore = await pV.evaluate(() => window.__bgmCalls.slice());
  await firstGesture(pV);
  m.tavernCalls = await pV.evaluate(() => window.__bgmCalls.slice());
  await pV.close();

  // ── 撤退 ?townbgm=0 ──────────────────────────────────────────────────────
  const pT0 = await bootPage(browser, port, '/town.html', '?townbgm=0', errs);
  await firstGesture(pT0);
  m.townOffCalls = await pT0.evaluate(() => window.__bgmCalls.slice());
  await pT0.close();

  const pV0 = await bootPage(browser, port, '/tavern.html', '?townbgm=0', errs);
  await firstGesture(pV0);
  m.tavernOffCalls = await pV0.evaluate(() => window.__bgmCalls.slice());
  await pV0.close();

  // ── 素材の HTTP ステータス (⚠ 404 は静かに無音になるだけで画面に出ない) ──
  m.status = [];
  for (const f of m.files) m.status.push({ id: f.id, src: f.src, st: await httpStatus('http://localhost:' + port + '/' + f.src) });

  return m;
}

/* ══ 受入条件 ═════════════════════════════════════════════════════════════════
 * ⭐ 1 つの assert = 1 つの純粋な述語。素でも変異でも**この同じ式**を回す。 */
const EXISTING_7 = [
  ['dungeon_normal', 'assets/bgm/maou_game_dangeon22.mp3'],
  ['dungeon_climax', 'assets/bgm/maou_bgm_orchestra25.mp3'],
  ['boss_battle',    'assets/bgm/maou_bgm_fantasy12.mp3'],
  ['pharaxus_stage', 'assets/bgm/Ariadne-LastBoss.mp3'],
  ['mine_entrance',  'assets/bgm/d1.mp3'],
  ['mine_depths',    'assets/bgm/haikou.mp3'],
  ['mine_boss',      'assets/bgm/boss01.mp3'],
];
const ASSERTS = [
  ['0a', '装置: playBgm ラッパが街で 1 回以上 ID を捉えている (検出器が空振りしていない)',
    m => [m.townCalls.length >= 1, 'calls=' + JSON.stringify(m.townCalls)]],
  /* ⚠ 件数は **わざと直書き**。曲を足したら必ずここが赤くなり「気づかず増やした」を止める。
   *   赤くなったら期待値を書き換える前に理由を突き止めること (退行か、新チケットの追加か)。
   *   2026-08-25: 依頼書 #20 が title (opening.mp3) を足したので 9 → 10。 */
  ['0b', '装置: __bgmFiles() が 10 件返る (既存 7 + #17 の 2 + #20 の title / 表を写経せず実体から引く)',
    m => [m.files.length === 10, 'n=' + m.files.length + ' ids=' + JSON.stringify(m.files.map(f => f.id))]],
  ['0c', '装置: 酒場は pointerdown の前は 1 度も鳴らしていない ((2a) の因果がジェスチャに在る)',
    m => [m.tavernCallsBefore.length === 0, 'before=' + JSON.stringify(m.tavernCallsBefore)]],

  ['1a', '街 (town.html) が素で town を渡し、tavern を 1 度も渡さない',
    m => [m.townCalls.indexOf('town') >= 0 && m.townCalls.indexOf('tavern') < 0, 'calls=' + JSON.stringify(m.townCalls)]],
  ['1b', '街の解錠経路 (pointerdown → bootAudio) も town のまま (tavern が混ざらない)',
    m => [m.townCallsAfter.indexOf('tavern') < 0 && m.townCallsAfter.indexOf('town') >= 0,
          'after=' + JSON.stringify(m.townCallsAfter)]],

  ['2a', '酒場 (tavern.html) が tavern_room を渡し、tavern を 1 度も渡さない',
    m => [m.tavernCalls.indexOf('tavern_room') >= 0 && m.tavernCalls.indexOf('tavern') < 0,
          'calls=' + JSON.stringify(m.tavernCalls)]],

  ['3a', '新規 2 曲 (town / tavern_room) の src が 200 で返る (404 は無音になるだけで画面に出ない)',
    m => {
      const t = m.status.filter(s => s.id === 'town' || s.id === 'tavern_room');
      return [t.length === 2 && t.every(s => s.st === 200), JSON.stringify(t)];
    }],
  ['3b', '既存 7 曲の src も 200 のまま (素材の取り込みで既存を壊していない)',
    m => {
      const t = m.status.filter(s => EXISTING_7.some(e => e[0] === s.id));
      return [t.length === 7 && t.every(s => s.st === 200), JSON.stringify(t.map(s => s.id + '=' + s.st))];
    }],
  ['3c', '全 9 件の volume が数値で 0 < v <= 1 (⛔ 値そのものは assert しない = 耳で動かせる)',
    m => [m.files.every(f => typeof f.volume === 'number' && f.volume > 0 && f.volume <= 1),
          JSON.stringify(m.files.map(f => f.id + '=' + f.volume))]],

  ['4a', '全 9 件の credit が空文字でない (mine_* 3 件の宿題もこのチケットで回収)',
    m => [m.files.every(f => typeof f.credit === 'string' && f.credit.length > 0),
          JSON.stringify(m.files.map(f => f.id + '=' + JSON.stringify(f.credit)))]],
  ['4b', '設定モーダルの直書きクレジット行に 魔王魂 が入っている (データと画面は別ソース)',
    m => [m.creditText.indexOf('魔王魂') >= 0, 'len=' + m.creditText.length]],

  ['5a', '既存 7 曲の id と src が 1 件も変わっていない',
    m => {
      const bad = EXISTING_7.filter(e => {
        const f = m.files.find(x => x.id === e[0]);
        return !f || f.src !== e[1];
      });
      return [bad.length === 0, bad.length ? JSON.stringify(bad) : 'ok'];
    }],
  ['5b', '合成トラック TRACKS.tavern が生きている (撤退スイッチの戻り先が消えていない)',
    m => [m.renderTavern.ok === true, JSON.stringify(m.renderTavern)]],
  ['5c', 'BGM_FILES の ID が合成トラックと 1 つも衝突しない (§2-2 の二重定義が無い)',
    m => [m.collide.length === 0, '衝突=' + JSON.stringify(m.collide)]],

  ['6a', '?townbgm=0 で街が合成トラック tavern へ戻る',
    m => [m.townOffCalls.indexOf('tavern') >= 0 && m.townOffCalls.indexOf('town') < 0,
          'calls=' + JSON.stringify(m.townOffCalls)]],
  ['6b', '?townbgm=0 で酒場が合成トラック tavern へ戻る',
    m => [m.tavernOffCalls.indexOf('tavern') >= 0 && m.tavernOffCalls.indexOf('tavern_room') < 0,
          'calls=' + JSON.stringify(m.tavernOffCalls)]],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_bgmtown_');
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
      check('(7a) 測定ページで pageerror / console.error が出ていない',
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
        const a = ASSERT_OF[MUT_TARGET[k]];
        const r = a[2](m);
        check('(neg-' + k + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
          r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
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
