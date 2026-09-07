#!/usr/bin/env node
/*
 * verify_aoe_coverage.js — 実装依頼書 #59
 *   「範囲呪文を最大巻き込みで撃つ + ホールド・パーソンを turn-undead と同格へ」
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_aoe_coverage.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_aoe_coverage.js --negative            ← 負のコントロール (1 本ずつ)
 *   node tools/verify_aoe_coverage.js --negative --only m1
 *
 * ── 測っているもの (依頼書 §9) ─────────────────────────────────────────────
 *   §0 装置 (⭐⭐⭐ これが無いと全 assert が空振りで永久緑)
 *   §1 拒否権の撤廃 — 箱型 / 直線 / splash の 3 系統を 2 経路で突き合わせる
 *   §2 巻き込み数 (⭐ 目的そのもの。「拒否権を消した」ではなく「巻き込みが増えた」で判定)
 *   §3 単体呪文の非波及 (pickClosestEngagedEnemyFromAlly が無傷であることを挙動で)
 *   §4 スリープの狙点 (多い方の群れへ)
 *   §5 hold-person (Lv3 解禁 / Lv7 で 2 枚 / 梯子 / 二重定義の突き合わせ)
 *   §6 「(味方 N 名は無傷)」の逐語表示
 *
 * ── ⛔ 測らないこと ────────────────────────────────────────────────────────
 *   ・巻き込み数の絶対値の「良さ」= 難易度 (実機体感。依頼書 §10-3)
 *   ・円錐 (#50 の 2 段構え) — 今回は 1 行も触っていない。verify_cone_cast が守る
 *   ・吹き出しの型クラス (skill / miss)。⚠ 命中ロール次第で揺れる = フレークの元
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────────
 *  - ⭐⭐⭐ pickAoeOrigin は **9 引数目 coverMode** が増えている。8 引数で叩くと
 *    2026-09-07 以前の legacy 挙動が返り、§1 / §2 が **永久緑**になる。
 *    ⇒ 本ドライバは必ず `pickAoeOrigin(..., AOE_COVER_ON)` (本番と同一の呼び) か
 *      本番の ally* 関数そのものを通す。⛔ window.__aoeCover.pickAoeBestOrigin は
 *      主張の測定に使わない (m1 は「委譲行を消す」変異なので、そこを直接叩くと素通しする)。
 *  - ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になる)。
 *  - ⚠ ポートは **10141** (変異の子プロセスは 10142〜10150)。
 *    ⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56 の実測)。
 *    ⛔ 10151 / 10161 / 10171 は #59 の使い捨て probe と隣窓 #60 が使用済。
 *  - ⚠ 変異は **2 ファイルにまたがる** (m6 は tavern.html) ので mutate() に file を持たせる。
 *  - ⚠ index.html / tavern.html はディスク上 **CRLF**。複数行アンカーは CRLF で書く。
 *  - ⚠ classic script 直下の let/const は window に載らない → **裸の識別子**で読む
 *    (allies / enemies / AOE_COVER_ON / CLERIC_SLOTS_TABLE / encounterEnemyIndices)。
 *    function 宣言は window に載るので spawnGroundFx などは差し替えられる。
 *  - ⚠ sleepMs の差し替えは必ず setTimeout(r, 0)。Promise.resolve() はマイクロタスク飢餓。
 *  - ⭐ 盤面は「絶対タイル座標」を 1 つも直書きしない。最長の床の行 (lane) を実測して
 *    その **相対オフセット**で組む (幾何が動いた日に岩盤化して母集団が消えるのを防ぐ)。
 *  - ⭐⭐⭐ 「理論最大の巻き込み数」は **敵の生座標だけ**からドライバが総当たりで出す
 *    (⛔ pickAoeOrigin / pickAoeBestOrigin の戻り値を母数にすると循環して永久緑)。
 *  - ⚠ goblin-mine 部屋 0 の実スポーンは敵 2 体だけ。盤面は
 *    createEnemy → enemies.push → createEnemyDom の **3 点セット**で足す
 *    (el を持たない偽の敵を push すると defeatEnemy / triggerEnemyDamageFlash が壊れる)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §9 §7 の 9 本 + sleep 側 1 本 = **10 本**。⚠⚠⚠ **1 本ずつ** --only で確定させる
 *   (同時に入れると互いを覆い隠す)。NEG_EXPECT は机上で書かず、1 本ずつ実走して
 *   **実際に赤くなったラベル**を書いてある。
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
const PORT     = parseInt(arg('port', '10141'), 10);
const SCENARIO = arg('scenario', 'goblin-mine');

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {
  '/index.html':  fs.readFileSync(path.join(ROOT, 'index.html')),
  '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')),
};
const PRISTINE = {
  '/index.html':  FROZEN['/index.html'].toString('utf8'),
  '/tavern.html': FROZEN['/tavern.html'].toString('utf8'),
};
const CRLF = PRISTINE['/index.html'].includes('\r\n') ? '\r\n' : '\n';
const INJECTED = [];

/* ⭐⭐⭐ アンカー健在チェックは **手つかずの原本** に対して行う (#56 の教訓)。
   変異後のバッファで数えると、同じアンカーを共有する 2 本目が「注入点 0 箇所」=
   偽のアンカー腐敗 (exit 3) になり、いちばん大事な変異が 1 度も走らない。 */
function mutate(file, label, anchor, patch) {
  const tag  = label.split(' ')[0];
  const hits = PRISTINE[file].split(anchor).length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + file + '  ' + anchor.slice(0, 200));
    process.exit(3);
  }
  if (anchor === patch || anchor.length === patch.length) {
    console.error('[driver] ' + label + ' は置換前後が同一 / 同じバイト長です (起動時検算に落ちる形)');
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  const parts = FROZEN[file].toString('utf8').split(anchor);
  if (parts.length - 1 !== 1) {
    console.error('[driver] ' + label + ' は同 tag の先行変異にアンカーを食われました (' + (parts.length - 1) + ' 箇所)。');
    process.exit(3);
  }
  FROZEN[file] = Buffer.from(parts.join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました (' + file + ')');
}

/* 変異 → 赤くなるべきラベルの担当表。
   ⚠⚠⚠ 机上で書いてはいけない。`--only <tag>` で 1 本ずつ走らせ、実際に赤くなった
     ラベルを見てから書き換える (下の値は 2026-09-07 の実走で採ったもの)。 */
const NEG_EXPECT = {
  m1:  ['(1a)', '(1b)', '(2a)', '(2b)', '(6a)'],
  m2:  ['(2a)'],
  m2s: ['(4a)'],
  m3:  ['(3a)', '(3b)', '(3c)'],
  m4:  ['(5a)', '(5b)', '(5e)'],
  m5:  ['(5c)'],
  m6:  ['(5e)'],
  m7:  ['(1d)'],
  m8:  ['(1c)'],
  m9:  ['(2c)'],
};

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad  = [];
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます'
    + '  ⚠ 同時注入は互いを覆い隠すので必ず 1 本ずつ');
  tags.forEach((tag, i) => {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT + 1 + i)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  });
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}

