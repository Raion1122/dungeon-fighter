# #61 全シナリオを 4 人編成へ(★連動の廃止)

- **起草**: 2026-09-08(計画窓 `claude-76`) / **ステータス**: **承認済**(2026-09-08 ユーザー承認)
- **着手**: ✅ **完了**(2026-09-09 実装窓 / dev-loop 4 項目)。着地 `1b369f0` → `77879b4` → `7190eb7` → `19f50e1` + 締めのコミット。⚠ **push はしていない**(ユーザー承認事項)。実測は §12。
- **触るファイル**: `tavern.html` / `tools/verify_recruit_size.js`(改訂) /
  `tools/verify_party_four.js`(新規) / `実装依頼書/README.md`
- ⛔ **触らないファイル**: `index.html`
  — 本チケットは `index.html` を**一度も開かずに完了できる**(§2-6 で確認済み)。
- ⚠⚠⚠ **着手は #60 の着地待ち**。隣窓が **`tavern.html` を編集中**
  (2026-09-08 実測 `git status --short` = ` M tavern.html` / `?? tools/verify_party_promises.js`)。
  着地判定は台帳の文面ではなく **作業ツリーが clean** で見る。
- ⚠ **着手前にもう一度**、§2 の位置を本番の関数で測り直すこと。**行番号ではなく識別子で引く**。
  #60 が `tavern.html` を編集するので**行番号は必ずズレる**。
- ⚠⚠ commit は **`git add <paths> && git commit -- <paths>` を 1 つの複合コマンドで**打つ
  (ファイル単位 add だけでは相手の pathspec なし commit に拾われる)。

---

## 1. 目的

