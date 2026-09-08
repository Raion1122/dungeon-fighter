# #62 沼地を卓上マップ 3 枚へ畳む(旧タイプ小部屋の廃止・F1)

- **起草**: 2026-09-08(計画窓 `claude-76`) / **ステータス**: **承認済**(2026-09-08 ユーザー承認)
- **触るファイル**: `index.html` / `tools/verify_swamp_fold.js`(新規) /
  `tools/driver_graph_p6.js`(言い直し) / `実装依頼書/README.md`
- ⛔ **触らないファイル**: `tavern.html`
  — **隣窓が依頼書 #60 を実装中**で、`tavern.html` に未コミット差分がある
  (2026-09-08 実測 `git status --short` = ` M tavern.html`)。
  本チケットは `tavern.html` を**一度も開かずに完了できる**(§2-9 で確認済み)。
  ⭐ **#61 とも衝突しない**(#61 = `tavern.html` / 本チケット = `index.html`)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- ⚠⚠ commit は **`git add <paths> && git commit -- <paths>` を 1 つの複合コマンドで**打つ。

---

## 1. 目的

ユーザーが沼地の入口(ノード **n0「沼の渡し」**)の画面を見て「**このタイプの MAP(旧タイプ)は
廃止**」と判断した。7 列 x 6 行のタイル床に壁リングを立てただけの小部屋のことで、
沼地にはこれが **5 部屋**残っている。

本チケットは **F1 = 沼地だけ**を対象に、旧タイプの小部屋をノードごと廃止し、
**既に持っている卓上大部屋 3 枚だけ**でシナリオ 3 を構成し直す。**新規の絵は 0 枚**。

**ユーザー決定(2026-09-08 / 開発会議 `dev-meetings/2026-09-08_party4-and-legacy-map-retire.md`)**:

- ✅ 候補①「**ノードを畳む**」を採用。手本は **廃坑 P8**(5 → 2 ノード)と **森 #16**(8 → 1)
- ✅ 「旧タイプ」には **7x6 / 9x6 の旧絵つき小部屋も含む**(ユーザー明言)
- ❌ 不採用: 候補②「汎用の大部屋を 1 枚作って 6 部屋に貼り分ける」
  — マスク・入場地点・敵再配置が部屋ごとに要るので**枚数ほど安くならない**(レンツ)
- ❌ 不採用: 候補③「通過部屋を挿絵 + 選択肢にする」(体験の作り替えになるので今回の範囲外)
- ✅ 分岐の楽しさは **P9 の部屋内の寄り道**(`detourSpotsFor`)で代替する方針で合意(ガイウス)
  — ただし**本チケットでは配らない**(§11。沼で型を固めてから F2 以降で)
- ⏭ 砦・神殿・竜の巣は **F2 / F3 / F4 として 1 シナリオ 1 チケット**。各 2 枚の発注が要る

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ⚠ 会議の第1段で数え間違えた — 廃坑と森は**既に畳み済み**だった

`buildGoblinMineRun`(`index.html` の `MINE_FOLD_OFF` の分岐)を読んだところ、**廃坑は P8 で
既に「n0 → n1 の 2 大部屋」へ畳まれていた**(`?minefold=0` のときだけ 5 ノードへ戻る)。
`buildP6Run` の spec だけを読むと 8 ノードに見えるので、**spec ではなく `build*Run` の戻り値**で数えること。

