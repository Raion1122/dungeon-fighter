/* verify_plaza_crowd.js — #100 地下街を歩く住人 (ゴブリン・ホブゴブリン・リザードフォークの巡回・押すと一言) の受入
 *
 *   node tools/verify_plaza_crowd.js                        ← 素の受入 (依頼書 §8 の全 assert)
 *   node tools/verify_plaza_crowd.js --negative             ← 負のコントロール 14 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_plaza_crowd.js --negative --only tapcover
 *
 * 依頼書: 実装依頼書/2026-10-25_plaza-residents.md §8。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の tavern.html を実 Chrome (puppeteer-core) で開く。配信バイトは起動時に凍結する
 *    (tavern.html / town.html / index.html / js/*.js は起動時、残り (画像など) は初回アクセス時)。
 *  - 闇市へは verify_plaza_map と同じ測定台 window.__plazaTV.onTapPlazaDoor() で入る。
 *    desktop 1440x900 / compact 390x844 (isMobile + hasTouch) の 2 画面で同じ通しを回す。
 *  - 観測するのは DOM の実位置 (getBoundingClientRect / elementFromPoint) と画素 (canvas の alpha)。
 *    ⛔ NPC_CROWD.PLAZA の写しを持たない。配置・経路・文面・シートは page.evaluate で実体を読む。
 *    持つのは依頼書の受入値だけ = 背丈の期待値 (52 / 56 / 73 ±3) と「住人 → 戦闘の敵」の対応 3 組 (§2-1)。
 *  - verify_plaza_map (1c) の押し所はそのドライバのソースの 1 行から読む (⛔ 表を写さない)。
 *  - verify_npc_crowd のアンカー 6 本もそのドライバのソースから読む (⛔ このファイルに文字列を書かない =
 *    書くとこのファイル自身がアンカーの出現場所を増やし、他ドライバの「1 回ちょうど」の前提を濁す)。
 *  - ⭐ (0a) が赤なら、その画面の以降の節は測らず全部赤で記録する (空振りの永久緑を作らない)。
 *  - ⛔ 一言の文面そのもの / 暗幕の下の見え方 / 端点の静止時間の長さは測らない (依頼書 §8 ⛔)。
 *
 * ── 依頼書 §8 からの言い直し・測定点 (notes100_item3.md に同じ記録) ─────────
 *  (1b)(1c)(2a)(2b) 観測窓は「6 秒」ではなく **全員の 1 往復以上** (= max 2 x (区間数 x MS_PER_TILE + 3000ms))。
 *       6 秒だと巡回の端点に一度も行かない窓がありうる (ゴブリンの往復 ≈ 12 秒) = 変異 tapcover が窓しだいで空振りする。
 *       さらに「各住人が自分の経路の全マスを踏んだ」を (1b) に足し、窓が足りたこと自体を検算する。
 *       (2a) の「3 体とも位置が変わる」は窓の最初の 6 秒で見る (依頼書どおり)。
 *  (1c) 押し所の点を矩形が「含む」に加え、verify_plaza_map の walkByClicks が押さない範囲
 *       (住人の矩形 +24px) にも入らないことを見る。⭐ 実害 (= その点が押せずに (1c) が赤) はこちらで決まるため。
 *       依頼書の tapcover ([6,13]→[16,13]) はタイル中心 (1120,800) を矩形 x[1008..1104] が含まず、+24px で入る。
 *  (3a) 押す住人は「中心が画面内・elementFromPoint がその住人・中心の下のタイルが歩けて主人公の足元ではない」
 *       を満たす者を選ぶ (⭐ 伝播が漏れたら主人公が必ず歩き出す点 = 変異 nostop が空振りしない)。
 *       compact で 15 秒待っても見つからなければ主人公を (11,7) へ歩かせてから選び直す。
 *  (3c) 札の中心は画面内の札だけ測る (desktop は 7 枚全部・compact は 1 枚以上)。腕を 1 本足す:
 *       吹き出し自身の中心の elementFromPoint が吹き出しではない (= 当たり判定を持たない)。
 *  (3d) 腕を 1 本足す: 押す前に住人の say へ "<b>…</b>" を入れ (測定の間だけ・押した後に戻す)、
 *       吹き出しの中に要素が 0 で textContent がその文字列のままであること。
 *  (4b) 酒場の .npcUnit は闇市へ入る前に数える (TAVERN の長さに揃うまで 15 秒待つ)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10639 だけを順に使う。
 *  - アンカーは**手つかずの原本**で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ長さ / 改行を含む / 置換文字列が原本に既に在る / 他の tools/*.js のソースに同じ文字列がある
 *    (罠E) なら exit 3。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート) / 3 = 変異アンカーの腐敗
 * port: 10639 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⚠ 走行中に本番を編集しないこと (起動時に凍結)。
 * ⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。長い走行は背景実行で。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10639'), 10);

/* 依頼書 §8 (1f) の受入値 (住人の段 3 の体高 px)。⭐ 依頼書の値なのでここだけは持つ */
const WANT_H = { goblin: 52, hobgoblin: 56, lizardfolk: 73 };
const TOL_H = 3;
/* 依頼書 §2-1: 住人 → 戦闘の敵の定義 (index.html の敵の key)。背丈の 2 経路目に使う */
const ENEMY_OF = { goblin: 'goblin', hobgoblin: 'hobgoblin', lizardfolk: 'lizardWarrior' };
const NPC_MARGIN = 24;                                 // verify_plaza_map walkByClicks の「住人の近く」と同じ幅

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
const SNAP = new Map();
function frozen(rel) {
  if (SNAP.has(rel)) return SNAP.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAP.set(rel, buf);
  return buf;
}
const JS_FILES = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /\.js$/.test(f)).map((f) => 'js/' + f).sort();
for (const rel of ['tavern.html', 'town.html', 'index.html'].concat(JS_FILES)) {
  if (!frozen(rel)) { console.error('[driver] ' + rel + ' が読めません'); process.exit(2); }
}
const MUT_FILES = ['tavern.html', 'js/map-walk.js', 'js/npc-crowd.js'];
const PRISTINE = {};
for (const rel of MUT_FILES) PRISTINE[rel] = frozen(rel).toString('utf8');

