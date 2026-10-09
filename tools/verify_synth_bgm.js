#!/usr/bin/env node
/*
 * verify_synth_bgm.js — #88「BGM を Claude の合成曲へ統一」の受入 (実装依頼書 2026-10-10_synth-bgm-unify.md §8)
 *
 * 測るもの (2 経路で突き合わせる):
 *   経路 A = window.GameAudio.playBgm を包んだ setter スパイへ渡った ID
 *   経路 B = GameAudio.__bgmTrack() が返す「実際に鳴っている合成曲」(name / voice)
 *   ⚠ unlock() 経由の再生 (pendingBgm) はモジュール内部の playBgm を呼ぶのでスパイには写らない (#20 / 依頼書 §2-4)。
 *     だから経路 A だけでは「渡した ID は正しいのに鳴らない」(罠 A) を永久に見逃す。
 *
 *   §0 装置   (0a-<page>) 経路 A が 1 件以上 / (0b) __bgmTrackIds() = 9 件 (直書き) で title/town/world を含む /
 *             (0c) 全ページの経路 A の ID がすべて __bgmTrackIds() に在る (罠 A の検出器) / (0d) 旧フック 3 つが undefined
 *   §1 ページ (1a)〜(1e) title/town/world/tavern/index を -A (スパイ) と -B (__bgmTrack) に分けて見る /
 *             (1f) どのページも「/assets/bgm/」を要求しない (サーバの要求ログ = 別経路)
 *   §2 新曲   (2a) __renderBgmOffline(id,12) が resolve し RMS > -40 dBFS / (2b) lead が他 8 曲と不一致 /
 *             (2c) RMS が -18.0〜-12.0 dBFS (ピークは揺れるので測らない = 依頼書 K7)
 *   §3 ダンジョン (3a) explore / (3b) combat / (3c) __inBossRoom で boss / (3d) __inMidBoss で midboss
 *             を シーム __graphRun.bgm().id・スパイの最後の ID・__bgmTrack().name の 3 つで /
 *             (3e) scenarioId='dragon-lair' と _genScenario={tierKey:'tier3'} でも (3a)〜(3c) と同じ ID 列
 *   §4 クレジット (4a) 設定モーダル (openSettings() の #gameSettingsOverlay の箱の lastElementChild) /
 *             (4b) エンディング「音楽」見出し直後の erItem (ENDING_CREDITS_HTML は裸の識別子で読める)。
 *             ⛔ 効果音の行の「魔王魂」は在ってよい (ページ全体で数えると必ず赤になる)
 *   §5 撤退   (5a) world ?worldbgm=0 → explore / (5b) town ?townbgm=0 → tavern / (5c) title ?titlebgm=0 → A 0 件・B null
 *   §9        (9a) pageerror 0 件
 *
 * ⛔ 測らないこと: makeup / *Gain / bpm の具体値・既存 6 曲の RMS・ピーク・旋律の良し悪し (依頼書 §8)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   本番ファイルは書き換えない。変異ごとに専用ポートのサーバを立て、配信スナップショットへ
 *   実行時に文字列置換で欠陥を注入する (アンカーは 1 行・ちょうど 1 ヒット・置換前後で長さを変える)。
 *   port  | 変異         | 注入する欠陥                                         | 赤くなるべき assert
 *   10599 | shadow       | playBgm の先頭に旧分岐の残骸 if (({ title: 1 })[name]) return;     | (1a-B) だけ。⭐ (1a-A)(0c) は緑のまま
 *   10601 | ghostscene   | index の setPhase で bgm("dungeon_normal")                      | (0c)(1e-A)(1e-B)(3a)(3b)(3c)(3d)
 *   10602 | silent       | world.html の playWorldBgm() を空に                            | (0a-world)(1c-A)(1c-B)(5a)
 *   10603 | staleCredit  | エンディング「音楽」に Wingless Seraph（ユーフルカ）を戻す           | (4b) のみ
 *   10604 | copytrack    | TRACKS.world.lead を explore の lead と同じ配列に                | (2b) のみ
 *   10605 | bossstuck    | combatBgmTrack() が __inBossRoom を見ない                       | (3c) のみ
 *   各変異で「担当の assert が赤」かつ「担当外の assert が全部緑」でなければ exit 1。
 *   ⭐ shadow の「(0c) と経路 A は緑のまま (1a) の経路 B だけ赤」が罠 A-1 の機械証明。
 *   ⚠ ghostscene / silent の担当は依頼書 §8 の表より広い (崩れ K13 / K14 = 依頼書 §12-2)。
 *
 * ── 使い方 ─────────────────────────────────────────────────────────────────
 *   node tools/verify_synth_bgm.js                  # 受入 (素 port 10598)
 *   node tools/verify_synth_bgm.js --negative       # 負のコントロール (6 変異・赤くならなければ exit 1)
 *   node tools/verify_synth_bgm.js --mutate shadow  # 変異を 1 つだけ載せて受入を回す (どれが赤いかを見る)
 *   ⚠ ポート 10600 は probe_magehand_reach.js。試遊サーバ 8765 は使わない。
 *   exit: 0 = 全緑 / 1 = 赤あり / 2 = puppeteer・Chrome 無し / 3 = 装置の不備 (アンカー不一致など)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須 (区切り文字のままだと startsWith(ROOT) が常に false で全 404)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '10598'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信を差し替える。ディスクは触らない)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  // ⭐⭐⭐ 罠 A-1 の再現。旧 BGM_FILES 分岐の残骸が TRACKS より先に title を食う。
  //   スパイには "title" が届く (経路 A・(0c) は緑) のに、実際には何も鳴らない (経路 B だけ赤)。
  shadow: {
    port: 10599, file: 'audio.js', targets: ['1a-B'],
    from: '    if (!TRACKS[name]) return;',
    to: '    if (({ title: 1 })[name]) return; /* mut-shadow 旧分岐の残骸 */ if (!TRACKS[name]) return;',
  },
  // ⭐⭐⭐ 罠 A-2 の再現。setPhase が TRACKS に無い旧 mp3 の ID を渡す = 黙って無音。
  //   ⚠ setPhase はダンジョンの全フェーズの唯一の呼び口なので (3b)(3c)(3d) も道連れになる (K13)。
  //   (3e) は「(3a)〜(3c) と同じ ID 列か」の相対比較なので、両方とも同じく壊れて緑のまま。
  ghostscene: {
    port: 10601, file: 'index.html', targets: ['0c', '1e-A', '1e-B', '3a', '3b', '3c', '3d'],
    from: '      bgm(dungeonBgmTrack(kind));',
    to: '      bgm("dungeon_normal");   /* mut-ghostscene 旧 mp3 の ID を渡す */',
  },
  // 呼び口の実体を空にする = ロード時と pointerdown の 2 本とも死ぬ。
  //   ⚠ ?worldbgm=0 の撤退も同じ呼び口を通るので (5a) も赤になる (K14)。
  silent: {
    port: 10602, file: 'world.html', targets: ['0a-world', '1c-A', '1c-B', '5a'],
    from: '    function playWorldBgm() { try { if (window.GameAudio && GameAudio.playBgm) GameAudio.playBgm(WORLD_BGM_ID); } catch (e) {} }',
    to: '    function playWorldBgm() { /* mut-silent 呼び口を 2 本とも殺す */ }',
  },
  // 画面のクレジットだけが古い。音は何も変わらない = (4b) 以外は全部緑のまま。
  staleCredit: {
    port: 10603, file: 'index.html', targets: ['4b'],
    from: '      \'<div class="erItem">オリジナル楽曲(Web Audio 合成)</div>\',',
    to: '      \'<div class="erItem">オリジナル楽曲(Web Audio 合成)</div>\', \'<div class="erItem">Wingless Seraph（ユーフルカ）</div>\',   /* mut-staleCredit */',
  },
  // 新曲の旋律を既存曲から写した (流用の取り違え)。鳴りはするので (1c)(2a)(2c) は緑のまま。
  //   ⚠ to の末尾にコメントを付けるのは、explore の lead 行そのものが素に在るから
  //     (付けないと「素には注入文字列が無い」の検算が破れる)。
  copytrack: {
    port: 10604, file: 'audio.js', targets: ['2b'],
    from: '      lead: ["A4","-","-","E5","-","-","A5","-","-","-","-","-","E5","-","-","-","F4","-","-","C5","-","-","F5","-","G4","-","-","D5","-","-","G5","-"],',
    to: '      lead: ["A4","-","-","E4","-","-","A4","-","C5","-","B4","A4","E4","-","G4","-","A4","-","-","E4","-","-","A4","-","D5","-","C5","B4","A4","-","-","-"],   /* mut-copytrack explore の lead */',
  },
  // ボス部屋でも通常戦闘曲のまま。(3e) は相対比較なので巻き込まれない。
  bossstuck: {
    port: 10605, file: 'index.html', targets: ['3c'],
    from: '      if (window.__inBossRoom) return "boss";',
    to: '      /* mut-bossstuck __inBossRoom を見ない */',
  },
};
const MUT_ORDER = ['shadow', 'ghostscene', 'silent', 'staleCredit', 'copytrack', 'bossstuck'];

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUT_ORDER.some(k => MUTATIONS[k].port === 10600 || MUTATIONS[k].port === 8765) || PORT === 10600 || PORT === 8765) {
  console.error('[drv] ⛔ 10600 (probe_magehand_reach) / 8765 (試遊サーバ) は使わない');
  process.exit(3);
}

