#!/usr/bin/env node
/*
 * verify_pm_drawer_fit.js — 実装依頼書 #56「マッチング画面の設定引き出しが縦に潰れる」
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_pm_drawer_fit.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_pm_drawer_fit.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_pm_drawer_fit.js --negative --only maxonly
 *
 * ── 測っているもの ─────────────────────────────────────────────────────────
 *   「引き出しが自分の中で中身を切っていないこと」と
 *   「器 (#pmInner) をスクロールすれば最下段まで届くこと」の 2 点。
 *   ⭐ 高さの**絶対値**は測らない (端末とフォントで動く)。測るのは中身と器の**関係**だけ。
 *   例外は §6 撤退の 42vh / 30vh —— あれは「#35 当時の姿へ戻ったこと」の指紋なので測る。
 *
 * ── セクション ─────────────────────────────────────────────────────────────
 *   §0 装置 (母集団を先に確かめる)
 *   §1 引き出しが自分の中で中身を切っていない
 *   §2 器をスクロールすれば最下段まで届く
 *   §3 開いたら引き出しが見える位置へ寄る / 閉じたら戻る
 *   §4 出発の口は死なない (既存 (4c)/(3c) の再測)
 *   §5 恒等 (非退行)
 *   §6 撤退スイッチ ?pmfit=0
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────────
 *  - ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない)。
 *  - ⭐⭐⭐ 入口は **#btnAccept の実クリック**。openPrep を直に呼ぶと、依頼カード →
 *    受注ナレ → 演出 という本物の導線を 1 つも通らない。
 *  - ⚠⚠ URL に **?recruittalk=0 が要る**。付けないと #54 の「声を掛けて仲間にする」演出で
 *    止まり、マッチング画面へ到達しないまま 120 秒でタイムアウトする (依頼書 §8 の実測)。
 *  - ⚠⚠ **画面中央のクリックで演出を進めない**。#35 以後そこを叩いても進まない。
 *    カードは `#pmColumns .pmColumn` を click() する。
 *  - ⚠ ポートは **10081**。⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する
 *    (依頼書 §2-7 の実測)。負のコントロールの子プロセスは 10082〜。
 *  - ⭐ 4 画面は **1 回の導線 + setViewport** で回す。受注ナレが 1 回 20 秒近くかかるので、
 *    画面ごとに navigate し直すと 4 倍の時間を食う。@media は setViewport で切り替わる
 *    (compact の 30vh が効いていることは (6a-v3) で実際に確かめている)。
 *  - ⚠⚠ **pmFoldOpen は画面をまたいで残る**。折り畳み段を開く最悪ケースを測った後に
 *    畳み直さないと、次の画面の「素」が最悪ケースになって (1a) の意味が消える。
 *    ⇒ 画面ごとに pmFoldOpen を空にしてから開き、(0d) で details[open]===0 を数える。
 *    ⭐ (0d) は依頼書に無い assert。装置の自己診断として足した。
 *  - ⚠ 配信バイトは起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *  - ⚠ classic script 直下の let/const/function は window に載らない。**裸の識別子**で読む
 *    (pmFoldOpen / selection がそれ)。
 *  - ⚠ tavern.html は **ディスク上 CRLF**。複数行アンカーは CRLF で書く。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §8 の変異表 10 本のうち **9 本**を内蔵 (rafless は実走で空振りだったので外した)。
 *   ⚠⚠⚠ **1 本ずつ** `--only <tag>` で確定させる
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
/* ⚠⚠⚠ 10080 は Chrome の制限ポート。指定すると FATAL net::ERR_UNSAFE_PORT で
   「サーバは立っているのにページが開かない」という診断しにくい形で死ぬ。 */
const PORT     = parseInt(arg('port', '10081'), 10);
/* ⚠ goblin-mine 以外を既定にしない (orc-fort は locked:true で #btnAccept が黙って return する)。 */
const SCENARIO = arg('scenario', 'goblin-mine');

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = { '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')) };
const INJECTED = [];
const CRLF = FROZEN['/tavern.html'].includes('\r\n') ? '\r\n' : '\n';
/* ⭐⭐⭐ アンカー健在チェックは **手つかずの原本** に対して行う。
   ⚠⚠⚠ 2026-09-07 に踏んだ罠: 変異後のバッファに対して数えていたので、
     同じアンカー (#pmDrawer 基底規則の末尾) を共有する maxonly / ovback / maxback は、
     1 本目を注入した瞬間に 2 本目が「注入点 0 箇所」= **偽のアンカー腐敗 (exit 3)** になり、
     いちばん大事な maxonly が 1 度も走らなかった。
   ⭐ 原本で数えれば「本当に腐ったアンカー」だけを捕まえられる。 */
const PRISTINE = FROZEN['/tavern.html'].toString('utf8');

