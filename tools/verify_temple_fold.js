#!/usr/bin/env node
/*
 * verify_temple_fold.js — 実装依頼書 #66「F3 神殿(undead-temple)を卓上マップ 2 枚へ畳む
 *   (旧タイプ小部屋 n0/n1/n2/n3/n5/n6 の廃止 → n4 儀式の広間 / n7 召喚の祭壇 の 2 ノード)」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測るのは 2 本柱 (依頼書 §8)
 *   ① 畳んだ神殿が**最後まで遊べる**こと   ② 隠し要素 (カエルム) が畳んでも**生きている**こと
 *
 * ■ 測り方の方針 (#62 / #63 の受入ドライバから継承)
 *   ⭐ **期待値はその場で導く**。移設した敵の顔ぶれは `?templefold=0` の n1+n2+n3+n4+n6 の
 *     合計から、ノード数は `buildUndeadTempleRun()` の戻り値から数える。
 *     ⛔ 体数・座標・ノード数・幾何 (rect / cells / period) を数字で焼き込まない
 *     (実装とドライバが同じ間違いを共有すると両方緑になる)。
 *   ⭐ 幾何は**本番の関数と定数だけ**を通す (nodeGateTile / isTileWall / aStar /
 *     isNodeSettled / NODE_ENTRY_INSET / CAELUM_TALK_RADIUS / TILE_SIZE /
 *     SNAP_X_OFFSET / SNAP_Y_OFFSET)。マスクは**配信した index.html を自前でパース**して
 *     組む (実装の paintingBlockedTilesFor は 1 行も借りない)。
 *
 * ■ ⛔ 依頼書 §8 のうち「そのままでは測れない / 弱すぎる」節は言い直してある
 *   (2b) … 「n4 の戦闘後 N 秒以内に caelumResolved === true」の **N 秒**は測れない
 *          (戦闘の終わりは非決定論で、しかも `caelumResolved` はノード遷移で false へ戻る
 *          = 1 秒ポーリングが取りこぼすと偽の赤になる)。⇒ **恒久的な痕跡**で測る:
 *          `localStorage["dragonfighters.templeBlessing"]` は caelumFriendlyRoute →
 *          grantTempleBlessing でしか立たず、そこへ至る道は tryApproachCaelum しかない。
 *          ⇒ 「**n4 に居る間に祝福が立った**」= 対話が n4 で発火した、と言い直す。
 *          ⭐ ポーリングが `caelumResolved` を捕まえられたときは**その node も併せて**見る。
 *   (3a) … 「全敵撃破後に isNodeSettled()」は、撃破の仕方を書かないと変異
 *          `caelumnopassive` を**素通しする**ことがある (passiveNpc を落とされた個体まで
 *          一緒に「撃破」してしまうと、どちらでも true になる)。⇒ **霊 (def.isNpcSpirit)
 *          以外を全部倒す**と言い直す (= autoplay の既定ルート「弔い」で実際に起きること)。
 *   (4b) … 「実走で罠と宝箱が 1 個以上」は **2 経路**で見る (本番の buildNode で組んだ盤面 +
 *          autoplay 走行の最初の観測)。片方だけだと湧き口の腐りに気づけない。
 *
 * ■ 節
 *   §0 装置 (母集団の確認)  §1 畳みの形  §2 カエルム  §3 クリアできること
 *   §4 罠と宝箱  §5 恒等 (非退行)  §6 撤退
 *
 * ── 負のコントロール (--negative。**配信をメモリ上で差し替える**。本番ファイルは無傷) ────
 *   caelumfar / caelumnopassive / noextraspawn / slotdrop / rectmismatch / densityone / foldalways
 *   ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に空振り)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと差し替わったか確認できない)。
 *   ⛔ 次の行は**アンカーに使わない** — 既存ドライバが逐語で握っている:
 *        sealRing: true,                                           (index.html に複数箇所)
 *        ? { "bandits-forest": { n7: ["search", "loot"] } }        (grid_s2 の nosearchkind)
 *        const FORT_FOLDED = !FORT_FOLD_OFF;                       (fort_fold の nofold)
 *        const SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF;   (swamp_fold の nofold/mapoff)
 *
 * 使い方:
 *   node tools/verify_temple_fold.js                # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_temple_fold.js --negative     # 変異 7 本 (port 10262〜10268) が赤くなるか
 *   node tools/verify_temple_fold.js --negative --only caelumfar
 *   node tools/verify_temple_fold.js --mutate slotdrop --port 10262
 *   node tools/verify_temple_fold.js --no-autoplay  # ⚠ 下見専用。(2b)(3b) は FAIL 扱いになる
 * ⚠ base ポートは **10261**。10241 は #65 / 10201 は #63 / 10181 は #62 が占有。
 *   ⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56 の実測)。10261 は goto 実測で健全。
 * ⚠⚠ このドライバを `timeout` コマンドで包まないこと (#64)。打ち切ると node が孤児として
 *   ポートを掴んだまま残り、次の起動が EADDRINUSE で即死する。
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足 / 3=変異アンカーの腐敗・使い方の誤り
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
const PORT = parseInt(arg('port', '10261'), 10);
const THEME = 'undead-temple';
const AP_SPEED = parseInt(arg('apspeed', '30'), 10);        // ?autoplay=N (index.html は 30 で頭打ち)
const AP_TIMEOUT_S = parseInt(arg('aptimeout', '260'), 10); // 実測の素の走行 = 171s
const NO_AP = flag('no-autoplay');
/* 恒等 (5a) の母集団。⚠ undead-temple は含めない (変えたのはそこだから)。 */
const OTHER_SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'dragon-lair'];
/* 畳んだ後に残るノード / 消えるノード。⚠ これは**契約**なのでドライバ側に書き下す
 *   (実装から読むと実装の誤りを一緒に信じてしまう)。 */
const KEEP_IDS = ['n4', 'n7'];
const DROP_IDS = ['n0', 'n1', 'n2', 'n3', 'n5', 'n6'];
/* 旧構成で n4 へ合流する側のノード。⭐ 期待値はここから**合計して導く** (写経しない)。
 *   n1 納骨堂 / n2 崩れた書庫 / n3 副葬品の間 / n4 儀式の広間 + n6 神官の墓所 (カエルム)。 */
