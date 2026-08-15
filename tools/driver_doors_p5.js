/*
 * driver_doors_p5.js — ★扉システム P5「施錠扉」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * P2〜P4 (driver_doors_p2) が「見える / 塞ぐ / 選ぶと開く」、P8 (driver_doors_p8) が
 * 「開けた扉は開いたまま」を測る。P5 はその間に **locked** を挟む。
 *
 * 主張は 5 つ:
 *   ① 施錠は **node id + door id のハッシュ**で決まる決定論の抽選。同じノードは何度作り直しても
 *      同じ扉が施錠されており、**Math.random を 1 度も引かない** (RNG 消費順を動かさない)。
 *   ② locked は closed と同じく**塞ぐ**。絵は南京錠 1 つで見分けが付く (これは P2 の (2f) が測る)。
 *   ③ 突破は 2 段。早業 (sleightOfHand) で開錠 → 失敗なら運動 (athletics) で体当たり。
 *   ④ **最後は必ず突破する**。両方失敗しても「時間をかけて破る」= broken。施錠で進行が詰まらない。
 *   ⑤ 3 段目の代償は 1d4。ただし **HP 下限 1** = 扉で誰も死なない。
 *
 * ★[P6 追随 2026-08-15] 隠し扉が実装されたので、全ブートに **?secret=0** を付けて母集団を
 *   旧経路 (closed / locked の 2 値) へ固定してある。⚠ **期待値は 1 文字も変えていない** —
 *   本ドライバの主張は「施錠は必ず突破される」で、hidden は driver_doors_p6 が測る。
 *   ⚠ 舞台 orc-fort は現在たまたま隠し扉 0 枚だが、抽選が動いた日に (1b)(1c) が崩れるので
 *     「偶然の緑」に頼らずスイッチで固定する。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port   | mutate      | 注入する欠陥                                  | 赤くなるべき節
 *   PORT   | (素)        | —                                             | —
 *   PORT+1 | nolockroll  | 施錠の抽選を殺す (常に closed)                 | §1 (1c)(1d)
 *   PORT+2 | noforce     | 突破しても broken にせず locked のまま         | §4〜§8 の 7 件 (実測)
 *   PORT+3 | nodmg       | 3 段目の 1d4 を与えない                        | §5 (5b)
 *   PORT+4 | nofloor     | HP 下限 1 を外す (0 まで削る)                  | §5 (5d)
 *   PORT+5 | goalfirst   | commitExit が判定より**先に**目標を決める      | §7 (7b)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_doors_p5.js
 *   node tools/driver_doors_p5.js --mutate nolockroll --headful
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
/* ⚠ ポートは既存ドライバと 6 以上空ける。本ドライバは PORT..PORT+5 の **6 本**を掴む
 *   (driver_doors_p2 = 9010..9016 / driver_doors_p8 = 9020..9024)。 */
