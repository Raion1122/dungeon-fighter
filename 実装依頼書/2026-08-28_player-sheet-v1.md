# #29 プレイヤーシート v1(いつでも開ける・閲覧専用)+ 言語

- **起草**: 2026-08-28(計画窓) / **ステータス**: ✅ **完了**(2026-08-29)
- **着手 → 完了**: 2026-08-29。dev-loop 4 項目分割で**停止 0 回**。
  コミット `af08a3a` → `702ef0e` → `20150af` → `3e42886`。**実装結果は §13。**
  ⚠ **残 = ユーザーの実機体感 4 項目(§10)と、後回しにした絵(§7)。**
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

> ⚠⚠⚠ **【2026-08-29 訂正】起草時のこの節の表は誤りだった。**
> 「`town.html` は `position:fixed` が 0 件 / 左下は空」と書いていたが、**実測では 3 件**あり、
> **`#townHud` が下端全幅を占有**している(`town.html:270` `position:fixed; left:0; right:0; bottom:0; z-index:11`)。
> `world.html` も 0 件ではなく **5 件**。→ **呼び出し口は 2 経路ではなく 3 経路**になった。
> 以下は訂正後の実測値(`20150af` 時点)。

`position: fixed` の既存要素を 5 ページ全部で数えた結果:

| ページ | fixed 件数 | 左下(`bottom:18px; left:18px`)の空き | 備考 |
|---|---|---|---|
| `index.html` | **26** | ❌ `#partyPanel` が**左列全域**(`top:0; left:0; bottom:0; width:var(--ui-menu-w); z-index:10`) | 上下左右すべて既存 HUD が占有 |
| `tavern.html` | **11** | ✅ 空 | 右下は `#settingsBtn`(`bottom:18px; right:18px; z-index:30`)。他は z 200/210 のオーバーレイ |
| `town.html` | **3** | ❌ **`#townHud` が下端全幅**(`town.html:270` `left:0; right:0; bottom:0; z-index:11`) | ⚠ **デスクトップでは `display:none`**、`body.compact` のときだけ `display:flex` |
| `world.html` | **5** | ✅ 空 | `#worldTitle` は上端 / `#worldBackdrop`+`#worldViewport` は `inset:0` だが z-index 0 |
| `title.html` | **0** | ✅ 空 | |

⭐⭐⭐ **したがって呼び出し口は 3 経路。** 依頼書自身の原則
「**ページ名で分岐しない。その DOM が在るかで分岐する**」をそのまま伸ばして、
`js/player-sheet.js` の `pickHost()` を次の順で書いた:

1. `document.getElementById("partyPanel")` が在る → **その中へ差し込む**(`index.html`)
2. 無くて `document.getElementById("townHud")` が在り、**かつ表示中** → **その中へ差し込む**(`town.html` の compact)
3. どちらでもない → `bottom:18px; left:18px; z-index:62` へ固定注入(`tavern` / `world` / `title` / **デスクトップの `town`**)

⚠⚠ **経路 2 は「在るか」ではなく「表示中か」で分岐する。**
`#townHud` は `town.html:308` に**空の div として常に存在**し、中身(compact の HUD ボタン列)は
JS が後から入れる。デスクトップでは `display:none` なので、「在るか」だけで分岐すると
**デスクトップの町でボタンが永久に押せなくなる**(`isDisplayed()` を挟んで解決)。

⚠ モバイル(`body.ui-collapsed`)では `#partyPanel` が画面外へ退避するので、
**`#partyToggleBtn`(☰)を開いてから押す**導線になる。これは既存の
「パーティを見る」導線と同じなので新しい学習は要らない。

⚠⚠ **ボタンは `<button>` ではなく `<div role="button" tabindex="0">`。**
`tools/verify_town_map.js` の (11b) が **`#townHud button` を数えて**「4 施設が押せる」を
見ているため、HUD の中へ 5 本目の `<button>` を足すとその golden が即赤になる(2026-08-28 実測)。

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

