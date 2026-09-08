# #60 マッチング画面から酒場へ戻る + 「同行の約束」を可視化する

- **起草**: 2026-09-07(計画窓 `claude-6a`) / **ステータス**: **承認済**(2026-09-07)
- **着手**: ⏸ **保留 — #59 の着地待ち**(§2-0。`tavern.html` が衝突する)。
  着地判定は台帳の文面ではなく **作業ツリーが clean** で見る。
- ⚠ **着手前にもう一度**、§2 の位置を本番の関数で測り直すこと。**行番号ではなく識別子で引く**。
  #59 が `tavern.html` を編集するので**行番号は必ずズレる**。
- **触るファイル**: `tavern.html` / `tools/verify_party_promises.js`(新規) / `実装依頼書/README.md`
- ⛔ **触らないファイル**: `index.html`
  — **隣窓 `claude-bf` が依頼書 #59 を実装中**で、`index.html` に未コミット差分がある
  (2026-09-07 実測 `git status --short` = ` M index.html`)。
  本チケットは `index.html` を**一度も開かずに完了できる**(§3 で確認済み)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- ⚠⚠⚠ **`tavern.html` は #59 も触る**(§2-0)。**着手は #59 の着地待ち**。

---

## 1. 目的

パーティ・マッチング画面(`#partyMatchOverlay`)は、受注直後に必ず通る画面でありながら
**出口が「出発する」しか無い**。一度受注したら潜るしかなく、編成を見直して酒場へ引き返せない。

同じ画面の「📣 募集をかけ直す」は、**#54 の日に意味を失っている**。押しても顔ぶれは
1 ミリも変わらない(§2-2)。プレイヤーからは「抽選ボタンが壊れている」と見える。

そして酒場では「誰と同行の約束をしたか」が分かりにくい。⭐ ただしこれは**未実装ではない** ——
#57 の 🤝 前置が既に出荷済みで(§2-3)、届いていないのは**一覧する口が無い**ことと
**札が地味**なことが原因。

**ユーザー決定(2026-09-07 / 会議 `dev-meetings/2026-09-07_party-match-exit-and-recruit-visibility.md`)**:

- ✅ 候補① 出口と解散 / ✅ 候補② 同行の約束の常設パネル / ✅ 候補③ 🤝 を見て分かる強さへ
- ❌ **候補④「依頼を降りる」は不採用** — 受注状態は**保持したまま画面だけ戻る**。
  ⭐ 不採用の理由を残す: 受注を巻き戻すと `prepIntelUsed` の扱いで
  「情報の食い逃げ」か「振り直し放題」のどちらかの穴が必ず開く(会議 第1ラウンド)。
  今回は**戻っても受注は生きている**ので、この穴は原理的に発生しない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-0. ⚠⚠⚠ 並走 — `tavern.html` を #59 も触る

```
$ git status --short --untracked-files=all
 M index.html
$ git log --oneline -3
7a42df6 #59 STEP0 — 母集団の素の基準を §14-0 に記録 + STEP4 の実測を §14 に追記
502e3a7 #59 STEP4 — hold-person を turn-undead と同格へ
2c42441 #59 起草
```

#59 の §3 変更範囲: `tavern.html` ✅(`CLERIC_SLOTS_TABLE` の鏡 1 行 + `CLERIC_SKILLS_UI` の `levelReq`)。

