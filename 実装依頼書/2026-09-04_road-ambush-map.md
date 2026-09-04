# #52 街道の卓上マップ — codex 納品の 1 枚絵を DF の格子へ乗せる

- **起草**: 2026-09-04(計画窓) / **ステータス**: **承認済**(2026-09-04 ユーザー承認)
- **着手**: ✅ **完了(2026-09-05 実装窓)**。#51 は `702830b` で全項目着地済み = 待ちは解けていた。
  実測結果と、依頼書の主張が崩れた 6 件は **§12** に全部書いてある(⛔ §6 の `node: false` は
  **逆で `node: true` が正しい**。写経する前に §12-1 ① を読むこと)。
- ⚠ **着手前にもう一度測ること** — 起草時の基準は `bdc6880`。#51 が着地すると
  `index.html` / `js/road-events.js` が動くので、§2 の行番号と `AMBUSH_FIELD` の実在を測り直す:
  `git diff --stat bdc6880..HEAD -- index.html js/road-events.js js/df-mapdef.js`
- **触るファイル**: `tools/make_grid_map.py` / `index.html`(`ROOM_PAINTINGS_DEF`)/
  `js/road-events.js`(`AMBUSH_FIELD` の差し替え)/ `assets/room_caravan-road_ambush.jpg`(生成物)/
  `tools/verify_road_ambush.js`(#51 の装置へ追記)
- ⛔ **依存**: **#51 が着地してから着手する**。#51 が作る `AMBUSH_FIELD` を差し替えるチケットなので、
  相手が居ない状態では差し替え先が存在しない。
- **素材**: `codex1/maps/road-ambush-v1.png`(納品済・md5 `9c5435d432b02353a27fd547690373ae`)
- **発注文**: `codex1/requests/2026-09-04_road-ambush-map.md`

---

## 1. 目的

#51「街道の襲撃」の戦闘を、**codex が描いた街道の卓上バトルマップの上**で行えるようにする。

今の #51 は既存の `caravan-road` テクスチャ(踏み固めた土 + 路肩)を敷いた
**歩行帯 3 行(row 13-15)の屋外描画**で戦う。事件の場としては十分だが、
「停まった幌車・散らばった積荷・路肩の石積み・街道を跨ぐ石橋」という**画面を見た瞬間に
事件だと分かる絵**にはならない。

### ユーザー決定(2026-09-04)

- 発注は **#51 の起草と同時**に出す(並走)→ **納品済み**
- 下見(`read-only`)で生成された 1 枚を**採用する**(⛔ 本番投下で引き直さない。
  画像生成は非決定論なので、再実行するとこの絵を失う)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

**基準 hash = `bdc6880`**(#51 起草の push 時点)。⛔ 着手時は **#51 着地後の HEAD** で測り直す。

### 2-1. ⚠⚠⚠ 罠 A(最重要)— 屋外テーマの上に 1 枚絵は載せられない

`js/df-mapdef.js` の `resolve()` は採用可否を 5 段で決めており、その **④** がこれ:

    ④ 屋外テーマ (caravan-road) のカスタム幾何   → 既定値 + console.warn。isCustom=false

理由もコードが明示している(`js/df-mapdef.js:1942` 付近):

> themeId:"caravan-road" は index.html 側で IS_FIELD_THEME を真にし、
> 帯マスク・空/丘/路肩の地平線レンダラ・視界制限オフが**まとめて**発火する。
> これらは **flags.bandMask ではなく themeId から引かれる**ので、mapDef 側で
> bandMask を切っても**地平線レンダラだけが残り、カスタム幾何の上に空と丘が描かれる**。

裏付け(index.html の実読):

| ファイル:行 | 何 |
|---|---|
| `index.html:3640` | `const FIELD_THEMES = new Set(["caravan-road"]);` |
| `index.html:3641-3642` | `IS_FIELD_THEME = FIELD_THEMES.has(_scenIdForTex)` / `FIELD_MODE = IS_FIELD_THEME` |
| `index.html:3765-3766` | `fieldSkyRow` / `fieldApronRow` は **`FIELD_MODE && FIELD_GEO_ACTIVE`** を見る(⛔ bandMask は見ない) |
| `index.html:4646` | 帯マスクだけが `MAPDEF.flags.bandMask && FIELD_GEO_ACTIVE` |
| `js/df-mapdef.js:1327` | `DEFAULT_FIELD` の注記「屋外は分岐対象外。resolve() が既に屋外×カスタム幾何を排他にしている」 |

⇒ ⭐⭐⭐ **1 枚絵の卓上マップは、themeId を非屋外テーマへ移さないと原理的に載らない。**
⛔ `FIELD_THEMES` から `caravan-road` を外して回避しない —— 7.9-3「隊商護衛」が丸ごと壊れる。

### 2-2. ⭐ 前例 `n7big` が「屋外に見える卓上マップ」の唯一の正

`index.html:5188-5215`(`ROOM_PAINTINGS_DEF["bandits-forest"].n7big`):

| 属性 | 値 | 意味 |
|---|---|---|
| `src` | `assets/room_bandits-forest_n7_map.jpg` | 焼き上がり |
| `tileBounds` | `[1, 10, 26, 61]` | **[r1, c1, r2, c2] = 行が先**。26 行 x 52 列 |
| `sealRing` | `true` | 外周 1 タイルを通行不能に(歩ける「壁抜けの帯」を作らない) |
| `outdoor` | `true` | **`exploredTiles` と `visibleTiles` を両方立てる** = 入った瞬間から地形全体が見える |
| `gates` | `{ left: [0, 14] }` | 絵に描かれた出入口(⚠ #52 では**不要**。§2-6) |
| `blocked` | 26 行 x 52 列の文字列配列 | `.` = 歩ける / `#` = 塞ぐ |

⭐ **`n7big` のテーマは `bandits-forest`(非屋外)**。だから空も丘も描かれず、絵がそのまま出る。
⭐ 焼きは `tools/make_grid_map.py --name bandit-hideout`(`tile: 48`。⚠ 64 は 2.10x の水増しで台帳が却下)。

### 2-3. 納品物の実測(⭐ そのまま `GRIDS` へ貼れる)

    py tools/make_grid_map.py --fit "C:/Users/PC_User/Desktop/codex1/maps/road-ambush-v1.png" --fit-around 48

出力:

    縦線: 周期 50.525px / 位相 42.05px / 整数マス 29 / score 3.787   ⚠ 素朴な割り算なら 32 (答えは 29)
    横線: 周期 49.635px / 位相 35.45px / 整数マス 19 / score 4.734   ⚠ 素朴な割り算なら 21 (答えは 19)

| 対象 | 実測値 | → 採用値 |
|---|---|---|
| 画像寸法 | 1536 x 1024 | — |
| 周期 | 50.525 x 49.635 px | — |
| 位相 | 42.05, 35.45 | そのまま |
| マス数 | **29 x 19** | そのまま(⛔ 32x21 と書かない) |
| 焼き倍率 | 48 / 50.525 = **0.950x**(縮小) | `tile: 48` |
| 異方性 | (50.525 − 49.635) / 50.08 = **1.78%** | 許容(盗賊アジト 2.05% / 廃坑 7.75% より小さい) |

**基準の再現も取れている**: 盗賊アジトは周期 30.515 x 31.140 → 異方性
(31.140 − 30.515) / 30.83 = **2.03%**(台帳のコメント「2.05%」と一致)。同じ式で本件は 1.78% = **より良い**。

⭐ **29 x 19 は DF の格子(`GRID_W=72` / `GRID_H=28`)に余裕で載る**(n7big の 52 x 26 より小さい)。

### 2-4. ⚠ 納品先とツールの読み先が食い違う(受け取り側で移す)

- `tools/make_grid_map.py:64` — `SRC_DIR = C:\Users\PC_User\Desktop\codex1\maps`
- 一方、自動投下ヘッダ §1 が「生成物はすべて `assets` 配下」を強制するので納品は `assets/maps/` に落ちる
- 既存の納品 7 枚(`盗賊団のアジト.png` / `harbor-town-rebuilding-player-v1.png` / … )は**全部 `maps/` にある**

⇒ **移し替えは受け取り側の作業**。⭐ **この 1 枚は起草窓が既に両方へ配置済み**
(md5 を 3 箇所で照合済み)。実装窓は `--fit` から始められる。

### 2-5. 焼き付けの出力先と検算

- `tools/make_grid_map.py:65` — `OUT_DIR = <repo>/assets`
- `:331` — `baked.save(out, "JPEG", quality=82, subsampling=0, optimize=True)`
  ⇒ 出力は **`assets/<out>.jpg`**(⛔ PNG ではない)
- 検算 3 指標(`verify()` が唯一の正。⛔ **閾値を勝手に緩めない**):

| 指標 | 許容 | 意味 |
|---|---|---|
| 累積ドリフト | 4.0 world-px | 反対端で焼き込み線と DF の線が何 px ずれるか |
| 位相ズレ | 2.0 world-px | 原点側のズレ。**全域に一様に効く** |
| score 比 | 70% 以上 | 「そもそも格子を捉えているか」の門番。**精度の物差しではない** |

### 2-6. ⭐ ゲートは要らない(n7big との違い)

`n7big` はボスノードなので `gates: { left: [0,14] }` を持つ。
**#52 の襲撃マップは 1 部屋で完結する**:

- クリア判定は「部屋踏破」ではなく **`waves` を持つ防衛戦の判定**(`index.html:18368`)
- #51 は `waves` を 1 件だけ載せる = **出口へ歩く必要がない**

⇒ `gates` は**書かない**。⛔ 書くと矢印と扉が出て「どこかへ行けそう」に見える。

### 2-7. ⚠ `paintingAspectFits` は縦横比の完全一致を要求する

`js/df-mapdef.js:2188`:

    var rw = rect[3] - rect[1] + 1, rh = rect[2] - rect[0] + 1;
    var bw = b[3] - b[1] + 1,       bh = b[2] - b[0] + 1;
    return rw * bh === rh * bw;

⇒ **`mapDef.rooms[0].rect` と `tileBounds` を同じ値にする**(n7big の注記と同じ)。

### 2-8. カスタム幾何で開くゲート(⚠ 3 つ同時に開く)

`index.html:4428-4440` が `MAPDEF.isCustom` の唯一の出所と明記している:

- 敵の岩盤退避(`rescueCustomSpawns`)
- **1 枚絵と情景の停止**(`loadRoomPaintings` / `generateScenery`)
- **`spawns` 空フォールバック禁止**

⭐ 絵を引くのは `index.html:5604-5625` の **mapDef 経路**:

    for (const room of MAPDEF.rooms) {
      const pg = room && room.painting;              // = { theme, key }
      const src = DFMapDef.paintingSrcFor(pg.theme, pg.key);
      addPainting(src, room.rect, blockedRowsOf(...), rawDef && rawDef.sealRing);
    }

⚠ 保存されているのは **src ではなく参照(theme + key)**。⛔ src を焼き込まない。

### 2-9. ⚠⚠⚠ 罠 B — 座標が全部動く(#51 の値は帯 row13-15 前提)

#51 が載せる盤面の値は、**歩行帯 3 行**を前提に決まっている:

| 値 | #51 の値 | なぜ動くか |
|---|---|---|
| `themeId` | `"caravan-road"` | 罠 A で非屋外テーマへ移る |
| `wagonSpawns` | `[{tx:9, ty:14}]` | ty:14 は「帯 13-15 の真ん中」。絵の rect 内へ移す |
| `spawns` | `[["goblin",14,13],…]` | 同上 |
| `start` | 全シナリオ共通の `(6,13)` | mapDef が `start` を持つので絵の中へ寄せる |

✅ **`AMBUSH_FIELD` は実在する**(#51 項目2 `74ebbbf` で着地。実装窓が実測報告)。
`js/road-events.js` に `themeId` / `wagonSpawns` / `spawns` / `waves` / `trapCount` /
`hiddenChestCount` を 1 オブジェクトで持ち、`window.ROAD_EVENTS` 経由で公開されている。
⭐ **world.html は座標も themeId も 1 つも知らない** ⇒ #52 は**このオブジェクト 1 つの差し替えで盤面が移る**。
⭐ `resolve()` 規則④(屋外テーマ × カスタム幾何の禁止)の注記コメントも既に添えられている。

### 2-10. 敵プールは非屋外テーマへ移すと変わる(⛔ 事故の芽)

`js/df-mapdef.js` の `THEME_DEFAULT_ENEMIES`:

    "bandits-forest": { mob: ["bandit","banditArcher","banditMage"], boss: "scar" }
    "caravan-road":   { mob: ["goblin","goblinArcher","hobgoblin"],  boss: "goblinRider" }

⚠ ただし**これは `enemySlots` の「おまかせ」を埋めるときだけ**使われる(`spawnsFromMapDef`)。
#51 は `spawns` と `waves` を**明示**するので、⭐ **敵の顔ぶれは変わらない**。
⛔ 「テーマを変えたら盗賊が出る」と早合点して `waves` を書き換えないこと。

### 2-11-A. ⚠⚠⚠ 装置を書くときの制約 2 つ(#51 の実装で判明・#52 でもそのまま効く)

⛔ **どちらも「回避しようとすると別の golden が赤くなる」型**なので、素直に従うこと。

1. ⚠⚠ **`__world` に観測窓を 1 つも足せない。**
   `verify_road_events` の (4b) が「**既存 25 + roadEvent = ちょうど 26 個**」を**集合で**固定しており、
   `roadAmbush()` を足した瞬間に赤くなった(#51 で実測)。
   ⇒ 観測は **`ROAD_EVENTS.open` の包み + sessionStorage の実体**だけで採る。
   ⭐ #52 も同じ縛りの中でマスクと絵を観測する(⛔ `__world` へ `paintingInfo()` 等を足さない)。
2. ⚠⚠ **`js/road-events.js` に `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` を 2 本目として書けない。**
   `verify_road_events` の変異 `seedignore` の**逐語アンカーが 2 ヒット**して**起動時検算 exit 3**。
   ⛔ 共通ヘルパへ畳んで 0 ヒットにしても同じく exit 3。**唯一の解は 2 行に割ること**。
   ⭐ #52 は乱数を新設しないので直接は当たらないが、`js/road-events.js` を触る以上**同じ罠の近く**にいる。

### 2-11-B. ⭐⭐⭐ 恒等 assert は「固定の基準列 + 挟み込み」で書く

#51 の (0d) で実証された形(実装窓の実測):

- 基準列 `BASE_RND` は **襲撃機能ゼロの木(`bdc6880`)で採取し、固定値としてドライバに持つ**。
  ⛔ 実装後に採り直すと「**自分と自分を比べる**」形になり**永久緑**
- 比較は **①素の列 ②`rnd×16 → ambRoll()×8 → rnd×16` の挟み込み ③配信バイトの `rnd(` が 0 件** の 3 レグ
- ⭐ 変異 `sharedrng` が赤にできたのは **②の挟み込みレグだけ**
  (boot 時点では 1 度も襲撃を振っていないので、素の列は無傷に見える)

⇒ **#52 の (9a)「7.9-3 が無傷」も同じ形で書く。**
7.9-3 側の観測値(`FIELD_MODE` / 帯マスクの効き)を **#51 着地時点の固定値**として持ち、
**#52 の機能を通した後**の値と挟み込みで比べる。⛔ 「両方 true だから緑」で済ませない。

### 2-11. ⚠ #51 の実装窓が装置側で踏んだ罠 2 件(#52 のドライバでも効く)

⭐ `tools/verify_road_ambush.js` は #51 が作る。**#52 はそこへ追記する**ので、この 2 件は継承される。

1. ⚠⚠ **`showResult` も `paint()` を通るので、結末画面でも `armAt` がリセットされる。**
   待たずに「先へ進む」を押すと弾かれ、**歩行がそこで止まる**。
   ⇒ 結末画面でも `ARM_MS` を待ってから押す。
2. ⚠ **`pier → swamp` の経路で `ambRoll` を消費する停留所は実測 2 つだけ。**
   `phlan` は**通りすがりの拠点**なので `isRoadSite` が落とし、`swamp` は**押した行き先**なので
   `onArriveNode` へ倒れる。⇒ 「経路上の停留所の数 = 振りの回数」と思って母集団を数えない。

### 2-12. changelog の要否

`scripts/hooks/check_changelog.py:24` を実読: `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`
⇒ **鳴る**(`index.html` の `ROOM_PAINTINGS_DEF` を触る)。プレイヤー向けの要約は実在する:
「街道の襲撃が、街道を描いた専用のマップの上で戦えるようになった。」

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/make_grid_map.py` | `GRIDS` へ `"road-ambush"` を 1 件追加(§2-3 の 6 数値をそのまま) |
| `assets/room_caravan-road_ambush.jpg` | 焼き付けの生成物(新規) |
| `index.html` | `ROOM_PAINTINGS_DEF` へ 1 エントリ追加(`bandits-forest` 配下 or 新テーマ。§4 で決める) |
| `js/road-events.js` | `AMBUSH_FIELD` を差し替え(themeId / mapDef / start / wagonSpawns / spawns) |
| `tools/verify_road_ambush.js` | #51 の装置へ §8 の assert を追記 |
| `tavern.html` | ⛔ **触らない**(7.9-3 は無傷) |
| `index.html` の `FIELD_THEMES` | ⛔ **触らない**(外すと 7.9-3 が壊れる) |

---

## 4. STEP1 — 貼り先のテーマを決める

⭐ 選択肢は 2 つ。**推奨は (A)**。

### (A) 既存テーマ `bandits-forest` の配下に置く【推奨】

- 新テーマゼロ。`n7big` と**完全に同じ経路**を通る(実績のある唯一の道)
- 絵は「昼の田園の街道 + 疎林 + 石橋」なので、森テーマの隣に置いて違和感がない
- ⚠ 絵の外側(rect の外)は森の床テクスチャになるが、`sealRing` で外周を塞ぐため
  カメラに入りにくい。⭐ n7big が既にそう振る舞っている

### (B) 新テーマ `caravan-road-map` を足す

- `SCENARIO_TEX` と `DFMapDef.THEMES` と `THEME_DEFAULT_ENEMIES` に 1 行ずつ(**3 箇所**)
- ⛔ `FIELD_THEMES` には**入れない**
- 利点 = 絵の外側も街道テクスチャになる / 欠点 = **穴を作ると `||` の既定へ落ちて廃坑の敵が出る**
  (`THEME_DEFAULT_ENEMIES` の注記が実際にそう警告している)

⛔ **(C) `FIELD_THEMES` から `caravan-road` を外す は不可**(7.9-3 が全損)。

---

## 5. STEP2 — 焼き付け

    py tools/make_grid_map.py --name road-ambush
    py tools/make_grid_map.py --check assets/room_caravan-road_ambush.jpg --tile 48

`GRIDS` へ足すエントリ(⭐ §2-3 の実測値そのまま。⛔ 数値を手で丸めない):

    "road-ambush": {
        "src":    "road-ambush-v1.png",
        "out":    "room_caravan-road_ambush",
        "desc":   "街道の襲撃 (東西の街道 + 停まった幌車 + 石橋と小川 + 路肩の乾式石積み)",
        "phase":  (42.05, 35.45),
        "period": (50.525, 49.635),
        "cells":  (29, 19),
        "tile":   48,        # 48/50.525 = 0.950x = 縮小。⛔ 64 にしない (1.27x の水増し)
        # 異方性 1.78% (盗賊アジト 2.03% / 廃坑 7.75% より小さい) = 矯正は目に見えない
    },

⚠ 検算が NG なら、**素材ではなく台帳の数値を疑う**(6 数値は `--fit` で測り直せる)。
⛔ 閾値を緩めない。

---

## 6. STEP3 — `ROOM_PAINTINGS_DEF` へ登録

    road_ambush: {
      src: "assets/room_caravan-road_ambush.jpg",
      tileBounds: [<r1>, <c1>, <r2>, <c2>],   // 19 行 x 29 列。⚠ 行が先
      sealRing: true,      // 外周 1 タイルを塞ぐ (歩ける「壁抜けの帯」を作らない)
      outdoor:  true,      // 昼の屋外 = 入った瞬間から地形全体が見える
      node:     false,     // ⛔ node:true にしない (n7big はノード用。#52 は mapDef 経路)
      blocked:  [ /* 19 行 x 29 列 */ ],
    },

**`tileBounds` の置き方**(19 行 x 29 列を `GRID_H=28` / `GRID_W=72` の中央へ):

- 行 `4 .. 22`(= 19 行。上に 4 行 / 下に 5 行の余白)
- 列 `21 .. 49`(= 29 列。左右に 21 / 22 列の余白)
- ⇒ `tileBounds: [4, 21, 22, 49]`。⚠ **`mapDef.rooms[0].rect` を同じ値にする**(§2-7)

⛔ **`gates` を書かない**(§2-6)。

---

## 7. STEP4 — `blocked` マスクを書く

1 文字 = 1 マス。**19 行 x 29 列**。`.` = 歩ける / `#` = 塞ぐ。作法は n7big と同じ:

1. **外周には `#` を書かない**(描画のフェザー帯)。外周は `sealRing` が別に塞ぐ
2. **平置きの物は塞がない** — 散らばった木箱・樽・穀物袋は跨げる
3. **小川は塞ぐ。石橋のマスだけ空ける** = 唯一の渡り
4. **街道(東西)は西端から東端まで 1 マスも切らさない**
5. 塞ぐのは北の疎林・南の露岩・路肩の石積みだけ
6. ⚠⚠ **連結の検査は必ず 4 近傍で**(本番の `aStar` は斜めを踏まない)

⚠⚠ **絵は半マスずれることがある**(港町の南橋は row 9 の下半分と row 10 の上半分にまたがっていた)。
⭐ 面積比では決まらない —— 決めるのは「**足元をタイル中心に置く**」という描画側の規則。

⭐ 起草時の目視所見(実装窓の出発点。⛔ 実測で上書きすること):

- 街道は画面の縦の中ほど、**高さ 4〜5 マス**ぶん
- 石橋は横方向のほぼ中央。小川はそこを南北に貫く
- 幌車は街道の**中央やや右**。周りの荷は平置き
- 北の樹林は上端 2〜3 行、南の露岩は下端 3〜4 行に集中

---

## 8. 受入条件 — `tools/verify_road_ambush.js`(#51 の装置へ追記)

### §6 絵が実際に出ている

- **(6a) 焼き上がりが配信されている** — `assets/room_caravan-road_ambush.jpg` が 200 で返り、
  **寸法が `29*48 x 19*48` = 1392 x 912** であること
- **(6b) 貼られている** — 襲撃の run で `addPainting` が **1 回**呼ばれ、
  貼り先の rect が `tileBounds` と**同じ値**であること(⭐ 2 経路で突き合わせる)
- **(6c) カスタム幾何として採用されている** — `MAPDEF.isCustom === true`
  ⛔ ⚠ **これが false なら絵は 1 枚も出ない**(§2-8)。**罠 A の本検査**
- **(6d) 空と丘が描かれていない** — `FIELD_MODE === false`(= themeId が屋外テーマでない)

### ⚠⚠⚠ §7 を書く前に読む — 「1 つも無い」型の assert は母集団 0 で自明に真になる

⭐⭐⭐ **#51 の実装窓が 2026-09-04 に実際に踏んだ**(依頼書 §4 の (0b) の予測が崩れた):

> (0b)「world.html の配信バイトに `AMBUSH` の文言が **1 つも出てこない**」は、
> **`AMBUSH` がまだ存在しない項目 1 の時点で自明に真**になる。
> 「写経していないので緑」ではなく **赤が正しい**(母集団が立っていない)。

⇒ **#48 の則**(母集団が立たなければ FAIL。skip で緑にしない)に従い、assert は緩めず
**予測のほうを訂正した**。

**#52 の §7 は同じ形をしている。** 次の 2 本は `blocked` が空・欠損のとき**自明に真**になる:

- **(7d)** 外周に `#` が無い
- **(7c)** 孤立ゼロ(歩けるマスが 0 件なら「全部到達可能」は真)

⇒ ⛔ **(7a)〜(7d) はすべて (7e)(寸法一致)を AND で内包して書く。**
⭐ さらに「歩けるマスが **N 件以上**」「街道行の候補が **1 行以上**」を母集団ガードとして足す。
⚠ 変異 `maskshort` が (7e) だけを赤にして (7c)(7d) が緑のまま残ったら、**その書き方が誤り**。

### §7 マスクが通っている

- **(7a) 街道が東西に貫通している** — `blocked` を **4 近傍 BFS** で舐め、
  西端の街道行から東端の街道行へ到達できる
- **(7b) 橋が唯一の渡り** — 橋のマスを `#` に置き換えると南北が**分断される**
  (⭐ 「橋が唯一の渡りである」ことの機械的証明)
- **(7c) 孤立ゼロ** — 歩けるマスが全部、起点から 4 近傍で到達可能
- **(7d) 外周に `#` が無い** — マスクの外周は全部 `.`(塞ぐのは `sealRing` の仕事)
- **(7e) 寸法一致** — `blocked` の行数 = 19、各行の桁数 = 29(⛔ 1 行でも違えば赤)

### §9 恒等(非退行)

- **(9a) 7.9-3 が無傷** — ポドルプラザの隊商護衛で `FIELD_MODE === true` かつ
  帯マスクが従来どおり効く(⭐ **罠 A で `FIELD_THEMES` を触っていないことの証明**)
- **(9b) #51 の §1〜§5 が全部緑のまま**(座標を動かしても導線は変わらない)

### §10 撤退

- **(10a)** `?ambush=0` → 従来どおり襲撃が出ない
- **(10b)** `?mapdef=0` → **絵が消えて従来の幾何へ戻る**(⛔ クラッシュしない)

### ⛔ 測らないこと

- **絵の見た目**(色・密度・トンマナ)— 目視の領分
- **`blocked` の 1 マスずつの正しさ** — 縛るのは連結性と寸法だけ
- **`tileBounds` の具体的な置き場所**(4,21,22,49)— 中央寄せは好みで動かせる

### 負のコントロール(`--negative` へ追記)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `fieldtheme` | ⭐ **罠 A の再現**: themeId を `caravan-road` に戻す | (6c)(6d) |
| `fieldset` | ⭐ **罠 A の裏**: `FIELD_THEMES` から `caravan-road` を外す | (9a) |
| `aspectskew` | `rect` と `tileBounds` を食い違わせる | (6b) |
| `bridgefill` | 橋のマスを `#` にする | (7a)(7b) |
| `roadcut` | 街道の 1 マスを `#` にする | (7a) |
| `ringmark` | マスクの外周に `#` を書く | (7d) |
| `maskshort` | `blocked` を 1 行削る | (7e) |
| `srcbake` | `painting` に theme+key ではなく src を焼き込む | (6b) |
| `nosealring` | `sealRing` を外す | (7c) |
| `gateadd` | `gates` を足す | (6b) |

⭐ **`fieldtheme` と `fieldset` の 2 本で罠 A を両側から挟む**
(「屋外テーマにすると絵が出ない」と「屋外テーマを外すと 7.9-3 が壊れる」)。

### 既存 golden の非退行

⛔ **本数は着手時に数え直す**。⛔ **並走させず 1 本ずつ逐次**。

    grep -l "world\.html" tools/*.js | wc -l

⭐ **2026-09-04 に #51 の実装窓が実測 = 14 本**(#51 依頼書 §2-12 の「13 本」から
`verify_world_heromark` が 1 本増えていた)。**「毎回数え直す」則がまた 1 回効いた実例**。
⛔ この 14 という数字も信じず、着手時にもう一度回すこと。

上記 14 本に加えて、絵と幾何を触るので次も見る:
`driver_mapdef_step1` / `driver_graph_p7` / `driver_field_step7` / `verify_road_ambush`

⚠ **`driver_mapdef_step1` の golden 8 件のうち `caravan-road`(横持ち/帯マスクなし)だけが
特殊な扱い**(`index.html:8325` が明記)。ここは特に注意して見る。
⭐ **`verify_player_sheet` は解消済み** — #48 の着地により **73/73 / FAILED 0**(#51 の実装窓が実測)。
⛔ **非退行の基準は「FAILED 0」**。⚠ #47〜#51 の依頼書に残っている
「FAILED 4 本 `{(2c)(2d)(8a)(8f)}` が着手前から赤」という記述は**もう古い**。写経しないこと。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**。

1. iPhone 縦(390x844)で、29 x 19 マスの絵が「戦場」として読めるか(カメラの寄りは適切か)
2. 幌車のスプライトが**絵に描かれた幌車と二重にならない**か
   (⭐ 発注文で「人・馬・モンスターを描かない」は指定したが、**幌車は絵にある**。
   `wagonSpawns` の位置を絵の幌車に**重ねる**か、**別の位置**にするかは実機で決める)
3. 焚火演出(`campfireSpot`)が絵の上で浮かないか。⛔ 浮くなら**この絵では出さない**
4. 石橋・小川・路肩の石積みが「通れる/通れない」と**見た目どおり**に感じられるか
5. 昼の明るさ(`outdoor: true`)で敵の視認性が落ちていないか

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>街道の襲撃に専用の戦場が付いた</b> — 停まった幌車と石橋のある街道の地図の上で戦えるようになった。"

---

## 11. やらないこと

- ⛔ **`FIELD_THEMES` から `caravan-road` を外す**(7.9-3 が全損)
- ⛔ **7.9-3「隊商護衛」に絵を付ける** — 別チケット。あちらは屋外テーマのままなので
  §2-1 の禁止に当たり、**そもそも同じ手では付けられない**
- ⛔ **絵を描き直す / codex へ再発注する** — この 1 枚を採用する判断は済んでいる
- ⛔ **`#51` の受入条件を書き換える**(§8 は「⛔ 測らないこと」に敵の構成と座標を入れてある)
- ⛔ **分岐グラフ(`run`)を足す** — 1 部屋で完結する設計(§2-6)
- ⛔ **`progress.cleared` の混入を直す**(**#53 候補**)— #51 の実装窓が発見した残課題:
  勝利すると `lastResult.scenarioId = "road-ambush"` が `tavern.html:5058` のガードを通って
  `progress.cleared` に載り、闇市の `plazaStateTV.totalQuestsCleared` が **+1** される。
  解放判定は `has("<既定6シナリオ>")` しか読まないので**実害は無い**が、#51 §6-1 の
  「⛔ `progress.cleared` に載る経路へ流さない」とは食い違っている。
  ⛔ `tavern.html` は #52 でも**触らない**(7.9-3 の禁止と同じ理由)。別チケットで扱う。
- ✅ **`実装依頼書/README.md` の #52 行は追加済み**(2026-09-04 の承認時に、隣窓が README.md へ
  手を付ける前の無競合な瞬間を実測で確認してから足した)。⛔ 実装窓は**行を作り直さず**、
  既存行のステータスと進行度を更新する。

---

## 12. 実装結果

**実装日**: 2026-09-05(実装窓) / **非退行の基準 hash**: `c0a9134`(#53 起草のコミット。
起草時の想定 `86069f9` から 1 本進んでいた — 隣窓が #53 の依頼書をコミットしたため)

### 12-0. 着手時に測り直した母集団

| 対象 | 依頼書の記載 | **実測(2026-09-05)** |
|---|---|---|
| `grep -l "world\.html" tools/*.js` | 14 本 | **15 本**(`verify_ability_scores.js` が増えていた) |
| `AMBUSH_FIELD` の実在 | 「実在する」 | ✅ `js/road-events.js:419`。`themeId` / `wagonSpawns` / `spawns` / `waves` / `trapCount` / `hiddenChestCount` / `clearXp` / `clearGold` の 8 キー |
| 素材の 6 数値(`--fit`) | phase (42.05,35.45) / period (50.525,49.635) / cells (29,19) | ✅ **1 桁も違わず再現**(md5 `9c5435d432b02353a27fd547690373ae`) |
| `git diff --stat 86069f9..HEAD -- index.html js/road-events.js js/df-mapdef.js` | — | **差分 0**(#51 着地から本番 3 ファイルは 1 バイトも動いていない) |

⭐ 「毎回数え直す」則が**また 1 回効いた**(14 → 15)。

### 12-1. ⚠⚠⚠ 依頼書の主張が実測で崩れた点(6 件)

⛔ どれも **assert を緩めず、予測のほうを訂正**した。

| # | 依頼書の主張 | 実測 | 対処 |
|---|---|---|---|
| ① | **§6 のひな型が `node: false`**(「⛔ node:true にしない」と明記) | ⭐⭐⭐ **逆で、`node: true` が必須**。`index.html:5630` の**従来経路**(非カスタム幾何)は `ROOM_PAINTINGS_DEF[_scenIdForTex]` を `Object.values` で舐めて `def.node` を持たない絵を**全部貼る**。`node:false` だと `?graph=0` や分岐 lint 落ちで `RUN=null` になったシナリオ 2(森)の単一マップへ**街道の絵が貼られる**。一方 **mapDef 経路(`:5645`)は `node` を見ない**(`paintingSrcFor(theme,key)` で直に引く)ので #52 には 1 命令も影響しない | `node: true` を付けた。(10b) が `?mapdef=0` で「街道の絵は貼られず、森の山場/ボスの絵に置き換わる」ことを機械で見ている |
| ② | **§8 (7b) 「橋のマスを `#` にすると南北が分断される」** | ⭐ **東西**が正しい。小川は**南北に流れる**ので、橋は東西を繋いでいる。実測 = 橋の 4 マスを塞ぐと **228 / 123** の 2 成分に割れる(南北ではない) | assert の文言を「2 つ以上に割れる」へ一般化。⛔ 判定は緩めていない |
| ③ | **§8 (10a) の含意「撤退なら卓上マップが載らない」を `isCustom` で見る** | ⚠⚠ **撤退の対照ランは廃坑で、廃坑は分岐グラフのノード `mapDef` を持つので `isCustom` は元から `true`**(`index.html:4598` の `RUN ? { mapDef: RUN.byId[entry].mapDef } : …`)。`isCustom` では締められない | テーマと `scenarioId` で締め、`isCustom` は**記録**へ落とした(⛔ 判定に使わない) |
| ④ | **負のコントロール `nosealring` → (7c) が赤くなる** | ⚠ **そのままでは空振りする**。`sealRing` を外しても孤立は 1 つも生まれない(外周が歩けるようになるだけで連結性は変わらない)。実測 = 歩けるマス 355 → **443**、`ring` 88 → **0**、孤立は前後とも 0 | (7c) に「**外周封鎖が効いている(`__paintBlockProbe().ring > 0`)**」を AND した。これで `nosealring` が赤になる(実走で確認) |
| ⑤ | **§8 (6a) 「寸法が `29*48 x 19*48` = 1392 x 912 であること」** | ⭐ 数値の直書きは**台帳(`make_grid_map.py`)の写経**になる(台帳が間違っていたら両方同じ誤りで緑) | 「**配信された JPEG の寸法が、本番から引いたマスクの桁数 x 行数の整数倍で、縦横とも同じ倍率**」へ書き換えた。実測 1392x912 / マスク 29x19 → **1 マス 48x48px** |
| ⑥ | **§8 の変異表は 20 行**(`(n9b)` が本数を固定) | #52 の 10 本を足すと **30 行**になる | `(n9b)` を 30 へ更新。⛔ 本数を減らして通さない |

### 12-2. 実装で判明した制約(依頼書に無かったもの・3 件)

1. ⚠⚠ **馬車 (`caravanWagon`) は displaySize 240 = 3x3 タイルを占める**。`findSafeFootprintTile` が
   3x3 とも非壁でないと**勝手に移設する**ので、中心に置けるのは「rows 8-10 が 3 行とも
   空いている列」= **絵ローカル col 15-20 だけ**(実測)。col 12-13 は南の石積みが row10 を
   走るので footprint が欠ける。⇒ 幌車は絵ローカル **(15,9) = global (36,13)**。
   ⭐ 描かれた幌車(ローカル col 16-19)の**西隣**に置き、2 台目の荷車として読ませる。
2. ⭐ **`campfireSpot` はテーマ移設で自然に消える**。`index.html:10516` / `:33970` が
   `_scenIdForTex === "caravan-road"` のときだけ焚火を置くので、`bandits-forest` へ移した
   街道の襲撃では出なくなる(絵に焚火は描かれていないのでこれが正しい)。
   ⭐ 7.9-3 は themeId が `caravan-road` のままなので**従来どおり出る**。
3. ⚠ **障壁の列の導出は外周寄り 2 列を除かないと誤検出する**。初版は「塞がれた割合 60% 以上の
   列」を小川とみなしたが、**東端の樹林帯(col 27)まで拾って**連結成分が `[222,123,1]` と
   3 つに割れた。⇒ `2 <= c <= W-3` に限定して `[9,10]` へ収束した。

### 12-3. テーマ名を 1 変数へ寄せた(`AMBUSH_THEME`)

罠 A は「積荷側の `themeId`(= `FIELD_MODE`)」と「`mapDef.themeId`(= `resolve()` 規則④)」の
**2 箇所**に効く。片方だけ屋外にすると壊れ方が変わる:

- 積荷側だけ屋外 → `FIELD_MODE=true` のまま卓上マップが載り、**空と丘が絵の上に描かれる**
- mapDef 側だけ屋外 → `resolve()` が既定幾何へ落とし、**絵が 1 枚も出ない**

⇒ `js/road-events.js` に `var AMBUSH_THEME = "bandits-forest";` を置き、2 箇所ともこれを引く。
⭐ おかげで負のコントロール `fieldtheme` が **1 行の逐語置換**で両側同時に倒せる。

### 12-4. 盤面の実測値(本番から採った値)

| 項目 | 値 |
|---|---|
| 焼き上がり | `assets/room_caravan-road_ambush.jpg` **1392 x 912**(1 マス 48px / 0.46 MB) |
| 焼きの検算 | 縦 ドリフト **2.78** / 位相 **1.00** / score比 **94.7%** — 横 ドリフト **0.00** / 位相 **1.00** / score比 **100.0%**(すべて許容内) |
| 貼り先 | `tileBounds` = `rooms[0].rect` = **[4, 21, 22, 49]**(19 行 x 29 列) |
| テーマ | `themeId` = `bandits-forest` / `FIELD_MODE` = **false** / `isCustom` = **true** |
| マスク | 塞いだマス **196**(うち外周 `sealRing` が **88**、出口として除外 4) |
| 歩けるマス | **355**(= 起点から 4 近傍で到達 355 = **孤立ゼロ**) |
| 街道の通し行 | 絵ローカル **row 9** のみ(= global ty 13) |
| 橋 | 絵ローカル col 9-10 x rows 8-9 の **4 マス**。塞ぐと **228 / 123** の 2 成分に割れる |
| 起点 | global **(26, 13)** = 絵ローカル (5, 9) |
| 幌車 | global **(36, 13)** = 絵ローカル (15, 9)。`outcome: "asis"`(移設なし) |
| 敵 | `goblin (39,14)` / `goblinArcher (41,12)` / `goblin (40,13)` — **3 体とも非壁** |
| `?mapdef=0` | `isCustom=false` / `mapDef.id="df-default-dungeon"` / 貼られる絵は森の `1_bs.jpg` と `2.png` / **pageerror 0 件** |

### 12-5. (9a) の基準列をどこから採ったか

⭐ **#52 を 1 バイトも適用していない木(`c0a9134`)を実ブラウザで走らせて採った**
(⛔ 実装後に採ると「自分と自分を比べる」形になり永久緑。#51 (0d) で実証済みの型):

    { theme: "caravan-road", fieldMode: true, isFieldTheme: true, isCustom: false,
      mapdefId: "df-default-field", bandMask: true,
      openRows: "13:67 14:67 15:67", wagons: 1 }

比較は **固定基準列との一致 + 挟み込み**(`idxEscort` → `board`(#52 の機能) → `idxEscortPost`)の 2 段。
⭐ 変異 `fieldset`(`FIELD_THEMES` から `caravan-road` を外す)を当てると、この 8 項目のうち
**5 項目が同時に化ける**(`fieldMode` false / `isFieldTheme` false / `mapdefId` `df-default-dungeon` /
`bandMask` false / `openRows` が row5-22 の 18 行へ)= 罠 A の裏が確かに 7.9-3 を壊すことの実証。

### 12-6. 装置の結果 / 非退行

**#52 の装置**(すべて 2026-09-05 実測):

| 実行 | 結果 |
|---|---|
| `node tools/verify_road_ambush.js`(素) | **41/41 PASSED / FAILED 0 / PENDING 0**(#51 の 28 本 + #52 の 13 本) |
| `node tools/verify_road_ambush.js --negative` | **97/97 PASSED / FAILED 0 / PENDING 0**(変異 **30 本**とも空振り 0。`(n9a)`(実装漏れ 0)/`(n9b)`(表 30 行)が機械確認) |

#52 が足した節と負のコントロールの対応(**10 本とも担当節を実際に赤にした**):

| 変異 | 赤くなった節 | 実測の中身 |
|---|---|---|
| `fieldtheme` | (6c)(6d) | `isCustom=false` / `mapDef.id="df-default-field"` / `FIELD_MODE=true` / `bandMask=true` = **罠 A の再現** |
| `fieldset` | (9a) | 7.9-3 が `mapdefId="df-default-dungeon"` / `bandMask=false` / `openRows` が 3 行 → **18 行**へ = **罠 A の裏** |
| `aspectskew` | (6b) | 貼り先 `[4,21,22,48]` ≠ tileBounds `[4,21,22,49]` |
| `bridgefill` | (7a)(7b) | 通し行 **0 行** / 素の連結成分が最初から `[228,123]` |
| `roadcut` | (7a) | 通し行 **0 行**(歩けるマスは 354 = 1 マスしか減っていないのに捕まる) |
| `ringmark` | (7d) | 外周の `#` **2 件** |
| `maskshort` | (7e) | `blocked[18] の桁数 28 が tileBounds の幅 29 と違います` → マスクが丸ごと捨てられ、塞いだマスが 196 → **88**(sealRing だけ) |
| `srcbake` | (6b) | 絵 **0 枚** / `painting=null` |
| `nosealring` | (7c) | 歩けるマス 355 → **443** / `ring` 88 → **0** |
| `gateadd` | (6b) | `gates=["left"]` |

⭐ `maskshort` が (7e) だけでなく (7a)〜(7d) も同時に赤にすることを確認した = **依頼書 §8 の
「(7a)〜(7d) は (7e) を AND で内包せよ」が実際に効いている**(母集団ガード無しなら
(7c)(7d) は緑のまま残っていた)。

**既存 golden(⛔ 並走させず 1 本ずつ逐次。期待値の変更 0 件)**:

| ドライバ | 結果 | ドライバ | 結果 |
|---|---|---|---|
| `verify_ability_scores` | 24/24 | `verify_road_events` | 25/25 |
| `verify_darkvision` | 25/25 | `verify_run_chronicle` | 73/73 |
| `verify_mercenary_roster` | 44/44 | `verify_title_screen` | 86/86 |
| `verify_player_sheet` | **73/73 FAILED 0** | `verify_town_exit` | 素 23/23 |
| `verify_quest_walk` | 25/25 | `verify_world_heromark` | 18/18 |
| `verify_recruit_size` | 82/82 | `verify_world_map` | 57/57 |
| `verify_road_boon` | 20/20 | `verify_world_steps` | 33/33 |

絵と幾何を触るので追加で見たもの:

| ドライバ | 結果 |
|---|---|
| `driver_mapdef_step1` | **208/208 PASS**(⭐ golden 8 件の mapCanvas SHA が 8 通りとも不変 = `caravan-road` の特殊扱いも無傷) |
| `driver_graph_p7` | **60/60 PASS** |
| `driver_field_step7` | **79/79 PASS** |
| `driver_paint_blocked`(既定 = goblin-mine) | **65/65 PASS** |
| `driver_paint_blocked --stage bandits-forest` | **62 PASS / FAIL 3** ⚠ ただし**#52 の責任ではない**(下記) |

⚠⚠ **`driver_paint_blocked --stage bandits-forest` の赤 3 件は着手前から赤だった。**
⛔ 「たぶん既存」で済ませず、**`c0a9134`(#52 を 1 バイトも適用していない木)を一時 worktree に
展開して同じコマンドを走らせ、62 PASS / FAIL 3 が完全に同一であることを実測した**:

- `(4a)` 現行のマスクが門前ガードに触れている(`spawn=1`)
- `(8a)` グラフの組み直しが `n=1/1 entry=n7 boss=n7`(森は `S2_FOLDED` で 1 ノードへ畳まれている)
- `(8d)` ノードに貼られた絵が `bandits-forest/n7big` で、判定式 `/\/n\d+$/` に当たらない

⭐ **これは #53 の依頼書 §2 が予告していた既存の齟齬そのもの**(`--stage` の既定が
`goblin-mine` なので今日まで誰も踏んでいなかった)。#53 が「赤を実見してから直す」と
決めている箇所なので、**#52 では 1 バイトも触っていない**。

⚠ なお `driver_mapdef_step1` は **前回実行が残した壊れた baseline worktree**
(`%TEMP%/df_mapdef1_baseline`。`index.html` が消えていて再利用判定を通らず、
`worktree add` が「既に在る」で落ちる)のせいで起動できなかった。⭐ ドライバ自身の
復旧枝と同じ `git worktree remove --force` で解消(#52 の変更とは無関係)。

### 12-7. 残課題(未対処)

- **実機体感 5 件**(§9 の 1〜5)。特に **② 幌車のスプライトが絵の幌車と二重に見えないか** —
  絵の幌車はローカル col 16-19、スプライトは col 15 中心で幅 2.1 タイル(col 14-16)なので
  **col 16 で 1 マスだけ重なる**。実機で「2 台の荷車」に見えるかを確認する。
- **`progress.cleared` の混入**(#51 §12-4 の残課題)は **#52 でも未対処**。`tavern.html` が
  禁止ファイルなので手を付けていない。別チケットの担当。
