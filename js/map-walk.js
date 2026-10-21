/*
 * js/map-walk.js — 格子の地図を主人公が歩く **部品** v1 (`window.MAP_WALK`)
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-10-21_plaza-undercity-map.md` (#98) §4-1。
 * 今のところ使うのは闇市の地下街 (tavern.html の #plazaViewport) だけ。
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
 *   viewport > .mwStage > img.mwMapImg / .mwGoal / .mwHeroShadow / .mwHero / .mwLight / .mwSign*
 *   重なりの順 (z-index): 絵 0 < 行き先 1 < 影 2 < 主人公 3 < 暗幕 5 < 札 6。
 *   ⭐ 札は暗幕より上 = 灯りの外でも見えて押せる。
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
 *     clickToWalk: true                  // 地図の空きタイルを押したらそこへ歩く (既定 true)
 *   });
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
      geom: geom
    };
  }

  global.MAP_WALK = {
    create: create,
    SPRITE: SPRITE, FOOT: FOOT, SHEET_ROW_RIGHT: SHEET_ROW_RIGHT,
    MS_PER_TILE: MS_PER_TILE, isCompact: isCompact
  };
})(typeof window !== "undefined" ? window : this);
