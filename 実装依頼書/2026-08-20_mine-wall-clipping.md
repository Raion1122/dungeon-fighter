# 廃坑の「壁抜け」と ゴブリン戦車の「壁埋まり」を直す

- **ステータス**: **承認済**(2026-08-20 — 戦車を 176px へ縮める / 旧経路にも外周封鎖を効かせる、をユーザー決定)
- **起草日**: 2026-08-20
- **実装の順序**: STEP1 → STEP2 → STEP3 → STEP4。**STEP2 の 2 項目は必ず同じコミット**(F4b)
- **対象**: `index.html` / 新規 `tools/driver_mine_wall.js`
- **元の要望(逐語)**:
  > 現在の廃坑MAPのボス部屋のゴブリン戦車が、洞窟内にとどまれず、壁に埋まったりして、壁の中を動くのが不自然なので、修正してほしい。
  > 廃坑内で、壁を貫通して歩けてしまっている（迂回しない）状態あるので、修正してほしい。

---

## 目的

1. ゴブリン戦車が **洞窟の中にとどまり、体が岩に埋まった位置に立たない/動かない**。
2. 廃坑内で **壁を貫通して歩ける場所をなくす**(= 迂回するようになる)。

手段ではなく、この 2 つで測る。

---

## 着手前に読むこと — 実測した事実

この 5 つは 2026-08-20 に本番コードを headless で走らせて採った値。**写経せず自分でも 1 回再現してから着手すること**(検出器を信じる前に本番で 1 回測る、の原則)。

### F1 配管は正しい。絵の blocked マスクは 100% 効いている

`window.__paintBlockProbe()` と `roomPaintings[].blocked` の `#` を `isTileWall` に突き合わせた結果:

| ノード | blocked マス | 判定漏れ | skipStart | skipDoor | skipSpawn | skipCorridor |
|---|---|---|---|---|---|---|
| n0 坑道の入口 | 321 | **0** | 0 | 0 | 0 | 0 |
| n1 坑道の奥 | 409 | **0** | 0 | 0 | 0 | 0 |

→ **マスクの適用漏れは 1 マスも無い**。`applyPaintingBlocking` / `paintingBlockedTilesFor` を疑って時間を使わないこと。

### F2 「壁を貫通して歩ける」の正体 = 外周 1 タイル(フェザー帯)

- 1 枚絵の作法① で、`blocked` マスクの**外周 1 タイルは意図的に全部 `.`** にしてある(n0/n1 の先頭行・末尾行・各行の先頭/末尾文字)。
- そこは絵では **岩・崖・樹林**。歩けるマス数は **n1 = 120 / n0 = 106**。
- **本番の `aStar` が実際にそこを通る**。寄り道 s1(34,4) → s2(38,3) の最短経路は **7 歩中 5 歩が row 2 = 部屋の最上行**(絵では上段の足場と岩の上)。
- 外周を塞いでも n1 の到達性は壊れない(本番 `aStar` に外周を `avoidTiles` で渡して実測):

  | 区間 | 素 | 外周を封じた場合 |
  |---|---|---|
  | 入場 → 玉座 | 23 | 23 |
  | 入場 → s1 | 13 | 13 |
  | **s1 → s2** | **7** | **15** |
  | s2 → s3 | 11 | 11 |
  | s3 → s4 | 41 | 41 |
  | s4 → 奥へ進む(39,21) | 19 | 19 |
  | 入場 → 引き返し口(19,11) | 21 | 21 |
  | 入場 → 上の梯子(34,3) | 14 | 14 |

  **s1→s2 の 7→15 が「迂回するようになった」ことそのもの**。他は 1 歩も変わらない。
- n0 の内部経路も不変(起点 → 見張り 2 体 = 11 歩 / 13 歩のまま)。

### F3 「戦車が壁に埋まる」の正体 = 体は 3x3 マスを覆うのに判定は中心 1 マスだけ

- スプライト実測(`assets/goblinChariot_anim.png`、192px フレーム): 内容 bbox = 幅 **173px (0.90)** / 高さ **139px (0.72)**、**下寄せ**(上端 44/192 = **0.229**)。
- `displaySize: 240` → 画面に描かれる体は **216 x 173px = 2.25 x 1.8 タイル**。中心タイルの上下左右へはみ出す。
- `findChariotSpawnTile` は中心 1 マスの `isTileWall` しか見ない → 現状の乱入位置は **(55,21) = 部屋の東端 = F2 の外周帯そのもの**。体の下 9 マス中 **6 マスが壁**。
- `chariotChargePath` も同じ(1 マスずつ中心だけ)。突進 1 回目の 3 ステップとも **5〜6/9 が壁**。
- n1 の床 488 マスのうち、240px の体が壁に触れずに立てるのは **116 マス (24%)**。外周を封じると **96 マス (20%)**。

