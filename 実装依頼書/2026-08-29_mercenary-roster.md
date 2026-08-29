# #38 傭兵名簿 — 仲間が固有名詞になる

- **起草**: 2026-08-29(計画窓 `claude-36`) / **ステータス**: **承認済**(2026-08-29 ユーザー承認)
- **触るファイル**: `js/mercenary-roster.js`(新規) / `tavern.html` / `index.html`(最小) /
  `tools/verify_mercenary_roster.js`(新規)
- **着手**: ⏸ **保留 — 依頼書 #37(`2026-08-29_run-chronicle.md`)の着地待ち。**
  会議の全員一致点 =「②は①のレポートが無いと理不尽」。加えて §2-8 の実務上の理由
  (書き戻し先の `lastResult` 2 箇所を #37 が同時に触っている)。
  ⚠ **着手時に §2-0 の手順で行番号を全部測り直すこと。** 起草は `4f7710d` 基準。

### ⛔ 起草時点(2026-08-29)で触らないファイル

隣窓 `claude-d6` が **#37 を dev-loop で実装中**。`git status` 実測:

    M index.html          (+200 行 / #37 項目1 の作業中)
    M tavern.html         (+199 行 / 同上)
    ?? tools/verify_run_chronicle.js
    ?? 実装依頼書/2026-08-29_run-chronicle.md
    ?? dev-meetings/2026-08-29_次の方向性.md

本チケットは **#37 が着地した後に着手する**ので、着手時にはこの差分は消えている。
⚠ ただし **§2 の行番号は全部ズレる**(§2-0 参照)。`git add .` 禁止・ファイル単位 add・
`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

同行 NPC は **クエストごとに使い捨て**。マッチング画面で顔と名前が出て、一緒に戦って、
帰った瞬間に消える。次の依頼には二度と来ない。#35 でロードアウトまで設定させておいて、
その相手は次にはもういない。

名簿を作って、**同じ顔が次の依頼にも来る**ようにする。名前とレベルを覚えていて、
一緒に潜るほど強くなる。これで「仲間」が選択肢リストから固有名詞になる。

**ユーザー決定(2026-08-29)**:

| 論点 | 決定 | 不採用にした案(なぜそれではないか) |
|---|---|---|
| 仲間の死 | **今回は死なせない**。倒れても帰還すれば名簿に残る | ⛔ 恒久ロスト / ⛔ 重傷(数クエスト雇えない)。**シナリオ2 のクリア率が実測 0/3 のまま恒久ロストを入れると詰む**(会議でノエルが指摘)。死は **#39 候補③「冒険の賭け金」**で寺院・蘇生費用と一緒に入れる |
| 装備の権威 | **職業別のまま**(`allyEquip[classKey]` を 1 バイトも触らない) | ⛔ 個人別へ移す。#35 の引き出し UI を作り替え、`verify_party_match_setup` 36/36 の期待値を書き換えることになる。名簿が持つのは「誰が来るか」と「その Lv」だけに絞り、規模を **大 → 中**へ落とす |
| 名簿の入口 | **酒場の HUD に専用パネル**(`#rosterOverlay`) | ⛔ `#pmDrawer` へ載せる(compact 30vh の制約にぶつかる) / ⛔ `#prep` のタブ(§2-7 の (6c) に縛られる) |

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-0. ⚠⚠⚠ 行番号の基準と、必ずやり直すこと

- 本節の行番号は **`git show 4f7710d:<path>`**(= #35 着地時点の HEAD)で測った。
  作業ツリーは隣窓の #37 で汚れているため、**作業ツリーでは測っていない**。
- **#37 が着地すると `index.html` は +200 行前後、`tavern.html` は +200 行前後動く。**
  ⭐⭐⭐ **着手した窓は、実装に入る前に本節の行番号を全部測り直すこと。**
  #35 では 26 項目ズレ、#6 は 8/8 件、#11 は 11 件中 4 件ズレた。
- 件数・関数名・キー名の主張は行番号と違って腐りにくい。ズレたら**件数のほうを信じて grep し直す**。

再測定コマンド:

    git show <着手時のHEAD>:index.html  > /tmp/i.html
    git show <着手時のHEAD>:tavern.html > /tmp/t.html
    grep -n "regeneratePartyMembers\|assignCompanionLevels\|departToScenario" /tmp/t.html

### 2-1. いまの仲間が「毎回まっさらに作り直される」ことを 3 点で確認した

| # | 事実 | 出所(`4f7710d`) |
|---|---|---|
| a | `loadSelections()` は `partyMembers = []` で初期化し、**どこからも読み込まない** | `tavern.html:4428` |
| b | `saveSelections()` は `partyMembers` を **1 行も書かない**(書くのは 8 キー、`partyMembers` は無い) | `tavern.html:4526-4538` |
| c | `regeneratePartyMembers()` が `orderFormation(buildParty(...))` で**毎回まっさらに抽選** | `tavern.html:5148-5157` |

⚠ **`sessionStorage["dragonfighters.partyMembers"]` は帰還しても消えていない**
(`departToScenario` が書き、酒場は `removeItem` しない)。にもかかわらず酒場は
**それを読まない**。だから「帰還リロードで消滅」は結果として真だが、**理由は
sessionStorage が消えるからではなく、酒場が読まないから**。名簿はここに刺す。

### 2-2. ⚠⚠⚠ 会議の主張が 3 件崩れた

| 会議の主張(`dev-meetings/2026-08-29_次の方向性.md`) | 判定 | 実測 |
|---|---|---|
| レンツ「#35 のロードアウト設定が『その場限り』でなくなる」 | ❌ **崩れた** | **ロードアウトは既に永続している。** `allyEquip` は `localStorage`(`tavern.html:4531`)で、しかも **`classKey` で引いている**(`tavern.html:4794` `selection.allyEquip[charKey]`)。「その場限り」なのは**装備ではなく人**。→ だから装備は触らない(§1 の決定) |
| レンツ「永続キーが 20 本近い。ここに足すとデータ量と同期コストが跳ねる」 | ❌ **半分崩れた** | 実測 **`dragonfighters.*` は 47 キー**(20 本ではない)。うち **`localStorage` が 27 キー、`sessionStorage` が 13 キー**(両方に出るものあり)。⭐ そして **データ量は跳ねない**(§2-6 で実測) |
| レンツ「tavern.html と index.html の二重同期が確実に痛い」 | ❌ **崩れた** | `index.html:12133-12211` の `NPC_NAMES`/`buildParty`/`orderFormation` は **後方互換フォールバック専用**。`buildParty` の呼び口は `index.html:32282` の **1 箇所だけ**で、`sessionStorage.partyMembers` が無いとき(= 酒場を通らない直起動)にしか走らない。**名簿は index 側の複製に触れなくてよい**。index が読むのは rich な `partyMembers` (`index.html:32268`) |

⭐ この 3 件で、会議が「大」と見積もった規模は **中**へ落ちる。

### 2-3. ⭐⭐⭐ セーブスロットは何もしなくても面倒を見る

`js/save-slots.js:80-88` の `keysOf()` は **`dragonfighters.` の前置詞総なめ**。
ハードコード列挙ではない(コメントで「列挙式は原理的に取りこぼす」と明記されている)。

したがって新キー `dragonfighters.mercRoster` は:

- `snapshot()` で **自動的にスロットへ焼かれる**(`liveData()` → `keysOf`)
- `wipeLive()` で **新規ゲーム時に自動的に消える**(`newGame()` → `wipeLive()`)
- `switchTo()` で **スロットごとに別の名簿になる**

⛔ **前置詞を `dragonfighters.` 以外にすると、この 3 つが全部黙って壊れる。**
→ §9 の負のコントロール `badprefix` で機械検査する。

### 2-4. ⚠⚠⚠ 罠 A — `verify_recruit_size` の (D) は「顔ぶれが毎回変わる」を確率論で測っている

`tools/verify_recruit_size.js:565-573` に**そのまま書いてある**:

    goblin-mine は NPC 1 人で、名前は NPC_NAMES 16 個から一様(usedNames は buildParty ごとに新規)、
    職業は mid の 3 職から一様 → 1 回のかけ直しで **まったく同じ NPC** が出る確率は 1/48。
    10 回押して 11 サンプルすべてが同一になる確率は (1/48)^10 ≒ 6e-17。

**名簿を導入すると、この 1/48 という分母が縮む。**「同じ人が来る」のが名簿の目的だから。

⭐⭐⭐ **ただし実測では、既存 golden は名簿の影響を受けない。**
`tools/verify_recruit_size.js:194` の `puppeteer.launch({...})` に **`userDataDir` が無い**
(`probe_party_size.js` も同様に 0 件)。puppeteer は毎回**まっさらな一時プロファイル**を作る
→ `localStorage` は空 → **名簿は常に空** → §5 の規則により **従来と 1 バイトも変わらない挙動**になる。

⚠ これは 2 つのことを同時に意味する:

1. 既存 golden は**そのまま緑のはず**(期待値を書き換える必要が無い)。
2. **既存 golden は名簿の経路を 1 行もカバーしていない。** 新ドライバが自分で名簿を
   `localStorage` へ仕込まないと、何も測っていないのに全部緑になる。→ §9 §0 の母集団ガード必須。

⭐ 名簿が満杯(12 人)でも (D) は落ちない再計算:
mid ゾーンは 3 職から一様、12 人 ÷ 6 職 = 平均 2 人なので候補は 3 通り以上。
同一署名確率は最悪でも 1/6 前後で `(1/6)^10 ≒ 1.6e-8`。
閾値「11 サンプル中 2 種類以上」は維持される。

### 2-5. ⚠⚠ 罠 B — 名前は 16 個しかない

`tavern.html:3699-3700` / `index.html:12133-12134` の `NPC_NAMES` は **16 要素**(実測)。
`pickUniqueName()` は 50 回まで引き直して、**それでも重複したら重複したまま返す**
(`tavern.html:3736-3741`)。

⭐ **だから名簿の上限を 12 人にする。** 12 < 16 なので、名簿が満杯でも
名前が衝突しない。`NPC_NAMES` を拡張する必要は無い(= 二重定義を触らずに済む)。

`NPC_TRAITS` = 10、`NPC_LINES` = 10(実測)。こちらは重複してよい(性格が被るだけ)。

### 2-6. 容量の実測 — 「データ量が跳ねる」は成立しない

名簿 1 人ぶんの JSON を実際に組んで測った:

| 持ち方 | 1 人あたり | 12 人 | ライブ + 3 スロット(×4) |
|---|---|---|---|
| **文字列をそのまま持つ**(採用) | 145 UTF-16 単位 = **290 B** | 3,480 B | **13.9 KB** |
| 添字で持つ(不採用) | 58 単位 = 116 B | 1,392 B | 5.6 KB |

**基準の再現**: #5 の実測「3 スロット満杯 = 78,326 B = 5 MB の 1.49%」に対し、
最悪 +13.9 KB で **92.2 KB = 1.76%**。⭐ **添字にして 8 KB 節約する価値は無い**ので、
**文字列をそのまま持つ**。添字方式は `NPC_TRAITS` の並び順が変わると性格が入れ替わり、
「愛着」という目的そのものを壊す。

計測コマンド(再測定するとき):

    node -e "
    const full={id:1,classKey:'cleric',name:'ロルフ',trait:'慎重で石橋を叩いて渡る',
      line:'「……よろしく。」',variant:2,level:6,runs:0};
    const n=JSON.stringify(full).length; console.log(n, n*2, n*2*12, n*2*12*4);"

⚠ バイトの定義は `js/save-slots.js:296-299` に合わせる(**UTF-16 コードユニット × 2**)。
UTF-8 換算だと日本語で過小に出て「測ったのに溢れる」が起きる。

### 2-7. ⭐ 罠 C — `verify_tavern_map` の (6c) は 4 画面しか見ていない

`tools/verify_tavern_map.js:1456` の (6c) が DOM 構造を凍結している対象は
**`#dialog` / `#prep` / `#shopScreen` / `#plazaScreen` の 4 つだけ**。
比較基準は固定コミット `DOM_BASE = 638b479`(HEAD ではない)。

- ⭕ **酒場 HUD へ新しいオーバーレイを足すのは (6c) の対象外** → 何も宣言せずに済む。
- ⛔ **`#prep` に名簿タブ / 名簿ボタンを足すと (6c) が赤くなる**
  → `DOM_ADDED.prep` への宣言追加が必要になり、さらに (6c2) が
  「宣言が素通しでない」を検査してくる。**だから入口は `#prep` に置かない**(§1 の決定)。

### 2-8. ⚠⚠ 罠 D — `lastResult` の 2 箇所は #37 がいま触っている

帰還時の書き戻し(§6)は `sessionStorage["dragonfighters.lastResult"]` に相乗りする。
書き込み点は **2 箇所**:

| ファイル:行(`4f7710d`) | いつ |
|---|---|
| `index.html:35672` | `showResult(win)` — クリア / 敗北 |
| `index.html:35727` | 撤退ボタン — `retreated: true` |

⚠ **#37 依頼書がこの同じ 2 行へ `chronicle:` キーを足す**(DEV_QUEUE 項目 1 に明記)。
→ 着手を #37 の後にすること。追記自体は競合しない(キーが増えるだけ)が、
**行番号と周辺コードが変わる**。

読み側は `tavern.html:4542-4564` の `consumeResult()`。
⚠ **`removeItem` で 1 回きり消費**(`tavern.html:4545`)。名簿の反映は
**この 1 回の中で必ず終わらせる**こと(後で読み直せない)。

⚠ 帰還は `window.location.href = dfReturnPage()` の**フルページ遷移**
(`index.html:35683` / `35747`)。JS のメモリ上の `allies[]` はここで消える。

### 2-9. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

→ **鳴る**(`tavern.html` と `index.html` を触るため)。

⭐ **書けるプレイヤー向けの要約が実在する**:「一度共に戦った冒険者が名簿に残り、
次の依頼にも同じ顔が来る。潜るほどレベルが上がる」。嘘をでっち上げる必要は無い。

⭐ `js/mercenary-roster.js`(新規)は `GAME_LOGIC` に含まれないのでトリガーしない。

### 2-10. ⚠⚠⚠ 着手時の再実測(2026-08-30 / 実装窓 / HEAD `6185d4b`)

§2-0 の指示どおり、**着手した窓が本節の主張を本番コードで測り直した**。
基準は #35 着地時の `4f7710d` から **`6185d4b`(#37 着地後)** へ移った。

#### ✅ 成立した主張(そのまま使ってよい)

| 節 | 主張 | 実測 (`6185d4b`) |
|---|---|---|
| 2-1 a | `loadSelections()` が `partyMembers = []` で初期化し、どこからも読み込まない | ✅ `tavern.html:4595` |
| 2-1 c | `regeneratePartyMembers()` が毎回まっさらに抽選 | ✅ `tavern.html:5624-5636`(`selection.partyMembers = orderFormation(buildParty(heroKey, partySize))`) |
| 2-2 | index 側の `buildParty` はフォールバック専用・呼び口は 1 箇所 | ✅ `index.html:32710` の 1 箇所のみ(定義は `12178`) |
| 2-3 | `keysOf()` は `dragonfighters.` 前置詞の総なめ(列挙式ではない) | ✅ `js/save-slots.js:80-88` |
| 2-5 | `NPC_NAMES` = 16 要素 → 上限 12 なら名前が衝突しない | ✅ 16 要素(tavern / index とも同一内容) |
| 2-7 | `(6c)` の凍結対象は 4 画面・`DOM_BASE = 638b479` | ✅ `tools/verify_tavern_map.js:521-541`。**HUD へ足すのは対象外** |
| 2-8 | `lastResult` の書き込みは 2 箇所 | ✅ **`index.html:36109`(`showResult`)/ `index.html:36168`(撤退)**。⭐ **#37 の `chronicle:` キーが両方に既に載っている** |
| 2-9 | changelog フックが鳴る | ✅ `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` |
| 5 | `buildParty()` 内の `makeNpcMember()` 呼びは 2 箇所 | ✅ **`tavern.html:3996` と `4003`**。差し替え点はこの 2 行で正しい |
| 5 | `assignCompanionLevels()` の本体が §5 の引用どおり | ✅ `tavern.html:6472-6485`。`cap = Math.min(heroLevel, 10)` も引用と一致 |
| 9 | golden 10 本がすべて実在 | ✅ 10/10 |

#### ❌ 崩れた主張 5 件

**(1) 行番号は全滅**(§2-0 の予告どおり)。`tavern.html` は **+153 〜 +476**、
`index.html` は **+428 〜 +441** 動いた。例外は index の `NPC_NAMES`(`12133`)だけが一致。

| 対象 | 依頼書 (`4f7710d`) | 実測 (`6185d4b`) | 差 |
|---|---|---|---|
| `tavern.html` `NPC_NAMES` / `NPC_TRAITS` / `NPC_LINES` | 3699 | **3866** / 3868 / 3871 | +167 |
| `tavern.html` `pickUniqueName()` | 3736 | **3903** | +167 |
| `tavern.html` `makeNpcMember()` | — | **3909** | — |
| `tavern.html` `buildParty()` | 3814 | **3981** | +167 |
| `tavern.html` `makeNpcMember()` 呼び ×2 | 3829 / 3836 | **3996 / 4003** | +167 |
| `tavern.html` `orderFormation()` | — | **4008** | — |
| `tavern.html` `loadSelections()` | 4428 | **4581** | +153 |
| `tavern.html` `saveSelections()` | 4526 | **4692** | +166 |
| `tavern.html` `consumeResult()` | 4542 | **4745** | +203 |
| `tavern.html` `regeneratePartyMembers()` | 5148 | **5624** | +476 |
| `tavern.html` `assignCompanionLevels()` | 5996 | **6472** | +476 |
| `tavern.html` `departToScenario()` | 6043 | **6497** | +454 |
| `tavern.html` HUD の `<div>` 群 | 2604 | **2767 (`#townExit`) / 2768 (`#shopEntry`) / 2772 (`#chronicleShelf`)** | +163 |
| `index.html` `lastResult` 書き込み ① | 35672 | **36109** | +437 |
| `index.html` `lastResult` 書き込み ② | 35727 | **36168** | +441 |
| `index.html` `buildParty()` 呼び口 | 32282 | **32710** | +428 |
| `index.html` `NPC_NAMES` | 12133 | **12133** | **±0** |

**(2) §2-1 b の「`saveSelections()` が書くのは 8 キー」→ 実測 9 キー。**
`equipAccessory1` / `equipAccessory2` を数え落としている
(`equipWeaponIdx` / `equipShieldIdx` / `equipArmorIdx` / `partySkills` / `allyEquip` /
`partyComposition` / `actionPriority` / `equipAccessory1` / `equipAccessory2`)。
⭐ **主張の核心(`partyMembers` を 1 行も書かない)は成立**しているので、名簿を刺す場所は変わらない。

**(3) ⚠⚠⚠ §7 の HUD 入口が成立しない — #37 が置き場所を使い切った。**

依頼書は「`#townExit` / `#shopEntry` の並びへ `#rosterEntry`「📜 傭兵名簿」を 1 つ足す」と書くが、
**#37 が「唯一空いていた左上 `#townExit` の真下」を `#chronicleShelf` で埋めていた**
(`tavern.html:1607-1618` = `position:absolute; left:18px; top:74px; z-index:13`)。
`#chronicleShelf` のコメント(`tavern.html:1604-1606`)がそのまま書いている:

    左下 (#questBoard) / 右下 (#shopEntry + ⚙) / 右上 (#changelogBox) はすべて埋まっている。
    空いているのは **左上の #townExit の真下** だけ

さらに **`#chronicleShelf` は既に 📜 を名乗っている**(`📜 冒険の記録`)ので、
依頼書の「📜 傭兵名簿」は**同じ縦列に 📜 が 2 つ並ぶ**ことになる。

⭐ **ユーザー決定(2026-08-30)**:

| 論点 | 決定 | 不採用にした案(なぜそれではないか) |
|---|---|---|
| 置き場所 | **左上の縦列の 3 つ目**(`left:18px; top:130px`)。⭐ **`#chronicleShelf` が非表示(記録 0 件)のときは `top:74px` へ詰めて空白を作らない** | ⛔ 左上を flex column の器へ作り替える(`#townExit` / `#chronicleShelf` の `position` を剥がすので `verify_run_chronicle` 73 / `verify_tavern_map` 43 / `verify_town_map` 85 の座標系 assert を巻き込む) / ⛔ `#chronicleOverlay` 内のタブへ同居(記録 0 件だと記録棚ごと消えて名簿へ到達できない) |
| 絵文字 | **📖 傭兵名簿** | ⛔ 📜(`#chronicleShelf` と衝突) / ⛔ 🪶(小画面で何の絵か読めない) / ⛔ ⚔️(戦闘・装備アイコンと混同) |

⚠ **受入条件 §4 に 2 本足すこと**(§9 の (4a)〜(4d) に加えて):

- **(4e)** ⭐⭐⭐ **`#rosterEntry` / `#chronicleShelf` / `#townExit` の 3 つとも、
  中心の `elementFromPoint` が自分自身(またはその子孫)を返す。**
  ⚠ 重なりは矩形の比較では見えない(#12 / #37 が同じ罠を踏んでいる)。
  `verify_run_chronicle.js:1547-1599` の `hitOf()` がそのまま流用できる。
- **(4f)** ⭐ **記録棚が非表示のとき `#rosterEntry` の `top` が `74px`、
  表示中は `130px`。** かつ**どちらの状態でも (4e) が成立する**。
  ⛔ 「`top` が変わる」だけを測ると、詰めた結果 `#townExit` に重なっても緑になる。

**(4) §7 の z-index の説明が誤り。**
「200(`#partyMatchOverlay` 系)より下に置く」と書いてあるが、実測は:

| 要素 | z-index |
|---|---|
| `#plazaScreen`(闇市) | 150 |
| `#shopScreen`(武器防具屋) | 160 |
| `#chronicleOverlay`(#37) | **170** |
| `#prologueOverlay` | **200** |
| `#partyMatchOverlay` | **210** |

→ `#partyMatchOverlay` は **200 ではなく 210**。200 は `#prologueOverlay`。
⭐ **結論(180 を使う)と受入条件 (4b)(「`#partyMatchOverlay` より小さい」)はどちらも成立する**
(180 < 210)。⚠ ただし **180 は `#prologueOverlay`(200)よりも下**なので、
プロローグ中に名簿が前に出ることは無い(意図どおり)。

⚠⚠ `grep -c "z-index: 170"` は **2** を返すが、実体は 1 つだけ
(もう 1 つは `tavern.html:1481` の**コメント**)。#34 の罠「配信バイトを正規表現で数える
assert の近くではコメントも数えられる」がここでも起きる。**z-index は `getComputedStyle` で読む**。

**(5) §2-6 の容量が過大に見積もられている。**
依頼書の計測コマンドをそのまま実行した実測値:

| | 依頼書 | 実測 (`node -e` を §2-6 のコマンドのまま実行) |
|---|---|---|
| 1 人あたり | 145 UTF-16 単位 = 290 B | **113 単位 = 226 B** |
| 12 人 | 3,480 B | **2,712 B** |
| ライブ + 3 スロット(×4) | 13.9 KB | **10.8 KB** |

⭐ **結論(「データ量は跳ねない」/ 文字列をそのまま持つ)は変わらない**。むしろ余裕が増えた。
#5 の基準「3 スロット満杯 = 78,326 B = 5 MB の 1.49%」に対し、最悪 **+10.8 KB = 89.1 KB = 1.70%**。

#### 📌 §9「既存 golden の非退行」の基準

⚠ 依頼書 §9 の表の期待値は **2026-08-23〜08-29 の記録**。着手時に 10 本を素で走らせて
採り直した実測値を **§13** に記録する(実装前の基準)。実装後はその値と突き合わせる。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/mercenary-roster.js` | **新規**。名簿の実体(読み書き・抽選・成長)。`window.DFRoster`。`js/save-slots.js` と同じクラシックスクリプト作法 |
| `tavern.html` | `<script src>` 1 行 / `buildParty` の 2 箇所を `pickCompanion` へ / `assignCompanionLevels` に既知の顔の分岐 / `departToScenario` から名簿登録 / `consumeResult` から書き戻し / `#rosterOverlay` と HUD の入口 |
| `index.html` | **最小**。`lastResult` の 2 箇所へ `roster:` キーを 1 つ足すだけ。⛔ `index.html:12133-12211` の複製(`NPC_NAMES`/`buildParty`)は **1 バイトも触らない**(§2-2) |
| `tools/verify_mercenary_roster.js` | **新規**。`--negative` 内蔵 |

⛔ **`allyEquip` / `partySkills` / `actionPriority` / `#pmDrawer` / `#prep` は開かない。**
⛔ **`実装依頼書/README.md` の #38 行は、#37 が着地してから足す**(文面は §12 に用意)。

---

## 4. STEP1 — `js/mercenary-roster.js`(名簿の実体)

`js/save-slots.js` の作法をそのまま踏襲する(IIFE + 末尾で `window.DFRoster` に明示代入)。
⚠ **クラシックスクリプト直下の `let`/`const`/`function` は `window` に載らない。**

### データの形

    // localStorage["dragonfighters.mercRoster"]
    {
      "v": 1,
      "next": 7,                      // 次に配る id (単調増加。再利用しない)
      "list": [
        { "id": 3, "classKey": "cleric", "name": "ロルフ",
          "trait": "慎重で石橋を叩いて渡る", "line": "「……よろしく。」",
          "variant": 2, "level": 6, "runs": 4 }
      ]
    }

- `id` = 同姓同名を許さないための一意鍵。**名前ではなく id で同一人物を判定する**。
- `runs` = **生還した**同行回数(§6)。
- ⛔ 装備は持たない(§1 の決定。権威は `allyEquip[classKey]`)。
- ⛔ `alive` / `dead` は持たない(今回は死なせない)。**#39 が足す**。
- ⛔ 日時フィールドは持たない(スロット一覧の `savedAt` は `js/save-slots.js` が既に持つ)。

### 公開 API

| API | 何をするか |
|---|---|
| `enabled()` | `?roster=0` でなければ true。⚠ `try/catch` の既定は **true**(`save-slots.js:164-167` と同じ理由) |
| `load()` / `save(r)` | 壊れていたら空の名簿に落とす。⛔ 例外を投げない |
| `all()` | 在籍者の配列(表示用) |
| `CAP` | **12**(§2-5) |
| `enroll(member)` | 新顔を登録して `id` を返す。満杯なら `null` |
| `recordRun(ids, survived)` | 帰還後の成長(§6) |
| `release(id)` | 「見送る」= 名簿から外す。⛔ `next` は巻き戻さない |
| `_wipe()` | テスト用 |

⚠ **`DFRoster.init({names, traits, lines})` は作らない。** 新顔の生成は
呼び出し側(`tavern.html` の `makeNpcMember`)に任せ、モジュールは
**受け取った人物を保管して返すだけ**にする。`NPC_NAMES` の 3 本目の複製を作らないため。

---

## 5. STEP2 — 出発時に名簿から引く

`tavern.html:3814` の `buildParty()` は **職業を決めてから `makeNpcMember(pick, usedNames)` を呼ぶ**
(2 箇所: `:3829` と `:3836`)。⭐ **この 2 箇所を差し替えるだけで済む。**

    // 差し替え前: members.push(makeNpcMember(pick, usedNames));
    // 差し替え後:
    members.push(pickCompanion(pick, usedNames));

    function pickCompanion(classKey, usedNames) {
      if (!(window.DFRoster && DFRoster.enabled())) return makeNpcMember(classKey, usedNames);
      const vets = DFRoster.all().filter(m =>
        m.classKey === classKey && !usedNames.has(m.name));
      const full = DFRoster.all().length >= DFRoster.CAP;
      // 候補 = 名簿の在籍者 + (満杯でなければ)「新顔」1 通り。ここから一様抽選。
      const n = vets.length + (full ? 0 : 1);
      if (n === 0) return makeNpcMember(classKey, usedNames);   // 満杯 & その職が 0 人
      const i = Math.floor(Math.random() * n);
      if (i >= vets.length) return makeNpcMember(classKey, usedNames);   // 新顔
      const v = vets[i];
      usedNames.add(v.name);
      return { classKey, isHero: false, zone: PARTY_ZONES[classKey],
               name: v.name, trait: v.trait, line: v.line,
               variant: v.variant, level: v.level, mercId: v.id };
    }

⭐⭐⭐ **名簿が空なら必ず `makeNpcMember` に落ちる = 従来と 1 バイトも変わらない。**
これが §2-4 で既存 golden が緑のままである理由であり、**受入条件 (0a) が測るもの**。

⚠ `DFRoster.enabled()` は**呼ぶたびに読む**。モジュール直下の `const` にすると
`regeneratePartyMembers()` が上流から先に呼ばれて TDZ で落ちる
(`isRecruitOn()` / `isHeroLockOff()` が同じ理由でそう書かれている)。

### レベルの扱い — 変更点は 1 関数だけ

`tavern.html:5996-6009` の `assignCompanionLevels()` は **毎回の出発でレベルを振り直す**:

    members.forEach(m => {
      if (m.isHero) { m.level = heroLevel; return; }
      const r = lo + Math.floor(Math.random() * (hi - lo + 1));
      m.level = Math.max(1, Math.min(cap, r));      // cap = min(heroLevel, 10)
    });

**既知の顔は振り直さない**ように分岐を 1 つ足す:

    members.forEach(m => {
      if (m.isHero) { m.level = heroLevel; return; }
      if (m.mercId != null && typeof m.level === "number" && m.level > 0) {
        m.level = Math.max(1, Math.min(cap, m.level));   // 名簿の Lv を **clamp だけ**して使う
        return;
      }
      const r = lo + Math.floor(Math.random() * (hi - lo + 1));
      m.level = Math.max(1, Math.min(cap, r));
    });

⛔ **`cap = Math.min(heroLevel, 10)` は動かさない。** 既存不変条件「NPC Lv ≤ 主人公 Lv」を守る。
⭐ **clamp は表示時ではなくここ 1 箇所で行う。** 名簿には主人公 Lv を超えた値を保存してよい
(主人公が育てば追いつく)。

### 名簿への新規登録

`departToScenario()`(`tavern.html:6043` の `sessionStorage.setItem` の直前)で、
`mercId` を持たない NPC を `DFRoster.enroll()` し、**発行された id を `partyMembers` の
その要素へ書き戻してから** `sessionStorage` に焼く。

⚠ **`assignCompanionLevels()` の後に登録する。** 先に登録すると `level` が未確定のまま入る。
⚠ 満杯で `enroll()` が `null` を返したら **`mercId` を付けない**(その回だけの使い捨てになる)。
⛔ ここで例外を投げない。名簿の失敗が出発そのものを止めてはいけない。

---

## 6. STEP3 — 帰還時の書き戻し(成長)

### index.html 側(最小)

`lastResult` の **2 箇所**(§2-8)へキーを 1 つ足すだけ:

    // showResult (index.html:35672 付近) / 撤退 (35727 付近) の両方
    roster: ROSTER_ON
      ? { ids: formation.filter(m => m && m.mercId != null).map(m => m.mercId),
          survived: <この帰還が「生還」か> }
      : undefined,

⛔ **`allies[]` の `alive` を見に行かない。** 決定は「今回は死なせない」なので、
必要なのは **「主人公が生きて帰ったか」** だけ:

| 経路 | `survived` | 理由 |
|---|---|---|
| クリア(`showResult(true)`) | **true** | 帰ってきた |
| 撤退(`retreated: true`) | **true** | 生きて戻ることもまた勇気(既存の台詞) |
| 敗北(`showResult(false)`) | **false** | 帰還していない |

⚠ `ROSTER_ON = !/[?&]roster=0(&|$)/.test(location.search)` を index 側で独立に判定する
(`?chronicle=0` / `?slots=0` と同じ、ページ単位で完結する方式)。

### tavern.html 側(権威はこちら)

`consumeResult()`(`tavern.html:4542`)の中で `DFRoster.recordRun(r.roster.ids, r.roster.survived)`。

    survived === false → 何も変えない
    survived === true  → 各人 runs++ ; runs % 3 === 0 なら level = min(level + 1, 10)

⚠ **`removeItem` の後に読める形にする**(`resultRaw` をパース済みの `r` から取る)。
⚠ **主人公 Lv でここでは clamp しない**(§5 の 1 箇所に集約)。
⚠ **`r.roster` が無い場合(`?roster=0` で潜った / 旧セーブ)は何もしない**。

---

## 7. STEP4 — 酒場の名簿パネル

- 入口 = 酒場 HUD。`tavern.html:2604-2605` の `#townExit` / `#shopEntry` の並びへ
  `#rosterEntry`「📜 傭兵名簿」を 1 つ足す。
  ⭐ `body.tavernMapOn` でも HUD として残る系列(`tavern.html:2087` のコメントが明示)。
- `#rosterOverlay` を新設。**z-index = 180**。
  ⚠ 実測の使用済み値: … 150 / 160 / **170(#37 が使う)** / 200 / 210 / 9999。
  **170 と 200 の間が空いている。** 200(`#partyMatchOverlay` 系)より下に置く。
- 見た目は羊皮紙(`--parchment-bg` / `-ink` / `-gold` / `-border` / `-shadow` は
  `tavern.html:12-17` に既存。追加コストゼロ)。
- 1 行 = 名前 / 職 / Lv / 同行回数 / 性格 / 口癖 + 「見送る」ボタン。
- 空のときは「まだ誰とも組んでいない。依頼を受ければ、誰かが名乗り出る。」
- ⚠ **閉じるボタンは `click` と `touchend` の両方を配線する**
  (`click` 非発火端末で詰む既知の罠)。タップ域 44px 以上。
- ⚠ `body.ui-compact` で 12 行がはみ出すので **`overflow-y: auto`** を付ける。

---

## 8. 撤退スイッチ

- **`?roster=0`** — 名簿を一切読まず一切書かない。仲間は従来どおり毎回まっさらに抽選され、
  HUD の入口も出ない。**localStorage の `mercRoster` は消さない**(戻せば復活する)。
- 判定位置 = `DFRoster.enabled()`(酒場側)と `ROSTER_ON`(index 側)の **2 箇所で独立に**。
- **ページ遷移をまたがない。** 各ページが自分の `location.search` を読む
  (`sessionStorage` へ写す作法は不要 — index 側は `roster:` キーを載せないだけなので、
  酒場側が `r.roster` の不在で自然に何もしなくなる)。

---

## 9. 受入条件 — `tools/verify_mercenary_roster.js`(新規)

実 Chrome を `puppeteer-core` で直駆動し、http サーバで配信する。
流用元は **`tools/probe_party_size.js`**(`--negative` 内蔵型 + 配信スナップショットへの実行時注入)。

⭐ **観測するもの** = 名簿の実体(`localStorage`)と、本番関数
(`regeneratePartyMembers` / `departToScenario` / `assignCompanionLevels` / `consumeResult`)の出力。
⛔ **観測しないもの** = パネルの配色・文言・行の並び順(目で決める余地を残す)。

### ⚠ 計測機構 — 名簿を「本番の関数で」作る

⛔ `localStorage` へ手で JSON を書いて名簿を作らない(実装とドライバが同じ間違いを共有する)。
**出発処理を実際に走らせて名簿を育てる**:

    async function growRoster(page, rounds) {
      return page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) {
          prepScenario = scenarios.find(s => s.id === 'orc-fort');   // ★3 = NPC3
          regeneratePartyMembers();
          departToScenario();                       // ★本番。ここで名簿へ登録される
        }
        return JSON.parse(localStorage.getItem('dragonfighters.mercRoster') || 'null');
      }, rounds);
    }

⚠ `departToScenario()` は最後に `location.href` を書くので、**遷移を横取りする**
(`verify_quest_walk` / `verify_recruit_size` と同じ作法。`browser.newPage` を 1 回包む)。

### §0 装置(先に母集団を確かめる)

- **(0a)** ⭐⭐⭐ **まっさらなプロファイルでは名簿が空で、`pickCompanion` が
  `makeNpcMember` へ 100% 落ちる**。§2-4 の「既存 golden が緑のままである」根拠そのもの。
  → `pickCompanion` の分岐カウンタを `window.__rosterSeam` に載せて、
  **1 周目は `fromRoster === 0` / `fromNew === (NPC 人数)`** を実測する。
  ⛔ これが無いと「名簿から引けていないのに全部緑」になる。
- **(0b)** `growRoster(page, 8)` の後、**名簿が 1 人以上いる**。
  ⛔ 0 人のまま §1〜§4 を回すと全 assert が空振りする。
- **(0c)** 表を写経していない — `DFRoster.CAP` を**実体から読む**(12 を直書きしない)。

### §1 同じ顔が返ってくる

- **(1a)** ⭐ **2 経路で突き合わせる**。`growRoster` を 8 周回したあと、
  ① `localStorage.mercRoster.list` の `id` 集合 と
  ② 8 周ぶんの `partyMembers` に出た `mercId` の集合 —— **② が ① の部分集合**で、
  かつ **② に 2 回以上出た id が 1 つ以上ある**(= 再登板が実在する)。
- **(1b)** 再登板した人物の `name` / `trait` / `line` / `variant` が **1 文字も変わっていない**。
- **(1c)** `usedNames` により、**1 回の編成に同じ `mercId` が 2 回入らない**。

### §2 成長

- **(2a)** `recordRun(ids, true)` を 3 回 → `runs` が 3 / `level` が +1。
- **(2b)** `recordRun(ids, false)` を 5 回 → `runs` も `level` も **1 も動かない**。
- **(2c)** ⭐ **主人公 Lv による clamp が出発時に効く**。名簿の `level` を 9 に書き換え、
  主人公 Lv 3 で `departToScenario()` → `partyMembers` の `level` が **3**
  (名簿側の 9 は保存されたまま)。
- **(2d)** `level` の上限が 10。

### §3 名簿の器

- **(3a)** キーが `dragonfighters.mercRoster`(前置詞が `dragonfighters.`)。
- **(3b)** ⭐⭐⭐ `DFSlots.wipeLive()` の後に `mercRoster` が **null**(= 新規ゲームで消える)。
- **(3c)** `DFSlots.snapshot()` の `data` に `dragonfighters.mercRoster` が **含まれる**。
- **(3d)** 上限 `CAP` に達したら在籍数が増えない。かつ **その状態でも編成が完成する**
  (人数が足りない編成にならない)。
- **(3e)** `release(id)` で 1 人減り、**その id は二度と配られない**(`next` は減らない)。

### §4 パネル

- **(4a)** `#rosterEntry` が HUD にあり、押すと `#rosterOverlay` が可視になる。
- **(4b)** `#rosterOverlay` の `z-index` が **`#partyMatchOverlay` より小さい**
  (数値を直書きせず `getComputedStyle` で両方を読んで比較する)。
- **(4c)** 閉じるボタンに `click` と `touchend` が**両方**配線されている。
  ⚠ 「閉じた」の判定は **200ms 後ではなく `visibility` / `hidden` 属性**で測る
  (フェード中は `display:flex` のままなので永久緑になる既知の罠)。
- **(4d)** `body.ui-compact` で 12 行がスクロールできる(`scrollHeight > clientHeight` かつ
  `overflow-y` が `auto` / `scroll`)。

### §5 恒等(非退行)

- **(5a)** ⭐ **名簿が空のとき、`partyMembers` の形が従来と完全に一致する** —
  キー集合(`classKey` / `isHero` / `zone` / `name` / `trait` / `line` / `variant` / `level`)が
  **`mercId` を除いて同一**。
- **(5b)** `allyEquip` / `partySkills` / `actionPriority` の 3 キーが
  **出発の前後で 1 バイトも変わらない**。
- **(5c)** `lastResult` の既存キー(`scenarioId` / `scenarioTitle` / `cleared` /
  `defeated` / `reward` / `retreated`)が **1 つも欠けていない**。
  ⚠ #37 が足した `chronicle` キーも**消えていない**ことを併せて測る。

### §6 撤退

- **(6a)** `tavern.html?roster=0` → 8 周回しても `mercRoster` が **null のまま**、
  `#rosterEntry` が **出ない**、`partyMembers` に `mercId` が **0 件**。
- **(6b)** `index.html?roster=0` → `lastResult` に `roster` キーが **載らない**。
- **(6c)** ⭐ `?roster=0` を**外すと**、既に貯まっている名簿が**そのまま復活する**
  (撤退スイッチが名簿を消していない)。

### ⛔ 測らないこと

- パネルの配色・行の並び順・文言(目で決める)。
- `runs % 3` の「3」という数値(遊んで調整する余地を残す)。⭐ **測るのは
  「生還で増え、敗北で増えない」という向きだけ**。
- 名簿から引く確率(§5 の一様抽選)。⭐ **測るのは「引かれることがある」と
  「空なら必ず新顔」の 2 点だけ**。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `badprefix` | キーを `df.mercRoster` にする(§2-3 の罠) | (3a) (3b) (3c) |
| `noclamp` | `assignCompanionLevels` の既知の顔の分岐から clamp を外す | (2c) |
| `defeatgrows` | `survived === false` でも `runs++` する | (2b) |
| `nocap` | `CAP` を無視して名簿が無限に増える | (3d) |
| `alwaysroster` | 名簿が空でも `pickCompanion` が新顔を作らない(編成が壊れる) | (0a) (5a) |
| `reuseid` | `release()` が `next` を巻き戻して id を再利用する | (3e) |
| `switchleak` | `snapshot()` の `data` から `mercRoster` を除外する | (3c) |
| `noretreatswitch` | `?roster=0` を無視して名簿を書く | (6a) |
| `fadeclose` | 閉じるボタンを `opacity` だけで消す(`visibility` を変えない) | (4c) |

⭐ **`badprefix` が §2-3 の罠、`fadeclose` が既知の「永久緑」の罠の再現。**

⚠⚠ **変異は 1 本ずつ注入する。** 全部同時に入れると互いを覆い隠す
(#34 で `noturnwrap` 相当が別の変異の証拠を消した実例)。

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ 下の期待値は **2026-08-23〜08-29 時点の記録**。**#37 の着地で動いている可能性がある。**
⭐⭐⭐ **着手時にまず全部走らせて基準を採り直し、その値を本節へ書き戻してから実装に入る。**
(#35 では「触るドライバは 4 本」という依頼書の主張が実際には 5 本だった)

| ドライバ | 記録上の期待 | なぜ触る可能性があるか |
|---|---|---|
| `tools/verify_recruit_size.js` | 82/82 | `partyMembers` 参照 **13 箇所**。(D) が顔ぶれの多様性を確率で測る(§2-4) |
| `tools/probe_party_size.js` | 57/57(`--negative` 22/22) | `partyMembers` 参照 8 箇所 |
| `tools/verify_party_match_setup.js` | 36/36(`--negative` M1〜M7) | #35 のロードアウト。⭐ 装備を触らない決定によりこれは無傷のはず |
| `tools/verify_quest_walk.js` | 25/25 | 出発の導線 |
| `tools/driver_party_view_reopen.js` | 35/35 | 🎴 編成を見る |
| `tools/verify_tavern_map.js` | 43/43 | (6c) の DOM 凍結(§2-7)。⭐ HUD へ足すなら無傷のはず |
| `tools/verify_save_slots.js` | 30/30 | 新キーがスロットに乗る(§2-3) |
| `tools/verify_run_chronicle.js` | **#37 の実績値** | `lastResult` を共有(§2-8) |
| `tools/driver_action_priority.js` | 92/92 | `partyMembers` 参照 4 箇所 |
| `tools/verify_player_sheet.js` | 70/70 | 参照 1 箇所 |

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレ音声が鳴らない)。

1. 新規ゲーム → 依頼を 3 回こなす → **同じ顔が 2 回目に来るか**。来なさすぎ / 来すぎないか。
2. 名簿パネルを iPhone 実機で開く。12 行がスクロールできるか。閉じられるか。
3. 「見送る」を押したときに、取り返しがつかないことが伝わるか(確認を挟むべきか)。
4. 12 人で頭打ちになったとき、**新顔が出なくなったことが不満にならないか**。
5. `runs % 3` で Lv+1 のテンポ。速すぎ / 遅すぎないか。
6. 敗北しても名簿が減らないことが「ぬるい」と感じないか
   (⭐ 感じるなら **#39 候補③** の設計材料になる。ここでは直さない)。
7. 名簿パネルの入口が HUD に増えたことで、`body.tavernMapOn` の地図表示が窮屈にならないか。

---

## 11. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>傭兵名簿 — 仲間が固有名詞になった</b> — 一度共に戦った冒険者が酒場の名簿に残り、次の依頼にも同じ顔が名乗り出る。何度も潜った仲間はレベルが上がる。"

---

## 12. やらないこと

- ⛔ **仲間の死・恒久ロスト・負傷の持ち越し**(§1 の決定)。**#39 候補③「冒険の賭け金」**。
- ⛔ **個人別の装備**(§1 の決定)。`allyEquip[classKey]` のまま。
- ⛔ **`#pmDrawer` / `#prep` への追加**(§2-7 の (6c) を避けるため)。
- ⛔ **`NPC_NAMES` / `NPC_TRAITS` / `NPC_LINES` の拡張**(§2-5。上限 12 < 16 なので不要)。
- ⛔ **`index.html:12133-12211` の複製の一本化**(§2-2 でフォールバック専用と確認済。
  純粋なリファクタは changelog に書けるプレイヤー向けの変化が無い = 単独では commit で詰む)。
- ⛔ **名簿の並べ替え・検索・お気に入り**(12 人なら要らない)。
- ⛔ **仲間の会話イベント / 好感度**(別の話)。
- ⛔ **`実装依頼書/README.md` への行追加**(#37 着地後)。用意してある行:

    | 38 | [2026-08-29_mercenary-roster.md](2026-08-29_mercenary-roster.md) | **承認済** | 0% | 傭兵名簿。使い捨て NPC を永続化し Lv 成長。⭐ 装備は職業別のまま据置で規模を「大→中」へ / ⚠ 着手は #37 着地後 / ⚠⚠ `verify_recruit_size` の (D) は顔ぶれの多様性を確率で測っている(名簿が空なら従来と同一挙動) |

---

## 13. 実装結果

### 項目1 — STEP1 (`js/mercenary-roster.js`) + STEP2 (出発時に名簿から引く) + 新ドライバの骨格

| 項目 | 実測 |
|---|---|
| 実装 | `js/mercenary-roster.js`(新規・LF)/ `tavern.html`(`<script src>` 1 行 + `pickCompanion()` 新設 + `buildParty()` の 2 箇所差し替え + `assignCompanionLevels()` に既知の顔の分岐 + `departToScenario()` から名簿登録)/ `tools/verify_mercenary_roster.js`(新規) |
| 新ドライバ | `node tools/verify_mercenary_roster.js` → **23/23 PASSED / 0 FAILED / 0 PENDING** |
| 負のコントロール | `--negative` → `badprefix` を注入して **(3a)(3b)(3c) が赤・巻き添え 0**(20/23)。残り 8 本は項目4 |
| 既存 golden | `verify_recruit_size` **82/82 PASS**(基準どおり)/ `probe_party_size` は **着手前から赤**(下記) |
| 撤退 | `?roster=0`(酒場側 = `DFRoster.enabled()`)。⭐ index 側の `ROSTER_ON` は項目2 |

#### ⚠ 実装で確定したこと(次項目が前提にしてよい)

- **実装後の行番号**(`tavern.html`): `<script src="js/mercenary-roster.js">` = **2328** /
  `makeNpcMember()` = **3910** / `pickCompanion()` = **3935** / `pickCompanion()` の呼び 2 箇所 =
  **4031 / 4038** / `buildParty()` = **4016** / `orderFormation()` = **4043** /
  `loadSelections()` = **4616** / `saveSelections()` = **4727** / `consumeResult()` = **4780** /
  `regeneratePartyMembers()` = **5659** / `assignCompanionLevels()` = **6507** /
  `departToScenario()` = **6540**(名簿登録は **6565-6575**)。
  `index.html` は **1 バイトも触っていない**ので §2-10 の値のまま(`lastResult` = 36109 / 36168)。
- ⭐⭐⭐ **計測シームは本番ファイルに置かなかった。** `pickCompanion()` の枝カウンタ
  (`window.__rosterSeam`)は **配信スナップショットへの実行時注入**で作っている
  (`probe_party_size.js` と同じ作法)。(0z1) が「配信に 15 箇所・ディスクに 0 件」を両側で検査する。
- ⭐⭐⭐ **(2c) は 2 本の腕で挟まないと何も測れない。** orc-fort は推奨 Lv6 = tier2 で
  帯 **[5,8]**。名簿の Lv を **9(帯の外)** に固定し、
  **主人公 Lv10 → 出発 Lv が 9 のまま**(= 振り直していない)/
  **主人公 Lv3 → 出発 Lv が 3**(= clamp が効いている)の 2 本で挟んで初めて意味を持つ。
  片方(clamp 側)だけだと、新顔の乱択も clamp されて同じ 3 になるので **区別できない**。
- ⚠⚠ **(2c) の母集団は「Lv を書き換えた当人」だけに絞ること。** 絞らずに測って
  **1 回目の実行で偽の赤が出た**(`名簿 Lv=[9,…,9,3]`)。原因は欠陥ではなく、
  2 度目の走行中に **新しく登録された顔がその時の帯 / cap で決まった Lv を持つ**という正常動作。
  名簿が満杯でなければ必ず起きる。
- ⚠⚠ **(3b) を「`dragonfighters.mercRoster` が null」で測ってはいけない。**
  前置詞違い(`badprefix`)のとき、その名前のキーはそもそも存在しないので **null で緑になる**。
  `DFRoster.all()` と「`mercRoster` を含む localStorage キーが 0 本」の **両方**で測ると赤くなる。
- ⭐ 実測値: `CAP=12` / `NPC_NAMES=16` / 14 周で名簿は **12 人で頭打ち**・編成人数は
  全周 **4 人**(満杯でも編成は完成する)/ 再登板 **10 人**(最多 6 周)/
  `allyEquip`・`partySkills`・`actionPriority` は 14 周とも **完全同一**。
- ⚠⚠⚠ **§9 の表の「`probe_party_size` = 57/57」は腐っている。着手前から赤。**
  素で走らせたら赤かったので、**着手前 HEAD `6185d4b` の worktree を作って同じ引数で測り直した**:

  | 腕 | 結果 | NG ラベル |
  |---|---|---|
  | 基準 `6185d4b`(私の変更を 1 バイトも含まない worktree) | **28/41 FAIL** | (1e)(5a)(5b)(5c)(5z3)(5z4)(6c)(6d)(7a)(7b)(7c)(7d)(7e) |
  | 作業ツリー(#38 項目1 込み) | **28/41 FAIL** | **完全に同じ 13 本**(`diff` が空) |

  ⭐⭐⭐ **NG セットが 1 文字も違わない = 非退行**。⛔ 私の変更が壊したのではない。
  ⭐ 大元は **(1e)「`departToScenario()` が index.html へ遷移しようとした」が赤**で、
  そこから index へ着地する腕 (§5〜§7 と §8〜§11) が全部倒れている。
  `probe_party_size` は index への遷移を横取りして数えるが、**#23 で入った地方全景の迂回
  (`viaWorld` → `world.html`)** があるため `?party=N` の腕は index へ行かない。
  ⚠⚠ **項目4 は golden 10 本を一括で走らせる。`probe_party_size` の赤を見て
  「#38 が壊した」と読まないこと。** 直すなら #38 とは別チケット。
  ⭐ 再現手順(そのまま使える):

      git worktree add --detach <TMP>/df_base_6185d4b 6185d4b
      node <TMP>/df_base_6185d4b/tools/probe_party_size.js --port 9371 --skip-play
      node tools/probe_party_size.js --port 9381 --skip-play     # 作業ツリー側
      # → 「== 結果: 28/41 FAIL ==」と NG 13 本が両側で一致する

  ⚠ `--skip-play` を付けると §8〜§11 を飛ばすので **5 分**で決着する(付けないと 25〜30 分)。
- ⚠⚠⚠ **項目2 への申し送り — `recordRun()` を配線した瞬間に `memberLevelOf()` が主人公 Lv を超え得る。**
  `tavern.html:4086` の `memberLevelOf(classKey)` は `selection.partyMembers` の `m.level` を
  そのまま返し、`skillLimitForClass()` → 準備画面の**仲間のスキルスロット数**を決めている。
  ⭐ **項目1 の範囲では問題は起きない** —— 名簿の Lv は登録時に `≤ その時の主人公 Lv` で焼かれ、
  主人公 Lv は下がらないので、常に `≤ 現在の主人公 Lv`。
  ⚠ しかし **項目2 が `recordRun()`(生還で Lv+1・主人公 Lv では clamp しない)を配線すると**、
  名簿の Lv が現在の主人公 Lv を超え得る。すると `pickCompanion()` が名簿の Lv を載せた時点から
  `assignCompanionLevels()` が clamp するまでの間、準備画面が **出発後の実 Lv より多い
  スキルスロット**を出す。⛔ `partySkills` は触らない決定なので、項目2 は
  「これを直すのか / 仕様として許すのか」を **明示的に決めてから**着地すること。
- ⛔ 未着手(スコープ外): §6 帰還時の書き戻し(項目2)/ §7 名簿パネル `#rosterEntry` `#rosterOverlay`
  (項目3)/ `--negative` の残り 8 本と golden 10 本の一括(項目4)。
  受入条件 `(4x)` `(5c)` `(6x)` は **ドライバにまだ書いていない**(PENDING を残さないため)。
