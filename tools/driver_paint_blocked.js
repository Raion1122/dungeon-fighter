#!/usr/bin/env node
/*
 * driver_paint_blocked.js — 卓上グリッド P2 の検証ドライバ (2026-08-17)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 塞ぐ穴
 *   1 枚絵に描かれた樽・木箱・柵をキャラがすり抜けていた。P2 で
 *   ROOM_PAINTINGS_DEF[theme][key].blocked (行文字列マスク) を obstacleTileMask へ積んだ。
 *   既存ドライバはどれもこれを測れない:
 *     ・driver_paint_grid        … 線が見えるかだけ。当たり判定を 1 つも見ない
 *     ・driver_mapeditor_painting … 1 枚絵が乗るか / 貼る矩形だけ
 *     ・driver_mapeditor_props    … props の当たり判定だけ (絵のマスクは通らない)
 *     ・golden 系                … 描画コマンド列。obstacleTileMask は絵に出ない
 *
 * ■ 測り方の方針
 *   ⭐ **目的で測る**。「マスクが obstacleTileMask に載ったか」(手段) だけでは、実装と
 *     ドライバが同じ誤りを共有して永久に緑になる。よって
 *       ① 期待するタイル集合を**ドライバ側で独立に計算**する (配信された index.html を
 *          自前でパースし、tileBounds + マスクから絶対タイルを組む)。実装の
 *          paintingBlockedTilesFor は 1 行も借りない。
 *       ② **詰まないこと**は「起点からボス/全部屋/全スポーンへ BFS が届くか」で測る。
 *          しかも ?paintblock=0 との**ペア比較**にする — 絶対値だと元から到達できない
 *          タイルがあるマップで閾値が置けない (隠し扉 P6 の教訓と同型)。
 *   ⭐ **画像の読み込みに依存しない**ことを別に測る (§6)。当たり判定が img.onload を
 *     待つと回線の速さで通れる場所が変わる。jpg を落として同じ結果になることを見る。
 *   ⚠ 門前ガード (起点/扉/敵スポーン/廊下は塞がない) は **positive control** で測る:
 *     変異 blockstart で起点の行を丸ごと '#' にし、ガードが働いて盤面が詰まないことを見る。
 *     さらに blockstartnoguard (同じマスク + ガード除去) で **§3 が赤くなる**ことを見て、
 *     ガードが load-bearing であることを実測する。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate             | 注入する欠陥                                  | 赤くなるべき節
 *   PORT   | (素)               | —                                             | —
 *   PORT+1 | nomask             | blocked を常に捨てる                          | §2 §7
 *   PORT+2 | noapply            | obstacleTileMask へ積む呼び出しを消す          | §2
 *   PORT+3 | offbyone           | マスクの列を 1 マスずらす                      | §2 (2d)(2e)
 *   PORT+4 | blockstart         | 起点の行を丸ごと '#' に (★positive control)   | 赤くならない (§4 が緑で意味を持つ)
 *   PORT+5 | blockstartnoguard  | 同上 + 起点/廊下ガードを除去                   | §3 (3b)(3c)(3d)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_paint_blocked.js
 *   node tools/driver_paint_blocked.js --mutate offbyone [--headful]
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8893'), 10);
const THEMES = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const STAGE = arg('stage', 'goblin-mine');

// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
/* ★起点の行 (goblin-mine / key 1 の row 8) を丸ごと '#' にする変異の置換元。
 *  末尾コメントまで含めて 1 行で指定する (P5 の教訓: 素の 1 行は別の場所にも当たりうる)。 */
const ROW8_FROM = '               "....................",   //  8  \u2605\u8d77\u70b9\u306e\u884c (\u52170)\u3002\u5e03\u304c\u6577\u3044\u3066\u3042\u308b\u3060\u3051';
const ROW8_TO   = '               "####################",   //  8  \u2605\u5909\u7570blockstart';
const MUTATIONS = {
  nomask: [
    ['    if (entry.blocked === undefined || entry.blocked === null) return none;',
     '    if (true) return none;   /* \u2605\u5909\u7570nomask */'],
  ],
  noapply: [
    ['      applyPaintingBlocking(enemySpawns, playerStartTx, playerStartTy);',
     '      /* \u2605\u5909\u7570noapply */'],
  ],
  offbyone: [
    ['        var cc = rect[1] + c;',
     '        var cc = rect[1] + c + 1;   /* \u2605\u5909\u7570offbyone */'],
  ],
  blockstart: [
    [ROW8_FROM, ROW8_TO],
  ],
  blockstartnoguard: [
    [ROW8_FROM, ROW8_TO],
    /* ⚠ 2026-08-20 (廃坑の壁抜け): 門番が tryBlock へ畳まり continue → return になった。
     *   変異アンカーは実装の 1 行と完全一致しないと空振りする (exit 3 で止まる)。 */
    ['          if (k === startKey)   { stat.skipStart++; return; }',
     '          /* \u2605\u5909\u7570noguard-start */'],
    ['          if (corridorKeys.has(k)) { stat.skipCorridor++; return; }',
     '          /* \u2605\u5909\u7570noguard-corridor */'],
  ],
};
const MUT_ORDER = ['nomask', 'noapply', 'offbyone', 'blockstart', 'blockstartnoguard'];
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
  const targets = [];
  for (const [from, to] of MUTATIONS[key]) {
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
    targets.push(hits[0]);
  }
  _mutCache[key] = { files: out, targets: targets };
  return _mutCache[key];
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
          res.end(mutatedSources(mutKey).files[rel]); return;
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
const httpGet = (port, p) => new Promise((res, rej) => {
  /* ⚠ Buffer で受けてから 1 度だけ decode する。チャンク境界で日本語 (3 バイト) が
   *   割れると文字数が変わり (0a) が誤報する。 */
  http.get({ host: '127.0.0.1', port: port, path: p }, r => {
    const bufs = []; r.on('data', d => bufs.push(d));
    r.on('end', () => res(Buffer.concat(bufs).toString('utf8')));
  }).on('error', rej);
});

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; fails.push(name + (detail ? '  — ' + detail : '')); }
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
const mark = (m) => console.log('\n[drv] ' + (++step) + ' ' + m);

