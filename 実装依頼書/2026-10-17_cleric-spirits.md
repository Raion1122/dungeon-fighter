# #95 僧侶の「戦う祈り」— スピリチュアルウェポン + スピリットガーディアンズ

- **起草**: 2026-10-17(起草窓) / **ステータス**: **承認済**(2026-10-17 ユーザー承認)
- **触るファイル**: `index.html`(2 呪文・ラウンド頭の登録簿・絵・AI・聖典・撤退スイッチ)/ `tavern.html`(写し 4 枚 + 開発用の棚 + changelog)/ `tools/verify_cleric_spirits.js`(新規)/ 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: なし(並走している窓なし。2026-10-17 `git status` = 会議記録 2 枚の未追跡だけ)

---

## 1. 目的

僧侶はボールトの設計書(`spells.md`)にある 10 呪文のうち **8 つが未実装**だ。本番の僧侶は、キュア系 4 段・ブレス・シールドオブフェイス・ストライキング・ターンアンデッド・ホールド・パーソンで組まれている。敵にダメージを与える呪文は **1 つも無い**(ターンアンデッドは止めるだけ・ホールドは金縛り)。「回復の大小を選ぶ人」から抜けられない。

5e SRD の僧侶の攻め手を 2 つ足す。

- **スピリチュアルウェポン**(霊の武器): 宙に浮く霊の武器が、毎ラウンド敵を打つ。
- **スピリットガーディアンズ**(守護霊): 僧侶の周りを守護霊が回り、近くの敵を毎ラウンド焼く。

どちらも「場に残って戦う」呪文だ。⛔ ただし **仲間ユニットにはしない**(§2-2 罠 A)。エルフのコードンオブアローと同じ「ラウンドの頭に回る登録簿」として作る。

**ユーザー決定(2026-10-17・開発会議 `dev-meetings/2026-10-17_new-spells-items.md`)**:

- 新しい魔法とアイテムの 4 候補を ①僧侶の戦う祈り → ②カウンタースペル → ③ポーション → ④ワンドとパール の順で全部進める。本チケットは ①。
- 会議の合意:
  - 集中(コンセントレーション)は入れない。代わりに **僧侶 1 人につき各 1 つまで**(掛け直しは上書き)。
  - アンデッド特効は付けない(5e の原文に無い)。
  - 単眼の暴君の反魔法の中では止まる。
  - 絵は既存の作り(CSS)で作る。
  - 入手は聖典(霊の武器 = uncommon / 守護霊 = rare)。
  - 依頼書は 1 枚・3 項目。
- 不採用:
  - 霊の武器を本物の仲間ユニットとして召喚する(§2-2 罠 A)。
  - 守護霊を張った僧侶を前へ出す AI(隊列の作法とぶつかる・重い)。
  - 集中の導入(ブレス・シールドオブフェイスの既存の挙動まで変わる)。

---

## 2. 着手前の実測(起草窓が本番コードで確かめた事実・基準 `e5a3e1c`)

### 2-1. 呪文 1 つを足すときの定位置(`index.html`・全数)