/* ── 他ドライバのソースから読むもの (⛔ ここへ写さない) ── */
function readTool(f) {
  try { return fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8'); }
  catch (e) { console.error('[driver] tools/' + f + ' が読めません'); process.exit(2); }
}
/* verify_npc_crowd のアンカー 6 本 (A_FILTER / A_BGPOS / A_STOP / A_HIDE / A_RETREAT は const の 1 行、SCRIPT_TAG は NPC_JS から組む) */
const NPC_ANCHORS = (() => {
  const src = readTool('verify_npc_crowd.js');
  const out = {};
  for (const n of ['A_FILTER', 'A_BGPOS', 'A_STOP', 'A_HIDE', 'A_RETREAT']) {
    const m = src.match(new RegExp('^const ' + n + '\\s*=\\s*\'((?:[^\'\\\\]|\\\\.)*)\';', 'm'));
    if (!m) { console.error('[driver] verify_npc_crowd.js から ' + n + ' を読めません'); process.exit(3); }
    out[n] = m[1].replace(/\\(.)/g, '$1');
  }
  const js = src.match(/^const NPC_JS\s*=\s*'([^']+)';/m);
  if (!js || !/SCRIPT_TAG\s*=\s*'<script src="' \+ NPC_JS \+ '"><\/script>'/.test(src)) {
    console.error('[driver] verify_npc_crowd.js の SCRIPT_TAG の組み方が読めません'); process.exit(3);
  }
  out.SCRIPT_TAG = '<script src="' + js[1] + '"></script>';
  return out;
})();
/* verify_plaza_map (1c) の押し所 (desktop / compact の 3 点ずつ・和集合 5 点) */
const TAP_TILES = (() => {
  const src = readTool('verify_plaza_map.js');
  const m = src.match(/const tiles = vpName === 'desktop' \? (\[\[[\d,\s\[\]]+\]\]) : (\[\[[\d,\s\[\]]+\]\]);/);
  if (!m) { console.error('[driver] verify_plaza_map.js から (1c) の押し所を読めません'); process.exit(3); }
  const all = JSON.parse(m[1]).concat(JSON.parse(m[2]));
  const seen = new Set(); const out = [];
  for (const t of all) { const k = t.join(','); if (!seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
})();

/* 変異 (依頼書 §8 の表)。edits = [[file, anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める。 */
const MUTATIONS = {
  nocrowd: { expect: ['(0a)'], why: 'plazaBuildWalkTV で crowd を渡さない (null)',
    edits: [['tavern.html', '      crowd: plazaCrowdTV()                             // ★[#100] 歩く住人 (撤退時は null = レイヤごと無し)',
      '      crowd: null   // mut-nocrowd']] },
  animsheet: { expect: ['(1d)'], why: '⭐ §2-1 の罠: ゴブリンの sprite を敵シート assets/goblin_anim.png (段 3 = 攻撃) へ',
    edits: [['js/npc-crowd.js', '      sprite: "assets/plaza_goblin_walk.png",', '      sprite: "assets/goblin_anim.png",  /* mut-animsheet */']] },
  row0: { expect: ['(1e)'], why: '住人の backgroundPosition の Y を 0 へ',
    edits: [['js/map-walk.js', '      p.el.style.backgroundPosition = (-SPRITE * p.frame) + "px " + (-SPRITE * SHEET_ROW_RIGHT) + "px";',
      '      p.el.style.backgroundPosition = (-SPRITE * p.frame) + "px 0px";  /* mut-row0 */']] },
  walkable: { expect: ['(1a)'], why: 'リザードフォークの経路を [7,4]→[18,4] (露店の上) へ',
    edits: [['js/npc-crowd.js', '    { key: "lizardfolk", kind: "stroll", from: [7, 6],  to: [18, 6], face: "right",',
      '    { key: "lizardfolk", kind: "stroll", from: [7, 4], to: [18, 4], face: "right",  /* mut-walkable */']] },
  oversign: { expect: ['(1a)'], why: 'ホブゴブリンを [10,9]→[10,13] (召喚屋の札と交差) へ',
    edits: [['js/npc-crowd.js', '    { key: "hobgoblin",  kind: "stroll", from: [11, 9], to: [11, 13], face: "right",',
      '    { key: "hobgoblin", kind: "stroll", from: [10, 9], to: [10, 13], face: "right",  /* mut-oversign */']] },
  tapcover: { expect: ['(1c)'], why: '⭐ §2-4 の罠: ゴブリンを [6,13]→[16,13] へ ((17,12) の押し所を覆う)',
    edits: [['js/npc-crowd.js', '    { key: "goblin",     kind: "stroll", from: [6, 13], to: [15, 13], face: "right",',
      '    { key: "goblin", kind: "stroll", from: [6, 13], to: [16, 13], face: "right",  /* mut-tapcover */']] },
  samesheet: { expect: ['(1d)'], why: 'ホブゴブリンにゴブリンのシート',
    edits: [['js/npc-crowd.js', '      sprite: "assets/plaza_hobgoblin_walk.png",', '      sprite: "assets/plaza_goblin_walk.png",  /* mut-samesheet */']] },
  nopause: { expect: ['(2c)'], why: 'closePlaza の crowdPause() を外す',
    edits: [['tavern.html', '    if (plazaWalkTV && plazaWalkTV.crowdPause) { try { plazaWalkTV.crowdPause(); } catch (e) {} }   // ★[#100] 隠れている間に住人の rAF を回さない',
      '    /* mut-nopause */']] },
  nostop: { expect: ['(3a)'], why: '住人の click / touchend で伝播を止めない (onPress の ev を潰して stopPropagation を飛ばす)',
    edits: [['js/map-walk.js', '        var onPress = function (ev) {', '        var onPress = function (ev) { ev = null;  /* mut-nostop */']] },
  twobubble: { expect: ['(3b)'], why: '前の吹き出しを消さない',
    edits: [['js/map-walk.js', '      sayHide();                                /* 前の 1 枚を必ず先に消す = 舞台に常に 1 枚 */', '      /* mut-twobubble */']] },
  bubblepe: { expect: ['(3c)'], why: '吹き出しを pointer-events: auto に',
    edits: [['js/map-walk.js', '      el.style.pointerEvents = "none";          /* ⛔ 押せる紙にしない (札の elementFromPoint を濁さない) */',
      '      el.style.pointerEvents = "auto";  /* mut-bubblepe */']] },
  innerhtml: { expect: ['(3d)'], why: '吹き出しを innerHTML で入れる + 3 体の say に <b>',
    edits: [['js/map-walk.js', '      el.textContent = text;                    /* ⛔ innerHTML にしない (say は自由文のデータ) */', '      el.innerHTML = text;  /* mut-innerhtml */'],
      ['js/npc-crowd.js', '      say: "地上の者か……。牙貨は持っているか、シャァ…" },', '      say: "<b>地上の者か</b>……。牙貨は持っているか、シャァ…" },  /* mut-innerhtml */'],
      ['js/npc-crowd.js', '      say: "通り道を塞ぐな。ここは闇市だ、フン" },', '      say: "<b>通り道を塞ぐな</b>。ここは闇市だ、フン" },  /* mut-innerhtml */'],
      ['js/npc-crowd.js', '      say: "ヒヒッ、いい品が入ったぜ。見るだけならタダだぜ" }', '      say: "<b>ヒヒッ</b>、いい品が入ったぜ。見るだけならタダだぜ" }  /* mut-innerhtml */']] },
  anchorcopy: { expect: ['(4a)'], why: '⭐ §2-3 の罠: tavern.html に verify_npc_crowd の A_BGPOS をもう 1 つ足す (コメントの中・挙動は不変)',
    edits: [['tavern.html', '  function plazaCrowdTV() {', '  function plazaCrowdTV() { /*' + NPC_ANCHORS.A_BGPOS + ' mut-anchorcopy */']] },
  retreatnoop: { expect: ['(5a)', '(5b)'], why: 'plazaCrowdTV() の撤退判定を潰す',
    edits: [['tavern.html', '    if (off || window.__tavernNpcOn === false || !isUndercityOnTV()) return null;', '    if (false) return null;  /* mut-retreatnoop */']] },
};
const MUT_ORDER = ['nocrowd', 'animsheet', 'row0', 'walkable', 'oversign', 'tapcover', 'samesheet',
                   'nopause', 'nostop', 'twobubble', 'bubblepe', 'innerhtml', 'anchorcopy', 'retreatnoop'];

/* 起動時の検算 (素の走行でも必ず) */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) {
    for (const [file, anchor, patch] of MUTATIONS[k].edits) {
      const hits = PRISTINE[file].split(anchor).length - 1;
      if (hits !== 1) {
        console.error('[driver] 負のコントロール ' + k + ' の注入点が ' + file + ' に ' + hits + ' 箇所 (期待 1)。変異は無効です: ' + anchor.slice(0, 160));
        process.exit(3);
      }
      if (anchor === patch || anchor.length === patch.length || /[\r\n]/.test(anchor + patch)) {
        console.error('[driver] ' + k + ' は置換前後が同一 / 同じバイト長 / 改行を含みます'); process.exit(3);
      }
      if (PRISTINE[file].indexOf(patch) >= 0) { console.error('[driver] ' + k + ' の置換文字列が原本に既に在る'); process.exit(3); }
      const clash = peers.filter((x) => x.s.indexOf(anchor.trim()) >= 0).map((x) => x.f);
      if (clash.length) { console.error('[driver] 変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(',')); process.exit(3); }
    }
  }
}
for (const k of ONLY) if (!MUTATIONS[k]) { console.error('[driver] 未知の --only: ' + k + '  (' + MUT_ORDER.join(',') + ')'); process.exit(3); }

const INJECTED = [];
function inject(tag) {
  const m = MUTATIONS[tag];
  const work = {};
  for (const [file, anchor, patch] of m.edits) {
    const s = work[file] !== undefined ? work[file] : PRISTINE[file];
    const now = s.split(anchor).length - 1;
    if (now !== 1) { console.error('[driver] ' + tag + ': 先行の置換の後で注入点が ' + now + ' 箇所 (期待 1)'); process.exit(3); }
    work[file] = s.split(anchor).join(patch);
  }
  for (const file of Object.keys(work)) SNAP.set(file, Buffer.from(work[file], 'utf8'));
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (' + m.why + ' / 置換 ' + m.edits.length + ' 本)');
}

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const bad = [], summary = [];
  const t0 = Date.now();
  console.log('[driver] --negative (一括): ' + MUT_ORDER.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of MUT_ORDER) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const t1 = Date.now();
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + ' (' + Math.round((Date.now() - t1) / 1000) + ' 秒)' + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - t0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + MUT_ORDER.length + ' 本すべて担当の節が赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  if (ONLY.length !== 1) { console.error('[driver] --only には変異を 1 つ: ' + MUT_ORDER.join(',')); process.exit(1); }
  inject(ONLY[0]);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 器 (サーバ・ブラウザ)
 * ══════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const buf = frozen(rel);
        if (!buf) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        rs.setHeader('Cache-Control', 'no-store');
        rs.end(buf);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 判定の記録
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  const d = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  results.push({ name, ok, detail: d });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (d ? '  -- ' + d.slice(0, 900) : ''));
}
const SCREEN_LABELS = ['(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(3c)', '(3d)', '(4b)'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];
function watchErrors(page, tag) {
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    if (/\[DIAG\]/.test(m.text())) return;
    pageErrors.push(tag + ' :: CONSOLE ' + m.text() + ' ' + url);
  });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
}
const VP = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  compact: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
/* 種: 解禁済み・初回のナレ済み + 変装の杖。sessionStorage の印で 1 回だけまく */
async function openTavern(browser, vpName, qs) {
  const page = await browser.newPage();
  watchErrors(page, vpName + ' tavern' + (qs || ''));
  await page.setViewport(VP[vpName]);
  await page.evaluateOnNewDocument(() => {
    try {
      if (sessionStorage.getItem('__pcSeeded')) return;
      sessionStorage.setItem('__pcSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.plazaState', JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }));
      sessionStorage.setItem('dragonfighters.plazaClock', '21');   /* ★[#102] 闇市は夜だけ開く。時計で揺れないよう夜に固定 */
      localStorage.setItem('dragonfighters.plazaInventory', JSON.stringify({ wand_polymorph: [3, 3, 3, 3, 3, 3] }));
    } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__plazaTV && typeof window.__plazaTV.onTapPlazaDoor === 'function', { timeout: 60000 });
  await sleep(600);
  return page;
}
async function waitFn(page, fn, ms, a) { try { await page.waitForFunction(fn, { timeout: ms || 15000, polling: 50 }, a); return true; } catch (e) { return false; } }
async function enterPlaza(page) {
  await page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
  const ok = await waitFn(page, () => window.__plazaTV.plazaOpen(), 15000);
  await sleep(400);
  return ok;
}
const units = (page) => page.evaluate(() => window.__plazaTV.map.crowdUnits ? window.__plazaTV.map.crowdUnits() : null);

