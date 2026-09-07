#!/usr/bin/env node
/*
 * verify_hold_person.js — 実装依頼書 #57
 *   「僧侶にホールド・パーソン + 酒場の卓の 4 人の頭上に職業と名前」
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_hold_person.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_hold_person.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_hold_person.js --negative --only nohold
 *
 * ── 測っているもの ─────────────────────────────────────────────────────────
 *   §0 装置 (母集団を先に確かめる)
 *   §1 頭上札 (テキスト / pointer-events / z-index / 親子 / 対象の絞り / 🤝)
 *   §2 held と stunned の同時性
 *   §3 対象の絞り (アンデッド / ボス / 生者)
 *   §4 金の輪 (held の敵にだけ / 添字並列に入っていない / 上限 / リセット)
 *   §5 恒等 (helpless 15 箇所 / executeSkillOn のシグネチャ / 撤退スイッチ)
 *   §6 負のコントロール (--negative)
 *
 * ── ⛔ 測らないこと (依頼書 §12。実装窓が善意で縛りにいかないよう明記する) ──
 *   ・輪の色 / 太さ / 脈動の速さ / 光量 (--holdGlow は実機を見てから動かす)
 *   ・札の font-size と top のピクセル値
 *     ⭐ 縛るのは z-index < 4 / pointer-events: none / .npcUnit の子 の 3 条件だけ
 *   ・ホールドパーソンの発射率 (clericAI の梯子の位置は実機体感で動かす)
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────────
 *  - ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない)。
 *  - ⚠ ポートは **10101**。⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する
 *    (#56 の実測)。負のコントロールの子プロセスは 10102〜。
 *  - ⚠ 変異は **2 ファイルにまたがる**ので mutate() に file を持たせる。
 *    `u === '/index.html'` 決め打ちにすると、酒場側の変異が黙って空振りする。
 *  - ⚠ index.html / tavern.html はディスク上 **CRLF**。複数行アンカーは CRLF で書く。
 *  - ⚠ classic script 直下の let/const/function は window に載らない → **裸の識別子**で読む
 *    (allies / enemies / todaysPatrons / PM_CLASS_EMOJI / holdRings がそれ)。
 *  - ⚠ sleepMs の差し替えは必ず setTimeout(r, 0)。Promise.resolve() はマイクロタスク飢餓で
 *    CDP の evaluate が 180s ProtocolError で死ぬ (既出の恒久教訓)。
 *  - ⭐ 恒等 (§5) の基準は **着手前のコミット直書き** b1143ac。
 *    ⛔ HEAD を基準にすると、実装をコミットした瞬間に「自分自身との比較」= 永久緑になる。
 *  - ⚠ 配信バイトは起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §9 §6 の変異表 8 本。⚠⚠⚠ **1 本ずつ** `--only <tag>` で確定させる
 *   (同時に入れると互いを覆い隠す)。--only 無しの --negative は自分自身を 1 本ずつ
 *   子プロセスで呼び直す。
 *   ⚠ NEG_EXPECT は机上で書かない。1 本ずつ実走して**実際に赤くなったラベル**を書く。
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
/* ⚠⚠⚠ 10080 は Chrome の制限ポート (net::ERR_UNSAFE_PORT)。10101 は #56 の帯 (10081 + 変異)
   より上で、リポジトリ全体の port 台帳とも衝突しない (着手前に実測)。 */
const PORT     = parseInt(arg('port', '10101'), 10);
/* ⛔ orc-fort を既定にしない (locked:true で #btnAccept が黙って return する)。 */
const SCENARIO = arg('scenario', 'goblin-mine');
/* ⭐ 恒等の基準は「着手前のコミット」への歴史的事実のピン留め。⛔ HEAD にしない。 */
const BASE_REV = arg('baserev', 'b1143ac');

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
    console.error('         ' + file + '  ' + anchor.slice(0, 160));
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
     ラベルを見てから書き換える。標的以外の巻き添えは列挙しない (母集団が消えただけの
     「偽の赤」で空振りを隠せてしまう)。 */
