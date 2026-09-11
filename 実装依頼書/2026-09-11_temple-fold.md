# #66 F3 神殿を卓上マップ 2 枚へ畳む(旧タイプ MAP 全廃 F3)

- **起草**: 2026-09-11(計画窓) / **ステータス**: **承認済**(2026-09-11 ユーザー承認)
- **触るファイル**: `index.html` / `tools/make_grid_map.py` / `tools/verify_temple_fold.js`(新規) /
  `tools/driver_graph_p6.js` / `assets/room_undead-temple_n4_map.jpg` `_n7_map.jpg`(生成物) /
  `tavern.html`(changelog の 1 行のみ) / `実装依頼書/README.md`
- ⛔ **触らないファイル**: なし。⭐ 起草時点(2026-09-11)で `git status` clean・
  `origin/main..HEAD` = 0 本 = **並走窓ゼロ**を実測したので、`実装依頼書/README.md` への
  行追加は**着手時にそのまま足してよい**(文面は §11)。

---

## 1. 目的

シナリオ5「地下神殿 — リッチと召喚の儀」は、いまも **7x6 の小部屋 8 個**でできている。
廃坑 / 森 / 沼 / 砦は既に卓上バトルマップへ畳み終えており、**残るのは神殿(F3)と竜の巣(F4)だけ**。
神殿だけ古い自動生成の部屋のままなので、シナリオを跨ぐと画面が明らかに浮く。

本チケットは #62(沼)/ #63(砦)と同じ型で、神殿を **8 ノード → 2 ノード**へ畳む。

**ユーザー決定(2026-09-11)**:

- **#66 は F3 神殿のみ。** 竜の巣(F4)は #67 へ回す。
  ⭐ 不採用になった案 = 「神殿と竜を 1 チケットで」。絵 4 枚 + マスク 4 枚 + 撤退スイッチ 2 本は
  #63 の砦の**倍**で、項目数が 8 を超えて実装窓が context を使い切る。
  ⚠ ただし**竜の MAP 2 枚は #66 のうちに先行発注済み**(2026-09-11 投下)。リードタイムを重ねないため。
- **カエルム(高位神官の霊)は畳んだ版にも残す。**
  ⭐ 不採用になった案 = 砦の守護者と同じく `?templefold=0` の旧構成にだけ残す。
  §2-3 のとおり**技術的に残せる**ので、最終シナリオへの伏線を渡す唯一の口を切らない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ **行番号は必ずズレる前提で読むこと。** 実測日 = 2026-09-11 / HEAD = `8566218`。

### 2-1. 神殿はいまも旧タイプ 8 ノード

| 対象 | ファイル:行 | 実測 |
|---|---|---|
| 神殿のラン構築 | `index.html:37706` | `buildUndeadTempleRun`(**25 行**)。`buildP6Run("undead-temple","undead-temple",{n0..n7})` を返すだけ |
| 竜のラン構築 | `index.html:37731` | `buildDragonLairRun`(19 行)。同型 = **F4 も旧タイプ**(本チケットでは触らない) |
| 畳み済みの手本 | `index.html:37581` | `buildOrcFortRun`(**125 行**)。⭐ これが完成形のテンプレート |

`buildP6Run` が配る **kind** は次のとおり(`index.html` の `buildP6Run` 本体・末尾のノード表):

| ノード | kind | 神殿での名前 | 敵 |
|---|---|---|---|
| n0 | `start` | 神殿の前庭 | — |
| n1 | `combat` | 納骨堂 | skeleton / zombie x2 = **3** |
| n2 | **`search`** | 崩れた書庫 | zombie / skeletonArcher = **2** |
| n3 | **`loot`** | 副葬品の間 | skeleton / skeletonArcher = **2** |
| n4 | `combat` | 儀式の広間 | zombie / wraith x2 / skeletonArcher = **4** |
| n5 | `rest` | 聖水の泉 | — |
| n6 | `event` | 神官の墓所 | **caelum**(隠し要素) |
| n7 | `boss` | 召喚の祭壇 | skeleton x2 + **lich** |

⇒ **畳んだあと n4 が受け取る体数 = 4 + (3+2+2) = 11 体**。⭐ 砦とまったく同数。

**再測定コマンド**:

    sed -n '37706,37731p' index.html
    sed -n "$(grep -n 'function buildP6Run' index.html | head -1 | cut -d: -f1),+60p" index.html

### 2-2. ⚠⚠⚠ 最大の地雷 — カエルムの対話は **1.56 タイル**まで近づかないと起きない

これが本チケットで一番危ない点。**砦の守護者の問題とは別物**なので写経してはいけない。

    // index.html:24336
    const CAELUM_TALK_RADIUS = 150;

    // index.html: tryApproachCaelum
    if (encounterActive || encounterRunning) return;          // ← 戦闘中は回らない
    const pCX = playerX + 48, pCY = playerY + 58;             // ← 主人公の中心だけ
    const ds = e.def.displaySize || TILE_SIZE;                // caelum.displaySize = 120
    const ecx = e.x + ds / 2, ecy = e.y + ds / 2;
    if (Math.hypot(pCX - ecx, pCY - ecy) > CAELUM_TALK_RADIUS) return;
    setInterval(tryApproachCaelum, 400);

| 値 | 実測 | 出所 |
|---|---|---|
| `CAELUM_TALK_RADIUS` | **150 px** | `index.html:24336` |
| `TILE_SIZE` | **96 px** | `index.html:3421` |
| `caelum.displaySize` | **120 px** | `index.html:9720` |
| ⇒ 届く距離 | **1.5625 タイル** | 150 ÷ 96 |

⭐⭐⭐ **意味**: 隣接 1 タイル(96px)と斜め 1 タイル(約 136px)は届くが、**2 タイル(192px)は届かない**。
しかも判定は**主人公の中心だけ**で、仲間が何人そばを通っても発火しない。
今これが必ず起きているのは、n6 が 7x6 の小部屋で入場から 1〜2 タイルという**幾何の偶然**にすぎない。

⇒ **決定**: カエルムのスロットは、**畳んだ n4 大部屋で「東群の戦闘が終わったあと主人公が出口
`P6_RIGHT`(global (39,13))へ向かう経路」に隣接するタイル**へ置く。
⚠ 絵に描かれる「高位神官の墓所」の中心へ置くのではない。**絵は場所の雰囲気、実体の座標はコードが決める**
(発注文 `codex1/requests/2026-09-11_undead-temple-maps.md` §2-A 3 は「東寄りの開けた床から 2〜4 マス」で
場所取りを頼んであるが、スロット自体は経路隣接で決めてよい)。

⭐ この罠は §8 の負のコントロール `caelumfar` として装置に内蔵させること。

### 2-3. ⭐ 砦の「守護者を大部屋へ移すとクリア不能」は**神殿にはかからない**

#63 の `buildOrcFortRun` のコメントは、n6 の守護者 5 体を畳んだ表へ足すと
`isNodeSettled()` が永久 false になると強く警告している。**神殿へ写経しないこと。** 事情が違う。

    // index.html:24340  initCaelum
    e.inactive = true;
    e.passiveNpc = true;            // 戦わない間はクリア判定からも除外

    // index.html  isNodeSettled
    function isNodeSettled() {
      if (!enemies.every(e => !e.alive || e.passiveNpc)) return false;
      if (typeof findNearestDrop === "function" && findNearestDrop()) return false;
      return true;
    }

| | `inactive` | `passiveNpc` | `isNodeSettled` を止めるか |
|---|---|---|---|
| 砦の守護者(`initGuardians`) | ✅ | ❌ | ⛔ **止める**(永久 false = クリア不能) |
| 神殿のカエルム(`initCaelum`) | ✅ | ✅ | ✅ **止めない** |

⇒ カエルムは畳んだ n4 へ置いてよい。⭐ `inactive` なので `findNearestAliveEnemy` からも外れ、
戦闘には巻き込まれない。**残る問題は §2-2 の距離だけ。**

