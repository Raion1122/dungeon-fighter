#!/usr/bin/env node
/*
 * driver_mapdef_step2.js — Phase 2「mapDef 受け入れ + ワンクリック試遊」の測定装置
 * ═════════════════════════════════════════════════════════════════════════════
 * 計画書: C:\Users\PC_User\.claude\plans\dnd-trpg-map-serialized-quail.md
 *          の「Phase 2」節と「落とし穴（Phase 2 で必ず同時に潰す）」8 件が唯一の正。
 * テンプレ: tools/driver_mapdef_step1.js (内蔵 http + prelude + check 集計)。
 *
 * ■ Phase 1 の driver とは測るものが正反対
 *   step1 は「値が 1bit も変わっていない」= **非退行**を測る装置だった。
 *   step2 は「カスタム幾何がちゃんと**別のマップになる**」= **新しい振る舞い**を測る。
 *   したがって baseline worktree は使わない。代わりに **同じ payload を ?mapdef=0 でも走らせ**、
 *   幾何が既定へ戻ることを対にして見る (= 撤退スイッチ自体が負のコントロールを兼ねる)。
 *
 * ■ ⚠ 真空 PASS への対策 (step1 で踏んだ罠をそのまま持ち込む)
 *   「両方 undefined」「両方 空配列」でも一致してしまうので、全 assert に
 *   **母集団が空でないこと**のガードを同時に置く:
 *     ・カスタム ROOMS は 3 室で、既定 2 室と**実際に違う**ことを両方 assert する
 *     ・mapData は 28x72 で床(0)と岩盤(2)の両方が存在する
 *     ・ENEMY_SPAWNS は 1 件以上で各要素が [key,tx,ty] 形
 *     ・§3 の「1枚絵 0 枚」は、**既定経路では 1 枚以上出る**ことを対で測って初めて意味を持つ
 *       (goblin-mine は ROOM_PAINTINGS_DEF を持つので、そこで 0 枚なら装置の故障)
 *
 * ■ assert の並び
 *   §0  装置の健全性 (payload が届いた / DFMapDef が生きている / 404 ゼロ)
 *   §1  カスタム幾何の採用          … ROOMS / mapData / START_TX,TY / BOSS_ROOM_IDX / OBJECTIVE_ROOMS
 *   §2  落とし穴② 岩盤の敵の退避    … 値2 に置いた敵が床へ移り、alive のまま残らない
 *   §3  落とし穴③ 1枚絵・情景 OFF   … roomPaintings 0 枚 / sceneryPlacements 0 個 (既定経路では出る)
 *   §4  落とし穴④ spawns 空の化け   … 廃坑の敵 (27,13)(57,13) が湧かない
 *   §5  落とし穴⑤ 屋外テーマ排他    … themeId:"caravan-road" のカスタムは既定幾何へ落ちる
 *   §6  撤退スイッチ ?mapdef=0       … 同じ payload で既定 2 室へ戻る
 *   §7  到達可能性                   … ?autoplay で dungeonCleared === true になる
 *   §8  lint (到達不能マップ)        … 廊下を 1 本抜くと unreachable-room を**事前に**検出する
 *   §9  map-editor の playMap()      … payload 生成 / lint エラー時は出発しない / 屋外は出発しない
 *   §10 ドリフト検出 (静的ファイル)  … tavern.html の救命ボートが DEFAULT_DUNGEON と一致する
 *
 * ■ 負のコントロール (2 種類)
 *   (a) 撤退スイッチ … §6。?mapdef=0 で幾何が既定へ戻ることを対で測る。
 *       resolve() が mapDef を読んでいなければ §1 と §6 が同じ値になり §1 が落ちる。
 *   (b) 変異負制御 --mutate <kind> … cur 側にだけ欠陥を注入し、必ず exit 1 になることを確認する。
 *       kind      | 注入する欠陥                                  | 落ちるべき節
 *       ----------|-----------------------------------------------|----------------
 *       noaccept  | resolve() が mapDef を読まない (常に既定)     | §1 §2 §7
 *       nogate    | 幾何は採用するが isCustom を false に潰す      | §2 §3 §4
 *       ⚠ 注入が空振りしていないことは (M1) が毎回実測する
 *         (「注入したつもりで効いていない」= 全 PASS = 偽の安心 を潰す)。
 *       ⚠⚠ 注入点は **window.DFMapDef へのアクセサ**。df-mapdef.js は IIFE の末尾で
 *         global.DFMapDef へ代入するので、その setter を先に仕掛けておけば掴める。
 *         evaluateOnNewDocument はリロードのたびに必要 (過去に踏んだ罠)。
 *
 * ■ プロファイル
 *   ⚠ Chrome プロファイルは必ず require('./_pptr_profile') で作る。自前で --user-data-dir を
 *     作ると消し忘れて滞留する (実測 1710 個・8.0GB の前科あり)。
 *
 * 使い方:
 *   node tools/driver_mapdef_step2.js [--headful] [--browser <path>] [--port N]
 *                                     [--mutate noaccept|nogate] [--skip-autoplay]
 *   exit: 0=全 PASS / 1=FAIL あり (変異時は「捕まえた」= 期待どおり) / 2=環境不備 /
 *         3=装置の故障 (未知の kind・例外・変異が注入できていない) / 4=assert の穴
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8921'), 10);
const SEED = parseInt(arg('seed', '20260802'), 10);
const SKIP_AUTOPLAY = flag('skip-autoplay');
const MUTATE = arg('mutate', null);
const MUT_KINDS = ['noaccept', 'nogate'];
if (MUTATE && MUT_KINDS.indexOf(MUTATE) < 0) {
  console.error('[driver] 未知の --mutate: ' + MUTATE + ' (' + MUT_KINDS.join(' / ') + ')');
  process.exit(3);
}

/* ── テスト用のカスタムマップ ────────────────────────────────────────────────
 *  ⚠ 既定 (山場[7,24,20,43] + ボス[5,47,22,68] / 起点 24,13) と**どの数値も重ならない**
 *    ように選ぶ。1 つでも一致していると「採用されていないのに PASS」が起こりうる。
 *  ⚠ rect = [r1,c1,r2,c2] (行が先) / slots = [tx,ty] (列が先)。順序を取り違えると
 *    lint が slot-on-wall を吐いて §1 より前で落ちる。
 *  幾何: c0(起点) ─廊下─ c1(道中) ─廊下─ c2(ボス)  すべて 4 近傍で連結。
 *
 *  ⚠⚠ **横の長さは既定と同程度 (起点 → ボスで約 34 タイル) に収めること。**
 *    2026-08-02 の初版は tx10 → tx60 = 50 タイルで、§7 の実プレイが
 *    **index.html 自身の「ラン ハード上限 4 分」(console.error [DIAG][run-timeout]) に
 *    衝突して強制終了**していた。ドライバがゲーム側のガードレールと競争しても意味がない。
 *    ここを広げるときは §7 の HARD_MS を必ず見直すこと。
 *    ★[2026-08-20] 本体側の「実時間 4 分の固定上限」は**進行ウォッチドッグ**へ置き換わった
 *    (詰み = 90 秒まったく進行しない)。長いだけでは [DIAG][run-timeout] は鳴らないので、
 *    横幅の制約は「ドライバの HARD_MS に収まるか」だけになった。 */
