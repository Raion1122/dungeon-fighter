#!/usr/bin/env node
/*
 * probe_raider_a2_realplay.js — 街道の襲撃者の野営地 (raider-camp) の A2 イベントを
 *   「本物の実機プレイ」で発火させて DC12 知覚判定パネルが出るかを確かめる。
 *
 * ★既存の verify_raider_fixes.js は runA2Event を直接呼んでいた (接近発火の経路を通らない)。
 *   本 probe は **?autoplay を使わず**、人間と同じく:
 *     ① 入場ナレを合成 mousedown で送って読み進め (begin-gate を外す / 段落をスキップ)
 *     ② gameStarted 後にパーティが入場タイルに立つと接近 tick (setInterval(tryInteractNodeEvent,400))
 *        が A2 の選択ダイアログ「野営地の外れ…」を自前で開く (スクリプトは runA2Event を呼ばない)
 *     ③ 選択肢「2. 見張りと略奪品を観察する(知覚)」の実ボタンを click
 *     ④ 本物の #skillCheckOverlay が出る (= __autoplay 無しなのでパネルが描画される) → DC を読む
 *   を通す。これで「候補1 を選べば DC12 が実機で出る」ことを実測できる。
 *
 * mode:
 *   warrior-solo … 主人公=戦士 / 仲間なし (ユーザーのテスト条件)。extraBonus=+0 を期待。
 *   elf          … 仲間の 1 人を elf に差し替え。rep=elf で 技+2 (extraBonus) を期待。DC は 12 のまま。
 *
 * 使い方: node tools/probe_raider_a2_realplay.js [--headful] [--port 10733] [--mode warrior-solo|elf]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const has = (n) => argv.indexOf('--' + n) >= 0;
function arg(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }
const HEADFUL = has('headful');
const PORT = parseInt(arg('port', '10733'), 10);
const MODE = arg('mode', 'warrior-solo');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  try { return require('/tmp/df_pptr/node_modules/puppeteer-core'); } catch (e) {}
  if (process.env.PPTR_DIR) { try { return require(path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core')); } catch (e) {} }
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] ブラウザが見つかりません'); process.exit(2);
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
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}

function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfRaiderPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfRaiderPurged', '1');
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT + '   mode=' + MODE);

  const profile = makeProfile('df_a2real_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  const pageerr = [];
  page.on('pageerror', (e) => { if (pageerr.length < 12) pageerr.push(e.message); });
  const conLogs = [];
  page.on('console', (m) => { const t = m.text(); if (/AUTOPLAY|skillCheck|A2|知覚/.test(t) && conLogs.length < 40) conLogs.push(t); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: ['goblin-mine', 'bandits-forest'], xp: 6000 });

  const shotPath = path.join(os.tmpdir(), 'raider_a2_' + MODE + '.png');

  try {
    // ── clear モード: autoplay で 2 ノードを最後まで通し、VICTORY (dungeonCleared) を確かめる ──
    if (MODE === 'clear') {
      await page.goto('http://localhost:' + PORT + '/tavern.html?autoplay=30&dev=1&forcequest=raider-camp&recruittalk=0',
        { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
      await sleep(300);
      const k = await page.evaluate(() => {
        try { const sc = scenarios.find(s => s.id === 'raider-camp'); prepScenario = sc; regeneratePartyMembers(); departToScenario(30); return { ok: true }; }
        catch (e) { return { err: String((e && e.message) || e) }; }
      });
      check('(C0) clear: 出発 (autoplay=30)', k.ok === true, 'err=' + (k.err || 'none'));
      await page.waitForFunction("typeof dungeonCleared !== 'undefined'", { timeout: 60000 });
      let st = null, prog = [];
      for (let i = 0; i < 440; i++) {   // 最大 ~220s
        st = await page.evaluate(() => {
          const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
          return { cleared: g(() => dungeonCleared, false), over: g(() => gameOver, false),
                   node: g(() => currentNodeId, null), hp: g(() => hp, null),
                   aliveEnemies: g(() => enemies.filter(e => e.alive && !e.passiveNpc).length, -1),
                   enc: g(() => encounterActive || encounterRunning, null) };
        });
        if (i % 20 === 0) prog.push(i / 2 + 's:' + JSON.stringify({ n: st.node, a: st.aliveEnemies, hp: st.hp, enc: st.enc }));
        if (st.cleared || st.over) break;
        await sleep(500);
      }
      console.log('  [clear-prog] ' + prog.join('  '));
      check('(C1) clear: VICTORY (dungeonCleared) に到達 (詰み無し)', !!(st && st.cleared), 'state=' + JSON.stringify(st));
      check('(C2) clear: pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
      const pC = results.filter(r => r.ok).length, tC = results.length;
      console.log('\n  ' + pC + '/' + tC + (pC === tC ? '  PASSED   FAILED 0' : '  FAILED ' + (tC - pC)));
      await browser.close(); srv.close();
      process.exit(pC === tC ? 0 : 1);
      return;
    }

    // ── 卓で raider-camp を選び、autoplay 無しで出発 ──
    const TAVURL = '?dev=1&forcequest=raider-camp&recruittalk=0';
    await page.goto('http://localhost:' + PORT + '/tavern.html' + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
    await sleep(300);

    const kick = await page.evaluate(() => {
      try {
        const sc = scenarios.find(s => s.id === 'raider-camp');
        prepScenario = sc; regeneratePartyMembers();
        departToScenario();           // ★引数なし = autoplay を立てない (本物の実機プレイ)
        return { kicked: true, party: (selection.partyMembers || []).length };
      } catch (e) { return { err: String((e && e.message) || e) }; }
    });
    check('(0) raider-camp へ autoplay 無しで出発', kick.kicked === true, 'err=' + (kick.err || 'none') + ' party=' + kick.party);

    // index 着地を待つ
    let landed = null;
    try { await page.waitForFunction("typeof mapData !== 'undefined' && typeof runA2Event === 'function' && typeof allies !== 'undefined' && window.SkillCheck && typeof A2_EVENTS !== 'undefined'", { timeout: 60000 }); landed = page.url(); }
    catch (e) { landed = 'TIMEOUT url=' + page.url(); }
    check('(1) index 着地 (autoplay 無し = URL に autoplay 無)', /\/index\.html/.test(String(landed)) && !/autoplay/.test(String(landed)), 'landed=' + landed);

    // 着地直後 (gameStarted 前 = A2 はまだ発火しない) にパーティ構成を mode へ寄せる
    const setup = await page.evaluate((mode) => {
      const out = { autoplay: !!window.__autoplay, gameStarted: (typeof gameStarted !== 'undefined') ? gameStarted : null };
      try {
        if (mode === 'warrior-solo') {
          leaderClassKey = 'warrior';
          allies.length = 0;                       // 仲間なし = 戦士ソロ
        } else if (mode === 'elf') {
          // 実在する生成済みの仲間 1 人を elf へ差し替え (全フィールドを持つので安全)
          if (allies.length > 0) { allies[0].classKey = 'elf'; allies[0].alive = true; }
          else { allies.push({ alive: true, classKey: 'elf', npcName: 'エルラ', equippedSkills: [], inventory: {}, def: { name: 'elf' } }); }
        }
        out.leaderClassKey = (typeof leaderClassKey !== 'undefined') ? leaderClassKey : null;
        out.allyClasses = allies.map(a => a.classKey).join(',');
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    }, MODE);
    check('(2) 着地時は __autoplay 偽・パーティを ' + MODE + ' に設定',
      setup.autoplay === false, 'autoplay=' + setup.autoplay + ' leader=' + setup.leaderClassKey + ' allies=[' + setup.allyClasses + '] err=' + (setup.err || 'none'));

    // ── 入場ナレを人間のように進める (gameStarted まで合成 mousedown を送る) ──
    //    ⚠ gameStarted になったら止める (以降は A2 の選択ダイアログを実ボタンで操作する)。
    let startedAt = -1;
    for (let i = 0; i < 80 && startedAt < 0; i++) {
      const st = await page.evaluate(() => {
        try {
          const gs = (typeof gameStarted !== 'undefined') ? gameStarted : false;
          const choiceOpen = (() => { const d = document.getElementById('choiceDialog'); return !!(d && d.classList.contains('show')); })();
          if (!gs && !choiceOpen) {
            // begin-gate 解除 / ナレ段落スキップ (choiceDialog が開いていない時だけ送る)
            document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          }
          return { gs, choiceOpen };
        } catch (e) { return { err: String((e && e.message) || e) }; }
      });
      if (st && st.gs) startedAt = i;
      await sleep(250);
    }
    check('(3) 入場ナレを進めて gameStarted に到達', startedAt >= 0, 'startedAt(tick)=' + startedAt);

    // ── 診断: gameStarted 直後、入場タイルで「どの敵が交戦距離に居るか」を dump ──
    //    A2 は encounterActive||encounterRunning だと tryInteractNodeEvent が早期 return するので、
    //    入場時に交戦が latch する敵 (特に bow 射程) が居れば A2 は永久に出ない。
    const engDiag = await page.evaluate(() => {
      const g = (f, dv) => { try { const v = f(); return v === undefined ? dv : v; } catch (e) { return dv; } };
      const pCX = g(() => playerX + 48, null), pCY = g(() => playerY + 58, null);
      const eng = g(() => (typeof detectEngaged === 'function') ? detectEngaged() : null, null);
      const rows = [];
      try {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i]; if (!e || !e.alive) continue;
          const ex = e.x + e.def.displaySize / 2, ey = e.y + e.def.displaySize / 2;
          const d = Math.round(Math.hypot(pCX - ex, pCY - ey));
          const rk = e.def.range || 'melee';
          const ep = (typeof getRange === 'function') ? getRange(rk).engagePx : null;
          rows.push({ i, type: e.type, range: rk, engagePx: ep, distPx: d, inRange: d < ep });
        }
      } catch (e2) {}
      return {
        encActive: g(() => encounterActive, null), encRunning: g(() => encounterRunning, null),
        engaged: eng, enemies: rows,
      };
    });
    console.log('  [engage] encActive=' + engDiag.encActive + ' encRunning=' + engDiag.encRunning
      + ' detectEngaged=' + JSON.stringify(engDiag.engaged));
    engDiag.enemies.forEach(r => console.log('    enemy#' + r.i + ' ' + r.type + ' range=' + r.range
      + ' engagePx=' + r.engagePx + ' distPx=' + r.distPx + (r.inRange ? '  ← 交戦距離内' : '')));

    // ── A2 の接近発火 (選択ダイアログ) を待つ。スクリプトは runA2Event を呼ばない ──
    let a2DialogMsg = null, a2DialogBtns = null;
    const trace = [];
    for (let i = 0; i < 60; i++) {
      const d = await page.evaluate(() => {
        const g = (f, dv) => { try { const v = f(); return v === undefined ? dv : v; } catch (e) { return dv; } };
        const dlg = document.getElementById('choiceDialog');
        const open = !!(dlg && dlg.classList.contains('show'));
        const msg = open ? (dlg.querySelector('.choiceMessage') || {}).textContent : null;
        const btns = open ? Array.from(dlg.querySelectorAll('.choiceButtons button')).map(b => b.textContent) : null;
        const sk = document.getElementById('skillCheckOverlay');
        const skOpen = !!(sk && sk.classList.contains('show'));
        return {
          open, msg, btns, skOpen,
          node: g(() => currentNodeId, null),
          tile: g(() => ({ tx: Math.round((playerX + 48) / TILE_SIZE), ty: Math.round((playerY + 58) / TILE_SIZE) }), null),
          a2fired: g(() => (typeof nodeEventFired === 'function') ? nodeEventFired('a2_camp_scout') : null, null),
          enc: g(() => encounterActive || encounterRunning, null),
          nh: g(() => narrationHold, null), np: g(() => narrationPlaying, null),
          dp: g(() => dialogPaused, null), sca: g(() => skillCheckActive, null),
        };
      });
      trace.push(i + ':' + JSON.stringify({ n: d.node, t: d.tile, a2: d.a2fired, enc: d.enc, open: d.open, sk: d.skOpen }));
      if (d.open && d.msg && d.msg.indexOf('野営地の外れ') >= 0) { a2DialogMsg = d.msg; a2DialogBtns = d.btns; break; }
      if (d.skOpen) break;   // 念のため
      await sleep(400);
    }
    console.log('  [trace] ' + trace.slice(0, 20).join('  '));
    check('(4) A2 の選択ダイアログが実機プレイで自前で開いた (接近発火)',
      !!a2DialogMsg, 'msg=' + JSON.stringify(a2DialogMsg) + ' btns=' + JSON.stringify(a2DialogBtns));

    // ── 選択肢「2. …観察する(知覚)」を実クリック ──
    const clicked = await page.evaluate(() => {
      const dlg = document.getElementById('choiceDialog');
      if (!dlg) return { ok: false, why: 'no dialog' };
      const btns = Array.from(dlg.querySelectorAll('.choiceButtons button'));
      // 候補1 = 2 番目のボタン (0=そのまま進む / 1=観察する / 2=Esc キャンセル)
      const act = btns.find(b => /観察する/.test(b.textContent)) || btns[1];
      if (!act) return { ok: false, why: 'no act button', labels: btns.map(b => b.textContent) };
      act.click();
      return { ok: true, label: act.textContent, labels: btns.map(b => b.textContent) };
    });
    check('(5) 「観察する(知覚)」ボタンを実クリック', clicked.ok === true, 'label=' + JSON.stringify(clicked.label) + ' all=' + JSON.stringify(clicked.labels));

    // ── 本物の DC12 知覚判定パネルが描画されるのを待つ ──
    let panel = null;
    for (let i = 0; i < 40; i++) {
      panel = await page.evaluate(() => {
        const sk = document.getElementById('skillCheckOverlay');
        if (!sk || !sk.classList.contains('show')) return null;
        const card = sk.querySelector('#skillCheckCard');
        const meta = card ? (card.querySelector('.scMeta') || {}).textContent : null;
        const title = card ? (card.querySelector('.scTitle') || {}).textContent : null;
        const repRow = card ? card.querySelector('.scRow.rep') : null;
        const repName = repRow ? (repRow.querySelector('.scName') || {}).textContent : null;
        const repMod = repRow ? (repRow.querySelector('.scMod') || {}).textContent : null;
        return { meta, title, repName, repMod };
      });
      if (panel && panel.meta) break;
      await sleep(150);
    }
    if (panel && panel.meta) {
      try { const el = await page.$('#skillCheckCard'); if (el) await el.screenshot({ path: shotPath }); } catch (e) {}
    }
    const dcInMeta = panel && panel.meta ? /DC\s*12\b/.test(panel.meta) : false;
    check('(6) 本物の知覚判定パネルが出た (title=知覚判定)',
      !!(panel && panel.title && panel.title.indexOf('知覚判定') >= 0), 'title=' + (panel ? JSON.stringify(panel.title) : 'null'));
    check('(7) パネルの表記が DC 12 (罠の DC13 ではない)',
      dcInMeta === true, 'meta=' + (panel ? JSON.stringify(panel.meta) : 'null'));
    check('(8) 代表行 (rep) の内訳',
      !!(panel && panel.repName), 'rep=' + (panel ? JSON.stringify(panel.repName) + ' mod=' + JSON.stringify(panel.repMod) : 'null'));

    if (MODE === 'elf') {
      // elf 在籍の証拠 = 代表行の内訳に「技+2」(sceneClassBonus の extraBonus) が乗ること。
      //   これは PT に rogue/elf が居るときだけ付く加算なので、名前に依らず elf 在籍の確証になる。
      //   (代表は生成名のついた傭兵 = elf へ付け替えた実在の仲間。固定名「エルラ」は allies 空のときの保険)。
      const hasExtra = panel && panel.repMod && /技\+2/.test(panel.repMod);
      const elfRep = panel && panel.repMod && /習\+2/.test(panel.repMod);   // elf は perception 習熟
      check('(9-elf) rep=elf で 内訳に 技+2 (extraBonus) が乗る (DC は 12 のまま)',
        !!(elfRep && hasExtra && dcInMeta), 'repName=' + (panel ? JSON.stringify(panel.repName) : 'null') + ' repMod=' + (panel ? JSON.stringify(panel.repMod) : 'null'));
    } else {
      // 戦士ソロ: 代表=主人公(戦士)。知覚は非習熟・extra 0。内訳に 技+2 が出ないこと。
      const noExtra = panel && panel.repMod && !/技\+/.test(panel.repMod);
      check('(9-solo) 戦士ソロは 技+ (extraBonus) が内訳に無い (加算 +0)',
        !!(noExtra && dcInMeta), 'repMod=' + (panel ? JSON.stringify(panel.repMod) : 'null'));
    }

    // ロール結果まで見届ける (自動ロール AUTO_ROLL_MS=2000 → 演出 ~1.2s → 結果表示 RESULT_HOLD_MS=3600)。
    //   パネルは結果表示後すぐ自動で閉じ得るので poll で拾う。
    let resLine = null;
    for (let i = 0; i < 40; i++) {
      resLine = await page.evaluate(() => {
        const sk = document.getElementById('skillCheckOverlay');
        const card = sk ? sk.querySelector('#skillCheckCard') : null;
        return card ? (card.querySelector('.scResult') || {}).textContent : null;
      });
      if (resLine && /vs DC/.test(resLine)) break;
      await sleep(200);
    }
    check('(10) ロール結果に vs DC 12 が出る',
      !!(resLine && /vs DC 12\b/.test(resLine)), 'result=' + JSON.stringify(resLine));

    if (conLogs.length) console.log('  [console] ' + conLogs.slice(0, 10).join('  |  '));
    check('(Z) pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
  } catch (e) {
    check('(FATAL) 例外なく通し', false, String((e && e.message) || e));
  } finally {
    await browser.close(); srv.close();
  }

  const pass = results.filter(r => r.ok).length, total = results.length;
  console.log('\n  ' + pass + '/' + total + (pass === total ? '  PASSED   FAILED 0' : '  FAILED ' + (total - pass)));
  if (fs.existsSync(shotPath)) console.log('  [shot] DC12 パネル: ' + shotPath);
  process.exit(pass === total ? 0 : 1);
})();