### F4 体を 176px へ縮める(2026-08-20 ユーザー決定)

`displaySize: 240` → **176**。実測した効果:

| | 240 | **176** |
|---|---|---|
| 画面に描かれる体 | 216 x 173px (2.25 x 1.8 タイル) | **158 x 127px (1.65 x 1.32 タイル)** |
| 覆うタイル | 3 x 3 | **3 x 2** |
| n1 で体が壁に触れず立てるマス(床 488 中) | 116 (24%) | **174 (36%)** |
| 同・外周を封じた場合 | 96 (20%) | **152 (31%)** |
| 玉座の間の合法タイル | 30 / 封鎖時 18 | **42 / 封鎖時 30** |
| 玉座の間の最長直進レーン | 8 マス | **8 マス**(不変) |

- 玉座(49,21)から 1 マス以内の合法タイル: (48,21) (50,21) (48,22) (49,22) (50,22)。`trampleTiles: 4` は余裕で収まる。
- ⚠ 縦の閾値は **S ≤ 177.1 で 3 行 → 2 行**に変わる(体の上端 = `tile*96 + 48 - 0.271*S`)。**176 はその境界のすぐ内側**なので、スプライトを切り直したらこの効果は簡単に消える。§2 の assert が体の壁重なりを直に測るので、消えたら無言ではなく赤で分かる。

### F4b ⚠⚠ 176 に落とすと「押し出されない」性質が失われる — 必ず補償すること

`index.html:16103`

```js
function isHeavyOverlapUnit(def) {
  return !!(def && (def.isBoss || def.displaySize >= OVERLAP_BOSS_SIZE));   // OVERLAP_BOSS_SIZE = 200
}
```

戦車は **`isBoss` を持たない**(激怒/召喚/恐怖オーラのゲートに乗せたくないので意図的に外してある — def のコメント参照)。したがって `displaySize` を 176 にすると **200 を割って heavy でなくなり**:

- `resolveUnitOverlaps` の質量が `1e6` → `r²` に落ち、**毎フレーム最大 6px ずつ仲間や敵に押し出される**。footprint で「壁に触れない位置」に置いても、次フレームには押されて岩へめり込む。
- `clampLungeMag` のクランプ対象から外れ、近接攻撃の踏み込みが戦車のスプライトへめり込む。

→ **補償を必ずセットで入れる**:

```js
return !!(def && (def.isBoss || def.heavyOverlap === true || def.displaySize >= OVERLAP_BOSS_SIZE));
```

と `goblinChariot` の def へ `heavyOverlap: true`。これで**サイズに依らず不動**を保てる。
⚠ `heavyOverlap` を付けるのは **戦車 1 体だけ**。他 11 体は今まで通り `displaySize >= 200` で判定される(挙動は 1 ビットも変わらない)。

### F5 同じ欠陥を持つのは戦車だけではない(が、今回は広げない)

`displaySize ≥ 192` は **12 体**: hydra 360 / pharaxus 360 / chimera 260 / lizardChieftain 248 / griffon・lich・umber_hulk・sovereignEye・caravanWagon・goblinChariot 240 / direBear 220 / shadowBeast 192。

→ ヘルパーは汎用に作るが、**今回配線するのは戦車 1 体だけ**。7x6 の小部屋(n4/n7)に居る 360px のハイドラに footprint を要求すると **1 マスも動けなくなる**。

---

## 変更範囲

**触る**

| 場所 | 何を |
|---|---|
| `index.html:4712` `ROOM_PAINTINGS_DEF["goblin-mine"].n0` | `sealRing: true` を足す |
| `index.html:4768` 同 `.n1` | `sealRing: true` を足す |
| `index.html:5541` `applyPaintingBlocking` | 外周を塞ぐ / `skipGate` を数える |
| `index.html` `loadRoomPaintings` の `addPainting` (5138 付近) | `sealRing` を entry へ持ち回る |
| `index.html:8476` `goblinChariot` の def | `displaySize: 240 → 176` / `heavyOverlap: true` / 体の比率 3 値 |
| `index.html:8475` 同 def の上のコメント | 「`displaySize >= OVERLAP_BOSS_SIZE(200)` なので…」が **嘘になる**ので書き換える |
| `index.html:16103` `isHeavyOverlapUnit` | `def.heavyOverlap === true` の口を足す(F4b) |
| `index.html:9462` `caravanWagon` の上のコメント | 「同じ **240px 車体**の goblinChariot」が古くなる。**コメントだけ**(コード結合は無い) |
| `index.html:29458` `chariotSpawnBaseTx` / `29497` `findChariotSpawnTile` | 湧き位置を footprint 判定へ |
| `index.html:29794` `chariotChargePath` / `29833` `goblinCartTrample` | 突進を footprint 判定へ |
| `tavern.html` の `changelogList` | **必須**(`index.html` を変えるので pre-commit が止める)。`py tools/add_changelog.py "<b>…</b> — …"` |
| `tools/driver_mine_wall.js` | 新規(受入条件) |

