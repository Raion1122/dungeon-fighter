#!/usr/bin/env node
/*
 * verify_scene_bgm.js — #94「廃坑の入口曲 + 最終ボス曲を合成で 2 曲」の受入
 *                      (実装依頼書 2026-10-15_scene-bgm-mine-dragon.md §8)
 *
 * 測るもの (ID は 2 経路で突き合わせる):
 *   経路 A = window.GameAudio.playBgm を包んだ setter スパイへ渡った最後の ID
 *   経路 B = GameAudio.__bgmTrack().name (実際に鳴っている合成曲)
 *   ⚠ 関数 sceneBgmTrack を直接呼んだ値・シーム __graphRun.bgm().id は**記録だけ** (経路 A/B の代わりにしない)。
 *   ⭐ どの動作 (setPhase / enterNode / heroAI / 戦闘の手番) でも「その動作の間に経路 A へ 1 件以上届いた」ことを
 *     AND で要求する (スパイが空振りすると「前の曲がたまたま期待どおり」で永久に緑になるため)。
 *
 *   §0 装置   (0a) 全ページでスパイが掛かり経路 A が 1 件以上 / (0b) __bgmTrackIds() に mine_gate・finalboss が在り
 *             2 曲とも __renderBgmOffline(id,12) が無音でない / (0c) 廃坑で RUN.graph.entry が取れ currentNodeId と一致
 *   §1 廃坑   (1a) entry の探索 → mine_gate / (1b) combat → combat、explore → mine_gate へ戻る /
 *             (1c) n1 (玉座の間) へ入った探索 → explore / (1d) n1 のボス戦 → boss (setPhase 経路と heroAI の入室経路)
 *   §2 竜の巣 (2a) ボス部屋に入った経路 (heroAI の入室検出) → finalboss / (2b) 戦闘中に玉座へ詰めた経路 (手番ごとのラッチ)
 *             → finalboss / (2c) __inBossRoom で setPhase("combat") → finalboss / (2d) 普通の探索 → explore・戦闘 → combat
 *   §3 他     (3a) 森・沼地・砦・神殿の探索 → explore・ボス → boss / (3b) ⭐ 生成クエスト (themeId goblin-mine / dragon-lair)
 *             の探索 → explore・ボス → boss (罠 A の検出器) / (3c) 街道の襲撃の探索 → explore・戦闘 → combat
 *   §4 音量   (4a) mine_gate が -18.0 以上かつ explore+1dB 以下 / finalboss が -18.0 以上かつ boss+1dB 以下
 *             (⚠ 基準の explore / boss は**実行時に同じ式で**測る = 直書きしない) / (4b) 2 曲の lead が他の全曲と不一致
 *   §5 撤退   (5a) ?scenebgm=0 で廃坑 entry → explore・竜の巣のボス → boss / (5b) ?scenebgm=0 でも TRACKS に 2 曲は在る
 *   §9        (9a) pageerror 0 件
 *
 * ⛔ 測らないこと: bpm / makeup / 各 Gain の具体値・旋律の良し悪し・ピーク (依頼書 §8)。
 *
 * ── 装置の作り (世界の凍結) ────────────────────────────────────────────────
 *   index の世界は setInterval(moveEnemies) が回し、戦闘の開始は tryStartEncounter()、主人公の歩きと
 *   ボス部屋の入室検出は heroAI() の **2 つの名前の呼び出し**だけが入口 (index.html:19115 / :19316)。
 *   startGame() の直前にこの 2 つを空関数へ差し替えて世界を凍らせ、測りたい経路の分だけ本物へ戻す:
 *     (2a)(1d-入室) = heroAI だけ戻す (戦闘は始まらない = 入室検出の枝を必ず通る)
 *     (2b)          = tryStartEncounter だけ戻す (主人公は歩かない = 帯の外で始まった戦闘のまま押し込む)
 *   ⚠ 差し替えはページ内の束縛だけ。本番ファイルは 1 バイトも変えない。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   本番ファイルは書き換えない。変異ごとに専用ポートのサーバを立て、配信スナップショットへ
 *   実行時に文字列置換で欠陥を注入する。起動時に自己検査: アンカーは 1 行・index.html でちょうど 1 ヒット・
 *   置換前後で長さが変わる・他の tools (*.js / *.py) の本文にアンカーが出てこない。
 *   port  | 変異      | 注入する欠陥                                                     | 赤くなるべき assert
 *   10630 | themekey  | sceneBgmTrack の scenarioId 2 つを _scenIdForTex (= themeId) に   | (3b) だけ (罠 A)
 *   10631 | latchleak | 戦闘中のラッチ点を bgm("boss") に戻す (素通し)                    | (2b) だけ (罠 B)
 *   10632 | entryall  | mine_gate の条件から「entry ノードに居る」を外す                   | (1c) だけ
 *   10633 | noswitch  | SCENE_BGM_OFF を常に false 扱い                                    | (5a) だけ
 *   各変異で「担当の assert が赤」かつ「担当外の assert が全部緑」でなければ exit 1。
 *
 * ── 使い方 ─────────────────────────────────────────────────────────────────
 *   node tools/verify_scene_bgm.js                    # 受入 (素 port 10629)
 *   node tools/verify_scene_bgm.js --negative         # 負のコントロール (4 変異・赤くならなければ exit 1)
 *   node tools/verify_scene_bgm.js --mutate latchleak # 変異を 1 つだけ載せて受入を回す (どれが赤いかを見る)
 *   ⚠ 試遊サーバ 8765 は使わない。
 *   exit: 0 = 全緑 / 1 = 赤あり / 2 = puppeteer・Chrome 無し / 3 = 装置の不備 (アンカー不一致など)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

// ⚠ path.resolve 必須 (区切り文字のままだと startsWith(ROOT) が常に false で全 404)。
const ROOT = path.resolve(__dirname, '..');
const SELF = path.resolve(__filename);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '10629'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信を差し替える。ディスクは触らない)。subs は 1 行の置換の列 (themekey だけ 2 本)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  // ⭐⭐⭐ 罠 A (依頼書 §2-2) の再現。既定の廃坑 / 竜の巣では _scenIdForTex === scenarioId なので何も変わらず、
  //   themeId だけを借りた生成クエストにだけ廃坑の入口曲 / ファラクサス曲が漏れる。
  themekey: {
    port: 10630, file: 'index.html', targets: ['3b'],
    subs: [
      { from: '      if (id === "explore" && scenarioId === "goblin-mine" &&',
        to: '      if (id === "explore" && _scenIdForTex === "goblin-mine" && /* mut-themekey */' },
      { from: '      if (id === "boss" && scenarioId === "dragon-lair") return "finalboss";',
        to: '      if (id === "boss" && _scenIdForTex === "dragon-lair") return "finalboss"; /* mut-themekey */' },
    ],
  },
  // ⭐⭐⭐ 罠 B (依頼書 §2-3) の再現。戦闘中に玉座へ詰めた経路だけ汎用のボス曲が鳴る。
  latchleak: {
    port: 10631, file: 'index.html', targets: ['2b'],
    subs: [
      { from: 'if (latchBossApproachIfReached()) bgm(sceneBgmTrack("boss"));',
        to: 'if (latchBossApproachIfReached()) bgm("boss"); /* mut-latchleak 直呼びの素通し */' },
    ],
  },
  // 廃坑のどのノードの探索でも入口曲になる。⚠ 短い形 (currentNodeId === RUN.graph.entry) は
  //   tools/driver_field_step6.js にも在るので使わない (前 worker 実測)。
  entryall: {
    port: 10632, file: 'index.html', targets: ['1c'],
    subs: [
      { from: 'RUN && currentNodeId === RUN.graph.entry) return "mine_gate";',
        to: 'RUN) return "mine_gate"; /* mut-entryall entry 判定を外す */' },
    ],
  },
  // 撤退スイッチが効かない (?scenebgm=0 でも差し替える)。
  noswitch: {
    port: 10633, file: 'index.html', targets: ['5a'],
    subs: [
      { from: 'if (SCENE_BGM_OFF) return id;',
        to: 'if (SCENE_BGM_OFF && false) return id; /* mut-noswitch */' },
    ],
  },
};
const MUT_ORDER = ['themekey', 'latchleak', 'entryall', 'noswitch'];

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUT_ORDER.some(k => MUTATIONS[k].port === 8765) || PORT === 8765) {
  console.error('[drv] ⛔ 8765 (試遊サーバ) は使わない');
  process.exit(3);
}

