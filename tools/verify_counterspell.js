/* verify_counterspell.js — #96 カウンタースペル (敵の詠唱を打ち消す魔法使いの反応呪文) の受入
 *
 *   node tools/verify_counterspell.js                       ← 素の受入 (§8 の全 assert)
 *   node tools/verify_counterspell.js --negative            ← 負のコントロール 7 本 (1 本ずつ順に)
 *   node tools/verify_counterspell.js --negative --only reach
 *
 * 依頼書: 実装依頼書/2026-10-18_counterspell.md §8。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の index.html / tavern.html を実 Chrome (puppeteer-core) で開き、ゲームの関数を直に叩く
 *    (enemyCastSpell / enemyAttackTurn / hydraFireBreath / sovereignEyeStalkTurn)。
 *  - 盤面: goblin-mine で 14 マス以上つづく床の列 (lane) に 主人公 (魔法使い) / 仲間の魔法使い 2 人 /
 *    戦士 / 呪文使いの敵 を並べる。距離は**ドライバ側で**タイル添字のチェビシェフを計算する。
 *    視線を切る床は、本番の hasLineOfSight と**ドライバ自前の線分サンプリング**の両方が「切れる」と言う所を選ぶ。
 *  - ⛔ 裏のループは止める: gameOver = true / 各試行の頭で gameOver = false + dialogPaused = true
 *    (moveEnemies → tryStartEncounter が止まる)。演出の待ちは sleepMs を setTimeout(0) に潰す。
 *  - 呪文の抽選は Math.random を差し替えて狙う (リッチ = [MM, fireBolt, fireball] ⇒ 0.1 / 0.5 / 0.9)。
 *  - ⚠ (1a) の「乱数を引かない」は総回数だけで測らない (飛翔体の火の粉が毎フレーム引いて揺れる)。
 *    ① 飛翔体の絵を即解決に差し替えた上で総回数が同じ ② tryCounterEnemySpell の**中で**引いた回数 = 0
 *    ③ カウンター無し (関数を false に差し替えた腕) と被弾の値が 1 点も違わない、の 3 つで測る。
 *  - ⭐ (0a) が赤なら以降は測らず、全ラベルを赤で記録する (空振りの永久緑を作らない)。
 *  - ⛔ 実戦で何回打ち消すか (頻度)・演出の見た目・使う条件の妥当性は測らない (依頼書 §8 ⛔)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10635 だけを順に使う。
 *  - アンカーは**手つかずの原本**に対して 1 件ちょうどを確かめる。0 件 / 2 件以上なら exit 3 (装置の腐敗)。
 *    複数の置換を持つ変異は、置換ごとに「その時点のバッファで 1 件ちょうど」も確かめる。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は報告する。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート) / 3 = 変異アンカーの腐敗
 * port: 10635 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10635'), 10);
/* #96 の実装が入る直前の本番 (HP を引く点の総数の比較相手)。⛔ HEAD にしない (commit した瞬間に自分との比較になる) */
const PRE96_REV = '7ae53c7';

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {
  '/index.html':  fs.readFileSync(path.join(ROOT, 'index.html')),
  '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')),
};
const PRISTINE = {
  '/index.html':  FROZEN['/index.html'].toString('utf8'),
  '/tavern.html': FROZEN['/tavern.html'].toString('utf8'),
};
const INJECTED = [];

/* edits = [[anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める (改行を作らない = 行末に依存しない) */
function mutate(file, label, edits) {
  const tag = label.split(' ')[0];
  for (const [anchor, patch] of edits) {
    const hits = PRISTINE[file].split(anchor).length - 1;
    if (hits !== 1) {
      console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。変異は無効です:');
      console.error('         ' + file + '  ' + anchor.slice(0, 160));
      process.exit(3);
    }
    if (anchor === patch || anchor.length === patch.length || /[\r\n]/.test(anchor + patch)) {
      console.error('[driver] ' + label + ' は置換前後が同一 / 同じバイト長 / 改行を含みます');
      process.exit(3);
    }
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) return;
  let s = FROZEN[file].toString('utf8');
  for (const [anchor, patch] of edits) {
    const now = s.split(anchor).length - 1;
    if (now !== 1) { console.error('[driver] ' + label + ': 先行の置換の後で注入点が ' + now + ' 箇所 (期待 1)'); process.exit(3); }
    s = s.split(anchor).join(patch);
  }
  FROZEN[file] = Buffer.from(s, 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました (' + file + ' / 置換 ' + edits.length + ' 本)');
}

/* 変異 → 赤くなるべきラベル (依頼書 §8 の表)。⚠ 1 本ずつ実走して確かめた (2026-10-18)。
 *   巻き込み: noslot だけが広い (1c)(1d)(1e)(1f)(2a)〜(2e)(3b)(4a)(4b)(4c) = 「誰が唱えたか」を probe と枠の増減の
 *   両方で読む (whoCast) ので、枠が減らない欠陥は打ち消しを見る全節に出る (自然な連鎖)。他の 6 本は担当の節だけ。 */
const NEG_EXPECT = {
  noslot:    ['(1b)'],
  reach:     ['(2d)'],
  ringlast:  ['(3a)'],
  sleepcast: ['(2c)'],
  rngdrift:  ['(1a)'],
  oldcircle: ['(4a)'],
  leak:      ['(5b)'],
};

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad = [], summary = [];
  const t0 = Date.now();
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of tags) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - t0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}

if (NEGATIVE) {
  if (ONLY.length !== 1 || !NEG_EXPECT[ONLY[0]]) { console.error('[driver] --only には変異を 1 つ: ' + Object.keys(NEG_EXPECT).join(',')); process.exit(1); }
  /* noslot: 打ち消しても枠を減らさない (確かめるだけ) */
  mutate('/index.html', 'noslot (打ち消しても枠を減らさない)', [
    ['if (!consumeSpellSlot(c.unit, "counterspell")) return false;',
     'if (!hasSpellSlot(c.unit, "counterspell")) return false;'],
  ]);
  /* reach: 距離と視線を見ない */
  mutate('/index.html', 'reach (距離と視線を見ない)', [
    ['const reaches = (cx, cy) => tileChebyshev(cx, cy, ecx, ecy) <= reachTiles && hasLineOfSight(cx, cy, ecx, ecy);',
     'const reaches = (cx, cy) => true;'],
  ]);
  /* ringlast: 差し込みを指輪の呼び口より前に置く (指輪の後の 1 行を消し、指輪の行の頭へ移す) */
  mutate('/index.html', 'ringlast (カウンターを指輪より前に置く)', [
    ['if (await tryCounterEnemySpell(idx, spellId, meta)) return;',
     '/* ringlast: moved above the ring */'],
    ['      if (await tryReflectEnemySpell(idx, {',
     '      if (await tryCounterEnemySpell(idx, spellId, meta)) return; if (await tryReflectEnemySpell(idx, {'],
  ]);
  /* sleepcast: 動ける条件を外す (主人公・仲間の 2 行) */
  mutate('/index.html', 'sleepcast (眠っていても唱える)', [
    ['const leaderCanAct = !playerBuffs.skipNextTurn && !(playerBuffs.confused > 0) && !((playerBuffs.sleepRemaining || 0) > 0) && !(playerBuffs.wildConfused > 0);',
     'const leaderCanAct = true;'],
    ['const allyCanAct = !(a.stunned > 0) && !(a.confused > 0) && !(a.wildConfused > 0);',
     'const allyCanAct = true;'],
  ]);
  /* rngdrift: 判定の中で乱数を 1 回引く (罠 B) */
  mutate('/index.html', 'rngdrift (判定の中で Math.random を 1 回引く)', [
    ['if (!counterspellWanted(meta)) return false;',
     'Math.random(); if (!counterspellWanted(meta)) return false;'],
  ]);
  /* oldcircle: 既存の陣を探して割る (新しい陣を出さない・罠 A) */
  mutate('/index.html', 'oldcircle (既存の陣を探して割る)', [
    ['const broken = spawnCastCircle({ x: enemy.x, y: enemy.y, def }, "arcane", 600);',
     'const broken = (function () { const el = document.querySelector(".fxCastCircle--fire, .fxCastCircle--arcane"); return el ? { el: el } : null; })();'],
  ]);
  /* leak: pickScrollId の撤退条件を外す */
  mutate('/index.html', 'leak (pickScrollId の撤退条件を外す)', [
    ['&& (isCounterspellOn() || id !== "scroll-counterspell")',
     '&& (true || id !== "scroll-counterspell")'],
  ]);
  if (INJECTED.length !== 1) { console.error('[driver] 注入できた変異が ' + INJECTED.length + ' 本 (期待 1)'); process.exit(3); }
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
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) { rs.setHeader('Content-Type', MIME['.html']); rs.end(FROZEN[u]); return; }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
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
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (d ? '  -- ' + d.slice(0, 700) : ''));
}
/* (0a) が赤のとき、以降の全ラベルを赤で埋める (空振りの緑を作らない) */
const ALL_LABELS = ['(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)', '(4c)', '(5a)', '(5b)', '(5c)', '(9a)'];