### 2-4. ⚠ 畳むと罠と宝箱が無言でゼロになる(`NODE_EXTRA_SPAWN_KINDS`)

神殿の n2 は `search`、n3 は `loot`(§2-1 の表)。畳むとこの 2 ノードごと消えるので、
湧き口を n4 へ兼務させないと**罠も玄室の宝箱も 1 個も出なくなる**。
⛔ 森 #16 で実際に踏み、沼 #62 / 砦 #63 で同じ処置をしている。

    // index.html  NODE_EXTRA_SPAWN_KINDS の中
    if (SWAMP_FOLDED) t["lizard-swamp"] = { n4: ["search", "loot"] };
    // ★[#63] 砦も同じ… (FORT_FOLDED)

⇒ **`if (TEMPLE_FOLDED) t["undead-temple"] = { n4: ["search", "loot"] };` を足す。**
⚠ 畳んでいないとき(`?templefold=0`)は**載せない**。旧構成では n2/n3 が持っているので二重になる。

### 2-5. 絵の台帳と `--fit` の罠

発注済み(2026-09-11 投下)の納品先:

| 絵 | 貼り先キー | `out` |
|---|---|---|
| `assets/maps/temple-hall-v1.png` | `GRIDS["temple-hall"]` | `room_undead-temple_n4_map` |
| `assets/maps/temple-altar-v1.png` | `GRIDS["temple-altar"]` | `room_undead-temple_n7_map` |

`GRIDS` の 1 エントリが持つのは **6 数値**(`tools/make_grid_map.py` の `"fort-yard"` が手本):
`src` / `out` / `desc` / `phase` (x,y) / `period` (x,y) / `cells` (col,row) / `tile`。

⚠⚠⚠ **`--fit` の一次解をそのまま台帳へ貼ってはいけない。** #63 の砦は 2 枚とも横線で外れた:

| 砦の絵 | `--fit` の答え | 検算 | 採用値 |
|---|---|---|---|
| 練兵場 | 位相 42.80 / 周期 48.810 | ⛔ 累積ドリフト **11.08**(許容 4.0) | ph 43.50 / T 48.950(drift 1.92) |
| 将軍の間 | 50.175 | ⛔ drift **7.68** | ph 37.30・4.05 / T 49.025・50.150(drift **0.00**) |

⭐⭐⭐ **練兵場は周期だけでなく位相も動かさないと基底に入らない。**
位相を固定したまま周期を 0.02 刻みで振っても OK は 1 点も出ない。
OK 領域は「位相 + 20 × 周期 ≒ 1023」を保つ**斜めの稜線**なので、**(位相 × 周期) の 2 次元で振る**。
⛔ 1 次元走査では永久に見つからない。
⚠ 素材のスコア最大(周期 49.065)も**正解ではない**。score は門番であって精度の物差しではない。

⚠⚠ **行数の偶奇に注意。** 砦は 30x20 = **偶数行**で、`nodeGateTile` の
`midR = floor((r1+r2)/2)` が**中心より 1 行上**に来る。`rect` と `start` はその行に合わせる。

`ROOM_PAINTINGS_DEF` の書き足し先と手本:

| 対象 | 行 |
|---|---|
| 神殿のブロック | `index.html:5910`(`"undead-temple": {` に `1` / `2` / `n4` / `n7` がある。**`n4big` / `n7big` を足す**) |
| 砦の `n4big` | `index.html:5833`(マスク **20 行 x 30 列**) |
| 砦の `n7big` | `index.html:5873` |

マスクの 5 規則は砦 `n4big` の注記が唯一の正。⭐ 規則④ = 横断路の行を col0→col29 で切らさない。
⚠ 連結の検査は必ず **4 近傍**(本番の aStar は斜めを踏まない)。

**計測コマンド**:

    py tools/make_grid_map.py --fit "..\codex1\assets\maps\temple-hall-v1.png" --fit-around 48
    py tools/make_grid_map.py --name temple-hall
    py tools/make_grid_map.py --check assets/room_undead-temple_n4_map.jpg --tile 48

### 2-6. 腐る golden と、腐らない golden

