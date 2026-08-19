/*
 * driver_doors_p6.js — ★扉システム P6「隠し扉」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * P2〜P4 (driver_doors_p2) が「見える / 塞ぐ / 選ぶと開く」、P8 (driver_doors_p8) が
 * 「開けた扉は開いたまま」、P5 (driver_doors_p5) が「施錠は必ず突破される」を測る。
 * P6 は **hidden** = 「壁のふりをしている扉」を測る。
 *
 * 主張は 6 つ:
 *   ① 隠し扉の抽選は **mapDef.id + door id のハッシュ**で決まる決定論。同じノードを何度作り直しても
 *      同じ扉が隠れており、**Math.random を 1 度も引かない** (盤面の湧きと再現性を動かさない)。
 *      ⚠ seed に mapDef.id ("orc-fort/n0" 等) を使うのは、ノード id ("n0".."n7") が 6 シナリオで
 *        **共通**なので id だけで引くと全シナリオで同じ扉が隠れてしまうため。
 *   ② 隠してよい扉は「**行き先が行き止まり (exits 0 本) かつ kind !== "boss"**」だけ。
 *      行き止まりを切り離しても他ノードの到達性は 1 つも変わらない = グラフの形に依らず
 *      **ボスへの道は絶対に塞がらない** (P5 の「詰みを作らない」に対応する P6 の芯)。
 *   ③ **1 ノード最大 1 枚**。かつ全ノードで「選べる出口 (前進 or 引き返し)」が 1 本以上残る。
 *   ④ 未発見の隠し扉が立つ出口は**選択肢に出ない**(矢印もダイアログも)。
 *   ⑤ 発見は既存の「1 部屋 1 ロール」探索判定への**相乗り**。専用ロールを足さない。
 *      成功 → hidden が解ける (遷移先は施錠抽選どおり = 隠匿と施錠は直交)。失敗 → hidden のまま。
 *   ⑥ 結果は nodeState へ保存され、再入場で隠れ直さない / 失敗した部屋は振り直せない。
 *
 * ⚠ 「hidden は 1 画素も描かない」は **driver_doors_p2 の (2d)** が負のコントロール
 *   (showhidden) 付きで測っているので、ここでは重複させない。
 * ⚠ (1b)(1j)(1k) は舞台 1 本ぶんなので noleafguard では赤くならない (沼地は本道の抽選が外れる)。
 *   同じ主張を 6 シナリオへ広げた (7c)(7g)(7h) が負のコントロールを受け持つ = 実測済み。
 * ⚠ entry ノードで「最後の 1 本を隠さない」ガードは、現行 6 グラフでは
 *   **母集団が存在しない** (entry = n0 は必ず 3 出口)。よって負のコントロールを置いていない。
 *   グラフを足したときのための防御であり、ここで測れると偽らないこと。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port   | mutate        | 注入する欠陥                                   | 赤くなるべき節
 *   PORT   | (素)          | —                                              | —
 *   PORT+1 | nosecretroll  | 隠し扉の抽選を殺す (1 枚も隠れない)             | §1 (1a) §6 (6a) §7 (7a)
 *   PORT+2 | noleafguard   | 「行き止まりだけ」の制限を外す (本道も隠れる)    | §7 (7c)(7d)(7g)(7h)
 *   PORT+3 | nofilter      | hidden の出口を選択肢から落とさない             | §2 (2b)
 *   PORT+4 | nofind        | 探索判定に成功しても hidden を解かない          | §3 (3c)(3d)(3e) §4 (4c)
 *   PORT+5 | noorder       | 出口を見せる前の決着 (順序保証) を外す          | §5 (5b)
 *   PORT+6 | noexclude     | 隠し要素の間 (n6) の除外を外す                  | §1 (1l)(1c) §7 (7i)(7d)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_doors_p6.js
 *   node tools/driver_doors_p6.js --mutate noleafguard --headful
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
/* ⚠ ポートは既存ドライバと 7 以上空ける。本ドライバは PORT..PORT+6 の **7 本**を掴む
 *   (driver_doors_p2 = 9010..9016 / driver_doors_p8 = 9020..9024 / driver_doors_p5 = 9030..9035)。 */
