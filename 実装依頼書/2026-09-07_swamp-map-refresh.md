# #58 沼地から旧グラを追放する — n6 に flooded-crypt / n7 に族長の巣の卓上マップ

- **起草**: 2026-09-07(計画窓) / **ステータス**: **承認済**(2026-09-07 ユーザー承認)
- **会議**: `dev-meetings/2026-09-07_swamp-map-refresh.md`(第1段の合意 + 第2段の決裁 + 実測 T1〜T7)
- **モックアップ**: https://claude.ai/code/artifact/866a59ed-075e-4abd-824e-a192d76ee252
- **codex 発注**: `codex1/requests/2026-09-07_chieftain-lair-map.md` — ⭐ **納品済**
  (`codex1/assets/maps/chieftain-lair-v1.png` / 1536x1024 / ユーザー承認のうえ採用)
- **触るファイル**: `tools/make_grid_map.py`(GRIDS 2 件追加) / `assets/`(焼き上がり 2 枚) /
  `index.html` / `tools/verify_swamp_lair.js`(新規)

---

## ⛔⛔⛔ 着手条件 — `index.html` は隣窓が #57 を実装中

**2026-09-07 実測**: `git status` = `M index.html` / `M tavern.html` / `?? tools/verify_hold_person.js`
⇒ **隣窓が #57 を実装中**。

| STEP | 着手できるか |
|---|---|
| **STEP1**(焼き込み) | ⭐ **今すぐ着手できる**。触るのは `tools/make_grid_map.py` と `assets/` だけ |
| **STEP2 以降**(定義の差し替え) | ⛔ **#57 の着地待ち**。`ROOM_PAINTINGS_DEF` も `buildLizardSwampRun` も `index.html` |

