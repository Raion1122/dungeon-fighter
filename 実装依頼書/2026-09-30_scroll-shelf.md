# #77 武器防具屋に巻物の棚 — 初歩の呪文 4 種を 80G で買える

- **起草**: 2026-09-30(計画窓 = 起草窓) / **ステータス**: **✅ 完了**(2026-09-30 実装窓・承認 2026-09-30)。実装結果は §12(残 = §9 の実機確認)
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

### 12-0. 着手前の実測(HEAD f50412d・2026-09-30・項目1)

⛔ 本番ファイル(`tavern.html` / `index.html` / `js/*` / `town.html` / `audio.js`)は 1 バイトも変えていない。作業ツリー clean で開始。
`tavern.html` = 674,925 バイト・**CRLF 10,994 行 / LF 単独 0**(`py` でバイト計数・`git check-attr eol` = crlf)。

#### 崩れた主張(期待値は緩めず、予測を訂正する)

| ID | 依頼書の箇所 | 依頼書の主張 | 実測(HEAD f50412d) | 影響 |
|---|---|---|---|---|
| K1 | §2-4 表 3 行目 | `tools/sim_plaza_entry.js` = 「闇市のシム。`scrollStock` を読む」 | **読まない**。純 node のモンテカルロ(`tavern.html` も `index.html` も開かない・`scrollStock` の語 0 件。コメントに `index.html` の行番号を持つだけ) | 表から外す。非退行の母集団にも入らない |
| K2 | §2-4 表(漏れ) | 店と巻物に触れる本は 3 本 | 他に 2 本: **`verify_tavern_map.js`**(`DOM_ROOTS` に `shopScreen`。(6c) が `#shopScreen` の**静的タグ構造**を `DOM_BASE = 638b479` + `DOM_ADDED.shopScreen = []` と突き合わせる)/ **`driver_equip_compact_ios.js`**(`__equipTV.getSel` の利用者) | ⚠ 項目2: 棚の行は `renderShop` が JS で描く ⇒ 静的署名に入らず (6c) は動かない。**`#shopScreen` の中へ静的 HTML を 1 タグでも足すと (6c) が赤**(足すなら `DOM_ADDED` へ宣言)。§5 どおり CSS も静的タグも足さなければ無風 |
| K3 | §2-5 | 「STEP4: 武器防具屋」の群 = `:5237〜5243` | **`:5237〜5244`**(群の最後のキー `shopScreenVisible` が 5244)。`__equipTV` 全体 = `window.__equipTV = {` 5206 〜 `};` 5255(`try` 5205 / `catch` 5256)。次の群は 5245 のコメント `// 第3弾: 装備由来の…` | §6 の挿入点 = **5244 の直後・5245 の前** |
| K4 | §2-3 表「ボスの財宝」 | `index.html:17495〜` | `200 + Math.floor(Math.random() * 101)` は **`:17499`**(`const hoardGold`)。17495 はミミックのコメント行 | 数値(200〜300)は正しい。行番号だけ訂正 |

#### 主張どおりだったもの(行番号つき・HEAD f50412d)

