# #70 使わない魔法・特技をひと目で分かるように + 僧侶も選べるように(0 が守られない 3 経路の修正込み)

- **起草**: 2026-09-18(起草窓 `claude-f8` / セッション `6fb3c892`) / **ステータス**: **承認済**(2026-09-18 ユーザー承認)
- **着手**: ⏸ **#69 の着地後**(同じ `index.html` / `tavern.html` を触る)。⭐ 僧侶の除外枠を他へ回さない既定(§1)も承認済み。
  ⚠ 本書の行番号は `d9c8cbf` 時点。#68 は `78c7474` で着地済み(`index.html` は +75 行)で、#69 でも動く ⇒ **識別子で引き直してから**着手する。
- **基準コミット**: `d9c8cbf`(#68 項目4。`index.html` / `tavern.html` は `e42b7ea` から不変)。起草時の作業ツリーは clean。
- **触るファイル**: `index.html` / `tavern.html` / `tools/verify_spell_off.js`(新規) / `実装依頼書/README.md`
- ⛔ **着手順**: #68 の着地後。さらに **#69(承認済・⏸)と同時に走らせない**(同じ `index.html` / `tavern.html` を触る)。
  本書の行番号は**すべて `d9c8cbf` 時点**で、#69 の着地で `index.html` 側は必ず動く ⇒ **識別子で引き直してから**作業する。
  add は**ファイル単位**、commit は `git add <paths> && git commit -m ... -- <paths>` の 1 複合コマンドで。

---

## 1. 目的

マッチング画面の設定引き出し(`#pmDrawer`)で、**どの魔法・特技を使わないことにしているか**が見分けにくい。
魔法使いとエルフは呪文の個数を 0 にでき、戦士・ドワーフ・盗賊は特技を外せる。ところが、0 個や外した行と使う行の違いは
背景の濃さだけだ(§2-2)。さらに起草前に測ると、**画面で 0 にしても戦闘で使われる経路が 3 つ**あった(§2-3)。
僧侶はそもそも呪文を選べない(§2-3 ①)。

**ユーザー決定**:

- 2026-09-16: **見つけやすくするだけ**。「使わない」だと一目で分かる見せ方にする。禁止リストは足さない(魔法使い・エルフは個数 0 で既に表せるため)。
- 2026-09-18(起草前の実測 §2-3 / §2-4 を見て):
  - **僧侶も「使わない」を選べるようにする**。⚠ 09-16 の「状態は増やさない」を**僧侶に限って**撤回する = 僧侶用の除外リストを 1 本だけ足す
    (僧侶には個数の UI が無く、ほかに表す手段が無いため)。
    - 不採用: 「自動」と明示するだけ(僧侶は選べないまま)。
  - **0 が守られない 2 経路(スリープの差し込み直し / NPC の全部 0)は直す**。画面で 0 なら本当に使わない。
    - 不採用: 注意書きだけ / 今回は触らない。
  - **5 個への切り詰め(§2-4)も本チケットに含める**。「0 が守られるか」を確かめる保存→読み込みの往復を、同じ切り詰めが壊すため。
    - 不採用: 別チケット。
- ⭐ **起草窓の既定(承認時に確認してほしい点)**: 僧侶が「使わない」にした呪文の枠は、**他の呪文へ回さない**(その分だけ枠の総数が減る)。
  回すなら「どの呪文へ何枠」という配分の規則が要り、別の仕事になる。

---

## 2. 着手前の実測(起草窓が HEAD `d9c8cbf` の本番コードで確かめた事実)

⚠ **起草時は実走していない**。実装窓の #68 項目5 が母集団の直列走査で Chrome を 4 時間以上占有するため。
以下はすべて静的な読みで、STEP1 で実物の再現を取る(§4)。

測り直すときの元:

    git show d9c8cbf:tavern.html > /tmp/tav.html
    git show d9c8cbf:index.html  > /tmp/idx.html

### 2-1. 引き出しの技の行は 3 種類

`pmRenderDrawer` `tavern.html:8575` のスキル段(`:8615`〜`:8643`)が、職ごとに 2 つの部品を呼び分ける。

| 行の種類 | 部品 | 対象 | 「使わない」の表し方(今) |
|---|---|---|---|
| 個数の行(± ボタン) | `renderSpellSlotItem` `:7272` | 魔法使い・エルフの呪文(`isCasterClassTV` かつ自動でない) | 個数 0(`.selected` が付かない) |
| 入れ外しの行(押すたびに切り替え) | `renderSkillItem` `:7404` | 全職の `mpCost` の無い特技 + 呪文職以外の呪文 | 未選択(`.selected` が付かない) |
| 自動の行 | `renderSpellSlotItem` の `isAuto` 枝(`:7297`) | **僧侶の呪文**(`isAutoSlotClassTV` `:5084`) | **表す手段が無い**(「自動 N」の表示だけ) |

- 準備画面(`#prep`)は #55 で出なくなったが、同じ 2 部品を今も呼ぶ(`renderCharLoadout` `:7612`)。部品を直せば両方に効く。

### 2-2. 見分けにくさ(CSS の実数)

- 引き出しの中の行の背景: 通常 `rgba(255,245,210,0.10)`(`:2299`) / 個数の行で 1 個以上 `rgba(200,160,70,0.24)`(`:2309`)。
- 名前・説明・分類の文字色は**選択の有無で同じ**(`:2312`〜`:2317` が両方へ同じ色を明示)。
- ⇒ 違いは背景の薄い色差だけ。「使わない」を表す文字も印も無い。

### 2-3. ⚠⚠⚠ 画面で 0 でも戦闘で使われる経路が 3 つ

**① 僧侶は選べない(本体も酒場の設定を読まない)**

- 酒場: 僧侶の行は `自動 N` を出すだけ(`:7297`〜`:7298`)。N は `CLERIC_SLOTS_TABLE` を**直接**読む(`:7277`)。
- 本体: `initAllySpellSlots` `index.html:13914` の僧侶枝は `getClericSlots(lv)` + 習得済みの絞りだけで、`partySkills` を見ない(`:13923`〜`:13927`)。

**② 魔法使いのスリープは 0 にしても戻る**

- `loadSelections` `tavern.html:5360` の末尾 `:5457`:
  `if (partySkills.mage) partySkills.mage = withInnateSleepListTV(partySkills.mage);`
- `withInnateSleepListTV` `:5138` は、一覧に `sleep` が無ければ **index 1 に差し込む**(#54 のスリープ常備)。
- ⇒ スリープを 0 にして保存しても、**次に酒場を読み込んだ瞬間に 1 個へ戻る**。
  #54 がこうした理由は「既存セーブに効かせるため」(`:5446`〜`:5456` のコメント)で、「使わない」を選ぶ場面は想定していない。

**③ NPC の魔法使い・エルフは、全部 0 にすると既定の呪文を撃つ**

- `index.html:34902`: `const hasPreset = !!(partySkillsMap && Array.isArray(partySkillsMap[ally.classKey]) && partySkillsMap[ally.classKey].length > 0);`
- `hasPreset` が偽だと `defaultCasterMap` `:34721`(`defaultSkills` の呪文を 2 枠ずつ)へ戻る。**空配列 = 未設定**と同じ扱い。
- 主人公本人は `heroMap` を使うので効かない。**NPC の仲間だけ**が既定の呪文を撃つ。
- 一方、酒場は空配列を「全部外した状態」として尊重している(`:5415` のコメント「空配列でも尊重する … AI もスキル使用しない」)= **2 ファイルで解釈が逆**。
- ✅ 直しても既定の編成は変わらない: 酒場の既定配分 `PARTY_SLOTS[].defaults`(`:4504`〜`:4514`)は **6 職とも空でない** ⇒ 空配列はプレイヤーが全部外したときにしか生まれない。

**成り立っていた経路(直さない)**

- 戦士・ドワーフ・盗賊の特技: 空配列も `Array.isArray` で拾われ、`equippedSkills = []`(`:34885` / 先頭は `:34850`)。外せば本当に使わない。
- 魔法使い・エルフの主人公: 個数 0 は `initAllySpellSlots` の `if (n > 0)`(`:13936` 付近)で配られない。

### 2-4. ⚠⚠ 酒場を読み込み直すと、呪文職の配分が 5 個に切り詰められる

- `tavern.html:5420`: 保存された `partySkills` を読むとき、**職を問わず** `.slice(0, skillSlotsForLevel(10))` = **5 件**で切る。
  コメントは「最大枠(5)まで保持」で、これは戦士などの特技枠(`SKILL_SLOT_CURVE` `:4767` = `[0,1,1,2,2,3,3,4,4,5,5]`)の上限。
- 呪文職の配列は**同じ呪文を個数ぶん重複して持つ**(`:7269` のコメント)。呪文の上限は別の表:
  - 魔法使い `SPELL_SLOT_CURVE_MAGE` `:5065` = `[0,3,4,5,6,8,9,10,12,13,15]` ⇒ **Lv4 で 6、Lv10 で 15**
  - エルフ `SPELL_SLOT_CURVE_ELF` `:5066` = `[0,2,2,3,4,5,6,7,8,9,10]` ⇒ **Lv6 で 6、Lv10 で 10**
- ⇒ **魔法使い Lv4 以上・エルフ Lv6 以上**は、上限いっぱいに配分して保存しても、読み込み直すと先頭 5 個だけが残る。
  エルフは入れ外しの特技も同じ配列に入るので、実際にはもっと低い Lv から切られうる。
- 保存 `saveSelections` `:5484` は配列を丸ごと書く(`:5489`)= 切っているのは読み込みだけ。
- 本体 `index.html` は `partySkills` を切らない(`normalizePartySkillsMap` `:34711` は数を畳むだけ)。上限は `initAllySpellSlots` の `upperCap` が正しく掛ける。

### 2-5. 僧侶の配分表を読む口は 1 関数に集まっている

| ファイル | 口 | 呼び口 |
|---|---|---|
| `index.html` | `getClericSlots(lv)` `:13086` | 上限の合計 `:13101` / 仲間の初期化 `:13925` / 仲間のレベルアップ `:13960` / 先頭の初期化 `:19990` / 先頭のレベルアップ `:20017` = **5 箇所** |
| `tavern.html` | `getClericSlotsTV(lv)` `:5085` | 上限の合計 `:5099` / #19 優先度の候補 `apEquippedIdsFor` `:7457` = **2 箇所** |
| `tavern.html` | ⚠ 表を**直接**読む | 行の「自動 N」 `renderSpellSlotItem` `:7277`(`getClericSlotsTV` を通らない) |

- ⇒ 除外は **`getClericSlots` / `getClericSlotsTV` の中 1 点**で掛ければ、初期化・レベルアップ・先頭・上限・#19 の候補すべてに効く。
  ⚠ 行の表示 `:7277` だけは別に直す(§5-3)。
- 僧侶 AI の撃つ口は、すべて**装備(`equippedSkills`)か枠(`hasSpellSlot`)で止まる**:
  回復 `bestAffordableHeal` `:27398`(両方) / ホールド `tryHoldPerson`(両方) / ターンアンデッド `:30001`(両方) /
  ブレス `:30008`(両方) / ストライキング `:30020`(両方) / シールド・オブ・フェイス `:30047`(装備) /
  #19 `apTryPreferred`(両方) / 先頭の `pickLeaderAction`(枠)。`allyCureLight` `:27459` は**呼び口 0 件**(死んだ互換ラッパ)。
  ⇒ 配分表から消えれば、枠も装備キーも生まれず、どの口からも撃たれない。

### 2-6. 新しく保存するキーは `dragonfighters.` で始める

- セーブスロット `js/save-slots.js:80` の `keysOf()` は **`dragonfighters.` の前方一致で総なめ**(`KEEP` の 2 キーを除く)。
  タイトルの新規ゲームも同じ前方一致で消す(`title.html:731` のコメント)。`tavern.html:5511` にも「前置詞を変えない」の警告がある。
- ⇒ 新しいキー 2 本(`dragonfighters.clericSpellsOff` / `dragonfighters.mageSleepSeeded`)は**この接頭辞で始める**。
  外れた名前にすると、スロットを切り替えても付いてこず、新規ゲームでも消えない。
- ⚠ TDZ: `tavern.html` の `selection` は `:5482` の `const`。それより前に定義された関数(`getClericSlotsTV` `:5085`)から
  `selection` を読むと、読み込み中に呼ばれた日に落ちる。⇒ 除外リストは `selection` に入れず、`getClericSlotsTV` より前で宣言した
  ページ変数(または呼ぶたびに `localStorage` を読む関数)に持つ。判定スイッチも `const` でなく**関数**にする(#54 `isMageSleepOn` と同じ作法)。

### 2-7. 既存の検査が掴んでいるもの(⚠ 赤くなる本数は予想であって実測ではない)

素で走らせ、**実際に赤くなった assert の ID を控えてから**言い直す(#60 の教訓)。

- `#pmDrawer` を読む本 = **5 本**: `driver_equip_compact_ios` / `verify_darkvision` / `verify_party_match_setup` / `verify_pm_drawer_fit` / `verify_prep_retire`。
  - 実座標クリックを持つのは `verify_party_match_setup`(`mouse.click` 4 箇所)と `verify_darkvision`(1 箇所)。
    どちらも押す瞬間に要素の矩形を引く形なので、行に印を足しても**器をスクロールさせなければ**追従する見込み(⚠ #56 は器のスクロールで 6 本赤)。
  - `verify_party_match_setup` (3d) は `.skillItem.selected` を 1 つ外して見出しの数が変わるかを見る = 入れ外しの行の挙動は変えないので緑の見込み。
  - `verify_pm_drawer_fit` は引き出しの高さを測る。印で行が折り返すと動きうる。
- `partySkills` を仕込む本 = **7 本**: `driver_action_priority` / `verify_bolt_aim` / `verify_cone_cast` / `verify_mercenary_roster` /
  `verify_party_match_setup` / `verify_recruit_talk` / `verify_save_slots`。
  - `verify_recruit_talk` はスリープの差し込みを測る(`nosleepknown` / `sleeplast` / `sleepall` の変異アンカーは `index.html` 側 = 触らない)。
    ページを開くたびに `localStorage.clear()` してから仕込む(`:203` / `:261`)ので、印も毎回消え、差し込みは従来どおり起きる見込み。
  - ⚠ **印キーは保存のたびに書かれる**(§5-4)ので、`localStorage` のキー集合を数える本(`verify_save_slots` など)は動きうる。
- 僧侶の配分を見る本 `verify_hold_person` / `verify_aoe_coverage` は、除外キーが無い限り 1 ビットも変わらない見込み。
- ⚠⚠ **`driver_action_priority --negative` は着手前から exit 1**(#35 `97f350d` 以来)。変異 N3 のアンカー
  `const equippedIds = apEquippedIdsFor(slot, classKey);` が `tavern.html` に **2 箇所**あるため(起草窓が HEAD で実測 = 2 件)。
  ⇒ **本チケットのせいではない**。⛔ ついでに直さない(別チケット候補 = §11)。⚠ 本チケットは `apEquippedIdsFor` の**中**を触るので、
  アンカーの件数を 2 のまま動かさないこと(3 箇所目を作ると、直す側のチケットの前提まで変わる)。

### 2-8. 起草中に見つけた別件(本チケットではやらない)

- 主人公が**隊列の先頭**で呪文職のとき、`equippedSkills` を「重複込みの配列を 3 件で切った値」にしている(`index.html:34850` / `headSkillSlots` `:34835` = 呪文職は 3)。
  配分した呪文の一部が先頭の行動候補から漏れうる。4 人編成では先頭が前衛職なので起きにくい ⇒ §11 へ。

### 2-9. changelog / 行末 / 番号 / ポート

- `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。書ける要約は実在する(§10)。
- `index.html` 39,539 行・`tavern.html` 10,586 行とも**純 CRLF**(LF 単独 0。`py` のバイト数えで実測)。⛔ 改行を `grep` で測らない。
- 番号: `#70` は #69 の依頼書が「候補3 = #70 見込み」と書いた以外に予約なし。
- ポート: #68 = 10301〜 / #69 = 10331〜 / 起草窓のプローブ = 10391 帯 ⇒ 本チケットの新規ドライバは **base 10351**(変異 10352〜10363)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | 撤退の判定 1 本 / 「使わない」の印(2 部品) / 僧侶の除外リスト(読み書き・行のボタン・`getClericSlotsTV` の除外・行の自動 N) / スリープの印 / 読み込み時の切り詰めを職ごとに / CSS / changelog 1 行 |
| `index.html` | 撤退の判定 1 本 / `getClericSlots` の除外 / `hasPreset` の空配列 |
| `tools/verify_spell_off.js` | **新規**。base **10351** |
| `実装依頼書/README.md` | #70 行の進行度 |

⛔ `CLERIC_SLOTS_TABLE`(両ファイル) / `SKILL_SLOT_CURVE` / `SPELL_SLOT_CURVE_*` / `withInnateSleepList`(`index.html` 側) / `initAllySpellSlots` の本体 /
`clericAI` の梯子 / `#pmDrawer` の `max-height` と `overflow` は **1 文字も触らない**。
⛔ 引き出しの**縦を増やす行を足さない**(注記の段など)。印は既存の行の中に置く。

---

## 4. STEP1 — 着手前の基準取り(本番も tools も 1 バイトも触らない)

1. `git log --oneline -1` / `git status` を記録。**#68 着地・#69 着地(または未着手)を確かめ、#69 の実装と並走していないこと**。
2. 母集団は #68 §4 と同じ **3 段の union**:
   - 触る語 — `grep -ln "pmDrawer\|partySkills\|spellCountItem\|skillItem\|getClericSlots\|withInnateSleep\|magesleep\|clericSpellsOff" tools/*.js`
   - 変更したファイルを読む本 — `index.html` / `tavern.html` を読む本
   - 測定器のソースを読む測定器
3. 直前のチケット(#69)の非退行走査が**いまの HEAD と同じコミット**で採られていれば、その凍結 TSV を基準に流用してよい。HEAD が動いていたら採り直す。
4. **§2-3 の 3 経路と §2-4 の切り詰めを、本番 0 バイトで再現**して §12-0 に書く(ドライバ側で `localStorage` を仕込んでページを開く):
   - ② スリープ: 魔法使いの一覧からスリープを抜いて保存 → 酒場を開き直す → 一覧にスリープが戻っている。
   - ③ NPC: `partySkills.mage = []` で NPC の魔法使いを含む編成 → `index.html` で NPC 魔法使いの `equippedSkills` が既定の呪文。
   - 切り詰め: `xp` を Lv10 相当にして魔法使いに 12 個配分 → 酒場を開き直す → 5 個。
   ⚠ 再現しなければ、その経路は直さずに §12-0 へ理由を書いて止まる(起草の読み違いの可能性)。

---

## 5. STEP2 — 実装

### 5-1. 撤退の判定(両ファイル・関数で)

```js
    /* ★[#70] 撤退スイッチ ?spelloff=0 — 「使わない」の印 / 僧侶の除外 / スリープの印 /
       読み込みの切り詰めの職別化 / NPC の全部 0 を、2026-09-18 以前へ戻す。
       ⚠ const に畳まず関数にする (この行より前の関数から呼ばれても TDZ で落ちない = #54 isMageSleepOn と同じ)。
       ⚠ 各ページが独立に読む (遷移はまたがない)。 */
    function isSpellOffOn() {
      try { return new URLSearchParams(window.location.search).get("spelloff") !== "0"; }
      catch (e) { return true; }
    }
```

- `tavern.html` 側の名前は `isSpellOffOnTV`(既存の `*TV` の作法)。

### 5-2. 「使わない」の印(`tavern.html` の 2 部品)

| 部品 | 印を付ける条件 | 付けない |
|---|---|---|
| `renderSpellSlotItem`(個数の行) | 使える(`usable`)かつ個数 0 | 個数 1 以上 / Lv 不足・未習得(`.full`) |
| `renderSpellSlotItem`(僧侶の行) | 除外リストに入っている | それ以外 |
| `renderSkillItem`(入れ外しの行) | 未選択 | 選択中 |

- 印 = 行に `skillOff` クラス + 名前の行の末尾に `<span class="offTag">使わない</span>`。見た目(減光・色)は目で決める(§8「測らないこと」)。
- ⚠ Lv 不足・未習得の行は「選んでいない」のではなく「選べない」。既存の `[Lv3 必要]` 表示と混ぜない。
- `#pmDrawer` の暗幕の上で読めるよう、`#pmDrawer .offTag` の色を明示する(`:2310` のコメントの罠 = 選択中の暗い紫を焼いた字が読めない)。

### 5-3. 僧侶の除外リスト

- **保存**: `localStorage["dragonfighters.clericSpellsOff"]` = 呪文 ID の配列(例 `["shield-of-faith"]`)。無ければ空 = 今と同じ。
  読むときは僧侶の `skillPool` にある ID だけ残す(`:5416` の作法)。
- **酒場の行**: `isAuto` の行に「使う / 使わない」の切り替えボタンを 1 つ足す。押したら保存して `repaintAfterSkillChange()`。
  除外中の行は `自動 0` と印(§5-2)。⚠ `自動 N` の N は `CLERIC_SLOTS_TABLE` を直接読んでいる(`:7277`)ので、ここも除外を見る。
- **配分表の口**(§2-5): `getClericSlots` `index.html:13086` と `getClericSlotsTV` `tavern.html:5085` の**中**で、
  `isSpellOffOn()` が真なら除外リストの ID を結果から消す。⛔ `initAllySpellSlots` など呼び口の側で消さない(レベルアップと先頭の経路が漏れる)。
- ⛔ 除外した呪文の枠を他の呪文へ回さない(§1 の既定)。
- ⚠ `index.html` 側は呼ぶたびに `localStorage` を読む関数にする(ドライバが仕込んでから `initAllySpellSlots` を呼んでも効くように)。

### 5-4. スリープの印(`tavern.html` `loadSelections` `:5457`)

- 差し込みの条件に「**`dragonfighters.mageSleepSeeded` がまだ無い**」を足す(`isSpellOffOnTV()` が偽なら従来どおり毎回差し込む)。
- **印は `saveSelections` `:5484` で `partySkills` と一緒に書く**。⛔ 読み込みの中で印を書かない ——
  差し込んだ一覧を保存せずに酒場を離れると、次は印があるので差し込まれず、**保存済みの一覧にスリープが無いまま**になる(変異 `markonload`)。
- 移行の限界(書いておく): 印の無い古いセーブで、#70 より前にスリープを 0 にしていた人は、#70 の後の最初の 1 回だけスリープが戻る。保存後は守られる。

### 5-5. NPC の全部 0(`index.html:34902`)

- `isSpellOffOn()` が真なら、`hasPreset` を `Array.isArray(partySkillsMap[ally.classKey])` だけで決める(`length > 0` を外す)。
- ⚠ 主人公の経路(`heroMap`)と `defaultCasterMap` の本体は触らない。

### 5-6. 読み込み時の切り詰めを職ごとに(`tavern.html:5420`)

- `isSpellOffOnTV()` が真なら、上限を職で分ける:
  - 呪文職で自動でない(魔法使い・エルフ) … `getMaxSpellSlotsForClassTV(classKey, 10) + skillSlotsForLevel(10)`(= 魔法使い 20 / エルフ 15。呪文と入れ外しの特技が同じ配列に入るため)
  - それ以外 … 従来どおり `skillSlotsForLevel(10)`(= 5)
- ⛔ 上限を実際に配れる数より小さくしない。⚠ `:5430` の旧キー移行(戦士専用)は触らない。

---

## 6. STEP3 — 既存 golden の言い直し(必要なものだけ)

- §2-7 の見立ては予想。**素で走らせて実際に赤くなった assert の ID を控えてから**、分類 1(本チケットが構造的に変えた型)か確かめて直す。
- ⚠ 印キー `dragonfighters.mageSleepSeeded` が保存のたびに増えるので、キー集合を数える本が赤くなったら「数え方を実体から導く」形へ言い直す。
  ⛔ 印を書かないことで緑に戻さない。
- ⛔ 閾値を緩めて緑にしない。⛔ `?spelloff=0` を付けて緑に見せない。

---

## 7. 撤退スイッチ

- **`?spelloff=0`** — 次の 6 つを 2026-09-18 以前へ戻す:
  印を出さない / 僧侶の行に切り替えボタンを出さず、除外リストがあっても配分から消さない / スリープを毎回差し込む /
  読み込みで一律 5 件に切る / NPC の空配列を未設定として既定の呪文へ戻す。
- 判定位置 = `tavern.html` の `isSpellOffOnTV()` / `index.html` の `isSpellOffOn()`。**ページ遷移はまたがない**(各ページが独立に読む)。
- ⚠ 酒場を `?spelloff=0` で開いても、**前に保存した除外リストは消さない**。そのまま素の `index.html` へ行けば除外は効く(各ページが独立に読むため)。
- `?magesleep=0`(#54)とは独立。`?magesleep=0` のときはスリープ自体を差し込まない(印も書かない)。

---

## 8. 受入条件 — `tools/verify_spell_off.js`(新規・base 10351)

方針: **実プレイは使わない**。酒場の DOM・保存と読み込みの往復・本体の配分関数を、仕込んだ `localStorage` で決定論的に測る。
⭐ 非退行は **2 経路**(assert id の指紋 + 判定行の多重集合)で突き合わせる(#67 項目6)。

### ⚠ 計測機構

- 酒場はマッチング画面まで本番どおり進めて引き出しを開く(`verify_party_match_setup.js` の開き方を流用)。
  職は `sessionStorage["dragonfighters.partyMembers"]` 等で**魔法使い・戦士・僧侶を必ず含む**編成にする(`verify_cone_cast.js:1166`〜`:1202` の仕込み作法)。
- 「読み込み直し」は**同じタブで `page.goto` をもう一度**踏む(新しいタブにしない。#22 の教訓)。
  ⚠ 仕込みの `evaluateOnNewDocument` で毎回 `localStorage.clear()` すると往復が測れない ⇒ 往復の節だけは 1 回目だけ仕込む。
- 本体は `index.html` を autoplay なしで開き、`initAllySpellSlots` / `recalcAllySpellSlotsOnLevelUp` / `initLeaderSpellSlots` を**本番の関数のまま**呼ぶ
  (トップレベルの `function` は `window` のプロパティ)。
- **2 経路目**: 期待値はドライバが `CLERIC_SLOTS_TABLE` の実体と自分が仕込んだ除外リストから**独立に**組む(⛔ `getClericSlots` の戻り値を期待値にしない)。
- 変異は配信スナップショットをメモリ上で差し替え、変異ごとに別ポート(10352〜)。CRLF。アンカーがちょうど 1 箇所でなければ exit 3。アンカーは実装後の逐語で決める。
- 後始末は**このドライバが起動したもの**(内蔵サーバとこのブラウザ)だけを落とす。

### §0 装置

- **(0a)** 配信 `tavern.html` に `spelloff` の判定がちょうど 1 箇所、`index.html` にちょうど 1 箇所。
- **(0b)** 引き出しに**個数の行・入れ外しの行・僧侶の行がそれぞれ 1 行以上**描かれている(⭐ 0 行なら §1 が空振りで永久緑)。
- **(0c)** 本体で、除外なしの腕の僧侶の仲間の `maxSpellSlots` のキーが **2 個以上**(除外の差が出る母集団)。
- **(0d)** 往復の節で、2 回目の `goto` の前後で**同じタブ**であり、1 回目に保存したキーが 2 回目の読み込み前に残っている。

### §1 見せ方(酒場の引き出し)

- **(1a)** 魔法使い: 印(`skillOff`)の付いた行の集合 == **使えて個数 0** の呪文の集合(ドライバが `selection.partySkills` と習得・Lv から独立に計算)。
  個数 1 以上と Lv 不足・未習得の行には付かない。
- **(1b)** 戦士: 印の付いた行の集合 == 未選択の特技の集合。1 つ外すと印が増え、戻すと消える。
- **(1c)** 僧侶: 行の「使わない」を押すと `localStorage["dragonfighters.clericSpellsOff"]` にその ID が入り、行に印と `自動 0`。もう一度押すと両方戻る。
- **(1d)** 僧侶の除外中は、#19 優先度の候補 `apEquippedIdsFor` からその呪文が消える(戻すと現れる)。

### §2 保存と読み込みの往復(酒場)

- **(2a)** 魔法使いのスリープを 0 にして保存 → 読み込み直し → **スリープは 0 のまま**。
  ⭐ 対照を同居させる: `localStorage` を空にした初回は、スリープが一覧の **index 1** に差し込まれる(#54 の挙動を保つ)。
- **(2a2)** 印の無い状態で酒場を開き、**何も保存せずに**読み込み直す → スリープは差し込まれたまま(⭐ 読み込みで印を書く欠陥 = `markonload` の網)。
- **(2b)** `xp` を Lv10 相当にして魔法使いに **12 個**配分・保存 → 読み込み直し → **12 個**。戦士は 5 件で切られたまま(絶対量)。
- **(2c)** 僧侶の除外リストは読み込み直しても残る。

### §3 ゲーム本体の配分

- **(3a)** `clericSpellsOff = ["shield-of-faith"]` を仕込むと、僧侶の仲間の `maxSpellSlots` から **shield-of-faith だけ**が消え、
  残りのキーと個数は除外なしの腕と**完全一致**(差の assert + 絶対量)。
- **(3b)** その僧侶に `recalcAllySpellSlotsOnLevelUp` を掛けても消えたまま(⭐ 口 1 点で除外した証明)。
- **(3c)** 先頭の経路 `initLeaderSpellSlots("cleric", lv, …)` の `currentMaxSpellSlots` からも消える。
- **(3d)** `partySkills.mage = []` / `partySkills.elf = []` で、NPC の魔法使い・エルフの `equippedSkills` が**空**(素) / 既定の呪文(`?spelloff=0`)。
- **(3e)** 本番の `clericAI` を、除外した呪文だけが成立する盤面で複数回回す → その呪文の詠唱 0 回・枠の消費 0(素)。除外なしの腕では 1 回以上。
  (盤面の作り方は `verify_hold_person.js` の `aiCast` を流用。確率ゲートがあるので回数で締める)

### §4 保存キーの作法

- **(4a)** 新しい 2 キーが `dragonfighters.` で始まり、`DFSlots.snapshot()` の中身に含まれ、`KEEP` に入っていない(§2-6)。

### §5 撤退

- **(5a)** 酒場 `?spelloff=0`: 印 0 個 / 僧侶の行に切り替えボタン無し / (2a) でスリープが戻る / (2b) で 5 個に切られる。
  ⭐ 素の腕の §1・§2 と**同じ assert 本体**を当てて崩れることで見る。
- **(5b)** 本体 `?spelloff=0`: (3a) の除外が効かない / (3d) で既定の呪文。

### ⛔ 測らないこと

- 印の色・減光の度合い・「使わない」の文言(目で決める)。
- 引き出しの寸法(⚠ ただし `#pmDrawer` の `max-height` / `overflow` は触らない = 既存 `verify_pm_drawer_fit` が守る)。
- 実プレイの発射率・難易度。
- 除外した僧侶の枠の行き先(回さない = §1 の既定。回す仕様は別チケット)。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **`viewonly`** | ⭐ 僧侶の除外を保存・表示するが、`getClericSlots` では消さない(09-16 の「見せ方だけ」の再現) | (3a) (3e) |
| **`initonly`** | ⭐ 除外を `initAllySpellSlots` の中だけで掛ける(口 1 点でない) | (3b) (3c) |
| `tablerow` | 僧侶の行の `自動 N` を `CLERIC_SLOTS_TABLE` から直接読んだまま | (1c) |
| `apcand` | `apEquippedIdsFor` が除外を見ない(`getClericSlotsTV` を通さず表を読む) | (1d) |
| **`sleepevery`** | ⭐ スリープを印に関係なく毎回差し込む(§2-3 ②の再現) | (2a) |
| **`markonload`** | ⭐ 印を `saveSelections` でなく読み込みの中で書く(§5-4 の罠) | (2a2) |
| **`presetlen`** | ⭐ `hasPreset` に `length > 0` を戻す(§2-3 ③の再現) | (3d) |
| **`slice5`** | ⭐ 呪文職も 5 件で切る(§2-4 の再現) | (2b) |
| **`noprefix`** | ⭐ 除外キーを `dragonfighters.` で始まらない名前で保存する(§2-6 の罠) | (4a) |
| `offfull` | Lv 不足・未習得の行にも印を付ける | (1a) |
| `offselected` | 入れ外しの行で選択中にも印を付ける | (1b) |
| `switchdead` | 両ページの撤退判定を常に真にする | (5a) (5b) |

- ⭐ 各変異の走行に (0a)(0b) を入れ、**変異ページが起動したこと**を毎回ログに出す。
- ⚠ 担当表は机上で確定させない。`--only <tag>` で 1 本ずつ走らせ、**実際に赤くなった節を見てから**書く。

### 既存 golden の非退行(実装後に必ず走らせる)

- STEP1 の母集団(§4)を**全数**、着手前と同じ順で直列に再走し、2 経路で突き合わせて **緑→赤 0** を示す。新規 `verify_spell_off` も足す。
- 名指しで必ず見る本(⚠ 基準値は STEP1 の実測を正とする。記録値を写経しない):
  `verify_party_match_setup` / `verify_pm_drawer_fit` / `verify_darkvision` / `verify_prep_retire` / `driver_equip_compact_ios` /
  `verify_recruit_talk`(素 + `--negative`) / `verify_save_slots` / `verify_mercenary_roster` / `driver_action_priority` /
  `verify_hold_person` / `verify_aoe_coverage` / `verify_cone_cast` / `verify_bolt_aim`。

---

## 9. 実機/実感の確認(ここが本当の受入)

- 引き出しを開いて、**どの技を使わないことにしているか**が一目で分かるか(個数の行・入れ外しの行・僧侶の行の 3 種とも)。
- 「使わない」の印が暗幕の上で読めるか。印で行が折り返して窮屈にならないか(iPhone 縦)。
- 僧侶で呪文を「使わない」にして潜ったとき、本当に唱えないか。枠の総数が減ることに違和感が無いか(§1 の既定)。
- 魔法使いのスリープを 0 にして、街やワールドマップを経由して戻っても 0 のままか。
- Lv4 以上の魔法使いで上限いっぱいに配分し、酒場を出入りしても個数が減らないか。
- ⚠ ローカルは http 起動が必須(`file://` では音が出ない)。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>使わない魔法・特技がひと目で分かるように</b> — マッチング画面の設定で、個数 0 や外した技に「使わない」と出る。僧侶も呪文ごとに使わないを選べる。スリープを 0 にしても戻らず、高 Lv の魔法使いの配分も減らなくなった。"

---

## 11. やらないこと

- ⛔ 僧侶が除外した呪文の枠を、他の呪文へ回す(§1 の既定)。
- ⛔ 魔法使い・エルフに別の禁止リストを足す(個数 0 で表せる = 09-16 の決定)。
- ⛔ 僧侶を手動の個数配分へ作り替える。
- ⛔ 主人公が先頭の呪文職のとき、`equippedSkills` が重複込みの配列を 3 件で切る件(§2-8)。別チケット候補。
- ⛔ `#pmDrawer` の寸法・スクロール・段の構成の変更(#56 の地雷)。
- ⛔ 行動の優先度(#19)の UI の変更(候補から除外が消えるのは §5-3 の副作用として受ける)。
- ⛔ ライトニングボルトの壁反射 / 撃てる率の本命 2 件(梯子・視線)— 実装窓から 2026-09-17 に受領した別候補。
- ⛔ **`driver_action_priority` の変異 N3 のアンカー腐敗**(§2-7。#35 以来 18 日間 `--negative` が 1 本も走っていない)。
  同じ引き出しを触るチケットだが、直すのは**測定器の側**で本チケットの本番変更とは別物 ⇒ 別チケット候補。
- ✅ **`実装依頼書/README.md` への行追加**は承認時(2026-09-18)に起草窓が足した。足した行:

      | 70 | [2026-09-18_spell-off-visibility.md](2026-09-18_spell-off-visibility.md) | **承認済**(2026-09-18)・⏸ #69 の着地後 | 0% | マッチング画面で**使わない魔法・特技をひと目で分かる**ように + **僧侶も除外を選べる**。⚠⚠⚠ 起草前の実測で「0 = 使わない」が崩れる経路が 3 つ(僧侶は選べない / スリープは読み込みで戻る / NPC の全部 0 は既定の呪文)⇒ 全部直す。⚠⚠ 読み込みで呪文職も 5 件に切られる(魔法使い Lv4+ / エルフ Lv6+)⇒ 職別の上限へ。⭐ 僧侶の除外は `getClericSlots` の中 1 点(変異 `initonly`)/ 印は保存時に書く(変異 `markonload`)/ 新キーは `dragonfighters.` で始める(変異 `noprefix`)。除外した枠は他へ回さない |

---

## 12. 実装結果

(実装窓が埋める)
