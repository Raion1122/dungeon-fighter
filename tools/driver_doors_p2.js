/*
 * driver_doors_p2.js — ★扉システム P2〜P4「扉が見える / 塞ぐ / 選ぶと開く」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * P1 (11b22ba) の driver_doors_p1.js は **素の node + vm による純関数テスト**で、
 * 「ゲームに配線されたか」は 1 つも測っていない。ここから先は実ブラウザで測る。
 *
 * 主張は 6 つ:
 *   ① 描画する扉の一覧の出所は doorsForRender() **ただ 1 つ**。優先順は
 *      mapDef.doors → 分岐ノードの自動生成 → 空。撤退スイッチ ?doors=0 で丸ごと無効化できる。
 *   ② 扉は nodeGateTile が返すタイルに立つ。位置の契約 (最大面積の部屋の縁の中点) は
 *      **ドライバ側に書き下す**。実装から読み取ると実装の誤りを一緒に信じてしまう。
 *   ③ mapCanvas の画素が変わり、**変わるのは扉タイルの中だけ**。hidden は 1 画素も描かない。
 *      doorBlocks が false の状態 (open/broken) は閉扉より塗る面積が**小さい**
 *      = 「絵は閉じているのに通れる」を描画側から作れない。
 *   ④ 描画順は 背景MAP → 固定地形 → **扉** → キャラ。
 *   ⑤ [P3] 閉扉はマスを塞ぐ。isTileWall が全 state で doorBlocks と一致し、
 *      **mapData は 1 バイトも書き換わらない**。
 *   ⑥ [P4] 出口を選ぶ = その扉が開く。⚠ 順序 (開ける → 目標を決める) が守られていること。
 *      さらに扉の集合は **node id だけで決まる** (どちらから入ったかに依存しない)。
 *      ← ここは実際に踏んだ欠陥。当たり判定に載せた扉が nodeEnteredVia 由来だったため、
 *        別経路で戻ると宝箱と罠の座標が変わり driver_graph_run が 5 件赤くなった。
 *
 * ⚠ 施錠 (P5) / 隠し扉 (P6) / 状態の保存 (P8) はまだ無い。ここで測ると永久に赤い検出器になる。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port   | mutate       | 注入する欠陥                            | 赤くなるべき節
 *   PORT   | (素)         | —                                       | —
 *   PORT+1 | nodoorsoff   | 撤退スイッチ ?doors=0 を無効化           | §6 (6a)
 *   PORT+2 | showhidden   | state:"hidden" のスキップを外す          | §2 (2d)
 *   PORT+3 | imgafterdoor | 扉の**後**に drawImage を 1 回発行する    | §3 (3c)
 *   PORT+4 | noblock      | isTileWall の扉判定を外す                | §4 (4b)
 *   PORT+5 | noopen       | 出口選択で扉を開けない                   | §5 (5b)(5c)
 *   PORT+6 | usedirsvia   | 扉の向き集合を nodeEnteredVia 由来へ戻す  | §6 (6e)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_doors_p2.js
 *   node tools/driver_doors_p2.js --mutate noblock --headful
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
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+6 の **7 本**を掴む
 *   (既存の最大は driver_graph_p7 の 9000..9002)。 */