const CUSTOM_ROOMS = [
  { id: 'c0', role: 'start', rect: [17,  5, 25, 18],
    enemySlots: [[8, 19], [12, 22]], bossSlot: null, painting: null, scenery: null },
  /* ⚠⚠ 種類固定スロットのキーは **THEME_DEFAULT_ENEMIES["goblin-mine"].mob に無い敵**を選ぶ。
   *   おまかせ抽選はそのプール (goblin/goblinArcher/kobold/hobgoblin) から引くので、
   *   プール内の敵を固定キーにすると「固定を無視して抽選しても、たまたま一致して PASS」する
   *   = assert の穴になる。実際 2026-08-02 の初回実行では goblinArcher が抽選で 2 回出ていた。
   *   rat は ENEMY_TYPES に実在し (実読で確認済み) かつプール外なので、
   *   出てきたら**固定キーが尊重された以外にあり得ない**。 */
  { id: 'c1', role: null,    rect: [14, 22, 24, 34],
    enemySlots: [[26, 18], [30, 16, 'rat'], [32, 21]], bossSlot: null, painting: null, scenery: null },
  { id: 'c2', role: 'boss',  rect: [16, 38, 25, 50],
    enemySlots: [], bossSlot: [44, 20], painting: null, scenery: null },
];
const CUSTOM_CORRIDORS = [ [19, 18, 20, 22], [19, 34, 20, 38] ];

function customMapDef(over) {
  const d = {
    schema: 'df-map/1',
    id: 'drv-step2-custom',
    name: '検証用カスタム坑道',
    grid: { w: 72, h: 28, tile: 96 },
    themeId: 'goblin-mine',
    rooms: JSON.parse(JSON.stringify(CUSTOM_ROOMS)),
    corridors: JSON.parse(JSON.stringify(CUSTOM_CORRIDORS)),
    start: { tx: 10, ty: 20 },
    objective: { kind: 'visitRooms', count: null },
    tiles: null,
    flags: { bandMask: false },
  };
  return Object.assign(d, over || {});
}

// 既定 (df-mapdef.js DEFAULT_DUNGEON) の値。§1/§6 で「戻ったこと」を測る基準。
const DEFAULT_ROOMS_JSON = JSON.stringify([[7, 24, 20, 43], [5, 47, 22, 68]]);
const CUSTOM_ROOMS_JSON  = JSON.stringify(CUSTOM_ROOMS.map(r => r.rect));

// 廃坑の spawns にある象徴的な座標。§4 で「これが湧いていない」ことを測る。
const MINE_SIGNATURE_TILES = [[27, 13], [57, 13]];

function payloadCustom(over) {
  return Object.assign({
    title: '検証用カスタム坑道',
    flavor: 'driver_mapdef_step2',
    themeId: 'goblin-mine',
    mapDef: customMapDef(),
    // ⚠ 座標は CUSTOM_ROOMS の enemySlots / bossSlot と一致させること (ずれると lint とは別に
    //   §2 の「元から床にいた敵は動いていない」が壊れる)。
    spawns: [
      ['goblin', 8, 19], ['goblin', 12, 22],
      ['kobold', 26, 18], ['goblinArcher', 30, 16], ['kobold', 32, 21],
      ['goblinKing', 44, 20],
    ],
    trapCount: 3, hiddenChestCount: 2, perceptionDC: 14, clearXp: 0,
    questLevel: 5, tierKey: 'tier2', source: 'map-editor',
  }, over || {});
}

// ── puppeteer / Chrome ──────────────────────────────────────────────────────
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ── 静的サーバ ──────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* ⚠ /favicon.ico は Chrome が勝手に取りに行く物でゲーム側の欠陥ではない。
 *   除外は必ず **URL** で行う。「404」という本文で一括除外すると js/df-mapdef.js の
 *   404 まで一緒に消えて 404 検出器が黙って死ぬ (step1 で踏んだ罠)。 */
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)/;

/* ⚠ 「既存欠陥だから判定から外す」枠。**今は空**。
 *
 *   ここには一時的に /\[DIAG\]\[result-double-fire\]/ が入っていた。index.html:27210 の監視
 *   setInterval が 300ms 周期なのに showResult を 500ms 遅らせて呼ぶため予約が 2 回積まれる、
 *   という Phase 2 と無関係の既存欠陥で、素の goblin-mine でも再現することを対照実験で実証した。
 *   ★2026-08-02 に `resultPending` フラグで**修正済み**なので除外を解除した
 *     = 再発したら §7 7f が捕まえる (回帰検出器に戻した)。
 *
 *   ⚠⚠ ここに足してよいのは「別経路で既存だと**実証した**もの」だけ。実証せずに足すと、
 *     本ドライバが自分で見つけた欠陥を自分で隠すことになる。
 *   ⚠⚠ 直したら**必ずここから外す**。直った欠陥のフィルタを残すと、次に同じ壊れ方をしたとき
 *     無言で通ってしまう (フィルタは assert を殺す)。 */
const PREEXISTING_RE = /(?!)/;   // 何にもマッチしない (常に false)

function startServer(port, root) {
  const rec = { notFound: [], ignored404: [] };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(root, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          (IGNORED_URL_RE.test(u) ? rec.ignored404 : rec.notFound).push(u);
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve({ srv, rec }));
  });
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

const T_BASE_MS = 1700000000000;

/* ── 変異負制御の注入 ───────────────────────────────────────────────────────
 *  ⚠⚠ 注入点は **window.DFMapDef へのアクセサ**。js/df-mapdef.js は IIFE 末尾で
 *    global.DFMapDef = {...} を代入するので、その setter を先に仕掛けて掴む。
 *    (inline に直書きされていたらこの手は使えない = df-mapdef.js を分離した 2 つ目の理由) */
function installMutation(kind) {
  let _v;
  window.__dfMut = { kind: kind, installed: true, wrapped: false, calls: 0 };
  Object.defineProperty(window, 'DFMapDef', {
    configurable: true,
    get: function () { return _v; },
    set: function (v) {
      _v = v;
      if (!v || typeof v.resolve !== 'function') return;
      const orig = v.resolve;
      v.resolve = function (genScen, isField, params) {
        window.__dfMut.calls++;
        if (kind === 'noaccept') {
          // mapDef を読まない = Phase 1 の振る舞いへ巻き戻す
          const o = orig.call(this, null, isField, params);
          o.isCustom = false;
          return o;
        }
        if (kind === 'nogate') {
          // 幾何は採用するが isCustom を潰す = カスタム専用ゲートが全部閉じたまま
          const o = orig.apply(this, arguments);
          o.isCustom = false;
          return o;
        }
        return orig.apply(this, arguments);
      };
      window.__dfMut.wrapped = true;
    },
  });
}
async function applyMutation(page) {
  if (!MUTATE) return;
  await page.evaluateOnNewDocument(installMutation, MUTATE);
}