// 他の tools の本文 (*.js / *.py) を集める (アンカーの衝突検査用)。⚠ 自分自身は除く。
function listToolSources() {
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|py)$/.test(ent.name) && path.resolve(p) !== SELF) out.push(p);
    }
  };
  walk(path.join(ROOT, 'tools'));
  return out;
}

// 変異ソースを先に組み立てる。⚠ 自己検査に 1 つでも落ちたらここで exit 3。
const SRC = {};
const MUT_SRC = {};
const ANCHOR_REPORT = [];
{
  const toolSrc = listToolSources().map(p => ({ p, body: fs.readFileSync(p, 'utf8') }));
  for (const k of MUT_ORDER) {
    const m = MUTATIONS[k];
    if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
    let body = SRC[m.file];
    for (const s of m.subs) {
      if (/[\r\n]/.test(s.from) || /[\r\n]/.test(s.to)) {
        console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
        process.exit(3);
      }
      if (s.from.length === s.to.length) {
        console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
        process.exit(3);
      }
      const n = SRC[m.file].split(s.from).length - 1;
      if (n !== 1) {
        console.error('[drv] ⛔ 変異 ' + k + ' のアンカーが ' + m.file + ' 内に ' + n
          + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(s.from.slice(0, 90)));
        process.exit(3);
      }
      if (SRC[m.file].indexOf(s.to) >= 0) {
        console.error('[drv] ⛔ 変異 ' + k + ' の注入文字列が素の ' + m.file + ' に既に在る');
        process.exit(3);
      }
      const hits = toolSrc.filter(t => t.body.indexOf(s.from) >= 0).map(t => path.relative(ROOT, t.p));
      if (hits.length) {
        console.error('[drv] ⛔ 変異 ' + k + ' のアンカーが他の tools にも在る (他ドライバの変異と衝突する): ' + hits.join(', '));
        process.exit(3);
      }
      body = body.split(s.from).join(s.to);
    }
    MUT_SRC[k] = { file: m.file, body };
    ANCHOR_REPORT.push(k + '×' + m.subs.length);
  }
}

// 街道の襲撃の積荷 = world.html の writeAmbushBattle() と同じ形 (AMBUSH_FIELD の写し + at / surprise)。
// ⭐ 座標を写経しない: js/road-events.js を素の node で読んで AMBUSH_FIELD をそのまま使う。
function roadPayload() {
  const sb = { window: {} };
  sb.window.window = sb.window;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'road-events.js'), 'utf8'), sb);
  const F = sb.window.ROAD_EVENTS && sb.window.ROAD_EVENTS.AMBUSH_FIELD;
  if (!F) { console.error('[drv] ⛔ js/road-events.js から AMBUSH_FIELD が取れない'); process.exit(3); }
  const p = JSON.parse(JSON.stringify(F));
  p.at = null;
  p.surprise = false;
  return JSON.stringify(p);
}
const ROAD = roadPayload();
// 生成クエスト (酒場の掲示板)。⭐ themeId だけが既定シナリオと同じ = 罠 A の検出器 (driver_graph_sce1 (9-gen) と同型)。
const genPayload = (theme) => JSON.stringify({ title: '検証用の依頼', flavor: 'verify_scene_bgm',
  themeId: theme, perceptionDC: 12, trapCount: 2, hiddenChestCount: 1, clearXp: 100, tierKey: 'tier3',
  spawns: [['goblin', 30, 13], ['goblin', 31, 13]] });

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
// ⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると全 500 になる)。
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const ctx = { port, mutKey, srv: null };
    ctx.srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        let rel = u.replace(/^\/+/, '');
        if (rel === '') rel = 'index.html';
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    ctx.srv.on('error', reject);
    ctx.srv.listen(port, () => resolve(ctx));
  });
}
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const bufs = [];
      res.on('data', (b) => bufs.push(b));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs).toString('utf8') }));
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// 測定
// ══════════════════════════════════════════════════════════════════════════════
// 経路 A: GameAudio が代入された瞬間に playBgm を包む (setter スパイ。verify_synth_bgm.js と同じ)。
//   ⭐ 呼ばれた瞬間のラッチ / 入室ナレ / 戦闘 ID を**同期で**記録する (標本読みだと決着の速い戦闘で取りこぼす = #91)。
function spyInit() {
  window.__bgmCalls = [];
  window.__bgmEv = [];
  let _ga;
  Object.defineProperty(window, 'GameAudio', {
    configurable: true,
    get() { return _ga; },
    set(v) {
      _ga = v;
      if (v && typeof v.playBgm === 'function') {
        const o = v.playBgm;
        v.playBgm = function (n) {
          try { window.__bgmCalls.push(n); } catch (e) {}
          let st = null;
          try {
            /* eslint-disable no-undef */
            st = { latched: !!bossApproachLatched, narrated: !!bossRoomNarrationShown,
                   enc: !!encounterActive, startedAt: encounterStartedAt, node: currentNodeId };
            /* eslint-enable no-undef */
          } catch (e) {}
          try { window.__bgmEv.push({ n: n, st: st }); } catch (e) {}
          return o.apply(this, arguments);
        };
        window.__bgmSpyOn = true;
      }
    },
  });
}

