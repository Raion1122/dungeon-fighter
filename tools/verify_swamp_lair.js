#!/usr/bin/env node
/*
 * verify_swamp_lair.js — 実装依頼書 #58「沼地から旧グラを追放する
 *   (n6 蛇神の祭壇 = flooded-crypt 34x22 / n7 族長の巣 = chieftain-lair 29x20)」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測り方の方針 (依頼書 §9)
 *   ⭐ **盤面の幾何は絵のマスクから直に / 配置は本番の isTileWall と aStar から**測る。
 *     ⛔ ドライバの中に MASK も座標表も書き写さない (実装とドライバが同じ誤りを共有すると
 *        両方緑になって永久に気づけない)。マスクは**配信した index.html を自前でパース**して組み、
 *        通行は**本番の aStar**を呼ぶ (probe_bandit_map.js --places と同じ判断)。
 *   ⭐ 入場地点は「本番の nodeGateTile + NODE_ENTRY_INSET + snapToWalkable」と
 *     「rect から独立に組んだ式」の 2 経路で突き合わせる。⛔ (12,13)/(12,12) を写経しない
 *     (nodeGateTile の midR は Math.floor なので行数の偶奇で 1 マスずれる = 起草が外した点)。
 *   ⚠⚠⚠ **(2b) を isTileWall だけで書かない。** 敵スポーンのタイルは applyPaintingBlocking の
 *     門番 (skipSpawn) が必ず通すので、ハイドラをどこへ置いても isTileWall は false になる =
 *     **isTileWall 単独では永久緑**。効くのは「絵のマスクが '.' か」と
 *     「マスクが '#' なのに歩けるタイル (= 絵に開いた穴) が 0 か」の 2 本。
 *
 * ■ 節
 *   §0 装置 (母集団の確認)  §1 絵と幾何  §2 ハイドラ  §3 n7 の敵配置
 *   §4 通行  §5 恒等と撤退
 *
 * ── 負のコントロール (--negative。配信をメモリ上で差し替える) ────────────────────
 *   hydraold / density1 / startdefault / nonode / boundsoff / guardnear / throneseal / bosswall /
 *   n4mask / n4key   (★[#62] 後ろ 2 本は言い直した (5a)(5a2) の負のコントロール)
 *   ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと必ず空振り)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと差し替わったか確認できない)。
 *   ⚠ マスク行をアンカーにするときは**行末コメントまで含めて 1 行**にする
 *     (n6big / n4big にも同じ形の行があるため。前例 = driver_grid_p4 のアンカー腐敗)。
 *
 * 使い方:
 *   node tools/verify_swamp_lair.js               # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_swamp_lair.js --negative    # 変異 10 本 (port 10122〜10131) が期待どおり赤くなるか
 *   node tools/verify_swamp_lair.js --negative --only throneseal   # 1 本だけ確かめる
 *   node tools/verify_swamp_lair.js --mutate hydraold --port 10122
 * ⚠ base ポートは **10121**。10101〜10109 は #57 の verify_hold_person が占有。
 *   ⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56 の実測)。
 * exit 0=期待どおり / 1=FAIL あり / 2=環境不足 / 3=変異の空振り・使い方の誤り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '10121'), 10);
/* ⭐ 恒等 (§5a) の基準は「着手前のコミット」への歴史的なピン留め。
 *   ⛔ HEAD を基準にすると、実装をコミットした瞬間に「自分自身との比較」= 永久緑になる。 */
