#!/usr/bin/env node
/*
 * probe_boss_latch.js — 実装依頼書 #9 の負のコントロール兼「戦闘中に帯を跨ぐ」観測
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 何を測るか
 *   「帯 (玉座から BOSS_APPROACH_TILES=8) の**外**で始まった戦闘のまま、帯の**中**へ
 *   押し込まれる」を**決定論的に**作り、そのときボス到達ラッチとボス曲が立つかを見る。
 *   実プレイ (driver_grid_p9 の 1 周) では間欠にしか出ない事象なので、同じ状態を
 *   シームで作って毎回測れるようにしたもの。
 *
 * ■ 手順 (すべて本番の関数を通す)
 *   1. ?diag=1&intel=0 で起動 (検証シーム __graphRun は dev ゲートの内側) → __graphRun.enter('n1') で玉座の間 (廃坑 n1 = 39x23) へ入る
 *   2. パーティが入口付近の乱戦に自分から交戦するのを待つ (encounterActive)
 *      ⚠ このとき玉座までは 20 タイル以上 = 帯の外。latched=false / 坑内曲 を実測する
 *   3. **戦闘中のまま** snapPlayerToTile でパーティを玉座の隣 (帯の中) へ動かす
 *      = 本番で playerAdvanceOneTile が 1 手番 1 タイルずつやっていることの短縮版
 *   4. ラッチが立つ瞬間をページ内 50ms 監視でラッチして拾う (1 点読みをしない)
 *
 * ■ 期待値
 *   ・修正前 (HEAD の index.html を --index で配ると再現できる): 戦闘中は誰も評価しないので
 *     latched は false のまま = **RED**
 *   ・修正後: runEncounter の手番ループが latchBossApproachIfReached() を回すので
 *     latched=true / GameAudio.playBgm に mine_boss が渡る = **GREEN**
 *
 * 使い方:
 *   node tools/probe_boss_latch.js                       (作業ツリーの index.html)
 *   node tools/probe_boss_latch.js --index <path>        (別版の index.html を配る)
 *   node tools/probe_boss_latch.js --port 9075 --headful
 * exit 0=期待どおり緑 / 1=赤 / 2=環境不足 / 3=観測を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '9075'), 10);
const INDEX_SRC = arg('index', null);          // 別版の index.html を配る (負のコントロール用)
const ALT = INDEX_SRC ? fs.readFileSync(INDEX_SRC, 'utf8') : null;

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) {}
  console.error('[prb] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[prb] Chrome が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (ALT && u === '/index.html') {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(ALT); return;
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
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_bosslatch_');
  const browserPath = findBrowser();
  console.log('[prb] serving ' + ROOT + (ALT ? ('  (index.html は ' + INDEX_SRC + ' を配信)') : ''));
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];
  let hardFail = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await page.evaluateOnNewDocument(() => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        sessionStorage.removeItem('dragonfighters.generatedScenario');
      } catch (e) {}
      try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    });
    await page.goto('http://localhost:' + PORT + '/index.html?diag=1&intel=0',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof mapData !== 'undefined' && typeof buildNode === 'function' && typeof isTileWall === 'function'",
      { timeout: 25000 });
    /* ⚠⚠ playBgm の包み込みは startGame() の前 (driver_bgm_mine と同じ理由)。 */
    await page.evaluate(() => {
      window.__bgmLog = [];
      const orig = window.GameAudio.playBgm;
      window.GameAudio.playBgm = function (n) {
        try { window.__bgmLog.push(n); } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
    await page.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(400);

    // ── n1 (玉座の間) へ入る ──
    console.log('[prb] 1 n1 (玉座の間) へ入る');
    await page.evaluate(() => { window.__graphRun.enter('n1', 'right'); });
    {
      const t0 = Date.now();
      for (;;) {
        if (await page.evaluate(() => window.__graphRun.nodeId() === 'n1')) break;
        if (Date.now() - t0 > 20000) { hardFail = 'n1 へ入れなかった'; break; }
        await sleep(150);
      }
    }
    if (hardFail) throw new Error(hardFail);
    await sleep(1200);
    // 到着直後の知覚判定 / 選択ダイアログを閉じる (開いたままだと heroAI ごと止まる)
    for (let i = 0; i < 12; i++) {
      if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) break;
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
        if (btns.length) btns[btns.length - 1].click();
        const ov = document.getElementById('skillCheckOverlay');
        if (ov && ov.classList.contains('show')) {
          const rb = document.getElementById('scRollBtn'); if (rb) rb.click();
          ov.click();
        }
        document.body.click();
      });
      await sleep(300);
    }

    /* ★ ページ内 50ms 監視。ラッチが立った**瞬間**の状態を記録する。
     *   ⚠ 1 秒サンプルの 1 点読みだと「戦闘中に立ったのか、戦闘が終わってから
     *     heroAI が立てたのか」が分かれない (逃げ道の測り方でフレークする)。 */
    await page.evaluate(() => {
      window.__bl = { flip: null, encSeen: false };
      window.__blTimer = setInterval(() => {
        try {
          if (encounterActive) window.__bl.encSeen = true;
          const ba = window.__graphRun.bossApproach();
          if (ba.latched && !window.__bl.flip) {
            window.__bl.flip = { enc: !!encounterActive, narrated: !!ba.narrated,
                                 /* ★★★ 戦闘の**同一性**。encounterStartedAt は runEncounter の
                                  *   先頭で 1 戦闘 1 回だけ書かれる (index.html:19191)。これが無いと
                                  *   「帯の中で**新しい**戦闘が始まって tryStartEncounter がラッチした」
                                  *   だけの P8 既存経路と区別がつかず、**修正前でも緑になる**
                                  *   (2026-08-22 に実際に踏んだ)。 */
                                 startedAt: encounterStartedAt,
                                 seamBgm: window.__graphRun.bgm().id,
                                 played: window.__bgmLog[window.__bgmLog.length - 1] || null };
          }
        } catch (e) {}
      }, 50);
    });

    // ── 帯の外で戦闘が始まるのを待つ ──
    console.log('[prb] 2 帯の外で戦闘が始まるのを待つ (パーティが自分から交戦する)');
    let pre = null;
    {
      const t0 = Date.now();
      for (;;) {
        const st = await page.evaluate(() => {
          const ba = window.__graphRun.bossApproach();
          const b = enemies.find(e => e.def && e.def.isBoss && e.alive);
          const sz = b ? (b.def.displaySize || 96) : 0;
          return { enc: !!encounterActive, latched: ba.latched, reached: ba.reached,
                   bigRoom: ba.bigRoom, tiles: ba.tiles,
                   bgm: window.__graphRun.bgm().id,
                   played: window.__bgmLog[window.__bgmLog.length - 1] || null,
                   node: window.__graphRun.nodeId(),
                   boss: b ? (Math.floor((b.x + sz / 2) / TILE_SIZE) + ',' +
                              Math.floor((b.y + sz / 2) / TILE_SIZE)) : null,
                   p: Math.floor((playerX + 48) / TILE_SIZE) + ',' +
                      Math.floor((playerY + 58) / TILE_SIZE) };
        });
        if (st.enc && !st.reached && !st.latched && st.boss) { pre = st; break; }
        if (Date.now() - t0 > 90000) { pre = null; break; }
        await sleep(400);
      }
    }
    if (!pre) { hardFail = '「帯の外で戦闘中」の状態を 90 秒作れなかった'; throw new Error(hardFail); }
    console.log('[prb]   戦闘開始 ' + JSON.stringify(pre));
    check('(a) 装置: 帯の外で戦闘が始まっており、まだラッチもボス曲も立っていない',
      pre.enc && !pre.reached && !pre.latched && pre.bigRoom && pre.bgm !== 'mine_boss',
      JSON.stringify(pre));

    // ── 戦闘中のまま帯の中へ押し込む ──
    console.log('[prb] 3 **戦闘中のまま** パーティを玉座の隣 (帯の中) へ動かす');
    const moved = await page.evaluate(() => {
      const b = enemies.find(e => e.def && e.def.isBoss && e.alive);
      if (!b || !encounterActive) return null;
      const sz = b.def.displaySize || 96;
      const bTX = Math.floor((b.x + sz / 2) / TILE_SIZE);
      const bTY = Math.floor((b.y + sz / 2) / TILE_SIZE);
      // 玉座からチェビシェフ 2〜5 の床タイルを探す (帯 8 の中・ボスと同タイルは避ける)
      for (let r = 2; r <= 5; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const tx = bTX + dx, ty = bTY + dy;
            if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
            if (isTileWall(tx, ty)) continue;
            snapPlayerToTile(tx, ty);   // ★本番の関数。1 手番 1 タイル前進の短縮版
            return { to: tx + ',' + ty, boss: bTX + ',' + bTY, enc: !!encounterActive,
                     startedAt: encounterStartedAt };
          }
        }
      }
      return null;
    });
    if (!moved) { hardFail = '玉座の隣の床タイルが見つからない / 戦闘が終わっていた'; throw new Error(hardFail); }
    console.log('[prb]   ' + JSON.stringify(moved));

    // ── ラッチが立つか (最大 30 秒) ──
    console.log('[prb] 4 戦闘中にラッチとボス曲が立つかを見る');
    let post = null;
    {
      const t0 = Date.now();
      for (;;) {
        post = await page.evaluate(() => {
          const ba = window.__graphRun.bossApproach();
          return { latched: ba.latched, reached: ba.reached, narrated: ba.narrated,
                   enc: !!encounterActive, startedAt: encounterStartedAt,
                   bgm: window.__graphRun.bgm().id,
                   played: window.__bgmLog[window.__bgmLog.length - 1] || null,
                   log: window.__bgmLog.slice(-4),
                   flip: window.__bl.flip,
                   p: Math.floor((playerX + 48) / TILE_SIZE) + ',' +
                      Math.floor((playerY + 58) / TILE_SIZE) };
        });
        if (post.flip) break;
        /* 同じ戦闘が終わったらそれ以上待っても測れない (待つほど新しい戦闘が帯の中で
         * 始まって tryStartEncounter がラッチし、別経路で緑に見えるだけ)。 */
        if (post.startedAt !== moved.startedAt) {
          console.log('[prb]   ⚠ 押し込んだ戦闘が終わった (戦闘ID ' + moved.startedAt +
                      ' → ' + post.startedAt + ')');
          break;
        }
        if (Date.now() - t0 > 30000) break;
        await sleep(400);
      }
    }
    console.log('[prb]   ' + JSON.stringify(post));
    /* ★★★ 「**同じ戦闘のまま**帯を跨いだか」を見る。encounterStartedAt が変わっていたら
     *   それは「戦闘が一度終わって、帯の中で新しい戦闘が始まった」= P8 が 2026-08-20 に
     *   既に塗ってある tryStartEncounter の経路で、**#9 で直した穴とは別物**。
     *   この列を入れないと修正前の index.html でも (c) が緑になる (実測済)。 */
    const sameEnc = !!(post.flip && post.flip.enc && moved.startedAt &&
                       post.flip.startedAt === moved.startedAt);
    check('(b) 装置: 押し込んだ後は帯の中に居る (reached が真)', !!post.reached,
      'p=' + post.p + ' reached=' + post.reached);
    check('(c) ★★★**帯の外で始まったその戦闘のまま**帯へ入ったらボス到達ラッチが立つ',
      sameEnc,
      post.flip ? ('ラッチ時 enc=' + post.flip.enc + ' narrated=' + post.flip.narrated +
                   ' seamBgm=' + post.flip.seamBgm + ' played=' + post.flip.played +
                   ' 戦闘ID=' + post.flip.startedAt + ' (押し込み時=' + moved.startedAt + ')' +
                   (post.flip.startedAt !== moved.startedAt
                     ? ' ← **別の戦闘**で立った = tryStartEncounter 経路' : ''))
                : 'ラッチが最後まで立たなかった (latched=' + post.latched + ' enc=' + post.enc + ')');
    check('(d) ★★★そのとき実際に鳴らす曲がボス曲になる (bgm.id / playBgm の 2 経路)',
      !!(sameEnc && post.flip.seamBgm === 'mine_boss' && post.flip.played === 'mine_boss'),
      post.flip ? ('seamBgm=' + post.flip.seamBgm + ' played=' + post.flip.played +
                   ' log=' + JSON.stringify(post.log))
                : 'ラッチが立たないので曲も切り替わらない  log=' + JSON.stringify(post.log));
    check('(e) 戦闘中はボス到達ナレを出さない (narrate は heroAI 側のまま)',
      !!(sameEnc && post.flip.narrated === false),
      post.flip ? ('narrated=' + post.flip.narrated) : '(c) が赤なので測れない');
  } catch (e) {
    console.error('[prb] ⛔ ' + e.message);
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }
  if (errs.length) console.log('[prb] page errors: ' + errs.slice(0, 5).join(' | '));
  const bad = results.filter(r => !r.ok);
  console.log('\n[prb] ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (hardFail) { console.error('[prb] 測定不能: ' + hardFail); process.exit(3); }
  process.exit(bad.length ? 1 : 0);
})();
