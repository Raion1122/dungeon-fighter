# #41 銀の鹿亭と港町フランに人を置く — NPC 群衆 v1

- **起草**: 2026-09-01(計画窓) / **ステータス**: **承認済**(2026-09-02 ユーザー承認)
- **着手**: ⏸ **保留 — #40 の実装完了の通知を待つ**(2026-09-02 ユーザー判断)。
  ⚠ 起草後に状況が変わった点(2026-09-02 実測):
  - `HEAD` が `bb32beb` → **`b731644`** へ進んだ(#40 の項目 1 `b42f904` / 項目 2 `b731644` が着地)。
    → **§2-9 の golden 5 本は着手時に全部測り直す**(記録は `bb32beb` 時点の値)。
  - #40 は **項目 3 が `[>] active` のまま止まっており**、作業ツリーに未コミット差分が残っている:
    `world.html` +92 / `tools/verify_quest_walk.js` +62 / `tools/verify_world_map.js` +34 /
    `実装依頼書/README.md` +1。⛔ **これらは #40 のもの。1 バイトも触らない。**
  - ⭐ **#40 の完了通知を受けてから着手する。** それまで本チケットのファイルも作らない。
- **触るファイル**: `js/npc-crowd.js`(新規) / `tavern.html` / `town.html` / `tools/verify_npc_crowd.js`(新規)
- ⚠ **番号は #41 で確定**(2026-09-01 に実測して繰り下げた)。起草時は #40 を仮置きしていたが、
  **別窓の `2026-09-01_world-walk-steps.md` が先に #40 を取って承認済・実装中**になったため。
  相手の依頼書も「相手(=本チケット)は #41 へ繰り下がる」と明記している。
- ⛔ **触らないファイル**(⚠ **別窓が #40 を実装中**。2026-09-01 実測):
  `js/world-map.js` / `world.html` / `tools/verify_world_map.js` / `tools/verify_quest_walk.js`
  / `index.html` / `title.html` / `js/town-map.js` / `js/tavern-map.js`
  — 前半 4 つは **#40 の作業ツリーに差分が出る**ファイル。本チケットは**これらを一度も開かずに
  完了できる**(§2-5 / §2-6 / §2-9 で確認済み。`verify_quest_walk.js` は**走らせるだけ**で編集しない)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
  ⚠⚠ **ファイル単位 add でも「相手が同じファイルを add する」事故は防げない**
  → 唯一ぶつかる `実装依頼書/README.md` は §11 の手順に従う。
  ⚠ 相手が編集中のファイルを測るときは `git show HEAD:<path>` で見る(作業ツリーだと偽の赤が出る)。

---

## 1. 目的

酒場と街の地図は**歩けるようになった**(#25 / #12)が、**動いている人間が主人公ただ 1 人**しかいない。
円卓は 3 つ並んでいるのに誰も座っておらず、カウンターの中も無人、市場の露店には売り子が居らず、
桟橋にも漁師が居ない。「復興半ばの交易都市」という設定に対して画面が無人で、
プレイヤーの体感は「誰も居ない書き割り」になっている。

本チケットは、**酒場と街に人を置いて生活音のする場所にする**。

**ユーザー決定(2026-09-01)**:

- **スプライト** = 「**器を先に作り、町人は Codex へ発注**」。
  - STEP1〜3 で配置の器と検証を**既存 13 枚だけで完成**させる(酒場はこれで完成する)。
  - STEP4 で codex1 へ町人 6 種を発注する。納品後は `js/npc-crowd.js` の `sprite:` を差し替えるだけ。
  - ⭐ 不採用: **旧 chibi 18 枚の流用**。assets/ に眠っていて本番参照 0 件なのでタダで使えるが、
    実測で体高が 58.4px → 64.1px (**+9.8%**)、非透明画素が 1.4〜2.0 倍で**頭身がはっきり低い**
    (§2-2)。酒場は 1 マス 96px = **等倍表示**なので差がそのまま見える。
  - ⭐ 不採用: **現行 13 枚だけで完結**。街に立つのが全員「冒険者か荷運び」になり、
    露店主も漁師も石工も居ない街になる。
- **話しかけ** = 「**クリックで一言の吹き出しが出る**」。
  - ⚠ これを選んだので §2-3 の罠が生きる。**受入条件で機械検査する**。
  - ⭐ 不採用: 装飾のみ(`pointer-events:none`)。既存 golden 4 本に構造的に無害だったが、
    「生きている感じ」が出ないとユーザーが判断した。
- **動き** = 「**定点 + 少数が通りを往復**」。
  - 定点 NPC は**歩けないタイルにしか立てない**(マスクを 1 文字も変えない)。
  - 巡回 NPC は歩けるタイルを 2 点間で往復し、**主人公とすり抜ける**。
    ⭐ これは `js/town-map.js` の作法 ③「迷ったら塞がない。すり抜けは見た目の粗だが、
    塞ぎすぎは詰みを生む」と**同じ判断**であり、新しい方針ではない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 今、地図の上で動いているもの

| ページ | 可動要素 | 出所 |
|---|---|---|
| `tavern.html` | `#tavernHero` **1 体だけ** | `tavern.html` `initTavernMap()` の `placeHero()` |
| `town.html` | `#townHero` **1 体だけ** (+ `#townHeroMark` の ▽) | `town.html` `placeHero()` |

`#tavernStage` の子は **4 つ**(`#tavernMapImg` / `#tavernGoal` / `#tavernHeroShadow` / `#tavernHero`。
`tavern.html:2643-2649` を実読)。`#townStage` の子は **4 つ**
(`#townGoal` / `#townHeroShadow` / `#townHero` / `#townHeroMark`。`town.html:296-302` を実読)。
札は JS が実行時に `elStage.appendChild()` で足している。

### 2-2. 使える歩行シートの棚卸し(⚠ 「町人」は 1 枚も無い)

`assets/*_walk.png` を全部開いて実測した。**19 枚すべて 576x384 = 6 コマ x 4 行**だが、
**中身は row 3 (右向き) の 1 行だけ**で row 0〜2 は完全に空。

    $ py -c "from PIL import Image; ... 各行の非透明画素数 ..."
    warrior_walk             [0, 0, 0, 6274]
    warrior_npcfemale_walk   [0, 0, 0, 5002]
    ...(19 枚すべて同じ形)

⭐⭐⭐ **したがって「静止コマ」も「上下向き」も 1 枚も存在しない。**
立ち姿は歩行 6 コマのどれかを止めて使うしかなく、左向きは `scaleX(-1)` しかない。
⛔ 「NPC は正面を向いて座る」「上を向いて歩く」といった設計は**素材が無いので採れない**。

**本番から参照されている 13 枚**(`grep -o '<name>_walk' index.html tavern.html town.html title.html world.html` で実測):

| 用途 | シート |
|---|---|
| 主人公 6 職 | `warrior` / `dwarf` / `cleric` / `mage` / `elf` / `rogue` |
| NPC 変種 6 (codex1) | `warrior_npcfemale` / `dwarf_warrior` / `cleric_npcmale` / `mage_wizard` / `elf_male` / `rogue_male` |
| 荷運びの男 | `servant` |

⚠ 表の出所は `tavern.html:7203` の `PARTY_PORTRAIT_SPRITES` と `index.html:15301` の
`SPRITE_VARIANTS`。この 2 つは**既に二重定義で要同期**とコメントに明記されている
(`tavern.html:7200`)。⛔ **本チケットで 3 つ目の写しを作らない** — `js/npc-crowd.js` は
**自分が使うパスだけ**を持ち、既存 2 表には手を触れない。

**本番参照 0 件の旧 chibi 18 枚**(全部 `grep` で 0 を確認):

    warrior_{heavy,female,knight} / dwarf_{berserker,shield,rune} / cleric_{elder,priestess,war}
    mage_{old,crimson,dark}       / elf_{high,huntress,shadow}    / rogue_{acrobat,assassin,scout}

⚠ **タダで使えるが画風が違う**(実測):

| 群 | 体高 bbox max の平均 | 非透明画素 |
|---|---|---|
| 現行 (codex1) 13 枚 | **58.4 px** | 4,600〜7,800 |
| 旧 chibi 18 枚 | **64.1 px** (+9.8%) | 6,900〜9,900 |

⭐ 目視でも「codex1 = 細身で頭身が高い / 旧 chibi = ずんぐりした 3〜4 頭身」ではっきり割れる。
→ ユーザー決定により**使わない**。⛔ 実装窓が「素材があるから」と流用しないこと。

**再測定コマンド**:

    py -c "from PIL import Image; im=Image.open('assets/warrior_walk.png').convert('RGBA'); a=im.split()[3]; print([sum(1 for p in a.crop((0,r*96,576,(r+1)*96)).getdata() if p>8) for r in range(4)])"

### 2-3. ⚠⚠⚠ 罠 A — **既存 golden 4 本が「札の中心の elementFromPoint が自分自身」を測っている**

`grep -n "elementFromPoint" tools/*.js` の実測:

| ドライバ | 行 | 何を測っているか |
|---|---|---|
| `tools/verify_town_map.js` | 667 | 酒場の `#townExit` の中心で拾われるのが自分自身か |
| `tools/verify_tavern_map.js` | 631 / 1210 | **(2a)** 席札 3 枚の中心の elementFromPoint が自分自身 |
| `tools/driver_heromark_signplate.js` | 372 | **(B3)** 札の中心の elementFromPoint が自分自身か子孫 |
| `tools/verify_quest_walk.js` | 1393 | **(3e)** 7 枚の札の中心の elementFromPoint が自分自身か子孫 |

**NPC は 96px のスプライトを足元タイル中心に置く**ので、矩形は
`[cx-48, cy-89.28] 〜 [cx+48, cy+6.72]` (SPRITE=96 / FOOT=0.93 は `tavern.html:8477`・
`town.html:373` の実値)。**街は TILE 64 なので 1 人が縦 1.4 タイル分**を占める。
これが札に重なると、**上の 4 本のうち該当するものが赤くなる**。

**札の実寸をステージ px で実測した**(使い捨てプローブを puppeteer-core で走らせた。desktop 1440 / compact 390 の両方):

| ページ | 札 | ステージ中心 | 最大寸法 | 矩形 |
|---|---|---|---|---|
| 酒場 | `questTable_goblin-mine` | (432,144) | 128 x 49.6 | x 368..496 / y 119..169 |
| 酒場 | `questTable_bandits-forest` | (432,528) | 128 x 49.6 | x 368..496 / y 503..553 |
| 酒場 | `questTable_lizard-swamp` | (912,336) | 128 x 49.6 | x 848..976 / y 311..361 |
| 酒場 | `tavernDoor_town` | (720,720) | 138 x 48.3 | x 651..789 / y 696..744 |
| 酒場 | `tavernDoor_back` | (1296,336) | 162 x 48.3 | x 1215..1377 / y 312..360 |
| 街 | `townSign_tavern` | (672,96) | **242** x 54.1 | x 551..793 / y 69..123 |
| 街 | `townSign_shop` | (992,96) | 190 x 54.1 | x 897..1087 / y 69..123 |
| 街 | `townSign_gate` | (352,160) | **242** x 54.1 | x 231..473 / y 133..187 |

⚠⚠ **街の札は 242px 幅 = 3.8 タイル分**。「タイルが違うから大丈夫」は通らない。
⚠ 闇市の札(酒場 `tavernDoor_plaza` / 街 `townSign_plaza`)は**未解禁だと DOM に作られない**ので
上表に出ていない。解禁後の中心は 酒場 (240,816) / 街 (160,672)。**この 2 枚も避けること**。
⚠ 酒場の札は compact で幅が縮む(128 → 55〜73)が、**desktop の広い方**で判定すれば両方を満たす。

**この罠は実際に牙を剥いた。** 初稿で置いた候補のうち **5 件が実測で潰れた**:

| 初稿の候補 | 実測結果 |
|---|---|
| 酒場 `keeper` (11,1) | ⛔ カウンター内側で 4 近傍がすべて塞がっている(可視条件で弾かれた → **2 マス以内**へ緩和して復活) |
| 酒場 `patronA` (3,2) | ⛔ `questTable_goblin-mine` (x 368..496 / y 119..169) と 22 x 17 px 交差 → **(3,3) へ** |
| 酒場 `patronC` (9,4) | ⛔ `questTable_lizard-swamp` と交差。(10,4) へ逃がしても**まだ交差** → **(9,5) へ** |
| 街 `guardBridge` (11,2) | ⛔ `townSign_tavern` の 242px 幅と交差。dx を最大の +32 まで振っても足りない → **削除して巡回へ振り替え** |
| 酒場 `server` 巡回 (8,3)⇄(8,6) | ⛔ **経路上の (8,3) が** `questTable_lizard-swamp` と交差 → **(7,3)⇄(7,6) へ** |

⭐⭐⭐ **巡回 NPC は「端点」ではなく「経路上の全マス」で札との交差を見ないと取りこぼす。**
→ §8 の負のコントロール `oversign` / `strollsign` で機械化する。

### 2-4. 配置の母集団 — 「歩けないタイル」は酒場 50 / 街 124 マスある

通行マスクを直接数えた(`js/tavern-map.js` の `MASK` / `js/town-map.js` の `MASK` を写して集計):

| ページ | 全マス | 歩ける | 歩けない | **歩けない かつ 歩けるマスに面する** |
|---|---|---|---|---|
| 銀の鹿亭 15x10 | 150 | 63 | 87 | **50** (C19 / T12 / W12 / D3 / S2 / F2) |
| 港町フラン 23x15 | 345 | 129 | 216 | **124** (r47 / s26 / ~26 / B17 / ^8) |

⭐ **記号が役柄にそのまま対応する**ので、置き場所に困らない:

| 記号 | 意味 | 立たせる人 |
|---|---|---|
| `T` 円卓と椅子 | 酒場 | 卓に着いた客 |
| `C` カウンター・樽 | 酒場 | 亭主・樽にもたれる酔客・荷運び |
| `s` 露店・天幕 | 街 | 露店主・買い物客 |
| `r` 瓦礫・足場 | 街 | 石工・大工(再建現場) |
| `B` 建物・船体 | 街 | 桟橋の漁師・荷揚げ |

### 2-5. マスクを 1 文字も変えない理由(⭐ ここが設計の核)

`tools/verify_town_map.js` は **「歩けるのに到達できないマスが 0 件」**を受入にしている
(実行ログ `(12a) ... {"reachAllZero":true, ...}`)。`js/town-map.js` の冒頭コメントも
「塞ぎすぎて到達できないマスを作ると受入条件 2 が赤くなる」と明記している。

⛔ したがって **NPC をマスクへ書き込まない**。NPC はマスクの**読み手**であって書き手ではない。

これで得られること:

1. 到達性の assert が**構造的に**壊れない(マスクのバイトが変わらないので原理的に不変)
2. 定点 NPC は歩けないタイルに立つので、**主人公とすり抜けることが原理的に起きない**
3. 撤退 `?npc=0` で NPC を消しても**歩ける範囲が 1 マスも動かない**

⚠ ただし「歩けないタイルの奥深く」に置くと家具や屋根に埋まる。
**可視条件 = そのタイルからマンハッタン距離 2 以内に歩けるマスが 1 つ以上ある**とする
(4 近傍だけにすると、カウンター内側の亭主 (11,1) が弾かれる。実測して緩和した)。

### 2-6. NPC はクリックを奪わない(移動処理の構造を読んで確認した)

`tavern.html` のクリックは **`elViewport` に 1 本だけ**張られていて、
`tileFromClient(ev.clientX, ev.clientY)` で **矩形と zoom から幾何的にタイルを出す**
(`tavern.html:8813-8823` を実読)。`elementFromPoint` は使っていない。`town.html` も同型。

⭐ したがって NPC の DOM が上に乗っても**移動先の計算は 1 ミリも変わらない**。
NPC がクリックを食べたいときだけ `ev.stopPropagation()` すればよい(札と同じ作法。
`makeSign()` が `s.addEventListener("click", function (ev) { ev.stopPropagation(); o.onClick(); })`)。

**重ね順**(実測): `#tavernGoal` 1 / 影 2 / 主人公 3 / **札 4** / ▽ 5 / `#title` 10。
→ **NPC は z-index 3 を超えない**。DOM 上は主人公より**前に**挿入し、主人公が常に手前に来るようにする。
⛔ NPC を 4 以上にすると札の上に被さり、§2-3 の罠が確実に発火する。

⚠ `tools/verify_tavern_map.js` の (6c) は **`#dialog` / `#prep` / `#shopScreen` / `#plazaScreen` の
4 画面だけ**の DOM 構造を `DOM_BASE = 638b479` と突き合わせている(`tools/verify_tavern_map.js:1456`)。
**`#tavernStage` は対象外**なので、NPC の div を足しても (6c) は動かない(実測で確認)。
`tools/verify_town_map.js` には DOM 構造ガードが**そもそも無い**(`grep DOM_BASE` が 0 件)。

### 2-7. 撤退スイッチの作法(既存の型をそのまま使う)

`town.html:316-367` を実読した。`?heromark=0` / `?signplate=0` が
**IIFE の先頭で `URLSearchParams` を読むだけ・sessionStorage へ写さない = ページ遷移をまたがない**
という型になっている。`?npc=0` は**この型**にする(`?town=0` の sessionStorage 型ではない)。
⛔ 遷移先にクエリを 1 文字も足さない(#6 / #12 の確定作法)。

### 2-8. changelog の要否 — **鳴る。書ける要約が実在する**

`grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py` の実測:

    24:GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

本チケットは **`tavern.html` を触る**ので `scripts/hooks/pre-commit` が発火する。
⭐ **プレイヤー向けに書ける変化が実在する**(酒場と街に人が居る)。§10 に文面を用意した。
⛔ `--no-verify` は迂回不可(ハーネスが全部ハードブロック)。

### 2-9. 既存 golden の非退行の基準(⚠ **2026-09-01 に実際に走らせた値**)

| ドライバ | 実測 | 本チケットで壊れうる理由 |
|---|---|---|
| `tools/verify_tavern_map.js` | **43/43** PENDING 0 | (2a) 席札 3 枚の中心の elementFromPoint / 壁クリック |
| `tools/verify_town_map.js` | **85/85** | 到達性 `reachAllZero` / (R2) 導線が押せるか |
| `tools/driver_heromark_signplate.js` | **46/46** | (B3) 札の中心の elementFromPoint |
| `tools/verify_quest_walk.js` | **25/25** PENDING 0 | (3e) 7 枚の札の中心の elementFromPoint |
| `tools/verify_town_exit.js` | **素 23/23** PENDING 0 | 街の札の枚数と押下 |

⚠ この 5 本は 2026-09-01 に**走らせて得た値**であって、記録の写しではない。
**走らせて違ったら、期待値を書き換える前に理由を突き止めること。**

⚠⚠⚠ **`tools/verify_quest_walk.js` は #40 が書き換える。** 相手の依頼書 §(触るファイル) が
`tools/verify_quest_walk.js`(**押し口のみ** = `:802` の `clickNode`)と宣言しており、
「⛔ assert の期待値は 1 つも触らない」「期待は **25/25 PENDING 0** のまま」と明記している。
→ **本チケットの 25/25 という基準は #40 の着地後も変わらない見込みだが、バイトは変わる。**
着手時に走らせ直し、25/25 でなかったら**期待値を書き換える前に**

    git log --oneline -3 -- tools/verify_quest_walk.js

を見て「#40 の着地が理由か / 本チケットの退行か」を切り分けること。
⚠ `tools/verify_world_map.js`(57/57) も #40 が押し口を触るが、**本チケットの非退行リストには入れていない**
(NPC は `world.html` に 1 体も出ないので、そもそも影響経路が無い)。

### 2-10. 別窓との並走(⚠ 2026-09-01 に実測して更新)

**起草直後の実測**:

    $ git -c core.quotepath=false status --short
     M 実装依頼書/README.md
    ?? 実装依頼書/2026-09-01_town-tavern-npc-crowd.md    ← 本チケット
    ?? 実装依頼書/2026-09-01_world-walk-steps.md         ← #40 (別窓)
    $ git log --oneline -1
    bb32beb #39 (追補) — push 済みを依頼書ヘッダと README へ反映

| 項目 | 実測 |
|---|---|
| 相手のチケット | **#40** `2026-09-01_world-walk-steps.md`「ワールドマップを 1 タップ = 最大 5 マスで刻む」 |
| 相手の状態 | **承認済(2026-09-01)・実装中** |
| 相手が触るファイル | `js/world-map.js` / `world.html` / `tools/verify_world_steps.js`(新規) / `tools/verify_world_map.js`(押し口) / `tools/verify_quest_walk.js`(押し口) / `実装依頼書/README.md` |
| 本チケットが触るファイル | `js/npc-crowd.js`(新規) / `tavern.html` / `town.html` / `tools/verify_npc_crowd.js`(新規) |
| **重なり** | ⭐ **実装ファイルは 1 つも重ならない**。相手も `tavern.html` / `town.html` / `js/town-map.js` / `js/tavern-map.js` を「触らない」と宣言済み |
| **唯一の衝突点** | `実装依頼書/README.md` の一覧行(相手が **#40 の行を未コミットで持っている**) |

⚠⚠ **相手の README 行はまだコミットされていない**(`git diff --stat` で 1 insertion)。
この状態で本チケットの行を足すと、**相手が `git add 実装依頼書/README.md` した瞬間に
本チケットの行ごと相手のコミットへ入る**(重ならない hunk でも丸ごと入る。恒久教訓)。
→ **§11 の手順に従い、相手の README 行が着地してから足す。**

⚠ 着手時にもう一度 `git status` と `git log --oneline -3` を取り直すこと。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/npc-crowd.js` | **新規**。両ページが読む唯一の正(配置データ + 不変条件のヘルパ) |
| `tavern.html` | `<script src>` 1 行 / `?npc=0` の判定 / NPC レイヤの生成・アイドル・巡回・吹き出し / CSS |
| `town.html` | 同上 |
| `tools/verify_npc_crowd.js` | **新規**。`--negative` 内蔵 |
| `codex1/requests/2026-09-01_townsfolk-sprites.md` | **新規**(STEP4。⚠ 起草のみ。投下はユーザー承認後) |

⛔ `index.html` / `js/town-map.js` / `js/tavern-map.js` / `js/world-map.js` / `world.html` は**開かない**。
§2-5 / §2-6 / §2-10 で確認済み。
⛔ **`実装依頼書/README.md` の行追加は、#40 の README 行がコミットされてから**(文面は §11)。
   ⚠ 判定方法 = `git log --oneline -1 -- 実装依頼書/README.md` が `bb32beb` **以外**を返すこと。
   `bb32beb` のままなら相手の行はまだ未コミット → **足さない**。

---

## 4. STEP1 — `js/npc-crowd.js`(データと不変条件)

クラシックスクリプト。⚠ **末尾で明示的に `window` へ載せる**(`js/tavern-map.js` と同じ作法)。

```js
/*
 * js/npc-crowd.js — 酒場と街に立つ NPC の **配置データと不変条件** v1
 * ------------------------------------------------------------------
 * 実装依頼書 実装依頼書/2026-09-01_town-tavern-npc-crowd.md
 *
 * ★ 不変条件 (⛔ ここを破ると受入条件が赤くなる。破りたくなったら依頼書 §2-3/§2-5 を読む)
 *   (I1) stand の tile は **歩けないタイル** でなければならない (マスクを 1 文字も変えないため)
 *   (I2) stand の tile は マンハッタン距離 2 以内に歩けるマスを持つ (家具に埋まらないため)
 *   (I3) dx / dy は ±TILE/2 まで (隣のタイル中心を越えない)
 *   (I4) stroll の経路上の全マスが歩ける
 *   (I5) stand / stroll の **どのマスのスプライト矩形も、どの札の矩形とも交差しない**
 *        ⚠⚠⚠ 既存 golden 4 本が「札の中心の elementFromPoint が自分自身」を測っている。
 *             さらに 街の札は 242px = 3.8 タイル幅。端点だけ見ると巡回で取りこぼす。
 *
 * ★ スプライトは **右向き 1 行 6 コマしか無い** (19 枚すべて実測済)。
 *   静止コマも上下向きも存在しない。左は scaleX(-1)。⛔ 正面向きの設計を足さないこと。
 *
 * ★ sprite: は **暫定**。STEP4 で codex1 へ発注した町人が納品されたら
 *   このファイルの sprite: だけを差し替える (他は 1 行も変えない)。
 *   ⛔ index.html の SPRITE_VARIANTS / tavern.html の PARTY_PORTRAIT_SPRITES へ写しを作らない。
 */
(function (global) {
  "use strict";

  var SPRITE = 96;      /* 歩行シートのセル。⚠ tavern.html / town.html と同じ値 */
  var FOOT   = 0.93;    /* 接地比。⚠ 同上。⛔ ここで独自の値にしない */

  /* face: "right" | "left"  … 右向きシートを scaleX(-1) するかどうか
     hold: 立ち止まりに使うコマ番号 (0..5)。⚠ 静止コマは無いので歩行の 1 コマを止める
     say : クリックしたときの一言 (プレーンテキスト。⛔ HTML を入れない) */
  var TAVERN = [
    { key: "keeper",  kind: "stand", tile: [11, 1], dx:   0, dy:  18, face: "left",
      sprite: "assets/servant_walk.png", hold: 0,
      say: "いらっしゃい。奥の卓が空いてるよ。" },
    { key: "patronA", kind: "stand", tile: [ 3, 3], dx: -14, dy:  -6, face: "right",
      sprite: "assets/dwarf_warrior_walk.png", hold: 2,
      say: "廃坑か……。俺は二度と潜らんぞ。" },
    { key: "patronB", kind: "stand", tile: [ 4, 3], dx:  14, dy:   6, face: "left",
      sprite: "assets/rogue_male_walk.png", hold: 4,
      say: "宝は先に見つけた者のものだ。異論は?" },
    { key: "patronC", kind: "stand", tile: [ 9, 5], dx: -14, dy:  -6, face: "right",
      sprite: "assets/cleric_npcmale_walk.png", hold: 1,
      say: "無事の帰還を祈っておこう。" },
    { key: "patronD", kind: "stand", tile: [10, 5], dx:  14, dy:   6, face: "left",
      sprite: "assets/elf_male_walk.png", hold: 3,
      say: "森の依頼なら、私に一言あってもよかろうに。" },
    { key: "drunk",   kind: "stand", tile: [ 1, 5], dx:  16, dy:   0, face: "right",
      sprite: "assets/warrior_npcfemale_walk.png", hold: 5,
      say: "……もう一杯だけ。もう一杯だけだ。" },
    { key: "porter",  kind: "stand", tile: [11, 8], dx:   0, dy: -14, face: "left",
      sprite: "assets/mage_wizard_walk.png", hold: 0,
      say: "この樽、どけておいてくれると助かるんだがね。" },
    /* ⚠ 巡回。経路は (7,3)..(7,6) の 4 マス。⛔ 列 8 にすると (8,3) が席札と交差する (依頼書 §2-3) */
    { key: "server",  kind: "stroll", from: [7, 3], to: [7, 6], face: "right",
      sprite: "assets/servant_walk.png",
      say: "お待たせしました、エールをどうぞ。" }
  ];

  var TOWN = [
    { key: "stallA",   kind: "stand", tile: [16, 3], dx:   0, dy:  10, face: "right",
      sprite: "assets/servant_walk.png", hold: 0, say: "干し魚だよ、干し魚。安いよ。" },
    { key: "stallB",   kind: "stand", tile: [19, 6], dx: -10, dy:   0, face: "left",
      sprite: "assets/rogue_male_walk.png", hold: 2, say: "その値では買えん。半分にしろ。" },
    { key: "stallC",   kind: "stand", tile: [17, 8], dx:   0, dy:  10, face: "right",
      sprite: "assets/mage_wizard_walk.png", hold: 4, say: "薬草だ。傷にも腹にも効く。" },
    { key: "customer", kind: "stand", tile: [15, 5], dx:  12, dy:   0, face: "left",
      sprite: "assets/cleric_npcmale_walk.png", hold: 1, say: "麦の値がまた上がった……。" },
    { key: "mason",    kind: "stand", tile: [ 4, 4], dx:   0, dy:   8, face: "right",
      sprite: "assets/dwarf_warrior_walk.png", hold: 3, say: "この壁を積み直すのに、あと半年だな。" },
    { key: "carpenter",kind: "stand", tile: [ 8, 7], dx: -10, dy:   0, face: "left",
      sprite: "assets/warrior_npcfemale_walk.png", hold: 5, say: "足場に近づくな。落ちても知らんぞ。" },
    { key: "fisher",   kind: "stand", tile: [ 7,13], dx:   0, dy: -20, face: "right",
      sprite: "assets/elf_male_walk.png", hold: 0, say: "湖の魚が減った。何かが居るのさ。" },
    { key: "dockhand", kind: "stand", tile: [15,13], dx:   0, dy: -20, face: "left",
      sprite: "assets/servant_walk.png", hold: 2, say: "北からの荷はまだ来ん。橋がな。" },
    /* 巡回 3 本。⭐ strollA は北橋 (12,3)(13,3) を渡る = 街が生きて見える一番の絵 */
    { key: "strollA", kind: "stroll", from: [ 9, 3], to: [15, 3], face: "right",
      sprite: "assets/warrior_npcfemale_walk.png", say: "橋の向こうは市場だよ。" },
    { key: "strollB", kind: "stroll", from: [14,11], to: [19,11], face: "right",
      sprite: "assets/cleric_npcmale_walk.png", say: "湖岸は風が気持ちいいね。" },
    { key: "strollC", kind: "stroll", from: [18, 4], to: [18, 9], face: "right",
      sprite: "assets/rogue_male_walk.png", say: "……見ない顔だな。" }
  ];

  /* ── 不変条件の検査 (⭐ ドライバはこれを **呼ぶ**。自前で書き直さないこと) ─────────
   *  map  … TAVERN_MAP か TOWN_MAP (isWalkable / inBounds / TILE を持つもの)
   *  signs… [{ key, cx, cy, w, h }] を **実 DOM から測って**渡す
   *          ⛔ 定数表を渡さない。札の幅は画面幅で変わる (酒場 128 → 55)。
   *  戻り値 … { ok, problems: [{ key, why, detail }] }  ⚠ 例外を投げない (握り潰しでもない)
   */
  function cellsOf(n) {
    if (n.kind === "stroll") {
      var a = n.from, b = n.to, out = [], x, y;
      if (a[0] === b[0]) { for (y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) out.push([a[0], y]); }
      else               { for (x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, a[1]]); }
      return out;
    }
    return [n.tile];
  }
  function boxOf(c, r, TILE, dx, dy) {
    var cx = c * TILE + TILE / 2 + (dx || 0), cy = r * TILE + TILE / 2 + (dy || 0);
    return { l: cx - SPRITE / 2, t: cy - SPRITE * FOOT, r: cx + SPRITE / 2, b: cy + SPRITE * (1 - FOOT) };
  }
  function hitSign(a, s) {
    var l = s.cx - s.w / 2, t = s.cy - s.h / 2, r = s.cx + s.w / 2, b = s.cy + s.h / 2;
    return !(a.r <= l || r <= a.l || a.b <= t || b <= a.t);
  }
  function validate(list, map, signs) {
    var probs = [];
    (list || []).forEach(function (n) {
      var T = map.TILE;
      if (n.kind === "stand") {
        var c = n.tile[0], r = n.tile[1];
        if (map.isWalkable(c, r)) probs.push({ key: n.key, why: "I1", detail: "歩けるタイルに立っている" });
        var vis = false, dc, dr;
        for (dc = -2; dc <= 2 && !vis; dc++) for (dr = -2; dr <= 2; dr++) {
          if (Math.abs(dc) + Math.abs(dr) > 2 || (!dc && !dr)) continue;
          if (map.inBounds(c + dc, r + dr) && map.isWalkable(c + dc, r + dr)) { vis = true; break; }
        }
        if (!vis) probs.push({ key: n.key, why: "I2", detail: "2 マス以内に歩けるマスが無い" });
        if (Math.abs(n.dx || 0) > T / 2 || Math.abs(n.dy || 0) > T / 2)
          probs.push({ key: n.key, why: "I3", detail: "dx/dy が ±TILE/2 を超えている" });
      } else {
        cellsOf(n).forEach(function (p) {
          if (!map.isWalkable(p[0], p[1]))
            probs.push({ key: n.key, why: "I4", detail: "経路上 (" + p + ") が歩けない" });
        });
      }
      cellsOf(n).forEach(function (p) {
        var bx = boxOf(p[0], p[1], map.TILE, n.dx, n.dy);
        (signs || []).forEach(function (s) {
          if (hitSign(bx, s)) probs.push({ key: n.key, why: "I5",
            detail: "(" + p + ") が札 " + s.key + " と交差" });
        });
      });
    });
    return { ok: probs.length === 0, problems: probs };
  }

  global.NPC_CROWD = {
    SPRITE: SPRITE, FOOT: FOOT,
    TAVERN: TAVERN, TOWN: TOWN,
    cellsOf: cellsOf, boxOf: boxOf, validate: validate
  };
})(typeof window !== "undefined" ? window : this);
```

**読み込み**(⚠ 位置は実測済み。着手時に `grep -n '<script src=' tavern.html town.html` で取り直すこと):

- `tavern.html:2463` の `<script src="js/tavern-map.js"></script>` の**直後**
- `town.html:314` の `<script src="js/town-map.js"></script>` の**直後**

    <script src="js/npc-crowd.js"></script><!-- 酒場と街の NPC 配置の唯一の正 (#41)。⚠ *-map.js より後。撤退 ?npc=0 -->

---

## 5. STEP2 — 描画(定点 + アイドル + 巡回)

**DOM**: `#tavernStage` / `#townStage` の中に、**主人公 `#tavernHero` / `#townHero` より前**へ
`<div id="npcLayer">` を 1 枚挿し、その中に NPC 1 体 = `<div class="npcUnit">` + `<div class="npcShadow">`。

**CSS**(両ページに同じものを置く。⛔ セレクタは共有しない = 片方を直しても他方が動かない):

```css
#npcLayer { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.npcUnit {
  position: absolute;
  background-repeat: no-repeat;
  transform-origin: 50% 100%;
  filter: drop-shadow(0 3px 4px rgba(0,0,0,0.45));
  z-index: 3;                 /* ⛔ 4 以上にしない = 札 (z-index 4) の下 (依頼書 §2-6) */
  cursor: pointer;
}
.npcShadow {
  position: absolute; width: 40px; height: 14px; margin-left: -20px; margin-top: -7px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%);
  pointer-events: none; z-index: 2;
}
```

**配置**(⭐ 主人公の `placeHero()` と**同じ 2 行**。⛔ 別式で書き直さない):

```js
el.style.left = (cx + dx - SPRITE / 2) + "px";
el.style.top  = (cy + dy - SPRITE * FOOT) + "px";
el.style.transform = (n.face === "left") ? "scaleX(-1)" : "none";
el.style.backgroundPosition = (-frame * SPRITE) + "px " + (-3 * SPRITE) + "px";  /* 行 3 = 右向き */
```

**アイドル**(定点):

- 既定は `hold` のコマで**静止**。
- **6〜11 秒に 1 回**(NPC ごとに固定オフセットを持たせて同時に動かない)、
  `hold` → `hold+1` → `hold` と **2 コマだけ**送って「身じろぎ」に見せる。
- ⛔ 6 コマを回し続けない(その場で足踏み = ムーンウォークに見える)。

**巡回**(`stroll`):

- `from` → `to` → `from` を往復。**1 マス = `MS_PER_TILE`**。
  ⛔ 主人公と違う速さにしない(`tavern.html` の `var MS_PER_TILE = 340;` / `town.html` の同名の値を
  **読んで使う**。⛔ 340 を直書きしない)。
- コマ送りの除数は主人公と**同率**(酒場は 190。`MS_PER_TILE` と 170:95 を保つ)。
- 端点に着いたら **1.5〜3 秒 静止**してから折り返す(`face` を反転)。
- ⚠ 経路は `NPC_CROWD.cellsOf()` が返す直線のみ。**A\* を呼ばない**
  (呼ぶと主人公の経路探索と同じ関数を毎フレーム叩くことになる)。
- ⚠ **すり抜けは許容**(§1 のユーザー決定)。通行判定に一切載せない。

**タブが隠れている間は止める**: `document.visibilityState === "hidden"` で
`cancelAnimationFrame`。⛔ 19 体を裏で回し続けない。

---

## 6. STEP3 — 吹き出し(クリックで一言)

- `.npcUnit` の `click` で `ev.stopPropagation()` → 吹き出しを出す。
  ⭐ **札と同じ作法**(`makeSign()` の 1 行と同型)。
- 吹き出しは `#npcLayer` の中に **常に 1 枚だけ**。次を押したら前を消す。
  **4 秒で自動的に消える**。
- 吹き出し自身は **`pointer-events: none`**(押せてしまうと札の上に乗ったとき §2-3 を再発させる)。
- 位置 = NPC の頭上(`cy + dy - SPRITE * FOOT - 8` を下端に)。
  横は `translateX(-50%)` で中心合わせ。**ステージの左右端で見切れないよう clamp する**。
- ⚠ `textContent` で入れる。⛔ `innerHTML` を使わない。
- ⚠ タッチ端末対策で `click` と `touchend` の**両方**を張る
  (#26 パーティ演出で「click 非発火端末で詰む」実例がある)。

---

## 7. 撤退スイッチ

- **`?npc=0`** — `#npcLayer` を **DOM に作らない**(⛔ `display:none` で残さない。
  `elementFromPoint` に写って受入条件が濁る。`?tavernmap=0` と同じ理由)。
- **判定位置** = `tavern.html` / `town.html` それぞれの**先頭 IIFE の中**、
  `?heromark=0` を読んでいるのと同じ場所(`town.html:348-357` が実例)。
- **ページ遷移をまたがない**。sessionStorage へ写さない。各ページが独立に読む
  (⭐ `?heromark=0` と同じ型。`?town=0` の sessionStorage 型ではない)。
- ⛔ 遷移先の URL にクエリを 1 文字も足さない。

---

## 8. 受入条件 — `tools/verify_npc_crowd.js`(新規)

**方針**: 観測するのは「**データの不変条件**」「**実際に描かれた矩形**」「**押したら喋る**」の 3 つ。
⭐ **不変条件は `NPC_CROWD.validate()` を呼んで測る**(ドライバ側に同じ判定を書き直さない。
写経すると実装とドライバが同じ間違いを共有して両方緑になる)。
⭐ ただし **(1a) だけは 2 経路**で突き合わせる — `validate()` の結果と、
**実 DOM の `getBoundingClientRect()` から起こした矩形**の両方で「札と交差 0 件」を出す。

流用元: `tools/verify_tavern_map.js`(http 自前配信 + 実 Chrome + 配信スナップショットへの変異注入)。

### ⚠ 計測機構

札の矩形は**必ず実 DOM から測ってステージ px へ戻す**。定数表を渡さない:

```js
const signs = await page.evaluate((stageId, sel) => {
  const st = document.getElementById(stageId);
  const sr = st.getBoundingClientRect();
  const m = /matrix\(([^,]+),/.exec(getComputedStyle(st).transform);
  const z = m ? (parseFloat(m[1]) || 1) : 1;         /* ⚠ zoom を割り戻す */
  return [...document.querySelectorAll('#' + stageId + ' ' + sel)].map(el => {
    const b = el.getBoundingClientRect();
    return { key: el.id, w: b.width / z, h: b.height / z,
             cx: ((b.left + b.width / 2) - sr.left) / z,
             cy: ((b.top  + b.height / 2) - sr.top ) / z };
  });
}, stageId, sel);
```

### §0 装置(先に母集団を確かめる)

- **(0a)** `tavern.html` / `town.html` の**両方**で `window.NPC_CROWD` が生えていて、
  配信された HTML に `<script src="js/npc-crowd.js">` が**実在する**。
  ⭐⭐⭐ **これが無いと全 assert が空振りで永久緑になる**(#23 で `js/world-map.js` の
  `<script src>` を書き忘れ、5 本の assert が「何も起きないのに全部緑」になった事故と同型)。
- **(0b)** 実際に生成された `.npcUnit` の数が `NPC_CROWD.TAVERN.length` / `.TOWN.length` と一致し、
  **どちらも 0 でない**(起草時点の想定 = 酒場 **8** / 街 **11**)。
- **(0c)** 札が実 DOM から**1 枚以上**測れている(酒場 **5 枚** / 街 **3 枚** = 2026-09-01 実測。
  ⚠ 闇市が未解禁なので酒場 6 枚・街 4 枚にはならない)。
  ⭐ 0 枚だと (1a) の交差検査が空振りする。
- **(0d)** マスクの母集団が空でない — `isWalkable` が false のマスが酒場 **87** / 街 **216**
  (2026-09-01 実測)。
- **(0e)** `NPC_CROWD.validate()` が**素通しでない** — 故意に壊した 1 件を渡すと
  `problems` に必ず出る。⚠ これが無いと (1a) が「常に ok:true」でも気づけない。

### §1 データの不変条件

- **(1a)** ★★ 酒場 / 街の両方で `validate(list, MAP, 実 DOM から測った札)` が **problems 0 件**。
  **かつ** 実 DOM の `.npcUnit` の矩形と実 DOM の札の矩形の交差が **0 件**(2 経路)。
  ⚠ **desktop 1440x900 と compact 390x844 の両方**で測る(酒場の札は幅が 128→55 に変わる)。
- **(1b)** 定点 NPC 全員が `isWalkable() === false` のタイルに立ち、
  マンハッタン距離 2 以内に歩けるマスを持つ。
- **(1c)** 巡回 NPC の**経路上の全マス**が歩ける(端点だけでなく)。
- **(1d)** `dx` / `dy` が全員 ±`TILE/2` 以内(酒場 ±48 / 街 ±32)。
- **(1e)** 母集団の作り分けが効いている — 定点と巡回が**どちらも 1 件以上**ある
  (全部 stand にすると (1c) が空振りする)。

### §2 描画

- **(2a)** `.npcUnit` の z-index が全員 **3 以下**(札の 4 を超えない)。
- **(2b)** ★ 札 5 枚(酒場)/ 3 枚(街) の**中心の `elementFromPoint` が自分自身か子孫**。
  ⭐ 既存 golden 4 本と同じ条件を、**NPC が居る状態で**独立に測る。
- **(2c)** 足元の位置が主人公と同じ規則 — `.npcUnit` の `top` が
  `cy + dy - SPRITE * FOOT` と **1px 以内**で一致する(CSS と JS の写経ズレを殺す)。
- **(2d)** スプライトの `background-position` の Y が `-3 * SPRITE`(= 右向きの行)。
  ⭐ 行 0〜2 は空なので、間違えると NPC が全員透明になる。

### §3 吹き出し

- **(3a)** ★ `.npcUnit` を 1 体押すと吹き出しが **1 枚**出て、`textContent` が
  そのデータの `say` と**1 文字も違わない**。
- **(3b)** 別の NPC を押すと吹き出しは **常に 1 枚**のまま(前が消える)。
- **(3c)** ★ NPC を押しても**主人公が動かない**(`stopPropagation` が効いている)。
  ⭐ 押す前後の `heroTile()` が同一 かつ `isMoving()` が false。
- **(3d)** 吹き出しの `pointer-events` が `none`。

### §4 恒等(非退行)

- **(4a)** ★★★ `TAVERN_MAP.MASK` / `TOWN_MAP.MASK` の**全行の文字列が起動前後で同一**。
  ⭐ NPC がマスクへ書き込んでいないことの直接証拠。
- **(4b)** 歩けるマスの数が 酒場 **63** / 街 **129**(2026-09-01 実測)のまま。
- **(4c)** 主人公の初期タイルが従来どおり(酒場 `spawnFor` / 街 `spawnFor` の結果が不変)。
- **(4d)** `#tavernStage` / `#townStage` の**札の枚数**が従来どおり(酒場 5 / 街 3)。

### §5 撤退

- **(5a)** `tavern.html?npc=0` / `town.html?npc=0` で `#npcLayer` が **DOM に存在しない**
  (⛔ `display:none` で残っていない)。
- **(5b)** ⭐ 撤退の受入は「OFF で緑」ではなく、**同じ 4 条件を ON/OFF 両方へ当てる**:
  `{ layer, unitCount>0, bubbleWorks, signsClickable }`
  → ON `{true, true, true, true}` / OFF `{false, false, false, **true**}`。
  ⚠ `signsClickable` は**両方 true** が正(札は NPC の有無に関わらず押せる)。
  ⭐⭐ 「全部反転」ではなく「**反転すべき 3 つが反転し、反転してはいけない 1 つが動かない**」を測る。
  これが無いと「NPC ごと札も壊した」実装が緑になる。
- **(5c)** `?npc=0` が**次のページへ持ち越されない**(酒場で `?npc=0` → 街へ出ると NPC が居る)。

### ⛔ 測らないこと

- **`dx` / `dy` の具体値** — 実機の目視で動かす余地を残す(§9)。
  測るのは「±TILE/2 以内」と「札と交差しない」だけ。
- **`sprite:` に何が入っているか** — STEP4 の納品で全部差し替わる。
  ⛔ ファイル名を assert に焼かない。
- **`say:` の文言** — (3a) は「データと DOM が一致すること」だけを見る。中身は自由に直せる。
- **巡回の速度・アイドルの間隔** — 目で決める。
- **NPC の人数そのもの**((0b) はデータと DOM の一致を見るだけで、8 人/11 人を焼かない)。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nosrc` | 配信 HTML から `<script src="js/npc-crowd.js">` を落とす | (0a) |
| `walkable` | 定点 1 体を歩けるタイル(酒場 (7,4))へ移す | (1b) |
| `oversign` | ⭐⭐⭐ **§2-3 の罠の再現**。街 `mason` を **(11,2)** へ移す(`townSign_tavern` の 242px 幅と交差) | (1a) / (2b) |
| `strollsign` | ⭐⭐⭐ **§2-3 の罠の再現 2**。酒場 `server` の巡回を **(8,3)⇄(8,6)** へ戻す(端点は無事だが**経路上の (8,3)** が席札と交差) | (1a) |
| `dxover` | `dx` を `TILE/2 + 1` にする | (1d) |
| `maskpatch` | `js/npc-crowd.js` に `TAVERN_MAP.MASK[4] = "W.............W"` を足す | (4a) / (4b) |
| `zorder` | `.npcUnit` の z-index を 5 にする | (2a) / (2b) |
| `nostop` | 吹き出しの `ev.stopPropagation()` を外す | (3c) |
| `twobubble` | 前の吹き出しを消さない | (3b) |
| `row0` | `background-position` の Y を `0` にする(空の行 0 を指す) | (2d) |
| `retreatnoop` | `?npc=0` の判定を潰す | (5a) / (5b) |
| `allstand` | 巡回 3 本を全部 `stand` にする | (1e) |
| `validateyes` | `validate()` を常に `{ok:true, problems:[]}` にする | (0e) |

⚠ **変異は 1 本ずつ注入する**(全部同時だと互いを覆い隠す。#34 の実測)。
⚠ 変異のアンカーは**実装後に配信バイトへ当てて 1 回空振りを確認**すること。
空振りしたら**変異のほうを直す**(#38 の恒久教訓)。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_tavern_map.js` → **43/43** PENDING 0
- `node tools/verify_town_map.js` → **85/85**
- `node tools/driver_heromark_signplate.js` → **46/46**
- `node tools/verify_quest_walk.js` → **25/25** PENDING 0
- `node tools/verify_town_exit.js` → **素 23/23** PENDING 0

⚠ 上記は **2026-09-01 に実際に走らせた値**。走らせて違ったら、
**期待値を書き換える前に理由を突き止める**(別窓のコミットで動いていることがある)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. ⭐⭐⭐ **酒場に入った瞬間、「人が居る」と感じるか。** 8 人で足りるか / 多すぎないか。
2. **卓の客が椅子に座って見えるか。** 円卓は 2x2 マスで、客は卓タイルの上に立っている。
   浮いて見えるなら `dy` を動かす(±48 まで)。
3. **亭主 (11,1) がカウンターの中に立って見えるか。** 天板の上に乗って見えていないか。
4. **給仕の巡回が「ホールを行き来している」に見えるか。** 主人公とすり抜けるのが気になるか。
   ⭐ 気になるなら次の一手は「巡回を壁際だけにする」か「巡回そのものを外す」。
5. **街の市場に人が居ることで、東側が『市場らしく』なったか。**
   暫定スプライト(冒険者)が露店に立っている違和感がどの程度か
   → **STEP4 の発注の優先順位を決める材料**。
6. ⭐ **巡回 NPC が北橋を渡るのが見えるか**(`strollA` (9,3)⇄(15,3))。
   これが本チケットで一番「街が生きている」絵になるはずの箇所。
7. **NPC を押したとき、吹き出しが読めるか。** 4 秒は長い/短いか。
   iPhone 縦(390x844)で吹き出しが画面外へ出ないか。
8. **札が NPC で読みにくくなっていないか**(機械検査は交差 0 件だが、
   「近すぎてうるさい」は目でしか分からない)。
9. **重くなっていないか**(iPhone 実機。19 体 + アイドル + 巡回)。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>酒場と港町に人が増えた</b> — 銀の鹿亭には亭主と客が、フランの市場には売り子や石工が立つようになった。話しかけると一言返してくる。"

⚠ `check_changelog.py` の `GAME_LOGIC` は `("index.html", "tavern.html", "audio.js")`。
`town.html` 単体では鳴らないが、本チケットは `tavern.html` を触るので**必ず鳴る**。
⛔ `--no-verify` での迂回は不可(ハーネスがハードブロック)。

---

## 11. やらないこと

- ⛔ **通行マスクの変更**。NPC は歩けないタイルにしか立たない(§2-5)。
- ⛔ **`index.html` の `SPRITE_VARIANTS` / `tavern.html` の `PARTY_PORTRAIT_SPRITES` への追記**。
  既に二重定義で要同期と明記されている。3 つ目の写しを作らない。
- ⛔ **旧 chibi 18 枚の流用**(§2-2 でユーザーが不採用と決定)。
- ⛔ **傭兵名簿(#38)の仲間を酒場に立たせる**。意味は強いが、名簿が空の新規プレイヤーには
  誰も居ない酒場が残るので「名もなき客 + 名簿」の二層が要る → **別チケット**。
  ⭐ ただし `js/npc-crowd.js` のデータ形は `{ key, kind, tile, sprite, say }` なので、
  後から `DFRoster.all()` を混ぜられる形になっている。
- ⛔ **NPC に依頼を持たせる / 商売をさせる / 会話分岐**。v1 は一言だけ。
- ⛔ **NPC どうしの会話・すれ違いの回避・向きの追従**。
- ⛔ **`index.html`(ダンジョン)への NPC 配置**。
- ⛔ **上下向きスプライトの新規発注**(素材規格が 6 コマ 1 行なので規格変更になる)。
- ⛔ **`実装依頼書/README.md` への行追加**。⚠ **#40 の行がコミットされるまで足さない**
  (相手は未コミットで持っている。足すと相手のコミットへ丸ごと入る。§2-10)。
  ⚠ 足す位置は **#40 の行の直下**。用意してある行(⭐ 番号は #41 で確定):

    | 41 | [2026-09-01_town-tavern-npc-crowd.md](2026-09-01_town-tavern-npc-crowd.md) | **承認済** | 0% | 酒場と街に NPC を置く。⭐ **NPC は歩けないタイルにしか立たない**=マスクを 1 文字も変えず到達性 assert が構造的に壊れない。⚠⚠⚠ **既存 golden 4 本が「札の中心の elementFromPoint」を測っており、街の札は 242px = 3.8 タイル幅** → 起草時の候補 5 件が実測で潰れた。⚠ **巡回は端点でなく経路上の全マス**で札との交差を見る。撤退 `?npc=0` |

---

## 12. STEP4 — codex1 へ町人スプライトを発注(⚠ 起草のみ。投下は承認後)

⛔ **STEP1〜3 が緑になってから着手する。** 納品を待つ間も酒場は完成している。

**依頼文**: `C:\Users\PC_User\Desktop\codex1\requests\2026-09-01_townsfolk-sprites.md`
⚠ 作法の唯一の正は **同フォルダの `README.md`**。起草前に必ず読む。

**発注する 6 種**(すべて **右歩き 6 コマ / 576x384 / セル 96px / 透過 PNG**):

| key | 誰 | 立つ場所 | 差し替え先 |
|---|---|---|---|
| `townKeeper` | 酒場の給仕(前掛け・盆) | 酒場 `keeper` / `server` | `assets/town_keeper_walk.png` |
| `townStall` | 露店の売り子(前掛け・鍔広帽) | 街 `stallA` `stallC` | `assets/town_stall_walk.png` |
| `townFisher` | 漁師(網・長靴) | 街 `fisher` `dockhand` | `assets/town_fisher_walk.png` |
| `townMason` | 石工(槌・革前掛け) | 街 `mason` `carpenter` | `assets/town_mason_walk.png` |
| `townGuard` | 街の衛兵(槍・鎖帷子) | 街 `strollA` | `assets/town_guard_walk.png` |
| `townCommoner` | 町人(外套・買い物籠) | 街 `customer` `strollB` `strollC` | `assets/town_commoner_walk.png` |

**依頼文に必ず入れること**(`codex1/requests/README.md`「書き方の指針」1〜6 に対応):

1. **維持するもの** = 現行 codex1 の 13 枚と**同じ縮尺・同じ接地線・同じ頭身**。
   数値目標: **右向き 6 コマの bbox 高 max が 57〜60px**(現行 13 枚の実測レンジ。
   旧 chibi の 63〜70px にしない)。⭐ **検算コードを添える**。
2. **変えるもの** = 職能と衣装のみ。⛔ 武装した冒険者にしない(町人であること)。
3. **潰す逃げ道** — ⛔ 「既存シートの色替えで作る」不可 / ⛔ 「1 コマを 6 回コピー」不可 /
   ⛔ 「row 0〜2 に何か描く」不可(**row 3 だけに描く**。他 19 枚と同じ規格)。
4. **納品前チェック** — **6 コマの md5 がすべて異なること**を依頼側から明示的に要求する。
5. **後処理の許可範囲を列挙** — 「位置・寸法・カンバス・透過だけ後処理してよい。
   **姿勢そのものを切り抜きで作ることはできない**」と名指しで禁じる(扉 v1 の再発防止)。
6. ⚠⚠ **数値目標が本文の意図と矛盾していないか読み返す**(扉 v2 の教訓)。
   ⭐ 「こちらの指標が誤っていたら、閾値をいじらず衝突を数値で報告してほしい」と書く。

**投下**(⚠ ユーザー承認後。⭐ 初回は `--dry-run` でヘッダ全文を読む):

    py tools/codex_request.py --dry-run --request "C:\Users\PC_User\Desktop\codex1\requests\2026-09-01_townsfolk-sprites.md"
    py tools/codex_request.py --request "C:\Users\PC_User\Desktop\codex1\requests\2026-09-01_townsfolk-sprites.md"

**納品後**:

    py tools/check_sprite_doubling.py
    py tools/check_alpha_bg_residue.py     # ⚠⚠ 効くのは充填率だけ (2026-08-16 扉の白矩形)

⚠⚠ **目視は「本番の背景の上」で行う**(酒場の板張り床 / 街の石畳)。
透過 PNG の欠陥は背景色しだいで見えなくなる。
→ 台帳 `tools/codex1_sprites.json` へ追記 → `js/npc-crowd.js` の `sprite:` を差し替え →
`node tools/verify_npc_crowd.js` を再実行(⭐ `sprite:` は assert に焼いていないので**緑のまま通る**はず。
赤くなったら「測らないこと」の約束が破られている)。

---

## 13. 実装結果

### 項目 1 — データ層 + 街の結線 + 受入条件の器(2026-09-02)

**着手前 HEAD** `a472de6`。**触ったファイル** = `js/npc-crowd.js`(新規)/ `town.html`(+1 行)/
`tools/verify_npc_crowd.js`(新規)。⛔ **`tavern.html` は 1 バイトも触っていない**
(§2-8 のとおり触ると changelog が鳴るが、項目 1 にはプレイヤーに見える変化が実在せず、
嘘の要約を書くしか通す道が無いため。結線は項目 2 の仕事)。

**結果**: `node tools/verify_npc_crowd.js` → **11/11 PASSED / FAILED 0 / PENDING 17**。
既存 golden 5 本は**全部基準どおり**(43/43・85/85・46/46・25/25・素 23/23)。

#### 依頼書の主張の実測(⭐ 崩れ 0 件。ただし 1 件だけ訂正)

- ⚠ **§2-2 の「19 枚」は誤り** — `assets/*_walk.png` は **37 枚**(576x384 が 33 枚 +
  規格違いの `_debug_*` が 4 枚)。⭐ ただし肝心の主張「**576x384 の 33 枚すべてが row 3 の
  1 行だけ**」は成立し、データが使う 7 枚も全部その中。⛔ `_debug_*` 4 枚は使わない。
- §4 の配置 19 体は **I1〜I5 違反 0 件**。desktop / compact の両方で交差 0。
  (0d) 実測 = 酒場 15x10 TILE96 歩ける 63 / 歩けない 87、街 23x15 TILE64 歩ける 129 / 歩けない 216。
- (0c) 実測の札 = 酒場 **5 枚** / 街 **3 枚**(闇市は未解禁なので DOM に無い)。
  ⭐ **compact で縮むのは酒場だけ**: `questTable_goblin-mine` 128→**55**、
  他の卓 128→**73**、扉 138→121 / 162→143。**街の 3 枚は compact でも 242 / 190 / 242 のまま**。
  → §2-3 の「desktop の広い方で判定すれば両方を満たす」は**酒場については正しい**が、
    街は縮まないので **compact も測る**意味がある(ドライバは 4 面すべて測っている)。
- zoom 実測: 酒場 desktop 0.825 / compact 0.673958、街 desktop 0.866667 / compact 0.752083。

#### ⭐ 装置として作り込んだところ(項目 2〜4 が壊さないよう明記する)

- **(0a) を 2 本に割った** — `(0a-town)` は「① 配信バイトに `<script src>` が実在
  ② ページが実際に要求した ③ 注入前に `window.NPC_CROWD` が生きている」の **AND**。
  `(0a-tavern)` は **PENDING**。⚠⚠⚠ ドライバは酒場のデータ層を測るために
  `page.addScriptTag()` で**暫定注入**しているので、**注入で (0a) を緑にしてはいけない**。
  → 項目 2 が結線したら `hasNPCBeforeInject === 'object'` かつ `injected === false` になり、
    (0a-tavern) の述語を `(0a-town)` と同型に書いて PASSED へ変える。
- **(0b) も 2 本に割った** — `(0b)` = データの母集団が空でない(実装済)/
  `(0b-dom)` = 生成された `.npcUnit` の数がデータ件数と一致(**PENDING**、項目 2)。
- **(0e) が `validate()` の素通しを毎回証明する** — 空配列は `ok:true`、
  故意に壊した 5 件で **I1 / I2 / I3 / I4 / I5 が全部出る**ことを確認する。
  ⭐ 壊す種(歩けるタイル / 2 マス以内に歩けるマスが無いタイル / 札のタイル)は
  **本番のマスクを走査して実行時に見つける**ので、配置を動かしても腐らない。
- **(1a) は本当に 2 経路** — 経路 ① は本番の `validate()`、経路 ② はドライバが
  `cellsOf` / `boxOf` を**呼ばずに**自前で起こした矩形。交差判定は本番の否定形に対して
  **肯定形**で書いてある(片方が符号を間違えたら食い違う)。
  ⭐ 経路 ② の非空振りを実証済み: 街の実測札 `townSign_tavern` (672,96,242x54.1) に対し
  **§2-3 が潰した候補 `guardBridge` (11,2) は 1 件ヒット**、採用値 `mason` (4,4) は 0 件、
  **端点が無事で経路上だけ当たる巡回 (8,2)⇄(14,2) は内側 5 マスがヒット**。
- **(1z)** がドライバ自前のセル列と `cellsOf()` の一致を毎回突き合わせる。
  ⚠ 本番の `cellsOf` は **斜めの `stroll` を黙って横一列に潰す**(`from`/`to` の
  行も列も違うとき `else` 側へ落ちる)。ドライバ側は `null` を返して `(1z)` を赤くするので、
  将来斜めの巡回を足したら必ず気づける。

#### 数字(項目 2 以降の母集団)

| | 酒場 | 街 |
|---|---|---|
| NPC | 8 体(定点 7 / 巡回 1) | 11 体(定点 8 / 巡回 3) |
| 占めるセル | 11 | 27 |
| 巡回の経路マス | server 4 | strollA 7 / strollB 6 / strollC 6 = 19 |
| dx/dy の上限と実測最大 | ±48 / 18 | ±32 / 20 |
| 札 | 5 枚 | 3 枚 |

⚠ `(0b)` の detail が定点/巡回の内訳を毎回出すので、項目 4 の変異 `allstand` は
**この内訳が 8/0・11/0 になること**で効いたと判定できる。

### 項目 2 — STEP2 描画(定点 + アイドル + 巡回)(2026-09-02)

**着手前 HEAD** `daf7468`。**触ったファイル** = `tavern.html`(結線 1 行 + CSS + 描画 + changelog)/
`town.html`(CSS + 描画)/ `tools/verify_npc_crowd.js`。
⛔ `index.html` / `js/*-map.js` / `world.html` / `title.html` は 1 バイトも開いていない。
**通行マスクは 1 文字も変えていない**((4a) が毎回それを証明する)。

**結果**: `node tools/verify_npc_crowd.js` → **21/21 PASSED / FAILED 0 / PENDING 7**
(残る PENDING = §3 の 4 本 + §5 の 3 本。変異 13 本は `--negative` 側なので素の実行には出ない)。
既存 golden 5 本は**全部基準どおり**: 43/43 / 85/85 / 46/46 / 25/25 / 素 23/23。

#### ⚠ 依頼書 §5 の CSS からの唯一の逸脱(意図は同じ、当たり判定の事故だけ消した)

`#npcLayer` へ **`pointer-events: none`**、`.npcUnit` へ **`pointer-events: auto`** を足した。
`#npcLayer` は舞台全面 (100% x 100%) を覆うので、素のままだと**空きマスの
`elementFromPoint` が `#npcLayer` を返す**。押せるのは NPC だけという §5 の意図は変えていない。
⭐ 移動の計算は `tileFromClient` の幾何なので、そもそも NPC の DOM に左右されない(§2-6 の実測どおり)。

#### ⚠⚠⚠ (2b) は現状の設計では **単独の変異では原理的に赤くならない**(項目 4 への申し送り)

`.npcUnit` の z-index 3 < 札の 4 なので:

| 単独の変異 | 何が起きるか | (2b) |
|---|---|---|
| `zorder`(z-index を 5 に) | NPC と札は**そもそも重なっていない**(1a が 0 件を保証) | **赤くならない** |
| `oversign`(街 `mason` を (11,2) へ) | 重なるが z-index 3 < 4 なので拾われるのは札のまま | **赤くならない** |

→ **(2b) を赤くするには「z-index を上げる」と「札に重ねる」を同時に注入するしかない。**
項目 4 は §8 の変異表を **`zorder` = 「z-index 5」+「mason を (11,2) へ」の複合**にするか、
`zorder` / `oversign` の targets から `2b` を外すこと
(⭐ #38 の恒久教訓「**変異が空振りしたら変異のほうを直す**」)。
⚠ `zorder` は **(2a)** を、`oversign` は **(1a) の 3 経路すべて**を確実に赤くする。

#### ⭐⭐⭐ (4a)「起動前」の採り方 — setter を挟む

`page.evaluateOnNewDocument` で `window.TAVERN_MAP` / `window.TOWN_MAP` に
`Object.defineProperty` の **setter を挟み**、地図モジュールが `global.TAVERN_MAP = {...}` した
**その瞬間**の MASK を `window.__drvMaskSnap` へ写している。
⛔ `waitForFunction` の後で採ると、その時点では既に NPC の初期化が済んでいるので
「前」にならず **永久に前後同一 = 永久緑**になる。
⭐ さらに `NPC_SETTLE_MS = 1500` を挟んで「**NPC が実際に 1500ms 動いたあと**」を「後」にした
(MS_PER_TILE=340 なので巡回は端点に着いて折り返すところまで通る)。

#### ⭐ 新しい assert が本当に赤くなることを 1 本ずつ実測した(仮の変異を手で入れて確認 → 復帰)

| 入れた欠陥 | 赤くなった assert |
|---|---|
| `background-position` の Y を `0` に(空の行 0) | **(2d)** — 街 11 体すべてを名指しで列挙 |
| `top` を `cy + dy - SPRITE * 0.5` に | **(2c)** |
| `TM.MASK[4] = "r......................"` | **(4a)**(行 4 の前後を並べて表示)+ **(4b)**(歩ける 129 → 144) |

#### 実測値(項目 3 / 項目 4 の母集団)

- 描かれた `.npcUnit` = 酒場 **8** / 街 **11**(4 面すべてで一致。`data-npc` の key 集合もデータと完全一致)
- z-index は `.npcUnit` 全員 **3** / 札は全員 **4**(実 DOM から測った値)
- `background-position` = 全員 Y **-288px**、コマ X は 4 面それぞれ **6 種類**(= アイドルも巡回も動いている)
- 主人公の初期タイル = 酒場 **(7,8)** / 街 **(10,3)**(どちらも `spawnFor(null)` と一致・`isMoving=false`)
- 画面内の札 = 酒場 desktop 5 / compact **4**(`tavernDoor_back` が画面外)、
  街 desktop 3 / compact **1**(`townSign_shop` と `townSign_gate` が画面外)
  → ⚠ compact はカメラが主人公を追うので、(2b) は**画面内の札だけ**を判定している
    (画面外は `elementFromPoint` が null を返すため。件数は detail に必ず出る)

#### ⭐ 実装後の行番号(項目 3 / 項目 4 が使う)

| 何 | `tavern.html` | `town.html` |
|---|---|---|
| `<script src="js/npc-crowd.js">` | **2498** | **349** |
| NPC の CSS (`#npcLayer` / `.npcUnit` / `.npcShadow`) | **2292-2324**(`#npcLayer {` = 2303) | **294-326**(`#npcLayer {` = 305) |
| `var npcUnits = [];` | **8914** | **768** |
| `(function initNpcCrowd() {` | **8916** | **770** |
| NPC 1 体の DOM を作る `forEach`(⭐ 吹き出しの `click` / `touchend` はここへ) | **8928-8956** | **782-810** |
| `function npcPlace(u, cx, cy)`(⭐ 吹き出しの追従を足すならここ) | **8958** | **812** |
| `SPRITE` / `FOOT` / `SHEET_ROW_RIGHT` | 8510 / 8511 / 8512 | 408 / 409 / 410 |
| `MS_PER_TILE` | 8714 | 610 |
| 撤退スイッチの判定場所(`?npc=0` はここへ) | 先頭の `<script>`(`window.__tavernMapOn` を立てている IIFE) | **382-391**(`?heromark=0` / `?signplate=0` と同じ場所) |

⚠ 行番号は 1 本着地するだけで全部ずれる。**座標でなく構造(上の「何」の列)で探すこと。**
