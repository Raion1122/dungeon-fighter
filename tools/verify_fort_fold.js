#!/usr/bin/env node
/*
 * verify_fort_fold.js — 実装依頼書 #63「砦(orc-fort)を卓上マップ 2 枚へ畳む
 *   (旧タイプ小部屋 n0/n1/n2/n3/n5/n6 の廃止 → n4 練兵場 / n7 将軍の間 の 2 ノード)」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測り方の方針
 *   ⭐ **期待値は「その場で導く」**。移設した敵の顔ぶれは `?fortfold=0` の n1+n2+n3+n4 の
 *     合計から、ノード数は `buildScenarioRun("orc-fort")` の戻り値から数える。
 *     ⛔ 体数・座標・ノード数を数字で焼き込まない (焼くと仕様変更で黙って腐る)。
 *   ⭐ 幾何は**本番の関数だけ**を通す (nodeGateTile / isTileWall / aStar /
 *     NODE_ENTRY_INSET / DETECTION_RANGE / TILE_SIZE)。マスクは**配信した index.html を
 *     自前でパース**して組む (実装の paintingBlockedTilesFor は 1 行も借りない)。
 *
 * ■ ⛔ 依頼書 §9 のうち「そのままでは測れない」節は言い直してある (根拠は §13 の実測)
 *   (2c) … 「ボスノードは両腕で**完全一致**」は**原理的に不可能**。畳んだ n7 は 30x20 の
 *          大部屋 (rect / start / 絵 / 座標がすべて変わる) で、そうでなければ ?fortfold=0 が
 *          旧絵へ戻れない。⇒ 「**顔ぶれ (種類と体数) が両腕で一致**し、ボスが garrock 単騎」へ。
 *   (5b) … 「入る辺の中点 + NODE_ENTRY_INSET」は **20 行 = 偶数**なので midR が
 *          Math.floor で**部屋の中心より 1 行上**に来る (#58 の教訓)。⇒ 数字を焼かず
 *          rect からの独立式で組み、実際にパーティが立ったタイルと突き合わせる。
 *   (6a) … 「**道中ノードに** inactive な敵が 0」は狭すぎる。守護者を戻す誤りは
 *          「畳んだ表へ n6 を足す」形で入るので、**畳んだグラフの全ノード**を見る。
 *   (7c) … 「?fortfold=0 の 8 ノードが grid_s2 の golden と完全一致」は
 *          **driver_grid_s2 の領分**(同じ golden を 2 本で持つと二重管理になる)。
 *          ⇒ ここでは「撤退の腕が旧 7x6 / 9x6 と旧絵に戻る」だけを測る。
 *
 * ■ 節
 *   §0 装置 (母集団の確認)  §1 構造  §2 敵  §3 守護者  §4 罠と宝箱
 *   §5 幾何  §6 詰み防止  §7 撤退  §8 恒等 (非退行)
 *
 * ── 負のコントロール (--negative。配信をメモリ上で差し替える) ────────────────────
 *   nofold / nokinds / dropfoes / addn6 / gateshift / rectshift / startdefault / density1
 *   ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと必ず空振り)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと差し替わったか確認できない)。
 *   ⛔ 次の行は**アンカーに使わない** — 既存ドライバが逐語で握っている:
 *        ? { "bandits-forest": { n7: ["search", "loot"] } }        (grid_s2 の nosearchkind)
 *        const SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF;   (swamp_fold の nofold/mapoff)
 *        sealRing: true, …                                         (index.html に複数箇所)
 *
 * 使い方:
 *   node tools/verify_fort_fold.js               # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_fort_fold.js --negative    # 変異 8 本 (port 10202〜10209) が赤くなるか
 *   node tools/verify_fort_fold.js --negative --only addn6
 *   node tools/verify_fort_fold.js --mutate nofold --port 10202
 * ⚠ base ポートは **10201**。10181 は #62 / 10171 は #61 / 10161 は #60 が占有。
 *   ⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56 の実測)。
 * exit 0=期待どおり / 1=FAIL あり / 2=環境不足 / 3=変異の空振り・使い方の誤り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '10201'), 10);
const THEME = 'orc-fort';
/* 恒等 (8a) の母集団。⚠ orc-fort は含めない (変えたのはそこだから)。 */
const OTHER_SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'undead-temple', 'dragon-lair'];
/* 畳んだ後に残るノード / 消えるノード。⚠ これは**契約**なのでドライバ側に書き下す
 *   (実装から読むと実装の誤りを一緒に信じてしまう)。 */
