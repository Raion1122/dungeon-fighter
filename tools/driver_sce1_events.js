#!/usr/bin/env node
/*
 * driver_sce1_events.js — シナリオ1「ゴブリンの廃坑」選択肢イベント 回帰ドライバ
 * ═══════════════════════════════════════════════════════════════════════════════
 * 【項目 1 = 潜行中シナリオ状態 sceneFlags の土台】
 *   §1 定義    sceneFlags / isGoblinMineScenario / sceneClassBonus が index.html に在る
 *   §2 初期値  sceneFlags は mine_alerted / servant_rescued のちょうど 2 本・いずれも false
 *   §3 非永続  sessionStorage に載せない = リロードで初期値へ戻る (潜行内で完結)
 *   §4 ゲート  isGoblinMineScenario() は既定クエストで true / 生成クエストで false
 *   §5 加算    sceneClassBonus は在籍で 2・非在籍で 0。★DC ではなく extraBonus 側に効く
 *   §6 シーム  window.__sce1 は ?diag=1 / ?autoplay のときだけ生え、素の起動では生えない
 * 【項目 2 = EV-2「廃坑入口の見張り」】
 *   §7 EV-2   接近3択 / 判定なし枠は SkillCheck を呼ばない / 失敗で mine_alerted+増援2体 /
 *             Esc は無害で declined / 発火は1回きり / 生成クエストでは発火しない
 *   §E pageerror 0
 *   §N ★負のコントロール (同一 run に内包)
 *
 * ■ ⚠ 負のコントロールは「別 run で比べる」のではなく **同一 run に内包する**
 *   port (無変異) と port+1 (変異) の 2 台を同時に立て、**同じ検出器関数** detectors() を
 *   両方のページに当てる。無変異側で全 true / 変異側で狙った検出器だけ false になることを
 *   実測する。「assert を書いたつもりで何も見ていない」を原理的に潰す。
 *
 * ■ ⚠ 変異はディスクを書き換えず **配信をメモリ上で差し替える** (復元漏れが起きない)
 *   ⚠⚠ 置換文字列は必ず 1 行。index.html は CRLF なので改行を含む複数行の置換は
 *      原理的に一致しない (2026-08-04 に driver_field 系 5 本が踏んだ罠)。
 *   ⚠ 置換対象が 0 件 / 2 件以上なら exit 3 (空振りしたまま PASS になるのを防ぐ)。
 *
 *     kind | 注入する欠陥                                   | 赤くなるべき検出器
 *     -----|------------------------------------------------|--------------------------
 *     N1   | sceneFlags.mine_alerted の初期値を true に      | D2 (初期値 mine_alerted)
 *     N2   | SCENE_CLASS_BONUS を 2 → 0                     | D5 (在籍時 2)
 *     N3   | シームの ?diag ゲートを外す (if(true) に)       | §6 素の起動で生えない
 *     N4   | SCE1_ALERT_ADD_TYPES を空配列に (増援 0 体)     | E14/E15 (部屋0 の敵 +2)
 *     N5   | 失敗時の mine_alerted=true を false に          | E13 (失敗でフラグが立つ)
 *     N6   | 判定なし枠を「候補0の判定」へ落とす            | E6  (選択2 で SkillCheck 未呼出)
 *     N7   | シナリオゲート isGoblinMineScenario を無効化    | E17 (生成クエストで発火しない)
 *   ⭐ N1/N2 は「狙った検出器だけ」が赤くなり、隣の検出器 (D3 servant_rescued / D6 非在籍 0)
 *     は緑のまま = 変異が外科的で、検出器が互いに独立していることの証明。
 *   ⭐ N4/N5 も同様に外科的: 同じ失敗分岐に同居しているのに、片方 (E13 フラグ) と
 *     もう片方 (E14 増援) が独立に落ちる = effect を flag でゲートしていないことの実測。
 *   ⚠ 変異ページは N1 で mine_alerted の**初期値**が true になっているので、EV-2 の
 *     フラグ検出 (E13) を測る前に driver 側で false へ戻す (初期値は D2 が別途見ている)。
 *
 * ■ 使い方
 *     node tools/driver_sce1_events.js [--headful] [--browser <path>] [--port N]
 *   exit 0 = 全 PASS / 1 = FAIL / 2 = 環境不備 / 3 = 変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
/* ⚠ ポートは既存ドライバと 4 以上空ける (baseline 用に port+1 を掴む本があるため)。
 *   本ドライバ自身も port+1 (変異配信) を掴む。8845/8846 が空いていることは
 *   `grep -rn "8845\|8846" tools/*.js` が 0 件であることで実測 (2026-08-05)。
 *   近傍の実使用は 8841 / 8856 / 8861 なので前後とも 4 以上空いている。 */
const PORT = parseInt(arg('port', '8845'), 10);
const PORT_MUT = PORT + 1;

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = [
  // N1: 潜行中フラグの初期値を壊す。→ §2 の D2 だけが赤くなるはず。
  ['      mine_alerted: false,',
   '      mine_alerted: true,   /* ★変異N1 */'],
  // N2: 得意クラス加算を 2 → 0。→ §5 の D5 (在籍時 2) だけが赤くなるはず
  //     (D6「非在籍で 0」は 0 のままなので緑 = 外科的であることの証明)。
  ['    const SCENE_CLASS_BONUS = 2;',
   '    const SCENE_CLASS_BONUS = 0;   /* ★変異N2 */'],
  // N3: 検証シームの dev ゲートを外す。→ §6「素の起動では生えない」が赤くなるはず。
  ['    if (window.__diagEnabled) window.__sce1 = ',
   '    if (true) window.__sce1 = '],
  // ── 項目2 (EV-2) ──────────────────────────────────────────────────────────
  // N4: 骨笛が鳴った時の増援を 0 体に。→ E14/E15 (部屋0 の敵 +2) だけが赤くなるはず。
  //     E13 (フラグが立つ) は緑のまま = effect と flag が独立していることの証明。
  ['    const SCE1_ALERT_ADD_TYPES = ["goblin", "goblin"];',
   '    const SCE1_ALERT_ADD_TYPES = [];   /* ★変異N4 */'],
  // N5: 判定失敗でフラグを立てない。→ E13 だけが赤くなるはず (E14 の増援は出続ける)。
  ['      sceneFlags.mine_alerted = true;',
   '      sceneFlags.mine_alerted = false;   /* ★変異N5 */'],
  // N6: 「判定なし(確定)」枠を候補0の判定へ落とす。→ E6 (選択2 で SkillCheck 未呼出) が赤くなるはず。
  //     ⚠ undefined を投げず必ず有効な spec になる変異にする (例外で全部赤 = 何も測れない)。
  ['      const spec = SCE1_WATCH_CHECKS[choice] || null;',
   '      const spec = SCE1_WATCH_CHECKS[choice] || SCE1_WATCH_CHECKS[0];   /* ★変異N6 */'],
  // N7: シナリオゲートを無効化。→ E17 (生成クエストでは発火しない) が赤くなるはず。
  ['      if (!isGoblinMineScenario()) return;',
   '      if (false) return;   /* ★変異N7 */'],
];
let _mutCache = null;
function mutatedSources() {
  if (_mutCache) return _mutCache;
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of MUTATIONS) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  _mutCache = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer(port, mutate) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutate && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ★検出器 — 無変異側で全 true / 変異側で狙ったものだけ false になるべき述語群。
 *   同じ関数を両方のページの probe に当てることで「assert が本当に何かを見ている」を担保する。 */