/* 画像の画素を測る (ページ内)。返す: { w, h, rows: [{ n: [6 コマの alpha>64 の画素数], h: [6 コマの bbox 高] }] } */
function measureSheet(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, w, h).data;
      const C = 96, rows = [];
      for (let r = 0; r < Math.floor(h / C); r++) {
        const n = [], hh = [];
        for (let f = 0; f < Math.floor(w / C); f++) {
          let cnt = 0, top = -1, bot = -1;
          for (let y = r * C; y < (r + 1) * C; y++) {
            let any = false;
            for (let x = f * C; x < (f + 1) * C; x++) if (d[(y * w + x) * 4 + 3] > 64) { cnt++; any = true; }
            if (any) { if (top < 0) top = y; bot = y; }
          }
          n.push(cnt); hh.push(top < 0 ? 0 : bot - top + 1);
        }
        rows.push({ n, h: hh });
      }
      resolve({ w, h, rows });
    };
    img.onerror = () => resolve({ err: 'load ' + url });
    img.src = url;
  });
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); const k = s.length; return k ? (k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2) : NaN; };

/* index.html の敵定義 (`      <key>: {` 〜 `      },`) から sprite と displaySize を読む */
function enemyDef(key) {
  const src = frozen('index.html').toString('utf8').replace(/\r\n/g, '\n');
  const head = '\n      ' + key + ': {\n';
  const n = src.split(head).length - 1;
  if (n !== 1) return { err: key + ' の定義が ' + n + ' 箇所' };
  const a = src.indexOf(head), b = src.indexOf('\n      },', a);
  const blk = src.slice(a, b);
  const sp = blk.match(/\n\s*sprite:\s*"([^"?]+)(?:\?[^"]*)?"/), ds = blk.match(/\n\s*displaySize:\s*(\d+)/);
  if (!sp || !ds) return { err: key + ' の sprite / displaySize が読めない' };
  return { sprite: sp[1], displaySize: parseInt(ds[1], 10) };
}