if (NEGATIVE) {
  /* ── m1: 箱型の拒否権を残す = 掃引版への委譲行を落とす。
        ⭐ 本番の 9 引数の呼びが legacy 本体へ落ち、拒否権が絶対に戻る。 */
  mutate('/index.html', 'm1 (箱型の拒否権を残す = pickAoeBestOrigin への委譲を落とす)',
    '      if (coverMode) return pickAoeBestOrigin(spellId, aCX, aCY, targetTX, targetTY, S, rangeTiles, allowZeroFoes);',
    '      void coverMode;   /* m1: 委譲しない = 2026-09-07 以前の拒否権へ戻す */');
  /* ── m2: 箱型の狙点を「最寄りのまま」に戻す = 敵由来の中心候補を足さない。 */
  mutate('/index.html', 'm2 (箱型の狙点を最寄りのままにする = 敵由来の中心候補を足さない)',
    '        centers.push({ tx: tx, ty: ty, legacy: false });',
    '        void 0;   /* m2: 中心候補を増やさない */');
  /* ── m2s: スリープの狙点を「最寄りのまま」に戻す (⭐ 箱型とは別実装なので別の変異)。 */
  mutate('/index.html', 'm2s (スリープの狙点を最寄りのままにする)',
    '              candidates.push({ tx: eTX + dx, ty: eTY + dy, legacy: false });',
    '              void 0;   /* m2s: 中心候補を増やさない */');
  /* ── m3: ⭐ 15 呼び口が通る狙点を壊す。距離の符号を反転して「最も遠い敵」を返させる。
        ⛔ 比較演算子の反転は bestDist=Infinity のせいで -1 を返すだけになり、
          「狙いが変わった」ではなく「誰も狙わない」になるので採らない。 */
  mutate('/index.html', 'm3 (pickClosestEngagedEnemyFromAlly を「最も遠い敵」へ反転)',
    '        const d = Math.hypot(aCX - eCX, aCY - eCY);',
    '        const d = -Math.hypot(aCX - eCX, aCY - eCY);   /* m3 */');
  /* ── m4: hold-person を #57 着地時 (Lv5 解禁 / Lv7 で 1 枚) のままにする。 */
  mutate('/index.html', 'm4 (hold-person のスロット表を Lv5 のままにする)',
    '      "hold-person":          [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],   // \u2605[#59] turn-undead \u3068\u540c\u4e00',
    '      "hold-person":          [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2],   /* m4 */');
  /* ── m5: 梯子を #57 着地時の位置 (turn-undead の後ろ) へ戻す。⭐ 2 行で 1 本。 */
  mutate('/index.html', 'm5 (梯子 2a を殺す)',
    '      if (HOLD_SLOTS_ON && await tryHoldPerson()) return true;',
    '      if (false && await tryHoldPerson()) return true;   /* m5 */');
  mutate('/index.html', 'm5 (梯子 2b を常時有効へ = turn-undead の後ろへ戻す)',
    '      if (!HOLD_SLOTS_ON && await tryHoldPerson()) return true;',
    '      if (true && await tryHoldPerson()) return true;   /* m5 */');
  /* ── m6: ⭐ tavern.html の鏡だけ直し忘れる (二重定義の突き合わせが唯一の守り手)。 */
  mutate('/tavern.html', 'm6 (tavern.html の CLERIC_SLOTS_TABLE の鏡だけ直し忘れる)',
    '    "hold-person":          [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],',
    '    "hold-person":          [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2],   /* m6 */');
  /* ── m7: splash の拒否権を残す。 */
  mutate('/index.html', 'm7 (splash の拒否権を残す)',
    '      const splashOk = AOE_COVER_ON || !partyInArea(pTX - 1, pTY - 1, 3, 3);',
    '      const splashOk = !partyInArea(pTX - 1, pTY - 1, 3, 3);   /* m7 */');
  /* ── m8: 直線の blocked を残す。 */
  mutate('/index.html', 'm8 (直線 lightning-bolt の blocked を残す)',
    '          if (!AOE_COVER_ON && partyInArea(tx, ty, 1, 1)) { blocked = true; break; }',
    '          if (partyInArea(tx, ty, 1, 1)) { blocked = true; break; }   /* m8 */');
  /* ── m9: 新しい中心候補に aoeBoxReachable (射程 + 視線) を掛け忘れる。 */
  mutate('/index.html', 'm9 (新候補に aoeBoxReachable を掛け忘れる = 射程外へ撃つ)',
    '          if (!c.legacy &&' + CRLF
    + '              !aoeBoxReachable(aCX, aCY, enemiesInArea(r.best.tx, r.best.ty, S, S), rangeTiles)) continue;',
    '          if (false &&' + CRLF
    + '              !aoeBoxReachable(aCX, aCY, enemiesInArea(r.best.tx, r.best.ty, S, S), rangeTiles)) continue;   /* m9 */');
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません');
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)');
  process.exit(2);
}
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

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
 * 集計
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* ⭐ 3 点セット。魔法使い + 僧侶の両方が要る
   (⛔ どちらか欠けると §1〜§4 か §5 が丸ごと空振りする)。 */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];

async function openIndex(browser, qs) {
  const page = await browser.newPage();
  const tag = 'index' + (qs || '');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけに絞る
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  /* ⚠ evaluateOnNewDocument は全ナビゲーションで再実行される。消去系はここへ置かない。 */
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  }, { scen: SCENARIO, party: SEED_PARTY, xp: 45000 });
  await page.goto('http://localhost:' + PORT + '/index.html' + (qs || ''),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  /* ⚠ 裸の識別子で待つ (classic script 直下の const/let は window に載らない)。 */
  await page.waitForFunction(
    "typeof allies !== 'undefined' && allies.length > 0"
    + " && typeof enemies !== 'undefined' && typeof createEnemy === 'function'"
    + " && typeof pickAoeOrigin === 'function' && !!mapData",
    { timeout: 45000 });
  return page;
}

async function openTavern(browser, qs) {
  const page = await browser.newPage();
  const tag = 'tavern' + (qs || '');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs || ''),
    { waitUntil: 'networkidle2', timeout: 40000 });
  await page.waitForFunction(
    "typeof CLERIC_SLOTS_TABLE !== 'undefined' && typeof CLERIC_SKILLS_UI !== 'undefined'",
    { timeout: 25000 });
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 盤面の据え付け (index 側)
 *   ⭐ 演出だけを黙らせ、判定ロジックは本番のまま呼ぶ。
 * ══════════════════════════════════════════════════════════════════════════ */