const MERGED_FROM = ['n1', 'n2', 'n3', 'n4', 'n6'];
const BLESS_KEY = 'dragonfighters.templeBlessing';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* M1 ⭐⭐⭐ **本命** — カエルムを「絵に描かれた高位神官の墓所」(北東隅・絵ローカル
   *   col 24-26 / row 1-3) の中心へ置く = 出口 P6_RIGHT への横断路 (global row 13) から
   *   **5 タイル (480px)** 離れる。CAELUM_TALK_RADIUS は 150px = 1.56 タイルしかないので、
   *   隣接 1 タイルは届くが 2 タイルで既に届かない。⇒ §2 が赤くなるべき。
   *   ⚠ 移す先は**マスクが '.' のタイル**を選んである (絵に穴を開けて §1 (1c) を
   *     道連れにすると、何を検出したのか言えなくなる)。 */
  caelumfar: [['                      [37, 14, "caelum"],',
               '                      [36, 8, "caelum"],   /* ★変異caelumfar = 絵の墓所の中心へ */']],
  /* M2 initCaelum が passiveNpc を立てない = 砦の initGuardians と同じ形にする。
   *   inactive だけの敵が本道に立つと isNodeSettled() が永久 false = クリア不能。
   *   ⚠ `e.passiveNpc = true;` の行は initHydra と**逐語で同じ**なので使えない。
   *     カエルム側にしか無い「霊のふるい」の行を握り、その場で inactive と caelumIdx だけ
   *     立てて continue する (= passiveNpc と発光演出だけが落ちる)。⇒ §3 (3a) が赤くなるべき。 */
  caelumnopassive: [['        if (!e || !e.def || !e.def.isNpcSpirit) continue;',
                     '        if (!e || !e.def || !e.def.isNpcSpirit) continue; e.inactive = true; caelumIdx = ei; continue;   /* ★変異caelumnopassive */']],
  /* M3 兼務宣言から神殿の行を消す = 罠も玄室の宝箱も無言でゼロになる罠の再現 (森 #16)。 */
  noextraspawn: [['      if (TEMPLE_FOLDED) t["undead-temple"] = { n4: ["search", "loot"] };',
                  '      /* ★変異noextraspawn — 神殿の兼務宣言を落とす */']],
  /* M4 移設 7 体のうち 1 体 (旧 n2 の skeletonArcher) を落とす = 体数と種類の内訳が
   *   ?templefold=0 の合計と合わなくなる。⇒ §1 (1a) が赤くなるべき。 */
  slotdrop: [['           [21, 16, "zombie"], [20, 17, "skeletonArcher"],',
              '           [21, 16, "zombie"],   /* ★変異slotdrop = 旧 n2 の射手を落とす */']],
  /* M5 n4 の rect を 1 列狭める = ROOM_PAINTINGS_DEF の tileBounds と食い違う
   *   (paintingAspectFits は縦横比の完全一致を要求する)。⇒ §1 (1b) が赤くなるべき。 */
  rectmismatch: [['              rect: [5, 12, 22, 39], paint: "n4big", density: 0,',
                  '              rect: [5, 13, 22, 39], paint: "n4big", density: 0,   /* ★変異rectmismatch */']],
  /* M6 density の 0 を `|| 1` で握り潰す = 既に描き込まれた絵の上へ scenery が湧く。
   *   ⚠ ここは buildP6Run の共通骨格なので森・沼・砦にも効くが、負のコントロールとしては正しい
   *     (n4 の rect 行は rectmismatch が握っているので、同じ行を 2 本で共有しない)。 */
  densityone: [['                                  density: d.density, start: d.start }),',
                '                                  density: d.density || 1, start: d.start }),   /* ★変異densityone */']],
  /* M7 ?templefold=0 でも畳む = 撤退スイッチが死ぬ。⇒ §6 が赤くなるべき。
   *   ⭐ `if (!TEMPLE_FOLDED) return run;` を潰す形は採らない — それだと旧構成の小部屋を
   *     2 ノードへ畳んだ中間物が返り、(6b)「n4 の slots が旧構成のまま」が**緑のまま**になる。 */
  foldalways: [['    const TEMPLE_FOLDED = !TEMPLE_FOLD_OFF;',
                '    const TEMPLE_FOLDED = true;   /* ★変異foldalways */']],
};
/* 変異 → 赤くなるべき assert id。
 * ⚠⚠⚠ 机上で書かない。1 本ずつ実走して**実際に赤くなった id** を書く (#57 の教訓)。
 * ── 2026-09-12 の実走 (素 24/24 / 7 変異とも検出) で赤くなった集合。爆風の広さも残す ───
 *   caelumfar       … 2c 2b                     (2 本。⭐ 依頼書 §8 の表どおり「(2b)(2c)」
 *                                                 = 絵の墓所へ置くと autoplay で祝福が
 *                                                 1 度も立たない。走行は 136.8s で完走した)
 *   caelumnopassive … 2a 2d 3a 2b 3b            (5 本。⭐⭐⭐ n4 が settled にならず
 *                                                 **260s の上限まで n4 から出られない**
 *                                                 = 砦の守護者と同じ詰みが再現する)
 *   noextraspawn    … 4a 4b                     (2 本)
 *   slotdrop        … 1a 6b                     (2 本)
 *   rectmismatch    … 0d 1b 1d                  (3 本。lint の縦横比 warning も道連れになる)
 *   densityone      … 1d                        (1 本 ⭐ 最も鋭い)
 *   foldalways      … 1d 2d 4b 6a 6b 6c 6d      (7 本 = §6 が丸ごと落ちる)
 * ⭐ densityone が 1d だけ / noextraspawn が §4 だけ / slotdrop が 1a 起点
 *   = **節が分離している**証拠 (1 つの変異が全部を赤くする「爆風だけの装置」ではない)。 */
const MUT_EXPECT = {
  caelumfar:       ['2c'],
  caelumnopassive: ['3a'],
  noextraspawn:    ['4a'],
  slotdrop:        ['1a'],
  rectmismatch:    ['1b'],
  densityone:      ['1d'],
  foldalways:      ['6a'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}

/* ── (0b) 起動時のアンカー検算 ─────────────────────────────────────────────────
 * ⭐ #65 が踏んだ「偽の EXIT=3」の再発防止 = **手つかずの原本**に対して数える
 *   (変異後のバッファを数えると、同じ行を共有する 2 本目が偽の腐敗に見える #56 の罠)。
 * ⛔ 1 つでも 1 箇所でなければ **exit 3**。素の assert を 1 本も走らせないまま
 *   「赤くならなかった」と報告するのが最悪の結果。 */
function anchorAudit() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const rows = [];
  for (const key of MUT_ORDER) {
    for (const pair of MUTATIONS[key]) {
      const from = pair[0], to = pair[1];
      rows.push({
        key: key,
        n: src.split(from).length - 1,
        multiline: from.indexOf('\n') >= 0,
        sameLen: from.length === to.length,
        head: from.trim().slice(0, 56),
      });
    }
  }
  return rows;
}
const ANCHORS = anchorAudit();
{
  const bad = ANCHORS.filter(r => r.n !== 1 || r.multiline || r.sameLen);
  console.log('[drv] §0b 変異アンカーの検算 (原本 index.html):');
  for (const r of ANCHORS) {
    console.log('   ' + (r.n === 1 && !r.multiline && !r.sameLen ? 'OK ' : '⛔ ') +
      r.key + '  一致 ' + r.n + ' 箇所' +
      (r.multiline ? ' / ⛔複数行' : '') + (r.sameLen ? ' / ⛔置換前後が同長' : '') +
      '   ' + JSON.stringify(r.head));
  }
  if (bad.length) {
    console.error('[drv] ⛔ 変異アンカーが ' + bad.length + ' 本腐っている (' +
      bad.map(r => r.key).join(',') + ') → 負のコントロールが空振りする');
    process.exit(3);
  }
}

