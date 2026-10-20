/* verify_plaza_srd.js — #97 闇市の薬屋と杖屋 (ポーション・ワンド・パールと SRD の後継品) の受入
 *
 *   node tools/verify_plaza_srd.js                        ← 素の受入 (§8 の全 assert)
 *   node tools/verify_plaza_srd.js --negative             ← 負のコントロール 8 本 (1 本ずつ順に)
 *   node tools/verify_plaza_srd.js --negative --only nocap
 *
 * 依頼書: 実装依頼書/2026-10-20_plaza-srd-shop.md §8。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の index.html / tavern.html を実 Chrome (puppeteer-core) で開き、ゲームの関数を直に叩く
 *    (playerAttackTurn / allyAttackTurn / mageAI / applyRoomClearHeal / applyBattleStartSrdConsumables /
 *     酒場の refreshPlazaStock / onPlazaBuy / renderPlazaShop)。
 *  - 盤面: goblin-mine で 14 マス以上つづく床の列 (lane) に 主人公 (魔法使い) / 仲間の魔法使い / 敵 を並べる。
 *    試行に関わらない仲間は alive=false で盤外。持ち物は window.__plaza.addChargeItem で仕込む。
 *  - ⛔ 裏のループは止める: gameOver = true / 各試行の頭で gameOver = false + dialogPaused = true。
 *    演出の待ちは sleepMs を setTimeout(0) に潰す。dfPlayCast / castMagicMissileBarrage も即解決。
 *  - (1a) 罠 B は「着手前の木 (PRE97_REV) の同じ関数」と突き合わせる: その木の index.html を
 *    /index_pre97.html として同じ port から配り、同じ種の乱数で 主人公 → 仲間 の手番を回す。
 *    乱数の総回数・敵の被弾・両者の HP が 1 つも違わないこと + 新しい木では tryDrinkHealingPotion の中で引いた回数 0。
 *  - ⭐ (0a) が赤なら以降は測らず、全ラベルを赤で記録する (空振りの永久緑を作らない)。
 *  - ⛔ 実戦で何回使われるか (頻度)・値段 / 回数 / 回復量の妥当性・演出の見た目は測らない (依頼書 §8 ⛔)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10636 だけを順に使う。
 *  - アンカーは**手つかずの原本**に対して 1 件ちょうどを確かめる。0 件 / 2 件以上なら exit 3 (装置の腐敗)。
 *    複数の置換を持つ変異は、置換ごとに「その時点のバッファで 1 件ちょうど」も確かめる。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は報告する。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート / git) / 3 = 変異アンカーの腐敗
 * port: 10636 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⚠ git が要る (着手前の木を git show で読む)。走行中に本番 index.html / tavern.html を編集しないこと (起動時に凍結)。
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
const PORT     = parseInt(arg('port', '10636'), 10);
/* #97 の実装が入る直前の本番 (起草コミット = 本番 3 ファイルは 3ca8938 と同一)。⛔ HEAD にしない (commit した瞬間に自分との比較になる) */
const PRE97_REV = 'f7b427e';

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
let PRE_INDEX = null;
try { PRE_INDEX = execFileSync('git', ['show', PRE97_REV + ':index.html'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); }
catch (e) { console.error('[driver] git show ' + PRE97_REV + ':index.html が読めません: ' + String(e.message || e).slice(0, 200)); process.exit(2); }
const FROZEN = {
  '/index.html':        fs.readFileSync(path.join(ROOT, 'index.html')),
  '/tavern.html':       fs.readFileSync(path.join(ROOT, 'tavern.html')),
  '/index_pre97.html':  PRE_INDEX,                     // 着手前の木 ((1a) と (5d) の比較相手。変異は入れない)
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

/* 変異 → 赤くなるべきラベル (依頼書 §8 の表)。巻き込みは実走の記録を見ること (notes97_item2.md)。 */
const NEG_EXPECT = {
  rngleak:     ['(1a)'],
  turnfree:    ['(1b)'],
  wandadvance: ['(3b)'],
  pearllow:    ['(4a)'],
  oilnodmg:    ['(2c)'],
  nocap:       ['(5a)'],
  retiredshow: ['(5b)'],
  leak:        ['(6a)'],
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
  /* rngleak: 持っていないのに手番の頭で Math.random() を 1 回引く (罠 B) */
  mutate('/index.html', 'rngleak (持っていないのに手番の頭で乱数を 1 回引く)', [
    ['if (!hasHeal && !hasGreater) return false;',
     'Math.random(); if (!hasHeal && !hasGreater) return false;'],
  ]);
  /* turnfree: 飲んでも手番を続ける (主人公・仲間の 2 行) */
  mutate('/index.html', 'turnfree (飲んでも手番を続けて攻撃する)', [
    ['if (await tryDrinkHealingPotion("player")) return;',
     'await tryDrinkHealingPotion("player");'],
    ['if (await tryDrinkHealingPotion(ally)) return;',
     'await tryDrinkHealingPotion(ally);'],
  ]);
  /* wandadvance: 射程と視線を確かめずにワンドの回数を減らす (罠 A) */
  mutate('/index.html', 'wandadvance (射程を確かめずにワンドを減らす)', [
    ['if (tileChebyshev(wcx, wcy, wx, wy) > getRange(MAGE_SKILLS["magic-missile"].range).tiles || !hasLineOfSight(wcx, wcy, wx, wy)) return false;',
     'if (false) return false;'],
  ]);
  /* pearllow: 一番位の低い呪文を戻す (初期値と比較の 2 置換) */
  mutate('/index.html', 'pearllow (パールが一番位の低い呪文を戻す)', [
    ['let pearlId = null, pearlRank = -Infinity;',
     'let pearlId = null, pearlRank = Infinity;'],
    ['if (rank > pearlRank) { pearlRank = rank; pearlId = id; }',
     'if (rank < pearlRank && true) { pearlRank = rank; pearlId = id; }'],
  ]);
  /* oilnodmg: オイルをダメージに足さない (命中側はそのまま) */
  mutate('/index.html', 'oilnodmg (オイルをダメージに足さない)', [
    ['(onRay ? 0 : (playerBuffs.oilSharpnessBonus || 0));',
     '0;'],
  ]);
  /* leak: 撤退スイッチを効き目の口で見ない */
  mutate('/index.html', 'leak (撤退スイッチを効き目の口で見ない)', [
    ['return isPlazaSrdOn() && hasChargeItem(itemId);',
     'return hasChargeItem(itemId);'],
  ]);
  /* nocap: ポーションの持てる本数の上限を外す */
  mutate('/tavern.html', 'nocap (持てる本数の上限を外す)', [
    ['return isPlazaSrdOnTV() && PLAZA_POTION_IDS_TV.indexOf(itemId) >= 0 && (plazaInventoryTV[itemId] || []).length >= PLAZA_POTION_CAP_TV;',
     'return false;'],
  ]);
  /* retiredshow: 在庫の抽選が retired を見ない (罠 C) */
  mutate('/tavern.html', 'retiredshow (在庫の抽選が retired を見ない)', [
    ['commonAll.filter(id => !PLAZA_ITEMS_COMMON_TV[id].retired && id !== "potion_healing")',
     'commonAll.filter(id => id !== "potion_healing")'],
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
const ALL_LABELS = ['(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)', '(5a)', '(5b)', '(5c)', '(5d)', '(6a)', '(6b)', '(9a)'];

const NEW_IDS = ['potion_healing', 'potion_greater_healing', 'potion_fire_resistance', 'potion_invisibility',
  'oil_of_sharpness', 'dust_sneezing_choking', 'wand_magic_missiles', 'pearl_of_power'];
const OLD_IDS = ['potion_shadow', 'fang_charm', 'cursed_blade', 'medusa_mirror'];
const FEATURED_NAMES = { ring_spell_turning: 'リングオブスペルターニング', wand_polymorph: 'ワンドオブポリモーフ',
  scroll_create_golem: 'マニュアルオブゴーレムズ', scroll_animate_dead: 'スペルスクロール(アニメイトデッド)' };

const pageErrors = [];
/* 主人公 (魔法使い) + 仲間の魔法使い + 戦士。⚠ rich な形でないと既定編成へ黙って戻る */
const PARTY = [
  { classKey: 'mage',    isHero: true,  zone: 'back',  name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'リタ', trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガロ', trait: null, line: null },
];
const KNOWN = ['magic-missile', 'fire-bolt', 'sleep', 'fireball'];
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
async function openIndex(browser, file, qs) {
  const page = await browser.newPage();
  watchErrors(page, file + (qs || ''));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', '45000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: seed.known }));
    } catch (e) {}
  }, { party: PARTY, known: KNOWN });
  await page.goto('http://localhost:' + PORT + '/' + file + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction("typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
    + " && typeof createEnemy === 'function' && !!mapData && !!window.__plaza", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}
async function openTavern(browser, qs) {
  const page = await browser.newPage();
  watchErrors(page, 'tavern' + (qs || ''));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('dragonfighters.xp', '45000'); localStorage.setItem('dragonfighters.prologueSeen', '1'); } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__plazaTV && typeof window.__plazaTV.refreshPlazaStock === 'function', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  return page;
}

/* ── ページ内の装置 (page.evaluate で注入。新しい木と着手前の木の両方で同じものを使う) ──
 * window.__p97.setup(o) が 1 回の試行の盤面を組む:
 *   o.hp / o.maxHp                 … 主人公 (lane の tx0)
 *   o.mageHp / o.mageSummon / o.mageStunned / o.mageSlots / o.mageMax … 仲間の魔法使い (tx0+1)
 *   o.heroSlots / o.heroMax        … 主人公の枠 (currentSpellSlots は makeLeaderActor が参照で持つ)
 *   o.enemies = [[type, tx, ty?], ...] (既定 = 骸骨を tx0+4) / o.items = [[id, 個数], ...]
 */
function install() {
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));
  window.dfPlayCast = () => Promise.resolve();
  window.castMagicMissileBarrage = () => Promise.resolve();
  const TILE = TILE_SIZE;
  let lane = null;
  for (let ty = 1; ty < MAP_H - 1 && !lane; ty++) {
    let run = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) { run++; if (run >= 14) { lane = { ty: ty, tx0: tx - run + 1 }; break; } }
      else run = 0;
    }
  }
  const ORIG = Math.random;
  const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
  const mage = allies.find((a) => a.classKey === 'mage' && !a.isHero);
  const P = {
    lane: lane, mage: mage, setUnit: setUnit, ORIG: ORIG,
    killAll() { for (const e of enemies) if (e) { e.alive = false; e.x = -999999; e.y = -999999; } },
    addEnemy(type, tx, ty) {
      const idx = enemies.length; const e = createEnemy(type, tx, ty);
      enemies.push(e); createEnemyDom(idx, e.def, e.type);
      e.alive = true; e.inactive = false; e.maxHp = 9999; e.hp = 9999; e.stunned = 0; e.spellCooldown = 99;
      setUnit(e, tx, ty); return idx;
    },
    /* 乱数: seq を先に返し、尽きたら fb (定数)。done() が元に戻して引いた回数を返す */
    rng(seq, fb) { const q = seq.slice(); const st = { n: 0 }; Math.random = () => { st.n++; return q.length ? q.shift() : fb; }; return () => { Math.random = ORIG; return st.n; }; },
    /* 乱数: 種つきの mulberry32 ((1a) 用。列の長さに依存しない) */
    seeded(seed) {
      let s = seed >>> 0; const st = { n: 0 };
      Math.random = () => { st.n++; s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      return st;
    },
    clearInv() { const inv = window.__plaza.inv(); for (const k of Object.keys(inv)) delete inv[k]; },
    give(id, n) { for (let i = 0; i < (n || 1); i++) window.__plaza.addChargeItem(id); },
    setup(o) {
      o = o || {};
      Math.random = ORIG; gameOver = false; try { encounterActive = false; } catch (e) {} dialogPaused = true;
      window.__inBossRoom = false;
      resetPlayerBuffs();
      maxHp = o.maxHp || 200; hp = (o.hp != null ? o.hp : maxHp);
      playerX = lane.tx0 * TILE + TILE / 2 - 48; playerY = lane.ty * TILE + TILE / 2 - 58;
      for (const a of allies) { a.alive = false; a.stunned = 0; a.confused = 0; a.wildConfused = 0; setUnit(a, -9999, -9999); }
      mage.alive = true; mage.maxHp = 100; mage.hp = (o.mageHp != null ? o.mageHp : 100); mage.isSummon = !!o.mageSummon;
      mage.stunned = o.mageStunned || 0;
      setUnit(mage, lane.tx0 + 1, lane.ty);
      mage.spellSlots = Object.assign({}, o.mageSlots || {}); mage.maxSpellSlots = Object.assign({}, o.mageMax || o.mageSlots || {});
      currentSpellSlots = Object.assign({}, o.heroSlots || {}); currentMaxSpellSlots = Object.assign({}, o.heroMax || o.heroSlots || {});
      this.killAll(); this.clearInv();
      const idxs = (o.enemies || [['skeleton', lane.tx0 + 4]]).map(([t, tx, ty]) => this.addEnemy(t, tx, ty != null ? ty : lane.ty));
      encounterEnemyIndices = idxs.slice();
      for (const [id, n] of (o.items || [])) this.give(id, n);
      return idxs;
    },
    end() { this.killAll(); this.clearInv(); dialogPaused = false; gameOver = true; Math.random = ORIG; window.__inBossRoom = false; mage.isSummon = false; mage.stunned = 0; resetPlayerBuffs(); },
  };
  window.__p97 = P;
  return { lane: lane, mage: !!mage, leaderClass: leaderClassKey, weaponRange: playerStats.weaponRange,
    fnDrink: typeof window.tryDrinkHealingPotion, fnWand: typeof window.tryWandMagicMissile, fnSrd: typeof window.applyBattleStartSrdConsumables };
}

