#!/usr/bin/env node
/*
 * verify_quest_visibility.js — 依頼書 #64「受注の器 + 封蝋 + 記憶へ戻る道」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-09_quest-visibility-and-title-return.md` の §9 を機械的に測る。
 *
 * ■ 何を測るか (依頼書 §9 の番号と 1:1)
 *    §0 装置 … 母集団が立っているか (器の有無で副行が本当に変わるか / 札 7 枚 / 写経していないか)
 *    §1 器   … 実クリック受注 / 生成クエスト / 3 経路の消し / スロット保存に乗る
 *    §2 常時表示 … 3 面の副行 / 未受注では 1 文字も変えない / 行を増やしていない
 *    §3 封蝋 … questDest から出ている (器からではない) / 札の枚数と押しやすさを奪っていない
 *    §4 戻る道 … 押せる / 実クリックで title.html へ着き履歴が残る / スロットで進行が戻る
 *                / #worldHud という予約 id を踏んでいない
 *    §5 恒等 … __world 26 窓 / world.html の配信バイト / WORLD_MAP / #townHud の button 数
 *    §6 撤退 … ?questmark=0 と ?titleback=0 が独立に効く
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け (これが本ドライバの背骨)
 *    - **期待文言を 1 文字も写経しない**。place / title はブラウザで `scenarios` から引き、
 *      副行の既定文言は **配信元の HTML から抜く**。(0b) が「ドライバのソースに実データの
 *      リテラルが 1 つも無い」ことを自分で検査する。
 *    - 札の枚数を直書きしない。`WORLD_MAP.SITES` の件数 + 港町 1 枚から導く (7 とも突き合わせる)。
 *    - `#townHud` の button 数を直書きしない。`TOWN_MAP.FACILITIES.length` から引く。
 *    - 帯の高さを直書きしない (desktop 69 / compact 63 は環境依存)。**素と受注後の差**で測る。
 *    - 器の中身は `readActiveQuest()` の答えでなく **localStorage の生の JSON** を読む
 *      (実装が返した値と保存された値が食い違う事故を殺す)。
 *
 * ■ ⭐⭐⭐ 変異は「ディスクを書き換える」のではなく「配信を差し替える」
 *    自前サーバが返す本文をメモリ上で split/join する。作業ツリーは 1 バイトも変わらないので
 *    復元漏れが原理的に起きない。⚠ 置換文字列に \n を含めない (CRLF/LF 混在で必ず空振りする)。
 *    ⚠⚠ 変異アンカーの健在チェックは **手つかずの原本 (FROZEN)** に対して行う。
 *      変異後のバッファで数えると、いちばん大事な変異が「偽のアンカー腐敗」で 1 度も走らなくなる。
 *
 * ■ 使い方
 *     node tools/verify_quest_visibility.js
 *     node tools/verify_quest_visibility.js --negative           (負のコントロールの自己検査)
 *     node tools/verify_quest_visibility.js --mutate sealfromvessel   (手回し)
 *
 * ⚠ base port 10221 (--negative の子は 10222..10228 を順に使い回す。子は逐次実行なので衝突しない)。
 *   `grep -rn '1022[0-9]' tools/*.js` が着手前 0 件 = 未使用を実測済み。
 *   ⚠ 新しい base を掴んだら 1 回 goto して ERR_UNSAFE_PORT が出ないことを確かめること
 *     (10080 のような Chrome の制限ポートがある)。10221 は実測で正常。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

// ⚠ path.resolve 必須。区切り文字のまま持つと startsWith が必ず false で配信が全 404 になり、
//   症状はタイムアウトだけになる (恒久教訓)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const HEADFUL  = argv.includes('--headful');
const NEGATIVE = argv.includes('--negative');
const PORT     = parseInt(arg('port', '10221'), 10);
const MUTATE   = arg('mutate', null);

/* ══ 負のコントロール ═══════════════════════════════════════════════════════
 *  ⚠ 置換前後で**長さを変える**こと。同じ長さだと「当たったのに何も変わらない」を検出できない。
 *  ⚠ 置換文字列は 1 行に閉じる。
 *  ⭐ 各変異は「注入できたか」でなく **「測っている場所に赤が現れるか」** まで設計してある
 *    (MUT_EXPECT / MUT_KEEP_GREEN の 2 枚で挟む)。 */
const MUT_TARGETS = ['tavern.html', 'world.html', 'town.html'];
const MUTATIONS = {
  /* ⭐ 罠 B (依頼書 §2-4) の再現: 封蝋を **器から** 出す (questDest を見ない)。
     器は localStorage・questDest は sessionStorage なので、タブを開き直すと
     「印は出るのに押しても入れない」が起きる。→ (3c) だけが赤くなるべき。 */
  sealfromvessel: [
    ['world.html',
     '          if (isQuestMarkOn() && !questWalkOff && questDest && WM.scenarioOfNode(id) === questDest) {',
     '          if (isQuestMarkOn() && !questWalkOff && readActiveQuest() && WM.scenarioOfNode(id) === (readActiveQuest() || {}).id) {  /* \u2605\u5909\u7570sealfromvessel */'],
  ],
  /* ⭐ 依頼書 §2-11 の再現: 副行を差し替えでなく **足す**。#worldTitle の offsetHeight が動く。
     ⚠ 既存の <small> はそのまま差し替えたままにしてある = (2a) は緑のまま (3d) も動かない。
       こうしないと「効きすぎて何を検出したのか分からない」変異になる。 */
  addline: [
    ['world.html',
     '    applyQuestSubline("worldTitle");',
     '    applyQuestSubline("worldTitle"); (function () { var l = questSubline(); if (!l) return; var ex = document.createElement("div"); ex.textContent = l; var eh = document.getElementById("worldTitle"); if (eh) eh.appendChild(ex); })();  /* \u2605\u5909\u7570addline */'],
  ],
  /* ⭐ 罠 C (依頼書 §2-5) の再現: 戻るボタンの器に **worldHud** という予約 id を付ける。
     insets() が拾って bottom が 0 から動き、地図の幾何が引き直される。→ (4d)。
     ⚠ ボタン自身は残す = (4a)「押せる」は緑のまま。 */
  hudid: [
    ['world.html',
     '  <button type="button" id="worldBack">\u2190 \u306f\u3058\u3081\u306e\u753b\u9762\u3078</button>',
     '  <div id="worldHud" style="height:44px"><button type="button" id="worldBack">\u2190 \u306f\u3058\u3081\u306e\u753b\u9762\u3078</button></div>  <!-- \u2605\u5909\u7570hudid -->'],
  ],
  /* ⭐ 罠 E (依頼書 §2-7) の再現: __world に窓を 1 つ足す。→ (5a)。 */
  seamwindow: [
    ['world.html',
     '      heroNode:  function () { return heroNodeId; },',
     '      heroNode:  function () { return heroNodeId; }, activeQuest: function () { return null; },  /* \u2605\u5909\u7570seamwindow */'],
  ],
  /* ⭐ 罠 D (依頼書 §2-6) の再現: world.html の **コメントに語を書くだけ** で配信バイトの
     文字列カウントが動く。→ (5b)。⚠ CSS コメントなので挙動は 1 ミリも変わらない
     = 「振る舞いを壊さずに恒等だけ壊す」= (5b) が本当に配信バイトを見ている証明。 */
  lsword: [
    ['world.html',
     '    .worldSeal {',
     '    /* \u2605\u5909\u7570lsword localStorage.setItem */ .worldSeal {'],
  ],
  /* ⭐ 罠 A (依頼書 §2-3) の再現: 戻るボタンを #townHud の中の button にする。→ (5d)。
     ⚠⚠⚠ **markup へ直接 <button> を書く形では空振りする (2026-09-10 に実測)。**
       town.html の buildSigns() は先頭で `elHud.innerHTML = ""` を打つので、
       HTML に書いた子は **起動時に消える** → #townHud button は 4 のまま = (5d) が緑。
       ⇒ 注入点は **buildSigns() の中** (ボタンを詰め終わった後) に置く。
       ⭐ 一般形 = 変異は「注入できたか」でなく **測っている場所に赤が現れるか** まで確かめる。 */
  hudbutton: [
    ['town.html',
     '        elHud.appendChild(b);',
     '        elHud.appendChild(b); (function () { var bb = document.getElementById("townBack"); if (bb) elHud.appendChild(bb); })();  /* ★変異hudbutton */'],
  ],
  /* 戻るを location.replace にする → 履歴に前のページが残らない。→ (4b)。
     ⚠ 本番の run() は 2 面で完全に同じ 1 行なので、**両方の面**へ注入する
       (片面だけだともう片面が緑のまま = 変異が半分空振りする)。 */
  replacenav: [
    ['world.html',
     '      var el = document.getElementById("worldBack");',
     '      var el = document.getElementById("worldBack"); if (el) el.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); location.replace("title.html"); });  /* \u2605\u5909\u7570replacenav */'],
    ['town.html',
     '      var el = document.getElementById("townBack");',
     '      var el = document.getElementById("townBack"); if (el) el.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); location.replace("title.html"); });  /* \u2605\u5909\u7570replacenav */'],
  ],
  /* 帰還時に器を消さない → (1c)。⚠ 続く複数行コメントの閉じが孤立しないよう開き記号は残す。 */
  noclear: [
    ['tavern.html',
     '    clearActiveQuest();            /* \u2605[#64] \u2b50 \u30af\u30ea\u30a2/\u6557\u5317/\u64a4\u9000\u306e 3 \u7d4c\u8def\u3059\u3079\u3066\u304c\u3053\u3053\u3078\u6765\u308b',
     '    /* \u2605\u5909\u7570noclear: \u5668\u3092\u6d88\u3055\u306a\u3044 \u2014 \u30af\u30ea\u30a2/\u6557\u5317/\u64a4\u9000\u306e 3 \u7d4c\u8def\u3059\u3079\u3066\u304c\u3053\u3053\u3078\u6765\u308b'],
  ],
  /* ⭐ 依頼書 §2-8 の再現: 器の書きを openPrep でなく btnAccept に置く
     → UI の受注は通るが **闇市の生成クエストが乗らない**。→ (1b) だけが赤くなるべき。 */
  skipgen: [
    ['tavern.html',
     '    writeActiveQuest(sc);          /* \u2605[#64] \u2b50 \u547c\u3073\u53e3 4 \u672c\u3059\u3079\u3066\u304c\u3053\u3053\u3092\u901a\u308b (\u4f9d\u983c\u66f8 \u00a72-8)\u3002',
     '    /* \u2605\u5909\u7570skipgen: openPrep \u3067\u306f\u66f8\u304b\u306a\u3044 \u2014 \u547c\u3073\u53e3 4 \u672c\u3059\u3079\u3066\u304c\u3053\u3053\u3092\u901a\u308b (\u4f9d\u983c\u66f8 \u00a72-8)\u3002'],
    ['tavern.html',
     '    if (!currentScenario || !isUnlocked(currentScenario)) return;',
     '    if (!currentScenario || !isUnlocked(currentScenario)) return; writeActiveQuest(currentScenario);  /* \u2605\u5909\u7570skipgen */'],
  ],
  /* 封蝋を .worldSign の **兄弟** にして class も worldSign にする → 札の枚数が濁る。→ (3b)。 */
  sealsibling: [
    ['world.html',
     '            seal.className = "worldSeal";',
     '            seal.className = "worldSign";  /* \u2605\u5909\u7570sealsibling */'],
    ['world.html',
     '            sign.appendChild(seal);',
     '            el.appendChild(seal);  /* \u2605\u5909\u7570sealsibling */'],
  ],
};
const MUT_ORDER = ['sealfromvessel', 'addline', 'hudid', 'seamwindow', 'lsword',
                   'hudbutton', 'replacenav', 'noclear', 'skipgen', 'sealsibling'];