function mutate(label, anchor, patch) {
  const tag  = label.split(' ')[0];
  const hits = PRISTINE.split(anchor).length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + anchor.slice(0, 160));
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  const parts = FROZEN['/tavern.html'].toString('utf8').split(anchor);
  if (parts.length - 1 !== 1) {
    /* ⚠ 同じ tag の中で 2 本目のアンカーが 1 本目に食われた = 変異の書き方が悪い。
       ⛔ 黙って no-op にしない (空振りを「注入したつもり」で隠してしまう)。 */
    console.error('[driver] ' + label + ' は同 tag の先行変異にアンカーを食われました (' + (parts.length - 1) + ' 箇所)。');
    process.exit(3);
  }
  FROZEN['/tavern.html'] = Buffer.from(parts.join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました');
}

/* 変異 → 赤くなるべきラベルの担当表。
   ⚠⚠⚠ この表は **机上で書いてはいけない**。`--only <tag>` で 1 本ずつ走らせ、
     実際に赤くなったラベルを見てから書き換えること。標的以外の巻き添えは列挙しない
     (巻き添えを書くと、母集団が消えただけの「偽の赤」で空振りを隠せてしまう)。
   ⭐ 下は 2026-09-07 に 1 本ずつ実走して確定させた実測値。 */
const NEG_EXPECT = {
  maxonly:     ['(1a-v1)'],
  ovback:      ['(1a-v1)'],
  maxback:     ['(1a-v1)'],
  compactback: ['(1a-v3)'],
  noscroll:    ['(3a-v1)'],
  /* ⛔ rafless (自動スクロールを requestAnimationFrame 抜きで即時実行する) は
     **表から外した**。2026-09-07 に実走したら 75/79 全緑 = 完全な空振りだった。
     ⭐ 理由は仕様どおり: getBoundingClientRect() は同期レイアウトを強制するので、
       hidden を外した直後でも rect は正しい。Chrome では rAF の有無で 1px も変わらない。
     ⚠ 本番から rAF を外していないのは、実機が iOS Safari で **この装置では測れない**から。
       ⛔ 「空振りする変異」を表に残すと --negative が永久に exit 1 になるので消した
         (依頼書 §8 が「赤くならない run があるなら表から外す」と明記している)。 */
  /* ⚠ norestore の担当は v1 では**測れない** —— デスクトップ 1280x900 は引き出しを
     閉じた状態の #pmInner がそもそもスクロールしない (maxScroll=0) ので (3b-v1) は
     PENDING。⭐ 縦持ち (閉じた maxScroll=410) が唯一まともに測れる画面。 */
  norestore:   ['(3b-v3)'],
  stickydead:  ['(4a-v1)'],
  switchdead:  ['(6a-v1)'],
  switchtwice: ['(6a-v1)'],
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

/* ── #56 後の #pmDrawer 基底規則の末尾。CSS 系の変異はここへ差し込む。 ────── */
const BASE_RULE_TAIL = '      border-radius: 10px;' + CRLF + '      text-align: left;' + CRLF + '    }';
const OFF_RULE_BASE  = '    body.pmFitOff #pmDrawer { max-height: 42vh; overflow-y: auto; }';
const OFF_RULE_CMPCT = '      body.pmFitOff #pmDrawer { max-height: 30vh; }';

if (NEGATIVE) {
  /* maxonly ⭐⭐⭐ — 依頼書 §2-1 の罠そのもの。「max-height が犯人」と読んで
     max-height だけ消し、overflow-y: auto を残した「素朴な直し方」を再現する。
     ⭐ これが赤くならない装置は #56 を守れていない (実測で 1px も直らない直し方だから)。 */
  mutate('maxonly (max-height だけ消して overflow-y: auto を残す = 素朴な直し方)',
    BASE_RULE_TAIL,
    '      border-radius: 10px;' + CRLF + '      overflow-y: auto;' + CRLF + '      text-align: left;' + CRLF + '    }');
  /* ovback — #56 を丸ごと revert した姿 (max-height も overflow-y も戻る)。 */
  mutate('ovback (#56 を丸ごと revert = max-height 42vh + overflow-y: auto を両方戻す)',
    BASE_RULE_TAIL,
    '      border-radius: 10px;' + CRLF + '      max-height: 42vh;' + CRLF + '      overflow-y: auto;' + CRLF
    + '      text-align: left;' + CRLF + '    }');
  /* maxback — max-height だけ戻す (overflow は visible のまま)。
     ⭐ 中身は切れないが器が頭打ちになるので clientHeight < scrollHeight = (1a) が赤くなる。 */
  mutate('maxback (max-height: 42vh だけ戻す。overflow は visible のまま)',
    BASE_RULE_TAIL,
    '      border-radius: 10px;' + CRLF + '      max-height: 42vh;' + CRLF + '      text-align: left;' + CRLF + '    }');
  /* compactback ⭐ — 「基底だけ直して compact を忘れる」を捕まえる。
     #35 の M6 が「42vh だけ消しても 390px では赤くならない」と実測したのと同じ非対称。 */
  mutate('compactback (compact の 30vh だけ無条件で戻す = 縦持ちだけ潰れる)',
    OFF_RULE_CMPCT,
    '      #pmDrawer { max-height: 30vh; }');
  /* noscroll — 開いたときの自動スクロールを外す。 */
  mutate('noscroll (pmOpenDrawer の自動スクロールを外す)',
    '        inner.scrollTop += drawer.getBoundingClientRect().top - inner.getBoundingClientRect().top;',
    '        void 0;   /* noscroll: 自動スクロールを外した */');
  /* norestore — 閉じたときの復元を外す。 */
  mutate('norestore (pmCloseDrawer の復元を外す)',
    '      requestAnimationFrame(function () { inner.scrollTop = back56; });',
    '      void back56;   /* norestore: 復元を外した */');
  /* ⛔ rafless は 2026-09-07 の実走で完全な空振りだったので **消した** (NEG_EXPECT の注記を参照)。 */
  /* stickydead — (4c)/(4a) を守っている実体を潰す。 */
  mutate('stickydead (#pmDepart から position: sticky を外す)',
    '    #pmDepart { position: sticky; bottom: 0; z-index: 2; }',
    '    #pmDepart { position: static; }');
  /* switchdead ⭐⭐ — 撤退スイッチが死ぬ (PM_FIT_ON が常に true)。 */
  mutate('switchdead (PM_FIT_ON が常に true = 撤退スイッチが死ぬ)',
    '    try { return new URLSearchParams(window.location.search).get("pmfit") !== "0"; }',
    '    try { return true; }');
  /* switchtwice — body.pmFitOff は付くが CSS 側の上書き規則が無い (JS だけ直る)。 */
  mutate('switchtwice (body.pmFitOff は付くが CSS の上書き規則が無い)',
    OFF_RULE_BASE,
    '    /* switchtwice: 上書き規則を落とした */');
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
const r1 = (x) => (x === null || x === undefined) ? 'null' : Math.round(x * 10) / 10;

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
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.removeItem('dragonfighters.equipWeaponIdx');
    localStorage.removeItem('dragonfighters.allyEquip');
    localStorage.setItem('dragonfighters.ownedEquip', JSON.stringify({
      weapons: [0, 1, 2, 3], armors: [0, 1, 2], shields: [0, 1, 2],
      _hwm: { weapons: 3, armors: 2, shields: 2 },
    }));
  } catch (e) {}
}