⇒ **触る箇所は完全に別**(#59 = 僧侶呪文の表 / #60 = マッチング画面と酒場 UI)だが、
**同一ファイルなので同時編集はコミット事故になる**。
⚠⚠ ファイル単位 add でも「相手が同じファイルを add する」事故は防げない。
**⇒ 着手は #59 が着地してから。** 着地判定は台帳の文面ではなく **`git status` が clean** で見る。

### 2-1. ⚠⚠⚠ 最大の罠 — 「閉じるだけ」で実装すると**その場で潜る**

`tavern.html` の `openPrep()`(識別子で引くこと。2026-09-07 時点で `:6017`):

```js
await playPartyMatchCinematic(sc);                    // 演出。閉じると resolve
if (PREP_SKIP_ON) { departToScenario(); return; }     // ← #55 の 1 行。無条件で出発
```

`close()` の中の `resolve()` は**無記名**。⇒ 呼び出し側は「出発する を押されたのか /
戻る を押されたのか」を**区別できない**。「酒場へ戻る」で overlay を閉じたら、
promise が解けて**次の行がそのまま潜らせる**。

⭐ この罠は §10 の変異 **M3** として装置に内蔵させる。

**`resolve()` の全数 = 3 箇所**(`playPartyMatchCinematic` 内をリポジトリ全文 grep で実測):

| 位置(2026-09-07) | 種類 | 記名後の値 |
|---|---|---|
| `:8421` | 早期 return(`!overlay \|\| !colsEl`) | **`"depart"`** |
| `:8423` | 早期 return(`!raw.length` = 応募者ゼロ) | **`"depart"`** |
| `:8543` | `close()` の中 | 押された口に応じて `"depart"` / `"back"` |

⚠⚠⚠ **早期 return の 2 本を `"back"` にすると、「overlay が無い / 応募者ゼロ」で出発が
黙って死ぬ。** ⭐ これは §10 の変異 **M1** で機械的に検査する。

**再測定コマンド**:

    grep -n 'resolve()' tavern.html | awk -F: '$1>8390 && $1<8620'

### 2-2. 「募集をかけ直す」が効かない真因 — 壊れたのではなく **#54 で意味を失った**

ボタンは**配線されている**(`:6513` で `#pmBtnReroll` に `click` + `touchend` の両方)。
真因は `regeneratePartyMembers()`(`:6426`):

```js
if (isRecruitTalkOn()) {
  const cands = (window.DFRecruits ? DFRecruits.all() : []).slice(0, Math.max(0, partySize - 1));
  selection.partyMembers = orderFormation([makeHeroMember(heroKey)].concat(cands));
  return;                     // ← 再抽選が 1 行も走らない
}
selection.partyMembers = orderFormation(buildParty(heroKey, partySize));
```

`isRecruitTalkOn()` は**既定 ON**。⇒ `DFRecruits.all()` をそのまま組み直すだけなので
**押しても顔ぶれは必ず同じ**(恒等写像)。

⛔ **「本当に機能させる」(= `DFRecruits` を無視して自動抽選へ戻す)は採らない。**
#54 が「誰も誘っていなければソロ」まで踏み込んで「誘う意味」を作ったのに、
引き直せたら**声を掛ける行為が無意味に戻る**(#54 依頼書 §6-4 が名指しで禁じている)。

### 2-3. ⭐ 議題「酒場で仲間が分かるように」は **#57 で既に出荷済み**

`patronLabelPaint()`(`:7837`)が約束済みの頭上札に **`"🤝 "` を前置**し、
`refreshPatronLabelFor()` が付け外しで引き直す。⛔ **「未実装」を前提に作らないこと。**

届いていない理由の実測:

| 実測 | 出所 |
|---|---|
| 札が出るのは**卓の 4 席(`todaysPatrons`)だけ**。店主 / 酔漢 / 給仕 / 荷運びには出さない | `tavern.html:9759` の注記 |
| 文字は **12px**(`body.compact` で 11px) | `.patronLabel` の CSS(`:2440` / `:2457`) |
| **一覧で確認する口が無い** — 札を 1 枚ずつ見に行くしかない | 本節の grep で該当 UI が 0 件 |

⚠ **#57 の実機体感 ①「頭上札の 12px が読めるか」は未消化のまま**(#57 依頼書 §14-5)。
⇒ **本チケットで文字サイズを決め打ちしない**(§8-1)。

### 2-4. ⭐⭐⭐ 戻った後の再入場 — `openPrep` を通すと事前情報が引き直せる

`openPrep()` は冒頭で `prepIntelUsed` と `prepIntelSuccess` を**リセットする**(`:6026-6027`)。
⇒ 依頼札を押し直して再入場させると、**吟味・聞き込み・祈りが無限に引き直せる**。

救いは**既存関数**: `openPartyMatchReview()`(`:8606`)は `prepScenario` を使い回して
`openPrep` を**通らずに**演出だけ開き、`departToScenario()` を呼ばない(fire-and-forget)。

⇒ **再入場はこれ一本。** ⭐ §10 の変異 **M2** で検査する。

### 2-5. ⚠ 既存ドライバ `driver_party_view_reopen.js` が `#btnPartyView` を掴んでいる

会議は「`btnPartyView` は #55 で死んで誰にも押せない」と述べたが、**半分誤り**。
UI としては準備画面ごと廃止されたが、**ドライバは `?prepskip=0`(従来の 2 段経路)で
今も押している**:

```
tools/driver_party_view_reopen.js:285   return p + (...) + 'prepskip=0';
tools/driver_party_view_reopen.js:318   await page.click('#btnPartyView');
```

⛔⛔ **STEP3 の新しい「編成を見る」に `btnPartyView` の id を再利用しない。**
同 id が 2 つできて `document.getElementById` が先頭を返し、このドライバが壊れる。
**別 id**(例 `#promisesViewParty`)にすること。

### 2-6. ⚠ `#pmDepart` を掴む道具は **10 本**(会議の「golden 5 本」は誤り)

    grep -rln "pmDepart" tools/*.js

```
driver_action_priority.js     driver_depart_menu_clean.js   driver_equip_compact_ios.js
driver_party_view_reopen.js   verify_darkvision.js          verify_party_match_setup.js
verify_pm_drawer_fit.js       verify_prep_retire.js         verify_quest_walk.js
verify_recruit_size.js
```

⛔ **`#pmDepart` の id は 1 文字も変えない。** 10 本がこの id で出発の口を掴んでいる。

### 2-7. `playPartyMatchCinematic` の呼び口 = **3 本**

| 呼び口 | await するか | 記名化の影響 |
|---|---|---|
| `tavern.html:6052` `openPrep` | **する** | ⭐ ここだけが分岐を書く場所 |
| `tavern.html:8609` `openPartyMatchReview` | しない | 影響なし |
| `tavern.html:8622` `__pmTest.play`(検証シーム) | 返すだけ | 影響なし(`verify_recruit_size.js:731` が await せず呼ぶ) |

### 2-8. `DFRecruits` の公開 API(`js/recruit-candidates.js` 末尾で実測 — **新規実装は要らない**)

`KEY / enabled / load / save / all / has / add / remove / clear / count`

⭐ **解散は `clear()` が既にある。**⭐ 個別解除は `remove(name)` が既にある。
⭐ 帰還時の解散も既に走る(`tavern.html:5312`)。**`RECRUIT_MAX = 3`**(`:4428`)。

### 2-9. ⚠⚠ ポート — 会議の「10140」は**取れない**

    grep -rhon "101[0-9][0-9]" tools/*.js | cut -d: -f2 | sort -un | tail

既存の最大は **10139**。さらに **#59 が 10141〜10149 を予約済み**
(#59 依頼書 `:330`「ポートは #56=10081 / #57=10101-10109 / #58=10121 が使用中。**10141〜10149** を取る」)。

⇒ 慣例の +20 刻み(10081 → 10101 → 10121 → 10141)に従い、**#60 は base `10161`**
(変異 10162〜10169)。

### 2-10. 撤退スイッチの既存作法

`PREP_SKIP_ON`(`:7113`)は `?prepskip !== "0"`、**判定は 1 箇所だけ**。
`PM_SETUP_ON`(`:7118`)も同じ形。⇒ 新しい 3 本も**同じ作法**(判定 1 箇所・以降は定数を見る)。

### 2-11. ⚠⚠⚠ **ラベルを変えると既存 golden 5 本が赤くなる。これは「正しい赤」**

#59 の実装窓が渡してくれた一般形 —— **「本体を触らず外側に足す」は、本体を逐語で縛る
golden があると成立しない** —— の同型が本件にもある。**変えるのはラベル文字列の方**だ。

    grep -rn "準備へ戻る" tools/*.js
    grep -rn "募集をかけ直" tools/*.js

| 道具:行 | 逐語で縛っている物 | 何を守っていたか | #60 での**言い直し方** |
|---|---|---|---|
| `driver_party_view_reopen.js:389` | `(1d)` hint に `'準備へ戻る'` を含む | **閉じた先は出発ではない** | 「**出発とは言わない**」の片面だけ残す。⛔ 行き先の**名前は縛らない** |
| `verify_party_match_setup.js:843` | `(1f)` `r1.depText === '準備へ戻る'` | review では**通常と違うラベル**になる | `normalLabel !== reviewLabel` で縛る。⛔ 文字列を写経しない |
| `verify_prep_retire.js:596` | `(5a)` 「募集をかけ直す」があり**押すと顔ぶれが変わりうる** | マッチング画面に**引き直しの口がある** | ⚠ §2-2 のとおり**顔ぶれは変わらない**ので、この assert は**現在も嘘**。#60 で「**約束を解散する口がある**」へ言い直す |
| `verify_recruit_size.js:672` | `(D1)` ラベルに「募集」・旧「引き直」が無い | 旧語彙の残留検出 | 新ラベルでも「引き直」が無いことは成立。**「募集」の要求だけ外す** |
| `verify_recruit_size.js:421` | **`tavSrc` の正規表現** `/「募集をかけ直す」/` | **ナレ本文とボタンの文言が一致**している | ⚠ ナレ(`tavern.html:7624`)も一緒に直す。assert は「**ナレの語とボタンの語が一致**」へ言い直す(⛔ 語そのものを写経しない) |

⛔⛔ **数値や文字列を新しい値へ書き換えて緑にするのは禁止**(#57 の教訓「⛔ 数値を +1 して
緑にしない。**総数を写経するのをやめる形へ言い直す**のが正しい直し方」)。
上表の「言い直し方」の列は、**その assert が本来守っていた不変条件を保つ**書き換えになっている。

⭐ **`driver_party_view_reopen.js:113-114` は触らない** —— `'playPartyMatchCinematic(prepScenario,
{ review: true });'` を**逐語で置換**して N5 変異を注入している。⇒ **`openPartyMatchReview` の
呼び口 1 行は 1 文字も変えない**(空白の入れ方も)。変えると変異が**黙って空振り**する。

⭐ 一方、**私が変える行は逐語では縛られていない**(実測):
`await playPartyMatchCinematic(sc)` = 0 件 / `'resolve();'` の逐語 = 0 件 /
`departToScenario()` は**注入コードからの呼び出しのみ**(`probe_party_size.js:358,505`)で
ソース assert ではない。⇒ **§5 の記名化そのものは既存 golden を 1 本も動かさない。**

### 2-12. ⚠ **#59 着地(2026-09-08)で行番号が既にズレた。識別子で引き直す表**

#59 が `tavern.html` に入れた差分は **+12/−6 行**、hunk は **3117 / 4182 / 4813** の 3 箇所で
**すべて行 4823 より上**。⇒ それより下の参照は **+6** ずれている。

**着地後に測り直した現在値**(`git diff --stat 2c42441..HEAD -- tavern.html` で確認済み):

| 識別子(⭐ こちらが正) | 依頼書の記載 | **現在** |
|---|---|---|
| `function openPrep` | `:6017` | **6017** ✅ |
| `function regeneratePartyMembers` | `:6426` | **6432** ⚠ +6 |
| `function patronLabelPaint` | `:7837` | **7843** ⚠ +6 |
| `function playPartyMatchCinematic` | `:8396` | **8396** ✅ |
| `function openPartyMatchReview` | `:8606` | **8606** ✅ |
| `id="pmBtnReroll"`(markup) | `:2875` | **2875** ✅ |

⛔ **他の行番号も同様に ±6 の誤差がある前提で読むこと。** 再測定:

    grep -n 'function openPrep\|function playPartyMatchCinematic\|function openPartyMatchReview\|function patronLabelPaint\|function regeneratePartyMembers' tavern.html

### 2-13. ⭐⭐⭐ **前のチケットが「実機体感で動かす」と外した項目は、golden の空白地帯になる**

#59 の実装窓が渡してくれた一般形。実例 —— `verify_hold_person`(#57)は
**梯子の順とスロット表の数値を 1 つも守っていない**。ヘッダで「⛔ 測らないこと …
ホールドパーソンの発射率(clericAI の梯子の位置は実機体感で動かす)」と、
**次に動かす予定のレバーを最初から受入の外に置いた**ためだ。

**#60 に効く空白地帯**(この窓が数えた):

| 空白 | 誰が外したか | #60 での扱い |
|---|---|---|
| **札の文字サイズ・読みやすさ** | #57 §14-5 ①(実機体感送り・**未消化**) | ⚠ **`.promised` を足してもサイズ退行を検出する装置は無い**。⛔ だから §9-4 のとおり **#60 も測らない**。⭐ ただし「**測っていない**」ことを §14 に明記して次へ渡す |
| **引き出し・パネルの寸法** | #56(#55 の教訓「『寸法は測らない』は**その寸法を守る既存 golden が居るときだけ**許される」) | ⚠ STEP3 のパネルには**守る golden が居ない** ⇒ **(1a)「出発の口が画面内に残る」だけは必ず測る**(§9-4) |
| **金の輪の光量** | #57 §14-5 ③④(`--holdGlow`) | 本チケットの範囲外。⛔ 触らない |

⭐ **一般形の運用**: 起草のたびに「**前のチケットが意図的に測らなかったもの**」を 1 度数える。
そこが次のチケットで**黙って壊れる場所**になる。

---

## 3. 変更範囲

| ファイル | 触る | 何を |
|---|---|---|
| `tavern.html` | ✅ | 演出 promise の記名化 / 戻るボタン / 解散ボタン / 常設パネル / 札の色分け / カードの出自 |
| `tools/verify_party_promises.js` | ✅ 新規 | 受入ドライバ(base **10161**) |
| `実装依頼書/README.md` | ✅ | 一覧行の追加(⚠ **#59 着地まで保留** — §13) |
| `index.html` | ⛔ | **一度も開かない**。本件のロジックは全て `tavern.html` に閉じている |
| `js/recruit-candidates.js` | ⛔ | API は §2-8 で足りている。**1 文字も足さない** |
| `tools/driver_party_view_reopen.js` | ⛔ | §2-5。**既存の検査対象を動かさない** |

---

## 4. STEP0 — 着手前の母集団を採る

既存ドライバ全本を 1 度実走し、**exit / 集計行 / FAIL 行の集合**を §14-0 に記録する。
⭐ 非退行の判定はこの 3 点の**完全一致**で見る(#57 / #58 で確立)。

⚠ **着手前から赤い 2 本**(`verify_walk_block` / `driver_speech_v2`)は**本件と無関係**
(#53 の `swampNovice` で「在庫の総数を写経した検出器」が腐ったもの)。⛔ 緑にしにいかない。

---

## 5. STEP1 — 演出 promise の記名化 + 「🍺 酒場へ戻る」【山場】

1. **`resolve()` を記名化**(§2-1 の表のとおり 3 箇所)
2. `openPrep` の #55 の 1 行を分岐へ:

```js
const how = await playPartyMatchCinematic(sc);
if (PREP_SKIP_ON) { if (how === "back") return; departToScenario(); return; }
```

   ⛔ `departToScenario()` の中身は書き換えない。
3. `#pmRerollRow` の並びへ **「🍺 酒場へ戻る」** を追加
   - ⚠⚠ `#pmDepart` と同じ作法で **`click` + `touchend` の両建て** + **`stopPropagation()`**
     (止めないと指が背景 = 開示スキップへ抜ける。`#pmBtnReroll` のハンドラが実例)
   - ⚠ 出発の口とは**間隔を空ける**(#55 が押し間違い防止で作った不変条件 `:2260`)
   - ⚠ 出す条件は `#pmDepart` と同じ【全員確定 かつ 猶予明け】。確定前に戻れると
     「確定を見ずに飛ばす」が復活する
4. **review モードの嘘を直す** — `:8470` の `"準備へ戻る"` と `:8414` のヒント文言を
   **「酒場へ戻る」**へ。⚠ その準備画面は #55 で廃止済 = 現状は嘘の導線
5. ⛔ **`#pmDepart` の id は変えない**(§2-6 の 10 本)

**撤退 `?pmback=0`** ⇒ 戻るボタンが出ず、**従来どおり出発だけ**。
⭐ 撤退時に「潜れなくなる」ことは絶対に無いようにする。

---

## 6. STEP2 — 「募集をかけ直す」→「🤝 約束を解散する」

1. `#pmBtnReroll` のラベルとハンドラを差し替え:
   `DFRecruits.clear()` → `regeneratePartyMembers()` → `renderPartyPreview()` → `pmRebuildRef()`
   - ⛔ `doRecruitReroll()` は**消さない**(`?recruittalk=0` の従来経路が使う)。
     **押す口の行き先だけ**を切り替える
2. 確認を 1 枚挟む(3 人まとめて消えるため)。⛔ 新規ダイアログは作らず既存の器を再利用
3. ⭐ 解散後の安全網は**既にある** — `needsSoloWarning()`(#54)が出発時に
   「一人で行くのか」を必ず出す。⇒ 解散側の確認は 1 枚で十分
4. ⚠ **`?recruittalk=0` のときは従来の「募集をかけ直す」のまま**
   (あの経路では自動抽選が生きているので解散に意味が無い)
5. ⚠⚠ **ナレ本文も一緒に直す** —— `tavern.html:7624` の受注ナレが
   「顔ぶれが気に入らねば**「募集をかけ直す」**がよい」と**ボタン名を名指ししている**。
   ⭐ `verify_recruit_size.js:421` が `tavSrc` の正規表現で**この一致を守っている**(§2-11)。
   ⇒ ボタン名を変えるならナレも変える。⛔ 片方だけ直すと「語りかけの先に無いボタンがある」
   という食い違いが残る(そのドライバのコメントが明示している)

---

## 7. STEP3 — 「同行の約束」常設パネル【STEP1 と対】

1. 酒場に**バッジ 1 個だけ常設**(`🤝 N/3`)。⚠ 酒場の絵を隠さない
2. 押すと開く中身: **一覧** / **個別に解除**(`DFRecruits.remove(name)` + `refreshPatronLabelFor`) /
   **「編成を見る」**
3. ⭐⭐⭐ 「編成を見る」は **`openPartyMatchReview()` を呼ぶ**(§2-4)
   - ⛔⛔ **依頼札を押し直す経路で再入場させない**(`openPrep` が `prepIntelUsed` をリセットする)
   - ⚠ `prepScenario` が null(未受注)のときは「編成を見る」を**出さない**
   - ⛔ **id に `btnPartyView` を使わない**(§2-5)
4. ⚠⚠ **#56 の轍を踏まない** — 真犯人は `max-height` ではなく **`overflow-y:auto`**
   (それを持つ flex 子は自動最小サイズが 0 になり収縮を全部吸う)。**パネルを flex 子にしない**

**撤退 `?promises=0`**

---

## 8. STEP4 — 🤝 を見て分かる強さへ

1. `.patronLabel` に **`.promised`** を足し、`patronLabelPaint()` で付け外し(枠を金・背景を濃く)
   - ⛔ **札を出す席は増やさない**(§2-3。4 席限定は #57 の設計。店主 / 給仕に出すと
     「声を掛けられる相手」の見分けが逆に壊れる)
   - ⛔ **光り物は足さない**(#57 の `--holdGlow` が実機未確認)
   - ⚠ **文字サイズは決め打ちしない** — #57 の実機体感 ① の結果を見てから
   - ⚠ `verify_hold_person.js` が `patronLabel` を掴む唯一の道具(§2-3)。非退行を必ず確認
2. マッチング画面のカードに **「🤝 酒場で声を掛けた」** の出自を出す
   - ⚠ 判定は `DFRecruits.has(m.name)` = **名前引き**。同名の別人が居ると両方に付く。
     ⭐ 卓 4 席 / 上限 3 人なので**許容し、コメントに残す**
     (⛔ ここで名簿の同一性システムを作らない — 規模が跳ねる)

**撤退 `?promisemark=0`**

---

## 9. 受入条件 — `tools/verify_party_promises.js`(新規・base **10161**)

### 9-0. 装置(母集団ガード) ⭐⭐⭐ これが無いと全 assert が空振りで永久緑になる

- (0a) `playPartyMatchCinematic` / `openPartyMatchReview` / `DFRecruits` を**裸の識別子で読めた**
  (`verify_recruit_size.js:725` の作法を写す)
- (0b) マッチング画面のカードが **1 枚以上**描かれている(0 枚なら以降は全部空振り)
- (0c) `DFRecruits.count()` が **1 以上**の状態を作れている(解散の検査対象が存在する)

⚠⚠⚠ **#58 の教訓**: 「**門番が例外扱いする対象を、門番の下流で測ってはいけない**」。
本件の門番は **`PREP_SKIP_ON`** と **`isRecruitTalkOn()`**。受入条件をこの 2 つの
**下流**に置くと永久緑になる。⇒ (1b)(3a) は**門番の外側**(呼ばれたか否か)で測る。

### 9-1. 本体

- (1a) 受注 → マッチング画面に**「酒場へ戻る」が見える**(確定後・猶予明け)
- (1b) ⭐⭐⭐ **戻るを押しても `departToScenario()` が呼ばれない**(= 潜らない)。**本件の中核**
- (1c) 出発するを押すと**従来どおり潜る**(非退行)
- (1d) `?pmback=0` で戻るボタンが**出ず**、出発は従来どおり
- (1e) 確定前・猶予中は戻るボタンが**押せない**
- (2a) 解散を押すと `DFRecruits.count()` が **0**、カード列が主人公 1 枚になる
- (2b) `?recruittalk=0` では**ラベルが「募集をかけ直す」のまま**
- (3a) ⭐⭐⭐ **戻る →「編成を見る」で再入場したとき `prepIntelUsed` が保持される**(引き直せない)
- (3b) `prepScenario` が null では「編成を見る」が出ない
- (3c) 個別解除で `DFRecruits.count()` が 1 減り、その席の札から 🤝 が消える
- (4a) 約束済みの席の札にだけ `.promised` が付く。⛔ **4 席以外に札が増えていない**
- (4b) `?promises=0` / `?promisemark=0` でそれぞれの追加物が消え、他は不変

### 9-2. 2 経路で突き合わせる ⭐ 片方の写経にしない

- 「約束の人数」は **`DFRecruits.count()`** と **画面のバッジの文字**の 2 経路で突き合わせる
- ⚠⚠ **#58 の教訓 2**: 「定義と実体の 2 経路突き合わせは**両方を動かす変異を捕まえられない**」。
  ⇒ 片方(バッジの文字)は**変異が触れない場所**から採る

### 9-3. 既存 golden の非退行(基準は STEP0 で採る・**測定日を併記**)

**(A) 完全一致で縛る群** —— `#pmDepart` を掴む **10 本**(§2-6)+ `patronLabel` を掴む
**1 本**(`verify_hold_person`)のうち、**§2-11 の 4 本を除いた 7 本**は
**exit / 集計行 / FAIL 行の集合が完全一致**すること。

**(B) ⚠ 意図して書き換える 5 本**(§2-11) —— ラベルを変える以上、**赤くなるのが正しい**。
⛔ 文字列を新ラベルへ写経して緑にするのではなく、§2-11 の表の「言い直し方」に従って
**その assert が守っていた不変条件を保つ形**へ書き換える。書き換えた 5 本は
**書き換え後に素で緑**になること、かつ **§10 の変異で赤くなる**ことの両方を確かめる。

| 道具 | 触る assert | 書き換え後も守る不変条件 |
|---|---|---|
| `driver_party_view_reopen.js` | (1d) / (5a) | 閉じた先は**出発ではない** / iPhone 幅で口が**両方見える** |
| `verify_party_match_setup.js` | (1f) | review と通常で**ラベルが違う** |
| `verify_prep_retire.js` | (5a) | マッチング画面に**その口がある** + (5b) の DOM 順は不変 |
| `verify_recruit_size.js` | (D1) / `tavSrc` の正規表現(`:421`) | 旧語彙「引き直」が**残っていない** / **ナレとボタンの語が一致** |

⭐ **書き換えた 5 本は §14-0 に「書き換え前 / 書き換え後」の両方の集計行を残す**こと
(次の人が「なぜ数字が変わったか」を追えるように)。

⛔ **`driver_party_view_reopen.js:113-114` の逐語置換の 2 行は触らない**(§2-11)。

### 9-4. ⭐ 測らないこと(明記)

- **札の文字サイズ**(12px / 11px)は assert しない — #57 の実機体感 ① で動かす余地を残す
- **戻るボタンの座標・余白**は assert しない — ⚠ ただし #56 の前科があるので
  「**出発の口が画面内に残る**」だけは (1a) で守る

---

## 10. 変異(負のコントロール) — `--negative` で道具に内蔵

⚠ 「注入できたか」でなく **測っている場所に現れるか**まで設計する(#54 の教訓)。

| # | 変異 | 赤くなるべき条件 |
|---|---|---|
| M1 | ⭐⭐⭐ 早期 return の 2 本を `"back"` にする | **(1c)**(§2-1 の罠の唯一の検出器) |
| M2 | ⭐⭐⭐ 再入場を `openPrep` 経由に戻す | **(3a)** |
| M3 | `resolve()` を無記名に戻す | (1b) |
| M4 | 札を全 NPC に出す | (4a) |
| M5 | 解散で `clear()` を呼ばない | (2a) |
| M6 | 戻るボタンを確定前から出す | (1e) |
| M7 | 「編成を見る」に `btnPartyView` の id を使う | (3a) + `driver_party_view_reopen` が赤 |
| M8 | バッジの数字を `RECRUIT_MAX` から引き算で作る(実体を数えない) | (9-2) の 2 経路突き合わせ |

⛔ **空振り 0** が完了条件。1 本でも空振りしたら、その assert は測る場所を間違えている。

---

## 11. changelog(⚠ 必須)

    grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
    # → GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

`tavern.html` を触る ⇒ **鳴る**。⭐ **書けるプレイヤー向けの要約は実在する**(全 STEP が
画面に見える変化)。各コミットの前に:

    py tools/add_changelog.py "<b>見出し</b> — 説明文"

文案(そのまま使ってよい):

- `<b>仲間の顔ぶれを見てから酒場へ引き返せる</b> — 出発の画面から、潜らずに酒場へ戻れるようになった。`
- `<b>同行の約束をその場で解散できる</b> — 声を掛けた仲間との約束を、出発前にまとめて解ける。`
- `<b>誰と約束したか一目で分かる</b> — 酒場に「同行の約束」の一覧が付き、一人ずつ断ることもできる。`

---

## 12. 撤退スイッチ(3 本・**ページ内で完結**)

| スイッチ | OFF のときの姿 | 判定位置 |
|---|---|---|
| `?pmback=0` | 戻るボタンが出ない = **従来どおり出発だけ** | `tavern.html` に 1 箇所(`PREP_SKIP_ON` と同じ作法) |
| `?promises=0` | 常設バッジとパネルが出ない | 同上 |
| `?promisemark=0` | 札の色分けとカードの出自が出ない | 同上 |

⚠ いずれも `tavern.html` 内で完結するのでページ遷移をまたがない
(`?town=0` のような sessionStorage への写しは**不要**)。

---

## 13. やらないこと(別チケット送り)

- ⛔ **候補④「依頼を降りる」**(受注の取り消し)。§1 のとおり不採用
- ⛔ **「募集をかけ直す」を本当に機能させる**(自動抽選へ戻す)。§2-2 のとおり #54 の設計を壊す
- ⛔ **札の文字サイズを変える**。#57 の実機体感 ① の結果を見てから別途
- ⛔ **札を出す席を増やす**(店主 / 酔漢 / 給仕 / 荷運び)。§2-3
- ⛔ **名簿の同一性システム**(同名の別人の区別)。§8-2 で許容と決めた
- ⛔ **`index.html`** / **`js/recruit-candidates.js`** / **`driver_party_view_reopen.js`**
- ⏸ **台帳 `実装依頼書/README.md` の一覧行の追加は #59 着地まで保留**(§2-0)。
  着地後に次の 1 行を足す:

```
| 60 | [2026-09-07_party-match-exit-and-promises.md](2026-09-07_party-match-exit-and-promises.md) | **承認済**(2026-09-07) ⏸ 着手保留 — #59 着地待ち | 0% | マッチング画面に「酒場へ戻る」を作り、#54 で意味を失った「募集をかけ直す」を **`DFRecruits.clear()` の解散**へ差し替える + 酒場に「同行の約束 N/3」の常設パネル(一覧・個別解除・編成を見る)+ 🤝 の色分けとカードの出自。⚠⚠⚠ **最大の罠 = 「閉じるだけ」で実装するとその場で潜る**(`openPrep` が `await` の次の行で無条件に `departToScenario()`)⇒ `resolve()` を `"depart"`/`"back"` へ記名化。⛔ **早期 return の 2 本は `"depart"`**(`"back"` にすると出発が黙って死ぬ = M1)。⭐⭐⭐ 再入場は **`openPartyMatchReview()` 一本**(`openPrep` は `prepIntelUsed` をリセットするので事前情報が引き直せる = M2)。⛔ `#pmDepart` の id は **10 本**が掴む。⛔ 「編成を見る」に `btnPartyView` の id を使わない(`driver_party_view_reopen` が `?prepskip=0` で今も押している)。⭐ 議題「酒場で仲間が分かるように」は **#57 で出荷済み** — 未実装ではない。受入 `verify_party_promises`(新規・base **10161**)。撤退 `?pmback=0` / `?promises=0` / `?promisemark=0` |
```

---

## 14. 着地後に埋める(実装窓が書く)

### 14-0. 母集団の素の基準(STEP0 で採る)

**測定日 2026-09-08 / 基準コミット `8b0108a`(作業ツリー clean を確認してから採取)/ 全本直列**。
非退行の判定は **exit / 集計行 / FAIL 行の集合**の完全一致で見る(#57 / #58 の作法)。

| ドライバ | exit | 集計行(逐語) | FAIL 行 |
|---|---|---|---|
| `driver_action_priority` | 0 | `[driver] RESULT: PASSED 92 / FAILED 0 / PENDING 0` | なし |
| `driver_depart_menu_clean` | 0 | `══════════ 結果: 41/41 PASS ══════════` | なし |
| `driver_equip_compact_ios` | 0 | `=== WORKTREE: 31/31 PASS ===` | なし |
| `driver_party_view_reopen` | 0 | `========== 結果: 35/35 PASSED / 0 FAILED / 0 PENDING ==========` | なし |
| `verify_darkvision` | 0 | `25/25 PASSED   FAILED 0   PENDING 0` | なし |
| `verify_hold_person` | 0 | `31/31 PASSED   FAILED 0   PENDING 0` | なし |
| `verify_party_match_setup` | 0 | `[driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0   (合計 36)` | なし |
| `verify_pm_drawer_fit` | 0 | `75/79 PASSED   FAILED 0   PENDING 4` | なし |
| `verify_prep_retire` | 0 | `30/30 PASSED   FAILED 0   PENDING 0` | なし |
| `verify_quest_walk` | 0 | `25/25 PASSED   FAILED 0   PENDING 0` | なし |
| `verify_recruit_size` | 0 | `══════════ 結果: 82/82 PASS ══════════` | なし |

⭐ **着手前は 11 本すべて緑**(§4 が警戒していた「着手前から赤い 2 本」= `verify_walk_block` /
`driver_speech_v2` は **index.html の swampNovice 由来**で、`#pmDepart` も `patronLabel` も
掴んでいない ⇒ 本チケットの母集団に入らない。⛔ 触っていない)。

**書き換えた本の「書き換え前 / 書き換え後」**(§9-3 (B) の要求):

| 道具 | 書き換え **前**(STEP1 適用直後) | 書き換え **後** |
|---|---|---|
| `driver_party_view_reopen` | `34/35 PASSED / 1 FAILED / 0 PENDING`(`(1d)` が赤) | `35/35 PASSED / 0 FAILED / 0 PENDING` = **素の基準と一致** |
| `verify_party_match_setup` | `PASSED 35 / FAILED 1 / PENDING 0`(`(1f)` が赤) | `PASSED 36 / FAILED 0 / PENDING 0   (合計 36)` = **素の基準と一致** |

**STEP1 着地後の再実走(2026-09-08)**: 母集団 11 本すべてが **exit 0 / 集計行が素の基準と逐語一致 /
FAIL 行 0** = 非退行を 3 点すべてで確認。

**受入 `tools/verify_party_promises.js`(base 10161)**: 素 **13/13 PASSED / FAILED 0 / PENDING 0**。
変異は **m1 → (1c2)(1c3) / m3 → (1b) / m6 → (1e)(1e2)(1d)** で **空振り 0**。
既存の変異も健在を確認: `verify_party_match_setup` **M1 → (1a)(2z)(2a)(2b)** ・
**M8(新設)→ (1f)** / `verify_prep_retire` **switchtwice → (7a)** /
`driver_party_view_reopen` **N1 → (1d)(4c)** ・ **N5 → (1b)(1c)(1d)(1e)(5e)(5f)**。

### 14-1. 依頼書が崩れた点

1. **§9-3 (B)「意図して書き換える 5 本」のうち、STEP1 で実際に赤くなったのは 2 本だけ**。
   `driver_party_view_reopen` (1d) / `verify_party_match_setup` (1f) の 2 本。残り 3 本
   (`verify_prep_retire` (5a) / `verify_recruit_size` (D1) / `verify_recruit_size:421` の `tavSrc`)は
   **「募集をかけ直す」のラベルを変える STEP2 の担当**で、STEP1 では 1 assert も動かない
   (実測: `verify_prep_retire` 30/30 / `verify_recruit_size` 82/82 のまま)。

2. ⭐⭐⭐ **orchestrator が §2-11 の表の外で見つけた `driver_party_view_reopen:535` (4c) は、
   実測でも「素は緑のまま空振りへ落ちる」だった。** `n1b.hint.indexOf('準備へ戻る') < 0` は、
   逐語の語が本番から消えた瞬間に **恒真**になる。⛔ 素の色を見ているかぎり気づけない。
   ⇒ 逐語をやめ **`n1b.hint !== o1.hint`**(§1 で実測した review の待ち文言そのものと比べる)へ
   言い直した。副産物として **N1 が (1d) だけでなく (4c) も赤くする**ようになり、
   検出力は減るどころか増えた(実走で確認 = `33/35 PASSED / 2 FAILED`)。

3. ⚠⚠⚠ **§2-11 の表に無い「壊れる golden」が 2 本あった —— assert ではなく *変異アンカー* が腐る型。**
   - `verify_party_match_setup.js:157` M1 のアンカー `if (!setupOn && gateOpen) close();`
     (§5-1 の記名化で `close("depart")` へ変わる)
   - `verify_prep_retire.js:187` switchtwice のアンカー `if (PREP_SKIP_ON) { departToScenario(); return; }`
     (§5-2 の分岐で変わる)

   どちらも **素の実走では緑のまま**で、`--negative` を叩いて初めて **exit 3**(アンカー腐敗)になる。
   ⭐⭐⭐ **一般形 = 「その行を文字列で握っている検証器」は assert だけでなく *変異アンカー* にも居る。**
   ⇒ 本番の 1 行を書き換えたら、必ず `grep -rn -F '<旧行>' tools/*.js` を通す
   (この 2 本はまさにそれで見つけた。⛔ 素の実走だけでは 1 度も赤くならない)。

4. ⭐⭐ **`verify_party_match_setup` の (1f) は #29 以来どの変異にも守られていなかった。**
   同ドライバの変異 7 本のうち review のラベルに触れる物が **0 本**。⇒ 言い直しのついでに
   **M8(review でも通常と同じラベルを出す)を新設**して空白地帯を塞いだ。
   §2-13 の「前のチケットが測らなかった所が golden の空白地帯になる」の実例がもう 1 件増えた。

5. ⭐⭐⭐ **§10 の M1 は、受入条件 (1c)(通常の出発)だけでは原理的に空振りする。**
   早期 return の 2 本は通常の導線では **1 度も通らない**ため。⇒ 腕を 2 つ新設して初めて赤くなった:
   - **(1c2)** `#partyMatchOverlay` を DOM から外してから受注する(= `!overlay` の枝)
   - **(1c3)** 受注ナレの最中に `selection.partyMembers` を空にする(= `!raw.length` の枝。
     ⭐ 描画は済んだ後なので render 系が空配列で落ちる副作用を持ち込まない)

   実測: M1 で赤くなったのは **(1c2)(1c3) の 2 本だけ**((1c) は緑のまま)。
   ⭐ 一般形 = #59 の「その変異が現れる盤面を先に作ってから注入する」の **早期 return 版**。

6. ⭐ **M6 は担当の (1e)(1e2) に加えて (1d)(`?pmback=0`)も赤くする。**
   「確定前から出す」置換が撤退スイッチの判定より **下流**で `hidden` を外すため。
   ⛔ 机上の担当表では書けない値(実走で確定 = `10/13 PASSED / 3 FAILED`)。

7. ⭐ **`departToScenario` は `window` 経由で差し替えられる**(script 直下の `function` 宣言 =
   グローバル束縛そのもの。裸の呼び出し側も差し替えを見る)。⇒ (1b)(1c) を **門番の外側**
   (`PREP_SKIP_ON` / `isRecruitTalkOn()` の上流)で測る手段が実在した。
   ⛔ 「画面がどう閉じたか」で測っていたら #58 の永久緑を踏んでいた。

8. ⚠ **§2-9 の「10161 は空き」は正しかった**(実リッスン 0 本・`ERR_UNSAFE_PORT` も出ず)。
   ⇒ `verify_party_promises` は **10161**(変異の子 10162〜10164)。
   ⭐ memory のポート台帳どおり **次の新規ドライバは 10181 以降**。

9. ⚠ **iPhone 390×844 では「🍺 酒場へ戻る」は画面の外**(実測 `backRect.top=1128` / `innerH=844`)。
   `#pmDepart` は sticky なので画面内に残る((1a2) で実測済)が、戻るの口はスクロールしないと見えない。
   ⭐ これは #55 の `#pmBtnReroll` から続く既存の性質で、§9-4 が「寸法は測らない」と決めているので
   **assert しない**。⇒ 14-2 の実機体感へ送る。

### 14-2. 残り = 実機体感

0. ⭐ **iPhone 縦持ちで「🍺 酒場へ戻る」が画面の外**(14-1 の 9)。指でスクロールしないと届かない。
   #55 の「募集をかけ直す」も同じ性質なので、直すなら 2 つまとめて(帯を sticky にする等)。
   ⛔ 本チケットでは寸法を assert しないと決めたので手を付けていない。
1. 「酒場へ戻る」が**出発の口と押し間違わない**間隔か
2. 戻る → 常設パネル → 編成を見る、で**同じ顔ぶれが出る**か
3. 解散の確認が**縦持ちで画面内に収まる**か
4. `.promised` の金枠が **12px でも判別できる**か(⭐ #57 実機体感 ① と同時に見る)
5. カードの「🤝 酒場で声を掛けた」が**カードを縦に伸ばしすぎていない**か(#56 の前科)

---

### 14-3. STEP2(項目2)の実測 — 2026-09-08

**実装**(`tavern.html` のみ・+116/−9):

- `#pmBtnReroll` の**ラベルと行き先を `bindRerollBtn` の 1 箇所**で決める
  (`pmRerollLabel()` = `isRecruitTalkOn() ? "🤝 約束を解散する" : "📣 募集をかけ直す"`)。
  ⛔ `doRecruitReroll()` は消していない。⛔ **markup の開始タグは 1 文字も触っていない**
  (`verify_prep_retire:175` の `noreroll` 変異が逐語で掴んでいるため。ラベルは JS で差し替える)。
- 解散の実体 `doPromiseDisband()` = `DFRecruits.clear()` → `regeneratePartyMembers()` →
  `renderPartyPreview()` → `pmRebuildRef()` → 卓の頭上札を `patronLabelPaint` で引き直し。
- 確認シートは **#54 の `#soloConfirm` を `openConfirmSheet()` へ一般化**して使い回した
  (⛔ 新規ダイアログ 0 個)。既定の文面は **markup が唯一の正**のまま(起動時に控えて既定へ書き戻す)
  ⇒ 単身出発の確認は 1 文字も変わらない。
- 受注ナレ(`PREP_ONBOARDING_NARRATION`)のボタン名は `pmRerollWord()` から引く
  (= ラベルと**同じ源**。文字列を 2 度書かない)。

**受入 `tools/verify_party_promises.js`**: 13 → **19 assert**((0c)(2z)(2c)(2a)(2d)(2b) を追加)。
素 **19/19 PASSED / FAILED 0 / PENDING 0**。`--negative` は **5 本すべて空振り 0**:
`m1 → (1c2)(1c3)` / `m3 → (1b)` / **`m5 → (2a)`** / **`m5w → (2d)`(新設)** / `m6 → (1e)(1e2)(1d)`。

**母集団の非退行(§14-0 の 11 本 + `verify_recruit_talk`)**: 全 12 本 **exit 0 / FAIL 行 0**、
集計行は §14-0 と**逐語一致**(`verify_recruit_size` は (S10) を言い直した後も **82/82** で件数不変)。
⭐ `verify_recruit_talk` は §14-0 に無い本(`#soloConfirm` を触るので追加した)= **`25/25 PASSED
FAILED 0 PENDING 0`** を新規に記録する。
関連する既存変異の健在も確認: `verify_prep_retire` **noreroll → (5a)** / **switchtwice → (7a)**。

### 14-4. 依頼書 / 指示が崩れた点(項目2)

1. **ナレの行番号は 3 度ズレた。** 依頼書 §6-5 は `:7624`、実装窓への指示は「#59 の着地で +6 = `:7630`」
   としていたが、**実測は `:7659`** —— STEP1 の着地(`28e9643`)でさらに **+29** 動いていた。
   ⭐ 一般形 = **行番号は「前のチケット」だけでなく「自分の 1 つ前の STEP」でも動く**。
   識別子(`PREP_ONBOARDING_NARRATION`)で引くこと。

2. ⭐⭐⭐ **§2-11 / §9-3 (B) が「STEP2 で赤くなる」と名指しした残り 3 本は、1 つも赤くならなかった。**
   3 本とも**測っている口か走らせている腕が違う**:

   | 道具 | 依頼書の予測 | 実測 | 理由 |
   |---|---|---|---|
   | `verify_prep_retire (5a)` | 赤 | **緑 30/30** | URL が `/tavern.html?recruittalk=0`(`:277`)= 撤退の腕。そこではラベルも行き先も従来のまま |
   | `verify_recruit_size (D1)` | 赤 | **緑 82/82** | 押しているのは **`#btnReroll`(準備画面)**。しかも全ページ `withAutoParty()` で `?recruittalk=0` |
   | `driver_party_view_reopen (5a)` | 赤 | **緑 35/35** | 同じく **`#btnReroll`**(assert 名に「📣 募集をかけ直す」と書いてあるだけ。`#pmBtnReroll` は 1 度も掴んでいない) |

   ⭐⭐⭐ **一般形 = 「ラベルを変えると壊れる golden」を *語* で数えると必ず外れる。**
   絞り込みは **① どの id を掴んでいるか ② どの腕(URL)で走っているか** の 2 段で決まる。
   ⇒ `grep -rn "<語>" tools/*.js` の次に、**必ずヒット行の周辺で `getElementById` の引数と
   URL 構築関数を読む**。

3. ⚠⚠⚠ **代わりに、§2-11 の表に無い本が 1 本「偽の緑」として腐っていた** ——
   `verify_recruit_size (S10)` の `/「募集をかけ直す」/.test(tavSrc)`。
   ナレから語を消しても **`tavern.html` のコメントに同じ語が 6 箇所**残る(壊した状態で実測 = 6 箇所)
   ので、**素の実走では永久に緑**。⛔ 色を見ているかぎり気づけない型。
   ⇒ 守っていた不変条件「**ナレが名指しする口の名 == 実際に出るボタンのラベル**」を、
   ソースの写経ではなく **実行時の 2 経路突き合わせ**(`PREP_ONBOARDING_NARRATION` の「」の中身と
   `#pmBtnReroll` のラベル)へ移した。⛔ 新ラベルの写経はしていない。
   **反証可能性も実測**: ナレの語だけを「仲間を募る」へ desync させると
   **81/82・(S10) が赤・exit 1**(旧式の regex ならこの状態でも緑だった)。

4. ⭐⭐ **「既存の器を再利用」の唯一の候補 `#soloConfirm` は z-index 101 = マッチング画面(210)の下。**
   そのままでは確認シートが**演出の裏に隠れて 1 度も見えない**(#55 の「z-index の罠」の再演)。
   ⇒ **230** へ。⭐ #57 が `#skillCheckOverlay` を 220 へ上げたのと同型。
   ⚠ `#tavern` は `position:relative` だが **`z-index` を持たない = 積み重ね文脈を作らない**ので、
   その子でも root の文脈で 210 を超えられる(実測: 確認ボタンの `elementFromPoint` = `btnSoloGo`)。

5. ⭐⭐ **既定 ON 側は golden の空白地帯だった。** 母集団 12 本のうち **5 本が明示的に `?recruittalk=0`**
   を付けており、STEP2 の非退行はほぼ自動的に成立する。裏を返すと
   **「声を掛けた仲間だけで組む」既定の姿を測る本が 1 本も無い**(`verify_recruit_talk` を除く)。
   ⇒ (2d) と変異 `m5w` で塞いだ。§2-13 の「前のチケットが測らなかった所が空白地帯になる」の実例が
   もう 1 件。

6. ⭐ **変異表は §10 の 8 本では足りず、9 本目 `m5w` を新設した。**
   §10 に「ナレとラベルの一致」を守る変異が 1 本も無く、(2d) が裸のまま残るため。
   #57 の M8 新設・#59 の m2s 新設に続く **3 例目** = **言い直した assert を裸で残さない**。

7. ⭐ **`--negative` の担当表どおりに切れた**(m5 は (2a) だけ・(2z)(2c) は緑のまま)。
   これは「**押せた**(2z) と **効いた**(2a) を別の assert に割った」設計の効果で、
   1 本に畳んでいたら「どこが壊れたか」が読めなくなっていた。

8. ⚠ 依頼書 §6-2 は「確認を 1 枚挟む」としか書いていないが、**キャンセル側の既定の枝**に注意。
   `#soloConfirm` の「戻る」は元々 `closeDialog()`(依頼カードも閉じる)を呼ぶので、
   解散の確認では **空の `onCancel` を明示的に渡す**必要がある(渡さないと演出の裏で依頼カードが閉じる)。

### 14-5. 残り = 実機体感(項目2 で増えたぶん)

6. 「🤝 約束を解散する」と「🍺 酒場へ戻る」が**同じ行に 2 つ並ぶ**(`#pmRerollRow` の `gap: 14px`)。
   縦持ちで押し間違えないか。
7. 解散の確認シートの文面(「いま同道を約した N 名との約束を、まとめて解く。」)が
   **語り口として浮いていないか**。
8. 解散した直後に**卓の頭上札から 🤝 が消えている**ことが、演出を閉じた後に目で分かるか。

### 14-6. STEP3(項目3)の実測 — 2026-09-08

**実装**(`tavern.html` のみ・**+254 / −0**。⭐ 既存行を 1 行も書き換えていない = 純粋な挿入):

- 常設バッジ `#promisesBadge`(`🤝 N / 3`)を **左上の縦列の 4 段目**へ(`top:130px`、
  記録棚が出ている間だけ兄弟セレクタ `#chronicleShelf.show ~ #promisesBadge` で `186px`)。
  ⛔ `#townExit` / `#chronicleShelf` / `#rosterEntry` の座標は 1 バイトも動かしていない。
- 一覧パネル `#promisesOverlay`(**z-index 190** = `#rosterOverlay`(180) と `#prologueOverlay`(200) の
  間の空き番地)。中身 = 一覧 / 行ごとの「断る」/「🎴 編成を見る」/「閉じる」。
  器は `#rosterOverlay` の型をそのまま写した(⛔ 新しいカラー変数も新しい器も作っていない)。
- 「編成を見る」= `openPartyMatchReview()` **一本**。id は `#promisesViewParty`(⛔ `btnPartyView` 不使用)。
- 個別解除 = `DFRecruits.remove(name)` → 席の本人を引き直して `refreshPatronLabelFor` →
  `doRecruitReroll()`(名簿→編成の引き直し。⛔ 抽選の写しを作らない)→ バッジとパネルを再描画。
- 撤退 `?promises=0` = `PROMISES_ON`(判定 1 箇所)。OFF ではバッジもパネルも **DOM ごと remove**。

**受入 `tools/verify_party_promises.js`**: 19 → **27 assert**((0d)(0d2)(3z)(3a)(3b)(3c)(3d)(3e) を追加)。
素 **27/27 PASSED / FAILED 0 / PENDING 0**。`--negative` は **8 本すべて空振り 0**:
`m1 → (1c2)(1c3)` / `m3 → (1b)(3a)` / `m5 → (2a)` / `m5w → (2d)` / `m6 → (1e)(1e2)(1d)` /
**`m2 → (3a)`** / **`m7 → (3a)(3b)(3z)`** / **`m8 → (3d)`**。

**母集団の非退行(12 本)**: 全本 **exit 0 / FAIL 行 0**、集計行は §14-0(+ §14-3 の
`verify_recruit_talk`)と **逐語一致**。
`driver_action_priority 92` / `driver_depart_menu_clean 41/41` / `driver_equip_compact_ios 31/31` /
`driver_party_view_reopen 35/35` / `verify_darkvision 25/25` / `verify_hold_person 31/31` /
`verify_party_match_setup 36` / `verify_pm_drawer_fit 75/79(PENDING 4)` / `verify_prep_retire 30/30` /
`verify_quest_walk 25/25` / `verify_recruit_size 82/82` / `verify_recruit_talk 25/25`。

⭐⭐ **母集団の外へ 4 本広げた**(#47 / #55 の「母集団は 1 本の grep で決めるな」に従い、
**酒場の HUD を新しく 1 枚増やす**変更なので左上の縦列と DOM 署名を測る本を足した)。全部緑:
`verify_mercenary_roster 44/44`(⭐ (4e)(4f) が `#townExit` / `#chronicleShelf` / `#rosterEntry` の
座標と hit-test を測っている)/ `verify_run_chronicle 73` / `verify_npc_crowd 32/32` /
`verify_tavern_map 43/43`(⭐ (6c) の DOM 署名は `dialog` / `prep` / `shopScreen` / `plazaScreen` の
4 根だけを見るので、**#tavern 直下へ足したバッジとパネルは宣言表 `DOM_ADDED` に追記不要**だった)。

### 14-7. 依頼書 / 指示が崩れた点(項目3)

1. ⚠⚠⚠ **「個別解除では `refreshPatronLabelFor(m)` が使える」は、そのままでは成立しない。**
   一覧の行が握っているのは `DFRecruits.all()` = **localStorage から起こし直した写し**で、
   `refreshPatronLabelFor` は `todaysPatrons[k] !== m` の **同一性**で席を引く。
   ⇒ 一覧の行からそのまま渡すと **札が 1 枚も塗り替わらない**((3c) が空振り)。
   ⇒ 名前から席の本人を引き直す `promisesSeatMemberByName()` を 1 枚挟んだ。
   ⭐⭐⭐ **一般形 = 「保管庫から読んだオブジェクト」と「画面が握っているオブジェクト」は別物。**
   同一性で引く既存関数へ、保管庫由来の値を渡してはいけない。
   (#54 の勧誘ダイアログでは `recruitPending` が席の本人そのものだったので成立していた
    ＝ **先例が動いていたことは、次の呼び口でも動く根拠にならない**。)

2. ⭐⭐ **受入 (3c) は「約束を焼く元」を間違えると原理的に空振りする。**
   項目1 が書いた既存の `seedRecruits()` は `pickCompanion` で **新顔**を作るので、
   卓の 4 席には座っていない ⇒ 札に 🤝 が付かず「消えたこと」を測れない。
   ⇒ 腕 I では `todaysPatrons` から焼く専用の腕を作った。
   ⭐ #59 の「その変異が現れる盤面を先に作ってから注入する」の **受入条件版**。

3. ⭐⭐ **M7 は担当の (3a)(3z) に加えて (3b) も赤くする**(実走 = 24/27)。
   「未受注では編成を見るを出さない」の assert が **器の在否**も併せて見ているため、
   id ごと消える変異に反応する。⛔ 机上の担当表では書けない値。

4. ⭐⭐ **(3a) は「開いたか」だけでも「保たれたか」だけでも足りない。**
   ・「保たれたか」だけ ⇒ **押せなければ何も起きず自明に保たれる**(M7 が緑になる)。
   ・「開いたか」だけ ⇒ **openPrep 経由でも演出は開く**(M2 が緑になる)。
   ⇒ 2 つを **対で** 縛って初めて M2 と M7 の両方が赤くなった。
   ⚠ 実測の副産物: M2 では `depVis=false` にもなる —— review は `finishReveal()` で即座に
     猶予へ入るが、`openPrep` 経由は開示を待つので 12 秒では出発の口が出ない。
     **「どちらの経路で開いたか」が猶予の出方に現れる**。

5. ⭐ **依頼書 §7-4「パネルを flex 子にしない」は、そのままでは実装できない。**
   全画面オーバーレイの中央寄せは flex が唯一の作法(`#rosterOverlay` / `#chronicleOverlay` /
   `#soloConfirm` の全先例)で、羊皮紙は必ず flex 子になる。
   ⇒ 守るべき真の不変条件は #56 の**真因**の方 = 「`overflow-y:auto` を持つ flex 子に
   `min-height:0` が無い」。⇒ スクロールするのは `#promisesBody` **だけ**・`min-height:0` を明示・
   見出しと操作列は `flex:0 0 auto`。実測で 2 つの口は画面内に残った((3z))。
   ⭐ 一般形 = **「その形を使うな」と書かれた指示は、たいてい「その形の *真因* を避けろ」の言い換え**。
   先例が全部その形なら、禁じられているのは形ではない。

6. ⭐ **バッジの数字は「開いたとき」にも引き直す設計にした。** 名簿は #54 の勧誘ダイアログ /
   解散 / 個別解除の 3 箇所から動くので、そこからも `paintPromisesBadge()` を呼ぶが、
   **保管庫を直接いじった場合(検証ドライバ / 別タブ)はバッジが古いまま**になる。
   ⇒ `openPromisesPanel()` の冒頭で必ず引き直す。⚠ そのため (3d) は「パネルを開いた時点」の
   値で 2 経路を突き合わせている。

7. ⚠ **ポート**: 変異が 5 → **8 本**になったので子プロセスは **10162〜10169**。
   単発の確認で 10171〜10173 を使った。⭐ memory の台帳どおり **次の新規ドライバは 10181 以降**。

8. ⭐ **バッジの置き場所は「空いている段」ではなく「他を覆わない段」で決めた。**
   左上の縦列は #12 / #37 / #38 が使い切っており、4 段目 (130px / 186px) が唯一の空き。
   ⛔ 矩形の重なりでは判定しない —— (0d) は **`elementFromPoint`** で `#townExit` と
   `#rosterEntry` が今も自分を返すことを見ている(#12 の教訓)。

### 14-8. 残り = 実機体感(項目3 で増えたぶん)

9.  常設バッジ `🤝 N / 3` が **左上の縦列 4 段目**に増えたことで、縦列が長くなりすぎていないか
    (iPhone 縦持ちで `top:130px`〜`174px`。記録棚が出ていると `186px`〜`230px`)。
    ⭐ 機械では「画面内に居て指が当たる」((0d)(0d2))までしか測っていない。
10. 一覧パネルの行(`職アイコン + 名前(職名)` + 「断る」)が、**3 人並んでも縦に伸びすぎない**か。
11. 「断る」を押した直後に **卓の頭上札から 🤝 が消える**のが、パネルを閉じる前に見えるか
    (パネルが酒場を覆っているので、閉じてからでないと分からない可能性)。
12. 「編成を見る」で開き直した演出が **戻る前と同じ顔ぶれ**か(⭐ 14-2 の 2 と同じ観点。
    今回は機械で `prepIntelUsed` の保持までは測ったが、**カードの中身は測っていない**)。

### 14-9. ⛔ 項目3 が測っていないもの(明記)

- **札の文字サイズ**(#57 の実機体感 ① が未消化)。§9-4 の宣言どおり 1 assert も置いていない。
- **バッジ / パネルの寸法・余白**。測ったのは「画面内に収まる」「指が当たる」「既存の導線を
  覆っていない」の 3 点だけ。⭐ ただし #56 の前科があるので、この 3 点は**必ず**測っている。
- **`?promisemark=0`(STEP4)**。まだ実装していない = 撤退スイッチは 2 本
  (`?pmback=0` / `?promises=0`)のみ。
