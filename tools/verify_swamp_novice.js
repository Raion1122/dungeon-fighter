#!/usr/bin/env node
/*
 * verify_swamp_novice.js — 実装依頼書 #53「沼の参道を卓上マップへ + 若い蛇神司祭」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測り方の方針 (依頼書 §8)
 *   ⭐ **盤面の幾何は絵のマスクから直に / 分岐の結果は n7 の実スポーンから**測る。
 *     ⛔ 「実装の戻り値どうしを突き合わせる」形にしない (実装とドライバが同じ誤りを
 *        共有すると両方緑になる)。マスクは**配信した index.html を自前でパース**して組む。
 *   ⭐ 4 分岐は**本番の runNoviceDialog を通す**。showCharChoice と
 *     SkillCheck.resolveSkillCheck を差し替えて「どの枝を選んだか」「何回振ったか」を数える。
 *     ⚠ 差し替えが効くのは、どちらも**グローバル関数宣言 / window のオブジェクト**だから
 *       (2026-09-05 実測: showCharChoice / runNoviceDialog は window に載る。
 *        ROOM_PAINTINGS_DEF / sceneFlags / enemies は let/const なので載らないが、
 *        page.evaluate の中では**裸の識別子**として読める)。
 *
 * ■ 節
 *   §0 装置 (母集団の確認)  §1 盤面  §2 司祭  §3 報い  §4 恒等  §5 撤退
 *
 * ── 負のコントロール (--negative。配信をメモリ上で差し替える) ────────────────────
 *   density1 / nostart / flagonpriest / autoplayfirst / alwaysdrop / nullfalsy /
 *   anynode / oldn4 / maskrow / spawnonwall / sealoff / switchsplit / n4wipe / nonode
 *   ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと必ず空振り)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと「差し替わったか」の確認が効かない)。
 *
 * 使い方:
 *   node tools/verify_swamp_novice.js              # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_swamp_novice.js --negative   # 変異 14 本が期待どおり赤くなるか
 *   node tools/verify_swamp_novice.js --mutate nonode --port 9911
 * exit 0=期待どおり / 1=FAIL あり / 2=環境不足 / 3=変異の空振り・使い方の誤り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '9910'), 10);
const BASELINE_REV = arg('baseline-rev', 'cdaaf91');   // #53 着手前 (= #52 着地) の木
const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];

// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  // (1b) 絵の上に scenery が湧く
  density1: [['              rect: [3, 10, 23, 39], paint: "n4big", density: 0,',
              '              rect: [3, 10, 23, 39], paint: "n4big",   /* ★変異density1 */']],
  // (1c) 起点が既定 (36,13) に戻り、床保証がマスクへ穴を開ける
  nostart: [['              start: { tx: 12, ty: 13 },',
             '              /* ★変異nostart */']],
  // (0c)(2e) 罠 C の再現 — lizardPriest の def にフラグが立つ
  flagonpriest: [['        flavor: "ファラクサスを蛇神として崇める異教の祭祀",',
                  '        flavor: "ファラクサスを蛇神として崇める異教の祭祀", isSwampNovice: true,']],
  // (2a) 罠 D の再現 — 1 番目が判定つきの枝になる
  autoplayfirst: [['    const SWAMP_NOVICE_CHECKS = {',
                   '    const SWAMP_NOVICE_CHECKS = { 0: { check: "history", title: "歴史判定", classes: ["mage"], flavor: "★変異autoplayfirst" },']],
  // (3c) フラグを見ずに常に司祭を落とす
  alwaysdrop: [['      const swayed = sceneFlags.s3_novice_swayed;',
                '      const swayed = true;   /* ★変異alwaysdrop */']],
  // (3c) null を false と同じ扱いにする (未接触なのに護衛が増える)
  nullfalsy: [['      if (swayed === false) {',
               '      if (!swayed) {   /* ★変異nullfalsy */']],
  // (3e) ノードの門番を外す = 全ノードに報いが効く
  anynode: [['      if (nodeId !== "n7") return list;',
             '      /* ★変異anynode */']],
  // (1a2) 焼き上がりでない古い小さな絵を指す
  oldn4: [['        n4big: { src: "assets/room_lizard-swamp_n4_map.jpg",',
           '        n4big: { src: "assets/room_lizard-swamp_n4.jpg",']],
  // (0b) マスクの行数が tileBounds の高さと食い違う
  maskrow: [['               ".############################.",   // 19',
             '               /* ★変異maskrow */']],
  // (1d) 敵スポーンをマスクの '#' のマスへ移す
  spawnonwall: [['              slots: [[20, 12, "lizardRaider"], [21, 13, "lizardWarrior"],',
                 '              slots: [[20, 5, "lizardRaider"], [21, 13, "lizardWarrior"],']],
  // (1f2) 外周の封鎖が消える
  sealoff: [['             sealRing: true,   /* 外周 1 タイルを通行不能に = 歩ける「壁抜けの帯」を作らない */',
             '             /* ★変異sealoff */']],
  // (5a) 撤退スイッチがマップにだけ効き、司祭は旧盤面にも残る
  switchsplit: [['              slots: [[34, 13, "lizardRaider"], [35, 15, "lizardWarrior"],',
                 '              slots: [[34, 13, "swampNovice"], [35, 15, "lizardWarrior"],']],
  // (4a) 旧 n4 エントリを消す (撤退の行き先が消える)
  n4wipe: [['        n4: { src: "assets/room_lizard-swamp_n4.jpg", tileBounds: [11, 33, 16, 39], node: true },',
            '        /* ★変異n4wipe */']],
  // (1g) node: true を落とす (#52 の依頼書が実際に間違えた形)
  nonode: [['             tileBounds: [3, 10, 23, 39], node: true,      // 21 行 x 30 列。⚠ 行が先',
            '             tileBounds: [3, 10, 23, 39],   /* ★変異nonode */']],
};
/* 変異 → 赤くなるべき assert id。⚠ ここに書いた id が 1 本も赤くならなければ
 *   「負のコントロールが空振り」= ドライバの検出力が無いということなので exit 1。 */
