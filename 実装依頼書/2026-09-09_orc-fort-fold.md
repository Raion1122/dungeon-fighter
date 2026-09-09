# #63 砦(orc-fort)を卓上マップ 2 枚へ畳む — 旧タイプ MAP 全廃 F2

- **起草**: 2026-09-09(計画窓) / **ステータス**: **承認済**(2026-09-09 ユーザー承認)
- **発注の担当**: **実装窓**(2026-09-09 ユーザー決定)。`codex-map-request` の 4 段を通しで回す
- **触るファイル**: `index.html` / `tools/driver_grid_s2.js` / `tools/driver_graph_p6.js` /
  `tools/driver_spawn_not_on_gate.js` / `tools/driver_graph_p7.js` /
  `tools/verify_fort_fold.js`(新規) / `assets/room_orc-fort_n4_map.jpg`(新規) /
  `assets/room_orc-fort_n7_map.jpg`(新規)
- ⛔ **触らないファイル**: **今のところ無し**。2026-09-09 時点で `git status` は clean、
  `git log --oneline origin/main..HEAD` は **0 本** = **並走窓ゼロ**。
  ⚠ ただし**着手時にもう一度測ること**(clean の鮮度は数分で腐る)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- **前提チケット**: #62(沼地 F1)完了・push 済 `f5d9e6d`。本件はその型をなぞる
- **開発計画書**: `dev-meetings/2026-09-09_orc-fort-fold.md`(第1段 候補出し + 第2段 実装計画)

---

## 1. 目的

