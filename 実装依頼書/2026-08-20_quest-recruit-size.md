# クエスト難易度に連動した「募集 → 増援」の人数

**ステータス**: 起草済(未承認)
**依存**: なし(依頼書 A / B とは独立。並行して進めてよい)
**この後に必ず**: `2026-08-20_recruit-balance-retune.md`(D)。**本依頼書はバランスを決めない**
**撤退スイッチ**: `?recruit=0`

---

## 目的

いまは出発ボタンを押すと NPC が 3 人**勝手に**ついてくる。プレイヤーは一度も「頼む」と言っていない。

これを「**依頼を受けて酒場で募集をかけ、応じた者が同行する**」に変える。
★1 の小仕事には人が集まらず、★3 の大仕事には集まる。

---

## 背景・現状

### いまのパーティ編成

| 場所 | 内容 |
|---|---|
| [tavern.html:3109](../tavern.html#L3109) | `const PARTY_SIZE = 4;` — 主人公1 + NPC3 |
| [tavern.html:3163](../tavern.html#L3163) | `buildParty(heroClassKey)` — zone をばらけさせつつ `PARTY_SIZE` まで詰める |
| [tavern.html:4429](../tavern.html#L4429) 付近 | `regeneratePartyMembers()` — `orderFormation(buildParty(heroKey))` |
| [tavern.html:4468](../tavern.html#L4468) | 「仲間を引き直す」ボタン(出発前に何度でも再抽選可) |
| [tavern.html:1815](../tavern.html#L1815) | `#partyMatchOverlay` — 「共に挑む仲間が集う……」のマッチング演出 |
| [tavern.html:5165](../tavern.html#L5165) | `departToScenario()` が `sessionStorage["dragonfighters.partyMembers"]` に書いて index へ渡す |

### 朗報: `index.html` を触らなくてよい

`index.html` にも `PARTY_SIZE = 4`([index.html:11837](../index.html#L11837))と `buildParty`([11883](../index.html#L11883))の**写しがある**。
しかし [index.html:31254](../index.html#L31254) を読むと、実プレイのパーティは
**sessionStorage の `partyMembers` を読んで組んでおり**、`buildParty` が使われるのは
[31268](../index.html#L31268) の**「それが無い時のフォールバック」だけ**。

→ **人数を変えるのに `index.html` を触る必要はない。二重同期コストはほぼゼロ。**
(直起動・デバッグ時のフォールバックが 4 人のままなのは、むしろ望ましい)

### クエスト定義の難易度

`difficulty` を持つのは**固定 6 シナリオだけ**:

| id | difficulty | ★の数 |
|---|---|---|
| `goblin-mine`(廃坑) | `★☆☆` | 1 |
| `bandits-forest`(森) | `★★☆` | 2 |
| `lizard-swamp`(沼地) | `★★☆` | 2 |
| `orc-fort`(砦) | `★★★` | 3 |
| `undead-temple`(神殿) | `★★★` | 3 |
| `dragon-lair`(竜の巣) | `★★★★` | **4** |

⚠ **生成クエスト(闇市ポドルプラザ)は `difficulty` を持たない。**
[tavern.html:5977-5983](../tavern.html#L5977-L5983) の `buildPlazaSynthetic()` が返すのは
`recommendedLevel: q.level` までで、`difficulty` フィールドは無い。**フォールバックが必要。**

---

## 設計

### 募集人数の決め方

```
recruitCountOf(sc):
  1. sc.recruit が数値      → その値を使う            (クエスト個別の上書き)
  2. sc.difficulty が文字列 → "★" の数を数える        (固定6シナリオ)
  3. どちらも無い           → 既定 3 を返す + [DIAG] を1行出す   (生成クエスト)
  最後に clamp(n, 1, 3)
```

#### なぜ上限 3 なのか(勝手に外さないこと)

`dragon-lair` は ★4 なので素直に数えると NPC 4 人 = **パーティ 5 人**になる。
だが **5 人編成は一度も通したことがない**:

- `index.html` の味方スポーンタイル割り当て(`allyInitTakenTiles` 付近、[31245](../index.html#L31245))
- 隊列順 `orderFormation` と「頭 = 最も狙われる位置」の前提
- 出発準備画面のキャラタブ / 装備 UI の枠
- カメラ・視界・描画コスト

これらが 4 人前提で組まれている。**上限を 4 人パーティに固定することで、この依頼書では engine を一切触らない。**
5 人以上を試したくなったら**別の調査チケット**を切ること。

#### なぜフォールバックで黙らないのか

生成クエストが `difficulty` を持たないのは既知。ここで黙って 3 を返すと、
**将来 `difficulty` を持つ生成クエストが増えた時に誰も気づかない**。
`[DIAG] recruit: fallback used (no difficulty) id=generated-quest -> 3` を必ず 1 行出す。

### 触る場所

| 場所 | 変更 |
|---|---|
| [tavern.html:3163](../tavern.html#L3163) `buildParty(heroClassKey)` | 第2引数 `partySize = PARTY_SIZE` を足す。`PARTY_SIZE` は**既定値としてのみ残す**(定数は消さない) |
| [tavern.html:4429](../tavern.html#L4429) `regeneratePartyMembers()` | `prepScenario` から `recruitCountOf()` を引いて `buildParty(heroKey, 1 + n)` を呼ぶ。`prepScenario` が無い時は `PARTY_SIZE` |
| [tavern.html:2085](../tavern.html#L2085) 以降のシナリオ表 | **今は何も足さない。** `recruit:` は依頼書 D で値を決めてから入れる(器だけ先に作る) |
| [tavern.html:4468](../tavern.html#L4468) 「仲間を引き直す」 | ラベルを **「募集をかけ直す」** に変更 |
| 出発準備画面(`#partyPreview` の上) | **「この依頼に応じた冒険者: N 人」** を 1 行出す |
| [tavern.html:1819](../tavern.html#L1819) `#pmSub` | 人数で文言を出し分ける(下記) |

#### `#pmSub` の文言(任意だが推奨)

| 人数 | 文言 |
|---|---|
| 1 | 「応じたのは、ただ一人 ――」 |
| 2 | 「二人が、卓についた ――」 |
| 3 | 「共に挑む仲間が集う ――」(現行文言) |

### 触らないと決めたファイル

- **[index.html](../index.html) — 1 行も触らない。** `PARTY_SIZE`(11837)も `buildParty`(11883)も**フォールバック専用**
- `js/save-slots.js` / `title.html`(依頼書 A / B の担当)
- 敵の配置・数・強さ・XP テーブル — **依頼書 D の担当**

---

## 実装ステップ(順序)⚠ 2 段構えを守ること

### STEP 1: 配線だけ(既定 OFF)

`recruitCountOf()` と `buildParty(hero, size)` を実装するが、**既定を OFF にする**
(`?recruit=1` で初めて有効、無指定は従来通り 4 人)。

この段で **既存の golden ドライバ群が全部緑のまま**であることを確認する。
挙動が 1 ミリも変わっていないことを証明してから機能を入れる。

### STEP 2: 既定 ON へ切り替え

既定を ON(`?recruit=0` が撤退)に変える。**ここで既存 golden の多くが赤くなるはず。**

⚠⚠ **赤を機械的に更新しないこと。** 1 本ずつ、
「パーティ人数が変わったせいで期待値が変わった」のか「実装が壊れた」のかを**目視で判定**してから更新する。
判定できない赤が 1 本でも残ったら、そこで止めてユーザーに報告する。

### STEP 3: UI(ラベル・人数表示・`#pmSub`)

### STEP 4: 受入条件のドライバを通す

---

## 受入条件

新規ドライバ `tools/verify_recruit_size.js`。冒頭で必ず `require('./_pptr_profile')`。

### 機能

1. 固定 6 シナリオそれぞれで、出発時の `sessionStorage["dragonfighters.partyMembers"]` の長さが
   **`1 + 期待値`** になる:

   | id | 期待 NPC 数 | パーティ計 |
   |---|---|---|
   | `goblin-mine` | 1 | 2 |
   | `bandits-forest` | 2 | 3 |
   | `lizard-swamp` | 2 | 3 |
   | `orc-fort` | 3 | 4 |
   | `undead-temple` | 3 | 4 |
   | `dragon-lair` | **3**(★4 だが clamp) | 4 |

2. **どのクエストでもパーティが 4 人を超えない**
3. 生成クエスト(闇市)は NPC 3 人。かつ `[DIAG] recruit: fallback used` のログが**実際に出ている**
4. シナリオ定義に `recruit: 3` を注入すると、`goblin-mine` でも NPC 3 人になる(個別上書きが効く)
5. 隊列順が front → mid → rear のまま(`orderFormation` を壊していない)
6. 「募集をかけ直す」を押すと**顔ぶれが変わり、人数は変わらない**

### 装置 assert(検出器が空振りしていない証明)

7. `?recruit=0` を付けると **1. の全 6 件が 4 人になる**(= 従来動作)。
   「`?recruit=0` で緑」ではなく「**スイッチを外すと期待値が変わる**」ことを測る

### 既存の非退行

8. STEP 1 完了時点(既定 OFF)で既存 golden が**全部緑**
9. STEP 2 完了時点で赤くなった golden について、**1 本ずつ理由を書いた一覧**を残す
   ⚠ 「人数が変わったから」で片付けず、そのドライバが何を測っていたのかを 1 行で書く

---

## やらないこと(スコープ外)

- **バランス調整をしない。** 敵の数・質・配置・XP は 1 つも触らない(依頼書 D)
- シナリオ表に `recruit:` の具体値を**入れない**(器だけ作る。値は D で測って決める)
- パーティを 5 人以上にしない(engine 未検証。別チケット)
- `index.html` を触らない
- 「誰が応募するか」をプレイヤーが選べるようにしない(いまも選べない。抽選のまま)
- 応募者の立ち絵・専用演出の新規作成(既存 `#partyMatchOverlay` を流用)

---

## リスクと対策

| リスク | 対策 |
|---|---|
| ★1 の廃坑が NPC 1 人になり、**最初のクエストが一番難しくなる** | ⚠ **これは起きる。** 本依頼書は器だけ作り、値は D で実測して決める。D をやるまで出荷しない |
| 既存 golden が大量に赤くなる | STEP 1 の既定 OFF で「挙動不変」を先に証明 → STEP 2 で 1 本ずつ理由を確認して更新 |
| 生成クエストが黙って 3 人になる | `[DIAG]` を必ず 1 行出す。受入条件 3. でログの実在を測る |
| ★4 で 5 人パーティになり engine が壊れる | `clamp(n, 1, 3)`。受入条件 2. で「4 人を超えない」を全クエストで測る |
| `regeneratePartyMembers()` が `prepScenario` 無しで呼ばれる | `PARTY_SIZE` にフォールバック。`selectHero` 経由の呼び出しがこれに当たる |

---

## 二重ファイル同期

**なし。`tavern.html` だけを触る。**
`index.html` の `PARTY_SIZE` / `buildParty` は**フォールバック専用**なので据え置く
(この非対称は意図的。上記「背景・現状」に理由を書いてある)。