// ══════════════════════════════════════════════════════════════════════════════
// ★ドライバ側の独立実装 — 配信された index.html から期待タイル集合を組む
//   ⚠⚠ df-mapdef.js の paintingBlockedTilesFor を 1 行も借りない。借りると
//     「実装が積んだものを実装の式で検算する」トートロジーになり永久に緑。
// ══════════════════════════════════════════════════════════════════════════════
const CATALOG_MARK = 'const ROOM_PAINTINGS_DEF = {';
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
  throw new Error('ROOM_PAINTINGS_DEF の { } が閉じていません');
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
    if (ch === '"' || ch === "'") { quote = ch; out.push(ch); i++; continue; }
    if (s.startsWith('//', i)) { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    if (s.startsWith('/*', i)) { const j = s.indexOf('*/', i + 2); if (j < 0) throw new Error('block comment'); i = j + 2; continue; }
    out.push(ch); i++;
  }
  return out.join('');
}
/* -> { theme: [{ key, bounds:[r1,c1,r2,c2], node:bool, rows:[string]|null }] } */
function parsePaintings(indexText) {
  const i = indexText.indexOf(CATALOG_MARK);
  if (i < 0) throw new Error('ROOM_PAINTINGS_DEF が見つかりません');
  const body = stripComments(sliceBrace(indexText, i + CATALOG_MARK.length - 1));
  const out = {};
  const themeRe = /["']([\w\-]+)["']\s*:\s*\{/g;
  let m;
  while ((m = themeRe.exec(body))) {
    const theme = m[1];
    const block = sliceBrace(body, m.index + m[0].length - 1);
    themeRe.lastIndex = m.index + m[0].length - 1 + block.length;
    const list = [];
    const entRe = /["']?(\w+)["']?\s*:\s*\{/g;
    let e;
    while ((e = entRe.exec(block))) {
      const eb = sliceBrace(block, e.index + e[0].length - 1);
      entRe.lastIndex = e.index + e[0].length - 1 + eb.length;
      const bm = /tileBounds\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/.exec(eb);
      if (!bm) continue;
      const km = /blocked\s*:\s*\[([\s\S]*?)\]/.exec(eb);
      const rows = km ? (km[1].match(/["']([^"']*)["']/g) || []).map(s => s.slice(1, -1)) : null;
      list.push({ key: e[1], bounds: bm.slice(1, 5).map(Number), node: /node\s*:\s*true/.test(eb), rows: rows });
    }
    out[theme] = list;
  }
  return out;
}
/* 従来経路 (?graph=0 / 単一マップ) で貼られる絵 = node:true 以外。
 * ⚠ 実装の loadRoomPaintings と**同じ規則**をここで独立に書く (index.html の def.node)。 */
function expectedTiles(indexText, theme, MAP_W) {
  const cat = parsePaintings(indexText);
  const list = (cat[theme] || []).filter(e => !e.node && e.rows && e.rows.length);
  const keys = new Set();
  const per = [];
  for (const e of list) {
    const [r1, c1, r2, c2] = e.bounds;
    const th = r2 - r1 + 1, tw = c2 - c1 + 1;
    if (e.rows.length !== th) continue;                 // 寸法不一致は実装も捨てる
    if (e.rows.some(r => r.length !== tw)) continue;
    let n = 0;
    for (let r = 0; r < th; r++) {
      for (let c = 0; c < tw; c++) {
        if (e.rows[r][c] !== '#') continue;
        keys.add((r1 + r) * MAP_W + (c1 + c)); n++;
      }
    }
    per.push({ key: e.key, n: n });
  }
  return { keys: keys, per: per };
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ内測定
// ══════════════════════════════════════════════════════════════════════════════
/* ★純関数の解釈規則 (df-mapdef.js) を直接叩く。本編の盤面とは独立。 */
const PURE_FN = () => {
  const M = window.DFMapDef;
  const okRows = ['..#.', '....', '.#..'];
  const good = M.paintingBlockedRows({ tileBounds: [0, 0, 2, 3], blocked: okRows });
  const badH = M.paintingBlockedRows({ tileBounds: [0, 0, 3, 3], blocked: okRows });
  const badW = M.paintingBlockedRows({ tileBounds: [0, 0, 2, 4], blocked: okRows });
  const none = M.paintingBlockedRows({ tileBounds: [0, 0, 2, 3] });
  const same = M.paintingBlockedTilesFor(okRows, [10, 20, 12, 23], 72, 28);   // 等倍 = 恒等写像
  const big = M.paintingBlockedTilesFor(okRows, [0, 0, 5, 7], 72, 28);        // 2 倍 = 1→4 マス
  const out = M.paintingBlockedTilesFor(okRows, [26, 69, 28, 72], 72, 28);    // 枠外は捨てる
  return {
    goodRows: good.rows ? good.rows.length : 0, goodErr: good.error,
    badH: !badH.rows && !!badH.error, badW: !badW.rows && !!badW.error,
    noneRows: none.rows, noneErr: none.error,
    same: same.slice().sort((a, b) => a - b),
    bigN: big.length, outN: out.length,
    blockChar: M.PAINTING_BLOCK_CHAR,
  };
};

/* 本編の適用結果 + そのタイルが本当に歩けないか。 */
const PROBE_FN = () => {
  const p = window.__paintBlockProbe();
  p.wallAt = p.tiles.map(k => isTileWall(k % MAP_W, Math.floor(k / MAP_W)));
  p.rectsLoaded = window.__paintRects().filter(r => r.loaded).length;
  p.rectsAll = window.__paintRects().length;
  p.theme = (typeof _scenIdForTex !== 'undefined') ? _scenIdForTex : null;
  /* ★負のコントロールの母集団: 絵の内側でマスクが '#' でない床マス。
   *   ここが全部歩けることまで見ないと「絵の矩形を丸ごと塞いだ」に気づけない。
   * ⚠⚠ ただし **1 枚絵の中には元から情景スプライト (瓦礫/線路) と扉が居る**。
   *   それを数えずに「全部歩ける」と書くと、実装ではなく**測定器が壊れている**赤になる
   *   (初回実測で 525/534 = 9 マスが情景由来だった)。閾値でごまかさず、
   *   別要因を**列挙して差し引く**。 */
  const blockedSet = new Set(p.tiles);
  const otherKeys = new Set();
  for (const s of (typeof sceneryPlacements !== 'undefined' ? sceneryPlacements : [])) {
    if (s && s.blocking) otherKeys.add(s.ty * MAP_W + s.tx);
  }
  for (const d of doorsForRender()) if (d) otherKeys.add(d.ty * MAP_W + d.tx);
  let free = 0, freeWalkable = 0, freeOther = 0;
  const walkInPaint = [];
  for (const r of window.__paintRects()) {
    for (let ty = r.ty; ty < r.ty + r.th; ty++) {
      for (let tx = r.tx; tx < r.tx + r.tw; tx++) {
        if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) continue;
        const k = ty * MAP_W + tx;
        if (!isTileWall(tx, ty)) walkInPaint.push(k);
        if (ty < r.ty + 1 || ty >= r.ty + r.th - 1 || tx < r.tx + 1 || tx >= r.tx + r.tw - 1) continue;
        if (blockedSet.has(k) || mapData[ty][tx] === 2) continue;
        free++;
        if (!isTileWall(tx, ty)) freeWalkable++;
        else if (otherKeys.has(k)) freeOther++;
      }
    }
  }
  p.free = free; p.freeWalkable = freeWalkable; p.freeOther = freeOther;
  p.walkInPaint = walkInPaint.sort((a, b) => a - b);
  return p;
};

/* ★目的の側 — 起点から 4 近傍 BFS。isTileWall (唯一の歩行判定) をそのまま使う。 */
const REACH_FN = () => {
  const W = MAP_W, H = MAP_H;
  const seen = new Uint8Array(W * H);
  const q = [];
  if (!isTileWall(START_TX, START_TY)) { seen[START_TY * W + START_TX] = 1; q.push(START_TY * W + START_TX); }
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], r = (k / W) | 0, c = k % W;
    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const nn of nb) {
      const rr = nn[0], cc = nn[1];
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) continue;
      const kk = rr * W + cc;
      if (seen[kk] || isTileWall(cc, rr)) continue;
      seen[kk] = 1; q.push(kk);
    }
  }
  const rooms = MAPDEF.rooms.map(function (room) {
    const rect = room.rect;
    let walk = 0, hit = 0;
    for (let r = rect[0]; r <= rect[2]; r++) {
      for (let c = rect[1]; c <= rect[3]; c++) {
        if (isTileWall(c, r)) continue;
        walk++; if (seen[r * W + c]) hit++;
      }
    }
    return { id: room.id, walk: walk, hit: hit };
  });
  const bossSlots = MAPDEF.rooms.map(function (r) { return r.bossSlot; }).filter(Boolean)
    .map(function (b) { return { tx: b[0], ty: b[1], ok: !!seen[b[1] * W + b[0]] }; });
  const spawns = (ENEMY_SPAWNS || []).map(function (s) {
    return { tx: s[1], ty: s[2], ok: !!seen[s[2] * W + s[1]] };
  });
  return {
    startWalkable: !isTileWall(START_TX, START_TY), start: [START_TX, START_TY],
    reached: q.length, rooms: rooms, bossSlots: bossSlots, spawns: spawns,
    roomsHit: rooms.map(function (r) { return r.id + ':' + (r.hit > 0 ? 1 : 0); }).join(','),
    slotsOk: spawns.map(function (s) { return s.ok ? 1 : 0; }).join('') + '|' +
             bossSlots.map(function (s) { return s.ok ? 1 : 0; }).join(''),
  };
};

