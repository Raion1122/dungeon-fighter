# #90 罠を宣言どおりに — 隊商護衛と街道の襲撃から罠を撤去

- **起草**: 2026-10-12(起草窓) / **ステータス**: **承認済**(2026-10-12 ユーザー承認)
- **触るファイル**: `index.html`(2 行 + 撤退の定数 1 本)/ `tavern.html`(changelog の `<li>` 1 本だけ)/ `tools/driver_mapdef_step1.js`(言い直し)/ `tools/verify_declared_traps.js`(新規)/ 本依頼書
- ⛔ **触らないファイル**: なし(2026-10-12 時点で作業ツリーは clean・並走なし)。`js/road-events.js` / `tavern.html` の生成ロジックは**読むだけ**。

---

## 1. 目的

酒場の「隊商護衛」は依頼側(`tavern.html`)で `trapCount = 0` と宣言しているのに、ゲーム側(`index.html`)の 2 段の `|| 3` が
0 を「未指定」と取り違え、**馬車を守るウェーブ防衛の盤面に見えない罠が 3 個湧く**。
起草中の実測で、**街道の襲撃(#51)も同じ理由で罠が 3 個湧いている**ことが分かった(宣言 0 / `currentScenario.trapCount === 0` なのに置き場の段で 3 へ戻る)。
どちらも「部屋を踏破しない」戦闘なので、罠は停滞要因と被ダメージにしかならない(`tavern.html` 10266 のコメント「罠/隠し宝箱は停滞要因なので 0 にする」が意図)。

**ユーザー決定(2026-10-12)**:

- 「罠を消去」= 宣言 0 を尊重し、隊商護衛(と同じ欠陥を持つ街道の襲撃)に罠を湧かせない。
- 隊商護衛の補填 0G は #87 K19 の決定のまま(本チケットでは触らない)。
- ⭐ 不採用: `11517` の `|| 3` だけを `??` にする案 —— §2-2 のとおり**それだけでは罠は 1 個も減らない**(置き場の段で再び 3 になる)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実・基準 `7ea29ac`)

### 2-1. `trapCount` / `hiddenChestCount` の読み口(リポジトリ全文 grep・配信物のみ)

