# #25 銀の鹿亭を「歩ける D&D マップ」へ — 卓 3 つ(シナリオ1〜3)

- **起草**: 2026-08-26(計画窓) / **ステータス**: **承認済**(2026-08-26 ユーザー承認)
- **着手**: ⏸ **#24 の完了待ち。** #24 が着地したら窓更新を挟んで本チケットへ入る
- **前提**: **#24(`codex-map-request` スキル)が完了していること。** STEP1 は本スキルを呼ぶ
- **触るファイル**:
  - 新規 `assets/tavern_map.jpg`(codex1 納品を `make_grid_map.py` で焼いたもの)
  - 新規 `js/tavern-map.js`
  - 新規 `tools/verify_tavern_map.js`
  - 改修 `tavern.html`(内装を歩けるステージへ。⚠ **changelog が鳴るファイル**)
  - 改修 `tools/make_grid_map.py`(`GRIDS` へ `stag-tavern` を 1 件追記するだけ)
  - 改修 `tools/verify_recruit_size.js` / `tools/verify_quest_walk.js` / `tools/driver_depart_menu_clean.js`
    (⚠ §2-2 の罠 A。**卓を押すセレクタが 3 本とも壊れる**)
- ⛔ **触らないファイル**: 無し(2026-08-26 時点で `git status` は clean)。
  ⚠ ただし別窓が動き出したら `git add .` 禁止・ファイル単位 add・`git diff --cached <file>` を読んでから commit

---

## 1. 目的

銀の鹿亭は今、**斜め見下ろしの 1 枚絵**(`assets/tavern_bg.png` 1672x941)を `cover` で敷き、
その上に CSS の `.table`(楕円グラデ + 依頼人 PNG + 看板)を **`tableSlots` の %座標 6 枠**へ
絶対配置しているだけで、**マップデータを 1 バイトも持っていない**。

一方 **港町フラン `town.html` は既に「歩ける D&D マップ」として完成している**
(`assets/town_phlan.jpg` = 23x15 マス x 64px + `js/town-map.js` の `MASK`/`FACILITIES`/`findPath`)。
つまり雛形はもう在り、酒場だけが取り残されている。

**ユーザー決定(2026-08-26)**:

- **港町フラン方式(歩ける)** を採用。主人公の駒が酒場の床を歩いて依頼人の卓まで行く
- 卓は **3 つ = シナリオ1〜3**(廃坑 / 町外れの森 / 沼地)
- ⭐ 不採用 A: 「絵だけ俯瞰化(歩かない)」——既存ドライバもスマホ CSS も無傷で最小工数だが、
  town と操作感が割れる
- ⭐ 不採用 B: 「俯瞰の絵 + 駒は立つが歩かない」——「歩けそうに見えて歩けない」不整合が残る
- **長期方針**: 銀の鹿亭 / **復興評議会館(領主館)** / **ポドルプラザ** の 3 か所すべてを
  歩ける MAP にする。ポドルプラザは「闇の側だけでなく、**闇じゃない訳ありの人も立ち入る場所**」
  として概念ごと再設計する
- **本チケットは銀の鹿亭 1 枚だけ。** 復興評議会館は #26、ポドルプラザ MAP 化は #27(別途起草)

### ⚠⚠⚠ シナリオ4〜6 を路頭に迷わせないこと