| シナリオ | 既定の姿 | 旧タイプの部屋 |
|---|---|---|
| 廃坑 goblin-mine | **2 大部屋**(P8 畳み済) | **0** |
| 森 bandits-forest | **1 大部屋**(#16 畳み済) | **0** |
| **沼地 lizard-swamp** | 8 ノード(n4/n6/n7 が大部屋) | **5** ← 本チケット |
| 砦 orc-fort | 8 ノード(n4/n7 は 7x6・9x6 の旧絵) | **8** (F2) |
| 神殿 undead-temple | 同上 | **8** (F3) |
| 竜の巣 dragon-lair | 同上 | **8** (F4) |

⭐ 残数 = **29 部屋 / 4 シナリオ**。うち沼地の 5 部屋が本チケット。

### 2-2. 沼地の現状(`buildLizardSwampRun` を読んで実測)

| ノード | kind | 幾何 | 敵 | 畳んだ後 |
|---|---|---|---|---|
| n0 沼の渡し | start | 7x6 素 | 0 | ⛔ **廃止** |
| n1 泥濘の道 | combat | 7x6 素 | **3**(lizardWarrior x2 / lizardRaider) | ⛔ 廃止・敵は移設 |
| n2 朽ちた桟橋 | search | 7x6 素 | **2**(lizardWarrior / lizardHunter) | ⛔ 廃止・敵は移設 |
| n3 沈んだ小舟 | loot | 7x6 素 | **2**(lizardWarrior / lizardHunter) | ⛔ 廃止・敵は移設 |
| **n4 蛇神の参道** | combat | **30x21 大部屋** `n4big` | 4 + 若い司祭(passive) | ⭐ **新しい entry** |
| n5 苔むした岩場 | rest | 7x6 素 | 0 | ⛔ **廃止**(全快が消える。§2-6) |
| **n6 蛇神の祭壇** | event | **34x22 大部屋** `n6big` | 0(ハイドラは噂フラグ) | ✅ 残す(行き止まり) |
| **n7 族長の巣** | boss | **29x20 大部屋** `n7big` | 2 + ボス | ✅ 残す |

**移設対象の敵 = 7 体**(3 + 2 + 2)。⭐ **体数も種類も変えない**(#53 / #58 / #11 の一貫した作法)。

**計測コマンド**:

    grep -n "function buildLizardSwampRun" -A120 index.html
    grep -n "n4big\|n6big\|n7big" index.html | head

### 2-3. ⭐⭐⭐ 絵の側が既に「北の口」を持っている — n4 → n6 はここを通す

`n4big` のマスク(21 行 x 30 列)を読むと、**参道の北に石段が 1 本、外周まで縦に貫通している**:

    "..............................",   //  0  外周 (フェザー帯)
    ".######..####################.",   //  1  北の沼。★col 7-8 = 祠へ登る石段 = 参道の北の口
    ".######..####################.",   //  2〜6 も同じ (col 7-8 だけ '.')
    ".######..###########....#####.",   //  7  ★北の親柱。口は石段 (7-8) と東の広場 (20-23)
    "..............................",   //  8  ★参道 1 行目
    "..............................",   //  9  ★参道の芯。左右の辺の中点がゲート

そして `n6big` のマスク(22 行 x 34 列)は、**南に降りる石段を 1 本持っている**:

    ".#############...################.",   // 18  柱の間の南壁。口は col 14-16 の扉 1 つだけ
    ".#############...################.",   // 19  扉の外の踊り場 (col 14-16)
    ".#############...################.",   // 20  部屋の外へ降りる南の石段 (col 14-16)

⭐ **「参道の北の石段 → 祭壇の南の石段」という接続が、絵の側で既に成立している。**
畳んだ後の n4 → n6 はこの口を通す。

⚠⚠ ただし **既定の辺の中点では通らない**。`nodeGateTile` は gates が無ければ辺の中点を返すので:

- n4 の `up` の既定 = `midC = floor((10+39)/2) = 24` → 絵ローカル **col 14** → マスク行 1 は `#`(北の沼)
  ⇒ **`ROOM_PAINTINGS_DEF["lizard-swamp"].n4big` に `gates: { up: [...] }` を足す必要がある**
- n6 の `down` の既定 = `midC = floor((10+43)/2) = 26` → 絵ローカル **col 16** → 石段の口(14-16)の**東端に入る**
  ⇒ ⭐ **こちらは既定のままで通る可能性が高い**。⚠ 必ず本番の `isTileWall` で確かめてから決める
  (通らなければ `gates: { down: [15, 21] }` を足す)

### 2-4. ⚠⚠⚠ n6 と n7 は「左辺の中点が入場口」という前提でマスクが彫られている

`n6big` / `n7big` のコメントに明記されている(どちらも `⛔ したがって gates は書かない`):

- `n6big`: 「左辺の中点 (10,13) = 絵ローカル (0,10) が n2 からの入場ゲート」
  「**行 10-12 を col 1 から col 29 まで 1 マスも切らさない**」
- `n7big`: 「効くのは n4 から来る入場口だけ = 左辺の中点」
  「**行 9-10 の乾いた石畳の帯だけは col 1 から col 27 まで 1 マスも切らさずに貫く**」

⇒ **n7 の入場は今のまま(n4 の右辺 → n7 の左辺)。1 ビットも触らない。**
⇒ **n6 だけが「左から入る」から「南から入る」へ変わる。** §2-3 の石段がその受け皿。

### 2-5. ⚠⚠ n6 から n7 へは**出口を置けない**(絵が閉じている)

`n6big` の右辺の中点 = (43,13) = 絵ローカル (33,10)。規則(4)で「行 10-12 は col 29 まで」空けてあり、
**col 30-32 は東の水で塞がれている**。⇒ `n4 → n6 → n7` の一直線は**原理的に組めない**。

**したがって畳んだ後の形は次の一択**:

    n4 (参道 = entry)
     +-- up    -> n6 (祭壇・行き止まり)      <- 隠し要素(ハイドラ)への寄り道
     +-- right -> n7 (族長の巣・ボス)

⭐ これは**現状の構造と同じ**(今も n2 → n6 は行き止まり / n4 → n7 がボスルート)。
「祭壇を選ぶとボスに会えない」は #62 で作る仕様ではなく、**元からの仕様**。

### 2-6. 畳むと消えるもの(ユーザーへ明示しておく)

| 消えるもの | 扱い |
|---|---|
| `kind:"rest"`(n5 苔むした岩場)の**入室で全快** | ⭐ 廃坑 P8 と同じ扱い = **復活させない**。補填は難易度の再調整チケットへ |
| `kind:"search"`(n2)の**罠** | `NODE_EXTRA_SPAWN_KINDS` で **n4 に兼務を宣言**(§5 STEP2) |
| `kind:"loot"`(n3)の**玄室の宝箱** | 同上 |
| 出口選択(羊皮紙)の回数 3 → 1 | 意図した縮小。分岐は F2 以降で P9 の寄り道へ移す |

⚠⚠⚠ **罠と宝箱の兼務宣言を忘れると、無言でゼロになる**(森 #16 で実際に踏んだ)。
現在の宣言は森のぶんだけ:

    const NODE_EXTRA_SPAWN_KINDS = S2_FOLDED
      ? { "bandits-forest": { n7: ["search", "loot"] } }
      : {};

⇒ 沼のぶんを足すときは**三項の形を崩して 2 シナリオを同時に持てる形**にすること。

### 2-7. 既存 golden の実測(2026-09-08 に素で走らせた)

| ドライバ | 素の結果 | 本チケットでどうなるか |
|---|---|---|
| `driver_graph_p6.js` | **246/246 PASS** | ⚠⚠⚠ **lizard-swamp のぶんが正しく赤くなる**。§1 骨格(8 ノード / entry=n0 / kind 列 / 出口の本数と向き / 部屋名)・§3(n0/n5 は敵 0)・§4(罠は search だけ / 宝箱は loot だけ)が対象 |
| `verify_swamp_novice.js` | 着手前に取る | n4 を測る(#53)。**敵を n4 へ足すと体数の assert が赤くなる可能性** |
| `verify_swamp_lair.js` | 着手前に取る | n7 を測る(#58)。⭐ `SNAP_FN` で `currentNodeId` を直接書いてノードへ飛ぶので、**n0〜n3/n5 を消しても到達できる** |

⭐⭐⭐ `driver_graph_p6` の赤は **#60 §2-11 と同型** = **仕様を変えたのだから赤くなるのが正しい**。
⛔ 期待値を写経して緑にせず、**lizard-swamp の節を「3 ノード / entry=n4」へ言い直す**。
内訳は `--scenarios lizard-swamp` で切り分けて取れる。

    node tools/driver_graph_p6.js                      # 2026-09-08 実測 = 246/246 PASS
    node tools/driver_graph_p6.js --scenarios lizard-swamp
    node tools/verify_swamp_novice.js
    node tools/verify_swamp_lair.js

⚠⚠ **「赤くなる本数」を grep で見積もらないこと**(#60 の実測 2026-09-08 / 実装窓からの申し送り)。
#60 は「ラベルを変えると golden 5 本が赤くなる」と起草したが、**実際に赤くなったのは 2 本**だった
(残り 3 本は別のボタン id / 別の URL の腕を掴んでいた)。⇒ 上の表の「lizard-swamp のぶんが
赤くなる」も**予想**。着手したら `node tools/driver_graph_p6.js` を素で走らせ、
**実際に赤くなった assert の ID を控えてから**言い直すこと。
⭐ 数えるときは語の grep で止めず、**ノード id を掴んでいる箇所と URL の腕**まで読む。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` を
読んだ結果: **鳴る**(`index.html` を触る)。

**書けるプレイヤー向けの要約は実在する**: 「沼地が卓上マップ 3 枚だけの構成になった」
= 画面で見える変化(タイル床の小部屋を一度も通らなくなる)。

### 2-9. 並走(2026-09-08 実測)

    $ git status --short
     M tavern.html
    ?? tools/verify_party_promises.js

隣窓は **#60 を `tavern.html` で実装中**。本チケットは `index.html` だけを触るので**衝突しない**。
⭐ **#61(`tavern.html`)とも衝突しない**ので、**本チケットは今すぐ着手できる**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `buildLizardSwampRun()` を畳む / `n4big` に `gates` / `NODE_EXTRA_SPAWN_KINDS` に沼を追加 / `SWAMP_FOLD_OFF` の新設 |
| `tools/verify_swamp_fold.js` | **新規**。§8 の受入 |
| `tools/driver_graph_p6.js` | lizard-swamp の節を言い直す(⛔ 期待値の写経ではない) |
| `実装依頼書/README.md` | 一覧行(§11 に文面あり) |

⛔ `tavern.html` は開かない。⛔ `js/df-mapdef.js` は**触らない**
  — ⚠ ただし過去 3 回「触らない」と書いて崩れている(#58 の教訓)。
  触る必要が出たら**理由を §12 に書いてから**触ること。

---

## 4. STEP1 — 撤退スイッチ `SWAMP_FOLD_OFF` を作る

`index.html` の `SWAMP_LAIR_OFF` の**隣**に置く。⚠⚠ 置き場所が既存スイッチの隣なのは
`RUN` の即時評価から `build*Run` が呼ばれるためで、離すと **TDZ で ReferenceError**。

    /* ★[#62] 沼地の 8 ノード → 3 ノードの畳みの撤退スイッチ。?swampfold=0 で
     *   n0/n1/n2/n3/n5 が戻り、entry も n0 へ戻る (畳む前の姿)。
     * ⚠ 大部屋 3 枚 (n4big/n6big/n7big) は**このスイッチでは戻らない**。
     *   それぞれ ?swampmap=0 / ?swampcrypt=0 / ?swamplair=0 が担当 (4 本は独立)。 */
    const SWAMP_FOLD_OFF = (() => {
      try { return new URLSearchParams(window.location.search).get("swampfold") === "0"; }
      catch (e) { return false; }
    })();

## 5. STEP2 — 罠と宝箱の湧き口を n4 へ兼務させる

`NODE_EXTRA_SPAWN_KINDS` を **2 シナリオを同時に持てる形**へ組み替える(§2-6)。
⚠ 森のぶんは **1 ビットも変えない**(`driver_graph_p6` §4 が測っている)。

    /* ★[#62] 沼を畳むと search(n2) と loot(n3) が消えるので、罠と玄室の宝箱の
     *   湧き口を n4 (参道) へ兼務させる。⛔ 忘れると無言でゼロになる (森 #16 で踏んだ)。 */
    const NODE_EXTRA_SPAWN_KINDS = (() => {
      const t = {};
      if (S2_FOLDED)       t["bandits-forest"] = { n7: ["search", "loot"] };
      if (!SWAMP_FOLD_OFF) t["lizard-swamp"]   = { n4: ["search", "loot"] };
      return t;
    })();

## 6. STEP3 — `n4big` に北の口(`gates.up`)を足す

§2-3 の実測にもとづき、`ROOM_PAINTINGS_DEF["lizard-swamp"].n4big` へ `gates` を足す。
⚠ **絵ローカル (col,row) + (10, 3) = global**(n4big のコメントにある写像。⛔ 他の絵から流用しない)。

    /* ★[#62] 北の口 = 祠へ登る石段 (絵ローカル col 7-8 / 行 0-7 が縦に貫通)。
     *   ⛔ up の既定 (辺の中点 = 絵ローカル col 14) は北の沼 '#' なので通れない。
     *   ⚠ 石段の 2 列のうちどちらを使うかは本番の isTileWall で確かめて決める。 */
    gates: { up: [8, 0] },

⚠⚠ 既存のコメント「⛔ したがって gates は書かない」は **left / right のこと**。
その注記を消さず、**up だけを足した理由を書き足す**(廃坑 n1 が `gates: { left:…, up:… }` で
同じことをしている = 手本)。

## 7. STEP4 — `buildLizardSwampRun()` を 3 ノードへ畳む

`buildP6Run` の spec を残したまま、**戻り値を組み替える**(森 #16 の `if (!S2_FOLDED) return run;` と同じ形)。

    if (SWAMP_FOLD_OFF) return run;          // ?swampfold=0 = 8 ノードの旧構成
    /* ★[#62] 8 ノード → 3 ノード。⛔ n4/n6/n7 の mapDef はここで組み直さない —
     *   buildP6Run が作ったものをそのまま取り出す (組み直すと #53/#58 の受入が別物を測る)。
     * ⚠ id は "n4"/"n6"/"n7" のまま。verify_swamp_novice / verify_swamp_lair の
     *   SNAP_FN が id を名指ししており、変えると 0 件ヒットで偽の緑になる。 */

**組み替えの内容**:

1. `entry` を **`"n4"`** にする
2. ノードは **n4 / n6 / n7 の 3 つ**だけ
3. n4 の `exits` を **2 本**にする: `up → n6`(§2-3 の石段) / `right → n7`(既定の辺の中点 = 今のまま)
4. n4 の `kind` は **`"start"`**(entry になるので)。⚠ `kind:"boss"` はグラフに**ちょうど 1 つ** =
   n7 だけ。`validate` / `lintRun` がそれを要求する
5. **旧 n1/n2/n3 の敵 7 体を n4 へ移す**(§2-2)。⭐ **体数も種類も変えない**

**移設先の座標の決め方**(⛔ 目分量で置かない):

- ⚠ 全タイルを**本番の `isTileWall` で確かめてから**書く。道具は既にある:

      node tools/probe_swamp_map.js --bfs --scen lizard-swamp --node n4
      node tools/probe_bandit_map.js --places --scen lizard-swamp --node n4 --entry 12,13

- ⚠ **マスクで塞いだタイルに敵を置かない**(`applyPaintingBlocking` の門番が素通しさせるので
  **絵に穴が開く**)
- ⚠ **入場地点 (12,13) から 7 タイル(672px)以上離す**(melee 交戦距離 400px。入場ナレの最中に
  乱戦が始まらないように)
- ⭐ **群と群は 13 タイル以上離す**(`DETECTION_RANGE` 12.5 タイル)。離せば**別々の戦闘**になり、
  「11 体が一度に襲ってくる」にはならない。既存の 4 体は 2 群(浅水の見張り / 東の広場)なので、
  **移設分で 3 群目**を作る形になる
- ⛔ **出口ゲートのタイル (39,13) と北の石段の口に敵を置かない** — 閉じた扉に埋まって
  `isNodeSettled()` が永久 false = **クリア不能**(lint の `graph-spawn-on-gate` が止める)

⚠⚠ **若い司祭 (`swampNovice`) の座標 (33,12) は動かさない**(#53 STEP3。広場の 2 体の脇に
置くのが要件で、離すと対話が一度も開かない)。

---

## 8. 受入条件 — `tools/verify_swamp_fold.js`(新規・base port **10181**)

⭐ 測るのは「**沼地が n4 →(n6 / n7)の 3 ノードになり、旧タイプの小部屋を一度も通らない**」。
⛔ 測らないのは**難易度**(クリア率・XP・戦闘時間)と**絵の見た目**。

### §0 装置(先に母集団を確かめる)

- **(0a)** `RUN.graph.nodes` が実際に読めて **3 件**、`RUN.graph.entry === "n4"`
  ⭐ **これが無いと全 assert が空振りで永久緑になる**
- **(0b)** 期待値を写経していない: ノード数は `buildScenarioRun("lizard-swamp")` の戻り値から数える
- **(0c)** ⚠ **旧構成が実在することを `?swampfold=0` 側で先に確かめる**(8 ノード)。
  これが無いと「元から 3 ノードだった」と区別できない

### §1 骨格

- **(1a)** ノードは `n4` / `n6` / `n7` の 3 つだけ。⛔ `n0`/`n1`/`n2`/`n3`/`n5` が **1 つも無い**
- **(1b)** `entry === "n4"` / `kind:"boss"` のノードがちょうど 1 つ(`n7`)
- **(1c)** n4 の exits は 2 本(`up → n6` / `right → n7`)。他の 2 ノードは行き止まり
- **(1d)** `DFMapDef.lintRun` が **error 0 / warning 0**、console に `[graph]` 警告が出ない

### §2 幾何(2 経路で突き合わせる)

- **(2a)** n4 → n6 の出口タイルが **`nodeGateTile` の戻り値と `exits[].at` で一致**する
  (⭐ 食い違うと「矢印は絵の口・扉は辺の中点」という開かない扉が生まれる)
- **(2b)** その出口タイルが**本番の `isTileWall` で床**(= 絵の石段の上に立っている)
- **(2c)** n6 の入場地点が本番の `isTileWall` で床(§2-3 の南の石段)
- **(2d)** n4 の入場 (12,13) から **n7 の出口ゲートまで本番の `aStar` で到達可能**
- **(2e)** n4 の入場から **n6 の出口ゲートまでも `aStar` で到達可能**(北の石段が塞がっていない)

### §3 中身

- **(3a)** n4 の敵の**体数と種類**が「元の 4 体 + 移設 7 体 = 11 体」(⛔ 増減させていない)
  ⭐ 期待値は `?swampfold=0` の n1+n2+n3+n4 の合計から**その場で導く**(数字を焼かない)
- **(3b)** 敵スロットが**1 つもマスクの `#` の上に無い**(絵に穴が開かない)
- **(3c)** 敵スロットが**出口ゲートのタイルに無い**(`graph-spawn-on-gate` の再発防止)
- **(3d)** 罠と玄室の宝箱が **n4 で湧く**(§2-6 の兼務宣言が効いている)
- **(3e)** 若い司祭 `swampNovice` が (33,12) に居る(#53 の不変条件)

### §4 恒等(非退行)

- **(4a)** n7 の敵・ボス・入場地点が **1 ビットも変わっていない**(#58 の受入がそのまま生きる)
- **(4b)** n6 のハイドラの座標 (38,14) と噂フラグの出し分けが変わっていない
- **(4c)** 他 5 シナリオのグラフが **1 ビットも変わっていない**
  (⭐ `JSON.stringify` で `?swampfold=0` と比較する)

### §5 撤退

- **(5a)** `index.html?swampfold=0` → **8 ノード / entry=n0** へ戻る
- **(5b)** `?swampfold=0` でも大部屋 3 枚はそのまま(4 本のスイッチが独立していることの検査)

### ⛔ 測らないこと

- **クリア率 / XP / 走行時間**(別チケット)
- **絵の見た目**(実機の目視。§9)
- **`kind:"rest"` の全快が消えたことの是非**(ユーザー決定済み)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nofold` | `SWAMP_FOLD_OFF` を常に true にする | §1 全般 |
| `nogate` | `n4big` の `gates.up` を消す(辺の中点へ戻す) | §2(2a)(2b)(2e) ⭐ **§2-3 の罠の再現** |
| `nokinds` | `NODE_EXTRA_SPAWN_KINDS` から沼の行を消す | §3(3d) ⭐ **§2-6 の罠の再現** |
| `dropfoes` | 移設した 7 体を 1 体落とす | §3(3a) |
| `spawnongate` | 敵 1 体を出口ゲート (39,13) へ置く | §3(3c) / §1(1d) |
| `entryn0` | `entry` を `"n0"` のままにする | §0(0a) / §1(1b) |

⚠ 変異の置換文字列は**必ず 1 行**に収める(`index.html` は CRLF なので `\n` を含むと一致しない)。
置換前後で**バイト長をずらす**(同じ長さだと注入検査が誤報する)。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/driver_graph_p6.js` → **改訂後 246 前後**
  ⚠ **2026-09-08 実測で素 246/246 PASS**。lizard-swamp の節を言い直すので本数は変わる。
  **変わった本数と、その内訳を §12 に書く**
- `node tools/verify_swamp_novice.js` → **着手前に素で基準を取る**(n4 に敵を足すので
  体数の assert が赤くなる可能性。⭐ 赤くなったら**移設が原因**であることを確かめてから言い直す)
- `node tools/verify_swamp_lair.js` → **1 本も赤くならないはず**(n7 を触らないため)。
  赤くなったら §12 に書く
- `node tools/driver_spawn_not_on_gate.js` → 敵をゲートに置いていないことの lint
- `node tools/driver_graph_p7.js` / `node tools/driver_paint_blocked.js` → 着手前に基準を取る

⚠ 基準値は 2026-09-08 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` では音が出ない)。

1. 沼地へ出発 → **いきなり参道(大部屋)から始まる**か。タイル床の小部屋を一度も通らないか
2. 参道の**北の石段が「祠へ続く道」に見える**か(矢印と扉がその上に立つか)
3. 祭壇へ入ったとき、**南の石段から入って自然か**(背中側から入る形になる)
4. 参道の敵 11 体が**一度に襲ってこない**か(3 群に分かれて順に戦うか)
5. 罠と宝箱が参道で出るか
6. **走行時間**が短くなった体感(8 部屋 → 3 部屋)

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>沼地が卓上マップ 3 枚の構成に</b> — 参道・祭壇・族長の巣だけになり、通り過ぎるだけの小部屋が無くなった。"

---

## 11. やらないこと

- ⛔ **砦・神殿・竜の巣**(F2 / F3 / F4。各 2 枚の発注が要る)
- ⛔ **P9 の部屋内の寄り道(`detourSpotsFor`)を沼へ配ること**(沼で畳みの型を固めてから)
- ⛔ **難易度・XP の再調整**(別チケット。#61 の 4 人化と `rest` 消失と部屋減が同時に効くので、
  合算してから 1 度で測る)
- ⛔ **`kind:"rest"` の全快の代替を作ること**(廃坑 P8 と同じ扱い = 作らない)
- ⛔ **新しい絵の発注**(本チケットは**発注 0 枚**で完結する)
- ⛔ **旧絵 `room_lizard-swamp_n4.jpg` / `_n7.jpg` の削除**(`?swampmap=0` などで要る)
- ⛔ **`tavern.html` を開くこと**
- ⛔ **`実装依頼書/README.md` への行追加は #60 が着地してから**。用意してある行:

    | 62 | [2026-09-08_swamp-fold-legacy-rooms.md](2026-09-08_swamp-fold-legacy-rooms.md) | **承認済**(2026-09-08) | 0% | 沼地の**旧タイプ小部屋 5 つをノードごと廃止**し、卓上大部屋 3 枚(参道/祭壇/巣)だけの構成へ。**発注 0 枚**。⭐ 手本は廃坑 P8 と森 #16。⭐⭐⭐ **廃坑と森は既に畳み済みだった**(spec ではなく `build*Run` の戻り値で数える)。⭐⭐⭐ **絵の側が既に口を持つ** — n4big の北の石段(絵ローカル col 7-8)と n6big の南の石段(col 14-16)。⚠⚠ ただし up の既定(辺の中点 col 14)は北の沼 = **`gates.up` が要る**。⚠⚠ **n6 → n7 は絵が閉じていて出口を置けない**(東の水)⇒ 形は n4 →(n6 行き止まり / n7 ボス)の一択。⚠⚠⚠ 罠と宝箱の**兼務宣言を忘れると無言でゼロ**(森 #16 で踏んだ)。⚠ `driver_graph_p6`(素 **246/246**)は**正しく赤くなる** — ⛔ 写経せず言い直す。撤退 `?swampfold=0`。受入 `verify_swamp_fold`(新規・base **10181**) |

---

## 12. 実装結果

(実装窓が埋める)

### 12-0. 着手前の実測(実装窓 / 2026-09-08 / dev-loop 項目1「測るだけ」)

⛔ この節を書いた時点で `index.html` / `tavern.html` / `tools/*.js` は **1 バイトも触っていない**
(作業ツリーは本ファイル以外 clean)。幾何は `ROOM_PAINTINGS_DEF` / `RUN` を **実行時に**書き換える
使い捨てドライバ(`%TEMP%/df_pptr/df62_measure.js`。repo に入れない)で測った。
⭐ 実行時注入が効くのは `DFMapDef.setPaintingCatalog(ROOM_PAINTINGS_DEF)`(`index.html:5978`)が
**同一オブジェクトを持つ**ため。`paintingGatesFor` は呼ぶたびにそこを読み直す。

#### (A) 母集団の基準(すべて素・逐次実走。並走させると偽の赤が出るので 1 本ずつ)

| ドライバ | exit | 総括行 | §8 の記録との差 |
|---|---|---|---|
| `node tools/driver_graph_p6.js` | 0 | `══ 結果: 246/246 PASS ══` | 一致 |
| `node tools/driver_graph_p6.js --scenarios lizard-swamp` | **1** | `══ 結果: 72/73 PASS ══` | ⭐ **素で 1 本赤**(下記) |
| `node tools/verify_swamp_novice.js` | 0 | `PASS 33 / FAIL 0` | #53 の 33/33 と一致 |
| `node tools/verify_swamp_lair.js` | 0 | `PASS 25 / FAIL 0` | #58 の 25/25 と一致 |
| `node tools/driver_spawn_not_on_gate.js` | 0 | `[drv] 51/51 PASS` | 新規記録 |
| `node tools/driver_graph_p7.js` | 0 | `══ 結果: 60/60 PASS ══` | 新規記録 |
| `node tools/driver_paint_blocked.js` | 0 | `PASS 65 / FAIL 0` | 新規記録 |

**唯一の FAIL 行(全文)**:

    - (1z) ボス部屋が骨格 (9x6) でないのは bandits-forest と lizard-swamp だけ  — 大部屋=lizard-swamp

`--scenarios lizard-swamp` の 73 本の内訳(assert ID を実走から採った):

- ノード到達 `T-lizard-swamp-{n0,n1,n2,n3,n4,n6,n7}` … **7 本**(⚠ **n5 は無い** = 8 ノードだが 7 本)
- lizard-swamp 本体 … **41 本**
  `{1a,1b,1c,1d,1e,1f,1g,1h,1i,1i2,1j,1j2}` `{2a,2b,2c}` `{3a〜3e}` `{4a〜4e}` `{5a〜5g}` `{6a,6b,6c}`
  + `7{T,a,b}-lizard-swamp-{0,1}`
- 横断 `(1z)` `(1z2)` `(E1)` `(G1)` `(G2)` … 5 本 / 変異母集団 `0a〜0e × {nop6,nohoardgate,nocagenode,noextraspawn}` … 20 本

#### (B) 幾何の確定値(すべて本番の `isTileWall` / `aStar` / `nodeGateTile` / `hasLineOfSight` で測った)

**前提の裏取り**: `gates` の座標系は **絵ローカル `[列, 行]`**(`js/df-mapdef.js:810` の
`ROOM_PAINTINGS_DEF[theme][key].gates = { right: [25, 4], … }`。`paintingGateTileFor` は
`tx = rect[1] + floor(c*rw/tw)` / `ty = rect[0] + floor(r*rh/th)`。ノードの絵は rect == tileBounds
なので**恒等写像** = n4big のコメントどおり `(col,row) + (10, 3)`)。

##### (B-1) n4big の `gates.up` — **確定**

コピペする 1 行(`ROOM_PAINTINGS_DEF["lizard-swamp"].n4big` の中、`sealRing:` の近く):

    gates: { up: [8, 0] },       /* ★[#62] 北の口 = 祠へ登る石段の東列 (絵ローカル col 8 / 行 0) */

| 項目 | 実測 |
|---|---|
| 出口タイル(global) | **(18, 3)** = `nodeGateTile(MAPDEF,"up")` の戻り値と `exits[].at` が一致 |
| そのタイルの `isTileWall` | 扉を開けた状態で **false(床)**。素は扉が立つので true(下記) |
| 立つ扉 | `{id:"gate-up", tx:18, ty:3, orientation:"horizontal", state:"closed"}`(施錠でも隠しでもない) |
| 石段の手前 (18,4) | `isTileWall=false` / 入場 (12,13) から本番 aStar **15 歩** |
| 扉を開けた後 (18,3) | `isTileWall=false` / 入場から本番 aStar **16 歩** |
| 旧 up 中点 (24,3) | `gates.up` を足すと **sealRing が塞ぐ**(`isTileWall=true`)⇒ n4 の孤立点が **2 → 1** に減る |
| `DFMapDef.lintRun`(畳んだ 3 ノード形) | **error 0 / warning 0** |

⭐ **もう 1 つの候補 `[7, 0]` = (17,3) も同じく成立する**(扉 closed / 開ければ床 / 手前 (17,4) は
aStar 14 歩・開後 15 歩)。**どちらでもよいので依頼書の `[8, 0]` を採る**。
⚠ 採らなかった側の列は sealRing に塞がれる(`[8,0]` を採ると (17,3) が壁)。

##### (B-2) n6 の `down`(南の石段)— **gates を足す必要は無い**(依頼書 §2-3 の予想どおり)

| 項目 | 実測 |
|---|---|
| `nodeGateTile(n6,"down")` | **(26, 24)**(既定の辺の中点 `midC = floor((10+43)/2) = 26`) |
| (26,24) の `isTileWall` | **false(床)** — sealRing の門番がゲートとして残している |
| n4 から `up` で抜けた時の入場地点 | **(26, 22)**(= ゲート + `NODE_ENTRY_INSET(2)`)。`isTileWall=false` |
| (26,23) | `isTileWall=false`(石段が縦に通っている) |
| 入場 (26,22) → 祭壇のハイドラ (38,14) | 本番 aStar **20 歩** = 到達可能 |
| n6 に立つ扉 | **0 枚**(行き止まりで `exits` が空。引き返し口には扉を立てない仕様) |

⇒ **`gates: { down: [15, 21] }` は不要。n6big は 1 ビットも触らない。**
(参考: 従来どおり `right` で抜けて左から入ると入場は (12,13) = 変化なし)

##### (B-3) n4 の入場 (12,13) から出口ゲートへの `aStar`

| 経路 | 素(扉あり) | 扉を開けた後 |
|---|---|---|
| (12,13) → n6 行きゲート (18,3) | **到達不能**(扉 `closed`) | **16 歩** |
| (12,13) → (18,4) = ゲートの 1 つ内側 | **15 歩** | 15 歩 |
| (12,13) → n7 行きゲート (39,13) | **到達不能**(扉 `locked`) | 施錠なので `openDoorAt` では開かない = 到達不能のまま |
| (12,13) → (38,13) = ゲートの 1 つ内側 | **26 歩** | 26 歩 |

⭐ **これは畳む前から同じ**。基準 = `driver_spawn_not_on_gate` の (3g) が素で
`{"to":"n7","at":[39,13],"wall":true,"door":true}` を**緑で**記録している。

##### (B-4) 移設する 7 体の座標 — **確定(そのまま貼れる形)**

⭐ **推奨 = 案A**。11 体を丸ごと注入して本番の門番で検算済み(下表)。

    /* ★[#62] 旧 n1/n2/n3 の 7 体を参道へ移設。体数も種類も変えていない
     *   (lizardWarrior x4 / lizardRaider x1 / lizardHunter x2)。
     * ⚠ 全タイル マスク '.' かつ本番 isTileWall=false かつ入場から aStar 到達可能を実測済。 */
    // ── 西群 (浅水の見張り) へ +3 = 旧 n1 の 3 体 ──
    [19, 11, "lizardWarrior"], [20, 13, "lizardWarrior"], [21, 12, "lizardRaider"],
    // ── 東群 (東の広場) へ +4 = 旧 n2 + 旧 n3 の 4 体 ──
    [34, 13, "lizardWarrior"], [36, 11, "lizardHunter"],
    [36, 13, "lizardWarrior"], [37, 12, "lizardHunter"],

| at | type | マスク | 本番 `isTileWall` | 入場から aStar | 入場からの距離 |
|---|---|---|---|---|---|
| (19,11) | lizardWarrior | `.` | false | 9 歩 | **7.28 タイル / 699px** |
| (20,13) | lizardWarrior | `.` | false | 8 歩 | 8.00 タイル / 768px |
| (21,12) | lizardRaider | `.` | false | 10 歩 | 9.06 タイル / 870px |
| (34,13) | lizardWarrior | `.` | false | 22 歩 | 22.00 タイル |
| (36,11) | lizardHunter | `.` | false | 26 歩 | 24.08 タイル |
| (36,13) | lizardWarrior | `.` | false | 24 歩 | 24.00 タイル |
| (37,12) | lizardHunter | `.` | false | 26 歩 | 25.02 タイル |

**既存の 2 群(実測。移設先を決める基準)**

- 西群「浅水の見張り」= (20,12) lizardRaider / (21,13) lizardWarrior … 入場から 8.06 / 9.00 タイル
- 東群「東の広場」= (34,11) lizardHunter / (35,13) lizardPriest … 入場から 22.09 / 23.00 タイル
- 若い司祭 `swampNovice` (33,12)(⚠ 動かさない)… 入場から 21.02 タイル
- **2 群の間隔 = 13.04〜15.13 タイル**(`DETECTION_RANGE` 1200px ÷ `TILE_SIZE` 96 = **12.5 タイル**)

**11 体を注入した状態の検算(本番の門番)**

    foeCount=11  types={lizardWarrior:5, lizardRaider:2, lizardHunter:3, lizardPriest:1}
    badMask=[]  badWall=[]  unreachable=[]         ← マスク '#' 0 件 / 壁 0 件 / 到達不能 0 件
    ringOpen=[]                                     ← sealRing に穴が開いていない
    isolated=[[24,23]]  isolatedOutsideMidpoints=[] ← 孤立は down 辺の中点だけ (実害なし)
    minDist(入場→最寄りの敵) = 699px (7.28 タイル) ≧ 672px
    西群 5 体 vs 東群 6 体 の最短 = 13.00 タイル ( > 12.5 )
    doors = gate-up(18,3) closed / gate-right(39,13) locked

**代案(北の石段に伏兵を置く形)** — 西群 +3 を石段へ移すだけ。同じく検算済み
(`badMask/badWall/unreachable/ringOpen` すべて 0、`minDist = 774px = 8.06 タイル`、西群 vs 東群 13.00 タイル):

    [18, 5, "lizardWarrior"], [18, 6, "lizardWarrior"], [17, 6, "lizardRaider"],

⭐ 絵の「祠へ登る石段」に伏兵が立つので §9-2 の体感が強くなる。
⚠ ただし**別々の戦闘にはならない**(下記の崩れた点 3)。

---

### ⭐ 起草が崩れた点(実測で 7 件)

1. **⭐ `--scenarios lizard-swamp` は素で 1 本赤くなる**(exit 1)。§2-7 は「内訳はこれで切り分けて取れる」
   と書いたが、`(1z)` は **5 シナリオ全部を母集団に取る横断 assert** なので、絞ると bandits-forest が
   消えて必ず落ちる。⇒ 切り分けには使えるが、**この 1 本は「絞ったせいの赤」**。素の 246/246 と混同しないこと。

2. **⭐⭐⭐ `verify_swamp_lair` は「1 本も赤くならないはず」ではない — (5a) が `n4big` を逐語で凍結している。**
   `tools/verify_swamp_lair.js:639` は
   `sliceEntry(indexText, 'n4big: { src: "assets/room_lizard-swamp_n4_map.jpg"')` を
   `BASELINE_REV = '079ff3a'` の同じ切り出しと**全文一致**で比べている(改行の格納形式だけ正規化)。
   ⇒ **`gates:` を 1 行足した瞬間に (5a) が赤くなる**。
   ⛔ 期待値を写経して緩めない。**基準 rev を #62 着手前のコミットへ進める**か、
   凍結範囲を「マスク行だけ」へ言い直すこと(どちらにしたかを §12 に理由つきで書く)。

3. **⭐⭐⭐ 「3 群目を既存 2 群から 13 タイル以上離す」は n4big では原理的に不可能。**
   実測(本番の `isTileWall` / `aStar`):
   - マスクが `.` のタイルは 205、そのうち**歩けるのは 109**(残りは sealRing の外周と扉)
   - 「入場から 7 タイル以上 かつ ゲート以外 かつ 歩ける」= **81 タイル**
   - そのうち `dG1 ≧ 13 かつ dG2 ≧ 13` = **6 タイルあるが 6 つとも `isTileWall = true`**
     (全部 rect の外周 = sealRing。置けない)⇒ **実質 0**
   - 総当たりで「互いに 12.5 タイル以上」の 3 つ組は **5 組**見つかるが、**5 組とも (24,23) を含む**。
     (24,23) は down 辺の中点で、本番 aStar で**到達不能な孤立点**(`probe_swamp_map --bfs` の
     `連結成分 = 3 [1,108,1]`)。敵を置くと `graph-spawn-on-gate` と同じ「倒せない敵」= クリア不能。
     ⇒ **実質 0 組**。
   ⭐ 一般形 = **廊下の長さが足りない**。入場の 7 タイル空けを引くと使える span は col 19〜38 の
   **19 タイル**で、12.5 タイル間隔の 3 群には **25 タイル**要る。
   ⇒ **本チケットで作れるのは 2 群まで**(西 5 体 / 東 6 体)。「11 体が一度に襲ってくる」は
   これで回避できている(2 群の間隔 13.00 タイル > 12.5)。

4. **⭐⭐ 受入 (2d)(2e)「出口ゲートまで本番の `aStar` で到達可能」は素では必ず false。**
   出口ゲートのタイルには**閉じた扉 / 施錠扉**が立つので `isTileWall = true`(実測:
   `gate-up(18,3)=closed` / `gate-right(39,13)=locked`)。⇒ assert は
   「**扉を開けてから到達可能**」か「**ゲートの 1 つ内側のタイルへ到達可能**」へ言い直すこと。
   基準 = `driver_spawn_not_on_gate` (3g) が素で `{"at":[39,13],"wall":true,"door":true}` を**緑で**記録している。

5. **⚠ `verify_swamp_novice` の変異アンカー 2 本が、本チケットの編集面に逐語で乗っている**(#60 の型)。
   素の実走は緑のまま `--negative` だけが exit 3 になるので、**着手前に必ず控える**:
   - `oldn4` … `        n4big: { src: "assets/room_lizard-swamp_n4_map.jpg",`(先頭 8 スペース)
   - `spawnonwall` … `              slots: [[20, 12, "lizardRaider"], [21, 13, "lizardWarrior"],`(先頭 14 スペース)
   ⇒ **この 2 行はバイト単位で残す**。`gates` は n4big の**別の行**へ、移設した 7 体は
   `slots:` の**続きの行**へ書く。(`density1` / `switchsplit` / `n4wipe` の 3 本は今回の編集面に無い)

6. **⭐ n6 の `down` に `gates` を足す必要は無かった**(§2-3 の「既定のままで通る可能性が高い」が的中)。
   (26,24) は本番の `isTileWall` で床、入場は (26,22)、祭壇まで aStar 20 歩。

7. **⭐ `gates.up` を足すと副作用で「孤立点」が 1 つ減る。**
   旧 up 中点 (24,3) がゲートでなくなり sealRing が塞ぐので、n4 の孤立は (24,3)(24,23) の **2 → (24,23) の 1** へ。
   `verify_swamp_novice` (1f)(1f2) は「孤立は**辺の中点だけ**」という形なので**緑のまま**(実測で確認済)。

⚠ 補足(数値の出所): `TILE_SIZE = 96`(`index.html:3421`)/ `DETECTION_RANGE = 1200`(`:17563`)
⇒ **12.5 タイル**。索敵は `距離 < DETECTION_RANGE` **かつ** `hasLineOfSight`(`:18082`)の AND。
代案(石段)の伏兵は、パーティが石段の口 (18,11) を通る瞬間に**距離 5〜7 タイル + LOS 開通**で
必ず起きるため、西群と**同時に起きる**(= 3 群目にはならない)。東群からは完全に独立
(15.1〜18.4 タイル / LOS なし)。

---

### 12-1. 着地の要約(dev-loop 5 項目)

| 項目 | 内容 | commit |
|---|---|---|
| 1 | 着手前の基準採取 + 幾何の実測(`index.html` は未改変) | `cbfb4e6` |
| 2 | STEP1〜4 の本実装 + changelog | `fc3dd60` |
| 3 | 受入 `tools/verify_swamp_fold.js`(新規・base **10181**) | `11d052a` |
| 4 | 依頼書が名指しした既存 golden 4 本の言い直し + 測定器の修理 3 件 | `365ab98` |
| 5 | 依頼書の母集団リスト**外**で赤くなった 5 本の言い直し | `2d147e5` |
| 5 | 本節(§12)+ 台帳 `実装依頼書/README.md` の更新 | 本行を書いたコミット |

**実装の中身**(§4〜§7 のとおり + 実測で変えた点):

- `SWAMP_FOLD_OFF`(`?swampfold=0`)を `SWAMP_LAIR_OFF` の隣に新設。
  ⚠ ただし **単独では成立せず**、`SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF` の
  派生を挟んだ(§12-2 の崩れ 8。`?swampmap=0` で n4 が 7x6 へ戻ると移設 7 体も出口も rect の外へ落ちる)。
- `NODE_EXTRA_SPAWN_KINDS` を 2 シナリオ同時に持てる形へ組み替え(森のぶんは 1 ビットも変えていない)。
- `ROOM_PAINTINGS_DEF["lizard-swamp"].n4big` へ `gates: { up: [8, 0] }` を 1 行追加。
- `buildLizardSwampRun()` を **n4(entry・start)→ [0] right→n7(boss) / [1] up→n6(行き止まり)** の 3 ノードへ。
  ⚠ **exits の順そのものが仕様**(`chooseExit` は `opts[0]` を取るので `right→n7` を先に置かないと
  自動進行がボスへ永久に到達しない)。

### 12-2. ⭐⭐⭐ 起草が崩れた点 — 通算 **29 件**

⭐ このリポでは「崩れた主張を数えて残す」ことが受入の一部。**1〜7 は §12-0**(項目1 の実測)。
以下はその続き。

### 項目2 の本実装で崩れた 8 件(8〜15)

8. ⭐⭐⭐ **§4「4 本のスイッチは独立」は成立しない** — `?swampmap=0` で n4 が 7x6(`P6_MID`)へ戻るため、
   畳みだけ残すと移設 7 体も出口 (18,3) も **rect の外へ落ちる**。⇒ 森と同型の派生
   **`SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF`** を挟んだ。
9. ⭐⭐⭐ **exits の順そのものが仕様** — `chooseExit` は `RUN.auto` でも `?autoplay` でも **`opts[0]`**。
   `up→n6`(行き止まり)を先に置くと**自動進行がボスへ永久に到達しない**。**`right→n7` を先**に置く。
10. ⭐⭐⭐ **受入 (1d)「console に `[graph]` 警告が出ない」は語で拾うと必ず赤くなる** —
    `[graph] 分岐グラフで起動します` は **console.log の成功行**。⇒ `m.type()` で warning/error に絞る。
11. ⭐⭐⭐ **`driver_graph_p6` は赤で済まず FATAL(exit 9)で死ぬ**(`:468` が `byId.n0.slots` を読む)。
    ⇒ 直すまで **orc-fort / undead-temple / dragon-lair が 1 本も測れない** = 非退行の空白地帯。
12. ⭐⭐⭐ **§8 の母集団 6 本では足りない** — 和集合で数えると **39 本**。リスト外から新規の赤が **5 本**。
13. **§2-6「畳むと消えるもの」に隠し扉が抜けている** — 畳んだ沼の**隠し扉は 0 枚**になる
    (唯一の行き止まり n4→n6 が `WANT_NO_SECRET` で除外)。`driver_doors_p6` の舞台選定の根拠が消える。
14. §2-7「`verify_swamp_lair` は 1 本も赤くならないはず」→ **(5a) が赤**(項目1 の予告どおり)。
15. 負のコントロールに **`?swampmap=0` との組み合わせ**が要る(片方だけ効いた中間状態を検出できない)
    ⇒ 変異 `mapoff` を追加(§8 の表には無かった 7 本目)。

### 項目3(受入の実装)で崩れた 5 件(16〜20)

16. ⭐⭐⭐ **lint の error は「`RUN` を `null` にして単一マップへ退避させる」**(`index.html:4703`)。
    ⇒ `graph-spawn-on-gate` や entry 不在のような欠陥は **assert 1 本でなく 25 本が一斉に赤くなる**。
    §8 (1d) が想定した「1 本が赤くなる」ではない。⇒ golden の赤を読むときは
    **「グラフの中身が違う」と「RUN そのものが落ちた」を必ず切り分ける**。
17. ⭐⭐⭐ **`START_TX/START_TY` は「パーティが立つ場所」ではない** — `buildNode` が書く `MAPDEF.start`
    そのもので、`placeNodeParty("up")` で別の縁から入っても**動かない**。実際の入場地点は
    **`playerX/playerY`**(`nodeGateTile`→`NODE_ENTRY_INSET`→`snapToWalkable` の結果)。
18. ⭐⭐ **§12-0 の「罠 8 / 玄室宝箱 6」は再現しない数字** — SNAP_FN 経由で n4 を組み直すと **罠 4 / 宝箱 3**。
    8/6 は「起動時の初回ビルド」限定の値。⇒ **数を焼かず `>0` と対照腕の `0`** で測る。
19. **§8 (5b)「4 本のスイッチが独立」は 3 本に分解が要る** — `?swampcrypt=0` / `?swamplair=0` は
    畳みを外さない(3 ノード / entry=n4 のまま)。畳みに干渉するのは **`?swampmap=0` だけ**。
20. **`?swampmap=0` の n4 の `paint` は `null` ではなく `"n4"`**(旧在庫の小さい床絵)。

### 項目4(依頼書が名指しした 4 本)で崩れた 4 件(21〜24)

21. ⭐⭐⭐ **§8「既存 golden の非退行」に挙げた 6 本では足りない** — 「機能の語」+「導線の語」の
    和集合で **39 本**。リスト外から新規の赤が **5 本**出た(= 項目5 の仕事)。
22. **`verify_swamp_novice` の赤の理由が §8 の予想と違う** — 「n4 に敵を足すので体数の assert が
    赤くなる」ではなく、**(3e) の母集団ガード `scanned >= 30`**(6 シナリオの全ノードを数えており、
    沼が 8→3 ノードになった時点で 30 を割った)。⛔ 29 へ下げるのは写経で F2〜F4 でまた腐る
    ⇒ **下限を撤去して台帳から導出**へ言い直した。
23. ⭐⭐⭐ **`verify_swamp_lair` (5a) の基準 rev は進めてはいけない** — 進めるとチケット 1 本ごとに
    守る時間幅がリセットされ、#58 の「隣の領分を巻き添えにしていない」という主張が消える。
    ⇒ 逐語全文凍結を**「絵の幾何」へ言い直し**(src / tileBounds / node / sealRing / outdoor /
    マスク 21 行)+ **(5a2) を新設**(`079ff3a` から増えたキーは `gates` ちょうど 1 つ・減ったキーは 0)。
24. ⭐⭐⭐ **測定器が #58 以来腐っていた(#62 の退行ではない)** —
    `verify_swamp_novice --negative` は **exit 3 で死んでおり**、変異 `sealoff` のアンカー
    `sealRing: true, /* 外周 1 タイル…` が `index.html` に **3 箇所**あって空振りし、
    **`MUT_ORDER` の sealoff 以降 4 本(sealoff / switchsplit / n4wipe / nonode)が
    一度も走っていなかった**。n4big にしか無い `outdoor` 行へ張り替えて 4 本とも実走・命中。
    加えて変異 `anynode` は (3e) の母集団ガード落ちで**偽陽性に化けていた**ので実差分で赤くなる形へ。

### 項目5(リスト外の 5 本)で崩れた 5 件(25〜29)

25. ⭐⭐⭐ **`driver_grid_s2` に `--update-golden` は不要だった。** 依頼は「golden の差分を 1 件ずつ
    読んでから焼き直せ」だったが、実測すると **`?swampfold=0` の腕は golden(`d1aef29` 採取)と
    lizard-swamp 8 ノード**すべて完全一致**。⇒ #16 が §11/§12 を `?s2fold=0` へ移したのと同じ
    **腕の移設**だけで済み、`tools/goldens/grid_s2.json` は **1 バイトも変えていない**。
26. ⭐⭐⭐ **`driver_doors_p6` の移設先「undead-temple が唯一の候補」は誤り。**
    実測すると **dragon-lair も (1a) を満たす**(hidden 1/7)。さらにドライバ `:71-76` が明記する
    選定条件「**entry 側に隠し扉が無い舞台**」(§2〜§5 が自分で 1 枚隠す前提)を満たすのは
    **dragon-lair だけ** — undead-temple は **n0/gate-down が hidden** で条件違反。
    dragon-lair は旧沼地と profile が完全一致(hidden は n1→n5 の 1 枚だけ / entry は素通し)。
27. ⭐⭐ **`driver_doors_p6` の `wantLocked` が素の node id を seed にしていた**(実装は `mapDef.id`)。
    舞台が `lizard-swamp/n0` の間だけ**たまたま答えが一致**しており、舞台を替えた瞬間に
    (3c)(3e) が `state=locked 期待=closed` で赤くなって露見した。**#62 の退行ではなく測定器の欠陥**。
28. **`driver_doors_p5 (1x-a)` の腐りは「下限 4」だけが原因ではない** — `STAGE2 = 'lizard-swamp'` の
    **1 本固定**も同じ根。⇒ 下限定数を撤去したうえで、廃坑以外の 5 舞台の扉台帳から
    「扉を持つ舞台の**全ペア**が (node id, door id) を 1 組以上共有する」を導出する形へ。
29. ⚠ **`driver_mine_wall` の「57/58 が基準・#16 由来の赤は別チケットの領分」は成り立たない** —
    bandits-forest の赤と lizard-swamp の赤は**同一の腐り**(「他 5 シナリオは開始ノードに絵が
    1 枚も無い」という前提が畳みで死ぬ)。lizard-swamp だけ例外表へ書き足すのは写経なので、
    判定を絵の台帳(`sealRing` + `blocked` マスクの宣言)から導く形へ言い直した。
    **その必然の帰結として #16 由来の赤も緑になった**(期待値を緩めたのではない)。

### 12-3. 測定器の欠陥と修理(#62 が触った範囲の外も含む)

| # | 欠陥 | いつから | 修理 |
|---|---|---|---|
| 1 | `verify_swamp_novice --negative` が **exit 3** で停止し、変異 4 本(sealoff / switchsplit / n4wipe / nonode)が**一度も走っていなかった** | **#58 以来** | アンカーを `index.html` に 3 箇所ある `sealRing: true, …` から、n4big にしか無い `outdoor` 行へ張り替え。4 本とも実走・命中 |
| 2 | 同ドライバの変異 `anynode` が (3e) の母集団ガード落ちで**偽陽性**に化けていた | #58 以来 | 実差分で赤くなる形へ |
| 3 | `driver_graph_p6` が畳みで **FATAL(exit 9)**。orc-fort / undead-temple / dragon-lair が 1 本も測れない | #62 で顕在化 | `:468` の `byId.n0` 前提を直し、lizard-swamp を `?swampfold=0` の腕へ移設。246 → **247** |
| 4 | `driver_doors_p6` の `wantLocked` が **素の node id** を seed にしていた(実装は `mapDef.id`) | P6 出荷時から | `mapDef.id` を返させて突き合わせ(§12-2 の 27) |
| 5 | `driver_doors_p5 (1x-a)` / `verify_swamp_novice (3e)` / `driver_spawn_not_on_gate` の **下限定数** | 畳みのたびに腐る構造 | 3 本とも**撤去して台帳から導出** |
| 6 | `driver_grid_p3b (3i)(3i2)` の**名指しの期待表**と `=== 1` | #16 が作った時点から | 絵の台帳(`outdoor` + rect 面積)から導出し、実装の `__outdoorRevealProbe` と **2 経路**で突き合わせ |
| 7 | `driver_mine_wall (3b)` の「他 5 シナリオは絵を持たない」前提 | #16 以来(HEAD でも 1 本赤) | 絵の台帳(`sealRing` + `blocked`)から分岐を導出 |

⭐ **一般解 =「母集団の下限や舞台の名前を定数で焼く assert は、畳み系のチケットが来るたびに必ず腐る。
下げる/書き換えるのではなく、台帳から導出する形へ言い直すこと。」**(#62 で **6 本**を同じ型で直した)

### 12-4. 撤退スイッチの実際の姿

| スイッチ | 畳みを外すか | 実測 |
|---|---|---|
| **`?swampfold=0`** | ✅ 外す | **8 ノード / entry=n0**。旧 n0〜n5 が戻る |
| ⚠ **`?swampmap=0`** | ✅ **外す**(依頼書は「外さない」と書いていた) | n4 が 7x6(`P6_MID`)へ戻るので `SWAMP_FOLDED` が false になり、畳みも同時に外れる |
| `?swampcrypt=0` | ❌ 外さない | 3 ノード / entry=n4 のまま(n6 の絵だけ戻る) |
| `?swamplair=0` | ❌ 外さない | 3 ノード / entry=n4 のまま(n7 の絵だけ戻る) |

### 12-5. 残った宿題 = 実機体感(依頼書 §9 の 6 項目)

⚠ ローカルは **http 起動が必須**(`file://` では音が出ない)。⛔ ここは自動検証で代替できない。

1. 沼地へ出発 → **いきなり参道(大部屋)から始まる**か。タイル床の小部屋を一度も通らないか
2. 参道の**北の石段が「祠へ続く道」に見える**か(矢印と扉がその上に立つか)
3. 祭壇へ入ったとき、**南の石段から入って自然か**(背中側から入る形になる)
4. 参道の敵 11 体が**一度に襲ってこない**か
   ⚠ 3 群は**原理的に不可能**と実測済み(§12-0 の崩れ 3)。**2 群(西 5 / 東 6・間隔 13.00 タイル)が上限**
5. 罠と宝箱が参道で出るか
6. **走行時間**が短くなった体感(8 部屋 → 3 部屋)

⭐ ⛔ 難易度・XP の再調整は**本チケットの範囲外**(#61 の 4 人化と `rest` 消失と部屋減が同時に効くので、
合算してから 1 度で測る = §11 のとおり)。

### 12-6. 受入 `tools/verify_swamp_fold.js`(新規・base **10181**)

- **素 30/30 PASS(exit 0)**
- **`--negative` 変異 7/7 命中・空振り 0**(すべて `→ OK (検出できた)`):

| 変異 | 期待した赤 | 実際に命中 |
|---|---|---|
| `nofold` | `0a` `1a` `1b` `1c` | 4/4(波及して 11 本が赤) |
| `nogate` | `2a` `2e` | 2/2 |
| `nokinds` | `3d` | 1/1 |
| `dropfoes` | `3a` `5a` | 2/2 |
| `spawnongate` | `1d` `3c` | 2/2(⭐ lint error で **25 本が一斉に赤**。§12-2 の 16) |
| `entryn0` | `0a` `1a` | 2/2(同上 25 本) |
| ⭐ `mapoff`(§8 の表に無かった 7 本目) | `5c` | 1/1 |

- **ポート台帳**: **10181 を `verify_swamp_fold` が占有**(変異 10182〜10188)。
  ⭐ **次の新規ドライバは 10201 以降**(10201 / 10203 / 10205 は #62 の使い捨てプローブが一時使用)。

### 言い直した受入節(依頼書 §8 → 実際に測れる形へ)

- **(2d)(2e)**: ゲートには `gate-up`(closed)/ `gate-right`(**locked**)が立つので素では必ず到達不能
  ⇒ 「1 つ内側へ到達(15 歩 / 26 歩)」+「`openDoorAt` で開けた後はゲートへ到達(16 歩)」へ。
- **(1d)**: `m.type()` で **error / warning に絞る**(`[graph] 分岐グラフで起動します` は成功ログ)。
- **(3a) の 3 群** → **(3f)「群が 2 つで群間 > `DETECTION_RANGE`」**(実測 群=[5,6] / 13.00 > 12.5)。
- **(5b) の「4 本は独立」** → (5b) 大部屋 3 枚 / **(5c) `?swampmap=0` は畳みと連動** /
  (5d) crypt・lair は無干渉、の 3 本へ。

### 12-7. 母集団の非退行(2026-09-08 / 全部**直列**で実走。並列は偽の赤を生む)

### (A) 依頼書 §8 が名指しした 6 本 + 受入 + 項目4 が直した 4 本

| ドライバ | 着手前 | 着地後 | exit |
|---|---|---|---|
| `node tools/driver_graph_p6.js` | 246/246 | **247/247** | 0 |
| `node tools/verify_swamp_novice.js` | 33/33 | **33/33** | 0 |
| `node tools/verify_swamp_novice.js --negative` | ⛔ **exit 3(#58 以来死んでいた)** | **14/14 命中・空振り 0** | 0 |
| `node tools/verify_swamp_lair.js` | 25/25 | **26/26**((5a2) 新設) | 0 |
| `node tools/verify_swamp_lair.js --negative` | 8/8 | **10/10 命中・空振り 0**(`n4mask` / `n4key` 新設) | 0 |
| `node tools/driver_spawn_not_on_gate.js` | 51/51 | **55/55**(母集団 38→**46 ノード** / 112→**128 体**) | 0 |
| `node tools/verify_swamp_fold.js` | — | **30/30** | 0 |
| `node tools/verify_swamp_fold.js --negative` | — | **7/7 命中・空振り 0** | 0 |
| `node tools/driver_graph_p7.js` | 60/60 | **60/60** | 0 |
| `node tools/driver_paint_blocked.js` | 65/65 | **65/65** | 0 |

### (B) 依頼書の母集団リスト**外**で赤くなった 5 本(項目5(A) `2d147e5` で言い直し)

| ドライバ | 着手前(HEAD) | 畳んだ直後 | 言い直し後 | 直し方 |
|---|---|---|---|---|
| `driver_grid_s2` | 緑 | **104/106 exit 1** | **113/113 exit 0** | **腕の移設**(§8 の lizard-swamp を `?swampfold=0` で測る)。⭐ **golden は 1 バイトも焼き直していない** — 撤退腕は `d1aef29` 採取の値と **8/8 完全一致**。装置 (8y)(8y2) を新設 |
| `driver_doors_p5` | 30/30 | **29/30** | **32/32 exit 0** | `common.length >= 4` の**下限定数**と `STAGE2` の 1 本固定を撤去し、5 舞台の扉台帳から導出。規則検査の母集団 14 枚 → **23 枚** |
| `driver_doors_p6` | 39/39 | **33/39** | **40/40 exit 0** | 舞台名の直書きをやめ **§0b で台帳から選定**(実測で `dragon-lair`)+ `wantLocked` の seed を `mapDef.id` へ修理 |
| `driver_grid_p3b` | 43/43 | **41/43** | **44/44 exit 0** | `OUTDOOR_ENTRY_EXPECT` の名指し表と `=== 1` を撤去し、絵の台帳(`outdoor` + rect 面積)から導出。実装の `__outdoorRevealProbe` と **2 経路**で突き合わせ。(3i0) 新設 |
| `driver_mine_wall` | **57/58**(#16 由来の赤 1 本) | **56/58** | **66/66 exit 0** | 判定を絵の台帳(`sealRing` + `blocked`)から導出。⚠ その帰結として **#16 由来の赤も同時に解消**((3b-z) 7 本 + (3b2) を新設) |

**リスト外 5 本の負のコントロール**(いずれも exit 1 = 命中・空振り 0):

    node tools/driver_doors_p6.js --mutate nosecretroll   → (0b)(1a)(7a)(7d) が赤
    node tools/driver_doors_p6.js --mutate noleafguard    → 32/40
    node tools/driver_doors_p6.js --mutate nofilter       → 38/40
    node tools/driver_doors_p6.js --mutate nofind         → 35/40
    node tools/driver_doors_p6.js --mutate noorder        → 39/40
    node tools/driver_doors_p6.js --mutate noexclude      → 36/40
    node tools/driver_doors_p5.js --mutate nolockroll     → (1x-b)(1x-c)(1x-c2) が赤 = 27/32
    node tools/driver_grid_p3b.js --mutate nobootreveal   → (3i)(3i2) が赤 = 29 PASS / 8 FAIL
    driver_grid_s2 / driver_mine_wall は**同一 run 内蔵**の変異が全 PASS
      ((3a)〜(3g) 7 本 / (5-noring)(5-ringall)(5-centeronly)(5-nofallback)(5-nomass) 5 本)

### (C) 「緑のまま」を抜き取りで再確認した 10 本(項目2 が数えた 20 本の部分集合)

`driver_graph_kinds` **66/66** / `driver_mapdef_step1` **208/208** / `driver_graph_sce1` **106/106** /
`driver_wall_face` **54/54** / `driver_wallbox` **28/28** / `driver_wall_props` **29/29** /
`driver_field_step1_geo` **71/71** / `verify_recruit_size` **82/82** / `driver_bgm_mine` **37/37** /
`driver_speech_hooks` **13/13** — **全部 exit 0・記録どおり**。

⚠ 走らせていない 10 本(`driver_dev_gate2` / `verify_road_ambush` / `verify_quest_walk` /
`verify_prep_retire` / `driver_field_step7` / `driver_field_scale` / `driver_field_step1` /
`driver_field_step2` / `driver_field_step3` / `driver_field_verge_gap`)は項目2 が緑を実測済み。
⚠ `driver_field_step6` は **40 分超でも完走しない**ので走らせていない(同族 7 本が緑で代替)。

### (D) 既知の腐り(⛔ #62 の赤ではない・緑にしにいかない)

| ドライバ | 結果 | FAIL 行 |
|---|---|---|
| `driver_doors_p2` | 33/34 exit 1 | `(6c) ★既存 6 シナリオすべてで扉が立つ — goblin-mine:1 bandits-forest:0 lizard-swamp:2 orc-fort:3 undead-temple:3 dragon-lair:3` |
| `driver_grid_p8` | 55/56 exit 1 | `(6d) ★★他 4 シナリオの n7 (9x6) は大部屋ではないので入室即ボス部屋 = 恒等 — {"inBoss":false,"size":{"w":29,"h":20},"bigRoom":true}` |

⭐ **どちらも HEAD と同一の FAIL 行 1 本のまま**(件数も文面も増えていない)。
⚠ `verify_walk_block` / `driver_speech_v2` も着手前から赤い(型3 = 真に無関係)。

⭐⭐⭐ **結論: #62 が「緑を赤にした本」は 0 本。** 赤くなった 9 本はすべて仕様変更の正しい帰結で、
**期待値の写経も、下限を下げる緩和も、golden の焼き直しも 1 件も行っていない。**

### 12-8. 撤退の実走(最後にもう一度)

    node <使い捨てプローブ>   # ?swampfold=0 の腕で lizard-swamp の mapDef を golden と突き合わせ

    === arm "(素)"                     ids=["n4","n6","n7"]                                entry=n4
    === arm "?swampfold=0"             ids=["n0","n1","n2","n3","n4","n5","n6","n7"]       entry=n0
       golden 一致=8 / 不一致=[] / 未測定=[]
    === arm "?swampfold=0&swampmap=0"  ids=["n0","n1","n2","n3","n4","n5","n6","n7"]       entry=n0

⭐ **`?swampfold=0` は 8 ノード / entry=n0 へ戻り、8 ノードの mapDef は `d1aef29`(#58)採取の
golden と 1 バイトも違わない。** 同じことを受入の (5a) と `driver_grid_s2` の (8-lizard-swamp/*) が
恒久的に見張る。