**触らない**

- `js/df-mapdef.js` の `paintingBlockedRows` / `paintingBlockedTilesFor` — マスクの解釈式は唯一の正。今回は解釈を変えない。
- 他 11 体の大型ユニット(F5)。
- **他テーマの `n4`/`n7`**(bandits-forest / lizard-swamp / orc-fort / undead-temple / dragon-lair)。この 10 枚は `blocked` マスクを持たず、しかも **7x6 / 9x6 はゲートタイルが rect の縁に載る**(MID の `UP=[36,11]` は rect の上端行)。外周を塞ぐとノードが死ぬ。
- 絵そのもの(`assets/room_goblin-mine_n*.jpg`)。
- `blocked` マスクの**内側**の `#` 配置。サブタイルのズレ(絵の岩が半マスだけタイルにかかる)は今回の対象外 — **外周だけ**直す。

---

## 実装方針

### STEP1 — 外周帯を塞ぐ(F2 の答え)

1. `ROOM_PAINTINGS_DEF` のエントリに `sealRing: true` を足せるようにする。**付けるのは goblin-mine の n0 と n1 だけ**。
2. `addPainting` が `sealRing` を entry へ持ち回る(`blocked` とまったく同じ扱い)。
   ⚠ **`img.onload` を待たないこと**。当たり判定が画像の読み込み完了に依存すると、回線の速さで通れる場所が変わる(既存コメントの警告と同じ理由)。
3. `applyPaintingBlocking` のループで、`p.sealRing` が真なら rect の外周 1 タイルを塞ぐ候補に足す。
   - ⚠⚠ **既存の門番(元から壁 / 起点 / 扉 / 敵スポーン / 廊下)を必ず通すこと**。ここを迂回して `obstacleTileMask` へ直に書くと、**扉タイルを塞いで出口が永久に閉じる**。
   - ⚠⚠ さらに **`nodeGateTile` も門番に足す**(`skipGate` として数える)。今の廃坑 2 ノードはゲートが内側なので実害は無いが、後で外周にゲートを置いた瞬間に**無言で詰む**。
   - `paintBlockStat` に `ring`(塞いだ数)と `skipGate` を足し、`__paintBlockProbe()` から読めるようにする。**ドライバに写経させないため**。
4. 撤退スイッチ **`?paintring=0`**。`PAINT_BLOCK_OFF` と同じ作法(退避口なので `__dfDevCheat` ではゲートしない)。

### STEP2 — 体を 176px へ縮める + 不動を補償する(F4 / F4b)

**この 2 つは必ず同じコミットに入れること。**片方だけ入れた状態は、戦車が小突かれて岩へめり込む「今より悪い」盤面になる。

1. `goblinChariot` の def: `displaySize: 240` → **176**、`heavyOverlap: true` を追加。
2. `isHeavyOverlapUnit` に `def.heavyOverlap === true` の口を足す(F4b のコード片のとおり)。
3. def の上の「`displaySize >= OVERLAP_BOSS_SIZE(200)` なので…」というコメントを **`heavyOverlap: true` で明示している**旨へ書き換える。嘘のコメントを残さない。
4. `caravanWagon` (`index.html:9462`) の「同じ 240px 車体の goblinChariot」も書き換える。**コメントだけでコード結合は無い**(別 def なので数値は連動しない)。

### STEP3 — 体の footprint を 1 箇所の関数にする + 戦車の湧き位置(F3)

1. `unitBodyTiles(def, tx, ty)` を新設。`def` の `bodyRatioX` / `bodyRatioY` / `bodyOffY`(**未指定なら 1 / 1 / 0 = 中心 1 マスと同じ挙動**)から体の矩形を求め、覆うタイル配列を返す。
   - `goblinChariot` の def にだけ実測値 **`bodyRatioX: 0.90, bodyRatioY: 0.72, bodyOffY: 0.229`** を足す。
   - ⚠ **この 3 値の出所はスプライトの実測**(F3)。素材を差し替えたら測り直す旨をコメントに残すこと。
