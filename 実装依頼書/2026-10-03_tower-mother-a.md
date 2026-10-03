# #82 新しい依頼「塔の母」— A: 器と戦闘(見張りの塔 2 枚 + ワイバーンを追い払う)

- **起草**: 2026-10-03(起草窓) / **ステータス**: **承認済**(2026-10-03 ユーザー承認)
- **着手**: **2026-10-03(実装窓・dev-loop)**。#81 は `1a2859b` で完了(`verify_quest_draw.js` は出来上がっている)
- **基準 HEAD**: `1a2859b`(#81 完了。起草時の基準 `d914fdc` から配信物の OID は不変 = §12-0 (0))
- **会議**: `dev-meetings/2026-10-03_tower-mother-quest.md`(第1段 → 素材発注 → 第2段の開発計画書。ユーザー承認 2026-10-03)
- **触るファイル**: `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `tools/make_grid_map.py`(台帳 2 行)/ `tools/codex1_sprites.json`(台帳 1 行)/ `assets/`(焼き上がり 2 枚 + ワイバーンのシート)/ 既存 golden の言い直し / `tools/verify_tower_mother.js`(新規)
- ✅ **着手の前提(満たされた)**: **#81 の完了** = `1a2859b`(項目1〜4 すべて着地・受入 `tools/verify_quest_draw.js` 18 assert・変異 10)。#82 は #81 の `boardFacts()`(`tavern.html:10630`)を書き換えるので、#81 の受入 `tools/verify_quest_draw.js` が出来上がってからでないと非退行を測れない。
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

## 8. 受入条件 — `tools/verify_tower_mother.js`(新規・port base **10538**・変異は **10539〜**。#81 の `verify_quest_draw` が 10527〜10537)

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

### 12-0. 着手前の実測(項目1・2026-10-03・HEAD `1a2859b`)

⛔ 本番ファイル(`index.html` / `tavern.html` / `js/*` / `world.html` / `tools/*`)は 1 バイトも触っていない(測定の前後で `git status --short` = 本書だけ)。作業物は scratchpad `…/82a8d302-9bcb-4710-938b-eb3290afc0e7/scratchpad/item1/`。

#### (0) 基準 HEAD の差

`git diff --stat d914fdc 1a2859b` = `tools/verify_quest_draw.js`(新規)・`dev-meetings/2026-10-03_tower-mother-quest.md`・`実装依頼書/` の 3 本だけ。
`git rev-parse <rev>:<path>` で `index.html` / `tavern.html` / `audio.js` / `js` / `js/world-map.js` / `js/df-mapdef.js` / `js/tavern-map.js` / `world.html` / `town.html` / `assets` の OID が `d914fdc` と `1a2859b` で**全一致**(`tools` だけ `verify_quest_draw.js` の追加で違う)⇒ 起草時の行番号は配信物の上ではそのまま測り直せる。
`36f4ba0`(#80 完了)→ `1a2859b` で変わった配信物は `tavern.html` と `js/tavern-map.js` の 2 本だけ。`index.html` / `js/world-map.js` / `js/df-mapdef.js` / `world.html` / `assets` は #80 から不変。

#### (1) §2 の主張の測り直し

| 主張 | 実測(HEAD `1a2859b`) | 判定 |
|---|---|---|
| §2-1 素材 md5 | `tower-road-v1.png` = `7e96ec474b7d…`・`tower-top-v1.png` = `2c6a8a47eac3…`。どちらも 1536x1024 RGB | ✓ |
| §2-1 丘の道の一次解 | `--fit-around 48` / 51 で同じ解 phase (50.65, 51.45) / period (51.195, 51.620) / cells (29, 18)。自己相関も縦 51/102・横 52/103。3 倍拡大の目視で線間隔 51.3 / 51.5px | ✓ |
| §2-1 最上階の一次解・縦横差 3.6% | **K1** 下記(偽解) | 崩れ |
| §2-1 ワイバーン | `wyvern-walk-attack-right-6-aligned\` = walk 6 + attack 6 コマ(各 502x786 RGBA・md5 12 個全相違)+ シート 2 枚(3012x786)+ `anchor-check.png` = 15 ファイル | ✓ |
| §2-2 `:26665-26666` / `defeatEnemy :17490` / 呼び口 `:27277 :29291 :32320 :34815` / `runEncounter :21562` / `:21834` / `pickAliveEngagedIdx :23219`(`!alive` を飛ばす)/ 勝利判定 `:19634 :19668 :36616 :37632 :37891`(コード 5 + コメント `:11216`)/ `applyGrixAdds :26697-26702` | 一致。`encounterEnemyIndices` を書くのは `:21569`(開始)と `:21987`(終了)だけで剪定しない | ✓ |
| §2-3 HP の書き込み口 `:17341 :23290 :23327 :23562 :27136 :29285 :29813 :34807 :35505` / ハイドラ `:17493-17521` / `RunChronicle.endTurn(__chSnap) :21862` / `tickCordonZones :21797` / `ragePhaseHpRatio :34867` / `CHARIOT_HP_TRIGGER :33941` | 一致 | ✓ |
| §2-3「33 の呼び口」 | `defeatEnemy(` の出現は 33 だが関数定義 1 を含む = **呼び口 32**(コード内コメントの「呼び口 33 箇所」も同じ数え方)| ✓(数え方だけ・先頭割り込みは全部を覆うので害なし) |
| §2-4 `RunChronicle.kill :17524` / `__diagDead :17525` / 蘇生検出 `:40349` / ドロップ `:17538-17542` | 一致。⚠ 撃破音・シェイクの分岐は `def.boss`(`:17532`)、撃破ナレは `def.isBoss`(`:17547`) | ✓ |
| §2-5 `resolve :1973` / `FIELD_THEME_IDS :2150` / `THEMES :39-47` / `:1554` / 街道 `index.html:5555-5575` / 参道 `:5692-5695` | 一致 | ✓ |
| §2-6 `index.html` の口 | `SCENARIO_TEX` は `:3562` 開始(`:3699` は神殿の行)・落ち先 `:3768` / `NODE_EXTRA_SPAWN_KINDS :4305` / `ROOM_PAINTINGS_DEF` は `:5244` 開始(`:6011-6321` は神殿と竜の 2 ブロック)・`node` の門 `:6444` / `SCENARIOS :10904`・`clearGold :39823`・落ち先 `:11115` / `SCENE_BGM :14647`・落ち先 `:14680` / `SCENARIO_NARRATIONS :14733` / `const ALL :3414` | ✓(開始行の違いだけ) |
| §2-6 `buildScenarioRun` の振り分け `:38268-38272` | **6 行 = `:38268-38273`**(竜の行が `:38273`)。縦に揃えない注記は `:38263-38266` に在る | ✓(1 行ずれ) |
| §2-6 `js/df-mapdef.js` | `THEME_DEFAULT_ENEMIES :1879-1889` 一致 / `LINT_PAINTING_ASPECTS` は `:2154` 開始(`:2189-2215` は中の注記と行)| ✓ |
| §2-6 `LINT_PAINTING_ASPECTS`「絵の寸法しだいで要」 | **K5** 29:18 も 26:17 も既存 12 行に無い ⇒ **要**(2 行) | 確定 |
| §2-6 `tavern.html` | `scenarios` は **`:3517-3651`**(起草 `:3513-3646`)/ `ALL_MAIN_SCENARIOS :4257` 一致 / `CLIENT_ART` **`:6318`**(起草 `:6324`)/ `renderTables` **`:6338`**(起草 `:6333`)/ `boardFacts :10630` 一致 / `openBackroom :10863`・`scenarios.slice(3) :10864` 一致 | ✓(数行ずれ・害なし) |
| §2-6 `js/world-map.js` | `NODES :60` / `pass_n :73` = `{ kind: "way", x: 736, y: 96 }` / `SITES :152`(6 件)/ **`UNLOCK :168`**(起草 `:171` は中の行)/ コメント「ちょうど 7 つ」`:42` | ✓ |
| §2-7 在庫 | **K3** `direBear` は `isBoss:true`(`ruinSpider` / `orcArcher` は非ボス) | 崩れ |
| §2-8 `griffon :10743`(192px・`flight`・`attacksPerTurn:2`・`xp:850`)/ `applyPoison :17484` | 一致。**K2** `griffon` は `isBoss:true`(写し元をそのまま写すと isBoss が付く) | ✓ + 注記 |
| §5-2 竜の巣 `:39321-39447` / `p6Node :38678` / マスク `:6245-6265` | 一致(実名 `buildDragonLairRun`)| ✓ |
| §5-3 `setEnemyVfx :16142` / `hydraEmerge :1494-1499` | 一致 | ✓ |
| §2-10 `check_changelog.py:24` | (#81 §12-0 で確認済み・ファイル不変) | ✓ |

**崩れた主張(K1〜K7)。K1 は数値が全部入れ替わるが、仕様(2 ノード・最上階の絵・検算 3 指標)は変わらない = blocked にしない。**

- **K1 ⭐⭐⭐ 最上階の `--fit-around 48` の一次解は偽解。** 床の格子の本当の周期は **縦線 55.8 / 横線 59.2px** で、中心 48 の探索窓(44.16〜51.84)の**外**にある。
  - 根拠 3 本: ① `line_response` の自己相関の山が縦 56/110・横 59/118(46 や 44 に山は無い)② 床の中央を 2 倍に拡大した目視で線の間隔 56〜57 / 59px ③ 床の領域だけで線の位置を拾って直線回帰 = 縦 T 55.881・位相 38.87(残差 ±2.4px)/ 横 T 59.131・位相 0.75(残差 ±1.2px)。
  - 起草の一次解 phase (16.75, 29.95) / period (46.010, 44.390) / cells (33, 22) で焼くと **横線 NG(位相ズレ 31.20 world-px / 許容 2.0)**。縦線の「OK」は石積みを拾った見かけ。
  - `--fit-around 57.5`(56 / 59 でも同じ)= phase (40.15, 0.50) / period (55.775, 59.155) / cells (26, 17)。これでも縦線は **drift 4.26 NG**(横は 0.00 OK)⇒ 竜 n7 と同じく **(位相 x 周期) の 2 次元掃引**(縦: 位相 38.0〜40.5 x 周期 55.750〜56.000、tile 48 / 64 の各 231 点)。OK 領域は斜めの稜線で、上下左右の隣が全部 OK の basin の中心は:
    - **tile 64: phase x = 39.00 / period x = 55.875**(drift 1.52 / 位相 0.75 / score比 85.6〜86.0%)← 床の回帰 (38.87, 55.881) にいちばん近い
    - tile 48: phase x = 38.50 / period x = 55.900(drift 1.98 / 位相 1.00 / 84.8〜84.9%)
    - 横は一次解 (0.50, 59.155) がそのまま basin の中心(tile 48 / 64 とも上下左右 OK)
  - 縦横差は **(59.155 − 55.875) / 57.5 = 5.87%**(起草の 3.6% ではない)= 台帳で廃坑 7.75% に次ぐ 2 番目。マス数は **26 x 17**(起草の 33 x 22 ではない)。
  - 響き: 項目2 の `GRIDS["tower-top"]`・`n1` の rect・出口の唯一解・MASK の行数がこの値で決まる。焼き上がりへ重ねた目視で、赤線(tile 64)が床の描線に乗っていることを確認した(`fit/ov_tr_top_t64.png`)。
- **K2** 指示の例と §2-8 の写し元 `griffon` は **`isBoss:true`**(`ragePhaseHpRatio:0.5` の汎用激怒・`maxSummons:0` 付き)。写し元から `wyvern` を作るとき、`isBoss` を残すか消すかを §5-2 の結論に合わせて決めること。
- **K3** §2-7 の初期案「前庭 = `direBear` ×1」の `direBear` は **`isBoss:true`**(プラザのボス)。道中に置くと激怒・ボス撃破ナレ(`:17547`)・スクロール確定ドロップ(`:13784` `:13806`)・リーダー AI のボス扱い(`isBossLikeDef :32634`)に乗る。非ボスの獣は `ruinSpider`(xp 260)のほか `minotaur` / `stoneGolem` / `shadowBeast`(192px)など(全一覧 = scratchpad の作業記録)。§2-7 は「強さの実測で決める」としているので仕様には響かない。
- **K4** §2-6 の行番号は `tavern.html` で 4〜6 行・`js/world-map.js` の `UNLOCK` で 3 行・`buildScenarioRun` で 1 行ずれていた(上表)。害なし。
- **K5** `LINT_PAINTING_ASPECTS` に 29:18(丘の道)と 26:17(最上階)の 2 行が**要る**(どちらも既存の比率と一致しない)。
- **K6** 名指し以外で「6 本」「6 テーマ」を焼いている本の候補(項目2 が実走で確かめること。⛔ 期待値を緩めず測定点を移す):
  `driver_mapeditor_painting` §1 1a(`c1.themes.length === 6` = `ROOM_PAINTINGS_DEF` のテーマ数・`:519`)/ `verify_quest_draw`(`:451` `sc.length === 6` の鎖・`:516` (1c) の `fx.unlocked.length === 6`)/ `verify_tavern_map`(`:1541` `scenLen === 6`・`:1554`)/ `verify_world_map`(`:1825` `rows.length === 6`)/ `verify_codex_map_skill` (3a)(3b)(台帳の全件を焼き直して `assets/` と突き合わせる = `GRIDS` に足した 2 件の焼き上がりが `assets/` に要る)。
- **K7** `verify_codex_map_skill` は `make_grid_map.py` を読むので今回の母集団に新しく入った。**着手前から素が赤**(16/17・(3a) が `stag-tavern` の検算 NG を拾う = #25 の罠 G/H「板目の床で `--check` が誤報」。SHA は 15 件とも一致)。`--negative` は 21/21 緑。⛔ 緑にしにいかない。

#### (2) 名指し golden の着手前の色(本番の作業ツリー・素 ×2・`--negative` ×1)

| 本 | 素 1 回目 | 素 2 回目 | `--negative` |
|---|---|---|---|
| `verify_quest_visibility` | exit 0 `39/39` | 39/39 | exit 0 変異 `10 / 10`・空振り 0 |
| `verify_quest_walk` | exit 0 `25/25` | 25/25 | exit 0 `46/46` |
| `verify_road_ambush` | exit 0 `41/41` | 41/41 | exit 0 `97/97` |
| `verify_road_boon` | exit 0 `20/20` | 20/20 | exit 0 `48/48` |
| `verify_road_events` | exit 0 `25/25` | 25/25 | exit 0 `43/43` |
| `verify_tavern_map` | exit 0 `47/47` | 47/47 | exit 0 `71/71` |
| `verify_world_heromark` | exit 0 `18/18` | 18/18 | exit 0 `24/24` |
| `verify_world_map` | exit 0 `57/57` | 57/57 | exit 0 `44/44` |
| `verify_world_steps` | exit 0 `33/33` | 33/33 | exit 0 `56/56` |
| `verify_quest_draw` | exit 0 `18/18` | 18/18 | exit 0「10 本すべて担当ラベルが赤・担当外の赤 0」 |
| `verify_npc_crowd` | exit 0 `33/33` | 33/33 | exit 0 `58/58` |
| `driver_graph_p6` | exit 0 `250/250` | 250/250 | (無し) |
| `verify_dragon_fold` | exit 0 `35/35` | 35/35 | exit 0 変異 `9 / 9` |
| `driver_encounter_mopup` | exit 0 `36/36` | 36/36 | (無し) |
| `verify_run_chronicle` | exit 0 `73/73` | 73/73 | exit 0「8 本すべて担当ラベルが赤 (空振り 0)」 |

⇒ 素 30 腕 + `--negative` 13 腕 = 43 腕がすべて緑・素は 2 回とも同数(揺れなし)。所要 101.8 分(直列・`sweep82.py`・`run_named82/named82.tsv`)。`--negative` の 2 回目の色は、OID が同一の木で採られた `post81`(`verify_quest_visibility` / `verify_run_chronicle` / `verify_quest_draw`)にもある(全部 exit 0)。

#### (3) §5-2 ボススロットに `isBoss` でない型を置いたら(使い捨て実験 `probe52/probe_bossslot.js`・port 10561〜10564)

竜の巣の配信をメモリ上で差し替え、`n7` のボススロット `[25, 16, "pharaxus"]` を 4 腕で比べた(本番の `enterNode('n7')` → 玉座の 3 タイル西へ主人公 → 2.5 秒 → 本番の `defeatEnemy` で全滅 → `checkDungeonClear`)。

| 腕 | lint | 盤面 | `bossApproachReachedNow` / ラッチ / `__inBossRoom` | 撃破後 | 語り |
|---|---|---|---|---|---|
| 素(`pharaxus`・isBoss) | e0 / w0 | 3 体 | true / true / **true** | `dungeonCleared` true・`lastResult.cleared` true | `boss_defeat`・`quest_complete` |
| `griffon`(isBoss) | e0 / w0 | 3 体 | true / true / **true** | 同上 | `boss_defeat`・`quest_complete` |
| `griffon` + `isBoss:false` | e0 / w0 | 3 体 | **false / false / false**(最後まで)| 同上 | `quest_complete` だけ |
| `minotaur`(元から非ボス) | e0 / w0 | 3 体 | **false / false / false** | 同上 | `quest_complete` だけ |

- 組み上げ・湧き・戦闘・クリア判定・帰還(`lastResult.cleared`)は**4 腕とも無傷**(エラー 0。`spawnsFromMapDef` はボススロットを型のまま 1 体足すだけで、クリアは `graphBossDefeated()` = 全滅しか見ない)。
- ただし大部屋では「ボス部屋に居る」が**一度も立たない**: `bossApproachReachedNow()`(`:36567`)は `def.isBoss` の個体だけを見るので、ラッチ(`:36587`)も入室の語り `boss_room_enter`(`:19447` の門)も起きず、`__inBossRoom` が false のまま ⇒ `currentBgmId()`(`:14691`)がボス曲(`boss_battle`)へ切り替わらない。(竜の巣は `pharaxus_stage` の通し曲なので BGM 差は出ないが、塔は既存の曲を流用するので差が出る。)ほかに魔法の眼の報告の「ボス」(`:37073`)・リーダー AI のボス重み(`isBossLikeDef`)も立たない。
- **結論 = `wyvern` の変種(isBoss 付き)を 1 つ作る必要あり**(ボススロット用。2 匹目は非ボスの `wyvern`)。⚠ `isBoss` を付けると汎用激怒(`:34866` `def.isBoss && … hp <= maxHp * (ragePhaseHpRatio || 0.5)`)が**飛び去りと同じ HP 50%** で発火する ⇒ 項目2 は「飛び去りが先」になる順序か、変種の `ragePhaseHpRatio` を明示して激怒が先に出ないことを確かめること。`maxSummons: 0` も写すこと(griffon の型)。⛔ 群れの長の仕組みは作らない。

#### (4) 素材の検算(`make_grid_map.py` の一時コピー `fit/mgm_tmp/` に台帳を足して `--name` → `--check`。⛔ 本番の `GRIDS` と `assets/` は触らない)

| 候補 | tile | 縦線 drift / 位相 / score比 | 横線 drift / 位相 / score比 | 判定 |
|---|---|---|---|---|
| 丘の道 phase (50.65, 51.45) / period (51.195, 51.620) / cells (29, 18) | 48 | 0.00 / 1.00 / 100.0% | 1.15 / 1.00 / 99.3% | **OK**(焼き上がり 1392x864・歪み 0.83%。上下左右の隣も OK。⚠ 縦の位相 +0.25 は素材の右端をはみ出す) |
| **最上階 A** phase (39.00, 0.50) / period (55.875, 59.155) / cells (26, 17) | 64 | 1.52 / 0.75 / 86.0% | 0.00 / 0.75 / 100.0% | **OK**(1664x1088・歪み 5.87%) |
| 最上階 B phase (38.50, 0.50) / period (55.900, 59.155) / cells (26, 17) | 48 | 1.98 / 1.00 / 84.9% | 0.00 / 1.00 / 100.0% | OK(1248x816) |
| 最上階 `--fit-around 57.5` の一次解 (40.15, 0.50) / (55.775, 59.155) | 48 | **4.26** / 1.00 / 94.0% | 0.00 / 1.00 / 100.0% | NG |
| 最上階 起草の一次解 (16.75, 29.95) / (46.010, 44.390) / (33, 22) | 48 | 0.00 / 1.00 / 100.0% | 2.55 / **31.20** / 96.5% | NG |

⇒ **最上階は通る = v2 発注は不要**(blocked にしない)。⛔ 閾値は緩めていない。tile は項目2 が決める(A は床の回帰に最も近い・素材 55.9px に対して 1.15x。B は 0.86x)。

#### (5) 母集団の着手前の色(流用 + 差分だけ実走)

- 母集団(`pop82.py` = 3 段の和集合): ① コメントを落としたコードが `index.html` / `tavern.html` / `world-map` / `df-mapdef` / `world.html`(`js/world-map.js` を読み込む)/ `map-editor.html`(`js/df-mapdef.js` を読み込む)/ `make_grid_map` / `codex1_sprites` を読む **157 本** ② 変更区域の語 62 本 ③ 母集団の本を名指しで読む本 148 本 ⇒ union = **`tools/*.js` の全 160 本**。腕 = 素 160 + `--negative` 24 = **184 腕**(`verify_codex_map_skill --negative` を含む)。`auto_debug_run` 1 腕は母集団から外して記録(#80 のユーザー決定)。
- 流用の可否(`reuse82.py`): ① `post81`(#81 項目4・本番 `c918b69`)は `c918b69`→`1a2859b` の差が docs だけ = 配信物と `tools` の OID が同一 ⇒ **74 腕そのまま流用** ② `post80`(#80 項目4・本番 `1a77bd4` = `36f4ba0` と OID 同一)は、`36f4ba0`→`1a2859b` の差が `tavern.html` / `js/tavern-map.js` / `tools/verify_tavern_map.js` / `tools/verify_npc_crowd.js` / `tools/verify_quest_draw.js`(新規)だけ ⇒ コードがこの 5 つのどれも読まない本の腕は流用可 = **104 腕**(`driver_field_verge_gap` は #80 と同じ `--port 18980` の腕)。この 5 つを読む本はすべて `post81` に在る(漏れ 0)。
- 前の走査に腕が無い 4 本 5 腕だけ HEAD で実走(`run_pre82new/`): `_doors_fixture`(exit 0)/ `driver_doors_p1` 44/44 / `sim_plaza_entry`(exit 0)/ `verify_codex_map_skill` **16/17(K7)** / 同 `--negative` 21/21。走査後 `git status` は本書だけ(`fitwrite` 変異が書く `assets/town_phlan.jpg` はバイト同一)。
- 183 腕の色(exit code が主): **緑 162 / 非緑 21**。非緑はすべて分類済み: #80 §12-0 の既知 17(使い方ガード・調査の道具 5 = `probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map` / `probe_n4_stall` / `sweep_recruit_balance`・既知の赤 = `driver_grid_p4` / `driver_grid_p8` / `driver_mapeditor` / `driver_mapeditor_painting` / `driver_monsters_umberhulk` / `driver_sce1_events` / `driver_speech_v2` / `probe_party_size` / `verify_walk_block` / `driver_mapdef_step1` (K25)・揺れ = `driver_field_step6` / `driver_monsters_hobgoblin` / `verify_lore_check --negative`)+ #81 の K12 `driver_monsters_griffon` 14/17・K13 `verify_mage_hand --negative`(素の基準の (3a))+ 今回の K7。
- 置き場: `item1/pre82.tsv`(184 行・出所の列つき)/ 凍結コピー `item1/from80/post80.tsv`・`item1/from81/post81.tsv` / `pop82.json` / `reuse82.json`。
- ⚠ 項目4 は実装後の差分から `--negative` の腕を選び直す。上の 24 腕に無い腕が選ばれたら、その腕だけ `1a2859b` の影のツリーで着手前の色を取る(#81 と同じ)。

#### (6) 項目2 への申し送り

scratchpad `…/82a8d302-9bcb-4710-938b-eb3290afc0e7/scratchpad/notes_item1.md` に原文。要点 = K1 の新しい台帳値(最上階 26x17・tile 64 なら phase (39.00, 0.50) / period (55.875, 59.155))/ K5 の `LINT_PAINTING_ASPECTS` 2 行 / §5-2 の isBoss 変種と激怒の順序 / K6 の言い直し候補 / 行末(本書は純 LF)。

### 12-1. 実装結果(項目2・2026-10-03・基準 HEAD `78dbfe2`)

作業物は scratchpad `…/82a8d302-9bcb-4710-938b-eb3290afc0e7/scratchpad/item2/`(使い捨て検証 `probe_item2.js`・port 10580〜10582 / 走査 `sweep82.py` の写し / マスク `masks.py`)。⚠ 起草窓が並走で `0b9e263`(#84 起草 = `実装依頼書/2026-10-03_mage-hand-reach.md`・`実装依頼書/README.md`・`tools/probe_magehand_reach.js` の 3 本だけ)を積んだ。本項目のコミットはファイル単位で add し、その 3 本は巻き込んでいない。

#### (1) 触った箇所

| ファイル | 中身 |
|---|---|
| `tavern.html` | `scenarios` の末尾に `tower-mother`(`side:true`・`unlockAfter:"orc-fort"`・依頼人 ハロルド / 港の石工 / 人形 `villager`・`recommendedLevel:7`)/ 撤退 `?tower=0`(配列から外す + 同じページの `WORLD_MAP.retireTower()`)/ `mainScenarios()`(side を除いた配列。毎回 `scenarios` から引く)/ `boardFacts()` の本筋・次の未解放を `main` から(`var unlocked = …` の行は 1 バイトも変えていない = `verify_quest_draw` 変異 `lockedpool` のアンカー)/ `renderTables()` の既定と `openBackroom()` を `mainScenarios()` へ / changelog 1 行 |
| `index.html` | `SCENARIO_TEX`(砦の床・壁を流用)/ `NODE_EXTRA_SPAWN_KINDS` `t["tower-mother"] = { n0: ["search","loot"] }`(撤退条件なし)/ `ROOM_PAINTINGS_DEF["tower-mother"]`(`n0big` = `outdoor:true, node:true, sealRing:true` / `n1big` = `node:true, sealRing:true`)/ `ENEMY_TYPES.wyvern` と `wyvernBoss` / `SCENARIOS["tower-mother"]` / `SCENE_BGM` `dungeon_climax` / `SCENARIO_NARRATIONS` 4 段落 / `buildScenarioRun` に 1 行(既存 6 行は揃え直していない)/ `buildTowerMotherRun()` / `defeatEnemy()` 先頭 1 行(致死の口)/ `fleeEnemy()`・`checkFleeEnemies()`・`playEnemyFlyAway()` / 非致死の口 2 つ(`RunChronicle.endTurn(__chSnap)` の直後 = finally の中、`await tickCordonZones()` の直後)/ CSS `@keyframes enemyFlyAway`(`margin-top` / `opacity` / `clip-path` だけ。`transform` は触らない)/ 検証シーム `window.fleeEnemy` / `window.checkFleeEnemies` / `window.buildTowerMotherRun` / `window.__towerMotherTV`(`ENEMY_TYPES.{wyvern,wyvernBoss}` / `fleeLog()`)|
| `js/df-mapdef.js` | `THEMES` に `tower-mother`(⛔ `FIELD_THEME_IDS` には入れていない)/ `THEME_DEFAULT_ENEMIES["tower-mother"]` / `LINT_PAINTING_ASPECTS` に 29×18 と 26×17(K5)|
| `js/world-map.js` | `pass_n` を `kind:"site"`・label「見張りの塔」・desc「北の丘に立つ古い物見の塔」へ(id・座標・EDGES は不変)/ `SITES` と `UNLOCK` に 1 行 / コメント「7 つ」→「8 つ」/ `retireTower()`(撤退の器。`NODES.pass_n` を今日の中継点へ戻し SITES・UNLOCK から外す。`WORLD_MAP` には**行を足しただけ**)|
| `world.html` | `?tower=0` を読んで `WORLD_MAP.retireTower()` を呼ぶ 1 か所だけ(`rnd(` 0 件のまま / `__world` の窓は増やしていない / `removeItem` も増やしていない)|
| `tools/make_grid_map.py` | `GRIDS["tower-road"]` / `GRIDS["tower-top"]`(経緯をコメントへ)|
| `tools/codex1_sprites.json` | `wyvern`(192px セル・`-clean` 派生を glob で walk / attack に分離)|
| `assets/` | `room_tower-mother_n0_map.jpg`(1392x864)/ `room_tower-mother_n1_map.jpg`(1248x816)/ `wyvern_anim.png`(1152x960)|
| codex1 側 | `assets/wyvern/wyvern-walk-attack-right-6-aligned-clean/`(`tools/clean_codex1_frames.py` の派生。specks 517 / bbox の縮み最大 8px / マゼンタ 0)|

#### (2) 選んだ値と根拠

- **焼き付け**: 丘の道 = 項目1 の値どおり tile 48(48/51.195 = 0.94x)。最上階 = **tile 48 の B 解**(phase (38.50, 0.50) / period (55.900, 59.155) / 26×17)。項目1 は「床の回帰に最も近いのは tile 64 の A」と書いたが、台帳の規則は「素材の情報量より大きくしない」(神殿の広間 53px → 48 / 竜 48〜51px → 48 と同じ)で、64 は 1.15x の水増しになるので採らなかった。⛔ 閾値は緩めていない。
- **マスク**: 両方とも外周 1 マス `.`・敵タイル全部 `.`・4 近傍の BFS で孤立 0(丘の道 歩ける 290 マス / 最上階 166 マス、いずれも入口から全部到達)。丘の道は row 8〜9 が col 0→28 まで切れない土の道(塔の扉 = 絵ローカル (28,8) = global (39,13) = 出口 `at`)。柵の裏・廃屋の基礎の中の孤立した草地は塞いだ。最上階は母の小部屋(col 4-10 / row 1-5)と扉のタンス(col 6-8 / row 6)・巣(col 19-24 / row 6-11)を塞ぎ、螺旋階段 col 1-3 → 階段の扉 col 4 → 床。⭐ **col 1 を開けた**のは、sealRing が西辺の中点 (0,8) を外周に残すため(塞ぐとそこへ置かれた仲間が 4 近傍で孤立する)。
- **rect**: n0 `[5, 11, 22, 39]`(18 行 x 29 列で右辺の中点が (39,13) になる唯一解・行数偶数なので midR は絵ローカル row 8)/ n1 `[5, 14, 21, 39]`(17 行・入場 = (14,13)+2 = (16,13) = 絵ローカル (2,8) = 螺旋階段の上)。
- **丘の道の魔物 2 群**(K3 で `direBear` を外した): 西 = `ruinSpider` x3((17,9)(19,10)(17,17))/ 前庭 = `minotaur` x1 (33,11) + `orcArcher` x2 (35,10)(34,16)。入場からの最短 5.66 タイル(> 交戦 400px)/ 2 群の最短 14.04 タイル(> DETECTION_RANGE 12.5)。⚠ 強さは未実測(項目3 ⑤)。
- **ワイバーン**: `griffon` を写し元に HP 80 / AC 15 / 命中 +7 / `2d6+6` x2(毒は +2 の上乗せ)/ `flight` `swoop` / `attacksPerTurn 2` / `fleeAtHpRatio 0.5` / xp 800 / `displaySize 240`・body 比は焼き上がりシートの row2 実測。`wyvernBoss` = 同じ値 + `isBoss` + `ragePhaseHpRatio 0.25` + `maxSummons 0`(ボススロット 1 匹。もう 1 匹は非ボス)。
- **シナリオ**: `clearXp 1000`(砦と同じ)/ `clearGold 300` / `perceptionDC 15` / `trapCount 4` / `hiddenChestCount 3` / `spawns` は `?graph=0` の退避用。
- **スプライト**: `char_ratio 0.80`(griffon の `--match-current` 0.8333 では翼が左へ 2px はみ出す)→ fit left=2 right=184 top=23 / cell=192。`check_alpha_bg_residue.py` = 6 セルとも充填率 0.23〜0.24・疑い 0 件。`check_sprite_doubling.py` = 候補あり(要目視)だが全部 `clusters=2 2nd=16〜24px` = 細い 2nd(尾)。シートを Read で目視し 1 体ずつ。⭐ 本番の床(最上階の石の床)の上でヘッドレスのスクショを Read し、白枠・背景残りなし・左向き反転も正常。

#### (3) 使い捨て検証の観測(`probe_item2.js`)

- 酒場: `cleared` = 砦まで 4 本で `boardFacts` = 本筋 `undead-temple` / 次の未解放 `dragon-lair` / 母集団に `tower-mother` 入り。鍵を消して 10 回引き直し → `tower-mother` が 1 回出た(本筋は毎回神殿)。6 本全部 → 本筋 null。`?tavernmap=0` の 1 枚絵 6 卓 / `?questdraw=0` の奥の間 3 卓(`renderTables(mainScenarios().slice(3))`)。`?tower=0` → `scenarios` 6 件・`SITES` から消え `pass_n` が `way`。`ALL_MAIN_SCENARIOS` は 6 本のまま。
- ワールドマップ: 砦クリア後 `pass_n` = `worldNode-site`・札「見張りの塔 / 北の丘に立つ古い物見の塔」・site 8 / 砦前は `worldNode-way` / `?tower=0` は `way`・site 7。
- 潜行: entry `n0` / `n0:start, n1:boss` / lint e0 w0 / 両ノード `isCustom` / テーマ `tower-mother` / 丘の道は `__outdoorRevealProbe` で 522 タイル(= 29×18)が晴れる / 最上階は 0(霧)/ 罠 4・宝箱 3(n0)/ 敵 6 体とも壁でないタイル・本番 `aStar` で入口→出口 25 手・全敵に到達。BGM `dungeon_climax`。
- 追い払い(手番を差し替えて境界を踏む): 非ボスを 0.55 → 0.45 にした手番の終わりに `alive=false`・`__fled=true`・hp 36(> 0)・その時点の XP +800 / ボスを致死(hp 0 → `defeatEnemy`)→ `__fled=true`・`__diagDead=false`・`ragePhaseEntered=false`。`fleeLog` = `turnEnd` / `lethal` の 2 件。XP 合計 +1600(`gainXP` 呼び出し 800 x2 + クリア 1000)・年代記の撃破 0 のまま・ドロップ 0。2 匹とも居なくなって戦闘終了 → `isNodeSettled` / `graphBossDefeated` true → `lastResult.cleared === true`(`scenarioId: tower-mother`)・語りは `quest_complete` だけ(`boss_defeat` なし)。丘の道の `ruinSpider` を 0.4 にしても `checkFleeEnemies` は 0 件。
- ⭐ 激怒と飛び去りの順序: ボスは HP が半分を切った手番の終わり / ラウンド頭のコードン直後で必ず先に飛び去る ⇒ 自分の手番(激怒の判定点)が来ない。観測では激怒 0 回。`ragePhaseHpRatio 0.25` は二重の守り。

#### (4) 崩れた主張 K8〜

- **K8** ⭐⭐ 配信バイトを正規表現で読むドライバがある(`verify_quest_walk` の `readTavernScenarios` = `id:"…",\s*place:` の並びを要求)。起草の §4-1 のとおり `side` を 2 行目に置くと 7 本目が**見えなくなる** ⇒ `place` を `id` の直後に置き、`side` はその後へ。さらにコメントに `side: true` と書いた行が前の依頼の塊へ混ざって「side が 2 件」に読まれた ⇒ コメントの語を言い換えた。
- **K9** ⭐ `pass_n` が拠点になると道中イベントの停留所から 1 つ抜ける(`ROAD_EVENTS.stops()` は way + 刻み点。mountain 4 → 3・17 → 16 箇所)。依頼書は触れていない副作用。`verify_road_ambush (4c)` は固定表を `?tower=0` の腕へ当て、既定の腕は「その 1 停留所だけが消えた」ことを見る形へ言い直した。
- **K10** 地図の恒等ハッシュを焼いた本が 3 本(`verify_quest_walk (5a)` / `verify_world_steps (1d)` = `876c5f6336f96811`、`verify_road_events (4a)` = `4c0a8a6b3d65cda0`)。⛔ 固定値は書き換えず、**本番の `retireTower()` を呼んだ後の地図**へ当て直し、既定の地図は 2 本目の固定値(`647e71f6b2956389` / `391c6d4c0c6b4857`)で縛った。⚠ `road_events` は `sites` を参照のまま返していたので、同じ evaluate の後段で `retireTower()` を呼ぶと既定側の SITES まで 6 件に化けた ⇒ 写しで持つよう直した。
- **K11** 名指し 15 本の外で `verify_party_four (0a)`(`scenarios.length === 6`)が壊れる ⇒ 本筋 6 + 全体 7 へ言い直し(17/17)。⚠ 項目4 の母集団走査で他にも出うる。
- **K12** `driver_mapeditor_painting`(着手前から赤 = 1d2)の 1a / 1a2 / 3e がテーマ数 6 / 「全テーマが中核 4 キー」を焼いていた ⇒ 1a = 7 テーマ(中核 4 キーを持つのが 6)/ 1a2 = 本筋 6 が中核 4 キー + 塔の母が `n0big` / `n1big` / 3e = optgroup 7。言い直し後 105/106(着手前と同じ 1d2 だけ赤)。
- **K13** `verify_dragon_fold (7b)` が `NODE_EXTRA_SPAWN_KINDS` のキーを 4 シナリオで完全一致させていた ⇒ `tower-mother` を足し、両腕で同じ中身であることも見る形へ。
- **K14** 使い捨て検証で、`tryStartEncounter()` から戦闘開始まで 23 秒前後かかった(ボス部屋の入室の語りの待ち)。ゲームの欠陥ではない。項目3 の受入で戦闘を起こすときは待ち時間を長めに取ること。
- **K15** 最上階の tile は項目1 の推奨(A = 64)ではなく B = 48(上の (2))。

#### (5) 言い直した既存 golden(期待値は緩めず side 1 件 / site 8 つを足した形へ。本数は減らしていない)

| 本 | 言い直した assert |
|---|---|
| `verify_quest_visibility` | (0b) 7 件 = 本筋 6 + side 1 / (0c) 札 8 = SITES+1 = 本筋+side+1 / (3b) 8 / (3d) 8 / (5c) SITES 7 |
| `verify_quest_walk` | (0z) 7 組・side 1 / (2z) 7 対 7・side 1 / (2a) 隠す 6 / (2b) `i+2+side` と「side が 1 段以上出る」/ (2d) 未解放 6・拠点 7 / (3d) 8 / (3e) 8 / (4b) 8 と 7 / (5a) 2 値(上の K10)/ (n1z) 7 組 |
| `verify_road_ambush` | (4c)(K9) |
| `verify_road_events` | (4a)(K10) |
| `verify_tavern_map` | (4b) 期待 = ページの本筋 `.slice(3)` / (6a) 7 = 本筋 6 + side 1・SITES 7 / (6b) 7 / (7b) 本筋と同数 6 |
| `verify_world_heromark` | `EXPECT_SIGNS` 7 → 8(1e の組は 14×8 = 112)|
| `verify_world_map` | (7b-data)(7b-dom)(7d) 8 / (7e) 7 / (7f) 8 |
| `verify_world_steps` | (1d)(K10) / (2d)(5c) 8 |
| `verify_quest_draw` | (0b) 本筋 6 の一本道 + side 1 / `indepFacts` の本筋・次の未解放を本筋から / (1d) 解放 7 |
| `verify_dragon_fold` | (7b)(K13) |
| `driver_mapeditor_painting` | 1a / 1a2 / 3e(K12)|
| `verify_party_four` | (0a)(K11) |

⚠ 全ドライバの文字列リテラル 26,453 個を走査し、着手前 1 か所だった語の件数が変わったものは 0(変異アンカーを壊していない)。⛔ 漏れ検査を持つ `verify_quest_visibility (0b)` には塔の名前・依頼名を 1 文字も書いていない。

#### (6) 名指し golden(本番の作業ツリー・素 ×1 + `--negative` 13 腕)

| 本 | 項目1 素 | 項目2 素 | 項目1 `--negative` | 項目2 `--negative` | 言い直し |
|---|---|---|---|---|---|
| `verify_quest_visibility` | 39/39 | exit 0 39/39 | 変異 10/10 | exit 0 変異 10/10 | 有 |
| `verify_quest_walk` | 25/25 | exit 0 25/25 | 46/46 | exit 0 46/46 | 有 |
| `verify_road_ambush` | 41/41 | exit 0 41/41 | 97/97 | exit 0 97/97 | 有 |
| `verify_road_boon` | 20/20 | exit 0 20/20 | 48/48 | exit 0 48/48 | — |
| `verify_road_events` | 25/25 | exit 0 25/25 | 43/43 | exit 0 43/43 | 有 |
| `verify_tavern_map` | 47/47 | exit 0 47/47 | 71/71 | exit 0 71/71 | 有 |
| `verify_world_heromark` | 18/18 | exit 0 18/18 | 24/24 | exit 0 24/24 | 有 |
| `verify_world_map` | 57/57 | exit 0 57/57 | 44/44 | exit 0 44/44 | 有 |
| `verify_world_steps` | 33/33 | exit 0 33/33 | 56/56 | exit 0 56/56 | 有 |
| `verify_quest_draw` | 18/18 | exit 0 18/18 | 10 本すべて担当が赤 | exit 0 10 本すべて担当が赤・担当外 0 | 有 |
| `verify_npc_crowd` | 33/33 | exit 0 33/33 | 58/58 | exit 0 58/58 | — |
| `driver_graph_p6` | 250/250 | exit 0 250/250 | — | (無し) | — |
| `verify_dragon_fold` | 35/35 | exit 0 35/35 (§ 判定)  | 変異 9/9 | exit 0 変異 9/9 (内部 PASS 324 / FAIL 35 = 項目1 と同数) | 有 |
| `driver_encounter_mopup` | 36/36 | exit 0 36/36 | — | (無し) | — |
| `verify_run_chronicle` | 73/73 | exit 0 73/73 | 8 本すべて担当が赤 | exit 0 8 本すべて担当が赤 (空振り 0) | — |

⇒ 素 15 腕 + `--negative` 13 腕 = 28 腕すべて exit 0・件数は項目1 と同数(言い直した 10 本は assert の本数を変えずに期待値を移した)。所要は走査 1 回(`run_final82/final82.tsv`)。⚠ 1 回目(言い直し前)の赤は quest_visibility 5 / quest_walk 8 / road_ambush 2 / road_events 1 / tavern_map 4 / world_heromark 4 / world_map 5 / world_steps 3 / quest_draw 2 / dragon_fold 1 = 全部が「6 件 / 7 枚 / site 7 / 固定ハッシュ」の焼き込みで、本番の振る舞いの退行は 0。

名指し外で同じ走査に入れた 3 本: `verify_party_four` 17/17(K11 言い直し後)/ `driver_mapeditor_painting` 105/106(着手前から赤の 1d2 だけ = K12)/ `verify_codex_map_skill` 16/17(K7 の `stag-tavern` だけ。台帳 17 件の焼き直しは SHA 全件一致 = 塔 2 枚の焼き上がりも `assets/` と一致)。

#### (7) 副作用

- 道中イベントの停留所が 1 つ減る(K9)。
- `pass_n` が拠点になったので、砦クリア後はそこへ着くと入場の確認が出る(依頼を受けていれば)。未解放のうちは今日どおり中継点の見た目。
- `tower-mother` を卓で受けると `SITES` に在るのでワールドマップ経由で出発する(本筋 6 と同じ導線)。

### 12-2. 受入と強さの実測(項目3・2026-10-03・基準 HEAD `ab2d180`)

⛔ 本番ファイル(`index.html` / `tavern.html` / `js/*` / `world.html` / `audio.js`)は 1 バイトも触っていない(⑤ の結果で値を直さなかった = changelog 不要)。足したのは `tools/verify_tower_mother.js`(LF)と本節だけ。作業物は scratchpad `…/82a8d302-9bcb-4710-938b-eb3290afc0e7/scratchpad/item3/`。

#### (1) 受入 `tools/verify_tower_mother.js`(19 assert・port 素 10538 / 変異 10539〜10547・次の新規 base = **10548**)

| 節 | assert | 観測のしかた |
|---|---|---|
| §0 | (0a) シーム 4 つ / (0b) 2 ノード + n1 に追い払い持ち 2(ボス 1)+ n0 に非追い払いの魔物 ≥1 / (0c) pageerror 0 | index を `currentScenario=tower-mother` で開き `startGame()` |
| §1 | (1a) tavern の `scenarios` ⇔ 同ページの `WORLD_MAP.SITES/UNLOCK/NODES.pass_n` ⇔ `world.html` の `WORLD_MAP`(id 集合・全 id の前提・pass_n が拠点)/ (1b) `ALL_MAIN_SCENARIOS` に無く本筋と同じ並び / (1c) 砦まで 4 本で **42 回**引いて塔の母 ≥1・毎回本筋(独立計算)が卓に在る・本番の本筋も同じ / (1d) 本筋 6 本(+塔の母)で本筋 null / (1e) `?tavernmap=0` は 6 卓・塔の札なし、`?questdraw=0` は扉を押して奥の間 3 卓 = 本筋 4〜6 本目の place | 本筋の並びはページの `scenarios` の side でない並びから取る(写経しない)。固定値は依頼書の名前 `tower-mother` / `pass_n` / `orc-fort` だけ |
| §2 | (2a) n0 / n1 に**実際に貼られた絵**を `make_grid_map.py --check`(tile はページの `TILE_SIZE`)/ (2b) 本番 `aStar` で入口 → 出口の手前(`exits[0].at` − 向き)・階段 → 各ワイバーン、敵タイルが壁でない / (2c) n0 の罠・宝箱 > 0 / (2d) n0 `isCustom`・テーマ `tower-mother`・絵が読み込み済み・`exploredNow ≥ tw×th`(母数は絵の寸法から)・n1 `isCustom` | |
| §3 | (3a) 非ボス 0.55 → 0.45 の手番の後、**次にどの手番関数が呼ばれた時点でも**既に `alive=false`・`__fled`・HP > 0 / (3b) ボスを `hp=0; defeatEnemy()` → `__fled`・`__diagDead` なし・激怒なし / (3c) ワイバーンの名前の `gainXP` がちょうど 2 回 × `def.xp`・XP 増分 = 記録した全呼び出しの和・年代記の撃破不変・ドロップ 5 関数の呼び出し 0・`__diagDead` なし / (3d) 戦闘終了・`isNodeSettled`・`graphBossDefeated`・`lastResult.cleared` / (3e) 大蜘蛛は 0.4 で `checkFleeEnemies` 0 件、0 で普通に撃破(撃破 +1) | 手番 3 関数を裸の識別子で差し替え(割り込み口は本番のまま)。3 手番目以降は「残ったワイバーンを致死の口で片付ける」= (3d) を他の節から切り離す(素では一度も来ない・`fallback 0`) |
| §4 | (4a) `tavern.html?tower=0` に塔の母なし / `world.html?tower=0` で pass_n がデータ `way`・DOM `worldNode-way`・SITES に無い / (4b) (1a)(1c)(4a) の条件を ON/OFF へ当てて ON=[T,T,T] / OFF=[F,F,F] | (4a) の条件 = 「酒場に塔の母が在り、pass_n がデータ・DOM とも拠点」 |

- ⭐ **(1c) の回数**: `drawBoard` は本筋(神殿)を必ず入れ、残り 1 枠を「解放済み 6 − 本筋」= 5 件から一様に引く ⇒ 1 回で塔の母が出る確率 1/5。N 回で 1 度も出ない(= 素の偽赤)確率 0.8^N。**N = 42 で 8.5e-5**(< 1e-4 の最小)。依頼書の「8 回」は 0.8^8 = **16.8%** で素が偽赤になる(**K16**)。OFF 腕は 8 回で 0 回(決定的)。実測は 3/42・8/42・…(素 ×5 で全回 ≥1)。ドライバ起動時に `0.8^N < 1e-4` を自己検査する。
- 所要: 素 **67〜76 秒** / `--negative` **658〜671 秒**(素 1 + 変異 9)。戦闘の開始待ちは K14 どおり実測 23 秒(上限 90 秒)。

#### (2) 負のコントロール(担当は `--mutate` で 1 本ずつ実走して決めた)

| 変異 | 注入 | 依頼書の予想 | 実測の担当(必ず赤) | 確率で赤 |
|---|---|---|---|---|
| `lethalonly` | 非致死の口 2 つ(`turnEnd` / `cordon`)を外す | (3a) | (3a) | — |
| `viadefeat` | 致死の口が本体へ落ちる + 非致死の口が `defeatEnemy` を呼ぶ | (3c) | **(3b)(3c)** | **(3d)** |
| `fieldtheme` | `FIELD_THEME_IDS` に `tower-mother` | (2d) | **(0b)(2a)(2b)(2d)(3a)〜(3e)** | — |
| `nothemes` | `THEMES` の行を外す | (2d) | **同上の 9 節** | — |
| `sidefrontier` | `boardFacts` の本筋を `scenarios` 全件から | (1d) | (1d) | — |
| `inmain` | `ALL_MAIN_SCENARIOS` に足す | (1b) | (1b) | — |
| `sixslots` | `renderTables` の既定を `scenarios` | (1e) | (1e) | — |
| `nokinds` | `NODE_EXTRA_SPAWN_KINDS` の行を外す | (2c) | (2c) | — |
| `fleeall` | 検証シームの直前で `ENEMY_TYPES` 全体に `fleeAtHpRatio 0.5` を実行時付与(`fleeAtHpRatio: 0.5,` は 2 箇所でアンカー不可) | (3e) | **(0b)(3e)** | — |

- アンカーは全部「配信 3 ファイル(`index.html` / `tavern.html` / `js/df-mapdef.js`)合算でちょうど 1 件」を起動時に検算(崩れたら exit 3)。他の `tools/*.js` 全部との重なり 0(罠E)。行数不変。
- **K17** `viadefeat` は (3b) も必ず赤: ボスの致死の口が本体へ落ちると `__diagDead` が立つ(罠 2 の嘘そのもの)。
- **K18** ⭐⭐ `fieldtheme` / `nothemes` は依頼書の想定(「絵が出ない」)より**ずっと重い**: `resolve()` が塔の母のカスタム幾何を**丸ごと捨てて既定の地図(テーマ `goblin-mine`・ノーカスタム)へ落ちる** ⇒ 絵も、ワイバーンも、丘の道の魔物も、経路も消える(観測: `isCustom` false・theme `goblin-mine`・n1 のワイバーン 0 体・n0 は既定の湧きで 9 体・戦闘は入場直後に始まる)。⛔ assert は緩めず、9 節を担当にした。
- **K19** `viadefeat` の (3d) は確率で赤: 本体はドロップ(`maybeDropIronSword` ほか・`Math.random`)を振り、落ちた回は床の宝箱が残って `isNodeSettled()`(`findNearestDrop`)が false。`--negative` 4 回中 3 回が赤・1 回が緑 ⇒ `NEG_MAYBE`。
- `fleeall` の (0b) は「n0 の追い払いを持たない魔物 ≥1」が 0 体になる(全員に付くので)= 当然の赤。

#### (3) 安定性

- 素 ×5(担当表確定後の 3 回 + その前の 2 回): すべて `19/19 PASSED`・exit 0。
- `--negative` ×4: 1 回目 exit 0 / 2 回目 exit 1(K19 の (3d) が担当外に出た)→ `NEG_MAYBE` へ入れた後の 3・4 回目 exit 0「9 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行」。担当(必ず赤)の集合は 4 回とも同一。

#### (4) ⑤ 強さの実測(assert しない・`probe_s5s6_clear.js` の写しを scratchpad `item3/probe_tower_clear.js` に作り tower-mother を足して 1 腕で 10 走行・port 10560)

条件: 酒場から本番の出発(`?recruittalk=0` = 自動抽選で 4 人)・入場 Lv7(XP 21000)・`autoplay=15`・HEAD `ab2d180`(本番の差分 0)。

| 走行 | 結果 | 所要(秒) n0 / n1 / 計 | 追い払い | 終了時 HP(主人公 / 仲間 3) | 編成(主人公 + 仲間) |
|---|---|---|---|---|---|
| 1 | clear | 123 / 34 / 157 | 2 | 53/90 / 78/90・57/57・36/42 | 戦士 + 戦士・僧侶・魔法使い |
| 2 | clear | 112 / 32 / 144 | 2 | 79/90 / 47/58・73/73・42/42 | 戦士 + 盗賊・僧侶・魔法使い |
| 3 | clear | 201 / 34 / 235 | 2 | 37/90 / 68/90・74/74・34/34 | 戦士 + 戦士・エルフ・魔法使い |
| 4 | clear | 85 / 33 / 118 | 2 | 90/90 / 23/58・66/66・42/42 | 戦士 + 盗賊・エルフ・魔法使い |
| 5 | clear | 211 / 31 / 242 | 2 | 72/90 / 90/90・58/58・34/34 | 戦士 + 戦士・盗賊・魔法使い |
| 6 | clear | 222 / 36 / 258 | 2 | 42/90 / 65/65・66/66・34/34 | 戦士 + 僧侶・エルフ・魔法使い |
| 7 | clear | 194 / 35 / 229 | 2 | 79/90 / 74/74・29/42・42/42 | 戦士 + エルフ・魔法使い・魔法使い |
| 8 | clear | 160 / 31 / 191 | 2 | 30/90 / 58/58・4/46・34/34 | 戦士 + エルフ・盗賊・魔法使い |
| 9 | clear | 200 / 38 / 238 | 2 | 52/90 / 42/58・65/65・34/34 | 戦士 + 盗賊・僧侶・魔法使い |
| 10 | clear | 103 / 30 / 133 | 2 | 76/90 / 73/73・58/58・34/34 | 戦士 + 僧侶・エルフ・魔法使い |

- **クリア率 10/10・全滅 0/10・仲間の戦死 0**。所要の平均 = n0 **161 秒** / n1 **33 秒**(入室の語り約 23 秒を含む = ワイバーン戦そのものは 10 秒前後)/ 計 **195 秒**。
- 被害は「ほぼ 0」ではない(主人公の残り HP 30〜90/90・平均 61/90、仲間が 4/46 まで削られた回あり)。ただし削りの大半は丘の道(n0 が所要の 8 割)。
- **判定 = 値は直さない**。依頼書の目安(クリア率 < 30%、または 100% かつ被害ほぼ 0)のどちらにも当たらない。ワイバーン戦が短い(HP の半分 = 40 で飛び去る)ため「怖さ」が足りない可能性はあるが、それは数値の判断ではなく §9 の実機の体感で決める仕様判断として起草窓へ返す(直すなら HP か頭数。`fleeAtHpRatio` は仕様値なので動かさない)。

#### (5) 崩れた主張 K16〜

- **K16** §8 (1c)「8 回引き直して 1 回以上」は素の偽赤 16.8% ⇒ 42 回(上の (1))。
- **K17** `viadefeat` の担当は (3c) だけでなく (3b) も。
- **K18** ⭐⭐ `fieldtheme` / `nothemes` は「絵が出ない」でなく「地図ごと既定へ落ちる」= 9 節が赤。罠 3 の実害は依頼書 §2-5 の記述より大きい(項目4 以降の注意書きに使える)。
- **K19** `viadefeat` の (3d) はドロップの乱数しだいで赤(確率で赤)。
- **K20** `__TAVERN_TV.boardFacts()` の `frontier` は**文字列の id**(オブジェクトでない)。`.id` を付けると `undefined` になり、素で (1c) が赤くなった(ドライバ側の誤りで、直した)。
- **K21** `gainXP` のクリア報酬(1000)は `encounterRunning` がまだ真のうちに入る ⇒ 「戦闘中の XP = 追い払いの XP」では数えられない。ワイバーンの `def.name` で入った呼び出しを数え、XP 増分 = 記録した全呼び出しの和で記録外の経路が無いことを見る形にした。

### 12-3. 項目4 — 母集団の非退行(2026-10-03 14:04〜23:49・本番 = HEAD `b89a5c5`)

成果物は scratchpad `…/82a8d302-9bcb-4710-938b-eb3290afc0e7/scratchpad/item4/`。道具は #81 項目4 のものをコピーして直した(`sweep_82post.py` / `build_arms_82post.py` / `cmp_82.py` / `mkshadow_82.py` / `pair_82.py`)。`fp74.py` と `fisher.py` はバイト同一のコピー。新設 = `anchors82.py`(差分を含む関数の中のアンカーを持つ `--negative` を探す)/ `litcount.py`(全ドライバの文字列リテラルの出現数の前後比較)/ `patch_item4.py`(下の (5) の直し)。
走査と対比較の間は本番を 1 バイトも触っていない(`git status --short` = 0 行・HEAD = `b89a5c5`)。`b89a5c5` は項目3 で、項目2 `ab2d180` からの差は `tools/verify_tower_mother.js` と本書だけ = 配信物は `ab2d180` と同一。直し((5))は走査・対比較がすべて終わった後に入れた。

#### (1) 腕 = 185 腕 + 追加 19 腕 + 直した後の 16 腕

| 枠 | 腕 | 着手前の色 |
|---|---|---|
| 母集団 160 本の素 + `--negative` 24(§12-0 (5)・`auto_debug_run` を除く) | 183 | `item1/pre82.tsv` |
| 新規受入 `verify_tower_mother` 素 / `--negative` | 2 | なし(`1a2859b` には塔の母が無いので赤が正しい ⇒ HEAD で緑であることだけ) |
| 追加の `--negative`(下の (2)) | 14 + 5 | 名指し 9 腕 = §12-0 (2) の項目1 の実走(`item1/run_named82`)/ 新しく選んだ 5 腕 = `1a2859b` の clone(`item4/clone82pre`)で同じ走査器で実走(この 5 腕が「+ 5」) |
| 直した後の再走((5)) | 16 | 同じ走査の色 + `clone82pre` 1 腕 |

- **走らせる場所**: §12-0 (5) の `root` 列のまま。コードが `git` を呼ぶ 31 腕は clone(`item4/clone82` = `b89a5c5` の `git clone`・追跡 922 本中 921 本が本番と**バイト一致**。違う 1 本は起草窓の `tools/probe_magehand_reach.js` = `.gitattributes` は `eol=lf` なのに本番の作業ツリーだけ CRLF。#84 の測定台で母集団の外 = 走らせていない)、残りは本番の作業ツリー。
- ⛔ **`auto_debug_run` は走らせていない**(#80 のユーザー決定)。試遊サーバ 8765 は止めていない・使っていない。

#### (2) `--negative` の選び直し(#75 の教訓 = 差分を含む関数の中のアンカー)

`anchors82.py` = `1a2859b..b89a5c5` の配信物 5 本(`index.html` / `tavern.html` / `world.html` / `js/df-mapdef.js` / `js/world-map.js`)の差分の各行について、それを囲む関数(400 行未満。超えたら前後 3 行)を新旧両側で切り出し、`--negative` を持つ 60 本の文字列リテラル(24 文字以上)がその中に在るかを見た。
母集団の 24 腕に無かった腕のうち、アンカーが変更区域に在ったもの = `verify_dragon_fold` / `verify_fort_fold` / `verify_swamp_fold` / `verify_temple_fold`(`NODE_EXTRA_SPAWN_KINDS` の IIFE)・`verify_quest_walk` / `verify_world_map` / `verify_world_steps`(`js/world-map.js` の `NODES` / `SITES` / `STEPS`)・`verify_world_heromark`(`world.html`)・`probe_s2_clear`(`defeatEnemy` の `enemy.def && enemy.def.isBoss`)。これに項目2 で言い直した本の `--negative`(`verify_road_boon` / `verify_road_events` / `verify_tavern_map` / `verify_npc_crowd` / `verify_party_four`)を足して **14 腕**。区切り線(`────`)や保存キーの一致は除いた。

| 腕 | 着手前(`1a2859b`) | HEAD `b89a5c5` |
|---|---|---|
| `verify_quest_walk` / `verify_road_boon` / `verify_road_events` / `verify_tavern_map` / `verify_world_heromark` / `verify_world_map` / `verify_world_steps` / `verify_npc_crowd` / `verify_dragon_fold` `--negative` | 全部 exit 0(46 / 48 / 43 / 71 / 24 / 44 / 56 / 58 / 変異 9) | 全部 exit 0・同数(§12-1 (6) の項目2 とも同数) |
| `verify_temple_fold --negative` | exit 0(177/22) | exit 0(177/22)・判定行の指紋がバイト一致 |
| `verify_party_four --negative` | exit 0(80/22) | exit 0(80/22)・指紋一致 |
| `verify_fort_fold --negative` | **exit 3**(変異 `addn6` のアンカーが 3 箇所) | exit 3・指紋一致 |
| `verify_swamp_fold --negative` | **exit 3**(変異 `entryn0` のアンカーが 4 箇所) | exit 3・指紋一致 |
| `probe_s2_clear --negative` | **exit 1**(変異 `wipeblind` が赤くならない) | exit 1・同じ型 |

⇒ 14 腕すべて着手前と同じ色。exit≠0 の 3 腕は**着手前から壊れていたアンカー腐敗 / 空振り**(アンカーの出現数は `1a2859b` と `b89a5c5` で同じ 3 / 4)= #82 に帰属しない。→ **K27**

#### (3) 走査と所要

- `sweep_82post.py` は直列・SKIP 再開型。`Start-Process` で切り離して起動した(最初の背景起動は 4 腕目の途中で止めて張り直し、その腕は TSV 未記録なので頭から走った)。腕ごとに `df_*` の居残り Chrome を掃除(全腕で 0)。
- 本走査 185 腕: 14:04:34 → 21:04:22 = **約 420 分**(腕の合計 418.2 分・腕あたり 2.26 分)。打ち切りは `probe_party_size`(素)の 600 秒だけで、着手前と同じ。追加 19 腕(14 + clone82pre 5): 21:04 → 22:14 = **69.9 分**。直した後の 16 腕: **20.1 分**。`driver_mine_wall` の単独再走 1 + 対比較 18 走行: 約 75 分。
- 長かった腕: `verify_bolt_aim` 2,239.5s / `driver_field_step6` 1,907.9s / `probe_p9_tour` 1,888.6s / `verify_mage_hand --negative` 1,880.7s / `verify_run_chronicle --negative` 1,691.4s / `verify_temple_fold --negative` 1,410.5s。

#### (4) 色の遷移(exit code が主・着手前の色がある 183 腕)

| 遷移 | 件数 | 本 |
|---|---|---|
| 緑→緑 | 158 | PASS 数は全部同数(`verify_run_chronicle --negative` の内部 PASS 562 → 560 は変異の赤の数の揺れ = 項目2 の 2 回でも 560 / 562。exit・「8 本すべて担当ラベルが赤」は不変)。⭐ 項目2 で言い直した本は §12-1 (6) の項目2 の値と**全部同数**(`verify_tavern_map` 47 / `verify_quest_walk` 25 / `verify_world_map` 57 / `verify_world_heromark` 18 / `verify_world_steps` 33 / `verify_road_ambush` 41・`--negative` 97 / `verify_road_events` 25 / `verify_quest_visibility` 39・変異 10 / `verify_quest_draw` 18・変異 10 / `verify_dragon_fold` 44 / `verify_party_four` 17。`driver_mapeditor_painting` 105/106 = 着手前から赤の 1d2 だけ・赤→赤に計上) |
| 赤→赤 | 18 | 15 腕は判定行の指紋(経路①②)か PASS/FAIL 数が着手前と同じ型(使い方ガード 4・調査の道具 `probe_n4_stall` / `sweep_recruit_balance` / `probe_party_size`・既知の赤 `driver_grid_p4` / `driver_grid_p8` / `driver_mapdef_step1` / `driver_mapeditor` / `driver_mapeditor_painting` / `driver_sce1_events` / `verify_walk_block` / `verify_codex_map_skill` (K7))/ 揺れの型 2 腕 = `driver_field_step6` 54 → 55/59・`driver_speech_v2` 44 → 45/46 / `driver_monsters_griffon` 14/17(#81 K12)/ **型が変わった 1 腕 = `verify_lore_check --negative`**(着手前は `nomerge` の揺れ、今回は素の基準で (0b)(0d) が赤 = 下の (5) K23 と同じ原因 ⇒ 直した後 12/12) |
| **緑→赤** | **4** | `driver_wallbox` 28 → 22/28 / `verify_lore_check` 26 → 24/26 / `verify_swamp_novice` 34 → 33/34 / `driver_mine_wall` 66 → 64/66。下の (5) |
| 赤→緑 | 3 | `driver_monsters_hobgoblin` 10/14 → 14/14・`driver_monsters_umberhulk` 21/22 → 22/22(既知の揺れ)/ `verify_mage_hand --negative`(#81 K13 の揺れ。今回は 12/12 担当ラベルだけ赤・exit 0) |
| 新規 | 2 | `verify_tower_mother` 素 = exit 0 **19/19**(83.1 秒)/ `--negative` = exit 0「9 本すべて担当ラベルが赤・担当外 0」(722.3 秒) |

#### (5) 緑→赤の切り分けと直し

**#82 に帰属する緑→赤 = 3 本(すべて決定的・構造で帰属)。直して緑へ戻した。**

- **`driver_wallbox`(K22)**: (a) 「比率を持つ大型 def は**ちょうど 12 本**」を 7 つの assert が焼いていた(`wyvern` / `wyvernBoss` = displaySize 240 で 14 本に)⇒ ⛔ 緩めずに `N_LARGE = 12 + 2` を名前つきで足して 14 へ移した。(b) **(2a) が本物の欠陥を捕まえた**: ワイバーンの箱の中心が仕様(シート row2 の alpha > 0 の bbox)より 0.6px 下(実 131.9 / 仕様 131.3・許容 0.5px)。シートの row2 の最上段 y=28 に alpha 1 と 7 の画素が 2 つだけあり、項目2 はそれを閾値で落として T=29 で測っていた(`bodyRatioY 0.797 / bodyOffY 0.151`)⇒ 仕様どおりの値 **`0.802 / 0.146`**(L4 T28 R183 B182)へ直した(`wyvern` / `wyvernBoss` の 2 行)。
- **`verify_lore_check`(K23)⭐⭐⭐**: #76 の規則は「`ENEMY_TYPES` の全キーを技能の表(歴史 / 宗教 / 魔法学)か自然(載せない)へ、脅威度の表(SRD の cr)か『出さない』へ振り分ける」。項目2 はワイバーン 2 キーをどちらの表にも載せていなかった ⇒ 本番では**伝承判定がワイバーンに一度も振られず、正体を知っても脅威度が出ない**(獣と同じ扱い)。SRD `wyvern.md` は `creature_type: Dragon` / `cr: 6.0` ⇒ 規則どおり **`LORE_SKILL_OF` に魔法学(竜)・`LORE_CR` に 6**(ボス変種も同じ元)を足した。ドライバの表にも同じ 2 キーを足し、本数の期待値を 51 → 53 / 40 → 42 / 34 → 36 へ名前つきで移した(⛔ ≥ にしていない)。直した後 (0c) は実効で振った技能が 42 種 = ワイバーンにも魔法学が振られることを 1 種ずつの実走で確認。
- **`verify_swamp_novice`(K24)**: (4b)「他テーマの `ROOM_PAINTINGS_DEF` が着手前 `cdaaf91` と完全一致」に新テーマ `tower-mother` が差分として出た ⇒ #63 / #66 / #67 と同じ例外表へ `'tower-mother': '#82 …'` を 1 行足した((4b2) が「例外が本当に差分を持つ」ことを見るので免罪符にはならない)。⛔ `BASELINE_REV` は進めていない。
- **`driver_mine_wall`(揺れ・K26)**: 赤は (4z)(4z2)「戦車が実際に乱入した」= 廃坑の autoplay のボス戦で戦車が一度も出なかった回(装置の空振り)。廃坑には `fleeAtHpRatio` を持つ敵が居ない ⇒ `checkFleeEnemies` は 0 件で返る同期の関数・`defeatEnemy` 先頭行も素通り = #82 の挙動の差分は経路に無い(構造)。本番で単独再走 ⇒ 66/66。影のツリー `item4/shadow82`(本番の実体コピーから配信物 5 本だけ `1a2859b` へ戻した。`check-attr eol` どおりに CRLF へ変換し、HEAD 側の変換 = 作業ツリーのバイトを確認)と交互の対 3 + 6 組: 本番 **2/9 赤** / 影 **1/9 赤**(影でも同じ (4z))・Fisher **p = 1.000** ⇒ **揺れ**。
- **直しの範囲**: `index.html` 4 行(箱 2 行の値 + 表に 2 行追加)/ `tavern.html` = changelog の既存の #82 行の書き換え(下)/ `tools/driver_wallbox.js` / `tools/verify_lore_check.js` / `tools/verify_swamp_novice.js`。`litcount.py` で全ドライバの文字列リテラル(50,069 個・異なり 27,329)の出現数を直す前後で数え、**変わったもの 0**(他の本の変異アンカーを動かしていない)。行末は `index.html` / `tavern.html` が純 CRLF のまま、ドライバ 3 本が純 LF のまま。
- **changelog**: #82 の行はまだ push されていない(`origin/main` = `0b9e263`)ので、新しい行は足さず既存の行を書き換えた: 「塔の屋上のワイバーン**(竜の一種・魔法学で正体を思い出せる・脅威度 6)**は、傷つくと空へ逃げ去る。」= 今回の直し(伝承判定と脅威度)そのものの説明で、嘘の行ではない。
- **直した後の再走 16 腕**(`ENEMY_TYPES` を全数で回す本 + 伝承 + 塔の母。`git` を読む本は直しを当てた clone `item4/clone82fix` で): `driver_wallbox` **28/28** / `verify_lore_check` **26/26**・`--negative` **12/12**(空振り 0・漏れ 0)/ `verify_tower_mother` **19/19**・`--negative` 9/9(判定行の指紋は本走査とバイト一致)/ `driver_mine_wall` 66/66 / `driver_trap_weaponize` 43/43 / `verify_enemy_name_label` 30/30・`--negative` 58/58 / `verify_enemy_traits` exit 0・`--negative` exit 0 / `verify_swamp_novice` **34/34** / `driver_speech_v2` 45/46・`verify_walk_block` 22/23(どちらも着手前からの赤と同型)/ 母集団外の `verify_swamp_novice --negative` は exit 3(変異 `nostart` のアンカーが 4 箇所)= `clone82pre`(`1a2859b`)でも同じ exit 3・同じ指紋 → K27。

#### (6) 崩れ(K22〜)

- **K22** ⭐⭐ `driver_wallbox` は大型の本数を 12 で焼いていた(7 assert)+ ワイバーンの箱の値は閾値つきの bbox で測られていて仕様(alpha > 0)と 1px ずれていた。⇒ **アセットの比率を def に書くときは、それを測る本と同じ規則で測る**(row2・alpha > 0)。半透明 1〜7 の画素 2 つで値が変わる。
- **K23** ⭐⭐⭐ `ENEMY_TYPES` にキーを足すと、**全敵を表で振り分ける規則**(#76 の伝承判定・脅威度)へも載せる必要がある。依頼書 §2-6「新シナリオを足す口」は敵を足す口を列挙していなかった。項目2 の「全リテラル 26,453 個の出現数が変わっていない」走査は、本数や表の和を焼いた assert を原理的に捕まえない(K11 と同型)。⇒ **敵を足すチケットの口の表に `LORE_SKILL_OF` / `LORE_CR` を入れる**。
- **K24** 「他テーマは固定コミットと完全一致」の型は、畳みだけでなく**テーマの新設**でも腐る(#62 / #66 の教訓の 5 例目)。
- **K25** 名指しの外で壊れた 3 本(`driver_wallbox` / `verify_lore_check` / `verify_swamp_novice`)は、項目2 の名指し 15 本・言い直し 12 本のどれにも入っていなかった = 「6 本 / site 7」の語では引けない(数が「12 体」「51 キー」「3 テーマ」)。⇒ 敵を足すときは `Object.keys(ENEMY_TYPES)` を回す本(9 本)を名指しへ入れる。
- **K26** `driver_mine_wall` (4z)「戦車が実際に乱入した」は揺れ(本番 2/9・`1a2859b` の影 1/9・p = 1.000)。既知フレークの一覧へ足す。
- **K27** 着手前から壊れていた `--negative` が 4 本ある(`verify_fort_fold` = `addn6` 3 箇所 / `verify_swamp_fold` = `entryn0` 4 箇所 / `verify_swamp_novice` = `nostart` 4 箇所 / `probe_s2_clear` = `wipeblind` が赤くならない)。どれも `1a2859b` と `b89a5c5` で同じ指紋 = #82 の外。母集団の `--negative` 24 腕に入っていなかったので、これまでの走査では見えていなかった。直すなら別チケット(アンカーを 1 箇所に絞る)。

#### (7) 逸脱(D1〜)

- **D1** 本番(`index.html` / `tavern.html`)を直した。指示の「本番の直しが要る場合」に当たる(K22 の箱の値 / K23 の伝承の表)。changelog は既存の未 push の #82 行の書き換えで足した(行は増やしていない)。
- **D2** 指示の 185 腕に、変更区域にアンカーを持つ / 言い直した本の `--negative` 14 腕を足した((2))。うち 5 腕は `1a2859b` の clone で着手前の色を取った。
- **D3** 直した後に 16 腕を再走した((5))。`git` を読む本は直しを当てた使い捨ての clone(`clone82fix`・ローカルコミット)で走らせた。
- **D4** 母集団外の `verify_swamp_novice --negative` を直した後の確認に入れた(素が直しの対象だったため)。結果は K27。

#### (8) まとめ

- 185 腕(母集団 160 本 183 腕 + 新規受入 2)を直列で走査(約 420 分)し、緑→緑 158 / 赤→赤 18 / 緑→赤 4 / 赤→緑 3 / 新規 2。
- 緑→赤 4 本のうち **#82 に帰属するのは 3 本**(`driver_wallbox` / `verify_lore_check` / `verify_swamp_novice`・すべて決定的)。2 本は本番の取りこぼし(ワイバーンの箱の値 1px / 伝承判定と脅威度の表に未登録)で、本番とドライバを直して**直した後は全部緑**。1 本は golden の例外表。残り 1 本 `driver_mine_wall` は影との対で p = 1.000 の揺れ。⇒ **直した後の #82 帰属の緑→赤 = 0**。
- 追加の `--negative` 14 腕はすべて着手前と同じ色。exit≠0 の 3 腕(+ 確認で見つけた 1 腕)は着手前からのアンカー腐敗(K27)。
- 新規受入 `verify_tower_mother` は素 19/19・`--negative` 9/9(直す前も直した後も)。`auto_debug_run` は着手前・実装後とも未走査(ユーザー決定)。

### 12. 総括

- **commit**: `78dbfe2`(項目1 着手前の実測 = 基準 HEAD `1a2859b`・崩れ K1〜K7・名指し golden 15 本 ×2 + `--negative` 13 腕・§5-2 の isBoss 変種・最上階の偽解・母集団 160 本 184 腕の色)/ `ab2d180`(項目2 本番 = `tower-mother`〔`side:true`・砦の後〕・卓上マップ 2 枚 tile 48・`wyvern` / `wyvernBoss` と `fleeEnemy`〔致死の口 1 + 非致死の口 2〕・`pass_n` を拠点「見張りの塔」へ・撤退 `?tower=0` + 既存 golden 12 本の言い直し + changelog)/ `b89a5c5`(項目3 受入 `tools/verify_tower_mother.js` 19 assert・変異 9 + ⑤ 強さの実測)/ 本節を書いたコミット(項目4 母集団の非退行 + 直し 3 本 + 総括 + 台帳)。
- **受入**: `tools/verify_tower_mother.js` 素 **19/19**・`--negative` **9/9**(必ず赤 ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤)。名指し golden は着手前と同色(言い直した 12 本は本数を変えずに期待値を移した)。母集団 185 腕 + 追加 14 腕で、直した後の **#82 に帰属する緑→赤 0**。
- **崩れた主張は通算 27 件**(項目1 K1〜K7 / 項目2 K8〜K15 / 項目3 K16〜K21 / 項目4 K22〜K27)。仕様に響いたもの: K1(最上階の格子は偽解だった)/ K3(`direBear` は isBoss = 丘の道に置けない)/ §5-2(ボススロットに isBoss の無い型を置くとボス部屋の演出が立たない ⇒ `wyvernBoss`)/ K9(道中の停留所が 17 → 16)/ K18(テーマを外すと地図ごと既定へ落ちる)/ K23(ワイバーンが伝承判定の表に無かった)。**本番の不具合は 2 件で、どちらも項目4 で直した**(K22 箱の値 1px / K23 伝承判定と脅威度)。
- **逸脱は 4 件**(D1〜D4)。どれも直すか検査を足す方向(緩めた・削ったものは 0)。
- **残り**: §9 の実機確認(ユーザー担当)。⭐ ワイバーン戦は約 10 秒と短い(HP の半分 = 40 で飛び去る)⇒「怖いが勝てる」の「怖さ」は実機で判断(直すなら HP か頭数。`fleeAtHpRatio` は仕様値)/ 飛び去る瞬間が「追い払った」と読めるか / 見張りの塔の札が縦画面で押せるか / 母の小部屋の前振り / K9 で道中イベントの停留所が 17 → 16 に減った手応え / 魔法学で正体を思い出したワイバーンの名前札に「CR6」が出るか。`auto_debug_run` は未走査のまま(8765 と衝突)。作業用コピー(`item4/clone82` / `clone82pre` / `clone82fix` / `shadow82`)の削除はユーザー判断。
- **次の新規ドライバ base = 10548**(`verify_tower_mother` が 10538〜10547 を使う)。
