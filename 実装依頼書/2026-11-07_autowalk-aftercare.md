# #110 #109 の後始末 — 霜の巨人の (6b) の基準を言い直す + 襲撃で「見捨てる」の後も歩き続けるかを受入に足す

- **起草**: 2026-11-07(計画窓) / **ステータス**: **承認済**(2026-11-07 ユーザー承認)
- **触るファイル**: `tools/verify_frost_hold.js` / `tools/verify_world_autowalk.js` / 依頼書 `2026-11-06_world-autowalk-quest-signs.md` の §12(追記だけ)
- ⛔ **触らないファイル**: `index.html` / `world.html` / `tavern.html` / `js/*.js`(本番は 1 バイトも変えない = 検証ツールだけのチケット)
- 並走: 2026-11-07 時点で作業ツリーはクリーン(HEAD `b46b94d` = origin と同期)。それでも **ファイル単位 add**。

---

## 1. 目的

#109 の実装窓から申し送りが 2 件あった(2026-11-07)。どちらも本番の不具合ではなく **検証ツールの穴**。

1. `verify_frost_hold` の **(6b) が #108 から赤のまま**。#108 項目3(`614270e`)が `defeatEnemy` に `markHiddenFoeSlain(enemy);` を 1 行足した(意図した変更)ので、「#107 の着手前 `0298eca` と同じソース」を求める (6b) が赤になる。赤のまま放置すると、本当に誰かが触らない約束の関数を壊したときに気づけない。
2. **#109 の受入の穴**: 襲撃で「見つからぬよう街道を外れて通り過ぎる」を選んで地図に残る枝の再開口 `RE.showResult(ev, text, resumeAutoWalk, null)` を測る節が無い(`null` に戻してもどのドライバも赤にならない)。

**ユーザー決定(2026-11-07)**: 次の依頼書 #110 は「#109 の後始末」(ダイアログで選択)。

---

## 2. 着手前の実測(2026-11-07・HEAD `b46b94d`)

### 2-1. (6b) の中身

