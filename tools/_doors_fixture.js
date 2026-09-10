/*
 * _doors_fixture.js — ★[#65] 扉ドライバ 3 本 (doors_p2 / p5 / p8) が共有する「合成ノード」の器
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠⚠⚠ なぜ要るか。扉は rebuildNodeDoors が **ノードの出口 1 本につき 1 枚**しか立てない。
 *   畳み系のチケット (#16 森 / #62 沼 / #63 砦 / これから来る F3 神殿 / F4 竜の巣) が
 *   舞台のノードを減らすたび、「扉が 2 枚以上ある舞台」が本番から消えていく。
 *   実測 (2026-09-10): 廃坑 1 / 森 0 / 沼 2 / 砦 1 / 神殿 3 / 竜の巣 3 枚。
 *   ⇒ #63 は「畳む前の構成へ戻す退避の腕」の上に測定台を建てて緑に戻したが、
 *     F3 / F4 を畳むと同じことが起き、しかも**今度は逃げ場が無い**。
 *   ⇒ **測る母集団はその場で作る**。それがこのファイル。
 *
 * ⛔⛔ **自作マップ (MAPDEF.doors) で扉 6 枚を持たせる案は駄目。**
 *   rebuildNodeDoors (index.html:34980) は MAPDEF.doors があると**早期 return** し、
 *   施錠の抽選 doorLockedByRng (:35049) はその return より**下**にしか無い。
 *   ⇒ 自作マップの扉は抽選を 1 度も引かない = doors_p5 が測りたいものを 1 つも測れない。
 * ⭐ 正しい fixture は「**出口を持つノード**」。RUN.byId へ足すと、実在ノードと
 *   1 バイトも違わない経路 (byDir → nodeGateTile → doorHiddenByRng → doorLockedByRng) を通る。
 *   ⚠ RUN は const (index.html:4687) なので差し替え不可。byId への**追加**だけで足りる。
 *
 * ── 2 つの器 ───────────────────────────────────────────────────────────────────
 *   (1) nodes  … RUN.byId へ合成ノード 4 つ (fx0..fx3) を足す。**mapDef.id が別々**なので
 *                施錠の抽選 (seed = mapDef.id + "/lock/" + doorId) が割れる。
 *                ⇒ 「グラフ全体の扉」を数える母集団 (doors_p5 §1 / §2c) はこれで足りる。
 *   (2) attach … 実在ノードへ合成の出口を 1 本ずつ足す。⇒ **今居るノードの扉が 2 枚以上**になり、
 *                本編と同じ入口 (commitExit / enterNode) を通す節 (doors_p2 §5 / doors_p8 §1) が
 *                「選んだ扉だけが開く」「保存はノードごと」を実際に測れるようになる。
 *                ⚠ (1) だけでは足りない: g.pick / g.enter は**実在ノードの exits** を読むので、
 *                  rebuildNodeDoors('fx0') で盤面へ載せた扉は往復 (enterNode) で消えてしまう。
 *
 * ⚠ 合成の行き先 (fx0_left / fx65exit/n4 など) は RUN.byId に**存在しなくてよい**。
 *   doorHideableExit (:34959) は RUN.byId[ex.to] が undefined なら false を返すので、
 *   合成ノードに隠し扉は立たない (どのドライバも ?secret=0 で起動しているので二重に安全)。
 * ⚠ exitsWithReturn (:35686) は ex.at を **配列 [tx, ty]** として読む。合成の出口にも
 *   必ず at を持たせること (無いと o.at.tx で例外)。
 * ⚠ 扉のタイルは nodeGateTile(MAPDEF, dir) = **今の盤面**の幾何から付く。合成ノードの扉も
 *   実在ノードとまったく同じ規則で座標が決まる (だから (1b) の契約検査に素通しで乗る)。
 *
 * ── frameDoors (視野合わせ) ────────────────────────────────────────────────────
 * ⚠⚠⚠ drawDoors (index.html:9263) は**画面外の扉を捨てる**。畳んだ舞台の卓上大部屋は
 *   30x20 マス = 2880x1920px あり、左右のゲートは 29 タイル (2784px) 離れている。
 *   既定の 1280x800 では片方が必ず画面外に落ち、画素 (§2) と rotate 数 (§3) が**偽の赤**になる
 *   (2026-09-10 実測: per["gate-right"]=0 / rotates=1 vs doors=2)。
 *   ⇒ 測る前に「扉が全部入る視野」へ広げ、カメラを扉の外接矩形の中心へ置く。
 *   ⭐ ズーム (camZ) を下げて畳み込む案は**採らない**。扉の絵が縮んで塗り面積が
 *     (2b) の 400px / (2f) の 100px を割り、閾値を下げる羽目になる (= 依頼書 §6-4 の禁止事項)。
 *   ⭐ 広げた後は必ず onScreen を返す = 「全部の扉が画面内にある」を装置 assert で見張れる。
 */