// ── プレリュード (index.html より先に走る) ──────────────────────────────────
function prelude(cfg) {
  try {
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
    sessionStorage.removeItem('dragonfighters.pendingSummon');
    if (cfg.payload) sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
    else sessionStorage.removeItem('dragonfighters.generatedScenario');
    if (cfg.scen) sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen);
  } catch (e) {}

  const T0 = cfg.t0;
  const OrigDate = Date;
  window.Date = function (a) { return arguments.length ? new OrigDate(a) : new OrigDate(T0); };
  window.Date.now = function () { return T0; };
  window.Date.prototype = OrigDate.prototype;

  let _s = (cfg.seed || 20260802) >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };

  // console.warn を溜める (§2 の退避ログ / §5 の排他ログを直接測るため)
  window.__warns = [];
  const ow = console.warn;
  console.warn = function () {
    try { window.__warns.push(Array.prototype.join.call(arguments, ' ')); } catch (e) {}
    return ow.apply(console, arguments);
  };
}

// ── in-page プローブ ────────────────────────────────────────────────────────
async function probe(page) {
  return page.evaluate(() => {
    const g = (fn, d) => { try { const v = fn(); return (v === undefined) ? d : v; } catch (e) { return d; } };
    const out = {};
    out.hasDFMapDef = !!window.DFMapDef;
    out.scenarioId = g(() => scenarioId, '<none>');
    out.isCustom = g(() => MAPDEF.isCustom, '<none>');
    out.mapdefId = g(() => MAPDEF.id, '<none>');
    out.roomsJson = g(() => JSON.stringify(ROOMS), '<none>');
    out.roomsLen = g(() => ROOMS.length, -1);
    out.corridorsJson = g(() => JSON.stringify(CORRIDORS), '<none>');
    out.startTx = g(() => START_TX, '<none>');
    out.startTy = g(() => START_TY, '<none>');
    out.bossRoomIdx = g(() => BOSS_ROOM_IDX, '<none>');
    out.objectiveRooms = g(() => OBJECTIVE_ROOMS, '<none>');
    out.isFieldTheme = g(() => IS_FIELD_THEME, '<none>');

    const md = g(() => mapData, null);
    if (Array.isArray(md)) {
      out.mapRows = md.length;
      out.mapCols = Array.from(new Set(md.map(r => (r && r.length) || -1)));
      const tally = {};
      for (const row of md) for (const v of row) tally[v] = (tally[v] || 0) + 1;
      out.mapTally = tally;
      // 各部屋の代表タイルが床になっているか (幾何が本当に掘られたかの直接証明)
      out.probeTiles = g(() => ROOMS.map(function (q) {
        const r = Math.floor((q[0] + q[2]) / 2), c = Math.floor((q[1] + q[3]) / 2);
        return md[r][c];
      }), '<none>');
    } else { out.mapRows = -1; out.mapCols = []; out.mapTally = {}; out.probeTiles = '<none>'; }

    const sp = g(() => ENEMY_SPAWNS, null);
    out.spawnsJson = Array.isArray(sp) ? JSON.stringify(sp) : '<none>';
    out.spawnsLen = Array.isArray(sp) ? sp.length : -1;
    out.spawnsShapeOk = Array.isArray(sp) && sp.every(s =>
      Array.isArray(s) && typeof s[0] === 'string' && typeof s[1] === 'number' && typeof s[2] === 'number');
    // 敵が岩盤 (値2) の上にいないか = 落とし穴② の直接測定
    out.spawnsOnWall = (Array.isArray(sp) && Array.isArray(md))
      ? sp.filter(s => md[s[2]] && md[s[2]][s[1]] === 2).map(s => [s[0], s[1], s[2]])
      : '<none>';

    out.paintings = g(() => roomPaintings.length, -1);
    out.scenery = g(() => sceneryPlacements.length, -1);
    out.warns = g(() => (window.__warns || []).slice(), []);
    out.mut = g(() => (window.__dfMut ? JSON.parse(JSON.stringify(window.__dfMut)) : null), null);
    return out;
  });
}

async function bootPage(browser, url, pre, opt) {
  const o = opt || {};
  const page = await browser.newPage();
  const errs = [], preexisting = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = (typeof m.location === 'function') ? m.location() : null;
    if (loc && loc.url && IGNORED_URL_RE.test(loc.url)) return;
    const txt = m.text();
    // ★既存欠陥は errs から外すが preexisting[] に残して必ず表示する (無言で消さない)
    if (PREEXISTING_RE.test(txt)) { preexisting.push(txt); return; }
    errs.push('console.error: ' + txt + (loc && loc.url ? '  @' + loc.url : ''));
  });
  page.on('response', r => {
    if (r.status() >= 400 && !IGNORED_URL_RE.test(r.url())) errs.push('http' + r.status() + ': ' + r.url());
  });
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, pre);
  await applyMutation(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  if (o.wait !== false) {
    await page.waitForFunction(() => {
      try { return !!mapData && typeof ROOMS !== 'undefined' && typeof MAPDEF !== 'undefined'; }
      catch (e) { return false; }
    }, { timeout: 30000, polling: 100 });
  }
  return { page, errs, preexisting };
}