パーティは主人公 + NPC で最大 4 人だが、**森と沼地だけ 3 人**になる。依頼の重さ(★の数)を
そのまま同行 NPC 数にする設計(#7)がそうさせている。ユーザーが実機で「3 名だと面白くない」と
判断したため、**★連動を廃して全シナリオ 4 人**に固定する。

**ユーザー決定(2026-09-08 / 開発会議 `dev-meetings/2026-09-08_party4-and-legacy-map-retire.md`)**:

- ✅ **★連動そのものを廃止**し、`recruitCountOf()` は常に上限を返す
- ❌ 不採用: 森と沼へ `recruit: 3` を個別上書きする案(廃坑 #8 と同じ手口)
  — 6 本中 3 本が例外になり、**例外が過半数の規則はもう規則ではない**(レンツ)
- ✅ **★ 表示は残す**。募集人数と切れても「敵の強さ」の表示としては嘘にならない(ノエル)
- ⏭ **難易度・XP の再調整は別チケット**。人数とバランスを同じチケットに混ぜると
  「易しくなったのは人数のせいか敵のせいか」が測れなくなる(#8 はペア比較 80 走行で判断した)
- ⛔ **5 人以上はやらない**。`RECRUIT_MAX` は 3 のまま据え置く(engine 未検証。#14 の調査チケット参照)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 「3 人」になるのは 6 本中 2 本だけ

| シナリオ | `difficulty` | `recruit:` | NPC | 合計 |
|---|---|---|---|---|
| goblin-mine 廃坑 | `★☆☆` | **3**(#8 の個別上書き) | 3 | **4 人** |
| bandits-forest 森 | `★★☆` | — | **2** | **3 人** ← 対象 |
| lizard-swamp 沼地 | `★★☆` | — | **2** | **3 人** ← 対象 |
| orc-fort 砦 | `★★★` | — | 3 | **4 人** |
| undead-temple 神殿 | `★★★` | — | 3 | **4 人** |
| dragon-lair 竜の巣 | `★★★★` | — | 3(clamp) | **4 人** |

⭐ **他 4 本は 1 ビットも変わらない**。engine 側の 4 人対応(味方スポーンタイル / `orderFormation` /
HP バー 4 枚 / カメラ)は **既に 4 本で出荷済み** = 本チケットに engine の新規リスクは無い。

**基準の再現**(依頼書の数字を信じずに測り直した): `verify_recruit_size.js` を素で走らせた
2026-09-08 の出力より —

    (A) 既定ON の隊列 = goblin-mine:front>mid>rear>rear  bandits-forest:front>mid>rear
                        lizard-swamp:front>mid>rear  orc-fort:front>mid>mid>rear
                        undead-temple:front>front>mid>rear  dragon-lair:front>mid>mid>rear
    (C) ?recruit=0 の隊列 = goblin-mine:front>front>mid>rear  bandits-forest:front>mid>mid>rear
                        lizard-swamp:front>front>mid>rear  (以下 4 本は (A) と同じ)

⭐⭐⭐ **`?recruit=0` の (C) 腕が、本チケット後の既定の姿そのもの**。森と沼だけが 3 → 4 に増え、
他 4 本は (A) と (C) が既に一致している。**ドライバの改訂はこの対応関係を使うのが最短**。

**計測コマンド**(再測定するとき):

    node tools/verify_recruit_size.js          # 素。2026-09-08 実測 = 82/82 PASS
    grep -nE 'difficulty *:|recruit *:' tavern.html | head -20

### 2-2. 呼び口の全数(リポジトリ全文 grep で実測)

| ファイル:識別子 | 役割 |
|---|---|
| `tavern.html` `const RECRUIT_MAX = 3` | ⭐ **同行できる NPC 上限の唯一の正**(#54)。⛔ 動かさない |
| `tavern.html` `function recruitCountOf(sc)` | ★の数 → NPC 数。**ここだけを直す** |
| `tavern.html` `function isRecruitOn()` | `?recruit=0` の読み取り。**意味が反転する**(§7) |
| `tavern.html` `if (isRecruitOn() && prepScenario) partySize = 1 + recruitCountOf(...)` | **唯一の使用点** |
| `js/recruit-candidates.js` | `RECRUIT_MAX` を **cap として受け取るだけ**(呼び出し側が権威) |
| `tavern.html` 「同行の約束: n / RECRUIT_MAX 人」ほか 4 箇所 | 表示。**上限を触らないので無変更** |

⭐ **`recruitCountOf` の本番呼び口は 1 箇所だけ**(`partySize` の行)。残りはコメントとドライバ。

    grep -rn "recruitCountOf\|RECRUIT_MAX\|isRecruitOn" --include=*.html --include=*.js .

### 2-3. ⚠⚠⚠ 罠: 既存 golden `verify_recruit_size.js` は**正しく赤くなる**

`tools/verify_recruit_size.js` は #7 の受入 = 「★の数で NPC が 1〜3 人に変わる」を測る道具で、
期待表を**ドライバ側が独立に持っている**:

    const EXPECTED_NPC_RECRUIT = {
      'goblin-mine': 3, 'bandits-forest': 2, 'lizard-swamp': 2,   // ← 森と沼の 2 が赤くなる
      'orc-fort': 3, 'undead-temple': 3, 'dragon-lair': 3,
    };

⛔ **期待値を写経して緑にしないこと。** これは #60 §2-11 と同型の状況 ——
**仕様を変えたのだから赤くなるのが正しい**。やることは「表の 2 を 3 に書き換える」ではなく、
**assert の言い分けを変える**:

- (A) 群「★の数と NPC 数が一致する」→ **「6 本すべてが NPC = `RECRUIT_MAX`」へ言い直す**
- (A4)「★4 の dragon-lair が clamp されて NPC 3」→ **残す**(上限を外していないことの検査は生きる)
- (G4)(G5) `recruit:` の個別上書き群 → **残す**(恒等になるが「ソースの値が効く」経路は生きている)
- (C) 群 `?recruit=0` → **★連動へ戻ることの検査に読み替える**(§7 の反転にあわせる)

⭐ 同じ表を `tools/sweep_recruit_balance.js` の `SCEN_TABLE.newNpc` も持つ。こちらは
**golden ではなく 80 走行の調査ツール**なので、本チケットでは**直さない**(§11)。

⚠⚠ **「赤くなる本数」を grep で見積もらないこと**(#60 の実測 2026-09-08 / 実装窓からの申し送り)。
#60 は「ラベルを変えると golden 5 本が赤くなる」と起草したが、**実際に赤くなったのは 2 本**で、
残り 3 本は `#btnReroll`(準備画面)や `?recruittalk=0` の腕を掴んでいて **1 本も動かなかった**。
⇒ 上の「(A) 群が赤くなる」も**予想であって実測ではない**。着手したらまず
`node tools/verify_recruit_size.js` を素で走らせ、**実際に赤くなった assert の ID を控えてから**
言い直しにかかること。⛔ 予想のまま書き換えると「動いてもいない assert を直した」ことになる。
⭐ 数えるときは語の grep で止めず、**`getElementById` の引数と URL 構築関数の腕**まで読む。

### 2-4. ⚠ 罠: `verify_prep_retire.js` のコメントは**既に事実と違う**

`tools/verify_prep_retire.js` の冒頭に「★1 = recruitCountOf 1 なので `?recruittalk=0` で
主人公 + NPC 1 人」とあるが、**goblin-mine は #8 で `recruit: 3`** なので実際は NPC 3。
コメントが #8 に追随していないだけで **assert は実体から引いている**(2026-09-08 実測で
`verify_recruit_size` の (G4) が「素で NPC 3」を緑にしている)。
⇒ 本チケットで `verify_prep_retire.js` は**触らない**。ただし走らせて非退行だけ確かめる。

### 2-5. changelog の要否

`scripts/hooks/check_changelog.py` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` を
読んだ結果: **鳴る**(`tavern.html` を触る)。

**書けるプレイヤー向けの要約は実在する**:
「森と沼地にも 4 人目が同行するようになった」= 画面で見える変化(酒場の卓・HP バー・出発時の顔ぶれ)。

### 2-6. 並走(2026-09-08 実測)

    $ git status --short
     M tavern.html
    ?? tools/verify_party_promises.js

隣窓が **#60 を `tavern.html` で実装中**。本チケットも `tavern.html` を触るので
**着手は #60 の着地(= 作業ツリー clean)を待つ**。`index.html` は #60 も本チケットも触らない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `recruitCountOf()` の ★連動を廃止 / `isRecruitOn()` の意味を反転 / コメントの更新 |
| `tools/verify_recruit_size.js` | §2-3 の言い分けへ改訂(⛔ 期待値の写経ではない) |
| `tools/verify_party_four.js` | **新規**。§8 の受入 |
| `実装依頼書/README.md` | 一覧行(§11 に文面あり) |

⛔ `index.html` は開かない。⛔ `js/recruit-candidates.js` は無変更(上限を触らないため)。

---

## 4. STEP1 — `recruitCountOf()` から ★連動を外す

`tavern.html` の `function recruitCountOf(sc)` を次の形にする。
⭐ **旧ロジックを消さない**。`?recruit=0` で ★連動へ戻す道を残すため `legacy` として切り出す。

    /* ★[#61] 依頼の重さ(★の数)と同行人数の連動を**廃止**した。
     *   全シナリオが主人公 1 + NPC RECRUIT_MAX = 4 人で出発する。
     *   ⭐ 変わるのは bandits-forest / lizard-swamp の 2 本だけ (他 4 本は元から NPC 3)。
     *   ⚠ ★ 表示 (sc.difficulty) は**画面に残す**。募集人数と切れても「敵の強さ」の
     *     表示としては正しい (2026-09-08 ユーザー決定)。
     *   ⚠ `recruit:` の個別上書き (#8 の goblin-mine = 3) は**読む経路を残す**。
     *     いまは RECRUIT_MAX と同値で恒等だが、将来「この依頼だけ 2 人」を作れる口を潰さない。
     *   ⚠⚠ ?recruit=0 は **★連動へ戻す**スイッチになった (#7 のときと意味が逆)。 */
    function recruitCountOf(sc) {
      const MIN = 1, MAX = RECRUIT_MAX;
      if (sc && typeof sc.recruit === "number" && isFinite(sc.recruit)) {
        return Math.max(MIN, Math.min(MAX, Math.floor(sc.recruit)));   // 個別上書きは今も効く
      }
      if (!isRecruitOn()) return recruitCountLegacy(sc);               // ?recruit=0 = ★連動へ戻す
      return MAX;                                                      // ★[#61] 既定 = 常に上限
    }
    /* ★[#61] ?recruit=0 のときだけ通る旧経路 (#7 の姿)。⛔ 中身を書き換えないこと —
     *   verify_recruit_size の (C) 群が「★の数へ戻る」ことをここで測る。 */
    function recruitCountLegacy(sc) {
      const MIN = 1, MAX = RECRUIT_MAX, FALLBACK = RECRUIT_MAX;
      let n = FALLBACK;
      if (sc && typeof sc.difficulty === "string") {
        n = (sc.difficulty.match(/★/g) || []).length;
      } else {
        console.log("[DIAG] recruit: fallback used (no difficulty) id="
          + ((sc && sc.id) || "(none)") + " -> " + FALLBACK);
      }
      return Math.max(MIN, Math.min(MAX, n));
    }

⚠⚠ **`partySize` を決める行から `isRecruitOn() &&` を外す**。今は「スイッチ ON のときだけ
`recruitCountOf` を使う」形だが、これからは**常に使う**(スイッチの意味が関数の中へ移った):

    // ★[#61] isRecruitOn() の判定は recruitCountOf() の中へ移した。ここでは常に呼ぶ。
    if (prepScenario) partySize = 1 + recruitCountOf(prepScenario);

⛔ **`RECRUIT_MAX = 3` は動かさない**。⛔ `devPartySizeOverride()`(#14 の調査シーム)も触らない。

## 5. STEP2 — `isRecruitOn()` のコメントを反転させる

関数の中身(`get("recruit") !== "0"`)は**1 文字も変えない**。⛔ `function` 宣言のまま置く
(`verify_recruit_size` の (S5) が「モジュール直下の const ではない」を正規表現で測っている)。
コメントだけを新しい意味へ書き換える。

## 6. STEP3 — シナリオ定義のコメントを追随させる

`tavern.html` の goblin-mine の `recruit: 3` の上のコメント(#8 の経緯)へ **1 行足す**:

    * ★[#61 / 2026-09-08] ★連動を廃止したので、この上書きは RECRUIT_MAX と同値 = 恒等になった。
    *   ⛔ 消さないこと。「この依頼だけ人数を変える」口が生きていることの唯一の実例。

---

## 7. 撤退スイッチ

- **`?recruit=0`** — **★の数に応じた 1〜3 人へ戻る**(#7 の姿)。
  ⚠⚠ **意味が反転する**。旧: 「★連動を切って一律 4 人」/ 新: 「★連動へ戻す」。
  ⭐ **名前は据え置く**。`verify_recruit_size` / `sweep_recruit_balance` / `probe_party_size` /
  `probe_s2_clear` の 4 本が `?recruit=0` を逐語で打っており、改名すると全部が空振りする。
- ⚠ 判定位置 = `tavern.html` の `isRecruitOn()`(毎回 `location.search` を読む。⛔ const に畳まない = TDZ)。
- ⚠ ページ遷移をまたぐか = **またがない**。人数が決まるのは酒場側の `partySize` の行だけで、
  `index.html` は決まった編成を受け取るだけ(`?party=N` の調査シームも酒場側)。

---

## 8. 受入条件 — `tools/verify_party_four.js`(新規・base port **10171**)

⭐ 測るのは「**6 シナリオすべてが主人公 1 + NPC 3 = 4 人で出発する**」。
⛔ 測らないのは**難易度**(クリア率・XP)。人数の変更が易しくしたかどうかは別チケットの仕事で、
ここで縛ると次のバランス調整が動かせなくなる。

### ⚠ 計測機構

`verify_recruit_size.js` の測定台をそのまま流用する(**酒場のページで裸の識別子を読む**)。
⛔ `index.html` を直接開く測定台を作らないこと —— `isRecruitOn()` / `recruitCountOf()` /
`scenarios` は **`tavern.html` にしか無い**。

### §0 装置(先に母集団を確かめる)

- **(0a)** `scenarios` が 6 件、`recruitCountOf` が function、`RECRUIT_MAX` が数値として
  裸の識別子で読めた ⭐ **これが無いと全 assert が空振りで永久緑になる**
- **(0b)** 期待値 3 を**写経していない**: 期待値は `RECRUIT_MAX` を実体から読んで使う
- **(0c)** 6 件のうち `difficulty` の ★ が **3 未満の行が 2 件以上実在する**
  (= ★連動を廃止したことに意味がある母集団であることの検査。全部 ★3 なら何も証明しない)

### §1 本体

- **(1a)** 経路 A(実際に編成された `selection.partyMembers` の長さ)が 6 件とも **4**
- **(1b)** 経路 B(`recruitCountOf(sc)` の直呼び)が 6 件とも **`RECRUIT_MAX`** —— **2 経路の突き合わせ**
- **(1c)** 森と沼が**実際に 3 → 4 へ動いた**: `?recruit=0` で 3、無指定で 4
  (⭐ 同じページの 2 腕で測る。片方だけでは「元から 4 だった」と区別できない)
- **(1d)** 隊列は `front → mid → rear` を保つ(4 人でも崩れない)

### §2 恒等(非退行)

- **(2a)** 廃坑・砦・神殿・竜の巣の 4 本は **`?recruit=0` と無指定で人数が同じ**(元から 4 人)
- **(2b)** `RECRUIT_MAX` は 3 のまま(⛔ 上限を外していない)
- **(2c)** 「同行の約束: n / 3 人」の表示が `RECRUIT_MAX` から導かれている(#54 の不変条件)

### §3 撤退

- **(3a)** `tavern.html?recruit=0` → 6 件が **★の数**(廃坑は `recruit:3` の上書きで 3)へ戻る
- **(3b)** `?recruit=0` で `[DIAG] recruit: fallback used` が生成クエストのときだけ 1 行出る

### ⛔ 測らないこと

- **クリア率・XP・戦闘時間**(別チケット。ここで縛ると調整が動かせない)
- **★ の表示文字列**(画面に残す決定だが、文言は動かす余地を残す)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `starlink` | `recruitCountOf` を ★連動へ戻す(`return MAX` を旧式へ) | §1(1a)(1b)(1c) |
| `capout` | `RECRUIT_MAX` を 4 にする | §2(2b) / §1(1b) |
| `switchdead` | `isRecruitOn()` を常に true にする | §3(3a) ⭐ **§2-3 の罠の再現** |
| `nolegacy` | `recruitCountLegacy` が常に `MAX` を返す | §3(3a) |
| `partysizeline` | `partySize` の行から `recruitCountOf` を外して `PARTY_SIZE` 直読みへ | §1(1a) |

⭐ `switchdead` が §2-3 の罠 =「スイッチの意味を反転させたのに旧経路が死んでいる」の再現。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_recruit_size.js` → **改訂後 82/82**
  ⚠ **2026-09-08 実測で素 82/82 PASS**。改訂で本数が変わるなら、変わった理由を §12 に書く
- `node tools/verify_recruit_talk.js` → 着手前に素で走らせて基準を取る(⭐ `RECRUIT_MAX` を実体から
  読む設計なので**赤くならないはず**。予想が外れたら §12 に書く)
- `node tools/verify_prep_retire.js` → 同上(§2-4。goblin-mine で走るので影響しないはず)
- `node tools/verify_mercenary_roster.js` → orc-fort ★3 = 3 のまま = 影響しないはず

⚠ 基準値は 2026-09-08 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` では音が出ない)。

1. 森(★2)を受注 → 出発前の卓に **4 人**並ぶか。HP バーが 4 枚 + 撤退ボタンで**画面からはみ出さないか**
2. 沼地(★2)で同じ確認
3. **手応え**: 森と沼が易しくなりすぎていないか(別チケットの入力になる。数値は測らず体感でよい)

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>森と沼地にも 4 人目が同行するように</b> — 依頼の格に関わらず、仲間は常に 3 人まで連れて行ける。"

---

## 11. やらないこと

- ⛔ **難易度・XP の再調整**(別チケット。#8 と同じくペア比較で測る必要がある)
- ⛔ **5 人以上**(`RECRUIT_MAX` は据え置き。#14 の調査チケットの範囲)
- ⛔ **`tools/sweep_recruit_balance.js` の期待表の更新**(golden ではなく 80 走行の調査ツール。
  次にバランスを測るときに、そのチケットで腕ごと組み直す)
- ⛔ **`?recruit=0` の改名**(4 本のドライバが逐語で打っている)
- ⛔ **★ 表示の削除**(画面に残す決定)
- ⛔ **`index.html` を開くこと**
- ⛔ **`実装依頼書/README.md` への行追加は #60 が着地してから**。用意してある行:

    | 61 | [2026-09-08_party-size-four-all-scenarios.md](2026-09-08_party-size-four-all-scenarios.md) | **承認済**(2026-09-08) | 0% | ★の数と同行人数の連動(#7)を廃し、**全 6 シナリオを主人公1+NPC3 = 4 人**へ。⭐ **実際に動くのは森と沼の 2 本だけ**(他 4 本は元から 4 人 = engine の 4 人対応は出荷済み)。⭐⭐⭐ `?recruit=0` の **(C) 腕が新しい既定の姿**(2026-09-08 実測)。⚠⚠⚠ `verify_recruit_size`(素 **82/82**)は**正しく赤くなる** — ⛔ 期待表を写経して緑にせず assert を言い直す。⚠ `?recruit=0` は**意味が反転**(★連動へ戻す)。名前は据え置き(4 本のドライバが逐語で打つ)。受入 `verify_party_four`(新規・base **10171**) |

---
## 12. 実装結果

> 実装窓 / dev-loop 4 項目(2026-09-08〜09)。⚠ **push はしていない**(ユーザー承認事項)。

### 12-1. 着地した commit(5 本)

| # | commit | 件名 | 中身 |
|---|---|---|---|
| 項目1 | `1b369f0` | #61 項目1 — ★連動を廃止し全シナリオを主人公1 + NPC3 = 4 人へ | `tavern.html` 本番実装(§4〜§6)。`recruitCountOf()` は既定で常に `RECRUIT_MAX`、旧 ★連動は `recruitCountLegacy()` へ隔離し **`?recruit=0` のときだけ**通る。`partySize` の行から `isRecruitOn() &&` を外した。changelog 1 行追記 |
| 項目2 | `77879b4` | #61 項目2 — verify_recruit_size の assert を #61 の仕様へ言い直す | 既存 golden の改訂。**72/82 exit 1 → 91/91 exit 0** |
| 項目3 | `7190eb7` | #61 項目3 — 受入 verify_party_four.js (新規・base 10171) 素 17/17・変異 5/5 | 受入ドライバの新規作成 |
| 項目4(A) | `19f50e1` | #61 項目4(A) — 母集団で正しく赤くなった probe_s2_clear の assert を言い直す | 母集団 **54 本**を実走して見つかった唯一の「#61 が赤くした本」を回収 |
| 項目4(B) | 本行を書いたコミット | #61 項目4 — 母集団 54 本の非退行 + 台帳と §12 の締め | `実装依頼書/README.md` の #61 行を「完了 / 100%」へ・本 §12 |

### 12-2. 受入 `tools/verify_party_four.js`(新規・base **10171** / 枠 10171〜10180)

    node tools/verify_party_four.js              → PASS 17 / FAIL 0   exit 0
    node tools/verify_party_four.js --negative   → 負のコントロール 5 / 5 が検出成功   exit 0

**変異 5 本の実測**(⭐ 期待した節はすべて命中 = **空振り 0**。巻き添えは許容):

    starlink      期待 [1a,1b,1c]     実際に赤 [1a,1b,1c,1a2,1e]        命中 [1a,1b,1c]
    capout        期待 [2b]           実際に赤 [1a,1b,2a,2b]            命中 [2b]
    switchdead    期待 [3a]           実際に赤 [1c,1e,3a,3b]            命中 [3a]
    nolegacy      期待 [3a]           実際に赤 [1c,1e,3a]               命中 [3a]
    partysizeline 期待 [1a2,1c,3a]    実際に赤 [1c,1a2,1e,3a,3a2,3b]    命中 [1a2,1c,3a]

⭐ 変異の子ポートは **10172〜10176**(`PORT + 1 + MUT_ORDER.indexOf(key)`)。

### 12-3. 既存 golden `verify_recruit_size` の改訂 — **72/82 → 91/91**

⛔ **期待表 `EXPECTED_NPC_RECRUIT` は 1 文字も書き換えていない**(`git diff f5d9e6d..HEAD -- tools/verify_recruit_size.js`
で `'goblin-mine': 3` 以下 6 行に `+`/`-` が **0 行**)。やったのは 2 つだけ:

1. **腕(URL)と表の対応を入れ替えた** — `EXPECTED_NPC_RECRUIT`(★の数の表)を
   **既定腕 (A) から `?recruit=0` 腕 (C) へ**、新設の `EXPECTED_UNIFORM`(= `uniformExpectation(ids, LIVE_MAX)`)を
   **(C) から (A) へ**。⭐ **2 つの表が腕を入れ替えるだけ**で、値は両方とも本番から導出。
2. **測定点の移設** — (B) 群の出所を `EXPECTED_NPC_RECRUIT['goblin-mine']` から **`LIVE_MAX`(本番の `RECRUIT_MAX`)**へ。

**assert ID 集合の差分**(源から機械抽出。`check('(XX)` の literal):

    着手前 83 個 → 着地後 92 個(うち (FATAL) は異常系なので実走は 91 本)
    新設 9 件 = (S11) (Az5) (A5) (Cz7) (Dz8) (F5) (F6) (FLz0) (Gz5)
    削除 0 件 / 緩めた 0 件

⇒ **+9 は「新しい仕様で新しく言えるようになった主張」**(★連動の廃止で初めて成立する不変条件)。

### 12-4. ⭐⭐⭐ 起草(本依頼書)の主張が実測で崩れた点 — 通算 **17 件**

| # | 起草の主張(§) | 実測 |
|---|---|---|
| 1 | §2-1「`?recruit=0` の (C) 腕が本チケット後の既定の姿 ⇒ この対応関係を使うのが最短」 | ⛔ **そのままでは使えない**。着地後の (C) 腕はもう「全部 4 人」ではない(★連動へ**反転**したので `3,2,2,3,3,3`)。正しい言い直しは「**2 つの表が腕を入れ替えるだけ**」(§12-3) |
| 2 | §2-3「赤くなるのは (A) 群 / (C) 群」 | **6 件少なかった**。実際に赤くなったのは **10 件** = `(A) (C) (Cz3) (Cz4) (D3) (Dz7) (F2) (F3) (G) (Gz2)`。⭐ 起草が「残す」と書いた `(A4) (G4) (G5)` と `(Gz1)` は予想どおり緑のまま |
| 3 | §2-1 に記録された (A)/(C) の**隊列文字列** | **再現しない**。NPC の職抽選が乱択なので **人数だけが安定**。⇒ 受入は隊列文字列を写経せず **述語**(front→mid→rear の単調非減少 + `maxDistinct >= 2`)で測った |
| 4 | §8「既存 golden の非退行」= 4 本 | ⛔ **足りない**。`recruitCountOf\|RECRUIT_MAX\|isRecruitOn` の grep だけで **8 本**(+受入で 9 本)。⭐ **`verify_party_promises`(#60 の golden)が漏れていた**(実走 35/35 緑・非退行)。さらに `tavern.html` を読む golden 全体は **52 本**(§12-6) |
| 5 | §8 変異表「`partysizeline` は (1a) を赤くする」 | ⛔ **赤くならない**。真因 = `PARTY_SIZE === 1 + RECRUIT_MAX` なので `partySize = PARTY_SIZE` 直読みにすり替えても**既定腕では人数が偶然一致する**。捕まえたのは `recruit: RECRUIT_MAX-1` の注入と 2 腕比較(`(1a2)(1c)(3a)(3a2)(3b)`)。⭐⭐⭐ **一般形 = 「定数と導出値がたまたま同値の系では、値そのものを見る assert は『導出が死んでいる』を検出できない。注入して動かすか 2 腕で差を取るしかない」** |
| 6 | §8 変異表「赤くなるべき節」を 1 節に絞る書き方 | ⛔ **必ず外れる**。実測の広がり = starlink 5 本 / capout 4 本 / switchdead 4 本 / nolegacy 3 本 / partysizeline 6 本。⇒ 変異の期待は**必須条件(want が全部赤くなる)**として書き、巻き添えは許容する形が正しい |
| 7 | §8 変異表「`capout` は (1b) が赤くなる」 | **当たっているが理由が違う**。(1b) が赤いのは goblin-mine の `recruit: 3` が上限 4 と食い違うからで、期待値を `RECRUIT_MAX` から導いた効果ではない。上限外しを**本当に**捕まえているのは (2b) の直値 `RECRUIT_MAX === 3` + `PARTY_SIZE - 1 === RECRUIT_MAX` |
| 8 | §8「`verify_recruit_size` を `--negative` で確かめる」(暗黙) | ⛔ **`--negative` の腕が最初から無い**(`grep -cE "negative\|mutate\|MUT_" tools/verify_recruit_size.js` = **0**)。代用として `git worktree` で pre-#61 ツリーへ当てた → **79/91 exit 1**(赤 12 件) |
| 9 | §8「非退行を確かめる道具」として `probe_party_size` を数える | ⛔ **着手前から壊れている**(§12-7 の別チケット候補)。#61 とは無関係 |
| 10 | (起草に無い / 実装で踏んだ) | ⚠ **ドライバのヘッダのブロックコメントに `**/(index|world)\.html/` と書くと `*/` でコメントが閉じて SyntaxError**。⇒ 新規ドライバのヘッダは `grep -n -F '**/' <file>` で検査する |
| 11 | (起草に無い / 実装で踏んだ) | ⚠ **`page.__navBlocked` は `location.href` 代入の直後に読むと必ず 0 件**(同期では飛ばない)⇒ **900ms 待つ**。⭐ さらに **6 回出発しても abort は 1 件しか立たない**(同じ tick の代入が最後の 1 本に畳まれる)ので閾値は `>= 6` ではなく **`>= 1` + 「まだ /tavern.html に居る」** |
| 12 | (起草に無い / 実装で踏んだ) | ⚠ **「同行の約束」の表示は `?recruittalk=0` の腕では測れない**(#60 の世界 = 既定 ON 側)。さらに markup の初期値 `<div id="promisesBadge" ...>🤝 0 / 3</div>`(`tavern.html:3346`)が**焼いてある**ので、本番の `paintPromisesBadge()` / `renderPromisesPanel()` を呼び直さずに読むと**偽の緑**になる |
| 13 | §8「既存 golden の非退行」の 4 本 + §11 の除外 1 本(`sweep_recruit_balance`)で足りる | ⛔ **足りない**。`tools/probe_s2_clear.js`(#18 のシナリオ2 クリア率プローブ)が **§8 にも §11 にも載っていないのに正しく赤くなった**(装置 assert `0a_recruitArm` の期待値 `S2_EXPECT.npc = 2` が ★連動の写し)。項目4 で言い直した(§12-6) |
| 14 | (起草に無い / 実測で判明) | ⚠ **`probe_s2_clear --negative` の `wipeblind` は着手前から空振り**(`f5d9e6d` でも ⛔)。真因は #54 =「誰も誘わなければソロ」で**仲間が 0 人**なので「仲間の生存数を常に 0 と報告させる」変異が **no-op** になる。⛔ #61 の赤ではない(§12-7 の別チケット候補) |
| 15 | (起草に無い / 実測で判明) | ⚠⚠ **`driver_monsters_griffon` は多重実行の負荷でフレークする**。母集団の直列走では 14/17 exit 1 だが、**着地後のツリーを単独で回すと 17/17 exit 0**。同条件のペアでは **base 15/17 / head 15/17 = 一致**。⇒ **型2 の偽の赤**。⭐ #61 が原因になり得ない構造的証拠 = 落ちる 3 本はすべて `index.html?autoplay` 上の戦闘サンプリングで、#61 は `index.html` を **1 バイトも触っていない**(`git diff f5d9e6d..HEAD --stat` = `tavern.html` + `tools/` 2 本のみ) |
| 16 | (起草に無い / 実測で判明) | ⚠ **`driver_monsters_umberhulk` も同じフレーク**。母集団の直列走 = **21/22 exit 1**(FAIL は `(3) 再発火: 同一 enemyIdx が2回以上 gaze — maxGazesPerEnemy=1`)。⭐ **単独で回すと `f5d9e6d` = 21/22 / `7190eb7` = 22/22 exit 0** —— **着地後のツリーのほうが緑** |
| 17 | (起草に無い / 実測で判明) | ⚠ **`driver_mapeditor` は着手前から赤い**(型3)。`f5d9e6d` でも `7190eb7` でも **176/179 exit 1**、FAIL 3 行の**文面まで完全一致**(`§2 12b 実測=[7,27,20,46] 期待=[9,27,22,46]` / `§3 12a [33,10]` / `§3 12b [35,13]`)。map-editor.html の実マウス試験で #61 とは無関係 |

### 12-5. `verify_recruit_size` を 3 通りに当てて「言い直しが正しい向き」であることを確かめた

⭐ このドライバには **`--negative` の腕が最初から無い**(`grep -cE "negative|mutate|MUT_"` = **0**)。
代わりに **`git worktree` で本番とドライバを組み替えた 3 通り**を実走した(使い捨て port 10201〜10203):

| # | 本番(配信ツリー) | ドライバ | 結果 | 意味 |
|---|---|---|---|---|
| ① | `f5d9e6d`(pre-#61) | 旧 (`f5d9e6d`) | **82/82 exit 0** | **着手前の基準**(依頼書 §2-1 の記録どおり) |
| ② | `7190eb7`(post-#61) | **旧** | **72/82 exit 1** | 仕様を変えたので**正しく赤くなる**。赤 **10 件** = `(A) (C) (Cz3) (Cz4) (D3) (Dz7) (F2) (F3) (G) (Gz2)` |
| ③ | `f5d9e6d`(pre-#61) | **新** | **79/91 exit 1** | ⭐ **`--negative` の代用**。新しい golden を古い本番に当てると **12 件**赤くなる = 言い直しは空振りしていない |
| ④ | `7190eb7`(post-#61) | 新 | **91/91 exit 0** | 着地後 |

⭐⭐⭐ ②③ の両方が赤いことが「**assert を緩めていない**」の機械的な証拠。
①→④ で assert が **83 → 92**(実走 82 → 91)に**増えている**のに、②③ が赤いままなのだから
「本番に合わせて期待値を寝かせた」形にはなり得ない。

### 12-6. 母集団の非退行(2026-09-09 / 着手前 = `f5d9e6d` と比較)

⭐⭐⭐ **依頼書 §8 が挙げた 4 本では足りない。** 母集団は**台帳から導出**した(定数で焼かない):

    grep -ln 'recruitCountOf\|RECRUIT_MAX\|isRecruitOn' tools/*.js            → 9 本 (受入込み)
    grep -ln 'recruit=0'                          tools/*.js                 → 4 本 (受入込み)
    grep -ln 'tavern\.html'                       tools/*.js                 → 52 本  ← ⭐ 本命
    ↑ の外で party 語を持つ 3 本(`driver_field_step7` / `driver_heromark_signplate` /
      `verify_cone_cast`)を和集合で足して **55 本**

⭐ `tavern.html` は #61 で変更されたので、**酒場ページを開くドライバは全部が母集団**。
⚠ 実走は **直列**(同番ポートが 8801×3 / 8831×2 / 8893×2 / 8897×3 あり、並列は偽の赤を生む)。

#### (A) 正しく赤くなった 1 本 — `tools/probe_s2_clear.js`(⛔ 依頼書 §8 / §11 のどちらにも載っていない)

| | 着手前(`f5d9e6d`) | 項目1〜3 の直後 | 言い直し後 |
|---|---|---|---|
| 素(腕 base) | **✓ 3/3 走行が装置 assert 通過 exit 0** | **⛔ 3/3 走行が装置 assert 崩れ exit 1** | **✓ 3/3 exit 0** |
| 腕 `qs:recruit=0` | — | — | **✓ 1/1 exit 0** |
| `--negative` | 5/6(`wipeblind` が空振り) | — | **5/6**(⭐ **着手前と同一**) |

**赤の中身**: `0a_recruitArm got={"recruitOn":true,"decided":3,"stars":2}` —
装置 assert が `decided === S2_EXPECT.npc`(= **2** = ★の数)を要求していた。

**直し方(⛔ 写経していない)**: `S2_EXPECT.npc` の **値は 1 文字も変えず**、
**当てる腕を入れ替えた**(§12-3 の `verify_recruit_size` と同型):

- `?recruit=0` の腕 … 期待 = `S2_EXPECT.npc`(★の数。#8 から不変)
- それ以外の腕 … 期待 = **本番の `RECRUIT_MAX`**(`KICK` が新しく返す `out.max`。⛔ 3 を焼かない)
- ⭐ さらに `typeof kick.max === 'number' && kick.max > 0` を AND した
  ——「読めないまま緑になる測定器」を作らないため

**負のコントロールの健在**: `norecruitarm`(腕から `&recruit=0` を外す)は
言い直し後も **`0a_recruitArm` が赤くなる**(実測)。
⚠ `wipeblind` は **着手前(`f5d9e6d`)でも赤くならない** = #61 と無関係の既存の空振り(§12-7)。

#### (B) 実走した全 54 本(⛔ 緑を赤にした本は **0**)

⚠ `exit` 列の `124` は `timeout 900` による強制終了。

| ドライバ | 集計行 | exit | FAIL 行 |
|---|---|---|---|
| `driver_action_priority` | [driver] RESULT: PASSED 92 / FAILED 0 / PENDING 0 | 0 | 0 |
| `driver_bgm_town` | 17/17 PASS | 0 | 0 |
| `driver_cleric_sprites` | [driver] RESULT: 85/85 passed | 0 | 0 |
| `driver_depart_menu_clean` | ══════════ 結果: 41/41 PASS ══════════ | 0 | 0 |
| `driver_dev_gate` | [driver] RESULT: 52/52 passed | 0 | 0 |
| `driver_dev_gate2` | ══════════ 結果: 62/62 PASS ══════════ | 0 | 0 |
| `driver_elf_sprites` | [driver] RESULT: 87/87 passed | 0 | 0 |
| `driver_equip_compact_ios` | === WORKTREE: 31/31 PASS === | 0 | 0 |
| `driver_field_step0` | === 測定妥当性 33/33 PASS === | 0 | 0 |
| `driver_field_step1_geo` | === 71/71 PASS === | 0 | 0 |
| `driver_field_step5` | === driver_field_step5  48/48 PASS === | 0 | 0 |
| `driver_field_step7` | === driver_field_step7  79/79 PASS === | 0 | 0 |
| `driver_field_wagon` | === 測定妥当性 18/18 PASS === | 0 | 0 |
| `driver_fix4_help_bonus` | [driver] RESULT: 13/13 passed | 0 | 0 |
| `driver_heromark_signplate` | 46 / 46 PASS | 0 | 0 |
| `driver_mapdef_step1` | === 208/208 PASS === | 0 | 0 |
| `driver_mapdef_step2` | 74/74 PASS | 0 | 0 |
| `driver_mapeditor` | [driver] 176/179 PASS  (FAIL 3) | 1 | 3 |
| `driver_monsters_chimera` | [driver] RESULT: 17/17 passed | 0 | 0 |
| `driver_monsters_griffon` | [driver] RESULT: 14/17 passed | 1 | 3 |
| `driver_monsters_umberhulk` | [driver] RESULT: 21/22 passed | 1 | 1 |
| `driver_party_view_reopen` | ========== 結果: 35/35 PASSED / 0 FAILED / 0 PENDING ========== | 0 | 0 |
| `driver_rogue_sprites` | [driver] RESULT: 49/49 passed | 0 | 0 |
| `driver_skillcheck_roster` | [driver] RESULT: 13/13 passed | 0 | 0 |
| `driver_warrior_variants_sprite` | [driver] RESULT: 50/50 passed | 0 | 0 |
| `probe_party_size` | (集計行なし) | 124 | 16 |
| `probe_s2_clear` | [probe] ⛔ 装置 assert が崩れた走行が 3/3 件あります | 1 | 0 |
| `sim_plaza_entry` | (集計行なし) | 0 | 0 |
| `verify_ability_scores` | 24/24 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_aoe_coverage` | 28/28 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_cone_cast` | 19/19 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_darkvision` | 25/25 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_hold_person` | 31/31 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_mercenary_roster` | [mercenary-roster] 44 PASSED / 0 FAILED / 0 PENDING  (44/44) | 0 | 0 |
| `verify_npc_crowd` | 32/32 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_party_four` | PASS 17 / FAIL 0 | 0 | 0 |
| `verify_party_match_setup` | [driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0   (合計 36) | 0 | 0 |
| `verify_party_promises` | 35/35 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_player_sheet` | 73/73 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_pm_drawer_fit` | 75/79 PASSED   FAILED 0   PENDING 4 | 0 | 0 |
| `verify_prep_retire` | 30/30 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_quest_walk` | 25/25 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_recruit_size` | ══════════ 結果: 91/91 PASS ══════════ | 0 | 0 |
| `verify_recruit_talk` | 25/25 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_road_ambush` | 41/41 PASSED | 0 | 0 |
| `verify_road_boon` | 20/20 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_run_chronicle` | [run-chronicle] 73 PASSED / 0 FAILED / 0 PENDING | 0 | 0 |
| `verify_save_slots` | [save-slots] RESULT: 30/30 passed | 0 | 0 |
| `verify_tavern_map` | 43/43 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_title_screen` | [title-screen] RESULT: 86/86 passed | 0 | 0 |
| `verify_town_exit` | 素 23/23 PASSED  (PENDING 0) | 0 | 0 |
| `verify_town_map` | 85 / 85 PASS | 0 | 0 |
| `verify_world_map` | 57/57 PASSED   FAILED 0   PENDING 0 | 0 | 0 |
| `verify_world_steps` | 33/33 PASSED   FAILED 0   PENDING 0 | 0 | 0 |

⭐ **49 本が exit 0・FAIL 行 0**。残り 5 本の内訳は上の (A) と下の (C)。

#### (C) 着手前から赤い / フレークする 4 本(⛔ #61 の赤ではない・緑にしにいかない)

| ドライバ | 母集団の直列走 | 着手前(`f5d9e6d`)を**単独**で | 着地後(`7190eb7`)を**単独**で | 型 |
|---|---|---|---|---|
| `driver_mapeditor` | 176/179 exit 1 | **176/179 exit 1** | **176/179 exit 1** | **型3** ⭐ FAIL 3 行の**文面まで完全一致** — `§2 12b 実測=[7,27,20,46] 期待=[9,27,22,46]` / `§3 12a [33,10]` / `§3 12b [35,13]`。map-editor.html の実マウス試験で #61 とは無関係 |
| `driver_monsters_griffon` | 14/17 exit 1 | 17/17 → 15/17(負荷でばらつく) | **17/17 exit 0**(単独・負荷なし) | **型2(フレーク)** ⭐ 決定打 = **着地後のツリーを単独で回すと 17/17 緑**。同条件のペアでは base 15/17 / head 15/17 で一致。落ちる 3 本は `index.html?autoplay` の戦闘サンプリングで、#61 は `index.html` を 1 バイトも触っていない |
| `driver_monsters_umberhulk` | 21/22 exit 1 | **21/22 exit 1** | **22/22 exit 0**(単独) | **型2(フレーク)** ⭐ 着地後のほうが緑。FAIL は `(3) 再発火: 同一 enemyIdx が2回以上 gaze — maxGazesPerEnemy=1` |
| `probe_party_size` | **exit 124**(`timeout 900` で強制終了)/ NG **16** | **exit 124 / NG 15** | **exit 124 / NG 16**(直列走と同じ) | **型3 + 1 件だけ #61** ⭐ 増えた 1 件は **`(2b) 経路 B (recruitCountOf の戻り値) とも一致する`** だけ(`goblin-mine:3 bandits-forest:3 lizard-swamp:3 orc-fort:3 undead-temple:3 dragon-lair:3` = **新しい仕様のほうが正しい**。ドライバの期待表が ★連動のまま)。⛔ 依頼書 §11 と実装窓への指示に従い**直さない**(§12-7) |

⭐⭐⭐ **結論: #61 が「緑を赤にした本」は 0 本。**
正しく赤くなった `probe_s2_clear` は言い直して回収し、
**期待値の写経も、下限を下げる緩和も、golden の焼き直しも 1 件も行っていない。**

### 12-7. ⚠ 別チケット候補(⛔ 本チケットでは直さない)

#### (a) `tools/probe_party_size.js` が着手前から壊れている

**症状**: 6 シナリオとも **NPC 0 / 隊列 0 人**、最後は §7 で `timeout 900` に達して **exit 124**。

**真因**: #23(2026-08-26)が出発導線へ `world.html` を **1 段挟んだ**のに、このプローブは
`index.html` への遷移しか abort していない。

    tools/probe_party_size.js:1049   /\/index\.html/.test(r.url())
    tools/verify_recruit_size.js:300 /\/(index|world)\.html/.test(r.url())   ← 対処済み

`verify_recruit_size.js:290` は「⚠⚠⚠ **world.html を含めること**」と明記して直しているので、
**同じ穴を probe 側だけ塞いでいない**。酒場のタブが本当に地図へ遷移してしまい、
以降の evaluate が全部空になる。

**#61 が原因でない証拠**(2 つ):

1. #61 が 1 ビットも動かさない `goblin-mine`(`recruit: 3` で前後とも 3)まで NPC 0。
2. **`f5d9e6d` で走らせても exit 124 / NG 15 件**。`7190eb7` は NG 16 件で、
   増えた 1 件は **`(2b) 経路 B (recruitCountOf の戻り値) とも一致する`** だけ。
   その (2b) の実測は `goblin-mine:3 bandits-forest:3 lizard-swamp:3 orc-fort:3 undead-temple:3 dragon-lair:3`
   = **新しい仕様のほうが正しく、ドライバの期待表が ★連動のまま**という形。

⇒ **回収は 1 本のチケットで**: ①`world.html` を abort 対象へ足す(1 行)→ ②§2 群の期待表を
`verify_recruit_size` / `probe_s2_clear` と同じ「**当てる腕を入れ替える**」で言い直す。
⛔ ①だけやると §2 が赤いまま、②だけやっても §5/§6 は空のまま。

#### (b) `probe_s2_clear --negative` の `wipeblind` が空振り

**`f5d9e6d` でも `7190eb7` でも赤くならない**(実測。⛔ #61 の赤ではない)。
真因は #54 =「誰も誘わなければ **ソロ**」で **仲間が 0 人**なので、
「仲間の生存数を常に 0 と報告させる」変異が **no-op** になる。
⇒ 直すなら「仲間が実在する腕(`?recruittalk=0`)で変異を当てる」か、
変異を「主人公自身の生存も 0 と報告させる」へ広げる。

### 12-8. ⛔ 走らせていない 1 本

`tools/sweep_recruit_balance.js` — **依頼書 §11 が「直さない」と明記**した 80 走行の調査ツール
(golden ではない)。`SCEN_TABLE.newNpc` の期待表は #7 の ★連動のままなので、
次にバランスを測るチケットで**腕ごと組み直す**。
⚠ `?recruit=0` の意味が反転したので、このツールが打っている `recruit=0` は
**いま「★連動へ戻す」**を意味する(= 皮肉にも #7 当時の期待表と整合する側へ動いた)。

### 12-9. 残った宿題 = 実機体感(依頼書 §9)

⚠ ローカルは **http 起動が必須**(`file://` では音が出ない)。

1. **森(★2)を受注** → 出発前の卓に **4 人**並ぶか
2. **沼地(★2)** で同じ確認
3. HP バーが **4 枚 + 撤退ボタン**で画面からはみ出さないか(iPhone 縦)
4. **手応え** — 森と沼が易しくなりすぎていないか

⚠⚠ **#62 の難易度・XP 再調整は #61 の 4 人化と合算してから 1 度で測る**
(依頼書 §11 / #62 の申し送り)。人数と敵を別々に測ろうとすると 80 走行が 2 回要る。