'use strict';

/* 合成ノードの id と、施錠の抽選を割る mapDef.id の接頭辞。
 * ⚠ 4 ノード x 2 出口 = 扉 8 枚。2026-09-10 実測でこの組み合わせは
 *   locked 2 枚 / closed 6 枚 = 「1 枚以上あり全部ではない」を満たす。 */
const FX_NODE_IDS = ['fx0', 'fx1', 'fx2', 'fx3'];
const FX_MAP_PREFIX = 'fixture65/';
const FX_DIRS = ['left', 'right'];
/* 実在ノードへ足す合成の出口の行き先。⚠ RUN.byId に**存在しない** id であること
 *   (存在すると doorHideableExit が「行き止まり」と見なして隠し扉の候補にしうる)。 */
const FX_EXIT_PREFIX = 'fx65exit/';
/* ノエルの条件 (実在ノードと同じ mapDef.id を持つ合成ノード) の一時 id。 */
const FX_SAME_ID = 'fxsame';

// ══════════════════════════════════════════════════════════════════════════════
// ページ側で走る本体 (puppeteer が関数のソースを送るので、外の変数を掴めない
//   = 定数はすべて引数 cfg で渡すこと)
// ══════════════════════════════════════════════════════════════════════════════
const PAGE_INSTALL = function (cfg) {
  const out = { ok: false, why: '', nodes: [], attached: [], doors: 0, fxDoors: 0 };
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.graph) {
    out.why = 'RUN が無い (?graph=0 か DFMapDef 未読込)'; return out;
  }
  const at = function (dir) { const g = nodeGateTile(MAPDEF, dir); return [g.tx, g.ty]; };
  if (cfg.nodes) {
    for (let i = 0; i < cfg.nodeIds.length; i++) {
      const id = cfg.nodeIds[i];
      RUN.byId[id] = {
        id: id, kind: 'search',
        mapDef: { id: cfg.prefix + id },        // ★施錠 seed を割るのはこの id (index.html:34932)
        exits: cfg.dirs.map(function (d) { return { dir: d, to: id + '_' + d, at: at(d) }; }),
      };
      /* ★親を持たせる = nodeExitDirs (:34863) の「引き返し口」分岐の受け皿。
       *   これが無いと doors_p2 の変異 usedirsvia が合成ノードで空振りする。 */
      RUN.parent[id] = RUN.graph.entry;
      out.nodes.push(id);
    }
  }
  if (cfg.attach) {
    const ORDER = ['left', 'right', 'up', 'down'];
    const ids = Object.keys(RUN.byId);
    for (let j = 0; j < ids.length; j++) {
      const nid = ids[j];
      if (cfg.nodeIds.indexOf(nid) >= 0) continue;      // 合成ノードには足さない
      const nd = RUN.byId[nid];
      if (!nd || !Array.isArray(nd.exits)) continue;
      const used = nd.exits.map(function (e) { return e && e.dir; });
      let dir = null;
      for (let k = 0; k < ORDER.length; k++) if (used.indexOf(ORDER[k]) < 0) { dir = ORDER[k]; break; }
      if (!dir) continue;                                // 4 方向すべて埋まっている = 足せない
      /* ⚠ 末尾へ push する。exitsWithReturn は node.exits の順で fresh を積むので、
       *   先頭へ入れると「未踏の出口の 1 本目」が合成へすり替わる。 */
      nd.exits.push({ dir: dir, to: cfg.exitPrefix + nid, at: at(dir) });
      out.attached.push(nid + '/' + dir);
    }
  }
  if (cfg.nodes) {
    for (let m = 0; m < cfg.nodeIds.length; m++) {
      rebuildNodeDoors(cfg.nodeIds[m]);
      out.fxDoors += doorsForRender().length;
    }
  }
  rebuildNodeDoors(currentNodeId);          // ★盤面を現在ノードへ戻す (測定器が盤面を汚さない)
  out.doors = doorsForRender().length;
  out.ok = true;
  return out;
};

