# #47 街道の実り — 道中で得たものを、次の潜行へ持ち込む (Phase 2)

- **起草**: 2026-09-03(計画窓) / **ステータス**: **承認済**(2026-09-03 ユーザー承認)
- **着手**: 実装窓へ引き渡し済み。⚠ 着手前に **§2 の主張をもう一度本番の関数で 1 回測る**
  (起草から時間が経つと別窓のコミットで行番号が動く)。
- ⭐ **§11 の分岐はユーザー承認により (A) で確定** —— `verify_player_sheet` の
  FAILED 4 本(2c/2d/8a/8f)は **#47 では直さない**。別チケット(#48)へ切る。
  #47 での扱いは「**集合が同じなら非退行 / 増えたら #47 のせい**」だけ。
- **触るファイル**:
  - `js/road-events.js`(恩恵表 `BOONS` / `boonOf()` / `showResult()` の引数 1 つ追加)
  - `world.html`(`#worldEventBoon` の DOM と CSS / `finishRoadEvent` の書き込み / 撤退 1 行)
  - `index.html`(`consumeRoadBoon()` / 糧の適用 / `applyRoadVigilance()` / 撤退 1 行)
  - `tools/verify_road_boon.js`(**新規** — 受入条件。ポート **9770**)
  - `tavern.html` の changelog 1 行(⚠ `py tools/add_changelog.py` 経由。手で書かない)
- ⛔ **触らないファイル**: `tavern.html` の**ロジック**(changelog の `<li>` 追記だけは必須)。
  `js/skill-check.js` / `js/world-map.js` / `js/abilities.js` は 1 バイトも触らない。
- ⚠ **並走**: 2026-09-03 時点で隣窓は **#47 の実装窓**として待機中(読み取りと基準採取のみ・
  作業ツリー clean を維持中)。commit は **`git commit -- <paths>` のパス指定**で打ち、
  直前に `git diff --cached --stat` の行数が自分の書いた量と一致するか照合すること。

---

## 1. 目的

#45(街道の出来事 Phase 1)で「地図を歩くと出来事が起き、二択を選び、d20 で結末が分岐する」
までは出荷済み。**だが結果はその場のフレーバーで閉じており、何ひとつ持ち帰れない。**
`world.html` の `finishRoadEvent` は結末の文を出して終わり、`roadLast` という
「`__world` がドライバのために読む記録」に置くだけで、**ゲームの状態はどこにも動かない**。

⇒ プレイヤーから見ると、**d20 を振っても振らなくても、その先の冒険は 1 ミリも変わらない。**
判定に勝った意味が「良い文が出た」で終わっている。

本チケットは **成功した出来事の結果を sessionStorage の 1 キーで次の潜行へ渡し、
`index.html` が起動時に 1 度だけ消費して適用する**。

**ユーザー決定(2026-09-03)**:

- **効果は 2 種だけ**(⭐ 新しい戦闘機構をゼロで足せる組み合わせを選んだ):
  - **糧(かて)** … パーティ全員の最大 HP **+3**・hp 全快で潜行を始める
  - **備え** … **最初の交戦**で敵の初手を 1 ターン潰す
- **恵みだけ**(成功のみ)。⭐ **不採用**:「失敗したら痛手を持ち込む」——
  6 件の失敗文は既に理不尽寄り(泥まみれ・擦り傷)で、そこへ数値の罰まで乗せると
  「**関わらず立ち去る**」が常に最適解になる圧が生まれる。罰の設計は遊んでから別途。
- **見せ場所は 2 点**(街道で得た瞬間 / 潜行中)。⭐ **不採用**:「酒場の準備画面にも出す」——
  導線が `酒場(受注) → 街道を歩く → 入場 → index.html` の順なので、
  **酒場の時点ではまだ何も持っていない**(潜行開始で即消費されるので帰還後も空)。
  実質「永久に空欄の行」が 1 本増えるだけになる。`tavern.html` を触らずに済む利点も取る。