const KEEP_IDS = ['n4', 'n7'];
const DROP_IDS = ['n0', 'n1', 'n2', 'n3', 'n5', 'n6'];
/* 休眠する古代王国の守護者。⚠ 種類名は spec に直書きなので契約。 */
const GUARDIAN_TYPES = ['stoneGolem', 'stoneLegionary', 'gargoyle'];
/* 旧構成で n4 へ移設される側のノード。⭐ 期待値はここから**合計して導く** (写経しない)。 */
const MERGED_FROM = ['n1', 'n2', 'n3', 'n4'];

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* M1 畳みを丸ごと無効化する = 8 ノードのまま。§0/§1 全般が赤くなるべき。 */
  nofold: [['    const FORT_FOLDED = !FORT_FOLD_OFF;',
            '    const FORT_FOLDED = false;   /* ★変異nofold */']],
  /* M2 ⭐⭐⭐ 兼務宣言から砦の行を消す = 罠 5 個も隠し宝箱 4 個も無言でゼロになる罠の再現 (森 #16)。 */
  nokinds: [['      if (FORT_FOLDED) t["orc-fort"] = { n4: ["search", "loot"] };',
             '      /* ★変異nokinds — 砦の兼務宣言を落とす */']],
  /* M3 移設した 7 体を丸ごと落とす = 体数が旧構成の合計と合わなくなる。
   *   ⚠ 三項の条件だけを false にする (行ごと消すと続く `? [...] : []` が構文エラー)。 */
  dropfoes: [['      const FOLD_MOVED_FORT = FORT_FOLDED',
              '      const FOLD_MOVED_FORT = false   /* ★変異dropfoes */']],
  /* M4 ⭐⭐⭐ **本命** — 畳んだノード表へ n6「忘れられた廟」を足す = 休眠する守護者 5 体を
   *   本道に置く。initGuardians は inactive/dormant を立てるが passiveNpc を立てないので
   *   isNodeSettled() が永久 false = クリア不能になる (依頼書 §2-2)。§6/§3 が赤くなるべき。 */
  addn6: [['          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },',
           '          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits }, run.nodes.find(n => n.id === "n6"),   /* ★変異addn6 */']],
  /* M5 出口ゲートを 1 タイルずらす = 「矢印は絵の扉・遷移は辺の中点」という開かない扉。 */
  gateshift: [['          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },',
               '          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits.map(e => ({ to: e.to, dir: e.dir, at: [e.at[0], e.at[1] + 1], hint: e.hint })) },   /* ★変異gateshift */']],
  /* M6 rect を 1 行ずらす = tileBounds と食い違う (絵が 1 行ぶんずれて貼られる)。 */
  rectshift: [['              rect: [4, 10, 23, 39], paint: "n4big", density: 0,',
               '              rect: [5, 10, 24, 39], paint: "n4big", density: 0,   /* ★変異rectshift */']],
  /* M7 start を既定 (36,13) へ戻す = buildNode の「起点の床保証」が絵の東端に
   *   blocked マスクの穴を無言で開ける。 */
  startdefault: [['              start: { tx: 12, ty: 13 },   /* 崩れた城門の 2 タイル内側 */',
                  '              start: { tx: 36, ty: 13 },   /* ★変異startdefault */']],
  /* M8 density の 0 を `|| 1` で握り潰す = 既に描き込まれた絵の上へ scenery が湧く。
   *   ⚠ ここは buildP6Run の共通骨格なので森・沼にも効くが、負のコントロールとしては正しい。 */
  density1: [['                                  density: d.density, start: d.start }),',
              '                                  density: d.density || 1, start: d.start }),   /* ★変異density1 */']],
};
/* 変異 → 赤くなるべき assert id。
 * ⚠⚠⚠ 机上で書かない。1 本ずつ実走して**実際に赤くなった id** を書く (#57 の教訓)。
 * ── 2026-09-09 の実走で赤くなった集合 (爆風の広さも記録しておく) ───────────────
 *   nofold       … 0a 1a 1b 1c2 2a 2d 3a 4a 5a 5b 5c 5e 5g 6a 7b      (15 本)
 *   nokinds      … 4a                                                   (1 本 ⭐ 最も鋭い)
 *   dropfoes     … 2a 2d                                                (2 本)
 *   addn6        … 0a 0b 1a 1b 1c 1c2 1d 2a 2c 2d 4a 5a 5b 5c 5d 5e 5f 5g 6a 7b (20 本)
 *                  ⭐⭐⭐ lint が error を出して RUN ごと null へ落ちる = 守護者を本道へ
 *                  戻すと**分岐グラフが起動すらしない**。6a も確かに赤い。
 *   gateshift    … 5f                                                   (1 本 ⭐ 最も鋭い)
 *   rectshift    … 5a 5b 5f                                             (3 本)
 *   startdefault … 5b                                                   (1 本 ⭐ 最も鋭い)
 *   density1     … 5g                                                   (1 本 ⭐ 最も鋭い)
 * ⭐ nokinds が 4a だけ・gateshift が 5f だけ・startdefault が 5b だけ・density1 が 5g だけ
 *   = **節が分離している**証拠 (1 つの変異が全部を赤くする「爆風だけの装置」ではない)。 */
const MUT_EXPECT = {
  nofold:       ['0a'],
  nokinds:      ['4a'],
  dropfoes:     ['2a'],
  addn6:        ['6a'],
  gateshift:    ['5f'],
  rectshift:    ['5a'],
  startdefault: ['5b'],
  density1:     ['5g'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  /* ⚠ 変異ごとに**原本**を読み直す。変異後のバッファを使い回すと、同じアンカーを共有する
   *   2 本目 (gateshift は addn6 と同じ行を握る) が「注入点 0 箇所」= 偽のアンカー腐敗
   *   exit 3 になる (#56 の教訓)。 */
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of MUTATIONS[key]) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → 差し替わったか確認できない');
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
  }
  _mutCache[key] = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey)[rel]); return;
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
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
function httpStatus(port, p) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: port, path: p }, r => { r.resume(); resolve(r.statusCode); })
      .on('error', () => resolve(0));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ★ドライバ側の独立実装 — 配信されたテキストから n4big / n7big のマスクを組む