// §0b / §4: 曲の在庫・lead・オフライン描画 (title.html。ゲームループの無いページで測る)。
async function measureTracks(browser, sv, errs) {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('tracks: ' + e.message));
  try {
    await page.evaluateOnNewDocument(spyInit);
    await page.goto('http://localhost:' + sv.port + '/title.html', { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction('!!window.GameAudio', { timeout: 30000 });
    await page.evaluate(() => { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await sleep(900);
    return await page.evaluate(async () => {
      const ga = window.GameAudio;
      const out = { spyOn: !!window.__bgmSpyOn, calls: window.__bgmCalls.slice(), ids: ga.__bgmTrackIds(), leads: {}, render: {} };
      for (const id of out.ids) out.leads[id] = ga.__bgmTrackLead(id);
      // ⚠ 式は verify_synth_bgm.js measureTracks と同じ (先頭 10% を捨てた RMS)。基準の explore / boss も同じ式で測る。
      for (const id of ['mine_gate', 'finalboss', 'explore', 'boss']) {
        try {
          const d = await ga.__renderBgmOffline(id, 12);
          const s0 = Math.floor(d.length * 0.1);
          let ss = 0;
          for (let i = s0; i < d.length; i++) ss += d[i] * d[i];
          const rms = Math.sqrt(ss / Math.max(1, d.length - s0));
          out.render[id] = { ok: true, len: d.length, rmsDb: rms > 0 ? +(20 * Math.log10(rms)).toFixed(2) : -999 };
        } catch (e) {
          out.render[id] = { ok: false, err: String(e) };
        }
      }
      return out;
    });
  } finally {
    await page.close();
  }
}

// index.html を起動する。⭐ startGame() の直前に世界を凍らせる (冒頭コメント「装置の作り」)。
async function bootIndex(browser, sv, errs, o) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => errs.push(o.key + ': ' + e.message));
  await page.evaluateOnNewDocument((o) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', o.scen || 'goblin-mine');
      if (o.gen) sessionStorage.setItem('dragonfighters.generatedScenario', o.gen);
      else sessionStorage.removeItem('dragonfighters.generatedScenario');
      if (o.road) sessionStorage.setItem('dragonfighters.roadBattle', o.road);
      else sessionStorage.removeItem('dragonfighters.roadBattle');
      localStorage.setItem('dragonfighters.xp', '45000');
    } catch (e) {}
  }, { scen: o.scen || null, gen: o.gen || null, road: o.road || null });
  await page.evaluateOnNewDocument(spyInit);
  await page.goto('http://localhost:' + sv.port + '/index.html?diag=1&intel=0' + (o.query || ''),
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'"
    + " && !!window.GameAudio && !!window.__graphRun", { timeout: 45000 });
  await page.evaluate(() => {
    /* eslint-disable no-global-assign */
    window.__frz = { tse: tryStartEncounter, hai: heroAI };
    tryStartEncounter = function () {};
    heroAI = function () {};
    /* eslint-enable no-global-assign */
    try { startGame(); } catch (e) { window.__startErr = String(e); }
  });
  await sleep(1500);
  const boot = await page.evaluate(async () => {
    const ga = window.GameAudio;
    const g = window.__graphRun.graph();
    const out = {
      startErr: window.__startErr || null, spyOn: !!window.__bgmSpyOn,
      callsAfterStart: window.__bgmCalls.slice(), scen: scenarioId,
      active: window.__graphRun.active(), entry: g ? g.entry : null, node: window.__graphRun.nodeId(),
      bossNode: window.__graphRun.bossNodeId(), sceneOff: (typeof SCENE_BGM_OFF !== 'undefined') ? SCENE_BGM_OFF : '未定義',
    };
    ga.unlock();   // ⚠ index は pointerdown で解錠しない (verify_synth_bgm K3)
    await new Promise(r => setTimeout(r, 900));
    out.afterUnlock = { calls: window.__bgmCalls.slice(), track: ga.__bgmTrack() };
    out.ids = ga.__bgmTrackIds();
    return out;
  });
  return { page, boot };
}

// 1 動作 (setPhase) の前後で経路 A / B を読む。⚠ setPhase ごとに 900ms 待つ (クロスフェード中は pendingTrack に積まれるだけ)。
const act = (page, label, kind, boss) => page.evaluate(async (label, kind, boss) => {
  const ga = window.GameAudio;
  const n0 = window.__bgmCalls.length;
  window.__inMidBoss = false;
  window.__inBossRoom = !!boss;
  setPhase(kind);
  await new Promise(r => setTimeout(r, 900));
  const t = ga.__bgmTrack();
  const s = { label, newCalls: window.__bgmCalls.slice(n0), A: window.__bgmCalls[window.__bgmCalls.length - 1] || null,
              B: t.name, voice: t.voice, seam: window.__graphRun.bgm().id,
              aux: (typeof sceneBgmTrack === 'function') ? sceneBgmTrack(boss ? 'boss' : kind) : null,
              node: currentNodeId, scen: scenarioId };
  if (boss) window.__inBossRoom = false;
  return s;
}, label, kind, !!boss);