// 共通: index.html を1回開いて probe を返す
async function runIndex(browser, base, cfg, query) {
  const url = base + '/index.html' + (query || '');
  const { page, errs } = await bootPage(browser, url,
    { payload: cfg.payload || null, scen: cfg.scen || null, t0: T_BASE_MS, seed: SEED });
  // 情景/1枚絵は ENEMY_SPAWNS 確定後に組まれるので、少しだけ待つ
  await new Promise(r => setTimeout(r, 900));
  const p = await probe(page);
  p.errs = errs;
  await page.close();
  return p;
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  /* ⚠ makeProfile は **ディレクトリのパス文字列**を返す (オブジェクトではない)。
   *   後始末は process の exit / SIGINT フックで自動的に行われるので呼び出し側は何もしない。
   *   ⚠⚠ ここを profile.dir と書くと undefined が userDataDir へ渡り、puppeteer が
   *     自前の一時プロファイルを作る = このモジュールを使う意味 (滞留の回収) が丸ごと消える。 */
  const profile = makeProfile('df_mapdef2_');

  let srv = null, browser = null, rec = null;
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] seed=' + SEED + ' / mutate=' + (MUTATE || 'なし'));

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: HEADFUL ? false : 'new',
      userDataDir: profile,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
    });

    // ═══ §0 + §1  カスタム幾何の採用 ═══════════════════════════════════════
    mark('§1 カスタム mapDef を注入して index.html を起動');
    const cust = await runIndex(browser, BASE, { payload: payloadCustom() });
    console.log('     isCustom=' + cust.isCustom + '  rooms=' + cust.roomsLen
      + '  start=(' + cust.startTx + ',' + cust.startTy + ')  spawns=' + cust.spawnsLen);

    check('§0 0a DFMapDef が読み込まれている (js/df-mapdef.js が 404 でない)', cust.hasDFMapDef === true,
      'hasDFMapDef=' + cust.hasDFMapDef);
    check('§0 0b 生成クエストとして起動している', cust.scenarioId === 'generated-quest',
      'scenarioId=' + cust.scenarioId);
    check('§0 0c pageerror / console.error / HTTP 4xx-5xx が 0 件', cust.errs.length === 0,
      cust.errs.slice(0, 3).join(' | '));
    check('§0 0d 404 が 0 件 (favicon 除く)', rec.notFound.length === 0,
      'notFound=' + JSON.stringify(rec.notFound.slice(0, 5)));
    if (MUTATE) {
      check('§0 M1 変異が実際に注入されている (空振りしていない)',
        !!(cust.mut && cust.mut.wrapped && cust.mut.calls > 0),
        JSON.stringify(cust.mut));
    }

    check('§1 1a MAPDEF.isCustom が true', cust.isCustom === true, 'isCustom=' + cust.isCustom);
    check('§1 1b MAPDEF.id が注入した id', cust.mapdefId === 'drv-step2-custom', 'id=' + cust.mapdefId);
    check('§1 1c ROOMS が定義どおり 3 室', cust.roomsJson === CUSTOM_ROOMS_JSON,
      'rooms=' + cust.roomsJson);
    check('§1 1d ROOMS が既定 2 室と**違う** (母集団が空でない証明)',
      cust.roomsJson !== DEFAULT_ROOMS_JSON && cust.roomsLen === 3,
      'len=' + cust.roomsLen);
    check('§1 1e CORRIDORS が定義どおり',
      cust.corridorsJson === JSON.stringify(CUSTOM_CORRIDORS), cust.corridorsJson);
    check('§1 1f 起点が (10,20) (既定 24,13 ではない)',
      cust.startTx === 10 && cust.startTy === 20, cust.startTx + ',' + cust.startTy);
    check('§1 1g BOSS_ROOM_IDX が role:"boss" の 2', cust.bossRoomIdx === 2, 'idx=' + cust.bossRoomIdx);
    check('§1 1h OBJECTIVE_ROOMS が rooms.length-1 = 2', cust.objectiveRooms === 2,
      'n=' + cust.objectiveRooms);
    check('§1 1i mapData が 28 行 x 72 列', cust.mapRows === 28 && JSON.stringify(cust.mapCols) === '[72]',
      cust.mapRows + ' rows / cols=' + JSON.stringify(cust.mapCols));
    check('§1 1j mapData に床(0) と岩盤(2) の両方がある (真空でない)',
      (cust.mapTally['0'] || 0) > 0 && (cust.mapTally['2'] || 0) > 0, JSON.stringify(cust.mapTally));
    check('§1 1k 3 室すべての中心タイルが掘られている (壁2 でない)',
      Array.isArray(cust.probeTiles) && cust.probeTiles.length === 3 && cust.probeTiles.every(v => v !== 2),
      'tiles=' + JSON.stringify(cust.probeTiles));
    check('§1 1l ENEMY_SPAWNS が 6 体で [key,tx,ty] 形',
      cust.spawnsLen === 6 && cust.spawnsShapeOk === true,
      'len=' + cust.spawnsLen + ' shape=' + cust.spawnsShapeOk);

    // ═══ §2 落とし穴② 岩盤の敵の退避 ═══════════════════════════════════════
    mark('§2 岩盤 (値2) に敵を置いた payload で退避が効くか');
    // (0,0) と (70,26) は部屋にも廊下にも属さない = 必ず値2。room 内の (12,22) も 1 体残す。
    const wallPayload = payloadCustom({
      spawns: [['goblin', 0, 0], ['kobold', 70, 26], ['goblin', 12, 22], ['goblinKing', 44, 20]],
    });
    const wall = await runIndex(browser, BASE, { payload: wallPayload });
    console.log('     spawns=' + wall.spawnsJson);
    check('§2 2a 岩盤に置いた敵が 1 体も値2 の上に残っていない',
      Array.isArray(wall.spawnsOnWall) && wall.spawnsOnWall.length === 0,
      'onWall=' + JSON.stringify(wall.spawnsOnWall));
    check('§2 2b 退避しても体数は減っていない (4 体)', wall.spawnsLen === 4, 'len=' + wall.spawnsLen);
    check('§2 2c 退避ログが console.warn に出ている (無言で動かしていない)',
      (wall.warns || []).some(w => /岩盤 \(値2\) の上にいたため/.test(w)),
      (wall.warns || []).filter(w => /mapdef/.test(w)).slice(0, 2).join(' | '));
    check('§2 2d 元から床にいた敵は動いていない ((12,22) がそのまま)',
      /\["goblin",12,22\]/.test(wall.spawnsJson || ''), wall.spawnsJson);

    // ═══ §3 落とし穴③ 1枚絵・情景 OFF ═════════════════════════════════════
    mark('§3 カスタム幾何では 1枚絵と情景が出ない / 既定経路では出る (対で測る)');
    /* ⚠ `'?graph=0'` は 2026-08-08 (P5) に足した。廃坑が既定で分岐版になったので、
     *   付けないとこの「既定 goblin-mine」対照が分岐ノード (1枚絵なし・情景のみ) になり、
     *   (3a)「1枚絵が 1 枚以上出る」が装置の故障ではなく仕様変更で落ちる。 */
    const legacy = await runIndex(browser, BASE, { scen: 'goblin-mine' }, '?graph=0');
    console.log('     legacy: paintings=' + legacy.paintings + ' scenery=' + legacy.scenery
      + '  /  custom: paintings=' + cust.paintings + ' scenery=' + cust.scenery);
    check('§3 3a [対照] 既定 goblin-mine では 1枚絵が 1 枚以上出る (装置が生きている証明)',
      legacy.paintings > 0, 'paintings=' + legacy.paintings);
    check('§3 3b [対照] 既定 goblin-mine では情景が 1 個以上出る',
      legacy.scenery > 0, 'scenery=' + legacy.scenery);
    check('§3 3c カスタム幾何では 1枚絵が 0 枚', cust.paintings === 0, 'paintings=' + cust.paintings);
    check('§3 3d カスタム幾何では情景が 0 個', cust.scenery === 0, 'scenery=' + cust.scenery);
    check('§3 3e [対照] 既定経路は isCustom=false のまま', legacy.isCustom === false,
      'isCustom=' + legacy.isCustom);

    // ═══ §4 落とし穴④ spawns 空の化けバグ ═════════════════════════════════
    mark('§4 mapDef はあるが spawns が空 → 廃坑の敵が湧かない');
    const empty = await runIndex(browser, BASE, { payload: payloadCustom({ spawns: [] }) });
    console.log('     spawns=' + empty.spawnsJson + '  len=' + empty.spawnsLen);
    check('§4 4a ENEMY_SPAWNS が 0 体 (廃坑へフォールバックしていない)', empty.spawnsLen === 0,
      'len=' + empty.spawnsLen);
    check('§4 4b 廃坑の象徴座標 (27,13)/(57,13) に敵がいない',
      !MINE_SIGNATURE_TILES.some(function (q) {
        return new RegExp(',' + q[0] + ',' + q[1] + '\\]').test(empty.spawnsJson || '');
      }), empty.spawnsJson);
    check('§4 4c 敵 0 体でも幾何はカスタムのまま (巻き添えで既定へ落ちていない)',
      empty.roomsJson === CUSTOM_ROOMS_JSON && empty.isCustom === true,
      'isCustom=' + empty.isCustom + ' rooms=' + empty.roomsLen);

    // ═══ §5 落とし穴⑤ 屋外テーマ排他 ══════════════════════════════════════
    mark('§5 themeId:"caravan-road" のカスタム幾何は受け付けない');
    const fieldCustom = await runIndex(browser, BASE, {
      payload: payloadCustom({
        themeId: 'caravan-road',
        mapDef: customMapDef({ themeId: 'caravan-road' }),
      }),
    });
    console.log('     isFieldTheme=' + fieldCustom.isFieldTheme + ' isCustom=' + fieldCustom.isCustom
      + ' rooms=' + fieldCustom.roomsLen);
    check('§5 5a 屋外テーマとして起動している (前提が成立している)',
      fieldCustom.isFieldTheme === true, 'isFieldTheme=' + fieldCustom.isFieldTheme);
    check('§5 5b カスタム幾何は採用されない (isCustom=false)', fieldCustom.isCustom === false,
      'isCustom=' + fieldCustom.isCustom);
    check('§5 5c 既定の屋外 3 室へ落ちている',
      fieldCustom.roomsLen === 3 && fieldCustom.roomsJson !== CUSTOM_ROOMS_JSON,
      'rooms=' + fieldCustom.roomsJson);
    check('§5 5d 排他の理由が console.warn に出ている (無言で落としていない)',
      (fieldCustom.warns || []).some(w => /屋外テーマ/.test(w)),
      (fieldCustom.warns || []).filter(w => /mapdef/.test(w)).slice(0, 2).join(' | '));

    // ═══ §6 撤退スイッチ ?mapdef=0 (負のコントロール) ══════════════════════
    mark('§6 ?mapdef=0 で同じ payload が既定幾何へ戻る');
    const retreat = await runIndex(browser, BASE, { payload: payloadCustom() }, '?mapdef=0');
    console.log('     isCustom=' + retreat.isCustom + ' rooms=' + retreat.roomsJson
      + ' start=(' + retreat.startTx + ',' + retreat.startTy + ')');
    check('§6 6a isCustom=false へ戻る', retreat.isCustom === false, 'isCustom=' + retreat.isCustom);
    check('§6 6b ROOMS が既定 2 室へ戻る', retreat.roomsJson === DEFAULT_ROOMS_JSON, retreat.roomsJson);
    check('§6 6c 起点が既定 (24,13) へ戻る', retreat.startTx === 24 && retreat.startTy === 13,
      retreat.startTx + ',' + retreat.startTy);
    check('§6 6d ★負のコントロール: §1 と §6 が実際に別物 (resolve が mapDef を読んでいる証明)',
      cust.roomsJson !== retreat.roomsJson && cust.startTx !== retreat.startTx,
      'custom=' + cust.roomsLen + '室 / retreat=' + retreat.roomsLen + '室');
    check('§6 6e 撤退の理由が console.warn に出ている',
      (retreat.warns || []).some(w => /\?mapdef=0/.test(w)),
      (retreat.warns || []).filter(w => /mapdef/.test(w)).slice(0, 2).join(' | '));

    // ═══ §7 到達可能性 (autoplay で本当にクリアできるか) ═══════════════════
    if (SKIP_AUTOPLAY) {
      console.log('\n[drv] §7 --skip-autoplay のためスキップ');
    } else {
      /* ⚠ 制限時間は 180 秒では**足りない** (2026-08-02 実測で FAIL)。この検証マップは
       *   起点 tx10 → ボス tx60 = 横 50 タイルで、既定 (tx24→tx57 = 33 タイル) の 1.5 倍あり、
       *   PT の歩行は autoplay=30 でも約 2 タイル / 5 秒。180 秒時点では**まだ廊下を歩いていた**
       *   (診断: 120 秒で tx42)。「クリアできない」のではなく「時間が足りない」だった。
       * ⚠⚠ そこで **時間切れ**と**本当に詰まった**を区別する: 進捗 (踏破数・残敵数・PT の位置) が
       *   STALL_MS 変化しなければ即座に打ち切って「stalled」として報告する。
       *   これが無いと、将来 assert が落ちたときに「遅いだけ」か「無限にウロついている」かを
       *   出力から判別できず、また 5 分待たされる。
       * ★[2026-08-20] 以前はここに「HARD_MS は本体のラン ハード上限 4 分より短く」という
       *   制約があった。本体の打ち切りが**進行ウォッチドッグ** (90 秒まったく進行しない = 詰み)
       *   へ置き換わったので、**長いだけでは [DIAG][run-timeout] は鳴らない**。
       *   ⚠ ただし「本当に止まった」ときは 90 秒で鳴る = 上の STALL_MS と同じものを本体側でも
       *   測っている。どちらが先に鳴っても読めるよう、STALL_MS はここに残す。 */
      const HARD_MS = 210000, STALL_MS = 90000;
      mark('§7 ?autoplay=30 でカスタムマップを実際にクリアできるか (最大 ' + (HARD_MS / 1000) + ' 秒)');
      /* ⚠⚠ ここが測るのは **幾何の到達性**であって戦闘バランスではない。
       *   §1 のロスター (kobold / goblinArcher / goblinKing) をそのまま使うと、ボスの召喚で
       *   敵が増えて PT が全滅し、"cleared=false" になる — しかしそれは「マップが壊れている」
       *   ではなく「その編成では勝てなかった」でしかない (2026-08-02 に実際に踏んだ)。
       *   戦闘 RNG を assert に混ぜると装置が毎回ゆれて信用されなくなるので、
       *   §7 のロスターは **rat のみ**に落とす。これで「クリアしなかった = 誰かに到達できていない」
       *   と読めるようになる (= 落とし穴②⑦ の実プレイ版の検出器として機能する)。
       *   ⚠ 体数と座標は §1 と同じ 6 スロットのまま (到達性の母集団を減らさない)。 */
      const reachPayload = payloadCustom({
        spawns: [
          ['rat', 8, 19], ['rat', 12, 22],
          ['rat', 26, 18], ['rat', 30, 16], ['rat', 32, 21],
          ['rat', 44, 20],
        ],
      });
      const boot = await bootPage(browser, BASE + '/index.html?autoplay=30&intel=0',
        { payload: reachPayload, scen: null, t0: T_BASE_MS, seed: SEED });
      const apPage = boot.page, apErrs = boot.errs, apPre = boot.preexisting;
      let cleared = false, stalled = false, defeated = false, visited = -1, aliveN = -1, where = '?';
      let lastSig = '', lastChange = Date.now(), lastLog = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < HARD_MS) {
        const s = await apPage.evaluate(() => {
          const g = (fn, d) => { try { const v = fn(); return (v === undefined) ? d : v; } catch (e) { return d; } };
          const T = g(() => TILE_SIZE, 96);
          return {
            cleared: g(() => dungeonCleared, false),
            over: g(() => gameOver, false),
            visited: g(() => visitedRooms.size, -1),
            alive: g(() => enemies.filter(e => e.alive && !e.passiveNpc).length, -1),
            at: g(() => Math.round(playerX / T) + ',' + Math.round(playerY / T), '?'),
          };
        });
        visited = s.visited; aliveN = s.alive; where = s.at;
        if (s.cleared) { cleared = true; break; }
        if (s.over) { defeated = true; break; }   // 全滅。時間切れと**別物**として報告する
        const sig = s.visited + '/' + s.alive + '/' + s.at;
        if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
        else if (Date.now() - lastChange > STALL_MS) { stalled = true; break; }
        const el = Date.now() - t0;
        if (el - lastLog >= 30000) {
          lastLog = el;
          console.log('     …' + Math.round(el / 1000) + 's  踏破' + s.visited + ' 残敵' + s.alive + ' PT(' + s.at + ')');
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const detail = '踏破' + visited + ' 残敵' + aliveN + ' PT(' + where + ') ' + elapsed + '秒'
        + (stalled ? ' ★' + (STALL_MS / 1000) + '秒 進捗なしで打ち切り = 本当に詰まっている' : '')
        + (defeated ? ' ★PT 全滅 (幾何ではなく戦闘の問題)' : '');
      console.log('     cleared=' + cleared + '  ' + detail);
      check('§7 7a カスタムマップで dungeonCleared === true になる', cleared === true, detail);
      check('§7 7b 踏破部屋数が OBJECTIVE_ROOMS (2) 以上', visited >= 2, 'visited=' + visited);
      check('§7 7c 生存している敵が 0 (岩盤に埋まった敵が残っていない)', aliveN === 0, 'alive=' + aliveN);
      check('§7 7d 進捗が止まらなかった (時間切れと「詰まり」の区別)', stalled === false, detail);
      check('§7 7e PT が全滅していない (戦闘敗北を幾何の失敗と読み違えないため)', defeated === false, detail);
      // ★除外枠 (PREEXISTING_RE) は現在**空**なので、これは result-double-fire の回帰検出器でもある。
      check('§7 7f autoplay 実行中に pageerror / console.error が 1 件も出ていない', apErrs.length === 0,
        apErrs.slice(0, 3).join(' | '));
      if (apPre.length) {
        console.log('     ⚠ Phase 2 と無関係の既存欠陥を ' + apPre.length + ' 件観測 (判定からは除外):');
        for (const x of apPre.slice(0, 3)) console.log('        · ' + x);
      }
      await apPage.close();
    }

    // ═══ §8 lint (到達不能マップの事前検出) ════════════════════════════════
    mark('§8 map-editor の lint が到達不能マップを事前に検出する');
    const edBoot = await bootPage(browser, BASE + '/map-editor.html',
      { payload: null, scen: null, t0: T_BASE_MS, seed: SEED }, { wait: false });
    const edPage = edBoot.page, edErrs = edBoot.errs;
    await edPage.waitForFunction(() => !!window.__mapEditor, { timeout: 30000, polling: 100 });
    const lintRes = await edPage.evaluate((good, broken) => {
      const M = window.__mapEditor.MapDef;
      const a = M.lintMapDef(good);
      const b = M.lintMapDef(broken);
      return {
        goodErrs: a.errors.map(e => e.code),
        goodWarnCodes: a.warnings.map(w => w.code),
        badErrs: b.errors.map(e => e.code),
        seamVersion: window.__mapEditor.version,
      };
    }, customMapDef(), customMapDef({ corridors: [CUSTOM_CORRIDORS[0]] }));   // 2 本目の廊下を抜く
    console.log('     good.errors=' + JSON.stringify(lintRes.goodErrs)
      + '  broken.errors=' + JSON.stringify(lintRes.badErrs));
    check('§8 8a 正しいカスタムマップは lint エラー 0', lintRes.goodErrs.length === 0,
      JSON.stringify(lintRes.goodErrs));
    check('§8 8b ★廊下を 1 本抜くと unreachable-room を検出する (負のコントロール)',
      lintRes.badErrs.indexOf('unreachable-room') >= 0, JSON.stringify(lintRes.badErrs));
    check('§8 8c 検証シームのバージョンが上がっている (>=9)', lintRes.seamVersion >= 9,
      'version=' + lintRes.seamVersion);

    // ═══ §9 map-editor の playMap() ════════════════════════════════════════
    mark('§9 「▶ このマップで遊ぶ」の payload 生成と拒否条件');
    const play = await edPage.evaluate((good, broken, fieldMap) => {
      const E = window.__mapEditor;
      const out = {};
      // (a) 正しいマップ → payload が作れて sessionStorage に残る
      E.setMapDef(good);
      const r1 = E.playMap({ navigate: false });
      out.okRun = { ok: r1.ok, reason: r1.reason || null };
      out.payload = r1.ok ? r1.payload : null;
      let stored = null;
      try { stored = JSON.parse(sessionStorage.getItem(E.PLAY_SS_KEY)); } catch (e) {}
      out.storedRooms = (stored && stored.mapDef) ? stored.mapDef.rooms.length : -1;
      out.storedSpawns = (stored && stored.spawns) ? stored.spawns.length : -1;
      out.storedHasMapDef = !!(stored && stored.mapDef && stored.mapDef.schema === 'df-map/1');

      // (b) 到達不能マップ → 出発しない
      try { sessionStorage.removeItem(E.PLAY_SS_KEY); } catch (e) {}
      E.setMapDef(broken);
      const r2 = E.playMap({ navigate: false });
      out.brokenRun = { ok: r2.ok, reason: r2.reason || null };
      try { out.brokenStored = sessionStorage.getItem(E.PLAY_SS_KEY); } catch (e) { out.brokenStored = 'ERR'; }

      // (c) 屋外テーマ → 出発しない
      E.setMapDef(fieldMap);
      const r3 = E.playMap({ navigate: false });
      out.fieldRun = { ok: r3.ok, reason: r3.reason || null };
      // おまかせ抽選のプール (9j/9k の母集団)。これが空なら装置の故障。
      const th = E.MapDef.THEME_DEFAULT_ENEMIES['goblin-mine'];
      out.themePool = th ? th.mob.slice() : null;
      return out;
    }, customMapDef(), customMapDef({ corridors: [CUSTOM_CORRIDORS[0]] }),
       customMapDef({ themeId: 'caravan-road' }));
    console.log('     ok=' + JSON.stringify(play.okRun) + ' spawns=' + play.storedSpawns);
    check('§9 9a 正しいマップは playMap() が ok:true', play.okRun.ok === true, play.okRun.reason || '');
    check('§9 9b sessionStorage に mapDef (df-map/1) が書かれている', play.storedHasMapDef === true,
      'rooms=' + play.storedRooms);
    check('§9 9c 書かれた mapDef の部屋数が 3', play.storedRooms === 3, 'rooms=' + play.storedRooms);
    check('§9 9d spawns がスロット数と同数 (敵5 + ボス1 = 6) ＝ エディタ優先の体数',
      play.storedSpawns === 6, 'spawns=' + play.storedSpawns);
    /* ★ rat は goblin-mine のおまかせプール外なので、これが出た = 固定キーが尊重された以外にない。
     * ⚠ 座標は CUSTOM_ROOMS[1].enemySlots の 3 要素スロットと一致させること
     *   (2026-08-02 にマップを作り直したとき、ここの (34,12) を直し忘れて FAIL した)。 */
    const FIXED_SLOT = CUSTOM_ROOMS[1].enemySlots[1];             // [tx, ty, key]
    const FIXED_SIG = '["' + FIXED_SLOT[2] + '",' + FIXED_SLOT[0] + ',' + FIXED_SLOT[1] + ']';
    check('§9 9e 種類固定スロットの敵キーが尊重されている (プール外の ' + FIXED_SIG + ')',
      !!play.payload && JSON.stringify(play.payload.spawns).indexOf(FIXED_SIG) >= 0,
      play.payload ? JSON.stringify(play.payload.spawns) : '<none>');
    check('§9 9j ★assert の穴つぶし: ' + FIXED_SLOT[2] + ' はおまかせプールに無い (抽選では絶対に出ない)',
      !!play.themePool && play.themePool.indexOf(FIXED_SLOT[2]) < 0,
      'pool=' + JSON.stringify(play.themePool));
    check('§9 9k おまかせスロットはプール内の敵で埋まっている',
      !!play.payload && play.payload.spawns.filter(function (s) {
        // 固定スロットとボススロットを除いた残り = すべて「おまかせ」
        return !(s[1] === FIXED_SLOT[0] && s[2] === FIXED_SLOT[1])
          && !(s[1] === CUSTOM_ROOMS[2].bossSlot[0] && s[2] === CUSTOM_ROOMS[2].bossSlot[1]);
      }).every(function (s) { return play.themePool.indexOf(s[0]) >= 0; }),
      play.payload ? JSON.stringify(play.payload.spawns) : '<none>');
    check('§9 9f ★到達不能マップでは出発しない (負のコントロール)', play.brokenRun.ok === false,
      'reason=' + (play.brokenRun.reason || '<none>'));
    check('§9 9g 出発しなかったときは sessionStorage に何も書かない', play.brokenStored === null,
      'stored=' + String(play.brokenStored).slice(0, 60));
    check('§9 9h ★屋外テーマでは出発しない (落とし穴⑤ の入口側の防波堤)',
      play.fieldRun.ok === false && /屋外テーマ/.test(play.fieldRun.reason || ''),
      'reason=' + (play.fieldRun.reason || '<none>'));
    check('§9 9i map-editor で pageerror が出ていない', edErrs.length === 0, edErrs.slice(0, 3).join(' | '));
    await edPage.close();

    // ═══ §10 ドリフト検出 (静的ファイル読み) ═══════════════════════════════
    mark('§10 tavern.html の救命ボートが js/df-mapdef.js の DEFAULT_DUNGEON と一致するか');
    /* ⚠ core.autocrlf=true なのでバイト数や行数の比較は使わない。**値そのもの**を
     *   正規表現で抜いて JSON で比べる (step1 で踏んだ CRLF の罠と同じ理由)。 */
    const defSrc = fs.readFileSync(path.join(ROOT, 'js', 'df-mapdef.js'), 'utf8');
    const tavSrc = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
    const mSlots = defSrc.match(/var ROOM_SLOTS_DEFAULT = (\[[^;]*\]);/);
    const mBoss = defSrc.match(/bossSlot:\s*(\[\s*57\s*,\s*13\s*\])/);
    const mTav = tavSrc.match(/const FALLBACK_ROOM_SLOTS = \[\s*(\[\[[\s\S]*?\]\]),/);
    const mTavB = tavSrc.match(/const FALLBACK_BOSS_SLOT = (\[[^\]]*\]);/);
    const norm = (s) => { try { return JSON.stringify(JSON.parse(s.replace(/\s+/g, ''))); } catch (e) { return null; } };
    const defSlots = mSlots ? norm(mSlots[1]) : null;
    const tavSlots = mTav ? norm(mTav[1]) : null;
    const defBoss = mBoss ? norm(mBoss[1]) : null;
    const tavBoss = mTavB ? norm(mTavB[1]) : null;
    console.log('     df-mapdef slots=' + defSlots + '\n     tavern    slots=' + tavSlots);
    check('§10 10a df-mapdef.js から ROOM_SLOTS_DEFAULT を抽出できた (書式ドリフト検出器)',
      defSlots !== null && defSlots.length > 10, 'value=' + defSlots);
    check('§10 10b tavern.html から FALLBACK_ROOM_SLOTS を抽出できた',
      tavSlots !== null && tavSlots.length > 10, 'value=' + tavSlots);
    check('§10 10c 敵スロットの値が一致する (救命ボートが本番と別マップになっていない)',
      defSlots !== null && defSlots === tavSlots, defSlots + ' vs ' + tavSlots);
    check('§10 10d ボススロットの値が一致する', defBoss !== null && defBoss === tavBoss,
      defBoss + ' vs ' + tavBoss);
    check('§10 10e tavern.html から座標リテラル ROOM_SLOTS = [[…]] が消えている',
      !/const ROOM_SLOTS = \[\s*\[\[/.test(tavSrc), '');
    check('§10 10f tavern.html が js/df-mapdef.js を読み込んでいる',
      /<script src="js\/df-mapdef\.js"><\/script>/.test(tavSrc), '');

    /* ═══ §11 tavern.html の実行時 (静的一致だけでは足りない) ══════════════════
     *  §10 は「ファイルに書いてある値」しか見ていない。実際に DFMapDef 経由で組み立てた
     *  ROOM_SLOTS が**現行と同じ形**になっているかは走らせないと分からない。
     *  ⚠⚠ ここでいちばん危ないのは **ROOM_SLOTS の「長さ」**。buildSpawns は
     *    roomIdx / (ROOM_SLOTS.length - 1) を強さ係数に使うので、slotsOf().byRoom が
     *    空のボス部屋まで積んで長さ 2 になると、山場の係数が 1 → 0 に落ちて
     *    **既存の生成クエストの敵が一斉に弱くなる** (値は合っているのに壊れる典型)。 */
    /* ⚠ ROOM_SLOTS / BOSS_SLOT は **QuestGen の IIFE の中**にあり、page.evaluate の
     *   グローバルスコープからは見えない (index.html の mapData のようには読めない)。
     *   そこで観測点を 2 つに分ける:
     *     ① 不変条件そのもの … DFMapDef.slotsOf(DEFAULT_DUNGEON).byRoom (tavern が読む値の素)
     *     ② 実際の出力       … QuestGen.buildSpawns(quest) の生成結果
     *   ★ ROOM_SLOTS に検証シームを足して覗く手もあるが、tavern.html を触ると changelog
     *     フックが発火するうえ、カプセル化を検証のためだけに崩すことになるので採らない。 */
    mark('§11 tavern.html を実行して敵スロットの組み立てが現行と同形か');
    const tavBoot = await bootPage(browser, BASE + '/tavern.html',
      { payload: null, scen: null, t0: T_BASE_MS, seed: SEED }, { wait: false });
    const tavPage = tavBoot.page, tavErrs = tavBoot.errs;
    await tavPage.waitForFunction(() => {
      try { return !!window.DFMapDef && typeof QuestGen !== 'undefined'; }
      catch (e) { return false; }
    }, { timeout: 30000, polling: 100 });
    const tav = await tavPage.evaluate(() => {
      const g = (fn, d) => { try { const v = fn(); return (v === undefined) ? d : v; } catch (e) { return d; } };
      const s = g(() => DFMapDef.slotsOf(DFMapDef.DEFAULT_DUNGEON), null);
      // 実出力: いろいろな Lv で生成クエストを作り、spawns の形を確かめる
      const runs = [];
      for (const lv of [1, 4, 8, 12]) {
        const q = g(() => QuestGen.generateQuest(lv), null);
        if (!q) continue;
        const sp = g(() => QuestGen.buildSpawns(q), null);
        if (!sp) continue;
        runs.push({
          tier: q.tierKey, n: sp.length,
          last: sp[sp.length - 1],
          keysOk: sp.every(x => Array.isArray(x) && typeof x[0] === 'string' && x[0].length > 0
            && typeof x[1] === 'number' && typeof x[2] === 'number'),
          coords: sp.slice(0, -1).map(x => [x[1], x[2]]),
        });
      }
      return {
        hasDF: !!window.DFMapDef,
        groups: s ? s.byRoom.length : -1,
        firstLen: (s && s.byRoom[0]) ? s.byRoom[0].length : -1,
        byRoom0: (s && s.byRoom[0]) ? JSON.parse(JSON.stringify(s.byRoom[0])) : '<none>',
        boss: s ? JSON.parse(JSON.stringify(s.bossSlot)) : '<none>',
        flatLen: s ? s.roomSlots.length : -1,
        runs: runs,
      };
    });
    console.log('     byRoom groups=' + tav.groups + ' firstLen=' + tav.firstLen
      + ' boss=' + JSON.stringify(tav.boss));
    for (const r of tav.runs) console.log('     ' + r.tier + ': ' + r.n + ' 体  末尾=' + JSON.stringify(r.last));
    check('§11 11a tavern で DFMapDef が読めている', tav.hasDF === true, 'hasDF=' + tav.hasDF);
    check('§11 11b ★byRoom の要素数が 1 (空のボス部屋を積んでいない = 強さ係数が変わらない)',
      tav.groups === 1, 'groups=' + tav.groups);
    check('§11 11c byRoom[0] が 8 スロットで、平坦版 roomSlots とも同数',
      tav.firstLen === 8 && tav.flatLen === 8, 'byRoom0=' + tav.firstLen + ' flat=' + tav.flatLen);
    check('§11 11d byRoom[0] の値が df-mapdef.js の ROOM_SLOTS_DEFAULT と一致',
      JSON.stringify(tav.byRoom0) === defSlots, JSON.stringify(tav.byRoom0) + ' vs ' + defSlots);
    check('§11 11e bossSlot が [57,13]', JSON.stringify(tav.boss) === '[57,13]', JSON.stringify(tav.boss));
    check('§11 11f 生成クエストを 4 通り作れた (母集団が空でない)', tav.runs.length === 4,
      'runs=' + tav.runs.length);
    check('§11 11g ★buildSpawns の体数が tier 表 {4,5,7,8}+ボス1 のまま (エディタ優先に化けていない)',
      tav.runs.length === 4 && tav.runs.every(r => [5, 6, 8, 9].indexOf(r.n) >= 0),
      JSON.stringify(tav.runs.map(r => r.tier + ':' + r.n)));
    check('§11 11h ボスは必ず末尾で BOSS_SLOT (57,13) に置かれる',
      tav.runs.length === 4 && tav.runs.every(r => r.last[1] === 57 && r.last[2] === 13),
      JSON.stringify(tav.runs.map(r => r.last)));
    check('§11 11i 雑魚の座標がすべて既定 8 スロットの中にある',
      tav.runs.length === 4 && tav.runs.every(r =>
        r.coords.every(c => defSlots.indexOf('[' + c[0] + ',' + c[1] + ']') >= 0)),
      JSON.stringify(tav.runs.map(r => r.coords.length)));
    check('§11 11j 敵キーがすべて非空文字列 (未知キーで無言消去される形になっていない)',
      tav.runs.length === 4 && tav.runs.every(r => r.keysOk === true), '');
    check('§11 11k tavern で pageerror が出ていない', tavErrs.length === 0, tavErrs.slice(0, 3).join(' | '));
    await tavPage.close();

  } catch (e) {
    console.error('[driver] 装置の故障: ' + ((e && e.stack) || e));
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (srv) srv.close(); } catch (_) {}
    process.exit(3);
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (srv) srv.close(); } catch (_) {}
  }

  // ── 集計 ──────────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log('\n════════════════════════════════════════════');
  console.log('  ' + pass + '/' + results.length + ' PASS' + (fail ? '   ★FAIL ' + fail + ' 件' : ''));
  if (fail) {
    console.log('  ── FAIL 一覧 ──');
    for (const r of results) if (!r.ok) console.log('   ✗ ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  if (MUTATE) {
    console.log('  (--mutate ' + MUTATE + ': FAIL が 1 件以上出るのが**正しい**。0 件なら assert の穴)');
    if (fail === 0) { console.log('  ★assert の穴: 欠陥を注入したのに全 PASS した'); process.exit(4); }
    process.exit(1);
  }
  // ⚠ 母集団が空のまま「全 PASS」になるのを防ぐ (assert が 1 つも走っていない = 装置の故障)
  if (results.length < 40) {
    console.log('  ★装置の故障: assert が ' + results.length + ' 件しか走っていない');
    process.exit(3);
  }
  process.exit(fail ? 1 : 0);
})();