/* ⚠⚠ ?recruittalk=0 が無いと #54 の勧誘演出で止まり、マッチング画面へ到達しないまま
   120 秒でタイムアウトする (依頼書 §8 の実測)。⛔ 外さないこと。 */
function urlFor(qs) {
  let p = '/tavern.html?recruittalk=0';
  if (qs) p += '&' + qs;
  return 'http://localhost:' + PORT + p;
}

async function openTavern(browser, viewport, qs) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push((qs || 'plain') + ' :: ' + e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  const url = urlFor(qs);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(seed);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
  return page;
}

/* 受注 → マッチング演出が【開いて出発の口が出る】まで進める。
 * ⭐⭐⭐ 入口は #btnAccept の実クリック。⛔ #partyMatchOverlay も #pmColumns も叩かない。 */
async function acceptToCinema(page, scId, budgetMs) {
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

/* ══════════════════════════════════════════════════════════════════════════
 * 計測ヘルパー
 * ══════════════════════════════════════════════════════════════════════════ */
/* カードを押して引き出しを開く。⛔ 画面中央は叩かない (#35 以後そこは死んでいる)。 */
async function clickCard(page, idx) {
  await page.evaluate((i) => {
    const cols = document.querySelectorAll('#pmColumns .pmColumn');
    if (cols[i]) cols[i].click();
  }, idx);
  await sleep(340);   // ⚠ rAF (自動スクロール) が回り切るまで待つ
}
async function closeDrawerByButton(page) {
  const ok = await page.evaluate(() => {
    const b = document.getElementById('pmDrawerClose');
    if (!b) return false;
    b.click(); return true;
  });
  await sleep(340);
  return ok;
}
/* 主人公 (= 中身がいちばん高い戦士) のカード番号を、表を写経せずに実体から引く。
   ⛔ 「0 番が主人公」と決め打ちにしない。 */
async function findHeroCard(page) {
  const n = await page.evaluate(() => document.querySelectorAll('#pmColumns .pmColumn').length);
  for (let i = 0; i < n; i++) {
    await clickCard(page, i);
    const t = await page.evaluate(() => (document.getElementById('pmDrawerTitle') || {}).textContent || '');
    if (/あなた/.test(t)) return { idx: i, n, title: t };
    await closeDrawerByButton(page);
  }
  return { idx: -1, n, title: '' };
}
/* pmFoldOpen を空にしてから開かないと、前の画面で開いた最悪ケースが「素」として残る。 */
async function resetFolds(page) {
  return page.evaluate(() => {
    try {
      document.querySelectorAll('#pmDrawer details.pmDrawerFold').forEach((d) => { d.open = false; });
      Object.keys(pmFoldOpen).forEach((k) => { delete pmFoldOpen[k]; });
      return true;
    } catch (e) { return false; }
  });
}
async function openAllFolds(page) {
  const n = await page.evaluate(() => {
    const ds = document.querySelectorAll('#pmDrawer details.pmDrawerFold');
    ds.forEach((d) => { d.open = true; });
    return ds.length;
  });
  await sleep(240);
  return n;
}
async function scrollInnerToBottom(page) {
  await page.evaluate(() => { const i = document.getElementById('pmInner'); if (i) i.scrollTop = i.scrollHeight; });
  await sleep(180);
}
async function setInnerScroll(page, v) {
  const got = await page.evaluate((x) => {
    const i = document.getElementById('pmInner');
    if (!i) return -1;
    i.scrollTop = x;
    return i.scrollTop;
  }, v);
  await sleep(140);
  return got;
}

/* 引き出し・器・出発の口の幾何を 1 回で採る。 */
const GEO = `(function(){
  const q = (id) => document.getElementById(id);
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width }; };
  const d = q('pmDrawer'), inner = q('pmInner'), dep = q('pmDepart'), ap = q('pmDrawerAp'), eq = q('pmDrawerEquip');
  const cs = d ? getComputedStyle(d) : null;
  let hit = null;
  if (dep && !dep.hidden) {
    const b = dep.getBoundingClientRect();
    const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
    if (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
      const el = document.elementFromPoint(cx, cy);
      hit = !el ? '(none)' : ((el.id === 'pmDepart' || (el.closest && el.closest('#pmDepart'))) ? 'pmDepart'
             : (el.id || (el.className && String(el.className).split(' ')[0]) || el.tagName));
    } else { hit = '(offscreen)'; }
  }
  return {
    hasDrawer: !!d, drawerHidden: d ? !!d.hidden : true,
    sh: d ? d.scrollHeight : 0, ch: d ? d.clientHeight : 0,
    sw: d ? d.scrollWidth : 0, cw: d ? d.clientWidth : 0,
    borderY: cs ? (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)) : 0,
    drawerMaxH: cs ? cs.maxHeight : '', drawerOverflowY: cs ? cs.overflowY : '',
    drawerRect: r(d), innerRect: r(inner), apRect: r(ap), depRect: r(dep),
    eqSumRect: eq ? r(eq.querySelector('summary')) : null,
    depHidden: dep ? !!dep.hidden : true, hit: hit,
    innerScrollTop: inner ? inner.scrollTop : -1,
    innerScrollH: inner ? inner.scrollHeight : -1,
    innerClientH: inner ? inner.clientHeight : -1,
    innerOverflowY: inner ? getComputedStyle(inner).overflowY : '',
    departPos: dep ? getComputedStyle(dep).position : '',
    intelMaxH: q('pmIntelResultList') ? getComputedStyle(q('pmIntelResultList')).maxHeight : '(no el)',
    nOpenCards: document.querySelectorAll('#pmColumns .pmColumn.pmOpen').length,
    nDetailsOpen: document.querySelectorAll('#pmDrawer details.pmDrawerFold[open]').length,
    nDetails: document.querySelectorAll('#pmDrawer details.pmDrawerFold').length,
    seq: d ? Array.prototype.slice.call(d.children).map(
      (el) => el.id || (el.className ? String(el.className).split(' ')[0] : el.tagName)) : [],
    hasHead: !!(d && d.querySelector('.pmDrawerHead')),
    hasSkillList: !!q('pmDrawerSkillList'), hasEquip: !!q('pmDrawerEquip'), hasAp: !!q('pmDrawerAp'),
    bodyFitOff: document.body.classList.contains('pmFitOff'),
    vh: window.innerHeight, vw: window.innerWidth,
  };
})()`;
const geo = (page) => page.evaluate(GEO);

/* 保存の写し。⭐ selection と localStorage の**両方**。片方だけだと漏れを見落とす。 */
const SNAP = `(function(){
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  return { sel: JSON.stringify(selection), ls: JSON.stringify(ls, Object.keys(ls).sort()) };
})()`;

/* viewport 内に完全に収まっているか。⚠ 端数で 0.4px はみ出すことがあるので 1px 許容。 */
function fullyInView(rect, vh) {
  return !!rect && rect.top >= -1 && rect.bottom <= vh + 1 && rect.height > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
const VIEWS = [
  { tag: 'v1', name: 'デスクトップ 1280x900', width: 1280, height: 900 },
  { tag: 'v2', name: 'ノート 1366x768',       width: 1366, height: 768 },
  { tag: 'v3', name: 'iPhone 縦 390x844',     width: 390,  height: 844 },
  /* ⚠ V4 (極小) は最悪ケースの (2c) だけ対象外。中身 1503px を 667px の窓に入れるのは
     原理的に不可能 (依頼書 §2-4 の実測)。⛔ 黙って抜かず、ここに理由を書いておく。 */
  { tag: 'v4', name: '極小 390x667',          width: 390,  height: 667, skipWorstScroll: true },
];

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] port=' + PORT + ' root=' + ROOT + ' scenario=' + SCENARIO
    + (INJECTED.length ? ('  変異=' + INJECTED.join(',')) : ''));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
           '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + require('./_pptr_profile')('df_pptr_profile_pmdrawerfit_')],
  });

  try {
    /* ══ §0 装置 ══════════════════════════════════════════════════════════ */
    console.log('\n====== §0 装置 (先に母集団を確かめる) ======');
    const page = await openTavern(browser, VIEWS[0], null);
    const reach = await acceptToCinema(page, SCENARIO);
    console.log('  導線: ' + reach.steps.join(' > ') + '  (' + Math.round(reach.ms / 1000) + '秒)');
    check('(0a-0) 依頼 ' + SCENARIO + ' が解錠されていて #btnAccept が実際に発火した',
      reach.gate && reach.gate.found && reach.gate.unlocked && reach.gate.clicked, JSON.stringify(reach.gate));
    check('(0a-v0) #btnAccept の実クリックからマッチング画面が可視になった (出発の口まで開いた)',
      reach.reached, '経路=' + reach.steps.join('>') + ' / ' + Math.round(reach.ms / 1000) + '秒');
    if (!reach.reached) throw new Error('マッチング画面へ到達できないので以降が全部空振りになる。ここで止める。');

    /* ⭐ 保存の写し (§5d 用) —— 引き出しに一度も触っていないこの時点で採る。 */
    const snapBefore = await page.evaluate(SNAP);

    const hero = await findHeroCard(page);
    check('(0a-1) 主人公のカードを実体から引けた (⛔ 0 番決め打ちにしない)',
      hero.idx >= 0, 'idx=' + hero.idx + ' / カード ' + hero.n + ' 枚 / 見出し「' + hero.title.slice(0, 40) + '」');
    if (hero.idx < 0) throw new Error('主人公のカードが見つからない');

    /* ── 4 画面を回す ─────────────────────────────────────────────────── */
    for (const V of VIEWS) {
      console.log('\n------ ' + V.name + ' (' + V.tag + ') ------');
      /* 1) 引き出しを閉じ、折り畳み段を畳み直してから測る。
         ⚠⚠ ここを飛ばすと前の画面の最悪ケースが「素」として残る。 */
      await closeDrawerByButton(page);
      await page.setViewport({ width: V.width, height: V.height, deviceScaleFactor: 1 });
      await sleep(380);
      const foldReset = await resetFolds(page);

      /* 2) 開く前に器を 100px スクロールしておく (§3b / §3c の基準)。 */
      const s0 = await setInnerScroll(page, 100);

      /* 3) カードを押す = ここからが本番 */
      await clickCard(page, hero.idx);
      const gP = await geo(page);

      check('(0a-' + V.tag + ') カードを押すと引き出しが可視になり、開いているカードがちょうど 1 枚',
        !gP.drawerHidden && gP.nOpenCards === 1,
        'hidden=' + gP.drawerHidden + ' / pmOpen=' + gP.nOpenCards + ' / ' + gP.vw + 'x' + gP.vh);
      check('(0b-' + V.tag + ') 引き出しの中身が 400px 以上ある (潰れうるだけの中身が実在する)',
        gP.sh >= 400, 'scrollHeight=' + gP.sh);
      check('(0d-' + V.tag + ') 折り畳み段が既定どおり畳まれている (前の画面の最悪ケースが残っていない)',
        gP.nDetailsOpen === 0, 'open=' + gP.nDetailsOpen + '/' + gP.nDetails + ' foldReset=' + foldReset);

      /* ── §1 引き出しが自分の中で中身を切っていない ───────────────────── */
      check('(1a-' + V.tag + ') #pmDrawer が自分の中で中身を切っていない (scrollHeight - clientHeight === 0)',
        gP.sh - gP.ch === 0, 'scrollHeight=' + gP.sh + ' clientHeight=' + gP.ch + ' 差=' + (gP.sh - gP.ch)
          + ' / max-height=' + gP.drawerMaxH + ' overflow-y=' + gP.drawerOverflowY);
      /* ⭐ (1a) は clientHeight、(1b) は getBoundingClientRect —— 別 API で同じことを見る。
         ⚠ rect.height は border 込みなので border 分を引いてから比べる。依頼書 §8 の
           「差 <= 2」は border 1px×2 とちょうど同値で偶然通るだけなので、明示的に引く。 */
      const b1 = gP.drawerRect ? Math.abs(gP.drawerRect.height - gP.borderY - gP.sh) : 999;
      check('(1b-' + V.tag + ') 同じことを別経路で: rect.height - border === scrollHeight',
        b1 <= 1.5, 'rect.height=' + r1(gP.drawerRect && gP.drawerRect.height) + ' border=' + gP.borderY
          + ' scrollHeight=' + gP.sh + ' 差=' + r1(b1));

      /* ── §3 (3a) は「押した直後」の値なので gP から採る ───────────────── */
      const d3 = (gP.drawerRect && gP.innerRect) ? Math.abs(gP.drawerRect.top - gP.innerRect.top) : 999;
      check('(3a-' + V.tag + ') カードを押した直後、引き出しの頭が器の上端へ寄っている (差 <= 2px)',
        d3 <= 2, 'drawerTop=' + r1(gP.drawerRect && gP.drawerRect.top) + ' innerTop='
          + r1(gP.innerRect && gP.innerRect.top) + ' 差=' + r1(d3) + ' / innerScrollTop=' + r1(gP.innerScrollTop));

      /* ── §4 出発の口は死なない (素) ─────────────────────────────────── */
      check('(4a-' + V.tag + ') 引き出しを開いたまま #pmDepart が画面内で、中心のヒットが pmDepart',
        !gP.depHidden && fullyInView(gP.depRect, gP.vh) && gP.hit === 'pmDepart',
        'hidden=' + gP.depHidden + ' rect=' + (gP.depRect ? (r1(gP.depRect.top) + '..' + r1(gP.depRect.bottom)) : 'null')
          + ' vh=' + gP.vh + ' hit=' + gP.hit);
      check('(4b-' + V.tag + ') #pmDrawer が横スクロールを起こさない (scrollWidth <= clientWidth)',
        gP.sw <= gP.cw, 'scrollWidth=' + gP.sw + ' clientWidth=' + gP.cw);

      /* ── §2 器をスクロールすれば最下段まで届く ─────────────────────── */
      await scrollInnerToBottom(page);
      const gPB = await geo(page);
      check('(2a-' + V.tag + ') 器を最後までスクロールすると「傾向」段が完全に画面内に入る',
        fullyInView(gPB.apRect, gPB.vh),
        gPB.apRect ? ('ap top=' + r1(gPB.apRect.top) + ' bottom=' + r1(gPB.apRect.bottom) + ' vh=' + gPB.vh
          + ' innerScrollTop=' + r1(gPB.innerScrollTop)) : '#pmDrawerAp が無い');
      /* ⚠ V4 (390x667) だけは「最後まで送った状態」で原理的に入らない。装備段は引き出しの
         **途中**にあり、最下段 (傾向) を画面へ入れた時点で上へ 15px はみ出す
         (実測 top=-14.7)。⛔ 黙って抜かず、到達性を (2b2) で測り直す。 */
      if (V.skipWorstScroll) {
        pending('(2b-' + V.tag + ') 器を最後まで送った状態で装備段の summary も画面内',
          '⚠ 対象外 —— 装備段は引き出しの途中にあるので、最下段を入れると上へ出る'
            + (gPB.eqSumRect ? (' (top=' + r1(gPB.eqSumRect.top) + ')') : '') + '。到達性は (2b2) で測る');
      } else {
        check('(2b-' + V.tag + ') 同じ状態で「装備を替える」段の summary も画面内に入る',
          fullyInView(gPB.eqSumRect, gPB.vh),
          gPB.eqSumRect ? ('summary top=' + r1(gPB.eqSumRect.top) + ' bottom=' + r1(gPB.eqSumRect.bottom)) : '#pmDrawerEquip が無い');
      }
      /* (2b2) ⭐ 到達性 —— 「器をスクロールすれば装備段の頭を完全に読める」。
         ⚠ 依頼書 §8 の (2b) は「最下段まで送った同じ状態で」と書いていたが、装備段は
           引き出しの途中にあるので、その測り方は極小画面で原理的に成立しない。
           本来測りたいのは「読みに行けること」なので、実際に送ってから見る。 */
      await page.evaluate(() => {
        const i = document.getElementById('pmInner');
        const eq = document.getElementById('pmDrawerEquip');
        const sm = eq && eq.querySelector('summary');
        if (i && sm) i.scrollTop += sm.getBoundingClientRect().top - i.getBoundingClientRect().top;
      });
      await sleep(180);
      const g2b = await geo(page);
      check('(2b2-' + V.tag + ') 器をスクロールすれば装備段の summary を完全に画面内へ持ってこられる',
        fullyInView(g2b.eqSumRect, g2b.vh),
        g2b.eqSumRect ? ('summary top=' + r1(g2b.eqSumRect.top) + ' bottom=' + r1(g2b.eqSumRect.bottom)
          + ' innerScrollTop=' + r1(g2b.innerScrollTop)) : '#pmDrawerEquip が無い');

      /* ── 最悪ケース: 折り畳み段を全部開く ───────────────────────────── */
      const nFolds = await openAllFolds(page);
      const gW = await geo(page);
      check('(1c-' + V.tag + ') 折り畳み段を全部開いた最悪ケースでも中身を切っていない',
        gW.sh - gW.ch === 0,
        '段 ' + nFolds + ' 枚を展開 / scrollHeight=' + gW.sh + ' clientHeight=' + gW.ch + ' 差=' + (gW.sh - gW.ch));
      check('(4a-' + V.tag + 'w) 最悪ケースでも #pmDepart が画面内で、中心のヒットが pmDepart',
        !gW.depHidden && fullyInView(gW.depRect, gW.vh) && gW.hit === 'pmDepart',
        'rect=' + (gW.depRect ? (r1(gW.depRect.top) + '..' + r1(gW.depRect.bottom)) : 'null')
          + ' vh=' + gW.vh + ' hit=' + gW.hit + ' 引き出し ' + r1(gW.drawerRect && gW.drawerRect.height) + 'px');

      await scrollInnerToBottom(page);
      const gWB = await geo(page);
      if (V.skipWorstScroll) {
        /* ⚠ 対象外を黙って抜かない (次の人が母集団の痩せを疑う)。 */
        pending('(2c-' + V.tag + ') 最悪ケースで「傾向」段が画面内',
          '⚠ 対象外 —— 中身 ' + gWB.sh + 'px を ' + gWB.vh + 'px の窓に入れるのは原理的に不可能 (依頼書 §2-4)');
      } else {
        check('(2c-' + V.tag + ') 折り畳み段を全部開いた最悪ケースでも「傾向」段が画面内に入る',
          fullyInView(gWB.apRect, gWB.vh),
          gWB.apRect ? ('ap top=' + r1(gWB.apRect.top) + ' bottom=' + r1(gWB.apRect.bottom) + ' vh=' + gWB.vh
            + ' 引き出し ' + r1(gWB.drawerRect && gWB.drawerRect.height) + 'px') : 'なし');
      }

      /* ── §3 (3b) 閉じたら開く前の位置へ戻る ─────────────────────────
         ⭐ 「0 に戻る」実装だと赤くなる測り方にしてある (戻すのと先頭へ飛ぶのを取り違えない)。 */
      await resetFolds(page);
      const closed = await closeDrawerByButton(page);
      const gC = await geo(page);
      if (!(s0 > 0)) {
        pending('(3b-' + V.tag + ') 閉じると器のスクロールが開く前の値へ戻る',
          '器が 100px もスクロールできない (s0=' + s0 + ') ので原理的に測れない');
      } else {
        check('(3b-' + V.tag + ') 閉じると器のスクロールが開く前の値へ戻る (0 へ飛ばない)',
          closed && Math.abs(gC.innerScrollTop - s0) <= 2,
          '開く前=' + r1(s0) + ' 閉じた後=' + r1(gC.innerScrollTop) + ' (閉じるボタン=' + closed + ')');
      }

      /* ── §3 (3c) カード A → カード B と渡り歩いてから閉じても同じ値へ戻る ── */
      const other = (hero.idx + 1) % Math.max(1, hero.n);
      if (hero.n < 2) {
        pending('(3c-' + V.tag + ') カードを渡り歩いてから閉じても開く前の値へ戻る', 'カードが 1 枚しかない');
      } else {
        const s0b = await setInnerScroll(page, 100);
        await clickCard(page, hero.idx);
        await clickCard(page, other);
        await closeDrawerByButton(page);
        const gC2 = await geo(page);
        if (!(s0b > 0)) {
          pending('(3c-' + V.tag + ') カードを渡り歩いてから閉じても開く前の値へ戻る', 's0b=' + s0b);
        } else {
          check('(3c-' + V.tag + ') カード ' + hero.idx + '→' + other + ' と渡り歩いてから閉じても開く前の値へ戻る',
            Math.abs(gC2.innerScrollTop - s0b) <= 2,
            '開く前=' + r1(s0b) + ' 閉じた後=' + r1(gC2.innerScrollTop));
        }
      }
      await resetFolds(page);
      await closeDrawerByButton(page);
    }

    /* ══ §5 恒等 (非退行) ═══════════════════════════════════════════════ */
    console.log('\n====== §5 恒等 (非退行) ======');
    await page.setViewport({ width: VIEWS[0].width, height: VIEWS[0].height, deviceScaleFactor: 1 });
    await sleep(320);
    await resetFolds(page);
    await clickCard(page, hero.idx);
    const g5 = await geo(page);
    /* (5a) 段の並びと id。⛔ 表を写経しない —— 見出しは class (.pmDrawerHead) で **id が無い**。
       ⚠ 書庫段・召喚段はスクロール未所持だと丸ごと出ないので、必須は
         見出し → スキル段 → 装備段 → … → 傾向段 という相対順序と「傾向が最後」。 */
    const seq = g5.seq;
    const iHead  = seq.indexOf('pmDrawerHead');
    const iSkill = seq.indexOf('pmDrawerSec');          // スキル段は id を持たない (class だけ)
    const iEquip = seq.indexOf('pmDrawerEquip');
    const iAp    = seq.indexOf('pmDrawerAp');
    check('(5a) 引き出しの段の並びと id が着手前と同じ (見出し → スキル → 装備 → … → 傾向)',
      iHead === 0 && iSkill > iHead && iEquip > iSkill && iAp === seq.length - 1
        && g5.hasHead && g5.hasSkillList && g5.hasEquip && g5.hasAp,
      seq.join(' > '));
    /* (5b) ⛔ 触らない対象。17vh 相当のまま。 */
    const wantIntel = 0.17 * g5.vh;
    const gotIntel  = parseFloat(g5.intelMaxH);
    check('(5b) #pmIntelResultList の max-height が 17vh 相当のまま (⛔ 触らない対象)',
      isFinite(gotIntel) && Math.abs(gotIntel - wantIntel) <= 2,
      'computed=' + g5.intelMaxH + ' 期待=' + r1(wantIntel) + 'px (17vh of ' + g5.vh + ')');
    check('(5c) #pmInner の overflow-y が auto、#pmDepart の position が sticky のまま (⛔ 触らない対象)',
      g5.innerOverflowY === 'auto' && g5.departPos === 'sticky',
      '#pmInner overflow-y=' + g5.innerOverflowY + ' / #pmDepart position=' + g5.departPos);
    /* (5d) ⭐ 依頼書 §8 は「引き出しを一度も開かずに出発したとき 1 バイトも変わらない」と
       書いていたが、出発は departToScenario が 4 本のキーを**正当に**書くので原理的に
       成立しない。測るべき中身は「器の見た目を直しただけの変更が保存へ漏れていないか」
       なので、**開いて閉じるだけでは selection も localStorage も動かない**へ言い換えた。 */
    await resetFolds(page);
    await closeDrawerByButton(page);
    const snapAfter = await page.evaluate(SNAP);
    check('(5d) 引き出しを開いて閉じるだけでは selection も localStorage も 1 バイトも変わらない',
      snapBefore.sel === snapAfter.sel && snapBefore.ls === snapAfter.ls,
      'selection ' + (snapBefore.sel === snapAfter.sel ? '同じ' : '変わった')
        + ' / localStorage ' + (snapBefore.ls === snapAfter.ls ? '同じ' : '変わった'));
    await page.close();

    /* ══ §6 撤退スイッチ ?pmfit=0 ═══════════════════════════════════════ */
    console.log('\n====== §6 撤退スイッチ ?pmfit=0 ======');
    const OFF_VIEWS = [VIEWS[0], VIEWS[2]];   // V1 (基底 42vh) と V3 (compact 30vh)
    const pageOff = await openTavern(browser, OFF_VIEWS[0], 'pmfit=0');
    const reachOff = await acceptToCinema(pageOff, SCENARIO);
    check('(6a-0) ?pmfit=0 でもマッチング画面へ到達する', reachOff.reached,
      '経路=' + reachOff.steps.join('>') + ' / ' + Math.round(reachOff.ms / 1000) + '秒');
    if (!reachOff.reached) {
      OFF_VIEWS.forEach((V) => {
        pending('(6a-' + V.tag + ') ?pmfit=0 で引き出しが再び内側で切れる', 'マッチング画面へ到達できず');
        pending('(6b-' + V.tag + ') ?pmfit=0 では開いた直後に器がスクロールしない', 'マッチング画面へ到達できず');
        pending('(6c-' + V.tag + ') ?pmfit=0 でも #pmDepart は押せる', 'マッチング画面へ到達できず');
      });
    } else {
      const heroOff = await findHeroCard(pageOff);
      for (const V of OFF_VIEWS) {
        console.log('\n------ ?pmfit=0 / ' + V.name + ' (' + V.tag + ') ------');
        await closeDrawerByButton(pageOff);
        await pageOff.setViewport({ width: V.width, height: V.height, deviceScaleFactor: 1 });
        await sleep(380);
        await resetFolds(pageOff);
        await setInnerScroll(pageOff, 0);
        await clickCard(pageOff, heroOff.idx);
        const g = await geo(pageOff);
        /* ⭐ 「昔の姿へ戻った」の指紋は computed max-height。⛔ rect.height で測らない
           (box-sizing しだいで padding/border のぶんズレる)。 */
        const frac = (V.width <= 720) ? 0.30 : 0.42;
        const want = frac * g.vh;
        const got  = parseFloat(g.drawerMaxH);
        check('(6a-' + V.tag + ') ?pmfit=0 で引き出しが再び内側で切れ、'
          + (frac * 100) + 'vh に頭打ちになる',
          g.bodyFitOff && (g.sh - g.ch > 0) && isFinite(got) && Math.abs(got - want) <= 2,
          'body.pmFitOff=' + g.bodyFitOff + ' / max-height=' + g.drawerMaxH + ' (期待 ' + r1(want) + 'px)'
            + ' / scrollHeight=' + g.sh + ' clientHeight=' + g.ch + ' 切れ=' + (g.sh - g.ch)
            + ' / overflow-y=' + g.drawerOverflowY);
        check('(6b-' + V.tag + ') ?pmfit=0 では開いた直後に器がスクロールしない (scrollTop === 0)',
          g.innerScrollTop === 0, 'innerScrollTop=' + r1(g.innerScrollTop));
        check('(6c-' + V.tag + ') ?pmfit=0 でも #pmDepart が画面内で、中心のヒットが pmDepart',
          !g.depHidden && fullyInView(g.depRect, g.vh) && g.hit === 'pmDepart',
          'rect=' + (g.depRect ? (r1(g.depRect.top) + '..' + r1(g.depRect.bottom)) : 'null')
            + ' vh=' + g.vh + ' hit=' + g.hit);
      }
    }
    await pageOff.close();

  } catch (e) {
    console.error('\n[driver] 例外: ' + (e && e.stack ? e.stack : e));
    results.push({ name: '(driver) 例外なく走り切る', ok: false, pending: false, detail: String((e && e.message) || e) });
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  console.log('\n====== ページエラー ======');
  check('(9z) ページエラーが 0 件', pageErrors.length === 0, pageErrors.join(' | ') || 'なし');

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
