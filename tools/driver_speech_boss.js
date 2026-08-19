#!/usr/bin/env node
/*
 * driver_speech_boss.js — セリフ吹き出し STEP3 ボス系フック + ライフサイクル検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ボス戦はオートプレイで到達するのに数分かかるため、各フックを *実関数の直叩き* で
 * 決定論的に踏む (1 テスト = 1 page.goto で state 汚染を避ける)。
 *
 * ⚠ 母集団は **?graph=0 (従来の単一マップ) へ固定する**。分岐マップ (P5) で廃坑が既定で
 *   分岐版になり、entry ノードは設計上わざと弱いので **ボスが enemies に居ない**。
 *   このドライバが測るのは「speech のボスフック」であってマップではないので、旧経路へ戻す
 *   撤退スイッチで母集団を取り返すのが正しい (期待値を今の実測へ書き換えるのは母集団のすり替え)。
 *   ⚠ スイッチが黙って無効化されても緑にならないよう、(0-装置) で **外した側**も対で実測する。
 *
 * 検証項目 (計画書 STOP ゲート 3):
 *   (0) 母集団ガード (?graph=0 が効いている / ボスが居る / 外すと分岐版になる)
 *   (1) boss.appear が出現し kind === "enemy" (ボス本人が喋る・血赤スタイル)
 *   (2) boss.rage が出現し kind === "enemy" (HP50% = 既存の激怒ラッチを流用)
 *   (3) boss.defeat が出現し kind !== "enemy" (死んだボスは喋らない = 生存味方が歓声)
 *   (4) quest.clear が制覇の瞬間に出る + #resultOverlay 表示後は .speechBubble が 0 件
 *   (5) pageerror ゼロ / __diag critical ゼロ
 *
 * 使い方:  node tools/driver_speech_boss.js [--headful] [--browser <path>] [--port N] [--scen <id>]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8798'), 10);
const SCEN = arg('scen', 'goblin-mine');

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* ══ 負のコントロール (driver_doors_p6 と同じ「配信をメモリ上で差し替える」方式) ══
 * ⚠ **index.html は 1 バイトも書き換えない**。ディスクを触ると失敗時に汚れが残る。
 * ⚠ 置換前後は ①単一行 (index.html は CRLF なので \n を含むと原理的に一致しない)
 *   ②長さが違う ③置換後が置換前を部分文字列として含まない、の 3 つを満たすこと。
 *   どれを外しても「変異が載っていないのに緑」= 検出器が死ぬ。
 * ⚠ アンカーは**末尾コメントまで含めた 1 行**で指定する。素の
 *   `sayLine("boss.rage", enemy, { eventKey: enemy.type });` は単眼の暴君のシェル側 (C8) にも
 *   当たり 2 箇所ヒットで空振りする。 */