| ファイル:行 | 何 | 宣言 0 を |
|---|---|---|
| `index.html:11318`〜`11453` | 既定 7 シナリオの `SCENARIOS`(trapCount 3〜6) | — (0 は無い) |
| `index.html:11495` | 街道の襲撃 `trapCount: _roadBattle.trapCount \|\| 0` | 0 のまま |
| `index.html:11517` | 生成クエスト `trapCount: _genScenario.trapCount \|\| 3` | **3 へ化けさせる** |
| `index.html:11518` | 生成クエスト `hiddenChestCount: _genScenario.hiddenChestCount \|\| 2` | 2 へ化けさせる(§11 で対象外) |
| `index.html:24741` | `spawnHiddenChests` `currentScenario.hiddenChestCount \|\| 0` | 0 のまま |
| `index.html:26175` | **`spawnTraps` `currentScenario.trapCount \|\| 3`** | **3 へ化けさせる(2 段目)** |
| `index.html:3617` | `roadChestBonusGold()`(#87)= 宣言 `_genScenario.hiddenChestCount` を読む | 影響なし |
| `tavern.html:10267` | 隊商護衛 `gen.trapCount = 0; gen.hiddenChestCount = 0;` | 宣言元 |
| `tavern.html:3885-3909` | 生成クエストの tier 表(trapCount 3/4/5/6) | — |
| `js/road-events.js:486` | 街道の襲撃の積荷 `trapCount: 0, hiddenChestCount: 0` | 宣言元 |

⇒ **宣言 0 を出すのは隊商護衛と街道の襲撃の 2 つだけ**。既定 7 シナリオと tier 生成クエストは 3 以上なので、`|| 3` → 数値判定に変えても値は 1 つも動かない。

### 2-2. ⚠⚠⚠ 罠は 2 段で化ける(実ブラウザで測った)

使い捨て probe(scratchpad `probe_trap_count.js`・素の本番・各腕 2 回・`?intel=0`)で、読み込み直後の `traps.length` と `.trap` の DOM 数を測った:

| 腕 | 積荷 | `currentScenario.trapCount` | 実際の罠 |
|---|---|---|---|
| 隊商護衛(`generated-quest`・宣言 0) | `trapCount: 0` | **3**(11517 で化ける) | **3 / 3** |
| **街道の襲撃**(`dragonfighters.roadBattle`) | 宣言なし | **0** | **3 / 3**(26175 で化ける) |
| 生成クエスト tier1 | `trapCount: 3` | 3 | 3 / 3 |
| 生成クエスト 宣言なし | なし | 3 | 3 / 3 |
| 廃坑 既定(分岐マップ・入口ノード) | — | 3 | 0 / 0 |

⇒ `11517` だけ直すと、隊商の `currentScenario.trapCount` は 0 になるが **26175 が 0 を 3 へ戻す**ので罠は 3 個のまま(街道の襲撃が今まさにその姿)。**2 段とも直す**。
⭐ この罠は §8 の変異 `onlyscen`(11517 だけ直して 26175 を戻す)として装置に内蔵する。

### 2-3. ⚠⚠ 乱数の消費を動かさない

`spawnTraps()` は候補を全部集めて **Fisher-Yates を回してから** `spawnN = Math.min(count, candidates.length)` を取る(26196-26200)。
⇒ count を 0 にしても**シャッフルは今どおり回す**(`if (count <= 0) return;` を足さない)。分岐マップの `withNodeRng`(11696-)の下では
後に続く `spawnHiddenChests` / `spawnExplorationChests` が同じ乱数列を引くので、早期 return を足すと既定シナリオの盤面が別物になり得る。
(既定シナリオで trapCount 0 は無いので実害は無いはずだが、「乱数と占有を動かさない」は #87 と同じ作法として守る。)
⭐ 変異 `earlyret`(count 0 で早期 return)を入れて、少なくとも「既定シナリオの罠座標が baseline と一致」(既存 `driver_mapdef_step1` (4a))が担保されることを確かめる。

### 2-4. ⚠⚠⚠ この欠陥に**頼っている** golden がある(型1)

`tools/driver_mapdef_step1.js:51-52`:

    ⚠ 生成クエストの trapCount は index.html:6992 が `_genScenario.trapCount || 3` なので、
      隊商護衛の実ペイロード (trapCount:0) でも罠は 3 個湧く = 屋外でも assert 4 は空振りしない。

同ドライバの隊商 2 腕(縦持ち / 横持ち)の **(G7)「traps が 1 件以上」と (4a)「traps の座標列が baseline と一致」** は修正後に構造的に赤になる
(baseline の木では 3 個・新しい木では 0 個)。この本が守っているのは「**屋外テーマでの spawnTraps の除外ロジック**」で、隊商の宣言値ではない。
⇒ **言い直し**: 同ドライバの `CARAVAN_PAYLOAD`(243-250)を `trapCount: 3` にする(baseline の木でも同じ 3 個が湧くので (4a) の比較は従来どおり成立する)。
コメント 51-52 も「宣言 3 を明示して除外ロジックを測る(#90 で 0 は 0 になった)」へ書き換える。⛔ 期待値・assert 本体は変えない。

### 2-5. 母集団(罠の数が動く腕を持つ tools)

隊商護衛 / 街道の襲撃の積荷を置く本 = **17 本**(`grep -l "trapCount: *0\|roadBattle\|road-ambush" tools/*.js`):
`driver_field_scale` / `driver_field_step0` / `driver_field_step05_hud` / `driver_field_step1_geo` / `driver_field_step2` / `driver_field_step3` /
`driver_field_step5` / `driver_field_step6` / `driver_field_step6_png` / `driver_field_step7` / `driver_field_verge_gap` / `driver_field_wagon` /
`driver_mapdef_step1` / `driver_paint_grid` / `driver_sce1_events` / `probe_paint_overlay` / `verify_road_ambush`。
+ 生成クエストの積荷を置く `verify_recruit_size` / `verify_synth_bgm` / `verify_corner_check`(tier3・宣言 5 = 動かない対照)。
⭐ `driver_field_step6:310` / `driver_field_step7:402` は自前で `traps.length = 0` してから測っている = 罠を邪魔者として消していた本(本チケットで素の状態に近づく)。
⚠ `verify_road_ambush:1428` は `currentScenario.trapCount` を記録するだけ(街道は 0 のまま動かない)。

### 2-6. 探索判定パネルへの波及

`runRoomSearchCheck`(26347-)は「罠も鍵束もミミックも無い部屋では振らない」(#87 K9)。#87 で宝箱が消えた今、隊商 / 街道の部屋で
探索判定が振られる理由は**罠だけ**だった ⇒ 修正後は**隊商護衛と街道の襲撃で探索判定のパネルが出なくなる**(意図どおり・§9 で目視)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
プレイヤー向けの要約は実在する(見えない罠を踏まなくなる・判定パネルが出なくなる)= §10。

**再測定コマンド**:

    grep -n "trapCount\|hiddenChestCount" index.html tavern.html js/*.js
    node <scratchpad>/probe_trap_count.js "<repo>" 10617 2     # 起草時の probe(依頼書には同梱しない)

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 撤退の定数 1 本(`ROAD_CHEST_ON` 3596 の直後)/ 11517 / 26175 の 2 行 |
| `tavern.html` | changelog の `<li>` 1 本だけ(⛔ 10267 の宣言は触らない) |
| `tools/driver_mapdef_step1.js` | `CARAVAN_PAYLOAD.trapCount` 0 → 3 + コメント 51-52(§2-4) |
| `tools/verify_declared_traps.js` | 新規(§8) |

---

## 4. STEP1 — 撤退の定数

`index.html` 3596(`const ROAD_CHEST_ON = ...`)の直後へ:

```js
    /* ★[#90] 罠の数は宣言どおり (隊商護衛 / 街道の襲撃の 0 を 3 へ化けさせない)。依頼書 2026-10-12_declared-traps.md。
     *   化けていたのは 2 段 = 生成クエストの組み立て (_genScenario.trapCount || 3) と spawnTraps (trapCount || 3)。
     *   撤退 ?trapdecl=0 = 従来どおり 0 を 3 として扱う。 */
    const TRAP_DECL_ON = new URLSearchParams(window.location.search).get("trapdecl") !== "0";
```

## 5. STEP2 — 2 段を直す

```js
    // 11517 (生成クエスト)
        trapCount: (TRAP_DECL_ON && typeof _genScenario.trapCount === "number" && _genScenario.trapCount >= 0)
                     ? _genScenario.trapCount : (_genScenario.trapCount || 3),
```

```js
    // 26175 (spawnTraps)
      /* ★[#90] 宣言 0 を尊重する。⚠ count が 0 でもシャッフルは今どおり回す (早期 return を足さない) —
       *   分岐マップの withNodeRng の下では後続のスポーンが同じ乱数列を引くため (§2-3)。 */
      const _tc = currentScenario.trapCount;
      const count = (TRAP_DECL_ON && typeof _tc === "number" && _tc >= 0) ? _tc : (_tc || 3);
```

⛔ 動かさない: `11518` の `hiddenChestCount || 2`(§11)/ `11495` / `24741` / `spawnTraps` の候補集合とシャッフル / 既定 `SCENARIOS` の値 / `tavern.html` の宣言。
⚠ `TRAP_DECL_ON` は `const` で 3596 付近 = 11517 / 26175 より前に評価される(TDZ にならない)ことを着手時に確かめる。

## 6. STEP3 — `driver_mapdef_step1` の言い直し(§2-4)+ changelog(§10)

---

## 7. 撤退スイッチ

- **`?trapdecl=0`** — 宣言 0 を従来どおり 3 として扱う(隊商 / 街道に罠 3 個)。
- ⚠ 判定位置 = `index.html` の `TRAP_DECL_ON`(読み込み時 1 回)。ページ遷移はまたがない(罠は `index.html` の中だけで湧く)。

---

## 8. 受入条件 — `tools/verify_declared_traps.js`(新規・素 port **10617** / 変異 10618〜)

`index.html` を直接開き、sessionStorage に積荷を置いて読み込み直後の罠を数える(起草時の probe と同じ測り方)。
⭐ 罠の数は **2 経路**で突き合わせる: 内部配列 `traps.length` と DOM の `.trap` 要素数(`#nodeLayer` の子)。
⭐ 期待値は**ドライバに写経しない**: 隊商の宣言は `tavern.html` の生成関数から、街道は `js/road-events.js` の積荷から実体を引く
(引けない場合は (0b) を赤にする。⛔ 握り潰して固定値へ落とさない)。

### §0 装置

- **(0a)** 対照腕(生成クエスト tier1 = 宣言 3)で罠が **3 個**湧いている(= 検出器が 0 を返す空振りでない)。⭐ これが無いと (1a)(1b) の「0 個」が永久緑。
- **(0b)** 隊商 / 街道の宣言値を実体から引けた(どちらも 0)。
- **(0c)** 各腕で `scenarioId` が期待どおり(`generated-quest` / `road-ambush`)・pageerror 0。

### §1 本体

- **(1a)** 隊商護衛: `currentScenario.trapCount === 0` **かつ** 罠 0 個(配列・DOM の両方)。
- **(1b)** 街道の襲撃: 罠 0 個(配列・DOM の両方)。
- **(1c)** 生成クエスト 宣言なし: 罠 3 個(既定値 3 は残る)。
- **(1d)** 生成クエスト tier1〜4: 罠 = 宣言値(3/4/5/6。tier 表は `tavern.html` から引く)。

### §2 恒等

- **(2a)** 既定 7 シナリオ(`?graph=0` の単一マップ)で罠の座標列が `?trapdecl=0` の腕と一致(乱数の消費が動いていない)。
  ⭐ `?graph=0` は `RUN` が無く `Math.random` が素のままなので、両腕で `Math.random` を同じ種の LCG へ差し替えてから読み込む。

### §3 撤退

- **(3a)** `?trapdecl=0` で隊商 / 街道とも罠 3 個(従来の姿)。

### ⛔ 測らないこと

- 罠のダメージ・発見率・探索判定パネルの見た目(§9 の目視)。
- 隠し宝箱の数(§11 で対象外)。

### 負のコントロール(`--negative` で内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `onlyscen` | 11517 だけ直し、26175 を `\|\| 3` へ戻す(§2-2 の罠) | (1a)(1b) |
| `onlyspawn` | 26175 だけ直し、11517 を `\|\| 3` へ戻す | (1a) の `currentScenario.trapCount` 側 |
| `zeroall` | `spawnTraps` の count を常に 0 | (0a)(1c)(1d) |
| `earlyret` | count 0 で早期 return(シャッフル前) | 期待 = 緑(既定シナリオに 0 が無い)⇒ ⭐ **赤にならないことを記録する腕**(担当外の赤 0 を確かめる。§2-3 の主張の裏取り) |
| `nodecl` | `TRAP_DECL_ON` を常に false | (1a)(1b) |

### 既存 golden の非退行(実装後に必ず走らせる)

- §2-5 の 17 本 + `verify_recruit_size` / `verify_synth_bgm` / `verify_corner_check`。⭐ **着手前の色を先に控える**(項目1)。
- `driver_mapdef_step1` は言い直し後に緑(隊商 2 腕の (G7)(4a) を含む)。
- 帰属の切り分けは従来どおり影のツリー(#89 の `mkshadow` 型)と交互の対比較。

⚠ 基準値は 2026-10-12 時点の記録。走らせて違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認

- 隊商護衛を 1 回遊び、罠の発見・踏みつけのログが出ない / 探索判定パネルが出ないこと。
- 街道の襲撃でも同じ。
- 通常の依頼(tier)では今どおり罠が見つかること。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>隊商護衛と街道の襲撃から罠を撤去</b> — 馬車を守る戦いの最中に、見えない罠を踏むことはなくなった。"

---

## 11. やらないこと

- ⛔ `11518` の `hiddenChestCount || 2`。#87 で道中の宝箱は既定で湧かない(`?roadchest=0` の撤退腕でだけ効く)ので、ユーザーの「罠を消去」の範囲外。
- ⛔ 隊商護衛の補填金貨(#87 K19 のユーザー決定 = 0G のまま)。
- ⛔ `tavern.html` の宣言(10267)・生成クエストの tier 表・街道の積荷(`js/road-events.js`)。
- ⛔ 測定器の揺れ回収 / `driver_field_step6` Part C(別チケット・memory `project_ticket_triage_after_89`)。
- `実装依頼書/README.md` へ足す行:

    | 90 | [2026-10-12_declared-traps.md](2026-10-12_declared-traps.md) | **承認済** | 0% | 罠を宣言どおりに — 隊商護衛と街道の襲撃から罠を撤去。⚠ 化けは 2 段(11517 と spawnTraps 26175)= 片方だけでは 0 個にならない / ⚠ `driver_mapdef_step1` の隊商 2 腕は欠陥に頼っていた ⇒ ペイロードを trapCount:3 へ言い直す。撤退 `?trapdecl=0` |

---

## 12. 実装結果

(実装窓が埋める)
