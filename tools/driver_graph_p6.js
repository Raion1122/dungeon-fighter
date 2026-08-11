/*
 * driver_graph_p6.js — ★P6「残り 5 シナリオの分岐マップ化」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * 測るもの (buildScenarioRun が返す**内蔵グラフ 5 本**。廃坑は driver_graph_sce1 の担当):
 *   §1 骨格      … 8 ノードの木 / entry=n0 / boss=n7 / kind 列 / 出口の本数と向き / 部屋名
 *   §2 lint      … DFMapDef.lintRun が error 0 / warning 0、console に [graph] 警告が出ない
 *   §3 P5 制約   … n0/n5 は敵 0、n6 は「**戦う敵**」0、ボス護衛は col>=39 (入場から 400px 以上)
 *   §4 kind 配線 … 罠は search だけ / 玄室宝箱は loot だけ / combat には湧かない
 *   §5 隠し要素  … 残影の獣(檻つき) / ハイドラ / 守護者 5 体 / カエルム / ミミック
 *   §6 撤退      … ?graph=0 で 5 本とも分岐が死ぬ (恒久の契約。index.html :3699)
 *   §7 噂フラグ  … ?intel=0 で獣も檻もハイドラも現れない / ?intel=1 で現れる
 *   §G distinct  … 5 本が**相互に異なる**グラフである (同じ物を 5 回測っていない)
 *
 * ⚠⚠ 「0 件」は**機能の故障ではなく母集団への未到達**を先に疑う、という流儀に合わせ、
 *   各節は「そのノードへ実際に入った」ことを (T*) で先に確かめてから中身を測る。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port      | mutate        | 注入する欠陥                        | 赤くなるべき節
 *   PORT      | (素)          | —                                   | —
 *   PORT+1    | nop6          | orc-fort だけ分岐を返さない          | §1〜§5 の orc-fort 群
 *   PORT+2    | nohoardgate   | 財宝の山のボスノード限定を外す        | §5 (ミミックが全ノードに湧く)
 *   PORT+3    | nocagenode    | 檻をノードに紐づけず旧絶対座標へ戻す   | §5 (檻が部屋の外 = 岩盤)
 *   PORT+4    | noextraspawn  | 噂フラグ付きの追加スポーンを配らない   | §5 §7 (獣とハイドラが消える)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**に収めること (index.html は CRLF なので \n を含むと
 *   原理的に一致しない)。置換前後で**バイト長を必ずずらす** (同じ長さだと (0e) が誤報する)。
 *
 * 使い方:
 *   node tools/driver_graph_p6.js
 *   node tools/driver_graph_p6.js --mutate nop6 --headful
 *   node tools/driver_graph_p6.js --scenarios orc-fort,dragon-lair     (切り分け用)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}
const HEADFUL = process.argv.includes('--headful');
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+4 の **5 本**を掴む
 *   (既存の最大は 8985)。 */