const MUTATIONS = {
  // 激怒の「発話」だけを落とす。ラッチ (ragePhaseEntered) と phase 遷移は残るので、
  // (2) が測っているのが *発話* であることを問う変異になる ((2) の 3 本目は緑のままが正しい)。
  norage: [
    '        sayLine("boss.rage", enemy, { eventKey: enemy.type });   // ★ speech: HP50% = 既存の激怒ラッチを流用 (新フラグ不要)',
    '        /* ★変異norage: 激怒の発話を落とす */',
  ],
};
const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[driver] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
  process.exit(2);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        if (MUTATE && u === '/index.html') {
          const [from, to] = MUTATIONS[MUTATE];
          const src = fs.readFileSync(fp, 'utf8');
          const hits = src.split(from).length - 1;
          if (hits !== 1) {   // 空振り = 変異が載らないまま「緑」になるのを絶対に許さない
            console.error('[driver] ⛔ 変異 ' + MUTATE + ' の置換対象が ' + hits + ' 箇所 (1 でない)。exit 3');
            process.exit(3);
          }
          res.setHeader('Content-Type', MIME['.html']);
          res.end(src.split(from).join(to));
          return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const allPageErrors = [];

// 1 テスト = 1 page.goto (前テストの戦闘 state が次を汚さないように)
// opts.graph0 === false のときだけ撤退スイッチを外す ((0-装置) 用の対照)
async function freshPage(browser, opts) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.evaluateOnNewDocument((id) => {
    sessionStorage.setItem('dragonfighters.currentScenario', id);
  }, SCEN);
  const gq = ((opts || {}).graph0 === false) ? '' : '&graph=0';
  /* ★[卓上グリッド P6] 母集団を旧射程へ固定する ?dndrange=0。**期待値は 1 文字も変えていない**。
   * ⚠⚠ 理由は「射程が伸びて演出が壊れた」ではない。このドライバの (2) は
   *   `sleepMs = () => Promise.resolve()` で演出待ちを潰してから enemyAttackTurn を直叩きする。
   *   視界 4→8 / 交戦距離の拡大で**叩く時点ですでに戦闘が走っている**ようになったため
   *   (実測 `encActive:true` / 敵 13 体生存 / ボス hp45 生存)、進行中のラウンドループが
   *   待ち時間ゼロで暴走し、CDP の evaluate が "Promise was collected" で落ちる。
   *   = 測り方が「戦闘が走っていないこと」を暗黙の前提にしていた。
   * ⭐ 激怒ゲート自体は 1 行も変えていない。?dndrange=0 で 18/18、実プレイ側は
   *   driver_graph_sce1 が autoplay でボス撃破まで 104/104、speech_v2 も 46/46 で緑。
   * ⚠ ピンを外したら (0-ピン) が落ちるようにしてある (空振り検出)。 */
  const rq = '&dndrange=0';
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1' + gq + rq,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'window.__speech && typeof gameStarted !== "undefined" && gameStarted && typeof enemies !== "undefined" && enemies.length',
    { timeout: 40000 });
  await sleep(400);
  return page;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT + '  (scen=' + SCEN + ')');

  const profile = require('./_pptr_profile')('df_speechboss_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══ (0) 母集団ガード — 「ボスが enemies に居る」こと自体を先に測る ══
  //   ⚠ 0 件を見たら「機能が壊れた」ではなく「母集団へ到達していない」を先に疑うためのガード。
  //   これが無いと bossIdx = -1 のまま defeatEnemy(-1) が例外を投げ、exit=3 の不可解な赤になる。
  const snap = (p) => p.evaluate(() => ({
    isCustom: (typeof MAPDEF !== 'undefined' && MAPDEF) ? !!MAPDEF.isCustom : null,
    rooms: (typeof ROOMS !== 'undefined') ? ROOMS.length : -1,
    n: enemies.length,
    bossIdx: enemies.findIndex(e => e.def.isBoss),
    summonIdx: enemies.findIndex(e => e.def.maxSummons > 0),
    // ★[P6] 射程ピン (?dndrange=0) が効いているかの実測値。旧値は bow=6 / warrior 視界=4。
    bowTiles: (typeof RANGE !== 'undefined' && RANGE.bow) ? RANGE.bow.tiles : -1,
    warriorSight: (typeof CLASS_SIGHT !== 'undefined' && CLASS_SIGHT.warrior) ? CLASS_SIGHT.warrior.tiles : -1,
  }));
  {
    const pOn = await freshPage(browser);
    const on = await snap(pOn);
    await pOn.close();
    // 装置: 撤退スイッチを**外した**側。分岐版になり entry ノードにはボスが居ないはず。
    const pOff = await freshPage(browser, { graph0: false });
    const off = await snap(pOff);
    await pOff.close();
    check('(0) ?graph=0 で従来の単一マップへ戻る (isCustom=false)', on.isCustom === false,
      'isCustom=' + on.isCustom + ' rooms=' + on.rooms + ' enemies=' + on.n);
    check('(0) 従来経路の enemies にボスが居る (標本が空でない)',
      on.bossIdx >= 0 && on.summonIdx >= 0, 'bossIdx=' + on.bossIdx + ' summonIdx=' + on.summonIdx);
    /* ★[P6] 射程ピンの装置 assert。?dndrange=0 を外すと (2) が
     *   「叩く時点で戦闘が走っている」状態になって落ちるので、ピンが外れたことを
     *   **ここで名指しで**分かるようにしておく (原因不明の赤にしない)。 */
    check('(0-ピン) ?dndrange=0 が効いている (旧射程 bow=6 / 戦士視界=4)',
      on.bowTiles === 6 && on.warriorSight === 4,
      'bow=' + on.bowTiles + ' warriorSight=' + on.warriorSight);
    check('(0-装置) ?graph=0 を外すと分岐版になり entry にボスが居ない (スイッチが効いている証明)',
      off.isCustom === true && off.bossIdx < 0,
      'isCustom=' + off.isCustom + ' rooms=' + off.rooms + ' enemies=' + off.n + ' bossIdx=' + off.bossIdx);
  }

  // ══ (1) boss.appear — runEncounter([bossIdx]) の先頭で同期発火する ══
  {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      // runEncounter のボス判定は def.maxSummons > 0 (def.isBoss ではない)
      const bi = enemies.findIndex(e => e.def.maxSummons > 0);
      if (bi < 0) return { noBoss: true };
      window.__speech.clear();
      runEncounter([bi]);   // await しない (sayLine は try の前で同期発火する)
      return { bi, bossName: enemies[bi].def.name };
    });
    await sleep(700);
    const got = await page.evaluate(() => {
      const s = window.__speech;
      const el = document.querySelector('.speechBubble');
      const hit = s.log.filter(e => e.key === 'boss.appear');
      return {
        n: hit.length,
        kind: hit.length ? hit[0].kind : '',
        text: hit.length ? hit[0].text : '',
        enemyStyle: el ? el.classList.contains('enemySpeech') : null,
        inMaster: hit.length ? s.lines['boss.appear'].includes(hit[0].text) : false,
      };
    });
    await page.evaluate(() => { gameOver = true; });   // 走り出した戦闘ループを止める
    check('(1) boss.appear が出現する (' + (r.bossName || '?') + ')', got.n >= 1 && got.inMaster,
      'n=' + got.n + ' text="' + got.text + '"');
    check('(1) boss.appear の話者はボス本人 (kind=enemy)', got.kind === 'enemy', 'kind=' + got.kind);
    check('(1) ボスの吹き出しは血赤 (enemySpeech クラス)', got.enemyStyle === true);
    await page.close();
  }

  // ══ (2) boss.rage — HP を 40% に落として enemyAttackTurn を直叩き ══
  {
    const page = await freshPage(browser);
    /* ⚠⚠⚠ ここは長らく「固定 800ms 窓で覗く」作りで、**約 25% で赤くなるフレーク**だった。
     *   真因は激怒の実装順にある: enemyAttackTurn は激怒ゲート (index.html の
     *   `def.isBoss && !def.multiHead && ... !enemy.ragePhaseEntered`) **より前**に
     *   sayEnemyCry(enemy) を呼ぶ。しかも直前の clearSpeech() が speechCryCdUntil を 0 へ
     *   戻すため鳴き声のクールダウンが外れ、SPEECH_CRY_CHANCE=0.25 で enemy.cry が**先に**
     *   キューへ入る。吹き出しは単一キューなので激怒は
     *   SPEECH_MS(2000) + SPEECH_GAP_MS(260) = 2260ms 後ろへ回り、800ms 窓では取りこぼす。
     *   → 予測される赤率 25% は実測 (同一コミットで 9 回中 2 回赤) と一致する。
     *   ⭐ **期待値ではなく測り方が誤っていた**ので、assert は 1 文字も変えず窓だけ直す。
     *   ⚠ 「発火前にキューが空になるまで待つ」**だけでは直らない**。鳴き声は clear() の
     *     *後* に enemyAttackTurn 自身が積むため。効くのは下のポーリングで、待機はその補助。 */
    const r = await page.evaluate(async () => {
      // 激怒ゲートは def.isBoss && !def.multiHead (ハイドラは除外)
      const bi = enemies.findIndex(e => e.def.isBoss && !e.def.multiHead);
      if (bi < 0) return { noBoss: true };
      const b = enemies[bi];
      sleepMs = () => Promise.resolve();          // 演出待ちを潰す (時間短縮)
      b.hp = Math.floor(b.maxHp * 0.4);           // ragePhaseHpRatio (既定 0.5) を下回らせる
      /* 発火の起点を既知の状態に揃える: 表示中の吹き出しもキューも無く busy も明けている状態。
       * ⚠ speechBusyUntil は classic script 直下の let で window に載らない。素の識別子なら
       *   global lexical scope から引けるが、**引けなくなったら黙って甘い測定に倒れる**ので
       *   読めたかどうかを busyReadable で持ち帰り、下で装置 assert として測る。 */
      const busyReadable = (typeof speechBusyUntil === 'number');
      const idle = () => window.__speech.queue.length === 0 && window.__speech.active.length === 0
                      && (!busyReadable || Date.now() >= speechBusyUntil);
      const t0 = Date.now();
      while (!idle() && Date.now() - t0 < 8000) {
        clearSpeech();                            // 溜まった予約と busy とクールダウンを落とす
        await new Promise(res => setTimeout(res, 50));
      }
      window.__speech.clear();
      enemyAttackTurn(bi);                        // await しない (激怒ゲートは同期部で踏まれる)
      return { bi, bossName: b.def.name, ratio: b.def.ragePhaseHpRatio || 0.5,
               busyReadable, idleWaitMs: Date.now() - t0 };
    });
    // 6s = 取りこぼしの上限 2260ms の 2 倍以上。**出るまで待つ**ので鳴き声に割り込まれても拾える
    let got = { n: 0, kind: '', text: '', inMaster: false, latched: false }, sawAtMs = -1;
    for (let i = 0; i < 60; i++) {
      const g = await page.evaluate(() => {
        const s = window.__speech;
        const hit = s.log.filter(e => e.key === 'boss.rage');
        const bi = enemies.findIndex(e => e.def.isBoss && !e.def.multiHead);
        return {
          n: hit.length,
          kind: hit.length ? hit[0].kind : '',
          text: hit.length ? hit[0].text : '',
          inMaster: hit.length ? s.lines['boss.rage'].includes(hit[0].text) : false,
          latched: bi >= 0 ? !!enemies[bi].ragePhaseEntered : false,
        };
      }).catch(() => null);
      if (!g) break;
      got = g;
      if (got.n >= 1) { sawAtMs = i * 100; break; }
      await sleep(100);
    }
    check('(2-装置) speechBusyUntil が読める (発火前の idle 判定が空振りしていない)',
      r.busyReadable === true, 'busyReadable=' + r.busyReadable + ' idleWait=' + r.idleWaitMs + 'ms');
    check('(2) boss.rage が出現する (' + (r.bossName || '?') + ', 閾値 ' + (r.ratio || '?') + ')',
      got.n >= 1 && got.inMaster,
      'n=' + got.n + ' text="' + got.text + '" latched=' + got.latched + ' sawAt=' + sawAtMs + 'ms');
    check('(2) boss.rage の話者はボス本人 (kind=enemy)', got.kind === 'enemy', 'kind=' + got.kind);
    // 既存の ragePhaseEntered ラッチを流用しているので 2 回目は鳴らない。
    // ※ clearSpeech() は「表示中の吹き出しとキュー」を消すが speechLog (表示履歴) は残す仕様なので、
    //   「log が空になる」ではなく「件数が増えない」で判定する。
    const twice = await page.evaluate(async () => {
      const bi = enemies.findIndex(e => e.def.isBoss && !e.def.multiHead);
      const before = window.__speech.log.filter(e => e.key === 'boss.rage').length;
      window.__speech.clear();
      enemyAttackTurn(bi);   // 既に ragePhaseEntered=true なので激怒ゲートを通らないはず
      /* ⚠ ここは**負の主張**なので「待ちが短くて見逃す」方向へ倒れてはいけない。
       *   ①非同期に積まれる分を拾う下限 1200ms → ②キューが捌けきるまで待つ、の 2 段。
       *   もし激怒が積まれていれば必ず表示され speechLog に載るので、増えなければ本当に鳴っていない。 */
      const t0 = Date.now();
      await new Promise(res => setTimeout(res, 1200));
      const busyReadable = (typeof speechBusyUntil === 'number');
      const idle = () => window.__speech.queue.length === 0 && window.__speech.active.length === 0
                      && (!busyReadable || Date.now() >= speechBusyUntil);
      while (!idle() && Date.now() - t0 < 8000) await new Promise(res => setTimeout(res, 50));
      await new Promise(res => setTimeout(res, 300));
      const after = window.__speech.log.filter(e => e.key === 'boss.rage').length;
      return { before, after, drainMs: Date.now() - t0 };
    });
    check('(2) 激怒は一度だけ (ragePhaseEntered ラッチ流用・2回目は鳴らない)',
      twice.after === twice.before,
      'before=' + twice.before + ' after=' + twice.after + ' drain=' + twice.drainMs + 'ms');
    await page.evaluate(() => { gameOver = true; });
    await page.close();
  }

  // ══ (3)(4) boss.defeat → quest.clear → resultOverlay で一掃 ══
  {
    const page = await freshPage(browser);
    // (3) ボスを defeatEnemy で倒す → 生存味方が歓声を上げる
    // ⚠ bi < 0 のまま defeatEnemy(-1) を呼ぶと例外で走行ごと落ちる (exit=3)。
    //    母集団の欠落は (0) と下の (3) が FAIL として報告するので、ここでは投げずに素通しする。
    const dbi = await page.evaluate(() => {
      const bi = enemies.findIndex(e => e.def.isBoss);
      if (bi < 0) return -1;
      window.__speech.clear();
      defeatEnemy(bi);
      return bi;
    });
    await sleep(700);
    const d = await page.evaluate(() => {
      const s = window.__speech;
      const hit = s.log.filter(e => e.key === 'boss.defeat');
      return {
        n: hit.length,
        kind: hit.length ? hit[0].kind : '',
        text: hit.length ? hit[0].text : '',
        inMaster: hit.length ? s.lines['boss.defeat'].includes(hit[0].text) : false,
      };
    });
    check('(3) boss.defeat が出現する', d.n >= 1 && d.inMaster,
      'n=' + d.n + ' text="' + d.text + '" bossIdx=' + dbi);
    check('(3) 死んだボスは喋らない (kind ≠ enemy = 生存味方の歓声)',
      d.n >= 1 && d.kind !== 'enemy', 'kind=' + d.kind);

    // __diag はここで読む (この後の force-clear は既知の result-double-fire を誘発しうるため)
    const diag = await page.evaluate(() => {
      if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
      const r = window.__diag.getReport();
      return { criticals: (r.totals && r.totals.criticals) || 0,
               violIds: Object.keys((r.current || {}).violations || {}) };
    });
    check('(5) __diag: critical ゼロ (ボスフック直叩き後)',
      !diag.noDiag && diag.criticals === 0,
      diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));

    // (4) force-clear → checkDungeonClear をゲームループに任せる (手動呼びは result-double-fire を招く)
    await page.evaluate(() => {
      window.__speech.clear();
      enemies.forEach(e => { e.alive = false; e.hp = 0; });
      for (let i = 0; i < ROOMS.length; i++) visitedRooms.add(i);
    });
    let sawQuestClear = false, questKind = '';
    for (let i = 0; i < 40; i++) {   // 制覇検知 → sayLine("quest.clear") を待つ
      const q = await page.evaluate(() => {
        const hit = window.__speech.log.filter(e => e.key === 'quest.clear');
        return { n: hit.length, kind: hit.length ? hit[0].kind : '' };
      }).catch(() => ({ n: 0, kind: '' }));
      if (q.n > 0) { sawQuestClear = true; questKind = q.kind; break; }
      await sleep(150);
    }
    check('(4) quest.clear が制覇の瞬間に表示される (resultOverlay に隠れない)',
      sawQuestClear, 'kind=' + questKind);
    check('(4) quest.clear の話者はパーティ', questKind === 'player' || questKind === 'ally',
      'kind=' + questKind);

    // showResult (resultOverlay, z=200) が出たら吹き出しは 0 件
    let overlayShown = false, bubblesAtOverlay = -1;
    for (let i = 0; i < 60; i++) {
      const s = await page.evaluate(() => {
        const ov = document.getElementById('resultOverlay');
        const shown = !!(ov && (ov.classList.contains('show') || getComputedStyle(ov).display !== 'none'));
        return { shown, bubbles: document.querySelectorAll('.speechBubble').length,
                 rs: (typeof resultShown !== 'undefined') ? resultShown : false };
      }).catch(() => null);
      if (!s) break;
      if (s.shown || s.rs) { overlayShown = true; bubblesAtOverlay = s.bubbles; break; }
      await sleep(150);
    }
    check('(4) リザルト画面が表示された', overlayShown, 'bubbles=' + bubblesAtOverlay);
    check('(4) リザルト表示後、吹き出しは 0 件 (clearSpeech で一掃)',
      overlayShown && bubblesAtOverlay === 0, 'bubbles=' + bubblesAtOverlay);
    await page.close();
  }

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const realErrs = allPageErrors.filter(m => !/Failed to load resource|favicon/i.test(m));
  check('(5) pageerror ゼロ', realErrs.length === 0, realErrs.join(' | '));

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
