# #97 闇市の薬屋と杖屋 — ポーション・ワンド・パールと、SRD の後継品

- **起草**: 2026-10-20(起草窓) / **ステータス**: **承認済**(2026-10-21 ユーザー承認)
- **触るファイル**: `index.html`(品の表・効き目の口 3 つ・後継品 3 つの効き目・撤退スイッチ)/ `tavern.html`(品の表の写し・在庫の抽選・持てる本数の上限・開発用の陳列・門番の文言 + changelog)/ `tools/verify_plaza_srd.js`(新規)/ 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: なし(並走している窓なし。2026-10-20 `git status` = clean・HEAD `3ca8938`)

---

## 1. 目的

闇市(ポドルプラザ)の大改修の **段 1**。闇市の棚を D&D 5e SRD 5.1 の「飲む・使う」品で組み直す。

- 今の一般品 4 つ(影渡りの薬・牙の護符・呪われた曲刀・セリアの手鏡)は、**すべて独自品**。
- このゲームには**回復薬が 1 本も無い**。ワンドオブマジックミサイル・パールオブパワーも無い。

地下街の地図(段 2・#98 予定)ができたときに、露店に並べる物を先にそろえておく。今回は今の闇市のパネルに並べる。

**ユーザー決定(2026-10-20・会議記録 `dev-meetings/2026-10-20_plaza-undercity.md` + 本起草での確認)**:

- 会議: 候補③(地図と品を 3 段で)+ **独自品も全部見直す**。段 1 = 薬屋と杖屋。魔法とアイテム 4 本の ③ポーション・④ワンドとパールは、この段 1 に入れる。
- 起草での確認(4 件とも推奨案):
  1. **一般品 4 つは SRD の後継品へ置き換える**。古い 4 つは店に並べなくするが、**持っている分は今までどおり使える**(セーブを壊さない)。
     - 影渡りの薬 → ポーションオブインビジビリティ
     - 呪われた曲刀 → オイルオブシャープネス
     - セリアの手鏡 → ダストオブスニージングアンドチョーキング
     - 牙の護符 → 後継なし(SRD に合う品が無い)
  2. **目玉 4 品の名前を SRD の英名の音写しにそろえる**(効き目と id は変えない)。
     - スペルターニングリング → リングオブスペルターニング
     - ポリモーフ(変装)の杖 → ワンドオブポリモーフ
     - スクロール・オブ・クリエイトゴーレム → マニュアルオブゴーレムズ
     - スクロール・オブ・アニメイトデッド → スペルスクロール(アニメイトデッド)
  3. **ポーションは手番を使って飲む**。HP が半分を切った人が、自分の手番の頭で飲む。その手番は攻撃しない(D&D どおり)。主人公も仲間も同じ。
  4. 闇クエストの珍しい依頼 2 種(単眼の暴君・隊商護衛)の出現率 1.0 は**今回は触らない**(`tavern.html:10224` / `:10234`)。
- 不採用:
  - 名前だけ SRD に寄せて効き目は独自のまま。
  - 独自品 4 つを並べたまま SRD 品を足すだけ。
  - 手番を使わずに飲む(強く、D&D から外れる)。

---

## 2. 着手前の実測(起草窓が本番コードで確かめた事実・基準 `3ca8938`)

### 2-1. 闇市の品の表と、持ち物の仕組み

| ファイル:行 | 何 |
|---|---|
| `index.html:14593` `PLAZA_ITEMS` / `:14609` `PLAZA_ITEMS_COMMON` | 目玉 4 + 一般 4 の表。⚠ `tavern.html:5561` `PLAZA_ITEMS_TV` / `:5577` `PLAZA_ITEMS_COMMON_TV` と**中身が一字一句同じ二重定義**(手で同期) |
| `index.html:14630` `addChargeItem` / `:14636` `consumeCharge` / `:14645` `countCharges` | 持ち物 `dragonfighters.plazaInventory` = `{ id: [残り回数, …] }`(1 個体 = 配列の 1 要素・古い順に使う・0 で消える)。**id で持つ** ⇒ 名前を変えてもセーブは壊れない |
| `tavern.html:10391` `refreshPlazaStock` | 在庫 = 一般から 3〜5 品(無作為)+ 目玉(リング / ゴーレム / アンデッド)から 1〜2 品 + ポリモーフの杖(常設) |
| `tavern.html:10411` `onPlazaBuy` | 牙貨を払って `addChargeItemTV`。**持てる数の上限は無い** |
| `tavern.html:10425` `renderPlazaShop` | 名前・回数・効き目の文・所持数・値段・購入ボタン |

- ⭐ `consumeTrigger` の文字列(`onBattleStartAuto` など)は**どこからも読まれていない飾り**。効き目は、id を名指しした関数が持つ。

### 2-2. 一般品 4 つの効き目(後継品はこれを流用する)

| 品 | 効き目の関数(`index.html`) | 誰に・いつ | 読む口 |
|---|---|---|---|
| 影渡りの薬 `potion_shadow` | `applyBattleStartConsumables` `:22593` | 戦闘の始め・盗賊系が居るときだけ。盗賊系に `shadowAcBonus = 4` | 主人公 AC `:24309` / 仲間 AC `:24317`(⭐ **盗賊に限らずどの人にも効く**作り。盗賊に絞っているのは消費の条件だけ) |
| 呪われた曲刀 `cursed_blade` | 同上 `:22606` | 戦闘の始め・いつでも。主人公に `cursedBladeAtkBonus = 4` + 勝利時に 1d4 の代償(`applyCursedBladeEndCost` `:22649`、呼び口 `:23023`) | 命中 `currentPlayerAtkBonus` `:24289` だけ(ダメージには乗らない) |
| セリアの手鏡 `medusa_mirror` | 同上 `:22613` | 戦闘の始め・非ボスの敵が 2 体以上。全員 `stunned = 3`(セーヴ無し) | ターンループの既存の `stunned` |
| 牙の護符 `fang_charm` | `tryNegatePreemptive` `:22630`(呼び口 `:22846`) | 先制されたとき。先制した敵を 1 ターン止める | 同上 |

- 呼び口は `runEncounter` の中の `:22845 applyBattleStartConsumables();` と `:22846 tryNegatePreemptive(units);` の 2 行。
- 主人公のバフの片付けは `resetPlayerBuffs` `:24056`(`:24083-24085` で 3 欄を 0 へ)。仲間は `:22295`。

### 2-3. 効き目の口 3 つの差し込み先

| 口 | 差し込み先 | 根拠 |
|---|---|---|
| **ポーションを飲む**(主人公) | `playerAttackTurn` の、粘着(ミミック)の判定 `:34752` の**後**・射程の事前判定 `:34768` の**前** | この位置より前は「手番を飛ばす」判定が並ぶ(息切れ・混乱・眠り・暴走・粘着)。動けない人は飲めない |
| **ポーションを飲む**(仲間) | `allyAttackTurn` `:32048` の、混乱(暴走)の判定の後・`:32102 // クラス別 AI 分岐` の前 | 同上(スタン・混乱・暴走の後) |
| **ワンドを振る**(仲間の魔法使い) | `mageAI` の最後 `:32411 // 呪文撃たない判断 → スリングで通常攻撃` の `return false;` の前 | 攻撃呪文が 1 つも撃てないときにここへ落ちる |
| **ワンドを振る**(主人公が魔法使い) | `playerAttackTurn` の `:34845 const choices = ["normal", ...activeEquipped];` の前 | 攻撃呪文の枠が尽きると、候補が通常攻撃だけになる |
| **パールで枠を戻す** | `applyRoomClearHeal` `:28890` の中、既存の `restoreLowestSlot` の後 | 勝利(非ボス)と休憩ノードで呼ばれる。ボス部屋では先頭の `if (window.__inBossRoom) return;` で抜ける |

### 2-4. ⚠⚠⚠ 罠 A — `allyMagicMissile` は「撃った」か「前進しただけ」かを返さない

`allyMagicMissile`(`:29868`)は、射程外か壁越しのとき `allyAdvanceTowardPoint` で前進して `return;` する。撃ったときも同じく何も返さない。
⇒ ワンドの回数を `consumeCharge` で減らす**前に**、同じ射程(`getRange(MAGE_SKILLS["magic-missile"].range).tiles`)と視線(`hasLineOfSight`)を自分で確かめる。届かなければワンドを使わず、従来どおりスリングへ落とす。

- 枠の扱い: `allyMagicMissile` は `spellSlots["magic-missile"]` が 0 なら 0 のまま減らさない(`Math.max(0, …)`)。⇒ 枠が 0 の魔法使いが撃っても枠は壊れない。
- 主人公: `makeLeaderActor()` は `spellSlots: currentSpellSlots` を**参照で**持つ(`:20949` の関数の 20 行目)。⇒ 主人公も `allyMagicMissile(makeLeaderActor(), targetIdx)` で同じように撃てる(`executeSkillOn` の `:21172` と同じ形)。

⭐ §8 の負のコントロール `wandadvance`(届かないのにワンドの回数を減らす変異)で守る。

### 2-5. ⚠⚠ 罠 B — 持っていないときは乱数を 1 つも引かない

手番の頭のポーションの判定と、戦闘の始めの後継品の判定は、**全員の手番・全部の戦闘**を通る。持っていない人の乱数がずれると、乱数の列で固定している既存の受入が揺れる。
⇒ 判定はいつも `hasChargeItem(id)` を**最初に**見る。持っていなければ、乱数も DOM も触らずに抜ける。ダイスを振るのは、実際に飲む・使うときだけ。

⭐ 負のコントロール `rngleak`(持っていないのに `Math.random()` を 1 回引く変異)は、§8 (1a) で赤くなる。

### 2-6. ⚠⚠ 罠 C — 古い 4 品の id を消すと、持っている人の品が消える

持ち物は id で持っている(§2-1)。表から `potion_shadow` などの行を消すと、`plazaItemDef` が `null` を返し、店の「所持」表示も効き目の関数も黙って止まる。
⇒ 古い 4 行は**表に残し**、`retired: true` を付ける。在庫の抽選だけがこの旗で外す。効き目の関数(`applyBattleStartConsumables` の 3 枝・`tryNegatePreemptive`)は**1 文字も変えない**。

⭐ 負のコントロール `retiredshow`(在庫の抽選が `retired` を見ない変異)は §8 (5b) で赤くなる。

### 2-7. 文言に残っている古い名前(目玉 4 品の改名)

| ファイル:行 | 文言 | 今回 |
|---|---|---|
| `index.html:14569` / `:14570` | 「🪄 ポリモーフの杖 を手に入れた!」/「入手: ポリモーフの杖 — …」 | 「ワンドオブポリモーフ」へ |
| `tavern.html:10124` | 門番の語り「…『ポリモーフの杖』が見つかるという噂だ——」 | 同上 |
| `index.html:34996` / `:34998` | 「✨ スペルターニング! 呪文反射 …」/ 語り「…スペルターニングの指輪が燐光を放った」 | **触らない**(どちらも新しい名前と矛盾しない短い呼び方) |
| `index.html:15024-15030` 召喚の選択肢 | ラベルは呼ばれるユニットの名前(「ゴーレム兵」) | 触らない(品の名前を出していない) |

- 音声の台本 `voicevox-pipeline/data/script.json` には、4 品の名前が 1 つも無い(grep 0 件)⇒ 音声は作り直さなくてよい。

### 2-8. 既存の受入が持つアンカー(`grep -l` 2026-10-20)

| 触るもの | 掴む本 |
|---|---|
| `PLAZA_ITEMS_TV` / `PLAZA_ITEMS_COMMON_TV` | `verify_save_slots`(id の一覧を表から**導く**ので、行が増えても追従する) |
| `currentPlayerAtkBonus` | `verify_sheet_equip`(装備で ±1 の差を見る。オイルの欄は 0 の既定のまま) |
| `applyRoomClearHeal` | `driver_graph_kinds` の変異 `norestheal` が、休憩ノードの呼び口 `:39598` の 1 行を**逐語**で掴む ⇒ ⛔ その行は変えない(関数の中だけ触る) |
| `ring_spell_turning` / `wand_polymorph`(id) | `verify_enemy_traits` / `verify_counterspell` / `verify_town_map`(id だけ。名前は見ない) |
| `mageAI` | `driver_action_priority` / `verify_aoe_coverage` / `verify_cone_cast` / `verify_lore_check` |
| HP を書く点 | `verify_run_chronicle` (0c) は HP を**引く**書き方(`hp -=` / `hp = Math.max(0, … hp -`)だけを数える ⇒ ポーションの回復(足す)は数に入らない。⛔ 回復を `Math.max(0, …)` の形で書かない |

- 品の名前を文字で持つテストは 0 本。闇市の店の DOM を掴むテストも 0 本。

### 2-9. ⚠ 改行は両ファイルとも CRLF

`index.html` 42,467 行・`tavern.html` 11,504 行とも、全行が CRLF(`py` でバイトを数えた)。⇒ 編集は行末を保つ書き方で行う(メモリ「CRLF が LF に化ける」の作法)。

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。書ける要約は実在する(§10)。

**再測定コマンド**(着手前にもう一度):

    grep -n "const PLAZA_ITEMS\|function applyBattleStartConsumables\|function tryNegatePreemptive\|function currentPlayerAtkBonus\|function currentPlayerDmgBonus\|function getFireResistMult\|async function applyRoomClearHeal\|async function allyMagicMissile\|async function mageAI\|async function allyAttackTurn\|async function playerAttackTurn" index.html
    grep -n "const PLAZA_ITEMS_TV\|const PLAZA_ITEMS_COMMON_TV\|function refreshPlazaStock()\|function onPlazaBuy\|function renderPlazaShop\|const DF_DEV_MAGIC_SHOP" tavern.html
    grep -rln "PLAZA_ITEMS\|applyRoomClearHeal\|currentPlayerAtkBonus\|getFireResistMult" tools/

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 品の表(新しい 8 行 + 古い 4 行に `retired` + 目玉 4 品の `name` / `effect`)/ 撤退スイッチ `isPlazaSrdOn()` / ポーションの口(手番の頭 2 か所)/ ワンドの口(`mageAI` と主人公の 2 か所)/ パールの口(`applyRoomClearHeal` の中)/ 後継品 3 つ(`applyBattleStartConsumables` の隣に新しい関数を 1 本)/ オイルの欄(`currentPlayerAtkBonus` / `currentPlayerDmgBonus` / `resetPlayerBuffs`)/ 薬の炎の軽減(`getFireResistMult`)/ 杖の文言 2 行 |
| `tavern.html` | 品の表の写し / 在庫の抽選(`retired` を外す・新しい品を足す・ヒーリングは常設)/ 持てる本数の上限(`onPlazaBuy` と `renderPlazaShop`)/ 開発用の陳列 / 撤退スイッチ `isPlazaSrdOnTV()` / 門番の文言 1 行 / changelog 1 行 |
| `tools/verify_plaza_srd.js` | 新規(port **10636**) |
| `実装依頼書/README.md` | 完了時に #97 の行を更新 |

---

## 4. STEP1 — 品の表と撤退スイッチ(両ファイル)

### 4-1. 撤退スイッチ(`index.html` は `isClericSpiritOn` の近く / `tavern.html` は `isClericSpiritOnTV` の隣)

    /* ★[#97] 撤退スイッチ ?plazasrd=0 — 闇市の棚を着手前 (3ca8938) の品ぞろえへ戻す + 新しい品の効き目の口を閉じる。
     * ⚠ const に畳まず関数にする (TDZ 回避)。各ページが独立に読む (遷移はまたがない)。
     * ⚠ 目玉 4 品の名前は戻さない (表示名だけ・id と効き目は同じ)。 */
    function isPlazaSrdOn() {
      try { return new URLSearchParams(window.location.search).get("plazasrd") !== "0"; }
      catch (e) { return true; }
    }

### 4-2. 新しい品(`PLAZA_ITEMS_COMMON` と `PLAZA_ITEMS` に足す・両ファイル同じ中身)

| id | 名前 | 表 | 回数 | 値段(牙貨) | 効き目(5e SRD を元に) |
|---|---|---|---|---|---|
| `potion_healing` | ポーションオブヒーリング | 一般・**常設** | 1 | 3 | HP が半分を切った人が手番を使って飲む。**2d4+2** 回復 |
| `potion_greater_healing` | ポーションオブグレーターヒーリング | 一般 | 1 | 8 | 同上。**4d4+4** 回復 |
| `potion_fire_resistance` | ポーションオブファイアレジスタンス | 一般 | 1 | 5 | 戦闘の始め、炎を使う敵が居るとき、主人公が飲む。その戦闘の間、炎のダメージ半分 |
| `potion_invisibility` | ポーションオブインビジビリティ | 一般 | 1 | 5 | 戦闘の始め、ボスが居るか敵が 3 体以上のとき、主人公が飲む。その戦闘の間、AC +4(影渡りの薬の `shadowAcBonus` を流用) |
| `oil_of_sharpness` | オイルオブシャープネス | 一般 | 1 | 7 | 戦闘の始め、ボスが居るか敵が 3 体以上のとき、主人公の武器に塗る。その戦闘の間、命中 **+3** とダメージ **+3** |
| `dust_sneezing_choking` | ダストオブスニージングアンドチョーキング | 一般 | 1 | 15 | 戦闘の始め、非ボスの敵が 2 体以上のとき撒く。非ボスの敵ごとに CON セーヴ(`d20() + (def.con \|\| 0)` vs **DC 15**)、失敗で `stunned = 3` |
| `wand_magic_missiles` | ワンドオブマジックミサイル | 目玉 | **7** | 12 | 魔法使い(主人公・仲間)が攻撃呪文を 1 つも撃てないとき、マジックミサイル(1 レベル = 3 本)を 1 回ずつ撃つ |
| `pearl_of_power` | パールオブパワー | 目玉 | **3** | 15 | 部屋クリア(非ボス)と休憩ノードで、使い切った枠のうち一番重い呪文を 1 つ戻す |

- 一般品の `tier`: ヒーリング 1 / グレーター 2 / ファイアレジスタンス 1 / インビジビリティ 1 / オイル 2 / ダスト 3。目玉: ワンド 2 / パール 3。
- `effect` は今の書き方にそろえ、いつ自動で使うかを書く(例: 「HP が半分を切ると、その人が手番を使って飲む。2d4+2 回復。」)。
- ⚠ 値段と回数は起草窓が決めた初期値。数値は受入で縛らない(§8 の「測らないこと」)。

### 4-3. 古い一般品 4 つ(`retired`)

- 4 行に `retired: true` を足す。⛔ 行は消さない・id を変えない(§2-6 罠 C)。
- `effect` の文頭に「(取り扱い終了・手持ちは使える)」を足してよい。

### 4-4. 目玉 4 品の改名(`name` と `effect` だけ)

- `ring_spell_turning`: リングオブスペルターニング
- `wand_polymorph`: ワンドオブポリモーフ
- `scroll_create_golem`: マニュアルオブゴーレムズ(`effect` を「ゴーレムを組み上げる手引き書。…」に)
- `scroll_animate_dead`: スペルスクロール(アニメイトデッド)
- 杖の文言 3 行(§2-7)を新しい名前へ。

---

## 5. STEP2 — 効き目の口(`index.html`)

すべて、最初に `isPlazaSrdOn() && hasChargeItem(id)` を見る(§2-5 罠 B)。

### 5-1. ポーションを飲む `tryDrinkHealingPotion(unit)`

- 対象: 主人公(`hp > 0 && hp < maxHp / 2`)と仲間(`a.alive && a.hp < a.maxHp / 2` かつ **`!a.isSummon`**)。
- どちらを飲むか: 足りない HP が 15 以上で、グレーターを持っていればグレーター。そうでなければヒーリング。片方しか無ければそれ。
- 回復: `hp = Math.min(maxHp, hp + gain)` / `a.hp = Math.min(a.maxHp, a.hp + gain)`。`showHealAt` で数字、`flashAction(el, "skill")`、バナー「🧪 ポーションオブヒーリング! +N」、`updateInfo` 1 行。
- 飲んだら **`true` を返し、呼び口はその手番を終える**(`return;`)。⭐ 負のコントロール `turnfree`(飲んでも手番を続ける変異)で守る。
- 呼び口 2 か所(§2-3)。

### 5-2. ワンドを振る `tryWandMagicMissile(actor, unit, targetIdx)`

- 条件: 魔法使い + 攻撃呪文(`mageAI` の `attackSpells` と同じ 7 つ)の枠が全部 0 + `hasChargeItem("wand_magic_missiles")`。
- 対象: 仲間 = `mageAI` が選んだ最寄りの敵 / 主人公 = `targetIdx`。
- ⛔ 回数を減らす前に、射程と視線を確かめる(§2-4 罠 A)。届かなければ `false`(呼び口は従来どおり)。
- 届くなら `consumeCharge` → `allyMagicMissile(actor, targetIdx)` → バナー「🪄 ワンドオブマジックミサイル(残 N)」→ `true`。
- 仲間: `mageAI` の `:32411` の `return false;` の前で `if (await tryWandMagicMissile(ally, ally, tgt)) return true;`。
- 主人公: `:34845` の前で、`leaderClassKey === "mage"` のときだけ試す。撃ったら `return;`。⚠ 撃たない限り `pickLeaderAction` の乱数 1 回は今までどおり引く。

### 5-3. パールで枠を戻す(`applyRoomClearHeal` の中)

- 既存の HP と最低位の枠の回復が終わった後に、`hasChargeItem("pearl_of_power")` なら 1 回だけ試す。
- 主人公(魔法使い・僧侶・エルフ)→ 仲間の順で、使い切った枠(`cur < max`)を持つ最初の人を探す。その人の、**一番位の高い**(`levelReq × 1000 + mpCost` が最大の)減った呪文を +1 する。
- 見つかったときだけ `consumeCharge`。バナー「⚪ パールオブパワー! ○○の△△が戻った」。
- ⛔ 休憩ノードの呼び口 `:39598` の行は変えない(`driver_graph_kinds` のアンカー)。
- ⭐ 負のコントロール `pearllow`(一番位の低い呪文を戻す変異)で守る。

### 5-4. 後継品 3 つ `applyBattleStartSrdConsumables()`(`applyBattleStartConsumables` の隣に新しく置く)

- 呼び口: `:22845` の次の行に 1 行足す。⛔ 既存の 2 行は変えない。
- 使う条件の「ボスが居るか敵が 3 体以上」は `encounterEnemyIndices` の生きた敵で数える。「炎を使う敵」は、`def.breathDice` を持つか、`def.spells` に `fireBolt` / `scorchingRay` / `fireball` があるか。
- **ファイアレジスタンス**: `playerBuffs.fireResistPotion = true` → `getFireResistMult` に「`unit === "player" && playerBuffs.fireResistPotion` なら 0.5 と比べて小さい方」を 1 行足す(呼び口 4 か所すべてに効く)。⚠ 帯(`sovereignSuppressed`)の上では効かない作りは先頭の 1 行がそのまま守る。
- **インビジビリティ**: `playerBuffs.shadowAcBonus = Math.max(playerBuffs.shadowAcBonus || 0, 4)`(影渡りの薬と重ねない)。
- **オイル**: `playerBuffs.oilSharpnessBonus = 3`。`currentPlayerAtkBonus` と `currentPlayerDmgBonus` に `(onRay ? 0 : (playerBuffs.oilSharpnessBonus || 0))` を 1 項ずつ足す。⭐ 負のコントロール `oilnodmg`(ダメージに足さない変異)で守る。
- **ダスト**: 非ボスの生きた敵ごとに CON セーヴ。失敗した敵だけ `stunned = Math.max(stunned, 3)` と `showRollAtEnemy` の札(`CHOKING`)。1 体も失敗しなくても 1 つ使う。
- 片付け: `resetPlayerBuffs`(`:24083-24085` の並び)に `fireResistPotion = false` / `oilSharpnessBonus = 0` を足す。`playerBuffs` の初期値(`:24052` 付近)にも同じ 2 欄を足す。

---

## 6. STEP3 — 酒場の店(`tavern.html`)

- `refreshPlazaStock`:
  - 一般の候補は `retired` を外す。
  - `potion_healing` は**常設**(`kind: "always"`・ポリモーフの杖と同じく売り切れない)にし、無作為の候補からは外す。
  - 目玉の候補にワンドとパールを足す(5 つから 1〜2)。
  - `?plazasrd=0` のときは、着手前と同じ候補(古い 4 + 目玉 3)と同じ引き方にする。
- **持てる本数の上限**: ポーション 4 種(`potion_*`)は、種類ごとに**個体 3 つまで**。`onPlazaBuy` は上限で買わない。`renderPlazaShop` は購入ボタンを無効にして「所持上限」と出す。⭐ 負のコントロール `nocap` で守る。
- **開発用の陳列**(恒久ルール「新しいアイテムは開発用の店に 1G で並べる」の闇市版): `DF_DEV_MAGIC_SHOP`(`:5091`)が真のとき、新しい品 8 つを `kind: "dev"` で並べ、値段は **1 牙貨**。売り切れない。
- 撤退スイッチ `isPlazaSrdOnTV()`。門番の文言(`:10124`)を新しい名前へ。

---

## 7. 撤退スイッチ

- **`?plazasrd=0`** — 闇市の在庫が着手前と同じ品ぞろえ・同じ引き方に戻る。新しい品 8 つの効き目の口(ポーション・ワンド・パール・後継品 3 つ)が全部閉じる。開発用の陳列も出ない。
- ⚠ 判定位置: `index.html` = `isPlazaSrdOn()`、`tavern.html` = `isPlazaSrdOnTV()`。**ページ遷移はまたがない**(各ページが独立に読む)。
- ⚠ 目玉 4 品の名前は戻らない(表示名だけ)。買った新しい品は持ち物に残るが、撤退中は使われない。

---

## 8. 受入条件 — `tools/verify_plaza_srd.js`(新規・port 10636)

**方針**: 本番のページを実 Chrome(`puppeteer-core`)で開く。

- `index.html` 側: `window.__plaza.addChargeItem` で持ち物を仕込み、主人公と仲間の HP・枠・敵の盤面を組んでから、関数を直叩きする(`playerAttackTurn` / `allyAttackTurn` / `mageAI` / `applyRoomClearHeal` / `applyBattleStartSrdConsumables`)。
- 演出の待ちは `sleepMs` を潰す(`driver_speech_boss.js:132` の作法)。
- `tavern.html` 側: `refreshPlazaStock` / `onPlazaBuy` / `renderPlazaShop` を直叩きし、在庫と DOM を読む。
- ⛔ 実戦でどれだけ使われるかの頻度は測らない(§9)。

### §0 装置

- **(0a)** 新しい 8 品が両ファイルの表に在る(`plazaItemDef` / `plazaItemDefTV`)/ 古い 4 品が `retired: true` で在る / 目玉 4 品の名前が新しい。⭐ これが無いと全 assert が空振りで永久緑になる。
- **(0b)** 両ファイルの表が、id ごとに `name` / `maxCharges` / `price` / `tier` / `retired` で一致する(ソースのバイトから読む)。
- **(0c)** 仕込んだ持ち物が `countCharges` で読める。

### §1 ポーション

- **(1a)** ⭐ 持っていない主人公と仲間の手番を、同じ乱数の列で 2 回(素 / 着手前の木の同じ関数)回し、乱数の総回数と被弾の値が同じ(罠 B)。
- **(1b)** HP が半分未満の主人公が、自分の手番でヒーリングを飲む → HP が 2d4+2 だけ増える(乱数を固定してドライバが期待値を計算)・持ち物が 1 減る・**その手番は攻撃しない**(敵の HP が変わらない)。
- **(1c)** 足りない HP が 15 以上でグレーターを持っていればグレーター、そうでなければヒーリングを選ぶ。
- **(1d)** HP が半分以上なら飲まない。召喚のユニット(`isSummon`)は飲まない。眠り・スタン中は飲まない(手番を飛ばす判定が先)。

### §2 戦闘の始めの品

- **(2a)** ファイアレジスタンス: 炎を使う敵が居るときだけ飲む → `getFireResistMult("player")` が 0.5。居なければ飲まない。
- **(2b)** インビジビリティ: ボスか 3 体以上のときだけ → `currentPlayerAc()` が +4。
- **(2c)** オイル: 同じ条件で → `currentPlayerAtkBonus()` と `currentPlayerDmgBonus()` が両方 +3。戦闘の後の `resetPlayerBuffs` で 0。
- **(2d)** ダスト: 非ボスの敵 2 体以上のとき、セーヴの乱数を「失敗 / 成功」に固定した 2 体のうち失敗した方だけ `stunned = 3`。ボスは対象外。

### §3 ワンド

- **(3a)** 攻撃呪文の枠が全部 0 の仲間の魔法使い → `mageAI` がワンドで撃つ・ワンドが 1 減る・敵の HP が減る。
- **(3b)** 敵が射程外(または壁越し)→ ワンドは減らない・従来どおり(罠 A)。
- **(3c)** 攻撃呪文の枠が 1 つでも残っていればワンドは使わない。
- **(3d)** 主人公が魔法使いのときも同じ(撃てば `pickLeaderAction` を呼ばない・撃たなければ呼ぶ)。

### §4 パール

- **(4a)** 減った枠が 2 種類ある主人公 → 部屋クリアで、**位の高い方**だけ +1・パールが 1 減る。
- **(4b)** 減った枠が無ければパールは減らない。ボス部屋(`__inBossRoom`)では使わない。

### §5 店

- **(5a)** ポーション 4 種は 3 つまで買える。4 つ目は買えず、購入ボタンが無効で「所持上限」と出る。
- **(5b)** 在庫の抽選を 200 回回して、古い 4 品が 1 度も出ない。ヒーリングは毎回在る(常設)。新しい一般品・ワンド・パールはどれも 1 回以上出る。
- **(5c)** 開発モード(`__dfDevMode`)では新しい 8 品が 1 牙貨で並ぶ。素では並ばない。
- **(5d)** 古い 4 品を持っている人は、在庫に無くても今までどおり効く(例: 呪われた曲刀を持たせて戦闘を始めると、着手前と同じく `cursedBladeAtkBonus = 4`)。

### §6 撤退

- **(6a)** `?plazasrd=0` → 手番の頭でポーションを飲まない・ワンドもパールも後継品も使わない。
- **(6b)** `tavern.html?plazasrd=0` → 在庫の抽選 200 回で新しい品が 1 度も出ず、古い 4 品は出る。

### §9

- **(9a)** pageerror 0 件(両ページ)。

### ⛔ 測らないこと

- 実戦で何回使われるか(頻度と手触りは §9 の実機で)。
- 値段・回数・回復量の妥当性(§4-2 の初期値。数値は実機で動かす余地を残す)。
- 演出の見た目(色・バナーの文言の細部)。DOM の有無と数値だけを測る。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `rngleak` | 持っていないのに手番の頭で `Math.random()` を 1 回引く(罠 B) | (1a) |
| `turnfree` | 飲んでも手番を続けて攻撃する | (1b) |
| `wandadvance` | 射程を確かめずにワンドの回数を減らす(罠 A) | (3b) |
| `pearllow` | 一番位の低い呪文を戻す | (4a) |
| `oilnodmg` | オイルをダメージに足さない | (2c) |
| `nocap` | 持てる本数の上限を外す | (5a) |
| `retiredshow` | 在庫の抽選が `retired` を見ない(罠 C) | (5b) |
| `leak` | 撤退スイッチを効き目の口で見ない | (6a) |

### 既存 golden の非退行(実装後に必ず走らせる)

§2-8 の本(`verify_save_slots` / `verify_sheet_equip` / `driver_graph_kinds` / `verify_enemy_traits` / `verify_counterspell` / `verify_town_map` / `driver_action_priority` / `verify_aoe_coverage` / `verify_cone_cast` / `verify_lore_check` / `verify_run_chronicle`。`--negative` を持つものは neg も)。
`index.html` / `tavern.html` を触るので、#95 / #96 と同じく **母集団の全数走査**(#96 §12-3 の 228 腕 + `verify_plaza_srd` 素 / neg)を最後の項目で行う。

- ⚠ 基準の色は **項目 1 の先頭で控える**(着手前の `3ca8938` の色)。
- ⚠ #96 の完了時点で既知の非緑 = 20 腕(#96 §12-3)。`verify_lore_check` (1j) は直列でも揺れる(#96 K1)。
- ⭐ 変異アンカーの衝突は、全 tools の文字列リテラルを着手前と後で数え直して測る(#94〜#96 の方法)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須。闇市が解放済みのセーブで、開発モード(`tavern.html?dev=1`)で入ると、新しい品が 1 牙貨で並ぶ。

- HP が減った仲間がポーションを飲む瞬間が「助かった」と分かるか(緑の数字・バナー)。
- 手番を使って飲むことで、かえって押し負けていないか(強さの手触り)。
- 枠を使い切った魔法使いが、ワンドで撃ち続けるのが見えるか。
- 3 本の上限・値段が、牙貨の稼ぎに対してちょうどよいか。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>闇市に薬屋と杖屋</b> — 回復のポーションやワンドオブマジックミサイルなど、D&D の品が並ぶ。HP が減った仲間は自分でポーションを飲む。"

---

## 11. やらないこと

- ⛔ 地下街の地図(段 2・#98)。今回は今の闇市のパネルに並べる。
- ⛔ 装備品の独自品(聖別された剣など)の置き換えと、牙貨で装備品を買う橋渡し(段 3・#99)。
- ⛔ 珍しい闇クエスト 2 種の出現率 1.0 を戻すこと(ユーザー決定)。
- ⛔ 古い 4 品の行を表から消すこと・id を変えること(罠 C)。
- ⛔ 古い 4 品の効き目の関数を変えること(手持ちは今までどおり効く)。
- ⛔ 牙の護符の後継品。
- ⛔ `consumeTrigger` の文字列を実体に合わせる・消すこと(飾りのまま。別チケット候補)。
- ⛔ ポーションを仲間に飲ませる(5e の「他人に飲ませる」)。飲むのは本人だけ。
- ⛔ 音声の作り直し(台本に品の名前が無い)。
- `実装依頼書/README.md` へ足す行(承認時に起草窓が足す):

    | 97 | [2026-10-20_plaza-srd-shop.md](2026-10-20_plaza-srd-shop.md) | **承認済** | 0% | 闇市の薬屋と杖屋(闇市の大改修 段 1)= ポーション 4 種・オイル・ダスト・ワンドオブマジックミサイル・パールオブパワー + 目玉 4 品を SRD 名へ。⭐ 古い 4 品は `retired` で表に残す(id で持っているので消すと手持ちが消える)/ ⚠ `allyMagicMissile` は撃ったか前進したかを返さない ⇒ ワンドは射程を先に確かめる / ⚠ 持っていなければ乱数を引かない / ⚠ 休憩ノードの `applyRoomClearHeal` の呼び口は変えない。撤退 `?plazasrd=0`。受入 `tools/verify_plaza_srd.js`(port 10636) |

---

## 12. 実装結果

**ステータス: ✅ 完了(2026-10-21 実装窓・未 push)**。記録の詳細は `~/.claude/dev-loop/r97/notes97_item1.md` / `notes97_item2.md` / `notes97_item3.md`。

### 12-1. コミット

| commit | 内容 |
|---|---|
| `3868b5f` | 項目1 本番: 品の表(新 8 品 + 古い 4 品を `retired: true` で残す + 目玉 4 品を SRD 名へ)・撤退 `?plazasrd=0`(`isPlazaSrdOn` / 効き目の口は全部 `plazaSrdHas` を通る)・`applyBattleStartSrdConsumables`(`runEncounter` の既存 2 行の間に 1 行)・`tryDrinkHealingPotion`(主人公と仲間の手番の頭)・`tryWandMagicMissile`(`mageAI` の末尾と主人公の `pickLeaderAction` の前)・パール(`applyRoomClearHeal` の既存の回復の後)・`getFireResistMult` / `currentPlayerAtkBonus` / `currentPlayerDmgBonus` にポーションとオイルの項。`tavern.html` の表の写し・在庫の抽選(`retired` とヒーリングを外し、ヒーリングは常設)・ポーション 3 本の上限(`plazaAtCapTV`)・開発用の行 + changelog 1 行(§10 の文面どおり) |
| `8ad1982` | 項目2: 新規受入 `tools/verify_plaza_srd.js`(port 10636・素も変異も同じ port を順に・純 LF) |
| 本節のコミット | 項目3: 母集団の非退行(全数走査)+ 変異アンカーの衝突 + 本節 + README の #97 行 |

### 12-2. 受入の色と秒

| 走行 | 色 | 秒 |
|---|---|---|
| `verify_plaza_srd` 素 | **27/27** ×4(項目2)+ 全数走査の中で 1 回 27/27 | 18〜22 |
| `verify_plaza_srd --negative` | **8/8** ×2(項目2)+ 全数走査の中で 1 回 8/8。rngleak=(1a) / turnfree=(1b) / wandadvance=(3b) / pearllow=(4a) / oilnodmg=(2c) / nocap=(5a) / retiredshow=(5b) / leak=(6a)。巻き込みは rngleak の (1b)(1c) だけ = 乱数を列で固定して回復量を比べるので、頭で 1 つ余計に引くと列がずれる自然な連鎖 | 156〜160 |
| §8 の既存 golden 11 本(20 腕) | 項目1 で着手前(post96)と同色。`driver_graph_kinds` の norestheal のアンカー健在・`verify_run_chronicle` (0c) の HP を引く点は不変(回復は `Math.min` で足す書き方だけ) | — |
| 一時プローブ(コミットしない) | `r97/probe97.js` 26/26 ×3 | — |

assert の中身(27 本 = 23 ラベル・§8 の番号と 1 対 1):

| ラベル | 測ること(要点) |
|---|---|
| (0a) | 両ファイルの表に新 8 品(retired でない)/ 古 4 品 `retired: true` / 目玉 4 品の新しい名前 / 撤退スイッチと新しい関数 4 つ。赤なら以降を全部赤で打ち切る |
| (0b) | 配信バイトから表の塊を読み、id ごとに name / maxCharges / price / tier / retired を両ファイルで突き合わせ(16 品)+ 実行時の定義も一致 |
| (0c) | 盤面(goblin-mine の lane)が立つ・新 8 品 + 呪われた曲刀を仕込むと `countCharges` で読め、片付けで 0 |
| (1a) | 持ち物なしの主人公 → 仲間の手番を種 3 つで回し、新しい木と **着手前の木(`git show f7b427e:index.html` を同じ port で配る)** で乱数の総回数・敵 HP・両者 HP が完全一致 + `tryDrinkHealingPotion` の中で引いた乱数 0 |
| (1b)〜(1d) | 半分未満で飲む(2d4+2 をドライバが計算・持ち物 -1・その手番は攻撃しない)/ グレーターとの選び分け 4 通り / 半分ちょうど・召喚・眠り・スタンは飲まない |
| (2a)〜(2d) | 炎の敵が居るときだけ 0.5 / ボスか 3 体で AC +4 / 同条件で命中とダメージ +3・`resetPlayerBuffs` で 0 / ダストは失敗した非ボスだけ stunned 3・乱数 2 回 |
| (3a)〜(3d) | 枠 0 の仲間がワンドで撃つ / 11 マス・壁越しでは減らない / 枠が残れば使わない / 主人公は撃てば `pickLeaderAction` 0 回・撃たなければ 1 回 |
| (4a)(4b) | 位の高い枠だけ +1(主人公満タンなら仲間)/ 減った枠なし・ボス部屋では減らない |
| (5a)〜(5d) | 4 回買って 3 個・「所持上限」/ 抽選 200 回で古 4 品 0・ヒーリング常設・新品全部 1 回以上 / 開発モードだけ 8 品 1 牙貨 / 呪われた曲刀は着手前の木と同じ値 |
| (6a)(6b) | `?plazasrd=0` で効き目の口が全部閉じる / 酒場の抽選に新品 0・古 4 品は出る |
| (9a) | pageerror / console error 0 |

### 12-3. 母集団の非退行(全数走査)

- `index.html` / `tavern.html` = 全ページが踏むファイルなので全数。HEAD `8ad1982` で **230 腕・671.0 分**(2.92 分/腕)= #96 の post96 の 228 腕(同順)+ `verify_plaza_srd` 素 / neg。直列・SKIP 再開型(窓落ちなし・2026-10-21 07:57 → 19:09)。git を読む本(32 腕)は `git clone --shared @8ad1982`(本番と 939 ファイルのバイト差 0)で。8765 は走査中 LISTEN なし(post96 と同じ条件)。
- 結果: 緑 208 / 非緑 22。基準 post96(本番は `f7b427e` と index / tavern / audio が同一 = #97 の直前)と比べて 緑→赤 2・赤→緑 0・両方非緑 20・新規 2 腕は緑。
- **緑→赤 2 腕はどちらも #97 非帰属**:
  - `verify_tower_mother_b --negative`: 変異 intavern で担当外の (4a) が赤 = `index.html?towermother=0` の流れが制覇・帰還まで届かず `lastResult: null`(装置が観測できなかった型)。素は 22/22。本番で単独に再走 → **11/11 OK・担当外の赤 0・exit 0**。
  - `driver_monsters_griffon` 素: `grifRearMid=0/N`・`mino=0/1` = #72 で既知の非決定な本と同じ指紋。本番で単独 3 回 → 緑 2 / 赤 1。#97 の無い影(`f7b427e` の clone・本番との差は #97 の 3 ファイルだけ)と交互 4 組 → **本番 緑 1/4・影 緑 2/4**(影でも同じ型で赤)。構造面でも、まっさらなプロファイルの autoplay は闇市の持ち物 0 ⇒ #97 の口は全部 `plazaSrdHas` で閉じ、乱数も DOM も触らない((1a) で着手前の木と乱数の総回数まで一致)。
- 両方非緑の 20 腕は FAIL 行を集合で突き合わせ、18 腕は中身が同じ。DIFF 2 腕は `driver_mapdef_step1` (0b) = clone の commit の hash が違うだけ / `verify_codex_map_skill` (3a) = 焼き直しの件数 17 → 18(`3ca8938` の地下街の地図 = #97 の前の commit。NG の中身は同じ)。
- ⇒ **#97 帰属の緑→赤 = 0**。tools の言い直しなし。
- 変異アンカー衝突: 全 tools 202 ファイルの文字列リテラル 54,340 個を `f7b427e`→`8ad1982` の 3 ファイルで数え直した。件数が変わった 708 組のうち「1 だった / 1 になった / 0→出現」は 44 組で、38 組は `verify_plaza_srd` 自身(変異アンカー・撤退スイッチ・品 id・新しい名前)。残り 6 組は変異アンカーではない(`'missing'` = dict キー / 配列要素 / catch の戻り値 4 本、`' || 0) + 1)'` = hobgoblin / kobold の probe 注入文字列の部品 2 本。どれも index.html を検索・置換していない)⇒ **衝突 0**。

### 12-4. 崩れた主張・依頼書から変えた点(K 番号)

- 依頼書 §2 の再測定(基準 `3ca8938` の行番号まで)は全部一致 = **崩れた主張なし**。
- 補足 1: `currentPlayerDmgBonus` には `onRay` の変数が無かった ⇒ 関数の頭に `const onRay = sovereignSuppressed("player");` を 1 行足し、§5-4 と同じ `(onRay ? 0 : …)` の形にした。
- 補足 2(**依頼書に無い追加**): ワンドは反魔法の殻(shell)と光線の帯(ray)の上では使わない(`mageAI` の先頭と同じ扱い)。
- 補足 3: 在庫は `enterPlaza` が来訪のたびに引き直すので、古い在庫の移行処理は不要(足していない)。
- **K1**(port 8897 の共有): `verify_town_map` / `verify_run_chronicle` / `verify_party_four` / `verify_recruit_size` の 4 本が port 8897 を共有 ⇒ 並列に割ると EADDRINUSE で偽の赤(項目1 で 1 回踏んだ・#97 非帰属)。直列の全数走査では問題なし。
- **K2**(受入の作り方): 複数タブを開くドライバは、裏のタブで rAF が止まる ⇒ 主人公の通常攻撃(飛び道具の演出待ち)が終わらず 300 秒で FATAL になった。index の検査の前に `page.bringToFront()`、酒場の検査の前に `tv0.bringToFront()` で解決。⭐ 一般形 = rAF に乗る演出を待つ関数を叩く前に、そのタブを表へ戻す。
- 本番の欠陥: なし。

### 12-5. 別チケット候補

- K1 の port 8897 の共有をほどく(どれかの本を別 port へ)。
- `driver_monsters_griffon` (3)(4) と `verify_tower_mother_b` の (4a)(autoplay の流れが帰還まで届かない)の揺れ。どちらも「1 件も観測できなかった」型 = 観測数の下限を装置 assert として分けると、揺れと退行を見分けやすい。
- §11 の保留: 地下街の地図(段 2・#98)/ 装備品の独自品の置き換えと牙貨の橋渡し(段 3・#99)/ `consumeTrigger` の文字列の整理 / ボールトの更新(別 PC の宿題)。
- #96 からの持ち越し: `verify_lore_check` (1j) の揺れ(今回の 1 回は素 26/26・neg 12/12 で緑)/ `driver_grid_p8` (6d) など両方非緑の既知 20 腕。

### 12-6. 残り

- **§9 実機の確認**(`tavern.html?dev=1` の闇市で新しい品を 1 牙貨で買う): 仲間がポーションを飲む瞬間が分かるか / 手番を使って飲むことで押し負けていないか / 枠を使い切った魔法使いがワンドで撃ち続けるのが見えるか / 3 本の上限と値段が牙貨の稼ぎに合うか。
- 次の新規ドライバ base = **10637**。