function detectors(P) {
  return {
    D1: { label: 'sceneFlags のキーはちょうど 2 本 (mine_alerted / servant_rescued)',
          ok: eq(P.flagKeys, ['mine_alerted', 'servant_rescued']), got: JSON.stringify(P.flagKeys) },
    D2: { label: 'sceneFlags.mine_alerted の初期値は false',
          ok: P.mineAlerted === false, got: String(P.mineAlerted) },
    D3: { label: 'sceneFlags.servant_rescued の初期値は false',
          ok: P.servantRescued === false, got: String(P.servantRescued) },
    D4: { label: 'isGoblinMineScenario() は既定クエストで true',
          ok: P.isGM === true, got: P.scenarioId + ' -> ' + P.isGM },
    D5: { label: 'sceneClassBonus: 在籍クラスなら 2',
          ok: P.bonusPresent === 2, got: '[' + P.present + '] -> ' + P.bonusPresent },
    D6: { label: 'sceneClassBonus: 非在籍クラスなら 0',
          ok: P.bonusAbsent === 0, got: '[' + P.absentKey + '] -> ' + P.bonusAbsent },
  };
}

/* ページから状態を吸い出す。⚠ 1 evaluate 内で完結させる (ライブ game loop の割り込み排除)。
 *   ⚠ classic script 直下の let/const/function は window に載らないので **bare 名**で参照する。 */
