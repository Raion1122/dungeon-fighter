# セーブスロット基盤(3スロット・アーカイブ方式) — UI なし

**ステータス**: 起草済(未承認)
**依存**: なし。これが `2026-08-20_title-screen.md` の土台になる
**撤退スイッチ**: `?slots=0`

---

## 目的

セーブを 3 つ持てるようにする。**ただしキー名は 1 文字も変えない。**

タイトル画面(別依頼書 B)が「つづきから」を 3 枠で出せるようにするための土台。
**この依頼書では UI を一切作らない。** API とドライバだけを作って固める。

---

## 背景・現状

### いまのセーブの実体

`localStorage` の `dragonfighters.*` 群。**キー参照は 2 ファイルに散らばっている**:

- [tavern.html](../tavern.html) — 35 種
- [index.html](../index.html) — 37 種

(`xp` / `gold` / `ownedEquip` / `equipWeaponIdx` 等の装備一式 / `knownSpells` / `questFlags` /
`partyComposition` / `partyMembers` / `plazaState` / `plazaInventory` / `cleared` / `prologueSeen` /
`templeBlessing` / `fang` / `accessoryState` / `scrollStock` / `inventoryBag` ほか)

⚠ **この 70 箇所超のキー literal を `df.slot1.*` へ改名するのは禁止。** 改名しなくても 3 スロットは作れる(下記)。

### すでにある資産(重要)

