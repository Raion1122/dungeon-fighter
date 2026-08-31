# #39 暗視を編成の判断材料にする — 職業ごとの視界をプレイヤーへ見せる

- **起草**: 2026-08-31(計画窓) / **ステータス**: ✅ **完了**(2026-08-31 / dev-loop 4 項目・停止 0 回)
- **着手**: ✅ **完了**(2026-08-31)。`ed704e8`(項目1) / `df48c0f`(項目2) / `14ad37d`(項目3) /
  `a97f60c`(項目4 装置) + 文書コミット。⛔ push は未実施(dev-loop の規約)。
  新 driver `tools/verify_darkvision.js` **25/25 PASSED / FAILED 0 / PENDING 0**、
  `--negative` **38/38・空振り 0**、既存 golden **10 本すべて基準どおり**。**実測の全文は §12**。
  ⭐ 承認の経緯: ユーザーの承認は「**依頼書に書いたとおりで進めてよい**」という一括承認
  (「承認します」2026-08-31)。提示した 3 つの確認点に個別の指示は無かったので、
  **依頼書の案がそのまま採用**される: ①着手可 / ②`CLASS_SIGHT` の**移設に踏み込む** /
  ③本チケットが **#39** を取り #38 側の予約 5 箇所を書き直す。
- ⚠ **着手する窓へ**: 承認から時間が経っていたら、**実装に入る前に §2 の主張をもう一度本番の関数で 1 回測る**
  (行番号は別チケットが 1 本着地しただけで全滅する)。
- **触るファイル**: `js/class-sight.js`(新規) / `index.html` / `tavern.html` / `title.html` /
  `js/player-sheet.js` / `js/mercenary-roster.js`(コメント 1 行のみ) /
  `tools/verify_darkvision.js`(新規) / `実装依頼書/README.md` / `dev-meetings/2026-08-29_次の方向性.md` / `CLAUDE.md`
- ⛔ **触らないファイル**: なし。**2026-08-31 時点で `git status` はクリーン**、`origin/main` と同期済み
  (`HEAD = f80a03c`)。別窓の並走は無い。⚠ それでも `git add .` は使わず **ファイル単位 add** で、
  `git diff --cached <file>` を読んでから commit すること(並走は途中で始まりうる)。

---

## 1. 目的

**この機能は「作る」のではなく「見せる」チケットである。**

ダンジョンの暗さ(フォグオブウォー)も、職業ごとに見える範囲が違うことも、**すでに実装され、
毎回のプレイで動いている**。ドワーフは 12 タイル先まで、エルフは 10 タイル、それ以外の 4 職は
8 タイル先まで見える(`index.html:4616` `CLASS_SIGHT`)。しかもこの視界は
リーダーだけでなく**生存中の全メンバーぶんが合成される**(`index.html:16682-16686`)
——つまり**ドワーフを 1 人連れているだけで、パーティ全体の見える範囲が 1.5 倍先まで届く**。

