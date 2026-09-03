#!/usr/bin/env node
/*
 * driver_cast_circle.js — 詠唱マジックサークル (術者の足元の魔法陣) の回帰ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-08-13 の変更 (spawnCastCircle を dfPlayCast + hydraFireBreath から呼ぶ) を守る検出器。
 * 検証手順はメモリ「ゲーム変更のヘッドレス検証手順」準拠 (実 Chrome/Edge を puppeteer-core で駆動)。
 *
 * ⚠ golden 方式にしていないのはわざと。golden は「最初から間違った絵」を永久に緑にする。
 *   ここで守りたいのは描画コマンド列ではなく、
 *     ・陣が**床の紋様に見えること** (= 術者より奥に描かれること)
 *     ・陣が**足元にあること**
 *     ・**詠唱する者に漏れがないこと** (味方 / 敵 / ボス / 竜)
 *   という 3 つの性質そのもの。
 *
 * ⚠ 主要アサートには**負のコントロール**を付けてある。層 (§4) は z-index を 7 に書き換えると
 *   ちゃんと落ちることまで確かめないと、「そもそも比較対象を拾えていなかっただけ」で
 *   緑になる (= 何も検出しない検出器) 事故が起きる。
 *
 * 検証項目:
 *   §1 アセット  … 実ファイルの画素寸法と JS のシート定義が一致する (6 コマ 320x200)
 *   §2 幾何      … castCircleDiameter が単調 + 巨躯側で伸びが鈍る (竜と僧侶の釣り合い)
 *   §3 相        … castCircleFrameAt の 展開 → 保持 → 霧散。眼柄の 380ms でも壊れない
 *   §4 層        … 陣の z-index が敵とも味方とも比べて**小さい** + 負のコントロール
 *   §5 接地      … 楕円中心が足元 (y + displaySize*0.93) に置かれる
 *   §6 網羅      … 味方 / 敵キャスター / ボス / 竜のブレス の 4 経路すべてで陣が出る
 *   §7 pageerror 0
 *
 * 使い方:  node tools/driver_cast_circle.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8823'), 10);

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
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
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
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
function mark(s) { console.log('[drv] ' + s); }

// PNG の IHDR から実寸を読む (Pillow に依存せず「実ファイルの性質」を測る)
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = require('./_pptr_profile')('df_castcircle_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check',
           '--mute-audio', '--disable-extensions', '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
    window.__castCircleProbe = [];   // spawnCastCircle が押す記録簿 (実装側の唯一の窓)
  });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof spawnCastCircle === 'function' && typeof dfPlayCast === 'function'
       && typeof castCircleFrameAt === 'function' && typeof castCircleDiameter === 'function'
       && typeof ENEMY_TYPES !== 'undefined' && typeof hydraFireBreath === 'function'
       && typeof createEnemy === 'function' && typeof createEnemyDom === 'function',
    { timeout: 20000 });
  mark('index.html booted, cast-circle fns present');

  /* ── 竜のフィクスチャ (§4 の層比較と §6 のブレスで共用) ──────────────────────
   * ⚠⚠ **素の object を enemies へ push してはいけない**。分岐マップのノードは敵が
   *   湧く前は `.enemy` が 0 個なので「敵と比べる」assert が母集団ゼロで空回りするが、
   *   母集団を自前で捏造すると今度は描画ループが enemyElements[i].style で落ちる
   *   (parallel array が 10 本ある)。本番の factory (createEnemy + createEnemyDom) を
   *   そのまま通すのが唯一安全な作り方。 */
  const fixture = await page.evaluate(() => {
    const typeKey = 'pharaxus';
    const idx = enemies.length;
    const tx = Math.floor(playerX / TILE_SIZE) + 3;
    const ty = Math.floor(playerY / TILE_SIZE);
    const e = createEnemy(typeKey, tx, ty);
    e.everSeen = true;              // 未発見の敵は display:none 経路へ落ちるので見えるようにする
    e.breathCooldown = 0;
    e.__breathNarrated = true;      // DM ナレの重複を避ける (演出の測定には不要)
    enemies.push(e);
    createEnemyDom(idx, e.def, typeKey);
    window.__fixtureIdx = idx;
    return { idx, typeKey, displaySize: e.def.displaySize, hasDom: !!enemyElements[idx] };
  });
  check('0.1 竜のフィクスチャを本番経路で生成できた', fixture.hasDom,
        `idx=${fixture.idx} ${fixture.typeKey} displaySize=${fixture.displaySize}`);

  // ══ §1 アセット ═════════════════════════════════════════════════════════════
  console.log('\n§1 アセット (実ファイルの画素寸法 vs JS のシート定義)');
  const pngPath = path.join(ROOT, 'assets', 'magic_circle_anim.png');
  const png = fs.existsSync(pngPath) ? pngSize(pngPath) : null;
  check('1.1 assets/magic_circle_anim.png が存在し PNG として読める', !!png,
        png ? `${png.w}x${png.h}` : 'なし');
  const sheet = await page.evaluate(() => ({
    src: MAGIC_CIRCLE_SHEET.src, frameW: MAGIC_CIRCLE_SHEET.frameW,
    frameH: MAGIC_CIRCLE_SHEET.frameH, cols: MAGIC_CIRCLE_SHEET.cols,
    anchorFY: MAGIC_CIRCLE_SHEET.anchorFY, ringFW: MAGIC_CIRCLE_SHEET.ringFW,
    loaded: MAGIC_CIRCLE_SHEET.loaded,
    natW: MAGIC_CIRCLE_SHEET.img.naturalWidth, natH: MAGIC_CIRCLE_SHEET.img.naturalHeight,
  }));
  // ⚠ 「6 で割り切れるか」ではなく「指定した frameW*cols がそのファイルの幅か」を測る。
  //   割り切れるかで判定すると、源を差し替えて幅が変わった時に黙って通る。
  check('1.2 frameW*cols が実ファイル幅と一致', !!png && sheet.frameW * sheet.cols === png.w,
        `${sheet.frameW}*${sheet.cols}=${sheet.frameW * sheet.cols} vs ${png && png.w}`);
  check('1.3 frameH が実ファイル高と一致', !!png && sheet.frameH === png.h,
        `${sheet.frameH} vs ${png && png.h}`);
  check('1.4 ブラウザがシートをロードできている', sheet.loaded === true && !!png && sheet.natW === png.w,
        `loaded=${sheet.loaded} natural=${sheet.natW}x${sheet.natH}`);
  // transform-origin の Y と anchorFY はズレると展開アニメで陣が足元から滑る
  const originFY = await page.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'fxCastCircle';
    d.style.width = '200px'; d.style.height = '100px';
    document.body.appendChild(d);
    const o = getComputedStyle(d).transformOrigin;   // "100px 64px" のように px で返る
    d.remove();
    const parts = o.split(/\s+/).map(parseFloat);
    return parts[1] / 100;                            // height=100px なので比になる
  });
  check('1.5 CSS transform-origin の Y = シートの anchorFY',
        Math.abs(originFY - sheet.anchorFY) < 0.005, `css=${originFY} sheet=${sheet.anchorFY}`);

  // ══ §2 幾何 ════════════════════════════════════════════════════════════════
  console.log('\n§2 幾何 (陣の見かけ直径)');
  const geo = await page.evaluate(() => {
    const at = (s) => castCircleDiameter(s);
    const sizes = [78, 96, 110, 132, 160, 192, 240, 300, 360];
    return { sizes, diam: sizes.map(at), d96: at(96), d160: at(160), d360: at(360) };
  });
  let mono = true;
  for (let i = 1; i < geo.diam.length; i++) if (geo.diam[i] < geo.diam[i - 1]) mono = false;
  check('2.1 displaySize に対して単調非減少', mono, geo.diam.map(v => Math.round(v)).join(','));
  // 巨躯 (竜=内容が箱の 0.771) と人型 (僧侶=0.240) の釣り合い: 大きい側だけ伸びを鈍らせている
  const slopeLo = (geo.d160 - geo.d96) / (160 - 96);
  const slopeHi = (geo.d360 - geo.d160) / (360 - 160);
  check('2.2 KNEE より上で伸びが鈍る (巨躯の陣が過大にならない)', slopeHi < slopeLo,
        `低域 ${slopeLo.toFixed(3)} / 高域 ${slopeHi.toFixed(3)}`);
  // 竜の内容幅 = 実測 0.771*360 = 277px。陣はそれを包み、かつ 1.5 倍を超えない
  check('2.3 竜の陣が竜の胴 (実測 277px) を包み、過大でもない',
        geo.d360 > 277 && geo.d360 < 277 * 1.5, `竜の陣=${geo.d360.toFixed(0)}px`);
  check('2.4 人型 (96px) の陣が体より大きく、2 タイル (192px) は超えない',
        geo.d96 > 96 && geo.d96 < 192, `人型の陣=${geo.d96.toFixed(0)}px`);

  // ══ §3 相 ═════════════════════════════════════════════════════════════════
  console.log('\n§3 相 (展開 → 保持 → 霧散)');
  const ph = await page.evaluate(() => {
    const sample = (dur) => {
      const out = [];
      for (let t = 0; t <= dur; t += Math.max(1, Math.round(dur / 60))) out.push(Object.assign({ t }, castCircleFrameAt(t, dur)));
      out.push(Object.assign({ t: dur }, castCircleFrameAt(dur, dur)));
      return { dur, phases: castCirclePhases(dur), s: out };
    };
    return { long: sample(2400), eye: sample(380) };   // eye = 単眼の暴君の眼柄 (最短の詠唱)
  });
  for (const pair of [['長い詠唱 2400ms', ph.long], ['眼柄 380ms', ph.eye]]) {
    const label = pair[0], S = pair[1];
    const first = S.s[0], last = S.s[S.s.length - 1];
    check(`3.1 [${label}] t=0 は不可視のコマ0`, first.frame === 0 && first.opacity === 0,
          `frame=${first.frame} opacity=${first.opacity}`);
    check(`3.2 [${label}] t=dur は消え際のコマ5・不可視`, last.frame === 5 && last.opacity === 0,
          `frame=${last.frame} opacity=${last.opacity}`);
    const growF = S.s.filter(x => x.t < S.phases.grow).map(x => x.frame);
    let up = true;
    for (let i = 1; i < growF.length; i++) if (growF[i] < growF[i - 1]) up = false;
    check(`3.3 [${label}] 展開中はコマが戻らない`, up && growF[growF.length - 1] <= 3, growF.join(','));
    const bad = S.s.filter(x => !(x.frame >= 0 && x.frame <= 5) || !(x.opacity >= 0 && x.opacity <= 1)
                             || !(x.scale > 0.5 && x.scale < 1.5));
    check(`3.4 [${label}] 全域でコマ/不透明度/倍率が定義域内`, bad.length === 0,
          bad.length ? JSON.stringify(bad[0]) : `${S.s.length} 点`);
    check(`3.5 [${label}] 3 相の長さが正で合計 = dur`,
          S.phases.grow > 0 && S.phases.fade > 0 && S.phases.hold >= 0
          && Math.abs(S.phases.grow + S.phases.hold + S.phases.fade - S.dur) < 1e-6,
          `grow=${S.phases.grow.toFixed(0)} hold=${S.phases.hold.toFixed(0)} fade=${S.phases.fade.toFixed(0)}`);
  }
  // 保持相を持つ長さでは、完成した陣 (3 か 4) だけが見える
  const holdFrames = ph.long.s.filter(x => x.t > ph.long.phases.grow
                                        && x.t < ph.long.phases.grow + ph.long.phases.hold).map(x => x.frame);
  check('3.6 保持相のコマは完成形 3/4 のみ',
        holdFrames.length > 0 && holdFrames.every(f => f === 3 || f === 4),
        Array.from(new Set(holdFrames)).join(','));

  // ══ §4 層 (最重要) ═════════════════════════════════════════════════════════
  console.log('\n§4 層 (陣は床の紋様か = 術者より奥に描かれるか)');
  // 実際に生きている .enemy / .ally / #player の computed z-index を読む。
  // ⚠ ここで定数 2 / 6 を driver に書かない。書くと CSS を変えた時に driver だけ古い前提のまま緑になる。
  const layer = await page.evaluate(() => {
    const sim = { x: 400, y: 400, def: { displaySize: 96, name: '検証用術者' } };
    const h = spawnCastCircle(sim, 'arcane', 4000);
    const el = h && h.el;
    const zOf = (sel) => {
      const n = document.querySelector(sel);
      return n ? parseInt(getComputedStyle(n).zIndex, 10) : null;
    };
    const zCircle = el ? parseInt(getComputedStyle(el).zIndex, 10) : null;
    const zEnemy = zOf('.enemy'), zAlly = zOf('.ally'), zPlayer = zOf('#player');
    // 負のコントロール: 陣を前面へ上書きすると同じ判定が落ちるか
    let negFails = null;
    if (el) {
      el.style.zIndex = '7';
      const z2 = parseInt(getComputedStyle(el).zIndex, 10);
      negFails = !(z2 < zPlayer && (zEnemy === null || z2 < zEnemy));
      el.style.zIndex = '';
    }
    const inVfxLayer = !!(el && el.parentElement && el.parentElement.id === 'vfxLayer');
    if (h) h.destroy();
    return { zCircle, zEnemy, zAlly, zPlayer, negFails, inVfxLayer, created: !!el };
  });
  check('4.1 spawnCastCircle が DOM に陣を 1 枚作る', layer.created, '');
  check('4.2 陣は #vfxLayer の子 (遷移で必ず一掃される層)', layer.inVfxLayer, '');
  check('4.3 陣の z-index < 主人公', layer.zCircle !== null && layer.zPlayer !== null
        && layer.zCircle < layer.zPlayer, `陣=${layer.zCircle} 主人公=${layer.zPlayer}`);
  check('4.4 陣の z-index < 敵', layer.zEnemy !== null && layer.zCircle < layer.zEnemy,
        `陣=${layer.zCircle} 敵=${layer.zEnemy}`);
  check('4.5 陣の z-index < 仲間', layer.zAlly !== null && layer.zCircle < layer.zAlly,
        `陣=${layer.zCircle} 仲間=${layer.zAlly}`);
  check('4.6 負のコントロール: z-index を 7 にすると 4.3/4.4 が落ちる', layer.negFails === true,
        `negFails=${layer.negFails}`);

  // ══ §5 接地 ════════════════════════════════════════════════════════════════
  console.log('\n§5 接地 (楕円中心が足元にあるか)');
  const foot = await page.evaluate(() => {
    window.__castCircleProbe.length = 0;
    const sim = { x: 1000, y: 2000, def: { displaySize: 192, name: '接地検証' } };
    const h = spawnCastCircle(sim, 'fire', 4000);
    const p = window.__castCircleProbe[window.__castCircleProbe.length - 1];
    const st = (h && h.el) ? h.el.style : null;
    const res = {
      probe: p, unitX: sim.x, unitY: sim.y, size: 192,
      left: st ? parseFloat(st.left) : null,
      top: st ? parseFloat(st.top) : null,
      transform: st ? st.transform : '',
      camX: (typeof camX !== 'undefined') ? camX : null,
      camY: (typeof camY !== 'undefined') ? camY : null,
      bgSize: st ? st.backgroundSize : '',
      widthPx: st ? parseFloat(st.width) : null,
    };
    if (h) h.destroy();
    return res;
  });
  const footFY = (foot.probe.footWY - foot.unitY) / foot.size;
  check('5.1 楕円中心の Y = 足元 (内容下端 0.95 のわずか上)',
        footFY > 0.85 && footFY < 0.98, `footFY=${footFY.toFixed(3)}`);
  check('5.2 楕円中心の X = 術者の中心',
        Math.abs(foot.probe.footWX - (foot.unitX + foot.size / 2)) < 0.01,
        `${foot.probe.footWX} vs ${foot.unitX + foot.size / 2}`);
  check('5.3 DOM の left/top はワールド座標 - カメラ',
        Math.abs(foot.left - (foot.probe.footWX - foot.camX)) < 0.51
        && Math.abs(foot.top - (foot.probe.footWY - foot.camY)) < 0.51,
        `left=${foot.left} top=${foot.top} cam=(${foot.camX},${foot.camY})`);
  check('5.4 transform が楕円中心を left/top へ寄せている (translate -50%/-64%)',
        /translate\(-50%,\s*-64%\)/.test(foot.transform), foot.transform);
  // ⚠ 文字列比較にしない。CSSOM は inline style の数値を丸めて返すので
  //   ("1579.1174934725848px" → "1579.11px")、期待値を文字列で組むと必ず落ちる。
  const bg = foot.bgSize.split(/\s+/).map(parseFloat);
  check('5.5 background-size がコマ幅 x cols (横ストリップのコマ送りが成立)',
        Math.abs(bg[0] - foot.widthPx * sheet.cols) < 0.05
        && Math.abs(bg[1] - foot.widthPx * sheet.frameH / sheet.frameW) < 0.05,
        `${foot.bgSize} (要素幅 ${foot.widthPx.toFixed(2)}px)`);

  // ══ §6 網羅 ════════════════════════════════════════════════════════════════
  console.log('\n§6 網羅 (敵も味方も / ボスも竜も)');
  // (a) dfPlayCast: 味方 / リーダー / 敵キャスター / ボス — 全部この 1 関数を通る
  const cov = await page.evaluate(async () => {
    window.__castCircleProbe.length = 0;
    const mk = (def) => ({ el: document.createElement('div'), x: 300, y: 300, def });
    const runs = [
      ['味方(魔法使い)',     mk({ displaySize: 96, name: '魔法使い' }), 'arcane'],
      ['敵(ゴブリン呪術師)', mk(ENEMY_TYPES.goblinShaman),              'fire'],
      ['ボス(リッチ)',       mk(ENEMY_TYPES.lich),                      'ice'],
      ['竜(ファラクサス)',   mk(ENEMY_TYPES.pharaxus),                  'holy'],
    ];
    const seen = [];
    for (const r of runs) {
      const before = window.__castCircleProbe.length;
      await dfPlayCast(r[1], { name: r[0], element: r[2] }, { duration: 260 });
      seen.push({ label: r[0], added: window.__castCircleProbe.length - before,
                  rec: window.__castCircleProbe[before] || null, elem: r[2] });
    }
    return { seen, pharaxusSpells: ENEMY_TYPES.pharaxus.spells || null,
             pharaxusBreath: !!ENEMY_TYPES.pharaxus.breathDice };
  });
  for (const s of cov.seen) {
    check(`6.1 dfPlayCast: ${s.label} で陣が 1 枚出る`, s.added === 1,
          s.rec ? `${s.rec.elem} 径=${Math.round(s.rec.diam)}px` : `added=${s.added}`);
    if (s.rec) check(`6.2 ${s.label} の属性が陣に伝わる`, s.rec.elem === s.elem, `${s.rec.elem}`);
  }
  // 竜が dfPlayCast だけでは救えないことの証明 = hydraFireBreath 側の呼びが要る理由
  check('6.3 ファラクサスは spells を持たない (= dfPlayCast を一度も通らない)',
        cov.pharaxusSpells === null, JSON.stringify(cov.pharaxusSpells));
  check('6.4 ファラクサスはブレスを持つ (陣の入口はブレス側にしかない)', cov.pharaxusBreath, '');

  // (b) hydraFireBreath: 竜/ハイドラの実関数をそのまま走らせる
  const breath = await page.evaluate(async () => {
    window.__castCircleProbe.length = 0;
    // 冒頭で作った竜のフィクスチャに本物のブレスを撃たせる。
    // ⚠ 判定式を driver へ写経しないため、必ず実関数 (hydraFireBreath) をそのまま呼ぶ。
    const idx = window.__fixtureIdx;
    let err = null;
    try { await hydraFireBreath(idx); } catch (e) { err = String((e && e.message) || e); }
    return { recs: window.__castCircleProbe.slice(), err };
  });
  check('6.5 hydraFireBreath が例外なく走る', breath.err === null, breath.err || '');
  check('6.6 竜のブレスで陣が 1 枚出る (ユーザー要望「ドラゴンも」の実体)',
        breath.recs.length === 1, JSON.stringify(breath.recs.map(r => ({ e: r.elem, d: Math.round(r.diam) }))));
  if (breath.recs.length === 1) {
    check('6.7 竜の陣は火属性', breath.recs[0].elem === 'fire', breath.recs[0].elem);
    check('6.8 竜の陣の径が竜の体格に追随している', breath.recs[0].displaySize === 360
          && breath.recs[0].diam > 277, `size=${breath.recs[0].displaySize} 径=${Math.round(breath.recs[0].diam)}`);
  }

  // 4 属性すべてに CSS クラスが実在する (無い属性は filter 無しの白い陣になる)
  const tint = await page.evaluate(() => {
    const out = {};
    for (const e of ['arcane', 'fire', 'ice', 'holy']) {
      const d = document.createElement('div');
      d.className = 'fxCastCircle fxCastCircle--' + e;
      document.body.appendChild(d);
      out[e] = getComputedStyle(d).filter;
      d.remove();
    }
    return out;
  });
  for (const e of ['arcane', 'fire', 'ice', 'holy']) {
    check(`6.9 属性 ${e} に着色フィルタが定義されている`,
          tint[e] && tint[e] !== 'none' && /sepia/.test(tint[e]), tint[e]);
  }
  check('6.10 4 属性の色が互いに異なる', new Set(Object.values(tint)).size === 4,
        `${new Set(Object.values(tint)).size} 種`);

  // ── フィクスチャの撤去 (parallel array 11 本を添字ごと落とす) ──
  //    ⚠⚠ #44 (2026-09-03) で enemyLabelElements が 11 本目として増えた。⭐ この直後の
  //    検算 6.11 は enemies.length === enemyElements.length の **2 本しか**比べないので、
  //    ここへ足し忘れても緑のまま札の DOM だけが画面に残る (依頼書 §2-2 の罠A)。
  //    ⛔ 期待値 (53/53) は 1 つも変えていない。
  const torn = await page.evaluate(() => {
    const idx = window.__fixtureIdx;
    if (idx === undefined) return false;
    enemies.splice(idx, 1);
    for (const arr of [enemyElements, hpBarElements, hpFillElements, hitSparkElements,
                       coinElements, weaponDropElements, armorDropElements,
                       alertMarkElements, enemyBadgeElements, enemyStatusElements,
                       enemyLabelElements]) {
      const el = arr.splice(idx, 1)[0];
      if (el && el.remove) el.remove();
    }
    window.__fixtureIdx = undefined;
    return enemies.length === enemyElements.length;
  });
  check('6.11 フィクスチャ撤去後も enemies と enemyElements の長さが一致', torn === true, '');

  // ══ §7 ════════════════════════════════════════════════════════════════════
  console.log('\n§7 例外');
  check('7.1 pageerror 0', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  // ── まとめ ──
  await browser.close();
  srv.close();
  const ng = results.filter(r => !r.ok);
  console.log('\n──────────────────────────────────────────');
  console.log(`  ${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) {
    console.log('  FAIL:');
    for (const r of ng) console.log('    - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  process.exit(ng.length ? 1 : 0);
})().catch(e => { console.error('[driver] 例外: ' + ((e && e.stack) || e)); process.exit(3); });
