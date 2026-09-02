# #40 ワールドマップを「刻んでタップして進む」へ — 1 タップ = 最大 5 マス

- **起草**: 2026-09-01(計画窓) / **ステータス**: ✅ **完了**(2026-09-02 実装窓 / dev-loop 4 項目)
  — commit `b42f904` + `b731644` + `64d3ceb` + (項目4 = 本コミット)。**push は未実施**。
  新 driver `verify_world_steps` **30/30 PASSED PENDING 0** / `--negative` **46/46・変異 12 本とも空振り 0** /
  既存 golden **4 本すべて非退行**(`verify_world_map` 57/57 / `verify_quest_walk` 25/25 /
  `verify_town_exit` 素 23/23 / `verify_title_screen` 86/86)。撤退 `?walkstep=0`。**実測は §12**
- **触るファイル**: `js/world-map.js` / `world.html` / `tools/verify_world_steps.js`(新規) /
  `tools/verify_world_map.js`(押し口のみ) / `tools/verify_quest_walk.js`(押し口のみ) /
  `実装依頼書/README.md`
- ⛔ **触らないファイル**: `index.html` / `tavern.html` / `audio.js` / `town.html` / `title.html` /
  `js/town-map.js` / `js/tavern-map.js`
  — ⚠⚠ **別窓が並走している**(起草直後の 2026-09-01 に検知)。相手は
  `実装依頼書/2026-09-01_town-tavern-npc-crowd.md`(銀の鹿亭・港町の NPC 群衆)を起草中で、
  触るのは `js/npc-crowd.js`(新規)/ `tavern.html` / `town.html` / `tools/verify_npc_crowd.js`。
  ⭐ **本チケットのファイルとは 1 つも重ならない**(相手の依頼書も `world.html` を「触らない」と宣言)。
  ⚠⚠⚠ **唯一ぶつかるのは `実装依頼書/README.md`。** 相手は #40 を仮置きしており、
  本チケットが先に README 行を取ったので **相手は #41 へ繰り下がる**。
  ⛔ `git add .` 禁止・**ファイル単位 add**・**commit の前に `git diff --cached <file>` を読む**
  (⚠ ファイル単位 add でも「相手が同じファイルを add する」事故は防げない)。
  ⚠ 相手が編集中のファイルを測るときは `git show HEAD:<path>` で見る(作業ツリーだと偽の赤が出る)。
  — なお `index.html` / `tavern.html` / `audio.js` は **changelog フックのトリガー**(§2-7)なので、
  本チケットでは 1 バイトも開かない。`HEAD = origin/main = bb32beb`。

---

## 1. 目的

ワールドマップ(`world.html`)は今、**行き先をタップすると経路の全部を一気に歩き切る**。
港町フラン → 地下神殿は **1 タップで 21.13 マス / 7.51 秒**、pier → temple は **22.55 マス / 8.02 秒**。
その間プレイヤーは見ているだけで、途中で止まることも行き先を変えることもできない。

これを「**1 タップ = 最大 5 マスぶんだけ進む**」へ改める。刻んだ停留所は将来、
ランダムイベントの発火地点になる(**今回はイベントを 1 件も実装しない。器だけ**)。

**ユーザー決定(2026-09-01)**:

- **刻みの上限 = 5 マス(320px)**。停留所は 14 → **15**(既存ノード 14 + 中間点 1)。
  - ⭐ 不採用: **3 マス上限**(停留所 22 / 中間点 8)。将来のイベント地点は厚くなるが
    港町 → ドラゴンの巣が 8 タップになり、手数が増えすぎると判断。
  - ⭐ 不採用: **4 マス上限**(停留所 17 / 中間点 3)。
  - ⚠ 後から上限だけ変えられるよう、**`STEP_MAX_PX` の 1 定数**で決めること(§4)。
- **中間の停留所は小さな印として地図に描き、それ自体もタップ対象にする**。
  - ⭐ 不採用: 印を出さない案。「なぜここで止まったか」が読めず、将来のイベント地点も予告できない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ⚠⚠⚠ 依頼の前提が 1 つ崩れている — 「点線上の間隔」は長くない

**依頼文は「次の目的地をタップする際の間隔が長すぎる」と書いているが、
エッジ(点線 1 本)の長さは実測で平均 3.18 マス・最長 6.40 マスしかない。**
つまり「5 マス刻みに分割する」だけでは **14 本中 1 本にしか中間点が生えない**。

実際に長いのは **1 タップの移動距離**(= 経路の全長)のほうだった。

| 見ているもの | 実測 | マス(64px) | 秒(PX_PER_MS 0.18) |
|---|---|---|---|
| エッジ 1 本(平均) | 203.3px | 3.18 | 1.13 |
| エッジ 1 本(最長 `lake_n-lakeside`) | 409.8px | 6.40 | 2.28 |
| エッジ 1 本(最短 `pier-phlan` / `phlan-cross_n`) | 90.5px | 1.41 | 0.50 |
| **1 タップの移動(最長 `pier`→`temple`)** | **1442.9px** | **22.55** | **8.02** |
| 1 タップの移動(`phlan`→`temple`) | 1352.4px | 21.13 | 7.51 |
| 1 タップの移動(`phlan`→`dragon`) | 1303.5px | 20.37 | 7.24 |

⭐⭐⭐ **だから本チケットの本体は「エッジを刻むこと」ではなく
「1 タップで歩ける距離に上限を掛けること」。** 刻み点の追加は、
その上限(5 マス)を **1 本だけあるはみ出しエッジ**に適用した副産物にすぎない。

**5 マス上限で生える中間点は ちょうど 1 個**:

| 元エッジ | 長さ | 分割 | 生える点 | 座標 |
|---|---|---|---|---|
| `lake_n`–`lakeside` | 409.8px = 6.40 マス | 2 | `lake_n__lakeside@1` | **(896, 416)** |

他 13 本は分割されない(= その区間は「1 タップ = 1 エッジ」になる)。

**計測コマンド**(再測定するとき):

    cd "c:/Users/PC_User/Desktop/ダンジョンファイターズ"
    PYTHONIOENCODING=utf-8:replace py - <<'PY'
    import math,re,io
    src=io.open('js/world-map.js',encoding='utf-8').read()
    N={m.group(1):(m.group(2),int(m.group(3)),int(m.group(4))) for m in
       re.finditer(r'(\w+):\s*\{\s*kind:\s*"(site|way)",\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)',src)}
    E=re.findall(r'\["(\w+)",\s*"(\w+)"\]',src)
    T=64; CAP=5*T
    for a,b in E:
        d=math.hypot(N[a][1]-N[b][1],N[a][2]-N[b][2]); k=max(1,int(math.ceil(d/CAP)))
        print("%-22s %7.1fpx %5.2f masu -> %d bunkatsu"%(a+"-"+b,d,d/T,k))
    PY

⚠ `py` を使うこと。**`python` は Windows Store のスタブで exit 49 になり、
何も実行されないのに「Python」とだけ出る**(2026-09-01 にこの窓が踏んだ)。

⚠ 「1 マス = 64px」は `js/world-map.js:16` のコメント(`assets/world_region.jpg` 1536x1024 =
24x16 マス)と `js/town-map.js:45` の `var TILE = 64` に一致する。⛔ ただし
**ワールドマップに実体としてのタイル格子は存在しない**(`js/world-map.js:15` の罠 C =
街道の描き幅が実測 ~10px しかないので通行マスクを作らない、という確定方針)。
本チケットも **格子を作らない**。64px は「刻みの長さを人間の言葉で言うための換算」だけに使う。