const BASELINE_REV = arg('baseline-rev', '079ff3a');   // #58 着手前 (= #57 着地)
const THEME = 'lizard-swamp';
const TILE = 96;
const ENGAGE = 400;      // 依頼書 §9 (3b) の melee 交戦距離 (world px)
const LEGACY_START = { tx: 36, ty: 13 };   // 大部屋化する前の既定の起点 (= 移し忘れの顔)

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* M1 ⭐⭐⭐ ハイドラ座標を旧 (36,13) のままにする = 大部屋化で「別の場所に湧く」罠の再現。
   *   ⚠ SCENARIO_NODE_EXTRAS そのものを書き換えるので (2a) の 2 経路は**両方とも動く** =
   *     突き合わせでは捕まらない。効くのは「絵のマスクが '.' か」「絵に穴が開いていないか」。 */
  hydraold: [['        : { n6: { spawns: [["hydra", 38, 14, "s3_hydra_intel"]] } },',
              '        : { n6: { spawns: [["hydra", 36, 13, "s3_hydra_intel"]] } },   /* hydraold */']],
  /* M2 density を 1 に戻す = 既に描き込まれた絵の上へ scenery が湧く。 */
  density1: [['              rect: [3, 10, 22, 38], paint: "n7big", density: 0,',
              '              rect: [3, 10, 22, 38], paint: "n7big", density: 1,   /* density1 */']],
  /* M3 start を既定 (36,13) に戻す = 起点が入場口の反対側へ飛ぶ。 */
  startdefault: [['              start: { tx: 12, ty: 12 },',
                  '              start: { tx: 36, ty: 13 },   /* startdefault */']],
  /* M4 node: true を落とす (#52 の依頼書が実際に間違えた形)。従来経路へ絵が漏れる。 */
  nonode: [['             tileBounds: [3, 10, 22, 38], node: true,      // 20 行 x 29 列。⚠ 行が先',
            '             tileBounds: [3, 10, 22, 38],   /* nonode */']],
  /* M5 tileBounds だけ 1 タイルずらす (rect は据置) = paintingAspectFits が落ちる。 */
  boundsoff: [['             tileBounds: [3, 10, 22, 38], node: true,      // 20 行 x 29 列。⚠ 行が先',
               '             tileBounds: [3, 10, 22, 39], node: true,   /* boundsoff */']],
  /* M6 護衛を入場地点の隣へ置く。
   *   ⚠ 移し先 (14,12)(14,13) は**どちらも行 9-10 の石畳なので isTileWall は false のまま** =
   *     (3a) では捕まらない。担当は (3b)(3c)。 */
  guardnear: [['              slots: [[34, 11, "lizardWarrior"], [34, 15, "lizardPriest"]],',
               '              slots: [[14, 12, "lizardWarrior"], [14, 13, "lizardPriest"]],   /* guardnear */']],
  /* M7 玉座への通路を塞ぐ。
   *   ⚠⚠ **行 9 だけでは空振りする** — 玉座の龕 (絵ローカル 26-27 / 行 9-10) は
   *     行 9 と行 10 の 2 本で西とつながっているので、片方だけ塞いでも迂回できる。
   *     ⇒ col 25 を**行 9 と行 10 の両方**で塞ぐ (= 唯一の関節を切る)。
   *   ⚠ アンカーは行末コメントまで含めた 1 行 (n6big / n4big にも同じ形の行がある)。 */
  throneseal: [['               ".............................",   //  9  ★★入場の行。東西を貫く乾いた石畳。(2,9)=入場 / (26,9)=玉座の座面 = 族長',
                '               ".........................#...",   /* throneseal r9 */'],
               ['               ".............................",   // 10  ★石畳の 2 行目。この 2 行だけが西から玉座へ届く唯一の主動線',
                '               ".........................#...",   /* throneseal r10 */']],
  /* M8 ⭐ 依頼書 §2-7 の**5 番目の門番**(「敵を置くタイルは必ずマスクの '.' にする」)の
   *   負のコントロール。ボスを 1 マス北 = 絵ローカル (26,8) の**玉座の石の天板**(マスク '#')へ。
   *   ⚠ ここは `applyPaintingBlocking` の `skipSpawn` が素通しさせるので **`isTileWall` は床のまま** =
   *     「壁の中に湧いた」では捕まらない。捕まえるのは (3a) のマスク側と、
   *     (2b2) の「絵に穴が開いた」側の 2 本。 */
  bosswall: [['              boss: [36, 12, "lizardChieftain"] },',
              '              boss: [36, 11, "lizardChieftain"] },   /* bosswall */']],
  /* M9 ★[#62] (5a) を言い直したので、**言い直した後の (5a) が本当に検出するか**を証明する
   *   負のコントロールを新設した (旧 (5a) は変異に 1 本も守られていなかった)。
   *   n4big のマスクを 1 マスだけ開ける = #58 が恐れた「隣の領分を巻き添えにした」形そのもの。
   * ⚠ 行末コメントまで含めて 1 行で指す (n4big / n6big / n7big に同じ書式の行がある)。 */
  n4mask: [['               ".####################..######.",   // 11  ★南の親柱。口は col 21-22 の 1 つだけ = 桟橋へ降りる石畳',
            '               ".###################...######.",   // 11 ★変異n4mask']],
  /* M10 ★[#62] (5a2) の負のコントロール。gates 以外のキーを n4big へ足す。
   *   ⭐ parsePaintings は既知のフィールドしか読まないので (5a) は緑のまま = (5a2) が
   *     無ければ**この退行は一生捕まらない**ことを機械で示す。 */
  n4key: [['             outdoor: true,    /* 沼の参道は屋外。入った瞬間から盤面の全体が見えているのが正しい */',
           '             outdoor: true, mutKey: 1,   /* ★変異n4key */']],
};
/* 変異 → 赤くなるべき assert id。
 * ⚠⚠⚠ 机上で書かない。1 本ずつ実走して**実際に赤くなった id** を書く (#57 の教訓)。 */
