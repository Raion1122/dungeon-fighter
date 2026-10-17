/* verify_cleric_spirits.js — #95 僧侶の戦う祈り (スピリチュアルウェポン + スピリットガーディアンズ) の受入
 *
 *   node tools/verify_cleric_spirits.js                       ← 素の受入 (§8 の全 assert)
 *   node tools/verify_cleric_spirits.js --negative            ← 負のコントロール 7 本 (1 本ずつ順に)
 *   node tools/verify_cleric_spirits.js --negative --only frozen
 *
 * 依頼書: 実装依頼書/2026-10-17_cleric-spirits.md §8。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の index.html / tavern.html を実 Chrome (puppeteer-core) で開き、ゲームの関数を直に叩く。
 *  - 盤面 (敵の HP・座標・距離) は**ドライバ側で独立に**数える。距離はタイル添字のチェビシェフで
 *    ドライバが計算し、登録簿 (clericSpirits) の挙動と突き合わせる。
 *  - 乱数は Math.random を差し替えて固定する。乱数の順 (項目2 の実測):
 *      守護霊 = 敵ごとに tryDisplacement (orc は乱数を引かない) → セーヴ d20 → d8 × 3
 *      霊の武器 = d20 → (命中なら) tryDisplacement → d8 (クリティカルならもう 1 回)
 *    1 個の乱数 v は「d(s) の目 r」を v = (r - 0.5) / s で表す。
 *  - ⭐ (0a) が赤なら以降は測らず、全ラベルを赤で記録する (空振りの永久緑を作らない)。
 *  - ⛔ AI が実戦で「いつ」「何回」唱えるかは測らない (依頼書 §8 ⛔ / §9 の実機)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10634 だけを順に使う。
 *  - アンカーは**手つかずの原本**に対して 1 件ちょうどを確かめる。0 件 / 2 件以上なら exit 1。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は報告する。
 *
 * port: 10634 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
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
const PORT     = parseInt(arg('port', '10634'), 10);

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

function mutate(file, label, anchor, patch) {
  const tag  = label.split(' ')[0];
  const hits = PRISTINE[file].split(anchor).length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。変異は無効です:');
    console.error('         ' + file + '  ' + anchor.slice(0, 160));
    process.exit(1);
  }
  if (anchor === patch || anchor.length === patch.length) {
    console.error('[driver] ' + label + ' は置換前後が同一 / 同じバイト長です');
    process.exit(1);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) return;
  FROZEN[file] = Buffer.from(FROZEN[file].toString('utf8').split(anchor).join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました (' + file + ')');
}

/* 変異 → 赤くなるべきラベル (依頼書 §8 の表)。⚠ 1 本ずつ実走して確かめた。 */
const NEG_EXPECT = {
  frozen:  ['(1d)'],
  square:  ['(1a)'],
  nohalf:  ['(1b)'],
  intatk:  ['(2b)'],
  noclear: ['(3a)'],
  nochron: ['(4c)'],
  leak:    ['(5b)'],
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
  /* frozen: 頭の中心を「最初に測った時 (= 唱えた直後の描画) の座標」で owner に固定する (罠 B) */
  mutate('/index.html', 'frozen (頭の中心を唱えた時の座標で固定)',
    '      if (owner && owner.head === true) return { x: playerX + 48, y: playerY + 58 };',
    '      if (owner && owner.head === true) return (owner.__fz || (owner.__fz = { x: playerX + 48, y: playerY + 58 }));');
  /* square: 半径をチェビシェフ 3 ではなく 4 にする */
  mutate('/index.html', 'square (半径 3 → 4)',
    '    const CLERIC_SPIRIT_RADIUS = 3;',
    '    const CLERIC_SPIRIT_RADIUS = 3 + 1;');
  /* nohalf: セーヴ成功でも半分にしない */
  mutate('/index.html', 'nohalf (セーヴ成功でも半分にしない)',
    '        if (saved) dmg = Math.floor(dmg / 2);',
    '        if (saved) dmg = dmg;');
  /* intatk: 霊の武器の命中に spellAtkBonus (INT) を使う (罠 E) */
  mutate('/index.html', 'intatk (命中補正を INT 版へ)',
    '      const atkBonus = clericSpellAtkBonus(u);',
    '      const atkBonus = spellAtkBonus(u);');
  /* noclear: 戦闘の finally の掃除を外す */
  mutate('/index.html', 'noclear (戦闘の finally の clearClericSpirits を外す)',
    '        clearClericSpirits(); // ★[#95] 守護霊 / 霊の武器も次エンカへ持ち越さない (記録 + 絵の DOM)',
    '        /* noclear */');
  /* nochron: tick の beginTurn に owner を渡さない (罠 C) */
  mutate('/index.html', 'nochron (tick の beginTurn に owner を渡さない)',
    '        const __chSp = RunChronicle.beginTurn(owner);',
    '        const __chSp = RunChronicle.beginTurn(null);');
  /* leak: pickScrollId の撤退条件を外す */
  mutate('/index.html', 'leak (pickScrollId の撤退条件を外す)',
    '&& (isClericSpiritOn() || (id !== "tome-spiritual-weapon" && id !== "tome-spirit-guardians"))',
    '&& (true || (id !== "tome-spiritual-weapon" && id !== "tome-spirit-guardians"))');
  if (INJECTED.length !== 1) { console.error('[driver] 注入できた変異が ' + INJECTED.length + ' 本 (期待 1)'); process.exit(1); }
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
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (d ? '  -- ' + d.slice(0, 600) : ''));
}
/* (0a) が赤のとき、以降の全ラベルを赤で埋める (空振りの緑を作らない) */
const ALL_LABELS = ['(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(4c)', '(5a)', '(5b)', '(5c)', '(9a)'];

const pageErrors = [];
const PARTY = [
  { classKey: 'cleric',  isHero: true,  zone: 'mid',   name: null,   trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガロ', trait: null, line: null },
];
const KNOWN_ALL = ['cure-light-wounds', 'shield-of-faith', 'turn-undead', 'hold-person', 'spirit-guardians', 'spiritual-weapon'];
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
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ cleric: seed.known }));
    } catch (e) {}
  }, { party: PARTY, known: KNOWN_ALL });
  await page.goto('http://localhost:' + PORT + '/index.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction("typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
    + " && typeof createEnemy === 'function' && !!mapData && typeof clericSpirits !== 'undefined'", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}
