# #22 街 → ワールドマップへ「出る」導線(北の街道口「町の外へ」)

- **起草**: 2026-08-25(計画窓) / **ステータス**: **承認済**(2026-08-25 ユーザー承認)
- **着手**: 2026-08-25 に窓更新して実装窓へ引き渡し。⚠ 起草からの経過は短いが、
  **着手前にもう一度 §2-3 の grep と §2-4 のアンカー行番号を測り直すこと**(行番号は必ずズレる)。
- **触るファイル**: `js/town-map.js` / `town.html` / `tools/verify_town_exit.js`(新規) /
  `tools/verify_town_map.js`(期待値更新) / `tools/driver_heromark_signplate.js`(期待値更新) /
  `tavern.html`(changelog 1 行のみ) / `実装依頼書/README.md`
- ⛔ **触らないファイル**: `js/world-map.js` / `world.html` / `index.html` / `title.html` / `audio.js`
  — §2-2 / §2-4 で「開く必要が無い」ことを実測済み。**ワールドマップ側は 1 文字も変えずに成立する。**
- 並走窓: **無し**(起草時 `git status` は clean / HEAD = `3e03005` = `origin/main`)

---

## 1. 目的

#21 が `title → world → town` と `dungeon → world → town` を作ったが、
**`town → world` の導線が 1 本も無い**(一方通行)。街に入ると酒場へ行くか闇市へ下りるかしかできず、
せっかく作った地方全景の地図へ**プレイヤーの意思では二度と出られない**。

街に「外へ出る」出口を 1 つ足して、`town ⇄ world` を往復にする。

**ユーザー決定(2026-08-25)**:

- **出口の場所 = 北の街道口 タイル (6,0)**。目抜き通り(row 3)から北へ真っ直ぐ伸びる小路の突き当り。
  ⭐ 不採用: 桟橋 (8,12)(= 船で上陸する場所。ワールドマップは陸路の街道図なので船旅の含意が出る)/
  西の外れ (0,7)(絵の上で道に見えない)。
- **見せ方 = 4 枚目の立て札**(`FACILITIES` に 1 件足す)。⭐ 不採用: 専用の出口マーカー
  (既存 golden は無傷で済むが、compact 用の押し口を別系統で新造することになり UI の一貫性が落ちる)。
- **札の 1 行目(名前)= 「町の外へ」**(ユーザー逐語)。
- **札の 2 行目(説明)= 「北へ延びる街道。森へ、湖へ、山へ」**(起草側で決定。§2-5 の幅の制約から
  文字数に上限がある。⛔ 実装窓が勝手に言い換えない。変えたい時は §2-5 の交差計算をやり直す)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ⚠⚠⚠ ⚓ 引き継ぎアンカーの主張が 2 件崩れた

引き継ぎメモ(⚓ RESUME_ANCHOR)は次の 2 つを断言していたが、**どちらも成立しない**。

| アンカーの主張 | 実測 | 出所 |
|---|---|---|
| 「新しい sessionStorage キーは要らない。`WORLD_MAP.spawnFor()` の fail-safe が既に `phlan` なので、町から出れば何も渡さずに港町へ立つ」 | ⛔ **偽**。町から出るときに何も書かないと、駒は **`pier`(船着き場)に立つ** | `town.html:414` が `exitVia` を **removeItem** する → world は `exitVia === null` を見る → `world.html:442` が `spawnVia = "title"` へ落とす → `js/world-map.js:167` `if (via === "title") return "pier";` |
| 「`verify_town_map.js` が件数 3 を **2 箇所**で直書き」 | ⛔ 過小。**同ファイル 3 箇所 + `driver_heromark_signplate.js` 13 箇所 = 計 16 箇所** | §2-3 の grep |

⭐ 1 件目の解き方は §2-2。**それでも `js/world-map.js` は 1 文字も変えなくてよい**(理由も §2-2)。