| ファイル:行 | 何 | 今回すること |
|---|---|---|
| `index.html:22988` `CLERIC_SKILLS` | 僧侶の呪文の表(最後の行 = `hold-person` `:23050`) | 2 行足す |
| `index.html:13578` `CLERIC_SLOTS_TABLE` | Lv 別の枠(`:13597` に「将来呪文を追加する場合はここに」) | 2 行足す |
| `index.html:14070` `SCROLL_CATALOG` | 聖典の行(`:14083-14087`) | 2 行足す |
| `index.html:14216` `pickScrollId` | rarity ごとの抽選 + 撤退スイッチで外す(`:14224`) | 撤退時に 2 冊を外す条件を足す |
| `index.html:20796` `executeSkillOn` の僧侶の枝 | 頭と仲間の両方がここを通る | 2 枝を足す |
| `index.html:31806` `clericAI` | 仲間の僧侶の梯子 | 2 段を足す |
| `index.html:34236-34259` `playerAttackTurn` の候補の絞り込み | 主人公(頭)の候補 | 2 条件を足す |
| `index.html:33804` `apIsWastedCast` | 行動の優先度(#19)の無駄撃ち判定 | 2 述語を足す |
| `index.html:22582` ラウンドループの先頭 | `await tickCordonZones();` の直後 | 登録簿の tick を呼ぶ |
| `index.html:22773` 戦闘の `finally` | `:22785 clearCordonZones();` | 登録簿の掃除を足す |
| `index.html:37094` ノード遷移の掃除 | `holdRings.length = 0;` | 登録簿の記録を落とす |
| `index.html:16818` `renderWorld` | `updateHoldRings();` | 絵の毎フレーム追従を足す |

`tavern.html` の写し(**4 枚・手で同期**):

| ファイル:行 | 何 |
|---|---|
| `tavern.html:4520` `CLERIC_SKILLS_UI` | 呪文一覧の表示。`levelReq` の唯一の表示口(`:4530-4534` のコメント) |
| `tavern.html:5331` `CLERIC_SLOTS_TABLE` | 枠の表の写し(⚠ 数字を必ず揃える) |
| `tavern.html:5410` `SCROLL_CATALOG_TV` | 聖典の行の写し |
| `tavern.html:6953` `SCROLL_DEV_SHELF_TV` / `:6963` `devShelfSwitchOnTV` | 開発用の棚(uncommon / rare を開発モードだけ 1G で並べる) |

⛔ `DEFAULT_KNOWN` / `DEFAULT_KNOWN_TV` は**触らない**(聖典で覚える呪文なので初期習得に入れない)。⛔ `AP_TRAVEL_CASTABLE` / `TRAVEL_CASTABLE_IDS` に足さない(敵が居ないと意味が無い)。

### 2-2. ⚠⚠⚠ 罠 A — 戦闘中に味方ユニットを増やしてはいけない

`index.html:14695` `executeSummon` のコメント:

> executeSummon は非戦闘中のみ…戦闘中に並べ替えると pickEnemyTarget の idx や initiative と齟齬する

`joinServantAlly`(`:27489`)も同じ規則で守っている(`:27491`)。戦闘中の `units.push` は **全部が敵**だ(増援 `:22156`・戦車 `:35186`・波 `:35288` / `:35419`)。
⇒ 霊の武器を `createAlly` で作ると、敵の狙い先の添字とイニシアチブが崩れる。**登録簿の 1 行として持ち、ラウンドの頭に攻撃させる**。

### 2-3. 前例 — コードンオブアロー(エルフ)の登録簿

- `cordonZones`(`:21411`)に `{ tx, ty, w, h, dmgDice, roundsLeft, owner }` を積む(`:32870`)。
- `tickCordonZones`(`:32778`)の流れは次のとおり。
  1. 年代記の帰属を開く(`RunChronicle.beginTurn(zone.owner)` `:32785`)。
  2. `enemiesInArea` で範囲内の敵を取る。
  3. `tryDisplacement` → HP を減らす → `triggerEnemyDamageFlash` → `noteDisplacementHit` → `showDmgAt` → `defeatEnemy`。
  4. `roundsLeft -= 1`、0 になったら外す。
- 呼び口はラウンドループ先頭の `:22582` の **1 か所だけ**。直後の `:22583 checkFleeEnemies("cordon")` が、手番の外で HP が半分を切った「追い払い持ち」(ワイバーン #82)を飛び去らせる。
- ⚠ 範囲の判定は **視線を見ない**(`enemiesInArea` だけ)。属性の防御 `resolveElementDefense` も**呼ばない**。

### 2-4. ⚠⚠ 罠 B — 主人公(頭)の actor は**その時点の写し**

`makeLeaderActor`(`:20680`)は `x: playerX, y: playerY` を**値で**写す。そのため、この actor を `owner` として登録簿に握ると、守護霊の中心が**唱えた瞬間の位置に凍る**。

⇒ 頭が唱えたときは `owner` に actor を握らない。**`{ head: true }`** を握り、位置は毎ラウンド `playerX + 48, playerY + 58`(`isOnSovereignRay("player")` `:35745` と同じ中心)から取る。
年代記の名前も `{ head: true }` なら `actorName`(`:15712`)が主人公の名前を返す。actor を渡すと `a.def` の枝へ落ちて `profileOf(actor)` になり、頭として数えられる保証が無い。

⭐ §8 の負のコントロール `frozen`(頭の中心を唱えた時の座標で固定する変異)で守る。

### 2-5. ⚠⚠ 罠 C — 年代記の変異 N7 は「`const __chOut = RunChronicle.beginTurn(...)` がちょうど 6 本」を前提にしている

`tools/verify_run_chronicle.js:203-206` の N7 は、正規表現 `const __chOut = RunChronicle\.beginTurn\([^;]*\);` を **6 件**で置き換える。
新しい tick で同じ書き方をすると 7 件になり、N7 の前提が崩れる。

⇒ 新しい tick の帰属の変数名は **`__chSp`** にする(`const __chSp = RunChronicle.beginTurn(owner);`)。
年代記への帰属は、本チケットの受入(§8 (4c))と負のコントロール `nochron` で別に守る。

### 2-6. ⚠⚠ 罠 D — 敵のセーヴを振る仕組みは無い(呪文ごとに手書き)

`allyHoldPerson` のコメント(`:29483-29485`)に次のとおりある。

> ⛔ セーヴ機構を新設しない —— saveAbility は宣言だけで消費点が 0 件

ファイアボールなどは、セーヴを呪文の中で手書きしている(`:30348-30357`)。

    const intMod = ally.int || 4;
    const spellDC = 12 + intMod;
    ...
    const saveRoll = d20() + (tDef.dex || 0);
    const halvedSave = saveRoll >= spellDC;

⇒ 守護霊の WIS セーヴも**同じ作法で手書き**する。

- **DC = `12 + 僧侶の WIS 修正値`**(この家の規則。⛔ 会議の計画書の「8 + 習熟 + WIS」は採らない。既存の 8 呪文と揃える)。
- **セーヴ = `d20() + (tDef.wis || 0)`**。
- 敵の定義で `wis` を持つのは **`caelum` の 1 体だけ**(`:10367`)。しかも 5e の能力値そのもの(16)で、修正値ではない。⇒ カエルムは常にセーヴに成功する。ただし `dex: 13` も同じ形で、ファイアボールの DEX セーヴにも既に +13 が乗っている。**既存の歪み**として本チケットでは直さない(§11)。
- 他の 47 体は `wis` が無いので `+0`。

### 2-7. ⚠ 罠 E — 呪文攻撃の命中式 `spellAtkBonus` は INT

`:29513`:

    function spellAtkBonus(ally) {
      return ally.atkBonus + (ally.int || 0) + (ally.def.spellAtkBonus || 0) - allyAtkStatusPenalty(ally);
    }

僧侶の `int` は 0(`CLASS_DEFS.cleric` `:22825` `wis: 3, int: 0`)なので、WIS が効かない(ホールド・パーソンも同じ)。
⇒ 霊の武器は `spellAtkBonus` を**使わない**。隣に `clericSpellAtkBonus(u)`(`int` を `wis` に替えた同じ形)を置く。
⛔ `spellAtkBonus` 自体と、ホールド・パーソンは直さない(`verify_hold_pair.js` がアンカーを持つ・別チケット §11)。

### 2-8. ⚠ 罠 F — 付いて回る絵の作法(ホールド・パーソンの輪 `:12822-12897` / CSS `:700-750`)

- 登録簿は**添字を握らない**(敵オブジェクトの参照で握る)。#44 と #46 が、添字の並列配列で 2 回事故を起こしている。
- `spawnGroundFx` は z-index 1(敵の下)。持続ではなく **ms で切れる**ので、ラウンドで数える効果には使わない。
- ⚠⚠⚠ **位置合わせの要素の `transform` を CSS animation で動かさない**(`:706-709`)。animation の宣言は inline style に勝つので、カメラ追従が黙って死ぬ。回転や振り下ろしは **`::before` / `::after`** に持たせる。opacity だけなら animate してよい。
- `filter: blur` は `.hrBeam` の 1px だけ。⇒ 新しい絵も blur を使わない(守護霊の輪は 7×7 マス = 672px 角の大きさ)。
- ノード遷移の掃除(`:37094-37095`)は「DOM は `enemyLayer` 側で一掃済み・記録だけ落とす」の作り。新しい絵も `enemyLayer` に置けば同じ掃除に乗る。

### 2-9. 呪文の数値(既存の表から揃えて決めた)

| | 霊の武器 `spiritual-weapon` | 守護霊 `spirit-guardians` |
|---|---|---|
| 5e SRD | 2 レベル・60ft・1d8+呪文能力・力場・1 分 | 3 レベル・自分の周り 15ft・3d8 光輝・WIS セーヴ半減・集中 10 分 |
| `levelReq` | **3**(2 レベル呪文 = Lv3 の僧侶) | **5**(3 レベル呪文 = Lv5 の僧侶) |
| `mpCost`(枠の順位 `levelReq*1000+mpCost` にだけ効く) | 6(ターンアンデッドと同じ) | 8(キュアシリアスと同じ) |
| `range` | `"long"`(12 マス = 60ft) | `"self"` |
| `target` | `"single"`(敵) | `"self"` |
| 枠(`CLERIC_SLOTS_TABLE`) | `[0,0,0,1,1,1,1,2,2,2,2]`(ターンアンデッド・ホールドと同じ Lv3 帯の列) | `[0,0,0,0,0,1,1,1,2,2,2]`(キュアシリアスと同じ Lv5 帯の列) |
| 持続 | **5 ラウンド** | **5 ラウンド** |
| 効果 | 唱えた手番に 1 回 + 以後ラウンドの頭に 1 回ずつ呪文攻撃。命中 = `d20 + clericSpellAtkBonus`(自然 1 は外れ・`effectiveCritRange` 以上は命中)vs `effectiveEnemyAc`。当たれば `1d8 + WIS`(クリティカルは d8 を 2 回) | ラウンドの頭ごとに、僧侶の中心マスからチェビシェフ距離 3 以内の敵全員に `3d8` 光輝。WIS セーヴ成功で半分(§2-6) |
| 対象の移り先 | 狙った敵が倒れたら、僧侶に一番近い生きた交戦敵へ移る。居なければ何もしない | — |
| 1 人あたり | 1 本まで(掛け直しは上書き) | 1 つまで(掛け直しは上書き) |
| 終わる条件 | 5 ラウンド経過 / 僧侶が倒れる / 戦闘の終わり / ノード遷移 | 同左 |

- ⚠ 5e の守護霊は「敵の手番の開始時」にダメージを与える。本チケットはコードンと同じ「ラウンドの頭」にそろえる(呼び口を 1 か所に保つため)。
- ⚠ 視線は見ない(コードンと同じ。5e でも自分の周りに広がる効果)。
- ⚠ 光輝・力場は `SPELL_ELEMENT` / `ENEMY_TRAITS` に無い属性。⛔ `resolveElementDefense` を呼ばない(コードンと同じ)。

### 2-10. 反魔法(単眼の暴君)

- `clericAI`(`:31809` / `:31811`)と頭の候補(`:34242` / `:34244`)は、殻(`isSovereignShellActive`)とレイ(`isOnSovereignRay`)の中では呪文を撃たない。⇒ 唱える側は既存の門で止まる。
- コードンの区域は殻の中でも回り続ける(既存の挙動・今回は触らない)。
- ⇒ 新しい 2 つは、tick の中で「殻が展開中」または「僧侶がレイの上」なら、**そのラウンドはダメージを出さない**。持続は減らす。

### 2-11. 既存の受入が持つアンカー(触る関数の中の文字列)

`grep -l` で数えた(2026-10-17)。`clericAI` は `driver_action_priority` / `verify_aoe_coverage` / `verify_hold_pair` / `verify_hold_person` / `verify_lore_check` / `verify_spell_off`。
`CLERIC_SKILLS` は `verify_aoe_coverage` / `verify_hold_pair` / `verify_hold_person`。`CLERIC_SLOTS_TABLE` は加えて `verify_member_identity` / `verify_spell_off`。
`SCROLL_CATALOG` / `pickScrollId` は `sim_plaza_entry` / `verify_arcane_eye` / `verify_invisibility` / `verify_mage_hand` / `verify_save_slots` / `verify_scroll_shelf`。
`executeSkillOn` は `driver_action_priority`(**シグネチャ行を逐語で掴む** `:20807` のコメント)/ `verify_arcane_eye` / `verify_hold_person` / `verify_invisibility`。
`tickCordonZones` は `verify_run_chronicle`(関数を包んで関所にする `:757-765`)。`checkFleeEnemies("cordon")` は `verify_tower_mother`(逐語)。

- ⭐ どれも「既存の行を書き換えない・新しい行を足すだけ」なら崩れない設計だ。⛔ 既存の行に条件を継ぎ足さない(1 行の中に足すと、逐語のアンカーが外れる)。
- ⭐ `pickScrollId` の `:14224` の 1 行は書き換えが要る(撤退時に 2 冊を外す)。この行を逐語で掴む本は無い(`grep -F` で 0 件・2026-10-17)。巻物の抽選を測る本(`verify_invisibility` (6b) / `verify_arcane_eye` (6b))は、uncommon / rare の集合を**ソースの表から導く**ので、行が増えても期待値が追従する。
- ⚠ 巻物の表の行は、既存の書式(1 行 1 冊・`rarity` で閉じる)を崩さない。`verify_scroll_shelf.js` の正規表現は行を `rarity` で閉じる(#78 の罠 D)。

### 2-12. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。書ける要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `CLERIC_SKILLS` 2 行 / `CLERIC_SLOTS_TABLE` 2 行 / `SCROLL_CATALOG` 2 行 / `pickScrollId` の撤退条件 / 撤退スイッチ `isClericSpiritOn()` / 登録簿 `clericSpirits` + `tickClericSpirits` + `clearClericSpirits` / `clericSpellAtkBonus` / 唱える関数 2 本 / `executeSkillOn` の 2 枝 / `clericAI` の 2 段 / 頭の候補の 2 条件 / `apIsWastedCast` の 2 述語 / 絵(CSS + 生成 + 毎フレーム追従)/ 呼び口 4 か所(ラウンド頭・戦闘の finally・ノード遷移・`renderWorld`) |
| `tavern.html` | `CLERIC_SKILLS_UI` 2 行 / `CLERIC_SLOTS_TABLE` 2 行 / `SCROLL_CATALOG_TV` 2 行 / `SCROLL_DEV_SHELF_TV` に 2 語 + `devShelfSwitchOnTV` に 2 枝 + `isClericSpiritOnTV()` / changelog 1 行 |
| `tools/verify_cleric_spirits.js` | 新規(port **10634**) |
| `実装依頼書/README.md` | 完了時に #95 の行を更新 |

---

## 4. STEP1 — 守護霊(スピリットガーディアンズ)と、2 つが共有する土台

### 4-1. 撤退スイッチ(`index.html`・`isMageHandOn` の近く)

    /* ★[#95] 撤退スイッチ ?clericspirit=0 — 戦う祈り 2 呪文を唱えない + 聖典を拾わない。
     * ⚠ const に畳まず関数にする (この行より前から呼ばれても TDZ で落ちない。#54 isMageSleepOn と同じ)。
     * ⚠ 各ページが独立に読む (遷移はまたがない)。tavern.html は isClericSpiritOnTV で開発用の陳列だけ止める。 */
    function isClericSpiritOn() {
      try { return new URLSearchParams(window.location.search).get("clericspirit") !== "0"; }
      catch (e) { return true; }
    }

### 4-2. 表(`index.html`)

- `CLERIC_SKILLS` の `hold-person` の後に `spirit-guardians` / `spiritual-weapon` を足す。値は §2-9。`flavor` の例:
  - `spirit-guardians`: 「周囲 3 マスの敵を毎ラウンド 3d8 光輝で焼く (WIS セーヴ半減・5 ラウンド)」
  - `spiritual-weapon`: 「霊の武器が 5 ラウンド宙を舞い、毎ラウンド 1d8+WIS で打つ」
- `CLERIC_SLOTS_TABLE` に 2 行(§2-9)。⚠ `tavern.html` と数字を揃える。
- `SCROLL_CATALOG` の聖典の行(`tome-cure-critical` の後)に、既存と同じ書式で足す。
  - `"tome-spiritual-weapon": { name: "聖典・スピリチュアルウェポン", spellId: "spiritual-weapon", classKey: "cleric", rarity: "uncommon" }`
  - `"tome-spirit-guardians": { name: "聖典・スピリットガーディアンズ", spellId: "spirit-guardians", classKey: "cleric", rarity: "rare" }`
- `pickScrollId`(`:14224`)の filter に `(isClericSpiritOn() || (id !== "tome-spiritual-weapon" && id !== "tome-spirit-guardians"))` を足す。

### 4-3. 登録簿(`cordonZones` の近く)

    const clericSpirits = [];   // ★[#95] { kind: "guardians"|"weapon", owner: ally | {head:true}, roundsLeft, target: 敵オブジェクト|null, fx: 絵の記録 }

- `owner` は **仲間ならその ally オブジェクト / 頭なら `{ head: true }`**(§2-4 罠 B)。
- 中心の取り方は 1 本の関数に畳む。頭 = `playerX + 48, playerY + 58`、仲間 = `x + def.displaySize / 2`。生死も同じ関数で見る。頭 = `hp > 0 && !gameOver`、仲間 = `alive`。
- 唱えたときは、同じ owner・同じ kind の既存の行を外してから積む(1 人 1 つまで)。

### 4-4. `tickClericSpirits()`(`tickCordonZones` の直後に置く)

- ラウンドループ `:22582` の直後で `await tickClericSpirits();` を呼ぶ。続けて `checkFleeEnemies("spirit");`。⛔ `:22583` の `checkFleeEnemies("cordon");` の行は書き換えない(`verify_tower_mother` の逐語アンカー)。
- 各行で次を行う。
  1. owner が倒れていれば外す。
  2. 反魔法(殻 / owner がレイの上)なら、ダメージを出さずに `roundsLeft -= 1` だけ(§2-10)。
  3. 年代記の帰属を開く: **`const __chSp = RunChronicle.beginTurn(owner);`**(⛔ `__chOut` と書かない・§2-5 罠 C)。finally で `endTurn`。
  4. 守護霊:
     - owner の中心マスからチェビシェフ距離 3 以内の、生きた交戦敵を全部取る(⛔ `enemiesInArea` の箱では「中心から 3」を正しく表せない。`tileChebyshev` で書く)。
     - 各敵へ `tryDisplacement` → WIS セーヴ(§2-6)→ 3d8(成功で半分・最低 1)→ HP → `triggerEnemyDamageFlash` → `noteDisplacementHit` → `showDmgAt` → `defeatEnemy`。
     - 当たりが 1 体以上なら、`updateInfo` に 1 行。
  5. 霊の武器: STEP2。
  6. `roundsLeft -= 1`、0 になったら外す(絵も外す)。
- `clearClericSpirits()` は、戦闘の `finally`(`:22785` `clearCordonZones();` の隣)とノード遷移の掃除(`:37095` の隣)で呼ぶ。⚠ ノード遷移の側は DOM が一掃済みなので記録だけ落とす。

### 4-5. 唱える関数 `allySpiritGuardians(actor)`(`allyHoldPerson` の作法)

- 枠を消費する(`skill._slotId`)。続けて `flashAction` → `showRollAtAlly` → `startAllyAttackAnim` → `await dfPlayCast(actor, { name, element: 'holy' }, { duration: 2000 })`。⚠ element は既存の 4 キーから選ぶ(`:29451`。新しい語は白い陣になる)。
- 登録簿へ積む。owner は `actor.isLeader ? { head: true } : actor`。
- `executeSkillOn` の僧侶の枝に `if (skillId === "spirit-guardians") { await allySpiritGuardians(actor); return true; }` を足す。⛔ シグネチャ行(`:20755`)は 1 文字も変えない。

### 4-6. AI

- 唱える条件の述語を 1 本に畳む: `spiritGuardiansWanted(unit)` = 「呪文を知っていて枠がある」かつ「その unit の守護霊がまだ無い」かつ「unit の中心から 3 マス以内に生きた交戦敵が **2 体以上**」。
- `clericAI` = 緊急回復(`:31822`)の後、ホールドを試す行(`:31846`)の前に 1 段足す。
- 頭の候補(`:34236-34259`)= 述語が偽なら外す行を足す。
- `apIsWastedCast` = `if (skillId === "spirit-guardians") return !spiritGuardiansWanted(unit);`。⚠ 頭のときは `unit` が `"player"` などで来る。述語の中で中心を取る関数を共有する。

### 4-7. 絵 — 守護霊の輪

- `holdRings` と同じ作り(登録簿で握る・`renderWorld` で毎フレーム位置合わせ・`enemyLayer` に置く)。
- 部品は 2 枚。足元の大きな円盤(直径 = 7 マス、`zTfAnchored` でカメラに合わせる・z 1)と、その上を回る光の粒。
- 色は金と白(`--holdGold` を流用してよい)。⛔ blur を使わない。⛔ 位置合わせの要素の transform を animate しない(§2-8 罠 F)。
- ⚠ 僧侶本人の z-index を実 CSS で測ってから、円盤が足元の下に入る値を選ぶ(⛔ コメントを信じない。#57 の作法)。

---

## 5. STEP2 — 霊の武器(スピリチュアルウェポン)

- `clericSpellAtkBonus(u)` を `spellAtkBonus`(`:29513`)の直後に置く: `u.atkBonus + (u.wis || 0) + (u.def.spellAtkBonus || 0) - allyAtkStatusPenalty(u)`(§2-7)。
- `allySpiritualWeapon(actor, enemyIdx)`:
  - 対象が死んでいれば、僧侶に一番近い生きた交戦敵へ選び直す。
  - 射程(long)外か視線が無ければ、`allyAdvanceTowardPoint` で前進して手番を終える(既存の呪文の作法)。
  - 枠を消費 → 詠唱の演出 → 登録簿へ積む(`target` = **敵オブジェクト**・⛔ 添字を握らない)→ **その場で 1 回攻撃**(§2-9)。
- 攻撃の本体は 1 本の関数 `spiritWeaponStrike(row)` に畳み、唱えた手番と tick の両方から呼ぶ。
  - 命中は `d20()`。自然 1 は外れ、`effectiveCritRange` 以上は命中、それ以外は `>= effectiveEnemyAc(t)`。
  - ダメージは `1d8 + WIS`(クリティカルは d8 を 2 回)。
  - 添字は呼ぶたびに `enemies.indexOf(row.target)` で引く。`-1` か死んでいれば、移り先を選び直す。
  - 結果は `showRollAtEnemy` で、その敵の頭上に出す(`HIT d20(n)+b vs AC` / `MISS`)。
  - ⚠ 年代記: 唱えた手番の 1 回は手番の中なので、外側の帰属に乗る(`beginTurn` はネストで no-op)。tick の側は §4-4 の `__chSp`。
- `executeSkillOn` に `if (skillId === "spiritual-weapon") { await allySpiritualWeapon(actor, targetIdx); return true; }`。
- AI(述語 `spiritWeaponWanted(unit)` = 知っていて枠がある かつ その unit の武器がまだ無い かつ 射程内に生きた交戦敵が居る):
  - `clericAI` = ブレス(`:31862`)の後、ストライキングの前。脅威度 `threat.score >= 10`。
  - 頭の候補と `apIsWastedCast` は守護霊と同じ形。
- 絵 — 浮遊メイス(CSS のみ):
  - 半透明・青白く光る、縦の柄と頭の形。
  - 対象の頭上に浮かせ、毎フレーム追従する(添字ではなく `row.target` を見る)。
  - 攻撃のたびに、`::before` に振り下ろしの animation を 1 回だけ掛ける(クラスを付け外し)。⛔ 位置合わせの要素の transform は animate しない。
  - 対象が移ったら、新しい敵の頭上へ移る。
  - ⚠ 同時に出る数は、僧侶の人数 ×(輪 1 + メイス 1)で上限が自然に決まる。

---

## 6. STEP3 — `tavern.html` の写しと開発用の棚

- `CLERIC_SKILLS_UI` に 2 行(`levelReq` / `range` / `mpCost` / `flavor` を index と一致)。
- `CLERIC_SLOTS_TABLE` に 2 行(index と同じ数列)。
- `SCROLL_CATALOG_TV` に 2 行(index と同じ中身・同じ書式)。
- 開発用の棚:
  - `SCROLL_DEV_SHELF_TV` の配列に `"tome-spiritual-weapon", "tome-spirit-guardians"` を足す。
  - `devShelfSwitchOnTV` に 2 枝を足す(`return isClericSpiritOnTV();`)。
  - ⛔ `:6974` の `const dev = …` の行は書き換えない(`verify_arcane_eye` の変異 `invisoff` のアンカー)。
- `isClericSpiritOnTV()` を `isEyeOnTV` の隣に置く。
- ⭐ 開発用の棚に並べるのが、恒久ルール「新しいものは開発用の店に 1G で並べる」の呪文版になる(#78 / #79 の前例)。

---

## 7. 撤退スイッチ

- **`?clericspirit=0`** — 戦う祈り 2 呪文を、頭も仲間も唱えない(AI の 2 段・頭の候補・`executeSkillOn` の枝が全部偽になる)。聖典 2 冊を `pickScrollId` で拾わない。`tavern.html` では開発用の棚に並べない。
- ⚠ 判定位置: `index.html` = `isClericSpiritOn()`、`tavern.html` = `isClericSpiritOnTV()`。**ページ遷移はまたがない**(各ページが独立に読む)。
- ⚠ 既に覚えた呪文は、撤退しても「知っている」ままにする(セーブを壊さない)。呪文一覧には出るが、戦闘では唱えない。

---

## 8. 受入条件 — `tools/verify_cleric_spirits.js`(新規・port 10634)

**方針**: 本番のページを実 Chrome(`puppeteer-core`)で開く。僧侶を頭と仲間の両方に立てて、2 呪文を `executeSkillOn` から唱えさせる。

- 盤面(敵の HP・座標)を**ドライバ側で独立に**数え、登録簿の挙動と突き合わせる。
- 乱数は `Math.random` を差し替えて固定し、命中・セーヴ・ダメージを決定的にする。
- ⛔ AI が「いつ」唱えるかの頻度は測らない(§9)。測るのは「述語が真のときに候補へ入る / 偽のときに外れる」だけ。

### §0 装置

- **(0a)** 2 呪文が `getSkill` で引ける / 2 冊が `SCROLL_CATALOG` に在る / 習得済みに仕込んだ僧侶の `equippedSkills` に 2 呪文が載る(Lv5)。⭐ これが無いと全 assert が空振りで永久緑になる。
- **(0b)** 盤面に「僧侶から 1・2・3・4 マス」の敵を 1 体ずつ置けている(距離はドライバが座標から計算)。
- **(0c)** ソース 2 ファイルの写し 4 枚(呪文の表・枠の表・聖典の行)が同じ中身で 1 行ずつ。

### §1 守護霊

- **(1a)** 唱えた次のラウンドの頭で、距離 1〜3 の敵だけが減り、距離 4 の敵は減らない。
- **(1b)** セーヴの乱数を「成功」に固定すると、ダメージがちょうど半分(切り捨て・最低 1)。「失敗」なら 3d8 そのまま。DC は `12 + WIS`(ドライバが僧侶の `wis` から計算)。
- **(1c)** 5 ラウンドで切れる(6 ラウンド目の頭では誰も減らない・登録簿が空)。
- **(1d)** ⭐ 頭が唱えたあと主人公を 3 マス動かすと、輪の中心が動く(唱えた位置ではなく今の位置で測る = 罠 B)。
- **(1e)** 掛け直しで 2 つにならない(登録簿の守護霊は owner ごとに 1)。
- **(1f)** 殻の展開中はダメージ 0・持続は減る。

### §2 霊の武器

- **(2a)** 唱えた手番に 1 回、以後ラウンドの頭に 1 回ずつ攻撃する(5 ラウンドで計 6 回)。
- **(2b)** 命中の補正が `atkBonus + wis + def.spellAtkBonus − 罰`(INT ではない = 罠 E)。僧侶の `int` と `wis` に違う値を入れて区別する。
- **(2c)** 狙った敵を倒すと、次のラウンドは僧侶に一番近い生きた交戦敵を打つ。
- **(2d)** 射程外では前進して手番を終え、枠を減らさない。

### §3 終わり方

- **(3a)** 戦闘が終わると登録簿が空・絵の DOM が 0。次の戦闘へ持ち越さない。
- **(3b)** 僧侶が倒れると、その僧侶の 2 つが外れる。
- **(3c)** ノード遷移で登録簿が空。

### §4 AI と年代記

- **(4a)** 仲間の僧侶: 3 マス以内に敵 2 体 → 守護霊の述語が真。1 体 → 偽。既に張っている → 偽。
- **(4b)** 頭の僧侶: 同じ条件で候補に入る / 外れる。`apIsWastedCast` が述語と一致する。
- **(4c)** 年代記: tick のダメージと撃破が、唱えた僧侶の名前に帰属する(頭 = 主人公の名前)。

### §5 撤退

- **(5a)** `?clericspirit=0` → 習得済みでも `executeSkillOn` が 2 呪文で false・AI の述語が偽。
- **(5b)** `?clericspirit=0` → `pickScrollId` の全区間で 2 冊が出ない。素では uncommon / rare の集合に入る。
- **(5c)** `tavern.html?clericspirit=0` → 開発用の棚に 2 冊が無い。素の開発モードでは 1G で並ぶ。

### §9

- **(9a)** pageerror 0 件。

### ⛔ 測らないこと

- AI が実戦で何回唱えるか(頻度・手触りは §9 の実機で)。
- 絵の見た目(色・大きさ・振り下ろしの動き)。DOM の数と位置の追従だけ測る。
- ダメージの強さの妥当性(数値は §2-9 で固定し、手触りは実機で)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `frozen` | 頭の中心を唱えた時の座標で固定する(罠 B) | (1d) |
| `square` | 半径をチェビシェフ 3 ではなく 4 にする | (1a) |
| `nohalf` | セーヴ成功でも半分にしない | (1b) |
| `intatk` | 霊の武器の命中に `spellAtkBonus`(INT)を使う(罠 E) | (2b) |
| `noclear` | 戦闘の finally の掃除を外す | (3a) |
| `nochron` | tick の `beginTurn` に owner を渡さない(罠 C) | (4c) |
| `leak` | `pickScrollId` の撤退条件を外す | (5b) |

### 既存 golden の非退行(実装後に必ず走らせる)

§2-11 の 14 本(`driver_action_priority` / `verify_aoe_coverage` / `verify_hold_pair` / `verify_hold_person` / `verify_lore_check` / `verify_spell_off` / `verify_member_identity` / `sim_plaza_entry` / `verify_arcane_eye` / `verify_invisibility` / `verify_mage_hand` / `verify_save_slots` / `verify_scroll_shelf` / `verify_tower_mother`)+ `verify_run_chronicle.js`(`--negative` を含む。N7 が 6 件のままであることの確認)。
⚠ 基準の色は **項目 1 の先頭で控える**(着手前の `e5a3e1c` の色・2026-10-17)。#94 の完了時点で既知の赤 = K3 `driver_grid_p8` (6d) / K4 (8e) の 90 秒窓 / K8 `verify_tower_mother_b` の neg の揺れ。
⭐ 変異アンカーの衝突は、全 tools の文字列リテラルを着手前と後の 2 ファイルで数え直して測る(#94 §12-3 の方法)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須。開発モード(`tavern.html?dev=1`)で武器防具屋の巻物の棚から 2 冊を 1G で買い、酒場で「読む」。

- 守護霊の輪が回っても戦闘のフレームが落ちない(iPhone)。7×7 マスの大きさが画面を覆いすぎないか。
- 浮遊メイスが敵に付いて回り、振り下ろしが「何が殴っているか」分かる見え方か。
- 「張ったのに誰も入らない」が多すぎないか(後衛の僧侶 + 敵 2 体の条件の手触り)。
- 地下神殿のアンデッド戦で、ターンアンデッドとの使い分けが見えるか。
- 3d8 × 5 ラウンドが強すぎないか(Lv5 以降の僧侶)。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>僧侶に戦う祈り</b> — 聖典で覚える新呪文。守護霊が周りの敵を焼き、霊の武器が宙を舞って打ちかかる。"

---

## 11. やらないこと

- ⛔ 集中(コンセントレーション)の導入。ブレス・シールドオブフェイスの重ねがけまで変わる(別チケット候補)。
- ⛔ 守護霊を張った僧侶を前へ出す AI(別チケット候補)。
- ⛔ アンデッド特効。光輝の属性を `ENEMY_TRAITS` / `SPELL_ELEMENT` へ足すこと。
- ⛔ `spellAtkBonus` の INT → WIS の直し(ホールド・パーソンの命中も WIS が効いていない・別チケット候補 K1)。
- ⛔ カエルムの `dex` / `wis` が能力値そのもの(修正値ではない)である歪み(別チケット候補 K2)。
- ⛔ コードンの区域が反魔法の殻の中でも回る件。
- ⛔ 霊の武器の専用スプライト(必要なら codex1 への依頼を別に起こす)。
- ⛔ ボールト `spells.md` の ✅/⬜ の更新(別 PC の宿題)。
- ⛔ 店の通常の巻物の棚に並べる(uncommon / rare は拾う呪文。#77 の方針どおり)。
- `実装依頼書/README.md` へ足す行(承認時に起草窓が足す):

    | 95 | [2026-10-17_cleric-spirits.md](2026-10-17_cleric-spirits.md) | **承認済** | 0% | 僧侶の戦う祈り = スピリチュアルウェポン + スピリットガーディアンズ。⭐ 仲間ユニットにせずラウンド頭の登録簿(コードンと同じ口)/ ⚠ 頭の actor は写し ⇒ owner は {head:true} / ⚠ 年代記の変数は `__chSp`(N7 が 6 件を要求)/ ⚠ セーヴは手書き・DC 12+WIS / ⚠ 命中は INT ではなく WIS。撤退 `?clericspirit=0` |

---

## 12. 実装結果

**ステータス: ✅ 完了(2026-10-18 実装窓・未 push)**。記録の詳細は `~/.claude/dev-loop/notes95_item1.md` / `notes95_item2.md` / `notes95_item3.md` / `notes95_item4.md`。

### 12-1. コミット

| commit | 内容 |
|---|---|
| `14c71d8` | 項目1 本番: 守護霊(`spirit-guardians`)と土台。登録簿 `clericSpirits` + `tickClericSpirits` / `clearClericSpirits`・撤退 `?clericspirit=0`(`isClericSpiritOn`)・聖典 2 冊(`SCROLL_CATALOG` + `pickScrollId` の撤退条件)・`CLERIC_SKILLS` / `CLERIC_SLOTS_TABLE` 各 2 行・`executeSkillOn` / `clericAI` / 頭の候補 / `apIsWastedCast`・輪の絵(CSS `.sgFx`)・呼び口 4 か所。`tavern.html` changelog 1 行(§10 の文面どおり)。`tools/verify_run_chronicle.js` の (0c) 43→44 |
| `e6a6bdb` | 項目2 本番: 霊の武器(`spiritual-weapon`)= `clericSpellAtkBonus`(WIS)・`spiritWeaponStrike`・浮遊メイス `.swMace`・`spiritWeaponWanted`。`tavern.html` の写し 4 枚(`CLERIC_SKILLS_UI` / `CLERIC_SLOTS_TABLE` / `SCROLL_CATALOG_TV` / 開発用の棚 + `isClericSpiritOnTV`)+ changelog の行の末尾に 1 文。(0c) 44→45 |
| `d2f6ce4` | 項目3: 新規受入 `tools/verify_cleric_spirits.js`(port 10634・素も変異も同じ port を順に) |
| 本節のコミット | 項目4: 母集団の非退行(全数走査)+ 本節 + README の #95 行 |

### 12-2. 受入の色と秒

| 走行 | 色 | 秒 |
|---|---|---|
| `verify_cleric_spirits` 素 | **23/23** ×4(項目3)+ 全数走査の中で 1 回 23/23 | 10〜11 |
| `verify_cleric_spirits --negative` | **7/7**(frozen=(1d) / square=(1a)+(1c) / nohalf=(1b) / intatk=(2b) / noclear=(3a) / nochron=(4c) / leak=(5b)。巻き込みは square → (1c) の 1 件 = 距離 4 の敵が毎ラウンド焼かれる自然な連鎖)×2 | 71〜72 |
| §8 の既存 golden 15 本(+ `--negative`) | 項目1・項目2 とも着手前と同色。`verify_run_chronicle` は (0c) を言い直した後 74/74・neg 8/8(N7 の `__chOut` は 6 件のまま) | — |
| 一時プローブ(コミットしない) | `probe95.js` 36/36(項目1)/ `probe95b.js` 24/24(項目2)= 頭の中心の追従・DC 12+WIS・補正 WIS(INT 版なら 11 になるところ 14)・年代記の帰属・酒場の写しの一致 | — |

### 12-3. 母集団の非退行(全数走査)

- `index.html` / `tavern.html` = 全ページが踏むファイルなので全数。HEAD `d2f6ce4` で **226 腕・663.6 分**(2026-10-18 07:02→18:06・2.93 分/腕)= #94 の post94 の 224 腕(同順)+ `verify_cleric_spirits` 素 / neg。直列・SKIP 再開型。git を読む本(32 腕)は `git clone --shared @d2f6ce4`(本番と 933 ファイルのバイト差 0)で。8765 は走査の前後とも LISTEN なし(post94 と同じ条件)。
- 結果: 緑 206 / 非緑 20。基準 post94(`cf11341` = #95 の直前)と比べて **緑→赤 0**・赤→緑 2(`driver_monsters_griffon` 15/17→17/17・`verify_tower_mother_b --negative` 11/11 担当どおり = どちらも #95 の触った経路の外で、緑へ戻った側)・両方非緑 20・新規 2 腕は緑。
- 両方非緑の 20 腕は FAIL 行を集合で突き合わせ、**20 腕とも中身が同じ**(`driver_mapdef_step1` (0b) は clone 根のパスの文字が違うだけ)。件数だけ一致して中身が入れ替わった腕は 0。
- 緑→赤が 0 なので、影のツリー(`shadow95` = 本番 3 ファイルを `7be0e4b` へ戻した実体コピー・base95 とバイト一致を確認済)との対比較は不要だった。⇒ **#95 帰属の緑→赤 = 0**(項目1・2 の (0c) は着手中に帰属を実測して言い直し済 = 12-4 K1)。
- 変異アンカー衝突: 全 tools 200 ファイルの文字列リテラル 53,604 個を `7be0e4b`→`d2f6ce4` の 3 ファイルで数え直した。件数が変わった 867 組のうち「1 だった / 1 になった / 0→出現」は 25 組で、24 組は `verify_cleric_spirits` 自身(変異アンカー 7 本 + 聖典名・ID・CSS クラス名)、残り 1 組は `verify_bolt_aim.js` の `' の中心 ('`(ログ表示用の連結文字列)⇒ **衝突 0**。

### 12-4. 崩れた主張・依頼書から変えた点(K 番号)

- **K1**(§2-11「新しい行を足すだけなら崩れない」): `verify_run_chronicle` (0c) =「HP を引く点」の総数が崩れた。43 → 44(項目1 `spiritGuardiansTick` の傷)→ 45(項目2 `spiritWeaponStrike` の一撃)。どちらも tick の `const __chSp = RunChronicle.beginTurn(owner)` の中(唱えた手番の一撃は `executeSkillOn` の中)で、仲間の僧侶・頭とも dealt の増分 = 傷の合計を実測してから `HP_WRITE_EXPECTED` を 45 へ言い直した(理由のコメント付き・正規表現をよける書き換えはしていない)。
- **K2**(§4 登録簿の位置「`cordonZones` の近く」): TDZ よけで `holdRings` の直後へ移した。共有関数もすべてそこ。
- **K3**(§8 (0a)「習得済みに仕込んだ僧侶の `equippedSkills` に載る」): 仲間は枠どおり載るが、**頭の `equippedSkills` は酒場の選択(`partySkillsMap`)かクラスの既定 3 個から来る**。酒場の呪文一覧に 2 呪文が並ぶ(項目2)ので選べば候補に入る。受入は頭の `equippedSkills` を直に置く。
- **K4**(§5 `clericAI` の段): 梯子ではホールド・パーソンが霊の武器より先に来る。AI を受入で測るときはホールドの枠を 0 にした。
- **K5**(§8 乱数の固定): 霊の武器を**唱えた手番**は、一撃の前に演出(台詞の抽選など)が乱数を 1〜5 回引き、走行ごとに揺れる。⇒ 唱えた手番は列ではなく定数で固定し、引いた目を `showRollAtEnemy` の `d20(n)` で読み戻した。
- **K6**(§10 changelog): 項目1 で §10 の文面どおり 1 行。項目2 は pre-commit フックが「staged の `changelogList` が HEAD と違うか」を見るので、実在する変化(覚えると酒場の呪文一覧にも並ぶ)を同じ行の**末尾に 1 文**足した(元の文言は 1 字も変えていない)。
- **K7**(述語の仮置き): 項目1 では `spiritWeaponWanted` を `return false` で仮置きし、頭の候補と `apIsWastedCast` を先に配線した。項目2 で本体を書いた(既存の行の書き換えはこの仮置きとコメント数行・`pickScrollId` の filter 1 行・`SCROLL_DEV_SHELF_TV` の配列 1 行だけ)。
- **K8**(依頼の「既知の赤」): `verify_lore_check` (1j) は項目1・2 で「着手前から決定的に赤」と記録したが、それは **6 レーン並列で回したときの赤**(合流の乱数の回数が 1 つずれる)。直列の全数走査では post94・post95 とも **26/26・neg 12/12 で緑** ⇒ 決定的ではなく負荷しだいの揺れ。`driver_action_priority --negative` の N3(注入点 2 箇所 = 起動時 exit 1)は #87 以来、全数走査の腕の外で、着手前と同じ。

### 12-5. 別チケット候補

- `spellAtkBonus` の INT → WIS(ホールド・パーソンの命中も WIS が効いていない・§11)。
- カエルムの `dex` / `wis` が能力値そのもの(修正値ではない)= 守護霊のセーヴにも常に成功する(§11)。
- 頭の僧侶の装備スキルの出所(K3): 聖典で覚えても、酒場で選ぶまで頭は 2 呪文を候補に持てない。覚えたら自動で載せるかどうか。
- 唱えた手番の乱数の消費数の揺れ(K5): 乱数の列で固定する受入が「唱えた手番」に列を置けない。
- `driver_action_priority --negative` の N3 アンカー腐り(`const equippedIds = apEquippedIdsFor(slot, classKey);` が 2 箇所)。
- `verify_lore_check` (1j) の乱数回数の assert が負荷で 1 回ずれる(K8)。余分な引きに頑丈な測り方へ。
- #94 から持ち越し: `driver_grid_p8` (6d)(#62 以来の赤・今回も同じ中身)/ (8e) の 90 秒実時間窓 / `verify_tower_mother_b --negative` の時間切れ揺れ(今回は緑)。
- §11 の保留: 集中(コンセントレーション)/ 守護霊を張った僧侶を前へ出す AI / アンデッド特効と光輝の属性 / コードンが殻の中でも回る件 / 霊の武器の専用スプライト。

### 12-6. 残り

- **§9 実機の確認**(開発モード `tavern.html?dev=1` で 2 冊を 1G で買い、酒場で読む): 守護霊の輪が回ってもフレームが落ちないか(iPhone)・7×7 マスの大きさ / 浮遊メイスの追従と振り下ろしが「何が殴っているか」分かるか / 「張ったのに誰も入らない」が多すぎないか / 地下神殿でターンアンデッドとの使い分けが見えるか / 3d8 × 5 ラウンドが強すぎないか(Lv5 以降)。
- 次の新規ドライバ base = **10635**。
