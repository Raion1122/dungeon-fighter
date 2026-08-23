#!/usr/bin/env node
/*
 * driver_action_priority.js — 実装依頼書 #19「行動の優先度」検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/driver_action_priority.js [--headful] [--port N] [--browser <path>]
 *   node tools/driver_action_priority.js --negative     ← 負のコントロール
 *
 * ── セクションと実装状況 (段階的に足していく骨組み) ───────────────────────
 *   §0 装置 (母集団の確認 / index↔tavern の二重定義突合)   … 実装済 (項目②)
 *   §1 主人公 — 重み倍率がクランプに食われていない          … 実装済 (項目②)
 *   §2 仲間 — 先出しが効き、指定外は不変                    … 実装済 (項目③)
 *   §3 道中詠唱                                             … PENDING (項目④)
 *   §4 バフ退避 (戦闘開始で主人公だけ剥がれない)            … PENDING (項目④)
 *   §5 撤退スイッチ ?actionpri=0                            … PENDING (項目④)
 *   §6 酒場 UI                                              … 実装済 (本ファイル)
 *
 *   ⛔ PENDING は **黙って緑にしない**。RESULT 行に PASSED / FAILED / PENDING の
 *      3 つの数を必ず出し、「まだ測っていない」を数で見えるようにする。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ────────────────────────────
 *  - ROOT は必ず path.resolve を通す。区切り文字のまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない。
 *  - classic script 直下の let/const/function は **window に載らない**。
 *    page.evaluate(() => PARTY_SLOTS) のように **裸の識別子**で読む。
 *  - same-origin の localStorage / sessionStorage はページ遷移をまたいで生き残る →
 *    seed() で毎回 purge してからリロードする。
 *  - openPrep() を **await してはいけない**。マッチング演出はタップを待って止まるので
 *    headless では永久に固まる。発火だけさせ、画面中央をタップし続けて #prep を出す。
 *  - ⭐⭐ 本番ファイルに計測シームを置かない (CLAUDE.md の changelog ガード)。
 *    必要な細工は **配信スナップショットへ実行時に注入**する (下の NEG_ANCHOR)。
 *  - ⭐⭐ 配信バイトを起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *
 * ── 負のコントロール (--negative) ──────────────────────────────────────────
 *   N1: pickLeaderAction の `w *= AP_BOOST` を `Math.min(LEADER_W_MAX,...)` の **前** へ
 *       移す (依頼書 §2-4 の罠そのもの) → **(1c) が赤くなる**こと。
 *   N2: apGateP を Math.max(base, AP_P) → Math.min(base, AP_P) へ反転 (上げずに下げる)
 *       → **(2c) が赤くなる**こと。⚠ 赤くならなければゲート 20 本のラップは信用できない。
 *   N3: renderActionPriority() の「装備している技だけに絞る」フィルタを外す
 *       (= 候補を skillPool 全部にする) → **(6b) が赤くなる**こと。
 *       どれも赤くならなければ exit 1 (テストが空振りしている証拠)。
 *       ⚠ 注入点が 1 箇所ちょうど見つからなければ、走らせる前に exit 1 で止まる
 *         (アンカーが腐ったまま「注入したつもり」で緑になるのを防ぐ)。
 *   ※ 依頼書 §8 の N4/N5/N6 (道中詠唱・バフ退避) は後続項目 ④ の担当。ここでは入れない。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ⚠ path.resolve 必須
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const PORT     = parseInt(arg('port', '8843'), 10);

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {};
for (const rel of ['tavern.html', 'index.html']) {
  FROZEN['/' + rel] = fs.readFileSync(path.join(ROOT, rel));
}

/* ── index.html を行単位で書き換えるユーティリティ ─────────────────────────────
 * ⚠⚠ index.html は CRLF。'\n' 決め打ちで split すると各行末に '\r' が残るので、
 *    比較は trim してから行い、書き戻す行には '\r' を付け直す。
 * ⚠ アンカーがちょうど 1 箇所見つからなければ **走らせる前に exit 1**
 *   (腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ)。 */
function editIndexLines(label, mutate) {
  const lines = FROZEN['/index.html'].toString('utf8').split('\n');
  const trimCR = (s) => s.replace(/\r$/, '').trim();
  if (!mutate(lines, trimCR)) {
    console.error('[driver] ' + label + ' の注入点が腐っています。走らせずに止めます。');
    process.exit(1);
  }
  FROZEN['/index.html'] = Buffer.from(lines.join('\n'), 'utf8');
}

/* ── 計測シーム: executeSkillOn の呼び出しログ ────────────────────────────────
 * ⛔ 本番ファイルに計測シームを置かない (CLAUDE.md: プレイヤーに見える変化の無い
 *    本番改変は changelog ガードに掛かる) → **配信スナップショットへ実行時に注入**する。
 * 関数本体の先頭へ 1 行だけ差し込むので、呼び出しを 1 件も取りこぼさない。
 * ⭐⭐⭐ このログが空のまま §2 の assert が全部緑になるのが最悪の空振り → (0c) で見る。 */
const SEAM_FN   = 'async function executeSkillOn(actor, classKey, skillId, targetIdx) {';
const SEAM_LINE = '      try { (window.__apLog = window.__apLog || []).push({ classKey: classKey, skillId: skillId,'
  + ' isLeader: !!(actor && actor.isLeader), targetIdx: targetIdx,'
  + ' phase: (typeof currentPhase !== "undefined" ? currentPhase : null),'
  + ' enc: (typeof encounterActive !== "undefined" ? encounterActive : null) }); } catch (e) {}';
editIndexLines('計測シーム (executeSkillOn)', (lines, trimCR) => {
  const spots = [];
  for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === SEAM_FN) spots.push(i);
  if (spots.length !== 1) {
    console.error('[driver] executeSkillOn の定義が ' + spots.length + ' 箇所 (期待 1):  ' + SEAM_FN);
    return false;
  }
  lines.splice(spots[0] + 1, 0, SEAM_LINE + '\r');
  return true;
});

// ⚠ 実装側のこの 1 行が「装備している技だけに絞る」フィルタの入口。
const NEG_ANCHOR = 'const equippedIds = apEquippedIdsFor(slot, classKey);';
const NEG_PATCH  = 'const equippedIds = slot.skillPool.map(sk => sk.id); /* N3: フィルタを外した変異 */';
if (NEGATIVE) {
  const src   = FROZEN['/tavern.html'].toString('utf8');
  const parts = src.split(NEG_ANCHOR);
  const hits  = parts.length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール N3 の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + NEG_ANCHOR);
    process.exit(1);
  }
  FROZEN['/tavern.html'] = Buffer.from(parts.join(NEG_PATCH), 'utf8');
  console.log('[driver] ★ 負のコントロール N3 を注入しました (renderActionPriority の絞り込みを外す)');

  // ── N1 (依頼書 §2-4 の罠): 倍率をクランプの **前** へ移す ─────────────────
  //   ⚠ index.html は CRLF。改行を '\n' 決め打ちで探すと注入点 0 で止まるので行単位で扱う。
  const iLines = FROZEN['/index.html'].toString('utf8').split('\n');
  const trimCR = (s) => s.replace(/\r$/, '').trim();
  const L_CLAMP = 'w = Math.min(LEADER_W_MAX, Math.max(LEADER_W_FLOOR, w));';
  const L_BOOST = 'if (apPrefId && id === apPrefId) w *= AP_BOOST;';
  const n1Spots = [];
  for (let i = 0; i + 1 < iLines.length; i++)
    if (trimCR(iLines[i]) === L_CLAMP && trimCR(iLines[i + 1]) === L_BOOST) n1Spots.push(i);
  if (n1Spots.length !== 1) {
    console.error('[driver] 負のコントロール N1 の注入点が ' + n1Spots.length + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + L_CLAMP + '  /  ' + L_BOOST);
    process.exit(1);
  }
  {
    const i = n1Spots[0];
    const a = iLines[i], b = iLines[i + 1];
    iLines[i]     = b.replace(/(\r?)$/, ' /* N1: クランプの前へ移した変異 */$1');
    iLines[i + 1] = a;
    FROZEN['/index.html'] = Buffer.from(iLines.join('\n'), 'utf8');
  }
  console.log('[driver] ★ 負のコントロール N1 を注入しました (倍率を Math.min クランプの前へ移動)');

  // ── N2 (依頼書 §8): apGateP を「上げる」から「下げる」へ反転させる ──────────
  //   Math.max(base, AP_P) → Math.min(base, AP_P)。20 本のゲートのラップが実際に
  //   効いているかを (2c) が見ている。⚠ これが赤くならなければラップは信用できない。
  const N2_OLD = 'return (apPreferredId(cls, apSituationNow()) === skillId) ? Math.max(base, AP_P) : base;';
  const N2_NEW = 'return (apPreferredId(cls, apSituationNow()) === skillId) ? Math.min(base, AP_P) : base;'
               + '   /* N2: 上げずに下げた変異 */';
  editIndexLines('負のコントロール N2 (apGateP)', (lines, trimCR) => {
    const spots = [];
    for (let i = 0; i < lines.length; i++) if (trimCR(lines[i]) === N2_OLD) spots.push(i);
    if (spots.length !== 1) {
      console.error('[driver] N2 の注入点が ' + spots.length + ' 箇所 (期待 1):  ' + N2_OLD);
      return false;
    }
    lines[spots[0]] = '      ' + N2_NEW + '\r';
    return true;
  });
  console.log('[driver] ★ 負のコントロール N2 を注入しました (apGateP を Math.min = 引き下げへ反転)');
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
        if (FROZEN[u]) {                                     // ← 凍結済み (+ 変異済み) を優先
          rs.setHeader('Content-Type', MIME['.html']);
          rs.end(FROZEN[u]);
          return;
        }
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
 * 集計 (PASSED / FAILED / PENDING の 3 値)
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * 期待表 — 依頼書の実測 (§2-6 / §2-9) をドライバ側に持つ。
 * ⚠ 実装からコピーしない。実装が変わったらここが赤くなるのが正しい。
 * ══════════════════════════════════════════════════════════════════════════ */