/* 住人を押せる点を選ぶ (ページ内)。中心が画面内・elementFromPoint がその住人・中心の下のタイルが歩けて主人公の足元ではない。
   pause 中の者を優先。返す: { key, x, y, tile, mode } / null */
function pickResidentFn(exclude) {
  const m = window.__plazaTV.map, PM = window.PLAZA_MAP;
  const h = m.heroTile();
  const us = m.crowdUnits();
  const cand = [];
  for (const el of document.querySelectorAll('#plazaViewport .mwNpc')) {
    const key = el.getAttribute('data-mw-npc');
    if (exclude && exclude.indexOf(key) >= 0) continue;
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (x < 8 || y < 8 || x > innerWidth - 8 || y > innerHeight - 8) continue;
    const e = document.elementFromPoint(x, y);
    if (e !== el) continue;
    const t = m.tileFromClient(x, y);
    if (!PM.isWalkable(t.c, t.r) || (t.c === h.c && t.r === h.r)) continue;
    const u = us.find((q) => q.key === key) || {};
    cand.push({ key, x, y, tile: t, mode: u.mode });
  }
  cand.sort((a, b) => (a.mode === 'pause' ? 0 : 1) - (b.mode === 'pause' ? 0 : 1));
  return cand[0] || null;
}
/* 主人公をタイル (c,r) へ実クリックで歩かせる (住人の近く・札は押さない)。compact の寄せ専用 */
async function walkHero(page, c, r) {
  for (let hop = 0; hop < 14; hop++) {
    const pick = await page.evaluate((tc, tr, mg) => {
      const m = window.__plazaTV.map, PM = window.PLAZA_MAP;
      const h = m.heroTile();
      if (h.c === tc && h.r === tr) return { done: true };
      const p = PM.findPath(h.c, h.r, tc, tr);
      if (!p) return { err: 'findPath null' };
      const stage = document.querySelector('#plazaViewport .mwStage');
      for (let i = p.length - 1; i >= 0; i--) {
        const q = m.clientFromTile(p[i].c, p[i].r);
        if (q.x < 8 || q.y < 8 || q.x > innerWidth - 8 || q.y > innerHeight - 8) continue;
        const e = document.elementFromPoint(q.x, q.y);
        if (!e || !stage.contains(e) || e.closest('.mwSign') || e.closest('.mwNpc')) continue;
        if ([].some.call(document.querySelectorAll('.mwNpc'), (n) => { const b = n.getBoundingClientRect();
          return q.x > b.left - mg && q.x < b.right + mg && q.y > b.top - mg && q.y < b.bottom + mg; })) continue;
        return { t: p[i], x: q.x, y: q.y };
      }
      return { err: '押せる経路のタイルが無い' };
    }, c, r, NPC_MARGIN);
    if (pick.done) return true;
    if (pick.err) { await sleep(300); continue; }
    await page.mouse.click(pick.x, pick.y);
    await waitFn(page, (t) => { const m = window.__plazaTV.map; const h = m.heroTile(); return h.c === t.c && h.r === t.r && !m.isMoving(); }, 15000, pick.t);
  }
  return false;
}
async function pickResident(page, vpName, exclude) {
  const t0 = Date.now(); let walked = false;
  while (Date.now() - t0 < 40000) {
    const p = await page.evaluate(pickResidentFn, exclude || []);
    if (p) return Object.assign(p, { walked });
    if (!walked && vpName === 'compact' && Date.now() - t0 > 15000) { walked = true; await walkHero(page, 11, 7); continue; }
    await sleep(100);
  }
  return null;
}
const bubbleState = () => {
  const bs = [...document.querySelectorAll('.mwNpcBubble')];
  const m = window.__plazaTV.map;
  return { n: bs.length, who: bs.map((b) => b.getAttribute('data-mw-npc-say')), text: bs.map((b) => b.textContent),
    kids: bs.map((b) => b.children.length), hero: m.heroTile(), moving: m.isMoving() };
};

/* ══════════════════════════════════════════════════════════════════════════
 * 1 つの画面の通し
 * ══════════════════════════════════════════════════════════════════════════ */
