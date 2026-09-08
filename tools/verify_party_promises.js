#!/usr/bin/env node
/*
 * verify_party_promises.js — 実装依頼書 #60 STEP1 + STEP2
 *   STEP1「マッチング画面から酒場へ戻る」(演出 promise の記名化 + 🍺 酒場へ戻る)
 *   STEP2「📣 募集をかけ直す」→「🤝 約束を解散する」(DFRecruits.clear() + 確認シート)
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_party_promises.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_party_promises.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_party_promises.js --negative --only m1
 *
 * ── 測っているもの (依頼書 §9-0 / §9-1 のうち STEP1 の分) ────────────────────
 *   §0 装置 (⭐⭐⭐ これが無いと全 assert が空振りで永久緑)
 *   §1 「🍺 酒場へ戻る」— 出る条件 / 押した先 / 撤退 / 非退行
 *   §2 「🤝 約束を解散する」— 押した先 (DFRecruits.count()=0) / 撤退 (?recruittalk=0)
 *
 * ── ⛔ 測らないこと (依頼書 §9-4) ─────────────────────────────────────────
 *   ・戻るボタンの座標・余白・文字サイズ。⚠ ただし #56 の前科があるので
 *     「**出発の口が画面内に残る**」だけは (1a2) で必ず測る。
 *   ・確認シートの文面・寸法。⛔ 語を写経しない (ラベルを動かすたび嘘になる)。
 *     測るのは「1 枚挟まる」「マッチング画面の **上** に出て指が当たる」の 2 つだけ。
 *   ・STEP3 (常設パネル) / STEP4 (札の色分け) は別項目。
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────────
 *  - ⭐⭐⭐ **門番の下流で測らない** (#58 の教訓)。本件の門番は PREP_SKIP_ON と
 *    isRecruitTalkOn()。(1b)(1c) は「画面がどう閉じたか」ではなく
 *    **departToScenario() が呼ばれたか否か** で測る = 門番の外側。
 *    ⇒ ページ側で window.departToScenario をスパイへ差し替える。
 *    ⭐ スパイが効いているかの実証は (1c) が兼ねる (0 回なら (1c) が赤くなる)。
 *  - ⭐⭐⭐ M1 (早期 return の 2 本を "back" にする) は **通常の導線では発火しない**。
 *    ⇒ (1c2) = #partyMatchOverlay が無い / (1c3) = 応募者ゼロ の 2 つの早期 return を
 *      実際に通す腕を用意しないと、いちばん危険な変異が空振りする。
 *  - ⚠ 受注ナレ (#prologueOverlay) は音声ペースで 20 秒近い。固定 sleep では届かない
 *    ⇒ advance() が #prologueOverlay を 400ms 間隔で送りながら到達を待つ
 *    (手本 = verify_party_match_setup.js の advanceToCinema)。
 *  - ⚠ openPrep は **await しない** (演出がタップ待ちで止まるため)。
 *  - ⚠ classic script 直下の const/let は window に載らない → **裸の識別子**で読む
 *    (selection / prepScenario / scenarios / pickCompanion)。function 宣言は
 *    window に載るので departToScenario は差し替えられる。
 *  - ⚠ ポートは **10161** (変異の子プロセスは 10162〜10169)。
 *    ⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56 の実測)。
 *  - ⚠ ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になる)。
 *  - ⚠ フェードで閉じる UI は 520ms のあいだ「閉じた」と見分けられない (#35 の教訓)
 *    ⇒ 閉じ判定は fading が取れて display:none になるまで待ってから採る。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §10 のうち STEP1 が守る 3 本。⚠⚠⚠ **1 本ずつ** --only で確定させる
 *   (同時に入れると互いを覆い隠す)。NEG_EXPECT は机上で書かず、1 本ずつ実走して
 *   **実際に赤くなったラベル**を書いてある。
 *     m1 … 早期 return の 2 本を "back" にする  → 出発が黙って死ぬ
 *     m3 … resolve() を無記名に戻す            → 戻るを押してもその場で潜る
 *     m5 … 解散で DFRecruits.clear() を呼ばない → 押しても約束が消えない
 *     m6 … 戻るボタンを確定前から出す          → 確定を見ずに帰れる
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10161'), 10);
const SCENARIO = arg('scenario', 'goblin-mine');

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {
  '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')),
};
const PRISTINE = { '/tavern.html': FROZEN['/tavern.html'].toString('utf8') };

/* ⭐⭐⭐ アンカー健在チェックは **手つかずの原本** に対して行う (#56 の教訓)。
   変異後のバッファで数えると、同じ tag の 2 本目が「注入点 0 箇所」= 偽のアンカー腐敗になる。 */
function mutate(file, label, anchor, patch) {
  const tag  = label.split(' ')[0];
  const hits = PRISTINE[file].split(anchor).length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + file + '  ' + anchor.slice(0, 200));
    process.exit(3);
  }
  if (anchor === patch || anchor.length === patch.length) {
    console.error('[driver] ' + label + ' は置換前後が同一 / 同じバイト長です (起動時検算に落ちる形)');
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  const parts = FROZEN[file].toString('utf8').split(anchor);
  if (parts.length - 1 !== 1) {
    console.error('[driver] ' + label + ' は同 tag の先行変異にアンカーを食われました (' + (parts.length - 1) + ' 箇所)。');
    process.exit(3);
  }
  FROZEN[file] = Buffer.from(parts.join(patch), 'utf8');
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました (' + file + ')');
}

