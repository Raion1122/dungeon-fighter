# #108 クリア時の 3 つの宝箱 + 伝承の品(行き先ごとの専用品・青/紫の色分け)

- **起草**: 2026-11-04(計画窓) / **ステータス**: **承認済**(2026-11-04 ユーザー承認)
- **着手**: ⏸ **保留 — #107(霜の巨人の砦)の着地待ち**(2026-11-04)。`index.html` の `showResult` まわりを #107 が触っているため。着地したら §2-10 で行番号を測り直してから入る
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

### 2-1. 今のクリア報酬の流れ(`index.html`)

| 行 | 何 |
|---|---|
| 3724-3728 | `ROAD_CHEST_ON`(#87)。玄室宝箱・隠し宝箱・廃坑 n1 の寄り道を止めている。残るのは森の鍵束の宝箱と竜の巣の財宝だけ |
| 3739-3756 | `ROAD_CHEST_GOLD`(消えた宝箱 1 個 = 25G をクリア金貨へ)・`roadChestBonusGold()` |
| 26304 | `MAGIC_DROP_CLEAR_CHANCE = 0.01` |
| 26313 | `findAccessoryRecipient(accId)` = 空き枠のあるリーダー → 仲間(classKey 無しの一時ユニットは除外)|
| 26366 | `markGatedOwned(name)` |
| 26377-26465 | `rollMagicItemDrop()` |
| 44014 | `function showResult(win)` |
| 44042 | `earnedGold = coins + clearGold + roadChestGold` |
| 44048-44050 | `clearChance` → `clearMagicItem = (Math.random() < clearChance) ? rollMagicItemDrop() : null` |
| 44065-44087 | 金貨・装備・XP・アクセサリーを **同期的に** localStorage へ保存 |
| 44098-44108 | `reward = { gold, totalGold, newWeapon, newArmor, earnedXp, ... }` |
| 44109-44134 | `resultReward.innerHTML` を組み立てる(`✨ 宝物発見` の行は 44124)|
| 44162 | `resultOverlayEl.classList.add("show")` |
| 44165-44178 | `sessionStorage "dragonfighters.lastResult"` に `{ scenarioId, ..., reward, chronicle, roster }` |
| 44180-44185 | `resultBtn` の click → `dfReturnPage()` へ即遷移(竜の巣はエンディングへ)|

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
- **効果は既存の配線のキーだけ**: `avoidAll` / `avoidArrow` / `freeAction` / `fireResist` / `hpBonus` / `undeadDR` / `skillBonus` / `dmgBonus` / `acBonus` / `saveBonus`(14836-14880 の既存アクセが使っているもの)。**新しい効果の配線は 0 本**
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

- index.html:14860 と tavern.html:7131 の既存の行に `relic: "frost-hold"` を**足すだけ**。id / name / 効果 / rarity は変えない。
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

(実装窓が埋める)