const PORT = parseInt(arg('port', '8992'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
const SCEN = {
  'bandits-forest': { title: '森',   boss: 'scar',            n6kind: 'event', hidden: 'shadowBeast', cages: 1, dormant: 0, intel: true  },
  'lizard-swamp':   { title: '沼地', boss: 'lizardChieftain', n6kind: 'event', hidden: 'hydra',       cages: 0, dormant: 0, intel: true  },
  'orc-fort':       { title: '砦',   boss: 'garrock',         n6kind: 'event', hidden: 'stoneGolem',  cages: 0, dormant: 5, intel: false },
  'undead-temple':  { title: '神殿', boss: 'lich',            n6kind: 'event', hidden: 'caelum',      cages: 0, dormant: 0, intel: false },
  'dragon-lair':    { title: '竜巣', boss: 'pharaxus',        n6kind: 'loot',  hidden: null,          cages: 0, dormant: 0, intel: false },
};
const ALL_SCENS = Object.keys(SCEN);
const SCENS = (arg('scenarios', '') || '').split(',').map(s => s.trim()).filter(Boolean);
if (!SCENS.length) SCENS.push.apply(SCENS, ALL_SCENS);
for (const s of SCENS) if (!SCEN[s]) { console.error('[drv] 未知の --scenarios: ' + s); process.exit(3); }

// 骨格 (n6 だけシナリオ依存なので null を置いて SCEN から引く)
const KIND_OF = { n0: 'start', n1: 'combat', n2: 'search', n3: 'loot', n4: 'combat', n5: 'rest', n6: null, n7: 'boss' };
// 出口 (to:dir の並び。順序も含めて契約)
const EXITS_OF = {
  n0: 'n1:right,n2:up,n3:down', n1: 'n4:right,n5:up', n2: 'n6:right',
  n3: '', n4: 'n7:right', n5: '', n6: '', n7: '',
};
// 檻・隠し要素を置くタイル (SCENARIO_NODE_EXTRAS と同じ値。部屋の中心 col36/row13)
const EXTRA_TX = 36, EXTRA_TY = 13;
// ノード部屋の矩形 (P6_MID / P6_BOSSR)。⚠ 実装と同じ値を書くのが契約
const MID_C1 = 33, MID_C2 = 39, BOSS_C1 = 32, BOSS_C2 = 40, RECT_R1 = 11, RECT_R2 = 16;
// ボス部屋の入場地点 = 西の縁 + NODE_ENTRY_INSET(2)。護衛はここから 400px(=4.2 タイル)より遠く
const BOSS_ENTRY_TX = BOSS_C1 + 2, GUARD_MIN_TX = 39;

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* ⚠ アンカーは buildScenarioRun の 1 行まるごと。⚠⚠ **実装側の 6 行を縦に揃えないこと**
   *   (空白 1 つで driver_graph_sce1 の noscen と本 nop6 の両方が exit 3 で空振りする)。 */
  nop6: ['      if (scenId === "orc-fort") return buildOrcFortRun();',
         '      if (0) return buildOrcFortRun();   /* ★変異nop6 */'],
  nohoardgate: ['      if (!isBossNodeNow()) return;',
                '      if (false) { return; }   /* ★変異nohoardgate */'],
  nocagenode: ['      const src = RUN ? nodeCageSpawns() : (currentScenario.cageSpawns || []);',
               '      const src = (currentScenario.cageSpawns || []);   /* ★変異nocagenode */'],
  noextraspawn: ['      return base.concat(ex.spawns.filter(sp => questFlagOn(sp[3])));',
                 '      return base;   /* ★変異noextraspawn */'],
};
const MUT_ORDER = ['nop6', 'nohoardgate', 'nocagenode', 'noextraspawn'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const [from, to] = MUTATIONS[key];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (from.length === to.length) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → (0e) が誤報する');
    process.exit(3);
  }
  const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
  const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
  if (hits.length !== 1 || n !== 1) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
      (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
      ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  out[hits[0]] = out[hits[0]].split(from).join(to);
  _mutCache[key] = out;
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
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey)[rel]); return;
        }
        /* ⚠ path.join は '\' へ正規化する。ROOT を '/' 区切りのまま比較すると
         *   startsWith が必ず false になり全部 404 になる (2026-08-12 に実際に踏んだ)。 */
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

async function bootPage(browser, url, scen, warns, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'warn' || m.type() === 'warning') warns.push(t);
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* 骨格 + lint を 1 回で取る。★ノードの中身 (rooms[0]) は**著者が書いた宣言**を見る
 * (スポーン後の実体は下の巡回で別に測る = 2 つの物差しを混ぜない)。 */
const SHAPE_SRC = `(() => {
  const g = window.__graphRun, gr = g.graph();
  if (!gr) return { active: false };
  return {
    active: g.active(), entry: gr.entry, boss: g.bossNodeId(), node: g.nodeId(),
    scen: scenarioId,
    nodes: gr.nodes.map(n => ({
      id: n.id, kind: n.kind, name: (n.mapDef && n.mapDef.name) || '',
      rect: n.mapDef.rooms[0].rect,
      slots: (n.mapDef.rooms[0].enemySlots || []).map(s => s.join('/')),
      bossSlot: n.mapDef.rooms[0].bossSlot ? n.mapDef.rooms[0].bossSlot.join('/') : null,
      painting: n.mapDef.rooms[0].painting,
      exits: n.exits.map(e => e.to + ':' + e.dir).join(','),
    })),
    lint: (() => { const L = window.DFMapDef.lintRun(gr);
                   return { e: L.errors.map(x => x.code), w: L.warnings.map(x => x.code) }; })(),
  };
})()`;

/* ノードを巡って**実際に湧いた盤面**を測る。★巡回そのものを本編の enterNode に通す。
 * ⚠ 素の側と変異側で**同じ文字列**を流す = 同じ手順を両方に掛けたことが読んで分かる。 */