[tavern.html:5238-5249](../tavern.html#L5238-L5249) の `WIPE_KEEP` + `wipeAdventureRecord()` が、
**消すキーを列挙せず** `dragonfighters.` 接頭辞を総なめして消す実装になっている。
残すのは `dragonfighters.settings` と `dragonfighters.panelCollapsed` の 2 つだけ。

```js
const WIPE_KEEP = { "dragonfighters.settings": 1, "dragonfighters.panelCollapsed": 1 };
function wipeAdventureRecord() {
  // 消すキーをハードコード列挙しない。今後キーが増えるたびに列挙は必ず腐るので prefix 走査する。
  [localStorage, sessionStorage].forEach((store) => { /* prefix 走査で removeItem */ });
  location.replace(location.pathname);
}
```

**「新規ゲーム」のロジックはここに既にある。** 本依頼書はこれを流用し、**実装を 2 つに増やさない**。

### 共有ファイルの前例

[tavern.html:1747-1749](../tavern.html#L1747-L1749) に前例がある:

- `js/skill-check.js` — 「index.html と共有 (変更は js/skill-check.js 1か所で済む)」
- `js/df-mapdef.js` — 「index.html / map-editor.html と共有」

**新規の共有ロジックは同じ作法で `js/` に置く。** HTML に写しを作らない。

---

## 設計(ここが本依頼書の核心)

### 方式: ライブ名前空間 + アーカイブ

| 置き場所 | 中身 |
|---|---|
| `dragonfighters.*`(既存のまま) | **いま遊んでいるスロットの実体(ライブ)** |
| `df.activeSlot` | `"1"` / `"2"` / `"3"` — ライブが**どのスロットのものか** |
| `df.slot1` / `df.slot2` / `df.slot3` | 非アクティブなスロットの **JSON スナップショット 1 キー** |

スナップショットの形(値は合成例):

```json
{
  "meta": {
    "hero": "warrior",
    "level": 5,
    "gold": 340,
    "clearedCount": 2,
    "savedAt": "2026-08-20T21:45:00.000Z"
  },
  "data": {
    "dragonfighters.xp": "10000",
    "dragonfighters.gold": "340",
    "dragonfighters.partyComposition": "[\"warrior\"]"
  }
}
```

- `data` は **`dragonfighters.` で始まる localStorage キーの丸ごとコピー**(値は文字列のまま。JSON.parse しない)
- `meta` は**スロット一覧の表示専用**。復元せずに読めることが目的。`savedAt` は ISO 8601 UTC(`new Date().toISOString()`)
- `WIPE_KEEP` の 2 キー(`settings` / `panelCollapsed`)は **スロットに含めない**。設定と UI 状態は全スロット共通

### この方式の効き目(なぜこう決めたか)

1. **72 箇所のキー参照を 1 文字も触らない** — 改名の取りこぼしという事故が原理的に起きない
2. **ライブが常に真の状態** — ブラウザが落ちても、いま遊んでいるスロットは絶対に失われない。
   失われうるのは「他のスロットへ移った時に、直前の進行が**一覧の要約**に反映されない」だけ
3. **「新規」は既存 `wipeAdventureRecord()` をそのまま呼べる**

---

## 変更範囲

### 新規作成

**`js/save-slots.js`** — `window.DFSlots` を生やす。`tavern.html` / `title.html`(依頼書 B) / `index.html` が `<script src>` で共有。

```
DFSlots.LIVE_PREFIX          // "dragonfighters."
DFSlots.KEEP                 // { "dragonfighters.settings":1, "dragonfighters.panelCollapsed":1 }
DFSlots.SLOT_COUNT           // 3

DFSlots.enabled()            // ?slots=0 なら false
DFSlots.active()             // 1|2|3 (未設定なら 1 を書いて 1 を返す = 既存プレイヤーの救済)
DFSlots.list()               // [{slot:1, empty:false, meta:{...}}, ...] ×3。
                             //   active なスロットの meta は「ライブから今その場で算出」する
                             //   (アーカイブは古い可能性があるため)
DFSlots.snapshot()           // ライブ → active スロットへ書き戻し (meta 更新込み)
DFSlots.switchTo(n)          // n===active なら no-op。
                             //   そうでなければ snapshot() → ライブを消す → slot n を流し込む → activeSlot=n
DFSlots.newGame(n)           // snapshot() → wipeLive() → activeSlot=n → slot n を空にする
DFSlots.wipeLive()           // prefix 総なめで localStorage/sessionStorage から dragonfighters.* を削除
                             //   (KEEP は残す)。location.replace は**しない**。呼び出し側の責任
DFSlots.sizeReport()         // { live: <bytes>, slot1: <bytes>, ..., total: <bytes> } — quota 検証用
```

**`wipeLive()` に画面遷移を含めないこと。** 既存 `wipeAdventureRecord()` は末尾で `location.replace()` していたが、
それは「設定モーダルから消した」時の都合。API に混ぜると `newGame()` が使えなくなる。

### 既存ファイルの変更

| ファイル | 変更 |
|---|---|
| [tavern.html:5238-5249](../tavern.html#L5238-L5249) | `WIPE_KEEP` / `wipeAdventureRecord()` の**本体を削除**し、`DFSlots.wipeLive()` を呼んでから `location.replace(location.pathname)` する薄いラッパに置き換える。**消去の実装を 2 つ持たない** |
| [tavern.html](../tavern.html) の既存 `js/skill-check.js` の隣 | `<script src="js/save-slots.js"></script>` を追加 |
| [index.html](../index.html) 同上 | 同じ script タグを追加(index は snapshot のフックだけ使う。無くても壊れないが、`?slots=0` の判定を共有するため入れる) |
| [tavern.html:3868](../tavern.html#L3868) `consumeResult()` の直後 | `DFSlots.snapshot()` を呼ぶ(ダンジョンから戻った直後の状態を要約に反映) |
| [tavern.html:5146](../tavern.html#L5146) `departToScenario()` の `saveSelections()` 直後 | `DFSlots.snapshot()` を呼ぶ |
| [tavern.html](../tavern.html) 初期化末尾 | `pagehide` と `visibilitychange`(hidden) の**両方**で `DFSlots.snapshot()`。iOS Safari は `beforeunload` が不発になるので `beforeunload` は使わない |

### 触らないと決めたファイル

- `audio.js` — 無関係
- `js/skill-check.js` / `js/df-mapdef.js` — 無関係
- `index.html` の `dragonfighters.*` キー参照 37 箇所 — **1 箇所も触らない**(それが本方式の目的)
- `ゲームを起動.vbs` — 起動先の変更は依頼書 B の担当

---

## 受入条件

新規ドライバ `tools/verify_save_slots.js`。冒頭で必ず `require('./_pptr_profile')`。

### 機能

1. スロット1 で `dragonfighters.xp` に値を書く → `switchTo(2)` → **xp が消えている** → `switchTo(1)` → **xp が元の値で戻る**
2. スロット2 で `newGame(2)` → **スロット1 のデータが無傷**(`switchTo(1)` で全キーが一致)
3. `list()` が 3 件返り、空スロットは `empty:true`、埋まったスロットの `meta.level` / `meta.gold` / `meta.hero` が実データと一致する
4. **active スロットの `meta` はライブから算出される** — ライブの gold を書き換えてから `list()` を呼ぶと、`snapshot()` を挟まなくても新しい値が出る
5. `wipeLive()` 後も `dragonfighters.settings` と `dragonfighters.panelCollapsed` が残っている
6. `wipeLive()` が `location` を触らない(呼んでもページが遷移しない)

### 装置 assert(検出器が空振りしていない証明)

7. `?slots=0` を付けると 1.〜4. のテストが**落ちる**こと。
   「`?slots=0` で緑」ではなく「**スイッチを外すと赤**」を測る。撤退スイッチが silent fail-open になっていないことの証明

### 実測して報告(閾値ではなくログ)

8. `sizeReport()` の値を必ずログに出す。**3 スロット満杯時の `total` バイト数**を報告すること。
   localStorage の上限は 5MB。ライブ + 3 スロットで最大 4 倍になるので、**通す前に実測する**。
   もし `total > 2MB` なら、そこで止めてユーザーに報告する(値の圧縮や slot 数の見直しが要る)

### 既存の非退行

9. 既存の golden ドライバ群(`tools/` 配下)が **HEAD と同じ結果**を返すこと。
   赤が出たら、まず `git stash -u` して HEAD で同じドライバを回し、**自分由来か既存の赤かを切り分ける**

---

## やらないこと(スコープ外)

- **UI を作らない。** スロット選択画面は依頼書 B の担当
- タイトル画面・`title.html` を作らない
- キー名の改名(`df.slot1.xp` 等)を**しない**
- `index.html` の `dragonfighters.*` 参照を触らない
- セーブデータの圧縮・暗号化・バージョニング
- クラウド同期・エクスポート/インポート

---

## 実装ステップ(順序)

1. `js/save-slots.js` を新規作成。`wipeLive()` / `snapshot()` / `list()` / `active()` だけ先に作る
2. `tavern.html` / `index.html` に `<script src>` を追加。**この時点では挙動が 1 ミリも変わらないこと**を確認(配線だけの段)
3. `wipeAdventureRecord()` を `DFSlots.wipeLive()` 呼び出しに畳む。設定モーダルの『冒険の記録を消す』が従来通り動くことを手で確認
4. `switchTo()` / `newGame()` / `sizeReport()` を実装
5. snapshot フック 4 箇所(consumeResult / departToScenario / pagehide / visibilitychange)を追加
6. `tools/verify_save_slots.js` を書いて 1.〜9. を通す
7. `sizeReport()` の実測値をユーザーに報告する

---

## リスクと対策

| リスク | 対策 |
|---|---|
| localStorage quota 超過(4 倍化) | 受入条件 8. で**実測してから通す**。2MB 超えたら止めて報告 |
| snapshot 漏れで進行が消える | **消えない**。ライブが真の実体なので、消えうるのは非アクティブスロットの要約だけ。この安全性が本方式を選んだ理由 |
| 既存プレイヤーのセーブが `activeSlot` 未設定 | `active()` が未設定時に `1` を書いて返す = 既存セーブは自動的にスロット1 になる |
| `?slots=0` が silent fail-open | 受入条件 7. の装置 assert で担保 |
| `wipeAdventureRecord` の畳み込みで設定消去が壊れる | ステップ 3 で手動確認を挟む。ドライバでも `WIPE_KEEP` の 2 キー残存を測る(受入条件 5.) |

---

## 二重ファイル同期

**新規ロジックはすべて `js/save-slots.js` の 1 箇所。HTML には写しを作らない。**
`tavern.html` / `index.html` に増えるのは `<script src>` の 1 行と、snapshot 呼び出しの数行だけ。

---

## 実装結果 (2026-08-22 / STEP1〜7 完了)

| STEP | 内容 | コミット |
|---|---|---|
| 1〜2 | `js/save-slots.js` 新規 + `tavern.html`/`index.html` へ `<script src>`(配線だけの段) | `89f58a9` |
| 3 | `wipeAdventureRecord()` を `DFSlots.wipeLive()` の薄いラッパへ畳む | `87ffca8` |
| 4〜5 | `switchTo()`/`newGame()`/`sizeReport()` + snapshot フック 4 箇所 | `b92444e` |
| 6〜7 | 検証ドライバ `tools/verify_save_slots.js` (**30/30**) + `sizeReport()` 実測 | `dde8457` |

### 受入条件の結果

| # | 結果 | 証拠 (`node tools/verify_save_slots.js`) |
|---|---|---|
| 1 | ✅ | `(1)` `sw2:true / xpOnSlot2:null / liveKeysOn2:0 / sw1:true / xpBack:"10000"` |
| 2 | ✅ | `(2)` `ng:true / liveKeysAfterNg:0 / slot2AfterNg:null / keysEqual:true (6キー)` |
| 3 | ✅ | `(3)` slot1 `{active:true, empty:false, level:5, gold:340, hero:"warrior", cleared:2}` / slot2・slot3 `empty:true` |
| 4 | ✅ | `(4)` `listA0gold:340 → listB0gold:55555`(snapshot 無し)。同時に `archive1gold:340` = **由来がライブ**である証拠 |
| 5 | ✅ | `(5)` `["{\"master\":0.42}","1"]` / `(5b)` sessionStorage 側の KEEP も残る |
| 6 | ✅ | `(6)` `navCount:0 / hrefSame:true / sentinelSurvived:true` + `(6a)` 関数本体に `location` の語が 0 |
| 7 | ✅ | `(7)` `1:FAIL(=OK) 2:FAIL(=OK) 3:FAIL(=OK) 4:FAIL(=OK)` = **4/4 とも落ちた** |
| 8 | ✅ | `{"live":17660,"slot1":20222,"slot2":20222,"slot3":20222,"total":78326}` = **76.5 KB**(5MB の **1.49%**) |
| 9 | ✅ | `driver_dev_gate` 52/52 ・ `driver_depart_menu_clean` 41/41 ・ `driver_grid_p8` 55/55 (すべて基準どおり) |

### 逸脱・判断

1. **受入条件 7 の測り方を「両方向」にした。** 依頼書は「?slots=0 で 1.〜4. が**落ちる**」と書いてあるが、
   途中の使い捨てプローブは「?slots=0 で `switchTo`/`newGame` が false になる」側しか測っておらず**半分だった**。
   正式ドライバでは **ページ側 = 観測だけ (`featureProbe`) / Node 側 = 判定だけ (`featureAsserts`)** に分け、
   **同じ `featureAsserts()` を ON ページと `?slots=0` ページの両方へ当てる**形にした。
   assert 本体を共有していないと「別々に書いた 2 つの assert が両方とも間違っている」= 実装とドライバが
   同じ誤りを持つと永久に緑、という事故を防げない。装置 assert `(7z4)` で「両側で assert が同数」も測っている。

2. **各 assert を「戻り値 AND 状態」の conjunction にした。** 状態だけで測ると負のコントロールが空振りする。
   実測で判明: 受入条件 2 は `?slots=0` でも `keysEqual:true` になる(**何も起きないので結果的に一致する**)。
   `ng===true` を conjunction に入れていなければ、この 1 本だけ「?slots=0 でも緑」= 空振りしていた。

3. **`sizeReport()` の実測を正式ドライバの assert として取り込んだ**(使い捨てで測っただけでは腐るため)。
   満杯は酒場自身のカタログ (`CHAR_EQUIP` / `PARTY_SLOTS` / `SCROLL_CATALOG_TV` / `ACCESSORIES_TV` /
   `PLAZA_ITEMS(_COMMON)_TV` / `ALL_MAIN_SCENARIOS`) から組み立てるので、装備や呪文が増えれば測定値も追随する。
   実数: 呪文 59 / 装身具 13 / 闇市 8 / 装備上限 {weapons:5, armors:3, shields:4} / gated 10 / ライブ 29 キー。
   `total > 2MB` で FAIL する assert `(8)` と、満杯が空振りしていないことの装置 assert `(8z3)` を両方入れた。

4. **受入条件 5./6. は `driver_dev_gate.js` の (F)(G) 群と一部重複する。** あえて残した
   (依頼書の受入条件を 1 本のドライバで全部たどれるほうが良い / コストも小さい)。

### 実測値 (受入条件 8 の報告)

```
[1 スロットのみ]           {"live":17660,"slot1":0,"slot2":0,"slot3":0,"total":17660}       = 17.2 KB
[ライブ1 + アーカイブ2/3]  {"live":17660,"slot1":20222,"slot2":20222,"slot3":20222, ...}
[★3スロット満杯(最悪値)]  {"live":17660,"slot1":20222,"slot2":20222,"slot3":20222,"total":78326}
  → 78,326 bytes = 76.5 KB   localStorage 上限 5MB (5,242,880) の 1.49%
```

⚠ バイトの定義は **UTF-16 コードユニット**((キー長 + 値長) × 2)。Chrome / Safari の quota の数え方に合わせて
安全側に倒してある(UTF-8 換算より必ず大きく出る)。**quota は問題にならない**(2MB ゲートに対して 26 倍の余裕)。

### 罠 (再演しやすいので残す)

- 日本語コメント中に `df.` と `dragonfighters.` を**スラッシュで並べて書く**と `*` + `/` になり
  **ブロックコメントが閉じて SyntaxError**。1 回目の実行がこれで死んだ。
- same-origin の `localStorage` は**ページ遷移をまたいで生き残る**。tavern を開いた時点で
  `consumeResult` 直後の snapshot フックが `df.slot1` を焼くため、前セクションの `df.` が次セクションへ漏れる。
  → `page.evaluateOnNewDocument` で **document-start に purge** している。
- `sessionStorage` は**タブ単位**。別タブで蒔いた値は届かない。
- snapshot フックは 4 つだが、`pagehide` と `visibilitychange` は `snap()` ヘルパを共有するので
  **`DFSlots.snapshot()` の呼び出しサイトは 3 つ**。literal の個数で測ると偽の赤になる。

### 残件

- **実機(iOS Safari)での確認は未実施。** 特に `pagehide` / `visibilitychange`(hidden) の
  snapshot フックが iOS Safari で実際に発火するか(`beforeunload` を使っていないのはこのため)。
- UI は本依頼書のスコープ外。スロット選択画面は **依頼書 #6 `title-screen`** の担当。
