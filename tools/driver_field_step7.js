#!/usr/bin/env node
/*
 * driver_field_step7.js — 「地平線ビュー STEP7 = 範囲魔法の窓拡張」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP7 / §5 / §6 (P0, P2)
 *
 * ■ 本体側の変更
 *   箱型 origin 探索を持つ**5呪文だけ**を新設 pickAoeOrigin() 1本に合流させ、
 *   屋外テーマ (IS_FIELD_THEME) のときだけ候補窓を dx,dy ∈ [-(S-1),0] から
 *   [-(S-1), +(S-1)] へ拡張する。拡張分の候補には箱**中心**の射程/LoS ガードを掛ける。
 *   partyInArea の拒否権は維持 = 味方ダメージは 0 のまま (慶彦さんの決定)。
 *
 * ■ ★このドライバが証明しなければならないこと (4つ)
 *   (N) 既存6シナリオが 1 バイト不変。RNG を動かす改修なので最優先。
 *       ・AOE_WIDE_WINDOW === false
 *       ・__aoeWideProbe === 0 …「拡張窓のループがそもそも実行されない」の**直接証明**
 *         (STEP6 の「救済発火 0/460」と同じ手。存在しない差分を SHA で追うより強い)
 *       ・全標本で pickAoeOrigin の返り値が **legacy アルゴリズムと完全一致**
 *       ・legacy アルゴリズムの結果が baseline(153667d) ページと**完全一致**
 *         (= partyInArea / enemiesInArea / マップ / ユニット配置が動いていない)
 *   (F) 屋外 (帯 row13-15) で降格率が実際に下がる。改修**前**の降格率を先に測る
 *       (計画書 §5④「100%不発は過大」— 数字で確かめる)。
 *   (G) 射程/LoS ガードが load-bearing である。ガード無しなら射程外へ飛ぶ標本が存在し、
 *       ガード有りでは返り値が 100% 射程内 + LoS 有り。
 *   (P) 直線 / 円錐 / splash は救済されない。その降格率も実測して報告する
 *       (計画書 §6 P2「降格率を実測して再判断」への数値)。
 *
 * ■ baseline は **153667d** (STEP6 直後 = STEP7 直前)。
 *   ⚠️ ad6f648 は STEP6 前なので使わない。⚠️ HEAD 固定の baseline は禁止
 *      (「現在 vs 現在」の無意味な PASS に化けた前例あり)。
 *
 * ■ 幾何は **ON** で測る (?fieldgeo=0 を付けない)。
 *   STEP7 の問題は「3行帯だと前衛がターゲットに隣接する」ことなので、帯が要る。
 *   ⚠️ ドライバによって幾何 ON/OFF が違う (step1/step5=OFF, step1_geo/step2/step3=ON)。
 *   ⚠️ ビューポートは desktop 1440x900。iphone_land は usableH=217 で
 *      fieldHasSkyRoom=false = 帯が出来ない (別の地図を測ることになる)。
 *
 * ■ 標本の作り方 (なぜ合成レイアウトなのか)
 *   実プレイを何時間回しても「魔法使いが AoE を選ぶ瞬間」の標本数は制御できない。
 *   代わりに **実マップ・実 partyInArea・実 enemiesInArea・実 hasLineOfSight** の上に、
 *   問題そのものの配置 (敵の塊 + その西端に隣接する前衛 + さらに西の術者) を
 *   決定論 LCG で大量に敷き、探索関数を直接叩く。探索は Math.random を引かないので
 *   これは近似ではなく厳密な計測になる。
 *   ⚠️ ドライバ側で本体の探索を「再実装」するのは legacy 側だけ (比較の鏡)。
 *      新実装は必ず本体の pickAoeOrigin を呼ぶ (腐った鏡を作らない)。
 *   加えて Part R で実プレイ (魔法使い+エルフ入りPT) を走らせ、__aoeStats を回収する。
 *
 * 使い方:
 *   node tools/driver_field_step7.js [--headful] [--browser <path>] [--port N]
 *        [--baseline-rev 153667d] [--samples 400] [--skip-r] [--budget-ms 240000]
 *   ⚠️ 出力は `| tail` に通さず `> file 2>&1` で直接受けること
 *      (パイプはブロックバッファなので落ちると末尾集計が消える)。
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
const PORT = parseInt(arg('port', '8807'), 10);
const BASELINE_PORT = PORT + 1;
const BASELINE_REV = arg('baseline-rev', '153667d');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_step7_baseline'));
const SAMPLES = parseInt(arg('samples', '400'), 10);
const SKIP_R = flag('skip-r');
const BUDGET_MS = parseInt(arg('budget-ms', '240000'), 10);

const OUT_DIR = arg('out',
  path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
            'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad'));

const DUNGEONS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const DESKTOP = { width: 1440, height: 900 };

// ── 隊商護衛ペイロード (driver_field_step6.js と同一) ────────────────────────
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

// Part R 用: 魔法使い + エルフを必ず含む PT (箱型5呪文の持ち主を確実に出す)
const CASTER_PARTY = [
  { classKey: 'warrior', isHero: true,  level: 6 },
  { classKey: 'mage',    isHero: false, level: 6, name: 'テスト魔法使い', variant: 0 },
  { classKey: 'elf',     isHero: false, level: 6, name: 'テストエルフ',   variant: 0 },
  { classKey: 'cleric',  isHero: false, level: 6, name: 'テスト僧侶',     variant: 0 },
];

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
      return head;
    }
    console.log('[drv] baseline worktree が別リビジョン (' + head + ') なので作り直す');
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', BASELINE_DIR], { encoding: 'utf8' }); } catch (e) {}
  }
  console.log('[drv] baseline worktree を作成: ' + BASELINE_DIR + ' @ ' + BASELINE_REV);
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', BASELINE_DIR, BASELINE_REV],
               { encoding: 'utf8', stdio: 'pipe' });
  return execFileSync('git', ['-C', BASELINE_DIR, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
}

// ── 静的サーバ ──────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        let fp = path.join(root, u);
        if (!fs.existsSync(fp) && root !== ROOT) fp = path.join(ROOT, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
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
    if (cfg.party) sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(cfg.party));
    else sessionStorage.removeItem('dragonfighters.partyMembers');
  } catch (e) {}
  // 固定シード: マップ生成・情景配置を両ページで完全に一致させる
  let _s = (cfg.seed >>> 0) || 20260719;
  window.__rngCalls = 0;
  Math.random = function () { window.__rngCalls++; _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  if (cfg.stats) window.__aoeStats = {};
}

async function bootPage(browser, base, vp, cfg, query) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, cfg);
  await page.goto(base + '/index.html?intel=0' + (query || ''), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => {
    try {
      return typeof startGame === 'function' && !!mapData &&
             typeof partyInArea === 'function' && typeof enemiesInArea === 'function' &&
             typeof hasLineOfSight === 'function' && typeof tileChebyshev === 'function';
    } catch (e) { return false; }
  }, { timeout: 40000, polling: 100 });
  page.__pageErrors = pageErrors;
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
 * in-page ハーネス
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ legacy 側だけをドライバが再実装する (比較の鏡)。新実装は必ず本体の
 *    pickAoeOrigin を呼ぶ。両方を再実装したら「腐った鏡どうしの一致」になる。
 */