- ⛔ **`tavern.html` は本チケットで一度も開かない。**
- ⛔ `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- ⚠⚠ ファイル単位 add でも「相手が同じファイルを add する」事故は防げない。
  **`index.html` に触る前に `git log --oneline -1` で #57 の着地を確かめること。**
- ⚠ **作業ツリーを `grep -rn` してはいけない。** 測るときは `git show HEAD:index.html > /tmp/idx.html`。

---

## 1. 目的

沼地の 8 ノードのうち、**卓上マップは n4「蛇神の参道」の 1 つだけ**(#53)。
残りは旧世代のまま。ユーザーの指示は「**MAP は、旧グラは一切使わない方向で**」。

**⭐ 実測すると、生きている旧グラは 1 枚しかなかった**(§2-2)。
`buildP6Run` が n7 に旧 6x6 の床絵を自動で貼っている、その 1 箇所だけ。

**ユーザー決定(2026-09-07)**:

- ⭐ **A = n6「蛇神の祭壇」に `flooded-crypt`(発注ゼロ)** / **B = n7「族長の巣」に新規発注のマップ**
  ⇒ 沼の山場 3 つ(n4 参道 / n6 祭壇 / n7 巣)が全部 codex 卓上マップになり、
  **live 経路から旧グラが消える**
- ⭐ 不採用 = 「山場 `1` とボス部屋 `2` の絵を刷新」(**分岐マップでは表示されない**。§2-2)
- ⭐ 不採用 = 「8 ノード全部の大部屋化」(630 タイルの盤面が並ぶと潜行が倍以上に伸びる)
- ⭐ 不採用 = 「n1/n2/n3 の統合」(並列の分岐なので「選んだ意味」が絵から消える)
- ⭐ 不採用 = `ancient-ruin-dungeon-player.png` を沼へ(乾いた遺跡 = Sce4/5 へ取っておく)
- ⭐ **n7 の玉座が「額縁」に見える件は、承認のうえ採用**
  (ボススプライトが上に立って覆うので実害小。§2-6)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ **すべて `git show HEAD:index.html` から測った**(隣窓が作業ツリーを編集中のため)。
⚠ 行番号は `b1143ac` 時点。**識別子で引くこと**。

### 2-1. 参照先

| 引く識別子 | ファイル | 何 | 参考行 |
|---|---|---|---|
| `const ROOM_PAINTINGS_DEF = {` | index.html | 絵の在庫 | 4979 |
| `"lizard-swamp": {` (ROOM_PAINTINGS 内) | index.html | 沼の在庫。`n4big` が手本 | 5355 |
| `n4big: { src: "assets/room_lizard-swamp_n4_map.jpg",` | index.html | ⭐ **#53 の完成形。写経元** | 5419 |
| `n7big: { src: "assets/room_bandits-forest_n7_map.jpg",` | index.html | ⭐ **ボスノードを大部屋化した唯一の前例** | 5237 |
| `function buildP6Run` | index.html | ⚠ `paint` の既定を決める 1 行がここ | 36376 |
| `function buildLizardSwampRun` | index.html | 沼の 8 ノード | 36515 |
| `rect: [1, 10, 26, 61], paint: "n7big", density: 0,` | index.html | ⭐ 森ボスの実物 | 36473 |
| `rect: [3, 10, 23, 39], paint: "n4big", density: 0,` | index.html | ⭐ 沼 n4 の実物 | 36540 |
| `const SCENARIO_NODE_EXTRAS = {` | index.html | ⚠⚠⚠ **ハイドラの座標**(§2-5) | 10613 |
| `const MAP_W = 72;` / `const MAP_H = 28;` | index.html | 盤面の上限 | 3361 |
| `const NODE_ENTRY_INSET = 2;` | index.html | 入場の踏み込み | 35336 |
| `const P6_UP = [36, 11], P6_DOWN = [36, 16], P6_RIGHT = [39, 13];` | index.html | 既定のゲート | 36388 |
| `"swamp-approach": {` | tools/make_grid_map.py | ⭐ GRIDS の書き方の手本 | 174 |

**再測定コマンド**:

    git show HEAD:index.html > /tmp/idx.html && grep -n '<識別子>' /tmp/idx.html

### 2-2. ⭐⭐⭐ 生きている旧グラは n7 の 1 枚だけ(候補④が無効だった理由)

**第1段の決裁は「山場 `1` とボス部屋 `2` の絵を刷新」だったが、実測で無効と判明した。**

| # | 測ったこと | 結果 |
|---|---|---|
| T1 | `paint: "..."` の全出現 | **7 箇所**。すべてノードキー。**数字キー `1`/`2` を呼ぶ箇所は 0 件** |
| T2 | 数字キーを貼るのは誰か | `loadRoomPaintings` の**従来経路のみ** = `const defs = MAPDEF.isCustom ? null : ROOM_PAINTINGS_DEF[_scenIdForTex];` |
| T3 | 従来経路が通る条件 | `MAPDEF.isCustom === false` = **`?graph=0`(単一マップ)と生成クエストだけ** |
| T4 | 設計の明文(`index.html:35973`) | 「**★P7: 1 枚絵は n4(山場)と n7(ボス)の 2 つだけ貼る。旧単一マップ用の在庫(20x16 / 22x18)は縦横比が違うので載らない**」 |
| **T5** | ⭐⭐⭐ **旧グラの正体** | `buildP6Run` の 1 行 — `const paint = d.paint != null ? d.paint : ((id === "n4" \|\| id === "n7") ? id : null);` |

⇒ **n4 は #53 が `paint:"n4big"` で上書き済。n7 は指定が無いので旧 6x6 の床絵
(`room_lizard-swamp_n7.jpg` / tileBounds `[11,32,16,40]`)を自動で貼る。これが唯一の生きた旧グラ。**

⛔ **`1` / `2` を差し替えてはいけない。** 触ると「プレイヤーに見える変化が 1 つも無いのに
`index.html` を触る」= CLAUDE.md が名指しで禁じる型になり、**changelog に書ける要約が実在しない**。

### 2-3. 沼のノード接続(実測)

    n0 (start) ─┬─→ n1 (combat) ─┬─→ n4 (combat) ─→ n7 (boss)
                │                 └─→ n5 (rest)
                ├─→ n2 (search) ──→ n6 (event)
                └─→ n3 (loot)

⭐ **ボスへの道は n0→n1→n4→n7 の一本。** n6 は行き止まりの側枝
⇒ **A(n6)は「寄り道の報酬」で、全員が見る場所ではない**。発注ゼロなので損はしない。

### 2-4. 焼き込み格子の実測(2 枚とも測り済み)

| 素材 | 実測 | 異方性 | 判定 |
|---|---|---|---|
| `codex1/maps/flooded-crypt-player.png` | cells **(34, 22)** / phase **(21.95, 7.15)** / period **(44.170, 44.290)** | **0.271%** | ⭐ 台帳で 2 番目に良い |
| `codex1/assets/maps/chieftain-lair-v1.png` | cells **(29, 20)** / phase **(21.10, 5.20)** / period **(51.175, 49.895)** | **2.53%** | ⚠ 台帳で 2 番目に悪い(⭐ 出荷済みの廃坑 7.75% より良い) |

⭐ **どちらも `MAP_W=72 / MAP_H=28` の内側**(34<72, 22<28 / 29<72, 20<28)。
⭐ 後者は **3 つの探索中心(48 / 51 / 53)で同じ値が再現**した = 測定誤差ではない。

**再測定コマンド**:

    py tools/make_grid_map.py --fit "C:/Users/PC_User/Desktop/codex1/maps/flooded-crypt-player.png" --fit-around 48
    py tools/make_grid_map.py --fit "C:/Users/PC_User/Desktop/codex1/assets/maps/chieftain-lair-v1.png" --fit-around 48

⛔ **検算の 3 指標(ドリフト 4.0 / 位相 2.0 / score 70%)を緩めない。**
NG なら素材ではなく**台帳の 6 数値を疑い、`--fit` で測り直す**。

### 2-5. ⚠⚠⚠ 最大の罠 — n6 を大部屋化するとハイドラが別の場所に湧く

    "lizard-swamp": {
      // 封印中のハイドラ (inactive + passiveNpc)。部屋の中心 = 祭壇
      n6: { spawns: [["hydra", 36, 13, "s3_hydra_intel"]] },
    },

**(36, 13) は 7x6 の小部屋の中心**。大部屋化するとこの global 座標は**絵の別の場所**を指す。

⭐ **同じ罠を森が既に踏んで記録している**(`SCENARIO_NODE_EXTRAS` の冒頭コメント):

> 旧 (36,13) は 7x6 の小部屋の中心だが、52x26 の大部屋では**絵ローカル (26,12) =
> 北東の岩場の内側**にあたる (依頼書 #11 が「起点の床保証がここに無言で穴を開ける」と
> 名指ししたまさにそのタイル)。⚠ 座標も一緒に移すこと

⇒ ⛔ **`rect` を入れたら `SCENARIO_NODE_EXTRAS["lizard-swamp"].n6` の座標も必ず移す。**
**移し先 = 絵の右手の「水に囲まれた八角形の祭壇」の中心**(封印された守護神の座として設計した場所)。
⚠ **第 4 要素の噂フラグ `s3_hydra_intel` は 1 文字も変えない**(掴んでいなければ 0 体が正常)。

### 2-6. n7 の既存の敵配置(全部移設が要る)

    n7: { name: "族長の巣",
          slots: [[39, 12, "lizardWarrior"], [39, 15, "lizardPriest"]],
          boss: [40, 13, "lizardChieftain"] },

⚠ **`P6_RIGHT = [39, 13]`** = n4 から n7 への出口ゲート。**既存 slots はその真上と真下**。
大部屋にすると全部意味が変わるので、**3 体とも絵の上へ置き直す**。

⭐ 置き先の設計(発注文で確保させた場所):
- **ボス** = 東の壇の上(玉座の位置)
- **護衛 2 体** = 壇の手前の開けた床、互いに 2〜4 マス離す

### 2-7. ⭐ 写経元 — ボスノードの大部屋化は森が唯一の前例

    : { name: "盗賊団のアジト",
        rect: [1, 10, 26, 61], paint: "n7big", density: 0,
        start: { tx: 12, ty: 15 },
        slots: [...], boss: [57, 12, "scar"] },

**必ず守る 5 つ**(森 n7big と 沼 n4big が両方明記している):

1. ⚠⚠⚠ **`density: 0`**。既定 1 のままだと**既に描き込まれた絵の上へ scenery が湧く**
2. ⚠⚠⚠ **`start` を入場地点へ寄せる**。`buildNode` は「起点の床保証」で起点タイルを
   **問答無用に床へ彫る**ので、既定 `(36,13)` のままだと**blocked マスクに無言で穴が開く**
3. ⚠⚠⚠ **`node: true` が必須**(#52 の実測 —「無いと従来経路が別シナリオへ貼る」)
4. ⚠ **`rect` は `tileBounds` と同値**(`paintingAspectFits` が縦横比の**完全一致**を要求)
5. ⚠ 敵スポーンは `applyPaintingBlocking` の門番を通る = **マスクで塞いだタイルに敵を置くと
   絵の中に穴が開く**。座標は必ずマスクで `.` のマスにする

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`
⇒ **鳴る**(STEP2 以降で `index.html` を触る)。**プレイヤー向けの要約は実在する**:

    <li><b>沼地の祭壇と族長の巣が新しい地図になった</b> — 水没した聖堂と、沼に沈んだ大広間。どちらも卓上の地図をそのまま歩ける。</li>

⚠ **STEP1 だけのコミットでは鳴らない**(`tools/` と `assets/` のみ)。

### 2-9. 母集団(既存 golden)

⚠ **着手前に必ず素で回して基準を採ること**(下表は起草時点の見込みで、実測ではない)。

| ドライバ | なぜ母集団か |
|---|---|
| `verify_swamp_novice` | ⭐⭐⭐ **#53 の受入。n4big と沼グラフの当事者。最優先** |
| `driver_graph_p6` / `driver_graph_p7` | 分岐グラフの幾何。`(2c-lizard-swamp)` が居る |
| `driver_paint_blocked` | ⭐ 絵と blocked マスクの整合。⚠ `--stage lizard-swamp` を明示 |
| `driver_mapdef_step1` | mapCanvas の SHA。絵の追加で動く可能性 |
| `driver_grid_s2` | 卓上グリッド |
| `verify_codex_map_skill` | ⭐ `--fit` が既存台帳を復元するかを測る = GRIDS を触るので必ず |

⚠ **同じポートを使うドライバが混ざる**(#55 の実測)⇒ **必ず直列**。
⚠ `driver_paint_blocked --stage bandits-forest` は **#52 の時点で着手前から赤 3 本**
(`n7big` と `/\/n\d+$/` の既存齟齬。#53 が `/\/n\d+[a-z]*$/` へ広げた)。
**着手前の色を必ず採ってから比べること。**

---

## 3. 変更範囲

| ファイル | 変更 | #57 待ちか |
|---|---|---|
| `tools/make_grid_map.py` | `GRIDS` に `swamp-crypt` と `chieftain-lair` の 2 件を追加 | ⭐ **不要** |
| `assets/room_lizard-swamp_n6_map.jpg` / `_n7_map.jpg` | 焼き上がり 2 枚(新規) | ⭐ **不要** |
| `index.html` | `ROOM_PAINTINGS_DEF` に `n6big` / `n7big` / `buildLizardSwampRun` の n6・n7 / `SCENARIO_NODE_EXTRAS` のハイドラ座標 / 撤退スイッチ / changelog | ⛔ **待つ** |
| `tools/verify_swamp_lair.js` | 新規(受入ドライバ) | ⭐ 不要(ただし assert は index.html 着地後でないと緑にならない) |

⛔ **`tavern.html` は開かない。**
⛔ **`js/df-mapdef.js` は触らない**(`resolve()` の規則は #52 / #53 の領分)。
⛔ **既存の `n4` / `n4big` / `n7`(旧 6x6)のエントリを消さない** — 撤退スイッチの行き先として生かす。

---

## 4. STEP1 — 2 枚を焼く(⭐ #57 と並行できる)

### 4-1. `GRIDS` へ追加(`tools/make_grid_map.py` の `"swamp-approach"` の隣)

    "swamp-crypt": {
        "src": "flooded-crypt-player.png",       # ⚠ 探索先は §4-1 の注記で確かめる
        "out": "room_lizard-swamp_n6_map",       # ★貼り先 = 沼グラフの n6「蛇神の祭壇」(#58)
        "desc": "蛇神の祭壇 (石造 3 部屋 + 右手に水に囲まれた八角形の祭壇 + 南の階段)",
        "phase": (21.95, 7.15),
        "period": (44.170, 44.290),
        "cells": (34, 22),
        "tile": 48,               # ⛔ 64 にしない
        # 異方性 (44.290-44.170)/44.23 = 0.271% = 台帳で 2 番目に良い
    },
    "chieftain-lair": {
        "src": "chieftain-lair-v1.png",
        "out": "room_lizard-swamp_n7_map",       # ★貼り先 = 沼グラフの n7「族長の巣」(#58)
        "desc": "族長の巣 (沼に沈んだ石造神殿の大広間 + 東西に貫く乾いた石畳 + 東の玉座の壇)",
        "phase": (21.10, 5.20),
        "period": (51.175, 49.895),
        "cells": (29, 20),
        "tile": 48,
        # 異方性 (51.175-49.895)/50.535 = 2.53% = 台帳で 2 番目に悪いが
        #   出荷済みの廃坑 7.75% より良い (ユーザー承認済 2026-09-07)
    },

⚠ **`src` の探索先が `codex1/maps/` か `codex1/assets/maps/` かを着手時に確かめる**
(既存 7 件がどちらを指しているかを読む。⛔ 憶測でパスを書かない)。
⚠ `flooded-crypt-player.png` は **`codex1/maps/`**、`chieftain-lair-v1.png` は
**`codex1/assets/maps/`** に在る(2026-09-07 実測)。**置き場が違うことに注意**。

### 4-2. 焼いて検算

    py tools/make_grid_map.py --name swamp-crypt
    py tools/make_grid_map.py --name chieftain-lair
    py tools/make_grid_map.py --check assets/room_lizard-swamp_n6_map.jpg --tile 48
    py tools/make_grid_map.py --check assets/room_lizard-swamp_n7_map.jpg --tile 48

⛔ **3 指標を緩めない。** NG なら `--fit` で台帳の数値を測り直す。

### 4-3. ⭐ この STEP だけで一度コミットしてよい

`tools/` と `assets/` のみ = **changelog フックは鳴らない**・**#57 と衝突しない**。

---

## 5. STEP2 — n6「蛇神の祭壇」に貼る(⛔ #57 の着地後)

1. `ROOM_PAINTINGS_DEF["lizard-swamp"]` に **`n6big`** を追加(`n4big` を写経元にする)
   - `src: "assets/room_lizard-swamp_n6_map.jpg"` / **`node: true`** / `sealRing: true`
   - ⛔ **`outdoor: true` は付けない**(n4 の参道と違い、こちらは**屋根のある地下聖堂**)
   - `tileBounds` は **22 行 x 34 列**。⚠ **行が先**
   - ⚠ 入場は n2 から。**左辺の中点 + `NODE_ENTRY_INSET`(2)** が入場地点になる
2. `buildLizardSwampRun` の `n6: { name: "蛇神の祭壇" }` を
   `{ name: "蛇神の祭壇", rect: <tileBounds と同値>, paint: "n6big", density: 0, start: {...} }` へ
3. ⚠⚠⚠ **`SCENARIO_NODE_EXTRAS["lizard-swamp"].n6` のハイドラ座標を移す**(§2-5)
   - 移し先 = **右手の八角形の祭壇の中心**
   - ⚠ **第 4 要素 `s3_hydra_intel` は 1 文字も変えない**
4. **blocked マスク**(22 行 x 34 列)を書く。作法は `n4big` の 5 規則に**当て直す**
   (⛔ 写経しない。絵が違う):
   - (1) 外周に `#` を書かない(`sealRing` が別に塞ぐ)
   - (2) 平置きの物は塞がない / 立っている物は塞ぐ
   - (3) **水は塞ぐ**。⚠ ただし祭壇を囲む水に渡りがあるかを絵で確かめる
   - (4) **入場口から祭壇までのレーンを明示的に空ける**
   - (5) 敵を置くタイルは必ず `.`
5. **撤退スイッチ `?swampcrypt=0`** — 従来(絵なし・タイル描画)へ戻る

---

## 6. STEP3 — n7「族長の巣」に貼る(⛔ #57 の着地後)

STEP2 と同型。差分だけ:

1. `ROOM_PAINTINGS_DEF["lizard-swamp"]` に **`n7big`**
   - `tileBounds` は **20 行 x 29 列**
   - ⛔ **`outdoor` は付けない**(屋根のある大広間。⚠ 絵に天井の抜けがあれば要検討)
2. `buildLizardSwampRun` の `n7` に `rect` / `paint: "n7big"` / `density: 0` / `start`
3. ⚠ **`slots` 2 体と `boss` を絵の上へ置き直す**(§2-6)
   - **ボス** = 東の壇の上(玉座) / **護衛 2 体** = 壇の手前の開けた床、2〜4 マス離す
   - ⚠ **全タイルを本番の `isTileWall` で確認**する
     (`node tools/probe_bandit_map.js --places --scen lizard-swamp --node n7` が #53 で流用実績あり)
4. ⚠⚠ **入場地点から護衛までの距離を測る。** #53 は「入場から 8 タイル(768px)離す = 交戦距離
   melee 400px より遠いので**入場ナレの最中に乱戦が始まらない**」を守っている
5. **撤退スイッチ `?swamplair=0`** — 従来(旧 6x6 の床絵)へ戻る
   ⭐ **これが「旧グラへ戻る唯一の口」**なので、旧エントリ `n7` を消さないこと

---

## 7. STEP4 — 受入ドライバ + 非退行

`tools/verify_swamp_lair.js`(新規)。**base ポートは 10121**
(⚠ 10080 は Chrome が `ERR_UNSAFE_PORT`。#56 の実測。#57 が 10101 を予約している想定なので離す)。

---

## 8. 撤退スイッチ(⭐ 2 本に分ける)

| スイッチ | 何が戻るか | 判定位置 |
|---|---|---|
| **`?swampcrypt=0`** | n6 が絵なし(タイル描画)へ。ハイドラ座標も旧 `(36,13)` へ | `index.html`。遷移をまたがない |
| **`?swamplair=0`** | n7 が**旧 6x6 の床絵**へ = 旧グラへ戻る | 同上 |

⚠ **2 本に分ける理由** = A(発注ゼロ)と B(納品物)は独立で、片方だけ戻せる必要がある。
⚠⚠ **ハイドラ座標はスイッチと連動させる**(`?swampcrypt=0` で `rect` だけ戻して座標を戻し忘れると、
**小部屋の中心に居るはずのハイドラが消える**)。

---

## 9. 受入条件 — `tools/verify_swamp_lair.js`(新規・base 10121)

### §0 装置(先に母集団を確かめる)

- **(0a)** n6 と n7 の**両方**で `paintedTileMask` が 0 枚でない
  ⭐⭐⭐ **これが 0 だと §1〜§3 が全部空振りで永久緑になる**
- **(0b)** 絵の src が **`ROOM_PAINTINGS_DEF` の実体から**引かれている(表の写経でない)
- **(0c)** ハイドラの噂フラグ `s3_hydra_intel` を**掴んだ状態**の標本が 1 件以上ある
  (掴んでいないとハイドラは 0 体が正常なので、§2 が空振りする)

### §1 絵と幾何

- **(1a)** ★★ n6 の `rect` と `tileBounds` が**同値**(`paintingAspectFits` を通る)。n7 も同様
- **(1b)** 両方に **`node: true`** が付いている(#52 の罠)
- **(1c)** 両方の `density` が **0**
- **(1d)** `start` が**入場地点**(辺の中点 + `NODE_ENTRY_INSET`)と一致し、
  **既定 `(36,13)` ではない**

### §2 ハイドラ(⚠⚠⚠ 最重要)

- **(2a)** ★★ ハイドラが**祭壇のタイルに湧く**。⭐ 2 経路で突き合わせる =
  ①`SCENARIO_NODE_EXTRAS` の座標 ②実際に生成された敵の tx/ty
- **(2b)** その座標が本番の `isTileWall` で**床**である
- **(2c)** 噂フラグを掴んでいなければ **0 体**(既存の挙動が変わっていない)

### §3 n7 の敵配置

- **(3a)** ボスと護衛 2 体が**全部床**の上にいる(本番の `isTileWall` で確認)
- **(3b)** 入場地点から護衛まで **melee 交戦距離(400px = 4.17 タイル)より遠い**
- **(3c)** 護衛どうしが 2〜4 タイル

### §4 通行

- **(4a)** ★★ n7 の**入場地点から玉座の壇まで、本番の 4 近傍経路探索で到達できる**
  ⛔ ドライバの中に MASK を書き写さない(両方同じ誤りだと永久に気づけない)
- **(4b)** n6 の**入場地点から祭壇まで**同様

### §5 恒等(非退行)

- **(5a)** **n4big が 1 バイトも変わっていない**(#53 の領分)
- **(5b)** 旧エントリ `n4`(7x6)と `n7`(6x6)が**残っている**(撤退の行き先)
- **(5c)** `?swampcrypt=0` / `?swamplair=0` で従来の姿へ戻る
- **(5d)** §2-9 の母集団が**着手前の基準どおり**・**期待値の変更 0 件**(⚠ 直列)

### §6 負のコントロール(`--negative`)— 変異は最低 7 本

| # | 変異 | 担当節 |
|---|---|---|
| M1 | ⭐⭐⭐ **ハイドラ座標を旧 `(36,13)` のまま**にする | (2a)(2b) |
| M2 | `density` を 1 に戻す | (1c) |
| M3 | `start` を既定 `(36,13)` に戻す | (1d) + (4a) |
| M4 | `node: true` を落とす | (1b) |
| M5 | `rect` と `tileBounds` を 1 タイルずらす | (1a) |
| M6 | 護衛を入場地点の隣へ置く | (3b) |
| M7 | 玉座への通路を 1 マス塞ぐ | (4a) |

| **M8** ★受入側で追加 | **ボスをマスクの `#`(玉座の石の天板)へ置く** | (3a)(2b2) |

⚠ **変異は「注入できたか」でなく「測っている場所に現れるか」まで設計する**(#54 の教訓)。
空振りしたら **assert を緩めず、担当節を測れる場所へ移す**。

### ⭐ §9 の着地後の実測(2026-09-07 / `tools/verify_swamp_lair.js` 素 **25/25**・変異 **8/8 空振り 0**)

**素で測れた値**(⛔ ドライバは表を写経していない。すべて配信バイトのパースと本番の関数から引いた):

| 節 | 実測 |
|---|---|
| (0a) | n6 = 絵 1 枚 / `paintedTileMask` **640**/748 タイル、n7 = 絵 1 枚 / **486**/580 |
| (0b) | def の src・貼られた img・ディスク上の実在の **3 経路一致** |
| (0c) | 噂フラグを掴んだ標本で n6 のハイドラ **1 体**(`inactive:true` / `passiveNpc:true` / `hitRange:300`) |
| (1a) | n6 `rect == tileBounds == [3,10,24,43]`、n7 `[3,10,22,38]`。両方 `paintingAspectFits` **true** |
| (1a2) | マスク n6 = 22 行 x 34 桁 / n7 = 20 行 x 29 桁(tileBounds と一致) |
| (1d) | n6 start `(12,13)` / n7 start `(12,12)` が**本番の `nodeGateTile`+`NODE_ENTRY_INSET`+`snapToWalkable`** と独立式の**両方**に一致 |
| (2a)(2b) | ハイドラ = **(38,14)**(定義と実スポーンが一致)。マスク `.` / `isTileWall` 床 / 既定 `(36,13)` でない |
| (2c) | `questFlags` を置いてフラグ無しにすると **0 体**(`ENEMY_SPAWNS=[]`) |
| (3a)(3b)(3c) | 3 体とも床。入場 → 護衛 **2114px / 2132px**(22.02 / 22.20 タイル)、護衛間 **4.00 タイル** |
| (4a)(4b) | 本番 aStar 歩数 = 玉座 **24** / 祭壇 **27**。自前 4 近傍 BFS とも一致 |
| (4c) | n6 歩ける 321 / 到達 **319** / 孤立 `(26,3)(43,13)`、n7 歩ける 124 / 到達 **122** / 孤立 `(24,3)(24,22)` — **全部 sealRing のゲート** |
| (5c)(5c2) | `?swampcrypt=0` → 7x6 / 絵 0 枚 / density 1 / start(36,13) / ハイドラ(36,13)。`?swamplair=0` → 9x6 / paint `n7` / density 1 / 旧 slots・旧 boss |

**⚠⚠⚠ §9 の文面のうち 2 つは、そのまま実装すると検出力が無かった(受入側で訂正した)**:

1. ⛔ **(2b)「本番の `isTileWall` で床である」だけでは永久緑。**
   `applyPaintingBlocking` の門番 `skipSpawn` が**敵スポーンのタイルを必ず素通しさせる**ので、
   ハイドラをマスクの `#` へ置いても `isTileWall` は false(床)になる。
   ⇒ 効く判定は **① 絵のマスクが `.` か** と **② マスクが `#` なのに歩けるタイル(= 絵に開いた穴)が 0 か**。
   後者を **(2b2)** として新設した。M1 はこの 2 本で赤くなる(`isTileWall` 単独では**捕まらない**)。
2. ⛔ **(2a) の「2 経路で突き合わせる」だけでは M1 を捕まえられない。**
   M1 は `SCENARIO_NODE_EXTRAS` そのものを書き換えるので、①定義 と ②実スポーン が**揃って**動く。
   突き合わせは「座標を移したのにスポーンが付いてこない」型にしか効かない(それは残す価値がある)。

**⚠ 変異 M7 は依頼書の指定(行 9 の 1 マス)では空振りする** — 玉座の龕(絵ローカル 26-27 / 行 9-10)は
**行 9 と行 10 の 2 本**で西とつながっているので、片方だけ塞いでも迂回できる。
⇒ `throneseal` は **col 25 を行 9 と行 10 の両方**で塞ぐ(= 唯一の関節を切る)形にした。
これで (4a) の aStar が到達不能・(4c) の孤立が 2→7 タイルへ増えて赤くなる。

**変異 8 本の実測(⛔ 机上ではなく 1 本ずつ実走した結果)**:

| 変異 | port | 期待 | 実際に赤くなった節と実測値 |
|---|---|---|---|
| `hydraold` (M1) | 10122 | (2b)(2b2) | **(2b)** マスク=`#` / **(2b2)** `n6 の穴=[[36,13]]` |
| `density1` (M2) | 10123 | (1c) | **(1c)** `n7: density=1 rect 内 scenery=35` |
| `startdefault` (M3) | 10124 | (1d)(3b) | **(1d)** / **(3b)** 護衛まで **272px(2.83 タイル)**= 交戦距離の内側 |
| `nonode` (M4) | 10125 | (1b)(1b2) | **(1b)** / **(1b2)** 従来経路へ `room_lizard-swamp_n7_map.jpg` が漏れる |
| `boundsoff` (M5) | 10126 | (1a)(1a2) | **(1a)** `aspectFits=false` / **(1a2)** 桁=29/30 / 巻き添えで (2b2) |
| `guardnear` (M6) | 10127 | (3b)(3c) | **(3b)** 192px / **(3c)** 1.00 タイル。⚠ (3a) は予告どおり**緑のまま**(移し先も石畳) |
| `throneseal` (M7) | 10128 | (4a)(4c) | **(4a)** `aStar 歩数=null` / **(4c)** 孤立が 2 → 7 タイル |
| **`bosswall` (M8)** ★受入側で追加 | 10129 | (3a)(2b2) | **(3a)** `boss(36,11) マスク=# 壁=.` / **(2b2)** `n7 の穴=[[36,11]]` |

⭐⭐⭐ **M8 は §9 (2b) の欠陥の直接の証拠**でもある — ボスをマスクの `#` へ置いたのに
**`壁=.`(= `isTileWall` が床を返す)**。門番 `skipSpawn` が素通しさせているので、
「敵が壁の中に湧いた」という言い方では**原理的に捕まえられない**ことが実測で出た。

---

## 10. 実機体感

1. **n6 の聖堂が「沼」に見えるか**(石造の屋内。参道と地続きに感じるか)
2. **n7 の玉座が玉座に見えるか** — ⚠ **族長のスプライトが上に立って隠れる想定**。
   隠れなかったら見え方を再検討
3. **異方性 2.53% の二重グリッドが目に見えるか**(廃坑 7.75% が出荷できているので大丈夫な想定)
4. **n7 の盤面が広すぎてボスまで遠くないか**(29x20 = 580 タイル)
5. **n6 へ寄り道する動機が伝わるか**(行き止まりの側枝なので)

---

## 11. やらないこと(別チケット送り)

- ⛔ **山場 `1` / ボス部屋 `2` の絵の差し替え**(§2-2。分岐マップでは表示されない)
- ⛔ **道中 4 ノード(n0/n1/n2/n3)と n5 の大部屋化**(会議が却下。テンポが壊れる)
- ⛔ **`ancient-ruin-dungeon-player.png` の取り込み** — Sce4(砦)/ Sce5(地下神殿)へ取っておく。
  ⭐ **別チケットの候補**(乾いた石造 7 部屋 + 床の魔法陣 3 つ = 「召喚の祭壇」に合う)
- ⛔ **n7 の玉座の描き直し発注(v2)**(ユーザーが承認のうえ現物を採用)
- ⛔ **`js/df-mapdef.js` の `resolve()` に手を入れる**

---

## 12-0. 着手前の母集団の実測(項目1 で採取)

**2026-09-07 / 基準コミット `079ff3a`(#57 着地後・作業ツリー clean)。全 43 本を直列で実走。**
⚠ §2-9 の表は起草時点の見込み。**下が実測**で、こちらが正。

### 数え方(⭐ 1 本の grep で決めない = #55 の教訓)

    for f in tools/driver_*.js tools/verify_*.js; do
      grep -qE 'lizard-swamp|n4big|n7big|ROOM_PAINTINGS|paintedTileMask|make_grid_map|GRIDS|buildP6Run|buildLizardSwampRun' "$f" && basename "$f"; done

- **機能の語** = `lizard-swamp` / `n4big` / `n7big` / `ROOM_PAINTINGS` / `paintedTileMask` /
  `make_grid_map` / `GRIDS`、**導線の語** = `buildP6Run` / `buildLizardSwampRun`
  ⇒ **41 本**(`driver_paint_blocked` は `--stage` 3 通りで数えて実走 **43 本**)。
- ⭐ **§2-9 の 6 本は実測 41 本の 1/7 でしかない**。特に `driver_field_*`(屋外景観)7 本と
  `driver_doors_*` 3 本、`driver_wall_*` 3 本が表から丸ごと落ちていた。
- ⚠ 上限の確認: `MAPDEF|isCustom` まで広げると **+9 本 = 50 本**
  (`doors_p8` / `graph_run` / `mapdef_step3` / `mapeditor` / `mapeditor_props` /
   `mapeditor_railkit` / `mapeditor_waterkit` / `speech_boss` / `speech_engine`)。
  41 本はその部分集合、と言えて初めて「41 で足りる」と主張できる。
- ⛔ `probe_*` / `sweep_*` は golden ではないので母集団に入れない(6 本該当したが除外)。

### 素の基準(⭐ 実装後はこの表と突き合わせる)

| ドライバ | exit | 集計行 | FAIL 行の集合 |
|---|---|---|---|
| driver_bgm_mine | 0 | 37/37 PASS | — |
| driver_dev_gate2 | 0 | 結果: 62/62 PASS | — |
| driver_doors_p2 | **1** | 結果: 33/34 PASS | **(6c)** ★既存 6 シナリオすべてで扉が立つ — `bandits-forest:0` |
| driver_doors_p5 | 0 | 結果: 30/30 PASS | — |
| driver_doors_p6 | 0 | 結果: 39/39 PASS | — |
| driver_field_scale | 0 | working: 49/49 PASS | — |
| driver_field_step1 | 0 | 95/95 PASS | — |
| driver_field_step1_geo | 0 | 71/71 PASS | — |
| driver_field_step2 | 0 | RESULT: 64/64 ALL PASS | — |
| driver_field_step3 | 0 | RESULT: 65/65 ALL PASS | — |
| driver_field_step6 | **1** | 58/59 PASS | **(C-bandits-forest)** ★`?graph=auto` が出口を自動選択して entry から前進した — `entry=n7 訪問=0` |
| driver_field_step7 | 0 | 79/79 PASS | — |
| driver_field_verge_gap | 0 | RESULT: 39/39 ALL PASS | — |
| driver_graph_p6 | 0 | 結果: 246/246 PASS | — |
| driver_graph_p7 | 0 | 結果: 60/60 PASS | — |
| driver_graph_sce1 | 0 | 106/106 PASS | — |
| driver_grid_p3b | 0 | PASS 43 / FAIL 0 | — |
| driver_grid_p4 | **3** | (集計行なし) | **変異アンカー腐敗** — `n1ringonly` の置換対象が見つからない(廃坑 n1 のマスク行)。素の節は 1 つも走らない |
| driver_grid_p5 | 0 | PASS 103 / FAIL 0 | — |
| driver_grid_p7 | 0 | PASS 44 / FAIL 0 | — |
| driver_grid_p8 | 0 | PASS 56 / FAIL 0 | — |
| driver_grid_s2 | 0 | 111/111 PASS | — |
| driver_mapdef_step1 | 0 | 208/208 PASS | — |
| driver_mapdef_step2 | 0 | 74/74 PASS | — |
| driver_mapeditor_painting | 0 | PASS 106 / FAIL 0 | — |
| driver_mine_wall | **1** | 57/58 PASS | **(3b)** `bandits-forest`: 歩けるマス数が `?paintring=0` と 1 マスも変わらない — `素=266 / off=414` |
| driver_paint_blocked(既定 `--stage goblin-mine`) | 0 | PASS 65 / FAIL 0 | — |
| **driver_paint_blocked `--stage lizard-swamp`** | **0** | **PASS 65 / FAIL 0** | — ⭐ **本チケットの当事者。着手前は完全な緑** |
| driver_paint_blocked `--stage bandits-forest` | **1** | PASS 63 / FAIL **2** | **(4a)** ★現行のマスクは 1 マスも門前ガードに触れていない / **(8a)** 装置: 本番のシナリオグラフを 1 ノード残らず組み直せた(`n=1/1 entry=n7 boss=n7`) |
| driver_spawn_not_on_gate | 0 | 51/51 PASS | — |
| driver_speech_hooks | 0 | RESULT: 13/13 passed | — |
| driver_wall_face | 0 | 54/54 PASS | — |
| driver_wall_props | 0 | 29/29 PASS | — |
| driver_wallbox | 0 | 28/28 PASS | — |
| verify_codex_map_skill | **1** | 16/17 PASSED / FAILED 1 | **(3a)** 焼き直しと `assets/` の SHA が全件一致するが **検算 NG: `stag-tavern`** |
| verify_prep_retire | 0 | 30/30 PASSED | — |
| verify_quest_walk | 0 | 25/25 PASSED | — |
| verify_recruit_size | 0 | 結果: 82/82 PASS | — |
| verify_road_ambush | 0 | 41/41 PASSED | — |
| **verify_swamp_novice** | **0** | **PASS 33 / FAIL 0** | — ⭐ **#53 の受入。着手前は完全な緑** |
| verify_tavern_map | 0 | 43/43 PASSED | — |
| verify_town_map | 0 | 85 / 85 | — |
| verify_walk_block | **1** | 22/23 PASSED / FAILED 1 | **(3d)** badge を持つ `ENEMY_TYPES` 定義が 44 件のまま — 実測 **45 件**。名指し `goblinRider="🐺"` / `goblinArcher="🏹"` |

### 着手前から赤 = **6 本**(#55 の 3 分類で仕分け済み)

| ドライバ | 型 | 赤の理由(1 行) | #58 との関係 |
|---|---|---|---|
| `driver_doors_p2` (6c) | **3** | 森グラフが `bandits-forest:0` を返す(扉が 1 枚も立たない) | 無関係(森) |
| `driver_field_step6` (C-bandits-forest) | **3** | 同上。森が entry=n7 の 1 ノードしか組めず前進しない | 無関係(森) |
| `driver_mine_wall` (3b) | **3** | 同上。森の絵が貼られず `?paintring=0` と差が出ない | 無関係(森) |
| `driver_paint_blocked --stage bandits-forest` (4a)(8a) | **3** | 同上。`n=1/1 entry=n7 boss=n7` | 無関係(森) |
| `driver_grid_p4` (exit 3) | **3** | 変異 `n1ringonly` のアンカー腐敗(**廃坑 n1** のマスク行が動いている)。素の節が 1 つも走らない | 無関係(廃坑) |
| `verify_walk_block` (3d) | **3** | `badge` 持ちの `ENEMY_TYPES` が 44 → **45** に増えている(`goblinRider` / `goblinArcher`) | 無関係 |

- ⭐⭐⭐ **森の 4 本は同じ 1 つの根**: `bandits-forest` のグラフが **n7 の 1 ノードしか組めない**
  (`n=1/1 entry=n7 boss=n7`)。⛔ **4 本を別々の赤として数えないこと**。#58 は沼なので触らない。
- ⭐ **§2-9 の見込みは 2 件外れていた**:
  - 「`driver_paint_blocked --stage bandits-forest` は着手前から赤 **3 本**」→ 実測 **2 本**((4a)(8a))。
  - 「`verify_walk_block` 22/23 は #53 の `swampNovice` 由来」→ **違う**。真因は
    **badge 持ちの敵定義が 1 件増えたこと**で、沼とも #53 とも関係がない。
  - ⚠ `driver_speech_v2` は母集団の grep に**掛からない**(45/46 の件は #58 の母集団外)。

### ⚠⚠ 環境由来の偽の赤 6 本(**型2**。掃除したら全部緑になった = 記録に残さない類)

初回の実走で `driver_dev_gate2` / `field_step1_geo` / `field_step2` / `field_step3` /
`field_step6` / `field_verge_gap` の **6 本が exit 1 or 3 で 0〜1 秒で即死**した。

    fatal: 'C:/Users/PC_User/AppData/Local/Temp/df_step2_baseline' already exists

真因 = **前セッションが残した git worktree が `%TEMP%` に居座っている**(`git worktree list` に
13 個登録されていた)。これらのドライバは `worktree add` を無条件に呼ぶので、既存ディレクトリで死ぬ。

    git worktree remove --force "C:/Users/PC_User/AppData/Local/Temp/df_<名前>" ; git worktree prune

⇒ 掃除後に再走して **6 本中 5 本が緑**(残り 1 本 = `field_step6` の森の赤 = 上表の型3)。
⭐⭐⭐ **「0 秒で死ぬ赤」を「昔から赤い」と記録してはいけない。** 記録すると次のチケットが
本物の赤と混ぜて読む(#55 の型2 そのもの)。⚠ ただし**走行中の worktree を消すと
その run が偽の赤になる**ので、掃除はスイープの合間に行い、`node` プロセスの不在を確かめてから。

### 実装後に比べるときの注意

- ⚠⚠ **必ず直列**。母集団の内部にポート同番が **3 組**ある:
  `driver_field_step1`×`driver_speech_engine`=8796 / `driver_grid_p3b`×`driver_mapdef_step3`=8951 /
  `verify_recruit_size`×`verify_town_map`=8897。並列にすると確実に exit 3。
- ⚠ 総括行の書式は 5 種類ある。`PASSED` で grep すると 6 本が空になる。**`PASS` で拾う**。
- ⚠ 遅い本が 3 つある: `driver_field_step6` **1416s** / `driver_grid_p8` 284s /
  `driver_field_step7` 245s。全 43 本の直列で **約 55 分**。

### ⭐ 着地後の突き合わせ(2026-09-07 / 項目4)

**この表と実際に突き合わせた結果は §14-3 に置いた**(回した本 / 回さなかった本の内訳つき)。
⭐ 上の 43 本のうち **当事者 2 本 + 絵・グラフ・マスクに触る本 + 着手前から赤い本 = 24 本**を
**直列**で実走し、**exit / 集計行 / FAIL 行の集合**を 1 行ずつ突き合わせた。

---

## 12-1. STEP1 の実装結果(2026-09-07)

- `tools/make_grid_map.py` の `GRIDS` に **`swamp-crypt`** と **`chieftain-lair`** を追加。
  焼き上がり = `assets/room_lizard-swamp_n6_map.jpg` (**1632x1056** = 34x22 @48px) /
  `assets/room_lizard-swamp_n7_map.jpg` (**1392x960** = 29x20 @48px)。検算は**両方とも 3 指標 OK**。

| 素材 | 縦線 | 横線 |
|---|---|---|
| n6 (flooded-crypt) | ドリフト **1.50** / 位相 1.00 / score比 **99.2%** | ドリフト 2.07 / 位相 1.00 / score比 98.5% |
| n7 (chieftain-lair) | ドリフト 1.91 / 位相 1.00 / score比 96.8% | ドリフト 2.32 / 位相 1.00 / score比 97.6% |

### ⚠⚠⚠ §4-1 の 6 数値のうち **n6 の縦(phase 21.95 / period 44.170)は誤りだった**

そのまま焼くと **縦の累積ドリフト 101.46 world-px(許容 4.0)= 25 倍の NG**。
⛔ 3 指標は 1 つも緩めていない。**測り直した**結果が下:

    "phase":  (20.35, 7.15),      # ← 21.95 から訂正
    "period": (44.280, 44.290),   # ← 44.170 から訂正

- ⭐⭐⭐ **`--fit` を何度回しても 44.170 が返る**(探索中心を 44 / 45 / 45.5 / 46 / 47 と
  振っても同じ)。⛔ **再現性は正しさの裏付けにならない。**
  真因 = `--fit` の探索窓は中心 ±8% なので `--fit-around 48` の下端が **44.16**。
  本物 44.28 と 0.1px しか違わない**偽の極大 44.17 が窓の縁に立っており**、
  全画像(上下の余白込み)の応答では偽のほうが score でわずかに勝つ(44.20 で 6.41 / 44.30 で 6.13)。
- ⭐⭐⭐ **見分け方 = 焼いてから `--check` し、周期を面で振る**。
  44.30〜44.50 に「どこを採っても OK」の **basin** が在り、44.15〜44.25 は drift 10.34 で全滅、
  44.90/44.95 には drift 3.76 の**ナイフエッジの偽の合格**もあった(cells が 34→33 に変わる)。
  ⛔ **最初に見つかった OK を採らない。** basin かナイフエッジかを見てから採る。
- ⭐ サニティチェック: 本物なら**縦横がほぼ同値**になる(44.280 vs 44.290 = **異方性 0.023%**、
  台帳 9 枚で最良)。偽の 44.170 は横と 0.271% ずれていた。
  ⚠ ⛔ 異方性が小さいことだけを根拠にしない(0.271% でも十分小さく見える)。
- ⚠ `chieftain-lair` の 6 数値(2.53%)は §4-1 のまま**無修正で通った**。

### ⚠ `src` の置き場が違う件(§4-1 の注記どおり)

`bake()` は `os.path.join(SRC_DIR, spec["src"])` の一本道(`tools/make_grid_map.py:323`)。
`chieftain-lair-v1.png` は `codex1/assets/maps/` = **SRC_DIR の外**なので
`"src": r"..\assets\maps\chieftain-lair-v1.png"` で逃がした(実測で開けることを確認済)。
⭐ `verify_codex_map_skill` の **(0b)** は `os.path.exists(os.path.join(SRC_DIR, src))` で
判定するので、この相対パスでも**緑のまま**。⛔ codex1 側のファイルは移動も複製もしていない。

### ⭐ STEP2 / STEP3 のための絵ローカル座標(実測)

**n6「蛇神の祭壇」= 34 列 x 22 行**

| 何 | 絵ローカル (col,row) |
|---|---|
| 左の瓦礫部屋(入場側) | cols 1-7 / rows 6-18。西壁 col 1 の rows 11-13 に石段 |
| **入場地点**(左辺の中点 + `NODE_ENTRY_INSET` 2) | **(2, 11)** — 瓦礫部屋の床。⭐ 壁ではない |
| 扉(左の部屋 ↔ 中央の柱の間) | col 9 / rows 10-12 |
| 中央の柱の間 | cols 10-20 / rows 6-18。丸柱 6 本 = (12,7)(18,7)(12,11)(18,11)(12,15)(18,15) |
| 扉(中央 ↔ 水の部屋) | col 22 / rows 10-12 |
| **西の水帯** | **cols 23-25 / rows 5-18** |
| 中央の乾いた参道(南北に貫く) | cols 26-29 / rows 4-19 |
| **★祭壇の中心**(ハイドラの移し先) | **(28, 11)**。八角形の外形 = cols 25-30 / rows 9-14、内側の開けた床 = cols 27-29 / rows 10-13、四隅に円形の台 (26,10)(29,10)(26,13)(29,13) |
| 祭壇へ登る石段 | 北 = cols 27-29 / row 9 、南 = cols 27-29 / row 14 |
| 東の水帯 | cols 30-32 / rows 5-18 |
| 北東の小部屋(石板・松明) | cols 26-30 / rows 0-4。col 28 / rows 4-5 の階段で水の部屋へ降りる |
| 南の階段(部屋の外へ) | cols 13-17 / rows 19-21 |

⚠⚠⚠ **§2-5 の (3)「祭壇を囲む水に渡りがあるか」への答え = 渡りは無い。**
入場 (2,11) から祭壇 (28,11) へ行くには **西の水帯 cols 23-25 を 3 マス渡るしかない**。
⇒ マスクの規則 (4)「入場口から祭壇までのレーンを明示的に空ける」を守るには、
**`(23..25, 10..12)` を `.`(浅瀬として通す)にする**必要がある。⛔ 水を一律 `#` にすると詰む。

**n7「族長の巣」= 29 列 x 20 行**

| 何 | 絵ローカル (col,row) |
|---|---|
| **入場地点**(左辺の中点 + `NODE_ENTRY_INSET` 2) | **(2, 10)** — 乾いた石畳の帯の上 |
| **東西に貫く乾いた石畳** | **rows 9-10**(全幅 col 0-28 で連続。乾き率 0.28 / 0.24 = 全行で最大) |
| 浅い水(西〜中央) | cols 1-21 / rows 4-16(rows 9-10 の帯を除く) |
| 東の乾いた広場(壇) | cols 21-28 / rows 4-16(乾き率は col 24 が最大 0.33) |
| **★玉座**(ボスの置き先) | **(26, 9)**。石の「額縁」状の構造 = cols 25-28 / rows 8-11、座の内側 = cols 26-27 / rows 9-11 |
| **★壇の手前の開けた床**(護衛 2 体) | **(24, 8)** と **(24, 12)** — どちらも汚れの無い乾いた石畳。互いに **4 タイル**(§9 (3c) の 2〜4 に収まる) |
| 北壁沿いの障害物 | rows 0-3(壺・武器架・骨・蛇の意匠) |
| 南壁沿いの障害物 | rows 16-19(ワニの頭骨・蛇・瓦礫) |

⭐ **(3b) の見積もり**: 入場 (2,10) → 護衛 (24,8) は **22 タイル = 2112px**。
melee 交戦距離 400px(4.17 タイル)よりはるかに遠いので、入場ナレの最中に乱戦は始まらない。
⚠ ただし**必ず本番の `isTileWall` で測り直すこと**(上表は絵から読んだ値で、マスク確定前)。

⭐ **§2-6 の「玉座が額縁に見える」は現物でも額縁に見える**(ユーザー承認済)。
座の内側 (26-27, 9-11) は水色がかっており、族長スプライトが立てば隠れる想定。

---

## 12. ⛔ 測らないこと

- **絵の見た目・色・階調** — 実機で見てから判断する余地を残す
- **異方性そのもの** — 検算の 3 指標が門番。⛔ 異方性に閾値を足さない
- **n6 へ寄り道する頻度** — 側枝なので低くて当然

---

## 14. 実装結果(2026-09-07 / 実装窓)

### 14-1. 着地した 4 項目

| STEP | commit | 内容 | 結果 |
|---|---|---|---|
| STEP1 | `bb329e7` | `tools/make_grid_map.py` の `GRIDS` に `swamp-crypt` / `chieftain-lair` を追加 + 卓上マップ 2 枚を焼く(`assets/room_lizard-swamp_n6_map.jpg` **1632x1056** / `_n7_map.jpg` **1392x960**)+ 着手前の母集団 **43 本**を §12-0 へ実測記録 | 検算 3 指標とも OK |
| STEP2 | `d1aef29` | n6「蛇神の祭壇」を **34x22** の大部屋へ(`n6big` / `rect=[3,10,24,43]` / `density:0` / `start=(12,13)`)+ **ハイドラを (36,13) → (38,14) の祭壇中心へ移設** + `?swampcrypt=0` | — |
| STEP3 | `7b6235c` | n7「族長の巣」を **29x20** の大部屋へ(`n7big` / `rect=[3,10,22,38]` / `density:0` / `start=(12,12)`)+ 敵 3 体を絵の上へ(`[34,11]` / `[34,15]` / boss `[36,12]`)+ `?swamplair=0` | — |
| STEP4 | (本コミット) | 受入ドライバ `tools/verify_swamp_lair.js`(base **10121** / 変異 **10122〜10129**) | 素 **25/25** ・変異 **8/8 空振り 0** ・母集団 **24 本**の色が着手前と完全一致 |

⭐ **触ったファイル**(実測): `index.html` / `js/df-mapdef.js` / `tavern.html`(changelog 2 行)/
`tools/make_grid_map.py` / `tools/driver_graph_p6.js` / `tools/goldens/grid_s2.json` /
`assets/` 2 枚 / `tools/verify_swamp_lair.js`(新規)。

### 14-2. ⛔ 起草の主張が崩れた点(全量 = **12 件**)

**項目1〜3 が見つけたもの(1〜8)**

1. ⚠⚠⚠ **§4-1 の n6 の 6 数値が誤り** — `period` 44.170 → **44.280** / `phase` 21.95 → **20.35**。
   そのまま焼くと縦の累積ドリフト **101.46**(許容 4.0 の **25 倍**)。
   ⭐⭐⭐ `--fit` を何度回しても 44.170 が返る(探索窓の縁に立った**偽の極大**)。
   **再現性は正しさの裏付けにならない。** 見分け方 = 焼いてから `--check` し、周期を面で振って
   basin かナイフエッジかを見る(詳細は §12-1)。
2. ⚠⚠ **入場地点は `nodeGateTile` の `Math.floor` で行数の偶奇でずれる** —
   `midR = Math.floor((r1+r2)/2)`。n6(22 行)は絵ローカル **10**、n7(20 行)は **9**。
   §5 / §6 と §12-1 の「n7 の入場は (2,10)」は **1 マス誤り**(実測は (2,9))。
   ⇒ 受入 (1d) は定数を写経せず**本番の関数と rect からの独立式の 2 経路**で組んだ。
3. **§2-5 の「祭壇を囲む水」は幅 3 ではなく 1 タイル** — 行 10-12 で水は **col 23 の 1 マスだけ**、
   col 24-25 は堀の内側の乾いた踏み段。⛔ 水を一律 `#` にすると祭壇が到達不能になる。
4. ⛔⛔ **§3 の「`js/df-mapdef.js` は触らない」は成立しない** —
   `LINT_PAINTING_ASPECTS` へ **34x22 と 29x20 を足さないと** 起動時の `lintRun`(カタログ登録より前)が
   `graph-painting-aspect` の warning を出し、`driver_graph_p6 (2c-lizard-swamp)` が赤くなる。
   **#11(52x26)・#53(30x21)に続き 3 度目**。⛔ 触ったのは在庫の 2 行だけで `resolve()` は無傷。
5. **§2-9 の母集団 6 本は実測 41 本(実走 43 本)の 1/7** — `driver_field_*` 7 本 /
   `driver_doors_*` 3 本 / `driver_wall_*` 3 本が表から丸ごと落ちていた(§12-0)。
6. **「`driver_paint_blocked --stage bandits-forest` は着手前から赤 3 本」→ 実測 2 本**((4a)(8a))。
7. **「`verify_walk_block` 22/23 は #53 の swampNovice 由来」は誤り** — 真因は
   `badge` を持つ `ENEMY_TYPES` が 44 → **45** に増えたこと(`goblinRider` / `goblinArcher`)で、
   沼とも #53 とも関係が無い。
8. ⛔ **§3 の「`tavern.html` は本チケットで一度も開かない」は不可能** —
   `index.html` を触るコミットは `scripts/hooks/check_changelog.py` が changelog の更新を強制し、
   その `changelogList` は **`tavern.html` に在る**。CLAUDE.md の「コミットの度に必ず最新化」が優先。
   実際に 2 行追記した(`7b6235c` の diff)。

**項目4(受入)が見つけたもの(9〜12)**

9. ⚠⚠⚠ **§9 (2b)「本番の `isTileWall` で床である」だけでは永久緑になる** —
   `applyPaintingBlocking` の門番 `skipSpawn` が**敵スポーンのタイルを必ず素通し**させるので、
   ハイドラをマスクの `#` へ置いても `isTileWall` は false(床)を返す。
   ⇒ 効くのは **① 絵のマスクが `.` か** と **② マスクが `#` なのに歩けるタイル(= 絵に開いた穴)が 0 か**。
   後者を **(2b2)** として新設。M1 はこの 2 本でしか赤くならない。
   ⭐ 一般形 = 「門番が例外扱いする対象そのもの」を、門番の下流で測ってはいけない。
10. ⚠⚠ **§9 (2a) の「2 経路で突き合わせる」だけでは M1 を捕まえられない** —
    M1 は `SCENARIO_NODE_EXTRAS` そのものを書き換えるので ①定義 と ②実スポーン が**揃って**動く。
    (2a) が守るのは「座標を移したのにスポーンが付いてこない」型だけ(それは残す価値がある)。
11. ⚠⚠ **変異 M7「玉座への通路を 1 マス塞ぐ」は指定どおり(行 9 の col 25)だと空振りする** —
    玉座の龕(絵ローカル 26-27 / 行 9-10)は **行 9 と行 10 の 2 本**で西とつながっており、
    片方だけでは迂回できる。⇒ **col 25 を行 9 と行 10 の両方**で塞ぐ形にした
    (= 唯一の関節を切る)。これで (4a) の aStar が到達不能・(4c) の孤立が 2 → 7 タイルへ増える。
12. ⚠⚠⚠ **恒等 assert (5a) は `git show` を素で比べると必ず赤くなる** —
    この環境は **`core.autocrlf=true`** なので、作業ツリー(= 配信バイト)は CRLF、
    `git show <rev>:index.html` が返すのは LF。n4big の **46 行ぶん 46 バイト**ずれる
    (実測 3267 vs 3221)。⇒ **改行の格納形式だけ正規化**してから全文一致を要求する。
    ⛔ これは緩和ではない(中身は 1 文字も許していない)。
    ⭐ おまけ: 「意図的に更新した golden は `driver_graph_p6` の (1z) と `grid_s2.json` の 2 つ」は
    **ファイル数としては正しいが assert 家族としては 4 つ**((1i)(1i2)(1z)(1z2))。
    リポジトリ全体で沼 n6/n7 の幾何を焼き込んでいるのは
    `tools/goldens/grid_s2.json` と `tools/driver_graph_p6.js` の **2 ファイルだけ**(grep で確認)。

### 14-2b. ⭕ 当たっていた主張(受入で機械的に裏が取れたもの)

- **§2-2「生きた旧グラは n7 の 1 枚だけ」** — 受入 (1b2) が `?graph=0` の従来経路で貼られる絵を
  そのまま出す: `["assets/room_lizard-swamp_1_bs.jpg","assets/room_lizard-swamp_2.png"]`。
  **数字キー `1` / `2` は従来経路にしか出ない**(= 分岐マップでは表示されない)ことの実測。
  分岐経路では n6big / n7big が **1 枚も漏れていない**。
- **§2-5「大部屋化するとハイドラが別の場所に湧く」** — 旧 `(36,13)` は n6big の絵ローカル
  `(26,10)` = **マスクが `#`**(祭壇北西の円形の台)。変異 `hydraold` で (2b)(2b2) が実際に赤くなり、
  **絵に穴が 1 枚開く**ことまで再現した。
- **§2-7 の必須 5 項目**のうち **4 つは変異で赤くできることを実証済**:
  `density:0` → (1c) / `start` を入場地点へ → (1d) / `node:true` → (1b)(1b2) /
  `rect == tileBounds` → (1a)(1a2)。
  5 つ目「敵はマスクの `.` へ」も **M8 `bosswall` を受入側で足して赤くした**((3a)(2b2))。
  ⚠ M6 だけでは足りなかった(移し先がどちらも石畳 = 床なので (3a) は緑のまま)ので、
  **わざとマスクの `#`(玉座の石の天板 = 絵ローカル (26,8))へボスを置く 1 本**を追加した。
- **§8「撤退は 2 本に分ける」** — (5d) が独立性を実測(`?swampcrypt=0` でも n7 は `n7big` のまま /
  `?swamplair=0` でも n6 は `n6big` のまま)。ハイドラ座標も (5c) でスイッチと連動して戻る。

### 14-3. 母集団の非退行(⚠ 全部**直列**で実走)

§12-0 の 43 本のうち、**当事者 2 本 + 絵/グラフ/マスクに触る本 + 着手前から赤い本 = 24 本**を
**直列**で実走し、`exit` / 集計行 / FAIL 行の集合を 1 本ずつ突き合わせた(2026-09-07 19:08〜)。

| ドライバ | 着手前(§12-0) | 着地後 | 判定 |
|---|---|---|---|
| **`driver_paint_blocked --stage lizard-swamp`** ⭐当事者 | 0 / PASS 65 / FAIL 0 | 0 / PASS 65 / FAIL 0 | **一致** |
| **`verify_swamp_novice`** ⭐当事者 | 0 / PASS 33 / FAIL 0 | 0 / PASS 33 / FAIL 0 | **一致** |
| `driver_graph_p6` | 0 / 246/246 | 0 / 246/246 | 一致(⚠ (1i)(1i2)(1z)(1z2) は**意図的に更新**した golden) |
| `driver_graph_p7` | 0 / 60/60 | 0 / 60/60 | 一致 |
| `driver_graph_sce1` | 0 / 106/106 | 0 / 106/106 | 一致 |
| `driver_grid_s2` | 0 / 111/111 | 0 / 111/111 | 一致(⚠ `goldens/grid_s2.json` は**意図的に更新**) |
| `driver_mapdef_step1` | 0 / 208/208 | 0 / 208/208 | 一致 |
| `driver_mapdef_step2` | 0 / 74/74 | 0 / 74/74 | 一致 |
| `driver_mapeditor_painting` | 0 / PASS 106 / FAIL 0 | 0 / PASS 106 / FAIL 0 | 一致 |
| `driver_spawn_not_on_gate` | 0 / 51/51 | 0 / 51/51 | 一致 |
| `driver_paint_blocked`(既定 goblin-mine) | 0 / PASS 65 / FAIL 0 | 0 / PASS 65 / FAIL 0 | 一致 |
| `driver_paint_blocked --stage bandits-forest` ⚠着手前から赤 | 1 / 63/2 (4a)(8a) | 1 / 63/2 (4a)(8a) | **同じ赤** |
| `verify_codex_map_skill` ⚠着手前から赤 | 1 / 16/17 (3a) `stag-tavern` | 1 / 16/17 (3a) `stag-tavern` | **同じ赤**(⭐ SHA は **9 件**全件一致 = 新 2 件も焼き直しで再現) |
| `driver_doors_p2` ⚠着手前から赤 | 1 / 33/34 (6c) `bandits-forest:0` | 1 / 33/34 (6c) `bandits-forest:0` / `lizard-swamp:3` | **同じ赤** |
| `driver_mine_wall` ⚠着手前から赤 | 1 / 57/58 (3b) | 1 / 57/58 (3b) 素=266 / off=414 | **同じ赤**(⭐ (4z)(4z2) のフレークは出ず 1 回で確定) |
| `driver_grid_p4` ⚠着手前から赤 | **3**(アンカー腐敗) | **3** | **同じ赤** |
| `verify_walk_block` ⚠着手前から赤 | 1 / 22/23 (3d) badge 45 件 | 1 / 22/23 (3d) badge 45 件 | **同じ赤** |
| `driver_grid_p3b` | 0 / PASS 43 / FAIL 0 | 0 / PASS 43 / FAIL 0 | 一致 |
| `driver_grid_p5` | 0 / PASS 103 / FAIL 0 | 0 / PASS 103 / FAIL 0 | 一致 |
| `driver_grid_p7` | 0 / PASS 44 / FAIL 0 | 0 / PASS 44 / FAIL 0 | 一致 |
| `driver_wall_face` | 0 / 54/54 | 0 / 54/54 | 一致 |
| `driver_wall_props` | 0 / 29/29 | 0 / 29/29 | 一致 |
| `driver_wallbox` | 0 / 28/28 | 0 / 28/28 | 一致 |
| `driver_field_step6` ⚠着手前から赤・**1416s** | 1 / 58/59 (C-bandits-forest) | 1 / 58/59 (C-bandits-forest) `entry=n7 訪問=0 前進=せず` | **同じ赤** |

⭐⭐⭐ **24 本すべてで `exit` / 集計行 / FAIL 行の集合が着手前と完全一致。緑を赤にした本は 0。**
⭐ 着手前から赤い 7 本(`doors_p2` / `field_step6` / `mine_wall` / `paint_blocked --stage bandits-forest` /
`grid_p4` / `verify_walk_block` / `verify_codex_map_skill`)は**同じ FAIL 行のまま**で、
うち森の 4 本は §12-0 の言うとおり **同じ 1 つの根**(`bandits-forest` が n7 の 1 ノードしか組めない)。
⚠ `driver_mine_wall` の (4z)(4z2)(非決定オートプレイのフレーク)は **1 回目で赤にならず**、再走は不要だった。

⭐ **回さなかった 19 本と、その理由**:
`driver_bgm_mine` / `driver_dev_gate2` / `driver_doors_p5` / `driver_doors_p6` /
`driver_field_scale` / `driver_field_step1` / `driver_field_step1_geo` / `driver_field_step2` /
`driver_field_step3` / `driver_field_step7` / `driver_field_verge_gap` / `driver_grid_p8` /
`driver_speech_hooks` / `verify_prep_retire` / `verify_quest_walk` / `verify_recruit_size` /
`verify_road_ambush` / `verify_tavern_map` / `verify_town_map`。
いずれも **沼の n6/n7 の幾何にも `ROOM_PAINTINGS_DEF` の在庫にも触れない**(母集団に入っているのは
`MAPDEF` / 屋外テーマ / 出発の口といった**別の語**での引っ掛かり)。
⭐ リポジトリ全体で **沼 n6/n7 の幾何を焼き込んでいるのは `tools/goldens/grid_s2.json` と
`tools/driver_graph_p6.js` の 2 ファイルだけ**で、その 2 本は上表で緑を確認済み
(`grep -rEl 'lizard-swamp/n[67]|room_lizard-swamp_n[67]' tools/` の実測)。

⚠ **期待値を動かしたのは 2 ファイルだけ**(どちらも #58 の実装コミットに含まれる):
`tools/driver_graph_p6.js`((1i)(1i2) を `EXPECT_PAINTED` 台帳へ / (1z) に `lizard-swamp` を追加 /
(1z2) に `n6` を追加)と `tools/goldens/grid_s2.json`(沼 n6/n7 の mapDef 2 行)。
**それ以外の期待値は 1 つも動かしていない。**

### 14-4. 残っている実機体感(§10)

1. **n6 の聖堂が「沼」に見えるか**(石造の屋内。参道と地続きに感じるか)
2. **n7 の玉座が玉座に見えるか** — 族長スプライトが上に立って隠れる想定。隠れなければ見え方を再検討
3. **異方性 2.53% の二重グリッドが目に見えるか**(廃坑 7.75% が出荷できているので大丈夫な想定)
4. **n7 の盤面が広すぎてボスまで遠くないか**(29x20 = 580 タイル / 入場から玉座まで aStar **24 歩**)
5. **n6 へ寄り道する動機が伝わるか**(行き止まりの側枝なので)
6. ⭐ 追加: **n6 の堀の渡り(rows 10-12 の col 23 の 1 列だけ)が「渡れる」と見て分かるか** —
   絵には橋も飛び石も描かれていない。分からなければ絵の描き直しか飛び石プロップの検討

---

## 13. `実装依頼書/README.md` へ足す行(✅ 2026-09-07 追加済)

    | 58 | [2026-09-07_swamp-map-refresh.md](2026-09-07_swamp-map-refresh.md) | 起草(未承認) | 0% | 沼地から**生きている旧グラを追放**する。A = n6「蛇神の祭壇」に納品済みの `flooded-crypt`(**発注ゼロ** / 34x22 / 異方性 0.271%)/ B = n7「族長の巣」に新規発注の `chieftain-lair-v1`(29x20 / 異方性 2.53%)。撤退 `?swampcrypt=0` / `?swamplair=0`。⭐⭐⭐ **生きた旧グラは n7 の 1 枚だけ** — `buildP6Run` の `const paint = d.paint != null ? d.paint : ((id === "n4" \|\| id === "n7") ? id : null);` が自動で貼っている。⛔ **山場 `1` / ボス部屋 `2` は分岐マップで表示されない**(`MAPDEF.isCustom === false` の従来経路だけが数字キーを貼る = `?graph=0` と生成クエスト専用)ので触らない — 触ると「プレイヤーに見える変化ゼロで index.html を触る」型になる。⚠⚠⚠ **最大の罠 = n6 を大部屋化するとハイドラ `(36,13)` が別の場所に湧く**(森が #11 で踏んで記録した罠と同型。`SCENARIO_NODE_EXTRAS` の座標も一緒に移す。⛔ 噂フラグ `s3_hydra_intel` は 1 文字も変えない)。⭐ 写経元は森 n7big(ボスノード大部屋化の唯一の前例)と沼 n4big。⚠ `density:0` / `start` を入場地点へ / `node:true` / `rect == tileBounds` の 4 つが必須。⛔ **STEP2 以降は #57 の着地待ち**(`index.html` が衝突)。⭐ **STEP1(焼き込み)だけは `tools/` と `assets/` のみなので並行できる**。会議 = `dev-meetings/2026-09-07_swamp-map-refresh.md`。発注 = `codex1/requests/2026-09-07_chieftain-lair-map.md`(**納品済**)。モックアップ = https://claude.ai/code/artifact/866a59ed-075e-4abd-824e-a192d76ee252 |