const MUT_EXPECT = {
  density1:      ['1b'],
  /* ⚠ nostart は (1c) では捕まらない (既定の起点がこの絵ではマスク '.' の上に落ちるため)。
   *   実測で赤くなるのは (1c2) と (1e)。⛔ 期待を (1c) のままにすると空振りする。 */
  nostart:       ['1c2', '1e'],
  /* ⚠ (0c) は捕まえられない (実測 2026-09-05)。あちらは type==='swampNovice' を数えるので、
   *   lizardPriest にフラグが立っても件数は 1 のまま。実際に赤くなるのは
   *   (2e) 静的な検査と、(2d)(2d2) = **対話が別人 (n4 の lizardPriest) に当たる**ことによる失敗。 */
  flagonpriest:  ['2e', '2d'],
  autoplayfirst: ['2a'],
  alwaysdrop:    ['3c'],
  nullfalsy:     ['3c'],
  anynode:       ['3e'],
  oldn4:         ['1a2'],
  maskrow:       ['0b'],
  spawnonwall:   ['1d'],
  sealoff:       ['1f2'],
  switchsplit:   ['5a'],
  n4wipe:        ['4a'],
  nonode:        ['1g'],
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
//     借りると「実装が積んだものを実装の式で検算する」トートロジーになり永久に緑。
//   (パーサの作りは tools/driver_paint_blocked.js と同型。あちらは IIFE で即実行されるので
//    require で共有できず、同じ判断のもとで書き写している。)
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
/* -> { theme: { key: { bounds, node, rows, seal, src } } } */
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
/* SWAMP_NOVICE_CHECKS を配信テキストから独立に読む -> { "1": {check, classes[]}, … } */
function parseNoviceChecks(indexText) {
  const MARK = 'const SWAMP_NOVICE_CHECKS = {';
  const i = indexText.indexOf(MARK);
  if (i < 0) throw new Error('SWAMP_NOVICE_CHECKS が見つかりません');
  const body = stripComments(sliceBrace(indexText, i + MARK.length - 1));
  const out = {};
  const re = /(\d+)\s*:\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(body))) {
    const chk = /check\s*:\s*["']([\w]+)["']/.exec(m[2]);
    const cls = /classes\s*:\s*\[([^\]]*)\]/.exec(m[2]);
    out[m[1]] = {
      check: chk ? chk[1] : null,
      classes: cls ? (cls[1].match(/["']([\w]+)["']/g) || []).map(s => s.slice(1, -1)) : [],
    };
  }
  return out;
}
/* js/skill-check.js の CLASS_PROFICIENCIES を独立に読む -> { warrior: [...], … } */
function parseClassProficiencies(text) {
  const MARK = 'var CLASS_PROFICIENCIES = {';
  const i = text.indexOf(MARK);
  if (i < 0) throw new Error('CLASS_PROFICIENCIES が見つかりません');
  const body = stripComments(sliceBrace(text, i + MARK.length - 1));
  const out = {};
  const re = /([\w]+)\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body))) {
    out[m[1]] = (m[2].match(/["']([\w]+)["']/g) || []).map(s => s.slice(1, -1));
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ側の測定 (page.evaluate へ渡す関数は全部ここに置く)
// ══════════════════════════════════════════════════════════════════════════════
async function bootPage(browser, url, scen, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  /* ⚠ 404 は console だと本文が「Failed to load resource」だけで**どのファイルか分からない**。
   *   URL を別に拾う (2026-09-05: 素の実行で 1 件出たので原因を追えるようにした)。 */
  page.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()); });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* ノードを実プレイと同じ順序で組み、盤面を丸ごと写して返す。
 * ⚠⚠ buildNode(nd.mapDef) を直に呼ばない (MAPDEF.isCustom が付かず旧在庫の絵が貼られる)。 */
const SNAP_FN = (nodeId, flagVal) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  if (flagVal !== 'keep') sceneFlags.s3_novice_swayed = flagVal;
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty('right'); } catch (e) {}
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
  let gate = null;
  try { const g = nodeGateTile(md, 'right'); gate = g ? [g.tx, g.ty] : null; } catch (e) {}
  return {
    rect: rect, start: md.start || null,
    paint: room.painting ? room.painting.key : null,
    density: room.scenery ? room.scenery.density : null,
    slots: room.enemySlots || [], boss: room.bossSlot || null,
    spawns: (typeof ENEMY_SPAWNS !== 'undefined' ? ENEMY_SPAWNS : []).map(s => [s[0], s[1], s[2]]),
    enemies: enemies.map(e => ({ type: e.type, alive: !!e.alive, inactive: !!e.inactive,
                                 passiveNpc: !!e.passiveNpc, boss: !!e.isBoss,
                                 tx: Math.round(e.x / TILE_SIZE), ty: Math.round(e.y / TILE_SIZE) })),
    paintings: (typeof roomPaintings !== 'undefined' ? roomPaintings : []).map(p => ({
      src: (p.img && p.img.getAttribute('src')) || '', tx: p.tx, ty: p.ty, tw: p.tw, th: p.th, seal: !!p.sealRing })),
    sceneryInRect: (typeof sceneryPlacements !== 'undefined' && rect)
      ? sceneryPlacements.filter(s => s.ty >= rect[0] && s.ty <= rect[2] && s.tx >= rect[1] && s.tx <= rect[3]).length
      : null,
    walls: walls, gate: gate,
    outdoor: (typeof window.__outdoorRevealProbe === 'function') ? window.__outdoorRevealProbe() : null,
  };
};

