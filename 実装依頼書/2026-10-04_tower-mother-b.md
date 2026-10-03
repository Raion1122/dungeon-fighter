# #83 塔の母 B — 母が小部屋から出てきて一緒に帰り、酒場で息子と並んで迎える

- **起草**: 2026-10-04(起草窓) / **ステータス**: **承認済**(2026-10-04 ユーザー承認)
- **着手**: ⏸ **保留 — #84(メイジハンドの到達)の完了待ち**(2026-10-04)。同じ `index.html` / `tavern.html` を触るため。⚠ README の #83 行は #84 の実装窓へ一声かけてから足す(文面は §11)
- **基準 HEAD**: `06ee666`(#82 完了)。⚠ 着手時に**必ず測り直す**: #84(メイジハンドの到達)を実装窓が実装中で、`index.html` / `tavern.html` が動く
- **会議**: `dev-meetings/2026-10-03_tower-mother-quest.md` 第 2 段の開発計画書の「チケット B(③)」(ユーザー承認 2026-10-03)
- **前のチケット**: #82 `実装依頼書/2026-10-03_tower-mother-a.md`(§12 の崩れ K1〜K27 を読んでから着手すること)
- **触るファイル**: `index.html` / `tavern.html` / `js/npc-crowd.js` / `tools/verify_tower_mother.js`(#82 の受入の言い直し)/ 既存 golden の言い直し / `tools/verify_tower_mother_b.js`(新規)
- ⛔ **着手の前提**: **#84 の完了**。#84 は `index.html` / `tavern.html` を触る(依頼書 `実装依頼書/2026-10-03_mage-hand-reach.md`)。#83 も同じ 2 本を触るので、並走すると互いの非退行の測定が汚れる。起草は今できるが、**着手は #84 の項目4 のコミット後**。
- ⛔ **新しい素材は作らない**: 母 = 取り込み済み `assets/villager_oldwoman_walk.png` / 息子 = 取り込み済み `assets/town_mason_walk.png`(依頼人ハロルドは「港の石工」)

---

## 1. 目的

#82 で「塔の母」は遊べる依頼になった。ただし今は、最後のワイバーンが飛び去った瞬間に「ダンジョン制覇!」が出て終わる。**依頼の文面は「母を説得して連れてきてほしい」なのに、母が一度も姿を見せない**。最上階の北西には母の小部屋(ベッド・暖炉・揺り椅子)が描いてあり、扉はタンスで塞がれているが、誰も出てこない。

本チケット B では、依頼を果たした手応えを作る:

1. 最後のワイバーンが去ると、タンスが内側から押し退けられ、**母が小部屋から出てきてパーティの前まで歩き、ひと言話す**
2. 母はパーティの後ろに付いて**螺旋階段の口まで一緒に歩く**。着いたらクリア
3. 酒場へ戻ると、**空いている卓で息子(依頼人ハロルド)と母が並んで迎え**、息子が礼を言う。以後 2 人はその卓に座り続ける

**ユーザー決定**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 帰り道(会議 2026-10-03) | **最上階の中だけ歩く**。螺旋階段の口でクリア | 丘の道を逆向きに歩く(iPhone では誰もいない丘を 1 分眺めるだけになる・ノードを逆に辿る仕組みが無い) |
| 母の安全(会議) | **戦闘が終わってから出てくる**。戦わない・狙われない・失敗条件なし | 護衛の失敗条件(オートで勝手に死なれると何もできない) |
| お礼(2026-10-04) | **既存の礼金(`clearGold` 300G)を、息子から手渡す形で見せるだけ**。数値は 1 つも動かさない | 礼金の上乗せ / 品物を渡す |
| 再会の後(2026-10-04) | **卓 t2 に 2 人で座り続ける**(押すと一言)。自動で話す再会の場面は**初めてクリアして戻った回だけ** | その回だけ現れる |
| クリア後の依頼(2026-10-04) | **今どおり再挑戦できる**(卓の抽選から外さない)。再挑戦でも塔には母が居て、同じく連れて帰る | 一度きりで卓から外す |

⚠ 「再挑戦でも塔に母が居る」と「酒場に母が座っている」は同時に起きる。**ユーザーがこの辻褄より遊べる回数を選んだ**。⛔ 実装窓は善意で「酒場に居るなら塔に出さない」を足さないこと。

---

## 2. 着手前の実測(基準 HEAD `06ee666`・起草窓)

### 2-1. ⭐⭐⭐ 会議の器「母 = passiveNpc の敵スロット」は採らない(崩れた前提の訂正)

会議の計画書は「母は `passiveNpc` の敵スロットとして小部屋に置き、勝利後に随伴へ切り替える」としていた。実測すると**敵スロットは母の器に向かない**。理由は 3 つ:

| 理由 | 実測 |
|---|---|
| ① 絵が出ない | 敵の描画 `updateEnemyAnim()`(`index.html:13124`)は 5 段のシート前提で、待機 = 0 段・警戒 = 1・移動 = 2・攻撃 = 3・倒れ = 4(`:13144-13160`)。老婆のシート `villager_oldwoman_walk.png` は 576x384 で、**中身は 3 段目だけ**(0〜2 段は 18 コマすべて bbox なし。PIL で実測)。そのまま載せると透明になり、`rowOffset:3` で合わせても移動中は 3+2 = 5 段目 = 画像の外になる |
| ② 小部屋は塞がれている | #82 の n1 のマスク(`index.html:6393-6430`)は母の小部屋 col 4-10 / row 1-5 と扉のタンス col 6-8 / row 6 を `#` にしている。敵スロットを塞いだタイルに置くと lint の `slot-on-wall`(`js/df-mapdef.js:2394-2413`)の対象になる |
| ③ 敵の配列へ入れると全部に効く | 勝利判定 5 箇所・`isNodeSettled`・標的選び・押し退け・霧・年代記が敵配列を見る。`passiveNpc` で除外できるのはそのうち一部で、#82 で 40 箇所の HP 書き込み口を数えたのと同じ種類の洗い出しが要る |

⇒ **母は「敵でない、ノード寿命の DOM」で置く**。前例 = 廃坑の縛られた従者 `.sce1Captive`:

- CSS `index.html:1519-1528` = `width/height 96px` / `background-size: 576px 384px` / `background-position: 0 -288px`(**3 段目 = 老婆のシートと同じ形式**)/ `pointer-events: none` / `z-index: 3`
- 生成 `initSce1CaptiveForNode()`(`:26630`)= `#nodeLayer`(`:11634`)へ append。⚠ `#nodeLayer` は遷移のたびに一掃されるので、DOM は**ノードごとに作り直し**、状態は別の変数に持つ(`:26614-26623` の注記)
- 位置 `renderWorld()`(`:16586`)の中の 1 ブロック(`:16885-16894`)= `SX(tx*TILE_SIZE + TILE_SIZE/2 - 48)` / `SY(...)`。カメラに追従する
- 拡大表示 `body.zoomed .sce1Captive`(`:2978`)の一覧に 1 行要る

これなら勝利判定・標的・押し退け・lint のどれにも**原理的に**触れない(敵配列に入らない)。

### 2-2. クリアまでの流れ(今の姿)

| 場所 | 何 |
|---|---|
| `checkDungeonClear()` `index.html:19899` | `enemies.every(e => !e.alive \|\| e.passiveNpc) && objectiveDone` で `dungeonCleared = true`(`:19917-19918`)・`"quest.clear"` の吹き出し。呼び口は `moveEnemies` の末尾 `:19101` だけ(ナレ中は早期 return するので遅れることがある) |
| `objectiveDone` `:19914-19916` | 分岐マップでは `graphBossDefeated()`(`:36901`)= ボスノードに居る間は live の `enemies` を見る |
| 監視 `:40456-40460` | 300ms ごとに `dungeonCleared` を見て `showResult(true)` を 500ms 後に予約 |
| `showResult(win)` `:40133` | 礼金 `clearGold`(`:40158-40160`)を足して保存・`lastResult` を書く(`:40285`) |
| `isQuestClearSettled()` `:19948` | 休憩フェーズの提案の判定。`graphBossDefeated()` と同じ述語 |

⇒ 母の随伴は「**`checkDungeonClear` が `dungeonCleared` を立てるのを、母が階段の口に着くまで待たせる**」1 か所のゲートで入れる。`graphBossDefeated()` / `isQuestClearSettled()` は**触らない**(戦闘はもう無いので、休憩の提案が出ないのは正しい)。

### 2-3. ⚠⚠⚠ 罠 1 — クリアを遅らせると「引き返す」が出る

今は、最後のワイバーンが去った次の `moveEnemies` で `dungeonCleared` が立つので、**ボスノードで出口の選択肢が出たことは一度も無い**。遅らせると、その間に 400ms tick `tickNodeChoice()`(`:38282`)が ② 出口を選ぶ(`:38318` 以降)まで進む:

- `isNodeSettled()` は真(敵は全部 `alive=false`)
- n1 は出口 0 本(`buildTowerMotherRun` `:39780` の `exits: []`)だが、`exitsWithReturn(node)`(`:37149`)は**親ノードへの「引き返す」を必ず足す**(`RUN.parent[n1] = n0` と `nodeEnteredVia` から)
- `chooseExit()`(`:37186`)は `?autoplay` では `showCharChoice` が**候補 0 番を即返す**(`:37200-37204`)= 「引き返す」を選んで**丘の道へ戻ってしまう**。手動でも左の矢印が出る

⇒ 随伴の間は `tickNodeChoice()` を**入口で返す**(① の前)。⭐ ただし `heroForcedGoal` が立っている間は `:38306` の `if (heroForcedGoal) return;` が既に返すので、穴は「**母が出てくる〜主人公が歩き出すまで**」の区間。⛔ この区間を「短いから大丈夫」としない(400ms tick は必ず当たる)。
⭐ §8 の変異 `backexit` で機械検査する。

### 2-4. ⚠⚠ 罠 2 — 撤退ボタンが押せてしまう

撤退 `retreatBtn` のクリック(`:40308-40315`)と見た目 `updateRetreatBtnState()`(`:40371-40378`)は `dungeonCleared` で封じている。随伴の間は `dungeonCleared` が偽なので**撤退できてしまう**(押すと `lastResult.retreated` で帰還 = 依頼未達成・母も来ない)。
⇒ 両方の条件に「随伴中」を足す。⭐ §8 の変異 `retreatopen`。

### 2-5. ⚠⚠ 罠 3 — 詰みを作らない

随伴は「主人公が階段の口へ歩く → 母が付いてくる」を待つ。主人公の経路が仲間に塞がれる・母の経路が取れない、などで**永久に着かないと依頼がクリアしない**(#16 の「閉じた扉に湧いた敵でクリア不能」と同じ種類の詰み)。
⇒ **上限時間で必ずクリアへ倒す**(fail-open)。初期案 40 秒(⚠ 手番の長さではなく実時間。項目1 の実測で決めてよい)。
⭐ §8 の変異 `nofailopen`(上限を外し、母の経路を壊す)で「上限が効いている」ことを見る。

### 2-6. 主人公を歩かせる口(既存)

- `heroForcedGoal`(`:36793`)= 「heroAI の目標決定が読む唯一のレバー」。heroAI(`:19623`)の ② 敵なし → ドロップなし → `RUN && heroForcedGoal`(`:19771-19788`)で A* が運ぶ。到達で `nodeGateReached = true`(`:19783`)
- `tickNodeChoice` の ① は `nodeGateReached && nodePendingExit` のときだけ遷移する(`:38290`)⇒ **`nodePendingExit` を立てなければ遷移しない**(到達は自分で `pTX/pTY` を見て判定すればよい)
- `snapToWalkable(t)`(`:36957`)を通すこと(寄り道 `pickSpot` `:40047` と同じ 1 行)
- 階段の口 = n1 の入場地点 `start`(`buildTowerMotherRun` `:39768` の `start: { tx: 16, ty: 13 }` = 絵ローカル (2,8) = 螺旋階段の上)。⛔ 座標を直書きせず、**そのノードの mapDef の `start` から引く**

### 2-7. 母の小部屋の絵(目視・`assets/room_tower-mother_n1_map.jpg` 1248x816 = tile 48 の焼き上がり)

- 小部屋の中(絵ローカル col 5-9 / row 1-4)は床: ベッド (5-6, 2-4)・暖炉 (7-8, 1)・揺り椅子 (8, 3)・敷物 (8-9, 4)
- タンス(戸棚)は **col 6-8 / row 5** に描かれ、下端が row 6 の上 1/4 にかかる。(8, 5) にはわずかに開いた木の扉板がある
- ⚠ 焼き込みの絵なので**タンスは動かせない**。「押し退けられる」は画面の揺れ + 効果音 + 土埃 + 語りの一文で表す(§4-3)。⛔ 絵の一部を切り抜いて DOM で動かす案は採らない(下の絵にタンスが残って二重に見える)

### 2-8. 吹き出し(母のひと言)

- `sayLine(triggerKey, speaker, opts)`(`:12831`)。台詞表 `SPEECH_LINES`(`:12660`)にキーを足す。1 件 2 秒(`SPEECH_MS`)・優先度 2 は押し出されない
- 話し手は `{ x, y, alive, def: { displaySize } }` を持つ物なら何でもよい(`speechKind` は `classKey` が無ければ "enemy" 扱い = 頭上 `y - 32 - SPEECH_LIFT`。`speechAlive` は `u.alive`)⇒ 母の状態オブジェクトにこの 4 つを持たせる

### 2-9. 酒場の口

| 場所 | 何 |
|---|---|
| `tavern.html:5857` `consumeResult()` | 即実行の IIFE。`lastResult` を**1 回きり**消費し、`r.cleared` なら `progress.cleared.add` → 100ms 後に `showReturnBanner(r)`(礼金は `r.reward.gold` で既に表示される)。⚠ 地図と NPC の初期化(`:10993`)より**前**に走る ⇒ ここでは**印を立てるだけ**にし、場面は NPC が生えた後で出す |
| `js/npc-crowd.js:37-63` `TAVERN` | 酒場の NPC 8 人の配置データ(唯一の正)。不変条件 I1〜I5 と `validate()`(`:125`)。⚠ 今の酒場に老婆と石工のシートは**居ない**(街 `TOWN` には居るが別画面 = 「同じ画面で同じシートを 2 人に当てない」に触れない) |
| `tavern.html` `initNpcCrowd()`(`:10993`) | `CROWD.TAVERN.forEach` で `.npcUnit` を生やす。立ち姿 = 歩行の 1 コマを止める(`hold`)。押すと `npcTapped` → 卓の 4 人以外は `npcBubbleShow`(吹き出しは常に 1 枚・4 秒) |
| `js/tavern-map.js:54-65` `MASK` / `:139-143` `TABLES` | 卓 t2 の円卓 = `T` の (4-5, 6-7)。**客(#54 の patronA-D)は t1 と t3 にしか座っていない** = t2 は空いている。t2 の札は (4, 5) |
| 保存 | `js/save-slots.js:45` `LIVE_PREFIX = "dragonfighters."` ⇒ 鍵を `dragonfighters.` で始めれば記録スロットへ 1 行も足さずに載る(#81 の `questBoard` と同じ) |

### 2-10. 名指しの既存 golden(着手前の色を控える)

- **`verify_tower_mother`**(#82 の受入)⚠⚠ **(3d) が直接ぶつかる**: 追い払いの後 `lastResult` を最大 12 + 15 秒しか待たない(`tools/verify_tower_mother.js:678-692`)。随伴の分だけクリアが遅れる ⇒ **言い直しが要る**(⛔ 待ち時間を伸ばすだけで済ませない。「随伴が終わって」クリアしたことを見る形へ)
- `verify_npc_crowd`((0b-dom) は `.npcUnit` の数 = `TAVERN.length`。素の保存では母子の印が無いので変わらないはず ⇒ 印ありの腕で数がどう動くかを項目1 で測る)/ `verify_recruit_talk`(`NPC_CROWD` を読む)
- `verify_quest_draw` / `verify_tavern_map`(卓と札)/ `driver_encounter_mopup` / `verify_run_chronicle`(勝利と撃破)/ `driver_graph_p6`
- ⭐ #82 K25: 母集団の全数は「変更したファイル(`index.html` / `tavern.html` / `js/npc-crowd.js`)を読む本」で引く

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 母の DOM(CSS 1 規則 + `body.zoomed` の一覧に 1 行)/ 随伴の状態と tick / `checkDungeonClear` のゲート 1 行 / `tickNodeChoice` の入口 1 行 / 撤退の 2 か所の条件 / `renderWorld` の位置ブロック / `SPEECH_LINES` に母の台詞 / 撤退スイッチ / 検証シーム |
| `tavern.html` | `consumeResult()` で印を立てる 1 行 / NPC の初期化で母子を足す / 初回の再会の場面 / 撤退スイッチ / changelog |
| `js/npc-crowd.js` | `REUNION`(息子と母の 2 人)を `TAVERN` とは**別の配列**で足す。⛔ `TAVERN` の 8 人は 1 バイトも触らない |
| `tools/verify_tower_mother.js` | (3d) の言い直し(§8) |

⛔ `js/tavern-map.js`(マスク・卓)・`world.html` / `js/world-map.js` / `town.html` は触らない。
⛔ `graphBossDefeated()` / `isQuestClearSettled()` / 勝利判定 5 箇所 / `fleeEnemy` まわり / n1 のマスクは触らない(母は敵配列にも通行マスクにも入らない)。
⛔ `SCENARIOS["tower-mother"].clearGold` / `clearXp` は動かさない(お礼 = 既存の礼金)。

---

## 4. STEP1 — 母が出てくる(`index.html`)

### 4-1. 状態と DOM

```js
/* ★[#83] 塔の母 — 最後のワイバーンが去った後に小部屋から出てきて、階段の口まで付いてくる。
 *   ⭐ 敵配列に入れない (勝利判定・標的・押し退け・lint のどれにも触れない = 依頼書 §2-1)。
 *   ⭐ DOM はノード寿命 (#nodeLayer)、状態は潜行寿命 (.sce1Captive と同じ分け方)。 */
let towerMother = null;   // { phase, tx, ty, x, y, alive:true, def:{displaySize:96}, el, t0, ... }
```

- `phase`: `"hidden"`(小部屋の中・見えない)→ `"emerge"`(タンスの音 → 小部屋から出る)→ `"approach"`(主人公の前まで歩く)→ `"talk"`(ひと言)→ `"follow"`(主人公が階段の口へ歩き、母が付いてくる)→ `"done"`
- 生成は **`currentScenario` が `tower-mother`・`RUN` あり・ボスノードに居る**ときだけ。⛔ 他のシナリオ・`?graph=0`(単一マップ)・n0 では 1 要素も作らない
- CSS は `.sce1Captive` の基底を写す(96px・`576px 384px`・3 段目・`pointer-events:none`・`z-index:3`)。歩くときだけ `steps(6)` で 3 段目を回す。⛔ `transform` で左右反転するなら `composeSpriteTransform` 系の既存の作法に合わせる(⚠ #82 で「`transform` を上書きすると左向きが壊れる」を踏んだ)

### 4-2. 起動(ゲート)

`checkDungeonClear()` の `dungeonCleared = true` の**直前**にゲートを 1 行:

```js
      if (enemies.every(e => !e.alive || e.passiveNpc) && objectiveDone) {
        if (towerMotherHolds()) return;   // ★[#83] 母が階段の口に着くまで制覇を待つ (撤退 ?towermother=0 では常に false)
        dungeonCleared = true;
```

- `towerMotherHolds()`: 塔の母のボスノードで `phase !== "done"` なら真。初めて真を返すときに随伴を**起動**する(多重起動しないラッチ)
- ⛔ 判定式 `enemies.every(...)` と `objectiveDone` は 1 文字も変えない

### 4-3. emerge → approach → talk

1. **emerge**: 画面の揺れ(既存の揺れの関数)+ 重い物を引きずる効果音(既存の `sfx` から選ぶ)+ タンスの位置に土埃 + `updateInfo` / 語りで「ゴトリ、と重い音。扉を塞いでいたタンスが、内側から押し退けられた」。母は小部屋の中の床(絵ローカル (8, 3) 付近)から、(8, 4) → (8, 5) → (8, 6) → (8, 7) と**決め打ちの数歩**で出る(この区間は塞いだタイルなので A* を使わない)
2. **approach**: (8, 7) から主人公の隣のタイルまで、本番の `aStar` で歩く(⛔ 自前の BFS を書かない)。1 マス 380ms 前後(主人公の歩き `heroSlideOneTileExplore` と同じ速さ)
3. **talk**: `sayLine("tower.mother.meet", towerMother)` → `sayLine("tower.mother.follow", towerMother)` の 2 件。台詞は §4-5

- ⚠ 絵ローカル → global は n1 の rect から(`+ (14, 5)`)。⛔ global の数字を直書きしない(#82 の `buildTowerMotherRun` の注記と同じ)
- ⚠ 母の小部屋は霧の中にあることがある(n1 は `outdoor` なし)。出てくる瞬間が暗くても**止めない**(見え方は §9 で確かめる)

### 4-4. follow → done

1. `heroForcedGoal = snapToWalkable(<n1 の mapDef の start>)`。⛔ `nodePendingExit` は立てない(立てると到達で `enterNode` が走る)
2. 母は**主人公が通ったタイルを 2 歩遅れで辿る**(主人公の足跡の列を持つ)。仲間の追従は既存のまま
3. **done** = 主人公が `start` に着き、かつ母が主人公からチェビシェフ距離 2 以内。または起動から上限時間(§2-5)を過ぎた
4. done で `heroForcedGoal = null` に戻し、次の `checkDungeonClear` で `dungeonCleared` が立つ(= 今の流れへ合流)

### 4-5. 台詞(`SPEECH_LINES` に足す・1 件 2 秒に収まる長さ)

- `"tower.mother.meet"`: 「……あの子の差し金かい。まったく、余計な世話を焼いて」
- `"tower.mother.follow"`: 「でも、助かったよ。さあ、行こうか」

(文面は実装窓が整えてよい。⛔ 1 件が 2 秒で読めない長さにしない)

### 4-6. 穴を塞ぐ 2 行(§2-3 / §2-4)

- `tickNodeChoice()` の入口(`if (!RUN) return;` の後)に `if (towerMotherActive()) return;`
- 撤退のクリック(`:40313`)と `updateRetreatBtnState()`(`:40373`)の条件に `|| towerMotherActive()`
- `towerMotherActive()` = 随伴が起動済み かつ `phase !== "done"`

---

## 5. STEP2 — 酒場で迎える(`tavern.html` / `js/npc-crowd.js`)

### 5-1. 印

`consumeResult()` の `if (r.cleared && r.scenarioId)` の中で、`r.scenarioId === "tower-mother"` なら:

- `localStorage["dragonfighters.towerMotherHome"] = "1"`(**常に 1**。2 回目のクリアでも 1 のまま)
- 初めて立てた回(立てる前が "1" でなかった)だけ、`window.__towerReunionPending = true`(このページの寿命だけ。⛔ sessionStorage へ写さない)

⛔ `consumeResult()` は即実行の IIFE で、NPC より先に走る。**ここで DOM を作らない**。

### 5-2. 母子の配置データ(`js/npc-crowd.js`)

```js
  /* ★[#83] 塔の母を連れ帰った後だけ、空いている卓 t2 に座る息子と母。
   *   ⚠ TAVERN とは別の配列 (TAVERN の 8 人と verify_npc_crowd の数え方を 1 バイトも動かさない)。
   *   ⭐ 不変条件 I1〜I5 は TAVERN と同じ validate() で検査する (T = 円卓のタイル = 歩けない)。 */
  var REUNION = [
    { key: "harold", kind: "stand", tile: [4, 7], dx: -14, dy: 6, face: "right",
      sprite: "assets/town_mason_walk.png", hold: 2,
      say: "母さんが毎朝パンを焼いてくれる。……悪くないもんだね。" },
    { key: "towerMother", kind: "stand", tile: [5, 7], dx: 14, dy: 6, face: "left",
      sprite: "assets/villager_oldwoman_walk.png", hold: 1,
      say: "塔の上より、ここのほうが騒がしいねえ。" },
  ];
```

- タイルの初期案は t2 の円卓の**下の行**(4,7)/(5,7)。⚠ t2 の札は (4,5) で、上の行 (4,6)/(5,6) に置くとスプライト(足元から上へ 1 タイル近い)が札と交差しうる(I5)。**実 DOM の札を測って `validate()` に通し**、だめなら dx/dy か席を直す(⛔ 札・マスク・卓の側は動かさない)
- `NPC_CROWD` に `REUNION` を足す(`TAVERN` / `TOWN` と同じ並び)

### 5-3. 生やす・初回の場面

- `initNpcCrowd()` の `CROWD.TAVERN.forEach(...)` を、**印があるときだけ `TAVERN.concat(REUNION)` にする**。⛔ 生やす処理を 2 本書かない(同じ forEach を通す)
- `__towerReunionPending` のときだけ、NPC が生えた後に**自動で吹き出しを順に出す**(`npcBubbleShow` は常に 1 枚なので、4 秒ずつ順番に):
  1. 息子「母さん……! 本当に連れて帰ってきてくれたのか」
  2. 母「大げさだねえ。……ただいま」
  3. 息子「約束の礼だ。受け取ってくれ。本当にありがとう」
- ⭐ 礼金は `showReturnBanner` の「金貨 +N」が既に出す。**場面は数値を出さない**(二重に払ったように見せない)
- ⚠ 自動の吹き出しは `say`(押したときの一言)とは別の文面。`npcBubbleShow` に文面を渡せるよう、引数を 1 つ足すか小さな関数を足す(⛔ `n.say` を書き換えて済ませない = 配置データが動く)

---

## 6. STEP3 — 検証シーム

- `index.html`: `window.__towerMotherTV` に `mother()`(`phase` / タイル / 起動時刻 / 上限)と `holds()` / `active()` を足す(#82 のシームに相乗り)
- `tavern.html`: `__TAVERN_TV` に `reunion()`(印の有無・pending・生えた母子の key)

---

## 7. 撤退スイッチ

- **`?towermother=0`** — 母は出てこず、最後のワイバーンが去った瞬間に制覇(= #82 の姿)/ 酒場は印を立てず、母子も場面も出ない
- ⚠ 判定位置 = `index.html` と `tavern.html` がそれぞれ自分のページで読む(`?tower=0` と同じ「ページ単位で独立」)。遷移はまたがない
- ⚠ 酒場は「既に印が立っている保存」でも、`?towermother=0` なら母子を生やさない(印は消さない)
- ⭐ `?tower=0`(#82 の撤退)では依頼そのものが卓に出ないので、B も自動的に起きない

---

## 8. 受入条件 — `tools/verify_tower_mother_b.js`(新規・port base = **#84 の次**。#84 が 10548〜 を使うので、着手時に #84 §12 の「次の base」を読んで決める)

方針: 随伴は**本番の流れで観測**する(ワイバーン 2 匹を本番の口で追い払い、そのまま待つ)。手番の差し替えは #82 の受入の型を写してよいが、随伴のコード(tick・ゲート・経路)は本番のまま。酒場は `lastResult` を実際に置いて開き、`consumeResult()` から通す。

### §0 装置

- **(0a)** シーム `__towerMotherTV.mother/holds/active` と `__TAVERN_TV.reunion` が見える
- **(0b)** 追い払いの直後に `towerMother.phase` が `"hidden"` 以外へ動いた(⭐ 随伴が 1 回も起動しないと §1〜§2 が全部空振りで緑になる)

### §1 塔の中

- **(1a)** 最後のワイバーンが去ってから `phase === "done"` になるまで、`dungeonCleared` は偽のまま(2 経路: シームの `phase` と、本番の `dungeonCleared`)
- **(1b)** 母の DOM が `#nodeLayer` の中に在り、見えている(`display` が none でない・背景の Y が 3 段目 = `-288px` 相当・**背景画像の範囲内**)
- **(1c)** 母は敵配列に居ない(`enemies` の長さが追い払いの前後で同じ・母の要素は `enemyElements` に無い)
- **(1d)** 母の台詞 2 件が `speechLog`(実際に表示されたもの)に載る
- **(1e)** done の時点で、主人公が n1 の `start` に居て、母が主人公からチェビシェフ 2 以内。**上限による done ではない**(素で上限に倒れたら赤)
- **(1f)** 随伴の間、`tickNodeChoice` の出口の選択が 1 回も出ない・`enterNode` が呼ばれない・現在ノードが n1 のまま(⭐ 罠 1)
- **(1g)** 随伴の間、撤退ボタンが `disabled`(⭐ 罠 2)
- **(1h)** done の後、今の流れでクリアする: `lastResult.cleared === true`・`scenarioId === "tower-mother"`・礼金は #82 と同額(`reward.gold` の内訳に `clearGold` 300 が入る)

### §2 詰み防止

- **(2a)** 主人公の経路を塞いだ盤面(実行時に仲間を階段の口に固定するなど)でも、上限時間で done になり、クリアする(⭐ 罠 3)

### §3 酒場

- **(3a)** `lastResult` に `tower-mother` のクリアを置いて酒場を開く → 印 `dragonfighters.towerMotherHome === "1"`・`.npcUnit[data-npc=harold]` と `[data-npc=towerMother]` が在る
- **(3b)** 初回は再会の吹き出しが順に 3 件出る(`data-npc-say` で誰の一言かを見る)。**同じ保存でもう一度クリアして戻ると、母子は居るが自動の場面は出ない**
- **(3c)** 印が無い保存では母子が居ない・`.npcUnit` の数 = `TAVERN.length`(今の姿)
- **(3d)** 母子 2 人が `NPC_CROWD.validate(REUNION, TAVERN_MAP, <実 DOM の札>)` で `ok`(I1〜I5)。⛔ 札の寸法を定数で渡さない
- **(3e)** 母子を押すと一言(`say`)が出て、主人公が歩き出さない(`stopPropagation`)
- **(3f)** 他のシナリオのクリアで戻っても印は立たない
- **(3g)** クリア後も `tower-mother` は卓の抽選の母集団に残る(`boardFacts().unlocked` に在る = ユーザー決定「再挑戦できる」)

### §4 撤退

- **(4a)** `index.html?towermother=0` で、最後のワイバーンが去った後に母が出ず、そのまま制覇(#82 の姿)
- **(4b)** `tavern.html?towermother=0` で、印ありの保存でも母子が生えない・場面が出ない・印は消えない
- **(4c)** ⭐ (0b)(3a)(4a) の条件を ON/OFF の両方へ当てて反転すること

### ⛔ 測らないこと

- 母の歩く速さ・吹き出しの文面・土埃と揺れの見た目・上限時間の秒数(目で直す)
- 礼金の額(#82 の値。動かさない)

### 負のコントロール(`--negative`。配信スナップショットをメモリ上で差し替える)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `backexit` | ⭐ 罠 1: `tickNodeChoice` の入口の 1 行を外す | (1f)(1h) |
| `retreatopen` | ⭐ 罠 2: 撤退の条件から随伴中を外す | (1g) |
| `nofailopen` | ⭐ 罠 3: 上限時間を外す | (2a) |
| `nogate` | `checkDungeonClear` のゲートを外す | (0b)(1a) |
| `asenemy` | ⭐ §2-1: 母を敵配列へ足す(実行時に push) | (1c) |
| `rowzero` | 母の背景の Y を 0 段目に(⭐ §2-1 ① 透明になる罠) | (1b) |
| `nonodelayer` | 母を `#nodeLayer` でなく body へ append(遷移で消えない) | (1b) |
| `nomark` | `consumeResult()` の印の 1 行を外す | (3a) |
| `everytime` | 「初回だけ」の判定を外す | (3b) |
| `intavern` | `REUNION` を `TAVERN` へ混ぜる | (3c) |
| `noretire` | 酒場の撤退スイッチを外す | (4b) |

⚠ 担当の節は依頼書の予想。#82 は 9 本中 4 本が実走で違った(K17〜K19)⇒ **`--mutate` で 1 本ずつ実走して担当表を決める**。

### 既存 golden

- `verify_tower_mother`(#82)の **(3d) を言い直す**: 「追い払い → 随伴 → 制覇 → `lastResult.cleared`」を、随伴が `done` になったことと併せて見る。⛔ 待ち時間を伸ばすだけにしない。⚠ `--negative` の `viadefeat` の (3d) は確率で赤(#82 K19)のまま
- §2-10 の名指しの本は、着手前の色を項目1 で控えてから比較

---

## 9. 実機/実感の確認

- タンスが押し退けられる瞬間が「中に誰か居た」と読めるか(揺れ・音・土埃・一文で足りるか)
- 霧の中から母が出てくるとき暗すぎないか
- 母が後ろを付いてくる姿が、iPhone 縦で「一緒に帰っている」と読めるか / 待ち時間が長すぎないか
- 酒場の卓 t2 の母子が、席札・他の客と重ならず、親子に見えるか
- 再会の吹き出し 3 件が、帰還の帯(5.5 秒で消える)と喧嘩しないか

---

## 10. changelog(`index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>塔の母を連れて帰れるように</b> — ワイバーンを追い払うと、塔に立てこもっていた母が部屋から出てきて一緒に階段を下りる。酒場に戻ると、息子と母が卓で迎えてくれる。"

---

## 11. やらないこと

- ⛔ 帰り道の丘を逆向きに歩く / 母が戦闘に参加する・護衛の失敗条件
- ⛔ 礼金・XP の変更 / 新しい品物
- ⛔ 「酒場に母が居るなら塔に出さない」(ユーザーが再挑戦を選んだ = §1)
- ⛔ 卓の抽選・`boardFacts` の変更 / 依頼人の肖像(`CLIENT_ART`)
- ⛔ 新しい素材(老婆・石工のシートは取り込み済み)/ 新しい BGM・効果音
- ⛔ #82 の宿題(ワイバーン戦の「怖さ」= HP・頭数 / 道中の停留所 17→16)
- `実装依頼書/README.md` へ足す行(承認後、#84 の実装窓へ一声かけてから起草窓が足す):

    | 83 | [2026-10-04_tower-mother-b.md](2026-10-04_tower-mother-b.md) | **承認済** | 0% | 新しい依頼「塔の母」B = 母が小部屋から出てきて階段の口まで付いてくる + 酒場の卓 t2 で息子と並んで迎える(初回だけ再会の場面・以後は座り続ける)。⭐ 母は敵配列に入れず `.sce1Captive` 型のノード寿命 DOM(老婆のシートは 3 段目しか中身が無い)。⚠⚠⚠ クリアを遅らせると n1 に「引き返す」が出て autoplay が丘へ戻る ⇒ `tickNodeChoice` の入口で返す / 撤退ボタンも封じる / 上限時間で必ずクリアへ倒す。お礼 = 既存の礼金のまま。⛔ 着手は #84 完了後。撤退 `?towermother=0` |

---

## 12. 実装結果

(実装窓が埋める)
