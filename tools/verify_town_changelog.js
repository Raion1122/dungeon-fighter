#!/usr/bin/env node
/* verify_town_changelog.js — #101 港町フランにも「📜 更新情報」の窓 (文面は js/changelog.js の 1 か所) の受入
 *
 *   node tools/verify_town_changelog.js                       ← 素の受入 (依頼書 §8 の全 assert)
 *   node tools/verify_town_changelog.js --negative            ← 負のコントロール 8 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_town_changelog.js --negative --only bubble
 *
 * 依頼書: 実装依頼書/2026-10-26_town-changelog.md §8 (受入条件の唯一の正)。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 文面は 3 経路で突き合わせる: (A) 配信した js/changelog.js の**テキスト**を Node 側の正規表現で抜いた配列 /
 *    (B) 酒場の DOM の <li> / (C) 港町の DOM の <li>。⛔ ページ内の window.DF_CHANGELOG を正にしない。
 *  - town.html / tavern.html / js/changelog.js / scripts/hooks/* は起動時に読み込んで凍結し、
 *    配信 (と使い捨てリポへの写し) はその凍結版から出す。負のコントロールは凍結版をメモリ上で差し替える。
 *    ⛔ 本番ファイルは 1 バイトも書き換えない。⚠ 走行中に本番を編集しないこと。
 *  - 配置は 3 画面 (1440x900 / 720x900 / 390x844 mobile) で getBoundingClientRect と elementFromPoint で見る。
 *  - チェック (§4) は OS の一時ディレクトリに git init した使い捨てリポで**実際に commit させて** exit code を見る。
 *    使い捨てリポは走行の最後に消す (本番リポには何も残さない)。
 *  - ⛔ 測らない (依頼書 §8 ⛔): 港町の箱の正確な座標・幅 / 文面の中身 (どの 4 件か)。
 *
 * ── 依頼書 §8 からの言い直し (notes101_item3.md に同じ記録) ─────────────────
 *  (1a)(1b) 文字列比較は (A) を一度 DOM の innerHTML に通して正規化してから比べる。
 *       素の `D&D` は innerHTML の直列化で `D&amp;D` になるため、生の文字列比較だと将来 (素の & を含む件が
 *       js に入った日に) 実装が正しくても赤になる (項目2 のプローブ --legacy で実測)。
 *  (1b) 依頼書は「酒場の 2〜4 件目 == de7617e の直書き 1〜3 件目」(§10 の 1 件が先頭に入った今日の姿)。
 *       これを「de7617e の 1 件目が酒場の k 件目 (k ≥ 0) にあり、そこから末尾まで de7617e の先頭と一致」に一般化した
 *       (今日は k = 1 = 依頼書どおり)。固定の k = 1 だと次の changelog 1 行で永久赤になり、以後のチケットの
 *       非退行 (STEP4) でこのドライバが使えなくなるため。k が見つからない (4 件以上新しく積まれた) 日のために
 *       (1b-hist) = 「移行コミット af45b85 の js/changelog.js の 4 件 == de7617e の直書き 4 件」(履歴は動かない) を併せて見る。
 *       ⚠ 4 件以上新しく積まれた日は (1b) が赤になる。そのときは (1b) を (1b-hist) だけへ畳むこと (期待を緩めるのではなく、
 *         比べる相手が画面から消えたため)。
 *  (2e) 「主人公のタイルが変わらない」に腕を 1 本足す: 見出し発のクリックが #townViewport (地図の歩きの click の聞き手) へ
 *       届いた回数 == 0。⚠ 腕 1 だけだと変異 bubble が 3 画面とも空振りした (クリックは viewport へ 2 回届いたが、
 *       見出しの真下のタイルでは walkTo が動かず、主人公のタイルは (10,3) のまま = 実測 2026-10-26)。
 *  (2b) 箱の矩形は畳んだ状態と開いた状態の両方で見る (開いたときも帯・戻る・シート・HUD に被らない)。
 *  (3a) ⚠ 酒場 1440 の高さは文面の長さで決まる (max-height 38vh で頭打ち。今日 [1140,20,1420,343]、
 *       de7617e の 4 件で [1140,20,1420,360])。期待値を文面に依存させないため、依頼書 §8 (3a) の注記どおり
 *       「left / top / right を ±1」「bottom ≤ de7617e の 4 件の bottom + 1」と、
 *       「de7617e の 4 件を配信 js に入れた変異 (legacy) で [1140,20,1420,360] ±1 に戻る」の 2 本で縛る。
 *       390 は畳んで出るので文面に依らず [230,20,370,69] ±1 を丸ごと見る。
 *  (0c) 「止まる」に加え、止めたのが本物のフック (stderr に check_changelog.py の文言) であることを見る。
 *  §4  使い捨てリポには依頼書の 3 つ (scripts/hooks/・js/changelog.js・空の index.html) に加えて
 *       tools/a.txt (4d 用) と最小の tavern.html (`<ul class="changelogList"></ul>` 1 行) を置く。
 *       後者は変異 hook-tavern (比較対象を酒場の <ul> へ戻す) が「HEAD に無いので移行として通す」
 *       経路に逃げず、旧来の比較そのものとして働くため。
 *  (5a) 3 画面すべてで見る。(5b) は 1440 で ?townlog=0 の港町から酒場の看板を実際に押して遷移させる。
 *  (err) pageerror / console error 0 件 (favicon の 404 だけ除外)。装置の健全性として各画面で見る。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10640 だけを順に使う。
 *  - アンカーは**手つかずの凍結版**で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ長さ / 改行を含む / 置換文字列が原本に既に在る なら exit 3 (空振りで緑にしない)。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *  - hook-silent は「目印が見つからない」分岐を `if False and (...)` で殺す = 旧来の「判定不能なら通す」と同じ挙動
 *    (目印不在 → None ≠ HEAD の文字列 → 「違うので通す」へ落ちる)。⭐ 依頼書 §2-2 の罠そのもの。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート / git / py) / 3 = 変異アンカーの腐敗
 * port: 10640 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10640'), 10);
const T0 = Date.now();

const LEGACY_REV = 'de7617e';      // 移し替え前 (酒場に直書き 4 件) — 依頼書 §8 (1b)(3a)
const MIGRATE_REV = 'af45b85';     // 移行コミット (js/changelog.js 新設) — (1b-hist)

/* ══ 凍結版 ══ */
const FROZEN_FILES = ['town.html', 'tavern.html', 'js/changelog.js', 'scripts/hooks/check_changelog.py', 'scripts/hooks/pre-commit'];
const PRISTINE = {};
for (const f of FROZEN_FILES) {
  try { PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
  catch (e) { console.error('[driver] ' + f + ' が読めません'); process.exit(2); }
}

function gitShow(spec) {
  try { return execFileSync('git', ['-C', ROOT, 'show', spec], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { console.error('[driver] git show ' + spec + ' に失敗: ' + e.message); process.exit(2); }
}
/* de7617e の酒場の直書き <li> (生の文字列) */
const LEGACY = (() => {
  const t = gitShow(LEGACY_REV + ':tavern.html');
  const m = t.match(/<ul class="changelogList">([\s\S]*?)<\/ul>/);
  if (!m) { console.error('[driver] ' + LEGACY_REV + ':tavern.html に changelogList が見つかりません'); process.exit(3); }
  const items = [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
  if (items.length !== 4 || items.some((s) => /[\r\n]/.test(s))) { console.error('[driver] ' + LEGACY_REV + ' の直書きが 4 件・1 行ずつではない: ' + items.length); process.exit(3); }
  return items;
})();

/* (A) js/changelog.js のテキスト → 配列。⚠ add_changelog.py / check_changelog.py と同じ目印。§4 (4e) も同じ関数で読む */
const BLOCK_RE = /\/\* CHANGELOG:BEGIN \*\/([\s\S]*?)\/\* CHANGELOG:END \*\//;
function parseA(text) {
  const m = String(text).match(BLOCK_RE);
  if (!m) return { ok: false, items: [], why: '目印が見つからない' };
  const items = [];
  for (const line of m[1].split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    try { items.push(JSON.parse(line.replace(/,$/, ''))); } catch (e) { return { ok: false, items, why: 'JSON でない行: ' + line.slice(0, 80) }; }
  }
  return { ok: true, items };
}
function withItems(jsText, items) {
  return jsText.replace(/(\/\* CHANGELOG:BEGIN \*\/\r?\n)[\s\S]*?(\/\* CHANGELOG:END \*\/)/,
    (_, a, b) => a + items.map((s) => '  ' + JSON.stringify(s) + ',\r\n').join('') + b);
}

/* ══ 負のコントロール (依頼書 §8 の表)。edits = [[file, anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める ══ */
const LEGACY_LIS = LEGACY.map((s) => '<li>' + s + '</li>').join('');
const MUTATIONS = {
  'town-copy': { expect: ['(1a)', '(1c)'], why: '港町の <ul> に直書き <li> (de7617e の 4 件 = 1 件古い) を入れ、dfFillChangelog を呼ばない',
    edits: [['town.html', '    <ul class="changelogList"></ul>', '    <ul class="changelogList">' + LEGACY_LIS + '</ul><!-- mut-town-copy -->'],
            ['town.html', '      if (window.dfFillChangelog) window.dfFillChangelog(box.querySelector(".changelogList"));', '      /* mut-town-copy: dfFillChangelog を呼ばない */']] },
  'tavern-static': { expect: ['(1c)'], why: '酒場の <ul> に de7617e の直書き 4 件を戻し、dfFillChangelog を呼ばない',
    edits: [['tavern.html', '      <ul class="changelogList"></ul>', '      <ul class="changelogList">' + LEGACY_LIS + '</ul><!-- mut-tavern-static -->'],
            ['tavern.html', "        if (window.dfFillChangelog) window.dfFillChangelog(box.querySelector('.changelogList'));", '        /* mut-tavern-static: dfFillChangelog を呼ばない */']] },
  'town-open': { expect: ['(2a)', '(2c)@b720'], why: '港町の箱の class="collapsed" を外す (開いて出す)',
    edits: [['town.html', '  <div id="changelogBox" class="collapsed">', '  <div id="changelogBox" class="">']] },
  'town-top20': { expect: ['(2b)'], why: '港町の箱を top:20px (酒場と同じ) に置く',
    edits: [['town.html', '      top: calc(75px + env(safe-area-inset-top, 0px)); right: 10px;', '      top: 20px; right: 10px;  /* mut-town-top20 */'],
            ['town.html', '      top: calc(69px + env(safe-area-inset-top, 0px));', '      top: 20px;  /* mut-town-top20 */']] },
  'no-vars': { expect: ['(2f)'], why: '港町の :root に足した 4 変数を消す (§2-4)',
    edits: [['town.html', '      --parchment-bg: linear-gradient(135deg, #f1e2bb 0%, #e9d49a 50%, #d8bc7e 100%);', '      /* mut-no-vars bg */'],
            ['town.html', '      --parchment-ink-soft: #5a4323;', '      /* mut-no-vars ink-soft */'],
            ['town.html', '      --parchment-border: #8b6914;', '      /* mut-no-vars border */'],
            ['town.html', '      --parchment-shadow: 0 0 12px rgba(40,20,0,0.6), inset 0 0 20px rgba(120,80,30,0.25);', '      /* mut-no-vars shadow */']] },
  'bubble': { expect: ['(2e)'], why: '見出しの ev.stopPropagation() を消し、#changelogBox を #townViewport の中へ移す',
    edits: [['town.html', '        ev.stopPropagation();', '        /* mut-bubble: stopPropagation 無し */'],
            ['town.html', '    <ul class="changelogList"></ul>', '    <ul class="changelogListGone"></ul><!-- mut-bubble: 元の箱 ((1c) を巻き込まない) -->'],
            ['town.html', '  <div id="changelogBox" class="collapsed">', '  <div id="changelogBoxGone" class="collapsed" style="display:none"><!-- mut-bubble: 元の箱 -->'],
            ['town.html', '  <div id="townViewport">', '  <div id="townViewport"><div id="changelogBox" class="collapsed"><div class="changelogHeader">📜 更新情報</div><ul class="changelogList"></ul></div><!-- mut-bubble -->']] },
  'hook-silent': { expect: ['(4c)'], why: '⭐ §2-2 の罠: ステージ版で目印が見つからなくても止めない (旧来の「判定不能なら通す」)',
    edits: [['scripts/hooks/check_changelog.py', '    if staged_block is MISSING or staged_block is None or head_block is None:',
             '    if False and (staged_block is MISSING or staged_block is None or head_block is None):  # mut-hook-silent']] },
  'hook-tavern': { expect: ['(4a)|(4b)'], why: 'チェックの比較対象を旧来の tavern.html の <ul> に戻す',
    edits: [['scripts/hooks/check_changelog.py', 'SOURCE = "js/changelog.js"', 'SOURCE = "tavern.html"  # mut-hook-tavern'],
            ['scripts/hooks/check_changelog.py', 'BLOCK_RE = re.compile(r"/\\* CHANGELOG:BEGIN \\*/(.*?)/\\* CHANGELOG:END \\*/", re.S)',
             'BLOCK_RE = re.compile(r\'<ul class="changelogList">(.*?)</ul>\', re.S)  # mut-hook-tavern']] },
};
const MUT_ORDER = ['town-copy', 'tavern-static', 'town-open', 'town-top20', 'no-vars', 'bubble', 'hook-silent', 'hook-tavern'];

/* 起動時の検算 (素の走行でも必ず) */
for (const k of MUT_ORDER) {
  for (const [file, anchor, patch] of MUTATIONS[k].edits) {
    const hits = PRISTINE[file].split(anchor).length - 1;
    if (hits !== 1) {
      console.error('[driver] 負のコントロール ' + k + ' の注入点が ' + file + ' に ' + hits + ' 箇所 (期待 1)。変異は無効です: ' + anchor.slice(0, 160));
      process.exit(3);
    }
    if (anchor === patch || anchor.length === patch.length || /[\r\n]/.test(anchor + patch)) {
      console.error('[driver] ' + k + ' は置換前後が同一 / 同じ長さ / 改行を含みます'); process.exit(3);
    }
    if (PRISTINE[file].indexOf(patch) >= 0) { console.error('[driver] ' + k + ' の置換文字列が原本に既に在る'); process.exit(3); }
  }
}
for (const k of ONLY) if (!MUTATIONS[k]) { console.error('[driver] 未知の --only: ' + k + '  (' + MUT_ORDER.join(',') + ')'); process.exit(3); }

const SNAP = Object.assign({}, PRISTINE);   // 配信と使い捨てリポの写しはここから
function inject(tag) {
  const m = MUTATIONS[tag];
  for (const [file, anchor, patch] of m.edits) {
    const now = SNAP[file].split(anchor).length - 1;
    if (now !== 1) { console.error('[driver] ' + tag + ': 先行の置換の後で注入点が ' + now + ' 箇所 (期待 1)'); process.exit(3); }
    SNAP[file] = SNAP[file].split(anchor).join(patch);
  }
  console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (' + m.why + ' / 置換 ' + m.edits.length + ' 本)');
}

/* ══ --negative 一括 = 子プロセスを直列・同 port ══ */
if (NEGATIVE && !ONLY.length) {
  const bad = [], summary = [];
  console.log('[driver] --negative (一括): ' + MUT_ORDER.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of MUT_ORDER) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const t1 = Date.now();
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + ' (' + Math.round((Date.now() - t1) / 1000) + ' 秒)' + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - T0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + MUT_ORDER.length + '/' + MUT_ORDER.length + ' 本すべて担当の節が赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  if (ONLY.length !== 1) { console.error('[driver] --only には変異を 1 つ: ' + MUT_ORDER.join(',')); process.exit(1); }
  inject(ONLY[0]);
}

/* ══ 器 (サーバ・ブラウザ) ══ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
let SERVE_LEGACY_JS = false;     // (3a) の legacy 変異 = 配信 js の 4 件を de7617e の直書き 4 件に差し替える
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/town.html';
        const rel = u.replace(/^\/+/, '');
        rs.setHeader('Cache-Control', 'no-store');
        if (Object.prototype.hasOwnProperty.call(SNAP, rel)) {
          rs.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          rs.end(rel === 'js/changelog.js' && SERVE_LEGACY_JS ? withItems(SNAP[rel], LEGACY) : SNAP[rel]);
          return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, '127.0.0.1', () => res(s));
  });
}

/* ══ 判定の記録。label = 節 ((2c) など)、scr = 画面 (d1440 / b720 / m390 / null) ══ */
const results = [];
function check(label, scr, name, cond, detail) {
  const ok = !!cond;
  const d = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  results.push({ label, scr, name, ok, detail: d });
  console.log((ok ? '  PASS ' : '  FAIL ') + label + (scr ? ' [' + scr + ']' : '') + ' ' + name + (d ? '  -- ' + d.slice(0, 700) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inter = (a, b) => !!a && !!b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const near = (a, b, tol) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function openPage(browser, url, vp) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let u = ''; try { u = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;
    errs.push('console: ' + m.text() + (u ? ' <' + u + '>' : ''));
  });
  await page.setViewport({ width: vp.w, height: vp.h, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1 });
  /* ⚠ same-origin の storage は遷移をまたいで生き残る。document-start で dragonfighters 接頭辞を purge してから
     この試験に要る値だけを置く (入れないとプロローグが被る)。purge は 1 タブ 1 回 (遷移で消さない)。 */
  await page.evaluateOnNewDocument(() => {
    try {
      if (sessionStorage.getItem('__drvSeeded')) return;
      sessionStorage.setItem('__drvSeeded', '1');
      for (const st of [localStorage, sessionStorage]) {
        const kill = [];
        for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
        kill.forEach((k) => st.removeItem(k));
      }
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.plazaState', JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }));
      sessionStorage.setItem('dragonfighters.plazaClock', '21');   /* ★[#102] 闇市は夜だけ開く。時計で揺れないよう夜に固定 */
    } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + PORT + url, { waitUntil: 'load', timeout: 30000 });
  return { page, errs };
}
async function waitTown(page) {
  await page.waitForFunction("window.__town && typeof window.__town.heroTile === 'function'", { timeout: 20000 });
  await sleep(500);
}
/* (A) を DOM の innerHTML に通して正規化する (素の & → &amp;) */
async function normalize(page, arr) {
  return page.evaluate((a) => a.map((s) => { const d = document.createElement('li'); d.innerHTML = s; return d.innerHTML; }), arr);
}
/* 4 施設が押せる数 (compact = #townHud のボタン / それ以外 = 看板。verify_town_map (11b) と同じ判定) */
const REACH_FN = () => {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const clickable = (el) => { const b = el.getBoundingClientRect(); if (b.width < 8 || b.height < 8) return false;
    if (b.right <= 0 || b.bottom <= 0 || b.left >= vw || b.top >= vh) return false;
    const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return !!hit && (hit === el || el.contains(hit)); };
  const els = window.__town.compact() ? [...document.querySelectorAll('#townHud button')] : [...document.querySelectorAll('.townSign')];
  return { n: els.length, reach: els.filter(clickable).length, miss: els.filter((e) => !clickable(e)).map((e) => e.id || e.textContent.trim().slice(0, 10)) };
};
const R4 = (b) => b ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null;

const VPS = [{ scr: 'd1440', w: 1440, h: 900, mobile: false }, { scr: 'b720', w: 720, h: 900, mobile: false }, { scr: 'm390', w: 390, h: 844, mobile: true }];

/* ══ §2 港町の窓 (1 画面) ══ */
async function townScreen(browser, vp, A) {
  const S = vp.scr;
  const o = await openPage(browser, '/town.html', vp);
  try {
    await waitTown(o.page);
    const s = await o.page.evaluate((R4src) => {
      const R4 = eval(R4src);
      const g = (id) => { const e = document.getElementById(id); return e ? R4(e.getBoundingClientRect()) : null; };
      const box = document.getElementById('changelogBox');
      const list = box ? box.querySelector('.changelogList') : null;
      return { compact: window.__town.compact(), has: !!box, collapsed: !!box && box.classList.contains('collapsed'),
        listDisp: list ? getComputedStyle(list).display : null, box: g('changelogBox'), title: g('townTitle'), back: g('townBack'),
        sheet: g('dfSheetBtn'), hud: window.__town.compact() ? g('townHud') : null,
        vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
        signs: document.querySelectorAll('.townSign').length,
        lis: list ? [...list.querySelectorAll('li')].map((l) => l.innerHTML) : null };
    }, R4.toString());
    check('(0b)', S, '看板 .townSign が 4 枚・#townTitle の高さ > 0 (矩形の検査が空振りしていない)',
      s.signs === 4 && !!s.title && s.title[3] - s.title[1] > 0, { signs: s.signs, title: s.title });
    const normA = await normalize(o.page, A);
    check('(1a)', S, '港町の <li> (C) == js (A) (件数・順・innerHTML。(A) は innerHTML 往復で正規化)',
      A.length === 4 && eq(s.lis, normA), { n: s.lis && s.lis.length, diff: (s.lis || []).map((x, i) => x === normA[i] ? null : i).filter((x) => x !== null) });
    check('(2a)', S, '開いた直後は collapsed・リストは display:none', s.has && s.collapsed && s.listDisp === 'none', { collapsed: s.collapsed, listDisp: s.listDisp });
    const inScreen = (b) => !!b && b[0] >= 0 && b[1] >= 0 && b[2] <= s.vw && b[3] <= s.vh;
    const others = { title: s.title, back: s.back, sheet: s.sheet, hud: s.hud };
    const hitList = (b) => Object.keys(others).filter((k) => inter(b, others[k]));
    check('(2b)', S, '畳んだ箱が画面内・#townTitle/#townBack/#dfSheetBtn' + (s.compact ? '/#townHud' : '') + ' と交わらない',
      s.has && inScreen(s.box) && hitList(s.box).length === 0, Object.assign({ box: s.box, hits: hitList(s.box) }, others));
    const rc = await o.page.evaluate(REACH_FN);
    check('(2c)', S, '4 施設が押せる (' + (s.compact ? '#townHud のボタン' : '看板') + ' の中心の elementFromPoint)', rc.n === 4 && rc.reach === 4, rc);

    /* (2d)(2e)(2f)(2g) 見出しを押して開く → もう一度で畳む */
    /* (2e) の腕 2: 見出し発のクリックが #townViewport (地図の歩きの click を聞いている要素) へ届いた回数。
       ⚠ 腕 1 (主人公のタイル) だけだと、見出しの真下のタイルが歩けない画面では伝播が漏れても動かず空振りする
       (変異 bubble で 3 画面とも実測: タイル不変のまま)。 */
    await o.page.evaluate(() => {
      window.__drvVpHits = 0;
      const vpEl = document.getElementById('townViewport');
      if (vpEl) vpEl.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#changelogBox')) window.__drvVpHits++; });
    });
    const before = await o.page.evaluate(() => window.__town.heroTile());
    const hdr = await o.page.evaluate(() => {
      const h = document.querySelector('#changelogBox .changelogHeader'); if (!h) return null;
      const b = h.getBoundingClientRect(); const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      return { cx, cy, self: hit === h, hit: hit ? (hit.id || hit.className || hit.tagName) : null };
    });
    let op = null, cl = null;
    if (hdr) {
      if (vp.mobile) await o.page.touchscreen.tap(hdr.cx, hdr.cy); else await o.page.mouse.click(hdr.cx, hdr.cy);
      await sleep(800);
      op = await o.page.evaluate((R4src) => {
        const R4 = eval(R4src);
        const box = document.getElementById('changelogBox'); const list = box.querySelector('.changelogList');
        return { collapsed: box.classList.contains('collapsed'), listDisp: getComputedStyle(list).display,
          liN: list.querySelectorAll('li').length, box: R4(box.getBoundingClientRect()),
          bg: getComputedStyle(box).backgroundImage, tile: window.__town.heroTile(), moving: window.__town.isMoving() };
      }, R4.toString());
      if (vp.mobile) await o.page.touchscreen.tap(hdr.cx, hdr.cy); else await o.page.mouse.click(hdr.cx, hdr.cy);
      await sleep(800);
      cl = await o.page.evaluate(() => ({ collapsed: document.getElementById('changelogBox').classList.contains('collapsed'),
        tile: window.__town.heroTile(), moving: window.__town.isMoving(), vpHits: window.__drvVpHits }));
    }
    check('(2d)', S, '見出しの中心の elementFromPoint が見出し自身 → 押すと開いてリストが見え <li> 4 件 → もう一度で畳む',
      !!hdr && hdr.self && !!op && !op.collapsed && op.listDisp !== 'none' && op.liN === 4 && !!cl && cl.collapsed,
      { hdr, open: op && { collapsed: op.collapsed, listDisp: op.listDisp, liN: op.liN }, closedAgain: cl && cl.collapsed });
    check('(2e)', S, '見出しを 2 回押しても主人公のタイルが変わらない・歩き出さない・クリックが #townViewport へ 0 回 (地図の歩きへ抜けていない)',
      !!op && !!cl && eq(op.tile, before) && eq(cl.tile, before) && !op.moving && !cl.moving && cl.vpHits === 0,
      { before, afterOpen: op && op.tile, afterClose: cl && cl.tile, moving: [op && op.moving, cl && cl.moving], vpHits: cl && cl.vpHits });
    check('(2f)', S, '開いた箱の背景が透明でない (backgroundImage !== none)', !!op && !!op.bg && op.bg !== 'none', op && op.bg.slice(0, 60));
    check('(2b)', S, '開いた箱も画面内・帯/戻る/シート' + (s.compact ? '/HUD' : '') + ' と交わらない',
      !!op && inScreen(op.box) && hitList(op.box).length === 0, op && { box: op.box, hits: hitList(op.box) });
    if (s.compact) check('(2g)', S, 'compact で開いたとき箱の下端 ≤ #townHud の上端', !!op && !!s.hud && op.box[3] <= s.hud[1], op && (op.box[3] + ' <= ' + (s.hud && s.hud[1])));
    check('(err)', S, '港町の pageerror / console error 0 件 (favicon 除く)', o.errs.length === 0, o.errs.slice(0, 4).join(' | ') || '(なし)');
  } finally { await o.page.close(); }

  /* §5 (5a) 撤退 */
  const o2 = await openPage(browser, '/town.html?townlog=0', vp);
  try {
    await waitTown(o2.page);
    const t = await o2.page.evaluate((fnSrc) => ({ has: !!document.getElementById('changelogBox'), rc: eval('(' + fnSrc + ')')() }), REACH_FN.toString());
    check('(5a)', S, 'town.html?townlog=0 → #changelogBox が DOM に無い・4 施設が押せる', !t.has && t.rc.n === 4 && t.rc.reach === 4, t);
  } finally { await o2.page.close(); }
}

/* ══ §3 酒場の恒等 + §1 (1a)(1b) ══ */
async function tavernPage(browser, vp) {
  const o = await openPage(browser, '/tavern.html', vp);
  try {
    await o.page.waitForFunction(() => !!document.getElementById('changelogBox'), { timeout: 20000 });
    await sleep(1500);
    const t = await o.page.evaluate((R4src) => {
      const R4 = eval(R4src);
      const box = document.getElementById('changelogBox');
      return { box: R4(box.getBoundingClientRect()), collapsed: box.classList.contains('collapsed'),
        lis: [...box.querySelectorAll('.changelogList li')].map((l) => l.innerHTML) };
    }, R4.toString());
    return { t, page: o.page, errs: o.errs };
  } catch (e) { await o.page.close(); throw e; }
}

/* ══ §4 チェック (使い捨てリポで実 commit) ══ */
function cleanEnv() { const e = Object.assign({}, process.env); for (const k of Object.keys(e)) if (/^GIT_/.test(k)) delete e[k]; return e; }
function findPy() {
  for (const c of [['py', ['-3']], ['python', []], ['python3', []]]) {
    const r = spawnSync(c[0], c[1].concat(['--version']), { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  console.error('[driver] Python が見つかりません'); process.exit(2);
}
function hookSection() {
  const PY = findPy();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df_tcl101_'));
  const D = path.join(tmp, 'repo');
  const env = cleanEnv();
  const g = (...a) => spawnSync('git', a, { cwd: D, encoding: 'utf8', env });
  const commit = (msg) => { const r = g('commit', '-q', '-m', msg); return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\s+/g, ' ').trim() }; };
  const addCl = (file, text) => spawnSync(PY[0], PY[1].concat([path.join(ROOT, 'tools', 'add_changelog.py'), '--file', file, text]), { encoding: 'utf8', env });
  const W = (rel, s) => { fs.mkdirSync(path.dirname(path.join(D, rel)), { recursive: true }); fs.writeFileSync(path.join(D, rel), s); };
  const A_ = (rel, s) => fs.appendFileSync(path.join(D, rel), s);
  const restore = () => { g('reset', '-q'); g('checkout', '-q', '--', '.'); };
  try {
    W('scripts/hooks/pre-commit', SNAP['scripts/hooks/pre-commit']);
    W('scripts/hooks/check_changelog.py', SNAP['scripts/hooks/check_changelog.py']);
    W('js/changelog.js', PRISTINE['js/changelog.js']);
    W('index.html', '');
    W('tools/a.txt', 'x\n');
    W('tavern.html', '<ul class="changelogList"></ul>\n');
    let r = g('init', '-q'); if (r.status !== 0) { console.error('[driver] git init に失敗: ' + r.stderr); process.exit(2); }
    g('config', 'user.email', 'drv@local'); g('config', 'user.name', 'drv'); g('config', 'core.hooksPath', 'scripts/hooks');
    g('config', 'core.autocrlf', 'false'); g('config', 'commit.gpgsign', 'false');
    g('add', '-A');
    const c0 = commit('init');
    if (c0.code !== 0) { console.error('[driver] 使い捨てリポの初回 commit に失敗: ' + c0.out); process.exit(2); }

    /* (0c) / (4a) index.html だけ */
    A_('index.html', ' \n'); g('add', 'index.html');
    let c = commit('0c-index-only');
    check('(0c)', null, '[装置] 使い捨てリポで index.html だけ変えた commit が止まり、止めたのは check_changelog.py (stderr の文言)',
      c.code !== 0 && /js\/changelog\.js/.test(c.out) && /⛔/.test(c.out), c);
    check('(4a)', null, 'index.html だけ変えた commit → 止まる (exit ≠ 0)', c.code !== 0, c);
    restore();

    /* (4b) index.html + add_changelog.py */
    A_('index.html', ' \n');
    const ac = addCl(path.join(D, 'js', 'changelog.js'), '<b>ドライバ</b> — 4b');
    g('add', 'index.html', 'js/changelog.js');
    c = commit('4b-index+add');
    check('(4b)', null, 'index.html + py tools/add_changelog.py --file <tmp>/js/changelog.js → 通る', ac.status === 0 && c.code === 0, { add: ac.status, commit: c });
    restore();

    /* (4c) index.html + BEGIN 行を壊す */
    A_('index.html', ' \n');
    { const f = path.join(D, 'js', 'changelog.js'); const s = fs.readFileSync(f, 'utf8');
      if (s.indexOf('/* CHANGELOG:BEGIN */') < 0) { console.error('[driver] (4c) の注入点 (BEGIN) が無い'); process.exit(3); }
      fs.writeFileSync(f, s.replace('/* CHANGELOG:BEGIN */', '/* CHANGELOG:BEGN */')); }
    g('add', 'index.html', 'js/changelog.js');
    c = commit('4c-begin-broken');
    check('(4c)', null, 'index.html + js/changelog.js の BEGIN 行を壊した commit → 止まる (§2-2)', c.code !== 0, c);
    restore();

    /* (4d) tools/ だけ */
    A_('tools/a.txt', 'y\n'); g('add', 'tools/a.txt');
    c = commit('4d-tools-only');
    check('(4d)', null, 'tools/ だけ変えた commit → 通る (トリガー外)', c.code === 0, c);
    restore();

    /* (4e) add_changelog.py を 5 回 (別の写し) */
    const f5 = path.join(tmp, 'cl5.js');
    fs.writeFileSync(f5, PRISTINE['js/changelog.js']);
    const sts = [];
    for (let i = 1; i <= 5; i++) sts.push(addCl(f5, '<b>ドライバ ' + i + '</b> — 4e').status);
    const p5 = parseA(fs.readFileSync(f5, 'utf8'));
    check('(4e)', null, 'add_changelog.py を 5 回 → 件数 4・先頭が最新 (5→4→3→2)・(A) と同じ正規表現で読める',
      sts.every((x) => x === 0) && p5.ok && p5.items.length === 4 && eq(p5.items, [5, 4, 3, 2].map((i) => '<b>ドライバ ' + i + '</b> — 4e')),
      { status: sts, parse: p5.ok, items: p5.items });
    const log = g('log', '--oneline').stdout.trim().split(/\r?\n/);
    console.log('  [§4] 使い捨てリポの履歴: ' + log.join(' / '));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { console.log('  [§4] ⚠ 一時ディレクトリを消せませんでした: ' + tmp); }
  }
}

/* ══ 本体 ══ */
(async () => {
  if (NEGATIVE) console.log('[driver] 変異 ' + ONLY[0] + ' で走行');
  /* §0 (0a) / §1 (1c) / (1b-hist) — ブラウザ不要 */
  let server;
  try { server = await startServer(); }
  catch (e) { console.error('[driver] port ' + PORT + ' を開けません (' + e.code + ')。孤児の node が掴んでいないか確認'); process.exit(2); }
  const fetchText = async (rel) => (await fetch('http://127.0.0.1:' + PORT + '/' + rel)).text();
  const Ap = parseA(await fetchText('js/changelog.js'));
  const A = Ap.items;
  check('(0a)', null, '[装置] 配信した js/changelog.js から (A) を正規表現で抜くと 4 件・各件に <b>', Ap.ok && A.length === 4 && A.every((s) => s.indexOf('<b>') >= 0), { ok: Ap.ok, why: Ap.why, n: A.length });
  for (const f of ['tavern.html', 'town.html']) {
    const t = await fetchText(f);
    const blocks = [...t.matchAll(/<ul class="changelogList">([\s\S]*?)<\/ul>/g)];
    const lis = blocks.reduce((a, m) => a + (m[1].match(/<li[\s>]/g) || []).length, 0);
    check('(1c)', null, '配信 ' + f + ' の changelogList (1 個) の中に直書き <li> が 0 件', blocks.length === 1 && lis === 0, { ul: blocks.length, li: lis });
  }
  const hist = parseA(gitShow(MIGRATE_REV + ':js/changelog.js'));
  check('(1b-hist)', null, '移行コミット ' + MIGRATE_REV + ' の js/changelog.js の 4 件 == ' + LEGACY_REV + ' の酒場の直書き 4 件 (生の文字列)', hist.ok && eq(hist.items, LEGACY), { n: hist.items.length });

  /* §4 */
  console.log('\n--- §4 チェック (使い捨てリポ) ---');
  hookSection();

  const pptr = loadPuppeteer();
  let browser;
  try { browser = await pptr.launch({ executablePath: findBrowser(), headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); }
  catch (e) { console.error('[driver] ブラウザ起動に失敗: ' + e.message); try { server.close(); } catch (x) {} process.exit(2); }
  try {
    for (const vp of VPS) { console.log('\n--- 港町 ' + vp.scr + ' ---'); await townScreen(browser, vp, A); }

    console.log('\n--- 酒場 ---');
    /* legacy 変異: de7617e の 4 件を配信 js に入れた 1440 の矩形 ((3a) の基準) */
    SERVE_LEGACY_JS = true;
    let leg;
    try { leg = await tavernPage(browser, VPS[0]); await leg.page.close(); } finally { SERVE_LEGACY_JS = false; }
    check('(3a)', 'd1440', '[legacy] de7617e の 4 件を配信 js に入れると酒場の矩形が [1140,20,1420,360] ±1 に戻る', near(leg.t.box, [1140, 20, 1420, 360], 1), leg.t.box);
    for (const [vp, expCollapsed] of [[VPS[0], false], [VPS[2], true]]) {
      const S = vp.scr;
      const r = await tavernPage(browser, vp);
      try {
        const t = r.t;
        const normA = await normalize(r.page, A);
        const normL = await normalize(r.page, LEGACY);
        check('(1a)', S, '酒場の <li> (B) == js (A) (件数・順・innerHTML。(A) は innerHTML 往復で正規化)', A.length === 4 && eq(t.lis, normA),
          { n: t.lis.length, diff: t.lis.map((x, i) => x === normA[i] ? null : i).filter((x) => x !== null) });
        const k = t.lis.indexOf(normL[0]);
        check('(1b)', S, '酒場の <li> の k 件目以降 == ' + LEGACY_REV + ' の直書きの先頭 (今日は k=1 = 依頼書の「2〜4 件目 == 1〜3 件目」)',
          t.lis.length === 4 && k >= 0 && eq(t.lis.slice(k), normL.slice(0, 4 - k)), { k });
        if (S === 'd1440') {
          const b = t.box;
          check('(3a)', S, '酒場の矩形 left/top/right == [1140,20,1420] ±1・bottom ≤ legacy の bottom + 1 (高さは文面で動く)',
            !!b && near(b.slice(0, 3), [1140, 20, 1420], 1) && b[3] <= leg.t.box[3] + 1 && b[3] > b[1], { box: b, legacy: leg.t.box });
        } else {
          check('(3a)', S, '酒場の矩形 == [230,20,370,69] ±1', near(t.box, [230, 20, 370, 69], 1), t.box);
        }
        check('(3b)', S, '酒場の折りたたみ: ' + (expCollapsed ? '畳' : '開') + ' (従来どおり)', t.collapsed === expCollapsed, { collapsed: t.collapsed });
        check('(err)', S, '酒場の pageerror / console error 0 件 (favicon 除く)', r.errs.length === 0, r.errs.slice(0, 4).join(' | ') || '(なし)');
      } finally { await r.page.close(); }
    }

    /* (5b) ?townlog=0 は酒場へ遷移したあと効かない */
    console.log('\n--- 撤退 (5b) ---');
    const o = await openPage(browser, '/town.html?townlog=0', VPS[0]);
    try {
      await waitTown(o.page);
      const had = await o.page.evaluate(() => !!document.getElementById('changelogBox'));
      const nav = o.page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => null);
      await o.page.evaluate(() => document.getElementById('townSign_tavern').click());
      await nav;
      let z = null;
      try {
        await o.page.waitForFunction(() => !!document.getElementById('changelogBox'), { timeout: 15000 });
        z = await o.page.evaluate(() => ({ path: location.pathname, search: location.search,
          has: !!document.getElementById('changelogBox'), li: document.querySelectorAll('#changelogBox .changelogList li').length }));
      } catch (e) { z = { path: await o.page.evaluate(() => location.pathname), has: false, err: e.message }; }
      check('(5b)', 'd1440', '?townlog=0 の港町 (箱なし) から酒場の看板で遷移 → 酒場の #changelogBox はある (<li> 4 件)',
        !had && !!z && /tavern\.html$/.test(z.path) && z.has && z.li === 4, Object.assign({ townHad: had }, z));
    } finally { await o.page.close(); }
  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    results.push({ label: '(fatal)', scr: null, name: String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const labels = Array.from(new Set(results.map((r) => r.label)));
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   節 ' + labels.length + '   (' + Math.round((Date.now() - T0) / 1000) + ' 秒)');
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.label + (r.scr ? ' [' + r.scr + ']' : '') + ' ' + r.name.slice(0, 100) + '  -- ' + String(r.detail).slice(0, 300)));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = MUTATIONS[tag].expect;
    const bad = results.filter((r) => !r.ok);
    const redKeys = new Set();
    bad.forEach((r) => { redKeys.add(r.label); if (r.scr) redKeys.add(r.label + '@' + r.scr); });
    const red = Array.from(new Set(bad.map((r) => r.label + (r.scr ? '@' + r.scr : ''))));
    const miss = want.filter((w) => !w.split('|').some((alt) => redKeys.has(alt)));
    const wantBase = new Set(want.join('|').split('|').map((w) => w.split('@')[0]));
    const extra = Array.from(new Set(bad.map((r) => r.label))).filter((l) => !wantBase.has(l));
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)'));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
