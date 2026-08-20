# タイトル画面 `title.html` の新設 + 名乗り(主人公選択)の移設

**ステータス**: 起草済(未承認)
**依存**: ⚠ **`2026-08-20_save-slots.md`(A)の完了が前提。** A の `DFSlots` API を使う
**撤退スイッチ**: `?title=0`(title.html を素通りして酒場へ) / `?herolock=0`(酒場でのクラス変更を復活)

---

## 目的

いま `ゲームを起動.vbs` を叩くと**いきなり銀の鹿亭の中**にいる。ここに開始画面を前置きする。

```
起動 → title.html
         ├─「つづきから」(スロット1/2/3)          → tavern.html
         └─「はじめから」(スロット選択 → 名乗り)  → tavern.html(前口上が自動で流れる)
```

主人公は 1 人。**名乗り(クラス選択)はここでしか行えず、以後は変更できない。**

---

## 背景・現状

### いまの入口

[ゲームを起動.vbs](../ゲームを起動.vbs) が `http://localhost:8765/tavern.html` を開く。
`tavern.html`(6,275 行)が銀の鹿亭、`index.html`(35,188 行)が潜行画面。

### すでにあるもの(作り直さない)

| 資産 | 場所 | 本依頼書での扱い |
|---|---|---|
| 前口上(フランの記録) | [tavern.html:5732](../tavern.html#L5732) `initTavernPrologue()` + `#prologueOverlay` + `playNarration()` + VOICEVOX manifest | **酒場に残す。title.html へ移設しない**(下記) |
| 主人公 1 人縛り | [tavern.html:3776](../tavern.html#L3776) `partyComposition = ["warrior"]` / [3844](../tavern.html#L3844) `partyComposition = [hero]` | そのまま。書き込む場所が title.html に増えるだけ |
| クラス選択 | [tavern.html:4418](../tavern.html#L4418) `selectHero()` | 関数は残す。酒場からの**呼び出しだけを封じる** |
| 新規ゲーム(消去) | 依頼書 A の `DFSlots.newGame(n)` | そのまま呼ぶ |
| 酒場への戻り | [index.html:13157](../index.html#L13157) / [13158](../index.html#L13158) / [34558](../index.html#L34558) / [34615](../index.html#L34615) の 4 箇所が `tavern.html` へ直行 | ⚠ **1 箇所も触らない。** ダンジョンから戻るたびにスロット選択させられる地獄を作らない |

### 前口上を title.html へ移さない理由(重要な設計判断)

`#prologueOverlay` は羊皮紙の CSS も `playNarration()` も VOICEVOX の manifest 読み込みも**すべて酒場側の資産**。
3 枚目のファイルへ複製すると `tavern.html` / `index.html` の二重同期に**もう 1 本増える**。

代わりに:

1. `title.html` は「スロット選択 → 名乗り」までで終わり、`tavern.html` へ飛ばす
2. 新規なら `DFSlots.newGame()` が `dragonfighters.prologueSeen` ごと消している
3. → 酒場の `initTavernPrologue()` が**何も足さなくても自動で語り出す**

プレイヤーから見れば連続した 1 本の流れになる。**しかも title.html が軽くなる**(ロゴ・スロット 3 枚・クラスカード 6 枚だけ)。

---

## 変更範囲

### 新規作成 1: `title.html`

読み込むもの(これ以上増やさない):

```html
<script src="js/save-slots.js"></script>   <!-- 依頼書 A -->
<script src="js/hero-classes.js"></script> <!-- 下記・新規 -->
<script src="audio.js"></script>           <!-- 効果音のみ。BGM は鳴らさない(下記) -->
```

#### 画面 1: スロット選択

- タイトル(**Phase 1 は文字組みのみ。ロゴ画像は作らない** — codex1 への別依頼)
- スロット 3 枚。`DFSlots.list()` の結果で描く

| 状態 | 表示 | ボタン |
|---|---|---|
| 空 | 「―― 記録なし ――」 | 「はじめから」 |
| 埋 | 職業名 / Lv / 所持金 / クリア数 / 最終プレイ日時 | 「つづきから」 と 「はじめから(上書き)」 |

- ⚠ 埋まっているスロットの「はじめから」は **2 段タップ確認**。
  1 回目で「このスロットの記録を消して最初から始めます」の確認行を出し、
  **8 秒無操作なら安全側(未確認)へ自動復帰**する。
  この 2 段タップ + 8 秒復帰は [tavern.html:5255 付近](../tavern.html#L5255) の
  『冒険の記録を消す』が既に実装している作法。**同じ挙動に揃える**

#### 画面 2: 名乗り(「はじめから」でのみ表示)

- 見出し: 「汝は何者か」
- 6 枚のカード。各カードは `js/hero-classes.js` の `tagline`(一人称の答え)を出す
- **1 タップ目**でカードが選択状態になり、その下に `zone` / `role` / `note` が開く
  (詩 → 数字ではなく **詩 → 役割**。数値の二重管理を避けるため。理由は下記)
- **2 タップ目**(=「この者として旅立つ」ボタン)で確定
- ⚠ カード群の下に**常時**この 1 行を出す:

  > **この選択は後から変えられません。** 職業を変えるには、新しく「はじめから」を始める必要があります。

#### 遷移

| 操作 | 処理 |
|---|---|
| つづきから(スロット n) | `DFSlots.switchTo(n)` → `location.href = "tavern.html"` |
| はじめから(スロット n) | `DFSlots.newGame(n)` → `localStorage.setItem("dragonfighters.partyComposition", JSON.stringify([classKey]))` → `location.href = "tavern.html"` |

⚠ **遷移先にクエリを足さない。** 素の `tavern.html` へ飛ばす。
前口上が流れる条件は「`prologueSeen` が無いこと」だけで足りる(`newGame` が消しているため)。
クエリを足すと「ダンジョンから戻る」導線と形が変わり、酒場の入口が 2 種類になる。

#### 音(Phase 1 の方針)

- **BGM は鳴らさない。** 既存の `tavern` を鳴らすと、`tavern.html` へ遷移した瞬間に**同じ曲が頭出しに戻る**(ページごとに AudioContext が別)。しゃっくりが出るくらいなら無音のほうが粗が少ない
- **効果音だけ鳴らす。** 最初の `pointerdown` で `GameAudio.unlock()` を呼び(iOS Safari 必須)、ボタンには `GameAudio.playSfx("button")` を付ける
- タイトル専用 BGM は**別チケット**(`audio.js` に `title` シーンを追加 + 魔王魂等から mp3 調達)。**本依頼書のスコープ外**

### 新規作成 2: `js/hero-classes.js`

タイトルの名乗りカードに出す**表示専用データ**。`window.HERO_CLASSES` を生やす。

```js
window.HERO_CLASSES = [
  { classKey: "warrior", name: "戦士",     zone: "front",
    tagline: "「剣を取った。理由は、それしか持っていなかったからだ。」",
    role: "前衛・盾で受ける", note: "被弾のたびに盾で受け返す。最も素直に強い" },
  { classKey: "dwarf",   name: "ドワーフ", zone: "front",
    tagline: "「山は落ちた。だが、山の民は落ちていない。」",
    role: "前衛・打ち合う",   note: "重い一撃と粘り強さ。罠と石造りに明るい" },
  { classKey: "cleric",  name: "僧侶",     zone: "mid",
    tagline: "「神は黙したままだ。ならば、この手が答える。」",
    role: "中衛・癒やす",     note: "傷を塞ぎ、不死者を退ける。長い探索に効く" },
  { classKey: "mage",    name: "魔法使い", zone: "rear",
    tagline: "「言葉には重さがある。私は、その量り方を知っている。」",
    role: "後衛・撃ち抜く",   note: "打たれ弱いが、届く距離と手数が違う" },
  { classKey: "elf",     name: "エルフ",   zone: "mid",
    tagline: "「森は焼けた。矢は、まだ残っている。」",
    role: "中衛・射る",       note: "弓と小魔法の両刀。器用に立ち回る" },
  { classKey: "rogue",   name: "盗賊",     zone: "mid",
    tagline: "「表から入る奴は、鍵の値打ちを知らない。」",
    role: "中衛・忍ぶ",       note: "影に隠れて急所を突く。錠前と罠の専門家" },
];
```

⚠ **数値(HP / AC / 命中)を書かない。** 実数は `index.html` の `CLASS_DEFS` が持っており、
ここに書き写すと**必ず腐る**。役割と持ち味だけを言葉で書き、
「どれが強いのか分からない」という初見の詰まりはそれで解く。

⚠ `zone` は表示用だが、**`PARTY_ZONES` と一致していなければ嘘になる**。受入条件 6. で機械的に突き合わせる。

### 既存ファイルの変更

| ファイル | 変更 |
|---|---|
| [ゲームを起動.vbs](../ゲームを起動.vbs) の `url =` 行 | `.../tavern.html` → `.../title.html` |
| [tavern.html:4409](../tavern.html#L4409) 付近 `renderPartyComposition()` | `if (!isHero) el.addEventListener("click", () => selectHero(slot.classKey));` を **`?herolock=0` の時だけ**付けるようにする。通常時は非主人公タイルを `.locked-out`(押せない見た目)にし、`title` 属性に「主人公は変更できません(新規ゲームで選び直せます)」を出す |
| [tavern.html:4418](../tavern.html#L4418) `selectHero()` | **関数は残す**(`?herolock=0` 経路とデバッグで使う)。削除しない |

### 触らないと決めたファイル

- **[index.html](../index.html) — 1 行も触らない。** 特に `tavern.html` へ戻る 4 箇所(`13157` / `13158` / `34558` / `34615`)
- `audio.js` — タイトル BGM は別チケット
- [tavern.html:5732](../tavern.html#L5732) `initTavernPrologue()` — **無改修で動く**のが本設計の眼目
- [tavern.html:4468](../tavern.html#L4468) 「仲間を引き直す」— これは**仲間の抽選**であって主人公変更ではない。残す

---

## 受入条件

新規ドライバ `tools/verify_title_screen.js`。冒頭で必ず `require('./_pptr_profile')`。

### 機能

1. `title.html` が**スロットを 3 枚**描く。全消し状態では 3 枚とも「記録なし」+「はじめから」のみ
2. **新規の一周**: スロット1 で「はじめから」→ 名乗りで `rogue` を選ぶ → 確定 → `tavern.html` に着く →
   `localStorage["dragonfighters.partyComposition"] === '["rogue"]'` かつ **`#prologueOverlay` が表示されている**
   (前口上を移設していないことの証明でもある)
3. **続きの一周**: スロット1 に進行を作り、スロット2 で別の主人公の新規を始めてから、
   title に戻ってスロット1 の「つづきから」→ **スロット1 の xp と主人公が戻る**
4. 埋まっているスロットの「はじめから」は **1 タップでは消えない**(確認行が出るだけ)。2 タップ目で消える
5. `tavern.html` で非主人公のクラスタイルをクリックしても `partyComposition` が変わらない
6. **`js/hero-classes.js` の `zone` が、`tavern.html` の `PARTY_ZONES` と 6 職すべてで一致する**
   片方の写経ではなく **2 経路の突き合わせ**。さらに `PARTY_ZONES` が実際に 6 キーを持つことを装置 assert で添える
   (突き合わせ相手が空でも緑になる穴を塞ぐ)

### 装置 assert(検出器が空振りしていない証明)

7. `?herolock=0` を付けると **5. が落ちる**(= クラスが変わる)こと
8. `title.html?title=0` は**即座に `tavern.html` へ抜ける**こと。かつ 1.〜4. のテストが**落ちる**こと

### 実機・見た目

9. 幅 390px(compact)と横長デスクトップの**両方**で、スロット 3 枚とクラスカード 6 枚が
   **横スクロールを出さずに**収まる
   ⚠ 過去に compact 390 だけで測って横長デスクトップの欠陥を 2 つ見逃した事例がある。**両方で測る**
10. 最初のタップで `GameAudio.unlock()` が呼ばれている(iOS Safari の音声解錠)。
    **BGM は鳴らない**ことも併せて測る(Phase 1 の方針どおりか)

### 既存の非退行

11. 既存の golden ドライバ群が **HEAD と同じ結果**を返すこと。
    ⚠ `tavern.html` の DOM を触る(タイルの class 追加)ので、**canvas の SHA しか見ない golden では検出できない**。
    タイルの `class` と click リスナの有無は 5. / 7. で直接測る

---

## やらないこと(スコープ外)

- **ロゴ画像を作らない**(Phase 1 は文字組み。画像は codex1 への別依頼)
- **タイトル専用 BGM を足さない**(`audio.js` の別チケット)
- 前口上を `title.html` へ移設**しない**
- `index.html` を**触らない**
- 「設定」「クレジット」「ギャラリー」などタイトルのメニュー拡張
- セーブのエクスポート/インポート
- 名乗りに合わせた開始装備の差し替え(いまも職業別に配られているので不要)

---

## 実装ステップ(順序)

1. `js/hero-classes.js` を作る。まず `tools/verify_title_screen.js` の 6.(`PARTY_ZONES` 突き合わせ)だけ通す
2. `title.html` を作る。スロット選択のみ(名乗りなし)、「つづきから」だけ動く状態にする → 1. / 3. を通す
3. 名乗り画面を足す → 2. を通す
4. 埋まったスロットの 2 段タップ確認を足す → 4. を通す
5. `ゲームを起動.vbs` の飛び先を差し替える。**手で 1 回起動して**、新規と続きの両方を通す
6. `tavern.html` のクラス変更を封印 → 5. / 7. を通す
7. 390px と横長デスクトップの両方で 9. を測る
8. 既存 golden を回して 11. を確認

---

## リスクと対策

| リスク | 対策 |
|---|---|
| ダンジョンから戻るたびにタイトルを経由してしまう | `index.html` の 4 箇所を**触らない**。受入条件 3. の続き周回で実際に確認 |
| 前口上が二度と流れない / 二重に流れる | 条件は `prologueSeen` の有無だけ。受入条件 2. で `#prologueOverlay` の表示を直接測る |
| クラス変更不可で初見が詰む | カード下の常時警告 1 行(必須)。加えて「はじめから」で選び直せることを明記 |
| `hero-classes.js` の `zone` が `PARTY_ZONES` と乖離 | 受入条件 6. で 2 経路突き合わせ + 母集団が空でないことの装置 assert |
| `?title=0` が silent fail-open | 受入条件 8. で「外すと赤」を測る |
| VBS の飛び先変更で誰も気づかず旧 URL を踏む | `tavern.html` は**直接開いても従来通り遊べる**(それが撤退経路)。壊さない |

---

## 二重ファイル同期

- 新規の共有データは `js/hero-classes.js` の 1 箇所。`title.html` と `tavern.html` が読む
- `title.html` に**ゲームロジックを書かない**。セーブ操作は `DFSlots`(依頼書 A)、クラス表示は `HERO_CLASSES` に閉じる
- `index.html` は**同期対象外**(1 行も触らない)