const PORT = parseInt(arg('port', '9010'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
const SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
                   'orc-fort', 'undead-temple', 'dragon-lair'];
/* 画素・向き・描画順を測る舞台。⚠ 廃坑 (goblin-mine) は n1 が event でダイアログ待ちに
 *   入るので使わない (driver_graph_p7 と同じ判断)。 */
const STAGE = 'orc-fort';
/* ★[P5 追随 2026-08-15] 全ブートに **?locks=0** を付けてある。本ドライバの主張は
 *   「**閉じた**扉が見える / 塞ぐ / 選ぶと開く」で、施錠 (locked) は driver_doors_p5 が測る。
 * ⚠ 期待値は 1 文字も書き換えていない。母集団 (初期状態) を旧経路へ固定しただけ
 *   (?graph=0 で単一マップへ固定するのと同じやり方)。スイッチが効いていること自体は
 *   driver_doors_p5 の (2c) が装置 assert として測る。
 * ★[P6 追随 2026-08-15] 同じ理由で **?secret=0** も足した。⚠ ただし `?doors=states` のブート
 *   (§7 の絵の確認) は**そのまま**にしてある — あちらは 5 状態を強制的に順に当てるので
 *   hidden の絵 (= 1 画素も描かない) を測る (2d) の母集団はスイッチに影響されない。 */
// mapDef.doors の 6 キー (P1 で確定。ここが増減したら P1 の driver と一緒に直す)
const DOOR_KEYS = ['id', 'tx', 'ty', 'orientation', 'state', 'requiredKey'];
const DOOR_STATES = ['closed', 'locked', 'open', 'broken', 'hidden'];
// 「塞ぐか」の契約。⚠ 実装の doorBlocks を読まず**ここに書き下す** (通すのは open と broken だけ)
const WANT_BLOCK = { closed: true, locked: true, open: false, broken: false, hidden: true };

/* ★位置の契約 = 「最大面積の部屋の縁の中点」。index.html の mainRoomRect / nodeGateTile と
 *   同じ規則を**ドライバ側で書き下す**。実装を読んで比べると、実装が間違っていても緑になる。 */
function gateTileOf(rooms, dir) {
  let best = null, bestArea = -1;
  for (const rect of rooms) {
    const [r1, c1, r2, c2] = rect;
    const a = (r2 - r1 + 1) * (c2 - c1 + 1);
    if (a > bestArea) { bestArea = a; best = rect; }
  }
  const [r1, c1, r2, c2] = best;
  const midR = Math.floor((r1 + r2) / 2), midC = Math.floor((c1 + c2) / 2);
  if (dir === 'up')   return { tx: midC, ty: r1 };
  if (dir === 'down') return { tx: midC, ty: r2 };
  if (dir === 'left') return { tx: c1,   ty: midR };
  return { tx: c2, ty: midR };                       // right
}
// 向きと板の伸びる方向の対応 (南北へ抜ける口は板が東西へ伸びる)
const WANT_ORIENT = { up: 'horizontal', down: 'horizontal', left: 'vertical', right: 'vertical' };

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  nodoorsoff: [
      '      try { return new URLSearchParams(location.search).get("doors") === "0"; }',
      '      try { return false;   /* ★変異nodoorsoff */ }'],
  showhidden: [
      '        if (!d || d.state === "hidden") continue;',
      '        if (!d) continue;   /* ★変異showhidden */'],
  imgafterdoor: [
      '      if (doorsNow.length) drawDoors(doorsNow);',
      '      if (doorsNow.length) { drawDoors(doorsNow); ctx.drawImage(tileset, 0, 0, 1, 1, 0, 0, 1, 1); }'],
  noblock: [
      '      if (isDoorBlocking(tileX, tileY)) return true;',
      '      if (0) return true;   /* ★変異noblock */'],
  noopen: [
      '      openDoorAt(o.at.tx, o.at.ty);',
      '      /* ★変異noopen: 開けない */'],
  /* ⚠ [P6 追随 2026-08-15] アンカーを張り替えた。rebuildNodeDoors が「向きの集合 (Set)」から
   *   「向き → 出口の対応表 (Map)」へ変わったため (隠してよい扉かの判定に行き先が要る)。
   *   **注入する欠陥は 1 ミリも変えていない** = 入場方向 (nodeExitDirs) を扉の集合へ混ぜる。
   *   ⚠ 値に {to:null} を入れるのは、実在の ex を使うと足した向きまで P6 の隠し扉抽選の
   *     候補になり、この負のコントロールが別の欠陥まで一緒に注入してしまうから。
   * ⚠⚠ 置換後の文字列に置換前の 1 行を**部分文字列として含めないこと**。含めると §0 の
   *   `mut.indexOf(from) < 0` が成立せず、変異は載っているのに (0a) だけ NG になる (実測した)。 */
  usedirsvia: [
      '          if (ex.dir && !byDir.has(ex.dir)) byDir.set(ex.dir, ex);',
      '          if (ex.dir) { byDir.set(ex.dir, byDir.get(ex.dir) || ex); for (const dd of nodeExitDirs(node)) if (!byDir.has(dd)) byDir.set(dd, { to: null }); }   /* ★変異usedirsvia */'],
};
const MUT_ORDER = ['nodoorsoff', 'showhidden', 'imgafterdoor', 'noblock', 'noopen', 'usedirsvia'];
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
  /* ⚠ deviceScaleFactor は既定 (1) のまま。mapCanvas の backing は CSS px なので、
   *   タイル → 画素の対応が Math.round(tx*96 - camX) そのままで済む。 */
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
    /* ⚠ type で絞らず**全部拾って本文で判定する**。console.warn の type 名は
     *   puppeteer のバージョンで 'warning' / 'warn' が揺れ、絞ると警告を一度も
     *   拾わないまま「警告 0 件」で緑になる。 */
    if (o.warns) o.warns.push(t);
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    /* ⚠ dev モードの焼き込みを必ず消す。プロファイルに ?dev=1 が残っていると
     *   「dev 非解錠」の節が黙って解錠状態で走り、ゲートを一度も測らなくなる。 */
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

  const profile = require('./_pptr_profile')('df_doors_p2_');
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

  // ── §1 扉の一覧の出所 (doorsForRender) ────────────────────────────────────
  mark('§1 扉の一覧の出所');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const S = await page.evaluate(() => {
      const node = RUN.byId[currentNodeId];
      const dirs = [];
      for (const ex of (node.exits || [])) if (ex.dir && dirs.indexOf(ex.dir) < 0) dirs.push(ex.dir);
      return {
        doors: doorsForRender().map(d => ({
          id: d.id, tx: d.tx, ty: d.ty, orientation: d.orientation,
          state: d.state, keys: Object.keys(d),
        })),
        rooms: MAPDEF.rooms.map(r => r.rect.slice()),
        dirs: dirs,
        mapdefDoors: MAPDEF.doors,          // ★汚していないこと
        /* 権威の優先順: mapDef.doors を入れたらそちらが勝ち、自動生成は無視される。
         * ⚠ 元に戻してから返す (以降の節が別の状態を見ないように)。
         * ⚠⚠ [P8 で測り方だけ直した] **期待値は 1 文字も変えていない**。P4 までは
         *   doorsForRender が MAPDEF.doors を条件分岐で直に返していたので代入だけで観測できたが、
         *   P8 で一覧を組むのが rebuildNodeDoors ただ 1 つになり、優先順が決まる**瞬間**が
         *   そちらへ移った。よって実経路 (= 作り直し) を通して観測する。代入だけで測り続けると
         *   「実装がどこで優先順を決めているか」を追わない、意味の抜けた assert になる。 */
        priority: (() => {
          MAPDEF.doors = [{ id: 'a0', tx: 1, ty: 2, orientation: 'vertical',
                            state: 'closed', requiredKey: null }];
          rebuildNodeDoors(currentNodeId);
          const got = doorsForRender();
          MAPDEF.doors = null;
          rebuildNodeDoors(currentNodeId);
          const back = doorsForRender();
          return { authoredWins: got.length === 1 && got[0].id === 'a0', restored: back.length };
        })(),
      };
    });
    for (const e of errs) errsAll.push('§1: ' + e);
    await page.close();

    check('(1a) ★出口の向きの数だけ扉が立つ (母集団 = 向き ' + S.dirs.length + ' 件)',
      S.dirs.length >= 2 && S.doors.length === S.dirs.length,
      'dirs=' + S.dirs.join(',') + ' doors=' + S.doors.length);
    /* ★位置はドライバ側の契約 (最大面積の部屋の縁の中点) と**完全一致**すること。 */
    const posNg = S.dirs.filter(dir => {
      const want = gateTileOf(S.rooms, dir);
      const got = S.doors.find(d => d.id === 'gate-' + dir);
      return !got || got.tx !== want.tx || got.ty !== want.ty;
    });
    check('(1b) ★扉のタイルが gate タイルの契約と一致 (座標を直書きせず rect から導出)',
      S.dirs.length > 0 && posNg.length === 0,
      posNg.length ? 'NG=' + posNg.join(',') :
        S.doors.map(d => d.id + '@' + d.tx + ',' + d.ty).join(' '));
    const oriNg = S.dirs.filter(dir => {
      const got = S.doors.find(d => d.id === 'gate-' + dir);
      return !got || got.orientation !== WANT_ORIENT[dir];
    });
    check('(1c) 板の向きが口の向きと直交する (up/down=horizontal, left/right=vertical)',
      oriNg.length === 0, oriNg.length ? 'NG=' + oriNg.join(',') : 'ok');
    const keyNg = S.doors.filter(d => DOOR_KEYS.some(k => d.keys.indexOf(k) < 0) ||
                                      d.keys.length !== DOOR_KEYS.length);
    check('(1d) 扉 1 件の形が P1 で確定した 6 キーちょうど (target を持たない)',
      S.doors.length > 0 && keyNg.length === 0,
      'keys=' + (S.doors[0] ? S.doors[0].keys.join(',') : '(なし)'));
    check('(1e) ⚠ 自動生成が MAPDEF を汚していない (map-editor の書き出しに混ざらない)',
      S.mapdefDoors === null, 'MAPDEF.doors=' + JSON.stringify(S.mapdefDoors));
    check('(1f) ★mapDef.doors があればそちらが勝つ (出所の優先順)',
      S.priority.authoredWins && S.priority.restored === S.dirs.length,
      'authoredWins=' + S.priority.authoredWins + ' 復帰後=' + S.priority.restored);
    check('(1g) 初期状態はすべて closed (通れない側が既定 = fail-safe)',
      S.doors.length > 0 && S.doors.every(d => d.state === 'closed'),
      S.doors.map(d => d.state).join(','));
  }

  // ── §2 画素 (同一ページロード内の A/B) ────────────────────────────────────
  /* ⚠ A/B は**同一ページロード内**で採る。別ロードにすると情景・宝箱・敵の抽選が変わり、
   *   扉と無関係な画素差が混ざる ([[project-wall-tree-props]] で確立した作法)。
   * ⚠ 松明の炎ブルームは Date.now() でゆらぐ。時刻を固定しないと A/B 差分に必ず乗る。 */
  mark('§2 扉タイルの画素 / state ごとの塗り面積');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const P = await page.evaluate((states) => {
      const g = mapCanvas.getContext('2d');
      const W = mapCanvas.width, H = mapCanvas.height;
      const realNow = Date.now;
      Date.now = function () { return 1700000000000; };     // 炎のゆらぎを止める
      const snap = () => { renderMap(); return g.getImageData(0, 0, W, H).data; };
      const rects = doorsForRender().map(d => ({
        id: d.id,
        x0: Math.round(d.tx * 96 - camX), y0: Math.round(d.ty * 96 - camY),
      }));
      const inAny = (x, y) => rects.some(r => x >= r.x0 && x < r.x0 + 96 &&
                                              y >= r.y0 && y < r.y0 + 96);
      const saved = nodeDoors;
      nodeDoors = null;
      const baseImg = snap();                                // 扉なしの基準
      const measure = (st) => {
        nodeDoors = saved.map(d => Object.assign({}, d, { state: st }));
        const cur = snap();
        let inside = 0, outside = 0;
        const per = {};
        for (const r of rects) per[r.id] = 0;
        for (let i = 0; i < baseImg.length; i += 4) {
          if (baseImg[i] === cur[i] && baseImg[i + 1] === cur[i + 1] &&
              baseImg[i + 2] === cur[i + 2] && baseImg[i + 3] === cur[i + 3]) continue;
          const p = i / 4, x = p % W, y = (p / W) | 0;
          if (inAny(x, y)) {
            inside++;
            for (const r of rects) {
              if (x >= r.x0 && x < r.x0 + 96 && y >= r.y0 && y < r.y0 + 96) { per[r.id]++; break; }
            }
          } else outside++;
        }
        return { stats: { inside: inside, outside: outside, per: per }, img: cur };
      };
      const out = {}, imgs = {};
      for (const st of states) { const m = measure(st); out[st] = m.stats; imgs[st] = m.img; }
      /* ★locked と closed は**互いに**比べる。基準 (扉なし) との差分画素数で比べると、
       *   南京錠は「すでに変化済みの板の上」に乗るので増分 0 = 永久に見分けが付かない。 */
      let lockedVsClosed = 0;
      for (let i = 0; i < imgs.closed.length; i += 4) {
        if (imgs.closed[i] !== imgs.locked[i] || imgs.closed[i + 1] !== imgs.locked[i + 1] ||
            imgs.closed[i + 2] !== imgs.locked[i + 2]) lockedVsClosed++;
      }
      // 扉なしへ戻して基準と一致するかも見る (測定器そのものの健全性)
      nodeDoors = null;
      const again = snap();
      let selfDiff = 0;
      for (let i = 0; i < baseImg.length; i += 4) if (baseImg[i] !== again[i]) selfDiff++;
      nodeDoors = saved; renderMap();
      Date.now = realNow;
      return { out: out, rects: rects, selfDiff: selfDiff, lockedVsClosed: lockedVsClosed };
    }, DOOR_STATES);
    for (const e of errs) errsAll.push('§2: ' + e);
    await page.close();

    /* ★測定器そのもののガード。同じ状態を 2 回描いて差が出るなら、以下の全部が
     *   「扉のせい」ではなくなる (時刻ゆらぎ・非同期アセットの混入)。 */
    check('(2a) ★測定器の健全性: 同条件の再描画が完全一致 (時刻ゆらぎが混ざっていない)',
      P.selfDiff === 0, '差分画素=' + P.selfDiff);
    const C = P.out.closed;
    check('(2b) ★閉扉で画素が変わる (配線が生きている)',
      C.inside > 0 && P.rects.length >= 2 && P.rects.every(r => C.per[r.id] > 400),
      '扉ごと=' + P.rects.map(r => r.id + ':' + C.per[r.id]).join(' '));
    check('(2c) ★⚠ 変わるのは扉タイルの中だけ (床や壁へはみ出さない)',
      C.outside === 0, 'タイル外の変化画素=' + C.outside);
    check('(2d) ★hidden は 1 画素も描かない (隠し扉が薄く見えたら P6 の知覚判定が無意味になる)',
      P.out.hidden.inside === 0 && P.out.hidden.outside === 0,
      '内=' + P.out.hidden.inside + ' 外=' + P.out.hidden.outside);
    /* ★doorBlocks が false の状態は**塗る面積が小さい** = 口が空いている。
     *   「絵は閉じているのに通れる」を描画側から作れないことの実測。 */
    check('(2e) ★open / broken は閉扉より塗る面積が小さい (doorBlocks と絵が食い違わない)',
      P.out.open.inside > 0 && P.out.broken.inside > 0 &&
      P.out.open.inside < C.inside * 0.75 && P.out.broken.inside < C.inside * 0.75,
      'closed=' + C.inside + ' open=' + P.out.open.inside + ' broken=' + P.out.broken.inside);
    check('(2f) locked が closed と**見分けられる** (南京錠を形で足す。色だけだと暗幕で潰れる)',
      P.lockedVsClosed > 100 && P.out.locked.inside === C.inside,
      'closed↔locked の差分画素=' + P.lockedVsClosed);
  }

  // ── §3 描画順 (扉は「固定地形の後・キャラの前」) ──────────────────────────
  mark('§3 描画順');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const O = await page.evaluate(() => {
      const g = mapCanvas.getContext('2d');
      /* ⚠ 扉の目印は ctx.rotate。index.html で ctx.rotate を呼ぶのは扉の描画だけ
       *   (パーティクルは fxctx = 別のコンテキスト)。⚠ 横板は回さないので、
       *   **測るときだけ全部 vertical にして**必ず rotate が出る状態にする
       *   (グラフの形に母集団を握らせない)。 */
      /* ⚠⚠ **順序の基準は「最初の rotate」ではなく「drawDoors が返った時点」**。
       *   P7 で扉がベクタ描画からスプライトへ変わり、扉自身が drawImage を呼ぶように
       *   なったため、rotate 基準だと (3c) が「扉より後の drawImage = 扉の枚数」となって
       *   赤くなる。しかし (3c) の主張は「**扉より後に別の画像レイヤが描かれない**」で、
       *   扉自身の drawImage は数える対象ではない。measuring point だけを実経路へ直す
       *   (主張と期待値は 1 文字も変えない)。
       *   ⭐ drawDoors は classic script 直下の function 宣言なので再代入できる。 */
      const saved = nodeDoors;
      nodeDoors = saved.map(d => Object.assign({}, d, { orientation: 'vertical' }));
      const names = ['drawImage', 'rotate', 'fillRect'];
      const orig = {}, log = [];
      for (const n of names) {
        orig[n] = g[n];
        g[n] = function () { log.push(n); return orig[n].apply(this, arguments); };
      }
      const origDrawDoors = drawDoors;
      drawDoors = function () {
        log.push('doors:start');
        try { return origDrawDoors.apply(this, arguments); }
        finally { log.push('doors:end'); }
      };
      renderMap();
      drawDoors = origDrawDoors;
      for (const n of names) g[n] = orig[n];
      nodeDoors = saved; renderMap();
      const first = log.indexOf('rotate');
      const dEnd = log.lastIndexOf('doors:end');
      const zOf = (sel) => {
        const el = document.querySelector(sel);
        return el ? parseInt(getComputedStyle(el).zIndex || '0', 10) : null;
      };
      return {
        rotates: log.filter(x => x === 'rotate').length,
        doors: saved.length,
        sawDoorPass: dEnd >= 0,   // ★ラップが効いたか (効いていなければ下は全部空振り)
        imgBefore: first < 0 ? -1 : log.slice(0, first).filter(x => x === 'drawImage').length,
        imgAfter: dEnd < 0 ? -1 : log.slice(dEnd).filter(x => x === 'drawImage').length,
        imgInDoors: dEnd < 0 ? -1
          : log.slice(log.indexOf('doors:start'), dEnd).filter(x => x === 'drawImage').length,
        z: { map: zOf('#mapCanvas'), fx: zOf('#fxCanvas'), light: zOf('#lightingCanvas') },
      };
    });
    for (const e of errs) errsAll.push('§3: ' + e);
    await page.close();

    check('(3a) ★扉の描画が実際に走っている (rotate = 扉 1 枚につき 1 回)',
      O.rotates === O.doors && O.doors >= 2, 'rotate=' + O.rotates + ' 扉=' + O.doors);
    /* ⚠ 母集団ガード。扉より前に画像パスが 1 つも走っていなければ、下の (3c) は
     *   「順序が正しい」ではなく「比べる相手が居ない」で緑になってしまう。 */
    check('(3b) 母集団ガード: 扉より前に drawImage が走っている (比べる相手が居る)',
      O.imgBefore > 20, '扉より前の drawImage=' + O.imgBefore);
    /* ⚠ 装置 assert。drawDoors のラップが効かないと imgAfter が -1 になり、条件式の書き方に
     *   よっては黙って緑になりうる。「測れたこと」自体を先に 1 本立てる。 */
    check('(3b-装置) drawDoors の呼び出しを括れている (順序の基準点が取れた)',
      O.sawDoorPass === true && O.imgInDoors >= 0,
      'doorPass=' + O.sawDoorPass + ' 扉の中の drawImage=' + O.imgInDoors + ' (扉=' + O.doors + ' 枚)');
    check('(3c) ★扉より後に drawImage が 1 回も無い = 1枚絵/情景/壁立面/壁天面/樹木/松明の**すべて後**',
      O.imgAfter === 0, '扉より後の drawImage=' + O.imgAfter);
    /* ★キャラより下であることは z 順で挟む (扉は mapCanvas にしか描かれない)。 */
    check('(3d) ★mapCanvas (扉) < パーティクル < 暗幕 の z 順 = 扉はキャラの下に来る',
      O.z.map !== null && O.z.fx !== null && O.z.light !== null &&
      O.z.map < O.z.fx && O.z.fx < O.z.light,
      'map=' + O.z.map + ' fx=' + O.z.fx + ' light=' + O.z.light);
  }

  // ── §4 通行判定 (P3) ──────────────────────────────────────────────────────
  mark('§4 通行判定 (P3)');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const R = await page.evaluate((states) => {
      const doors = doorsForRender();
      /* ⚠ 母集団の確認。情景 (倒木など) が既に塞いでいるタイルの扉を選ぶと、開けても
       *   通れないので「扉が効いていない」と区別できない。**open で通れる扉**を選ぶ。 */
      let pick = null;
      for (const d of doors) {
        const st = d.state;
        d.state = 'open'; rebuildDoorBlockMask();
        const walkable = !isTileWall(d.tx, d.ty);
        d.state = st; rebuildDoorBlockMask();
        if (walkable) { pick = d; break; }
      }
      if (!pick) return { pick: null, doors: doors.length };
      const mapText = () => mapData.map(r => Array.from(r).join('')).join('|');
      const before = mapText();
      const got = {};
      for (const st of states) {
        pick.state = st; rebuildDoorBlockMask();
        got[st] = isTileWall(pick.tx, pick.ty);
      }
      pick.state = 'closed'; rebuildDoorBlockMask();
      const after = mapText();
      const snapClosed = snapToWalkable({ tx: pick.tx, ty: pick.ty });
      pick.state = 'open'; rebuildDoorBlockMask();
      const snapOpen = snapToWalkable({ tx: pick.tx, ty: pick.ty });
      pick.state = 'closed'; rebuildDoorBlockMask();
      return {
        pick: { tx: pick.tx, ty: pick.ty }, doors: doors.length, got: got,
        mapUnchanged: before === after, mapVal: mapData[pick.ty][pick.tx],
        snapClosedSame: snapClosed.tx === pick.tx && snapClosed.ty === pick.ty,
        snapOpenSame: snapOpen.tx === pick.tx && snapOpen.ty === pick.ty,
      };
    }, DOOR_STATES);
    for (const e of errs) errsAll.push('§4: ' + e);
    await page.close();

    check('(4a) 母集団ガード: 開ければ通れる扉が実在する (情景で塞がった扉を測っていない)',
      !!R.pick && R.doors >= 2, R.pick ? '扉=' + R.doors + ' 対象=' + R.pick.tx + ',' + R.pick.ty
                                       : '該当なし (扉=' + R.doors + ')');
    const blockNg = R.pick ? DOOR_STATES.filter(st => R.got[st] !== WANT_BLOCK[st]) : DOOR_STATES;
    check('(4b) ★isTileWall が全 5 state で契約と一致 (通すのは open と broken だけ)',
      blockNg.length === 0,
      DOOR_STATES.map(st => st + ':' + (R.got ? R.got[st] : '?')).join(' '));
    /* ★扉は描画パスでも当たり判定でも mapData を書き換えない。書き換えると
     *   「エディタでは床なのに本編では壁」という食い違いが保存側へ漏れる。 */
    check('(4c) ★mapData が 1 バイトも変わらない & 扉タイルは床のまま (値 2 ではない)',
      !!R.pick && R.mapUnchanged && R.mapVal !== 2,
      'mapData不変=' + R.mapUnchanged + ' 扉タイルの値=' + R.mapVal);
    check('(4d) ★snapToWalkable が閉扉を避け、開扉ではそのタイルを返す (P4 の順序が要る理由)',
      R.snapClosedSame === false && R.snapOpenSame === true,
      'closed時に同一=' + R.snapClosedSame + ' open時に同一=' + R.snapOpenSame);
  }

  // ── §5 出口選択で開く (P4) ────────────────────────────────────────────────
  mark('§5 出口選択で開く (P4)');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const K = await page.evaluate(async () => {
      const g = window.__graphRun;
      const snapshot = () => doorsForRender().map(d => d.id + ':' + d.state).sort();
      const before = snapshot();
      const ex = g.exits().filter(o => !o.back)[0];
      if (!ex) return { ex: null };
      /* ⚠ [P5] pick は async になった (施錠扉なら判定 2 段ぶん待つ)。await を落とすと
       *   Promise が返り、直後の snapshot が**開く前**を測って (5b)(5d) が偽の赤になる。 */
      const out = await g.pick(ex.to);
      const after = snapshot();
      const here = doorsForRender().find(d => d.tx === ex.at.tx && d.ty === ex.at.ty);
      return {
        ex: { to: ex.to, at: ex.at }, before: before, after: after,
        stateHere: here ? here.state : null,
        others: doorsForRender().filter(d => !(d.tx === ex.at.tx && d.ty === ex.at.ty))
                                .map(d => d.state),
        walkable: !isTileWall(ex.at.tx, ex.at.ty),
        goal: out ? out.at : null,
      };
    });
    for (const e of errs) errsAll.push('§5: ' + e);
    await page.close();

    check('(5a) 母集団ガード: 未踏の出口があり、選ぶ前は全部 closed',
      !!K.ex && K.before.length >= 2 && K.before.every(s => /:closed$/.test(s)),
      K.ex ? K.before.join(' ') : '未踏の出口なし');
    check('(5b) ★選んだ出口の扉**だけ**が open になる (扉はタイルで同定・他は閉じたまま)',
      K.stateHere === 'open' && K.others.length > 0 && K.others.every(s => s === 'closed'),
      '選んだ扉=' + K.stateHere + ' 他=' + (K.others || []).join(','));
    check('(5c) ★開いた扉のタイルが通行可能になった',
      K.walkable === true, 'walkable=' + K.walkable);
    /* ★順序の肝。開ける前に目標を決めると snapToWalkable が閉扉を避けて手前のタイルを
     *   返し、到達検出が一生成立しない = 潜行が詰む。 */
    check('(5d) ★heroForcedGoal が扉タイルそのもの (開ける→目標決定 の順序が守られている)',
      !!K.goal && !!K.ex && K.goal.tx === K.ex.at.tx && K.goal.ty === K.ex.at.ty,
      'goal=' + (K.goal ? K.goal.tx + ',' + K.goal.ty : 'なし') +
      ' 扉=' + (K.ex ? K.ex.at.tx + ',' + K.ex.at.ty : '-'));
  }

  // ── §6 撤退スイッチ / dev ゲート / 不変性 ─────────────────────────────────
  mark('§6 撤退スイッチ / dev ゲート / 不変性');
  {
    const errs = [];
    // (6a) 撤退スイッチ ?doors=0 で扉が丸ごと消え、当たり判定も P2 以前へ戻る
    const p0 = await bootPage(browser, base + '/index.html?doors=0&diag=1&intel=0', STAGE, errs);
    const off = await p0.evaluate(() => {
      const node = RUN.byId[currentNodeId];
      const dirs = [];
      for (const ex of (node.exits || [])) if (ex.dir && dirs.indexOf(ex.dir) < 0) dirs.push(ex.dir);
      const g = dirs.length ? nodeGateTile(MAPDEF, dirs[0]) : null;
      return { n: doorsForRender().length, mask: doorBlockTiles,
               gateWall: g ? isTileWall(g.tx, g.ty) : null };
    });
    await p0.close();
    check('(6a) ★撤退スイッチ ?doors=0 で扉 0 枚・通行判定も素に戻る',
      off.n === 0 && off.mask === null && off.gateWall === false,
      '枚数=' + off.n + ' マスク=' + off.mask + ' gateが壁=' + off.gateWall);

    // (6b) ?doors=states は dev ゲート付き。非解錠なら効かず、**黙って無視せず**警告を出す
    const warns = [];
    const p1 = await bootPage(browser, base + '/index.html?doors=states&locks=0', STAGE, errs, { warns: warns });
    const locked = await p1.evaluate(() => ({
      states: doorsForRender().map(d => d.state), unlocked: window.__dfDevUnlocked() }));
    await p1.close();
    check('(6b) ★dev 非解錠では ?doors=states が効かず (全部 closed)、警告が出る',
      locked.unlocked === false && locked.states.length > 0 &&
      locked.states.every(s => s === 'closed') &&
      warns.some(w => /dev 専用パラメータ \?doors/.test(w)),
      '状態=' + locked.states.join(',') + ' 警告=' + warns.filter(w => /\?doors/.test(w)).length);

    // (6c) 既存 6 シナリオすべてに扉が立ち、mapDef は汚れていない
    const per = [];
    for (const scen of SCENARIOS) {
      const p = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', scen, errs);
      const r = await p.evaluate(() => ({ n: doorsForRender().length, mapdef: MAPDEF.doors }));
      await p.close();
      per.push(scen + ':' + r.n + (r.mapdef === null ? '' : '(汚染!)'));
    }
    check('(6c) ★既存 6 シナリオすべてで扉が立つ (自動生成が本番へ載っている)',
      per.length === SCENARIOS.length && per.every(x => /:[1-9]\d*$/.test(x)), per.join(' '));

    // (6d) 分岐を持たない従来経路 (?graph=0) では 1 枚も立たない
    const p2 = await bootPage(browser, base + '/index.html?graph=0&diag=1&intel=0', STAGE, errs);
    const old = await p2.evaluate(() => ({ n: doorsForRender().length, run: !!RUN,
                                           mask: doorBlockTiles }));
    await p2.close();
    check('(6d) 分岐なしの従来経路 (?graph=0) では扉 0 枚 = 単一マップは 1 命令も変わらない',
      old.n === 0 && old.run === false && old.mask === null, '枚数=' + old.n);

    /* ★(6e) 実際に踏んだ欠陥の検出器。扉は当たり判定に載った = 盤面の一部なので、
     *   「どちらから入ったか」に依存すると別経路で戻ったときに宝箱と罠の抽選まで変わる。 */
    const p3 = await bootPage(browser, base + '/index.html?diag=1&intel=0&locks=0&secret=0', STAGE, errs);
    const det = await p3.evaluate(async () => {
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const g = window.__graphRun;
      const graph = g.graph(), parent = g.parent();
      /* ⚠⚠ 入場方向は**出口に無い向き**の裏返しから選ぶ。適当に 'down'/'left' を入れると、
       *   その裏返しが既に出口に在るノードでは欠陥を入れても集合が変わらず、
       *   検出器が永久に緑になる (実際 n1 の出口が {up,right} でそうなった)。 */
      let child = null, node = null, novel = null;
      for (const n of graph.nodes) {
        if (!parent[n.id]) continue;
        const ex = new Set((n.exits || []).map(e => e.dir).filter(Boolean));
        const nv = ['up', 'down', 'left', 'right'].filter(d => !ex.has(d));
        if (ex.size >= 1 && nv.length >= 2) { child = n.id; node = n; novel = nv; break; }
      }
      if (!child) return { child: null };
      const via1 = OPP[novel[0]], via2 = OPP[novel[1]];
      const snap = () => doorsForRender().map(d => d.tx + ',' + d.ty).sort().join(' ');
      await g.enter(child, via1); const a = snap();
      const rooms = MAPDEF.rooms.map(r => r.rect.slice());
      await g.enter(child, via2); const b = snap();
      return {
        child: child, a: a, b: b, via1: via1, via2: via2, rooms: rooms,
        exitDirs: Array.from(new Set((node.exits || []).map(e => e.dir).filter(Boolean))),
      };
    });
    await p3.close();
    check('(6e) ★★扉の集合が node id だけで決まる (入場方向に依存しない = 盤面の抽選が漏れない)',
      !!det.child && !!det.a && det.a === det.b,
      det.child ? 'node=' + det.child + ' via' + det.via1 + '=[' + det.a + '] via' +
                  det.via2 + '=[' + det.b + ']' : '母集団なし (出口に無い向きが 2 つある子ノード)');
    /* ★直接の不変条件: 扉のタイル集合 = **出口の向きから導いた gate タイル**そのもの。
     *   (6e) が「2 回とも同じ」だけを見るのに対し、こちらは「正しい集合か」を見る。 */
    const wantSet = det.child
      ? det.exitDirs.map(d => gateTileOf(det.rooms, d)).map(t => t.tx + ',' + t.ty).sort().join(' ')
      : null;
    check('(6f) ★扉のタイル集合が出口の向きから導いた gate タイルと完全一致 (引き返し口は含まない)',
      !!det.child && det.a === wantSet,
      '実測=[' + (det.a || '') + '] 契約=[' + (wantSet || '') + '] 出口=' +
      (det.exitDirs || []).join(','));
    for (const e of errs) errsAll.push('§6: ' + e);
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