async function screenFlow(browser, vpName) {
  const L = '[' + vpName + '] ';
  const page = await openTavern(browser, vpName, '');

  /* ── (4b) 前半: 酒場の .npcUnit の数 = NPC_CROWD.TAVERN.length (闇市へ入る前) ── */
  await waitFn(page, () => !!window.NPC_CROWD && document.querySelectorAll('#tavernStage .npcUnit').length === window.NPC_CROWD.TAVERN.length, 15000);
  const tvUnits = await page.evaluate(() => ({ n: document.querySelectorAll('#tavernStage .npcUnit').length, all: document.querySelectorAll('.npcUnit').length,
    want: window.NPC_CROWD && Array.isArray(window.NPC_CROWD.TAVERN) ? window.NPC_CROWD.TAVERN.length : -1 }));

  /* ── (0a) 闇市を開くと .mwNpc が PLAZA.length 個 = 3 ── */
  const opened = await enterPlaza(page);
  const a0 = await page.evaluate(() => {
    const C = window.NPC_CROWD;
    return { npc: document.querySelectorAll('#plazaViewport .mwNpc').length, layer: document.querySelectorAll('#plazaViewport .mwNpcLayer').length,
      plaza: C && Array.isArray(C.PLAZA) ? C.PLAZA.length : -1, keys: [...document.querySelectorAll('#plazaViewport .mwNpc')].map((e) => e.getAttribute('data-mw-npc')),
      plazaKeys: C && Array.isArray(C.PLAZA) ? C.PLAZA.map((n) => n.key) : [], compact: window.MAP_WALK.isCompact(),
      unitsN: (window.__plazaTV.map.crowdUnits ? window.__plazaTV.map.crowdUnits() : []).length };
  });
  check('(0a) ' + L + '闇市を開くと #plazaViewport に .mwNpc が NPC_CROWD.PLAZA.length 個 = 3 (0 ではない)・.mwNpcLayer 1 枚・crowdUnits() も 3・data-mw-npc = PLAZA の key',
    opened && a0.npc === a0.plaza && a0.npc === 3 && a0.layer === 1 && a0.unitsN === 3 && a0.keys.join() === a0.plazaKeys.join(), Object.assign({ opened }, a0));
  if (!results[results.length - 1].ok) {
    for (const lb of SCREEN_LABELS) check(lb + ' ' + L + '(0a) が赤なので測らない', false, 'skipped');
    await page.close();
    return;
  }

  /* ── (0b) 配信した tavern.html に script 2 本・NPC_CROWD.PLAZA が配列 ── */
  const tvSrc = frozen('tavern.html').toString('utf8');
  const b0 = await page.evaluate(() => ({ arr: !!window.NPC_CROWD && Array.isArray(window.NPC_CROWD.PLAZA),
    scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')) }));
  check('(0b) ' + L + '配信した tavern.html に <script src="js/npc-crowd.js"> と js/map-walk.js があり (ソースと DOM の両方)・window.NPC_CROWD.PLAZA が配列',
    tvSrc.indexOf(NPC_ANCHORS.SCRIPT_TAG) >= 0 && /<script src="js\/map-walk\.js"><\/script>/.test(tvSrc)
      && b0.scripts.indexOf('js/npc-crowd.js') >= 0 && b0.scripts.indexOf('js/map-walk.js') >= 0 && b0.arr, b0);

  /* ── (0c) 装置の検出器が生きている ── */
  const c0 = await page.evaluate(() => {
    const v = window.NPC_CROWD.validate([{ key: 'x', kind: 'stroll', from: [0, 0], to: [3, 0] }], window.PLAZA_MAP, []);
    return { ok: v.ok, whys: v.problems.map((p) => p.why) };
  });
  check('(0c) ' + L + '[装置] validate([{stroll (0,0)→(3,0)}], PLAZA_MAP, []) が I4 を返す', c0.ok === false && c0.whys.indexOf('I4') >= 0, c0);

  /* ── (1a) validate(PLAZA, PLAZA_MAP, 実 DOM の札の矩形を舞台座標へ戻したもの) が ok ── */
  const a1 = await page.evaluate(() => {
    const m = window.__plazaTV.map;
    const st = document.querySelector('#plazaViewport .mwStage').getBoundingClientRect();
    const z = m.zoom();
    const signs = [...document.querySelectorAll('#plazaViewport .mwSign')].map((s) => {
      const b = s.getBoundingClientRect();
      return { key: s.getAttribute('data-key'), cx: (b.left + b.width / 2 - st.left) / z, cy: (b.top + b.height / 2 - st.top) / z, w: b.width / z, h: b.height / z };
    });
    const v = window.NPC_CROWD.validate(window.NPC_CROWD.PLAZA, window.PLAZA_MAP, signs);
    return { ok: v.ok, problems: v.problems.slice(0, 12), signs: signs.length, zoom: z,
      w: signs.map((s) => s.key + ':' + Math.round(s.w)).join(' ') };
  });
  check('(1a) ' + L + 'validate(NPC_CROWD.PLAZA, PLAZA_MAP, 札 ' + a1.signs + ' 枚の実 DOM の矩形 (舞台座標)) が ok', a1.ok && a1.signs >= 7, a1);

  /* ── (1d)(1e)(1f) 絵 ── */
  const dom = await page.evaluate(() => [...document.querySelectorAll('#plazaViewport .mwNpc')].map((e) => ({
    key: e.getAttribute('data-mw-npc'), img: e.style.backgroundImage, pos: e.style.backgroundPosition, size: e.style.backgroundSize,
    cpos: getComputedStyle(e).backgroundPositionY })));
  const urlOf = (s) => { const m = /^url\("?([^")]+)"?\)$/.exec(s || ''); return m ? m[1] : null; };
  const sheets = {};
  for (const d of dom) {
    const u = urlOf(d.img);
    sheets[d.key] = u ? await page.evaluate(measureSheet, u) : { err: 'no url' };
    sheets[d.key].url = u;
  }
  const d1 = dom.map((d) => {
    const s = sheets[d.key];
    const okUrl = !!s.url && /^assets\/plaza_[a-z]+_walk\.png$/.test(s.url);
    const okSize = s.w === 576 && s.h === 384;
    const row3 = s.rows && s.rows[3] ? s.rows[3].n : null;
    const empty012 = !!s.rows && [0, 1, 2].every((r) => s.rows[r] && s.rows[r].n.every((n) => n === 0));
    return { key: d.key, url: s.url, okUrl, wh: s.w + 'x' + s.h, okSize, row3, row3ok: !!row3 && row3.length === 6 && row3.every((n) => n > 0), empty012, err: s.err };
  });
  const urls = dom.map((d) => urlOf(d.img));
  check('(1d) ' + L + '3 体の backgroundImage が互いに違い、どれも assets/plaza_*_walk.png・naturalWidth/Height 576x384・段 3 の 6 コマに alpha>64 の画素 / 段 0〜2 は空',
    dom.length === 3 && new Set(urls).size === 3 && d1.every((x) => x.okUrl && x.okSize && x.row3ok && x.empty012), d1);
  check('(1e) ' + L + '3 体の backgroundPosition の Y が -288px (inline と computed)',
    dom.length === 3 && dom.every((d) => (d.pos || '').split(' ')[1] === '-288px' && d.cpos === '-288px'), dom.map((d) => d.key + ' ' + d.pos + ' / ' + d.cpos));
  const f1 = [];
  for (const d of dom) {
    const s = sheets[d.key];
    const h = s.rows && s.rows[3] ? median(s.rows[3].h) : NaN;
    const ek = ENEMY_OF[d.key];
    const ed = ek ? enemyDef(ek) : { err: '対応の敵が無い ' + d.key };
    let battle = NaN, eh = NaN;
    if (!ed.err) {
      const es = await page.evaluate(measureSheet, ed.sprite);
      eh = es.rows && es.rows[0] ? median(es.rows[0].h) : NaN;
      battle = eh / 96 * ed.displaySize;
    }
    const want = WANT_H[d.key];
    f1.push({ key: d.key, h, want, battle: Math.round(battle * 10) / 10, enemy: ek, enemyH: eh, displaySize: ed.displaySize, err: ed.err,
      ok: want !== undefined && Math.abs(h - want) <= TOL_H && Math.abs(h - battle) <= TOL_H });
  }
  check('(1f) ' + L + '背丈: 段 3 の体高 (alpha>64 の bbox 高・6 コマの中央値) が ゴブリン 52 / ホブゴブリン 56 / リザードフォーク 73 ±3 かつ 戦闘の背丈 (敵シート段 0 の体高 ÷ 96 × index.html の displaySize) との差 ±3',
    f1.length === 3 && f1.every((x) => x.ok), f1);

  /* ── 観測窓 (全員の 1 往復以上): (1b)(1c)(2a)(2b) と (1e) の歩行中 ── */
  const obs = await page.evaluate(async (tiles, mg) => {
    const m = window.__plazaTV.map, PM = window.PLAZA_MAP, N = window.NPC_CROWD;
    const ms = m.geom().msPerTile;
    const path = {};
    let T = 6000;
    for (const n of N.PLAZA) { const c = N.cellsOf(n); path[n.key] = c.map((p) => p.join(',')); T = Math.max(T, 2 * ((c.length - 1) * ms + 3000) + 600); }
    const S = [];
    const t0 = performance.now();
    while (performance.now() - t0 < T) {
      const t = performance.now() - t0;
      const us = m.crowdUnits();
      const P = tiles.map((q) => m.clientFromTile(q[0], q[1]));
      const rec = { t: Math.round(t), u: [] };
      for (const u of us) {
        const el = document.querySelector('#plazaViewport .mwNpc[data-mw-npc="' + u.key + '"]');
        const b = el ? el.getBoundingClientRect() : null;
        const cover = [], near = [];
        if (b) P.forEach((p, i) => {
          if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) cover.push(tiles[i].join(','));
          if (p.x > b.left - mg && p.x < b.right + mg && p.y > b.top - mg && p.y < b.bottom + mg) near.push(tiles[i].join(','));
        });
        rec.u.push({ k: u.key, c: u.c, r: u.r, x: Math.round(u.x * 10) / 10, y: Math.round(u.y * 10) / 10, left: u.left, f: u.frame, mode: u.mode,
          w: PM.isWalkable(u.c, u.r), on: (path[u.key] || []).indexOf(u.c + ',' + u.r) >= 0, cover, near,
          by: el ? (el.style.backgroundPosition || '').split(' ')[1] : null });
      }
      S.push(rec);
      await new Promise((r) => setTimeout(r, 100));
    }
    return { T, ms, path, S };
  }, TAP_TILES, NPC_MARGIN);
  const keys = Object.keys(obs.path);
  const per = {};
  for (const k of keys) per[k] = { badTile: [], visited: new Set(), cover: new Set(), near: new Set(), moved6: false, flips: 0, flipPause: 0, frames: new Set(), by: new Set(), first: null, prev: null, n: 0 };
  for (const rec of obs.S) {
    for (const u of rec.u) {
      const p = per[u.k]; if (!p) continue;
      p.n++;
      if (!u.w || !u.on) { if (p.badTile.length < 5) p.badTile.push(u.c + ',' + u.r + (u.w ? '' : ' 歩けない') + (u.on ? '' : ' 経路外') + '@' + rec.t); }
      p.visited.add(u.c + ',' + u.r);
      u.cover.forEach((x) => p.cover.add(x + '@' + rec.t));
      u.near.forEach((x) => p.near.add(x + '@' + rec.t));
      if (!p.first) p.first = u;
      else if (rec.t <= 6000 && (u.x !== p.first.x || u.y !== p.first.y)) p.moved6 = true;
      if (p.prev && u.left !== p.prev.left) { p.flips++; if (u.mode === 'pause') p.flipPause++; }
      if (u.mode === 'walk') p.frames.add(u.f);
      p.by.add(u.by);
      p.prev = u;
    }
  }
  const sum = keys.map((k) => { const p = per[k]; return { k, n: p.n, badTile: p.badTile, unvisited: obs.path[k].filter((c) => !p.visited.has(c)),
    cover: [...p.cover].slice(0, 6), near: [...p.near].slice(0, 6), moved6: p.moved6, flips: p.flips, flipPause: p.flipPause, frames: [...p.frames].sort(), by: [...p.by] }; });
  const winNote = '観測 ' + Math.round(obs.T / 100) / 10 + ' 秒・' + obs.S.length + ' 点 (100ms ごと)';
  check('(1b) ' + L + winNote + ': どの時点でも 3 体の足元のタイルが PLAZA_MAP.isWalkable で自分の経路 (cellsOf) の上・経路の全マスを踏んだ (窓が 1 往復を覆った検算)',
    keys.length === 3 && sum.every((x) => x.n >= 30 && x.badTile.length === 0 && x.unvisited.length === 0), sum.map((x) => ({ k: x.k, n: x.n, badTile: x.badTile, unvisited: x.unvisited })));
  check('(1c) ' + L + winNote + ': どの住人の矩形も verify_plaza_map (1c) の押し所 ' + TAP_TILES.length + ' 点 (' + TAP_TILES.map((t) => t.join(',')).join(' ') + ' の clientFromTile) を含まず、矩形 +' + NPC_MARGIN + 'px (walkByClicks が押さない範囲) にも入れない',
    keys.length === 3 && TAP_TILES.length === 5 && sum.every((x) => x.cover.length === 0 && x.near.length === 0), sum.map((x) => ({ k: x.k, cover: x.cover, near: x.near })));
  check('(2a) ' + L + '最初の 6 秒で 3 体とも位置が変わる / 窓の中で 3 体とも端点で left が反転し、反転した時点の mode が pause',
    keys.length === 3 && sum.every((x) => x.moved6 && x.flips >= 1 && x.flips === x.flipPause), sum.map((x) => ({ k: x.k, moved6: x.moved6, flips: x.flips, flipPause: x.flipPause })));
  check('(2b) ' + L + '歩いている間 (mode walk) の frame が 3 体とも 0..5 を全部巡る',
    keys.length === 3 && sum.every((x) => x.frames.join() === '0,1,2,3,4,5'), sum.map((x) => x.k + ':' + x.frames.join('')));
  check('(1e) ' + L + '観測窓の全時点で backgroundPosition の Y が -288px', keys.length === 3 && sum.every((x) => x.by.length === 1 && x.by[0] === '-288px'), sum.map((x) => x.k + ':' + x.by.join('|')));

  /* ── §3 一言 ── */
  await waitFn(page, () => document.querySelectorAll('.mwNpcBubble').length === 0 && !window.__plazaTV.map.isMoving(), 6000);
  const pk1 = await pickResident(page, vpName, []);
  let st1 = null, st1h = null, c3 = null, d3 = null;
  if (pk1) {
    const h0 = await page.evaluate(() => window.__plazaTV.map.heroTile());
    await page.mouse.click(pk1.x, pk1.y);                // ⭐ pick と click の間に何も挟まない
    await sleep(400);
    st1 = await page.evaluate(bubbleState);
    st1.say = await page.evaluate((k) => (window.NPC_CROWD.PLAZA.find((n) => n.key === k) || {}).say, pk1.key);
    st1h = h0;
    /* (3c) 吹き出しが出ている間 */
    c3 = await page.evaluate(() => {
      const b = document.querySelector('.mwNpcBubble');
      if (!b) return { none: true };
      const cs = getComputedStyle(b);
      const br = b.getBoundingClientRect();
      const bc = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      const signs = [...document.querySelectorAll('#plazaViewport .mwSign')];
      const zSign = Math.max.apply(null, signs.map((s) => parseInt(getComputedStyle(s).zIndex, 10) || 0));
      const probe = [];
      for (const s of signs) {
        const r = s.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue;
        const e = document.elementFromPoint(x, y);
        probe.push({ k: s.getAttribute('data-key'), ok: !!e && (e === s || s.contains(e)), e: e ? String(e.className || e.tagName) : null });
      }
      return { pe: cs.pointerEvents, z: cs.zIndex, zSign, signs: signs.length, inView: probe.length, probe,
        bubbleSelf: !!bc && (bc === b || b.contains(bc)), bubbleHit: bc ? String(bc.className || bc.tagName) : null };
    });
  }
  check('(3a) ' + L + '住人の中心を実クリック → .mwNpcBubble がちょうど 1 枚・data-mw-npc-say = その住人・文面 = その say・主人公の heroTile() が変わらず isMoving() false',
    !!pk1 && !!st1 && st1.n === 1 && st1.who[0] === pk1.key && st1.text[0] === st1.say && !st1.moving && st1.hero.c === st1h.c && st1.hero.r === st1h.r,
    { pick: pk1, st: st1, heroBefore: st1h });
  check('(3c) ' + L + '吹き出しの computed pointer-events none・z-index > 札 (最大) / 吹き出しの中心の elementFromPoint は吹き出しではない / 画面内の札の中心の elementFromPoint が札自身 (' + (vpName === 'desktop' ? '7 枚全部' : '1 枚以上') + ')',
    !!c3 && !c3.none && c3.pe === 'none' && parseInt(c3.z, 10) > c3.zSign && !c3.bubbleSelf && c3.signs === 7
      && (vpName === 'desktop' ? c3.inView === 7 : c3.inView >= 1) && c3.probe.every((p) => p.ok), c3);

  /* (3b) 別の住人を押す → 1 枚のまま持ち主が替わる / 4.5 秒後に 0 枚 */
  const pk2 = pk1 ? await pickResident(page, vpName, [pk1.key]) : null;
  let st2 = null, st2z = null;
  if (pk2) {
    await page.mouse.click(pk2.x, pk2.y);
    const tc = Date.now();
    await sleep(300);
    st2 = await page.evaluate(bubbleState);
    await sleep(Math.max(0, 4500 - (Date.now() - tc)));
    st2z = await page.evaluate(() => document.querySelectorAll('.mwNpcBubble').length);
  }
  check('(3b) ' + L + '別の住人を押す → 吹き出しは 1 枚のまま持ち主がその住人へ替わる / 押してから 4.5 秒後に 0 枚',
    !!pk2 && !!st2 && st2.n === 1 && st2.who[0] === pk2.key && pk2.key !== (pk1 && pk1.key) && st2z === 0, { pick: pk2, st: st2, after45: st2z });

  /* (3d) 文面は textContent: 実データの say のまま要素 0 / 測定の間だけ say に <b> を入れても要素 0 で文字列そのまま */
  await waitFn(page, () => document.querySelectorAll('.mwNpcBubble').length === 0, 6000);
  const pk3 = await pickResident(page, vpName, []);
  let d3b = null;
  if (pk3) {
    const PROBE = '<b>検査</b>の文字列';
    await page.evaluate((k, s) => { const n = window.NPC_CROWD.PLAZA.find((q) => q.key === k); n.__say = n.say; n.say = s; }, pk3.key, PROBE);
    const again = await page.evaluate(pickResidentFn, []);      // 選び直し (押す直前の位置)
    const tgt = again && again.key === pk3.key ? again : pk3;
    await page.mouse.click(tgt.x, tgt.y);
    await sleep(300);
    d3b = await page.evaluate((k) => {
      const b = document.querySelector('.mwNpcBubble[data-mw-npc-say="' + k + '"]');
      const r = b ? { n: document.querySelectorAll('.mwNpcBubble').length, kids: b.children.length, bTags: b.querySelectorAll('b').length, text: b.textContent } : { missing: true };
      const n = window.NPC_CROWD.PLAZA.find((q) => q.key === k); n.say = n.__say; delete n.__say;
      return r;
    }, pk3.key);
    d3b.want = PROBE;
  }
  d3 = { real: st1 ? { kids: st1.kids, text: st1.text, say: st1.say } : null, real2: st2 ? { kids: st2.kids } : null, probe: d3b };
  check('(3d) ' + L + '文面は textContent: 実データの say の吹き出しに子要素 0・測定の間だけ say を "<b>検査</b>…" にして押しても b 要素 0・textContent がその文字列のまま',
    !!st1 && st1.kids.every((n) => n === 0) && st1.text[0] === st1.say && !!st2 && st2.kids.every((n) => n === 0)
      && !!d3b && !d3b.missing && d3b.kids === 0 && d3b.bTags === 0 && d3b.text === d3b.want, d3);

  /* ── (4b) 後半: 地下街の中に .npcUnit は 0 / 酒場の .npcUnit は TAVERN の長さ ── */
  const pu = await page.evaluate(() => ({ inPlaza: document.querySelectorAll('#plazaViewport .npcUnit').length,
    mwAsUnit: document.querySelectorAll('.mwNpc.npcUnit, .mwNpc[data-npc]').length }));
  check('(4b) ' + L + '酒場 (#tavernStage) の .npcUnit の数 = NPC_CROWD.TAVERN.length (闇市へ入る前) / 地下街の中に .npcUnit 0・.mwNpc に npcUnit / data-npc が付かない',
    tvUnits.want > 0 && tvUnits.n === tvUnits.want && pu.inPlaza === 0 && pu.mwAsUnit === 0, { tavern: tvUnits, plaza: pu });

  /* ── (2c) closePlaza() の後 2 秒は 1px も動かない / 開き直すと 3 体とも動く ── */
  await page.evaluate(() => window.__plazaTV.closePlaza());
  await sleep(150);
  const k0 = await units(page); await sleep(2000); const k1 = await units(page);
  const closedOk = await page.evaluate(() => !window.__plazaTV.plazaOpen());
  const still = !!k0 && !!k1 && k0.length === 3 && JSON.stringify(k0.map((x) => [x.x, x.y])) === JSON.stringify(k1.map((x) => [x.x, x.y]));
  const reopened = await enterPlaza(page);
  const movedAfter = new Set();
  const tr = Date.now();
  while (Date.now() - tr < 4500 && movedAfter.size < 3) {
    const u = await units(page);
    (u || []).forEach((x, i) => { if (k1 && k1[i] && (x.x !== k1[i].x || x.y !== k1[i].y)) movedAfter.add(x.key); });
    await sleep(100);
  }
  check('(2c) ' + L + 'closePlaza() の後 2 秒、crowdUnits() の位置が 1px も変わらない (rAF が止まっている) / 開き直すと 4.5 秒以内に 3 体とも再び動く',
    closedOk && still && reopened && movedAfter.size === 3,
    { closedOk, still, k0: k0 && k0.map((x) => x.key + '@' + x.x + ',' + x.y + ':' + x.mode), k1: k1 && k1.map((x) => x.key + '@' + x.x + ',' + x.y), reopened, movedAfter: [...movedAfter] });
  await page.close();
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();

  /* ══ (4a) verify_npc_crowd のアンカー 6 本が配信中の tavern.html / town.html にそれぞれちょうど 1 回 ══ */
  {
    const files = ['tavern.html', 'town.html'];
    const tab = {};
    let ok = true;
    for (const f of files) {
      const s = frozen(f).toString('utf8');
      tab[f] = {};
      for (const k of Object.keys(NPC_ANCHORS)) { const n = s.split(NPC_ANCHORS[k]).length - 1; tab[f][k] = n; if (n !== 1) ok = false; }
    }
    check('(4a) 配信中の tavern.html / town.html の中で verify_npc_crowd のアンカー 6 本 (' + Object.keys(NPC_ANCHORS).join(' / ') + ') がそれぞれちょうど 1 回',
      ok && Object.keys(NPC_ANCHORS).length === 6, tab);
  }

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_plazacrowd_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile, '--mute-audio', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : '') + '  押し所 ' + TAP_TILES.map((t) => t.join(',')).join(' '));
    for (const vp of ['desktop', 'compact']) {
      console.log('\n[driver] ── ' + vp + ' ──');
      await screenFlow(browser, vp);
    }

    /* ══ §5 撤退 ══ */
    console.log('\n[driver] ── 撤退 ──');
    for (const [lb, qs] of [['(5a)', '?undercrowd=0'], ['(5b)', '?npc=0'], ['(5c)', '?undercity=0']]) {
      const n0 = pageErrors.length;
      const page = await openTavern(browser, 'desktop', qs);
      const opened = await enterPlaza(page);
      await sleep(1200);
      const z = await page.evaluate(() => ({ npc: document.querySelectorAll('.mwNpc').length, layer: document.querySelectorAll('.mwNpcLayer').length,
        bubble: document.querySelectorAll('.mwNpcBubble').length, mapOn: !!(window.__plazaTV.map && window.__plazaTV.map.on),
        units: window.__plazaTV.map && window.__plazaTV.map.crowdUnits ? window.__plazaTV.map.crowdUnits().length : null }));
      const errs = pageErrors.slice(n0);
      check(lb + ' tavern.html' + qs + ' → 闇市を開いても .mwNpc 0・.mwNpcLayer 0 (crowdUnits も空)・エラー無し',
        opened && z.npc === 0 && z.layer === 0 && z.bubble === 0 && (z.units === null || z.units === 0) && errs.length === 0,
        Object.assign({ opened, errs: errs.slice(0, 3) }, z));
      await page.close();
    }

    await sleep(300);
    check('(9a) pageerror / console error 0 件 (酒場・闇市。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const labels = Array.from(new Set(results.map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]).filter(Boolean)));
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   節 ' + labels.length + '   (' + Math.round((Date.now() - T0) / 1000) + ' 秒)');
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.name.slice(0, 120) + '  -- ' + String(r.detail).slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = MUTATIONS[tag].expect;
    const red = Array.from(new Set(results.filter((r) => !r.ok).map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0])));
    const miss = want.filter((w) => red.indexOf(w) < 0);
    const extra = red.filter((w) => want.indexOf(w) < 0);
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(','));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