/* (1a) の 1 腕: 持ち物なし・主人公 HP 40/200・仲間 HP 20/100 (どちらも半分未満) で 主人公 → 仲間 の手番を種つき乱数で回す */
async function turnsNoItems(seeds) {
  const P = window.__p97; const L = P.lane; const out = [];
  for (const seed of seeds) {
    /* 敵は主人公から 4 マス・仲間から 3 マス (どちらも射程内) */
    const idx = P.setup({ hp: 40, mageHp: 20, enemies: [['skeleton', L.tx0 + 4]] });
    const e = enemies[idx[0]];
    const orig = window.tryDrinkHealingPotion; const ins = { calls: 0, inside: 0, rets: [] };
    if (typeof orig === 'function') {
      window.tryDrinkHealingPotion = async function () {
        ins.calls++; const R = Math.random; Math.random = function () { ins.inside++; return R.apply(this, arguments); };
        let r; try { r = await orig.apply(this, arguments); } finally { Math.random = R; } ins.rets.push(r); return r;
      };
    }
    const st = P.seeded(seed);
    const r = {};
    try {
      await playerAttackTurn(idx[0]); r.n1 = st.n; r.e1 = e.hp; r.hp1 = hp;
      await allyAttackTurn(P.mage);   r.n2 = st.n; r.e2 = e.hp; r.m2 = P.mage.hp;
    } finally { Math.random = P.ORIG; if (typeof orig === 'function') window.tryDrinkHealingPotion = orig; }
    r.seed = seed; r.ins = (typeof orig === 'function') ? ins : null;
    out.push(r); P.end();
  }
  return out;
}
/* (5d) の 1 腕: 呪われた曲刀を持たせて戦闘の始めの古い品を通す */
function cursedArm() {
  const P = window.__p97; P.setup({ items: [['cursed_blade', 1]] });
  const a0 = currentPlayerAtkBonus(); applyBattleStartConsumables();
  const out = { bonus: playerBuffs.cursedBladeAtkBonus, dAtk: currentPlayerAtkBonus() - a0, left: countCharges('cursed_blade') };
  P.end(); return out;
}