/* 本番の runNoviceDialog を 1 回通す。choice を差し替え、判定結果を強制する。
 *   force: 'success' | 'fail' | null / choice: 0..3 | null(Esc) | 'autoplay' */
const DIALOG_FN = async (choice, force) => {
  const out = { calls: 0, err: null };
  const origChoice = window.showCharChoice;
  const origResolve = (window.SkillCheck && window.SkillCheck.resolveSkillCheck) || null;
  const origAutoplay = window.__autoplay;
  try {
    if (choice === 'autoplay') {
      window.__autoplay = true;                 // ★本番の showCharChoice に 0 を選ばせる
    } else {
      window.showCharChoice = function () { return Promise.resolve(choice); };
    }
    if (origResolve) {
      window.SkillCheck.resolveSkillCheck = function (checkKey, dc, party, opts) {
        out.calls++;
        out.lastCheck = checkKey; out.lastDc = dc;
        out.lastBonus = opts ? opts.extraBonus : null;
        return Promise.resolve(force === 'success'
          ? { success: true,  total: 99, dc: dc, rep: { name: 'テスト' } }
          : { success: false, total: 1,  dc: dc, rep: { name: 'テスト' } });
      };
    }
    await runNoviceDialog();
  } catch (e) {
    out.err = String(e && e.message || e);
  } finally {
    window.showCharChoice = origChoice;
    if (origResolve) window.SkillCheck.resolveSkillCheck = origResolve;
    window.__autoplay = origAutoplay;
  }
  const nv = enemies.filter(e => e && e.def && e.def.isSwampNovice)[0] || null;
  out.flag = sceneFlags.s3_novice_swayed;
  out.novice = nv ? { inactive: !!nv.inactive, passiveNpc: !!nv.passiveNpc, alive: !!nv.alive,
                      vfxOpacity: nv.vfxOpacity } : null;
  /* 司祭以外を全滅させて本番の isNodeSettled() を呼ぶ = 「クリアを止めない」の実測。
   * ⚠ 破壊的なのでこの評価の**最後**に置く。 */
  let killed = 0;
  for (const e of enemies) { if (e && e.def && !e.def.isSwampNovice && e.alive) { e.alive = false; e.hp = 0; killed++; } }
  out.settled = isNodeSettled();
  out.killed = killed;
  return out;
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

async function runSuite(browser, port, label) {
  const R = [];
  const errs = [];
  const check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, detail: detail || '' });
    console.log('  ' + (cond ? 'PASS' : 'FAIL') + ' (' + id + ') ' + name + (detail ? '  — ' + detail : ''));
  };
  const base = 'http://127.0.0.1:' + port;
  const indexText = await new Promise((res, rej) => {
    http.get(base + '/index.html', r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b).toString('utf8'))); }).on('error', rej);
  });
  const skillText = fs.readFileSync(path.join(ROOT, 'js', 'skill-check.js'), 'utf8');
  const cat = parsePaintings(indexText);
  const swamp = cat['lizard-swamp'] || {};
  const big = swamp.n4big || null;

  // ── §0 装置 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  const page = await bootPage(browser, base + '/index.html?diag=1', 'lizard-swamp', errs);
  const n4 = await page.evaluate(SNAP_FN, 'n4', null);
  const n7base = await page.evaluate(SNAP_FN, 'n7', null);
  const rectWH = n4.rect ? [n4.rect[2] - n4.rect[0] + 1, n4.rect[3] - n4.rect[1] + 1] : null;
  check('0a', '★装置: n4 に絵が 1 枚だけ貼られ、その部屋は 7x6 の骨格ではない (大部屋化が効いている盤面を見ている)',
    n4.paintings && n4.paintings.length === 1 && rectWH && !(rectWH[0] === 6 && rectWH[1] === 7),
    'paintings=' + (n4.paintings || []).length + ' rect=' + JSON.stringify(n4.rect) + ' (' + (rectWH || []).join('x') + ')');
  const th = big ? big.bounds[2] - big.bounds[0] + 1 : 0, tw = big ? big.bounds[3] - big.bounds[1] + 1 : 0;
  check('0b', '★装置: n4big のマスクを実体から引けて、寸法が tileBounds と一致する',
    !!big && Array.isArray(big.rows) && big.rows.length === th && big.rows.every(r => r.length === tw),
    big ? ('rows=' + (big.rows || []).length + '/' + th + ' 幅=' + Array.from(new Set((big.rows || []).map(r => r.length))).join(',') + '/' + tw) : 'n4big が無い');
  const novices = (n4.enemies || []).filter(e => e.type === 'swampNovice');
  check('0c', '★装置: n4 に swampNovice がちょうど 1 体、初期は inactive かつ passiveNpc',
    novices.length === 1 && novices[0].inactive === true && novices[0].passiveNpc === true,
    JSON.stringify(novices));
  const cnt = (arr, t) => arr.filter(x => x === t).length;
  const types = (s) => (s.enemies || []).map(e => e.type).sort();
  const n7types = types(n7base);
  check('0d', '★装置: n7 の素の顔ぶれが lizardWarrior 1 + lizardPriest 1 + ボス lizardChieftain (±1 の差が観測できる母集団)',
    cnt(n7types, 'lizardWarrior') === 1 && cnt(n7types, 'lizardPriest') === 1 && cnt(n7types, 'lizardChieftain') === 1,
    JSON.stringify(n7types));
  const seams = await page.evaluate(() => ({
    showCharChoice: typeof window.showCharChoice, runNoviceDialog: typeof window.runNoviceDialog,
    resolve: (window.SkillCheck ? typeof window.SkillCheck.resolveSkillCheck : 'n/a'),
  }));
  check('0e', '★装置: 4 分岐を踏むための差し替え口 (showCharChoice / resolveSkillCheck / runNoviceDialog) が実在する',
    seams.showCharChoice === 'function' && seams.runNoviceDialog === 'function' && seams.resolve === 'function',
    JSON.stringify(seams));

  // ── §1 盤面 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §1 盤面 (STEP1+2)');
  check('1a', 'rect と tileBounds が同値 (paintingAspectFits の完全一致要求)',
    !!big && JSON.stringify(n4.rect) === JSON.stringify(big.bounds),
    'rect=' + JSON.stringify(n4.rect) + ' tileBounds=' + JSON.stringify(big && big.bounds));
  const paintedSrc = (n4.paintings && n4.paintings[0]) ? n4.paintings[0].src : '';
  check('1a2', '貼られた絵が焼き上がりの 1 枚 (assets/room_lizard-swamp_n4_map.jpg)',
    /room_lizard-swamp_n4_map\.jpg/.test(paintedSrc), 'src=' + paintedSrc);
  check('1b', 'density が 0 で、絵の矩形の中に scenery が 1 つも湧いていない (2 経路)',
    n4.density === 0 && n4.sceneryInRect === 0,
    'density=' + n4.density + ' rect 内の scenery=' + n4.sceneryInRect);
  const maskAt = (tx, ty) => (big && big.rows && ty >= big.bounds[0] && ty <= big.bounds[2] &&
                              tx >= big.bounds[1] && tx <= big.bounds[3] && big.rows[ty - big.bounds[0]])
    ? big.rows[ty - big.bounds[0]][tx - big.bounds[1]] : null;
  check('1c', 'start が明示されており、そのタイルがマスクで "." (起点の床保証が穴を開けていない)',
    !!n4.start && maskAt(n4.start.tx, n4.start.ty) === '.',
    'start=' + JSON.stringify(n4.start) + ' マスク=' + maskAt(n4.start && n4.start.tx, n4.start && n4.start.ty));
  /* ⭐⭐ (1c) だけでは **start の指定漏れを捕まえられない**(2026-09-05 に負のコントロール
   *   nostart で実測)。既定の (36,13) はこの絵ではたまたまマスクが '.' なので穴が開かず、
   *   (1c) は緑のまま通る。⇒ 「入場口 + NODE_ENTRY_INSET と一致するか」を別に縛る。
   *   ⚠ 期待値はドライバ側で rect から独立に組む (実装の nodeGateTile を借りない)。 */
  const wantStart = n4.rect ? { tx: n4.rect[1] + 2, ty: Math.floor((n4.rect[0] + n4.rect[2]) / 2) } : null;
  check('1c2', 'start が入場口 (左辺の中点) + NODE_ENTRY_INSET(2) と一致する',
    !!n4.start && !!wantStart && n4.start.tx === wantStart.tx && n4.start.ty === wantStart.ty,
    'start=' + JSON.stringify(n4.start) + ' 期待=' + JSON.stringify(wantStart));
  const wallAt = (tx, ty) => (n4.walls && n4.rect && ty >= n4.rect[0] && ty <= n4.rect[2] && tx >= n4.rect[1] && tx <= n4.rect[3])
    ? n4.walls[ty - n4.rect[0]][tx - n4.rect[1]] : null;
  const badSpawn = (n4.slots || []).filter(s => maskAt(s[0], s[1]) !== '.' || wallAt(s[0], s[1]) !== '.');
  check('1d', '敵スポーンが全部マスクで "." かつ本番の isTileWall が false (2 経路)',
    badSpawn.length === 0, badSpawn.length ? JSON.stringify(badSpawn) : 'slots=' + (n4.slots || []).length + ' 件すべて床');
  const TILE = 96, ENGAGE = 672;
  const dists = (n4.slots || []).map(s => Math.hypot(s[0] - n4.start.tx, s[1] - n4.start.ty) * TILE);
  const minD = dists.length ? Math.min.apply(null, dists) : -1;
  check('1e', '入場地点から最寄りの敵まで 7 タイル (672px) 以上',
    minD >= ENGAGE, '最寄り=' + Math.round(minD) + 'px (' + (minD / TILE).toFixed(2) + ' タイル)');
  const from = [n4.start.ty - n4.rect[0], n4.start.tx - n4.rect[1]];
  const reach = bfs4(n4.walls, from);
  const unreachSlots = (n4.slots || []).filter(s => !reach.seen[s[1] - n4.rect[0]][s[0] - n4.rect[1]]);
  let walkTotal = 0; const isolated = [];
  for (let r = 0; r < n4.walls.length; r++) for (let c = 0; c < n4.walls[r].length; c++) {
    if (n4.walls[r][c] === '.') { walkTotal++; if (!reach.seen[r][c]) isolated.push([n4.rect[1] + c, n4.rect[0] + r]); }
  }
  /* ⚠ sealRing の門番は 4 方向の nodeGateTile を「出口」として残すので、rect の外周に
   *   最大 4 マスの到達不能な穴が残る (四方を塞がれた孤立点なので実害なし)。
   *   ⇒ 孤立が**その 4 マスだけ**であることまで縛る (0 は要求しない = 実装の性質)。 */
  const gateTiles = new Set();
  const midR = Math.floor((n4.rect[0] + n4.rect[2]) / 2), midC = Math.floor((n4.rect[1] + n4.rect[3]) / 2);
  gateTiles.add(midC + ',' + n4.rect[0]); gateTiles.add(midC + ',' + n4.rect[2]);
  gateTiles.add(n4.rect[1] + ',' + midR); gateTiles.add(n4.rect[3] + ',' + midR);
  const badIsolated = isolated.filter(t => !gateTiles.has(t[0] + ',' + t[1]));
  check('1f', '4 近傍 BFS で入場地点から全スポーンへ到達でき、孤立は sealRing がゲートとして残す縁のマスだけ',
    unreachSlots.length === 0 && badIsolated.length === 0,
    '歩ける=' + walkTotal + ' 到達=' + reach.n + ' 孤立=' + JSON.stringify(isolated) +
    (unreachSlots.length ? ' 到達不能スロット=' + JSON.stringify(unreachSlots) : ''));
  const ringOpen = [];
  for (let r = 0; r < n4.walls.length; r++) for (let c = 0; c < n4.walls[r].length; c++) {
    const onRing = (r === 0 || r === n4.walls.length - 1 || c === 0 || c === n4.walls[r].length - 1);
    if (!onRing || n4.walls[r][c] === '#') continue;
    const tx = n4.rect[1] + c, ty = n4.rect[0] + r;
    if (!gateTiles.has(tx + ',' + ty)) ringOpen.push([tx, ty]);
  }
  check('1f2', 'sealRing が効いている (外周でゲート以外に歩けるマスが無い)',
    ringOpen.length === 0, ringOpen.length ? '外周の穴=' + JSON.stringify(ringOpen) : '穴なし');
  await page.close();
  /* (1g) 従来経路 (非カスタム幾何 = 単一マップ) に n4big が漏れないこと。
   * ⚠ 測るのは手段ではなく「従来経路が走る状態で n4big が貼られない」。?graph=0 で落とす。 */
  const pageG = await bootPage(browser, base + '/index.html?diag=1&graph=0', 'lizard-swamp', errs);
  const legacy = await pageG.evaluate(() => ({
    active: !!(window.__graphRun && window.__graphRun.active && window.__graphRun.active()),
    srcs: (typeof roomPaintings !== 'undefined' ? roomPaintings : []).map(p => (p.img && p.img.getAttribute('src')) || ''),
  }));
  check('1g', '★node:true が効いている — 従来経路 (単一マップ) に n4big の絵が 1 枚も漏れない',
    legacy.active === false && !legacy.srcs.some(s => /room_lizard-swamp_n4_map\.jpg/.test(s)),
    'graph.active=' + legacy.active + ' 貼られた絵=' + JSON.stringify(legacy.srcs));
  await pageG.close();

  // ── §2 司祭 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §2 司祭 (STEP3)');
  const checks = parseNoviceChecks(indexText);
  const profs = parseClassProficiencies(skillText);
  const page2 = await bootPage(browser, base + '/index.html?diag=1', 'lizard-swamp', errs);
  await page2.evaluate(SNAP_FN, 'n4', null);
  const auto = await page2.evaluate(DIALOG_FN, 'autoplay', null);
  check('2a', '選択肢の 1 番目が判定なし (?autoplay が index 0 を引いても SkillCheck を 1 度も呼ばず、フラグも動かない)',
    auto.calls === 0 && auto.flag === null && !checks['0'],
    'resolve 呼び出し=' + auto.calls + ' flag=' + JSON.stringify(auto.flag) +
    ' 表に 0 番=' + (checks['0'] ? 'ある' : 'ない') + (auto.err ? ' err=' + auto.err : ''));
  const wantPairs = { history: 'mage', religion: 'cleric', intimidation: 'warrior' };
  const keys = Object.keys(checks).map(k => checks[k].check);
  const classesOk = Object.keys(checks).every(k => {
    const c = checks[k], cls = c.classes[0];
    return wantPairs[c.check] === cls && (profs[cls] || []).indexOf(c.check) >= 0;
  });
  const clsList = Object.keys(checks).map(k => checks[k].check + '→' + checks[k].classes.join('+'));
  check('2b', '判定 3 種が history/religion/intimidation で、得意クラスが mage/cleric/warrior と全部異なる (js/skill-check.js と突き合わせ)',
    keys.length === 3 && keys.slice().sort().join(',') === 'history,intimidation,religion' &&
    classesOk && new Set(Object.keys(checks).map(k => checks[k].classes[0])).size === 3,
    JSON.stringify(clsList));
  await page2.evaluate(SNAP_FN, 'n4', null);
  const passBy = await page2.evaluate(DIALOG_FN, 0, null);
  check('2c', '1 番目を選んでも司祭は passiveNpc のままで、司祭以外を倒せば isNodeSettled() が true (出口が出る)',
    passBy.novice && passBy.novice.passiveNpc === true && passBy.settled === true,
    JSON.stringify(passBy.novice) + ' settled=' + passBy.settled + ' 倒した数=' + passBy.killed);
  await page2.evaluate(SNAP_FN, 'n4', null);
  const failArm = await page2.evaluate(DIALOG_FN, 2, 'fail');
  check('2d', '判定に失敗すると司祭が inactive=false / passiveNpc=false になり、通常の敵として撃破対象に入る',
    failArm.novice && failArm.novice.inactive === false && failArm.novice.passiveNpc === false && failArm.flag === false,
    JSON.stringify(failArm.novice) + ' flag=' + JSON.stringify(failArm.flag) + ' calls=' + failArm.calls);
  await page2.evaluate(SNAP_FN, 'n4', null);
  const okArm = await page2.evaluate(DIALOG_FN, 1, 'success');
  check('2d2', '判定に成功すると s3_novice_swayed=true になり、司祭は passiveNpc のまま姿だけ消える',
    okArm.flag === true && okArm.novice && okArm.novice.passiveNpc === true && okArm.novice.vfxOpacity === '0',
    JSON.stringify(okArm.novice) + ' flag=' + JSON.stringify(okArm.flag));
  /* ★[#53 STEP3 の追加配線] 再入場の復元。sceneFlags から姿を作り直せているか。
   *   ⚠ 依頼書には無い配線なので、ここが唯一の検出器 (無いと「一度退かせた司祭が
   *     引き返すと立っている」に気づけない)。 */
  const reTrue = await page2.evaluate(SNAP_FN, 'n4', true);
  const nvTrue = await page2.evaluate(() => {
    const e = enemies.filter(x => x && x.def && x.def.isSwampNovice)[0];
    return e ? { inactive: !!e.inactive, passiveNpc: !!e.passiveNpc, vfxOpacity: e.vfxOpacity } : null;
  });
  check('2f', '再入場: s3_novice_swayed=true で n4 を組み直すと司祭は passiveNpc のまま姿が消えている',
    !!nvTrue && nvTrue.passiveNpc === true && nvTrue.vfxOpacity === '0',
    JSON.stringify(nvTrue) + ' 敵数=' + (reTrue.enemies || []).length);
  await page2.evaluate(SNAP_FN, 'n4', false);
  const nvFalse = await page2.evaluate(() => {
    const e = enemies.filter(x => x && x.def && x.def.isSwampNovice)[0];
    return e ? { inactive: !!e.inactive, passiveNpc: !!e.passiveNpc } : null;
  });
  check('2g', '再入場: s3_novice_swayed=false で n4 を組み直すと司祭は敵対のまま (inactive=false / passiveNpc=false)',
    !!nvFalse && nvFalse.inactive === false && nvFalse.passiveNpc === false, JSON.stringify(nvFalse));
  const priestFlag = /lizardPriest:\s*\{[\s\S]{0,900}?isSwampNovice/.test(indexText);
  check('2e', 'lizardPriest の def に isSwampNovice が立っていない (罠 C)',
    !priestFlag, priestFlag ? 'lizardPriest に isSwampNovice が付いている' : 'なし');
  await page2.close();

  // ── §3 報い ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §3 報い (STEP4)');
  const page3 = await bootPage(browser, base + '/index.html?diag=1', 'lizard-swamp', errs);
  const n7null = await page3.evaluate(SNAP_FN, 'n7', null);
  const n7true = await page3.evaluate(SNAP_FN, 'n7', true);
  const n7false = await page3.evaluate(SNAP_FN, 'n7', false);
  const n7null2 = await page3.evaluate(SNAP_FN, 'n7', null);
  check('3a', 's3_novice_swayed=true で n7 の lizardPriest が 0 体 (素は 1 体)',
    cnt(types(n7true), 'lizardPriest') === 0 && cnt(types(n7null), 'lizardPriest') === 1,
    '素=' + cnt(types(n7null), 'lizardPriest') + ' 説得後=' + cnt(types(n7true), 'lizardPriest'));
  check('3b', 's3_novice_swayed=false で n7 の lizardRaider が 1 体増える',
    cnt(types(n7false), 'lizardRaider') === cnt(types(n7null), 'lizardRaider') + 1,
    '素=' + cnt(types(n7null), 'lizardRaider') + ' 失敗後=' + cnt(types(n7false), 'lizardRaider'));
  check('3c', 's3_novice_swayed=null で n7 の顔ぶれが素と完全一致 (未接触を巻き込まない)',
    JSON.stringify(types(n7null)) === JSON.stringify(types(n7null2)) &&
    JSON.stringify(types(n7null)) !== JSON.stringify(types(n7true)) &&
    JSON.stringify(types(n7null)) !== JSON.stringify(types(n7false)),
    'null=' + JSON.stringify(types(n7null)) + ' / true=' + JSON.stringify(types(n7true)) +
    ' / false=' + JSON.stringify(types(n7false)));
  check('3d', 'ボス lizardChieftain はどの分岐でも必ず 1 体',
    [n7null, n7true, n7false].every(s => cnt(types(s), 'lizardChieftain') === 1),
    [n7null, n7true, n7false].map(s => cnt(types(s), 'lizardChieftain')).join('/'));
  /* (3e) 他ノード・他シナリオが 1 件も動いていないこと。
   * ⚠ 「差が出ないこと」を測るので、母集団 (どのノードを見たか) を必ず出す。 */
  const otherDiffs = [];
  let scanned = 0;
  const perScen = {};
  for (const sid of SCENS) {
    const p = sid === 'lizard-swamp' ? page3 : await bootPage(browser, base + '/index.html?diag=1', sid, errs);
    /* ⚠ RUN の形は { graph: {entry, nodes}, byId } (2026-09-05 実測)。RUN.nodes は存在しない。 */
    const ids = await p.evaluate(() => (typeof RUN !== 'undefined' && RUN && RUN.byId) ? Object.keys(RUN.byId) : []);
    for (const id of ids) {
      if (sid === 'lizard-swamp' && id === 'n7') continue;      // ここだけは変わってよい
      const a = await p.evaluate(SNAP_FN, id, null);
      const b = await p.evaluate(SNAP_FN, id, true);
      const c = await p.evaluate(SNAP_FN, id, false);
      scanned++; perScen[sid] = (perScen[sid] || 0) + 1;
      const sa = JSON.stringify(a.spawns), sb = JSON.stringify(b.spawns), sc = JSON.stringify(c.spawns);
      if (sa !== sb || sa !== sc) otherDiffs.push(sid + '/' + id + ' null=' + sa + ' true=' + sb + ' false=' + sc);
    }
    if (p !== page3) await p.close();
  }
  /* ⚠⚠ 母集団のガードは**実測してから**置く。初版は「40 ノード以上」と勘で書いて空振りした
   *   (実測 34 = 沼 7 + 廃坑 2 + 森 1 + 砦/神殿/竜巣 各 8。森と廃坑は畳まれている)。
   *   ⇒ 縛るのは「6 シナリオが 1 本残らず寄与していること」+ 実測に基づく下限。 */
  const scenCovered = SCENS.filter(sid => (perScen[sid] || 0) > 0).length;
  check('3e', 'n7 以外・沼地以外のノードのスポーンがフラグに依らず 1 件も変わらない',
    otherDiffs.length === 0 && scenCovered === SCENS.length && scanned >= 30,
    '見たノード=' + scanned + ' 内訳=' + JSON.stringify(perScen) +
    (otherDiffs.length ? ' 差分=' + JSON.stringify(otherDiffs.slice(0, 3)) : ''));

  // ── §4 恒等 (非退行) ───────────────────────────────────────────────────────
  console.log('\n[drv] §4 恒等 (非退行)');
  check('4a', '既存の小さい n4 が tileBounds [11,33,16,39] のまま残っている (撤退の行き先)',
    !!swamp.n4 && JSON.stringify(swamp.n4.bounds) === JSON.stringify([11, 33, 16, 39]),
    swamp.n4 ? JSON.stringify(swamp.n4.bounds) : 'n4 が無い');
  let baseCat = null, baseErr = null;
  try { baseCat = parsePaintings(execFileSync('git', ['show', BASELINE_REV + ':index.html'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8')); }
  catch (e) { baseErr = String(e && e.message || e); }
  const otherThemes = Object.keys(cat).filter(t => t !== 'lizard-swamp');
  const themeDiff = baseCat ? otherThemes.filter(t => JSON.stringify(cat[t]) !== JSON.stringify(baseCat[t])) : null;
  check('4b', '他 5 テーマの ROOM_PAINTINGS_DEF が着手前 (' + BASELINE_REV + ') と完全一致',
    !!baseCat && themeDiff.length === 0,
    baseErr ? ('baseline を読めない: ' + baseErr) : ('比較=' + otherThemes.length + ' テーマ' + (themeDiff && themeDiff.length ? ' 差分=' + themeDiff.join(',') : '')));
  let oldStock = 0;
  for (const t of Object.keys(cat)) for (const k of Object.keys(cat[t])) if (!cat[t][k].node) oldStock++;
  check('4c', '旧在庫 (node を持たないキー) の総数が 12 のまま', oldStock === 12, '実測=' + oldStock);

  // ── §5 撤退 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §5 撤退スイッチ ?swampmap=0');
  const pageR = await bootPage(browser, base + '/index.html?diag=1&swampmap=0', 'lizard-swamp', errs);
  const r4 = await pageR.evaluate(SNAP_FN, 'n4', null);
  const r7null = await pageR.evaluate(SNAP_FN, 'n7', null);
  const r7true = await pageR.evaluate(SNAP_FN, 'n7', true);
  const r7false = await pageR.evaluate(SNAP_FN, 'n7', false);
  const rNov = (r4.enemies || []).filter(e => e.type === 'swampNovice').length;
  check('5a', '?swampmap=0 で n4 が旧 7x6 / paint=n4 / 旧スロット 4 体に戻り、swampNovice が 0 体 (マップと司祭が同じ 1 本のスイッチ)',
    JSON.stringify(r4.rect) === JSON.stringify([11, 33, 16, 39]) && r4.paint === 'n4' &&
    (r4.slots || []).length === 4 && rNov === 0,
    'rect=' + JSON.stringify(r4.rect) + ' paint=' + r4.paint + ' slots=' + (r4.slots || []).length + ' 司祭=' + rNov);
  check('5b', '?swampmap=0 では n7 の顔ぶれがフラグに依らず素と一致 (報いも一緒に無効化される)',
    JSON.stringify(types(r7null)) === JSON.stringify(types(r7true)) &&
    JSON.stringify(types(r7null)) === JSON.stringify(types(r7false)),
    'null=' + JSON.stringify(types(r7null)) + ' true=' + JSON.stringify(types(r7true)) + ' false=' + JSON.stringify(types(r7false)));
  await pageR.close();
  await page3.close();

  return { results: R, errs: errs, outdoor: n4.outdoor };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_swamp_');
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
      const report = [];
      for (let i = 0; i < MUT_ORDER.length; i++) {
        const key = MUT_ORDER[i], port = PORT + 1 + i;
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
      console.log('[drv] 参考 (assert にしない): 屋外めくり = ' + JSON.stringify(run.outdoor));
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
