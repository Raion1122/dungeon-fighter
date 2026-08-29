# #36 キャラクターシートを「本物の 5E キャラクターシート」の体裁へ

- **起草**: 2026-08-29(計画窓) / **ステータス**: **承認済**(2026-08-29 ユーザー承認)
- **着手**: ✅ **着手可能**(2026-08-29)。別窓は **`9b6f3b8`「準備画面からマッチング画面を
  開き直せるようにする」で着地済み**。tree clean / HEAD = `f8471e7` = `origin/main`。
  ⭐ 別窓が触ったのは `tavern.html` と `tools/verify_tavern_map.js` だけで、
  **本チケットが触る `index.html` / `js/player-sheet.js` は 1 行も動いていない** —
  §2 の行番号 9 件を着地後に全部照合し、**全部そのまま有効**であることを確認済み。
  ⚠ それでも着手時にもう一度 `git status --short` を取る(また誰か入っている可能性)。
- **触るファイル**:
  - `js/player-sheet.js`(区画の再構成・3 段組 CSS・空欄枠の契約・撤退スイッチ)
  - `index.html`(供給口の拡張 + `<script src="js/hero-classes.js">` 1 行 + changelog 1 行)
  - `tavern.html`(`<script src="js/hero-classes.js">` **1 行だけ**)
  - `tools/verify_player_sheet.js`(区画 5 → 11 に伴う期待値更新 + 新規 §6〜§8 + 変異 8 本)
  - `assets/character-sheet/*.png`(codex1 納品・4 点。**404 でもシートは読める**設計)
  - `codex1/requests/2026-08-29_character-sheet-parchment.md`(発注文・別途起草済)
- **`tavern.html`** … `<script src="js/hero-classes.js">` を **1 行足すだけ**。
  ⭐ **【2026-08-29 更新】** 起草時は別窓が編集中だったので「触らないファイル」に置き、
  この 1 行を **#36b** として切り出していた。別窓が `9b6f3b8` で**着地したので #36 本体へ戻す**
  — 切り出したままだと「tavern でだけ 特徴&特性 が伏せられる」というプレイヤーに説明できない
  差が残るため。⚠ **1 行だけ。`#prep` まわりには一切触らない**(別窓が `btnPartyView` を入れたばかり)。
- ⛔ **`town.html` / `world.html` / `title.html` は開かない。** §2-6 のとおり、
  必要だったフォントの追加は **モジュール側からの `<link>` 注入 1 箇所**で足りる。
- ⚠ 並走の作法は維持する: `git add .` 禁止・**ファイル単位 add**・
  `git diff --cached <file>` を読んでから commit。

---

## 1. 目的