/* ★ノエルの条件 — 「合成ノードが実在ノードと別の経路を通っていない」ことの証明。
 * 実在ノードと**同じ mapDef.id・同じ出口の向き**を持つ合成ノードを立て、出てくる扉の
 * id / state / タイル / 板の向きが 1 文字も違わないことを見る。違えば合成は別物。
 * ⚠ 呼ぶのは**扉を 1 枚も開けていない段階**で。開けた扉は nodeState[実在ノード] に
 *   保存され applySavedDoorStates が当て直すので、合成側と食い違って当然になる。 */
const PAGE_NOEL = function (cfg) {
  const out = { ok: false, why: '', real: '', fx: '', realId: null, mapId: null, dirs: [] };
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId) { out.why = 'RUN が無い'; return out; }
  const realId = currentNodeId, rn = RUN.byId[realId];
  if (!rn) { out.why = '現在ノードが RUN.byId に無い'; return out; }
  const dirs = [];
  (rn.exits || []).forEach(function (e) { if (e && e.dir && dirs.indexOf(e.dir) < 0) dirs.push(e.dir); });
  const at = function (dir) { const g = nodeGateTile(MAPDEF, dir); return [g.tx, g.ty]; };
  RUN.byId[cfg.id] = {
    id: cfg.id, kind: rn.kind,
    mapDef: { id: (rn.mapDef || {}).id },              // ★ここが同じなら抽選は同じ答えを返すはず
    exits: dirs.map(function (d) { return { dir: d, to: cfg.id + '_' + d, at: at(d) }; }),
  };
  const sig = function (id) {
    rebuildNodeDoors(id);
    return doorsForRender().map(function (d) {
      return d.id + ':' + d.state + '@' + d.tx + ',' + d.ty + ':' + d.orientation;
    }).sort().join(' ');
  };
  out.real = sig(realId);
  out.fx = sig(cfg.id);
  delete RUN.byId[cfg.id];
  rebuildNodeDoors(realId);
  out.realId = realId; out.mapId = (rn.mapDef || {}).id; out.dirs = dirs;
  out.ok = true;
  return out;
};

/* 扉の外接矩形 (世界 px)。視野をどこまで広げればよいかの出所。 */
const PAGE_NEED = function () {
  const ds = doorsForRender();
  if (!ds.length) return null;
  const T = 96;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of ds) {
    x0 = Math.min(x0, d.tx * T); x1 = Math.max(x1, d.tx * T + T);
    y0 = Math.min(y0, d.ty * T); y1 = Math.max(y1, d.ty * T + T);
  }
  return { w: x1 - x0, h: y1 - y0, camZ: camZ, n: ds.length };
};