// 本番の enterNode (setPhase("explore") まで含む) で別ノードへ入る。
const enter = (page, label, toId) => page.evaluate(async (label, toId) => {
  const ga = window.GameAudio;
  const n0 = window.__bgmCalls.length;
  await window.__graphRun.enter(toId, 'right');
  await new Promise(r => setTimeout(r, 900));
  const t = ga.__bgmTrack();
  return { label, newCalls: window.__bgmCalls.slice(n0), A: window.__bgmCalls[window.__bgmCalls.length - 1] || null,
           B: t.name, voice: t.voice, seam: window.__graphRun.bgm().id, node: currentNodeId, scen: scenarioId,
           inBoss: !!window.__inBossRoom };
}, label, toId);

// 到着直後の判定パネル / 選択ダイアログ / ナレを閉じる (開いたままだと moveEnemies ごと止まる = heroAI が回らない)。
async function settle(page) {
  for (let i = 0; i < 60; i++) {
    const idle = await page.evaluate(() => !skillCheckActive && !dialogPaused && !narrationHold && !narrationPlaying);
    if (idle) return true;
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
    await sleep(400);
  }
  return false;
}

// ボス個体から Chebyshev 距離 r の床タイル (ボス部屋の中) を探して主人公を置く式 (ページ内で使う文字列)。
const PICK_NEAR_BOSS = `(function (rs) {
  const b = enemies.find(e => e.alive && e.def && e.def.isBoss);
  if (!b) return null;
  const sz = b.def.displaySize || 96;
  const bTX = Math.floor((b.x + sz / 2) / TILE_SIZE), bTY = Math.floor((b.y + sz / 2) / TILE_SIZE);
  const room = ROOMS[BOSS_ROOM_IDX];
  for (const r of rs) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = bTX + dx, ty = bTY + dy;
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H || isTileWall(tx, ty)) continue;
    if (room && !roomContainsTile(room, tx, ty)) continue;
    return { tx, ty, boss: bTX + ',' + bTY };
  }
  return null;
})`;

// 経路「ボス部屋に入った」(heroAI の入室検出 :19961)。heroAI だけ解凍し、戦闘は始めない。
async function bossEntryViaHeroAI(page) {
  const bossId = await page.evaluate(() => window.__graphRun.bossNodeId());
  const ent = await enter(page, 'enter-' + bossId, bossId);
  const settled = await settle(page);
  const r = await page.evaluate(async (PICK) => {
    const w = (ms) => new Promise(res => setTimeout(res, ms));
    const ba0 = window.__graphRun.bossApproach();
    const pre = { latched: ba0.latched, narrated: ba0.narrated, reached: ba0.reached, bigRoom: ba0.bigRoom,
                  inBoss: !!window.__inBossRoom, A: window.__bgmCalls[window.__bgmCalls.length - 1] || null };
    const to = (0, eval)(PICK)([3, 2, 4, 5]);
    if (!to) return { pre, err: 'ボスの近くに床タイルが無い' };
    snapPlayerToTile(to.tx, to.ty);
    const reachedNow = window.__graphRun.bossApproach().reached;
    const e0 = window.__bgmEv.length;
    /* eslint-disable no-global-assign */
    heroAI = window.__frz.hai;          // heroAI だけ戻す (tryStartEncounter は凍ったまま = 戦闘にならない)
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !bossRoomNarrationShown) await w(100);
    heroAI = function () {};            // 再凍結
    /* eslint-enable no-global-assign */
    const waitMs = Date.now() - t0;
    await w(900);
    const evs = window.__bgmEv.slice(e0);
    const ev = evs.find(e => e.st && e.st.narrated) || null;
    const t = window.GameAudio.__bgmTrack();
    return { pre, to, reachedNow, waitMs, narrated: !!bossRoomNarrationShown, enc: !!encounterActive,
             ev, evs: evs.map(e => e.n), B: t.name, voice: t.voice, seam: window.__graphRun.bgm().id };
  }, PICK_NEAR_BOSS);
  r.enter = ent;
  r.settled = settled;
  return r;
}

// 経路「戦闘中に玉座へ詰めた」(runEncounter の手番ごとのラッチ :22663)。
//   帯の外で戦闘を始め (tryStartEncounter だけ解凍・主人公は歩かない)、**同じ戦闘のまま**主人公を帯の中へ置く。
async function latchInCombat(page) {
  const bossId = await page.evaluate(() => window.__graphRun.bossNodeId());
  const ent = await enter(page, 'enter-' + bossId, bossId);
  const settled = await settle(page);
  const st = await page.evaluate(async () => {
    const w = (ms) => new Promise(res => setTimeout(res, ms));
    const pTX = Math.floor((playerX + 48) / TILE_SIZE), pTY = Math.floor((playerY + 58) / TILE_SIZE);
    // 交戦相手 = ボス以外の生きた敵 1 体を主人公の近くへ寄せる (HP は戦闘が途中で終わらない大きさに = 装置)。
    const foe = enemies.find(e => e.alive && e.def && !e.def.isBoss && !e.inactive && !e.passiveNpc);
    if (!foe) return { err: 'ボス以外の敵が居ない' };
    let spot = null;
    for (let r = 1; r <= 3 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!isTileWall(pTX + dx, pTY + dy)) spot = { tx: pTX + dx, ty: pTY + dy };
    }
    if (!spot) return { err: '主人公の近くに床が無い' };
    snapEnemyToTile(foe, spot.tx, spot.ty);
    foe.hp = foe.maxHp = 99999;
    const ba = window.__graphRun.bossApproach();
    const pre = { reached: ba.reached, latched: ba.latched, bigRoom: ba.bigRoom, inBoss: !!window.__inBossRoom,
                  phase: currentPhase, foe: foe.type, hero: pTX + ',' + pTY, spot: spot.tx + ',' + spot.ty };
    const n0 = window.__bgmCalls.length;
    /* eslint-disable no-global-assign */
    tryStartEncounter = window.__frz.tse;   // 戦闘の開始だけ戻す (heroAI は凍ったまま)
    /* eslint-enable no-global-assign */
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !encounterActive) await w(50);
    await w(900);
    return { pre, enc: !!encounterActive, startedAt: encounterStartedAt,
             startCalls: window.__bgmCalls.slice(n0), reachedAtStart: window.__graphRun.bossApproach().reached,
             latchedAtStart: window.__graphRun.bossApproach().latched };
  });
  if (st.err || !st.enc) return { ent, settled, st };
  // ⚠ 押し込みの直前に滑走 / 戦闘の前進が終わるのを待つ (滑走中だと slideAnim が元の位置へ書き戻す = probe_boss_latch #91)。
  await page.waitForFunction('!heroSliding && !playerMovingThisFrame', { timeout: 10000, polling: 'raf' }).catch(() => {});
  const push = await page.evaluate(async (PICK) => {
    const to = (0, eval)(PICK)([2, 3, 1, 4]);
    if (!to || !encounterActive) return null;
    const startedAt = encounterStartedAt;
    const e0 = window.__bgmEv.length;
    snapPlayerToTile(to.tx, to.ty);
    for (let k = 0; k < 3; k++) await new Promise((r) => requestAnimationFrame(r));
    const held = Math.floor((playerX + 48) / TILE_SIZE) + ',' + Math.floor((playerY + 58) / TILE_SIZE);
    window.__latchE0 = e0;
    return { to: to.tx + ',' + to.ty, boss: to.boss, held, startedAt, reachedNow: !!window.__graphRun.bossApproach().reached };
  }, PICK_NEAR_BOSS);
  if (!push) return { ent, settled, st, push: null };
  // ラッチが立った瞬間の playBgm を同期記録から拾う (最大 30 秒)。B は同じ戦闘が続いている間だけ標本を取る。
  const post = await page.evaluate(async (startedAt) => {
    const w = (ms) => new Promise(res => setTimeout(res, ms));
    const t0 = Date.now();
    let ev = null;
    while (Date.now() - t0 < 30000) {
      ev = window.__bgmEv.slice(window.__latchE0).find(e => e.st && e.st.latched && e.st.startedAt === startedAt) || null;
      if (ev || encounterStartedAt !== startedAt) break;
      await w(50);
    }
    const waitMs = Date.now() - t0;
    const bs = [];
    if (ev) {
      const t1 = Date.now();
      while (Date.now() - t1 < 2500) {
        if (encounterStartedAt !== startedAt) break;
        bs.push(window.GameAudio.__bgmTrack().name);
        await w(100);
      }
    }
    return { ev, waitMs, Bsamples: bs, sameEnc: encounterStartedAt === startedAt,
             evs: window.__bgmEv.slice(window.__latchE0).map(e => e.n + (e.st && e.st.latched ? '(L)' : '')) };
  }, push.startedAt);
  return { ent, settled, st, push, post };
}

