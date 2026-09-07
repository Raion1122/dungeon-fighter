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

`#pmDepart` を掴む **10 本**(§2-6)+ `patronLabel` を掴む **1 本**(`verify_hold_person`)は
**exit / 集計行 / FAIL 行の集合が完全一致**すること。

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

### 14-1. 依頼書が崩れた点

### 14-2. 残り = 実機体感

1. 「酒場へ戻る」が**出発の口と押し間違わない**間隔か
2. 戻る → 常設パネル → 編成を見る、で**同じ顔ぶれが出る**か
3. 解散の確認が**縦持ちで画面内に収まる**か
4. `.promised` の金枠が **12px でも判別できる**か(⭐ #57 実機体感 ① と同時に見る)
5. カードの「🤝 酒場で声を掛けた」が**カードを縦に伸ばしすぎていない**か(#56 の前科)