const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  /* ⚠ 変異ごとに**原本**を読み直す (#56 の教訓)。 */
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const pair of MUTATIONS[key]) {
    const from = pair[0], to = pair[1];
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' (同 tag の先行変異に食われた可能性): ' + JSON.stringify(from.slice(0, 90)));
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
  /* ⚠⚠⚠ (0d) で使う。**必ず m.type() で絞る** —
   *   `[graph] 分岐グラフで起動します` は console.log の**成功行**なので、
   *   語で拾うと素で必ず赤くなる (#62 が実際に踏んだ)。 */
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') errs.push(t.toUpperCase() + ' ' + m.text());
  });
  page.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()); });
  await page.evaluateOnNewDocument((sid, bkey) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    try { localStorage.removeItem(bkey); } catch (e) {}
  }, scen, BLESS_KEY);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* グラフの姿。⭐ RUN (起動時に組まれた物) / buildScenarioRun (その場で呼び直した物) /
 *   buildUndeadTempleRun (畳みの本体そのもの) の **3 経路**を返すので、
 *   ドライバはノード数も id も写経しなくてよい (依頼書 §8 (0a))。 */
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
    /* ★2 経路目 = buildScenarioRun をその場で呼び直す */
    try {
      const g2 = buildScenarioRun(theme);
      out.fresh = g2 ? { entry: g2.entry, ids: g2.nodes.map(n => n.id),
                         kinds: g2.nodes.map(n => n.kind) } : null;
    } catch (e) { out.fresh = { err: String(e && e.message || e) }; }
    /* ★3 経路目 = 畳みの本体 buildUndeadTempleRun() の戻り値 (依頼書 §8 (0a) の指定) */
    try {
      const g3 = buildUndeadTempleRun();
      out.direct = g3 ? { entry: g3.entry, ids: g3.nodes.map(n => n.id),
                          kinds: g3.nodes.map(n => n.kind) } : null;
    } catch (e) { out.direct = { err: String(e && e.message || e) }; }
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
    out.hasTempleKinds = (typeof NODE_EXTRA_SPAWN_KINDS !== 'undefined')
      ? Object.prototype.hasOwnProperty.call(NODE_EXTRA_SPAWN_KINDS, 'undead-temple') : null;
    out.opts = (window.__graphRun && R && R.byId[currentNodeId])
      ? window.__graphRun.exits().map(o => ({ to: o.to, dir: o.dir, back: !!o.back })) : null;
    /* 幾何の物差しは**本番の定数**から取る (⛔ 150px / 96px / 2 を写経しない) */
    const rd = (f) => { try { const v = f(); return v === undefined ? null : v; } catch (e) { return 'UNREADABLE'; } };
    out.tile    = rd(() => TILE_SIZE);
    out.detect  = rd(() => DETECTION_RANGE);
    out.inset   = rd(() => NODE_ENTRY_INSET);
    out.radius  = rd(() => CAELUM_TALK_RADIUS);
    out.snapX   = rd(() => SNAP_X_OFFSET);
    out.snapY   = rd(() => SNAP_Y_OFFSET);
    out.folded  = rd(() => TEMPLE_FOLDED);
    out.foldOff = rd(() => TEMPLE_FOLD_OFF);
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
    /* ★入場地点は「**パーティが実際に立っているタイル**」。 */
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
      passiveNpc: !!e.passiveNpc, spirit: !!(e.def && e.def.isNpcSpirit),
      boss: !!(e.def && e.def.isBoss),
      tx: Math.floor((e.x + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE),
      ty: Math.floor((e.y + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE) })),
    walls: walls,
  };
};

/* ★(3a) 「霊以外を全部倒したら isNodeSettled() が true になるか」。
 * ⚠ 倒す対象を「passiveNpc でない敵」にすると、変異 caelumnopassive を**素通ししうる**
 *   (passiveNpc を落とされた個体まで一緒に倒してしまうと、どちらでも true になる)。
 *   ⇒ **def.isNpcSpirit 以外**を倒す = autoplay の既定ルート「弔い」で実際に起きること。
 * ⚠ alive を落とすだけなので coin/weapon/armorVisible は立たない
 *   = findNearestDrop() は null のまま (isNodeSettled の第 2 条件を人工的に満たさない)。 */
const SETTLE_FN = (nodeId) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty('right'); } catch (e) {}
  const before = isNodeSettled();
  const killed = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.def && e.def.isNpcSpirit) continue;     // 霊は倒さない (弔いルート)
    e.alive = false; killed.push(e.type);
  }
  const after = isNodeSettled();
  return {
    before: before, after: after, killed: killed.length,
    left: enemies.filter(e => e.alive).map(e => ({ type: e.type, inactive: !!e.inactive,
      passiveNpc: !!e.passiveNpc, spirit: !!(e.def && e.def.isNpcSpirit) })),
    drop: (typeof findNearestDrop === 'function') ? !!findNearestDrop() : null,
  };
};

/* ★(2c) カエルムと「出口 P6_RIGHT への経路」の距離。
 * ⭐ 経路は**本番の aStar (4 近傍)**。⛔ 自前 BFS を「本番の経路探索」と呼ばない。
 * ⭐ 距離の式は tryApproachCaelum の式そのまま:
 *     主人公の中心 = (playerX + 48, playerY + 58) / 霊の中心 = (e.x + ds/2, e.y + ds/2)
 *   主人公がタイル (tx,ty) に立ったときの playerX/Y は SNAP_X/Y_OFFSET + tx*TILE。 */