// ページ 1 枚 = 1 シナリオ (または撤退 / 生成クエスト)。
async function measurePage(browser, sv, errs, o) {
  const { page, boot } = await bootIndex(browser, sv, errs, o);
  const r = { boot, snaps: {} };
  try {
    await o.run(page, r);
  } finally {
    r.allCalls = await page.evaluate(() => window.__bgmCalls.slice()).catch(() => null);
    await page.close();
  }
  return r;
}

const PAGES = [
  { key: 'mine', scen: 'goblin-mine', run: async (p, r) => {
    r.snaps.entryExplore = await act(p, 'mine entry explore', 'explore');
    r.snaps.entryCombat = await act(p, 'mine entry combat', 'combat');
    r.snaps.entryBack = await act(p, 'mine entry explore (戦闘後)', 'explore');
    const bossId = await p.evaluate(() => window.__graphRun.bossNodeId());
    r.snaps.n1Enter = await enter(p, 'mine ' + bossId + ' enter', bossId);
    r.snaps.n1Boss = await act(p, 'mine ' + bossId + ' combat+boss', 'combat', true);
    r.heroEntry = await bossEntryViaHeroAI(p);
  } },
  { key: 'mineOff', scen: 'goblin-mine', query: '&scenebgm=0', run: async (p, r) => {
    r.snaps.entryExplore = await act(p, 'mineOff entry explore', 'explore');
  } },
  { key: 'dragon', scen: 'dragon-lair', run: async (p, r) => {
    r.snaps.entryExplore = await act(p, 'dragon entry explore', 'explore');
    r.snaps.entryCombat = await act(p, 'dragon entry combat', 'combat');
    r.snaps.entryBoss = await act(p, 'dragon entry combat+boss', 'combat', true);
    r.heroEntry = await bossEntryViaHeroAI(p);
  } },
  { key: 'dragonLatch', scen: 'dragon-lair', run: async (p, r) => {
    r.latch = await latchInCombat(p);
  } },
  { key: 'dragonOff', scen: 'dragon-lair', query: '&scenebgm=0', run: async (p, r) => {
    r.snaps.entryBoss = await act(p, 'dragonOff combat+boss', 'combat', true);
  } },
  ...['bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple'].map(sid => ({ key: sid, scen: sid, run: async (p, r) => {
    r.snaps.explore = await act(p, sid + ' explore', 'explore');
    r.snaps.boss = await act(p, sid + ' combat+boss', 'combat', true);
  } })),
  ...[['genMine', 'goblin-mine'], ['genDragon', 'dragon-lair']].map(([key, theme]) => ({ key, scen: theme, gen: genPayload(theme),
    run: async (p, r) => {
      r.snaps.explore = await act(p, key + ' explore', 'explore');
      r.snaps.boss = await act(p, key + ' combat+boss', 'combat', true);
    } })),
  { key: 'road', scen: 'goblin-mine', road: ROAD, run: async (p, r) => {
    r.snaps.explore = await act(p, 'road explore', 'explore');
    r.snaps.combat = await act(p, 'road combat', 'combat');
  } },
];

async function measureAll(browser, sv) {
  const errs = [];
  const m = { errs, pages: {} };
  m.tracks = await measureTracks(browser, sv, errs);
  for (const o of PAGES) {
    try { m.pages[o.key] = await measurePage(browser, sv, errs, o); } catch (e) {
      m.pages[o.key] = { fatal: String(e && e.message || e) };
      errs.push(o.key + ' (ドライバ): ' + (e && e.message));
    }
  }
  return m;
}

// ══════════════════════════════════════════════════════════════════════════════
// assert (key, 文面, m → [ok, detail])
// ══════════════════════════════════════════════════════════════════════════════
const J = (v) => JSON.stringify(v);
const P = (m, k) => m.pages[k] || {};
const S = (m, k, s) => (P(m, k).snaps || {})[s];
// ⭐ 1 動作 = 経路 A に 1 件以上届いた AND 経路 A の最後の ID AND 経路 B が期待どおり。
const snapOk = (s, id) => !!(s && s.newCalls && s.newCalls.length >= 1 && s.A === id && s.B === id && s.voice === true);
const snapStr = (s) => s ? (s.label + ' A=' + s.A + ' B=' + s.B + ' (新規 ' + (s.newCalls || []).length
  + ' 件 / [記録] seam=' + s.seam + (s.aux !== undefined ? ' aux=' + s.aux : '') + ')') : 'null';
