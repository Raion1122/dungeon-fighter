#!/usr/bin/env node
/*
 * verify_swamp_fold.js — 実装依頼書 #62「沼地を卓上マップ 3 枚へ畳む
 *   (旧タイプ小部屋 n0/n1/n2/n3/n5 の廃止 → n4 参道 / n6 祭壇 / n7 族長の巣 の 3 ノード)」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測り方の方針
 *   ⭐ **期待値は「その場で導く」**。移設した敵の顔ぶれは `?swampfold=0` の n1+n2+n3+n4 の
 *     合計から、ノード数は `buildScenarioRun("lizard-swamp")` の戻り値から数える。
 *     ⛔ 体数・座標・ノード数を数字で焼き込まない (焼くと仕様変更で黙って腐る)。
 *   ⭐ 幾何は**本番の関数だけ**を通す (nodeGateTile / isTileWall / aStar / openDoorAt /
 *     NODE_ENTRY_INSET / DETECTION_RANGE / TILE_SIZE)。マスクは**配信した index.html を
 *     自前でパース**して組む (実装の paintingBlockedTilesFor は 1 行も借りない)。
 *
 * ■ ⛔ 依頼書 §8 のうち「そのままでは測れない」節は言い直してある (根拠は §12-0 の実測)
 *   (2d)(2e) … 「出口ゲートまで aStar 到達可能」は**素では必ず false**。ゲートには
 *              閉扉 (gate-up) / 施錠扉 (gate-right) が立ち isTileWall=true になる。
 *              ⇒ 「**ゲートの 1 つ内側**へ到達可能」+「**扉を開けてから**ゲートへ到達可能」へ。
 *   (1d)    … 「console に [graph] 警告が出ない」を**語**で拾うと必ず赤くなる。
 *              `[graph] 分岐グラフで起動します` は console.log の**成功行**。
 *              ⇒ `m.type()` で warning / error に絞る。
 *   (3a)    … 「3 群」は測らない。n4big では**原理的に 3 群を作れない** (使える span 19 タイル <
 *              12.5 タイル間隔の 3 群に要る 25 タイル)。⇒ 「群が 2 つで、群間が
 *              DETECTION_RANGE より離れている」へ ((3f))。
 *   (5b)    … 「4 本のスイッチは独立」は成立しない。派生 SWAMP_FOLDED は
 *              `!SWAMP_FOLD_OFF && !SWAMP_MAP_OFF` なので **?swampmap=0 でも 8 ノードへ戻る**。
 *              ⇒ (5b) 素の大部屋 3 枚 / (5c) ?swampmap=0 は連動 / (5d) ?swampcrypt=0 と
 *                 ?swamplair=0 は畳みを外さない、の 3 本へ割った。
 *
 * ■ 節
 *   §0 装置 (母集団の確認)  §1 骨格  §2 幾何  §3 中身  §4 恒等 (非退行)  §5 撤退
 *
 * ── 負のコントロール (--negative。配信をメモリ上で差し替える) ────────────────────
 *   nofold / nogate / nokinds / dropfoes / spawnongate / entryn0 / mapoff
 *   ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと必ず空振り)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと差し替わったか確認できない)。
 *   ⛔ 次の 5 行は**アンカーに使わない** — 既存ドライバが逐語で握っている:
 *        n4big: { src: "assets/room_lizard-swamp_n4_map.jpg",          (novice の oldn4)
 *        slots: [[20, 12, "lizardRaider"], [21, 13, "lizardWarrior"],  (novice の spawnonwall)
 *        rect: [3, 10, 23, 39], paint: "n4big", density: 0,            (novice の density1)
 *        ? { "bandits-forest": { n7: ["search", "loot"] } }            (grid_s2 の nosearchkind)
 *        sealRing: true, …                                             (index.html に 3 箇所)
 *
 * 使い方:
 *   node tools/verify_swamp_fold.js               # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_swamp_fold.js --negative    # 変異 7 本 (port 10182〜10188) が赤くなるか
 *   node tools/verify_swamp_fold.js --negative --only nogate
 *   node tools/verify_swamp_fold.js --mutate nofold --port 10182
 * ⚠ base ポートは **10181**。10161 は #60 / 10141 は #59 / 10121 は #58 が占有。
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
const PORT = parseInt(arg('port', '10181'), 10);
const THEME = 'lizard-swamp';
/* 恒等 (4c) の母集団。⚠ lizard-swamp は含めない (変えたのはそこだから)。 */
const OTHER_SCENS = ['goblin-mine', 'bandits-forest', 'orc-fort', 'undead-temple', 'dragon-lair'];
/* 畳んだ後に残るノード / 消えるノード。⚠ これは**契約**なのでドライバ側に書き下す
 *   (実装から読むと実装の誤りを一緒に信じてしまう)。 */