const CLASS_KEYS = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
const SITUATIONS = ['general', 'mob', 'boss', 'travel'];
// §2-6: 「呪文スロットを消費し、敵を対象に取らない呪文」の全数 = 10 件
const EXPECT_TRAVEL_IDS = ['bless', 'shield-of-faith', 'striking',
  'cure-light-wounds', 'cure-moderate-wounds', 'cure-serious-wounds', 'cure-critical-wounds',
  'arcane-shield', 'cure-minor', 'haste'];
// §2-9 の表: 道中の行が出るのは僧侶・魔法使い・エルフだけ (戦士/ドワーフ/盗賊は 0 件)
const EXPECT_TRAVEL_CLASSES = ['cleric', 'mage', 'elf'];

const setEq = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};

/* ══════════════════════════════════════════════════════════════════════════
 * ページ内: 初期化。
 *   Lv5 (累積 XP 10000) にする = スキル枠 3。既定の 3 スキルがそのまま枠に収まり、
 *   (6c) で外した技を戻せる (Lv1 は枠 1 なので再装備が塞がり、後片付けができない)。
 * ══════════════════════════════════════════════════════════════════════════ */
function seed() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '10000');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
  } catch (e) {}
}

const PREP_SCENARIO = 'goblin-mine';

async function openPrepScreen(browser, viewport) {
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(viewport.name + ' :: ' + e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(seed);
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 20000 });
  // ⚠ await しない (マッチング演出がタップ待ちで止まるため)
  await page.evaluate((scId) => {
    const sc = scenarios.find(s => s.id === scId);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  }, PREP_SCENARIO);
  const shownNow = () => page.evaluate(() => {
    const p = document.getElementById('prep');
    if (!p || getComputedStyle(p).display === 'none') return false;
    const rows = document.getElementById('apRows');
    return !!rows && rows.getBoundingClientRect().width > 1;
  });
  let shown = false;
  for (let i = 0; i < 45 && !shown; i++) {
    shown = await shownNow();
    if (shown) break;
    await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    await sleep(550);
  }
  if (!shown) throw new Error('準備画面 (#prep) が可視にならなかった — 演出の進行に失敗 [' + viewport.name + ']');
  await page.evaluate(() => { const ov = document.getElementById('prologueOverlay'); if (ov) ov.style.display = 'none'; });
  await sleep(300);
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
 * index.html 側の測定装置 (§0 / §1)
 * ══════════════════════════════════════════════════════════════════════════ */
// 仕込む優先度。⚠ localStorage は **遷移前** に書く
// (loadPersistentProgress はページ読み込み時に 1 回しか走らない)。
const AP_SEED = {
  warrior: { general: null, mob: null, boss: 'strong-cleave', travel: null },
  cleric:  { general: null, mob: null, boss: 'bless',         travel: null },
  mage:    { general: null, mob: null, boss: 'fireball',      travel: null },
};
// §2 (仲間) 用の仕込み。⭐ 「その職の AI が自力では絶対に選ばない技」を指定して、
//   先出しが既存の判断 (threatScore の梯子 / if 連鎖の順序) を素通りできるかを見る。
const AP_SEED_ALLY = {
  mage:    { general: null, mob: null, boss: 'fireball',       travel: null },
  rogue:   { general: null, mob: null, boss: 'thrown-dagger',  travel: null },
  warrior: { general: null, mob: null, boss: 'strong-cleave',  travel: null },
};
// ダイス表記の期待値。⛔ 重みの再実装ではない (「2d8 は今の武器より強い」を言うためだけ)。
const diceEV = (s) => {
  const m = /^(\d+)d(\d+)$/.exec(String(s || ''));
  return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : 0;
};

// 戦闘の自走が測定を汚さないよう敵を遠ざけて静穏化する (driver_leader_ai の QUIET を踏襲)
const QUIET = `
  try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
  try { encounterActive = false; } catch (e) {}
`;

const AP_HELPERS = `
  window.__apSample = function (choices, ctx, n) {
    const tally = {};
    for (const c of choices) tally[c] = 0;
    for (let i = 0; i < n; i++) { const r = window.pickLeaderAction(choices, ctx); tally[r.id] = (tally[r.id] || 0) + 1; }
    const share = {};
    for (const c of choices) share[c] = tally[c] / n;
    return { tally: tally, share: share };
  };
  window.__apMkTarget = function (opt) {
    opt = opt || {};
    const mx = (opt.maxHp != null ? opt.maxHp : 40);
    return { hp: (opt.hp != null ? opt.hp : mx), maxHp: mx, alive: true,
             def: opt.def || { name: 'ダミー', hp: mx } };
  };
  // 「ボス戦の最中」を **同期のうちに** 作って必ず戻す。pickLeaderAction のサンプリングは
  // 完全に同期なので、この間に非同期のゲームループが割り込むことは原理的に無い。
  // ⚠ enemies へ素の object を push しない (parallel array が並走している) → 配列ごと差し替えて戻す。
  window.__apWithBoss = function (fn) {
    const prevEnemies = enemies, prevIdx = encounterEnemyIndices, prevActive = encounterActive;
    try {
      enemies = [{ alive: true, hp: 100, maxHp: 100, def: { name: 'ボス', isBoss: true, hp: 100 } }];
      encounterEnemyIndices = [0];
      encounterActive = true;
      return fn();
    } finally {
      enemies = prevEnemies; encounterEnemyIndices = prevIdx; encounterActive = prevActive;
    }
  };
  // 指定あり / 指定なし を同一ページ・同一 RNG ストリームで採る。
  // ⭐ 本番の let をそのまま切り替えているだけ (計測用の分岐を本番へ足していない)。
  window.__apWithMap = function (map, fn) {
    const prev = actionPriorityMap;
    try { actionPriorityMap = map; return fn(); } finally { actionPriorityMap = prev; }
  };
`;

/* ── §2 (仲間) 用の測定装置 ─────────────────────────────────────────────────
 * ⭐⭐ 本物の ally* 関数は 1 手番あたり数秒の演出を回すので、分布を採る回数を稼げない。
 *    そこで **「実行」だけを記録用スタブへ差し替える**。決定ロジック (mageAI の
 *    threatScore 梯子・rogueAI の if 連鎖・apTryPreferred) は 1 行も触らない。
 * ⚠⚠ enemies / encounterEnemyIndices / encounterActive / actionPriorityMap は
 *    ループ全体を 1 回だけ包んで必ず戻す。スタブは即座に解決する async なので
 *    ループ中に **マクロタスクへ降りない** = 走行中のゲームループが割り込めない。
 * ⚠ enemies へ素の object を push しない (parallel array が並走している) → 配列ごと差し替える。
 */