//   ⚠⚠ df-mapdef.js の paintingBlockedTilesFor も index.html の関数も 1 行も借りない。
// ══════════════════════════════════════════════════════════════════════════════
function sliceBrace(text, i) {
  let depth = 0, j = i, quote = null;
  while (j < text.length) {
    const ch = text[j];
    if (quote) {
      if (ch === '\\') { j += 2; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(i, j + 1); }
    j++;
  }
  throw new Error('{ } が閉じていません');
}
function stripComments(s) {
  const out = []; let i = 0, quote = null;
  while (i < s.length) {
    const ch = s[i];
    if (quote) {
      out.push(ch);
      if (ch === '\\' && i + 1 < s.length) { out.push(s[i + 1]); i += 2; continue; }
      if (ch === quote) quote = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out.push(ch); i++; continue; }
    if (s.startsWith('//', i)) { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    if (s.startsWith('/*', i)) { const j = s.indexOf('*/', i + 2); if (j < 0) throw new Error('block comment'); i = j + 2; continue; }
    out.push(ch); i++;
  }
  return out.join('');
}
/* -> { theme: { key: { bounds, node, rows, seal, outdoor, src } } } */
function parsePaintings(indexText) {
  const MARK = 'const ROOM_PAINTINGS_DEF = {';
  const i = indexText.indexOf(MARK);
  if (i < 0) throw new Error('ROOM_PAINTINGS_DEF が見つかりません');
  const body = stripComments(sliceBrace(indexText, i + MARK.length - 1));
  const out = {};
  const themeRe = /["']([\w\-]+)["']\s*:\s*\{/g;
  let m;
  while ((m = themeRe.exec(body))) {
    const theme = m[1];
    const block = sliceBrace(body, m.index + m[0].length - 1);
    themeRe.lastIndex = m.index + m[0].length - 1 + block.length;
    const list = {};
    const entRe = /["']?([\w]+)["']?\s*:\s*\{/g;
    let e;
    while ((e = entRe.exec(block))) {
      const eb = sliceBrace(block, e.index + e[0].length - 1);
      entRe.lastIndex = e.index + e[0].length - 1 + eb.length;
      const bm = /tileBounds\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/.exec(eb);
      if (!bm) continue;
      const km = /blocked\s*:\s*\[([\s\S]*?)\]/.exec(eb);
      const sm = /src\s*:\s*["']([^"']+)["']/.exec(eb);
      list[e[1]] = {
        bounds: bm.slice(1, 5).map(Number),
        node: /node\s*:\s*true/.test(eb),
        seal: /sealRing\s*:\s*true/.test(eb),
        outdoor: /outdoor\s*:\s*true/.test(eb),
        src: sm ? sm[1] : null,
        rows: km ? (km[1].match(/["']([^"']*)["']/g) || []).map(s => s.slice(1, -1)) : null,
      };
    }
    out[theme] = list;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ側の測定
// ══════════════════════════════════════════════════════════════════════════════
async function bootPage(browser, url, scen, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  /* ⚠⚠⚠ (1d) で使う。**必ず m.type() で絞る** —
   *   `[graph] 分岐グラフで起動します` は console.log の**成功行**なので、
   *   語で拾うと素で必ず赤くなる (#62 が実際に踏んだ)。 */
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') errs.push(t.toUpperCase() + ' ' + m.text());
  });
  page.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()); });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* グラフの姿。⭐ RUN (起動時に組まれた物) と buildScenarioRun (その場で呼び直した物) の
 *   **2 経路**を返すので、ドライバはノード数も id も写経しなくてよい。 */
const GRAPH_FN = (others, theme) => {
  const out = { err: null };
  const nodeOf = (n) => {
    const rm = (n.mapDef.rooms || [])[0] || {};
    return { id: n.id, kind: n.kind, rect: rm.rect ? rm.rect.slice() : null,
             paint: rm.painting ? rm.painting.key : null,
             density: rm.scenery ? rm.scenery.density : null,
             slots: (rm.enemySlots || []).map(s => s.slice()),
             boss: rm.bossSlot ? rm.bossSlot.slice() : null,
             start: n.mapDef.start ? { tx: n.mapDef.start.tx, ty: n.mapDef.start.ty } : null,
             exits: n.exits.map(e => ({ to: e.to, dir: e.dir || null, at: e.at.slice() })) };
  };
  const hash = (s) => { let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h * 33) ^ s.charCodeAt(i)) >>> 0);
    return h.toString(16) + ':' + s.length; };
  try {
    const R = (typeof RUN !== 'undefined') ? RUN : null;
    out.active = !!R;
    out.seamActive = !!(window.__graphRun && window.__graphRun.active());
    const g = R ? R.graph : null;
    out.entry = g ? g.entry : null;
    out.curNode = (typeof currentNodeId !== 'undefined') ? currentNodeId : null;
    out.nodes = g ? g.nodes.map(nodeOf) : null;
    /* ★2 経路目 = buildScenarioRun をその場で呼び直す (期待値を写経しないための足場) */
    try {
      const g2 = buildScenarioRun(theme);
      out.fresh = g2 ? { entry: g2.entry, ids: g2.nodes.map(n => n.id),
                         kinds: g2.nodes.map(n => n.kind) } : null;
    } catch (e) { out.fresh = { err: String(e && e.message || e) }; }
    /* 恒等 (非退行) — 他 5 シナリオのグラフ全文のハッシュ */
    out.others = {};
    for (const sid of others) {
      try { const r = buildScenarioRun(sid); out.others[sid] = r ? hash(JSON.stringify(r)) : null; }
      catch (e) { out.others[sid] = 'THREW'; }
    }
    if (window.DFMapDef && g) {
      const L = DFMapDef.lintRun(g);
      out.lint = { e: L.errors.map(x => x.code), w: L.warnings.map(x => x.code) };
    } else out.lint = null;
    out.kindsTable = (typeof NODE_EXTRA_SPAWN_KINDS !== 'undefined')
      ? JSON.parse(JSON.stringify(NODE_EXTRA_SPAWN_KINDS)) : null;
    /* ★本番の並び (exitsWithReturn) = 自動進行が opts[0] を取る、その 0 番目 */
    out.opts = (window.__graphRun && R && R.byId[currentNodeId])
      ? window.__graphRun.exits().map(o => ({ to: o.to, dir: o.dir, back: !!o.back })) : null;
    /* 幾何の物差しは**本番の定数**から取る (⛔ 12.5 タイルを写経しない) */
    out.tile = (typeof TILE_SIZE !== 'undefined') ? TILE_SIZE : null;
    out.detect = (typeof DETECTION_RANGE !== 'undefined') ? DETECTION_RANGE : null;
    out.inset = (typeof NODE_ENTRY_INSET !== 'undefined') ? NODE_ENTRY_INSET : null;
  } catch (e) { out.err = String(e && e.message || e); }
  return out;
};

/* ノードを実プレイと同じ順序で組み、盤面を丸ごと写して返す。
 * ⚠⚠ buildNode(nd.mapDef) を直に呼ばない (MAPDEF.isCustom が付かず旧在庫の絵が貼られる)。 */
const SNAP_FN = (nodeId, via) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty(via || 'right'); } catch (e) {}
  const md = RUN.byId[nodeId].mapDef, room = (md.rooms || [])[0] || {};
  const rect = room.rect || null;
  const walls = [];
  if (rect) {
    for (let r = rect[0]; r <= rect[2]; r++) {
      let line = '';
      for (let c = rect[1]; c <= rect[3]; c++) line += isTileWall(c, r) ? '#' : '.';
      walls.push(line);
    }
  }
  const gates = {};
  for (const d of ['up', 'down', 'left', 'right']) {
    try { const g = nodeGateTile(md, d); gates[d] = [g.tx, g.ty]; } catch (e) { gates[d] = null; }
  }
  return {
    node: nodeId, rect: rect, kind: RUN.byId[nodeId].kind,
    start: md.start ? { tx: md.start.tx, ty: md.start.ty } : null,
    /* ★入場地点は「**パーティが実際に立っているタイル**」。⛔ START_TX/TY は
     *   buildNode が書いた mapDef.start なので別の縁から入っても動かない。 */
    hero: { tx: Math.round((playerX - SNAP_X_OFFSET) / TILE_SIZE),
            ty: Math.round((playerY - SNAP_Y_OFFSET) / TILE_SIZE) },
    paint: room.painting ? room.painting.key : null,
    density: room.scenery ? room.scenery.density : null,
    slots: (room.enemySlots || []).map(s => s.slice()),
    boss: room.bossSlot ? room.bossSlot.slice() : null,
    exits: RUN.byId[nodeId].exits.map(e => ({ to: e.to, dir: e.dir || null, at: e.at.slice() })),
    gates: gates,
    traps: (typeof traps !== 'undefined') ? traps.length : null,
    chests: (typeof roomChests !== 'undefined') ? roomChests.length : null,
    /* ⚠ 敵のタイルは Math.round(e.x / TILE) では出ない。createEnemy が
     *   x = tx*TILE + TILE/2 - displaySize/2 を入れるので、中心へ戻してから floor する。 */
    enemies: enemies.map(e => ({ type: e.type, alive: !!e.alive, inactive: !!e.inactive,
      passiveNpc: !!e.passiveNpc,
      tx: Math.floor((e.x + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE),
      ty: Math.floor((e.y + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE) })),
    doors: (typeof doorsForRender === 'function' ? doorsForRender() : [])
      .map(d => ({ id: d.id, tx: d.tx, ty: d.ty, state: d.state })),
    paintings: (typeof roomPaintings !== 'undefined' ? roomPaintings : []).map(p => ({
      src: (p.img && p.img.getAttribute('src')) || '', seal: !!p.sealRing })),
    walls: walls,
  };
};

/* ★本番の aStar (4 近傍) で歩数を測る。⛔ 自前 BFS を「本番の経路探索」と呼ばない。 */
const PATH_FN = (fx, fy, tx, ty) => {
  try { const p = aStar(fx, fy, tx, ty); return Array.isArray(p) ? p.length : null; }
  catch (e) { return 'THREW:' + String(e && e.message || e); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
/* 敵スロットを「互いに range タイル未満なら同じ群」で連結成分に割る。 */
function clusters(pts, range) {
  const n = pts.length, seen = new Array(n).fill(false), out = [];
  const d = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const st = [i], grp = []; seen[i] = true;
    while (st.length) {
      const c = st.pop(); grp.push(c);
      for (let j = 0; j < n; j++) if (!seen[j] && d(c, j) < range) { seen[j] = true; st.push(j); }
    }
    out.push(grp.map(k => pts[k]));
  }
  return out;
}
function minGroupGap(groups) {
  let best = Infinity;
  for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++)
    for (const p of groups[a]) for (const q of groups[b])
      best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return best;
}
/* 入場地点の**独立式** — 「来た向きの反対側の辺の中点 + NODE_ENTRY_INSET」を
 *   rect の算術だけで組む。⛔ 本番の nodeGateTile を借りない (借りると 1 経路になる)。
 * ⚠ midR / midC は Math.floor なので**行数・列数の偶奇で 1 マスずれる** (#58 の教訓。
 *   砦の大部屋は **20 行 = 偶数**なので、ここが中心より 1 行上に来るのが正しい)。 */
function entryFromRect(rect, via, inset) {
  if (!rect || inset === null || inset === undefined) return null;
  const midR = Math.floor((rect[0] + rect[2]) / 2), midC = Math.floor((rect[1] + rect[3]) / 2);
  if (via === 'right') return [rect[1] + inset, midR];   // 左辺の中点から東へ踏み込む
  if (via === 'left')  return [rect[3] - inset, midR];
  if (via === 'up')    return [midC, rect[2] - inset];
  if (via === 'down')  return [midC, rect[0] + inset];
  return null;
}
const typeCount = (list) => {
  const m = {};
  for (const t of list) m[t] = (m[t] || 0) + 1;
  return m;
};
const sortedJSON = (o) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));