const MUT_EXPECT = {
  hydraold:     ['2b', '2b2'],
  density1:     ['1c'],
  startdefault: ['1d', '3b'],
  nonode:       ['1b', '1b2'],
  boundsoff:    ['1a', '1a2'],
  guardnear:    ['3b', '3c'],
  throneseal:   ['4a', '4c'],
  bosswall:     ['3a', '2b2'],
  n4mask:       ['5a'],
  n4key:        ['5a2'],
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
// ★ドライバ側の独立実装 — 配信されたテキストから期待値を組む
//   ⚠⚠ df-mapdef.js の paintingBlockedTilesFor も index.html の関数も 1 行も借りない。
//   (パーサの作りは verify_swamp_novice.js / driver_paint_blocked.js と同型。)
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
/* SCENARIO_NODE_EXTRAS からハイドラの行を独立に読む。
 *   -> [{ type, tx, ty, flag }] (テキスト順 = [撤退の枝, 既定の枝]) */
function parseHydraSpawns(indexText) {
  const MARK = 'const SCENARIO_NODE_EXTRAS = {';
  const i = indexText.indexOf(MARK);
  if (i < 0) throw new Error('SCENARIO_NODE_EXTRAS が見つかりません');
  const body = stripComments(sliceBrace(indexText, i + MARK.length - 1));
  const out = [];
  const re = /\[\s*"(hydra)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*\]/g;
  let m;
  while ((m = re.exec(body))) out.push({ type: m[1], tx: Number(m[2]), ty: Number(m[3]), flag: m[4] });
  return out;
}
/* ある識別子から始まるオブジェクトリテラルを**バイトそのまま**切り出す (恒等 assert 用)。 */
function sliceEntry(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const b = text.indexOf('{', i);
  if (b < 0) return null;
  return sliceBrace(text, b);
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ側の測定
// ══════════════════════════════════════════════════════════════════════════════
async function bootPage(browser, url, scen, errs, questFlags) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()); });
  await page.evaluateOnNewDocument((sid, qf) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    /* ⭐ 噂フラグの 2 アーム。キーを**置く**と questFlagsPresent = true になるので、
     *   「酒場を経由したが噂を掴めなかった」= 0 体が正常 の状態を作れる。
     *   ⛔ ?intel=1 は __dfDevCheat のゲートを踏むので使わない。 */
    if (qf !== null) { try { sessionStorage.setItem('dragonfighters.questFlags', qf); } catch (e) {} }
  }, scen, questFlags === undefined ? null : questFlags);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

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
  let paintedInRect = 0;
  if (rect) {
    for (let r = rect[0]; r <= rect[2]; r++) {
      let line = '';
      for (let c = rect[1]; c <= rect[3]; c++) {
        line += isTileWall(c, r) ? '#' : '.';
        if (isPaintedTile(c, r)) paintedInRect++;
      }
      walls.push(line);
    }
  }
  /* ★本番の入場地点。nodeGateTile → NODE_ENTRY_INSET → snapToWalkable を
   *   placeNodeParty("right") とまったく同じ順で通す (⛔ 定数を写経しない)。 */
  let entry = null, gateLeft = null;
  try {
    const g = nodeGateTile(md, 'left');
    if (g) {
      gateLeft = { tx: g.tx, ty: g.ty };
      const t = snapToWalkable({ tx: g.tx + NODE_ENTRY_INSET, ty: g.ty });
      entry = { tx: t.tx, ty: t.ty };
    }
  } catch (e) {}
  let aspect = null;
  try {
    if (window.DFMapDef && room.painting)
      aspect = !!DFMapDef.paintingAspectFits(rect, room.painting);
  } catch (e) { aspect = 'THREW'; }
  return {
    rect: rect, start: md.start || null, name: md.name || null,
    paint: room.painting ? room.painting.key : null,
    paintTheme: room.painting ? room.painting.theme : null,
    density: room.scenery ? room.scenery.density : null,
    slots: room.enemySlots || [], boss: room.bossSlot || null,
    spawns: (typeof ENEMY_SPAWNS !== 'undefined' ? ENEMY_SPAWNS : []).map(s => [s[0], s[1], s[2]]),
    /* ⚠ 敵のタイルは Math.round(e.x / TILE) では出ない。createEnemy が
     *   x = tx*TILE + TILE/2 - displaySize/2 を入れるので、中心へ戻してから floor する。 */
    enemies: enemies.map(e => ({
      type: e.type, alive: !!e.alive, inactive: !!e.inactive, passiveNpc: !!e.passiveNpc,
      boss: !!(e.def && (e.def.isBoss || e.def.boss)),
      hitRange: (e.def && e.def.hitRange) || null, meleeRange: (e.def && e.def.meleeRange) || null,
      tx: Math.floor((e.x + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE),
      ty: Math.floor((e.y + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE) })),
    paintings: (typeof roomPaintings !== 'undefined' ? roomPaintings : []).map(p => ({
      src: (p.img && p.img.getAttribute('src')) || '', tx: p.tx, ty: p.ty, tw: p.tw, th: p.th, seal: !!p.sealRing })),
    sceneryInRect: (typeof sceneryPlacements !== 'undefined' && rect)
      ? sceneryPlacements.filter(s => s.ty >= rect[0] && s.ty <= rect[2] && s.tx >= rect[1] && s.tx <= rect[3]).length
      : null,
    walls: walls, paintedInRect: paintedInRect, entry: entry, gateLeft: gateLeft,
    inset: (typeof NODE_ENTRY_INSET !== 'undefined') ? NODE_ENTRY_INSET : null,
    tile: TILE_SIZE, aspect: aspect,
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
function bfs4(walls, from) {
  const H = walls.length, W = H ? walls[0].length : 0;
  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  if (from[0] < 0 || from[0] >= H || from[1] < 0 || from[1] >= W) return { seen: seen, n: 0 };
  if (walls[from[0]][from[1]] === '#') return { seen: seen, n: 0 };
  const st = [from]; seen[from[0]][from[1]] = true; let n = 1;
  while (st.length) {
    const cur = st.pop(), r = cur[0], c = cur[1];
    for (const d of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const nr = d[0], nc = d[1];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      if (seen[nr][nc] || walls[nr][nc] === '#') continue;
      seen[nr][nc] = true; n++; st.push([nr, nc]);
    }
  }
  return { seen: seen, n: n };
}
/* sealRing が「出口」として残す 4 タイル (辺の中点)。⚠ 実装の関数は借りず rect から組む。 */
function gateKeySet(rect) {
  const s = new Set();
  const midR = Math.floor((rect[0] + rect[2]) / 2), midC = Math.floor((rect[1] + rect[3]) / 2);
  s.add(midC + ',' + rect[0]); s.add(midC + ',' + rect[2]);
  s.add(rect[1] + ',' + midR); s.add(rect[3] + ',' + midR);
  return s;
}

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
  const swamp = cat[THEME] || {};
  const defs = { n6: swamp.n6big || null, n7: swamp.n7big || null };
  const hydraRows = parseHydraSpawns(indexText);

  // ── §0 装置 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  /* ⭐ 噂フラグを**掴んだ**標本。掴んでいないとハイドラは 0 体が正常なので §2 が空振りする。 */
  const page = await bootPage(browser, base + '/index.html?diag=1', THEME, errs,
                              JSON.stringify({ s3_hydra_intel: true }));
  const S = { n6: await page.evaluate(SNAP_FN, 'n6', 'right'),
              n7: await page.evaluate(SNAP_FN, 'n7', 'right') };
  const both = ['n6', 'n7'];
  const wh = (b) => b ? [b[3] - b[1] + 1, b[2] - b[0] + 1] : null;   // [w, h]

  const paintedOk = both.every(k => S[k].paintings && S[k].paintings.length === 1 && S[k].paintedInRect > 0);
  check('0a', '★装置: n6 / n7 の両方で絵が 1 枚だけ貼られ、paintedTileMask が 0 枚でない',
    paintedOk, both.map(k => k + ': 絵=' + (S[k].paintings || []).length +
      ' 塗られたタイル=' + S[k].paintedInRect + '/' + ((wh(S[k].rect) || [0, 0])[0] * (wh(S[k].rect) || [0, 0])[1])).join(' / '));
  /* (0b) 「絵の src が ROOM_PAINTINGS_DEF の実体から引かれている」= 3 経路の一致。
   *   ① 配信テキストの定義 ② 実際に貼られた img の src ③ ディスク上に実在する。 */
  const srcRows = both.map(k => {
    const d = defs[k], run = (S[k].paintings || [])[0];
    const dsrc = d ? d.src : null, rsrc = run ? run.src.replace(/^.*?\/(assets\/)/, '$1') : null;
    const exists = dsrc ? fs.existsSync(path.join(ROOT, dsrc)) : false;
    return { k, dsrc, rsrc, exists, ok: !!dsrc && !!rsrc && rsrc === dsrc && exists };
  });
  check('0b', '★装置: 絵の src が ROOM_PAINTINGS_DEF の実体から引けて、貼られた img と一致し、ファイルが実在する',
    srcRows.every(r => r.ok), srcRows.map(r => r.k + ': def=' + r.dsrc + ' 実際=' + r.rsrc + ' 実在=' + r.exists).join(' / '));
  const hydras = (S.n6.enemies || []).filter(e => e.type === 'hydra');
  check('0c', '★装置: 噂フラグ s3_hydra_intel を掴んだ標本で n6 にハイドラが 1 体いる (inactive + passiveNpc)',
    hydras.length === 1 && hydras[0].inactive === true && hydras[0].passiveNpc === true,
    JSON.stringify(hydras));

  // ── §1 絵と幾何 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §1 絵と幾何');
  const aspRows = both.map(k => ({
    k, rect: S[k].rect, bounds: defs[k] ? defs[k].bounds : null, aspect: S[k].aspect,
    ok: !!defs[k] && JSON.stringify(S[k].rect) === JSON.stringify(defs[k].bounds) && S[k].aspect === true }));
  check('1a', '★★n6 / n7 の rect が tileBounds と同値で、本番の paintingAspectFits を通る (2 経路)',
    aspRows.every(r => r.ok),
    aspRows.map(r => r.k + ': rect=' + JSON.stringify(r.rect) + ' tileBounds=' + JSON.stringify(r.bounds) +
      ' aspectFits=' + r.aspect).join(' / '));
  const maskRows = both.map(k => {
    const d = defs[k];
    const w = d ? d.bounds[3] - d.bounds[1] + 1 : 0, h = d ? d.bounds[2] - d.bounds[0] + 1 : 0;
    const rows = d && Array.isArray(d.rows) ? d.rows : null;
    return { k, w, h, n: rows ? rows.length : 0,
             widths: rows ? Array.from(new Set(rows.map(r => r.length))).join(',') : '-',
             ok: !!rows && rows.length === h && rows.every(r => r.length === w) };
  });
  check('1a2', 'blocked マスクの行数 x 桁数が tileBounds と一致する (n6 / n7)',
    maskRows.every(r => r.ok),
    maskRows.map(r => r.k + ': 行=' + r.n + '/' + r.h + ' 桁=' + r.widths + '/' + r.w).join(' / '));
  check('1b', '★n6big / n7big の両方に node: true が付いている (#52 の罠)',
    both.every(k => defs[k] && defs[k].node === true),
    both.map(k => k + '=' + (defs[k] ? defs[k].node : 'なし')).join(' / '));
  check('1c', 'density が 0 で、絵の矩形の中に scenery が 1 つも湧いていない (n6 / n7 x 2 経路)',
    both.every(k => S[k].density === 0 && S[k].sceneryInRect === 0),
    both.map(k => k + ': density=' + S[k].density + ' rect 内 scenery=' + S[k].sceneryInRect).join(' / '));
  /* (1d) ⭐⭐⭐ 定数を写経しない。
   *   ① 本番の nodeGateTile + NODE_ENTRY_INSET + snapToWalkable (SNAP_FN の entry)
   *   ② rect から独立に組んだ式  ⚠ midR は Math.floor なので**行数の偶奇で 1 マスずれる** */
  const startRows = both.map(k => {
    const s = S[k].start, e = S[k].entry, rc = S[k].rect;
    const want = rc ? { tx: rc[1] + (S[k].inset || 0), ty: Math.floor((rc[0] + rc[2]) / 2) } : null;
    const legacy = !!s && s.tx === LEGACY_START.tx && s.ty === LEGACY_START.ty;
    return { k, s, e, want, legacy,
             ok: !!s && !!e && !!want && s.tx === e.tx && s.ty === e.ty &&
                 s.tx === want.tx && s.ty === want.ty && !legacy };
  });
  check('1d', '★start が入場地点 (辺の中点 + NODE_ENTRY_INSET) と一致し、既定 (36,13) ではない (本番の関数と独立式の 2 経路)',
    startRows.every(r => r.ok),
    startRows.map(r => r.k + ': start=' + JSON.stringify(r.s) + ' 本番=' + JSON.stringify(r.e) +
      ' 独立式=' + JSON.stringify(r.want) + (r.legacy ? ' ⛔既定のまま' : '')).join(' / '));

  // ── §2 ハイドラ ────────────────────────────────────────────────────────────
  console.log('\n[drv] §2 ハイドラ (⚠⚠⚠ 最重要)');
  const defHydra = hydraRows.length ? hydraRows[hydraRows.length - 1] : null;   // 既定の枝 = テキストの後ろ
  const runHydra = hydras[0] || null;
  check('2a', '★★ハイドラの座標が 2 経路で一致する (SCENARIO_NODE_EXTRAS の定義 / 実際に生成された敵の tx,ty)。噂フラグ名も不変',
    !!defHydra && !!runHydra && defHydra.tx === runHydra.tx && defHydra.ty === runHydra.ty &&
    defHydra.flag === 's3_hydra_intel' && hydraRows.length === 2,
    '定義=' + JSON.stringify(defHydra) + ' 実際=' + (runHydra ? '(' + runHydra.tx + ',' + runHydra.ty + ')' : 'なし') +
    ' 定義の総数=' + hydraRows.length);
  /* (2b) ⚠⚠⚠ isTileWall だけでは**永久緑**になる (敵スポーンは applyPaintingBlocking の
   *   門番 skipSpawn が必ず通すので、どこへ置いても床になる)。⇒ 絵のマスクを真の判定にする。 */
  const d6 = defs.n6, b6 = d6 ? d6.bounds : null;
  const mask6 = (tx, ty) => (b6 && d6.rows && ty >= b6[0] && ty <= b6[2] && tx >= b6[1] && tx <= b6[3] && d6.rows[ty - b6[0]])
    ? d6.rows[ty - b6[0]][tx - b6[1]] : null;
  const wallAt = (S6, tx, ty) => (S6.walls && S6.rect && ty >= S6.rect[0] && ty <= S6.rect[2] &&
                                  tx >= S6.rect[1] && tx <= S6.rect[3])
    ? S6.walls[ty - S6.rect[0]][tx - S6.rect[1]] : null;
  const hx = runHydra ? runHydra.tx : -1, hy = runHydra ? runHydra.ty : -1;
  check('2b', '★★ハイドラのタイルが n6big のマスクで "." かつ本番の isTileWall で床、そして既定 (36,13) ではない',
    !!runHydra && mask6(hx, hy) === '.' && wallAt(S.n6, hx, hy) === '.' &&
    !(hx === LEGACY_START.tx && hy === LEGACY_START.ty),
    'タイル=(' + hx + ',' + hy + ') マスク=' + mask6(hx, hy) + ' isTileWall=' +
    (wallAt(S.n6, hx, hy) === '#' ? 'true(壁)' : 'false(床)'));
  /* (2b2) 絵に穴が開いていないか = マスクが '#' なのに歩けるタイルの数。
   *   ⭐ 「マスクの '#' に敵を置くと門番が絵へ穴を開ける」という本チケット固有の壊れ方は
   *     ここでしか見えない (件数の assert では 1 本も赤くならない)。 */
  const holes = { n6: [], n7: [] };
  for (const k of both) {
    const d = defs[k], b = d ? d.bounds : null, S1 = S[k];
    if (!b || !d.rows || !S1.walls) continue;
    for (let r = 0; r < d.rows.length; r++) for (let c = 0; c < d.rows[r].length; c++) {
      if (d.rows[r][c] !== '#') continue;
      if (S1.walls[r] && S1.walls[r][c] === '.') holes[k].push([b[1] + c, b[0] + r]);
    }
  }
  check('2b2', '★マスクで "#" のタイルが 1 つも歩けるようになっていない (スポーン門番が絵に穴を開けていない)',
    holes.n6.length === 0 && holes.n7.length === 0,
    'n6 の穴=' + JSON.stringify(holes.n6) + ' n7 の穴=' + JSON.stringify(holes.n7));
  await page.close();
  /* (2c) 噂フラグを掴んでいない標本 = 0 体が正常 (既存の挙動が変わっていない)。 */
  const pageNo = await bootPage(browser, base + '/index.html?diag=1', THEME, errs, JSON.stringify({}));
  const n6No = await pageNo.evaluate(SNAP_FN, 'n6', 'right');
  const noH = (n6No.enemies || []).filter(e => e.type === 'hydra');
  check('2c', '噂フラグを掴んでいない標本では n6 にハイドラが 0 体 (既存の出し分けが壊れていない)',
    noH.length === 0 && n6No.spawns.filter(s => s[0] === 'hydra').length === 0,
    'ハイドラ=' + noH.length + ' 体 / ENEMY_SPAWNS=' + JSON.stringify(n6No.spawns));
  await pageNo.close();

  // ── §3 n7 の敵配置 ─────────────────────────────────────────────────────────
  console.log('\n[drv] §3 n7 の敵配置');
  const d7 = defs.n7, b7 = d7 ? d7.bounds : null;
  const mask7 = (tx, ty) => (b7 && d7.rows && ty >= b7[0] && ty <= b7[2] && tx >= b7[1] && tx <= b7[3] && d7.rows[ty - b7[0]])
    ? d7.rows[ty - b7[0]][tx - b7[1]] : null;
  const places = (S.n7.slots || []).map(s => ({ role: s[2], tx: s[0], ty: s[1] }));
  if (S.n7.boss) places.push({ role: S.n7.boss[2] + '(boss)', tx: S.n7.boss[0], ty: S.n7.boss[1] });
  const badPlace = places.filter(p => mask7(p.tx, p.ty) !== '.' || wallAt(S.n7, p.tx, p.ty) !== '.');
  check('3a', '★ボスと護衛 2 体が全部床 (n7big のマスクで "." かつ本番の isTileWall で床 = 2 経路)',
    places.length === 3 && badPlace.length === 0,
    places.map(p => p.role + '(' + p.tx + ',' + p.ty + ') マスク=' + mask7(p.tx, p.ty) +
      ' 壁=' + wallAt(S.n7, p.tx, p.ty)).join(' / '));
  const st7 = S.n7.start || { tx: -99, ty: -99 };
  const guards = (S.n7.slots || []).map(s => ({ role: s[2], tx: s[0], ty: s[1],
    px: Math.hypot(s[0] - st7.tx, s[1] - st7.ty) * TILE }));
  const minD = guards.length ? Math.min.apply(null, guards.map(g => g.px)) : -1;
  const hitR = (S.n7.enemies || []).filter(e => !e.boss).map(e => e.hitRange).filter(Boolean);
  check('3b', '★入場地点から護衛まで melee 交戦距離 (' + ENGAGE + 'px) より遠い = 入場ナレの最中に乱戦が始まらない',
    guards.length === 2 && minD > ENGAGE,
    '入場=' + JSON.stringify(st7) + ' ' + guards.map(g => g.role + ' ' + Math.round(g.px) + 'px(' +
      (g.px / TILE).toFixed(2) + 'タイル)').join(' / ') + ' 参考 hitRange=' + JSON.stringify(hitR));
  const gd = guards.length === 2 ? Math.hypot(guards[0].tx - guards[1].tx, guards[0].ty - guards[1].ty) : -1;
  check('3c', '護衛どうしが 2〜4 タイル (同じ戦闘に巻き込まれる距離)',
    gd >= 2 && gd <= 4, '護衛間=' + gd.toFixed(2) + ' タイル');
  const cnt = (arr, t) => arr.filter(x => x === t).length;
  const t7 = (S.n7.enemies || []).map(e => e.type).sort();
  check('3d', '★母集団ガード: n7 の顔ぶれが lizardWarrior 1 + lizardPriest 1 + lizardChieftain 1 のまま (体数も種類も変えていない)',
    cnt(t7, 'lizardWarrior') === 1 && cnt(t7, 'lizardPriest') === 1 && cnt(t7, 'lizardChieftain') === 1 && t7.length === 3,
    JSON.stringify(t7));

  // ── §4 通行 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §4 通行 (本番の aStar + 4 近傍 BFS)');
  const page4 = await bootPage(browser, base + '/index.html?diag=1', THEME, errs,
                               JSON.stringify({ s3_hydra_intel: true }));
  await page4.evaluate(SNAP_FN, 'n7', 'right');
  const bossT = S.n7.boss ? { tx: S.n7.boss[0], ty: S.n7.boss[1] } : { tx: -1, ty: -1 };
  const steps7 = await page4.evaluate(PATH_FN, st7.tx, st7.ty, bossT.tx, bossT.ty);
  const bfs7 = bfs4(S.n7.walls, [st7.ty - S.n7.rect[0], st7.tx - S.n7.rect[1]]);
  const bossReach = bfs7.seen[bossT.ty - S.n7.rect[0]] && bfs7.seen[bossT.ty - S.n7.rect[0]][bossT.tx - S.n7.rect[1]];
  check('4a', '★★n7 の入場地点から玉座の壇まで、本番の aStar で到達できる (自前 4 近傍 BFS とも一致)',
    typeof steps7 === 'number' && steps7 > 0 && !!bossReach,
    '入場' + JSON.stringify(st7) + ' → 玉座' + JSON.stringify(bossT) +
    ' aStar 歩数=' + steps7 + ' BFS 到達=' + !!bossReach);
  await page4.evaluate(SNAP_FN, 'n6', 'right');
  const st6 = S.n6.start || { tx: -99, ty: -99 };
  const steps6 = await page4.evaluate(PATH_FN, st6.tx, st6.ty, hx, hy);
  const bfs6 = bfs4(S.n6.walls, [st6.ty - S.n6.rect[0], st6.tx - S.n6.rect[1]]);
  const altarReach = hy >= S.n6.rect[0] && hy <= S.n6.rect[2] && hx >= S.n6.rect[1] && hx <= S.n6.rect[3] &&
    bfs6.seen[hy - S.n6.rect[0]][hx - S.n6.rect[1]];
  check('4b', '★★n6 の入場地点から祭壇 (ハイドラのタイル) まで、本番の aStar で到達できる',
    typeof steps6 === 'number' && steps6 > 0 && !!altarReach,
    '入場' + JSON.stringify(st6) + ' → 祭壇(' + hx + ',' + hy + ') aStar 歩数=' + steps6 +
    ' BFS 到達=' + !!altarReach);
  await page4.close();
  /* (4c) ⚠ 「孤立 0」を assert すると赤くなる。sealRing は 4 方向のゲートを出口として残すので、
   *   壁帯に囲まれた辺の中点は必ず孤立する (n7 の上下 2 枚が実際にそれ)。
   *   ⇒ 縛るのは「孤立しているのは**辺の中点のゲートだけ**」。 */
  const isoRows = both.map(k => {
    const S1 = S[k], rc = S1.rect;
    const from = k === 'n6' ? [st6.ty - rc[0], st6.tx - rc[1]] : [st7.ty - rc[0], st7.tx - rc[1]];
    const reach = bfs4(S1.walls, from);
    const gates = gateKeySet(rc);
    let walk = 0; const iso = [];
    for (let r = 0; r < S1.walls.length; r++) for (let c = 0; c < S1.walls[r].length; c++) {
      if (S1.walls[r][c] !== '.') continue;
      walk++;
      if (!reach.seen[r][c]) iso.push([rc[1] + c, rc[0] + r]);
    }
    const bad = iso.filter(t => !gates.has(t[0] + ',' + t[1]));
    return { k, walk, reach: reach.n, iso, bad, ok: bad.length === 0 };
  });
  check('4c', '★孤立した歩けるマスが sealRing のゲート (辺の中点) だけ = 部屋が割れていない',
    isoRows.every(r => r.ok),
    isoRows.map(r => r.k + ': 歩ける=' + r.walk + ' 到達=' + r.reach + ' 孤立=' + JSON.stringify(r.iso) +
      (r.bad.length ? ' ⛔ゲート以外=' + JSON.stringify(r.bad) : '')).join(' / '));

  // ── §5 恒等と撤退 ──────────────────────────────────────────────────────────
  console.log('\n[drv] §5 恒等 (非退行) と撤退スイッチ');
  /* (5a) ⚠⚠ #57 の教訓 — 恒等 assert は**配信バイト**を読む。凍結原本や作業ツリーを読むと
   *   負のコントロールが素通しする。基準は着手前のコミットへ直書きでピン留めする。 */
  let baseText = null, baseErr = null;
  try { baseText = execFileSync('git', ['show', BASELINE_REV + ':index.html'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); }
  catch (e) { baseErr = String(e && e.message || e); }
  /* ⚠⚠⚠ この環境は **core.autocrlf=true**。作業ツリー (= 配信バイト) は CRLF だが
   *   `git show <rev>:index.html` が返すのはオブジェクト DB の中身 = **LF**。
   *   素で比べると n4big の 46 行ぶん 46 バイトずれて**必ず赤くなる** (2026-09-07 実測:
   *   現行 3267 / 基準 3221 で差はちょうど行数)。⇒ 改行の**格納形式**だけを揃えてから比べる。
   *   ⛔ これは緩和ではない (中身は 1 文字も許していない)。⛔ 逆に「行数が同じなら OK」に
   *     しない — 正規化した後の**全文一致**を要求し続ける。 */
  const norm = (s) => (s === null || s === undefined) ? s : s.replace(/\r\n/g, '\n');
  /* ★[#62 2026-09-08] ここは**言い直した**。⛔ 基準 rev を進める道は採っていない。
   *
   * ■ 何が起きたか
   *   初版は n4big のエントリを**バイト全文**で 079ff3a と突き合わせていた。#62 が
   *   gates: { up: [8, 0] }, (+ その注記コメント) を 1 つ足した瞬間に赤くなった
   *   (現行 3635 文字 / 基準 3221 文字)。
   *
   * ■ なぜ「基準 rev を進める」を採らなかったか
   *   rev を #62 着地後へ進めると、この assert が守っていた**時間の幅がその都度リセット**され、
   *   「#58 の大部屋化が #53 の領分を巻き添えにしていない」という主張そのものが消える。
   *   ⇒ チケットが 1 本通るたびに rev を進める運用は、恒等 assert を**永久に何も守らない**器にする。
   *
   * ■ 何を凍結すべきだったか (= #58 が本当に守りたかった不変条件)
   *   #58 の関心は「n6 / n7 を大部屋にした作業が、隣の n4big の**絵の幾何**を壊していないか」。
   *   壊れると困るのは src / tileBounds / node / sealRing / outdoor / **マスク 21 行**であって、
   *   注記コメントの文面ではない。⇒ 凍結範囲を**絵の幾何そのもの**へ寄せる。
   *   ⛔ これは緩和ではない: マスクは 21 行**全部を逐語**で突き合わせたままだし、
   *     「気づかないうちにキーが増減した」は下の (5a2) が別に捕まえる。
   *
   * ■ (5a2) が要る理由
   *   (5a) だけにすると「gates 以外の未知のキーを足す」変更が無言で通る。⇒ 079ff3a からの
   *   **キーの増減**を集合で突き合わせ、増えたのは gates ちょうど 1 つ・減ったのは 0 と縛る。
   *   ⭐ 次に n4big へ何かを足すときは、この 1 行を意図的に更新することになる (git diff に載る)。 */
  const N4_MARK = 'n4big: { src: "assets/room_lizard-swamp_n4_map.jpg"';
  const curN4 = norm(sliceEntry(indexText, N4_MARK));
  const baseN4 = baseText ? norm(sliceEntry(baseText, N4_MARK)) : null;
  const baseCat = baseText ? parsePaintings(baseText) : null;
  const geomOf = (e) => e ? JSON.stringify({
    src: e.src, bounds: e.bounds, node: e.node, seal: e.seal, outdoor: e.outdoor, rows: e.rows,
  }) : null;
  const curGeom = geomOf(swamp.n4big);
  const baseGeom = baseCat ? geomOf((baseCat[THEME] || {}).n4big) : null;
  check('5a', '★n4big (#53 の領分) の絵の幾何 (src / tileBounds / node / sealRing / outdoor / マスク ' +
        ((swamp.n4big && swamp.n4big.rows) || []).length + ' 行) が着手前 ' + BASELINE_REV + ' と 1 文字も変わっていない',
    !!curGeom && !!baseGeom && curGeom === baseGeom,
    baseErr ? ('baseline を読めない: ' + baseErr)
            : (curGeom === baseGeom ? ('同一 (' + (curGeom ? curGeom.length : 0) + ' 文字)')
                                    : ('⛔差分あり 現行=' + curGeom + ' / 基準=' + baseGeom)));
  /* n4big のトップレベルのキー名だけを取り出す (コメントと入れ子は捨てる)。 */
  const topKeysOf = (entry) => {
    if (!entry) return null;
    const body = stripComments(entry);
    const keys = []; let depth = 0, i = 0, atKey = true;
    while (i < body.length) {
      const ch = body[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const q = ch; i++;
        while (i < body.length && body[i] !== q) { if (body[i] === '\\') i++; i++; }
        i++; continue;
      }
      if (ch === '{' || ch === '[') { depth++; i++; atKey = (depth === 1); continue; }
      if (ch === '}' || ch === ']') { depth--; i++; continue; }
      if (ch === ',') { atKey = (depth === 1); i++; continue; }
      if (depth === 1 && atKey && /[A-Za-z_$]/.test(ch)) {
        const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i));
        if (m) { keys.push(m[1]); i += m[0].length; atKey = false; continue; }
      }
      i++;
    }
    return keys.sort();
  };
  const curKeys = topKeysOf(curN4), baseKeys = topKeysOf(baseN4);
  const added = (curKeys && baseKeys) ? curKeys.filter(k => baseKeys.indexOf(k) < 0) : null;
  const removed = (curKeys && baseKeys) ? baseKeys.filter(k => curKeys.indexOf(k) < 0) : null;
  check('5a2', '★n4big で ' + BASELINE_REV + ' から増えたキーは gates ちょうど 1 つ、減ったキーは 0 (#62 の意図した差分だけ)',
    !!added && !!removed && added.join(',') === 'gates' && removed.length === 0,
    baseErr ? ('baseline を読めない: ' + baseErr)
            : ('現行=' + (curKeys || []).join(',') + ' / 基準=' + (baseKeys || []).join(',') +
               ' 増=' + JSON.stringify(added) + ' 減=' + JSON.stringify(removed)));
  check('5b', '撤退の行き先である旧エントリが残っている (n4 = [11,33,16,39] / n7 = [11,32,16,40])',
    !!swamp.n4 && JSON.stringify(swamp.n4.bounds) === JSON.stringify([11, 33, 16, 39]) &&
    !!swamp.n7 && JSON.stringify(swamp.n7.bounds) === JSON.stringify([11, 32, 16, 40]),
    'n4=' + JSON.stringify(swamp.n4 && swamp.n4.bounds) + ' n7=' + JSON.stringify(swamp.n7 && swamp.n7.bounds));
  /* (5c) ⭐ n6 は rect / paint / density / start / ハイドラ座標が**同時に**戻ることを 1 本で測る。 */
  const pageC = await bootPage(browser, base + '/index.html?diag=1&swampcrypt=0', THEME, errs,
                               JSON.stringify({ s3_hydra_intel: true }));
  const c6 = await pageC.evaluate(SNAP_FN, 'n6', 'right');
  const c7 = await pageC.evaluate(SNAP_FN, 'n7', 'right');
  const c6h = (c6.enemies || []).filter(e => e.type === 'hydra');
  const c6wh = wh(c6.rect);
  check('5c', '?swampcrypt=0 で n6 が 7x6 / 絵なし / density 1 / start(36,13) へ戻り、ハイドラも (36,13) へ同時に戻る',
    !!c6wh && c6wh[0] === 7 && c6wh[1] === 6 && c6.paint === null && (c6.paintings || []).length === 0 &&
    c6.density === 1 && !!c6.start && c6.start.tx === 36 && c6.start.ty === 13 &&
    c6h.length === 1 && c6h[0].tx === 36 && c6h[0].ty === 13,
    'rect=' + JSON.stringify(c6.rect) + '(' + (c6wh || []).join('x') + ') paint=' + c6.paint +
    ' 絵=' + (c6.paintings || []).length + ' density=' + c6.density + ' start=' + JSON.stringify(c6.start) +
    ' ハイドラ=' + JSON.stringify(c6h.map(e => [e.tx, e.ty])));
  const pageL = await bootPage(browser, base + '/index.html?diag=1&swamplair=0', THEME, errs,
                               JSON.stringify({ s3_hydra_intel: true }));
  const l7 = await pageL.evaluate(SNAP_FN, 'n7', 'right');
  const l6 = await pageL.evaluate(SNAP_FN, 'n6', 'right');
  const l7wh = wh(l7.rect);
  const l7src = (l7.paintings || [])[0] ? (l7.paintings[0].src || '').replace(/^.*?\/(assets\/)/, '$1') : null;
  check('5c2', '?swamplair=0 で n7 が 9x6 / 旧 6x6 の床絵 "n7" / density 1 / 旧 slots・旧 boss へ戻る (= 旧グラへ戻る唯一の口)',
    !!l7wh && l7wh[0] === 9 && l7wh[1] === 6 && l7.paint === 'n7' && l7src === (swamp.n7 && swamp.n7.src) &&
    l7.density === 1 && JSON.stringify(l7.slots) === JSON.stringify([[39, 12, 'lizardWarrior'], [39, 15, 'lizardPriest']]) &&
    JSON.stringify(l7.boss) === JSON.stringify([40, 13, 'lizardChieftain']),
    'rect=' + JSON.stringify(l7.rect) + '(' + (l7wh || []).join('x') + ') paint=' + l7.paint + ' src=' + l7src +
    ' density=' + l7.density + ' slots=' + JSON.stringify(l7.slots) + ' boss=' + JSON.stringify(l7.boss));
  /* (5d) ⭐ 2 本のスイッチは**独立**。片方を倒したときに、もう片方のノードが道連れにならない。 */
  check('5d', '2 本の撤退スイッチが独立 (?swampcrypt=0 では n7 が新しいまま / ?swamplair=0 では n6 が新しいまま)',
    c7.paint === 'n7big' && JSON.stringify(c7.rect) === JSON.stringify(S.n7.rect) &&
    l6.paint === 'n6big' && JSON.stringify(l6.rect) === JSON.stringify(S.n6.rect),
    'swampcrypt=0 の n7: paint=' + c7.paint + ' rect=' + JSON.stringify(c7.rect) +
    ' / swamplair=0 の n6: paint=' + l6.paint + ' rect=' + JSON.stringify(l6.rect));
  await pageC.close(); await pageL.close();
  /* (1b2) node: true の実効 — 従来経路 (単一マップ) へ大部屋の絵が 1 枚も漏れない。
   *   ⚠ 静的な (1b) だけだと「宣言はあるが効いていない」を見逃す。 */
  const pageG = await bootPage(browser, base + '/index.html?diag=1&graph=0', THEME, errs, null);
  const legacy = await pageG.evaluate(() => ({
    active: !!(window.__graphRun && window.__graphRun.active && window.__graphRun.active()),
    srcs: (typeof roomPaintings !== 'undefined' ? roomPaintings : []).map(p => (p.img && p.img.getAttribute('src')) || ''),
  }));
  check('1b2', '★node:true が効いている — 従来経路 (?graph=0 の単一マップ) に n6big / n7big の絵が 1 枚も漏れない',
    legacy.active === false && !legacy.srcs.some(s => /room_lizard-swamp_n[67]_map\.jpg/.test(s)),
    'graph.active=' + legacy.active + ' 貼られた絵=' + JSON.stringify(legacy.srcs));
  await pageG.close();

  return { results: R, errs: errs };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_lair_');
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
        const ok = hit.length > 0 || failed.indexOf('THREW') >= 0;
        report.push({ key: key, want: want, failed: failed, ok: ok });
        console.log('  ⇒ 変異 ' + key + ': 期待 ' + JSON.stringify(want) + ' / 実際に赤 ' + JSON.stringify(failed) +
                    ' → ' + (ok ? 'OK (検出できた)' : '⛔ 空振り'));
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
      console.log('\n[drv] 例外 / console.error = ' + run.errs.length + (run.errs.length ? ' ' + JSON.stringify(run.errs.slice(0, 4)) : ''));
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
