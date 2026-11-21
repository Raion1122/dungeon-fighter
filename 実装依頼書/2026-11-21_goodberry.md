# #116 グッドベリー — エルフが木の実を 10 個作り、弱った味方が戦闘中に 1 個ずつ食べる

- **起草**: 2026-11-21(計画窓) / **ステータス**: **承認済**(2026-11-21 ユーザー承認)
- **基準 HEAD**: `63c7632`(origin と同期・作業ツリーきれい。2026-11-21 計画窓で確認)
- **触るファイル**: `index.html` / `tavern.html` / `js/changelog.js`(ヘルパー経由)/ `tools/verify_goodberry.js`(新規)/ `tools/verify_scroll_shelf.js`(言い直し 3 か所)
- ⛔ **触らないファイル**: なし(並走している別窓は無い。`git status` で確認済み)。それでも `git add .` は禁止で、**ファイル単位 add** にし、`git diff --cached <file>` を読んでから commit する
- 会議の記録: `dev-meetings/2026-11-21_goodberry.md`(第 1 段の候補 3 件 → ① 木の実の袋 → 第 2 段の開発計画書)

---

## 1. 目的

エルフの回復は、自分だけを治すキュア・マイナーの 1 つしかない。5.1 SRD のレンジャー 1 レベル呪文**グッドベリー**(木の実を最大 10 個作る。1 個食べると 1 HP 回復する。24 時間もつ)を足し、「攻撃呪文を 1 回あきらめて、出撃のあいだ仲間を少しずつ食べさせる」という装備の判断を、エルフに 1 つ持たせる。

**ユーザー決定(2026-11-21)**:

- **エルフの呪文にする**。当初は「僧侶の呪文」として話が来たが、5.1 SRD のグッドベリーはドルイドとレンジャーの呪文表にあり、僧侶の表には無い。このゲームでレンジャー系の呪文を持つのはエルフ(`ELF_SKILLS`)
- **候補① 木の実の袋**を採る。不採用の 2 案と、採らなかった理由:
  - ② 休憩の場面で効かせる案 → 1 個 1 HP では、部屋のクリアで回復する量(`applyRoomClearHeal`)に埋もれて気づかれない。休憩所が無い行き先もある
  - ③ 戦闘中に仲間へ投げ渡す案 → 僧侶の回復と役割がかぶる。spells.md の「エルフの呪文は弓と連動」から最も遠い
- **会議で決まった中身**(第 2 段):
  - 唱えるのは**出撃して最初の部屋に入ったとき 1 回**。戦闘中に唱えるかどうかを AI に判断させない
  - **1 個 1 HP**(SRD どおり)。ただし**食べても手番は終わらない**。1 体が食べるのは 1 手番に 1 個まで。食べられるのは HP が半分を切っているときだけ
    ⚠ SRD では食べるのに 1 アクションを使う。そこから外れることを、会議で合意した(AI が 1 HP のために攻撃を捨てるのを防ぐため)
  - 木の実は**その出撃のあいだだけ**持つ。⛔ 出撃をまたいで持ち越さない
  - 記録: 木の実で回復した量は、食べた本人ではなく**唱えたエルフ**の回復として戦いの記録に入れる
  - 覚え方: **森の書・グッドベリー(common)**。最初からは持たせない
  - 帯(バナー)は**唱えたときと袋が空になったときの 2 回だけ**。食べるたびの表示は頭上の「+1」だけにする

---

## 2. 着手前の実測(計画窓が本番コードで確かめた事実・基準 `63c7632`)

### 2-1. 既存の口 — どこへ何を足すか