const AP_ALLY_HELPERS = `
  window.__apMkAlly = function (classKey, equipped, slots, opt) {
    opt = opt || {};
    return {
      classKey: classKey, alive: true, stunned: 0, confused: 0, wildConfused: 0,
      hp: (opt.hp != null ? opt.hp : 30), maxHp: 30,
      x: (opt.x != null ? opt.x : 0), y: (opt.y != null ? opt.y : 0),
      def: { name: 'テスト' + classKey, displaySize: 96, role: 'backline', weaponRange: 'melee' },
      weaponRange: 'melee',
      statusEffects: [],
      buffs: { acBonusRemaining: 0, atkBonusRemaining: 0, strikingRemaining: 0, hastedRemaining: 0,
               blessMoveRemaining: 0, dmgReductionRemaining: 0, dmgReductionFlatRemaining: 0,
               antiKnockbackRemaining: 0, evasionRemaining: 0, luckyRemaining: 0,
               statusImmunityCharges: 0, frightenedRemaining: 0, fearImmuneRemaining: 0,
               dmgReductionDice: null, dmgReductionFlat: 0, luckyCritWiden: 0, sleepWatchHp: null },
      equippedSkills: equipped.slice(),
      spellSlots: Object.assign({}, slots || {}),
      maxSpellSlots: Object.assign({}, slots || {}),
      skillsUsedInEncounter: new Set(),
      skillCooldowns: {},
      el: null,
    };
  };
  window.__apMkBoss = function (ally, cfg) {
    cfg = cfg || {};
    return { alive: true, inactive: false, stunned: 0,
             hp: (cfg.bossHp != null ? cfg.bossHp : 10), maxHp: 40,
             x: ally.x + (cfg.dx != null ? cfg.dx : 96), y: ally.y,
             poisonRemaining: 0, huntMarkRemaining: 0,
             def: { name: 'ボス', isBoss: true, hp: 40, displaySize: 96 } };
  };
  // cfg = { classKey, equipped, slots, stubs, map, n, ai, bossHp, dx }
  // 返り = { tally: {スタブ名 or '(none)': 回数}, seamDelta: executeSkillOn 呼び出し増分 }
  window.__apAllyRun = async function (cfg) {
    const prevE = enemies, prevI = encounterEnemyIndices, prevA = encounterActive, prevM = actionPriorityMap;
    const seamBefore = (window.__apLog || []).length;
    const saved = {}, tally = {};
    let lastFn = null;
    for (const nm of cfg.stubs) { saved[nm] = window[nm]; }
    for (const nm of cfg.stubs) window[nm] = async function () { lastFn = nm; return true; };
    try {
      actionPriorityMap = cfg.map;
      for (let i = 0; i < cfg.n; i++) {
        const ally = window.__apMkAlly(cfg.classKey, cfg.equipped, cfg.slots, cfg);
        enemies = [window.__apMkBoss(ally, cfg)];
        encounterEnemyIndices = [0];
        encounterActive = true;
        lastFn = null;
        const fired = await window[cfg.ai](ally);
        const key = lastFn ? lastFn : (fired ? '(fired-unknown)' : '(none)');
        tally[key] = (tally[key] || 0) + 1;
      }
    } finally {
      for (const nm of cfg.stubs) window[nm] = saved[nm];
      enemies = prevE; encounterEnemyIndices = prevI; encounterActive = prevA; actionPriorityMap = prevM;
    }
    return { tally: tally, seamDelta: (window.__apLog || []).length - seamBefore };
  };
`;

async function openIndexPage(browser, qs, seedAp) {
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push('index :: ' + e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((ap) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      if (ap) localStorage.setItem('dragonfighters.actionPriority', JSON.stringify(ap));
      else localStorage.removeItem('dragonfighters.actionPriority');
    } catch (e) {}
  }, seedAp || null);
  await page.goto('http://localhost:' + PORT + '/index.html?' + (qs || 'autoplay=30&diag=1'),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
    { timeout: 45000 });
  await sleep(400);
  await page.evaluate(QUIET);
  await page.evaluate(AP_HELPERS);
  return page;
}

/* 1 職ぶんの観測。⭐ 「今の枠」はドライバが **selection.partySkills / CLERIC 表から独立に**
   組み立て、実装が描いた option と突き合わせる (2 経路)。 */
