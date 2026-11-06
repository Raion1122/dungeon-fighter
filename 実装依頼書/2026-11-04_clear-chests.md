# #108 クリア時の 3 つの宝箱 + 伝承の品(行き先ごとの専用品・青/紫の色分け)

- **起草**: 2026-11-04(計画窓) / **ステータス**: **承認済**(2026-11-04 ユーザー承認)
- **着手**: ▶ **保留解除 2026-11-06** — #107 が `e5cfe5d` で着地(origin と同期済)。§2-10 で行番号を測り直してから入る(当初の保留理由: #107 が `showResult` まわりを触っていた)
- **元の会議**: [dev-meetings/2026-11-04_hidden-and-loot.md](../dev-meetings/2026-11-04_hidden-and-loot.md)(第 1 段 → 決裁 → 第 2 段の開発計画書)
- **前のチケットとの関係**: #87 [2026-10-06_corner-check-no-road-chests.md](完了/) が道中の宝箱を既定で廃止した。本件はその「開ける楽しみ」をクリア時へ集める。#87 の `ROAD_CHEST_ON` には触らない
- **触るファイル**: `index.html` / `tavern.html` / `js/changelog.js`(追記ツール経由)/ `tools/verify_clear_chests.js`(新規)/ 既存 golden の言い直しが要れば最小限
- ⏸ **着手は #107(霜の巨人の砦)の着地後**。#107 の実装窓が `index.html` を触っており(起草時点で未 push 3 本 `6c2680d` / `0fe80e2` / `5cfdf10`)、`ROAD_CHEST_GOLD` に frost-hold 行を足すなど `showResult` のまわりも触っている。
- ⛔ **触らないファイル**: `tools/verify_frost_hold.js`(#107 の未追跡ファイル)・`実装依頼書/2026-11-04_frost-hold.md`。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

今のクリア画面(`showResult` の勝利の枝)は「VICTORY」の下に金貨・XP・新装備を `<br>` で並べる文字だけ。
道中の宝箱は #87 で既定廃止済みなので、**宝箱を開ける楽しみが 1 つも残っていない**。
また、そのクエストでしか手に入らない品は森のクロークオブディスプレイスメント 1 つだけで、
クリア時のマジックアイテム抽選は**全クエスト共通 1%・共通プール**。

**ユーザー決定(2026-11-04)**:

- クリアしたら**宝箱 3 つの中から 1 つを選ぶ**演出にする(会議の候補①「カードめくり」をユーザーが作り替えた)
- 中身は**閉じたまま選ぶ(運試し)**。「中身を見て選ぶ」「半分だけ見える」は不採用
- そのクエスト専用の低確率の品(**伝承の品**)を**宝箱の中身に混ぜる**。「宝箱と別に出す」「今回は宝箱だけ」は不採用
- 「低確率のレアアイテムは**色違い**にしてね。**青とか紫とか**」
- 道中の宝箱は「いったん廃止でいい」→ **#87 で既に既定廃止済み**(§2-1)。今回は触らない
- 不採用 / 次回送り: 砦の守護者の復活・本筋外の隠し要素・依頼札の達成印(§11)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ 行番号は 2026-11-04 の HEAD `5cfdf10` 時点。**#107 の着地で必ずズレる**ので、項目 1 で測り直すこと。
▶ **2026-11-06 項目 1 で `5211ab0` に測り直し済み**。§2-1 の表は新しい行番号へ書き換えた(括弧内は起草時)。§2-2〜§2-8 の本文中の行番号の新旧対応は **§12-1 (1)** を見ること。

### 2-1. 今のクリア報酬の流れ(`index.html`)

| 行 | 何 |
|---|---|
| 3724-3728 | `ROAD_CHEST_ON`(#87)。玄室宝箱・隠し宝箱・廃坑 n1 の寄り道を止めている。残るのは森の鍵束の宝箱と竜の巣の財宝だけ |
| 3739-3762(起草時 3739-3756)| `ROAD_CHEST_GOLD`(消えた宝箱 1 個 = 25G をクリア金貨へ・frost-hold の行 3752 は #107)・`roadChestBonusGold()` 3754 |
| 26308(26304)| `MAGIC_DROP_CLEAR_CHANCE = 0.01` |
| 26317(26313)| `findAccessoryRecipient(accId)` = 空き枠のあるリーダー → 仲間(classKey 無しの一時ユニットは除外)|
| 26370(26366)| `markGatedOwned(name)` |
| 26381-26469(26377-26465)| `rollMagicItemDrop()`(gated アクセの絞り 26405・pick 26410)|
| 44019(44014)| `function showResult(win)` |
| 44048(44042)| `earnedGold = coins + clearGold + roadChestGold` |
| 44053-44055(44048-44050)| `clearChance` → `clearMagicItem = (Math.random() < clearChance) ? rollMagicItemDrop() : null` |
| 44069-44093(44065-44087)| 金貨・装備・XP・アクセサリーを **同期的に** localStorage へ保存 |
| 44103-44113(44098-44108)| `reward = { gold, totalGold, newWeapon, newArmor, earnedXp, ... }` |
| 44115-44139(44109-44134)| `resultReward.innerHTML` を組み立てる(`✨ 宝物発見` の行は 44124)|
| 44167(44162)| `resultOverlayEl.classList.add("show")` |
| 44170-44183(44165-44178)| `sessionStorage "dragonfighters.lastResult"` に `{ scenarioId, ..., reward, chronicle, roster }` |
| 44185-44189(44180-44185)| `resultBtn` の click → `dfReturnPage()` へ即遷移(竜の巣はエンディングへ)|

### 2-2. ⚠⚠⚠ 罠 A — `rollMagicItemDrop()` は**引いた瞬間に付与して保存まで済ませる**

```js
if (pick.kind === "weapon") {
  const gotName = leaderWeapons[pick.idx].name;
  markGatedOwned(gotName);                  // ← 所持を localStorage へ
  if (leaderClassKey === "warrior") {
    currentWeaponIndex = pick.idx;          // ← 装備を差し替え
    ... localStorage.setItem("dragonfighters.equipWeaponIdx", ...)
```

アクセサリーの枝も `currentAccessoryIndices[slot] = idx` → `savePersistentAccessoryStock()` まで行く。
⇒ 計画書の「画面を出す前に 3 つとも抽選を済ませる」を**この関数のまま**書くと、
**開けなかった箱のマジックアイテムまで手に入る**。

**だからこう決める**: 抽選(決めるだけ)と付与を分ける。

- `rollMagicItemDrop()` の候補の組み立て部分を `buildMagicItemPool()` として切り出し、
  **箱の中身を決めるときは「どの品か」を決めるだけ**(副作用なし)。
- **付与は開けた 1 箱だけ**、`grantMagicItemPick(pick)`(今の `rollMagicItemDrop` の後半)で行う。
- 既存の `rollMagicItemDrop()` は `grantMagicItemPick(choose(buildMagicItemPool()))` と同じ振る舞いのまま残す
  (宝箱 `pickChestLoot` 経路と `?clearchest=0` が使う)。
- ⭐ §8 の負のコントロール `grantall`(3 箱とも付与する)で再現させること。

### 2-3. ⚠⚠ 罠 B — 既存のドライバ 9 本が**乱数を固定**して、クリア時の金貨と `resultReward` を握っている

`Math.random` を差し替えたうえで `showResult` / `lastResult` を読む本(`grep -lE "Math\.random\s*=" tools/*.js | xargs grep -lE "showResult|lastResult"`):

`driver_mapdef_step2` / `driver_sce1_events` / `verify_corner_check` / `verify_kobold_warren` / `verify_lore_check` /
`verify_road_ambush` / `verify_road_boon` / `verify_road_events` / `verify_witch_hut`

- `verify_corner_check` は `lastResult.reward.gold` を**完全一致**で見ている(coins = 7 + 補填)。
- `driver_sce1_events:1399` と `verify_run_chronicle:1301` は `resultReward.innerHTML` を読む
  (run_chronicle は「行が増えたか」だけ。sce1 はエピローグの文)。

**だからこう決める**:

1. **宝箱の金貨は `reward.gold` に混ぜない。** `lastResult` に別の欄 `chest` を足す(§5-3)。
2. **宝箱の画面は `#resultReward` の外**の新しい要素 `#resultChests` に描く。`resultReward.innerHTML` は 1 バイトも変えない
   (`?clearchest=0` と同じ文字列)。
3. **乱数の消費の順番を変えない。** 44049 の `Math.random() < clearChance` の 1 回は、宝箱が有効なときも**呼んで捨てる**
   (結果は使わない)。宝箱の抽選は `lastResult` を書いた**後**(44178 の後)で行う。
   ⇒ `showResult` が `lastResult` を書き終えるまでの乱数の列は今と同じになる。
4. ⭐ §8 の負のコントロール `goldmix`(宝箱の金貨を `reward.gold` に足す)で (2a) が赤くなること。

### 2-4. ⚠ 罠 C — アクセサリーは「**装備していること**」が所持の記録

`recomputeAccessoryStock()`(15053)は、全員の**装備枠**を数えて在庫を作る。
`savePersistentAccessoryStock()`(18980)も装備枠のスナップショットを書く。
⇒ 「持ち帰るだけ」の受け皿は無い。**伝承の品は空き枠のある誰かに着けて渡す**(`findAccessoryRecipient` を使う)。
空き枠が誰にも無い、またはもう全員が持っているときは**金貨へ換える**(森の外套の 5 個目 = 50G と同じ扱い。18923)。

### 2-5. ⚠ 罠 D — 伝承の品を `gated` にすると共通プールへ流れる

`rollMagicItemDrop()` の候補は `acc.gated` だけを見る(26398 付近)。店とラダーからの除外も gated を見る(26306・26731)。
⇒ 伝承の品は `gated: true` + **`relic: "<scenarioId>"`** を持たせ、`buildMagicItemPool()` で
`if (!acc || !acc.gated || acc.relic) continue;` と**伝承の品だけ共通プールから外す**。
gated のままなので店・ラダーからは今の仕組みで外れる(⚠ 項目 1 で店・ラダーの除外が gated だけで足りるか測る)。
⭐ §8 の負のコントロール `relicleak`(relic の除外を外す)で、共通プールに伝承の品が入って赤。

### 2-6. 隠し要素を倒したかの判定

`maybeGrantScrollDrop`(15255)の隠し要素の判定は `def.multiHead || stoneGolem || shadowBeast || caelum || mimic || def.isNpcSpirit`。
**ゴブリン戦車(`goblinChariot`)が入っていない**(実測)。
⇒ `maybeGrantScrollDrop` は触らずに、新しい一覧 `HIDDEN_FOE_TYPES` を持ち、撃破フック(19075-19079 付近)で
`runHiddenFoeSlain = true` を立てる。一覧 = `goblinChariot` / `shadowBeast` / `stoneGolem` / `caelum` / `mimic` + `def.multiHead`。

### 2-7. 色はもうある(青 = rare / 紫 = epic)

- `index.html:22-26` `--rarity-common/uncommon/rare/epic/legendary`、`index.html:2653-2657` `.rarity-*` のクラス。
  rare = 青 #5a9fdd(本文は #2b5d8e)、epic = 紫 #b366d9(本文は #7a3ba0)。
- 使っているのは道具袋の武器と防具の 2 か所だけ(19783 / 19786)。**tavern.html には色の定義が無い**。
- ⇒ 宝箱の中身の色: 金貨袋・巻物 = common、**マジックアイテム = rare(青)**、**伝承の品 = epic(紫)**。
  tavern 側には `--rarity-rare` / `--rarity-epic` と `.rarity-rare` / `.rarity-epic` だけ写し、
  所持アクセサリーの名前に伝承の品 = 紫・gated = 青を付ける。

### 2-8. 宝箱の絵と巻物の口

- `assets/chest.png` / `assets/chest_open.png` は既にある ⇒ **新しい絵は要らない**。
- 巻物: `addScroll(id)`(15225)が `saveScrollStock()` まで自分で済ませる。`pickScrollId(weights)`(15241)で希少度の重みを渡せる。
  ⚠ `pickScrollId` も `Math.random` を使う。宝箱の抽選は罠 B のとおり `lastResult` を書いた後に置く。

### 2-9. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **鳴る**。
書けるプレイヤー向けの要約は実在する(§10)。

### 2-10. 再測定コマンド

```bash
grep -nE "function showResult|MAGIC_DROP_CLEAR_CHANCE =|function rollMagicItemDrop|function findAccessoryRecipient|function markGatedOwned|function addScroll|function pickScrollId|function maybeGrantScrollDrop|dragonfighters.lastResult" index.html
grep -nE "rarity-(rare|epic)" index.html tavern.html
grep -lE "Math\.random\s*=" tools/*.js | xargs grep -lE "showResult|lastResult"
grep -nE "resultReward|resultBtn" tools/*.js
```

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 伝承の品 11 品を `accessories[]` へ + 既存の `gauntlets-ogre-power` に `relic: "frost-hold"` / `questRelicFor` / `buildMagicItemPool` と `grantMagicItemPick` への切り出し / `HIDDEN_FOE_TYPES` と `runHiddenFoeSlain` / `showResult` に宝箱 3 つ(`#resultChests`)/ 撤退 `?clearchest=0` |
| `tavern.html` | `ACCESSORIES_TV` に伝承の品 11 行 + 既存のガントレットの行に `relic`(id / name / gated / rarity / relic を index と完全一致)/ 色のクラス 2 つ / 所持アクセサリーの名前の色 |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行 |
| `tools/verify_clear_chests.js` | 新規の受入 |

⛔ `tools/verify_frost_hold.js` と #107 の依頼書は開かない。

---

## 4. 項目 1 — 着手前の実測 + 伝承の品の表

### 4-1. 測り直す

§2-10 のコマンドを #107 着地後の HEAD で回し、§2-1 の表を更新して §12-1 に残す。
加えて、店・ラダー・酒場の装備候補が `gated` だけで伝承の品を外せるか(罠 D の後半)を測る。

### 4-2. 伝承の品(第 1 弾)

方針(会議の合意):

- 5e SRD 5.1 の実在のマジックアイテム・**カタカナの音写**(メモリ「実在マジックアイテムはカタカナ名」)
- **効果は既存の配線のキーだけ**: `avoidAll` / `avoidArrow` / `freeAction` / `fireResist` / `hpBonus` / `undeadDR` / `skillBonus` / `dmgBonus` / `acBonus` / `saveBonus`(14839-14884 の既存アクセが使っているもの。★ 起草時 14836-14880 → §12-1 (5) で訂正)。**新しい効果の配線は 0 本**
- フレーバーの文は 1 品ずつ、**その行き先の依頼人・敵**に結び付けて書く(ガイウスの譲れない点)
- 対象は 12 か所(本筋 6 + 本筋外 6)。生成クエスト(単眼の暴君)・街道の襲撃・隊商護衛には置かない

草案(**名前と数値は項目 1 で確定**。SRD の効果を既存キーへ寄せた近似で、数値はプレイテストで動かす):

| scenarioId | 伝承の品(仮) | SRD 5.1 原名 | 効果キー(仮) |
|---|---|---|---|
| goblin-mine | アイウーンストーン(防護) | Ioun Stone (Protection) | `acBonus: 1` |
| bandits-forest | グローブオブミサイルスネアリング | Gloves of Missile Snaring | `avoidArrow: 0.5` |
| lizard-swamp | ペリアプトオブウーンドクロージャー | Periapt of Wound Closure | `hpBonus: 6` |
| orc-fort | ブレイサーズオブディフェンス | Bracers of Defense | `acBonus: 2` |
| undead-temple | マントルオブスペルレジスタンス | Mantle of Spell Resistance | `saveBonus: 1, undeadDR: 2` |
| dragon-lair | ベルトオブファイアジャイアントストレングス | Belt of Giant Strength (Fire) | `dmgBonus: 5` |
| tower-mother | ローブオブアイズ | Robe of Eyes | `skillBonus: { perception: 3 }` |
| kobold-warren | ブーツオブエルヴンカインド | Boots of Elvenkind | `skillBonus: { stealth: 2 }` |
| lost-cargo | ペリアプトオブヘルス | Periapt of Health | `hpBonus: 4, saveBonus: 1` |
| silent-tomb | ブローチオブシールディング | Brooch of Shielding | `acBonus: 1, saveBonus: 1` |
| witch-hut | ペリアプトオブプルーフアゲンストポイズン | Periapt of Proof against Poison | `saveBonus: 2` |
| frost-hold | **ガントレットオブオーガパワー(既存の品を流用)** | Gauntlets of Ogre Power | 既存の `dmgBonus: 2` のまま |

⚠ frost-hold の行は #107 の着地後でなければ `scenarioId` が origin に無い。#107 着地後に着手する前提なので 12 行とも入れてよい。

⭐ **frost-hold だけは新しい品を作らず、既存の `gauntlets-ogre-power` を伝承の品にする**(2026-11-04 ユーザー指定「今回の巨人の箇所は、『ガントレットオブオーガパワー』にしてほしいかな」。ダイアログで「既存の品を砦の専用へ」を選択)。

- index.html:14864(★ 起草時 14860 → §12-1 (5) で訂正)と tavern.html:7131 の既存の行に `relic: "frost-hold"` を**足すだけ**。id / name / 効果 / rarity は変えない。
- ⇒ 罠 D の除外で**全クエスト共通の抽選から外れる**(ユーザー了承済み)。もう持っている人の所持・装備はそのまま。
- フレーバーの文は「巨鬼(オーガ)」のままでよいか、霜の巨人の砦に結び付けて書き直すかは項目 1 で決めてよい(⚠ 書き直すなら tavern 側に文は無いので index だけ)。
- 新しく作る伝承の品は **11 品**、既存の流用が 1 品 = `relic` を持つ品は合わせて **12 品**。
- 実測(2026-11-04): この品を名指しする検証ドライバは **0 本**(`grep -lE "gauntlets-ogre-power|ガントレットオブオーガパワー" tools/*.js`)。tavern.html:5534 の開発用の付与リスト(`?givemagic` / `DF_DEV_MAGIC_SHOP`)に id が直書きされているが、付与するだけなので触らなくてよい。⚠ 新しい伝承の品 11 品もこのリストに足しておくと、メモリの運用(新規アイテムは URL チート無しで試せるように)と揃う。

新しい 11 品は `accessories[]` へ `{ id: "relic-<scenarioId>", name, flavor, <効果キー>, gated: true, relic: "<scenarioId>", rarity: "special" }`、
`tavern.html` の `ACCESSORIES_TV` へ `{ id, name, rarity: "special", gated: true, relic: "<scenarioId>", effect: "<日本語の効果>" }`。
⚠ **id / name / gated / rarity / relic を完全一致**させる(不一致だと「拾ったのに酒場で選べない」)。
⚠ `classReq` は付けない(誰でも着けられる)。

`QUEST_RELICS` の表を別に持たず、`accessories[]` の `relic` を唯一の正にする:

```js
/* ★[#108] 伝承の品 = その行き先のクリア時の宝箱でしか出ない品。accessories[].relic が唯一の正。 */
function questRelicFor(sid) {
  const i = accessories.findIndex(a => a && a.relic === sid);
  return i >= 0 ? i : -1;
}
```

---

## 5. 項目 2 — 宝箱 3 つの画面・抽選・付与

### 5-1. 抽選の切り出し(罠 A)

`rollMagicItemDrop()` を次の 3 つへ分ける。**`rollMagicItemDrop()` の外から見た振る舞いは変えない**。

- `buildMagicItemPool()` … 今の pool の組み立て(+ `acc.relic` の除外 = 罠 D)
- `grantMagicItemPick(pick)` … 今の後半(付与・保存)
- `rollMagicItemDrop()` … `const pool = buildMagicItemPool(); if (!pool.length) return null; return grantMagicItemPick(pool[Math.floor(Math.random() * pool.length)]);`
  ⚠ `Math.random` の呼び方と回数を今と同じにする(罠 B)

### 5-2. 箱の中身を決める(`lastResult` を書いた後)

```js
/* ★[#108] クリア時の宝箱 3 つ。中身は先に決めるが、付与は開けた 1 箱だけ (罠 A)。 */
function rollClearChests() {
  const relicIdx   = questRelicFor(scenarioId);
  const relicP     = runHiddenFoeSlain ? CLEAR_CHEST_RELIC_P_HIDDEN : CLEAR_CHEST_RELIC_P;  // 0.20 / 0.04 (仮)
  const magicP     = (currentScenario && currentScenario.magicItemChance > 0)
                       ? currentScenario.magicItemChance : CLEAR_CHEST_MAGIC_P;             // 0.10 (仮)
  const pool       = buildMagicItemPool();
  const boxes = [];
  let relicPlaced = false;
  for (let k = 0; k < 3; k++) {
    if (!relicPlaced && relicIdx >= 0 && Math.random() < relicP) {
      boxes.push({ kind: "relic", idx: relicIdx }); relicPlaced = true; continue;   // 3 箱で最大 1 つ
    }
    if (pool.length && Math.random() < magicP) {
      boxes.push({ kind: "magic", pick: pool[Math.floor(Math.random() * pool.length)] }); continue;
    }
    boxes.push(Math.random() < 0.5
      ? { kind: "scroll", id: pickScrollId({ common: 55, uncommon: 35, rare: 10 }) }
      : { kind: "gold",   amount: 20 + Math.floor(Math.random() * 31) });           // 20〜50G (仮)
  }
  return boxes;
}
```

- 確率・金貨の額は**仮**。`CLEAR_CHEST_*` の定数に寄せて、プレイテストで動かせるようにする。
- 単眼の暴君の 25%(`magicItemChance`)は「マジックアイテムの枠の当選率」として残す。
- ⚠ 同じマジックアイテムが 2 箱に入ることはあってよい(開けるのは 1 つ)。ただし伝承の品は最大 1 つ。

### 5-3. 開ける・付与する・保存する

- 箱をタップ → その箱を開ける(0.6 秒)→ 残り 2 箱を**同時に**開ける。開けた箱だけ付与。
  - `gold` → `persistent.gold` と `dragonfighters.gold` へ足す
  - `scroll` → `addScroll(id)`
  - `magic` → `grantMagicItemPick(pick)`。⚠ 付与の直前に `buildMagicItemPool()` にまだ入っているかを見て、入っていなければ金貨 50G に換える
  - `relic` → `findAccessoryRecipient(id)` で空き枠の誰かへ着けて `savePersistentAccessoryStock()` + `recomputeAccessoryStock()`。
    受け取り手が無ければ金貨 50G(罠 C)
- `lastResult` を読み直し、`chest: { boxes: [<種類と名前>...], opened: <0-2>, granted: <名前 or 額> }` を足して書き戻す。
  ⛔ `reward` には触らない(罠 B)
- **選ばずに `resultBtn` を押したら**、3 箱のうち 1 つを無作為に開けたことにして付与・保存してから遷移する。
  中身は伏せてあるので、プレイヤーが選んだのと情報の上では同じ。⭐ これで既存ドライバの「ボタンを押す」経路が塞がらない。
  竜の巣の「▶ エンディングへ」の経路も同じ。
- 二重付与を防ぐ: `clearChestOpened` の旗を 1 本持ち、開けた後のタップ・ボタンでは何もしない。

### 5-4. 画面

- `#resultChests` を `#resultReward` の**下**に置く。`resultReward.innerHTML` は今と 1 バイトも同じ(罠 B)。
- 閉じた箱 = `chest.png`、開いた箱 = `chest_open.png`。CSS の transform で軽く揺らして待つ。canvas は使わない。
- 中身の名前は箱の**下**に小さく、レア度の色で出す(金貨・巻物 = common / マジックアイテム = `.rarity-rare` 青 /
  伝承の品 = `.rarity-epic` 紫 + 名前の頭に「伝承」の札 + 1 回きりの紫の光の柱)。
- 縦持ち 390 幅で 3 箱が横に収まる。タップ領域は 44px 以上。名前が 2 行に折れない(長い名前は省略して全文は title に)。
- 効果音は既存の `chestFound` 等を使う(新しい音は足さない)。
- 敗北・撤退では出さない(勝利の枝だけ)。

### 5-5. 撤退スイッチ

- **`?clearchest=0`** — 宝箱を出さず、今の文字の画面と `clearMagicItem`(1%)の付与を今どおり行う。伝承の品は出ない。
- ⚠ 判定位置 = `ROAD_CHEST_ON` の近く(3728 付近)で 1 回だけ読む。`index.html` だけで完結(ページ遷移をまたがない)。
- 宝箱が有効なとき、44049 の `clearMagicItem` は**乱数を 1 回消費するだけ**で付与しない(罠 B の 3)。

---

## 6. 項目 3 — 隠し要素の印・色分け・tavern

- `HIDDEN_FOE_TYPES` と `runHiddenFoeSlain`(§2-6)。ラン開始で false に戻す。
- tavern.html: `--rarity-rare` / `--rarity-epic` と `.rarity-rare` / `.rarity-epic` を写し、
  所持アクセサリーの名前に伝承の品 = 紫・gated = 青を付ける(⚠ 写すのは色の 2 段だけ。common / uncommon / legendary は写さない)。
- 酒場の所持アクセサリーの一覧で、伝承の品の行に「伝承」の札を付ける(どこから来た品か分かるように、行き先の名前を effect の後ろへ)。

項目 4 = 受入ドライバ(§8)+ 既存 golden の非退行 + §12。

---

## 7. 撤退スイッチ

- **`?clearchest=0`**(§5-5)。tavern の色は撤退しない(色が付くだけで振る舞いは変わらない)。

---

## 8. 受入条件 — `tools/verify_clear_chests.js`(新規)

方針: `showResult(true)` を直接呼ぶ既存の作法(`driver_sce1_events:1395-1400`)にならい、`Math.random` を差し替えて
箱の中身を決め打ちし、**開けた箱の付与・保存**と**開けなかった箱の非付与**を localStorage と `lastResult` の 2 経路で見る。
ポートの base は #107 の §12 が書く「次の新規ドライバ base」を使う(目安 10703)。

### §0 装置

- **(0a)** `accessories[]` に `relic` を持つ品が 12 件(新規 11 + 既存の `gauntlets-ogre-power` 1)。0 件なら全 assert が空振りなので exit 3
- **(0b)** `buildMagicItemPool()` が戦士リーダー既定のセーブで 1 件以上(共通プールが空だと magic の箱が作れない)

### §1 抽選と付与の分離(罠 A)

- **(1a)** 3 箱を magic / magic / relic に決め打ち → 1 箱目だけ開ける → `markGatedOwned` の記録と装備に 1 品だけ増える(localStorage と `accessories` の装備枠の 2 経路)
- **(1b)** 開けなかった 2 箱の品は所持にも装備にも無い

### §2 金貨と既存の欄(罠 B)

- **(2a)** 宝箱を開ける前と後で `lastResult.reward` が**完全一致**(JSON 文字列で比べる)
- **(2b)** gold の箱を開ける → `dragonfighters.gold` は宝箱の額だけ増え、`lastResult.chest.granted` に同じ額
- **(2c)** `resultReward.innerHTML` が `?clearchest=0` のときと同じ(同じ乱数の列で)

### §3 伝承の品(罠 C・D)

- **(3a)** `buildMagicItemPool()` に `relic` の品が 1 つも無い
- **(3b)** relic の箱を開ける → 空き枠の誰かに着く・`savePersistentAccessoryStock` の JSON に id が載る
- **(3c)** 全員の枠が埋まっている → 金貨 50G
- **(3d)** 3 箱のうち relic は最大 1 つ(relicP = 1 に決め打ちして 3 箱とも relic にならない)
- **(3e)** `runHiddenFoeSlain` の true / false で relicP が 0.20 / 0.04 に切り替わる(定数を読んで比べる)
- **(3f)** tavern の `ACCESSORIES_TV` と index の `accessories[]` で、relic の品の id / name / gated / rarity / relic が完全一致

### §4 選ばずに帰る

- **(4a)** 箱を開けずに `resultBtn` を押す → ちょうど 1 箱ぶん付与されてから遷移(sessionStorage の `lastResult.chest.opened` が 0-2)
- **(4b)** 開けた後に `resultBtn` を押しても二重に付与しない

### §5 色

- **(5a)** 伝承の品の名前の要素に `.rarity-epic`、マジックアイテムに `.rarity-rare`
- **(5b)** tavern.html に `.rarity-epic` / `.rarity-rare` が定義されていて、算出色が index と同じ

### §6 撤退

- **(Xa)** `?clearchest=0` → `#resultChests` が無い・`lastResult.chest` が無い・`clearMagicItem` の 1% は今どおり付与される

### ⛔ 測らないこと

- 確率・金貨の額・揺れのアニメーションの時間(プレイテストで動かす)
- 伝承の品の数値の釣り合い

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `grantall` | 3 箱とも付与する(罠 A の再現)| (1b) |
| `goldmix` | 宝箱の金貨を `reward.gold` に足す(罠 B の再現)| (2a) |
| `relicleak` | `buildMagicItemPool` の relic 除外を外す(罠 D の再現)| (3a) |
| `noequip` | relic を装備枠に着けずに在庫だけ数える(罠 C の再現)| (3b) |
| `tworelic` | 「最大 1 つ」の旗を外す | (3d) |
| `dblgrant` | `clearChestOpened` の旗を外す | (4b) |
| `namedrift` | tavern 側の relic の name を 1 文字変える | (3f) |

### 既存 golden の非退行(実装後に必ず走らせる)

- §2-3 の 9 本 + `verify_run_chronicle`。⚠ 特に `verify_corner_check`(金貨の完全一致)と `driver_sce1_events`(`resultReward`)。
- 基準値は #107 着地後の値で取り直す(起草時点では #107 の言い直しが途中)。
- 走らせて違ったら、期待値を書き換える前に理由を突き止める。罠 B の 3(乱数の消費の順番)を最初に疑う。
- ⚠ `accessories[]` の件数を握る golden があれば赤くなる(+12 行)。項目 1 で `grep -nE "accessories\.length|ACCESSORIES_TV\.length" tools/*.js` を測り、予告に入れる。

---

## 9. 実機/実感の確認(ここが本当の受入)

- iPhone 縦持ちで箱 3 つが横に収まり、押しやすい・名前が読める
- 伝承の品の紫の光の柱が重くない・1 回きり
- 10 回クリアしても待たされる感じがしない(開ける 0.6 秒 + 残り 2 つ同時)
- 酒場の所持品で伝承の品が紫、マジックアイテムが青に見える
- ⚠ ローカルは http 起動が必須(file:// では音が出ない)

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>クリアすると宝箱が 3 つ</b> — 1 つ選んで開けると報酬が手に入る。まれに、その依頼でしか出ない紫の「伝承の品」が入っている。隠し要素を倒した回は出やすい。"

---

## 11. やらないこと

- ⛔ **砦の守護者の復活**(畳み込みで n6 がグラフ外。n6 を畳んだ表へ足すと休眠敵でクリア不能 = #62 の罠)→ 別チケット
- ⛔ **本筋外の隠し要素**(コボルドの赤い卵の親など)→ 1 か所 = 1 チケットで別に
- ⛔ **依頼札・記録棚の達成印**(会議の候補④)→ 別チケット
- ⛔ 伝承の品の**新しい効果の配線**(既存キーだけで作る。新効果はプレイテストの後に 1 品ずつ)
- ⛔ 道中の宝箱(#87 の `ROAD_CHEST_ON`)・森の鍵束の宝箱・竜の巣の財宝とミミックには触らない
- ⛔ `maybeGrantScrollDrop` の隠し要素の判定には触らない(ゴブリン戦車を足すと巻物のドロップが変わり、別の golden が動く)
- ⛔ 魔法(巻物)の専用品。ユーザーは「マジックアイテムもしくは魔法」と言ったが、会議は品で統一した。巻物は宝箱の中身の 1 種として共通カタログから出る
- ⛔ **`実装依頼書/README.md` への行追加**(#107 着地後)。用意してある行:

    | 108 | [2026-11-04_clear-chests.md](2026-11-04_clear-chests.md) | **承認済** | 0% | クリアすると閉じた宝箱 3 つから 1 つ選ぶ(運試し)。まれにその行き先だけの「伝承の品」(紫)。マジックアイテムは青。⚠⚠ `rollMagicItemDrop` は引いた瞬間に付与する = 抽選と付与を分ける / 宝箱の金貨は `reward.gold` に混ぜない(乱数固定の golden 9 本)/ 伝承の品は `gated` + `relic` で共通プールから外す。撤退 `?clearchest=0`。#107 の着地後に着手 |

---

## 12. 実装結果

### 12-1. 項目 1 — 着手前の実測 (基準 5211ab0)

- 測った日 = 2026-11-06 / HEAD = `5211ab0`(#107 の最終 `e5cfe5d` + 文書 1 本)。⛔ `index.html` / `tavern.html` / `audio.js` は 1 バイトも触っていない(測るだけ = changelog 不要)。
- 長いログ = `C:\Users\PC_User\.claude\dev-loop\r108\item1\`(`remeasure_2-10.log` = §2-10 の 4 本 / `acc_count_grep.log` = 件数を握る golden の grep / `baseline_<driver>.log` ×10 + `baseline_summary.txt` = golden の基準)。

#### (1) §2-10 の再測定 → §2-1〜§2-8 の行番号(5cfdf10 → 5211ab0)

| 何 | 起草時 (5cfdf10) | 今 (5211ab0) |
|---|---|---|
| `ROAD_CHEST_ON`(#87) | 3724-3728 | 3724-3728(コメント 3724-3727・宣言 3728)= 変わらず |
| `ROAD_CHEST_GOLD_EACH` / `ROAD_CHEST_GOLD` / `roadChestBonusGold()` | 3739-3756 | 3739 / 3740-3753(frost-hold 75 の行 3752 が #107 で増えた)/ 3754-3762 |
| `MAGIC_DROP_CLEAR_CHANCE = 0.01` | 26304 | **26308** |
| `ladderMaxWeaponIdx()` | (26306 付近) | 26310-26314 |
| `findAccessoryRecipient(accId)` | 26313 | **26317** |
| `markGatedOwned(name)` | 26366 | **26370**(`DF_GATED_OWNED_KEY` 26369) |
| `rollMagicItemDrop()` | 26377-26465 | **26381-26469**(pool の組み立て 26382-26408 / gated アクセの絞り `if (!acc \|\| !acc.gated) continue;` = **26405** / `pool.length === 0` 26409 / `Math.random` で pick = 26410 / 付与の後半 26411-26468)|
| `pickChestLoot()` | — | 26471(宝箱の `magicItem` → `rollMagicItemDrop()` = 26758)|
| `function showResult(win)` | 44014 | **44019** |
| `earnedGold = coins + clearGold + roadChestGold` | 44042 | **44048** |
| `clearChance` → `clearMagicItem = (Math.random() < clearChance) ? rollMagicItemDrop() : null` | 44048-44050 | **44053-44055** |
| 金貨・装備・XP・アクセを同期で localStorage へ | 44065-44087 | **44069**(`winEq`)-**44093**(catch) |
| `reward = { ... }` | 44098-44108 | **44103-44113** |
| `resultReward.innerHTML` を組み立てる | 44109-44134 | **44115**(VICTORY)-**44139**(`resultRewardEl.innerHTML = html`)。`✨ 宝物発見` = **44124**(変わらず)|
| `resultOverlayEl.classList.add("show")` | 44162 | **44167**(竜の巣の「▶ エンディングへ」= 44166)|
| `sessionStorage "dragonfighters.lastResult"` | 44165-44178 | **44170-44183**(⇒ 宝箱の抽選は **44183 の後**に置く)|
| `resultBtn` の click → `dfReturnPage()` | 44180-44185 | **44185-44189** |
| 撤退 `lastResult`(探索中の離脱)| — | 44229 |
| `accessories[]` | 14836-14880 | **14839-14884**(`gauntlets-ogre-power` = **14864-14865**)|
| `recomputeAccessoryStock()` | 15053 | **15057** |
| `addScroll` / `pickScrollId` / `maybeGrantScrollDrop` | 15225 / 15241 / 15255 | **15229 / 15245 / 15259**(隠し要素の判定 15262-15263)|
| 森の外套 5 個目 = 50G | 18923 | `maybeDropShadowAmulet` 18920・50G = **18927-18928** |
| `savePersistentAccessoryStock()` | 18980 | **18984** |
| 撃破フック(`maybeDropShadowAmulet` / `maybeGrantScrollDrop`)| 19075-19079 | **19081-19082** |
| 道具袋の `.rarity-*` | 19783 / 19786 | **19787 / 19790** |
| `--rarity-rare/epic` / `.rarity-rare/epic`(index) | 24-25 / 2655-2656 | 同じ(**tavern.html には 0 件** = 変わらず)|
| `getAccessoryAcBonus` ほか効果の読み手 | — | 16630-16716(下の (5))|
| tavern `ACCESSORIES_TV` | — | **7113-7144**(ガントレット = **7131**)|
| tavern 開発用の付与リスト(`?givemagic` / `DF_DEV_MAGIC_SHOP`)| 5534 | **5531-5535**(ガントレット = 5534)|
| `SCENARIOS`(index)| — | 12041-(12 行き先のキー = 12042 / 12059 / 12087 / 12109 / 12134 / 12154 / 12176 / 12197 / 12220 / 12245 / 12271 / 12296)|

- 乱数を固定して `showResult` / `lastResult` を読む本 = **9 本のまま**(起草時と同じ顔ぶれ)。`resultReward` を読む本 = `driver_sce1_events:1399` / `verify_run_chronicle:1304`(起草時 1301 → 1304)。
- `assets/chest.png` / `assets/chest_open.png` は実在。`sfx("chestFound")` = 15239 / 15294 / 26714。
- 新しく使う名前(`clearchest` / `resultChests` / `buildMagicItemPool` / `grantMagicItemPick` / `questRelicFor` / `HIDDEN_FOE_TYPES` / `runHiddenFoeSlain` / `CLEAR_CHEST_` / `relic`)は index / tavern / js とも **0 件** = ぶつからない。`tools/verify_clear_chests.js` は未作成・port 10706/10707 を握る既存ドライバ 0 本。

#### (2) 罠 D の後半 — 店・ラダー・酒場の装備候補は `gated` だけで伝承の品を外せるか

| 入手口 | 関数と絞り | `gated` だけで外れるか |
|---|---|---|
| index 宝箱のランク上げラダー | `ladderMaxWeaponIdx()`(26310-26314)`if (!weapons[i].gated)`。宝箱の `weapon` / `armor` / `shield` の中身もラダー経由 | ✅ そもそも**武器の表だけ**。アクセは宝箱へ `magicItem`(`pickChestLoot` 26473)→ `rollMagicItemDrop()` 経由でしか来ない |
| index 共通の抽選 | `rollMagicItemDrop()` 26403-26408 `if (!acc \|\| !acc.gated) continue;` | ❌ **gated を通すのはここ** → `buildMagicItemPool()` で `acc.relic` を外す(計画どおり・変異 `relicleak`)|
| tavern 武器防具屋 | `shopPool(kind)`(7234〜)は武器/防具/盾だけ。`item.gated && !DF_DEV_MAGIC_SHOP` で買えない(7365)・未所持の gated は非表示(7928)。アクセは**売っていない**(5527「アクセサリはショップ非対応」)| ✅ 対象外 |
| tavern 酒場の装身具の候補 | `unlockedAccessoriesTV()`(7151-7159)= `accessoryIds` の所持 ∩ `accAllowedTV`(classReq)。`cycleAccessoryTV`(7178-7189)もこれを回すだけ | ✅ gated ではなく**所持の台帳**で絞る = 宝箱で得た後にだけ出る(伝承の品の正しい振る舞い)|
| ⚠⚠ **tavern 闇市の古物商(#99)** | **`curioGearPoolTV()`(10910-10920)`ACCESSORIES_TV.forEach(a => { if (a.gated) out.push({ acc: a.id }); });`** → `refreshCurioGearTV()`(10942-10948)が未所持の品から 1〜2 品を **25 牙貨**で並べる・`buyCurioGearTV()`(10967-)が `accessoryIds` へ直接足す | ❌ **gated だけでは外れない**。伝承の品 11 品(と relic を足したガントレット)が**古物商で牙貨で買えてしまう** |
| tavern 開発用の付与 | `?givemagic` / `DF_DEV_MAGIC_SHOP` の id 直書きリスト(5531-5535)| —(開発用。§4-2 の注記どおり 11 品を足すと運用と揃う)|

⇒ **起草時の「gated のままなので店・ラダーからは今の仕組みで外れる」は半分外れ**。外れないのは古物商 1 か所。
項目 3(tavern を触る項目)で `curioGearPoolTV()` の装飾品の枝を **`if (a.gated && !a.relic)`** にする必要がある(1 行。⚠ 母集団だけ絞れば `curioItemTV` / 保存済みの `plazaStateTV.curioGear` は「品が引けない行は出さない」で自然に落ちる…ではない: `curioItemTV` は id で引くだけなので、**既に棚に載っている保存済みの行は残る**。棚の行も `relic` で落とすかは項目 3 で決める)。
- ⚠⚠ **ユーザー判断が要るかもしれない点(項目 3 の前に確認)**: ガントレットオブオーガパワーは今、古物商で 25 牙貨で買える。relic を足して古物商からも外すと「**牙貨で買える道が消える**」。ユーザーが了承したのは「全クエスト共通の抽選から外れる」(§4-2)まで。⭐ 推奨 = 外す(`questRelicFor` のコメント「その行き先のクリア時の宝箱でしか出ない品」と揃う)。
- ⚠ 罠 C の訂正(事実): `savePersistentAccessoryStock()`(18984)の所持台帳 `accessoryIds` は**単調**(19002-19008 = 過去の id を残して足す)。古物商もこの台帳へ直接足している。⇒ 「装備していないと所持にならない」は**装備枠の在庫 `accessoryStock`(`recomputeAccessoryStock`)についてだけ**正しい。酒場で選べるかは台帳で決まる。§5-3 の「受け取り手が無ければ 50G」は設計の判断として残す(台帳へ足すだけ、という別解もある)。

#### (3) 件数・id を握る golden(11 行足す + ガントレットに `relic` を足したときの予告)

- `grep -nE "accessories\.length|ACCESSORIES_TV\.length" tools/*.js` = **0 件**。
- `grep -lE "gauntlets-ogre-power|ガントレットオブオーガパワー" tools/*.js` = **0 本**(起草時と同じ)。
- 広く取った語(`ACCESSORIES_TV` / `'accessories'` / `accDef(` / `unlockedAccs` / `accessoryState` / `ownedGatedNames` / curio)= `driver_equip_compact_ios` / `verify_plaza_curio` / `verify_save_slots` / `verify_sheet_equip` + id 名指し `driver_dev_gate2`。

| ドライバ | 予告 | 理由 |
|---|---|---|
| **`verify_plaza_curio`** | 🔴 **確実に赤**(何もしなくても・古物商を直しても) | (4b) 装備の表の行数と `ACCESSORIES_TV` の id の並びを基準の木 `54f6409` と比べる(行 +11 で赤)/ (1a) 「name/flavor/effect 以外の欄が完全一致」= ガントレットに `relic` が増えて index・酒場とも赤 / (0a) 母集団 = 21 品・装飾品 11・基準の木の gated の置き場と同じ集合(古物商を直さない = 32 品・装飾品 22 / 直す = 20 品・装飾品 10 でどちらも赤)/ (3a)(3b) 21 品・20 品の数で赤 |
| `verify_save_slots` | 🟡 たぶん緑 | `ACCESSORIES_TV` を実行時に読んで全 id を種まきする(件数を書いていない)|
| `driver_dev_gate2` | 🟢 緑 | `ring-free-action` が `accessoryIds` に入るかだけ |
| `driver_equip_compact_ios` / `verify_sheet_equip` | 🟢 緑 | `ownedGatedNames`(武器・防具の名前)だけ。アクセは数えない(`rows.length === 13` は画面の数)|
| 乱数固定の 9 本 + `verify_run_chronicle` | 🟢 のはず | アクセの件数は読まない。⚠ ただし `relic` を足すとガントレットが共通の抽選から抜けるので、`rollMagicItemDrop` の pool が**今より 1 つ減る**(新しい 11 品は relic で外れる限り増えない)。⇒ 1%(クリア)/ 0.5%(宝箱の magicItem)に当たった回だけ pick の添字が変わる。乱数を固定した本がその当たりを踏んでいれば赤になるので、赤なら最初にここを疑う(罠 B と罠 D が重なる所)|

#### (4) 非退行の基準(5211ab0・素の走行・`--negative` なし・直列・port 10706 から 2 刻み)

走らせ方 = `C:\Users\PC_User\.claude\dev-loop\r108\item1\run_baseline.ps1`(PowerShell で 1 本ずつ `node tools/<d>.js --port <p>`・`timeout` で包まない)。2026-11-06 06:55〜07:16。

| ドライバ | port | exit | 集計 | 握っている値(後の項目で同じであるべきもの)|
|---|---|---|---|---|
| `driver_mapdef_step2` | 10706 | 0 | 74/74 PASS | — |
| `driver_sce1_events` | 10708 | **1** | **211/214** | (9) エピローグが VICTORY の `resultReward` に描かれる = 緑(`金貨 +100 獲得 (累計 100)<br>XP +300 (累計 300/1000) ・ Lv 1<br><span style="opacity:.85">🕯…`)|
| `verify_corner_check` | 10710 | 0 | 20/20 | `lastResult.reward.gold` = goblin-mine **107** / bandits-forest **82** / lizard-swamp **82** / orc-fort **107** / undead-temple **107** / dragon-lair **132** / tower-mother **382** / 生成 tier3 **107**(各 `?roadchest=0` = 7・塔の母 307)|
| `verify_kobold_warren` | 10712 | 0 | 21/21 | — |
| `verify_lore_check` | 10714 | 0 | 26/26 | (3 秒で終わる本。空振りではない)|
| `verify_road_ambush` | 10716 | 0 | 41/41 | (2f) 馬車全損で clearGold 0 |
| `verify_road_boon` | 10718 | 0 | 20/20 | — |
| `verify_road_events` | 10720 | 0 | 25/25 | — |
| `verify_witch_hut` | 10722 | 0 | 29/29 | (4f) 礼金 = clearGold(gold の増分 − coins − 宝箱の補填)|
| `verify_run_chronicle` | 10724 | 0 | 74/0/0 | (6a) `?chronicle=0` の `lastResult` のキー = `scenarioId, scenarioTitle, cleared, defeated, reward, roster` / 素 = + `chronicle` |

- ⚠ **`driver_sce1_events` は着手前から赤**(#108 と無関係・直さない)。FAILED の集合 = **(2)** 「sceneFlags のキーはちょうど 3 本」/ **(4d)** 「生成クエスト側でも土台自体は生きている」/ **(N2-隣)** 「変異 N2 は D1/D4 を巻き込まない」。3 本とも実測は `["hag_choice","mine_alerted","mine_ranged_opening","s3_novice_swayed","servant_rescued"]` = 後のチケット(#106 の `hag_choice` ほか)が `sceneFlags` にキーを足したのに、期待値が 3 本のまま。分類 = 期待表が古い(ポート由来の偽の赤ではない・exit 1)。
  ⇒ **非退行の判定 = 「FAILED の集合がこの 3 本から増えない」**。`resultReward` を読む (9) は緑。
- ⭐ `lastResult` のキーの並びは (6a) の 6 / 7 個。§5-3 で `chest` を足すと**素の腕のキーが 1 つ増える**。(6a) は `?chronicle=0` の腕で「chronicle が無い」ことを見る述語なので、`chest` が増えても赤くならないはず(項目 4 で確かめる)。

#### (5) §4-2 の伝承の品の表を本番コードで検算

| 確かめたこと | 結果 |
|---|---|
| 効果キーがもう配線済みか(§11 = 新しい配線 0 本)| ✅ 表の 7 キーは全部、`getEquippedAccessories(unit)` を回す既存の読み手がある: `avoidArrow` = `getTotalAvoidance` 16636 / `hpBonus` = `getAccessoryHpBonus` 16672 / `dmgBonus` = `getAccessoryDmgBonus` 16685 / `acBonus` = `getAccessoryAcBonus` 16699 / `undeadDR` = `getUndeadDamageReduction` 16711 / `saveBonus` = `getSaveBonus` 16618-16624 / `skillBonus` = `getUnitSkillBonus` → `mergeSkillBonusInto` 16576(キー `perception` / `stealth` は `js/skill-check.js:68` / `:71` の `CHECKS` に実在)。⇒ **新しい配線は要らない** |
| id がぶつからないか | ✅ `relic-<scenarioId>` 11 個・`relic` という語そのものが index / tavern / js で **0 件** |
| 名前がぶつからないか | ✅ カタカナ名 11 個とも index / tavern / js で **0 件** |
| 行き先の id が実在するか | ✅ 12 個とも index の `SCENARIOS`(12042〜12296)・`ROAD_CHEST_GOLD`(3741-3752)・tavern の依頼の `id:`(各 1 件)に実在。frost-hold も #107 で着地済み(12296)|
| SRD 5.1 の原名 | ✅ 12 品とも SRD 5.1 の Magic Items に載る名前(Ioun Stone は種類 Protection・Belt of Giant Strength は種類 Fire)|
| ガントレットの既存の行 | ✅ id / name / `dmgBonus: 2` / `gated: true` / `rarity: "special"` は index 14864-14865 と tavern 7131 で一致。`classReq` 無し |

**表の事実の訂正(数値・名前・キーは変えていない)**:

1. §4-2 の「14836-14880 の既存アクセ」→ **14839-14884**(#107 までの行ズレ)。
2. §4-2 の「index.html:14860 と tavern.html:7131 の既存の行」→ **index.html:14864**(tavern 7131 は同じ)。
3. 表そのもの(12 行の scenarioId / 名前 / 原名 / 効果キー)に事実の誤りは **0 件**。

**数値の注意(⛔ 直していない = 釣り合いはプレイテストで動かす・§8 の「測らないこと」)**:

- ⚠ **森のグローブオブミサイルスネアリング `avoidArrow: 0.5` は、同じ森の残影の獣の外套(`shadow-amulet` = `avoidAll 0.05` + `avoidArrow 0.50`)と重ねると矢の回避が 1.05 = 矢が必ず外れる**。`getTotalAvoidance` は**足し算**で上限が無く、判定は `Math.random() < avoidance`(39021-39027)。1 人が 2 枠に両方を着けられる(別 id なので「同一不可」に当たらない)。⇒ 数値か上限をどうするかは**ユーザー判断**(項目 2 で品を足す前に聞くのがよい)。
- `undeadDR` は**最大値**(足さない)。神殿のマントル `undeadDR: 2` は、スカラベ(3)を着けている人には効かない。
- `skillBonus perception` は足し算 = ローブオブアイズ(+3)+ アイズオブジイーグル(+2)= +5。

#### (6) 項目 2 へ渡すこと

- 宝箱の抽選の置き場 = `lastResult` を書き終えた **44183 の後**(`showResult` の閉じ括弧 44184 の前)。`resultBtn` の click は 44185-44189。
- `buildMagicItemPool()` へ切り出すのは 26382-26408、`grantMagicItemPick(pick)` は 26411-26468。`Math.random` は 26410 の 1 回だけ。
- 古物商(tavern `curioGearPoolTV` 10917-10918)の relic 除外は**項目 3 の範囲に足す**(§6 に書かれていない)。ガントレットを古物商から外すかは上の (2) の確認待ち。
- 森の品の `avoidArrow` の重ね掛け(矢 100% 回避)は品を足す前にユーザーへ確認。
- 予告の赤 = `verify_plaza_curio`(確実)。言い直しの方針(基準の木 `54f6409` との比較から relic の行を除くか)は項目 4。

### 12-2. 項目 2 — 宝箱 3 つの画面・抽選・付与 (基準 f305f5e)

- 実施日 = 2026-11-06。触ったのは `index.html` と `js/changelog.js`(`py tools/add_changelog.py` で §10 の 1 行)だけ。⛔ tavern.html・隠し要素の印(`HIDDEN_FOE_TYPES` / `runHiddenFoeSlain`)・`maybeGrantScrollDrop` には触っていない(項目 3)。
- 長いログ = `C:\Users\PC_User\.claude\dev-loop\r108\item2\`(`smoke_chests.js` + `smoke.log` / `run_after.ps1` + `after_<driver>.log` ×10 + `after_summary.txt` / `shot_390.png`)。

#### (1) 入れたもの(行番号は項目 2 の後の index.html)

| 何 | 行 |
|---|---|
| CSS `#resultChests` 一式(`.rcBox` / `.rcImg` / `.rcName` / `.rcTag` / `.rcPillar` と `@keyframes rcWobble` / `rcShake` / `rcPillar`)| 3050-3087 |
| 撤退 `CLEAR_CHEST_ON`(`?clearchest=0`・`ROAD_CHEST_ON` の直後で 1 回だけ読む)| 3769 |
| `gauntlets-ogre-power` に `relic: "frost-hold"` を足しただけ(id / name / 効果 / rarity は不変)| 14906 |
| 伝承の品 11 品 `relic-<scenarioId>`(§4-2 の表の名前・効果キー・数値そのまま。`gated: true` + `relic` + `rarity: "special"`・`classReq` 無し)| 14929-14950 |
| `questRelicFor(sid)`(`accessories[].relic` が唯一の正。無ければ -1)| 14957 |
| `rollMagicItemDrop()` = `buildMagicItemPool()` → 空なら null → `Math.random` 1 回で pick → `grantMagicItemPick(pick)`(外から見た振る舞いと乱数の消費は分ける前と同じ)| 26455 |
| `buildMagicItemPool()`(副作用なし。`if (!acc \|\| !acc.gated \|\| acc.relic) continue;` = 罠 D)| 26463 |
| `grantMagicItemPick(pick)`(今までの後半そのまま。`getLeaderWeapons()` / `getLeaderArmors()` を取り直す)| 26494 |
| 定数 `CLEAR_CHEST_COUNT 3` / `_RELIC_P 0.04` / `_RELIC_P_HIDDEN 0.20` / `_MAGIC_P 0.10` / `_GOLD_MIN 20` / `_GOLD_SPAN 31` / `_SCROLL_WEIGHTS` / `_FALLBACK_GOLD 50` / `_REVEAL_MS 600`(全部仮)| 44114-44122 |
| 状態 `clearChestBoxes`(null = 宝箱なし)/ `clearChestOpened`(二重付与の旗)| 44123-44124 |
| ⭐ `clearChestRelicP()` = **項目 3 の切り替え点**(今は常に `CLEAR_CHEST_RELIC_P` を返す)| 44127 |
| `rollClearChests()`(§5-2 のとおり。伝承の品は最大 1 つ・単眼の暴君は `magicItemChance` を magic の枠の当選率に)| 44131 |
| `clearChestBoxName` / `clearChestBoxRarity`(金貨・巻物 = common / magic = rare / relic = epic)/ `addClearChestGold`(`dragonfighters.gold` と `persistent.gold` へ足す)| 44152-44176 |
| `grantClearChestBox(box)`(開けた 1 箱だけ付与。magic は付与の直前に `buildMagicItemPool()` へ同じ kind+idx がまだ在るか見て、在れば新しい受け取り手で付与・無ければ 50G。relic は `findAccessoryRecipient` で空き枠へ着けて `savePersistentAccessoryStock` + `recomputeAccessoryStock`、受け取り手が無ければ 50G = 罠 C)| 44178 |
| `setupClearChests()`(`#resultChests` を `#resultReward` の後・`resultBtn` の前に作る)/ `openClearChest(k, opts)`(旗 → 付与 → `lastResult` を読み直して `chest` を足して書き戻す → 0.6 秒後に残り 2 つを同時に開ける。`opts.auto` は待たない)| 44206 / 44237 |
| `showResult`: `const clearHit = Math.random() < clearChance;` → `clearMagicItem = (clearHit && !CLEAR_CHEST_ON) ? rollMagicItemDrop() : null`(罠 B の 3)| 44328-44329 |
| `showResult`: `lastResult` を書いた後に `if (win && CLEAR_CHEST_ON) setupClearChests();` | 44459 |
| `resultBtn` の click の先頭: 未開封なら `openClearChest(Math.floor(Math.random() * 3), { auto: true })`(竜の巣の「▶ エンディングへ」も同じ道)| 44464 |

- `lastResult.chest` の形 = `{ boxes: [{ kind, name } ×3], opened: 0-2, granted: <名前 or 金貨の額>, grantedKind: "gold"|"scroll"|"magic"|"relic", fallback: <金貨に換えたか> }`。**開けたときにだけ**書く(開ける前の `lastResult` のキーは今と同じ)。`reward` は読み直した JSON をそのまま書き戻すので完全一致。
- 巻物は `addScroll(id, { silent: true })`(結果画面の裏にバナーを出さない)。効果音は既存の `chestOpen` → 開いた瞬間に `coin`(新しい音は 0)。

#### (2) スモーク(使い捨て・`smoke_chests.js`・port 10730・`goblin-mine`・戦士 + 魔法使い + 僧侶)= **20/20 PASS・exit 0・pageerror 0**

| 見たこと | 結果 |
|---|---|
| `accessories` で `relic` を持つ品 = 12 件 / `buildMagicItemPool()` = 13 件で relic 0 件 | ✅ |
| `showResult(true)` → `#resultChests .rcBox` = 3 つ・`#resultReward + #resultChests`(直後)・開ける前の `lastResult` に `chest` 無し | ✅ |
| magic(フレームタング)/ magic(フロストブランド)/ relic(アイウーンストーン(防護))に決め打ち → 1 箱目を開ける → フレームタングだけ `ownedGatedNames` へ・フロストブランドは無い・`relic-goblin-mine` は `accessoryIds` / `accessoryState` に無い・金貨は不変 | ✅ |
| 2 回目の `openClearChest(1)` = null・localStorage の付与の痕跡 8 キーが 1 つも動かない | ✅ |
| `lastResult.reward` が開ける前後で JSON 完全一致・`chest = { opened: 0, granted: "フレームタング", boxes 3 }` | ✅ |
| 色: magic の名前 = `rcName rarity-rare` ×2・relic = `rcName rarity-epic` + 「伝承」の札 | ✅ |
| gold 37 の箱 → `dragonfighters.gold` が +37 だけ(変わったキーは gold だけ)・`chest.granted = 37` | ✅ |
| relic の箱 → リーダーの空き枠に `relic-goblin-mine`・`accessoryIds` / `accessoryState` に id・金貨は不変 | ✅ |
| 開けずに `resultBtn`(`dfReturnPage` を `#stay` へ差し替えて遷移を止めた)→ ちょうど 1 箱ぶん(+21)・`opened` 0-2・もう一度押しても二重にならない・reward 不変 | ✅ |
| `?clearchest=0` → `#resultChests` 無し・`lastResult.chest` 無し・`CLEAR_CHEST_ON === false`・`clearChestBoxes === null` | ✅ |
| 390 幅(isMobile)の箱の位置 = [43-139] [147-243] [251-347](w96 × h92)= 横に収まる・タップ領域 44px 以上 | ✅(参考。実感は §9)|

#### (3) 非退行(素の走行・直列・port 10706 から 2 刻み・`run_after.ps1` = 項目 1 の `run_baseline.ps1` の出力先だけ変えた写し)2026-11-06 07:28〜07:49

| ドライバ | exit | 集計 | 基準 (5211ab0) との比較 |
|---|---|---|---|
| `driver_mapdef_step2` | 0 | 74/74 | 同じ |
| `driver_sce1_events` | 1 | 211/214 | **FAILED の集合が基準と同じ** (2)/(4d)/(N2-隣)(`grep FAIL` の差分 0 行)。`resultReward` を読む (9) は緑 |
| `verify_corner_check` | 0 | 20/20 | 同じ(`reward.gold` の完全一致 8 本が緑 = 宝箱の金貨は `reward.gold` に混ざっていない)|
| `verify_kobold_warren` | 0 | 21/21 | 同じ |
| `verify_lore_check` | 0 | 26/26 | 同じ |
| `verify_road_ambush` | 0 | 41/41 | 同じ |
| `verify_road_boon` | 0 | 20/20 | 同じ |
| `verify_road_events` | 0 | 25/25 | 同じ |
| `verify_witch_hut` | 0 | 29/29 | 同じ |
| `verify_run_chronicle` | 0 | 74/0/0 | 同じ((6a) のキーの並びも緑 = 開ける前の `lastResult` にキーは増えていない)|

- ⇒ **言い直した golden = 0 本**。罠 B(1% の pick の添字のずれ)を踏む本は無かった。`verify_plaza_curio` は tavern 側なので項目 2 では走らせていない(予告どおり項目 3/4 で赤)。

#### (4) 項目 3・4 へ渡すこと

- ⭐ **relicP の切り替え点 = `clearChestRelicP()`(44127)の 1 か所**。`runHiddenFoeSlain` を配線したら `return runHiddenFoeSlain ? CLEAR_CHEST_RELIC_P_HIDDEN : CLEAR_CHEST_RELIC_P;` に変える。(3e) は 2 定数を読んで比べられる。
- tavern の `ACCESSORIES_TV` へ写す 11 行 + ガントレットの `relic` = index 14906 / 14929-14950(id / name / gated / rarity / relic を完全一致。名前の括弧は全角「(防護)」)。
- 項目 4 の口: `clearChestBoxes` は `let` なので `page.evaluate` から直接差し替えて中身を決め打ちできる(スモークがこの作法)。付与は `openClearChest(k)`、自動の 1 箱は `resultBtn` の click。`dfReturnPage` は差し替えれば遷移を止められる。
- ⚠ (2c)「`resultReward.innerHTML` が `?clearchest=0` と同じ」は、**1%(`clearChance`)に当たらない乱数の列でだけ**成り立つ(当たると撤退側だけ `✨ 宝物発見` の行が出て、武器が上がれば「新装備」の行も変わる)。乱数を決め打つときは `clearHit` が偽になる値を選ぶこと。
- 変異のアンカー候補: `grantall` = `openClearChest` の `grantClearChestBox(box)` / `goldmix` = `addClearChestGold` / `relicleak` = `|| acc.relic) continue;` / `noequip` = `grantClearChestBox` の relic の枝の `currentAccessoryIndices[rcp.slot] = box.idx;` / `tworelic` = `relicPlaced = true;` / `dblgrant` = `if (!clearChestBoxes || clearChestOpened) return null;`。
- ⚠ 金貨の箱は `persistent.gold` にも足している(§5-3 の文言どおり)。`persistent.gold` はラン開始時の値のまま `showResult` では更新されないので、足した後の値は localStorage の累計とは一致しない(遷移するので実害なし)。

### 12-3. 項目 3 — 隠し要素の印・色分け・tavern (基準 f5d52f5)

- 実施日 = 2026-11-06。触ったのは `index.html` / `tavern.html` / `js/changelog.js`(`py tools/add_changelog.py` で 1 行)/ `tools/verify_plaza_curio.js`(予告どおりの言い直し)。⛔ `maybeGrantScrollDrop` の隠し要素の判定(§11)は 1 文字も触っていない。
- 長いログ = `C:\Users\PC_User\.claude\dev-loop\r108\item3\`(`smoke_item3.js` + `smoke.log` / `run_tv.sh` + `tv_summary.txt` + `tv_<driver>.log` / `run_after3.ps1` + `after3_<driver>.log` ×10 + `after3_summary.txt` / `item2_smoke.log` / `tv_curio_neg_<変異>.log`)。

#### (1) 入れたもの(行番号は項目 3 の後)

| 何 | 行 |
|---|---|
| index `HIDDEN_FOE_TYPES = ["goblinChariot","shadowBeast","stoneGolem","caelum","mimic"]` / `let runHiddenFoeSlain = false` / `isHiddenFoe(enemy)`(一覧 + `def.multiHead`)/ `markHiddenFoeSlain(enemy)` | 15333 / 15334 / 15335 / 15339(`maybeGrantScrollDrop` の直前・別の一覧)|
| index `startGame()` の頭で `runHiddenFoeSlain = false`(ラン開始。ラン = ページ 1 枚なので宣言でも false)| 15894 |
| index 撃破の集約点 `defeatEnemy` の `maybeGrantScrollDrop(enemy);` の次行に `markHiddenFoeSlain(enemy);` | 19169 |
| index `clearChestRelicP()` = `return runHiddenFoeSlain ? CLEAR_CHEST_RELIC_P_HIDDEN : CLEAR_CHEST_RELIC_P;`(定数 44130 / 44131)| 44141 |
| tavern `:root` に `--rarity-rare` / `--rarity-epic`(index と同じ値・2 段だけ)| 22-23 |
| tavern `.rarity-rare` / `.rarity-epic`(index 2655-2656 と同じ値)+ `.relicTag` + `.equipSlotChip .slotSub` | 609-617 |
| tavern `ACCESSORIES_TV`: ガントレットに `relic: "frost-hold"` / 伝承の品 11 行(id / name / gated / rarity / relic は index 14906・14929-14950 と完全一致。effect は酒場で表示する短い文)| 7151 / 7167-7177 |
| tavern `relicPlaceTV(acc)`(行き先の名前 = 酒場の依頼の表 `scenarios` の `title`。撤退で依頼が無ければ "")/ `accColorClassTV(acc)`(relic = `rarity-epic` / gated = `rarity-rare` / それ以外 = 従来の `item-special`)| 7180 / 7186 |
| tavern 装身具チップ(`renderEquippedSummary` の `chip` に `opt.tag` / `opt.sub`)= 伝承の品は名前の後ろに「伝承」の札・下の行に「効果 ・ 行き先」| 8029-8035 / 8054 |
| tavern 古物商 `curioGearPoolTV()` = `if (a.gated && !a.relic)`(2026-11-06 ユーザー決定。ガントレットも古物商から外れる)| 10972 |
| tavern 開発用の付与リスト(`?givemagic` / `DF_DEV_MAGIC_SHOP`)に伝承の品 11 id | 5553-5556 |

**決めたこと(記録)**:

1. **「所持アクセサリーの一覧」= 装身具チップ**。酒場に装身具の一覧は無い(武器・盾・防具は `renderEquipSlot` の一覧があるが、装身具は主人公の「装身具1/2」のチップを押して所持品を巡回するだけ)。新しい一覧は作らず、所持品が出る唯一の場所 = チップに色・札・行き先を付けた(準備画面とマッチング画面の引き出しの両方が同じ `renderEquippedSummary` を呼ぶ)。
2. ⚠ **チップの名前は `.equipSlotChip .slotVal`(2 クラス)が墨色で上書きしていた** = 今までの `item-special` も実は紫に見えていなかった(スモークの初回で算出色が `rgb(58,41,18)` = 墨色で赤)。⇒ `.equipSlotChip .slotVal.rarity-*` を同じ値で 1 段強く書いた。引き出し(`#pmDrawer` の暗幕)の上は `#pmDrawer .equipSlotChip .slotVal` の明るい文字のまま(暗い紫・青は暗幕で読めないため。色は付かないが「伝承」の札と下の行は出る)。
3. 開発用の付与リスト(5553-5556)に 11 id を足した = 運用(新しい品は URL チート無しで試せる)と揃える。`window.__dfDevMode` のときだけ走る = 本番の振る舞いは変わらない。他の id の直書きリストは tavern / town / world / js に無い(`grep cloak-elvenkind` = 表とこのリストの 2 か所だけ)。
4. 古物商の棚に**既に保存されている**ガントレットの行(`plazaStateTV.curioGear`)は、来訪ごとの `refreshCurioGearTV()`(10644)で引き直されるので次の入場で消える。`curioItemTV` は触っていない(依頼の範囲どおり母集団の 1 行だけ)。
5. 隠し要素の type 名は `enemy.type`(`maybeGrantScrollDrop` と同じ読み方)。ハイドラは `def.multiHead`。カエルムは `type === "caelum"`(`def.isNpcSpirit` は §2-6 の一覧に無いので見ない)。

#### (2) スモーク(使い捨て・`smoke_item3.js`・port 10740)= **16/16 PASS・exit 0・pageerror 0**

| 見たこと | 結果 |
|---|---|
| (e0) 定数 0.04 / 0.20・一覧 5 type | ✅ |
| (e1) 素のラン = false・`clearChestRelicP()` 0.04 / (e2) 普通の敵(goblin)を `defeatEnemy` → 立たない | ✅ |
| (e3) type を `goblinChariot` にした敵を `defeatEnemy`(既存の撃破フックを通す)→ true・0.20 / (e4) `multiHead` も隠し要素・null と普通の敵は違う | ✅ |
| (e5) `startGame()` で false・0.04 / (e6) ページ再読込(新しいラン)で false・0.04 | ✅ |
| (e7) `Math.random = 0.1` で `rollClearChests()`: 印なし relic 0 箱 / 印あり relic 1 箱(切り替え点を抽選が読んでいる)| ✅ |
| (a) index の relic 12 行 = tavern `accDef(id)` の 12 行(id / name / gated / rarity / relic 完全一致)| ✅ |
| (b) 古物商の母集団 20 品(装飾品 10)・relic 0・ガントレット無し | ✅ |
| (c) `.rarity-epic` / `.rarity-rare` の算出色(color + text-shadow)と `:root` の 2 変数が index と同じ | ✅ |
| (d) 伝承の品(`relic-goblin-mine`)+ リングオブプロテクションを着けたセーブ → 装身具1 = `rarity-epic`・紫 `rgb(122,59,160)`・「伝承」・下の行「AC +1 ・ ゴブリンの巣窟」/ 装身具2 = `rarity-rare`・青 `rgb(43,93,142)`・札も下の行も無し | ✅ |

- 項目 2 のスモーク `smoke_chests.js`(port 10730)= **20/20 PASS**(`item2_smoke.log`)。

#### (3) 酒場側のドライバ(直列・2026-11-06 08:00〜08:07・`run_tv.sh`)

| ドライバ | port | 結果 |
|---|---|---|
| `verify_plaza_curio` | 10742 | 言い直す前 = **exit 3**(変異 `gearshadow` の注入点の行が変わった = 予告の赤の手前で止まる)→ 下の言い直しの後 **28/28 PASS・exit 0**。`--negative --only gearshadow` = (0a)(3a)(3b) 赤 / `numdrift` = (1a) 赤 / `gearowned` = (3b) 赤(3 本とも担当の節が赤 = 言い直しで検出力を落としていない)|
| `verify_plaza_map` | 10744 | 43/43 |
| `verify_save_slots` | 10746 | 30/30 |
| `driver_equip_compact_ios` | 10748 | 31/31 |
| `driver_dev_gate2` | 10741 | 62/62 |
| `verify_sheet_equip` | 10743 | 21/21 |
| `verify_prep_retire` | 10745 | 30/30 |

`verify_plaza_curio` の言い直し(⛔ これ以外は 1 文字も変えていない):

| 箇所 | 前 → 後 | 理由 |
|---|---|---|
| 変異 `gearshadow` の注入点 | `if (a.gated)` → `if (a.gated && !a.relic)`(注入する欠陥 = shadow-amulet を母集団へ入れる、は同じ)| 古物商の行そのものを項目 3 で変えた |
| `POOL_KEYS`(母集団の正解の集合)| 基準の木の gated 装飾品 11 → 配信中の酒場の表で `relic` を持つ id を除いた 10 | ガントレットが伝承の品になり古物商で売らない(ユーザー決定)|
| (0a) | 21 品・装飾品 11 → **20 品・装飾品 10**・relic 12 品のどれも含まない | 同上 |
| (3a) | 21 品すべて / 21 品以外 0 → **20** | 同上 |
| (3b) | 「20 品を持って残り 1 品」「21 品とも持っている」→ **19 / 20**(文言だけ。中身は `POOL_KEYS` から数える)| 同上 |
| (1a) `rowDiff` | 基準の行に `relic` が無いときだけ `relic` を比べない | 基準の木 `54f6409` は relic の欄より前。ガントレットに `relic: "frost-hold"` が付いた(index・酒場とも)。relic の一致は項目 4 の (3f) が index ↔ 酒場で見る |
| (4b) | 装飾品の表の行数・並び = 基準と同じ → **#108 の伝承の品の行(基準に無い id で relic を持つ行)を除いて**同じ・かつちょうど 11 行増えている | index・酒場とも 11 行増えた |

#### (4) 非退行(素の走行・直列・port 10706 から 2 刻み・`run_after3.ps1`)2026-11-06 08:07〜08:28

| ドライバ | exit | 集計 | 基準との比較 |
|---|---|---|---|
| `driver_mapdef_step2` | 0 | 74/74 | 同じ |
| `driver_sce1_events` | 1 | 211/214 | FAILED の集合 = (2)/(4d)/(N2-隣)= 基準と同じ(ログの「隣」は PowerShell の出力で文字化けしているだけ)|
| `verify_corner_check` | 0 | 20/20 | 同じ |
| `verify_kobold_warren` | 0 | 21/21 | 同じ |
| `verify_lore_check` | 0 | 26/26 | 同じ |
| `verify_road_ambush` | 0 | 41/41 | 同じ |
| `verify_road_boon` | 0 | 20/20 | 同じ |
| `verify_road_events` | 0 | 25/25 | 同じ |
| `verify_witch_hut` | 0 | 29/29 | 同じ |
| `verify_run_chronicle` | 0 | 74/0/0 | 同じ |

- ⇒ index 側の言い直し = 0 本。撃破フックに 1 行足しても、乱数を固定した本の乱数の消費は変わらない(`markHiddenFoeSlain` は乱数を引かない)。

#### (5) changelog

- 項目 2 の #108 の行(宝箱 3 つ・隠し要素を倒した回は出やすい)は、項目 3 で `clearChestRelicP` を配線して**初めて本当になった**。そのうえで酒場側の見える変化(装身具の欄で伝承の品が紫 +「伝承」+ 行き先・マジックアイテムは青・古物商に並ばなくなった = ガントレットは牙貨で買えなくなった)は別の変化なので 1 行足した:
  `<b>伝承の品は酒場の装身具の欄で紫に</b> — 「伝承」の札と、どの依頼で手に入れた品かが分かる。マジックアイテムは青。伝承の品は闇市の古物商には並ばなくなった(ガントレットオブオーガパワーも霜の巨人の砦の伝承の品になった)。`(4 件維持で「沈黙の墓所」の行が落ちた)

#### (6) 項目 4 へ渡すこと

- (3e) の口 = `runHiddenFoeSlain`(`let`・15334)を `page.evaluate` で直接立て下げ → `clearChestRelicP()`(44141)を 2 定数(44130 / 44131)と比べる。撃破経由なら `enemies[i].type = 'goblinChariot'; defeatEnemy(i)`(スモーク (e3) の作法)。
- (3f) の口 = 酒場の `ACCESSORIES_TV` は IIFE の中 = 実行時は `window.__equipTV.accDef(id)`(5610)で引く。ソースの表なら `verify_plaza_curio` の `evalDecl(src, 'ACCESSORIES_TV')` の作法。
- 変異 `namedrift` のアンカー候補 = tavern 7167 `{ id: "relic-goblin-mine", name: "アイウーンストーン(防護)",`(括弧は全角。1 か所だけ)。
- (5b) の口 = 酒場の `.rarity-epic` / `.rarity-rare`(609-610)。⚠ 装身具チップの中は `.equipSlotChip .slotVal.rarity-*` の方が効く(同じ値)。引き出し `#pmDrawer` の中では明るい文字に上書きされる(決めたこと 2)= (5b) は準備画面のチップか素の要素で測ること。
- 古物商の言い直しは済み(`verify_plaza_curio` 28/28)。項目 4 の非退行の一覧に `verify_plaza_curio` を足すと、項目 3 の言い直しが生きているかも見られる。

### 12-4. 項目 4 — 受入ドライバ + 既存 golden の非退行 (基準 614270e)

- 実施日 = 2026-11-06。触ったのは `tools/verify_clear_chests.js`(新規)・本依頼書・`実装依頼書/README.md` だけ。⛔ `index.html` / `tavern.html` / `audio.js` は 1 バイトも触っていない(= changelog 不要)。本番に検証専用の行は 0 本。
- 長いログ = `C:\Users\PC_User\.claude\dev-loop\r108\item4\`(`run1.log`〜`run3.log` / `negative.log` / `run_after4.ps1` + `after4_<driver>.log` ×17 + `after4_summary.txt`)。

#### (1) `tools/verify_clear_chests.js` の形

- 作法は `verify_plaza_curio` に揃えた: 配信バイトを起動時に凍結 / 変異は配信スナップショットだけ / アンカーは手つかずの原本で 1 件ちょうど・置換前後で長さが違う・改行なし・置換文字列が原本に無い・他の `tools/*.js` に同じ文字列が無い(罠E)を素の走行でも起動時に検算 → 崩れたら exit 3 / `--negative` は 1 本ずつ子プロセス・担当の節が赤くならなければ exit 1。exit = 0 / 1 / 2(環境)/ 3(アンカーの腐敗・伝承の品が 12 件でない)。port 既定 10706。
- ページ = ダンジョン 11 枚(1 枚 = 1 タブ = まっさらな `dragonfighters.*`・`goblin-mine`・戦士 + 魔法使い + 僧侶)+ 酒場 1 枚(`plazaClock = 21` を種まき)。箱の中身は `clearChestBoxes`(let)を差し替えて決め打ち。所持 = `ownedGatedNames` ∪ `accessoryIds` の名前、装備 = リーダーの武器・鎧 + 全員の装身具、の 2 経路で数える。
- 21 判定・20 節: (0a)(0b)(1a)(1b)(2a)(2b)(2c)(3a)〜(3f)(4a)(4b)(5a)×2(ダンジョン・酒場)(5b)(Xa)(Xb)(9a)。1 回 ≒ 10 秒。

#### (2) §8 からの言い直し(⭐ 期待値を弱めたものは 0 本)

| 節 | §8 の文言 | 実際に測ったもの | 理由 |
|---|---|---|---|
| (0a) | 12 件・0 件なら exit 3 | 配信中の index のソースの表(`evalDecl(src,'accessories')`)で **12 件でなければブラウザを立てる前に exit 3**。実行時の `accessories[]` でも数え直す。加えて「ガントレット = frost-hold・残り 11 品 = `relic-<scenarioId>`」 | 依頼の受入条件「relic != 12 で exit 3」。⭐ 装置の検算 `relic11`(沼の行から relic を外す)で **exit 3 になることを `--negative` の親が確かめる** |
| (2c) | 同じ乱数の列で `?clearchest=0` と同じ | `Math.random` を差し替え、**showResult が直接引く 1 回(= clearHit)だけ 0.5** を返し、ほかは LCG(種 12345)。決め打ちが 1 回だけ効いたことも数える | §12-2 (4): 1% に当たる列では撤退側だけ「✨ 宝物発見」が出るので、当たらない値でしか成り立たない |
| (3d) | relicP = 1 に決め打ち | `Math.random` を常に 0 にして `rollClearChests()`(relicP は定数なので乱数の側で「必ず当たる」にした)→ relic はちょうど 1 つ | 定数を書き換えずに同じ状況を作る |
| (3e) | 定数を読んで比べる | 定数を読んで比べる + **既存の撃破フック経由**(`enemies[i].type = 'goblinChariot'; defeatEnemy(i)` → 立つ) | 項目 3 のスモーク (e3) の作法を足した |
| (4b) | 開けた後に resultBtn を押しても二重にならない | 開けた後の **2 つの口**: 別の箱のタップの呼び口 `openClearChest(別の k)` + resultBtn。どちらでも localStorage と `chest` が不変 | resultBtn の click は自前で `clearChestOpened` を見ている ⇒ 変異 `dblgrant`(`openClearChest` の旗を外す)が届くのは前者だけ。resultBtn だけでは空振りする |
| (4a) | 1 箱ぶん付与されてから遷移 | `dfReturnPage` を差し替え、**呼ばれた瞬間の金貨**が付与後の値であること + 額が `21 + opened` と一致 | 「付与 → 遷移」の順を直接測る |
| (5a) | 伝承の品の名前に `.rarity-epic`、マジックアイテムに `.rarity-rare` | ダンジョン = **実際の `.rcBox` の click** で開けて、名前の class + 算出色。酒場 = **準備画面の装身具チップ**(`#equipEquippedSummary` の装身具1/2)で 伝承の品 = `rarity-epic`・紫・「伝承」の札・下の行「AC +1 ・ ゴブリンの巣窟」/ ゲート付き(ring-protection)= `rarity-rare`・青・札なし | ⚠ 酒場に「所持アクセサリーの一覧」は無い(§12-3 決めたこと 1)。所持品が出る唯一の場所 = チップ |
| (5b) | 算出色が index と同じ | 素の要素の算出色(color + text-shadow)と `:root` の 2 変数が index と同じ + **規則が実在する**(styleSheets に `.rarity-epic` / `.rarity-rare`・クラス無しの要素と色が違う)+ チップの算出色も index の色 | 「同じ」だけだと規則が両方とも消えても通るので、実在を AND した。⚠ `#pmDrawer` の中は明るい文字に上書きされるので測らない(§12-3 決めたこと 2) |
| (Xb) | (追加) | 宝箱が有効な腕は clearHit が当たる値(0.005)でも「✨ 宝物発見」を出さず、何も付与しない | 罠 B の 3(1 回引いて捨てる)。(Xa) と同じ乱数で対にした |

#### (3) 素の走行(port 10750・3 回)

| 回 | exit | 集計 |
|---|---|---|
| 1 | 0 | 21/21 PASSED・節 20・10 秒 |
| 2 | 0 | 21/21 PASSED・9 秒 |
| 3 | 0 | 21/21 PASSED・10 秒 |

- 主な実測値: 共通プール 13 件(武器 3・装身具 10)・relic 0 / 1 箱目の武器 = フレームタングだけ所持と装備に増える / 金貨 37 の箱 = +37(変わったキーは gold だけ)/ 伝承の品 = リーダーの空き枠へ / 全枠を埋める(shadow-amulet)と金貨 +50・fallback / relicP 0.04 ↔ 0.20 / resultBtn だけで +21・遷移の瞬間の金貨 1121 / 色 = 紫 `rgb(122, 59, 160)`・青 `rgb(43, 93, 142)`(index・酒場とも)。

#### (4) `--negative`(port 10752・68 秒)= **exit 0**

| 変異 | 注入した欠陥 | 担当 | 実際に赤くなった節 | exit |
|---|---|---|---|---|
| `grantall` | `openClearChest` が 3 箱とも付与する | (1b) | (1a)(1b)(2b)(3b)(3c)(4a) | 0 |
| `goldmix` | `addClearChestGold` が `lastResult.reward.gold` にも足す | (2a) | (2a)(4a) | 0 |
| `relicleak` | `buildMagicItemPool` の `\|\| acc.relic` を外す | (3a) | (3a) | 0 |
| `noequip` | relic の枝の `currentAccessoryIndices[rcp.slot] = box.idx;` を外す | (3b) | (3b) | 0 |
| `tworelic` | `relicPlaced = true` → `false` | (3d) | (3d) | 0 |
| `dblgrant` | `openClearChest` の `clearChestOpened` の旗を外す | (4b) | (4b) | 0 |
| `namedrift` | 酒場の `relic-goblin-mine` の name「防護」→「防具」 | (3f) | (3f) | 0 |
| `relic11`(装置の検算) | 沼の伝承の品から relic を外す(11 件) | exit 3 | (0a) で「11 件 (期待 12)」と出して止まる | **3**(期待どおり) |

- 担当外の巻き込みは `grantall`(3 箱とも付与するので、付与の数を数える節が全部赤 = 当然)と `goldmix`((4a) は reward の不変も見ている)だけ。

#### (5) 既存 golden の非退行(素の走行・直列・port 10760 から 2 刻み・`run_after4.ps1`)2026-11-06 08:48〜09:15

| ドライバ | exit | 集計 | 基準との比較 |
|---|---|---|---|
| `driver_mapdef_step2` | 0 | 74/74 | 同じ |
| `driver_sce1_events` | 1 | 211/214 | FAILED の集合 = (2)/(4d)/(N2-隣)= 着手前と同じ(増えていない)|
| `verify_corner_check` | 0 | 20/20 | 同じ |
| `verify_kobold_warren` | 0 | 21/21 | 同じ |
| `verify_lore_check` | 0 | 26/26 | 同じ |
| `verify_road_ambush` | 0 | 41/41 | 同じ |
| `verify_road_boon` | 0 | 20/20 | 同じ |
| `verify_road_events` | 0 | 25/25 | 同じ |
| `verify_witch_hut` | 0 | 29/29 | 同じ |
| `verify_run_chronicle` | 0 | 74/0/0 | 同じ |
| `verify_plaza_curio` | 0 | 28/28 | 同じ(項目 3 の言い直しが生きている)|
| `verify_plaza_map` | 0 | 43/43 | 同じ |
| `verify_save_slots` | 0 | 30/30 | 同じ |
| `driver_equip_compact_ios` | 0 | 31/31 | 同じ |
| `driver_dev_gate2` | 0 | 62/62 | 同じ |
| `verify_sheet_equip` | 0 | 21/21 | 同じ |
| `verify_prep_retire` | 0 | 30/30 | 同じ |

- ⇒ 項目 4 で言い直した golden = **0 本**。

### 12-5. まとめ(#108 完了)

| 項目 | コミット | 中身 |
|---|---|---|
| 1 | `f305f5e` | 着手前の実測(基準 `5211ab0`)。古物商が `gated` だけでは伝承の品を外せないことを見つけた |
| 2 | `f5d52f5` | クリア時の宝箱 3 つ(抽選と付与の分離・伝承の品 11 品 + ガントレットに relic・撤退 `?clearchest=0`)+ changelog |
| 3 | `614270e` | 隠し要素の印(relicP 0.04 → 0.20)・酒場の伝承の品(紫/青・「伝承」+ 行き先・古物商から除外)+ `verify_plaza_curio` の言い直し + changelog |
| 4 | (このコミット) | 受入 `tools/verify_clear_chests.js`(21 判定・変異 7 + 装置の検算 1)・既存 golden 17 本の非退行(言い直し 0)|

- 残り = **§9 実機**(iPhone 縦持ちで 3 箱が横に収まるか・押しやすさ・紫の光の柱の重さ・酒場の装身具チップの紫/青と下の行)と **push(ユーザー判断)**。
- 確率・金貨の額(0.04 / 0.20 / 0.10 / 20〜50G)と伝承の品の数値は仮のまま(プレイテストで動かす)。森のグローブ + クロークで矢の回避が 1.05 になる件はユーザー決定でそのまま(2026-11-06)。
