#!/usr/bin/env node
/*
 * driver_field_step6.js — 「地平線ビュー STEP6 = 移動デッドロック救済」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 6
 *
 * ■ 本体側の変更 (1箇所だけ)
 *   index.html firstTileStep(): 第1候補 aStar(..., avoidTiles) が null のときだけ
 *   第2候補 aStar(..., null) を引き、押しのけて通る。null 同士のときだけ従来どおり null。
 *   戦闘移動の3経路 (playerAdvanceOneTile / allyAdvanceTowardPoint / enemyAdvanceOneTile)
 *   は**すべて firstTileStep 1本に合流している**ので、この1箇所で3箇所ぶんを覆う。
 *   (S1) の静的 assert がその合流を毎回検算する。
 *
 * ■ ★主指標は CAN'T ADVANCE ではない
 *   enemyAdvanceOneTile の `let goalTX = pTX, goalTY = pTY;` が初期値であり、4近傍が
 *   全滅してもゴールは対象タイル自身へフォールバックする。aStar はゴールを通行可扱いに
 *   する [isBlocked の「ゴールは例外」] ので CAN'T ADVANCE には落ちず「対象へ押し込む」。
 *   → CAN'T ADVANCE は過少計上される。主指標は **切断イベント率**
 *      (帯の各列について全行が getUnitOccupiedTiles に含まれる列が1つでも在る標本の比率。
 *       STEP0 の測定項目5 と同一定義)。
 *
 * ■ 3部構成
 *   Part A [主]  帯幅{3,5} × 救済{なし,あり} の 2x2 マトリクス。
 *                in-page 決定論ターンシミュレータ (PT4+敵6+馬車・200手番×20試行)。
 *                実 firstTileStep / aStar / getUnitOccupiedTiles / mapData を呼ぶ。
 *                4アームすべて同一シード=同一初期配置なので、差分は救済の有無だけ。
 *   Part B [参考]  実プレイ (freeze/quiesce/setCam なし) を走らせ、STEP0 と同一の
 *                フレーム標本で切断率を採る。⚠️ **合否には使わない** (下記「受け入れ基準の
 *                差し替え」参照)。実機体感テストで「混雑して見えるか」を見る材料。
 *   Part C [非退行] 既存6シナリオを実プレイし、救済が**一度も発火しないこと**を実測する。
 *                発火 0 件 = 追加の aStar すら走っていない = 挙動もRNG消費も1バイト不変。
 *                ⚠ [#92 2026-10-13] Part C 本体は 90 秒(または gameOver)で必ず抜ける。
 *                「`?graph=auto` が entry から前進した」は**ここでは assert しない**(自然な前進の秒数と
 *                終了理由 `gameOver@27s` / `budget@90s` をログに出すだけ)。理由 = 森は 1 ノードに畳まれ
 *                entry の出口が 0 本、沼地/砦/神殿/竜は entry が敵 10〜11 体の大部屋で Lv1 の主人公が
 *                倒れる(砦は毎回 27 秒)= 前進が勝敗に依存して揺れていた。前進の装置は STEP2 で
 *                別ページ(entry の敵をテストダブルで倒してから測る)へ移した。
 *   装置 [#92]   runGraphAutoDevice。シナリオごとに別ページで `?graph=auto` を起動し、MutationObserver で
 *                `.exitArrow` / `#choiceDialog.show` を数えつつ、entry の非 passiveNpc の敵を倒して
 *                「矢印 0 で entry から前進したか」= (Cd-<sid>) を見る(イベントのダイアログは代役)。母集団は
 *                `RUN.byId[entry].exits` の実体(出口 0 本は母集団外ログ)、(Cd0) が空振りを止める。
 *                依頼書: 実装依頼書/2026-10-13_graph-auto-device.md
 *
 * ■ ★受け入れ基準の差し替え (2026-07-19)
 *   計画書 §4 STEP6 の旧基準「3行+救済ありで切断率 <1%」は**無効**として差し替えた。
 *   理由: 旧 <1% は STEP0 が**帯の出荷前**に採った数字 (0.13/2.26/4.34%)。当時ユニットは
 *   row 12-18 に散っており、帯3行(row13-15)内に居た割合は iphone_land で 66.3% だった。
 *   3行のうち1行でも空けば切断にならないので、散っている地図では構造的に低く出る。
 *   STEP1 で帯が出荷された今その地図は存在せず、帯内率は 99.4%。同定義でも母集団が別物。
 *   → **存在しない地図の基準に PASS/FAIL を出しても意味がない**ので基準ごと差し替える。
 *   新基準 = stuck === 0 (移動不能の直接測定)。救済は「切断列を減らす」のではなく
 *   「切断列を通れるようにする」修正なので、こちらが目的と一致する計器である。
 *   実測でも救済**なし**側が 23.0-30.5% であり、バー未達は救済のせいではない。
 *
 * ■ 「なし」アームは baseline worktree (既定 ad6f648 = STEP6 直前) から供給する。
 *   ⚠️ HEAD 固定の baseline は禁止 (「現在 vs 現在」の無意味な PASS に化けた前例あり)。
 *   ⚠️ 救済を「ドライバ側で再実装した firstTileStep」で代用しない (腐った鏡になる)。
 *   (S4) が baseline に救済が**入っていない**ことを確認する = assert 自体の有効性。
 *
 * ■ 帯幅 5 行は **配信ファイルの書き換え**で作る。
 *   `const FIELD_BAND_ROWS       = 3;` → `= 5;` を http サーバが応答時に置換する。
 *   mapData を後から手で塗るより厳密 (ROOMS/CORRIDORS 由来の列がそのまま生きる)。
 *   両ビルドに同じ置換を掛けるので比較は対称。
 *
 * ■ ビューポートは iphone_port / desktop のみ
 *   fieldHasSkyRoom(usableH) = usableH >= BAND_H + VERGE_H + SKY_MIN。
 *   3行なら 440 / 5行なら 632 が要る。iphone_land は usableH=217 なので**どちらでも幾何 OFF**
 *   = 帯が存在しない (従来マップのまま)。そこを測ると「別ゲームを測る」ことになる。
 *
 * 使い方:
 *   node tools/driver_field_step6.js [--headful] [--browser <path>] [--port N]
 *        [--baseline-rev ad6f648] [--trials 20] [--turns 200]
 *        [--skip-a] [--skip-b] [--skip-c] [--skip-device] [--budget-ms N] [--out <dir>]
 *        [--scenarios goblin-mine,orc-fort]   (Part C の切り分け専用。絞ったまま合否を語らない)
 *   node tools/driver_field_step6.js --negative [--port N] [--out <dir>] [--scenarios goblin-mine,orc-fort]
 *        [#92 STEP3] 装置ステージの負のコントロール(配信時の変異 noauto / notick + テストダブル停止 nokill)。
 *        Part A/B/C 本体は走らせない。3 本とも狙いどおり赤なら exit 0(`=== negative 3/3 ===`)。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8801'), 10);
const TRIALS = parseInt(arg('trials', '20'), 10);
const TURNS = parseInt(arg('turns', '200'), 10);
const BASELINE_REV = arg('baseline-rev', 'ad6f648');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_step6_baseline'));
const SKIP_A = flag('skip-a');
const SKIP_B = flag('skip-b');
const SKIP_C = flag('skip-c');
// [#92] 装置ステージだけを走らせるなら `--skip-a --skip-b --skip-c`。装置を外すなら `--skip-device`。
const SKIP_DEVICE = flag('skip-device');
/* [#92 STEP3] `--negative` = 負のコントロール。Part A/B/C 本体も静的スキャンも走らせず、装置ステージだけを
 * 変異ごとに走らせて「赤くなるべき節が赤になったか」を見る。`--scenarios` の既定はここだけ goblin-mine,orc-fort。 */
const NEGATIVE = flag('negative');
/* ⚠ 目印は index.html の 1 行内の部分文字列(CRLF なので改行を跨がない)。配信元でちょうど 1 回ヒットすることを
 *   変異の適用前に自己検査する(0 回 / 2 回以上なら変異そのものを赤 = 空振りの緑を作らない)。
 *   judge(d) は「その変異が狙った理由で赤くなったか」。素の合格条件 devicePass(d) が偽であることに加えて
 *   赤の中身(矢印を観測 / 前進せず)まで見る。pageerror は記録だけ(赤の理由にしない)。 */
const NEG_MUTATIONS = [
  { name: 'noauto', from: 'if (RUN.auto) return opts[0];', to: '',
    killEnemies: true, judgeOnly: null,
    expect: '矢印を観測 (自動選択が消えて showExitArrows へ落ちる)',
    judge: d => d.ready && d.killed >= 1 && d.arrows > 0 },
  { name: 'notick', from: 'if (RUN) setInterval(tickNodeChoice, 400);', to: '',
    killEnemies: true, judgeOnly: null,
    expect: '240 秒前進せず (出口を選ぶ tick が回らない)',
    judge: d => d.ready && d.killed >= 1 && d.advancedAt === null },
  { name: 'nokill', from: null, to: null,
    killEnemies: false, judgeOnly: ['orc-fort'],
    expect: '前進せず (テストダブルを止めると Lv1 の主人公が entry で倒れる = 勝敗依存の再現)',
    judge: d => d.ready && d.advancedAt === null },
];
// ⚠️ 実行が長いので、出力は `| tail` に通さず `> file 2>&1` で直接受けること。
//    パイプはブロックバッファなので、途中で落ちると末尾の集計がまるごと失われる。
const BUDGET_MS = parseInt(arg('budget-ms', '300000'), 10);   // Part B の1実走あたり上限

const OUT_DIR = arg('out',
  path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
            'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad'));