/* (0b) ソースのバイトから品の表を読む: id ごとに name / maxCharges / price / tier / retired */
function readTables(src, names) {
  const out = {}; let blocks = 0;
  for (const nm of names) {
    const at = src.indexOf('const ' + nm + ' = {');
    if (at < 0) continue;
    const end = src.indexOf('};', at);
    if (end < 0) continue;
    blocks++;
    const body = src.slice(at, end);
    const re = /^[ \t]*([a-z_]+):\s*\{\s*name:/mg; const starts = []; let m;
    while ((m = re.exec(body))) starts.push({ id: m[1], at: m.index });
    starts.forEach((s, i) => {
      const chunk = body.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : body.length);
      const g = (r) => { const x = chunk.match(r); return x ? x[1] : null; };
      out[s.id] = { table: nm, name: g(/name:\s*"([^"]*)"/), maxCharges: g(/maxCharges:\s*(\d+)/), price: g(/price:\s*(\d+)/),
        tier: g(/tier:\s*(\d+)/), retired: /retired:\s*true/.test(chunk) };
    });
  }
  return { rows: out, blocks: blocks };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_plazasrd_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile, '--mute-audio'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : '') + '  着手前の木 = ' + PRE97_REV);

    /* ══ §0 装置 ══ */
    const page = await openIndex(browser, 'index.html', '');
    const ix0 = await page.evaluate((ids) => {
      const d = (id) => plazaItemDef(id);
      return {
        newOk: ids.n.map((id) => [id, !!d(id) && !d(id).retired]),
        oldRetired: ids.o.map((id) => [id, !!d(id) && d(id).retired === true]),
        names: Object.keys(ids.f).map((id) => [id, d(id) ? d(id).name : null]),
        srdOn: typeof isPlazaSrdOn === 'function' ? isPlazaSrdOn() : null,
        fns: [typeof tryDrinkHealingPotion, typeof tryWandMagicMissile, typeof applyBattleStartSrdConsumables, typeof plazaSrdHas],
      };
    }, { n: NEW_IDS, o: OLD_IDS, f: FEATURED_NAMES });
    const tv0 = await openTavern(browser, '?dev=0');
    const tvDefs = await tv0.evaluate((ids) => {
      const d = (id) => plazaItemDefTV(id);
      return {
        newOk: ids.n.map((id) => [id, !!d(id) && !d(id).retired]),
        oldRetired: ids.o.map((id) => [id, !!d(id) && d(id).retired === true]),
        names: Object.keys(ids.f).map((id) => [id, d(id) ? d(id).name : null]),
        srdOn: typeof isPlazaSrdOnTV === 'function' ? isPlazaSrdOnTV() : null,
        all: Object.keys(PLAZA_ITEMS_TV).concat(Object.keys(PLAZA_ITEMS_COMMON_TV)).map((id) => [id, JSON.stringify(d(id))]),
      };
    }, { n: NEW_IDS, o: OLD_IDS, f: FEATURED_NAMES });
    /* ⚠ 酒場を後から開いたので索引のページは裏のタブ = rAF が止まり、飛び道具の演出を待つ手番が終わらない ⇒ 表へ戻す */
    await page.bringToFront();
    const ixAll = await page.evaluate(() => Object.keys(PLAZA_ITEMS).concat(Object.keys(PLAZA_ITEMS_COMMON)).map((id) => [id, JSON.stringify(plazaItemDef(id))]));
    const namesOk = (arr) => arr.every(([id, nm]) => nm === FEATURED_NAMES[id]);
    check('(0a) [装置] 新しい 8 品が両ファイルの表に在る (retired でない) / 古い 4 品が retired: true で在る / 目玉 4 品の名前が新しい / 新しい効き目の関数が在る',
      ix0.newOk.every((x) => x[1]) && ix0.oldRetired.every((x) => x[1]) && namesOk(ix0.names) && ix0.srdOn === true
      && ix0.fns.every((t) => t === 'function')
      && tvDefs.newOk.every((x) => x[1]) && tvDefs.oldRetired.every((x) => x[1]) && namesOk(tvDefs.names) && tvDefs.srdOn === true,
      { ix: ix0, tv: { newOk: tvDefs.newOk, oldRetired: tvDefs.oldRetired, names: tvDefs.names, srdOn: tvDefs.srdOn } });
    if (!results[results.length - 1].ok) {
      for (const l of ALL_LABELS) check(l + ' (0a) が赤なので測らない = 赤で記録', false, '装置が立っていない');
      throw { skipRest: true };
    }

    /* (0b) ソースのバイト (配信している版) から両ファイルの表を読み、id ごとに突き合わせる + 実行時の定義も丸ごと一致 */
    const ixT = readTables(FROZEN['/index.html'].toString('utf8'), ['PLAZA_ITEMS', 'PLAZA_ITEMS_COMMON']);
    const tvT = readTables(FROZEN['/tavern.html'].toString('utf8'), ['PLAZA_ITEMS_TV', 'PLAZA_ITEMS_COMMON_TV']);
    const ixIds = Object.keys(ixT.rows).sort(), tvIds = Object.keys(tvT.rows).sort();
    const FIELDS = ['name', 'maxCharges', 'price', 'tier', 'retired'];
    const diffs = [];
    for (const id of ixIds) {
      const a = ixT.rows[id], b = tvT.rows[id];
      if (!b) { diffs.push(id + ': tavern に無い'); continue; }
      for (const f of FIELDS) if (a[f] !== b[f]) diffs.push(id + '.' + f + ': ' + a[f] + ' ≠ ' + b[f]);
      if (a.name == null || a.maxCharges == null || a.price == null || a.tier == null) diffs.push(id + ': 欄が読めない ' + JSON.stringify(a));
    }
    const ixRun = JSON.stringify(ixAll.slice().sort()), tvRun = JSON.stringify(tvDefs.all.slice().sort());
    check('(0b) 両ファイルの品の表 (ソースのバイト) が id ごとに name / maxCharges / price / tier / retired で一致 (16 品 = 目玉 6 + 一般 10)。実行時の定義も丸ごと一致',
      ixT.blocks === 2 && tvT.blocks === 2 && ixIds.length === 16 && JSON.stringify(ixIds) === JSON.stringify(tvIds) && diffs.length === 0
      && NEW_IDS.concat(OLD_IDS).every((id) => ixIds.indexOf(id) >= 0) && ixRun === tvRun,
      { n: ixIds.length, blocks: [ixT.blocks, tvT.blocks], diffs: diffs.slice(0, 6), runSame: ixRun === tvRun,
        sample: { potion_healing: ixT.rows.potion_healing, potion_shadow: ixT.rows.potion_shadow } });

    const A = await page.evaluate(install);
    if (!A.lane || !A.mage || A.leaderClass !== 'mage') {
      check('(0c) [装置] 14 マス続く床の列 / 仲間の魔法使い / 主人公が魔法使い', false, A);
      for (const l of ALL_LABELS.filter((x) => x !== '(0b)' && x !== '(0c)')) check(l + ' (0c) の盤面が立たないので測らない = 赤で記録', false, A);
      throw { skipRest: true };
    }
    const c0 = await page.evaluate((ids) => {
      const P = window.__p97; P.setup({ items: ids.map((id) => [id, 2]) });
      const out = ids.map((id) => [id, countCharges(id), (plazaItemDef(id).maxCharges || 1) * 2, plazaSrdHas(id)]);
      P.end();
      out.push(['after-clear', ids.reduce((a, id) => a + countCharges(id), 0)]);
      return out;
    }, NEW_IDS.concat(['cursed_blade']));
    check('(0c) [装置] 仕込んだ持ち物 (個体 2 つずつ) が countCharges で読める (= maxCharges × 2)・plazaSrdHas が真・片付けで 0',
      c0.slice(0, -1).every(([id, n, want, has]) => n === want && n > 0 && (OLD_IDS.indexOf(id) >= 0 || has === true)) && c0[c0.length - 1][1] === 0,
      { lane: A.lane, rows: c0 });

    /* ══ §1 ポーション ══ */
    const SEEDS = [97, 1021, 4242];
    const aNew = await page.evaluate(turnsNoItems, SEEDS);

    /* (1b) 主人公 HP 40/200 + ヒーリング。乱数 = [0.30, 0.80] (2d4 = 2 + 4) → 期待 +8。尽きた後は 0.95 (飲んでも攻撃すれば当たる) */
    const HEAL_SEQ = [0.30, 0.80];
    const HEAL_EXP = HEAL_SEQ.reduce((s, r) => s + Math.floor(r * 4) + 1, 0) + 2;
    const t1b = await page.evaluate(async (seq) => {
      const P = window.__p97; const L = P.lane; const out = {};
      let idx = P.setup({ hp: 40, items: [['potion_healing', 1]], enemies: [['skeleton', L.tx0 + 2]] });
      let done = P.rng(seq, 0.95); await playerAttackTurn(idx[0]); out.hero = { hp0: 40, hp1: hp, eHp: enemies[idx[0]].hp, left: countCharges('potion_healing'), n: done() }; P.end();
      idx = P.setup({ mageHp: 20, items: [['potion_healing', 1]], enemies: [['skeleton', L.tx0 + 3]] });
      done = P.rng(seq, 0.95); await allyAttackTurn(P.mage); out.ally = { hp0: 20, hp1: P.mage.hp, eHp: enemies[idx[0]].hp, left: countCharges('potion_healing'), n: done() }; P.end();
      return out;
    }, HEAL_SEQ);
    check('(1b) HP が半分未満の主人公が自分の手番でヒーリングを飲む: HP + (2d4+2 = ドライバの計算 ' + HEAL_EXP + ')・持ち物 1 → 0・その手番は攻撃しない (敵 HP 9999 のまま)',
      t1b.hero.hp1 - t1b.hero.hp0 === HEAL_EXP && t1b.hero.left === 0 && t1b.hero.eHp === 9999, t1b.hero);
    check('(1b) 仲間 (HP 20/100) も同じ: + ' + HEAL_EXP + '・持ち物 0・その手番は攻撃しない',
      t1b.ally.hp1 - t1b.ally.hp0 === HEAL_EXP && t1b.ally.left === 0 && t1b.ally.eHp === 9999, t1b.ally);

    /* (1c) 選び方 */
    const t1c = await page.evaluate(async () => {
      const P = window.__p97; const out = {};
      P.setup({ maxHp: 200, hp: 40, items: [['potion_healing', 1], ['potion_greater_healing', 1]] });
      const done = P.rng([0.0, 0.25, 0.5, 0.75], 0.5);
      out.big = { r: await tryDrinkHealingPotion('player'), heal: countCharges('potion_healing'), greater: countCharges('potion_greater_healing'), gain: hp - 40, n: done() }; P.end();
      P.setup({ maxHp: 20, hp: 9, items: [['potion_healing', 1], ['potion_greater_healing', 1]] });
      out.small = { r: await tryDrinkHealingPotion('player'), heal: countCharges('potion_healing'), greater: countCharges('potion_greater_healing') }; P.end();
      P.setup({ maxHp: 20, hp: 9, items: [['potion_greater_healing', 1]] });
      out.onlyG = { r: await tryDrinkHealingPotion('player'), greater: countCharges('potion_greater_healing') }; P.end();
      P.setup({ maxHp: 200, hp: 40, items: [['potion_healing', 1]] });
      out.onlyH = { r: await tryDrinkHealingPotion('player'), heal: countCharges('potion_healing') }; P.end();
      return out;
    });
    check('(1c) 足りない HP ≥ 15 + グレーターあり → グレーター (4d4+4 = 1+2+3+4+4 = 14) / 足りない < 15 → ヒーリング / 片方しか無ければそれ',
      t1c.big.r === true && t1c.big.heal === 1 && t1c.big.greater === 0 && t1c.big.gain === 14
      && t1c.small.r === true && t1c.small.heal === 0 && t1c.small.greater === 1
      && t1c.onlyG.r === true && t1c.onlyG.greater === 0 && t1c.onlyH.r === true && t1c.onlyH.heal === 0, t1c);

    /* (1d) 飲まない条件 */
    const t1d = await page.evaluate(async () => {
      const P = window.__p97; const L = P.lane; const out = {};
      P.setup({ hp: 100, items: [['potion_healing', 1]] }); out.half = await tryDrinkHealingPotion('player'); out.halfLeft = countCharges('potion_healing'); P.end();
      P.setup({ mageHp: 50, items: [['potion_healing', 1]] }); out.allyHalf = await tryDrinkHealingPotion(P.mage); out.allyHalfLeft = countCharges('potion_healing'); P.end();
      P.setup({ mageHp: 10, mageSummon: true, items: [['potion_healing', 1]] }); out.summon = await tryDrinkHealingPotion(P.mage); out.summonLeft = countCharges('potion_healing'); P.end();
      let idx = P.setup({ hp: 40, items: [['potion_healing', 1]], enemies: [['skeleton', L.tx0 + 3]] });
      playerBuffs.sleepRemaining = 1; await playerAttackTurn(idx[0]); out.sleepLeft = countCharges('potion_healing'); out.sleepHp = hp; P.end();
      idx = P.setup({ mageHp: 10, mageStunned: 1, items: [['potion_healing', 1]], enemies: [['skeleton', L.tx0 + 3]] });
      await allyAttackTurn(P.mage); out.stunLeft = countCharges('potion_healing'); out.stunHp = P.mage.hp; P.end();
      return out;
    });
    check('(1d) HP が半分以上 (主人公 100/200・仲間 50/100) / 召喚のユニット / 眠り中の主人公 / スタン中の仲間 は飲まない',
      t1d.half === false && t1d.halfLeft === 1 && t1d.allyHalf === false && t1d.allyHalfLeft === 1 && t1d.summon === false && t1d.summonLeft === 1
      && t1d.sleepLeft === 1 && t1d.sleepHp === 40 && t1d.stunLeft === 1 && t1d.stunHp === 10, t1d);

    /* ══ §2 戦闘の始めの品 ══ */
    const t2 = await page.evaluate(async () => {
      const P = window.__p97; const L = P.lane; const out = {};
      const sk = (n, from) => Array.from({ length: n }, (_, i) => ['skeleton', L.tx0 + from + i]);
      // ファイアレジスタンス: リッチ (fireball) が居る / 骸骨だけ
      P.setup({ items: [['potion_fire_resistance', 1]], enemies: [['lich', L.tx0 + 6]] });
      const m0 = getFireResistMult('player'); applyBattleStartSrdConsumables();
      out.fireYes = { m0, mult: getFireResistMult('player'), left: countCharges('potion_fire_resistance'), usesFire: srdEnemyUsesFire(enemies[encounterEnemyIndices[0]].def) }; P.end();
      P.setup({ items: [['potion_fire_resistance', 1]], enemies: sk(3, 5) }); applyBattleStartSrdConsumables();
      out.fireNo = { mult: getFireResistMult('player'), left: countCharges('potion_fire_resistance'), usesFire: srdEnemyUsesFire(enemies[encounterEnemyIndices[0]].def) }; P.end();
      // インビジビリティ: ボス / 3 体 / 2 体
      const inv = (enemiesArg) => { P.setup({ items: [['potion_invisibility', 1]], enemies: enemiesArg }); const a0 = currentPlayerAc(); applyBattleStartSrdConsumables(); const r = { d: currentPlayerAc() - a0, left: countCharges('potion_invisibility') }; P.end(); return r; };
      out.invBoss = inv([['lich', L.tx0 + 6]]); out.inv3 = inv(sk(3, 5)); out.inv2 = inv(sk(2, 5));
      // オイル: 3 体 / ボス / 2 体。戦闘の後の resetPlayerBuffs で 0
      const oil = (enemiesArg) => {
        P.setup({ items: [['oil_of_sharpness', 1]], enemies: enemiesArg });
        const a0 = currentPlayerAtkBonus(), d0 = currentPlayerDmgBonus(); applyBattleStartSrdConsumables();
        const r = { atk: currentPlayerAtkBonus() - a0, dmg: currentPlayerDmgBonus() - d0, left: countCharges('oil_of_sharpness') };
        resetPlayerBuffs(); r.afterAtk = currentPlayerAtkBonus() - a0; r.afterDmg = currentPlayerDmgBonus() - d0; P.end(); return r;
      };
      out.oil3 = oil(sk(3, 5)); out.oilBoss = oil([['lich', L.tx0 + 6]]); out.oil2 = oil(sk(2, 5));
      // ダスト: 骸骨 2 + リッチ。乱数 [0.0 (= 1 で失敗), 0.99 (= 20 で成功)]。非ボス 1 体 + リッチ なら使わない
      let idx = P.setup({ items: [['dust_sneezing_choking', 1]], enemies: [['skeleton', L.tx0 + 5], ['skeleton', L.tx0 + 6], ['lich', L.tx0 + 8]] });
      let done = P.rng([0.0, 0.99], 0.5); applyBattleStartSrdConsumables(); const n = done();
      out.dust = { st: idx.map((i) => enemies[i].stunned || 0), n, left: countCharges('dust_sneezing_choking'), con: idx.map((i) => enemies[i].def.con || 0) }; P.end();
      idx = P.setup({ items: [['dust_sneezing_choking', 1]], enemies: [['skeleton', L.tx0 + 5], ['lich', L.tx0 + 8]] });
      done = P.rng([0.0, 0.0], 0.0); applyBattleStartSrdConsumables(); const n1 = done();
      out.dust1 = { st: idx.map((i) => enemies[i].stunned || 0), n: n1, left: countCharges('dust_sneezing_choking') }; P.end();
      return out;
    });
    check('(2a) ファイアレジスタンス: 炎を使う敵 (リッチ) が居るときだけ飲む → getFireResistMult("player") 1 → 0.5。骸骨だけなら飲まない (1 のまま)',
      t2.fireYes.m0 === 1 && t2.fireYes.mult === 0.5 && t2.fireYes.left === 0 && t2.fireYes.usesFire === true
      && t2.fireNo.mult === 1 && t2.fireNo.left === 1 && t2.fireNo.usesFire === false, { y: t2.fireYes, n: t2.fireNo });
    check('(2b) インビジビリティ: ボス / 3 体 で飲む → currentPlayerAc() + 4。2 体なら飲まない',
      t2.invBoss.d === 4 && t2.invBoss.left === 0 && t2.inv3.d === 4 && t2.inv3.left === 0 && t2.inv2.d === 0 && t2.inv2.left === 1,
      { boss: t2.invBoss, three: t2.inv3, two: t2.inv2 });
    check('(2c) オイル: 3 体 / ボス で塗る → currentPlayerAtkBonus() と currentPlayerDmgBonus() が両方 + 3。戦闘の後の resetPlayerBuffs で 0。2 体なら塗らない',
      [t2.oil3, t2.oilBoss].every((o) => o.atk === 3 && o.dmg === 3 && o.left === 0 && o.afterAtk === 0 && o.afterDmg === 0)
      && t2.oil2.atk === 0 && t2.oil2.dmg === 0 && t2.oil2.left === 1, { three: t2.oil3, boss: t2.oilBoss, two: t2.oil2 });
    check('(2d) ダスト: 非ボス 2 体 (セーヴの乱数を 失敗 / 成功 に固定) のうち失敗した方だけ stunned = 3・ボスは対象外 (乱数を引かない)。非ボス 1 体なら使わない',
      t2.dust.st[0] === 3 && t2.dust.st[1] === 0 && t2.dust.st[2] === 0 && t2.dust.n === 2 && t2.dust.left === 0
      && t2.dust1.left === 1 && t2.dust1.st.every((s) => s === 0) && t2.dust1.n === 0, { two: t2.dust, one: t2.dust1 });

    /* ══ §3 ワンド ══ */
    const t3 = await page.evaluate(async () => {
      const P = window.__p97; const L = P.lane; const out = {};
      const spyMM = () => { const o = window.allyMagicMissile; const st = { n: 0 }; window.allyMagicMissile = async function () { st.n++; return o.apply(this, arguments); }; st.undo = () => { window.allyMagicMissile = o; }; return st; };
      const T = TILE_SIZE;
      const tileOf = (u) => ({ tx: Math.floor((u.x + u.def.displaySize / 2) / T), ty: Math.floor((u.y + u.def.displaySize / 2) / T) });
      // (3a) 仲間・届く (仲間から 4 マス)
      let idx = P.setup({ items: [['wand_magic_missiles', 1]], enemies: [['skeleton', L.tx0 + 5]] });
      let s = spyMM(); let r = await mageAI(P.mage); s.undo();
      out.a = { r, left: countCharges('wand_magic_missiles'), eHp: enemies[idx[0]].hp, mm: s.n }; P.end();
      // (3b) 射程外 (仲間から 11 マス)
      idx = P.setup({ items: [['wand_magic_missiles', 1]], enemies: [['skeleton', L.tx0 + 12]] });
      const mmTiles = getRange(MAGE_SKILLS['magic-missile'].range).tiles;
      const far = { mage: tileOf(P.mage), e: tileOf(enemies[idx[0]]) };
      s = spyMM(); r = await mageAI(P.mage); s.undo();
      out.b = { r, left: countCharges('wand_magic_missiles'), eHp: enemies[idx[0]].hp, mm: s.n, mmTiles, dist: Math.max(Math.abs(far.mage.tx - far.e.tx), Math.abs(far.mage.ty - far.e.ty)) }; P.end();
      // (3b) 壁越し: 仲間から射程内で、本番の hasLineOfSight が切れる床を探す
      P.setup({ enemies: [] });
      const ax = P.mage.x + P.mage.def.displaySize / 2, ay = P.mage.y + P.mage.def.displaySize / 2;
      const atx = Math.floor(ax / T), aty = Math.floor(ay / T); let blk = null;
      for (let ty = Math.max(1, aty - 9); ty <= Math.min(MAP_H - 2, aty + 9) && !blk; ty++)
        for (let tx = Math.max(1, atx - 9); tx <= Math.min(MAP_W - 2, atx + 9) && !blk; tx++) {
          if (isTileWall(tx, ty)) continue;
          if (!hasLineOfSight(ax, ay, tx * T + T / 2, ty * T + T / 2)) blk = { tx, ty, d: Math.max(Math.abs(tx - atx), Math.abs(ty - aty)) };
        }
      P.end();
      if (blk) {
        idx = P.setup({ items: [['wand_magic_missiles', 1]], enemies: [['skeleton', blk.tx, blk.ty]] });
        s = spyMM(); r = await tryWandMagicMissile(P.mage, P.mage, idx[0]); s.undo();
        out.b2 = { blk, r, left: countCharges('wand_magic_missiles'), mm: s.n, eHp: enemies[idx[0]].hp }; P.end();
      } else out.b2 = { blk: null };
      // (3c) 攻撃呪文の枠が 1 つ残る (fire-bolt 1)。直叩きで false / mageAI を通してもワンドは減らない
      idx = P.setup({ items: [['wand_magic_missiles', 1]], mageSlots: { 'fire-bolt': 1 }, enemies: [['skeleton', L.tx0 + 5]] });
      s = spyMM(); r = await tryWandMagicMissile(P.mage, P.mage, idx[0]); s.undo();
      out.c = { r, left: countCharges('wand_magic_missiles'), mm: s.n }; P.end();
      idx = P.setup({ items: [['wand_magic_missiles', 1]], mageSlots: { 'fire-bolt': 1 }, enemies: [['skeleton', L.tx0 + 5]] });
      s = spyMM(); await mageAI(P.mage); s.undo();
      out.c2 = { left: countCharges('wand_magic_missiles'), mm: s.n }; P.end();
      // (3d) 主人公が魔法使い: 撃てば pickLeaderAction を呼ばない / 持っていない・枠が残る なら呼ぶ
      const spyPick = () => { const o = window.pickLeaderAction; const st = { n: 0 }; window.pickLeaderAction = function () { st.n++; return o.apply(this, arguments); }; st.undo = () => { window.pickLeaderAction = o; }; return st; };
      idx = P.setup({ items: [['wand_magic_missiles', 1]], enemies: [['skeleton', L.tx0 + 3]] });
      let sp = spyPick(); s = spyMM(); await playerAttackTurn(idx[0]); sp.undo(); s.undo();
      out.d = { pick: sp.n, mm: s.n, left: countCharges('wand_magic_missiles'), eHp: enemies[idx[0]].hp, cls: leaderClassKey }; P.end();
      idx = P.setup({ enemies: [['skeleton', L.tx0 + 3]] });
      sp = spyPick(); s = spyMM(); await playerAttackTurn(idx[0]); sp.undo(); s.undo();
      out.d0 = { pick: sp.n, mm: s.n }; P.end();
      idx = P.setup({ items: [['wand_magic_missiles', 1]], heroSlots: { 'fire-bolt': 1 }, heroMax: { 'fire-bolt': 1 }, enemies: [['skeleton', L.tx0 + 3]] });
      sp = spyPick(); s = spyMM(); await playerAttackTurn(idx[0]); sp.undo(); s.undo();
      out.d1 = { pick: sp.n, left: countCharges('wand_magic_missiles') }; P.end();
      return out;
    });
    check('(3a) 攻撃呪文の枠が全部 0 の仲間の魔法使い → mageAI がワンドで撃つ (true)・ワンド 7 → 6・敵の HP が減る',
      t3.a.r === true && t3.a.left === 6 && t3.a.eHp < 9999 && t3.a.mm === 1, t3.a);
    check('(3b) 敵が射程外 (マジックミサイルの射程を超える) → ワンドは減らない・撃たない・従来どおり (罠 A)',
      t3.b.dist > t3.b.mmTiles && t3.b.left === 7 && t3.b.mm === 0 && t3.b.eHp === 9999, t3.b);
    check('(3b) 壁越し (射程内・本番の hasLineOfSight が切れる床) → ワンドは減らない',
      !!t3.b2.blk && t3.b2.r === false && t3.b2.left === 7 && t3.b2.mm === 0 && t3.b2.eHp === 9999, t3.b2);
    check('(3c) 攻撃呪文の枠が 1 つでも残っていればワンドは使わない (直叩きで false・mageAI を通しても 7 のまま)',
      t3.c.r === false && t3.c.left === 7 && t3.c.mm === 0 && t3.c2.left === 7, { c: t3.c, c2: t3.c2 });
    check('(3d) 主人公が魔法使い: 撃てば pickLeaderAction を呼ばない (ワンド 7 → 6) / 持っていない・枠が残る なら呼ぶ',
      t3.d.cls === 'mage' && t3.d.pick === 0 && t3.d.mm === 1 && t3.d.left === 6 && t3.d.eHp < 9999 && t3.d0.pick === 1 && t3.d0.mm === 0
      && t3.d1.pick === 1 && t3.d1.left === 7, { d: t3.d, d0: t3.d0, d1: t3.d1 });

    /* ══ §4 パール ══ */
    const t4 = await page.evaluate(async () => {
      const P = window.__p97; const out = {};
      const rk = (id) => ((getSkill(id) && getSkill(id).levelReq) || 1) * 1000 + ((getSkill(id) && getSkill(id).mpCost) || 0);
      out.rank = { mm: rk('magic-missile'), fireball: rk('fireball') };
      P.setup({ items: [['pearl_of_power', 1]], heroSlots: { 'magic-missile': 0, fireball: 0 }, heroMax: { 'magic-missile': 2, fireball: 2 } });
      await applyRoomClearHeal(); out.a = { slots: Object.assign({}, currentSpellSlots), left: countCharges('pearl_of_power') }; P.end();
      P.setup({ items: [['pearl_of_power', 1]], heroSlots: { 'magic-missile': 2 }, heroMax: { 'magic-missile': 2 }, mageSlots: { 'magic-missile': 0, fireball: 0 }, mageMax: { 'magic-missile': 2, fireball: 2 } });
      await applyRoomClearHeal(); out.ally = { slots: Object.assign({}, P.mage.spellSlots), hero: Object.assign({}, currentSpellSlots), left: countCharges('pearl_of_power') }; P.end();
      P.setup({ items: [['pearl_of_power', 1]], heroSlots: { 'magic-missile': 2, fireball: 2 }, heroMax: { 'magic-missile': 2, fireball: 2 }, mageSlots: { 'magic-missile': 2 }, mageMax: { 'magic-missile': 2 } });
      await applyRoomClearHeal(); out.full = { left: countCharges('pearl_of_power') }; P.end();
      P.setup({ items: [['pearl_of_power', 1]], heroSlots: { 'magic-missile': 0, fireball: 0 }, heroMax: { 'magic-missile': 2, fireball: 2 } });
      window.__inBossRoom = true; await applyRoomClearHeal(); out.boss = { left: countCharges('pearl_of_power'), slots: Object.assign({}, currentSpellSlots) }; P.end();
      return out;
    });
    check('(4a) 減った枠が 2 種類 (マジックミサイル 0/2・ファイアボール 0/2) の主人公 → 部屋クリアで 位の高い方 (ファイアボール) だけ +1 (マジックミサイルは既存の最低位の回復で +1)・パール 3 → 2',
      t4.rank.fireball > t4.rank.mm && t4.a.slots.fireball === 1 && t4.a.slots['magic-missile'] === 1 && t4.a.left === 2, t4);
    check('(4a) 主人公が満タンなら仲間の一番位の高い枠 (ファイアボール) を戻す',
      t4.ally.slots.fireball === 1 && t4.ally.slots['magic-missile'] === 1 && t4.ally.hero['magic-missile'] === 2 && t4.ally.left === 2, t4.ally);
    check('(4b) 減った枠が無ければパールは減らない / ボス部屋 (__inBossRoom) では使わない',
      t4.full.left === 3 && t4.boss.left === 3 && t4.boss.slots.fireball === 0 && t4.boss.slots['magic-missile'] === 0, { full: t4.full, boss: t4.boss });

    /* (5d) 古い品 (呪われた曲刀) は今までどおり: 新しい木と着手前の木で同じ +4 */
    const cNew = await page.evaluate(cursedArm);
    await page.close();

    /* ══ (1a) / (5d) の比較相手 = 着手前の木 ══ */
    const pre = await openIndex(browser, 'index_pre97.html', '');
    const Apre = await pre.evaluate(install);
    const aPre = Apre.lane ? await pre.evaluate(turnsNoItems, SEEDS) : null;
    const cPre = Apre.lane ? await pre.evaluate(cursedArm) : null;
    await pre.close();
    const sameTurn = (x, y) => !!x && !!y && x.n1 === y.n1 && x.n2 === y.n2 && x.e1 === y.e1 && x.e2 === y.e2 && x.hp1 === y.hp1 && x.m2 === y.m2;
    const pairs = SEEDS.map((sd, i) => ({ seed: sd, nw: aNew[i], pr: aPre ? aPre[i] : null }));
    check('(1a) 持っていない主人公と仲間の手番 (HP 半分未満) を、同じ種の乱数で 新しい木 / 着手前の木 (' + PRE97_REV + ') の同じ関数で回すと、乱数の総回数・敵の被弾・両者の HP が同じ (罠 B)。新しい木の tryDrinkHealingPotion は 2 回呼ばれ、中で引いた乱数 0 回',
      Apre.fnDrink === 'undefined' && A.fnDrink === 'function' && !!aPre && pairs.every((p) => sameTurn(p.nw, p.pr))
      && aNew.every((r) => r.ins && r.ins.calls === 2 && r.ins.inside === 0 && r.ins.rets.every((x) => x === false))
      && aNew.some((r) => r.e2 < 9999) && aNew.every((r) => r.n2 > 0),
      { preFn: Apre.fnDrink, pairs: pairs.map((p) => ({ seed: p.seed, nw: p.nw && [p.nw.n1, p.nw.n2, p.nw.e1, p.nw.e2, p.nw.hp1, p.nw.m2, p.nw.ins && p.nw.ins.inside],
        pr: p.pr && [p.pr.n1, p.pr.n2, p.pr.e1, p.pr.e2, p.pr.hp1, p.pr.m2] })) });
    check('(5d) 古い 4 品を持っている人は在庫に無くても今までどおり効く: 呪われた曲刀で戦闘を始めると cursedBladeAtkBonus = 4・命中 +4・1 つ使う (着手前の木と同じ)',
      cNew.bonus === 4 && cNew.dAtk === 4 && cNew.left === 0 && !!cPre && JSON.stringify(cNew) === JSON.stringify(cPre), { nw: cNew, pr: cPre });

    /* ══ (6a) 撤退 ?plazasrd=0 ══ */
    const pr = await openIndex(browser, 'index.html', '?plazasrd=0');
    const A6 = await pr.evaluate(install);
    const t6 = A6.lane ? await pr.evaluate(async () => {
      const P = window.__p97; const L = P.lane; const out = { on: isPlazaSrdOn() };
      let idx = P.setup({ hp: 40, items: [['potion_healing', 1]], enemies: [['skeleton', L.tx0 + 2]] });
      await playerAttackTurn(idx[0]); out.potion = countCharges('potion_healing'); out.hp = hp; P.end();
      idx = P.setup({ mageHp: 20, items: [['potion_healing', 1]], enemies: [['skeleton', L.tx0 + 3]] });
      await allyAttackTurn(P.mage); out.allyPotion = countCharges('potion_healing'); P.end();
      idx = P.setup({ items: [['wand_magic_missiles', 1]], enemies: [['skeleton', L.tx0 + 5]] }); out.wandR = await mageAI(P.mage); out.wand = countCharges('wand_magic_missiles'); P.end();
      idx = P.setup({ items: [['wand_magic_missiles', 1]], enemies: [['skeleton', L.tx0 + 3]] }); await playerAttackTurn(idx[0]); out.heroWand = countCharges('wand_magic_missiles'); P.end();
      P.setup({ items: [['pearl_of_power', 1]], heroSlots: { 'magic-missile': 0, fireball: 0 }, heroMax: { 'magic-missile': 2, fireball: 2 } }); await applyRoomClearHeal(); out.pearl = countCharges('pearl_of_power'); out.fb = currentSpellSlots.fireball; P.end();
      P.setup({ items: [['oil_of_sharpness', 1], ['potion_invisibility', 1], ['potion_fire_resistance', 1], ['dust_sneezing_choking', 1]], enemies: [['lich', L.tx0 + 5], ['skeleton', L.tx0 + 3], ['skeleton', L.tx0 + 4]] });
      applyBattleStartSrdConsumables(); out.srd = ['oil_of_sharpness', 'potion_invisibility', 'potion_fire_resistance', 'dust_sneezing_choking'].map((id) => countCharges(id));
      out.oilB = playerBuffs.oilSharpnessBonus || 0; out.fire = playerBuffs.fireResistPotion || false; P.end();
      return out;
    }) : { lane: null };
    await pr.close();
    check('(6a) ?plazasrd=0 → 手番の頭でポーションを飲まない (主人公・仲間) / ワンド (仲間・主人公) もパールも後継品 4 つも使わない',
      t6.on === false && t6.potion === 1 && t6.hp === 40 && t6.allyPotion === 1 && t6.wand === 7 && t6.heroWand === 7 && t6.pearl === 3 && t6.fb === 0
      && Array.isArray(t6.srd) && t6.srd.every((n) => n === 1) && t6.oilB === 0 && t6.fire === false, t6);

    /* ══ §5 店 (tavern) ══ */
    const draw = () => {
      const T = window.__plazaTV; const seen = {}; let healAlways = true;
      for (let i = 0; i < 200; i++) {
        T.refreshPlazaStock(); const st = T.getStock();
        for (const s of st) seen[s.itemId] = (seen[s.itemId] || 0) + 1;
        if (!st.some((s) => s.itemId === 'potion_healing' && s.kind === 'always')) healAlways = false;
      }
      return { seen, healAlways };
    };
    await tv0.bringToFront();
    const t5b = await tv0.evaluate(draw);
    check('(5b) 在庫の抽選 200 回: 古い 4 品が 1 度も出ない / ヒーリングは毎回在る (常設) / 新しい一般品・ワンド・パールはどれも 1 回以上出る',
      OLD_IDS.every((id) => !t5b.seen[id]) && t5b.healAlways && NEW_IDS.every((id) => t5b.seen[id] > 0), t5b);
    const t5a = await tv0.evaluate((pids) => {
      const T = window.__plazaTV; const out = { per: {} };
      T.setFang(999); const inv = T.inv(); for (const k of Object.keys(inv)) delete inv[k];
      T.refreshPlazaStock();
      const rows = () => T.shopRows();
      // ヒーリング (常設) を 4 回買う
      const hi = () => rows().findIndex((s) => s.itemId === 'potion_healing');
      for (let k = 0; k < 4; k++) T.onPlazaBuy(hi());
      out.count = (T.inv().potion_healing || []).length; out.fang = T.getFang();
      T.renderPlazaShop();
      const btn = document.querySelector('#plazaShop .pbuy[data-idx="' + hi() + '"]');
      out.btn = btn ? { disabled: btn.disabled, text: btn.textContent } : null;
      // ポーション 4 種それぞれ: 個体 2 つでは上限でない / 3 つで上限。上限の品を在庫に 1 行入れて買わせても増えない・ボタンは無効「所持上限」
      for (const id of pids) {
        for (const k of Object.keys(inv)) delete inv[k];
        for (let k = 0; k < 2; k++) T.addChargeItem(id);
        const two = T.atCap(id);
        T.addChargeItem(id);
        const three = T.atCap(id);
        const st = T.getStock(); st.push({ itemId: id, price: 1, kind: 'common' });
        const i = rows().findIndex((s) => s.itemId === id && s.price === 1);
        const f0 = T.getFang(); T.onPlazaBuy(i);
        T.renderPlazaShop();
        const b = document.querySelector('#plazaShop .pbuy[data-idx="' + rows().findIndex((s) => s.itemId === id) + '"]');
        out.per[id] = { two, three, after: (T.inv()[id] || []).length, fangSame: T.getFang() === f0, btn: b ? [b.disabled, b.textContent] : null };
      }
      for (const k of Object.keys(inv)) delete inv[k];
      out.devRows = rows().filter((s) => s.kind === 'dev').length;
      return out;
    }, ['potion_healing', 'potion_greater_healing', 'potion_fire_resistance', 'potion_invisibility']);
    check('(5a) ポーションは 3 つまで買える (ヒーリング 4 回買って 3 個・牙貨 -9)。4 つ目は買えず、購入ボタンが無効で「所持上限」と出る (4 種とも)',
      t5a.count === 3 && t5a.fang === 999 - 9 && !!t5a.btn && t5a.btn.disabled === true && t5a.btn.text === '所持上限'
      && Object.keys(t5a.per).length === 4 && Object.values(t5a.per).every((p) => p.two === false && p.three === true && p.after === 3 && p.fangSame && !!p.btn && p.btn[0] === true && p.btn[1] === '所持上限'),
      t5a);
    await tv0.close();
    const tvd = await openTavern(browser, '?dev=1');
    const t5c = await tvd.evaluate(() => {
      const T = window.__plazaTV; T.refreshPlazaStock(); const d = T.shopRows().filter((s) => s.kind === 'dev');
      return { n: d.length, prices: d.map((s) => s.price), ids: d.map((s) => s.itemId), dev: !!window.__dfDevMode };
    });
    await tvd.close();
    check('(5c) 開発モード (?dev=1) では新しい 8 品が 1 牙貨で並ぶ (kind dev)。素 (?dev=0) では並ばない',
      t5c.dev === true && t5c.n === 8 && t5c.prices.every((p) => p === 1) && NEW_IDS.every((id) => t5c.ids.indexOf(id) >= 0) && t5a.devRows === 0,
      { dev: t5c, plainDevRows: t5a.devRows });
    const tvr = await openTavern(browser, '?plazasrd=0&dev=1');
    const t6b = await tvr.evaluate(draw);
    const t6bDev = await tvr.evaluate(() => ({ on: window.__plazaTV.srdOn(), dev: window.__plazaTV.shopRows().filter((s) => s.kind === 'dev').length, devMode: !!window.__dfDevMode }));
    await tvr.close();
    check('(6b) tavern.html?plazasrd=0 → 在庫の抽選 200 回で新しい品が 1 度も出ず、古い 4 品は出る (開発モードでも開発用の陳列は出ない)',
      t6bDev.on === false && t6bDev.devMode === true && NEW_IDS.every((id) => !t6b.seen[id]) && OLD_IDS.every((id) => t6b.seen[id] > 0) && t6bDev.dev === 0,
      { seen: t6b.seen, dev: t6bDev });

    await new Promise((r) => setTimeout(r, 500));
    check('(9a) pageerror 0 件 (両ページ。console error も 0。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
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