/* カメラを扉の外接矩形の中心へ置き、画面内に入った扉の id を返す。
 * ⚠ camX / camY は index.html の top-level let (:4375)。classic script の
 *   グローバル字句環境にあるので page.evaluate から代入できる (2026-09-10 実測)。
 * ⚠ 呼び出しは同期 1 本の evaluate に閉じること。await を挟むとゲームの tick が
 *   cameraFollowTick で camX を主人公へ戻してしまう。 */
const PAGE_FRAME = function () {
  const ds = doorsForRender();
  const T = 96;
  if (!ds.length) return { ok: false, why: '扉が 0 枚', onScreen: [], doors: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of ds) {
    x0 = Math.min(x0, d.tx * T); x1 = Math.max(x1, d.tx * T + T);
    y0 = Math.min(y0, d.ty * T); y1 = Math.max(y1, d.ty * T + T);
  }
  camX = Math.round((x0 + x1) / 2 - viewPxW() / 2);
  camY = Math.round((y0 + y1) / 2 - viewPxH() / 2);
  renderMap();
  const onScreen = ds.filter(function (d) {
    const sx = Math.round(d.tx * T - camX), sy = Math.round(d.ty * T - camY);
    return !(sx + T < 0 || sx > viewPxW() || sy + T < 0 || sy > viewPxH());
  }).map(function (d) { return d.id; });
  return { ok: true, why: '', onScreen: onScreen, doors: ds.length,
           camX: camX, camY: camY, camZ: camZ,
           vw: viewPxW(), vh: viewPxH(), cw: mapCanvas.width, ch: mapCanvas.height };
};

// ══════════════════════════════════════════════════════════════════════════════
// node 側の入口
// ══════════════════════════════════════════════════════════════════════════════
function config(opts) {
  const o = opts || {};
  return {
    nodeIds: FX_NODE_IDS, prefix: FX_MAP_PREFIX, dirs: FX_DIRS, exitPrefix: FX_EXIT_PREFIX,
    nodes: o.nodes !== false,      // 既定 = 合成ノードを立てる
    attach: !!o.attach,            // 既定 = 実在ノードへは足さない
  };
}

/* 合成ノード (と必要なら合成の出口) を入れる。戻り値:
 *   { ok, why, nodes:[id...], attached:['n4/left'...], doors:<現在ノードの扉数>, fxDoors:<合成の扉数> } */
async function install(page, opts) { return page.evaluate(PAGE_INSTALL, config(opts)); }

/* ノエルの条件を測る。戻り値: { ok, why, real, fx, realId, mapId, dirs } */
async function noel(page) { return page.evaluate(PAGE_NOEL, { id: FX_SAME_ID }); }

/* 扉が全部入るまで視野を広げ、カメラを扉へ寄せる。戻り値は PAGE_FRAME のもの。
 * ⚠ 上限 4000x2400 は「これ以上広げても意味が無い」ではなく**暴走止め**。
 *   足りなければ onScreen が欠けるので、呼び側の装置 assert が赤くなる。 */
async function frameDoors(page) {
  const need = await page.evaluate(PAGE_NEED);
  if (!need) return { ok: false, why: '扉が 0 枚', onScreen: [], doors: 0 };
  const vw = Math.min(4000, Math.max(1280, Math.ceil(need.w * need.camZ) + 240));
  const vh = Math.min(2400, Math.max(800, Math.ceil(need.h * need.camZ) + 240));
  await page.setViewport({ width: vw, height: vh });
  await new Promise(function (r) { setTimeout(r, 700); });   // resizeCanvas と再描画を待つ
  const r = await page.evaluate(PAGE_FRAME);
  r.want = { vw: vw, vh: vh, need: need };
  return r;
}

module.exports = {
  FX_NODE_IDS: FX_NODE_IDS, FX_MAP_PREFIX: FX_MAP_PREFIX, FX_DIRS: FX_DIRS,
  FX_EXIT_PREFIX: FX_EXIT_PREFIX, FX_SAME_ID: FX_SAME_ID,
  install: install, noel: noel, frameDoors: frameDoors,
};
