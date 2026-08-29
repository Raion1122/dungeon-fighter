# #35 マッチング画面で、全員分のスキルと傾向をその場で設定する

- **起草**: 2026-08-28(計画窓) / **ステータス**: **承認済**(2026-08-28 ユーザー承認 ―「承認します」)
- **着手**: ⏸ **#34 の着地待ち**。⚠ 実装前に §2 の行番号をもう一度測り直すこと。
- **触るファイル**: `tavern.html` / `tools/verify_party_match_setup.js`(新規) /
  **既存 golden 4 本の突破手順**(`tools/driver_action_priority.js` /
  `tools/verify_recruit_size.js` / `tools/verify_quest_walk.js` / `tools/driver_depart_menu_clean.js`)
- ⛔ **触らないファイル**: `index.html` / `js/skill-check.js` / `js/abilities.js` /
  `title.html` / `town.html` / `world.html`
- ✅ **#28 は 2026-08-28 に着地済**(`aea44a8` / `a7f194e`)。
- ⛔ **着手は #34(戦士の仲間)が着地してから。**
  #34 が先でないと、**引き出しに戦士の傾向欄が出るのに効かない**(#34 §1)。

---

## 1. 目的

現在、スキルと傾向を設定する場所は「出発の準備」画面(`#prep`)の
**職業タブ**(`#charTabs`)しかない。タブは 6 職すべて出ていて仲間の分も設定できるのだが、
★ が付くのは主人公だけで、**どのタブが「今回同行する仲間」なのか画面に出ていない**。
その結果、ユーザーは「仲間の傾向は選べない」と認識していた(2026-08-28 のやり取りで判明)。

一方、その直前に流れる**マッチング演出**(`playPartyMatchCinematic`)には
**今回の顔ぶれが名前付きで 4 枚並んでいる**(セシリア(盗賊)・クヌート(僧侶)・ブラン(魔法使い))。
ここが「全員分を一目で見る」場所として既に存在している。

**ユーザー決定(2026-08-28)**:

- **設置場所** = **マッチング演出の画面**。カードを押すと**その場で引き出しが開き**、
  スキルと傾向を両方設定できる(AskUserQuestion の **案 C**)。
- ⭐ 不採用 **案 A**: カードに【設定】ボタンだけ置いて `#prep` のタブへ飛ばす案。
  「その場でやりたい」という要望に対して遠回り。
- ⭐ 不採用 **案 B**: 傾向のプルダウンだけカードに直接置き、スキルは `#prep` へ飛ばす案。
- ⚠⚠⚠ **#19 はこの画面を明示的に不採用にしていた**(`2026-08-23_action-priority.md` §2-1)。
  理由は「閉じる経路が `onTap` ただ 1 つ = **画面のどこを叩いても出発する**」。
  **本チケットはその判断を覆す**ので、§4 で出発経路そのものを作り替える。