const heroOk = (h, id) => !!(h && h.ev && h.ev.n === id && h.ev.st && h.ev.st.enc === false
  && h.pre && h.pre.narrated === false && h.reachedNow === true && h.B === id && h.voice === true);
const heroStr = (h) => !h ? 'null' : (h.err ? h.err : ('入室イベント=' + (h.ev ? h.ev.n + ' st=' + J(h.ev.st) : 'なし')
  + ' B=' + h.B + ' / pre=' + J(h.pre) + ' to=' + (h.to ? h.to.tx + ',' + h.to.ty + ' 玉座 ' + h.to.boss : '?')
  + ' reachedNow=' + h.reachedNow + ' 待ち ' + h.waitMs + 'ms / evs=' + J(h.evs)));
const INDEX_KEYS = PAGES.map(o => o.key);

const ASSERTS = [];
// §0
ASSERTS.push(['0a', '[装置] 全ページ (title + index ' + INDEX_KEYS.length + ' 枚) でスパイが掛かり、経路 A が 1 件以上の ID を捉えた',
  m => {
    const bad = [];
    if (!(m.tracks && m.tracks.spyOn && m.tracks.calls.length >= 1)) bad.push('title');
    for (const k of INDEX_KEYS) {
      const b = P(m, k).boot;
      if (!(b && b.spyOn && (P(m, k).allCalls || []).length >= 1)) bad.push(k);
    }
    return [bad.length === 0, bad.length ? '空振り=' + J(bad) : (INDEX_KEYS.length + 1) + ' ページとも捕捉'];
  }]);
ASSERTS.push(['0b', '__bgmTrackIds() に mine_gate と finalboss が在り、2 曲とも __renderBgmOffline(id,12) が無音でない (RMS > -40 dBFS)',
  m => {
    const t = m.tracks || {};
    const ids = t.ids || [];
    const r = t.render || {};
    const ok = ['mine_gate', 'finalboss'].every(id => ids.indexOf(id) >= 0 && r[id] && r[id].ok && r[id].len > 0 && r[id].rmsDb > -40);
    return [ok, 'ids=' + J(ids) + ' / mine_gate=' + J(r.mine_gate) + ' finalboss=' + J(r.finalboss)];
  }]);
ASSERTS.push(['0c', '[装置] 廃坑で RUN.graph.entry が取れ、起動直後の currentNodeId がそれに一致する (entry に居る)',
  m => { const b = P(m, 'mine').boot || {}; return [b.scen === 'goblin-mine' && b.active === true && !!b.entry && b.node === b.entry,
    'scen=' + b.scen + ' active=' + b.active + ' entry=' + b.entry + ' node=' + b.node + ' boss=' + b.bossNode]; }]);
// §1
ASSERTS.push(['1a', '廃坑の entry の探索 → 経路 A・B とも mine_gate (起動時の setPhase と、解錠後の setPhase("explore") の両方)',
  m => {
    const b = P(m, 'mine').boot || {};
    const c = b.callsAfterStart || [];
    const s = S(m, 'mine', 'entryExplore');
    const t = (b.afterUnlock || {}).track || {};
    return [c.length >= 1 && c.every(x => x === 'mine_gate') && t.name === 'mine_gate' && snapOk(s, 'mine_gate'),
      '起動時 A=' + J(c) + ' 解錠後 B=' + J(t) + ' / ' + snapStr(s)];
  }]);
ASSERTS.push(['1b', '廃坑の entry: setPhase("combat") → combat、戦闘後 setPhase("explore") → mine_gate に戻る',
  m => [snapOk(S(m, 'mine', 'entryCombat'), 'combat') && snapOk(S(m, 'mine', 'entryBack'), 'mine_gate'),
    snapStr(S(m, 'mine', 'entryCombat')) + ' / ' + snapStr(S(m, 'mine', 'entryBack'))]]);
ASSERTS.push(['1c', 'n1 (玉座の間) へ本番の enterNode で入った探索 → explore (入口曲は entry だけ)',
  m => { const s = S(m, 'mine', 'n1Enter'); const b = P(m, 'mine').boot || {};
    return [!!s && s.node === b.bossNode && s.node !== b.entry && snapOk(s, 'explore'), snapStr(s) + ' node=' + (s && s.node)]; }]);
ASSERTS.push(['1d', 'n1 のボス戦 → boss (__inBossRoom で setPhase("combat") / heroAI の入室検出の 2 経路とも。廃坑のボスは汎用のまま)',
  m => [snapOk(S(m, 'mine', 'n1Boss'), 'boss') && heroOk(P(m, 'mine').heroEntry, 'boss'),
    snapStr(S(m, 'mine', 'n1Boss')) + ' / 入室: ' + heroStr(P(m, 'mine').heroEntry)]]);
// §2
ASSERTS.push(['2a', '⭐ 竜の巣: ボス部屋に入った経路 (heroAI の入室検出・戦闘なし) で鳴らす曲 → 経路 A・B とも finalboss',
  m => [heroOk(P(m, 'dragon').heroEntry, 'finalboss'), heroStr(P(m, 'dragon').heroEntry)]]);
ASSERTS.push(['2b', '⭐ 竜の巣: 帯の外で始まった戦闘のまま玉座へ詰めた経路 (手番ごとのラッチ) で鳴らす曲 → 経路 A・B とも finalboss',
  m => {
    const L = P(m, 'dragonLatch').latch;
    if (!L) return [false, '測定なし'];
    const st = L.st || {}, push = L.push, post = L.post || {};
    const preOk = st.pre && st.pre.reached === false && st.pre.latched === false && st.pre.bigRoom === true
      && st.enc === true && st.reachedAtStart === false && st.latchedAtStart === false
      && (st.startCalls || []).slice(-1)[0] === 'combat';
    const pushOk = !!(push && push.held === push.to && push.reachedNow);
    const ev = post.ev;
    const aOk = !!(ev && ev.n === 'finalboss' && ev.st.enc === true && ev.st.startedAt === (push && push.startedAt));
    const bOk = (post.Bsamples || []).indexOf('finalboss') >= 0;
    return [preOk && pushOk && aOk && bOk,
      '[装置] 開始時=' + J({ pre: st.pre, enc: st.enc, reached: st.reachedAtStart, latched: st.latchedAtStart, A: st.startCalls, err: st.err })
      + ' / 押し込み=' + J(push) + ' / ラッチ時の A=' + (ev ? ev.n + ' st=' + J(ev.st) : 'なし')
      + ' B 標本=' + J(post.Bsamples) + ' 待ち ' + post.waitMs + 'ms evs=' + J(post.evs)];
  }]);