const pageErrors = [];
/* 主人公 (魔法使い) + 仲間の魔法使い 2 人 + 戦士。⚠ rich な形でないと既定編成へ黙って戻る */
const PARTY = [
  { classKey: 'mage',    isHero: true,  zone: 'back',  name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'リタ', trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガロ', trait: null, line: null },
];
/* ⚠ counterspell を知っていないと完全ゲートで枠 0 = (0a) の空振り源 */
const KNOWN_IX = ['magic-missile', 'fire-bolt', 'sleep', 'counterspell'];
const KNOWN_TV = ['magic-missile', 'fire-bolt', 'sleep'];   // 酒場の棚は「まだ読んでいない」状態で見る
function watchErrors(page, tag) {
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    if (/\[DIAG\]/.test(m.text())) return;
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
}
async function openIndex(browser, qs) {
  const page = await browser.newPage();
  watchErrors(page, 'index' + (qs || ''));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', '45000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: seed.known }));
    } catch (e) {}
  }, { party: PARTY, known: KNOWN_IX });
  await page.goto('http://localhost:' + PORT + '/index.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction("typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
    + " && typeof createEnemy === 'function' && !!mapData && typeof enemyCastSpell === 'function'", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.waitForFunction('MAGIC_CIRCLE_SHEET.loaded === true', { timeout: 30000 }).catch(() => {});
  return page;
}
async function openTavern(browser, qs) {
  const page = await browser.newPage();
  watchErrors(page, 'tavern' + (qs || ''));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((kn) => {
    try {
      localStorage.setItem('dragonfighters.xp', '45000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: kn }));
    } catch (e) {}
  }, KNOWN_TV);
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__equipTV, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  return page;
}

/* ── ページ内の装置 (page.evaluate で注入) ─────────────────────────────────
 * window.__cs96.trial(o) が 1 回の試行 = 盤面を組む → 敵に 1 手やらせる → 前後を採る → 片付ける。
 *   o.heroSlots / o.heroHp / o.heroTx / o.heroTy / o.heroBuffs        … 主人公
 *   o.m1 / o.m2 = { slots, hp, tx, ty, st } (null / 省略 = 倒れて盤外。m1 だけは省略で { slots: 2 })
 *   o.war = { hp, tx }                                                  … 戦士 (省略 = 倒れて盤外)
 *   o.enemy / o.eTx / o.eTy                                             … 敵 (既定 = リッチを lane の tx0+7)
 *   o.sov = { tx, ty, facing, shell }                                   … 単眼の暴君をもう 1 体置く (帯 / 殻)
 *   o.action = 'cast' | 'turn' | 'breath' | 'eye' | 'none'              … 敵にやらせる 1 手
 *   o.seq / o.fb                                                        … Math.random の列と、尽きた後の定数
 *   o.noCounter (tryCounterEnemySpell を false に差し替える = カウンター無しの腕) / o.realCast / o.stubProj / o.wantOf
 */
function install() {
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));
  const REAL_CAST = window.dfPlayCast;
  const STUB_CAST = function () { return Promise.resolve(); };
  window.dfPlayCast = STUB_CAST;
  const TILE = TILE_SIZE;
  let lane = null;
  for (let ty = 1; ty < MAP_H - 1 && !lane; ty++) {
    let run = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) { run++; if (run >= 14) { lane = { ty: ty, tx0: tx - run + 1 }; break; } }
      else run = 0;
    }
  }
  for (const e of enemies) { if (e) { e.alive = false; e.x = -999999; e.y = -999999; } }
  const ORIG = Math.random;
  const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
  const mages = allies.filter((a) => a.classKey === 'mage' && !a.isHero);
  const war = allies.find((a) => a.classKey === 'warrior');
  const PBK = ['skipNextTurn', 'confused', 'sleepRemaining', 'wildConfused'];
  const PB0 = {}; for (const k of PBK) PB0[k] = playerBuffs[k];
  window.__broken = []; window.__counteredPops = [];
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (!n || !n.classList) continue;
      if (n.classList.contains('fxCastCircle')) {
        setTimeout(() => { if (n.classList.contains('fxCastCircle--broken')) window.__broken.push({ cls: n.className }); }, 0);
      }
      if (n.classList.contains('rollPop') && /COUNTERED/.test(n.textContent || '')) window.__counteredPops.push(n.textContent);
    }
  }).observe(document.body, { childList: true, subtree: true });

  const tileOfCenter = (cx, cy) => ({ cx: cx, cy: cy, tx: Math.floor(cx / TILE), ty: Math.floor(cy / TILE) });
  const P = {
    lane: lane, TILE: TILE, mages: mages, war: war,
    tileOf: (u) => { if (!u || !u.def) return null; const s = u.def.displaySize || 96; return tileOfCenter(u.x + s / 2, u.y + s / 2); },
    heroTile: () => tileOfCenter(playerX + 48, playerY + 58),
    placeHero: (tx, ty) => { playerX = tx * TILE + TILE / 2 - 48; playerY = ty * TILE + TILE / 2 - 58; },
    setUnit: setUnit,
    killAll: () => { for (const e of enemies) { if (e) { e.alive = false; e.x = -999999; e.y = -999999; } } },
    addEnemy: function (type, tx, ty) {
      const idx = enemies.length;
      const e = createEnemy(type, tx, ty);
      enemies.push(e); createEnemyDom(idx, e.def, e.type);
      e.alive = true; e.inactive = false; e.maxHp = 9999; e.hp = 9999; e.spellCooldown = 0;
      setUnit(e, tx, ty);
      return idx;
    },
    rng: function (seq, fb) {
      const q = seq.slice(); const st = { n: 0 };
      Math.random = () => { st.n++; return q.length ? q.shift() : fb; };
      return { done: () => { Math.random = ORIG; return { n: st.n, left: q.length }; } };
    },
    restoreRandom: () => { Math.random = ORIG; },
    snap: function () {
      const sl = (u) => ((u && u.spellSlots) || {}).counterspell || 0;
      return { hp: hp, m1: mages[0].hp, m2: mages[1].hp, war: war.hp,
        hs: currentSpellSlots.counterspell || 0, s1: sl(mages[0]), s2: sl(mages[1]) };
    },
    setup: function (o) {
      const L = lane;
      Math.random = ORIG;
      gameOver = false; try { encounterActive = false; } catch (e) {} dialogPaused = true;
      for (const k of PBK) playerBuffs[k] = PB0[k];
      Object.assign(playerBuffs, o.heroBuffs || {});
      maxHp = 200; hp = (o.heroHp != null ? o.heroHp : 200);
      this.placeHero(o.heroTx != null ? o.heroTx : L.tx0, o.heroTy != null ? o.heroTy : L.ty);
      initLeaderSpellSlots('mage', 10, { mage: { counterspell: (o.heroSlots != null ? o.heroSlots : 2) } });
      for (const a of allies) {
        a.alive = false; a.maxHp = 200; a.hp = 200; a.stunned = 0; a.confused = 0; a.wildConfused = 0;
        setUnit(a, -9999, -9999);
      }
      const confs = [(o.m1 === undefined ? { slots: 2 } : o.m1), (o.m2 === undefined ? null : o.m2)];
      mages.forEach((m, i) => {
        const c = confs[i];
        initAllySpellSlots(m, 'mage', 10, { mage: { counterspell: (c && c.slots != null) ? c.slots : (c ? 2 : 0) } });
        if (!c) return;
        m.alive = true; m.hp = (c.hp != null ? c.hp : 200);
        Object.assign(m, c.st || {});
        setUnit(m, (c.tx != null ? c.tx : L.tx0 + 1 + i), (c.ty != null ? c.ty : L.ty));
      });
      if (o.war) { war.alive = true; war.hp = (o.war.hp != null ? o.war.hp : 200); setUnit(war, (o.war.tx != null ? o.war.tx : L.tx0 + 3), L.ty); }
      this.killAll();
      const idx = this.addEnemy(o.enemy || 'lich', (o.eTx != null ? o.eTx : L.tx0 + 7), (o.eTy != null ? o.eTy : L.ty));
      if (o.sov) {
        const si = this.addEnemy('sovereignEye', o.sov.tx, (o.sov.ty != null ? o.sov.ty : L.ty));
        const s = enemies[si];
        s.everSeen = true; s.facing = o.sov.facing || undefined; s.shellActiveRemaining = o.sov.shell || 0;
      }
      window.__counterspellProbe = []; window.__broken.length = 0; window.__counteredPops.length = 0; window.__castCircleProbe = [];
      return idx;
    },
    end: function () {
      this.killAll();
      dialogPaused = false; gameOver = true; Math.random = ORIG;
      for (const k of PBK) playerBuffs[k] = PB0[k];
    },
    wrap: function () {
      const orig = window.tryCounterEnemySpell;
      const st = { calls: 0, inside: 0, rets: [] };
      window.tryCounterEnemySpell = async function () {
        st.calls++;
        const R = Math.random;
        Math.random = function () { st.inside++; return R.apply(this, arguments); };
        let ret;
        try { ret = await orig.apply(this, arguments); } finally { Math.random = R; }
        st.rets.push(ret);
        return ret;
      };
      st.undo = () => { window.tryCounterEnemySpell = orig; };
      return st;
    },
    trial: async function (o) {
      o = o || {};
      const idx = this.setup(o);
      const e = enemies[idx];
      const pre = {
        hero: this.heroTile(), m1: mages[0].alive ? this.tileOf(mages[0]) : null, m2: mages[1].alive ? this.tileOf(mages[1]) : null,
        e: this.tileOf(e), shell: isSovereignShellActive(), rayHero: isOnSovereignRay('player'), rayM1: isOnSovereignRay(mages[0]),
        want: o.wantOf ? counterspellWanted(ENEMY_SPELLS[o.wantOf]) : null, cd0: e.spellCooldown,
      };
      const box = { x: e.x, y: e.y, size: e.def.displaySize, name: e.def.name };
      const s0 = this.snap();
      let st = null, undoNo = null, undoProj = null;
      if (o.noCounter) { const orig = window.tryCounterEnemySpell; window.tryCounterEnemySpell = async () => false; undoNo = () => { window.tryCounterEnemySpell = orig; }; }
      else st = this.wrap();
      if (o.realCast) window.dfPlayCast = REAL_CAST;
      if (o.stubProj) { const op = window.spawnFireballProjectile; window.spawnFireballProjectile = () => Promise.resolve(); undoProj = () => { window.spawnFireballProjectile = op; }; }
      const r = this.rng(o.seq || [], (o.fb != null ? o.fb : 0.5));
      let err = null, rn = null;
      try {
        const act = o.action || 'cast';
        if (act === 'cast') await enemyCastSpell(idx);
        else if (act === 'turn') await enemyAttackTurn(idx);
        else if (act === 'breath') await window.__plaza.fireBreath(idx);
        else if (act === 'eye') await sovereignEyeStalkTurn(idx);
      } catch (ex) { err = String((ex && ex.message) || ex); }
      finally {
        rn = r.done();
        if (st) st.undo(); if (undoNo) undoNo(); if (undoProj) undoProj();
        window.dfPlayCast = STUB_CAST;
      }
      await new Promise((res) => setTimeout(res, 60));
      const s1 = this.snap();
      const out = {
        name: o.name || '', s0: s0, s1: s1, err: err, rn: rn, pre: pre, box: box, gameOverAfter: gameOver,
        dmg: { hp: s0.hp - s1.hp, m1: s0.m1 - s1.m1, m2: s0.m2 - s1.m2, war: s0.war - s1.war },
        calls: st ? st.calls : null, inside: st ? st.inside : null, rets: st ? st.rets.slice() : null,
        probe: window.__counterspellProbe.slice(), broken: window.__broken.slice(), pops: window.__counteredPops.slice(),
        circles: (window.__castCircleProbe || []).slice(), cd1: e.spellCooldown, cdTurns: e.def.spellCooldownTurns,
      };
      out.loss = out.dmg.hp + out.dmg.m1 + out.dmg.m2 + out.dmg.war;
      this.end();
      return out;
    },
    trials: async function (list) { const out = []; for (const o of list) out.push(await this.trial(o)); return out; },
  };
  window.__cs96 = P;
  return { lane: lane, TILE: TILE, nMages: mages.length, hasWar: !!war,
    m1Idx: mages[0] ? allies.indexOf(mages[0]) : -1, m2Idx: mages[1] ? allies.indexOf(mages[1]) : -1,
    m1Name: mages[0] ? (mages[0].npcName || (mages[0].def && mages[0].def.name)) : null, leader: getLeaderName() };
}