- ⛔ **メンバー単位の保存はしない**(ユーザー判断「② は今回やらない」)。
  設定は従来どおり**職業に紐づく**。§2-8 の文言で誤解させない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ **行番号はすべて HEAD = `a7f194e`(#28 着地直後)で測り直した値。**
⭐ 起草中に #28 が着地して実際にズレた(例: `PARTY_SLOTS` 3525→3526)。
⚠ **#34 が着地すると再びズレる。着手時に必ず測り直す。**

### 2-1. 演出の構造 — 閉じる経路は本当に 1 つだけ

`tavern.html:6330-6420`(`playPartyMatchCinematic`)。定数は `tavern.html:6211` / `6215`:

| 名前 | 値 | 何 |
|---|---|---|
| `PM_REVEAL_INTERVAL` | 720ms | 各カラム確定の間隔 |
| `PM_TAP_GATE` | 500ms | 全確定〜タップ受付開始までの猶予 |

```js
      // 開示中のタップ = 残りを即確定 (従来どおり)。全確定後のタップ = 閉じる。
      // ⚠ 確定していない間は絶対に閉じない ("確定を見ずに飛ばす" を作らないため)。
      const onTap = () => {
        if (closed) return;
        if (phase === "reveal") { skipRest(); return; }
        if (gateOpen) close();
      };
      // iOS Safari 対策で touchend も拾う (click 非発火の端末があると、自動クローズが無い今は詰む)。
      const bindTaps = () => { overlay.addEventListener("click", onTap); overlay.addEventListener("touchend", onTap); };
```

⚠⚠⚠ **リスナは `overlay`(= `#partyMatchOverlay` 全面)に張られている。**
カード内に `<select>` や `<div class="skillItem">` を置くと、
そのクリックが**バブリングして `onTap` に届き、そのまま出発する**。
CSS も `#partyMatchOverlay { cursor: pointer; }` で「どこでも押せる」ことを表明している。

DOM: `#partyMatchOverlay > #pmInner > (#pmHeader, #pmColumns, #pmHint)`(`tavern.html:2184-2195`。`#pmColumns` = 2192)。
`#pmHint` の文言は `"タップでスキップ"` → 全確定後 `"タップして出発"` に差し替わる。

> **【訂正 2026-08-29 / 着手時 HEAD `1d3dbd2`】⚠⚠⚠ この節が知らない 2 つ目の使われ方 = `review` モード**
>
> 起草は 2026-08-28(HEAD `a7f194e`)。その翌日に **`9b6f3b8`「準備画面の 🎴 編成を見る で開き直せる」**が
> 着地し、**同じオーバーレイに 2 つ目の使われ方**が生えていた。
>
> - `playPartyMatchCinematic(scenario, { review: true })` — 準備画面の 🎴 から `openPartyMatchReview()` が呼ぶ
> - review では全員 `cols[i].fill(false)` で**即確定** = **開示フェーズを 1 コマも通らない**(`if (review) finishReveal();`)
> - ヒント文が **`"タップして準備へ戻る"`**(通常は `"タップでスキップ"` → `"タップして出発"`)
>
> ⇒ **§4-2 の「全確定後のタップ = 出発」は review では成立しない。**
> **決定(ユーザー提示済み)**: `#pmDepart` は **id 共通・ラベルだけ出し分け**
> (通常「出発する」/ review「準備へ戻る」)、`close()` は共通。**引き出しは両モードで開ける**
> (準備画面から開き直した先で設定できるのが本チケットの目的そのもの)。
> ⚠ review は `phase` が即 `"done"` になるので、**開示中の挙動 `(1d)` / `(1e)` は通常モードでしか測れない**。
>
> **【訂正】§2 の行番号は 26 項目すべてズレていた**(#34 `692fb3e` / `9b6f3b8` / #36 の 4 コミットによる)。
> 実測 `1d3dbd2` の正しい値: `playPartyMatchCinematic` 6330→**6356** / `PM_REVEAL_INTERVAL`・`PM_TAP_GATE`
> 6211・6215→**6230・6234** / `onTap` 6415→**6436** / `buildPmColumn` 6274→**6293** /
> `AP_SITUATIONS` 3506→**3516** / `TRAVEL_CASTABLE_IDS` 3518→**3528** / `apEquippedIdsFor` 5566→**5585** /
> `renderSkillItem` 5514→**5533** / `renderSpellSlotItem` 5386→**5405** / `renderCharLoadout` 5658→**5677** /
> `renderActionPriority` 5586→**5605** / `isCasterClassTV`・`isAutoSlotClassTV` 4021→**4028・4031** /
> `skillLimitForClass` 3741→**3751** / `PARTY_SLOTS` 3526→**3536** /
> `buildParty`・`openPrep`・`regeneratePartyMembers` 3682・4612・4997→**3673・4605・5007** /
> HTML `#pmColumns` 2192→**2194** / CSS `#pmColumns`・`.pmColumn` **1735・1741**(不変)/
> `@media (max-width:720px)` 1825→**1824** / **再描画点 3 箇所** 5540-41・5429-30・5440-41 →
> **5559-60・5448-49・5459-60**。
> ⭐ 変わらなかったもの = `renderCharLoadout()` の呼び口 **18 箇所** / `#partyMatchOverlay` の **z-index 210**。

### 2-2. ⚠⚠⚠ 罠 A — **4 本の golden ドライバが「オーバーレイを叩けば進む」に依存している**

`grep -rn "partyMatchOverlay" tools/` = **3 ファイル 6 行** + `driver_action_priority` の
画面中央クリック:

| ドライバ | 行 | 突破のしかた | 基準(2026-08-28 実測) |
|---|---|---|---|
| `tools/verify_recruit_size.js` | 329 / 709 | `q('partyMatchOverlay').click()` | **82/82** |
| `tools/verify_quest_walk.js` | 632 | `q('partyMatchOverlay').click()` | **25/25** PENDING 0 |
| `tools/driver_depart_menu_clean.js` | 140 | `q('partyMatchOverlay').click()` | **41/41** |
| `tools/driver_action_priority.js` | 367 | `page.mouse.click(幅/2, 高/2)` を **45 回まで**繰り返す | **75/75** PENDING 0 |

⚠⚠⚠ **背景タップでの出発をやめると、この 4 本が全部止まる。**
特に `driver_action_priority` は**画面中央**を叩く —— 4 列のカードが並ぶ画面の中央は
**カードの上か、その隙間**。案 C ではそこを叩くと**引き出しが開くだけ**で先へ進まず、
45 回叩いたあと `throw new Error('準備画面 (#prep) が可視にならなかった')` で死ぬ。

⭐⭐⭐ **したがって「出発の口」に安定した id を与え、4 本をそこへ付け替えるのが本チケットの必須作業。**
⛔ **`?pmsetup=0` を付けて逃げるのは禁止**(本番の姿を 1 本も測らなくなる)。
撤退スイッチは `(X*)` の検査にだけ使う。

**再測定コマンド**:

    grep -rn "partyMatchOverlay" tools/
    node tools/verify_recruit_size.js          # → 82/82
    node tools/verify_quest_walk.js            # → 25/25
    node tools/driver_depart_menu_clean.js     # → 41/41
    node tools/driver_action_priority.js       # → 75/75 PENDING 0

> **【訂正 2026-08-29】⚠⚠⚠ 「golden 4 本」は誤りで、実際は 5 本。基準値も 1 本古い。**
>
> `grep -rn "partyMatchOverlay" tools/` を着手時 HEAD `1d3dbd2` で自分で打ち直したら、
> **この表に無い 5 本目**が出た。⭐ **grep を自分で打たないと落ちる**(この表を写経すると
> 1 本を付け替え忘れて `driver_party_view_reopen` だけが赤く残る)。
>
> | ファイル:行 | 現在 | **基準(これが正)** |
> |---|---|---|
> | `tools/verify_recruit_size.js:329` / `:709` | `q('partyMatchOverlay').click()` | **82/82** |
> | `tools/verify_quest_walk.js:632` | 同上 | **25/25 PENDING 0** |
> | `tools/driver_depart_menu_clean.js:140` | 同上 | **41/41** |
> | `tools/driver_action_priority.js:367` | `page.mouse.click(幅/2, 高/2)` ×45 | ⚠ **92/92 PENDING 0**(表の 75/75 は #34 `692fb3e` で失効) |
> | ⭐ **`tools/driver_party_view_reopen.js:240`**(同 `:185` / `:286`) | `q('partyMatchOverlay').click()` | **35/35**(⚠ 起草時の表に無い **5 本目**) |
>
> ⚠ 5 本目は **review モードのドライバ**(上の §2-1 の訂正を参照)なので、
> `#pmDepart` のラベルが「準備へ戻る」に変わっても押せる形にすること。
> ⭐ 同じページを読む `verify_tavern_map`(**43/43**)と `verify_player_sheet`(**70/70**、#36 で 42→70)も
> 非退行の対象に足して、非退行は **合計 7 本**で見る。

### 2-3. ⚠⚠ 罠 B — `touchend` も張られている(iOS の `<select>`)

`tavern.html:6415`:

```js
      const bindTaps = () => { overlay.addEventListener("click", onTap); overlay.addEventListener("touchend", onTap); };
```

⚠ iOS Safari で `<select>` を叩くとネイティブのピッカーが開き、**指を離した瞬間 `touchend` が
オーバーレイまで上がる**。`click` だけ止めても**指を離した時点で出発する**。
→ **`click` と `touchend` の両方**で伝播を止めること。負のコントロール **M2**。

⭐ コメントが理由まで書いている ——「click 非発火の端末があると、自動クローズが無い今は詰む」。
**`touchend` を外して済ませるのは禁止**(iOS で出発できなくなる)。

### 2-4. ⚠⚠ 罠 C — 同じ職業の仲間が 2 人来ることがある

`tavern.html:3682`(`buildParty` の (2)):

```js
    // (2) 残り枠は全職業からランダム (重複可)
    while (members.length < partySize) {
      const pick = ALL_CLASS_KEYS[Math.floor(Math.random() * ALL_CLASS_KEYS.length)];
      members.push(makeNpcMember(pick, usedNames));
    }
```

⚠⚠ **盗賊が 2 人来ると、カードが 2 枚出るのに編集先は同じ `selection.partySkills["rogue"]` /
`selection.actionPriority["rogue"]` になる。** 片方をいじるともう片方も変わる。

⭐ これは**バグではなく設計どおり**(設定は職業に紐づく = §1 のユーザー決定)。
ただし**画面がそれを隠すと事故になる**ので:

- 引き出しの見出しは「**セシリア(盗賊)**」ではなく「**盗賊 — セシリア**」のように**職業を主**にする。
- 同職が 2 人以上いるときは注記を出す:
  「⚠ この設定は**盗賊 2 人に共通**で適用されます」
- 片方を編集したら**もう片方のカードの表示も更新する**。

→ 負のコントロール **M4**。

### 2-5. ⚠⚠⚠ 罠 D — スキル項目の更新は `#prep` に直結している

`renderSkillItem`(`tavern.html:5514`)と `renderSpellSlotItem`(`tavern.html:5386`)の
クリック処理は、どちらも**末尾がこれ**:

```js
      saveSelections();
      renderCharTabs();
      renderCharLoadout();
```

⚠⚠ `renderCharLoadout()` は `activeCharTab` の**準備画面**を描き直す関数
(`tavern.html:5658`)。マッチング演出の最中は `#prep` が `display:none` なので、
**引き出しの中でこれを呼んでも引き出しは 1 ピクセルも更新されない**。
スキルを押しても選択の色が変わらない = 「押しても何も起きない」に見える。

⭐ `renderCharLoadout()` の呼び口は `tavern.html` 全体で **18 箇所**
(`grep -c "renderCharLoadout()" tavern.html` = 18)。全部を書き換えるのではなく、
**再描画点を 1 つに畳む**(memory の教訓「書き込み点を 1 つに畳んでから機能を足す」):

```js
  // #35: 「スキル枠を変えた後に描き直す先」の唯一の正。既定は準備画面。
  //   引き出しを開いている間だけ差し替える。⛔ 他の 15 箇所の呼び口は触らない。
  let pmLoadoutRepaint = null;   // null = 従来どおり
  function repaintAfterSkillChange() {
    if (pmLoadoutRepaint) { pmLoadoutRepaint(); return; }
    renderCharTabs();
    renderCharLoadout();
  }
```

→ **`renderSkillItem` の 1 箇所 + `renderSpellSlotItem` の 2 箇所**、計 **3 箇所だけ**を
`repaintAfterSkillChange()` へ差し替える(`tavern.html:5540-5541` / `5429-5430` / `5440-5441`)。
負のコントロール **M3**。

### 2-6. ⚠ 罠 E — `.skillItem` はクリーム色。暗いオーバーレイの上では白い塊になる

```css
    .skillItem { background: rgba(255,245,210,0.55); ... }
    .skillItem.selected { background: linear-gradient(180deg, #dcc2f0, #b090d8); ... }
```

一方 `#partyMatchOverlay` は
`radial-gradient(... rgba(34,26,12,0.90) ... rgba(4,6,10,0.95) ...)` の**暗い金/黒**。
⚠ そのまま置くと**羊皮紙色の明るい矩形が暗幕の上に浮く**。
→ 引き出しの中だけ `#pmDrawer .skillItem { ... }` で暗い基調へ上書きする。
⛔ **`.skillItem` 本体の CSS は触らない**(準備画面の見た目が変わる)。

### 2-7. レイアウト実測 — 引き出しは「カードの中」に入らない

| 対象 | 実測 |
|---|---|
| `#pmColumns`(1735) | `display:grid; grid-template-columns: repeat(4, 1fr); gap:14px` |
| `.pmColumn`(1741) | `min-height: 296px; padding: 16px 12px 15px` |
| `@media (max-width: 720px)`(1825-1828) | `#pmColumns` が **2 列**へ / `.pmColumn { min-height:0; padding:12px 10px }` |
| `@media (max-width: 380px)`(1829-1832) | `gap: 9px` / 肖像が 88px → **72px** |
| `#partyMatchOverlay` | `position:fixed; inset:0; padding:20px; align-items:center` |

⚠⚠ **4 列のカード 1 枚の実効幅は、デスクトップでも 1/4 弱。**
スキルのリストは 1 行が `[カテゴリ]名前 [射程] [MP n]` + フレーバー文で、
`.pmColumn` の幅には**原理的に入らない**。

⭐⭐⭐ **したがって引き出しは「カードの中」ではなく「カード列の**下**に開く 1 枚のパネル」にする。**
押されたカードにはハイライト(`.pmColumn.pmOpen`)を付け、**どのカードの引き出しか**を示す。
案 C のプレビューもこの形だった。

### 2-8. 出発のたびに顔ぶれは作り直される(= 設定は職業に紐づく)

`openPrep`(`tavern.html:4612-4616`)が毎回:

```js
    activeCharTab = selection.partyComposition[0] || "warrior";
    regeneratePartyMembers();
```

`regeneratePartyMembers`(`tavern.html:4997`)は `buildParty()` を呼び直すので、
**名前も職業構成も毎回変わる**。⚠ 引き出しに「セシリアの設定」と書くと、
次の出発でセシリアが居なくなったとき**設定が消えたように見える**。
→ §2-4 のとおり**職業を主**にした見出しにする。

⭐ 再抽選は `renderCharTabs()` より**前**に走るので、`selection.partyMembers` は
カードを描く時点で必ず埋まっている(引き出しから参照して安全)。

### 2-9. 再利用できる既存関数(**新しく書かない**)

| 関数 | 行(HEAD) | 引き出しでの用途 |
|---|---|---|
| `AP_SITUATIONS` | 3506 | 全般/雑魚/ボス/道中 の 4 枠(**唯一の正**) |
| `TRAVEL_CASTABLE_IDS` | 3518 | 「道中」行を出す職の絞り込み |
| `apEquippedIdsFor(slot, classKey)` | 5566 | 傾向の候補を「枠に入れている技」だけにする |
| `renderSkillItem(sk, equippedSet, full, classKey)` | 5514 | スキル項目(非呪文職) |
| `renderSpellSlotItem(sk, classKey, totalUsed, totalMax, lv)` | 5386 | 呪文スロット ±UI |
| `isCasterClassTV` / `isAutoSlotClassTV` | 4021 | 呪文職の分岐 |
| `skillLimitForClass(classKey)` | 3741 | スキル枠上限 |
| `PARTY_SLOTS` | 3526 | `skillPool` と職業名 |

⛔ **`renderActionPriority()`(5586)そのものは呼ばない** —— `#apRows`(準備画面の DOM)へ
直接書くため。**同じ組み立てを引き出し用の関数へ書き出し、値の読み書きは
`selection.actionPriority` を共有する**。
⚠ ただし **`apEquippedIdsFor` は必ず流用する**(候補の絞り込みロジックを二重化しない。
二重化すると #19 の `(6b)` と食い違う)。

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` = `("index.html", "tavern.html", "audio.js")`
→ **鳴る**(`tavern.html`)。**書けるプレイヤー向けの要約は実在する**:

> 仲間が集まる画面で、そのまま各人のスキルと戦い方を決められるようになった。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | 出発の口を明示ボタン `#pmDepart` へ / 引き出し `#pmDrawer` / カードを押せるように / 再描画点の一本化(3 箇所) / 引き出し用 CSS / 撤退スイッチ |
| `tools/verify_party_match_setup.js` | **新規**(受入装置) |
| `tools/driver_action_priority.js` | 演出突破を `#pmDepart` クリックへ(§2-2) |
| `tools/verify_recruit_size.js` | 同上(2 箇所) |
| `tools/verify_quest_walk.js` | 同上 |
| `tools/driver_depart_menu_clean.js` | 同上 |

⛔ **`index.html` は 1 バイトも触らない。**
⛔ **`.skillItem` / `.pmColumn` の既存 CSS 規則は書き換えない**(上書き規則を足すだけ)。

### 並走ルール

- `git add .` **禁止**。ファイル単位 add → `git diff --cached tavern.html` を読んでから commit。
- 着手前に `git log --oneline -1` で #28 / #34 の着地を確認する。

---

## 4. STEP1 — 出発の口を作り替える(⚠ ここが最大の破壊。先にやる)

### 4-1. `#pmDepart` を置く

```html
      <div id="pmColumns"></div>
      <div id="pmDrawer" hidden></div>            <!-- STEP2 -->
      <button id="pmDepart" type="button" hidden>出発する</button>
      <div id="pmHint">タップでスキップ</div>
```

⚠ `#pmDepart` は **`phase === "done"` かつ `gateOpen` になってから** `hidden` を外す
(「確定を見ずに飛ばす」を作らないという既存の不変条件を守る。`tavern.html:6369` のコメント)。

### 4-2. `onTap` の役割を分ける

```js
      const onTap = (ev) => {
        if (closed) return;
        // 開示中のタップ = 残りを即確定 (従来どおり。ここは変えない)。
        if (phase === "reveal") { skipRest(); return; }
        // ⚠⚠⚠ #35: 全確定後の「背景タップ = 出発」は廃止する。
        //   カード / 引き出しを押した指がそのまま出発を叩くため (依頼書 §2-1)。
        //   出発は #pmDepart だけ。
      };
      const onDepart = () => { if (!closed && phase === "done" && gateOpen) close(); };
```

⛔ **`phase === "reveal"` の「タップでスキップ」は残す。** ここを消すと演出が飛ばせなくなる。
⚠ ただし**開示中はカードを押しても引き出しが開かない**(スキップが優先)。
これは意図どおり —— 引き出しは全確定後だけ。`(1e)` で機械検査する。

### 4-3. 伝播を止める(§2-3)

カード / 引き出し / 出発ボタンの上では `click` と **`touchend` の両方**で
`ev.stopPropagation()` する。

```js
    // ⚠⚠ touchend も止める。iOS の <select> は指を離した瞬間に touchend が
    //   オーバーレイまで上がり、click を止めただけでは出発してしまう (§2-3)。
    const swallow = (el) => {
      el.addEventListener("click", (ev) => ev.stopPropagation());
      el.addEventListener("touchend", (ev) => ev.stopPropagation());
    };
```

### 4-4. ⚠⚠⚠ 既存 golden 4 本を `#pmDepart` へ付け替える

| ファイル | 現在 | 直す先 |
|---|---|---|
| `tools/verify_recruit_size.js:329` | `q('partyMatchOverlay').click()` | `q('pmDepart') ? q('pmDepart').click() : q('partyMatchOverlay').click()` |
| `tools/verify_recruit_size.js:709` | 同上 | 同上 |
| `tools/verify_quest_walk.js:632` | 同上 | 同上 |
| `tools/driver_depart_menu_clean.js:140` | 同上 | 同上 |
| `tools/driver_action_priority.js:367` | `page.mouse.click(幅/2, 高/2)` | **`#pmDepart` を探して押す**。無ければ従来の中央クリック |

⭐ **フォールバックを残す形にする**(`#pmDepart` が無い = `?pmsetup=0` や旧版でも動く)。
⚠ `driver_action_priority` は「開示中はスキップのために背景を叩く」必要が残るので、
**「`#pmDepart` があれば押す / 無ければ背景を叩く」の 2 段**にする。

⛔ **期待値(82/82・25/25・41/41・75/75)を 1 つも弱めない。** 突破手順だけを直す。

> **【訂正 2026-08-29】この表は 4 行ではなく 5 行 / 基準は 75/75 でなく 92/92 / ラベルは 2 種類**
>
> - ⭐ **5 行目 = `tools/driver_party_view_reopen.js:240`(35/35)を足すこと。**
>   §2-2 の訂正表が唯一の正。⛔ この §4-4 の表を写経すると 1 本落ちる。
> - ⚠ `driver_action_priority` の **75/75 は #34 `692fb3e` で失効**。正は **92/92 PENDING 0**。
> - ⚠⚠⚠ **`#pmDepart` のラベルは 2 種類ある**(§2-1 の訂正 = `review` モード)。
>   通常「出発する」/ review「準備へ戻る」。**id は共通**なので、5 本とも
>   `q('pmDepart') ? q('pmDepart').click() : q('partyMatchOverlay').click()` の形で通る
>   (⛔ **ラベル文字列でボタンを探す突破手順を書かないこと** — review のドライバで落ちる)。
>
> **【実測 2026-08-29 / 項目1 `194d109`】⭐⭐⭐ §8 の「突破手順を直す**前**に一度走らせる」が効いた。**
> `tavern.html` だけ直した時点で 5 本とも実際に赤くなった —— **80/82 · 21/25 · 34/41 ·
> 63+FATAL「#prep が可視にならなかった」· 2/6**。これで「背景タップ = 出発が本当に死んだ」ことが
> 証明され、付け替え後に 5 本とも基準へ復帰した(**期待値の変更は 0 件**)。
>
> **【逸脱 1 件】§4-3 の `swallow` はカードへ無条件に適用しなかった。**
> 無条件に止めると**開示中にカードを叩いても `skipRest()` が走らず、画面の大半が死に領域**になる。
> → `pmBindCardTaps()` = **`pmPhaseRef() === "done"` の時だけ**伝播を止める形にした
> (§4-2 / §5-1 の「開示中は何もしない = 背景の `skipRest` へ通す」と一致する)。
> ⚠ `phase` は演出の Promise 内のローカル変数なので、**値は写さず読み口だけ**を
> `let pmPhaseRef = () => "idle";` としてモジュール直下に置き、演出内で `pmPhaseRef = () => phase;` /
> `close()` で戻す。**唯一の正は今も `phase` 1 つ。**

---

## 5. STEP2 — 引き出し `#pmDrawer`

### 5-1. カードを押せるようにする

`buildPmColumn(m, i)`(`tavern.html:6274`)の `el` に:

```js
    el.dataset.classKey = m.classKey;
    el.dataset.memberIdx = String(i);
    // 全確定後だけ押せる。⚠ 開示中は skipRest が優先 (§4-2)。
    el.addEventListener("click", (ev) => {
      if (!PM_SETUP_ON) return;              // 撤退スイッチ (§7)
      if (pmPhaseRef() !== "done") return;   // 開示中は何もしない (背景の skipRest へ通す)
      ev.stopPropagation();
      pmToggleDrawer(i);
    });
```

⚠ `phase` は `playPartyMatchCinematic` の Promise 内のローカル変数なので、
**`buildPmColumn` からは見えない**。参照用の小さなシーム(`pmPhaseRef`)を
モジュールスコープに 1 つ置くこと。⛔ `window` へ晒すのは検証シームだけにする。

### 5-2. 引き出しの中身

`#pmDrawer` は `#pmColumns` の**下**に開く(§2-7)。中身は 3 段:

```
┌────────────────────────────────────────────┐
│ 盗賊 — セシリア                    [ 閉じる ] │  ← ⚠ 職業を主に (§2-4)
│ ⚠ この設定は 盗賊 2 人に共通で適用されます      │  ← 同職が 2 人以上のときだけ
├────────────────────────────────────────────┤
│ スキル (2/3)                                │
│  [影渡り ●] [毒塗り短剣 ●] [罠探し ○] …      │  ← renderSkillItem を流用
├────────────────────────────────────────────┤
│ 傾向   ⓘ 指示は傾向です。射程やスロットが       │
│         足りなければ別の手を打ちます            │
│  全般 [おまかせ  ▼]   雑魚 [毒塗り短剣 ▼]      │
│  ボス [影渡り    ▼]   道中 [—      ]         │  ← 候補 0 件の枠は行ごと隠す
└────────────────────────────────────────────┘
```

- **スキル段** — `isCasterClassTV(classKey)` で分岐し、
  呪文職は `renderSpellSlotItem`、それ以外は `renderSkillItem` を**そのまま呼ぶ**(§2-9)。
  ⛔ 新しいスキル項目のコンポーネントを書かない。
- **傾向段** — `AP_SITUATIONS` を回し、候補は **`apEquippedIdsFor(slot, classKey)`**
  (⛔ 自前で絞り直さない)。`travel` の行だけ `TRAVEL_CASTABLE_IDS` で更に絞る。
  値は `selection.actionPriority[classKey][sit.key]`。`change` で `saveSelections()`。
  ⛔ **`change` の中で引き出しを描き直さない**(`<select>` が閉じた直後に作り直されて
  次の指定ができなくなる。`tavern.html:5647` の既存コメントと同じ罠)。
- **注記** — 同職が 2 人以上のときだけ出す。数は `selection.partyMembers` から数える
  (⛔ `PARTY_SIZE` からも `buildParty` の再計算からも導かない)。

### 5-3. 再描画点の一本化(§2-5)

`repaintAfterSkillChange()` を足し、**3 箇所だけ**差し替える。
引き出しを開いている間だけ `pmLoadoutRepaint` を差し替える:

```js
    function pmOpenDrawer(memberIdx) {
      ...
      pmLoadoutRepaint = () => { saveSelections(); pmRenderDrawer(memberIdx); pmRefreshCards(); };
    }
    function pmCloseDrawer() {
      pmLoadoutRepaint = null;     // ⚠ 必ず戻す。戻さないと準備画面が二度と更新されなくなる
      ...
    }
```

⚠⚠⚠ **`pmCloseDrawer` は `close()`(演出そのものを閉じる)からも必ず呼ぶ。**
引き出しを開いたまま出発すると `pmLoadoutRepaint` が残り、
**準備画面のスキル選択が一切反映されなくなる**。→ 負のコントロール **M5**。

`pmRefreshCards()` = カードの表示(スキル数など)を描き直す(§2-4 の同職 2 枚の同期)。

---

## 6. STEP3 — 見た目(§2-6)

`#pmDrawer` の中だけ暗い基調へ上書きする。⛔ `.skillItem` 本体は触らない。

```css
    #pmDrawer { display:none; width:100%; margin-top:14px; padding:14px 16px;
      background: var(--pm-panel); border:1px solid var(--pm-border); border-radius:10px;
      max-height: 42vh; overflow-y: auto; }        /* ⚠ 縦に溢れたら中でスクロール */
    #pmDrawer .skillItem { background: rgba(255,245,210,0.10); color: #f0e6d0; }
    #pmDrawer .skillItem.selected { background: linear-gradient(180deg, rgba(220,194,240,0.35), rgba(176,144,216,0.35));
      border-color: var(--pm-gold-soft); }
    .pmColumn.pmOpen { border-color: var(--pm-gold); box-shadow: 0 0 18px rgba(224,180,60,0.35); }
    #pmDepart { ... }                              /* 金色の大きめボタン。@media (hover:none) で拡大 */
    @media (max-width: 720px) { #pmDrawer { max-height: 38vh; } }
```

⚠ **`max-height` + `overflow-y` は必須。** 戦士は技が 10 本あり、
`#partyMatchOverlay` は `align-items:center` の固定オーバーレイなので、
中身が伸びると**上下が画面外へはみ出して出発ボタンが押せなくなる**。→ `(4c)` で検査。

---

## 7. 撤退スイッチ

- **`?pmsetup=0`** — 引き出しも `#pmDepart` も出ず、**背景タップで出発する従来の姿**へ完全に戻る。
  カードも押せない(`PM_SETUP_ON` が false なら `pmToggleDrawer` を呼ばない)。
- ⚠ **判定位置** = `ACTION_PRIORITY_UI_ON`(`tavern.html:5581`)の隣に同じ形で 1 つ:

```js
  const PM_SETUP_ON = (function () {
    try { return new URLSearchParams(window.location.search).get("pmsetup") !== "0"; }
    catch (e) { return true; }
  })();
```

- ⚠ **ページ遷移をまたがない。** `tavern.html` の中で完結する(演出も準備画面も同一ページ)。
  `index.html` は関係しない。
- ⚠ `?actionpri=0` は**別物**。両方指定しても矛盾しない
  (`?actionpri=0` = 傾向段だけ消える / `?pmsetup=0` = 引き出しごと出ない)。
  ⭐ **`?actionpri=0` だけのとき、引き出しは出るが傾向段だけ無い** = `(X-c)` で検査。

---

## 8. 受入条件 — `tools/verify_party_match_setup.js`(新規)

**何を観測するか**: ①「カードを押しても出発しない」を**出発したか否か**(= `#prep` が出たか)で、
②「引き出しの設定が本当に保存されたか」を **`selection` と `localStorage` の 2 経路**で見る。
⛔ 画面の見た目(色・角丸)は測らない。

### ⚠ 計測機構

    // 演出は openPrep() を await すると止まるので、既存 driver_action_priority.js:351 の
    // 「await しないで発火 → ポーリング」を踏襲する。
    await page.evaluate((scId) => {
      const sc = scenarios.find(s => s.id === scId);
      if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
      Promise.resolve(openPrep(sc)).catch(() => {});
    }, SCENARIO);
    // 全確定まで待つ: #pmDepart が hidden でなくなるまで (PM_REVEAL_INTERVAL 720 × 人数 + 500)

⚠ **`page.mouse.click(中央)` で進めてはいけない**(§2-2 の罠そのものを踏む)。
⭐⭐ 配信バイトは起動時に凍結する(別窓が同じリポを触っても、この run が読むのは 1 枚)。

### §0 装置(先に母集団を確かめる)

- **(0a)** ⭐⭐⭐ **カードが 2 枚以上あり、そのうち少なくとも 1 枚が NPC**
  (主人公だけの編成だと以降の assert が全部空振りする)。
- **(0b)** ⭐⭐ **カードの職業の集合が `selection.partyMembers` の職業の集合と一致**
  (表を写経せず実体から引いていることの検査)。
- **(0c)** 母集団: 引き出しを開いた職で「枠に入れている技」も「入れていない技」も
  **1 つ以上ある**(`(3b)` が自明にならない証明)。
- **(0d)** 母集団: `#pmDepart` が hidden でなくなった時刻が、
  最後のカードが `data-state="filled"` になった**後**である(確定前に出発口が開いていない)。

### §1 出発の口

- **(1a)** ⚠⚠⚠ **全確定後に `#pmColumns` の中心を叩いても `#prep` が出ない**
  (背景タップ = 出発が廃止されている)。⭐ **本チケットの本丸。**
- **(1b)** `#pmDepart` を押すと `#prep` が出る。
- **(1c)** `#pmDepart` は **`gateOpen` の前は押せない**(hidden か disabled)。
- **(1d)** 開示中(`phase === "reveal"`)に背景を叩くと**残りが即確定する**(従来の挙動が生きている)。
- **(1e)** 開示中にカードを叩いても**引き出しは開かない**(スキップが優先)。

### §2 伝播

- **(2a)** 引き出しの `<select>` を `click` しても `#prep` が出ない。
- **(2b)** ⚠⚠ **`touchend` を引き出しの上でディスパッチしても `#prep` が出ない**(§2-3)。
  ⭐ `click` だけ止めた実装はここで赤くなる。
- **(2c)** `#pmDepart` の `touchend` では**出発する**(iOS で詰まない)。

### §3 引き出しの中身

- **(3a)** カードを押すと `#pmDrawer` が可視になり、`.pmColumn.pmOpen` が**ちょうど 1 枚**。
- **(3b)** 傾向の候補に「枠に入れていない技」が **1 つも無い**
  (`apEquippedIdsFor` を流用している証明。#19 の `(6b-1)` と同じ主張)。
- **(3c)** 「道中」の行が出るのは `枠 ∩ TRAVEL_CASTABLE_IDS` が非空の職だけ
  (**2 経路突合**: データ由来の職の集合 vs 実際に行が出た職の集合)。
- **(3d)** スキル項目を押すと `selection.partySkills[classKey]` と
  `localStorage["dragonfighters.partySkills"]` の**両方**が変わり、
  **引き出しの表示も更新される**(§2-5)。
- **(3e)** 傾向の `<select>` を変えると `selection.actionPriority[classKey][sit]` と
  `localStorage["dragonfighters.actionPriority"]` の**両方**が変わる。
- **(3f)** `change` の直後も `<select>` が**同じ DOM ノードのまま**(作り直されていない)。

### §4 同職 2 人 / レイアウト

- **(4a-0)** 母集団: 同じ職が 2 人いる編成を作れている(`partyMembers` を仕込む)。
- **(4a)** 片方のカードで技を足すと、**もう片方のカードの表示も同じ値になる**(§2-4)。
- **(4b)** 同職 2 人のとき、引き出しに**共通適用の注記が出る**。1 人だけのときは出ない。
- **(4c)** ⚠ compact(390×844)で引き出しを開いても、**`#pmDepart` が画面内に残っている**
  (`getBoundingClientRect()` が viewport の内側)。
- **(4d)** compact で `#pmDrawer` が**横スクロールを起こさない**(`scrollWidth <= clientWidth`)。

### §5 恒等(非退行)

- **(5a)** 引き出しを一度も開かずに出発したとき、`selection` と `localStorage` が
  **1 バイトも変わっていない**(開くだけで壊さない)。
- **(5b)** 引き出しを**開いたまま**出発しても、その後の準備画面で
  スキル選択が**正しく更新される**(`pmLoadoutRepaint` が戻っている。§5-3)。

### §6 撤退

- **(X-a)** 母集団: スイッチが無ければ引き出しが開いた盤面。
- **(X-b)** `tavern.html?pmsetup=0` → `#pmDrawer` も `#pmDepart` も出ず、
  **背景タップで従来どおり出発する**。
- **(X-c)** `?actionpri=0` → 引き出しは出るがスキル段だけで**傾向段が無い**。
- **(X-d)** どちらのスイッチでも**保存済みの値は消えていない**。

### ⛔ 測らないこと

- **引き出しの配色・角丸・アニメーション**(§6)。目で決める。
- **`PM_REVEAL_INTERVAL` / `PM_TAP_GATE` の値**。テンポの調整レバーとして残す。
- **`#pmDepart` の文言**(「出発する」でなくてもよい)。
- **カードのどこを押しても開くか、下部だけか**。実機の指の当たり方で決める。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **M1** ⭐ | `onTap` に `if (gateOpen) close();` を戻す(**#19 が警告した誤爆の再現**) | `(1a)` |
| **M2** ⭐ | `swallow()` から `touchend` の行だけ削る(**§2-3 の罠**) | `(2b)` |
| **M3** | `renderSkillItem` の末尾を `repaintAfterSkillChange()` から `renderCharLoadout()` へ戻す(**§2-5 の罠**) | `(3d)` |
| **M4** | `pmRefreshCards()` を呼ばない(同職 2 枚が同期しない。**§2-4**) | `(4a)` |
| **M5** ⭐ | `close()` から `pmCloseDrawer()` を外す(`pmLoadoutRepaint` が残る) | `(5b)` |
| **M6** | `#pmDrawer` の `max-height`/`overflow-y` を外す | `(4c)` |
| **M7** | 傾向の候補を `apEquippedIdsFor` でなく `slot.skillPool` 全部にする | `(3b)` |

⭐ **M1 / M2 / M5 が §2 の罠 A / B / D の再現。**

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ **すべて HEAD = `a7f194e`(#28 着地後・tree clean)で 2026-08-28 に実測し直した値。**
⭐ 起草中に #28 が着地したので採り直したが、**4 本とも一字も変わらなかった**
(= #28 はこの 4 本に 1 ビットも影響していない)。
⚠ **走らせて違ったら、期待値を書き換える前に理由を突き止める。**
⚠⚠⚠ **本チケットは 4 本の突破手順を書き換えるので、突破手順を直す**前**に一度走らせて
「直す前は本当に赤いのか」を確かめること**(直したつもりで元々緑だと、
`#pmDepart` へ付け替えた意味が無い = 背景タップがまだ生きている証拠になる)。

- `node tools/driver_action_priority.js` → **75/75 PENDING 0**
  (⚠ #34 着地後は本数が変わる。完了条件は **PENDING 0 / FAILED 0**)
- `node tools/verify_recruit_size.js` → **82/82**
- `node tools/verify_quest_walk.js` → **25/25 PENDING 0**
- `node tools/driver_depart_menu_clean.js` → **41/41**
- `node tools/verify_tavern_map.js` → **42/42 PENDING 0**(記録値。同じページを触るため)
- `node tools/verify_town_map.js` → **85/85**(記録値)

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**。

1. ⚠⚠⚠ **iPhone 実機で `<select>` を開いて閉じたとき、出発してしまわないか**(§2-3)。
   ここが本チケットで最も壊れやすい。
2. カードを押した瞬間の反応 —— どこを押しても開くのは邪魔でないか。
   ⭐ 「下半分だけ押せる」ほうが良ければ変えてよい(§8 で測っていない)。
3. 引き出しが開いたとき、**出発ボタンが指の届く位置に残っているか**(縦持ち)。
4. 暗幕の上でスキル項目が読めるか(§2-6 の上書きが効いているか)。
5. ⚠ 同職 2 人のとき、注記が**分かる文言**になっているか。
6. 戦士(技 10 本)で引き出しが縦に長くなりすぎないか。中のスクロールが自然か。
7. `?pmsetup=0` で従来の「タップして出発」に戻るか。
8. ⭐ **準備画面(`#prep`)の職業タブは残す。** 引き出しと二重になるが、
   「出発前にもう一度直したい」経路として要る。邪魔なら別チケットで整理する。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>仲間が集う画面でスキルと戦い方を決められるようになった</b> — カードを押すとその場で開き、誰に何を使ってほしいかを出発前にまとめて指示できる。"

---

## 11. やらないこと

- ⛔ **メンバー単位(NPC 個人ごと)の保存**。設定は職業に紐づいたまま(§1 / §2-4)。
- ⛔ **戦士の仲間に傾向を効かせる実装**。**#34** の担当(本チケットの前提)。
- ⛔ **装備の変更**(武器/防具/盾)。引き出しは**スキルと傾向だけ**。
  装備は `js/equipment.js` の共有化(**#30**)が先。
- ⛔ **準備画面(`#prep`)の職業タブの削除・作り替え**(§9-8)。
- ⛔ **`#prep` 側の `#actionPrioritySection` の削除**。引き出しと二重になるが残す。
- ⛔ **マッチング演出のテンポ・演出そのものの変更**(`PM_REVEAL_INTERVAL` 等)。
- ⛔ **`index.html` の変更**。
- ⛔ **`実装依頼書/README.md` への行追加**(#28/#29 着地後)。用意してある行:

    | 35 | [2026-08-28_party-match-loadout.md](2026-08-28_party-match-loadout.md) | **承認済** | 0% | マッチング画面のカードを押すと引き出しが開き、全員分のスキルと傾向をその場で設定。⛔ **#34 の後**。⚠⚠⚠ **背景タップ = 出発を廃止するので golden 4 本が全部止まる**(`partyMatchOverlay.click()` に依存)→ `#pmDepart` へ付け替える。⚠⚠ **iOS は `touchend` も止めないと `<select>` を閉じた指で出発する**。⚠⚠ `renderSkillItem` の末尾は `renderCharLoadout()` 直結 = 引き出しが更新されない → 再描画点を 1 つに畳む。⚠ 同職 2 人は同じ設定を共有(設計どおり・注記を出す)。撤退=`?pmsetup=0` |

---

## 12. 実装結果

**着手** 2026-08-29 / **着手時 HEAD** `1d3dbd2`(#36 着地後・tree clean)/ **dev-loop 4 項目**。
撤退スイッチ **`?pmsetup=0`**(`?actionpri=0` とは独立)。

### 12-1. 4 項目の着地

| 項目 | commit | 規模 | やったこと |
|---|---|---|---|
| 1 | `194d109` | 7 files / +823 -11 | **STEP1 出発の口**。`#pmDepart` 新設 / `onTap` から「全確定後の背景タップ = 出発」を撤去(開示中の `skipRest` は温存)/ `pmSwallowTaps()` で `click` + `touchend` を飲む / `PM_SETUP_ON` / **review モード対応**(id 共通・ラベルだけ出し分け)/ **既存 golden 5 本**の突破手順を `#pmDepart` へ付け替え / 新規装置 `tools/verify_party_match_setup.js`(§0/§1/§2 実装・§3〜§6 は `pending()` 宣言)+ 変異 M1・M2 を先行内蔵 |
| 2 | `97f350d` | 2 files / +653 -54 | **STEP2 引き出し `#pmDrawer`**。カード押下で開閉 / 3 段(見出し + 同職注記・スキル段・傾向段)/ `renderSkillItem`・`renderSpellSlotItem`・`apEquippedIdsFor`・`AP_SITUATIONS`・`TRAVEL_CASTABLE_IDS` を**流用**(新しい部品を書かない)/ **再描画点を 3 箇所へ一本化**(`repaintAfterSkillChange`)/ `pmRefreshCards()` / `pmCloseDrawer()` を `close()` からも呼ぶ |
| 3 | `85b5b15` | 3 files / +399 -29 | **STEP3 見た目 + 撤退スイッチ**。`#pmDrawer` の中だけ暗い基調へ上書き(⛔ `.skillItem` 本体は無改修)/ `max-height` + `overflow-y` / compact で見出しと明細を畳む / `?pmsetup=0`・`?actionpri=0` の受入 / 装置を **PENDING 0** まで |
| 4 | (本コミット) | 2 files | **負のコントロール M3〜M7 を追加(計 7 本・空振り 0)** / 既存 golden 7 本の非退行実測 / 本節と §2-1・§2-2・§4-4 の訂正書き戻し / `実装依頼書/README.md` の #35 行更新 |

⭐ **項目4 は `tavern.html` / `index.html` / `audio.js` を 1 バイトも触っていない**ので changelog は鳴らない。
⛔ 鳴らないのに嘘のプレイヤー向け行を足していない(CLAUDE.md の恒久方針)。

### 12-2. 装置 `tools/verify_party_match_setup.js` の最終値

    node tools/verify_party_match_setup.js
    → [driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0   (合計 36)

**負のコントロール = 7 本すべて実装・1 本ずつ `--only` で確定・空振り 0。**

    node tools/verify_party_match_setup.js --negative --only M3   ← 1 本だけ注入
    node tools/verify_party_match_setup.js --negative             ← ⭐ 7 本を 1 本ずつ順に走らせる

⭐ **`--only` 無しの `--negative` は、自分自身を 1 タグずつ子プロセスで呼び直す**ようにした
(子は別ポート)。⚠⚠⚠ **7 本を同時に注入すると互いを覆い隠す**ので、素朴に全部入れる実装だと
M1 が背景タップで演出を閉じてしまい §2〜§5 の母集団がまるごと消え、**残り 5 本が全部空振り**する。
⚠ 子でも `mutate()` は 7 本ぶん呼ばれるので、**アンカーの健全性は毎回 7 本とも検査される**
(腐っていれば注入せずとも exit 3)。

| 変異 | 注入した欠陥(アンカー) | **実際に赤くなったラベル** | 素点 |
|---|---|---|---|
| **M1** | `if (!setupOn && gateOpen) close();` → `if (gateOpen) close();` | `(1a)` `(2z)` `(2a)` `(2b)` | 32/36 |
| **M2** | `pmSwallowTaps` の `touchend` 行だけ削除 | `(2b-2)` | 35/36 |
| **M3** | `repaintAfterSkillChange` の `if (pmLoadoutRepaint) {…}` を殺す | `(3d)` `(4a)` | 34/36 |
| **M4** | `pmLoadoutRepaint` から `pmRefreshCards();` を落とす | `(4a)` | 35/36 |
| **M5** | `close()` から `pmCloseDrawer();` を外す | `(5b)` | 35/36 |
| **M6** | `#pmDrawer` の `max-height`/`overflow-y` を外す(**2 アンカー**) | `(4c)` | 35/36 |
| **M7** | 傾向の候補を `apEquippedIdsFor` でなく `slot.skillPool` 全部に | `(3b)` | 35/36 |

⭐ `NEG_EXPECT` には**標的のラベルだけ**を載せた。M1 の `(2z)(2a)(2b)` と M3 の `(4a)` は
**巻き添え(母集団が消える側)**なので担当表には書かない —— 担当表へ書くと
「母集団 0 で述語が false = 偽の赤」で本物の空振りを隠す(#29 の実測)。

#### ⚠⚠⚠ 変異アンカーで実際に踏んだ罠(次に同じ画面を触る窓へ)

1. **`saveSelections(); repaintAfterSkillChange();` はアンカーに使えない** —— **3 箇所で同形**なので
   `mutate()` が `hits !== 1` で **exit 3**。一意なのは `repaintAfterSkillChange` の**本体 1 行**。
2. **M5 は `close()` の中に一意な 1 行が無い**(`        pmCloseDrawer();` は 2 箇所)。
   → **直前のコメント行ごと** `\r\n` 込みで掴む。⚠ **4 スペース版**(演出を開くときのリセット)と混同しない。
3. ⚠⚠⚠ **M6 は `max-height: 42vh` を消しても compact の `(4c)` は赤くならない。**
   390px では `@media (max-width:720px)` の `#pmDrawer { max-height: 30vh; … }` が勝つ。
   **両方潰して初めて赤くなる**(実測: 引き出し 253px → **789px** / `#pmInner` 711px → **1247px** /
   `#pmDepart` の rect.top が **996** で viewport 844 の外・`elementFromPoint` が `(なし)`)。
   ⭐ `mutate()` の tag は**ラベルの先頭語**なので、2 本とも `'M6 '` で始めれば `--only M6` で同時に入る。
4. ⚠⚠ **M7 の `const equippedIds = apEquippedIdsFor(slot, classKey);` は
   `renderActionPriority` と `pmRenderDrawer` の 2 箇所で文字列が完全一致** → 単体では exit 3。
   引き出し側だけを狙う一意な行は `const nameOf = (id) => { … };` の **1 行版**
   (`renderActionPriority` 側は同じ関数を複数行で書いているので衝突しない)。
5. ⚠⚠⚠ **配信バイトは CRLF。** 複数行アンカーは `\r\n` を含めないと 0 件ヒットで exit 3。
6. ⚠⚠⚠ **変異を全部同時に入れると互いを覆い隠す。** M1 を入れると背景タップで演出が閉じ、
   §2〜§4 の母集団がまるごと消えて「誰の証拠か」が分からなくなる。**必ず `--only` で 1 本ずつ。**

### 12-3. 既存 golden の非退行(2026-08-29 実測・**7 本すべて基準どおり / 期待値の変更 0 件**)

| ドライバ | 基準 | **実測** |
|---|---|---|
| `node tools/verify_recruit_size.js` | 82/82 | **82/82 PASS** |
| `node tools/verify_quest_walk.js` | 25/25 PENDING 0 | **25/25 PASSED / FAILED 0 / PENDING 0** |
| `node tools/driver_depart_menu_clean.js` | 41/41 | **41/41 PASS** |
| `node tools/driver_action_priority.js` | 92/92 PENDING 0 | **PASSED 92 / FAILED 0 / PENDING 0** |
| `node tools/driver_party_view_reopen.js` | 35/35 | **35/35 PASSED / 0 FAILED / 0 PENDING** |
| `node tools/verify_tavern_map.js` | 43/43 PENDING 0 | **43/43 PASSED / FAILED 0 / PENDING 0** |
| `node tools/verify_player_sheet.js` | 70/70 PENDING 0 | **70/70 PASSED / FAILED 0 / PENDING 0** |

### 12-4. 起草時の主張が崩れた 3 件(訂正は本文へ書き戻した)

1. **§2 の行番号が 26 項目すべてズレていた** → §2-1 の訂正ブロック。
2. **§2-1 / §4 が知らない `review` モードが `9b6f3b8` で増えていた** → §2-1 の訂正ブロック。
   決定 = `#pmDepart` は **id 共通・ラベルだけ出し分け**、引き出しは両モードで開ける。
3. **§2-2 / §4-4 の「golden 4 本」は誤りで実際は 5 本**(5 本目 = `driver_party_view_reopen` 35/35)。
   さらに **`driver_action_priority` の基準 75/75 も古い**(#34 で 92/92)→ §2-2 / §4-4 の訂正ブロック。

### 12-5. 実装中に採った逸脱 3 件(⛔ 依頼書の指示と違う形にした箇所)

1. **カードへの `swallow` は無条件ではなく `done` の時だけ**(§4-4 の訂正ブロックに詳細)。
   無条件に止めると開示中に `skipRest()` が走らず、**画面の大半が死に領域**になる。
2. **カードのタップに `touchend` → `click` のゴーストクリック除けが要った。**
   項目1 の時点では中身が no-op だったので露見しなかったが、`pmToggleDrawer` を入れた瞬間に
   **実機の指 1 回で開いて即閉じる**ようになる(1 回のタップで `touchend` と `click` が両方飛ぶ)。
3. **`#pmHint` の文言を実挙動に合わせ、`driver_party_view_reopen (4c)` は測定点を移した。**
   背景タップ出発を廃止したのに文言が「タップして出発」のままだと嘘になる。ところが `(4c)` が
   その文字列を **verbatim** で縛っていた。⛔ pending 化も削除もせず、**期待値を弱めず
   1 条件 → 4 条件へ強化**して置き換えた(旧: `hint === "タップして出発"` /
   新: **開示中の文言 ≠ 全確定後の文言** && `"出発"` を含む && `"準備へ戻る"` を**含まない**
   && `"カード"` を含む && 母集団)。本数は **35 本のまま**、負のコントロール N1/N5 も赤のまま。
   新文言 = `"カードを押して設定 ・ 下のボタンで出発"` / review は `"…下のボタンで準備へ戻る"`。
   ⭐ **`?pmsetup=0` のときだけ従来の `"タップして出発"` に戻る**(撤退路が文言まで完全に戻る)。

### 12-6. 実装中に判明した計測の知見(次の窓へ)

- ⚠⚠ **「#prep が出ない」だけの assert は自明に緑になる。** `onTap` がもう閉じないので、
  伝播を止めていなくても `(2a)`/`(2b)` は通る。→ **overlay が実際にイベントを受けた回数を数える**
  `(2a-2)`/`(2b-2)` を併置した。負のコントロール M2 はこちらで数える。
- ⚠⚠⚠ **「全カラムが `filled`」で待つと、まだ `phase === "reveal"`。** `step()` は最後の 1 枚を
  埋めた後にもう一度 720ms のタイマを積むので、`filled + 750ms` で背景を叩くと `close` ではなく
  `skipRest` に落ちる。**待つのは `finishReveal` が付ける `.pmWait`** + `PM_TAP_GATE`。
- ⭐ **決定論的な編成は検証シーム `window.__pmTest.play` 経由で作る。**
  `openPrep` 経由だと毎回 `regeneratePartyMembers()` が走って顔ぶれが変わり、
  同職 2 人の母集団 `(4a-0)` が乱数任せになる。
- ⚠ **`puppeteer` の `page.click('#btnPartyView')` は準備画面が縦に長いと
  `Node is either not clickable or not an Element` で run ごと落ちる**(FATAL 1 本で他が測れなくなる)。
  押しやすさを測らない場面では `evaluate` 内の `b.click()` にする。
- ⚠⚠ **`(5a)`(1 バイトも変わらない)を `openPrep` 経由で測ってはいけない。**
  `openPrep` は毎回 `regeneratePartyMembers()` を通って `selection` を書き換えるので、
  **原理的に成立しない = 自明に赤い検出器**になる。測るのは `__pmTest.play` の一往復。

### 12-7. 残件 = ユーザーの実機体感(§9)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレ音声が無音)。**機械では測っていない 8 項目**:

1. ⚠⚠⚠ **iPhone 実機で `<select>` を開いて閉じたとき、出発してしまわないか**(§2-3。最も壊れやすい)
2. カードを押した瞬間の反応 —— どこを押しても開くのは邪魔でないか(⭐「下半分だけ」に変えてよい)
3. 引き出しが開いたとき、**出発ボタンが指の届く位置に残っているか**(縦持ち)
4. 暗幕の上でスキル項目が読めるか(§2-6 の上書きが効いているか)
5. 同職 2 人のときの注記が**分かる文言**になっているか
6. 戦士(技 10 本)で引き出しが縦に長くなりすぎないか。中のスクロールが自然か
7. `?pmsetup=0` で従来の「タップして出発」に戻るか
8. ⭐ 準備画面(`#prep`)の職業タブは**残してある**。二重で邪魔なら別チケットで整理する