const KEEP_IDS = ['n4', 'n6', 'n7'];
const DROP_IDS = ['n0', 'n1', 'n2', 'n3', 'n5'];

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* M1 畳みを丸ごと無効化する = 8 ノードのまま。§1 全般が赤くなるべき。 */
  nofold: [['    const SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF;',
            '    const SWAMP_FOLDED = false;   /* ★変異nofold */']],
  /* M2 ⭐⭐⭐ n4big の gates.up を消す = 出口が辺の中点 (24,3) へ戻る罠の再現。
   *   ⚠ 行末で開いたブロックコメントは次の行以降で閉じるので、置換先も同じ形で開けておく。 */
  nogate: [['             gates: { up: [8, 0] },   /* ★[#62] 北の口 = 祠へ登る石段の東列 (絵ローカル col 8 / 行 0)',
            '             /* ★変異nogate — gates.up を落として辺の中点へ戻す (絵ローカル col 8 / 行 0)']],
  /* M3 ⭐⭐⭐ 兼務宣言から沼の行を消す = 罠も玄室の宝箱も無言でゼロになる罠の再現 (森 #16)。 */
  nokinds: [['      if (SWAMP_FOLDED) t["lizard-swamp"] = { n4: ["search", "loot"] };',
             '      /* ★変異nokinds — 沼の兼務宣言を落とす */']],
  /* M4 移設した 7 体のうち 1 体 (34,13 lizardWarrior) を落とす = 体数が合わなくなる。 */
  dropfoes: [['           [34, 13, "lizardWarrior"], [36, 11, "lizardHunter"],',
              '           [36, 11, "lizardHunter"],   /* ★変異dropfoes = 1 体落とす */']],
  /* M5 ⭐ 敵 1 体を n7 行きの出口ゲート (39,13) へ置く = 閉じた扉に埋まって倒せない
   *   (graph-spawn-on-gate の再発)。 */
  spawnongate: [['           [36, 13, "lizardWarrior"], [37, 12, "lizardHunter"]]',
                 '           [39, 13, "lizardWarrior"], [37, 12, "lizardHunter"]]   /* ★変異spawnongate */']],
  /* M6 entry を "n0" のままにする = 畳んだ 3 ノードに存在しない id を指す。 */
  entryn0: [['        entry: "n4",',
             '        entry: "n0",   /* ★変異entryn0 */']],
  /* M7 ⭐ 派生から SWAMP_MAP_OFF を落とす = ?swampmap=0 のとき「畳みだけ残る」中間状態。
   *   ⚠ nofold と**同じ行**をアンカーにしているが、変異ごとに原本を読み直すので衝突しない。 */
  mapoff: [['    const SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF;',
            '    const SWAMP_FOLDED = !SWAMP_FOLD_OFF;   /* ★変異mapoff — swampmap を見ない */']],
};
/* 変異 → 赤くなるべき assert id。
 * ⚠⚠⚠ 机上で書かない。1 本ずつ実走して**実際に赤くなった id** を書く (#57 の教訓)。
 * ── 2026-09-08 の実走で赤くなった集合 (爆風の広さも記録しておく) ───────────────
 *   nofold      … 0a 1a 1b 1c 1c2 2a 2b 3a 3d 5a 5d          (11 本)
 *   nogate      … 2a 2e                                       (2 本 = 狭く効いている)
 *   nokinds     … 3d                                          (1 本 ⭐ 最も鋭い)
 *   dropfoes    … 3a 5a                                       (2 本)
 *   spawnongate … lint が error を出して RUN が null へ落ちるので §0〜§5 の 25 本
 *   entryn0     … 同上 25 本 (graph-* の error で RUN=null → 単一マップへ退避)
 *   mapoff      … 5c                                          (1 本 ⭐ 最も鋭い)
 * ⭐ nogate が 2a/2e だけ・nokinds が 3d だけ・mapoff が 5c だけ = **節が分離している**証拠。 */
const MUT_EXPECT = {
  nofold:      ['0a', '1a', '1b', '1c'],
  nogate:      ['2a', '2e'],
  nokinds:     ['3d'],
  dropfoes:    ['3a', '5a'],
  spawnongate: ['1d', '3c'],
  entryn0:     ['0a', '1a'],
  mapoff:      ['5c'],
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
   *   2 本目 (mapoff) が「注入点 0 箇所」= 偽のアンカー腐敗 exit 3 になる (#56 の教訓)。 */
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

// ══════════════════════════════════════════════════════════════════════════════
// ★ドライバ側の独立実装 — 配信されたテキストから n4big のマスクを組む
//   ⚠⚠ df-mapdef.js の paintingBlockedTilesFor も index.html の関数も 1 行も借りない。
//   (パーサの作りは verify_swamp_lair.js / verify_swamp_novice.js と同型。)
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
/* -> { theme: { key: { bounds, node, rows, seal, outdoor, src, gates } } } */
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
      const gm = /gates\s*:\s*\{([^}]*)\}/.exec(eb);
      list[e[1]] = {
        bounds: bm.slice(1, 5).map(Number),
        node: /node\s*:\s*true/.test(eb),
        seal: /sealRing\s*:\s*true/.test(eb),
        outdoor: /outdoor\s*:\s*true/.test(eb),
        src: sm ? sm[1] : null,
        gates: gm ? gm[1].trim() : null,
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
async function bootPage(browser, url, scen, errs, questFlags) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  /* ⚠⚠⚠ (1d) で使う。**必ず m.type() で絞る** —
   *   `[graph] 分岐グラフで起動します` は console.log の**成功行**なので、
   *   語で拾うと素で必ず赤くなる (項目 2 の使い捨てドライバが実際に踏んだ)。 */
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') errs.push(t.toUpperCase() + ' ' + m.text());
  });
  page.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()); });
  await page.evaluateOnNewDocument((sid, qf) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    /* ⭐ 噂フラグを**掴んだ**標本にする。掴んでいないとハイドラは 0 体が正常なので
     *   (4b) の対照が消える。⛔ ?intel=1 は __dfDevCheat のゲートを踏むので使わない。 */
    if (qf !== null) { try { sessionStorage.setItem('dragonfighters.questFlags', qf); } catch (e) {} }
  }, scen, questFlags === undefined ? null : questFlags);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* グラフの姿。⭐ RUN (起動時に組まれた物) と buildScenarioRun (その場で呼び直した物) の
 *   **2 経路**を返すので、ドライバはノード数も id も写経しなくてよい。 */