/* ドライバ側の距離 (タイル添字のチェビシェフ) */
const cheb = (a, b) => Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
/* ドライバ側の最大ダメージ (ダイスの最大 + flat、rays 倍。クリティカルは数えない) */
function maxDmg(meta) {
  const m = String(meta.dmgDice || '0d0').match(/^(\d+)d(\d+)$/);
  return m ? (parseInt(m[1], 10) * parseInt(m[2], 10) + (meta.flat || 0)) * (meta.rays || 1) : NaN;
}
/* 試行の結果から「誰が唱えたか」を読む。probe と枠の増減の両方が揃って初めてその人 */
function whoCast(t, A) {
  const p = t.probe;
  const d = { hs: t.s1.hs - t.s0.hs, s1: t.s1.s1 - t.s0.s1, s2: t.s1.s2 - t.s0.s2 };
  if (t.err) return 'err(' + t.err + ')';
  if (p.length === 0 && d.hs === 0 && d.s1 === 0 && d.s2 === 0) return 'none';
  if (p.length === 1 && p[0].unit === 'player' && d.hs === -1 && d.s1 === 0 && d.s2 === 0) return 'hero';
  if (p.length === 1 && p[0].unit === A.m1Idx && d.s1 === -1 && d.hs === 0 && d.s2 === 0) return 'm1';
  if (p.length === 1 && p[0].unit === A.m2Idx && d.s2 === -1 && d.hs === 0 && d.s1 === 0) return 'm2';
  return 'odd' + JSON.stringify({ p: p.map((x) => x.unit), d: d });
}
/* HP を引く点 (verify_run_chronicle (0c) と同じ数え方。⚠ 正規表現は文字列から組む) */
function countHpWrites(src) {
  const reA = new RegExp('\\bhp\\s*-=', 'g');
  const reB = new RegExp('\\bhp\\s*=\\s*Math\\.max\\(\\s*0\\s*,\\s*[A-Za-z0-9_.\\[\\]]*\\.?hp\\s*-', 'g');
  const a = (src.match(reA) || []).length;
  const b = (src.match(reB) || []).length;
  return { a: a, b: b, total: a + b };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_counterspell_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile, '--mute-audio'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : ''));
    const page = await openIndex(browser, '');

    /* ══ §0 装置 ══ */
    const a0 = await page.evaluate(() => {
      const sk = getSkill('counterspell');
      const cat = SCROLL_CATALOG['scroll-counterspell'] || null;
      const am = allies.find((a) => a.classKey === 'mage' && !a.isHero);
      const sv = am ? { eq: am.equippedSkills, sl: am.spellSlots, ms: am.maxSpellSlots, mt: am.maxSpellSlotsTotal } : null;
      const res = {};
      initLeaderSpellSlots('mage', 3, { mage: { counterspell: 2 } }); res.l3 = currentSpellSlots.counterspell || 0;
      initLeaderSpellSlots('mage', 2, { mage: { counterspell: 2 } }); res.l2 = currentSpellSlots.counterspell || 0;
      if (am) {
        initAllySpellSlots(am, 'mage', 3, { mage: { counterspell: 2 } }); res.a3 = am.spellSlots.counterspell || 0; res.a3eq = am.equippedSkills.slice();
        initAllySpellSlots(am, 'mage', 2, { mage: { counterspell: 2 } }); res.a2 = am.spellSlots.counterspell || 0;
        am.equippedSkills = sv.eq; am.spellSlots = sv.sl; am.maxSpellSlots = sv.ms; am.maxSpellSlotsTotal = sv.mt;
      }
      return { sk: sk ? { name: sk.name, reactive: sk.reactive, levelReq: sk.levelReq, range: sk.range, category: sk.category, target: sk.target } : null,
        cat: cat, known: isSpellKnown('mage', 'counterspell'), fn: typeof tryCounterEnemySpell, res: res, hasAlly: !!am };
    });
    check('(0a) [装置] getSkill("counterspell") が引ける / reactive = onEnemySpell / 巻物が SCROLL_CATALOG に在る (uncommon) / 習得済みの主人公と仲間の枠に Lv3 で載る (Lv2 では 0)',
      a0.sk && a0.sk.reactive === 'onEnemySpell' && a0.cat && a0.cat.spellId === 'counterspell' && a0.cat.rarity === 'uncommon'
      && a0.known === true && a0.fn === 'function' && a0.hasAlly
      && a0.res.l3 >= 1 && a0.res.a3 >= 1 && (a0.res.a3eq || []).includes('counterspell') && a0.res.l2 === 0 && a0.res.a2 === 0, a0);
    if (!results[results.length - 1].ok) {
      for (const l of ALL_LABELS) check(l + ' (0a) が赤なので測らない = 赤で記録', false, '装置が立っていない');
      throw { skipRest: true };
    }

    const A = await page.evaluate(install);
    if (!A.lane || A.nMages < 2 || !A.hasWar || A.m1Idx < 0 || A.m2Idx < 0) {
      check('(0b) [装置] 14 マス続く床の列 / 仲間の魔法使い 2 人 / 戦士 が揃う', false, A);
      for (const l of ALL_LABELS.filter((x) => x !== '(0b)')) check(l + ' (0b) の盤面が立たないので測らない = 赤で記録', false, A);
      throw { skipRest: true };
    }
    const L = A.lane;

    /* 視線を壁で切る床: リッチ (tx0+7) から 12 マス以内で、本番の hasLineOfSight と
     * ドライバ自前の線分サンプリング (1/8 マス刻みで通るマスに壁があるか) の両方が「切れる」と言う床 */
    const los = await page.evaluate((L) => {
      const T = TILE_SIZE;
      const ec = { tx: L.tx0 + 7, ty: L.ty }; const ex = ec.tx * T + T / 2, ey = ec.ty * T + T / 2;
      const sampled = (ax, ay, bx, by) => {
        const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / (T / 8)) + 1; const walls = [];
        for (let i = 0; i <= n; i++) {
          const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; const tx = Math.floor(x / T), ty = Math.floor(y / T);
          if (isTileWall(tx, ty) && !walls.some((w) => w.tx === tx && w.ty === ty)) walls.push({ tx, ty });
        }
        return walls;
      };
      let pick = null;
      for (let d = 3; d <= 12 && !pick; d++) {
        for (let ty = ec.ty - d; ty <= ec.ty + d && !pick; ty++) for (let tx = ec.tx - d; tx <= ec.tx + d && !pick; tx++) {
          if (Math.max(Math.abs(tx - ec.tx), Math.abs(ty - ec.ty)) !== d || isTileWall(tx, ty)) continue;
          const cx = tx * T + T / 2, cy = ty * T + T / 2;
          if (hasLineOfSight(cx, cy, ex, ey)) continue;
          const w = sampled(cx, cy, ex, ey);
          if (w.length) pick = { tx, ty, walls: w.slice(0, 3) };
        }
      }
      const laneHero = { prod: hasLineOfSight(L.tx0 * T + T / 2, L.ty * T + T / 2, ex, ey), walls: sampled(L.tx0 * T + T / 2, L.ty * T + T / 2, ex, ey).length };
      return { pick, laneHero, e: ec };
    }, L);

    /* ══ §1 打ち消し ══ */
    /* (1a) 素の経路 (罠 B): ファイアボルトを 3 つの腕で同じ乱数の列から撃たせる。
     *   A = カウンター無し (関数を false に差し替え) / B = 枠 0 / C = 枠 2 (全員 HP 200 = 使う条件に当たらない)
     *   飛翔体の絵 (火の粉が毎フレーム乱数を引く) は即解決に差し替える。 */
    const SEQ1A = [0.5, 0.95, 0.6, 0.7, 0.3, 0.4, 0.2];
    const g1a = await page.evaluate(async (seq) => {
      const P = window.__cs96;
      return P.trials([
        { name: 'A', noCounter: true, stubProj: true, seq: seq, fb: 0.5 },
        { name: 'B', heroSlots: 0, m1: { slots: 0 }, stubProj: true, seq: seq, fb: 0.5 },
        { name: 'C', heroSlots: 2, m1: { slots: 2 }, stubProj: true, seq: seq, fb: 0.5 },
      ]);
    }, SEQ1A);
    const [ta, tb, tc] = g1a;
    const sameDmg = (x, y) => JSON.stringify(x.dmg) === JSON.stringify(y.dmg);
    check('(1a) 素の経路: 枠 0 でファイアボルトを撃たせると HP が減る。同じ乱数の列で、枠がある (が使う条件に当たらない) ときも被弾の値がまったく同じ = カウンター無しの腕と一致 (罠 B: 打ち消さないときは乱数を引かない)',
      ta.loss > 0 && !ta.err && sameDmg(ta, tb) && sameDmg(ta, tc) && tb.rn.n === ta.rn.n && tc.rn.n === ta.rn.n
      && tb.inside === 0 && tc.inside === 0 && tb.calls === 1 && tc.calls === 1 && tc.rets[0] === false
      && tc.s1.hs === 2 && tc.s1.s1 === 2 && tb.probe.length === 0 && tc.probe.length === 0,
      { dmg: { A: ta.dmg, B: tb.dmg, C: tc.dmg }, randomCalls: [ta.rn.n, tb.rn.n, tc.rn.n], insideCounter: [tb.inside, tc.inside], calls: [tb.calls, tc.calls], retC: tc.rets, slotsC: [tc.s1.hs, tc.s1.s1] });

    /* (1b) ファイアボール (リッチ): 枠があれば HP が 1 も減らない・主人公の枠が 1 減る・probe 1 件。対照 = カウンター無しでは減る */
    const g1b = await page.evaluate(async () => {
      const P = window.__cs96;
      return P.trials([
        { name: 'ctl', noCounter: true, seq: [0.9], fb: 0.5 },
        { name: 'cs', heroSlots: 2, m1: { slots: 2 }, seq: [0.9], fb: 0.5 },
      ]);
    });
    const [b0, b1] = g1b;
    check('(1b) ファイアボール (リッチ) を撃たせると、カウンターの枠があればパーティの HP が 1 も減らない・枠が 1 減る (主人公 2 → 1)・__counterspellProbe に 1 件 (対照: カウンター無しでは HP が減る)',
      b0.loss > 0 && b1.loss === 0 && !b1.err && b1.s0.hs === 2 && b1.s1.hs === 1 && b1.s1.s1 === 2 && b1.probe.length === 1
      && b1.probe[0].unit === 'player' && b1.probe[0].spell === 'fireball' && b1.probe[0].enemy === b1.box.name && b1.probe[0].caster === A.leader,
      { ctlLoss: b0.loss, loss: b1.loss, slots: [b1.s0.hs + '→' + b1.s1.hs, b1.s0.s1 + '→' + b1.s1.s1], probe: b1.probe });

    /* (1c) シャター (蛇神司祭 0.9 → 4 番目) とスコーチングレイ (オーク呪術師 0.9 → 3 番目)。全員 HP 満タンでも打ち消す */
    const g1c = await page.evaluate(async () => {
      const P = window.__cs96;
      return P.trials([
        { name: 'shatterCtl', enemy: 'lizardPriest', noCounter: true, seq: [0.9], fb: 0.99 },
        { name: 'shatter',    enemy: 'lizardPriest', seq: [0.9], fb: 0.99 },
        { name: 'rayCtl',     enemy: 'orcShaman', noCounter: true, seq: [0.9], fb: 0.99 },
        { name: 'ray',        enemy: 'orcShaman', seq: [0.9], fb: 0.99 },
      ]);
    });
    const c1 = Object.fromEntries(g1c.map((t) => [t.name, t]));
    const full = (t) => t.s0.hp === 200 && t.s0.m1 === 200;
    check('(1c) シャターとスコーチングレイも、全員の HP が満タンでも打ち消す (被弾 0・主人公の枠 -1・probe の呪文名が一致。対照: カウンター無しでは HP が減る)',
      c1.shatterCtl.loss > 0 && c1.rayCtl.loss > 0 && full(c1.shatter) && full(c1.ray)
      && c1.shatter.loss === 0 && c1.ray.loss === 0 && whoCast(c1.shatter, A) === 'hero' && whoCast(c1.ray, A) === 'hero'
      && c1.shatter.probe[0].spell === 'shatter' && c1.ray.probe[0].spell === 'scorchingRay',
      { ctl: [c1.shatterCtl.loss, c1.rayCtl.loss], loss: [c1.shatter.loss, c1.ray.loss], who: [whoCast(c1.shatter, A), whoCast(c1.ray, A)], spells: [c1.shatter.probe.map((p) => p.spell), c1.ray.probe.map((p) => p.spell)] });

    /* (1d) 単体の軽い呪文の境目。最大値はドライバがダイスの式から計算する (fireBolt 12 / magicMissile 13 / scorchingRay 24) */
    const spells = await page.evaluate(() => ({
      tbl: Object.fromEntries(['fireBolt', 'magicMissile', 'scorchingRay'].map((k) => [k, { dmgDice: ENEMY_SPELLS[k].dmgDice, flat: ENEMY_SPELLS[k].flat || 0, rays: ENEMY_SPELLS[k].rays || 1 }])),
      prod: ['fireBolt', 'magicMissile', 'scorchingRay'].map((k) => enemySpellMaxDamage(ENEMY_SPELLS[k])),
    }));
    const MX = { fireBolt: maxDmg(spells.tbl.fireBolt), magicMissile: maxDmg(spells.tbl.magicMissile), scorchingRay: maxDmg(spells.tbl.scorchingRay) };
    const lowCases = [];
    for (const [sp, r] of [['fireBolt', 0.5], ['magicMissile', 0.1]]) {
      const mx = MX[sp], base = mx + 1;
      lowCases.push({ name: sp + ':all' + base, expect: 'none', o: { heroHp: base, m1: { slots: 2, hp: base }, war: { hp: base }, seq: [r], fb: 0.5 } });
      lowCases.push({ name: sp + ':hero' + mx, expect: 'hero', o: { heroHp: mx, m1: { slots: 2, hp: base }, war: { hp: base }, seq: [r], fb: 0.5 } });
      lowCases.push({ name: sp + ':m1' + mx, expect: 'hero', o: { heroHp: base, m1: { slots: 2, hp: mx }, war: { hp: base }, seq: [r], fb: 0.5 } });
      lowCases.push({ name: sp + ':war' + mx, expect: 'hero', o: { heroHp: base, m1: { slots: 2, hp: base }, war: { hp: mx }, seq: [r], fb: 0.5 } });
    }
    const g1d = await page.evaluate(async (list) => window.__cs96.trials(list), lowCases.map((c) => c.o));
    const d1 = lowCases.map((c, i) => ({ name: c.name, want: c.expect, got: whoCast(g1d[i], A), loss: g1d[i].loss, spell: g1d[i].probe.map((p) => p.spell) }));
    check('(1d) ファイアボルト: 全員 ' + (MX.fireBolt + 1) + ' 以上なら打ち消さない / 誰か 1 人 (主人公・仲間・戦士) を ' + MX.fireBolt + ' にすると打ち消す。マジックミサイル: ' + (MX.magicMissile + 1) + ' / ' + MX.magicMissile + ' の境目で同じ (最大値はドライバがダイスの式から計算)',
      MX.fireBolt === 12 && MX.magicMissile === 13 && MX.scorchingRay === 24 && JSON.stringify(spells.prod) === '[12,13,24]'
      && d1.every((x) => x.want === x.got) && d1.filter((x) => x.want === 'hero').every((x) => x.loss === 0),
      { max: MX, prod: spells.prod, cases: d1.map((x) => x.name + ' ' + x.want + '/' + x.got + ' loss' + x.loss).join(' | ') });

    /* (1e) enemyAttackTurn 経由 (オーク呪術師・クールダウン 0・射程内) で打ち消されても spellCooldown = turns + 1 */
    const g1e = await page.evaluate(async () => {
      const P = window.__cs96;
      return P.trials([
        { name: 'ctl', enemy: 'orcShaman', action: 'turn', noCounter: true, seq: [], fb: 0.9 },
        { name: 'cs',  enemy: 'orcShaman', action: 'turn', seq: [], fb: 0.9 },
      ]);
    });
    const [e0, e1] = g1e;
    const expCd = (e1.cdTurns || 2) + 1;
    check('(1e) enemyAttackTurn 経由で打ち消されても、敵の spellCooldown が (spellCooldownTurns || 2) + 1 = ' + expCd + ' になる (打ち消さない腕と同じ・0 から始めた)',
      e1.pre.cd0 === 0 && e0.pre.cd0 === 0 && e1.cd1 === expCd && e0.cd1 === expCd && whoCast(e1, A) === 'hero' && e1.loss === 0 && e0.loss > 0 && !e1.err && !e0.err,
      { cd: { ctl: e0.pre.cd0 + '→' + e0.cd1, cs: e1.pre.cd0 + '→' + e1.cd1, want: expCd }, who: whoCast(e1, A), loss: [e0.loss, e1.loss], spell: e1.probe.map((p) => p.spell) });

    /* (1f) 唱える人の順: 主人公 → allies の並び順 */
    const g1f = await page.evaluate(async () => {
      const P = window.__cs96;
      const tx0 = P.lane.tx0;
      return P.trials([
        { name: 'all', heroSlots: 2, m1: { slots: 2, tx: tx0 + 1 }, m2: { slots: 2, tx: tx0 + 2 }, seq: [0.9], fb: 0.5 },
        { name: 'heroEmpty', heroSlots: 0, m1: { slots: 2, tx: tx0 + 1 }, m2: { slots: 2, tx: tx0 + 2 }, seq: [0.9], fb: 0.5 },
        { name: 'firstEmpty', heroSlots: 0, m1: { slots: 0, tx: tx0 + 1 }, m2: { slots: 2, tx: tx0 + 2 }, seq: [0.9], fb: 0.5 },
      ]);
    });
    const firstMage = A.m1Idx < A.m2Idx ? 'm1' : 'm2', secondMage = firstMage === 'm1' ? 'm2' : 'm1';
    const f1 = g1f.map((t) => whoCast(t, A));
    check('(1f) 唱える人の順: 主人公と仲間の両方に枠があれば主人公の枠だけが減る。主人公の枠が 0 なら仲間の先頭 (allies の添字 ' + Math.min(A.m1Idx, A.m2Idx) + ') の枠が減る。先頭も 0 なら次の仲間',
      f1[0] === 'hero' && f1[1] === firstMage && f1[2] === secondMage,
      { got: f1, want: ['hero', firstMage, secondMage], alliesIdx: { m1: A.m1Idx, m2: A.m2Idx } });

    /* ══ §2 唱えられない 5 条件 (それぞれ単独で崩す。もう 1 人が満たしていればそちらが唱える) ══ */
    const tx0 = L.tx0;
    const FB = { seq: [0.9], fb: 0.5 };
    const C2 = [];
    const add2 = (sec, name, want, o) => C2.push({ sec, name, want, o: Object.assign({}, FB, o) });
    /* (2a) 枠 */
    add2('2a', 'both0', 'none', { heroSlots: 0, m1: { slots: 0 } });
    add2('2a', 'hero0→m1', 'm1', { heroSlots: 0, m1: { slots: 2 } });
    add2('2a', 'm1:0→hero', 'hero', { heroSlots: 2, m1: { slots: 0 } });
    /* (2b) 倒れている */
    add2('2b', 'heroDown', 'none', { heroHp: 0, heroSlots: 2, m1: { slots: 0 } });
    add2('2b', 'heroDown→m1', 'm1', { heroHp: 0, heroSlots: 2, m1: { slots: 2 } });
    add2('2b', 'm1Down', 'none', { heroSlots: 0, m1: { slots: 2, hp: 0, st: { alive: false } } });
    add2('2b', 'm1Down→hero', 'hero', { heroSlots: 2, m1: { slots: 2, hp: 0, st: { alive: false } } });
    /* (2c) 眠り / スタン / 混乱 */
    for (const [k, v] of [['sleepRemaining', 2], ['skipNextTurn', true], ['confused', 2], ['wildConfused', 2]]) {
      add2('2c', 'hero.' + k, 'none', { heroSlots: 2, heroBuffs: { [k]: v }, m1: { slots: 0 } });
      add2('2c', 'hero.' + k + '→m1', 'm1', { heroSlots: 2, heroBuffs: { [k]: v }, m1: { slots: 2 } });
    }
    for (const [k, v] of [['stunned', 2], ['confused', 2], ['wildConfused', 2]]) {
      add2('2c', 'm1.' + k, 'none', { heroSlots: 0, m1: { slots: 2, st: { [k]: v } } });
      add2('2c', 'm1.' + k + '→hero', 'hero', { heroSlots: 2, m1: { slots: 2, st: { [k]: v } } });
    }
    /* (2d) 13 マス離す (リッチを tx0+13 へ) / 視線を壁で切る (リッチは tx0+7) */
    add2('2d', 'hero13', 'none', { eTx: tx0 + 13, heroTx: tx0, heroSlots: 2, m1: { slots: 0, tx: tx0 + 1 } });
    add2('2d', 'hero13→m1@12', 'm1', { eTx: tx0 + 13, heroTx: tx0, heroSlots: 2, m1: { slots: 2, tx: tx0 + 1 } });
    add2('2d', 'm1@13', 'none', { eTx: tx0 + 13, heroTx: tx0 + 1, heroSlots: 0, m1: { slots: 2, tx: tx0 } });
    add2('2d', 'm1@13→hero@12', 'hero', { eTx: tx0 + 13, heroTx: tx0 + 1, heroSlots: 2, m1: { slots: 2, tx: tx0 } });
    if (los.pick) {
      add2('2d', 'heroWall', 'none', { heroTx: los.pick.tx, heroTy: los.pick.ty, heroSlots: 2, m1: { slots: 0 } });
      add2('2d', 'heroWall→m1', 'm1', { heroTx: los.pick.tx, heroTy: los.pick.ty, heroSlots: 2, m1: { slots: 2 } });
      add2('2d', 'm1Wall', 'none', { heroSlots: 0, m1: { slots: 2, tx: los.pick.tx, ty: los.pick.ty } });
      add2('2d', 'm1Wall→hero', 'hero', { heroSlots: 2, m1: { slots: 2, tx: los.pick.tx, ty: los.pick.ty } });
    }
    /* (2e) 殻の展開中 (両方とも唱えられない) / 帯の上 (暴君を tx0+3 に置き、向きで主人公側か仲間側かを選ぶ) */
    add2('2e', 'shell', 'none', { heroSlots: 2, m1: { slots: 2 }, sov: { tx: tx0 + 12, shell: 3 } });
    add2('2e', 'heroRay', 'none', { heroSlots: 2, m1: { slots: 0, tx: tx0 + 5 }, sov: { tx: tx0 + 3, facing: 'left' } });
    add2('2e', 'heroRay→m1', 'm1', { heroSlots: 2, m1: { slots: 2, tx: tx0 + 5 }, sov: { tx: tx0 + 3, facing: 'left' } });
    add2('2e', 'm1Ray', 'none', { heroSlots: 0, m1: { slots: 2, tx: tx0 + 5 }, sov: { tx: tx0 + 3, facing: 'right' } });
    add2('2e', 'm1Ray→hero', 'hero', { heroSlots: 2, m1: { slots: 2, tx: tx0 + 5 }, sov: { tx: tx0 + 3, facing: 'right' } });
    const g2 = await page.evaluate(async (list) => window.__cs96.trials(list), C2.map((c) => c.o));
    const r2 = C2.map((c, i) => ({ sec: c.sec, name: c.name, want: c.want, got: whoCast(g2[i], A), t: g2[i] }));
    const sec2 = (s) => r2.filter((x) => x.sec === s);
    const line2 = (s) => sec2(s).map((x) => x.name + ' ' + x.want + '/' + x.got).join(' | ');
    const okAll = (s) => sec2(s).length > 0 && sec2(s).every((x) => x.want === x.got);
    const g2a = sec2('2a');
    check('(2a) 枠 0: 2 人とも 0 なら打ち消さない (被弾が出る・枠は動かない)。片方に枠があればそちらが唱える',
      okAll('2a') && g2a[0].t.loss > 0, line2('2a') + ' | both0.loss=' + g2a[0].t.loss);
    check('(2b) 倒れている: 主人公 (hp 0) / 仲間 (alive=false) は唱えない。もう 1 人が満たしていればそちらが唱える',
      okAll('2b') && sec2('2b').every((x) => !x.t.gameOverAfter || x.want === 'none'), line2('2b'));
    check('(2c) 眠り / スタン / 混乱: 主人公 (sleepRemaining / skipNextTurn / confused / wildConfused)・仲間 (stunned / confused / wildConfused) は唱えない。もう 1 人が満たしていればそちらが唱える',
      okAll('2c') && sec2('2c').length === 14, line2('2c'));
    /* 距離はドライバが座標から計算する */
    const d2 = sec2('2d').map((x) => ({ name: x.name, hero: cheb(x.t.pre.hero, x.t.pre.e), m1: x.t.pre.m1 ? cheb(x.t.pre.m1, x.t.pre.e) : null }));
    const dOf = (n) => d2.find((x) => x.name === n) || {};
    check('(2d) 13 マス離す (ドライバの計算で 13 / 12 は届く) / 視線を壁で切る: 唱えない。もう 1 人が満たしていればそちらが唱える',
      okAll('2d') && !!los.pick && sec2('2d').length === 8 && dOf('hero13').hero === 13 && dOf('hero13→m1@12').m1 === 12
      && dOf('m1@13').m1 === 13 && dOf('m1@13→hero@12').hero === 12 && dOf('heroWall').hero <= 12 && dOf('m1Wall').m1 <= 12,
      line2('2d') + ' | dist ' + JSON.stringify(d2.map((x) => x.name + ':' + x.hero + '/' + x.m1)));
    const e2 = Object.fromEntries(sec2('2e').map((x) => [x.name, x]));
    check('(2e) 殻の展開中は 2 人とも唱えない / 帯の上の人は唱えない (本番の isOnSovereignRay で帯の上か確かめる)。帯の外のもう 1 人が満たしていればそちらが唱える',
      okAll('2e') && e2.shell.t.pre.shell === true && e2.heroRay.t.pre.rayHero === true && e2.heroRay.t.pre.rayM1 === false
      && e2.m1Ray.t.pre.rayM1 === true && e2.m1Ray.t.pre.rayHero === false && e2['heroRay→m1'].t.pre.rayHero === true && e2['m1Ray→hero'].t.pre.rayM1 === true,
      line2('2e') + ' | pre ' + JSON.stringify(sec2('2e').map((x) => x.name + ':' + x.t.pre.shell + '/' + x.t.pre.rayHero + '/' + x.t.pre.rayM1)));

    /* (0b) 盤面: 距離・視線を「届く」「届かない」の両方で作れている (距離はドライバの計算) */
    const db = { hero: cheb(b1.pre.hero, b1.pre.e), m1: cheb(b1.pre.m1, b1.pre.e) };
    const losTile = los.pick ? { tx: los.pick.tx, ty: los.pick.ty } : null;
    check('(0b) [装置] 盤面: 届く側 (主人公 ' + db.hero + ' / 仲間 ' + db.m1 + ' マス・視線あり) と 届かない側 (13 マス / 壁越し) の両方を作れている (距離はドライバが座標から計算・壁越しは本番の hasLineOfSight とドライバの線分サンプリングの両方が「切れる」)',
      db.hero <= 12 && db.m1 <= 12 && los.laneHero.prod === true && los.laneHero.walls === 0
      && !!los.pick && cheb(losTile, los.e) <= 12 && los.pick.walls.length > 0 && dOf('hero13').hero === 13,
      { lane: L, near: db, far13: dOf('hero13').hero, wallTile: los.pick, laneLos: los.laneHero });

    /* ══ §3 指輪と、打ち消さないもの ══ */
    const g3 = await page.evaluate(async () => {
      const P = window.__cs96;
      const ring = 'ring_spell_turning';
      const out = {};
      const inv = window.__plaza.inv();
      delete inv[ring];
      window.__plaza.addChargeItem(ring);
      out.c0 = window.__plaza.countCharges(ring);
      out.a = await P.trial({ heroSlots: 2, m1: { slots: 2 }, seq: [0.9], fb: 0.5 });
      out.c1 = window.__plaza.countCharges(ring);
      while (window.__plaza.hasChargeItem(ring)) window.__plaza.consumeCharge(ring);
      out.c2 = window.__plaza.countCharges(ring);
      out.b = await P.trial({ heroSlots: 2, m1: { slots: 2 }, seq: [0.9], fb: 0.5 });
      out.c3 = window.__plaza.countCharges(ring);
      delete window.__plaza.inv()[ring];
      /* (3c) ブレス: ファラクサス (単頭ボス) の hydraFireBreath を __plaza.fireBreath で */
      out.c = await P.trial({ enemy: 'pharaxus', action: 'breath', heroSlots: 2, m1: { slots: 2 }, seq: [], fb: 0.5 });
      /* (3d) 単眼の暴君の眼柄 MM (乱数 0.01 = 毎発 魔弾の目)。仲間の HP 13 = 敵の MM なら打ち消す条件に当たる */
      out.d = await P.trial({ enemy: 'sovereignEye', action: 'eye', heroSlots: 2, m1: { slots: 2, hp: 13 }, wantOf: 'magicMissile', seq: [], fb: 0.01 });
      return out;
    });
    check('(3a) 指輪を持っていれば指輪が跳ね返し、カウンターの枠は減らない (二重にならない・tryCounterEnemySpell は呼ばれない・指輪の回数が 1 減る・被弾 0)',
      g3.c0 >= 1 && g3.c1 === g3.c0 - 1 && g3.a.calls === 0 && g3.a.probe.length === 0 && whoCast(g3.a, A) === 'none' && g3.a.loss === 0 && !g3.a.err,
      { charges: [g3.c0, g3.c1], calls: g3.a.calls, who: whoCast(g3.a, A), loss: g3.a.loss, slots: [g3.a.s1.hs, g3.a.s1.s1] });
    check('(3b) 指輪の回数を使い切った状態ではカウンターが打ち消す (被弾 0・主人公の枠 -1)',
      g3.c2 === 0 && g3.c3 === 0 && whoCast(g3.b, A) === 'hero' && g3.b.loss === 0 && g3.b.calls === 1,
      { charges: [g3.c2, g3.c3], who: whoCast(g3.b, A), loss: g3.b.loss, calls: g3.b.calls });
    check('(3c) hydraFireBreath (__plaza.fireBreath・ファラクサス) は、カウンターの枠があっても打ち消されない (被弾が出る・枠が減らない・tryCounterEnemySpell は呼ばれない)',
      g3.c.loss > 0 && !g3.c.err && whoCast(g3.c, A) === 'none' && g3.c.calls === 0,
      { loss: g3.c.loss, dmg: g3.c.dmg, who: whoCast(g3.c, A), calls: g3.c.calls, err: g3.c.err });
    check('(3d) 単眼の暴君の眼柄 (sovereignEyeStalkTurn) の MM は打ち消されない (敵の MM なら打ち消す HP なのに被弾が出る・枠が減らない・tryCounterEnemySpell は呼ばれない)',
      g3.d.pre.want === true && g3.d.loss > 0 && !g3.d.err && whoCast(g3.d, A) === 'none' && g3.d.calls === 0,
      { want: g3.d.pre.want, loss: g3.d.loss, dmg: g3.d.dmg, who: whoCast(g3.d, A), calls: g3.d.calls, err: g3.d.err });

    /* ══ (4c) 年代記: 「使わなかった技」/ HP を引く点 ══ */
    const ch = await page.evaluate(async () => {
      const P = window.__cs96;
      const lists = () => RunChronicle.snapshot(null).idle.unusedByWho.filter((u) => u.skills.indexOf('カウンタースペル') >= 0).map((u) => u.who);
      const out = {};
      const sv = equippedSkills;
      try {
        equippedSkills = ['magic-missile'];
        let t = await P.trial({ heroSlots: 0, m1: { slots: 2 }, seq: [0.9], fb: 0.5 });
        out.allyUsed = { probe: t.probe.map((p) => p.unit), who: lists() };
        await P.trial({ heroSlots: 0, m1: { slots: 2 }, action: 'none' });
        out.allyUnused = { who: lists() };
        equippedSkills = ['magic-missile', 'counterspell'];
        t = await P.trial({ heroSlots: 2, m1: { slots: 0 }, seq: [0.9], fb: 0.5 });
        out.heroUsed = { probe: t.probe.map((p) => p.unit), who: lists() };
        await P.trial({ heroSlots: 2, m1: { slots: 0 }, action: 'none' });
        out.heroUnused = { who: lists() };
      } finally { equippedSkills = sv; }
      return out;
    });
    const hpNow = countHpWrites(FROZEN['/index.html'].toString('utf8'));
    let hpPre = null;
    try { hpPre = countHpWrites(execFileSync('git', ['show', PRE96_REV + ':index.html'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8')); } catch (e) { hpPre = { err: String(e.message || e).slice(0, 120) }; }
    const HERO_CH = 'あなた';   // 年代記の profileOf は主人公 (heroIsHead) を「あなた」と名乗る
    /* ★[#103 2026-10-28] 本番の HP を引く点は #103 の koboldSnare (族長の仕掛け罠・enemyAttackTurn の中 = 手番の内) で 1 つ増えて 46。
       #96 が点を増やしていないこと (= #96 の前と同じ数) は「今の数 − #103 の 1 点 = #96 の前の数」で測る (⛔ 期待値を緩めない)。 */
    const HP_ADDED_103 = 1;
    /* ★[#104 2026-10-29] さらに 1 点 = 疫病の司祭の「傷を腐らせる手」(inflictWoundsTouch) が仲間に与える傷 `ally.hp -= dmg`。
       呼び口は enemyAttackTurn の中 (ボスの手番の入口・pickBossAction の前) の 1 か所だけ = 手番の内 = 加害者は司祭 (2026-10-30 確認)。
       #96 の前の数は「今の数 − #103 の 1 点 − #104 の 1 点」で測る (⛔ 期待値を緩めない)。 */
    const HP_ADDED_104 = 1;
    check('(4c) 年代記: カウンターの枠を使ったら「使わなかった技」に入らない / 使わなければ入る (仲間 = ' + A.m1Name + ' / 主人公)。HP を引く点の総数は #96 の前 (' + PRE96_REV + ') の ' + (hpPre && hpPre.total) + ' + #103 の仕掛け罠 1 点 + #104 の傷を腐らせる手 1 点 (verify_run_chronicle (0c) = 47)',
      ch.allyUsed.probe.length === 1 && ch.allyUsed.probe[0] === A.m1Idx && ch.allyUsed.who.indexOf(A.m1Name) < 0 && ch.allyUnused.who.indexOf(A.m1Name) >= 0
      && ch.heroUsed.probe.length === 1 && ch.heroUsed.probe[0] === 'player' && ch.heroUsed.who.indexOf(HERO_CH) < 0 && ch.heroUnused.who.indexOf(HERO_CH) >= 0
      && hpPre && hpPre.total + HP_ADDED_103 + HP_ADDED_104 === hpNow.total && hpNow.total === 47 && hpPre.total === 45,
      { ch: ch, hp: { now: hpNow, pre: hpPre } });

    /* ══ (5b) 素の側の pickScrollId 全区間 ══ */
    const sweepFn = () => {
      const P = window.__cs96;
      const out = { uncommon: new Set(), rare: new Set(), common: new Set() };
      for (const rar of ['common', 'uncommon', 'rare']) {
        const w = { common: 0, uncommon: 0, rare: 0 }; w[rar] = 1;
        for (let k = 0; k < 2000; k++) { const v = (k + 0.5) / 2000; P.rng([], v); out[rar].add(pickScrollId(w)); P.restoreRandom(); }
      }
      const res = {};
      for (const k of Object.keys(out)) res[k] = [...out[k]].sort();
      res.catalogU = Object.keys(SCROLL_CATALOG).filter((id) => SCROLL_CATALOG[id].rarity === 'uncommon').sort();
      res.on = isCounterspellOn();
      return res;
    };
    const sweep = await page.evaluate(sweepFn);
    await page.close();

    /* ══ §4 (4a)(4b) 演出と語り — まだ 1 度も打ち消していない新しいページで (語りの旗が立っていない) ══ */
    const p4 = await openIndex(browser, '');
    await p4.evaluate(install);
    const g4 = await p4.evaluate(async () => {
      const P = window.__cs96;
      const dm = [];
      const origDm = window.showDMMessage;
      window.showDMMessage = function (t) { dm.push(String(t)); return origDm.apply(this, arguments); };
      const out = { sheet: MAGIC_CIRCLE_SHEET.loaded === true, autoplay: window.__autoplay || null, narrated0: counterspellNarrated };
      try {
        out.t1 = await P.trial({ heroSlots: 2, m1: { slots: 2 }, realCast: true, seq: [0.9], fb: 0.5 });
        out.dm1 = dm.filter((t) => t.indexOf('綾を断ち切る') >= 0).length;
        out.narrated1 = counterspellNarrated;
        out.t2 = await P.trial({ heroSlots: 2, m1: { slots: 2 }, realCast: true, seq: [0.9], fb: 0.5 });
        out.dm2 = dm.filter((t) => t.indexOf('綾を断ち切る') >= 0).length;
      } finally { window.showDMMessage = origDm; }
      return out;
    });
    await p4.close();
    const arc = (t) => t.circles.filter((c) => c.elem === 'arcane');
    const atFoot = (t) => arc(t).length === 1 && Math.abs(arc(t)[0].footWX - (t.box.x + t.box.size / 2)) < 0.01
      && arc(t)[0].footWY > t.box.y && arc(t)[0].footWY <= t.box.y + t.box.size;
    check('(4a) 打ち消したとき、敵の足元に新しい陣 (arcane) が 1 枚出て .fxCastCircle--broken が 1 枚付く・COUNTERED の札 (呪文名つき) が敵に出る。演出を省く __autoplay は立てない・本番の dfPlayCast (敵の陣は割り込む前に消える = 罠 A)',
      g4.sheet && !g4.autoplay && whoCast(g4.t1, A) === 'hero' && g4.t1.broken.length === 1 && atFoot(g4.t1)
      && g4.t1.pops.length === 1 && g4.t1.pops[0].indexOf('ファイアボール') >= 0,
      { sheet: g4.sheet, autoplay: g4.autoplay, who: whoCast(g4.t1, A), broken: g4.t1.broken.length, arcane: arc(g4.t1), enemyBox: g4.t1.box,
        pops: g4.t1.pops, circles: g4.t1.circles.map((c) => c.elem) });
    check('(4b) 語りは最初の 1 回だけ (1 回目の打ち消しで 1 回・2 回目は増えない。旗はページ内の let)',
      g4.narrated0 === false && g4.dm1 === 1 && g4.narrated1 === true && whoCast(g4.t2, A) === 'hero' && g4.dm2 === 1,
      { narrated0: g4.narrated0, dm: [g4.dm1, g4.dm2], narrated1: g4.narrated1, who2: whoCast(g4.t2, A) });

    /* ══ §5 撤退 ══ */
    const off = await openIndex(browser, '?counterspell=0');
    await off.evaluate(install);
    const o5 = await off.evaluate(async () => {
      const P = window.__cs96;
      const t = await P.trial({ heroSlots: 2, m1: { slots: 2 }, seq: [0.9], fb: 0.5 });
      return { t: t, on: isCounterspellOn(), known: isSpellKnown('mage', 'counterspell') };
    });
    check('(5a) ?counterspell=0 → 枠があっても (1b) の場面 (リッチのファイアボール) で被弾が出る・枠が減らない・probe 0 (tryCounterEnemySpell は false)',
      o5.on === false && o5.known === true && o5.t.loss > 0 && whoCast(o5.t, A) === 'none' && o5.t.calls === 1 && o5.t.rets[0] === false && o5.t.s1.hs === 2 && o5.t.s1.s1 === 2,
      { on: o5.on, loss: o5.t.loss, who: whoCast(o5.t, A), rets: o5.t.rets, slots: [o5.t.s1.hs, o5.t.s1.s1] });
    const offSweep = await off.evaluate(sweepFn);
    await off.close();
    const SC = 'scroll-counterspell';
    const offAll = [].concat(offSweep.common, offSweep.uncommon, offSweep.rare);
    check('(5b) ?counterspell=0 → pickScrollId の全区間 (common / uncommon / rare) で巻物が出ない。素では uncommon の集合に入る (他の巻物は素と同じ)',
      sweep.on === true && sweep.uncommon.includes(SC) && JSON.stringify(sweep.uncommon) === JSON.stringify(sweep.catalogU)
      && offSweep.on === false && offAll.indexOf(SC) < 0
      && JSON.stringify(offSweep.uncommon) === JSON.stringify(sweep.uncommon.filter((x) => x !== SC))
      && JSON.stringify(offSweep.rare) === JSON.stringify(sweep.rare) && JSON.stringify(offSweep.common) === JSON.stringify(sweep.common),
      { plain: sweep.uncommon, off: offSweep.uncommon, offHasScroll: offAll.indexOf(SC) >= 0 });

    /* ══ (0c) 写し: index と tavern で 呪文の表・巻物の行・開発用の棚 が同じ中身で 1 行ずつ ══ */
    const IX = PRISTINE['/index.html'], TV = PRISTINE['/tavern.html'];
    const count = (s, re) => (s.match(re) || []).length;
    const rowOf = (s, re) => { const m = s.match(re); return m ? m[0].replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim() : null; };
    const scrollRe = new RegExp('^\\s*"scroll-counterspell":\\s*\\{[^\\n]*\\}', 'gm');
    const src = {
      ixSpell: count(IX, new RegExp('^\\s*"counterspell":\\s*\\{', 'gm')),
      tvSpell: count(TV, new RegExp('\\{ id: "counterspell",', 'g')),
      ixScroll: count(IX, scrollRe), tvScroll: count(TV, scrollRe),
      scrollSame: rowOf(IX, new RegExp(scrollRe.source, 'm')) === rowOf(TV, new RegExp(scrollRe.source, 'm')),
    };
    const tv = await openTavern(browser, '?dev=1');
    const tvVals = await tv.evaluate(() => {
      const s = MAGE_SKILLS_UI.find((x) => x.id === 'counterspell');
      return { ui: s ? [s.name, s.levelReq, s.range, s.mpCost, s.flavor] : null, autoCast: s ? s.autoCast : null,
        cat: JSON.stringify(SCROLL_CATALOG_TV['scroll-counterspell'] || null), shelf: SCROLL_DEV_SHELF_TV.slice() };
    });
    await tv.close();
    const p0c = await openIndex(browser, '');
    const ixVals = await p0c.evaluate(() => {
      const s = MAGE_SKILLS['counterspell'];
      return { ui: s ? [s.name, s.levelReq, s.range, s.mpCost, s.flavor] : null, cat: JSON.stringify(SCROLL_CATALOG['scroll-counterspell'] || null) };
    });
    await p0c.close();
    check('(0c) ソース 2 ファイルの写し 3 枚 (呪文の表の name / levelReq / mpCost / range / flavor・巻物の行・開発用の棚) が一致して 1 行ずつ (酒場の行は autoCast)',
      src.ixSpell === 1 && src.tvSpell === 1 && src.ixScroll === 1 && src.tvScroll === 1 && src.scrollSame
      && JSON.stringify(tvVals.ui) === JSON.stringify(ixVals.ui) && tvVals.ui && tvVals.ui[1] === 3 && tvVals.ui[3] === 6 && tvVals.ui[2] === 'long'
      && tvVals.autoCast === true && tvVals.cat === ixVals.cat && tvVals.cat !== 'null' && tvVals.shelf.filter((x) => x === SC).length === 1,
      { src: src, tv: tvVals, ix: ixVals });

    /* ══ (5c) tavern の開発用の棚 ══ */
    const shelfRows = async (pg) => pg.evaluate(() => {
      __equipTV.setShopTab('buy'); __equipTV.openShop();
      const Ls = document.getElementById('shopList'); const out = []; let cur = null;
      for (const el of (Ls ? Ls.children : [])) {
        if (el.classList.contains('shopGroupHead')) { cur = el.textContent; continue; }
        if (cur === '巻物' && el.classList.contains('shopItem')) { const b = el.querySelector('button.shopBtn'); const nm = el.querySelector('.shopName'); out.push({ name: nm ? nm.textContent : null, btn: b ? b.textContent : null }); }
      }
      return { dev: DF_DEV_MAGIC_SHOP, on: isCounterspellOnTV(), ids: scrollShelfIds(), rows: out };
    });
    const tvOn = await openTavern(browser, '?dev=1');
    const sOn = await shelfRows(tvOn); await tvOn.close();
    const tvOff = await openTavern(browser, '?dev=1&counterspell=0');
    const sOff = await shelfRows(tvOff); await tvOff.close();
    const NAME = '巻物・カウンタースペル';
    check('(5c) tavern.html?counterspell=0 → 開発用の棚に巻物が無い (他の開発用の巻物は在る)。素の開発モードでは「購入 1G」で並ぶ',
      sOn.dev === true && sOn.on === true && sOn.ids.includes(SC) && sOn.rows.some((r) => r.name === NAME && r.btn === '購入 1G')
      && sOff.dev === true && sOff.on === false && !sOff.ids.includes(SC) && !sOff.rows.some((r) => r.name === NAME) && sOff.ids.includes('scroll-invisibility'),
      { on: { ids: sOn.ids, rows: sOn.rows.filter((r) => r.name === NAME) }, off: { ids: sOff.ids, rows: sOff.rows.filter((r) => r.name === NAME) } });

    await new Promise((r) => setTimeout(r, 500));
    check('(9a) pageerror 0 件 (console error も 0。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    if (!(e && e.skipRest)) {
      console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
      results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
    }
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   (' + Math.round((Date.now() - T0) / 1000) + ' 秒)');
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.name.slice(0, 120) + '  -- ' + String(r.detail).slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = NEG_EXPECT[tag] || [];
    const red = Array.from(new Set(results.filter((r) => !r.ok).map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0])));
    const miss = want.filter((w) => red.indexOf(w) < 0);
    const extra = red.filter((w) => want.indexOf(w) < 0);
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(','));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当ラベルが赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