function installProbe() {
  /* 隔離レシピ (2026-06-08 に確立):
       gameOver=true         … 裏のオートバトルのラウンドループを止める
       encounterActive=false … combat-stall watchdog の発火条件を外す
       sleepMs → setTimeout(r,0) … 演出待ちを即時化
         (⛔ Promise.resolve() はマイクロタスク飢餓で CDP の evaluate が 180s で死ぬ) */
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));
  try { window.moveEnemies = function () {}; } catch (e) {}
  window.__castCalls = 0;
  window.dfPlayCast = function () { window.__castCalls++; return Promise.resolve(); };
  /* 飛翔の演出だけ即解決にする。⛔ 着弾点の決定にも被害者列挙にも 1 行も関わらない。
     ⚠⚠⚠ **await される rAF アニメはここで全部潰すこと。** 背景タブでは
       requestAnimationFrame が止まるので、1 本でも取りこぼすと evaluate が
       protocolTimeout (240s) までハングする (2026-09-07 の初回実走で
       castMagicMissileBarrage を取りこぼして実際に踏んだ)。
     ⭐ 対象の数え方 = 各 ally* 関数の `await <fn>(` を機械的に列挙する
       (実測: spawnFireballProjectile / spawnArrow / castMagicMissileBarrage の 3 本。
        残りは dfPlayCast / sleepMs / allyAdvanceTowardPoint / allyBasicAttack)。 */
  window.spawnFireballProjectile = function () { return Promise.resolve(); };
  window.spawnArrow = function () { return Promise.resolve(); };
  window.castMagicMissileBarrage = function () { return Promise.resolve(); };

  /* ⭐ 着弾点の記録 — spawnGroundFx は「箱の原点と寸法」をそのまま受け取る唯一の口
     (⛔ pickAoeOrigin の戻り値は本番の呼び口の中に閉じていて外から読めない)。 */
  window.__fx = [];
  const _sg = window.spawnGroundFx;
  window.spawnGroundFx = function (tx, ty, w, h, kind, ms) {
    window.__fx.push({ tx: tx, ty: ty, w: w, h: h, kind: kind });
    return _sg.apply(null, arguments);
  };

  /* ⭐ 吹き出しの記録。⚠ 1300ms で消えるので後から DOM を見に行くと空。
     ⚠ 型クラス (skill / miss) は命中ロール次第で揺れるので **記録するが assert しない**。 */
  window.__pops = [];
  try {
    new MutationObserver(function (muts) {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList && n.classList.contains('rollPop')) {
          window.__pops.push({ html: n.innerHTML, text: n.textContent });
        }
      }
    }).observe(document.body, { childList: true });
  } catch (e) {}

  const TILE = TILE_SIZE;
  /* ⭐ 横に連続した床が **最長** の行を実測する (⛔ 絶対タイル座標を直書きしない
     = 幾何が動いた日に「岩盤化」して母集団が黙って消えるのを防ぐ)。 */
  let lane = { len: 0, ty: -1, tx0: -1 };
  for (let ty = 1; ty < MAP_H - 1; ty++) {
    let run = 0, start = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) {
        if (run === 0) start = tx;
        run++;
        if (run > lane.len) lane = { len: run, ty: ty, tx0: start };
      } else run = 0;
    }
  }
  const setUnit = (u, tx, ty) => {
    const s = (u.def && u.def.displaySize) || 96;
    u.x = tx * TILE + TILE / 2 - s / 2;
    u.y = ty * TILE + TILE / 2 - s / 2;
  };
  const tileOf = (u) => ({ tx: Math.floor((u.x + u.def.displaySize / 2) / TILE),
                           ty: Math.floor((u.y + u.def.displaySize / 2) / TILE) });
  const mageOf   = () => allies.find((a) => a.classKey === 'mage');
  const clericOf = () => allies.find((a) => a.classKey === 'cleric');

  window.__ap = {
    lane: lane,
    info: function () {
      return {
        lane: lane, MAP_W: MAP_W, MAP_H: MAP_H, TILE: TILE,
        coverOn: (typeof AOE_COVER_ON !== 'undefined') ? AOE_COVER_ON : null,
        holdOn:  (typeof HOLD_SLOTS_ON !== 'undefined') ? HOLD_SLOTS_ON : null,
        seam: !!window.__aoeCover,
        rangeAoE: getRange('spellAoE').tiles,
        rangeBow: getRange('bow').tiles,
        allies: allies.map((a) => a.classKey),
        fns: ['allyFireball', 'allySleep', 'allyLightningBolt', 'allyLightningArrow',
              'allyMagicMissile', 'allyFireBolt', 'mageAI', 'clericAI']
          .map((k) => k + '=' + (typeof window[k])).join(','),
      };
    },
    /* 盤面を組む。spec のオフセットはすべて lane.tx0 からの相対。
       ⚠ 既存の敵は「消さずに alive=false」(⛔ 添字並列の配列を崩さない)。 */
    board: function (spec) {
      for (const e of enemies) { e.alive = false; e.hp = 0; }
      for (const a of allies) {
        a.alive = true; a.hp = a.maxHp; a.x = -999999; a.y = -999999;
        try { a.buffs.acBonusRemaining = 0; } catch (err) {}
      }
      try { hp = maxHp; } catch (e) {}
      gameOver = true;
      if (spec.mage != null) setUnit(mageOf(), lane.tx0 + spec.mage, lane.ty);
      if (spec.cleric != null) setUnit(clericOf(), lane.tx0 + spec.cleric, lane.ty);
      snapPlayerToTile(lane.tx0 + (spec.hero == null ? 0 : spec.hero), lane.ty);
      const made = [];
      for (const s of (spec.enemies || [])) {
        const idx = enemies.length;
        const e = createEnemy(s.type || 'goblin', lane.tx0 + s.off, lane.ty + (s.dy || 0));
        enemies.push(e); createEnemyDom(idx, e.def, e.type);
        e.alive = true; e.maxHp = Math.max(e.maxHp || 0, 400); e.hp = e.maxHp; e.stunned = 0;
        made.push(idx);
      }
      encounterEnemyIndices = made.slice();
      window.__fx.length = 0; window.__pops.length = 0;
      window.__aoeStats = {};
      const m = mageOf();
      return { lane: lane, made: made, mage: tileOf(m),
        hero: { tx: Math.floor((playerX + 48) / TILE), ty: Math.floor((playerY + 58) / TILE) },
        foes: made.map((i) => Object.assign({ i: i, type: enemies[i].type }, tileOf(enemies[i]))),
        aliveFoes: enemies.filter((e) => e.alive).length,
        aliveAllies: allies.filter((a) => a.alive).length };
    },
    /* ⭐⭐⭐ 理論最大の巻き込み数 — **敵の生座標だけ**からドライバが総当たりで出す。
       ⛔ pickAoeOrigin / pickAoeBestOrigin を 1 度も呼ばない (循環すると永久緑)。
       候補 = 「少なくとも 1 体の敵を含む S×S の箱」全部 = 本番の中心候補が張る空間と同一。 */
    oracle: function (S) {
      const pts = [];
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.alive) continue;
        pts.push({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE),
                   ty: Math.floor((e.y + e.def.displaySize / 2) / TILE) });
      }
      let mx = 0, at = null;
      for (const p of pts) {
        for (let dy = -(S - 1); dy <= 0; dy++) for (let dx = -(S - 1); dx <= 0; dx++) {
          const ox = p.tx + dx, oy = p.ty + dy;
          let c = 0;
          for (const q of pts) if (q.tx >= ox && q.tx < ox + S && q.ty >= oy && q.ty < oy + S) c++;
          if (c > mx) { mx = c; at = { tx: ox, ty: oy }; }
        }
      }
      return { max: mx, at: at, n: pts.length };
    },
    /* 箱の中の生存敵をドライバ側で数える (⛔ enemiesInArea を使わない = 独立源)。 */
    countIn: function (tx, ty, w, h) {
      let c = 0;
      for (const e of enemies) {
        if (!e || !e.alive) continue;
        const ex = Math.floor((e.x + e.def.displaySize / 2) / TILE);
        const ey = Math.floor((e.y + e.def.displaySize / 2) / TILE);
        if (ex >= tx && ex < tx + w && ey >= ty && ey < ty + h) c++;
      }
      return c;
    },
    /* 主人公 + 仲間が箱の中に何人いるか。⭐ ドライバ側の独立計算 (⛔ partyInArea を呼ばない)。 */
    partyAt: function (tx, ty, w, h) {
      let n = 0;
      const lTX = Math.floor((playerX + 48) / TILE), lTY = Math.floor((playerY + 58) / TILE);
      if (lTX >= tx && lTX < tx + w && lTY >= ty && lTY < ty + h) n++;
      for (const a of allies) {
        if (!a || !a.alive) continue;
        const aTX = Math.floor((a.x + a.def.displaySize / 2) / TILE);
        const aTY = Math.floor((a.y + a.def.displaySize / 2) / TILE);
        if (aTX >= tx && aTX < tx + w && aTY >= ty && aTY < ty + h) n++;
      }
      return n;
    },
    /* ⭐⭐⭐ 本番と 1 バイト同じ呼び方 (9 引数目に AOE_COVER_ON)。
       ⛔ 8 引数で叩くと legacy が返り §1/§2 が永久緑になる。 */
    boxPick: function (spellId, S, targetIdx, rangeKey) {
      const m = mageOf();
      const aCX = m.x + m.def.displaySize / 2, aCY = m.y + m.def.displaySize / 2;
      const t = enemies[targetIdx];
      const ex = t.x + t.def.displaySize / 2, ey = t.y + t.def.displaySize / 2;
      const rangeTiles = getRange(rangeKey || 'spellAoE').tiles;
      const targetTX = Math.floor(ex / TILE), targetTY = Math.floor(ey / TILE);
      const prev = window.__aoeStats;
      window.__aoeStats = {};
      const r = pickAoeOrigin(spellId, aCX, aCY, targetTX, targetTY, S, rangeTiles, false, AOE_COVER_ON);
      const st = window.__aoeStats[spellId] ? JSON.parse(JSON.stringify(window.__aoeStats[spellId])) : null;
      window.__aoeStats = prev;
      let count = 0, minCheb = null, partyN = 0;
      if (r.best) {
        count = window.__ap.countIn(r.best.tx, r.best.ty, S, S);
        partyN = window.__ap.partyAt(r.best.tx, r.best.ty, S, S);
        for (const e of enemies) {
          if (!e || !e.alive) continue;
          const ecx = e.x + e.def.displaySize / 2, ecy = e.y + e.def.displaySize / 2;
          const etx = Math.floor(ecx / TILE), ety = Math.floor(ecy / TILE);
          if (etx < r.best.tx || etx >= r.best.tx + S || ety < r.best.ty || ety >= r.best.ty + S) continue;
          const d = tileChebyshev(aCX, aCY, ecx, ecy);
          if (minCheb === null || d < minCheb) minCheb = d;
        }
      }
      return { best: r.best, count: count, rawCount: r.count, stats: st,
        partyInBox: partyN, minCheb: minCheb, rangeTiles: rangeTiles,
        target: { tx: targetTX, ty: targetTY } };
    },
    /* 本番の ally* をそのまま呼ぶ (⛔ 判定は 1 行も再実装しない)。 */
    cast: async function (fnName, targetIdx) {
      window.__fx.length = 0; window.__pops.length = 0; window.__aoeStats = {};
      const m = mageOf();
      const before = enemies.map((e) => e.hp);
      let err = null;
      try { await window[fnName](m, targetIdx); }
      catch (e) { err = String((e && e.message) || e); }
      return { err: err, fx: window.__fx.slice(), pops: window.__pops.slice(),
        stats: JSON.parse(JSON.stringify(window.__aoeStats || {})),
        hpDelta: enemies.map((e, i) => before[i] - e.hp),
        mage: tileOf(m) };
    },
    /* §3: 狙点。⭐ 期待値はドライバが **敵の生座標から独立に**計算する。 */
    closest: function () {
      const m = mageOf();
      const aCX = m.x + m.def.displaySize / 2, aCY = m.y + m.def.displaySize / 2;
      let expect = -1, bd = Infinity;
      for (const i of encounterEnemyIndices) {
        const e = enemies[i];
        if (!e || !e.alive) continue;
        const d = Math.hypot(aCX - (e.x + e.def.displaySize / 2), aCY - (e.y + e.def.displaySize / 2));
        if (d < bd) { bd = d; expect = i; }
      }
      return { prod: pickClosestEngagedEnemyFromAlly(m), expect: expect, enc: encounterEnemyIndices.slice() };
    },
    /* §3 の実挙動: 単体呪文 1 本だけを装備させて **本番の mageAI** を回し、誰が減ったかを見る。
       ⭐ mageAI の全枝 (apTryPreferred / 攻撃呪文) が狙点に pickClosestEngagedEnemyFromAlly を通す。 */
    aiSingle: async function (skillId, times) {
      const m = mageOf();
      m.equippedSkills = [skillId];
      m.spellSlots = {}; m.spellSlots[skillId] = 99;
      m.maxSpellSlots = {}; m.maxSpellSlots[skillId] = 99;
      const before = enemies.map((e) => e.hp);
      let ran = 0, err = null;
      for (let k = 0; k < times; k++) {
        try { await mageAI(m); ran++; } catch (e) { err = String((e && e.message) || e); break; }
        m.spellSlots[skillId] = 99;
      }
      return { err: err, ran: ran, hpDelta: enemies.map((e, i) => before[i] - e.hp), mage: tileOf(m) };
    },
    /* §5: 僧侶の枠。⭐ 本番の関数で開ける (⛔ spellSlots を手で書かない)。 */
    clericSlots: function (lv) {
      const c = clericOf();
      initAllySpellSlots(c, 'cleric', lv, null);
      return { eq: (c.equippedSkills || []).slice(),
        max: Object.assign({}, c.maxSpellSlots || {}),
        total: c.maxSpellSlotsTotal };
    },
    /* §5 の梯子: 本番の clericAI を 1 手番だけ回し、**どのスロットが減ったか**で判定する。
       ⭐ held ではなくスロットで見る (⚠ 抵抗 RESIST があるので held は確率的 = フレークの元)。 */
    clericTurn: async function () {
      const c = clericOf();
      initAllySpellSlots(c, 'cleric', 10, null);
      const before = Object.assign({}, c.spellSlots);
      const pick = pickHoldPersonTarget(c);
      let ret = null, err = null;
      try { ret = await clericAI(c); } catch (e) { err = String((e && e.message) || e); }
      const after = Object.assign({}, c.spellSlots);
      const used = {};
      for (const k of Object.keys(before)) {
        const d = (before[k] || 0) - (after[k] || 0);
        if (d !== 0) used[k] = d;
      }
      return { err: err, ret: ret, pick: pick, used: used, before: before, after: after };
    },
    mirrors: function () {
      return {
        slots: (typeof CLERIC_SLOTS_TABLE !== 'undefined') ? CLERIC_SLOTS_TABLE['hold-person'].slice() : null,
        turn:  (typeof CLERIC_SLOTS_TABLE !== 'undefined') ? CLERIC_SLOTS_TABLE['turn-undead'].slice() : null,
        levelReq: (typeof CLERIC_SKILLS !== 'undefined') ? CLERIC_SKILLS['hold-person'].levelReq : null,
      };
    },
  };
  return window.__ap.info();
}