const PORT = parseInt(arg('port', '9040'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
/* 舞台。⚠ 廃坑 (goblin-mine) は n1 が event でダイアログ待ちに入るので使わない
 *   (driver_doors_p2 / driver_doors_p5 / driver_doors_p8 / driver_graph_p7 と同じ判断)。
 * ⚠⚠ **他の扉ドライバと違って orc-fort を使えない**。あちらは施錠 (全ノードに母集団がある) を
 *   測るが、隠し扉の候補は 1 シナリオに 2 枚しか無く、orc-fort はその両方が外れて
 *   **隠し扉 0 枚**になる (n6 の除外で母集団が消えた。実測: 素の orc-fort は hidden 0/7)。
 *   沼地 (lizard-swamp) は n1→n5 が隠れるので §1/§6 の母集団が立つ。⚠ 起点 n0 側には隠し扉が
 *   無い舞台を選んでいる = §2〜§5 が「自分で 1 枚隠す」前提を邪魔されない。 */
const STAGE = 'lizard-swamp';
// 不変条件は 6 シナリオ全部で成り立たなければ意味が無い (§7)。
const ALL_SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
                   'orc-fort', 'undead-temple', 'dragon-lair'];
// 「塞ぐか」の契約。⚠ 実装の doorBlocks を読まず**ここに書き下す** (通すのは open と broken だけ)
const WANT_BLOCK = { closed: true, locked: true, open: false, broken: false, hidden: true };
// 抽選率。⚠ 実装の定数を読まずここに書き下す (実装が 0 に化けても気づける)
const WANT_HIDDEN_CHANCE = 0.5;
const WANT_LOCK_CHANCE = 0.25;
/* ★隠し扉を立てて**はいけない行き先**。n6 = 各シナリオの隠し要素の間 (残影の獣 / 沼の守護神 /
 *   古代王国の守護者 / 高位神官の霊 / 偽宝箱)。行き止まりなので規則上は隠せてしまうが、
 *   目玉コンテンツを知覚判定 1 回で丸ごと失う対価が大きすぎるため除外する (2026-08-15 決定)。
 * ⚠ kind では分けられない (n6 の kind はシナリオごとに違い、竜巣では n3 と同じ "loot")。 */
const WANT_NO_SECRET = ['n6'];

/* ★抽選の**契約をドライバ側で書き下す**。実装の doorHiddenByRng を呼んで比べると、
 *   実装が「1 枚も隠さない」に化けても両方同じ答えを返して緑になる。
 *   規則: mulberry32(hashStr(mapDefId + "/hidden/" + doorId))() < DOOR_HIDDEN_CHANCE  */
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
function wantHidden(mapDefId, doorId) {
  return mulberry32(hashStr(String(mapDefId) + '/hidden/' + doorId))() < WANT_HIDDEN_CHANCE;
}
// P5 の規則 (発見後の遷移先を予言するのに要る)。⚠ あちらは **plain な node id** で引く。
function wantLocked(nodeId, doorId) {
  return mulberry32(hashStr(String(nodeId) + '/lock/' + doorId))() < WANT_LOCK_CHANCE;
}

/* ★不変条件の突き合わせ。scan (実装が全ノードで作った扉 + グラフの形) を受け、
 *   ドライバ側の規則で「どの扉が隠れるべきか」を独立に計算して比べる。 */
function invariantCheck(scan) {
  const bad = { rule: [], leaf: [], maxone: [], stuck: [], block: [], excluded: [] };
  let nHidden = 0, nWouldHide = 0, nDoors = 0, nExcludable = 0;
  for (const n of scan.nodes) {
    const hid = n.doors.filter(d => d.state === 'hidden');
    nDoors += n.doors.length;
    nHidden += hid.length;
    if (hid.length > 1) bad.maxone.push(n.id + ':' + hid.length + '枚');
    for (const d of n.doors) {
      if (WANT_BLOCK[d.state] !== true) bad.block.push(n.id + '/' + d.id + ':' + d.state);
    }

    // dir → exit の対応 (実装と同じ「同じ dir の 2 本目は先着優先」)
    const exByDir = {}; const dirs = [];
    for (const e of n.exits) if (e.dir && !(e.dir in exByDir)) { exByDir[e.dir] = e; dirs.push(e.dir); }

    /* ドライバ側の規則で隠れるべき dir を 1 つだけ決める (実装と同じ順序・同じ先着 1 枚)。 */
    let wantDir = null;
    for (const dir of dirs) {
      const e = exByDir[dir];
      const hideable = e.toExits === 0 && e.toKind !== 'boss' &&
                       WANT_NO_SECRET.indexOf(e.to) < 0 &&
                       !(dirs.length <= 1 && !n.hasParent);
      if (!hideable) continue;
      if (!wantHidden(n.mapDefId, 'gate-' + dir)) continue;
      wantDir = dir; break;
    }
    if (wantDir) nWouldHide++;
    const gotDir = hid.length ? String(hid[0].id).replace(/^gate-/, '') : null;
    if ((wantDir || null) !== gotDir) {
      bad.rule.push(n.id + '(期待' + (wantDir || 'なし') + '/実際' + (gotDir || 'なし') + ')');
    }
    // 隠れているのは行き止まり (exits 0) かつ非ボス行きの扉だけか
    for (const d of hid) {
      const dir = String(d.id).replace(/^gate-/, '');
      const e = exByDir[dir];
      if (!e || e.toExits !== 0 || e.toKind === 'boss') {
        bad.leaf.push(n.id + '/' + d.id + '→' +
          (e ? e.to + '(出口' + e.toExits + '/' + e.toKind + ')' : '対応する出口なし'));
      }
      // ★隠し要素の間 (n6) は行き止まりだが**除外**されているはず
      if (e && WANT_NO_SECRET.indexOf(e.to) >= 0) bad.excluded.push(n.id + '/' + d.id + '→' + e.to);
    }
    /* ★除外の**母集団**: 「除外しなければ隠れる候補だった行き先」が実在するか。
     * ⚠ これを数えないと、n6 が行き止まりでなくなった日に bad.excluded が永久に空 = 永久に緑
     *   (母集団ガードの無い assert は仕様変更で黙って死ぬ)。 */
    for (const dir of dirs) {
      const e = exByDir[dir];
      if (WANT_NO_SECRET.indexOf(e.to) < 0) continue;
      if (e.toExits === 0 && e.toKind !== 'boss') nExcludable++;
    }
    // 選べる出口が 1 本以上残るか (前進が全部隠れるなら親へ引き返せなければならない)
    if (dirs.length - hid.length < 1 && !n.hasParent) bad.stuck.push(n.id);
  }

  /* ★★★真の不変条件 = 「**隠し扉を 1 枚も見つけられなかった**と仮定しても entry からボスへ
   *   到達できる」。⚠⚠ 上の bad.stuck (選べる出口が 1 本以上残る) では**足りない**ことを
   *   負のコントロール noleafguard が実測した: n1 の本道 (→n4) が隠れても「引き返す」が残るので
   *   stuck は緑のまま、しかしボスへは永久に行けない。手段 (出口の本数) ではなく
   *   **目的 (ボスに辿り着けるか)** を測るのが正しい言い直し。 */
  const byId = {};
  for (const n of scan.nodes) byId[n.id] = n;
  const bossIds = scan.nodes.filter(n => n.kind === 'boss').map(n => n.id);
  const reached = new Set(scan.entry ? [scan.entry] : []);
  const queue = scan.entry ? [scan.entry] : [];
  while (queue.length) {
    const cur = byId[queue.shift()];
    if (!cur) continue;
    const hiddenDirs = new Set(cur.doors.filter(d => d.state === 'hidden')
      .map(d => String(d.id).replace(/^gate-/, '')));
    for (const e of cur.exits) {
      if (e.dir && hiddenDirs.has(e.dir)) continue;      // 未発見の隠し扉 = その道は存在しない
      if (!reached.has(e.to)) { reached.add(e.to); queue.push(e.to); }
    }
  }
  const bossUnreachable = bossIds.filter(id => !reached.has(id));
  // 到達できなくなってよいのは**行き止まりノードだけ** (= ご褒美部屋を取り逃す、で済む)
  const lostNonLeaf = scan.nodes.filter(n => !reached.has(n.id) && (n.exits || []).length > 0)
    .map(n => n.id + '(出口' + n.exits.length + ')');
  const lost = scan.nodes.filter(n => !reached.has(n.id)).map(n => n.id);
  /* ★[2026-08-19] シナリオによっては隠し要素の間 (n6) そのものが存在しない
   *   (廃坑は n0 の出口を 1 本へ絞った際に n2/n3/n6 を撤去した)。
   *   → (7i) の母集団ガードが「6 シナリオ分あるはず」と直書きできなくなったので、
   *   **そのグラフが n6 を持っているか**をドライバ側で数えられるようにする。 */
  const nodeIds = scan.nodes.map(n => n.id);
  return { nHidden, nWouldHide, nDoors, nExcludable, bad, bossIds, bossUnreachable,
           lostNonLeaf, lost, nodeIds, entry: scan.entry || null, nReached: reached.size };
}

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  nosecretroll: [
      '      return makeNodeRng(seed)() < DOOR_HIDDEN_CHANCE;',
      '      return false;   /* ★変異nosecretroll */'],
  /* ⚠ 末尾コメントまで含めて 1 行を指定する (P5 の教訓: 素の 1 行は別の場所にも当たりうる)。 */
  noleafguard: [
      '      if ((to.exits || []).length !== 0) return false;   // ★行き止まりでなければ隠さない',
      '      /* ★変異noleafguard */'],
  nofilter: [
      '        if (doorHiddenAt(o.at.tx, o.at.ty)) continue;   // ★[P6] 未発見の隠し扉は出口ごと無いものとして扱う',
      '        /* ★変異nofilter */'],
  nofind: [
      '        if (setDoorState(d, next, currentNodeId)) found++;',
      '        found++;   /* ★変異nofind */'],
  noorder: [
      '        if (doorsForRender().some(d => d && d.state === "hidden")) await runRoomSearchCheck();',
      '        /* ★変異noorder */'],
  noexclude: [
      '      if (DOOR_SECRET_EXCLUDE_NODES.has(ex.to)) return false;   // ★隠し要素の間は塞がない',
      '      /* ★変異noexclude */'],
};
const MUT_ORDER = ['nosecretroll', 'noleafguard', 'nofilter', 'nofind', 'noorder', 'noexclude'];
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