ASSERTS.push(['2c', '竜の巣: __inBossRoom = true で setPhase("combat") → finalboss',
  m => [snapOk(S(m, 'dragon', 'entryBoss'), 'finalboss'), snapStr(S(m, 'dragon', 'entryBoss'))]]);
ASSERTS.push(['2d', '竜の巣: 普通の探索 → explore / 普通の戦闘 → combat (entry と、ボスノードへ enterNode で入った探索)',
  m => {
    const h = P(m, 'dragon').heroEntry || {};
    return [snapOk(S(m, 'dragon', 'entryExplore'), 'explore') && snapOk(S(m, 'dragon', 'entryCombat'), 'combat')
      && snapOk(h.enter, 'explore'),
      snapStr(S(m, 'dragon', 'entryExplore')) + ' / ' + snapStr(S(m, 'dragon', 'entryCombat')) + ' / ' + snapStr(h.enter)];
  }]);
// §3
const OTHER4 = ['bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple'];
ASSERTS.push(['3a', '森・沼地・砦・神殿: 探索 → explore・ボス → boss (4 シナリオとも)',
  m => {
    const bad = [];
    const txt = OTHER4.map(k => {
      const b = P(m, k).boot || {};
      const ok = b.scen === k && snapOk(S(m, k, 'explore'), 'explore') && snapOk(S(m, k, 'boss'), 'boss');
      if (!ok) bad.push(k);
      return k + ': ' + snapStr(S(m, k, 'explore')) + ' | ' + snapStr(S(m, k, 'boss'));
    });
    return [bad.length === 0, (bad.length ? '⛔ ' + J(bad) + ' / ' : '') + txt.join(' / ')];
  }]);
ASSERTS.push(['3b', '⭐ 生成クエスト (themeId goblin-mine / dragon-lair・scenarioId は generated-quest): 探索 → explore・ボス → boss (罠 A の検出器)',
  m => {
    const bad = [];
    const txt = ['genMine', 'genDragon'].map(k => {
      const b = P(m, k).boot || {};
      const c = b.callsAfterStart || [];
      const ok = b.scen === 'generated-quest' && c.length >= 1 && c.every(x => x === 'explore')
        && snapOk(S(m, k, 'explore'), 'explore') && snapOk(S(m, k, 'boss'), 'boss');
      if (!ok) bad.push(k);
      return k + ' (scen=' + b.scen + ' 起動時 A=' + J(c) + '): ' + snapStr(S(m, k, 'explore')) + ' | ' + snapStr(S(m, k, 'boss'));
    });
    return [bad.length === 0, (bad.length ? '⛔ ' + J(bad) + ' / ' : '') + txt.join(' / ')];
  }]);
ASSERTS.push(['3c', '街道の襲撃 (road-ambush): 探索 → explore・戦闘 → combat (差し替わらない)',
  m => {
    const b = P(m, 'road').boot || {};
    return [b.scen === 'road-ambush' && snapOk(S(m, 'road', 'explore'), 'explore') && snapOk(S(m, 'road', 'combat'), 'combat'),
      'scen=' + b.scen + ' / ' + snapStr(S(m, 'road', 'explore')) + ' / ' + snapStr(S(m, 'road', 'combat'))];
  }]);
// §4
ASSERTS.push(['4a', 'RMS: mine_gate が -18.0 以上かつ explore+1dB 以下 / finalboss が -18.0 以上かつ boss+1dB 以下 (基準は実行時に同じ式で測る)',
  m => {
    const r = (m.tracks || {}).render || {};
    const v = (id) => (r[id] && r[id].ok) ? r[id].rmsDb : NaN;
    const ex = v('explore'), bo = v('boss'), mg = v('mine_gate'), fb = v('finalboss');
    const ok = [ex, bo, mg, fb].every(x => Number.isFinite(x) && x > -40)
      && mg >= -18.0 && mg <= ex + 1.0 && fb >= -18.0 && fb <= bo + 1.0;
    return [ok, 'mine_gate=' + mg + ' (上限 explore ' + ex + '+1=' + (ex + 1).toFixed(2) + ') / finalboss=' + fb
      + ' (上限 boss ' + bo + '+1=' + (bo + 1).toFixed(2) + ')'];
  }]);
ASSERTS.push(['4b', '2 曲の lead が、他の全曲 (実体から数える) のどれとも一致しない',
  m => {
    const L = (m.tracks || {}).leads || {};
    const ids = Object.keys(L);
    const dup = [];
    for (const a of ['mine_gate', 'finalboss']) {
      if (!Array.isArray(L[a]) || L[a].length === 0) { dup.push(a + '=lead 無し'); continue; }
      for (const b of ids) if (b !== a && J(L[a]) === J(L[b])) dup.push(a + '==' + b);
    }
    return [ids.length >= 11 && dup.length === 0, '比較 ' + ids.length + ' 曲 / 一致=' + J(dup)];
  }]);
// §5
ASSERTS.push(['5a', '?scenebgm=0: 廃坑の entry の探索 → explore / 竜の巣のボス → boss (経路 A・B とも)',
  m => {
    const b = P(m, 'mineOff').boot || {};
    const c = b.callsAfterStart || [];
    return [c.length >= 1 && c.every(x => x === 'explore') && snapOk(S(m, 'mineOff', 'entryExplore'), 'explore')
      && snapOk(S(m, 'dragonOff', 'entryBoss'), 'boss'),
      '[記録] SCENE_BGM_OFF=' + b.sceneOff + ' / 起動時 A=' + J(c) + ' / ' + snapStr(S(m, 'mineOff', 'entryExplore'))
      + ' / ' + snapStr(S(m, 'dragonOff', 'entryBoss'))];
  }]);
