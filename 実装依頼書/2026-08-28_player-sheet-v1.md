# #29 プレイヤーシート v1(いつでも開ける・閲覧専用)+ 言語

- **起草**: 2026-08-28(計画窓) / **ステータス**: **承認済**(2026-08-28 ユーザー承認)
- **着手**: ⏸ **保留 — #28 の完了待ち**(2026-08-28)。
- **触るファイル**: `js/player-sheet.js`(新規) / `index.html` / `tavern.html` / `town.html` /
  `world.html` / `title.html` / `assets/sheet_frame.png`(codex1 納品) /
  `tools/verify_player_sheet.js`(新規)
- ⛔ **着手順**: **#28 の後**。シートは `DFAbilities`(#28 で作る 6 能力の唯一の正)を読む。
  #28 が無いと**シートの STR と実際の判定が食い違う**ので、順序を飛ばさないこと。
- ✅ **#25 の完走待ちは解消済み**(2026-08-28 `231d1f6` で完了)。
- ⚠ **番号の由来**: 起草時は #27 としたが、**#25 が #26 =「復興評議会館」/ #27 =「ポドルプラザ MAP 化」を
  予約済み**だったため **#29 へ繰り下げた**(詳細は #28 のヘッダ)。
- ⭐ **v1 は閲覧専用。装備欄は出さない。** 理由は §2-3(装備テーブルが 2 ファイルに
  41 定義ミラーされていて、シートから「今の装備」を正しく引ける唯一の正が存在しない)。
  装備は **#30**(欄の追加 + 共有モジュール化)→ **#31**(シートからの変更)。

---

## 1. 目的

主人公が「何者なのか」を確かめる画面が**どこにも無い**。
能力値は判定パネルの内訳に一瞬映るだけ(`checkScoreBreakdown` の `STR +2` 等)で、
**腰を据えて見る場所が無い**。レベルも XP も酒場の準備画面にしか出ない。

**いつでも開ける 1 枚のシート**を作る。v1 で載せるのは:

| 区画 | 内容 | 出所 |
|---|---|---|
| 見出し | 主人公名 / 職業 / レベル / 累積 XP・次レベルまで | `partyComposition` / `xp` / `XP_THRESHOLDS` |
| 能力値 | **6 能力(STR/DEX/CON/INT/WIS/CHA)のスコアと修正値** | `DFAbilities`(#28) |
| 技能 | 12 技能の合計値 + 習熟マーク | `SkillCheck.checkScore` |
| 言語 | 話せる言語(**新規**) | `dragonfighters.languages` |
| 体 | HP / AC | ⚠ §2-4 のとおりページによって取れない。取れない所は伏せる |

**ユーザー決定(2026-08-28)**:

- **言語は「器 + 表示」まで。** キャラクリエイト(`title.html` の「汝は何者か」)で選び、
  保存して、シートに出す。**ゲーム進行への効き目は持たせない**(碑文が読める等は後続チケット)。
  - ⭐ 不採用: **「種族/職業から自動で決まる固定」** — 実装は最小だが、
    ユーザーの「キャラクリエイト時に選択性」という要件が消える。
- **装備変更は最終的にシートから可能にする**(ダンジョン中も含む)。
  ただし §2-3 の前提工事があるので **v1 では扱わない**。
  - ⭐ 不採用: **「ダンジョン中は閲覧のみ」** — 提示したが、ユーザーは「変更も可能」を選んだ。
    → **#31 で戦闘中の付け替え可否まで決める**(オートバトルなので「戦闘中に着替えて
    有利を作る」が成立しうる。#31 の論点として明記する)。
- **絵は codex1 へ発注**(羊皮紙のシート枠)。前例 = `codex1/requests/2026-08-23_title-emblem.md`。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 呼び出しボタンを置ける固定スロットの実測

`position: fixed` の既存要素を 5 ページ全部で数えた結果:

| ページ | 左上 | 右上 | 左下 | 右下 | 備考 |
|---|---|---|---|---|---|
| `index.html` | **占有** `#partyToggleBtn` (`top:11px; left:11px; z-index:61`) | **占有** `#settingsBtn` (`top:11px; right:172px`、モバイルは `right:8px`) | **占有** `#partyPanel` が**左列全域**(`top:0; left:0; bottom:0; width:var(--ui-menu-w); z-index:10`) | **占有** `#combatLog`(`bottom:0; left:var(--ui-menu-w); right:0`) | ⭐ **空いている固定スロットが無い** |
| `tavern.html` | 空 | 空 | **空** | 占有 `#settingsBtn`(`bottom:18px; right:18px; z-index:30`) | 他は z 200/210 のオーバーレイ |
| `town.html` | 空 | 空 | **空** | 空 | `position:fixed` の要素が 0 件 |
| `world.html` | 空 | 空 | **空** | 空 | `#worldEnterAsk` は `inset:0` の全画面 ask(z 20) |
| `title.html` | 空 | 空 | **空** | 空 | `position:fixed` の要素が 0 件 |

⭐⭐ **したがって呼び出し口は 2 経路になる。1 経路で全ページを賄おうとすると `index.html` で必ず衝突する。**

- **`tavern` / `town` / `world` / `title`** … 共有モジュールが `bottom:18px; left:18px; z-index:62` へ
  固定ボタン `#dfSheetBtn` を注入する(4 ページとも左下は空)。
- **`index.html`** … **`#partyPanel` の中**(リーダー行の直下)へボタンを置く。
  ⛔ 固定配置にしないこと。上下左右すべて既存 HUD が占有している。
  ⚠ モバイル(`body.ui-collapsed`)では `#partyPanel` が画面外へ退避するので、
  **`#partyToggleBtn`(☰)を開いてから押す**導線になる。これは既存の
  「パーティを見る」導線と同じなので新しい学習は要らない。

**再測定コマンド**:

```bash
for f in index.html tavern.html town.html world.html title.html; do \
  echo "=== $f ==="; grep -nE "position: *fixed" -A4 $f | \
  grep -E "^[0-9]+[-:]\s*(#|\.|bottom|top|left|right|z-index)" ; done
```

### 2-2. ⚠⚠⚠ 罠 B — `newGame()` が `dragonfighters.*` を prefix 総なめで消す

`title.html:637-644` に**既に同じ罠を踏んだ跡が残っている**:

```js
/* ⚠ 順序が意味を持つ。newGame() は dragonfighters.* を prefix 総なめで消す
   (prologueSeen も含む = 酒場で前口上が自動で流れる)。
   partyComposition は **その後**に書くこと。逆にすると書いた直後に消える。 */
try { if (window.DFSlots) DFSlots.newGame(pendingSlot); } catch (e) {}
try {
  localStorage.setItem("dragonfighters.partyComposition", JSON.stringify([chosenClass]));
} catch (e) {}
```

⭐ **`dragonfighters.languages` も `newGame()` の後に書くこと。**
前に書くと**書いた直後に消えて、言語が常に空になる**(しかもエラーは 1 つも出ない)。

⭐ この罠は §9 の負のコントロール `wipeorder` として装置に内蔵させる。

### 2-3. ⚠⚠ 罠 C — 装備の「唯一の正」が存在しない(だから v1 で装備欄を出さない)

装備テーブルの定義を全数で数えた:

| ファイル | 定義 | 内訳 |
|---|---|---|
| `tavern.html` | **19** | `WEAPONS` / `ARMORS` / `SHIELDS`(主人公=戦士)+ 5 職 × 3 種 + `CHAR_EQUIP` |
| `index.html` | **22** | `weapons` / `armors` / `shields`(小文字・主人公)+ 6 職 × 3 種 + `ALLY_EQUIP_POOLS` |

**同じ装備が 2 ファイルへ手作業でミラーされている。** `index.html` 自身がそう書いている:

```js
// ⚠ tavern.html の ROGUE_ARMORS と name を完全一致させること (所持ティアが index 共有のため)。
// 戦士仲間プール: 主人公の weapons/armors/shields を idx 整合でミラー。
```

さらに **`localStorage` に入っているのは索引だけ**(`dragonfighters.equipWeaponIdx` 等)で、
名前や性能は入っていない。つまり:

⭐⭐⭐ **`town.html` / `world.html` / `title.html` にはテーブルが 1 つも無いので、
シートは「今どの武器を持っているか」を原理的に表示できない。**
索引 `"2"` は取れるが、それが「ロングソード +1」だと知る手段がそのページに無い。

**→ v1 では装備欄を出さない。** 出すには先に `js/equipment.js`(共有モジュール)が要る = **#30**。
⛔ **索引だけを頼りに `index.html` / `tavern.html` でだけ名前を出す**のは採らない
(4 ページ中 3 ページで空欄になり、「壊れている」ように見える)。
⛔ **表示用に名前を localStorage へミラーする**のも採らない(唯一の正がもう 1 つ増える)。

**再測定コマンド**:

```bash
# ⚠ index.html の主人公用は小文字 (weapons/armors/shields) なので大文字だけだと 19 しか出ない。
#    2026-08-28 実測: index.html = 22 (大文字 19 + 小文字 3) / tavern.html = 19。合計 41。
grep -cE "^\s*const ([A-Za-z_]*(WEAPONS|ARMORS|SHIELDS|EQUIP_POOLS|CHAR_EQUIP)|weapons|armors|shields)\s*=" index.html
grep -cE "^\s*const [A-Za-z_]*(WEAPONS|ARMORS|SHIELDS|CHAR_EQUIP)\s*=" tavern.html
```

### 2-4. ⚠ 罠 D — HP / AC もページによって取れない

`hp` / `maxHp` / `playerStats.ac` は **`index.html` のランタイム変数**で、localStorage に無い。

⚠ **起草中に「tavern.html は AC を自前で合成しているはず」と書きかけたが、実測で不成立だった**:

```bash
grep -nE "\b(hpMax|maxHp)\b" tavern.html        # → 0 件
```

`tavern.html` が持っているのは装備テーブルの `spec: "AC +1"` という**表示用の文字列**だけで、
数値としての AC も HP も持っていない。**HP / AC が取れるのは `index.html` の 1 ページだけ**。

**→ シートの「体」区画は `index.html` でだけ出る。他の 4 ページでは行ごと伏せる。**
⛔ **`—` や `0` を出さない**(「HP 0」は死んでいるように見える。伏せるのが正しい)。
⭐ この「取れないページでは行ごと消える」を §9 (2c) で機械検査する
(そうしないと「全ページで空欄 = でも緑」になる)。

### 2-5. 言語は完全新規 — 既存実装は 1 行も無い

```
grep -nE "language|言語|Common|共通語" index.html   →  0 件
```

`localStorage` の `dragonfighters.*` キー(実測 23 本)にも言語は無い。**衝突の心配なし。**

**採用する言語マスタ**(D&D 5.1 SRD / CC-BY 4.0 = 商用可。Product Identity 抵触なし):

| id | 表示名 | 区分 |
|---|---|---|
| `common` | 共通語 | 標準 |
| `dwarvish` | ドワーフ語 | 標準 |
| `elvish` | エルフ語 | 標準 |
| `giant` | 巨人語 | 標準 |
| `gnomish` | ノーム語 | 標準 |
| `goblin` | ゴブリン語 | 標準 |
| `halfling` | ハーフリング語 | 標準 |
| `orc` | オーク語 | 標準 |
| `draconic` | 竜語 | 異種 |
| `undercommon` | 地下共通語 | 異種 |
| `sylvan` | 森語 | 異種 |
| `celestial` | 天上語 | 異種 |
| `infernal` | 地獄語 | 異種 |
| `primordial` | 原初語 | 異種 |

**配り方(5e の「共通語 + 種族言語 + 選択」を、本作の 種族=職業 へ翻案)**:

| 職 | 固定で話せる | プレイヤーが選ぶ |
|---|---|---|
| warrior | `common` | **1 つ**(全 14 から) |
| dwarf | `common`, `dwarvish` | **1 つ** |
| elf | `common`, `elvish` | **1 つ** |
| rogue | `common` | **2 つ**(盗賊の対人技能を言語で表現) |
| cleric | `common`, `celestial` | **1 つ** |
| mage | `common`, `draconic` | **1 つ** |

⭐ **固定分は `js/player-sheet.js` の表が唯一の正**(`CLASS_LANGUAGES`)。
選択分だけを `dragonfighters.languages` に保存する。
⛔ **固定分を保存に混ぜないこと** — 混ぜると後で職の固定言語を直したとき、
既存セーブだけ古い言語を持ち続ける(§2-3 で見た「片方だけ古くなる」の再来)。

⚠ 実在 SRD 品はカタカナ音写、という既存方針(マジックアイテム)は**言語には適用しない**。
`Dwarvish` を「ドワーヴィッシュ」ではなく「ドワーフ語」とする。理由 = アイテム名は固有名詞だが、
言語名は**普通名詞**であり、日本語 TRPG の慣例も「ドワーフ語」。

### 2-6. 新規 id / グローバル名の衝突なし(実測)

```
playerSheet / sheetBtn / sheetOverlay / DFSheet / LANGUAGES
  → リポジトリ全文 (*.html, *.js) で 0 件
```

### 2-7. ⚠⚠⚠ 罠 E — 「見た目の変化が無い改修」は commit できない

`CLAUDE.md`: 「**プレイヤーに見える変化が 1 つも無いのに `index.html` / `tavern.html` /
`audio.js` を触る」設計は、そもそも採らないこと**」。
`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html","tavern.html","audio.js")` が
pre-commit で**中止**させ、`--no-verify` はハーネス側で全経路が封鎖されている。

⭐⭐⭐ **したがって #30(装備テーブルの共有モジュール化)を「純粋なリファクタ」として
単独で切ってはいけない。commit できない。**
→ **#30 は必ず「シートに装備欄が出るようになった」という可視変化と抱き合わせる。**
(この判断を先にしておかないと、実装窓が #30 に着手してから commit で詰む)

### 2-8. changelog の要否

**→ 鳴る**(`index.html` / `tavern.html` を触る)。
⭐ 書けるプレイヤー向けの要約は実在する: 「キャラクターシートをいつでも開けるようになった」。

### 2-9. 既存 golden のベースライン(2026-08-28 実測 / `638b479` 時点)

| ドライバ | 実測 |
|---|---|
| `node tools/driver_skillcheck_roster.js` | **12/12** |
| `node tools/driver_room_search_roll.js` | **39/39** |
| `node tools/verify_title_screen.js --port 8917` | **86/86**(⚠ メモの 83/83 は古い) |

⚠ **`verify_title_screen` は本チケットで最も赤くなりやすい**
(`title.html` の「汝は何者か」画面に言語選択を足すため)。**着手前に必ず測り直す。**
⚠ ポートが掴まれていると `EADDRINUSE`。`--port` を変える。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/player-sheet.js` | **新規**。シート UI + `LANGUAGES` / `CLASS_LANGUAGES` マスタ + `DFSheet` API |
| `index.html` | `<script src>` 1 行 + `#partyPanel` 内に呼び出しボタン 1 つ |
| `tavern.html` / `town.html` / `world.html` / `title.html` | `<script src>` 1 行ずつ(ボタンはモジュールが注入) |
| `title.html` | 「汝は何者か」に言語選択 UI を追加 + `departAsChosen()` で保存 |
| `assets/sheet_frame.png` | codex1 納品(羊皮紙のシート枠) |
| `tools/verify_player_sheet.js` | **新規**。§9 |

⛔ **装備まわりのファイル・関数は 1 つも開かない**(`WEAPONS` / `CHAR_EQUIP` /
`ALLY_EQUIP_POOLS` / `loadPersistentProgress` 等)。#30 の担当。
⛔ **`js/skill-check.js` を編集しない**(#28 の担当。読むだけ)。
✅ **`実装依頼書/README.md` の #29 行は追加済み**(2026-08-28。#25 が `231d1f6` で完走したため)。

---

## 4. STEP1 — `js/player-sheet.js`(共有モジュール)

`js/save-slots.js` と同じ classic script + 明示 window 代入。**5 ページ全部**が読む。

公開 API:

```js
window.DFSheet = {
  LANGUAGES,          // [{id, label, tier}] 14 件
  CLASS_LANGUAGES,    // {classKey: {fixed:[id...], picks:N}}
  open, close, isOpen,
  render,             // 中身だけ描き直す
  languagesOf,        // (classKey) 固定 + 保存済み選択 をマージ (表示の唯一の入口)
  __state,            // ⭐ 検証用シーム: 何を取れて何を伏せたかを返す
};
```

⭐ **`__state()` を必ず生やすこと。** §9 (2c) が「取れなかった行を伏せた」ことを
確かめるのに要る。これが無いと「全部空欄でも緑」になる。
⚠ **`__state()` は本番の描画結果から作る**(別経路で計算し直すと、実装とドライバが
同じ間違いを共有して両方緑になる)。

モジュールがやること:

1. `bottom:18px; left:18px; z-index:62` へ `#dfSheetBtn` を注入する。
   ⛔ ただし **`document.getElementById("partyPanel")` が在るページ(= `index.html`)では
   注入せず**、`#partyPanel` の中へ差し込む(§2-1)。
   ⭐ **ページ名で分岐しない。「その DOM が在るか」で分岐する** — ページ名分岐は
   ファイルが増えるたびに腐る。
2. `#dfSheetOverlay` を `document.body` へ 1 つだけ注入(z-index 220 = tavern の
   既存オーバーレイ 210 より上)。
3. Esc キー / 背景タップ / ✕ で閉じる。
   ⚠ **`click` だけに頼らない。`touchend` も併用する**
   (パーティ・マッチング演出のとき click 非発火端末が実在した)。

### 言語マスタ

```js
var LANGUAGES = [
  { id: "common",      label: "共通語",         tier: "standard" },
  { id: "dwarvish",    label: "ドワーフ語",     tier: "standard" },
  { id: "elvish",      label: "エルフ語",       tier: "standard" },
  { id: "giant",       label: "巨人語",         tier: "standard" },
  { id: "gnomish",     label: "ノーム語",       tier: "standard" },
  { id: "goblin",      label: "ゴブリン語",     tier: "standard" },
  { id: "halfling",    label: "ハーフリング語", tier: "standard" },
  { id: "orc",         label: "オーク語",       tier: "standard" },
  { id: "draconic",    label: "竜語",           tier: "exotic" },
  { id: "undercommon", label: "地下共通語",     tier: "exotic" },
  { id: "sylvan",      label: "森語",           tier: "exotic" },
  { id: "celestial",   label: "天上語",         tier: "exotic" },
  { id: "infernal",    label: "地獄語",         tier: "exotic" },
  { id: "primordial",  label: "原初語",         tier: "exotic" },
];
// ⛔ fixed は保存しない。保存するのは picks で選ばれた分だけ (§2-5)
var CLASS_LANGUAGES = {
  warrior: { fixed: ["common"],                picks: 1 },
  dwarf:   { fixed: ["common", "dwarvish"],    picks: 1 },
  elf:     { fixed: ["common", "elvish"],      picks: 1 },
  rogue:   { fixed: ["common"],                picks: 2 },
  cleric:  { fixed: ["common", "celestial"],   picks: 1 },
  mage:    { fixed: ["common", "draconic"],    picks: 1 },
};
```

---

## 5. STEP2 — シートの中身を描く

区画は §1 の表のとおり。**取れなかった区画は行ごと消す**(§2-4)。

- **能力値**: `DFAbilities.CLASS_ABILITIES[classKey]` の 6 値と
  `DFAbilities.abilityMod()` を並べる。⛔ **修正値を自前で計算しないこと**
  (`Math.floor((s-10)/2)` をシート側に書くと #28 の撤退スイッチ `?ability5e=0` が効かなくなる)。
- **技能**: `SkillCheck.CHECKS` を回して `SkillCheck.checkScore(member, def)`。
  習熟は `SkillCheck.CLASS_PROFICIENCIES`。
  ⚠ **`SkillCheck` は `index.html` / `tavern.html` にしか載っていない**(#28 §2-2)。
  `town/world/title` では技能区画を**行ごと伏せる**か、`js/skill-check.js` も
  5 ページへ載せるかを実装窓が選ぶ。⭐ **選んだ方を §13 に書くこと。**
- **レベル / XP**: `dragonfighters.xp` を読み、
  `XP_THRESHOLDS = [0,1000,3000,6000,10000,15000,21000,28000,36000,45000]`
  (`index.html:11841` 実測)で Lv を出す。
  ⚠ この表は現在 `index.html` の中にしか無い。**シート側に写しを作ってよい**が、
  §9 (4b) で `index.html` の実体と一致することを機械照合すること。

---

## 6. STEP3 — `title.html` の「汝は何者か」に言語選択を足す

`title.html:324 #screenNaming` / `:661 renderClassCards()` / `:635 departAsChosen()`。
⚠ **行番号は必ず測り直す**(#25 / #28 が入ると動く)。

- 職を選ぶ(`selectClass`)と、その職の `CLASS_LANGUAGES[key]` に応じて
  **固定分を表示 + 選択分のチップを `picks` 個ぶん**出す。
- `picks` 個そろうまで「出発」を押せない(既存の `elDepart.disabled` の作法に合流)。
- ⭐⭐⭐ **保存は `DFSlots.newGame()` の後**(§2-2 罠 B):

```js
try { if (window.DFSlots) DFSlots.newGame(pendingSlot); } catch (e) {}
try {
  localStorage.setItem("dragonfighters.partyComposition", JSON.stringify([chosenClass]));
  // ⚠ 罠 B: newGame() は dragonfighters.* を prefix 総なめで消す。必ずこの順序で。
  localStorage.setItem("dragonfighters.languages", JSON.stringify(pickedLangs));
} catch (e) {}
```

⚠ **職を選び直したら選択済み言語をリセットする**(ドワーフで `dwarvish` を選んでから
魔法使いへ変えると固定分と重複する)。

---

## 7. STEP4 — 絵(codex1 へ発注)

羊皮紙のシート枠 1 枚。**発注文は `codex1/requests/2026-08-28_player-sheet-frame.md` に起草し、
ユーザー承認を取ってから** `py tools/codex_request.py --request <md>` で投下する。

⚠⚠⚠ **納品後は必ず機械チェックを通す**:

```bash
py tools/check_alpha_bg_residue.py     # 透過 PNG に背景が焼き込まれていないか
```

⭐⭐⭐ **目視は「本番の背景の上」で行う。** 2026-08-16 の扉スプライトは単体では正常に見えたのに
**不透明な白い矩形**が焼き込まれており、暗い床へ置いた瞬間に白枠として出た。
検出できるのは**充填率**だけ(四隅 alpha / 外周 / 半透明率では捕まらない)。

⚠ **枠は無くても機能する形にする**(`assets/sheet_frame.png` が 404 でも CSS の
`background-image` が外れるだけでシートは読める)。絵の到着待ちで実装が止まらないため。

---

## 8. 撤退スイッチ

- **`?sheet=0`** — ボタンもオーバーレイも注入されない(`title.html` の言語選択も出ず、
  `dragonfighters.languages` も書かれない = 完全に従来どおり)。
- **判定位置** = `js/player-sheet.js` の IIFE 先頭。`location.search` を 1 回読む。
- **ページ遷移をまたぐか = またがない。** 各ページが独立に読む(`?heromark=0` と同じ)。
  ⚠ ただし **`title.html?sheet=0` で作ったキャラは言語が未保存**になる。
  シート側は「言語キーが無い = 空配列」として**固定分だけ表示**すること
  (`—` やエラーにしない)。§9 (5b) で検査する。

---

## 9. 受入条件 — `tools/verify_player_sheet.js`(新規)

http サーバ経由で 5 ページを読み、各ページでシートを開いて中身を採る。

### §0 装置(先に母集団を確かめる)

- **(0a)** **5 ページすべてが HTTP 200** で読めている(母集団 = 5)。
- **(0b)** 5 ページすべてで **`window.DFSheet` が truthy**。1 ページでも欠けたら赤。
- **(0c)** **各ページで実際にシートが開いた**ことを `DFSheet.isOpen() === true` で確認してから
  中身を採る。⭐ **これが無いと「閉じたままの空 DOM を測って全部緑」になる。**
- **(0d)** 言語マスタが **14 件**、`CLASS_LANGUAGES` が **6 職**ある。

### §1 呼び出し口(§2-1 の 2 経路)

- **(1a)** `tavern` / `town` / `world` / `title` の 4 ページで `#dfSheetBtn` が存在し、
  その中心の `elementFromPoint` が**自分自身か子孫**である
  (= 他の要素に覆われていない)。⭐ 存在だけでは足りない。
- **(1b)** `index.html` では `#dfSheetBtn` が **`#partyPanel` の子孫**である
  (固定配置で注入されていない)。
- **(1c)** 5 ページすべてで、ボタンを押す前後で `DFSheet.isOpen()` が `false → true`。

### §2 中身

- **(2a)** **6 能力すべて(CHA 含む)**が描かれている。
  値は **`DFAbilities.CLASS_ABILITIES` をブラウザで評価したもの**と一致
  (⭐ 2 経路 = DOM のテキスト vs モジュールの値。ドライバに数値を写経しない)。
- **(2b)** 修正値が `DFAbilities.abilityMod()` と一致し、
  `?ability5e=0` を付けると**シートの修正値も B/X へ戻る**
  (= シートが自前で式を持っていない)。
- **(2c)** **取れない区画は行ごと消えている。** `DFSheet.__state()` の
  `hidden` 配列と、DOM に実在しないセクション id の集合が**一致**する。
  ⭐ 「空文字を描いた」と「行ごと消した」を区別する。
- **(2d)** 技能 12 種が描かれている(`SkillCheck` が載っているページで)。
  各行の合計が `SkillCheck.checkScore` と一致。

### §3 言語

- **(3a)** `title.html` で職を選ぶと、`CLASS_LANGUAGES[key].picks` 個ぶんの
  選択チップが出る(6 職すべてで件数一致。rogue だけ 2)。
- **(3b)** `picks` 未充足では「出発」が `disabled`。
- **(3c)** 出発後、`localStorage["dragonfighters.languages"]` が
  **選択分だけ**の JSON 配列(固定分を含まない)。
- **(3d)** シートの言語欄が **`DFSheet.languagesOf(classKey)`** と一致し、
  **固定分 + 選択分**が両方出ている。
- **(3e)** 職を選び直すと選択済みがリセットされる(固定分との重複が起きない)。

### §4 恒等(非退行)

- **(4a)** シートを開閉しても、既存 HUD(`#settingsBtn` / `#partyToggleBtn` /
  `#combatLog`)の矩形が **1px も動いていない**(開く前後の `getBoundingClientRect` 比較)。
- **(4b)** シートが使う `XP_THRESHOLDS` の写しが、`index.html` の実体と**完全一致**
  (10 要素すべて)。
- **(4c)** 5 ページすべてで `pageerror` ゼロ。
- **(4d)** `localStorage` に増えたキーが **`dragonfighters.languages` の 1 本だけ**
  (前後で `dragonfighters.*` の集合を差分)。

### §5 撤退

- **(5a)** `?sheet=0` で 5 ページとも `#dfSheetBtn` も `#dfSheetOverlay` も**存在しない**。
- **(5b)** `title.html?sheet=0` で作ったキャラ(= `languages` キー無し)をシートで開くと、
  **固定分だけが出てエラーにならない**。

### ⛔ 測らないこと

- **見た目の寸法・色・フォント**。⭐ #15 で「実効文字高」を assert したのは
  札の文字が読めるかが要件だったから。シートは実機の目視で決める。
- **`assets/sheet_frame.png` の有無**(絵の到着待ちで赤にしない。§7)。
- **言語の効き目**(判定・イベント分岐)。v1 では存在しない。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `wipeorder` | `title.html` で `languages` の保存を `DFSlots.newGame()` の**前**へ移す | **(3c)** ⭐ §2-2 罠 B の再現 |
| `fixedsave` | 固定分も `dragonfighters.languages` へ保存する | **(3c)** |
| `nocha` | シートの能力値行から CHA を落とす | **(2a)** |
| `ownmod` | シートが `Math.floor((s-10)/2)` を自前で計算する | **(2b)** |
| `blankrow` | 取れない区画を「行ごと消す」でなく空文字で描く | **(2c)** |
| `fixedbtn` | `index.html` でもボタンを `position:fixed` で注入する | **(1b)** ⭐ §2-1 の再現 |
| `closedread` | シートを開かずに中身を採る | **(0c)** |

⚠ 変異は**配信スナップショットへ実行時に注入**する(本番ファイルを書き換えない)。
⚠ **変異アンカーは部分文字列で照合**。2 箇所ヒットしたら exit 3。

### 既存 golden の非退行(実装後に必ず走らせる)

| ドライバ | 基準 | 測定日 |
|---|---|---|
| `node tools/verify_title_screen.js --port 8917` | **86/86** | 2026-08-28 実測 ⚠ **最も赤くなりやすい** |
| `node tools/driver_skillcheck_roster.js` | **12/12** | 2026-08-28 実測 |
| `node tools/verify_town_map.js` | 85/85(記録値) | 記録 |
| `node tools/verify_world_map.js` | 57/57(記録値) | 記録 |
| `node tools/verify_quest_walk.js` | 25/25(記録値) | 記録 |
| `node tools/verify_recruit_size.js` | 79/79(記録値) | 記録 |
| `node tools/verify_tavern_map.js` | #25 の完了値 | ⚠ **#25 完了後に測り直す** |

⚠ **#28 を先に入れているので `driver_room_search_roll` / `driver_trap_disarm` は
#28 側で一度動いている可能性がある。** 赤を見たら **まず HEAD で走らせて切り分ける**
(自分のせいとは限らない)。

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ **ローカルは http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. **iPhone 実機**で 5 ページとも開閉できるか。特に `index.html` は
   ☰ → パーティパネル → シート の 2 段になるので、**戦闘中に開いて閉じられるか**。
2. シートを開いている間、**オートバトルが裏で進んで死んでいないか**
   (v1 は一時停止しない。危険なら「開いている間だけ止める」を #31 で検討する)。
3. 羊皮紙の枠が本番の背景の上で白枠を出していないか(§7)。
4. 言語選択が「汝は何者か」の詩的なトーンを壊していないか。

---

## 11. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>キャラクターシートを追加</b> — いつでも開いて、能力値・技能・話せる言語を確かめられるようになった。"
```

---

## 12. やらないこと + この先のロードマップ

**このチケットでやらないこと**:

- ⛔ **装備欄・装備変更**(§2-3)。**#30 / #31**。
- ⛔ **`js/skill-check.js` / `js/abilities.js` の編集**(#28 の担当。読むだけ)。
- ⛔ **言語の効き目**(碑文が読める・敵の会話が分かる 等)。後続チケット。
- ⛔ **仲間 NPC のシート**。v1 は主人公 1 人だけ。
- ⛔ **能力値をプレイヤーが振り分ける**(ポイントバイ / 4d6 ドロップ)。職固定のまま。
- ⛔ **シートを開いている間ゲームを止める**。#31 の論点。
- ✅ **`実装依頼書/README.md` への行追加は完了済み**(2026-08-28)。足した行:

```
| 29 | [2026-08-28_player-sheet-v1.md](2026-08-28_player-sheet-v1.md) | **承認済** | 0% | いつでも開けるキャラクターシート(閲覧専用)+ 言語。⛔ **#28 の後**。⭐ 呼び出し口は **2 経路**(index だけ固定スロットが空いていない)。⚠ **装備欄は出さない** — 装備の唯一の正が無く town/world/title では原理的に表示できない(#30) |
```

**この先のロードマップ(ユーザー承認済の方向。まだ起草していない)**:

| # | 内容 | 可視の変化(= changelog に書けること) |
|---|---|---|
| **#30** | 装備テーブル 41 定義を `js/equipment.js` へ集約 **+ シートに装備欄** | 「シートで今の装備が見られるようになった」⭐ §2-7 のとおり**リファクタ単独では commit できない**ので必ず抱き合わせる |
| **#31** | **シートから装備を変更**(ダンジョン中も含む) | 「どこでも装備を変えられるようになった」⚠ 論点 = 戦闘中の付け替え可否 / 開いている間ゲームを止めるか |
| **#32** | 戦闘用修正値を 6 能力スコアから**導出**へ差し替え(= #28 の第 2 段) | 「能力値が命中・回避・ダメージへ素直に効くようになった」⚠ 戦闘バランスが動く。ペア比較が要る |
| **#33** | 言語に効き目を持たせる(碑文・敵の会話・NPC 分岐) | 「話せる言語で読めるものが増えた」 |

---

## 13. 実装結果

(実装窓が埋める)