const TOUR_SRC = `(async () => {
  const g = window.__graphRun, out = {};
  const snap = () => ({
    enemies: enemies.length,
    fighters: enemies.filter(e => e.alive && !e.inactive && !e.passiveNpc).length,
    dormant: enemies.filter(e => e.dormant).length,
    types: enemies.map(e => e.type),
    cages: cages.map(c => c.tx + '/' + c.ty),
    traps: traps.length,
    chests: roomChests.length,
    mimic: mimicChest ? (mimicChest.tx + '/' + mimicChest.ty) : null,
    at: g.nodeId(),
  });
  out.n0 = snap();
  await g.enter('n2', 'up');    out.n2 = snap();
  await g.enter('n6', 'right'); out.n6 = snap();
  await g.enter('n2', 'left');  await g.enter('n0', 'down');
  await g.enter('n3', 'down');  out.n3 = snap();
  await g.enter('n0', 'up');
  await g.enter('n1', 'right'); out.n1 = snap();
  await g.enter('n4', 'right'); out.n4 = snap();
  await g.enter('n7', 'right'); out.n7 = snap();
  return out;
})()`;

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 http://localhost:' + PORT +
              '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const profile = require('./_pptr_profile')('df_graph_p6_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const PURE = 'http://localhost:' + PORT;
  const errsAll = [];

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ────────────────────────
  mark('§0 変異の配信検算');
  {
    const get = (p) => new Promise((res, rej) => {
      /* ⚠ Buffer で受けてから 1 度だけ decode する。チャンク境界で日本語 (3 バイト) が
       *   割れると文字数が変わり「素と変異のバイト長が違う」assert が誤報する。 */
      http.get('http://localhost:' + p + '/index.html', r => {
        const bufs = []; r.on('data', d => bufs.push(d));
        r.on('end', () => res(Buffer.concat(bufs)));
      }).on('error', rej);
    });
    const a = await get(PORT), aS = a.toString('utf8');
    for (const k of MUT_ORDER) {
      const b = await get(PORT_OF[k]), bS = b.toString('utf8');
      const [from, to] = MUTATIONS[k];
      check('(0a-' + k + ') 素の配信に変異前の文字列が 1 箇所',
        aS.split(from).length - 1 === 1, '件数=' + (aS.split(from).length - 1));
      check('(0b-' + k + ') 素の配信に変異後の文字列が 0 箇所', aS.indexOf(to) < 0, '');
      check('(0c-' + k + ') 変異の配信に変異前の文字列が 0 箇所', bS.indexOf(from) < 0, '');
      check('(0d-' + k + ') 変異の配信に変異後の文字列が 1 箇所',
        bS.split(to).length - 1 === 1, '件数=' + (bS.split(to).length - 1));
      check('(0e-' + k + ') 2 つの配信のバイト長が違う (同じ物を 2 回測っていない)',
        a.length !== b.length, '素=' + a.length + 'B / 変異=' + b.length + 'B');
    }
  }

  const base = MUTATE ? 'http://localhost:' + PORT_OF[MUTATE] : PURE;
  if (MUTATE) console.log('[drv] ★本体は変異 ' + MUTATE + ' の配信で測ります');

  const shapeByScen = {};

  for (const sid of SCENS) {
    const S = SCEN[sid];
    mark('§1-§5 ' + sid + ' (' + S.title + ')');
    const warns = [], errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1', sid, warns, errs);

    // ── §1 骨格 ────────────────────────────────────────────────────────────
    const sh = await page.evaluate(SHAPE_SRC);
    shapeByScen[sid] = sh;
    check('(1a-' + sid + ') 分岐グラフで起動している', sh.active === true, 'active=' + sh.active);
    if (!sh.active) {
      // 母集団へ届いていないので以降は測らない (0 件を「機能の故障」と読ませない)
      for (const e of errs) errsAll.push(sid + ': ' + e);
      await page.close();
      continue;
    }
    check('(1b-' + sid + ') scenarioId が素のまま (生成クエストに化けていない)',
      sh.scen === sid, 'scenarioId=' + sh.scen);
    check('(1c-' + sid + ') ノードが 8 件', sh.nodes.length === 8, '件数=' + sh.nodes.length);
    check('(1d-' + sid + ') entry=n0 / 起動ノード=n0', sh.entry === 'n0' && sh.node === 'n0',
      'entry=' + sh.entry + ' node=' + sh.node);
    check('(1e-' + sid + ') boss ノード=n7', sh.boss === 'n7', 'boss=' + sh.boss);
    {
      const got = sh.nodes.map(n => n.id + ':' + n.kind).join(' ');
      const want = Object.keys(KIND_OF).map(id => id + ':' + (KIND_OF[id] || S.n6kind)).join(' ');
      check('(1f-' + sid + ') kind の並びが契約どおり', got === want, got);
    }
    {
      const got = sh.nodes.map(n => n.id + '[' + n.exits + ']').join(' ');
      const want = Object.keys(EXITS_OF).map(id => id + '[' + EXITS_OF[id] + ']').join(' ');
      check('(1g-' + sid + ') 出口の行き先と向きが契約どおり', got === want, got);
    }
    {
      const names = sh.nodes.map(n => n.name);
      check('(1h-' + sid + ') 部屋名が 8 件とも非空かつ相異なる',
        names.every(x => x && x.length > 0) && new Set(names).size === 8, names.join(' / '));
    }
    {
      // ⚠ 1 枚絵は全ノード null (在庫 12 枚は 20x16 / 22x18 用で 7x6 に載らない)
      check('(1i-' + sid + ') 1 枚絵は全ノード未指定 (Phase 7 まで)',
        sh.nodes.every(n => n.painting === null), '');
      const midOk = sh.nodes.filter(n => n.id !== 'n7')
        .every(n => n.rect[0] === RECT_R1 && n.rect[1] === MID_C1 && n.rect[2] === RECT_R2 && n.rect[3] === MID_C2);
      const b = sh.nodes.find(n => n.id === 'n7').rect;
      check('(1j-' + sid + ') 道中は 7 列 / ボスだけ 9 列',
        midOk && b[0] === RECT_R1 && b[1] === BOSS_C1 && b[2] === RECT_R2 && b[3] === BOSS_C2,
        'boss rect=' + b.join(','));
    }

    // ── §2 lint ────────────────────────────────────────────────────────────
    check('(2a-' + sid + ') lintRun の error 0', sh.lint.e.length === 0, sh.lint.e.join(' / '));
    check('(2b-' + sid + ') lintRun の warning 0', sh.lint.w.length === 0, sh.lint.w.join(' / '));
    {
      const gw = warns.filter(w => /^\[graph\] graph-/.test(w));
      check('(2c-' + sid + ') 起動時の console に [graph] 警告が出ない', gw.length === 0, gw.join(' / '));
    }

    // ── §3 P5 の実装制約 ────────────────────────────────────────────────────
    {
      const byId = {}; for (const n of sh.nodes) byId[n.id] = n;
      check('(3a-' + sid + ') n0 (開幕ナレの部屋) に敵スロットが 0',
        byId.n0.slots.length === 0, '件数=' + byId.n0.slots.length);
      check('(3b-' + sid + ') n5 (休憩) に敵スロットが 0',
        byId.n5.slots.length === 0, '件数=' + byId.n5.slots.length);
      const gx = byId.n7.slots.map(s => parseInt(s.split('/')[0], 10));
      check('(3c-' + sid + ') ボスの護衛が col>=' + GUARD_MIN_TX + ' (入場 col' + BOSS_ENTRY_TX + ' から 400px 超)',
        gx.length > 0 && gx.every(x => x >= GUARD_MIN_TX), 'cols=' + gx.join(','));
      check('(3d-' + sid + ') ボススロットが ' + S.boss + ' で col>=' + GUARD_MIN_TX,
        !!byId.n7.bossSlot && byId.n7.bossSlot.split('/')[2] === S.boss &&
        parseInt(byId.n7.bossSlot.split('/')[0], 10) >= GUARD_MIN_TX, 'bossSlot=' + byId.n7.bossSlot);
      const inRect = (n) => n.slots.every(s => {
        const tx = Number(s.split('/')[0]), ty = Number(s.split('/')[1]);
        const c1 = n.id === 'n7' ? BOSS_C1 : MID_C1, c2 = n.id === 'n7' ? BOSS_C2 : MID_C2;
        return tx >= c1 && tx <= c2 && ty >= RECT_R1 && ty <= RECT_R2;
      });
      check('(3e-' + sid + ') 敵スロットが全部その部屋の矩形の中',
        sh.nodes.every(inRect), sh.nodes.filter(n => !inRect(n)).map(n => n.id).join(','));
    }

    // ── §4 / §5 巡回して盤面の実体を測る ────────────────────────────────────
    const tour = await page.evaluate(TOUR_SRC);
    for (const id of ['n0', 'n1', 'n2', 'n3', 'n4', 'n6', 'n7'])
      check('(T-' + sid + '-' + id + ') ' + id + ' へ実際に入った (母集団へ到達)',
        tour[id] && tour[id].at === id, tour[id] ? 'at=' + tour[id].at : 'なし');

    check('(4a-' + sid + ') 罠は search(n2) にだけ湧く',
      tour.n2.traps > 0 && [tour.n0, tour.n1, tour.n3, tour.n4, tour.n6, tour.n7].every(x => x.traps === 0),
      'n0/n1/n2/n3/n4/n6/n7 = ' + [tour.n0, tour.n1, tour.n2, tour.n3, tour.n4, tour.n6, tour.n7].map(x => x.traps).join('/'));
    check('(4b-' + sid + ') loot(n3) には玄室宝箱が必ず湧く (当たりの保証)',
      tour.n3.chests >= 1, '件数=' + tour.n3.chests);
    check('(4c-' + sid + ') combat(n1/n4) には宝箱も罠も湧かない',
      tour.n1.chests === 0 && tour.n4.chests === 0 && tour.n1.traps === 0 && tour.n4.traps === 0,
      'n1=' + tour.n1.chests + '/' + tour.n1.traps + ' n4=' + tour.n4.chests + '/' + tour.n4.traps);
    check('(4d-' + sid + ') n0 (start) は空の部屋 (敵 0 / 罠 0 / 宝箱 0)',
      tour.n0.enemies === 0 && tour.n0.traps === 0 && tour.n0.chests === 0,
      '敵' + tour.n0.enemies + ' 罠' + tour.n0.traps + ' 箱' + tour.n0.chests);
    check('(4e-' + sid + ') 戦闘ノードに敵が実際に湧いている',
      tour.n1.fighters > 0 && tour.n4.fighters > 0 && tour.n7.fighters > 0,
      'n1=' + tour.n1.fighters + ' n4=' + tour.n4.fighters + ' n7=' + tour.n7.fighters);

    // ── §5 隠し要素 ────────────────────────────────────────────────────────
    check('(5a-' + sid + ') n6 に「戦う敵」が 1 体も居ない (接近判定が encounterActive で死なない)',
      tour.n6.fighters === 0, '戦う敵=' + tour.n6.fighters + ' 全体=' + tour.n6.enemies +
      ' [' + tour.n6.types.join(',') + ']');
    if (S.hidden) {
      check('(5b-' + sid + ') n6 に隠し要素 ' + S.hidden + ' が居る',
        tour.n6.types.indexOf(S.hidden) >= 0, '[' + tour.n6.types.join(',') + ']');
      check('(5c-' + sid + ') 隠し要素は n6 以外のノードには居ない',
        [tour.n0, tour.n1, tour.n2, tour.n3, tour.n4, tour.n7].every(x => x.types.indexOf(S.hidden) < 0), '');
    }
    check('(5d-' + sid + ') 休眠する守護者が ' + S.dormant + ' 体',
      tour.n6.dormant === S.dormant, '実測=' + tour.n6.dormant);
    check('(5e-' + sid + ') 檻が ' + S.cages + ' 基、かつ部屋の中心 (' + EXTRA_TX + '/' + EXTRA_TY + ')',
      tour.n6.cages.length === S.cages && tour.n6.cages.every(c => c === EXTRA_TX + '/' + EXTRA_TY),
      '[' + tour.n6.cages.join(' ') + ']');
    {
      // 財宝の山 (ミミック) は dragon-lair の**ボスノードだけ**
      const wantMimic = sid === 'dragon-lair';
      check('(5f-' + sid + ') ミミックはボスノード n7 に ' + (wantMimic ? 'ある' : 'ない'),
        (tour.n7.mimic !== null) === wantMimic, 'n7 mimic=' + tour.n7.mimic);
      const mids = ['n0', 'n1', 'n2', 'n3', 'n4', 'n6'];
      check('(5g-' + sid + ') ミミックが道中ノードに湧かない',
        mids.every(k => tour[k].mimic === null),
        mids.map(k => k + '=' + tour[k].mimic).join(' '));
    }

    for (const e of errs) errsAll.push(sid + ': ' + e);
    await page.close();
  }

  // ── §6 撤退スイッチ ?graph=0 ────────────────────────────────────────────────
  mark('§6 撤退スイッチ ?graph=0 (恒久の契約)');
  for (const sid of SCENS) {
    const warns = [], errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&graph=0', sid, warns, errs);
    const st = await page.evaluate('({ active: window.__graphRun.active(), rooms: ROOMS.length })');
    check('(6a-' + sid + ') ?graph=0 で分岐が死ぬ (従来の単一マップへ戻る)',
      st.active === false, 'active=' + st.active + ' rooms=' + st.rooms);
    check('(6b-' + sid + ') ?graph=0 の部屋数が 2 (従来のダンジョン幾何)',
      st.rooms === 2, 'rooms=' + st.rooms);
    for (const e of errs) errsAll.push(sid + '(graph=0): ' + e);
    await page.close();
  }

  /* ⚠⚠ 装置 assert: 「撤退スイッチを外すと分岐が生きる」を 1 本持つ。
   *   これが無いと ?graph=0 が黙って無効化されても §6 が緑のままになる。 */
  mark('§6b 撤退スイッチを外すと分岐が生きる (スイッチが効いている証拠)');
  for (const sid of SCENS) {
    const warns = [], errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1', sid, warns, errs);
    const a = await page.evaluate('window.__graphRun.active()');
    check('(6c-' + sid + ') ?graph 無指定なら分岐が生きる', a === true, 'active=' + a);
    await page.close();
  }

  // ── §7 酒場の噂フラグ ──────────────────────────────────────────────────────
  mark('§7 酒場の噂フラグ ?intel=0 / ?intel=1');
  for (const sid of SCENS) {
    if (!SCEN[sid].intel) continue;
    const want = SCEN[sid].hidden;
    for (const v of ['0', '1']) {
      const warns = [], errs = [];
      const page = await bootPage(browser, base + '/index.html?diag=1&intel=' + v, sid, warns, errs);
      const r = await page.evaluate(`(async () => {
        const g = window.__graphRun;
        await g.enter('n2', 'up'); await g.enter('n6', 'right');
        return { types: enemies.map(e => e.type), cages: cages.length, at: g.nodeId() };
      })()`);
      check('(7T-' + sid + '-' + v + ') n6 へ到達した', r.at === 'n6', 'at=' + r.at);
      check('(7a-' + sid + '-' + v + ') ?intel=' + v + ' で ' + want + ' が ' + (v === '1' ? 'いる' : 'いない'),
        (r.types.indexOf(want) >= 0) === (v === '1'), '[' + r.types.join(',') + ']');
      check('(7b-' + sid + '-' + v + ') ?intel=' + v + ' で檻が ' + (v === '1' ? SCEN[sid].cages : 0) + ' 基',
        r.cages === (v === '1' ? SCEN[sid].cages : 0), '件数=' + r.cages);
      for (const e of errs) errsAll.push(sid + '(intel=' + v + '): ' + e);
      await page.close();
    }
  }

  // ── §G 5 本が相互に異なるグラフである (同じ物を 5 回測っていない) ───────────
  mark('§G 母集団の identity');
  {
    const sigs = {};
    for (const sid of SCENS) {
      const sh = shapeByScen[sid];
      if (!sh || !sh.active) continue;
      sigs[sid] = sh.nodes.map(n => n.name + '|' + n.slots.join('+') + '|' + n.bossSlot).join('#');
    }
    const keys = Object.keys(sigs);
    check('(G1) 測れたシナリオが ' + SCENS.length + ' 本そろっている',
      keys.length === SCENS.length, '実測=' + keys.length + ' [' + keys.join(',') + ']');
    check('(G2) 内容が相互に異なる (同じグラフを使い回していない)',
      new Set(Object.values(sigs)).size === keys.length,
      '相異=' + new Set(Object.values(sigs)).size + ' / ' + keys.length);
  }

  // ── 例外 ────────────────────────────────────────────────────────────────
  mark('例外・console.error');
  check('(E1) ページ例外 / console.error が 0 件', errsAll.length === 0,
    errsAll.slice(0, 6).join(' | '));

  await browser.close();
  for (const s of servers) s.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n══ 結果: ' + pass + '/' + results.length + ' PASS ══');
  if (pass !== results.length) {
    console.log('FAILED:');
    for (const r of results) if (!r.ok) console.log('  - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL ' + e.stack); process.exit(9); });