const CAELUM_GEO_FN = (nodeId) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty('right'); } catch (e) {}
  const md = RUN.byId[nodeId].mapDef;
  const spirits = enemies.filter(e => e.def && e.def.isNpcSpirit);
  if (spirits.length !== 1) return { err: 'spirits=' + spirits.length };
  const sp = spirits[0];
  const ds = sp.def.displaySize || TILE_SIZE;
  const ecx = sp.x + ds / 2, ecy = sp.y + ds / 2;
  const hero = { tx: Math.round((playerX - SNAP_X_OFFSET) / TILE_SIZE),
                 ty: Math.round((playerY - SNAP_Y_OFFSET) / TILE_SIZE) };
  let gate = null;
  try { const g = nodeGateTile(md, 'right'); gate = [g.tx, g.ty]; } catch (e) {}
  const ex = RUN.byId[nodeId].exits.find(e => (e.dir || '') === 'right');
  const at = ex ? ex.at.slice() : null;
  let p = gate ? aStar(hero.tx, hero.ty, gate[0], gate[1]) : null;
  let via = 'gate';
  /* ⚠⚠⚠ 出口タイルには**閉じた扉** (doorsForRender の "gate-right") が立っており、
   *   isTileWall がそれを壁と読むので aStar は素で null を返す (2026-09-12 実測)。
   *   ⇒ 扉の**手前**まで測り、扉のタイル自身を経路の末尾へ足す
   *   (実プレイでも主人公は扉の手前まで歩き、開けてから踏み越える)。 */
  if (!Array.isArray(p) && gate) {
    for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const q = aStar(hero.tx, hero.ty, gate[0] + d[0], gate[1] + d[1]);
      if (Array.isArray(q)) { p = q.concat([{ tx: gate[0], ty: gate[1] }]); via = 'door-front'; break; }
    }
  }
  if (!Array.isArray(p)) return { err: 'aStar=null (扉の手前も届かない)', hero: hero, gate: gate };
  const doors = (typeof doorsForRender === 'function' ? doorsForRender() : [])
    .map(d => d.id + '@' + d.tx + ',' + d.ty + ':' + d.state);
  const tiles = [[hero.tx, hero.ty]].concat(p.map(q => [q.tx, q.ty]));
  let best = Infinity, bestTile = null;
  for (const t of tiles) {
    const pCX = SNAP_X_OFFSET + t[0] * TILE_SIZE + 48;
    const pCY = SNAP_Y_OFFSET + t[1] * TILE_SIZE + 58;
    const d = Math.hypot(pCX - ecx, pCY - ecy);
    if (d < best) { best = d; bestTile = t; }
  }
  return { hero: hero, gate: gate, at: at, steps: tiles.length, via: via, doors: doors,
           spiritTile: [Math.floor(ecx / TILE_SIZE), Math.floor(ecy / TILE_SIZE)],
           min: +best.toFixed(1), minTile: bestTile, radius: CAELUM_TALK_RADIUS, ds: ds };
};

/* ★(3c) 歩ける床がひとつながりか。
 * ⭐ 壁の判定は**本番の isTileWall**。連結の歩き回りだけドライバ側 (4 近傍)。
 *   ⛔ 斜めを許さない = 本番の aStar と同じ近傍 (許すと孤立を見落とす)。 */
const FLOOR_FN = (nodeId) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty('right'); } catch (e) {}
  const md = RUN.byId[nodeId].mapDef, room = (md.rooms || [])[0] || {};
  const rect = room.rect;
  if (!rect) return { err: 'no rect' };
  const hero = { tx: Math.round((playerX - SNAP_X_OFFSET) / TILE_SIZE),
                 ty: Math.round((playerY - SNAP_Y_OFFSET) / TILE_SIZE) };
  const floor = new Set();
  for (let r = rect[0]; r <= rect[2]; r++)
    for (let c = rect[1]; c <= rect[3]; c++) if (!isTileWall(c, r)) floor.add(c + ',' + r);
  const seen = new Set(); const st = [];
  if (floor.has(hero.tx + ',' + hero.ty)) { seen.add(hero.tx + ',' + hero.ty); st.push([hero.tx, hero.ty]); }
  while (st.length) {
    const cur = st.pop();
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const d of around) {
      const nx = cur[0] + d[0], ny = cur[1] + d[1], k = nx + ',' + ny;
      if (floor.has(k) && !seen.has(k)) { seen.add(k); st.push([nx, ny]); }
    }
  }
  /* sealRing が「出口でない向きのゲート」として縁に残す上下の中点 1 マスは既知の孤立点
   *   (森 / 沼 / 砦と同じ性質) なので除外する。 */
  const midC = Math.floor((rect[1] + rect[3]) / 2);
  const ring = new Set([midC + ',' + rect[0], midC + ',' + rect[2]]);
  const orphan = [...floor].filter(k => !seen.has(k) && !ring.has(k));
  return { hero: hero, floor: floor.size, reached: seen.size, orphan: orphan, ringMid: [...ring] };
};

/* ★autoplay 走行の 1 秒ごとの観測。 */
const AP_TICK = (bkey) => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  return {
    pathname: location.pathname,
    scen: g(() => scenarioId, null),
    node: g(() => currentNodeId, null),
    caelumResolved: g(() => caelumResolved, 'UNREADABLE'),
    bless: g(() => localStorage.getItem(bkey), null),
    cleared: g(() => !!dungeonCleared, false),
    over: g(() => !!gameOver, false),
    foesLeft: g(() => enemies.filter(e => e.alive && !e.passiveNpc).length, -1),
    spirits: g(() => enemies.filter(e => e.def && e.def.isNpcSpirit).length, -1),
    bossTotal: g(() => enemies.filter(e => e.def && e.def.isBoss).length, -1),
    bossAlive: g(() => enemies.filter(e => e.def && e.def.isBoss && e.alive).length, -1),
    traps: g(() => traps.length, -1),
    chests: g(() => roomChests.length, -1),
    party: g(() => 1 + allies.length, -1),
  };
};

/* ── autoplay を 1 本走らせる ────────────────────────────────────────────────
 * ⚠⚠ 完走の判定は終了コードではなく**観測**で行う (#64)。
 * ⚠ クリアすると index.html は autoplay の分岐で dfReturnPage() へ**遷移する**ので、
 *   evaluate は必ず try で包み、取れなくなったら打ち切る。 */
async function runAutoplayOnce(browser, port) {
  const out = { ticks: 0, seq: [], firstN4: null, caelum: null, bless: null,
                blessNode: null, reachedN7: false, bossTotal: 0, bossKilled: false,
                cleared: false, defeat: false, party: null, elapsedS: 0, choiceLogs: [], err: null };
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', m => {
    const t = m.text();
    if (t.indexOf('showCharChoice') >= 0) out.choiceLogs.push(t.slice(0, 150));
  });
  page.on('pageerror', e => out.choiceLogs.push('PAGEERROR ' + String(e.message).slice(0, 120)));
  await page.evaluateOnNewDocument((sid, bkey) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    try { localStorage.removeItem(bkey); } catch (e) {}
  }, THEME, BLESS_KEY);
  const url = 'http://127.0.0.1:' + port + '/index.html?autoplay=' + AP_SPEED + '&diag=1&scen=' + THEME;
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  } catch (e) {
    out.err = 'GOTO ' + String(e && e.message || e).slice(0, 90);
    await page.close().catch(() => {});
    return out;
  }
  let lastNode = null;
  while ((Date.now() - t0) / 1000 < AP_TIMEOUT_S) {
    await sleep(1000);
    let t = null;
    try { t = await page.evaluate(AP_TICK, BLESS_KEY); }
    catch (e) { out.err = 'EVAL ' + String(e && e.message || e).slice(0, 80); break; }
    if (!t) break;
    out.ticks++;
    const el = +((Date.now() - t0) / 1000).toFixed(1);
    if (out.party === null && t.party > 0) out.party = t.party;
    if (t.node && t.node !== lastNode) { out.seq.push(t.node + '@' + Math.round(el) + 's'); lastNode = t.node; }
    if (t.node === 'n4' && !out.firstN4) out.firstN4 = { traps: t.traps, chests: t.chests, foes: t.foesLeft, spirits: t.spirits };
    if (t.caelumResolved === true && !out.caelum) out.caelum = { node: t.node, s: el };
    if (t.bless === '1' && out.bless === null) { out.bless = el; out.blessNode = t.node; }
    if (t.node === 'n7') out.reachedN7 = true;
    if (t.bossTotal > out.bossTotal) out.bossTotal = t.bossTotal;
    if (t.bossTotal > 0 && t.bossAlive === 0) out.bossKilled = true;
    if (t.cleared) { out.cleared = true; break; }
    if (t.over) { out.defeat = true; break; }
  }
  out.elapsedS = +((Date.now() - t0) / 1000).toFixed(1);
  await page.close().catch(() => {});
  return out;
}
/* ⭐ オートプレイ系は観測窓依存でフレークする (2 回走らせてから騒ぐ)。
 *   ⚠ ただし**再走するのは「全滅した」ときだけ**。時間切れ (= 詰み) で再走すると
 *     変異 caelumnopassive の 1 本に AP_TIMEOUT_S の 2 倍が溶ける。 */