// 変異ソースを先に組み立てる。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。
const SRC = {};
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  if (m.from.indexOf('\n') >= 0 || m.to.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
}

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

// 1 サーバ = 1 配信。reqs はそのサーバが受けた「/assets/bgm/」への要求 (1f の別経路)。
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const ctx = { port, mutKey, reqs: [], srv: null };
    ctx.srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        if (u.indexOf('/assets/bgm/') >= 0) ctx.reqs.push(u);
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
// 経路 A: GameAudio が代入された瞬間に playBgm を包む (setter スパイ。driver_bgm_town.js 由来)。
function spyInit() {
  window.__bgmCalls = [];
  let _ga;
  Object.defineProperty(window, 'GameAudio', {
    configurable: true,
    get() { return _ga; },
    set(v) {
      _ga = v;
      if (v && typeof v.playBgm === 'function') {
        const o = v.playBgm;
        v.playBgm = function (n) { try { window.__bgmCalls.push(n); } catch (e) {} return o.apply(this, arguments); };
        window.__bgmSpyOn = true;
      }
    },
  });
}
const readState = (page) => page.evaluate(() => {
  const ga = window.GameAudio;
  return {
    spyOn: !!window.__bgmSpyOn,
    calls: (window.__bgmCalls || []).slice(),
    track: ga && ga.__bgmTrack ? ga.__bgmTrack() : null,
    ids: ga && ga.__bgmTrackIds ? ga.__bgmTrackIds() : null,
    oldHooks: ga ? [typeof ga.__bgmFileState, typeof ga.__bgmFiles, typeof ga.__bgmFileIds] : null,
  };
});