| ドライバ | どうなるか | 出所 |
|---|---|---|
| `tools/driver_graph_p6.js:62` | ⚠ **腐る**。`'undead-temple': { ..., n6kind: 'event', hidden: 'caelum', ... }` と**期待表に焼いてある**。n6 を消すと合わない | 実測 |
| `tools/driver_graph_p7.js` | ⭐ **腐らない**。#63 が `TOUR_SCEN = 'orc-fort'` + `TOUR_ARM = '&fortfold=0'` へ移設済み。`:71` の予見「⛔ TOUR_SCEN を undead-temple へ移す案は採らない」は**移していたら**の条件付き | 実測 |
| 神殿 / 竜に言及するドライバ | **35 本**(`grep -l "undead-temple\|dragon-lair" tools/*.js`)。⭐ これは母集団の**下限**。実際は「変更したファイルを読むか」で引き直す(#64 の一般解: 名指し 14 → 実測 59) | 実測 |

⭐⭐⭐ #62 の一般解がそのまま当たる: **母集団の下限や舞台名を定数で焼く assert は、畳み系チケットの
たびに腐る。台帳から導出する形へ言い直す。**

### 2-7. 撤退スイッチの型

    // index.html:4160  これが手本
    const FORT_FOLD_OFF = (() => {
      try { return new URLSearchParams(window.location.search).get("fortfold") === "0"; }
      catch (e) { return false; }
    })();
    const FORT_FOLDED = !FORT_FOLD_OFF;                       // index.html:4172

⚠ 置き場所も `SWAMP_FOLD_OFF` / `FORT_FOLD_OFF` の隣にする。`RUN` は `index.html` の即時評価 const から
`buildScenarioRun` を呼ぶので、モジュール直下に置くと **TDZ で ReferenceError**、
`graphInfo` が「分岐なし」と読んで**黙って**単一マップへ落ちる。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

⇒ **鳴る**(`index.html` を触るため)。**書けるプレイヤー向けの要約は実在する**:
「地下神殿が 2 枚の大部屋になった」は画面で見て分かる変化なので、嘘にならない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `TEMPLE_FOLD_OFF` / `TEMPLE_FOLDED` の新設 / `FOLD_MOVED_TEMPLE` / `buildUndeadTempleRun` の 2 ノード化 / `NODE_EXTRA_SPAWN_KINDS` へ神殿の兼務 / `ROOM_PAINTINGS_DEF["undead-temple"]` へ `n4big` `n7big` とマスク 2 枚 |
| `tools/make_grid_map.py` | `GRIDS` へ `temple-hall` / `temple-altar` の 2 エントリ |
| `assets/room_undead-temple_n4_map.jpg` `_n7_map.jpg` | 焼き上がり(生成物) |
| `tools/verify_temple_fold.js` | **新規**。base **10261** |
| `tools/driver_graph_p6.js` | 期待表の言い直し(§2-6) |
| `tavern.html` | changelog の 1 行(`py tools/add_changelog.py` が書く) |
| `実装依頼書/README.md` | #66 の行(§11 に文面) |

---

## 4. STEP1 — 着手前の基準取り(⭐ 本番を 1 バイトも触らずに色を控える)

⭐ #61 / #65 で効いた型。**赤の予想は必ず外れる**ので、本番を触る前に母集団の色を控える。

1. `git status` と `git log --oneline origin/main..HEAD` を読む(並走の検出)
2. 母集団を引く。⭐ **「変更したファイルを読むか」で引く**(名指しの grep 14 本が実測 59 本になった #64 の教訓)。
   下限は §2-6 の **35 本**
3. 各ドライバを走らせ、**exit / 集計行 / FAIL 行の集合**を記録する
4. ⚠⚠ **検証ドライバを `timeout` で包まない。** `verify_npc_crowd` は起動時にポート 14 本を予約するので、
   打ち切ると孤児が残って次の起動が `EADDRINUSE` で即死する。
   Bash 経由の背景実行はシェルが先に抜けて `$?` が 127 を返すのに node は生きている。
   ⭐ 長い走行は **PowerShell ツール**から回す(#64 で 58/58 実証)
5. ⚠ **着手前から壊れている 6 本**は #66 の責任ではない。前後で同じであることだけ確かめる:
   `driver_grid_p4`(EXIT=3)/ `driver_mapeditor` 176/179 / `driver_mapeditor_painting` 105/106 /
   `sweep_recruit_balance`(装置崩れ 4/4)/ `driver_monsters_umberhulk` 21/22 /
   `probe_party_size`(**終了しない**。941 秒で手動停止)

⛔ この項目では本番コードも `tools/` も 1 バイトも触らない。

---

## 5. STEP2 — 絵の受入とマスク 2 枚

1. 納品を `codex1/assets/maps/temple-hall-v1.png` `temple-altar-v1.png` から受け取る
2. `--fit --fit-around 48` で周期 / 位相 / マス数を測る。
   ⚠⚠⚠ **一次解を信じない**(§2-5)。検算 NG なら **(位相 × 周期) の 2 次元**で振り直す
3. `GRIDS` へ 6 数値を貼り、`--name temple-hall` / `--name temple-altar` で焼く
4. 検算 3 指標(累積ドリフト ≤ 4.0 / 位相ズレ ≤ 2.0 / score 比 ≥ 70%)。⛔ **閾値を緩めない**
5. `ROOM_PAINTINGS_DEF["undead-temple"]` へ `n4big` / `n7big` を足し、**障害物マスクを手で書く**
   - ⚠ `rect` は `tileBounds` と**同値**にする(`paintingAspectFits` が縦横比の完全一致を要求)
   - ⚠ 規則④ = 横断路の行を端から端まで切らさない。⚠ 検査は **4 近傍**
   - ⚠ 敵 11 体 + カエルムを置くタイルは**必ず `.`** にする
   - ⭐ 目視は**本番の絵 + 本番のマスク**をブラウザに読ませて行う。⛔ 道具の中にマスクを書き写さない

---

## 6. STEP3 — 畳みと撤退スイッチ

`buildOrcFortRun`(`index.html:37581`)をテンプレートにする。⚠ 写経ではなく、各行の理由を確かめて書く。

    const TEMPLE_FOLD_OFF = (() => {
      try { return new URLSearchParams(window.location.search).get("templefold") === "0"; }
      catch (e) { return false; }
    })();
    const TEMPLE_FOLDED = !TEMPLE_FOLD_OFF;     // ⚠ 置き場所は FORT_FOLD_OFF の隣 (§2-7 の TDZ)

    function buildUndeadTempleRun() {
      /* ★[#66] 旧 n1「納骨堂」/ n2「崩れた書庫」/ n3「副葬品の間」に居た 7 体を
       *   儀式の広間 (n4) へ移設したぶん。⭐ 体数も種類も変えていない
       *   (skeleton x2 / zombie x3 / skeletonArcher x2 = 旧 3 + 2 + 2)。
       * ⭐ 2 群が上限 — 西群と東群の最短は DETECTION_RANGE 12.5 タイルを超えること。
       * ⚠ 畳んでいないとき (?templefold=0) は 1 体も足さない (旧構成では n1/n2/n3 に居る)。 */
      const FOLD_MOVED_TEMPLE = TEMPLE_FOLDED ? [ /* 西群 5 + 東群 2 = 7 体 */ ] : [];
      const run = buildP6Run("undead-temple", "undead-temple", {
        n0: { name: "神殿の前庭" },
        /* n1 / n2 / n3 / n5 / n6 は ?templefold=0 の旧構成にだけ生きる (中身は現状のまま) */
        n4: TEMPLE_FOLDED
          ? { name: "儀式の広間",
              rect: <tileBounds と同値>, paint: "n4big", density: 0,
              start: { tx: <入場>, ty: <入場> },
              slots: [ /* 元の 4 体 */ ].concat(FOLD_MOVED_TEMPLE)
                     .concat([[<経路隣接>, <経路隣接>, "caelum"]]) }   /* ★§2-2 */
          : { name: "儀式の広間", slots: [ /* 現状のまま */ ] },
        n7: TEMPLE_FOLDED
          ? { name: "召喚の祭壇", rect: <同値>, paint: "n7big", density: 0,
              start: { tx: <入場>, ty: <入場> },
              slots: [ /* skeleton x2 */ ], boss: [<>, <>, "lich"] }
          : { name: "召喚の祭壇", slots: [ /* 現状のまま */ ], boss: [40, 13, "lich"] },
      });
      if (!TEMPLE_FOLDED) return run;          // ?templefold=0 = 8 ノードの旧構成
      const pick = (id) => run.nodes.find(n => n.id === id);
      const n4 = pick("n4"), n7 = pick("n7");
      return { entry: "n4",
               nodes: [ { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits }, n7 ] };
    }

**⛔ 動かしてはいけないもの**:

- ⛔ **n4 / n7 の mapDef をここで組み直さない。** `buildP6Run` が作ったものを `pick()` で取り出す。
  組み直すと「畳んだ版と畳まない版で幾何が違う」中間状態が生まれ、既存 golden の対象が別物になる
- ⛔ **敵の顔ぶれを 1 体も変えない。** 動くのは座標だけ(rect が変わる以上避けられない)
- ⚠ `kind:"boss"` はグラフに**ちょうど 1 つ** = n7 だけ(`validate` / `lintRun` が要求)
- ⚠ n4 の `kind` は **`"start"`**(entry になるため)
- ⚠ `start` を既定のままにすると、`buildNode` の「起点の床保証」が絵の中に**無言で穴を開ける**。
  入場地点 = 左辺の中点 + `NODE_ENTRY_INSET(2)`
- ⚠ `density: 0`(既定 1 のままだと、描き込み済みの絵の上に scenery が湧く)
- ⚠⚠ **編集後に `index.html` の行末が CRLF のままか確認する**(実装窓からの申し送り・2026-09-11)。
  #65 で `.gitattributes` が入り、**既定 `eol=lf` + `*.html` / `js/*.js` / `audio.js` だけ CRLF**。
  #65 の項目3 が `driver_doors_p2.js` に混在を作り込んだ前例がある。
  ⛔ **行末を `grep` で測ると嘘が返る**(LF ファイルに「CR 行数 = 総行数」が返る)。`py` か `od -c` で測る。
  ⭐ これは §8 の変異アンカーにも直結する(アンカーが 1 行なのは CRLF だから)

さらに `NODE_EXTRA_SPAWN_KINDS` へ 1 行(§2-4):

    if (TEMPLE_FOLDED) t["undead-temple"] = { n4: ["search", "loot"] };

---

## 7. 撤退スイッチ

- **`?templefold=0`** — 畳む前の **8 ノード構成へ完全に戻る**(n0〜n7 の小部屋 / 分岐 /
  n5 の rest / n6 のカエルム / 旧 7x6 の絵 / `density` 既定)
- ⚠ 判定位置 = `index.html` の `FORT_FOLD_OFF` の隣(§2-7)。**ページ遷移をまたがない**
  (畳みは `index.html` 内で完結し、`tavern.html` は神殿のグラフを持たない)
- ⛔ `?fortfold=0` など既存の撤退スイッチには**一切触らない**

---

## 8. 受入条件 — `tools/verify_temple_fold.js`(新規・base **10261**)

測るのは「**畳んだ神殿が最後まで遊べること**」と「**隠し要素が畳んでも生きていること**」の 2 本柱。
⭐ 幾何の値(rect / cells / period)は台帳から**導出**して当てる。⛔ ドライバ側へ写経しない
(実装とドライバが同じ間違いを共有すると両方緑になる)。

⚠ ポートは `PORT..PORT+N` を掴む。**既存の最大は #65 の 10241(子 10242〜10249)**なので
**10261 以降**を使う。⚠ 新しい base を決めたら **まず 1 回 goto して `ERR_UNSAFE_PORT` が出ないか**
確かめる(#56 が 10080 で踏んだ)。

### §0 装置(先に母集団を確かめる)

- **(0a)** 畳んだ神殿の `RUN.nodes` が **2 件**、`entry === "n4"`、`kind:"boss"` が**ちょうど 1 つ**。
  ⭐ ノード数は spec でなく **`buildUndeadTempleRun()` の戻り値**から数える(#62 の教訓)
- **(0b)** 変異アンカーが `index.html` に**実在する**ことを起動時に検算し、1 つでも空振りしたら **exit 3**。
  ⭐ #65 が踏んだ偽の EXIT=3 の再発防止。⚠ アンカーはドライバから読み出して当てる
- **(0c)** カエルムの検出器が空振りしていないこと = `enemies` の中に `def.isNpcSpirit` が
  **ちょうど 1 体**居る。⛔ これが無いと (2a)(2b) が永久緑になる

### §1 畳みの形

- **(1a)** n4 の `slots` が **11 体 + カエルム 1 体**。⭐ 種類の内訳を `?templefold=0` の
  旧 n1+n2+n3+n4 の合計と**突き合わせる**(2 経路。片方の写経にしない)
- **(1b)** n4 / n7 の `rect` が `ROOM_PAINTINGS_DEF` の `tileBounds` と**同値**
- **(1c)** 全スロットとボスが、マスクの `.` のタイルに載っている
- **(1d)** `density === 0`、`start` が左辺の中点 + 2

### §2 カエルム(⭐ 本チケットの核心)

- **(2a)** カエルムが `inactive === true` かつ **`passiveNpc === true`**(§2-3)
- **(2b)** ⭐⭐⭐ **実プレイ走行で対話が発火する**。畳んだ神殿を autoplay で走らせ、
  n4 の戦闘が終わったあと **N 秒以内**に `caelumResolved === true` になる。
  ⚠ `showCharChoice` は autoplay 時に index 0(弔い = 友好ルート)を自動選択するので走行は完走する
- **(2c)** カエルムのスロットから、出口 `P6_RIGHT` への経路上の最も近いタイルまでの中心間距離が
  **150px 以下**(§2-2)。⭐ これは (2b) が非決定論で揺れたときに原因を切り分ける静的な腕

### §3 クリアできること

- **(3a)** n4 で全敵撃破後に `isNodeSettled()` が **true** になる(= カエルムが止めない)
- **(3b)** autoplay で n4 → n7 → ボス撃破まで到達する

### §4 罠と宝箱(§2-4)

- **(4a)** 畳んだ神殿で `NODE_EXTRA_SPAWN_KINDS["undead-temple"].n4` が `["search","loot"]`
- **(4b)** 実走で罠と宝箱が **1 個以上**湧いている。⛔ 0 個なら赤

### §5 恒等(非退行)

- **(5a)** 他 5 シナリオの `mapDef` が `JSON.stringify` で**畳む前と完全一致**
  (⭐ `buildP6Run` の既定値を 1 ビットも動かしていないこと)

### §6 撤退

- **(6a)** `index.html?templefold=0` → `RUN.nodes` が **8 件**、`entry === "n0"`
- **(6b)** `?templefold=0` で n4 の `slots` が **4 体**(移設が載らない)
- **(6c)** `?templefold=0` で `NODE_EXTRA_SPAWN_KINDS["undead-temple"]` が **undefined**

### ⛔ 測らないこと

- ⛔ **絵の見た目**(配色・質感・墓所が「特別に見えるか」)。目で決める
- ⛔ **難易度**(11 体を 1 部屋で捌けるか)。難易度・XP のチケットの仕事
- ⛔ **カエルムの対話の文面**。`runCaelumDialog` は 1 文字も触らない

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `caelumfar` | ⭐⭐⭐ カエルムのスロットを出口の経路から **3 タイル**離す | §2 (2b)(2c) |
| `caelumnopassive` | `initCaelum` の `e.passiveNpc = true` を落とす | §3 (3a) |
| `noextraspawn` | `NODE_EXTRA_SPAWN_KINDS` の神殿の行を消す | §4 (4a)(4b) |
| `slotdrop` | 移設 7 体のうち 1 体を落とす | §1 (1a) |
| `rectmismatch` | n4 の `rect` を 1 列狭める | §1 (1b) |
| `densityone` | `density: 0` を 1 へ | §1 (1d) |
| `foldalways` | `?templefold=0` でも畳む | §6 (6a)(6b) |

⚠ 変異の置換文字列は**必ず 1 行**(`index.html` は **CRLF** なので `\n` を含むと原理的に一致しない)。
⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
⭐ 変異は「注入できたか」でなく「**測っている場所に現れるか**」まで設計する(#54 の教訓)。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/driver_graph_p6.js` → §2-6 のとおり**期待表を言い直したうえで** N/N
- `node tools/driver_graph_p7.js` → ⭐ **触らずに緑のまま**であること(#63 が移設済み)
- 母集団 **35 本以上**(STEP1 で引き直した本数)の exit / 集計行 / FAIL 行の集合が
  STEP1 の記録と一致すること

⚠ 基準値は 2026-09-11 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める。**

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレーション音声が無音)。

1. 2 枚の絵が**同じ神殿に見えるか**(配色・石の質感・光)
2. 30x20 の大部屋 2 枚が **390px 幅**で描画負荷に耐えるか(⭐ 砦の n4big / n7big が同サイズで出荷済み)
3. カメラ追従がガクつかないか(`project_camera_perf` の 16.9ms/frame を割らないか)
4. **カエルムに実際に話しかけられるか**(⭐ (2b) が緑でも、プレイヤーの目で「気づけるか」は別)
5. 11 体が同時に見える場面のスプライト描画

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>地下神殿が 2 枚の大部屋になった</b> — 細かい小部屋を抜けて回る形をやめ、納骨堂から儀式の広間までを一続きの広い床で戦い抜く。"

---

## 11. やらないこと

- ⛔ **F4 竜の巣の畳み** — #67。⭐ MAP 2 枚は #66 のうちに発注し **2026-09-11 に納品済み**
  (`codex1/assets/maps/dragon-vale-v1.png` / `dragon-nest-v1.png`。発注文 =
  `codex1/requests/2026-09-11_dragon-lair-maps.md`)。⭐ 目視で**財宝ゼロ** / ボス部屋の
  **西半分の空白** / 横断路が西端から東端まで途切れないことを確認済み。
  ⚠ **ボス部屋は左辺の入口(裂け目)が岩で塞がって見える** — マスクで左辺中央を開けるかを
  #67 の STEP2 で判断すること。⚠⚠ #67 では `spawnDragonHoard` が
  ボス部屋の**西 45%**(`westLimit = c1 + floor((c2-c1)*0.45)`)に財宝とミミックを撒く問題を解く必要がある
  (9x6 で 4 列 → 30x20 で **13 列**に散る)
- ⛔ **n5「聖水の泉」の rest の復活** — 廃坑 P8 / 沼 #62 / 砦 #63 と同じ。補填は難易度・XP のチケット
- ⛔ **難易度・XP の再調整** — 未調整の要因が 5 つ。⚠ その測定台 `sweep_recruit_balance` と
  `probe_party_size` が**両方壊れている**ので、そのチケットは道具の修理を内包する
- ⛔ **測定台の一斉健康診断 / 母集団ランナー** — 別チケット(138 本中 57 本しか色が分かっていない)
- ⛔ **`?fortfold=0` など既存の撤退スイッチの削除**
- ⛔ **`runCaelumDialog` の文面・分岐の変更**
- ⛔ **`battle.html` の `knight_anim.png` 欠け** — 死んだフォーク(initial commit 以降 1 度も
  触られていない)なので直す価値がない。消すか放置かは別途

**`実装依頼書/README.md` へ足す行**(⭐ 並走窓が無いので**着手時にそのまま足してよい**):

    | 66 | [2026-09-11_temple-fold.md](2026-09-11_temple-fold.md) | **承認済** | 0% | 神殿を **8 ノード → 2 ノード**へ畳む(旧タイプ MAP 全廃 F3)。⭐⭐⭐ 最大の地雷は **`CAELUM_TALK_RADIUS = 150px = 1.56 タイル`** — 隣接 1 タイルは届くが 2 タイルは届かず、判定は**主人公の中心だけ**。今 n6 で必ず発火しているのは 7x6 という幾何の偶然にすぎない ⇒ カエルムは**出口への経路に隣接するタイル**へ置く。⭐ 砦の「守護者を大部屋へ移すとクリア不能」は**神殿にはかからない**(`initCaelum` は `passiveNpc` も立てる)。⚠ `NODE_EXTRA_SPAWN_KINDS` へ n4 兼務を足さないと罠と宝箱が無言でゼロ。⚠⚠⚠ `--fit` の一次解は信じない((位相 × 周期) の 2 次元で振る)。⚠ `driver_graph_p6.js:62` の期待表が腐る / `driver_graph_p7` は腐らない。撤退 `?templefold=0`。受入 `verify_temple_fold`(新規・base **10261**) |

---

## 12. 実装結果

### 12-0. 着手前の基準(STEP1)

- **測定日**: 2026-09-11(実装窓・項目1)
- **着手直前の `HEAD`** = `0b9034d` / 作業ツリー **clean** / 未 push **3 本** / `origin/main` = `8566218`
  (orchestrator の実測値と**完全一致**)
- ⛔ 本番コード(`index.html` / `tavern.html` / `audio.js`)も `tools/` の既存ファイルも
  **1 バイトも触っていない**。走行後に `git status --porcelain` を取り直して確認済み
- ⚠⚠ 検証ドライバを `timeout` で**包んでいない**(§4-4)。完了は終了コードでなく集計行で判定した
- ⚠⚠ **本番ツリーでそのまま逐次実走**。⛔ `git worktree` の隔離ツリーは使っていない
  (`git worktree list` に残る 10 本の `df_*_baseline` は各ドライバが自分で作る物 = 触っていない)
- **総所要 = 202 分**(母集団 131 本・逐次・PowerShell スイープ / 18:49:50 → 22:12:33)
  + 母集団外 6 本 = 2.5 分 + フレーク確認の単独再走 1 本 = 3.7 分
- **生ログ**(⭐ 項目5 はこの表ではなく**生ログ**と突き合わせること):
  `…\scratchpad\step1_baseline\<name>.log`(137 本 + `driver_mine_wall_RERUN.log`)
  / 一覧 = `baseline_all.tsv` / `baseline_table.tsv` / 非緑の抜粋 = `nongreen.txt`

#### (a) 母集団の引き方と実測本数 — 下限 35 本に対し **実測 132 本**

⭐ §2-6 の **35 本**(`grep -l "undead-temple\|dragon-lair" tools/*.js`)は**舞台名の名指し**で、
#64 の一般解どおり「**#66 で変更するファイルを読むか**」で引き直すと **132 本**になった(**3.8 倍**)。

引き方(`tools/*.js` のうち `verify_` / `driver_` / `probe_` / `sweep_` で始まる **138 本**が対象。
⛔ ヘルパ `_golden.js` / `_pptr_profile.js` / `_doors_fixture.js` / `auto_debug_run.js` /
`sim_plaza_entry.js` は「単体で `node <file>` として走るドライバ」ではないので除外):

1. #66 で変更するファイル = `index.html` / `tavern.html` / `tools/make_grid_map.py` /
   `tools/driver_graph_p6.js` / `assets/room_undead-temple_n4_map.jpg` `_n7_map.jpg`
2. 各ドライバから**ブロックコメントと行コメントを落としてから**これらの語を探す
   (⚠ `grep -l` はコメントも拾う = #47 の罠)

実測の内訳:

| 区分 | 本数 | 備考 |
|---|---|---|
| `index.html` または `tavern.html` を**コードで**参照 | **132** | ⇒ これが母集団 |
| ↳ うち `tools/make_grid_map.py` も読む | 7 | `verify_codex_map_skill` / `verify_tavern_map` / `verify_town_map` / `verify_road_ambush` / `driver_grid_p4` / `driver_grid_p5` / `driver_grid_p7` |
| ↳ うち `driver_graph_p6` を名指し | 4 | `driver_graph_p6` 自身 / `driver_graph_p7` / `driver_heromark_signplate` / `probe_s2_fold` |
| **コメントでのみ**言及(母集団外) | 2 | `verify_world_steps` / `verify_world_heromark` |
| 参照なし(母集団外) | 4 | `driver_bgm_title` / `driver_doors_p1` / `probe_town_mask` / `verify_road_events` |

⭐ 母集団外の 6 本も**念のため実走した**(#47「取りこぼした 1 本が赤いまま出荷された」の再発防止)。
**6 本とも EXIT=0**(下表の末尾)。

⚠ **実走したのは 131 本。** `probe_party_size` は §4-5 のとおり**既知の無限走行**なので
**走らせず「未測定(既知の無限走行)」と記録する**(#65 は 941.5 秒で手停止 / #64 は 900 秒で打ち切り)。

#### (b) 全ドライバの色(137 本 = 母集団 131 実走 + 母集団外 6)

⚠ 集計行は原文のまま(装飾の罫線だけ縮めてある)。**秒**は逐次実走時の実測。

| ドライバ | exit | 集計行 | FAIL 行 | 秒 |
|---|---|---|---|---|
| `driver_action_priority` | 0 | `[driver] RESULT: PASSED 92 / FAILED 0 / PENDING 0` | — | 127 |
| `driver_bgm_mine` | 0 | `37/37 PASS` | — | 11 |
| `driver_bgm_town` | 0 | `17/17 PASS` | — | 2 |
| `driver_cast_circle` | 0 | `56/56 PASS` | — | 4 |
| `driver_choice_logslot` | 0 | `[drv] 29/29 PASS   (--mutate nope)` | — | 5 |
| `driver_cleanup_phase1` | 0 | `[driver] RESULT: 28/28 passed` | — | 18 |
| `driver_cleric_sprites` | 0 | `[driver] RESULT: 85/85 passed` | — | 1 |
| `driver_depart_menu_clean` | 0 | `══ 結果: 41/41 PASS ══` | — | 126 |
| `driver_dev_gate` | 0 | `[driver] RESULT: 52/52 passed` | — | 25 |
| `driver_dev_gate2` | 0 | `══ 結果: 62/62 PASS ══` | — | 27 |
| `driver_diag_watchdog` | 0 | `PASS 34 / FAIL 0` | — | 661 |
| `driver_doors_p2` | 0 | `══ 結果: 40/40 PASS ══` | — | 21 |
| `driver_doors_p5` | 0 | `══ 結果: 35/35 PASS ══` | — | 17 |
| `driver_doors_p6` | 0 | `══ 結果: 40/40 PASS ══` | — | 25 |
| `driver_doors_p8` | 0 | `══ 結果: 18/18 PASS ══` | — | 7 |
| `driver_elf_sprites` | 0 | `[driver] RESULT: 87/87 passed` | — | 1 |
| `driver_encounter_mopup` | 0 | `[drv] 36/36 PASS` | — | 355 |
| `driver_equip_compact_ios` | 0 | `=== WORKTREE: 31/31 PASS ===` | — | 46 |
| `driver_field_scale` | 0 | `[drv] working: 49/49 PASS` | — | 24 |
| `driver_field_step0` | 0 | `=== 測定妥当性 33/33 PASS ===` | — | 703 |
| `driver_field_step05_hud` | 0 | `=== 測定妥当性 6/6 PASS ===` | — | 44 |
| `driver_field_step1_geo` | 0 | `=== 71/71 PASS ===` | — | 100 |
| `driver_field_step2` | 0 | `RESULT: 64/64  ALL PASS` | — | 39 |
| `driver_field_step3` | 0 | `RESULT: 65/65  ALL PASS` | — | 69 |
| `driver_field_step5` | 0 | `=== driver_field_step5  48/48 PASS ===` | — | 5 |
| `driver_field_step6_png` | 0 | `RESULT: 16/16  ALL PASS` | — | 20 |
| `driver_field_step7` | 0 | `=== driver_field_step7  79/79 PASS ===` | — | 245 |
| `driver_field_verge_gap` | 0 | `RESULT: 39/39  ALL PASS` | — | 24 |
| `driver_field_wagon` | 0 | `=== 測定妥当性 18/18 PASS ===` | — | 594 |
| `driver_fix4_help_bonus` | 0 | `[driver] RESULT: 13/13 passed` | — | 4 |
| `driver_graph_arrows` | 0 | `[drv] 80/80 PASS   (--mutate nope)` | — | 14 |
| `driver_graph_kinds` | 0 | `[drv] 66/66 PASS   (--mutate nokind)` | — | 37 |
| **`driver_graph_p6`** | 0 | `══ 結果: 248/248 PASS ══` | — | 41 |
| **`driver_graph_p7`** | 0 | `══ 結果: 60/60 PASS ══` | — | 4 |
| `driver_graph_reentry` | 0 | `[drv] 57/57 PASS   (--mutate nodom / cycles=5)` | — | 2 |
| `driver_graph_run` | 0 | `[drv] 99/99 PASS   (--mutate nosave)` | — | 49 |
| `driver_graph_sce1` | 0 | `[drv] 106/106 PASS` | — | 209 |
| `driver_grid_p3b` | 0 | `PASS 44 / FAIL 0` | — | 17 |
| **`driver_grid_p4`** | **3** | **集計行が出ない**(変異アンカー空振りで素の assert が 1 本も走らない) | ⛔ | 0 |
| `driver_grid_p5` | 0 | `PASS 103 / FAIL 0` | — | 170 |
| `driver_grid_p7` | 0 | `PASS 44 / FAIL 0` | — | 26 |
| **`driver_grid_p8`** | **1** | `PASS 55 / FAIL 1` | `(6d)` | 288 |
| `driver_grid_p9` | 0 | `[drv] 52/52 PASS` | — | 465 |
| `driver_grid_s2` | 0 | `[drv] 116/116 PASS` | — | 5 |
| `driver_heromark_signplate` | 0 | `46 / 46`(⭐ PASS の語を含まない) | — | 14 |
| `driver_leader_ai` | 0 | `[driver] RESULT: 42/42 passed` | — | 32 |
| `driver_log_compact` | 0 | `[driver] RESULT: 29/29 passed` | — | 5 |
| `driver_mapdef_step1` | 0 | `=== 208/208 PASS ===` | — | 19 |
| `driver_mapdef_step2` | 0 | `74/74 PASS` | — | 116 |
| `driver_mapdef_step3` | 0 | `122/122 PASS` | — | 114 |
| **`driver_mapeditor_painting`** | **1** | `PASS 105 / FAIL 1  (合計 106)` | `§1 1d2` | 8 |
| `driver_mapeditor_pointer` | 0 | `PASS 31 / FAIL 0  (合計 31)` | — | 21 |
| `driver_mapeditor_props` | 0 | `PASS 71 / FAIL 0  (合計 71)` | — | 4 |
| `driver_mapeditor_railkit` | 0 | `PASS 134 / FAIL 0  (合計 134)` | — | 8 |
| `driver_mapeditor_texture` | 0 | `PASS 30 / FAIL 0  (合計 30)` | — | 4 |
| `driver_mapeditor_waterkit` | 0 | `PASS 138 / FAIL 0  (合計 138)` | — | 8 |
| `driver_mine_wall` | **0**(再走) | `66/66 PASS` ⚠ スイープ中は 1 度だけ `64/66`(下記 (d) のフレーク) | — | 221 |
| `driver_monsters_chimera` | 0 | `[driver] RESULT: 17/17 passed` | — | 34 |
| `driver_monsters_griffon` | 0 | `[driver] RESULT: 17/17 passed` | — | 71 |
| `driver_monsters_hobgoblin` | 0 | `[driver] RESULT: 14/14 passed` | — | 57 |
| `driver_monsters_kobold` | 0 | `[driver] RESULT: 12/12 passed` | — | 10 |
| `driver_monsters_orc` | 0 | `[driver] RESULT: 7/7 passed` | — | 12 |
| **`driver_monsters_umberhulk`** | **1** | `[driver] RESULT: 21/22 passed` | 1 本 | 204 |
| `driver_paint_blocked` | 0 | `PASS 65 / FAIL 0` | — | 7 |
| `driver_paint_grid` | 0 | `PASS 21 / FAIL 0` | — | 2 |
| `driver_party_view_reopen` | 0 | `結果: 35/35 PASSED / 0 FAILED / 0 PENDING` | — | 72 |
| `driver_rogue_sprites` | 0 | `[driver] RESULT: 49/49 passed` | — | 1 |
| `driver_room_search_roll` | 0 | `[driver] RESULT: 39/39 passed` | — | 1 |
| **`driver_sce1_events`** | **1** | `[drv] RESULT: 211/214 passed` | `(2)` `(4d)` `(N2-隣)` | 48 |
| `driver_scroll_autoskip` | 0 | `[driver] RESULT: 9/9 passed` | — | 4 |
| `driver_skillcheck_roster` | 0 | `[driver] RESULT: 13/13 passed` | — | 4 |
| `driver_spawn_not_on_gate` | 0 | `[drv] 59/59 PASS` | — | 4 |
| `driver_speech_boss` | 0 | `[driver] RESULT: 19/19 passed` | — | 16 |
| `driver_speech_engine` | 0 | `[driver] RESULT: 17/17 passed` | — | 14 |
| `driver_speech_hooks` | 0 | `[driver] RESULT: 13/13 passed` | — | 134 |
| **`driver_speech_v2`** | **1** | `[driver] RESULT: 45/46 passed` | `(A1)` | 43 |
| `driver_trap_disarm` | 0 | `[driver] RESULT: 44/44 passed` | — | 1 |
| `driver_trap_weaponize` | 0 | `[driver] RESULT: 43/43 passed` | — | 1 |
| `driver_wall_face` | 0 | `[drv] 54/54 PASS` | — | 32 |
| `driver_wall_props` | 0 | `[drv] 29/29 PASS` | — | 16 |
| `driver_wallbox` | 0 | `28/28 PASS` | — | 6 |
| `driver_warrior_variants_sprite` | 0 | `[driver] RESULT: 50/50 passed` | — | 1 |
| **`probe_bandit_map`** | **3** | `[probe] --mapdefs / --places / --grid / --ai のどれかを指定` | ⛔ 使い方 | 0 |
| `probe_boss_latch` | 0 | `[prb] 5/5 PASS` | — | 45 |
| **`probe_n4_stall`** | **1** | `[probe] 試行 1: 停滞は観測されませんでした` | ⭐ 正常 | 97 |
| `probe_p9_tour` | 0 | `→ 4 か所すべて回れた: 4 / 4` | — | **1675** |
| `probe_paint_overlay` | 0 | `tally={"rock":0,"door":0,"ring":118,"mask":411,"floor":368}` | — | 4 |
| `probe_rest_premature` | 0 | `[probe] 休憩 4 回中、周囲に未参戦の生存敵がいたのは 1 回` | — | 207 |
| **`probe_s2_fold`** | **3** | `[probe] --kinds / --lint のどちらかを指定` | ⛔ 使い方 | 0 |
| `probe_s4_relocate` | 0 | `[probe] raw: …\probe_s4_relocate.json` | — | 2 |
| **`probe_swamp_map`** | **3** | `[probe] --bfs を指定してください` | ⛔ 使い方 | 0 |
| `verify_ability_scores` | 0 | `24/24 PASSED   FAILED 0   **PENDING** 0` | — | 3 |
| `verify_aoe_coverage` | 0 | `28/28 PASSED   FAILED 0   PENDING 0` | — | 2 |
| **`verify_codex_map_skill`** | **1** | `16/17 PASSED   FAILED 1   **PENDING** 0` | `(3a)` | 14 |
| `verify_cone_cast` | 0 | `19/19 PASSED   FAILED 0   **PENDING** 0` | — | 80 |
| `verify_darkvision` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 79 |
| `verify_enemy_name_label` | 0 | `30/30 PASSED   FAILED 0   **PENDING** 0` | — | 2 |
| `verify_eol_doorfix` | 0 | `素 25/25 PASSED` | — | 5 |
| `verify_fort_fold` | 0 | `PASS 30 / FAIL 0` | — | 1 |
| `verify_hold_person` | 0 | `31/31 PASSED   FAILED 0   PENDING 0` | — | 10 |
| `verify_mercenary_roster` | 0 | `[mercenary-roster] 44 PASSED / 0 FAILED / 0 PENDING` | — | 19 |
| `verify_npc_crowd` | 0 | `33/33 PASSED   FAILED 0   **PENDING** 0` | — | 72 |
| `verify_party_four` | 0 | `PASS 17 / FAIL 0` | — | 7 |
| `verify_party_match_setup` | 0 | `[driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0` | — | 100 |
| `verify_party_promises` | 0 | `35/35 PASSED   FAILED 0   PENDING 0` | — | 249 |
| `verify_player_sheet` | 0 | `73/73 PASSED   FAILED 0   **PENDING** 0` | — | 56 |
| `verify_pm_drawer_fit` | 0 | `75/79 PASSED   FAILED 0   PENDING 4` | — | 70 |
| `verify_prep_retire` | 0 | `30/30 PASSED   FAILED 0   PENDING 0` | — | 147 |
| `verify_quest_visibility` | 0 | `素 39/39 PASSED  (PENDING 0)` | — | 16 |
| `verify_quest_walk` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 207 |
| `verify_recruit_size` | 0 | `══ 結果: 91/91 PASS ══` | — | 72 |
| `verify_recruit_talk` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 65 |
| `verify_road_ambush` | 0 | `41/41 PASSED` | — | 70 |
| `verify_road_boon` | 0 | `20/20 PASSED   FAILED 0   **PENDING** 0` | — | 72 |
| `verify_roll_target` | 0 | `30/30 PASSED   FAILED 0   **PENDING** 0` | — | 140 |
| `verify_run_chronicle` | 0 | `[run-chronicle] 73 PASSED / 0 FAILED / 0 PENDING` | — | 220 |
| `verify_save_slots` | 0 | `[save-slots] RESULT: 30/30 passed` | — | 5 |
| `verify_swamp_fold` | 0 | `PASS 30 / FAIL 0` | — | 3 |
| `verify_swamp_lair` | 0 | `PASS 26 / FAIL 0` | — | 3 |
| `verify_swamp_novice` | 0 | `PASS 34 / FAIL 0` | — | 11 |
| `verify_tavern_map` | 0 | `43/43 PASSED   FAILED 0   **PENDING** 0` | — | 23 |
| `verify_title_screen` | 0 | `[title-screen] RESULT: 86/86 passed` | — | 69 |
| `verify_town_exit` | 0 | `素 23/23 PASSED  (PENDING 0)` | — | 8 |
| `verify_town_map` | 0 | `85 / 85`(⭐ PASS の語を含まない) | — | 54 |
| **`verify_walk_block`** | **1** | `22/23 PASSED   FAILED 1   **PENDING** 0` | `(3d)` | 16 |
| `verify_world_map` | 0 | `57/57 PASSED   FAILED 0   **PENDING** 0` | — | 80 |
| **`driver_field_step6`** | **1** | `=== 56/59 PASS ===` | `(C-bandits-forest)` `(C-lizard-swamp)` `(C-orc-fort)` | **1649** |
| `driver_field_step1` | 0 | `=== 95/95 PASS ===` | — | 78 |
| **`driver_mapeditor`** | **1** | `[driver] 176/179 PASS  (FAIL 3)` | `§2 12b` `§3 12a` `§3 12b` | 3 |
| `probe_s2_clear` | 0 | `[probe] ✓ 全 3 走行が装置 assert を通りました` | — | 167 |
| **`sweep_recruit_balance`** | **1** | `[sweep] ⛔ 装置 assert が崩れた走行が 4/4 件あります` | 装置崩れ | 135 |
| `probe_party_size` | — | **未測定(既知の無限走行)** — §4-5 のとおり走らせていない | — | — |
| `driver_bgm_title` ※外 | 0 | `16/16 PASS` | — | 2 |
| `driver_doors_p1` ※外 | 0 | `PASS 44 / FAIL 0` | — | 0 |
| `probe_town_mask` ※外 | 0 | `到達できないマス = 0 件 (0 件が正常)` | — | 1 |
| `verify_road_events` ※外 | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 86 |
| `verify_world_heromark` ※外 | 0 | `18/18 PASSED   FAILED 0   **PENDING** 0` | — | 10 |
| `verify_world_steps` ※外 | 0 | `33/33 PASSED   FAILED 0   **PENDING** 0` | — | 55 |

⇒ **緑 121 本 / 赤 15 本 / 未測定 1 本**(母集団 132 本のうち実走 131)。母集団外 6 本は全部緑。

#### (c) 着手前から赤い **15 本** — 赤の理由 1 行つき(#55 の 3 分類)

| ドライバ | exit | 型 | 赤の理由(1 行) |
|---|---|---|---|
| `driver_grid_p4` | 3 | **3**(無関係) | 変異 `n1ringonly` のアンカー(廃坑 n1 のマスク行 `// 9 ★東西の主通路…`)が腐って**置換対象 0 箇所** ⇒ 起動時検算で即死。⚠⚠ **素の assert が 1 本も走っていない** |
| `driver_grid_p8` | 1 | **3** | `(6d)`「他 4 シナリオの n7 (9x6) は大部屋ではない」— 砦 #63 で n7 が 30x20 になったので `bigRoom:true` |
| `driver_mapeditor_painting` | 1 | **3** | `§1 1d2` label 13 種に対しサイズの種類数 12(`部屋n4big 30×20` と `部屋n7big 30×20` が同寸) |
| `driver_monsters_umberhulk` | 1 | **3** | 21/22。umber hulk の gaze 再発火 1 件(#64/#65 と同一) |
| `driver_sce1_events` | 1 | **3** | `(2)(4d)(N2-隣)` `sceneFlags` の期待表が 3 本固定なのに `s3_novice_swayed`(#53 沼の若い司祭)が増えて **4 本** |
| `driver_speech_v2` | 1 | **3** | `(A1)` `swampNovice` に `enemy.cry.<type>` が無い(#53 で敵種だけ増えた) |
| `verify_codex_map_skill` | 1 | **3**(⚠ 要注意) | `(3a)` 既存 4 件の焼き直し SHA 照合で **`stag-tavern` だけ不一致**。⚠⚠ **`tools/make_grid_map.py` を読む唯一の受入ドライバ** = STEP2 で `GRIDS` に 2 エントリ足す本チケットの隣人 |
| `verify_walk_block` | 1 | **3** | `(3d)` badge を持つ `ENEMY_TYPES` が期待 44 件に対し **45 件**(`goblinRider`/`goblinArcher` を名指し) |
| `driver_field_step6` | 1 | **1 の予兆** | `(C-bandits-forest)(C-lizard-swamp)(C-orc-fort)` の 3 本。⭐⭐⭐ **畳んだシナリオは入口ノードがそのまま戦闘部屋になり「前進した」が成立しない**(#63 §13-4)。⇒ **#66 が神殿を畳むと `(C-undead-temple)` が 4 本目として必ず赤くなる**。⛔ `?templefold=0` で緑にするのは Part C の注記が禁止 |
| `driver_mapeditor` | 1 | **3** | 176/179。`map-editor.html` の実マウス操作 3 本(#64/#65 と同一) |
| `sweep_recruit_balance` | 1 | **3** | 装置崩れ 4/4(`4_partySize(got=1 want=4)` = #61 以降の腐り。#65 と同一) |
| `probe_bandit_map` | 3 | **—** | ⭐ **赤ではない**。調査プローブで、引数なしは「使い方の誤り = exit 3」が仕様 |
| `probe_s2_fold` | 3 | **—** | 同上(`--kinds` / `--lint` 必須) |
| `probe_swamp_map` | 3 | **—** | 同上(`--bfs` 必須) |
| `probe_n4_stall` | 1 | **—** | ⭐ **赤ではない**。「停滞が観測されなかった」= 健全。exit 1 が正常系 |

#### (d) 予想と実測の食い違い — ⭐ **assert ではなく予測のほうを訂正した**

§4-5 / orchestrator が名指しした「着手前から壊れている 6 本」との突き合わせ:

| 予想 | **実測** | 判定 |
|---|---|---|
| `driver_grid_p4` EXIT=3 | **EXIT=3**(0 秒・集計行なし) | ✅ 的中 |
| `driver_mapeditor` 176/179 | **176/179 / EXIT=1** | ✅ 的中 |
| `driver_mapeditor_painting` 105/106 | **PASS 105 / FAIL 1 / EXIT=1** | ✅ 的中 |
| `sweep_recruit_balance` 装置崩れ 4/4 | **装置崩れ 4/4 / EXIT=1** | ✅ 的中 |
| `driver_monsters_umberhulk` 21/22 | **21/22 / EXIT=1** | ✅ 的中 |
| `probe_party_size` 終了しない | **走らせていない**(既知の無限走行として母集団から外した) | ✅ 指示どおり |

⛔ **ただし「6 本」は全部ではなかった。訂正 3 件:**

1. ⭐⭐⭐ **赤は 6 本ではなく 15 本(うち「本物の赤」11 本 + 「調査プローブの正常な非 0」4 本)。**
   予想に無かった赤 = `driver_grid_p8` / `driver_sce1_events` / `driver_speech_v2` /
   `verify_codex_map_skill` / `verify_walk_block` / `driver_field_step6` の **6 本**
   + プローブ 4 本。⇒ #65 が言う「**前チケットの『既知の赤』表は、母集団が変わった瞬間に不完全になる**」の
   3 例目。本チケットの母集団(132 本)は #65 の母集団(55 本)の **2.4 倍**で、重なっていない領域に赤が居た。
2. ⭐⭐ **`driver_doors_p2` は緑だった**(`結果: 40/40 PASS` / EXIT=0)。
   #62 のメモと #65 の §12-0 は `33/34`(`(6c)`)で赤と記録しているが、**#65 の項目4 が扉の測定台を
   撤退スイッチから降ろした**ので回収済み。⛔ 「昔から赤い」を引き継がないこと。
   同様に `driver_doors_p5` / `p8` も緑(35/35 / 18/18)。
3. ⭐⭐ **`driver_field_step6` は完走する。** メモの「40 分超でも完走しない」は**古い**。
   実測 **1649 秒(27.5 分)で EXIT=1 / 56/59**。⇒ #66 の項目5 でも回せる(ただし 28 分掛かる)。

**⚠ フレーク 1 本(⛔ 既知の赤には数えない)**: `driver_mine_wall` が母集団スイープ中に 1 度だけ
`64/66 / EXIT=1` になった。FAIL は `(4z)` `(4z2)` = **「戦車が実際に乱入した」母集団ガードが `[] sawAt=-`**
= #47 の言う「**偽の赤の指紋 = 値が違うのではなく観測そのものが無い**」そのもの。
**単独再走で `66/66 / EXIT=0`(221 秒)**。⇒ 型2(偽の赤)として扱い、既知の赤には数えない。

#### (e) ⭐ 測って分かった罠

- ⭐⭐⭐ **集計行の書式は 7 種どころか 14 種以上**(判定を出す 129 本の実測)。しかも
  **最多の 27 本が `[driver] RESULT: 92/92 passed` = 小文字の `passed`** なので、
  **大文字 `PASS` の grep では 137 本中 35 本(26%)の集計が空になる**
  (小文字 27 本 + 集計行そのものを持たない調査プローブ 8 本)。
  ⇒ **判定は必ず `exit code` を主、集計行を従にする**。⛔ 語で拾うのは補助にしかならない。
- ⭐⭐ **`FAIL` の語で FAIL 行を拾うと偽陽性が 6 本出る。** `verify_save_slots (7)` の
  `1:FAIL(=OK)`(撤退スイッチが効いた証拠)/ `driver_field_step1_geo` `driver_field_step2` の
  「baseline で**必ず FAIL** する」という説明文 / `… FAILED 0 …` を含む総括行。
  ⇒ **FAIL 行は「行頭が `FAIL`/`FAILED`/`NG`」で拾い、総括行は別に扱う。**
- ⭐⭐ **母集団 131 本の逐次実走は 202 分。** 内訳の偏りが極端で、**上位 6 本で 78 分**:
  `probe_p9_tour` 1675s / `driver_field_step6` 1649s / `driver_field_step0` 703s /
  `driver_diag_watchdog` 661s / `driver_field_wagon` 594s / `driver_grid_p9` 465s。
  ⇒ 項目5 の再走を計画するときは**この 6 本を別枠**にすること(残り 125 本は合計 124 分)。
- ⚠⚠ **`py` の `print` は cp932 で落ちる**(em dash)。ログ解析スクリプトは
  `PYTHONIOENCODING=utf-8` を付けて起動する。⚠ 落ちるのは print だけでファイル書き込みは成功している。
- ⚠⚠ **並走窓の痕跡を 1 件検出した。** 走行中(3.4 時間)に
  `実装依頼書/2026-09-11_dragon-lair-fold.md`(#67)が**未追跡ファイルとして出現**した。
  計画窓が #67 を起草している。⛔ **`git add .` は絶対に使わない**(本項目は
  `実装依頼書/2026-09-11_temple-fold.md` の 1 ファイルだけをパス指定で commit した)。
- ⭐ **`driver_graph_p6` は `FOLDED` 表に 1 行足すだけの受け皿を既に持っている**(`:366`)。
  `'undead-temple': { arm: '&templefold=0', sw: '?templefold', nodes: 2, entry: 'n4' }` を足せば
  装置 assert `(1templefold-undead-temple)` が自動で立つ。⛔ `(1c)` 以下の「8 件」を「2 件」へ
  書き換えるのは**誤り**(共通骨格は `?templefold=0` に生きている)。
  ⇒ §2-6 の「`driver_graph_p6` は腐る」は**正しい**が、直し方は**期待表の書き換えではなく 1 行の追記**。
- ⭐ **§2-6 の「`driver_graph_p7` は腐らない」は的中**(`TOUR_SCEN = 'orc-fort'` /
  `TOUR_ARM = '&fortfold=0'` を実測)。着手前 `60/60 PASS`。
- ⭐ **新規ドライバの base 10261 は空いている**(既存の最大 = `verify_eol_doorfix` の 10241)。
  §8 の指定どおりで問題なし。
- ⭐ **§2 の定数はすべて実測で裏が取れた**: `CAELUM_TALK_RADIUS = 150`(`index.html:24336`)/
  `TILE_SIZE = 96`(`:3421`)/ `FORT_FOLD_OFF`(`:4160`)・`FORT_FOLDED`(`:4172`)/
  `NODE_EXTRA_SPAWN_KINDS` の砦の行(`:4233`)/ `buildUndeadTempleRun`(`:37706`)。