const GRAPH_FN = (others) => {
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
      const g2 = buildScenarioRun('lizard-swamp');
      out.fresh = g2 ? { entry: g2.entry, ids: g2.nodes.map(n => n.id),
                         kinds: g2.nodes.map(n => n.kind),
                         exits: g2.nodes.map(n => n.id + '=' +
                           n.exits.map(e => e.to + ':' + e.dir).join(',')) } : null;
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
  /* ★入場地点は「**パーティが実際に立っているタイル**」を返す。
   *   ⚠⚠ START_TX / START_TY を使ってはいけない — あれは buildNode が書いた
   *     **mapDef.start** で、placeNodeParty("up") のように別の縁から入ったときは動かない
   *     (実測: n6 を up で入っても START は (12,13) のまま = 左辺の入場口)。
   *   ⛔ (12,13) / (12,12) / (26,22) を写経しない。突き合わせる 2 経路目
   *     (rect からの独立式) は**ドライバ側**で組む。 */
  return {
    node: nodeId, rect: rect, kind: RUN.byId[nodeId].kind,
    start: md.start ? { tx: md.start.tx, ty: md.start.ty } : null,
    mapStart: { tx: START_TX, ty: START_TY },
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
/* ★本番の openDoorAt で扉を開けてから、同じタイルの isTileWall を測り直す。 */
const OPEN_FN = (tx, ty) => {
  const before = isTileWall(tx, ty);
  let opened = 0;
  try { opened = openDoorAt(tx, ty); } catch (e) {}
  return { before: before, opened: opened, after: isTileWall(tx, ty) };
};

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
/* 敵スロットを「互いに range タイル未満なら同じ群」で連結成分に割る。
 * ⭐ 「3 群」ではなく**群の数と群間**を測るための道具 (依頼書 §8 (3a) の言い直し)。 */
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
 * ⚠ midR / midC は Math.floor なので**行数・列数の偶奇で 1 マスずれる** (#58 の教訓)。 */
function entryFromRect(rect, via, inset) {
  if (!rect || inset === null || inset === undefined) return null;
  const midR = Math.floor((rect[0] + rect[2]) / 2), midC = Math.floor((rect[1] + rect[3]) / 2);
  if (via === 'right') return [rect[1] + inset, midR];   // 左辺の中点から東へ踏み込む
  if (via === 'left')  return [rect[3] - inset, midR];
  if (via === 'up')    return [midC, rect[2] - inset];   // 下辺の中点から北へ踏み込む
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
  const FLAGS = JSON.stringify({ s3_hydra_intel: true });
  /* ⭐ 期待値は**配信バイト**から組む。⛔ 作業ツリーを fs で読むと --mutate が素通しになる。 */
  const indexText = await new Promise((res, rej) => {
    http.get(base + '/index.html', r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b).toString('utf8'))); }).on('error', rej);
  });
  const cat = parsePaintings(indexText);
  const swamp = cat[THEME] || {};
  const n4def = swamp.n4big || null;

  // ── §0 装置 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  const pageA = await bootPage(browser, base + '/index.html?diag=1', THEME, errs, FLAGS);
  const GA = await pageA.evaluate(GRAPH_FN, OTHER_SCENS);
  const idsA = GA.nodes ? GA.nodes.map(n => n.id) : [];
  const byA = {}; for (const n of (GA.nodes || [])) byA[n.id] = n;

  check('0a', '★装置: RUN.graph.nodes が実際に読めて ' + KEEP_IDS.length + ' 件、entry = "n4" (これが無いと全 assert が空振りで永久緑)',
    !!GA.nodes && GA.nodes.length === KEEP_IDS.length && GA.entry === 'n4' && GA.seamActive === true,
    'active=' + GA.active + ' seam=' + GA.seamActive + ' entry=' + GA.entry +
    ' nodes=' + JSON.stringify(idsA) + (GA.err ? ' err=' + GA.err : ''));
  /* (0b) ⭐ 期待値を写経していないことの足場 = ノード数も id も
   *   buildScenarioRun("lizard-swamp") の戻り値から数え、起動時の RUN と突き合わせる。 */
  const fr = GA.fresh || {};
  check('0b', '★装置: ノード数と id を buildScenarioRun("lizard-swamp") の戻り値から数え、起動時の RUN.graph と一致する (2 経路)',
    !!fr.ids && fr.ids.length === idsA.length && JSON.stringify(fr.ids) === JSON.stringify(idsA) &&
    fr.entry === GA.entry,
    'buildScenarioRun: entry=' + fr.entry + ' ids=' + JSON.stringify(fr.ids) +
    ' / RUN: entry=' + GA.entry + ' ids=' + JSON.stringify(idsA));

  /* (0c) ⚠ 旧構成が実在することを ?swampfold=0 側で先に確かめる。
   *   これが無いと「元から 3 ノードだった」と区別できない。 */
  const pageB = await bootPage(browser, base + '/index.html?diag=1&swampfold=0', THEME, errs, FLAGS);
  const GB = await pageB.evaluate(GRAPH_FN, OTHER_SCENS);
  const idsB = GB.nodes ? GB.nodes.map(n => n.id) : [];
  const byB = {}; for (const n of (GB.nodes || [])) byB[n.id] = n;
  check('0c', '★装置: 旧構成が ?swampfold=0 側に実在する (8 ノード / entry=n0 / 廃止した 5 部屋が全部そこに居る)',
    idsB.length === 8 && GB.entry === 'n0' && DROP_IDS.every(id => idsB.indexOf(id) >= 0) &&
    KEEP_IDS.every(id => idsB.indexOf(id) >= 0),
    'entry=' + GB.entry + ' nodes=' + JSON.stringify(idsB));

  // ── §1 骨格 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §1 骨格');
  check('1a', '★ノードは n4 / n6 / n7 の 3 つだけ (n0 / n1 / n2 / n3 / n5 が 1 つも無い)',
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
  /* (1c) ⭐⭐⭐ **並び順そのものが仕様**。chooseExit は RUN.auto でも ?autoplay でも opts[0] を
   *   取るので、up を先にすると自動進行が行き止まりの祭壇へ入りボスへ永久に到達しない。 */
  const ex4 = (byA.n4 && byA.n4.exits) || [];
  check('1c', '★★n4 の exits が 2 本で並びが [right→n7, up→n6] (⭐ 順そのものが仕様) / n6・n7 は行き止まり',
    ex4.length === 2 && ex4[0].to === 'n7' && ex4[0].dir === 'right' &&
    ex4[1].to === 'n6' && ex4[1].dir === 'up' &&
    !!byA.n6 && byA.n6.exits.length === 0 && !!byA.n7 && byA.n7.exits.length === 0,
    'n4=' + JSON.stringify(ex4.map(e => e.to + ':' + e.dir + '@' + e.at.join(','))) +
    ' n6=' + JSON.stringify((byA.n6 || {}).exits) + ' n7=' + JSON.stringify((byA.n7 || {}).exits));
  check('1c2', '★本番の exitsWithReturn (= 自動進行が opts[0] を取る並び) でも先頭が n7',
    Array.isArray(GA.opts) && GA.opts.length > 0 && GA.opts[0].to === 'n7' && GA.curNode === 'n4',
    '現在ノード=' + GA.curNode + ' opts=' + JSON.stringify(GA.opts));
  /* (1d) ⚠⚠⚠ console は **m.type() で warning / error に絞る**。
   *   `[graph] 分岐グラフで起動します` は console.log の成功行なので、語で拾うと必ず赤くなる。 */
  const graphWarn = errs.filter(s => /^(WARNING|ERROR)\b/.test(s) && s.indexOf('[graph]') >= 0);
  check('1d', '★DFMapDef.lintRun が error 0 / warning 0 で、console の warning/error に [graph] が 1 件も無い',
    !!GA.lint && GA.lint.e.length === 0 && GA.lint.w.length === 0 && graphWarn.length === 0,
    'lint=' + JSON.stringify(GA.lint) + ' console=' + JSON.stringify(graphWarn.slice(0, 3)));

  // ── §2 幾何 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §2 幾何 (本番の nodeGateTile / isTileWall / aStar / openDoorAt)');
  const S4 = await pageA.evaluate(SNAP_FN, 'n4', 'right');
  const gUp = (S4.gates && S4.gates.up) || null, gRight = (S4.gates && S4.gates.right) || null;
  const atUp = ex4.find(e => e.to === 'n6'), atRight = ex4.find(e => e.to === 'n7');
  check('2a', '★★n4 → n6 の出口タイルが nodeGateTile(md,"up") と exits[].at で一致する (2 経路。食い違うと開かない扉が生まれる)',
    !!gUp && !!atUp && atUp.at[0] === gUp[0] && atUp.at[1] === gUp[1],
    'nodeGateTile(up)=' + JSON.stringify(gUp) + ' exits[].at=' + JSON.stringify(atUp ? atUp.at : null));
  check('2a2', 'n4 → n7 の出口タイルも nodeGateTile(md,"right") と exits[].at で一致する',
    !!gRight && !!atRight && atRight.at[0] === gRight[0] && atRight.at[1] === gRight[1],
    'nodeGateTile(right)=' + JSON.stringify(gRight) + ' exits[].at=' + JSON.stringify(atRight ? atRight.at : null));
  /* (2b) ⚠ 言い直し — 出口ゲートには**閉じた扉**が立つので素では isTileWall=true。
   *   「扉が立っていること」+「本番の openDoorAt で開けると床になること」の 2 段で測る。 */
  const wallAt = (S, tx, ty) => (S.walls && S.rect && ty >= S.rect[0] && ty <= S.rect[2] &&
                                 tx >= S.rect[1] && tx <= S.rect[3])
    ? S.walls[ty - S.rect[0]][tx - S.rect[1]] : null;
  const doorUp = gUp ? (S4.doors || []).find(d => d.tx === gUp[0] && d.ty === gUp[1]) : null;
  const doorRight = gRight ? (S4.doors || []).find(d => d.tx === gRight[0] && d.ty === gRight[1]) : null;
  const openUp = gUp ? await pageA.evaluate(OPEN_FN, gUp[0], gUp[1]) : null;
  check('2b', '★n4 の北の口に扉が 1 枚立ち (素は isTileWall=true)、本番の openDoorAt で開けると床になる (= 絵の石段の上に立っている)',
    !!doorUp && doorUp.state === 'closed' && !!openUp && openUp.before === true &&
    openUp.opened === 1 && openUp.after === false,
    '扉=' + JSON.stringify(doorUp) + ' openDoorAt=' + JSON.stringify(openUp));

  /* (2d)(2e) ⚠ 言い直し — ゲートそのものへの aStar は素では必ず false (扉)。
   *   「ゲートの 1 つ内側」へ到達可能 / 「扉を開けた後」はゲートそのものへ到達可能、で測る。 */
  const inward = (gate, dir) => (dir === 'up') ? [gate[0], gate[1] + 1]
                            : (dir === 'down') ? [gate[0], gate[1] - 1]
                            : (dir === 'left') ? [gate[0] + 1, gate[1]] : [gate[0] - 1, gate[1]];
  const hero = S4.hero || { tx: -1, ty: -1 };
  const inUp = gUp ? inward(gUp, 'up') : null, inRight = gRight ? inward(gRight, 'right') : null;
  const stepRightIn = inRight ? await pageA.evaluate(PATH_FN, hero.tx, hero.ty, inRight[0], inRight[1]) : null;
  const stepUpIn = inUp ? await pageA.evaluate(PATH_FN, hero.tx, hero.ty, inUp[0], inUp[1]) : null;
  const stepUpGate = gUp ? await pageA.evaluate(PATH_FN, hero.tx, hero.ty, gUp[0], gUp[1]) : null;
  check('2d', '★★n4 の入場地点から n7 行きゲートの 1 つ内側まで、本番の aStar で到達できる (⚠ ゲート自体は施錠扉なので素では到達不能が正しい)',
    typeof stepRightIn === 'number' && stepRightIn > 0 && !!doorRight,
    '入場=' + JSON.stringify(hero) + ' → ' + JSON.stringify(inRight) + ' aStar 歩数=' + stepRightIn +
    ' / ゲートの扉=' + JSON.stringify(doorRight));
  check('2e', '★★n4 の入場地点から n6 行きゲートの 1 つ内側まで素で到達でき、扉を開けた後はゲートそのものへも到達できる (北の石段が塞がっていない)',
    typeof stepUpIn === 'number' && stepUpIn > 0 && typeof stepUpGate === 'number' && stepUpGate > 0,
    '入場=' + JSON.stringify(hero) + ' → 内側' + JSON.stringify(inUp) + ' = ' + stepUpIn + ' 歩 / 開扉後ゲート' +
    JSON.stringify(gUp) + ' = ' + stepUpGate + ' 歩');
  const n4Indep = entryFromRect(S4.rect, 'right', GA.inset);
  check('2f', '★n4 の入場地点が 2 経路で一致する (実際にパーティが立ったタイルと、rect から組んだ独立式「左辺の中点 + NODE_ENTRY_INSET」)',
    !!n4Indep && hero.tx === n4Indep[0] && hero.ty === n4Indep[1] &&
    !!S4.start && S4.start.tx === hero.tx && S4.start.ty === hero.ty,
    '実際=' + JSON.stringify(hero) + ' 独立式=' + JSON.stringify(n4Indep) +
    ' mapDef.start=' + JSON.stringify(S4.start) + ' inset=' + GA.inset);

  /* (2c) n6 の入場地点 (南の石段)。⚠ 畳んだ後の n6 は **up で抜けて入る** ので via='up'。 */
  const S6 = await pageA.evaluate(SNAP_FN, 'n6', 'up');
  const g6down = (S6.gates && S6.gates.down) || null;
  const w6gate = g6down ? wallAt(S6, g6down[0], g6down[1]) : null;
  const w6entry = S6.hero ? wallAt(S6, S6.hero.tx, S6.hero.ty) : null;
  const n6Indep = entryFromRect(S6.rect, 'up', GA.inset);
  check('2c', '★n6 の入場地点と down ゲートが本番の isTileWall で床 (§2-3 の南の石段。⭐ n6big に gates を足さずに通っている)',
    !!g6down && w6gate === '.' && w6entry === '.' && !!S6.hero && !!n6Indep &&
    S6.hero.tx === n6Indep[0] && S6.hero.ty === n6Indep[1] &&
    (S6.doors || []).length === 0,
    'downゲート=' + JSON.stringify(g6down) + ' 壁=' + w6gate + ' / 入場=' + JSON.stringify(S6.hero) +
    ' 壁=' + w6entry + ' 独立式=' + JSON.stringify(n6Indep) + ' 扉=' + (S6.doors || []).length + ' 枚');

  // ── §3 中身 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §3 中身 (⭐ 期待値は ?swampfold=0 の腕からその場で導く)');
  /* (3a) ⭐ 数字を焼かない。旧構成の n1+n2+n3+n4 の slots を足したものが、畳んだ後の n4。 */
  const oldSum = [];
  for (const id of ['n1', 'n2', 'n3', 'n4']) for (const s of ((byB[id] || {}).slots || [])) oldSum.push(s[2]);
  const newList = ((byA.n4 || {}).slots || []).map(s => s[2]);
  check('3a', '★★n4 の敵の体数と種類が「?swampfold=0 の n1+n2+n3+n4 の合計」と一致する (⛔ 増減させていない・数字を焼いていない)',
    newList.length > 0 && oldSum.length === newList.length &&
    sortedJSON(typeCount(oldSum)) === sortedJSON(typeCount(newList)),
    '旧 n1+n2+n3+n4 = ' + oldSum.length + ' 体 ' + JSON.stringify(typeCount(oldSum)) +
    ' / 畳んだ n4 = ' + newList.length + ' 体 ' + JSON.stringify(typeCount(newList)));
  /* (3b) ⚠⚠⚠ isTileWall だけでは**永久緑**になる (敵スポーンは applyPaintingBlocking の
   *   門番 skipSpawn が必ず素通しさせる)。効くのは「マスクが '.' か」と
   *   「マスクが '#' なのに歩けるタイルが 0 か (= 絵に穴が開いていない)」の 2 本。 */
  const b4 = n4def ? n4def.bounds : null;
  const mask4 = (tx, ty) => (b4 && n4def.rows && ty >= b4[0] && ty <= b4[2] && tx >= b4[1] && tx <= b4[3] && n4def.rows[ty - b4[0]])
    ? n4def.rows[ty - b4[0]][tx - b4[1]] : null;
  const allSlots = ((byA.n4 || {}).slots || []).slice();
  if (byA.n4 && byA.n4.boss) allSlots.push(byA.n4.boss);
  const badMask = allSlots.filter(s => mask4(s[0], s[1]) !== '.');
  const holes = [];
  if (b4 && n4def.rows && S4.walls) {
    for (let r = 0; r < n4def.rows.length; r++) for (let c = 0; c < n4def.rows[r].length; c++) {
      if (n4def.rows[r][c] !== '#') continue;
      if (S4.walls[r] && S4.walls[r][c] === '.') holes.push([b4[1] + c, b4[0] + r]);
    }
  }
  check('3b', '★敵スロットが 1 つも n4big のマスクの "#" の上に無く、マスクの "#" が 1 つも歩けるようになっていない (絵に穴が開かない)',
    !!n4def && Array.isArray(n4def.rows) && n4def.rows.length === (b4[2] - b4[0] + 1) &&
    allSlots.length > 0 && badMask.length === 0 && holes.length === 0,
    'マスク=' + (n4def && n4def.rows ? n4def.rows.length + '行' : 'なし') + ' スロット=' + allSlots.length +
    ' ⛔マスク "#" の上=' + JSON.stringify(badMask) + ' ⛔絵の穴=' + JSON.stringify(holes.slice(0, 6)));
  /* (3c) 出口ゲートのタイルに敵を置かない (graph-spawn-on-gate の再発防止)。
   *   ⭐ ゲートは**本番の nodeGateTile** から取る (exits[].at だけを見ると片側しか守れない)。 */
  const gateKeys = new Set();
  for (const e of ex4) gateKeys.add(e.at[0] + ',' + e.at[1]);
  for (const e of ex4) { const g = S4.gates && S4.gates[e.dir]; if (g) gateKeys.add(g[0] + ',' + g[1]); }
  const onGate = allSlots.filter(s => gateKeys.has(s[0] + ',' + s[1]));
  check('3c', '★敵スロットが出口ゲートのタイルに 1 つも無い (閉じた扉に埋まって倒せない敵を作らない)',
    allSlots.length > 0 && gateKeys.size > 0 && onGate.length === 0,
    'ゲート=' + JSON.stringify([...gateKeys]) + ' ⛔その上の敵=' + JSON.stringify(onGate));
  /* (3d) 罠と玄室の宝箱が n4 で湧く。⭐ 「実在すること」と「旧構成では 0 だったこと」の
   *   両方を測る (差分だけを測る assert には実在を必ず添える)。 */
  const S4old = await pageB.evaluate(SNAP_FN, 'n4', 'right');
  check('3d', '★罠と玄室の宝箱が n4 で湧く (兼務宣言が効いている。⛔ 忘れると無言でゼロ) — ?swampfold=0 側の n4 では 0 / 0',
    S4.traps > 0 && S4.chests > 0 && S4old.traps === 0 && S4old.chests === 0,
    '畳んだ n4: 罠=' + S4.traps + ' 宝箱=' + S4.chests +
    ' / ?swampfold=0 の n4: 罠=' + S4old.traps + ' 宝箱=' + S4old.chests +
    ' / 台帳=' + JSON.stringify(GA.kindsTable));
  /* (3e) 若い司祭。⛔ (33,12) を写経せず**旧腕の座標**から導く (#53 の不変条件)。 */
  const novOld = ((byB.n4 || {}).slots || []).filter(s => s[2] === 'swampNovice');
  const novNew = ((byA.n4 || {}).slots || []).filter(s => s[2] === 'swampNovice');
  const novLive = (S4.enemies || []).filter(e => e.type === 'swampNovice');
  check('3e', '★若い司祭 swampNovice が 1 体だけ、?swampfold=0 と同じタイルに居る (#53 の不変条件 = 動かしていない)',
    novOld.length === 1 && novNew.length === 1 &&
    novOld[0][0] === novNew[0][0] && novOld[0][1] === novNew[0][1] &&
    novLive.length === 1 && novLive[0].tx === novNew[0][0] && novLive[0].ty === novNew[0][1] &&
    novLive[0].inactive === true && novLive[0].passiveNpc === true,
    '旧=' + JSON.stringify(novOld) + ' 新=' + JSON.stringify(novNew) + ' 実際に湧いた=' + JSON.stringify(novLive));
  /* (3f) ⭐ 依頼書 §8 (3a) の「3 群」は言い直し — n4big では原理的に不可能 (§12-0 の実測)。
   *   測るのは「群が 2 つで、群間が DETECTION_RANGE より離れている」。
   *   ⛔ 12.5 タイルを写経しない。DETECTION_RANGE / TILE_SIZE を本番から読んで割る。 */
  const rangeTiles = (GA.detect && GA.tile) ? (GA.detect / GA.tile) : null;
  const foePts = ((byA.n4 || {}).slots || []).filter(s => s[2] !== 'swampNovice').map(s => [s[0], s[1]]);
  const grps = rangeTiles ? clusters(foePts, rangeTiles) : [];
  const gap = grps.length >= 2 ? minGroupGap(grps) : Infinity;
  check('3f', '★敵が 2 群に割れており、群間が DETECTION_RANGE (' + (rangeTiles || '?') + ' タイル) より離れている (= 11 体が一度に襲ってこない)',
    !!rangeTiles && foePts.length > 0 && grps.length === 2 && gap > rangeTiles,
    '索敵=' + GA.detect + 'px / タイル=' + GA.tile + 'px = ' + rangeTiles + ' タイル / 群=' +
    JSON.stringify(grps.map(g => g.length)) + ' 群間=' + (gap === Infinity ? '-' : gap.toFixed(2)) + ' タイル');
  /* (3g) 入場ナレの最中に乱戦が始まらない = 入場から最寄りの敵まで 7 タイル以上。 */
  const dists = foePts.map(p => Math.hypot(p[0] - hero.tx, p[1] - hero.ty));
  const minD = dists.length ? Math.min.apply(null, dists) : -1;
  check('3g', '入場地点から最寄りの敵まで 7 タイル以上 (入場ナレの最中に乱戦が始まらない)',
    minD >= 7, '入場=' + JSON.stringify(hero) + ' 最寄り=' + minD.toFixed(2) + ' タイル (' +
    Math.round(minD * (GA.tile || 96)) + 'px)');

  // ── §4 恒等 (非退行) ───────────────────────────────────────────────────────
  console.log('\n[drv] §4 恒等 (?swampfold=0 の腕と 1 ビットも変わっていないか)');
  check('4a', '★n7 (族長の巣) のノード定義が ?swampfold=0 と完全一致 (敵・ボス・rect・start・絵・出口)',
    !!byA.n7 && !!byB.n7 && JSON.stringify(byA.n7) === JSON.stringify(byB.n7),
    '畳んだ=' + JSON.stringify(byA.n7) + ' / 旧=' + JSON.stringify(byB.n7));
  const S6old = await pageB.evaluate(SNAP_FN, 'n6', 'right');
  const hydA = (S6.enemies || []).filter(e => e.type === 'hydra');
  const hydB = (S6old.enemies || []).filter(e => e.type === 'hydra');
  check('4b', '★n6 (蛇神の祭壇) のノード定義が完全一致し、噂フラグ付きのハイドラも同じタイルに 1 体だけ湧く',
    !!byA.n6 && !!byB.n6 && JSON.stringify(byA.n6) === JSON.stringify(byB.n6) &&
    hydA.length === 1 && hydB.length === 1 && hydA[0].tx === hydB[0].tx && hydA[0].ty === hydB[0].ty,
    'ノード同一=' + (JSON.stringify(byA.n6) === JSON.stringify(byB.n6)) +
    ' ハイドラ 畳んだ=' + JSON.stringify(hydA.map(e => [e.tx, e.ty])) +
    ' 旧=' + JSON.stringify(hydB.map(e => [e.tx, e.ty])));
  const oA = GA.others || {}, oB = GB.others || {};
  const diffScen = OTHER_SCENS.filter(s => oA[s] !== oB[s] || !oA[s]);
  const distinct = new Set(OTHER_SCENS.map(s => oA[s])).size;
  check('4c', '★他 5 シナリオのグラフが 1 ビットも変わっていない (⭐ 5 本が相互に異なる = 同じ物を 5 回測っていない)',
    diffScen.length === 0 && distinct === OTHER_SCENS.length,
    '差分=' + JSON.stringify(diffScen) + ' 相互に異なる=' + distinct + '/' + OTHER_SCENS.length +
    ' hash=' + JSON.stringify(oA));
  check('4d', '★森の兼務宣言 (bandits-forest の n7 = search / loot) が 1 ビットも動いていない (driver_grid_s2 の領分)',
    !!GA.kindsTable && !!GB.kindsTable &&
    JSON.stringify(GA.kindsTable['bandits-forest']) === JSON.stringify({ n7: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['bandits-forest']) === JSON.stringify(GB.kindsTable['bandits-forest']),
    '畳んだ=' + JSON.stringify(GA.kindsTable) + ' / 旧=' + JSON.stringify(GB.kindsTable));

  // ── §5 撤退 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §5 撤退スイッチ');
  check('5a', '★?swampfold=0 で 8 ノード / entry=n0 へ戻り、n4 の敵スロットが移設分ちょうど 7 件だけ減る',
    idsB.length === 8 && GB.entry === 'n0' &&
    ((byB.n4 || {}).slots || []).length + 7 === ((byA.n4 || {}).slots || []).length,
    'nodes=' + idsB.length + ' entry=' + GB.entry + ' 旧 n4 slots=' + ((byB.n4 || {}).slots || []).length +
    ' 畳んだ n4 slots=' + ((byA.n4 || {}).slots || []).length);
  check('5b', '?swampfold=0 でも大部屋 3 枚はそのまま (n4big / n6big / n7big)',
    !!byB.n4 && byB.n4.paint === 'n4big' && !!byB.n6 && byB.n6.paint === 'n6big' &&
    !!byB.n7 && byB.n7.paint === 'n7big',
    'n4=' + (byB.n4 || {}).paint + ' n6=' + (byB.n6 || {}).paint + ' n7=' + (byB.n7 || {}).paint);
  /* (5c) ⭐⭐⭐ 依頼書 §4 の「4 本は独立」は成立しない。派生 SWAMP_FOLDED は
   *   !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF なので **?swampmap=0 でも 8 ノードへ戻る**。
   *   (そうしないと移設した敵も gates.up も 7x6 へ戻った rect の外へ落ちる。) */
  const pageC = await bootPage(browser, base + '/index.html?diag=1&swampmap=0', THEME, errs, FLAGS);
  const GC = await pageC.evaluate(GRAPH_FN, []);
  const idsC = GC.nodes ? GC.nodes.map(n => n.id) : [];
  const byC = {}; for (const n of (GC.nodes || [])) byC[n.id] = n;
  const rc4 = (byC.n4 || {}).rect || null;
  const wh = rc4 ? [rc4[3] - rc4[1] + 1, rc4[2] - rc4[0] + 1] : null;
  /* ⚠ 7x6 へ戻ると絵は**旧在庫の小さな床絵 "n4"** に戻る (null ではない)。
   *   縛るのは「大部屋 n4big ではない」+「7x6」の 2 つ。 */
  check('5c', '★★?swampmap=0 でも 8 ノード / entry=n0 へ戻る (SWAMP_FOLDED が 2 本を見る = 片方だけ効いた中間状態を作らない) / n4 は 7x6 の小部屋へ',
    idsC.length === 8 && GC.entry === 'n0' && !!wh && wh[0] === 7 && wh[1] === 6 &&
    (byC.n4 || {}).paint !== 'n4big',
    'nodes=' + idsC.length + JSON.stringify(idsC) + ' entry=' + GC.entry +
    ' n4 rect=' + JSON.stringify(rc4) + '(' + (wh || []).join('x') + ') paint=' + (byC.n4 || {}).paint);
  await pageC.close();
  const pageD = await bootPage(browser, base + '/index.html?diag=1&swampcrypt=0', THEME, errs, FLAGS);
  const GD = await pageD.evaluate(GRAPH_FN, []);
  const pageE = await bootPage(browser, base + '/index.html?diag=1&swamplair=0', THEME, errs, FLAGS);
  const GE = await pageE.evaluate(GRAPH_FN, []);
  const idsD = GD.nodes ? GD.nodes.map(n => n.id) : [], idsE = GE.nodes ? GE.nodes.map(n => n.id) : [];
  check('5d', '?swampcrypt=0 / ?swamplair=0 は畳みを外さない (どちらも 3 ノード / entry=n4 のまま = 部屋の幾何だけを戻す口)',
    JSON.stringify(idsD) === JSON.stringify(KEEP_IDS) && GD.entry === 'n4' &&
    JSON.stringify(idsE) === JSON.stringify(KEEP_IDS) && GE.entry === 'n4',
    'swampcrypt=0: ' + JSON.stringify(idsD) + ' entry=' + GD.entry +
    ' / swamplair=0: ' + JSON.stringify(idsE) + ' entry=' + GE.entry);
  await pageD.close(); await pageE.close();
  await pageA.close(); await pageB.close();

  return { results: R, errs: errs };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_fold_');
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