/* 変異 → 赤くなるべきラベルの担当表。
   ⚠⚠⚠ 机上で書いてはいけない。`--only <tag>` で 1 本ずつ走らせ、実際に赤くなった
     ラベルを見てから書き換える (下の値は 2026-09-08 の実走で採ったもの)。 */
const NEG_EXPECT = {
  m1: ['(1c2)', '(1c3)'],
  m3: ['(1b)'],
  /* ⭐ m5 は担当の (2a) だけ。確認シートは開くし押せるので (2z)(2c) は緑のまま
     —— 「押せた」と「約束が消えた」を分けて測っているのでここが分離できる。 */
  m5: ['(2a)'],
  /* ⭐⭐ m5w は §10 の表に無い新設。#60 で「ボタン名を名指しするナレ」を 1 つの源から
     引く形へ直したので、**写経へ戻す**変異で (2d) が本当に効くことを押さえる
     (#57 の M8 新設と同じ趣旨 = 言い直した assert を裸のまま残さない)。 */
  m5w: ['(2d)'],
  /* ⭐ m6 は (1d) も赤くする —— 「確定前から出す」置換が撤退スイッチ (?pmback=0) の
     判定より下流で hidden を外すので、撤退の腕でも戻るの口が出てしまう。机上では書けない。 */
  m6: ['(1e)', '(1e2)', '(1d)'],
};

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad  = [];
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます'
    + '  ⚠ 同時注入は互いを覆い隠すので必ず 1 本ずつ');
  tags.forEach((tag, i) => {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT + 1 + i)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  });
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}

if (NEGATIVE) {
  /* ── m1: 早期 return の 2 本を "back" にする。
        ⭐⭐⭐ 依頼書 §2-1 が名指しした最大の罠。「overlay が無い / 応募者ゼロ」で
          出発が **黙って死ぬ**。通常の導線では 1 度も発火しないので、
          (1c2)(1c3) の腕を持たない装置では永久に空振りする。 */
  mutate('/tavern.html', 'm1 (早期 return a: overlay/列が無いときを "back" にする)',
    'if (!overlay || !colsEl) return Promise.resolve("depart");',
    'if (!overlay || !colsEl) return Promise.resolve("back");   /* m1 */');
  mutate('/tavern.html', 'm1 (早期 return b: 応募者ゼロを "back" にする)',
    'if (!raw.length) return Promise.resolve("depart");',
    'if (!raw.length) return Promise.resolve("back");   /* m1 */');
  /* ── m5: 解散の実体から DFRecruits.clear() を落とす。
        ⭐ 押す口も確認シートも生きたまま「約束だけ消えない」= いちばん気づきにくい壊れ方。
        ⚠ その後の regeneratePartyMembers() が DFRecruits.all() を組み直すので、
          カード列も元のままになる ⇒ (2a) の 2 経路 (名簿の実数 / 画面のカード枚数) 両方が赤くなる。 */
  mutate('/tavern.html', 'm5 (解散で DFRecruits.clear() を呼ばない)',
    '    try { if (window.DFRecruits) DFRecruits.clear(); } catch (e) {}   /* ★ 約束を解く実体 */',
    '    /* m5: clear() を呼ばない */');
  /* ── m5w: 受注ナレのボタン名を **写経へ戻す** = 語りかけの先に無い口ができる。 */
  mutate('/tavern.html', 'm5w (受注ナレのボタン名を固定文字列で写経する)',
    '顔ぶれが気に入らねば「" + pmRerollWord() + "」がよい。',
    '顔ぶれが気に入らねば「募集をかけ直す」がよい。');
  /* ── m3: close() の resolve を無記名へ戻す = 呼び出し側が押された口を区別できない。 */
  mutate('/tavern.html', 'm3 (resolve を無記名へ戻す)',
    'resolve(how === "back" ? "back" : "depart");',
    'resolve();   /* m3 */');
  /* ── m6: 戻るの口を演出の開始時点から出す = 確定を見ずに帰れる。 */
  mutate('/tavern.html', 'm6 (戻るの口を確定前から出す)',
    'if (backEl) backEl.hidden = true;   /* #60: 出すのは猶予明けの 1 点だけ */',
    'if (backEl) { backEl.hidden = false; if (rerollEl) rerollEl.hidden = false; }   /* m6 */');
}

/* ══════════════════════════════════════════════════════════════════════════
 * ブラウザ / サーバ
 * ══════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません');
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)');
  process.exit(2);
}
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) { rs.setHeader('Content-Type', MIME['.html']); rs.end(FROZEN[u]); return; }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 集計
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, ok: false, pending: true, detail: String(why) });
  console.log('  --  ' + name + '  -- PENDING: ' + why);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* 観測プローブ (1 回の evaluate で必要な値を全部採る) */