### 2-2. ⚠⚠⚠ 罠 A — `WORLD_MAP.NODES` / `EDGES` に刻み点を足すと、既存 golden が 4 本赤くなる

刻み点を素直に `NODES` へ足す実装は **絶対に採らないこと**。次の 4 本が同時に赤くなる:

| ドライバ:行 | assert | 何を縛っているか |
|---|---|---|
| `tools/verify_quest_walk.js:1511` | (5a) | `{nodesFP, edges, sites}` の **sha1 = `876c5f6336f96811`**(NODES 14 / EDGES 14 / SITES 6) |
| `tools/verify_world_map.js:1689` | (7f) | `nodeCount !== 14` なら「母集団が壊れている」で即赤 |
| `tools/verify_world_map.js:1264` | (2a) | SVG の `<line>` 本数 == `EDGES.length`(点線を刻むと本数が増えて赤) |
| `tools/verify_world_map.js:1318` | (3b) | 母集団 = `Object.keys(WORLD_MAP.NODES)`(件数が増えると押す先も増える) |

`nodesFP` の作り(`tools/verify_quest_walk.js:520`):

    nodesFP: Object.keys(WM.NODES).map(id => {
      const n = WM.NODES[id];
      return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—');
    }),

⭐⭐⭐ **`WORLD_MAP` へ「関数や定数を足す」ぶんにはハッシュは動かない**
(hash の材料は `nodesFP` / `edges` / `sites` の 3 つだけ)。
→ **決定: `NODES` / `EDGES` / `findPath` / `neighbors` は 1 バイトも触らず、
刻みは「EDGES から生成する派生レイヤ」として別の名前で足す。**

⭐ この罠は §8 の負のコントロール `nodemut` / `linemut` として装置に内蔵させる。

### 2-3. ⚠⚠ 罠 B — 点線 SVG は `pointer-events: none` なので、刻み点を SVG の子にすると押せない

`world.html:141-160`:

    #worldRoutes {
      position: absolute; left: 0; top: 0;
      overflow: visible;
      pointer-events: none;      /* ← ここ */
      z-index: 1;
    }
    .worldRouteLine {
      stroke: var(--route-ink);
      stroke-width: 6;
      stroke-linecap: round;
      stroke-dasharray: 1 17;    /* 丸い「点」が 18px おき = 点線 */
      fill: none;
    }

→ **決定: 刻み点マーカーは `.worldNode` と同じく HTML の `<div>` にする**(SVG に足さない)。
これで (2a) の `svg.querySelectorAll('line')` は 14 本のまま動かない。

⚠ さらに **点線の点は 18px おき**なので、刻み点の印は
「点線の点と紛れない大きさ・色」でなければ意味を成さない(§5 で寸法を指定)。

### 2-4. ⚠⚠ 罠 C — 刻み点マーカーに `.worldNode` クラスを着せると、既存の 3 本が誤爆する

- `tools/verify_world_map.js:736` … (3c) が `top.closest('.worldNode')` で
  「押した先がノードでないこと」を確かめている
- `tools/verify_world_map.js:1187` … 同じ式で札の被りを見ている
- `tools/verify_quest_walk.js:547` … 札の所有者を `sg.closest('.worldNode')` で引いている

→ **決定: 刻み点マーカーのクラスは `.worldStep`。`.worldNode` を絶対に着せない。**
`__world.nodeIds()`(= `Object.keys(nodeEls)`)にも入れない(`stepIds()` を別に足す)。

⭐ この罠は負のコントロール `stepclass` として内蔵させる。

### 2-5. 刻み点 (896,416) が既存 assert と当たらないことの実測

| 相手 | 距離 | 判定 |
|---|---|---|
| (3c) の空撃ち点① ワールド (64,544) | **841.8px** | 余裕 |
| (3c) の空撃ち点② ワールド (1440,960) | **769.3px** | 余裕 |
| 最寄りノード `mine` (1056,352) | **172.3px** | `.worldNode` は 44px 角なので当たらない |
| 他 13 ノード | 200px 超 | — |

⭐ 水率 (1a) は **エッジを 16px 刻みでサンプルしている**ので、
エッジ上に生える刻み点は既に検査済みの領域に入る(新たに水へ出ることはない)。

### 2-6. 既存 golden の今日の実測(**2026-09-01 にこの窓が実際に走らせた**)

| ドライバ | 実測 | この変更で | 対処 |
|---|---|---|---|
| `tools/verify_world_map.js` | **57/57 PENDING 0** | (3b)(7e) が赤くなる | §6-4 の押し口修正 |
| `tools/verify_quest_walk.js` | **25/25 PENDING 0** | (2d)(3a)(3b)(3c)(3d) が赤くなる | §6-4 の押し口修正 |
| `tools/verify_town_exit.js` | **23/23 PENDING 0** | **赤くならない**(押すのは足元の `phlan` = 同ノード即遷移) | 変更不要 |
| `tools/verify_title_screen.js` | **86/86** | **赤くならない**(`pier`→`phlan` = 90.5px < 320px = 1 タップで着く) | 変更不要 |

⚠ メモリの索引は `verify_title_screen` を 83/83 と記録しているが、**今日の実測は 86/86**。
別チケットが 3 本足していた。⭐ **基準値は必ず走らせて採り直すこと。**

**赤くなる理由**は全部同じ ——「ノードを **1 回** 実クリックして `heroNode() === id` を要求」しているから:

- `tools/verify_world_map.js:693` … `await page.mouse.click(...)` → `waitForFunction('!isMoving()')` → 1 回きり
- `tools/verify_quest_walk.js:802` … `async function clickNode(page, id, ...)` → 同上

`?walkstep=0` を URL に足す逃げ方は採らない — **本番の振る舞いを既存 golden が測らなくなる**ため。
代わりに「**着くまで押し直す(上限 12 回)**」へ直す。**期待値は 1 つも書き換えない。**

⚠ `verify_world_map.js` の (3d) は **赤くならない**(実測: 出発ノード = `pier`、
押すのは `phlan` = 90.5px = 1 タップで着く)。

#### ⚠⚠⚠ 訂正(2026-09-02 / 実装窓)— 「押し口は 2 箇所だけ」は **誤り。実測で 6 箇所**だった

起草時の grep は「`page.mouse.click(` の**直後に `heroNode()` の一致を待つ**形」しか数えていない。
実際に直す必要があったのは **6 箇所**:

| # | 場所 | 形 |
|---|---|---|
| ① | `tools/verify_world_map.js:693`(`measureWalk`) | `mouse.click` → `waitForFunction('!isMoving()')` |
| ② | `tools/verify_quest_walk.js:802`(`clickNode`) | 同上 |
| ③ | `tools/verify_quest_walk.js:950`(`measureWorldClicks`) | 同上 — **起草窓が見落とし** |
| ④⑤⑥ | `tools/verify_world_map.js` の `Promise.all([waitForNavigation, click])` **3 箇所** | `measureKeys` の (4b) / 同 (3d) / `measureResultChannel` の ③ |

⭐⭐⭐ **一般化: 「押し口」を数えるときは `mouse.click` だけでなく、
`waitForNavigation` と対で書かれた箇所も数えること。**