卓を 3 つに減らすと、**シナリオ4〜6 の受注口がこの世から消えて進行が詰む**
(#26 の復興評議会館はまだ存在しない)。本チケットは **暫定の受け口**を必ず用意する(§5-STEP4)。
⭐ 暫定と分かる形にする = 新しい建物を作らず、**酒場の「奥へ続く扉」**に留める。
→ #26 が復興評議会館を作ったら、この扉ごと撤去する。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 今の銀の鹿亭の姿(全数)

⚠ 行番号は **2026-08-26 時点**。**着手前に必ず測り直す**(§2-4 に実例)。

| ファイル:行 | 何 |
|---|---|
| `tavern.html:37` | `background: #1a120a url('assets/tavern_bg.png') center center / cover no-repeat;` |
| `tavern.html:44-62` | `#wallTop { display:none }` / `#fireplace`(一枚絵の暖炉 x50% y58% に重ねる微光) |
| `tavern.html:93-97` | `#tableArea { position:absolute; inset: 55% 8% 100px 8%; z-index:5 }` |
| `tavern.html:98-134` | `.table` / `.tableTop`(楕円の円卓 170x46px) |
| `tavern.html:875-916` | ⚠ `@media (max-width:560px)` — 卓を **2 列スクロールグリッド**へ組み替える(§2-3) |
| `tavern.html:1964-1973` | `#tavern > #wallTop / #fireplace / #title / #tableArea` |
| `tavern.html:2238` | `const scenarios = [` … 6 件 |
| `tavern.html:4199-4203` | `isUnlocked(sc)` = `progress.cleared.has(sc.unlockAfter)` |
| `tavern.html:4209-4216` | `const tableSlots = [` … **%座標 6 枠** |
| `tavern.html:4238-4269` | `renderTables()` — `scenarios.forEach` して `.table` を 6 枚作る |
| `tavern.html:6819-6826` | `#townExit` のクリックで `exitVia="tavern"` → `town.html` |

`assets/tavern_bg.png` = **1672 x 941 / 2,514,577 bytes**。
⚠ **64 の倍数ではない**(26.125 x 14.70 マス)ので、**そのままではタイル格子に乗らない**。

`#tavern` の中に同居している要素(⭐ **これらは全部そのまま残す**):
`#dialog` / `#prep` / `#changelogBox` / `#questBoard` / `#plazaDoor` / `#plazaScreen` / `#shopScreen`。

### 2-2. 罠 A ⚠⚠⚠ — `#tableArea .table` を押す golden が **ちょうど 3 本**ある

リポジトリ全文 grep で実測(`grep -rn 'tableArea' tools/*.js`):

| ファイル:行 | コード |
|---|---|
| `tools/verify_recruit_size.js:333` | `const t = document.querySelector('#tableArea .table');` |
| `tools/verify_quest_walk.js:636` | 同上 |
| `tools/driver_depart_menu_clean.js:147` | 同上 |

3 本とも同じ形の**ポーリングループ**で「見えているものを片端から押して出発まで進む」:

```js
for (let i = 0; i < (maxSteps || 150); i++) {      // 150 x 420ms = 63 秒の予算
  const st = await page.evaluate(...);             // btnAccept → .table の順に押す
  await sleep(420);
}
```

**歩きを挟むと、押した瞬間には卓が開かない。** #23 で `verify_recruit_size` が
「遷移を 1 段挟んだだけで全滅した」のと**同じ壊れ方**である。

⚠⚠ さらに悪いことに、**420ms ごとに再クリックが飛ぶ**。`town.html` の `walkPath()` は
先頭で `stopWalk()` して `t0 = now` を打ち直すので(`town.html:583`)、
**再クリックのたびに現在タイルの補間がやり直しになる**。`MS_PER_TILE = 340` に対して
ポーリングが 420ms なので今回はぎりぎり進むが、**これは偶然であって設計ではない**。

⭐⭐⭐ **だから `goToTable()` には `town.html` の `goToFacility()` に無いガードを足す**:

```js
// ⚠ town.html:657 の goToFacility() を写経しないこと。あちらは 1 回だけ押される前提。
//   酒場の卓は golden ドライバが 420ms ごとに押し続けるので、同じ卓へ歩行中の
//   再クリックは **黙って無視**する (無視しないと歩きが再起動し続ける)。
//   → 負のコントロール `reclick` がこれを機械証明する。
if (walkingTo === key) return;
```

**3 本の直し方**(⛔ 期待値を緩めない・⛔ `?tavernmap=0` で逃げない):

```js
// 卓は id を持つ。#tableArea は撤退時にしか存在しないので、両方を見る。
const t = document.querySelector('#questTable_goblin-mine, #tableArea .table');
```

⭐ `goblin-mine` を名指しにするのは、3 本とも「**最初の卓 = 未解放でない卓**」を
押しているからである(`scenarios[0]` = `goblin-mine` は `locked:false`)。

### 2-3. 罠 B ⚠⚠ — スマホ用 CSS が卓を「2 列スクロールグリッド」へ組み替えている

`tavern.html:877-916`:

```css
@media (max-width: 560px) {
  #tableArea { inset:auto; top:46%; left:4%; right:4%;
               display:grid; grid-template-columns:1fr 1fr; overflow-y:auto; }
  .table { position: relative !important; left:auto !important; top:auto !important; }
  .tableTop, .floorTag { display: none; }
  body #plazaDoor { top: calc(80px + env(safe-area-inset-top)); right:6px; width:54px; height:96px; }
}
```

**歩けるマップとは原理的に両立しない**(タイル座標を `position:relative` で潰している)。
`town.html` はこの問題を **zoom** で解いている(`town.html:466-480`):

```js
if (compact) {
  // ⭐ compact は「全体を入れる」ではなく **可視域を満たす** 倍率
  zoom = Math.min(1.5, Math.max(vw / MAP_W, avail / MAP_H, 34 / TILE));
} else {
  zoom = Math.min(vw / MAP_W, avail / MAP_H);
}
```

⚠ `avail` は「画面から**上下の帯を引いた**残り」。引かずに中央へ寄せると
**いちばん大事な看板がタイトル帯の下に潜る**(1440x900 で実際に起きた)。
酒場は `#title`(上)と `#questBoard`(左下)/`#changelogBox`(右上)が帯に当たる。

⛔ **`@media (max-width:560px)` の卓まわりのブロックは、マップ側では丸ごと無効にする。**
削除ではなく **`body:not(.tavernMapOn)` で括る**(撤退スイッチで元へ戻すため)。

### 2-4. 罠 C ⚠ — 行番号のコメントは実際にズレている(この場で実測)

`js/world-map.js:24` はこう書いている:

```
★ 札の文言 (label) の唯一の正は **tavern.html の `place:`** (`:2221` 廃坑 ほか)。
```

実測すると `place: "廃坑"` は **`tavern.html:2241`** に在る。**20 行ズレている**。
⭐ 依頼書の行番号を信じずに毎回 `grep -n` すること(#6 は 8/8 件、#11 は 11 件中 4 件ズレた)。

⚠⚠ この `place:` は **`js/world-map.js` の `label` と意図的に重複させてある**。
`tools/verify_world_map.js` の (7a) が**配信中の `tavern.html` の実体と機械照合**して
ドリフトを止めているので、**`place:` の文字列を 1 文字も変えないこと**。

### 2-5. 素材パイプライン(#24 のスキルで確立済み)

| 段 | コマンド |
|---|---|
| 発注 | `codex-map-request` スキル → `codex1/requests/2026-08-26_stag-tavern-map.md` → `py tools/codex_request.py --request <md>` |
| 測る | `py tools/make_grid_map.py --fit "<納品 png>" --tile 64` |
| 焼く | `GRIDS` へ `stag-tavern` を追記 → `py tools/make_grid_map.py --name stag-tavern` |
| 検算 | `py tools/make_grid_map.py --check assets/tavern_map.jpg --tile 64` |

**基準の再現**(#24 §2-3 で確認済み): `phlan-harbor` の 6 数値
(位相 33.40 / 7.25、周期 63.945 / 64.410、マス数 23 / 15)を素材から**小数点以下まで復元**できた。

⚠⚠ **マス数は発注する値ではなく測って出てくる値**。1536x1024 の納品でも
`(1536-33.40)/63.945 = 23.49` → **23 マス**であって 24 ではない。
⛔ 依頼文に「N x M マスで」と書かないこと。

### 2-6. 改行コード(⚠ パッチで壊しやすい)

| ファイル | 実測 |
|---|---|
| `tavern.html` | **CRLF** (6,854 行すべて) |
| `js/town-map.js` / `実装依頼書/*.md` | LF |

⚠ `core.autocrlf=true` なので **`git diff` では気づけない**(手がかりは LF/CRLF 警告 1 行だけ)。
Python で `tavern.html` を書き換えるなら **読みも書きも `newline=""`** にし、
パッチ文字列の改行も CRLF に揃えること(2026-08-25 に 1 回踏んでいる)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` = `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`。

**`tavern.html` を触るので鳴る。** ⭐ そして**書けるプレイヤー向けの要約が実在する**:

> 「銀の鹿亭が見下ろしの地図になった — 主人公が酒場の床を歩いて依頼人の卓まで行く」

⚠ dev-loop で 4 項目に割る場合、**changelog はこの `tavern.html` を触る項目のコミットに載せる**。
orchestrator が着手前にどのコミットへ入れるかを決めて worker へ渡すこと。

### 2-8. 既存 golden のベースライン(**2026-08-26 本窓で実測**)

| ドライバ | 実測 | 本チケットの影響 |
|---|---|---|
| `tools/verify_recruit_size.js` | **82/82** | ⚠ **必ず赤くなる**(§2-2 罠 A)。セレクタを直して 82/82 へ戻す |
| `tools/verify_quest_walk.js` | **25/25** / `--negative` **46/46**(PENDING 0) | ⚠ **必ず赤くなる**(同上)。直して 25/25 へ戻す |
| `tools/driver_depart_menu_clean.js` | **41/41** | ⚠ **必ず赤くなる**(同上)。直して 41/41 へ戻す |

⚠ 下は**記録であって実測ではない**。着手前に自分で走らせて数を確かめること。

| ドライバ | 記録 | 出所 |
|---|---|---|
| `tools/verify_world_map.js` | 57/57 / `--negative` 44/44 | `cac0454`(2026-08-26) |
| `tools/verify_town_map.js` | 85/85 | #15 |
| `tools/verify_town_exit.js` | 23/23 / `--negative` 4/4 | #22 |
| `tools/verify_title_screen.js` | **86/86**(⚠ レシピ集の 83/83 は古い) | #23 実装結果 |
| `tools/verify_save_slots.js` | 30/30 | #5 |
| `tools/driver_bgm_town.js` | 37/37 | #17/#21 |

⭐ `verify_world_map.js` の (7a) は `tavern.html` を**配信して実体を読む**ので、
`place:` を触らない限り無傷のはず。**触っていないことの証拠として必ず走らせる**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `assets/tavern_map.jpg` | **新規**。codex1 納品を `make_grid_map.py --name stag-tavern` で焼く |
| `js/tavern-map.js` | **新規**。`COLS`/`ROWS`/`TILE`/`MASK`/`LEGEND`/`TABLES`/`DOORS`/`findPath`/`spawnFor` |
| `tavern.html` | 内装を歩けるステージへ。⛔ `#dialog`/`#prep`/`#shopScreen`/`#plazaScreen` の中身は触らない |
| `tools/make_grid_map.py` | `GRIDS` へ `stag-tavern` を **1 件追記するだけ** |
| `tools/verify_tavern_map.js` | **新規**(`--negative` 内蔵) |
| `tools/verify_recruit_size.js` | 卓のセレクタ 1 行(`:333`) |
| `tools/verify_quest_walk.js` | 卓のセレクタ 1 行(`:636`) |
| `tools/driver_depart_menu_clean.js` | 卓のセレクタ 1 行(`:147`) |
| `codex1/requests/2026-08-26_stag-tavern-map.md` | **新規**(発注文。⚠ codex1 側なので本リポジトリの commit には入らない) |

⛔ `index.html` / `town.html` / `world.html` / `js/town-map.js` / `js/world-map.js` / `audio.js` は開かない。
⛔ `assets/tavern_bg.png` は**消さない**(撤退スイッチが使う)。

---

## 4. STEP1 — Codex へ MAP を発注する(#24 のスキルを使う)

⭐ **`codex-map-request` スキルを呼ぶこと。** 手で書かない。スキルが足りなければ
その場で直し、**§12 に「スキルのどこが足りなかったか」を書く**(#24 §9 の指定)。

発注する内容(スキルの「段 1」で決める 5 つ):

| 決める | 本件の値 |
|---|---|
| 用途 | **屋内**(酒場の 1 階ホール)。tabletop battle map ではなく**居住空間** |
| 貼り先 | `GRIDS["stag-tavern"]` → `assets/tavern_map.jpg` |
| 1 マス px | **64**(`town_phlan` と同じ。`js/town-map.js:45` と揃える) |
| 歩ける床の割合 | ⚠ **6 割以上**。卓・樽・柱で埋めると `findPath` が通らない |
| 捨ててよい外周 | 外周 1 マスは**石壁と木の羽目板**にして、歩ける床を置かせない |

依頼文に必ず入れる要件(⭐ `~/.codex/skills/dnd-map-maker/SKILL.md` の
generation prompt template を土台に、#24 §2-4 / §2-5 の要件を足す):

- **厳密な真俯瞰**(strict orthographic top-down)。⚠ 卓・暖炉・階段・カウンターを
  **正面顔で描かせない**(SKILL.md の overhead-view audit が対象にしている失敗)
- **1 マス 64px 相当の等間隔格子**を薄く焼き込む。⛔ **マス数は指定しない**(#24 §2-4)
- **文字・室名・トークン・人物を描かない**(依頼人は既存 `assets/client_*.png` を重ねる)
- 置いてほしいもの: **大きな円卓 3 つ**(離して配置)/ **暖炉**(北壁)/ **カウンター**(酒樽)/
  **入口の扉**(南)/ **奥へ続く扉**(北東)/ **地下への石段**(南西 = 闇市の入口)
- ⭐ 末尾に「指標と本文が食い違ったら**閾値をいじらず数値で差し戻してほしい**」(#24 §2-5)

⚠ 投下前に `--dry-run` でヘッダ全文を読む → `--sandbox read-only` で下見 → 本番。

---

## 5-STEP2. `js/tavern-map.js`

`js/town-map.js` と**同じ形**にする(写経ではなく同型。読む人が 1 度覚えれば済むように)。

```js
(function (global) {
  "use strict";
  var COLS = <測って決める>, ROWS = <測って決める>;   // ★--fit の出力が唯一の正
  var TILE = 64;                                      // ★assets/tavern_map.jpg を焼いた 1 マス

  /* ── 通行マスク ───────────────────────────────────────────────────
   *   `.` 歩ける / `W` 石壁・羽目板 / `T` 卓と椅子 / `F` 暖炉 / `C` カウンター・酒樽
   *   ⚠ **歩けない理由を 1 語にまとめない** (town-map.js の LEGEND と同じ作法)。
   *     理由別に分けておくと probe で色分けでき、絵とのズレが目で見える。
   */
  var MASK = [ /* ROWS 本。--fit のマス数と 1 行も違ってはいけない */ ];

  /* ── 卓 (= 依頼人の席) ────────────────────────────────────────────
   *  ⭐ scenarioId の唯一の正は tavern.html の scenarios[].id。ここには **id だけ**を持ち、
   *     place / difficulty / client は **1 文字も写さない** (同じページなので重複させる理由が無い)。
   *  enter … そこまで歩いてから話しかけるタイル
   *  sign  … 席札を浮かせるタイル (歩けなくてよい)
   *  ⚠ enter は必ず MASK が "." であること (受入条件 (1b) が 0 件を保証する)
   */
  var TABLES = [
    { key: "t1", scenarioId: "goblin-mine",    enter: [c, r], sign: [c, r] },
    { key: "t2", scenarioId: "bandits-forest", enter: [c, r], sign: [c, r] },
    { key: "t3", scenarioId: "lizard-swamp",   enter: [c, r], sign: [c, r] }
  ];

  /* ── 扉 ──────────────────────────────────────────────────────────
   *  town  … 町へ出る (exitVia="tavern" を書いて town.html へ)
   *  back  … ⚠⚠ **暫定**。シナリオ4〜6 の受け口 (#26 の復興評議会館ができたら丸ごと撤去)
   *  plaza … 闇市への石段。⚠ 解禁前は **DOM に作らない** (town.html の作法と同じ。
   *          display:none で残すと押せてしまう事故の芽になる)
   */
  var DOORS = [
    { key: "town",  name: "町へ出る",     enter: [c, r], sign: [c, r], desc: "港町フランの通りへ" },
    { key: "back",  name: "奥の間へ",     enter: [c, r], sign: [c, r], desc: "格の違う依頼はこの奥で", provisional: true },
    { key: "plaza", name: "地下への石段", enter: [c, r], sign: [c, r], desc: "牙貨だけが物を言う", requiresPlazaUnlock: true }
  ];

  /* ── 立ち位置 ─────────────────────────────────────────────────────
   *  規則は town-map.js と 1 本: **酒場へ入るときは、直前に居た場所の前に立つ。**
   *  ⚠ 未知の値 / 欠損では必ず "door"(入口の扉の内側)へ落とす (fail-safe)。
   */
  var SPAWNS = { door: [c, r], town: [c, r], dungeon: [c, r], back: [c, r], plaza: [c, r] };

  // findPath は town-map.js と同じ 4 近傍 BFS。⛔ 8 近傍にしない (#12 で前提が崩れた)
  global.TAVERN_MAP = { COLS, ROWS, TILE, MASK, LEGEND, TABLES, DOORS, SPAWNS,
                        inBounds, tileAt, isWalkable, findPath, spawnFor };
})(typeof window !== "undefined" ? window : this);
```

⚠⚠ **`tavern.html` に `<script src="js/tavern-map.js"></script>` を書き忘れないこと。**
⚠ #23 で `tavern.html` が `js/world-map.js` を読み込んでいないことに気づかず、
**「何も起きないのに assert が 5 本とも緑」**という事故が実際に起きている。
→ 受入条件 (0a) がこれを母集団ガードとして見る。

---

## 6-STEP3. `tavern.html` の内装を歩けるステージへ

### 6-1. DOM(`#tableArea` の**隣**に足す。`#tableArea` は消さない)

```html
<div id="tavern">
  <div id="wallTop"></div>
  <div id="fireplace"></div>
  <div id="title">銀の鹿亭 …</div>

  <!-- ★歩けるマップ (tavernMapOn のときだけ存在する) -->
  <div id="tavernViewport">
    <div id="tavernStage">
      <img id="tavernMapImg" src="assets/tavern_map.jpg" alt="" draggable="false">
      <div id="tavernGoal"></div>
      <div id="tavernHeroShadow"></div>
      <div id="tavernHero"></div>
    </div>
  </div>

  <!-- ★従来の 6 卓。?tavernmap=0 のとき / 「奥の間」の中身として再利用する -->
  <div id="tableArea"></div>
  …
```

### 6-2. 描画・歩行・カメラ

`town.html:380-700` と**同型**にする。⭐ 使い回す規則:

- `placeHero()` は **足元をタイル中心**に置く(`elHero.style.top = cy - SPRITE*FOOT`)
- スプライトは `assets/<HERO_CLASS>_walk.png`。⚠ 未知のクラスキーは `warrior` へ落とす
- `MS_PER_TILE = 340`(town / world と揃える。⛔ ここだけ速くしない)
- コマ送りの除数 `190` は **`MS_PER_TILE` と同率**(170:95 を保つ)。片方だけ動かすと滑って見える
- `layout()` / `applyCamera()` は `insets()` で**帯を引く**(§2-3)。
  ⚠ 酒場の帯は `#title`(上)。compact では `#questBoard` / `#changelogBox` が下と右上に来る

### 6-3. 卓を押したときの流れ(⭐ ここが罠 A の対策)

```js
var walkingTo = null;                    // ★同じ行き先への再クリックを吸収する (罠 A)
function goToTable(t) {
  var sc = scenarios.find(function (s) { return s.id === t.scenarioId; });
  if (!sc) { console.warn("[tavern] 卓の scenarioId が scenarios に無い", t); return; }
  var ec = t.enter[0], er = t.enter[1];
  if (hero.c === ec && hero.r === er) { openDialog(sc, isUnlocked(sc)); return; }
  if (walkingTo === t.key) return;       // ★★ 歩行中の再クリックは黙って無視
  walkingTo = t.key;
  var ok = walkTo(ec, er, function () {
    walkingTo = null;
    openDialog(sc, isUnlocked(sc));
  });
  // 入場タイルへ行けない = マスクの不具合。黙って何も起きないのが最悪なので、その場で開く
  if (!ok) { walkingTo = null; openDialog(sc, isUnlocked(sc)); }
}
```

席札の DOM(⭐ **id を安定させる**。3 本の golden がこれを押す):

```js
s.id = "questTable_" + t.scenarioId;     // 例 questTable_goblin-mine
s.setAttribute("data-scenario", t.scenarioId);
```

⚠ **未解放の卓も 3 つとも出す**(今日の挙動を保つ = `place` が `???`、`diff` が `— 未解放 —`)。
⛔ #23 の world.html のように隠さない。酒場は「次がある」ことがプレイヤーに見えている必要がある。

### 6-4. 扉

- `town` … `sessionStorage["dragonfighters.exitVia"] = "tavern"` → `location.href = "town.html"`
  ⛔ **クエリを足さない**(#6 / #12 の確定作法)。⭐ 既存 `#townExit` ボタンは**残す**
- `back` … §7-STEP4 の暫定オーバーレイを開く
- `plaza` … 既存 `#plazaScreen` を開く(`plazaStateTV.unlocked` が唯一の正)。
  ⚠ **解禁前は DOM に作らない**

---

## 7-STEP4. シナリオ4〜6 の暫定受け口(⚠ 詰み防止・#26 で撤去)

⭐⭐⭐ **新しい画面を作らない。既存の `#tableArea` と `renderTables()` をそのまま使う。**

```js
// 「奥の間へ」の扉に着いたら、#tableArea を **シナリオ4〜6 だけ**で描いてオーバーレイ表示する。
// ⚠⚠ これは #26 (復興評議会館) が来るまでの暫定。扉ごと撤去する前提で作ること。
// ⭐ 既存 renderTables() に「どのシナリオを描くか」を引数で渡す形へ広げるだけ。
//   CSS (.table / .sign / .clientArt / @media 560px のグリッド) は 1 行も変えずに済む。
function openBackroom() {
  renderTables(scenarios.slice(3));        // ★ orc-fort / undead-temple / dragon-lair
  document.getElementById("tableArea").classList.add("backroomOpen");
}
```

⚠ `renderTables()` は現在 `scenarios.forEach` を直書きしているので(`tavern.html:4241`)、
**引数を取る形へ広げる**。既定は撤退スイッチ用に `scenarios`(6 件)のまま。

⛔ **暫定であることをコードのコメントに書く**。#26 の実装窓がこれを見て消せるように。

---

## 8. 撤退スイッチ

- **`?tavernmap=0`** — 従来の姿(1 枚絵 `assets/tavern_bg.png` + `tableSlots` の 6 卓)へ戻る
- **判定位置** = `tavern.html` の初期化冒頭。`document.body.classList.toggle("tavernMapOn", ON)`
  を 1 か所で行い、CSS はすべて `body.tavernMapOn` / `body:not(.tavernMapOn)` で分岐
- **ページ遷移をまたぐか = またがない。** クエリは遷移を越えないので、`town.html` や
  `index.html` は一切関知しない(`?heromark=0` と同じ、ページ単位で完結する型)
- ⚠ OFF のときは `#tavernViewport` を **DOM から remove する**(display:none で残すと
  `elementFromPoint` に写って受入条件が濁る)

---

## 9. 受入条件 — `tools/verify_tavern_map.js`(新規)

`tools/verify_town_map.js` を流用する(実 Chrome を `puppeteer-core` で直駆動 + http 配信)。
⭐⭐ **測定装置に配信バイトの凍結を内蔵**する(別窓の並走で汚れない)。
⭐ 未実装の節は `pending()` で **PENDING を明示出力**する(3 値表示。完了条件 = PENDING 0)。

### §0 装置(先に母集団を確かめる)

- **(0a)** `window.TAVERN_MAP` が**実際に載っている**
  ⭐⭐⭐ **これが無いと以下が全部空振りで永久緑になる**(#23 で `js/world-map.js` の
  `<script src>` を書き忘れ、5 本の assert が緑のまま何も起きなかった事故の再発防止)
- **(0b)** `TAVERN_MAP.MASK.length === TAVERN_MAP.ROWS` かつ全行の長さ `=== COLS`
  (⚠ **`GRIDS["stag-tavern"].cells` から引く**。ドライバに数を直書きしない)
- **(0c)** `assets/tavern_map.jpg` の実寸が `COLS*64 x ROWS*64` と一致

### §1 マップと絵が食い違っていない

- **(1a)** `py tools/make_grid_map.py --check assets/tavern_map.jpg --tile 64` が**縦横とも OK**
  (累積ドリフト ≤ 4.0 / 位相ズレ ≤ 2.0 / score 比 ≥ 70%)
- **(1b)** `TABLES` と `DOORS` の `enter` タイルが **全件 `isWalkable`**(0 件の例外)
- **(1c)** 入口の spawn タイルから **3 卓すべてと全ての扉へ `findPath` が通る**
  ⚠⚠ **1 つずつ試して緑では足りない**(#23 の「街道網は環状なので単体テストでは永久に緑」)。
  ⭐ **`spawnFor("door")` から到達できるタイルを塗りつぶし、`enter` が全部その集合に入る**ことを見る

### §2 卓が 3 つで、シナリオ1〜3 に対応している

- **(2a)** `#tavernStage` 上の席札がちょうど **3 枚**、id は
  `questTable_goblin-mine` / `questTable_bandits-forest` / `questTable_lizard-swamp`
- **(2b)** ⭐ **2 経路の突き合わせ**: `TAVERN_MAP.TABLES[].scenarioId` の 3 件が、
  **`tavern.html` の `scenarios[].id` の先頭 3 件と完全一致**する
  (写経ではなく、ページから両方を読んで比べる)
- **(2c)** 席札の文言が `scenarios[].place` から生成されている
  (`place` を書き換えると札も変わる = 写しを持っていない)
- **(2d)** 未解放の卓(`bandits-forest` / `lizard-swamp`)は **DOM に在り**、
  かつ `???` 表示である(⛔ 隠していない)

### §3 歩いて着いてから開く

- **(3a)** `questTable_goblin-mine` を 1 回押すと、**押した直後は `#dialog` が閉じたまま**で、
  主人公が `TABLES[0].enter` へ到達した**後に**開く
- **(3b)** ⭐ **罠 A の対策が効いている**: 420ms 間隔で**同じ卓を 6 回押し続けても**
  主人公は前進し、**5 秒以内に到達してダイアログが開く**
  (⚠ これが `verify_recruit_size` 等 3 本の生死そのもの)
- **(3c)** 歩けないタイルを押しても**動かない**(隣接まで寄せる救済を入れない)

### §4 扉

- **(4a)** 「町へ出る」で `exitVia === "tavern"` が書かれ、`town.html` へ遷移する。
  ⛔ **URL にクエリが 1 文字も付かない**
- **(4b)** 「奥の間へ」で `#tableArea` が開き、**シナリオ4〜6 の 3 卓だけ**が並ぶ
  (⚠ 暫定。#26 で消える節であることをコメントに明記)
- **(4c)** 闇市の石段は `plazaState.unlocked === false` のとき **DOM に存在しない**
  (⛔ `display:none` で残っていたら赤)

### §5 compact(縦画面)

- **(5a)** 390x844 で `zoom` が **34/64 以上**(1 マス 34px 未満にならない)かつ **1.5 以下**
- **(5b)** `#title` の下に席札が潜っていない
  (`#title` の矩形と 3 枚の席札の矩形が**交差 0 件**)
- **(5c)** `@media (max-width:560px)` の 2 列グリッドが **効いていない**
  (`#questTable_*` の `position` が `relative` ではない)

### §6 恒等(非退行)

- **(6a)** `scenarios` は **6 件のまま**(⛔ 卓を 3 つにするために配列を削らない)
- **(6b)** `tavern.html` の `place:` 6 件の文字列が HEAD と 1 文字も違わない
  (⚠ `verify_world_map.js` の (7a) がこれを見ている。§2-4)
- **(6c)** `#dialog` / `#prep` / `#shopScreen` / `#plazaScreen` の DOM 構造が HEAD と同一

### §7 撤退

- **(7a)** `tavern.html?tavernmap=0` で `#tavernViewport` が **DOM に存在しない**
- **(7b)** 同 URL で `#tableArea .table` が **6 枚**あり、`assets/tavern_bg.png` が敷かれている
- **(7c)** ⭐ **撤退の受入は「OFF で緑」ではなく、同じ条件を ON/OFF 両方へ当てて崩れること**
  (#22 の (5c) と同じ作法)

### ⛔ 測らないこと

- **`MS_PER_TILE` の値**。実機体感で動かす余地を残す(§10)
- **BGM**。酒場の曲は #17 のままで、本チケットは 1 行も触らない
- **絵の内容**(卓の意匠・暖炉の位置)。目で見て良し悪しを決める領域
- **`#questBoard` / `#changelogBox` の位置**。HUD のままにする(§11)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nomapjs` | `<script src="js/tavern-map.js">` の 1 行を消す | **(0a)** — ⭐ #23 で実際に起きた「読み込んでいないのに全部緑」の再現 |
| `reclick` | `goToTable` の `if (walkingTo === t.key) return;` を消す | **(3b)** — ⭐⭐⭐ **罠 A の再現**。再クリックで歩きが再起動し続ける |
| `instant` | 卓のクリックで歩かずに即 `openDialog` | **(3a)** — 「歩いてから開く」が死ぬ |
| `gatetable` | `TABLES[0].enter` を壁タイル(`W`)へずらす | **(1b)** と **(1c)** — ⚠ 扉システムで踏んだ「出口ゲートに置くと詰む」の同型 |
| `dropscen` | `scenarios` から 4〜6 を配列ごと削る | **(6a)** と **(4b)** — 卓を 3 つにするのに配列を削る誘惑 |
| `hidelock` | 未解放の卓を DOM に作らない | **(2d)** — 「次がある」が見えなくなる |
| `copyplace` | `js/tavern-map.js` に `place` の文字列を写して札をそこから描く | **(2c)** — 二重管理のドリフト |
| `gridsize` | `MASK` を 1 行削る(ROWS と食い違わせる) | **(0b)** — 絵とマスクの寸法ズレ |
| `plazashow` | 闇市の石段を `display:none` で DOM に残す | **(4c)** |
| `noretreat` | `?tavernmap=0` の分岐を握り潰す | **(7a)(7b)** |

⭐ **§2-2 の罠 A を再現する変異は `reclick`。** これが赤くならない装置は、
3 本の golden がなぜ壊れたのかを何も理解していない。

### 既存 golden の非退行(実装後に必ず走らせる)

| ドライバ | 期待 | 備考 |
|---|---|---|
| `node tools/verify_recruit_size.js` | **82/82** | ⚠ セレクタ修正**後**の値。修正前は必ず赤 |
| `node tools/verify_quest_walk.js` | **25/25**(`--negative` **46/46**) | 同上 |
| `node tools/driver_depart_menu_clean.js` | **41/41** | 同上 |
| `node tools/verify_world_map.js` | 57/57(`--negative` 44/44) | ⭐ (7a) が `place:` を見るので**必ず走らせる** |
| `node tools/verify_town_map.js` | 85/85 | 記録値。走らせて確かめる |
| `node tools/verify_town_exit.js` | 23/23(`--negative` 4/4) | 記録値 |
| `node tools/verify_title_screen.js` | 86/86 | ⚠ レシピ集の 83/83 は古い |
| `node tools/verify_save_slots.js` | 30/30 | 記録値 |
| `node tools/driver_bgm_town.js` | 37/37 | ⚠ (0b) が件数直書き。曲を足さないので赤くならないはず |

⚠ 上の 3 本(recruit / quest_walk / depart_menu)以外が赤くなったら、**実装が範囲を越えている**。
⚠ 基準値は 2026-08-26 時点の記録。走らせて違ったら**期待値を書き換える前に理由を突き止める**。

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレ音声が鳴らない)。

1. **酒場を横切る時間**。23 マス x 340ms = 約 8 秒。**卓へ行くだけなら 3〜5 秒**のはず。
   ⭐ 長すぎたら動かすのは `MS_PER_TILE` であって**マップの大きさではない**
2. **卓が「席」に見えるか**。席札とスプライトが円卓の絵の上に乗っているか
   (⚠ 足元をタイル中心に置く規則なので、卓の**手前**に立つ)
3. **依頼人ポートレイト**(`assets/client_*.png`)が俯瞰の床の上で浮いて見えないか。
   ⚠ 浮くなら卓の絵の側(codex への再依頼)で直す。**コードで縮めて誤魔化さない**
4. **compact(iPhone 縦)** で 3 卓が見つけられるか。カメラが主人公を追ったとき
   卓が画面外に出っぱなしにならないか
5. **暖炉の微光**(`#fireplace`)が新しい絵の暖炉と重なっているか
   (⚠ 今の座標 x50% / y58% は**旧 1 枚絵**に合わせたもの。**必ずずれる**)
6. **iOS Safari の実タップ**(`click` 非発火端末があるので `touchend` 併用を確認)

---

## 11. changelog(⚠ `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>銀の鹿亭が見下ろしの地図になった</b> — 主人公が酒場の床を歩いて依頼人の卓まで行くようになった。手前の三つの卓で最初の三つの依頼を受けられる。"
```

⚠ dev-loop で 4 項目に割るなら、**`tavern.html` を触る項目のコミット**へ載せる
(orchestrator が着手前に決めて worker へ渡す)。
⛔ `--no-verify` / `-c core.hooksPath=` はハーネスが全部ハードブロックする。迂回路は無い。

---

## 12. やらないこと

- ⛔ **復興評議会館(領主館)の新設** → **#26**。本チケットは「奥の間へ」の暫定扉まで
- ⛔ **ポドルプラザの MAP 化と概念の再設計** → **#27**。`#plazaScreen` は今日のまま
- ⛔ **`#questBoard`(酒場の掲示板 = 生成クエスト)を卓へ置くこと**。HUD パネルのまま残す
- ⛔ **`#changelogBox` の移設**
- ⛔ **`assets/tavern_bg.png` の削除**(撤退スイッチが使う)
- ⛔ **`MS_PER_TILE` を酒場だけ速くすること**(town / world と揃える)
- ⛔ **`scenarios` 配列から 4〜6 を削ること**(受入条件 (6a) / 変異 `dropscen`)
- ⛔ **`place:` の文字列を変えること**(`verify_world_map.js` の (7a) が壊れる)
- ⛔ **`tools/make_grid_map.py` の `GRIDS` 以外の変更**(#24 の受入条件 (3a) を壊す)
- ✅ **`実装依頼書/README.md` の #25 行は承認時(2026-08-26)に追加済み**。並走窓が無いため
  保留不要だった(#19 / #22 と同じ判断)。**実装完了後はステータスと進行度だけ更新する**。追加した行:

    | 25 | [2026-08-26_stag-tavern-dnd-map.md](2026-08-26_stag-tavern-dnd-map.md) | **承認済** | 0% | 銀の鹿亭を 1 枚絵から**歩ける D&D マップ**へ(港町フラン方式)。卓 3 つ = シナリオ1〜3。⚠⚠⚠ **`#tableArea .table` を押す golden がちょうど 3 本**(`verify_recruit_size:333` / `verify_quest_walk:636` / `driver_depart_menu_clean:147`)あり、歩きを 1 段挟むと #23 と同じ壊れ方をする → セレクタを `#questTable_goblin-mine` へ。⭐⭐⭐ **`goToTable` には town.html の `goToFacility` に無い「同じ卓へ歩行中の再クリックを無視する」ガードが要る**(ドライバは 420ms ごとに押し続け、`walkPath` は先頭で `stopWalk()` して `t0` を打ち直す)→ 変異 `reclick` が機械証明。⚠⚠ `@media (max-width:560px)` の 2 列グリッドはマップと原理的に両立しない → `body:not(.tavernMapOn)` で括る(削除しない)。⚠ **シナリオ4〜6 は「奥の間へ」の暫定扉へ逃がす**(消すと進行が詰む。#26 で撤去)。⚠ `js/world-map.js:24` の `tavern.html:2221` は実体 **2241** で 20 行ズレていた。⚠ `tavern.html` は **CRLF**。ベースライン実測 = recruit 82/82 / quest_walk 25/25 + neg 46/46 / depart_menu 41/41(2026-08-26)。撤退 = `?tavernmap=0` |

---

## 13. 実装結果

**✅ 完了(2026-08-28)。** STEP1+2 を別窓が 1 コミットで、STEP3 以降を dev-loop 4 項目で回し、
**停止 0 回**(4 項目分割の 7 例目)。

### 13-1. コミット

| コミット | 内容 |
|---|---|
| `8036ce5` | **STEP1 + STEP2** — 銀の鹿亭 MAP を codex へ発注・受入・格子へ焼き付け / `js/tavern-map.js` 新設(別窓・push 済) |
| `638b479` | **項目1** — `tools/verify_tavern_map.js` を新規作成。§0〜§7 の枠を**全部宣言**し、未実装は `pending()` で明示 PENDING(5 本だけ実装) |
| `4aaea2b` | **項目2** — STEP3 `tavern.html` 改修 + STEP4「奥の間へ」の暫定扉。⭐ **changelog はここ**(`GAME_LOGIC` を鳴らすのはこのコミットだけ) |
| `d80e7f7` | **項目3** — `verify_tavern_map.js` を埋める(素 **42/42** / `--negative` **66/66** / **PENDING 0**) |
| `037726a` | **項目4** — golden 3 本のセレクタを席札へ(82/82・25/25・41/41 復帰) |
| (本コミット) | **項目4** — §13 実装結果を記入 / `README.md` の #25 を完了へ |

### 13-2. 新規 driver `tools/verify_tavern_map.js`

| 走らせ方 | 実測 | PENDING |
|---|---|---|
| `node tools/verify_tavern_map.js` | **42/42 PASSED / FAILED 0** | **0** ✅ |
| `node tools/verify_tavern_map.js --negative` | **66/66 PASSED / FAILED 0** | **0** ✅(変異 10 本すべて実装済・空振り 0) |

**変異 10 本 → どの節を赤くしたか**(項目3 の実測):

| 変異 | 差し替え先 | 担当 | 一緒に赤くなる | 緑のまま |
|---|---|---|---|---|
| `nomapjs` | `tavern.html` | (0a) | (2a)(2b)(2c)(2d)(4c) | (6a)(6b)(6c) |
| `reclick` | `tavern.html` | **(3b)** | — | (3a) |
| `instant` | `tavern.html` | (3a) | (3b) | — |
| `gatetable` | `js/tavern-map.js` | (1b)(1c) | — | (0z1)(0b)(0c)(1z1) |
| `dropscen` | `tavern.html` | (6a)(4b) | (6b) | (0a)(2a)(2b)(2c)(2d)(4c)(6c) |
| `hidelock` | `tavern.html` | (2d) | (2a) | (0a)(2b)(2c)(4c)(6a)(6b)(6c) |
| `copyplace` | `js/tavern-map.js` | (2c) | — | (0a)(2a)(2b)(2d)(4c)(6a)(6b)(6c) |
| `gridsize` | `js/tavern-map.js` | (0b) | (1b)(1c) | (0z1)(0c)(1z1) |
| `plazashow` | `tavern.html` | (4c) | — | (0a)(2a)(2b)(2c)(2d)(6a)(6b)(6c) |
| `noretreat` | `tavern.html` | (7a)(7b) | (7c) | (0a)(2a)(6a) |

⭐ §2-2 の**罠 A を再現する `reclick` が (3b) を実際に赤くした** = 3 本の golden が
なぜ壊れたのかを装置が理解している証明。

### 13-3. 既存 golden の非退行(2026-08-28 実測・全件 exit 0)

| ドライバ | 依頼書の期待 | **実測** | 判定 |
|---|---|---|---|
| `node tools/verify_tavern_map.js` | 42/42 PENDING 0 | **42/42 PENDING 0** | ✅ |
| `node tools/verify_tavern_map.js --negative` | 66/66 | **66/66 PENDING 0** | ✅ |
| `node tools/verify_recruit_size.js` | 82/82 | **82/82 PASS** | ✅ |
| `node tools/verify_quest_walk.js` | 25/25 | **25/25 PASSED / FAILED 0 / PENDING 0** | ✅ |
| `node tools/verify_quest_walk.js --negative` | 46/46 | **46/46 PASSED / PENDING 0** | ✅ |
| `node tools/driver_depart_menu_clean.js` | 41/41 | **41/41 PASS** | ✅ |
| `node tools/verify_world_map.js` | 57/57 PENDING 0 | **57/57 PENDING 0** | ✅((7a) の `place:` 照合が生きている) |
| `node tools/verify_world_map.js --negative` | 44/44 | **44/44 PENDING 0** | ✅ |
| `node tools/verify_town_map.js` | 85/85 | **85/85** | ✅(変異 `snapnear` の 2 ファイルヒットは逸脱(7) で解決済) |
| `node tools/verify_town_exit.js` | 23/23 | **23/23 PENDING 0** | ✅ |
| `node tools/verify_town_exit.js --negative` | 4/4 | **4/4(空振り 0)** | ✅ |
| `node tools/verify_title_screen.js` | 86/86 | **86/86** | ✅ |
| `node tools/verify_save_slots.js` | 30/30 | **30/30** | ✅ |
| `node tools/driver_bgm_town.js` | ~~37/37~~ | **17/17** | ⚠ **依頼書 §9 の期待値のほうが誤り**(下記) |
| `node tools/driver_bgm_town.js --negative` | (記載なし) | **15/15** | ✅ |

⚠⚠ **期待値を書き換えたのは `driver_bgm_town` の 1 件だけ**。理由:

- §9 の表に書いた **37/37 は誤記**。このドライバは新設時(#17)から一貫して
  **素 17/17 + `--negative` 15/15** であり、`実装依頼書/2026-08-23_town-tavern-bgm.md:407-408`
  / `2026-08-25_title-bgm-opening.md:472,534-535` / `2026-08-25_town-world-exit.md:394,518`
  / `2026-08-23_scenario2-clear-rate.md:334,425` の **5 枚が全部 17/17 と記録**している。
- ⭐ **退行ではない証明**: `git diff --stat 7394692 HEAD -- tools/driver_bgm_town.js audio.js` が
  **空**(= #25 着手前と 1 バイトも変わっていない)。曲も 1 件も足していないので
  「(0b) の件数直書き」も鳴っていない。
- ⛔ assert は 1 本も緩めていない(**触ってすらいない**)。直したのは**この依頼書の記録値だけ**。

### 13-4. 壊れた golden 3 本の直し方(本チケットの本丸)

**真因**(項目2 のワーカーが実測):
`advanceToPrep()` が引く `#tableArea .table` は
`body.tavernMapOn #tableArea { display: none; }` で `getClientRects().length === 0` になり
`vis(t)` が永久に false → **一度も卓が押されず `steps=(待機)` で打ち切り**。
`#tableArea` の中身自体は今も 6 件描かれているので、**直しはセレクタ 1 行で足りた**。

| ファイル | 行(修正後) | 修正前 | 修正後 |
|---|---|---|---|
| `tools/verify_recruit_size.js` | 338 | 75/82(NG 7 = (Bz1)(Bz2)(B)(B2)(Dz1)(D6a)(D4)) | **82/82** |
| `tools/verify_quest_walk.js` | 641 | 15/25(NG 10 = (1a)(1b)(3z)(3a)(3b)(3c)(4a)(4c)(4d)(4e)) | **25/25** |
| `tools/driver_depart_menu_clean.js` | 152 | 34/41(NG 7 = (A1)(A2)(B1)(B2)(B3)(B5)(C4)) | **41/41** |

修正後のセレクタ(3 本とも同一・直上に理由のコメントを 5 行付けた):

    const t = document.querySelector('#questTable_goblin-mine, #tableArea .table');

- ⭐ **カンマ区切りの `querySelector` は「セレクタ順」ではなく文書順で 1 件返す。**
  DOM 上 `#tavernViewport`(席札を含む)は `#tableArea` より**前**にあるので、
  地図 ON では席札が先に返る。
- ⭐ **撤退 `?tavernmap=0` では席札が DOM に存在しない**ので `#tableArea .table` が返る
  = 同じ 1 行で**両方の経路を測る**(⛔ `?tavernmap=0` で逃げていない)。
- ⭐⭐ **待ち時間は 1ms も伸ばしていない。** 卓へは spawn(7,8) から 7 マス / 実測 **2.4 秒**だが、
  ループは 420ms x 130〜150 step(54〜63 秒)の予算を持っており余裕がある。
  歩行中の 420ms ごとの再クリックは `goToTable` のガードが無視する(変異 `reclick` が機械証明)ので、
  `stopWalk()` → `t0` 打ち直しの無限ループにも落ちない。
- ⛔ **期待値(N/N の N)は 1 つも弱めていない。**

### 13-5. #24 の `codex-map-request` スキルのどこが足りなかったか(#24 §9 の宿題)

**#25 の STEP1 が実地試験になり、穴が 4 件出た。**

| # | 穴 | 実測 | 直し方 |
|---|---|---|---|
| **罠 E** | ⚠⚠⚠ **定型ヘッダとの衝突が MAP では毎回 3 件**(① 納品先 `assets/` の強制 ② 検算コード実行の強制 ③ スプライト用 md5) | スプライト前提のヘッダが MAP 発注に丸ごと乗る | **依頼文の冒頭で「該当しない」と 3 件とも打ち消す**。⭐ 恒久教訓「投下前に必ず `--dry-run` でヘッダ全文を読む」の MAP 版 |
| **罠 F** | ⭐ **発注文の 1 行目に「D&D セッションで使える MAP の作成をお願いします。」を置くと codex の `dnd-map-maker` スキルが起動する**(ユーザー指摘) | 置かないと汎用の画像生成に落ちる | スキルの発注テンプレの**1 行目に固定**する |
| **罠 G** | ⭐⭐⭐ **`make_grid_map.py --fit` は板張りの床で 2 倍の倍音を返す** | 格子 49.88 x 48.75px に対し**板目が 24px = 半マス**。`--fit` が板目の周期を拾う | **行ごと応答の median** で継ぎ目を消してから測り直す |
| **罠 H** | ⚠⚠ **`--check` の位相ズレも同じ理由で誤報する** | 周期側のドリフトは正常なのに「ズレている」と出る | 新規 `tools/check_grid_alignment.py` を作った |

⭐⭐⭐ **副産物: 街・酒場では「二重グリッド」は原理的に起きない**(格子を重ねて描く箇所が全ファイルで 0 件)。

### 13-6. codex への発注(何回で通ったか)

- **1 回で通った。差し戻し 0 回。** codex の自己チェック **6/6**。
- 素材 = `codex1/maps/stag-tavern-hall-player-v1.png` **1536 x 1024**。
- ⭐⭐⭐ **`--sandbox read-only` の下見で既に生成まで走っていた。**
  権限で失敗したのは**納品先へのコピーだけ**で、生成物は
  `~/.codex/generated_images/<uuid>/exec-*.png` に残っていた → **本番投下は不要だった**。
  (次回から MAP 発注は「read-only で下見 → 生成物を拾う」で完結できる可能性がある)

### 13-7. 依頼書からの逸脱(全 7 件)

| # | 逸脱 | 理由(実測) |
|---|---|---|
| **(1)** | **1 マスを 64px でなく 96px にした**(STEP1) | 素材の格子が **99.8 x 97.5px** あるので 96px で焼いても拡大にならない(x0.968 / x0.993)。64px だと 896x640 になり desktop 1440x900 での表示が **1.31 倍の拡大**でぼける(96px なら 0.875 倍の**縮小**)。⭐ **画面上の大きさはどちらも 1176 x 840 で同じ** |
| **(2)** | **(3b) を 2 本の走行の AND にした**(項目3) | 依頼書の「420ms x 6 回」だけでは変異 `reclick` が**空振りする**。ガードを外しても 420ms > `MS_PER_TILE` 340ms なので 1 タイルは毎回完走し、3020ms で到達して**緑のまま**。⭐⭐⭐ **罠 A が牙を剥くのは「間隔 < MS_PER_TILE」のときだけ** → `geom().msPerTile x 0.55`(実測 187ms)で到達まで連打する走行を追加。この走行では **22 回押しても spawn から 1 マスも動かない** |
| **(3)** | **(5a) を zoom でなく「1 マスの実表示 px」で判定**(項目3) | 依頼書の「zoom 1.5 以下」は港町(TILE 64)前提。項目2 の `layout()` は `Math.min(96/TILE, ...)` が天井で **TILE=96 なので zoom 上限は 1.0**。実測 zoom 0.6740 → **64.70px/マス**(許容 34〜96px) |
| **(4)** | **(6b) は HEAD と比較しない**(項目3) | 恒久教訓「**負のコントロールの基準に HEAD を使うな**」。目的は `verify_world_map` (7a) を守ることなので、同じ照合(`WORLD_MAP.SITES → NODES[].label` vs `scenarios[].place`)を **tavern のページの中で** 6 件やる |
| **(5)** | **(6c) の基準は固定コミット `DOM_BASE = 638b479`**(項目3) | HEAD は地図改修**後**なので恒等の基準にならない。`git show 638b479:tavern.html` と配信中の実体で「タグ名 + id + class の並び」を比較(文言変更は許す)。実測 dialog 18 / prep 95 / shopScreen 18 / plazaScreen 16 で**完全一致** |
| **(6)** | **ドライバのポートを 9170 → 9200 にした**(項目3) | ⚠⚠ 項目1 の「9161-9179 は未使用」は**誤り**。`verify_quest_walk.js` は変異ポートを `9160+1+i` で採るので **9161-9170 を実際に使う**(直書き grep では見えない)。9192-9239 が空いていることを数え上げた |
| **(7)** | **`tavern.html` の内部変数を `TM` → `TVM` にリネーム**(項目2) | `walkTo()` の `if (!TM.isWalkable(c, r)) return false;` を `town.html` から写経したら **`verify_town_map.js` が exit 3 で死んだ**。⚠⚠ 変異 `snapnear` のアンカーが `town.html` と `tavern.html` の **2 ファイルへヒット**(`MUTATE_TARGETS` が 3 ファイル横断)。リネームで解決 |

⭐ **項目4 からの逸脱は 0 件。** 待ち時間も期待値も 1 つも触っていない
(唯一の書き換えは §13-3 の `driver_bgm_town` の**記録値の訂正**で、これは assert ではない)。

### 13-8. 残った宿題 — §10 の実機体感 6 項目(⚠ **すべて未確認**)

⛔ **ユーザーが実機で見て決める領域**なので、この窓では「確認済」と書かない。
⚠ ローカルは **http 起動が必須**(`file://` ではナレ音声が鳴らない)。

| # | 見るもの | 参考実測・注意 |
|---|---|---|
| 1 | **酒場を横切る時間** | 卓へは spawn(7,8) から **7 マス / 2.4 秒**、奥の間の扉へは **4.1 秒**(項目2 の実測)。⭐ 長すぎたら動かすのは `MS_PER_TILE` であって**マップの大きさではない** |
| 2 | **卓が「席」に見えるか** | ⚠ 足元をタイル中心に置く規則なので、主人公は卓の**手前**に立つ |
| 3 | **依頼人ポートレイト**(`assets/client_*.png`)が俯瞰の床の上で浮かないか | ⚠ 浮くなら**卓の絵の側**(codex への再依頼)で直す。⛔ **コードで縮めて誤魔化さない** |
| 4 | **compact(iPhone 縦)で 3 卓が見つけられるか** | カメラが主人公を追ったとき卓が画面外に出っぱなしにならないか |
| 5 | **暖炉の微光 `#fireplace`** が新しい絵の暖炉と重なっているか | ⚠⚠ 今の座標 x50% / y58% は**旧 1 枚絵**に合わせたもの。**必ずずれる** |
| 6 | **iOS Safari の実タップ** | `click` 非発火端末があるので `touchend` 併用を確認 |

### 13-9. 次のチケットへの申し送り

- ⛔ **復興評議会館(領主館)の新設 → #26。** 本チケットは「奥の間へ」の**暫定扉**まで。
  シナリオ 4〜6 の 3 卓は `#tableArea.backroomOpen` へ逃がしてあり、**#26 で扉ごと消せる**構造。
  (`verify_tavern_map.js` の (4b) が「⚠ 暫定 — #26 で扉ごと消える節」と自分で明記している)
- ⛔ **ポドルプラザの MAP 化と概念の再設計 → #27。** `#plazaScreen` は今日のまま
  (変異 `plazashow` が (4c) で守っている)。
- ⚠⚠⚠ **`#tableArea .table` を押す装置は今後も「席札を先に見る」二段構えで書くこと。**
  新しいドライバを起こすときにここを写経し忘れると、**同じ「(待機) で打ち切り」に落ちる**。
- ⚠⚠ **`tavern.html` を触る変異を書くときは `verify_town_map.js` の `MUTATE_TARGETS` を必ず確認する**
  (`js/town-map.js` / `town.html` / `tavern.html` の 3 ファイル横断なので、
  `town.html` から写経した行がそのまま 2 ヒットして **exit 3** で死ぬ = 逸脱(7))。