const PROBE = (visSrc) => {
  const vis = eval(visSrc);
  const q = (id) => document.getElementById(id);
  const rect = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const hitOf = (e) => {
    if (!e) return '(なし)';
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return '(寸法0)';
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return h ? String(h.id || h.className || h.tagName) : '(なし)';
  };
  const ov   = q('partyMatchOverlay');
  const dep  = q('pmDepart');
  const back = q('pmBtnBackTavern');
  const hint = q('pmHint');
  const roll = q('pmBtnReroll');
  const conf = q('soloConfirm');
  const cOk  = q('btnSoloGo');
  const cNo  = q('btnSoloBack');
  const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
  return {
    display:    ov ? (ov.style.display || '') : '(なし)',
    fading:     !!(ov && ov.classList.contains('fading')),
    overlayVis: vis(ov),
    nCols:      cols.length,
    nFilled:    cols.filter((c) => c.getAttribute('data-state') === 'filled').length,
    depExists:  !!dep,
    depVis:     vis(dep),
    depText:    dep ? (dep.textContent || '').trim() : '(なし)',
    depRect:    rect(dep),
    depHit:     hitOf(dep),
    backExists: !!back,
    backVis:    vis(back),
    backText:   back ? (back.textContent || '').trim() : '(なし)',
    backRect:   rect(back),
    backHit:    hitOf(back),
    rerollVis:  vis(roll),
    rerollText: roll ? (roll.textContent || '').trim() : '(なし)',
    /* ⭐⭐⭐ 約束の実数は **門番 (isRecruitTalkOn / PREP_SKIP_ON) の外側** = 名簿そのものから採る。
       ⛔ 画面のカード枚数だけで測ると、門番が例外扱いする経路で永久緑になる (#58 の教訓)。 */
    recruitN:   (function () { try { return (window.DFRecruits && DFRecruits.count()) || 0; } catch (e) { return -1; } })(),
    confVis:    vis(conf),
    confHit:    hitOf(cOk),
    confOk:     cOk ? (cOk.textContent || '').trim() : '(なし)',
    confNo:     cNo ? (cNo.textContent || '').trim() : '(なし)',
    hint:       hint ? (hint.textContent || '') : '',
    hintWait:   !!(hint && hint.classList.contains('pmWait')),
    prepVis:    vis(q('prep')),
    tavernVis:  vis(q('tavern')),
    departs:    (window.__departSpy && window.__departSpy.calls) || 0,
    innerH:     window.innerHeight,
    innerW:     window.innerWidth,
    path:       location.pathname,
  };
};

/* localStorage / sessionStorage を purge してから最低限だけ焼く。
   ⚠ prologueSeen / prepOnboardingSeen を立てておかないと語りが挟まって測るものが分からなくなる。 */
function seed() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '10000');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
    localStorage.setItem('dragonfighters.soloWarnSeen', '1');
  } catch (e) {}
}

async function openTavern(browser, viewport, qs) {
  const page = await browser.newPage();
  const tag = viewport.name + (qs || '');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  const url = 'http://localhost:' + PORT + '/tavern.html' + (qs || '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(seed);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
  /* ⭐ 門番の外側で測るためのスパイ。departToScenario は script 直下の function 宣言なので
       グローバルの束縛そのもの = 裸の呼び出し側もこの差し替えを見る。
     ⛔ 中身は 1 行も呼ばない (呼ぶと index.html へ遷移して以降の観測が全部死ぬ)。 */
  await page.evaluate(() => {
    window.__departSpy = { calls: 0, hadOriginal: typeof departToScenario === 'function' };
    window.departToScenario = function () { window.__departSpy.calls++; };
  });
  return page;
}

/* 「酒場で声を掛けた仲間」を 2 人ぶん焼く。⛔ 名簿の形を写経しない —— 本番の
   pickCompanion() が作ったものをそのまま DFRecruits へ入れる。 */
async function seedRecruits(page, n) {
  return page.evaluate((want) => {
    const out = { ok: false, added: 0, count: 0, why: '' };
    try {
      if (!window.DFRecruits) { out.why = 'DFRecruits なし'; return out; }
      DFRecruits.clear();
      const used = new Set();
      const keys = ['mage', 'cleric', 'rogue'].slice(0, want);
      keys.forEach((k) => {
        const m = pickCompanion(k, used);
        if (m && DFRecruits.add(m, 3).ok) out.added++;
      });
      out.count = DFRecruits.count();
      out.ok = out.count > 0;
    } catch (e) { out.why = String((e && e.message) || e); }
    return out;
  }, n);
}

/* 受注 → 目的の状態まで進める。
 * ⚠ openPrep は await しない (演出がタップ待ちで止まるため)。
 * ⚠ 受注ナレ (#prologueOverlay) は音声ペースで 20 秒近い。400ms 間隔で送りながら待つ。
 * ⛔ #partyMatchOverlay も #pmColumns も叩かない (それが測定対象そのもの)。 */
async function startPrep(page, scId) {
  await page.evaluate((id) => {
    const sc = scenarios.find((s) => s.id === id);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch((e) => { window.__prepThrew = String((e && e.message) || e); });
  }, scId);
}
async function advance(page, budgetMs, onProlog) {
  const t0 = Date.now();
  let lastClick = 0;
  const seen = [];
  while (Date.now() - t0 < (budgetMs || 90000)) {
    const st = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      const ov = q('partyMatchOverlay');
      return {
        cinema:  !!(ov && ov.style.display === 'flex' && !ov.classList.contains('fading')),
        prep:    vis(q('prep')),
        prol:    vis(q('prologueOverlay')),
        departs: (window.__departSpy && window.__departSpy.calls) || 0,
      };
    }, VIS_FN);
    if (st.departs > 0) { seen.push('depart'); return { reached: 'depart', steps: seen, ms: Date.now() - t0 }; }
    if (st.cinema)      { seen.push('cinema'); return { reached: 'cinema', steps: seen, ms: Date.now() - t0 }; }
    if (st.prep)        { seen.push('prep');   return { reached: 'prep',   steps: seen, ms: Date.now() - t0 }; }
    if (st.prol && Date.now() - lastClick > 400) {
      if (seen[seen.length - 1] !== 'prologue') { seen.push('prologue'); if (onProlog) await onProlog(); }
      await page.evaluate(() => { const o = document.getElementById('prologueOverlay'); if (o) o.click(); });
      lastClick = Date.now();
    }
    await sleep(60);
  }
  return { reached: '', steps: seen, ms: Date.now() - t0 };
}
/* 猶予明け (#pmDepart が見えた) まで待つ。⭐ 「見た目が出そろった」ではなく
   **状態機械の終端が付けるマーカー**を待つ (#35 の教訓)。 */