const NEG_EXPECT = {
  labelhit:   ['(1b)'],
  labelz:     ['(1c)'],
  labelsib:   ['(1d)'],
  nohold:     ['(2a)'],
  ringground: ['(4a)'],
  ringarray:  ['(4b)'],
  noimmune:   ['(3a)'],
  nocap:      ['(4c)'],
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
  /* ── 酒場側 (頭上札) ──────────────────────────────────────────────────── */
  /* labelhit: 札がタップを食う板になる (#41 の実例の再演)。 */
  mutate('/tavern.html', 'labelhit (札の pointer-events を auto にする)',
    '      pointer-events: none;       /* [#57] 3 条件の (3)。#41 の「NPC がタップを食う板」の再発防止 */',
    '      pointer-events: auto;   /* labelhit */');
  /* labelz: 席札 (z-index 4) を奪う高さへ上げる。 */
  mutate('/tavern.html', 'labelz (札の z-index を 5 にする = 席札 4 を奪う)',
    '      z-index: 3;                 /* [#57] 3 条件の (2)。4 以上にしない (席札が 4) */',
    '      z-index: 5;   /* labelz */');
  /* labelsib: .npcUnit の子ではなく兄弟にする = 親の矩形の外へ出る。 */
  mutate('/tavern.html', 'labelsib (札を .npcUnit の兄弟にして親の外へ出す)',
    '          el.appendChild(lb);',
    '          lb.style.left = "0px"; lb.style.top = "0px"; layer.appendChild(lb);   /* labelsib */');

  /* ── index 側 (ホールド・パーソン) ────────────────────────────────────── */
  /* nohold: stunned だけ立てて held の印を落とす = スリープと見分けが付かなくなる。 */
  mutate('/index.html', 'nohold (applyStatus(t,"held",…) を落とす。stunned だけ立てる)',
    '        applyStatus(t, "held", skill.holdTurns);',
    '        void 0;   /* nohold: held の印を立てない */');
  /* ringground: 依頼書 §2-7 の罠 A そのもの。z-index 1 = 敵の下に潜る。 */
  mutate('/index.html', 'ringground (輪を spawnGroundFx で出す = z-index 1 で敵の下に潜る)',
    '        spawnHoldRing(t);',
    '        spawnGroundFx(Math.floor((t.x + t.def.displaySize / 2) / TILE_SIZE), Math.floor((t.y + t.def.displaySize / 2) / TILE_SIZE), 1, 1, "sleep", 5000);   /* ringground */');
  /* ringarray: 依頼書 §2-7 の罠 B。敵 DOM の添字並列配列に 12 本目を足す。 */
  mutate('/index.html', 'ringarray (輪の DOM を敵の添字並列配列へ足す = #44/#46 が 2 回踏んだ罠)',
    '        enemyBadgeElements.push(null);   // ⚠⚠⚠ 添字並列を崩さない (#46)',
    '        enemyBadgeElements.push(null);' + CRLF
    + '        window.__ringElements = window.__ringElements || [];' + CRLF
    + '        window.__ringElements.push(null);   /* ringarray */');
  /* noimmune: アンデッド/ボスの除外を落とす。
     ⭐ 述語が holdPersonImmune 1 本に畳まれているので、ここを潰すと
       「撃つ側」「選ぶ側」「無駄打ち判定」の 3 経路が同時に無防備になる = 罠の再現として強い。 */
  mutate('/index.html', 'noimmune (アンデッド/ボスの除外を落とす)',
    '      return !t || isUndeadEnemy(t) || !!(t.def && (t.def.isBoss || t.def.boss));',
    '      return false;   /* noimmune: 除外を落とした */');
  /* nocap: 同時本数の上限を外す (iOS 負荷の歯止めが消える)。 */
  mutate('/index.html', 'nocap (HOLD_RING_MAX の上限を外す)',
    '    const HOLD_RING_MAX = 4;',
    '    const HOLD_RING_MAX = 9999;   /* nocap */');
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
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)
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
function pending(name, why) {
  results.push({ name, ok: false, pending: true, detail: why || '' });
  console.log('  --  ' + name + '   [PENDING] ' + (why || ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * 酒場 (§0 / §1)
 * ══════════════════════════════════════════════════════════════════════════ */
async function openTavern(browser, qs) {
  const page = await browser.newPage();
  const tag = 'tavern' + (qs || '');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけに絞る
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const base = 'http://localhost:' + PORT + '/tavern.html';
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    try {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
    } catch (e) {}
  });
  await page.goto(base + (qs || ''), { waitUntil: 'networkidle2', timeout: 40000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
  await sleep(700);
  return page;
}

/* 席 → 札の実測。⭐ 期待値は **PM_CLASS_EMOJI と todaysPatrons の実体**から引く
   (⛔ ドライバに職業アイコンの表を写経しない)。 */
function readSeats() {
  const out = { seats: {}, labelTotal: 0, nonSeatLabels: [], seatKeys: [], unitRects: {}, err: [] };
  try {
    out.labelTotal = document.querySelectorAll('.patronLabel').length;
    /* ⚠⚠ 酒場ステージは CSS で**縮尺される**ので、getBoundingClientRect は 96 を返さない
       (実測 79)。⛔ 「96x96」を期待値にしない = 元から成り立っていないものを期待値にする罠。
       ⭐ 全 .npcUnit の矩形を採っておき、「札の有無で 1px も変わらない」を **同一縮尺の中で**
         突き合わせる (縮尺非依存 / 独立源)。 */
    Array.prototype.slice.call(document.querySelectorAll('.npcUnit')).forEach(function (u) {
      const r = u.getBoundingClientRect();
      out.unitRects[u.getAttribute('data-npc')] =
        { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
          labeled: !!u.querySelector('.patronLabel') };
    });
    const seatKeys = (typeof todaysPatrons === 'object' && todaysPatrons) ? Object.keys(todaysPatrons) : [];
    out.seatKeys = seatKeys;
    Array.prototype.slice.call(document.querySelectorAll('.patronLabel')).forEach(function (lb) {
      const key = lb.getAttribute('data-patron');
      if (seatKeys.indexOf(key) < 0) out.nonSeatLabels.push(String(key));
    });
    for (const k of seatKeys) {
      const m = todaysPatrons[k];
      const unit = document.querySelector('.npcUnit[data-npc="' + k + '"]');
      const lb = unit ? unit.querySelector('.patronLabel')
                      : document.querySelector('.patronLabel[data-patron="' + k + '"]');
      const ur = unit ? unit.getBoundingClientRect() : null;
      const cs = lb ? getComputedStyle(lb) : null;
      out.seats[k] = {
        classKey: m ? m.classKey : null,
        name: m ? m.name : null,
        emoji: (m && typeof PM_CLASS_EMOJI === 'object') ? (PM_CLASS_EMOJI[m.classKey] || null) : null,
        classLabel: (m && typeof recruitClassLabel === 'function') ? recruitClassLabel(m.classKey) : null,
        hasUnit: !!unit,
        hasLabel: !!lb,
        isChildOfUnit: !!(lb && unit && lb.parentElement === unit),
        text: lb ? lb.textContent : null,
        title: lb ? lb.getAttribute('title') : null,
        z: cs ? cs.zIndex : null,
        pointerEvents: cs ? cs.pointerEvents : null,
        unitW: ur ? Math.round(ur.width) : null,
        unitH: ur ? Math.round(ur.height) : null,
      };
    }
  } catch (e) { out.err.push(String((e && e.message) || e)); }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * index (§0c / §2 / §3 / §4)
 * ══════════════════════════════════════════════════════════════════════════ */
/* ⭐ 3 点セット (#50 の実測)。どれか 1 つ欠けると僧侶が来ない run が混ざる。
   ⚠ xp 45000 = Lv10 (累積 XP = 500×Lv×(Lv-1))。hold-person の枠は Lv8-10 で 2 個。 */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
  { classKey: 'rogue',   isHero: false, zone: 'front', name: 'ロズ', trait: null, line: null },
];

async function openIndex(browser, qs) {
  const page = await browser.newPage();
  const tag = 'index' + (qs || '');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
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
    + " && typeof enemies !== 'undefined' && typeof applyStatus === 'function'"
    + " && typeof createEnemy === 'function' && !!mapData",
    { timeout: 45000 });
  return page;
}

/* 盤面の据え付け。⭐ 演出だけを黙らせ、判定ロジックは本番のまま呼ぶ。 */
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
  /* ⭐ 演出だけを黙らせる。dfPlayCast は「詠唱窓を await するだけ」の提示レイヤなので、
     即解決にしても判定 (命中ロール / 状態の付与 / 輪の生成) は 1 行も変わらない。
     ⛔ allyHoldPerson 自体は差し替えない —— 測りたいのはそれ。
     ⚠ 素のままだと 1 発 2.5 秒。上限 (4c) は何十発も撃つので、これが無いと分単位で伸びる。
     ⭐ 呼ばれた回数を数えておき、「詠唱経路を本当に通ったか」を装置 assert で押さえる。 */
  window.__hpCastCalls = 0;
  window.dfPlayCast = function () { window.__hpCastCalls++; return Promise.resolve(); };

  const TILE = TILE_SIZE;
  const setUnit = (u, tx, ty) => {
    const s = (u.def && u.def.displaySize) || 96;
    u.x = tx * TILE + TILE / 2 - s / 2;
    u.y = ty * TILE + TILE / 2 - s / 2;
  };
  /* 横に連続した床が 10 マス以上ある行を選ぶ (⛔ 絶対タイル座標を直書きしない =
     幾何が動いた日に「岩盤化」して母集団が黙って消える)。 */
  let lane = null;
  for (let ty = 1; ty < MAP_H - 1 && !lane; ty++) {
    let run = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) { run++; if (run >= 10) { lane = { ty: ty, tx0: tx - run + 1 }; break; } }
      else run = 0;
    }
  }

  window.__hpProbe = {
    info: function () {
      return {
        lane: lane,
        allies: allies.map((a) => ({ cls: a.classKey, alive: a.alive,
          eq: (a.equippedSkills || []).slice(), slots: Object.assign({}, a.spellSlots || {}) })),
        hasSpell: typeof CLERIC_SKILLS === 'object' && !!CLERIC_SKILLS['hold-person'],
        spellDef: (typeof CLERIC_SKILLS === 'object' && CLERIC_SKILLS['hold-person'])
          ? { range: CLERIC_SKILLS['hold-person'].range, holdTurns: CLERIC_SKILLS['hold-person'].holdTurns,
              target: CLERIC_SKILLS['hold-person'].target } : null,
        rangeTiles: (typeof getRange === 'function' && typeof CLERIC_SKILLS === 'object'
          && CLERIC_SKILLS['hold-person']) ? getRange(CLERIC_SKILLS['hold-person'].range).tiles : null,
        statusHeld: (typeof STATUS_EFFECT_DEFS === 'object') ? !!STATUS_EFFECT_DEFS.held : false,
        statusFirstKey: (typeof STATUS_EFFECT_DEFS === 'object') ? Object.keys(STATUS_EFFECT_DEFS)[0] : null,
        ringMax: (typeof HOLD_RING_MAX !== 'undefined') ? HOLD_RING_MAX : null,
        hasCast: typeof allyHoldPerson === 'function',
      };
    },
    /* 僧侶を lane の左端へ、指定した型の敵をその右隣へ並べて撃つ。
       ⭐ 判定は 1 行も再実装しない。本番の allyHoldPerson をそのまま呼ぶ。 */
    cast: async function (typeKey, opts) {
      opts = opts || {};
      const cleric = allies.find((a) => a.classKey === 'cleric');
      if (!cleric || !lane) return { err: 'cleric/lane なし', hasCleric: !!cleric, lane: lane };
      if (typeof allyHoldPerson !== 'function') return { err: 'allyHoldPerson が無い' };
      cleric.alive = true;
      /* 枠は本番の関数で開ける (Lv10 = 2 枠)。⛔ spellSlots を手で書かない。 */
      if (typeof initAllySpellSlots === 'function') initAllySpellSlots(cleric, 'cleric', 10, null);
      setUnit(cleric, lane.tx0, lane.ty);
      /* 他の味方は遠くへ退ける (交戦や巻き添えの交絡を消す)。 */
      for (const a of allies) if (a !== cleric) { a.x = -999999; a.y = -999999; }
      /* 敵を新規に立てる。⚠ push の**直後に 1 回だけ** createEnemyDom (添字並列)。 */
      const made = [];
      const n = opts.count || 1;
      for (let i = 0; i < n; i++) {
        const idx = enemies.length;
        const e = createEnemy(typeKey, lane.tx0 + 2 + i, lane.ty);
        enemies.push(e);
        createEnemyDom(idx, e.def, e.type);
        e.alive = true;
        e.maxHp = Math.max(e.maxHp || 0, 400); e.hp = e.maxHp;   // ⚠ 浄化 (低HP) の枝へ落ちないよう盛る
        made.push(idx);
      }
      const before = made.map((i) => ({ stunned: enemies[i].stunned || 0, held: hasStatus(enemies[i], 'held') }));
      /* ⚠⚠ 抵抗 (RESIST) があるので 1 発 = 1 金縛りではない。⭐ #50 の教訓 =
         「母集団ガードは、後続 assert の**敷居を満たす差**が出るところまで縛る」。
         ⛔ (4c) の敷居 (held 5 体以上) を下げるのではなく、**命中するまで撃ち直す**。
         ⚠ 免疫の相手 (アンデッド / ボス) では永久に held にならないので tries は既定 1。 */
      const tries = Math.max(1, opts.tries || 1);
      let shots = 0;
      for (const i of made) {
        for (let k = 0; k < tries; k++) {
          try { await allyHoldPerson(cleric, i); shots++; }
          catch (e) { return { err: 'cast 例外: ' + String((e && e.message) || e), made: made }; }
          /* 続けて撃てるよう枠だけ戻す (⛔ 効果の判定には触らない)。 */
          if (typeof initAllySpellSlots === 'function') initAllySpellSlots(cleric, 'cleric', 10, null);
          if (hasStatus(enemies[i], 'held')) break;
        }
      }
      return {
        made: made,
        before: before,
        shots: shots,
        castCalls: window.__hpCastCalls,
        after: made.map((i) => ({ stunned: enemies[i].stunned || 0, held: hasStatus(enemies[i], 'held'),
          alive: enemies[i].alive, name: enemies[i].def.name })),
        rings: window.__hpProbe.rings(),
      };
    },
    /* ★ 本番の AI の梯子を実際に通す。⭐ 盤面は「**他の枝が成立しない**」ように作る
       (全員満タン = 回復の枝が消える / アンデッド不在 = ターンアンデッドの枝が消える)
       ので、梯子の**順番**には依存しない = 依頼書 §12「梯子の位置は測らない」を破らない。
       ⛔ clericAI の条件を 1 行も写経しない。本番の clericAI をそのまま呼ぶ。
       ⚠ これが無いと「枠には入っているが AI が一度も撃たない」= #50 と同じ
         『配線は正しいのに実プレイでは死んでいる』欠陥を 1 assert も捕まえられない。 */
    aiCast: async function () {
      const cleric = allies.find((a) => a.classKey === 'cleric');
      if (!cleric || !lane) return { err: 'cleric/lane なし' };
      if (typeof clericAI !== 'function') return { err: 'clericAI が無い' };
      cleric.alive = true;
      if (typeof initAllySpellSlots === 'function') initAllySpellSlots(cleric, 'cleric', 10, null);
      setUnit(cleric, lane.tx0, lane.ty);
      /* 味方を全員満タンにして回復の枝を消す (⛔ clericAI の閾値を写経しない = 満タンなら
         どんな閾値でも回復は成立しない、という形にする)。 */
      try { hp = maxHp; } catch (e) {}
      for (const a of allies) { a.hp = a.maxHp; if (a !== cleric) { a.x = -999999; a.y = -999999; } }
      const idx = enemies.length;
      const e = createEnemy('orc', lane.tx0 + 2, lane.ty);
      enemies.push(e); createEnemyDom(idx, e.def, e.type);
      e.alive = true; e.maxHp = 400; e.hp = 400;
      const before = { stunned: e.stunned || 0, held: hasStatus(e, 'held'),
        slot: (cleric.spellSlots || {})['hold-person'] };
      let ran = 0;
      for (let k = 0; k < 8 && !hasStatus(e, 'held'); k++) {
        try { await clericAI(cleric); ran++; }
        catch (err) { return { err: 'clericAI 例外: ' + String((err && err.message) || err), ran: ran }; }
        if (typeof initAllySpellSlots === 'function') initAllySpellSlots(cleric, 'cleric', 10, null);
      }
      return { idx: idx, ran: ran, before: before,
        after: { stunned: e.stunned || 0, held: hasStatus(e, 'held') },
        rings: window.__hpProbe.rings().regLen };
    },
    /* 眠り (sleep) の敵を 1 体作る = (2b) の対照。
       ⛔ 編成に魔法使いが居ないので、スリープの **効果側だけ** を本番と同じ形で立てる
         (allySleep の呪文枠 / 2x2 選定は (2b) の主張と無関係)。 */
    makeSleeper: function () {
      if (!lane) return { err: 'lane なし' };
      const idx = enemies.length;
      const e = createEnemy('orc', lane.tx0 + 8, lane.ty);
      enemies.push(e); createEnemyDom(idx, e.def, e.type);
      e.alive = true;
      e.stunned = Math.max(e.stunned || 0, 2);
      return { idx: idx, stunned: e.stunned, held: hasStatus(e, 'held') };
    },
    /* 輪のレジストリを覗く。⭐ 裸の識別子で読む (classic script 直下の const)。 */
    rings: function () {
      let reg = null;
      try { reg = holdRings; } catch (e) { reg = null; }
      const dom = document.querySelectorAll('.hrFx').length;
      const owners = [];
      if (Array.isArray(reg)) {
        for (const r of reg) {
          const i = enemies.indexOf(r.unit);
          owners.push({ idx: i, held: (i >= 0) ? hasStatus(enemies[i], 'held') : null,
            alive: (i >= 0) ? !!enemies[i].alive : null, parts: (r.els || []).length });
        }
      }
      return { regLen: Array.isArray(reg) ? reg.length : null, domCount: dom, owners: owners };
    },
    /* 敵ターンを n 回進めて (stunned, held) を毎回記録する。
       ⭐ stunned は敵オブジェクトから / held は computeDisplayList から読む
         (片方の写経にしないため = 依頼書 §9 (2a))。 */
    tickEnemy: async function (idx, n) {
      const rec = [];
      for (let k = 0; k < n; k++) {
        try { await enemyAttackTurn(idx); }
        catch (e) { rec.push({ turn: k + 1, err: String((e && e.message) || e) }); break; }
        const e = enemies[idx];
        const disp = (typeof computeDisplayList === 'function') ? computeDisplayList(e).map((s) => s.id) : [];
        rec.push({ turn: k + 1, stunned: e.stunned || 0, heldDisp: disp.indexOf('held') >= 0,
          heldArr: hasStatus(e, 'held'), rings: window.__hpProbe.rings().regLen });
      }
      return rec;
    },
    /* 潜行のやり直し (レジストリのリセット)。 */
    resetRun: function () {
      let before = null;
      try { before = holdRings.length; } catch (e) {}
      if (typeof clearNodeArrays === 'function') clearNodeArrays();
      let after = null, dom = document.querySelectorAll('.hrFx').length;
      try { after = holdRings.length; } catch (e) {}
      return { before: before, after: after, dom: dom, hasFn: typeof clearNodeArrays === 'function' };
    },
  };
  return window.__hpProbe.info();
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_holdperson_');
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
    /* ══ §0 装置 + §1 頭上札 (酒場) ═══════════════════════════════════════ */
    const tv      = await openTavern(browser, '');
    const S       = await tv.evaluate(readSeats);
    const tvOff   = await openTavern(browser, '?patronlabel=0');
    const SOff    = await tvOff.evaluate(readSeats);
    const tvNoTk  = await openTavern(browser, '?recruittalk=0');
    const SNoTk   = await tvNoTk.evaluate(readSeats);

    const seatKeys = S.seatKeys || [];
    const seatArr  = seatKeys.map((k) => S.seats[k]);

    check('(0a) 酒場で .patronLabel が 4 枚測れている '
      + '(⭐ 0 枚だと §1 の全 assert が空振りで永久緑になる)',
      S.labelTotal === 4 && seatKeys.length === 4 && seatArr.every((s) => s && s.hasLabel),
      '.patronLabel ' + S.labelTotal + ' 枚 / todaysPatrons ' + seatKeys.length + ' 席 ('
      + seatKeys.join(',') + ') / 札あり ' + seatArr.filter((s) => s && s.hasLabel).length
      + (S.err && S.err.length ? ' / err=' + S.err.join(' ; ') : ''));

    const classKeys = seatArr.map((s) => s && s.classKey);
    const emojis    = seatArr.map((s) => s && s.emoji);
    check('(0b) [装置] 4 席の職業が相異なり、PM_CLASS_EMOJI から引いたアイコンも 4 種類そろっている '
      + '(⭐ 全席が同じ値だと「表を写経した実装」でも緑になる)',
      new Set(classKeys).size === 4 && new Set(emojis).size === 4 && emojis.every((e) => !!e),
      '職 ' + JSON.stringify(classKeys) + ' / アイコン ' + JSON.stringify(emojis));

    check('(1a) ★★ 4 席すべてで、札のテキストが **その席の** 職業アイコンと名前を含む '
      + '(⭐ 期待値は todaysPatrons と PM_CLASS_EMOJI の実体からドライバが独立に組む)',
      seatArr.length === 4 && seatArr.every((s) => s && s.text
        && s.emoji && s.text.indexOf(s.emoji) >= 0
        && s.name && s.text.indexOf(s.name) >= 0),
      seatKeys.map((k) => k + ':"' + (S.seats[k].text || '') + '" (期待 ' + S.seats[k].emoji
        + ' / ' + S.seats[k].name + ')').join('  //  '));

    check('(1a2) 札に **他の席の名前**が混ざっていない (席と札の対応が正しい)',
      seatArr.length === 4 && seatArr.every((s) => s && s.text
        && seatArr.every((o) => o === s || !o.name || s.text.indexOf(o.name) < 0)),
      seatKeys.map((k) => k + ':"' + (S.seats[k].text || '') + '"').join('  //  '));

    check('(1b) .patronLabel の pointer-events が none (実 CSS を getComputedStyle で読む)',
      seatArr.length === 4 && seatArr.every((s) => s && s.pointerEvents === 'none'),
      JSON.stringify(seatArr.map((s) => s && s.pointerEvents)));

    check('(1c) .patronLabel の z-index が 4 未満 '
      + '(⭐ 席札 .tavernSign が 4。依頼書 §2-8 の真の不変条件は矩形ではなくこれ)',
      seatArr.length === 4 && seatArr.every((s) => s && s.z !== 'auto' && Number(s.z) < 4),
      JSON.stringify(seatArr.map((s) => s && s.z)));

    /* (1d) ★★ 「札を足しても親の矩形が 1px も広がっていない」を **3 経路**で突き合わせる。
       ⚠⚠ 初版は「96x96 のまま」と書いたが、酒場ステージは CSS で縮尺されるので実測は 79x79 =
         **元から成り立っていない期待値**だった (2026-09-07 の実走で判明)。
       ⛔ 96 を 79 に書き換えるのは最悪手 (端末とビューポートで動くので次に必ず腐る)。
       ⭐ 測定点を移した: ①札は .npcUnit の子か ②同じ席の矩形が ?patronlabel=0 の腕と一致するか
         ③札のある .npcUnit と **札のない .npcUnit** の矩形が一致するか (独立源)。
         どれも縮尺に依存せず、しかも「広がっていない」という目的そのものを測っている。 */
    const rectPairs = seatKeys.map((k) => ({
      k: k, on: S.unitRects[k], off: SOff.unitRects[k],
    }));
    const unlabeled = Object.keys(S.unitRects).filter((k) => !S.unitRects[k].labeled)
      .map((k) => S.unitRects[k]);
    check('(1d) ★★ 札は .npcUnit の **子** であり、札を足しても .npcUnit の矩形が 1px も広がらない '
      + '(= verify_npc_crowd (1a) が測る矩形を動かしていないことの直接証拠。⭐ 3 経路で突き合わせる: '
      + '子である / ?patronlabel=0 の同じ席と一致 / 札の無い NPC とも一致)',
      seatArr.length === 4 && seatArr.every((s) => s && s.isChildOfUnit)
      && rectPairs.every((p) => p.on && p.off && p.on.w > 0 && p.on.w === p.off.w && p.on.h === p.off.h)
      && unlabeled.length > 0
      && rectPairs.every((p) => p.on.w === unlabeled[0].w && p.on.h === unlabeled[0].h),
      seatKeys.map((k) => k + ' 子=' + S.seats[k].isChildOfUnit).join(' / ')
      + '  ‖  素 ' + JSON.stringify(rectPairs.map((p) => p.on && (p.on.w + 'x' + p.on.h)))
      + ' / 撤退 ' + JSON.stringify(rectPairs.map((p) => p.off && (p.off.w + 'x' + p.off.h)))
      + ' / 札なし NPC ' + unlabeled.length + ' 体 ' + JSON.stringify(unlabeled.slice(0, 2)
        .map((u) => u.w + 'x' + u.h)));

    check('(1e) 卓の 4 人以外 (店主 / 酔漢 / 給仕 / 荷運び) に札が付いていない',
      S.nonSeatLabels.length === 0 && S.labelTotal === seatKeys.length,
      '席外の札 ' + JSON.stringify(S.nonSeatLabels) + ' / 総数 ' + S.labelTotal
      + ' (席 ' + seatKeys.length + ')');

    /* (1f) 約束の付け外し。⭐ 実座標のマウスで押す (el.click() は clientX/Y が 0 になり
       #tavernViewport が (0,0) を拾う = verify_npc_crowd の注記)。 */
    const seat0 = seatKeys[0];
    const pf = { box: null, opened: false, reopened: false, afterYes: null, afterCancel: null };
    if (seat0) {
      pf.box = await tv.evaluate((k) => {
        const e = document.querySelector('.npcUnit[data-npc="' + k + '"]');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }, seat0);
      const readLabel = (k) => tv.evaluate((kk) => {
        const lb = document.querySelector('.patronLabel[data-patron="' + kk + '"]');
        let promised = null;
        try { promised = !!(window.DFRecruits && todaysPatrons && DFRecruits.has(todaysPatrons[kk].name)); } catch (e) {}
        return { text: lb ? lb.textContent : null, promised: promised };
      }, k);
      const openDlg = async () => {
        if (!pf.box) return false;
        /* ⚠⚠⚠ **背景タブへの page.mouse.click は届かない。** このドライバは (1f) の前に
           ?patronlabel=0 / ?recruittalk=0 の別タブを開いているので、叩く直前に必ず前面へ出す。
           ⭐ 2026-09-07 の実走で opened=false になった真因がこれ (座標も要素も正しかった)。 */
        await tv.bringToFront();
        await tv.mouse.click(pf.box.x, pf.box.y);
        /* #54 は「押す → 卓まで歩く → 着いたら対話」なので、歩行のぶん待つ (最大 20 秒)。 */
        for (let i = 0; i < 80; i++) {
          await sleep(250);
          const vis = await tv.evaluate(() => {
            const d = document.getElementById('recruitDialog');
            return !!d && getComputedStyle(d).display !== 'none';
          });
          if (vis) return true;
        }
        /* ⛔ 黙って false を返さない。「なぜ開かなかったか」を必ず持ち帰る
           (座標が外れたのか / 別の要素が食ったのか / 歩いている途中なのか)。 */
        pf.diag = await tv.evaluate((b) => {
          const hit = document.elementFromPoint(b.x, b.y);
          return {
            hitTag: hit ? (hit.tagName + '.' + hit.className) : null,
            hitNpc: !!(hit && hit.closest && hit.closest('.npcUnit')),
            dialogExists: !!document.getElementById('recruitDialog'),
            patrons: (typeof todaysPatrons === 'object' && todaysPatrons) ? Object.keys(todaysPatrons) : null,
          };
        }, pf.box);
        return false;
      };
      pf.opened = await openDlg();
      if (pf.opened) {
        await tv.evaluate(() => { const b = document.getElementById('btnRecruitYes'); if (b) b.click(); });
        await sleep(400);
        pf.afterYes = await readLabel(seat0);
        pf.reopened = await openDlg();
        if (pf.reopened) {
          await tv.evaluate(() => { const b = document.getElementById('btnRecruitYes'); if (b) b.click(); });
          await sleep(400);
          pf.afterCancel = await readLabel(seat0);
        }
      }
    }
    if (!pf.opened || !pf.reopened) {
      check('(1f) 約束すると 🤝 が付き、取り消すと消える', false,
        '勧誘ダイアログを開けなかった (opened=' + pf.opened + ' / reopened=' + pf.reopened
        + ' / box=' + JSON.stringify(pf.box) + ' / diag=' + JSON.stringify(pf.diag || null) + ')');
    } else {
      const y = pf.afterYes || {}, c = pf.afterCancel || {};
      check('(1f) 約束すると 🤝 が付き、取り消すと消える '
        + '(⭐ 実体 DFRecruits.has と札の文字を **対** で見る = 片方だけの写経にしない)',
        y.promised === true && (y.text || '').indexOf('🤝') === 0
        && c.promised === false && (c.text || '').indexOf('🤝') < 0,
        '約束後 promised=' + y.promised + ' text="' + y.text + '"  //  取消後 promised='
        + c.promised + ' text="' + c.text + '"');
    }

    /* ── 撤退スイッチ (酒場側) ── */
    check('(5c-1) ?patronlabel=0 で .patronLabel が 1 枚も出ない。'
      + '⭐ 素のアームの対照を同じ assert に同居させる '
      + '(⛔ 撤退アームだけ見る assert は、実装が丸ごと壊れていても緑になる)',
      SOff.labelTotal === 0 && S.labelTotal === 4 && (SOff.seatKeys || []).length === 4,
      '素 ' + S.labelTotal + ' 枚 / 撤退 ' + SOff.labelTotal + ' 枚 (撤退でも todaysPatrons は '
      + (SOff.seatKeys || []).length + ' 席そろっている = 上流は生きている)');

    check('(5c-2) ?recruittalk=0 (#54 の撤退) では todaysPatrons が null なので札も自動的に 0 枚 '
      + '(⭐ 撤退の二重化ではなく「上流が消えれば下流も消える」正しい依存)',
      SNoTk.labelTotal === 0 && (SNoTk.seatKeys || []).length === 0,
      '札 ' + SNoTk.labelTotal + ' 枚 / 席 ' + (SNoTk.seatKeys || []).length);

    await tv.close(); await tvOff.close(); await tvNoTk.close();

    /* ══ §0c / §2 / §3 / §4 (index) ═══════════════════════════════════════ */
    const ix = await openIndex(browser, '');
    const info = await ix.evaluate(installProbe);

    check('(0c) ★ 本番の初期化経路で、僧侶の仲間が hold-person を枠に入れている '
      + '(= CLERIC_SKILLS / CLERIC_SLOTS_TABLE / DEFAULT_KNOWN の 3 点が噛み合っている証拠)',
      !!info.hasSpell && !!info.hasCast && !!(info.allies || []).find((a) => a.cls === 'cleric'
        && a.eq.indexOf('hold-person') >= 0 && (a.slots['hold-person'] || 0) > 0),
      '定義=' + info.hasSpell + ' 実装=' + info.hasCast + ' / ' + JSON.stringify(info.spellDef)
      + ' / 僧侶 ' + JSON.stringify((info.allies || []).filter((a) => a.cls === 'cleric')));

    check('(0c2) [装置] held が STATUS_EFFECT_DEFS に在り、かつ **先頭キーではない** '
      + '(⚠ tools/verify_walk_block.js:950 が Object.keys(STATUS_EFFECT_DEFS)[0] を読む)',
      info.statusHeld === true && info.statusFirstKey === 'prone',
      'held=' + info.statusHeld + ' / 先頭キー=' + info.statusFirstKey);

    check('(0c3) [装置] 射程が long (12 タイル) で、僧侶の他呪文 (medium=8) より長い',
      !!info.spellDef && info.spellDef.range === 'long' && info.rangeTiles === 12,
      'range=' + (info.spellDef && info.spellDef.range) + ' / tiles=' + info.rangeTiles
      + ' / lane=' + JSON.stringify(info.lane));

    /* ── (3c) 通常の生者 → 通る ── */
    /* ⚠⚠ tries: 8 は **フレーク潰し**であって敷居の緩和ではない。命中ロール (d20) があるので
       1 発では ~2〜3 割が RESIST に落ち、(3c)/(2a)/(3a) が「運で緑・運で赤」のコイン投げになる。
       ⭐ 2026-09-07 の --negative で labelsib と noimmune が実際にこれで巻き添えの赤 / 空振りを出した。
       ⭐ 免疫の相手 (アンデッド / ボス) では何回撃っても held にならないので、
         tries を上げても (3a)(3b) の主張は 1 ビットも弱まらない —— むしろ
         「免疫を外したら必ず掛かる」を決定論にするので **変異が確実に赤くなる**。 */
    const castOrc = await ix.evaluate(() => window.__hpProbe.cast('orc', { tries: 8 }));
    const gotHit = !!(castOrc.after && castOrc.after[0] && castOrc.after[0].stunned > 0);
    check('(3c) 通常の生者 (オーク) には通る = stunned と held が同時に立つ run が 1 件以上ある',
      gotHit && castOrc.after[0].held === true,
      JSON.stringify(castOrc.after) + ' (前 ' + JSON.stringify(castOrc.before) + ')'
      + (castOrc.err ? ' err=' + castOrc.err : ''));

    /* ── (2b) sleep との言い分け (先に作る = (4a) の対照を同じ盤面へ置く) ── */
    const sleeper = await ix.evaluate(() => window.__hpProbe.makeSleeper());
    check('(2b) 眠らせた敵 (sleep 相当) は stunned > 0 だが held は false '
      + '(⛔ これが無いとスリープと区別が付かず、眠っている敵にも金の輪が出る)',
      sleeper && sleeper.stunned > 0 && sleeper.held === false,
      JSON.stringify(sleeper));

    /* ── (4a) 輪は held の敵にだけ ── */
    const ringsNow = await ix.evaluate(() => window.__hpProbe.rings());
    check('(4a) ★★ 金の輪が **held の敵にだけ** 出ている (眠っている敵には出ない) / DOM が実在する',
      ringsNow.regLen > 0 && ringsNow.domCount > 0
      && ringsNow.owners.length === ringsNow.regLen
      && ringsNow.owners.every((o) => o.held === true),
      JSON.stringify(ringsNow) + '  (眠らせた敵 idx=' + (sleeper && sleeper.idx)
      + ' は held=' + (sleeper && sleeper.held) + ')');

    /* ── (2a) 同時性 ── */
    if (gotHit) {
      const idx = castOrc.made[0];
      const st0 = await ix.evaluate((i) => {
        const e = enemies[i];
        const disp = computeDisplayList(e).map((s) => s.id);
        return { stunned: e.stunned || 0, heldDisp: disp.indexOf('held') >= 0, heldArr: hasStatus(e, 'held') };
      }, idx);
      const t = await ix.evaluate((i) => window.__hpProbe.tickEnemy(i, 5), idx);
      const okStart = st0.stunned === 4 && st0.heldDisp === true && st0.heldArr === true;
      const okEnd = t.length === 5
        && t.slice(0, 4).every((r) => r.heldDisp === true)
        && t[4].stunned === 0 && t[4].heldDisp === false && t[4].heldArr === false;
      check('(2a) ★★ 命中直後に stunned===4 かつ held===true。4 ターン後に **両方が同時に** 消える '
        + '(⭐ stunned は敵オブジェクト / held は computeDisplayList から読む = 片方の写経にしない)',
        okStart && okEnd,
        '直後 ' + JSON.stringify(st0) + ' → ' + JSON.stringify(t));
    } else {
      check('(2a) ★★ 命中直後に stunned===4 かつ held===true。4 ターン後に両方が同時に消える',
        false, 'population: none — (3c) が命中しなかったので測れない');
    }

    /* ── (2c) 本番の AI が実際に撃つか ── */
    const aiCase = await ix.evaluate(() => window.__hpProbe.aiCast());
    check('(2c) ★★ 本番の AI (clericAI) が **実際にホールド・パーソンを撃つ** '
      + '(⭐ 他の枝が成立しない盤面 = 全員満タン / アンデッド不在 で通すので、梯子の**順番**には '
      + '依存しない。⛔ 発射「率」は測らない = 依頼書 §12。⚠ これが無いと「枠には入っているが '
      + 'AI が一度も撃たない」= #50 と同じ欠陥を 1 assert も捕まえられない)',
      !aiCase.err && aiCase.after && aiCase.after.held === true && aiCase.after.stunned === 4
      && aiCase.ran >= 1 && (aiCase.before || {}).held === false,
      JSON.stringify(aiCase));

    /* ── (4c) 上限 ── */
    const capCase  = await ix.evaluate(() => window.__hpProbe.cast('orc', { count: 8, tries: 8 }));
    const capRings = await ix.evaluate(() => window.__hpProbe.rings());
    const heldCount = (capCase.after || []).filter((a) => a.held).length;
    check('(4c) held の敵が 5 体以上いても、輪は HOLD_RING_MAX (4) 本以下 '
      + '(iOS 負荷の歯止めが効いている。⭐ 依頼書 §1 の弱点① への備え)',
      heldCount >= 5 && capRings.regLen <= 4 && info.ringMax === 4,
      'held ' + heldCount + ' 体 / 輪 ' + capRings.regLen + ' 本 (上限 ' + info.ringMax + ')'
      + ' / 発射 ' + capCase.shots + ' 回 / after=' + JSON.stringify(capCase.after));

    check('(0e) [装置] 詠唱の経路を本当に通っている (dfPlayCast の呼び出しが 0 でない) '
      + '⭐ 演出を黙らせた副作用で「実は何も撃っていないのに緑」になる空振りを塞ぐ',
      (capCase.castCalls || 0) > 0 && (capCase.shots || 0) >= 8,
      'dfPlayCast ' + capCase.castCalls + ' 回 / allyHoldPerson ' + capCase.shots + ' 回');

    /* ── (4d) 潜行のやり直し ── */
    const reset = await ix.evaluate(() => window.__hpProbe.resetRun());
    check('(4d) 潜行をやり直すと輪が 0 本にリセットされる (前の潜行の輪が残らない)',
      reset.hasFn && reset.before > 0 && reset.after === 0,
      JSON.stringify(reset));

    await ix.close();

    /* ── (3a)(3b) 免疫 — 盤面を作り直す (上で clearNodeArrays したため) ── */
    const ix2 = await openIndex(browser, '');
    await ix2.evaluate(installProbe);
    const castUndead = await ix2.evaluate(() => window.__hpProbe.cast('skeleton',   { tries: 8 }));
    const castBoss   = await ix2.evaluate(() => window.__hpProbe.cast('goblinKing', { tries: 8 }));
    const castLive   = await ix2.evaluate(() => window.__hpProbe.cast('orc',        { tries: 8 }));

    check('(0d) [装置] 母集団: アンデッド (skeleton) とボス (goblinKing) を実際に 1 体ずつ立てられている '
      + '(⭐ #50 の教訓 = 差が出ることではなく、後続 assert の敷居を満たす差が出ることまで縛る)',
      !!(castUndead.after && castUndead.after[0]) && !!(castBoss.after && castBoss.after[0])
      && !!(castLive.after && castLive.after[0]),
      'アンデッド=' + JSON.stringify(castUndead.after) + ' / ボス=' + JSON.stringify(castBoss.after)
      + ' / 生者=' + JSON.stringify(castLive.after));

    check('(3a) アンデッド (skeleton) に撃つと stunned が 1 も増えず、held も立たない '
      + '(⭐ 同じ盤面の生者を対照に同居させる)',
      !!(castUndead.after && castUndead.after[0])
      && castUndead.after[0].stunned === 0 && castUndead.after[0].held === false
      && !!(castLive.after && castLive.after[0]) && castLive.after[0].stunned > 0,
      'アンデッド ' + JSON.stringify(castUndead.after) + ' ‖ 対照の生者 ' + JSON.stringify(castLive.after));

    check('(3b) ボス (def.isBoss) でも同じ = stunned が 1 も増えず held も立たない',
      !!(castBoss.after && castBoss.after[0])
      && castBoss.after[0].stunned === 0 && castBoss.after[0].held === false,
      'ボス ' + JSON.stringify(castBoss.after));

    const immRings = await ix2.evaluate(() => window.__hpProbe.rings());
    check('(4a2) 免疫の相手には輪が出ない = 輪の本数が held の敵の数とちょうど一致する',
      immRings.regLen === immRings.owners.filter((o) => o.held === true).length && immRings.regLen === 1,
      JSON.stringify(immRings));

    await ix2.close();

    /* ── 撤退スイッチ (index 側) ── */
    const ixOff = await openIndex(browser, '?holdperson=0');
    const infoOff = await ixOff.evaluate(installProbe);
    check('(5c-3) ?holdperson=0 で僧侶の枠から hold-person が落ちる。'
      + '⭐ 素のアームの対照を同居させる (素では枠に在る / 撤退では無い)',
      !!(info.allies || []).find((a) => a.cls === 'cleric' && a.eq.indexOf('hold-person') >= 0)
      && !(infoOff.allies || []).find((a) => a.cls === 'cleric' && a.eq.indexOf('hold-person') >= 0),
      '素 ' + JSON.stringify((info.allies || []).filter((a) => a.cls === 'cleric').map((a) => a.eq))
      + ' / 撤退 ' + JSON.stringify((infoOff.allies || []).filter((a) => a.cls === 'cleric').map((a) => a.eq)));
    await ixOff.close();

    /* ══ §5 恒等 (配信バイト / git の 2 経路) ══════════════════════════════ */
    let baseIndex = null;
    try {
      baseIndex = execFileSync('git', ['show', BASE_REV + ':index.html'],
        { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    } catch (e) { baseIndex = null; }

    /* ⚠⚠⚠ ここは **配信バイト (FROZEN)** を読む。⛔ PRISTINE (手つかずの原本) を読むと、
       変異は配信を差し替える方式なので **負のコントロールが素通しになる**
       (恒久教訓「--mutate は fs で作業ツリーを読む assert には効かない」の同型)。
       ⭐ 2026-09-07 の初回 --negative で ringarray が実際にこれで空振りした。 */
    const cur = FROZEN['/index.html'].toString('utf8');
    /* ⚠⚠⚠ ソース文字列を見るガードは **自分が書いた解説コメントを実参照として数える**
       (恒久教訓。2026-09-07 の初回実走で 81 → 83 になり、増えた 2 行はどちらも
        この実装で足した日本語コメントだった = 実装は無罪、測定器の欠陥)。
       ⛔ 「コメントに helpless と書かない」で回避しない —— あの注記は残す価値がある。
       ⭐ 直すのは測定器のほう: ブロック / 行コメントを**剥いでから**数える。
         そうすればこの assert は主張どおり「**コード**の helpless が変わっていない」を測る。
       ⚠ 行の対応を保つため、剥いだ部分は空白へ潰して改行だけ残す。
       ⚠ `https://` を行コメントと誤認しないよう、直前が : " ' \ でないときだけ剥ぐ。 */
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '))
      .replace(/(^|[^:"'\\])\/\/[^\r\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
    const linesWith = (src, word) => stripComments(src).split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.indexOf(word) >= 0);
    /* 装置: 「剥ぎ過ぎてコードごと消えていない」ことを、依頼書 §2-3 が名指しした
       **15 箇所の攻撃解決** (helpless = target.stunned > 0 の形) の実数で押さえる。 */
    const sites = (arr) => arr.filter((l) => /helpless\s*=\s*[^=]/.test(l)).length;

    if (!baseIndex) {
      check('(5a) ★ helpless を含むコードが着手前 (' + BASE_REV + ') と 1 文字も変わっていない',
        false, 'git show ' + BASE_REV + ':index.html が読めなかった (装置の故障)');
    } else {
      const a = linesWith(baseIndex, 'helpless');
      const b = linesWith(cur, 'helpless');
      const same = a.length === b.length && a.every((l, i) => l === b[i]);
      check('(5a) ★ helpless を含む **コード** が着手前 ' + BASE_REV + ' と 1 文字も変わっていない '
        + '(⛔ 近接限定にすると出荷済みの挙動を 15 箇所で弱める = 依頼書 §2-4)',
        same && sites(a) >= 15 && sites(b) === sites(a),
        '着手前 ' + a.length + ' 行 (うち helpless= の攻撃解決 ' + sites(a) + ' 箇所) / '
        + '現在 ' + b.length + ' 行 (同 ' + sites(b) + ' 箇所) / 一致=' + same
        + (same ? '' : '  差分: ' + JSON.stringify(b.filter((l) => a.indexOf(l) < 0).slice(0, 3))));
    }

    const SIG = 'async function executeSkillOn(actor, classKey, skillId, targetIdx) {';
    check('(5b) executeSkillOn のシグネチャ行が逐語で一致し、ちょうど 1 箇所 '
      + '(⚠ tools/driver_action_priority.js:131 が逐語アンカーで計測シームを注入する)',
      cur.split(SIG).length - 1 === 1,
      '出現 ' + (cur.split(SIG).length - 1) + ' 箇所');

    /* (4b) 敵 DOM の添字並列配列の本数が着手前と同じ = レジストリ方式であることの機械確認。
       ⛔ 件数を期待値に焼かない (12 本目が正当に増えた日も意味を保つよう、着手前と比べる)。 */
    const bodyOf = (src) => {
      const i = src.indexOf('function createEnemyDom(index, def, typeKey) {');
      if (i < 0) return null;
      const j = src.indexOf('function createEnemy(typeKey, tx, ty) {', i);
      return (j < 0) ? null : src.slice(i, j);
    };
    const curBody  = bodyOf(cur);
    const baseBody = baseIndex ? bodyOf(baseIndex) : null;
    const countPush = (b) => b ? (b.match(/\.push\(/g) || []).length : -1;
    check('(4b) ★★ 輪の DOM が敵の添字並列配列に入っていない '
      + '(= createEnemyDom が push する配列の本数が着手前 ' + BASE_REV + ' と同じ。#44/#46 の罠の機械確認)',
      !!curBody && !!baseBody && countPush(curBody) === countPush(baseBody) && countPush(curBody) > 0,
      '着手前 ' + countPush(baseBody) + ' 本 / 現在 ' + countPush(curBody) + ' 本');

    check('(5d) ページエラー / console error が 0 件 (favicon の 404 は除外済み)',
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
