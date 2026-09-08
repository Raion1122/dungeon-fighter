# #61 全シナリオを 4 人編成へ(★連動の廃止)

- **起草**: 2026-09-08(計画窓 `claude-76`) / **ステータス**: **承認済**(2026-09-08 ユーザー承認)
- **着手**: ⏸ **保留 — #60 の着地待ち**(`tavern.html` が衝突する)。着地判定は台帳の文面ではなく **作業ツリーが clean** で見る。
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

(実装窓が埋める)
