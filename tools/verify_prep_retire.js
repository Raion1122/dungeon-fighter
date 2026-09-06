#!/usr/bin/env node
/*
 * verify_prep_retire.js — 実装依頼書 #55「出発準備画面の廃止 — 設定をマッチング画面へ一本化する」
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_prep_retire.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_prep_retire.js --negative            ← 負のコントロール (1 本ずつ自動で回す)
 *   node tools/verify_prep_retire.js --negative --only equipghost
 *
 * ── セクション ─────────────────────────────────────────────────────────────
 *   §0 装置 (母集団を先に確かめる)
 *   §1 移設先で事前情報チェックが成立する
 *   §2 移設先で敵の情報が出る
 *   §3 引き出しの装備段
 *   §4 書庫段・召喚段は主人公のカードだけ
 *   §5 #btnReroll が移設されている
 *   §6 恒等 (非退行)
 *   §7 撤退スイッチ ?prepskip=0
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────────
 *  - ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない)。
 *  - **openPrep() を await してはいけない**。演出はタップを待って止まるので固まる。
 *    ⭐ しかも #55 後は openPrep が最後に departToScenario() を呼ぶ = **ページが飛ぶ**。
 *  - ⭐⭐⭐ 入口は **#btnAccept の実クリック**。openPrep を直に呼ぶと、依頼カード →
 *    受注ナレ → 演出 という本物の導線を 1 つも通らない (依頼書 §9「計測機構」)。
 *  - ⚠⚠ **画面中央のクリックで演出を進めない**。#35 以後そこを叩いても進まない
 *    (driver_equip_compact_ios が着手前から赤かった理由そのもの)。
 *  - ⭐ 事前情報チェックは **出目しだい**。「押した = 成功」ではないので、成功に届くまで
 *    受注からやり直す (母集団ガードとして「何回押したか」を必ず出す)。
 *  - ⚠ 縦持ちの規則 (@media max-width:720px) が効くのは 390px 幅。(1c)(2b) は
 *    **iPhone 幅で・引き出しを開いた状態**で測る (依頼書 §2-4 の罠が出る条件)。
 *  - ⚠ 配信バイトは起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *  - ⚠ classic script 直下の let/const/function は window に載らない。**裸の識別子**で読む。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §9 の変異表 12 本を内蔵。⚠⚠⚠ **1 本ずつ** `--only <tag>` で確定させる
 *   (同時に入れると互いを覆い隠す)。--only 無しの --negative は自分自身を 1 本ずつ
 *   子プロセスで呼び直す。
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
const PORT     = parseInt(arg('port', '10050'), 10);
/* ⚠⚠⚠ 2026-09-06 実測で 2 回外した。**goblin-mine 以外を既定にしてはいけない**:
 *   ① orc-fort は `locked: true` (unlockAfter: bandits-forest) = 新規セーブでは
 *      #btnAccept のハンドラが isUnlocked() で **黙って return** する。
 *      症状は「導線が prologueOverlay のまま 120 秒」で、原因が画面に出ない。
 *   ② SCENARIO_INTEL に unlocksFlag を持つのは goblin-mine / bandits-forest /
 *      lizard-swamp の **3 本だけ**。orc-fort には無いので §1 が原理的に測れない。
 * ⭐ goblin-mine は locked:false かつ unlocksFlag=mine_chariot_intel。
 *   ★1 = recruitCountOf 1 なので ?recruittalk=0 で 主人公 + NPC 1 人 = §4 の負の側も立つ。 */
const SCENARIO = arg('scenario', 'goblin-mine');

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = { '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')) };
const INJECTED = [];
/* ⚠⚠⚠ tavern.html は **ディスク上 CRLF**。複数行にまたがるアンカーを '\n' で書くと
   1 件も当たらず、mutate() が exit 3 で止まる (静かに緑になるよりはマシだが、
   原因が「腐ったアンカー」に見えて時間を溶かす)。改行は必ずこれを使う。 */
const CRLF = FROZEN['/tavern.html'].includes('\r\n') ? '\r\n' : '\n';

/* アンカーがちょうど 1 箇所でなければ **走らせる前に exit 3**。
   腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ。 */
function mutate(label, anchor, patch) {
  const tag   = label.split(' ')[0];
  const src   = FROZEN['/tavern.html'].toString('utf8');
  const parts = src.split(anchor);
  const hits  = parts.length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + anchor.slice(0, 160));
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  FROZEN['/tavern.html'] = Buffer.from(parts.join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました');
}

/* 変異 → 赤くなるべきラベルの担当表。
   ⚠⚠⚠ この表は **机上で書いてはいけない**。`--only <tag>` で 1 本ずつ走らせ、
     実際に赤くなったラベルを見てから書く。標的以外の巻き添えは列挙しない
     (巻き添えを書くと、母集団が消えただけの「偽の赤」で空振りを隠してしまう)。 */