④⑤⑥ が厄介だったのは、押す先が `phlan`(= `enter` を持つただ 1 つのノード)で
**着いた瞬間にページごと消える**から。「`heroNode()` が一致するまで押す」ループでは
一致する瞬間が**原理的に来ない**。直す前は **53/57**((4b)(4c)(4c-z)(9a) が同時に赤)。
→ 「**入場ノードの手前まで刻んで歩き、最後の 1 回だけ `waitForNavigation` と対で押す**」
`walkNextTo()`(`tools/verify_world_map.js:670`)を 1 本立てて 3 箇所から呼ぶ形で解決した。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

**鳴らない。** 本チケットが触るのは `world.html` / `js/world-map.js` / `tools/*` / `実装依頼書/*` だけ。
⛔ **フックを鳴らすためだけに `tavern.html` を開くこと自体を禁止する**
(CLAUDE.md の ⭐⭐⭐「プレイヤーに見える変化が無いのに本番 3 ファイルを触る設計は採らない」)。

⭐ ただし変化はプレイヤーに見える(歩き方が変わる)ので、**任意で 1 行足すのは可**(§10)。

### 2-8. 撤退スイッチ名の衝突確認

`walkstep` は **リポジトリ全文で 0 件**(`grep -rn "walkstep" *.html js/*.js tools/*.js` で実測)。
既存は `world` / `town` / `questwalk` / `doors` / `locks` / `heromark` / `sheet5e` / `darkvision` ほか。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/world-map.js` | 派生レイヤを **追加**(`STEP_MAX_PX` / `STEPS` / `stepsOfEdge` / `walkNodes` / `walkEdges` / `walkNeighbors` / `findWalkPath`)。⛔ `NODES` / `EDGES` / `findPath` / `neighbors` / `SITES` / `UNLOCK` / `spawnFor` は 1 バイトも触らない |
| `world.html` | 刻み点マーカーの描画とタップ / 1 タップ = 1 ホップの移動 / 到着フック / `?walkstep=0` / `__world` へ読み窓を追加 |
| `tools/verify_world_steps.js` | **新規**。本チケットの受入条件 + `--negative` |
| `tools/verify_world_map.js` | **押し口のみ**(`:693` を「着くまで押し直す」へ)。⛔ assert の期待値は 1 つも触らない |
| `tools/verify_quest_walk.js` | **押し口のみ**(`:802` の `clickNode`)。⛔ 同上 |
| `実装依頼書/README.md` | #40 の行を足す(文面は §11。**着地してから**) |

---

## 4. STEP1 — `js/world-map.js` に派生レイヤを足す(⛔ 既存データは触らない)

`global.WORLD_MAP`(現 `js/world-map.js:215`)の **手前**に足す。

    /* ── 歩みの刻み (#40) ─────────────────────────────────────────────
     *  ⭐⭐⭐ **NODES / EDGES / findPath / neighbors は 1 バイトも触らない。**
     *    tools/verify_quest_walk.js の (5a) が {nodesFP, edges, sites} の sha1 を
     *    876c5f6336f96811 で固定しており、tools/verify_world_map.js の (7f) が
     *    「NODES はちょうど 14 件」を要求している。ここへ刻み点を混ぜると両方赤くなる。
     *    ⭐ WORLD_MAP へ **関数や定数を足す**ぶんにはハッシュは動かない (材料は 3 つだけ)。
     *
     *  ⭐⭐⭐ 刻み点も **EDGES ただ 1 つから生成する**。⛔ 座標表を手で書かない
     *    (「描く線と歩けるデータは同一」の鉄則 = js/world-map.js:21 と同じ理由)。
     *
     *  ⚠ 1 マス = 64px は assets/world_region.jpg (1536x1024 = 24x16) の換算。
     *    ⛔ タイル格子は作らない (罠 C)。この定数は「刻みの長さ」だけに使う。 */
    var STEP_MAX_PX = 320;                 /* = 5 マス。⭐ 刻みの粗さはこの 1 定数だけで決まる */

    /* エッジ 1 本に生える刻み点。⭐ 等分するので「1 区間 <= STEP_MAX_PX」が必ず成り立つ。
     *  id は "<a>__<b>@<i>" (i は 1..k-1)。⚠ NODES のキーと衝突しない形にしてある。 */
    function stepsOfEdge(a, b) {
      var na = NODES[a], nb = NODES[b], out = [];
      if (!na || !nb) return out;
      var d = Math.sqrt((nb.x - na.x) * (nb.x - na.x) + (nb.y - na.y) * (nb.y - na.y));
      var k = Math.max(1, Math.ceil(d / STEP_MAX_PX));
      for (var i = 1; i < k; i++) {
        var t = i / k;
        out.push({ id: a + "__" + b + "@" + i, kind: "step",
                   x: na.x + (nb.x - na.x) * t, y: na.y + (nb.y - na.y) * t,
                   on: [a, b] });
      }
      return out;
    }

    /* 刻み点の全体。⭐ EDGES から毎回生成する (別表を持たない)。
     *  ⚠ 2026-09-01 の実測では ちょうど 1 件 = lake_n__lakeside@1 (896, 416)。 */
    var STEPS = (function () {
      var m = {};
      for (var i = 0; i < EDGES.length; i++) {
        var ss = stepsOfEdge(EDGES[i][0], EDGES[i][1]);
        for (var j = 0; j < ss.length; j++) m[ss[j].id] = ss[j];
      }
      return m;
    })();

    /* 細分化後のグラフ (NODES ∪ STEPS)。⛔ NODES を書き換えず、毎回組んで返す。 */
    function walkNodes() {
      var m = {}, k;
      for (k in NODES) if (Object.prototype.hasOwnProperty.call(NODES, k)) m[k] = NODES[k];
      for (k in STEPS) if (Object.prototype.hasOwnProperty.call(STEPS, k)) m[k] = STEPS[k];
      return m;
    }
    function walkEdges() {
      var out = [];
      for (var i = 0; i < EDGES.length; i++) {
        var a = EDGES[i][0], b = EDGES[i][1];
        var chain = [a].concat(stepsOfEdge(a, b).map(function (s) { return s.id; })).concat([b]);
        for (var j = 0; j + 1 < chain.length; j++) out.push([chain[j], chain[j + 1]]);
      }
      return out;
    }

    /* ── 細分化グラフの上の経路探索 ─────────────────────────────────
     *  ⛔ 既存の findPath / neighbors には **手を触れない**。
     *     tools/verify_world_map.js の (3z)(3a) と verify_quest_walk.js の (2c) が
     *     あちらを 14 ノードのグラフとして測っている (受入条件 (5a) が機械で縛る)。
     *  ⚠ 契約は findPath と同じ: 始点を含まないノード id の列 / 同じなら [] / 不達なら null。
     *  ⚠ 既存 findPath の本体 (js/world-map.js:115) をそのまま写して、
     *     neighbors/dist の引き先だけ細分化グラフへ差し替えること。 */
    function walkNeighbors(id) { /* walkEdges() から引く。⛔ 別表を作らない */ }
    function findWalkPath(fromId, toId) { /* 同じダイクストラを walkNodes()/walkEdges() の上で */ }

そして `global.WORLD_MAP` の中身へ **追加だけ**する:

    global.WORLD_MAP = {
      W: W, H: H,
      NODES: NODES, EDGES: EDGES, SITES: SITES, UNLOCK: UNLOCK,
      has: has, neighbors: neighbors, findPath: findPath, spawnFor: spawnFor,
      isRevealed: isRevealed, scenarioOfNode: scenarioOfNode,
      /* ── #40 の追加。⛔ 上の行は 1 バイトも変えない ── */
      STEP_MAX_PX: STEP_MAX_PX, STEPS: STEPS, stepsOfEdge: stepsOfEdge,
      walkNodes: walkNodes, walkEdges: walkEdges,
      walkNeighbors: walkNeighbors, findWalkPath: findWalkPath
    };

⭐ `spawnFor` / `SITES` の返り値は元のノード id なので、細分化グラフでもそのまま始点・終点になる。
⚠ `scenarioOfNode("lake_n__lakeside@1")` は `null` を返す(= 刻み点では入場ダイアログが出ない)。
これは既存の実装のまま成り立つので **`onArriveNode` の条件は変えない**。

**この STEP で新 driver の §0 装置だけ先に立てる**(母集団が無いと以降が全部空振りになる)。

---

## 5. STEP2 — `world.html` に刻み点マーカーを描き、押せるようにする

### 5-1. CSS(`world.html` の `.worldNode:hover` 定義の直後 = 現 `:227` あたり)

    /* ── 歩みの刻み (#40) ─────────────────────────────────────────────
       ⚠⚠ クラス名は **.worldStep**。⛔ .worldNode を着せないこと —
         (3c) が top.closest('.worldNode') で「押した先がノードでない」を測っており、
         verify_quest_walk.js:547 は札の所有者を同じ式で引いている (依頼書 §2-4)。
       ⚠ 点線の点は stroke-dasharray: 1 17 = **18px おき**。紛れないよう
         「点線より一回り大きく、中継点の 9px より小さい」6px + 明るい縁で出す。
       ⭐ z-index は .worldNode (4) と同じ層。主人公 (5) より下 = 立つと体の後ろへ隠れる。 */
    .worldStep {
      position: absolute;
      transform: translate(-50%, -50%);
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;            /* 当たり判定。⚠ .worldNode の 44px より小さく */
      cursor: pointer;
      z-index: 4;
    }
    .worldStepBody {
      display: block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--route-ink);
      opacity: 0.85;
      box-shadow: 0 0 0 2px rgba(20,14,6,0.9), 0 1px 4px rgba(0,0,0,0.6);
      transition: transform 0.12s ease;
    }
    .worldStep:hover .worldStepBody { transform: scale(1.35); }

⛔ **色・大きさ・形は §8 の「測らないこと」に入れてある。** 実機で見て調整してよい。

### 5-2. 生成(`world.html` の `buildNodes()` 呼び出し = 現 `:669` 以降の直後)

    /* ⭐⭐⭐ 座標は WORLD_MAP.STEPS から引く。⛔ world.html 側に写しを作らない
       (js/world-map.js:8 の確定作法)。 */
    var stepEls = {};
    function buildSteps() {
      if (walkStepOff) return;              /* 撤退時は 1 枚も描かない (§7) */
      Object.keys(STEPS).forEach(function (id) {
        var s = STEPS[id];
        var el = document.createElement("div");
        el.className = "worldStep";
        el.id = "worldStep_" + id;
        el.setAttribute("data-step", id);
        var body = document.createElement("span");
        body.className = "worldStepBody";
        el.appendChild(body);
        el.style.left = s.x + "px";
        el.style.top  = s.y + "px";
        el.addEventListener("click", function (ev) { ev.stopPropagation(); goToPoint(id); });
        elStage.appendChild(el);
        stepEls[id] = el;
      });
    }
    buildSteps();

⛔ `nodeEls` へ入れない(`__world.nodeIds()` が汚れる)。`__world.stepIds()` を別に足す。

---

## 6. STEP3 — 1 タップ = 1 ホップにする

### 6-1. `goToNode` を `goToPoint` へ広げる(現 `world.html:847`)

現状:

    function goToNode(id) {
      if (!WM.has(id)) return false;
      if (id === heroNodeId && !moving) { onArriveNode(id); return true; }
      var path = WM.findPath(heroNodeId, id);
      if (path === null) return false;
      var n = NODES[id];
      elGoal.style.left = n.x + "px"; elGoal.style.top = n.y + "px";
      elGoal.classList.add("show");
      walkPath(path, function () { onArriveNode(id); });
      return true;
    }

⭐ 変える点は **2 つだけ**:

1. 母集団を「NODES」から「NODES ∪ STEPS」へ(`WM.walkNodes()`)
2. `walkPath` に渡すのを **経路全部ではなく先頭 1 ホップだけ**にする

<!-- -->

    /* ⭐⭐⭐ 1 タップ = 経路上の **次の 1 点**まで。行き先は elGoal に残るので、
         同じ所を続けて押せば刻みながら着ける。
       ⛔ 「隣接だけ押せる」にはしない — 遠い拠点を押しても 1 ホップは進むこと
         (受入条件 (3c) と負のコントロール hopnone が縛る)。
       ⚠ 撤退時 (walkStepOff) は **今日どおり経路全部**を歩く。 */
    function goToPoint(id) {
      var G = WM.walkNodes();
      if (!Object.prototype.hasOwnProperty.call(G, id)) return false;
      if (id === heroNodeId && !moving) { onArriveNode(id); return true; }
      var path = walkStepOff ? WM.findPath(heroNodeId, id) : WM.findWalkPath(heroNodeId, id);
      if (path === null || path.length === 0) return false;
      var g = G[id];
      elGoal.style.left = g.x + "px"; elGoal.style.top = g.y + "px";
      elGoal.classList.add("show");
      var hop = walkStepOff ? path : path.slice(0, 1);      /* ★ ここが本チケットの核心 */
      var last = hop[hop.length - 1];
      walkPath(hop, function () {
        /* ⭐ 目印は「まだ着いていない」あいだ出したままにする。 */
        if (last === id) elGoal.classList.remove("show");
        onArriveStep(last, id);
      });
      return true;
    }
    /* ⛔ 既存の呼び名は残す (__world.goToNode をドライバが握っている)。 */
    function goToNode(id) { return goToPoint(id); }

⚠⚠ `walkPath()`(現 `:743`)は歩き終わりに `elGoal.classList.remove("show")` を
**必ず**実行している(`world.html:771`)。1 ホップ運用では
**最終目的地に着くまで消さない**ように、その 1 行を `walkPath` から外して
上の `goToPoint` 側の判断に寄せること。⚠ 撤退時は今日と同じ(1 回で着くので必ず消える)。

### 6-2. 到着フック = ランダムイベントの器(⛔ イベントは 1 件も実装しない)

    /* ── 到着フック (#40) ─────────────────────────────────────────────
       ⭐ **器だけ**。ここでイベントを起こさない (後続チケットの担当)。
       ⚠ 1 ホップ = 1 回だけ呼ぶ。⛔ walkPath の中から呼ばない
         (撤退時は中継ノードを通過するので、そこで鳴らすと回数が合わなくなる)。
       lastArrival は __world が読むための記録。⛔ ゲームの状態を置く場所にしない。 */
    var lastArrival = null, arrivalCount = 0;
    function onArriveStep(atId, destId) {
      arrivalCount++;
      lastArrival = { at: atId, dest: destId,
                      kind: WM.has(atId) ? "node" : "step",
                      arrived: atId === destId };
      if (WM.has(atId)) onArriveNode(atId);      /* 拠点の入場判定は今日のまま */
    }

⚠ `onArriveNode`(現 `:792`)は **1 バイトも変えない**。港町の即遷移も受注地のダイアログも今日どおり。

#### ⚠⚠⚠ 訂正(2026-09-02 / 実装窓)— 上の雛形の最後の 1 行は **そのままでは fatal**

雛形は `if (WM.has(atId)) onArriveNode(atId);` と書いているが、**これは誤り**。
1 ホップ運用では**通りすがりの拠点でも `onArriveNode` が鳴く**ので、
1 ホップ目が `phlan`(`enter` を持つただ 1 つのノード)になる行き先を押した瞬間に
`location.href = "town.html"` が走り、**ページごと消える**。
2026-09-01 の実測では `pier` から `forest` を押しただけで
`tools/verify_world_map.js` が (fatal)「`WORLD_MAP` が undefined」で**全滅**した。

正しい形は **「押した行き先へ着いたときだけ」**:

    if (lastArrival.arrived && WM.has(atId)) onArriveNode(atId);

⭐ 今日の姿でも `walkPath` は中継ノードで何も鳴らさないので、**これが本当の「今日のまま」**。
⛔ `onArriveNode` 自体は 1 バイトも変えていない。変えたのは **呼ぶ条件**だけ。
⭐⭐⭐ 一般化: **依頼書の実装雛形コードも「主張」であって実測ではない**(#39 §4-3 と同じ型)。

### 6-3. `__world` へ読み窓を足す(現 `world.html:888`)

    stepIds:      function () { return Object.keys(stepEls); },
    lastArrival:  function () { return lastArrival; },
    arrivalCount: function () { return arrivalCount; },
    walkStepOff:  function () { return walkStepOff; },
    stepMaxPx:    function () { return WM.STEP_MAX_PX; },
    clientFromPoint: function (id) {
      var g = WM.walkNodes()[id];
      if (!g) return null;
      return window.__world.clientFromWorld(g.x, g.y);
    }

⛔ ここへ状態を足さない(既存コメント `world.html:887` の方針どおり)。

### 6-4. 既存 golden 2 本の押し口を直す(⛔ 期待値は 1 つも触らない)

`tools/verify_world_map.js:693` と `tools/verify_quest_walk.js:802`(`clickNode`)を、
**着くまで押し直す**形へ。1 箇所ずつ、計 2 箇所。

    /* ⭐ #40 以降、1 タップ = 最大 320px しか進まない。押して着くまで押し直す。
       ⛔ 上限を外さない — 動かなくなった実装を無限ループで隠さないため。
       ⚠ 「押した回数」も持ち帰る (新 driver の (3b) が回数まで測る)。 */
    const MAX_TAPS = 12;
    let taps = 0, lastNode = null;
    for (; taps < MAX_TAPS; taps++) {
      await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
      try { await page.waitForFunction('!window.__world.isMoving()', { timeout: 60000, polling: 80 }); }
      catch (e) { errs.push(tag + ' 到着待ちタイムアウト: ' + id); break; }
      const now = await page.evaluate(() => window.__world.heroNode());
      if (now === id) { taps++; break; }
      if (now === lastNode) break;          /* 1px も進まなくなったら打ち切り (assert 側が赤にする) */
      lastNode = now;
      /* ⚠⚠⚠ カメラが主人公を追うので client 座標は毎回採り直す。
         ⛔ 最初の pt を使い回すと 2 回目以降が的外れを押す。 */
      pt = await page.evaluate((i) => window.__world.clientFromNode(i), id);
    }

⛔ **`?walkstep=0` を既存ドライバの URL に足して逃げないこと。**
それをやると本番の振る舞いを既存 golden が 1 つも測らなくなる。

---

## 7. 撤退スイッチ

- **`?walkstep=0`** — 刻み点マーカーを 1 枚も描かず、1 タップで経路全部を歩く(**今日の姿**)。
- **判定位置** = `world.html`。作法は既存の `?questwalk=0`(`world.html:642`)をそのまま流用:

      var WALK_STEP_OFF_KEY = "dragonfighters.walkStepOff";
      try {
        if (new URLSearchParams(location.search).get("walkstep") === "0") {
          sessionStorage.setItem(WALK_STEP_OFF_KEY, "1");
        }
      } catch (e) {}
      var walkStepOff = false;
      try { walkStepOff = sessionStorage.getItem(WALK_STEP_OFF_KEY) === "1"; } catch (e) {}

  ⚠ **`buildSteps()` より前**に置くこと(§5-2 が `walkStepOff` を読む)。
- **ページ遷移をまたぐか** = **またぐ**(sessionStorage へ写す)。酒場 → 出発 → world の導線は
  クエリを持ち越せない(#12 の確定作法「遷移先にクエリを足さない」)ため。
- ⛔ `?world=0` / `?questwalk=0` と相乗りさせない(赤が出たときどちらの撤退か切り分けられない)。
- ⭐⭐⭐ **撤退しても `WORLD_MAP.STEPS` のデータ自体は消えない。**
  戻すのは「描画」と「1 ホップ制限」だけ((6d) がこれを測る)。

---

## 8. 受入条件 — `tools/verify_world_steps.js`(新規)

方針: **刻み点の座標をドライバに写経しない**。`WORLD_MAP.EDGES` から
ドライバが自分で計算し直し、ページの `STEPS` と突き合わせる(別経路どうしの照合)。
移動は **必ず画面上の点を実際に押す**(`goToPoint()` を直接呼ばない)。

### ⚠ 計測機構

    /* ⭐ ドライバ側で刻み点を独立に計算する。⛔ ページの STEPS をそのまま期待値にしない。
       ⛔ 320 を直書きしない — 上限は __world.stepMaxPx() から読む。 */
    function expectSteps(NODES, EDGES, cap) {
      const out = [];
      for (const [a, b] of EDGES) {
        const na = NODES[a], nb = NODES[b];
        const d = Math.hypot(nb.x - na.x, nb.y - na.y);
        const k = Math.max(1, Math.ceil(d / cap));
        for (let i = 1; i < k; i++) {
          const t = i / k;
          out.push({ id: `${a}__${b}@${i}`, x: na.x + (nb.x - na.x) * t, y: na.y + (nb.y - na.y) * t });
        }
      }
      return out;
    }

⚠ 実クリックは §6-4 と同じ「着くまで押し直す」を使うが、**回数を必ず持ち帰る**。

### §0 装置(先に母集団を確かめる)

- **(0a)** `WORLD_MAP.STEPS` が **0 件でない**、かつ `__world.stepMaxPx()` が読める。
  ⭐⭐⭐ **これが無いと §1〜§3 が全部空振りで永久緑になる**
- **(0b)** ドライバが独立計算した `expectSteps()` の **id 集合と座標**がページの `STEPS` と
  1 件残らず一致(座標は 0.01px 以内)。⭐ 2 経路 = 写経ではないことの証明
- **(0c)** 刻み点マーカーの DOM 件数が `STEPS` の件数と一致し、**1 枚も `.worldNode` を着ていない**
  (`el.closest('.worldNode') === null`)
- **(0d)** `__world` に `stepIds` / `lastArrival` / `arrivalCount` / `walkStepOff` /
  `stepMaxPx` / `clientFromPoint` が揃っている

### §1 刻みのデータ

- **(1a)** ⭐⭐⭐ **細分化後の全区間が `stepMaxPx()` 以下**。`WORLD_MAP.walkEdges()` の
  全区間長を測る。⚠ 母集団が空でないこと(区間数 >= `EDGES.length`)も同じ assert で見る
- **(1b)** 刻み点は必ず元エッジの線分上(点と線分の距離 <= 0.5px)。
  ⭐ 「描く線と歩けるデータが同一」の機械証明
- **(1c)** どの刻み点も、最寄りの `NODES` から **44px より離れている**(当たり判定が重ならない)。
  ⚠ 2026-09-01 実測の最小は `lake_n__lakeside@1` → `mine` の **172.3px**
- **(1d)** ⭐⭐⭐ **恒等**: `{nodesFP, edges, sites}` の sha1 が **`876c5f6336f96811`**。
  `NODES` 14 件 / `EDGES` 14 本 / `SITES` 6 件。
  ⚠ `verify_quest_walk.js:1511` の (5a) と **同じ式を新 driver にも同居**させる(2 本で縛る)

### §2 見た目

- **(2a)** 刻み点マーカーの**画面座標**が `STEPS` の座標 × zoom と 2px 以内。
  ⭐ `getBoundingClientRect()` から採る(実装の `clientFromWorld` とは別経路)
- **(2b)** ⭐⭐⭐ 点線 `<line>` の本数が **14 本のまま**(= `WORLD_MAP.EDGES.length`)。
  ⛔ 点線を刻み点で分割していないこと
- **(2c)** 各刻み点マーカーの中心の `elementFromPoint` が **自分自身か子孫**(押せる)
- **(2d)** 刻み点マーカーの矩形が 7 枚の `.worldSign` のどれとも 1px も重ならない

### §3 1 タップ = 1 刻み(本体)

- **(3a)** ⭐⭐⭐ `phlan` から **`temple` の札を 1 回だけ**押す → **着かない**。
  かつ **経路上の次の 1 点**に立っている。2 経路で突き合わせ:
  ① `__world.heroNode()` が `WORLD_MAP.findWalkPath("phlan","temple")[0]` と一致
  ② `__world.heroPx()` がその点の座標と 1px 以内
  ⛔ 期待するノード id をドライバに直書きしない(ページの `findWalkPath` から引く)
- **(3b)** 同じ札を押し続けると最終的に着く。⭐ **押した回数**が
  `findWalkPath("phlan","temple").length` と一致(実測値を記録すること)。
  ⚠ 上限 12 回を超えたら赤
- **(3c)** ⭐ 1 タップで進んだ距離が **`stepMaxPx()` 以下**。全 15 停留所を起点に測る
- **(3d)** 刻み点マーカーを直接タップ → **1 ホップ**でそこへ着く(`heroNode()` が刻み点 id)
- **(3e)** 線の無い座標(ワールド (64,544) と (1440,960))をタップ → **1px も動かない**。
  ⭐ 押す前に「最寄りノード / 最寄り刻み点から 100px 以上」をその場で実測してから押す
  (2026-09-01 実測: 841.8px / 769.3px)

### §4 到着フック(ランダムイベントの器)

- **(4a)** `__world.lastArrival()` が `{at, dest, kind, arrived}` を返し、
  刻み点で止まったときは `kind === "step"` / `arrived === false`、
  最終目的地に着いたときは `kind === "node"` / `arrived === true`
- **(4b)** `__world.arrivalCount()` が **1 ホップにつきちょうど 1 増える**
  (2 ホップ進めて 2、3 ホップで 3)
- **(4c)** ⛔ **イベントは 1 件も起きない** — 刻み点に着いてもダイアログ / 遷移が発生しない
  (`location.pathname` が `/world.html` のまま・`__world.askOpen()` が false)

### §5 恒等(非退行)

- **(5a)** ⭐⭐⭐ `WORLD_MAP.findPath` / `neighbors` が **細分化前のまま**。
  `findPath("phlan","temple")` の要素が全部 `NODES` のキーで、刻み点 id を 1 つも含まない。
  かつ `neighbors("lakeside")` の件数が細分化前と同じ
- **(5b)** `enter` を持つノードは今も `phlan` ただ 1 つ
- **(5c)** 札(`.worldSign`)の DOM がちょうど 7 枚(刻み点に札が生えていない)

### §6 撤退

- **(6a)** `world.html?walkstep=0` → 刻み点マーカーが **0 枚**、
  `temple` の札を **1 回押すと着く**(今日の姿)
- **(6b)** ⭐⭐⭐ **素のアームの対照を同じ assert に同居させる。**
  同じ操作を撤退なしでやると **1 回では着かない**。
  ⚠ 両方測って初めて緑(#39 の教訓 = 撤退アームだけだと永久緑)
- **(6c)** クエリを外して開き直しても撤退が効いている(sessionStorage へ写っている)
- **(6d)** ⭐ **撤退のしすぎを測る**: `?walkstep=0` でも `WORLD_MAP.STEPS` は
  **同じ件数・同じ座標で存在する**(消えるのは描画と 1 ホップ制限だけ)

### ⛔ 測らないこと

- 刻み点マーカーの **色・大きさ・形**(`.worldStepBody` の 6px / opacity / box-shadow)
  — 実機で見て動かす余地を残す。⚠ 「`.worldNode` を着ていない」ことだけは (0c) が縛る
- **`PX_PER_MS`(歩く速さ 0.18)** — ⛔ 本チケットでは変えない。体感で動かす余地を残す
- ランダムイベントの中身 — 器だけ((4c) が「何も起きない」ことだけ縛る)
- **刻みの上限値そのもの(320px)** — (1a)(3c) は `__world.stepMaxPx()` を**ページから読んで**比較する。
  ⛔ ドライバに 320 を直書きしない(後から上限を変えても赤くならないように)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nosteps` | `STEPS` を空オブジェクトにする | (0a)(1a)(2a) |