| ファイル:行 | 何 | 今回の扱い |
|---|---|---|
| `index.html:25227-25232` | `ELF_SKILLS["cure-minor"]`(エルフの回復はこの 1 つだけ) | この後へ `"goodberry"` を足す |
| `index.html:15216-15220` | `SCROLL_CATALOG` の森の書 5 冊 | `"grimoire-goodberry"`(common)を 1 行足す |
| `index.html:15373` | 巻物の抽選 `pool = … filter(rarity === r && (isInvisOn() \|\| …) … && (isCounterspellOn() \|\| id !== "scroll-counterspell"))` | 末尾へ `&& (isGoodberryOn() \|\| id !== "grimoire-goodberry")` を足す(#78〜#96 と同じ形) |
| `index.html:15259-15262` | `isMageHandOn()`(撤退スイッチの型) | `isGoodberryOn()` を同じ形で足す |
| `index.html:15940-15949` | `startGame()` → `tryArcaneEyeOnEntry()`(#79「最初の部屋で魔法の眼」・await しない) | **唱える時機の型**。この隣で `tryGoodberryOnEntry()` を呼ぶ |
| `index.html:41414-41426` | `takeArcaneEyeCaster()`(順 = 主人公 → 仲間、`hasSpellSlot` / `consumeSpellSlot`。主人公の枠は `"player"`) | 術者探しの型 |
| `index.html:34087-34088` | 仲間の手番: 状態のガード(`stunned` / `confused` / `wildConfused`)の後に `tryDrinkHealingPotion(ally)` | **この直前**に `tryEatGoodberry(ally)` |
| `index.html:36758-36759` | 主人公の手番: 状態のガード(`skipNextTurn` / `confused` / `sleepRemaining` / `wildConfused` / `stuck` ほか)の後に `tryDrinkHealingPotion("player")` | **この直前**に `tryEatGoodberry("player")` |
| `index.html:24314-24345` | `tryDrinkHealingPotion` 本体(HP 半分未満・生存・召喚でない。持っていなければ乱数も DOM も触らない = #97 罠 B) | 食べる判定の型 |
| `index.html:21487-21495` | 呪文の枠が戻るのは**シナリオのクリア時だけ** | 最初に 1 枠使うと、その出撃のあいだずっと 1 枠減ったまま(= 装備の判断になる) |
| `index.html:14660` | `SPELL_SLOT_CURVE_ELF = [0, 2, 2, 3, …]`(Lv1 は 2 枠) | 変えない |
| `index.html:15720-15757` | `initAllySpellSlots`: エルフの枠は酒場で決めた配分。**覚えていない呪文は配分から外れる**(`isSpellKnown`) | 変えない。新しいセーブではグッドベリーが配分に入らない = 既存 golden の新しいセーブは動かない |
| `index.html:36420-36433` | `apTryPreferred`(#19 行動の優先度)は `sk.outOfCombat` の技を外す | 定義に `outOfCombat: true` |
| `tavern.html:4899-4911` | `ELF_SKILLS_UI`(index の `ELF_SKILLS` と同期) | 1 行足す。`autoCast: true`(傾向の候補に出さない。`tavern.html:8430-8434`) |
| `tavern.html:5724-5728` | `SCROLL_CATALOG_TV` の森の書 | 1 行足す(index と同じ行) |

エルフの呪文 ID が出てくる場所は、**`index.html` と `tavern.html` だけ**(リポジトリの全ページと `js/*.js` を `cordon-of-arrows` で全文 grep して実測。`index.html` 8 か所・`tavern.html` 2 か所)。

### 2-2. ⚠⚠⚠ 罠 A — 木の実を `plazaInventory` に入れると、出撃をまたいで増え続ける

ポーションの持ち物は localStorage に書かれる。

```js
// index.html:15501-15507
let plazaInventory = (function loadPlazaInventory() {
  try { return JSON.parse(localStorage.getItem("dragonfighters.plazaInventory") || "null") || {}; } …
function savePlazaInventory() { … localStorage.setItem("dragonfighters.plazaInventory", …) }
```

`addChargeItem` / `consumeCharge` で袋を作ると、ポーションと同じ口でそのまま動いてしまう。だが、**1 回唱えるたびに 10 個が次の出撃にも残り**、無料の回復がいくらでも増える。
⇒ 袋はページのスコープの変数 `let goodberryPouch = null;`(`{ count, owner, ownerName }`)で持つ。出撃 = ページ 1 枚なので、宣言の初期値と `startGame()` で `null` に戻す(`runHiddenFoeSlain` と同じ作法、`index.html:15943`)。
⭐ §8 の変異 `inpouch` で再現させる。

### 2-3. ⚠⚠⚠ 罠 B — 唱えたエルフへの帰属は、`RunChronicle.beginTurn(owner)` では入らない

戦闘の手番は、ループ側で `const __chSnap = RunChronicle.beginTurn(actor);`(`index.html:24658`)が帰属を開く。手番の中からもう一度 `beginTurn` を呼ぶと、**入れ子は何もしない**。

```js
// index.html:17143-17150
beginTurn(actor) {
  if (!CHRONICLE_ON) return null;
  turnDepth++;
  if (turnDepth > 1) return NESTED;   // ← 食べた本人の手番の中なので、必ずここに落ちる
```

コードンの矢(`index.html:35133`)が手番の外で持ち主へ帰属させているのを真似ると、食べた本人の「自分を回復した」として記録される。さらに、手番の終わりの差分(`applyTurnDiff`、`index.html:17045-17058`)が +1 を食べた本人へ積む。
⇒ 台帳へ口を 1 つ足す: **`RunChronicle.creditHealTo(owner, target, delta)`**。
1. 唱えた者の `healed` へ `delta` を直接積む
2. 開いている手番の控え(スナップショット)の、その対象の HP の基準を `+delta` して、手番の終わりの差分から外す(二重計上を防ぐ)

開いている控えを参照できるよう、`beginTurn` が深さ 1 で作った `s` を閉包の変数 `openSnap` に持ち、`endTurn` で `null` に戻す。`?chronicle=0` のときは即 return する。
⭐ 変異 `nested`(`beginTurn(owner)` で済ませる)と `nobaseline`(基準を直さない = 食べた本人にも +1)で再現させる。

⚠ `verify_run_chronicle` の N7 は `const __chOut = RunChronicle.beginTurn(` を**ちょうど 6 本**と数える(`index.html:35170` の注記)。今回は `beginTurn` を 1 本も足さないので、この数は変わらない。⛔ 足した場合も、変数名を `__chOut` にしないこと。

### 2-4. ⚠⚠ 罠 C — 食べる口を手番のループ(:24658 の手前)へ置くと、眠っている仲間も食べる

ループに 1 か所だけ置けば主人公と仲間の両方を覆える。だが、手番を飛ばす状態のガードは**手番の関数の中**にある。しかも仲間と主人公で中身が違う(§2-1 の表)。ループ側でこれを書き写すと、写し漏れた状態(眠り・粘液など)で食べてしまう。
⇒ 口は**ポーションと同じ 2 か所**(ガードを通った後)。帰属は §2-3 の `creditHealTo` で直す。
⭐ 変異 `inloop` で再現させる(ループ側へ移すと、眠っている仲間が食べて赤くなる)。

### 2-5. ⚠⚠ 罠 D — 森の書を 1 冊足すと、巻物の抽選と棚の冊数が動く

- 抽選(`index.html:15366-15375`)は、まず珍しさを引いてから、その珍しさの巻物の中から均等に 1 冊引く。common が 5 冊から 6 冊になるので、**同じ種でも common の巻物の出方が変わる**。
  `?goodberry=0` では抽選の行から外れるので、着手前と同じ出方に戻る(#80 のメイジハンドと同じ扱い)。
- common の冊数は、index と tavern の両方で**今 5 冊**(`sed -n 15194,15240p index.html | grep -c 'rarity: "common"'` → 5、`sed -n 5705,5760p tavern.html | grep -c 'rarity: "common"'` → 5)
- `tools/verify_scroll_shelf.js` は common の冊数を**固定値で 3 か所**縛っている(#80 の K12 と同じ場所):

| 行 | 今の値 | → 言い直し |
|---|---|---|
| `:377` (0a) | `DRV_COMMON.length === 5` | 6 |
| `:415` (2b) | `others.length === 4` | 5 |
| `:543` (3b) | `btnsLow.length === 4 && … btnsEq.length === 4` | 5 / 5 |

  見出しのコメント(`:25` `:30` `:36`)の数も合わせて直す。
- 酒場の巻物の棚(`tavern.html:7442`)は common を全部並べるので、森の書・グッドベリーは**棚に 80G で並ぶ**(初歩の呪文はこの棚で買える = #77 の設計どおり)。
  ⛔ 棚の filter 行に撤退スイッチを足さない。`verify_scroll_shelf` の変異アンカーは、この行が tavern.html に**ちょうど 1 回**あることを要求する(#80 罠E)。`?goodberry=0` でも棚には並ぶが、読んで覚えても唱えない・食べない(本体の口がスイッチを見る)。これは #80 のメイジハンドと同じ割り切り。
- 巻物の表を読むドライバは 8 本(`grep -ln "SCROLL_CATALOG\|grimoire-hail" tools/*.js`)。common の数を固定しているのは `verify_scroll_shelf` だけ。`verify_cleric_spirits` / `verify_counterspell` は uncommon / rare だけを数えるので動かない。抽選の行を縛る変異は部分一致なので、末尾へ足しても刺さる(`tools/verify_cleric_spirits.js:138` を確認)。

### 2-6. 乱数を引かない(既存 golden を動かさない)

- 回復量は固定の 1。食べるかどうかの判定は、数の比較だけで行う
- 装備していない・袋が空・スイッチが切れているときは、**乱数も DOM も触らずに `false`**(`tryDrinkHealingPotion` の罠 B と同じ作法、`index.html:24316`)
- 唱える側も乱数を引かない(術者探しは決め打ちの順)
- 既存 golden の新しいセーブは、森の書を読んでいない = グッドベリーが配分に入らない(§2-1)。⇒ 既存 golden で動くのは、**抽選の出方(罠 D)だけ**のはず。これを項目 1 で測って確かめる

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:32` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **鳴る**。
プレイヤー向けの要約は実在する(新しい呪文が増えて、棚で買える)。§10 に文面を用意した。

**再測定コマンド**:

    grep -n "cordon-of-arrows" index.html tavern.html
    grep -n "tryDrinkHealingPotion(" index.html
    grep -n "const __chSnap = RunChronicle.beginTurn\|beginTurn(actor) {" index.html
    grep -n "function takeArcaneEyeCaster\|\"cure-minor\": {\|async function apTryPreferred" index.html
    sed -n 15373p index.html
    grep -n "DRV_COMMON.length === \|others.length === \|btnsLow.length === " tools/verify_scroll_shelf.js
    sed -n 15194,15240p index.html | grep -c 'rarity: "common"'

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `ELF_SKILLS["goodberry"]`・森の書 1 行・抽選の行の末尾・`isGoodberryOn`・袋 `goodberryPouch`・`tryGoodberryOnEntry`(`startGame` から呼ぶ)・`tryEatGoodberry` と口 2 か所・`RunChronicle.creditHealTo` と `openSnap`・演出(既存の `showHealAt` / `showBanner` / `updateInfo`) |
| `tavern.html` | `ELF_SKILLS_UI` に 1 行(`autoCast: true`)・`SCROLL_CATALOG_TV` に 1 行 |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行 |
| `tools/verify_goodberry.js` | 新規(§8) |
| `tools/verify_scroll_shelf.js` | 固定値 3 か所 + 見出しのコメントの言い直し(§2-5) |

⛔ `town.html` / `world.html` / `audio.js` / `js/*`(changelog 以外)は開かない。エルフの呪文 ID は index / tavern にしか無い(§2-1)。

---

## 4. 項目 1 — 着手前の測り直し + golden の基準

- §2 の行番号をすべて `sed -n` で測り直す(ずれていたら §12 に書き戻す)
- 既存 golden を基準の HEAD で走らせ、**本数と結果を記録**する(§8 の一覧)
- ⭐ 項目 2 の後に「抽選の出方の変化」で赤くなるドライバがあるかどうかを見るため、巻物の拾得を名前で縛っているドライバがあれば名指しで控えておく

---

## 5. 項目 2 — 本体

### 5-1. 定義(index / tavern の 2 ファイル)

```js
// index.html ELF_SKILLS — cure-minor の後、Ranger 5 呪文の前
// ★[#116] グッドベリー (5.1 SRD Ranger 1 / 変成術)。最初の部屋で 1 回だけ自動で唱える。
// ⭐ outOfCombat: true —— apTryPreferred と主人公の技の候補がこの旗で外す (#78 / #79 と同じ)。
"goodberry": {
  name: "グッドベリー", category: "回復", target: "self", range: "self",
  mpCost: 2, levelReq: 1, outOfCombat: true,
  flavor: "最初の部屋で木の実を 10 個作る。HP が半分を切った味方が手番の頭に 1 個食べて 1 HP 回復 (手番は終わらない)",
},
```

```js
// index.html SCROLL_CATALOG — 森の書の末尾 (grimoire-haste の後)
"grimoire-goodberry":        { name: "森の書・グッドベリー",       spellId: "goodberry",        classKey: "elf", rarity: "common"   },
```

tavern は `ELF_SKILLS_UI` に `{ id: "goodberry", name: "グッドベリー", category: "回復", range: "self", mpCost: 2, levelReq: 1, autoCast: true, flavor: "…" }` を足し、`SCROLL_CATALOG_TV` には index と**逐語で同じ行**を足す。
⚠ `SCROLL_CATALOG_TV` の行に旗を足さない(`verify_scroll_shelf` の正規表現が行を rarity で閉じる = #78 罠D)。
⚠ `mpCost` は枠の制度(Phase 2-J)では表示用。値は既存の 1 レベル呪文(ハンターズ・マーク 2)に揃えた。

### 5-2. 撤退スイッチと袋

```js
/* ★[#116] 撤退スイッチ ?goodberry=0 — 唱えない・食べない・森の書を拾わない (棚には並ぶ = §2-5)。 */
function isGoodberryOn() {
  try { return new URLSearchParams(window.location.search).get("goodberry") !== "0"; }
  catch (e) { return true; }
}
/* ★[#116] 木の実の袋。出撃 = ページ 1 枚のあいだだけ持つ。
 * ⛔ plazaInventory / localStorage に入れない (罠 A: 出撃をまたいで無料の回復が増え続ける)。 */
const GOODBERRY_COUNT = 10;
let goodberryPouch = null;   // { count, owner, ownerName } — owner は "player" か仲間 (帰属に使う)
```

`startGame()` の頭で `goodberryPouch = null;`(`runHiddenFoeSlain = false;` の隣)。

### 5-3. 唱える — `tryGoodberryOnEntry()`

- `startGame()` の `tryArcaneEyeOnEntry();` の直前で呼ぶ。中で await しない同期関数にする
- 条件: `isGoodberryOn()` かつ `goodberryPouch === null` かつ `!gameOver`
- 術者探しは `takeArcaneEyeCaster` の型(順 = 主人公 → 仲間)。主人公は `leaderClassKey === "elf" && hasSpellSlot("player", "goodberry")`、仲間は `classKey === "elf" && alive && hasSpellSlot(caster, "goodberry")`
- `consumeSpellSlot` で 1 枠を使い、`goodberryPouch = { count: GOODBERRY_COUNT, owner, ownerName }`
- 帯 `showBanner("🫐 グッドベリー — 木の実が 10 個実った", 1600)` と `updateInfo`(術者の名前入り)を 1 回
- ⛔ 乱数を引かない。2 人目のエルフは唱えない(袋は 1 つ)

⚠ 魔法の眼と違って、`RUN` を条件にしない(旧タイプのマップでも唱える)。ただし旧タイプは全廃済み(#62 F1〜F4)なので、実質の差は無い。

### 5-4. 食べる — `tryEatGoodberry(unit)`

```js
/* ★[#116] 木の実を 1 個食べる。食べたら true だが、⛔ 呼び口は return しない (手番は終わらない)。
 * ⚠⚠ 乱数も DOM も触らずに false を返す枝を先に全部並べる (§2-6 = 既存 golden を動かさない)。 */
function tryEatGoodberry(unit) {
  if (!goodberryPouch || goodberryPouch.count <= 0 || !isGoodberryOn()) return false;
  const isPlayer = unit === "player";
  if (isPlayer ? !(hp > 0 && hp < maxHp / 2) : !(unit && unit.alive && unit.hp < unit.maxHp / 2 && !unit.isSummon)) return false;
  goodberryPouch.count--;
  if (isPlayer) hp = Math.min(maxHp, hp + 1); else unit.hp = Math.min(unit.maxHp, unit.hp + 1);
  RunChronicle.creditHealTo(goodberryPouch.owner === "player" ? { head: true } : goodberryPouch.owner,
                            isPlayer ? { head: true } : unit, 1);
  // 頭上の「+1」(showHealAt) と updateInfo。帯は袋が空になったときだけ「🫐 木の実を食べ尽くした」
  return true;
}
```

呼び口 2 か所(§2-1)— どちらも `tryDrinkHealingPotion` の**直前**に、`return` を付けずに置く:

```js
tryEatGoodberry(ally);                                 // ★[#116] 手番は終わらない (return しない)
if (await tryDrinkHealingPotion(ally)) return;
```

- 1 HP しか回復しないので、満タンを超える分は `Math.min` で切るだけでよい
- 食べた後もまだ半分を切っていれば、続けてポーションを飲んでよい(既存の判定のまま)
- ⚠ 帰属の `owner` は、唱えたエルフが倒れていても変えない(木の実は残る = SRD どおり)

### 5-5. 台帳の口 — `RunChronicle.creditHealTo(owner, target, delta)`

- 閉包に `let openSnap = null;` を足す。`beginTurn` が深さ 1 で `s` を作ったら `openSnap = s`、`endTurn` が `snap !== NESTED` で閉じるときに `openSnap = null`
- `creditHealTo`:
  1. `if (!CHRONICLE_ON || !delta) return;`
  2. `const m = ensure(owner); if (m) m.healed += delta;`
  3. 開いている控えがあれば、対象の基準を `+delta`(頭なら `openSnap.head`、仲間なら `allies.indexOf(target)` の位置の `openSnap.allies[i]`。`null` は触らない)
- ⛔ `credit()` と `applyTurnDiff()` の中身は変えない

### 5-6. changelog

§10 の 1 行を `py tools/add_changelog.py` で足す。

---

## 6. 項目 3 — 受入 `tools/verify_goodberry.js`(新規・§8)

## 7. 撤退スイッチ

- **`?goodberry=0`** — 唱えない(枠も減らない)・食べない・巻物の抽選から外れる(着手前と同じ出方)。酒場の棚には並ぶ(§2-5)
- ⚠ 判定位置 = `tryGoodberryOnEntry` の頭・`tryEatGoodberry` の頭・抽選の行。各ページが独立に読む(遷移はまたがない。戦闘は index.html の 1 ページで完結する)

---

## 8. 受入条件 — `tools/verify_goodberry.js`(新規)

既存ドライバの起動(puppeteer-core + 実 Chrome、`?diag=1` の実入場)を流用する。エルフを習得済み・グッドベリーに 1 枠配分したセーブを種まきし、戦闘中の HP を直接下げて食べる口を駆動する。
⭐ 帰属は台帳の公開の口(`RunChronicle.snapshot(null)`)から読み、HP の実体(`hp` / `allies[i].hp`)と**2 経路で突き合わせる**。

### §0 装置(先に母集団を確かめる)

- **(0a)** ソースから正規表現で引いた `ELF_SKILLS.goodberry` / `ELF_SKILLS_UI` の行 / 森の書の行(両ファイル・逐語で同じ・common)が 1 つずつある
- **(0b)** 種まきしたセーブで、エルフの `maxSpellSlots.goodberry >= 1` になっている(習得のゲートを通った)
  ⭐ これが無いと、唱えない理由が「習得していない」なのか「欠陥」なのかを見分けられない
- **(0c)** 駆動した戦闘で、食べる口を通った手番が 1 回以上ある(0 回なら exit 3)

### §1 唱える

- **(1a)** 最初の部屋で袋が `count === 10`、術者の枠が 1 減る(`maxSpellSlots - spellSlots === 1`)
- **(1b)** 主人公がエルフのとき(主人公の枠 `"player"`)と、仲間のエルフのときの両方で唱える
- **(1c)** エルフが 2 人いても袋は 1 つで、枠が減るのは 1 人だけ
- **(1d)** 帯の「木の実が 10 個実った」が 1 回だけ出る

### §2 食べる

- **(2a)** HP が半分未満なら、手番で `count` が 1 減り HP が +1(満タンで切れる)
- **(2b)** HP が半分以上なら食べない(境界: ちょうど半分は食べない)
- **(2c)** **手番は終わらない**: 食べた同じ手番で、攻撃または呪文の記録が出る
- **(2d)** 1 手番に 1 個まで
- **(2e)** 眠っている(`stunned > 0`)仲間・`sleepRemaining > 0` の主人公は食べない(罠 C)
- **(2f)** 召喚獣は食べない
- **(2g)** 袋が空になったら食べない。「食べ尽くした」の帯が 1 回だけ出る

### §3 記録の帰属(罠 B)

- **(3a)** 仲間 A が食べた n 個の回復が、唱えたエルフの `healed` に n 入り、A の `healed` は増えない(HP の実体の増分と一致)
- **(3b)** 唱えたエルフが倒れた後に食べても、倒れたエルフへ入る
- **(3c)** `?chronicle=0` でも食べる(記録だけが止まる)

### §4 出撃をまたがない(罠 A)

- **(4a)** 唱えて食べた前後で、localStorage の `dragonfighters.plazaInventory` が 1 バイトも変わらない
- **(4b)** ページを読み直した次の出撃の頭で `goodberryPouch === null`(唱え直すまで食べない)

### §5 乱数(§2-6)

- **(5a)** 袋が無い戦闘と `?goodberry=0` の同じ戦闘で、`Math.random` の呼び出し回数が同じ(ラッパで数える)

### §6 撤退

- **(6a)** `?goodberry=0` → 唱えない(枠が減らない)・食べない・`pickScrollId` の common の候補に `grimoire-goodberry` が出ない(抽選の母集団を直接見る)
- **(6b)** スイッチ無しでは候補に入る

### ⛔ 測らないこと

- 1 個あたりの回復量の「手応え」と、帯の秒数(実機で見て動かす余地を残す)
- `mpCost` の値(枠の制度では表示用)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `inpouch` ⭐ | 袋を `addChargeItem("goodberry")` で `plazaInventory` に作る(罠 A) | (4a) |
| `nested` ⭐ | `creditHealTo` の代わりに `RunChronicle.beginTurn(owner)` / `endTurn` で包む(罠 B) | (3a) |
| `nobaseline` ⭐ | `creditHealTo` の基準の直しを外す(二重計上) | (3a) |
| `inloop` ⭐ | 食べる口を手番の関数から外し、`const __chSnap` の手前のループへ移す(罠 C) | (2e) |
| `endsturn` | 呼び口を `if (tryEatGoodberry(ally)) return;` にする | (2c) |
| `multi` | `while (tryEatGoodberry(unit));` にする | (2d) |
| `fullhp` | 条件を `hp < maxHp` にする | (2b) |
| `rng` | 早期 return の前に `Math.random()` を 1 回引く | (5a) |
| `poolleak` | 抽選の行の `&& (isGoodberryOn() \|\| id !== "grimoire-goodberry")` を外す | (6a) |
| `twocast` | 術者探しで見つかった全員の枠を減らす | (1c) |

### 既存 golden の非退行(実装後に必ず走らせる)

項目 1 で基準を測り、項目 2 の後に同じ結果であることを確かめる。最低限、名指しで:

`verify_scroll_shelf`(言い直し後)/ `verify_run_chronicle` / `verify_plaza_srd` / `verify_arcane_eye` / `verify_mage_hand` / `verify_invisibility` / `verify_cleric_spirits` / `verify_counterspell` / `driver_action_priority` / `verify_spell_off` / `verify_promote_growth`(#115)

⚠ 本数と基準値は、項目 1 の実測が唯一の正(この依頼書には書かない = 起草日の値はすぐ腐る)。**走らせて違ったら、期待値を書き換える前に理由を突き止める**。抽選の出方の変化(罠 D)で赤くなったドライバは、`?goodberry=0` で緑に戻ることを確かめてから言い直す。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http で起動する(file:// では音が出ない)。

1. 酒場の巻物の棚で森の書・グッドベリーを買って読み、エルフに 1 枠配分して出撃する。最初の部屋で帯が 1 回出る
2. 4 人が同時に半分を切る戦闘で、頭上の「+1」が詰まらないか(iPhone)
3. 帰還後のレポートで、エルフの「回復」に木の実の分が載っている

---

## 10. changelog(⚠ index.html / tavern.html を触るので必須)

    py tools/add_changelog.py "<b>エルフの新呪文「グッドベリー」</b> — 最初の部屋で木の実を 10 個作り、HP が半分を切った仲間が戦いながら 1 個ずつ食べて回復する。森の書は酒場の巻物の棚で買える。"

---

## 11. やらないこと

- ⛔ 戦闘中に唱える AI 判断(会議で不採用)
- ⛔ 木の実を出撃をまたいで持ち越す / 闇市で売る / 主人公の持ち物の画面に出す
- ⛔ 木の実の新しい絵・効果音(既存の回復表示と絵文字の帯で済ませる。外部素材なし)
- ⛔ 休憩の場面での追加の回復(候補②)/ 仲間へ投げ渡す演出(候補③)
- ⛔ 1 個あたりの回復量をゲーム向けに増やすこと(SRD の 1 HP のまま。動かすなら実機の後の別チケット)
- ⛔ キュア・マイナーなど既存のエルフの呪文と、エルフ AI の優先度の変更
- ⛔ 酒場の巻物の棚の filter 行へ撤退スイッチを足すこと(§2-5)
- ⛔ ボールトの spells.md の更新(ユーザーが別 PC で「エルフの呪文のうち、旅の呪文 1 つだけは弓と連動しない例外」と追記する)
- `実装依頼書/README.md` に足す行(承認後に計画窓が足す):

    | 116 | [2026-11-21_goodberry.md](2026-11-21_goodberry.md) | **承認済** | 0% | エルフの新呪文グッドベリー = 最初の部屋で木の実 10 個・HP 半分未満の味方が手番の頭に 1 個食べて +1(手番は終わらない)。⚠⭐ 袋は localStorage に入れない(出撃をまたぐと増え続ける)/ 帰属は `beginTurn(owner)` では入らない(入れ子は no-op)→ `creditHealTo` / 森の書で common が 6 冊 = `verify_scroll_shelf` の固定値 3 か所を言い直す / 撤退 `?goodberry=0` |

---

## 12. 実装結果

### 12-1. 着手前の測り直し + golden の基準(項目 1・基準 HEAD `3adee77`・2026-11-21)

**基準**: `3adee77`(作業ツリーきれい)。`git diff --stat 63c7632 3adee77` は依頼書・会議記録・README の 3 本だけ = **本番コード(index / tavern / js / tools)は起草時の基準 `63c7632` と同じバイト**。ログ一式は `~/.claude/dev-loop/r116/item1/`(`remeasure*.log` / `<driver>.log` / `golden_raw.txt` / `summary.txt`)。

**§2 の行番号 — ずれ無し**(`sed -n` / `grep -n` で実測。範囲の終わりが 1〜5 行ずれる 2 件は注記つき。どちらも挿入位置には影響しない):

| 依頼書の行 | 実測 | 判定 |
|---|---|---|
| `index.html:25227-25232` `"cure-minor"` | 25227 `"cure-minor": {` 〜 25232 `},`(25233 = Ranger 5 呪文の見出し) | ✅ |
| `index.html:15216-15220` 森の書 5 冊 | 15216 hail(common)/ 15217 cordon / 15218 lightning / 15219 conjure / 15220 haste、15221 `};` | ✅ |
| `index.html:15373` 抽選の行 | 末尾 `… && (isCounterspellOn() \|\| id !== "scroll-counterspell"));` | ✅ |
| `index.html:15259-15262` `isMageHandOn()` | 15259 〜 15262 | ✅ |
| `index.html:15940-15949` `startGame()` | 15940 `function startGame()` / 15943 `runHiddenFoeSlain = false;` / 15948 `tryArcaneEyeOnEntry();` / 15949 `}` | ✅ |
| `index.html:41414-41426` `takeArcaneEyeCaster` | 41414 〜 41426 | ✅ |
| `index.html:34087-34088` 仲間の口 | 34087 注記 / 34088 `if (await tryDrinkHealingPotion(ally)) return;` | ✅ |
| `index.html:36758-36759` 主人公の口 | 36758 注記 / 36759 `if (await tryDrinkHealingPotion("player")) return;` | ✅ |
| `index.html:24314-24345` `tryDrinkHealingPotion` | 24314 〜 **24340**(関数の閉じ括弧。24342〜 は次のワンドの注記)。24316 = 罠 B の早期 return | ✅(終わりは 24340) |
| `index.html:21487-21495` 枠の回復はクリア時だけ | 21487 `dungeonCleared = true;` 〜 21495 | ✅ |
| `index.html:14660` `SPELL_SLOT_CURVE_ELF` | `[0, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10]` | ✅ |
| `index.html:15720-15757` `initAllySpellSlots` | 15721 `function` / 15747 `if (!isSpellKnown(classKey, id)) continue;` | ✅ |
| `index.html:36420-36433` `apTryPreferred` | 36420 / 36433 `if (sk.reactive \|\| sk.passive \|\| sk.outOfCombat) return false;` | ✅ |
| `index.html:15501-15507` `plazaInventory` | 15501 〜 15507(15508 = `addChargeItem`) | ✅ |
| `index.html:17143-17150` `beginTurn` | 17144 `beginTurn(actor) {` / 17147 `if (turnDepth > 1) return NESTED;` | ✅ |
| `index.html:17045-17058` `applyTurnDiff` | 17045 〜 **17059**(関数の閉じ括弧) | ✅ |
| `index.html:24658` `const __chSnap` | 24658 | ✅ |
| `index.html:35133` コードンの帰属 / `:35170` 注記 | 35133 `const __chOut = RunChronicle.beginTurn(zone.owner \|\| "コードン");` / 35170 N7 の注記 | ✅ |
| `tavern.html:4899-4911` `ELF_SKILLS_UI` | 4899 `const ELF_SKILLS_UI = [` 〜 4910 haste / 4911 `];` | ✅(足すのは 4910 の後) |
| `tavern.html:5724-5728` `SCROLL_CATALOG_TV` 森の書 | 5724 〜 5728(5729 `};`) | ✅ |
| `tavern.html:7442` 棚の filter 行 | `return Object.keys(SCROLL_CATALOG_TV).filter(id => SCROLL_CATALOG_TV[id].rarity === "common");` | ✅ |
| `tavern.html:8430-8434` `isAutoCastSkillTV` | 8430 注記 / 8431 `function` 〜 8434 | ✅ |
| `tools/verify_scroll_shelf.js:377 / :415 / :543` | `DRV_COMMON.length === 5` / `others.length === 4` / `btnsLow.length === 4 … btnsEq.length === 4` | ✅ |
| `scripts/hooks/check_changelog.py:32` | `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` | ✅ |

再測定コマンド(§2-7)の結果: `cordon-of-arrows` は index 8 か所・tavern 2 か所、他のページと `js/*.js` には 0(✅)/ `tryDrinkHealingPotion(` = 15576・24314・34088・36759 / common の冊数 = index 5・tavern 5(✅)/ `goodberry` は index・tavern・tools のどこにも 0 件(未着手の確認)/ ハンターズ・マークの `mpCost: 2, levelReq: 1`(25249)= §5-1 の値の根拠どおり。

**前提の補足(崩れてはいない・項目 2 で踏まないための注記)**:

- ⚠ **N7 の「ちょうど 6 本」**: 生の `grep -c 'const __chOut = RunChronicle.beginTurn('` は **7** を返す(7 本目 = 35170 の**注記コメント**)。ドライバの正規表現 `const __chOut = RunChronicle\.beginTurn\([^;]*\);` で数えると **6**(18981 / 19665 / 30401 / 30430 / 30482 / 35133)。⇒ `creditHealTo` の注記には `const __chOut = RunChronicle.beginTurn(…);` を**逐語で書かない**(`);` で閉じると 7 本目として数えられ、N7 の注入数が合わなくなる)
- ⚠ `verify_scroll_shelf` の言い直しは、ロジックの 3 か所(377 / 415 / 543)のほかに、**表示用の文字列とコメント**にも数が埋まっている: 見出し 25・30・32・36、注記 171・192、`R.check` のラベル 378(`common 5 件`)・391(`common 4 件`)・416(`他の common 4 件`)・440(`4 件は同じ`)。(1a)(1c)(1e) の判定そのものは `DRV_COMMON` / `commonNames` から引くので値の書き換えは要らない(454 も `=== DRV_COMMON.length`)
- `RunChronicle.beginTurn(` の全数は 9 本(`__chSnap` 1 + `__chOut` 6 + `__chSp` ほか)。項目 2 で 1 本も足さない方針(§2-3)は変わらない

**golden の基準(`3adee77`・2026-11-21 16:31〜16:43 の**昼**に直列で実走・PowerShell から `node tools/<d>.js`。各ドライバは自前のサーバを立てるため `py -m http.server` は使っていない)**:

| ドライバ | 結果 | 秒 |
|---|---|---|
| `verify_scroll_shelf` | **19/19 PASSED** exit 0 | 3 |
| `verify_run_chronicle` | **74 PASSED / 0 FAILED** exit 0 | 179 |
| `verify_plaza_srd` | **27/27 PASSED** exit 0 | 19 |
| `verify_arcane_eye` | **34/34 PASSED** exit 0 | 65 |
| `verify_mage_hand` | **32/32 PASSED** exit 0 | 143 |
| `verify_invisibility` | **27/27 PASSED** exit 0 | 45 |
| `verify_cleric_spirits` | **23/23 PASSED** exit 0 | 11 |
| `verify_counterspell` | **25/25 PASSED** exit 0 | 55 |
| `driver_action_priority` | **PASSED 92 / FAILED 0** exit 0 | 75 |
| `verify_spell_off` | **51/51 PASSED** exit 0 | 6 |
| `verify_promote_growth` | **14/14 PASSED** exit 0 | 22 |
| (追加)`verify_clear_chests` | **21/21 PASSED** exit 0 | 10 |
| (追加)`verify_save_slots` | **30/30 passed** exit 0 | 5 |
| (追加)`verify_egg_parent` | **25/26・FAILED 1** exit 1 ⚠ | 109 |

⇒ §8 の名指し 11 本はすべて緑(11/11)。⚠ #102 の時刻依存: 11 本と追加 3 本の中で `plazaClock` を種まきするのは `verify_clear_chests` / `verify_save_slots` の 2 本だけ。どちらも昼に走らせて緑だった。項目 2 の後も**昼**に走らせて比べる。

⚠ **`verify_egg_parent` の赤 1 本 = 型 3(#116 とは無関係・着手前から赤い)**: (6a)「触らない約束の関数のソースが `62f500a` と同じ」で、`runEncounter` の長さが 21906 → 22068 と違う(他の 4 関数は同じ)。コミットごとに `runEncounter` の本体を切り出して長さを測ると、変わったのは **`9034fc7`(#114 項目 2 = 不意打ちの第 1 ラウンド)**で、それより前(`62f500a` / `9efa2bd` / `f8e3cb1` / `1a44ac8`)は同じ。⇒ (6a) は #111 の固定の基準 `BASE_REV = '62f500a'` に縛られていて、#114 が `runEncounter` を正当に変えた時点で赤くなっていた。⛔ #116 では直さない(#116 は `runEncounter` を触らない)。項目 2 の後も **25/26・赤いのは (6a) だけ**で同じなら非退行とみなす。言い直しは別チケット候補(基準を `9034fc7` 以降へ進めるか、#114 の差分を許す)。

**⭐ 巻物の拾得を名前で縛るドライバ(罠 D で動きうるもの)** — `grep -ln "pickScrollId" tools/*.js` と巻物 ID の名指し(`"(grimoire|scroll|tome)-…"`)の和集合で 9 本:

| ドライバ | 縛り方 | common が 6 冊になったときの見込み |
|---|---|---|
| `verify_scroll_shelf` | common の冊数を固定値で 3 か所(377 / 415 / 543) | **確実に赤** ⇒ §2-5 どおり言い直す(+ 上のラベルとコメント) |
| `verify_mage_hand` (11b) | `pickScrollId({common:100})` の全区間 2000 点で `scroll-mage-hand` が素で 1 回以上・`?magehand=0` で 0 回 | 母集団 6 冊でも 1 回以上当たる見込み = 緑のはず |
| `verify_counterspell` (5b) | 全区間の common / uncommon / rare の集合を素と `?counterspell=0` で比べる(common は**同じページ同士の比較**) | 両腕に `grimoire-goodberry` が入る = 緑のはず |
| `verify_cleric_spirits` (5b) | 同上(`?clericspirit=0`) | 緑のはず |
| `verify_arcane_eye` (6b) | rare / uncommon の集合だけを見る | 影響なし |
| `verify_invisibility` (6b) | uncommon だけを見る | 影響なし |
| `verify_egg_parent` (5b) | `pickScrollId` を包んで**重みだけ**を記録する | 影響なし |
| `sim_plaza_entry` | 注記で重みに触れるだけ(golden ではない) | 影響なし |
| `verify_save_slots` | 表の全呪文を 9 冊ずつ種まきする(名指しの数は持たない) | 緑のはず(表を読む側) |

⇒ 抽選の出方の変化で赤くなるのが確実なのは `verify_scroll_shelf` だけ。他の 8 本は項目 2 の後に実走して確かめる(赤ければ `?goodberry=0` で緑に戻ることを確かめてから言い直す = §8 の作法)。
⚠ 種を固定して宝箱やボスの落とし物の**巻物の名前**を縛っているドライバは見つからなかった(`verify_clear_chests` は `scrollStock` を localStorage の控えとして読むだけで、名前の assert は無い)。