/* その変異で **赤くなるべき** assert の接頭辞。⭐ 「負のコントロールが空振りしていない」ことの
   唯一の判定基準。⚠ 依頼書 §9 の負のコントロール表の写し。勝手に緩めない。 */
const MUT_EXPECT = {
  sealfromvessel: ['(3c'],
  addline:        ['(2c'],
  hudid:          ['(4d'],
  seamwindow:     ['(5a'],
  lsword:         ['(5b'],
  hudbutton:      ['(5d'],
  replacenav:     ['(4b'],
  noclear:        ['(1c'],
  skipgen:        ['(1b'],
  sealsibling:    ['(3b'],
};
/* その変異で「同時に**緑のままである**べき」assert。
   ⭐ これが無いと「効きすぎて全部赤 = 何を検出したのか分からない」変異を通してしまう。 */
const MUT_KEEP_GREEN = {
  sealfromvessel: ['(3a', '(3b', '(3e'],
  addline:        ['(2a'],
  hudid:          ['(4a'],
  seamwindow:     ['(5c'],
  lsword:         ['(5a', '(5c'],
  hudbutton:      ['(5b', '(2d'],
  replacenav:     ['(4a'],
  noclear:        ['(1a', '(1b'],
  skipgen:        ['(1a'],
  sealsibling:    ['(3c', '(3e'],
};

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}

/* ⭐ 配信バイトの凍結。起動時に 1 回だけ読む。別窓が本体を保存しても走行中に混ざらない。 */
const FROZEN = {};
for (const rel of MUT_TARGETS) FROZEN[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ══ 変異アンカーの検算 ═══════════════════════════════════════════════════
 *  ⛔ --mutate の有無に関わらず**毎回**回す。0 件ヒットの変異を放置すると、
 *    負のコントロールが静かに空振りして「全部緑」になる。
 *  ⚠⚠ **必ず FROZEN (手つかずの原本) に対して数える。** 変異後のバッファで数えると、
 *    アンカーを共有する変異が「注入点 0 箇所」で偽の腐敗になり、1 度も走らなくなる。
 *  ⭐ 「他ファイルにも同じ行がある」は、その変異が **そのファイルを宣言していない** ときだけ
 *    fatal (replacenav のように 2 面へ同時注入する変異を殺さないため)。 */
function auditMutations() {
  const status = {};
  let fatal = 0;
  for (const key of MUT_ORDER) {
    let st = 'ok';
    const note = [];
    const declared = MUTATIONS[key].map(p => p[0]);
    for (const pair of MUTATIONS[key]) {
      const rel = pair[0], from = pair[1], to = pair[2];
      if (from.indexOf('\n') >= 0 || to.indexOf('\n') >= 0) {
        console.error('[drv] ⛔ ' + key + ': 置換文字列が複数行'); st = 'fatal'; continue;
      }
      if (from.length === to.length) {
        console.error('[drv] ⛔ ' + key + ': 置換前後が同じ長さ → 当たっても何も変わらない'); st = 'fatal'; continue;
      }
      const n = FROZEN[rel].split(from).length - 1;
      const elsewhere = MUT_TARGETS.filter(r => r !== rel && declared.indexOf(r) < 0
                                                && FROZEN[r].indexOf(from) >= 0);
      if (elsewhere.length || n !== 1) {
        console.error('[drv] ⛔ 変異 ' + key + ' のアンカーが ' + rel + ' に ' + n + ' 箇所'
          + (elsewhere.length ? ' / 宣言していない他ファイルにも: ' + elsewhere.join(',') : '')
          + ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 70)));
        st = 'fatal';
      } else {
        note.push(rel + ' x1');
      }
    }
    if (st === 'fatal') fatal++;
    status[key] = { st: st, note: note.join(' / ') };
  }
  return { status: status, fatal: fatal };
}
function mutatedSource(rel) {
  let s = FROZEN[rel];
  if (!MUTATE) return s;
  for (const pair of MUTATIONS[MUTATE]) if (pair[0] === rel) s = s.split(pair[1]).join(pair[2]);
  return s;
}

/* ⭐ 副行の **既定文言** は配信元の HTML から抜く。⛔ ドライバに写経しない
   (写経すると「既定が変わった」を検出できず (2b) が飾りになる)。 */
