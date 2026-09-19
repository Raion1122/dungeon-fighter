# #70 使わない魔法・特技をひと目で分かるように + 僧侶も選べるように(0 が守られない 3 経路の修正込み)

- **起草**: 2026-09-18(起草窓 `claude-f8` / セッション `6fb3c892`) / **ステータス**: **承認済**(2026-09-18 ユーザー承認)
- **着手**: ⏸ **#69 の着地後**(同じ `index.html` / `tavern.html` を触る)。⭐ 僧侶の除外枠を他へ回さない既定(§1)も承認済み。
  ⚠ 本書の行番号は `d9c8cbf` 時点。#68 は `78c7474` で着地済み(`index.html` は +75 行)で、#69 でも動く ⇒ **識別子で引き直してから**着手する。
- **訂正(2026-09-19 起草窓)**: #69 着地後の HEAD `92e66c6` で実装窓が着手前プローブを回し、本書の主張が **3 件**崩れた。
  実装窓の報告を起草窓が**独立に追試して確認済み** ⇒ 該当箇所(§2-3 ③ / §2-4 / §2-7 / §5-5 / §5-6 / §8 の変異表)を本書内で訂正した。
  ⭐ 3 件とも「1 行だと思っていたものが **2 行**」「1 箇所だと思っていたものが **2 箇所**」「名指し 11 本に対し grep は **13 本**」= **逐語と本数の取り違え**。
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

- `index.html` の `hasPreset`(HEAD `92e66c6` で `:34958`〜`:34959`。起草時 `d9c8cbf` は `:34902`)。
  ⚠⚠ **1 行ではなく 2 行にまたがる**(2026-09-19 に実装窓が報告 → 起草窓が追試):

      const hasPreset = !!(partySkillsMap && Array.isArray(partySkillsMap[ally.classKey])
        && partySkillsMap[ally.classKey].length > 0);

- `hasPreset` が偽だと `defaultCasterMap` `:34721`(`defaultSkills` の呪文を 2 枠ずつ)へ戻る。**空配列 = 未設定**と同じ扱い。
- 主人公本人は `heroMap` を使うので効かない。**NPC の仲間だけ**が既定の呪文を撃つ。
- 一方、酒場は空配列を「全部外した状態」として尊重している(`:5415` のコメント「空配列でも尊重する … AI もスキル使用しない」)= **2 ファイルで解釈が逆**。
- ✅ 直しても既定の編成は変わらない: 酒場の既定配分 `PARTY_SLOTS[].defaults`(`:4504`〜`:4514`)は **6 職とも空でない** ⇒ 空配列はプレイヤーが全部外したときにしか生まれない。

**成り立っていた経路(直さない)**

- 戦士・ドワーフ・盗賊の特技: 空配列も `Array.isArray` で拾われ、`equippedSkills = []`(`:34885` / 先頭は `:34850`)。外せば本当に使わない。
- 魔法使い・エルフの主人公: 個数 0 は `initAllySpellSlots` の `if (n > 0)`(`:13936` 付近)で配られない。

### 2-4. ⚠⚠ 酒場を読み込み直すと、呪文職の配分が 5 個に切り詰められる

- `tavern.html` の `loadSelections`(HEAD `92e66c6` で `:5433`。起草時 `d9c8cbf` は `:5420`): 保存された `partySkills` を読むとき、**職を問わず** `.slice(0, skillSlotsForLevel(10))` = **5 件**で切る。
  ⚠⚠ **この逐語は `tavern.html` に 2 箇所ある**(`:5433` = 直す本体 / `:5443` = 戦士の旧キー移行 = ⛔ 触らない)⇒ 逐語で引くと 2 件。唯一に引く語は §5-6 に実測値を置いた。
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