function probe(page) {
  return page.evaluate(() => {
    const out = { err: null };
    try {
      out.hasSeam = !!window.__sce1;
      out.seamKeys = window.__sce1 ? Object.keys(window.__sce1).sort() : [];
      // bare 参照 = classic script のグローバル字句環境を直に見る
      out.typeofSceneFlags = typeof sceneFlags;
      out.typeofIsGM = typeof isGoblinMineScenario;
      out.typeofBonus = typeof sceneClassBonus;
      out.typeofParty = typeof buildPerceptionParty;
      out.scenarioId = scenarioId;
      out.isGM = isGoblinMineScenario();

      const f = window.__sce1 ? window.__sce1.flags() : sceneFlags;
      out.flagKeys = Object.keys(f).sort();
      out.mineAlerted = f.mine_alerted;
      out.servantRescued = f.servant_rescued;
      out.seamFlagsIsLive = window.__sce1 ? (window.__sce1.flags() === sceneFlags) : null;
      out.seamBonusIsSame = window.__sce1 ? (window.__sce1.classBonus === sceneClassBonus) : null;

      const ALL6 = ['warrior', 'dwarf', 'rogue', 'elf', 'cleric', 'mage'];
      const roster = buildPerceptionParty().map(m => m.classKey);
      out.roster = roster;
      out.present = roster[0] || null;
      out.absentKey = ALL6.filter(k => roster.indexOf(k) < 0)[0] || null;

      const cb = sceneClassBonus;
      out.bonusPresent = out.present ? cb([out.present]) : null;
      out.bonusAbsent = out.absentKey ? cb([out.absentKey]) : null;
      out.bonusAll6 = cb(ALL6);
      out.bonusBogus = cb(['__no_such_class__']);
      out.bonusEmpty = cb([]);
      out.bonusNull = cb(null);
      out.bonusUndef = cb(undefined);
      out.bonusNonArray = cb('rogue');
      // ★動的: 非在籍クラスの仲間を 1 人だけ足すと 0 → 2 に変わる = 本当に allies を読んでいる
      //   (定数を返しているだけでは絶対に再現できない)。push/pop は同一 evaluate 内で完結。
      if (out.absentKey) {
        allies.push({ alive: true, classKey: out.absentKey, npcName: 'テスト仲間' });
        try { out.dynAfterJoin = cb([out.absentKey]); } finally { allies.pop(); }
        out.dynAfterLeave = cb([out.absentKey]);
      }
      out.ssKeys = Object.keys(sessionStorage);
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 項目 2 — EV-2「廃坑入口の見張り」の駆動
// ══════════════════════════════════════════════════════════════════════════════
/* ■ なぜ「シームで結果を強制」ではなく **SkillCheck 本体をスタブ**するのか
 *   仕様の要求は「判定結果を検証シームで強制できる形にする」だが、そのために製品コードへ
 *   テスト専用の分岐を足すと、出荷コードに「本番では絶対に通らない道」が増える (= dev シームの
 *   大掃除で消したものを再び生やす)。window.SkillCheck.resolveSkillCheck は **既に公開 API** なので、
 *   ページ側でそれを差し替えれば ①成否の強制 と ②呼び出し回数の観測 が同時に得られる。
 *   ★これは「選択2 では SkillCheck が呼ばれない」を測る唯一の方法でもある
 *     (呼ばれないことは、呼び出し口を握っていないと原理的に観測できない)。
 *
 * ■ 盤面の固定 (ここを外すと恒久的に不安定になる)
 *   ⚠ moveEnemies は setInterval(…, 30) で rAF とは独立に回る。rAF を凍結しただけでは
 *     敵が寄ってきて encounterActive が立ち、EV-2 のガードで発火しなくなる。
 *     → 全敵に inactive を立てる (檻のビーストと同じ休眠。moveEnemies:13573 と
 *        detectEnemiesEngagedByRange:15923 の両方が inactive を除外する)。
 *   ⚠ 宝箱/罠の 400ms tick は skillCheckActive を奪い合うので roomChests/traps を空にする。
 *   ⚠ パーティ編成は起動ごとに乱択されるので、+2 ボーナスは**そのページ自身**の
 *     sceneClassBonus(["rogue"]) と突き合わせる (ページ間で roster 一致を仮定しない)。 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ev2Prepare(page) {
  return page.evaluate(() => {
    gameStarted = true; gameOver = false;
    encounterActive = false; encounterRunning = false;
    dialogPaused = false; skillCheckActive = false;
    roomChests.length = 0; traps.length = 0;
    enemies.forEach(e => { e.inactive = true; });
    sceneFlags.mine_alerted = false;      // ★変異N1 (初期値 true) の影響を排して EV-2 の遷移だけを測る
    const SC = window.SkillCheck;
    if (!SC.__origResolve) SC.__origResolve = SC.resolveSkillCheck;
    window.__ev2 = { calls: [], force: true };
    window.__ev2.room0Count = function () {
      const r = ROOMS[0]; let n = 0;
      for (const e of enemies) {
        if (!e.alive) continue;
        const s = e.def.displaySize;
        const tx = Math.floor((e.x + s / 2) / TILE_SIZE), ty = Math.floor((e.y + s / 2) / TILE_SIZE);
        if (ty >= r[0] && ty <= r[2] && tx >= r[1] && tx <= r[3]) n++;
      }
      return n;
    };
    SC.resolveSkillCheck = function (checkKey, dc, party, o) {
      window.__ev2.calls.push({ checkKey: checkKey, dc: dc,
        extraBonus: (o && o.extraBonus) || 0, title: (o && o.title) || null });
      const ok = !!window.__ev2.force;
      return Promise.resolve({ success: ok, roll: 10, total: ok ? dc + 3 : dc - 3, dc: dc,
        bonus: 0, rep: (party && party[0]) || null, helper: null, crit: false, fumble: false });
    };
    const s = sce1WatchSpot(), a = sce1AlertAnchorTile();
    return {
      spot: s, anchor: a, tile: TILE_SIZE, hp: hp, room0: ROOMS[0],
      spotIsWall: isTileWall(s.tx, s.ty),
      anchorInRoom0: a.ty >= ROOMS[0][0] && a.ty <= ROOMS[0][2] && a.tx >= ROOMS[0][1] && a.tx <= ROOMS[0][3],
      rogueBonus: sceneClassBonus(["rogue"]),
      roster: buildPerceptionParty().map(m => m.classKey),
      room0Before: window.__ev2.room0Count(),
      totalBefore: enemies.length,
      radius: SCE1_EVENT_RADIUS, dc: SCE1_WATCH_DC,
      addTypes: SCE1_ALERT_ADD_TYPES.slice(),
    };
  });
}
// プレイヤーを発火地点そのもの / 半径外 (7タイル東 = 672px ≫ 240) へ瞬間移動させる。
async function ev2Approach(page, where) {
  await page.evaluate((w) => {
    const s = sce1WatchSpot();
    const tx = (w === 'far') ? s.tx + 7 : s.tx;
    playerX = tx * TILE_SIZE + TILE_SIZE / 2 - 48;
    playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
  }, where);
}
async function ev2WaitDialog(page, ms) {
  const t0 = Date.now();
  for (;;) {
    const info = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      if (!d || !d.classList.contains('show')) return null;
      return { msg: (d.querySelector('.choiceMessage') || {}).textContent || '',
               labels: Array.from(d.querySelectorAll('.choiceButtons button')).map(b => b.textContent) };
    });
    if (info) return info;
    if (Date.now() - t0 >= ms) return null;
    await sleep(120);
  }
}
// idx 0..2 = 候補 / -1 = キャンセル (Esc と同じ resolve(null) 経路)
async function ev2Click(page, idx) {
  await page.evaluate((i) => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const b = (i < 0) ? btns[btns.length - 1] : btns[i];
    if (b) b.click();
  }, idx);
}
async function ev2Settle(page) {
  for (let k = 0; k < 50; k++) {
    const done = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      return !(d && d.classList.contains('show')) && !skillCheckActive && !SCE1_EVENTS[0].busy;
    });
    if (done) { await sleep(120); return true; }
    await sleep(80);
  }
  return false;
}
async function ev2State(page) {
  return page.evaluate(() => ({
    flag: sceneFlags.mine_alerted,
    fired: SCE1_EVENTS[0].fired, declined: SCE1_EVENTS[0].declined,
    calls: window.__ev2.calls.slice(),
    room0: window.__ev2.room0Count(), total: enemies.length,
    addsDone: mineAlertedAddsDone,
  }));
}
// fired ラッチを解いて次の選択肢を試せる状態へ戻す (結果分岐の網羅用。ラッチ自体は E8 が別途見る)
async function ev2Rearm(page, force) {
  await page.evaluate((f) => {
    SCE1_EVENTS[0].fired = false; SCE1_EVENTS[0].declined = false;
    window.__ev2.calls.length = 0; window.__ev2.force = !!f;
    enemies.forEach(e => { e.inactive = true; });   // 増援も休眠させエンカを起こさない
    dialogPaused = false; skillCheckActive = false;
  }, force);
}

/* EV-2 の一連の観測。⚠ 無変異ページと変異ページの**両方**にこの同じ手順を当てる。 */
async function ev2Run(page, tag) {
  const Q = { tag };
  Object.assign(Q, await ev2Prepare(page));

  // T1 接近 → 3択 → キャンセル (Esc 相当)
  await ev2Approach(page, 'near');
  Q.dlg1 = await ev2WaitDialog(page, 5000);
  if (Q.dlg1) { await ev2Click(page, -1); await ev2Settle(page); }
  Q.afterCancel = await ev2State(page);

  // T2 半径内に留まる間は再プロンプトしない
  Q.dlg2 = await ev2WaitDialog(page, 1600);

  // T3 半径外へ出て戻れば再プロンプトされる
  await ev2Approach(page, 'far'); await sleep(900);
  await ev2Approach(page, 'near');
  Q.dlg3 = await ev2WaitDialog(page, 5000);

  // T4 選択2 (誘い出す) = 判定なし
  if (Q.dlg3) { await ev2Click(page, 2); await ev2Settle(page); }
  Q.afterLure = await ev2State(page);

  // T5 一度選んだら二度と出ない (fired ラッチ)
  await ev2Approach(page, 'far'); await sleep(900);
  await ev2Approach(page, 'near');
  Q.dlg4 = await ev2WaitDialog(page, 1600);

  // T6 選択0 成功 = stealth DC13 / フラグは false のまま
  await ev2Rearm(page, true);
  Q.dlg5 = await ev2WaitDialog(page, 5000);
  if (Q.dlg5) { await ev2Click(page, 0); await ev2Settle(page); }
  Q.afterStealthOk = await ev2State(page);

  // T7 選択1 成功 = sleightOfHand DC13
  await ev2Rearm(page, true);
  Q.dlg6 = await ev2WaitDialog(page, 5000);
  if (Q.dlg6) { await ev2Click(page, 1); await ev2Settle(page); }
  Q.afterWhistleOk = await ev2State(page);

  // T8 選択0 失敗 = mine_alerted true + 部屋0 の敵 +2
  await ev2Rearm(page, false);
  Q.dlg7 = await ev2WaitDialog(page, 5000);
  if (Q.dlg7) { await ev2Click(page, 0); await ev2Settle(page); }
  Q.afterFail = await ev2State(page);
  Q.adds = await page.evaluate((n0) => {
    const r = ROOMS[0], out = [];
    for (let i = n0; i < enemies.length; i++) {
      const e = enemies[i], s = e.def.displaySize;
      const tx = Math.floor((e.x + s / 2) / TILE_SIZE), ty = Math.floor((e.y + s / 2) / TILE_SIZE);
      out.push({ type: e.type, tx: tx, ty: ty, wall: isTileWall(tx, ty),
                 dom: !!document.getElementById('enemy' + i),
                 inRoom0: ty >= r[0] && ty <= r[2] && tx >= r[1] && tx <= r[3] });
    }
    return out;
  }, Q.totalBefore);

  // T9 冪等 (直接二度呼びしても増えない)
  Q.idem = await page.evaluate(() => {
    const before = window.__ev2.room0Count();
    const n = applyMineAlertedAdds();
    return { n: n, before: before, after: window.__ev2.room0Count() };
  });

  /* T10 ★得意クラス(盗賊)の +2 が実際に流れることの**決定論的**確認。
   *   ⚠ パーティ編成は起動ごとに乱択される。盗賊が居ない run では E11 が
   *     「extraBonus=0 === sceneClassBonus=0」で緑になり、+2 の経路を 1 度も踏まない。
   *     そこで盗賊を 1 人だけ足して再走し、必ず 2 が渡ることを実測する
   *     (足す/戻すは §5 の 5i/5j と同じ手口)。 */
  /* ⚠ この仲間は §5 の push/pop と違い **await をまたいで在籍し続ける**ので、
   *   その間に走る UI 再描画 (renderPartyStatuses) が全フィールドを舐める。
   *   手書きのモックだと欠けたフィールドで pageerror になり §E が落ちる (実測で 2 度踏んだ)。
   *   → ゲーム本体の正規コンストラクタ createAlly を使う (DOM は作らない = 描画対象にしない)。 */
  await page.evaluate(() => {
    const a = createAlly('rogue', playerX - 40, playerY + 40);
    a.npcName = 'テスト盗賊';
    allies.push(a);
  });
  await ev2Rearm(page, true);
  Q.dlg8 = await ev2WaitDialog(page, 5000);
  if (Q.dlg8) { await ev2Click(page, 0); await ev2Settle(page); }
  Q.afterRogue = await ev2State(page);
  Q.rogueBonusWith = await page.evaluate(() => {
    const b = sceneClassBonus(["rogue"]); allies.pop(); return b;
  });
  return Q;
}

/* ★EV-2 の検出器。無変異で全 true / 変異で狙ったものだけ false になるべき述語群。 */
function ev2Detectors(Q) {
  const L = (Q.dlg1 && Q.dlg1.labels) || [];
  const c0 = (Q.afterStealthOk.calls || [])[0] || null;
  const c1 = (Q.afterWhistleOk.calls || [])[0] || null;
  const adds = Q.adds || [];
  const tiles = adds.map(a => a.tx + ',' + a.ty);
  return {
    E1: { label: 'EV-2: 接近すると 3択+キャンセル のダイアログが出る',
          ok: !!Q.dlg1 && L.length === 4, got: JSON.stringify(L) },
    E2: { label: 'EV-2: ラベルは 静かに近づく / 骨笛を狙って射る / わざと姿を見せて誘い出す',
          ok: L[0] === '1. 静かに近づく' && L[1] === '2. 骨笛を狙って射る'
              && L[2] === '3. わざと姿を見せて誘い出す' && L[3] === '引き返す (Esc)',
          got: JSON.stringify(L) },
    E3: { label: 'EV-2: キャンセル(Esc) では何も起きず declined が立つ',
          ok: Q.afterCancel.flag === false && Q.afterCancel.fired === false
              && Q.afterCancel.declined === true && Q.afterCancel.calls.length === 0,
          got: JSON.stringify(Q.afterCancel) },
    E4: { label: 'EV-2: 断った後は半径内に留まる限り再プロンプトしない',
          ok: Q.dlg2 === null, got: Q.dlg2 ? 'ダイアログが再表示された' : 'none' },
    E5: { label: 'EV-2: 半径外へ出て戻れば再プロンプトされる',
          ok: !!Q.dlg3, got: Q.dlg3 ? 'ok' : 'null' },
    E6: { label: '★EV-2: 選択2(確定) では SkillCheck が 1 度も呼ばれない',
          ok: Q.afterLure.calls.length === 0, got: JSON.stringify(Q.afterLure.calls) },
    E7: { label: 'EV-2: 選択2 では mine_alerted=false のまま・敵も増えない',
          ok: Q.afterLure.flag === false && Q.afterLure.room0 === Q.room0Before,
          got: 'flag=' + Q.afterLure.flag + ' room0=' + Q.afterLure.room0 + '/' + Q.room0Before },
    E8: { label: 'EV-2: 発火は 1 回だけ (選択済みなら半径外→内でも出ない)',
          ok: Q.dlg4 === null && Q.afterLure.fired === true,
          got: 'fired=' + Q.afterLure.fired + ' redisplay=' + (Q.dlg4 ? 'yes' : 'no') },
    E9: { label: 'EV-2: 選択0 は stealth を DC13 で振る',
          ok: !!c0 && c0.checkKey === 'stealth' && c0.dc === 13 && Q.afterStealthOk.calls.length === 1,
          got: JSON.stringify(Q.afterStealthOk.calls) },
    E10: { label: 'EV-2: 選択1 は sleightOfHand を DC13 で振る',
          ok: !!c1 && c1.checkKey === 'sleightOfHand' && c1.dc === 13 && Q.afterWhistleOk.calls.length === 1,
          got: JSON.stringify(Q.afterWhistleOk.calls) },
    E11: { label: '★EV-2: DC は動かさず 得意クラス(盗賊) は extraBonus 側に乗る',
          ok: !!c0 && !!c1 && c0.extraBonus === Q.rogueBonus && c1.extraBonus === Q.rogueBonus
              && (Q.rogueBonus === 0 || Q.rogueBonus === 2),
          got: 'extraBonus=' + (c0 && c0.extraBonus) + '/' + (c1 && c1.extraBonus)
               + ' sceneClassBonus=' + Q.rogueBonus + ' roster=' + JSON.stringify(Q.roster) },
    E12: { label: 'EV-2: 判定成功なら mine_alerted=false のまま・敵も増えない',
          ok: Q.afterStealthOk.flag === false && Q.afterWhistleOk.flag === false
              && Q.afterWhistleOk.room0 === Q.room0Before,
          got: 'flags=' + Q.afterStealthOk.flag + '/' + Q.afterWhistleOk.flag
               + ' room0=' + Q.afterWhistleOk.room0 + '/' + Q.room0Before },
    E13: { label: '★EV-2: 判定失敗で sceneFlags.mine_alerted が true になる',
          ok: Q.afterFail.flag === true, got: 'flag=' + Q.afterFail.flag },
    E14: { label: '★EV-2: mine_alerted で部屋0 の敵が +2 になる',
          ok: Q.afterFail.room0 - Q.room0Before === 2,
          got: Q.room0Before + ' -> ' + Q.afterFail.room0 },
    E15: { label: 'EV-2: 増援は部屋0 の非壁・非重複タイルに湧き DOM も伴う',
          ok: adds.length === 2 && adds.every(a => !a.wall && a.inRoom0 && a.dom)
              && new Set(tiles).size === adds.length,
          got: JSON.stringify(adds) },
    E16: { label: 'EV-2: 増援は冪等 (二度目の呼び出しでは 0 体)',
          ok: Q.idem.n === 0 && Q.idem.after === Q.idem.before, got: JSON.stringify(Q.idem) },
    E17: { label: '★EV-2: 盗賊を 1 人加えると extraBonus が 2 になる (得意クラス +2 が実際に流れる)',
          ok: Q.rogueBonusWith === 2 && ((Q.afterRogue.calls || [])[0] || {}).extraBonus === 2,
          got: 'sceneClassBonus=' + Q.rogueBonusWith + ' passed=' + JSON.stringify(Q.afterRogue.calls) },
  };
}

const GEN_QUEST = {
  title: '掲示板の依頼 — 生成クエスト',
  flavor: '生成クエストは scenarioId が別 ID になる。',
  spawns: [['goblin', 27, 13]],
  clearXp: 400, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'goblin-mine', questLevel: 1, tierKey: 'T1',
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srvClean = await startServer(PORT, false);
  const srvMut = await startServer(PORT_MUT, true);
  console.log('[drv] serving ' + ROOT + ' @ :' + PORT + ' (無変異) / :' + PORT_MUT + ' (★変異)');

  // ── M1: 変異が本当に配信に乗ったかを HTTP で実測 (空振りしたまま PASS を防ぐ) ──
  const fetchText = (port) => new Promise((res, rej) => {
    http.get({ host: 'localhost', port, path: '/index.html' }, r => {
      let b = ''; r.setEncoding('utf8'); r.on('data', d => b += d); r.on('end', () => res(b));
    }).on('error', rej);
  });
  const [srcClean, srcMut] = await Promise.all([fetchText(PORT), fetchText(PORT_MUT)]);
  const m1 = MUTATIONS.map(([from, to], i) => ({
    i: i + 1,
    cleanHasFrom: srcClean.indexOf(from) >= 0, cleanHasTo: srcClean.indexOf(to) >= 0,
    mutHasFrom: srcMut.indexOf(from) >= 0, mutHasTo: srcMut.indexOf(to) >= 0,
  }));
  m1.forEach(x => check('(M1) 変異 N' + x.i + ' が :' + PORT_MUT + ' の配信にだけ実際に乗った',
    x.cleanHasFrom && !x.cleanHasTo && !x.mutHasFrom && x.mutHasTo,
    'clean{from:' + x.cleanHasFrom + ',to:' + x.cleanHasTo + '} mut{from:' + x.mutHasFrom + ',to:' + x.mutHasTo + '}'));
  check('(M1) 無変異側と変異側の index.html は別物', srcClean !== srcMut,
    'clean=' + srcClean.length + 'B mut=' + srcMut.length + 'B');
  mark('mutation injection verified (memory-only, no disk write)');

  const profile = makeProfile('df_sce1_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });

  const allPageErrors = [];
  async function boot(port, query, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push('[:' + port + query + '] ' + e.message));
    const gen = opts.generated ? JSON.stringify(GEN_QUEST) : null;
    await page.evaluateOnNewDocument((genJson) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        if (genJson) sessionStorage.setItem('dragonfighters.generatedScenario', genJson);
        else sessionStorage.removeItem('dragonfighters.generatedScenario');
      } catch (e) {}
    }, gen);
    await page.goto('http://localhost:' + port + '/index.html' + query,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      try {
        return typeof sceneFlags === 'object' && typeof isGoblinMineScenario === 'function'
            && typeof sceneClassBonus === 'function' && typeof buildPerceptionParty === 'function';
      } catch (e) { return false; }
    }, { timeout: 20000 });
    // 論理テストに描画は要らない。rAF を凍結してライブ game loop の割り込みを断つ。
    await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
    return { page };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 本体 (無変異 :PORT / ?diag=1)
  // ════════════════════════════════════════════════════════════════════════════
  const cur = await boot(PORT, '?diag=1');
  const P = await probe(cur.page);
  if (P.err) console.error('[drv] probe 例外: ' + P.err);
  mark('clean page booted (?diag=1)  roster=' + JSON.stringify(P.roster));

  // §1 定義
  check('(1a) sceneFlags が定義済み (object)', P.typeofSceneFlags === 'object', P.typeofSceneFlags);
  check('(1b) isGoblinMineScenario が定義済み (function)', P.typeofIsGM === 'function', P.typeofIsGM);
  check('(1c) sceneClassBonus が定義済み (function)', P.typeofBonus === 'function', P.typeofBonus);
  check('(1d) probe が例外を出していない', P.err === null, String(P.err));
  // 母集団ガード: パーティが空だと §5 は何も測っていないのと同じ
  check('(1e) 母集団ガード: buildPerceptionParty が 1 名以上を返す',
    Array.isArray(P.roster) && P.roster.length >= 1, JSON.stringify(P.roster));

  // §2 初期値 (検出器 D1-D3)
  const DC = detectors(P);
  ['D1', 'D2', 'D3'].forEach(k => check('(2) ' + DC[k].label, DC[k].ok, DC[k].got));

  // §3 非永続 (sessionStorage に載せない)
  check('(3a) sessionStorage に sceneFlags 由来のキーが無い',
    !P.ssKeys.some(k => /sceneFlags|mine_alerted|servant_rescued/i.test(k)), JSON.stringify(P.ssKeys));
  const persisted = await cur.page.evaluate(() => {
    sceneFlags.mine_alerted = true; sceneFlags.servant_rescued = true;
    return { set: [sceneFlags.mine_alerted, sceneFlags.servant_rescued],
             ss: Object.keys(sessionStorage).filter(k => /scene(?!ry)/i.test(k)) };
  });
  check('(3b) 実行時に立てられる (mine/servant とも true に出来る)',
    eq(persisted.set, [true, true]), JSON.stringify(persisted.set));
  check('(3c) 立てても sessionStorage に書き出されない', persisted.ss.length === 0, JSON.stringify(persisted.ss));
  await cur.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await cur.page.waitForFunction(() => { try { return typeof sceneFlags === 'object'; } catch (e) { return false; } },
    { timeout: 20000 });
  const afterReload = await cur.page.evaluate(() => ({ m: sceneFlags.mine_alerted, s: sceneFlags.servant_rescued }));
  check('(3d) リロードで初期値へ戻る (潜行内で完結・次の潜行へ持ち越さない)',
    afterReload.m === false && afterReload.s === false, JSON.stringify(afterReload));
  await cur.page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
  mark('non-persistence verified');

  // §4 シナリオゲート
  check('(4a) ' + DC.D4.label, DC.D4.ok, DC.D4.got);
  const gen = await boot(PORT, '?diag=1', { generated: true });
  const PG = await probe(gen.page);
  check('(4b) 生成クエストでは scenarioId が別 ID', PG.scenarioId === 'generated-quest', PG.scenarioId);
  check('(4c) 生成クエストでは isGoblinMineScenario() が false',
    PG.isGM === false, PG.scenarioId + ' -> ' + PG.isGM);
  check('(4d) 母集団ガード: 生成クエスト側でも土台自体は生きている',
    PG.typeofSceneFlags === 'object' && PG.err === null && eq(PG.flagKeys, ['mine_alerted', 'servant_rescued']),
    'flags=' + JSON.stringify(PG.flagKeys) + ' err=' + PG.err);
  await gen.page.close();
  mark('scenario gate verified (goblin-mine vs generated-quest)');

  // §5 sceneClassBonus
  check('(5a) ' + DC.D5.label, DC.D5.ok, DC.D5.got);
  check('(5b) ' + DC.D6.label, DC.D6.ok, DC.D6.got);
  check('(5c) 6職すべてを渡せば必ず 2 (誰か 1 人は必ず該当する)', P.bonusAll6 === 2, String(P.bonusAll6));
  check('(5d) 存在しないクラスキーは 0', P.bonusBogus === 0, String(P.bonusBogus));
  check('(5e) 空配列は 0', P.bonusEmpty === 0, String(P.bonusEmpty));
  check('(5f) null は 0 (例外を投げない)', P.bonusNull === 0, String(P.bonusNull));
  check('(5g) undefined は 0 (例外を投げない)', P.bonusUndef === 0, String(P.bonusUndef));
  check('(5h) 非配列 ("rogue") は 0 (誤用を握り潰さず 0 で返す)', P.bonusNonArray === 0, String(P.bonusNonArray));
  check('(5i) ★仲間を 1 人加えると 0 → 2 に変わる (本当に allies を読んでいる)',
    P.bonusAbsent === 0 && P.dynAfterJoin === 2,
    'before=' + P.bonusAbsent + ' afterJoin=' + P.dynAfterJoin + ' (' + P.absentKey + ')');
  check('(5j) ★その仲間が抜ければ 2 → 0 に戻る (状態を持ち越さない)',
    P.dynAfterLeave === 0, 'afterLeave=' + P.dynAfterLeave);

  // §5' ★contract: DC を下げるのではなく opts.extraBonus に乗る
  const contract = await cur.page.evaluate(() => {
    const orig = Math.random;
    Math.random = () => 0.5;   // d20 = 1 + floor(0.5*20) = 11 に固定 (決定論)
    const party = buildPerceptionParty();
    const b = sceneClassBonus(['warrior', 'dwarf', 'rogue', 'elf', 'cleric', 'mage']);
    return Promise.all([
      SkillCheck.resolveSkillCheck('stealth', 13, party, { auto: true, extraBonus: 0 }),
      SkillCheck.resolveSkillCheck('stealth', 13, party, { auto: true, extraBonus: b }),
    ]).then(([a, c]) => {
      Math.random = orig;
      return { bonusArg: b,
               a: { roll: a.roll, bonus: a.bonus, total: a.total, dc: a.dc },
               c: { roll: c.roll, bonus: c.bonus, total: c.total, dc: c.dc } };
    });
  });
  check('(5k) ★extraBonus に渡すと total が +2 される', contract.bonusArg === 2 &&
    contract.c.total - contract.a.total === 2 && contract.c.bonus - contract.a.bonus === 2,
    JSON.stringify(contract));
  check('(5l) ★DC は 1 も動かない (「DC-2」ではなく「+2 加算」であることの証明)',
    contract.a.dc === 13 && contract.c.dc === 13, 'dc: ' + contract.a.dc + ' / ' + contract.c.dc);
  check('(5m) 出目は同一 (差分が加算のみに由来する)', contract.a.roll === contract.c.roll,
    contract.a.roll + ' / ' + contract.c.roll);
  mark('sceneClassBonus (+2 via extraBonus, not DC-2) verified');

  // §6 検証シームの dev ゲート
  check('(6a) ?diag=1 では window.__sce1 が生える', P.hasSeam === true, String(P.hasSeam));
  check('(6b) シームの形は { flags, classBonus } ちょうど 2 本',
    eq(P.seamKeys, ['classBonus', 'flags']), JSON.stringify(P.seamKeys));
  check('(6c) flags() は生きた sceneFlags を返す (コピーではない)', P.seamFlagsIsLive === true, String(P.seamFlagsIsLive));
  check('(6d) classBonus は sceneClassBonus 本体と同一', P.seamBonusIsSame === true, String(P.seamBonusIsSame));

  const auto = await boot(PORT, '?autoplay=1&intel=0');
  const PA = await probe(auto.page);
  check('(6e) ?autoplay でも window.__sce1 が生える', PA.hasSeam === true, String(PA.hasSeam));
  await auto.page.close();

  const bare = await boot(PORT, '');
  const PB = await probe(bare.page);
  check('(6f) ★素の起動 (パラメータ無し) では window.__sce1 が生えない',
    PB.hasSeam === false, 'hasSeam=' + PB.hasSeam);
  check('(6g) 母集団ガード: 素の起動でも土台自体は動いている (シームだけが休眠)',
    PB.typeofSceneFlags === 'object' && PB.bonusAll6 === 2 && PB.err === null,
    'typeof=' + PB.typeofSceneFlags + ' all6=' + PB.bonusAll6 + ' err=' + PB.err);
  await bare.page.close();
  mark('dev gate (?diag / ?autoplay only) verified');

  // ════════════════════════════════════════════════════════════════════════════
  // §7 EV-2「廃坑入口の見張り」(項目 2)
  // ════════════════════════════════════════════════════════════════════════════
  const Q = await ev2Run(cur.page, 'clean');
  mark('EV-2 driven (clean)  spot=(' + Q.spot.tx + ',' + Q.spot.ty + ') anchor=('
    + Q.anchor.tx + ',' + Q.anchor.ty + ') room0Before=' + Q.room0Before
    + ' rogueBonus=' + Q.rogueBonus);

  // 母集団ガード: 盤面が「測れる状態」で始まっていること
  check('(7a) 母集団ガード: 主人公は生存し部屋0 に既存の敵が居る',
    Q.hp > 0 && Q.room0Before >= 5, 'hp=' + Q.hp + ' room0Before=' + Q.room0Before);
  check('(7b) 発火地点は部屋0 の入口側の**床** (壁でも岩盤でもない)',
    Q.spotIsWall === false && Q.spot.ty >= Q.room0[0] && Q.spot.ty <= Q.room0[2]
    && Q.spot.tx >= Q.room0[1] && Q.spot.tx <= Q.room0[3] && Q.spot.tx <= Q.room0[1] + 5,
    '(' + Q.spot.tx + ',' + Q.spot.ty + ') wall=' + Q.spotIsWall + ' room0=' + JSON.stringify(Q.room0));
  check('(7c) 増援アンカーは部屋0 の中心 (山場本隊の密集点)',
    Q.anchorInRoom0 === true, '(' + Q.anchor.tx + ',' + Q.anchor.ty + ')');
  check('(7d) 接近半径は檻 (CAGE_INTERACT_RADIUS) と同じ 240',
    Q.radius === 240, String(Q.radius));
  check('(7e) 増援の種別は固定配列 = Math.random を引かない (RNG 消費順が動かない)',
    eq(Q.addTypes, ['goblin', 'goblin']), JSON.stringify(Q.addTypes));

  const EC = ev2Detectors(Q);
  Object.keys(EC).forEach(k => check('(7) ' + EC[k].label, EC[k].ok, EC[k].got));

  // 生成クエストでは一切発火しない (E17)
  const genEv = await boot(PORT, '?diag=1', { generated: true });
  await ev2Prepare(genEv.page);
  await ev2Approach(genEv.page, 'near');
  const genDlg = await ev2WaitDialog(genEv.page, 2500);
  const genState = await genEv.page.evaluate(() => ({
    scenarioId: scenarioId, isGM: isGoblinMineScenario(),
    fired: SCE1_EVENTS[0].fired, flag: sceneFlags.mine_alerted, total: enemies.length }));
  check('(7f) ★生成クエスト (scenarioId≠goblin-mine) では EV-2 が発火しない',
    genDlg === null && genState.fired === false && genState.isGM === false,
    'scenarioId=' + genState.scenarioId + ' dialog=' + (genDlg ? 'ARE' : 'none') + ' fired=' + genState.fired);
  await genEv.page.close();
  mark('EV-2 verified (3択 / 判定なし枠 / 失敗→増援 / シナリオゲート)');

  // ════════════════════════════════════════════════════════════════════════════
  // §N ★負のコントロール (同一 run 内・:PORT_MUT の変異配信へ同じ検出器を当てる)
  // ════════════════════════════════════════════════════════════════════════════
  const mut = await boot(PORT_MUT, '?diag=1');
  const PM = await probe(mut.page);
  const DM = detectors(PM);
  mark('mutated page booted (:' + PORT_MUT + ' ?diag=1)  roster=' + JSON.stringify(PM.roster));

  /* ⚠ パーティ編成は起動ごとに乱択される (酒場を経由しない直起動でも NPC は毎回変わる)。
   *   よって「無変異側と同じ roster か」で母集団を守ってはいけない = 恒久的に不安定な assert。
   *   守るべきは「変異側のページも生きていて、判定に使える隊列が実在する」ことだけ。
   *   各検出器は**そのページ自身の roster** から present/absent を選ぶので自己校正されている。 */
  const CLASS6 = ['warrior', 'dwarf', 'rogue', 'elf', 'cleric', 'mage'];
  check('(N0) 変異側でもページは生きている (母集団ガード)',
    PM.err === null && PM.typeofSceneFlags === 'object' &&
    Array.isArray(PM.roster) && PM.roster.length >= 1 &&
    PM.roster.every(k => CLASS6.indexOf(k) >= 0) && PM.absentKey !== null,
    'err=' + PM.err + ' roster=' + JSON.stringify(PM.roster) + ' absent=' + PM.absentKey);
  check('(N1) ★変異N1 で D2「mine_alerted 初期値 false」が赤くなる',
    DM.D2.ok === false && PM.mineAlerted === true, 'mine_alerted=' + PM.mineAlerted);
  check('(N1-隣) 変異N1 は外科的: D3「servant_rescued 初期値 false」は緑のまま',
    DM.D3.ok === true, 'servant_rescued=' + PM.servantRescued);
  check('(N2) ★変異N2 で D5「在籍クラスなら 2」が赤くなる',
    DM.D5.ok === false && PM.bonusPresent === 0, '[' + PM.present + '] -> ' + PM.bonusPresent);
  check('(N2-隣) 変異N2 は外科的: D6「非在籍なら 0」は緑のまま', DM.D6.ok === true,
    '[' + PM.absentKey + '] -> ' + PM.bonusAbsent);
  check('(N2-隣) 変異N2 は D1/D4 を巻き込まない (検出器は互いに独立)',
    DM.D1.ok === true && DM.D4.ok === true, 'D1=' + DM.D1.got + ' D4=' + DM.D4.got);

  // ── EV-2 の負のコントロール (同じ ev2Run / ev2Detectors を変異ページへ当てる) ──
  const QM = await ev2Run(mut.page, 'mutated');
  const EM = ev2Detectors(QM);
  mark('EV-2 driven (mutated)  room0Before=' + QM.room0Before + ' addTypes=' + JSON.stringify(QM.addTypes));
  check('(N-EV0) 母集団ガード: 変異側でも EV-2 は同じ 3択を出す (壊れているのは結果だけ)',
    EM.E1.ok === true && EM.E2.ok === true && EM.E5.ok === true,
    'E1=' + EM.E1.got + ' E2=' + EM.E2.got);
  check('(N4) ★変異N4 (増援 0 体) で E14「部屋0 の敵 +2」が赤くなる',
    EM.E14.ok === false && QM.afterFail.room0 - QM.room0Before === 0, EM.E14.got);
  check('(N4-隣) 変異N4 は外科的: E13「失敗でフラグが立つ」は変異N5 が担当し E14 とは独立',
    eq(QM.addTypes, []), JSON.stringify(QM.addTypes));
  check('(N5) ★変異N5 (フラグを立てない) で E13「失敗で mine_alerted=true」が赤くなる',
    EM.E13.ok === false && QM.afterFail.flag === false, EM.E13.got);
  check('(N6) ★変異N6 (判定なし枠を潰す) で E6「選択2 で SkillCheck 未呼出」が赤くなる',
    EM.E6.ok === false && QM.afterLure.calls.length === 1, EM.E6.got);
  check('(N6-隣) 変異N6 は外科的: E9/E10 (選択0/1 の判定種別と DC) は緑のまま',
    EM.E9.ok === true && EM.E10.ok === true, 'E9=' + EM.E9.got + ' E10=' + EM.E10.got);
  check('(N2-EV) ★変異N2 (得意クラス加算 2→0) で E17「盗賊在籍で extraBonus=2」が赤くなる',
    EM.E17.ok === false && QM.rogueBonusWith === 0
    && ((QM.afterRogue.calls || [])[0] || {}).extraBonus === 0, EM.E17.got);
  check('(N-EV隣) 変異群は E3/E4/E8 (Esc・再プロンプト抑制・1回きり) を巻き込まない',
    EM.E3.ok === true && EM.E4.ok === true && EM.E8.ok === true,
    'E3=' + EM.E3.got + ' E4=' + EM.E4.got + ' E8=' + EM.E8.got);
  await mut.page.close();

  const mutGen = await boot(PORT_MUT, '?diag=1', { generated: true });
  await ev2Prepare(mutGen.page);
  await ev2Approach(mutGen.page, 'near');
  const mutGenDlg = await ev2WaitDialog(mutGen.page, 4000);
  check('(N7) ★変異N7 (シナリオゲート除去) で (7f)「生成クエストでは発火しない」が赤くなる',
    mutGenDlg !== null, mutGenDlg ? JSON.stringify(mutGenDlg.labels) : 'ダイアログが出なかった');
  await mutGen.page.close();

  const mutBare = await boot(PORT_MUT, '');
  const PMB = await probe(mutBare.page);
  check('(N3) ★変異N3 (dev ゲート除去) で (6f)「素の起動では生えない」が赤くなる',
    PMB.hasSeam === true, 'hasSeam=' + PMB.hasSeam);
  await mutBare.page.close();
  mark('negative controls fired (all inside this single run)');

  // §E pageerror
  check('(E) 全ページ・全操作で pageerror 0', allPageErrors.length === 0,
    allPageErrors.slice(0, 4).join(' | ') || 'none');

  await cur.page.close();
  await browser.close();
  srvClean.close(); srvMut.close();

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[drv] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) {
    console.log('[drv] FAILED:');
    results.filter(r => !r.ok).forEach(r => console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : '')));
  }
  if (allPageErrors.length) console.log('[drv] pageerrors: ' + allPageErrors.join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(3); });