/* ★グラフ全体を走査して「実装が作った扉」+「グラフの形」を採る。
 * ⚠⚠ 現在ノードだけ見ると空振りする (P5 の (1c)(1d) が実際に空振りしていた)。
 * ⚠ tx/ty は現在ノードの幾何で作られるので**読まない**。見るのは id と state だけ。 */
const SCAN_FN = () => {
  nodeBusy = true;
  /* ⚠ 起点は **RUN.graph.entry**。RUN 直下に entry は無い (RUN = {graph, byId, parent,
   *   bossNodeId, auto})。ここを間違えると到達性 BFS が空回りして (1j)(1k) が全ノード
   *   到達不能で真っ赤になる = 「不変条件が死んだ」ではなく「観測点がずれた」赤。 */
  const out = { entry: (RUN && RUN.graph && RUN.graph.entry) || null,
                bossNodeId: (RUN && RUN.bossNodeId) || null,
                nodes: [], cur: currentNodeId };
  if (!RUN) return out;
  for (const id of Object.keys(RUN.byId)) {
    rebuildNodeDoors(id);
    const nd = RUN.byId[id];
    out.nodes.push({
      id: id,
      mapDefId: (nd.mapDef && nd.mapDef.id) || null,
      kind: nd.kind || null,
      hasParent: !!(RUN.parent && RUN.parent[id]),
      exits: (nd.exits || []).map(e => ({
        to: e.to, dir: e.dir || null,
        toKind: (RUN.byId[e.to] || {}).kind || null,
        toExits: ((RUN.byId[e.to] || {}).exits || []).length,
      })),
      doors: doorsForRender().map(d => ({ id: d.id, state: d.state })),
    });
  }
  rebuildNodeDoors(currentNodeId);      // ★現在ノードへ戻す (測定器が盤面を汚さない)
  return out;
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 http://localhost:' + PORT +
              '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const profile = require('./_pptr_profile')('df_doors_p6_');
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

  // ── §1 抽選 (決定論・RNG 非消費・不変条件) ────────────────────────────────
  mark('§1 隠し扉の抽選と不変条件 (' + STAGE + ')');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', STAGE, errs);
    const scan = await page.evaluate(SCAN_FN);
    const D = await page.evaluate(() => {
      nodeBusy = true;
      const snap = () => doorsForRender().map(d => d.id + ':' + d.state).sort().join('|');
      const nodeId = currentNodeId;
      const a = snap();
      rebuildNodeDoors(nodeId); const b = snap();
      rebuildNodeDoors(nodeId); const c = snap();
      const real = Math.random;
      let calls = 0;
      Math.random = function () { calls++; return real.apply(Math, arguments); };
      try { for (const id of Object.keys(RUN.byId)) rebuildNodeDoors(id); }
      finally { Math.random = real; rebuildNodeDoors(nodeId); }
      const g = window.__graphRun;
      return { same: (a === b && b === c), snap: a, randomCalls: calls,
               chance: g.hiddenChance ? g.hiddenChance() : null,
               secretsOff: g.secretsOff ? g.secretsOff() : null };
    });
    for (const e of errs) errsAll.push('§1: ' + e);
    await page.close();

    const I = invariantCheck(scan);
    check('(1a) ★母集団ガード: グラフ全体に隠し扉が 1 枚以上立っている',
      I.nHidden >= 1 && I.nDoors >= 4,
      '扉 ' + I.nDoors + ' 枚中 hidden ' + I.nHidden + ' 枚 / ドライバの予言 ' + I.nWouldHide + ' 枚');
    check('(1b) ★★隠れているのは「行き止まり (出口 0 本) かつ非ボス」行きの扉だけ',
      I.bad.leaf.length === 0, I.bad.leaf.slice(0, 4).join(' ') || '違反なし');
    check('(1c) ★★抽選が mapDef.id + door id のハッシュで決まる (ドライバ側の規則と一致)',
      I.bad.rule.length === 0, I.bad.rule.slice(0, 4).join(' ') || '全ノード一致');
    check('(1d) ★1 ノードに隠し扉は最大 1 枚',
      I.bad.maxone.length === 0, I.bad.maxone.join(' ') || '違反なし');
    check('(1e) ★★全ノードで「選べる出口」が 1 本以上残る (詰みが原理的に無い)',
      I.bad.stuck.length === 0, I.bad.stuck.join(' ') || '詰むノードなし');
    check('(1f) ★どの扉も塞ぐ側から始まる (hidden も closed/locked と同じく塞ぐ = fail-safe)',
      I.bad.block.length === 0, I.bad.block.slice(0, 4).join(' ') || '全部 fail-safe');
    /* ⚠ 到達性 BFS は起点が取れていないと**全ノード到達不能**で真っ赤になる (観測点のずれ)。
     *   起点と到達数を条件に入れて、その赤を不変条件の赤と区別できるようにする。 */
    check('(1j) ★★★隠し扉を 1 枚も見つけられなくてもボスへ到達できる (詰みが原理的に無い)',
      !!I.entry && I.nReached >= 2 && I.bossIds.length === 1 && I.bossUnreachable.length === 0,
      '起点=' + I.entry + ' 到達 ' + I.nReached + '/' + scan.nodes.length +
      ' ボス=' + I.bossIds.join(',') + ' 到達不能ボス=' + (I.bossUnreachable.join(',') || 'なし'));
    check('(1k) ★★到達できなくなるのは行き止まりノードだけ (本道は 1 つも失われない)',
      I.lostNonLeaf.length === 0,
      '取り逃す=' + (I.lost.join(',') || 'なし') + ' / 本道の喪失=' + (I.lostNonLeaf.join(',') || 'なし'));
    check('(1l) ★★★隠し要素の間 (' + WANT_NO_SECRET.join(',') + ') には隠し扉が立たない (母集団 ' +
      I.nExcludable + ' 枚)',
      I.nExcludable >= 1 && I.bad.excluded.length === 0,
      I.bad.excluded.join(' ') || '違反なし');
    check('(1g) ★作り直しても同じ扉が隠れている (決定論)',
      D.same === true, '3 回の一致=' + D.same + ' / ' + D.snap);
    check('(1h) ★★抽選は Math.random を 1 度も引かない (盤面の湧きと再現性を動かさない)',
      D.randomCalls === 0, '全ノード再構築中の Math.random 呼び出し=' + D.randomCalls);
    check('(1i) 抽選率の定数が契約どおり (' + WANT_HIDDEN_CHANCE + ')',
      D.chance === WANT_HIDDEN_CHANCE, '実装=' + D.chance);
  }

  // ── §2 hidden の出口は選択肢に出ない ─────────────────────────────────────
  mark('§2 未発見の隠し扉は出口ごと消える');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', STAGE, errs);
    const X = await page.evaluate(() => {
      nodeBusy = true;
      const g = window.__graphRun;
      const before = g.exits().map(o => o.to);
      const fwd = g.exits().filter(o => !o.back);
      const target = fwd[0] || null;
      const d = target ? doorsForRender().find(x => x.tx === target.at.tx && x.ty === target.at.ty) : null;
      if (!d) return { before, nFwd: fwd.length, target: target ? target.to : null, d: null };
      const was = d.state;
      setDoorState(d, 'hidden');
      const whenHidden = g.exits().map(o => o.to);
      setDoorState(d, 'closed');
      const whenFound = g.exits().map(o => o.to);
      setDoorState(d, was);
      return { before, nFwd: fwd.length, target: target.to, d: { id: d.id },
               whenHidden, whenFound };
    });
    for (const e of errs) errsAll.push('§2: ' + e);
    await page.close();

    check('(2a) 母集団ガード: 前進出口が 2 本以上あり、その 1 本に扉が立っている',
      X.nFwd >= 2 && !!X.d, '前進出口=' + X.nFwd + ' 扉=' + (X.d ? X.d.id : 'なし'));
    check('(2b) ★★hidden の扉が立つ出口は選択肢に出ない (他の出口は 1 本も減らない)',
      !!X.d && X.whenHidden.indexOf(X.target) < 0 &&
      X.whenHidden.length === X.before.length - 1,
      '素=' + (X.before || []).join(',') + ' → hidden=' + (X.whenHidden || []).join(','));
    check('(2c) ★発見済み (closed) にすると出口が戻る',
      !!X.d && X.whenFound.join(',') === X.before.join(','),
      '発見後=' + (X.whenFound || []).join(','));
  }

  // ── §3 発見は「1 部屋 1 ロール」への相乗り ────────────────────────────────
  mark('§3 探索判定で発見する (専用ロールを足さない)');
  const searchProbe = async (ok) => {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', STAGE, errs);
    const R = await page.evaluate(async (ok) => {
      nodeBusy = true;
      gameStarted = true; gameOver = false;
      dialogPaused = false; skillCheckActive = false;
      encounterActive = false; encounterRunning = false;
      const g = window.__graphRun;
      const fwd = g.exits().filter(o => !o.back);
      const target = fwd[0] || null;
      const d = target ? doorsForRender().find(x => x.tx === target.at.tx && x.ty === target.at.ty) : null;
      if (!d) return { d: null };
      setDoorState(d, 'hidden');                 // ★この扉を必ず隠す (母集団を作る)
      const pTX = Math.floor((playerX + 48) / TILE_SIZE);
      const pTY = Math.floor((playerY + 58) / TILE_SIZE);
      const roomIdx = heroRoomIdx(pTX, pTY);
      const party = buildPerceptionParty().length;
      /* ★出目をドライバが決める。⚠ 実装の resolveSkillCheck を差し替えるのは「成功/失敗の
       *   2 経路を決定論で作る」ためだけで、期待値は node 側が独立に計算する。 */
      let calls = 0;
      const orig = SkillCheck.resolveSkillCheck;
      SkillCheck.resolveSkillCheck = function (key, dc) {
        calls++;
        return Promise.resolve({ roll: ok ? 20 : 1, total: ok ? 99 : -99, dc: dc,
                                 success: !!ok, crit: false, fumble: false,
                                 rep: { name: 'テスト', classKey: 'fighter', isHero: true } });
      };
      try { await runRoomSearchCheck(); }
      finally { SkillCheck.resolveSkillCheck = orig; }
      const after = doorsForRender().find(x => x.id === d.id) || {};
      return { d: { id: d.id }, nodeId: currentNodeId, roomIdx, party, calls,
               state: after.state || null, blocked: isTileWall(d.tx, d.ty),
               exits: g.exits().map(o => o.to), target: target.to,
               saved: ((nodeState[currentNodeId] || {}).doorStates || {})[d.id] || null,
               rolledKeys: roomSearchRolled.size };
    }, ok);
    for (const e of errs) errsAll.push('§3(' + (ok ? '成功' : '失敗') + '): ' + e);
    await page.close();
    return R;
  };
  {
    const F = await searchProbe(false);
    const S = await searchProbe(true);
    const wantNext = (S.d && S.nodeId) ? (wantLocked(S.nodeId, S.d.id) ? 'locked' : 'closed') : null;

    check('(3a) 母集団ガード: 部屋の中に居て・PT が居て・探索判定が**ちょうど 1 回**振られた',
      !!F.d && F.roomIdx >= 0 && F.party >= 1 && F.calls === 1 &&
      !!S.d && S.roomIdx >= 0 && S.party >= 1 && S.calls === 1,
      '失敗側 room=' + F.roomIdx + ' PT=' + F.party + ' ロール=' + F.calls +
      ' / 成功側 room=' + S.roomIdx + ' PT=' + S.party + ' ロール=' + S.calls);
    check('(3b) ★★探索判定に失敗すると隠れたまま (出口も出ない・塞いだまま)',
      F.state === 'hidden' && F.blocked === true && F.exits.indexOf(F.target) < 0,
      'state=' + F.state + ' 塞ぐ=' + F.blocked + ' 出口=' + (F.exits || []).join(','));
    check('(3c) ★★探索判定に成功すると隠れが解ける (遷移先は施錠抽選どおり)',
      S.state === wantNext && wantNext !== null,
      'state=' + S.state + ' 期待=' + wantNext);
    check('(3d) ★発見した扉の出口が選択肢に出る',
      S.exits.indexOf(S.target) >= 0, '出口=' + (S.exits || []).join(','));
    check('(3e) ★発見結果は nodeState へ保存される (書き込み点は setDoorState ただ 1 つ)',
      S.saved === wantNext, '保存=' + S.saved + ' 期待=' + wantNext);
    check('(3f) ★専用ロールを足していない (1 部屋 1 ロールのまま)',
      F.calls === 1 && S.calls === 1 && F.rolledKeys >= 1,
      '失敗側=' + F.calls + ' 回 / 成功側=' + S.calls + ' 回 / 検分済み部屋=' + F.rolledKeys);
  }

  // ── §4 再入場 (見つけたら隠れ直さない / 外したら振り直せない) ────────────────
  mark('§4 再入場での保存と再ロールの禁止');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', STAGE, errs);
    const R = await page.evaluate(async () => {
      nodeBusy = true;
      gameStarted = true; gameOver = false;
      dialogPaused = false; skillCheckActive = false;
      encounterActive = false; encounterRunning = false;
      const g = window.__graphRun;
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const home = currentNodeId;
      const fwd = g.exits().filter(o => !o.back);
      /* ★出ていく出口と、隠す扉は**別の扉**にする (隠した扉からは出られないので当然)。 */
      const leave = fwd[0] || null;
      const hideAt = fwd[1] || null;
      if (!leave || !hideAt) return { d: null };
      const d = doorsForRender().find(x => x.tx === hideAt.at.tx && x.ty === hideAt.at.ty);
      if (!d) return { d: null };
      let calls = 0;
      const orig = SkillCheck.resolveSkillCheck;
      const stub = (ok) => function (key, dc) {
        calls++;
        return Promise.resolve({ roll: ok ? 20 : 1, total: ok ? 99 : -99, dc: dc,
                                 success: !!ok, crit: false, fumble: false,
                                 rep: { name: 'テスト', classKey: 'fighter', isHero: true } });
      };
      const stateOf = () => (doorsForRender().find(x => x.id === d.id) || {}).state || null;
      // ① 隠して、探索判定を**失敗**させる
      setDoorState(d, 'hidden');
      SkillCheck.resolveSkillCheck = stub(false);
      await runRoomSearchCheck();
      const afterFail = stateOf();
      const callsAfterFail = calls;
      // ② 子へ出て戻る → もう一度振れるか (振れてはいけない)
      await g.enter(leave.to, leave.dir);
      const childId = currentNodeId;
      await g.enter(home, OPP[leave.dir]);
      nodeBusy = true; dialogPaused = false; skillCheckActive = false;
      encounterActive = false; encounterRunning = false;
      const onReturn = stateOf();
      SkillCheck.resolveSkillCheck = stub(true);      // ★成功させても振られてはいけない
      await runRoomSearchCheck();
      const afterReroll = stateOf();
      const callsAfterReroll = calls;
      // ③ 今度は本当に発見させ、子へ出て戻っても隠れ直さないことを見る
      const st = nodeState[home];
      if (st && st.doorStates) delete st.doorStates[d.id];   // 保存を消して素の hidden へ戻す
      const d2 = doorsForRender().find(x => x.id === d.id);
      setDoorState(d2, 'hidden');
      roomSearchRolled.clear();                              // ★検分済み印だけ消す (③ の前提作り)
      await runRoomSearchCheck();
      const afterFound = stateOf();
      await g.enter(leave.to, leave.dir);
      await g.enter(home, OPP[leave.dir]);
      const foundOnReturn = stateOf();
      SkillCheck.resolveSkillCheck = orig;
      return { d: { id: d.id }, home, childId, backId: currentNodeId,
               afterFail, callsAfterFail, onReturn, afterReroll, callsAfterReroll,
               afterFound, foundOnReturn };
    });
    for (const e of errs) errsAll.push('§4: ' + e);
    await page.close();

    check('(4a) 母集団ガード: 前進出口が 2 本あり、片方に扉を隠して片方から出入りできた',
      !!R.d && R.backId === R.home,
      '扉=' + (R.d ? R.d.id : 'なし') + ' 往復=' + R.home + '→' + R.childId + '→' + R.backId);
    check('(4b) ★★失敗した部屋は再入場でも振り直せない (往復すれば無限に引ける穴が無い)',
      R.afterFail === 'hidden' && R.onReturn === 'hidden' &&
      R.afterReroll === 'hidden' && R.callsAfterReroll === R.callsAfterFail,
      '失敗後=' + R.afterFail + ' 再入場=' + R.onReturn + ' 再ロール後=' + R.afterReroll +
      ' (ロール回数 ' + R.callsAfterFail + '→' + R.callsAfterReroll + ')');
    check('(4c) ★★一度見つけた隠し扉は再入場でも隠れ直さない',
      R.afterFound !== 'hidden' && R.foundOnReturn === R.afterFound && R.foundOnReturn !== null,
      '発見後=' + R.afterFound + ' 再入場=' + R.foundOnReturn);
  }

  // ── §5 出口を見せる前に決着している (順序保証) ────────────────────────────
  mark('§5 隠し扉は出口を見せる前に決着する');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', STAGE, errs);
    const O = await page.evaluate(async () => {
      gameStarted = true; gameOver = false; dungeonCleared = false;
      dialogPaused = false; skillCheckActive = false;
      encounterActive = false; encounterRunning = false;
      nodeBusy = false; heroForcedGoal = null;
      nodeGateReached = false; nodePendingExit = null; nodeChoiceCooldownUntil = 0;
      const g = window.__graphRun;
      const fwd = g.exits().filter(o => !o.back);
      const target = fwd[0] || null;
      const d = target ? doorsForRender().find(x => x.tx === target.at.tx && x.ty === target.at.ty) : null;
      if (!d) return { d: null };
      setDoorState(d, 'hidden');
      const origResolve = SkillCheck.resolveSkillCheck;
      SkillCheck.resolveSkillCheck = (key, dc) => Promise.resolve({
        roll: 20, total: 99, dc: dc, success: true, crit: false, fumble: false,
        rep: { name: 'テスト', classKey: 'fighter', isHero: true } });
      /* ★chooseExit を差し替えて「選択肢を組む瞬間の扉の状態」を覗く。
       * ⚠ classic script 直下の function 宣言は**再代入できる**グローバル束縛。 */
      const origChoose = chooseExit;
      const seen = [];
      chooseExit = async function (node) {
        seen.push({ states: doorsForRender().map(x => x.id + ':' + x.state),
                    tos: exitsWithReturn(node).map(o => o.to) });
        return null;                       // 選ばない (歩き出させない)
      };
      const settled = g.settled();
      try { await tickNodeChoice(); }
      finally { chooseExit = origChoose; SkillCheck.resolveSkillCheck = origResolve; }
      return { d: { id: d.id }, target: target.to, settled, seen };
    });
    for (const e of errs) errsAll.push('§5: ' + e);
    await page.close();

    const first = (O.seen && O.seen[0]) || null;
    check('(5a) 母集団ガード: ノードが片付いており、tickNodeChoice が選択肢の組み立てまで到達した',
      !!O.d && O.settled === true && !!first,
      '片付き=' + O.settled + ' 到達=' + (O.seen ? O.seen.length : 0) + ' 回');
    check('(5b) ★★出口を組む瞬間には隠し扉が既に決着している (見つけたのに入れない、が起きない)',
      !!first && first.states.every(s => s.indexOf(':hidden') < 0) &&
      first.tos.indexOf(O.target) >= 0,
      first ? '扉=' + first.states.join(' ') + ' 出口=' + first.tos.join(',') : '未到達');
  }

  // ── §6 退避スイッチ ?secret=0 ────────────────────────────────────────────
  mark('§6 退避スイッチ ?secret=0');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0&secret=0', STAGE, errs);
    const scan = await page.evaluate(SCAN_FN);
    const off = await page.evaluate(() =>
      (window.__graphRun.secretsOff ? window.__graphRun.secretsOff() : null));
    for (const e of errs) errsAll.push('§6: ' + e);
    await page.close();

    let nHidden = 0, nWould = 0, nDoors = 0;
    for (const n of scan.nodes) {
      nDoors += n.doors.length;
      nHidden += n.doors.filter(d => d.state === 'hidden').length;
      const exByDir = {}; const dirs = [];
      for (const e of n.exits) if (e.dir && !(e.dir in exByDir)) { exByDir[e.dir] = e; dirs.push(e.dir); }
      for (const dir of dirs) {
        const e = exByDir[dir];
        if (e.toExits !== 0 || e.toKind === 'boss') continue;
        if (dirs.length <= 1 && !n.hasParent) continue;
        if (wantHidden(n.mapDefId, 'gate-' + dir)) { nWould++; break; }
      }
    }
    // ⚠ 「素なら隠れるはずの扉」が 0 枚なら (6a) は空振り。母集団を必ず数えて条件に入れる。
    check('(6a) ★退避スイッチ ?secret=0 で隠し扉が 1 枚も立たない (母集団 ' + nWould + ' 枚)',
      nWould >= 1 && nDoors >= 4 && nHidden === 0,
      '扉 ' + nDoors + ' 枚 / hidden ' + nHidden + ' 枚');
    check('(6b) 装置: 実装側も切れていると答える (silent fail-open でない)',
      off === true, 'secretsOff=' + off);
  }

  // ── §7 6 シナリオ全ノードで不変条件が成り立つ ─────────────────────────────
  mark('§7 6 シナリオ全ノードで詰みが無い');
  {
    const rows = [];
    for (const scen of ALL_SCENS) {
      const errs = [];
      const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', scen, errs);
      const scan = await page.evaluate(SCAN_FN);
      for (const e of errs) errsAll.push('§7(' + scen + '): ' + e);
      await page.close();
      rows.push({ scen, scan, I: invariantCheck(scan) });
    }
    const totHidden = rows.reduce((a, r) => a + r.I.nHidden, 0);
    const totDoors = rows.reduce((a, r) => a + r.I.nDoors, 0);
    const badStuck = rows.filter(r => r.I.bad.stuck.length);
    const badLeaf = rows.filter(r => r.I.bad.leaf.length);
    const badRule = rows.filter(r => r.I.bad.rule.length);
    const badMax = rows.filter(r => r.I.bad.maxone.length);

    check('(7a) 母集団ガード: 6 シナリオ全部でグラフが読めて、合計 1 枚以上隠れている',
      rows.length === ALL_SCENS.length && rows.every(r => r.scan.nodes.length >= 4) && totHidden >= 1,
      rows.map(r => r.scen + ':' + r.I.nHidden + '/' + r.I.nDoors).join(' '));
    check('(7b) ★6 シナリオ全ノードで「選べる出口」が 1 本以上残る',
      badStuck.length === 0,
      badStuck.map(r => r.scen + ':' + r.I.bad.stuck.join(',')).join(' ') ||
      '詰むノードなし (扉 ' + totDoors + ' 枚)');
    const badBoss = rows.filter(r => r.I.bossIds.length !== 1 || r.I.bossUnreachable.length);
    const badLost = rows.filter(r => r.I.lostNonLeaf.length);
    check('(7g) ★★★6 シナリオ全部で、隠し扉を 1 枚も見つけられなくてもボスへ到達できる',
      badBoss.length === 0,
      badBoss.map(r => r.scen + ':ボス' + r.I.bossIds.join('+') + '→到達不能' +
        (r.I.bossUnreachable.join(',') || 'なし')).join(' ') ||
      rows.map(r => r.scen + ':' + r.I.bossIds.join('+')).join(' '));
    check('(7h) ★★6 シナリオ全部で、到達できなくなるのは行き止まりノードだけ',
      badLost.length === 0,
      badLost.map(r => r.scen + ':' + r.I.lostNonLeaf.join(',')).join(' ') ||
      rows.map(r => r.scen + ':' + (r.I.lost.join('+') || 'なし')).join(' '));
    const badExcl = rows.filter(r => r.I.bad.excluded.length);
    const totExcludable = rows.reduce((a, r) => a + r.I.nExcludable, 0);
    /* ★[2026-08-19] 旧ガードは `totExcludable >= ALL_SCENS.length` (= 6 シナリオが
     *   1 枚ずつ寄与する) だったが、廃坑から n6 が撤去され**母集団が仕様ごと消えた**。
     *   ⭐ 数字を 5 へ下げるのではなく **「n6 を持つシナリオすべて」と言い直す**。
     *     こうすると n6 を持つシナリオが増えても減っても自動で追従する。
     *   ⚠ 全部から n6 が消えた日に永久に緑にならないよう、「1 つ以上は持つ」も同時に見る。 */
    const scensWithSecret = rows.filter(r => (r.I.nodeIds || []).some(
      id => WANT_NO_SECRET.indexOf(id) >= 0)).length;
    check('(7i) ★★★隠し要素の間 (' + WANT_NO_SECRET.join(',') +
      ') を持つシナリオ全部で、そこが隠し扉で塞がれない (母集団 ' +
      scensWithSecret + ' シナリオ / 扉 ' + totExcludable + ' 枚)',
      scensWithSecret >= 1 && totExcludable >= scensWithSecret && badExcl.length === 0,
      badExcl.map(r => r.scen + ':' + r.I.bad.excluded.join(',')).join(' ') || '全シナリオで違反なし');
    check('(7c) ★★6 シナリオ全ノードで、隠れているのは行き止まり非ボス行きの扉だけ',
      badLeaf.length === 0,
      badLeaf.map(r => r.scen + ':' + r.I.bad.leaf.slice(0, 2).join(',')).join(' ') || '違反なし');
    check('(7d) ★6 シナリオ全ノードで抽選がドライバ側の規則と一致',
      badRule.length === 0,
      badRule.map(r => r.scen + ':' + r.I.bad.rule.slice(0, 2).join(',')).join(' ') || '全一致');
    check('(7e) ★6 シナリオ全ノードで隠し扉は最大 1 枚',
      badMax.length === 0,
      badMax.map(r => r.scen + ':' + r.I.bad.maxone.join(',')).join(' ') || '違反なし');
    /* ★シナリオごとに隠れる扉が違うこと = seed に mapDef.id を入れた理由そのもの。
     * ⚠ ノード id だけで引くと 6 シナリオで**同じ扉**が隠れる (P5 の施錠が実際にそうなっている)。 */
    const sig = rows.map(r => r.scan.nodes.map(n =>
      n.id + ':' + n.doors.filter(d => d.state === 'hidden').map(d => d.id).join('+')).join('|'));
    check('(7f) ★★隠れる扉がシナリオごとに違う (seed に mapDef.id が入っている証明)',
      new Set(sig).size >= 2, 'ユニークな配置=' + new Set(sig).size + '/' + sig.length);
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