/* 酒場側の鏡 (⚠ index.html と二重定義。片方だけ直すと食い違う)。 */
function tavernMirrors() {
  const ui = (typeof CLERIC_SKILLS_UI !== 'undefined')
    ? CLERIC_SKILLS_UI.filter((s) => s.id === 'hold-person')[0] : null;
  return {
    slots: (typeof CLERIC_SLOTS_TABLE !== 'undefined') ? CLERIC_SLOTS_TABLE['hold-person'].slice() : null,
    turn:  (typeof CLERIC_SLOTS_TABLE !== 'undefined') ? CLERIC_SLOTS_TABLE['turn-undead'].slice() : null,
    levelReq: ui ? ui.levelReq : null,
  };
}

/* stats から「系統」で引く。⛔ 呪文名 (日本語) を写経しない。 */
function byKind(stats, kind) {
  for (const k of Object.keys(stats || {})) if (stats[k] && stats[k].kind === kind) return { key: k, e: stats[k] };
  return null;
}
const TAG_RE = /<br>\(味方 (\d+) 名は無傷\)/;
function popsWithTag(pops) { return (pops || []).filter((p) => TAG_RE.test(p.html)); }
function areaFromPops(pops) {
  for (const p of (pops || [])) { const m = p.text.match(/範囲 (\d+)体/); if (m) return parseInt(m[1], 10); }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_aoecover_');
  const server = await startServer().catch((e) => {
    console.error('[driver] サーバを立てられません: ' + e.message); process.exit(2);
  });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile,
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    protocolTimeout: 240000,
  });

  try {
    const pOn  = await openIndex(browser, '');
    const iOn  = await pOn.evaluate(installProbe);
    const pOff = await openIndex(browser, '?aoecover=0');
    const iOff = await pOff.evaluate(installProbe);

    const L = iOn.lane;
    const MAGE = 1, NEAR = 4, CL = [9, 10, 11];
    const FAR  = [L.len - 3, L.len - 2, L.len - 1];
    const G = (off) => ({ off: off });

    /* ══ §0 装置 ═══════════════════════════════════════════════════════════ */
    check('(0a) [装置] 撤退スイッチが両アームで期待どおり読めている '
      + '(素 AOE_COVER_ON=true / ?aoecover=0 で false。⭐ 両方 true だと §1/§2 が対照を失う)',
      iOn.coverOn === true && iOff.coverOn === false && iOn.seam === true,
      '素 ' + iOn.coverOn + ' / 撤退 ' + iOff.coverOn + ' / __aoeCover=' + iOn.seam
      + ' / fns ' + iOn.fns);

    check('(0b) [装置] lane (最長の床の行) が 21 マス以上あり、遠クラスタを術者の射程外へ置ける '
      + '(⭐ 絶対タイル座標は 1 つも直書きしていない。⛔ ここが短いと (2c) が組めない)',
      L.len >= 21 && (FAR[0] - MAGE) > iOn.rangeAoE,
      'lane len=' + L.len + ' ty=' + L.ty + ' tx0=' + L.tx0
      + ' / mage off=' + MAGE + ' far off=' + JSON.stringify(FAR)
      + ' / 距離 ' + (FAR[0] - MAGE) + ' > 射程 ' + iOn.rangeAoE);

    const bA = await pOn.evaluate(() => window.__ap.board(
      { mage: 1, hero: 0, cleric: null,
        enemies: [{ off: 4 }, { off: 9 }, { off: 10 }, { off: 11 }] }));
    check('(0c) [装置] 盤面に敵 2 体以上・味方 1 名以上が実在する (巻き込みの差が出る条件)',
      bA.aliveFoes >= 2 && bA.aliveAllies >= 1 && bA.made.length === 4,
      '敵 ' + bA.aliveFoes + ' 体 ' + JSON.stringify(bA.foes.map((f) => f.tx + ',' + f.ty))
      + ' / 味方 ' + bA.aliveAllies + ' 名 / 術者 ' + bA.mage.tx + ',' + bA.mage.ty
      + ' / 主人公 ' + bA.hero.tx + ',' + bA.hero.ty);

    const cEq = await pOn.evaluate(() => window.__ap.clericSlots(10));
    check('(0d) [装置] 僧侶が equippedSkills に hold-person を持っている '
      + '(⭐ ここが空だと §5 の梯子 assert が丸ごと空振りする)',
      cEq.eq.indexOf('hold-person') >= 0 && (cEq.max['hold-person'] || 0) > 0,
      'Lv10 eq=' + JSON.stringify(cEq.eq) + ' / max=' + JSON.stringify(cEq.max));

    /* ══ §1 拒否権の撤廃 (3 系統) ═══════════════════════════════════════════ */
    /* 盤面 V: 主人公を **標的と同じマス**へ置く。
       ⇒ legacy では「標的を含む 9 箱」が全部 PT 入りで棄却され、撃てなくなる (#50 と同型)。 */
    const specV = { mage: 1, hero: NEAR, cleric: null, enemies: [{ off: NEAR }] };
    const vOn  = await pOn.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.cast('allyFireball', b.made[0]); return { b: b, r: r }; }, specV);
    const vOff = await pOff.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.cast('allyFireball', b.made[0]); return { b: b, r: r }; }, specV);
    const vsOn  = byKind(vOn.r.stats, 'box');
    const vsOff = byKind(vOff.r.stats, 'box');

    check('(0e) [装置] window.__aoeStats が 1 呪文以上で attempts > 0 を計上している '
      + '(⭐⭐⭐ ここが 0 だと §1 の全 assert が「観測できていない」まま緑になる)',
      !!vsOn && vsOn.e.attempts > 0 && !!vsOff && vsOff.e.attempts > 0,
      '素 ' + JSON.stringify(vsOn) + ' / 撤退 ' + JSON.stringify(vsOff));

    check('(1a) ★★ 箱型: partyRejected が計上されても demoted が増えない '
      + '(= 味方入りの箱を弾いても撃てる)。⚠ 撤退 ?aoecover=0 では逆に demoted へ落ちること',
      !!vsOn && vsOn.e.partyRejected > 0 && vsOn.e.demoted === 0 && vsOn.e.cast === 1
      && !!vsOff && vsOff.e.demoted === 1 && vsOff.e.cast === 0,
      '素 ' + (vsOn ? JSON.stringify(vsOn.e) : 'なし')
      + '  ‖  撤退 ' + (vsOff ? JSON.stringify(vsOff.e) : 'なし'));

    const vFx = (vOn.r.fx || []).filter((f) => f.kind === 'fireball-scorch')[0] || null;
    const vHeroIn = !!vFx && vOn.b.hero.tx >= vFx.tx && vOn.b.hero.tx < vFx.tx + 3
                          && vOn.b.hero.ty >= vFx.ty && vOn.b.hero.ty < vFx.ty + 3;
    check('(1b) ★★ 実挙動: **味方が範囲に入る着弾点が実際に選ばれた** '
      + '(⭐ 着弾点は spawnGroundFx が受け取った箱の原点。判定はドライバが主人公のタイルと突き合わせる)',
      vHeroIn,
      '着弾 ' + JSON.stringify(vFx) + ' / 主人公 ' + JSON.stringify(vOn.b.hero)
      + ' / fx=' + JSON.stringify(vOn.r.fx) + (vOn.r.err ? ' / err=' + vOn.r.err : ''));

    /* 盤面 L: 主人公を「術者 → 敵」の直線の 1 歩目に立たせる。 */
    const specL = { mage: 1, hero: 2, cleric: null, enemies: [{ off: 3 }, { off: 4 }] };
    const lOn  = await pOn.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.cast('allyLightningBolt', b.made[0]); return { b: b, r: r }; }, specL);
    const lOff = await pOff.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.cast('allyLightningBolt', b.made[0]); return { b: b, r: r }; }, specL);
    const lsOn = byKind(lOn.r.stats, 'line'), lsOff = byKind(lOff.r.stats, 'line');
    check('(1c) ★ 直線 (ライトニングボルト): 味方が線上に居ても方向を捨てない '
      + '(⚠ 撤退では従来どおり降格すること = 2 経路の突き合わせ)',
      !!lsOn && lsOn.e.cast === 1 && lsOn.e.demoted === 0
      && !!lsOff && lsOff.e.cast === 0 && lsOff.e.demoted === 1,
      '素 ' + (lsOn ? lsOn.key + ' ' + JSON.stringify(lsOn.e) : 'なし')
      + '  ‖  撤退 ' + (lsOff ? lsOff.key + ' ' + JSON.stringify(lsOff.e) : 'なし'));

    /* 盤面 S: 主人公を主弾のマスへ置く (= splash の 3x3 に必ず入る)。 */
    const specS = { mage: 1, hero: 5, cleric: null, enemies: [{ off: 5 }, { off: 6 }] };
    const sOn  = await pOn.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.cast('allyLightningArrow', b.made[0]); return { b: b, r: r }; }, specS);
    const sOff = await pOff.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.cast('allyLightningArrow', b.made[0]); return { b: b, r: r }; }, specS);
    const ssOn = byKind(sOn.r.stats, 'splash'), ssOff = byKind(sOff.r.stats, 'splash');
    check('(1d) ★ splash (ライトニング・アロー): 味方が 3x3 に居ても飛散する '
      + '(⚠ 撤退では従来どおり splash を捨てること)',
      !!ssOn && ssOn.e.cast === 1 && ssOn.e.demoted === 0
      && !!ssOff && ssOff.e.cast === 0 && ssOff.e.demoted === 1,
      '素 ' + (ssOn ? ssOn.key + ' ' + JSON.stringify(ssOn.e) : 'なし')
      + '  ‖  撤退 ' + (ssOff ? ssOff.key + ' ' + JSON.stringify(ssOff.e) : 'なし'));

    /* ══ §2 巻き込み数 (⭐ 目的そのもの) ════════════════════════════════════ */
    const LAYOUTS = [
      { n: 'A 群れ3+最寄り1/主人公は端',
        s: { mage: MAGE, hero: 0, cleric: null, enemies: [G(NEAR), G(CL[0]), G(CL[1]), G(CL[2])] } },
      { n: 'B 群れ2+最寄り1',
        s: { mage: MAGE, hero: 0, cleric: null, enemies: [G(NEAR), G(CL[0]), G(CL[1])] } },
      { n: 'C 主人公が最寄りと同じマス',
        s: { mage: MAGE, hero: NEAR, cleric: null, enemies: [G(NEAR), G(CL[0]), G(CL[1]), G(CL[2])] } },
      { n: 'D 敵1体だけ(上位互換の対照)',
        s: { mage: MAGE, hero: 5, cleric: null, enemies: [G(NEAR)] } },
      { n: 'E 主人公が群れの真ん中',
        s: { mage: MAGE, hero: CL[1], cleric: null, enemies: [G(NEAR), G(CL[0]), G(CL[1]), G(CL[2])] } },
    ];
    const sweep = async (page) => {
      const out = [];
      for (const lay of LAYOUTS) {
        const r = await page.evaluate((s) => {
          const b = window.__ap.board(s);
          const p = window.__ap.boxPick('fireball', 3, b.made[0]);
          return { b: b, p: p, oracle: window.__ap.oracle(3) };
        }, lay.s);
        out.push({ n: lay.n, count: r.p.count, oracle: r.oracle.max, best: r.p.best,
          party: r.p.partyInBox, stats: r.p.stats });
      }
      return out;
    };
    const swOn  = await sweep(pOn);
    const swOff = await sweep(pOff);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const mOn  = mean(swOn.map((r) => r.count));
    const mOff = mean(swOff.map((r) => r.count));

    check('(2a) ★★★ 5 レイアウトすべてで、素の巻き込み数が **理論最大** に一致する '
      + '(⭐ 理論最大はドライバが敵の生座標だけから総当たりで出した独立値。'
      + '⛔ pickAoeOrigin の戻り値を母数にしていない = 循環しない)',
      swOn.every((r) => r.count === r.oracle) && swOn.length === 5,
      swOn.map((r) => r.n.split(' ')[0] + ':' + r.count + '/' + r.oracle).join('  '));

    check('(2b) ★★★ 同一盤面で **平均巻き込み数が増えた** (素 > 撤退 ?aoecover=0) '
      + '(⛔ 「拒否権を消した」ではなく「巻き込み数が増えた」で判定する = 依頼書 §1)',
      mOn > mOff,
      '素 平均 ' + mOn.toFixed(2) + ' ' + JSON.stringify(swOn.map((r) => r.count))
      + '  ‖  撤退 平均 ' + mOff.toFixed(2) + ' ' + JSON.stringify(swOff.map((r) => r.count))
      + '  ‖  理論最大 ' + JSON.stringify(swOn.map((r) => r.oracle)));

    /* 盤面 FAR: 射程外により多くの敵。⭐ 掃引が射程を無視すると届かない場所へ撃つ。 */
    const specF = { mage: MAGE, hero: 0, cleric: null,
      enemies: [G(NEAR), G(FAR[0]), G(FAR[1]), G(FAR[2])] };
    const fr = await pOn.evaluate((s) => {
      const b = window.__ap.board(s);
      const p = window.__ap.boxPick('fireball', 3, b.made[0]);
      return { b: b, p: p, oracle: window.__ap.oracle(3) };
    }, specF);
    check('(2c) ★★ 射程外へ撃たない: 選ばれた箱の中に **術者から射程内の敵が 1 体以上** いる '
      + '(⭐ 遠い方が敵 3 体で多いので、射程の検査を外すとそちらへ撃ってしまう)',
      fr.p.best !== null && fr.p.minCheb !== null && fr.p.minCheb <= fr.p.rangeTiles,
      '着弾 ' + JSON.stringify(fr.p.best) + ' / 箱の敵 ' + fr.p.count
      + ' / 最短距離 ' + fr.p.minCheb + ' (射程 ' + fr.p.rangeTiles + ')'
      + ' / 遠クラスタ ' + JSON.stringify(fr.b.foes.slice(1).map((f) => f.tx))
      + ' / 理論最大 ' + fr.oracle.max);

    /* ══ §3 単体呪文の非波及 (⭐ 最大の罠) ═════════════════════════════════ */
    const specT = { mage: MAGE, hero: 0, cleric: null,
      enemies: [G(NEAR), G(CL[0]), G(CL[1]), G(CL[2])] };
    const cl = await pOn.evaluate((s) => { const b = window.__ap.board(s);
      return { b: b, c: window.__ap.closest() }; }, specT);
    check('(3a) ★★ pickClosestEngagedEnemyFromAlly が返すのは **最寄りの敵** のまま '
      + '(⭐ 期待値はドライバが敵の生座標から独立に計算する。⛔ 15 呼び口が通る 1 本)',
      cl.c.prod === cl.c.expect && cl.c.expect >= 0,
      '本番 ' + cl.c.prod + ' / ドライバ独立計算 ' + cl.c.expect
      + ' / 敵 ' + JSON.stringify(cl.b.foes.map((f) => f.i + '@' + f.tx)));

    const mm = await pOn.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.aiSingle('magic-missile', 3); return { b: b, r: r }; }, specT);
    const mmNear = mm.b.made[0];
    check('(3b) ★★ マジック・ミサイル: 本番の mageAI を回して減った HP が **最寄りの敵だけ** '
      + '(= AoE の最多巻き込みが単体呪文へ波及していないことを挙動で確かめる)',
      mm.r.hpDelta[mmNear] > 0 && mm.b.made.slice(1).every((i) => mm.r.hpDelta[i] === 0),
      '最寄り idx=' + mmNear + ' 被弾 ' + mm.r.hpDelta[mmNear]
      + ' / 群れ ' + JSON.stringify(mm.b.made.slice(1).map((i) => i + ':' + mm.r.hpDelta[i]))
      + ' / ran=' + mm.r.ran + (mm.r.err ? ' err=' + mm.r.err : ''));

    const fb = await pOn.evaluate(async (s) => { const b = window.__ap.board(s);
      const r = await window.__ap.aiSingle('fire-bolt', 6); return { b: b, r: r }; }, specT);
    const fbNear = fb.b.made[0];
    check('(3c) ★ ファイアボルト: 同じく被弾は最寄りの敵だけ '
      + '(⚠ 命中ロールがあるので 6 手番回し「最寄りが 1 度以上減る & 他は 0」で見る)',
      fb.r.hpDelta[fbNear] > 0 && fb.b.made.slice(1).every((i) => fb.r.hpDelta[i] === 0),
      '最寄り idx=' + fbNear + ' 被弾 ' + fb.r.hpDelta[fbNear]
      + ' / 群れ ' + JSON.stringify(fb.b.made.slice(1).map((i) => i + ':' + fb.r.hpDelta[i]))
      + ' / ran=' + fb.r.ran + (fb.r.err ? ' err=' + fb.r.err : ''));

    /* ══ §4 スリープの狙点 ═════════════════════════════════════════════════ */
    const specSl = { mage: MAGE, hero: 0, cleric: null,
      enemies: [G(NEAR), G(CL[0]), G(CL[1])] };
    const sleepRun = async (page) => page.evaluate(async (s) => {
      const b = window.__ap.board(s);
      const r = await window.__ap.cast('allySleep', b.made[0]);
      const fx = (r.fx || []).filter((f) => f.kind === 'sleep')[0] || null;
      return { b: b, r: r, fx: fx, oracle: window.__ap.oracle(2),
        inBox: fx ? window.__ap.countIn(fx.tx, fx.ty, 2, 2) : null };
    }, specSl);
    const slOn  = await sleepRun(pOn);
    const slOff = await sleepRun(pOff);
    check('(4a) ★★ スリープが **多い方の群れ** へ落ちる (2x2 の理論最大に一致) '
      + '(⭐ 母数はドライバが敵の生座標から独立に数えた値。吹き出しの「範囲 N体」とも突き合わせる)',
      slOn.inBox === slOn.oracle.max && slOn.oracle.max >= 2
      && areaFromPops(slOn.r.pops) === slOn.oracle.max,
      '素 着弾 ' + JSON.stringify(slOn.fx) + ' 箱の敵 ' + slOn.inBox
      + ' / 理論最大 ' + slOn.oracle.max + ' / 吹き出し 範囲' + areaFromPops(slOn.r.pops) + '体'
      + ' / 敵 ' + JSON.stringify(slOn.b.foes.map((f) => f.tx)));
    check('(4b) ★ 撤退 ?aoecover=0 では従来どおり「最寄りの敵まわりの 4 通り」に留まる '
      + '(= 素で本当に狙点が広がったことの対照)',
      slOff.inBox !== null && slOff.inBox < slOn.inBox,
      '撤退 着弾 ' + JSON.stringify(slOff.fx) + ' 箱の敵 ' + slOff.inBox
      + ' / 吹き出し 範囲' + areaFromPops(slOff.r.pops) + '体  ‖  素 ' + slOn.inBox);

    /* ══ §6 「(味方 N 名は無傷)」 ═════════════════════════════════════════ */
    check('(6a) ★ 箱型の吹き出しに逐語 `<br>(味方 N 名は無傷)` が出る '
      + '(⭐ N は実際に範囲へ入った人数。⛔ 光り物や新しい DOM は 1 枚も足していない)',
      popsWithTag(vOn.r.pops).length >= 1
      && (vOn.r.pops.map((p) => (p.html.match(TAG_RE) || [])[1]).filter(Boolean)[0] === '1'),
      JSON.stringify(vOn.r.pops.map((p) => p.text)).slice(0, 300));
    check('(6b) ★ 直線と splash の吹き出しにも同じ 1 行が出る (依頼書 §6-2 の 8 箇所のうち 2 系統)',
      popsWithTag(lOn.r.pops).length >= 1 && popsWithTag(sOn.r.pops).length >= 1,
      '直線 ' + JSON.stringify(lOn.r.pops.map((p) => p.text)).slice(0, 160)
      + '  ‖  splash ' + JSON.stringify(sOn.r.pops.map((p) => p.text)).slice(0, 160));
    check('(6c) ★ 撤退 ?aoecover=0 では 1 枚も出ない (味方は範囲に入らないので言い添える必要が無い)',
      popsWithTag(vOff.r.pops).length === 0 && popsWithTag(lOff.r.pops).length === 0
      && popsWithTag(sOff.r.pops).length === 0,
      '箱 ' + popsWithTag(vOff.r.pops).length + ' / 直線 ' + popsWithTag(lOff.r.pops).length
      + ' / splash ' + popsWithTag(sOff.r.pops).length);

    /* ══ §5 hold-person ═══════════════════════════════════════════════════ */
    /* ⚠ ?actionpri=0 で「行動の優先度」の先出しを止め、梯子そのものを測る腕にする
       (⭐ #54 の「交絡の実験的統制」。既存の撤退スイッチをそのまま使う)。 */
    const pCl    = await openIndex(browser, '?actionpri=0');
    await pCl.evaluate(installProbe);
    const pClOff = await openIndex(browser, '?actionpri=0&holdslots=0');
    await pClOff.evaluate(installProbe);
    const pTv    = await openTavern(browser, '');

    const s3   = await pCl.evaluate(() => window.__ap.clericSlots(3));
    const s7   = await pCl.evaluate(() => window.__ap.clericSlots(7));
    const mIx  = await pCl.evaluate(() => window.__ap.mirrors());
    const mTv  = await pTv.evaluate(tavernMirrors);
    const s3R  = await pClOff.evaluate(() => window.__ap.clericSlots(3));
    const s7R  = await pClOff.evaluate(() => window.__ap.clericSlots(7));
    const mIxR = await pClOff.evaluate(() => window.__ap.mirrors());

    check('(5a) ★★ Lv3 の僧侶の equippedSkills に hold-person が入り、枠が 1 枚ある '
      + '(= turn-undead と同じ Lv3 解禁。⚠ 撤退 ?holdslots=0 では入らないこと)',
      s3.eq.indexOf('hold-person') >= 0 && (s3.max['hold-person'] || 0) === 1
      && s3R.eq.indexOf('hold-person') < 0,
      'Lv3 素 eq=' + JSON.stringify(s3.eq) + ' max=' + (s3.max['hold-person'] || 0)
      + '  ‖  撤退 eq=' + JSON.stringify(s3R.eq));

    check('(5b) ★★ Lv7 で 2 枚。かつ表が turn-undead と **1 文字も違わない** '
      + '(⭐ 根拠が「同じ Lv3 帯の妨害呪文と同格」の一言で済む形。⚠ 撤退では 1 枚)',
      (s7.max['hold-person'] || 0) === 2
      && JSON.stringify(mIx.slots) === JSON.stringify(mIx.turn)
      && (s7R.max['hold-person'] || 0) === 1,
      'Lv7 素 ' + (s7.max['hold-person'] || 0) + ' 枚 / 表 ' + JSON.stringify(mIx.slots)
      + ' vs turn-undead ' + JSON.stringify(mIx.turn)
      + '  ‖  撤退 ' + (s7R.max['hold-person'] || 0) + ' 枚 ' + JSON.stringify(mIxR.slots));

    /* 混在の盤面: 生者 (オーク) + アンデッド (スケルトン)。⭐ 全員満タンで回復の枝は成立しない。 */
    const specMix = { mage: null, cleric: 1, hero: 0,
      enemies: [{ off: 3, type: 'orc' }, { off: 4, type: 'skeleton' }] };
    const specUnd = { mage: null, cleric: 1, hero: 0,
      enemies: [{ off: 3, type: 'skeleton' }, { off: 4, type: 'skeleton' }] };
    const turnRun = async (page, spec) => page.evaluate(async (s) => {
      const b = window.__ap.board(s);
      const t = await window.__ap.clericTurn();
      return { b: b, t: t };
    }, spec);
    const mix  = await turnRun(pCl, specMix);
    const und  = await turnRun(pCl, specUnd);
    const mixR = await turnRun(pClOff, specMix);

    check('(5c) ★★★ 非アンデッドが居る戦いでは hold-person が turn-undead より **先** に出る '
      + '(⭐ 判定は「どのスロットが減ったか」。⛔ held で見ると抵抗 RESIST で揺れる)',
      mix.t.pick >= 0 && mix.t.used['hold-person'] === 1 && !mix.t.used['turn-undead'],
      '対象 idx=' + mix.t.pick + ' / 消費 ' + JSON.stringify(mix.t.used)
      + ' / 盤面 ' + JSON.stringify(mix.b.foes.map((f) => f.type + '@' + f.tx))
      + (mix.t.err ? ' / err=' + mix.t.err : ''));

    check('(5d) ★★★ アンデッドだけの盤面では pickHoldPersonTarget が -1 で落ち、turn-undead が撃たれる '
      + '(⭐ 依頼書 §2-9 の「構造で安全」の機械化。⛔ 確率ゲートは 1 つも足していない)',
      und.t.pick === -1 && und.t.used['turn-undead'] === 1 && !und.t.used['hold-person'],
      '対象 idx=' + und.t.pick + ' / 消費 ' + JSON.stringify(und.t.used)
      + ' / 盤面 ' + JSON.stringify(und.b.foes.map((f) => f.type + '@' + f.tx))
      + (und.t.err ? ' / err=' + und.t.err : ''));

    check('(5e) ★★★ index.html と tavern.html の CLERIC_SLOTS_TABLE の hold-person 行が完全一致 '
      + '(⚠ 二重定義。片方だけ直すと酒場の表示と戦闘の枚数が食い違う)',
      Array.isArray(mIx.slots) && Array.isArray(mTv.slots)
      && JSON.stringify(mIx.slots) === JSON.stringify(mTv.slots)
      && JSON.stringify(mIx.turn) === JSON.stringify(mTv.turn),
      'index ' + JSON.stringify(mIx.slots) + ' / tavern ' + JSON.stringify(mTv.slots)
      + '  ‖  turn-undead index ' + JSON.stringify(mIx.turn) + ' / tavern ' + JSON.stringify(mTv.turn));

    check('(5f) ★ levelReq の鏡が 2 ファイルとも 3 '
      + '(index の CLERIC_SKILLS が原本 / tavern の CLERIC_SKILLS_UI が鏡。⭐ 依頼書が数え落としていた 4 枚目)',
      mIx.levelReq === 3 && mTv.levelReq === 3 && mIxR.levelReq === 5,
      'index ' + mIx.levelReq + ' / tavern ' + mTv.levelReq + ' / 撤退の index ' + mIxR.levelReq);

    check('(5g) ★ 撤退 ?holdslots=0 で梯子が #57 着地時 (turn-undead の後ろ) へ戻る',
      mixR.t.used['turn-undead'] === 1 && !mixR.t.used['hold-person'],
      '撤退の消費 ' + JSON.stringify(mixR.t.used) + ' / 対象 idx=' + mixR.t.pick
      + (mixR.t.err ? ' / err=' + mixR.t.err : ''));

    check('(7a) ページエラー / console error が 0 件 (favicon の 404 は除外済み)',
      pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');

  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    try { await browser.close(); } catch (e2) {}
    try { server.close(); } catch (e2) {}
    process.exit(2);
  }

  await browser.close();
  server.close();

  /* ══ 集計 ══════════════════════════════════════════════════════════════ */
  const passed   = results.filter((r) => r.ok).length;
  const pendingN = results.filter((r) => r.pending).length;
  const failed   = results.filter((r) => !r.ok && !r.pending).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   PENDING ' + pendingN);
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok && !r.pending).forEach((r) => console.log('    ' + r.name + '  -- ' + r.detail));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = NEG_EXPECT[tag] || [];
    const red = new Set(results.filter((r) => !r.ok && !r.pending)
      .map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]));
    const miss = want.filter((w) => !red.has(w));
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',')
      + ' / 実際に赤くなった=' + Array.from(red).join(','));
    if (miss.length) {
      console.error('[driver] ✗ ' + tag + ' の担当ラベルが赤くなりませんでした (空振り): ' + miss.join(','));
      process.exit(1);
    }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