- ⭐ **なぜ報酬が金貨でないのか**(#45 の開発会議でノエル(QA 役)が出した指摘) ——
  「地図で金貨が増えても**プレイヤーはどこで見るのか**」。金貨は街道でも潜行中でも
  可視化する場所が無い。だから報酬は数値の所持品ではなく「**次の依頼に持ち込む効果**」に置いた。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⭐ 以下はすべて **2026-09-03 / `d839b35` / 作業ツリー clean** で実測した。

### 2-1. 一回性の持ち込みの前例は 2 本ある。⭐ 手本にすべきは `pendingSummon` のほう

リポジトリ全文の sessionStorage キーは 13 種。うち「別ページで立てて次のページで読む」ものは 2 本。

| キー | 立てる場所 | 読む場所 | 消す場所 | 既定(キーが無いとき) |
|---|---|---|---|---|
| `dragonfighters.questFlags` | `tavern.html:6955` | `index.html:10185-10187` | ⛔ **どこにも無い** | ⚠ **開放(全部 true)** — `index.html:10235` `if (!questFlagsPresent) return true;` |
| `dragonfighters.pendingSummon` | `tavern.html` | `index.html:33109` | `index.html:33111` | 何も起きない |

⛔ **`questFlags` を手本にしてはいけない。** `removeItem` が 1 件も無いので
**直起動やクエリ違いで前回の値が残る**。しかも「キーが無い = 開放」という**逆向きの既定**を持つ。

⭐ **手本は `pendingSummon`。** `getItem → removeItem → 適用` の 3 行で、
**キーが無い = 何も起きない**。#47 はこちらと同型で書く。

```js
/* index.html:33107-33114 — そのまま貼れる形の前例 */
(function consumePendingSummon() {
  let pending = null;
  try { pending = sessionStorage.getItem("dragonfighters.pendingSummon"); } catch (e) {}
  if (!pending) return;
  try { sessionStorage.removeItem("dragonfighters.pendingSummon"); } catch (e) {}
  const items = getSummonMenuItems("dungeonStart");
  if (items.some(it => it.id === pending)) executeSummon(pending);
})();
```

**再測定コマンド**:

    grep -rhoE 'sessionStorage\.(getItem|setItem|removeItem)\(\s*"[^"]+"' --include=*.html --include=*.js . \
      | sed 's/.*"\(.*\)"/\1/' | sort | uniq -c | sort -rn

⭐ 新しいキー名 **`dragonfighters.roadBoon`** は上の 13 種と衝突しない(実測)。

**キーの構造(⛔ 実装窓はこの形から外れないこと)**

- 型 = **JSON 配列**、要素は最大 **3 件**
- 1 要素 = `{ kind, label, event, at }`
  - `kind` … `"provision" | "vigilance"` の **2 値のみ**(白名簿。index 側が弾く)
  - `label` … 日本語 1〜24 文字・`/^[^\r\n<>&"']{1,24}$/`(§2-3 の理由)
  - `event` … `ROAD_EVENTS.EVENTS` の id
  - `at` … 停留所 id または `null`
- ⛔ **タイムスタンプを持たない**。期限は sessionStorage のタブ寿命と「1 度で消費」だけ。
- 例(合成値):

      [{"kind":"provision","label":"干し魚の束","event":"coast_dock_quarrel","at":"pier__cross_n@1"}]

### 2-2. ⚠⚠⚠ 罠 A(最重要)— 恩恵を「判定なしの枝」に付けると、既存 golden 3 本を巻き込む

`js/road-events.js` の 6 件は **すべて「判定つき 1 つ + 判定なし 1 つ」の二択**。
そして **既存の golden 3 本が、その「判定なし」の枝を機械的に押して先へ進む装置を持っている**。

```js
/* tools/verify_world_steps.js:774 / verify_world_map.js:683 / verify_quest_walk.js:831
   — 3 本とも 1 文字違わず同じ式(この窓で実測) */
const c = ev ? (ev.choices || []).filter(x => !x.check)[0] : null;
```

これは #45 §12-2 の「全画面モーダルが既存 golden のクリックを飲む」事件への対処として
**#45 自身が入れた装置**(`dismissRoadEvent()`)。3 本とも **`?roadevent=0` へ逃げずに
出荷される姿のまま**測り続けるために、この枝を押している。

⇒ ⛔ **`check: false` の枝(`result`)に恩恵を付けてはいけない。**
`verify_world_map` は `index.html` を 19 箇所、`verify_quest_walk` は 22 箇所参照しており
**実際に index.html まで進む**ので、そこで恩恵が適用されると **maxHp が非決定的に動く**。

⇒ **恩恵は `choice.check === true && outcome && outcome.success === true` のときだけ。**
§8 の **(1a①)** と変異 **`dismissboon`** が番人。

### 2-3. ⚠⚠⚠ 罠 B — `appendLog` は `innerHTML` 代入で、index.html に escape ヘルパが 1 つも無い

```js
/* index.html:14350-14352 */
el.innerHTML = combatLogLines.map(l =>
  `<div class="logLine ${l.cls}">${l.msg}</div>`
).join("");
```

`updateInfo(msg)` → `appendLog(msg)` はここへ合流する。`escapeHtml` / `escapeHTML` は
**grep 0 件**(実測)。⇒ **sessionStorage から読んだ文字列を素通しで `updateInfo` へ渡さない。**

⚠ **severity は正しく書いておく**: `label` の出所は `js/road-events.js` の**固定表**なので
外部入力ではなく、悪用には「既に同一オリジンでスクリプトが動いている」ことが前提になる
(= self-XSS)。**#47 の主目的ではない**が、**保存値を DOM の HTML へ流す経路を新設する以上、
入口で 1 本ホワイトリストを張るのが正しい**。

⇒ index.html 側は **`label` が `/^[^\r\n<>&"']{1,24}$/` に一致したときだけ使い、
外れたら kind ごとの既定語(「街道の糧」/「街道の備え」)へ倒す**。
§8 の **(2e)** と変異 **`taintlabel`** が番人。

### 2-4. `world.html` の storage 実測 —— #45 の (2c) は本チケットで赤にならない

| 対象 | 着手前の件数 | #47 後の予定 | `verify_road_events` (2c) の扱い |
|---|---|---|---|
| `localStorage.setItem` | **0** | **0**(据置) | ⛔ `lset === 0` を assert |
| `localStorage.removeItem` | **0** | **0**(据置) | ⛔ `lrm === 0` を assert |
| `sessionStorage.removeItem` | **1**(#23 の questDest だけ) | **1**(据置) | ⛔ `rm === 1` を assert |
| `sessionStorage.setItem` | **3**(全部 撤退フラグ) | **4**(+1 = roadBoon) | ⭐ **報告文字列に出るだけで assert していない** |

```js
/* tools/verify_road_events.js:1358 — (2c) の判定はこの 1 行がすべて */
const ok = rm === BASE_REMOVE && lset === 0 && lrm === 0;
```

⇒ **`world.html` に `sessionStorage.setItem` を 1 件足しても (2c) は緑のまま**(計画窓と
実装窓の 2 経路で独立に確認)。⛔ ただし **`removeItem` は絶対に増やさない** ——
消費は `index.html` 側でやる(§2-1)。増やすと (2c) が `rm === 1` で赤くなる。

### 2-5. ⚠ 破る不変条件を 2 つ、コメントごと改訂する(⛔ 黙って破らない)

#45 は storage の規律を**コメントで宣言**している。#47 は**その一部を意図的に破る**ので、
**依頼書の指示としてコメントの改訂まで含める**。黙って破ると次のチケットが混乱する。

| ファイル:行 | 現在の宣言 | #47 での扱い |
|---|---|---|
| `js/road-events.js:19-21` | 「⛔ localStorage へ書かない。sessionStorage も **読むだけ (peek)**。world.html の setItem / removeItem を 1 件も増やさない」 | **前半(localStorage)は維持**。後半を「⭐ #47 で `setItem` を 1 件だけ増やした(`roadBoon`)。⛔ `removeItem` は増やさない(消費は index.html)」へ改訂 |
| `world.html:1084-1085` | 「⛔ **storage へ 1 バイトも書かない。** roadVisited は『この滞在だけ』の JS 変数」 | 「⛔ **`roadVisited` / `roadFiredCount` は storage へ書かない**(この滞在だけの JS 変数)。⭐ storage へ出るのは #47 の `roadBoon` **1 キーだけ**」へ改訂 |

⭐ **書き口を `world.html` に置く理由**: #45 は `js/road-events.js` の責務を
「① イベント表 ② 器の描画。⛔ **発火しない**」と宣言している(`js/road-events.js:10-13`)。
**状態を動かす決定は world.html 側**という分担を壊さない。
road-events.js が持つのは **表(`BOONS`)と引き(`boonOf`)だけ**。

### 2-6. 挿入点 3 つ(⚠ 行番号は必ずズレる前提。構造で探すこと)

| 何 | ファイル | 2026-09-03 の行 | 構造で探す目印 |
|---|---|---|---|
| 書き込み | `world.html` | **1149-1155** | `function finishRoadEvent(ev, choice, outcome) {` |
| 消費 | `index.html` | **33107-33114 の直後** | `(function consumePendingSummon() {` …`})();` の次の行 |
| 備えの発動 | `index.html` | **20240** | `applyMineRangedOpening();   // [sce1-events] …` の**次の行** |

`index.html` の run 開始は 3 連 IIFE になっている(`applyInitialLevels`(:33078) →
`applyAccessoryHpBonus`(:33095) → `consumePendingSummon`(:33107))。
⭐ **糧は maxHp を触るのでレベル適用より後**でなければならない。上の位置はその条件を満たす。

### 2-7. 「備え」に新しい戦闘機構は要らない —— `stunned` は既に 2 系統が使っている枠

```js
/* index.html:24310-24324 — [sce1-events] EV-2 の前例。#47 はこれと同型の姉妹関数を足すだけ */
function applyMineRangedOpening() {
  if (!sceneFlags.mine_ranged_opening) return 0;
  sceneFlags.mine_ranged_opening = false;          /* ⭐ 1 度で消費 */
  let n = 0;
  for (const i of encounterEnemyIndices) {
    const e = enemies[i];
    if (!e || !e.alive) continue;
    e.stunned = Math.max(e.stunned || 0, 1);
    n++;
  }
  if (n > 0) { showBanner("🏹 射程を取っていた! 初手を潰した", 1600); updateInfo(`…`); }
  return n;
}
```

呼び口は `runEncounter`(`index.html:20233`)の中の **1 行だけ**(`:20240`)。
`stunned` は牙の護符 `tryNegatePreemptive`(`:20203`)も使っており、**ターンループ側の配線は済んでいる**。

### 2-8. 「糧」も既存の書き方をなぞるだけ

```js
/* index.html:33092-33101 — 第2弾 生命の護符。#47 の糧はこれと同じ層・同じ形 */
(function applyAccessoryHpBonus() {
  const pb = getAccessoryHpBonus("player");
  if (pb > 0) { maxHp += pb; hp = maxHp; }
  for (const a of allies) {
    const ab = getAccessoryHpBonus(a);
    if (ab > 0) { a.maxHp = (a.maxHp || 0) + ab; a.hp = a.maxHp; }
  }
})();
```

**+3 の妥当性**(`index.html:20672` `CLASS_DEFS` の実測): 戦士 hpMax **30** / 僧侶 **25** /
魔法使い **18**。⇒ **+3 は 10〜17%**。比較対象として「生命の護符」(ドロップ限定のレア装身具)は
**+8**(`index.html:12216`)なので、**街道でたまに拾うものとしては +3 が妥当な下限**。
⛔ この数値は §8「測らないこと」= 遊んで動かすレバー。

### 2-9. 6 件 → 2 種の割り当てと、成功率の実測

`js/skill-check.js` と `js/abilities.js` の実体から**計算**した(写経ではない)。
式 = `bonus = abilityMod(score) + prof(2 if 習熟) + help(2 if 2 人以上)`、
`success = (roll===20) || (roll!==1 && roll+bonus >= DC)`(`js/skill-check.js:172-179`)。

| 出来事(成功時) | 判定 / DC | 最良の代表 | bonus | 成功率 | 実り | label |
|---|---|---|---|---|---|---|
| 桟橋のいざこざ | persuasion / easy 10 | 僧侶 cha13 | **+3** | **70%** | 糧 | 干し魚の束 |
| 湖面のさざなみ | perception / medium 15 | ドワーフ・エルフ | **+5** | **55%** | 糧 | 油紙の包み |
| 山道の落石 | athletics / medium 15 | 戦士 str15 習熟 | **+6** | **60%** | 糧 | 開けた街道 |
| 樵の道案内 | insight / easy 10 | 僧侶 wis15 習熟 | **+6** | **85%** | 備え | 樵の嘘を見抜いた目 |
| 沼の道しるべ | investigation / medium 15 | 盗賊 int13 習熟 | **+5** | **55%** | 備え | 動かされた杭の記憶 |
| 行き倒れの巡礼者 | religion / easy 10 | 僧侶 wis15 習熟 | **+6** | **85%** | 備え | 手向けを済ませた心 |

⚠ **`persuasion` は 6 職のどれも習熟を持たない**(`js/skill-check.js:57-64` の
`CLASS_PROFICIENCIES` を全数確認)。6 件のうち **これだけ prof が常に 0**。
⛔ 「習熟が付くはず」と思って実装しないこと。

⭐ **割り当ての理屈**(⛔ 恣意ではない): **物か体力が残るもの = 糧 / 先を読む目が残るもの = 備え**。
「山道の落石」は物を得ないが**岩を退けたので荷を担いだまま最短で着けた**(= 消耗せず着いた)
ので糧。「行き倒れの巡礼者」は**手向けを済ませて心が定まった**ので備え。

**期待値**: #45 の実測で横断 1 回あたり **0.85〜0.91 件**の出来事(38% は無風)。
6 件の成功率の単純平均は **68.3%**。⇒ 判定つきの選択肢を必ず選んだ場合、
**横断 1 回あたりおよそ 0.6 個**。⭐ 「毎回もらえる」でも「滅多に無い」でもない狙いどおりの帯。

### 2-10. changelog の要否

```
scripts/hooks/check_changelog.py:24
  GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

⇒ **鳴る**(`index.html` を触る)。**書けるプレイヤー向けの要約は実在する** —
「街道で得たものが次の冒険に効く」は画面で見える変化そのもの。§10 に文面を用意した。
⛔ `--no-verify` は全経路が封鎖されている。迂回しない。

### 2-11. ⚠⚠⚠ `verify_player_sheet` は **着手前から赤い**(#45 の積み残し)

```
node tools/verify_player_sheet.js
  → 66/70 PASSED   FAILED 4   PENDING 0   (exit 1)
  FAILED: (2c) (2d) (8a) (8f)
  指紋: ⛔ world 伏せ ["dfSheetSecSaves","dfSheetSecCombat","dfSheetSecBody","dfSheetSecAttacks"]
        (期待 [... ,"dfSheetSecProficiency","dfSheetSecSkills"])
```

**真因**: #45 項目2 の `475839d` が `world.html` へ `js/skill-check.js` を載せたため、
world でも `SkillCheck` が生きて**習熟 / 技能の区画が出るようになった**。ところが
`tools/verify_player_sheet.js:1973-1975` の期待表は
`'world.html': ['dfSheetSecSkills', 'dfSheetSecBody']` = 「world では技能区画を**伏せる**」のまま。
⇒ **実装が正しくなり、期待値だけが取り残された**形。

⭐ **なぜ #45 で気づけなかったか** = #45 が非退行を確認した golden は **7 本**で、
`verify_player_sheet` がその外に居たから。⇒ **§8 の golden 一覧は 13 本ベースで書く**(下記)。

⇒ ⛔ **#47 の非退行の読み方**: `verify_player_sheet` は
**FAILED の集合が `{(2c),(2d),(8a),(8f)}` のままなら非退行**。
**集合が増えたら #47 のせい**。⚠ **件数だけで見ない**(数は腐る。落ちている項目の集合を
diff で見る = #38 の型)。
⚠ この 4 本を直すかどうかは §11 に選択肢として置いた(**ユーザー判断**)。

### 2-12. 別窓の差分

`git -c core.quotepath=false status --short` → **空**。`HEAD = origin/main = d839b35`。
隣窓は #47 の**実装窓**として待機中で、読み取りと基準採取のみ・作業ツリー clean を維持している。
⇒ 本チケットが触る 4 ファイルは**いま誰も編集していない**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/road-events.js` | `BOONS` 表 6 件 / `boonOf(ev, choice, outcome)` / `showResult()` に第 4 引数 `boon` / 公開 API へ 2 件追加 / **:19-21 のコメント改訂** |
| `world.html` | `#worldEventBoon` の DOM 1 行 + CSS 数行 / `finishRoadEvent` に書き込み / `ROAD_BOON_ON` の 1 行 / **:1084-1085 のコメント改訂** |
| `index.html` | `consumeRoadBoon()` IIFE / `applyRoadVigilance()` / `runEncounter` に 1 行 / `ROAD_BOON_ON` の 1 行 |
| `tools/verify_road_boon.js` | **新規**(ポート 9770) |
| `tavern.html` | **changelog の `<li>` 1 行だけ**(`py tools/add_changelog.py` 経由) |
| `実装依頼書/README.md` | 一覧に #47 の行を 1 本(§11 に文面) |

⛔ `js/skill-check.js` / `js/world-map.js` / `js/abilities.js` は開かない。

---

## 4. STEP1 — 装置(⭐ ここが立たないと後が全部無意味)

### 4-1. 新規 `tools/verify_road_boon.js` の骨格

- 流用元 = **`tools/verify_road_events.js`**(同じ world.html を実クリックで歩く / 種つき乱数 /
  `--negative` 内蔵 / 配信スナップショットへの実行時注入がすべて揃っている)。
- **ポート 9770**(`tools/*.js` の全ポートを実測して空きを確認済み)。
- ⚠ `?roadseed=N` を**必ず使う**。#41 の教訓(確率のままだと間欠で赤くなる)。

### 4-2. §0 母集団ガード(⛔ これが無いと全 assert が空振りで永久緑)

- **(0a)** `ROAD_EVENTS.BOONS` のキー集合が `EVENTS` の id 集合の**部分集合**かつ **1 件以上**
- **(0b)** ⛔ `world.html` の配信バイトに `BOONS` の label が **1 つも出てこない**
  (#45 (0b) と同じ規律。文言の唯一の正は `js/road-events.js`)
- **(0c)** 決定論の種で歩き切ったとき `sessionStorage["dragonfighters.roadBoon"]` が
  **1 件以上**になる腕が存在する(⛔ 0 件だと (1a)(1c)(2a) が全部空振り)

### 4-3. 着手前の golden 基準を**この項目で採る**

⭐ 実装に 1 バイトも触る前に走らせ、結果を §12 に記録する(#38 の「NG セットを diff」型)。
§8 の表に 2026-09-03 の実測値があるので、**差が出たら理由を突き止めてから進む**。

---

## 5. STEP2 — 表と書き込み(街道側)

### 5-1. `js/road-events.js` に `BOONS` を足す

```js
/* ══ 街道の実り (#47 §2-9) ═══════════════════════════════════════════════
   ⭐ **判定に勝った枝でだけ**手に入る。⛔ check:false の枝(result)には付けない ——
     既存 golden 3 本 (verify_world_steps:774 / world_map:683 / quest_walk:831) が
     `(ev.choices||[]).filter(x => !x.check)[0]` を機械的に押して index.html まで進むので、
     そこへ恩恵を付けると maxHp が非決定的に動く (#47 §2-2 / 変異 dismissboon が番人)。
   ⚠ label は index.html の updateInfo → appendLog (innerHTML 代入) まで届くので、
     **`/^[^\r\n<>&"']{1,24}$/` を満たす短い日本語だけ**にする (#47 §2-3)。
   ⛔ kind は 2 種だけ。増やすときは index.html の consumeRoadBoon も同時に。 */
var BOONS = {
  coast_dock_quarrel: { kind: "provision", label: "干し魚の束" },
  lake_ripple:        { kind: "provision", label: "油紙の包み" },
  mountain_rockfall:  { kind: "provision", label: "開けた街道" },
  woods_woodcutter:   { kind: "vigilance", label: "樵の嘘を見抜いた目" },
  swamp_marker:       { kind: "vigilance", label: "動かされた杭の記憶" },
  swamp_pilgrim:      { kind: "vigilance", label: "手向けを済ませた心" },
};

/* 恩恵を引く。⛔ ここが唯一の「もらえる条件」。3 つ全部が真のときだけ返す。 */
function boonOf(ev, choice, outcome) {
  if (!ev || !choice || !choice.check) return null;      /* 判定なしの枝は対象外 */
  if (!outcome || !outcome.success) return null;         /* 失敗 / null は対象外 */
  var b = has(BOONS, ev.id) ? BOONS[ev.id] : null;
  return b ? { kind: b.kind, label: b.label, event: ev.id } : null;
}
```

⭐ 公開 API へ `BOONS: BOONS, boonOf: boonOf` を追加。
⛔ **`js/road-events.js` は storage へ書かない**(§2-5)。

### 5-2. `showResult` に「携えた」の 1 行を出させる

`showResult(ev, text, onDone, boon)` の第 4 引数を足し、`#worldEventBoon` へ流す。
⛔ **文言は `js/road-events.js` 側で組む**(world.html へ写すと (0b) が赤)。

    例: 「→ 干し魚の束 を携えた(この先の潜行で効く)」

⚠ **恩恵が無いときは空文字を入れて `hidden` にする**(前の結末の残骸が残らないように)。
`paint()` / `close()` の**両方**で必ずクリアすること(変異 `boxleak` が番人)。

### 5-3. `world.html` に器の受け皿を足す

```html
<div id="worldEventBox" aria-hidden="true">
  <div id="worldEventCard">
    <div id="worldEventTitle"></div>
    <div id="worldEventText"></div>
    <div id="worldEventBoon" hidden></div><!-- ★ #47。⛔ 文言はここに書かない -->
    <div id="worldEventBtns"></div>
  </div>
</div>
```

CSS は `#worldEventText` の直後に 1 ブロック。⛔ `max-height` を付けない
(#45 の (1d)「画面内に収まる」が自明に真になる)。`body.compact` の腕も忘れない。

### 5-4. `world.html` の `finishRoadEvent` で書く

```js
function finishRoadEvent(ev, choice, outcome) {
  var RE = window.ROAD_EVENTS;
  var text = RE.resultText(ev, choice, outcome);
  if (roadLast) { roadLast.success = outcome ? !!outcome.success : null; roadLast.text = text; }
  /* ★ #47 街道の実り。⛔ ROAD_BOON_ON が false なら 1 バイトも書かない (§7)。
     ⛔ removeItem は増やさない —— 消費は index.html (verify_road_events (2c) が rm===1 を縛る)。 */
  var boon = ROAD_BOON_ON ? RE.boonOf(ev, choice, outcome) : null;
  if (boon) pushRoadBoon(boon, roadLast && roadLast.at);
  RE.showResult(ev, text, null, boon);
}
```

```js
/* キーは 1 本だけ。中身は配列 (横断を繰り返すと追記される)。⭐ 上限 3 件 = 新しい方を残す。
   ⛔ JSON.parse が壊れていたら **黙って捨てて作り直す** (前回の残骸で例外を出さない)。 */
var ROAD_BOON_KEY = "dragonfighters.roadBoon", ROAD_BOON_MAX = 3;
function pushRoadBoon(boon, atId) {
  var list = [];
  try { list = JSON.parse(sessionStorage.getItem(ROAD_BOON_KEY) || "[]"); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  list.push({ kind: boon.kind, label: boon.label, event: boon.event, at: atId || null });
  while (list.length > ROAD_BOON_MAX) list.shift();
  try { sessionStorage.setItem(ROAD_BOON_KEY, JSON.stringify(list)); } catch (e) {}
}
```

---

## 6. STEP3 — 消費と適用(潜行側)

### 6-1. `index.html` — `consumePendingSummon` の直後に置く

```js
/* ══ 街道の実り (#47) — 街道で得たものを 1 度だけ使う ══════════════════════
   ⭐ pendingSummon (:33107) と同型: getItem → removeItem → 適用。
     **キーが無い = 何も起きない** (⛔ questFlags の「無い = 開放」とは逆。#47 §2-1)。
   ⚠ ここは applyInitialLevels / applyAccessoryHpBonus より **後**でなければならない
     (maxHp を触るので、レベル適用が済んでいないと足した分が上書きされる)。
   ⚠⚠⚠ label は updateInfo → appendLog (innerHTML 代入・index.html:14350) まで届く。
     escape ヘルパはこのファイルに 1 つも無いので、**入口でホワイトリストを張る** (§2-3)。 */
const ROAD_BOON_LABEL_OK = /^[^\r\n<>&"']{1,24}$/;
const ROAD_BOON_FALLBACK = { provision: "街道の糧", vigilance: "街道の備え" };
let roadVigilance = false;                       /* 備え: 最初の交戦で 1 度だけ */
(function consumeRoadBoon() {
  if (!ROAD_BOON_ON) return;                     /* 撤退 ?roadboon=0 —— ⛔ removeItem もしない */
  let raw = null;
  try { raw = sessionStorage.getItem("dragonfighters.roadBoon"); } catch (e) {}
  if (!raw) return;
  try { sessionStorage.removeItem("dragonfighters.roadBoon"); } catch (e) {}
  let list = [];
  try { list = JSON.parse(raw); } catch (e) { list = []; }
  if (!Array.isArray(list)) return;
  for (const b of list.slice(0, 3)) {
    if (!b || (b.kind !== "provision" && b.kind !== "vigilance")) continue;   /* ⛔ 白名簿 */
    const label = (typeof b.label === "string" && ROAD_BOON_LABEL_OK.test(b.label))
      ? b.label : ROAD_BOON_FALLBACK[b.kind];
    if (b.kind === "provision") {
      maxHp += 3; hp = maxHp;
      for (const a of allies) { a.maxHp = (a.maxHp || 0) + 3; a.hp = a.maxHp; }
      updateInfo(`街道で得た『${label}』が効いている — 一行の体力が底上げされた (最大HP +3)`);
    } else {
      roadVigilance = true;
      updateInfo(`街道で得た『${label}』 — 最初の敵の気配は、既に読んでいる`);
    }
  }
})();
```

⛔ `list.slice(0, 3)` の 3 は **world 側の `ROAD_BOON_MAX` と同じ意味**。片方だけ動かさない。

### 6-2. `runEncounter` に 1 行 —— 「備え」の発動

```js
applyMineRangedOpening();   // [sce1-events] EV-2 の②に成功していれば敵の初手を潰す
applyRoadVigilance();       // ★ #47 街道の実り: 街道で「備え」を得ていれば最初の交戦だけ初手を潰す
```

```js
/* ★ #47。⛔ 新しい戦闘機構を作らない —— applyMineRangedOpening (:24310) と同じ stunned 枠。
   ⚠ フラグは 1 度で消費する (「最初の交戦」の話なので 2 戦目には効かない。変異 alwaysvigil が番人)。 */
function applyRoadVigilance() {
  if (!roadVigilance) return 0;
  roadVigilance = false;
  let n = 0;
  for (const i of encounterEnemyIndices) {
    const e = enemies[i];
    if (!e || !e.alive) continue;
    e.stunned = Math.max(e.stunned || 0, 1);
    n++;
  }
  if (n > 0) {
    showBanner("👁 街道で読んでいた! 初手を潰した", 1600);
    updateInfo(`街道で得た備えが生きた — ${n} 体の初手を潰した`);
  }
  return n;
}
```

---

## 7. 撤退スイッチ

- **`?roadboon=0`** — 街道の実りが丸ごと無くなる(#45 までの姿へ戻る)。
- ⚠ **判定位置 = 2 ページで独立**(`?heromark=0` / `?castanchor=0` と同じ流儀)。
  ⛔ sessionStorage へ写さない。
  - `world.html` … `URLSearchParams` を 1 回読んで `ROAD_BOON_ON` を false。
    **キーを 1 バイトも書かない**・器の 1 行も出さない
  - `index.html` … 同じ名前を 1 回読んで `ROAD_BOON_ON` を false。
    **適用しない。⛔ `removeItem` もしない**(撤退は状態への副作用ゼロ = #46 の規律)
- ⭐ **どちらか片方だけでも撤退になる**: world 側だけなら「書かれないので適用されない」、
  index 側だけなら「書かれても無視される」。⚠ 後者ではキーが sessionStorage に残る ——
  これは仕様(撤退は状態を触らない)。**(4b) がその残留まで assert する**。
- ⛔ `?roadevent=0` / `?walkstep=0` / `?world=0` と相乗りさせない
  (赤が出たときどちらの撤退か切り分けられなくなる)。
- ⛔ `?roadseed=N` は撤退ではない(#45 が敷いた決定論のシーム。そのまま使う)。

---

## 8. 受入条件 — `tools/verify_road_boon.js`(新規・ポート 9770)

**測り方の方針**: 街道側は **`world.html` を実クリックで歩き、器の選択肢を実際に押す**
(#45 と同じ)。潜行側は **sessionStorage へ値を置いてから `index.html` を開き、
既存のブリッジ越しに `maxHp` / `stunned` / `#combatLog` を読む**。
⭐ **観測するのは「持ち込まれたか」と「1 度で消えるか」**。⛔ +3 という数値の妥当さや
6 件の割り当てはゲーム設計の話なので測らない(下記)。

### ⚠ 計測機構(既存ドライバの写経では動かない点)

- **`ARM_MS`(260ms)を 2 回待つ** —— 導入で 1 回、結末で 1 回
  (#45 §12-2 の実測。ゴーストクリック除けで、待たないと押しが無視される)。
- **器を閉じるクリックはタップ数に数えない** —— #45 の (3b)(4b) が刻み回数を数えているので、
  同じ数え方の腕を作るときは合わせる。
- **`?roadseed=N` を必ず付ける** —— 素の一巡で 1 件も出ない確率が約 7% ある(#45 実測)。
- ⚠ **`?autoplay` はカメラ測定台に使えない**(`focusCameraOn` が丸ごと止まる)。
  ただし `SkillCheck` は `global.__autoplay || opts.auto` で UI を出さず即解決するので
  (`js/skill-check.js:481`)、**判定の成否だけを大量に振りたい腕ではその経路を使ってよい**。

### §0 装置(先に母集団を確かめる)

- **(0a)** `ROAD_EVENTS.BOONS` のキーが `EVENTS` の id の**部分集合**かつ **1 件以上**。
  ⭐ **これが無いと以下全部が空振りで永久緑**
- **(0b)** ⛔ `world.html` の配信バイトに `BOONS` の label が **1 つも出てこない**
  (#45 (0b) と同じ規律。変異 `copyboon` が番人)
- **(0c)** 決定論の種で歩き切ったとき `roadBoon` が **1 件以上**書かれる腕が存在する

### §1 書き込み(街道側)

- **(1a)** ⭐⭐⭐ **恩恵は「判定に勝った枝」だけ**。3 経路で突き合わせる:
  - ① **判定なしの枝**(既存 golden 3 本が押す枝)を押す → `roadBoon` が **無い**
  - ② 判定つきで **失敗** → `roadBoon` が **無い**
  - ③ 判定つきで **成功** → `roadBoon` が **1 件**
  ⚠ 母集団ガード = ①②③ の腕がそれぞれ **1 回以上成立している**こと
- **(1b)** 中身の形 — 配列で、各要素の `kind` が `provision|vigilance` のいずれか、
  `label` が `/^[^\r\n<>&"']{1,24}$/` を満たし**空でない**、`event` が `EVENTS` の id
- **(1c)** 上限 **3 件**(4 件目を得ると最古が落ちて長さ 3 のまま)
- **(1d)** ⛔ **恒等** — `world.html` の配信バイトの `localStorage.setItem` = **0** /
  `localStorage.removeItem` = **0** / `sessionStorage.removeItem` = **1**
  (= #45 (2c) と同じ数を本チケットでも独立に張る)
- **(1e)** 器に「携えた」の 1 行が出る(`#worldEventBoon` が `hidden` でなく空でない)。
  かつ **恩恵の無い結末では `hidden` かつ空**

### §2 消費と適用(潜行側)

- **(2a)** `index.html` の起動で **キーが消える**(起動後 `getItem` が null)
- **(2b)** **糧** — 全員(頭 + `allies`)の `maxHp` が **+3×件数**、かつ `hp === maxHp`。
  ⭐ 2 経路 = 「キーを置いた腕」と「置かない腕」の**差分**で見る(⛔ 絶対値を写経しない)
- **(2c)** **備え** — **最初の交戦**で交戦中の敵が `stunned >= 1`、
  かつ **2 度目の交戦では 1 体も `stunned` にならない**(変異 `alwaysvigil` が番人)
- **(2d)** `#combatLog` に 1 行出る。⭐ 2 経路 = 供給口(置いた `label`)と DOM のテキスト
- **(2e)** ⚠ **汚れた label を使わない** — `label` に `<img src=x onerror=1>` を置いて起動すると、
  ① `#combatLog` の**要素数が既定語のときと同じ**(タグが増えていない)
  ② ログの文字列に既定語(「街道の糧」/「街道の備え」)が出る
- **(2f)** **キーが無いとき何も起きない** — `maxHp` が素のアームと**ちょうど同じ**、
  ログに街道の行が **0 本**

### §3 恒等(非退行)

- **(3a)** ⭐⭐⭐ **既存 golden 3 本が通る経路そのものを再現して測る** ——
  「判定なしの枝」を押しながら `world.html` を歩き切り、入場して `index.html` へ着いたとき
  **`maxHp` が `?roadboon=0` の腕と 1 も違わない**。
  ⚠ 母集団ガード = その横断で器が **1 回以上開いている**こと
  (0 回だと「押す枝が無かっただけ」で自明に緑になる)

### §4 撤退

- **(4a)** `world.html?roadboon=0` — 判定に**成功しても** `roadBoon` が書かれず、
  器の 1 行も出ない。⚠ 母集団ガード = その腕で **判定に成功した出来事が 1 件以上**あること
  (⛔ 「1 件も起きなかったので書かれなかった」を通さない)
- **(4b)** `index.html?roadboon=0` — キーを置いてから開いても
  ① `maxHp` が素と同じ ② ログに街道の行が 0 本 ③ **キーが消えていない**(removeItem もしない)
- **(4c)** 両ページの撤退アームで `pageerror` **0 件**

### ⛔ 測らないこと

- **`+3` という数値**(遊んで動かすレバー。§2-8 に根拠は書いたが assert では縛らない)
- **6 件 → 2 種の割り当て**(題材の解釈。表の中身が変わっても受入条件は緑のままでよい)
- **`RATE`(発生率)と `DC`**(#45 の担当。本チケットは 1 つも動かさない)
- **上限 3 件という数**((1c) は「上限が効いている」ことだけを見る。数を変えても
  world / index の両側を同時に変えれば緑)
- **バナーの表示時間 1600ms**(目で決める)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nogrant` | `boonOf` が常に `null` を返す | (0c)(1a③) |
| `dismissboon` | ⭐⭐⭐ **§2-2 の罠 A の再現** — `boonOf` から `!choice.check` の門番を外す | (1a①)(3a) |
| `failgrant` | `!outcome.success` の門番を外す(失敗でも恩恵) | (1a②) |
| `taintlabel` | `BOONS` の label を `<img src=x onerror=1>` に差し替える | (2e) |
| `emptylabel` | label を空文字にする | (1b) |
| `nocap` | `while (list.length > ROAD_BOON_MAX)` を消す | (1c) |
| `noconsume` | `consumeRoadBoon` の `removeItem` を落とす | (2a) |
| `nogrow` | 糧の `maxHp += 3` を `+= 0` にする | (2b) |
| `alwaysvigil` | `roadVigilance = false` の 1 行を消す(2 戦目も効く) | (2c) |
| `copyboon` | label を `world.html` のコメントへ写す | (0b) |
| `localwrite` | `pushRoadBoon` を `localStorage` へ書き換える | (1d) |
| `retreatwrite` | world 側の撤退門番 `ROAD_BOON_ON ? … : null` を外す | (4a) |
| `retreatconsume` | index 側の撤退門番より前に `removeItem` を出す | (4b) |
| `boxleak` | `close()` / `paint()` で `#worldEventBoon` をクリアしない | (1e) |

⭐ **§2-2 の罠 A を再現する `dismissboon` は必須。** これが赤くならない装置は、
「既存 golden 3 本を巻き込むかどうか」を 1 つも検出できていない。

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ **`world.html` を参照するドライバは 7 本ではなく 13 本ある。**
#45 は 7 本で確認して `verify_player_sheet` を取りこぼし、**実物の赤を出荷した**(§2-11)。

| ドライバ | 基準 | 出所 |
|---|---|---|
| `tools/verify_road_events.js` | **25/25** | #45 の記録(2026-09-03) |
| `tools/verify_world_steps.js` | **33/33** | 同上 |
| `tools/verify_world_map.js` | **57/57** | 同上 |
| `tools/verify_quest_walk.js` | **25/25** | 同上 |
| `tools/verify_world_heromark.js` | **18/18** | 同上 |
| `tools/verify_town_exit.js` | **23/23**(素) | 同上 |
| `tools/verify_title_screen.js` | **86/86** | 同上 |
| `tools/verify_tavern_map.js` | **43/43** | 同上 |
| `tools/verify_ability_scores.js` | **24/24**(FAILED 0 / PENDING 0 / exit 0) | **2026-09-03 実測**(実装窓) |
| `tools/verify_darkvision.js` | **25/25**(同上) | **2026-09-03 実測**(実装窓) |
| `tools/verify_mercenary_roster.js` | **44/44**(同上) | **2026-09-03 実測**(実装窓) |
| `tools/verify_recruit_size.js` | **82/82**(exit 0) | **2026-09-03 実測**(実装窓・初採取) |
| `tools/verify_run_chronicle.js` | **73/73**(FAILED 0 / PENDING 0 / exit 0) | **2026-09-03 実測**(実装窓・初採取) |
| `tools/verify_player_sheet.js` | ⛔ **66/70・FAILED = {(2c),(2d),(8a),(8f)}・exit 1** | **2026-09-03 実測**(計画窓 / 実装窓の 2 経路)。**着手前から赤**(§2-11) |
| `tools/driver_grid_p8.js` | **56/56** | #46 の記録 |
| `tools/probe_party_size.js` | **57/57**(`--negative` 22/22) | 記録(2026-08-23) |

⚠ 基準値は 2026-09-03 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める。**
⭐ `verify_run_chronicle` の **(4c)** は述語が `enterVia|lastResult` に**キー名を限定**している
(`tools/verify_run_chronicle.js:1236`)ので、**`roadBoon` という新しいキー名では赤くならない**
(実測確認済)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. 街道を横断して、**「携えた」の 1 行が羊皮紙の中で浮いていないか**(compact / iPhone 縦)
2. 判定に勝ったとき「**得した**」と感じるか。⭐ +3 が地味すぎないか / 派手すぎないか
3. 「備え」の初手潰しが、**戦闘のどこで効いたか分かるか**(バナー 1600ms は短くないか)
4. 潜行開始のログ 1 行が、**開幕ナレーションに埋もれて読まれずに流れないか**
   (⚠ `SCENARIO_NARRATIONS` の 4 段落が先に走る)
5. 横断 1 回あたり 0.6 個という頻度が、**「たまに嬉しい」に感じられるか**(§2-9)
6. 「街道で得たもの」が **6 件のどれだったか思い出せるか**(label が短すぎないか)

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>街道で得たものが次の冒険に効くようになった</b> — 道中の出来事で判定に勝つと、干し魚や見抜いた策略が「実り」として潜行へ持ち込まれる。"

⛔ `--no-verify` での迂回は禁止(全経路がハードブロックされている)。

---

## 11. やらないこと

- ⛔ **失敗の「痛手」**(ユーザー決定で不採用。§1)
- ⛔ **酒場の準備画面への表示**(ユーザー決定で不採用。`tavern.html` のロジックは触らない)
- ⛔ **金貨 / XP の増減**
- ⛔ **`localStorage` への書き込み**(`world.html` の 0 件を維持。(1d) が番人)
- ⛔ **イベントを 7 件以上に増やす**(#45 §11 の据置き。6 件で遊んでから決める)
- ⛔ **恩恵の 3 種目**(加護など。2 種で遊んでから)
- ⛔ **`RATE` / `DC` / `ARM_MS` / `AUTO_ROLL_MS` の変更**
- ⛔ **街道での戦闘**
- ⚠ **`verify_player_sheet` の 4 本(2c/2d/8a/8f)を直すこと** ——
  **ユーザー判断が要る別件**。#47 に混ぜると「#47 が壊したのか直したのか」が読めなくなる。
  選択肢:
  - **(A) 別チケット #48 に切る**(推奨)。直し方は
    `tools/verify_player_sheet.js:1973-1975` の期待表を「world でも Proficiency / Skills が出る」へ更新
  - **(B) #47 の項目 4 に混ぜる**。⛔ そのとき §8 の基準表も同時に書き換える
- ⛔ **`実装依頼書/README.md` への行追加は実装窓が着地させてから**。用意してある行:

    | 47 | [2026-09-03_road-harvest.md](2026-09-03_road-harvest.md) | **承認済** | 0% | 街道の実り Phase 2。成功した出来事の結果を `dragonfighters.roadBoon`(sessionStorage 1 キー・配列・上限 3)で次の潜行へ渡し、`index.html` が起動時に 1 度だけ消費する。効果は 2 種(糧 = 全員 maxHp +3 / 備え = 最初の交戦で敵の初手を潰す)で新機構ゼロ。⚠⚠⚠ 罠A = **恩恵を `check:false` の枝に付けると既存 golden 3 本を巻き込む**(`verify_world_steps:774` / `world_map:683` / `quest_walk:831` が `filter(x => !x.check)[0]` を機械的に押して index.html まで進む)→ 恩恵は**判定に勝った枝だけ**。⚠⚠⚠ 罠B = **`appendLog` は innerHTML 代入で index.html に escape ヘルパが 0 件**→ label はホワイトリスト正規表現を通す。⭐ 消費は `pendingSummon` 型(⛔ `questFlags` は removeItem 0 件 + 「無い = 開放」の逆向き既定なので手本にしない)。⭐ `verify_road_events` (2c) は `setItem` を assert していないので world 側へ 1 キー書いても緑。⚠ **`verify_player_sheet` は着手前から FAILED = {(2c),(2d),(8a),(8f)}**(#45 `475839d` の積み残し・集合で見る)。撤退 `?roadboon=0`(world / index で独立) |

---

## 12. 実装結果

- **ステータス**: ✅ **完了**(dev-loop 4 項目・停止 0 回)。⛔ **push は未実施**(ユーザー承認事項)。
- **着手前 HEAD** = `35ee8e8`(⛔ 非退行の基準はこれ)

### 12-1. コミット

| 項目 | commit | 件名 |
|---|---|---|
| 1 (装置) | `a30bb39` | #47 項目1 — 装置 tools/verify_road_boon.js (ポート 9790・§0 母集団ガード / §1-§4 は PENDING) |
| 2 (街道側) | `c492253` | #47 項目2 — 街道側: BOONS 表 / boonOf / 「携えた」の 1 行 / roadBoon の書き込み / 撤退 ?roadboon=0 |
| 3 (潜行側) | `abf0267` | #47 項目3 — 潜行側: roadBoon の消費 / 糧 maxHp+3 / 備え applyRoadVigilance / label ホワイトリスト / 撤退 ?roadboon=0 |
| 4 (締め) | `24e1e7a` | #47 項目4 (最終) — 撤退 ?roadboon=0 の受入 3 本 / 変異 15 本 / golden 15 本の非退行 / 締め |

⚠ 本節の hash は **追補コミットで実 hash に置き換えてある**(#45 / #46 と同じ作法)。
⛔ 「本コミット」のまま残さない —— 後から読む窓が台帳から実物へ辿れなくなる。

⚠ 項目 4 が触ったのは `tools/verify_road_boon.js` と本依頼書・`実装依頼書/README.md` だけ
(`index.html` / `tavern.html` / `audio.js` は 1 バイトも動かしていない)ので **changelog は不要**
(`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC` トリガー範囲外)。

### 12-2. ⛔ 依頼書の主張が崩れた 4 件(⭐ 全部この窓が実測して訂正した)

#### (1) ⭐⭐⭐ ポート 9770 は空きではなかった(§4-1 の誤り)

依頼書 §4-1 は「`tools/*.js` の全ポートを実測して空きを確認済み」として **9770** を指定していたが、
これは **base ポートだけを見た判定**だった。流用元の `tools/verify_road_events.js` は
base **9760** + 変異 **14 本**で、`--negative` 時に `PORT + 1 + i` = **9761〜9774 を占有する**。
⇒ **9770 はそのレンジのど真ん中**で、両方を並走させると片方が EADDRINUSE で落ちる。

⇒ **9790 へ変更**(9775〜9849 は完全に空き。次に使われているのは `verify_enemy_name_label` の 9850)。
本ドライバは base 9790 / `--negative` で **9791〜9805**(変異 15 本)を使う。

⭐ **教訓**: **ポートの空きは base だけでなく「そのドライバが `--negative` で開くレンジ」まで数える。**

#### (2) ⭐⭐⭐ `taintlabel` の当たり先が誤り(§8 負のコントロール表)

依頼書は「`BOONS` の label を `<img src=x onerror=1>` に差し替える(`js/road-events.js`)」と
書いていたが、これは **原理的に (2e) を赤にできない**:

- (2e) の汚れた label は **ドライバ側の `IDX_SEED_TAINT` を sessionStorage へ直接置く**経路で
  供給される。⇒ `js/road-events.js` の `BOONS` を汚しても **観測に 1 バイトも届かない**。
- しかも `BOONS` が汚れても `index.html` の白名簿が正しく既定語へ倒すので、**実装は正しいまま** = 緑。

⇒ **正しい変異は `index.html` の白名簿そのものを外すこと**:

    from: '        const label = (typeof b.label === "string" && ROAD_BOON_LABEL_OK.test(b.label))'
    to  : '        const label = (typeof b.label === "string" && (true || ROAD_BOON_LABEL_OK.test(b.label))) /* mut-taintlabel 白名簿を外す */'

**実測**: 汚れた腕の `#combatLog` が 要素 **4 → 7** / `<img>` **0 → 3** になり (2e) が赤くなった
(既定語「街道の糧」/「街道の備え」もログから消えた)。
⭐ 罠 B(`appendLog` は `innerHTML` 代入・escape ヘルパ 0 件)を**実弾で再現できた**ことになる。

⭐ **教訓**: **変異は「仕様の言葉」でなく「その assert が実際に読む値の供給口」へ当てる。**

#### (3) ⭐⭐⭐ `boxleak` 1 本では paint() 側を検出できない(項目 2 のワーカーの報告が正しかった)

依頼書 §8 は `boxleak` を 1 行で「`close()` / `paint()` で `#worldEventBoon` をクリアしない」と
書いていたが、これは **別々の欠陥**で 1 本の変異では片方しか壊せない。しかも **paint() 側の掃除は
通常の導線(open → 二択 → showResult → 先へ進む)では `close()` が先に消してしまうため、
実クリックで歩く腕からは原理的に観測できない**。

⇒ 対処は **2 つ同時に**入れた:

1. **(1e) に ④ の観測を追加** —— `measurePlay` の末尾に **探針 (`paintProbe`)** を置き、本番の
   `ROAD_EVENTS.showResult()` で「携えた」を 1 行出したあと、**`close()` を挟まずに**
   `ROAD_EVENTS.open()` で描き直して器が空 + `hidden` に戻るかを見る。
   ⛔ これは「駆動」ではなく **モジュールの探針**(押し口 = 閉じるボタンは 1 度も肩代わりしていない)。
   ⚠ 実操作の観測を全部採り終えた**最後**にだけ実行する(盤面を汚すため)。
   ⭐ 母集団ガード = 「探針が実際に 1 行を出せている」ことまで見る(出せていないと自明に緑)。
2. **変異を `boxleak_close` / `boxleak_paint` の 2 本に割った**(⇒ 変異は 14 行 → **15 本**)。

**実測(= 依頼書が求めた「実際に走らせて証明」)**:

- `boxleak_close` → armWin の **閉じた後**が
  `"→ 干し魚の束 を携えた(この先の潜行で効く)"/hidden=false` で残り、(1e) が赤。
- `boxleak_paint` → ④ の **描き直し後**が `"→ 探針の実り を携えた(この先の潜行で効く)"` で残り、(1e) が赤。
  ⭐⭐⭐ このとき ①②③(実クリックの 3 腕)は **全部緑のまま**だった。
  ⇒ **「探針を足さなければこの欠陥は永久に検出できなかった」ことが機械で証明できた。**

#### (4) ⭐⭐⭐ `dismissboon`(罠 A の再現)が **1 度空振りした** —— 門番が 2 本あった

依頼書 §8 のとおり `boonOf` から **`!choice.check` の門番だけ**を外す変異
(`if (!ev || !choice) return null;`)を入れたところ、**(1a) も (3a) も緑のまま**だった
(初回 `--negative` = **46/48・FAILED 2** = この 2 本が「⛔ 緑のまま (空振り)」)。

**真因**: `world.html` は判定なしの枝で `finishRoadEvent(ev, choice, null)` と
**`outcome` に `null`** を渡す。⇒ 1 本目の門番を外しても、
2 本目の `if (!outcome || !outcome.success) return null;` が **同じ枝をもう一度落とす**。
⇒ 現状 **`!choice.check` は冗長な二重の門番**(将来「判定なしの枝でも outcome を作る」変更が
入ったときにだけ効き始める保険)。

⇒ 変異を「行を消す」ではなく **assert が守っている欠陥そのもの(= 判定なしの枝に恩恵が付く)**
を 1 行で再現する形へ直した:

    to: '    if (!ev || !choice) return null; if (!choice.check) outcome = { success: true }; /* mut-dismissboon 罠 A */'

**実測**: (1a)① が `roadBoon 1 件 (期待 0)`、(3a) が
`⛔ 素: 判定なしの枝だけを押したのに world 側で dragonfighters.roadBoon が書かれた` で **両方赤**。

⭐ **教訓**(#38 の「条件を潰す変異は『条件が 1 本とは限らない』」の実例):
**⛔ 変異の設計を「依頼書が名指しした 1 行を消す」で終わらせない。
その 1 行を消して欠陥が実際に発現するかまで筋を追うこと。**
⭐ **副産物**: この空振りは「`!choice.check` は今のところ死んだ門番」という**設計上の事実**を
機械で明らかにした。⛔ **消してよいという意味ではない** —— #45 の golden 3 本が押す枝への
唯一の明示的な宣言なので、`world.html` 側が outcome を渡す形に変わった瞬間に効き始める。

#### ⭐ 崩れなかった主張(記録)

§2-4 の予測どおり、`world.html` の `sessionStorage.setItem` は **3 → 4** に増えたが
`verify_road_events` の (2c) は緑のまま(本チケットの (1d) も独立に緑)。

### 12-3. ⚠⚠ `verify_run_chronicle` の揺れ —— **実プレイ系 golden は逐次で走らせる**

この窓の着手前採取で、`verify_run_chronicle` は **他のドライバと並走させると 71/73**
(母集団ガード (1z1) が立たない)になり、**単独実行では 73/73** になった。
⇒ ⛔ **golden は 1 本ずつ逐次で走らせること**(並走が揺れの原因)。
⭐ **単発の赤はまず 1 回だけ再実行する**(再実行でも赤なら本物)。

### 12-4. 受入条件(`tools/verify_road_boon.js` / ポート 9790)

    node tools/verify_road_boon.js
      → 20/20 PASSED   FAILED 0   **PENDING** 0   (exit 0)
      PASSED: (0a)(0b)(0c)(0d) (1a)(1b)(1c)(1d)(1e) (2a)(2b)(2c)(2d)(2e)(2f) (3a) (4a)(4b)(4c) (9a)

⭐ **PENDING 0** = 依頼書 §8 の受入条件が 1 本も「まだ測れない」で逃げていない。
項目 1 が 4/4 (+3 PENDING 節)、項目 2 が §1、項目 3 が §2/§3、**項目 4 が §4** を移設した。

**項目 4 が移設した §4 の実測値**:

| 節 | 実測 |
|---|---|
| (4a) | 撤退 `?roadseed=7&roadboon=0` で `coast_dock_quarrel` が **success=true**(母集団成立)。器 = `hidden:true / text:""`、`roadBoon=null`、localStorage も null。⭐ **同じ種・同じ行き先・同じ d20 の素の腕**は同じ出来事で **1 件書いている**(⛔ これが無いと撤退アームだけの assert は永久緑) |
| (4b) | 素 maxHp=30 / **恩恵 (撤退なし) maxHp=36**(= 仕込みが効くことの母集団ガード)/ 撤退+仕込み **maxHp=30**・仲間も同一・街道の行 **0 本**・`ROAD_BOON_ON=false`・起動後のキーが **仕込みの JSON と 1 バイトも違わず残っている** |
| (4c) | 4 本の撤退アーム(world boot / world 成功アーム / index 素 / index 仕込み)すべて **pageerror 0 件**。⚠ **CONSOLE ではなく PAGEERROR だけを数えている**(index.html は初回ロードで 404 を 1 本吐くことがあり、それは実装の欠陥ではない)。⭐ 各腕に「そのページが立ち上がっている」母集団ガードを付けた |

⭐ **測定点を移した箇所**(⛔ 期待値は 1 つも緩めていない):
(4c) は共有の errs バケツから拾うと (9a) と母集団が混ざるので、
**撤退アームごとに専用バケツ**(`withErrs`)を持たせた。拾ったものは共有バケツへも流すので
(9a) の母集団は 1 件も減っていない。

### 12-5. 負のコントロール(`--negative`)

    node tools/verify_road_boon.js --negative
      → 48/48 PASSED   FAILED 0   **PENDING** 0   (exit 0)
      内訳: 注入の検算 30 本 (n0a/n0b × 15) + 変異が赤くなる 17 本 + (n9a) 実装漏れ 0 = 48

**変異 15 本(依頼書 §8 の 14 行 = `boxleak` を 2 本に割った)— 空振り 0**:

| 変異 | 配信先 | 赤くなった節 |
|---|---|---|
| `nogrant` | js/road-events.js | (0c)(1a) |
| `dismissboon` ⭐⭐⭐ 罠 A | js/road-events.js | (1a)(3a) |
| `failgrant` | js/road-events.js | (1a) |
| `taintlabel` ⛔ 当たり先を訂正 | **index.html** | (2e) |
| `emptylabel` | js/road-events.js | (1b) |
| `nocap` | world.html | (1c) |
| `noconsume` | index.html | (2a) |
| `nogrow` | index.html | (2b) |
| `alwaysvigil` | index.html | (2c) |
| `copyboon` | world.html | (0b) |
| `localwrite` | world.html | (1d) |
| `retreatwrite` | world.html | **(4a)** |
| `retreatconsume` | index.html | **(4b)** |
| `boxleak_close` ⛔ 分割 | js/road-events.js | (1e) |
| `boxleak_paint` ⛔ 分割 | js/road-events.js | (1e) |

⚠ **(4c) には変異が無い**(依頼書 §8 の表にも無い)。ページが立ち上がっているかの
母集団ガードで「永久緑」だけは塞いである。

### 12-6. 既存 golden の非退行(⛔ 15 本。着手前 HEAD = `35ee8e8` の実測が基準)

⚠⚠ **`world.html` を参照するドライバは 7 本ではない。** #45 は 7 本で確認して
`verify_player_sheet` を取りこぼし、**実物の赤を出荷した**(§2-11)。
⛔ **1 本ずつ逐次で走らせた**(§12-3 の揺れ対策)。⚠ `tools/probe_party_size.js` は
1 本で 15 分超かかるため orchestrator が別枠で採った(本表の外)。

| ドライバ | 実測(実装後) | 基準(着手前 `35ee8e8`) | 一致 |
|---|---|---|---|
| `tools/verify_road_events.js` | **25/25** FAILED 0 PENDING 0 exit 0 | 25/25 | ✅ |
| `tools/verify_world_steps.js` | **33/33** FAILED 0 PENDING 0 exit 0 | 33/33 | ✅ |
| `tools/verify_world_map.js` | **57/57** FAILED 0 PENDING 0 exit 0 | 57/57 | ✅ |
| `tools/verify_quest_walk.js` | **25/25** FAILED 0 PENDING 0 exit 0 | 25/25 | ✅ |
| `tools/verify_world_heromark.js` | **18/18** FAILED 0 PENDING 0 exit 0 | 18/18 | ✅ |
| `tools/verify_town_exit.js` | **素 23/23** PENDING 0 exit 0 | 23/23 | ✅ |
| `tools/verify_title_screen.js` | **86/86** exit 0 | 86/86 | ✅ |
| `tools/verify_tavern_map.js` | **43/43** FAILED 0 PENDING 0 exit 0 | 43/43 | ✅ |
| `tools/verify_ability_scores.js` | **24/24** FAILED 0 PENDING 0 exit 0 | 24/24 | ✅ |
| `tools/verify_darkvision.js` | **25/25** FAILED 0 PENDING 0 exit 0 | 25/25 | ✅ |
| `tools/verify_mercenary_roster.js` | **44/44** FAILED 0 PENDING 0 exit 0 | 44/44 | ✅ |
| `tools/verify_recruit_size.js` | **82/82 PASS** exit 0 | 82/82 | ✅ |
| `tools/verify_run_chronicle.js` | **73/73** FAILED 0 PENDING 0 exit 0(⭐ 単独実行) | 73/73 | ✅ |
| `tools/driver_grid_p8.js` | 1 回目 **55/1**(flake)→ **再実行 56/56 FAIL 0 exit 0** | 56/56 | ✅ |
| `tools/verify_player_sheet.js` | **66/70** FAILED 4 = **{(2c)(2d)(8a)(8f)}** PENDING 0 exit 1 | 同じ集合(着手前から赤) | ✅ **非退行** |

⛔ **期待値の変更 0 件**(どの golden の assert も 1 行も書き換えていない)。

#### ⚠ `driver_grid_p8` の 1 回目の赤は flake だった(⭐ 再実行で確定)

    1 回目: PASS 55 / FAIL 1  (exit 1)
      FAIL (8e) ★noapproach → 玉座から遠いまま入室しただけでボス部屋になり (8d) が赤くなる
                — 素={"dist":6,"at":144} / 変異=null
    再実行: PASS 56 / FAIL 0  (exit 0)

指紋 = **変異アームの観測が `null`**(= 負のコントロールのページが完走しなかった)で、
**素のアームは正常に `dist:6 / at:144` を返している**。⇒ 実装の欠陥ではなく資源競合。
⭐ **教訓(#34 と同じ)**: **実プレイ系ドライバの単発の赤は、まず 1 回だけ再実行する。**

### 12-7. 残り = **実機体感**(§9 の 6 項目。⛔ 機械では測れない)

1. 街道を横断して、**「携えた」の 1 行が羊皮紙の中で浮いていないか**(compact / iPhone 縦)
2. 判定に勝ったとき「**得した**」と感じるか。⭐ +3 が地味すぎないか / 派手すぎないか
3. 「備え」の初手潰しが、**戦闘のどこで効いたか分かるか**(バナー 1600ms は短くないか)
4. 潜行開始のログ 1 行が、**開幕ナレーションに埋もれて読まれずに流れないか**
   (⚠ `SCENARIO_NARRATIONS` の 4 段落が先に走る)
5. 横断 1 回あたり 0.6 個という頻度が、**「たまに嬉しい」に感じられるか**(§2-9)
6. 「街道で得たもの」が **6 件のどれだったか思い出せるか**(label が短すぎないか)

⛔ **`+3` という数値と 6 件 → 2 種の割り当ては assert で縛っていない**(§8「測らないこと」)。
遊んでから動かすレバー。動かすときは `index.html` の `+ 3` の 2 箇所(頭 / 仲間)と
ドライバの `HP_PER_PROVISION` を **同時に**動かすこと。

### 12-8. ⚠⚠⚠ `verify_player_sheet` の FAILED 4 本は #47 では直していない

§11 の分岐 **(A)** がユーザー承認で確定しているとおり、
`verify_player_sheet` の FAILED = `{(2c),(2d),(8a),(8f)}` は **着手前(`35ee8e8`)から赤**で、
真因は #45 項目2 の `475839d`(`world.html` へ `js/skill-check.js` を載せたので習熟 / 技能の
区画が出るようになったのに、`tools/verify_player_sheet.js:1973-1975` の期待表が
「world では伏せる」のまま取り残された)。
⇒ **#47 の扱いは「集合が同じなら非退行 / 増えたら #47 のせい」だけ**。
**担当は別チケット #48**。