function defaultSubline(rel, id) {
  const src = FROZEN[rel];
  const i = src.indexOf('id="' + id + '"');
  if (i < 0) return null;
  const m = /<small>([\s\S]*?)<\/small>/.exec(src.slice(i, i + 800));
  return m ? m[1] : null;
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  /* ⚠ Edge は起動不可 (この環境の実測)。Chrome だけを見る。 */
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/world.html';
        const rel = u.replace(/^\/+/, '');
        if (MUT_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSource(rel)); return;
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
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', (d) => { b += d; });
      r.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

/* ══ 3 値の記録 ════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, st: cond ? 'PASSED' : 'FAILED' });
  console.log('  ' + (cond ? 'PASSED' : 'FAILED') + ' ' + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, owner) {
  results.push({ name: name, st: 'PENDING', owner: owner });
  console.log('  **PENDING** ' + name + '  -- ' + owner);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const J = (v) => JSON.stringify(v);

/* 全ページの pageerror を 1 箇所へ溜める (装置 assert が読む)。 */
const PAGE_ERRS = [];

// ══════════════════════════════════════════════════════════════════════════════
// ページを開く共通手順
//   ⚠⚠ same-origin の localStorage / sessionStorage は **タブを跨いで生き残る**
//     (localStorage は特に)。document-start で dragonfighters.* / df.* を purge してから
//     この試験が要る値だけを置く。
//   ⚠ purge は **1 タブ 1 回**に絞る (sessionStorage の目印)。絞らないと遷移のたびに
//     再実行され、questDest の消費や ?questmark=0 の写しが毎ページ蘇る。
// ══════════════════════════════════════════════════════════════════════════════
async function newPage(browser, tag, o) {
  o = o || {};
  const page = await browser.newPage();
  page.on('pageerror', e => PAGE_ERRS.push(tag + ' pageerror: ' + e.message));
  await page.setViewport({ width: o.w || 1440, height: o.h || 900,
                           isMobile: !!o.mobile, hasTouch: !!o.mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((sd) => {
    try {
      if (sessionStorage.getItem('__drvSeeded')) return;
      sessionStorage.setItem('__drvSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0)) kill.push(k);
      }
      kill.forEach(k => localStorage.removeItem(k));
      const kill2 = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.indexOf('dragonfighters.') === 0) kill2.push(k);
      }
      kill2.forEach(k => sessionStorage.removeItem(k));

      if (sd.pc) localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(sd.pc));
      if (sd.cleared) localStorage.setItem('dragonfighters.cleared', JSON.stringify(sd.cleared));
      /* ⚠ 前口上 / 単身出発の確認は「一度きりの案内」。仕込まないと受注が止まる。 */
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.soloWarnSeen', '1');
      /* ⚠ 闇市は解禁前は DOM に作られない (札の母集団ガード)。 */
      localStorage.setItem('dragonfighters.plazaState',
        JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }));
      if (sd.vessel) localStorage.setItem('dragonfighters.activeQuest', JSON.stringify(sd.vessel));
      if (sd.questDest) sessionStorage.setItem('dragonfighters.questDest', sd.questDest);
      if (sd.lastResult) sessionStorage.setItem('dragonfighters.lastResult', sd.lastResult);
      if (sd.xp) localStorage.setItem('dragonfighters.xp', sd.xp);
      if (sd.gold) localStorage.setItem('dragonfighters.gold', sd.gold);
    } catch (e) {}
  }, {
    pc: o.pc || ['warrior'],
    cleared: o.cleared || null,
    vessel: o.vessel || null,
    questDest: o.questDest || null,
    lastResult: o.lastResult || null,
    xp: o.xp || null, gold: o.gold || null,
  });
  return page;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測関数 (⚠⚠ page.evaluate には **実関数** を渡すこと。文字列で渡すと式として
//   評価され、第 2 引数が届かない = undefined で落ちる)
// ══════════════════════════════════════════════════════════════════════════════
function probeWorld() {
  var t  = document.getElementById('worldTitle');
  var sm = t ? t.querySelector('small') : null;
  var bk = document.getElementById('worldBack');
  var hit = null;
  if (bk) {
    var r = bk.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var h = document.elementFromPoint(cx, cy);
    hit = { w: Math.round(r.width), h: Math.round(r.height),
            x: Math.round(r.left), y: Math.round(r.top),
            got: h ? (h.id || h.className || h.tagName) : null,
            self: !!(h && (h === bk || bk.contains(h))) };
  }
  var signs = Array.prototype.slice.call(document.querySelectorAll('.worldSign'));
  var seals = Array.prototype.slice.call(document.querySelectorAll('.worldSeal'));
  var W = window.__world || {};
  var keys = Object.keys(W), types = {};
  keys.forEach(function (k) { types[k] = typeof W[k]; });
  var WM = window.WORLD_MAP || {};
  var nodeIdOf = function (el) {
    var n = el && el.parentNode ? el.parentNode : null;
    return (n && n.id) ? String(n.id).replace(/^worldNode_/, '') : null;
  };
  return {
    small: sm ? sm.textContent : null,
    smallCount: t ? t.querySelectorAll('small').length : -1,
    titleChildren: t ? t.children.length : -1,
    titleH: t ? t.offsetHeight : -1,
    signCount: signs.length,
    signNodes: signs.map(nodeIdOf),
    sealCount: seals.length,
    sealParents: seals.map(function (s) {
      var p = s.parentNode || {};
      var nd = nodeIdOf(p);
      return { cls: p.className || null, node: nd,
               scenario: (WM.scenarioOfNode && nd) ? WM.scenarioOfNode(nd) : null };
    }),
    signHits: signs.map(function (sg) {
      var r = sg.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var inView = cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight;
      var h = inView ? document.elementFromPoint(cx, cy) : null;
      return { node: nodeIdOf(sg), inView: inView,
               got: h ? (h.id || h.className || h.tagName) : null,
               self: !!(h && (h === sg || sg.contains(h))) };
    }),
    backExists: !!bk, backHit: hit,
    seamKeys: keys.slice().sort(), seamTypes: types,
    insets: (typeof W.insets === 'function') ? W.insets() : null,
    worldHudNull: document.getElementById('worldHud') === null,
    compact: (typeof W.compact === 'function') ? W.compact() : null,
    questDestSeam: (typeof W.questDest === 'function') ? W.questDest() : null,
    /* ⚠ NODES / STEPS / SITES は **オブジェクト**、EDGES だけ配列
       (STEPS を .length で数えると undefined になり、JSON からキーごと落ちて
        「無傷」の判定が静かに崩れる。2026-09-10 に実測で踏んだ)。 */
    wm: { nodes: WM.NODES ? Object.keys(WM.NODES).length : -1,
          edges: WM.EDGES ? WM.EDGES.length : -1,
          steps: WM.STEPS ? Object.keys(WM.STEPS).length : -1,
          sites: WM.SITES ? Object.keys(WM.SITES).length : -1 },
    vessel: (function () { try { return localStorage.getItem('dragonfighters.activeQuest'); } catch (e) { return null; } })(),
    path: location.pathname, search: location.search, histLen: history.length
  };
}

function probeTown() {
  var t  = document.getElementById('townTitle');
  var sm = t ? t.querySelector('small') : null;
  var bk = document.getElementById('townBack');
  var hit = null;
  if (bk) {
    var r = bk.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var h = document.elementFromPoint(cx, cy);
    hit = { w: Math.round(r.width), h: Math.round(r.height),
            x: Math.round(r.left), y: Math.round(r.top),
            got: h ? (h.id || h.className || h.tagName) : null,
            self: !!(h && (h === bk || bk.contains(h))) };
  }
  var TM = window.TOWN_MAP || {};
  var signs = Array.prototype.slice.call(document.querySelectorAll('.townSign'));
  var tb = t ? t.getBoundingClientRect().bottom : 0;
  return {
    small: sm ? sm.textContent : null,
    smallCount: t ? t.querySelectorAll('small').length : -1,
    titleChildren: t ? t.children.length : -1,
    titleH: t ? t.offsetHeight : -1,
    titleBottom: Math.round(tb),
    signCount: signs.length,
    belowTitle: signs.filter(function (s) { return s.getBoundingClientRect().top > tb; }).length,
    facCount: TM.FACILITIES ? TM.FACILITIES.length : -1,
    hudButtons: document.querySelectorAll('#townHud button').length,
    backExists: !!bk, backHit: hit,
    compact: document.body.classList.contains('compact'),
    vessel: (function () { try { return localStorage.getItem('dragonfighters.activeQuest'); } catch (e) { return null; } })(),
    path: location.pathname, search: location.search, histLen: history.length
  };
}

function probeTavern() {
  var out = { threw: '' };
  /* ⚠ classic script 直下の const は window に載らない。**裸の識別子**で読む。 */
  try { out.scenarios = scenarios.map(function (s) { return { id: s.id, place: s.place, title: s.title }; }); }
  catch (e) { out.threw += 'scenarios:' + ((e && e.message) || e) + ' '; }
  var t  = document.getElementById('title');
  var sm = t ? t.querySelector('small') : null;
  out.small = sm ? sm.textContent : null;
  out.smallCount = t ? t.querySelectorAll('small').length : -1;
  out.titleChildren = t ? t.children.length : -1;
  out.titleH = t ? t.offsetHeight : -1;
  try { out.vessel = localStorage.getItem('dragonfighters.activeQuest'); } catch (e) { out.vessel = null; }
  try { out.lastResult = sessionStorage.getItem('dragonfighters.lastResult'); } catch (e) { out.lastResult = null; }
  out.win = { openPrep: typeof window.openPrep, writeActiveQuest: typeof window.writeActiveQuest,
              clearActiveQuest: typeof window.clearActiveQuest, readActiveQuest: typeof window.readActiveQuest,
              questSubline: typeof window.questSubline, applyQuestSubline: typeof window.applyQuestSubline,
              isQuestMarkOn: typeof window.isQuestMarkOn };
  out.hasDFSlots = !!window.DFSlots;
  out.keep = window.DFSlots ? Object.keys(window.DFSlots.KEEP || {}) : null;
  out.path = location.pathname; out.search = location.search;
  return out;
}

/* ══ 開く 3 本 ═══════════════════════════════════════════════════════════ */
async function openWorld(browser, base, tag, o) {
  o = o || {};
  const page = await newPage(browser, tag, o);
  await page.goto(base + '/world.html' + (o.query || ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
  let alive = true;
  try { await page.waitForFunction('!!window.__world && !!window.WORLD_MAP', { timeout: 20000 }); }
  catch (e) { alive = false; }
  await sleep(220);
  const m = alive ? await page.evaluate(probeWorld) : { dead: true };
  m.tag = tag; m.alive = alive;
  if (o.keepOpen) { m.page = page; return m; }
  await page.close();
  return m;
}
async function openTown(browser, base, tag, o) {
  o = o || {};
  const page = await newPage(browser, tag, o);
  await page.goto(base + '/town.html' + (o.query || ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
  let alive = true;
  try { await page.waitForFunction('!!window.__town && !!window.TOWN_MAP', { timeout: 20000 }); }
  catch (e) { alive = false; }
  await sleep(220);
  const m = alive ? await page.evaluate(probeTown) : { dead: true };
  m.tag = tag; m.alive = alive;
  if (o.keepOpen) { m.page = page; return m; }
  await page.close();
  return m;
}
/* ⚠ 酒場は load が重い (音源つき)。**domcontentloaded で足りる** ——
   インライン script は解析中に走り切るので、最終行の applyQuestSubline("title") は
   DOMContentLoaded より前に必ず終わっている。 */
async function openTavern(browser, base, tag, o) {
  o = o || {};
  const page = await newPage(browser, tag, o);
  await page.goto(base + '/tavern.html' + (o.query || ''), { waitUntil: 'domcontentloaded', timeout: 40000 });
  let alive = true;
  try { await page.waitForFunction("typeof scenarios !== 'undefined'", { timeout: 25000 }); }
  catch (e) { alive = false; }
  await sleep(260);
  const m = alive ? await page.evaluate(probeTavern) : { dead: true, threw: '起動しない' };
  m.tag = tag; m.alive = alive; m.page = page;
  return m;
}

/* ══ 実クリックで受注する ═══════════════════════════════════════════════
 *  ⛔ prepScenario を直接置く近道にしない (依頼書 (1a) は「依頼カードから実クリック」)。
 *  ⭐ 終端は **prepScenario が入ったか** で見る。器の有無で終端を決めると
 *    ?questmark=0 のときに永久に回る (器が書かれないのが正しい姿だから)。 */
async function acceptByClick(page, scId, maxSteps) {
  const steps = [];
  for (let i = 0; i < (maxSteps || 60); i++) {
    const st = await page.evaluate((sid) => {
      var vis = function (el) {
        if (!el) return false;
        if (typeof el.checkVisibility === 'function')
          return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        return el.getClientRects().length > 0;
      };
      var q = function (id) { return document.getElementById(id); };
      var prep = null;
      try { prep = (typeof prepScenario === 'object' && prepScenario) ? prepScenario.id : null; } catch (e) {}
      if (prep) return { done: true, at: 'openPrep', id: prep };
      var acc = q('btnAccept');
      if (vis(acc) && !acc.disabled) { acc.click(); return { done: false, at: 'btnAccept' }; }
      if (vis(q('prologueOverlay'))) { q('prologueOverlay').click(); return { done: false, at: 'prologueOverlay' }; }
      var t = document.querySelector('#questTable_' + sid + ', #tableArea .table');
      if (t && vis(t)) { t.click(); return { done: false, at: 'table' }; }
      return { done: false, at: '(wait)' };
    }, scId);
    if (steps[steps.length - 1] !== st.at) steps.push(st.at);
    if (st.done) return { reached: true, steps: steps, id: st.id };
    await sleep(280);
  }
  return { reached: false, steps: steps, id: null };
}

/* ══ 戻るボタンを **実座標でクリック** して title.html へ ═══════════════ */
async function pressBack(browser, base, tag, which, o) {
  o = o || {};
  const open = which === 'world' ? openWorld : openTown;
  const m = await open(browser, base, tag, Object.assign({}, o, { keepOpen: true }));
  const page = m.page;
  const out = { tag: tag, why: null, before: m.histLen, after: null, path: null, hit: m.backHit };
  if (!m.alive)      { out.why = 'ページが起動しない'; await page.close(); return out; }
  if (!m.backExists) { out.why = (which === 'world' ? '#worldBack' : '#townBack') + ' が DOM に無い'; await page.close(); return out; }
  if (!m.backHit || !m.backHit.self) {
    out.why = '戻るボタンが他の要素に覆われている: ' + J(m.backHit); await page.close(); return out;
  }
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.mouse.click(m.backHit.x + Math.round(m.backHit.w / 2), m.backHit.y + Math.round(m.backHit.h / 2)),
    ]);
  } catch (e) { out.why = '遷移しなかった: ' + e.message; await page.close(); return out; }
  await sleep(300);
  const t = await page.evaluate(() => ({ path: location.pathname, search: location.search,
                                         histLen: history.length,
                                         hasSlots: !!document.getElementById('slotList') }));
  out.path = t.path; out.search = t.search; out.after = t.histLen; out.hasSlots = t.hasSlots;
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// --negative : 10 変異を自分で回し、赤くならなければ exit 1
// ══════════════════════════════════════════════════════════════════════════════
function runNegative(audit) {
  console.log('══════ 負のコントロール (--negative) ══════');
  console.log('  ⭐ 「その変異で赤くなるはずの assert」が実際に FAILED になるかを見る。');
  console.log('  ⭐ 同時に「緑のままであるべき assert」が赤くなっていないか (効きすぎ) も見る。');
  let bad = 0, pend = 0;
  MUT_ORDER.forEach((key, i) => {
    const want = MUT_EXPECT[key];
    if (audit.status[key].st === 'pending') {
      pend++;
      console.log('  **PENDING** 変異 ' + key + ' — アンカー未実装 (' + audit.status[key].note + ')');
      return;
    }
    /* ⚠ 子は逐次実行なので 7 本のポートを使い回してよい (10222..10228)。 */
    const port = PORT + 1 + (i % 7);
    const t0 = Date.now();
    let out = '';
    try {
      out = execFileSync(process.execPath, [__filename, '--mutate', key, '--port', String(port)],
                         { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: ROOT });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');   // FAILED があると exit 1 で来る = 正常
    }
    const lines = out.split(/\r?\n/);
    const hasFailed = (pfx) => lines.some(l => l.indexOf('FAILED ' + pfx) >= 0);
    const isPending = (pfx) => lines.some(l => l.indexOf('**PENDING** ' + pfx) >= 0);
    const missing   = want.filter(pfx => !hasFailed(pfx));
    const keep      = MUT_KEEP_GREEN[key] || [];
    const overreach = keep.filter(pfx => hasFailed(pfx));
    const notYet    = want.filter(pfx => isPending(pfx));
    const ok = missing.length === 0 && overreach.length === 0;
    if (!ok) bad++;
    console.log('  ' + (ok ? 'PASSED' : 'FAILED') + ' 変異 ' + key + ' (:' + port + ' '
      + ((Date.now() - t0) / 1000).toFixed(0) + 's) で ' + want.map(x => x + ')').join(' / ') + ' が赤くなる'
      + '  [緑のまま: ' + (keep.length ? keep.map(x => x + ')').join(' ') : 'なし') + ']'
      + (missing.length ? '  — ⛔ 赤くならなかった: ' + missing.join(' ') : '')
      + (overreach.length ? '  — ⛔ 効きすぎ (緑のままであるべき): ' + overreach.join(' ') : '')
      + (notYet.length ? '  (うち未実装: ' + notYet.join(' ') + ')' : ''));
    if (!ok) {
      const tail = lines.filter(l => /PASSED|FAILED|PENDING|\[drv\]/.test(l)).slice(-45).join('\n');
      console.log('    ---- 変異 ' + key + ' の出力 (末尾) ----\n' + tail);
    }
  });
  console.log('════════════════════════════════════════════');
  console.log('  ' + (MUT_ORDER.length - pend) + ' / ' + MUT_ORDER.length + ' 実行  (PENDING ' + pend + ')');
  console.log(bad === 0 ? '  空振りした変異は無い (PASS)' : '  ⛔ ' + bad + ' 本が空振り = 検出器が壊れている');
  console.log('════════════════════════════════════════════');
  process.exit(bad === 0 ? 0 : 1);
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_quest_visibility.js' + (MUTATE ? '  [変異 ' + MUTATE + ']' : '') + ' ===\n');

  const audit = auditMutations();
  if (audit.fatal) {
    console.error('[drv] ⛔ 変異アンカーの検算に失敗 → 測定不能');
    process.exit(3);
  }
  if (NEGATIVE) return runNegative(audit);

  /* ── §0 装置: 変異アンカー ────────────────────────────────────────── */
  console.log('--- §0 装置 (変異アンカーの健在) ---');
  for (const key of MUT_ORDER) {
    const st = audit.status[key];
    const nm = '(0z-' + key + ') [装置] 変異アンカーが宣言したファイルに 1 箇所ずつヒットする';
    if (st.st === 'pending') pending(nm, 'アンカー未実装');
    else check(nm, true, st.note + '  → 赤くなるべき ' + MUT_EXPECT[key].map(x => x + ')').join(' '));
  }

  const puppeteer = loadPuppeteer();
  const exe = findBrowser();
  const profile = require('./_pptr_profile')('df_questvis_');
  const srv = await startServer(PORT);
  const base = 'http://localhost:' + PORT;
  console.log('[drv] ' + base + '  browser=' + path.basename(exe)
    + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  const browser = await puppeteer.launch({
    executablePath: exe, headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });

  try {
    // ══════════════════════════════════════════════════════════════════
    // §0 装置 — まず母集団を確かめる
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §0 装置 (先に母集団を確かめる) ---');

    /* T0/T1: 素の酒場。ここで ① SCENARIOS の実体 ② 副行の既定 ③ 実クリック受注 を採る。 */
    const T = await openTavern(browser, base, '[T0 素の酒場]', {});
    check('(0z-boot) [装置] tavern.html が起動し、裸の識別子 scenarios が読め、6 関数が window に載っている',
      T.alive === true && T.threw === '' && Array.isArray(T.scenarios) && T.scenarios.length >= 6
        && T.win.openPrep === 'function' && T.win.writeActiveQuest === 'function'
        && T.win.clearActiveQuest === 'function' && T.win.readActiveQuest === 'function'
        && T.win.questSubline === 'function' && T.win.applyQuestSubline === 'function'
        && T.win.isQuestMarkOn === 'function',
      'threw=' + J(T.threw) + ' scenarios=' + (T.scenarios ? T.scenarios.length : 'n/a')
        + ' window=' + J(T.win));

    const SC = (T.scenarios && T.scenarios[0]) ? T.scenarios[0] : { id: '', place: '', title: '' };
    /* ⭐ 期待文言は **ブラウザで引いた実体** から組む。⛔ 値をドライバに書かない。 */
    const EXPECT = SC.title ? ('受注中 — ' + SC.place + '「' + SC.title + '」')
                            : ('受注中 — ' + SC.place);
    const VESSEL = { id: SC.id, place: SC.place, title: SC.title, at: 1700000000000 };
    /* ⭐ 「クリア済 5 件」も写経しない。scenarios の並びの先頭 5 件から導く
       (これが無いと札は 2 枚しか立たず、(0c) が永久に赤くなる)。 */
    const CLEARED = T.scenarios ? T.scenarios.slice(0, 5).map(s => s.id) : [];

    /* (0b) 写経していないことの静的検査。⭐ 自分のソースに place / title の
       リテラルが 1 つも無いことを機械的に落とす (verify_title_screen (6z0) と同型)。 */
    const selfSrc = fs.readFileSync(__filename, 'utf8');
    const leaked = [];
    (T.scenarios || []).forEach(s => {
      if (s.place && selfSrc.indexOf(s.place) >= 0) leaked.push('place:' + s.place);
      if (s.title && selfSrc.indexOf(s.title) >= 0) leaked.push('title:' + s.title);
    });
    const dfWorld  = defaultSubline('world.html', 'worldTitle');
    const dfTown   = defaultSubline('town.html', 'townTitle');
    const dfTavern = defaultSubline('tavern.html', 'title');
    check('(0b) [装置] 期待文言を写経していない — place / title はブラウザの scenarios から引き、'
      + '既定の副行は配信元 HTML から抜いている (ドライバのソースに実データのリテラルが 0 件)',
      leaked.length === 0 && (T.scenarios || []).length === 6
        && !!SC.place && !!SC.title
        && EXPECT.indexOf(SC.place) >= 0 && EXPECT.indexOf(SC.title) >= 0
        && !!dfWorld && !!dfTown && !!dfTavern
        && selfSrc.indexOf(dfWorld) < 0 && selfSrc.indexOf(dfTown) < 0 && selfSrc.indexOf(dfTavern) < 0,
      'ソースへの漏れ=' + J(leaked) + '  組み立てた期待文言=' + J(EXPECT)
        + '  既定の副行 (HTML から抜いた) world=' + J(dfWorld) + ' town=' + J(dfTown) + ' tavern=' + J(dfTavern)
        + '  cleared に仕込む id=' + J(CLEARED));

    /* 世界地図の 2 状態 (素 / 器あり)。(0a) はこの 2 つが **違う値**を返すこと。 */
    const B0  = await openWorld(browser, base, '[B0 世界地図 素]',    { cleared: CLEARED });
    const B1  = await openWorld(browser, base, '[B1 世界地図 器あり]', { cleared: CLEARED, vessel: VESSEL });
    const B0c = await openWorld(browser, base, '[B0c 素 compact]',    { cleared: CLEARED, w: 390, h: 844, mobile: true });
    const B1c = await openWorld(browser, base, '[B1c 器 compact]',    { cleared: CLEARED, vessel: VESSEL, w: 390, h: 844, mobile: true });

    check('(0a) [装置] 器を仕込んだ状態と素の状態で #worldTitle small の textContent が **違う値**を返す'
      + ' (⭐ これが無いと全 assert が空振りで永久緑になる)',
      B0.alive === true && B1.alive === true
        && typeof B0.small === 'string' && typeof B1.small === 'string'
        && B0.small.length > 0 && B1.small.length > 0 && B0.small !== B1.small,
      '素=' + J(B0.small) + '  /  器あり=' + J(B1.small));

    check('(0c) [装置] 素の world.html で .worldSign が 7 枚ある (封蝋の母集団が立っている)'
      + ' — 直書きせず WORLD_MAP.SITES の件数 + 港町 1 枚からも導いて突き合わせる',
      B0.signCount === 7 && B0.signCount === B0.wm.sites + 1,
      '.worldSign=' + B0.signCount + ' 枚 [' + (B0.signNodes || []).join(',') + ']'
        + '  SITES=' + B0.wm.sites + ' (+港町 1 = ' + (B0.wm.sites + 1) + ')');

    // ══════════════════════════════════════════════════════════════════
    // §1 器
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §1 器 ---');

    /* (1a) 依頼カードから実クリックで受注する。 */
    const acc = await acceptByClick(T.page, SC.id);
    const v1a = await T.page.evaluate(() => {
      var raw = null, o = null, threw = '';
      try { raw = localStorage.getItem('dragonfighters.activeQuest'); } catch (e) { threw = String(e); }
      try { o = JSON.parse(raw || 'null'); } catch (e) { threw += ' parse:' + String(e); }
      return { raw: raw, keys: (o && typeof o === 'object') ? Object.keys(o).sort() : null, o: o, threw: threw };
    });
    check('(1a) 依頼カードから **実クリック**で受注 → localStorage["dragonfighters.activeQuest"] が'
      + ' {id, place, title, at} の 4 キーを持ち、place / title が SCENARIOS の実体と一致',
      acc.reached === true && acc.id === SC.id && !!v1a.o
        && eq(v1a.keys, ['at', 'id', 'place', 'title'])
        && v1a.o.id === SC.id && v1a.o.place === SC.place && v1a.o.title === SC.title
        && typeof v1a.o.at === 'number' && v1a.o.at > 0,
      '押した順=' + J(acc.steps) + ' prepScenario.id=' + J(acc.id)
        + '  器のキー=' + J(v1a.keys) + '  id 一致=' + (v1a.o ? (v1a.o.id === SC.id) : 'n/a')
        + ' place 一致=' + (v1a.o ? (v1a.o.place === SC.place) : 'n/a')
        + ' title 一致=' + (v1a.o ? (v1a.o.title === SC.title) : 'n/a')
        + ' at の型=' + (v1a.o ? typeof v1a.o.at : 'n/a')
        + (v1a.threw ? '  ⛔ ' + v1a.threw : ''));
    await T.page.close();

    /* (1b) 闇市の生成クエスト。⭐ 本番の変換器と本番の openPrep を通す
       (⛔ 合成シナリオをドライバに写経しない)。 */
    const Tg = await openTavern(browser, base, '[T3 生成クエスト]', {});
    const gen = Tg.alive ? await Tg.page.evaluate(() => {
      var out = { threw: '', id: null, place: null, title: null, before: null, after: null };
      try { out.before = localStorage.getItem('dragonfighters.activeQuest'); } catch (e) {}
      try {
        var q = QuestGen.generateQuest(3, { source: 'plaza' });
        q._sentence = QuestGen.buildSentence(q);
        var s = buildPlazaSynthetic(q);            // ★ 本番の 生成クエスト → シナリオ 変換
        out.id = s.id; out.place = s.place; out.title = s.title;
        /* ★ 本番の呼び口。闇市の 2 本 (openPrep(synthetic)) と同じ形。
           ⚠ async だが writeActiveQuest は最初の await より前なので同期で走り切る。 */
        Promise.resolve(openPrep(s)).catch(function () {});
      } catch (e) { out.threw = String((e && e.message) || e); }
      try { out.after = localStorage.getItem('dragonfighters.activeQuest'); } catch (e) {}
      return out;
    }) : { threw: '酒場が起動しない' };
    let genV = null;
    try { genV = gen.after ? JSON.parse(gen.after) : null; } catch (e) { genV = null; }
    check('(1b) ⭐ **闇市の生成クエスト**で受注しても器が書かれる (呼び口 4 本すべてが openPrep を通るため)',
      gen.threw === '' && gen.before === null && !!genV
        && eq(Object.keys(genV).sort(), ['at', 'id', 'place', 'title'])
        && genV.id === gen.id && genV.place === gen.place && genV.title === gen.title
        && typeof genV.place === 'string' && genV.place.length > 0,
      '合成シナリオ=' + J({ id: gen.id, place: gen.place, title: gen.title })
        + '  受注前の器=' + J(gen.before) + '  受注後の器=' + J(gen.after)
        + (gen.threw ? '  ⛔ ' + gen.threw : ''));
    if (Tg.page) await Tg.page.close();

    /* (1c) cleared / defeated / retreated の 3 経路。
       ⭐ 「消えた」だけでなく **lastResult が実際に消費された**ことも同じ判定に畳む
         (酒場が consumeResult を通っていないのに器が最初から無い、を殺す)。 */
    const RESULT_CASES = [
      ['cleared',   { cleared: true,  defeated: false }],
      ['defeated',  { cleared: false, defeated: true }],
      ['retreated', { cleared: false, defeated: false, retreated: true }],
    ];
    const c1c = [];
    for (const rc of RESULT_CASES) {
      const payload = JSON.stringify(Object.assign({
        scenarioId: SC.id, scenarioTitle: SC.title,
        reward: { gold: 0, totalGold: 0, earnedXp: 0, totalXp: 0 },
      }, rc[1]));
      const tr = await openTavern(browser, base, '[T4 ' + rc[0] + ']',
                                  { vessel: VESSEL, lastResult: payload });
      c1c.push({ case: rc[0], alive: tr.alive, vessel: tr.vessel, lastResult: tr.lastResult });
      if (tr.page) await tr.page.close();
    }
    check('(1c) lastResult を cleared / defeated / retreated の **3 経路それぞれ**で仕込んで酒場を開く'
      + ' → 器が 3 回とも消えている (⭐ 同時に lastResult が消費されている = consumeResult を通った証拠)',
      c1c.length === 3 && c1c.every(r => r.alive === true && r.vessel === null && r.lastResult === null),
      c1c.map(r => r.case + ': 器=' + J(r.vessel) + ' lastResult=' + J(r.lastResult)).join('  |  '));

    /* (1d) スロット保存に自動で乗る。 */
    const Ts = await openTavern(browser, base, '[T5 スロット]', { vessel: VESSEL });
    const snap = Ts.alive ? await Ts.page.evaluate(() => {
      var out = { threw: '', keep: null, dataKeys: null, value: null, slot: null };
      try {
        out.keep = Object.keys(DFSlots.KEEP || {});
        DFSlots.snapshot();                                  // ★ 本番の保存
        out.slot = String(DFSlots.active());
        var raw = localStorage.getItem(DFSlots._slotKey(DFSlots.active()));
        var o = JSON.parse(raw || 'null');
        out.dataKeys = (o && o.data) ? Object.keys(o.data).sort() : null;
        out.value = (o && o.data) ? o.data['dragonfighters.activeQuest'] : null;
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    }) : { threw: '酒場が起動しない' };
    check('(1d) 器のキーが js/save-slots.js の KEEP に入っていない = DFSlots.snapshot() の data に含まれる',
      snap.threw === '' && Array.isArray(snap.keep)
        && snap.keep.indexOf('dragonfighters.activeQuest') < 0
        && Array.isArray(snap.dataKeys) && snap.dataKeys.indexOf('dragonfighters.activeQuest') >= 0
        && typeof snap.value === 'string' && snap.value.indexOf(SC.id) >= 0,
      'KEEP=' + J(snap.keep) + '  slot=' + J(snap.slot)
        + '  data に器がある=' + (snap.dataKeys ? (snap.dataKeys.indexOf('dragonfighters.activeQuest') >= 0) : 'n/a')
        + '  data のキー数=' + (snap.dataKeys ? snap.dataKeys.length : 'n/a')
        + (snap.threw ? '  ⛔ ' + snap.threw : ''));
    if (Ts.page) await Ts.page.close();

    // ══════════════════════════════════════════════════════════════════
    // §2 常時表示
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §2 常時表示 (3 面) ---');
    const C0 = await openTown(browser, base, '[C0 街 素]',      {});
    const C1 = await openTown(browser, base, '[C1 街 器あり]',   { vessel: VESSEL });
    const Tv = await openTavern(browser, base, '[T6 酒場 器あり]', { vessel: VESSEL });
    const tavSmall = Tv.small;
    if (Tv.page) await Tv.page.close();

    check('(2a) 受注後、#worldTitle small / #townTitle small / #title small の 3 面が'
      + ' 受注中の表示になる (文言は (0b) の実体から組む)',
      B1.small === EXPECT && C1.small === EXPECT && tavSmall === EXPECT,
      '期待=' + J(EXPECT) + '  world=' + J(B1.small) + '  town=' + J(C1.small) + '  tavern=' + J(tavSmall));

    check('(2b) 未受注では 3 面とも **今日の文言のまま** (1 文字も変わらない)'
      + ' — 期待値は配信元 HTML の <small> から抜いたもの',
      B0.small === dfWorld && C0.small === dfTown && T.small === dfTavern,
      'world 期待=' + J(dfWorld) + ' 実測=' + J(B0.small)
        + '  town 期待=' + J(dfTown) + ' 実測=' + J(C0.small)
        + '  tavern 期待=' + J(dfTavern) + ' 実測=' + J(T.small));

    check('(2c) ⭐ #worldTitle の offsetHeight が **受注前と受注後で同じ** (行を増やしていない)'
      + ' — desktop / compact 390 の両方で測り、<small> の枚数と子要素の数も動いていない',
      B0.titleH > 0 && B0.titleH === B1.titleH
        && B0c.titleH > 0 && B0c.titleH === B1c.titleH
        && B0.smallCount === B1.smallCount && B0.titleChildren === B1.titleChildren
        && B0c.smallCount === B1c.smallCount && B0c.titleChildren === B1c.titleChildren,
      'desktop 素=' + B0.titleH + 'px 受注後=' + B1.titleH + 'px'
        + '  compact390 素=' + B0c.titleH + 'px 受注後=' + B1c.titleH + 'px'
        + '  <small> 枚数 ' + B0.smallCount + '→' + B1.smallCount
        + ' / ' + B0c.smallCount + '→' + B1c.smallCount
        + '  子要素 ' + B0.titleChildren + '→' + B1.titleChildren
        + ' / ' + B0c.titleChildren + '→' + B1c.titleChildren);

    check('(2d) #townTitle の下端より下に .townSign が全部ある (verify_town_exit (1b) と同じ不変条件)'
      + ' — 素と受注後の両方で',
      C0.signCount > 0 && C0.belowTitle === C0.signCount
        && C1.signCount === C0.signCount && C1.belowTitle === C1.signCount
        && C0.titleH === C1.titleH,
      '素 ' + C0.belowTitle + '/' + C0.signCount + ' (titleBottom=' + C0.titleBottom + ')'
        + '  受注後 ' + C1.belowTitle + '/' + C1.signCount + ' (titleBottom=' + C1.titleBottom + ')'
        + '  #townTitle 高さ ' + C0.titleH + '→' + C1.titleH);

    // ══════════════════════════════════════════════════════════════════
    // §3 封蝋
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §3 封蝋 ---');
    const B2 = await openWorld(browser, base, '[B2 器+questDest]',
      { cleared: CLEARED, vessel: VESSEL, questDest: SC.id });
    const B3 = await openWorld(browser, base, '[B3 ?questwalk=0]',
      { cleared: CLEARED, vessel: VESSEL, questDest: SC.id, query: '?questwalk=0' });

    const sp = (B2.sealParents || [])[0] || null;
    check('(3a) questDest を仕込む → .worldSeal が **ちょうど 1 枚**で、その親の .worldSign が'
      + ' そのシナリオのノードのもの',
      B2.alive === true && B2.sealCount === 1 && !!sp
        && sp.cls === 'worldSign' && sp.scenario === SC.id && !!sp.node,
      'questDest(seam)=' + J(B2.questDestSeam) + '  .worldSeal=' + B2.sealCount + ' 枚'
        + '  親=' + J(sp) + '  (期待 scenario=' + J(SC.id) + ')');

    check('(3b) .worldSign の枚数が **7 のまま** (封蝋は子として足されている)',
      B2.signCount === 7 && B2.signCount === B0.signCount,
      '素=' + B0.signCount + ' 枚 → 封蝋あり=' + B2.signCount + ' 枚 [' + (B2.signNodes || []).join(',') + ']');

    check('(3c) ⭐⭐ **器はあるが questDest が無い**状態 → .worldSeal は 0 枚'
      + ' (罠 B の検査。器から出していたらここで赤くなる)',
      B1.alive === true && B1.vessel !== null && B1.questDestSeam === null && B1.sealCount === 0,
      '器=' + (B1.vessel ? '有' : '無') + '  questDest(seam)=' + J(B1.questDestSeam)
        + '  .worldSeal=' + B1.sealCount + ' 枚'
        + '  (副行は出ている=' + (B1.small === EXPECT) + ' ので「器を読めていない」ではない)');

    const hits = B2.signHits || [];
    check('(3d) 7 枚の札の中心の elementFromPoint が自分自身か子孫 (封蝋が奪っていない)'
      + ' — ⛔ 「押せない」と「画面外」を混ぜないため inView も併記し、desktop 1440x900 で 7 枚とも画面内',
      hits.length === 7 && hits.every(h => h.inView === true && h.self === true),
      hits.map(h => h.node + ':' + (h.inView ? '' : '画面外/') + J(h.got) + (h.self ? '' : ' ⛔奪われた')).join('  '));

    check('(3e) ⭐ 追加条件 — ?questwalk=0 + questDest あり → .worldSeal が 0 枚'
      + ' (実装は入場条件と同じ !questWalkOff を含む = 印が出る ⟺ 入れる)',
      B3.alive === true && B3.search === '?questwalk=0' && B3.sealCount === 0
        && B3.questDestSeam === SC.id,
      'search=' + J(B3.search) + '  questDest(seam)=' + J(B3.questDestSeam)
        + '  .worldSeal=' + B3.sealCount + ' 枚 (撤退なしのときは ' + B2.sealCount + ' 枚)');

    // ══════════════════════════════════════════════════════════════════
    // §4 戻る道
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §4 戻る道 ---');
    check('(4a) world.html に #worldBack / town.html に #townBack があり、中心の elementFromPoint が'
      + ' 自分自身か子孫 (= 実際に押せる)',
      B0.backExists === true && !!B0.backHit && B0.backHit.self === true
        && C0.backExists === true && !!C0.backHit && C0.backHit.self === true,
      'world=' + J(B0.backHit) + '  town=' + J(C0.backHit));

    const N1 = await pressBack(browser, base, '[N1 world→title]', 'world', { cleared: CLEARED });
    const N2 = await pressBack(browser, base, '[N2 town→title]',  'town',  {});
    check('(4b) ⭐ **実クリック**で title.html に着き、かつ history.length が **増えている**'
      + ' (⛔ location.replace にしていない) — world / town の 2 面とも',
      N1.path === '/title.html' && N1.after > N1.before
        && N2.path === '/title.html' && N2.after > N2.before,
      'world: ' + J(N1.path) + ' history ' + N1.before + '→' + N1.after + (N1.why ? ' ⛔' + N1.why : '')
        + '   town: ' + J(N2.path) + ' history ' + N2.before + '→' + N2.after + (N2.why ? ' ⛔' + N2.why : ''));

    /* (4c) 戻った先でスロットを選ぶと進行が戻る。
       ⭐ verify_title_screen 受入条件 3 と同じ手順を **借りる** (⛔ あちらのファイルは読むだけ):
         ① スロット1 に進行 A を作る ② スロット2 へ切り替えて別の進行 B にする
         ③ 世界地図の戻るボタンで title へ ④ スロット1 の「つづきから」→ A が戻る
       ⚠ ② が無いと「そもそも切り替わっていない」ときも自明に緑になる (あちらの (3z3) の教訓)。 */
    const XP_A = '23456', GOLD_A = '4321', HERO_A = 'warrior', HERO_B = 'mage';
    const S = { why: null };
    {
      const page = await newPage(browser, '[S スロット]', { pc: [HERO_A], xp: XP_A, gold: GOLD_A });
      await page.goto(base + '/world.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('!!window.DFSlots', { timeout: 20000 }).catch(() => {});
      S.setup = await page.evaluate((hb) => {
        var out = { threw: '' };
        try {
          out.slotBefore = String(DFSlots.active());
          DFSlots.switchTo(2);                                  // ★ 本番の切り替え (先に snapshot を焼く)
          localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([hb]));
          localStorage.setItem('dragonfighters.xp', '100');
          localStorage.setItem('dragonfighters.gold', '7');
          out.slotAfter = String(DFSlots.active());
          out.liveB = { xp: localStorage.getItem('dragonfighters.xp'),
                        gold: localStorage.getItem('dragonfighters.gold'),
                        pc: localStorage.getItem('dragonfighters.partyComposition') };
        } catch (e) { out.threw = String((e && e.message) || e); }
        return out;
      }, HERO_B);
      /* 世界地図を開き直して戻るボタンを実クリック → title.html */
      await page.goto(base + '/world.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('!!window.__world', { timeout: 20000 }).catch(() => {});
      await sleep(220);
      const bk = await page.evaluate(() => {
        var el = document.getElementById('worldBack');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      if (!bk) { S.why = '#worldBack が無い'; }
      else {
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
            page.mouse.click(bk.x, bk.y),
          ]);
        } catch (e) { S.why = 'title.html へ遷移しなかった: ' + e.message; }
      }
      if (!S.why) {
        const SEL = '#slotList .slotCard[data-slot="1"] button[data-act="continue"]';
        try { await page.waitForSelector(SEL, { timeout: 15000 }); }
        catch (e) { S.why = 'スロット1 の「つづきから」が出ない'; }
        S.atTitle = await page.evaluate(() => ({ path: location.pathname,
          cards: Array.prototype.slice.call(document.querySelectorAll('#slotList .slotCard')).length }));
        if (!S.why) {
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
              page.click(SEL),
            ]);
          } catch (e) { S.why = '「つづきから」で遷移しなかった: ' + e.message; }
        }
      }
      if (!S.why) {
        await page.waitForFunction('!!window.__world', { timeout: 20000 }).catch(() => {});
        await sleep(220);
        S.back = await page.evaluate(() => ({
          path: location.pathname,
          xp: localStorage.getItem('dragonfighters.xp'),
          gold: localStorage.getItem('dragonfighters.gold'),
          pc: localStorage.getItem('dragonfighters.partyComposition'),
          slot: localStorage.getItem('df.activeSlot'),
          heroClass: (window.__world && typeof window.__world.heroClass === 'function')
            ? window.__world.heroClass() : null,
        }));
      }
      await page.close();
    }
    check('(4c) ⭐ 戻った先でスロットを選ぶと xp / gold / 主人公が戻る'
      + ' (verify_title_screen 受入条件 3 と同じ手順を借りる。⛔ あちらのファイルは読むだけ)'
      + ' — ⚠ 直前のライブは **別スロットの別主人公**にしてあるので、自明に緑にはならない',
      !S.why && !!S.setup && S.setup.threw === ''
        && S.setup.slotBefore === '1' && S.setup.slotAfter === '2'
        && !!S.setup.liveB && S.setup.liveB.xp === '100'
        && !!S.back && S.back.xp === XP_A && S.back.gold === GOLD_A
        && S.back.pc === JSON.stringify([HERO_A]) && S.back.slot === '1'
        && S.back.heroClass === HERO_A,
      (S.why ? '⛔ ' + S.why + '  ' : '')
        + '切替 ' + J(S.setup && S.setup.slotBefore) + '→' + J(S.setup && S.setup.slotAfter)
        + '  戻る直前のライブ=' + J(S.setup && S.setup.liveB)
        + '  title で見えたカード=' + J(S.atTitle)
        + '  つづきから の後=' + J(S.back));

    check('(4d) ⭐ document.getElementById("worldHud") が **null のまま** = __world.insets().bottom === 0'
      + ' (罠 C の検査) — 素と封蝋ありの両方で',
      B0.worldHudNull === true && !!B0.insets && B0.insets.bottom === 0
        && B2.worldHudNull === true && !!B2.insets && B2.insets.bottom === 0,
      '素: #worldHud が null=' + B0.worldHudNull + ' insets=' + J(B0.insets)
        + '  封蝋あり: #worldHud が null=' + B2.worldHudNull + ' insets=' + J(B2.insets));

    // ══════════════════════════════════════════════════════════════════
    // §5 恒等 (非退行)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §5 恒等 (非退行) ---');
    /* ⭐⭐ ドライバへ期待値を写してよいのは **ここだけ**。「1 つも足していない」は
       写しと突き合わせる以外に測りようが無い。値は #64 着手前の HEAD の
       world.html の window.__world から機械生成した 26 個。 */
    const SEAM26 = ['arrivalCount', 'askOpen', 'clientFromNode', 'clientFromPoint', 'clientFromWorld',
      'compact', 'goToNode', 'heroClass', 'heroGeom', 'heroMarkGeom', 'heroMarkOn', 'heroNode',
      'heroPx', 'insets', 'isMoving', 'lastArrival', 'nodeIds', 'questDest', 'revealed', 'roadEvent',
      'spawnVia', 'stepIds', 'stepMaxPx', 'walkStepOff', 'worldOff', 'zoom'].sort();
    const added   = (B0.seamKeys || []).filter(k => SEAM26.indexOf(k) < 0);
    const dropped = SEAM26.filter(k => (B0.seamKeys || []).indexOf(k) < 0);
    const notFn   = (B0.seamKeys || []).filter(k => B0.seamTypes[k] !== 'function');
    check('(5a) __world の窓が **26 個のまま** (⛔ 1 つも足していない) / 全部 function',
      (B0.seamKeys || []).length === 26 && added.length === 0 && dropped.length === 0 && notFn.length === 0,
      '窓 ' + (B0.seamKeys || []).length + ' 個'
        + (added.length ? '  ⛔ 足された: ' + J(added) : '')
        + (dropped.length ? '  ⛔ 消えた: ' + J(dropped) : '')
        + (notFn.length ? '  ⛔ function でない: ' + J(notFn) : ''));

    const served = await httpGet(base + '/world.html');
    const nOf = (needle) => served.split(needle).length - 1;
    const lset = nOf('localStorage.setItem'), lrm = nOf('localStorage.removeItem');
    const srm  = nOf('sessionStorage.removeItem'), sset = nOf('sessionStorage.setItem');
    check('(5b) world.html の配信バイトに localStorage.setItem / localStorage.removeItem が **0 件**、'
      + 'sessionStorage.removeItem が **1 件** (⚠ コメントに語を書いただけでも数えられる)',
      lset === 0 && lrm === 0 && srm === 1,
      '配信 ' + served.length + 'B  localStorage.setItem=' + lset + ' 件 / localStorage.removeItem=' + lrm
        + ' 件 / sessionStorage.removeItem=' + srm + ' 件 (期待 1) / sessionStorage.setItem=' + sset
        + ' 件 (撤退フラグ・縛られていない)');

    check('(5c) WORLD_MAP の NODES / EDGES / STEPS / SITES が無傷 (14 / 14 / 10 / 6)',
      eq(B0.wm, { nodes: 14, edges: 14, steps: 10, sites: 6 }),
      J(B0.wm));

    const C2 = await openTown(browser, base, '[C2 街 compact390]',
      { vessel: VESSEL, w: 390, h: 844, mobile: true });
    check('(5d) ⭐ compact 390 の #townHud の button 数が **TOWN_MAP.FACILITIES.length のまま**'
      + ' (罠 A の検査。⛔ 件数を直書きしない)',
      C2.alive === true && C2.compact === true && C2.facCount > 0
        && C2.hudButtons === C2.facCount && C0.hudButtons === C0.facCount,
      'compact390: #townHud button=' + C2.hudButtons + ' / FACILITIES=' + C2.facCount
        + ' (body.compact=' + C2.compact + ')'
        + '  desktop: ' + C0.hudButtons + ' / ' + C0.facCount);

    // ══════════════════════════════════════════════════════════════════
    // §6 撤退
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §6 撤退 (?questmark=0 / ?titleback=0 の 2 本は独立) ---');
    const Tq = await openTavern(browser, base, '[T2 ?questmark=0]', { query: '?questmark=0' });
    const accQ = Tq.alive ? await acceptByClick(Tq.page, SC.id) : { reached: false, steps: [] };
    const vQ = Tq.alive ? await Tq.page.evaluate(() => {
      try { return localStorage.getItem('dragonfighters.activeQuest'); } catch (e) { return 'ERR'; }
    }) : 'ERR';
    if (Tq.page) await Tq.page.close();

    const B5 = await openWorld(browser, base, '[B5 ?questmark=0]',
      { cleared: CLEARED, vessel: VESSEL, questDest: SC.id, query: '?questmark=0' });
    const C4 = await openTown(browser, base, '[C4 ?questmark=0]',
      { vessel: VESSEL, query: '?questmark=0' });
    const B4 = await openWorld(browser, base, '[B4 ?titleback=0]',
      { cleared: CLEARED, vessel: VESSEL, questDest: SC.id, query: '?titleback=0' });
    const C3 = await openTown(browser, base, '[C3 ?titleback=0]',
      { vessel: VESSEL, query: '?titleback=0' });

    check('(6a) tavern.html?questmark=0 で受注 → 器が書かれず、3 面の副行が既定のまま、.worldSeal が 0 枚',
      accQ.reached === true && vQ === null
        && Tq.small === dfTavern
        && B5.small === dfWorld && B5.sealCount === 0
        && C4.small === dfTown,
      '受注できた=' + accQ.reached + ' (' + J(accQ.steps) + ')  器=' + J(vQ)
        + '  tavern 副行=' + J(Tq.small) + '  world 副行=' + J(B5.small)
        + '  .worldSeal=' + B5.sealCount + ' 枚  town 副行=' + J(C4.small));

    check('(6b) world.html?titleback=0 / town.html?titleback=0 → #worldBack / #townBack が **DOM ごと無い**',
      B4.alive === true && B4.backExists === false && B4.backHit === null
        && C3.alive === true && C3.backExists === false && C3.backHit === null,
      'world: search=' + J(B4.search) + ' #worldBack=' + (B4.backExists ? '有' : '無')
        + '  town: search=' + J(C3.search) + ' #townBack=' + (C3.backExists ? '有' : '無'));

    check('(6c) ⭐ **2 本が独立** — ?questmark=0 だけで戻るボタンは生き、'
      + '?titleback=0 だけで副行と封蝋は生きる',
      B5.backExists === true && !!B5.backHit && B5.backHit.self === true
        && C4.backExists === true && !!C4.backHit && C4.backHit.self === true
        && B4.small === EXPECT && B4.sealCount === 1
        && C3.small === EXPECT,
      '?questmark=0 の戻るボタン world=' + (B5.backExists ? '生きている' : '⛔消えた')
        + '(押せる=' + (B5.backHit ? B5.backHit.self : 'n/a') + ')'
        + ' town=' + (C4.backExists ? '生きている' : '⛔消えた')
        + '(押せる=' + (C4.backHit ? C4.backHit.self : 'n/a') + ')'
        + '  ?titleback=0 の副行 world=' + J(B4.small) + ' 封蝋=' + B4.sealCount + ' 枚'
        + ' town=' + J(C3.small));

    /* ── 装置: 例外 ───────────────────────────────────────────────── */
    check('(0z-err) [装置] 全ページを通して pageerror が 0 件',
      PAGE_ERRS.length === 0, PAGE_ERRS.slice(0, 8).join(' | ') || 'なし');

  } catch (e) {
    console.error('\n[drv] 例外: ' + e.message + '\n' + (e.stack || ''));
    results.push({ name: '例外なく完走', st: 'FAILED' });
  }

  await browser.close();
  srv.close();

  const pass = results.filter(r => r.st === 'PASSED');
  const fail = results.filter(r => r.st === 'FAILED');
  const pend = results.filter(r => r.st === 'PENDING');
  console.log('\n════════════════════════════════════════════');
  console.log('  素 ' + pass.length + '/' + (pass.length + fail.length) + ' PASSED'
    + '  (PENDING ' + pend.length + ')' + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  if (fail.length) { console.log('  FAILED:'); fail.forEach(r => console.log('    - ' + r.name)); }
  if (pend.length) { console.log('  PENDING:'); pend.forEach(r => console.log('    - ' + r.name + '  [' + r.owner + ']')); }
  console.log('════════════════════════════════════════════');
  process.exit(fail.length ? 1 : 0);
})();
