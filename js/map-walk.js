/*
 * js/map-walk.js — 格子の地図を主人公が歩く **部品** v1 (`window.MAP_WALK`)
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-10-21_plaza-undercity-map.md` (#98) §4-1。
 * 今のところ使うのは闇市の地下街 (tavern.html の #plazaViewport) だけ。
 *   ★[#100] 地下街を歩く住人 (opts.crowd・配置は js/npc-crowd.js の NPC_CROWD.PLAZA) もこの部品が描く。
 *   ⛔ 港町・酒場の住人 (town.html / tavern.html の initNpcCrowd) はこの部品を使わない (別チケット)。
 *
 * ★ 写経元 = tavern.html の酒場の店内の歩き (initTavernMap の placeHero / layout /
 *   applyCamera / walkPath / walkTo / tileFromClient / makeSign)。
 *   ⛔ 式と数を 1 つも変えない (港町・酒場と同じ速さ・同じ大きさで歩かせるため):
 *     ・足元をタイル中心に置く 2 行 (left = cx - SPRITE/2 / top = cy - SPRITE*FOOT)
 *     ・SPRITE = 96 / FOOT = 0.93 / SHEET_ROW_RIGHT = 3
 *     ・MS_PER_TILE = 340 とコマ送りの除数 190 (170:95 を維持)
 *     ・compact 判定の 3 条件と倍率の規則 (1 マス 34〜96px)
 *     ・歩けないタイルを押したら動かない (隣へ寄せる救済を入れない)
 *   ⛔ 酒場の店内 (initTavernMap) はこの部品を使わない = 1 バイトも変えない (ユーザー決定)。
 *     付け替えは別チケット。
 *   ⛔ この部品を tavern.html の中へ写さない。写すと tools の変異アンカーが
 *     「ファイルに 2 回」になり、該当ドライバが起動時に exit 3 で止まる。
 *   ⚠ 変数名に TM (港町) / TVM (酒場) を使わない。同名にした過去に
 *     verify_town_map の変異 snapnear が 2 ファイルへヒットした (tavern.html の注記)。
 *
 * ★ 共有モジュール / クラシックスクリプト (ES module ではない)
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      公開物は末尾で **明示的に window へ代入**している (js/tavern-map.js と同じ作法)。
 *
 * ★ DOM は全部この部品が生やす (静的 DOM を増やさない = verify_tavern_map (6c))
 *   viewport > .mwStage > img.mwMapImg / .mwGoal / .mwNpcLayer (> .mwNpcShadow + .mwNpc) /
 *                         .mwHeroShadow / .mwHero / .mwLight / .mwSign* / .mwNpcBubble (最大 1 枚)
 *   重なりの順 (z-index): 絵 0 < 行き先 1 < 影 2 < 住人 3 = 主人公 3 < 暗幕 5 < 札 6 < 吹き出し 7。
 *   ⭐ 札は暗幕より上 = 灯りの外でも見えて押せる。
 *   ⭐ 住人は主人公と同じ z 3 で DOM が前 = 主人公が手前。暗幕の下 = 灯りの外では暗く沈む。
 *   ⭐ 吹き出しは pointer-events: none = elementFromPoint を素通りする (札の判定を濁さない)。
 *   ⚠ opts.crowd が null / 空なら .mwNpcLayer ごと作らない (撤退 = #98 と同じ DOM)。
 *   ⚠ 位置・重なり・当たり判定に効く値は**インライン style** で入れる
 *     (CSS が読み込めなくても壊れない)。見た目 (札の紙・文字) は呼び出し側の CSS (.mwSign)。
 *
 * ★ 灯り (.mwLight) — 「CSS 1 枚・ぼかし無し」(会議の決定)
 *   舞台の 2 倍の大きさの div に radial-gradient を 1 回だけ書き、主人公の足元が中心に来るよう
 *   transform: translate() だけを毎フレーム動かす。⭐ background は書き換えない (再描画を避ける)。
 *   ⛔ canvas を作らない / filter / backdrop-filter / mix-blend-mode を使わない。
 *   ⛔ pointer-events は none (暗幕が地図のクリックを食わない)。
 *
 * 使い方:
 *   var w = MAP_WALK.create({
 *     map: PLAZA_MAP,                    // { COLS, ROWS, TILE, inBounds, isWalkable, findPath }
 *     viewport: el,                      // この中に舞台を生やす (#plazaViewport)
 *     image: "assets/plaza_undercity.jpg",
 *     heroSheet: "assets/warrior_walk.png",
 *     spawn: { c: 2, r: 2 },
 *     light: { inner: 192, outer: 384, alpha: 0.72 },   // null で灯り無し
 *     insets: function () { return { top: 0, bottom: 0 }; },  // 帯を引いた可視域
 *     signPrefix: "plazaSign_",          // 札の id の頭 (既定 "plazaSign_")
 *     clickToWalk: true,                 // 地図の空きタイルを押したらそこへ歩く (既定 true)
 *     crowd: NPC_CROWD.PLAZA             // ★[#100] 歩く住人 ({ key, kind:"stroll", from, to, sprite, say })。null / 空で無し
 *   });
 *   // 住人: w.crowdPause() (rAF を止めて吹き出しを消す) / w.crowdResume() / w.crowdUnits() (読み取りのみ)
 *   // 隠れている間に create したら、見えるようにした**後で**必ず w.layout() を呼ぶ。
 */