/* lint (エディタの出発前チェック) が同じ判断をするか。合成 mapDef で叩く。 */
const LINT_FN = () => {
  const M = window.DFMapDef;
  const CAT = {
    t1: { ok:      { src: 'x.png', tileBounds: [0, 0, 3, 3], blocked: ['....', '.##.', '.##.', '....'] },
          broken:  { src: 'y.png', tileBounds: [0, 0, 3, 3], blocked: ['....', '.##.'] },
          onstart: { src: 'z.png', tileBounds: [12, 23, 14, 25], blocked: ['...', '.#.', '...'] } },
  };
  M.setPaintingCatalog(CAT);
  const base = M.sanitize(JSON.parse(JSON.stringify(M.DEFAULT_DUNGEON)));
  const codes = function (d) {
    const L = M.lintMapDef(d);
    return L.errors.concat(L.warnings).map(function (x) { return x.code; });
  };
  const mk = function (key) {
    const d = JSON.parse(JSON.stringify(base));
    d.rooms[0].painting = { theme: 't1', key: key };
    return d;
  };
  const broken = codes(mk('broken'));
  const good = codes(mk('ok'));
  // 起点 (tx24, ty13) を rect [12,23,14,25] の中心 = マスクの '#' で覆う
  const dStart = mk('onstart');
  dStart.rooms[0].rect = [12, 23, 14, 25];
  const onStart = codes(dStart);
  const tilesN = M.paintingBlockedTiles(mk('ok')).length;
  M.setPaintingCatalog(null);
  return { broken: broken, good: good, onStart: onStart, tilesN: tilesN };
};