async function runAutoplay(browser, port, label) {
  let r = await runAutoplayOnce(browser, port);
  const show = (tag, x) => console.log('  [autoplay] ' + label + ' ' + tag + ': ' + x.elapsedS + 's  seq=' +
    JSON.stringify(x.seq) + ' cleared=' + x.cleared + ' defeat=' + x.defeat +
    ' caelum=' + JSON.stringify(x.caelum) + ' bless=' + x.bless + '@' + x.blessNode +
    (x.err ? ' err=' + x.err : ''));
  show('1 本目', r);
  if (r.defeat && !r.cleared) {
    const r2 = await runAutoplayOnce(browser, port);
    show('2 本目 (全滅の再走)', r2);
    if (r2.cleared || !r.cleared) r = r2;
  }
  return r;
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
/* 入場地点の**独立式** — 「来た向きの反対側の辺の中点 + NODE_ENTRY_INSET」を
 *   rect の算術だけで組む。⛔ 本番の nodeGateTile を借りない (借りると 1 経路になる)。
 * ⚠ midR / midC は Math.floor なので**行数・列数の偶奇で 1 マスずれる** (#58 の教訓)。
 *   神殿は n4 = 18 行 (偶数) / n7 = 13 行 (奇数) で**偶奇が違う 2 枚**。⛔ 砦の 30x20 を写経しない。 */
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
  const tmp = cat[THEME] || {};
  const n4def = tmp.n4big || null, n7def = tmp.n7big || null;

  // ── §0 装置 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  const pageA = await bootPage(browser, base + '/index.html?diag=1', THEME, errs);
  const GA = await pageA.evaluate(GRAPH_FN, OTHER_SCENS, THEME);
  const idsA = GA.nodes ? GA.nodes.map(n => n.id) : [];
  const byA = {}; for (const n of (GA.nodes || [])) byA[n.id] = n;
  const bosses = (GA.nodes || []).filter(n => n.kind === 'boss').map(n => n.id);
  const fr = GA.fresh || {}, dr = GA.direct || {};
  check('0a', '★装置: 畳んだ RUN.graph が ' + KEEP_IDS.length + ' ノード / entry="n4" / kind:"boss" がちょうど 1 つ。⭐ ノード数は spec でなく buildUndeadTempleRun() と buildScenarioRun() の戻り値でも数える (3 経路)',
    !!GA.nodes && GA.nodes.length === KEEP_IDS.length && GA.entry === 'n4' && GA.seamActive === true &&
    bosses.length === 1 && bosses[0] === 'n7' &&
    !!fr.ids && JSON.stringify(fr.ids) === JSON.stringify(idsA) && fr.entry === GA.entry &&
    !!dr.ids && JSON.stringify(dr.ids) === JSON.stringify(idsA) && dr.entry === GA.entry,
    'RUN: entry=' + GA.entry + ' ids=' + JSON.stringify(idsA) + ' kinds=' +
    JSON.stringify((GA.nodes || []).map(n => n.id + ':' + n.kind)) +
    ' / buildScenarioRun: ' + JSON.stringify(fr) + ' / buildUndeadTempleRun: ' + JSON.stringify(dr) +
    ' / seam=' + GA.seamActive + (GA.err ? ' err=' + GA.err : ''));
  check('0b', '★装置: 変異アンカー ' + ANCHORS.length + ' 本が原本 index.html に 1 箇所ずつ実在する (起動時検算。1 本でも空振りなら exit 3 で即死 = #65 の偽の EXIT=3 の再発防止)',
    ANCHORS.length === MUT_ORDER.length && ANCHORS.every(r => r.n === 1 && !r.multiline && !r.sameLen),
    ANCHORS.map(r => r.key + '=' + r.n).join(' '));
  /* (0c) ⭐ カエルムの検出器が空振りしていないこと。これが無いと §2 が永久緑になる。 */
  const S4 = await pageA.evaluate(SNAP_FN, 'n4', 'right');
  const spiritsOn4 = (S4.enemies || []).filter(e => e.spirit);
  check('0c', '★装置: 畳んだ n4 の盤面に def.isNpcSpirit の敵がちょうど 1 体 (⛔ これが無いと (2a)(2b)(2c) が永久緑)',
    spiritsOn4.length === 1,
    '霊=' + spiritsOn4.length + ' 体 ' + JSON.stringify(spiritsOn4.map(e => e.type + '@' + e.tx + ',' + e.ty)) +
    ' / 盤面の敵 ' + (S4.enemies || []).length + ' 体');
  const graphWarn = errs.filter(s => /^(WARNING|ERROR)\b/.test(s) && s.indexOf('[graph]') >= 0);
  check('0d', '★DFMapDef.lintRun が error 0 / warning 0 で、console の warning/error に [graph] が 1 件も無い (⭐ 縦横比の在庫 LINT_PAINTING_ASPECTS が神殿の 2 枚を知っているか)',
    !!GA.lint && GA.lint.e.length === 0 && GA.lint.w.length === 0 && graphWarn.length === 0,
    'lint=' + JSON.stringify(GA.lint) + ' console=' + JSON.stringify(graphWarn.slice(0, 3)));

  /* 旧構成 = 撤退の腕。⭐ (1a) の期待値をここから導くので §1 より先に開く。 */
  const pageB = await bootPage(browser, base + '/index.html?diag=1&templefold=0', THEME, errs);
  const GB = await pageB.evaluate(GRAPH_FN, OTHER_SCENS, THEME);
  const idsB = GB.nodes ? GB.nodes.map(n => n.id) : [];
  const byB = {}; for (const n of (GB.nodes || [])) byB[n.id] = n;

  // ── §1 畳みの形 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §1 畳みの形 (⭐ 期待値は ?templefold=0 の腕からその場で導く)');
  const oldSum = [];
  for (const id of MERGED_FROM) for (const s of ((byB[id] || {}).slots || [])) oldSum.push(s[2]);
  const newList = ((byA.n4 || {}).slots || []).map(s => s[2]);
  const spiritTypes = spiritsOn4.map(e => e.type);
  const foesNew = newList.filter(t => spiritTypes.indexOf(t) < 0);
  const foesOld = oldSum.filter(t => spiritTypes.indexOf(t) < 0);
  check('1a', '★★n4 の slots が「敵 + カエルム」で、体数も種類の内訳も ?templefold=0 の ' + MERGED_FROM.join('+') + ' の合計と一致する (2 経路。⛔ 数字を焼いていない)',
    newList.length > 0 && oldSum.length === newList.length &&
    sortedJSON(typeCount(oldSum)) === sortedJSON(typeCount(newList)) &&
    spiritTypes.length === 1 && foesNew.length === foesOld.length && foesNew.length > 0,
    '旧 ' + MERGED_FROM.join('+') + ' = ' + oldSum.length + ' 体 ' + JSON.stringify(typeCount(oldSum)) +
    ' / 畳んだ n4 = ' + newList.length + ' 体 ' + JSON.stringify(typeCount(newList)) +
    ' (うち霊 ' + spiritTypes.length + ' / 敵 ' + foesNew.length + ')');
  const rectEq = (r, b) => !!r && !!b && r.length === 4 && JSON.stringify(r) === JSON.stringify(b);
  check('1b', '★n4 / n7 の rect が n4big / n7big の tileBounds と同値 (paintingAspectFits が縦横比の完全一致を要求する)',
    !!n4def && !!n7def && rectEq((byA.n4 || {}).rect, n4def.bounds) &&
    rectEq((byA.n7 || {}).rect, n7def.bounds),
    'n4 rect=' + JSON.stringify((byA.n4 || {}).rect) + ' tileBounds=' + JSON.stringify(n4def && n4def.bounds) +
    ' / n7 rect=' + JSON.stringify((byA.n7 || {}).rect) + ' tileBounds=' + JSON.stringify(n7def && n7def.bounds) +
    ' / paint=' + (byA.n4 || {}).paint + ',' + (byA.n7 || {}).paint);
  /* (1c) ⚠⚠⚠ isTileWall だけでは**永久緑**になる (敵スポーンは applyPaintingBlocking の
   *   門番 skipSpawn が必ず素通しさせる)。効くのは「マスクが '.' か」と
   *   「マスクが '#' なのに歩けるタイルが 0 か (= 絵に穴が開いていない)」の 2 本。 */
  const S7 = await pageA.evaluate(SNAP_FN, 'n7', 'right');
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
  check('1c', '★全スロット (敵 + カエルム) とボスがマスクの "." に載り、マスクの "#" が 1 つも歩けるようになっていない (絵に穴が開かない) — n4 / n7 とも',
    !!n4def && Array.isArray(n4def.rows) && n4def.rows.length === (n4def.bounds[2] - n4def.bounds[0] + 1) &&
    !!n7def && Array.isArray(n7def.rows) && n7def.rows.length === (n7def.bounds[2] - n7def.bounds[0] + 1) &&
    slots4.length > 0 && slots7.length > 0 &&
    bad4.length === 0 && bad7.length === 0 && holes4.length === 0 && holes7.length === 0,
    'n4 マスク=' + (n4def && n4def.rows ? n4def.rows.length + '行' : 'なし') +
    ' ⛔"#"の上=' + JSON.stringify(bad4) + ' ⛔絵の穴=' + JSON.stringify(holes4.slice(0, 6)) +
    ' / n7 ⛔"#"の上=' + JSON.stringify(bad7) + ' ⛔絵の穴=' + JSON.stringify(holes7.slice(0, 6)));
  const ind4 = entryFromRect(S4.rect, 'right', GA.inset), ind7 = entryFromRect(S7.rect, 'right', GA.inset);
  const hero4 = S4.hero || { tx: -1, ty: -1 }, hero7 = S7.hero || { tx: -1, ty: -1 };
  check('1d', '★n4 / n7 の density が 0 (⛔ 既定 1 だと描き込み済みの絵の上へ scenery が湧く) で、start が「左辺の中点 + NODE_ENTRY_INSET」= 実際にパーティが立ったタイル (2 経路)。?templefold=0 側の density は 1',
    (byA.n4 || {}).density === 0 && (byA.n7 || {}).density === 0 &&
    (byB.n4 || {}).density === 1 && (byB.n7 || {}).density === 1 &&
    !!ind4 && hero4.tx === ind4[0] && hero4.ty === ind4[1] &&
    !!S4.start && S4.start.tx === hero4.tx && S4.start.ty === hero4.ty &&
    !!ind7 && hero7.tx === ind7[0] && hero7.ty === ind7[1] &&
    !!S7.start && S7.start.tx === hero7.tx && S7.start.ty === hero7.ty,
    'density 畳んだ=' + (byA.n4 || {}).density + ',' + (byA.n7 || {}).density +
    ' 旧=' + (byB.n4 || {}).density + ',' + (byB.n7 || {}).density +
    ' / n4 実際=' + JSON.stringify(hero4) + ' 独立式=' + JSON.stringify(ind4) + ' start=' + JSON.stringify(S4.start) +
    ' / n7 実際=' + JSON.stringify(hero7) + ' 独立式=' + JSON.stringify(ind7) + ' start=' + JSON.stringify(S7.start) +
    ' / inset=' + GA.inset);
  const ex4 = (byA.n4 || {}).exits || [];
  const gRight = (S4.gates && S4.gates.right) || null;
  const atRight = ex4.find(e => e.to === 'n7');
  check('1e', '★n4 の exits が right→n7 の 1 本だけ / n7 は行き止まり / 出口タイルが nodeGateTile(md,"right") と exits[].at で一致する (2 経路。食い違うと開かない扉が生まれる)',
    ex4.length === 1 && !!atRight && atRight.dir === 'right' &&
    !!byA.n7 && byA.n7.exits.length === 0 &&
    !!gRight && atRight.at[0] === gRight[0] && atRight.at[1] === gRight[1] &&
    Array.isArray(GA.opts) && GA.opts.length > 0 && GA.opts[0].to === 'n7' && GA.curNode === 'n4',
    'n4 exits=' + JSON.stringify(ex4.map(e => e.to + ':' + e.dir + '@' + e.at.join(','))) +
    ' nodeGateTile(right)=' + JSON.stringify(gRight) +
    ' / n7 exits=' + JSON.stringify((byA.n7 || {}).exits) +
    ' / 自動進行の先頭=' + JSON.stringify(GA.opts) + ' 現在=' + GA.curNode);

  // ── §2 カエルム ────────────────────────────────────────────────────────────
  console.log('\n[drv] §2 カエルム (⭐ 本チケットの核心)');
  const sp4 = spiritsOn4[0] || null;
  check('2a', '★カエルムが inactive === true かつ passiveNpc === true (⭐ 砦の守護者 initGuardians は passiveNpc を立てないので大部屋へ移すとクリア不能になる — 神殿はここが違う)',
    !!sp4 && sp4.alive === true && sp4.inactive === true && sp4.passiveNpc === true,
    JSON.stringify(sp4));
  /* (2c) ★静的な腕 — (2b) が非決定論で揺れたときに原因を切り分ける。 */
  const geo = await pageA.evaluate(CAELUM_GEO_FN, 'n4');
  check('2c', '★カエルムから「入場地点 → 出口 P6_RIGHT」の本番 aStar 経路上の最も近いタイルまでが CAELUM_TALK_RADIUS 以下 (⭐ 半径も距離の式も本番から取る。150px = 1.56 タイルしかなく 2 タイルでは永久に届かない)',
    !geo.err && typeof geo.min === 'number' && typeof geo.radius === 'number' && geo.min <= geo.radius,
    geo.err ? ('⛔ ' + JSON.stringify(geo))
      : ('霊=' + JSON.stringify(geo.spiritTile) + ' 入場=' + JSON.stringify(geo.hero) +
         ' 出口=' + JSON.stringify(geo.gate) + '(' + geo.via + ' ' + JSON.stringify(geo.doors) + ')' +
         ' 経路 ' + geo.steps + ' マス / 最短 ' + geo.min +
         'px (最寄り ' + JSON.stringify(geo.minTile) + ') vs 半径 ' + geo.radius + 'px'));
  /* (2d) ⭐ 装置 — 旧構成 (?templefold=0) にもカエルムが居る。これが無いと (2a)(2c) は
   *   「元からそんな隠し要素が無い世界」でも緑になる。 */
  const S6old = await pageB.evaluate(SNAP_FN, 'n6', 'right');
  const spiritsOld = (S6old.enemies || []).filter(e => e.spirit);
  check('2d', '★装置: ?templefold=0 の n6「神官の墓所」にもカエルムが 1 体そのまま居る (= 隠し要素を消したのではなく畳んだ大部屋へ移しただけ)',
    spiritsOld.length === 1 && spiritsOld[0].inactive === true && spiritsOld[0].passiveNpc === true,
    '旧 n6 の霊=' + spiritsOld.length + ' 体 ' + JSON.stringify(spiritsOld.map(e => e.type + '@' + e.tx + ',' + e.ty)));

  // ── §3 クリアできること ────────────────────────────────────────────────────
  console.log('\n[drv] §3 クリアできること');
  const st = await pageA.evaluate(SETTLE_FN, 'n4');
  const leftSpirit = (st.left || []).filter(e => e.spirit);
  check('3a', '★★★n4 で霊以外の敵を全部倒すと isNodeSettled() が true になる (⭐ カエルムは passiveNpc なので勝利判定を止めない。⛔ 止めると永久にクリア不能)',
    !st.err && st.before === false && st.after === true &&
    st.killed > 0 && leftSpirit.length === 1 && st.drop === false,
    st.err ? ('⛔ ' + JSON.stringify(st))
      : ('倒す前=' + st.before + ' 倒した後=' + st.after + ' 撃破 ' + st.killed + ' 体 / 残り=' +
         JSON.stringify(st.left) + ' / findNearestDrop=' + st.drop));
  const fl = await pageA.evaluate(FLOOR_FN, 'n4');
  check('3c', '★★n4 の歩ける床が入場地点から全部ひとつながり (本番の isTileWall + 4 近傍。孤立した床に宝箱や落とし物が湧くと findNearestDrop が片付かず isNodeSettled が永久 false)',
    !fl.err && fl.floor > 0 && (fl.orphan || []).length === 0,
    fl.err ? ('⛔ ' + fl.err)
      : ('歩けるマス=' + fl.floor + ' 到達=' + fl.reached + ' ⛔孤立=' + (fl.orphan || []).length +
         ((fl.orphan || []).length ? ' ' + JSON.stringify(fl.orphan.slice(0, 8)) : '') +
         ' (縁の中点 ' + JSON.stringify(fl.ringMid) + ' は除外)'));
  /* ⭐ ここから実プレイ走行。(2b) / (3b) / (4b) の 3 節が共有する。 */
  let ap = null;
  if (!NO_AP) {
    console.log('  [autoplay] 畳んだ神殿を ?autoplay=' + AP_SPEED + ' で走らせる (上限 ' + AP_TIMEOUT_S + 's)…');
    ap = await runAutoplay(browser, port, label);
  }
  const apOK = !!ap;
  check('2b', '★★★実プレイ走行で対話が発火する — n4 に居る間に神官の祝福 (localStorage ' + BLESS_KEY + ') が立つ (⭐ そこへ至る道は tryApproachCaelum → runCaelumDialog → caelumFriendlyRoute しか無い。autoplay の showCharChoice は index 0 = 弔いを自動選択する)',
    apOK && ap.bless !== null && (ap.blessNode === 'n4' || (!!ap.caelum && ap.caelum.node === 'n4')),
    !apOK ? '⛔ --no-autoplay で走らせていない (この節は原理的に静的には測れない)'
      : ('祝福=' + (ap.bless === null ? 'なし' : ap.bless + 's @node ' + ap.blessNode) +
         ' / caelumResolved の観測=' + JSON.stringify(ap.caelum) +
         ' / 走行 ' + ap.elapsedS + 's seq=' + JSON.stringify(ap.seq) +
         ' / 3 択ログ=' + JSON.stringify(ap.choiceLogs.slice(0, 2))));
  check('3b', '★★autoplay が n4 → n7 と進み、ボス (lich) を撃破してダンジョンをクリアする',
    apOK && ap.reachedN7 === true && ap.bossTotal === 1 && ap.bossKilled === true && ap.cleared === true,
    !apOK ? '⛔ --no-autoplay で走らせていない'
      : ('seq=' + JSON.stringify(ap.seq) + ' n7 到達=' + ap.reachedN7 + ' ボス ' + ap.bossTotal +
         ' 体 撃破=' + ap.bossKilled + ' クリア=' + ap.cleared + ' 全滅=' + ap.defeat +
         ' PT=' + ap.party + ' 人 / ' + ap.elapsedS + 's' + (ap.err ? ' err=' + ap.err : '')));

  // ── §4 罠と宝箱 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §4 罠と玄室の宝箱 (森 #16 の失敗の再現防止)');
  check('4a', '★畳んだ神殿で NODE_EXTRA_SPAWN_KINDS["undead-temple"].n4 が ["search","loot"] (n2 search / n3 loot をノードごと畳んだぶんの兼務宣言)',
    !!GA.kindsTable && JSON.stringify((GA.kindsTable['undead-temple'] || {}).n4) ===
      JSON.stringify(['search', 'loot']),
    '台帳=' + JSON.stringify(GA.kindsTable));
  const S4old = await pageB.evaluate(SNAP_FN, 'n4', 'right');
  check('4b', '★実走で罠と玄室の宝箱が 1 個以上湧く (⛔ 0 個なら赤) — 本番の buildNode で組んだ盤面と autoplay 走行の 2 経路。?templefold=0 側の n4 では 0 / 0',
    S4.traps > 0 && S4.chests > 0 && S4old.traps === 0 && S4old.chests === 0 &&
    (!apOK || (!!ap.firstN4 && ap.firstN4.traps > 0 && ap.firstN4.chests > 0)),
    '畳んだ n4 (buildNode): 罠=' + S4.traps + ' 宝箱=' + S4.chests +
    ' / autoplay の初観測: ' + JSON.stringify(apOK ? ap.firstN4 : 'skip') +
    ' / ?templefold=0 の n4: 罠=' + S4old.traps + ' 宝箱=' + S4old.chests);
  check('4c', '★森 (bandits-forest n7) / 沼 (lizard-swamp n4) / 砦 (orc-fort n4) の兼務宣言が 1 ビットも動いていない',
    !!GA.kindsTable &&
    JSON.stringify(GA.kindsTable['bandits-forest']) === JSON.stringify({ n7: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['lizard-swamp']) === JSON.stringify({ n4: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['orc-fort']) === JSON.stringify({ n4: ['search', 'loot'] }),
    JSON.stringify(GA.kindsTable));

  // ── §5 恒等 (非退行) ───────────────────────────────────────────────────────
  console.log('\n[drv] §5 恒等 (他 5 シナリオを 1 ビットも触っていないか)');
  const oA = GA.others || {}, oB = GB.others || {};
  const diffScen = OTHER_SCENS.filter(s => oA[s] !== oB[s] || !oA[s]);
  const distinct = new Set(OTHER_SCENS.map(s => oA[s])).size;
  check('5a', '★他 5 シナリオのグラフ (mapDef 全文) が ?templefold=0 の腕と 1 ビットも変わらない (⭐ 5 本が相互に異なる = 同じ物を 5 回測っていない)',
    diffScen.length === 0 && distinct === OTHER_SCENS.length,
    '差分=' + JSON.stringify(diffScen) + ' 相互に異なる=' + distinct + '/' + OTHER_SCENS.length +
    ' hash=' + JSON.stringify(oA));

  // ── §6 撤退 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §6 撤退スイッチ ?templefold=0');
  check('6a', '★?templefold=0 で ' + (KEEP_IDS.length + DROP_IDS.length) + ' ノード / entry="n0" へ戻り、廃止した 6 部屋が全部そこに居る',
    idsB.length === KEEP_IDS.length + DROP_IDS.length && GB.entry === 'n0' &&
    DROP_IDS.every(id => idsB.indexOf(id) >= 0) && KEEP_IDS.every(id => idsB.indexOf(id) >= 0) &&
    GB.foldOff === true && GB.folded === false,
    'entry=' + GB.entry + ' nodes=' + JSON.stringify(idsB) +
    ' / TEMPLE_FOLD_OFF=' + GB.foldOff + ' TEMPLE_FOLDED=' + GB.folded +
    ' (畳んだ側は ' + GA.foldOff + ' / ' + GA.folded + ')');
  const oldN4 = ((byB.n4 || {}).slots || []).map(s => s[2]);
  const movedFrom = MERGED_FROM.filter(id => id !== 'n4')
    .reduce((a, id) => a + ((byB[id] || {}).slots || []).length, 0);
  check('6b', '★?templefold=0 の n4 の slots が旧構成のまま = 「畳んだ n4 の体数 − 移設元 (' +
    MERGED_FROM.filter(id => id !== 'n4').join('+') + ') の合計」で、カエルムも載っていない',
    oldN4.length > 0 && movedFrom > 0 && oldN4.length === newList.length - movedFrom &&
    oldN4.filter(t => spiritTypes.indexOf(t) >= 0).length === 0,
    '旧 n4 = ' + oldN4.length + ' 体 ' + JSON.stringify(typeCount(oldN4)) +
    ' / 畳んだ n4 = ' + newList.length + ' 体 − 移設元 ' + movedFrom + ' 体');
  check('6c', '★?templefold=0 で NODE_EXTRA_SPAWN_KINDS["undead-temple"] が undefined (旧構成では n2/n3 が持っているので二重にしない)',
    GB.hasTempleKinds === false &&
    !!GB.kindsTable && GB.kindsTable['undead-temple'] === undefined,
    '旧側の台帳=' + JSON.stringify(GB.kindsTable) + ' hasOwnProperty=' + GB.hasTempleKinds);
  const wh = (r) => r ? [r[3] - r[1] + 1, r[2] - r[0] + 1] : null;
  const stOldN4 = await httpStatus(port, '/assets/room_undead-temple_n4.jpg');
  const stOldN7 = await httpStatus(port, '/assets/room_undead-temple_n7.jpg');
  const stBigN4 = await httpStatus(port, '/assets/room_undead-temple_n4_map.jpg');
  const stBigN7 = await httpStatus(port, '/assets/room_undead-temple_n7_map.jpg');
  check('6d', '★?templefold=0 では旧絵の小部屋に戻る (paint が n4 / n7 で rect が旧 tileBounds と同値) — 撤退先の絵も行き先の大部屋の絵も 200 で引ける',
    (byB.n4 || {}).paint === 'n4' && (byB.n7 || {}).paint === 'n7' &&
    (byA.n4 || {}).paint === 'n4big' && (byA.n7 || {}).paint === 'n7big' &&
    rectEq((byB.n4 || {}).rect, (tmp.n4 || {}).bounds) &&
    rectEq((byB.n7 || {}).rect, (tmp.n7 || {}).bounds) &&
    stOldN4 === 200 && stOldN7 === 200 && stBigN4 === 200 && stBigN7 === 200,
    '旧 n4 paint=' + (byB.n4 || {}).paint + ' rect=' + JSON.stringify((byB.n4 || {}).rect) +
    '(' + (wh((byB.n4 || {}).rect) || []).join('x') + ') tileBounds=' + JSON.stringify((tmp.n4 || {}).bounds) +
    ' / 旧 n7 paint=' + (byB.n7 || {}).paint + ' rect=' + JSON.stringify((byB.n7 || {}).rect) +
    '(' + (wh((byB.n7 || {}).rect) || []).join('x') + ')' +
    ' / http 旧=' + stOldN4 + ',' + stOldN7 + ' 新=' + stBigN4 + ',' + stBigN7);

  await pageA.close(); await pageB.close();
  return { results: R, errs: errs };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_templefold_');
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
      for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key +
        '  期待 ' + JSON.stringify(r.want) + ' / 赤 ' + JSON.stringify(r.failed));
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