const BAND_ROWS_SET = [3, 5];
// ⚠️ iphone_land (844x390) は fieldHasSkyRoom が false = 帯が出来ないので測らない (上の注記参照)。
const VIEWPORTS = [
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
/* ⚠ 既定は 6 本すべて。`--scenarios goblin-mine,orc-fort` で絞れる (Part C の切り分け用)。
 *   ⚠ 絞ったまま合否を語らないこと — (C0) の母集団が変わる。切り分け専用の道具。 */
const DUNGEONS = (arg('scenarios', '') || '')
  .split(',').map(s => s.trim()).filter(Boolean);
if (!DUNGEONS.length && NEGATIVE) DUNGEONS.push('goblin-mine', 'orc-fort');   // [#92 STEP3] 所要を抑える
if (!DUNGEONS.length) DUNGEONS.push('goblin-mine', 'bandits-forest', 'lizard-swamp',
                                    'orc-fort', 'undead-temple', 'dragon-lair');

// ── 隊商護衛ペイロード (driver_field_step0.js と同一) ────────────────────────
// ⚠️ waves と wagonSpawns は必ずセット。⚠️ 敵キーは ENEMY_TYPES 実在のもののみ
//    (未知キーは無言消去され、spawns が空になると goblin-mine へフォールバックする)。
// ⚠️ 馬車は displaySize=240 でフットプリント3行 → 中心を row14 にして帯へ収める。
const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [
    { count: 3, pool: ['goblin', 'goblinArcher'] },
    { count: 3, pool: ['goblin', 'hobgoblin'] },
    { count: 3, pool: ['hobgoblin', 'goblinRider'] },
  ],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

// ── puppeteer / Chrome ──────────────────────────────────────────────────────
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ── baseline worktree (「現在 vs 現在」の空 PASS を防ぐ) ─────────────────────
function prepareBaseline() {
  const marker = path.join(BASELINE_DIR, 'index.html');
  if (fs.existsSync(marker)) {
    let head = '';
    try { head = execFileSync('git', ['-C', BASELINE_DIR, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) {}
    if (head && (BASELINE_REV.indexOf(head) === 0 || head.indexOf(BASELINE_REV) === 0)) {
      console.log('[drv] baseline worktree 再利用: ' + BASELINE_DIR + ' @ ' + head);
      return;
    }
    console.log('[drv] baseline worktree が別リビジョン (' + head + ') なので作り直す');
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', BASELINE_DIR], { encoding: 'utf8' }); } catch (e) {}
  }
  console.log('[drv] baseline worktree を作成: ' + BASELINE_DIR + ' @ ' + BASELINE_REV);
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', BASELINE_DIR, BASELINE_REV],
               { encoding: 'utf8', stdio: 'pipe' });
}

// ── 静的サーバ (file:// は音声等が壊れるので http 必須) ──────────────────────
// アームは実行が逐次なのでモジュール変数で切り替える (URL クエリはパスから落ちるため使えない)。
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
/* ⚠ mutate は --negative 専用({ name, from, to, served, serveErrors } / 素は null)。
 *   runGraphAutoDevice は冒頭で root / bandRows を素へ戻すが mutate には触れない(別キーにしてある)。 */
const SERVE = { root: ROOT, bandRows: 3, rewrites: 0, mutate: null };
const BAND_ROWS_LITERAL = 'const FIELD_BAND_ROWS       = 3;';

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        let fp = path.join(SERVE.root, u);
        // baseline worktree に無いアセット (未コミットの png 等) は本体側から借りる
        if (!fs.existsSync(fp) && SERVE.root !== ROOT) fp = path.join(ROOT, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        // ★帯幅アーム: 配信時に FIELD_BAND_ROWS のリテラルだけを差し替える。
        //   mapData を後から塗るより厳密 (buildMap の ROOMS/CORRIDORS 由来の列がそのまま生きる)。
        if (u === '/index.html' && (SERVE.bandRows !== 3 || SERVE.mutate)) {
          let src = fs.readFileSync(fp, 'utf8');
          if (SERVE.bandRows !== 3) {
            if (src.indexOf(BAND_ROWS_LITERAL) < 0) { res.statusCode = 500; res.end('band-rows literal not found'); return; }
            src = src.replace(BAND_ROWS_LITERAL, 'const FIELD_BAND_ROWS       = ' + SERVE.bandRows + ';');
            SERVE.rewrites++;
          }
          /* ★[#92 STEP3] --negative の変異。目印(1 行内の部分文字列・index.html は CRLF)がちょうど 1 回で
           *   なければ 500 を返し、変異そのものを赤にする(黙って素の本文を配らない)。 */
          if (SERVE.mutate) {
            const M = SERVE.mutate;
            const hits = src.split(M.from).length - 1;
            if (hits !== 1) { M.serveErrors++; res.statusCode = 500; res.end('mutation anchor hits=' + hits); return; }
            src = src.replace(M.from, M.to);
            M.served++;
          }
          res.end(src);
          return;
        }
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

// ── プレリュード ────────────────────────────────────────────────────────────
function prelude(cfg) {
  try {
    if (cfg.payload) {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
      sessionStorage.removeItem('dragonfighters.currentScenario');
    } else {
      sessionStorage.removeItem('dragonfighters.generatedScenario');
      sessionStorage.setItem('dragonfighters.currentScenario', cfg.scenarioId);
    }
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
  // Math.random 固定シード: 情景配置とマップ生成を再現可能にする。
  // ⚠️ 本体の firstTileStep / aStar は Math.random を1度も引かないので、STEP6 の変更は
  //    この乱数列に一切触れない (= RNG 非依存の主張はここで前借りされない)。
  let _s = (cfg.seed >>> 0) || 20260719;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  window.__pathRescue = { calls: 0, n: 0, hardFail: 0 };
  window.__camTrace = null;
}

async function bootPage(browser, base, vp, cfg) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, cfg);
  // ⚠ cfg.qs は追加のクエリ (`&graph=auto` など)。Part C だけが使う (runPartC の注記)。
  await page.goto(base + '/index.html?intel=0' + (cfg.qs || ''), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => {
    try {
      return typeof startGame === 'function' && !!mapData &&
             typeof getUnitOccupiedTiles === 'function' && typeof firstTileStep === 'function';
    } catch (e) { return false; }
  }, { timeout: 40000, polling: 100 });
  page.__pageErrors = pageErrors;
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Part A — 決定論ターンシミュレータ
 * ══════════════════════════════════════════════════════════════════════════
 * 実 firstTileStep / aStar / getUnitOccupiedTiles / mapData / isTileWall を呼ぶ。
 * 戦闘解決 (命中/ダメージ/死亡) は行わない = 誰も減らない最大移動圧の worst case。
 * 4アームすべて同一シード=同一初期配置なので、差分として出るのは救済の有無だけ。
 *
 * ⚠️ 実プレイのループ (rAF / setInterval(moveEnemies)) は startGame() を呼ばない限り
 *    走らないが、念のため描画を潰しておく (enemies[] を作り替えるため描画側が壊れる)。
 */
async function installSimulator(page) {
  await page.evaluate(() => {
    // 描画と敵AIの静粛化 (本体は1バイトも変えない = ドライバ側のテストダブル)
    try { window.renderWorld = function () {}; } catch (e) {}
    try { window.renderWorldWithShake = function () {}; } catch (e) {}
    try { window.moveEnemies = function () {}; } catch (e) {}

    const TILE = TILE_SIZE;
    const TOP = FIELD_BAND_TOP_ROW;
    const NROWS = FIELD_BAND_ROWS;
    const BOT = TOP + NROWS - 1;

    // 街道の列 = 帯の全行が非壁 (obstacleTileMask 込み = 情景の倒木も壁扱い) の列
    const roadCols = [];
    for (let tx = 0; tx < MAP_W; tx++) {
      let ok = true;
      for (let ty = TOP; ty <= BOT; ty++) if (isTileWall(tx, ty)) { ok = false; break; }
      if (ok) roadCols.push(tx);
    }

    const mkLcg = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

    // ── ユニット設置 ──────────────────────────────────────────────────────
    // getUnitOccupiedTiles は中心1タイルしか積まない [displaySize は無視] ので、
    // 座標は「中心がそのタイルに落ちる」ように置けばよい。
    const setUnit = (u, tx, ty) => { const s = u.def.displaySize; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
    const tileOf = (u) => { const s = u.def.displaySize; return { tx: Math.floor((u.x + s / 2) / TILE), ty: Math.floor((u.y + s / 2) / TILE) }; };
    const playerTile = () => ({ tx: Math.floor((playerX + 48) / TILE), ty: Math.floor((playerY + 58) / TILE) });
    const setPlayer = (tx, ty) => { playerX = tx * TILE; playerY = ty * TILE; };

    window.__sim = {
      info: function () {
        return { bandTop: TOP, bandRows: NROWS, bandBottom: BOT, roadCols: roadCols.length,
                 roadMin: roadCols[0], roadMax: roadCols[roadCols.length - 1],
                 geoActive: FIELD_GEO_ACTIVE, isFieldTheme: IS_FIELD_THEME, fieldMode: FIELD_MODE,
                 mapW: MAP_W, mapH: MAP_H,
                 hasRescue: /aStar\(startTX, startTY, goalTX, goalTY, null\)/.test(String(firstTileStep)) };
      },

      // 1試行 = turns 手番。戻り値は切断率の集計。
      trial: function (seed, turns) {
        const rnd = mkLcg(seed);
        const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

        // 実ゲーム状態を作り替える
        hp = 100; gameOver = false; heroPath = [];
        allies.length = 0; enemies.length = 0;
        try { traps.length = 0; } catch (e) {}
        try { wagonIndices.length = 0; } catch (e) {}

        // 街道の西側1/3にPT、東側1/3に敵、中央に馬車
        const w = roadCols.length;
        const westCols = roadCols.slice(2, Math.max(4, Math.floor(w * 0.33)));
        const eastCols = roadCols.slice(Math.floor(w * 0.55), w - 2);
        const bandRows = []; for (let r = TOP; r <= BOT; r++) bandRows.push(r);

        const taken = new Set();
        const place = (cols) => {
          for (let k = 0; k < 400; k++) {
            const tx = pick(cols), ty = pick(bandRows);
            const key = tx + ',' + ty;
            if (taken.has(key) || isTileWall(tx, ty)) continue;
            taken.add(key); return { tx, ty };
          }
          return { tx: cols[0], ty: bandRows[0] };
        };

        // PT4 = リーダー(player) + 仲間3
        const p0 = place(westCols); setPlayer(p0.tx, p0.ty);
        for (let i = 0; i < 3; i++) {
          const a = { alive: true, x: 0, y: 0, facing: 'right', def: { displaySize: 96 }, __k: 'ally' + i };
          const t = place(westCols); setUnit(a, t.tx, t.ty);
          allies.push(a);
        }
        // 馬車 (isObjective・静止・displaySize 240)。中央に据える = 帯を実際に塞ぐ側。
        const midCol = roadCols[Math.floor(w * 0.45)];
        const midRow = TOP + Math.min(1, NROWS - 1);
        const wag = { alive: true, x: 0, y: 0, def: { displaySize: 240, isObjective: true }, __k: 'wagon' };
        setUnit(wag, midCol, midRow);
        enemies.push(wag); taken.add(midCol + ',' + midRow);
        // 敵6
        const foes = [];
        for (let i = 0; i < 6; i++) {
          const e = { alive: true, x: 0, y: 0, def: { displaySize: 96 }, __k: 'foe' + i };
          const t = place(eastCols); setUnit(e, t.tx, t.ty);
          enemies.push(e); foes.push(e);
        }

        const acc = { turns: 0, turnsWithCut: 0, cutColsSum: 0,
                      moveAttempts: 0, moved: 0, rescued: 0, stuck: 0 };
        const R = window.__pathRescue;
        const r0 = { calls: R.calls, n: R.n, hardFail: R.hardFail };

        const nearestFoe = (tx, ty) => {
          let best = null, bd = Infinity;
          for (const e of foes) {
            if (!e.alive) continue;
            const t = tileOf(e);
            const d = Math.max(Math.abs(t.tx - tx), Math.abs(t.ty - ty));
            if (d < bd) { bd = d; best = { unit: e, tile: t, d }; }
          }
          return best;
        };

        // 敵の目標タイル選定は enemyAdvanceOneTile と同型 (4近傍のうち空きの最寄り、
        // 全滅なら対象タイル自身へフォールバック = 押し込む)
        const enemyGoal = (pTX, pTY, eTX, eTY, avoid) => {
          let gTX = pTX, gTY = pTY, bestD = Infinity;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ntx = pTX + dx, nty = pTY + dy;
            if (ntx < 0 || ntx >= MAP_W || nty < 0 || nty >= MAP_H) continue;
            if (isTileWall(ntx, nty)) continue;
            if (avoid.has(ntx + ',' + nty)) continue;
            const d = Math.abs(ntx - eTX) + Math.abs(nty - eTY);
            if (d < bestD) { bestD = d; gTX = ntx; gTY = nty; }
          }
          return { gTX, gTY };
        };

        for (let t = 0; t < turns; t++) {
          // ── PT の手番 (リーダー → 仲間) ──
          {
            const pt = playerTile();
            const nf = nearestFoe(pt.tx, pt.ty);
            if (nf && nf.d > 1) {
              const avoid = getUnitOccupiedTiles('player');
              acc.moveAttempts++;
              const before = R.n;
              const next = firstTileStep(pt.tx, pt.ty, nf.tile.tx, nf.tile.ty, avoid);
              if (next) { setPlayer(next.tx, next.ty); acc.moved++; if (R.n > before) acc.rescued++; }
              else acc.stuck++;
            }
          }
          for (const a of allies) {
            if (!a.alive) continue;
            const at = tileOf(a);
            const nf = nearestFoe(at.tx, at.ty);
            if (!nf || nf.d <= 1) continue;
            const avoid = getUnitOccupiedTiles(a);
            acc.moveAttempts++;
            const before = R.n;
            const next = firstTileStep(at.tx, at.ty, nf.tile.tx, nf.tile.ty, avoid);
            if (next) { setUnit(a, next.tx, next.ty); acc.moved++; if (R.n > before) acc.rescued++; }
            else acc.stuck++;
          }
          // ── 敵の手番 (馬車は静止) ──
          for (const e of foes) {
            if (!e.alive) continue;
            const et = tileOf(e);
            const pt = playerTile();
            if (Math.max(Math.abs(et.tx - pt.tx), Math.abs(et.ty - pt.ty)) <= 1) continue;
            const avoid = getUnitOccupiedTiles(e);
            const g = enemyGoal(pt.tx, pt.ty, et.tx, et.ty, avoid);
            acc.moveAttempts++;
            const before = R.n;
            const next = firstTileStep(et.tx, et.ty, g.gTX, g.gTY, avoid);
            if (next) { setUnit(e, next.tx, next.ty); acc.moved++; if (R.n > before) acc.rescued++; }
            else acc.stuck++;
          }

          // ── ★主指標: 切断イベント率 (STEP0 測定項目5 と同一定義) ──
          const occ = getUnitOccupiedTiles(null);
          let cut = 0;
          for (const tx of roadCols) {
            let allOcc = true;
            for (let ty = TOP; ty <= BOT; ty++) if (!occ.has(tx + ',' + ty)) { allOcc = false; break; }
            if (allOcc) cut++;
          }
          acc.turns++;
          if (cut > 0) acc.turnsWithCut++;
          acc.cutColsSum += cut;
        }
        acc.rescueCalls = R.calls - r0.calls;
        acc.rescueFired = R.n - r0.n;
        acc.hardFail = R.hardFail - r0.hardFail;
        return acc;
      },
    };
  });
}

async function runPartA(browser, base, arm) {
  SERVE.root = arm.root; SERVE.bandRows = arm.rows;
  const page = await bootPage(browser, base, VIEWPORTS[1], { payload: CARAVAN_PAYLOAD, seed: 20260719 });
  await installSimulator(page);
  const info = await page.evaluate(() => window.__sim.info());

  const agg = { turns: 0, turnsWithCut: 0, cutColsSum: 0, moveAttempts: 0, moved: 0,
                rescued: 0, stuck: 0, rescueCalls: 0, rescueFired: 0, hardFail: 0 };
  const perTrial = [];
  for (let i = 0; i < TRIALS; i++) {
    const seed = 1000 + i * 7919;   // アーム間で同一 = 同一初期配置
    const r = await page.evaluate((s, n) => window.__sim.trial(s, n), seed, TURNS);
    perTrial.push({ seed, cutRate: +(r.turnsWithCut / r.turns * 100).toFixed(3), stuck: r.stuck, rescued: r.rescued });
    for (const k of Object.keys(agg)) agg[k] += (r[k] || 0);
  }
  const pageErrors = page.__pageErrors.slice();
  await page.close();
  return { arm: arm.label, rows: arm.rows, rescue: arm.rescue, info, agg, perTrial, pageErrors };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Part B — 実プレイ (STEP0 と同一のフレーム標本で切断率を採る)
 * ══════════════════════════════════════════════════════════════════════════
 * freeze も quiesce も setCam もしない。?autoplay も使わない (STEP0 と同条件)。
 * 判定バー <1% はこの尺度で見る (STEP0 の 3行実測 iphone_port 0.13% / desktop 2.26% と同尺)。
 */
async function installLiveProbe(page) {
  await page.evaluate(() => {
    const TOP = FIELD_BAND_TOP_ROW, BOT = FIELD_BAND_TOP_ROW + FIELD_BAND_ROWS - 1;
    const A = { frames: 0, framesWithCut: 0, cutCols: 0, combat: 0, waves: 0, maxFoes: 0 };
    window.__waveProbe = window.__waveProbe || [];
    window.__live = {
      sample: function () {
        const occ = getUnitOccupiedTiles(null);
        let cut = 0;
        for (let tx = 0; tx < MAP_W; tx++) {
          let wallish = false, allOcc = true;
          for (let ty = TOP; ty <= BOT; ty++) {
            if (isTileWall(tx, ty)) { wallish = true; break; }
            if (!occ.has(tx + ',' + ty)) allOcc = false;
          }
          if (wallish) continue;
          if (allOcc) cut++;
        }
        A.frames++;
        if (cut > 0) A.framesWithCut++;
        A.cutCols += cut;
        if (currentPhase === 'combat') A.combat++;
        const foes = (typeof encounterEnemyIndices !== 'undefined' && encounterEnemyIndices)
          ? encounterEnemyIndices.filter(i => enemies[i] && enemies[i].alive && !enemies[i].def.isObjective).length : 0;
        if (foes > A.maxFoes) A.maxFoes = foes;
        A.waves = (window.__waveProbe || []).length;
        return { frames: A.frames, cut: A.framesWithCut, waves: A.waves, foes,
                 phase: currentPhase, gameOver: gameOver, hp: hp };
      },
      dump: function () {
        return { agg: A, rescue: Object.assign({}, window.__pathRescue),
                 bandRows: FIELD_BAND_ROWS, geoActive: FIELD_GEO_ACTIVE,
                 isFieldTheme: IS_FIELD_THEME, fieldMode: FIELD_MODE,
                 title: currentScenario && currentScenario.title };
      },
    };
  });
}

async function runPartB(browser, base, root, rows, vp, label) {
  SERVE.root = root; SERVE.bandRows = rows;
  const page = await bootPage(browser, base, vp, { payload: CARAVAN_PAYLOAD, seed: 20260719 });
  await installLiveProbe(page);
  await page.evaluate(() => { try { startGame(); } catch (e) {} });

  const t0 = Date.now();
  let last = null, reason = 'budget-exhausted', quiet = 0, lastLog = 0;
  while (Date.now() - t0 < BUDGET_MS) {
    await new Promise(r => setTimeout(r, 200));
    try { last = await page.evaluate(() => window.__live.sample()); }
    catch (e) { reason = 'evaluate-failed: ' + e.message; break; }
    if (last.gameOver) { reason = 'gameOver'; break; }
    if (last.waves >= CARAVAN_PAYLOAD.waves.length && last.foes === 0) {
      if (!quiet) quiet = Date.now();
      if (Date.now() - quiet > 3000) { reason = 'waves-cleared'; break; }
    } else quiet = 0;
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now();
      console.log('    [' + label + '] ' + Math.round((Date.now() - t0) / 1000) + 's  frames=' + last.frames +
        ' cut=' + last.cut + ' wave=' + last.waves + '/3 foes=' + last.foes + ' hp=' + last.hp);
    }
  }
  const dump = await page.evaluate(() => window.__live.dump());
  const pageErrors = page.__pageErrors.slice();
  await page.close();
  return { label, vp: vp.name, rows, dump, reason, elapsedMs: Date.now() - t0, pageErrors };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Part C — 既存6シナリオの非退行
 * ══════════════════════════════════════════════════════════════════════════
 * 救済の発火数 (__pathRescue.n) が 0 なら、第2の aStar すら走っていない
 * = 挙動も RNG 消費順も1バイト不変であることの直接証明。
 * 0 でない場合は「ダンジョンでも救済が効いた」= 意図した上位互換だが挙動は変わるので、
 * IS_FIELD_THEME ゲートに閉じるかの判断材料として数値を持ち帰る。
 */
async function runPartC(browser, base, scenarioId, speed, budgetMs) {
  SERVE.root = ROOT; SERVE.bandRows = 3;
  /* ⚠⚠ **`?graph=auto` を必ず付ける** (2026-08-11 に赤くなって判明)。ゲームブック風分岐マップの
   *   P5 (`a4c6091`) で廃坑が分岐版になり、**entry ノード n0 は敵 0 体**が設計上の必須条件
   *   (index.html buildGoblinMineRun の「設計の根拠 ③」= 開幕ナレを戦闘で潰さないため)。
   *   出口を選ばない限り戦闘が 1 度も起きないので firstTileStep の呼び出しが **0 回**になり、
   *   「標本が空でない」が落ちていた。`?graph=auto` は index.html が持つ恒久の検証用スイッチで、
   *   矢印もダイアログも出さず先頭の出口を自動選択する = **実プレイのまま**先へ進む。
   *   ⚠ 分岐を持たないシナリオ (P6 未対応の 5 本) では RUN が null なので**完全な no-op**。
   *   ⚠ ここを `?graph=0` (旧単一マップ) で緑にするのは**禁止**。Part C が測りたいのは
   *     「ダンジョンの**実プレイ**で救済が発火しないこと」なので、プレイヤーが二度と見ない
   *     マップへ母集団をすり替えると、P6 完了時点で何も検出しない検出器になる。 */
  const page = await bootPage(browser, base, VIEWPORTS[1],
    { scenarioId, seed: 20260719, qs: '&graph=auto' });
  await page.evaluate((sp) => {
    if (sp > 1) { const _sl = window.sleepMs; window.sleepMs = function (ms) { return _sl(Math.max(4, Math.floor(ms / sp))); }; }
    window.__live = { dump: () => ({ rescue: Object.assign({}, window.__pathRescue),
                                     title: currentScenario && currentScenario.title,
                                     isFieldTheme: IS_FIELD_THEME, fieldMode: FIELD_MODE,
                                     phase: currentPhase, gameOver, hp,
                                     /* ★分岐グラフの状態 (?graph=auto が効いているかの装置)。
                                      *  ⚠ classic script 直下の let は bare 識別子でしか読めない
                                      *    (window に載らない) ので typeof ガードで包む。 */
                                     graphActive: (typeof RUN !== 'undefined' && !!RUN),
                                     entryId: (typeof RUN !== 'undefined' && RUN) ? RUN.graph.entry : null,
                                     nodeId: (typeof currentNodeId !== 'undefined' ? currentNodeId : null),
                                     visitedN: (typeof nodeState !== 'undefined' && nodeState)
                                       ? Object.keys(nodeState).length : null,
                                     /* ★選択ダイアログが開きっぱなしだと進行が止まり標本が痩せる。
                                      *  ⚠ DOM で見る (内部フラグ名に依存しない)。id=choiceDialog は
                                      *    全選択ダイアログの共用器。判定は driver_graph_sce1 と同じ
                                      *    `.show` クラスで揃える (display の計算値だと器の実装に依存する)。 */
                                     dialogUp: (() => {
                                       const d = document.getElementById('choiceDialog');
                                       return !!(d && d.classList.contains('show'));
                                     })() }) };
  }, speed);
  await page.evaluate(() => { try { startGame(); } catch (e) {} });

  const t0 = Date.now();
  let last = null, dialogsAnswered = 0;
  /* ★[#92 2026-10-13] **budgetMs で必ず抜ける**(gameOver ならその前に抜ける)。
   *   以前 (`50302b8` 2026-08-20) は「前進した」を見るためだけに budgetMs を +210 秒延ばしていたが、
   *   赤の真因は待ち時間ではなかった(依頼書 実装依頼書/2026-10-13_graph-auto-device.md §2):
   *   ① 森は #16 (`7642eba`) で 1 ノードに畳まれ entry = ボス部屋 = **出口 0 本**(原理的に前進しない)。
   *   ② 沼地/砦/神殿/竜は #62/#63/#66/#67 で entry = 敵 10〜11 体の大部屋になり、Lv1 の 4 人パーティでは
   *      **主人公が entry で倒れる**(砦は毎回 27〜28 秒)→ gameOver で抜けるので、何秒延ばしても前進しない。
   *   ⇒ 前進の判定は勝敗から切り離して **STEP2 の装置ステージ(別ページで entry の敵を倒してから見る)** へ移す。
   *   ここ(救済の母集団)では advancedAt と終了理由を**観測してログに出すだけ**で、assert しない。
   * ⚠⚠ 救済の標本 (rescue) は budgetMs 時点の値 = 全シナリオで同じ 90 秒窓(gameOver ならそれより短い)。 */
  let sample = null, advancedAt = null, endReason = null;
  for (;;) {
    const el = Date.now() - t0;
    if (el >= budgetMs) { endReason = 'budget@' + Math.round(el / 1000) + 's'; break; }
    await new Promise(r => setTimeout(r, 400));
    try { last = await page.evaluate(() => window.__live.dump()); }
    catch (e) { endReason = 'evaluate-failed@' + Math.round((Date.now() - t0) / 1000) + 's'; break; }
    if (advancedAt === null && last.graphActive && last.entryId &&
        last.nodeId && last.nodeId !== last.entryId) advancedAt = Date.now() - t0;
    /* ★選択イベント (シナリオ1 の EV-2/EV-5/EV-9 など) に答える = プレイヤーの代役。
     * ⚠⚠ **`?autoplay` で代用しないこと**。autoplay は選択の自動回答だけでなく FX / 画面揺れ /
     *   カメラ追従 / ナレ停止 / sleepMs 倍率まで一括で切る (index.html の fxEnabled ほか多数)。
     *   Part C の他 5 シナリオは今それらを**入れたまま**測っているので、autoplay を足すと
     *   6 本ぶんの母集団がまるごと別物になる (= 非退行の基準がすり替わる)。
     *   ここは「ダイアログが実際に開いている時だけ」効くので、分岐を持たないシナリオでは
     *   1 度も発火しない = 従来の測定に 1 バイトも触れない。
     * ⚠ 押すのは常に先頭の候補。?graph=auto (出口 opts[0]) と方針を揃える。 */
    if (last.dialogUp) {
      const clicked = await page.evaluate(() => {
        const b = document.querySelector('#choiceDialog .choiceButtons button');
        if (!b) return false;
        b.click();
        return true;
      }).catch(() => false);
      if (clicked) dialogsAnswered++;
    }
    /* ⚠ gameOver は**主人公の HP 0** で立つ(仲間が生きていても終わる)。救済の標本はここで凍結。 */
    if (last.gameOver) { endReason = 'gameOver@' + Math.round((Date.now() - t0) / 1000) + 's'; break; }
  }
  if (sample === null) sample = last ? last.rescue : null;
  const pageErrors = page.__pageErrors.slice();
  await page.close();
  return { scenarioId, last, sample, advancedAt, endReason,
           elapsedMs: Date.now() - t0, pageErrors, dialogsAnswered };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 装置ステージ — `?graph=auto` が矢印を出さずに entry から前進するか (#92 STEP2)
 * ══════════════════════════════════════════════════════════════════════════
 * Part C 本体(救済の母集団)とは**別ページ**。本体の標本には 1 バイトも触れない。
 * 前進を勝敗から切り離すため、entry の非 passiveNpc の敵をドライバ側で倒してから見る
 * (テストダブル。本番は 1 バイトも変えない)。依頼書 §2-4: 倒せば 5 本とも前進する。
 *
 * ⚠⚠ [#92 §12-2・ユーザー決定 A] **ダイアログは数えるが合否に使わない**(代役で答える)。
 *   entry には出口と無関係なイベントのダイアログがある(廃坑 = 見張りの描写 0 秒 / 沼地 = 罠解除・
 *   若い司祭 / 神殿 = 墓碑の霊)。一方、出口選択のダイアログは chooseExit の `__autoplay` 経路だけ
 *   (index.html:38001-38003)で、装置は __autoplay を立てない = 自動選択が壊れたときに出るのは
 *   **矢印(showExitArrows)だけ**。⇒ 守りは「矢印 0 で前進」。ダイアログの回数と本文はログに残す。
 *
 *   opts.killEnemies … 既定 true。false = テストダブルを止める(STEP3 の `nokill` 変異の口)。
 *                      false なら Lv1 の実戦に勝たないと前進しない = §2-3 の罠の再現。
 *   opts.answerDialogs … 既定 true = Part C と同じ代役(開いた選択ダイアログの先頭ボタンを押す)。
 *                      false = ダイアログを見た時点で打ち切る(依頼書 §5 の当初案。イベントで構造的に赤)。
 *   opts.speed       … sleepMs の短縮倍率(Part C と同じ 8)。
 *   opts.readyMs     … entry で敵が湧くまでの上限(60 秒)。
 *   opts.advanceMs   … 前進までの上限(240 秒 = 最遅 117 秒の約 2 倍)。
 * ⚠ 配信の書き換え(STEP3 の noauto / notick)は startServer の SERVE.bandRows と同じ場所に足す。
 *   この関数は SERVE.root / bandRows を素に戻すだけで、書き換えの有無を知らない。
 * ⚠ 母集団は `RUN.byId[RUN.graph.entry].exits` の**実体**で決める(シナリオ名で森を除外しない)。
 */
async function runGraphAutoDevice(browser, base, scenarioId, opts) {
  const o = Object.assign({ killEnemies: true, answerDialogs: true, speed: 8, readyMs: 60000, advanceMs: 240000 }, opts || {});
  SERVE.root = ROOT; SERVE.bandRows = 3;
  const page = await bootPage(browser, base, VIEWPORTS[1],
    { scenarioId, seed: 20260719, qs: '&graph=auto' });
  const out = { scenarioId, killEnemies: o.killEnemies, ready: false, readyMs: null,
                entryId: null, exits: null, inPopulation: false, killed: 0,
                advancedAt: null, toNode: null, arrows: 0, dialogs: 0, dialogsAnswered: 0, dialogMsgs: [],
                gameOver: false, endReason: null, pageErrors: [] };
  try {
    /* ① 観測器を startGame より**先に**入れる。2 秒ごとのポーリングだと短く出た矢印を取りこぼすので
     *    MutationObserver で数える(矢印 = `.exitArrow` の要素が増えた回数 / ダイアログ = #choiceDialog に
     *    `show` が付いた回数)。⚠ showExitArrows は createElement → className 設定 → append の順だが、
     *    MO のコールバックはマイクロタスクで後から来るので、addedNodes の時点で class は付いている。 */
    await page.evaluate((sp) => {
      if (sp > 1) { const _sl = window.sleepMs; window.sleepMs = function (ms) { return _sl(Math.max(4, Math.floor(ms / sp))); }; }
      const D = { arrows: 0, arrowMax: 0, dialogs: 0, dialogMsgs: [] };
      window.__dev = D;
      const dlgShown = () => { const d = document.getElementById('choiceDialog'); return !!(d && d.classList.contains('show')); };
      // ★どのダイアログだったかをログに残す(赤の切り分け用。判定には使わない)。
      const dlgMsg = () => { const m = document.querySelector('#choiceDialog .choiceMessage'); return m ? String(m.textContent).slice(0, 60) : ''; };
      let wasShown = dlgShown();
      if (wasShown) { D.dialogs++; D.dialogMsgs.push(dlgMsg()); }
      D.arrowMax = document.querySelectorAll('.exitArrow').length;
      D.arrows += D.arrowMax;
      const mo = new MutationObserver((recs) => {
        for (const r of recs) {
          if (r.type === 'childList') {
            for (const n of r.addedNodes) {
              if (n.nodeType !== 1) continue;
              if (n.classList && n.classList.contains('exitArrow')) D.arrows++;
              if (n.querySelectorAll) D.arrows += n.querySelectorAll('.exitArrow').length;
            }
          }
        }
        const now = dlgShown();
        if (now && !wasShown) { D.dialogs++; D.dialogMsgs.push(dlgMsg()); }
        wasShown = now;
        const live = document.querySelectorAll('.exitArrow').length;
        if (live > D.arrowMax) D.arrowMax = live;
      });
      mo.observe(document.documentElement, { childList: true, subtree: true,
                                             attributes: true, attributeFilter: ['class'] });
    }, o.speed);
    await page.evaluate(() => { try { startGame(); } catch (e) {} });

    // ② entry で敵が湧くのを待つ(⚠ classic script 直下の let は bare 識別子でしか読めない)。
    const t0 = Date.now();
    try {
      await page.waitForFunction(() => {
        try {
          return gameStarted && enemies.length > 0 && typeof RUN !== 'undefined' && !!RUN &&
                 currentNodeId === RUN.graph.entry;
        } catch (e) { return false; }
      }, { timeout: o.readyMs, polling: 200 });
      out.ready = true;
    } catch (e) { out.endReason = 'not-ready@' + Math.round((Date.now() - t0) / 1000) + 's'; }
    out.readyMs = Date.now() - t0;
    if (!out.ready) return out;

    // ③ entry の出口を実体から読む → 母集団の判定 → テストダブルで倒す
    const st = await page.evaluate((kill) => {
      const entry = RUN.graph.entry;
      const node = RUN.byId[entry];
      const exits = ((node && node.exits) || []).map(ex => ex.to + ':' + (ex.dir || '?'));
      let killed = 0;
      if (exits.length && kill) {
        for (const e of enemies) {
          if (!e || !e.alive || e.passiveNpc) continue;
          e.alive = false; e.hp = 0; killed++;
        }
      }
      return { entry, exits, killed };
    }, o.killEnemies);
    out.entryId = st.entry; out.exits = st.exits; out.killed = st.killed;
    out.inPopulation = st.exits.length > 0;
    if (!out.inPopulation) { out.endReason = 'no-exit'; return out; }

    // ④ currentNodeId が entry から変わるのを 400ms ごとに見る。矢印を見たらその場で打ち切る
    //    (負のコントロール noauto が速く終わる)。イベントのダイアログには代役で答えて進める。
    const t1 = Date.now();
    for (;;) {
      const el = Date.now() - t1;
      if (el >= o.advanceMs) { out.endReason = 'budget@' + Math.round(el / 1000) + 's'; break; }
      await new Promise(r => setTimeout(r, 400));
      let s;
      try {
        s = await page.evaluate(() => ({ node: currentNodeId, go: !!gameOver,
                                         arrows: window.__dev.arrows, dialogs: window.__dev.dialogs }));
      } catch (e) { out.endReason = 'evaluate-failed@' + Math.round((Date.now() - t1) / 1000) + 's'; break; }
      out.arrows = s.arrows; out.dialogs = s.dialogs; out.gameOver = s.go;
      if (o.answerDialogs) {
        // Part C と同じ代役 = 開いている選択ダイアログの先頭ボタンを押す(打ち切らない)。
        const clicked = await page.evaluate(() => {
          const d = document.getElementById('choiceDialog');
          if (!d || !d.classList.contains('show')) return false;
          const b = d.querySelector('.choiceButtons button'); if (b) b.click(); return !!b;
        }).catch(() => false);
        if (clicked) out.dialogsAnswered++;
        if (s.arrows > 0) { out.endReason = 'ui-seen@' + Math.round((Date.now() - t1) / 1000) + 's'; break; }
      } else if (s.arrows > 0 || s.dialogs > 0) { out.endReason = 'ui-seen@' + Math.round((Date.now() - t1) / 1000) + 's'; break; }
      if (s.node && s.node !== out.entryId) {
        out.advancedAt = Date.now() - t1; out.toNode = s.node;
        out.endReason = 'advanced@' + Math.round(out.advancedAt / 1000) + 's'; break;
      }
      if (s.go) { out.endReason = 'gameOver@' + Math.round((Date.now() - t1) / 1000) + 's'; break; }
    }
    // 前進の直後に矢印/ダイアログが来ていないかも最後に 1 回だけ読み直す(数え漏れの防止)。
    try {
      // ⚠ gameOver は前進の時点の値を使う(前進した先のノードで倒れても装置の判定には関係ない)。
      const f = await page.evaluate(() => ({ arrows: window.__dev.arrows, dialogs: window.__dev.dialogs,
                                             msgs: window.__dev.dialogMsgs.slice() }));
      out.arrows = f.arrows; out.dialogs = f.dialogs; out.dialogMsgs = f.msgs;
    } catch (e) {}
    return out;
  } finally {
    out.pageErrors = page.__pageErrors.slice();
    try { await page.close(); } catch (e) {}
  }
}

/* (Cd-<sid>) の合格条件 [ユーザー決定 A]。素の装置ステージと --negative で同じ式を使う(写経しない)。 */
function devicePass(d) {
  return !!(d && d.ready && d.killed >= 1 && d.advancedAt !== null && d.arrows === 0 && !d.gameOver);
}
function devSummary(d) {
  return 'ready ' + d.ready + ' / 倒した ' + d.killed + ' / 出口 [' + (d.exits || []).join(',') + '] / 前進 ' +
    (d.advancedAt === null ? 'せず' : Math.round(d.advancedAt / 1000) + 's') + ' / 矢印 ' + d.arrows +
    ' / ダイアログ ' + d.dialogs + ' (答えた ' + d.dialogsAnswered + ') / gameOver ' + d.gameOver +
    ' / 終了 ' + d.endReason + ' / pageerror ' + d.pageErrors.length;
}

/* ══════════════════════════════════════════════════════════════════════════
 * --negative [#92 STEP3] — 装置ステージの負のコントロール
 * ══════════════════════════════════════════════════════════════════════════
 * 変異ごとに: ① 目印の自己検査(配信元 index.html でちょうど 1 回)→ ② SERVE.mutate を立てて装置を走らせる
 * → ③ 判定対象シナリオで「素の合格条件が偽」かつ「狙った理由(judge)で赤」か → ④ 配信が実際に変異を
 * 配ったか(served ≥ 1・serveErrors 0)。どれか欠けたら STAYED GREEN / BROKEN として exit 1。
 * ⚠ SERVE.mutate は finally で必ず null に戻す。
 */
async function runNegative(browser, base) {
  const srcText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  for (const m of NEG_MUTATIONS) {
    const targets = m.judgeOnly ? DUNGEONS.filter(s => m.judgeOnly.includes(s)) : DUNGEONS.slice();
    const r = { name: m.name, expect: m.expect, anchorHits: null, served: 0, serveErrors: 0,
                targets, runs: [], red: false, why: '' };
    out.push(r);
    mark('負のコントロール ' + m.name + ': ' + m.expect + ' / 対象 ' + (targets.join(',') || '(なし)'));
    if (m.from !== null) {
      r.anchorHits = srcText.split(m.from).length - 1;
      console.log('    目印の自己検査: index.html に ' + r.anchorHits + ' 回 — ' + JSON.stringify(m.from));
      if (r.anchorHits !== 1) { r.why = '目印が ' + r.anchorHits + ' 回 (ちょうど 1 回でない)'; continue; }
    }
    if (!targets.length) { r.why = '判定対象のシナリオが --scenarios に無い (' + m.judgeOnly.join(',') + ')'; continue; }
    if (m.from !== null) SERVE.mutate = { name: m.name, from: m.from, to: m.to, served: 0, serveErrors: 0 };
    try {
      for (const sid of targets) {
        let d;
        try {
          d = await runGraphAutoDevice(browser, base, sid, { killEnemies: m.killEnemies });
        } catch (e) {
          d = { scenarioId: sid, ready: false, killed: 0, exits: null, advancedAt: null, arrows: 0, dialogs: 0,
                dialogsAnswered: 0, gameOver: false, endReason: 'boot-failed: ' + String(e && e.message).slice(0, 80),
                pageErrors: [] };
        }
        const pass = devicePass(d), hit = !pass && m.judge(d);
        r.runs.push({ scenarioId: sid, pass, hit, endReason: d.endReason, advancedAt: d.advancedAt,
                      arrows: d.arrows, dialogs: d.dialogs, killed: d.killed, gameOver: d.gameOver,
                      ready: d.ready, pageErrors: d.pageErrors.slice(0, 3) });
        console.log('    ' + sid + ': ' + (hit ? '赤 (狙いどおり)' : (pass ? '緑のまま' : '赤だが狙いと違う理由')) +
          ' — ' + devSummary(d) + (d.pageErrors.length ? ' / pageerror(記録のみ) ' + JSON.stringify(d.pageErrors.slice(0, 2)) : ''));
      }
    } finally {
      if (SERVE.mutate) { r.served = SERVE.mutate.served; r.serveErrors = SERVE.mutate.serveErrors; }
      SERVE.mutate = null;
    }
    const allHit = r.runs.length === targets.length && r.runs.every(x => x.hit);
    const serveOK = m.from === null || (r.served >= targets.length && r.serveErrors === 0);
    r.red = allHit && serveOK;
    if (!serveOK) r.why = '変異の配信 served=' + r.served + ' serveErrors=' + r.serveErrors;
    else if (!allHit) r.why = '狙いどおり赤にならなかった: ' + r.runs.filter(x => !x.hit).map(x => x.scenarioId).join(',');
    if (m.from !== null) console.log('    配信: 変異を配った ' + r.served + ' 回 / 500 ' + r.serveErrors + ' 回');
  }
  return out;
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv = null, browser = null;

  if (NEGATIVE) {
    let neg = [];
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      srv = await startServer(PORT);
      const BASE = 'http://127.0.0.1:' + PORT;
      console.log('[drv] http サーバ: ' + BASE + ' / --negative (装置ステージのみ・対象 ' + DUNGEONS.join(',') + ')');
      const profile = require('./_pptr_profile')('df_pptr_profile_step6_');
      browser = await puppeteer.launch({
        executablePath: browserPath, headless: !HEADFUL,
        args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
               '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
               '--user-data-dir=' + profile],
      });
      neg = await runNegative(browser, BASE);
    } finally {
      if (browser) { try { await browser.close(); } catch (e) {} }
      if (srv) { try { srv.close(); } catch (e) {} }
    }
    console.log('\n════════ --negative (#92 STEP3) ════════');
    for (const r of neg) {
      console.log('NEG ' + r.name + ': ' + (r.red ? 'RED as expected' : 'STAYED GREEN') +
        '  — 期待: ' + r.expect + (r.why ? ' / ' + r.why : '') +
        (r.runs.length ? ' / ' + r.runs.map(x => x.scenarioId + '=' + x.endReason +
          (x.arrows ? ' 矢印' + x.arrows : '') + (x.gameOver ? ' gameOver' : '')).join(', ') : ''));
    }
    const nRed = neg.filter(r => r.red).length;
    const outFile = path.join(OUT_DIR, 'field_step6_negative.json');
    fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: DUNGEONS, negative: neg }, null, 1));
    console.log('\n[drv] 実測値 JSON: ' + outFile);
    console.log('\n=== negative ' + nRed + '/' + NEG_MUTATIONS.length + ' ===');
    process.exit(nRed === NEG_MUTATIONS.length ? 0 : 1);
  }
  const report = { generatedAt: new Date().toISOString(), baselineRev: BASELINE_REV,
                   trials: TRIALS, turns: TURNS, partA: [], partB: [], partC: [], device: [] };

  // ── 静的 assert: 3つの合流点が本当に firstTileStep 1本か ────────────────
  mark('静的スキャン: 戦闘移動3経路が firstTileStep に合流しているか');
  const srcText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const src = srcText.split(/\r?\n/);
  const callSites = [];
  src.forEach((l, i) => { if (/\bfirstTileStep\s*\(/.test(l) && !/function firstTileStep/.test(l)) callSites.push(i + 1); });
  const enclosing = callSites.map(ln => {
    for (let i = ln; i > 0 && i > ln - 220; i--) {
      const m = src[i - 1].match(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/);
      if (m) return { line: ln, fn: m[1] };
    }
    return { line: ln, fn: '<unknown>' };
  });
  console.log('  firstTileStep の呼び出し元: ' + enclosing.map(e => e.fn + '@L' + e.line).join(', '));
  const fns = enclosing.map(e => e.fn).sort().join(',');
  check('(S1) firstTileStep の呼び出し元は戦闘移動3経路のみ',
    fns === 'allyAdvanceTowardPoint,enemyAdvanceOneTile,playerAdvanceOneTile',
    '実測: ' + fns);
  check('(S2) 第2候補 aStar(..., null) が firstTileStep に入っている',
    /aStar\(startTX, startTY, goalTX, goalTY, null\)/.test(srcText), '');
  // RNG 非依存の静的証明: aStar 本体に Math.random が無い
  // ⚠️ index.html は CRLF。`\n    }\n` 決め打ちだと永久にマッチせず「切り出せず」で FAIL する。
  const aStarBody = srcText.match(/function aStar\([\s\S]*?\r?\n {4}\}\r?\n/);
  check('(S3) aStar は Math.random を1度も引かない (RNG 非依存の根拠)',
    !!aStarBody && !/Math\.random/.test(aStarBody[0]), aStarBody ? 'aStar 本体を走査' : 'aStar 本体を切り出せず');

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    prepareBaseline();
    srv = await startServer(PORT);
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] http サーバ: ' + BASE);

    const profile = require('./_pptr_profile')('df_pptr_profile_step6_');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + profile],
    });

    // ── baseline の健全性: 救済が「入っていない」ことを確認 ──────────────
    // (assert 自体の有効性。baseline に既に救済があったら比較が空 PASS になる)
    const bsrc = fs.readFileSync(path.join(BASELINE_DIR, 'index.html'), 'utf8');
    check('(S4) baseline (' + BASELINE_REV + ') には救済が入っていない',
      !/aStar\(startTX, startTY, goalTX, goalTY, null\)/.test(bsrc), '');
    check('(S5) baseline に帯幅リテラルがある (5行アームの書き換えが成立する)',
      bsrc.indexOf(BAND_ROWS_LITERAL) >= 0, '');

    // ── Part A ────────────────────────────────────────────────────────────
    const arms = [];
    for (const rows of BAND_ROWS_SET) {
      arms.push({ label: '帯' + rows + '行/救済なし', rows, rescue: false, root: BASELINE_DIR });
      arms.push({ label: '帯' + rows + '行/救済あり', rows, rescue: true, root: ROOT });
    }
    for (const a of (SKIP_A ? [] : arms)) {
      mark('Part A シミュレータ: ' + a.label + '  (' + TRIALS + '試行 × ' + TURNS + '手番)');
      const r = await runPartA(browser, BASE, a);
      report.partA.push(r);
      const g = r.agg;
      console.log('    帯 row ' + r.info.bandTop + '..' + r.info.bandBottom + ' / 街道列 ' + r.info.roadCols +
        ' 本 (tx ' + r.info.roadMin + '..' + r.info.roadMax + ') / geoActive=' + r.info.geoActive);
      console.log('    切断率 ' + (g.turnsWithCut / g.turns * 100).toFixed(3) + '%  (' + g.turnsWithCut + '/' + g.turns + ')' +
        '  平均切断列 ' + (g.cutColsSum / g.turns).toFixed(3) +
        '  移動失敗 ' + g.stuck + '/' + g.moveAttempts +
        '  救済発火 ' + g.rescueFired);
      check('(A-' + a.label + ') 帯幅が意図どおり適用された (FIELD_BAND_ROWS=' + a.rows + ')',
        r.info.bandRows === a.rows && r.info.geoActive === true,
        'bandRows=' + r.info.bandRows + ' geoActive=' + r.info.geoActive);
      check('(A-' + a.label + ') ビルドの救済有無が意図どおり',
        r.info.hasRescue === a.rescue, 'hasRescue=' + r.info.hasRescue + ' (期待 ' + a.rescue + ')');
      check('(A-' + a.label + ') pageerror 0', r.pageErrors.length === 0,
        r.pageErrors.slice(0, 3).join(' | ') || 'none');
    }

    // 同一初期配置であることの assert (アーム間で seed 列が同じ)
    if (report.partA.length) {
      const seedsOK = report.partA.every(r => r.perTrial.length === TRIALS &&
        r.perTrial.every((t, i) => t.seed === report.partA[0].perTrial[i].seed));
      check('(A0) 4アームが同一シード列 = 同一初期配置で走っている', seedsOK, '');
    }

    // ── Part B ────────────────────────────────────────────────────────────
    if (!SKIP_B) {
      for (const vp of VIEWPORTS) {
        for (const build of [{ root: BASELINE_DIR, rescue: false, n: '救済なし' },
                             { root: ROOT, rescue: true, n: '救済あり' }]) {
          const label = vp.name + '/帯3行/' + build.n;
          mark('Part B 実プレイ: ' + label);
          const r = await runPartB(browser, BASE, build.root, 3, vp, label);
          r.rescueBuild = build.rescue;
          report.partB.push(r);
          const a = r.dump.agg;
          console.log('    → ' + r.reason + ' / ' + Math.round(r.elapsedMs / 1000) + 's / frames=' + a.frames +
            ' / 切断率 ' + (a.frames ? (a.framesWithCut / a.frames * 100).toFixed(3) : 'n/a') + '%' +
            ' / waves=' + a.waves + '/3 / 最大同時敵 ' + a.maxFoes +
            ' / 救済発火 ' + (r.dump.rescue ? r.dump.rescue.n : 'n/a'));
          check('(B-' + label + ') 隊商護衛が幾何ONでロードされた',
            r.dump.isFieldTheme === true && r.dump.geoActive === true && r.dump.bandRows === 3,
            'isFieldTheme=' + r.dump.isFieldTheme + ' geoActive=' + r.dump.geoActive + ' bandRows=' + r.dump.bandRows);
          check('(B-' + label + ') 標本が空でない (frames>0 かつ 敵が実際に湧いた)',
            a.frames > 0 && a.maxFoes > 0, 'frames=' + a.frames + ' maxFoes=' + a.maxFoes);
          check('(B-' + label + ') pageerror 0', r.pageErrors.length === 0,
            r.pageErrors.slice(0, 3).join(' | ') || 'none');
        }
      }
    }

    // ── Part C ────────────────────────────────────────────────────────────
    if (!SKIP_C) {
      for (const sid of DUNGEONS) {
        mark('Part C 非退行 (既存シナリオ): ' + sid);
        /* ⚠ [#92] 延長(旧 第 6 引数 210000)は外した。90 秒(または gameOver)で必ず抜ける(runPartC の注記)。 */
        const r = await runPartC(browser, BASE, sid, 8, 90000);
        report.partC.push(r);
        const R = r.sample || (r.last && r.last.rescue);
        /* ⚠ 「選択に答えた回数」は**全シナリオで**出す。分岐を持たないシナリオでも隠し要素の
         *   対話 (砦のゴーレムの派閥識別など) でダイアログが開くことが実測で分かっている
         *   (2026-08-11: orc-fort で 1 回)。ここを分岐シナリオだけに出すと、代役が
         *   **黙って効いている**状態になり「実プレイのまま測っている」という主張が崩れる。 */
        console.log('    → ' + Math.round(r.elapsedMs / 1000) + 's (標本 90s) / 終了理由 ' + r.endReason +
          ' / title="' + (r.last && r.last.title) +
          '" / firstTileStep 呼び出し ' + (R ? R.calls : '?') +
          ' / 救済発火 ' + (R ? R.n : '?') + ' / 完全に進めず ' + (R ? R.hardFail : '?') +
          ' / 選択に答えた ' + r.dialogsAnswered + ' 回');
        check('(C-' + sid + ') 屋外テーマではない (既存シナリオである確認)',
          !!r.last && r.last.isFieldTheme === false, 'isFieldTheme=' + (r.last && r.last.isFieldTheme));
        check('(C-' + sid + ') 経路探索が実際に走った (標本が空でない)',
          !!R && R.calls > 0, 'firstTileStep 呼び出し=' + (R ? R.calls : 0) + ' 回');
        /* ★[#92] 分岐の状態は**観測してログに出すだけ**(assert しない)。
         *   旧 `(C-<sid>) ★?graph=auto が出口を自動選択して entry から前進した` は勝敗に依存して
         *   揺れていた(出口 0 本の森は永久に赤・Lv1 で主人公が entry で倒れる砦は決定的に赤・
         *   沼地/神殿/竜は勝敗しだいの二峰)。「`?graph=auto` が矢印もダイアログも出さずに出口を選ぶか」は
         *   STEP2 の装置ステージ(別ページ・entry の敵をテストダブルで倒してから測る)で見る。 */
        if (r.last && r.last.graphActive) {
          console.log('    分岐: entry=' + r.last.entryId + ' → 現在 ' + r.last.nodeId +
            ' / 訪問ノード ' + r.last.visitedN + ' 件' +
            ' / 自然な前進: ' + (r.advancedAt === null ? 'せず' : Math.round(r.advancedAt / 1000) + 's') +
            ' / 終了時のダイアログ ' + (r.last.dialogUp ? '開いたまま' : 'なし'));
        }
        check('(C-' + sid + ') pageerror 0', r.pageErrors.length === 0,
          r.pageErrors.slice(0, 3).join(' | ') || 'none');
      }
    }

    // ── 装置ステージ (#92 STEP2): ?graph=auto が矢印 0 で entry から前進するか (ダイアログは代役) ──
    if (!SKIP_DEVICE) {
      for (const sid of DUNGEONS) {
        mark('装置 ?graph=auto の前進 (entry の敵をテストダブルで倒す): ' + sid);
        const d = await runGraphAutoDevice(browser, BASE, sid, { killEnemies: true });
        report.device.push(d);
        const ex = '[' + (d.exits || []).join(',') + ']';
        if (!d.ready) {
          console.log('    → entry で敵が湧かなかった (' + d.endReason + ')');
        } else if (!d.inPopulation) {
          console.log('    (dev) ' + sid + ': entry ' + d.entryId + ' の出口 0 本 = 判定しない (母集団外)');
        } else {
          console.log('    → entry ' + d.entryId + ' / 出口 ' + ex + ' / 倒した ' + d.killed + ' 体 / ' +
            '終了 ' + d.endReason + (d.toNode ? ' → ' + d.toNode : '') +
            ' / 矢印 ' + d.arrows + ' / ダイアログ ' + d.dialogs + ' / gameOver ' + d.gameOver +
            ((d.dialogMsgs && d.dialogMsgs.length) ? ' / ダイアログ本文 ' + JSON.stringify(d.dialogMsgs) : ''));
        }
        /* ⚠ 湧かなかった (ready=false) ものは母集団の外へ黙って落とさない = (Cd-*) を赤にする。
         *   出口の数が読めていないので「出口 0 本だから判定しない」とは言えない。 */
        if (!d.ready || d.inPopulation) {
          /* ⚠ [ユーザー決定 A] ダイアログは合否に使わない(イベントのダイアログに代役で答える)。
           *   出口選択のダイアログは __autoplay 経路にしか無い = 自動選択が壊れたら出るのは矢印。 */
          check('(Cd-' + sid + ') ★?graph=auto が矢印を出さずに entry から前進した (イベントのダイアログには代役で答える)',
            devicePass(d),
            '倒した ' + d.killed + ' 体 / 出口 ' + ex + ' / 前進 ' +
            (d.advancedAt === null ? 'せず' : Math.round(d.advancedAt / 1000) + 's') +
            ' / 矢印 ' + d.arrows + ' / ダイアログ ' + d.dialogs + ' (答えた ' + d.dialogsAnswered + ')' +
            ((d.dialogMsgs && d.dialogMsgs.length) ? ' ' + JSON.stringify(d.dialogMsgs) : '') +
            (d.gameOver ? ' / gameOver' : '') + ' / 終了 ' + d.endReason);
        }
        check('(Cd-' + sid + ') 装置ページ pageerror 0', d.pageErrors.length === 0,
          d.pageErrors.slice(0, 3).join(' | ') || 'none');
      }
      /* ⚠ (Cd0) は**シナリオ名を書かない**。森が将来 2 ノードへ戻れば自然に判定へ入る。
       *   これが無いと全部「出口 0 本」に落ちたとき装置が空振り緑になる。 */
      const judged = report.device.filter(d => !d.ready || d.inPopulation).length;
      const withExits = report.device.filter(d => d.ready && d.inPopulation).length;
      const outside = report.device.filter(d => d.ready && !d.inPopulation).map(d => d.scenarioId);
      check('(Cd0) 装置の母集団 (判定した数 ≥1 かつ entry の出口 1 本以上の数と一致)',
        judged >= 1 && judged === withExits,
        '判定 ' + judged + ' / 出口 1 本以上 ' + withExits + ' / 母集団外 ' + outside.length +
        (outside.length ? ' (' + outside.join(',') + ')' : ''));
    }

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  // ── サマリ ────────────────────────────────────────────────────────────
  console.log('\n════════ STEP6 実測サマリ ════════');

  console.log('\n─── Part A [主]  帯幅 × 救済 の切断率マトリクス (シミュレータ ' +
              TRIALS + '試行 × ' + TURNS + '手番) ───');
  console.log('  アーム              切断率(手番)        平均切断列  移動失敗/試行   救済発火');
  for (const r of report.partA) {
    const g = r.agg;
    console.log('  ' + r.arm.padEnd(20) +
      ((g.turnsWithCut / g.turns * 100).toFixed(3) + '% (' + g.turnsWithCut + '/' + g.turns + ')').padEnd(20) +
      (g.cutColsSum / g.turns).toFixed(3).padStart(10) +
      (g.stuck + '/' + g.moveAttempts).padStart(16) +
      String(g.rescueFired).padStart(11));
  }
  const cutOf = (rows, rescue) => {
    const r = report.partA.find(x => x.rows === rows && x.rescue === rescue);
    return r ? r.agg.turnsWithCut / r.agg.turns * 100 : NaN;
  };

  if (report.partB.length) {
    console.log('\n─── Part B [絶対値]  実プレイ・帯3行 (STEP0 と同一のフレーム標本) ───');
    console.log('  ⚠️ 判定バー <1% はこの尺度。STEP0 の 3行実測は iphone_port 0.13% / desktop 2.26%。');
    console.log('  構成                          frames   切断率        最大同時敵  waves  救済発火  終了理由');
    for (const r of report.partB) {
      const a = r.dump.agg;
      console.log('  ' + (r.vp + '/' + (r.rescueBuild ? '救済あり' : '救済なし')).padEnd(30) +
        String(a.frames).padEnd(9) +
        ((a.frames ? (a.framesWithCut / a.frames * 100).toFixed(3) : 'n/a') + '%').padEnd(14) +
        String(a.maxFoes).padEnd(12) + (a.waves + '/3').padEnd(7) +
        String(r.dump.rescue ? r.dump.rescue.n : '-').padEnd(10) + r.reason);
    }
  }

  if (report.partC.length) {
    console.log('\n─── Part C [非退行]  既存6シナリオでの救済発火 ───');
    console.log('  ⚠️ 発火 0 件 = 第2の aStar すら走っていない = 挙動も RNG 消費も1バイト不変。');
    console.log('  シナリオ          firstTileStep 呼出   救済発火   完全に進めず   終了理由        自然な前進');
    let totalFired = 0, totalCalls = 0;
    for (const r of report.partC) {
      const R = r.sample || (r.last && r.last.rescue) || { calls: 0, n: 0, hardFail: 0 };
      totalFired += R.n; totalCalls += R.calls;
      console.log('  ' + r.scenarioId.padEnd(18) + String(R.calls).padStart(10) +
        String(R.n).padStart(13) + String(R.hardFail).padStart(15) + '   ' +
        String(r.endReason).padEnd(16) +
        (r.last && r.last.graphActive ? (r.advancedAt === null ? 'せず' : Math.round(r.advancedAt / 1000) + 's') : '-'));
    }
    console.log('  合計: 呼出 ' + totalCalls + ' 回 / 救済発火 ' + totalFired + ' 回 (' +
      (totalCalls ? (totalFired / totalCalls * 100).toFixed(4) : '0') + '%)');
    check('(C0) 既存6シナリオで経路探索の標本が十分ある', totalCalls >= 100,
      '合計 ' + totalCalls + ' 回');
    report.dungeonRescueFired = totalFired;
    report.dungeonCalls = totalCalls;
  }

  if (report.device.length) {
    console.log('\n─── 装置 (#92)  ?graph=auto が矢印 0 で entry から前進するか (ダイアログは代役) (entry の敵はテストダブルで倒す) ───');
    console.log('  シナリオ          entry  出口                 倒した  前進      矢印  ダイアログ  終了');
    for (const d of report.device) {
      console.log('  ' + d.scenarioId.padEnd(18) + String(d.entryId).padEnd(7) +
        ('[' + (d.exits || []).join(',') + ']').padEnd(21) + String(d.killed).padStart(6) + '  ' +
        (d.advancedAt === null ? 'せず' : Math.round(d.advancedAt / 1000) + 's').padEnd(10) +
        String(d.arrows).padStart(4) + String(d.dialogs).padStart(12) + '  ' +
        (d.ready && !d.inPopulation ? '母集団外 (出口 0 本)' : d.endReason));
    }
  }

  // ── ★判定 ────────────────────────────────────────────────────────────
  console.log('\n─── ★判定 ───');
  const a3off = cutOf(3, false), a3on = cutOf(3, true), a5off = cutOf(5, false), a5on = cutOf(5, true);
  const stuckOf = (rows, rescue) => {
    const r = report.partA.find(x => x.rows === rows && x.rescue === rescue);
    return r ? { stuck: r.agg.stuck, att: r.agg.moveAttempts } : { stuck: NaN, att: NaN };
  };
  const s3off = stuckOf(3, false), s3on = stuckOf(3, true);

  // ★Part A で最初に見るのは「移動不能(stuck)」であって切断率ではない。理由:
  //   シミュレータは戦闘解決をしない = 誰も死なないので、全ユニットが最終的にリーダーへ
  //   収束して停止する。救済ありだと**収束を完遂できる**ぶん塊が密になり、
  //   「全行が埋まった列」は増えうる。つまりこの構成の切断率は「詰まり」ではなく
  //   「寄り集まりの密度」を測ってしまう。切断が有害なのは"通れなくなる"からであり、
  //   救済はまさにその含意を断ち切る修正なので、救済の可否を切断率だけで採点すると
  //   計器と目的が噛み合わない。詰まりの直接計測は stuck、
  //   実プレイ相当の絶対値は Part B (死亡とウェーブが入る) で見る。
  if (!report.partA.length) console.log('  (Part A は --skip-a のため未計測)');
  else {
  console.log('  Part A [直接指標] 移動不能 (行きたいのに1歩も出られなかった回数):');
  console.log('    3行  救済なし ' + s3off.stuck + '/' + s3off.att +
    ' (' + (s3off.att ? (s3off.stuck / s3off.att * 100).toFixed(2) : '0') + '%)' +
    '  →  救済あり ' + s3on.stuck + '/' + s3on.att +
    ' (' + (s3on.att ? (s3on.stuck / s3on.att * 100).toFixed(2) : '0') + '%)');
  console.log('  Part A [参考] 切断率: 3行 ' + a3off.toFixed(3) + '% → ' + a3on.toFixed(3) + '%' +
    '   5行 ' + a5off.toFixed(3) + '% → ' + a5on.toFixed(3) + '%');
  console.log('    ※ 誰も死なない構成では救済ありのほうが収束が密になるため切断率は上がりうる。');
  console.log('       この構成の切断率は「詰まり」ではなく「寄り集まりの密度」を測っている。');
  check('(J1) ★救済が帯3行の移動デッドロックを解消した (stuck が減った)',
    s3on.stuck < s3off.stuck,
    '移動不能 ' + s3off.stuck + ' → ' + s3on.stuck + ' 回 / ' + s3on.att + ' 試行');
  check('(J1b) 帯3行+救済ありで移動不能が根絶された (stuck === 0)',
    s3on.stuck === 0, '移動不能 ' + s3on.stuck + ' 回');
  check('(J1c) 帯5行は救済ありで詰まりが根絶される',
    stuckOf(5, true).stuck === 0 && stuckOf(5, false).stuck > 0,
    '5行: 救済なし ' + stuckOf(5, false).stuck + ' 回 → 救済あり ' + stuckOf(5, true).stuck + ' 回');
  }
  // ── ★受け入れ基準の差し替え (2026-07-19 orchestrator 判断) ──────────────
  // 旧基準「実プレイ切断率 < 1%」は**無効**。較正が壊れているため。
  //   ・旧 <1% は STEP0 が**帯の出荷前**に採った数字 (0.13/2.26/4.34%)。当時ユニットは
  //     row 12-18 に散っており、帯3行(row13-15)内に居た割合は iphone_land で 66.3% しかなかった。
  //     3行のうち1行でも空けば「切断」にならないので、散っている地図では構造的に低く出る。
  //   ・STEP1 で帯が出荷された今、帯内率は 99.4% (実測)。同じ定義でも母集団が別物になった。
  //     STEP0 ドライバを帯出荷後に再走させると 7.56%/11.05% に跳ね上がる (scratchpad の JSON)。
  //   ・**存在しない地図の基準に PASS/FAIL を出しても意味がない**ので基準ごと差し替える。
  // 新基準 = stuck === 0 (移動不能の直接測定)。救済の目的そのものであり、
  //   「切断列を減らす」ではなく「切断列を通れるようにする」という修正の性質と一致する。
  // ⚠️ 切断率は依然として記録する。上がるのは「密集して見える」ことを意味するので、
  //    実機体感テストの観察項目として残す (数値としての合否には使わない)。
  const bOn = report.partB.filter(r => r.rescueBuild && r.dump.agg.frames > 0);
  if (bOn.length) {
    const worst = bOn.reduce((m, r) => Math.max(m, r.dump.agg.framesWithCut / r.dump.agg.frames * 100), 0);
    const worstBase = report.partB.filter(r => !r.rescueBuild && r.dump.agg.frames > 0)
      .reduce((m, r) => Math.max(m, r.dump.agg.framesWithCut / r.dump.agg.frames * 100), 0);
    console.log('  Part B [参考・合否には使わない] 実プレイ切断率 最悪: 救済なし ' +
      worstBase.toFixed(3) + '%  /  救済あり ' + worst.toFixed(3) + '%');
    console.log('    ※ 旧基準 <1% は帯出荷**前**の較正 (帯内率 66.3%) なので無効。');
    console.log('       救済なし側も ' + worstBase.toFixed(1) + '% で、バー未達は救済のせいではない。');
    report.verdictWorstLiveCut = worst;
    report.verdictWorstLiveCutBaseline = worstBase;
  }
  if (report.partA.length) {
    check('(J2) ★[新基準] 帯3行+救済ありで移動デッドロックが根絶されている (stuck === 0)',
      s3on.stuck === 0 && s3off.stuck > 0,
      '救済なし ' + s3off.stuck + ' 回 → 救済あり ' + s3on.stuck + ' 回');
  }

  const outFile = path.join(OUT_DIR, 'field_step6_metrics.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
  console.log('\n[drv] 実測値 JSON: ' + outFile);

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