| 主張 | 実測 |
|---|---|
| §2-1 #1 `DEFAULT_KNOWN_TV.mage = withInnateSleepListTV(...)` | `tavern.html:5379` ✓(`isMageSleepOnTV` 5369) |
| §2-1 #2 `shopPool` = `CHAR_EQUIP[shopHeroKey()]` | `function shopPool` `:6795`(`CHAR_EQUIP[shopHeroKey()]` は 6796)✓。`shopHeroKey()` 6794 = `selection.partyComposition[0] \|\| "warrior"` |
| §2-1 #3 NPC 仲間の呪文枠も同じゲート | `index.html:13658` `isSpellKnown` / `:14006`(`initAllySpellSlots` 13993 の中)/ `:20090`(`initLeaderSpellSlots` 20080 の中)✓ |
| §2-1 #4 書庫段 / 旧パネル | `tavern.html:9108〜9119`(`pmDrawerScrollList` 9115・`renderScrollLibrary({...})` 9119)✓ / `#scrollLibrarySection` `:3278`(`display:none`)✓ |
| §2-1 #5 行の形・値段・購入 | `dfShopBuyPrice` `:5021` / `dfShopBuy` `:6810` ✓ |
| §2-1 #6 表から導けば B/C は並ばない | `SCROLL_CATALOG_TV` `:5340`〜`};` 5358。**全 17 件・common 4 件**(5341 `scroll-sleep` / 5342 `scroll-burning-hands` / 5348 `tome-bless` / 5353 `grimoire-hail-of-thorns`)✓ 並び = 魔法使い 2 → 僧侶 1 → エルフ 1 ✓ |
| 罠A `scrollStockTV` / `learnScroll` | `let scrollStockTV` `:5428`(IIFE は 5431 で閉じる)/ `saveScrollStockTV` `:5432` / `learnScroll` `:5444` ✓ |
| 罠B `out[cls] = Array.from(...)` / `isSpellKnownTV` | `:5415` / `:5423` ✓(`let knownSpellsTV = loadKnownSpellsTV()` `:5419` = ページを開いた 1 回だけ読む。`learnScroll` が同じ配列へ push する) |
| 罠B 書庫の `[習得済み]` | 判定の呼び出し `const alreadyKnown = isSpellKnownTV(...)` = **`:7654`** ✓ / 表示の文言 `[習得済み]` は **`:7662`**(補足。7678 はコメント) |
| 罠C `renderShop` の `any` | `let any = false` `:6845` / `for (const kind of ["weapon", "armor", "shield"])` `:6846` / その閉じ `}` `:6896` / `if (!any)` **`:6897`**〜6902 ✓ |
| §2-3 `DF_PRICE_BY_RARITY` | `:5003` = `{ common: 40, uncommon: 120, rare: 320, special: 640, epic: 900, legendary: 1500 }` ✓ |
| §2-3 dev の 1G | `DF_DEV_MAGIC_SHOP` `:5020`(`!!window.__dfDevMode`)/ `:5021〜5022` は `item.gated` のときだけ 1G ✓。巻物の表に `gated` は無い ✓ |
| §2-3 宝箱・街道 | `index.html:23787` 10〜20 / `:23789` 30〜50 ✓ / `js/road-events.js:487` `clearGold: 80` ✓ |
| §2-3 計測コマンド 4 本 | 1 本目 = 4 行(5341/5342/5348/5353)/ 2 本目 = `:5003` / 3 本目 = 5021・5423・5428・5444・6810・6835 / 4 本目の末尾 3 つ = 10470・10471・**10483** ✓ |
| §2-4 `shopListText\|shopBuy\|openShop` を使う本 | `tools/*.js` で **0 件** ✓ |
| §2-5 `__equipTV` の利用者 | `driver_action_priority.js`(`setTab`)/ `driver_equip_compact_ios.js`(`getSel`)の 2 本 |
| §2-6 `index.html` 側 | `SCROLL_CATALOG` `:13569` / `let scrollStock` `:13665`(開いた時に localStorage から)/ `addScroll` `:13672` が `+1` → `saveScrollStock()` ✓ |
| §2-7 changelog | `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ✓ |
| §4 挿入点 | `dfShopSell` `:6821〜6831` ✓ → 空行 6832 → `let shopTab` `:6833` ✓(`renderShop` 6835) |
| §5 で使う関数 | すべて**トップレベルの function 宣言**(`<script>` 3441〜10992 は classic script・全体を包む IIFE は無い)⇒ **window に載る**(実測 `typeof window.X === "function"`): `getItemColorClass` `:4439` / `getSkillTV` `:5436` / `showScrollToastTV` `:7687` / `dfGold` `:6789` / `dfSetGold` `:6790`(`localStorage` の `dragonfighters.gold` へも書く)/ `saveScrollStockTV` `:5432` / `isSpellKnownTV` / `learnScroll` / `renderShop` / `renderScrollLibrary` / `openShop` |
| (補足)let/const は window に載らない | `scrollStockTV` / `SCROLL_CATALOG_TV` / `knownSpellsTV` / `DF_DEV_MAGIC_SHOP` / `selection` は `typeof window.X === "undefined"`。⭐ ただし `page.evaluate` の中から**素の名前**で読める(実測 `eval('scrollStockTV')` = `"{}"`) |
| §8 (2c) `?magesleep=0` | 実在・`tavern.html` のページ単位。素 = `knownSpellsTV.mage` が `["magic-missile","sleep","fire-bolt","arcane-shield"]`・`isSpellKnownTV("mage","sleep") === true` / `?magesleep=0` = スリープ抜き・**`false`**。他 3 件(burning-hands / bless / hail-of-thorns)は両方で `false` ✓ |
| §5 呪文名 | `getSkillTV` の `name`: スリープ / バーニングハンズ / ブレス / **ヘイル・オブ・ソーン**(中黒あり。巻物名「森の書・ヘイルオブソーン」と表記が違う = 表示はそのまま使う) |
| ポート | 10484〜10492 は `tools/` `scripts/` で **0 件** ✓ / **10484 で `tavern.html` を実際に goto して `ERR_UNSAFE_PORT` 無し・pageerror 0** ✓ |
| 撤退スイッチ名 | `scrollshop` / `SCROLL_SHELF` / `scrollShelf` / `dfShopBuyScroll` は `tavern.html` に 0 件(衝突なし) |

⭐ 仕様(ユーザー決定)に響く崩れは **無し**。K1〜K4 はどれも表・行番号の訂正で、§4〜§8 の設計はそのまま通る。

#### 実測で分かった、項目2・3 が最初に踏みそうなこと

- **新しいセーブ(ヘッドレスの素プロファイル)の所持金は 0G**。(3a) は `__equipTV.setGold(200)` を先に。
- 素の店 = 主人公 `warrior`(`partyComposition` の保存値なし)・購入タブに見出し **武器 / 防具 / 盾 の 3 つ・行 8**・空の文言なし。
- 主人公を変えるブリッジは無い(`setTab` は装備タブ)。(1c) は `localStorage` の `dragonfighters.partyComposition = ["mage"]` を仕込んで読み込み直す(`:5695` が先頭だけ採用)か、
  `page.evaluate` で `selection.partyComposition[0] = "mage"; renderShop();`(`selection` は `const` だが中身は書ける)。
- (1e) で `買える品はもうありません。` を出すには、主人公の職の **gated でない**全ティアを所持させる(gated は `DF_DEV_MAGIC_SHOP` が偽なら購入タブに出ない)。`__equipTV.addOwned(kind, tier, item)` がある。
- `.shopEquipped` の CSS は既存(`:1542`)。現状は売却タブの「装備中」だけが使っている。
- 既存の書庫の 〔〕 は `SCROLL_KIND_LABEL_TV`(`:5407` 巻物/聖典/森の書)。§4 の `SCROLL_CLASS_LABEL_TV`(魔法使い/僧侶/エルフ)は**別の表**を新設する設計 = 書庫と棚で 〔〕 の中身が違う(設計どおり。気になるなら §9 の実機で)。

#### 名指し golden 3 本の着手前の色(HEAD f50412d・2 回ずつ・逐次)

| 本 | 起動 | 1 回目 | 2 回目 | after76(d440334) |
|---|---|---|---|---|
| `tools/verify_town_map.js` | `node tools/verify_town_map.js`(既定 port 8897) | **85 / 85**・EXIT=0・52 秒 | **85 / 85**・EXIT=0・51 秒 | 85 / 85・exit 0 |
| `tools/verify_save_slots.js` | `node tools/verify_save_slots.js`(既定 port 8891) | **30/30 passed**・EXIT=0・5 秒 | **30/30 passed**・EXIT=0・5 秒 | 30/30・exit 0 |
| `tools/driver_action_priority.js` | `node tools/driver_action_priority.js`(既定 port 8843) | **PASSED 92 / FAILED 0 / PENDING 0**・EXIT=0・65 秒 | **92 / 0 / 0**・EXIT=0・65 秒 | 92/0/0・exit 0 |

- 3 本とも試遊サーバ 8765 と衝突しない(8765 は止めていない)。
- ⚠ `verify_town_map.js` は変異アンカー `(0-hidebehind)` を `tavern.html` の CSS に 1 か所持つ(`position: absolute; left: 18px; top: 18px; z-index: 13;`)。§5 は CSS を足さないので無風。

#### after76.tsv(#76 の凍結 160 腕)を着手前の色として流用できるか ⇒ **流用可**

- `git diff --stat d440334 f50412d` = **`実装依頼書/` の 2 ファイルだけ**(`2026-09-30_scroll-shelf.md` 新規 + `README.md` 1 行)。
- blob / tree OID が両コミットで**同一**: `tavern.html` e39546c4… / `index.html` f1c6251e… / `audio.js` 311aee29… / `town.html` 3db92db7… / `world.html` 65305dff… / `js/` tree 00e2267a… / `tools/` tree c3825e5f… / `assets/` tree 8bcc2bae…
- ⇒ 配信物も測定器も d440334 とバイト同一。after76.tsv(本番 d440334 で採取)は **HEAD f50412d の着手前の色そのもの**。本項目では全数走査はしていない(名指し 3 本の再走が after76 と件数一致 = 追試 3 本)。

#### #77 の母集団と after76 の覆い具合

- 引き方: `tools/*.js` 155 本のうち、コメントを除いたコードに `tavern.html` を含む本 = **52 本** + `tavern` の語だけ持つ本 **1 本**(`driver_bgm_title.js`)= **53 本**。
  (`town.html` / `world.html` / `title.html` を開くが `tavern` の語を持たない 5 本 = `driver_heromark_signplate` / `probe_paint_overlay` / `probe_town_mask` / `verify_road_events` / `verify_world_heromark` は酒場へ入らないので圏外。項目4 で気になれば 1 本ずつ実走で裏付ける)
- after76 の 160 腕(素 150 + `--negative` 10)のうち母集団の腕 = **56 腕**(素 52 + `--negative` 4 = `verify_aoe_coverage` / `verify_bolt_aim` / `verify_hold_person` / `verify_run_chronicle`)。合計 130.4 分(全 160 腕は 324.7 分)。
- **漏れ(素の腕が無い)= 1 本: `probe_s5s6_clear.js`**(#76 項目4 で `lore` スイッチを足した勝率の記録の道具。after76 に入っていない)⇒ 着手前の色が無い。項目4 で要るなら影のツリーと交互に対比較する。
- **`--negative` を持つが after76 に `--negative` 腕が無い母集団の本 = 15 本**: `probe_party_size` / `verify_eol_doorfix` / `verify_hold_pair` / `verify_member_identity` / `verify_mercenary_roster` / `verify_party_match_setup` / `verify_party_promises` / `verify_pen_narration` / `verify_pen_sample` / `verify_player_sheet` / `verify_pm_drawer_fit` / `verify_prep_retire` / `verify_quest_visibility` / `verify_spell_off` / `verify_town_exit`。
  ⭐ #75 の教訓どおり `--negative` の母集団は「**差分を含む関数の中のアンカー**」で選ぶ ⇒ 項目2 の差分が出てから選ぶ。
  着手前の先読み: 挿入点の近くの語(`STEP4: 武器防具屋` / `shopScreenVisible` / `買える品はもうありません` / `let shopTab` / `function renderShop` / `function dfShopSell` / `normalizeAcc` / `SHOP_KIND_LABEL` / `shopGroupHead` / `if (!any)`)を持つ本は `tools/*.js` に **0 本**、`changelogList` を読む本も **0 本** ⇒ 変異アンカーが #77 の差分と重なる本は今のところ見当たらない(項目4 で差分に対して選び直すこと)。
- after76 で母集団の素の腕が緑でないもの(= 既知の赤。#77 の帰属ではない): `driver_mapeditor` exit 1(176/179)/ `driver_monsters_umberhulk` exit 1(21/22・#76 で要観察のフレーク)/ `probe_party_size` exit 1(自力で終わらず 600 秒で打ち切る本)/ `sweep_recruit_balance` exit 1(装置 assert 4/4 崩れ)。`--negative` の 4 腕は exit 0(F>0 は変異の赤)。
- ⚠ `tavern.html` を `fs.readFileSync` で**起動時に凍結して配る**本(`driver_party_view_reopen` / `verify_party_match_setup` / `verify_pm_drawer_fit` / `verify_prep_retire` / `verify_aoe_coverage` / `verify_hold_pair` / `verify_hold_person` / `verify_party_promises` / `verify_run_chronicle` / `verify_spell_off` ほか)がある ⇒ **走査中に `tavern.html` を編集しない**。

#### 走行器(#76 の item5)の流用 — 項目4 へ

置き場 = `%TEMP%\claude\c--Users-PC-User-Desktop------------\f5deb037-8f94-4cba-becc-588ea310d3ff\scratchpad\item5\`。`sweep_76.py` は #75 の `sweep_75.py` と**パスと表示以外同一**(差分 = `ARMS` / `TSV` の名前・`[76]` の表示・`--rerun`)。

- `build_arms_76.py` → `build_arms_77.py`: 入力を `after75.tsv` から **`after76.tsv`**(`OLD` を f5deb037…\item5 へ)に、`new` を `verify_scroll_shelf.js`(素 / `--negative`)に、`select_neg76.json` を #77 版に差し替える。出力 `armlist_77.json`。
- `sweep_76.py` → `sweep_77.py`: `ARMS='armlist_77.json'` / `TSV='after77.tsv'` と表示の `[77]` だけ。`fp74.py` はそのまま import(同じフォルダへコピー)。`KILL_AFTER`(`probe_party_size` 600 秒)と `SAFETY` 5400 秒はそのまま。⛔ 並列にしない・`timeout` で包まない。
- `mkshadow_76.py` → `mkshadow_77.py`: `BASE = 'f50412d'`(= d440334 と配信物同一)・置き場を `shadow77/` へ。`git diff --name-only BASE HEAD -- index.html tavern.html …` で拾われるのは `tavern.html` だけのはず。`git check-attr eol` での変換(`tavern.html` は crlf)はそのまま使う。
- `pair_76.py` → `pair_77.py`: `SHAD` を `shadow77` へ。コメントの HEAD 表記だけ直す。
- `select_neg76.py` / `sel2_76.py`: `BASE` / `AFTER` と対象ファイルを差し替えれば「差分を含む関数の中のアンカー」の選別が回る。⚠ `sel2_76.py` は `files['index.html']` 決め打ちの `touched_fns_old/new` を持つ ⇒ `tavern.html` へ直す。

### 12-1. 本番実装(項目2・commit `d9b18d9`)

`tavern.html` だけ(+84 / −1)。`index.html` / `js/*` / `audio.js` / `town.html` は 0 バイト。行番号は `d9b18d9` 時点(= HEAD `b6bf304` でも同じ)。

| 部品 | 行 | 中身 |
|---|---|---|
| changelog | `:3329` | §10 の文面を先頭へ 1 行(既定 4 件維持で最古の「語りがペンの音になった」を 1 行落とした) |
| STEP3 検証ブリッジ | `:5245`〜`:5249` | `__equipTV` の「STEP4: 武器防具屋」群の末尾(`shopScreenVisible` `:5244` の直後)に `scrollShelf` / `shopBuyScroll` / `scrollStock`(コピーを返す)/ `learnScroll` の 4 キー |
| STEP1 棚の定数と関数 | `:6837`〜`:6873` | コメント `:6837` / `const SCROLL_SHELF_PRICE = 80` `:6847` / `SCROLL_CLASS_LABEL_TV` `:6848` / `isScrollShopOnTV` `:6849`(撤退の判定はここ 1 か所)/ `scrollShelfIds` `:6853`(表の `rarity === "common"` から導く)/ `scrollShelfState` `:6858`(`isSpellKnownTV` → `scrollStockTV` の順)/ `dfShopBuyScroll` `:6864`(`scrollStockTV` を +1 して `saveScrollStockTV`)。`let shopTab` は `:6875`・`renderShop` は `:6877` へずれた |
| STEP2 `renderShop` の巻物の群 | `:6939`〜`:6979` | 購入タブだけ。群を描いたら `any = true`(`:6943`)。行 = `shopName`(`getItemColorClass`)+ `shopSpec`「習得呪文: <呪文名> 〔<職>〕」+ ボタン「購入 80G」/「習得済み」/「所持中」。`if (!any)` は `:6980` |

- 撤退 **`?scrollshop=0`** = 棚の表示と購入の両方が止まる(ページ内で完結・遷移はまたがない)。
- `#shopScreen` に静的タグも CSS も足していない(K2 の `verify_tavern_map (6c)` は無風 = 43/43)。
- §4〜§6 からの逸脱(振る舞いはすべて仕様どおり・軽微 4 点):
  1. トーストの名前は `res.name`(= `SCROLL_CATALOG_TV[id].name`・同値)を使った。
  2. 呪文名は `getSkillTV(c.spellId)` が無いとき `c.spellId` へ落とす(`sk ? sk.name : c.spellId`。書庫の流儀・`tavern.html` は `?.` を 0 件で使っていない)。
  3. 〔〕 の職は `SCROLL_CLASS_LABEL_TV[c.classKey] || c.classKey`(表に無い職でも空にならない)。
  4. 購入後は `renderShop()` だけ呼び、`renderCharLoadout()` は呼ばない(店の画面の中で完結・書庫は次に開いたときに読む)。
- 名指し golden(素・項目2 の作業ツリー)= `verify_town_map` 85/85 / `verify_save_slots` 30/30 / `driver_action_priority` 92/0/0 + K2 の 2 本 `verify_tavern_map` 43/43 / `driver_equip_compact_ios` 31/31 = 着手前と同色同数。使い捨て検証 `scratchpad item2/check.js` = 18/18。

### 12-2. 新規受入(項目3・commit `b6bf304`)

`tools/verify_scroll_shelf.js`(新規・714 行・LF)。`tavern.html` だけを読む(`index.html` は開かない)。起動時に `tavern.html` を 1 回読んで凍結配信し、変異はメモリ上で差し替える。
§4 の比較のため `git show 54bb89a:tavern.html` を `/tavern.__base77.html` として配る(⇒ `git` の無い影のツリーでは exit 2)。

- 素 `node tools/verify_scroll_shelf.js`(port **10484**)= **19/19 PASSED FAILED 0 PENDING 0**・約 3 秒 × 3 回(項目3)+ 項目4 の走査 1 回(4.0 秒)。
- `--negative`(基準 10484 + 変異 **10485〜10492**)= **負のコントロール 8 / 8 が検出成功(赤 = 担当に完全一致)・空振り 0・漏れ 0・注入行はすべて実行**・約 23 秒(項目3 + 項目4 の走査 1 回)。
- assert = §8 の 18 本 + 装置 (0c)「全ページ起動 19/19・pageerror 0」= 19 本。
- exit: 0 = 期待どおり / 1 = FAIL・空振り・担当が絞れていない・注入行が未実行 / 2 = 環境不足(puppeteer・Chrome・`git`)/ 3 = 装置の腐敗(アンカーが 1 件でない・正規表現 0 件・`SCROLL_SHELF_PRICE` が無い)。

担当表の実測(§8 の表は最小集合だった = K5。ドライバは実測の集合との**完全一致**を要求する):

| 変異 | 注入する欠陥 | §8 の予想 | 実測の赤(= 担当) | 注入行の実行 |
|---|---|---|---|---|
| `rawstock` | 購入が `localStorage` を直接書く(罠A) | (3a) or (3c) | (3a)(3c) | 3 回 |
| `rawknown` | 習得済みを保存値だけで判定(罠B) | (2a) | (2a)(3b) | 94 回 |
| `noany` | 巻物の群で `any` を立てない(罠C) | (1e) | (1e) | 14 回 |
| `leakbuy` | 撤退時も購入が通る(罠D) | (5a) | (5a) | 1 回 |
| `allrarity` | 絞り込みを外す(17 件) | (1a)(1b) | (1a)(1b)(1c)(1e)(3b) | 476 回 |
| `idlist` | ID 直書き・スリープ抜き | (1a)(2c) | (1a)(1c)(1e)(2a)(2c) | 28 回 |
| `nostockcap` | 所持中でも買える | (2d) | (2d)(3a) | 6 回 |
| `herofilter` | 主人公の職の巻物だけ | (1c) | (1a)(1c)(1e)(2a)(2b)(2c)(2d)(3a)(3b)(3c)(3d)(素の主人公は戦士 = 棚が空) | 104 回 |

(4a)(4b) を赤くする変異は §8 に無い(恒等 = 設計どおり)。

### 12-3. 母集団の非退行(項目4)— 2026-09-30 / 本番 = HEAD `b6bf304`

⛔ 本番も `tools/` も 1 バイトも触っていない(走査・再走の前後で `git status --short` = 0 行・HEAD = `b6bf304`)。変えたのは本書 §12 と台帳の `| 77 |` 行だけ。
#77 の本番の差分 = `git diff --name-only f50412d HEAD` のうち配信物は `tavern.html` 1 本だけ(`index.html` / `audio.js` / `js/` / `assets/` / `town.html` / `world.html` / `title.html` は `git diff --quiet` で同一)。
成果物 = scratchpad `…/a27338a2-1df1-441b-af66-53fd39a89fd2/scratchpad/item4/`(道具は #76 の `item5/` からコピーして直したもの。`fp74.py` はバイト同一のコピー)。

#### (1) 腕の導出 = 64 腕(`item4/build_arms_77.py` → `armlist_77.json`)

| 枠 | 腕 | 導出 | 着手前の色 |
|---|---|---|---|
| 母集団 53 本の `after76.tsv` の腕 | 56(素 52 + `--negative` 4 = `aoe_coverage` / `bolt_aim` / `hold_person` / `run_chronicle`) | §12-0 の 53 本(`tavern.html` を含む 52 + `driver_bgm_title`)。同じ順 | `after76.tsv`(§12-0 で流用可と判定) |
| 漏れていた素 | 1 | `probe_s5s6_clear`(素 = 既定の S5 / S6 各 ON・OFF 1 走行 = 4 走行) | なし ⇒ f50412d の木で 1 回(下の (6)) |
| 新規受入 | 2 | `verify_scroll_shelf` 素 / `--negative` | なし(緑であること) |
| 圏外の裏付け | 5 | §12-0 で圏外にした 5 本(`driver_heromark_signplate` / `probe_paint_overlay` / `probe_town_mask` / `verify_road_events` / `verify_world_heromark`) | `after76.tsv` |

#### (2) `--negative` の選び直し(`item4/select_neg77.py` → `select_neg77.json`)

- #76 の `sel2_76.py` を `tavern.html` 用に直した(`BASE = f50412d` / `AFTER = HEAD`・`index.html` は差分が無いことを assert)。対象 = コードに `--negative` を持つ本 32 本のうち `tavern` の語を持つ 22 本(`verify_scroll_shelf` は正のコントロール)。
- 差分を含む関数(④ の範囲)= 旧版 3(`renderShop` / `dfShopSell`(STEP1 の挿入点)/ `dfRemoveOwnedTier`)・新版 7(+ `isScrollShopOnTV` / `scrollShelfIds` / `scrollShelfState` / `dfShopBuyScroll`)。
- 選ばれた本 = **2 本**: `verify_scroll_shelf`(正のコントロール・アンカー 15 件)と `verify_aoe_coverage`(1 件)。
  `verify_aoe_coverage` の 1 件(`"hold-person": [0, 0, 0, 1, …]` 旧 `:5273`)は、`__equipTV` の `try` ブロックが関数の外なのに「直前の関数宣言 `dfRemoveOwnedTier` `:5164` から次の宣言 `:5275` まで」を 1 つの関数に数えた**雑音**(バイトは不変)= K11。どちらにせよ `after76.tsv` に `--negative` の腕があるので再走した。
- ⇒ **新たに足す `--negative` の腕 = 0**(§12-0 の先読みどおり)。

#### (3) 走査と所要

- `item4/sweep_77.py`(直列・毎腕後に `df_*` の居残り Chrome を掃除 = 全 64 腕で 0)。2026-09-30 12:35:38 → 14:59:37(**143.6 分**・中断なし・`timeout` で包んでいない)。共通 61 腕の合計 132.0 分(`after76.tsv` の同じ腕 132.3 分)。打ち切りは `probe_party_size`(素)の 600 秒だけ(着手前と同じ)。
- 最長: `verify_bolt_aim` 2,239.2s / `verify_run_chronicle --negative` 1,520.1s / `verify_hold_pair` 904.7s / `probe_s5s6_clear` 667.4s / `probe_party_size` 600.4s(打ち切り)。

#### (4) 色の遷移(exit code が主・共通 61 腕)

| 遷移 | 件数 | 本 |
|---|---|---|
| 緑→緑 | 56 | 名指し golden 3 本(`verify_town_map` 85/85・`verify_save_slots` 30/30・`driver_action_priority` 92/0/0)と K2 の 2 本(`verify_tavern_map` 43/43・`driver_equip_compact_ios` 31/31)は着手前と同数・指紋一致。圏外 5 本も全部緑・指紋一致 |
| 赤→赤 | 4 | 既知の赤 = `driver_mapeditor` 176/179 / `driver_monsters_umberhulk` 21/22 / `probe_party_size` 13/20(600 秒打ち切り)/ `sweep_recruit_balance`(装置 4/4 崩れ)— **4 本とも着手前と同数・指紋一致** |
| **緑→赤** | **1** | `driver_monsters_chimera` 17/17 → 16/17(`(4) 回帰: 非flight ミノタウロス` の `entries=0`) |
| 赤→緑 | 0 | — |
| 新規 | 3 | 全部 exit 0(下の表) |

| 新規の腕 | exit | 総括 | 秒 |
|---|---|---|---|
| `verify_scroll_shelf`(素) | 0 | `19/19 PASSED FAILED 0 PENDING 0` | 4.0 |
| `verify_scroll_shelf --negative` | 0 | `負のコントロール 8 / 8 が検出成功 (赤 = 担当に完全一致)` / `--negative OK: 8 本すべて担当ラベルだけが赤くなりました (空振り 0・漏れ 0・注入行はすべて実行)` | 23.0 |
| `probe_s5s6_clear`(素) | 0 | `今回 4 走行 / 装置 assert 崩れ 0 件`(S5 ON・OFF とも clear / S6 ON・OFF とも defeat) | 667.4 |

`--negative` 4 腕(`aoe_coverage` 270/20・`bolt_aim` 165/32・`hold_person` 235/21・`run_chronicle` 560/24)はすべて exit 0。

#### (5) 2 経路の突き合わせ(`item4/cmp_77.py -v`)

比べられる腕 57(共通 61 − 判定行 0 行の本 − 指紋が走行ごとに動く `driver_monsters_griffon`)。経路① 55/57・経路② 55/57 が一致。差 2 本:

- `driver_monsters_chimera`(素)= 値差(`(4)` の PASS → FAIL だけ・id の並びと本文は同じ)= 上の緑→赤。
- `verify_run_chronicle --negative` = exit 0 のまま、変異の巻き添えの赤が 550/34 → **560/24**。#76 の影との対(#76 依頼書 §12-5 (7))では本番・影とも 560/24 = `after76.tsv` の走査の方が外れ値。変異が担当ラベルを赤くする判定(`--negative OK: 8 本すべて`)は両方同じ。

#### (6) 緑→赤の帰属 + 着手前の色の無い腕

影のツリー `item4/shadow77/` = 作業ツリーの実体コピー(`.git` / `source_images` なし・`tools/` 193 = 193 を実体コピー)に、`tavern.html` だけ `f50412d` の blob を `git check-attr eol` = crlf で戻したもの(674,925 バイト = §12-0 の実測と一致。他の配信物は作業ツリーと同一)。

| 本 | 本番(交互の対 8 組) | 影 | Fisher(両側) | 判定 |
|---|---|---|---|---|
| `driver_monsters_chimera` | 緑 6/8(赤 2 = `(4)` entries=0 × 2) | 緑 6/8(赤 2 = `(4)` entries=0 / `(3) fire_breath` maxHit=1) | **1.00**(走査と `after76` を足して 6/9 vs 7/9 も 1.00) | **揺れ**。構造でも帰属の経路なし: `(4)` は `pageA` = `index.html?autoplay=20&magesleep=0`(ドライバ `:153`〜`:231`)の上で、酒場を開く前に測る。`index.html` + `audio.js` + `js/` + `assets/` は `f50412d` と HEAD で同一・ドライバも無改変。赤の内訳 `entries=0` = 観測 0 件 = フレークの指紋 |

- `probe_s5s6_clear`(素)の着手前の色: 影には `.git` が無く、この本は起動時に `git diff HEAD` を引くので影では exit 2 になる(K12)⇒ **`f50412d` のローカル clone**(`item4/clone77/`・HEAD `f50412d`・clean・配信物 6 本が `shadow77` と sha256 一致)で 1 回走らせた ⇒ **exit 0・装置 assert 崩れ 0 件**(S5 ON・OFF とも clear / S6 ON・OFF とも defeat・647.9 秒)= 本番(HEAD `b6bf304`)の走査と**同形**(4 走行とも装置 assert 通過・決着の形も同じ)。勝率そのものは 1 組では比べない(記録の道具で、#76 §12-4 の 10 組が基準)。
- `verify_scroll_shelf` は起動時に `git show 54bb89a:tavern.html` を読むので影では走らない(走らせる必要も無い = #77 の前には棚が無い)。

#### (7) 試遊サーバ 8765

走査の前に LISTEN を実測 = 1 系統: `cmd.exe`(pid 18844)→ `py -m http.server 8765`(38736)→ `python.exe`(**37916**)。起動コマンドは `ゲームを起動.vbs` と同じ `cmd /c cd /d "<リポ直下>" && (py -m http.server 8765 2>nul || python -m http.server 8765 2>nul)`・配信していた `tavern.html` は 679,701 バイト = 作業ツリーと一致。cmd → py → python の順に止めた(LISTEN 0 を確認)。走査と再走をすべて終えてから、同じコマンドを `Invoke-CimMethod Win32_Process Create`(非表示・デタッチ)で起動(ReturnValue 0・cmd の pid 36384)。`Get-NetTCPConnection` = **`[::]:8765 LISTEN 37576`**(`python.exe -m http.server 8765`・親 34680)・`http://localhost:8765/title.html` = **200**・配信の `tavern.html` = 679,701 バイト = 作業ツリー。居残りの Chrome(`df_*`)= **0**。

#### (8) ⚠ 崩れた主張(項目4 = 4 件)

- **K11** 「差分を含む関数 = `renderShop` / `__equipTV` のリテラル / `changelogList` / 新規 4 関数」⇒ 選別器 ④ は `__equipTV`(関数の外の `try` ブロック)を直前の関数 `dfRemoveOwnedTier` の範囲に数え、同じ範囲にある無関係な表のアンカー(`verify_aoe_coverage` の `"hold-person": [0, 0, 0, 1, …]`)を**雑音**で選ぶ。#76 の「最初の関数より前(CSS)」の直しと同じ型の穴が「関数と関数のあいだのトップレベル」にも残っていた。今回は `after76` に腕がある本だったので実害なし。
- **K12** 「`probe_s5s6_clear` の素は影のツリー側でも走らせる」⇒ 影には `.git` が無く、この本は起動時の `git diff HEAD` で本番の差分を確かめるので影では exit 2。⇒ `f50412d` のローカル clone を着手前の木にした(配信物は影とバイト同一)。
- **K13** 「既知の赤 = `after76.tsv` で緑でない 4 本」⇒ 既知の**揺れ**はそれより広い。`driver_monsters_chimera` は `after76` で緑だったが、`(4)` の `entries=0`(観測 0 件)で本番・影とも 8 組中 2 回ずつ赤くなる(#69 以来の両方向フレークの一覧には居る)。「`after76` で緑 = 安定」ではない。
- **K14** 「`fp74.py` は母集団の書式を拾う」⇒ `verify_scroll_shelf` の判定行 `  ✓ (0a) …`(角括弧の接頭辞なし)は `MARK_RE`(`[driver] ✓ …` 型)にも `LINE_RE` にも掛からず、**19 行中 0 行**しか読めない(TSV の P/F = 0/0・経路①② の指紋は空)。この本の 2 経路の比較は盲目で、判定は exit code と総括行だけで行った。次に母集団へ入れるときは `fp74.py` に `^\s{1,6}[✓✗]\s` の型を足すか、そのことを前提に読む。

#### ⇒ 判定

**64 腕(`after76.tsv` の母集団 56 + 漏れの素 1 + 新規受入 2 + 圏外の裏付け 5)で、#77 に帰属すると言える緑→赤は 0。** 緑→赤 1 本(`driver_monsters_chimera`)は影との交互の対で 6/8 vs 6/8(p = 1.00)・赤い assert は `index.html` だけのページの上 = 帰属の経路が構造的に無い。
既知の赤 4 本は着手前と同数・指紋一致。指紋を比べられる 57 腕で経路①② とも 55 一致し、差 2 本は緑→赤 1 と `run_chronicle --negative` の巻き添えの揺れで説明が付く。新規受入は素 19/19・`--negative` 8/8。

### 12-4. まとめ

**何を実装したか(プレイヤー向け)**

1. 武器防具屋の購入タブの武器・防具・盾の下に「巻物」の棚。よくある(common)巻物 4 種 = 巻物・スリープ / 巻物・バーニングハンズ / 聖典・ブレス / 森の書・ヘイルオブソーンを 1 冊 **80G**。主人公の職業に関係なく全部並ぶ(覚えた呪文は NPC 仲間にも効く)。
2. もう覚えている呪文は「習得済み」、未読を持っていれば「所持中」で買えない(魔法使いのスリープは最初から覚えているので「習得済み」)。
3. 買った巻物は拾った巻物と同じ所持品に入り、マッチング画面の書庫で「読む」と覚える。売却タブには出ない。
4. 撤退 **`?scrollshop=0`**。

**コミット**

| 項目 | コミット | 中身 |
|---|---|---|
| 起草 | `f50412d` | 依頼書 + 台帳の行 |
| 1 | `54bb89a` | 着手前の実測(§12-0)・崩れ K1〜K4・名指し golden 3 本の色・`after76.tsv` 流用可 |
| 2 | `d9b18d9` | 本番(`tavern.html` +84 / −1 = 棚の関数 + `renderShop` + 検証ブリッジ + changelog) |
| 3 | `b6bf304` | 新規受入 `tools/verify_scroll_shelf.js`(base 10484 / 変異 10485〜10492) |
| 4 | 本節を書いたコミット | 母集団の非退行(§12-3)+ §12-1〜§12-4 + 台帳 |

**受入の数字**

- `tools/verify_scroll_shelf.js` 素 = **19/19 PASSED FAILED 0 PENDING 0**(項目3 で 3 回 + 項目4 の走査 1 回・約 3〜4 秒)/ `--negative` = **8 / 8 検出・担当に完全一致・空振り 0・漏れ 0**(項目3 + 項目4・約 23 秒)。
- 名指し golden 3 本 + K2 の 2 本 = 項目1・項目2・項目4 のどれでも着手前と同色同数。
- 母集団の非退行 = **64 腕**で **#77 に帰属すると言える緑→赤 0**(§12-3)。

**崩れた主張 = 通算 14 件**(一覧の場所: §12-0 = K1〜K4 / 項目3 = K5〜K10(下)/ §12-3 (8) = K11〜K14)

| ID | 主張 → 実測(一行) | 出典 |
|---|---|---|
| K1 | `sim_plaza_entry.js` は `scrollStock` を読む → 純 node のモンテカルロ。表と母集団から外した | §12-0 |
| K2 | 店と巻物に触れる本は 3 本 → 他に `verify_tavern_map`(`#shopScreen` の静的署名)/ `driver_equip_compact_ios`(`__equipTV.getSel`) | §12-0 |
| K3 | STEP4 群 = `:5237〜5243` → `:5237〜5244` | §12-0 |
| K4 | ボスの財宝 = `index.html:17495` → `:17499`(値 200〜300 は正しい) | §12-0 |
| K5 | §8 の負のコントロール表「赤くなるべき節」→ 最小集合だった。実走の担当は 7 本で広い(§12-2 の表)。ドライバは実測の集合との完全一致を要求 | 項目3 |
| K6 | §8 (0b) で装置は足りる → 構文崩れの偽検出を見分けられない ⇒ (0c)「全ページ起動 19/19・pageerror 0」を追加(19 本目) | 項目3 |
| K7 | §8 (4a)「棚の追加前後で同じ」→ 同じビルドの `?scrollshop=0` だけでは「前」にならない ⇒ HEAD~1(`54bb89a`)の本番を `/tavern.__base77.html` として配り、素 = `?scrollshop=0` = HEAD~1 の 3 腕で比較(戦士・魔法使い・25 品・買えた 19・売れた 19)。(4b) もソース範囲の同一性 + 全職 71 品の値段を 3 腕で比較 | 項目3 |
| K8 | 依頼書が明示していない前提 → assert に追加(永久緑防止): (1c) `shopHeroKey()` が実際に変わった / (1d) `shopTab === "sell"` / (2c) `?magesleep=0` で `isSpellKnownTV("mage","sleep") === false` / (3b) 金貨ちょうど P で押せる(対照)/ (5a) 見出し 1 つ以上 + `isScrollShopOnTV() === false` / (2a) 200G 持たせて買う | 項目3 |
| K9 | (3d) は書庫の引き出しを開く → 依頼書の許可どおり既定パネル `#scrollLibraryList` へ `renderScrollLibrary()` を描かせ、名前を前方一致で読む(`.sName` は「名前 ×n」) | 項目3 |
| K10 | (0a) の 17 / 4 と (1b) の 13 件は固定値 → B/C が uncommon / rare の巻物を足すと腐る(下の申し送り) | 項目3 |
| K11 | 差分を含む関数の選別 → 関数と関数のあいだのトップレベル(`__equipTV`)を直前の関数に数え、雑音 1 本 | §12-3 (8) |
| K12 | `probe_s5s6_clear` を影で走らせる → `git diff HEAD` を引くので影では exit 2 ⇒ `f50412d` の clone | §12-3 (8) |
| K13 | 既知の赤 = `after76` で緑でない 4 本 → 揺れはもっと広い(`driver_monsters_chimera (4)` entries=0) | §12-3 (8) |
| K14 | `fp74.py` は母集団の書式を拾う → `verify_scroll_shelf` の `✓ (0a)` 型は 19 行中 0 行 | §12-3 (8) |

⭐ 仕様(ユーザー決定)に響く崩れは通算でも **無し**。

**B / C チケット(透明化・魔法の眼)への申し送り**

- ⚠ **K10 の腐り方**: `verify_scroll_shelf` の (0a) は「全 17 件・common 4 件」、(1b) は「uncommon / rare 13 件が棚に無い」を固定値で持つ。B/C が `SCROLL_CATALOG_TV` に巻物を足すと、棚は正しいまま (0a)(1b) が赤くなる(装置の腐敗)。
  直し方 = B/C のチケットで期待件数を書き換える、または固定値をやめて「ソースから引いた全件 = ページの表と全件一致 + common = 4」へ言い直す(後者なら二度と腐らない。(1b) の対象はソースから引いた `rarity !== "common"` の件数で数える)。
  ⛔ `--update-golden` 的に「今の件数」へ書き換えるだけにしない(common が増えたのか uncommon が増えたのかを見分けられなくなる)。
- §11 の目安: 開発用の 1G 陳列は `scrollShelfIds` の絞り込みに `|| (DF_DEV_MAGIC_SHOP && c.devShelf)` を足し、値段は dev 時 1G(`dfShopBuyScroll` の `SCROLL_SHELF_PRICE` を品ごとの値段へ)。本チケットでは `devShelf` を作っていない ⇒ `verify_scroll_shelf` の変異 `allrarity` / `idlist` のアンカー(`.filter(id => SCROLL_CATALOG_TV[id].rarity === "common")` / `return Object.keys(SCROLL_CATALOG_TV).filter(…)`)を書き換えると、この本は exit 3(アンカーが 1 件でない)で止まる ⇒ B/C で変異アンカーも一緒に直す。
- 棚の行名は `SCROLL_CATALOG_TV[id].name` のまま出る。B/C の巻物名に「巻物」を含めても見出しの判定(textContent 完全一致)は壊れない。
- **次の新規ドライバの base ポート = 10493**(10484〜10492 は `verify_scroll_shelf` が使用)。

**残**

- §9 の実機/実感の確認(iPhone 縦で棚が読めるか・1 冊買って書庫で読み、NPC 僧侶の編成でブレスが使われるか・80G の重さ)は**未**(ユーザーの作業)。