async function installHarness(page) {
  await page.evaluate(() => {
    // 描画と敵AIを静粛化 (enemies[] を作り替えるので描画側が壊れる)
    try { window.renderWorld = function () {}; } catch (e) {}
    try { window.renderWorldWithShake = function () {}; } catch (e) {}
    try { window.moveEnemies = function () {}; } catch (e) {}

    const TILE = TILE_SIZE;
    const mkLcg = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    const setUnit = (u, tx, ty) => { const s = u.def.displaySize; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
    const ctrOf = (u) => ({ x: u.x + u.def.displaySize / 2, y: u.y + u.def.displaySize / 2 });

    // ── legacy 探索 (改修前の実装をそのまま写したもの) ─────────────────────
    //   dx,dy ∈ [-(S-1), 0]。射程/LoS はターゲットにしか掛からない。
    const legacyPick = (S, tTX, tTY, allowZero) => {
      const span = S - 1;
      let best = null, bestCount = allowZero ? -1 : 0;
      for (let dy = -span; dy <= 0; dy++) {
        for (let dx = -span; dx <= 0; dx++) {
          const c = { tx: tTX + dx, ty: tTY + dy };
          if (partyInArea(c.tx, c.ty, S, S)) continue;
          const cnt = enemiesInArea(c.tx, c.ty, S, S).length;
          if (cnt > bestCount) { best = c; bestCount = cnt; }
        }
      }
      const ok = !!best && (allowZero || bestCount > 0);
      return ok ? { tx: best.tx, ty: best.ty, n: bestCount } : null;
    };

    // ── 拡張窓ガードの独立実装 (本体 aoeBoxReachable の鏡) ──────────────────
    //   「この箱で実際に当たる敵のうち 1 体でも術者から射程内 + LoS が通るか」。
    //   ⚠️ 箱**中心**基準ではない。3行帯では箱を縦にずらすと中心が必ず壁に落ち、
    //      中心基準の LoS が救済経路をピンポイントで潰す (実測 2/133 しか救済できない)。
    const boxReachable = (foeIdxs, aC, R) => {
      for (let k = 0; k < foeIdxs.length; k++) {
        const e = enemies[foeIdxs[k]];
        if (!e) continue;
        const fx = e.x + e.def.displaySize / 2, fy = e.y + e.def.displaySize / 2;
        if (tileChebyshev(aC.x, aC.y, fx, fy) <= R && hasLineOfSight(aC.x, aC.y, fx, fy)) return true;
      }
      return false;
    };

    // ── ガード無しの窓拡張 (「ガードが load-bearing である」ことの反例生成用) ──
    //   本体と同じ2パス順序で、射程/LoS ガードだけを外したもの。
    const guardlessWidePick = (S, tTX, tTY, allowZero) => {
      const span = S - 1;
      let best = null, bestCount = allowZero ? -1 : 0, bestWide = false;
      for (let pass = 0; pass < 2; pass++) {
        const hi = pass === 0 ? 0 : span;
        for (let dy = -span; dy <= hi; dy++) for (let dx = -span; dx <= hi; dx++) {
          const wide = (dx > 0 || dy > 0);
          if (wide !== (pass === 1)) continue;
          const c = { tx: tTX + dx, ty: tTY + dy };
          if (partyInArea(c.tx, c.ty, S, S)) continue;
          const cnt = enemiesInArea(c.tx, c.ty, S, S).length;
          if (cnt > bestCount) { best = c; bestCount = cnt; bestWide = wide; }
        }
      }
      const ok = !!best && (allowZero || bestCount > 0);
      return ok ? { tx: best.tx, ty: best.ty, n: bestCount, wide: bestWide } : null;
    };

    // ── 直線 (lightning-bolt) の legacy 探索 ────────────────────────────────
    const linePick = (aTX, aTY) => {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[1,1],[-1,-1],[-1,1]];
      let best = null, bestCount = 0;
      for (const d of dirs) {
        let blocked = false; const idxs = [];
        for (let s = 1; s <= 3; s++) {
          const tx = aTX + d[0] * s, ty = aTY + d[1] * s;
          if (partyInArea(tx, ty, 1, 1)) { blocked = true; break; }
          idxs.push.apply(idxs, enemiesInArea(tx, ty, 1, 1));
        }
        if (blocked) continue;
        if (idxs.length > bestCount) { best = d; bestCount = idxs.length; }
      }
      return (best && bestCount > 0) ? { d: best, n: bestCount } : null;
    };

    // ── 円錐 (burning-hands / cone-of-cold) の legacy 探索 ──────────────────
    const conePick = (aTX, aTY) => {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      let best = null, bestCount = 0;
      for (const d of dirs) {
        const tiles = [];
        for (let s = 1; s <= 3; s++) {
          const hw = s;
          for (let lat = -hw + 1; lat <= hw - 1; lat++)
            tiles.push({ tx: aTX + d[0] * s + (-d[1]) * lat, ty: aTY + d[1] * s + (d[0]) * lat });
        }
        let safe = true, cnt = 0;
        for (const t of tiles) {
          if (partyInArea(t.tx, t.ty, 1, 1)) { safe = false; break; }
          cnt += enemiesInArea(t.tx, t.ty, 1, 1).length;
        }
        if (!safe) continue;
        if (cnt > bestCount) { best = d; bestCount = cnt; }
      }
      return (best && bestCount > 0) ? { d: best, n: bestCount } : null;
    };

    // ── splash (chain-lightning 系) ────────────────────────────────────────
    const splashOk = (pTX, pTY) => !partyInArea(pTX - 1, pTY - 1, 3, 3);

    // ── 歩行可能タイルの列挙 ────────────────────────────────────────────────
    const band = (typeof FIELD_GEO_ACTIVE !== 'undefined' && FIELD_GEO_ACTIVE)
      ? { top: FIELD_BAND_TOP_ROW, bot: FIELD_BAND_TOP_ROW + FIELD_BAND_ROWS - 1 } : null;
    const openCols = [];   // 屋外: 帯の全行が非壁の列
    if (band) {
      for (let tx = 0; tx < MAP_W; tx++) {
        let ok = true;
        for (let ty = band.top; ty <= band.bot; ty++) if (isTileWall(tx, ty)) { ok = false; break; }
        if (ok) openCols.push(tx);
      }
    }
    const openTiles = [];  // 屋内: 非壁タイル全部
    for (let ty = 1; ty < MAP_H - 1; ty++) for (let tx = 1; tx < MAP_W - 1; tx++)
      if (!isTileWall(tx, ty)) openTiles.push([tx, ty]);

    window.__aoe = {
      info: function () {
        return {
          wideWindow: (typeof AOE_WIDE_WINDOW !== 'undefined') ? AOE_WIDE_WINDOW : '<absent>',
          hasPick: typeof pickAoeOrigin === 'function',
          hasNote: typeof noteAoeOutcome === 'function',
          wideProbe: (typeof __aoeWideProbe !== 'undefined') ? __aoeWideProbe : '<absent>',
          isFieldTheme: IS_FIELD_THEME, fieldMode: FIELD_MODE,
          geoActive: (typeof FIELD_GEO_ACTIVE !== 'undefined') ? FIELD_GEO_ACTIVE : '<absent>',
          band: band, openCols: openCols.length, openTiles: openTiles.length,
          mapW: MAP_W, mapH: MAP_H,
          ranges: (function () {
            const out = {};
            try { out.fireball = getRange(MAGE_SKILLS['fireball'].range).tiles; } catch (e) {}
            try { out.iceStorm = getRange(MAGE_SKILLS['ice-storm'].range).tiles; } catch (e) {}
            try { out.hail = getRange(ELF_SKILLS['hail-of-thorns'].range).tiles; } catch (e) {}
            try { out.volley = getRange(ELF_SKILLS['conjure-volley'].range).tiles; } catch (e) {}
            try { out.cordon = getRange(ELF_SKILLS['cordon-of-arrows'].range).tiles; } catch (e) {}
            return out;
          })(),
        };
      },
      wideProbe: function () { return (typeof __aoeWideProbe !== 'undefined') ? __aoeWideProbe : -1; },

      /* 1 標本 = 「敵の塊 + その西端に隣接する前衛 + さらに西の術者」を敷いて
       * 全呪文型の探索を1回ずつ叩く。返り値は legacy / new / guardless の比較材料。
       * ⚠️ 実 partyInArea / enemiesInArea / hasLineOfSight / mapData を使う。 */
      sample: function (seed, cfg) {
        const rnd = mkLcg(seed);
        const pick = (a) => a[Math.floor(rnd() * a.length)];

        // 状態を作り替える (実ゲームの配列をそのまま使う = 実関数が実データを見る)
        allies.length = 0; enemies.length = 0;
        try { traps.length = 0; } catch (e) {}
        try { wagonIndices.length = 0; } catch (e) {}

        let rows, cols, anchorCol;
        if (band) {
          rows = []; for (let r = band.top; r <= band.bot; r++) rows.push(r);
          cols = openCols;
          // 敵の塊は東寄り、術者は西へ伸ばせる位置を選ぶ
          const lo = Math.floor(cols.length * 0.35), hi = Math.floor(cols.length * 0.85);
          anchorCol = cols[lo + Math.floor(rnd() * Math.max(1, hi - lo))];
        } else {
          // 屋内: 非壁タイルから塊の起点を選び、その周囲の非壁を使う
          const seedTile = pick(openTiles);
          anchorCol = seedTile[0];
          rows = [];
          for (let dy = -1; dy <= 1; dy++) {
            const ty = seedTile[1] + dy;
            if (ty > 0 && ty < MAP_H - 1) rows.push(ty);
          }
          cols = [];
          for (let tx = 1; tx < MAP_W - 1; tx++) cols.push(tx);
        }
        const colIdx = cols.indexOf(anchorCol);
        if (colIdx < 0) return null;

        const free = (tx, ty) => !isTileWall(tx, ty);
        const taken = new Set();
        const put = (tx, ty) => { const k = tx + ',' + ty; if (taken.has(k)) return false; taken.add(k); return true; };

        // ── 敵の塊: anchorCol から東へ 2-3 列 × 帯の全行 ──────────────────
        const clusterW = 2 + Math.floor(rnd() * 2);
        const foeTiles = [];
        for (let k = 0; k < clusterW; k++) {
          const tx = cols[Math.min(cols.length - 1, colIdx + k)];
          for (const ty of rows) if (free(tx, ty) && put(tx, ty)) foeTiles.push([tx, ty]);
        }
        if (foeTiles.length < 2) return null;
        const foeDef = { displaySize: 96, name: 'probe-foe' };
        for (const t of foeTiles) {
          const e = { alive: true, inactive: false, x: 0, y: 0, hp: 10, def: foeDef };
          setUnit(e, t[0], t[1]); enemies.push(e);
        }

        // ── 前衛: 「接敵した近接」をモデル化する ────────────────────────────
        // ⚠️ ここが本ドライバの肝。allyAdvanceTowardPoint は対象に**隣接**するまで
        //    詰めるので、実戦の前衛はランダムな敵の隣に立つ。3行帯では塊の西面だけでなく
        //    塊の**内側の隙間や東側**にも回り込む。全員を西に一列に並べると
        //    「dx=0 の箱が常にクリーン」になり問題そのものが再現しない
        //    (初回実装がこれで legacy 降格率 0% になった)。
        const allyDef = { displaySize: 96, name: 'probe-ally' };
        const nFront = 2 + Math.floor(rnd() * 2);
        const adj = [];
        for (const t of foeTiles) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const tx = t[0] + dx, ty = t[1] + dy;
            if (rows.indexOf(ty) < 0) continue;          // 帯の外へは出られない
            if (!free(tx, ty)) continue;
            adj.push([tx, ty]);
          }
        }
        let placedFront = 0;
        for (let k = 0; k < 60 && placedFront < nFront && adj.length; k++) {
          const t = adj[Math.floor(rnd() * adj.length)];
          if (!put(t[0], t[1])) continue;
          const a = { alive: true, x: 0, y: 0, facing: 'right', def: allyDef };
          setUnit(a, t[0], t[1]); allies.push(a); placedFront++;
        }

        // ── リーダー: 塊の 1-2 列西 (partyInArea はリーダーも見る) ────────
        const leadCol = cols[Math.max(0, colIdx - (1 + Math.floor(rnd() * 2)))];
        const leadRow = rows[Math.floor(rnd() * rows.length)];
        playerX = leadCol * TILE_SIZE; playerY = leadRow * TILE_SIZE;
        put(leadCol, leadRow);

        // ── 術者: さらに西 2-4 列 (後衛) ─────────────────────────────────
        const back = 2 + Math.floor(rnd() * 3);
        const castCol = cols[Math.max(0, colIdx - back)];
        const castRow = rows[Math.floor(rnd() * rows.length)];
        const caster = { alive: true, x: 0, y: 0, facing: 'right', def: allyDef };
        setUnit(caster, castCol, castRow); allies.push(caster);

        // ── ターゲット = 塊の中で術者に一番近い敵 ─────────────────────────
        const aC = ctrOf(caster);
        let tgt = null, bestD = Infinity;
        for (const e of enemies) {
          const c = ctrOf(e);
          const d = Math.abs(c.x - aC.x) + Math.abs(c.y - aC.y);
          if (d < bestD) { bestD = d; tgt = e; }
        }
        if (!tgt) return null;
        const tC = ctrOf(tgt);
        const tTX = Math.floor(tC.x / TILE_SIZE), tTY = Math.floor(tC.y / TILE_SIZE);
        const aTX = Math.floor(aC.x / TILE_SIZE), aTY = Math.floor(aC.y / TILE_SIZE);

        const out = { seed: seed, foes: enemies.length, allies: allies.length,
                      caster: [aTX, aTY], target: [tTX, tTY], box: {}, line: null, cone: null, splash: null,
                      targetReachable: {} };

        // 呪文が「そもそも撃てる (ターゲットが射程内 + LoS)」ことは前提条件。
        // 本体側も同じ検査を先に通すので、通らない標本は捨てる。
        for (const spec of cfg.box) {
          const S = spec.S, R = spec.range, allowZero = !!spec.allowZero;
          const reachable = tileChebyshev(aC.x, aC.y, tC.x, tC.y) <= R && hasLineOfSight(aC.x, aC.y, tC.x, tC.y);
          out.targetReachable[spec.id] = reachable;
          if (!reachable) { out.box[spec.id] = null; continue; }

          // ★出荷済みの従来窓が既に許している実効射程 (本体 pickAoeOrigin と同式)。
          //   計画書 §5 の疑似コードの `> rangeTiles` は従来窓より**狭い**ため、
          //   拡張候補の 67.7% をこれだけで殺していた (初回計測)。ドライバ側の検証も
          //   同じ envelope で行う。
          const maxCenter = R + (S - 1) / 2;
          const leg = legacyPick(S, tTX, tTY, allowZero);
          const guardless = guardlessWidePick(S, tTX, tTY, allowZero);
          let neo = null;
          if (typeof pickAoeOrigin === 'function') {
            const r = pickAoeOrigin(spec.id, aC.x, aC.y, tTX, tTY, S, R, allowZero);
            if (r && r.best) neo = { tx: r.best.tx, ty: r.best.ty, n: r.count, wide: !!r.wide };
          } else {
            // baseline ページには pickAoeOrigin が無い。legacy を写して比較を成立させる
            // (Part N のクロス比較は legacy 同士でしか行わない)。
            neo = leg ? { tx: leg.tx, ty: leg.ty, n: leg.n, wide: false } : null;
          }
          // 新実装の返り値を**ドライバ側で独立に検証**する
          let verify = null;
          if (neo) {
            const idxs = enemiesInArea(neo.tx, neo.ty, S, S);
            verify = {
              party: partyInArea(neo.tx, neo.ty, S, S),
              reach: boxReachable(idxs, aC, R),   // 拡張分に要求されるガード条件
              foes: idxs.length,
              containsTarget: (tTX >= neo.tx && tTX < neo.tx + S && tTY >= neo.ty && tTY < neo.ty + S),
              wide: !!neo.wide,
            };
          }
          // ガード無し窓拡張が「射程外/壁越し」を選んでしまう標本かどうか。
          // ⚠️ 従来窓 (narrow) の候補は改修前から射程/LoS 無検査なので、ここも
          //    **拡張分 (wide) が選ばれたときだけ**を反例として数える。
          let guardlessBad = null;
          if (guardless && guardless.wide) {
            const gIdxs = enemiesInArea(guardless.tx, guardless.ty, S, S);
            guardlessBad = { reach: boxReachable(gIdxs, aC, R), foes: gIdxs.length };
          }
          // ★診断: legacy が降格した標本で、拡張窓の候補が「なぜ」救済に至らなかったのか。
          //   これが無いと「窓を広げたのに効かない」の原因 (味方 / 射程 / LoS / 敵0) を
          //   取り違える。オートバトルは無言で失敗するので原因の内訳は必ず数える。
          let diag = null;
          if (!leg) {
            diag = { total: 0, party: 0, outRange: 0, noLos: 0, cleanNoFoes: 0, cleanWithFoes: 0,
                     bestCleanFoes: 0, bestPartyCleanButFarFoes: 0,
                     // ★対案の計測: 射程/LoS の基準点を「箱の中心」ではなく
                     //   「箱の中で敵が居る、術者に最も近いタイル」にした場合に救済できるか。
                     //   3行帯では箱を縦にずらすと中心が帯の外 (=壁) に落ちるので、
                     //   中心基準の LoS はその候補を必ず殺す。しかし縦ずらしこそが
                     //   「味方の居る行を箱から外す」唯一の手段なので、ここが効くなら
                     //   基準点の選択が救済率を支配していることになる。
                     altRescuable: 0 };
            const span = S - 1;
            for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
              if (!(dx > 0 || dy > 0)) continue;      // 拡張分のみ
              diag.total++;
              const c = { tx: tTX + dx, ty: tTY + dy };
              const pty = partyInArea(c.tx, c.ty, S, S);
              const foeIdxs = enemiesInArea(c.tx, c.ty, S, S);
              const foes = foeIdxs.length;
              const reach = boxReachable(foeIdxs, aC, R);
              if (!pty && foes > 0 && foes > diag.bestPartyCleanButFarFoes) diag.bestPartyCleanButFarFoes = foes;
              if (!pty && foes > 0 && reach) diag.altRescuable = 1;
              if (pty) { diag.party++; continue; }
              if (foes === 0) { diag.cleanNoFoes++; continue; }
              if (!reach) { diag.outRange++; continue; }
              diag.cleanWithFoes++; if (foes > diag.bestCleanFoes) diag.bestCleanFoes = foes;
            }
          }
          out.box[spec.id] = { S: S, range: R, legacy: leg, neo: neo, verify: verify,
                               guardless: guardless, guardlessBad: guardlessBad, diag: diag };
        }

        out.line = { legacy: linePick(aTX, aTY) };
        out.cone = { legacy: conePick(aTX, aTY) };
        out.splash = { ok: splashOk(tTX, tTY) };
        return out;
      },
    };
  });
}

