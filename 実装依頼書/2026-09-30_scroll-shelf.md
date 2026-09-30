# #77 武器防具屋に巻物の棚 — 初歩の呪文 4 種を 80G で買える

- **起草**: 2026-09-30(計画窓 = 起草窓) / **ステータス**: **承認済**(2026-09-30 ユーザー承認)
- **着手**: 実装窓は**窓更新を挟んでから**着手する(2026-09-28 の恒久ルール)
- **触るファイル**: `tavern.html`(棚の関数 + `renderShop` + 検証ブリッジ + changelog)/ `tools/verify_scroll_shelf.js`(新規)
- ⛔ **触らないファイル**: `index.html`(拾う・抽選・`SCROLL_CATALOG` の本体)/ `js/*` / `audio.js` / `town.html`。
  §2-6 で**開く必要が無い**ことを確認済み。
- 並走: 実装窓は #76 完了後で待機中。作業ツリーは clean(2026-09-30 `git status --short` = 0 行・HEAD `d440334`)。
  それでも作法は守る: `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

巻物は今、**拾うことでしか手に入らない**。武器防具屋の売り物は武器・防具・盾の 3 種だけで、
初歩の呪文(バーニングハンズ / ブレス / ヘイルオブソーン)を覚えたくても、宝箱とボスの抽選を待つしかない。
「敵の様子を探る魔法」シリーズ(会議 `dev-meetings/2026-09-28_scouting-magic.md`「計画書の修正 2」)の S として、
武器防具屋に **「巻物」の棚**を 1 つ足し、**よくある(common)巻物**を金貨で買えるようにする。
買った巻物は拾った巻物と同じ所持品(`dragonfighters.scrollStock`)に入り、既存の「読む」で覚える。
**新しい仕組みは値段と陳列だけ**(会議のレンツ)。

**ユーザー決定**:

- 2026-09-28(会議の決裁): 「初歩呪文は、武器防具道具屋で買えるようにしたい」。店で買えるのは **1 レベルまでの初歩の呪文 = common の巻物**。
  透明化(uncommon)と魔法の眼(rare)は B/C で**拾うだけ**にする。
- 2026-09-30(本起草時):
  - **習得済みの呪文の巻物は、棚に並べるが買えない**(「習得済み」と表示)。**所持中(未読 1 冊以上)も買えない**。
    ⭐ 不採用: 「スリープを棚から外す(3 種)」= 表示の規則ではなく ID で外すことになり、`?magesleep=0` や、読んだ後の他の巻物に効かない。
    「常に買える」= 習得済みの巻物は読むと消えるだけで、金貨の無駄遣いになる。
  - **値段は 1 冊 80G**。⭐ 不採用: 40G(= 既存の `DF_PRICE_BY_RARITY.common`)/ 120G。

---

## 2. 着手前の実測(HEAD `d440334`・2026-09-30)

### 2-1. 会議・引き継ぎメモの前提のうち、崩れていた/補足が要るもの

| # | 前提 | 実測 |
|---|---|---|
| 1 | 「common 4 種を販売」 | 4 種のうち **scroll-sleep は #54 以降、魔法使いが最初から覚えている**(`tavern.html:5379` `DEFAULT_KNOWN_TV.mage = withInnateSleepListTV(...)`)。そのまま売ると、読んでも「習得済み(スクロールは消費)」になるだけ ⇒ ユーザー決定で「並べるが買えない」 |
| 2 | 「店の棚に足すだけ」 | 武器防具屋の品目は**主人公の職業ごと**(`shopPool` = `CHAR_EQUIP[shopHeroKey()]` `:6795`)で、所持は**ティアの有無(0/1)**。巻物は**個数**(`scrollStockTV` = `{id: 個数}`)で、職業の表とも無関係 ⇒ 武器防具の `shopPool` へ混ぜず、**別の群として** `renderShop` の末尾へ足す |
| 3 | (暗黙)棚は主人公の職業の巻物だけ? | 覚えた呪文は**職業ごと**に持つ(`knownSpellsTV[classKey]`)。戦闘の側も**NPC 仲間の呪文枠を同じゲートに通す**(`index.html:14006` `initAllySpellSlots` / `:20090` `initLeaderSpellSlots` の `isSpellKnown(classKey, id)`)⇒ **主人公が戦士でも、NPC の僧侶はブレスの聖典で覚えたブレスを使える**。棚は**主人公の職業に関係なく 4 種とも並べる** |
| 4 | 「読むのは酒場」 | 準備画面は #55 で廃止済み。「読む」の口は**マッチング画面の主人公の引き出しの「📜 スクロール書庫」段だけ**(`tavern.html:9108〜9119`)。旧パネル `#scrollLibrarySection`(`:3278`)は DOM に残るが準備画面ごと出ない ⇒ 買った直後のトーストで場所を案内する |
| 5 | 「店の品目データの形は未測定」(引き継ぎメモ) | 測定済み: 武器防具の行 = `{kind, tier, item, equipped}`、値段 = `dfShopBuyPrice(item)`(`:5021`)、購入 = `dfShopBuy(kind, tier)`(`:6810`)。巻物はこの形に乗らない(#2)⇒ 専用の `dfShopBuyScroll(id)` を足す |
| 6 | 「B/C の巻物を棚に出さない仕組みは未測定」 | 仕組みは要らない: 棚の中身を **`SCROLL_CATALOG_TV` の `rarity === "common"` から導けば**、B/C が uncommon/rare で足す巻物は**自動的に並ばない**。⛔ ID 4 つを焼かない(§8 変異 `allrarity` / `idlist`) |

### 2-2. ⚠⚠⚠ 見つけた設計上の罠(すべて §8 の変異に内蔵する)

**罠A — 所持品は画面が握るオブジェクトが正。localStorage へ直接書くと、次の「読む」で消える。**

```js
// tavern.html:5428 — 読み込みはページを開いた 1 回だけ
let scrollStockTV = (function () { ... JSON.parse(localStorage.getItem("dragonfighters.scrollStock") ...) })();
// tavern.html:5444 learnScroll — 画面が握る scrollStockTV を丸ごと保存し直す
scrollStockTV[scrollId] -= 1; ... saveScrollStockTV();
```

購入で `localStorage` の `dragonfighters.scrollStock` を**直接**書き換えると、`scrollStockTV` には載らない。
書庫にも出ず、別の巻物を「読む」と `saveScrollStockTV()` が古い `scrollStockTV` で**上書き**して、買った巻物が消える。
⇒ 購入は **`scrollStockTV[id] += 1` → `saveScrollStockTV()`** の順で書く(#60 の「保管庫から読んだオブジェクトと画面が握るオブジェクトは別物」と同型)。
⭐ 変異 `rawstock`(購入が localStorage を直接書く)。§3 の「買う → 別の巻物を読む → まだ残っている」で赤くなる。

**罠B — 「習得済み」を保存値から読むと、#54 のスリープが買えてしまう。**

```js
// tavern.html:5415 — 習得済み = 初期習得 (DEFAULT_KNOWN_TV) ∪ 保存値
out[cls] = Array.from(new Set([...DEFAULT_KNOWN_TV[cls], ...stored]));
```

`dragonfighters.knownSpells` の**保存値だけ**を見ると、スリープは初期習得なので入っていない(新しいセーブでは保存値が空)⇒ 棚で「買える」と出る。
⇒ 判定は **`isSpellKnownTV(classKey, spellId)`(`:5423`)** を使う。書庫の `[習得済み]` 表示(`:7654`)と同じ関数 = 2 つの画面の表示が食い違わない。
⭐ 変異 `rawknown`(保存値だけで判定する)。§2 の「スリープは習得済み・買えない」で赤くなる。

**罠C — 棚の行が「買える品はもうありません。」の判定に入らない。**

`renderShop` は武器防具の行が 1 つも無いと空の文言を出す(`:6897〜6902` の `any`)。巻物の群を足しても `any` を立てないと、
武器防具を全部持っているとき「**買える品はもうありません。」の下に巻物の棚が出る**。
⇒ 巻物の群を描いたら `any = true`。⭐ 変異 `noany`。§1 の「装備を全部持っていても空の文言が出ない」で赤くなる。

**罠D — ⛔ 撤退の対象を「棚の表示」だけにすると、ブリッジからは買えてしまう。**

撤退 `?scrollshop=0` は `scrollShelfIds()` が空を返す形にし、表示と購入の**両方**が同じ関数を通るようにする(§4)。
⭐ 変異 `leakbuy`(撤退時も `dfShopBuyScroll` が通る)。§5 で赤くなる。

### 2-3. 数値の出所

| 対象 | 実測値 | → 採用値 |
|---|---|---|
| 武器防具の既定単価 `DF_PRICE_BY_RARITY` | `tavern.html:5003` = `{ common: 40, uncommon: 120, rare: 320, ... }` | 巻物は**表に乗せず**専用の定数 `SCROLL_SHELF_PRICE = 80`(ユーザー決定)。⛔ `DF_PRICE_BY_RARITY.common` を 80 へ変えない(武器防具の common が全部値上がりする) |
| 宝箱の金貨 | `index.html:23787` 小 10〜20 / `:23789` 大 30〜50 | 80G = 宝箱 2〜4 個 |
| ボスの財宝 | `index.html:17495〜` `200 + floor(rand*101)` = 200〜300 | ボス 1 体で 2〜3 冊 |
| 街道の襲撃のクリア報酬 | `js/road-events.js:487` `clearGold: 80` | 1 冊ぶん |
| common の巻物 | `tavern.html:5340〜5358` の `rarity: "common"` = **4 件**: `scroll-sleep` / `scroll-burning-hands` / `tome-bless` / `grimoire-hail-of-thorns` | 表から導く(焼かない) |
| 開発用の 1G 陳列 | `tavern.html:5020〜5022` `DF_DEV_MAGIC_SHOP` は **`item.gated` の品だけ** 1G | 巻物は `gated` を持たない ⇒ dev モードでも 80G のまま(変更しない) |

**計測コマンド**(再測定するとき):

    grep -n 'rarity: "common"' tavern.html | grep "scroll-\|tome-\|grimoire-"      # → 4 行 (5341/5342/5348/5353 付近)
    grep -n "DF_PRICE_BY_RARITY\s*=" tavern.html
    grep -n "function renderShop\|function dfShopBuy\|let scrollStockTV\|function learnScroll\|function isSpellKnownTV" tavern.html
    grep -ohE "\b10[4-5][0-9]{2}\b" tools/*.js | sort -n | uniq | tail -3             # → 10483 が最大 (verify_lore_check の変異)

### 2-4. 既存の検証のうち、店と巻物に触れる本(= golden の空白地帯)

| 本 | 触れ方 |
|---|---|
| `tools/verify_town_map.js` | `#shopEntry` を**押せるか**だけ(`:608` 付近)。店の中身は見ない |
| `tools/verify_save_slots.js` | `dragonfighters.scrollStock` をスロットの鍵として運ぶ(前方一致 `dragonfighters.`)。形は変えないので影響なし |
| `tools/sim_plaza_entry.js` | 闇市のシム。`scrollStock` を読む |

⚠ **`__equipTV.shopBuy` / `shopListText` / `openShop` を使う本は 0 本**(`grep -ln "shopListText\|shopBuy\|openShop" tools/*.js` = 0 件)。
店は**受入の空白地帯** ⇒ 本チケットの新規受入が店の最初の golden になる。

### 2-5. 検証ブリッジ

`window.__equipTV`(`tavern.html:5205〜`、try で包まれた検証用の窓口)に「STEP4: 武器防具屋」の群がある(`:5237〜5243`)。
巻物の棚はここへ足す(§6)。⚠ `__equipTV` は `driver_action_priority.js` などが使っている ⇒ **足すだけ**で、既存のキーは 1 つも変えない。

### 2-6. 触る範囲

- `tavern.html` だけ。`SCROLL_CATALOG` は `index.html:13569` と `tavern.html:5340` の二重定義だが、**表は読むだけで書き換えない** ⇒ 同期の問題は起きない。
- `index.html` の `scrollStock`(`:13665`)は、ページを開いたときに `localStorage` から読む ⇒ 酒場で買った巻物は次の潜行で正しく見える(拾った巻物は `addScroll` が `+1` して保存 = 買った分を消さない)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ `tavern.html` を触るので**鳴る**。
プレイヤー向けの要約は実在する(店に棚が増える)。文面は §10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | 棚の定数と関数 4 つ(`dfShopBuy` / `dfShopSell` の直後)/ `renderShop` の末尾に「巻物」の群 / `__equipTV` へキー 4 つ / changelog 1 行 |
| `tools/verify_scroll_shelf.js`(新規) | 受入(§8)。base ポート **10484**、変異は 10485〜 |

⛔ `index.html` / `js/*` / `town.html` は開かない(§2-6)。
⛔ `DF_PRICE_BY_RARITY` / `dfBuyPrice` / `dfShopBuyPrice` / `learnScroll` / `renderScrollLibrary` は **1 バイトも変えない**。

---

## 4. STEP1 — 棚の定数と関数(`dfShopSell` `:6821〜6831` の直後、`let shopTab` の前)

```js
  /* ★[#77] 巻物の棚 — 初歩の呪文 (SCROLL_CATALOG_TV の rarity "common") を 1 冊 80G で売る。
   * ⭐ 並べる品は表から導く (ID を焼かない) ⇒ B/C で足す透明化 (uncommon)・魔法の眼 (rare) は並ばない。
   * ⭐ 主人公の職業に関係なく全部並べる —— 覚えた呪文は職業ごとで、NPC 仲間の呪文枠も
   *   同じゲート (index.html isSpellKnown) を通る。戦士が買ったブレスの聖典は NPC 僧侶に効く。
   * ⭐ 「習得済み」は isSpellKnownTV (初期習得 DEFAULT_KNOWN_TV を含む) で判定する。
   *   ⛔ 保存値 dragonfighters.knownSpells だけを見ない —— #54 のスリープが「買える」に化ける。
   * ⭐ 所持中 (未読 1 冊以上) も買えない —— 読めば永続習得なので 2 冊目に使い道は無い。
   * ⛔ localStorage へ直接書かない。scrollStockTV を触って saveScrollStockTV ——
   *   learnScroll は画面が握る scrollStockTV を丸ごと保存し直すので、直接書いた分は次の「読む」で消える。
   * ⚠ 撤退 ?scrollshop=0 で棚の表示も購入も止まる (このページ内で完結・遷移はまたがない)。 */
  const SCROLL_SHELF_PRICE = 80;
  const SCROLL_CLASS_LABEL_TV = { mage: "魔法使い", cleric: "僧侶", elf: "エルフ" };
  function isScrollShopOnTV() {
    try { return new URLSearchParams(location.search).get("scrollshop") !== "0"; }
    catch (e) { return true; }
  }
  function scrollShelfIds() {
    if (!isScrollShopOnTV()) return [];
    return Object.keys(SCROLL_CATALOG_TV).filter(id => SCROLL_CATALOG_TV[id].rarity === "common");
  }
  // "known" = 習得済み / "stocked" = 未読を所持中 / "buyable" = 買える
  function scrollShelfState(id) {
    const c = SCROLL_CATALOG_TV[id];
    if (isSpellKnownTV(c.classKey, c.spellId)) return "known";
    if ((scrollStockTV[id] || 0) > 0) return "stocked";
    return "buyable";
  }
  function dfShopBuyScroll(id) {
    if (scrollShelfIds().indexOf(id) < 0) return { ok: false, reason: "noitem" };
    const st = scrollShelfState(id);
    if (st !== "buyable") return { ok: false, reason: st };
    if (dfGold() < SCROLL_SHELF_PRICE) return { ok: false, reason: "gold" };
    dfSetGold(dfGold() - SCROLL_SHELF_PRICE);
    scrollStockTV[id] = (scrollStockTV[id] || 0) + 1;
    saveScrollStockTV();
    return { ok: true, price: SCROLL_SHELF_PRICE, name: SCROLL_CATALOG_TV[id].name, gold: dfGold() };
  }
```

- ⚠ 判定の順は「習得済み → 所持中 → 金貨」。習得済みかつ所持中なら `"known"`(書庫でも `[習得済み]` と出る物)。

---

## 5. STEP2 — `renderShop` の末尾に「巻物」の群(`for (const kind of [...])` を抜けた直後、`if (!any)` の前)

- **購入タブだけ**に出す。⛔ 売却タブには出さない(§11)。
- 群の見出しは既存と同じ `.shopGroupHead` で「巻物」。行も既存の `.shopItem` / `.shopName` / `.shopSpec` を使い、**CSS は足さない**。
- 行の中身:
  - 名前 = `c.name`(例「聖典・ブレス」)。色は `getItemColorClass(c.name, c.rarity)`。
  - 説明(`.shopSpec`)= `習得呪文: <呪文名> 〔<職業>〕`。呪文名は `getSkillTV(c.spellId)` の `name`(書庫 `:7652` と同じ引き方・無ければ `spellId`)、職業は `SCROLL_CLASS_LABEL_TV`。
  - 右端:
    - `"buyable"` → `<button class="shopBtn buy">購入 80G</button>`(金貨が足りなければ `disabled`。武器防具と同じ)
    - `"known"` → `<span class="shopEquipped">習得済み</span>`
    - `"stocked"` → `<span class="shopEquipped">所持中</span>`
- 群を描いたら **`any = true`**(罠C)。
- 押したら `dfShopBuyScroll(id)` → `ok` なら `renderShop()` と、トースト
  `showScrollToastTV("📜 " + name + " を買った — マッチング画面の書庫で「読む」")`(`:7687` の既存関数。function 宣言なので巻き上げで届く)。
- ⭐ 行の並びは `SCROLL_CATALOG_TV` の並び(= 魔法使い 2 → 僧侶 1 → エルフ 1)。並べ替えない。

---

## 6. STEP3 — 検証ブリッジ(`__equipTV` の「STEP4: 武器防具屋」の群の末尾へ足すだけ)

```js
      // #77: 巻物の棚
      scrollShelf: () => scrollShelfIds().map(id => ({ id, state: scrollShelfState(id) })),
      shopBuyScroll: (id) => dfShopBuyScroll(id),
      scrollStock: () => Object.assign({}, scrollStockTV),
      learnScroll: (id) => learnScroll(id),
```

⛔ 既存のキーは 1 つも変えない(§2-5)。

---

## 7. 撤退スイッチ

- **`?scrollshop=0`** — 棚が出ない・`dfShopBuyScroll` は `noitem` を返す。武器防具屋は従来の 3 群だけ(空の文言も従来どおり)。
- ⚠ 判定位置 = `isScrollShopOnTV()` の 1 か所(`scrollShelfIds` の先頭)。**ページ遷移はまたがない** = `tavern.html?scrollshop=0` を直接開いて確かめる(`?heromark=0` と同じ流儀)。
  棚は `tavern.html` の中で完結するので sessionStorage へ写す必要は無い。

---

## 8. 受入条件 — `tools/verify_scroll_shelf.js`(新規・base ポート **10484**、変異は 10485〜)

`tavern.html` を puppeteer で開き、`localStorage` を仕込んでから読み込み直し、`__equipTV` と `#shopList` の DOM を**両方**見る。
⭐ 棚の中身は **ドライバ側でも `SCROLL_CATALOG_TV` 相当を `tavern.html` のソースから正規表現で引いて**、ブリッジの答えと突き合わせる(片方の写経にしない)。
サーバと起動の部分は `verify_lore_check.js` の写経でよい(ポートだけ変える)。

### §0 装置(母集団を先に確かめる)

- **(0a)** ソースから引いた common の巻物が **4 件**、全巻物が **17 件**。0 件なら exit 3(正規表現の空振り)。
- **(0b)** `__equipTV.scrollShelf` が関数として在る。`#shopList` に `.shopGroupHead` が 1 つ以上ある(店が描かれている)。
  ⭐ **これが無いと全 assert が空振りで永久緑になる。**

### §1 陳列

- **(1a)** 新しいセーブ(`localStorage` 空)で店を開くと「巻物」の見出しがあり、その下の行の名前 = ソースから引いた common 4 件の `name`(順も一致)。
- **(1b)** uncommon / rare の巻物の名前は `#shopList` に **1 件も無い**。
- **(1c)** 主人公を戦士・僧侶・魔法使い・エルフに変えても、並ぶ 4 件は同じ(職業に依らない)。
- **(1d)** 売却タブには「巻物」の見出しが**無い**。
- **(1e)** 武器防具をすべて所持させても(`ownedEquip` を仕込む)、購入タブに「買える品はもうありません。」が**出ない**(罠C)。

### §2 習得済み・所持中

- **(2a)** 新しいセーブでスリープの行は「習得済み」で、ボタンが無い。`shopBuyScroll("scroll-sleep")` = `{ok:false, reason:"known"}`(罠B)。
- **(2b)** 他の 3 件は新しいセーブで `buyable`。
- **(2c)** `tavern.html?magesleep=0` ではスリープが `buyable`(規則が ID でなく習得状態から出ている証拠)。
- **(2d)** バーニングハンズを 1 冊持たせると「所持中」・`reason:"stocked"`。読んだ後(`learnScroll`)は「習得済み」。

### §3 購入

- **(3a)** 金貨 200G でバーニングハンズを買う → `ok:true`・金貨 **120**・`scrollStock()["scroll-burning-hands"] === 1`・`localStorage` の `dragonfighters.scrollStock` にも 1。
- **(3b)** 金貨 79G では `reason:"gold"`、ボタンは `disabled`。金貨も所持品も変わらない。
- **(3c)** 罠A: ブレスの聖典を買う → 拾った体で持たせておいた別の巻物を `learnScroll` で読む → **ブレスの聖典がまだ 1 冊ある**(`scrollStock()` と `localStorage` の両方)。
- **(3d)** 買ったあと読み込み直すと、書庫(`renderScrollLibrary` の一覧)に買った巻物が出る。
  ⚠ 書庫は主人公の引き出しの中(`pmDrawerScrollList`)。開き方が重いなら、既定パネル `#scrollLibraryList` へ `renderScrollLibrary()` を描かせて名前を読むのでよい(判定関数は 1 本)。

### §4 恒等(非退行)

- **(4a)** 武器防具の購入と売却(`shopBuy` / `shopSell`)の戻り値と金貨の増減が、棚の追加前後で同じ(1 品ずつ試す)。
- **(4b)** `buyPrice` / `sellPrice` / `DF_PRICE_BY_RARITY`(ソース)が不変。

### §5 撤退

- **(5a)** `tavern.html?scrollshop=0` → 「巻物」の見出しが無い・`scrollShelf()` が空・`shopBuyScroll("scroll-burning-hands")` = `noitem`、金貨は減らない(罠D)。

### ⛔ 測らないこと

- 見出しや行の**見た目の寸法・色**(既存の CSS を使うだけ。目で見る)。
- トーストの文面と表示時間(目で動かす余地を残す)。
- 値段 80G の妥当性(遊びながら動かす。assert は定数 `SCROLL_SHELF_PRICE` をソースから読んで比べ、80 を焼かない)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `rawstock` | 購入が `localStorage` を直接書き、`scrollStockTV` を触らない(罠A) | (3a) or (3c) |
| `rawknown` | 習得済みを保存値 `dragonfighters.knownSpells` だけで判定(罠B) | (2a) |
| `noany` | 巻物の群で `any = true` を立てない(罠C) | (1e) |
| `leakbuy` | 撤退時も `dfShopBuyScroll` が通る(罠D) | (5a) |
| `allrarity` | 棚の絞り込みを外す(17 件並ぶ) | (1a) (1b) |
| `idlist` | 棚を ID 直書きにし、`scroll-sleep` を抜く(= 不採用の 3 種案) | (1a) (2c) |
| `nostockcap` | 所持中でも買える | (2d) |
| `herofilter` | 主人公の職業の巻物だけ並べる | (1c) |

⭐ 変異は**測っている場所に現れるか**まで設計する(#54 の教訓)。注入した行が実行されたことを変異ごとに 1 つ確かめる。

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指し: `verify_town_map.js`(店の入口)/ `verify_save_slots.js`(`scrollStock` を運ぶ)/ `driver_action_priority.js`(`__equipTV` の利用者)。
- **母集団**: `tavern.html` を読む本。dev-loop の作法どおり、項目 1 で着手前の色を控え、最後に影のツリーと交互に対比較する(#74〜#76 の方式)。
  #76 の凍結 TSV(160 腕)を着手前の色として流用できるかは、項目 1 で blob OID を追試して決める。
- ⚠ 基準値は実装窓が着手時に測る。**走らせて違ったら期待値を書き換える前に理由を突き止める。**

---

## 9. 実機/実感の確認(ここが本当の受入)

- ⚠ ローカルは http 起動が必須。
- iPhone 縦で武器防具屋を開き、「巻物」の群が**武器防具の下で読めるか**、スクロールしてボタンに届くか。
- 1 冊買って、マッチング画面の主人公の引き出し「📜 スクロール書庫」で読み、NPC 僧侶が居る編成で潜ってブレスが使われるか(ブレスの聖典の場合)。
- 80G が重すぎ/軽すぎないか(1〜2 回の潜行で 1 冊が目安)。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>武器防具屋に巻物の棚</b> — 初歩の呪文の巻物 4 種を 1 冊 80G で買えるように。買った巻物はマッチング画面の書庫で「読む」と覚えられる。"

---

## 11. やらないこと

- ⛔ 巻物の**売却**(売却タブに出さない)。
- ⛔ 透明化(B)・魔法の眼(C)の巻物と、その**開発用 1G 陳列**。B/C のチケットで足す。
  ⭐ B/C の足し方の目安: `scrollShelfIds` の絞り込みに `|| (DF_DEV_MAGIC_SHOP && c.devShelf)` を足し、値段は dev 時 1G。本チケットでは `devShelf` を作らない。
- ⛔ 看板を「武器防具道具屋」へ変える(会議のミサキ案)。`#shopSign` の文言と `town.html` 側の施設名がそろわなくなる。やるなら別チケットで両方。
- ⛔ `DF_PRICE_BY_RARITY` や武器防具の値段の見直し。
- ⛔ 拾う巻物の抽選(`index.html` `pickScrollId`)の重みの見直し。
- ⛔ `SCROLL_CATALOG` の二重定義の一本化。
- ✅ `実装依頼書/README.md` への行追加は承認時(2026-09-30)に起草窓が済ませた。足した行:

    | 77 | [2026-09-30_scroll-shelf.md](2026-09-30_scroll-shelf.md) | **承認済** | 0% | 武器防具屋に「巻物」の棚。common 4 種を 1 冊 80G・習得済み/所持中は買えない。⚠ 購入は `scrollStockTV` 経由(直接書くと次の「読む」で消える)/ 習得済みは `isSpellKnownTV`(保存値だけだとスリープが買える)。撤退 `?scrollshop=0` |

---

## 12. 実装結果

(実装窓が埋める)