シナリオ4「廃墟の砦 orc-fort」は今も **7x6 / 9x6 のタイル床の小部屋 8 個**で構成されている。
2026-09-08 のユーザー決定「旧タイプ MAP は全廃」の **F2**(F1 沼地 = #62 は完了済)。
砦を**卓上大部屋 2 枚だけ**へ畳み、走行を 8 部屋 → 2 部屋に短縮する。

**ユーザー決定(2026-09-09 / 第1段の候補④)**:

- 休眠する古代王国の守護者 5 体は、**畳んだ構成に載せない**。`?fortfold=0` の旧構成にだけ残す
- ⭐ 不採用になった案(後で守護者を戻すときの設計案としてそのまま残る):
  - **候補①** 守護者を「仕掛け」にし、P9 の寄り道到達をトリガに 5 体を湧かせる
    → 前例の無い新規配線が要る
  - **候補②** 廟を独立ノードで残す(発注 3 枚)→ 発注が 1 枚増える
  - **候補③** `initGuardians` に `passiveNpc` を足す(1 行)
    → ⛔ **単独では成立しない**(§2-2 の (3) により誰も近づかない)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 砦の現状(2026-09-09 実測)

| ファイル:行 | 何 |
|---|---|
| `index.html:37474` | `buildOrcFortRun()` = `buildP6Run("orc-fort","orc-fort", {n0..n7})` |
| `index.html:37150` | `buildP6Run` の `return` は **8 ノード固定**(n0..n7)。⭐ **畳み済みではない** |
| `index.html:5796-5797` | 旧絵 `room_orc-fort_n4.jpg`(tileBounds `[11,33,16,39]`)/ `_n7.jpg`(`[11,32,16,40]`) |
| `index.html:10574` | 罠 **5** / 隠し宝箱 **4** / `clearXp` 1000 / `perceptionDC` 16 |
| `index.html:3421-3423` | `TILE_SIZE=96` / `MAP_W=72` / `MAP_H=28`(大部屋の上限) |

⚠ **ノード数は spec ではなく `build*Run` の戻り値で数えた**(#62 の教訓。廃坑と森は spec を
読むと 8 に見えるが既に畳み済みだった)。砦は**戻り値も 8** = 未畳み。

**ノードの kind と敵の在庫**(`index.html:37475-37494` を実測):

| ノード | 名前 | kind | 敵 |
|---|---|---|---|
| n0 | 崩れた城門 | start | 0 |
| n1 | 中庭 | combat | orcBerserker x2 / orcGrunt x1 = **3** |
| n2 | 兵舎跡 | **search** | orcGrunt / orcArcher = **2** |
| n3 | 武器庫 | **loot** | orcGrunt / orcArcher = **2** |
| n4 | 練兵場 | combat | orcBerserker / orcGrunt / orcShaman x2 = **4**(旧絵つき) |
| n5 | 井戸端 | **rest** | 0 |
| n6 | 忘れられた廟 | event | stoneGolem / stoneLegionary x2 / gargoyle x2 = **5**(休眠) |
| n7 | 将軍の間 | boss | orcBerserker / orcGrunt = 2 + **garrock** (旧絵つき) |

⇒ 畳んだ後の道中(n4)に入る敵 = **11 体**(旧 n1 の 3 + 旧 n2 の 2 + 旧 n3 の 2 + n4 の 4)。
内訳 **orcBerserker 3 / orcGrunt 4 / orcArcher 2 / orcShaman 2**。⭐ 種類も数も変えない。
⭐ 沼を畳んだ後の n4 も**ちょうど 11 体**で、30x21 の絵に 2 群で収まっている = 同じ規模で足りる。

**卓上マップの在庫**: `assets/` に `room_*_map.jpg` は **4 枚**(森 n7 / 沼 n4・n6・n7)。
砦は **0 枚** ⇒ **発注 2 枚**。⚠ 廃坑の 2 枚は `room_goblin-mine_n0.jpg` / `_n1.jpg` で
`_map` 接尾辞が無い(命名は #11 以降が `_map.jpg`)。**新規は `_map.jpg` に揃える**。

### 2-2. ⚠⚠⚠ 罠① — 休眠する守護者を大部屋へ移すと「クリア不能」になる

4 つの実測が噛み合う。**候補④を選んだ理由そのもの**であり、
**将来 守護者を戻すときに必ず読み返す節**。

| # | 実測 | 場所 |
|---|---|---|
| (1) | `initGuardians` は `inactive` と `dormant` を立てるが **`passiveNpc` は立てない** | `index.html:24166` |
| (2) | `isNodeSettled()` は `enemies.every(e => !e.alive \|\| e.passiveNpc)` を要求 | `index.html:36329` |
| (3) | `findNearestAliveEnemy()` も heroAI の ④ も **`e.inactive` を除外**する | `index.html:18643` / `:18984` |
| (4) | `GUARDIAN_AWAKEN_RADIUS = 270`px = **2.8 タイル**。しかも `tryAwakenGuardian` は `encounterActive \|\| encounterRunning` の間は必ず return | `index.html:24162` / `:24205` |

(3) により AI は休眠中の守護者へ**歩かない**。heroAI の ④ が `globalEnemy = null` を返すと
`targetX = null; return;` で**その場に停止する**。(4) により覚醒しない。(2) により
`isNodeSettled()` が永久 false ⇒ **出口の矢印が出ない = クリア不能**。
⚠ 既知欠陥 `spawn_on_gate_stall`(2026-08-23 決着)と**同型**。

⭐ **今 n6 が詰まないのは、7x6 の小部屋で入場地点 (35,13) から守護者 (36,13)/(34,12) まで
1〜2 タイルしかないという幾何の偶然**。大部屋へ移した瞬間に成立する。

⛔ **P9 の寄り道では解けない** — 寄り道の提示(`index.html:36460-36469`)は
`isNodeSettled()` の**後ろ**にあるので、守護者が居る限り寄り道そのものが出ない。
⇒ 2026-09-08 の計画書「分岐の楽しさは P9 の部屋内寄り道で代替する」は**この 1 点で崩れている**。

⭐ この罠は §9 の変異 **m4**(n6 を畳んだノード表へ足す)として装置に内蔵させる。

### 2-3. ⚠⚠⚠ 罠② — `driver_graph_p7` は「砦がまだ旧タイプであること」を土台にしている

`tools/driver_graph_p7.js` の §2 / §4 は **砦を測定台にしている**。理由がコメントに書いてある:

    // §4 の巡回に使うシナリオ。⚠ 廃坑は n1 が event でダイアログ待ちに入るので使わない
    const TOUR_SCEN = 'orc-fort';                                        // :64
    //   台にすべきなのは「7x6 の道中 + 9x6 のボス」を持つ分岐グラフ = §4 と同じ TOUR_SCEN  // :275

砦を畳むと **3 箇所が赤くなる**:

| 行 | assert | なぜ赤くなるか |
|---|---|---|
| `:345` | `(2z) ★装置: 台の分岐グラフ (orc-fort) が n1 / n4 / n7 を持っている` | **n1 が消える** |
| `:427` | `T.n4.paintings[0].src.indexOf('orc-fort_n4') >= 0` | 絵が `_n4_map.jpg` へ替わる |
| `:428` | `T.n7.paintings[0].src.indexOf('orc-fort_n7') >= 0` | 同上 |

⭐⭐⭐ **これは #62 では 1 度も踏んでいない**(沼を畳んでも `TOUR_SCEN` は砦のままだった)。
**F2 で初めて赤くなる本命。**

**言い直し方(⛔ 期待値を緩めない)**: `driver_graph_p6` / `driver_spawn_not_on_gate` と
**同じ「腕の移設」**で解く —— §2 / §4 の 2 箇所のブート URL に `&fortfold=0` を足す。
⭐ そうすれば assert 本体も絵の src も **1 文字も書き換えずに済む**(旧絵は撤退の腕に生き続ける)。
⛔ `TOUR_SCEN` を `undead-temple` へ移す案は採らない —— **F3 で神殿も畳むので同じ問題が再発する**。

### 2-4. 既存 golden の母集団 — 「腕の移設」で済むものと、表の更新が要るもの

`orc-fort` を含む実行可能ドライバ = **40 本**(`grep -rl "orc-fort" tools/*.js | wc -l`)。
そのうち**構造を握っている 4 本**を名指しする。⭐ **#62 が F2 のために受け皿を用意している**。

| ドライバ | 今の姿 | F2 でやること |
|---|---|---|
| `driver_graph_p6.js:365-368` | `FOLDED` 表に 森 / 沼の 2 行 | ⭐ **1 行足すだけ** `'orc-fort': { arm: '&fortfold=0', sw: '?fortfold', nodes: 2, entry: 'n4' }`。装置 assert の id は `F.sw.slice(1)` から導出されるので `(1fortfold-orc-fort)` が自動で立つ |
| `driver_grid_s2.js:87` | `UNTOUCHED = ['orc-fort','undead-temple','dragon-lair']` | `'orc-fort'` を外し、`:703-717` の沼と同型の `?fortfold=0` の腕を 1 本足す。⭐ **golden のキーも assert 本体も不変** |
| `driver_spawn_not_on_gate.js:65-70` | `NODES_EXPECTED['orc-fort'] = 8` / `FOLD_ARM` に 森・沼 | `8` → **`2`**(#62 のコメントどおり「実際に遊ばれる姿の契約表なので意図的に更新」)+ `FOLD_ARM` に `'orc-fort': '?fortfold=0'` を足す |
| `driver_graph_p7.js:64,275-278,388-391` | 砦を測定台に使用 | §2-3 のとおり **ブート URL に `&fortfold=0`** |

`driver_graph_p6.js:360-362` に #62 が残した明文:

    ⚠ 畳むシナリオが増えたら **この表に 1 行足すだけ**で済む形にした
      (F2 砦 / F3 神殿 / F4 竜の巣が控えている)。

⚠⚠ **母集団の見積もりは必ず不足する。** #62 は依頼書のリスト外で **5 本**が赤くなった
(通算 9 本)。上の 4 本は「確実に赤い」だけで、**40 本を直列で全部走らせること**。
⛔ 並列は偽の赤を生む。

低リスクだが実走が要るもの(実測で構造非依存と判断):
`driver_grid_p3b.js:69`(OTHER_STAGES = 開放 0 部屋の母集団)/
`driver_graph_sce1.js:824`(mapDef.id の接頭辞だけを見る)/
`driver_paint_blocked.js:59`(テーマ名であってノード構成に依存しない)。

### 2-5. 数値の実測

| 対象 | 実測値 | 出所 | → 採用 |
|---|---|---|---|
| 守護者 5 体の XP | **2900** | stoneGolem 1500 + stoneLegionary 420x2 + gargoyle 280x2 | 消えるが下記のとおり自動走行では 0 |
| 砦の総 XP(守護者なし) | **4720** | オーク 13 体 2720 + garrock 1000 + clearXp 1000 | 変わらない |
| 新規ドライバの base port | **10201** | 使用中の最大は `10188`(`grep -rhoE "1[0-9]{4}" tools/*.js`) | `10201`(10201..10208 を掴む) |
| 敵の索敵 | `DETECTION_RANGE = 1200`px = **12.5 タイル** | `index.html:17618` | 群を分けるなら 13 タイル以上 |
| 近接の交戦 | `engagePx = 400` = **4.17 タイル** | #53 / #62 の実測 | 入場から最寄り敵は **7 タイル以上** |

**⭐ XP が減らないことの裏取り**(依頼書の数字を信じずに経路を測り直した):
`buildP6Run` の exits は `n0: [n1,n2,n3] / n1: [n4,n5] / n4: [n7]`。
`?graph=auto` と `?autoplay` は**どちらも `opts[0]` を選ぶ**(`chooseExit` / `showCharChoice`。
#62 の実装コメントが明文化)⇒ **既定の経路は n0 → n1 → n4 → n7 で n6 を踏まない**。
⇒ **自動走行の XP は 1 も減らない**。減るのは手で n2 → n6 を選んだときの上限 2900 だけ。

**発注する寸法の根拠**:

| 枚 | 用途 | 寸法 | 根拠 |
|---|---|---|---|
| 1 | 道中(n4) | **21 行 x 31 列** | 沼 n4big(21 行 x 30 列)が同じ **11 体**を 2 群で収めている実績。⚠ **行数は奇数**(`nodeGateTile` の `Math.floor` で行数が偶数だと入場行が 1 マスずれる = #58 で踏んだ) |
| 2 | ボス(n7) | **19 行 x 29 列** | 沼 n7big(20 行 x 29 列)と同幅・**行数だけ奇数に是正**。護衛 2 + 単騎ボス |

⚠ `MAP_W=72` / `MAP_H=28` の中に収まる(21 < 28 / 31 < 72)。

**再測定コマンド**:

    grep -n "return buildP6Run" index.html
    sed -n '37474,37496p' index.html                       # 砦の spec
    grep -rl "orc-fort" tools/*.js | wc -l                 # 母集団の本数
    grep -rhoE "1[0-9]{4}" tools/*.js | sort -n | uniq | awk '$1>=10100'   # port の空き
    sed -n '365,370p' tools/driver_graph_p6.js             # FOLDED 表
    sed -n '64p;275,278p;345p;427,428p' tools/driver_graph_p7.js

### 2-6. `?fortfold` の名前衝突

`grep -rn "fortfold\|FORT_FOLD" index.html tools/*.js` = **0 件**。衝突なし。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` = `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`。
本件は **`index.html` を触るので必ず鳴る** ⇒ §11 のとおり **必須**。
⭐ プレイヤー向けの要約は実在する(「砦が卓上マップ 2 枚の構成になった」= 画面がまるごと変わる)。
嘘の行をでっち上げる必要はない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `assets/room_orc-fort_n4_map.jpg` | 新規(codex1 納品) |
| `assets/room_orc-fort_n7_map.jpg` | 新規(codex1 納品) |
| `index.html` | `FORT_FOLD_OFF` / `FORT_FOLDED` / `ROOM_PAINTINGS_DEF` に `n4big`・`n7big` / `buildOrcFortRun` の畳み込みと 11 体の移設 / `NODE_EXTRA_SPAWN_KINDS` の兼務宣言 |
| `tools/driver_graph_p6.js` | `FOLDED` 表に **1 行**(§2-4) |
| `tools/driver_grid_s2.js` | `UNTOUCHED` から `orc-fort` を外し `?fortfold=0` の腕を足す |
| `tools/driver_spawn_not_on_gate.js` | `NODES_EXPECTED` を 8 → 2 / `FOLD_ARM` に 1 行 |
| `tools/driver_graph_p7.js` | §2 / §4 のブート URL に `&fortfold=0` |
| `tools/verify_fort_fold.js` | 新規(受入・base 10201) |

⛔ **`assets/room_orc-fort_n4.jpg` / `_n7.jpg`(旧絵)は削除しない**。`?fortfold=0` の行き先。
⛔ **`index.html:24166` `initGuardians` は 1 行も触らない**。
⛔ **`js/df-mapdef.js` は触らない**予定 —— ⚠ ただし #58 の教訓で「大部屋化では 3 度崩れている」
ので、**触る必要が出たら黙って諦めずに理由を §13 へ書く**。

---

## 4. STEP0 — 着手前の基準取り(本番を 1 文字も触る前に)

⭐⭐⭐ #61 で効いた作法。**赤の予想は必ず外れる**ので、本番を触る前に色を控える。

    # 40 本を直列で。exit / 集計行 / FAIL 行の集合を全部ファイルへ落とす
    for f in $(grep -rl "orc-fort" tools/*.js); do
      echo "=== $f ==="; node "$f"; echo "exit=$?"
    done 2>&1 | tee /tmp/fort_before.txt

⚠ **この出力が唯一の基準**。STEP4 の後に同じコマンドを回して差分を取る。
⚠ 走らせた**日付を §13 に書く**(基準はすぐ腐る)。

---

## 5. STEP1 — 卓上マップ 2 枚を codex1 へ発注

**担当 = 実装窓**(2026-09-09 ユーザー決定)。`codex-map-request` スキルの **4 段**
(発注 → 受入 → 焼き付け → MASK)を実装窓が通しで回す。STEP1 = その第 1 段。
⛔ **発注文は起草で止め、ユーザー承認が出るまで投下しない。**
⭐ 納品待ちが発生するので、**投下したら STEP0 と STEP4 を先に進める**
(この 2 つは絵に依存しない)。STEP2 / STEP3 は絵が来てからでないと 1 マスも決められない。

**道中(`room_orc-fort_n4_map.jpg`)— 21 行 x 31 列**
- 廃墟のオークの砦の**内部**。見下ろし。西の**崩れた城門**から入り、中庭 → 兵舎跡 → 東の練兵場
- **東辺の中点**が将軍の間への出口(石の大扉)。⚠ 西端から東端まで**歩ける帯を 1 マスも切らさない**
- ⭐ **中庭の隅に、崩れた古代王国の廟と割れた石像の足元**を描く
  (守護者を後で戻すときの置き場所。⚠ 今回は**絵だけ**で敵は置かない)
- 屋内なので `outdoor: true` は付けない(フォグオブウォーを効かせる)

**ボス(`room_orc-fort_n7_map.jpg`)— 19 行 x 29 列**
- 主塔の広間。**西から入り**、東の壇上に玉座と軍旗。単騎 + 護衛 2 が正面から対峙する画

⚠ **行数は必ず奇数**(#58 の入場行ズレ対策)。⚠ 縦横比は rect と完全一致させる
(`paintingAspectFits` が `rw*bh === rh*bw` を要求)。

---

## 6. STEP2 — 納品の受入と焼き付け(`ROOM_PAINTINGS_DEF`)

`index.html:5748` の `"orc-fort": { ... }` へ `n4big` / `n7big` を足す。**沼 `n4big`(`:5564`)が手本**。

- `tileBounds` は `[r1, c1, r2, c2]`(**行が先**)。**rect と同値**にする
- `sealRing: true`(外周 1 タイルを通行不能に)
- `gates` は**必要な口だけ**。道中の東の出口が辺の中点で床に落ちるなら書かない
- `blocked` は**絵に当て直す**(⛔ 写経しない)。5 規則は沼 `:5570-5590` の注記が正:
  ① 外周に `#` を書かない ② 平置きの物は跨げる ③ 通れない地形は塞ぐ
  ④ **ゲートへのレーンを明示的に空ける** ⑤ 敵/ボスを置くタイルは必ず `.` にする
- ⚠⚠ 連結の検査は **4 近傍**で(本番の `aStar` は斜めを踏まない)。本番の `isTileWall` で実測する

---

## 7. STEP3 — 畳み込みの配線(`index.html`)

**(a) 撤退スイッチ** — `SWAMP_FOLD_OFF`(`index.html:4136`)の**すぐ隣**に置く。
⚠⚠ **置き場所が肝**。`RUN` は `:4618` で即時評価され、そこから `buildOrcFortRun` が呼ばれるので、
後ろで宣言すると**一時的死角(TDZ)**で ReferenceError → 黙って従来の姿へ落ちる。

    const FORT_FOLD_OFF = (() => {
      try { return new URLSearchParams(window.location.search).get("fortfold") === "0"; }
      catch (e) { return false; }
    })();
    /* ★[#63] 「砦は畳まれているか」の唯一の真偽。4 箇所 (グラフの形 / 兼務の台帳 /
     *   移設した 11 体 / 大部屋 2 枚) がすべてこれ 1 本を読む。
     * ⭐ 沼 (#62) と違い派生が要らない —— あちらは大部屋が #53/#58 の別チケットで
     *   先に入っていたので ?swampmap=0 との AND が必要だった。本件は絵も畳みも同じ
     *   チケットなので、1 本で「畳み + 大部屋 2 枚」がまとめて戻る。 */
    const FORT_FOLDED = !FORT_FOLD_OFF;

**(b) 大部屋の適用** — `buildOrcFortRun` の spec で n4 / n7 を出し分ける。
⚠⚠ **`FORT_FOLDED` が false のときは旧絵と 7x6 / 9x6 のまま 1 バイトも変えない**
(§9 の (7c) と `driver_grid_s2` の golden がそれを直接測る)。

    n4: FORT_FOLDED
      ? { name: "練兵場", rect: <道中の rect>, paint: "n4big", density: 0,
          start: <入場地点>, slots: [...4 体 + FOLD_MOVED_FORT] }
      : { name: "練兵場", slots: [[34,13,"orcBerserker"], [36,15,"orcGrunt"],
                                  [38,12,"orcShaman"], [39,14,"orcShaman"]] },

⛔ **`density` を `|| 1` で書かない**。`0` は falsy なので既定 1 へ黙って戻り、
すでに描き込まれた絵の上に scenery が湧く(沼 `:5544` の注記)。
⛔ **`start` を既定のままにしない**。`buildNode` は起点タイルを問答無用に床へ彫るので、
入場地点へ寄せないと **blocked マスクに無言で穴が開く**。

**(c) 11 体の移設** — 沼の `FOLD_MOVED_N4`(`index.html:37303`)が手本。

    /* ★[#63] 旧 n1「中庭」/ n2「兵舎跡」/ n3「武器庫」に居た 7 体 + n4 の 4 体 = 11 体。
     *   ⭐ 体数も種類も変えていない (orcBerserker 3 / orcGrunt 4 / orcArcher 2 / orcShaman 2)。
     * ⚠ 畳んでいないとき (?fortfold=0) は 1 体も足さない (旧構成では n1/n2/n3 に居るので二重に湧く)。 */
    const FOLD_MOVED_FORT = FORT_FOLDED ? [ ...7 体... ] : [];

⚠ **座標は絵が来てから、本番の `isTileWall` / `aStar` で全タイル実測して決める**。要件:
- 全部が blocked マスクで `.`(⚠ 敵スポーンは `applyPaintingBlocking` の門番 `skipSpawn` を
  素通りするので、**塞いだタイルに置くと絵に穴が開く**)
- 入場地点から**全員へ 4 近傍 aStar で到達可能**
- 入場地点から最寄りの敵まで **7 タイル(672px)以上**(交戦距離 400px より遠い = 入場ナレの
  最中に乱戦が始まらない)
- ⭐ **群は 2 群まで**を前提に置く(13 タイル以上離す)。3 群が置けるかは絵が来てから測る
- ⛔ **出口ゲートのタイルに置かない**(閉扉に埋まって `isNodeSettled()` が永久 false)

**(d) グラフの畳み込み** — `buildOrcFortRun` の末尾。沼 `index.html:37424-37466` が手本。

    if (!FORT_FOLDED) return run;        // ?fortfold=0 = 8 ノードの旧構成
    /* ★[#63] 8 ノード → 2 ノード。
     *     n4 練兵場 (start = entry) ── right → n7 将軍の間 (boss)
     * ⛔ mapDef はここで組み直さない (buildP6Run が作ったものをそのまま取り出す)。
     * ⚠ id は "n4" / "n7" のまま。⚠ kind:"boss" はグラフにちょうど 1 つ (validate が要求)。 */
    const pick = (id) => run.nodes.find(n => n.id === id);
    const n4 = pick("n4"), n7 = pick("n7");
    return { entry: "n4", nodes: [{ id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits }, n7] };

⚠ `n4.exits` は `buildP6Run` が作った `right → n7`(`at = P6_RIGHT [39,13]`)。
**大部屋にしたら辺の中点が動く**ので、`nodeGateTile` と食い違わないことを必ず測る
(食い違うと「矢印は絵の扉・遷移は辺の中点」という**開かない扉**が残る)。

**(e) 罠と宝箱の兼務宣言** — `index.html:4198` の `NODE_EXTRA_SPAWN_KINDS` へ。

    if (FORT_FOLDED) t["orc-fort"] = { n4: ["search", "loot"] };

⛔ **忘れると罠 5 個と隠し宝箱 4 個が無言でゼロになる**(森 #16 で実際に踏んだ)。
⚠ **森の 3 行は 1 バイトも動かさない**(`driver_grid_s2` の変異 `nosearchkind` / `nolootkind` が
`? { "bandits-forest": …` の行を**逐語で握っている**)。

---

## 8. STEP4 — 既存 golden の言い直し(⭐ 新規受入より**前**に置く)

⭐ #61 の教訓 = **既存 golden の言い直しを新規受入より前に置く**。§2-4 の 4 本を順に。
⛔ **どれも「期待値を緩める」ことはしない。** 腕を移すか、契約表を意図的に更新するかのどちらか。

1. `driver_graph_p6.js` — `FOLDED` 表に 1 行(assert 本体は 1 文字も触らない)
2. `driver_grid_s2.js` — `UNTOUCHED` から外し、`:703-717` と同型の `?fortfold=0` の腕を足す
   (`(8y)` / `(8y2)` に相当する装置 assert 2 本 + 8 ノードの golden 突き合わせ)
3. `driver_spawn_not_on_gate.js` — `NODES_EXPECTED['orc-fort']` を **8 → 2** / `FOLD_ARM` に 1 行
4. `driver_graph_p7.js` — §2(`:278`)と §4(`:391`)のブート URL に `&fortfold=0`

---

## 9. 受入条件 — `tools/verify_fort_fold.js`(新規・base **10201**)

**方針**: 「畳んだ姿」と「`?fortfold=0` の姿」を**両方ブートして突き合わせる**。
⛔ 引き算や写経で作らない —— 実装とドライバが同じ間違いを共有すると両方緑になる。
⭐ **観測するのは構造・体数・座標・到達性**。絵の出来と難易度は観測しない(後述)。

### §0 装置(先に母集団を確かめる)

- **(0a)** 既定の腕で `orc-fort` のグラフが **active** かつ **ノード 2 件 `["n4","n7"]` / entry=n4**
  ⭐ **これが無いと以下の全 assert が空振りで永久緑になる**
- **(0b)** `?fortfold=0` の腕で **8 件 / entry=n0** が実在する(= 腕が本当に効いている)
- **(0c)** 敵の顔ぶれは**本番の `RUN` から引く**(ドライバ側の期待表を実装から読み取らない)

### §1 構造

- **(1a)** 既定の腕: ノード 2 件・kind が `start` / `boss`・`exits` が `n4 → n7`(dir=right)1 本
- **(1b)** `kind:"boss"` がちょうど 1 つ(`validate` の要求)
- **(1c)** `lintRun` が 0 件(`graph-gate-not-floor` / `graph-dir-mismatch` / `graph-painting-aspect`)

### §2 敵(**2 経路で突き合わせる**)

- **(2a)** 既定の腕の n4 の敵 = **11 体**、種類別に `orcBerserker 3 / orcGrunt 4 / orcArcher 2 / orcShaman 2`
- **(2b)** ⭐ **`?fortfold=0` の腕で旧 n1+n2+n3+n4 を実測して合計**し、(2a) と**種類別に一致**
  (⛔ 依頼書の表を写経しない。**両腕の実測どうしを突き合わせる**)
- **(2c)** ボスノードは護衛 2 + `garrock` で**両腕で完全一致**(1 ビットも動かしていない)

### §3 守護者(候補④の中身)

- **(3a)** 既定の腕で `stoneGolem` / `stoneLegionary` / `gargoyle` が **0 体**
- **(3b)** `?fortfold=0` の腕で **5 体**(n6 に生きている)

### §4 罠と宝箱(森 #16 の失敗の再現防止)

- **(4a)** 既定の腕で罠が **1 個以上**湧く(`NODE_EXTRA_SPAWN_KINDS` の兼務が効いている)
- **(4b)** 既定の腕で玄室の宝箱が **1 個以上**湧く
- ⚠ 個数の**期待値は焼かない**(乱数依存)。「ゼロでないこと」が契約

### §5 幾何(絵が来てから値が確定する)

- **(5a)** n4 / n7 の `rect` と `tileBounds` が**同値**
- **(5b)** `start` が入場地点(入る辺の中点 + `NODE_ENTRY_INSET(2)`)にある
- **(5c)** 11 体 + 護衛 2 + ボスの**全座標が本番の `isTileWall` で床**
- **(5d)** 入場地点から**全員へ 4 近傍 aStar で到達可能**(孤立ゼロ)
- **(5e)** 入場地点から最寄りの敵まで **7 タイル(672px)以上**
- **(5f)** `exits[].at` が `nodeGateTile(rect, dir)` と**同じタイル**

### §6 詰み防止(⭐⭐⭐ §2-2 の罠を装置で締める)

- **(6a)** 既定の腕で、道中ノードに **`inactive` な敵が 0 体**
  ⭐ 「休眠する敵が本道に居ると `isNodeSettled()` が永久 false になる」という §2-2 の型を、
  **将来 誰かが守護者を戻したときに必ず赤くする**ための番人
- **(6b)** 既定の腕で `enemies.every(e => e.passiveNpc || !e.inactive)` が真

### §7 撤退

- **(7a)** `index.html?fortfold=0` → 8 ノード / entry=n0 / 旧絵 `room_orc-fort_n4.jpg`・`_n7.jpg`
- **(7b)** `?fortfold=0` で守護者 5 体が戻る(= §3b と同じ観測)
- **(7c)** ⭐ `?fortfold=0` の 8 ノードの mapDef が **`grid_s2` の golden と完全一致**
  (= 撤退先が 1 バイトも変わっていないことの二重の裏取り)

### ⛔ 測らないこと

- **絵の出来・構図・トンマナ**(目で見て決める。§10 の実機確認へ)
- **難易度 / クリア率 / 走行時間**(後追いのバランスチケットで測る。ここで縛ると調整できなくなる)
- **敵の配置の「良さ」**(床であること・到達できること・7 タイル空いていることだけが契約)
- **罠と宝箱の個数**((4a)(4b) は「ゼロでない」だけ)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **m1** | `NODE_EXTRA_SPAWN_KINDS` の `orc-fort` 行を消す | §4 (4a)(4b) |
| **m2** | `FOLD_MOVED_FORT` を `[]` に固定 | §2 (2a)(2b) |
| **m3** | `FORT_FOLDED` を `false` に固定 | §0 (0a) / §1 |
| **m4** | ⭐⭐⭐ **畳んだノード表へ `n6` を足す**(守護者を本道に置く) | **§6 (6a)(6b)** / §3 (3a) |
| **m5** | `exits[].at` を 1 タイルずらす | §5 (5f) / §1 (1c) |
| **m6** | `tileBounds` を 1 行ずらす(rect と食い違わせる) | §5 (5a) / §1 (1c) |
| **m7** | `start` を既定 `(36,13)` へ戻す | §5 (5b) |
| **m8** | `density: 0` を `d.density \|\| 1` へ書き換える | §5(scenery が絵の上に湧く) |

⭐ **m4 が §2-2 の罠の再現**。これが赤くならない装置は、この依頼書の一番重い知見を守れていない。

### 既存 golden の非退行(実装後に必ず走らせる)

**40 本を直列で**(§2-4 / STEP0 の基準と突き合わせる)。名指しの 4 本は必ず緑に戻すこと:

- `node tools/driver_graph_p6.js` / `driver_grid_s2.js` / `driver_spawn_not_on_gate.js` / `driver_graph_p7.js`
- `node tools/verify_swamp_fold.js`(#62・base 10181)/ `verify_party_four.js`(#61・base 10171)

⚠ 基準値は **2026-09-09 時点の記録**。走らせて違ったら、
**期待値を書き換える前に理由を突き止める**。⚠ #62 は**リスト外で 5 本**が赤くなった。

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレ音声が鳴らない)。

1. 砦を 1 周して**走行時間**を測る(8 部屋 → 2 部屋。沼 #62 の 3 部屋が基準)
2. 道中 31x21 で 11 体の乱戦が iPhone 1 画面(7.7x6.2 タイル)からはみ出したときの見え方
3. **ボス到達ナレ**が入室直後でなく玉座への接近で鳴るか
   (⭐ `bigRoom = !BOSS_APPROACH_OFF && isLargeRoomNow()`(`index.html:18914`)が
   部屋の大きさから自動で決まるので**新規配線はゼロ**。効いているかだけ目で見る)
4. `n5`「井戸端」の全快が消えたぶんの手応え(★★★ の砦では廃坑・沼より厳しく効く)
5. 大部屋 2 枚の初回ロード(沼 n4big 30x21 が出荷済 = 基準がある)
6. **中庭の隅の廟が絵として読めるか**(守護者を戻す場所として成立しているか)

---

## 11. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>廃墟の砦が卓上マップ 2 枚の戦場に</b> — 細切れの小部屋を廃し、崩れた城門から練兵場までを 1 枚の大きな盤面で戦い抜いて将軍の間へ挑む構成になった。"

---

## 12. やらないこと

- ⛔ **難易度・XP の再調整** — 4 人化(#61)+ rest 消失 + 部屋減 + 守護者消失を**合算して 1 度に**測る別チケット
- ⛔ **守護者 5 体の復活** — 第1段の候補①②③がそのまま設計案として残っている(会議記録の候補一覧)
- ⛔ **`initGuardians` への `passiveNpc` 追加**(候補③。単独では成立しない)
- ⛔ **F3 神殿 / F4 竜の巣**(それぞれ別チケット)
- ⛔ **P9 の寄り道(`detourSpotsFor`)の砦への配備**
- ⛔ **旧絵 2 枚の削除**
- ⛔ **`実装依頼書/README.md` への行追加** — ⚠ 2026-09-09 時点では**並走窓ゼロ**なので
  **承認と同時に足してよい**。用意してある行:

    | 63 | [2026-09-09_orc-fort-fold.md](2026-09-09_orc-fort-fold.md) | **承認済**(2026-09-09) | 0% | 砦を卓上マップ 2 枚(道中 + ボス)へ畳む = 旧タイプ MAP 全廃 F2。発注 2 枚 / 11 体を道中へ移設 / 守護者 5 体は畳んだ構成に載せない。⚠⚠⚠ **休眠する敵を大部屋へ移すとクリア不能**(`inactive` は AI の目標にならず `isNodeSettled` が永久 false)。⚠⚠ `driver_graph_p7` は**砦が旧タイプであることを測定台にしている**(3 箇所が赤)。撤退 `?fortfold=0` |

---

## 13. 実装結果

(実装窓が埋める)
