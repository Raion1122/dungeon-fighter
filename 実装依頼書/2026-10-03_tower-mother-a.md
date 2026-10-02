# #82 新しい依頼「塔の母」— A: 器と戦闘(見張りの塔 2 枚 + ワイバーンを追い払う)

- **起草**: 2026-10-03(起草窓) / **ステータス**: **承認済**(2026-10-03 ユーザー承認)
- **着手**: ⏸ **保留 — #81 の完了待ち**(#82 は #81 の `boardFacts()` を書き換え、非退行に #81 の `verify_quest_draw.js` が要る)
- **基準 HEAD**: `d914fdc`(#81 項目2 まで着地済み)
- **会議**: `dev-meetings/2026-10-03_tower-mother-quest.md`(第1段 → 素材発注 → 第2段の開発計画書。ユーザー承認 2026-10-03)
- **触るファイル**: `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `tools/make_grid_map.py`(台帳 2 行)/ `tools/codex1_sprites.json`(台帳 1 行)/ `assets/`(焼き上がり 2 枚 + ワイバーンのシート)/ 既存 golden の言い直し / `tools/verify_tower_mother.js`(新規)
- ⛔ **着手の前提**: **#81 の完了**(実装窓が項目3〜4 を実行中)。#82 は #81 の `boardFacts()`(`tavern.html:10630`)を書き換えるので、#81 の受入 `tools/verify_quest_draw.js` が出来上がってからでないと非退行を測れない。
- ⛔ **やらない(チケット B #83 へ)**: 母(老婆)の配置・勝利後に出てきて付いて歩く場面・酒場での再会とお礼の場面

---

## 1. 目的

酒場の卓に、本筋の外の依頼「塔の母」が並ぶようにする。

> 「町外れの古い見張りの塔に、年老いた母が独りで住んでいる。町で一緒に暮らそうと言っても、息子の私の言葉は聞いてくれない。説得して連れてきてくれないか。お礼は十分払う」
> 行ってみると塔の周りには魔物がうろつき、母は迂闊に動けない。塔の上にはワイバーンの群れが棲みついている。追い払えば、母は町へ帰ると言う。

本チケット A では、**依頼として遊べるところまで**を作る。丘の道(魔物 2 群)→ 崩れた最上階(ワイバーン 2 匹)の 2 ノードで、ワイバーンは **HP が半分を切ると飛び去る**。全部いなくなればクリア。

**ユーザー決定(2026-10-03・会議の第 2 段で承認)**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 置き場所 | **本筋の外の 7 本目**(`side: true`)。卓の抽選(#81)に混ざるが、本筋・次の未解放の判定には入らない | 生成クエストの家系にする(息子の物語が掲示板のランダム文に埋もれる)/ 本筋の一本道に挿す |
| 追い払い | **HP 半分で飛び去る**。XP は撃破と同額・ドロップなし | 倒し切る(CR6 × 2 の消耗戦になる) |
| 解放 | **砦(orc-fort)クリア後** | 早い段階(CR6 は強すぎる) |
| 頭数 | **2 匹で実測してから決める** | 最初から 3 匹 |
| 群れの長・毒の状態異常 | **やらない** | — |

---

## 2. 着手前の実測(基準 HEAD `d914fdc`。⚠ 着手時に必ず測り直すこと = #81 の項目3〜4 で動く)

### 2-1. 素材(codex1 から納品済み・2026-10-03)

| 素材 | 置き場 | 実測 |
|---|---|---|
| 丘の道 | `C:\Users\PC_User\Desktop\codex1\assets\maps\tower-road-v1.png`(md5 `7e96ec47…`) | 1536x1024。`--fit` 一次解 phase (50.65, 51.45) / period (51.195, 51.620) / cells (29, 18)。縦横差 0.8% |
| 崩れた最上階 | `…\assets\maps\tower-top-v1.png`(md5 `2c6a8a47…`) | 1536x1024。一次解 phase (16.75, 29.95) / period (46.010, 44.390) / cells (33, 22)。⚠ **縦横差 3.6%**(出荷済みの廃坑 7.75% より良いが、台帳でかなり大きい部類) |
| ワイバーン | `…\assets\wyvern\wyvern-walk-attack-right-6-aligned\`(walk 6 + attack 6・各 502x786) | 本物の `validate_sprite_outputs.py` exit 0 / `check_pose_alignment.py` **PASS with WARN**(攻撃 4 コマ目の沈み込み 83% = 尾を突き下ろすポーズ。意図どおり)/ 接地線 spread 1px / md5 12 個全相違 / 背景残り 0 件。⚠ **walk 6 コマ中 4 コマに 1〜33px の浮遊点**(閾値 64px 未満で受入は合格)→ 取り込み前に `tools/clean_codex1_frames.py` で `-clean` 派生を作る(町人 6 体の前例) |

地図の絵の中身(目視): 丘の道 = 西の端から東の塔の扉まで途切れない土の道・開けた地面 2 箇所・荒らされた菜園/井戸/薪。最上階 = 西の**壁の内側**に螺旋階段(⚠ 左辺の端ではない)・広い石の床・東にワイバーンの巣・北西の角に母の小部屋(扉はタンスで塞がれている = B で使う)。

### 2-2. ⭐ 戦闘中の追い払いは安全(崩れた前提の訂正)

廃坑の `applyGrixGuardFlee()` のコメント(`index.html:26665-26666`)は「戦闘中に呼ぶと `encounterEnemyIndices` と手番管理が齟齬する」と書いている。**これは「消す」ことには当てはまらない**:

- 通常の撃破 `defeatEnemy()`(`:17490`)は**戦闘中に日常的に** `alive=false` を立てている(呼び口 例 `:27277` `:29291` `:32320` `:34815` ほか)
- `runEncounter`(`:21562`)は `encounterEnemyIndices` を剪定せず、手番ごとに `if (actor.kind === "enemy" && !enemies[actor.idx].alive) continue;`(`:21834`)で飛ばす。標的選びの `pickAliveEngagedIdx()`(`:23219`)も `!alive` を除外する
- 勝利判定 5 箇所(`:19634` `:19668` `:36616` `:37632` `:37891`)はすべて `enemies.every(e => !e.alive || e.passiveNpc)`
- 齟齬が起きるのは**足す**ほう(`applyGrixAdds` `:26697-26702`: ユニットの無い index が残ると戦闘が終わらない)

⇒ 追い払いは `alive=false` で表してよい。**勝利判定は 1 行も触らない**。

### 2-3. ⚠⚠⚠ 罠 1 — HP の書き込み口は 1 つではない

敵の HP を減らす箇所は**約 40**(`:17341` 探索中 / `:23290` `:23327` `:23562` 武器 / `:27136` 罠 / `:29285-29813` 範囲呪文 / `:34807` 毒 / `:35505` 敵同士 ほか)。#37 の「7 点」は**年代記の帰属**であって HP の漏斗ではない。

⇒ **割り込み口を 2 つ**持つ:

1. **致死の口** — `defeatEnemy()` の先頭(ハイドラの分岐 `:17493-17521` と同じ位置)に `if (enemy.def.fleeAtHpRatio && !enemy.__fled) { fleeEnemy(index); return; }`。33 の呼び口すべて(一撃で 0 になる場合)を覆う
2. **非致死の口** — 戦闘の手番の終わり `RunChronicle.endTurn(__chSnap)`(`:21862` 付近)の直後と、`tickCordonZones()`(`:21797` 付近)の直後に、`alive && hp <= maxHp * ratio` の敵を `fleeEnemy` する。前例 = グリフォンの `ragePhaseHpRatio`(`:34867`)・戦車の `CHARIOT_HP_TRIGGER`(`:33941`)

⚠ **致死の口だけだと、HP が半分を切っても 0 になるまで戦い続ける**(=「追い払い」が実質「撃破」と同じ長さになる)。⇒ §8 の変異 `lethalonly` で機械検査する。

### 2-4. ⚠⚠ 罠 2 — `fleeEnemy` を `defeatEnemy` 経由にすると嘘が増える

`defeatEnemy()` は `RunChronicle.kill`(`:17524`・撃破の唯一の集約点)・`__diagDead = true`(`:17525`・自動デバッグの「蘇生」検出 `:40349` が見る)・ドロップ 5 種(`:17538-17542`)・死亡の効果音を出す。⇒ `fleeEnemy(i)` は**独立した関数**にし、次だけを行う:

- `alive = false` / `coinVisible = false` / `knockbackVX = knockbackVY = 0` / `hitStun = 0` / `damageFlashTimer = 0` / `state = "idle"` / `poisonRemaining = 0` / `__fled = true`
- **XP は撃破と同額** `gainXP(def.xp, 名前)`(ユーザー決定。5e の「脅威を乗り越えた」)
- ⛔ `RunChronicle.kill` を呼ばない・`__diagDead` を立てない・ドロップを出さない
- 演出: 飛び去る(下の §5-3)+ `updateInfo("…は空へ逃げ去った")`

### 2-5. ⚠⚠⚠ 罠 3 — 屋外の地図は、テーマを正しく選ばないと絵が出ない

- `js/df-mapdef.js` の `resolve()`(`:1973`)の規則④: `FIELD_THEME_IDS`(`:2150` = `{"caravan-road":1}`)のテーマは**1 枚絵を持てない**
- テーマ id は `THEMES`(`js/df-mapdef.js:39-47`)に**載っていないと** validate が `themeId が既存テーマに無い`(`:1554`)で落ち、黙って絵が消える
- 前例: 街道の襲撃(`index.html:5555-5575`)と沼の参道(`:5692-5695`)は、**屋外テーマではないテーマの下**に `outdoor:true, node:true, sealRing:true` で置いて解決した
- ⇒ 本件は新テーマ **`tower-mother`** を `THEMES` に足し(⛔ `FIELD_THEMES` には入れない)、丘の道の絵に `outdoor:true` を付ける

### 2-6. 新シナリオを足す口(全数・`index.html` / `js/df-mapdef.js` / `tavern.html` / `js/world-map.js`)

| 場所 | 何 | 要否 |
|---|---|---|
| `index.html:3699` 付近 `SCENARIO_TEX` | 床/壁の画像。無い id は廃坑へ落ちる(`:3768`) | 要(既存の画像を流用してよい。例: 砦) |
| `index.html:4305` 付近 `NODE_EXTRA_SPAWN_KINDS` | ⚠ **宣言しないと罠と玄室の宝箱が黙って 0 になる**(#16 の教訓) | 要: `t["tower-mother"] = { n0: ["search","loot"] }` |
| `index.html:6011-6321` `ROOM_PAINTINGS_DEF[theme]` | 大部屋の絵 + MASK(`blocked`)。⚠ `node: true` 必須(無いと従来経路が別シナリオに貼る `:6444`) | 要: `n0big`(`outdoor:true`)/ `n1big` |
| `index.html:10904` 付近 `SCENARIOS[id]` | `title` / `flavor` / `clearXp` / **`clearGold`**(`:39823` で勝利時に払う)。無い id は廃坑へ落ちる(`:11115`) | 要 |
| `index.html:14647` `SCENE_BGM` | 無い id は合成 BGM へ落ちる(`:14680`) | 要(既存の曲を流用) |
| `index.html:14733` `SCENARIO_NARRATIONS` | 開幕の DM の語り | 要 |
| `index.html:38268-38272` `buildScenarioRun` の振り分け | ⚠ **行を縦に揃え直さない**(ドライバが逐語で握っている) | 要: `if (scenId === "tower-mother") return buildTowerMotherRun();` |
| `index.html:3414` `const ALL` | `?autodebug` の巡回 | 任意(入れない) |
| `js/df-mapdef.js:39-47` `THEMES` | §2-5 | 要 |
| `js/df-mapdef.js:1879-1889` `THEME_DEFAULT_ENEMIES` | 地図エディタ用 | 推奨 |
| `js/df-mapdef.js:2189-2215` `LINT_PAINTING_ASPECTS` | ⚠ 新しい絵の縦横比が既存のどれとも合わないと**起動時 lint が警告し `driver_graph_p6` (2c) が赤** | 絵の寸法しだいで要 |
| `tavern.html:3513-3646` `scenarios` | 卓の依頼。7 本目 | 要(§4-1) |
| `tavern.html:4257` `ALL_MAIN_SCENARIOS` | ポストゲーム解放の判定 | ⛔ **入れない**(本筋 6 本のまま) |
| `tavern.html:6324` `CLIENT_ART` | 依頼人の肖像。無ければ CSS の人形 | 入れない(肖像は後日) |
| `tavern.html:6333` `renderTables()` | ⚠⚠ `?tavernmap=0` の 1 枚絵。`tableSlots` は **6 枠**しか無く、7 本目は最後の枠(竜の巣)に**重なって描かれる** | 要: `side` を 1 枚絵から外す(§4-1) |
| `tavern.html:10630` `boardFacts()`(#81) | 本筋 = 「scenarios 順で最初の解放済み かつ 未クリア」。次の未解放 = 「最初の未解放」 | 要: `side` を両方から外す(§4-2) |
| `tavern.html:10864` `openBackroom()` の `scenarios.slice(3)` | `?questdraw=0` の奥の間 | 要: `side` を外す(撤退時は今日の姿) |
| `js/world-map.js:152` `SITES` / `:171` `UNLOCK` | tavern の写し(`verify_world_map` (4s) が機械照合) | 要 |
| `js/world-map.js:60` `NODES` | 拠点。⭐ 北の丘陵の行き止まり **`pass_n`(736,96)** が「町外れの丘の上の塔」に合う(絵で確認済み) | 要: `pass_n` を `kind:"site"` へ格上げ(⛔ id と座標は変えない・EDGES も触らない) |

### 2-7. 既存の敵の在庫(丘の道の魔物に使う)

`ENEMY_TYPES`(`index.html:9692`)に「野の獣」系は `ruinSpider`(xp 260)・`direBear`(xp 700)・`griffon`(192px・飛行)など。新規の地上の魔物は作らない。⭐ 組み合わせは強さの実測で決める(初期案: 西の群れ = `ruinSpider` ×3 / 前庭 = `direBear` ×1 + `orcArcher` ×2)。

### 2-8. ワイバーンの敵定義の型

192px セルの飛行種 **`griffon`**(`:10743`)が一番近い(`sheetW:1152, sheetH:960, frameW/H:192`・`flight:true`・`attacksPerTurn:2`・`xp:850`)。⚠ 毒の状態異常は**味方側に無い**(毒は味方 → 敵だけ `applyPoison` `:17484`)⇒ 毒針は**ダメージの上乗せ**で表す(新しい状態異常は作らない)。

### 2-9. 名指しで色を控える既存 golden(着手前に実走)

- `SITES` を読む 9 本: `verify_quest_visibility` / `verify_quest_walk` / `verify_road_ambush` / `verify_road_boon` / `verify_road_events` / `verify_tavern_map` / `verify_world_heromark` / `verify_world_map` / `verify_world_steps`
- 卓と盤面: `verify_quest_draw`(#81 の新規)/ `verify_tavern_map`(#81 で 47)/ `verify_npc_crowd`
- 地図と lint: `driver_graph_p6` / `verify_dragon_fold`(畳みの型の写し元)
- 勝利と撃破: `driver_encounter_mopup` / `verify_run_chronicle`
- ⭐ 母集団の全数は、いつもどおり「変更したファイル(`index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js`)を読む本」で引く

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `scenarios` に 7 本目(`side: true`)/ `boardFacts()` で `side` を本筋・次の未解放から外す / 1 枚絵と奥の間から `side` を外す / 撤退スイッチ / changelog |
| `index.html` | §2-6 の「要」の口 / `ENEMY_TYPES.wyvern` / `fleeEnemy()` と割り込み口 2 つ / `buildTowerMotherRun()` / 大部屋 2 枚の `ROOM_PAINTINGS_DEF` + MASK |
| `js/df-mapdef.js` | `THEMES` に `tower-mother` / `THEME_DEFAULT_ENEMIES` / 必要なら `LINT_PAINTING_ASPECTS` |
| `js/world-map.js` | `pass_n` を拠点「見張りの塔」へ / `SITES` / `UNLOCK` |
| `tools/make_grid_map.py` | `GRIDS["tower-road"]` / `GRIDS["tower-top"]` |
| `tools/codex1_sprites.json` | `wyvern` 1 行(192px セル・`-clean` 派生を指す) |
| `assets/` | `room_tower-mother_n0_map.jpg` / `room_tower-mother_n1_map.jpg` / `wyvern_anim.png` |

⛔ `town.html` / `world.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` は触らない(⚠ `world.html` は撤退スイッチの読み取り 1 箇所だけ例外 = §7)。
⛔ 勝利判定 5 箇所・`defeatEnemy()` の本体(先頭の割り込み 1 行を除く)・`runEncounter` の手番ループは触らない。

---

## 4. STEP1 — 依頼の登録(酒場・ワールドマップ)

### 4-1. `tavern.html` の `scenarios`(末尾に足す)

```js
    {
      id: "tower-mother",
      side: true,                 /* ★[#82] 本筋の外。#81 の盤面で「本筋」「次の未解放」の判定から外す */
      place: "見張りの塔",
      title: "塔の母",
      difficulty: "★★★",
      recommendedLevel: 7,        /* 砦 6 と神殿 8 の間。⚠ 強さの実測 (§8 ⑤) で直してよい */
      reward: "十分な礼金",
      client: { name: "<名前>", role: "港の石工", type: "<既存の人形の型>" },
      dialog: "「町外れの古い見張りの塔に、年老いた母が独りで住んでいるんです。…」",  /* §1 の引用を基に */
      enemies: [ { name: "塔を囲む魔物", boss: false }, { name: "屋上のワイバーン", boss: true } ],
      locked: true,
      unlockAfter: "orc-fort",
    },
```

- 名前と人形の型は既存の `client.type` の一覧から選ぶ(実装窓が決めてよい)
- `renderTables()`(1 枚絵)と `openBackroom()`(`?questdraw=0`)は `side` を除いた配列を使う(⭐ `?tavernmap=0` / `?questdraw=0` は今日の姿 = 6 件)

### 4-2. `boardFacts()`(#81)

```js
      var main = scenarios.filter(function (s) { return !s.side; });   /* ★[#82] 本筋の判定は本筋 6 本だけで */
      var unlocked = scenarios.filter(function (s) { return isUnlocked(s); });          /* 抽選の母集団には side も入る */
      var frontier = main.find(function (s) { return isUnlocked(s) && !progress.cleared.has(s.id); }) || null;
      var nextLocked = main.find(function (s) { return !isUnlocked(s); }) || null;
```

⚠ `boardValid()` の条件②「各 id が解放済み」はそのままで `side` にも効く。

### 4-3. `js/world-map.js`

- `NODES.pass_n` を `{ kind: "site", x: 736, y: 96, label: "見張りの塔", desc: "北の丘に立つ古い物見の塔" }` へ(⛔ id・座標・EDGES は変えない)
- `SITES["tower-mother"] = "pass_n"` / `UNLOCK["tower-mother"] = "orc-fort"`
- コメント「札が出る。ちょうど 7 つ」は 8 つへ直す

---

## 5. STEP2 — 地図 2 枚とワイバーン(`index.html` ほか)

### 5-1. 焼き付け(`codex-map-request` スキルの段 3〜4)

1. `py tools/make_grid_map.py --fit … --fit-around 48` を**位相ごと**見直す(⚠ 砦で一次解が外れた前例)→ `GRIDS` に 2 行 → `--name` で焼く → 検算 3 指標(ドリフト ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%)。⛔ 閾値を緩めない。最上階が通らなければ codex1 へ v2 を発注(起草窓へ戻す)
2. MASK(`blocked`)を書く。⚠ 外周 1 マスは `.`・入口の行は端から端まで開ける・敵のタイルは全部 `.`・4 近傍の BFS で連結を確かめる(竜の巣 `:6245-6265` が写し元)
   - 丘の道: 西の口 → 東の塔の扉
   - 最上階: **西の螺旋階段(壁の内側)** → 東の巣の前。⚠ 母の小部屋(北西)は B で使うので、扉のタイルは `blocked` にしておく(B で開ける)

### 5-2. `buildTowerMotherRun()`

竜の巣(`:39321-39447`)の型で、`p6Node()`(`:38678`)を直接 2 回呼ぶ(n4/n7 の名前を流用しない):

- n0「塔へ至る丘の道」: `paint:"n0big"`・`density:0`・`start` は西の口・魔物 2 群(§2-7)・出口 `ex("n1", "right", <右辺の中点>)`(⚠ 出口を持つ rect は唯一解 = 右辺の中点 #53)
- n1「崩れた最上階」(`kind:"boss"`): `paint:"n1big"`・`start` は螺旋階段・ワイバーン 2 匹(うち 1 匹をボススロット)
- ⚠ ボススロットに `isBoss` でない型を置けるかを**項目1 で実測**(置けなければ `wyvern` の変種を 1 つ作る。⛔ 群れの長の仕組みは作らない)
- `NODE_EXTRA_SPAWN_KINDS` に `n0: ["search", "loot"]`(罠と宝箱を 0 にしない)

### 5-3. `ENEMY_TYPES.wyvern` と `fleeEnemy()`

- 5e SRD の Wyvern(Large・AC13・HP110・噛みつき 2d6+4・毒針 2d6+4 + 毒)を本作の尺度へ。⭐ 写し元は `griffon`。毒は `dmgBonus` の上乗せで表す
- `fleeAtHpRatio: 0.5`(⛔ 他の敵には付けない)
- 割り込み口 2 つ(§2-3)と `fleeEnemy()`(§2-4)
- 飛び去る演出: 400ms ほどで上へずらしながら薄くし、終わったら `alive=false`。⭐ 使える部品 = `setEnemyVfx(idx, filter, opacity)`(`:16142`)/ `hydraEmerge` の逆再生(`:1494-1499`・`clip-path` + `opacity` = 反転 `scaleX(-1)` とぶつからない)。⛔ `transform` を上書きしない(左向きの反転が壊れる)
- 取り込み: `tools/clean_codex1_frames.py` → 台帳 `codex1_sprites.json` に `wyvern`(192px セル)→ `pack_codex1_sprites.py` → `py tools/check_sprite_doubling.py` と `py tools/check_alpha_bg_residue.py` を**焼き上がりのシート**で通す(⭐ 目視は本番の床の上)

---

## 6. STEP3 — シナリオ定義

- `SCENARIOS["tower-mother"]`: `clearXp`(砦と同程度)・**`clearGold`**(初期案 300G・強さと合わせて直してよい)・`flavor`
- `SCENE_BGM` / `SCENARIO_NARRATIONS` / `SCENARIO_TEX` は既存の曲と画像を流用(⛔ 新しい素材は足さない)

---

## 7. 撤退スイッチ

- **`?tower=0`** — 酒場の `scenarios` から `tower-mother` を除き、ワールドマップの `pass_n` を中継点のまま描く(= 今日の姿)
- 判定位置 = `tavern.html` と `world.html` がそれぞれ自分のページで読む(`?heromark=0` と同じ「ページ単位で独立」)。⚠ 遷移はまたがない
- ⭐ `index.html` は判定しない(依頼が卓に出なければ入れない。直接 `currentScenario` を書いて入る dev 経路はそのまま動いてよい)
- ⚠ 追い払いは `ENEMY_TYPES.wyvern` にしか付かないので撤退の対象外(ワイバーンが出るのはこの依頼だけ)

---

## 8. 受入条件 — `tools/verify_tower_mother.js`(新規・port base **#81 完了時に決める**。#81 は 10527〜を使用中)

方針: 登録の整合は**ブラウザに載った実体どうし**で突き合わせる(写経しない)。追い払いは本番の `runEncounter` を回して観測し、数値のダメージを注入して境界を踏む。強さは assert にせず**実測値を報告**する(⑤)。

### §0 装置

- **(0a)** `ENEMY_TYPES.wyvern` / `buildTowerMotherRun` / `fleeEnemy` が window から見える(⚠ classic script 直下は window に載らない → 検証シームを明示)
- **(0b)** `tower-mother` の 2 ノードが組み上がり、ワイバーンが 2 体、丘の道の魔物が 1 体以上いる(⭐ 0 体だと §3 が全部空振り)

### §1 登録の整合(2 経路)

- **(1a)** tavern の `scenarios` の `tower-mother`(`side:true`・`unlockAfter:"orc-fort"`)と、`js/world-map.js` の `SITES` / `UNLOCK` が一致
- **(1b)** `ALL_MAIN_SCENARIOS` に入っていない
- **(1c)** `cleared` = 砦まで 4 本 → 盤面の母集団に `tower-mother` が入りうる(8 回引き直して 1 回以上出る)かつ **本筋は神殿**
- **(1d)** `cleared` = 本筋 6 本 → **本筋は null**(⛔ `tower-mother` を本筋にしない)
- **(1e)** `?tavernmap=0` の 1 枚絵は 6 卓のまま / `?questdraw=0` の奥の間は 3 卓のまま

### §2 地図

- **(2a)** 焼き上がり 2 枚が `--check` の 3 指標で OK
- **(2b)** 本番の経路探索(⛔ 自前の BFS を書かない)で、丘の道の入口 → 出口、最上階の階段 → 巣の前が通る。敵のタイルが全部歩ける
- **(2c)** 罠と宝箱が 0 でない(`NODE_EXTRA_SPAWN_KINDS` の宣言が効いている)
- **(2d)** 丘の道は `outdoor` で霧が晴れ、絵が出ている(`isCustom` が true)

### §3 追い払い

- **(3a)** 戦闘中にワイバーンの HP を最大の 0.55 → 0.45 へ**非致死**で下げる → その手番の終わりに `alive=false`・`__fled=true`・**HP > 0 のまま**
- **(3b)** 一撃で 0 にする(致死)→ 撃破ではなく追い払いになる(`__fled=true`)
- **(3c)** 追い払い 1 回で XP が `def.xp` だけ増える(2 回にならない)・`RunChronicle` の撃破数が増えない・ドロップ 0・`__diagDead` が立たない
- **(3d)** 2 匹とも追い払うと戦闘が終わり、ノードがクリアになり、依頼が成功で帰還する(`lastResult.cleared === true`)
- **(3e)** 他の敵(丘の道の魔物)は HP 半分で逃げない

### §4 撤退

- **(4a)** `tavern.html?tower=0` で `scenarios` に `tower-mother` が無い / `world.html?tower=0` で `pass_n` が中継点
- **(4b)** ⭐ (1a)(1c)(4a) の条件を ON/OFF の両方へ当てて反転すること

### ⑤ 実測して報告する(assert しない)

- Lv7 前後・4 人で N=10 走行のクリア率・全滅率・所要。2 匹で強すぎ/弱すぎなら頭数か HP を直し、**直した値と根拠を §12 へ**

### ⛔ 測らないこと

- 飛び去る演出の見た目・長さ(目で直す)/ 依頼の文面 / 礼金の額

### 負のコントロール(`--negative`。配信スナップショットをメモリ上で差し替える)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `lethalonly` | ⭐ 罠 1: 非致死の割り込み口を外す | (3a) |
| `viadefeat` | ⭐ 罠 2: `fleeEnemy` の代わりに `defeatEnemy` を呼ぶ | (3c) |
| `fieldtheme` | ⭐ 罠 3: `tower-mother` を `FIELD_THEMES` に入れる | (2d) |
| `nothemes` | `THEMES` から `tower-mother` を外す | (2d) |
| `sidefrontier` | `boardFacts` の `side` 除外を外す | (1d) |
| `inmain` | `ALL_MAIN_SCENARIOS` に足す | (1b) |
| `nokinds` | `NODE_EXTRA_SPAWN_KINDS` を外す | (2c) |
| `sixslots` | 1 枚絵から `side` を外さない | (1e) |
| `fleeall` | すべての敵に `fleeAtHpRatio` | (3e) |

### 既存 golden

- §2-9 の名指しの本は、着手前の色を項目1 で控えてから比較。⚠ 「6 件」「site 7 つ」を縛る assert は**期待値を緩めず**、`side` の 1 件 / site 8 つを足した形へ測定点を移す(⛔ 本数を減らさない)

---

## 9. 実機/実感の確認

- 砦の後の Lv で遊んで、ワイバーン 2 匹が「怖いが勝てる」か / 飛び去る瞬間が「追い払った」と読めるか
- ワールドマップの「見張りの塔」の札が縦画面で押せるか
- 最上階の地図で、母の小部屋が「誰かが住んでいる」と分かるか(B の前振り)

---

## 10. changelog(`index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>新しい依頼「塔の母」</b> — 砦を越えた冒険者の卓に、町外れの塔に住む母を迎えに行く依頼が並ぶことがある。塔の屋上のワイバーンは、傷つくと空へ逃げ去る。"

---

## 11. やらないこと

- ⛔ 母(老婆)の配置・勝利後の随伴・酒場での再会とお礼の場面 → **#83(チケット B)**
- ⛔ 帰り道の丘を逆向きに歩く
- ⛔ 群れの長 / 味方側の毒の状態異常 / 新しい BGM / 依頼人の肖像
- ⛔ 他の敵への追い払い(`fleeAtHpRatio`)の展開
- `実装依頼書/README.md` へ足す行(承認後に起草窓が足す):

    | 82 | [2026-10-03_tower-mother-a.md](2026-10-03_tower-mother-a.md) | **承認済** | 0% | 新しい依頼「塔の母」A = 器と戦闘。本筋外の 7 本目 `tower-mother`(`side:true`・砦の後)/ 卓上マップ 2 枚(丘の道 → 崩れた最上階)/ ワイバーン 2 匹は HP 半分で飛び去る(`fleeEnemy`・XP は撃破と同額・ドロップなし)/ ワールドマップの `pass_n` を拠点「見張りの塔」へ。⚠⚠⚠ HP の書き込み口は約 40 = 割り込みは致死(`defeatEnemy` 先頭)+ 非致死(手番の終わり)の 2 口 / 屋外の絵は `THEMES` に載せ `FIELD_THEMES` に入れない / `NODE_EXTRA_SPAWN_KINDS` を忘れると罠と宝箱が 0。⛔ 着手は #81 完了後。撤退 `?tower=0` |

---

## 12. 実装結果

(実装窓が埋める)
