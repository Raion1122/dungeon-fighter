# #83 塔の母 B — 母が小部屋から出てきて一緒に帰り、酒場で息子と並んで迎える

- **起草**: 2026-10-04(起草窓) / **ステータス**: **承認済**(2026-10-04 ユーザー承認)
- **着手**: 2026-10-04 実装窓 dev-loop 開始(#84 完了 `5d5b32b`・README 行 `35ad1fc` の後)。旧: ⏸ 保留 — #84(メイジハンドの到達)の完了待ち
- **基準 HEAD**: **`35ad1fc`**(項目1 の実測の基準 = §12-0)。起草時の値は `06ee666`(#82 完了)= 本文 §2 の行番号はこちらで測ったもの。訂正は §12-0 の (1)
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

(実装窓が埋める。§12-0 着手前 / §12-1 本番 / §12-2 受入 / §12-3 母集団 / §12-4 総括)

### 12-0. 項目1 — 着手前の実測(基準 35ad1fc)

- 作業ツリー clean・本番(`index.html` / `tavern.html` / `js/*` / `audio.js`)は 1 バイトも触っていない。`45319e4..35ad1fc` の差は `実装依頼書/` の 2 本だけ(`git diff --name-status`)で、`index.html` / `tavern.html` / `js` / `audio.js` / `tools` の blob / tree OID は `45319e4` と `35ad1fc` で 5/5 同一。
- 作業物は scratchpad `…/32f9ad8a-5bb9-47de-a7bd-ed50fd3a2b22/scratchpad/item1/`(`walk_n1.js` / `reunion_seat.js` / `anchors.py` / `run_named.ps1` / `named/` / `from84/post84.tsv`)。測定ポートは 10605〜10609(受入用の 10555〜 は使っていない)。

#### (1) 行番号の訂正表(HEAD `35ad1fc` で `grep -n`)

`06ee666 → 35ad1fc` の配信物の差は #84 の 2 本だけ: `index.html` 11 行(hunk `@@ -13883` / `-22107` / `-25149 +25149,7` / `-25179`)= **25,149 行までは不動・25,157 行以降は −1** / `tavern.html` 15 行(`@@ -2325 +2325,8` / `-9199 +9201,17`)= **2,325 行以降 +2・9,210 行以降 +13**。`js/` と `audio.js` は不変。中身は §2 の記述と同一(下の (2) の崩れは行番号以外)。

| 対象 | §2 の値 | `35ad1fc` |
|---|---|---|
| `updateEnemyAnim()` / 行 0〜4 の分岐 | `:13124` / `:13144-13160` | **`:13125` / `:13145-13161`**(`06ee666` でも同じ = §2 の 1 行ずれ)|
| `.sce1Captive` の CSS / `body.zoomed .sce1Captive` | `:1519-1528` / `:2978` | 同じ(状態クラス `.bound` `:1533` / `.hanging` `:1547` が背景画像を付ける。基底には `background-image` が無い)|
| `#nodeLayer` / `initSce1CaptiveForNode()` / 注記 | `:11634` / `:26630` / `:26614-26623` | `:3258`(DOM)・`:11634`(const)/ **`:26629`** / `:26613-26622` |
| `renderWorld()` / 捕虜の位置ブロック | `:16586` / `:16885-16894` | `:16586` / **`:16886-16894`** |
| ノード遷移の撤去点 `resetNodeState()` / `sce1CaptiveEl = null` | — | `:36306-36312` / `:36287`(母の DOM 参照もここで落とす必要がある)|
| `SPEECH_LINES` / `SPEECH_MS` / `speechKind` / `sayLine` | `:12660` / — / — / `:12831` | `:12660` / `:12752` / `:12790` / `:12831`。`window.__speech.log` = `:12973` |
| `moveEnemies()` 末尾の `checkDungeonClear()` | `:19101` | `:19101`(`moveEnemies` は `:18883`・ナレ/ダイアログ中の早期 return は `:18886`)|
| `checkDungeonClear()` / 判定式 / `dungeonCleared = true` | `:19899` / `:19917` / `:19918` | 同じ |
| `isQuestClearSettled()` | `:19948` | 同じ |
| heroAI / ② の `RUN && heroForcedGoal` / `nodeGateReached = true` | `:19623` / `:19771-19788` / `:19783` | 同じ |
| `heroSlideOneTileExplore` / 探索ターン(仲間→敵) | — | `:19578` / `:19610-19611`(1 マスごとに `exploreAllyTurn` + `exploreEnemyTurn`)|
| `heroForcedGoal` / `nodeChoiceCooldownUntil` | `:36793` / — | **`:36792`** / `:36796` |
| `graphBossDefeated()` / `snapToWalkable()` | `:36901` / `:36957` | **`:36900` / `:36956`** |
| `exitsWithReturn()` / `chooseExit()` / autoplay の `showCharChoice` | `:37149` / `:37186` / `:37200-37204` | **`:37148` / `:37185` / `:37199-37203`**(`showCharChoice` の即決は `:14616-14619`)|
| `showExitArrows()`(非 autoplay・`dialogPaused = true`)| — | `:37808` / `:37812` |
| `enterNode()` / 冷却を 0 に戻す / 到着の冷却 | — | `:38100` / `:38111` / `:38146` |
| `tickNodeChoice()` / ① / `if (heroForcedGoal) return;` / ② | `:38282` / `:38290` / `:38306` / `:38318` | **`:38281` / `:38289` / `:38305` / `:38317`**。登録 `:38346` |
| `buildTowerMotherRun()` / n1 の `start` / n1 の `exits: []` | — / `:39768` / `:39780` | `:39749` / `:39768` / **`:39779`** |
| n1 のマスク `n1big` | `:6393-6430` | 同じ(`blocked` は `:6414-6431`)|
| 寄り道 `pickSpot` の `snapToWalkable` | `:40047` | **`:40046`** |
| `showResult()` / `clearGold` / `lastResult` | `:40133` / `:40158-40160` / `:40285` | **`:40132`** / `:40158-40160` / **`:40284`** |
| 撤退クリック / その条件 | `:40308-40315` / `:40313` | `:40309-40315` / **`:40311`**(`if (gameOver \|\| dungeonCleared) return;`)|
| `updateRetreatBtnState()` / 条件 | `:40371-40378` / `:40373` | **`:40370-40378` / `:40372-40374`** |
| 制覇の監視 | `:40456-40460` | **`:40455-40458`** |
| `fleeEnemy` / `window.__towerMotherTV` | — | `:17838` / `:17888-17894`(`window.fleeEnemy = fleeEnemy;` `:17885` は verify_tower_mother の変異アンカー)|
| `tavern.html` `consumeResult()` / `if (r && r.cleared && r.scenarioId)` | `:5857` | **`:5859`** / `:5901`。`DFSlots.snapshot()` が直後 `:5926` |
| `showReturnBanner()`(5.5 秒で消える)| — | `:5929` / `:5962-5963` |
| `initTavernMap()`(⚠ NPC はこの中)/ `__TAVERN_TV` / `initNpcCrowd()` | — / — / `:10993` | `:10476` / `:10947` / **`:11006`**。`CROWD.TAVERN.forEach` `:11027`・`npcTapped` `:11094`・`npcBubbleShow` `:11174`(`BUBBLE_MS = 4000` `:11153`)|
| `js/npc-crowd.js` `TAVERN` / `validate()` / `NPC_CROWD` | `:37-63` / `:125` | **`:36-62`** / `:125` / `:157-161` |
| `js/tavern-map.js` `MASK` / `TABLES` | `:54-65` / `:139-143` | `:54-65` / `:139-143` |
| `js/save-slots.js` `LIVE_PREFIX` | `:45` | 同じ |
| `scripts/hooks/check_changelog.py` `GAME_LOGIC` | `:24` | 同じ |
| `tools/verify_tower_mother.js` (3d) の待ち | `:678-692` | `:679-692`(判定 `:745`)|

#### (2) §2 の主張の実測(✓ = 本番どおり / K = 崩れ)

- ✓ §2-1 ① 老婆 `assets/villager_oldwoman_walk.png` は 576x384・中身は**行 3 だけ**(行 0〜2 の 18 コマは alpha の bbox なし・行 3 の 6 コマは bbox の左端 31〜36・上端 31〜33・右端 63〜65・下端 91)。息子 `assets/town_mason_walk.png` も同じ形(行 3 だけ)。PIL(`py`)で実測。
- ✓ §2-1 ② n1 のマスクで絵ローカル (8,3)(8,4)(8,5)(8,6) は `isTileWall` 真・(8,7) は偽(本番の `isTileWall` をブラウザで 9 走行)。⇒ 母は (8,7) = global (22,12) から A* を使える。(8,7) → 追い払い直後の主人公 (28,11) まで A* 7 マス・(8,7) → n1 の `start` (16,13) まで 7 マス。
- ✓ §2-1 の前例 `.sce1Captive`: 96px・`576px 384px`・`0 -288px`・`pointer-events:none`・`z-index:3`。⚠ 基底は背景画像を持たず状態クラスが付ける。⚠ `driver_graph_sce1` / `driver_graph_reentry` / `driver_sce1_events` が `.sce1Captive` を**数える**(`querySelectorAll('.sce1Captive')`)⇒ 母に同じ class を付けず、規則を写した別 class(例 `.towerMother`)にすること。
- ✓ §2-2 クリアまでの流れ・呼び口 `moveEnemies` 末尾 1 か所・`dungeonCleared = true` の代入は全文で 1 か所(`:19918`)。
- ✓ §2-3 `exitsWithReturn` は n1(`exits: []`)に親 n0 への「引き返す」を足す(`RUN.parent.n1 = "n0"`・`nodeEnteredVia = "right"` を実測)。autoplay の `showCharChoice` は候補 0 を即返す。非 autoplay は `showExitArrows` が `dialogPaused = true` を立てて**ゲーム時間ごと止まる**(→ K4 で実際に踏んだ)。
- ✓ §2-4 撤退は 2 か所(`:40311` / `:40372-40374`)。ミニバーの撤退チップ(`:16016-16020`)と委譲クリック(`:40432-40436`)は `retreatBtn.disabled` に従うので、2 か所を封じれば足りる。
- ✓ §2-6 `heroForcedGoal` → heroAI ② → 到達で `nodeGateReached = true`。① は `nodeGateReached && nodePendingExit` のときだけ(`nodePendingExit` を立てなければ遷移しない = 9 走行すべて `currentNodeId` は n1 のまま)。`snapToWalkable(MAPDEF.start)` = (16,13)(start は壁でない = そのまま返る)。`MAPDEF.start` と `RUN.byId.n1.mapDef.start` は同じ (16,13)。
- ✓ §2-6 絵ローカル → global = `+ (rect[1], rect[0]) = + (14, 5)`(n1 の rect `[5,14,21,39]`)。
- ✓ §2-8 `sayLine(key, speaker)` は `{x, y, alive, def.displaySize}` を持つ物を話し手にできる(`speechAnchor` / `speechAlive`)。→ ただし K5。
- ✓ §2-9 `consumeResult()` は `initNpcCrowd()` と同じ `<script>`(`:3447` 起点)の中で先に走る即実行の IIFE。印の直後に `DFSlots.snapshot()` があるので `dragonfighters.towerMotherHome` は記録スロットへ載る。`wipeAdventureRecord` も接頭辞の総なめ(新しい冒険で消える)。
- ✓ §2-9 卓 t2 の円卓は `T` の (4-5, 6-7)・札 (4,5)・入口 (4,8)。客(#54 の patronA-D)は (3,3)(4,3)(9,5)(10,5) = t1 と t3 だけ。絵(`assets/tavern_map.jpg` を切り出して目視)にも t2 に人物は描かれていない。→ ただし K7。
- ✓ §2-11 `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ changelog は鳴る。
- ✓ `index.html` は `?tower=0` を読まない(`:4353` の注記)= §7 の「`?tower=0` では B も起きない」は酒場とワールドマップの側だけで成り立つ。

#### (3) 崩れ(K1〜K12)

- **K1** 行番号は上表のとおり(`index.html` は 25,157 行以降 −1、§2 自身の 1 行ずれが 3 件、`tavern.html` +2 / +13、`js/npc-crowd.js` の `TAVERN` は `:36-62`)。中身は同一 ⇒ 仕様への影響なし。
- **K2 ⭐⭐⭐ 主人公が階段の口まで歩くのに 45.1 秒かかる ⇒ §2-5 の上限 40 秒では素で必ず fail-open に倒れる。** 測定台(`walk_n1.js`・追い払いは verify_tower_mother の手順の写し・制覇の代わりに `checkDungeonClear` を記録係へ差し替え)で、非 autoplay(`?diag=1` = 実プレイの速さ)・追い払い直後の主人公 (28,11) → `start` (16,13) = A* 14 マス: **8/8 走行で 45,112〜45,180 ms**(+ 1 走行は K4 で停止)。内訳は探索ターン(1 マスごとの仲間/敵の手番)25.9 秒・後衛待ち 7.0 秒・語り 3.8 秒 = 1 マス ≈ 3.2 秒。⚠ autoplay でも縮まない: `?autoplay=20` で 14 マス 39.7 秒 / `?autoplay=1` で 7 マス 21.7 秒(slide と手番の間隔が実時間)。⚠ 後衛待ち 7 秒は測定装置の副作用(仲間の手番を空にしたので戦闘中に仲間が動かず 12 マス離れていた)= 実戦では短いが、上限は母の emerge / approach(7 マス)/ talk(2 件 × 2.26 秒)の上に乗る。⇒ **2a への指示**: 上限は「起動から 40 秒」をやめ、**follow を始めてからの時間**で数え、**90 秒以上**(目安 = 経路の長さ × 4 秒 + 30 秒)にする。§2-5 は「項目1 の実測で決めてよい」と委ねているので実装窓の判断で決めてよい。受入 (1e)「上限による done ではない」は素で緑になる値にすること。
- **K3 ⭐⭐ ゲートは戦闘の後始末の最中に初めて当たる。** 条件(敵が全部 `!alive` かつ `graphBossDefeated()`)が初めて真になる `checkDungeonClear` の呼び出しは、11/11 走行で `encounterActive && encounterRunning` がまだ真(終戦の 29〜67 ms 前・autoplay では 146〜452 ms 前)。今の本番は `dungeonCleared` がこの瞬間に立つ。⇒ **2a**: `towerMotherHolds()` のラッチはここで立ってよいが、emerge(揺れ・音・土埃・語り)は tick の側で **`!encounterActive && !encounterRunning` を待ってから**始める(戦闘の終わりの語り・吹き出しの剪定 `pruneSpeechQueue` `:22283` と重ねない)。
- **K4 ⭐⭐ ゲーム時間が止まっている間も実時間は進む。** 9 走行のうち 1 走行で、歩き出す直前に 400ms tick が ② へ進み(測定台は出口の冷却を `enterNode` の前に遠い未来へ置いたが、`enterNode` が `:38111` で 0 に戻し `:38146` で到着の冷却に置き換える = 装置が効いていなかった)、**非 autoplay の `showExitArrows` が `dialogPaused = true` を立てて 90 秒間 主人公が 1 マスも動かなかった**(= 罠 1 の手動版を実際に踏んだ)。ナレ・ダイアログ・矢印の間は `moveEnemies` が `:18886` で早期 return する = heroAI も `checkDungeonClear` も止まる。⇒ **2a**: 上限を `Date.now() - t0` の実時間で数えると、プレイヤーが判定パネルや語りを読んでいる間に上限が満ちて fail-open する。**止まっていない時間だけ**数える(`moveEnemies` の中で加算する / `dialogPaused` / `narrationHold` / `narrationPlaying` の間は数えない)。⇒ **受入ドライバへ**: 出口の冷却を装置にするなら `enterNode` の**後**に置くこと。
- **K5 ⚠ 母の吹き出しはそのままだと「ボスの台詞」の血赤になる。** `speechKind(u)` は `classKey` を持たない話し手を `"enemy"` と見なし、`_renderBubble` が `.speechBubble.enemySpeech`(`:2632` 「ボスの台詞: 血赤」)を付ける。⇒ 2a で母の状態オブジェクトに `classKey: null`(`!== undefined` = `"ally"` 扱い・頭上 −24)を持たせるか、血赤のままにするかを決める(見た目は §9)。⚠ ほかに 2 点: `SPEECH_LINES` の値は**配列**(`resolveSpeechLines` は `Array.isArray` で弾く = §4-5 の文字列のままだと 1 件も出ない)/ §2-8「優先度 2 は押し出されない」は厳密でない(キューが 3 件とも優先度 2 なら最古が押し出される `:12838-12844`・6 秒で賞味期限 `SPEECH_STALE_MS`)。
- **K6 ⚠ 「主人公の 2 歩遅れ」は仲間の電車と同じタイルを取り合う。** `exploreAllyTurn` は仲間 1 人目を主人公の旧タイルへ、2 人目を 1 人目の旧タイルへ…と辿らせる(`:19114-19117` の注記)⇒ 2 歩遅れ = 2 人目の仲間の居るタイル。到着時の仲間のチェビシェフ距離は [3,4,5](後衛待ちあり)/ [2,3,3](autoplay=1)。⇒ 2a: done の「母が主人公から 2 以内」は母が足跡を辿る限り満たせるので仕様は整合している。重なりは見た目の問題(`resolveUnitOverlaps` は母を知らない)= §9 で確かめる。最後尾の仲間の後ろに付けるなら done の判定を「足跡の位置に着いた」へ言い直すこと(距離を緩めて済ませない)。
- **K7 ⚠ t2 の席札は 2/3 の盤面で出る。** `drawBoard` は 3 卓から 2 卓をランダムに選ぶ(`tavern.html:10713-10723`)= §2-9「t2 は空いている」は客の話で、依頼の札は出る。下の (5) のとおり初期案 (4,7)/(5,7) は札があってもなくても `ok`、上の行 (4,6)/(5,6) は札がある盤面で I5 に落ちる。⚠ さらに NPC は `initTavernMap()` の中にある ⇒ `?tavernmap=0` と `?npc=0` では母子も生えない(受入 (3a)(3b)(4b) は既定のスイッチで測る)。
- **K8 ⚠ done から制覇までの隙間にも ② が入る。** done で `heroForcedGoal = null` に戻すと、次の `checkDungeonClear`(`moveEnemies` の末尾・30ms 周期)より先に 400ms tick が `:38305` を抜けて ② に進みうる。`moveEnemies` がナレで止まっていれば隙間は長い。⇒ 2a: `towerMotherActive()` を「起動済み かつ `!dungeonCleared`」にする(done の後も `dungeonCleared` が立つまで真)か、done と同じ処理の中で制覇まで進める。⚠ 主人公が着いた後は `nodeGateReached = true` のまま残る(`nodePendingExit` が null なので ① は走らない = 害なし)。
- **K9 ⚠⚠ `verify_tower_mother` は非 autoplay(`?diag=1`)で、追い払いの後に主人公は (28,11) に居る。** ⇒ 2a の後、随伴の分(K2 の 45 秒 + emerge/approach/talk)が (3d) の待ち(12 + 15 秒)を超える = 素で (3d) が赤。`--negative` も (3d) を担当に持たない 7 本(`lethalonly` / `sidefrontier` / `inmain` / `sixslots` / `nokinds` / `fleeall`・`viadefeat` は MAYBE)で想定外の赤 = exit 1。⇒ 依頼書 §8 のとおり (3d) を「随伴の `phase === "done"` を見てから `lastResult`」へ言い直す(⛔ 待ち時間だけ伸ばさない)。
- **K10 ⚠ 変異アンカーが変更区域に 6 本ある**(`anchors.py`・`tools/*.js` 全文の `from:` を本番 3 ファイルで突き合わせた):`verify_npc_crowd` が `js/npc-crowd.js` の porter `:55` / server `:59`(2 本)/ strollB `:96` / strollC `:98` / `global.NPC_CROWD = {` `:157`、`verify_recruit_talk` が patronA `:40` と `tavern.html:5899`(`DFRecruits.clear()`)、`verify_quest_draw` が `tavern.html:5865`(`questBoard` の削除)、`verify_tower_mother` が `index.html:17885`(`window.fleeEnemy = fleeEnemy;`)。どれも「配信ファイル合算でちょうど 1 件」を要求する ⇒ 2a/2b はこれらの行を**書き換えない・複製しない**(`REUNION` の行に既存の行の文字列を写さない / `NPC_CROWD` の書き出しは `TAVERN: TAVERN, TOWN: TOWN,` の行へ足す / `__towerMotherTV` のシームは `:17888` 以降へ足す)。`checkDungeonClear` / `tickNodeChoice` / 撤退 2 か所 / `renderWorld` / `SPEECH_LINES` / `initNpcCrowd` / `npcBubbleShow` に掛かるアンカーは 0。
- **K11** `driver_speech_engine` (0) は判定行の詳細に `lineKeys=<SPEECH_LINES のキー数>` を出す ⇒ 台詞 2 キーを足すと**色は変わらず詳細の数字だけ +2**(項目4 の指紋の突き合わせで「差分」に見えるので先に記録)。`driver_speech_v2` (A) は `ENEMY_TYPES` の全種に鳴き声を要求する = 母を `ENEMY_TYPES` に足さない限り無関係。
- **K12** 名指しの `driver_encounter_mopup` / `verify_run_chronicle` / `driver_graph_p6` は塔の母を 1 度も走らない(`tower` の語 0 件)。`tower-mother` を名指す本は `verify_tower_mother` / `verify_quest_walk` / `verify_dragon_fold` / `verify_swamp_novice` / `driver_mapeditor_painting` の 5 本で、後ろ 4 本が読むのは地図・テーマ・湧きの種類表・伝承 = B が触らない所。

#### (4) 測定台の結果(本番の作業ツリー・新しい素材なし)

**主人公の歩行時間**(`walk_n1.js`・port 10605/10606/10608/10609)

| 腕 | 走行 | 出発 → `start` | A* | 着くまで | 内訳(50ms 標本) |
|---|---|---|---|---|---|
| 非 autoplay `?diag=1` | 8 | (28,11) → (16,13) | 14 | **45,112〜45,180 ms**(8/8 到着)| 探索ターン 518〜519・後衛待ち 140・語り 76〜77・ダイアログ 0 |
| 非 autoplay(K4 の 1 走行) | 1 | (28,11) → (16,13) | 14 | **90 秒で到着せず**(打ち切り)| ダイアログ 1,501(= 出口の矢印)|
| `?autoplay=1` | 1 | (23,13) → (16,13) | 7 | 21,744 ms | 探索ターン 241 |
| `?autoplay=20` | 1 | (28,11) → (16,13) | 14 | 39,720 ms | 探索ターン 488・後衛待ち 130 |

**REUNION の席**(`reunion_seat.js`・port 10607・本番の `NPC_CROWD.validate(list, TAVERN_MAP, 実 DOM の札)` + 同じ式で置いた実 DOM の矩形 + 札の中心の `elementFromPoint`)。盤面 3 種(t1+t2 / t3+t2 / t1+t3)x 画面 2 種(1440x900 = zoom 0.825 / 390x844 = zoom 0.674)= 6 ページ。素の `TAVERN` は 6/6 で `ok`・`.npcUnit` 8/8。

| 案 | 札あり(t2 に札の盤面 4 ページ)| 札なし(2 ページ)| 他の NPC・名札との重なり | 判定 |
|---|---|---|---|---|
| **A = 初期案** 息子 (4,7) dx −14 dy 6 / 母 (5,7) dx 14 dy 6 | **ok 4/4** | ok 2/2 | 0 | **採用可**。ステージ px の矩形 = 息子 l370 t637 r466 b733 / 母 l494 t637 r590 b733(t2 の札の下端 553 から 84px 下)|
| B (4,6)/(5,6) dy 6 | I5 で落ちる(desktop は 2 人とも・compact は息子だけ)| ok | 0 | 不可 |
| C (4,6)/(5,6) dy −6 | I5 で落ちる | ok | 0 | 不可 |

⚠ compact の 3 ページは全案(と素)で `tavernDoor_shop` の札の中心が画面外(`elementFromPoint` が null)= REUNION と無関係の既存の姿。

#### (5) 名指し golden の着手前の色

本番の作業ツリー・直列・既定ポート(`run_named.ps1`・PowerShell・ログ = `item1/named/`)。**22 腕すべて exit 0・揺れなし**。

| 本 | 素 r1 | 素 r2 | `--negative` |
|---|---|---|---|
| `verify_tower_mother` | exit 0・19/19(76 秒)| exit 0・19/19(68 秒)| exit 0(663 秒・9 本すべて担当が赤・担当外 0。`viadefeat` の (3d) は今回緑)|
| `verify_npc_crowd` | exit 0・33/33・PENDING 0 | exit 0・33/33 | exit 0・58/58(239 秒)|
| `verify_recruit_talk` | exit 0・25/25 | exit 0・25/25 | exit 0(612 秒・全変異 OK)|
| `verify_quest_draw` | exit 0・18/18 | exit 0・18/18 | exit 0(349 秒・10 本すべて担当が赤)|
| `verify_tavern_map` | exit 0・47/47 | exit 0・47/47 | exit 0・71/71(44 秒)|
| `driver_encounter_mopup` | exit 0・36/36(328 秒・休憩 5 回)| exit 0・36/36(休憩 6 回)| (`--negative` なし)|
| `verify_run_chronicle` | exit 0・73/73(257 秒)| exit 0・73/73 | exit 0(1,455 秒・8 本すべて担当が赤・空振り 0)|
| `driver_graph_p6` | exit 0・250/250 | exit 0・250/250 | (`--negative` なし)|

⇒ post84 の同じ腕(`45319e4`)とも全部同じ色。

#### (6) 母集団の着手前の色(流用)

- `45319e4..35ad1fc` で `index.html` / `tavern.html` / `js` / `audio.js` / `tools` の OID が 5/5 同一 ⇒ **#84 の `post84.tsv`(HEAD `45319e4` で走査・204 腕)をそのまま流用できる(実走 0)**。凍結コピー = scratchpad `item1/from84/post84.tsv`。204 腕の終了コード = 0: 180 / 1: 17 / 3: 7(非緑 24 = #84 §10-3 の「非緑 21 + 揺れ 3」と同じ顔ぶれ)。
- #83 が触る `js/npc-crowd.js` を読む本: 直接 `NPC_CROWD` を読む `verify_npc_crowd`(素 / `--negative`)・`verify_recruit_talk`(素 / `--negative`)/ `.npcUnit` を測る `verify_enemy_name_label`(素 / `--negative`)・`verify_hold_person`(素 / `--negative`)・`verify_party_promises`(素)/ `tavern.html` か `town.html` を開く本(npc-crowd.js を踏む)22 本 = **全部 post84 に在る**。post84 に無いのは `auto_debug_run`(走らせない)と `probe_magehand_reach`(測定台)だけ。
- ⚠ 足りない腕 = **`verify_party_promises --negative`**(`.npcUnit` を読み `--negative` を持つのに post84 に無い)。着手前の色を 1 回実走して控えた = **exit 0**(550 秒・「9 本すべて担当ラベルが赤くなりました (空振り 0)」・ログ `item1/named/23_verify_party_promises_neg.log`)。項目4 の母集団は post84 の 204 腕 + この 1 腕 = 205 腕を基準にする。他に `--negative` を持つのに post84 に腕が無い本(`driver_action_priority` / `driver_bgm_title` / `driver_bgm_town` / `driver_party_view_reopen` / `verify_ability_scores` / `verify_darkvision` / `verify_mercenary_roster` / `verify_pen_narration` / `verify_pen_sample` / `verify_player_sheet` / `verify_spell_off`)は、変異アンカーが #83 の変更区域に 0(K10)・npc-crowd.js を読まない ⇒ 項目4 で足すかは変更後の差分を見て決める。

#### (7) 予告表 — 2a / 2b で色が動く見込みの既存 golden

| 本:行 | 前提にしていること | 2a/2b の後 |
|---|---|---|
| `verify_tower_mother.js:679-692` (3d) 素 | 追い払いの後 12 + 15 秒以内に `lastResult` | **赤**(K9)→ 随伴の done を見てから待つ形へ言い直す |
| `verify_tower_mother --negative` | 各変異の腕で (3d) は緑 | **exit 1**(7 本で (3d) が想定外の赤)→ 言い直しで戻る |
| `verify_tower_mother.js` の変異アンカー `window.fleeEnemy = fleeEnemy;` | `index.html` にちょうど 1 件 | シームを足しても行を触らなければ緑(K10)|
| `verify_npc_crowd` (0b-dom) | `.npcUnit` の数 = `TAVERN.length` | 素の保存(印なし)では緑のまま。`TAVERN.concat(REUNION)` を印ありのときだけにすれば動かない |
| `verify_npc_crowd` の変異アンカー 6 本(K10)| `js/npc-crowd.js` に各 1 件 | `REUNION` を別配列で足し既存行を写さなければ緑 |
| `verify_recruit_talk` / `verify_quest_draw` のアンカー(`tavern.html:5865` / `:5899` / npc-crowd `:40`)| 各 1 件 | `consumeResult` へ印の 1 行を `:5901` の塊の中に足すだけなら緑 |
| `verify_tavern_map` / `verify_quest_draw` / `verify_recruit_talk` / `verify_run_chronicle` / `driver_encounter_mopup` / `driver_graph_p6` | 印の無い保存・塔の母を走らない | 緑のまま(構造: 母は塔の母のボスノード、母子は印ありの酒場にしか出ない)|
| `driver_speech_engine` (0) | 詳細 `lineKeys=N` | 色は不変・詳細 +2(K11)|
| `driver_graph_sce1` / `driver_graph_reentry` / `driver_sce1_events` | `.sce1Captive` の数 | 母に `.sce1Captive` を付けなければ不変(塔の母を走らないので付けても実害は無いが、数える本の前提を汚さない)|

### 12-1. 項目2a — 塔の中(`index.html`・基準 `56d4578`)

触ったのは `index.html`(+283 / −1)・`tavern.html`(changelog の `<li>` 1 行の追加と最古 1 行の脱落のみ)・`tools/verify_tower_mother.js`((3d) の言い直し)。`tavern.html` の本体・`js/*`・`audio.js` は触っていない。改行は `index.html` / `tavern.html` とも CRLF のまま(bare LF 0・bare CR 0 を `py` で確認)。

#### (1) 実装の要点と実装後の行番号(項目2a の commit)

| 何 | 行 | 中身 |
|---|---|---|
| CSS `.towerMother` / `.towerMother.faceLeft` | `:1551-1567` | `.sce1Captive` の基底を写した**別 class**(§12-0 の注記どおり `.sce1Captive` は付けない)。背景画像 = `assets/villager_oldwoman_walk.png`・`576px 384px`・`pointer-events:none`・`z-index:3`。⚠ `background-position` は CSS に書かず JS が毎フレーム書く(段の出所を 1 か所 = `TOWER_MOTHER_ROW_Y` にする) |
| `body.zoomed .towerMother,` | `:3001` | 拡大表示の一覧へ 1 行(軸 = 左上)|
| `body.zoomed .towerMother.faceLeft` | `:3018-3021` | 拡大中の左向き = `translateX(96px×camz) scale(-camz, camz)`(軸が左上なので幅だけ戻してから反転)。母は敵/味方でない = `composeSpriteTransform` を通らない要素なので、`transform` を上書きする相手が居ない |
| `SPEECH_LINES` の 2 キー | `:12700-12702` | `"tower.mother.meet"` / `"tower.mother.follow"`(**配列**・K5)|
| `renderWorld` の位置ブロック | `:16921-16931` | 捕虜の直後。`SX(towerMother.x)` / `SY(towerMother.y)`・歩いている間だけ 6 コマ(110ms)・`faceLeft` の付け外し。DOM が無ければ `towerMotherEnsureEl()` で作り直す |
| `moveEnemies` 末尾の `tickTowerMother();` | `:19137` | `checkDungeonClear()` の直前。⭐ `moveEnemies` の早期 return(`dialogPaused` / `narrationHold` / `narrationPlaying`)の内側 = **止まっている間は随伴も上限も進まない**(K4)|
| `checkDungeonClear` のゲート | `:19955` | `if (towerMotherHolds()) return;` を `dungeonCleared = true` の直前に 1 行。判定式 `enemies.every(...) && objectiveDone` は 1 文字も変えていない |
| 随伴の本体(状態・tick・シーム) | `:26718-26956` | `hideSce1Captive` の直後。下の (2) |
| `clearNodeArrays` で `towerMotherEl = null` | `:36566` | DOM はノード寿命・状態 `towerMother` は落とさない(捕虜と同じ分け方)|
| `tickNodeChoice` の入口 | `:38561` | `if (!RUN) return;` の直後に `if (towerMotherActive()) return;`(罠 1)|
| 撤退クリック | `:40592` | `if (gameOver \|\| dungeonCleared) return;` の次の行に `if (towerMotherActive()) return;`(罠 2)|
| `updateRetreatBtnState` | `:40655` | `\|\| retreatInProgress` の次の行に `\|\| towerMotherActive();`(罠 2)|

#### (2) 随伴の形

- 状態 `towerMother` = `{ phase, tx, ty, x, y, alive:true, classKey:null, def:{displaySize:96}, facing, path, stepTo, phaseMs, followMs, capMs, goal, trail, forced, doneBy, ... }`。⛔ 敵配列には入れない(`enemies.length` は追い払いの前後で 2 のまま = 下の (4))。
- `towerMotherHolds()` = 塔の母の RUN(`RUN.scenarioId === "tower-mother"`)・ボスノード・`?towermother=0` でない、のときに**初回だけ**状態を作って `phase:"hidden"` でラッチし、以後は `phase !== "done"` を返す。`towerMotherActive()` = `!!towerMother && !dungeonCleared`(**K8 の決定**: done から制覇までの隙間も真)。
- `hidden`: `encounterActive` と `encounterRunning` が両方偽になるまで何もしない(**K3 の決定**)。
- `emerge`: `triggerScreenShake(6, 450)`(⚠ 既存の関数どおり `__autoplay` では揺らさない)+ `sfx("cageOpen")`(既存の重い仕掛けの音)+ 土埃 = 既存の `spawnGroundFx(タンスの 3 マス, "axestorm", 900)`(アックスストームの茶色 = 土埃)+ `updateInfo("ゴトリ、と重い音。扉を塞いでいたタンスが、内側から押し退けられた")`。900ms 待ってから絵ローカル (8,4)→(8,5)→(8,6)→(8,7) を決め打ちで歩く(塞いだタイル = A* を使わない)。同時に主人公を `heroForcedGoal = 今のタイル` で**その場に留める**(D1)。
- `approach`: 本番の `aStar(母, 主人公)` の最後の 1 マスを除いた経路を 380ms/マスで歩く(⛔ 自前の BFS なし)。経路が取れなければ主人公の足元へ寄せる。
- `talk`: `sayLine("tower.mother.meet", 母)` → `sayLine("tower.mother.follow", 母)`。キューと表示中に母の吹き出しが無くなるまで(最低 600ms・最大 9 秒)待つ。
- `follow`: `heroForcedGoal = snapToWalkable(RUN.byId[ボスノード].mapDef.start)`(⛔ 座標の直書きなし = (16,13))。⛔ `nodePendingExit` は立てない。母は主人公の足跡の列 `trail` を **2 歩遅れ**で 1 歩ずつ辿る(経路が取れなければ足跡へ寄せる)。
- `done`: 主人公が `goal` に居て、母が主人公からチェビシェフ 2 以内 = `doneBy:"arrived"`。または follow の上限 = `doneBy:"cap"`。tick の中の例外も `doneBy:"error"` で done へ倒す(D4)。done で自分が立てた `heroForcedGoal` だけ null に戻し、`nodeGateReached = false`(`nodePendingExit` が null のときだけ)。次の `checkDungeonClear`(同じ `moveEnemies` の直後)で今の流れへ合流する。
- 絵ローカル → global は `RUN.byId[ボスノード].mapDef.rooms[0].rect` から(`+ (c1, r1)` = `+ (14, 5)`)。⛔ global の数字は書いていない。
- シーム(`window.__towerMotherTV` に相乗り・`:26947-26956`): `mother()` = `{ on, phase, tx, ty, x, y, facing, walking, latchedAt, emergeAt, talkAt, followAt, followMs, capMs, goal, trailLen, doneAt, doneBy, el }`(起動前は `{ on, phase:null }`)/ `holds()` = 起動済みかつ done でない(⚠ **副作用なし** = 本番の `towerMotherHolds()` のラッチは呼ばない)/ `active()` = `towerMotherActive()`。⛔ `window.fleeEnemy = fleeEnemy;`(`verify_tower_mother` のアンカー)の行は触らず、シームは随伴の本体の末尾で別の文として足した。

#### (3) 上限の値と根拠(K2 / K4 の決定)

- **follow を始めてからの、止まっていない時間だけ**を数える: `tickTowerMother` は `moveEnemies` の早期 return の内側で呼ばれ、1 回の加算 `dt` は 100ms で頭打ち(止まっていた間が明けた最初の 1 回に、止まっていた時間を足さない)。
- 値 = `max(90 秒, follow 開始時の 主人公 → 階段の口 の A* の長さ × 4 秒 + 30 秒)`。追い払い直後の主人公 (28,12) → (16,13) では A* 14 マス ⇒ 86 秒 ⇒ **90 秒**(実測の `capMs` は 6/6 走行で 90,000)。
- 実測(測定台 scratchpad `item2a/run_mother.js`・本番のまま・ポート 10600〜10604): follow の所要 = 非 autoplay `?diag=1` で **44,462 / 43,590 / 43,650 / 38,700 ms**(4/4 `doneBy:"arrived"`)・390x844 で 37,890 ms・`?autoplay=1` で 35,460 ms。**最大 44.5 秒 = 上限の 49%**。主人公の 1 マス ≈ 3.2 秒(K2 と一致)。

#### (4) 測定台の結果(6 走行 + 撤退 1 走行)

| 腕 | 走行 | 終戦 → 制覇 | 内訳 | 違反 |
|---|---|---|---|---|
| `?diag=1` 1280x800 | 4 | **52.4〜58.2 秒** | hidden ≈ 2.0 秒 / emerge 2.4 秒 / approach 4.9 秒 / talk 4.3 秒 / follow 38.7〜44.5 秒 | 0 |
| `?diag=1` 390x844 | 1 | 51.6 秒 | 同じ形 | 0 |
| `?autoplay=1` | 1 | 44.6 秒 | hidden は 100ms 未満 | 0 |
| `?diag=1&towermother=0` | 1 | **0.1 秒**(#82 の姿 = 即制覇)| `mother().phase === null`・DOM なし | — |

- 違反 = 100ms 標本で「done より前に `dungeonCleared`」「随伴中に撤退ボタンが押せる」「現在ノードが n1 でない」「`#choiceDialog` が出る」の数 = **全走行 0**。随伴中の `enterNode` 呼び出し 0・`chooseExit` 0・`showExitArrows` 0(罠 1 の穴が塞がっている)。
- 母の DOM: `#towerMother.towerMother` が `#nodeLayer` の中・`display:block`・`background-position: 0px -288px`・`background-size: 576px 384px`。`enemies.length` は 2 のまま。
- 吹き出し: `tower.mother.meet` → `tower.mother.follow` → `quest.clear` の順で `__speech.log` に載る。母の 2 件の `kind` は **`"ally"`**(血赤の `.enemySpeech` は付かない)。
- `lastResult` = `{ cleared:true, scenarioId:"tower-mother", reward.gold: 300 }`(#82 と同額)。pageerror 0。

#### (5) K5 / K6 の判断

- **K5**: 母の状態に `classKey: null` を持たせた。`speechKind` は `classKey !== undefined` を味方と見る ⇒ 吹き出しは通常の(味方の)見た目・頭上 −24。CSS は足していない(既存の作法のまま)。
- **K6**: 仕様どおり **2 歩遅れ**のまま。2 人目の仲間と同じタイルに重なりうるのは見た目(§9 で確かめる)。done の距離(チェビシェフ 2)は緩めていない。⚠ 3 歩遅れにすると、主人公が着いたとき母がチェビシェフ 3 に残りうる(足跡はもう伸びない)ので done の判定の言い直しまで要る ⇒ 採らなかった。

#### (6) 逸脱

- **D1** §4-3 の emerge の間、依頼書に無い「主人公をその場に留める」(`heroForcedGoal = 今のタイル`)を足した。理由 = follow までの間 `heroForcedGoal` が null だと heroAI の ③(未訪問の部屋)で主人公が動き、母の approach の行き先がずれる。到達済みのタイルなので `nodeGateReached` が立つだけで遷移は起きない(`nodePendingExit` を立てない・tickNodeChoice は入口で返る)。
- **D2** §4-4 の上限を「起動から 40 秒(実時間)」から「follow 開始から・止まっていない時間・`max(90 秒, A*×4 秒+30 秒)`」へ(DEV_QUEUE の K2/K4 決定どおり)。
- **D3** §4-6 の `towerMotherActive()` を「起動済み かつ `phase !== "done"`」から「起動済み かつ `!dungeonCleared`」へ(DEV_QUEUE の K8 決定どおり)。
- **D4** tick の例外を done へ倒す try/catch を足した(`verify_tower_mother` の `fieldtheme` / `nothemes` の変異腕では地図が既定へ落ちて母の座標が意味を失う。pageerror で (0c) を赤くしない・制覇を止めない)。

#### (7) 新たな崩れ

- **K13** 終戦(`encounterActive` / `encounterRunning` が落ちた)から emerge まで **約 2.0 秒**(非 autoplay 5/5)。その間 `moveEnemies` は止まっている(戦闘の終わりの語り)= hidden の tick が進まない。仕様どおり(K3)。見た目の「間」は §9 で確かめる。
- **K14** approach は経路 5 マス(380ms/マス = 1.9 秒)の予定に対し 4.9 秒。止まっている時間を `dt` に数えないので、語り・遅い tick の分だけ歩きが伸びる。上限には効かない(上限は follow だけ)。
- **K15** `verify_tower_mother` の所要が素で 68〜76 秒 → **121〜122 秒**、`--negative` が 663 秒 → **1,099 秒**(9 腕 × 随伴約 55 秒)。項目4 の母集団走査の時間見積もりに入れること。

#### (8) 既存 golden

`verify_tower_mother` の (3d) を言い直した: 追い払いの後、`__towerMotherTV.mother()` が `done` になるまで待ち(待ちの上限 `MOTHER_WAIT_MS` = 180 秒・**合否ではない**)、その間に `dungeonCleared` が立ったら `clearedBeforeDone = true`。(3d) の合否に「終戦時点で随伴が起動している(phase が null でない)」「`phase === "done"`」「`clearedBeforeDone === false`」を**足した**(既存の条件は 1 つも外していない)。⛔ 待ち時間を伸ばしただけではない = 随伴が 1 度も起動しない(項目3 の `nogate`)・随伴を待たずに制覇する、のどちらも赤になる。`doneBy`(到着 / 上限)は合否にしない(項目3 の受入 (1e) の担当)。`viadefeat` の (3d) は確率の赤(NEG_MAYBE)のまま。

名指し golden(本番の作業ツリー・直列・既定ポート・ログ = scratchpad `item2a/named/`):

| 本 | 着手前(§12-0) | 項目2a の後 |
|---|---|---|
| `verify_tower_mother` 素 x2 | exit 0・19/19(68〜76 秒)| **exit 0・19/19 x2**(122 / 121 秒)。(3d) の詳細 = `mother.atEnd:"hidden"` → `phase:"done"`・`doneBy:"arrived"`・`clearedBeforeDone:false` |
| `verify_tower_mother --negative` | exit 0(663 秒)| **exit 0**(1,099 秒・「9 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行」・`viadefeat` の (3d) は今回も緑)|
| `driver_encounter_mopup` | exit 0・36/36 | **exit 0・36/36**(307 秒)|
| `verify_run_chronicle` 素 | exit 0・73/73 | **exit 0・73/73**(181 秒)|
| `verify_run_chronicle --negative` | exit 0 | **exit 0**(1,619 秒・「8 本すべて担当ラベルが赤くなりました (空振り 0)」)|
| `driver_graph_p6` | exit 0・250/250 | **exit 0・250/250**(41 秒)|
| `driver_speech_engine` | (§12-0 では未走・K11 の予告)| **exit 0・17/17**。(0) の詳細 `lineKeys=79`(`SPEECH_LINES` のキーは `56d4578` で 77 → 79 = +2 を静的にも数えた = K11 の予告どおり色は不変)|

- 既存ドライバの変異アンカー(`tools/*.js` の `from:` のうち `index.html` に当たる 169 本)の件数は `56d4578` と作業ツリーで **169/169 同一**(scratchpad `item2a/anchor_diff.py`)= K10 のアンカーを書き換え・複製していない。
- tavern 側の本(`verify_npc_crowd` / `verify_recruit_talk` / `verify_quest_draw` / `verify_tavern_map`)は 2b の担当(本項目の `tavern.html` の変化は changelog の `<li>` 1 行の入れ替えだけ)。

### 12-2. 項目2b — 酒場(`tavern.html` / `js/npc-crowd.js`・基準 `34675e3`)

触ったのは `js/npc-crowd.js`(+17 / −1)と `tavern.html`(本体 + changelog の `<li>` 1 行の書き換え)だけ。`index.html` / `js/tavern-map.js` / `town.html` / `world.html` / 卓の抽選・`boardFacts` / 礼金は触っていない。改行は 2 本とも CRLF のまま(bare LF 0・bare CR 0 を `py` で確認)。既存ドライバの変異アンカー(`tools/*.js` の `from:`)の件数は HEAD と作業ツリーで `tavern.html` 66 本・`js/npc-crowd.js` 10 本・`index.html` 168 本とも**変化 0**(scratchpad `item2b/anchor_diff.py`)= K10 のアンカーを書き換え・複製していない。

#### (1) 実装の要点と実装後の行番号(項目2b の commit)

| 何 | 行 | 中身 |
|---|---|---|
| `REUNION`(息子 `harold` / 母 `towerMother`)| `js/npc-crowd.js:101-116` | `TAVERN` / `TOWN` とは**別の配列**。席は §12-0 の結論どおり (4,7) dx −14 dy 6 face right hold 2 / (5,7) dx 14 dy 6 face left hold 1。シート = `town_mason_walk.png` / `villager_oldwoman_walk.png`(酒場の 8 人とは重ならない)。`say` は §5-2 の文面のまま。⛔ `TAVERN` の 8 人は 1 バイトも触っていない |
| `NPC_CROWD` への公開 | `js/npc-crowd.js:175` | `TAVERN: TAVERN, TOWN: TOWN, REUNION: REUNION,`(K10 の指示どおり `global.NPC_CROWD = {` の行は触らず、この行へ足した)|
| 印・撤退・pending の関数 | `tavern.html:5858-5883` | `TOWER_MOTHER_HOME_KEY = "dragonfighters.towerMotherHome"` / `isTowerMotherOn()`(`?towermother=0` で偽・呼ぶたびに読む)/ `towerMotherHomeShown()`(撤退していない かつ 印 = "1")/ `towerReunionSceneLog`(場面で出した一言の記録)/ `markTowerMotherHome()`(撤退中は何もしない・印は常に "1"・**立てる前が "1" でなかったときだけ** `window.__towerReunionPending = true`)。`consumeResult()` より前に置いた(IIFE が呼ぶ時点で定義済み)|
| `consumeResult()` の印 | `tavern.html:5940` | `if (r && r.cleared && r.scenarioId) {` の塊の中(`saveClearedSet` の後・バナー予約の前)に `if (r.scenarioId === "tower-mother") markTowerMotherHome();` の 1 行。⛔ DOM は作らない。直後の `DFSlots.snapshot()` が印を記録スロットへ焼く |
| シーム `__TAVERN_TV.reunion()` | `tavern.html:11007-11018` | 読み取り専用 `{ on, mark, pending, keys, scene }`(下の (2))|
| 生やす | `tavern.html:11067-11071` | `var npcList = (towerMotherHomeShown() && CROWD.REUNION) ? CROWD.TAVERN.concat(CROWD.REUNION) : CROWD.TAVERN;` → 既存の forEach を `npcList.forEach` へ。⛔ 生やす処理を 2 本書いていない(影・立ち姿・押すと一言・`stopPropagation`・アイドル周期は全部同じ経路)|
| `npcBubbleShow(u, text)` | `tavern.html:11227-11233` | 第 2 引数 `text` を渡すとその文面(省略時は従来どおり `u.n.say`)。⛔ `n.say` は書き換えない。`data-npc-say` は話し手の key のまま |
| 場面の吹き出しだけ見えている幅へ収める | `tavern.html:11199` / `:11213-11220` / `:11233` | `bubbleInView`(文面を渡したときだけ真)。`npcBubbleFollow` の既存のステージ端 clamp の後に、真のときだけ画面の見えている幅(`-camX/zoom` 〜 `(vw-camX)/zoom`)でも clamp。⛔ 押したときの一言の位置は 1px も変わらない(D5)|
| 再会の場面 | `tavern.html:11302-11322` | `initNpcCrowd()` の末尾(NPC が生えて最初の位置に置いた後)。`window.__towerReunionPending === true && towerMotherHomeShown()` のときだけ、`REUNION_SCENE` の 3 件(§5-3 の文面そのまま)を `900ms + idx × BUBBLE_MS(4000)` で順に `npcBubbleShow(話し手, 文面)`。数値は出さない(礼金は帰還の帯が出す)。話し手が居なければ warn して飛ばす |
| changelog | `tavern.html:3335` | 2a の `<li>` を §10 の完成文面へ書き換え(`add_changelog.py` は呼んでいない = `<li>` は #83 全体で 1 本のまま・既定 4 件のまま)|

#### (2) シームの形

`window.__TAVERN_TV.reunion()` → `{ on: isTowerMotherOn(), mark: 印 === "1", pending: window.__towerReunionPending === true, keys: #npcLayer の .npcUnit のうち REUNION の key(DOM 順 = ["harold","towerMother"]), scene: [{ key, idx, at }] }`。`?npc=0` では `#npcLayer` が無いので `keys` は空、`?tavernmap=0` では `__TAVERN_TV` 自体が無い(K7)。

#### (3) 手早い動作確認(scratchpad `item2b/reunion_check.js`・port 10610/10611・本番のまま)

desktop 1440x900 と compact 390x844 の両方で **42/42 OK**(ログ `item2b/reunion_check_10611.log`):

- 初回(`lastResult` = `{cleared:true, scenarioId:"tower-mother"}` を置いて開く): 印 "1"・`.npcUnit` 10(= TAVERN 8 + 2)・`keys` = harold, towerMother・`pending` true・吹き出しが harold → towerMother → harold の順に 3 件(`data-npc-say` と文面で確認・数字 0)・`NPC_CROWD.validate(REUNION, TAVERN_MAP, 実 DOM の札)` ok・`validate(TAVERN, …)` ok・画面内の札の中心の `elementFromPoint` は全部札自身・pageerror 0・背景 = 3 段目(`-288px`)・母は `scaleX(-1)`
- 母子を押す: 2 人とも自分の `say` が出て、`isMoving` false・`walkingTo` null・主人公のタイル不変
- 同じ保存でもう一度 tower-mother のクリアで戻る(同じタブで `lastResult` を置き直して reload): 母子は居る・`pending` false・場面 0 件(10 秒観測)
- 印なし: `.npcUnit` 8 = `TAVERN.length`・`keys` 空 / 他シナリオ(goblin-mine)のクリア: 印 null・母子なし
- `?towermother=0` + 印あり: 母子なし・`.npcUnit` 8・印 "1" のまま / `?towermother=0` + tower-mother の初クリア: 印を立てない・場面なし
- 印だけ(帰還なし): 母子あり・場面なし
- 場面の吹き出しは 3 件とも画面内に収まる(compact も)。スクショ = `item2b/shot_{desktop,compact}_{scene1,seated}.png`。帰還の帯(画面上部・top 110px)と場面の吹き出し(卓 t2 の上)は desktop / compact とも重ならない

#### (4) 逸脱

- **D5** 場面の一言だけ、吹き出しを「画面の見えている幅」にも収めるようにした(依頼書に無い)。理由 = compact(390x844)はカメラが入口の主人公を追うので、卓 t2 の息子(stage x 418)が画面の左端で半分外に出る(中心 x ≈ −8.5px)。ステージ端の clamp だけでは息子の 1 件目・3 件目の文面の左側が画面外で切れた(初回の走行のスクショで確認)。⛔ 押したときの一言(既存の吹き出し)は `bubbleInView` が偽なので 1px も動かない。吹き出しの尾は息子の真上から少し右へずれる(見た目は §9)。

#### (5) 新たな崩れ

- **K16** compact では息子が画面の左端で半分見切れる(上の D5)。母子を押す受入 (3e) は、要素の**画面内の部分**を押すこと(要素の中心は画面外 = `elementFromPoint` が null)。
- **K17** 卓 t2 の絵の円卓は、マスクの `T` (4-5, 6-7) の真ん中ではなく **col 4 の中心付近(stage x ≈ 436)**に描かれている。dx −14 の息子(stage x 418)は**天板の上**に立って見え、母(542)は天板の右の縁の外に立つ(スクショ `item2b/crop_desktop_t2.png`)。席と dx/dy は指定どおり(4,7)/(5,7)・∓14・6 のまま(I1〜I5 は ok)。直すなら息子の dx を I3 の上限 −48 側へ寄せる案があるが、天板の左の縁の内側までしか動かせない(左隣 (3,7) は歩ける = I1 で置けない)⇒ §9 の目視で決める。
- **K18** `?npc=0` / `?tavernmap=0` では母子も場面も出ない(K7 の予告どおり・印は立つ)。
- **K19** 場面の 3 件は `BUBBLE_MS` と同じ 4 秒刻みで、前の吹き出しの自動消去(4 秒)とちょうど同時に次が出る(`npcBubbleShow` が先に前を消すので常に 1 枚)。場面の最中にプレイヤーが別の NPC を押すと、その一言は次の場面の一言で上書きされる(場面は止めない)。

#### (6) 名指し golden(本番の作業ツリー・直列・既定ポート・ログ = scratchpad `item2b/named/`)

| 本 | 着手前(§12-0) | 項目2b の後 |
|---|---|---|
| `verify_npc_crowd` 素 x2 | exit 0・33/33 | **exit 0・33/33・PENDING 0 x2**(76 / 76 秒)|
| `verify_npc_crowd --negative` | exit 0・58/58 | **exit 0・58/58・PENDING 0**(244 秒)|
| `verify_recruit_talk` 素 | exit 0・25/25 | **exit 0・25/25**(45 秒)|
| `verify_recruit_talk --negative` | exit 0 | **exit 0**(612 秒・負のコントロール 11/11 本が期待どおり)|
| `verify_quest_draw` 素 | exit 0・18/18 | **exit 0・18/18**(32 秒)|
| `verify_quest_draw --negative` | exit 0 | **exit 0**(349 秒・負のコントロール 10/10 が検出成功)|
| `verify_tavern_map` 素 | exit 0・47/47 | **exit 0・47/47・PENDING 0**(22 秒)|
| `verify_tavern_map --negative` | exit 0・71/71 | **exit 0・71/71**(43 秒)|
| `verify_party_promises` 素 | exit 0・35/35 | **exit 0・35/35**(39 秒)|
| `verify_party_promises --negative` | exit 0(550 秒)| **exit 0**(549 秒)|
| `verify_tower_mother` 素(changelog の `<li>` 変更の確認)| exit 0・19/19(2a 後 121 秒)| **exit 0・19/19**(121 秒)|

⇒ 全 12 腕 exit 0・着手前と同じ色。`--negative` のログに出る「FAILED n」は変異腕の中の想定どおりの赤(本の終了コードは 0)。