| ファイル:行 | 何 |
|---|---|
| `tools/verify_frost_hold.js:136` | `const BASE_REV = '0298eca';`(#107 の着手前。(6a) ほか他の節もこの基準を使う) |
| `tools/verify_frost_hold.js:161-162` | `KEEP_FNS` = `pickBossAction` / `tryReflectEnemySpell` / `tryCounterEnemySpell` / `counterspellWanted` / `resolveElementDefense` / `hagMistPassage` / `checkDungeonClear` / **`defeatEnemy`** / `runEncounter` / `checkTrapTrigger` |
| `tools/verify_frost_hold.js:1360-1363` | 各関数を `fnSource(BASE_INDEX, n)` と `fnSource(curIndex, n)` で切り出して完全一致を見る |
| `index.html:19169` | `markHiddenFoeSlain(enemy);      // ★[#108] …` ← `defeatEnemy` の中。`git diff 0298eca 614270e -- index.html` に `+` で 1 行だけ出る |

`git log 0298eca..HEAD -- index.html` = `b59766e`(#107 強さ)/ `0fe80e2`(#107 本体)/ `f5d52f5`(#108 項目2)/ `614270e`(#108 項目3)。**#109 は index.html を触っていない**。実装窓の報告では長さ 6517 → 6596(+79 = 足した 1 行)。

### 2-2. ⚠⚠ 罠 A — BASE_REV を丸ごと動かしてはいけない

`BASE_REV` は (6a)(罠の乱数列)や (3h) など **他の節の基準でもある**。`BASE_REV` を `614270e` へ動かすと、#107 自身が足したもの(霜の峠・冬狼など)が「基準と同じ」側へ吸い込まれ、(6a) 等の意味が変わる。
→ **`defeatEnemy` だけ基準の版を個別に持つ**:

    /* ★[#110] 意図して変えた関数は、その変更を入れたコミットを基準にする。
       ⭐ 足すときは「どのチケットのどのコミットで何を足したか」を必ず書く。 */
    const KEEP_BASE = { defeatEnemy: '614270e' };   // #108 項目3: markHiddenFoeSlain を 1 行足した

(6b) の比較は `KEEP_BASE[n] || BASE_REV` の版から `index.html` を `git show` して切り出す。
⛔ 他の 9 関数の基準は `0298eca` のまま。⛔ (6b) から `defeatEnemy` を外して通すのは不可(番人が 1 人減る)。
⭐ §8 の変異 `basemove`(BASE_REV ごと動かす)で罠 A を装置に内蔵する。

### 2-3. 襲撃の枝(world.html)

| ファイル:行 | 何 |
|---|---|
| `world.html:1502` `onAmbushChoice` | 判定なし(`check:false`)の枝は `finishRoadAmbush(choice, null, atId)` へ直行 |
| `world.html:1523` | `var fight = !!(choice && choice.check && outcome);` |
| `world.html:1531` | ★ `if (!fight) { RE.showResult(ev, text, resumeAutoWalk, null); return; }` ← 穴の再開口 |
| `world.html:1534` | 戦う枝は `location.href = "index.html"`(world を去る) |
| `js/road-events.js:496-510` | `AMBUSH.choices` = 「茂みから回り込み、隙を突く」(check:true)/ **「見つからぬよう街道を外れて通り過ぎる」(check:false)** |
| `world.html` `maybeRoadAmbush` | 撤退 `?ambush=0` / 拠点では出ない / **`hasRealParty()` が偽なら出ない**(4 人分の `partyMembers` を sessionStorage に種まく必要)/ `RE.ambRoll()` |

`tools/verify_world_autowalk.js` は今、**全部の窓を `?ambush=0` で開いている**(`:232` `QUIET` / `:424` / `:440` / `:462`)= 襲撃の腕が 1 本も無い。変異は 8 本(`:96` `MUT_ORDER`)で、`noresume`(`:85`)は **街道の出来事**側(`RE.showResult(ev, text, resumeAutoWalk, boon);`)だけを潰す。
襲撃を確実に出す種の探し方・`partyMembers` の種まきは `tools/verify_road_ambush.js` に前例がある(`:111` の注記)。写経せずに同じやり方を使う。

### 2-4. changelog の要否

`scripts/hooks/check_changelog.py:32` の `GAME_LOGIC` = `index.html` / `tavern.html` / `audio.js`。本チケットは **tools だけ**なので鳴らない。プレイヤーに見える変化も無いので書かない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/verify_frost_hold.js` | `KEEP_BASE` を足し、(6b) を関数ごとの基準で比べる。変異 `basemove` / `keepdrift` を `--negative` に足す |
| `tools/verify_world_autowalk.js` | 襲撃の腕 (2d)(2e) と変異 `noambresume` を足す(`MUT_ORDER` は 9 本へ) |
| `実装依頼書/2026-11-06_world-autowalk-quest-signs.md` | §12 に「#110 で受入の穴を塞いだ」を 1 行追記 |

---

## 4. STEP1 — (6b) を関数ごとの基準へ

§2-2 のとおり。`fnSource` の切り出しはそのまま使い、基準の index.html だけ `KEEP_BASE[n]` の版から取る(版ごとに 1 回だけ `git show` して持つ)。
(6b) の詳細表示に「基準の版」を列で足す(後で読む人が「なぜ defeatEnemy だけ版が違うか」を追える)。

## 5. STEP2 — 襲撃の腕を足す(`verify_world_autowalk.js`)

- `?roadevent=0`(襲撃だけにする)+ 4 人分の `partyMembers` を種まき + 襲撃が経路の途中の点で出る種を探す(見つからなければ exit 3 = 空振り)。
- 遠い行き先を **1 回だけ**押す → 襲撃が開く → 「見つからぬよう街道を外れて通り過ぎる」→「先へ進む」。

## 6. STEP3 — 記録

依頼書 #109 の §12 に 1 行、本依頼書の §12 に結果を書く。

---

## 7. 撤退スイッチ

不要(本番を変えない)。

---

## 8. 受入条件(既存 2 本の拡張)

### §0 装置

- **(0d)**(autowalk)襲撃が経路の途中で 1 回以上開く種が見つかる。0 回なら exit 3。⭐ これが無いと (2d) が空振りで永久緑。
- **(0e)**(frost_hold)`KEEP_BASE` の版が実在し(`git show` 成功)、その版の `defeatEnemy` が `markHiddenFoeSlain` を含む(基準の取り違えを防ぐ)。

### §1 本体

- **(6b)**(frost_hold)10 関数すべてが **それぞれの基準の版**と同じ。`defeatEnemy` 以外の 9 本の基準は `0298eca`。
- **(2d)**(autowalk)襲撃 →「見つからぬよう…」→「先へ進む」→ **もう 1 回押さずに**目的地へ着く(`arrivalCount()` の増分 = 経路のホップ数、`heroNode()` = 目的地)。
- **(2e)**(autowalk)襲撃が開いた時点で `isMoving()` が false・`heroNode()` が経路の途中(止まってから選ばせている)。

### ⛔ 測らないこと

- 戦う枝(index.html へ去る)の中身 — #51 / `verify_road_ambush` の持ち場。

### 負のコントロール

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `noambresume`(autowalk) | `RE.showResult(ev, text, resumeAutoWalk, null);` の `resumeAutoWalk` を `null` へ | (2d) |
| `basemove`(frost_hold) | `KEEP_BASE` を使わず `BASE_REV` を `614270e` へ動かす(罠 A) | (6a) など他の節。⚠ どの節が赤になるかは実装窓が実測して表に書く。1 つも赤にならなければ、それ自体を §12 に報告(罠 A の主張が崩れたことになる) |
| `keepdrift`(frost_hold) | `defeatEnemy` 以外の関数に空行を 1 行足す | (6b) |

### 既存 golden の非退行

- `node tools/verify_world_autowalk.js` → 21 判定 + 新しい節すべて緑・`--negative` 9/9
- `node tools/verify_frost_hold.js` → 全節緑(**(6b) が緑に戻る**)・`--negative` 既存 15 本 + 新 2 本
- ⚠ 基準は 2026-11-07 の申し送りから。走らせて違ったら、期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認

なし(検証ツールだけ)。#109 の §9(点ごとの一瞬の止まり・港町の札だけで迷わないか・魔女の小屋を受注中に神殿の点が湖畔の札の下に隠れる)は **ユーザーの実機確認待ち**として残す。

---

## 10. changelog

不要(§2-4)。

---

## 11. やらないこと

- ⛔ 本番(`world.html` / `index.html`)の変更。
- ⛔ 「神殿の点が湖畔の札の下に隠れる」の手当て(実機で見てから別チケット)。
- ⛔ `verify_tower_mother_b` の 1 回だけの赤(実装窓が 5 回走らせ直してすべて緑 = 揺れと判断済み)。
- ⛔ dev-meetings の会議記録の改行コード(2026-11-07 に測り直したら作業ツリーは LF・`git status` もクリーン = 解消済み)。
- `実装依頼書/README.md` に足す行:

    | 110 | [2026-11-07_autowalk-aftercare.md](2026-11-07_autowalk-aftercare.md) | **承認済** | 0% | #109 の後始末(検証ツールだけ)。verify_frost_hold (6b) を関数ごとの基準へ(defeatEnemy だけ #108 の 614270e)+ verify_world_autowalk に襲撃で「見捨てる」の後も歩き続ける腕 (2d)(2e) と変異 noambresume。⚠ BASE_REV を丸ごと動かさない(他の節の基準でもある) |

---

## 12. 実装結果

2026-11-07 実装窓(dev-loop・サブエージェント方式)。本番ファイルは 1 バイトも変えていない。changelog なし(§2-4)。未 push。

### 12-1. STEP1 — `verify_frost_hold`(`be37948`)

- `KEEP_BASE = { defeatEnemy: '614270e' }`。(6b) は関数ごとに `KEEP_BASE[n] || BASE_REV` の版と比べる(版ごとに `git show` 1 回・キャッシュ)。詳細表示に「関数 / 基準の版 / 長さ(基準→今)/ 同じ」の列。他 9 関数の基準は `0298eca` のまま・BASE_REV は動かしていない。
- (0e) 装置: `614270e` が `git show` でき、その `defeatEnemy`(長さ 6596)が `markHiddenFoeSlain` を含む。
- 素 **28/28 緑**(**(6b) が緑に戻った**)。`--negative` **17/17**(既存 15 + 新 2・担当外の赤 0・所要 約 38 分)。
- ⚠⚠ **`basemove`(罠 A)の実測は依頼書の予想と違った**: 赤になったのは **(0b)(4b) の 2 つだけ**。予想した (6a) は緑、(1b)(1d)(3h)(6b) も緑のまま(赤にはならず**比べる意味だけが変わる**。例: (1d) は frost_peak を「既存の点」に含めてそのまま通る)。なお BASE_REV を丸ごと動かすと起動時の番人(BASE_REV に `giantRockThrow` / `frost_peak` があれば exit 3)がそれだけで止めるので、`basemove` はこの番人を通らない形で基準を差し替えて節ごとの赤を測っている。`NEG_PREDICTED` には依頼書の予想 (6a) を記録として残した(合否には使わない)。
- `keepdrift`: `checkDungeonClear` に空行 1 行 → (6b) だけ赤(2177→2178)。
- 装置の拡張 3 つ: `MUT_BASE`(変異ごとの基準の差し替え表)/ `blankAfter`(空行の注入。付けた変異だけ行数 +1 を許す)/ `--port-ext`(16 本目以降の変異は **10730〜**。続き番号だと 10706〜 = verify_clear_chests、10720〜 = verify_world_autowalk とぶつかる)。

### 12-2. STEP2 — `verify_world_autowalk`(`bb0c879`)

- 節 (0d)(2e)(2d) を足した。判定 **24/24 緑**(既存 21 + 3)。`--negative` **9/9**(`noambresume` は (2d) だけ赤・止まる点 forest__farm_n@1・arrived=false)。
- 実測: 種 = `?roadseed=6`(1〜5 は襲撃なし)。経路 = phlan → temple の 11 ホップ。襲撃は forest__farm_n@1(3 ホップ目)で開き、その時点で `isMoving()` = false。見捨てる →「先へ進む」→ 出来事 2 回(判定なしの枝で流す)→ もう 1 回押さずに temple(arrivalCount の増分 11)。
- `partyMembers` / `partyComposition`(4 人)は `verify_road_ambush` と同じ形で種まき。ポートは既存の 10720 を順に使う(新しい割当なし)。
- ⚠ **依頼書の言い直し 2 点**:
  1. §5 の `?roadevent=0` は使えない — 器 `#worldEventBox` を DOM ごと消すので**襲撃も開かない**(world.html onArriveStep の注記どおり)。街道の出来事は生かしたまま、開いたら判定なしの枝 →「先へ進む」で流す形にした。
  2. 変異 `noambresume` のアンカー — `RE.showResult(ev, text, resumeAutoWalk, null);` と `var fight = …` の行は `verify_road_ambush.js:232` の変異 dismisswrite と一字一句同じで、起動時の重複アンカー検算(exit 3)に当たる。直前の注釈 `/* ★[#109] world に残る枝はここ 1 か所に集まる (罠 A の再開口 2/2)。` をアンカーにし `var resumeAutoWalk = null; /* mut-noambresume` を入れた(var の巻き上げで finishRoadAmbush 内だけ null = `showResult(ev, text, null, null)` と同じ効果)。
- 既存の変異も新しい節を巻き込む(noresume → (2d)、noeventstop → (2e)(2d)、onehop → (2e)(2d))。どれも担当の節は赤。

### 12-3. STEP3 — 記録

- #109 依頼書 §12-5 に 1 行。README の #110 行を完了へ。
- 残 = なし(#109 の §9 実機は引き続きユーザー確認待ち)。