async function runSuite(browser, port, label) {
  const R = [];
  const errs = [];
  const check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, detail: detail || '' });
    console.log('  ' + (cond ? 'PASS' : 'FAIL') + ' (' + id + ') ' + name + (detail ? '  — ' + detail : ''));
  };
  const base = 'http://127.0.0.1:' + port;
  /* ⭐ 期待値は**配信バイト**から組む。⛔ 作業ツリーを fs で読むと --mutate が素通しになる。 */
  const indexText = await new Promise((res, rej) => {
    http.get(base + '/index.html', r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b).toString('utf8'))); }).on('error', rej);
  });
  const cat = parsePaintings(indexText);
  const fort = cat[THEME] || {};
  const n4def = fort.n4big || null, n7def = fort.n7big || null;

  // ── §0 装置 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  const pageA = await bootPage(browser, base + '/index.html?diag=1', THEME, errs);
  const GA = await pageA.evaluate(GRAPH_FN, OTHER_SCENS, THEME);
  const idsA = GA.nodes ? GA.nodes.map(n => n.id) : [];
  const byA = {}; for (const n of (GA.nodes || [])) byA[n.id] = n;

  check('0a', '★装置: RUN.graph.nodes が実際に読めて ' + KEEP_IDS.length + ' 件、entry = "n4" (これが無いと全 assert が空振りで永久緑)',
    !!GA.nodes && GA.nodes.length === KEEP_IDS.length && GA.entry === 'n4' && GA.seamActive === true,
    'active=' + GA.active + ' seam=' + GA.seamActive + ' entry=' + GA.entry +
    ' nodes=' + JSON.stringify(idsA) + (GA.err ? ' err=' + GA.err : ''));
  const fr = GA.fresh || {};
  check('0b', '★装置: ノード数と id を buildScenarioRun("orc-fort") の戻り値から数え、起動時の RUN.graph と一致する (2 経路)',
    !!fr.ids && fr.ids.length === idsA.length && JSON.stringify(fr.ids) === JSON.stringify(idsA) &&
    fr.entry === GA.entry,
    'buildScenarioRun: entry=' + fr.entry + ' ids=' + JSON.stringify(fr.ids) +
    ' / RUN: entry=' + GA.entry + ' ids=' + JSON.stringify(idsA));

  /* (0c) ⚠ 旧構成が実在することを ?fortfold=0 側で先に確かめる。
   *   これが無いと「元から 2 ノードだった」と区別できない。 */
  const pageB = await bootPage(browser, base + '/index.html?diag=1&fortfold=0', THEME, errs);
  const GB = await pageB.evaluate(GRAPH_FN, OTHER_SCENS, THEME);
  const idsB = GB.nodes ? GB.nodes.map(n => n.id) : [];
  const byB = {}; for (const n of (GB.nodes || [])) byB[n.id] = n;
  check('0c', '★装置: 旧構成が ?fortfold=0 側に実在する (8 ノード / entry=n0 / 廃止した 6 部屋が全部そこに居る)',
    idsB.length === 8 && GB.entry === 'n0' && DROP_IDS.every(id => idsB.indexOf(id) >= 0) &&
    KEEP_IDS.every(id => idsB.indexOf(id) >= 0),
    'entry=' + GB.entry + ' nodes=' + JSON.stringify(idsB));

  // ── §1 構造 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §1 構造');
  check('1a', '★ノードは n4 / n7 の 2 つだけ (n0 / n1 / n2 / n3 / n5 / n6 が 1 つも無い)',
    KEEP_IDS.every(id => idsA.indexOf(id) >= 0) && DROP_IDS.every(id => idsA.indexOf(id) < 0) &&
    idsA.length === KEEP_IDS.length,
    '残った=' + JSON.stringify(idsA) + ' 廃止すべきなのに残っている=' +
    JSON.stringify(DROP_IDS.filter(id => idsA.indexOf(id) >= 0)));
  const bosses = (GA.nodes || []).filter(n => n.kind === 'boss').map(n => n.id);
  check('1b', '★entry = "n4" で n4 の kind は "start"、kind:"boss" のノードがちょうど 1 つ (n7)',
    GA.entry === 'n4' && byA.n4 && byA.n4.kind === 'start' &&
    bosses.length === 1 && bosses[0] === 'n7',
    'entry=' + GA.entry + ' n4.kind=' + (byA.n4 && byA.n4.kind) + ' boss=' + JSON.stringify(bosses) +
    ' kinds=' + JSON.stringify((GA.nodes || []).map(n => n.id + ':' + n.kind)));
  const ex4 = (byA.n4 && byA.n4.exits) || [];
  check('1c', '★n4 の exits が right→n7 の 1 本だけ / n7 は行き止まり',
    ex4.length === 1 && ex4[0].to === 'n7' && ex4[0].dir === 'right' &&
    !!byA.n7 && byA.n7.exits.length === 0,
    'n4=' + JSON.stringify(ex4.map(e => e.to + ':' + e.dir + '@' + e.at.join(','))) +
    ' n7=' + JSON.stringify((byA.n7 || {}).exits));
  check('1c2', '★本番の exitsWithReturn (= 自動進行が opts[0] を取る並び) でも先頭が n7',
    Array.isArray(GA.opts) && GA.opts.length > 0 && GA.opts[0].to === 'n7' && GA.curNode === 'n4',
    '現在ノード=' + GA.curNode + ' opts=' + JSON.stringify(GA.opts));
  const graphWarn = errs.filter(s => /^(WARNING|ERROR)\b/.test(s) && s.indexOf('[graph]') >= 0);
  check('1d', '★DFMapDef.lintRun が error 0 / warning 0 で、console の warning/error に [graph] が 1 件も無い',
    !!GA.lint && GA.lint.e.length === 0 && GA.lint.w.length === 0 && graphWarn.length === 0,
    'lint=' + JSON.stringify(GA.lint) + ' console=' + JSON.stringify(graphWarn.slice(0, 3)));

  // ── §2 敵 ──────────────────────────────────────────────────────────────────
  console.log('\n[drv] §2 敵 (⭐ 期待値は ?fortfold=0 の腕からその場で導く)');
  const oldSum = [];
  for (const id of MERGED_FROM) for (const s of ((byB[id] || {}).slots || [])) oldSum.push(s[2]);
  const newList = ((byA.n4 || {}).slots || []).map(s => s[2]);
  check('2a', '★★n4 の敵の体数と種類が「?fortfold=0 の n1+n2+n3+n4 の合計」と一致する (⛔ 増減させていない・数字を焼いていない)',
    newList.length > 0 && oldSum.length === newList.length &&
    sortedJSON(typeCount(oldSum)) === sortedJSON(typeCount(newList)),
    '旧 n1+n2+n3+n4 = ' + oldSum.length + ' 体 ' + JSON.stringify(typeCount(oldSum)) +
    ' / 畳んだ n4 = ' + newList.length + ' 体 ' + JSON.stringify(typeCount(newList)));
  /* (2b) ⭐ 「実際に湧いた敵」でも同じ数になることを別経路で見る (spec を読むだけにしない)。 */
  const S4 = await pageA.evaluate(SNAP_FN, 'n4', 'right');
  const liveN4 = (S4.enemies || []).filter(e => e.alive).map(e => e.type);
  check('2b', '★盤面に実際に湧いた n4 の敵も同じ顔ぶれ (spec の読み取りだけで満足しない 2 経路目)',
    liveN4.length === newList.length &&
    sortedJSON(typeCount(liveN4)) === sortedJSON(typeCount(newList)),
    '湧いた=' + liveN4.length + ' 体 ' + JSON.stringify(typeCount(liveN4)) +
    ' / spec=' + newList.length + ' 体');
  /* (2c) ⚠ 言い直し — 「完全一致」は原理的に不可能 (rect も start も絵も変わる)。
   *   不変なのは**顔ぶれ**。 */
  const escA = ((byA.n7 || {}).slots || []).map(s => s[2]);
  const escB = ((byB.n7 || {}).slots || []).map(s => s[2]);
  check('2c', '★ボスノードの顔ぶれが両腕で一致 (護衛 2 + garrock 単騎。⛔ 座標は rect が変わる以上動くので測らない)',
    escA.length === 2 && escB.length === 2 &&
    sortedJSON(typeCount(escA)) === sortedJSON(typeCount(escB)) &&
    !!byA.n7 && !!byA.n7.boss && byA.n7.boss[2] === 'garrock' &&
    !!byB.n7 && !!byB.n7.boss && byB.n7.boss[2] === 'garrock',
    '畳んだ n7 護衛=' + JSON.stringify(escA) + ' boss=' + JSON.stringify((byA.n7 || {}).boss) +
    ' / 旧 n7 護衛=' + JSON.stringify(escB) + ' boss=' + JSON.stringify((byB.n7 || {}).boss));
  /* (2d) ⭐ 群の分かれ方。⛔ 12.5 タイルを写経しない。DETECTION_RANGE / TILE_SIZE を割る。 */
  const rangeTiles = (GA.detect && GA.tile) ? (GA.detect / GA.tile) : null;
  const foePts = ((byA.n4 || {}).slots || []).map(s => [s[0], s[1]]);
  const grps = rangeTiles ? clusters(foePts, rangeTiles) : [];
  const gap = grps.length >= 2 ? minGroupGap(grps) : Infinity;
  check('2d', '★敵が 2 群に割れており、群間が DETECTION_RANGE (' + (rangeTiles || '?') + ' タイル) より離れている (= 11 体が一度に襲ってこない)',
    !!rangeTiles && foePts.length > 0 && grps.length === 2 && gap > rangeTiles,
    '索敵=' + GA.detect + 'px / タイル=' + GA.tile + 'px = ' + rangeTiles + ' タイル / 群=' +
    JSON.stringify(grps.map(g => g.length)) + ' 群間=' + (gap === Infinity ? '-' : gap.toFixed(2)) + ' タイル');

  // ── §3 守護者 ──────────────────────────────────────────────────────────────
  console.log('\n[drv] §3 守護者 (候補④ = 畳んだ構成に載せない)');
  const guardIn = (nodes) => {
    const out = [];
    for (const n of (nodes || [])) for (const s of (n.slots || []))
      if (GUARDIAN_TYPES.indexOf(s[2]) >= 0) out.push(n.id + ':' + s[2]);
    return out;
  };
  const gA = guardIn(GA.nodes), gB = guardIn(GB.nodes);
  check('3a', '★畳んだ構成に守護者 (' + GUARDIAN_TYPES.join(' / ') + ') が 1 体も居ない',
    gA.length === 0, '畳んだ側=' + JSON.stringify(gA));
  check('3b', '★?fortfold=0 の腕には 5 体そのまま残っている (= 消したのではなく畳んだ構成に載せていないだけ)',
    gB.length === 5, '旧側=' + JSON.stringify(gB));

  // ── §4 罠と宝箱 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §4 罠と玄室の宝箱 (森 #16 の失敗の再現防止)');
  const S4old = await pageB.evaluate(SNAP_FN, 'n4', 'right');
  check('4a', '★罠と玄室の宝箱が n4 で湧く (兼務宣言が効いている。⛔ 忘れると無言でゼロ) — ?fortfold=0 側の n4 では 0 / 0',
    S4.traps > 0 && S4.chests > 0 && S4old.traps === 0 && S4old.chests === 0,
    '畳んだ n4: 罠=' + S4.traps + ' 宝箱=' + S4.chests +
    ' / ?fortfold=0 の n4: 罠=' + S4old.traps + ' 宝箱=' + S4old.chests +
    ' / 台帳=' + JSON.stringify(GA.kindsTable));
  check('4b', '★森の兼務宣言 (bandits-forest の n7) と沼の宣言 (lizard-swamp の n4) が 1 ビットも動いていない',
    !!GA.kindsTable &&
    JSON.stringify(GA.kindsTable['bandits-forest']) === JSON.stringify({ n7: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['lizard-swamp']) === JSON.stringify({ n4: ['search', 'loot'] }),
    JSON.stringify(GA.kindsTable));

  // ── §5 幾何 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §5 幾何 (本番の nodeGateTile / isTileWall / aStar)');
  const S7 = await pageA.evaluate(SNAP_FN, 'n7', 'right');
  const rectEq = (r, b) => !!r && !!b && r.length === 4 && JSON.stringify(r) === JSON.stringify(b);
  check('5a', '★n4 / n7 の rect が n4big / n7big の tileBounds と同値 (paintingAspectFits が縦横比の完全一致を要求する)',
    !!n4def && !!n7def && rectEq((byA.n4 || {}).rect, n4def.bounds) &&
    rectEq((byA.n7 || {}).rect, n7def.bounds),
    'n4 rect=' + JSON.stringify((byA.n4 || {}).rect) + ' tileBounds=' + JSON.stringify(n4def && n4def.bounds) +
    ' / n7 rect=' + JSON.stringify((byA.n7 || {}).rect) + ' tileBounds=' + JSON.stringify(n7def && n7def.bounds));
  const hero4 = S4.hero || { tx: -1, ty: -1 }, hero7 = S7.hero || { tx: -1, ty: -1 };
  const ind4 = entryFromRect(S4.rect, 'right', GA.inset), ind7 = entryFromRect(S7.rect, 'right', GA.inset);
  check('5b', '★入場地点が 2 経路で一致する (実際にパーティが立ったタイルと、rect から組んだ独立式「左辺の中点 + NODE_ENTRY_INSET」) — n4 / n7 とも',
    !!ind4 && hero4.tx === ind4[0] && hero4.ty === ind4[1] &&
    !!S4.start && S4.start.tx === hero4.tx && S4.start.ty === hero4.ty &&
    !!ind7 && hero7.tx === ind7[0] && hero7.ty === ind7[1] &&
    !!S7.start && S7.start.tx === hero7.tx && S7.start.ty === hero7.ty,
    'n4 実際=' + JSON.stringify(hero4) + ' 独立式=' + JSON.stringify(ind4) + ' start=' + JSON.stringify(S4.start) +
    ' / n7 実際=' + JSON.stringify(hero7) + ' 独立式=' + JSON.stringify(ind7) + ' start=' + JSON.stringify(S7.start) +
    ' / inset=' + GA.inset);
  /* (5c) ⚠⚠⚠ isTileWall だけでは**永久緑**になる (敵スポーンは applyPaintingBlocking の
   *   門番 skipSpawn が必ず素通しさせる)。効くのは「マスクが '.' か」と
   *   「マスクが '#' なのに歩けるタイルが 0 か (= 絵に穴が開いていない)」の 2 本。 */
  const maskOf = (def) => (tx, ty) => {
    const b = def && def.bounds;
    return (b && def.rows && ty >= b[0] && ty <= b[2] && tx >= b[1] && tx <= b[3] && def.rows[ty - b[0]])
      ? def.rows[ty - b[0]][tx - b[1]] : null;
  };
  const m4 = maskOf(n4def), m7 = maskOf(n7def);
  const slots4 = ((byA.n4 || {}).slots || []).slice();
  const slots7 = ((byA.n7 || {}).slots || []).slice();
  if (byA.n7 && byA.n7.boss) slots7.push(byA.n7.boss);
  const bad4 = slots4.filter(s => m4(s[0], s[1]) !== '.');
  const bad7 = slots7.filter(s => m7(s[0], s[1]) !== '.');
  const holesOf = (def, S) => {
    const out = [], b = def && def.bounds;
    if (b && def.rows && S.walls) {
      for (let r = 0; r < def.rows.length; r++) for (let c = 0; c < def.rows[r].length; c++) {
        if (def.rows[r][c] !== '#') continue;
        if (S.walls[r] && S.walls[r][c] === '.') out.push([b[1] + c, b[0] + r]);
      }
    }
    return out;
  };
  const holes4 = holesOf(n4def, S4), holes7 = holesOf(n7def, S7);
  check('5c', '★敵/ボスのスロットが 1 つもマスクの "#" の上に無く、マスクの "#" が 1 つも歩けるようになっていない (絵に穴が開かない) — n4 / n7 とも',
    !!n4def && Array.isArray(n4def.rows) && n4def.rows.length === (n4def.bounds[2] - n4def.bounds[0] + 1) &&
    !!n7def && Array.isArray(n7def.rows) && n7def.rows.length === (n7def.bounds[2] - n7def.bounds[0] + 1) &&
    slots4.length > 0 && slots7.length > 0 &&
    bad4.length === 0 && bad7.length === 0 && holes4.length === 0 && holes7.length === 0,
    'n4 マスク=' + (n4def && n4def.rows ? n4def.rows.length + '行' : 'なし') +
    ' ⛔"#"の上=' + JSON.stringify(bad4) + ' ⛔絵の穴=' + JSON.stringify(holes4.slice(0, 6)) +
    ' / n7 ⛔"#"の上=' + JSON.stringify(bad7) + ' ⛔絵の穴=' + JSON.stringify(holes7.slice(0, 6)));
  /* (5d) ★本番の aStar (4 近傍) で、入場地点から全員へ到達できるか。
   * ⚠⚠⚠ **n4 を撮り直してから測る。** SNAP_FN は resetNodeState / buildNode を呼ぶので
   *   **盤面のグローバル状態を書き換える**。直前に S7 を撮っているため、そのまま aStar を
   *   呼ぶと **n7 の盤面**に対して探索してしまう (2026-09-09 に実際に踏んだ:
   *   n4 の東群 3 体が「到達不能」と出たが、その 3 タイルは n7 側の玉座の壇 = '#' だった)。
   * ⭐ 一般形 = **盤面を書き換える関数の戻り値 (スナップショット) は安全だが、
   *   その後の「生きた問い合わせ」は必ず撮り直してから行う**。 */
  await pageA.evaluate(SNAP_FN, 'n4', 'right');
  const unreachable = [];
  for (const s of slots4) {
    const n = await pageA.evaluate(PATH_FN, hero4.tx, hero4.ty, s[0], s[1]);
    if (!(typeof n === 'number' && n > 0)) unreachable.push([s[0], s[1], s[2], n]);
  }
  check('5d', '★n4 の入場地点から敵全員へ、本番の aStar (4 近傍) で到達できる (孤立ゼロ)',
    slots4.length > 0 && unreachable.length === 0,
    '入場=' + JSON.stringify(hero4) + ' ⛔到達不能=' + JSON.stringify(unreachable));
  /* (5d2) ⭐⭐⭐ **孤立した床を作らない。** 罠・玄室の宝箱・敵の落とし物は「床タイル」へ
   *   無差別に湧くので、入場地点から届かない床が 1 マスでもあると
   *   findNearestDrop() が永久に片付かず isNodeSettled() が false のまま = クリア不能に
   *   なりうる (§6 の休眠敵とは別経路の同じ詰み)。
   * ⚠ 例外は sealRing が上下の辺の中点に残す縁の 1 マス (出口でない向きのゲート)。
   *   四方を塞がれた**孤立点**なので実害が無い (森 / 沼と同じ既知の性質)。 */
  const floorTiles = [];
  if (S4.rect && S4.walls) {
    for (let r = 0; r < S4.walls.length; r++) for (let c = 0; c < S4.walls[r].length; c++)
      if (S4.walls[r][c] === '.') floorTiles.push([S4.rect[1] + c, S4.rect[0] + r]);
  }
  const ringMid = new Set();
  if (S4.rect) {
    const midC = Math.floor((S4.rect[1] + S4.rect[3]) / 2);
    ringMid.add(midC + ',' + S4.rect[0]); ringMid.add(midC + ',' + S4.rect[2]);
  }
  const orphan = [];
  for (const t of floorTiles) {
    if (t[0] === hero4.tx && t[1] === hero4.ty) continue;
    if (ringMid.has(t[0] + ',' + t[1])) continue;
    const n = await pageA.evaluate(PATH_FN, t[0], t[1], hero4.tx, hero4.ty);
    if (!(typeof n === 'number' && n > 0)) orphan.push(t);
  }
  check('5d2', '★★★n4 の歩ける床が入場地点から全部ひとつながり (孤立した床に宝箱や落とし物が湧くと isNodeSettled が永久 false になる)',
    floorTiles.length > 0 && orphan.length === 0,
    '歩けるマス=' + floorTiles.length + ' / ⛔孤立=' + orphan.length +
    (orphan.length ? ' ' + JSON.stringify(orphan.slice(0, 8)) : '') +
    ' (縁の中点 ' + JSON.stringify([...ringMid]) + ' は除外)');
  const dists = foePts.map(p => Math.hypot(p[0] - hero4.tx, p[1] - hero4.ty));
  const minD = dists.length ? Math.min.apply(null, dists) : -1;
  check('5e', '★入場地点から最寄りの敵まで 7 タイル以上 (入場ナレの最中に乱戦が始まらない)',
    minD >= 7, '入場=' + JSON.stringify(hero4) + ' 最寄り=' + minD.toFixed(2) + ' タイル (' +
    Math.round(minD * (GA.tile || 96)) + 'px)');
  const gRight = (S4.gates && S4.gates.right) || null;
  const atRight = ex4.find(e => e.to === 'n7');
  check('5f', '★★n4 → n7 の出口タイルが nodeGateTile(md,"right") と exits[].at で一致する (2 経路。食い違うと開かない扉が生まれる)',
    !!gRight && !!atRight && atRight.at[0] === gRight[0] && atRight.at[1] === gRight[1],
    'nodeGateTile(right)=' + JSON.stringify(gRight) + ' exits[].at=' + JSON.stringify(atRight ? atRight.at : null));
  check('5g', '★n4 / n7 の density が 0 (⛔ `|| 1` で書くと既に描き込まれた絵の上へ scenery が湧く) — ?fortfold=0 側は 1',
    (byA.n4 || {}).density === 0 && (byA.n7 || {}).density === 0 &&
    (byB.n4 || {}).density === 1 && (byB.n7 || {}).density === 1,
    '畳んだ n4=' + (byA.n4 || {}).density + ' n7=' + (byA.n7 || {}).density +
    ' / 旧 n4=' + (byB.n4 || {}).density + ' n7=' + (byB.n7 || {}).density);

  // ── §6 詰み防止 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §6 詰み防止 (⭐⭐⭐ 休眠する敵を本道へ置かない — 依頼書 §2-2 の番人)');
  /* ⭐ 「道中ノードに」ではなく**畳んだグラフの全ノード**を見る。守護者を戻す誤りは
   *   「畳んだ表へ n6 を足す」形で入るので、n4 だけを見ていると素通りする。 */
  const stuck = [];
  for (const id of idsA) {
    const S = await pageA.evaluate(SNAP_FN, id, 'right');
    for (const e of (S.enemies || [])) if (e.alive && e.inactive && !e.passiveNpc) stuck.push(id + ':' + e.type);
  }
  check('6a', '★★★畳んだグラフのどのノードにも「生きていて inactive で passiveNpc でない」敵が 1 体も居ない (居ると isNodeSettled が永久 false = クリア不能)',
    idsA.length > 0 && stuck.length === 0, '⛔該当=' + JSON.stringify(stuck));
  /* (6b) ⭐ 番人が効いていることの対照 = ?fortfold=0 の n6 には**実際に居る**。
   *   これが無いと (6a) は「そもそもそんな敵が居ない世界」でも緑になる。 */
  const S6old = await pageB.evaluate(SNAP_FN, 'n6', 'right');
  const dormantOld = (S6old.enemies || []).filter(e => e.alive && e.inactive && !e.passiveNpc);
  check('6b', '★装置: ?fortfold=0 の n6 には休眠したままの守護者が実在する (= (6a) が「居ない世界」で空振りしていない)',
    dormantOld.length === 5,
    '旧 n6 の休眠敵=' + dormantOld.length + ' 体 ' + JSON.stringify(dormantOld.map(e => e.type)));

  // ── §7 撤退 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §7 撤退スイッチ ?fortfold=0');
  const rc4B = (byB.n4 || {}).rect || null, rc7B = (byB.n7 || {}).rect || null;
  const wh = (r) => r ? [r[3] - r[1] + 1, r[2] - r[0] + 1] : null;
  check('7a', '★?fortfold=0 で 8 ノード / entry=n0 へ戻り、n4 は 7x6 / n7 は 9x6 の小部屋に戻る',
    idsB.length === 8 && GB.entry === 'n0' &&
    JSON.stringify(wh(rc4B)) === JSON.stringify([7, 6]) &&
    JSON.stringify(wh(rc7B)) === JSON.stringify([9, 6]),
    'nodes=' + idsB.length + ' entry=' + GB.entry +
    ' n4 rect=' + JSON.stringify(rc4B) + '(' + (wh(rc4B) || []).join('x') + ')' +
    ' n7 rect=' + JSON.stringify(rc7B) + '(' + (wh(rc7B) || []).join('x') + ')');
  check('7b', '★?fortfold=0 では旧絵 (room_orc-fort_n4.jpg / _n7.jpg) に戻る',
    (byB.n4 || {}).paint === 'n4' && (byB.n7 || {}).paint === 'n7' &&
    (byA.n4 || {}).paint === 'n4big' && (byA.n7 || {}).paint === 'n7big',
    '旧 n4=' + (byB.n4 || {}).paint + ' n7=' + (byB.n7 || {}).paint +
    ' / 畳んだ n4=' + (byA.n4 || {}).paint + ' n7=' + (byA.n7 || {}).paint);
  const st4 = await httpStatus(port, '/assets/room_orc-fort_n4.jpg');
  const st7 = await httpStatus(port, '/assets/room_orc-fort_n7.jpg');
  const sb4 = await httpStatus(port, '/assets/room_orc-fort_n4_map.jpg');
  const sb7 = await httpStatus(port, '/assets/room_orc-fort_n7_map.jpg');
  check('7c', '★旧絵 2 枚も新しい大部屋 2 枚も 200 で引ける (撤退先も行き先も実在する)',
    st4 === 200 && st7 === 200 && sb4 === 200 && sb7 === 200,
    '旧 n4=' + st4 + ' n7=' + st7 + ' / 新 n4big=' + sb4 + ' n7big=' + sb7);

  // ── §8 恒等 (非退行) ───────────────────────────────────────────────────────
  console.log('\n[drv] §8 恒等 (他 5 シナリオを 1 ビットも触っていないか)');
  const oA = GA.others || {}, oB = GB.others || {};
  const diffScen = OTHER_SCENS.filter(s => oA[s] !== oB[s] || !oA[s]);
  const distinct = new Set(OTHER_SCENS.map(s => oA[s])).size;
  check('8a', '★他 5 シナリオのグラフが ?fortfold=0 の腕と 1 ビットも変わらない (⭐ 5 本が相互に異なる = 同じ物を 5 回測っていない)',
    diffScen.length === 0 && distinct === OTHER_SCENS.length,
    '差分=' + JSON.stringify(diffScen) + ' 相互に異なる=' + distinct + '/' + OTHER_SCENS.length +
    ' hash=' + JSON.stringify(oA));

  await pageA.close(); await pageB.close();
  return { results: R, errs: errs };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_fortfold_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  const servers = [];
  let exitCode = 0;
  try {
    if (flag('negative')) {
      const srv0 = await startServer(PORT, null); servers.push(srv0);
      console.log('\n════ 素の 1 本 (基準) ════');
      const baseRun = await runSuite(browser, PORT, '(素)');
      const baseFail = baseRun.results.filter(r => !r.ok).map(r => r.id);
      if (baseFail.length) {
        console.log('\n⛔ 素の実行で FAIL がある (' + baseFail.join(',') + ') — 先にそれを直すこと');
        exitCode = 1;
      }
      const only = (arg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
      const order = only.length ? MUT_ORDER.filter(k => only.indexOf(k) >= 0) : MUT_ORDER;
      const report = [];
      for (let i = 0; i < order.length; i++) {
        const key = order[i], port = PORT + 1 + MUT_ORDER.indexOf(key);
        const srv = await startServer(port, key); servers.push(srv);
        console.log('\n════ 変異 ' + key + ' (port ' + port + ') ════');
        let failed = [];
        try {
          const run = await runSuite(browser, port, '[変異 ' + key + ']');
          failed = run.results.filter(r => !r.ok).map(r => r.id);
        } catch (e) {
          /* ⭐ 変異でドライバ自身が落ちるのも「検出できた」= 期待どおり。理由を必ず出す。 */
          failed = ['THREW'];
          console.log('  (変異でドライバが例外: ' + String(e && e.message || e) + ')');
        }
        const want = MUT_EXPECT[key] || [];
        const hit = want.filter(id => failed.indexOf(id) >= 0);
        /* ⚠⚠⚠ 「何かが赤くなった」で満足しない。**期待した節が赤くなったか**まで見る
         *   (#53 の MUT_EXPECT。素は緑のまま変異だけ空振り、という型をここで捕まえる)。 */
        const ok = hit.length > 0 || failed.indexOf('THREW') >= 0;
        report.push({ key: key, want: want, failed: failed, hit: hit, ok: ok });
        console.log('  ⇒ 変異 ' + key + ': 期待 ' + JSON.stringify(want) + ' / 実際に赤 ' + JSON.stringify(failed) +
                    ' / 命中 ' + JSON.stringify(hit) + ' → ' + (ok ? 'OK (検出できた)' : '⛔ 空振り'));
        if (!ok) exitCode = 1;
      }
      console.log('\n════════════════════════════════════════');
      console.log('  負のコントロール ' + report.filter(r => r.ok).length + ' / ' + report.length + ' が検出成功');
      for (const r of report) if (!r.ok) console.log('   ⛔ ' + r.key + ' が空振り (期待 ' + r.want.join(',') + ')');
      console.log('════════════════════════════════════════');
    } else {
      const srv = await startServer(PORT, MUTATE); servers.push(srv);
      const run = await runSuite(browser, PORT, MUTATE ? '[変異 ' + MUTATE + ']' : '');
      const okN = run.results.filter(r => r.ok).length, ngN = run.results.length - okN;
      console.log('\n[drv] 例外 / console.error·warning = ' + run.errs.length +
                  (run.errs.length ? ' ' + JSON.stringify(run.errs.slice(0, 4)) : ''));
      console.log('\n════════════════════════════════════════');
      console.log('  PASS ' + okN + ' / FAIL ' + ngN + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
      if (ngN) {
        console.log('  --- FAIL 一覧 ---');
        for (const r of run.results) if (!r.ok) console.log('   ・(' + r.id + ') ' + r.name + (r.detail ? '  — ' + r.detail : ''));
      }
      console.log('════════════════════════════════════════');
      if (ngN && !MUTATE) exitCode = 1;
    }
  } catch (e) {
    console.error('[drv] 例外: ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    await browser.close().catch(() => {});
    servers.forEach(s => { try { s.close(); } catch (e) {} });
  }
  process.exit(exitCode);
})();