/* 分岐マップの全ノードを組み直して BFS。★ノード用の絵へマスクを足したときの備え。 */
const NODE_WALK_FN = (reachSrc) => {
  /* ⚠⚠ RUN は classic script 直下の const なので **window には載らない**。
   *   window.RUN で見ると常に undefined = 「分岐マップが組めていない」という偽の赤になる
   *   (初回実測で踏んだ)。裸の識別子で typeof して見る。 */
  if (typeof RUN === 'undefined' || !RUN) return null;
  const reach = new Function('return (' + reachSrc + ')')();
  nodeBusy = true;
  const out = [];
  for (const id of Object.keys(RUN.byId)) {
    try {
      /* ⚠⚠ **resolveNodeMapDef を通すこと**。RUN.byId[id].mapDef を直に渡すと sanitize も
       *   isCustom も付かない生の定義になり、loadRoomPaintings が従来経路へ落ちて
       *   「全ノードで山場/ボスの絵が絶対座標のまま貼られている」という**偽の赤**が出る
       *   (初回実測で踏んだ)。実プレイの入口は index.html:31651 の
       *   `buildNode(resolveNodeMapDef(toId), toId)` ただ 1 つ。 */
      buildNode(resolveNodeMapDef(id), id);
      const r = reach();
      const pb = window.__paintBlockProbe();
      out.push({ id: id, roomsHit: r.roomsHit, reached: r.reached,
                 startWalkable: r.startWalkable, blocked: pb.tiles.length,
                 /* ★ノードの絵がどの経路で貼られたか。isCustom が false だと **従来経路**が
                  *  効いて山場/ボスの絵 (key 1/2) が絶対座標のままノードへ貼られる = 絵も
                  *  マスクも別のマップから漏れてくる。ここを観測しないと気づけない。 */
                 isCustom: !!(MAPDEF && MAPDEF.isCustom),
                 paints: MAPDEF.rooms.map(function (rm) {
                   return rm.painting ? (rm.painting.theme + '/' + rm.painting.key) : null; }),
                 rects: window.__paintRects().map(function (x) {
                   return x.tx + ',' + x.ty + ' ' + x.tw + 'x' + x.th; }),
                 allRooms: r.rooms.every(function (x) { return x.walk === 0 || x.hit > 0; }) });
    } catch (e) {
      out.push({ id: id, err: String(e && e.message || e) });
    }
  }
  return out;
};