### 2-9. 既存 golden のベースライン

> ⚠ **【2026-08-29 訂正】起草時の記録値は 3 本が古かった。**
> 下の表の「訂正後」は **`a7f194e` 時点で実走して確かめた値**(dev-loop の orchestrator が着手前に測定)。

| ドライバ | 起草時の記録 | **訂正後(これが正)** |
|---|---|---|
| `node tools/verify_title_screen.js --port 8917` | 86/86 | **86/86** |
| `node tools/driver_skillcheck_roster.js` | 12/12 | **13/13** ⚠ 記録が古かった |
| `node tools/verify_town_map.js` | 85/85 | **85/85** |
| `node tools/verify_world_map.js` | 57/57 | **57/57** PENDING 0 |
| `node tools/verify_quest_walk.js` | 25/25 | **25/25** PENDING 0 |
| `node tools/verify_recruit_size.js` | 79/79 | **82/82** ⚠ 記録が古かった |
| `node tools/verify_tavern_map.js` | (#25 後に測る) | **42/42** PENDING 0 |
| `node tools/verify_ability_scores.js` | — | **24/24** PENDING 0 |

⚠ **`verify_title_screen` は本チケットで最も赤くなりやすい**
(`title.html` の「汝は何者か」画面に言語選択を足すため)。**着手前に必ず測り直す。**
→ **実際に赤くなった。**(2c) の期待値そのものが新仕様と衝突したため、装置追加では直らず
**期待値を弱めずに強めて**復帰させた。詳細は §13 の逸脱 (i)。
⚠ ポートが掴まれていると `EADDRINUSE`。`--port` を変える。

### 2-10. ⚠⚠⚠ 改行コード — **`title.html` だけ LF**(5 枚のうち 1 枚)

`core.autocrlf=true` なので **`git diff` には出ない**。Python で書き換えるときは
`newline=""` を **読み書き両方**に付け、そのファイルの既存の改行に合わせること。

| ファイル | CRLF | LF | bareCR |
|---|---|---|---|
| `index.html` | 36113 | 36113 | 0 |
| `tavern.html` | 7546 | 7546 | 0 |
| `town.html` | 720 | 720 | 0 |
| `world.html` | 930 | 930 | 0 |
| **`title.html`** | **0** | **881** | 0 |
| `js/player-sheet.js` | 0 | 690 | 0 |
| `tools/verify_player_sheet.js` | 0 | 1757 | 0 |
| `tools/verify_title_screen.js` | 2072 | 2072 | 0 |

⛔⛔ **改行の実測に `grep -c $'\r'` を使わない。** Bash ツール経由だと `$'\r'` が空文字に化けて
**全行ヒットし「5 枚とも CRLF」という嘘の測定になる**(2026-08-29 に dev-loop の orchestrator が
実際にこれで誤情報を配った)。実測は **`py -c` のバイト数え**(`b.count(b'\r\n')`)で行う。

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
  ⚠ **`SkillCheck` は `index.html` / `tavern.html` にしか載っていない**(#28 §2-2。2026-08-29 に再実測して成立)。
  `town/world/title` では技能区画を**行ごと伏せる**か、`js/skill-check.js` も
  5 ページへ載せるかを実装窓が選ぶ。⭐ **選んだ方を §13 に書くこと。**
  → **「行ごと伏せる」を選んだ。**理由は §13 の「技能区画をどう解いたか」。
- **レベル / XP**: `dragonfighters.xp` を読み、
  `XP_THRESHOLDS = [0,1000,3000,6000,10000,15000,21000,28000,36000,45000]`
  で Lv を出す。
  ⚠ **【2026-08-29 訂正】行番号は `index.html:11841` ではなく `index.html:11783`。**
  (起草時の値が古かった。⭐ 行番号は #34/#35 など別チケットが入るたびに動くので、
  引用するときは必ず `grep -n "XP_THRESHOLDS *=" index.html` で測り直すこと。)
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

⭐ **基準は §2-9 の「訂正後」列**(8 本すべて `a7f194e` で実走済)。起草時の記録値は 3 本が古かった。
実装後の実測は §13 の表を見ること(**8 本すべて基準一致**)。

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

**✅ 完了(2026-08-29)。** dev-loop の 4 項目分割で **停止 0 回(8 例目)**。
着手時 HEAD = `a7f194e` / tree clean。

### 13-1. コミット

| # | 項目 | コミット | 規模 | その時点の実測 |
|---|---|---|---|---|
| 1 | `js/player-sheet.js`(新規)+ `tools/verify_player_sheet.js`(§0〜§5 の枠を**全宣言**し未実装は `pending()`) | `af08a3a` | 新規 2 本 / 1525 行(LF) | 素 **16/16 PASSED / FAILED 0 / PENDING 19** / `--negative` 16/16 / PENDING 26 |
| 2 | 5 ページへ `<script src>` + 呼び出し口 3 経路 + シート中身の描画 + **changelog 1 行** | `702ef0e` | 6 files / +521 -33 | 素 **30/30 / PENDING 5** / golden 8 本すべて基準一致 |
| 3 | `title.html` の「汝は何者か」に言語選択 UI「識る言の葉」+ 出発時保存 + 撤退の完成 | `20150af` | 3 files / +638 -29 | 素 **35/35 / FAILED 0 / PENDING 0**(受入条件を全部充足) |
| 4 | `--negative` の変異 7 本を実装 + golden 非退行 + 本節の書き戻し | `3e42886` ほか | 1 file / +74 -18 | 素 **42/42** / `--negative` **57/57** / **PENDING 0 / 空振り 0** |

⭐ **本番 HTML を触るのは項目 2 だけに閉じた**ので、changelog は **1 行で済んだ**
(`index.html` / `tavern.html` を触るコミットが 1 つしかない = §2-7 のフックを 1 回だけ通す)。
項目 3 の `title.html` と項目 4 の `tools/` は `GAME_LOGIC` の外なのでフックは鳴らない。

### 13-2. 新ドライバ `tools/verify_player_sheet.js` の最終値

```
node tools/verify_player_sheet.js              → 42/42 PASSED   FAILED 0   **PENDING** 0   (exit 0)
node tools/verify_player_sheet.js --negative   → 57/57 PASSED   FAILED 0   **PENDING** 0   (exit 0)
```

- 1757 行(**LF**)/ 既定ポート **9470**(変異帯 9471〜9477)。
- 素の 42 本 = 受入条件 35 本 + 変異アンカーの検算 `(0m-<key>)` 7 本。
- `--negative` の 57 本 = 素 42 + 変異ごとの `(neg-<key>-<節>)` 7 + `(neg-<key>-範囲)` 7 + `(n9a)` 1。

**負のコントロール 7 本 — どれも実際に担当節を赤くした(空振り 0)**:

| 変異 | 何を注入したか | 担当節 | **実測で赤くなった節** |
|---|---|---|---|
| `wipeorder` | `title.html`: `languages` の保存を `DFSlots.newGame()` の**前**へ移す | (3c) | **3c** / 3d / 4d |
| `fixedsave` | `title.html`: 固定分(`fixed`)も `dragonfighters.languages` へ保存 | (3c) | **3c** のみ |
| `nocha` | `js/player-sheet.js`: 能力値行から CHA を落とす | (2a) | **2a** / 2b |
| `ownmod` | `js/player-sheet.js`: 修正値を `Math.floor((s-10)/2)` で自前計算 | (2b) | **2b** / 0s13 |
| `blankrow` | `js/player-sheet.js`: 取れない区画を「行ごと消す」でなく空で描く | (2c) | **2c** / 2d |
| `fixedbtn` | `js/player-sheet.js`: `pickHost()` を常に `body` + `position:fixed` へ | (1b) | **1b** のみ |
| `closedread` | 装置側: `probeRealPage` の `opts.skipOpen` で**押下ごと省く** | (0c) | **0c** / 1c / 2a / 2b / 2c / 2d |

⚠ 変異は**配信スナップショットへ実行時に注入**する。**本番ファイルは 1 バイトも書き換えない。**

**⭐⭐⭐ ここで学んだこと(次のドライバへ持っていける)**:

1. **`evaluable` / `allowRed` は机上で決めない。** `--mutate <k>` を 7 本とも単体で回して
   「実際に赤くなった節」を採ってから決めた。巻き込みは**必ず**出る
   (7 本中 5 本が担当外を巻き込んだ)。
2. **⛔ その変異の `want` で測っていない節を `evaluable` に載せない。**
   母集団 0 の述語は一律 `false` を返すので、載せると「**偽の赤**」になって
   **空振りを見逃す**。`wipeorder` の (4d) と `nocha` の (2b) がこれに当たり、外した。
3. ⭐ **`fixedsave` は (3d) が緑のまま**になる。`languagesOf()` が重複を潰すので
   **画面は正しく見える**。保存の中身を直接見る (3c) だけが唯一の網。
   = 「表示のテストだけでは保存の欠陥は捕まらない」の実例。
4. ⭐ **`ownmod` は (2a) が緑のまま**。5e では `Math.floor((s-10)/2)` が正解と一致するので、
   **`?ability5e=0` を当てた (2b)** と **ソース文字列を見る (0s13)** の 2 経路だけが赤くなる。
5. ⭐ **`fixedbtn` は (1a)/(1c) が緑のまま**。`z-index:62` なので **押せてはしまう**
   = 「押せる」ではなく「**どこにマウントされたか**」を見る (1b) がないと素通りする。
6. **1 行置換の制約(`from` は 1 行 / 前後で長さを変える)を守るための書き方**:
   `wipeorder` は行の入れ替え(2 行の置換)ではなく、**`newGame()` の手前で書き、
   同じ式で `LANG_ON` を落として後段の保存を殺す**形にした。結果は「newGame より前に
   1 回だけ書いた」= 罠 B そのもの。

### 13-3. 既存 golden 8 本の非退行(2026-08-29 実測 / 全本走らせた)

| ドライバ | 基準 | **実測** |
|---|---|---|
| `node tools/verify_title_screen.js --port 8917` | 86/86 | **86/86 passed** ✅ |
| `node tools/verify_town_map.js` | 85/85 | **85 / 85** ✅ |
| `node tools/verify_tavern_map.js` | 42/42 PENDING 0 | **42/42 PASSED / FAILED 0 / PENDING 0** ✅ |
| `node tools/verify_world_map.js` | 57/57 PENDING 0 | **57/57 PASSED / FAILED 0 / PENDING 0** ✅ |
| `node tools/verify_ability_scores.js` | 24/24 PENDING 0 | **24/24 PASSED / FAILED 0 / PENDING 0** ✅ |
| `node tools/driver_skillcheck_roster.js` | 13/13 | **13/13 passed** ✅ |
| `node tools/verify_recruit_size.js` | 82/82 | **82/82 PASS** ✅ |
| `node tools/verify_quest_walk.js` | 25/25 | **25/25 PASSED / PENDING 0** ✅ |

### 13-4. ⭐ 職業名をどう解いた か(§5 が「選んだ方を書け」と指示した点)

**`js/player-sheet.js` が自前の `CLASS_LABELS`(6 職)を持つ。ただし写しではなく fallback。**

`classLabel(key)` は **`window.HERO_CLASSES` が在ればそちらを優先**し、無いときだけ自前表を使う。

- 理由 = **`js/hero-classes.js` は title / town / world の 3 枚にしか載っていない**
  (2026-08-29 実測。⚠ しかも `js/hero-classes.js` の冒頭コメントは
  「title.html と tavern.html が読み込む」と書いていて**実物とズレている**)。
- ⛔ **`js/hero-classes.js` を 5 枚へ載せる案は採らなかった。**
  title/town/world の 3 枚は主人公スプライトの解決に使っており、
  index/tavern には**別の職業表がすでに在る**。5 枚へ載せると「4 つ目の正」が増える。
- ⭐ **ズレたら赤くなる。** ドライバの **(0s12)** が `HERO_CLASSES` を同載したスタブページで
  6 職すべてを **2 経路照合**する(自前表 vs `HERO_CLASSES`)。

### 13-5. ⭐ 技能区画を town/world/title でどうしたか(§5 が「選んだ方を書け」と指示した点)

**「行ごと伏せる」を選んだ。**`js/skill-check.js` を 5 枚へ載せる案は採らなかった。

- 理由 = `js/skill-check.js` は**判定 UI ごと引き連れてくる**ので、閲覧専用のシートには重い。
- ⭐ **伏せたことは機械検査している。** (2c) が `__state()` の `avail`(データが取れたか)と
  `inDom`(DOM に居るか)を **別々に**返させ、不一致(`mismatch`)を見る。
  ⛔ `hidden` 配列だけを見ると **`inDom` から作った値を `inDom` と比べる自己参照**になり、
  「全部空欄でも緑」になる。(2d) も「`SkillCheck` が無いページで技能区画が残っていたら赤」を見る。
- 実測の伏せ方: `index` = 伏せ 0 / `tavern` = 体 / `town`・`world`・`title` = 技能 + 体。
  **伏せた区画 計 7・全部出たページ 1** で母集団ガードも満たしている。

### 13-6. ⚠ 依頼書からの逸脱(実装窓が実測で見つけて直したもの — **全 12 件**)

**項目 1**

- **(a)** `#dfSheetBtn` は **`<div role="button" tabindex="0">`** であって `<button>` ではない。
  `tools/verify_town_map.js` の (11b) が **`#townHud button` を数えている**ため、
  HUD へ 5 本目の `<button>` を足すとその golden が即赤になる。
- **(b)** town のルートは「`#townHud` が在る」ではなく「**表示中**」で分岐(§2-1 の訂正を参照)。
- **(c)** ⚠⚠ **HP / AC は window 非搭載**(classic script 直下の `const`/`let`)。
  → `DFSheet.setBodyProvider()` を生やし、**`index.html` 側で登録する**設計にした。
- **(d)** 職業名は自前 `CLASS_LABELS` + `HERO_CLASSES` 優先の fallback(§13-4)。
- **(e)** ドライバの既定ポートは **9470**(依頼を受けた 8935 ではない)。
  理由 = 変異 7 本ぶんの帯 8936〜8942 が `driver_choice_logslot`(8940)/
  `driver_mapeditor_waterkit`(8941)/ `verify_ability_scores` の変異帯 8931〜8936 と重なる。
  **9470〜9479 は丸ごと空き**だった。

**項目 2**

- **(f)** ⚠⚠⚠ **「5 枚とも CRLF」は誤り。`title.html` は今も LF。**(§2-10 を新設して記録)
- **(g)** ⚠⚠ **`index.html` の `hp` / `playerStats` は「隊列の先頭」のもの**なので、
  主人公が中衛/後衛だと **NPC の HP/AC を「自分の体」として出してしまう**。
  → `!heroIsHead` のとき `heroRef` へ落とす修正を入れた。
- **(h)** `tavern.html` の `#prologueOverlay` が**初回訪問で `#dfSheetBtn` を覆う**
  (これは演出であって欠陥ではない)。ドライバは `dragonfighters.prologueSeen='1'` を種として撒く。

**項目 3**

- **(i)** ⚠⚠⚠ **`verify_title_screen` の (2c) は期待値そのものが新仕様と衝突した**
  (旧: 「職を選べば出発が有効」/ 新: 「職 + 言の葉が揃って有効」)。
  装置追加だけでは直らないので、**期待値を弱めずに強めた** —
  「職だけでは `disabled` → 言の葉を選ぶと有効」という **2 相を同じ assert 内で見る**形にし、
  `pickLanguages()` を 5 箇所へ挿入して **86/86 復帰**。
  ⭐ **依頼書には「影響なし」相当の記述しかなく、そこが崩れていた。**
- **(j)** 撤退判定は `title.html` 側では**クエリを読み直さず `window.DFSheet` の有無**で分岐。
  (判定を 2 箇所に持つと片方だけ直して食い違うため。§8 の「判定位置は 1 箇所」を守る形)
- **(k)** §9 (4d)「増えたキーが `languages` の 1 本だけ」は **`newGame()` の prefix 総なめ**のせいで
  **出発前後の単純差分では測れない**(前が全部消えるので「増えた」を定義できない)。
  → **`?sheet=0` で出発した記録との集合差**に置換した。
- **(l)** 名乗り画面のチップは `data-pick-lang` / `data-fixed-lang`
  (シートの `data-lang` / `data-fixed` と**わざと分けた**。`probeRealPage` が
  document 全体からチップを拾うので、同名だと (3d) の母集団が汚れる)。

### 13-7. 残っている宿題

**⭐ ユーザーの実機体感(§10 の 4 項目)— ここが本当の受入。まだ誰も見ていない。**

1. **iPhone 実機**で 5 ページとも開閉できるか。特に `index.html` は
   ☰ → パーティパネル → 📜シート の **2 段**になるので、**戦闘中に開いて閉じられるか**。
2. シートを開いている間、**オートバトルが裏で進んで死んでいないか**
   (v1 は一時停止しない。危険なら「開いている間だけ止める」を **#31** で検討)。
3. 言語選択「識る言の葉」が **「汝は何者か」の詩的なトーンを壊していないか**。
4. デスクトップの `town.html` で、左下の 📜シートボタンが看板や街の絵と喧嘩していないか。

**⛔ このループでやらなかったこと(ユーザー判断で後回し)**

- **§7 の絵**(`assets/sheet_frame.png` / codex1 への発注)。
  ⭐ **枠が 404 でもシートは読める**形になっている(`background-image` が外れるだけ)。
  発注文の起草もしていない。羊皮紙の枠が欲しくなったら **#29 の残件**として別途起こす。
  ⚠⚠⚠ 納品後は必ず `py tools/check_alpha_bg_residue.py`(**充填率**だけが白矩形を捕まえる)。

**後続チケットへの申し送り**

- **#30**(装備テーブル 41 定義の集約 + シートに装備欄): ⭐ §2-7 のとおり
  **純粋なリファクタ単独では commit できない**。必ず可視変化と抱き合わせる。
  ⭐ シート側の受け口はもう在る — `SECTION_DEFS` に 1 件足して `render()` に 1 ブロック
  書けば区画が増える。**`__state()` の `avail`/`inDom` も自動で追随する**
  (ただし (0s9) が「区画 5 件」を直書きしているので **そこを 6 へ直すこと**)。
- **#31**(シートから装備変更): 論点 = 戦闘中の付け替え可否 / 開いている間ゲームを止めるか。
  ⚠ 止める設計にするなら (4a)「HUD が 1px も動かない」は影響を受けないが、
  **オートバトルのループへ触る**ので `driver_grid_p8` 系の golden を先に測ること。
- **#32**(戦闘用修正値を 6 能力から導出): ⚠ 戦闘バランスが動く。ペア比較が要る。
- **#33**(言語に効き目): `DFSheet.languagesOf(classKey)` が**表示の唯一の入口**として
  もう在るので、効き目側もここを読むこと(⛔ `localStorage` を直接読まない —
  **固定分は保存されていない**ので選択分しか取れず、必ず取りこぼす)。