ASSERTS.push(['5b', '?scenebgm=0 でも __bgmTrackIds() に mine_gate と finalboss が在る (撤退は選曲だけを戻す)',
  m => {
    const got = ['mineOff', 'dragonOff'].map(k => (P(m, k).boot || {}).ids || []);
    return [got.every(ids => ids.indexOf('mine_gate') >= 0 && ids.indexOf('finalboss') >= 0), J(got[0])];
  }]);
// §9
ASSERTS.push(['9a', '測定ページで pageerror が出ていない', m => [m.errs.length === 0, m.errs.slice(0, 6).join(' | ')]]);

const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;
for (const k of MUT_ORDER) for (const t of MUTATIONS[k].targets) {
  if (!ASSERT_OF[t]) { console.error('[drv] ⛔ 変異 ' + k + ' の担当 (' + t + ') が assert に無い'); process.exit(3); }
}
const SECTIONS = [
  ['§0 装置 — 母集団', a => a[0].indexOf('0') === 0],
  ['§1 廃坑', a => a[0].indexOf('1') === 0],
  ['§2 竜の巣', a => a[0].indexOf('2') === 0],
  ['§3 他のシナリオと生成クエスト', a => a[0].indexOf('3') === 0],
  ['§4 音量', a => a[0].indexOf('4') === 0],
  ['§5 撤退', a => a[0].indexOf('5') === 0],
  ['§9 ページエラー', a => a[0].indexOf('9') === 0],
];

// ══════════════════════════════════════════════════════════════════════════════
// 結果の記録
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, ok, detail) {
  results.push({ name, state: ok ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
}
const mark = (s) => console.log('\n── ' + s);
const evalAll = (m) => {
  const out = {};
  for (const a of ASSERTS) {
    let r;
    try { r = a[2](m); } catch (e) { r = [false, '評価で例外: ' + e.message]; }
    out[a[0]] = r;
  }
  return out;
};

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const t0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_scenebgm_');
  const browserPath = findBrowser();

  console.log('=== verify_scene_bgm.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   ' + MUT_ORDER.map(k => k + ':' + MUTATIONS[k].port).join(' / '));

  const servers = [];
  let browser = null;
  try {
    if (NEGATIVE) {
      servers.push(await startServer(PORT, null));
      for (const k of MUT_ORDER) servers.push(await startServer(MUTATIONS[k].port, k));
    } else if (MUTATE) {
      servers.push(await startServer(MUTATIONS[MUTATE].port, MUTATE));
    } else {
      servers.push(await startServer(PORT, null));
    }
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      // ⭐ autoplay 解除 + mute で経路 B (実際に鳴っている合成曲) が headless でも取れる。
      args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    });

    if (!NEGATIVE) {
      const sv = servers[0];
      // 配信バイトの検算 (残骸サーバが同じポートを握っていると別物を測る)。
      const probe = await httpGet('http://localhost:' + sv.port + '/index.html');
      const expect = MUTATE ? MUT_SRC[MUTATE].body : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      mark('§0 装置 — 配信と変異アンカー');
      check('(0z) [装置] port ' + sv.port + ' の配信 index.html が' + (MUTATE ? '変異版' : '作業ツリー') + 'とバイト一致',
        probe.body === expect, probe.body.length + 'B / 期待 ' + expect.length + 'B');
      check('(0y) [装置] 変異アンカーが 1 行・ちょうど 1 箇所・置換で長さが変わる・他の tools に出ない', true,
        '起動時ガードを通過 (' + ANCHOR_REPORT.join(' / ') + ')');

      const m = await measureAll(browser, sv);
      const R = evalAll(m);
      for (const [title, pred] of SECTIONS) {
        mark(title);
        for (const a of ASSERTS.filter(pred)) check('(' + a[0] + ') ' + a[1], R[a[0]][0], R[a[0]][1]);
      }
      const r = (m.tracks || {}).render || {};
      console.log('\n       [記録] RMS: ' + ['mine_gate', 'finalboss', 'explore', 'boss'].map(id => id + '=' + (r[id] || {}).rmsDb).join(' / '));
      console.log('       [記録] 曲の在庫: ' + J((m.tracks || {}).ids));
      if (MUTATE) {
        const red = ASSERTS.map(a => a[0]).filter(k => !R[k][0]);
        const want = MUTATIONS[MUTATE].targets;
        console.log('       [記録] 変異 ' + MUTATE + ' で赤 = ' + J(red) + ' / 予測 = ' + J(want)
          + (J(red.slice().sort()) === J(want.slice().sort()) ? '  (予測どおり)' : '  ⚠ 予測と違う'));
      }
    } else {
      mark('変異が素の配信に無く、変異ポートにだけ載っていること');
      for (const k of MUT_ORDER) {
        const f = '/' + MUT_SRC[k].file;
        const pure = await httpGet('http://localhost:' + PORT + f);
        const mut = await httpGet('http://localhost:' + MUTATIONS[k].port + f);
        const okInj = MUTATIONS[k].subs.every(s => pure.body.split(s.to).length - 1 === 0 && mut.body.split(s.to).length - 1 === 1);
        check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つずつある (' + MUTATIONS[k].subs.length + ' 本)', okInj, f);
        check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
          pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
      }

      mark('欠陥を注入すると担当の assert だけが赤くなること');
      for (const k of MUT_ORDER) {
        const sv = servers.find(s => s.mutKey === k);
        const tk = Date.now();
        let m;
        try { m = await measureAll(browser, sv); } catch (e) {
          check('(neg-' + k + ') 変異 ' + k + ' の測定が完走する', false, e.message);
          continue;
        }
        const R = evalAll(m);
        for (const key of MUTATIONS[k].targets) {
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる — ' + ASSERT_OF[key][1],
            R[key][0] === false, (R[key][0] ? '⛔ 緑のまま (空振り) ' : '') + R[key][1]);
        }
        // ⭐ 効きすぎていないこと = 担当外の assert は全部緑のまま。
        const collateral = ASSERTS.map(a => a[0]).filter(key => MUTATIONS[k].targets.indexOf(key) < 0);
        const broke = collateral.filter(key => !R[key][0]);
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の assert (' + collateral.length + ' 本) を巻き込まない',
          broke.length === 0, broke.length ? '⛔ 巻き込み=' + broke.map(key => key + ': ' + R[key][1]).join(' | ')
            : '巻き込み 0 件 (' + ((Date.now() - tk) / 1000).toFixed(0) + ' s)');
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.srv.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + results.length + ' PASSED   FAILED ' + failed.length
    + '   (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