`js/player-sheet.js`(#29 で入った v1)は、**内容としては 5E シートの材料が揃っているのに、
見た目が「モダンなアプリのカード」**になっている。実物は

- 6 能力が**縦に積まれた縦長のボックス**で、各ボックスは「小さな見出し / 特大の修正値 / 下端の丸の中に生スコア」
- 左列に セーヴィングスロー → 技能 が**行リスト**で並ぶ
- 中列に AC・先制・移動 の箱、HP の箱、攻撃 & 呪文発動の表
- 右列に 性格的特徴 / 理想 / 絆 / 欠点 → 特徴 & 特性 → その他の習熟と言語
- 全体が 1 枚の羊皮紙で、区画は**細い罫線で仕切られる**

という形をしている。いまの v1 は `display:flex; flex-wrap:wrap` の 88px セルが
だらだら折り返すだけで、**どこが能力値でどこが技能か**が形で分からない。

**ユーザー決定(2026-08-29)**:

- **本作にデータが無い欄は「空の枠」として出す。**
  性格的特徴 / 理想 / 絆 / 欠点 / インスピレーション / 一時 HP / ヒットダイス / 死亡セーヴ
  / 背景 / 属性 の 10 欄。⭐ 不採用になった案 = 「出さない(在るもので埋める)」
  「6 職 × 4 欄 = 24 本の固定文を新規に書いて埋める」。
  → **後者は別チケットとして残す**(枠だけ先に置いておけば、文章が書けた時に流し込むだけで済む)。
- **セーヴィングスロー欄は出す。ただし `index.html` でだけ。**
  §2-2 のとおり、本作のセーヴは `js/abilities.js` の 5e 修正値ではなく
  `index.html` の `playerStats`(戦闘系 0〜4)で振られている。**実際に振られている値**を
  唯一の正にする。⛔ 5e 修正値から出すと画面の数字が嘘になる。
- **codex1 への発注は「紙地 + 部品 4 点」。** 罫線と箱の配置は CSS が持つので、
  1 列 / 2 列 / 3 列 のどれに畳んでも絵が破綻しない。
  ⭐ 不採用 = 「完成形の 1 枚絵(枠線ごと)」。ページごとに区画が伏せられ、
  画面幅で 1〜3 列に畳むので、描かれた枠と中身が**必ず**ずれる。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

すべて **2026-08-29 / HEAD `3ce502b`** で測った。行番号は #34 の着地後の値。
⚠ **着手時に必ず測り直すこと**(別窓が tavern.html を触っており、index.html も動きうる)。

### 2-1. いまの区画は 5 つ。**id はドライバとの契約**

`js/player-sheet.js:111` `SECTION_DEFS`:

| id | 見出し | 出所 | 出るページ(実測) |
|---|---|---|---|
| `dfSheetSecHeader` | (無し) | `classLabel` + `levelFromXp(XP)` | 5 枚 |
| `dfSheetSecAbilities` | 能力値 | `DFAbilities` | 5 枚 |
| `dfSheetSecSkills` | 技能 | `SkillCheck` | index / tavern |
| `dfSheetSecLanguages` | 言語 | `DFSheet` | 5 枚 |
| `dfSheetSecBody` | 体 | `setBodyProvider()` | index |

`node tools/verify_player_sheet.js` の (2c) が実測で吐いた伏せ方:

```
index:伏[] tavern:伏["Body"] town:伏["Skills","Body"] world:伏["Skills","Body"] title:伏["Skills","Body"]
伏せた区画 計 7 / 全部出たページ 1
```

**この 5 つの id は 1 つも改名・削除しない。** 新しい区画は**足すだけ**。

### 2-2. ⚠⚠⚠ 罠 A — セーヴを `js/abilities.js` から出すと**画面の数字が嘘になる**

本作にはセーヴィングスローが**実在する**。振っているのは全部 `index.html` で:

| 出所 | 何のセーヴ | 実際に足している値 |
|---|---|---|
| `index.html:18811` `partyWillSave(dc)` | 恐怖(WIS) | `roll + (playerStats.wis || 0) + getSaveBonus("player")` |
| `index.html:30042` ブレス | DEX | 同型(`v.ally.dex` / `playerStats.dex`) |
| `index.html:31152` 轢殺 | DEX | `roll + dexMod + getSaveBonus(...)` |

`playerStats`(`index.html:17875`)は **戦闘用の修正値**で

```js
const playerStats = { str: 3, dex: 1, con: 2, wis: 0, int: 0, atkBonus: 4, ac: 16, ... };
```

一方 `js/abilities.js` の 5e 修正値は 戦士なら `str +2 / dex +0 / con +2 / int -1 / wis +0 / cha +0`。
**同じ「筋力」でも 3 と +2 で違う。** #29 の依頼書が書いたとおり能力値は 2 系統に分裂しており、
統合は **#32** の担当。

→ **セーヴ欄の唯一の正は `playerStats`(= 供給口)。**
⛔ `DFAbilities.abilityMod()` から出さないこと。
⛔ **CHA 行は作らない**(`playerStats` に `cha` が無い。5 行になる)。
⭐ この罠は §8 の変異 `savesfrom5e` として装置に内蔵する。

### 2-3. ⚠⚠⚠ 罠 B — `verify_player_sheet.js` は区画数 **5 を直書き**している

`tools/verify_player_sheet.js:1070` (0s9):

```js
const shape = secs.length === 5 && secs.every(...);
const idsOk = ids.length === 5 && sameSet(ids, secs.map(s => s.id));
const listOk = ... && st.shown.length + st.hidden.length === 5;
```

**区画を 1 つでも足した瞬間に (0s9) が赤くなる。** これは退行ではない。
→ 本チケットは区画を **5 → 11** にするので、(0s9) の 3 箇所を **11** へ書き換える
(§8 に新しい期待値を書いてある)。

### 2-4. ⚠⚠⚠ 罠 C — ユーザー決定「空の枠を出す」は、既存の規律と**正面衝突する**

#29 は「取れなかった区画は空文字で描かず **行ごと DOM から消す**」を規律にし、
`--negative` の変異 `blankrow`(`tools/verify_player_sheet.js:152`)で機械証明している。
(2c) は `avail`(データが取れたか)と `inDom`(DOM に居るか)の**不一致**を赤にする。

いま「性格的特徴(空欄)」を出すと、素朴に実装すれば `avail=false / inDom=true` になり
**(2c) が赤くなる**。ここで (2c) を緩めると `blankrow` が空振りし、
**#29 の規律が丸ごと死ぬ**(どの区画も空欄で描いてよくなる)。

→ **緩めずに、3 値へ拡張する。**

```
avail  … 実データが取れた区画            (従来どおり)
blank  … 実データが原理的に無いと **宣言済み** の区画 / セル (新設)
inDom  … 実際に DOM に居る               (従来どおり)

規則: inDom === (avail || blank)          ← (2c) はこの形へ拡張。緩めない
      avail && blank が同時に真 → 契約違反
      blank の集合 === DFSheet.BLANK_SECTION_IDS / BLANK_FIELD_IDS(ホワイトリスト)
```

⭐ ホワイトリストにすることで「実データのある区画を空欄枠にすり替える」欠陥が
機械で捕まる(§8 の変異 `blankdata` / `blankundeclared`)。

### 2-5. ⚠⚠ 罠 D — `js/hero-classes.js` は **title / town / world の 3 枚にしか載っていない**

```
$ grep -n "hero-classes.js" *.html
title.html:386  town.html:312  world.html:418
```

**index.html と tavern.html には載っていない**(2026-08-29 実測)。
⚠ 同ファイル冒頭のコメント「title.html と tavern.html が読み込む」は **いまも実物とズレている**
(#29 が既に指摘済みだが直っていない)。

`HERO_CLASSES` は `zone`(前衛/中衛/後衛)/ `role` / `note` を持ち、
5E シートの **特徴 & 特性** にそのまま流し込める唯一の共有データ。

- `index.html` へ `<script src="js/hero-classes.js"></script>` を 1 行足す。
  - `grep -c HERO_CLASSES index.html tavern.html` → **どちらも 0** = 名前の衝突は無い。
  - `player-sheet.js` の `classLabel()` は既に `HERO_CLASSES` を優先する fallback 実装なので、
    index の職業名の出所が `CLASS_LABELS` → `HERO_CLASSES` に変わる。
    **6 職とも表示名は一字一句同じ**(戦士 / ドワーフ / 僧侶 / 魔法使い / エルフ / 盗賊)なので
    画面は 1 文字も変わらない。
- **`tavern.html` にも同じ 1 行を足す。** ⭐ 起草時は別窓が編集中で保留していたが、
  `9b6f3b8` で着地したので本チケットに含める。⚠ **足すのは 1 行だけ**。
  `#prep` まわり(別窓が `btnPartyView` を入れたばかり)には一切触らない。

### 2-6. ⚠⚠ 罠 E — `Noto Serif JP` は **index.html にしか読み込まれていない**

```
index.html:9   family=Cinzel...&family=MedievalSharp&family=Noto+Serif+JP:wght@400;600
tavern.html:9  family=Cinzel...&family=MedievalSharp
town.html:9    family=Cinzel...&family=MedievalSharp
world.html:9   family=Cinzel...&family=MedievalSharp
title.html:9   family=Cinzel...&family=MedievalSharp
```

ところが `js/player-sheet.js:331` の紙の CSS は

```js
'  color: #2a2118; font-family: "Noto Serif JP", "MedievalSharp", serif;',
```

= **index 以外の 4 枚では 1 つ目が存在せず、数字とラテン文字が `MedievalSharp` で描かれる。**
つまり **同じシートが index と他 4 枚で違う書体で出ている**(日本語はどちらもシステム明朝へ落ちる)。
5E シートは数字の見た目が主役なので、これは放置できない。

→ **HTML を 4 枚とも開かずに直す**: `ensureStyle()` と同じ場所で、
`link[href*="Noto+Serif+JP"]` が無いページにだけ `<link>` を 1 本注入する。
⭐ 5 ページの HTML を 1 枚も触らずに済み、以後ページが増えても勝手に効く。

### 2-7. 供給口(`setBodyProvider`)がいま渡しているのは HP / maxHp / AC の 3 つだけ

`index.html:17882`〜:

```js
window.DFSheet.setBodyProvider(function () {
  if (!heroIsHead && heroRef) return { hp: heroRef.hp, maxHp: heroRef.maxHp, ac: heroRef.ac };
  return { hp: hp, maxHp: maxHp, ac: playerStats.ac };
});
```

⚠⚠⚠ **`heroIsHead` の分岐を新しいフィールドにも必ず掛けること。**
主人公が中衛/後衛だと `playerStats` は **頭に立っている NPC 仲間**の値になる。
#29 は HP/AC でこれを踏んで直した。セーヴ・先制・攻撃も**まったく同じ穴**を持つ。

供給できる材料は実測で揃っている:

| シートの欄 | 頭が主人公 (`heroIsHead`) | 頭が NPC (`heroRef` を見る) |
|---|---|---|
| セーヴ 5 | `playerStats.{str,dex,con,int,wis}` | `heroRef.{str,dex,con,int,wis}`(`createAlly` `index.html:12545` で必ず入る) |
| AC | `playerStats.ac` | `heroRef.ac` |
| 先制 | `playerStats.dex`(`index.html:19774` `u.initiative = n + u.dex`) | `heroRef.dex` |
| 攻撃 | `playerStats.{atkBonus,dmgDice,dmgBonus,critRange,critMult,weaponRange}` | `heroRef.` 同名(全部持つ) |
| 武器名 / 防具名 | `CLASS_DEFS[leaderClassKey].{weaponName,armorName}`(`index.html:20038`) | `heroRef.def.{weaponName,armorName}` |
| 装備スキル名 | `equippedSkills.map(id => getSkill(id).name)`(`index.html:13887` と同じ形) | `heroRef.equippedSkills` |
| セーヴの装備補正 | `getSaveBonus("player")` | `getSaveBonus(heroRef)` |

⛔ **シート側から `CLASS_DEFS` を直読みしない。** `CLASS_DEFS` は classic script 直下の
`const` で window に載らないうえ、直読みすると頭が NPC のときに嘘になる。必ず供給口を通す。

### 2-8. イニシアチブ・移動速度の実測値

- **先制** = `index.html:19774` `u.initiative = d20() + u.dex`。→ シートには **`+u.dex`** を出す。
  ⛔ `js/abilities.js` の DEX 修正値ではない(罠 A と同根)。
- **移動速度** = パーティは **1 手番 1 タイル前進**(ブレス / ヘイストで 2 タイル。
  `index.html:12552` `blessMoveRemaining` / `:12553` `hastedRemaining`)。`TILE_SIZE = 96`(`index.html:3279`)。
  → シートには **「1 マス」**と出す。
  ⛔ **「30 フィート」と書かない**(本作に距離単位は無く、1 マス = 5ft 換算では 5ft になって嘘)。
- **受動知覚** = 5e 標準 `10 + 知覚の値`。知覚の値は `SkillCheck.checkScore(member, CHECKS.perception)`。
  → SkillCheck が載っている index / tavern だけ。

### 2-9. 既存 golden のベースライン(**2026-08-29 実測**)

| ドライバ | 実測 | 備考 |
|---|---|---|
| `tools/verify_player_sheet.js` | **42/42 PENDING 0** | 本チケットが書き換える当事者 |
| `tools/verify_ability_scores.js` | **24/24 PENDING 0** | |
| `tools/verify_title_screen.js` | **86/86** | |
| `tools/verify_town_map.js` | **85/85** | |
| `tools/verify_world_map.js` | **57/57 PENDING 0** | |
| `tools/verify_tavern_map.js` | ✅ **43/43 PENDING 0**(隣窓の着地後に再測定) | 起草中は 41/42 だった ↓ |

⭐ **【2026-08-29 追記 — 決着済み】** 起草中に見えていた `41/42` は隣窓の未コミット差分が
原因で、隣窓が **`9b6f3b8`「準備画面からマッチング画面を開き直せるようにする」** で着地した。
着地後に測り直して **43/43**。⚠⚠ **基準は 42 ではなく 43**(隣窓が assert を 1 本足した)。
⭐ 隣窓が触ったのは `tavern.html` と `tools/verify_tavern_map.js` だけで、
**本チケットが触る `index.html` / `js/player-sheet.js` は 1 行も動いていない** —
§2 の行番号 9 件を着地後に全部照合して**全部そのまま有効**だった。
以下は起草時の記録(調べ方が再利用できるので残す):

⚠⚠⚠ **`verify_tavern_map` (6c) の赤は別窓の未コミット差分が原因。**
(6c) は `#prep` のタグ構造を固定コミット `638b479` と突き合わせる assert で、実測は
`prep 97/95 ⛔不一致`。署名を自分で計算して差分を特定した:

```
base[15..]: button#btnReroll.equipToggleBtn | div#recruitCountLine | ...
now [15..]: span | button#btnPartyView.equipToggleBtn | button#btnReroll.equipToggleBtn | ...
```

= 作業ツリーの `tavern.html` に `<span>` + `<button id="btnPartyView">` が増えている。
`git show HEAD:tavern.html | grep -c btnPartyView` → **0**(HEAD には無い)。
つまり **HEAD は無傷**で、赤いのは**別窓が編集中の作業ツリー**だった。
✅ **その後 `9b6f3b8` で別窓が着地し、再測定して 43/43**(⚠ 42 ではない。assert が 1 本増えた)。
→ 本チケットは (6c) を直さない。

**再測定コマンド**:

```bash
node tools/verify_player_sheet.js
node tools/verify_ability_scores.js
node tools/verify_title_screen.js
node tools/verify_town_map.js
node tools/verify_world_map.js
node tools/verify_tavern_map.js
```

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

```python
GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

本チケットは **`index.html` を触る**ので **鳴る**。
書けるプレイヤー向けの要約は実在する(見た目が実際に変わる):

> `<b>キャラクターシートが本物の冒険者の紙に</b> — 能力値・セーヴ・技能・攻撃・特徴が羊皮紙の三段組に並ぶようになった。`

⭐ `js/player-sheet.js` と `tools/*.js` だけの項目では鳴らない。
**index.html を触る項目は 1 つに閉じる**こと(§4 の項目分割はそう組んである)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/player-sheet.js` | 区画 5 → 11 / 3 段組 CSS / 空欄枠の契約 / フォント `<link>` 注入 / `?sheet5e=0` |
| `index.html` | `<script src="js/hero-classes.js">` 1 行 + 供給口の拡張 + changelog 1 行 |
| `tools/verify_player_sheet.js` | (0s9) の 5 → 11 / (2c) の 3 値化 / 新規 §6〜§8 / 変異 8 本 |
| `assets/character-sheet/*.png`(新規 4 点) | codex1 納品。**無くても読める**(§6 のフォールバック) |

⛔ **`tavern.html` は開かない**。§2-5 / §2-6 で「開く必要が無い」ことを確認済み。
⛔ **`town.html` / `world.html` / `title.html` も開かない**。§2-6 のとおりフォントは注入で足りる。
⛔ **`実装依頼書/README.md` の #36 行は、別窓が着地してから足す**(文面は §11 に用意)。

---

## 4. 項目分割(dev-loop 4 項目)

⭐ **本番ファイル(`index.html`)を触る項目を「項目 2」1 つに閉じてある**ので、
changelog を書くのは項目 2 の 1 コミットだけ。

| 項目 | 担当 | 触るファイル | changelog |
|---|---|---|---|
| 1 | 区画定義の再構成 + 空欄枠の契約 + `__state()` の 3 値化 + **ドライバの §0〜§9 の枠を全宣言し未実装は `pending()`** | `js/player-sheet.js` / `tools/verify_player_sheet.js` | 不要 |
| 2 | 3 段組 CSS + 各区画の描画 + 供給口の拡張 + `hero-classes.js` の 1 行 × 2 枚 | `js/player-sheet.js` / **`index.html`** / **`tavern.html`**(1 行だけ) | **必要** |
| 3 | フォント注入 + 撤退スイッチ `?sheet5e=0` + 装置を埋めて **PENDING 0** | `js/player-sheet.js` / `tools/verify_player_sheet.js` | 不要 |
| 4 | 負のコントロール 8 本 + 既存 golden 非退行 + §12 実装結果 | `tools/verify_player_sheet.js` / 本ファイル | 不要 |

⚠ **絵(`assets/character-sheet/*.png`)は 4 項目のどれにも入れない。** codex1 の納品待ちで、
無くても CSS のフォールバックで読める(§6)。納品後に差し替えるだけ。

---

## 5. STEP1 — 区画の再構成(11 区画)と空欄枠の契約

### 5-1. 新しい `SECTION_DEFS`(`js/player-sheet.js:111` を置き換える)

⭐ **`col` を持たせるのが肝**。3 段組の割り付けを表 1 箇所で決め、CSS 側は列の器だけ持つ。

```js
/* 5E キャラクターシートの区画。⛔ 既存 5 つの id は 1 文字も変えない (ドライバとの契約)。
   col … 実物のシートの段。A=左 / B=中 / C=右。header だけ全幅 (col:"full")。
   blank … 実データを 1 つも持たない「空の枠」(依頼書 #36 §2-4 の 3 値契約)。 */
var SECTION_DEFS = [
  { id: "dfSheetSecHeader",      label: "",                   col: "full" },
  { id: "dfSheetSecAbilities",   label: "能力値",             col: "A" },
  { id: "dfSheetSecProficiency", label: "習熟",               col: "A" },
  { id: "dfSheetSecSaves",       label: "セーヴィングスロー", col: "A" },
  { id: "dfSheetSecSkills",      label: "技能",               col: "A" },
  { id: "dfSheetSecCombat",      label: "",                   col: "B" },
  { id: "dfSheetSecBody",        label: "ヒット・ポイント",   col: "B" },
  { id: "dfSheetSecAttacks",     label: "攻撃 & 呪文発動",    col: "B" },
  { id: "dfSheetSecPersona",     label: "人物",               col: "C", blank: true },
  { id: "dfSheetSecTraits",      label: "特徴 & 特性",        col: "C" },
  { id: "dfSheetSecLanguages",   label: "その他の習熟と言語", col: "C" },
];
```

### 5-2. どの区画がどのページで出るか(**この表がドライバの期待値**)

| id | 出所 | index | tavern | town | world | title |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `dfSheetSecHeader` | `DFSheet` | ○ | ○ | ○ | ○ | ○ |
| `dfSheetSecAbilities` | `DFAbilities` | ○ | ○ | ○ | ○ | ○ |
| `dfSheetSecProficiency` | `SkillCheck` | ○ | ○ | — | — | — |
| `dfSheetSecSaves` | 供給口 | ○ | — | — | — | — |
| `dfSheetSecSkills` | `SkillCheck` | ○ | ○ | — | — | — |
| `dfSheetSecCombat` | 供給口 | ○ | — | — | — | — |
| `dfSheetSecBody` | 供給口 | ○ | — | — | — | — |
| `dfSheetSecAttacks` | 供給口 | ○ | — | — | — | — |
| `dfSheetSecPersona` | **blank** | ○ | ○ | ○ | ○ | ○ |
| `dfSheetSecTraits` | `HERO_CLASSES` | ○ | ○ | ○ | ○ | ○ |
| `dfSheetSecLanguages` | `DFSheet` | ○ | ○ | ○ | ○ | ○ |
| **出る / 伏せる** | | 11/0 | 7/4 | 5/6 | 5/6 | 5/6 |

⭐ tavern で伏せるのは **供給口(index 専用)由来の 4 つだけ**
(`Saves` / `Combat` / `Body` / `Attacks`)。town/world/title はそれに
`Proficiency` / `Skills`(SkillCheck 由来)が加わって 6 つ。
= **伏せる理由が「供給口が無い」「SkillCheck が無い」の 2 つしかない**きれいな形になる。
⭐ 伏せた区画の合計 = **0+4+6+6+6 = 22**、全部出たページ = **1**(index)。
   → (2c) の母集団ガード `hiddenTotal >= 5 && allShown >= 1` は満たす。

### 5-3. 空欄枠の宣言(ホワイトリスト)

```js
/* 実データが原理的に無い欄。⭐ ここに無い id で data-blank を出したら契約違反 (ドライバが赤)。
   ⛔ 「まだ実装していない」ではなく「本作にその概念が無い」ものだけを載せる。 */
var BLANK_SECTION_IDS = ["dfSheetSecPersona"];
var BLANK_FIELD_IDS = [
  "background",   // 背景        — 見出し帯
  "alignment",    // 属性        — 見出し帯
  "inspiration",  // インスピレーション — 習熟の区画
  "tempHp",       // 一時ヒット・ポイント — HP の区画
  "hitDice",      // ヒットダイス       — HP の区画
  "deathSaves",   // death セーヴ       — HP の区画
  "trait",        // 性格的特徴  ┐
  "ideal",        // 理想        │ 人物の区画 (= BLANK_SECTION)
  "bond",         // 絆          │
  "flaw",         // 欠点        ┘
];
```

- 空欄セルは `data-blank="1"` を名乗る。**`data-ability` / `data-skill` / `data-lang` /
  `data-save` / `data-stat` は付けない**(= 実データのセルと集合が交わらない)。
- 空欄セルの中身は **罫線だけ**(点線 2 本など)。⛔ `—` や `0` を書かない
  (「取れなかった」に見える。#29 §2-4 と同じ理由)。
- 区画の見出し(`<h3>`)は在るので `textContent` は 2 文字以上 → 既存 (2c) の
  「DOM に居るのに中身が空」検査は緑のまま通る。

### 5-4. `__state()` の 3 値化(`js/player-sheet.js:604` 付近)

```js
secs.push({
  id: id,
  avail: !!(LAST_AVAIL && LAST_AVAIL[id]),        // 実データが取れた
  blank: BLANK_SECTION_IDS.indexOf(id) >= 0,      // ★新設: 空欄枠として宣言済み
  inDom: !!el,
  textLen: el ? String(el.textContent || "").replace(/\s+/g, "").length : 0,
  dataCells:  el ? el.querySelectorAll("[data-ability],[data-skill],[data-lang],[data-save],[data-stat]").length : 0,
  blankCells: el ? el.querySelectorAll("[data-blank]").length : 0,
});
```

`mismatch` の判定を **`inDom !== (avail || blank)`** へ広げる(⛔ 緩めるのではなく広げる。
`avail && blank` が同時に真なら **必ず** `mismatch` へ入れること)。

公開 API に `BLANK_SECTION_IDS` / `BLANK_FIELD_IDS` / `SECTION_COLS` を足す。

---

## 6. STEP2 — 3 段組の CSS と各区画の描画

### 6-1. 紙と段組

```js
/* 実物の 5E シートは A4 縦 1 枚に 3 段。画面幅で 3 → 2 → 1 と畳む。
   ⚠ 段は「中身がある区画が 1 つ以上ある時だけ」DOM に置く (空の段を描かない)。
      title/town/world では B 段が丸ごと空になるため、置くと右に幅ぶんの余白が出る。 */
'#' + OVERLAY_ID + ' .dfSheetPaper {',
'  width: min(1040px, 100%); max-height: min(90vh, 1180px); overflow: auto;',
'  padding: 30px 28px 26px;',
'  background-color: #efe2c0;',              /* ⭐ 絵が 404 でもここが紙になる */
'  background-image: url("assets/character-sheet/parchment.png");',
'  background-size: 512px 512px; background-repeat: repeat;',   /* ⚠ 100% 100% にしない */
'  border: 2px solid #7a5a2c; border-radius: 10px;',
'  color: #2a2118; font-family: "Noto Serif JP", "Cinzel", serif;',
'}',
'#' + OVERLAY_ID + ' .dfSheetCols { display: grid; gap: 16px; grid-template-columns: 1fr; }',
'@media (min-width: 640px) { #' + OVERLAY_ID + ' .dfSheetCols { grid-template-columns: repeat(2, 1fr); } }',
'@media (min-width: 920px) { #' + OVERLAY_ID + ' .dfSheetCols { grid-template-columns: repeat(3, 1fr); } }',
```

⚠ **`background-size: 100% 100%` から `repeat` へ変える。** 紙地はタイルなので、
引き伸ばすと 1 枚絵として歪む。区画数がページごとに違い高さが変わるので、repeat が唯一正しい。

### 6-2. 能力値ボックス(5E の顔)

```
┌──────────┐   ラベル: 11px / letter-spacing 2px / #6b4f2a
│   筋力    │   修正値: 30px / 中央
│    +2     │   生スコア: 下端の丸の中 / 13px
│   (15)    │
└──────────┘   6 個を **縦 1 列** に積む (実物と同じ)。
```

- 枠は `border-image: url("assets/character-sheet/box_frame.png") 48 stretch;` を**足す**。
  ⛔ **`fill` を付けない。** 付けると中央スライスも塗られ、紙地が透けなくなる。
  ⛔ CSS の `border` を消さないこと(絵が 404 でも枠が残る = §6-1 と同じ思想)。
- `data-ability` / `data-score` / `data-mod` は **1 文字も変えない**(既存 (2a)(2b) の契約)。

### 6-3. 各区画の中身

| 区画 | 中身 | セルの `data-*` |
|---|---|---|
| Header | 職業名(大)/ クラス & レベル / 背景**空** / 種族 / 属性**空** / 経験点 | `data-stat="level"` 等 + `data-blank` 2 個 |
| Abilities | 6 能力ボックス | `data-ability`(既存) |
| Proficiency | インスピレーション**空** / 習熟ボーナス `+2` / 受動知覚 `10+知覚` | `data-stat="profBonus"` `"passivePerception"` + `data-blank` 1 個 |
| Saves | 筋力 / 敏捷力 / 耐久力 / 知力 / 判断力 の 5 行(**魅力は作らない**) | `data-save="str"` … + `data-mod` |
| Skills | 12 技能の**行リスト**(習熟は行頭の ● / 非習熟は ○) | `data-skill`(既存) |
| Combat | AC / イニシアチブ / 移動速度「1 マス」 | `data-stat="ac"` `"initiative"` `"speed"` |
| Body | HP 現在 / HP 最大 / 一時 HP**空** / ヒットダイス**空** / 死亡セーヴ**空** | `data-stat="hp"` `"maxHp"` + `data-blank` 3 個 |
| Attacks | 武器名 / 命中 `+N` / ダメージ `XdY+N`(クリティカル範囲も添える) | `data-stat="weapon"` `"atkBonus"` `"damage"` |
| Persona | 性格的特徴 / 理想 / 絆 / 欠点 の 4 枠 — **全部空** | `data-blank` 4 個 |
| Traits | 立ち位置(zone の和訳)/ role / note / 装備スキル名(index のみ) | `data-stat="zone"` `"role"` `"note"` `"skills"` |
| Languages | 言語チップ(既存)+ 習熟している技能の一覧行 | `data-lang`(既存) |

⭐ **`data-mod` の符号表記は `signed()` を通す**(既存の `+2` / `-1` と揃える)。

### 6-4. 供給口の拡張(`index.html:17882`)

⚠⚠⚠ **`heroIsHead` の分岐を新しいフィールド全部に掛ける**(§2-7 の罠)。
⭐ 「頭の値」と「主人公の値」を取り違えないよう、**先に 1 つの参照 `src` を決めてから**組む。

```js
window.DFSheet.setBodyProvider(function () {
  /* ⭐⭐⭐ #36: まず「誰の体か」を 1 回だけ決める。
     ⛔ フィールドごとに heroIsHead を書くと、必ずどれか 1 本を書き忘れて
        「HP は主人公 / セーヴは頭の NPC」という混ざった紙が出る (#29 が HP/AC で踏んだ穴)。 */
  var head = { hp: hp, maxHp: maxHp, st: playerStats,
               def: CLASS_DEFS[leaderClassKey], skills: equippedSkills, unit: "player" };
  var src  = (!heroIsHead && heroRef)
    ? { hp: heroRef.hp, maxHp: heroRef.maxHp, st: heroRef,
        def: heroRef.def, skills: heroRef.equippedSkills, unit: heroRef }
    : head;
  var st = src.st || {};
  return {
    hp: src.hp, maxHp: src.maxHp, ac: st.ac,          // ← 既存 3 つ。契約を変えない
    // ── ここから #36 で足す分 ──────────────────────────────
    saves: { str: st.str|0, dex: st.dex|0, con: st.con|0, int: st.int|0, wis: st.wis|0 },
    saveBonus: (typeof getSaveBonus === "function") ? getSaveBonus(src.unit) : 0,
    initiative: st.dex | 0,                            // index.html:19774 と同じ値
    speedTiles: 1,                                     // 1 手番 1 タイル (§2-8)
    weaponName: (src.def && src.def.weaponName) || null,
    armorName:  (src.def && src.def.armorName)  || null,
    atkBonus: st.atkBonus, dmgDice: st.dmgDice, dmgBonus: st.dmgBonus,
    critRange: st.critRange, critMult: st.critMult, weaponRange: st.weaponRange,
    skillNames: (src.skills || []).map(function (id) {
      var sk = (typeof getSkill === "function") ? getSkill(id) : null;
      return sk ? sk.name : id;
    }),
  };
});
```

⛔ **`bodyStats()` の「AC が数値でなければ null」ガードを外さない。**
外すと供給口が未登録のページで体区画が出て、`—` が並ぶ。

### 6-5. `index.html` へ 1 行

`index.html:2872` の `<script src="js/player-sheet.js">` の **直前**へ:

```html
  <script src="js/hero-classes.js"></script><!-- 職の立ち位置/持ち味 (#36 特徴&特性)。⚠ js/player-sheet.js より前 -->
```

---

## 7. STEP3 — フォント注入と撤退スイッチ

### 7-1. `Noto Serif JP` の注入(HTML を 1 枚も触らない)

```js
/* #36 §2-6: 紙の CSS が "Noto Serif JP" を指しているのに、読み込んでいるのは index.html だけ。
   ⚠ 5 枚の <head> を書き換えると別窓 (tavern.html を編集中) と衝突するので、
      モジュール側で 1 本だけ注入する。既に在るページ (index) では何もしない。 */
function ensureFont() {
  try {
    if (document.querySelector('link[href*="Noto+Serif+JP"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap";
    (document.head || document.documentElement).appendChild(l);
  } catch (e) { /* 読めなくても serif へ落ちるだけ。落とさない */ }
}
```

`ensureStyle()` の先頭で 1 回呼ぶ。

### 7-2. 撤退スイッチ `?sheet5e=0`

- **効き方**: 真なら `SECTION_DEFS` が **#29 の 5 区画に戻り**、CSS も v1 の
  `flex-wrap` 版に戻り、絵も段組も出ない。= **`?sheet5e=0` を付けたときの姿は
  #29 の v1 と 1 ピクセルも変わらない**。
- **判定位置**: IIFE 先頭の `?sheet=0` 判定の**直後**。`location.search` を 1 回読むだけ。
- **ページ遷移をまたぐか**: **またがない**(`?sheet=0` / `?ability5e=0` と同じ、ページ単位で完結)。
- ⭐ この作りにすると **`?sheet5e=0` で走らせた `verify_player_sheet.js` の §0〜§5 が
  そのまま #29 の期待値で緑になる**。これを (8a) として機械検査する。

⛔ **`?sheet=0`(モジュールごと止める)を消さない。** 2 本を独立に残す。

---

## 8. 受入条件 — `tools/verify_player_sheet.js`(既存を書き換え + §6〜§9 を追加)

観測するのは **「何を描いたか」と「どこから取ったか」の 2 経路**。
⭐ 描いた数字が正しいことは、**シートの DOM** と **本番の供給口 / モジュールを直接評価した値**を
突き合わせて見る。⛔ ドライバに数式を写経しない(実装と同じ間違いを共有すると両方緑になる)。

### 既存節の書き換え(3 箇所だけ。**弱めない**)

| 節 | いま | 変更後 |
|---|---|---|
| (0s9) | `secs.length === 5` / `ids.length === 5` / `shown+hidden === 5` | **11** に直し、さらに `typeof s.blank === 'boolean'` を形の検査へ足す |
| (2c) | `mismatch` = `inDom !== avail` | `inDom !== (avail \|\| blank)` へ**拡張**(⛔ 緩めない)。§5-2 の表を期待値として 5 ページ全部で照合。母集団は **伏せた区画 計 22 / 全部出たページ 1** |
| (2d) | 技能 12 の照合 | 変更なし。⚠ **行リストへ作り替えても `data-skill` / `data-score` / `data-prof` は変えない**ので緑のまま通ること |

### §0 装置(先に母集団を確かめる)

- **(0s14)** `DFSheet.BLANK_SECTION_IDS` が 1 件・`BLANK_FIELD_IDS` が 10 件で、
  両者が `SECTION_DEFS` / 実際に描かれた `data-blank` と**食い違わない**。
  ⭐ **これが無いと §6 の全 assert が空振りで永久緑になる。**
- **(0s15)** `SECTION_COLS` の値が `full/A/B/C` の 4 種だけで、A/B/C それぞれに 1 件以上ある
  (段組の割り付け表が壊れていない)。

### §6 空欄枠 — 「宣言した空欄」と「取れなかった区画」を混同していない

- **(6a)** 5 ページとも、DOM の `[data-blank]` の id 集合 ⊆ `BLANK_FIELD_IDS`。
  **かつ index では 10 件ちょうど**(全区画が出るページなので全部揃う)。
- **(6b)** `BLANK_SECTION_IDS` の区画は `dataCells === 0 && blankCells >= 1`。
- **(6c)** ⭐ **`BLANK_SECTION_IDS` 以外で DOM に居る区画は、必ず `dataCells >= 1`。**
  (= 実データのある区画を空欄枠にすり替える欠陥の網)
- **(6d)** 空欄セルのテキストが `—` / `0` / `-` を**含まない**(伏せたように見せない)。

### §7 5E の体裁 — 段組と縦積み

- **(7a)** 幅 1200 / 760 / 390 の 3 通りで開き、`.dfSheetCols` の実効
  `grid-template-columns` が **3 / 2 / 1 列**になる(`getComputedStyle` の track 数で数える)。
- **(7b)** ⭐ **中身が 0 の段は DOM に存在しない。** title.html(B 段が丸ごと空)で
  `.dfSheetCol[data-col="B"]` が **0 件**、index.html で **1 件**。
- **(7c)** 6 つの能力値ボックスが**縦 1 列**に積まれている
  (`getBoundingClientRect().left` が 6 個とも同じ・`top` が単調増加)。
- **(7d)** シートを開いても閉じても、`#dfSheetPaper` が**横スクロールしない**
  (`scrollWidth <= clientWidth + 1`)を 3 幅すべてで。
- **(7e)** 390px 幅で `#dfSheetPaper` の実効文字高が **11px 以上**
  (⚠ #15 と同じ罠 — 縮小がかかると読めなくなる)。

### §8 数字の出所 — 2 経路の突き合わせ

- **(8a)** ⭐⭐⭐ **`?sheet5e=0` の 5 ページで `__state()` が #29 の 5 区画へ戻る**
  (`sectionIds.length === 5` / 伏せ方が `index:[] tavern:[Body] town,world,title:[Skills,Body]`)。
- **(8b)** セーヴ 5 行の値が、ブラウザで評価した **供給口の `saves` + `saveBonus`** と一致。
  **かつ `DFAbilities.abilityMod(スコア)` とは 1 マス以上割れている**
  (⭐ 母集団ガード — 偶然一致する職で測ると永久緑)。
  ⭐ 戦士で実測: `playerStats.str = 3` vs `abilityMod(15) = +2` → 割れる。
- **(8c)** 主人公を**中衛/後衛の職**にして頭が NPC になる編成で開き、
  セーヴ / AC / 先制 / 攻撃 が **`heroRef` 側の値**であって頭の NPC の値でない。
  ⭐ #29 が HP/AC で踏んだ穴の再発防止。⚠ 頭の NPC と主人公で値が割れる編成を選ぶこと。
- **(8d)** 先制の表示値が `供給口.initiative` と一致し、
  かつ `index.html` の `u.initiative = n + u.dex` の `u.dex` と同じ系統である
  (= `DFAbilities` 由来ではない)。
- **(8e)** 攻撃欄の武器名が `CLASS_DEFS[...].weaponName` と一致(供給口経由の 2 経路)。
- **(8f)** 受動知覚 = `10 + SkillCheck.checkScore(member, CHECKS.perception)`(index / tavern)。

### §9 恒等(非退行)

- **(9a)** 5 ページとも `pageerror` ゼロ(素 / `?ability5e=0` / `?sheet=0` / `?sheet5e=0` の 4 経路)。
- **(9b)** シートの開閉で `localStorage` のキーが **0 本**増えない(既存 (4d) の拡張)。
- **(9c)** 既存 HUD の矩形が 1px も動かない(既存 (4a) をそのまま)。

### ⛔ 測らないこと

- **紙の色・罫線の太さ・余白の px**。目で決める余地を残す。
  ⛔ 実装窓が善意で `#efe2c0` や `padding: 30px` を assert に固定しないこと。
- **`assets/character-sheet/*.png` の存在**。納品前でも緑でなければならない(§6-1 のフォールバック)。
  ⭐ 逆に「絵が 404 でも紙が読める」ことは (7d)(7e) が担保する。
- **空欄枠に将来入る文章**。24 本の執筆は別チケット(§11)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

⭐ 既存 7 本(`wipeorder` / `fixedsave` / `nocha` / `ownmod` / `blankrow` / `fixedbtn` / `closedread`)は
**1 本も消さない**。特に `blankrow` は §2-4 の規律の要。

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `savesfrom5e` | ⭐⭐⭐ **§2-2 の罠 A の再現** — セーヴを `DFAbilities.abilityMod()` から出す | (8b) |
| `blankdata` | ⭐⭐⭐ **§2-4 の罠 C の再現** — 能力値の区画から `data-ability` を落として `data-blank` に置き換える | (6c) / (2a) |
| `blankundeclared` | 宣言に無い空欄セル(`data-blank="foo"`)を 1 つ足す | (6a) |
| `headmix` | ⭐ **§2-7 の罠** — 供給口の新フィールドだけ `heroIsHead` の分岐を通さず `playerStats` 直読み | (8c) |
| `emptycol` | 中身が 0 の段も常に描く | (7b) |
| `abilrow` | 能力値ボックスを横並びに戻す | (7c) |
| `retreatkeep` | `?sheet5e=0` でも 11 区画のまま | (8a) |
| `initfrom5e` | 先制を `DFAbilities.abilityMod(DEX スコア)` から出す | (8d) |

⚠⚠⚠ **変異は 1 本ずつ注入して `evaluable` / `allowRed` を実測から決める**
(#29 で 7 本中 5 本が担当外を巻き込んだ / #34 で「全部同時に入れると互いを覆い隠す」)。
⛔ **測っていない節を `evaluable` に載せない**(母集団 0 の述語は一律 false = 偽の赤)。

### 既存 golden の非退行(実装後に必ず走らせる)

| ドライバ | 基準(2026-08-29 実測) |
|---|---|
| `node tools/verify_player_sheet.js` | **書き換える当事者。完了条件 = PASSED 全数 / FAILED 0 / PENDING 0** |
| `node tools/verify_ability_scores.js` | **24/24** |
| `node tools/verify_title_screen.js` | **86/86** |
| `node tools/verify_town_map.js` | **85/85** |
| `node tools/verify_world_map.js` | **57/57** |
| `node tools/verify_tavern_map.js` | **43/43 PENDING 0**(⚠ 42 ではない。別窓の着地 `9b6f3b8` で assert が 1 本増えた) |
| `node tools/driver_action_priority.js` | **92/92**(index.html を触るので念のため) |

⚠ 基準値は 2026-08-29 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。
⚠ `driver_action_priority` の単発の赤は**まず 1 回再実行**(実プレイ系はフレークする)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` だと音が出ない)。

1. **iPhone 縦持ち**で 5 ページとも開き、1 列に畳まれて**横スクロールが出ない**か。
   特に `index.html` の ☰ → パーティパネル → 📜 の 2 段を**戦闘中に**開けるか。
2. **能力値ボックスが「5E のあれ」に見えるか。** 修正値が主役で、生スコアが下の丸、という
   主従が伝わるか(ここが本チケットの成否)。
3. **空の枠が「未実装」でなく「まだ書き込んでいない紙」に見えるか。**
   ⚠ 見えなければ、罫線を点線にする / 薄い斜線を入れる、で調整する(数値は縛っていない)。
4. **デスクトップ 3 列のとき、C 段(人物 / 特徴 / 言語)がスカスカに見えないか。**
5. `?sheet5e=0` で #29 の姿にきれいに戻るか。
6. 絵(`assets/character-sheet/*.png`)の納品後、**紙地の継ぎ目が見えないか**を 3 幅すべてで。

---

## 10. changelog(⚠ `index.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>キャラクターシートが本物の冒険者の紙に</b> — 能力値・セーヴ・技能・攻撃・特徴が羊皮紙の三段組に並ぶようになった。"
```

⭐ **項目 2 のコミットに 1 行だけ**入れる(§4 の分割はそのために組んである)。

---

## 11. やらないこと

- ⛔ **`tavern.html` の `#prep` まわりを触ること。** 足すのは `<script src="js/hero-classes.js">` の
  **1 行だけ**(別窓が `9b6f3b8` で `btnPartyView` を入れたばかりで、構造を動かすと
  `verify_tavern_map` (6c) の `DOM_BASE` 照合が即座に赤くなる)。
- ⛔ **`js/skill-check.js` を town / world / title へ載せること。**
  #29 が「判定 UI ごと引き連れてくるので閲覧専用シートには重すぎる」と決めている。
  技能・習熟・受動知覚が 3 枚で伏せられるのは**設計どおり**。
- ⛔ **装備欄・装備の変更**。`js/equipment.js` の共有化が先 = **#30 / #31**。
  攻撃欄が出すのは `CLASS_DEFS` の初期武器名だけで、装備品の反映はしない。
- ⛔ **戦闘用修正値を 6 能力から導出すること** = **#32**。本チケットは
  「2 系統が分裂している事実」を**正直に描く**だけ(セーヴは `playerStats` / 技能は 5e)。
- ⛔ **6 職 × 4 欄 = 24 本の人物描写を書くこと。** 枠だけ置く。
  → **#37(仮)「人物欄に職ごとの一節を書き入れる」**として残す。
  ⭐ 本チケットで `BLANK_FIELD_IDS` から `trait/ideal/bond/flaw` を外すだけで流し込める形にしておく。
- ⛔ **主人公に名前を付けること**。本作に PC 名は無い。名前欄には職業名を出す。
- ⛔ **`verify_tavern_map` (6c) を触ること。** §2-9 のとおり別窓の着地 `9b6f3b8` で
  **43/43 に復帰済み**。本チケットの担当ではない。
- ✅ **`実装依頼書/README.md` の #36 行は 2026-08-29 に追加済み**(別窓が着地したため)。
  追加した行:

  | 36 | [2026-08-29_player-sheet-5e-layout.md](2026-08-29_player-sheet-5e-layout.md) | **承認済** | 0% | キャラクターシートを本物の 5E シートの体裁へ(区画 5 → 11 の 3 段組・能力値ボックス・セーヴ・攻撃・人物欄)。⚠⚠⚠ **セーヴの唯一の正は `playerStats`(戦闘系)で `js/abilities.js` ではない** — 5e 修正値から出すと画面が嘘になる(統合は #32)。⚠⚠⚠ **区画 5 → 11 で `verify_player_sheet` (0s9) が件数直書きのため必ず赤**(退行ではない)。⚠⚠ **「空の枠を出す」は #29 の `blankrow` 規律と衝突する** → `avail`/`blank`/`inDom` の 3 値へ拡張して**緩めずに**解く。⚠ `hero-classes.js` は index/tavern に載っていない・`Noto Serif JP` は **index にしか載っていない**(同じシートが 5 ページで違う書体で出ている)。⛔ `tavern.html` は `<script src>` を **1 行足すだけ**(`#prep` は触らない)。golden 基準 2026-08-29: player_sheet 42/42 / ability 24/24 / title 86/86 / town 85/85 / world 57/57 / tavern 43/43 / action_priority 92/92。撤退 = `?sheet5e=0` |

---

## 12. 実装結果

**完了 (2026-08-29)。** dev-loop 4 項目を 1 窓で 4 コミットとして回した
(この窓は AgentTool を使わない設定だったため、サブエージェントではなく逐次実行。
分割の目的 = 「changelog を項目 2 の 1 コミットに閉じる」は保たれている)。

| 項目 | コミット | 内容 |
|---|---|---|
| 1 | `a51dad3` | 区画 5 -> 11 / 空欄枠の契約 / `__state()` 3 値化 / (0s9) を 11 へ / §6〜§9 を PENDING 宣言 / 変異 8 本を `impl:false` |
| 2 | `c1e2ed4` | 三段組 CSS / 11 区画の描画 / 供給口の拡張 / `hero-classes.js` 1 行 x 2 枚 / changelog |
| 3 | `46cd7c5` | フォント注入 / `?sheet5e=0` / 受入条件 20 件を実装して **PENDING 0** |
| 4 | (このコミット) | 変異 8 本の実装 / `--negative` / 既存 golden 非退行 / codex1 納品の取り込み / §12 |

### 実測 (2026-08-29)

| ドライバ | 着手前 | 着地後 |
|---|---|---|
| `verify_player_sheet` | 42/42 | **70/70 PASSED / FAILED 0 / PENDING 0** |
| 同 `--negative` | 変異 7 本 | **101/101 / 空振り 0 (変異 15 本)** |
| `verify_ability_scores` | 24/24 | **24/24** |
| `verify_title_screen` | 86/86 | **86/86** |
| `verify_town_map` | 85/85 | **85/85** |
| `verify_world_map` | 57/57 | **57/57** |
| `verify_tavern_map` | 43/43 | **43/43** |
| `driver_action_priority` | 92/92 | **92/92** |

主な母集団の実測値:

- 伏せた区画 計 **22** / 全部出たページ **1** (index) — §5-2 の表どおり
- `[data-blank]` は index **10 個ちょうど** / tavern 7 / town・world・title 6
- 実データを持つはずの区画 **28 件** (index 10 + tavern 6 + 他 4x3) が全部 `dataCells >= 1`
- 段組 1200px:**3列** / 760px:**2列** / 390px:**1列** / 横スクロール 0 (1036/1036・724/724・354/354)
- 能力値ボックス left=150 x6 / top=199,299,399,499,599,699 (縦 1 列)
- 390px の実効文字高 **11px**
- セーヴ: 供給口 `{str:4,dex:1,con:2,int:0,wis:0}` に対し 5e 修正値と **3 マス割れ**
- 頭が NPC の腕: 主人公 mage (ac12 / atk3 / スリング) vs 頭 (ac16 / atk8) で紙は主人公側を出す

### 依頼書から変えた点 (3 件)

1. ⭐ **見出し帯に「種族」の欄を作らなかった** (§6-3 の表には在った)。
   本作に種族の概念は無く、6 職のうち 4 職 (戦士 / 僧侶 / 魔法使い / 盗賊) は種族ではないので、
   出すと 4/6 で嘘になる。ユーザー決定の「空欄で出す 10 欄」にも入っていない
   = 「実データで埋めるべき欄」だが、埋められる実データが存在しない。よって欄ごと作らない。
2. ⭐ **`corner.png` は取り込んだが配線していない。**
   紙は `overflow: auto` で縦スクロールするため、絶対配置の角飾りは中身と一緒に流れて壊れる。
   `background-image` の多重レイヤなら要素の枠に貼り付いたまま (既定の `background-attachment: scroll`)
   にできるが、CSS では画像を反転できないので 4 隅ぶんの反転コピーを別途作る必要がある。
   → **別チケット**。素材は `assets/character-sheet/corner.png` に置いてある。
3. ⭐ **段が 2 本しか立たないページ用に紙幅を 720px へ詰めた** (`.dfSheetPaper.dfCols2`)。
   §7 には無かったが、1280px の title.html を目視したら **右 1/3 が丸ごと空いていた**。
   段の数を知っているのは `render()` だけなので、そこで紙へ札を貼り CSS が見る形にした。

### この窓が踏んだ罠 (次の窓が同じ穴に落ちないように)

- ⚠⚠⚠ **Bash のヒアドキュメント経由だとバックスラッシュが 1 段落ちる。**
  `<<'PYEOF'` で囲っても Python 側に届く時点で `\\n` が `\n` (実改行) に化けており、
  「変異 `blankrow` のアンカーが 0 ヒット」で 1 回止まった。⭐ 対処 = パッチスクリプトは
  **Write ツールで書く** (そちらはバックスラッシュが保たれる) か、`chr(92)` で組み立てる。
- ⚠⚠⚠ **JS のテンプレートリテラルの中に正規表現を書くと `\(` `\s` がエスケープに食われて消える。**
  `LAYOUT_JS` に `/matrix\(([^,]+),/` と書いたら配信時に `/matrix(([^,]+),/` になり、
  5 ページ全部で `Invalid regular expression` の pageerror。⭐ 対処 = `indexOf` / `slice` で採る。
- ⚠⚠ **renderV1 / renderV2 を並べた瞬間、変異アンカー `LAST_AVAIL = avail;` が 2 ヒットして exit 3。**
  ⭐ アンカーは **片方にしか無い 1 行** (`if (placed) host.appendChild(cols);`) へ張り直す。
  ⭐ さらに「既に DOM に居る区画は飛ばす」ガードを足さないと、宣言済みの空欄枠を二重に置いてしまう。
- ⭐⭐⭐ **`headmix` が (8b) では原理的に捕まらない。** 頭が主人公の編成では `src` も `playerStats` も
  同じ物を指すので、頭が NPC になる編成 (主人公 mage) を **別の腕として用意**しない限り一生見つからない。
  → §8 の測定は `numHead` (warrior) と `numAlly` (mage) の 2 本立てにしてある。
- ⭐⭐ **`emptycol` は (2c) では捕まらない。** 区画の出し入れは正しいまま器だけが増えるので、
  `.dfSheetCol` の **件数を数える節** (7b) が無いと 5 枚中 4 枚がスカスカでも全部緑になる。

### codex1 納品 (`2026-08-29_character-sheet-parchment.md`)

**投下済・納品済**(下見 `--sandbox read-only` -> 本番 `workspace-write` の 2 段)。
`assets/character-sheet/` へ 4 点を取り込み済 (md5 は codex の報告と一致)。

- ⚠⚠⚠ **納品された紙地は羊皮紙色ではなかった** — 彩度 0.031 / R-B = 7 の **ほぼ無彩色**
  (CSS のクリーム `#efe2c0` は R-B = 47)。そのまま敷くと紙が灰白色になる。
  ⭐ **`background-blend-mode: multiply` でクリーム地へ掛けて解決した。**
  紙色の唯一の正が CSS 側に残るので、絵が 404 のときは従来どおりのクリームがそのまま出る。
  ⭐⭐ 依頼書の受入基準は「輝度の平均 215〜238」しか課しておらず、**色相を 1 つも縛っていなかった**。
  次に紙を発注するときは R-B の下限を課すこと。
- ⚠⚠⚠ **受入基準 (E) 「上辺の自己相関ピーク < 0.6」が NG (0.917) だったが、これは検算式の欠陥。**
  実測すると上辺プロファイルは min = max = 28.57 / std = 0.000 の **完全な無地**で、
  0.917 は `(96-8)/96 = 0.9167` そのもの = **分母が 0 に潰れた数値アーティファクト**。
  意匠の繰り返しは 0 件で要件は満たしている。⛔ この式は無地の辺では原理的に通らない。
  次に使うときは「std < 1 なら無地 = OK」を先に置くこと。
- ⚠⚠ **codex の実行環境に Python が無く、(B) 継ぎ目の勾配比と (D) 相互 RGB 一致率が未測定だった。**
  こちらで実測: 勾配比 縦 **1.03** / 横 **1.17** (<= 1.6)、一致率 **8.1% / 2.9% / 1.0%** (<= 60%)。
  ⭐ 「codex の自己検算が全部通っても欠陥は残る」の実例がまた 1 件増えた。
- ⭐ **台帳 `tools/codex1_sprites.json` には追記していない。** あの台帳はスプライトシート専用
  (コマ数 / `char_ratio` / パック倍率 / 再生成スクリプト) で、紙地と枠の素材セットは載る形をしていない。

### 残件 (実機体感)

1. iPhone 縦持ちで 5 ページとも 1 列に畳まれ、横スクロールが出ないか
   (特に index の ☰ -> パーティパネル -> 📜 を **戦闘中に** 開けるか)。
2. 能力値ボックスが「5E のあれ」に見えるか (修正値が主役 / 生スコアが下の丸、の主従)。
3. 空の枠が「未実装」でなく「まだ書き込んでいない紙」に見えるか。
4. 紙地のむらが強すぎないか (等倍タイルなので継ぎ目そのものは実測で消えている)。
5. `?sheet5e=0` で #29 の姿にきれいに戻るか。
6. `corner.png` の配線 (上記「変えた点 2」) をやるかどうか。