2. `isBodyClear(def, tx, ty)` = `unitBodyTiles` が壁を 1 マスも含まない。**判定点をここ 1 つに畳む**。
3. `findChariotSpawnTile` の判定を `isBodyClear` へ差し替える。
   - 現在の起点 `chariotSpawnBaseTx()` = `ROOMS[BOSS_ROOM_IDX][3]` = **外周そのもの**なので、STEP1 の後は必ず外れる。**起点を「玉座の間の合法タイルのうちボスから最も遠いもの」へ変える**(坑道の奥から突っ込んでくる、という演出とも合う)。
   - ⚠⚠ **フォールバックが最重要**。合法タイルが 0 のときに岩盤を返すと「**到達できない敵が残って潜行が永久にクリアしない**」= コード内 `index.html:29451` が警告している 8519138 の再演になる。しかも**戦闘は静かに終わるので画面を見ても異常に見えない**。
     → **合法タイルが 1 つも無ければ乱入そのものを取り消す**(バナーと台詞だけ出して敵を作らない)。「到達できない敵を盤面に残さない」ことだけは絶対。

### STEP4 — 突進経路も体で判定する(F3)

1. `chariotChargePath` の `if (isTileWall(tx, ty)) break;` を `if (!isBodyClear(def, tx, ty)) break;` へ。
2. 方向は現行の 8 方向のまま。ただし **斜めは体が角を舐める**ので、斜め 1 歩については縦成分・横成分の 1 歩も `isBodyClear` を要求する(角抜け防止)。
3. 合法レーンが減るぶん `BLOCKED` の頻度が上がる。**`BLOCKED` が 2 ターン続いたら回頭ターン**(その場で向きを変えて 1 ターン消費し、次ターンは必ず進める)を足し、**無限 BLOCKED を作らない**。
4. `window.__trampleProbe` に `blocked: true` の行も積む(今は轢いた時と空振りしか積んでいない = 止まり続けても観測できない)。

---

## 受入条件 — `tools/driver_mine_wall.js`

新規ドライバ。既存の `tools/driver_grid_p9.js` の骨格(内蔵サーバ + puppeteer-core + 変異注入)をそのまま流用してよい。**`require('./_pptr_profile')` を忘れないこと**。

### §0 装置
- (0a) `__paintBlockProbe().ring > 0` かつ `skipGate` が数値で返る(= 検出器が空振りしていない)
- (0b) 素と各変異で配信バイト長が違う(= 同じものを 2 回測っていない)

### §1 外周 (F2)
- (1a) n1 の外周 1 タイルが **1 マスも歩けない**(`isTileWall` が全部真)。n0 も同じ
- (1b) **本番の `aStar` をそのまま呼んで** n1 の 8 区間(F2 の表)が全部到達可能
- (1c) **s1→s2 の歩数が 7 → 15 に増える**(迂回するようになった、の直接の証拠)
- (1d) n0 の内部経路(起点 → 見張り 2 体)が **11 歩 / 13 歩のまま不変**

### §2 戦車 (F3/F4)
- (2a) 乱入位置の `unitBodyTiles` が壁を **0 マス**含む
- (2b) 乱入位置が外周でない
- (2c) 突進 1〜3 回目の**すべてのステップ**で体が壁を 0 マス含む
- (2d) 乱入後 30 ターン以内に戦車が **1 度は前進する**(無限 BLOCKED でない)
- (2e) 戦車を含むボス戦が **`dungeonCleared` に到達する**(手段でなく目的で測る)
  ⚠ `dungeonCleared` は classic script 直下の変数。**`window.dungeonCleared` で読むと常に `undefined` = 偽の赤**。裸の識別子で読むこと。

### §2b 縮小の補償 (F4b)
- (2f) `isHeavyOverlapUnit(戦車の def) === true`(= 176 でも不動)
- (2g) **挙動で測る**: 戦車の周囲 4 マスに仲間/敵を寄せて `resolveUnitOverlaps` を 60 フレーム回し、戦車の `x`/`y` が **1px も動かない**
  ⚠ (2f) だけだと「述語は真だが呼ばれていない」を見逃す。(2g) が目的そのもの。
- (2h) **他 11 体の大型ユニットの heavy 判定が 1 体も変わらない**(`heavyOverlap` を付けたのは戦車だけ、の証明)

### §3 恒等(副作用ゼロの証明)
- (3a) `?paintring=0` で外周が元どおり歩ける
- (3b) 他 5 シナリオの n4/n7 の歩けるマス数が **1 マスも変わらない**
- (3c) `?graph=0`(単一マップ経路)の goblin-mine の歩けるマス数が不変
- (3d) `?chariotbody=0` で戦車が旧挙動(中心 1 マス判定)に戻る