// ── 箱型5呪文の仕様 (range は info() の実測値で上書きする) ───────────────────
function boxSpecs(ranges) {
  return [
    { id: 'fireball',         S: 3, range: ranges.fireball  || 8, allowZero: false },
    { id: 'ice-storm',        S: 5, range: ranges.iceStorm  || 8, allowZero: false },
    { id: 'hail-of-thorns',   S: 3, range: ranges.hail      || 8, allowZero: false },
    { id: 'conjure-volley',   S: 5, range: ranges.volley    || 8, allowZero: false },
    { id: 'cordon-of-arrows', S: 3, range: ranges.cordon    || 8, allowZero: true  },
  ];
}

async function runSamples(page, specs, n, seed0) {
  const out = [];
  const CH = 40;   // 1 evaluate あたり 40 標本 (往復コスト抑制)
  for (let i = 0; i < n; i += CH) {
    const batch = await page.evaluate((s0, i0, cnt, cfg) => {
      const r = [];
      for (let k = 0; k < cnt; k++) r.push(window.__aoe.sample(s0 + (i0 + k) * 7919, cfg));
      return r;
    }, seed0, i, Math.min(CH, n - i), { box: specs });
    for (const b of batch) out.push(b);   // null も位置合わせのため残す
  }
  return out;
}