async function openTavern(browser, qs, known) {
  const page = await browser.newPage();
  watchErrors(page, 'tavern' + (qs || ''));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((kn) => {
    try {
      localStorage.setItem('dragonfighters.xp', '45000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ cleric: kn }));
    } catch (e) {}
  }, known);
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__equipTV, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  return page;
}

/* ── ページ内の装置 (page.evaluate で注入) ──
 * 盤面: 12 マス以上つづく床の列 (lane) に僧侶と orc を並べる。HP は 400 (倒れない)。
 * ⛔ 乱数・演出の待ちは差し替える (dfPlayCast / sleepMs / moveEnemies)。 */
function install() {
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));
  try { window.moveEnemies = function () {}; } catch (e) {}
  window.dfPlayCast = function () { return Promise.resolve(); };
  const TILE = TILE_SIZE;
  let lane = null;
  for (let ty = 1; ty < MAP_H - 1 && !lane; ty++) {
    let run = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) { run++; if (run >= 12) { lane = { ty: ty, tx0: tx - run + 1 }; break; } }
      else run = 0;
    }
  }
  for (const e of enemies) { if (e) { e.x = -999999; e.y = -999999; } }
  for (const a of allies) { a.x = -999999; a.y = -999999; }
  const ORIG_RANDOM = Math.random;
  const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
  window.__cs = {
    lane: lane, TILE: TILE, setUnit: setUnit,
    cleric: () => allies.find((a) => a.classKey === 'cleric' && !a.isHero) || allies.find((a) => a.classKey === 'cleric'),
    /* 敵を lane の tx 列に並べ、交戦敵をちょうどこれにする */
    spawn: function (txs, hp) {
      const made = [];
      for (const tx of txs) {
        const idx = enemies.length;
        const e = createEnemy('orc', tx, lane.ty);
        enemies.push(e); createEnemyDom(idx, e.def, e.type);
        e.alive = true; e.maxHp = 400; e.hp = (hp != null ? hp : 400);
        setUnit(e, tx, lane.ty);
        made.push(idx);
      }
      encounterEnemyIndices.length = 0;
      for (const i of made) encounterEnemyIndices.push(i);
      return made;
    },
    killAll: function () {
      for (const i of encounterEnemyIndices) { if (enemies[i]) { enemies[i].alive = false; enemies[i].x = -999999; } }
      encounterEnemyIndices.length = 0;
    },
    /* ドライバが独立に数える座標: 中心のピクセルとタイル添字 */
    posOf: function (u) { const s = (u.def && u.def.displaySize) || 96; const cx = u.x + s / 2, cy = u.y + s / 2; return { cx: cx, cy: cy, tx: Math.floor(cx / TILE), ty: Math.floor(cy / TILE) }; },
    heroPos: function () { const cx = playerX + 48, cy = playerY + 58; return { cx: cx, cy: cy, tx: Math.floor(cx / TILE), ty: Math.floor(cy / TILE) }; },
    placeHero: function (tx) { playerX = tx * TILE + TILE / 2 - 48; playerY = lane.ty * TILE + TILE / 2 - 58; },
    /* 乱数を固定する。seq を先に使い、尽きたら fallback (引いた回数を数える) */
    rng: function (seq, fallback) {
      const q = seq.slice(); const st = { extra: 0 };
      Math.random = () => { if (q.length) return q.shift(); st.extra++; return fallback; };
      return { done: () => { Math.random = ORIG_RANDOM; return { left: q.length, extra: st.extra }; } };
    },
    restoreRandom: () => { Math.random = ORIG_RANDOM; },
    die: (r, s) => (r - 0.5) / s,
    rows: () => clericSpirits.map((r) => ({ kind: r.kind, head: !!(r.owner && r.owner.head === true), rl: r.roundsLeft })),
    dom: () => ({ sg: document.querySelectorAll('.sgFx').length, sw: document.querySelectorAll('.swMace').length }),
    reset: function () {
      this.killAll(); clearClericSpirits(); this.restoreRandom();
      const c = this.cleric();
      c.alive = true; c.hp = c.maxHp; initAllySpellSlots(c, 'cleric', 10, null);
      setUnit(c, lane.tx0, lane.ty);
      for (const a of allies) if (a !== c) { a.x = -999999; a.y = -999999; }
      return c;
    },
    /* 霊の武器の一撃を showRollAtEnemy から拾う (b = 命中補正) */
    rolls: [],
  };
  const origRoll = window.showRollAtEnemy;
  window.showRollAtEnemy = function (idx, html, type) {
    if (String(html).indexOf('霊の武器') >= 0) {
      const m = String(html).match(/d20\((\d+)\)\+(-?\d+) vs AC (\d+)/);
      window.__cs.rolls.push({ idx: idx, nat: m ? +m[1] : null, bonus: m ? +m[2] : null, ac: m ? +m[3] : null, type: type });
    }
    return origRoll.apply(this, arguments);
  };
  return { lane: lane, TILE: TILE };
}