async function readClass(page, classKey) {
  return page.evaluate((ck) => {
    window.__equipTV.setTab(ck);
    const slot = PARTY_SLOTS.find(s => s && s.classKey === ck);
    const out = {
      classKey: ck,
      poolIds: slot.skillPool.map(sk => sk.id),
      selectCount: document.querySelectorAll('#apRows select').length,
      rowCount: document.querySelectorAll('#apRows .apRow').length,
      hintText: (document.getElementById('apHint') || {}).textContent || '',
      rows: {},
    };
    // ── 経路 B: ドライバが元データから組み立てる「今そのキャラが枠に入れている技」 ──
    if (ck === 'cleric') {
      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));
      out.equippedByData = slot.skillPool
        .filter(sk => (auto[sk.id] || 0) > 0 && isSpellKnownTV(ck, sk.id)).map(sk => sk.id);
    } else {
      const owned = new Set(Array.isArray(selection.partySkills[ck]) ? selection.partySkills[ck] : []);
      out.equippedByData = slot.skillPool.filter(sk => owned.has(sk.id)).map(sk => sk.id);
    }
    for (const sit of ['general', 'mob', 'boss', 'travel']) {
      const sel = document.getElementById('apSel_' + ck + '_' + sit);
      if (!sel) { out.rows[sit] = { exists: false }; continue; }
      const rowEl = sel.closest('.apRow');
      out.rows[sit] = {
        exists: true,
        visible: !!rowEl && getComputedStyle(rowEl).display !== 'none',
        values: Array.prototype.map.call(sel.options, o => o.value),
        labels: Array.prototype.map.call(sel.options, o => o.textContent),
        value: sel.value,
      };
    }
    return out;
  }, classKey);
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT + (NEGATIVE ? '   [NEGATIVE]' : ''));

  const profile = require('./_pptr_profile')('df_actionpri_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  try {
    /* ════════════════════════════════════════════════════════════════════
     * §0 装置 + §1 主人公 — index.html 側 (項目② の担当)
     * ════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§0) 装置: 母集団と二重定義の突合 ---');
    const idxPage = await openIndexPage(browser, 'autoplay=30&diag=1', AP_SEED);

    const seam0 = await idxPage.evaluate(() => ({
      hasPreferred: typeof window.apPreferredId === 'function',
      hasSituation: typeof window.apSituationNow === 'function',
      hasGate:      typeof window.apGateP === 'function',
      on:           window.ACTION_PRIORITY_ON,
      boost:        window.AP_BOOST,
      // 注意: LEADER_PICK_T / LEADER_W_MAX は classic script 直下の const = window に載らない → 裸で読む
      pickT:        (typeof LEADER_PICK_T !== 'undefined') ? LEADER_PICK_T : null,
      wMax:         (typeof LEADER_W_MAX  !== 'undefined') ? LEADER_W_MAX  : null,
      travel:       window.AP_TRAVEL_CASTABLE ? Array.from(window.AP_TRAVEL_CASTABLE) : null,
      mageBoss:     window.apPreferredId('mage',    'boss'),
      clericBoss:   window.apPreferredId('cleric',  'boss'),
      warriorBoss:  window.apPreferredId('warrior', 'boss'),
      dwarfBoss:    window.apPreferredId('dwarf',   'boss'),
      mageMob:      window.apPreferredId('mage',    'mob'),
      sitQuiet:     window.apSituationNow(),
      sitBoss:      window.__apWithBoss(() => window.apSituationNow()),
    }));

    check('(0a-0) 装置: apPreferredId / apSituationNow / apGateP / AP_BOOST が window に載っている',
      seam0.hasPreferred && seam0.hasSituation && seam0.hasGate && typeof seam0.boost === 'number',
      JSON.stringify({ pref: seam0.hasPreferred, sit: seam0.hasSituation, gate: seam0.hasGate,
                       boost: seam0.boost, on: seam0.on, T: seam0.pickT, wMax: seam0.wMax }));
    // ⭐⭐⭐ ここが null のまま §1 が全部緑になるのが最悪の空振り。
    check('(0a) window.apPreferredId("mage","boss") が仕込んだ ID を返す',
      seam0.mageBoss === AP_SEED.mage.boss && seam0.clericBoss === AP_SEED.cleric.boss
        && seam0.warriorBoss === AP_SEED.warrior.boss,
      'mage/boss=' + JSON.stringify(seam0.mageBoss) + ' cleric/boss=' + JSON.stringify(seam0.clericBoss)
        + ' warrior/boss=' + JSON.stringify(seam0.warriorBoss));
    check('(0a-2) 仕込んでいない職は null / general 未設定の枠も null (何でも返す実装ではない)',
      seam0.dwarfBoss === null && seam0.mageMob === null,
      'dwarf/boss=' + JSON.stringify(seam0.dwarfBoss) + ' mage/mob=' + JSON.stringify(seam0.mageMob));
    check('(0a-3) apSituationNow が travel / boss を実際に作り分ける (§1 のボス状況が本物である証明)',
      seam0.sitQuiet === 'travel' && seam0.sitBoss === 'boss',
      '非戦闘=' + JSON.stringify(seam0.sitQuiet) + ' ボス格交戦中=' + JSON.stringify(seam0.sitBoss));

    // ── (0b) 二重定義の突合 (tavern ↔ index) ────────────────────────────
    const tPeek = await browser.newPage();
    tPeek.on('pageerror', e => pageErrors.push('tavern-peek :: ' + e.message));
    await tPeek.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await tPeek.waitForFunction("typeof TRAVEL_CASTABLE_IDS !== 'undefined'", { timeout: 20000 });
    const tavernTravel = await tPeek.evaluate(() => TRAVEL_CASTABLE_IDS.slice());
    await tPeek.close();
    const tvArr = Array.isArray(tavernTravel) ? tavernTravel : [];
    const ixArr = Array.isArray(seam0.travel) ? seam0.travel : [];
    const travelDiff = tvArr.filter(x => ixArr.indexOf(x) < 0).concat(ixArr.filter(x => tvArr.indexOf(x) < 0));
    check('(0b) tavern の TRAVEL_CASTABLE_IDS と index の AP_TRAVEL_CASTABLE が集合として一致 (10 件)',
      tvArr.length === 10 && ixArr.length === 10 && setEq(tvArr, ixArr) && setEq(ixArr, EXPECT_TRAVEL_IDS),
      'tavern n=' + tvArr.length + ' index n=' + ixArr.length + ' 片側にしか無い ID=' + JSON.stringify(travelDiff));

    console.log('  ..  (0c) 計測シームの母集団ガードは §2 の計測後に出す (下の "(0c)" を見ること)');
    pending('(0d) 道中テストで敵が alert/chase になった瞬間が 1 回以上ある', '項目④ (STEP5) 未実装');

    console.log('\n--- (§1) 主人公: 重み倍率がクランプに食われていない ---');
    const AP_N = 6000;

    // ── (1a)(1b) 僧侶リーダー・boss = bless ──────────────────────────────
    const s1 = await idxPage.evaluate((N) => {
      leaderClassKey = 'cleric';
      encounterRound = 1;        // bless は開幕バフ = 実際に張る場面
      hp = maxHp;                // 回復候補が混ざらない状態に固定
      const cs = ['normal', 'bless'];
      const target = window.__apMkTarget({ hp: 40, maxHp: 40, def: { name: 'ボス', isBoss: true, hp: 40 } });
      const saved = actionPriorityMap;
      return window.__apWithBoss(() => ({
        sit:    window.apSituationNow(),
        prefId: window.apPreferredId('cleric', window.apSituationNow()),
        none:   window.__apWithMap(null,  () => window.__apSample(cs, { target: target }, N)).share,
        pref:   window.__apWithMap(saved, () => window.__apSample(cs, { target: target }, N)).share,
      }));
    }, AP_N);

    check('(1a-0) 前提: 状況が boss と判定され、僧侶の指定が bless に解決している',
      s1.sit === 'boss' && s1.prefId === 'bless',
      'sit=' + s1.sit + ' prefId=' + JSON.stringify(s1.prefId));
    check('(1a) 僧侶リーダー boss=bless でシェアが有意に上がる',
      s1.pref.bless > s1.none.bless + 0.05,
      '指定なし=' + s1.none.bless.toFixed(4) + ' → 指定あり=' + s1.pref.bless.toFixed(4) + ' (N=' + AP_N + '/両側)');

    // ⭐ 2 経路目: ページから読んだ AP_BOOST と LEADER_PICK_T だけで期待シェアを独立計算する。
    //   倍率はクランプ後の重みに掛かるので、勝った候補の最終重みはちょうど B = AP_BOOST^(1/T) 倍。
    //   他候補の重みは 1 ビットも動かないので、指定なしのシェア s0 から
    //     s = s0*B / (1 - s0 + s0*B)
    //   が一意に決まる。⛔ ドライバ側で重み式を再実装していない (s0 は実測値)。
    const apT   = Math.min(4, Math.max(0.2, Number(seam0.pickT)));   // 実装と同じ温度クランプ
    const apB   = Math.pow(Number(seam0.boost), 1 / apT);
    const s0    = s1.none.bless;
    const s1exp = (s0 * apB) / (1 - s0 + s0 * apB);
    check('(1b) シェア差が AP_BOOST^(1/T) から独立計算した期待シェアと一致 (±0.05)',
      apB > 1 && Math.abs(s1exp - s1.pref.bless) <= 0.05,
      'B=' + apB.toFixed(4) + ' 期待=' + s1exp.toFixed(4) + ' 実測=' + s1.pref.bless.toFixed(4)
        + ' 差=' + Math.abs(s1exp - s1.pref.bless).toFixed(4));

    // ── (1c) クランプに張り付く候補でも効くか (§2-4 の罠の本丸) ──────────
    const s1c = await idxPage.evaluate((N) => {
      leaderClassKey = 'warrior';
      encounterRound = 5;        // バフ加点を切って攻撃同士の比較にする
      hp = maxHp;
      // ⭐ 撃破圏 (hp=1) のボス格にすると、通常攻撃も強斬りも生重みが LEADER_W_MAX=3 を超えて
      //    上限に張り付く。鉄壁の構え (dmgDice も healDice も持たない = その他扱いで常に 1.0) だけが
      //    張り付かないので、3 者のシェアで「クランプが効いている」ことが読める。
      const target = window.__apMkTarget({ hp: 1, maxHp: 40, def: { name: 'ボス', isBoss: true, hp: 40 } });
      const cs = ['normal', 'strong-cleave', 'iron-guard'];
      const saved = actionPriorityMap;
      const wpn = (typeof getCurrentWeapon === 'function' && getCurrentWeapon()) || null;
      return window.__apWithBoss(() => ({
        prefId:     window.apPreferredId('warrior', window.apSituationNow()),
        weaponDice: (wpn && wpn.dmgDice) || (typeof playerStats !== 'undefined' ? playerStats.dmgDice : null),
        skillDice:  (CLASS_SKILL_DICTS.warrior['strong-cleave'] || {}).dmgDice,
        none: window.__apWithMap(null,  () => window.__apSample(cs, { target: target }, N)).share,
        pref: window.__apWithMap(saved, () => window.__apSample(cs, { target: target }, N)).share,
      }));
    }, AP_N);

    check('(1c-0) 前提: 指定が強斬りに解決し、強斬り (2d8) の期待値が今の武器より厳密に大きい',
      s1c.prefId === 'strong-cleave' && diceEV(s1c.skillDice) > diceEV(s1c.weaponDice),
      'prefId=' + JSON.stringify(s1c.prefId) + ' 技=' + s1c.skillDice + '(EV ' + diceEV(s1c.skillDice) + ')'
        + ' 武器=' + s1c.weaponDice + '(EV ' + diceEV(s1c.weaponDice) + ')');
    check('(1c-1) 前提: 指定なしで 通常攻撃 と 強斬り のシェアが一致し 鉄壁の構え だけ低い (上限に張り付いている証拠)',
      Math.abs(s1c.none['normal'] - s1c.none['strong-cleave']) <= 0.03
        && s1c.none['iron-guard'] < s1c.none['normal'] - 0.05,
      'normal=' + s1c.none['normal'].toFixed(4) + ' cleave=' + s1c.none['strong-cleave'].toFixed(4)
        + ' guard=' + s1c.none['iron-guard'].toFixed(4));
    check('(1c) LEADER_W_MAX に張り付く候補でもシェアが上がる (罠 §2-4 の本丸)',
      s1c.pref['strong-cleave'] > s1c.none['strong-cleave'] + 0.05,
      '指定なし=' + s1c.none['strong-cleave'].toFixed(4) + ' → 指定あり=' + s1c.pref['strong-cleave'].toFixed(4));

    // ── (1d) RNG パリティ (driver_leader_ai G2 と同じ測り方) ─────────────
    const s1d = await idxPage.evaluate(() => {
      leaderClassKey = 'warrior';
      encounterRound = 1;
      hp = maxHp;
      const target = window.__apMkTarget({ hp: 20, maxHp: 40, def: { name: 'ボス', isBoss: true, hp: 40 } });
      const real = Math.random;
      let n = 0;
      Math.random = function () { n++; return real.apply(this, arguments); };
      const out = {};
      try {
        window.__apWithBoss(() => {
          out.prefId = window.apPreferredId('warrior', window.apSituationNow());
          for (const cs of [['normal'], ['normal', 'strong-cleave'],
                            ['normal', 'strong-cleave', 'iron-guard', 'morale']]) {
            n = 0;
            window.pickLeaderAction(cs, { target: target });
            out['n' + cs.length] = n;
          }
        });
      } finally { Math.random = real; }
      return out;
    });
    check('(1d) RNG パリティ: pickLeaderAction 1 回あたり Math.random ちょうど 1 回',
      s1d.prefId === 'strong-cleave' && s1d.n1 === 1 && s1d.n2 === 1 && s1d.n4 === 1,
      '倍率が乗る指定=' + JSON.stringify(s1d.prefId) + ' 候補1=' + s1d.n1 + ' 候補2=' + s1d.n2 + ' 候補4=' + s1d.n4);

    await idxPage.close();

    console.log('\n--- (§2) 仲間: 先出しが効き、指定外は不変 ---');
    const allyPage = await openIndexPage(browser, 'autoplay=30&diag=1', AP_SEED_ALLY);
    await allyPage.evaluate(AP_ALLY_HELPERS);

    const seamOk = await allyPage.evaluate(() => ({
      hasRun:   typeof window.__apAllyRun === 'function',
      hasTry:   typeof window.apTryPreferred === 'function',
      hasExec:  typeof window.executeSkillOn === 'function',
      logIsArr: Array.isArray(window.__apLog) || window.__apLog === undefined,
      mageBoss: window.apPreferredId('mage', 'boss'),
      rogueBoss: window.apPreferredId('rogue', 'boss'),
    }));
    check('(2-装置) apTryPreferred / executeSkillOn が実在し、仲間の指定が解決している',
      seamOk.hasRun && seamOk.hasTry && seamOk.hasExec
        && seamOk.mageBoss === AP_SEED_ALLY.mage.boss && seamOk.rogueBoss === AP_SEED_ALLY.rogue.boss,
      JSON.stringify(seamOk));

    // ── (2a) 魔法使い: threatScore の梯子を素通りできているか ──────────────────
    //   equip = [fire-bolt, magic-missile, fireball, ice-storm] / 敵 HP 10 → threatScore ≤ 25。
    //   梯子は 32/30/25/25/20 の閾値をどれも満たさず fallbackOrder の先頭 = ice-storm へ落ちる。
    //   ⭐ つまり **指定なしでは fireball が 1 回も出ない盤面**。ここで fireball が出れば
    //      「梯子を素通りした」ことの直接証拠になる。
    const MAGE_N = 300;
    const MAGE_STUBS = ['allyMagicMissile', 'allyFireBolt', 'allySleep', 'allyArcaneShield',
                        'allyFireball', 'allyLightningBolt', 'allyConeOfCold', 'allyBurningHands', 'allyIceStorm'];
    const mageCfg = {
      classKey: 'mage', ai: 'mageAI', n: MAGE_N, bossHp: 10, dx: 96, stubs: MAGE_STUBS,
      equipped: ['fire-bolt', 'magic-missile', 'fireball', 'ice-storm'],
      slots: { 'fire-bolt': 9, 'magic-missile': 9, 'fireball': 9, 'ice-storm': 9 },
    };
    const mageNone = await allyPage.evaluate((c) => window.__apAllyRun(Object.assign({}, c, { map: null })), mageCfg);
    const magePref = await allyPage.evaluate((c, m) => window.__apAllyRun(Object.assign({}, c, { map: m })), mageCfg, AP_SEED_ALLY);
    const mageFbNone = (mageNone.tally.allyFireball || 0) / MAGE_N;
    const mageFbPref = (magePref.tally.allyFireball || 0) / MAGE_N;
    check('(2a-0) 母集団: 指定なしでは 300 回すべて梯子の結論 (ice-storm) に落ち、fireball が 0 回',
      (mageNone.tally.allyIceStorm || 0) === MAGE_N && mageFbNone === 0,
      '指定なしの内訳 = ' + JSON.stringify(mageNone.tally));
    check('(2a) 魔法使い仲間 boss=fireball で fireball のシェアが上がる (threatScore の梯子を素通り)',
      mageFbPref > mageFbNone + 0.2,
      '指定なし=' + mageFbNone.toFixed(3) + ' → 指定あり=' + mageFbPref.toFixed(3)
        + '  指定ありの内訳 = ' + JSON.stringify(magePref.tally));
    check('(2a-2) 先出しが外れた手番は従来の連鎖 (ice-storm) へ落ちている (手番を潰していない)',
      (magePref.tally['(none)'] || 0) === 0
        && (magePref.tally.allyFireball || 0) + (magePref.tally.allyIceStorm || 0) === MAGE_N,
      JSON.stringify(magePref.tally));

    // ── (2b) 盗賊 (確率ゲート 0 本 = 完全に決定論) でも先出しが効くか ───────────
    //   敵は隣接 (dist=1)。rogueAI の ① 毒塗り短剣が無条件で先に決まる盤面で、
    //   ③ 投げナイフ (dist 2〜3 が条件なので **絶対に選ばれない**) を指定する。
    const ROGUE_N = 300;
    const ROGUE_STUBS = ['allyPoisonBlade', 'allyShadowStep', 'allyThrownDagger', 'allySmokeBomb',
                         'allyLucky', 'allyEvasion'];
    const rogueCfg = {
      classKey: 'rogue', ai: 'rogueAI', n: ROGUE_N, bossHp: 10, dx: 96, stubs: ROGUE_STUBS,
      equipped: ['poison-blade', 'thrown-dagger', 'smoke-bomb', 'lucky', 'evasion'], slots: {},
    };
    const rogueNone = await allyPage.evaluate((c) => window.__apAllyRun(Object.assign({}, c, { map: null })), rogueCfg);
    const roguePref = await allyPage.evaluate((c, m) => window.__apAllyRun(Object.assign({}, c, { map: m })), rogueCfg, AP_SEED_ALLY);
    const rgTdNone = (rogueNone.tally.allyThrownDagger || 0) / ROGUE_N;
    const rgTdPref = (roguePref.tally.allyThrownDagger || 0) / ROGUE_N;
    check('(2b-0) 母集団: 指定なしでは 300 回すべて 毒塗り短剣 で、投げナイフは 0 回',
      (rogueNone.tally.allyPoisonBlade || 0) === ROGUE_N && rgTdNone === 0,
      '指定なしの内訳 = ' + JSON.stringify(rogueNone.tally));
    check('(2b) 盗賊 (確率ゲート 0 本) でも先出しが効く',
      rgTdPref > rgTdNone + 0.2,
      '指定なし=' + rgTdNone.toFixed(3) + ' → 指定あり=' + rgTdPref.toFixed(3)
        + '  指定ありの内訳 = ' + JSON.stringify(roguePref.tally));

    // ── (0c) 母集団ガード: 計測シームが実際に捕まえているか ────────────────────
    //   ⭐⭐⭐ ここが 0 のまま §2 が緑になるのが最悪の空振り。
    const seamCount = await allyPage.evaluate(() => ({
      total: (window.__apLog || []).length,
      byId: (window.__apLog || []).reduce((m, r) => { m[r.classKey + '/' + r.skillId] = (m[r.classKey + '/' + r.skillId] || 0) + 1; return m; }, {}),
    }));
    check('(0c) 計測シームが executeSkillOn を 1 回以上捕まえている (ログが空でない)',
      seamCount.total > 0, 'n=' + seamCount.total + ' ' + JSON.stringify(seamCount.byId));
    check('(0c-2) 捕まえた呼び出しがすべて仲間経路 (isLeader=false) で、指定した技だけ',
      await allyPage.evaluate((seed) => (window.__apLog || []).every(r =>
        r.isLeader === false && seed[r.classKey] && seed[r.classKey].boss === r.skillId), AP_SEED_ALLY),
      JSON.stringify(seamCount.byId));

    // ── (2c) 指定外の非退行: apGateP は「上げるだけ」で「下げない」 ─────────────
    //   ⚠ N2 (Math.max → Math.min) はここで赤くなる。
    const GATE_BASES = [0.3, 0.35, 0.4, 0.5, 0.6, 0.7];
    const g2c = await allyPage.evaluate((bases) => {
      const unit = { classKey: 'cleric' };
      return window.__apWithBoss(() => {
        const out = { sit: window.apSituationNow(), apP: window.AP_P, none: [], pref: [], other: [] };
        window.__apWithMap(null, () => { for (const b of bases) out.none.push(window.apGateP(unit, 'bless', b)); });
        window.__apWithMap({ cleric: { general: null, mob: null, boss: 'bless', travel: null } }, () => {
          for (const b of bases) out.pref.push(window.apGateP(unit, 'bless', b));
          for (const b of bases) out.other.push(window.apGateP(unit, 'striking', b));
        });
        return out;
      });
    }, GATE_BASES);
    check('(2c-0) 母集団: AP_P が最大の base (0.7) より大きい = 引き上げが実際に起きる帯にいる',
      g2c.sit === 'boss' && g2c.apP > Math.max.apply(null, GATE_BASES),
      'sit=' + g2c.sit + ' AP_P=' + g2c.apP + ' base 最大=' + Math.max.apply(null, GATE_BASES));
    check('(2c-1) 指定なしのとき 20 箇所の base 値 (0.3/0.35/0.4/0.5/0.6/0.7) が厳密にそのまま返る',
      GATE_BASES.every((b, i) => g2c.none[i] === b),
      JSON.stringify(g2c.none));
    check('(2c-2) 指定ありのとき Math.max(base, AP_P) と厳密に一致する (上げるだけで下げない)',
      GATE_BASES.every((b, i) => g2c.pref[i] === Math.max(b, g2c.apP)),
      '実測=' + JSON.stringify(g2c.pref) + ' 期待=' + JSON.stringify(GATE_BASES.map(b => Math.max(b, g2c.apP))));
    check('(2c-3) 指定した技以外は 1 ビットも動かない (同じ職の別の技は base のまま)',
      GATE_BASES.every((b, i) => g2c.other[i] === b),
      JSON.stringify(g2c.other));

    // ── (2d) 戦士の仲間 — AI 分岐が無いので技は 1 つも出ない ───────────────────
    const d1 = await allyPage.evaluate((m) => window.__apAllyRun({
      classKey: 'warrior', ai: 'allyAttackTurn', n: 5, bossHp: 10, dx: 96,
      stubs: ['allyBasicAttack'], equipped: ['strong-cleave'], slots: {}, map: m,
    }), AP_SEED_ALLY);
    check('(2d-1) 戦士の仲間の手番 (allyAttackTurn) では executeSkillOn が 1 回も呼ばれない',
      d1.seamDelta === 0 && (d1.tally.allyBasicAttack || 0) === 5,
      'executeSkillOn 呼び出し増分=' + d1.seamDelta + ' 内訳=' + JSON.stringify(d1.tally));
    const d2 = await allyPage.evaluate(async (m) => {
      const prevE = enemies, prevI = encounterEnemyIndices, prevA = encounterActive, prevM = actionPriorityMap;
      const savedPSA = window.playerSingleAttack, savedEWS = window.executeWarriorSkill;
      let fired = [];
      window.playerSingleAttack = async function () { fired.push('playerSingleAttack'); };
      window.executeWarriorSkill = async function () { fired.push('executeWarriorSkill'); };
      try {
        actionPriorityMap = m;
        const ally = window.__apMkAlly('warrior', ['strong-cleave'], {});
        enemies = [window.__apMkBoss(ally, {})]; encounterEnemyIndices = [0]; encounterActive = true;
        const before = (window.__apLog || []).length;
        const r = await window.apTryPreferred(ally);
        return { r: r, fired: fired, seamDelta: (window.__apLog || []).length - before };
      } finally {
        window.playerSingleAttack = savedPSA; window.executeWarriorSkill = savedEWS;
        enemies = prevE; encounterEnemyIndices = prevI; encounterActive = prevA; actionPriorityMap = prevM;
      }
    }, AP_SEED_ALLY);
    check('(2d-2) 直に apTryPreferred(戦士の仲間) を呼んでも false が返り、技も通常攻撃も暴発しない',
      d2.r === false && d2.fired.length === 0 && d2.seamDelta === 1,
      '返り=' + d2.r + ' 実行された物=' + JSON.stringify(d2.fired)
        + ' (executeSkillOn までは届いてリーダー限定ガードで止まった: 増分=' + d2.seamDelta + ')');

    await allyPage.close();

    // ── (2e) 確率ゲート 20 本が漏れなくラップされているか (配信バイトを直接数える) ──
    //   ⚠ 実装から数字を写してくるのではなく、「仲間 AI の中に裸の確率ゲートが
    //     1 本も残っていない」を見る。1 本でも取りこぼせばここが赤くなる。
    {
      const src = FROZEN['/index.html'].toString('utf8');
      const s = src.indexOf('async function clericAI(ally) {');
      const e = src.indexOf('async function executeWarriorSkill(');
      const region = (s >= 0 && e > s) ? src.slice(s, e) : '';
      const all     = (region.match(/Math\.random\(\) </g) || []).length;
      const wrapped = (region.match(/Math\.random\(\) < apGateP\(ally,/g) || []).length;
      check('(2e) 仲間 AI (clericAI〜elfAI) の確率ゲート 20 本がすべて apGateP でラップされている',
        region.length > 0 && all === 20 && wrapped === 20,
        'ゲート総数=' + all + ' / ラップ済=' + wrapped + ' (裸で残り=' + (all - wrapped) + ')');
    }

    console.log('\n--- (§3) 道中詠唱 ---');
    pending('(3a) 僧侶仲間 travel=bless が探索フェーズ中に発動する', '項目④ (STEP5) 未実装');
    pending('(3b) 敵が idle しかいない間は一度も発動しない', '項目④ (STEP5) 未実装');
    pending('(3c) 1 回の接敵で 2 回以上は撃たない (ラッチ)', '項目④ (STEP5) 未実装');
    pending('(3d) travel に battle-roar を手で書き込んでも発動しない (2 重ガード)', '項目④ (STEP5) 未実装');

    console.log('\n--- (§4) バフ退避 (罠 §2-5) ---');
    pending('(4a) 戦闘開始時に主人公と仲間で atkBonusRemaining>0 が一致する', '項目④ (STEP6) 未実装');
    pending('(4b) 道中詠唱をしていない戦闘では開始時の playerBuffs が全部 0', '項目④ (STEP6) 未実装');

    console.log('\n--- (§5) 撤退スイッチ ?actionpri=0 ---');
    pending('(5a) index.html?actionpri=0 で apPreferredId が null を返す', '項目④ (STEP7) 未実装');
    pending('(5b) tavern.html?actionpri=0 で #actionPrioritySection 非表示 + 保存値は残る', '項目④ (STEP7) 未実装');

    /* ════════════════════════════════════════════════════════════════════
     * §6 — 酒場 UI (本項目の担当)
     * ════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§6-装置) 母集団ガード ---');
    const page = await openPrepScreen(browser, { name: 'desktop', width: 1280, height: 900 });

    const seams = await page.evaluate(() => ({
      hasSituations: typeof AP_SITUATIONS !== 'undefined' && Array.isArray(AP_SITUATIONS),
      situationKeys: (typeof AP_SITUATIONS !== 'undefined' ? AP_SITUATIONS : []).map(s => s.key),
      travelIds:     (typeof TRAVEL_CASTABLE_IDS !== 'undefined') ? TRAVEL_CASTABLE_IDS.slice() : null,
      hasRender:     typeof renderActionPriority === 'function',
      apKeys:        Object.keys((selection && selection.actionPriority) || {}),
      apShape:       Object.keys(((selection && selection.actionPriority) || {}).mage || {}),
      heroLv:        getLevelFromXP(inventory.xp),
      sectionExists: !!document.getElementById('actionPrioritySection'),
      // 「道中に選べる ID」が本当に呪文 (mpCost>0) で、呪文職のプールに実在するか
      travelIdFacts: ((typeof TRAVEL_CASTABLE_IDS !== 'undefined') ? TRAVEL_CASTABLE_IDS : []).map(id => {
        for (const slot of PARTY_SLOTS) {
          const hit = (slot.skillPool || []).find(sk => sk.id === id);
          if (hit) return { id, classKey: slot.classKey, mpCost: hit.mpCost || 0 };
        }
        return { id, classKey: null, mpCost: 0 };
      }),
    }));
    check('(S1) AP_SITUATIONS / TRAVEL_CASTABLE_IDS / renderActionPriority が裸の識別子で読める',
      seams.hasSituations && Array.isArray(seams.travelIds) && seams.hasRender && seams.sectionExists,
      JSON.stringify({ sit: seams.hasSituations, travel: !!seams.travelIds, render: seams.hasRender, dom: seams.sectionExists }));
    check('(S2) AP_SITUATIONS の 4 状況が general/mob/boss/travel',
      setEq(seams.situationKeys, SITUATIONS) && seams.situationKeys.length === 4,
      JSON.stringify(seams.situationKeys));
    check('(S3) TRAVEL_CASTABLE_IDS が §2-6 の全数 10 件と集合として一致',
      Array.isArray(seams.travelIds) && seams.travelIds.length === 10 && setEq(seams.travelIds, EXPECT_TRAVEL_IDS),
      'n=' + (seams.travelIds || []).length + ' ' + JSON.stringify(seams.travelIds));
    // ⭐ 2 経路目: 「呪文スロットを消費する呪文だけ」を **本番のスキル定義から** 検算する。
    //    1戦1回スキル (battle-roar 等 = mpCost 無し) が紛れ込んだらここが赤くなる。
    const badTravel = (seams.travelIdFacts || []).filter(f => !(f.mpCost > 0) || ['cleric', 'mage', 'elf'].indexOf(f.classKey) < 0);
    check('(S4) TRAVEL_CASTABLE_IDS の全件が「呪文スロットを消費する呪文 (mpCost>0)」で呪文職のプールに実在',
      badTravel.length === 0, badTravel.length ? JSON.stringify(badTravel) : '10/10 OK');
    check('(S5) selection.actionPriority が 6 職 × 4 枠で初期化されている',
      setEq(seams.apKeys, CLASS_KEYS) && setEq(seams.apShape, SITUATIONS),
      JSON.stringify(seams.apKeys) + ' / mage=' + JSON.stringify(seams.apShape));
    check('(S6) 主人公 Lv がスキル枠 3 の帯にいる (外した技を戻せる = (6c) の後片付けが成立する)',
      seams.heroLv >= 5, 'Lv=' + seams.heroLv);

    // 6 職ぶんの観測
    const obs = {};
    for (const ck of CLASS_KEYS) obs[ck] = await readClass(page, ck);

    check('(S7) 母集団: 6 職すべてで #apRows に select が 4 個ある',
      CLASS_KEYS.every(ck => obs[ck].selectCount === 4),
      CLASS_KEYS.map(ck => ck + ':' + obs[ck].selectCount).join(' '));
    // ⚠⚠ (6b) が空振りしない証明。「装備していない技」が 1 つも無いなら包含は自明で無意味。
    const notEquipped = CLASS_KEYS.map(ck => ({
      ck, n: obs[ck].poolIds.filter(id => obs[ck].equippedByData.indexOf(id) < 0).length,
    }));
    check('(S8) 母集団: 6 職すべてで「装備していない技」が 1 つ以上実在する ((6b) が自明でない証明)',
      notEquipped.every(x => x.n > 0), notEquipped.map(x => x.ck + ':' + x.n).join(' '));
    check('(S9) 母集団: 6 職すべてで「枠に入れている技」が 1 つ以上ある (候補が空でないこと)',
      CLASS_KEYS.every(ck => obs[ck].equippedByData.length > 0),
      CLASS_KEYS.map(ck => ck + ':' + obs[ck].equippedByData.length).join(' '));
    check('(S10) #apHint が「傾向」であることを明示している',
      /傾向/.test(obs.warrior.hintText) && /射程|スロット/.test(obs.warrior.hintText),
      JSON.stringify(obs.warrior.hintText));

    console.log('\n--- (§6) 酒場 UI ---');

    // ── (6a) 4 枠の存在と、道中行の出し分け ──────────────────────────────
    const missing = [];
    for (const ck of CLASS_KEYS) {
      for (const sit of ['general', 'mob', 'boss']) {
        const r = obs[ck].rows[sit];
        if (!r.exists || !r.visible) missing.push(ck + '/' + sit + (r.exists ? '(非表示)' : '(不在)'));
      }
    }
    check('(6a-1) apSel_<classKey>_<sit> が general/mob/boss は 6 職すべてで存在し可視',
      missing.length === 0, missing.length ? missing.join(' ') : '18/18 OK');

    const travelSeen = CLASS_KEYS.filter(ck => obs[ck].rows.travel.exists && obs[ck].rows.travel.visible);
    check('(6a-2) 道中の行は僧侶・魔法使い・エルフのみ表示 (戦士・ドワーフ・盗賊は非表示)',
      setEq(travelSeen, EXPECT_TRAVEL_CLASSES),
      '表示された職 = ' + JSON.stringify(travelSeen) + ' / 期待 ' + JSON.stringify(EXPECT_TRAVEL_CLASSES));
    // ⭐ 2 経路目: 「道中の候補が実在するか」を元データ (枠 ∩ 道中許可リスト) から独立に決めて突合
    const travelByData = CLASS_KEYS.filter(ck =>
      obs[ck].equippedByData.some(id => EXPECT_TRAVEL_IDS.indexOf(id) >= 0));
    check('(6a-3) 2 経路突合: 「枠 ∩ 道中許可リストが非空」の職と、実際に道中行が出た職が一致',
      setEq(travelByData, travelSeen),
      'データ由来 = ' + JSON.stringify(travelByData) + ' / 描画 = ' + JSON.stringify(travelSeen));

    // ── (6b) 装備していない技は選択肢に出ない ────────────────────────────
    const leak = [];
    const wholePool = [];
    for (const ck of CLASS_KEYS) {
      for (const sit of SITUATIONS) {
        const r = obs[ck].rows[sit];
        if (!r.exists) continue;
        const vals = r.values.filter(v => v !== '');
        const allowed = (sit === 'travel')
          ? obs[ck].equippedByData.filter(id => EXPECT_TRAVEL_IDS.indexOf(id) >= 0)
          : obs[ck].equippedByData;
        const extra = vals.filter(v => allowed.indexOf(v) < 0);
        if (extra.length) leak.push(ck + '/' + sit + ' -> ' + JSON.stringify(extra));
        if (vals.length && setEq(vals, obs[ck].poolIds)) wholePool.push(ck + '/' + sit);
      }
    }
    check('(6b-1) 装備していない技が選択肢に 1 つも出ていない (24 枠すべて)',
      leak.length === 0, leak.length ? leak.join(' ') : '漏れ 0');
    check('(6b-2) 選択肢が skillPool 丸ごとになっている枠が 1 つも無い (絞り込みが実際に効いている)',
      wholePool.length === 0, wholePool.length ? wholePool.join(' ') : '0 枠');
    check('(6b-3) 先頭の選択肢は必ず「おまかせ」(value="")',
      CLASS_KEYS.every(ck => SITUATIONS.every(sit => {
        const r = obs[ck].rows[sit];
        return !r.exists || (r.values[0] === '' && r.labels[0] === 'おまかせ');
      })), 'ok');

    // ── (6c) 装備を外すと「おまかせ」へ戻り、localStorage も null ────────
    const set6c = await page.evaluate(() => {
      window.__equipTV.setTab('warrior');
      const sel = document.getElementById('apSel_warrior_general');
      if (!sel) return { ok: false, why: 'apSel_warrior_general が無い' };
      const values = Array.prototype.map.call(sel.options, o => o.value);
      if (values.indexOf('strong-cleave') < 0) return { ok: false, why: '強斬りが候補に無い', values };
      sel.__apMark = 'before-change';                       // ⛔ 再帰再描画の検出用マーカー
      sel.value = 'strong-cleave';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const after = document.getElementById('apSel_warrior_general');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        ok: true,
        mem: selection.actionPriority.warrior.general,
        ls: (ls && ls.warrior) ? ls.warrior.general : '(キー無し)',
        sameNode: after === sel,
        markSurvived: after ? after.__apMark === 'before-change' : false,
        selValue: after ? after.value : null,
      };
    });
    check('(6c-1) change で selection と localStorage の両方に skillId が入る',
      set6c.ok && set6c.mem === 'strong-cleave' && set6c.ls === 'strong-cleave',
      JSON.stringify(set6c));
    // ⛔ 依頼書の禁止事項「change で renderCharLoadout() を再帰で呼ばない」の機械検査。
    //    再帰すると select が作り直されてノードが入れ替わり、プルダウンが選べなくなる。
    check('(6c-2) change ハンドラが select を作り直していない (再帰再描画をしていない)',
      set6c.sameNode === true && set6c.markSurvived === true && set6c.selValue === 'strong-cleave',
      'sameNode=' + set6c.sameNode + ' mark=' + set6c.markSurvived + ' value=' + set6c.selValue);

    const drop6c = await page.evaluate(() => {
      // 本番の経路で装備を外す (.skillItem のクリック → saveSelections + renderCharLoadout)
      const slot = PARTY_SLOTS.find(s => s && s.classKey === 'warrior');
      const skills = slot.skillPool.filter(sk => !sk.mpCost);
      const idx = skills.findIndex(sk => sk.id === 'strong-cleave');
      const items = document.querySelectorAll('#skillList .skillItem');
      if (idx < 0 || !items[idx]) return { ok: false, idx, n: items.length };
      const before = (selection.partySkills.warrior || []).slice();
      items[idx].click();
      const sel = document.getElementById('apSel_warrior_general');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        ok: true, before, after: (selection.partySkills.warrior || []).slice(),
        selValue: sel ? sel.value : '(select 無し)',
        selValues: sel ? Array.prototype.map.call(sel.options, o => o.value) : [],
        mem: selection.actionPriority.warrior.general,
        ls: (ls && ls.warrior) ? ls.warrior.general : '(キー無し)',
      };
    });
    check('(6c-3) 前提: 本番の経路で 強斬り の装備が実際に外れた',
      drop6c.ok && drop6c.before.indexOf('strong-cleave') >= 0 && drop6c.after.indexOf('strong-cleave') < 0,
      JSON.stringify({ before: drop6c.before, after: drop6c.after }));
    check('(6c-4) 装備を外して再描画すると select が「おまかせ」へ戻り、候補からも消える',
      drop6c.selValue === '' && drop6c.selValues.indexOf('strong-cleave') < 0,
      'value=' + JSON.stringify(drop6c.selValue) + ' values=' + JSON.stringify(drop6c.selValues));
    check('(6c-5) selection と localStorage の値も null へ書き戻されている (古い ID を黙って残さない)',
      drop6c.mem === null && drop6c.ls === null,
      'mem=' + JSON.stringify(drop6c.mem) + ' ls=' + JSON.stringify(drop6c.ls));

    // 後片付け: 強斬り を戻す (以降の観測を汚さない)
    const restore = await page.evaluate(() => {
      const slot = PARTY_SLOTS.find(s => s && s.classKey === 'warrior');
      const skills = slot.skillPool.filter(sk => !sk.mpCost);
      const idx = skills.findIndex(sk => sk.id === 'strong-cleave');
      const items = document.querySelectorAll('#skillList .skillItem');
      if (idx >= 0 && items[idx]) items[idx].click();
      return (selection.partySkills.warrior || []).slice();
    });
    check('(6c-6) 後片付け: 強斬り を再装備できた (Lv 帯とスキル枠の前提が生きている)',
      restore.indexOf('strong-cleave') >= 0, JSON.stringify(restore));

    await page.close();

    // ── (6d) compact (iPhone 幅) で横スクロールしない ───────────────────
    const pageM = await openPrepScreen(browser, { name: 'iphone', width: 390, height: 844 });
    const m = await pageM.evaluate(() => {
      const out = {};
      const keys = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
      for (const ck of keys) {
        window.__equipTV.setTab(ck);
        const rows = document.getElementById('apRows');
        const sec  = document.getElementById('actionPrioritySection');
        out[ck] = {
          selects: document.querySelectorAll('#apRows select').length,
          scrollW: rows ? rows.scrollWidth : -1,
          clientW: rows ? rows.clientWidth : -1,
          secScrollW: sec ? sec.scrollWidth : -1,
          secClientW: sec ? sec.clientWidth : -1,
        };
      }
      return out;
    });
    const mKeys = Object.keys(m);
    check('(6d-0) 母集団: iPhone 幅でも 6 職すべてで #apRows に select が 4 個ある',
      mKeys.every(ck => m[ck].selects === 4), mKeys.map(ck => ck + ':' + m[ck].selects).join(' '));
    check('(6d-1) 母集団: #apRows が実際に幅を持って描かれている (0 幅で自明に緑にならない)',
      mKeys.every(ck => m[ck].clientW > 50), mKeys.map(ck => ck + ':' + m[ck].clientW).join(' '));
    const over = mKeys.filter(ck => m[ck].scrollW > m[ck].clientW);
    check('(6d-2) compact (390px) で #apRows が横スクロールを起こさない (scrollWidth <= clientWidth)',
      over.length === 0,
      over.length ? over.map(ck => ck + ' ' + m[ck].scrollW + '>' + m[ck].clientW).join(' ')
                  : mKeys.map(ck => ck + ' ' + m[ck].scrollW + '<=' + m[ck].clientW).join(' '));
    const secOver = mKeys.filter(ck => m[ck].secScrollW > m[ck].secClientW);
    check('(6d-3) compact で #actionPrioritySection 自体も横スクロールを起こさない',
      secOver.length === 0,
      secOver.length ? secOver.map(ck => ck + ' ' + m[ck].secScrollW + '>' + m[ck].secClientW).join(' ') : 'OK');

    await pageM.close();
  } catch (e) {
    check('(FATAL) ドライバが最後まで走った', false, e && e.message);
  }

  await browser.close();
  srv.close();

  const realErrs = pageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode|play\(\) failed|NotAllowedError/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok && !r.pending).length;
  const pend   = results.filter(r => r.pending).length;
  console.log('\n[driver] RESULT: PASSED ' + passed + ' / FAILED ' + failed + ' / PENDING ' + pend);
  if (failed) console.log('[driver] FAILED: ' + results.filter(r => !r.ok && !r.pending).map(r => r.name).join(' | '));
  if (pend)   console.log('[driver] PENDING: §2〜§5 は後続項目 (③④) の担当 — 黙って緑にしていない');

  if (NEGATIVE) {
    // 負のコントロールの判定。⚠ 1 本でも「注入したのに緑」があれば exit 1 (空振りの証拠)。
    let negNg = 0;
    const judge = (label, prefix, note) => {
      const grp  = results.filter(r => r.name.indexOf(prefix) === 0 && !r.pending);
      const reds = grp.filter(r => !r.ok);
      console.log('\n[driver] 負のコントロール ' + label + ' の判定 (' + note + '): '
        + reds.length + '/' + grp.length + ' 本が赤');
      if (grp.length === 0) {
        console.log('[driver] NG: ' + note + ' の assert が 1 本も走っていません (母集団ゼロ)');
        negNg++; return;
      }
      if (reds.length === 0) {
        console.log('[driver] NG: ' + label + ' を注入したのに ' + note + ' が緑のまま = テストが空振りしています');
        negNg++; return;
      }
      console.log('[driver] OK: ' + label + ' で ' + note + ' が赤くなった: ' + reds.map(r => r.name).join(' , '));
    };
    // ⚠ '(1c)' で始まる名前は本体 1 本だけ ((1c-0)/(1c-1) は前提ガードなので N1 では赤くならない)
    judge('N1', '(1c)', '(1c) 倍率がクランプに食われていないか');
    // ⚠ (2c-1) は「指定なし」の検査なので N2 でも緑のまま。赤くなるのは (2c-0)/(2c-2)。
    judge('N2', '(2c', '(2c) apGateP が上げるだけで下げていないか');
    judge('N3', '(6b-', '(6b) 装備していない技が候補に出ないか');
    process.exit(negNg === 0 ? 0 : 1);
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