| `fullwalk` | ⭐⭐⭐ `path.slice(0, 1)` を `path` に戻す(今日の姿) | (3a)(3b)(3c)(6b) |
| `handcoord` | ⭐⭐⭐ §2-2 の罠の再現 — `STEPS` を `EDGES` から生成せず手書き座標表にし、1 点だけ 8px ずらす | (0b)(1b) |
| `nodemut` | ⭐⭐⭐ 刻み点を `WORLD_MAP.NODES` へ注入する | (1d)(5c) |
| `linemut` | 点線 `<line>` を刻み点で分割する | (2b) |
| `stepclass` | 刻み点マーカーに `.worldNode` クラスを着せる | (0c) |
| `hopnone` | 遠い行き先では 1px も動かないようにする(隣接だけ押せる) | (3a)(3c) |
| `pathswap` | `findPath` 自体を `findWalkPath` へ差し替える(既存 API を汚す) | (5a) |
| `retreatdead` | `?walkstep=0` を無視する | (6a)(6c) |
| `retreatkills` | 撤退時に `STEPS` のデータごと空にする(撤退のしすぎ) | (6d) |
| `fireevent` | 刻み点到着で確認ダイアログを開いてしまう(器に中身を入れる) | (4c) |
| `arrivedup` | `walkPath` の中からフックを呼び、1 ホップで 2 回鳴らす | (4b) |