const NEG_EXPECT = {
  nointel:       ['(1a)'],
  intelghost:    ['(1b)'],
  intelinheader: ['(1c)'],
  enemyhardcode: ['(2a)'],
  equipopen:     ['(3a)'],
  nosummary:     ['(3b)'],
  equipghost:    ['(3c)'],
  libraryall:    ['(4b)'],
  noreroll:      ['(5a)'],
  keyrename:     ['(6c)'],
  switchdead:    ['(7a)'],
  switchtwice:   ['(7a)'],
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
  /* nointel — マッチング画面に事前情報の 3 ボタンを足さない。 */
  mutate('nointel (マッチング画面の intel 3 ボタンを出さない)',
    '            <button type="button" class="btn intelBtn" id="pmBtnIntelExamine">',
    '            <button type="button" class="btn intelBtn" id="pmBtnIntelExamine" hidden>');
  /* intelghost — 押せるし行も増えるが、本物の判定を通らない = prepIntelSuccess へ繋がらない。
     ⭐ 依頼書が「写経 assert では捕まらない」と名指しした変異。 */
  mutate('intelghost (押すと行は増えるが本物の判定を通らない)',
    '        const h = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); runPrepIntel(kind); };',
    '        const h = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation();' + CRLF
    + '          const L = document.getElementById("pmIntelResultList");' + CRLF
    + '          if (L) { const d = document.createElement("div"); d.className = "intelResult success"; d.textContent = "(ghost)"; L.appendChild(d); } };');
  /* intelinheader ⭐⭐ — 依頼書 §2-4 の罠の再現。#pmHeader の中へ入れると
     縦持ちで引き出しを開いた瞬間に消える。 */
  mutate('intelinheader (下ごしらえ帯を #pmHeader の中へ入れる)',
    '    if (briefEl) {' + CRLF + '      briefEl.hidden = !setupOn;',
    '    if (briefEl) {' + CRLF + '      try { document.getElementById("pmHeader").appendChild(briefEl); } catch (e) {}'
    + CRLF + '      briefEl.hidden = !setupOn;');
  /* enemyhardcode — 敵の情報を固定文字列で書く。 */
  mutate('enemyhardcode (敵の顔ぶれを固定文字列にする)',
    '      if (enemyEl) enemyEl.textContent = scenarioEnemyInfoText(sc);',
    '      if (enemyEl) enemyEl.textContent = "ゴブリン / ゴブリン";');
  /* equipopen — 装備段を既定で開いた状態にする。 */
  mutate('equipopen (折り畳み段を既定で開く)',
    '    sec.open = !!pmFoldOpen[id];',
    '    sec.open = true;');
  /* nosummary ⭐ — 依頼書 §2-6 の罠の再現。段の先頭に現在の装備を出さない。 */
  mutate('nosummary (装備段の先頭から「装備中」を落とす)',
    '      renderEquippedSummary(classKey, sumEl, pmRepaint);',
    '      sumWrap.remove();');
  /* equipghost — 押せるが装備は替わらない。 */
  mutate('equipghost (装備を押しても selection を書き換えない)',
    '          if (!dfEquip(eqKey, kind, i)) return;   // 両手武器装備中の盾など → 弾く',
    '          if (!(function () { return true; })()) return;   /* equipghost */');
  /* libraryall — 書庫段・召喚段を同行 NPC のカードにも出す。 */
  mutate('libraryall (書庫段・召喚段を NPC のカードにも出す)',
    '    if (m.isHero) {' + CRLF + '      /* 書庫段 —— スクロールの「読む」= 永続習得の唯一の口。 */',
    '    if (true) {' + CRLF + '      /* 書庫段 —— スクロールの「読む」= 永続習得の唯一の口。 */');
  /* noreroll — #btnReroll を移設しない。 */
  mutate('noreroll (マッチング画面の「募集をかけ直す」を出さない)',
    '        <button type="button" id="pmBtnReroll">',
    '        <button type="button" id="pmBtnReroll" hidden>');
  /* keyrename — 既読フラグのキー名を変える (既読の人に二度語る)。 */
  mutate('keyrename (prepOnboardingSeen のキー名を変える)',
    '    const KEY = "dragonfighters.prepOnboardingSeen";',
    '    const KEY = "dragonfighters.pmOnboardingSeen";');
  /* switchdead ⭐⭐⭐ — 依頼書 §8 の罠の再現。スイッチを読むが常に true。 */
  mutate('switchdead (PREP_SKIP_ON が常に true = 撤退スイッチが死ぬ)',
    '    try { return new URLSearchParams(window.location.search).get("prepskip") !== "0"; }',
    '    try { return true; }');
  /* switchtwice — prepskip を 2 箇所で読み、片方だけ直す。 */
  mutate('switchtwice (出発の分岐だけ別の読み方をする = 片方だけ直る)',
    '    if (PREP_SKIP_ON) { departToScenario(); return; }',
    '    if (new URLSearchParams(location.search).get("prepskip") !== "1") { departToScenario(); return; }');
}

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
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)
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
 * 集計 (PASSED / FAILED / PENDING の 3 値)
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, ok: false, pending: true, detail: why || '' });
  console.log('  --  ' + name + '   [PENDING] ' + (why || ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* 可視判定。checkVisibility は祖先の display:none / hidden までまとめて見てくれる。 */
const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* ══════════════════════════════════════════════════════════════════════════
 * 起動 / 導線
 * ══════════════════════════════════════════════════════════════════════════ */
/* ⚠ 種は「毎回同じ画面が立つ」ためのもの。⛔ 測る値そのものは種にしない。 */
function seed() {
  try {
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');   // ナレで導線が止まらないように
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.removeItem('dragonfighters.equipWeaponIdx');
    localStorage.removeItem('dragonfighters.allyEquip');
    /* 装備を「替えられる」状態にする。⚠ 所持が 1 個しかないと (3c) が原理的に測れない。 */
    localStorage.setItem('dragonfighters.ownedEquip', JSON.stringify({
      weapons: [0, 1, 2, 3], armors: [0, 1, 2], shields: [0, 1, 2],
      _hwm: { weapons: 3, armors: 2, shields: 2 },
    }));
  } catch (e) {}
}

/* ⚠ ?recruittalk=0 = #54 の自動編成モデル。主人公 + NPC が並ぶので §4 の
   「NPC のカードには書庫段が無い」を測る母集団が立つ (依頼書 §9 (4b) の注記)。 */
function urlFor(qs) {
  let p = '/tavern.html?recruittalk=0';
  if (qs) p += '&' + qs;
  return 'http://localhost:' + PORT + p;
}

async function openTavern(browser, viewport, qs) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(viewport.name + ' :: ' + e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  const url = urlFor(qs);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(seed);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
  return page;
}

/* 受注 → マッチング演出が【開いて出発の口が出る】まで進める。
 * ⭐⭐⭐ 入口は **#btnAccept の実クリック**。openPrep を直に呼ぶと本物の導線を通らない。
 * ⚠ 受注ナレ (#prologueOverlay) は音声ペースで 20 秒近くかかる。クリック間隔は 400ms。
 * ⛔ #partyMatchOverlay も #pmColumns も叩かない (それが測定対象そのもの)。 */
async function acceptToCinema(page, scId, budgetMs) {
  /* ⚠⚠⚠ #btnAccept のハンドラは `if (!currentScenario || !isUnlocked(currentScenario)) return;`
     で **黙って return** する。封印中の依頼を指すと「押したのに何も起きない」= 導線が
     prologueOverlay のまま予算切れになり、原因が画面に出ない (2026-09-06 に踏んだ)。
     ⇒ 押す前に解錠されているかを採って持ち帰り、(0a-0) で数として出す。 */
  const gate = await page.evaluate((id) => {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return { found: false, unlocked: false, clicked: false };
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    currentScenario = sc;
    const unlocked = (typeof isUnlocked === 'function') ? !!isUnlocked(sc) : true;
    const b = document.getElementById('btnAccept');
    if (b && unlocked) { b.disabled = false; b.click(); return { found: true, unlocked, clicked: true }; }
    return { found: true, unlocked, clicked: false };
  }, scId);
  const t0 = Date.now();
  let lastClick = 0;
  const seen = [];
  const push = (s) => { if (seen[seen.length - 1] !== s) seen.push(s); };
  while (Date.now() - t0 < (budgetMs || 120000)) {
    let st;
    try {
      st = await page.evaluate((visSrc) => {
        const vis = eval(visSrc);
        const q = (id) => document.getElementById(id);
        const ov = q('partyMatchOverlay');
        const dep = q('pmDepart');
        return {
          cinema: !!(ov && ov.style.display === 'flex' && !ov.classList.contains('fading')),
          departReady: !!(dep && !dep.hidden && vis(dep)),
          prep:   vis(q('prep')),
          prol:   vis(q('prologueOverlay')),
          solo:   vis(q('soloConfirm')),
          href:   location.pathname,
        };
      }, VIS_FN);
    } catch (e) { return { reached: false, steps: seen.concat('navigated'), ms: Date.now() - t0, gate }; }
    if (!/tavern\.html/.test(st.href)) return { reached: false, steps: seen.concat('left-tavern'), ms: Date.now() - t0, gate };
    if (st.cinema && st.departReady) { push('cinema'); return { reached: true, steps: seen, ms: Date.now() - t0, gate }; }
    if (st.cinema) { push('cinema'); }
    else if (st.prep) { push('prep'); return { reached: false, steps: seen, ms: Date.now() - t0, gate }; }
    else if (st.solo && Date.now() - lastClick > 400) {
      /* #54 の「単身出発の確認」。?recruittalk=0 では出ないはずだが、出たら進める。 */
      push('soloConfirm');
      await page.evaluate(() => { const b = document.getElementById('btnSoloGo'); if (b) b.click(); });
      lastClick = Date.now();
    } else if (st.prol && Date.now() - lastClick > 400) {
      push('prologueOverlay');
      await page.evaluate(() => { const o = document.getElementById('prologueOverlay'); if (o) o.click(); });
      lastClick = Date.now();
    }
    await sleep(60);
  }
  return { reached: false, steps: seen, ms: Date.now() - t0, gate };
}

/* カードを押して引き出しを開く。⛔ 画面中央は叩かない (#35 以後そこは死んでいる)。 */
async function openDrawer(page, idx) {
  await page.evaluate((i) => {
    const cols = document.querySelectorAll('#pmColumns .pmColumn');
    if (cols[i]) cols[i].click();
  }, idx);
  await sleep(260);
  return page.evaluate(() => {
    const d = document.getElementById('pmDrawer');
    return { open: !!(d && !d.hidden), title: (document.getElementById('pmDrawerTitle') || {}).textContent || '' };
  });
}
async function setFoldOpen(page, id, open) {
  await page.evaluate((a) => {
    const el = document.getElementById(a.id);
    if (el) el.open = a.open;
  }, { id, open });
  await sleep(160);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
const IPHONE  = { name: 'iphone_portrait', width: 390, height: 844 };
const DESKTOP = { name: 'desktop', width: 1280, height: 900 };

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] port=' + PORT + ' root=' + ROOT + ' scenario=' + SCENARIO
    + (INJECTED.length ? ('  変異=' + INJECTED.join(',')) : ''));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
           '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + require('./_pptr_profile')('df_pptr_profile_prepretire_')],
  });

  try {
    /* ══ §0 装置 ══════════════════════════════════════════════════════════ */
    console.log('\n====== §0 装置 (先に母集団を確かめる) ======');
    const page = await openTavern(browser, DESKTOP, null);
    const reach = await acceptToCinema(page, SCENARIO);
    console.log('  導線: ' + reach.steps.join(' > ') + '  (' + Math.round(reach.ms / 1000) + '秒)');
    /* ⭐⭐⭐ これが無いと以降の全 assert が空振りで永久緑になる。 */
    /* ⭐⭐⭐ 「押したのに何も起きない」を (0a) の 120 秒タイムアウトで診断させない。
       封印中の依頼を指していたら **ここで名指しで赤くなる**。 */
    check('(0a-0) 依頼 ' + SCENARIO + ' が解錠されていて #btnAccept が実際に発火した',
      reach.gate && reach.gate.found && reach.gate.unlocked && reach.gate.clicked,
      JSON.stringify(reach.gate));
    check('(0a) #btnAccept の実クリックからマッチング画面が可視になった (出発の口まで開いた)',
      reach.reached, '経路=' + reach.steps.join('>') + ' / ' + Math.round(reach.ms / 1000) + '秒');

    const pop = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
      /* ⛔ 表を写経せず selection.partyMembers の実体から引く。 */
      const members = (selection.partyMembers || []).map((m) => ({ classKey: m.classKey, isHero: !!m.isHero }));
      const intelDefs = Object.keys(SCENARIO_INTEL || {}).filter((k) => SCENARIO_INTEL[k] && SCENARIO_INTEL[k].unlocksFlag);
      const sc = prepScenario;
      return {
        nCols: cols.length,
        nHero: members.filter((m) => m.isHero).length,
        nNpc:  members.filter((m) => !m.isHero).length,
        nMembers: members.length,
        intelScenarios: intelDefs,
        thisHasIntel: !!(sc && SCENARIO_INTEL[sc.id] && SCENARIO_INTEL[sc.id].unlocksFlag),
        unlocksFlag: (sc && SCENARIO_INTEL[sc.id]) ? (SCENARIO_INTEL[sc.id].unlocksFlag || null) : null,
        briefVis: vis(document.getElementById('pmBrief')),
      };
    }, VIS_FN);
    console.log('  母集団: カード ' + pop.nCols + ' 枚 / 編成 ' + pop.nMembers
      + ' 人 (主人公 ' + pop.nHero + ' / 同行 ' + pop.nNpc + ')'
      + ' / intel を持つシナリオ ' + pop.intelScenarios.length + ' 件');
    check('(0b) カードが 1 枚以上あり、うち 1 人が主人公 (selection.partyMembers の実体から)',
      pop.nCols >= 1 && pop.nHero === 1 && pop.nCols === pop.nMembers,
      'cols=' + pop.nCols + ' members=' + pop.nMembers + ' hero=' + pop.nHero + ' npc=' + pop.nNpc);
    check('(0c) SCENARIO_INTEL に unlocksFlag を持つシナリオが 1 件以上ある',
      pop.intelScenarios.length >= 1, pop.intelScenarios.join(',') || '(0 件)');
    check('(0d) 今回の依頼 ' + SCENARIO + ' が intel の対象 (以降の §1 が空振りしない)',
      pop.thisHasIntel === true, 'unlocksFlag=' + pop.unlocksFlag);
    check('(0e) 同行 NPC が 1 人以上いる (§4 の負の側が測れる)',
      pop.nNpc >= 1, 'npc=' + pop.nNpc);

    /* ══ §2 敵の情報 ═════════════════════════════════════════════════════ */
    console.log('\n====== §2 移設先で敵の情報が出る ======');
    const enemy = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const el = document.getElementById('pmEnemyInfo');
      const sc = prepScenario;
      /* ⛔ 期待値をドライバに直書きしない。実体 (sc.enemies) から導く。 */
      const want = (sc && Array.isArray(sc.enemies))
        ? sc.enemies.map((e) => (e.boss ? ('【' + e.name + '】') : e.name)).join(' / ') : '(なし)';
      return { got: el ? el.textContent.trim() : '(要素なし)', want, vis: vis(el) };
    }, VIS_FN);
    check('(2a) マッチング画面の敵の顔ぶれが sc.enemies から導いた文字列と一致する',
      enemy.vis && enemy.got === enemy.want, '出=「' + enemy.got + '」 期待=「' + enemy.want + '」');

    /* ══ §3 引き出しの装備段 ════════════════════════════════════════════ */
    console.log('\n====== §3 引き出しの装備段 ======');
    const drawer0 = await openDrawer(page, 0);
    console.log('  引き出し: ' + (drawer0.open ? '開いた' : '開かない') + ' / ' + drawer0.title);
    const fold = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const eq = document.getElementById('pmDrawerEquip');
      return {
        exists: !!eq,
        open: eq ? !!eq.open : null,
        bodyVis: eq ? vis(eq.querySelector('.pmDrawerFoldBody')) : false,
        summaryText: eq ? ((eq.querySelector('summary') || {}).textContent || '') : '',
      };
    }, VIS_FN);
    check('(3a) カードを開くと「装備」段があり、既定で畳まれている',
      fold.exists === true && fold.open === false && fold.bodyVis === false,
      'exists=' + fold.exists + ' open=' + fold.open + ' 中身可視=' + fold.bodyVis + ' 見出し=「' + fold.summaryText.trim() + '」');

    await setFoldOpen(page, 'pmDrawerEquip', true);
    const eqBody = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      const eq = q('pmDrawerEquip');
      const sum = q('pmDrawerEquipSummary');
      const lists = ['weapon', 'shield', 'armor'].map((k) => {
        const el = q('pmDrawerEquip_' + k);
        return { k, n: el ? el.querySelectorAll('.equipItem').length : -1, vis: vis(el) };
      });
      /* 「先頭に現在の装備」= 段の中で summary が最初のリストより前に在るか (DOM 順で測る)。 */
      let sumFirst = false;
      if (eq && sum) {
        const kids = Array.prototype.slice.call(eq.querySelectorAll('.equippedSummary, .equipList'));
        sumFirst = kids.length > 0 && kids[0] === sum;
      }
      return {
        sumVis: vis(sum),
        sumChips: sum ? sum.querySelectorAll('.equipSlotChip').length : -1,
        sumFirst, lists,
      };
    }, VIS_FN);
    console.log('  装備段: ' + eqBody.lists.map((l) => l.k + '=' + l.n + '件').join(' / ')
      + ' / 装備中チップ ' + eqBody.sumChips + ' 個');
    check('(3b) 開くと武器/盾/鎧のリストが出て、段の先頭に「現在の装備」が出ている',
      eqBody.lists.every((l) => l.vis && l.n > 0) && eqBody.sumVis && eqBody.sumChips > 0 && eqBody.sumFirst,
      '一覧=' + JSON.stringify(eqBody.lists) + ' 装備中=' + eqBody.sumChips + '個 先頭=' + eqBody.sumFirst);

    /* (3c) ⭐ 2 経路の突き合わせ: 替えて出発し、保存先が実際に変わっている。 */
    const before = await page.evaluate(() => ({
      weapon: selection.equipWeapon,
      ls: localStorage.getItem('dragonfighters.equipWeaponIdx'),
    }));
    const clicked = await page.evaluate(() => {
      const el = document.getElementById('pmDrawerEquip_weapon');
      if (!el) return { ok: false, why: 'リストが無い' };
      /* 「未所持」「購入可」「所持なし」の飾り行は押しても何も起きない = 母集団から外す。 */
      const items = Array.prototype.slice.call(el.querySelectorAll('.equipItem'))
        .filter((x) => !/購入可|所持なし|両手武器/.test(x.textContent) && !x.classList.contains('locked'));
      if (!items.length) return { ok: false, why: '押せる所持品が 0 件' };
      const name = ((items[0].querySelector('.eName') || {}).textContent || '').trim();
      items[0].click();
      return { ok: true, name };
    });
    await sleep(260);
    const after = await page.evaluate(() => ({
      weapon: selection.equipWeapon,
      ls: localStorage.getItem('dragonfighters.equipWeaponIdx'),
    }));
    console.log('  装備: ' + JSON.stringify(before) + ' → ' + JSON.stringify(after)
      + ' (押した=' + (clicked.ok ? clicked.name : clicked.why) + ')');
    check('(3c) 装備を替えると保存先 (selection + localStorage) が実際に変わる',
      clicked.ok === true && after.weapon !== before.weapon && after.ls !== null && after.ls !== before.ls,
      '押せた=' + clicked.ok + ' selection ' + before.weapon + '→' + after.weapon
      + ' / localStorage ' + before.ls + '→' + after.ls + (clicked.ok ? '' : ' (' + clicked.why + ')'));

    const stillOpen = await page.evaluate(() => {
      const eq = document.getElementById('pmDrawerEquip');
      return eq ? !!eq.open : null;
    });
    check('(3d) 1 つ替えても装備段が畳まらない (続けて着せ替えられる)',
      stillOpen === true, 'open=' + stillOpen);

    /* ══ §4 書庫段・召喚段は主人公のカードだけ ═══════════════════════════ */
    console.log('\n====== §4 書庫段・召喚段は主人公のカードのみ ======');
    const heroSec = await page.evaluate(() => ({
      lib: !!document.getElementById('pmDrawerLibrary'),
      sum: !!document.getElementById('pmDrawerSummon'),
      title: ((document.getElementById('pmDrawerTitle') || {}).textContent || ''),
    }));
    check('(4a) 主人公のカードの引き出しに「書庫」「召喚」段がある',
      heroSec.lib && heroSec.sum, 'library=' + heroSec.lib + ' summon=' + heroSec.sum + ' / ' + heroSec.title.trim());

    if (pop.nNpc >= 1) {
      const npcIdx = await page.evaluate(() => {
        const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
        for (let i = 0; i < cols.length; i++) {
          const idx = parseInt(cols[i].dataset.memberIdx, 10);
          /* pmOrdered は [主人公, 仲間…] なので 1 以降が NPC。 */
          if (idx >= 1) return i;
        }
        return -1;
      });
      const npcDrawer = await openDrawer(page, npcIdx);
      const npcSec = await page.evaluate(() => ({
        lib: !!document.getElementById('pmDrawerLibrary'),
        sum: !!document.getElementById('pmDrawerSummon'),
        equip: !!document.getElementById('pmDrawerEquip'),
        title: ((document.getElementById('pmDrawerTitle') || {}).textContent || ''),
      }));
      console.log('  NPC カード(' + npcIdx + '): ' + npcSec.title.trim());
      check('(4b) 同行 NPC のカードの引き出しには「書庫」「召喚」段が無い (装備段は在る)',
        npcDrawer.open && npcSec.lib === false && npcSec.sum === false && npcSec.equip === true,
        'library=' + npcSec.lib + ' summon=' + npcSec.sum + ' equip=' + npcSec.equip + ' / ' + npcSec.title.trim());
    } else {
      pending('(4b) 同行 NPC のカードには書庫段が無い', '同行 NPC が 0 人 = 母集団が立たない ((0e) 参照)');
    }

    /* ══ §5 募集をかけ直す ══════════════════════════════════════════════ */
    console.log('\n====== §5 「募集をかけ直す」の移設 ======');
    await page.evaluate(() => { const b = document.getElementById('pmDrawerClose'); if (b) b.click(); });
    await sleep(200);
    const rr = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const btn = document.getElementById('pmBtnReroll');
      const dep = document.getElementById('pmDepart');
      /* DOM 順で「手前」を測る。⚠ 見た目の座標だと縦持ち/横持ちで揺れる。 */
      let before = null;
      if (btn && dep) {
        const pos = btn.compareDocumentPosition(dep);
        before = !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
      }
      return { vis: vis(btn), exists: !!btn, before, names: Array.prototype.slice
        .call(document.querySelectorAll('#pmColumns .pmName')).map((x) => x.textContent.trim()).join('|') };
    }, VIS_FN);
    let rr2 = { names: '(未実行)', changedPossible: false };
    if (rr.vis) {
      /* 3 回まで押して顔ぶれが変わりうることを見る (乱数なので 1 回で変わるとは限らない)。 */
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { const b = document.getElementById('pmBtnReroll'); if (b) b.click(); });
        await sleep(320);
        const now = await page.evaluate(() => ({
          names: Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmName'))
            .map((x) => x.textContent.trim()).join('|'),
        }));
        rr2 = { names: now.names, changedPossible: now.names !== rr.names };
        if (rr2.changedPossible) break;
      }
    }
    check('(5a) マッチング画面に「募集をかけ直す」があり、押すと顔ぶれが変わりうる',
      rr.vis === true && rr2.changedPossible === true,
      '可視=' + rr.vis + ' 前=' + rr.names + ' 後=' + rr2.names);
    check('(5b) 「募集をかけ直す」は #pmDepart の手前にある (DOM 順)',
      rr.before === true, 'before=' + rr.before);

    /* ══ §6 恒等 (非退行) ═══════════════════════════════════════════════ */
    console.log('\n====== §6 恒等 (非退行) ======');
    const dr = await openDrawer(page, 0);
    const ident = await page.evaluate(() => ({
      skill: !!document.getElementById('pmDrawerSkillList'),
      skillHead: ((document.getElementById('pmDrawerSkillHead') || {}).textContent || ''),
      ap: !!document.getElementById('pmDrawerAp'),
      apRows: document.querySelectorAll('#pmDrawerApRows .apRow').length,
    }));
    check('(6a) スキル段・傾向段が着手前と同じように出ている (#35 / #19 を壊していない)',
      dr.open && ident.skill && ident.ap && ident.apRows > 0,
      'skill=' + ident.skill + ' (' + ident.skillHead.trim() + ') ap=' + ident.ap + ' rows=' + ident.apRows);

    await page.evaluate(() => { const b = document.getElementById('pmDrawerClose'); if (b) b.click(); });
    await sleep(150);
    const beforeKeys = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < sessionStorage.length; i++) out.push(sessionStorage.key(i));
      return out.filter((k) => /^dragonfighters\./.test(k)).sort();
    });
    /* 出発する = #pmDepart を押す。⛔ 背景は叩かない。 */
    await page.evaluate(() => { const b = document.getElementById('pmDepart'); if (b) b.click(); });
    let departed = false;
    let afterKeys = [];
    for (let i = 0; i < 80 && !departed; i++) {
      await sleep(250);
      try {
        const st = await page.evaluate(() => {
          const out = [];
          for (let k = 0; k < sessionStorage.length; k++) out.push(sessionStorage.key(k));
          return { href: location.pathname + location.search, keys: out.filter((k) => /^dragonfighters\./.test(k)).sort() };
        });
        afterKeys = st.keys;
        if (!/tavern\.html/.test(st.href)) departed = true;
      } catch (e) { /* 遷移の最中は evaluate が落ちる。次の周回で拾う。 */ }
    }
    const WANT_KEYS = ['dragonfighters.currentScenario', 'dragonfighters.partyComposition',
                       'dragonfighters.partyMembers', 'dragonfighters.questFlags'];
    const missing = WANT_KEYS.filter((k) => afterKeys.indexOf(k) < 0);
    console.log('  出発: ' + (departed ? '遷移した' : '遷移しなかった')
      + ' / sessionStorage キー ' + beforeKeys.length + ' → ' + afterKeys.length
      + ' [' + afterKeys.join(',') + ']');
    check('(6b-0) #pmDepart を押すと実際に潜行へ遷移する (これが無いと §6 が空振りする)',
      departed === true, 'departed=' + departed);
    check('(6b) departToScenario が書くキーが 4 本とも在る (増えても減ってもいない)',
      missing.length === 0, '不足=' + (missing.join(',') || 'なし') + ' / 実際=' + afterKeys.join(','));

    /* (6c) 既読フラグのキー名。⛔ ナレの文面は測らない (語り口は調整の対象)。 */
    const srcHtml = FROZEN['/tavern.html'].toString('utf8');
    const hasKey = srcHtml.indexOf('"dragonfighters.prepOnboardingSeen"') >= 0;
    check('(6c) dragonfighters.prepOnboardingSeen のキー名が変わっていない',
      hasKey === true, hasKey ? '在り' : '見つからない (既読の人に二度語ることになる)');

    try { await page.close(); } catch (e) {}

    /* ══ §1 事前情報チェック ════════════════════════════════════════════
     * ⭐ 出目しだいなので、成功に届くまで受注からやり直す。
     *   母集団ガードとして「何回押したか / 何周したか」を必ず出す。 */
    console.log('\n====== §1 移設先で事前情報チェックが成立する ======');
    const MAX_ROUNDS = 4;
    const intel = { rounds: 0, presses: 0, rowsGrew: false, btnVis: false, success: false,
                    flagVal: null, flagKey: pop.unlocksFlag, departed: false };
    for (let r = 0; r < MAX_ROUNDS && !intel.success; r++) {
      const p = await openTavern(browser, DESKTOP, null);
      const rc = await acceptToCinema(p, SCENARIO);
      if (!rc.reached) { try { await p.close(); } catch (e) {} continue; }
      intel.rounds++;
      const vis0 = await p.evaluate((visSrc) => {
        const vis = eval(visSrc);
        return ['pmBtnIntelExamine', 'pmBtnIntelTalk', 'pmBtnIntelPray']
          .map((id) => vis(document.getElementById(id)));
      }, VIS_FN);
      if (vis0.every(Boolean)) intel.btnVis = true;
      const rows0 = await p.evaluate(() => {
        const l = document.getElementById('pmIntelResultList');
        return l ? l.children.length : -1;
      });
      for (const id of ['pmBtnIntelExamine', 'pmBtnIntelTalk', 'pmBtnIntelPray']) {
        const pressed = await p.evaluate((bid) => {
          const b = document.getElementById(bid);
          if (!b || b.disabled) return false;
          b.click();
          return true;
        }, id);
        if (!pressed) continue;
        intel.presses++;
        /* 判定カードはタップで進む。⚠ #skillCheckOverlay は最前面に居る想定 (z-index 220)。 */
        for (let k = 0; k < 40; k++) {
          await sleep(250);
          const done = await p.evaluate(() => {
            const ov = document.getElementById('skillCheckOverlay');
            if (!ov || !ov.classList.contains('show')) return true;
            const btn = document.getElementById('scRollBtn');
            if (btn) btn.click(); else ov.click();
            return false;
          });
          if (done) break;
        }
        await sleep(220);
      }
      const rows1 = await p.evaluate(() => {
        const l = document.getElementById('pmIntelResultList');
        return l ? l.children.length : -1;
      });
      if (rows1 > rows0) intel.rowsGrew = true;
      const ok = await p.evaluate(() => (typeof prepIntelSuccess !== 'undefined') ? !!prepIntelSuccess : null);
      console.log('  第' + intel.rounds + '周: 押した計 ' + intel.presses + ' 回 / 行 '
        + rows0 + '→' + rows1 + ' / prepIntelSuccess=' + ok);
      if (ok) {
        intel.success = true;
        /* ⭐ 2 経路の突き合わせ: 出発して questFlags まで届いているか。 */
        await p.evaluate(() => { const b = document.getElementById('pmDepart'); if (b) b.click(); });
        for (let i = 0; i < 80 && !intel.departed; i++) {
          await sleep(250);
          try {
            const st = await p.evaluate((k) => {
              let v = null;
              try { v = (JSON.parse(sessionStorage.getItem('dragonfighters.questFlags') || '{}'))[k]; } catch (e) {}
              return { href: location.pathname, flag: v === undefined ? null : v };
            }, pop.unlocksFlag);
            intel.flagVal = st.flag;
            if (!/tavern\.html/.test(st.href)) intel.departed = true;
          } catch (e) { /* 遷移中 */ }
        }
      }
      try { await p.close(); } catch (e) {}
    }
    console.log('  母集団: ' + intel.rounds + ' 周 / 計 ' + intel.presses + ' 回押した');
    check('(1a) マッチング画面の intel 3 ボタンが可視で、押すと #pmIntelResultList に行が増える',
      intel.btnVis === true && intel.rowsGrew === true,
      '可視=' + intel.btnVis + ' 行が増えた=' + intel.rowsGrew + ' / 押した ' + intel.presses + ' 回');
    check('(1b) ⭐ 押した結果が questFlags まで届く (prepIntelSuccess=true → unlocksFlag=true)',
      intel.success === true && intel.departed === true && intel.flagVal === true,
      '成功到達=' + intel.success + ' 出発=' + intel.departed + ' ' + intel.flagKey + '=' + intel.flagVal
      + ' (' + intel.rounds + '周 / ' + intel.presses + '回)');

    /* (1c)(2b) ⚠ 縦持ち + 引き出しを開いた状態で測る (依頼書 §2-4 の罠が出る条件)。 */
    console.log('\n  -- (1c)(2b) 縦持ち 390px・引き出しを開いた状態 --');
    const ph = await openTavern(browser, IPHONE, null);
    const rcp = await acceptToCinema(ph, SCENARIO);
    if (rcp.reached) await openDrawer(ph, 0);
    const compact = await ph.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      const hdr = q('pmHeader');
      const btns = ['pmBtnIntelExamine', 'pmBtnIntelTalk', 'pmBtnIntelPray'].map(q);
      return {
        drawerOpen: !!(q('pmDrawer') && !q('pmDrawer').hidden),
        headerVis: vis(hdr),
        inHeader: btns.some((b) => !!(b && hdr && hdr.contains(b))),
        btnVis: btns.map((b) => vis(b)),
        tapH: btns.map((b) => (b ? Math.round(b.getBoundingClientRect().height) : 0)),
        enemyVis: vis(q('pmEnemyInfo')),
        departVis: vis(q('pmDepart')),
      };
    }, VIS_FN);
    console.log('  引き出し=' + compact.drawerOpen + ' / ヘッダ可視=' + compact.headerVis
      + ' / intel 可視=' + JSON.stringify(compact.btnVis) + ' / 高さ=' + JSON.stringify(compact.tapH));
    check('(1c-0) 母集団: 縦持ちで引き出しが開き、#pmHeader が畳まれている (罠が出る条件を作れた)',
      compact.drawerOpen === true && compact.headerVis === false,
      'drawer=' + compact.drawerOpen + ' headerVis=' + compact.headerVis);
    check('(1c) intel の 3 ボタンは #pmHeader の外にあり、引き出しを開いても消えない',
      compact.inHeader === false && compact.btnVis.every(Boolean),
      'ヘッダの中=' + compact.inHeader + ' 可視=' + JSON.stringify(compact.btnVis));
    check('(1d) intel のタップ領域が 44px 以上',
      compact.tapH.every((h) => h >= 44), JSON.stringify(compact.tapH));
    check('(2b) 敵の情報も引き出しを開いた状態で消えない',
      compact.enemyVis === true, 'enemyVis=' + compact.enemyVis);
    check('(2c) 出発の口が縦持ちでも画面内に残っている',
      compact.departVis === true, 'departVis=' + compact.departVis);
    try { await ph.close(); } catch (e) {}

    /* ══ §7 撤退スイッチ ════════════════════════════════════════════════ */
    console.log('\n====== §7 撤退スイッチ ?prepskip=0 ======');
    const pr = await openTavern(browser, DESKTOP, 'prepskip=0');
    const rcr = await acceptToCinema(pr, SCENARIO);
    const retreat = { prepVis: false, flagVal: null, departed: false, success: false, presses: 0 };
    if (rcr.reached) {
      /* 演出を閉じる = #pmDepart。?prepskip=0 では閉じた先が準備画面。 */
      await pr.evaluate(() => { const b = document.getElementById('pmDepart'); if (b) b.click(); });
      for (let i = 0; i < 40 && !retreat.prepVis; i++) {
        await sleep(250);
        retreat.prepVis = await pr.evaluate((visSrc) => {
          const vis = eval(visSrc);
          return vis(document.getElementById('prep'));
        }, VIS_FN).catch(() => false);
      }
    }
    console.log('  ?prepskip=0: 導線=' + rcr.steps.join('>') + ' / #prep 可視=' + retreat.prepVis);
    check('(7a) tavern.html?prepskip=0 で従来どおり出発準備画面 (#prep) が可視になる',
      retreat.prepVis === true, 'prepVis=' + retreat.prepVis + ' 経路=' + rcr.steps.join('>'));

    if (retreat.prepVis) {
      /* (7b) ⭐ 可視なだけでなく #prep 側の intel が questFlags まで届く。 */
      for (const id of ['btnIntelExamine', 'btnIntelTalk', 'btnIntelPray']) {
        const pressed = await pr.evaluate((bid) => {
          const b = document.getElementById(bid);
          if (!b || b.disabled) return false;
          b.click();
          return true;
        }, id);
        if (!pressed) continue;
        retreat.presses++;
        for (let k = 0; k < 40; k++) {
          await sleep(250);
          const done = await pr.evaluate(() => {
            const ov = document.getElementById('skillCheckOverlay');
            if (!ov || !ov.classList.contains('show')) return true;
            const btn = document.getElementById('scRollBtn');
            if (btn) btn.click(); else ov.click();
            return false;
          });
          if (done) break;
        }
        await sleep(220);
      }
      retreat.success = await pr.evaluate(() => !!prepIntelSuccess);
      await pr.evaluate(() => { const b = document.getElementById('btnDepart'); if (b) b.click(); });
      for (let i = 0; i < 80 && !retreat.departed; i++) {
        await sleep(250);
        try {
          const st = await pr.evaluate((k) => {
            let v = null;
            try { v = (JSON.parse(sessionStorage.getItem('dragonfighters.questFlags') || '{}'))[k]; } catch (e) {}
            return { href: location.pathname, flag: v === undefined ? null : v };
          }, pop.unlocksFlag);
          retreat.flagVal = st.flag;
          if (!/tavern\.html/.test(st.href)) retreat.departed = true;
        } catch (e) { /* 遷移中 */ }
      }
      console.log('  ?prepskip=0 の intel: 押した ' + retreat.presses + ' 回 / prepIntelSuccess='
        + retreat.success + ' / ' + pop.unlocksFlag + '=' + retreat.flagVal);
      check('(7b) ?prepskip=0 のとき #prep 側の intel が動く (questFlags まで届く)',
        retreat.presses > 0 && retreat.departed === true && retreat.flagVal === retreat.success,
        '押した=' + retreat.presses + ' 出発=' + retreat.departed
        + ' success=' + retreat.success + ' flag=' + retreat.flagVal);
    } else {
      pending('(7b) ?prepskip=0 のとき #prep 側の intel が動く', '#prep が出ないので測れない ((7a) 参照)');
    }
    try { await pr.close(); } catch (e) {}

    /* (7c) ⭐⭐⭐ silent fail-open の検査: スイッチを外したら (7a) が赤になること。 */
    const pn = await openTavern(browser, DESKTOP, null);
    const rcn = await acceptToCinema(pn, SCENARIO);
    let noSwitchPrep = false;
    if (rcn.reached) {
      await pn.evaluate(() => { const b = document.getElementById('pmDepart'); if (b) b.click(); });
      for (let i = 0; i < 16 && !noSwitchPrep; i++) {
        await sleep(250);
        noSwitchPrep = await pn.evaluate((visSrc) => {
          const vis = eval(visSrc);
          return vis(document.getElementById('prep'));
        }, VIS_FN).catch(() => false);
      }
    }
    check('(7c) ⭐ スイッチを外すと #prep は出ない (スイッチ付きで緑なだけの空振りではない)',
      noSwitchPrep === false, 'スイッチ無しで prep 可視=' + noSwitchPrep + ' / 経路=' + rcn.steps.join('>'));
    try { await pn.close(); } catch (e) {}

    /* ══ ページエラー ══════════════════════════════════════════════════ */
    console.log('\n====== ページエラー ======');
    check('(9z) ページエラーが 0 件', pageErrors.length === 0, pageErrors.join(' | ') || 'なし');

  } catch (e) {
    console.error('\n[driver] 例外: ' + (e && e.stack ? e.stack : e));
    results.push({ name: '(driver) 例外なく走り切る', ok: false, pending: false, detail: String((e && e.message) || e) });
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

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
    /* 担当ラベルが赤くなったか。⛔ 「どれかが赤い」で通さない (巻き添えで空振りを隠せてしまう)。 */
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