(function (global) {
  "use strict";

  var SPRITE = 96;                            /* 歩行シートのセル (<class>_walk.png は 576x384) */
  var FOOT   = 0.93;                          /* ★接地比 (index.html の他アセットと同じ実測値) */
  var SHEET_ROW_RIGHT = 3;                    /* ★右向きの行 (index.html updateKnightSprite と同じ) */
  var MS_PER_TILE = 340;                      /* ★港町・酒場と同じ速さ */
  var FRAME_DIV = 190;                        /* ⚠ MS_PER_TILE と同率 (170:95 を維持) */

  /* ══ compact 判定 — tavern.html (#changelogBox の折りたたみ判定) と **同じ 3 条件** ══ */
  function isCompact() {
    try {
      return window.matchMedia('(max-width: 560px)').matches
          || window.matchMedia('(max-height: 480px)').matches
          || window.matchMedia('(hover: none)').matches;
    } catch (e) { return false; }
  }

  function create(opts) {
    opts = opts || {};
    var map = opts.map, elViewport = opts.viewport;
    if (!map || !elViewport) throw new Error("MAP_WALK.create: map と viewport が要る");

    var TILE  = map.TILE;
    var MAP_W = map.COLS * TILE, MAP_H = map.ROWS * TILE;
    var signPrefix = (opts.signPrefix != null) ? String(opts.signPrefix) : "plazaSign_";
    var insetsFn = (typeof opts.insets === "function") ? opts.insets : function () { return { top: 0, bottom: 0 }; };

    /* ══ DOM ══════════════════════════════════════════════════════════════════ */
    function mk(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
    var elStage = mk("div", "mwStage");
    elStage.style.position = "absolute";
    elStage.style.left = "0px"; elStage.style.top = "0px";
    elStage.style.width  = MAP_W + "px";
    elStage.style.height = MAP_H + "px";
    elStage.style.transformOrigin = "0 0";
    elStage.style.setProperty("--mw-tile", TILE + "px");

    var elImg = mk("img", "mwMapImg");
    elImg.alt = "";
    elImg.draggable = false;
    elImg.src = opts.image || "";
    elImg.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none;z-index:0;";

    var elGoal = mk("div", "mwGoal");
    elGoal.style.cssText = "position:absolute;width:" + TILE + "px;height:" + TILE + "px;" +
      "transform:translate(-50%,-50%);pointer-events:none;opacity:0;z-index:1;";

    var elShadow = mk("div", "mwHeroShadow");
    elShadow.style.cssText = "position:absolute;width:44px;height:16px;margin-left:-22px;margin-top:-8px;" +
      "border-radius:50%;background:radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%);" +
      "pointer-events:none;z-index:2;";

    var elHero = mk("div", "mwHero");
    elHero.style.position = "absolute";
    elHero.style.width  = SPRITE + "px";
    elHero.style.height = SPRITE + "px";
    elHero.style.backgroundRepeat = "no-repeat";
    elHero.style.backgroundSize = (SPRITE * 6) + "px " + (SPRITE * 4) + "px";
    elHero.style.transformOrigin = "50% 100%";
    elHero.style.pointerEvents = "none";
    elHero.style.zIndex = "3";
    if (opts.heroSheet) elHero.style.backgroundImage = 'url("' + opts.heroSheet + '")';

    var light = opts.light || null;
    var elLight = null;
    if (light) {
      elLight = mk("div", "mwLight");
      elLight.style.position = "absolute";
      elLight.style.left = "0px"; elLight.style.top = "0px";
      elLight.style.width  = (2 * MAP_W) + "px";
      elLight.style.height = (2 * MAP_H) + "px";
      /* ⭐ background は**ここで 1 回だけ**書く。以後は transform しか動かさない。 */
      elLight.style.background = "radial-gradient(circle at center, transparent " + light.inner + "px, " +
        "rgba(8,4,16," + light.alpha + ") " + light.outer + "px)";
      elLight.style.pointerEvents = "none";
      elLight.style.zIndex = "5";
    }

    elStage.appendChild(elImg);
    elStage.appendChild(elGoal);
    elStage.appendChild(elShadow);
    elStage.appendChild(elHero);
    if (elLight) elStage.appendChild(elLight);
    elViewport.appendChild(elStage);

    /* ══ 主人公 ═══════════════════════════════════════════════════════════════ */
    var hero = { c: (opts.spawn && opts.spawn.c) || 0, r: (opts.spawn && opts.spawn.r) || 0 };
    var facingLeft = false;
    var frame = 0, moving = false;

    function placeHero(cx, cy) {
      /* ⭐ 足元をタイル中心に置く (写経元 tavern.html placeHero の 2 行そのまま)。
         ⚠ 位置の出所を 2 つ持たない。 */
      elHero.style.left = (cx - SPRITE / 2) + "px";
      elHero.style.top  = (cy - SPRITE * FOOT) + "px";
      elHero.style.transform = facingLeft ? "scaleX(-1)" : "none";
      elHero.style.backgroundPosition = (-frame * SPRITE) + "px " + (-SHEET_ROW_RIGHT * SPRITE) + "px";
      elShadow.style.left = cx + "px";
      elShadow.style.top  = cy + "px";
      /* 灯り: 舞台の 2 倍の板の中心 (MAP_W, MAP_H) を足元 (cx, cy) へ重ねる */
      if (elLight) elLight.style.transform = "translate(" + (cx - MAP_W) + "px," + (cy - MAP_H) + "px)";
    }
    function tileCenter(c, r) { return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }; }

    var heroPx = tileCenter(hero.c, hero.r);
    placeHero(heroPx.x, heroPx.y);

    /* ══ カメラ ═══════════════════════════════════════════════════════════════
       デスクトップ (横長): 地図全体が帯を除いた領域へ入る倍率で固定。
       compact: 可視域を満たす倍率にして主人公を追う (全体を入れると 1 マスが小さすぎる)。 */
    var zoom = 1, camX = 0, camY = 0;
    function insets() {
      var ins = null;
      try { ins = insetsFn(); } catch (e) { ins = null; }
      return { top: (ins && ins.top) || 0, bottom: (ins && ins.bottom) || 0 };
    }
    function layout() {
      /* ⭐ 隠れている間 (display:none の親) は寸法が 0。ここで倍率を決めると 0 に潰れる
         ⇒ 何もしない。見えるようにした**後で**呼び手が必ず layout() を呼ぶこと。 */
      if (!elViewport.clientWidth) return;
      var compact = isCompact();
      var vw = elViewport.clientWidth, vh = elViewport.clientHeight;
      var ins = insets();
      var avail = Math.max(120, vh - ins.top - ins.bottom);
      if (compact) {
        /* ⭐ compact は「全体を入れる」ではなく **可視域を満たす** 倍率 (港町・酒場と同じ規則)。
           ⚠ 下限 34px/マス・上限 1 マス 96px。 */
        zoom = Math.min(96 / TILE, Math.max(vw / MAP_W, avail / MAP_H, 34 / TILE));
      } else {
        zoom = Math.min(vw / MAP_W, avail / MAP_H);
      }
      applyCamera();
    }
    function applyCamera() {
      var vw = elViewport.clientWidth, vh = elViewport.clientHeight;
      if (!vw) return;
      var ins = insets();
      var viewTop = ins.top, viewH = Math.max(120, vh - ins.top - ins.bottom);
      var sw = MAP_W * zoom, sh = MAP_H * zoom;
      if (sw <= vw) camX = (vw - sw) / 2;
      else camX = Math.max(vw - sw, Math.min(0, vw / 2 - heroPx.x * zoom));
      if (sh <= viewH) camY = viewTop + (viewH - sh) / 2;
      else camY = Math.max(viewTop + viewH - sh, Math.min(viewTop, viewTop + viewH / 2 - heroPx.y * zoom));
      elStage.style.transform = "translate(" + camX + "px," + camY + "px) scale(" + zoom + ")";
    }
    function onResize() { layout(); }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    /* ══ 移動 ═════════════════════════════════════════════════════════════════
       ⭐ 歩きはタイル 1 マスずつの補間。経路は map.findPath (4 近傍) が出したものだけ。
       ⛔ クリック地点への直線移動は却下 (露店や木箱をすり抜けてしまう)。 */
    var walkTimer = null, pendingArrive = null;
    var walkingTo = null;

    function stopWalk() {
      if (walkTimer) { cancelAnimationFrame(walkTimer); walkTimer = null; }
      moving = false; frame = 0;
      placeHero(heroPx.x, heroPx.y);
    }

    function walkPath(path, onArrive) {
      stopWalk();
      pendingArrive = onArrive || null;
      if (!path || !path.length) {
        if (pendingArrive) { var f0 = pendingArrive; pendingArrive = null; f0(); }
        return;
      }
      var idx = 0;
      var from = { x: heroPx.x, y: heroPx.y };
      var to = tileCenter(path[0].c, path[0].r);
      var t0 = performance.now();
      moving = true;
      if (to.x !== from.x) facingLeft = (to.x < from.x);
      function step(now) {
        var t = Math.min(1, (now - t0) / MS_PER_TILE);
        heroPx.x = from.x + (to.x - from.x) * t;
        heroPx.y = from.y + (to.y - from.y) * t;
        frame = Math.floor((now - t0) / FRAME_DIV + idx * 2) % 6;   /* ⚠ MS_PER_TILE と同率 (170:95 を維持) */
        placeHero(heroPx.x, heroPx.y);
        applyCamera();
        if (t >= 1) {
          hero = { c: path[idx].c, r: path[idx].r };
          idx++;
          if (idx >= path.length) {
            stopWalk();
            elGoal.style.opacity = "0";
            if (pendingArrive) { var fn = pendingArrive; pendingArrive = null; fn(); }
            return;
          }
          from = { x: heroPx.x, y: heroPx.y };
          to = tileCenter(path[idx].c, path[idx].r);
          if (to.x !== from.x) facingLeft = (to.x < from.x);
          t0 = now;
        }
        walkTimer = requestAnimationFrame(step);
      }
      walkTimer = requestAnimationFrame(step);
    }

    /* walkTo(c, r, onArrive, key)
     *   ⛔ 歩けないタイル / 届かないタイルなら **動かない** (false を返す)。隣へ寄せる救済を入れない。
     *   ⭐⭐⭐ 罠 A (tavern.html goToTable の注記): 同じ行き先 (key) への再クリックは**黙って吸収**する。
     *     walkPath() は先頭で stopWalk() して t0 を打ち直すので、吸収しないと連打のたびに
     *     現在タイルの補間がやり直しになり、間隔しだいで永久に着かない。
     *   ⚠⚠ 下の 1 行 (walkingTo === k) は **1 行に閉じたまま**にすること (変異 reclick のアンカー)。
     *   ⚠ key を渡さない呼び (地図の空きタイル) は吸収しない (key のある歩きを上書きする)。
     *   ⚠ もう行き先に立っているなら、歩かずに onArrive を呼ぶ。 */
    function walkTo(c, r, onArrive, key) {
      var k = (key == null) ? null : String(key);
      if (k !== null && walkingTo === k) return true;
      if (!map.isWalkable(c, r)) return false;
      var path = map.findPath(hero.c, hero.r, c, r);
      if (path === null) return false;
      /* 前のタイルから次のタイルへ移る途中で「いま最後に着いたタイル」を押されたとき、
         半端な位置に止まらないよう、そのタイルの中心まで 1 歩戻す。 */
      if (!path.length) {
        var hc = tileCenter(hero.c, hero.r);
        if (heroPx.x !== hc.x || heroPx.y !== hc.y) path = [{ c: hero.c, r: hero.r }];
      }
      walkingTo = k;
      var p = tileCenter(c, r);
      elGoal.style.left = p.x + "px"; elGoal.style.top = p.y + "px";
      elGoal.style.opacity = path.length ? "1" : "0";
      walkPath(path, function () {
        walkingTo = null;
        if (onArrive) onArrive();
      });
      return true;
    }

    /* 歩きを止める (rAF を残さない)。⚠ 着いたときの onArrive は呼ばない。 */
    function stop() {
      pendingArrive = null;
      walkingTo = null;
      elGoal.style.opacity = "0";
      stopWalk();
      /* 補間の途中で止めたら、最後に着いたタイルの中心へ戻す (足元を常にタイル中心に) */
      heroPx = tileCenter(hero.c, hero.r);
      placeHero(heroPx.x, heroPx.y);
      applyCamera();
    }

    function placeAt(c, r) {
      stop();
      hero = { c: c, r: r };
      heroPx = tileCenter(c, r);
      facingLeft = false;
      placeHero(heroPx.x, heroPx.y);
      applyCamera();
    }

    /* ══ クリック ═════════════════════════════════════════════════════════════ */
    function tileFromClient(clientX, clientY) {
      var rect = elStage.getBoundingClientRect();
      var x = (clientX - rect.left) / zoom;
      var y = (clientY - rect.top) / zoom;
      return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
    }
    /* tileFromClient の逆。⚠ **同じ rect と同じ zoom** から導く (別式で書き直さない)。 */
    function clientFromTile(c, r) {
      var rect = elStage.getBoundingClientRect();
      return { x: rect.left + (c * TILE + TILE / 2) * zoom,
               y: rect.top  + (r * TILE + TILE / 2) * zoom };
    }
    if (opts.clickToWalk !== false) {
      elViewport.addEventListener("click", function (ev) {
        var t = tileFromClient(ev.clientX, ev.clientY);
        if (!map.inBounds(t.c, t.r)) return;
        walkTo(t.c, t.r, null, null);
      });
    }

    /* ══ 札 ═══════════════════════════════════════════════════════════════════
       酒場の makeSign と同じ形 (名前 + 1 行の説明・click で stopPropagation)。
       o = { key, name, desc, tile: [c, r], onClick, title, cls }
       ⚠ id = signPrefix + key / class = "mwSign" (+ o.cls)。
       ⛔ class を tavernSign にしない (酒場の CSS と受入の数え上げに混ざる)。
       ⭐ 中心をタイル中心に置くのは CSS の `translate` (個別プロパティ) で入れる。
         transform を使わないので、呼び出し側の :hover { transform: scale() } と合成できる。 */
    var signs = {};
    function addSign(o) {
      var s = document.createElement("div");
      s.className = "mwSign" + (o.cls ? " " + o.cls : "");
      s.id = signPrefix + o.key;
      s.title = o.title || o.name;
      s.setAttribute("data-key", o.key);
      var nm = document.createElement("span");
      nm.className = "mwSignName";
      nm.textContent = o.name;
      s.appendChild(nm);
      if (o.desc) {
        var ds = document.createElement("span");
        ds.className = "mwSignDesc";
        ds.textContent = o.desc;
        s.appendChild(ds);
      }
      var p = tileCenter(o.tile[0], o.tile[1]);
      s.style.position = "absolute";
      s.style.left = p.x + "px";
      s.style.top  = p.y + "px";
      s.style.translate = "-50% -50%";
      s.style.zIndex = "6";                   /* ⭐ 暗幕 (5) より上 = 灯りの外でも見えて押せる */
      s.style.whiteSpace = "nowrap";
      s.addEventListener("click", function (ev) {
        ev.stopPropagation();                 /* ⛔ 外すと viewport の click がタイル歩きを始める */
        if (o.onClick) o.onClick();
      });
      elStage.appendChild(s);
      signs[o.key] = s;
      return s;
    }

    /* ══ 住人 (★[#100] opts.crowd) ═══════════════════════════════════════════
       港町 #41 の住人のふるまいを、この部品の中で書き起こしたもの (⛔ tavern.html へ写さない =
       tools/verify_npc_crowd.js の変異アンカーが「ファイルに 2 回」になって exit 3)。
       ・class は .mwNpcLayer / .mwNpcShadow / .mwNpc[data-mw-npc] / .mwNpcBubble[data-mw-npc-say]。
         ⛔ .npcUnit / data-npc / .npcBubble を使わない (酒場の住人の数え上げに混ざる)。
       ・位置は主人公と同じ 2 行の式 (足元 = タイル中心)。速さ MS_PER_TILE・コマ送り FRAME_DIV。
       ・経路は from→to の直線のマスだけ (⛔ findPath を呼ばない = すり抜けは港町と同じく許容)。
       ・端点で向きを反転し 1.5〜3 秒止まる (mode "pause")。歩いている間は mode "walk"。
       ・rAF は 1 本。仮想時計は 1 フレーム最大 100ms (タブ復帰のワープ防止)。タブが隠れたら止める。
       ⛔ 主人公の stop() / placeAt() からここへ触らない (住人は主人公と独立に歩き続ける)。 */
    var crowdSrc = (opts.crowd && opts.crowd.length) ? opts.crowd : null;
    var folk = [];                              /* 住人ごとの状態 */
    var elFolkLayer = null;
    var folkRaf = null, folkPrevNow = null, folkClock = 0;
    var folkWanted = true;                      /* crowdPause() で false。visibilitychange の再開はこれを見る */
    var SAY_MS = 4000;
    var sayEl = null, sayOwner = null, sayTimer = null, sayW = 0, sayH = 0;

    function lineCells(n) {
      if (global.NPC_CROWD && typeof global.NPC_CROWD.cellsOf === "function") return global.NPC_CROWD.cellsOf(n);
      if (n.kind !== "stroll") return [n.tile];
      var a = n.from, b = n.to, cells = [], k;
      if (a[0] === b[0]) for (k = Math.min(a[1], b[1]); k <= Math.max(a[1], b[1]); k++) cells.push([a[0], k]);
      else               for (k = Math.min(a[0], b[0]); k <= Math.max(a[0], b[0]); k++) cells.push([k, a[1]]);
      return cells;
    }

    function sayHide() {
      if (sayTimer !== null) { clearTimeout(sayTimer); sayTimer = null; }
      if (sayEl && sayEl.parentNode) sayEl.parentNode.removeChild(sayEl);
      sayEl = null; sayOwner = null;
    }
    function sayFollow(p) {
      if (!sayEl || sayOwner !== p) return;
      /* 横 = 足元の中心 (translate -50%)。舞台の左右端では紙が切れないよう寄せる。 */
      var half = sayW / 2 + 4;
      var bx = Math.min(MAP_W - half, Math.max(half, p.x + p.dx));
      /* 縦 = 頭の上 (translate -100% なので top は紙の下端)。上端でも切れないよう寄せる。 */
      var by = Math.max(sayH + 4, p.y + p.dy - SPRITE * FOOT - 8);
      sayEl.style.left = bx + "px";
      sayEl.style.top  = by + "px";
    }
    function sayShow(p) {
      sayHide();                                /* 前の 1 枚を必ず先に消す = 舞台に常に 1 枚 */
      var text = (p && p.n && p.n.say != null) ? String(p.n.say) : "";
      if (!text) return;
      var el = mk("div", "mwNpcBubble");
      el.setAttribute("data-mw-npc-say", p.n.key);
      el.textContent = text;                    /* ⛔ innerHTML にしない (say は自由文のデータ) */
      el.style.position = "absolute";
      el.style.transform = "translate(-50%,-100%)";
      el.style.zIndex = "7";                    /* 札 (6) より上 = 灯りの外で押しても読める */
      el.style.pointerEvents = "none";          /* ⛔ 押せる紙にしない (札の elementFromPoint を濁さない) */
      elStage.appendChild(el);
      sayEl = el; sayOwner = p;
      sayW = el.offsetWidth; sayH = el.offsetHeight;   /* 出した時に 1 回だけ測る (毎フレーム読まない) */
      sayFollow(p);
      sayTimer = setTimeout(function () { if (sayEl === el) sayHide(); }, SAY_MS);
    }

    function folkDraw(p) {
      var fx = p.x + p.dx, fy = p.y + p.dy;
      p.el.style.left = (fx - SPRITE / 2) + "px";
      p.el.style.top  = (fy - SPRITE * FOOT) + "px";
      p.el.style.transform = p.left ? "scaleX(-1)" : "none";
      p.el.style.backgroundPosition = (-SPRITE * p.frame) + "px " + (-SPRITE * SHEET_ROW_RIGHT) + "px";
      p.sh.style.left = fx + "px";
      p.sh.style.top  = fy + "px";
      if (sayOwner === p) sayFollow(p);
    }
    function folkTick(p, t) {
      var last = p.cells.length - 1;
      if (p.n.kind !== "stroll" || last < 1) {
        /* 立ち止まり (今の PLAZA には居ない)。hold のコマで静止。 */
        var c0 = tileCenter(p.cells[0][0], p.cells[0][1]);
        p.x = c0.x; p.y = c0.y; p.frame = p.hold; p.mode = "stand";
        folkDraw(p);
        return;
      }
      if (p.mode === "pause") {
        if (t >= p.until) { p.mode = "walk"; p.legT0 = t; p.animT0 = t; }
      } else if (t - p.legT0 >= MS_PER_TILE) {
        p.at += p.step;
        p.legT0 += MS_PER_TILE;
        if (p.at <= 0 || p.at >= last) {
          p.at = Math.max(0, Math.min(last, p.at));
          p.step = -p.step;
          p.left = !p.left;                     /* 端点で向きを反転して止まる */
          p.mode = "pause";
          p.until = t + p.restMs;
        }
      }
      var u = (p.mode === "walk") ? Math.max(0, Math.min(1, (t - p.legT0) / MS_PER_TILE)) : 0;
      var nx = Math.max(0, Math.min(last, p.at + p.step));
      var pa = tileCenter(p.cells[p.at][0], p.cells[p.at][1]);
      var pb = tileCenter(p.cells[nx][0], p.cells[nx][1]);
      p.x = pa.x + (pb.x - pa.x) * u;
      p.y = pa.y + (pb.y - pa.y) * u;
      p.frame = (p.mode === "walk") ? (Math.floor((t - p.animT0) / FRAME_DIV) % 6) : 0;   /* ⚠ MS_PER_TILE と同率 */
      folkDraw(p);
    }
    function folkLoop(now) {
      folkRaf = null;
      if (folkPrevNow === null) folkPrevNow = now;
      folkClock += Math.min(100, Math.max(0, now - folkPrevNow));   /* 仮想時計: 1 フレーム最大 100ms */
      folkPrevNow = now;
      for (var i = 0; i < folk.length; i++) folkTick(folk[i], folkClock);
      folkRaf = requestAnimationFrame(folkLoop);
    }
    function folkStart() {
      if (!folk.length || folkRaf !== null) return;
      if (document.visibilityState === "hidden") return;
      folkPrevNow = null;
      folkRaf = requestAnimationFrame(folkLoop);
    }
    function folkHalt() {
      if (folkRaf !== null) { cancelAnimationFrame(folkRaf); folkRaf = null; }
      folkPrevNow = null;
    }
    function crowdPause() { folkWanted = false; folkHalt(); sayHide(); }
    function crowdResume() { folkWanted = true; folkStart(); }

    if (crowdSrc) {
      elFolkLayer = mk("div", "mwNpcLayer");
      elFolkLayer.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
      /* ⭐ 主人公の影より前に挿す = 同じ z 3 でも主人公が手前 */
      elStage.insertBefore(elFolkLayer, elShadow);
      crowdSrc.forEach(function (n, i) {
        var cells = lineCells(n);
        if (!cells || !cells.length) return;
        var sh = mk("div", "mwNpcShadow");
        sh.style.cssText = "position:absolute;width:40px;height:14px;margin-left:-20px;margin-top:-7px;" +
          "border-radius:50%;background:radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%);" +
          "pointer-events:none;z-index:2;";
        var el = mk("div", "mwNpc");
        el.setAttribute("data-mw-npc", n.key);
        el.style.position = "absolute";
        el.style.width  = SPRITE + "px";
        el.style.height = SPRITE + "px";
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundSize = (SPRITE * 6) + "px " + (SPRITE * 4) + "px";
        el.style.backgroundImage = 'url("' + n.sprite + '")';
        el.style.transformOrigin = "50% 100%";
        el.style.zIndex = "3";
        el.style.pointerEvents = "auto";
        el.style.cursor = "pointer";
        elFolkLayer.appendChild(sh);
        elFolkLayer.appendChild(el);
        var p = {
          n: n, el: el, sh: sh, cells: cells,
          dx: n.dx || 0, dy: n.dy || 0,
          left: n.face === "left",
          hold: (((n.hold || 0) % 6) + 6) % 6, frame: 0,
          at: 0, step: 1, mode: "walk", legT0: 0, animT0: 0, until: 0,
          restMs: 1500 + (i * 613) % 1500,      /* 端点で 1.5〜3 秒 (住人ごとに固定でずらす) */
          x: 0, y: 0
        };
        folk.push(p);
        /* 押すと一言。伝播は止める (止めないと viewport の click が住人の下のタイルへ主人公を歩かせる)。
           ⛔ preventDefault はしない (スクロール / ズームを殺さない)。click と touchend の両方が来ても
           sayShow() が前を先に消すので紙は 1 枚のまま。 */
        var onPress = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          sayShow(p);
        };
        el.addEventListener("click", onPress);
        el.addEventListener("touchend", onPress);
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") folkHalt();
        else if (folkWanted) folkStart();
      });
      /* 最初の 1 枚は rAF を待たずに置く (左上に 1 フレーム取り残さない) */
      for (var fi = 0; fi < folk.length; fi++) folkTick(folk[fi], folkClock);
      folkStart();
    }

    /* ドライバ用の読み取り口 (⛔ 書き換え口は作らない)。c / r は足元のタイル。 */
    function crowdUnits() {
      return folk.map(function (p) {
        var fx = p.x + p.dx, fy = p.y + p.dy;
        return { key: p.n.key, c: Math.floor(fx / TILE), r: Math.floor(fy / TILE),
                 x: fx, y: fy, left: p.left, frame: p.frame, mode: p.mode };
      });
    }

    function geom() {
      return { tile: TILE, cols: map.COLS, rows: map.ROWS, mapW: MAP_W, mapH: MAP_H,
               sprite: SPRITE, foot: FOOT, msPerTile: MS_PER_TILE };
    }

    return {
      stage: elStage, hero: elHero, light: elLight, signs: signs,
      layout: layout,
      walkTo: walkTo,
      stop: stop,
      placeAt: placeAt,
      heroTile:  function () { return { c: hero.c, r: hero.r }; },
      heroPx:    function () { return { x: heroPx.x, y: heroPx.y }; },
      isMoving:  function () { return moving; },
      zoom:      function () { return zoom; },
      walkingTo: function () { return walkingTo; },
      compact:   isCompact,
      clientFromTile: clientFromTile,
      tileFromClient: tileFromClient,
      addSign: addSign,
      signKeys: function () { return Object.keys(signs); },
      /* 暗幕の中心の画面座標 (灯りが無ければ null) と、足元の画面座標 (clientFromTile と同じ rect と zoom から) */
      lightCenter: function () {
        if (!elLight) return null;
        var b = elLight.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      },
      footClient: function () {
        var rect = elStage.getBoundingClientRect();
        return { x: rect.left + heroPx.x * zoom, y: rect.top + heroPx.y * zoom };
      },
      geom: geom,
      /* ★[#100] 住人 (opts.crowd が無ければ crowdUnits() は [] / pause・resume は何もしない) */
      crowdPause: crowdPause,
      crowdResume: crowdResume,
      crowdUnits: crowdUnits
    };
  }

  global.MAP_WALK = {
    create: create,
    SPRITE: SPRITE, FOOT: FOOT, SHEET_ROW_RIGHT: SHEET_ROW_RIGHT,
    MS_PER_TILE: MS_PER_TILE, isCompact: isCompact
  };
})(typeof window !== "undefined" ? window : this);
