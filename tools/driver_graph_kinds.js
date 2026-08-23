#!/usr/bin/env node
/*
 * driver_graph_kinds.js — [P4 ノード種別の配線] 分岐マップの kind → 中身
 * ══════════════════════════════════════════════════════════════════════════════
 * 「ゲームブック風 分岐マップ」企画 P4 の完了条件を測る。P3 までは kind (start / combat /
 * search / loot / rest / event / boss) は**ヒント文と到着文にしか効いていなかった**。
 * ここで実体へ繋がったことを 6 つの主張として測る:
 *
 *   ① 除外集合が kind 由来になった
 *      = 罠 / 隠し宝箱 / 探索宝箱は kind:"search" だけ、玄室宝箱は kind:"loot" だけに湧く
 *      = **1 ノード = 1 部屋でも罠と宝箱が 0 個にならない**(P2 の「控えの間」の仮の器が不要)
 *   ② kind:"loot" の行き止まりは「当たり」、回収済み/中身なしは「外れ」(実体で測る)
 *   ③ kind:"rest" のノードで実際に回復し、**再訪では回復しない**(往復による無限回復の封じ)
 *   ④ ノードに紐づくイベントの台帳 (器) が動く — P5 が EV-2/5/9 をここへ載せる
 *   ⑤ ヒントの「N 体ばかり」(exitEnemyCount) が**実際に湧いた敵数と一致**する (P3 の穴 #1)
 *   ⑥ 到着ナレ (#dmMessage z80) の上に出口選択 (羊皮紙 z12) が重ならない (P3 の穴 #4)
 *
 * ⭐ **負のコントロールを同一 run に内包**する。ポート P に素の index.html を、P+1 に
 *    「機構を 1 箇所だけ潰した変異版」を配り、同じ手順を両方に流す。
 * ⭐ **RUN が null の既存経路が 1bit も変わっていないこと** (§8) も同じ run で測る。ここが
 *    この項目でいちばん壊しやすい場所で、壊れても分岐版のテストは全部緑のままになる。
 *
 * ★driver_graph_run.js を拡張せず別ドライバにした理由: あちらの主題は「遷移の状態機械」で
 *   既に 830 行ある。P4 は「kind → 中身」という別の主題で、変異の当て先も測る量も重ならない。
 *
 * 変異 (--mutate、既定 nokind):
 *   nokind       … 除外集合の kind 差し替えを殺す → 1 部屋が両方の除外集合に入り罠も宝箱も 0 個
 *   noguarantee  … kind:"loot" の当たり保証を殺す → 行き止まりの宝が抽選任せになる
 *   norestheal   … rest ノードの回復を殺す        → 休んでも HP が戻らない
 *   norestguard  … 1 ノード 1 回の制限を殺す       → 往復で無限に全快できる
 *   noinboss     … __inBossRoom の引き直しを殺す   → ボスから引き返した後 rest が無言で効かない
 *   noevent      … イベント台帳の発火を殺す        → 接近しても run() が呼ばれない
 *   nodeadend    … 行き止まりの当たり/外れ判定を殺す → 宝があっても「外れ」と言う
 *
 * ⚠ 変異は**ディスクを書き換えず配信をメモリ上で差し替える** (復元漏れが原理的に起きない)。
 * ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
 * ⚠ 変異アンカーは**行末コメント込み**で書く。インデント違いの同名呼び出しの部分文字列に
 *   なると 2 箇所に刺さって負のコントロールが空振りする (実際に applyRoomClearHeal で踏んだ)。
 *
 * 使い方:
 *   node tools/driver_graph_kinds.js
 *   node tools/driver_graph_kinds.js --mutate norestheal --port 8908
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
const PORT = parseInt(arg('port', '8904'), 10);   // ⚠ 変異側は PORT+1。並列時はポート間隔 4 以上

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  nokind: ['      nodeBuildKind = graphKindOf(nodeId);',
           '      nodeBuildKind = null;   /* ★変異nokind */'],
  noguarantee: ['      return nodeBuildKind === "loot";',
                '      return false;   /* ★変異noguarantee */'],
  norestheal: ['        await applyRoomClearHeal();   // ★[P4] 休憩ノードの回復 (戦闘勝利後と同じ機構を再利用)',
               '        void 0;   /* ★変異norestheal */'],
  norestguard: ['        if (st) st.rested = true;',
                '        if (false) st.rested = true;   /* ★変異norestguard */'],
  noinboss: ['        window.__inBossRoom = (toId === RUN.bossNodeId);',
             '        void 0;   /* ★変異noinboss */'],
  noevent: ['          const r = await ev.run(ev);',
            '          const r = false;   /* ★変異noevent */'],
  nodeadend: ['      return roomChests.some(c => !c.opened) ? "hit" : "miss";',
              '      return "miss";   /* ★変異nodeadend */'],
};
const MUTATE = arg('mutate', 'nokind');
if (!Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
  process.exit(3);
}
let _mutCache = null;
function mutatedSources() {
  if (_mutCache) return _mutCache;
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const [from, to] = MUTATIONS[MUTATE];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
  const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
  if (hits.length !== 1 || n !== 1) {
    console.error('[drv] ⛔ 変異の置換対象が ' +
      (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
      ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  out[hits[0]] = out[hits[0]].split(from).join(to);
  _mutCache = out;
  return out;
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
function startServer(port, mutate) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutate && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
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

async function bootPage(browser, url, warns, errs, scen, pre) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });   // ⚠ 狭幅だと矢印が出ない (§7 が測れない)
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'warn' || m.type() === 'warning') warns.push(t);
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  /* ⚠ evaluateOnNewDocument は**全ナビゲーションで再実行される**。ここには「毎回同じ形へ
   *   整える」ものだけを置く (removeItem 等の破壊系は置かない = 最頻ハマり)。 */
  await page.evaluateOnNewDocument((sid, preSrc) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    if (preSrc) { try { (new Function(preSrc))(); } catch (e) { console.error('pre failed ' + e.message); } }
  }, scen || 'goblin-mine', pre || '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* ⚠⚠ **本番と同じ入口 (生成クエストのペイロード) で測る**。dev シーム ?graphtest だけで開くと
 *   scenarioId が "goblin-mine" のままになり、**シナリオ 1 の選択肢イベント (EV-2/5/9) が生きる**。
 *   それらは ROOMS[0] の西端から N タイルという絶対アンカーなので分岐版の各ノードでも近傍に来て、
 *   400ms tick でモーダルを開き、タップされないまま skillCheckActive / dialogPaused を握り続ける
 *   → 出口選択の tick が永久に止まり §7 が測れない (2026-08-07 に実際に踏んだ)。
 *   ペイロード経路なら scenarioId="generated-quest" なので isGoblinMineScenario() が false になり、
 *   EV-2/5/9 は 1 命令も走らない。**EV の再アンカーは P5 の担当**であってここではない。
 * ⚠ ?graphtest は「内蔵テストグラフを取り出す」ためだけに 1 回使う (下の bootstrap)。 */
const QT_SEAM = '/index.html?diag=1&graphtest=1';
const QT = '/index.html?diag=1';
const PAYLOAD = { title: '分岐テスト', flavor: '', themeId: 'goblin-mine', perceptionDC: 14,
                  trapCount: 3, hiddenChestCount: 2, clearXp: 0, spawns: [] };
function payloadPre(runJson) {
  return 'sessionStorage.setItem("dragonfighters.generatedScenario", ' +
    JSON.stringify(JSON.stringify(Object.assign({}, PAYLOAD, { run: JSON.parse(runJson) }))) + ');';
}

/* ── 「kind:"loot" の当たり保証」を**種に依らず**測るための probe グラフ ──────────
 * ⚠⚠ 2026-08-07 に踏んだ罠: 当たり保証の負のコントロール (--mutate noguarantee) を
 *   **ノード 1 件**で測ったら沈黙した。スポーンの乱数はノード id から決定論的に導かれるので、
 *   n2 の種はたまたま CHEST_SPAWN_CHANCE(0.5) を通り、保証を外しても宝箱が湧いてしまう。
 *   ⭐「保証」の意味は「**どの種でも必ず湧く**」なので、測るべき母集団は 1 件ではない。
 *   → loot の行き止まりを 6 件 (別 id = 別の種) 並べたグラフを作り、
 *     素の側は 6/6・変異側はそれ未満、で分離させる。
 * ★mapDef は内蔵テストグラフから**そのまま借りる** (幾何を driver に写経しない = 二重定義を作らない)。
 * ⚠ boss ノードは必須 (無いと lintRun の graph-no-boss で RUN が立たない)。 */
const LOOT_PROBE_N = 6;
function lootProbeRun(runJson) {
  const src = JSON.parse(runJson), byId = {};
  for (const n of src.nodes) byId[n.id] = n;
  const cp = (o) => JSON.parse(JSON.stringify(o));
  /* 部屋の最上段の中央 = 床。dir は省略して幾何から導出させる。
   * ⚠ 2026-08-07 (P5 前段) に **直書き [33,7] をやめて rect から導出**した。ノードの部屋を
   *   可視域サイズへ縮めた瞬間その座標は岩盤になり、lintRun が graph-gate-not-floor を出して
   *   **RUN ごと null に落ち、probe が「RUN.byId の null 参照」で FATAL 死した**。
   *   直書き座標は幾何を動かすたびに黙って無意味化する ([[project-room-shorten-2rooms]] の罠)。 */
  const rc0 = byId.n0.mapDef.rooms[0].rect;    // [r1,c1,r2,c2]
  const AT = [Math.floor((rc0[1] + rc0[3]) / 2), rc0[0]];
  const entry = { id: 'n0', kind: 'start', mapDef: cp(byId.n0.mapDef), exits: [] };
  const nodes = [entry];
  for (let i = 1; i <= LOOT_PROBE_N; i++) {
    entry.exits.push({ to: 'L' + i, at: AT });
    nodes.push({ id: 'L' + i, kind: 'loot', mapDef: cp(byId.n2.mapDef), exits: [] });
  }
  entry.exits.push({ to: 'nb', at: AT });
  nodes.push({ id: 'nb', kind: 'boss', mapDef: cp(byId.n3.mapDef), exits: [] });
  return JSON.stringify({ entry: 'n0', nodes: nodes });
}
const LOOT_PROBE_SRC = `(async () => {
  const g = window.__graphRun, out = [];
  for (let i = 1; i <= ${LOOT_PROBE_N}; i++) {
    await g.enter('L' + i, 'up');
    out.push(roomChests.length);
  }
  return { chests: out, kind: g.kindOf('L1') };
})()`;

/* ノードを 1 件ずつ巡って盤面を測る。★**巡回そのものを本編の enterNode に通す**
 * (g.enter は歩きを飛ばすだけで、build → restore → 配置 の順序は本編と同じ)。
 * ⚠ 素の側と変異側で**同じ文字列**を流す = 同じ手順を両方に掛けたことが読んで分かる。 */
const TOUR_SRC = `(async () => {
  const g = window.__graphRun;
  const out = {};
  const snap = (id) => ({
    kind: g.kindOf(id),
    rooms: ROOMS.length, bossRoomIdx: BOSS_ROOM_IDX,
    excluded: g.excluded(), chestExcluded: g.chestExcluded(),
    traps: traps.length, chests: roomChests.length,
    hidden: roomChests.filter(c => c.hidden).length,
    enemies: enemies.length,
    slotCount: g.enemyCount(id),
    deadEnd: g.deadEnd(id),
  });
  out.n0 = snap('n0');                       // entry (start) — 既に居る
  for (const step of [['n1','up'],['n2','right'],['n4','down'],['n3','up']]) {
    await g.enter(step[0], step[1]);
    out[step[0]] = snap(step[0]);
  }
  await g.enter('n0', 'down');
  return out;
})()`;

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srvPure = await startServer(PORT, false);
  const srvMut = await startServer(PORT + 1, true);
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素        http://localhost:' + PORT);
  console.log('[drv]   変異(' + MUTATE + ')  http://localhost:' + (PORT + 1));

  const profile = require('./_pptr_profile')('df_graph_kinds_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const warns = [], errs = [];

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ────────────────────────
  mark('変異の配信検算');
  {
    const get = (p) => new Promise((res, rej) => {
      http.get('http://localhost:' + p + '/index.html', r => {
        let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
      }).on('error', rej);
    });
    const a = await get(PORT), b = await get(PORT + 1);
    const [from, to] = MUTATIONS[MUTATE];
    check('(0a) 素の配信に変異前の文字列が 1 箇所ある', a.split(from).length - 1 === 1,
      '件数=' + (a.split(from).length - 1));
    check('(0b) 素の配信に変異後の文字列が 0 箇所', a.indexOf(to) < 0, '');
    check('(0c) 変異の配信に変異前の文字列が 0 箇所', b.indexOf(from) < 0, '');
    check('(0d) 変異の配信に変異後の文字列が 1 箇所', b.split(to).length - 1 === 1,
      '件数=' + (b.split(to).length - 1));
    check('(0e) 2 つの配信のバイト長が違う (同じ物を 2 回測っていない)', a.length !== b.length,
      '素=' + a.length + 'B / 変異=' + b.length + 'B');
  }

  /* ── 内蔵テストグラフを dev シームから 1 回だけ取り出す (本体はペイロード経路で測る) ── */
  let RUN_JSON = null;
  {
    const w = [], e = [];
    const boot = await bootPage(browser, 'http://localhost:' + PORT + QT_SEAM, w, e);
    RUN_JSON = await boot.evaluate(() => JSON.stringify(window.__graphRun.testRun()));
    await boot.close();
  }
  const PRE = payloadPre(RUN_JSON);
  const page = await bootPage(browser, 'http://localhost:' + PORT + QT, warns, errs, 'goblin-mine', PRE);
  {
    const s = await page.evaluate(() => ({ scen: scenarioId, active: window.__graphRun.active(),
                                           node: window.__graphRun.nodeId() }));
    check('(0f) ★本番と同じ入口 (ペイロード) で立ち上がっている = シナリオ 1 のイベントが混ざらない',
      s.scen === 'generated-quest' && s.active === true && s.node === 'n0',
      'scenarioId=' + s.scen + ' active=' + s.active + ' node=' + s.node);
  }

  // ══ §1 kind → 罠 / 宝箱 の配線 ═════════════════════════════════════════════
  mark('kind ごとの中身 (罠 / 宝箱 / 敵)');
  const V = await page.evaluate(TOUR_SRC);
  const IDS = ['n0', 'n1', 'n2', 'n4', 'n3'];
  console.log('[drv]   ' + IDS.map(k =>
    k + '(' + V[k].kind + ') traps=' + V[k].traps + ' chests=' + V[k].chests +
    ' enemies=' + V[k].enemies).join('\n[drv]   '));
  check('(1a) ★kind:"search" だけに罠が湧く (n4 のみ traps>0)',
    V.n4.traps > 0 && V.n0.traps === 0 && V.n1.traps === 0 && V.n2.traps === 0 && V.n3.traps === 0,
    IDS.map(k => k + '=' + V[k].traps).join(' '));
  check('(1b) ★kind:"search" に隠し宝箱が湧く (廃坑の hiddenChestCount=2 のぶん)',
    V.n4.chests === 2 && V.n4.hidden === 2,
    'chests=' + V.n4.chests + ' hidden=' + V.n4.hidden);
  check('(1c) ★kind:"loot" だけに玄室宝箱が湧く',
    V.n2.chests > 0 && V.n0.chests === 0 && V.n1.chests === 0 && V.n3.chests === 0,
    IDS.map(k => k + '=' + V[k].chests).join(' '));
  check('(1d) ★1 ノード = 1 部屋でも罠と宝箱が 0 個にならない (P2 の「控えの間」の仮の器が不要になった)',
    IDS.every(k => V[k].rooms === 1 && V[k].bossRoomIdx === 0) && V.n4.traps > 0 && V.n2.chests > 0,
    IDS.map(k => k + ':rooms=' + V[k].rooms).join(' '));
  check('(1e) 敵は kind に依存しない (start/combat/search に湧き、loot は 0 体)',
    V.n0.enemies === 2 && V.n1.enemies === 3 && V.n4.enemies === 1 && V.n2.enemies === 0 &&
    V.n3.enemies === 1, IDS.map(k => k + '=' + V[k].enemies).join(' '));

  // ══ §2 除外集合そのもの (kind から決まっていることを判定の出所ごと測る) ════
  mark('除外集合が kind 由来');
  check('(2a) ★search: 罠側は空集合 / 玄室宝箱側は全部屋除外',
    V.n4.excluded.length === 0 && V.n4.chestExcluded.join(',') === '0',
    'excluded=[' + V.n4.excluded + '] chestExcluded=[' + V.n4.chestExcluded + ']');
  check('(2b) ★loot: 玄室宝箱側が空集合 / 罠側は全部屋除外',
    V.n2.chestExcluded.length === 0 && V.n2.excluded.join(',') === '0',
    'excluded=[' + V.n2.excluded + '] chestExcluded=[' + V.n2.chestExcluded + ']');
  check('(2c) ★それ以外 (start / combat / boss) は両方とも全部屋除外',
    ['n0', 'n1', 'n3'].every(k => V[k].excluded.join(',') === '0' && V[k].chestExcluded.join(',') === '0'),
    ['n0', 'n1', 'n3'].map(k => k + ':[' + V[k].excluded + ']/[' + V[k].chestExcluded + ']').join(' '));
  const K2 = await page.evaluate(() => {
    const D = window.DFMapDef, d = { rooms: [{}, {}, {}] };
    const s = (f, k) => [...f(d, k)].sort((a, b) => a - b).join(',');
    return {
      trapSearch: s(D.excludedRoomIdxForKind, 'search'),
      trapCombat: s(D.excludedRoomIdxForKind, 'combat'),
      trapUnknown: s(D.excludedRoomIdxForKind, 'zzz-unknown'),
      chestLoot: s(D.chestExcludedRoomIdxForKind, 'loot'),
      chestSearch: s(D.chestExcludedRoomIdxForKind, 'search'),
      chestUnknown: s(D.chestExcludedRoomIdxForKind, 'zzz-unknown'),
      // 既存 2 関数が生きていること (統合されていない証明)
      legacyTrap: [...D.excludedRoomIdx({ rooms: [{}, {}] })].join(','),
      legacyChest: [...D.chestExcludedRoomIdx({ rooms: [{}, {}] })].join(','),
    };
  });
  check('(2d) 純関数: 3 部屋でも「空集合」か「全部屋」の 2 値だけを返す',
    K2.trapSearch === '' && K2.trapCombat === '0,1,2' &&
    K2.chestLoot === '' && K2.chestSearch === '0,1,2', JSON.stringify(K2));
  check('(2e) ★未知の kind は fail-closed (両方とも全部屋除外 = 罠も宝箱も湧かせない)',
    K2.trapUnknown === '0,1,2' && K2.chestUnknown === '0,1,2',
    'trap=[' + K2.trapUnknown + '] chest=[' + K2.chestUnknown + ']');
  check('(2f) ★既存 2 関数は生きたまま (統合していない = 2 部屋で {1} と {0,1} に割れる)',
    K2.legacyTrap === '1' && K2.legacyChest === '0,1',
    'excludedRoomIdx=[' + K2.legacyTrap + '] chestExcludedRoomIdx=[' + K2.legacyChest + ']');

  // ══ §3 行き止まりの「当たり / 外れ」 ═══════════════════════════════════════
  mark('行き止まりの当たり / 外れ');
  const D3 = await page.evaluate(async () => {
    const g = window.__graphRun;
    await g.enter('n2', 'right');                       // loot の行き止まり
    const hit = { deadEnd: g.deadEnd(), text: g.arrivalText(), chests: roomChests.length };
    for (const c of roomChests) { c.opened = true; c.found = true; c.hidden = false; }
    const afterLoot = { deadEnd: g.deadEnd(), text: g.arrivalText() };
    await g.enter('n0', 'left');
    const notDead = { deadEnd: g.deadEnd(), text: g.arrivalText() };
    await g.enter('n1', 'up'); await g.enter('n3', 'up');
    const boss = { deadEnd: g.deadEnd(), text: g.arrivalText(),
                   exits: g.graph().nodes.filter(n => n.id === 'n3')[0].exits.length };
    await g.enter('n1', 'down'); await g.enter('n0', 'down');
    return { hit, afterLoot, notDead, boss };
  });
  check('(3a) ★loot の行き止まり = 当たり (未開封の宝が実際にある)',
    D3.hit.deadEnd === 'hit' && D3.hit.chests > 0 && /打ち捨てられた荷/.test(D3.hit.text),
    D3.hit.deadEnd + ' chests=' + D3.hit.chests + ' "' + D3.hit.text + '"');
  check('(3b) ★回収済みなら「外れ」に変わる = 実体で測っている (kind で決め打ちしていない)',
    D3.afterLoot.deadEnd === 'miss' && /何も無い/.test(D3.afterLoot.text),
    D3.afterLoot.deadEnd + ' "' + D3.afterLoot.text + '"');
  check('(3c) 出口があるノードでは行き止まり判定を出さない',
    D3.notDead.deadEnd === null && !/行き止まり/.test(D3.notDead.text),
    String(D3.notDead.deadEnd) + ' "' + D3.notDead.text + '"');
  check('(3d) ★boss は出口 0 本でも「行き止まり」扱いにしない (外れではないので)',
    D3.boss.exits === 0 && D3.boss.deadEnd === null && /この奥に主がいる/.test(D3.boss.text),
    'exits=' + D3.boss.exits + ' deadEnd=' + D3.boss.deadEnd + ' "' + D3.boss.text + '"');

  // ── §3b loot の当たり保証は「種に依らない」(母集団 6 件の別 id で測る) ──────
  const LOOT_PRE = payloadPre(lootProbeRun(RUN_JSON));
  let lootPure = null;
  {
    const w = [], e = [];
    const p = await bootPage(browser, 'http://localhost:' + PORT + QT, w, e, 'goblin-mine', LOOT_PRE);
    lootPure = await p.evaluate(LOOT_PROBE_SRC);
    check('(3e) ★kind:"loot" の宝は種に依らず必ず湧く (別 id の loot 行き止まり ' +
      LOOT_PROBE_N + ' 件が全部 1 個以上)',
      lootPure.kind === 'loot' && lootPure.chests.length === LOOT_PROBE_N &&
      lootPure.chests.every(n => n >= 1),
      'chests=[' + lootPure.chests.join(',') + ']');
    check('(3f) probe グラフ自体が壊れていない (pageerror / console.error が 0)',
      e.length === 0, e.slice(0, 2).join(' | '));
    await p.close();
  }

  // ══ §4 exitEnemyCount が実際に湧いた敵数と一致 (P3 の穴 #1) ════════════════
  mark('ヒントの体数 = 実際に湧いた敵数');
  const cnt = IDS.map(k => k + ': 著者=' + V[k].slotCount + ' 実体=' + V[k].enemies);
  console.log('[drv]   ' + cnt.join(' / '));
  check('(4a) ★exitEnemyCount (著者の enemySlots+bossSlot) が実際の enemies.length と全ノードで一致',
    IDS.every(k => V[k].slotCount === V[k].enemies), cnt.join(' / '));
  check('(4b) 母集団ガード: 体数が全ノード同じ値ではない (真空一致でない)',
    new Set(IDS.map(k => V[k].enemies)).size >= 3, IDS.map(k => V[k].enemies).join(','));
  const H4 = await page.evaluate(async () => {
    const g = window.__graphRun;
    g.clearHints('n0');
    const r = await g.reveal('crit', 'n0');             // クリティカル = 体数まで見える
    return { n1: r.byExit.n1, count: g.enemyCount('n1') };
  });
  check('(4c) ★クリティカルのヒント文の体数が exitEnemyCount と同じ (文と数の出所が 1 本)',
    H4.n1.count === H4.count && H4.n1.count === 3 && /3 体ばかり/.test(H4.n1.text),
    'hint.count=' + H4.n1.count + ' enemyCount=' + H4.count + ' "' + H4.n1.text + '"');

  // ══ §5 kind:"rest" の回復 ══════════════════════════════════════════════════
  mark('rest ノードの回復');
  const R5 = await page.evaluate(async () => {
    const g = window.__graphRun;
    const out = {};
    // ① 初回: 実際に回復する
    hp = 10;
    await g.enter('n4', 'down');
    await g.enter('n5', 'right');
    out.first = { hp: hp, maxHp: maxHp, rested: g.rested('n5'), kind: g.kindOf('n5') };
    // ② 再訪: もう回復しない (往復による無限回復の封じ)
    const hpAfterFirst = hp;
    hp = 10;
    await g.enter('n4', 'left');
    await g.enter('n5', 'right');
    out.second = { hp: hp, hpAfterFirst: hpAfterFirst };
    // ③ ボスノードを経由しても rest が効く (__inBossRoom の引き直し)
    await g.enter('n4', 'left'); await g.enter('n0', 'up');
    await g.enter('n1', 'up'); await g.enter('n3', 'up');
    out.atBossFlag = g.inBossRoom();
    window.__inBossRoom = true;              // ★heroAI の入室検出が立てた状態を再現
    await g.enter('n1', 'down');
    out.afterBackFlag = g.inBossRoom();
    await g.enter('n0', 'down');
    // ④ 「まだ休んでいない rest ノード」へ戻して測り直す
    g.clearRested('n5');
    hp = 10;
    await g.enter('n4', 'down');
    await g.enter('n5', 'right');
    out.afterBoss = { hp: hp, flag: g.inBossRoom() };
    await g.enter('n4', 'left'); await g.enter('n0', 'up');
    return out;
  });
  check('(5a) ★rest ノードで実際に回復する (HP が最大値の 33% ぶん増える)',
    R5.first.hp > 10 && R5.first.kind === 'rest' &&
    R5.first.hp === Math.min(R5.first.maxHp, 10 + Math.ceil(R5.first.maxHp * 0.33)),
    'hp 10 → ' + R5.first.hp + ' (maxHp=' + R5.first.maxHp + ')');
  check('(5b) rested フラグが nodeState に焼かれる', R5.first.rested === true, String(R5.first.rested));
  check('(5c) ★再訪では回復しない (rest ノードと隣を往復する無限回復を塞いでいる)',
    R5.second.hp === 10, '2 度目: hp 10 → ' + R5.second.hp + ' (1 度目は ' + R5.second.hpAfterFirst + ')');
  check('(5d) ★ボスノードで __inBossRoom が立ち、引き返すと下りる (ノード遷移で毎回引き直す)',
    R5.atBossFlag === true && R5.afterBackFlag === false,
    'ボス部屋で=' + R5.atBossFlag + ' 引き返した後=' + R5.afterBackFlag);
  check('(5e) ★ボスを見た後でも rest が効く (__inBossRoom の取り残しで無言で死なない)',
    R5.afterBoss.hp > 10 && R5.afterBoss.flag === false,
    'hp 10 → ' + R5.afterBoss.hp + ' / __inBossRoom=' + R5.afterBoss.flag);

  // ══ §6 ノードに紐づくイベントの台帳 (器。中身の移植は P5) ═══════════════════
  mark('イベント台帳の器');
  const E6 = await page.evaluate(async () => {
    const g = window.__graphRun;
    const out = {};
    window.__evFired = { node: 0, kind: 0, decline: 0 };
    const here = () => ({ tx: Math.floor((playerX + 48) / 96), ty: Math.floor((playerY + 58) / 96) });
    out.rejectNoBinding = g.registerEvent({ key: 'bad', run: async () => {} }) === null;
    out.rejectNoRun = g.registerEvent({ key: 'bad2', nodeId: 'n2' }) === null;
    g.registerEvent({ key: 'ev-node', nodeId: 'n2', spot: here, run: async () => { window.__evFired.node++; } });
    g.registerEvent({ key: 'ev-kind', kind: 'search', spot: here, run: async () => { window.__evFired.kind++; } });
    g.registerEvent({ key: 'ev-decline', nodeId: 'n1', spot: here,
                      run: async () => { window.__evFired.decline++; return false; } });
    out.ledger = g.events().map(e => e.key + ':' + (e.nodeId || e.kind));
    const unpause = () => {
      gameStarted = true; gameOver = false; dungeonCleared = false;
      encounterActive = false; encounterRunning = false;
      skillCheckActive = false; dialogPaused = false;
    };
    // ── n2 (nodeId 束縛) ──
    await g.enter('n2', 'right'); unpause();
    out.hereAtN2 = g.eventsHere();
    await g.tickEvent();
    out.afterTick1 = { fired: window.__evFired.node, flag: g.eventFired('ev-node') };
    await g.tickEvent();                                   // 2 度目は発火しない
    out.afterTick2 = window.__evFired.node;
    // ── n4 (kind 束縛) ──
    await g.enter('n4', 'down'); unpause();
    out.hereAtN4 = g.eventsHere();
    await g.tickEvent();
    out.kindFired = { n: window.__evFired.kind, flag: g.eventFired('ev-kind') };
    // ── n1 (run が false を返す = 断られた) ──
    await g.enter('n0', 'up'); await g.enter('n1', 'up'); unpause();
    await g.tickEvent();
    out.declined = { n: window.__evFired.decline, flag: g.eventFired('ev-decline'),
                     mark: g.events().filter(e => e.key === 'ev-decline')[0].declined };
    // ── 発火済みは「そのノードだけ」(別ノードへ持ち越さない) ──
    await g.enter('n0', 'down'); unpause();
    out.notFiredElsewhere = g.eventFired('ev-node');
    out.eventSpot = g.eventSpot(3, 0);
    out.roomRect = ROOMS[0].slice();      // ★期待値を幾何から導くため (直書きしない)
    return out;
  });
  check('(6a) 束縛 (nodeId / kind) の無い登録は拒否する (全ノードで暴発しない fail-closed)',
    E6.rejectNoBinding === true && E6.rejectNoRun === true,
    '束縛なし=' + E6.rejectNoBinding + ' run なし=' + E6.rejectNoRun);
  check('(6b) 台帳に 3 件載る', E6.ledger.join(' ') === 'ev-node:n2 ev-kind:search ev-decline:n1',
    E6.ledger.join(' '));
  check('(6c) ★nodeId 束縛のイベントはそのノードだけに出る',
    E6.hereAtN2.join(',') === 'ev-node', '[' + E6.hereAtN2.join(',') + ']');
  check('(6d) ★接近で run() が呼ばれ、2 度目は呼ばれない (1 ノード 1 回)',
    E6.afterTick1.fired === 1 && E6.afterTick1.flag === true && E6.afterTick2 === 1,
    '1回目=' + E6.afterTick1.fired + ' 2回目=' + E6.afterTick2 + ' flag=' + E6.afterTick1.flag);
  check('(6e) ★kind 束縛のイベントは同じ kind のノードで出る (nodeId 束縛は混ざらない)',
    E6.hereAtN4.join(',') === 'ev-kind' && E6.kindFired.n === 1 && E6.kindFired.flag === true,
    '[' + E6.hereAtN4.join(',') + '] fired=' + E6.kindFired.n);
  check('(6f) ★run() が false を返したら「断られた」= 発火済みにしない (二度と話せなくならない)',
    E6.declined.n === 1 && E6.declined.flag === false && E6.declined.mark === true,
    'run=' + E6.declined.n + ' fired=' + E6.declined.flag + ' declined=' + E6.declined.mark);
  check('(6g) ★発火済みフラグはノード単位 (別ノードへ持ち越さない)',
    E6.notFiredElsewhere === false, String(E6.notFiredElsewhere));
  /* ⚠ 2026-08-07 (P5 前段): 期待値の直書き (27,13) をやめ、**その場の ROOMS[0] から導出**した。
   *   部屋を可視域サイズへ縮めた瞬間に 27 は部屋の外になり、この assert が
   *   「nodeEventSpot が壊れた」ように見えていたが、実際は**期待値の方が幾何に置き去られていた**
   *   (この assert が防ごうとしている「絶対座標の直書き」を、ドライバ自身がやっていた)。 */
  {
    const rc = E6.roomRect || [0, 0, 0, 0];
    const wantTx = rc[1] + 3, wantTy = Math.floor((rc[0] + rc[2]) / 2);
    check('(6h) nodeEventSpot が部屋の西端基準で歩けるタイルを返す (絶対座標を直書きさせない入口)',
      E6.eventSpot && E6.eventSpot.tx === wantTx && E6.eventSpot.ty === wantTy,
      JSON.stringify(E6.eventSpot) + ' / 期待=' + wantTx + ',' + wantTy +
      ' (部屋 ' + JSON.stringify(rc) + ' の西端 +3 / 縦中央)');
  }

  // ══ §7 到着ナレと出口選択が重ならない (P3 の穴 #4) ═════════════════════════
  mark('到着ナレと出口選択の重なり回避');
  const A7 = await page.evaluate(async () => {
    const g = window.__graphRun;
    gameStarted = true; gameOver = false; dungeonCleared = false;
    encounterActive = false; encounterRunning = false; skillCheckActive = false; dialogPaused = false;
    await g.enter('n2', 'right');                        // 到着即 settled な行き止まり
    const dm = document.getElementById('dmMessage');
    return {
      hold: g.arrivalHold(), left: g.cooldownLeft(),
      dmShown: !!(dm && dm.classList.contains('show')),
      dmText: dm ? dm.textContent : '',
      arrows: document.querySelectorAll('.exitArrow').length,
      settled: g.settled(),
    };
  });
  check('(7a) ★到着直後は出口選択の猶予が残っている (羊皮紙が到着ナレの上に重ならない)',
    A7.left > 1000 && A7.hold === 2400, '残り=' + A7.left + 'ms / hold=' + A7.hold + 'ms');
  check('(7b) 前提: そのノードは到着した瞬間に settled (猶予が無ければ即座に選択が出る条件)',
    A7.settled === true && A7.arrows === 0, 'settled=' + A7.settled + ' arrows=' + A7.arrows);
  check('(7c) 到着ナレが実際に出ている (猶予の対象が存在する)',
    A7.dmShown === true && A7.dmText.length > 0, 'shown=' + A7.dmShown + ' "' + A7.dmText + '"');
  const A7b = await page.evaluate(() => new Promise(res => setTimeout(() => {
    res({ arrows: document.querySelectorAll('.exitArrow').length,
          left: window.__graphRun.cooldownLeft(),
          guards: [gameStarted, gameOver, dungeonCleared, encounterActive, encounterRunning,
                   hp, skillCheckActive, dialogPaused, window.__graphRun.busy()].join('|') });
  }, 3400)));
  check('(7d) ★猶予が明けたら出口選択が出る (遅らせただけで殺していない)',
    A7b.arrows >= 1 && A7b.left === 0,
    'arrows=' + A7b.arrows + ' 残り=' + A7b.left + 'ms guards[started|over|cleared|encA|encR|hp|skill|paused|busy]=' + A7b.guards);

  // ══ §8 ★負のコントロール: RUN が null の既存経路が 1bit も変わらない ═══════
  mark('既存経路の非退行 (RUN が null)');
  {
    /* ⚠⚠ ここが P4 でいちばん壊しやすい場所。壊れても分岐版のテストは全部緑のままなので、
     *   **同じ run の中で必ず測る**。期待値は js/df-mapdef.js の除外集合の表そのもの:
     *     2 部屋 (既存 6 ダンジョン) … EXCLUDED_ROOMS={1} / ROOM_CHEST_EXCLUDED_ROOMS={0,1}
     *     3 部屋 (屋外 caravan-road) … {0,2} / {0,2} (たまたま一致する)                    */
    /* ⚠⚠ 2026-08-08 (P5): **廃坑だけ `?graph=0` を付ける**。廃坑は内蔵グラフを持つように
     *   なったので、素の URL では RUN が立って「既存経路」ではなくなる。計画書どおり
     *   `?graph=0` が旧単一マップへの恒久的な退避口なので、そこへ固定して測り続ける。
     *
     * ⚠⚠ 2026-08-12 (P6): **森と竜巣にも `?graph=0` を足した**。P6 で既定 6 シナリオが
     *   全部そろって内蔵グラフを持つようになり、「そもそも分岐グラフを持たないダンジョン」と
     *   いう母集団が**消滅した**ため (実装のバグではなく母集団ガードの陳腐化)。
     *   ⭐ この 3 件が測りたいのは「**RUN が null の旧コード経路**が 1bit も変わっていないこと」
     *     なので、張り替え先は撤退スイッチ `?graph=0` の側 (実プレイを測る節ではない)。
     *   ⭐ **caravan-road だけは素のまま**。屋外テーマは帯マスクと非互換で RUN の側から
     *     明示的に除外されており、「本当にグラフを持たない」母集団はここに残っている。
     *   ⭐⭐ 張り替えた分は **(8-*-e) 装置 assert** で「スイッチを外すと分岐が立つ」ことを
     *     必ず測る。これが無いと `?graph=0` が黙って無効化されても §8 が緑のままになる。
     *   ⚠ assert は 1 つも消していない (4 ケース x 4 件 + 装置 3 件)。 */
    const CASES = [
      { scen: 'goblin-mine',    rooms: 2, exc: '1',   chest: '0,1', g0: true },
      { scen: 'bandits-forest', rooms: 2, exc: '1',   chest: '0,1', g0: true },
      { scen: 'dragon-lair',    rooms: 2, exc: '1',   chest: '0,1', g0: true },
      { scen: 'caravan-road',   rooms: 3, exc: '0,2', chest: '0,2' },
    ];
    for (const c of CASES) {
      const w = [], e = [];
      // ⚠ ?graphtest は付けない = dev シームの内蔵テストグラフは 1 命令も走らない
      const p = await bootPage(browser,
        'http://localhost:' + PORT + '/index.html?diag=1' + (c.g0 ? '&graph=0' : ''), w, e, c.scen);
      const r = await p.evaluate(() => ({
        active: window.__graphRun.active(),
        kind: window.__graphRun.kindOf('n0'),
        rooms: ROOMS.length,
        exc: [...EXCLUDED_ROOMS].sort((a, b) => a - b).join(','),
        chest: [...ROOM_CHEST_EXCLUDED_ROOMS].sort((a, b) => a - b).join(','),
        traps: traps.length, chests: roomChests.length, enemies: enemies.length,
      }));
      check('(8-' + c.scen + '-a) RUN が null (分岐が 1 命令も走らない) / kind も引けない',
        r.active === false && r.kind === null, 'active=' + r.active + ' kind=' + r.kind);
      check('(8-' + c.scen + '-b) ★除外集合が従来値 (' + c.rooms + '部屋 → {' + c.exc + '} と {' + c.chest + '})',
        r.rooms === c.rooms && r.exc === c.exc && r.chest === c.chest,
        'rooms=' + r.rooms + ' EXCLUDED_ROOMS={' + r.exc + '} ROOM_CHEST_EXCLUDED_ROOMS={' + r.chest + '}');
      check('(8-' + c.scen + '-c) 母集団ガード: 罠と敵が実際に湧いている (空集合を測っていない)',
        r.traps > 0 && r.enemies > 0, 'traps=' + r.traps + ' chests=' + r.chests + ' enemies=' + r.enemies);
      check('(8-' + c.scen + '-d) pageerror / console.error が 0', e.length === 0, e.slice(0, 2).join(' | '));
      await p.close();

      /* ⭐⭐ 装置 assert: 撤退スイッチで旧経路へ固定したケースは、**スイッチを外すと
       *   分岐が立つ**ことまで測る。これが無いと `?graph=0` が黙って無効化されたり、
       *   内蔵グラフが消えたりしても (8-*-a) が緑のまま通ってしまう
       *   ([[project-headless-verification]]「張り替えたら装置 assert を必ず 1 本足す」)。 */
      if (c.g0) {
        const w2 = [], e2 = [];
        const p2 = await bootPage(browser, 'http://localhost:' + PORT + '/index.html?diag=1', w2, e2, c.scen);
        const r2 = await p2.evaluate(() => ({ active: window.__graphRun.active(),
                                              nodes: (window.__graphRun.graph() || { nodes: [] }).nodes.length }));
        /* ★[#16] しきい値を `nodes >= 2` から `>= 1` へ下げたが、**緩めていない** —
         *   同じ if の (8-*-a) が ?graph=0 側で active === false を要求しており、
         *   ここは**その裏返し**を測る対。ノード数 2 は「分岐がある」ことの偶発的な代理で、
         *   シナリオ2 が 1 ノードへ畳まれた今は成り立たない (卓上マップ 1 枚で完結)。
         *   スイッチが効いていることの証拠は active の反転そのものなので、そちらを名指しにした。 */
        check('(8-' + c.scen + '-e) ★装置: ?graph=0 を外すとグラフが立つ (スイッチが効いている証拠)',
          r2.active === true && r2.nodes >= 1 && r.active === false,
          'active=' + r2.active + ' nodes=' + r2.nodes + ' / ?graph=0 側 active=' + r.active);
        await p2.close();
      }
    }
  }

  // ══ §9 エラーゼロ ══════════════════════════════════════════════════════════
  mark('エラーゼロ');
  check('(9a) 素の側: 起動〜全操作で pageerror / console.error が 0', errs.length === 0,
    errs.slice(0, 5).join(' | '));

  // ══ §10 負のコントロール (同一 run に内包) ═════════════════════════════════
  mark('負のコントロール --mutate ' + MUTATE);
  {
    const wM = [], eM = [];
    const pM = await bootPage(browser, 'http://localhost:' + (PORT + 1) + QT, wM, eM, 'goblin-mine', PRE);
    const M = await pM.evaluate(TOUR_SRC);
    console.log('[drv]   変異側: ' + IDS.map(k =>
      k + ' t=' + M[k].traps + ' c=' + M[k].chests).join(' / '));
    /* ⚠ 変異ごとに「欠陥の姿」が違う。単一の物差しを使い回すと空振りする。 */
    if (MUTATE === 'nokind') {
      check('(10) ★変異側では 1 部屋が両方の除外集合に入り、罠も宝箱も全ノードで 0 個',
        IDS.every(k => M[k].traps === 0 && M[k].chests === 0),
        IDS.map(k => k + ':t' + M[k].traps + '/c' + M[k].chests).join(' '));
      check('(10b) ★素の側では search に罠 / loot に宝箱が湧く (空振りでない証明)',
        V.n4.traps > 0 && V.n2.chests > 0,
        '素: n4 traps=' + V.n4.traps + ' / n2 chests=' + V.n2.chests);
    } else if (MUTATE === 'noguarantee') {
      /* ⚠⚠ **ノード 1 件では測れない**。乱数はノード id から決定論的に導かれるので、
       *   ある id の種はたまたま CHEST_SPAWN_CHANCE を通り、保証を外しても宝箱が湧く
       *   (2026-08-07 に n2 で実際にそうなり、負のコントロールが沈黙した)。
       *   → §3b と**同じ 6 件の probe グラフ**を変異側にも流し、母集団で比べる。 */
      const wL = [], eL = [];
      const pL = await bootPage(browser, 'http://localhost:' + (PORT + 1) + QT, wL, eL,
                                'goblin-mine', LOOT_PRE);
      const lootMut = await pL.evaluate(LOOT_PROBE_SRC);
      await pL.close();
      const nPure = lootPure.chests.filter(n => n >= 1).length;
      const nMut = lootMut.chests.filter(n => n >= 1).length;
      check('(10) ★変異側では loot の宝が抽選任せになり、' + LOOT_PROBE_N + ' 件のうち一部が空になる',
        nMut < LOOT_PROBE_N && nMut < nPure,
        '変異=[' + lootMut.chests.join(',') + '] (' + nMut + '/' + LOOT_PROBE_N + ')');
      check('(10b) ★素の側は ' + LOOT_PROBE_N + '/' + LOOT_PROBE_N + ' 全部湧く (当たりの保証が効いている)',
        nPure === LOOT_PROBE_N, '素=[' + lootPure.chests.join(',') + ']');
    } else if (MUTATE === 'nodeadend') {
      const MD = await pM.evaluate(async () => {
        const g = window.__graphRun;
        await g.enter('n2', 'right');
        return { deadEnd: g.deadEnd(), text: g.arrivalText(), chests: roomChests.length };
      });
      check('(10) 変異側では宝があるのに「外れ」と言う',
        MD.deadEnd === 'miss' && MD.chests > 0 && /何も無い/.test(MD.text),
        'deadEnd=' + MD.deadEnd + ' chests=' + MD.chests);
      check('(10b) ★素の側は「当たり」と言う', D3.hit.deadEnd === 'hit', '素=' + D3.hit.deadEnd);
    } else if (MUTATE === 'norestheal' || MUTATE === 'norestguard' || MUTATE === 'noinboss') {
      const MR = await pM.evaluate(async () => {
        const g = window.__graphRun;
        const out = {};
        hp = 10;
        await g.enter('n4', 'down');
        await g.enter('n5', 'right');
        out.first = hp;
        hp = 10;
        await g.enter('n4', 'left');
        await g.enter('n5', 'right');
        out.second = hp;
        await g.enter('n4', 'left'); await g.enter('n0', 'up');
        await g.enter('n1', 'up'); await g.enter('n3', 'up');
        window.__inBossRoom = true;
        await g.enter('n1', 'down');
        out.flagAfterBack = g.inBossRoom();
        await g.enter('n0', 'down');
        g.clearRested('n5');
        hp = 10;
        await g.enter('n4', 'down'); await g.enter('n5', 'right');
        out.afterBoss = hp;
        return out;
      });
      if (MUTATE === 'norestheal') {
        check('(10) 変異側では rest ノードで回復しない', MR.first === 10, '変異 hp 10 → ' + MR.first);
        check('(10b) ★素の側は回復する', R5.first.hp > 10, '素 hp 10 → ' + R5.first.hp);
      } else if (MUTATE === 'norestguard') {
        check('(10) ★変異側では往復で何度でも回復する (無限回復)',
          MR.second > 10, '変異 2 度目 hp 10 → ' + MR.second);
        check('(10b) ★素の側は 2 度目に回復しない', R5.second.hp === 10, '素 2 度目 hp 10 → ' + R5.second.hp);
      } else {
        check('(10) ★変異側ではボスから引き返しても __inBossRoom が下りず、rest が無言で効かない',
          MR.flagAfterBack === true && MR.afterBoss === 10,
          '__inBossRoom=' + MR.flagAfterBack + ' hp 10 → ' + MR.afterBoss);
        check('(10b) ★素の側はフラグが下りて rest が効く',
          R5.afterBackFlag === false && R5.afterBoss.hp > 10,
          '素 __inBossRoom=' + R5.afterBackFlag + ' hp 10 → ' + R5.afterBoss.hp);
      }
    } else if (MUTATE === 'noevent') {
      const ME = await pM.evaluate(async () => {
        const g = window.__graphRun;
        window.__evFired = 0;
        const here = () => ({ tx: Math.floor((playerX + 48) / 96), ty: Math.floor((playerY + 58) / 96) });
        g.registerEvent({ key: 'ev-node', nodeId: 'n2', spot: here, run: async () => { window.__evFired++; } });
        await g.enter('n2', 'right');
        gameStarted = true; gameOver = false; dungeonCleared = false;
        encounterActive = false; encounterRunning = false;
        skillCheckActive = false; dialogPaused = false;
        await g.tickEvent();
        return { fired: window.__evFired, flag: g.eventFired('ev-node') };
      });
      check('(10) 変異側では接近しても run() が呼ばれない', ME.fired === 0 && ME.flag === false,
        'fired=' + ME.fired + ' flag=' + ME.flag);
      check('(10b) ★素の側では 1 回だけ呼ばれる', E6.afterTick1.fired === 1 && E6.afterTick2 === 1,
        '素: 1回目=' + E6.afterTick1.fired + ' 2回目=' + E6.afterTick2);
    }
    check('(10z) 変異側でも JS エラーは出ない (壊したのは 1 箇所だけ = 外科的)',
      eM.length === 0, eM.slice(0, 3).join(' | '));
    await pM.close();
  }

  await page.close();
  await browser.close();
  srvPure.close(); srvMut.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n[drv] ' + pass + '/' + results.length + ' PASS   (--mutate ' + MUTATE + ')');
  if (pass !== results.length) {
    console.log('[drv] FAILED:');
    for (const r of results) if (!r.ok) console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