### 既存ドライバの再走(必須)
- `tools/driver_grid_p8.js` / `driver_grid_p9.js` / `driver_graph_sce1.js` / `driver_sce1_events.js`
- ⚠⚠ **`?minefold=0`(= `50302b8` より前の 5 ノード構成 n0/n1/n4/n5/n7 を復活させる退避口)の n1 も、同じ絵 `paint: "n1"` を使う**ので `sealRing` がそちらにも効く。
  **2026-08-20 決定: それでよい**。外周の岩を歩ける欠陥は旧構成でも同じなので、一緒に直るのが正しい。
  `driver_graph_sce1` (105) / `driver_sce1_events` (212) が赤くなったときの直し方は **「期待値の書き換え」ではない**。①測定点が外周を数えていないか、②`?paintring=0` へ固定して旧経路を測るか、のどちらか。**スイッチを外すと落ちる装置 assert を必ず 1 本添える**。
- ⚠ `displaySize` の変更(STEP2)は**全シナリオの戦車に効く**が、戦車が出るのは廃坑のボス戦だけなので影響範囲は廃坑に閉じる。

### 負のコントロール(変異を注入して、assert が本当に赤くなることを確かめる)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `noring` | `sealRing` を無視する | §1a §1c |
| `ringall` | `blocked` を持たない絵にも `sealRing` を効かせる | §3b |
| `centeronly` | `isBodyClear` を中心 1 マス判定へ戻す | §2a §2c |
| `nofallback` | 合法タイル 0 のときの取り消しを殺す | §2e |
| `nomass` | `heavyOverlap` の口を殺す(= 176 のまま軽くなる) | §2f §2g |

⚠ 置換文字列は**必ず 1 行**(`index.html` は CRLF なので複数行は原理的に一致しない)。インデント違いの同一行が 2 箇所ヒットすると exit 3。

---

## 撤退スイッチ

- **`?paintring=0`** … STEP1 だけ旧挙動(外周が歩ける)
- **`?chariotbody=0`** … STEP3/4 だけ旧挙動(中心 1 マス判定)
- ⚠ **STEP2(176 への縮小)には撤退スイッチを付けない**。`displaySize` は当たり判定・描画・不動判定に同時にぶら下がるので、スイッチで 2 つのサイズを行き来させると `heavyOverlap` との組合せが 4 通りになり、どれで測ったのか分からなくなる。戻したいときは def の 1 行を 240 へ戻す(そのとき `heavyOverlap: true` は**残したままでよい** — 240 でも真になるので恒等)。
- 既存の `?paintblock=0` / `?minefold=0` / `?detour=0` / `?paintgate=0` は **1 つも壊さない**

---

## 目視確認(実装後に必ず)

⚠⚠ **本番の絵の上で見ること**。当たり判定のズレは、絵を単体で眺めても、数値 assert が全部緑でも見えない(透過 PNG の白い矩形と同じ性質)。

1 枚絵の上に `isTileWall` が真のマスを赤で重ねた全景画像を出し、**外周 1 周が赤くなったか**を目で確かめる。assert を持たない目視補助なので、`tools/probe_paint_overlay.js` として残してよい(非退行ドライバとは別扱い)。

---

## やらないこと

- 他 11 体の大型ユニットへ footprint を配線しない(F5)
- 他 11 体へ `heavyOverlap` を付けない(F4b — 今の `displaySize >= 200` 判定のままにする)
- `OVERLAP_BOSS_SIZE`(=200)の数値そのものを下げない。下げると 12 体全部の押し出し挙動が変わる
- 絵そのものを描き直さない
- `blocked` マスクの**内側**をいじらない(サブタイルのズレは別件)
- `js/df-mapdef.js` のマスク解釈式を変えない

---

## 参考 — 今回の対象外だが同じ根

`index.html:16265` 付近のノックバックは

```js
if (!wouldOverlapWall(newEX+16, enemy.y+18, newEX+56, enemy.y+58)) enemy.x = newEX;
```

と **72px スプライト前提の箱を直書き**している。大型スプライトではこの箱がバウンディングボックスの**左上隅 = 岩の中**を指すので、戦車は事実上ノックバックしない(176 にしてもこの箱は 16/18/56/58 のままなのでズレは残る)。`resolveUnitOverlaps` の `makeOverlapUnit` にも同じ `wallBox` の直書きがある。STEP3 のヘルパーで直せるが、**全ユニットの被弾挙動が変わる**ので別チケットにする。