const PORT = parseInt(arg('port', '9030'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
/* 舞台。⚠ 廃坑 (goblin-mine) は n1 が event でダイアログ待ちに入るので使わない
 *   (driver_doors_p2 / driver_doors_p8 / driver_graph_p7 と同じ判断)。 */
const STAGE = 'orc-fort';
// 「塞ぐか」の契約。⚠ 実装の doorBlocks を読まず**ここに書き下す** (通すのは open と broken だけ)
const WANT_BLOCK = { closed: true, locked: true, open: false, broken: false, hidden: true };
// 施錠の抽選率。⚠ 実装の DOOR_LOCK_CHANCE を読まずここに書き下す (実装が 0 になっても気づける)
const WANT_LOCK_CHANCE = 0.25;
// 3 段目の代償のダイス。1d4 = 1..4
const WANT_DMG_MIN = 1, WANT_DMG_MAX = 4;

/* ★施錠の抽選の**契約をドライバ側で書き下す**。実装の doorLockedByRng を呼んで比べると、
 *   実装が「常に closed」に化けても両方同じ答えを返して緑になる。
 *   規則: mulberry32(hashStr(nodeId + "/lock/" + doorId))() < DOOR_LOCK_CHANCE  */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function wantLocked(nodeId, doorId) {
  return mulberry32(hashStr(String(nodeId) + '/lock/' + doorId))() < WANT_LOCK_CHANCE;
}

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  nolockroll: [
      '      return makeNodeRng(String(nodeId) + "/lock/" + doorId)() < DOOR_LOCK_CHANCE;',
      '      return false;   /* ★変異nolockroll */'],
  /* ⚠ 末尾コメントまで含めて 1 行を指定する。素の `setDoorState(d, "broken", nodeId);` だけだと
   *   パーティ全滅時のフォールバック (同じ 1 行) にも当たって 2 箇所ヒット = 空振り扱いになる。 */
  noforce: [
      '        setDoorState(d, "broken", nodeId);   // ★突破 = 必ず「通れる側」へ倒す (詰みを作らない)',
      '        /* ★変異noforce (locked のまま) */'],
  nodmg: [
      '        hit = applyDoorForceDamage(rep);',
      '        hit = null;   /* ★変異nodmg */'],
  /* ⚠ 下限は**定数 1 箇所**を変異させる。代入行 (主人公 / 仲間) を狙うと、代表者が
   *   どちらに転ぶかで空振りする (5d は「誰が体当たりしたか」を固定できない)。 */
  nofloor: [
      '    const DOOR_FORCE_HP_FLOOR = 1;',
      '    const DOOR_FORCE_HP_FLOOR = 0;   /* ★変異nofloor */'],
  goalfirst: [
      '      await resolveDoorLockAt(o.at.tx, o.at.ty);',
      '      const _p5 = resolveDoorLockAt(o.at.tx, o.at.ty);  /* ★変異goalfirst */'],
};
const MUT_ORDER = ['nolockroll', 'noforce', 'nodmg', 'nofloor', 'goalfirst'];
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

  const profile = require('./_pptr_profile')('df_doors_p5_');
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

  // ── §1 施錠の抽選 (決定論・RNG 非消費・母集団) ────────────────────────────
  mark('§1 施錠の抽選');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const S = await page.evaluate(() => {
      nodeBusy = true;                       // ★本編と同じ「選択処理中」= 400ms tick を止める
      const snap = () => doorsForRender().map(d => d.id + ':' + d.state).sort();

      /* ① 実際に立っている扉の state。⚠ 実装の予言 (doorLockedByRng) は呼ばない。
       *    id と node id だけ返し、期待値の計算は node 側 (wantLocked) で行う。 */
      const nodeId = currentNodeId;
      const built = doorsForRender().map(d => ({ id: d.id, state: d.state, tx: d.tx, ty: d.ty }));

      /* ② 決定論 = 作り直しても同じ */
      const a = snap();
      rebuildNodeDoors(nodeId); const b = snap();
      rebuildNodeDoors(nodeId); const c = snap();

      /* ③ Math.random を 1 度も引かない (RNG 消費順を動かさない) */
      const real = Math.random;
      let calls = 0;
      Math.random = function () { calls++; return real.apply(Math, arguments); };
      try { rebuildNodeDoors(nodeId); } finally { Math.random = real; }

      /* ④ 母集団 = **グラフ全体**の扉を実装に作らせて state を集める。
       *    ⚠⚠ 現在ノードだけ見ると空回りする。起点 n0 の 3 枚は実測でどれも抽選に当たらず、
       *      「施錠された扉」を 1 枚も観測しないまま緑になる (= nolockroll が空振りする)。
       *    ⚠ tx/ty は現在ノードの幾何で作られるので**読まない**。見るのは id と state だけ
       *      (施錠は node id + door id だけで決まる、が測りたい主張)。 */
      const perNode = {};
      for (const id of Object.keys(RUN.byId)) {
        rebuildNodeDoors(id);
        perNode[id] = doorsForRender().map(d => ({ id: d.id, state: d.state }));
      }
      rebuildNodeDoors(nodeId);            // ★現在ノードへ戻す (測定器が盤面を汚さない)
      return { nodeId, built, same: (a.join('|') === b.join('|') && b.join('|') === c.join('|')),
               snap: a, randomCalls: calls, perNode };
    });
    for (const e of errs) errsAll.push('§1: ' + e);
    await page.close();

    const gotStates = S.built.map(d => d.id + ':' + d.state).sort();
    // グラフ全体を 1 本の一覧へ潰す (実装が作った state)
    const flat = [];
    for (const nid of Object.keys(S.perNode)) {
      for (const d of S.perNode[nid]) flat.push({ node: nid, door: d.id, state: d.state });
    }
    const wrong = flat.filter(x => x.state !== (wantLocked(x.node, x.door) ? 'locked' : 'closed'));
    const nLocked = flat.filter(x => x.state === 'locked').length;

    check('(1a) 母集団ガード: このノードに扉が 2 枚以上立っている',
      S.built.length >= 2, '扉=' + gotStates.join(' '));
    check('(1b) ★どの扉も**塞ぐ側**から始まる (closed か locked = fail-safe)',
      flat.length > 0 && flat.every(x => WANT_BLOCK[x.state] === true),
      flat.map(x => x.node + '/' + x.door + ':' + x.state).join(' '));
    check('(1c) ★★施錠は node id + door id のハッシュで決まる (ドライバ側で書き下した規則と一致)',
      flat.length >= 4 && wrong.length === 0,
      '扉 ' + flat.length + ' 枚 / 食い違い ' + wrong.length + ' 枚' +
      (wrong.length ? ': ' + wrong.slice(0, 4).map(x => x.node + '/' + x.door + '=' + x.state).join(' ') : ''));
    check('(1d) ★母集団: 実装が作った扉に施錠が 1 枚以上あり、全部ではない (抽選が効いている)',
      flat.length >= 4 && nLocked >= 1 && nLocked < flat.length,
      '扉 ' + flat.length + ' 枚中 ' + nLocked + ' 枚が施錠 (期待 ' + WANT_LOCK_CHANCE + ')');
    check('(1e) ★作り直しても同じ扉が施錠されている (決定論)',
      S.same === true, '3 回の一致=' + S.same);
    check('(1f) ★★抽選は Math.random を 1 度も引かない (RNG 消費順を動かさない)',
      S.randomCalls === 0, 'rebuildNodeDoors 中の Math.random 呼び出し=' + S.randomCalls);
  }

  // ── §2 locked は塞ぐ / 退避スイッチ ?locks=0 ──────────────────────────────
  mark('§2 locked は塞ぐ + 退避スイッチ');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const B = await page.evaluate(() => {
      nodeBusy = true;
      const d = doorsForRender()[0];
      const out = {};
      for (const st of ['closed', 'locked', 'open', 'broken', 'hidden']) {
        setDoorState(d, st);
        out[st] = isTileWall(d.tx, d.ty);
      }
      setDoorState(d, 'locked');
      const snapLocked = snapToWalkable({ tx: d.tx, ty: d.ty });
      setDoorState(d, 'open');
      const snapOpen = snapToWalkable({ tx: d.tx, ty: d.ty });
      setDoorState(d, 'closed');
      return { block: out, at: { tx: d.tx, ty: d.ty },
               snapLockedSame: snapLocked.tx === d.tx && snapLocked.ty === d.ty,
               snapOpenSame: snapOpen.tx === d.tx && snapOpen.ty === d.ty };
    });
    for (const e of errs) errsAll.push('§2: ' + e);
    await page.close();

    const ng = Object.keys(WANT_BLOCK).filter(st => B.block[st] !== WANT_BLOCK[st]);
    check('(2a) ★5 状態の通行判定が契約どおり (locked は closed と同じく塞ぐ)',
      ng.length === 0, Object.keys(WANT_BLOCK).map(st => st + ':' + B.block[st]).join(' '));
    check('(2b) ★snapToWalkable は施錠扉を避け、開いた扉ではそのタイルを返す',
      B.snapLockedSame === false && B.snapOpenSame === true,
      'locked時に同一=' + B.snapLockedSame + ' open時に同一=' + B.snapOpenSame);

    // 退避スイッチ ?locks=0 … ★これが「新機能を見ている」ことの装置 assert
    const errs2 = [];
    const p2 = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0', STAGE, errs2);
    const L = await p2.evaluate(() => {
      nodeBusy = true;
      /* ⚠⚠ 現在ノードだけ見ると空振りする (起点 n0 の 3 枚は素でもどれも施錠されない)。
       *   §1 と同じくグラフ全体を作らせて数える。 */
      const perNode = {};
      for (const id of Object.keys(RUN.byId)) {
        rebuildNodeDoors(id);
        perNode[id] = doorsForRender().map(d => ({ id: d.id, state: d.state }));
      }
      rebuildNodeDoors(currentNodeId);
      return { perNode };
    });
    for (const e of errs2) errsAll.push('§2b: ' + e);
    await p2.close();
    const offFlat = [];
    for (const nid of Object.keys(L.perNode)) {
      for (const d of L.perNode[nid]) offFlat.push({ node: nid, door: d.id, state: d.state });
    }
    // ⚠ 「素なら施錠されるはずの扉」が 0 枚なら (2c) は空振り。母集団を必ず数えて条件に入れる。
    const wouldLock = offFlat.filter(x => wantLocked(x.node, x.door)).length;
    check('(2c) ★退避スイッチ ?locks=0 で施錠が 1 枚も立たない (母集団 ' + wouldLock + ' 枚)',
      wouldLock >= 1 && offFlat.length >= 4 && offFlat.every(x => x.state === 'closed'),
      '扉 ' + offFlat.length + ' 枚 / locked ' + offFlat.filter(x => x.state === 'locked').length + ' 枚');
  }

  // ── §3〜§5 突破の 3 経路 (forced は検証シーム専用。本編からは絶対に渡さない) ──
  mark('§3〜§5 突破の 3 経路 (開錠 / 体当たり / 力ずく)');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const T = await page.evaluate(async () => {
      nodeBusy = true;
      const g = window.__graphRun;
      const totalHp = () => hp + allies.filter(a => a.alive).reduce((s, a) => s + a.hp, 0);
      const d = doorsForRender()[0];
      const home = currentNodeId;
      const out = {};
      for (const forced of ['pick', 'force', 'break']) {
        setDoorState(d, 'locked');
        const before = totalHp();
        const r = await g.unlock(d.tx, d.ty, forced);
        out[forced] = {
          outcome: r ? r.outcome : null,
          state: d.state,
          blocked: isTileWall(d.tx, d.ty),
          dHp: before - totalHp(),
          saved: ((nodeState[home] || {}).doorStates || {})[d.id] || null,
          dead: gameOver === true || allies.some(a => !a.alive),
        };
      }
      /* ★HP 下限 1: 全員 1 の状態で「力ずく」を通しても誰も死なない。 */
      setDoorState(d, 'locked');
      hp = 1; for (const a of allies) { if (a.alive) a.hp = 1; }
      const fl = await g.unlock(d.tx, d.ty, 'break');
      const floor = { hp: hp, minAlly: allies.filter(a => a.alive).reduce((m, a) => Math.min(m, a.hp), 99),
                      over: gameOver === true, allAlive: allies.every(a => a.alive),
                      dmg: fl ? fl.dmg : null };
      setDoorState(d, 'closed');
      return { out, floor, id: d.id };
    });
    for (const e of errs) errsAll.push('§3-5: ' + e);
    await page.close();

    const P = T.out.pick, F = T.out.force, K = T.out.break;
    check('(3a) ★開錠成功 (早業) → open。静かに通れるようになる',
      P.outcome === 'pick' && P.state === 'open' && P.blocked === false,
      'outcome=' + P.outcome + ' state=' + P.state + ' 塞ぐ=' + P.blocked);
    check('(3b) ★開錠成功では誰も傷つかない',
      P.dHp === 0, 'HP 減=' + P.dHp);
    check('(3c) ★開錠の結果が nodeState へ保存される (P8 と同じ器へ乗る)',
      P.saved === 'open', '保存=' + P.saved);
    check('(4a) ★体当たり成功 (運動) → broken。通れるようになる',
      F.outcome === 'force' && F.state === 'broken' && F.blocked === false,
      'outcome=' + F.outcome + ' state=' + F.state + ' 塞ぐ=' + F.blocked);
    check('(4b) ★体当たり成功では誰も傷つかない (代償は 3 段目だけ)',
      F.dHp === 0, 'HP 減=' + F.dHp);
    check('(5a) ★★両方失敗しても最後は必ず突破する (broken・通れる)',
      K.outcome === 'break' && K.state === 'broken' && K.blocked === false,
      'outcome=' + K.outcome + ' state=' + K.state + ' 塞ぐ=' + K.blocked);
    check('(5b) ★力ずくの代償は 1d4 (1〜4 の実ダメージ)',
      K.dHp >= WANT_DMG_MIN && K.dHp <= WANT_DMG_MAX, 'HP 減=' + K.dHp);
    check('(5c) ★力ずくでも broken は保存される (再入場でこじ開け直さない)',
      K.saved === 'broken', '保存=' + K.saved);
    check('(5d) ★★HP 下限 1 = 扉で誰も死なない (全員 1 の状態で力ずくを通す)',
      T.floor.hp === 1 && T.floor.minAlly >= 1 && T.floor.over === false && T.floor.allAlive === true,
      '主人公HP=' + T.floor.hp + ' 仲間の最小HP=' + T.floor.minAlly +
      ' gameOver=' + T.floor.over + ' 与ダメ=' + T.floor.dmg);
  }

  // ── §6 施錠は「開かずの扉」を作らない ────────────────────────────────────
  mark('§6 施錠が進行を止めない');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const G = await page.evaluate(async () => {
      nodeBusy = true;
      const g = window.__graphRun;
      const d = doorsForRender()[0];
      const got = [];
      /* 強制結果を渡さない = **本物の 2 段判定**を通す。結果は出目次第 (open か broken) だが、
       * 「通れるようになる」ことだけは出目に依らない = P5 の芯。
       * ⚠ RUN.auto を立てて判定パネルを出さずに解決させる (?autoplay はゲーム全体を自走させて
       *   しまい、測っている最中にノードが変わる)。 */
      RUN.auto = true;
      try {
        for (let i = 0; i < 3; i++) {
          setDoorState(d, 'locked');
          hp = Math.max(hp, 20);
          await g.unlock(d.tx, d.ty);
          got.push({ state: d.state, blocked: isTileWall(d.tx, d.ty) });
        }
      } finally { RUN.auto = false; }
      setDoorState(d, 'closed');
      return { got };
    });
    for (const e of errs) errsAll.push('§6: ' + e);
    await page.close();
    check('(6a) ★★施錠扉は 3 回とも通れる状態になった (出目に依らず突破は保証される)',
      G.got.length === 3 && G.got.every(x => x.blocked === false &&
        (x.state === 'open' || x.state === 'broken')),
      G.got.map(x => x.state + '/塞ぐ:' + x.blocked).join(' '));
  }

  // ── §7 本編と同じ入口 (commitExit) を通る ────────────────────────────────
  mark('§7 出口選択 → 施錠判定 → 目標決定 の順序');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const C = await page.evaluate(async () => {
      nodeBusy = true;                       // ★本編も nodeBusy の内側で commitExit を await する
      const g = window.__graphRun;
      const ex = g.exits().filter(o => !o.back)[0];
      if (!ex) return { ex: null };
      const d = doorsForRender().find(x => x.tx === ex.at.tx && x.ty === ex.at.ty);
      if (!d) return { ex: ex, d: null };
      setDoorState(d, 'locked');             // ★この出口を必ず施錠にする (母集団を作る)
      hp = Math.max(hp, 20);
      RUN.auto = true;                       // 判定パネルを出さずに解決 (§6 と同じ理由)
      let r = null;
      try { r = await g.pick(ex.to); } finally { RUN.auto = false; }
      const goal = g.forcedGoal();
      return { ex: { to: ex.to, at: ex.at }, d: { id: d.id, tx: d.tx, ty: d.ty },
               state: d.state, blocked: isTileWall(d.tx, d.ty),
               goal: goal, picked: r, hp: hp };
    });
    for (const e of errs) errsAll.push('§7: ' + e);
    await page.close();

    check('(7a) ★母集団ガード: 未踏の出口があり、そのタイルに扉が立っている',
      !!C.ex && !!C.d, C.ex ? '出口=' + JSON.stringify(C.ex.at) : '未踏の出口なし');
    check('(7b) ★★施錠扉を選んだら**突破してから**目標が決まる (目標 = ゲートタイルそのもの)',
      !!C.goal && !!C.d && C.goal.tx === C.d.tx && C.goal.ty === C.d.ty && C.blocked === false,
      '目標=' + JSON.stringify(C.goal) + ' 扉=' + JSON.stringify(C.d ? { tx: C.d.tx, ty: C.d.ty } : null) +
      ' state=' + C.state);
    check('(7c) ★本編経路でも HP は 1 未満にならない',
      typeof C.hp === 'number' && C.hp >= 1, 'HP=' + C.hp);
  }

  // ── §8 保存 (壊した扉は再入場でも施錠へ戻らない) ──────────────────────────
  mark('§8 突破した扉は再入場でも施錠へ戻らない');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const R = await page.evaluate(async () => {
      nodeBusy = true;
      const g = window.__graphRun;
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const home = currentNodeId;
      const ex = g.exits().filter(o => !o.back)[0];
      if (!ex) return { ex: null };
      const d = doorsForRender().find(x => x.tx === ex.at.tx && x.ty === ex.at.ty);
      if (!d) return { ex: ex, d: null };
      setDoorState(d, 'locked');
      await g.unlock(d.tx, d.ty, 'break');       // 力ずくで破る
      const brokeId = d.id, brokeState = d.state;
      await g.enter(ex.to, ex.dir);              // 子へ
      const childId = currentNodeId;
      await g.enter(home, OPP[ex.dir]);          // 親へ戻る
      const backState = (doorsForRender().find(x => x.id === brokeId) || {}).state || null;
      return { ex: { to: ex.to }, d: { id: brokeId }, brokeState, childId, home,
               backId: currentNodeId, backState };
    });
    for (const e of errs) errsAll.push('§8: ' + e);
    await page.close();

    check('(8a) 母集団ガード: 施錠 → 力ずくで破るところまで到達した',
      !!R.d && R.brokeState === 'broken', '破壊後=' + (R.brokeState || 'なし'));
    check('(8b) ★★子へ出て戻っても broken のまま (施錠へ戻らない = こじ開け直しが起きない)',
      R.backId === R.home && R.backState === 'broken',
      '戻り先=' + R.backId + ' 扉=' + R.backState);
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