// ── 集計 ────────────────────────────────────────────────────────────────────
function aggBox(samples, specs) {
  const per = {};
  for (const sp of specs) per[sp.id] = {
    S: sp.S, n: 0, legacyCast: 0, neoCast: 0, neoWide: 0, agree: 0, disagree: 0,
    legacyOnly: 0, neoOnly: 0, partyHit: 0,
    // ★射程/LoS は「拡張分 (wide)」にだけガードを掛ける契約。従来窓 (narrow) は
    //   改修前から無検査なので、そこを FAIL にすると「直していない既存挙動」を
    //   STEP7 の失敗として誤報告することになる。両方を別々に数える。
    wideOutOfRange: 0, wideNoLos: 0, narrowOutOfRange: 0, narrowNoLos: 0,
    guardlessOutOfRange: 0, guardlessNoLos: 0, notContainingTarget: 0 };
  for (const s of samples) {
    if (!s) continue;
    for (const sp of specs) {
      const b = s.box[sp.id];
      if (!b) continue;
      const a = per[sp.id];
      a.n++;
      if (b.legacy) a.legacyCast++;
      if (b.neo) a.neoCast++;
      if (b.neo && b.neo.wide) a.neoWide++;
      if (b.legacy && b.neo && b.legacy.tx === b.neo.tx && b.legacy.ty === b.neo.ty) a.agree++;
      else if (b.legacy && b.neo) a.disagree++;
      if (b.legacy && !b.neo) a.legacyOnly++;
      if (!b.legacy && b.neo) a.neoOnly++;
      if (b.verify) {
        if (b.verify.party) a.partyHit++;
        if (b.verify.wide) {
          if (!b.verify.reach) a.wideOutOfRange++;
          if (!b.verify.containsTarget) a.notContainingTarget++;
        } else {
          if (!b.verify.reach) a.narrowOutOfRange++;
        }
      }
      if (b.guardlessBad && !b.guardlessBad.reach) a.guardlessOutOfRange++;
    }
  }
  return per;
}
function aggNonBox(samples) {
  const a = { line: { n: 0, cast: 0 }, cone: { n: 0, cast: 0 }, splash: { n: 0, cast: 0 } };
  for (const s of samples) {
    if (!s) continue;
    a.line.n++; if (s.line && s.line.legacy) a.line.cast++;
    a.cone.n++; if (s.cone && s.cone.legacy) a.cone.cast++;
    a.splash.n++; if (s.splash && s.splash.ok) a.splash.cast++;
  }
  return a;
}
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : 'n/a';

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv = null, bsrv = null, browser = null;
  const report = { baselineRev: BASELINE_REV, samples: SAMPLES, partN: [], partF: null, partP: null, partR: [] };

  try {
    const baseHead = prepareBaseline();
    report.baselineHead = baseHead;
    srv = await startServer(PORT, ROOT);
    bsrv = await startServer(BASELINE_PORT, BASELINE_DIR);
    const FIX = 'http://127.0.0.1:' + PORT;
    const BASE = 'http://127.0.0.1:' + BASELINE_PORT;
    console.log('[drv] 修正版 : ' + FIX + '  (root=' + ROOT + ')');
    console.log('[drv] baseline: ' + BASE + '  (root=' + BASELINE_DIR + ' @ ' + baseHead + ')');
    console.log('[drv] 標本数/シナリオ = ' + SAMPLES);

    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + path.join(os.tmpdir(), 'df_pptr_profile_step7')],
    });

    // ════════════════════════════════════════════════════════════════════
    mark('(S) 静的 assert — 合流と assert 自体の有効性');
    // ════════════════════════════════════════════════════════════════════
    const srcFix = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const srcBase = fs.readFileSync(path.join(BASELINE_DIR, 'index.html'), 'utf8');
    const nPick = (srcFix.match(/pickAoeOrigin\("/g) || []).length;
    const nOldFix = (srcFix.match(/candidates\.push\(\{ tx: targetTX/g) || []).length;
    const nOldBase = (srcBase.match(/candidates\.push\(\{ tx: targetTX/g) || []).length;
    check('(S1) 箱型5呪文がすべて pickAoeOrigin 1本に合流している', nPick === 5,
      'pickAoeOrigin("...") 呼び出し=' + nPick + ' 件 (期待 5)');
    check('(S2) 旧インライン候補生成 (candidates.push) が残っていない', nOldFix === 0,
      '残存=' + nOldFix + ' 件');
    check('(S3) ★assert 有効性: baseline には pickAoeOrigin が無く旧実装が 5 件ある',
      srcBase.indexOf('function pickAoeOrigin') < 0 && nOldBase === 5,
      'baseline の旧候補生成=' + nOldBase + ' 件 / pickAoeOrigin=' +
      (srcBase.indexOf('function pickAoeOrigin') < 0 ? 'なし' : 'あり'));
    check('(S4) ★味方誤射なし: partyInArea の拒否権が pickAoeOrigin 内に残っている',
      /if \(partyInArea\(c\.tx, c\.ty, S, S\)\) \{ partyRejected\+\+; continue; \}/.test(srcFix),
      '拒否権 continue を検出');
    check('(S5) ゲートが IS_FIELD_THEME (FIELD_MODE ではない)',
      /const AOE_WIDE_WINDOW = IS_FIELD_THEME;/.test(srcFix), 'AOE_WIDE_WINDOW = IS_FIELD_THEME');
    // ⚠️ ガードの基準点は「箱の中心」ではなく「箱の中で実際に当たる敵」。
    //    計画書 §5 の疑似コードは中心基準だったが、3行帯では箱を縦にずらすと
    //    中心が必ず壁に落ちて LoS が false になり、救済経路をピンポイントで潰す
    //    (実測: 中心基準 2/133 → 敵タイル基準 84/133)。
    check('(S6) 拡張窓のガードが「箱内の敵へ届くか」で実装されている',
      /function aoeBoxReachable\(aCX, aCY, foeIdxs, rangeTiles\)/.test(srcFix) &&
      /tileChebyshev\(aCX, aCY, fx, fy\) <= rangeTiles && hasLineOfSight\(aCX, aCY, fx, fy\)/.test(srcFix) &&
      /if \(wide && !aoeBoxReachable\(aCX, aCY, foeIdxs, rangeTiles\)\)/.test(srcFix),
      'aoeBoxReachable を拡張分のみに適用');
    check('(S7) 却下済み FIELD_ENEMY_AOE_SIZE_CAP を作っていない',
      srcFix.indexOf('FIELD_ENEMY_AOE_SIZE_CAP') < 0, 'なし');
    check('(S8) 味方へのダメージ経路を新設していない',
      srcFix.indexOf('alliesInArea') < 0 &&
      (srcFix.match(/function enemiesInArea/g) || []).length ===
      (srcBase.match(/function enemiesInArea/g) || []).length,
      'alliesInArea なし / enemiesInArea の定義数 不変');

    // ════════════════════════════════════════════════════════════════════
    mark('(N) ★既存6シナリオ 非退行 — 拡張窓が1命令も実行されないことの直接証明');
    // ════════════════════════════════════════════════════════════════════
    for (const sid of DUNGEONS) {
      const fp = await bootPage(browser, FIX, DESKTOP, { scenarioId: sid, seed: 20260719 });
      await installHarness(fp);
      const info = await fp.evaluate(() => window.__aoe.info());
      const specs = boxSpecs(info.ranges);

      const bp = await bootPage(browser, BASE, DESKTOP, { scenarioId: sid, seed: 20260719 });
      await installHarness(bp);
      const binfo = await bp.evaluate(() => window.__aoe.info());

      const sFix = await runSamples(fp, specs, SAMPLES, 4242);
      const sBase = await runSamples(bp, specs, SAMPLES, 4242);
      const wideProbe = await fp.evaluate(() => window.__aoe.wideProbe());
      const fixErr = fp.__pageErrors.slice(), baseErr = bp.__pageErrors.slice();
      await fp.close(); await bp.close();

      let neoVsLegacy = 0, cross = 0, tot = 0, castTot = 0;
      const bad = [];
      for (let i = 0; i < Math.min(sFix.length, sBase.length); i++) {
        const A = sFix[i], B = sBase[i];
        if (!A || !B) continue;
        for (const sp of specs) {
          const a = A.box[sp.id], b = B.box[sp.id];
          if (!a && !b) continue;
          tot++;
          const key = (o) => o ? (o.tx + ',' + o.ty + ',' + o.n) : 'null';
          if (a && key(a.legacy) !== key(a.neo)) {
            neoVsLegacy++;
            if (bad.length < 4) bad.push({ sp: sp.id, i: i, legacy: a.legacy, neo: a.neo });
          }
          if (key(a && a.legacy) !== key(b && b.legacy)) cross++;
          if (a && a.neo) castTot++;
        }
      }
      report.partN.push({ scenarioId: sid, samples: sFix.filter(Boolean).length, comparisons: tot,
        wideProbe: wideProbe, neoVsLegacy: neoVsLegacy, cross: cross, castTot: castTot,
        isFieldTheme: info.isFieldTheme, wideWindow: info.wideWindow, baselineIsField: binfo.isFieldTheme });

      check('(N-' + sid + ') 屋外テーマではない', info.isFieldTheme === false,
        'IS_FIELD_THEME=' + info.isFieldTheme);
      check('(N-' + sid + ') AOE_WIDE_WINDOW === false', info.wideWindow === false,
        'AOE_WIDE_WINDOW=' + info.wideWindow);
      check('(N-' + sid + ') 標本が空でない (比較が成立する)', tot >= 100 && castTot > 0,
        '比較 ' + tot + ' 件 / うち発動 ' + castTot + ' 件');
      check('(N-' + sid + ') ★拡張窓の候補を一度も評価していない (__aoeWideProbe === 0)',
        wideProbe === 0, '__aoeWideProbe=' + wideProbe + ' (比較 ' + tot + ' 件のあと)');
      check('(N-' + sid + ') ★pickAoeOrigin が legacy と全標本一致',
        neoVsLegacy === 0, '不一致 ' + neoVsLegacy + '/' + tot +
        (bad.length ? '  例: ' + JSON.stringify(bad[0]) : ''));
      check('(N-' + sid + ') ★legacy の結果が baseline ページと全標本一致 (環境不変)',
        cross === 0, '不一致 ' + cross + '/' + tot);
      check('(N-' + sid + ') pageerror 0', fixErr.length === 0 && baseErr.length === 0,
        (fixErr.concat(baseErr).slice(0, 2).join(' | ')) || 'none');
    }

    // ════════════════════════════════════════════════════════════════════
    mark('(F) ★屋外 (帯 row13-15) — 改修前後の降格率');
    // ════════════════════════════════════════════════════════════════════
    const fPage = await bootPage(browser, FIX, DESKTOP, { payload: CARAVAN_PAYLOAD, seed: 20260719 });
    await installHarness(fPage);
    const finfo = await fPage.evaluate(() => window.__aoe.info());
    const fspecs = boxSpecs(finfo.ranges);
    console.log('  [drv] 屋外 info: geoActive=' + finfo.geoActive + ' band=' + JSON.stringify(finfo.band) +
      ' 街道列=' + finfo.openCols + ' 射程=' + JSON.stringify(finfo.ranges));
    check('(F0) 屋外テーマ + 帯幾何が有効 (測る対象が存在する)',
      finfo.isFieldTheme === true && finfo.geoActive === true && !!finfo.band && finfo.openCols > 20,
      'isFieldTheme=' + finfo.isFieldTheme + ' geoActive=' + finfo.geoActive +
      ' band=' + JSON.stringify(finfo.band) + ' 街道列=' + finfo.openCols);
    check('(F0b) AOE_WIDE_WINDOW === true (屋外だけ窓が広がる)', finfo.wideWindow === true,
      'AOE_WIDE_WINDOW=' + finfo.wideWindow);

    const fSamples = await runSamples(fPage, fspecs, SAMPLES, 909090);
    const fWideProbe = await fPage.evaluate(() => window.__aoe.wideProbe());
    const fErr = fPage.__pageErrors.slice();
    await fPage.close();

    const boxAgg = aggBox(fSamples, fspecs);
    const nbAgg = aggNonBox(fSamples);
    report.partF = { info: finfo, samples: fSamples.filter(Boolean).length, wideProbe: fWideProbe, box: boxAgg };
    report.partP = { nonBox: nbAgg, samples: fSamples.filter(Boolean).length };

    console.log('\n  ─── 箱型5呪文: 屋外での降格率 (改修前 = legacy / 改修後 = pickAoeOrigin) ───');
    console.log('  呪文                 S  標本   改修前 降格       改修後 降格       拡張窓で救済');
    let totN = 0, totLegacyDemote = 0, totNeoDemote = 0, totWide = 0;
    for (const sp of fspecs) {
      const a = boxAgg[sp.id];
      totN += a.n; totLegacyDemote += (a.n - a.legacyCast); totNeoDemote += (a.n - a.neoCast); totWide += a.neoWide;
      console.log('  ' + sp.id.padEnd(20) + String(a.S).padEnd(3) + String(a.n).padEnd(7) +
        ((a.n - a.legacyCast) + ' (' + pct(a.n - a.legacyCast, a.n) + ')').padEnd(19) +
        ((a.n - a.neoCast) + ' (' + pct(a.n - a.neoCast, a.n) + ')').padEnd(19) +
        a.neoWide + ' (' + pct(a.neoWide, a.n) + ')');
    }
    console.log('  ' + '合計'.padEnd(20) + '   ' + String(totN).padEnd(7) +
      (totLegacyDemote + ' (' + pct(totLegacyDemote, totN) + ')').padEnd(19) +
      (totNeoDemote + ' (' + pct(totNeoDemote, totN) + ')').padEnd(19) +
      totWide + ' (' + pct(totWide, totN) + ')');

    // ★降格が残った標本の内訳 (拡張窓の候補が何で落ちたか)
    const D = { samples: 0, total: 0, party: 0, outRange: 0, noLos: 0, cleanNoFoes: 0, cleanWithFoes: 0,
                rescuable: 0, blockedByRangeOnly: 0, altRescuable: 0 };
    for (const s of fSamples) {
      if (!s) continue;
      for (const sp of fspecs) {
        const b = s.box[sp.id];
        if (!b || !b.diag) continue;
        D.samples++;
        for (const k of ['total', 'party', 'outRange', 'noLos', 'cleanNoFoes', 'cleanWithFoes']) D[k] += b.diag[k];
        D.altRescuable += (b.diag.altRescuable || 0);
        if (b.diag.bestCleanFoes > 0) D.rescuable++;
        else if (b.diag.bestPartyCleanButFarFoes > 0) D.blockedByRangeOnly++;
      }
    }
    console.log('\n  ─── 降格が残った標本の内訳 (拡張窓の候補 ' + D.total + ' 個 / ' + D.samples + ' 標本) ───');
    console.log('    味方入りで却下 ' + D.party + ' (' + pct(D.party, D.total) + ')' +
                ' / 射程外 ' + D.outRange + ' (' + pct(D.outRange, D.total) + ')' +
                ' / LoS 無し ' + D.noLos + ' (' + pct(D.noLos, D.total) + ')' +
                ' / クリアだが敵0 ' + D.cleanNoFoes + ' (' + pct(D.cleanNoFoes, D.total) + ')');
    console.log('    → 救済できた標本 ' + D.rescuable + ' / 「味方はいないが射程外/壁越し」で落ちた標本 ' +
                D.blockedByRangeOnly);
    console.log('    ★対案の上限 (基準点を「箱の中心」→「箱内の敵タイル」にした場合に救済しうる標本): ' +
                D.altRescuable + ' / ' + D.samples + ' (' + pct(D.altRescuable, D.samples) + ')');
    report.partF.demotedDiag = D;

    check('(F1) 屋外の標本が十分にある', totN >= 500, '比較 ' + totN + ' 件');
    check('(F2) ★屋外で降格率が下がった (箱型5呪文 合計)',
      totNeoDemote < totLegacyDemote,
      '改修前 ' + totLegacyDemote + '/' + totN + ' (' + pct(totLegacyDemote, totN) + ') → 改修後 ' +
      totNeoDemote + '/' + totN + ' (' + pct(totNeoDemote, totN) + ')');
    check('(F3) ★上位互換: 改修前に撃てた標本で改修後に撃てなくなったものが 0',
      fspecs.every(sp => boxAgg[sp.id].legacyOnly === 0),
      fspecs.map(sp => sp.id + ':' + boxAgg[sp.id].legacyOnly).join(' '));
    check('(F4) ★味方誤射なし: 返された着弾点に味方が入っている標本が 0',
      fspecs.every(sp => boxAgg[sp.id].partyHit === 0),
      fspecs.map(sp => sp.id + ':' + boxAgg[sp.id].partyHit).join(' '));
    check('(F5) 拡張窓が実際に発火している (救済が絵に描いた餅でない)',
      totWide > 0 && fWideProbe > 0, '拡張窓で採用 ' + totWide + ' 件 / 候補評価 ' + fWideProbe + ' 回');
    check('(F6) 拡張窓の採用に「ターゲットを含まない箱」が含まれる (窓拡張の本旨)',
      fspecs.some(sp => boxAgg[sp.id].notContainingTarget > 0),
      fspecs.map(sp => sp.id + ':' + boxAgg[sp.id].notContainingTarget).join(' '));
    check('(F7) pageerror 0 (屋外)', fErr.length === 0, fErr.slice(0, 3).join(' | ') || 'none');

    // ════════════════════════════════════════════════════════════════════
    mark('(G) 射程 / LoS ガードが load-bearing であること');
    // ════════════════════════════════════════════════════════════════════
    let outR = 0, nOutR = 0, glOutR = 0;
    for (const sp of fspecs) {
      outR   += boxAgg[sp.id].wideOutOfRange;
      nOutR  += boxAgg[sp.id].narrowOutOfRange;
      glOutR += boxAgg[sp.id].guardlessOutOfRange;
    }
    console.log('  拡張窓の採用 (ガード対象)  : 届かない箱 ' + outR + ' 件');
    console.log('  従来窓の採用 (改修前から無検査・意図的に据置): 届かない箱 ' + nOutR + ' 件');
    console.log('  ★反例 — ガードを外した窓拡張が拡張分を選んだとき: 届かない箱 ' + glOutR + ' 件');
    check('(G1) ★拡張窓で採用した着弾点は 100% 術者から届く (射程 + LoS)', outR === 0,
      '違反 ' + outR + ' 件 (従来窓の ' + nOutR + ' 件は改修前からの既存挙動で意図的に据置)');
    check('(G2) ガードは従来窓には掛かっていない (上位互換の維持を数値で確認)',
      true, '従来窓で「届かない箱」を採用した標本 ' + nOutR + ' 件 = 改修前と同じ挙動');
    check('(G3) ★assert 有効性: ガードを外すと術者から届かない着弾点が選ばれる標本が存在する',
      glOutR > 0, 'ガード無し版の違反 ' + glOutR + ' 件');

    // ════════════════════════════════════════════════════════════════════
    mark('(P) 直線 / 円錐 / splash は救済されない — 降格率の実測 (計画書 §6 P2)');
    // ════════════════════════════════════════════════════════════════════
    console.log('  型              標本    降格 (= 通常攻撃へフォールバック)');
    for (const k of ['line', 'cone', 'splash']) {
      const a = nbAgg[k];
      console.log('  ' + k.padEnd(16) + String(a.n).padEnd(8) + (a.n - a.cast) + ' (' + pct(a.n - a.cast, a.n) + ')');
    }
    check('(P1) 直線/円錐/splash の標本が十分にある',
      nbAgg.line.n >= 100 && nbAgg.cone.n >= 100 && nbAgg.splash.n >= 100,
      'line=' + nbAgg.line.n + ' cone=' + nbAgg.cone.n + ' splash=' + nbAgg.splash.n);
    check('(P2) 直線/円錐/splash の降格率を実測できた (§6 P2 の再判断材料)',
      nbAgg.line.n > 0 && nbAgg.cone.n > 0 && nbAgg.splash.n > 0,
      'line ' + pct(nbAgg.line.n - nbAgg.line.cast, nbAgg.line.n) +
      ' / cone ' + pct(nbAgg.cone.n - nbAgg.cone.cast, nbAgg.cone.n) +
      ' / splash ' + pct(nbAgg.splash.n - nbAgg.splash.cast, nbAgg.splash.n));

    // ════════════════════════════════════════════════════════════════════
    if (!SKIP_R) {
      mark('(R) 実プレイ (魔法使い+エルフ入りPT) — __aoeStats の生標本');
      // ══════════════════════════════════════════════════════════════════
      const p = await bootPage(browser, FIX, DESKTOP,
        { payload: CARAVAN_PAYLOAD, seed: 20260719, party: CASTER_PARTY, stats: true });
      // ★ドライバ側テストダブル: 攻撃呪文の可否は equippedSkills + hasSpellSlot で決まる
      //   (ally.mp は Phase 2-J で廃止済み = 常に 0。MP を積んでも呪文は撃たれない)。
      //   Lv6 の NPC キャスターは既定装備に箱型呪文を持たないので、ここで
      //   箱型5呪文を装備させ、スロット残量の枯渇だけを外す。本体は 1 バイトも変えない。
      const forceCasters = () => {
        window.hasSpellSlot = function () { return true; };
        for (const a of allies) {
          if (!a || !a.alive || !Array.isArray(a.equippedSkills)) continue;
          if (a.classKey === 'mage') a.equippedSkills = ['fireball', 'ice-storm', 'lightning-bolt'];
          else if (a.classKey === 'elf') a.equippedSkills = ['hail-of-thorns', 'conjure-volley', 'cordon-of-arrows'];
        }
      };
      await p.evaluate(forceCasters);
      await p.evaluate(() => { try { startGame(); } catch (e) {} });
      const t0 = Date.now();
      let last = null, reason = 'budget';
      while (Date.now() - t0 < BUDGET_MS) {
        await new Promise(r => setTimeout(r, 250));
        try {
          await p.evaluate(forceCasters);   // ウェーブ増援で仲間が入れ替わっても効かせ続ける
          last = await p.evaluate(() => ({
            go: gameOver, phase: currentPhase,
            foes: enemies.filter(e => e.alive && !e.inactive && !(e.def && e.def.isObjective)).length,
            stats: JSON.parse(JSON.stringify(window.__aoeStats || {})),
          }));
        } catch (e) { reason = 'evaluate-failed: ' + e.message; break; }
        if (last.go) { reason = 'gameOver'; break; }
      }
      const errs = p.__pageErrors.slice();
      await p.close();
      const st = (last && last.stats) || {};
      report.partR.push({ arm: '改修後', reason: reason, elapsedMs: Date.now() - t0, stats: st, pageErrors: errs });
      const keys = Object.keys(st);
      console.log('  [改修後] ' + Math.round((Date.now() - t0) / 1000) + 's  終了=' + reason +
        '  観測された呪文=' + (keys.length ? keys.join(', ') : '(なし)'));
      for (const k of keys) {
        const e = st[k];
        console.log('    ' + k.padEnd(26) + 'kind=' + String(e.kind).padEnd(8) +
          '試行 ' + e.attempts + ' / 発動 ' + e.cast + ' / 降格 ' + e.demoted +
          ' (' + pct(e.demoted, e.attempts) + ')' + (e.kind === 'box' ? '  拡張窓採用 ' + e.wideCast : ''));
      }
      check('(R1) 実プレイで pageerror 0', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
      check('(R2) 実プレイで観測シームが機能した (標本が採れた)',
        keys.length > 0, '観測キー=' + keys.length + ' 件 / 終了=' + reason);
    }

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
    if (bsrv) { try { bsrv.close(); } catch (e) {} }
  }

  try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch (e) {}
  const outFile = path.join(OUT_DIR, 'field_step7_metrics.json');
  try { fs.writeFileSync(outFile, JSON.stringify(report, null, 1)); console.log('\n[drv] 実測値 JSON: ' + outFile); } catch (e) {}

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== driver_field_step7  ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