async function waitGate(page, budgetMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (budgetMs || 12000)) {
    const s = await page.evaluate(PROBE, VIS_FN);
    if (s.depVis) return s;
    await sleep(50);
  }
  return await page.evaluate(PROBE, VIS_FN);
}
/* 閉じ切る (fading が取れて display:none) まで待つ。#35 の「520ms は見分けられない」対策。 */
async function waitClosed(page, budgetMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (budgetMs || 4000)) {
    const s = await page.evaluate(PROBE, VIS_FN);
    if (s.display === 'none' && !s.fading) return s;
    await sleep(60);
  }
  return await page.evaluate(PROBE, VIS_FN);
}
/* 要素の中心を実マウスで叩く (指の当たり方に一番近い経路)。命中先も返す。 */
async function clickCenterOf(page, id) {
  const rc = await page.evaluate((elId) => {
    const e = document.getElementById(elId);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: hit ? String(hit.id || hit.className || hit.tagName) : '(なし)' };
  }, id);
  if (!rc) return null;
  await page.mouse.click(rc.x, rc.y);
  return rc;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_pmPromises_');
  const server = await startServer();
  console.log('[driver] http://localhost:' + PORT + '/  (ROOT=' + ROOT + ')');
  const browser = await puppeteer.launch({
    headless: !HEADFUL,
    executablePath: findBrowser(),
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile,
           '--autoplay-policy=no-user-gesture-required'],
    protocolTimeout: 240000,
  });
  const DESK = { name: 'desktop', width: 1280, height: 900 };
  const PHONE = { name: 'iphone', width: 390, height: 844 };

  try {
    /* ══════════════════════════════════════════════════════════════════
     * 腕 A — 既定の導線 (?prepskip 既定 ON)。装置 / 出る条件 / 戻る
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕A: 既定の導線 (装置 / (1e) / (1a) / (1b) / (1f)) ======');
    const pageA = await openTavern(browser, DESK, '');
    const seam = await pageA.evaluate(() => {
      const out = { threw: '' };
      try {
        out.play    = typeof playPartyMatchCinematic;   // ⚠ 裸の識別子で読む
        out.review  = typeof openPartyMatchReview;
        out.prep    = typeof openPrep;
        out.depart  = typeof departToScenario;
        out.recruit = (window.DFRecruits && typeof DFRecruits.count === 'function') ? 'object' : 'なし';
        out.spy     = !!(window.__departSpy && window.__departSpy.hadOriginal);
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    console.log('       seam: ' + JSON.stringify(seam));
    check('(0a) [装置] 演出 / 再入場 / 同行候補が裸の識別子で読める',
      seam.play === 'function' && seam.review === 'function' && seam.prep === 'function'
      && seam.depart === 'function' && seam.recruit === 'object' && seam.spy === true && seam.threw === '',
      JSON.stringify(seam));

    const rc = await seedRecruits(pageA, 2);
    console.log('       同行候補の焼き込み: ' + JSON.stringify(rc));
    await startPrep(pageA, SCENARIO);
    const advA = await advance(pageA, 90000);
    console.log('       到達: ' + advA.reached + ' (' + advA.steps.join('>') + ' / ' + advA.ms + 'ms)');

    if (advA.reached !== 'cinema') {
      ['(0b)', '(1e)', '(1e2)', '(1a)', '(1b)', '(1f)'].forEach((l) =>
        pending(l + ' 腕A の測定', '演出まで到達しなかった (reached=' + advA.reached + ' steps=' + advA.steps.join('>') + ')'));
    } else {
      /* ── (0b) 母集団ガード: カードが 1 枚以上 ── */
      const a0 = await pageA.evaluate(PROBE, VIS_FN);
      console.log('       開いた直後: cols=' + a0.nFilled + '/' + a0.nCols + ' hint="' + a0.hint + '"');
      check('(0b) [装置] マッチング画面のカードが 1 枚以上ある (0 枚なら以降は全部空振り)',
        a0.nCols >= 1, a0.nFilled + '/' + a0.nCols + ' 枚');

      /* ── (1e) 確定前 (開示中) は戻るの口が出ておらず、押しても閉じない ── */
      const eClick = await pageA.evaluate(() => {
        const b = document.getElementById('pmBtnBackTavern');
        if (!b) return 'なし';
        b.click();
        return 'click 済';
      });
      await sleep(200);
      const a1 = await pageA.evaluate(PROBE, VIS_FN);
      check('(1e) 確定前 (開示中) は「酒場へ戻る」が出ておらず、押しても画面が閉じない',
        a0.nFilled < a0.nCols && a0.backExists === true && a0.backVis === false
        && a1.display === 'flex' && a1.fading === false && a1.departs === 0,
        '開示中 ' + a0.nFilled + '/' + a0.nCols + ' backVis=' + a0.backVis
        + ' / ' + eClick + ' 後 display=' + a1.display + ' fading=' + a1.fading + ' departs=' + a1.departs);

      /* ── (1e2) 猶予中 (pmWait だが出発の口はまだ hidden) も戻るの口が出ていない ── */
      await pageA.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
      let gateSample = null;
      for (let i = 0; i < 40; i++) {
        const s = await pageA.evaluate(PROBE, VIS_FN);
        if (s.hintWait && !s.depVis) { gateSample = s; break; }
        if (s.depVis) break;
        await sleep(25);
      }
      if (!gateSample) {
        pending('(1e2) 猶予中 (全確定・出発の口はまだ出ていない) も「酒場へ戻る」が出ていない',
          '猶予の窓を捕まえられなかった (PM_TAP_GATE が短すぎる / 既に猶予明け)');
      } else {
        check('(1e2) 猶予中 (全確定・出発の口はまだ出ていない) も「酒場へ戻る」が出ていない',
          gateSample.nFilled === gateSample.nCols && gateSample.depVis === false
          && gateSample.backVis === false,
          '確定 ' + gateSample.nFilled + '/' + gateSample.nCols + ' depVis=' + gateSample.depVis
          + ' backVis=' + gateSample.backVis);
      }

      /* ── (1a) 全員確定 + 猶予明けで「🍺 酒場へ戻る」が見える ── */
      const a2 = await waitGate(pageA, 12000);
      console.log('       猶予明け: depVis=' + a2.depVis + ' backVis=' + a2.backVis
        + ' backText="' + a2.backText + '" backHit=' + a2.backHit + ' depRect=' + JSON.stringify(a2.depRect));
      check('(1a) ★受入条件: 確定後・猶予明けに「酒場へ戻る」が見え、実際に指が当たる',
        a2.depVis === true && a2.backExists === true && a2.backVis === true
        && a2.backRect && a2.backRect.w > 0 && a2.backRect.h > 0
        && a2.backHit === 'pmBtnBackTavern',
        'depVis=' + a2.depVis + ' backVis=' + a2.backVis + ' 命中先=' + a2.backHit
        + ' 箱=' + JSON.stringify(a2.backRect));

      /* ── (1b) ★中核: 戻るを押しても departToScenario が呼ばれない ── */
      const hit = await clickCenterOf(pageA, 'pmBtnBackTavern');
      console.log('       戻るをクリック: ' + JSON.stringify(hit));
      const a3 = await waitClosed(pageA, 4000);
      await sleep(200);
      const a4 = await pageA.evaluate(PROBE, VIS_FN);
      check('(1b) ★★★受入条件: 「酒場へ戻る」を押しても departToScenario() が呼ばれない (潜らない)',
        !!hit && hit.hit === 'pmBtnBackTavern' && a4.departs === 0
        && a3.display === 'none' && a4.prepVis === false && a4.tavernVis === true
        && a4.path.indexOf('tavern.html') >= 0,
        '命中先=' + (hit ? hit.hit : 'なし') + ' departToScenario 呼び出し=' + a4.departs + ' 回'
        + ' / 閉じた後 display=' + a3.display + ' prep=' + a4.prepVis + ' 酒場=' + a4.tavernVis
        + ' path=' + a4.path);

      /* ── (1f) review モードの「嘘の導線」が消えた ──
         ⭐ 行き先の名前は縛らない。守る不変条件は
           ① 通常と review でラベルが違う ② review では「出発」と言わない の 2 つ。 */
      const normalLabel = a2.depText;
      await pageA.evaluate(() => { openPartyMatchReview(); });
      const a5 = await waitGate(pageA, 12000);
      console.log('       review: depText="' + a5.depText + '" hint="' + a5.hint + '"');
      check('(1f) review モードは通常と違うラベルで、「出発」とは言わない (閉じた先は出発ではない)',
        normalLabel.length > 0 && a5.depText.length > 0 && a5.depText !== normalLabel
        && a5.depText.indexOf('出発') < 0 && a5.hint.indexOf('出発') < 0 && a5.hintWait === true,
        '通常="' + normalLabel + '" / review="' + a5.depText + '" / hint="' + a5.hint + '"');
    }
    await pageA.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 B — 出発するを押すと従来どおり潜る (非退行)
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕B: 出発の非退行 (1c) ======');
    const pageB = await openTavern(browser, DESK, '');
    await seedRecruits(pageB, 2);
    await startPrep(pageB, SCENARIO);
    const advB = await advance(pageB, 90000);
    if (advB.reached !== 'cinema') {
      pending('(1c) 「出発する」を押すと従来どおり departToScenario() が呼ばれる',
        '演出まで到達しなかった (reached=' + advB.reached + ')');
    } else {
      await pageB.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
      const b1 = await waitGate(pageB, 12000);
      const bHit = await clickCenterOf(pageB, 'pmDepart');
      await waitClosed(pageB, 4000);
      await sleep(300);
      const b2 = await pageB.evaluate(PROBE, VIS_FN);
      check('(1c) ★受入条件: 「出発する」を押すと従来どおり departToScenario() が呼ばれる (非退行)',
        b1.depVis === true && !!bHit && b2.departs === 1,
        '猶予明け=' + b1.depVis + ' 命中先=' + (bHit ? bHit.hit : 'なし')
        + ' departToScenario 呼び出し=' + b2.departs + ' 回');
    }
    await pageB.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 C — ⭐⭐⭐ 早期 return a (overlay が無い) でも出発が生きている
     *   ⚠ ここが M1 の唯一の検出器。通常の導線では 1 度も通らない枝。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕C: 早期 return a (overlay が無い) の非退行 (1c2) ======');
    const pageC = await openTavern(browser, DESK, '');
    await seedRecruits(pageC, 2);
    const cRemoved = await pageC.evaluate(() => {
      const ov = document.getElementById('partyMatchOverlay');
      if (!ov) return false;
      ov.parentNode.removeChild(ov);
      return !document.getElementById('partyMatchOverlay');
    });
    await startPrep(pageC, SCENARIO);
    const advC = await advance(pageC, 90000);
    const c1 = await pageC.evaluate(PROBE, VIS_FN);
    console.log('       到達: ' + advC.reached + ' (' + advC.steps.join('>') + ') departs=' + c1.departs);
    check('(1c2) ★★★ overlay が無い早期 return でも出発が生きている (⛔ ここを "back" にすると出発が黙って死ぬ)',
      cRemoved === true && c1.departs === 1,
      'overlay を外せた=' + cRemoved + ' / departToScenario 呼び出し=' + c1.departs + ' 回'
      + ' / 到達=' + advC.reached);
    await pageC.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 D — ⭐⭐⭐ 早期 return b (応募者ゼロ) でも出発が生きている
     *   ⚠ 描画は済ませてから空にする (受注ナレの最中に空にする) ので、
     *      render 系が空配列で落ちる副作用を持ち込まない。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕D: 早期 return b (応募者ゼロ) の非退行 (1c3) ======');
    const pageD = await openTavern(browser, DESK, '');
    await seedRecruits(pageD, 2);
    await startPrep(pageD, SCENARIO);
    let emptied = false;
    const advD = await advance(pageD, 90000, async () => {
      if (emptied) return;
      emptied = await pageD.evaluate(() => { selection.partyMembers = []; return true; });
    });
    const d1 = await pageD.evaluate(PROBE, VIS_FN);
    console.log('       到達: ' + advD.reached + ' (' + advD.steps.join('>') + ') departs=' + d1.departs);
    check('(1c3) ★★★ 応募者ゼロの早期 return でも出発が生きている (⛔ ここを "back" にすると出発が黙って死ぬ)',
      emptied === true && d1.departs === 1 && d1.nCols === 0,
      '空にできた=' + emptied + ' / departToScenario 呼び出し=' + d1.departs + ' 回'
      + ' / カード=' + d1.nCols + ' 枚 / 到達=' + advD.reached);
    await pageD.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 E — 撤退 ?pmback=0
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕E: 撤退 ?pmback=0 (1d) ======');
    const pageE = await openTavern(browser, DESK, '?pmback=0');
    await seedRecruits(pageE, 2);
    await startPrep(pageE, SCENARIO);
    const advE = await advance(pageE, 90000);
    if (advE.reached !== 'cinema') {
      pending('(1d) ?pmback=0 では「酒場へ戻る」が出ず、出発は従来どおり',
        '演出まで到達しなかった (reached=' + advE.reached + ')');
    } else {
      await pageE.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
      const e1 = await waitGate(pageE, 12000);
      const eHit = await clickCenterOf(pageE, 'pmDepart');
      await waitClosed(pageE, 4000);
      await sleep(300);
      const e2 = await pageE.evaluate(PROBE, VIS_FN);
      check('(1d) ★受入条件: ?pmback=0 では「酒場へ戻る」が出ず、出発は従来どおり潜る',
        e1.depVis === true && e1.backVis === false && e1.rerollVis === true
        && !!eHit && e2.departs === 1,
        '猶予明け=' + e1.depVis + ' backVis=' + e1.backVis + ' (要素自体=' + e1.backExists + ')'
        + ' 募集の口=' + e1.rerollVis + ' / departToScenario 呼び出し=' + e2.departs + ' 回');
    }
    await pageE.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 F — iPhone 幅。⭐ 座標も余白も測らないが「出発の口が画面内に残る」だけは測る
     *        (#56 の前科 = 器をスクロールさせた日に出発の口が画面外へ出た)
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕F: iPhone 390x844 で出発の口が画面内に残る (1a2) ======');
    const pageF = await openTavern(browser, PHONE, '');
    await seedRecruits(pageF, 2);
    await startPrep(pageF, SCENARIO);
    const advF = await advance(pageF, 90000);
    if (advF.reached !== 'cinema') {
      pending('(1a2) iPhone 幅でも出発の口が画面内に残る', '演出まで到達しなかった (reached=' + advF.reached + ')');
    } else {
      await pageF.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
      const f1 = await waitGate(pageF, 12000);
      console.log('       compact: depRect=' + JSON.stringify(f1.depRect) + ' depHit=' + f1.depHit
        + ' innerH=' + f1.innerH + ' / backRect=' + JSON.stringify(f1.backRect) + ' backVis=' + f1.backVis);
      check('(1a2) ★受入条件: 戻るの口を足しても iPhone 幅で出発の口が画面内に残り、指が当たる',
        f1.depVis === true && !!f1.depRect && f1.depRect.top >= 0
        && f1.depRect.bottom <= f1.innerH + 1 && f1.depHit === 'pmDepart',
        '箱=' + JSON.stringify(f1.depRect) + ' 画面高=' + f1.innerH + ' 命中先=' + f1.depHit);
    }
    await pageF.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 G — ★STEP2 「🤝 約束を解散する」
     *   ⭐⭐⭐ 約束の実数は **DFRecruits.count()** = 門番 (isRecruitTalkOn / PREP_SKIP_ON) の
     *     外側から採る (#58 の教訓「門番が例外扱いする対象を門番の下流で測らない」)。
     *     ⛔ 画面のカード枚数だけで測ると、名簿を消さずにカードだけ描き直す実装で緑になる。
     *   ⭐ 「押せた」(2z) と「効いた」(2a) を分けて測る。分けないと m5 が両方を巻き込み、
     *     どこが壊れたのか読めなくなる (#54 の「測っている場所に現れるか」の系)。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕G: 約束の解散 (0c) / (2z) / (2c) / (2a) / (2d) ======');
    let defaultRerollLabel = '(未測定)';
    const pageG = await openTavern(browser, DESK, '');
    const rcG = await seedRecruits(pageG, 2);
    await startPrep(pageG, SCENARIO);
    const advG = await advance(pageG, 90000);
    if (advG.reached !== 'cinema') {
      ['(0c)', '(2z)', '(2c)', '(2a)', '(2d)'].forEach((l) =>
        pending(l + ' 腕G の測定', '演出まで到達しなかった (reached=' + advG.reached
          + ' steps=' + advG.steps.join('>') + ')'));
    } else {
      await pageG.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
      const g0 = await waitGate(pageG, 12000);
      defaultRerollLabel = g0.rerollText;
      console.log('       猶予明け: ラベル="' + g0.rerollText + '" 約束=' + g0.recruitN
        + ' 人 / カード ' + g0.nFilled + '/' + g0.nCols + ' 枚');

      /* ── (0c) 母集団ガード: 解散する対象が実在する ── */
      check('(0c) [装置] 解散を測る時点で約束が 1 件以上ある (0 件だと (2a) は空振りで永久緑)',
        rcG.ok === true && g0.recruitN >= 1 && g0.nCols >= 2,
        '名簿 ' + g0.recruitN + ' 人 (焼き込み ' + JSON.stringify(rcG) + ') / カード ' + g0.nCols + ' 枚');

      /* ── (2z) 押すと確認が 1 枚挟まり、マッチング画面 (z=210) の **上** で指が当たる ──
         ⛔ 文面は測らない (依頼書 §9-4)。測るのは「挟まった」「押せる」の 2 つだけ。 */
      const gHit = await clickCenterOf(pageG, 'pmBtnReroll');
      await sleep(250);
      const g1 = await pageG.evaluate(PROBE, VIS_FN);
      console.log('       1 度目の押下: ' + JSON.stringify(gHit) + ' 確認=' + g1.confVis
        + ' 命中先=' + g1.confHit + ' ("' + g1.confNo + '" / "' + g1.confOk + '")');
      check('(2z) [装置] 解散の口を押すと確認が 1 枚挟まり、演出の上で指が当たる (器を増やしていない)',
        !!gHit && gHit.hit === 'pmBtnReroll' && g1.confVis === true
        && g1.confHit === 'btnSoloGo' && g1.display === 'flex',
        '口の命中先=' + (gHit ? gHit.hit : 'なし') + ' 確認=' + g1.confVis
        + ' 確認ボタンの命中先=' + g1.confHit + ' 演出=' + g1.display);

      /* ── (2c) 「やめておく」では約束が 1 件も減らない (確認が飾りでない証明) ── */
      const gNo = await clickCenterOf(pageG, 'btnSoloBack');
      await sleep(250);
      const g2 = await pageG.evaluate(PROBE, VIS_FN);
      check('(2c) 確認で断ると約束は 1 件も減らず、演出も開いたまま',
        !!gNo && g2.confVis === false && g2.recruitN === g0.recruitN
        && g2.nCols === g0.nCols && g2.display === 'flex',
        '約束 ' + g0.recruitN + '→' + g2.recruitN + ' 人 / カード ' + g0.nCols + '→' + g2.nCols
        + ' 枚 / 演出=' + g2.display);

      /* ── (2a) ★受入条件 ── */
      await clickCenterOf(pageG, 'pmBtnReroll');
      await sleep(250);
      const gOk = await clickCenterOf(pageG, 'btnSoloGo');
      await sleep(450);
      const g3 = await pageG.evaluate(PROBE, VIS_FN);
      const gBody = await pageG.evaluate(() => {
        const ms = (selection.partyMembers || []);
        return { n: ms.length, hero: ms.filter((m) => m && m.isHero).length };
      });
      console.log('       解散後: 約束=' + g3.recruitN + ' 人 / カード ' + g3.nFilled + '/' + g3.nCols
        + ' 枚 / 実体 ' + JSON.stringify(gBody));
      check('(2a) ★★受入条件: 解散すると DFRecruits.count() が 0 になり、カード列が主人公 1 枚になる',
        !!gOk && g3.confVis === false && g3.recruitN === 0
        && g3.nCols === 1 && g3.nFilled === 1 && gBody.n === 1 && gBody.hero === 1,
        '名簿=' + g3.recruitN + ' 人 / カード=' + g3.nFilled + '/' + g3.nCols
        + ' 枚 / 実体=' + JSON.stringify(gBody));

      /* ── (2d) 受注ナレが名指しする口の名 == 実際に出るボタンのラベル ──
         ⭐ 語そのものは写経しない。ナレの「」で括られた語の集合に、ボタンのラベルから
           飾り (先頭の絵文字) を落とした語が居るか、だけを見る。
         ⚠ これは verify_recruit_size (S10) の **既定 ON 側の腕**。あちらは ?recruittalk=0
           でしか回らないので、既定の姿は誰も測っていなかった (#60 で塞いだ空白地帯)。 */
      const g4 = await pageG.evaluate(() => {
        const out = { narr: '', quoted: [], label: '', threw: '' };
        try {
          out.narr = (PREP_ONBOARDING_NARRATION || []).join('\n');
          out.quoted = (out.narr.match(/「([^」]+)」/g) || []).map((s) => s.slice(1, -1));
          const b = document.getElementById('pmBtnReroll');
          out.label = b ? (b.textContent || '').trim() : '(なし)';
        } catch (e) { out.threw = String((e && e.message) || e); }
        return out;
      });
      const g4word = g4.label.replace(/^\S+\s*/, '');
      check('(2d) 受注ナレが名指しする口の名が、実際に出るボタンのラベルと一致 (語りかけの先に無い口を作らない)',
        g4.threw === '' && g4word.length > 0 && g4.quoted.indexOf(g4word) >= 0,
        'ボタン="' + g4.label + '" → 語="' + g4word + '" / ナレが名指しする語 = '
        + JSON.stringify(g4.quoted));
    }
    await pageG.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 H — 撤退 ?recruittalk=0 ではラベルも行き先も従来のまま
     *   ⭐ 「募集」の語を写経するだけにしない。**既定の腕と文字列が違う**ことも併せて見る
     *      (両腕を同じラベルにする実装は片面だけでは捕まらない)。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n====== 腕H: 撤退 ?recruittalk=0 (2b) ======');
    const pageH = await openTavern(browser, DESK, '?recruittalk=0');
    await startPrep(pageH, SCENARIO);
    const advH = await advance(pageH, 90000);
    if (advH.reached !== 'cinema') {
      pending('(2b) ?recruittalk=0 ではラベルが「募集をかけ直す」のまま',
        '演出まで到達しなかった (reached=' + advH.reached + ')');
    } else {
      await pageH.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
      const h1 = await waitGate(pageH, 12000);
      console.log('       撤退の腕: ラベル="' + h1.rerollText + '" / 既定の腕="' + defaultRerollLabel + '"');
      check('(2b) ★受入条件: ?recruittalk=0 ではラベルが「募集をかけ直す」のまま (既定の腕とは別の語)',
        h1.rerollVis === true && /募集/.test(h1.rerollText) && h1.rerollText.indexOf('解散') < 0
        && defaultRerollLabel !== '(未測定)' && h1.rerollText !== defaultRerollLabel,
        '撤退="' + h1.rerollText + '" / 既定="' + defaultRerollLabel + '"');
    }
    await pageH.close();

    /* ══ ページエラー ══════════════════════════════════════════════════ */
    console.log('\n====== ページエラー ======');
    check('(9z) ページエラーが 0 件', pageErrors.length === 0,
      pageErrors.length ? pageErrors.slice(0, 6).join(' | ') : 'なし');

  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    try { await browser.close(); } catch (e2) {}
    try { server.close(); } catch (e2) {}
    process.exit(2);
  }

  await browser.close();
  server.close();

  /* ══ 集計 ══════════════════════════════════════════════════════════════ */
  const passed   = results.filter((r) => r.ok).length;
  const pendingN = results.filter((r) => r.pending).length;
  const failed   = results.filter((r) => !r.ok && !r.pending).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   PENDING ' + pendingN);
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok && !r.pending).forEach((r) => console.log('    ' + r.name + '  -- ' + r.detail));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = NEG_EXPECT[tag] || [];
    const red = new Set(results.filter((r) => !r.ok && !r.pending)
      .map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]));
    const miss = want.filter((w) => !red.has(w));
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',')
      + ' / 実際に赤くなった=' + Array.from(red).join(','));
    if (miss.length) {
      console.error('[driver] ✗ ' + tag + ' の担当ラベルが赤くなりませんでした (空振り): ' + miss.join(','));
      process.exit(1);
    }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