ところが、この差はゲーム内で **1 文字も語られていない**。プレイヤーが読める場所に
「視界」「暗視」「低光視力」の語は 1 件も出てこない(§2-6 の実測)。
主人公の職業は**一度選ぶと二度と変えられない**(`?herolock=0` / 依頼書 #6)のに、
選ぶ画面には「暗視 60 フィート」に相当する情報がない。傭兵名簿(#38)で誰を見送るかを決めるときも同じ。

本チケットは **新しいゲームロジックを 1 つも足さない**。すでに動いている数値を、
**プレイヤーが選ぶ瞬間の 4 箇所**へ出すだけである。

**ユーザー決定(2026-08-31)**:

- 開発会議の候補④「灯りと闇 — 未踏の部屋を塗り残す」は、**着手前の実測で実装済みと判明したため不採用**。
  会議で根拠になった「`fogOfWar` の grep がゼロ件」は**単語が無かっただけ**で、実体は
  `exploredTiles` / `renderLighting` / `lightingCanvas` という名前で、しかも会議の縮小版より上位の
  **3 状態フォグ**(未探索=暗黒 / 記憶=薄明 / 現在視界=明)として出荷済みだった(§2-1)。
- 代わりに **「既にある暗視を、選ぶ瞬間に見せる」**へ差し替える。
- ⭐ 不採用にした別案も残す:
  - **「灯りの補給」**(松明・ランタン油を消耗品にし、尽きると視界が縮む) — `torchFuel` は
    リポジトリ全文 grep で **0 件 = 真に未実装**。ただし候補③「冒険の賭け金」と設計が重なるので、
    ③ を起こすときに統合する。本チケットでは**数値を 1 つも動かさない**。
  - **フル実装のフォグオブウォー**(プレイヤーの視界だけ狭める) — 会議で
    「**プレイヤーが操作しないゲームで、プレイヤーの視界だけ狭めても不便になるだけ**」と結論済み。
    本チケットは視界の**値にも挙動にも触らない**。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

**測定日 2026-08-31 / `HEAD = f80a03c` / 作業ツリーはクリーン。**
⚠ 行番号は**必ずズレる前提**で読むこと(#37 の着地だけで index が +29〜30 / tavern が +142 動いた)。
以下は**構造と件数**を主に書き、行番号は測定日時点の目印として添える。

### 2-1. ⚠⚠⚠ 会議の前提は 5 件崩れた — フォグオブウォーは完成品として出荷済み

| 会議(第1段)の主張 | 判定 | 実測 |
|---|---|---|
| 「`fogOfWar` の grep 結果がゼロ件」= 未実装 | ❌ **崩れた** | 単語が無いだけ。実体は `index.html:6889` `renderLighting()` = 暗幕 `rgba(3,5,10,1.0)` を全面に張り `destination-out` で削る |
| 「歩いた場所は明るく残る」を**作る** | ❌ **既にある** | `index.html:6924-6947` 探索記憶レイヤー。未探索 `α=255` / 記憶 `α=178`(0.30 削り) / 現在視界 `α≈0` の **3 状態** |
| 「まだ行ってない部屋は暗い」を**作る** | ❌ **既にある** | `exploredTiles`(累積)と `visibleTiles`(毎更新クリア)= `index.html:4638-4639`。⭐ **`buildNode()` がノードごとに作り直す** = 1 ノード 1 部屋なので「部屋をまたぐ塗り残し」という概念自体が構造上存在しない |
| `hasLineOfSight` を**流用する** | ⚠ **流用先が無い** | 既に **30 箇所**で使用中(`grep -c` 実測)。視界更新は `index.html:16677` が担当済み |
| 「壁掛け松明のアセットはもう `assets/` にある」(=未配線の含み) | ❌ **崩れた** | `index.html:6118` が**北壁の下へ `h%5`(1/5)の密度で自動配置**し、`index.html:7023-7032` が**ちらつき付きの光源として発光**させている |

さらに、会議が知らなかった実装が 3 つある:

- **職業別の視界レンジ**(`index.html:4616` `CLASS_SIGHT`)
- **壁を照らす層**(`wallLitTiles` / `WALL_LIT=0.32` — 今いる部屋の壁だけ暗幕を余分に削る)
- **フォグが無効なのは屋外だけ**(`index.html:6898` `if (__daylight)`。
  `__daylight` は `IS_FIELD_THEME`(隊商護衛の街道)でしか立たない = **ダンジョン 6 シナリオは全部フォグ有効**)

**再測定コマンド**:

    grep -n "exploredTiles\|visibleTiles\|renderLighting\|CLASS_SIGHT" index.html | head -20
    grep -c "hasLineOfSight" index.html

**副産物 ⚠ `CLAUDE.md` の「実装が必要な機能(未実装)」が腐っている。** 次の 3 つは実装済み:

| CLAUDE.md の記述 | 実体 |
|---|---|
| フォグオブウォー | `index.html:6889`(上記) |
| DM ナレーション UI(画面上部・Noto Serif JP) | `index.html:2989` `#dmNarration` + `index.html:820` `Noto Serif JP` |
| フェーズ表示(🔍探索/⚔️戦闘/💤休憩) | `index.html:2975` `#phaseIcon`/`#phaseText` + `index.html:13090` の 3 状態表 |

→ STEP4 で 3 行落とす(§6)。

### 2-2. ⚠⚠⚠ 罠A — 「数値を写すな」が**明文で禁止されている**

`js/hero-classes.js` のヘッダに、このチケットの一番危ない道が名指しで塞がれている:

    ★ なぜ数値 (HP / AC / 命中 / ダメージ) を 1 つも持たないのか  ⚠ 足さないこと
      実数は index.html の CLASS_DEFS が唯一の正。ここに書き写すと
      **バランス調整のたびに片方だけ古くなり、必ず腐る**(= 嘘の数字をプレイヤーに見せる)。
      このファイルが持ってよいのは「調整で動かない性質」= 役割と持ち味の言葉だけ。

⭐ **禁じられているのは「写し」であって「移設」ではない。** 禁止の理由は「片方だけ古くなる」なので、
**唯一の正そのものを共有モジュールへ移し、`index.html` がそこから読む**なら理由に反しない。
→ 本チケットは `js/hero-classes.js` に視界を**足さない**。新しい共有モジュール
`js/class-sight.js` を作り、**`CLASS_SIGHT` の中身をそこへ移す**。

⛔ **`tavern.html` / `title.html` / `js/player-sheet.js` に数値リテラルを 1 つも書かない。**
この罠は §8 の負のコントロール **`shadowsight`** で機械検査する。

### 2-3. ⚠⚠⚠ 罠B — `CLASS_SIGHT` は既存ドライバ 3 本が**裸の識別子**で読んでいる

    grep -n "CLASS_SIGHT" tools/*.js

| ドライバ | 行 | 読み方 |
|---|---|---|
| `tools/driver_grid_p5.js` | 357 | `for (const k of Object.keys(CLASS_SIGHT))`(ガード無し) |
| `tools/driver_speech_boss.js` | 174 | `typeof CLASS_SIGHT !== 'undefined' && CLASS_SIGHT.warrior ? …tiles : -1` |
| `tools/driver_wall_face.js` | 229 | 同上(`.outer`) |

⭐ classic script 直下の `const` は **`window` には載らないが、グローバル字句環境には入る** ので
`page.evaluate(() => CLASS_SIGHT)` のような**裸の識別子**では読める(既存 3 本がそれで動いている)。

⛔ **したがって `CLASS_SIGHT` / `CLASS_SIGHT_LEGACY` / `getSight` の 3 つの識別子と、
`{tiles, inner, outer}` という shape を `index.html` の中に残すこと。** モジュールは
「基の表を供給する」だけで、`index.html` 側は今までどおり自分の `const CLASS_SIGHT` を持つ
(中身をモジュールから作る)。ここを消すと 3 本が黙って `-1` を拾うか例外で落ちる。

### 2-4. ⚠⚠ 罠C — `driver_speech_boss` / `driver_wall_face` は **legacy 値**を期待している

- `driver_speech_boss.js:192` … `on.warriorSight === 4`
- `driver_wall_face.js:330` … `M.pinOuter === 330`

現行値は戦士 `tiles:8 / outer:660`。**4 と 330 は `CLASS_SIGHT_LEGACY.warrior = [4,150,330]` の値**
= この 2 本は `?dndrange=0`(旧仕様への退避スイッチ)を付けて走っている。
→ **`CLASS_SIGHT_LEGACY` も一緒にモジュールへ移す**こと。片方だけ移すとこの 2 本が壊れる。
負のコントロール **`legacydrop`** で検査する。

### 2-5. 数値の実測と「フィート」換算の出所

現行値(`index.html:4616-4632` をそのまま読んだもの):

| classKey | tiles | inner | outer | index.html のコメントが与えている意味 |
|---|---|---|---|---|
| `warrior` / `cleric` / `rogue` / `mage` | **8** | 300 | 660 | 「松明の明域 20ft + 薄暮域 20ft = **40ft**」 |
| `elf` | **10** | 375 | 825 | 「**低光視力**(明かりの半径 x2 の簡略)」 |
| `dwarf` | **12** | 450 | 990 | 「**暗視 60ft**」 |

**基準の再現**: コメントの 40ft(8 タイル)と 60ft(12 タイル)から **1 タイル = 5 ft** が逆算でき、
D&D の 5 フィート格子と一致する。エルフの 10 タイルは **10 × 5 = 50 ft**
(⚠ コメントはエルフのフィート数を書いていない = **この 50 は導出値**。だから
`FT_PER_TILE = 5` を**モジュールに定数として 1 つだけ置き**、3 職ぶんを個別に書かない)。

⚠⚠ **`TILE_SIZE = 96`(px)とは別物。** `TILE_SIZE` は画面の px であって、フィートとは無関係。
`outer`(px)を ft に換算してはいけない —— `outer < tiles * TILE_SIZE` は
`driver_grid_p5.js:654` が守っている**別の不変条件**であり、光半径は視界半径より内側にある。

**表示に使う語**(⭐ 数値と同じくモジュールが唯一の正。写経しない):

| classKey | 語 | 根拠 |
|---|---|---|
| `dwarf` | **暗視** | index.html のコメント「暗視 60ft」。5.1 SRD の Dwarf Darkvision 60ft と一致 |
| `elf` | **低光視力** | 同コメント。⚠ **「暗視」と書かない** — 本作のエルフは 10 タイル(50ft)で、SRD の Elf(60ft)とは違う。SRD の語を当てると嘘になる |
| その他 4 職 | **松明の灯り** | 同コメント「松明の明域 + 薄暮域」。暗視を持たない = 灯り頼み |

### 2-6. 表示先 4 箇所の実測(どこに 1 行入るか)

プレイヤーが**選ぶ**順に並べる。⭐ 4 箇所とも**既にラベル + 値の行が並んでいる場所**なので、
新しい枠も新しい HUD ボタンも要らない(#37/#38 で HUD の置き場所は使い切っている)。

| # | 画面 | 実測した器 | 何が決まる場面か |
|---|---|---|---|
| 1 | **名乗り(主人公選択)** `title.html` | `title.html:830-834` `classDetail` に `classZone` / `classRole` / `classNote` の 3 行。1 タップ目で開く | ⭐ **一度選ぶと変えられない**(#6 `?herolock=0`)。視界が効く唯一の恒久的な選択 |
| 2 | **傭兵名簿** `tavern.html` | `tavern.html:5316-5320` `mrMeta` = 「戦士 / Lv3 / 同行 5 回」 | ⭐ **「見送る」ボタンがある** = 誰を名簿に残すかの選択(#38) |
| 3 | **マッチング画面のカード** `tavern.html` | `tavern.html:7517-7526` `pmName`/`pmClass`/`pmZone`/`pmEquip`/`pmSkills` | 選択ではなく**説明**(今回なぜ遠くまで見えたのか) |
| 4 | **キャラクターシート** `js/player-sheet.js` | `js/player-sheet.js:1031-1044` 区画 `dfSheetSecTraits`「特徴 & 特性」に `立ち位置`/`役割`/`持ち味`(+ index では `構えている技`) | ⭐ 5E シートで**暗視が載る正規の欄**(#36 でこの区画を作ってある) |

**「視界」の語がプレイヤーの読める場所に無いことの実測**:

    grep -n "視界" tavern.html title.html js/player-sheet.js js/mercenary-roster.js

→ `tavern.html` の 2 件はどちらも**プレイヤーに出ない**
(3151 は「崩れた城壁が視界を阻み」= 諜報失敗の文、4129 は開発コメント)。
`title.html` / `js/player-sheet.js` / `js/mercenary-roster.js` は **0 件**。

⚠⚠ **カードは狭い。** `tavern.html:2075` に
「⭐ カードの中には入れない —— 4 列のカード 1 枚の実効幅にはスキル 1 行が原理的に入らない」
と明記されている(#35 が引き出しを別パネルにした理由)。
→ カードへ足すのは **`.pmZone` と同じ 11px の 1 行だけ**にし、`min-height: 296px` を
超えて伸びないことを §8 (3c) で測る。狭幅(≤ 900px)では `grid-template-columns: repeat(2,1fr)` に
落ちる(`tavern.html:2213`)ので、**compact のほうが余裕がある**。

**既存ドライバがカードのどこを掴んでいるか**(足す場所を決めるために実測):

    grep -rn "pmZone\|pmClass\|pmName\|pmEquip\|pmSkills" tools/*.js

→ `.pmName` / `.pmClass` / `.pmEquipRow` / `.pmEquipLabel` / `.pmEquipVal` / `.pmSkillsVal` は
掴まれているが、**`.pmZone` を掴んでいるドライバは 0 本**。
⭐ それでも `.pmZone` の文字列は変えず、**新しい `.pmSight` を 1 つ足す**(既存の器を作り替えない)。

### 2-7. ⚠⚠⚠ 罠D — #38 が「#39」を**別の中身で予約している**

    grep -rn "#39" js/ 実装依頼書/*.md

| 場所 | 記述 |
|---|---|
| `js/mercenary-roster.js:28` | `⛔ alive/dead… 今回は仲間を死なせない (依頼書 §1 のユーザー決定)。#39 が足す` |
| `実装依頼書/2026-08-29_mercenary-roster.md:41` | `死は #39 候補③「冒険の賭け金」で寺院・蘇生費用と一緒に入れる` |
| 同 :363 | `⛔ alive / dead は持たない(今回は死なせない)。**#39 が足す**。` |
| 同 :676 | `⭐ 感じるなら #39 候補③ の設計材料になる` |
| 同 :689 | `⛔ 仲間の死・恒久ロスト・負傷の持ち越し。**#39 候補③「冒険の賭け金」**` |

⭐⭐⭐ これは #38 の教訓「**座標でなく構造で書く**」が、**予約の書き方**でそのまま再発した例である
(番号は着手順が変われば必ずズレる)。

**決め**: 番号は `実装依頼書/README.md` の「上から順に着手する」規則に従い、
**本チケットが #39** を取る。上記 5 箇所の「#39」を **番号ではなく中身**で書き直す:

- `js/mercenary-roster.js:28` → `後続チケット(候補③「冒険の賭け金」)が足す`
- `実装依頼書/2026-08-29_mercenary-roster.md` の 4 箇所 → `候補③「冒険の賭け金」`(番号を消す)

**✅ 変異アンカーに当たらないことは本窓が実測済み。** `tools/verify_mercenary_roster.js` の
`NEG_MUTATE`(221 行〜)を全部読んだ結果、10 本の変異アンカーは**すべて実行されるコード行**
(`var KEY = "dragonfighters.mercRoster";` / `ov.classList.remove("show");` など)を
文字列一致で掴んでおり、**ヘッダコメント(28 行目)を掴んでいる変異は 0 本**。
→ コメントの書き換えは安全。⚠ それでも実装後に `--negative` を走らせて空振り 0 を確かめること。
当たっていた場合はコメントの変更を諦め、`実装依頼書/` 側の 4 箇所だけ直す
(⭐ **本番ファイルを守るほうを優先**)。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

→ **鳴る**(`index.html` と `tavern.html` の両方を触る)。

⭐ **書けるプレイヤー向けの要約が実在するか**: する。
「**仲間の見える範囲が編成画面で分かるようになった**」「**ドワーフは暗闇で最も遠くまで見通す**」は
どちらも**画面上で実際に起きる変化**であり、でっち上げではない。§10 に文面を用意した。

⚠⚠ ただし **STEP1(モジュール新設 + 移設)だけでは見える変化が無い**。
`index.html` を触るのに changelog が書けない = commit で詰む
(⭐ dev-loop の既知の罠「項目 1 を STEP1 のみにすると commit で詰む」)。
→ **STEP1 に「キャラクターシートの視界行」まで含める**(§4)。これで STEP1 単体でも
「キャラクターシートに視界が載った」という実在の要約が書ける。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/class-sight.js` | **新規**。`BASE` / `LEGACY` / `FT_PER_TILE` / `sightOf()` / `feetOf()` / `sightLabel()` / `enabled()` を `window.DFSight` として公開 |
| `index.html` | `<script src="js/class-sight.js">` を追加(⚠ インライン本体より前)。`CLASS_SIGHT` / `CLASS_SIGHT_LEGACY` の**リテラル表を消し、モジュールから作る**。識別子と shape は据え置き |
| `js/player-sheet.js` | 「特徴 & 特性」区画に `data-stat="sight"` の 1 行を追加。`d.traits.sight` を `DFSight` から取る |
| `title.html` | `<script src="js/class-sight.js">` 追加 + `classDetail` に `classSight` の 1 行 |
| `tavern.html` | `<script src="js/class-sight.js">` 追加 / カードに `.pmSight` の 1 行 / 名簿の `mrMeta` に視界を追記 |
| `js/mercenary-roster.js` | ⚠ **コメント 1 行のみ**(§2-7)。⛔ ロジックは 1 命令も触らない |
| `tools/verify_darkvision.js` | **新規**。受入条件の装置(§8) |
| `実装依頼書/README.md` | #39 の行を追加(文面は §11) |
| `dev-meetings/2026-08-29_次の方向性.md` | 候補④の節へ「**着手前実測で実装済みと判明 → 不採用**」を追記 |
| `CLAUDE.md` | 「実装が必要な機能(未実装)」から腐った 3 行を落とす(§2-1) |

⛔ **`index.html` の視界の値(`tiles` / `inner` / `outer`)を 1 つも変えない。**
`driver_grid_p5.js` の (3b)(3d)(3e)(3f) が 6 職ぶん台帳で縛っている。本チケットは**表示だけ**。

⛔ **`renderLighting()` / `exploredTiles` / `visibleTiles` / `wallLitTiles` / `hasLineOfSight` を触らない。**

### 3-1. dev-loop の割り方(推奨 4 項目)

⭐ 「STEP の数」ではなく「**母集団が立つ順**」で割る(装置の §0 は必ず項目 1 へ)。

| 項目 | 中身 | changelog |
|---|---|---|
| **1** | STEP1(モジュール新設 + `index.html` 移設 + シートの視界行)+ ドライバの **§0 装置**と (1a)(1e)(1f) | ⭐ **書ける**(シートに視界が載る)。⚠ ここを「移設だけ」にすると commit で詰む(§2-8) |
| **2** | STEP2(名乗りカード + マッチングカード)+ (1b)(1d)(2a)(2b) | 書ける |
| **3** | STEP3(傭兵名簿)+ (1c)(3a)(3b)(3c)(3d) | 書ける |
| **4** | 撤退 §4 + 負のコントロール 12 本 + 既存 golden の非退行 + 文書(§6-2) | ⚠ 文書のみなら鳴らない |

⭐ 各 worker は `notes_for_next` に **実装後の最新行番号**を書き残すこと(次の worker が迷わない)。
⭐ orchestrator は項目 1 の前に **golden の基準を自分で採る**(そのぶん項目 1 が軽くなる)。

---

## 4. STEP1 — `js/class-sight.js` を作り、`index.html` の表を移し、シートに 1 行出す

### 4-1. `js/class-sight.js`(新規)

`js/abilities.js` / `js/hero-classes.js` と同じ **classic script + `global.` 代入**の作法で書く。

    /*
     * js/class-sight.js — 職業ごとの視界の唯一の正 (実装依頼書 #39) v1
     * ------------------------------------------------------------------
     * ★ なぜこのファイルがあるのか
     *   視界 (CLASS_SIGHT) は index.html の中だけにあり、フォグオブウォーの濃さと
     *   敵の可視判定を毎フレーム決めている。ところが **プレイヤーには 1 文字も出ていなかった**。
     *   名乗り・傭兵名簿・マッチング画面・キャラシートの 4 箇所へ出すために、
     *   4 ページから読める場所へ「唯一の正」を移す。
     *
     * ⛔ 数値をここから **写さない**。js/hero-classes.js のヘッダが禁じているのは「写し」であって
     *   「移設」ではない。写しを作った瞬間、片方だけ古くなって嘘の数字がプレイヤーに出る。
     *   → tools/verify_darkvision.js の負のコントロール `shadowsight` が機械検査する。
     *
     * ⚠ index.html は今までどおり自分の const CLASS_SIGHT / CLASS_SIGHT_LEGACY / getSight を持つ。
     *   既存ドライバ 3 本 (driver_grid_p5 / driver_speech_boss / driver_wall_face) が
     *   **裸の識別子**でそれを読んでいるため。ここは「基の表」を供給するだけ。
     *
     * ⚠ classic script 直下の let/const/function は window に載らない。公開は末尾の global 代入だけ。
     */
    (function (global) {
      "use strict";

      /* 1 タイル = 5 ft。⭐ 出所 = index.html の CLASS_SIGHT 注記
       *   「松明の明域 20ft + 薄暮域 20ft = 40ft」= 8 タイル / 「暗視 60ft」= 12 タイル。
       * ⚠ TILE_SIZE (96px) とは無関係。あれは画面の px。 */
      var FT_PER_TILE = 5;

      /* tiles = 視界半径 (タイル) / inner・outer = 放射光半径 (px, drawLight 用)
       * term  = プレイヤーに見せる語。⚠ elf を「暗視」と書かないこと —— 本作のエルフは
       *         10 タイル (50ft) で、5.1 SRD の Elf (Darkvision 60ft) とは違う。 */
      var BASE = {
        mage:    { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
        warrior: { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
        cleric:  { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
        rogue:   { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
        elf:     { tiles: 10, inner: 375, outer: 825, term: "低光視力" },
        dwarf:   { tiles: 12, inner: 450, outer: 990, term: "暗視" },
      };

      /* ★退避スイッチ ?dndrange=0 の旧値。⚠ 必ず一緒に持つこと ——
       *   driver_speech_boss (warriorSight===4) と driver_wall_face (pinOuter===330) は
       *   この旧値を期待して走っている。 */
      var LEGACY = {
        mage:    [3, 120, 260], warrior: [4, 150, 330], cleric: [4, 150, 330],
        rogue:   [4, 150, 330], elf:     [5, 180, 400], dwarf:  [6, 210, 470],
      };

      function sightOf(classKey) { return BASE[classKey] || BASE.warrior; }
      function feetOf(classKey)  { return sightOf(classKey).tiles * FT_PER_TILE; }

      /* 表示文字列の唯一の正。⛔ 4 箇所の画面がそれぞれ組み立てないこと。
       *   short=true … 狭い器 (マッチングカード / 名簿の 1 行) 用 */
      function sightLabel(classKey, short) {
        var s = sightOf(classKey);
        if (short) return "視界 " + s.tiles;
        return "視界 " + s.tiles + " マス (" + feetOf(classKey) + " ft)・" + s.term;
      }

      global.DFSight = {
        FT_PER_TILE: FT_PER_TILE, BASE: BASE, LEGACY: LEGACY,
        sightOf: sightOf, feetOf: feetOf, sightLabel: sightLabel,
        /* ★撤退スイッチ ?darkvision=0 — 表示だけを #39 以前へ戻す。
         * ⚠ 判定はページごとに独立 (?chronicle=0 / ?slots=0 と同じ方式)。遷移はまたがない。
         * ⚠ index.html の視界の値には **一切効かない** (表示の撤退であって挙動の撤退ではない)。 */
        enabled: function () {
          try { return !/[?&]darkvision=0(&|$)/.test(global.location.search); }
          catch (e) { return true; }
        },
      };
    })(typeof window !== "undefined" ? window : this);

### 4-2. `index.html` — 表をモジュールから作る

`<script src="js/class-sight.js">` を **`js/hero-classes.js` の隣**へ足す(2026-08-31 実測で
`index.html:2872` 付近 / `tavern.html:2442` 付近 / `title.html:386` 付近)。
インラインの本体スクリプトより前であればよい。

`CLASS_SIGHT` の宣言を次の形へ差し替える。⛔ **識別子・shape・`RANGE_LEGACY` の適用順は変えない**:

    /* ★#39: 表の唯一の正は js/class-sight.js (DFSight)。ここは実行時の作業用コピー。
     * ⚠ 識別子 CLASS_SIGHT / CLASS_SIGHT_LEGACY / getSight は**残すこと** —— 既存ドライバ 3 本
     *   (driver_grid_p5 / driver_speech_boss / driver_wall_face) が裸の識別子で読んでいる。
     * ⚠ 複製を作る (Object.assign)。DFSight.BASE をそのまま束縛すると、RANGE_LEGACY の
     *   上書きがモジュール側の表を汚し、同じページの表示 (名簿・カード) まで旧値に化ける。
     * ⚠ term は描画に使わないが、落とすと「表示と実行時が同じ表を見ている」の突き合わせが
     *   できなくなるので shape ごと複製する。 */
    const CLASS_SIGHT = (() => {
      const src = (window.DFSight && window.DFSight.BASE) || null;
      if (!src) throw new Error("js/class-sight.js が読み込まれていない (#39)");
      const o = {};
      for (const k of Object.keys(src)) o[k] = Object.assign({}, src[k]);
      return o;
    })();
    const CLASS_SIGHT_LEGACY = (window.DFSight && window.DFSight.LEGACY) || {};

⚠ `throw` にする理由 = **silent fail-open を作らない**ため。既定表へ黙って落ちると
「全職 8 タイル」という**別のゲーム**が静かに始まる(#18 の教訓 = ゲートは silent fail-open を生む)。

`DEFAULT_SIGHT` / `getSight()` / `RANGE_LEGACY` の適用ループは **1 文字も変えない**。

### 4-3. `js/player-sheet.js` — 「特徴 & 特性」に視界の行

`d.traits` を作っている箇所(2026-08-31 実測 `js/player-sheet.js:409-418`)へ足す:

    /* ★#39: 視界。⚠ 唯一の正は window.DFSight。載っていないページ / ?darkvision=0 では
     *   sight を付けない = 行が出ない (「取れない区画は行ごと消す」の既存規律をそのまま使う)。 */
    if (global.DFSight && global.DFSight.enabled()) {
      d.traits.sight = global.DFSight.sightLabel(classKey, false);
    }

描画側(実測 `js/player-sheet.js:1031-1044` の `if (avail.dfSheetSecTraits)` の中)へ、
`持ち味` の**次**に 1 行:

    if (d.traits.sight) {
      var srow = rowEl(null, "視界", d.traits.sight, null);
      srow.setAttribute("data-stat", "sight"); tg.appendChild(srow);
    }

⛔ **区画 id (`dfSheetSecTraits`) を変えない。** `verify_player_sheet.js` の契約。
⛔ `BLANK_FIELD_IDS` / `BLANK_SECTION_IDS` に `sight` を足さない —— 視界は**実データがある**ので
空欄枠ではない(#36 の 3 値契約 `inDom === (avail || blank)` を破らないこと)。

---

## 5. STEP2 — 名乗りカード(`title.html`)とマッチングカード(`tavern.html`)

### 5-1. `title.html` の `classDetail`

`buildClassCard()`(実測 `title.html:822-839`)の `classNote` の**次**へ 1 行:

    // ★#39: 視界。⚠ 文字列は DFSight.sightLabel が唯一の正 (ここで組み立てない)。
    if (window.DFSight && DFSight.enabled()) {
      det.appendChild(el("div", "classSight", DFSight.sightLabel(c.classKey, false)));
    }

CSS は `.classRole` / `.classNote` と同系で 1 本だけ足す。
⭐ **`classDetail` は 1 タップ目で開く**ので、6 枚のカードが並ぶ第一印象を圧迫しない。

⛔ `HERO_CLASSES` に視界を足さない(§2-2)。⛔ `.classZone` / `.classRole` / `.classNote` の
クラス名と文言は変えない(`verify_title_screen.js` が走っている)。

### 5-2. マッチングカードの `.pmSight`

`buildPmColumn()`(実測 `tavern.html:7501-7526`)で `zoneEl` の**次**に作り、`fill()` で埋める:

    const sightEl = document.createElement("div"); sightEl.className = "pmSight";
    …
    el.appendChild(zoneEl);
    el.appendChild(sightEl);
    …
    // fill() の中、zoneEl.textContent = … の次
    // ★#39: 狭いカードなので short 形 (「視界 12」)。⛔ ここで文字列を組み立てない。
    sightEl.textContent = (window.DFSight && DFSight.enabled())
      ? DFSight.sightLabel(m.classKey, true) : "";

CSS は `.pmZone` の隣に 1 本(11px・`margin-top: 2px`・`.pmZone` と同系のやや明るめ):

    .pmSight { font-size: 11px; color: #a8996e; margin-top: 2px; letter-spacing: 1px; }

⛔ **`.pmZone` の規則も文言も変えない。** ⛔ `min-height: 296px` を変えない
(伸びないことは §8 (3c) で測る)。

---

## 6. STEP3 — 傭兵名簿 / STEP4 — 撤退・負のコントロール・文書

### 6-1. 傭兵名簿の `mrMeta`(`tavern.html`)

`renderRosterPanel()`(実測 `tavern.html:5316-5320`)の `mrMeta` の末尾へ:

    + ' / 同行 ' + chEsc(String(m.runs)) + ' 回'
    + ((window.DFSight && DFSight.enabled())
        ? ' / ' + chEsc(DFSight.sightLabel(m.classKey, true)) : '')
    + '</span></div>'

⛔ `DFRoster` の保存形は 1 バイトも変えない(視界は `classKey` から**毎回引く** = 名簿に焼かない)。
⭐ 焼くと、あとで視界を調整したとき名簿の中だけ古い数字が残る(§2-2 と同じ腐り方)。

### 6-2. 文書(STEP4 でまとめて)

- `CLAUDE.md` の「実装が必要な機能(未実装)」から **フォグオブウォー / DM ナレーション UI /
  フェーズ表示** の 3 行を落とす(§2-1 の実測を根拠に)
- `dev-meetings/2026-08-29_次の方向性.md` の候補④の節へ 1 段落追記:
  「**2026-08-31 の着手前実測で実装済みと判明 → 不採用**。会議の根拠『`fogOfWar` の grep がゼロ件』は
  単語が無かっただけで、実体は 3 状態フォグとして出荷済みだった(#39 §2-1)」
- §2-7 の「#39」予約 5 箇所を**中身で**書き直す
- `実装依頼書/README.md` に #39 の行を追加(文面は §11)

---

## 7. 撤退スイッチ

- **`?darkvision=0`** — **表示だけ**が #39 以前へ戻る。名乗りカードの視界行 / 名簿の視界 /
  マッチングカードの `.pmSight` / キャラシートの視界行が **1 つも出なくなる**。
- ⚠ **挙動の撤退ではない。** `index.html` の `CLASS_SIGHT` の値・フォグ・敵の可視判定には
  **一切効かない**(視界の挙動を旧仕様へ戻す口は既存の `?dndrange=0` で、別の口のまま)。
- ⚠ 判定位置 = `js/class-sight.js` の `DFSight.enabled()` **ただ 1 箇所**。
  4 つの画面はそれを呼ぶだけで、自前で `location.search` を読まない。
- ⚠ ページ遷移は**またがない**(`?chronicle=0` / `?slots=0` と同じページ単位で完結する方式)。
  各ページが独立に読めばよいので `sessionStorage` へ写す作法は要らない。

---

## 8. 受入条件 — `tools/verify_darkvision.js`(新規)

**測り方の方針**: このチケットの本丸は「**表示された数字が、実際にフォグを削っている数字と同じか**」。
だから中心の assert は **2 経路の突き合わせ**にする:

- 経路A = 画面に出ている文字列(`title.html` の `.classSight` / `tavern.html` の `.pmSight` と
  `.mrMeta` / シートの `[data-stat="sight"]`)から数字を読む
- 経路B = `index.html` を開いて**裸の識別子**で `getSight(classKey).tiles` を評価した実行時の値

⛔ **経路Aを `DFSight.sightLabel()` と突き合わせない。** それは同じ出所の写経で、
実装とドライバが同じ間違いを共有すると両方緑になる。

### ⚠ 計測機構(既存ドライバの写経では動かない点)

    // ⚠ classic script 直下の const は window に載らない。裸の識別子で読む。
    const tiles = await page.evaluate(() => {
      const o = {}; for (const k of Object.keys(CLASS_SIGHT)) o[k] = getSight(k).tiles; return o;
    });

- ⚠ **`title.html` の視界行は 1 タップ目で開く**(`.classCard.selected .classDetail`)。
  カードを押す前でも `textContent` は取れるが**表示されていない**。
  「出ている」は `getComputedStyle(...).display !== "none"` まで見る。
- ⚠ **傭兵名簿は空だと行が出ない**(`mrEmpty`)。装置で `DFRoster.enroll()` を先に 1 人以上入れる。
  ⭐ これを忘れると §3 が丸ごと空振りして永久緑になる。
- ⚠ **`openPrep()` を await しない**(マッチング演出はタップ待ちで止まる)。
  進めるのは `#pmDepart` だけ(`verify_party_match_setup.js` のヘッダに同じ注意がある)。
- ⭐ 配信バイトは起動時に凍結し、負のコントロールは**配信バイトへ実行時注入**する
  (⛔ `git show HEAD:` を基準に使わない —— コミットした瞬間 HEAD === 作業ツリーで全滅する。#37 の教訓)。

### §0 装置(先に母集団を確かめる)

- **(0a)** `index.html` で `Object.keys(CLASS_SIGHT).length === 6` かつ `getSight` が関数
  ⭐ これが無いと経路Bが空振りで全 assert が永久緑になる
- **(0b)** 経路Bの `tiles` に **相異なる値が 3 種類**ある(8 / 10 / 12)
  ⭐ 全職が同じ値だと「どの職を出しても正しく見える」= (1a) が何も測っていない
- **(0c)** `title.html` に `.classCard` が **6 枚**、うち 1 枚を押すと `classDetail` が `display !== none`
- **(0d)** マッチング画面に `#pmColumns .pmColumn` が **1 枚以上**、`data-state="filled"` に到達する
- **(0e)** 名簿に **1 人以上**入っており `.mrRow` が出ている(`mrEmpty` ではない)
- **(0f)** キャラシートの区画 `dfSheetSecTraits` が **inDom**(#36 の 3 値契約で `avail` 側)
- **(0g)** ★ **数値の表は 1 ファイルにしか無い。** 配信バイトを直接 grep して、
  `tiles: 8` / `tiles: 10` / `tiles: 12` と legacy の `[3, 120, 260]` 等が
  **`js/class-sight.js` にだけ現れ、`index.html` / `tavern.html` / `title.html` /
  `js/player-sheet.js` には 0 件**であること
  ⭐ これは 2 つを同時に測る: ①「写しを作っていない」②「STEP1 の移設が実際に起きた」
  ⚠ 数え方は #34 の罠に注意 —— **コメントに書いた注意書きも grep に数えられる**。
    パターンは値の記法まで含めて厳しく書く(散文に出てくる「8 タイル」は数えない)

### §1 数字が一致する(本丸)

- **(1a)** ★ **キャラシートの視界行の数字 = 経路Bの `getSight(classKey).tiles`** を **6 職すべて**で
  (主人公の職業を切り替えて 6 回測る)
- **(1b)** ★ **マッチングカードの `.pmSight` の数字 = 経路Bのその職の tiles**(出ているカード全部)
- **(1c)** ★ **名簿の `.mrMeta` の視界 = 経路Bのその職の tiles**(名簿の全行)
- **(1d)** ★ **名乗りカード `.classSight` の数字 = 経路Bの tiles**(6 枚すべて)
- **(1e)** ft 表記が `tiles × 5` と一致(8→40 / 10→50 / 12→60)。
  ⭐ 「40」を写経して比べない —— **画面から読んだ tiles を 5 倍したもの**と突き合わせる
- **(1f)** 語が職と対応している。`dwarf` の行に「暗視」、`elf` の行に「低光視力」、
  かつ **`elf` の行に「暗視」が出ていない**(⚠ SRD と食い違う語を当てていないこと)

### §2 表示が実在する(空文字で緑にしない)

- **(2a)** 4 箇所とも `textContent` が空文字でない・`display !== "none"`
  ⭐ #38 の教訓「キー集合だけの恒等 assert は変異を検出できない」→ **値の中身まで見る**
- **(2b)** 名乗りカードは**タップ前は非表示 / タップ後に表示**(既存の開閉規則を壊していない)

### §3 既存の器を壊していない(非退行)

- **(3a)** `.pmName` / `.pmClass` / `.pmEquipRow` / `.pmSkillsVal` の**テキストが着手前と 1 文字も違わない**
  ⚠ 基準は **着手前 hash を worktree に取り出して別 URL で同時配信**して採る
  (⛔ `HEAD` にすると着地後は永久緑。#34 の教訓)
- **(3b)** `.mrMeta` から**視界の部分を除いた文字列**が着手前と一致(「戦士 / Lv3 / 同行 5 回」)
- **(3c)** ★ カードが 1 行増えても **`#pmDepart` が viewport の中に残る**。
  desktop(4 列)と compact(2 列 / `≤900px`)の**両方**で測る
  ⚠⚠ #35 の実測では「`42vh` でなく compact の `30vh` が勝つ」= 引き出しを**開いた状態**でも測ること
- **(3d)** `dfSheetSecTraits` の既存 3 行(`data-stat` = `zone` / `role` / `note`)が**順序ごと不変**
- **(3e)** 5 ページ(index / tavern / title / town / world)で **`pageerror` 0 件**
- **(3f)** シートの開閉で `localStorage` のキーが **0 本増えない**(#36 (9b) と同じ形)

### §4 撤退 `?darkvision=0`

- **(4a)** `title.html?darkvision=0` → `.classSight` が **0 個**、`classDetail` の他 3 行は健在
- **(4b)** `tavern.html?darkvision=0` → `.pmSight` が **0 個**、`.mrMeta` に視界が**出ない**
- **(4c)** `index.html?darkvision=0` → シートの `[data-stat="sight"]` が **0 個**
- **(4d)** ★ **`?darkvision=0` でも `getSight()` の値は 1 つも変わらない**(表示の撤退であって
  挙動の撤退ではない)。⭐ ここを測らないと「撤退でゲームが変わる」事故を見逃す

### ⛔ 測らないこと

- **語の文面**(「松明の灯り」「暗視」「低光視力」)の**言い回し** — 目で見て決める余地を残す。
  測るのは **elf に「暗視」が出ていないこと**((1f))だけ
- **CSS の色・字送り・余白** — 実機の目で決める(§9)
- **視界の値そのもの**(8/10/12)と光半径 — `driver_grid_p5.js` の (3b)(3d)(3e)(3f) の担当

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `shadowsight` | ⭐**§2-2 の罠の再現**。`index.html` に `CLASS_SIGHT` のリテラル表を**違う値で**書き戻し、`DFSight.BASE` を無視させる | (1a)(1b)(1c)(1d) |
| `flatsight` | `DFSight.BASE` の全職を `tiles:8` に揃える | (0b) — 母集団ガードが効いている証拠 |
| `emptysight` | `DFSight.BASE` を `{}` にする | (0a) または STEP1 の `throw`(= `pageerror`)で (3e) |
| `wrongft` | `FT_PER_TILE` を 4 にする | (1e) |
| `elfdark` | `elf.term` を「暗視」にする | (1f) |
| `dropsheetrow` | シートの `data-stat="sight"` 行を出さない | (1a)(2a) |
| `dropcardsight` | `.pmSight` を作らない | (1b)(2a) |
| `droprostersight` | `mrMeta` へ視界を足さない | (1c) |
| `droptitlesight` | `.classSight` を作らない | (1d)(2a) |
| `legacydrop` | `DFSight.LEGACY` を `{}` にする | ⚠ 本ドライバでは赤くならない。**`driver_speech_boss` / `driver_wall_face` が赤くなる**ことを手で確認し、その結果を §12 に書く |
| `noretreat` | `DFSight.enabled()` を常に `true` にする | (4a)(4b)(4c) |
| `retreatkills` | `?darkvision=0` のとき `CLASS_SIGHT` も既定へ落とす | (4d) |

⚠⚠ #38 の教訓: **変異が空振りしたら「変異のほうを直す」**(実装が多重に守っているだけのことがある)。
逆に **「変異を入れたのに緑」は受入条件が何も検出していない証拠**(#37 の N3)—— 測り方を強くする。
⚠ 変異は **1 本ずつ**注入する(#34 の教訓: 全部同時だと互いを覆い隠す)。

### 既存 golden の非退行(実装後に必ず走らせる)

**2026-08-31 に本窓が実測した基準値**(⚠ 記録された期待値は腐る。この日に走らせて採った数字):

| ドライバ | 基準 | 実測日 | なぜ関係するか |
|---|---|---|---|
| `node tools/verify_player_sheet.js` | **70/70** PENDING 0 | 2026-08-31 ✅ | 「特徴 & 特性」に行を足す |
| `node tools/verify_party_match_setup.js` | **36/36** PENDING 0 | 2026-08-31 ✅ | カードに行を足す |
| `node tools/driver_party_view_reopen.js` | **35/35** PENDING 0 | 2026-08-31 ✅ | review モードの同じカード |
| `node tools/driver_grid_p5.js` | **103/103** FAIL 0 | 2026-08-31 ✅ | ⭐ **CLASS_SIGHT の 6 職台帳 (3b) と光半径 (3d)(3e)(3f) を持つ = 移設の安全網** |
| `node tools/driver_speech_boss.js` | **19/19** | 2026-08-31 ✅ | `warriorSight === 4`(legacy 値) |
| `node tools/driver_wall_face.js` | **54/54** | 2026-08-31 ✅ | `pinOuter === 330`(legacy 値) |
| `node tools/verify_title_screen.js` | **86/86** | 2026-08-31 ✅ | `classDetail` に行を足す |
| `node tools/verify_mercenary_roster.js` | **44/44** PENDING 0 | 2026-08-31 ✅ | `mrMeta` を触る + `js/mercenary-roster.js` のコメント |
| `node tools/verify_mercenary_roster.js --negative` | **10/10 空振り 0** | 2026-08-31 ✅ | ⚠ §2-7 のコメント変更が変異アンカーに当たらないか |
| `node tools/verify_ability_scores.js` | **24/24** PENDING 0 | 2026-08-31 ✅ | 5 ページ共通モジュールを 1 本増やすので読み込み順の巻き添えを見る |

⚠⚠⚠ **記録が腐っていた実例が今回も 1 件出た。** メモリには `verify_title_screen` = **83/83** と
記録されていたが、2026-08-31 に走らせたら **86/86** だった(3 本増えている)。
⭐ だから上の表は「過去の記録」ではなく**この窓が今日走らせて採った数字**である。
⭐ **10 本すべて緑・PENDING 0・`--negative` も空振り 0** = 着手前の母集団は健全。
これで「実装後に赤くなったら、それは本チケットが壊した」と言い切れる。

⚠ **走らせて違ったら、期待値を書き換える前に理由を突き止める。**
⭐⭐⭐ #38 の教訓: **golden の「記録された期待値」自体が腐る**(`probe_party_size` の 57/57 は嘘で、
着手前から 37/57 FAIL だった)。判定は **着手前 hash を worktree に取り出して NG セットを diff** し、
**数字ではなく「落ちている項目の集合」**で見ること。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` だとナレーション音声が鳴らない)。

1. **名乗り画面でドワーフのカードを開いたとき、「視界 12 マス (60 ft)・暗視」が
   『強そう』に読めるか。** 数字が並ぶだけで意味が伝わらないなら、語のほうを変える
2. **6 枚のカードを見比べたとき、視界の差(8 / 10 / 12)が選ぶ理由になるか。**
   ならないなら、それは「差が小さすぎる」のか「見せ方が弱い」のかを切り分ける
3. **マッチングカードの `視界 12` が、狭い 4 列の中でうるさくないか。**
   iPhone 縦(2 列)と PC(4 列)の両方
4. **傭兵名簿の 1 行が長くなりすぎていないか**(「戦士 / Lv3 / 同行 5 回 / 視界 8」)。
   折り返すなら順序を変えるか視界を落とす
5. **キャラクターシートの「特徴 & 特性」に 4 行目が入って、紙面が窮屈になっていないか**(#36 の 3 段組)
6. **実際に潜って、ドワーフがいる回といない回で「明るさが違う」と体感できるか。**
   ⭐ できないなら、このチケットは**数字を見せただけ**で終わっている。
   その場合の次の一手は「灯りの補給」(§1 の不採用案)か、視界差の拡大

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

STEP ごとに 1 行ずつ足す(先頭 = 最新・既定 4 件維持)。

    py tools/add_changelog.py "<b>キャラクターシートに視界が載った</b> — 自分がどれだけ先まで見通せるかが「特徴 & 特性」に出る。ドワーフは暗闇でも 60 フィート先まで見える。"

    py tools/add_changelog.py "<b>職業を選ぶときに暗視が分かる</b> — 名乗りの画面で、その職がダンジョンでどこまで見通せるかを開けるようになった。"

    py tools/add_changelog.py "<b>仲間の見える範囲が編成で分かる</b> — マッチング画面のカードと傭兵名簿に視界を表示。暗視を持つ相手を連れると、松明の届かない先まで見えるようになる。"

⛔ コミット件名のコピペは禁止(プレイヤー向けの日本語要約であること)。
⛔ `--no-verify` での迂回は禁止(そもそも Claude からは実行できない)。

---

## 11. やらないこと

- ⛔ **視界の値(8 / 10 / 12)・光半径・フォグの濃さを 1 つも変えない。** バランス調整は別チケット
- ⛔ **松明の燃料 / ランタン油 / 灯りの消耗**(`torchFuel` = grep 0 件で真に未実装)。
  候補③「冒険の賭け金」と設計が重なるので、そちらで統合する
- ⛔ **プレイヤーの視界だけを狭めるフル実装のフォグ**(会議で不採用。§1)
- ⛔ **仲間の生死 / 恒久ロスト / 負傷の持ち越し**(候補③「冒険の賭け金」)。
  ⚠ §2-7 のとおり `js/mercenary-roster.js` は**この仕事を「#39」と呼んでいた**。番号を消して中身で書き直す
- ⛔ **装備・魔法アイテムによる視界の増減**(現状そんな効果は 1 つも無い。作らない)
- ⛔ **`js/hero-classes.js` へ数値を足すこと**(§2-2 の明文の禁)
- ⛔ **`town.html` / `world.html` 固有の表示**(暗くない場所なので意味が無い)。
  ただし `js/player-sheet.js` 経由でシートを開けば 5 ページどこでも出る = それで足りる
- ✅ **`実装依頼書/README.md` の #39 行は 2026-08-31(承認時)に計画窓が追加済み。**
  ⛔ 実装窓は**行を足し直さない**。STEP4 でやるのは**ステータスと進行度の更新だけ**
  (`**承認済**(2026-08-31)` / `0%` → 完了ハッシュと `100%`)。
  ⚠ 別窓の並走が無いことを確認したうえで先に足してある(§冒頭の「触らないファイル」)。

---

## 12. 実装結果

✅ **完了 2026-08-31 / dev-loop 4 項目・停止 0 回。** 着手前 `HEAD = f80a03c`。

| 項目 | commit | 中身 |
|---|---|---|
| 1 | `ed704e8` | `js/class-sight.js` 新設 + `index.html` の表を移設 + シートの視界行 + 装置 §0 と (1a)(1e)(1f) |
| 2 | `df48c0f` | 名乗りカード `.classSight` + マッチングカード `.pmSight` + (1b)(1d)(2a)(2b) |
| 3 | `14ad37d` | 傭兵名簿 `mrMeta` の視界 + (1c) と §3 非退行 (3a)〜(3f) |
| 4 | `a97f60c` + 文書コミット | 撤退 §4 (4a)〜(4d) + 負のコントロール 12 本 + 既存 golden 10 本 + 文書 |

⛔ push は未実施(dev-loop の規約)。

### 12-1. 受入条件の実測

    node tools/verify_darkvision.js
      → 25/25 PASSED   FAILED 0   **PENDING** 0
    node tools/verify_darkvision.js --negative
      → 38/38 PASSED   FAILED 0   **PENDING** 0   [負のコントロール]   (空振り 0)

**負のコントロール 12 本の内訳**(⚠ **1 本ずつ**専用ポートへ注入。#34 の教訓「全部同時だと互いを覆い隠す」):

| 変異 | 赤くなった節 | 実測 |
|---|---|---|
| `shadowsight` | (1a)(1b)(1c)(1d) | 画面 8/10/12 ≠ 実行時 5/7/9(= §2-2 の「写しを作ると片方だけ古くなる」の再現) |
| `flatsight` | (0b) | 相異なる tiles が 1 種類 [8] — 母集団ガードが効いている証拠 |
| `emptysight` | (0a) **と** (3e) | keys=0 / index で pageerror 2 件(⭐ 依頼書の「(0a) **または** (3e)」は両方赤くなった) |
| `wrongft` | (1e) | 32ft ≠ 8×5=40 |
| `elfdark` | (1f) | elf に「低光視力」が無い + elf に「暗視」が出ている |
| `dropsheetrow` | (1a)(2a) | 6 職とも視界行が DOM に無い |
| `dropcardsight` | (1b)(2a) | 4 枚とも `.pmSight` が無い |
| `droprostersight` | (1c) | 3 行とも `.mrMeta` から視界が読めない |
| `droptitlesight` | (1d)(2a) | 6 枚とも `.classSight` が無い |
| `legacydrop` | ⚠ **本ドライバの対象外**(下記 12-2) | 変異後 `DFSight.BASE`=6 職 / `DFSight.LEGACY`=0 職 を node 内評価で確認 |
| `noretreat` | (4a)(4b)(4c) | 撤退でも `.classSight` 6 個 / `.pmSight` 4 枚 / `.mrMeta` 3 行 / シート 6 職に視界行 |
| `retreatkills` | (4d) | dwarf が 素 12 → 撤退 8、光半径も 450/990 → 300/660 へ動いた |

### 12-2. `legacydrop` の手動確認(⭐ 本ドライバに測定点が無い理由と、代わりに赤くなる場所)

`CLASS_SIGHT_LEGACY` は **`?dndrange=0` を付けたときだけ**実行時の表を上書きする。
`verify_darkvision` は素の URL しか開かないので、LEGACY を空にしても 1 本も赤くならない。
→ `js/class-sight.js` を一時的に `LEGACY = {}` へ書き換えて 2 本を手で走らせた
(⚠ `trap` で必ず復元し、`git diff --quiet js/class-sight.js` で検算済み):

| ドライバ | 基準 | legacydrop 注入後 | 赤くなったラベル |
|---|---|---|---|
| `driver_speech_boss` | 19/19 | **18/19** | `(0-ピン) ?dndrange=0 が効いている` — `warriorSight=8`(旧値 4 を期待) |
| `driver_wall_face` | 54/54 | **52/54** | `(0-ピン)` — `outer=660`(旧値 330 を期待) / `(3d)` 左右のリング — `westD2 α=30 / southD2 α=57`(石なら 104〜121。**光半径が旧値に戻らないとフォグ α の窓が較正外になる**) |

⭐ **legacy 表を一緒に移した判断(§2-4)は正しかった。** 片方だけ移していたら、この 2 本が
「原因不明の赤」で落ちていた(しかも `(3d)` は視界と無関係な α の assert なので原因が読めない)。

### 12-3. 既存 golden 10 本の非退行(実装後・2026-08-31)

⭐ **10 本すべて着手前の基準と一致。期待値の変更は 0 件。**

| コマンド | 基準 | 実測 |
|---|---|---|
| `node tools/verify_player_sheet.js` | 70/70 PENDING 0 | ✅ **70/70** FAILED 0 PENDING 0 |
| `node tools/verify_party_match_setup.js` | 36/36 PENDING 0 | ✅ **36/36** FAILED 0 PENDING 0 |
| `node tools/driver_party_view_reopen.js` | 35/35 PENDING 0 | ✅ **35/35** FAILED 0 PENDING 0 |
| `node tools/driver_grid_p5.js` | PASS 103 / FAIL 0 | ✅ **PASS 103 / FAIL 0** |
| `node tools/driver_speech_boss.js` | 19/19 | ✅ **19/19** |
| `node tools/driver_wall_face.js` | 54/54 | ✅ **54/54** |
| `node tools/verify_title_screen.js` | 86/86 | ✅ **86/86** |
| `node tools/verify_mercenary_roster.js` | 44/44 PENDING 0 | ✅ **44/44** FAILED 0 PENDING 0 |
| `node tools/verify_mercenary_roster.js --negative` | 10 本とも赤・空振り 0 | ✅ **10 本とも赤・空振り 0** |
| `node tools/verify_ability_scores.js` | 24/24 PENDING 0 | ✅ **24/24** FAILED 0 PENDING 0 |

⭐ §2-7 のコメント書き換え(`js/mercenary-roster.js:28`)は変異アンカーに当たらなかった
(`verify_mercenary_roster` の `(0z1)` が「ディスクの js は無改修」を毎回確かめており、44/44 と
`--negative` 空振り 0 の両方が通った)。

### 12-4. ⚠ 依頼書の主張が崩れた / 補正した点(実装窓の実測)

1. ⚠⚠⚠ **§2-3「`CLASS_SIGHT` を読むドライバは 3 本」は不完全 —— 4 本目がいた。**
   `tools/driver_grid_p5.js` が**表の行そのものをテキストで握る変異アンカー**を持っており、
   移設でヒット 0 件 → **赤ではなく `exit 3` でドライバごと死ぬ**(= 非退行の測定が黙って消える)。
   項目 1 で修理。⭐⭐⭐ 教訓 = **行を動かすときは識別子だけでなく「その行のテキスト」で
   `grep tools/*.js` する**。識別子 grep だけでは 1 本落ちる。
2. ⚠⚠⚠ **§4-3 の実装雛形に潜在クラッシュ。** `d.traits` は `HERO_CLASSES` の無いページで
   `null` になるので `d.traits &&` のガードが要る(雛形は `d.traits.sight = …` を無条件に書いていた)。
   ⭐ **依頼書の雛形コードも「主張」であって実測ではない。**
3. ⚠⚠ **(0g) の素朴なパターンは永久に赤くなる。** `/tiles:\s*(8|10|12)/` は `index.html` の
   **武器射程表 `RANGE`**(`medium: { tiles: 8, label: …, engagePx: 768 }` 等)に **5 件**当たる。
   効くのは**行の三つ組の形** `tiles→inner→outer`(と legacy の `classKey: [n,n,n]`)。
   実装後の実測 = `js/class-sight.js` 6/6 行 / 他 4 ファイル 0/0 行。
4. ⚠⚠⚠ **§8 (3c) の「compact = ≤900px」は誤り。** 実体は `tavern.html:2213` の
   `@media (max-width: 720px)`。900px で測ると 4 列のままで compact を測ったことにならない。
5. ⚠⚠⚠ **演出を開いてから `setViewport` で縮めると演出ごと畳まれる**
   (引き出し `vis=false` / 開いたカード 0 枚 / `#pmDepart` の命中先が `#tavernViewport`)
   → compact アームは **390x844 で最初から開く**(`verify_party_match_setup` の腕 D と同じ作法)。
6. ⭐⭐⭐ **(3a) は `openPrep` 経由では原理的に測れない。** `buildParty()` が `Math.random()` で
   職を選ぶので、基準と現行を 1 文字単位で比べると**視界と無関係な差分**で必ず赤くなる。
   → 既存の本番シーム `window.__pmTest.play(sc)` に `selection.partyMembers` を直書きして固定した。
   ⚠ これは「乱数を潰す」のであって「測定点を弱める」のではない。
7. ⭐ **(1b)(1c) の母集団の穴。** 出ているカード / 名簿の職が全部 `tiles=8` だと、
   「視界 8 を直書きした実装」でも緑になる。→ `dwarf`/`elf` を必ず混ぜ、**最小値を経路Bから
   導出する**母集団ガードを併置した(⛔ 8 を写経しない)。
8. ⭐ **項目 2・3 は §5-2 の雛形(撤退時 `textContent=""`)から意図的に外し、要素ごと作らない形にした。**
   §8 (4a)(4b) が「`.classSight` / `.pmSight` が **0 個**」を要求するため。名簿も同じで、
   撤退時は `' / 視界 n'` の節を**1 文字も足さない**(空文字も足さない)。
9. ⭐ **§8 の `emptysight` は「(0a) **または** (3e)」と書かれていたが、実測では両方赤くなった**
   (`CLASS_SIGHT` が空 → `getSight()` が `undefined` を返し index で pageerror 2 件)。
   ドライバ側は `mode:'any'` で受けているので、どちらか一方でも合格する。
10. ✅ **§2-1 の「`CLAUDE.md` の 3 行が腐っている」は実装窓でも再確認できた** —
    `renderLighting()` = `index.html:6896` / `exploredTiles`・`visibleTiles` = 4645-4646 /
    `#dmNarration` = 2990 + `Noto Serif JP` = 820 / `#phaseIcon`・`#phaseText` = 2976 +
    `PHASE_LABELS` の 3 状態表 = 13095。⭐ **タイピング速度まで実装済み**
    (`NARRATION_CHAR_MS = 70` = `index.html:13343`。「設計書0.15→実プレイ向けに短縮」と注記あり)。
    → 3 行を「未実装」欄から落とし、「既に実装済」欄へ**実体つきで**訂正を足した。

### 12-5. 撤退 `?darkvision=0` の実測

| 画面 | 素のアーム | `?darkvision=0` |
|---|---|---|
| 名乗り `title.html` | `.classSight` **6 個**(器)・押すと 6 枚とも可視 | **0 個**。`.classZone`/`.classRole`/`.classNote` は 6 枚とも健在 |
| マッチングカード | `.pmSight` **4 枚** | **0 枚** |
| 傭兵名簿 | 視界付き `.mrMeta` **3 行**(例「ドワーフ / Lv3 / 同行 0 回 / 視界 12」) | **0 行**(「ドワーフ / Lv3 / 同行 0 回」= 節ごと出さない) |
| キャラシート | `[data-stat="sight"]` **6/6 職** | **0/6 職**。`zone>role>note>skills` の並びは不変 |
| **挙動(経路B)** | `mage=8 warrior=8 cleric=8 rogue=8 elf=10 dwarf=12` | **まったく同じ**(inner/outer も 300/660・375/825・450/990 のまま) |

⭐ **(4d) が本チケットで一番効く assert。** 撤退で表示だけでなく値まで既定へ落とす実装は
「撤退でゲームが変わる」事故で、変異 `retreatkills` がそれを再現して赤くなることを確かめてある。

### 12-6. changelog

⚠ **項目 4 は鳴らない。** 触ったのは `tools/verify_darkvision.js` / `js/mercenary-roster.js`
(コメント 1 行) / `CLAUDE.md` / `dev-meetings/` / `実装依頼書/` で、フックの対象
(`index.html` / `tavern.html` / `audio.js`) を 1 バイトも触っていない
(`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC` を実読して確認)。
⛔ プレイヤーに見える変化が無いのに嘘の行をでっち上げない。
プレイヤー向けの 3 行は項目 1〜3 で既に入っている。

### 12-7. 残り

**§9 の実機体感 6 項目**(http 起動が必須)。機械では測れないので実機の目で決める:
①ドワーフのカードの「視界 12 マス (60 ft)・暗視」が『強そう』に読めるか
②6 枚を見比べて視界差が選ぶ理由になるか
③マッチングカードの `視界 12` が 4 列/2 列でうるさくないか
④名簿の 1 行が折り返さないか
⑤シートの「特徴 & 特性」4 行目で紙面が窮屈になっていないか
⑥ドワーフがいる回といない回で「明るさが違う」と体感できるか
(⭐ ⑥ができないなら本チケットは**数字を見せただけ**で終わっている。次の一手は
「灯りの補給」(§1 の不採用案・候補③と統合)か、視界差の拡大)