// 静的ページ (title / town / world / tavern と撤退 3 本)。ロード → 合成 pointerdown → 900ms (クロスフェード 0.65s + 余裕)。
const STATIC_PAGES = [
  { key: 'title', url: '/title.html' },
  { key: 'town', url: '/town.html' },
  { key: 'world', url: '/world.html' },
  { key: 'tavern', url: '/tavern.html' },
  { key: 'worldOff', url: '/world.html?worldbgm=0' },
  { key: 'townOff', url: '/town.html?townbgm=0' },
  { key: 'titleOff', url: '/title.html?titlebgm=0' },
];

async function measureStatic(browser, sv, errs, pg, extra) {
  sv.reqs.length = 0;
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(pg.key + ': ' + e.message));
  try {
    await page.evaluateOnNewDocument(spyInit);
    await page.goto('http://localhost:' + sv.port + pg.url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction('!!window.GameAudio', { timeout: 30000 });
    await sleep(400);
    const before = await readState(page);
    await page.evaluate(() => { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await sleep(900);
    const after = await readState(page);
    const r = { before, after, bgmReqs: sv.reqs.slice() };
    if (extra) r.extra = await extra(page);
    return r;
  } finally {
    await page.close();
  }
}

// §2: 新曲 3 曲を OfflineAudioContext で描いて RMS を取る + 全 9 曲の lead。
async function measureTracks(page) {
  return page.evaluate(async () => {
    const ga = window.GameAudio;
    const out = { render: {}, leads: {} };
    const ids = ga.__bgmTrackIds();
    for (const id of ids) out.leads[id] = ga.__bgmTrackLead(id);
    for (const id of ['title', 'town', 'world']) {
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
}

// §1e / §3 / §4: index.html (廃坑)。⚠ index は pointerdown で解錠しない (K3) ⇒ GameAudio.unlock() を evaluate で呼ぶ。
async function measureIndex(browser, sv, errs) {
  sv.reqs.length = 0;
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('index: ' + e.message));
  try {
    await page.evaluateOnNewDocument(() => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        sessionStorage.removeItem('dragonfighters.generatedScenario');
      } catch (e) {}
    });
    await page.evaluateOnNewDocument(spyInit);
    await page.goto('http://localhost:' + sv.port + '/index.html?diag=1&intel=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function' && !!window.GameAudio", { timeout: 45000 });
    await page.evaluate(() => { try { startGame(); } catch (e) { window.__startErr = String(e); } });
    await sleep(1500);
    const r = await page.evaluate(async () => {
      const w = (ms) => new Promise(res => setTimeout(res, ms));
      const ga = window.GameAudio;
      const out = {
        startErr: window.__startErr || null, spyOn: !!window.__bgmSpyOn,
        callsAfterStart: window.__bgmCalls.slice(), phaseAfterStart: currentPhase,
        oldHooks: [typeof ga.__bgmFileState, typeof ga.__bgmFiles, typeof ga.__bgmFileIds],
      };
      ga.unlock();
      await w(900);
      out.afterUnlock = { calls: window.__bgmCalls.slice(), track: ga.__bgmTrack(), seam: window.__graphRun.bgm().id };
      const snap = (label) => ({
        label, seam: window.__graphRun.bgm().id,
        spy: window.__bgmCalls[window.__bgmCalls.length - 1],
        track: ga.__bgmTrack().name, voice: ga.__bgmTrack().voice,
      });
      // ⚠ setPhase ごとに 900ms 待つ (クロスフェード中の playBgm は pendingTrack に積まれるだけ = K8)。
      const seq = async (tag) => {
        const s = [];
        window.__inBossRoom = false; window.__inMidBoss = false;
        setPhase('explore'); await w(900); s.push(snap(tag + 'explore'));
        setPhase('combat'); await w(900); s.push(snap(tag + 'combat'));
        window.__inBossRoom = true; setPhase('combat'); await w(900); s.push(snap(tag + 'combat+boss'));
        window.__inBossRoom = false;
        return s;
      };
      out.base = await seq('');
      window.__inMidBoss = true; setPhase('combat'); await w(900); out.mid = snap('combat+mid');
      window.__inMidBoss = false;
      const s0 = scenarioId;
      scenarioId = 'dragon-lair';
      out.dragon = await seq('dragon-lair ');
      scenarioId = s0;
      const g0 = _genScenario;
      _genScenario = { tierKey: 'tier3' };
      out.gen = await seq('gen-tier3 ');
      _genScenario = g0;
      setPhase('explore'); await w(900);
      out.allCalls = window.__bgmCalls.slice();
      // §4b エンディング (const = window に載らないが裸の識別子で読める)。
      const html = Array.isArray(ENDING_CREDITS_HTML) ? ENDING_CREDITS_HTML.join('') : String(ENDING_CREDITS_HTML);
      const d = document.createElement('div');
      d.innerHTML = html;
      const heads = Array.from(d.querySelectorAll('.erHead'));
      const itemsAfter = (label) => {
        const h = heads.find(x => x.textContent.trim() === label);
        const items = [];
        let n = h ? h.nextElementSibling : null;
        while (n && n.classList.contains('erItem')) { items.push(n.textContent); n = n.nextElementSibling; }
        return h ? items : null;
      };
      out.music = itemsAfter('音楽');
      out.sfx = itemsAfter('効果音');
      // §4a 設定モーダル。⚠ openSettings() は 2 回目で閉じる (トグル) ので最後に 1 回だけ。
      try {
        ga.openSettings();
        const ov = document.getElementById('gameSettingsOverlay');
        const box = ov && ov.firstElementChild;
        out.settingsCredit = box && box.lastElementChild ? box.lastElementChild.textContent : null;
        ga.closeSettings();
      } catch (e) { out.settingsErr = String(e); }
      return out;
    });
    r.bgmReqs = sv.reqs.slice();
    return r;
  } finally {
    await page.close();
  }
}

async function measureAll(browser, sv) {
  const errs = [];
  const m = { pages: {}, errs };
  for (const pg of STATIC_PAGES) {
    m.pages[pg.key] = await measureStatic(browser, sv, errs, pg, pg.key === 'title' ? measureTracks : null);
  }
  m.tracks = m.pages.title.extra;
  m.index = await measureIndex(browser, sv, errs);
  return m;
}

// ══════════════════════════════════════════════════════════════════════════════
// assert (key, 文面, m → [ok, detail])
// ══════════════════════════════════════════════════════════════════════════════
const NEW3 = ['title', 'town', 'world'];
const PAGE_EXPECT = [['1a', 'title'], ['1b', 'town'], ['1c', 'world'], ['1d', 'tavern']];
const J = (v) => JSON.stringify(v);
const callsOf = (m, key) => (key === 'index' ? m.index.callsAfterStart : m.pages[key].after.calls) || [];
const trackOf = (m, key) => (key === 'index' ? m.index.afterUnlock.track : m.pages[key].after.track) || {};
const idsOf = (m) => (m.pages.title.after.ids || []);

const ASSERTS = [];
// §0
for (const key of ['title', 'town', 'world', 'tavern', 'index']) {
  ASSERTS.push(['0a-' + key, '[装置] ' + key + ': スパイが掛かり経路 A が 1 件以上の ID を捉えた'
    + (key === 'tavern' ? ' (pointerdown 後)' : key === 'index' ? ' (startGame 後)' : ''),
  m => {
    const spy = key === 'index' ? m.index.spyOn : m.pages[key].after.spyOn;
    const c = callsOf(m, key);
    return [spy === true && c.length >= 1, 'spy=' + spy + ' calls=' + J(c)];
  }]);
}
ASSERTS.push(['0b', '__bgmTrackIds() が 9 件 (直書き) で title / town / world を含む',
  m => { const ids = idsOf(m); return [ids.length === 9 && NEW3.every(x => ids.indexOf(x) >= 0), J(ids)]; }]);
ASSERTS.push(['0c', '⭐ 全ページで経路 A に渡った ID がすべて __bgmTrackIds() に在る (罠 A の検出器)',
  m => {
    const ids = idsOf(m);
    const all = [];
    for (const k of Object.keys(m.pages)) all.push(...m.pages[k].after.calls.map(c => k + ':' + c));
    all.push(...(m.index.allCalls || []).map(c => 'index:' + c));
    const bad = all.filter(s => ids.indexOf(s.slice(s.indexOf(':') + 1)) < 0);
    return [ids.length > 0 && all.length > 0 && bad.length === 0,
      '渡った ID ' + all.length + ' 件 / 表に無い=' + J(Array.from(new Set(bad)))];
  }]);
ASSERTS.push(['0d', 'GameAudio.__bgmFileState / __bgmFiles / __bgmFileIds が 5 ページとも undefined',
  m => {
    const got = {};
    for (const k of ['title', 'town', 'world', 'tavern']) got[k] = m.pages[k].after.oldHooks;
    got.index = m.index.oldHooks;
    const ok = Object.keys(got).every(k => Array.isArray(got[k]) && got[k].every(t => t === 'undefined'));
    return [ok, J(got)];
  }]);
// §1
for (const [n, id] of PAGE_EXPECT.concat([['1e', 'explore']])) {
  const key = n === '1e' ? 'index' : id;
  ASSERTS.push([n + '-A', key + ': 経路 A (スパイ) に渡った ID がすべて "' + id + '"',
    m => { const c = callsOf(m, key); return [c.length >= 1 && c.every(x => x === id), J(c)]; }]);
  ASSERTS.push([n + '-B', key + ': 経路 B (__bgmTrack) が { name: "' + id + '", voice: true }',
    m => { const t = trackOf(m, key); return [t.name === id && t.voice === true, J(t)]; }]);
}
ASSERTS.push(['1f', '5 ページ (+ 撤退 3 本) のどれも「/assets/bgm/」を要求しない (サーバの要求ログ)',
  m => {
    const got = {};
    for (const k of Object.keys(m.pages)) if (m.pages[k].bgmReqs.length) got[k] = m.pages[k].bgmReqs;
    if (m.index.bgmReqs.length) got.index = m.index.bgmReqs;
    return [Object.keys(got).length === 0, Object.keys(got).length ? J(got) : '要求 0 件 (8 ページ)'];
  }]);
// §2
ASSERTS.push(['2a', '新曲 3 曲の __renderBgmOffline(id, 12) が resolve し、無音でない (RMS > -40 dBFS)',
  m => {
    const r = m.tracks.render;
    return [NEW3.every(id => r[id] && r[id].ok && r[id].len > 0 && r[id].rmsDb > -40), J(r)];
  }]);
ASSERTS.push(['2b', '新曲 3 曲の lead が、他の 8 曲のどれとも一致しない',
  m => {
    const L = m.tracks.leads;
    const ids = Object.keys(L);
    const dup = [];
    for (const a of NEW3) {
      if (!Array.isArray(L[a]) || L[a].length === 0) { dup.push(a + '=lead 無し'); continue; }
      for (const b of ids) if (b !== a && J(L[a]) === J(L[b])) dup.push(a + '==' + b);
    }
    return [ids.length === 9 && dup.length === 0, '比較 ' + ids.length + ' 曲 / 一致=' + J(dup)];
  }]);
ASSERTS.push(['2c', '新曲 3 曲の RMS が -18.0〜-12.0 dBFS',
  m => {
    const r = m.tracks.render;
    return [NEW3.every(id => r[id] && r[id].ok && r[id].rmsDb >= -18.0 && r[id].rmsDb <= -12.0),
      NEW3.map(id => id + '=' + (r[id] ? r[id].rmsDb : '?')).join(' / ')];
  }]);
// §3
const snapOk = (s, id) => s && s.seam === id && s.spy === id && s.track === id && s.voice === true;
const snapStr = (s) => s ? (s.label + ' seam=' + s.seam + ' spy=' + s.spy + ' track=' + s.track) : 'null';
ASSERTS.push(['3a', '探索フェーズ → シーム・スパイ・__bgmTrack とも explore', m => [snapOk(m.index.base[0], 'explore'), snapStr(m.index.base[0])]]);
ASSERTS.push(['3b', 'setPhase("combat") → combat', m => [snapOk(m.index.base[1], 'combat'), snapStr(m.index.base[1])]]);
ASSERTS.push(['3c', '__inBossRoom = true で setPhase("combat") → boss', m => [snapOk(m.index.base[2], 'boss'), snapStr(m.index.base[2])]]);
ASSERTS.push(['3d', '__inMidBoss = true で setPhase("combat") → midboss', m => [snapOk(m.index.mid, 'midboss'), snapStr(m.index.mid)]]);
ASSERTS.push(['3e', '⭐ scenarioId="dragon-lair" / _genScenario={tierKey:"tier3"} でも (3a)〜(3c) と同じ ID 列 (シナリオ別の表が残っていない)',
  m => {
    const key = (arr) => arr.map(s => [s.seam, s.spy, s.track].join('/')).join(' | ');
    const b = key(m.index.base), d = key(m.index.dragon), g = key(m.index.gen);
    return [b === d && b === g && m.index.base.length === 3, '基=' + b + ' / dragon=' + d + ' / gen=' + g];
  }]);
// §4
ASSERTS.push(['4a', '設定モーダルのクレジット行に 魔王魂・ユーフルカ が無く、オリジナル が在る',
  m => {
    const t = m.index.settingsCredit;
    return [typeof t === 'string' && t.indexOf('BGM') >= 0 && t.indexOf('オリジナル') >= 0
      && t.indexOf('魔王魂') < 0 && t.indexOf('ユーフルカ') < 0, J(t) + (m.index.settingsErr ? ' err=' + m.index.settingsErr : '')];
  }]);
ASSERTS.push(['4b', 'エンディング「音楽」直後の erItem が オリジナル楽曲 を含み、ユーフルカ / Wingless Seraph を含まない (効果音行の 魔王魂 は対象外)',
  m => {
    const it = m.index.music;
    const s = (it || []).join(' / ');
    return [Array.isArray(it) && it.length >= 1 && s.indexOf('オリジナル楽曲') >= 0
      && s.indexOf('ユーフルカ') < 0 && s.indexOf('Wingless Seraph') < 0,
      '音楽=' + J(it) + ' / [記録] 効果音=' + J(m.index.sfx)];
  }]);
// §5
ASSERTS.push(['5a', 'world.html?worldbgm=0 → 経路 A・B とも explore',
  m => { const p = m.pages.worldOff.after; return [p.calls.length >= 1 && p.calls.every(x => x === 'explore') && p.track && p.track.name === 'explore' && p.track.voice === true, 'A=' + J(p.calls) + ' B=' + J(p.track)]; }]);
ASSERTS.push(['5b', 'town.html?townbgm=0 → 経路 A・B とも tavern',
  m => { const p = m.pages.townOff.after; return [p.calls.length >= 1 && p.calls.every(x => x === 'tavern') && p.track && p.track.name === 'tavern' && p.track.voice === true, 'A=' + J(p.calls) + ' B=' + J(p.track)]; }]);
ASSERTS.push(['5c', 'title.html?titlebgm=0 → 経路 A が 0 件・経路 B が null (スパイは掛かっている)',
  m => { const p = m.pages.titleOff.after; return [p.spyOn === true && p.calls.length === 0 && p.track && p.track.name === null, 'spy=' + p.spyOn + ' A=' + J(p.calls) + ' B=' + J(p.track)]; }]);
// §9
ASSERTS.push(['9a', '測定ページで pageerror が出ていない', m => [m.errs.length === 0, m.errs.slice(0, 6).join(' | ')]]);

const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;
for (const k of MUT_ORDER) for (const t of MUTATIONS[k].targets) {
  if (!ASSERT_OF[t]) { console.error('[drv] ⛔ 変異 ' + k + ' の担当 (' + t + ') が assert に無い'); process.exit(3); }
}
const SECTIONS = [
  ['§0 装置 — 母集団', a => a[0].indexOf('0') === 0],
  ['§1 ページごとの BGM (2 経路)', a => a[0].indexOf('1') === 0],
  ['§2 新曲 3 曲', a => a[0].indexOf('2') === 0],
  ['§3 ダンジョンの鳴らし分け', a => a[0].indexOf('3') === 0],
  ['§4 クレジット', a => a[0].indexOf('4') === 0],
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
  const profile = require('./_pptr_profile')('df_synthbgm_');
  const browserPath = findBrowser();

  console.log('=== verify_synth_bgm.js'
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
      //   ⚠ audio.js の unlocked は unlock() でしか true にならないので、ロード時の 1 本は pendingBgm へ落ちたまま。
      args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    });

    if (!NEGATIVE) {
      const sv = servers[0];
      // 配信バイトの検算 (残骸サーバが同じポートを握っていると別物を測る)。
      const mutAudio = !!(MUTATE && MUT_SRC[MUTATE].file === 'audio.js');
      const probe = await httpGet('http://localhost:' + sv.port + '/audio.js');
      const expectAudio = mutAudio ? MUT_SRC[MUTATE].body : fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8');
      mark('§0 装置 — 配信と変異アンカー');
      check('(0z) [装置] port ' + sv.port + ' の配信 audio.js が' + (mutAudio ? '変異版' : '作業ツリー') + 'とバイト一致',
        probe.body === expectAudio, probe.body.length + 'B / 期待 ' + expectAudio.length + 'B');
      check('(0y) [装置] 変異アンカー 6 本がそれぞれちょうど 1 箇所ヒットする', true,
        '起動時ガードを通過 (' + MUT_ORDER.join(' / ') + ')');

      const m = await measureAll(browser, sv);
      const R = evalAll(m);
      for (const [title, pred] of SECTIONS) {
        mark(title);
        for (const a of ASSERTS.filter(pred)) check('(' + a[0] + ') ' + a[1], R[a[0]][0], R[a[0]][1]);
      }
      console.log('\n       [記録] 曲の在庫: ' + J(idsOf(m)));
      console.log('       [記録] 新曲 RMS: ' + NEW3.map(id => id + '=' + (m.tracks.render[id] || {}).rmsDb).join(' / '));
      console.log('       [記録] index 起動直後の経路 A: ' + J(m.index.callsAfterStart) + ' / 解錠後の経路 B: ' + J(m.index.afterUnlock.track));
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
        check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
          pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
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
        if (k === 'shadow') {
          // ⭐⭐⭐ 罠 A-1 の機械証明を名指しで出す。
          check('(neg-shadow-罠A1) 経路 A (1a-A) と (0c) は緑のまま、経路 B (1a-B) だけ赤',
            R['1a-A'][0] && R['0c'][0] && !R['1a-B'][0],
            '1a-A=' + R['1a-A'][0] + ' 0c=' + R['0c'][0] + ' 1a-B=' + R['1a-B'][0] + ' / ' + R['1a-B'][1]);
        }
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