⚠⚠ **以下の名指しは 11 本だが、§4 の 8 語 grep は HEAD `92e66c6` で 13 本を返す**。増分 = `driver_monsters_chimera` /
`driver_monsters_griffon` で、どちらも **`magesleep`** の語で入る(2026-09-19 に実装窓が報告 → 起草窓が追試)。
⛔ **本数を定数で焼かず、毎回 grep で導出する**こと。

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
   - 切り詰め: `xp` を Lv10 相当にして魔法使いに 12 個配分 → 酒場を開き直す → **素の腕では 6 個**
     (`.slice` が 5 件へ切った**後ろ**の `:5470` で #54 のスリープ差し込みが index 1 へ 1 個足すため = **欠陥 2 つの合成**)。
     ⇒ 切り詰めだけを見る腕は `?magesleep=0` で **5 個**、または一覧に元から `sleep` を含めて **5 個**。
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

### 5-5. NPC の全部 0(`index.html` の `hasPreset` = HEAD `92e66c6` で `:34958`〜`:34959`)

- `isSpellOffOn()` が真なら、`hasPreset` を `Array.isArray(partySkillsMap[ally.classKey])` だけで決める(`length > 0` を外す)。
- ⚠⚠ **`hasPreset` は 2 行にまたがる**(§2-3 ③)⇒ 変異 `presetlen` のアンカーも **2 行の逐語**で書く。1 行で探すと **0 件 = exit 3**。
- ⚠ 主人公の経路(`heroMap`)と `defaultCasterMap` の本体は触らない。

### 5-6. 読み込み時の切り詰めを職ごとに(`tavern.html` の `loadSelections` = HEAD `92e66c6` で `:5433`)

- `isSpellOffOnTV()` が真なら、上限を職で分ける:
  - 呪文職で自動でない(魔法使い・エルフ) … `getMaxSpellSlotsForClassTV(classKey, 10) + skillSlotsForLevel(10)`(= 魔法使い 20 / エルフ 15。呪文と入れ外しの特技が同じ配列に入るため)
  - それ以外 … 従来どおり `skillSlotsForLevel(10)`(= 5)
- ⛔ 上限を実際に配れる数より小さくしない。⚠ 旧キー移行(戦士専用 = HEAD `92e66c6` で `:5443`。起草時 `:5430`)は触らない。
- ⚠⚠ **変異 `slice5` のアンカーに `.slice(0, skillSlotsForLevel(10))` 単体を使わない**(2 箇所 = exit 3)。
  起草窓が HEAD `92e66c6` で数えた**ちょうど 1 箇所の語**(どれでも可):
  `.filter(id => validIds.has(id))` / `partySkills[slot.classKey] = migrated;` / 行頭空白を含む `^\s+\.slice\(0, skillSlotsForLevel\(10\)\)` /
  (⛔ 触らない移行側を名指すなら)`old.slice(0, skillSlotsForLevel(10))`。

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
  ⚠⚠ **12 個の一覧に `sleep` を必ず含める**(または `?magesleep=0` の腕で測る)。含めないと直した後も
  `withInnateSleepListTV` が index 1 へ 1 個足して **13 個**になり、(2b) が理由なく赤くなる。
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

- **(5a)** 酒場 `?spelloff=0`: 印 0 個 / 僧侶の行に切り替えボタン無し / (2a) でスリープが戻る /
  (2b) の配分が **6 個**(= 5 件への切り詰め + スリープ差し込み 1)。
  ⚠ 「5 個」で書かない。切り詰め単体を見る腕は `?magesleep=0` を足して **5 個**。
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
| **`presetlen`** | ⭐ `hasPreset` に `length > 0` を戻す(§2-3 ③の再現)。⚠⚠ アンカーは **2 行の逐語**(§5-5) | (3d) |
| **`slice5`** | ⭐ 呪文職も 5 件で切る(§2-4 の再現)。⚠⚠ `.slice(0, skillSlotsForLevel(10))` 単体は **2 箇所** ⇒ §5-6 の唯一語で引く | (2b) |
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

### 12-0. 着手前の基準取り(STEP1 / 2026-09-19・実装窓 `claude-a1` セッション `f2b13284-7fe6-4bea-8786-32a2a9f856c0`)

⛔ **本番(`index.html` / `tavern.html` / `audio.js`)も `tools/` も 1 バイトも触っていない**(測っただけ)。
使い捨ての計測スクリプトは scratchpad
`…\Temp\claude\c--Users-PC-User-Desktop------------\f2b13284-7fe6-4bea-8786-32a2a9f856c0\scratchpad\base70\` に置いた。

#### (a) 基準

| 測ったもの | 実測 |
|---|---|
| `git log --oneline -1` | `92e66c6 #69 項目5 — 母集団 150 走行の非退行 …` |
| `git status --short` | **0 行**(着手時点) |
| `git log origin/main..HEAD --oneline` | **0 行**(未 push 0) |
| `index.html` | **39,595 行** / bytes 2,513,353 / lone LF **0** = 純 CRLF |
| `tavern.html` | **10,599 行** / bytes 640,584 / lone LF **0** = 純 CRLF |
| 本依頼書 `.md` | ⚠ **純 LF**(LF 428 / CR **0**)⇒ 追記は LF で書くこと |

⇒ **#69 は着地済みで、#70 と並走していない**。
⭐ 窓の身元は名前でなく `~/.claude/sessions/<pid>.json` の `sessionId` で引いた:
実装窓 = `claude-a1` / `f2b13284-…`(pid 28300)、起草窓 = `claude-cc` / `0e9709e5-…`(pid 9600)。
⚠⚠ **着手中に起草窓が本依頼書を編集していた**(11:27:30・未コミット +25/-7)。
内容は本書 §2-3③ / §2-4 / §2-7 / §5-5 / §5-6 / §8 の訂正で、全文を読んだうえで
**本コミットに同梱**した(git はファイル単位でしか commit できないため)。起草窓へはコミット前に通告済み。
⇒ ⭐ **以後この `.md` の持ち主は実装窓**。起草窓からの追記は直接編集でなくメッセージで受ける。

#### (b) 母集団 — 3 段の union で **140 本**(⛔ 本数は定数で焼かず毎回導出する)

`tools/*.js` = **147 本**。判定は**コメントを落としてから**行った(#66 の教訓)。導出器 = `base70/pop70.py`。

| 段 | 引き方 | 本数 |
|---|---|---|
| 段1 | 触る語 8 つ(`pmDrawer` / `partySkills` / `spellCountItem` / `skillItem` / `getClericSlots` / `withInnateSleep` / `magesleep` / `clericSpellsOff`) | **13** |
| 段2 | `index.html` / `tavern.html` をコードで読む本 | **138** |
| 段3 | 他の `tools/*.js` を**ソースとして読む**測定器 | **5** |
| — | **union** | **140** |

- 段1 の 13 本は**すべて段2 の真部分集合**(増分 0)。⚠ 本書 §2-7 の名指し 11 本に対し grep は 13 本
  (`driver_monsters_chimera` / `driver_monsters_griffon` が `&magesleep=0` の**実コード**で入る。コメントではない)。
- ⭐⭐⭐ **union を増やしたのは段3 だけ**(**+2 本** = `verify_world_heromark` / `verify_world_steps`)。
  この 2 本は `index.html` / `tavern.html` を**コメントでしか**言及しないので段2 では落ちるが、
  `verify_world_steps` → `verify_quest_walk`、`verify_world_heromark` → `verify_world_steps` とソースを読むため入る。
  ⇒ ⛔ **「段2 だけで足りる」と結論しない**(#67 では段3 が union を 1 本も増やさなかったが、#70 では 2 本効いた)。
- 段3 の内訳: `verify_enemy_name_label`→`driver_cast_circle` / `verify_eol_doorfix`→`driver_doors_p2,p5,p8`+`verify_road_ambush` /
  `verify_hold_person`→`driver_action_priority`+`verify_walk_block` / `verify_world_heromark`→`verify_world_steps` /
  `verify_world_steps`→`verify_quest_walk`。
- コメントだけの言及で**母集団外**とした本 = 4 本(`_doors_fixture` / `sim_plaza_entry` / `verify_world_heromark` / `verify_world_steps`。
  後ろ 2 本は段3 で拾い直している)。
- 一覧の実体: `base70/pop70_union.txt`(140 行)/ 段ごとの内訳 `base70/pop70_stages.json`。

#### (c) 流用の可否 = **可**。根拠は blob OID(⛔ コミット数では判定しない)

#69 項目5 の非退行走査(150 走行・269.0 分)は **`d0325a6`(#69 項目4)の木**で採られていた。
`d0325a6` → `92e66c6` の差分は **`実装依頼書/*.md` 2 ファイルだけ**(`git diff --name-status` で確認)。

    $ git rev-parse d0325a6:index.html   92e66c6:index.html
    6fa9e220df9c76470a31fdd685767eef310c3147   (両方とも同じ)
    $ git rev-parse d0325a6:tavern.html  92e66c6:tavern.html
    f3315071fe5ee6e3feb5a5df2590a57f8fb19e9a   (同上)
    $ git rev-parse d0325a6:audio.js     92e66c6:audio.js
    b3aaa1fd2b93a379877fd6b861e01213386e5c61   (同上)
    $ git rev-parse d0325a6:tools        92e66c6:tools     ← ツリー
    406aead025a003eff9a3f08c105874fd351eb5bf   (同上)

さらに**作業ツリーの実体**とも突き合わせた(`git hash-object index.html tavern.html audio.js` = 上の 3 つと一致)。
⭐ 決め手は #69 の走査が自分で残していた `state_before.txt` で、そこに焼かれた 4 つの OID が
**上とすべて一致**した ⇒ ドライバが見る世界は byte 同一。

- 凍結した基準: **`base70/baseline70.tsv`**(列 = `name` / `arg` / `exit` / `secs` / `in_pop70` / `source` / `summary` / `note`)。
  = #69 の 150 走行 + **#70 で母集団に増えた本の実走 3 行** + #69 が単独実走した `probe_party_size` の記録 1 行 = **154 行**。
  union 140 本を **149 走行**(素 140 + 追加の腕 9)で**漏れなく**覆う(「union のうち基準に 1 行も無い本 = **0**」を機械で確認)。
- 2 経路の突き合わせ材料も自分の scratchpad へ退避済み(前セッションの scratchpad は消えうるため):
  `base70/from69/fp68_ids_after69.tsv`(assert id の指紋)/ `base70/from69/fp68_lines_after69.tsv`(**判定行の多重集合**)/
  `summary68_after69.tsv` / `result_after69.FINAL.tsv` / `runlist69.txt` / `population69.txt` / `outside69.txt` / `state_before.txt`。
  ⭐ 原本と md5 一致を確認(`61ca77ee7823b994d6be10dcc1443bcb`)。

**増えた本 3 本だけを実走した**(腕の粒度で突き合わせ。導出器 `base70/diff70.py`):

| 本 | 腕 | exit | 秒 | 所見 |
|---|---|---|---|---|
| `_golden.js` | (素) | 0 | 0.1 | **ライブラリ**(`module.exports` のみ)。出力 0 行・assert 0 本 = **色を持たない** |
| `_pptr_profile.js` | (素) | 0 | 0.1 | **ライブラリ**。引数なしは使い方を出して exit 0。assert 0 本 |
| `auto_debug_run.js` | `--runs 2 --scen goblin-mine --port 10347 --timeout-min 3` | **1** | 426.0 | 調査ランナー。exit = 「N ラン完走したか」。1 ラン **254 秒**で 3 分予算に入らず 1/2 ⇒ exit 1。**時間予算依存で検出器ではない** |

⚠ `probe_party_size` は #69 の母集団に在り、#69 が**単独実走**(600 秒打ち切り → exit 1)したので流用した。
⚠ 逆に #69 が回して **#70 の母集団外**の本 = 5 本(`driver_bgm_title` / `driver_doors_p1` / `probe_town_mask` /
`verify_codex_map_skill` / `verify_road_events`)。#69 の `outside69.txt` 7 本のうち残り 2 本は上記のとおり **#70 では母集団内**。

#### (c2) 着手前の色 — 母集団 149 走行のうち **緑 129 / 非緑 20**

⛔ **非緑 20 をそのまま「赤 20」と読まないこと**(#67 の教訓)。内訳:

- **引数ガードの即死 exit 3 = 正常が 3 本**: `probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map`。
  引数付きの腕(`--places` / `--kinds` / `--bfs`)は**どれも exit 0**。
- **健全なときに exit 1 を返す本が 1 本**: `probe_n4_stall`(「停滞は観測されませんでした」)。
- **既知フレーク(両方向に転ぶ)**: `probe_n4_stall` / `driver_field_wagon` / `driver_monsters_chimera` /
  `driver_monsters_hobgoblin` / `driver_monsters_griffon`。⇒ ⚠ **1 回の色で退行と判定しない**。
- **着手前から赤(#70 の責任ではない)**: `driver_action_priority --negative`(#35 `97f350d` 以来。本書 §2-7 のとおり
  変異 N3 のアンカーが `tavern.html` に 2 箇所。**HEAD でも 2 箇所のまま**)/ `probe_party_size`(600 秒で自力終了しない)。
- **そのほかの安定した非緑**: `driver_mapeditor_painting` / `driver_grid_p4`(exit 3) / `driver_grid_p8` / `driver_mapeditor` /
  `driver_monsters_umberhulk` / `driver_sce1_events` / `driver_speech_engine` / `driver_speech_v2` /
  `sweep_recruit_balance` / `verify_walk_block` / `driver_field_step6`(1860.6 秒 = **この所要が正常**)。
- ⭐ 名指しで見る本(§8)は**全部緑**: `verify_party_match_setup` / `verify_pm_drawer_fit` / `verify_darkvision` /
  `verify_prep_retire` / `driver_equip_compact_ios` / `verify_recruit_talk` / `verify_save_slots` /
  `verify_mercenary_roster` / `driver_action_priority`(素) / `verify_hold_person`(素 + `--negative`) /
  `verify_aoe_coverage`(素 + `--negative`) / `verify_cone_cast`(素 + `--negative`) / `verify_bolt_aim`(素 + `--negative`)。
- ⚠⚠ **母集団の全数再走は 269.0 分**(#69 実測)。この機械は #68 比 **約 2.6 倍遅い** ⇒ 項目5 は **270〜300 分**を見込む。
  ⛔ 並列で回さない(Chrome 競合で偽の赤)。

#### (d) §2-3 の 3 経路 + §2-4 の切り詰めを本番 0 バイトで再現 — **5/5 すべて再現した**

計測器 = `base70/repro70.js`(scratchpad の使い捨て。`localStorage` を仕込んで本番の関数をそのまま呼ぶ)。
生ログ = `base70/repro70_out.txt`。ポートは酒場 10348 / 本体 10349(どちらも走行後に解放を確認)。
⭐ `③` の `hasPreset` は**自分で書き写さず `index.html` の実バイトから逐語で取り出して** `new Function` で組んだ
(書き写すと「実装とドライバが同じ誤りを持つ」事故になる)。

**① 僧侶は選べない — 再現した(2 経路とも)**

- 酒場側: `renderSpellSlotItem({id:"cure-light-wounds",…}, "cleric", …)` の返す行は
  **`button` 0 個 / `.spellAuto` あり / `.spellCountCtrl` なし**。
  対照に同じ関数へ `"mage"` / `magic-missile` を通すと **`button` 2 個(± ボタン)**。
  ⇒ 僧侶の行には「使わない」を表す操作系が**1 つも無い**。
- 本体側: `initAllySpellSlots(a, "cleric", 5, map)` を 3 腕で回した:

      map なし     -> {"cure-light-wounds":3,"shield-of-faith":2,"turn-undead":1,"hold-person":1}
      空配列       -> (同一)
      ["bless"]    -> (同一)

  ⇒ **`partySkills` を 1 ビットも見ていない**。

**② 魔法使いのスリープが戻る — 再現した**

      保存した一覧        {"mage":["magic-missile","fire-bolt","arcane-shield"]}
      同タブで開き直した後 ["magic-missile","sleep","fire-bolt","arcane-shield"]   ← index 1 に差し込まれた
      localStorage        {"mage":["magic-missile","fire-bolt","arcane-shield"]}   ← 保存側は変わらない

⭐ **読み込みは保存し直さない**(`localStorage` は仕込んだまま)。⇒ ユーザーが保存し直すまでデータは壊れない。

**③ NPC の全部 0 — 再現した(エルフも)**

      partySkills.mage = []            -> hasPreset=false / equippedSkills=["magic-missile","sleep","fire-bolt","arcane-shield"]
                                          maxSpellSlots={"magic-missile":2,"sleep":2,"fire-bolt":2,"arcane-shield":2} (合計 8)
      対照 mage=["magic-missile"]      -> hasPreset=true  / equippedSkills=["magic-missile"] / max={"magic-missile":1}
      partySkills.elf  = []            -> hasPreset=false / equippedSkills=["aimed-shot","magic-arrow","cure-minor"]

**§2-4 の切り詰め — 再現した。ただし ⚠⚠ 素の観測は 5 個ではなく 6 個**

`xp=45000`(Lv10 相当)で魔法使いに **12 個**配分して保存 → 同タブで開き直すと:

      素で開き直す                 -> 6 個 ["magic-missile","sleep","magic-missile","magic-missile","magic-missile","fire-bolt"]
      ?magesleep=0 で開き直す      -> 5 個 ["magic-missile","magic-missile","magic-missile","magic-missile","fire-bolt"]
      一覧に元から sleep を入れる  -> 5 個 ["sleep","magic-missile","magic-missile","magic-missile","magic-missile"]
      (魔法使い Lv10 の呪文上限 = 15 / skillSlotsForLevel(10) = 5 / localStorage 側は 12 個のまま)

⭐⭐⭐ **切り詰め(`slice(0,5)`)の「後ろ」で #54 のスリープ差し込みが 1 個足すので、
2 つの欠陥が合成されて観測値が 6 になる。** 切り詰め自体は確かに 5 件。

#### 崩れた主張(⚠ #70 を実装する前に必ず読むこと)

| # | 本書の主張 | HEAD `92e66c6` の実測 |
|---|---|---|
| 1 | §2-3③ / §5-5: `hasPreset` は **1 行** | ⚠⚠ **2 行**(`index.html:34958`〜`:34959`)。1 行で探すと 0 件 = 変異 `presetlen` が exit 3 ⇒ **起草窓が本書内で訂正済み** |
| 2 | §2-4 / §5-6: `.slice(0, skillSlotsForLevel(10))` の逐語で 1 箇所 | ⚠⚠ **2 箇所**(`:5433` = 直す本体 / `:5443` = 戦士の旧キー移行 = ⛔ 触らない)⇒ **起草窓が唯一語つきで訂正済み** |
| 3 | §2-7: 母集団の第1段は名指し **11 本** | **13 本**(`driver_monsters_chimera` / `driver_monsters_griffon` が `magesleep` で入る)⇒ **起草窓が訂正済み** |
| 4 | ⭐ §4-4 / §8 (2b)(5a): 12 個配分 → 開き直し → **5 個** | ⚠⚠ **素の腕では 6 個**(上記)。⇒ **受入の期待値は「5」と書けない。** `?magesleep=0` を掛けた腕か、一覧に元から `sleep` を入れた腕でのみ 5。⛔ 「6 に直す」でなく「**スリープ差し込みを止めた腕で 5**」と書く(2 つの欠陥の合成を assert に畳み込まない) |
| 5 | ⭐ §8 (0c)(3a): 僧侶の `maxSpellSlots` の期待値 | ⚠ `getClericSlots(5)` は **8 キー**返すが、`initAllySpellSlots` が `isSpellKnown` で**完全ゲート**するので仲間の `maxSpellSlots` は **4 キー**(`cure-light-wounds` / `shield-of-faith` / `turn-undead` / `hold-person`)。⇒ **期待集合を組むとき習得ゲートも掛けないと (3a) が外れる**。⭐ (0c)「2 個以上」は 4 で成立 |
| 6 | §2-9: `index.html` 39,539 行 / `tavern.html` 10,586 行 | **39,595 行 / 10,599 行**(#69 で +56 / +13)。両方とも純 CRLF は不変 |
| 7 | — | ⭐ 読み込みは `localStorage` を**保存し直さない**(12 個のまま残る)⇒ §5-4 の「移行の限界」は思ったより軽い。ユーザーが保存するまで元データは無傷 |
| 8 | — | ⚠ `defaultCasterMap("elf", 5)` は `["aimed-shot","magic-arrow","cure-minor"]` を返すが、酒場の `PARTY_SLOTS` のエルフ既定は `["aimed-shot","hunters-mark","cure-minor"]` = **2 ファイルで既定が一致していない**。本チケットでは触らない(§11 行き候補) |

#### ポート / 後始末 / 次への申し送り

- 今回使ったポート **10347**(`auto_debug_run` のプローブ)/ **10348**(酒場)/ **10349**(本体)は**すべて解放済み**
  (`Get-NetTCPConnection` で LISTEN 0 件 / `tools` を読む node 0 本を確認)。
  ⚠ **8765 はユーザー自身のローカル再生サーバ**なので落としていない。
- 新規ドライバ `tools/verify_spell_off.js` の **base 10351 は空き**(`tools/*.js` の先客の最大は 10343。
  `1035x` の grep ヒットは LCG 定数 `1103515245` でポートではない)。変異帯 10352〜10363 も空き。
- 作業ツリーは本コミット前後で **`実装依頼書/2026-09-18_spell-off-visibility.md` の 1 ファイルだけ**が M
  (= 本番 0 バイト。`git hash-object index.html tavern.html audio.js` が HEAD の blob と一致することを再確認済み)。

### 12-1. STEP2 の実装(項目2 / 2026-09-19・実装窓 `claude-a1` セッション `f2b13284-…`)

§5 の 6 節 + §7 の撤退スイッチ + §10 の changelog を **1 コミット**に畳んだ。
⛔ `CLERIC_SLOTS_TABLE` / `SKILL_SLOT_CURVE` / `SPELL_SLOT_CURVE_*` / `index.html` の `withInnateSleepList` /
`initAllySpellSlots` の本体 / `clericAI` の梯子 / `#pmDrawer` の `max-height` と `overflow` /
`tavern.html` の戦士の旧キー移行 は **1 文字も触っていない**。

#### (a) 置いた場所と逐語(⚠ 行番号は本コミット時点。使う前に識別子で引き直すこと)

| 何 | ファイル:行 | 逐語(変異アンカーの候補) |
|---|---|---|
| 撤退の判定 | `tavern.html:5151` | `function isSpellOffOnTV() {` / `get("spelloff") !== "0"` |
| 撤退の判定 | `index.html:13102` | `function isSpellOffOn() {` |
| 除外リスト(酒場) | `tavern.html:5161`〜 | `const CLERIC_OFF_KEY_TV = "dragonfighters.clericSpellsOff";` / `function clericSpellsOffTV() {` / `function saveClericSpellsOffTV(ids) {` / `function isClericSpellOffTV(id) {` |
| 除外リスト(本体) | `index.html:13110`〜 | `function clericSpellsOffIds() {` |
| **配分表の口(酒場)** | `tavern.html:5192` | `if (isSpellOffOnTV()) for (const id of clericSpellsOffTV()) delete out[id];` |
| **配分表の口(本体)** | `index.html:13128` | `if (isSpellOffOn()) for (const id of clericSpellsOffIds()) delete out[id];` |
| スリープの印 | `tavern.html:5252`〜 | `const MAGE_SLEEP_SEEDED_KEY_TV = "dragonfighters.mageSleepSeeded";` / `function mageSleepSeededTV() {` / `function markMageSleepSeededTV() {` |
| 差し込みの条件 | `tavern.html:5587` | `if (partySkills.mage && !(isSpellOffOnTV() && mageSleepSeededTV()))` |
| 印を書く口 | `tavern.html:5621` | `markMageSleepSeededTV();`(⭐ `saveSelections` の中。⛔ 読み込みの中には無い) |
| 切り詰めの職別化 | `tavern.html:5540` / `:5546` | `const keepCap = (isSpellOffOnTV() && isCasterClassTV(slot.classKey) && !isAutoSlotClassTV(slot.classKey))` / `.slice(0, keepCap);` |
| 印(個数の行 / 僧侶の行) | `tavern.html:7419`〜 | `const clericOff = isAuto && isClericSpellOffTV(sk.id);` / `const isOff = isSpellOffOnTV() && (isAuto ? clericOff : (usable && cnt <= 0));` / `const autoShown = (isAuto && known && !clericOff) ? autoFromTable : 0;` |
| 僧侶の切り替えボタン | `tavern.html:7445` | `class="clericOffBtn"` |
| 印(入れ外しの行) | `tavern.html:7568` | `const isOff = isSpellOffOnTV() && !selected;` |
| NPC の全部 0 | `index.html:34990`〜`:34991` | ⚠⚠ **2 行**: `const hasPreset = !!(partySkillsMap && Array.isArray(partySkillsMap[ally.classKey])` + 改行 + `          && (isSpellOffOn() || partySkillsMap[ally.classKey].length > 0));` |

- **印の DOM**: 行に `skillOff` クラス + 名前の `span.sName` の**末尾**に `<span class="offTag">使わない</span>`。
  ⚠ `.offTag` は **inline のまま**(inline-block にしない)= インライン要素の padding/border は行ボックスの高さを
  変えないので、引き出しの縦が 1px も伸びない。枠線も太さを変えず**色だけ**替えた(2px のまま = 中身が 1px もずれない)。
- **CSS**: `tavern.html:655`〜(素の羊皮紙 `.skillItem.skillOff` / `.skillItem .offTag` / `.clericOffBtn`)、
  `:893`〜(縦持ちの文字サイズ)、`:2363`〜(`#pmDrawer` の上書き = 暗幕の上で読める色)。
- **新キー 2 本**: `dragonfighters.clericSpellsOff`(呪文 ID の配列)/ `dragonfighters.mageSleepSeeded`(`"1"`)。
  どちらも `dragonfighters.` 始まり ⇒ `js/save-slots.js` の `keysOf()` の前方一致に載る。

#### (b) ⚠⚠ 起草時の見立てが変わった点

| # | 元 | 実装後 |
|---|---|---|
| 1 | §5-6 の変異 `slice5` は `.slice(0, skillSlotsForLevel(10))` が **2 箇所**なので唯一語が要る | 本体を `.slice(0, keepCap);` へ言い直したので、`.slice(0, skillSlotsForLevel(10))` は **1 箇所**(⛔ 触らない戦士の旧キー移行 `:5556`)だけになった。⇒ 変異 `slice5` のアンカーは `.slice(0, keepCap);` か `const keepCap = (isSpellOffOnTV()` で引く(どちらも実測 1 箇所) |
| 2 | §2-7: 本チケットは `apEquippedIdsFor` の**中**を触る | ⭐ **1 バイトも触らなかった**。`apEquippedIdsFor` は `getClericSlotsTV` を通るので (1d) は自動で効く ⇒ 変異 N3 のアンカー `const equippedIds = apEquippedIdsFor(slot, classKey);` は **2 箇所のまま**(実測 2) |
| 3 | §8 (0a) 「`spelloff` の判定がちょうど 1 箇所」 | **判定**(`get("spelloff")`)は各ファイル 1 箇所。ただし `spelloff` の**語**は `tavern.html` に 4 / `index.html` に 2(残りはコメント)⇒ ⛔ 語で数えない |

#### (c) 自己確認(scratchpad の使い捨て `selfcheck70.js`。⛔ `tools/` には置いていない)

素 / `?spelloff=0` の両腕を 1 回ずつ、**本番の関数をそのまま呼んで** 56 点 ——
`SELFCHECK 56/56  ALL GREEN` / pageerror 0 件。主な実測:

    1c 押すと保存      stored=["shield-of-faith"] / 除外中は 自動 0 + 印 / もう一度押すと auto=2 へ戻る
    1d #19 の候補      all=["cure-light-wounds","shield-of-faith"] -> off=["cure-light-wounds"]
    2a  スリープ       初回 ["magic-missile","sleep","fire-bolt","arcane-shield"](index 1)→ 0 にして保存 → 開き直しても 0
    2a2 markonload     読み込みでは印を書かない(印=null)/ 無保存の開き直しでは差し込まれたまま
    2b  切り詰め       12 個(sleep 込み)→ 素で **12 個** / ?spelloff=0 で **5 個** / 戦士は 8 → 5 件のまま
    3a  僧侶の除外     {clw:3, sof:2, tu:1, hp:1}(合計 7)→ {clw:3, tu:1, hp:1}(合計 **5**)= 枠を他へ回していない
    3b/3c             レベルアップ・先頭の経路でも消えたまま(⭐ 口 1 点の証拠)
    3d  NPC の全部 0   mage=[] → hasPreset=true / equippedSkills=[](素)、?spelloff=0 で既定 4 呪文へ戻る

行末は両ファイルとも **lone LF 0 = 純 CRLF のまま**(`py` のバイト数えで実測。
`index.html` 2,516,148 bytes / CRLF 39,627、`tavern.html` 651,187 bytes / CRLF 10,751)。

#### (d) 既存 golden(名指しのうち 11 腕)を実装直後に直列で再走 — **緑→赤 0**

| 本 | 着手前(§12-0c2) | 実装後 |
|---|---|---|
| `verify_save_slots` | 30/30 exit 0 | 30/30 exit 0 |
| `verify_pm_drawer_fit` | 75/79 PENDING 4 exit 0 | 75/79 PENDING 4 exit 0 |
| `verify_party_match_setup` | 36/36 exit 0 | 36/36 exit 0 |
| `driver_equip_compact_ios` | 31/31 exit 0 | 31/31 exit 0 |
| `verify_darkvision` | 25/25 exit 0 | 25/25 exit 0 |
| `verify_prep_retire` | 30/30 exit 0 | 30/30 exit 0 |
| `verify_recruit_talk` | 25/25 exit 0 | 25/25 exit 0 |
| `verify_hold_person`(素) | 31/31 exit 0 | 31/31 exit 0 |
| `verify_hold_person --negative` | exit 0 | exit 0(8 本すべて担当ラベルが赤・空振り 0) |
| `verify_mercenary_roster` | 44/44 exit 0 | 44/44 exit 0 |
| `driver_action_priority`(素) | 92/92 exit 0 | 92/92 exit 0 |

⚠ `driver_action_priority --negative` は**着手前から** exit 1(#35 以来)。本チケットは `apEquippedIdsFor` を
触っていないのでアンカーは 2 箇所のまま ⇒ **#70 の責任ではない**。⛔ ついでに直さない(§11)。
⚠ 母集団 140 本の全数再走は**項目5** の担当(270〜300 分)。ここで回したのは名指しの 11 腕だけ。