⚠ 変異アンカーは**部分文字列一致で配信スナップショット中にちょうど 1 箇所**ヒットさせること。
0 件でも 2 件以上でも **exit 3 でドライバごと死ぬ**(#39 で `driver_grid_p5` が実際に死んだ)。
⭐ アンカーに選んだ行は**整形し直さない**。
⭐ 変異が空振りしたら、**変異のほうを直す**(受入条件を弱めない。#38 の教訓)。

### 既存 golden の非退行(実装後に必ず走らせる)

| コマンド | **2026-09-01 実測** |
|---|---|
| `node tools/verify_world_map.js` | **57/57 PENDING 0** |
| `node tools/verify_quest_walk.js` | **25/25 PENDING 0** |
| `node tools/verify_town_exit.js` | **23/23 PENDING 0** |
| `node tools/verify_title_screen.js` | **86/86** |

⚠ 上 2 本は §6-4 の押し口修正が要る。**期待値は 1 つも書き換えない。**
下 2 本は §2-6 の実測により**修正不要**(押すのが `phlan` = 1 タップ圏内)。

⭐⭐⭐ **判定は「本数」でなく「落ちている項目の集合」で見る**(#38 の教訓):
着手前 hash **`bb32beb`** を worktree へ取り出して同じドライバを走らせ、
**NG セットを diff** する。数字が同じでも中身が入れ替わっていたら退行。

    git worktree add ../df-base bb32beb
    (cd ../df-base && node tools/verify_world_map.js > /tmp/base_wm.txt 2>&1)
    node tools/verify_world_map.js > /tmp/now_wm.txt 2>&1
    diff <(grep -o "FAILED (.*)" /tmp/base_wm.txt) <(grep -o "FAILED (.*)" /tmp/now_wm.txt)

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` だとナレーション音声が鳴らない)。

1. ⭐⭐⭐ **港町フラン → 廃坑 を実際に歩いてみて、4 タップが「面倒」でなく「旅」に感じるか。**
   面倒なら上限を 5 マス → 6〜7 マスへ緩める(`STEP_MAX_PX` の 1 定数)
2. 刻み点の印(6px)が **点線の点(18px おき)と紛れないか**。
   ⚠ 逆に「うるさい」なら opacity を下げる
3. 遠い拠点を押したとき、**目印(緑の輪)が最終目的地に残っている**ことが
   「まだ着いていない」と読めるか
4. iPhone 縦持ち(compact / zoom 実測 ~0.76)で刻み点の 32px 当たり判定が押しやすいか。
   ⚠ 押しにくければ **当たり判定だけ**広げる(見た目の 6px は変えない)
5. 連打で進めるか(同じ場所を素早く 2 回押したとき、2 ホップ進むか / 1 回目を取りこぼさないか)
6. ⭐ 唯一の刻み点 `lake_n__lakeside@1` (896,416) が **雪山の斜面の上**に乗っていて
   絵として不自然でないか(⚠ 水率は既存 (1a) が担保済みだが「絵として」は目でしか分からない)

---

## 10. changelog

**不要。** `scripts/hooks/check_changelog.py:24` の
`GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` に本チケットの変更ファイルは
1 つも含まれない(§2-7 で実測)。

⛔ **フックを鳴らすためだけに `tavern.html` を開くのは禁止。**
⭐ 任意で足すなら(プレイヤー向けの要約が実在するので嘘にならない):

    py tools/add_changelog.py "<b>地図を少しずつ進めるようになった</b> — 街道は 1 回のタップで 5 マスぶん進む。"

⚠ ただしこれを足すと `tavern.html` を触ることになる。**足さない**のが既定。

---

## 11. やらないこと

- ⛔ **ランダムイベントの実装**(遭遇・宝・天候・道中の会話)。今回は **器だけ**。
  (4c) が「到着しても何も起きない」ことを機械で縛る。中身は後続チケット
- ⛔ **`WORLD_MAP.NODES` / `EDGES` / `SITES` / `UNLOCK` / `findPath` / `neighbors` / `spawnFor` の変更**
  (§2-2 の罠。(1d)(5a) と既存 (5a)(7f)(2a)(3b) が縛る)
- ⛔ **通行マスク / タイル格子を作ること**(`js/world-map.js:15` の罠 C は今も有効)
- ⛔ **`PX_PER_MS`(歩く速さ)の変更**。街 `town.html` の `MS_PER_TILE` と対で揃っている
- ⛔ **新しい拠点・中継点の追加**(#21〜#23 で決着済み。7 拠点 + 7 中継点のまま)
- ⛔ **`town.html` / `tavern.html` / `title.html` / `index.html` の変更**
- ⛔ **既存 golden の assert 期待値の書き換え**。直すのは §6-4 の押し口 2 箇所だけ
- ⛔ **刻みの上限をドライバへ直書きすること**(必ず `__world.stepMaxPx()` から読む)
- ⛔ **`実装依頼書/README.md` への行追加は最後**(実装が着地してから)。用意してある行:

    | 40 | [2026-09-01_world-walk-steps.md](2026-09-01_world-walk-steps.md) | **承認済** | 0% | 地図を「1 タップ = 最大 5 マス」で刻んで進む。⭐ 依頼の「点線の間隔が長い」は着手前実測で崩れた — エッジは平均 3.18 マス・最長 6.40 マスで、長いのは **1 タップの移動**(最長 22.55 マス / 8.02 秒)のほう。⚠⚠⚠ **刻み点を `WORLD_MAP.NODES` へ足すと既存 golden が 4 本赤くなる**(sha1 `876c5f6336f96811` / (7f) の「14 件」/ (2a) の「線 14 本」/ (3b) の母集団)→ **派生レイヤ**で持つ。⚠⚠ 点線 SVG は `pointer-events: none` なので印は HTML の `<div>`、クラスは `.worldStep`(`.worldNode` を着せると (3c) が誤爆)。⚠ 押し口の修正は `verify_world_map.js:693` と `verify_quest_walk.js:802` の 2 箇所だけ(期待値は 0 件変更)。撤退 `?walkstep=0` |

---

## 12. 実装結果

**完了(2026-09-02)。** dev-loop 4 項目・停止 0 回。

| 項目 | commit | 中身 |
|---|---|---|
| 1 | `b42f904` | `js/world-map.js` に派生レイヤ(`STEP_MAX_PX` / `STEPS` / `stepsOfEdge` / `walkNodes` / `walkEdges` / `walkNeighbors` / `findWalkPath`)+ 新 driver の §0 / §1 |
| 2 | `b731644` | `world.html` に `.worldStep` マーカーを描き、押せるようにする(§2) |
| 3 | `64d3ceb` | 1 タップ = 経路の次の 1 点まで / 到着フックの器 / 既存 golden の押し口(§3 / §4) |
| 4 | (本コミット) | 撤退 `?walkstep=0` の受入(§6)/ 恒等 3 本(§5)/ **負のコントロール 12 本** |

### 12-1. 検証(すべて実際に走らせた)

| コマンド | 結果 |
|---|---|
| `node tools/verify_world_steps.js` | **30/30 PASSED FAILED 0 PENDING 0** |
| `node tools/verify_world_steps.js --negative` | **46/46 PASSED FAILED 0** = 変異 12 本すべて赤・**空振り 0** |
| `node tools/verify_world_map.js` | **57/57 PASSED FAILED 0 PENDING 0**(非退行) |
| `node tools/verify_quest_walk.js` | **25/25 PASSED FAILED 0 PENDING 0**(非退行) |
| `node tools/verify_town_exit.js` | **素 23/23 PASSED(PENDING 0)**(非退行) |
| `node tools/verify_title_screen.js` | **86/86 passed**(非退行) |

### 12-2. 実測値(⭐ 起草時の見積もりと突き合わせた結果)

| 測ったもの | 実測 | 起草時の見積もり |
|---|---|---|
| 刻み点の件数 | **1 件** = `lake_n__lakeside@1` **(896, 416)** | 1 件 (896,416) ✅ 一致 |
| 細分化後の区間数 | **15 本**(EDGES 14 本 + 分割 1) | — |
| 1 タップの最長移動 | **286.2px**(`lakeside`→`dragon`)/ 上限 320px | — |
| `phlan`→`temple` を刻んで歩く | **8 タップ**(`findWalkPath` の長さ 8 と一致)。<br>内訳 = cross_n → forest → farm_n → lake_n → **lake_n__lakeside@1** → lakeside → mine → temple | 8 ✅ |
| `findPath("phlan","temple")` | 7 ホップ(刻み点を含まない)。⭐ 経路 A(1352.4px)が経路 B(1361.0px)に勝つので**刻み点はこの経路上に載る** | — |
| (3c) の母集団 | **27 タップ / 起点 15 種 = 全停留所** | — |
| (5a) の母集団 | `findPath` を **196 組(14x14)**+ 全 14 エッジ + 全 14 ノードの `neighbors` | — |
| 撤退あり `pier`→`temple` を 1 タップ | **着く**(変位 853.9px) | ✅ |
| 撤退なし `pier`→`temple` を 1 タップ | **`phlan` 止まり**(90.5px)= `findWalkPath[0]` | ✅ |
| `?walkstep=0` の STEPS | **1 件・(896,416) のまま**(消えるのは描画と 1 ホップ制限だけ) | ✅ |

### 12-3. ⚠⚠⚠ 崩れた主張 3 件(起草時の断言が実装で覆った)

1. **「押し口は 2 箇所だけ」→ 実測 6 箇所**(§2-6 の訂正節に全文)。
   ⭐⭐⭐ **`mouse.click` だけを grep すると `waitForNavigation` と対で書かれた押し口を取りこぼす。**
   その 3 箇所は押す先が `phlan`(`enter` を持つただ 1 つのノード)なので
   「`heroNode()` が一致するまで押す」ループでは**一致する瞬間が原理的に来ない**。
   直す前は `verify_world_map` が **53/57**((4b)(4c)(4c-z)(9a) が同時に赤)。
2. **§6-2 の実装雛形 `if (WM.has(atId)) onArriveNode(atId);` は fatal**(§6-2 の訂正節に全文)。
   通りすがりの `phlan` で `location.href = "town.html"` が走り、
   `verify_world_map` が (fatal)「`WORLD_MAP` が undefined」で全滅した。
   正しくは `if (lastArrival.arrived && WM.has(atId))`。
   ⭐⭐⭐ **依頼書の実装雛形コードも「主張」であって実測ではない。**
3. **改行コードはファイルごとに違う。** `world.html` は **CRLF**(1073 行 / 68247B / bare LF 0)、
   `js/world-map.js` と `tools/*.js` は **LF**。同じチケットの中で混在する。
   → 変異アンカーは **必ず 1 行に閉じる**(改行をまたぐと CRLF/LF の差で必ず空振りする)。
   Python で置換するときは読み書きとも `newline=""`。⛔ `git diff` では化けに気づけない。

### 12-4. 負のコントロール 12 本(⭐ すべて実際に赤くなった)

| 変異 | 注入した欠陥 | 実際に赤くなった節 |
|---|---|---|
| `nosteps` | `stepsOfEdge` の分割数を常に 1 → STEPS が空 | (0a)(1a)(2a) |
| `fullwalk` | `path.slice(0, 1)` を `path` へ(今日の姿) | (3a)(3b)(3c)(6b) |
| `handcoord` | STEPS を手書き表にし 1 点だけ +8px | (0b)(1b) |
| `nodemut` | 刻み点を `NODES` へ `kind:"site"` で注入 | (1d)(5c) |
| `linemut` | 点線を `walkEdges` の 15 区間で引き直す | (2b) |
| `stepclass` | マーカーに `.worldNode` を着せる | (0c) |
| `hopnone` | 2 ホップ以上の行き先では 1px も動かない | (3a)(3c) |
| `pathswap` | `findPath` を `findWalkPath` へ差し替え | (5a) |
| `retreatdead` | `?walkstep=0` を無視(sessionStorage を読まない) | (6a)(6c) |
| `retreatkills` | 撤退時に `WORLD_MAP.STEPS` をデータごと空に | (6d) |
| `fireevent` | 刻み点到着で確認ダイアログを開く | (4c) |
| `arrivedup` | `walkPath` の中からフックを呼び 1 ホップで 2 回鳴らす | (4b) |

⭐⭐⭐ **変異を書く段階で「当たっているのに緑」を机上で 3 本潰した**(全部ドライバのコメントに残した):

1. `nosteps` を「`STEP_MAX_PX` を大きくする」で書くと、cap を**ページから読む** (1a) が
   「全区間 <= 99999」で**緑のまま通る**。→ **分割数のほう**を 1 に固定する。
2. `nodemut` を `kind:"step"` で注入すると `buildNodes` が札を作らないので (5c) が空振り。
   → **`kind:"site"`** で注入する。
3. `arrivedup` で `dest` を `at` と同じにすると `arrived=true` になり、1 ホップ目が `phlan` のとき
   `onArriveNode(phlan)` → `location.href="town.html"` で**ページごと死ぬ**。すると (4b) は
   「母集団が足りない」で赤くなり、**欠陥を検出したのか装置が欠けたのか読めない**。
   → `dest` を別値にして `arrived=false` へ倒す。

⚠⚠ **走らせて初めて分かった罠が 1 つ**: `retreatkills` は `WORLD_MAP.STEPS` を空にするが、
`walkEdges()` は `stepsOfEdge()` を**再計算**するので鎖には刻み点 id が残る。
すると `findWalkPath` の `wdist` が `undefined.x` で**投げ**、観測関数ごと例外で抜けて
**(fatal) 1 本になり残りの変異が 1 本も回らなかった**(1 回目の `--negative` は 18/25 で停止)。
⭐⭐⭐ **恒久教訓: 変異は「実装が壊れた世界」を作るので、観測側の `page.evaluate` は
投げる前提で書く**(`readPlay` / `safeEval` / `snap` の 3 箇所を try/catch 化 + 各節の頭で
「まだ world.html に居るか」を確かめて畳む形にした)。⛔ 受入条件は 1 つも弱めていない。

### 12-5. 残り(実機/実感 — §9 の 6 項目)

⛔ 機械では測れないので**ユーザーの実機確認が必要**:

1. 港町フラン → 廃坑 の 4 タップが「面倒」でなく「旅」に感じるか(⭐ 面倒なら `STEP_MAX_PX` 1 定数を緩める)
2. 刻み点の印(6px)が点線の点(18px おき)と紛れないか / 逆にうるさくないか
3. 遠い拠点を押したとき、緑の輪が最終目的地に残っているのが「まだ着いていない」と読めるか
4. iPhone 縦持ち(compact / zoom 実測 ~0.76)で 32px の当たり判定が押しやすいか
5. 連打で 2 ホップ進むか / 1 回目を取りこぼさないか
6. 唯一の刻み点 `lake_n__lakeside@1` (896,416) が雪山の斜面の上に乗っていて絵として不自然でないか
