/*
 * driver_doors_p8.js — ★扉システム P8「開けた扉は開いたまま / MAPDEF を汚さない」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * P2〜P4 (driver_doors_p2.js) は「扉が見える / 塞ぐ / 選ぶと開く」までを測る。そこでは扉の
 * 寿命がノードで、**再入場のたび closed に戻っていた**。P8 はその state を nodeState へ移す。
 *
 * 主張は 4 つ:
 *   ① 開けた扉は nodeState[nodeId].doorStates に write-through され、
 *      子ノードへ出て**戻ってきても開いたまま**。開けていない扉は閉じたまま。
 *   ② 保存はノードごと。親の扉 id が子の doorStates へ混ざらない。
 *   ③ mapDef.doors を持つマップでも、実行時に触るのは**複製**。MAPDEF は 1 バイトも変わらない
 *      (= map-editor の書き出しに実行時の開閉が混ざらない)。P4 の注記が「P8 の仕事」と
 *      書いていた穴がこれ。
 *   ④ 復元は「まだ入っていないノードの nodeState を作らない」。作ると visited が立ち、
 *      exitsWithReturn の「未踏の枝を先に並べる」順序 = 決定論 DFS が壊れる。
 *
 * ⚠ 施錠 (P5) / 隠し扉 (P6) はまだ無い。ここで測ると永久に赤い検出器になる。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port   | mutate         | 注入する欠陥                              | 赤くなるべき節
 *   PORT   | (素)           | —                                         | —
 *   PORT+1 | nosavedoor     | setDoorState が nodeState へ書かない       | §1 (1b)(1c)
 *   PORT+2 | norestoredoor  | 保存してある state を当て直さない          | §1 (1c)
 *   PORT+3 | sharemapdef    | MAPDEF.doors を複製せず参照で持つ          | §2 (2b)(2c)
 *   PORT+4 | eagernodestate | 復元が nodeStateFor を使う (未訪でも作る)  | §3 (3a)(3b)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_doors_p8.js
 *   node tools/driver_doors_p8.js --mutate nosavedoor --headful
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/* ⚠⚠ path.resolve 必須。'/' 区切りのままだと下の startsWith が必ず false になり
 *   全部 404 (症状はタイムアウトだけで原因が見えない)。 */
const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}
const HEADFUL = process.argv.includes('--headful');
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+4 の **5 本**を掴む
 *   (driver_doors_p2 が 9010..9016 を使う)。 */
const PORT = parseInt(arg('port', '9020'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
/* 舞台。⚠ 廃坑 (goblin-mine) は n1 が event でダイアログ待ちに入るので使わない
 *   (driver_doors_p2 / driver_graph_p7 と同じ判断)。本ドライバは実際にノードを
 *   往復するので、ここを外すと (1c) がタイムアウトで落ちる。 */
const STAGE = 'orc-fort';
/* ★[P5 追随 2026-08-15] 全ブートに **?locks=0** を付けてある。本ドライバの主張は
 *   「**開けた**扉が開いたまま残る / MAPDEF を汚さない」で、施錠 (locked) の突破は
 *   driver_doors_p5 が測る。⚠ 期待値は 1 文字も書き換えていない (母集団を旧経路へ固定しただけ)。
 * ★[P6 追随 2026-08-15] 同じ理由で **?secret=0** も足した (隠し扉 = hidden は
 *   driver_doors_p6 が測る)。スイッチが効いていること自体は driver_doors_p6 の (6a)(6b) が装置。 */
const DOOR_STATES = ['closed', 'locked', 'open', 'broken', 'hidden'];
// 「塞ぐか」の契約。⚠ 実装の doorBlocks を読まず**ここに書き下す** (通すのは open と broken だけ)
const WANT_BLOCK = { closed: true, locked: true, open: false, broken: false, hidden: true };

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  nosavedoor: [
      '        if (st) (st.doorStates || (st.doorStates = {}))[d.id] = state;',
      '        if (st) { /* ★変異nosavedoor */ }'],
  norestoredoor: [
      '        if (s && DFMapDef.DOOR_STATES.indexOf(s) >= 0) d.state = s;',
      '        if (0) d.state = s;   /* ★変異norestoredoor */'],
  sharemapdef: [
      '        nodeDoors = MAPDEF.doors.map(d => Object.assign({}, d));',
      '        nodeDoors = MAPDEF.doors;   /* ★変異sharemapdef */'],
  eagernodestate: [
      '      const st = nodeState[nodeId];',
      '      const st = nodeStateFor(nodeId);   /* ★変異eagernodestate */'],
};
const MUT_ORDER = ['nosavedoor', 'norestoredoor', 'sharemapdef', 'eagernodestate'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const [from, to] = MUTATIONS[key];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (from.length === to.length) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → §0 が誤報する');
    process.exit(3);
  }
  const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
  const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
  if (hits.length !== 1 || n !== 1) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
      (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
      ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  out[hits[0]] = out[hits[0]].split(from).join(to);
  _mutCache[key] = { files: out, target: hits[0] };
  return _mutCache[key];
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
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey).files[rel]); return;
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

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }

async function bootPage(browser, url, scen, errs, opts) {
  const o = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
    if (o.warns) o.warns.push(t);
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    try { localStorage.removeItem('df.devMode'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  await new Promise(r => setTimeout(r, 900));      // テクスチャの読込 (壁/床の pattern) を待つ
  return page;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 http://localhost:' + PORT +
              '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const profile = require('./_pptr_profile')('df_doors_p8_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const basePort = MUTATE ? PORT_OF[MUTATE] : PORT;
  const base = 'http://localhost:' + basePort;
  const errsAll = [];

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ──────────────────────────
  mark('§0 変異の配信検算');
  {
    const get = (port, p) => new Promise((res, rej) => {
      /* ⚠ Buffer で受けてから 1 度だけ decode する。チャンク境界で日本語 (3 バイト) が
       *   割れると文字数が変わり (0a) が誤報する。 */
      http.get({ host: 'localhost', port: port, path: p }, r => {
        const bufs = []; r.on('data', d => bufs.push(d));
        r.on('end', () => res(Buffer.concat(bufs)));
      }).on('error', rej);
    });
    let allOk = true; const detail = [];
    for (const k of MUT_ORDER) {
      const tgt = mutatedSources(k).target;
      const pure = (await get(PORT, '/' + tgt)).toString('utf8');
      const mut = (await get(PORT_OF[k], '/' + tgt)).toString('utf8');
      const [from, to] = MUTATIONS[k];
      const ok = pure.indexOf(from) >= 0 && mut.indexOf(from) < 0 && mut.indexOf(to) >= 0;
      if (!ok) allOk = false;
      detail.push(k + (ok ? ':ok' : ':NG'));
    }
    check('(0a) ★' + MUT_ORDER.length + ' 種の変異が素の配信に無く、変異ポートの配信にだけ載っている',
      allOk, detail.join(' '));
  }

  // ── §1 往復しても開いたまま ────────────────────────────────────────────────
  /* ★本丸。子ノードへ出て親へ戻り、**開けた扉だけ**が open のまま残ることを測る。
   * ⚠ 歩きは飛ばして enterNode を直に叩く (__graphRun.enter)。到達検出まで通すと
   *   ノードごとの敵の掃討時間に依存してフレークになる。開閉の保存は歩きと無関係。 */
  mark('§1 往復しても開いたまま (保存と復元)');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const R = await page.evaluate(async () => {
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const g = window.__graphRun;
      const snap = () => doorsForRender().map(d => d.id + ':' + d.state).sort();
      const savedOf = (id) => Object.assign({}, (nodeState[id] || {}).doorStates || {});
      const home = currentNodeId;
      const before = snap();
      const ex = g.exits().filter(o => !o.back)[0];
      if (!ex) return { ex: null };
      await g.pick(ex.to);                              // 本編と同じ入口。ここで扉が開く (P5 で async 化)
      const openedId = (doorsForRender().find(d => d.tx === ex.at.tx && d.ty === ex.at.ty) || {}).id;
      const afterPick = snap();
      const savedHome = savedOf(home);
      await g.enter(ex.to, ex.dir);                     // 子へ
      const childId = currentNodeId;
      const savedChild = savedOf(childId);
      const childSnap = snap();
      await g.enter(home, OPP[ex.dir]);                 // 親へ戻る
      return {
        ex: { to: ex.to, dir: ex.dir, at: ex.at }, home: home, childId: childId,
        openedId: openedId, before: before, afterPick: afterPick,
        savedHome: savedHome, savedChild: savedChild, childSnap: childSnap,
        backSnap: snap(), backId: currentNodeId,
      };
    });
    for (const e of errs) errsAll.push('§1: ' + e);
    await page.close();

    check('(1a) 母集団ガード: 未踏の出口があり、選ぶ前は扉が 2 枚以上・全部 closed',
      !!R.ex && R.before.length >= 2 && R.before.every(s => /:closed$/.test(s)) && !!R.openedId,
      R.ex ? '扉=[' + R.before.join(' ') + '] 開けた=' + R.openedId : '未踏の出口なし');
    check('(1b) ★開けた扉が nodeState[親].doorStates へ保存されている (write-through)',
      !!R.openedId && R.savedHome && R.savedHome[R.openedId] === 'open' &&
      Object.keys(R.savedHome).length === 1,
      '保存=' + JSON.stringify(R.savedHome || {}));
    /* ★★本丸。P4 まではここで全部 closed に戻っていた。 */
    const wantBack = R.openedId
      ? (R.before || []).map(s => s.replace(/:closed$/, ':open') === R.openedId + ':open'
                                    ? R.openedId + ':open' : s).sort()
      : null;
    check('(1c) ★★子へ出て戻ると、開けた扉だけが open のまま (他は closed のまま)',
      !!wantBack && R.backId === R.home && (R.backSnap || []).join(' ') === wantBack.join(' '),
      '戻り先=' + R.backId + ' 実測=[' + (R.backSnap || []).join(' ') +
      '] 契約=[' + (wantBack || []).join(' ') + ']');
    check('(1d) ★保存はノードごと (子の doorStates に親の扉が混ざらない・子は全部 closed)',
      !!R.childId && R.childId !== R.home &&
      Object.keys(R.savedChild || {}).length === 0 &&
      (R.childSnap || []).length > 0 && (R.childSnap || []).every(s => /:closed$/.test(s)),
      '子=' + R.childId + ' 子の保存=' + JSON.stringify(R.savedChild || {}) +
      ' 子の扉=[' + (R.childSnap || []).join(' ') + ']');
  }

  // ── §2 MAPDEF を汚さない ──────────────────────────────────────────────────
  /* ★P4 までは doorsForRender が MAPDEF.doors を**そのまま**返していたので、開けた扉が
   *   MAPDEF へ書き戻り、map-editor の書き出しに実行時の開閉が混ざる穴があった。 */
  mark('§2 mapDef.doors を汚さない (複製で持つ)');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const M = await page.evaluate(() => {
      const authored = [{ id: 'a0', tx: 1, ty: 2, orientation: 'vertical',
                          state: 'closed', requiredKey: null }];
      MAPDEF.doors = authored;
      rebuildNodeDoors(currentNodeId);
      const live = doorsForRender();
      const sameRef = live.length === 1 && live[0] === authored[0];
      openDoorAt(1, 2);                       // 実行時に開ける
      const out = {
        n: live.length, sameRef: sameRef,
        liveState: live[0] ? live[0].state : null,
        authoredState: authored[0].state,     // ★ここが 'closed' のままであること
        mapdefIsAuthored: MAPDEF.doors === authored,
      };
      MAPDEF.doors = null;
      rebuildNodeDoors(currentNodeId);
      return out;
    });
    for (const e of errs) errsAll.push('§2: ' + e);
    await page.close();

    check('(2a) 母集団ガード: mapDef.doors を入れるとその 1 枚が立つ (測る相手が居る)',
      M.n === 1 && M.mapdefIsAuthored === true, '枚数=' + M.n);
    check('(2b) ★実行時に触るのは複製 (MAPDEF.doors の要素と同一オブジェクトではない)',
      M.sameRef === false, '同一参照=' + M.sameRef);
    check('(2c) ★★開けても MAPDEF.doors は closed のまま (書き出しに実行時の開閉が混ざらない)',
      M.liveState === 'open' && M.authoredState === 'closed',
      '複製=' + M.liveState + ' MAPDEF=' + M.authoredState);
  }

  // ── §3 未訪ノードの状態を作らない ─────────────────────────────────────────
  /* ⚠⚠ 復元に nodeStateFor (無ければ作る) を使うと、buildNode の途中 = **入る前**に
   *   visited が立ち、exitsWithReturn の「未踏の枝を先に並べる」順序が壊れる。
   *   これは決定論 DFS そのものなので、壊れるとドライバが有限手でボスへ着かなくなる。 */
  mark('§3 復元が未訪ノードの nodeState を作らない');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const N = await page.evaluate(() => {
      const g = window.__graphRun;
      const orderOf = () => g.exits().map(o => o.to + (o.back ? '(back)' : '')).join(' ');
      const before = orderOf();
      const fresh = g.exits().filter(o => !o.back).map(o => o.to)
                     .filter(id => !nodeState[id]);
      if (!fresh.length) return { fresh: null };
      const target = fresh[0];
      rebuildNodeDoors(target);              // ★buildNode がやるのと同じ呼び方 (入る前)
      const created = !!nodeState[target];
      const visited = !!(nodeState[target] && nodeState[target].visited);
      rebuildNodeDoors(currentNodeId);       // 後始末
      return { fresh: target, created: created, visited: visited,
               before: before, after: orderOf() };
    });
    for (const e of errs) errsAll.push('§3: ' + e);
    await page.close();

    check('(3a) ★入る前の rebuildNodeDoors が未訪ノードの nodeState を作らない',
      !!N.fresh && N.created === false,
      N.fresh ? '対象=' + N.fresh + ' 生成された=' + N.created + ' visited=' + N.visited
              : '母集団なし (未訪の子ノード)');
    check('(3b) ★その結果、出口の並び (未踏の枝が先 = 決定論 DFS) が変わらない',
      !!N.fresh && N.before === N.after,
      '前=[' + (N.before || '') + '] 後=[' + (N.after || '') + ']');
  }

  // ── §4 書き込み点が 1 つ = マスクが必ず追随する ───────────────────────────
  /* ★driver_doors_p2 の (4b) は d.state を直に書いて rebuildDoorBlockMask を**自分で呼んで**
   *   契約を測っていた。ここで測るのは「setDoorState を通せば呼び忘れが原理的に作れない」
   *   ことと、保存が 5 状態すべてを通ること (P5 の locked / broken が同じ器へ乗る)。 */
  mark('§4 setDoorState = 書き込みの唯一点');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const W = await page.evaluate((states) => {
      const home = currentNodeId;
      /* ⚠ 母集団: 情景 (倒木など) が既に塞いでいるタイルの扉を選ぶと、open にしても
       *   通れないので「マスクが追随していない」と区別できない。**open で通れる扉**を選ぶ。 */
      let pick = null;
      for (const d of doorsForRender()) {
        const st = d.state;
        setDoorState(d, 'open');
        const walkable = !isTileWall(d.tx, d.ty);
        setDoorState(d, st);
        if (walkable) { pick = d; break; }
      }
      if (!pick) return { pick: null };
      const block = {}, saved = {};
      for (const st of states) {
        setDoorState(pick, st);                   // ★マスク再構築を自分で呼ばない
        block[st] = isTileWall(pick.tx, pick.ty);
        saved[st] = ((nodeState[home] || {}).doorStates || {})[pick.id];
      }
      const idem = setDoorState(pick, pick.state);   // 同じ state → 何もしない
      setDoorState(pick, 'closed');
      return { pick: { id: pick.id, tx: pick.tx, ty: pick.ty }, block: block,
               saved: saved, idem: idem };
    }, DOOR_STATES);
    for (const e of errs) errsAll.push('§4: ' + e);
    await page.close();

    check('(4a) 母集団ガード: 開ければ通れる扉が実在する (情景で塞がった扉を測っていない)',
      !!W.pick, W.pick ? '対象=' + W.pick.id + '@' + W.pick.tx + ',' + W.pick.ty : '該当なし');
    const blockNg = W.pick ? DOOR_STATES.filter(st => W.block[st] !== WANT_BLOCK[st]) : DOOR_STATES;
    check('(4b) ★setDoorState だけで通行判定が全 5 state で契約と一致 (マスク再構築の呼び忘れが作れない)',
      blockNg.length === 0,
      DOOR_STATES.map(st => st + ':' + (W.block ? W.block[st] : '?')).join(' '));
    const saveNg = W.pick ? DOOR_STATES.filter(st => W.saved[st] !== st) : DOOR_STATES;
    check('(4c) ★保存が 5 状態すべてを通る (P5 の locked / broken が同じ器へ乗る)',
      saveNg.length === 0,
      DOOR_STATES.map(st => st + '→' + (W.saved ? W.saved[st] : '?')).join(' '));
    check('(4d) 同じ state の書き込みは何もしない (false を返す)',
      W.idem === false, 'idem=' + W.idem);
  }

  // ── 例外 ────────────────────────────────────────────────────────────────
  mark('例外・console.error');
  check('(E1) ページ例外 / console.error が 0 件', errsAll.length === 0,
    errsAll.slice(0, 6).join(' | '));

  await browser.close();
  for (const s of servers) s.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n══ 結果: ' + pass + '/' + results.length + ' PASS ══');
  if (pass !== results.length) {
    console.log('FAILED:');
    for (const r of results) if (!r.ok) console.log('  - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL ' + e.stack); process.exit(9); });