/* ドライバ側の距離 (タイル添字のチェビシェフ) */
const cheb = (a, b) => Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_clericspirits_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile, '--mute-audio'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : ''));
    const page = await openIndex(browser, '');

    /* ══ §0 装置 ══ */
    const a0 = await page.evaluate(() => {
      const out = {
        sg: getSkill('spirit-guardians'), sw: getSkill('spiritual-weapon'),
        catSg: SCROLL_CATALOG['tome-spirit-guardians'] || null, catSw: SCROLL_CATALOG['tome-spiritual-weapon'] || null,
        known: { sg: isSpellKnown('cleric', 'spirit-guardians'), sw: isSpellKnown('cleric', 'spiritual-weapon') },
      };
      out.sg = out.sg ? { name: out.sg.name, levelReq: out.sg.levelReq } : null;
      out.sw = out.sw ? { name: out.sw.name, levelReq: out.sw.levelReq } : null;
      const c = allies.find((a) => a.classKey === 'cleric' && !a.isHero);
      const sv = { eq: c.equippedSkills, sl: c.spellSlots, ms: c.maxSpellSlots, mt: c.maxSpellSlotsTotal };
      initAllySpellSlots(c, 'cleric', 5, null);
      out.lv5 = { eq: c.equippedSkills.slice(), slots: Object.assign({}, c.spellSlots) };
      c.equippedSkills = sv.eq; c.spellSlots = sv.sl; c.maxSpellSlots = sv.ms; c.maxSpellSlotsTotal = sv.mt;
      return out;
    });
    check('(0a) [装置] 2 呪文が getSkill で引ける / 2 冊が SCROLL_CATALOG に在る / 習得済みの Lv5 僧侶の equippedSkills に 2 呪文が載る',
      a0.sg && a0.sw && a0.catSg && a0.catSw && a0.catSg.spellId === 'spirit-guardians' && a0.catSw.spellId === 'spiritual-weapon'
      && a0.known.sg && a0.known.sw && a0.lv5.eq.includes('spirit-guardians') && a0.lv5.eq.includes('spiritual-weapon')
      && a0.lv5.slots['spirit-guardians'] >= 1 && a0.lv5.slots['spiritual-weapon'] >= 1, a0);
    if (!results[results.length - 1].ok) {
      for (const l of ALL_LABELS) check(l + ' (0a) が赤なので測らない = 赤で記録', false, '装置が立っていない');
      throw { skipRest: true };
    }

    const inst = await page.evaluate(install);
    if (!inst.lane) { check('(0b) [装置] 12 マス続く床の列が見つかる', false, inst); throw { skipRest: true }; }

    /* ══ §1 守護霊 (仲間) — (0b)(1a)(1c) ══ */
    const g1 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      c.wis = 3;
      const made = S.spawn([L.tx0 + 1, L.tx0 + 2, L.tx0 + 3, L.tx0 + 4]);
      const pos = { c: S.posOf(c), e: made.map((i) => S.posOf(enemies[i])) };
      const hp0 = made.map((i) => enemies[i].hp);
      const ok = await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      const hpCast = made.map((i) => enemies[i].hp);
      const rows0 = S.rows();
      const ticks = [];
      for (let k = 1; k <= 6; k++) {
        const r = S.rng([], 0.5);           // d20 = 11 / d8 = 5
        const h0 = made.map((i) => enemies[i].hp);
        await tickClericSpirits(); updateClericSpirits();
        r.done();
        ticks.push({ k: k, dmg: made.map((i, j) => h0[j] - enemies[i].hp), rows: S.rows().length, dom: S.dom().sg });
      }
      return { ok, pos, hp0, hpCast, rows0, ticks, wis: c.wis, eWis: made.map((i) => (enemies[i].def && enemies[i].def.wis) || 0) };
    });
    const dist1 = g1.pos.e.map((p) => cheb(g1.pos.c, p));
    check('(0b) [装置] 盤面に「僧侶から 1・2・3・4 マス」の敵を 1 体ずつ置けている (距離はドライバが座標から計算)',
      JSON.stringify(dist1) === '[1,2,3,4]', { dist: dist1, cleric: g1.pos.c });
    /* 期待値はドライバが計算: d20 = 11, DC = 12 + wis。失敗 = 3d8 (5×3 = 15)、成功 = 7 */
    const dc1 = 12 + g1.wis;
    const exp1 = g1.eWis.map((w, j) => (dist1[j] <= 3 ? ((11 + w >= dc1) ? Math.max(1, Math.floor(15 / 2)) : 15) : 0));
    check('(1a) 唱えた次のラウンドの頭で、距離 1〜3 の敵だけが減り、距離 4 の敵は減らない (唱えた手番には誰も減らない)',
      g1.ok === true && JSON.stringify(g1.hpCast) === JSON.stringify(g1.hp0) && JSON.stringify(g1.ticks[0].dmg) === JSON.stringify(exp1),
      { dist: dist1, dmgRound1: g1.ticks[0].dmg, expected: exp1, castOk: g1.ok, hpUnchangedOnCast: JSON.stringify(g1.hpCast) === JSON.stringify(g1.hp0) });
    check('(1c) 5 ラウンドで切れる (1〜5 ラウンド目は減る・5 ラウンド目の後で登録簿 0 / 輪の DOM 0・6 ラウンド目の頭では誰も減らない)',
      g1.rows0.length === 1 && g1.rows0[0].rl === 5
      && g1.ticks.slice(0, 5).every((t) => JSON.stringify(t.dmg) === JSON.stringify(exp1))
      && g1.ticks[3].rows === 1 && g1.ticks[4].rows === 0 && g1.ticks[4].dom === 0 && g1.ticks[5].dmg.every((d) => d === 0),
      { rows0: g1.rows0, ticks: g1.ticks.map((t) => t.k + ':' + t.dmg.join('/') + ' rows' + t.rows + ' dom' + t.dom).join(' | ') });

    /* ── (1b) セーヴ: 成功 = ちょうど半分 (切り捨て・最低 1) / 失敗 = 3d8 そのまま。DC = 12 + WIS ── */
    const g2 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      c.wis = 3;
      const made = S.spawn([L.tx0 + 1]);
      const t = enemies[made[0]];
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      const D = S.die;
      const plan = [
        { d20: 15, d8: [8, 7, 4] },   // 15 = DC ちょうど → 成功の境目
        { d20: 14, d8: [8, 7, 4] },   // DC − 1 → 失敗
        { d20: 20, d8: [1, 1, 1] },   // 成功 / 3 → 1 (切り捨て)
        { d20: 20, d8: [1, 1, 2] },   // 成功 / 4 → 2
      ];
      const out = [];
      for (const p of plan) {
        const r = S.rng([D(p.d20, 20)].concat(p.d8.map((x) => D(x, 8))), 0.5);
        const h0 = t.hp;
        await tickClericSpirits();
        out.push({ p: p, dmg: h0 - t.hp, rng: r.done() });
      }
      clearClericSpirits();
      return { out, wis: c.wis, eWis: (t.def && t.def.wis) || 0 };
    });
    const dc2 = 12 + g2.wis;
    const exp2 = g2.out.map((o) => { const sum = o.p.d8.reduce((a, b) => a + b, 0); return (o.p.d20 + g2.eWis >= dc2) ? Math.max(1, Math.floor(sum / 2)) : sum; });
    check('(1b) セーヴ成功ならダメージがちょうど半分 (切り捨て・最低 1)・失敗なら 3d8 そのまま。DC = 12 + WIS (= ' + dc2 + '・ドライバが僧侶の wis から計算)',
      JSON.stringify(g2.out.map((o) => o.dmg)) === JSON.stringify(exp2) && g2.out.every((o) => o.rng.left === 0 && o.rng.extra === 0),
      { dmg: g2.out.map((o) => o.dmg), expected: exp2, rolls: g2.out.map((o) => 'd20=' + o.p.d20 + ' d8=' + o.p.d8.join('+')), rng: g2.out.map((o) => o.rng) });

    /* ── (1d) 頭が唱えたあと主人公を 3 マス動かすと、輪の中心が動く (罠 B) ── */
    const g3 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      S.reset();
      for (const a of allies) { a.x = -999999; a.y = -999999; }
      gameOver = false;
      const sv = { eq: equippedSkills };
      try {
        hp = maxHp;
        S.placeHero(L.tx0 + 3);
        const made = S.spawn([L.tx0 + 1, L.tx0 + 9]);   // A = 旧位置から 2 / 新位置から 5、B = 旧位置から 6 / 新位置から 3
        equippedSkills = ['spirit-guardians', 'spiritual-weapon', 'cure-light-wounds'];
        initLeaderSpellSlots('cleric', 10, null);
        const actor = makeLeaderActor();
        const ok = await executeSkillOn(actor, 'cleric', 'spirit-guardians', -1);
        syncLeaderFromActor(actor);
        updateClericSpirits();                   // 唱えた直後の描画 (毎フレームの renderWorld と同じ口)
        const disc = document.querySelector('.sgDisc');
        const hero0 = S.heroPos();
        const left0 = disc && parseFloat(disc.style.left);
        const sx0 = SX((hero0.tx + 0.5) * TILE_SIZE);
        playerX += 3 * TILE_SIZE;                // 主人公を 3 マス右へ
        updateClericSpirits();
        const hero1 = S.heroPos();
        const left1 = disc && parseFloat(disc.style.left);
        const sx1 = SX((hero1.tx + 0.5) * TILE_SIZE);
        const pos = made.map((i) => S.posOf(enemies[i]));
        const r = S.rng([], 0.5);
        const h0 = made.map((i) => enemies[i].hp);
        await tickClericSpirits();
        r.done();
        const dmg = made.map((i, j) => h0[j] - enemies[i].hp);
        const rows = S.rows();
        clearClericSpirits();
        return { ok, hero0, hero1, left0, left1, sx0, sx1, pos, dmg, rows };
      } finally { gameOver = true; equippedSkills = sv.eq; }
    });
    const d3old = g3.pos.map((p) => cheb(g3.hero0, p)), d3new = g3.pos.map((p) => cheb(g3.hero1, p));
    check('(1d) 頭が唱えたあと主人公を 3 マス動かすと輪の中心が動く: 今の位置から 3 以内の敵だけが焼かれ、唱えた位置の近くの敵は焼かれない (罠 B)',
      g3.ok === true && g3.rows.length === 1 && g3.rows[0].head === true && g3.hero1.tx - g3.hero0.tx === 3
      && d3old[0] <= 3 && d3new[0] > 3 && d3old[1] > 3 && d3new[1] <= 3
      && g3.dmg[0] === 0 && g3.dmg[1] > 0 && g3.left0 === g3.sx0 && g3.left1 === g3.sx1 && g3.left1 !== g3.left0,
      { distOld: d3old, distNew: d3new, dmg: g3.dmg, discLeft: [g3.left0, g3.left1], expectLeft: [g3.sx0, g3.sx1], rows: g3.rows });

    /* ── (1e) 掛け直しで 2 つにならない / (1f) 殻の展開中はダメージ 0・持続は減る ── */
    const g4 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      const r = S.rng([], 0.5); await tickClericSpirits(); r.done();
      const rlMid = clericSpirits[0] && clericSpirits[0].roundsLeft;
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);   // Lv10 = 枠 2
      updateClericSpirits();
      const after = { rows: S.rows(), own: clericSpirits.filter((x) => x.owner === c && x.kind === 'guardians').length, dom: S.dom().sg };
      clearClericSpirits();
      /* 殻 */
      initAllySpellSlots(c, 'cleric', 10, null);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      enemies[made[1]].shellActiveRemaining = 3;
      const shellOn = isSovereignShellActive();
      const h0 = made.map((i) => enemies[i].hp);
      const r2 = S.rng([], 0.5); await tickClericSpirits(); r2.done();
      const shell = { on: shellOn, dmg: made.map((i, j) => h0[j] - enemies[i].hp), rl: clericSpirits[0] && clericSpirits[0].roundsLeft };
      enemies[made[1]].shellActiveRemaining = 0;
      const h1 = made.map((i) => enemies[i].hp);
      const r3 = S.rng([], 0.5); await tickClericSpirits(); r3.done();
      shell.dmgAfter = made.map((i, j) => h1[j] - enemies[i].hp);
      clearClericSpirits();
      return { rlMid, after, shell };
    });
    check('(1e) 掛け直しで 2 つにならない (owner ごとに守護霊 1 行・持続は 5 へ戻る・輪の DOM は 1 組 = 2 部品)',
      g4.rlMid === 4 && g4.after.rows.length === 1 && g4.after.own === 1 && g4.after.rows[0].rl === 5 && g4.after.dom === 2, g4.after);
    check('(1f) 殻の展開中はダメージ 0・持続は減る (5 → 4)。殻が閉じれば次のラウンドは焼く',
      g4.shell.on === true && g4.shell.dmg.every((d) => d === 0) && g4.shell.rl === 4 && g4.shell.dmgAfter.every((d) => d > 0), g4.shell);

    /* ══ §2 霊の武器 ══ */
    const w1 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      c.int = 1; c.wis = 4;
      const made = S.spawn([L.tx0 + 6]);
      const t = enemies[made[0]];
      S.rolls.length = 0;
      const ok = await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      const castStrikes = S.rolls.length;
      const rows0 = S.rows();
      const perTick = [];
      for (let k = 1; k <= 6; k++) {
        const n0 = S.rolls.length;
        await tickClericSpirits(); updateClericSpirits();
        perTick.push({ k: k, strikes: S.rolls.length - n0, rows: S.rows().length, dom: S.dom().sw });
      }
      const bonuses = S.rolls.map((r) => r.bonus);
      const raw = { atkBonus: c.atkBonus, wis: c.wis, int: c.int, spellAtkBonus: (c.def.spellAtkBonus || 0), penalty: allyAtkStatusPenalty(c) };
      /* 決定的な一撃: 自然 20 = クリティカル (d8 2 回 + WIS) / 自然 1 = 外れ / d20 = 10 は補正しだい */
      clearClericSpirits(); initAllySpellSlots(c, 'cleric', 10, null);
      const D = S.die;
      const det = {};
      /* ⚠ 唱えた手番は一撃の前に演出が乱数を引く (実測 1 回) ⇒ 列ではなく定数 0.999 (自然 20・d8 = 8) で固定する */
      S.rolls.length = 0;
      let r = S.rng([], 0.999);
      let h0 = t.hp; await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]); det.crit = { dmg: h0 - t.hp, rng: r.done() };
      r = S.rng([D(1, 20)], 0.5); h0 = t.hp; await tickClericSpirits(); det.nat1 = { dmg: h0 - t.hp, rng: r.done() };
      r = S.rng([D(10, 20), D(4, 8)], 0.5); h0 = t.hp; await tickClericSpirits(); det.mid = { dmg: h0 - t.hp, rng: r.done() };
      det.ac = effectiveEnemyAc(t);
      det.nats = S.rolls.map((x) => x.nat);
      clearClericSpirits();
      return { ok, castStrikes, rows0, perTick, bonuses, raw, det };
    });
    check('(2a) 唱えた手番に 1 回・以後ラウンドの頭に 1 回ずつ攻撃する (5 ラウンドで計 6 回・6 ラウンド目は 0・5 ラウンド目の後で登録簿とメイスの DOM が 0)',
      w1.ok === true && w1.castStrikes === 1 && w1.rows0.length === 1 && w1.rows0[0].kind === 'weapon' && w1.rows0[0].rl === 5
      && w1.perTick.slice(0, 5).every((p) => p.strikes === 1) && w1.perTick[5].strikes === 0
      && w1.perTick[3].rows === 1 && w1.perTick[4].rows === 0 && w1.perTick[4].dom === 0 && w1.bonuses.length === 6,
      { cast: w1.castStrikes, ticks: w1.perTick.map((p) => p.strikes + '/' + p.rows + '/' + p.dom).join(' '), total: w1.bonuses.length });
    /* ドライバが独立に計算する命中補正 = atkBonus + wis + def.spellAtkBonus − 罰 (INT ではない) */
    const expWis = w1.raw.atkBonus + w1.raw.wis + w1.raw.spellAtkBonus - w1.raw.penalty;
    const expInt = w1.raw.atkBonus + w1.raw.int + w1.raw.spellAtkBonus - w1.raw.penalty;
    const midExp = (10 + expWis >= w1.det.ac) ? (4 + w1.raw.wis) : 0;
    check('(2b) 命中の補正が atkBonus + wis + def.spellAtkBonus − 罰 (INT ではない = 罠 E)。int ' + w1.raw.int + ' / wis ' + w1.raw.wis
      + ' ⇒ 期待 ' + expWis + ' (INT 版なら ' + expInt + ')。固定乱数: 自然 20 = 8+8+WIS / 自然 1 = 外れ / d20 10 = ' + (midExp ? '命中 ' + midExp : '外れ'),
      expWis !== expInt && w1.bonuses.length === 6 && w1.bonuses.every((b) => b === expWis)
      && w1.det.crit.dmg === 8 + 8 + w1.raw.wis && w1.det.nat1.dmg === 0 && w1.det.mid.dmg === midExp
      && JSON.stringify(w1.det.nats) === '[20,1,10]' && [w1.det.nat1, w1.det.mid].every((x) => x.rng.left === 0),
      { bonuses: w1.bonuses, expWis, expInt, raw: w1.raw, det: w1.det });

    /* ── (2c) 狙った敵を倒すと、次のラウンドは僧侶に一番近い生きた交戦敵を打つ ── */
    const w2 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const made = S.spawn([L.tx0 + 6, L.tx0 + 4, L.tx0 + 2]);   // A = 狙い (遠い・HP 1)、B = A に近い、C = 僧侶に近い
      const A = enemies[made[0]];
      A.hp = 1;
      const pos = { c: S.posOf(c), e: made.map((i) => S.posOf(enemies[i])) };
      S.rolls.length = 0;
      let r = S.rng([], 0.999);   // 自然 20 = 必中
      await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      r.done();
      const aDead = A.alive === false;
      const hp0 = made.map((i) => enemies[i].hp);
      const n0 = S.rolls.length;
      r = S.rng([], 0.999);
      await tickClericSpirits(); updateClericSpirits();
      r.done();
      const hit = S.rolls.slice(n0).map((x) => x.idx);
      const row = clericSpirits.find((x) => x.kind === 'weapon');
      const tgtIdx = row && row.target ? enemies.indexOf(row.target) : -1;
      const mace = document.querySelector('.swMace');
      const ct = row && row.target;
      const out = { made, pos, aDead, hit, tgtIdx, dmg: made.map((i, j) => hp0[j] - enemies[i].hp),
        maceLeft: mace && parseFloat(mace.style.left), expLeft: ct ? SX(ct.x + ct.def.displaySize / 2) : null, maceShown: mace && mace.style.display !== 'none' };
      clearClericSpirits();
      return out;
    });
    /* ドライバが独立に「僧侶に一番近い生きた敵」を選ぶ (ユークリッド距離・生きているのは B と C) */
    const liveJ = [1, 2];
    const nearJ = liveJ.reduce((b, j) => (Math.hypot(w2.pos.e[j].cx - w2.pos.c.cx, w2.pos.e[j].cy - w2.pos.c.cy)
      < Math.hypot(w2.pos.e[b].cx - w2.pos.c.cx, w2.pos.e[b].cy - w2.pos.c.cy) ? j : b), liveJ[0]);
    check('(2c) 狙った敵を倒すと、次のラウンドは僧侶に一番近い生きた交戦敵 (ドライバの計算 = ' + ['A', 'B', 'C'][nearJ] + ') を打つ (メイスもそこへ移る)',
      w2.aDead === true && w2.hit.length === 1 && w2.hit[0] === w2.made[nearJ] && w2.tgtIdx === w2.made[nearJ]
      && w2.dmg[nearJ] > 0 && w2.dmg[3 - nearJ] === 0 && w2.maceShown && w2.maceLeft === w2.expLeft,
      { aDead: w2.aDead, hitIdx: w2.hit, made: w2.made, dmg: w2.dmg, mace: [w2.maceLeft, w2.expLeft, w2.maceShown] });

    /* ── (2d) 射程外では前進して手番を終え、枠を減らさない ── */
    const w3 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const range = getRange(CLERIC_SKILLS['spiritual-weapon'].range).tiles;
      const made = S.spawn([L.tx0 + 2]);
      const t = enemies[made[0]];
      t.x = c.x + (range + 3) * TILE_SIZE;   // long の外
      const pos = { c: S.posOf(c), t: S.posOf(t) };
      const slot0 = c.spellSlots['spiritual-weapon'];
      const origAdv = window.allyAdvanceTowardPoint; const adv = [];
      window.allyAdvanceTowardPoint = function (u, wx, wy) { adv.push({ who: u === c, wx: wx, wy: wy }); return Promise.resolve(); };
      S.rolls.length = 0;
      let ok;
      try { ok = await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]); } finally { window.allyAdvanceTowardPoint = origAdv; }
      return { range, pos, ok, slot0, slot1: c.spellSlots['spiritual-weapon'], rows: S.rows().length, dom: S.dom().sw,
        adv, strikes: S.rolls.length, expWX: t.x + t.def.displaySize / 2, hpLoss: 400 - t.hp };
    });
    const d2d = cheb(w3.pos.c, w3.pos.t);
    check('(2d) 射程外 (距離 ' + d2d + ' > ' + w3.range + ') では前進して手番を終え、枠を減らさない (行・メイス・一撃 0)',
      d2d > w3.range && w3.ok === true && w3.slot1 === w3.slot0 && w3.slot0 >= 1 && w3.rows === 0 && w3.dom === 0 && w3.strikes === 0 && w3.hpLoss === 0
      && w3.adv.length === 1 && w3.adv[0].who && w3.adv[0].wx === w3.expWX, w3);

    /* ══ §3 終わり方 ══ */
    /* (3a) 本物の runEncounter を通して finally の掃除を踏む (gameOver = true でラウンドループは回らない) */
    const e1 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      updateClericSpirits();
      const before = { rows: S.rows().length, dom: S.dom() };
      gameOver = true;
      let err = null;
      const to = new Promise((res) => setTimeout(() => res('timeout'), 30000));
      const ran = await Promise.race([runEncounter(made.slice()).then(() => 'done', (e) => 'throw ' + e), to]);
      const after = { rows: S.rows().length, dom: S.dom(), active: encounterActive };
      /* 次の戦闘へ持ち越さない: 新しい交戦で 1 ラウンド回しても誰も減らない */
      const made2 = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      const h0 = made2.map((i) => enemies[i].hp);
      const r = S.rng([], 0.999); await tickClericSpirits(); r.done();
      const next = made2.map((i, j) => h0[j] - enemies[i].hp);
      clearClericSpirits();
      return { before, ran, after, next, err };
    });
    check('(3a) 戦闘が終わると (本物の runEncounter の finally) 登録簿が空・絵の DOM が 0。次の戦闘へ持ち越さない',
      e1.before.rows === 2 && e1.before.dom.sg === 2 && e1.before.dom.sw === 1 && e1.ran === 'done'
      && e1.after.rows === 0 && e1.after.dom.sg === 0 && e1.after.dom.sw === 0 && e1.next.every((d) => d === 0), e1);

    /* (3b) 僧侶が倒れると、その僧侶の 2 つが外れる (ラウンドの頭 / 毎フレームの両方の口) */
    const e2 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      const before = S.rows().length;
      c.alive = false;
      const h0 = made.map((i) => enemies[i].hp);
      S.rolls.length = 0;
      const r = S.rng([], 0.999); await tickClericSpirits(); r.done();
      const tick = { rows: S.rows().length, dmg: made.map((i, j) => h0[j] - enemies[i].hp), strikes: S.rolls.length, dom: S.dom() };
      c.alive = true; initAllySpellSlots(c, 'cleric', 10, null);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      const before2 = S.rows().length;
      c.alive = false; updateClericSpirits();
      const frame = { rows: S.rows().length, dom: S.dom() };
      c.alive = true;
      clearClericSpirits();
      return { before, tick, before2, frame };
    });
    check('(3b) 僧侶が倒れると、その僧侶の 2 つ (守護霊 + 霊の武器) が外れる (ラウンドの頭: 誰も減らず一撃 0 / 毎フレーム: 行と DOM が 0)',
      e2.before === 2 && e2.tick.rows === 0 && e2.tick.dmg.every((d) => d === 0) && e2.tick.strikes === 0 && e2.tick.dom.sg === 0 && e2.tick.dom.sw === 0
      && e2.before2 === 2 && e2.frame.rows === 0 && e2.frame.dom.sg === 0 && e2.frame.dom.sw === 0, e2);

    /* ══ §4 AI と年代記 ══ */
    const ai1 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const out = {};
      let made = S.spawn([L.tx0 + 2, L.tx0 + 3]);
      out.two = { pos: made.map((i) => S.posOf(enemies[i])), want: spiritGuardiansWanted(c) };
      S.killAll(); made = S.spawn([L.tx0 + 2, L.tx0 + 7]);
      out.one = { pos: made.map((i) => S.posOf(enemies[i])), want: spiritGuardiansWanted(c) };
      S.killAll(); made = S.spawn([L.tx0 + 2, L.tx0 + 3]);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      out.already = { want: spiritGuardiansWanted(c), rows: S.rows().length };
      clearClericSpirits();
      /* clericAI: 2 体の前で守護霊を唱える (述語が真のとき候補に入る) */
      initAllySpellSlots(c, 'cleric', 10, null);
      hp = maxHp; for (const a of allies) a.hp = a.maxHp;
      const r = S.rng([], 0.999);
      let ran; try { ran = await clericAI(c); } finally { r.done(); }
      out.ai = { ran, rows: clericSpirits.map((x) => x.kind + ':' + (x.owner === c)) };
      clearClericSpirits();
      out.c = S.posOf(c);
      return out;
    });
    const dTwo = ai1.two.pos.map((p) => cheb(ai1.c, p)), dOne = ai1.one.pos.map((p) => cheb(ai1.c, p));
    check('(4a) 仲間の僧侶: 3 マス以内に敵 2 体 → 守護霊の述語が真 / 1 体 → 偽 / 既に張っている → 偽 (clericAI は真のとき唱える)',
      dTwo.filter((d) => d <= 3).length === 2 && dOne.filter((d) => d <= 3).length === 1
      && ai1.two.want === true && ai1.one.want === false && ai1.already.want === false && ai1.already.rows === 1
      && ai1.ai.ran === true && ai1.ai.rows.join() === 'guardians:true',
      { distTwo: dTwo, distOne: dOne, two: ai1.two.want, one: ai1.one.want, already: ai1.already, ai: ai1.ai });

    /* (4b) 頭の僧侶: playerAttackTurn の候補 (pickLeaderAction に渡る choices) を拾う */
    const ai2 = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      S.reset();
      for (const a of allies) { a.x = -999999; a.y = -999999; }
      gameOver = false;
      const sv = { eq: equippedSkills, pick: window.pickLeaderAction };
      const SENT = { sentinel: true };
      const cases = [];
      async function probe(name, txs, pre) {
        S.killAll(); clearClericSpirits();
        hp = maxHp;
        equippedSkills = ['spirit-guardians', 'spiritual-weapon', 'cure-light-wounds'];
        initLeaderSpellSlots('cleric', 10, null);
        S.placeHero(L.tx0);
        const made = S.spawn(txs);
        if (pre) await pre(made);
        let choices = null;
        window.pickLeaderAction = function (ch) { choices = ch.slice(); throw SENT; };
        try { await playerAttackTurn(made[0]); } catch (e) { if (e !== SENT) choices = 'ERR ' + e; }
        finally { window.pickLeaderAction = sv.pick; }
        cases.push({ name, dist: made.map((i) => { const p = S.posOf(enemies[i]); return Math.max(Math.abs(p.tx - S.heroPos().tx), Math.abs(p.ty - S.heroPos().ty)); }),
          choices, wantSg: spiritGuardiansWanted('player'), wantSw: spiritWeaponWanted('player'),
          wasteSg: apIsWastedCast('player', 'spirit-guardians', CLERIC_SKILLS['spirit-guardians']),
          wasteSw: apIsWastedCast('player', 'spiritual-weapon', CLERIC_SKILLS['spiritual-weapon']) });
      }
      try {
        await probe('two', [L.tx0 + 1, L.tx0 + 3]);
        await probe('one', [L.tx0 + 1, L.tx0 + 7]);
        await probe('already', [L.tx0 + 1, L.tx0 + 3], async (made) => {
          const a = makeLeaderActor();
          await executeSkillOn(a, 'cleric', 'spirit-guardians', -1);
          await executeSkillOn(a, 'cleric', 'spiritual-weapon', made[0]);
          syncLeaderFromActor(a);
        });
      } finally { gameOver = true; equippedSkills = sv.eq; window.pickLeaderAction = sv.pick; clearClericSpirits(); }
      return cases;
    });
    const c2 = Object.fromEntries(ai2.map((c) => [c.name, c]));
    const inC = (c, id) => Array.isArray(c.choices) && c.choices.includes(id);
    const mirror = ai2.every((c) => Array.isArray(c.choices)
      && inC(c, 'spirit-guardians') === c.wantSg && inC(c, 'spiritual-weapon') === c.wantSw
      && c.wasteSg === !c.wantSg && c.wasteSw === !c.wantSw);
    check('(4b) 頭の僧侶: 3 マス以内に 2 体 → 守護霊が候補に入る / 1 体 → 外れる / 既に張っている → 2 つとも外れる。apIsWastedCast は述語と一致',
      c2.two && c2.one && c2.already && c2.two.dist.filter((d) => d <= 3).length === 2 && c2.one.dist.filter((d) => d <= 3).length === 1
      && inC(c2.two, 'spirit-guardians') && inC(c2.two, 'spiritual-weapon') && !inC(c2.one, 'spirit-guardians') && inC(c2.one, 'spiritual-weapon')
      && !inC(c2.already, 'spirit-guardians') && !inC(c2.already, 'spiritual-weapon') && mirror,
      ai2.map((c) => c.name + ' dist=' + c.dist.join('/') + ' choices=' + JSON.stringify(c.choices) + ' want=' + c.wantSg + '/' + c.wantSw + ' waste=' + c.wasteSg + '/' + c.wasteSw).join(' | '));

    /* (4c) 年代記: tick のダメージと撃破が、唱えた僧侶の名前に帰属する (頭 = 主人公) */
    const ch = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const snap = () => RunChronicle.snapshot(null).members.map((m) => ({ n: m.name, d: m.dealt, k: m.kills, h: !!m.isHero }));
      const pick = (arr, f) => arr.find(f) || { d: 0, k: 0 };
      /* 仲間 */
      const c = S.reset();
      const name = c.npcName || (c.def && c.def.name);
      let made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      enemies[made[1]].hp = 2;
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      let b = snap(); let h0 = made.map((i) => enemies[i].hp);
      let r = S.rng([], 0.5); await tickClericSpirits(); r.done();
      let a = snap();
      const ally = { name, lost: made.reduce((s, i, j) => s + h0[j] - enemies[i].hp, 0), killed: !enemies[made[1]].alive,
        dGain: pick(a, (m) => m.n === name).d - pick(b, (m) => m.n === name).d, kGain: pick(a, (m) => m.n === name).k - pick(b, (m) => m.n === name).k };
      /* 霊の武器の tick の一撃も */
      clearClericSpirits(); initAllySpellSlots(c, 'cleric', 10, null);
      S.killAll(); made = S.spawn([L.tx0 + 2]);
      await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      b = snap(); h0 = enemies[made[0]].hp;
      r = S.rng([], 0.999); await tickClericSpirits(); r.done();
      a = snap();
      ally.wLost = h0 - enemies[made[0]].hp;
      ally.wGain = pick(a, (m) => m.n === name).d - pick(b, (m) => m.n === name).d;
      clearClericSpirits();
      /* 頭 */
      S.reset();
      for (const x of allies) { x.x = -999999; x.y = -999999; }
      gameOver = false;
      const sv = { eq: equippedSkills };
      const head = {};
      try {
        hp = maxHp;
        S.placeHero(L.tx0);
        equippedSkills = ['spirit-guardians', 'spiritual-weapon', 'cure-light-wounds'];
        initLeaderSpellSlots('cleric', 10, null);
        made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
        enemies[made[1]].hp = 2;
        const act = makeLeaderActor();
        await executeSkillOn(act, 'cleric', 'spirit-guardians', -1);
        syncLeaderFromActor(act);
        b = snap(); h0 = made.map((i) => enemies[i].hp);
        r = S.rng([], 0.5); await tickClericSpirits(); r.done();
        a = snap();
        head.leader = getLeaderName();
        head.lost = made.reduce((s, i, j) => s + h0[j] - enemies[i].hp, 0);
        head.killed = !enemies[made[1]].alive;
        head.dGain = pick(a, (m) => m.h).d - pick(b, (m) => m.h).d;
        head.kGain = pick(a, (m) => m.h).k - pick(b, (m) => m.h).k;
        head.heroName = pick(a, (m) => m.h).n;
      } finally { gameOver = true; equippedSkills = sv.eq; clearClericSpirits(); }
      return { ally, head };
    });
    check('(4c) 年代記: ラウンドの頭の傷と撃破が、唱えた僧侶の名前に帰属する (仲間 = ' + ch.ally.name + ' / 頭 = 主人公 ' + ch.head.leader + ')',
      ch.ally.lost > 0 && ch.ally.killed && ch.ally.dGain === ch.ally.lost && ch.ally.kGain === 1 && ch.ally.wLost > 0 && ch.ally.wGain === ch.ally.wLost
      && ch.head.lost > 0 && ch.head.killed && ch.head.dGain === ch.head.lost && ch.head.kGain === 1 && ch.head.heroName === ch.head.leader, ch);

    /* ══ §5 撤退 (素の側) + (3c) ══ */
    const sweep = await page.evaluate(() => {
      const S = window.__cs;
      const out = { uncommon: new Set(), rare: new Set(), common: new Set() };
      for (const rar of ['common', 'uncommon', 'rare']) {
        const w = { common: 0, uncommon: 0, rare: 0 }; w[rar] = 1;
        for (let k = 0; k < 2000; k++) { const v = (k + 0.5) / 2000; S.rng([], v); out[rar].add(pickScrollId(w)); S.restoreRandom(); }
      }
      const res = {};
      for (const k of Object.keys(out)) res[k] = [...out[k]].sort();
      res.catalogU = Object.keys(SCROLL_CATALOG).filter((id) => SCROLL_CATALOG[id].rarity === 'uncommon').sort();
      res.catalogR = Object.keys(SCROLL_CATALOG).filter((id) => SCROLL_CATALOG[id].rarity === 'rare').sort();
      return res;
    });
    const nodeEnd = await page.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      const before = S.rows().length;
      clearNodeArrays();
      return { before, after: S.rows().length };
    });
    check('(3c) ノード遷移 (clearNodeArrays) で登録簿が空', nodeEnd.before === 2 && nodeEnd.after === 0, nodeEnd);
    await page.close();

    const off = await openIndex(browser, '?clericspirit=0');
    await off.evaluate(install);
    const o1 = await off.evaluate(async () => {
      const S = window.__cs, L = S.lane;
      const c = S.reset();
      const made = S.spawn([L.tx0 + 1, L.tx0 + 2]);
      const out = { on: isClericSpiritOn(), known: isSpellKnown('cleric', 'spirit-guardians') && isSpellKnown('cleric', 'spiritual-weapon'),
        eq: c.equippedSkills.slice(), slots: Object.assign({}, c.spellSlots) };
      out.wantSg = spiritGuardiansWanted(c); out.wantSw = spiritWeaponWanted(c);
      out.exSg = await executeSkillOn(c, 'cleric', 'spirit-guardians', -1);
      out.exSw = await executeSkillOn(c, 'cleric', 'spiritual-weapon', made[0]);
      out.rows = S.rows().length; out.slotsAfter = Object.assign({}, c.spellSlots);
      gameOver = false;
      const sv = equippedSkills;
      try {
        hp = maxHp; S.placeHero(L.tx0);
        equippedSkills = ['spirit-guardians', 'spiritual-weapon', 'cure-light-wounds'];
        initLeaderSpellSlots('cleric', 10, null);
        out.headSg = spiritGuardiansWanted('player'); out.headSw = spiritWeaponWanted('player');
        const a = makeLeaderActor();
        out.headExSg = await executeSkillOn(a, 'cleric', 'spirit-guardians', -1);
        out.headExSw = await executeSkillOn(a, 'cleric', 'spiritual-weapon', made[0]);
        out.headRows = S.rows().length;
      } finally { gameOver = true; equippedSkills = sv; }
      /* pickScrollId の全区間 */
      const sets = { common: new Set(), uncommon: new Set(), rare: new Set() };
      for (const rar of ['common', 'uncommon', 'rare']) {
        const w = { common: 0, uncommon: 0, rare: 0 }; w[rar] = 1;
        for (let k = 0; k < 2000; k++) { const v = (k + 0.5) / 2000; S.rng([], v); sets[rar].add(pickScrollId(w)); S.restoreRandom(); }
      }
      out.sweep = {};
      for (const k of Object.keys(sets)) out.sweep[k] = [...sets[k]].sort();
      return out;
    });
    check('(5a) ?clericspirit=0 → 習得済み (equippedSkills にも在る) でも executeSkillOn が 2 呪文で false・AI の述語が偽 (仲間 / 頭)・行 0・枠は減らない',
      o1.on === false && o1.known && o1.eq.includes('spirit-guardians') && o1.eq.includes('spiritual-weapon')
      && o1.wantSg === false && o1.wantSw === false && o1.exSg === false && o1.exSw === false && o1.rows === 0
      && JSON.stringify(o1.slots) === JSON.stringify(o1.slotsAfter)
      && o1.headSg === false && o1.headSw === false && o1.headExSg === false && o1.headExSw === false && o1.headRows === 0, o1);
    const TOMES = ['tome-spiritual-weapon', 'tome-spirit-guardians'];
    const offAll = [].concat(o1.sweep.common, o1.sweep.uncommon, o1.sweep.rare);
    check('(5b) ?clericspirit=0 → pickScrollId の全区間 (common / uncommon / rare) で 2 冊が出ない。素では uncommon / rare の集合に入る (他の巻物は素と同じ)',
      sweep.uncommon.includes('tome-spiritual-weapon') && sweep.rare.includes('tome-spirit-guardians')
      && JSON.stringify(sweep.uncommon) === JSON.stringify(sweep.catalogU) && JSON.stringify(sweep.rare) === JSON.stringify(sweep.catalogR)
      && TOMES.every((t) => offAll.indexOf(t) < 0)
      && JSON.stringify(o1.sweep.uncommon) === JSON.stringify(sweep.uncommon.filter((x) => TOMES.indexOf(x) < 0))
      && JSON.stringify(o1.sweep.rare) === JSON.stringify(sweep.rare.filter((x) => TOMES.indexOf(x) < 0))
      && JSON.stringify(o1.sweep.common) === JSON.stringify(sweep.common),
      { plain: { u: sweep.uncommon, r: sweep.rare }, off: { u: o1.sweep.uncommon, r: o1.sweep.rare, c: o1.sweep.common.length } });
    await off.close();

    /* ══ (0c) 写し: index と tavern で 呪文の表・枠の表・聖典の行 (+ 開発用の棚) が同じ中身で 1 行ずつ ══ */
    const IX = PRISTINE['/index.html'], TV = PRISTINE['/tavern.html'];
    const count = (s, re) => (s.match(re) || []).length;
    const rowOf = (s, re) => { const m = s.match(re); return m ? m[0].replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim() : null; };
    const src = {};
    for (const id of ['spiritual-weapon', 'spirit-guardians']) {
      const slotRe = new RegExp('^\\s*"' + id + '":\\s*\\[[\\d,\\s]+\\],?', 'gm');
      const tomeRe = new RegExp('^\\s*"tome-' + id + '":\\s*\\{[^\\n]*\\}', 'gm');
      src[id] = {
        ixSpell: count(IX, new RegExp('^\\s*"' + id + '":\\s*\\{', 'gm')), tvSpell: count(TV, new RegExp('\\{ id: "' + id + '",', 'g')),
        ixSlot: count(IX, slotRe), tvSlot: count(TV, slotRe), ixTome: count(IX, tomeRe), tvTome: count(TV, tomeRe),
        slotSame: rowOf(IX, new RegExp(slotRe.source, 'm')) === rowOf(TV, new RegExp(slotRe.source, 'm')),
        tomeSame: rowOf(IX, new RegExp(tomeRe.source, 'm')) === rowOf(TV, new RegExp(tomeRe.source, 'm')),
      };
    }
    const tv = await openTavern(browser, '?dev=1', KNOWN_ALL);
    const tvVals = await tv.evaluate(() => ({
      ui: ['spiritual-weapon', 'spirit-guardians'].map((id) => { const s = CLERIC_SKILLS_UI.find((x) => x.id === id); return s ? [id, s.name, s.levelReq, s.range, s.mpCost, s.flavor] : null; }),
      slots: ['spiritual-weapon', 'spirit-guardians'].map((id) => (CLERIC_SLOTS_TABLE[id] || []).join(',')),
      cat: ['tome-spiritual-weapon', 'tome-spirit-guardians'].map((id) => JSON.stringify(SCROLL_CATALOG_TV[id] || null)),
      shelf: SCROLL_DEV_SHELF_TV.slice(),
    }));
    const p2 = await openIndex(browser, '');
    const ixVals = await p2.evaluate(() => ({
      ui: ['spiritual-weapon', 'spirit-guardians'].map((id) => { const s = CLERIC_SKILLS[id]; return s ? [id, s.name, s.levelReq, s.range, s.mpCost, s.flavor] : null; }),
      slots: ['spiritual-weapon', 'spirit-guardians'].map((id) => (CLERIC_SLOTS_TABLE[id] || []).join(',')),
      cat: ['tome-spiritual-weapon', 'tome-spirit-guardians'].map((id) => JSON.stringify(SCROLL_CATALOG[id] || null)),
    }));
    await p2.close();
    const srcOk = Object.values(src).every((s) => s.ixSpell === 1 && s.tvSpell === 1 && s.ixSlot === 1 && s.tvSlot === 1 && s.ixTome === 1 && s.tvTome === 1 && s.slotSame && s.tomeSame);
    check('(0c) ソース 2 ファイルの写し (呪文の表・枠の表・聖典の行 + 開発用の棚) が 1 行ずつ・同じ中身 (levelReq / range / mpCost / flavor / 枠の数列 / 聖典の中身)',
      srcOk && JSON.stringify(tvVals.ui) === JSON.stringify(ixVals.ui) && JSON.stringify(tvVals.slots) === JSON.stringify(ixVals.slots)
      && JSON.stringify(tvVals.cat) === JSON.stringify(ixVals.cat) && TOMES.every((t) => tvVals.shelf.filter((x) => x === t).length === 1),
      { src, tv: tvVals, ix: ixVals });

    /* ══ (5c) tavern の開発用の棚 ══ */
    const shelfRows = async (pg) => pg.evaluate(() => {
      __equipTV.setShopTab('buy'); __equipTV.openShop();
      const Ls = document.getElementById('shopList'); const out = []; let cur = null;
      for (const el of (Ls ? Ls.children : [])) {
        if (el.classList.contains('shopGroupHead')) { cur = el.textContent; continue; }
        if (cur === '巻物' && el.classList.contains('shopItem')) { const b = el.querySelector('button.shopBtn'); const nm = el.querySelector('.shopName'); out.push({ name: nm ? nm.textContent : null, btn: b ? b.textContent : null }); }
      }
      return { dev: DF_DEV_MAGIC_SHOP, on: isClericSpiritOnTV(), ids: scrollShelfIds(), rows: out };
    });
    await tv.close();
    const KNOWN_BASE = ['cure-light-wounds', 'shield-of-faith', 'turn-undead', 'hold-person'];
    const tvOn = await openTavern(browser, '?dev=1', KNOWN_BASE);
    const sOn = await shelfRows(tvOn); await tvOn.close();
    const tvOff = await openTavern(browser, '?dev=1&clericspirit=0', KNOWN_BASE);
    const sOff = await shelfRows(tvOff); await tvOff.close();
    const NAMES = ['聖典・スピリチュアルウェポン', '聖典・スピリットガーディアンズ'];
    check('(5c) tavern.html?clericspirit=0 → 開発用の棚に 2 冊が無い (他の開発用の巻物は在る)。素の開発モードでは 2 冊が「購入 1G」で並ぶ',
      sOn.dev === true && sOn.on === true && TOMES.every((t) => sOn.ids.includes(t)) && NAMES.every((n) => sOn.rows.some((r) => r.name === n && r.btn === '購入 1G'))
      && sOff.dev === true && sOff.on === false && TOMES.every((t) => !sOff.ids.includes(t)) && NAMES.every((n) => !sOff.rows.some((r) => r.name === n))
      && sOff.ids.includes('scroll-invisibility'),
      { on: { ids: sOn.ids, rows: sOn.rows.filter((r) => NAMES.includes(r.name)) }, off: { ids: sOff.ids, rows: sOff.rows.filter((r) => NAMES.includes(r.name)) } });

    await new Promise((r) => setTimeout(r, 500));
    check('(9a) pageerror 0 件 (console error も 0。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    if (!(e && e.skipRest)) {
      console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
      results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
    }
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); } catch (e) {}
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