async function bootPage(browser, url, scen, errs, opts) {
  const o = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
    if (o.logs) o.logs.push(t);
  });
  if (o.blockImages) {
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (o.blockImages.test(r.url())) r.abort().catch(() => {});
      else r.continue().catch(() => {});
    });
  }
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { sessionStorage.removeItem('dragonfighters.generatedScenario'); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    try { localStorage.removeItem('df.devMode'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof isTileWall === 'function' && !!window.__paintBlockProbe",
    { timeout: 25000 });
  return page;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 :' + PORT + '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));
  const profile = require('./_pptr_profile')('df_paintblocked_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });

  const basePort = MUTATE ? PORT_OF[MUTATE] : PORT;
  const base = 'http://127.0.0.1:' + basePort;
  const Q = '/index.html?diag=1&graphtest=1&graph=0';
  let baseProbe = null;

  try {
    // ══ §0 変異の配信検算 ═════════════════════════════════════════════════════
    mark('§0 変異が素の配信に無く、変異ポートにだけ載っていること');
    {
      let allOk = true; const detail = [];
      for (const k of MUT_ORDER) {
        const info = mutatedSources(k);
        let ok = true;
        for (let i = 0; i < MUTATIONS[k].length; i++) {
          const from = MUTATIONS[k][i][0], to = MUTATIONS[k][i][1];
          const tgt = info.targets[i];
          const pure = await httpGet(PORT, '/' + tgt);
          const mut = await httpGet(PORT_OF[k], '/' + tgt);
          if (!(pure.indexOf(from) >= 0 && mut.indexOf(from) < 0 && mut.indexOf(to) >= 0)) ok = false;
        }
        if (!ok) allOk = false;
        detail.push(k + (ok ? ':ok' : ':NG'));
      }
      check('(0a) ★' + MUT_ORDER.length + ' 種の変異が正しく配信へ載っている', allOk, detail.join(' '));
    }

    // ══ §1 解釈規則 (純関数) ═════════════════════════════════════════════════
    mark('§1 マスクの解釈規則 (df-mapdef.js の純関数)');
    {
      const errs = [];
      const page = await bootPage(browser, base + Q, STAGE, errs);
      const P = await page.evaluate(PURE_FN);
      console.log('[drv] pure ' + JSON.stringify(P));
      check("(1a) '#' が綴りの唯一の正", P.blockChar === '#', 'char=' + P.blockChar);
      check('(1b) 正しい寸法のマスクは採られる', P.goodRows === 3 && !P.goodErr,
        JSON.stringify([P.goodRows, P.goodErr]));
      check('(1c) ★行数が違えば丸ごと捨て、理由を返す', P.badH === true, 'badH=' + P.badH);
      check('(1d) ★桁数が違えば丸ごと捨て、理由を返す', P.badW === true, 'badW=' + P.badW);
      check('(1e) blocked 未指定は正常 (error なし)', P.noneRows === null && P.noneErr === null,
        JSON.stringify([P.noneRows, P.noneErr]));
      /* okRows = ['..#.','....','.#..'] を rect [10,20,12,23] へ = 恒等写像。
       * 期待値はドライバ側で手計算する (実装の式を借りない)。 */
      const want = [10 * 72 + 22, 12 * 72 + 21].sort((a, b) => a - b);
      check('(1f) ★等倍 rect では恒等写像', JSON.stringify(P.same) === JSON.stringify(want),
        'got=' + JSON.stringify(P.same) + ' want=' + JSON.stringify(want));
      check('(1g) ★2 倍の rect では 1 マスが 4 マスへ (隙間が空かない)', P.bigN === 8, 'n=' + P.bigN);
      check('(1h) 枠外は捨てる (捏造しない)', P.outN < 2, 'n=' + P.outN);
      check('(1i) ページエラー 0 件', errs.length === 0, errs.slice(0, 3).join(' | '));
      await page.close();
    }

    // ══ §2 本編に載ったか (独立計算との突き合わせ) ════════════════════════════
    mark('§2 マスクが obstacleTileMask に載り、isTileWall が塞いでいること (' + STAGE + ')');
    {
      const errs = [];
      const page = await bootPage(browser, base + Q, STAGE, errs);
      const p = await page.evaluate(PROBE_FN);
      baseProbe = p;
      console.log('[drv] probe ' + JSON.stringify({
        off: p.off, entries: p.entries, tiles: p.tiles.length, applied: p.applied,
        onWall: p.onWall, skipStart: p.skipStart, skipDoor: p.skipDoor,
        skipSpawn: p.skipSpawn, skipCorridor: p.skipCorridor,
        rects: p.rectsLoaded + '/' + p.rectsAll, free: p.free, freeWalkable: p.freeWalkable }));
      console.log('[drv] perEntry ' + JSON.stringify(p.perEntry));

      const idx = await httpGet(basePort, '/index.html');
      const exp = expectedTiles(idx, STAGE, p.mapW);
      console.log('[drv] expected(独立計算) ' + exp.keys.size + ' tiles ' + JSON.stringify(exp.per));

      check('(2a) 母集団: blocked を持つ絵が 1 枚以上ある', p.entries >= 1, 'entries=' + p.entries);
      check('(2b) 母集団: 塞いだマスが 1 つ以上ある', p.tiles.length > 0, 'tiles=' + p.tiles.length);
      check('(2c) ★塞いだマスは全部 isTileWall が true',
        p.tiles.length > 0 && p.wallAt.every(Boolean),
        'wall ' + p.wallAt.filter(Boolean).length + '/' + p.wallAt.length);
      /* ⭐ 独立計算との突き合わせ。実装の paintingBlockedTilesFor を 1 行も借りていない。
       *   ズレたぶんは「元から壁」+「門前ガードで弾いた」で**ちょうど**説明できるはず。 */
      const got = new Set(p.tiles);
      const notExpected = p.tiles.filter(k => !exp.keys.has(k));
      const skipped = p.onWall + p.skipStart + p.skipDoor + p.skipSpawn + p.skipCorridor;
      check('(2d) ★塞いだマスは独立計算した期待集合の部分集合 (1 マスもズレない)',
        notExpected.length === 0, '余分 ' + notExpected.length + ' 例:' + JSON.stringify(notExpected.slice(0, 5)));
      check('(2e) ★期待集合との差は「元から壁 + 門前ガード」でちょうど説明できる',
        exp.keys.size - got.size === skipped,
        '期待' + exp.keys.size + ' - 実測' + got.size + ' = ' + (exp.keys.size - got.size) + ' / 除外計 ' + skipped);
      /* ⚠ 「全部歩ける」ではなく「歩けないものは全部**別要因で説明できる**」で測る。
       *   1 枚絵の中には元から情景スプライト (瓦礫/線路) と扉が居るため。閾値は置かない。 */
      check('(2f) ★負のコントロール: マスクが # でない絵の内側は、情景/扉を除いて全部歩ける',
        p.free > 50 && p.free === p.freeWalkable + p.freeOther,
        '歩ける' + p.freeWalkable + ' + 情景/扉' + p.freeOther + ' = ' + p.free);
      check('(2g) ページエラー 0 件', errs.length === 0, errs.slice(0, 3).join(' | '));
      await page.close();
    }

    // ══ §3 ★目的 — 詰まないこと (6 シナリオ × ON/OFF のペア比較) ═════════════
    mark('§3 ★起点からボス/全部屋/全スポーンへ BFS が届くこと (6 シナリオ)');
    for (const th of THEMES) {
      const errs = [];
      const pOn = await bootPage(browser, base + Q, th, errs);
      const ron = await pOn.evaluate(REACH_FN);
      const pbOn = await pOn.evaluate(() => window.__paintBlockProbe().tiles.length);
      await pOn.close();
      const pOff = await bootPage(browser, base + Q + '&paintblock=0', th, errs);
      const roff = await pOff.evaluate(REACH_FN);
      await pOff.close();
      console.log('[drv] ' + th.padEnd(14) + ' blocked=' + pbOn + ' reached ' + ron.reached + '→(off)' +
                  roff.reached + ' rooms ' + ron.roomsHit + ' slots ' + ron.slotsOk);
      check('(3a:' + th + ') 起点が歩ける', ron.startWalkable === true, JSON.stringify(ron.start));
      check('(3b:' + th + ') ★全部屋に到達できる',
        ron.rooms.every(r => r.walk === 0 || r.hit > 0), JSON.stringify(ron.rooms));
      check('(3c:' + th + ') ★ボススロットに到達できる',
        ron.bossSlots.length > 0 && ron.bossSlots.every(s => s.ok), JSON.stringify(ron.bossSlots));
      /* ⭐ ペア比較。絶対値だと「元から到達できないタイル」があるマップで閾値が置けない。
       *   到達タイル総数は樽の上に立てなくなるので減ってよい。減ってはいけないのは
       *   **部屋・スポーン・ボスの到達可否**のほう。 */
      check('(3d:' + th + ') ★?paintblock=0 と到達可否が完全一致 (詰みを 1 つも増やしていない)',
        ron.roomsHit === roff.roomsHit && ron.slotsOk === roff.slotsOk,
        'on[' + ron.roomsHit + '|' + ron.slotsOk + '] off[' + roff.roomsHit + '|' + roff.slotsOk + ']');
      check('(3e:' + th + ') ページエラー 0 件', errs.length === 0, errs.slice(0, 2).join(' | '));
    }

    // ══ §4 門前ガード ═════════════════════════════════════════════════════════
    mark('§4 塞いではいけないマス (起点/扉/敵スポーン/廊下) を塞いでいないこと');
    {
      const p = baseProbe;
      const skipped = p.skipStart + p.skipDoor + p.skipSpawn + p.skipCorridor;
      if (MUTATE === 'blockstart' || MUTATE === 'blockstartnoguard') {
        /* ★positive control: 起点の行を丸ごと '#' にした配信。ガードが在れば
         *   skipStart / skipCorridor が立ち、盤面は詰まない (§3 が緑のまま)。
         *   ガードを外した blockstartnoguard では (4b)(4c) が落ち §3 も赤くなる。 */
        check('(4a) ★[変異' + MUTATE + '] 起点の行が実際にマスクへ載っている',
          p.perEntry.some(e => e.candidates >= 20), JSON.stringify(p.perEntry));
        check('(4b) ★[変異blockstart] 起点ガードが発火した', p.skipStart >= 1, 'skipStart=' + p.skipStart);
        check('(4c) ★[変異blockstart] 廊下ガードが発火した', p.skipCorridor >= 1, 'skipCorridor=' + p.skipCorridor);
      } else {
        check('(4a) ★現行のマスクは 1 マスも門前ガードに触れていない (絵とマスクが正しい)',
          skipped === 0,
          'start=' + p.skipStart + ' door=' + p.skipDoor + ' spawn=' + p.skipSpawn + ' corridor=' + p.skipCorridor);
        check('(4b) 装置: 門前ガードの計数欄が揃っている',
          typeof p.skipStart === 'number' && typeof p.skipDoor === 'number' &&
          typeof p.skipSpawn === 'number' && typeof p.skipCorridor === 'number', '');
        check('(4c) 奥の壁 2 行は「塞いだ」でなく「元から壁」に数えられている', p.onWall === 0,
          'onWall=' + p.onWall + ' (マスクが壁行に # を置いていなければ 0)');
      }
    }

    // ══ §5 撤退スイッチ ?paintblock=0 ════════════════════════════════════════
    mark('§5 ?paintblock=0 で P2 以前へ完全に戻ること');
    {
      const errs = [];
      const page = await bootPage(browser, base + Q + '&paintblock=0', STAGE, errs);
      const p = await page.evaluate(PROBE_FN);
      console.log('[drv] off probe ' + JSON.stringify({ off: p.off, entries: p.entries, tiles: p.tiles.length }));
      check('(5a) ?paintblock=0 が効いている', p.off === true, 'off=' + p.off);
      check('(5b) 1 マスも塞がない', p.tiles.length === 0 && p.entries === 0,
        'tiles=' + p.tiles.length + ' entries=' + p.entries);
      /* ⭐ 退避口の効き目は**歩ける集合のペア比較**で測る。「塞いだ 20 マスが全部歩けるか」で
       *   測ると、元から情景で塞がっているマスのぶんだけ落ちる (初回実測 19/20 = 測定器の赤)。
       *   正しい不変条件は 2 本:
       *     ① スイッチを切って歩けなくなるマスは 1 つも無い (A ⊆ B)
       *     ② スイッチを切って歩けるようになったマスは、全部**絵のマスクが塞いだマス**
       *   これなら情景/扉が何マス在っても閾値が要らない。 */
      const A = new Set(baseProbe.walkInPaint);
      const B = new Set(p.walkInPaint);
      const lost = baseProbe.walkInPaint.filter(k => !B.has(k));
      const gained = p.walkInPaint.filter(k => !A.has(k));
      const blockedSet = new Set(baseProbe.tiles);
      check('(5c) ★スイッチを切って歩けなくなるマスは 1 つも無い',
        lost.length === 0, '減った ' + lost.length + ' 例:' + JSON.stringify(lost.slice(0, 5)));
      check('(5d) ★歩けるようになったマスは全部「絵のマスクが塞いだマス」',
        gained.length > 0 && gained.every(k => blockedSet.has(k)),
        '増えた ' + gained.length + ' / うちマスク由来 ' + gained.filter(k => blockedSet.has(k)).length);
      check('(5e) ページエラー 0 件', errs.length === 0, errs.slice(0, 3).join(' | '));
      await page.close();
    }

    // ══ §6 画像の読み込みに依存しないこと ════════════════════════════════════
    mark('§6 ★絵の JPG が落ちても当たり判定は同じ (img.onload に依存しない)');
    {
      const errs = [];
      const page = await bootPage(browser, base + Q, STAGE, errs,
        { blockImages: /assets\/room_[^/]*\.(jpg|png)$/ });
      const p = await page.evaluate(PROBE_FN);
      console.log('[drv] noimg probe ' + JSON.stringify({
        entries: p.entries, tiles: p.tiles.length, rects: p.rectsLoaded + '/' + p.rectsAll }));
      check('(6a) 装置: 絵のロードを実際に止められている', p.rectsLoaded === 0 && p.rectsAll > 0,
        'loaded=' + p.rectsLoaded + '/' + p.rectsAll);
      check('(6b) ★絵が 1 枚も読めなくても塞ぐマスは同じ',
        JSON.stringify(p.tiles.slice().sort((a, b) => a - b)) ===
        JSON.stringify(baseProbe.tiles.slice().sort((a, b) => a - b)),
        'noimg=' + p.tiles.length + ' base=' + baseProbe.tiles.length);
      await page.close();
    }

    // ══ §7 lint (エディタの出発前チェック) が同じ判断をするか ═════════════════
    mark('§7 lint が壊れたマスク / 起点封鎖を知らせること');
    {
      const errs = [];
      const page = await bootPage(browser, base + Q, STAGE, errs);
      const L = await page.evaluate(LINT_FN);
      console.log('[drv] lint ' + JSON.stringify(L));
      check('(7a) ★寸法の合わないマスクは painting-blocked-broken で知らせる',
        L.broken.indexOf('painting-blocked-broken') >= 0, JSON.stringify(L.broken));
      check('(7b) ★負のコントロール: 正しいマスクでは鳴らない',
        L.good.indexOf('painting-blocked-broken') < 0, JSON.stringify(L.good));
      check('(7c) ★起点を塞ぐマスクは painting-blocks-start で知らせる',
        L.onStart.indexOf('painting-blocks-start') >= 0, JSON.stringify(L.onStart));
      /* ★mapDef 経路は**部屋の rect へ引き伸ばして**塞ぐ (絵と同じ変換)。ここは 4x4 の
       *  マスクを 14x20 の部屋へ写すので恒等写像ではない。期待値はドライバ側で手計算する:
       *    行 14→4 の割り当ては [3,4,3,4] (mask 行 0,1,2,3 が dest 3,4,3,4 行)
       *    列 20→4 の割り当ては [5,5,5,5]
       *    '#' は mask (r1,c1)(r1,c2)(r2,c1)(r2,c2) の 4 つ = dest 行 (4+3)=7 × 列 (5+5)=10 = 70 */
      check('(7d) mapDef 経路は部屋の rect へ引き伸ばして塞ぐ (4x4 → 14x20 で 70 マス)',
        L.tilesN === 70, 'n=' + L.tilesN);
      await page.close();
    }

    // ══ §8 分岐マップの全ノード (ノード用の絵へマスクを足したときの備え) ══════
    mark('§8 分岐マップの全ノードで盤面が詰まないこと (' + STAGE + ')');
    {
      const errs = [];
      /* ⚠⚠ **?graphtest=1 を付けないこと**。dev シームの内蔵テストグラフ (n0〜n5・絵なし)
       *   に差し替わり、n4/n7 の 1 枚絵を持つ**本番のシナリオグラフを 1 度も見ない**
       *   母集団になる (初回実測で踏んだ: 全ノード paints:[null] / rects:[])。 */
      const page = await bootPage(browser, base + '/index.html?diag=1', STAGE, errs);
      const W = await page.evaluate(NODE_WALK_FN, REACH_FN.toString());
      /* ★[2026-08-20 測定点の修正] 旧実装は `W.length >= 5` で「本番のグラフを見ている」
       *   を代用していたが、P8 で廃坑が 5 ノード → **2 大部屋**へ畳まった矬間に
       *   盤面は 1 マスも壊れていないのに赤くなった。**件数は手段であって目的ではない**ので、
       *   目的 =「ドライバが見ているのは dev のスタブでなく本番のシナリオグラフで、
       *   そのノードを 1 つ残らず組み直せた」を **entry と boss を含むか**で直接測る形へ言い直した。
       * ⚠ 期待値を「5 → 2」へ書き換える対処は取らない (次の畳み込みでまた側する)。 */
      const G = await page.evaluate(() => (typeof RUN === 'undefined' || !RUN) ? null : ({
        entry: RUN.graph.entry, boss: RUN.bossNodeId, ids: Object.keys(RUN.byId),
      }));
      if (!W) {
        check('(8a) 装置: 分岐マップ (RUN) が組めている', false, 'RUN=null');
      } else {
        console.log('[drv] nodes ' + JSON.stringify(W));
        console.log('[drv] graph ' + JSON.stringify(G));
        const ids = W.map(n => n.id);
        check('(8a) 装置: 本番のシナリオグラフを 1 ノード残らず組み直せた (entry と boss を含む)',
          !!G && W.length === G.ids.length && W.length >= 2 && W.every(n => !n.err) &&
          !!G.entry && ids.indexOf(G.entry) >= 0 && !!G.boss && ids.indexOf(G.boss) >= 0,
          'n=' + W.length + '/' + (G ? G.ids.length : '?') + ' entry=' + (G && G.entry) +
          ' boss=' + (G && G.boss) + ' err=' + JSON.stringify(W.filter(n => n.err).slice(0, 3)));
        check('(8b) ★全ノードで起点が歩け、全部屋に到達できる',
          W.every(n => n.err || (n.startWalkable && n.allRooms)),
          JSON.stringify(W.filter(n => !n.err && !(n.startWalkable && n.allRooms)).slice(0, 3)));
        /* ★ノード用の絵 (n4/n7) は「床だけ」の作法なので現状マスクを持たない。
         *  ここが 0 でなくなったら (8b) が本番の検出器として効き始める。 */
        console.log('[drv] node blocked tiles = ' + W.map(n => n.blocked).join(','));
        /* ⭐⭐ 分岐ノードは **mapDef 経路 (isCustom)** で貼らなければならない。false だと
         *  loadRoomPaintings の従来経路が効き、山場/ボスの絵 (key 1/2) が**絶対座標のまま**
         *  ノードへ貼られる = 別マップの絵とマスクが漏れてくる。ROOM_PAINTINGS_DEF の
         *  node:true と対になる不変条件で、P2 でマスクを足した今は当たり判定にも効く。 */
        check('(8c) ★全ノードが mapDef 経路 (isCustom) で絵を貼っている',
          W.every(n => n.err || n.isCustom === true),
          JSON.stringify(W.map(n => n.id + ':' + n.isCustom)));
        /* ⚠ ラベルに具体的なキー名 (n4/n7) を書かないこと。判定式は「ノード用 = /\/n\d+[a-z]*$/」で
         *   あって列挙ではないので、★P3 で n0 が増えても式は正しいままラベルだけが嘘になる
         *   (2026-08-17 に実際にそうなった)。測っているのは「旧単一マップ用の在庫
         *   (キー 1 / 2) がノードへ漏れていないこと」。
         * ★[#53 2026-09-05] 末尾に [a-z]* を足して **大部屋版のキー (n4big / n7big)** を通す。
         *   ⚠⚠ これは #53 が作った欠陥ではなく、**森の n7big (#11) が先に破っていた既存の齟齬**。
         *     --stage の既定が goblin-mine なので今日まで誰も踏んでいなかった。
         *     2026-09-05 に --stage bandits-forest と --stage lizard-swamp の**両方で赤を実見**
         *     してから広げた (⛔ 赤を見ずに正規表現を緩めない)。
         *   ⭐ 緩めすぎていないことの実測: n4big / n7big / n0 / n4 / n7 は通り、
         *     旧在庫 "1" / "2" と街道の "road_ambush" は**引き続き弾く**。 */
        check('(8d) ★ノードに貼られた絵はノード用 (キー n<番号>) だけ (山場/ボスの絵が漏れていない)',
          W.every(n => n.err || (n.paints || []).every(p => p === null || /\/n\d+[a-z]*$/.test(p))),
          JSON.stringify(W.map(n => n.id + ':' + JSON.stringify(n.paints))));
      }
      await page.close();
    }

  } catch (e) {
    console.error('[drv] 例外: ' + (e && e.stack || e));
    fail++; fails.push('例外: ' + (e && e.message || e));
  } finally {
    await browser.close().catch(() => {});
    servers.forEach(s => s.close());
  }

  console.log('\n════════════════════════════════════════');
  console.log('  PASS ' + pass + ' / FAIL ' + fail + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  if (fails.length) { console.log('  --- FAIL 一覧 ---'); fails.forEach(f => console.log('   ・' + f)); }
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})();