### 2-2. `exitVia` の流れ(リポジトリ全文 grep で実測)

| ファイル:行 | いつ | 何 |
|---|---|---|
| `index.html:3103` | ダンジョンから帰る時 | `setItem("dragonfighters.exitVia", "dungeon")` |
| `tavern.html:6771` | 酒場から街へ出る時 | `setItem("dragonfighters.exitVia", "tavern")` |
| `world.html:438` | 地図をロードした時 | **peek のみ**(⛔ 消さない。#21 §2-2 の罠 A) |
| `town.html:413-414` | 街をロードした時 | `getItem` → **`removeItem`**(★一回性の消費点はここだけ) |

書き手は 2 箇所・消費者は 1 箇所(`town.html`)。**他に無い**(`tools/` 内の 2 件はドライバの seed と変異アンカー)。

再測定:

```
grep -rn "exitVia" --include=*.html --include=*.js . | grep -E "setItem|removeItem"
```

⭐⭐⭐ **だから「町から出る」ときに `exitVia = "town"` を書けばよい。**
`js/world-map.js:170` の fail-safe は `"title"` でも `"dungeon"` でもない値をすべて **`phlan`** へ落とすので、
**`js/world-map.js` は 1 行も変えなくてよい**。しかもこの fail-safe は既に機械証明されている:

```
tools/verify_world_map.js:1331  (4s-3) spawnFor の fail-safe:
  s.unknownVia === 'phlan' && s.missingVia === 'phlan'     ← WM.spawnFor('__nope__')
```

戻り(world → town)では `town.html` が `exitVia === "town"` を消費するので、
`TOWN_MAP.SPAWNS` に **`town: [6, 1]`** を 1 行足す(= 出口の 1 マス内側 = 「直前に居た場所の**前**に立つ」の規則どおり。
`tavern` が enter `[10,2]` に対し spawn `[10,3]` なのと同じ形)。

⚠ `TOWN_MAP.SPAWNS` を握っているドライバは **0 本**(`grep -rn "SPAWNS" tools/*.js` のヒットは全部 `ENEMY_SPAWNS`)。
`verify_town_map.js` の受入条件 9 は `title/tavern/shop/plaza/dungeon/__unknown__` の **明示リスト**なので、
キーを 1 つ足しても既存 assert は動かない。

### 2-3. ⚠⚠⚠ 「施設ちょうど 3 件」が既存 golden 2 本に 16 箇所ある

```
grep -nE "=== 3\b|/3'|circles === 3" tools/verify_town_map.js tools/driver_heromark_signplate.js
```

17 ヒット。うち `verify_town_map.js:378`(`y === 3 || y === 10` = 橋の row 判定)は**無関係**なので、
**実数 16 箇所**:

| ファイル | 行 | 何 |
|---|---|---|
| `verify_town_map.js` | 360 | `(2z2) [装置] 施設が 3 つある` … `r.facilities.length === 3` |
| 〃 | 674 | `(11b-*) 3 施設が押せる` … `r.reachable === 3`(**3 ビューポート分回る**) |
| 〃 | 689 | `(12a)/(12b)` の conjunction 内 `s.signCount === 3` |
| `driver_heromark_signplate.js` | 315 | `(Z1c)` `descOk === 3 && s0.facilities.length === 3` |
| 〃 | 357 / 373 / 374 / 377 / 382 | `(B1)(B3)(B4)(B5)` の `st.signs.length === 3` と `/3` 表示 |
| 〃 | 402 | `(B7a)` `cs.hudCount === 3 && cs.hudClickable === 3` |
| 〃 | 416 / 417 / 418 / 422 / 433 | compact 比較の `s.signs.length === 3` / `signCount === 3` |
| 〃 | 442 | `circles === 3`(`?signplate=0` の丸アイコン) |

⭐⭐ **これは退行ではなく期待値の更新**(#21 で `driver_bgm_town` / `driver_bgm_title` の
曲数直書き 10 → 11 をやったのと同じ形)。⛔ ただし **書き換える前に必ず HEAD の worktree で
同じドライバを走らせて「4 枚目を足したこと以外に原因が無い」ことを切り分ける**。

⭐ 更新は「3 を 4 に置く」だけで終わらせず、**件数の出所を実体へ寄せる**:
`verify_town_map.js:360` の装置 assert は `r.facilities.join(',') === 'tavern,shop,plaza,gate'` の
**id 列照合**へ格上げする(母集団が増えたことを黙って飲まない)。

### 2-4. ⚠⚠⚠ 変異アンカーを壊さない(踏むと exit 3 でドライバごと死ぬ)

編集する 2 ファイルは、**既存ドライバの変異アンカーが文字列で握っている**。

| ドライバ | 変異 | アンカー(この行を 1 文字も変えない) | 場所 |
|---|---|---|---|
| `verify_town_map.js` | `addquery` | `      location.href = "tavern.html";` | `town.html:623` |
| 〃 | `isolate` | `    /* row  1 */ "Br.rrr.rrBBB~~BBBs^.sBB",` | `js/town-map.js` MASK |
| 〃 | `snapnear` | `      if (!TM.isWalkable(c, r)) return false;` | `town.html:604` |
| `driver_heromark_signplate.js` | `plateflat` | `          if (f.desc) {` | `town.html:519` |
| 〃 | `platehide` | `        s.style.top  = p.y + "px";` | `town.html:534` |
| 〃 | `marklow` | `    var HEAD_TOP = 32, HM_GAP = 8, HM_W = 9, HM_H = 13;` | `town.html` |

判定は **「同じ文字列がターゲット群の中でちょうど 1 箇所」**(`verify_town_map.js:118-125` /
`driver_heromark_signplate.js:119-136`)。0 件でも 2 件でも `process.exit(3)`。したがって:

- ⛔ `enterFacility` の中に **`location.href = "tavern.html";` を 2 度書かない**。
  新しい出口は `location.href = f.to;` にして、既存の 1 行はインデントごと据え置く。
- ⛔ MASK は**触らない**。出口タイル (6,0) は**もともと歩ける**(§2-5)のでマスク編集は不要。
- ⭐ `verify_world_map.js` の変異は **ファイル単位**(`{ file: 'world.html', … }`)で数えるので、
  `town.html` に同じ行(例: `unlock()` の 1 行)があっても衝突しない(実測済み)。

### 2-5. 出口タイルと札の位置(絵とマスクで実測)

**絵に城門は描かれていない。** 外周で歩けるマスは **8 つだけ**:

```
(2,0) (5,0) (6,0) (19,0) / (0,4) (0,6) (0,7) (0,8)
```

このうち **col 6 は row 0 → 3 が縦に連続して歩ける**(`MASK` row0-2 の col6 = `.`、row3 = 目抜き通り)。
= 絵の上でも「街道が北へ抜ける小路」に見える唯一の場所。**出口タイル = (6,0)**。

到達性も実測済み(歩けるマス **129 個が全部** 酒場前 (10,3) から到達可能 / 孤立 0 件)。

**札は (5,2)**。⚠⚠ 理由は幾何:

- `.townSign` は `max-width: 280px` / `white-space: nowrap`。銀の鹿亭の札は実測で幅 **280px** 上限に張り付く。
- `driver_heromark_signplate.js:388` **(B6) 札同士の交差面積 == 0** を要求する。
- 「町の外へ」+「北へ延びる街道。森へ、湖へ、山へ」(2 行目 16 字 × 13px + padding 32)= 幅 **約 240px**。
- 札を **(6,1) / (6,2)** に置くと、銀の鹿亭の札 (10,1) との中心間距離は **256 stage px**。
  半幅の和は `240/2 + 280/2 = 260` → **4px 交差して (B6) が赤くなる**。
- **(5,2)** なら中心間距離 **320px** > 260 → **60px の余裕**で交差しない。

さらに `driver_heromark_signplate.js:377` **(B4) 札の上端がタイトル帯の下端より下**も要求される。
desktop 1440x900 では `#townTitle` の高さ ≈ 60px / `zoom = min(1440/1472, (900-60)/960) = 0.875` /
`#townStage` は `transform-origin: 0 0` なので、row 2 の札の client top ≈ `60 + 132 × 0.875 = 175` ≫ 60 ✓。
⛔ **row 0 に札を置かない**(client top ≈ 65 で帯の下端 60 と 5px しか離れない)。

### 2-6. 撤退スイッチは `?world=0` を**再利用**する

#21 が既に `dragonfighters.worldOff` を 3 ファイルで読んでいる
(`title.html:371-388` / `index.html:3098-3104` / `world.html:329-337`)。
「地方の地図を丸ごと素通りする」という意味なので、**街の出口を出さない**のも同じスイッチで正しい。
⭐ 新しいキーを作らない。`town.html` が同じ作法(クエリ → sessionStorage へ写す)で**独立に読む**。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC` を読んだ結果:

```python
GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

本チケットが触る `town.html` / `js/town-map.js` / `tools/*` は **1 つも含まれない → フックは鳴らない。**

ただし **これは紛れもなくプレイヤーに見える変化**(街に新しい立て札が増え、押すと地図が開く)なので、
**最終項目で 1 行足す**。足すと `tavern.html` を触るのでフックが鳴るが、**その 1 行自体が答えになる**ので通る
(#21 の `95fcd35` がまったく同じ形で通っている)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/town-map.js` | `FACILITIES` に 4 件目 `gate` / `SPAWNS` に `town: [6, 1]` の 1 行 |
| `town.html` | ① `?world=0` の読み取り(`?town=0` と同じ位置) ② `buildSigns` のガード 1 行 ③ `enterFacility` の分岐 |
| `tools/verify_town_exit.js` | **新規**。§0〜§5 + `--negative` 4 変異 |
| `tools/verify_town_map.js` | 「3」直書き 3 箇所を更新(:360 は id 列照合へ格上げ) |
| `tools/driver_heromark_signplate.js` | 「3」直書き 13 箇所を 4 へ |
| `tavern.html` | `changelogList` に 1 行(**最終項目でのみ**) |
| `実装依頼書/README.md` | #22 行(§11 に文面あり) |

⛔ `js/world-map.js` / `world.html` / `index.html` / `title.html` / `audio.js` は開かない。§2-2 / §2-4 で不要を確認済み。

---

## 4. STEP1 — `js/town-map.js`(データ)

`FACILITIES` の末尾へ 1 件。⚠ **既存 3 件は 1 文字も動かさない**(`isolate` 変異と受入 (4a) が握っている)。

```js
    /* ⭐ 4 件目だけ via ではなく **to** を持つ。to があるものは酒場ではなく地方全景へ出る。
       ⛔ enterVia を書かない (酒場が消費する一回性キー。書くと次に鹿亭へ入った瞬間に誤爆する)。
       ⚠ sign を (6,1)/(6,2) へ寄せると銀の鹿亭の札 (10,1) と 4px 交差して受入 (1b) が赤くなる
         (札の実測幅 280px / 240px・中心間 256px。依頼書 §2-5)。⛔ 動かすなら計算をやり直すこと。
       ⚠ desc の文字数を増やすと札が横に伸びて同じ交差が起きる。 */
    { key: "gate", icon: "🚪", name: "町の外へ", enter: [6, 0], sign: [5, 2],
      to: "world.html",
      desc: "北へ延びる街道。森へ、湖へ、山へ" }
```

`SPAWNS` へ 1 行(⚠ 既存 5 行は動かさない):

```js
    town:    [6, 1]     // 地方全景から街へ戻った = 出た門の 1 マス内側に立つ
```

⚠ `SPAWNS.town` は **`TOWN_MAP.spawnFor("town")` の戻り**であって、`WORLD_MAP` 側とは別物。
`WORLD_MAP.spawnFor("town")` は fail-safe で `phlan` を返す(§2-2)。**`js/world-map.js` は触らない。**

---

## 5. STEP2 — `town.html`(3 箇所)

### 5-1. `?world=0` を読む(`?town=0` の判定の直後 = `:332` の下)

```js
    /* ══ 撤退スイッチ ?world=0 (#21 と共有) ═══════════════════════════════
       ⚠ 判定位置は ?town=0 と同じ IIFE 先頭。⚠ キーは #21 が使っているものと同一
         (title.html:371 / index.html:3098 / world.html:329)。新しいキーを作らない。
       ⚠ ここでは replace しない。街そのものは生きていて、**出口の札だけ**が出なくなる。 */
    var WORLD_OFF_KEY = "dragonfighters.worldOff";
    try {
      if (new URLSearchParams(location.search).get("world") === "0") sessionStorage.setItem(WORLD_OFF_KEY, "1");
    } catch (e) {}
    var worldOff = false;
    try { worldOff = sessionStorage.getItem(WORLD_OFF_KEY) === "1"; } catch (e) { worldOff = false; }
```

### 5-2. `buildSigns()` のガード(`requiresPlazaUnlock` の判定の直後)

```js
        /* ⚠ ?world=0 のときは出口を **DOM に作らない**。display:none で残すと押せてしまう
           (闇市の作法と同じ)。 */
        if (f.to && worldOff) return;
```

### 5-3. `enterFacility()` の分岐

⛔⛔ **既存の `      location.href = "tavern.html";` の行はインデントごと据え置く**
(`verify_town_map.js` の `addquery` 変異アンカー。2 箇所になった時点で exit 3)。

```js
    function enterFacility(f) {
      if (leaving) return;
      leaving = true;
      /* ⭐ 「町の外へ」は酒場ではなく地方全景へ。
         ⛔ enterVia を書かない (酒場の一回性キー)。⛔ クエリも足さない (#6 / #12 の確定作法)。
         ⚠ exitVia = "town" は **world 側の fail-safe に phlan を返させるため**に要る
           (書かないと駒が pier に立つ。依頼書 §2-1 / §2-2)。
           消費するのは今日どおり town.html:414 の 1 箇所だけ。 */
      if (f.to) {
        try { sessionStorage.setItem(EXIT_VIA_KEY, "town"); } catch (e) {}
        location.href = f.to;
        return;
      }
      try { sessionStorage.setItem(ENTER_VIA_KEY, f.via); } catch (e) {}
      /* ⛔ クエリを足さない。URL は常に素の tavern.html (依頼書 §3 / #6 の禁止事項) */
      location.href = "tavern.html";
    }
```

⚠ `EXIT_VIA_KEY` は `town.html:410` に**既にある**定数。新しく宣言しない。

---

## 6. STEP3 — 既存 golden 2 本の期待値更新

⭐⭐ **先に HEAD の worktree で 2 本を走らせ、85/85 と 46/46 を自分の目で確認してから**書き換える。

```
git worktree add ../df_head_check 3e03005
node ../df_head_check/tools/verify_town_map.js
node ../df_head_check/tools/driver_heromark_signplate.js
```

`verify_town_map.js`:

- `:360` → `check('(2z2) [装置] 施設が 4 つある (id 列で照合)', r.facilities.join(',') === 'tavern,shop,plaza,gate', …)`
- `:674` → `r.reachable === 4`(表示文字列 `'/3'` も `'/4'` へ)
- `:689` → `s.signCount === 4`
- ⚠ `:692` の `(12c) ?town=0 は街が 1 枚も描かれない` は **`signCount === 0` のまま**(触らない)

`driver_heromark_signplate.js`: 13 箇所の `3` を `4` へ。ラベル文字列(`3 施設の…` / `3 枚の札が…`)も併せて。
⚠ `:442` の `circles === 3` も **4** へ(`?signplate=0` の丸アイコンも 4 個になる)。

---

## 7. 撤退スイッチ

- **`?world=0`**(#21 と共有 / キー `dragonfighters.worldOff`)
  → 街から**「町の外へ」の札と HUD ボタンが消える**。他の 3 施設と歩行は今日のまま。
- ⚠ 判定位置 = `town.html` の IIFE 先頭(`?town=0` の判定の直後)。
- ⚠ ページ遷移をまたぐ = **sessionStorage へ写す**(`?town=0` と同じ作法)。
  `title.html?world=0` から入ってもそのまま効く(同じキーを共有しているため)。

---

## 8. 受入条件 — `tools/verify_town_exit.js`(新規)

**何を測るか**: 「札が 1 枚増えた」ではなく **「街から地方全景へ出て、また帰って来られる」**を測る。
だから遷移を実際に踏み、`location.pathname` と **world 側の駒の位置**まで見る。
⭐ 一回性キーは「書いたもの」と「書いていないもの」を**両方**測る(書き忘れより誤爆のほうが静かに壊れる)。

### §0 装置(先に母集団を確かめる)

- **(0a)** 変異アンカー 4 種がそれぞれ 1 ファイル 1 箇所にヒットする(0 件 / 2 件は `exit 3`)
- **(0b)** `TOWN_MAP.FACILITIES` の **id 列**が `tavern,shop,plaza,gate` ちょうど
  ⭐ 件数ではなく id 列。ドライバに文言は写さない(名前 / desc は §1 で実体照合する)
- **(0c)** `town.html` が起動し `window.__town` が載っている / `pageerror` 0 件

### §1 札が 4 枚になり、重なっていない

- **(1a)** `.townSign` の枚数 == `TOWN_MAP.FACILITIES.length`(⛔ 4 を直書きしない。**実体から引く**)。
  compact 390 で `#townHud button` の個数も同じ
- **(1b)** 4 枚の札の**交差面積が 0** / 4 枚とも上端が `#townTitle` の下端より下(desktop 1440x900)
- **(1c)** `townSign_gate` の 1 行目 / 2 行目が `FACILITIES` の `name` / `desc` と**文字列一致**
  (⛔ ドライバ側に「町の外へ」と書かない。実体から引いて比べる)
- **(1d)** `townSign_gate` の中心の `elementFromPoint` が自分自身か子孫(= 実際に押せる)

### §2 出口が world.html へ着く

- **(2a)** `townSign_gate` を押す → 主人公が **(6,0)** に立ち → `location.pathname` が `/world.html`
- **(2b)** 遷移後の `location.search === ""`(⛔ クエリを足していない)
- **(2c)** compact 390x844 で `townHudBtn_gate` から押しても (2a)(2b) と同じ結果になる

### §3 一回性キーの扱い(2 経路で突き合わせる)

- **(3a)** 遷移直後 `sessionStorage["dragonfighters.exitVia"] === "town"`
- **(3b)** ⛔ **`dragonfighters.enterVia` が `null` のまま** / `dragonfighters.lastResult` も遷移前後で不変
- **(3c)** world 側の駒が **`phlan`** に立つ。**2 経路**で見る:
  ① `WORLD_MAP.spawnFor("town")` の戻り値 ② 実ページの `__world.heroNode()`
  ⭐ ①だけだと「本番が spawnFor を呼んでいない」を見逃す
- **(3d)** そのまま港町フランの札を押して街へ戻る → 主人公が **(6,1)** に立ち、
  `exitVia` が **`null`(消費済み)**になっている

### §4 恒等(非退行)

- **(4a)** 既存 3 施設の `key/name/desc/icon/enter/sign/via` が**1 文字も変わっていない**
  (`js/town-map.js` の実体から引いて JSON 比較)
- **(4b)** `townSign_tavern` を押すと今日どおり素の `/tavern.html`(`search === ""`)へ行き、
  `enterVia === "tavern"` が書かれている(= 出口の分岐が既存経路を巻き込んでいない)

### §5 撤退

- **(5a)** `town.html?world=0` → `.townSign` が 3 枚 / `townSign_gate` が **DOM に存在しない** /
  compact の `#townHud button` も 3 個
- **(5b)** `?world=0` の後に素の `town.html` をロードしても効いている(sessionStorage へ写っている)
- **(5c)** ⭐⭐⭐ 「`?world=0` で緑」ではなく、**同じ測定関数を両モードへ当てて conjunction が崩れる**
  (`gateExists && gateClickable && signCount === facilities.length` が ON で成立し OFF で崩れる)

### ⛔ 測らないこと

- **札の文言そのもの**。唯一の正は `FACILITIES` で、ドライバは実体照合しかしない
  (ユーザーが言い回しを変えたくなったときにドライバが邪魔をしないため)
- **出口タイル (6,0) の絵の見た目**。門は描かれていないので「街道に見えるか」は §9 の目視で決める
- **world 側の BGM / ルート線 / 札 7 枚**。#21 の `verify_world_map.js` 55/55 が既に測っている
- **`?town=0` の挙動**。`verify_town_map.js` の受入条件 12 が唯一の正

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `eatenter` | `enterFacility` の出口分岐で **`enterVia` も書いてしまう** | **(3b)** のみ((2a) は緑のまま) |
| `signcrowd` | `gate` の `sign` を `[5,2]` → **`[6,1]`** へ寄せる | **(1b)** のみ((1a)(1d) は緑のまま) |
| `noexitvia` | `setItem(EXIT_VIA_KEY, "town")` を消す | **(3a)(3c)(3d)** — 駒が `pier` に立つ |
| `worldalive` | `if (f.to && worldOff) return;` を消す | **(5a)(5c)** |

⭐ `signcrowd` が §2-5 の罠(札の実測幅 280px に対し 4 タイル差では 4px 交差する)の再現。
⭐ `noexitvia` が §2-1 の罠(⚓ アンカーが「新キー不要」と断言していた誤り)の再現。
⚠ `eatenter` は **(2a) を緑のまま (3b) だけ赤に**すること。両方赤なら変異が効きすぎ。

### 既存 golden の非退行(実装後に必ず全部走らせる)

| ドライバ | 期待 | 備考 |
|---|---|---|
| `node tools/verify_town_map.js` | **85/85** | ⚠ §6 の期待値更新**後**の数字。更新前は必ず赤くなる |
| `node tools/driver_heromark_signplate.js` | **46/46**(`--negative` 4/4) | 〃 |
| `node tools/verify_world_map.js` | **55/55**(`--negative` 40/40) | ⭐ **無変更で通るはず**。赤いなら §2-2 の読みが誤り |
| `node tools/verify_title_screen.js` | **86/86** | |
| `node tools/verify_save_slots.js` | **30/30** | |
| `node tools/driver_bgm_town.js` | **17/17** | |
| `node tools/driver_bgm_title.js` | **16/16**(`--negative` 14/14) | |
| `node tools/driver_bgm_mine.js` | **37/37** | |

⚠ 基準値は **2026-08-25** 時点(#21 `95fcd35` のコミットメッセージ由来)。
**走らせて違ったら期待値を書き換える前に理由を突き止める**(#19 では 2 件が「他チケットが assert を足しただけ」だった)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` だと音が出ない)。

1. 「町の外へ」の札が、北の小路の脇に置かれていて**邪魔ではないか**(銀の鹿亭の札との間合い)
2. 出口タイル (6,0) まで歩いたとき、**街道へ出て行くように見えるか**(門は描かれていない)
3. 街 → 地図 → 港町フラン → 街 の往復を 2 周して、**立ち位置が毎回同じか**((6,1) → 出口 → phlan)
4. compact(iPhone 幅)で HUD ボタンが 4 つ並んで**溢れないか**
5. iOS 実機

---

## 10. changelog(⚠ フックは鳴らないが、プレイヤーに見える変化なので**最終項目で 1 行足す**)

```
py tools/add_changelog.py "<b>町から地方の地図へ出られるようになった</b> — 港町フランの北の街道口に「町の外へ」の立て札。押すと地方全景が開き、次の目的地まで駒が歩く。"
```

⚠ この 1 行のために `tavern.html` を触るのでフックが鳴るが、**その 1 行自体が答え**なので通る。
⛔ 項目 1〜3 では `tavern.html` を**触らない**(触ると changelog が無くてフックに止められる)。

---

## 11. やらないこと

- ⛔ **`js/world-map.js` / `world.html` の変更**。§2-2 で「fail-safe が既に `phlan`」を実測済み。
  ワールドマップ側に「街から来た」専用の分岐を足さない(fail-safe を 2 経路にする意味がない)
- ⛔ **世界地図から街以外へ入れるようにすること**(6 拠点の `enter` は #21 のユーザー決定で
  「地名を見せるだけ」。依頼の受注は今日どおり酒場)
- ⛔ **街の MASK の編集**。出口タイルはもともと歩ける
- ⛔ **`SPAWNS.title` / `SPAWNS.shop` / `SPAWNS.plaza` の整理**。
  ⚠ 実測すると `exitVia` に入り得るのは `dungeon` / `tavern` / (新) `town` だけなので、
  この 3 つは**現状どこからも到達しない死にコード**。⭐ 本チケットでは**消さない**(別チケット送り)
- ✅ **`実装依頼書/README.md` の #22 行は承認時(2026-08-25)に追加済み**。並走窓が無いため保留不要だった。
  最終項目でやることは **ステータスを `完了 <hash>` / 進行度 100% へ書き換えるだけ**。追加した行:

```
| 22 | [2026-08-25_town-world-exit.md](2026-08-25_town-world-exit.md) | **承認済** | 0% | 街から地方全景へ「出る」導線。北の街道口 (6,0) に 4 枚目の立て札「町の外へ」。⭐ `exitVia="town"` を書けば world の fail-safe が `phlan` を返すので **`js/world-map.js` は無変更**。⚠⚠ 既存 golden 2 本が「施設ちょうど 3 件」を **16 箇所**直書き。撤退 = `?world=0`(#21 と共有) |
```

---

## 12. dev-loop の 4 項目分割(推奨)

| 項目 | 触るファイル | 内容 |
|---|---|---|
| ① | `js/town-map.js` / `tools/verify_town_exit.js` | データ(§4)+ **ドライバの §0〜§5 の枠を全部宣言**し、未実装は `pending()` で明示 PENDING 出力。§0 と §1 を実装 |
| ② | `town.html` / `tools/verify_town_exit.js` | §5 の 3 変更 + 受入 §2 / §3 を実装 |
| ③ | `tools/verify_town_map.js` / `tools/driver_heromark_signplate.js` / `tools/verify_town_exit.js` | §6 の期待値更新(先に HEAD worktree で切り分け)+ 受入 §4 + `--negative` 4 変異 |
| ④ | `tavern.html` / `実装依頼書/*` | 受入 §5 撤退 + **PENDING 0** + 既存 golden 8 本の非退行 + changelog 1 行 + §13 実装結果 |

⭐ **changelog を鳴らすファイル(`tavern.html`)を最終項目 1 つへ集約**してある。項目①〜③は
「触らないのが正しい」と言い切れる。⚠ 行番号は項目ごとにズレるので**毎回測り直す**。

---

## 13. 実装結果

(実装窓が埋める)
