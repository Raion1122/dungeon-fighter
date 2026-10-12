# #90 罠を宣言どおりに — 隊商護衛から罠を撤去(街道の襲撃は出荷中の積荷では元から罠 0 だった・K1)

- **起草**: 2026-10-12(起草窓) / **ステータス**: **完了**(2026-10-12 ユーザー承認 → 同日 項目4 まで完了・push 待ち。結果は §12)
- **触るファイル**: `index.html`(2 行 + 撤退の定数 1 本)/ `tavern.html`(changelog の `<li>` 1 本だけ)/ `tools/driver_mapdef_step1.js`(言い直し)/ `tools/verify_declared_traps.js`(新規)/ 本依頼書 / (項目4 で追加)`tools/driver_field_step5.js`(言い直し・§12-4)
- ⛔ **触らないファイル**: なし(2026-10-12 時点で作業ツリーは clean・並走なし)。`js/road-events.js` / `tavern.html` の生成ロジックは**読むだけ**。

---

## 1. 目的

酒場の「隊商護衛」は依頼側(`tavern.html`)で `trapCount = 0` と宣言しているのに、ゲーム側(`index.html`)の 2 段の `|| 3` が
0 を「未指定」と取り違え、**馬車を守るウェーブ防衛の盤面に見えない罠が 3 個湧く**。
起草中の実測で、**街道の襲撃(#51)も同じ理由で罠が 3 個湧いている**ことが分かった(宣言 0 / `currentScenario.trapCount === 0` なのに置き場の段で 3 へ戻る)。
どちらも「部屋を踏破しない」戦闘なので、罠は停滞要因と被ダメージにしかならない(`tavern.html` 10266 のコメント「罠/隠し宝箱は停滞要因なので 0 にする」が意図)。

> ⚠ 項目1 で訂正: 出荷中の街道の襲撃(実物の積荷 = `AMBUSH_FIELD`・#52 以降カスタム 1 部屋 `role:"boss"`)は `EXCLUDED_ROOMS = [0]` で罠の置き場が 0 = **今も罠は 0 個**(§12-0 K1)。上の「街道にも 3 個」は合成の積荷(themeId・mapDef なし)での値。罠が実際に湧いて撤去されるのは**隊商護衛だけ**。街道の襲撃は 2 段目(26175)の化けを同じく抱えるので、修正は街道の経路も守るが、プレイヤーに見える変化は無い。

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

> ⚠ 項目1 で訂正: 表の「街道の襲撃 3 / 3」は合成の積荷(themeId・mapDef なし = 廃坑の単一マップへ落ちる)の値。実物の積荷(`AMBUSH_FIELD`)では **0 / 0**(部屋 1・`EXCLUDED_ROOMS = [0]`)。再測定の表は §12-0。「2 段とも直す」の結論は隊商護衛で成り立つ(合成の街道腕も 2 段目の化けを示す)。

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

> ⚠ 項目1 で訂正: 街道の襲撃は修正前から罠 0 個なので、パネルが出なくなる変化は**隊商護衛だけ**(§12-0 K1)。

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
> ⚠ 項目1 で訂正: (1b') の合成積荷は実物ではないので、`js/road-events.js` の実体から themeId・mapDef を外して作る((0b) の「宣言 0 を実体から引けた」はそのまま)。

### §0 装置

- **(0a)** 対照腕(生成クエスト tier1 = 宣言 3)で罠が **3 個**湧いている(= 検出器が 0 を返す空振りでない)。⭐ これが無いと (1a)(1b) の「0 個」が永久緑。
- **(0b)** 隊商 / 街道の宣言値を実体から引けた(どちらも 0)。
- **(0c)** 各腕で `scenarioId` が期待どおり(`generated-quest` / `road-ambush`)・pageerror 0。

### §1 本体

- **(1a)** 隊商護衛: `currentScenario.trapCount === 0` **かつ** 罠 0 個(配列・DOM の両方)。
- **(1b)** 街道の襲撃: 罠 0 個(配列・DOM の両方)。
  > ⚠ 項目1 で訂正: (1b) を 2 腕に分ける(ユーザー決定 2026-10-12)。
  > - **(1b)** 実物の積荷(`AMBUSH_FIELD` / `world.html` が書くのと同じ形)で罠 0 個**のまま**(不変の確認。修正前から緑)。
  > - **(1b')** 合成の単一マップ積荷(themeId・mapDef なし)で宣言 0 なら罠 0 個(配列・DOM の両方)= 2 段目を測る。変異 `onlyscen` / `nodecl` で赤くなる。
- **(1c)** 生成クエスト 宣言なし: 罠 3 個(既定値 3 は残る)。
- **(1d)** 生成クエスト tier1〜4: 罠 = 宣言値(3/4/5/6。tier 表は `tavern.html` から引く)。

### §2 恒等

- **(2a)** 既定 7 シナリオ(`?graph=0` の単一マップ)で罠の座標列が `?trapdecl=0` の腕と一致(乱数の消費が動いていない)。
  ⭐ `?graph=0` は `RUN` が無く `Math.random` が素のままなので、両腕で `Math.random` を同じ種の LCG へ差し替えてから読み込む。

### §3 撤退

- **(3a)** `?trapdecl=0` で隊商 / 街道とも罠 3 個(従来の姿)。
  > ⚠ 項目1 で訂正: 街道の腕は**合成の単一マップ積荷**で 3 個とする(実物の積荷は撤退でも 0 個)。

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

> ⚠ 項目1 で訂正: 上表の `onlyscen` / `nodecl` の「赤くなるべき節」の (1b) は **(1b')** と読み替える((1b) = 実物の積荷は修正前から 0 個なので赤くならない)。

### 既存 golden の非退行(実装後に必ず走らせる)

- §2-5 の 17 本 + `verify_recruit_size` / `verify_synth_bgm` / `verify_corner_check`。⭐ **着手前の色を先に控える**(項目1)。
- `driver_mapdef_step1` は言い直し後に緑(隊商 2 腕の (G7)(4a) を含む)。
- 帰属の切り分けは従来どおり影のツリー(#89 の `mkshadow` 型)と交互の対比較。

⚠ 基準値は 2026-10-12 時点の記録。走らせて違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認

- 隊商護衛を 1 回遊び、罠の発見・踏みつけのログが出ない / 探索判定パネルが出ないこと。
- 街道の襲撃でも同じ。
  > ⚠ 項目1 で訂正: 街道の襲撃は修正前から罠 0 個(§12-0 K1)なので、見えるのは「今どおり罠が出ない」こと。確認の主対象は隊商護衛。
- 通常の依頼(tier)では今どおり罠が見つかること。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>隊商護衛と街道の襲撃から罠を撤去</b> — 馬車を守る戦いの最中に、見えない罠を踏むことはなくなった。"

> ⚠ 項目1 で訂正: 街道の襲撃には元から罠が湧いていないので、上の文面はプレイヤー向けに偽になる。**ユーザー決定(2026-10-12)で隊商護衛だけ**を書く。実際に足すのは項目2:

    py tools/add_changelog.py "<b>隊商護衛から罠を撤去</b> — 馬車を守る戦いの最中に、見えない罠を踏むことはなくなった。"

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

> **✅ 完了(2026-10-12・push 待ち)** — `852dd0d`(項目1 着手前の実測 + pre 色・K1)+ `8ed7c63`(項目2 罠の数を宣言どおりに = `index.html` 2 段の化けを直す + 撤退 `?trapdecl=0` + `driver_mapdef_step1` の言い直し + changelog)+ `4a73684`(項目3 受入 `tools/verify_declared_traps.js` 素 10/10・負 5/5)+ 本 §12-4 を書いたコミット(項目4 母集団の非退行 + `driver_field_step5` の言い直し)。
> 母集団 25 腕(§8 の 20 本 + 負の腕 + 受入 2)で **#90 帰属の緑→赤は `driver_field_step5` の 1 本 = 欠陥に頼っていた型1 → tools 側で言い直して緑**(本番 index/tavern/audio.js は項目2 以降無変更)。アンカー衝突の全数走査で衝突 0。
> ⭐ K1(ユーザー決定): 街道の襲撃は出荷中の積荷(`AMBUSH_FIELD` = カスタム 1 部屋 `role:"boss"`)では**元から罠 0**。プレイヤー向けの変化は隊商護衛だけ。
> 残 = §9 実機(隊商護衛で罠が出ないこと・探索判定パネルの出方)。次の新規ドライバ base = **10623**。

### 12-0 着手前の実測(項目1・2026-10-12・HEAD `7c4070d` = 本番は `7ea29ac` と同一)

#### 主張ごとの照合

| 主張 | 結果 |
|---|---|
| §2-1 `index.html` 11495 / 11517 / 11518 / 24741 / 26175 / 3596 `ROAD_CHEST_ON` / 3617 | **一致**(行・式とも) |
| §2-1 `tavern.html` 10267 / 3885-3909、`js/road-events.js` 486 | **一致** |
| §2-3 シャッフル→`spawnN` | 一致(シャッフル 26195-26199・`spawnN` 26200)。`withNodeRng` は注記 11694- / 本体 **11702** |
| §5 ⚠ TDZ | **ならない**。3354-41753 の 1 本の classic script の**トップレベル**に 3596 / 11517(`if (_genScenario)` の組み立て = 読み込み時に逐次評価)が並び、3596 が先。`spawnTraps` は 37526 の `withNodeRng(..., spawnNodeEntities)`(起動シーケンス)からしか呼ばれない。実例: 同じ位置の `ROAD_CHEST_ON` を `spawnHiddenChests`(同じ連鎖)が既に読んでいる / probe で `typeof ROAD_CHEST_ON === "boolean"` |
| §2-4 `driver_mapdef_step1` 51-52 のコメント | 一致(ただし文中の `index.html:6992` は古い行番号 = 今は 11517) |
| §2-4 `CARAVAN_PAYLOAD` | 実体は **240-252**(`trapCount: 0` は **244**)。隊商 2 腕の (G7)(4a) は実在(下の実走で n=3) |
| §2-5 母集団 grep | **17 本で一致**。`driver_field_step6:310` / `step7:402` の `traps.length = 0` も一致。`verify_road_ambush:1428` も一致 |
| **§1 / §2-2「街道の襲撃も罠が 3 個湧く」** | ⛔ **崩れた(K1)** |

#### §2-2 の probe(scratchpad `item1/probe_trap_count.js`・素の本番・`?intel=0`・各腕 2 回・port 10617)

| 腕 | 積荷 | scenarioId | `currentScenario.trapCount` | `traps.length` / `#nodeLayer .trap` | 部屋 / EXCLUDED_ROOMS |
|---|---|---|---|---|---|
| 隊商護衛(宣言 0) | tavern.html の isCaravan と同形 | generated-quest | **3** | **3/3, 3/3** | 3 / [0,2] |
| **街道の襲撃(実物)** | `ROAD_EVENTS.AMBUSH_FIELD`(js/road-events.js を vm で読んだ実体) | road-ambush | 0 | **0/0, 0/0** | **1 / [0]**(カスタム 1 部屋・role boss) |
| 街道の襲撃(実物から trapCount/hiddenChestCount を削除) | 同上 | road-ambush | 0 | 0/0, 0/0 | 1 / [0] |
| 街道の襲撃(**起草時の合成積荷**: themeId/mapDef 無し) | 起草窓 probe の `ROAD` | road-ambush | 0 | **3/3, 3/3** | 2 / [1](廃坑の単一マップへ落ちる) |
| 生成クエスト tier1(宣言 3) | | generated-quest | 3 | 3/3, 3/3 | 2 / [1] |
| 生成クエスト 宣言なし | | generated-quest | 3 | 3/3, 3/3 | 2 / [1] |
| 廃坑 既定(分岐マップ・入口ノード) | | goblin-mine | 3 | 0/0, 0/0 | 1 / [0] |

pageerror は全腕 0。

#### 項目4 の pre 色(post89.tsv を流用・`7ea29ac`・本番コード同一)

| 本 | 腕 | exit | 件数 | root |
|---|---|---|---|---|
| driver_field_scale | base | 0 | 49/49 | prod |
| driver_field_step0 | base | 0 | 33/33 | prod |
| driver_field_step05_hud | base | 0 | 6/6 | prod |
| driver_field_step1_geo | base | 0 | 71/71 | clone |
| driver_field_step2 | base | 0 | 64/64 | clone |
| driver_field_step3 | base | 0 | 65/65 | clone |
| driver_field_step5 | base | 0 | 48/48 | clone |
| driver_field_step6 | base | **1** | 55/59(C-* の `?graph=auto` 前進 4 本 = 既知・K16) | prod |
| driver_field_step6_png | base | 0 | 16/16 | prod |
| driver_field_step7 | base | 0 | 79/79 | prod |
| driver_field_verge_gap | --port 18980 | 0 | 39/39 | clone |
| driver_field_wagon | base | 0 | 18/18 | prod |
| driver_mapdef_step1 | base | **1** | 207/208((0b) だけ赤 = clone 実行で worktree list に載らない装置の赤。隊商 2 腕の (G7)(4a) は緑・n=3) | clone |
| driver_paint_grid | base | 0 | 21/21 | prod |
| driver_sce1_events | base | **1** | 211/214((2)(4d)(N2-隣) = sceneFlags に `s3_novice_swayed` が増えた既知の赤) | prod |
| probe_paint_overlay | base | 0 | (件数なし・extra 行) | prod |
| verify_road_ambush | base / --negative | 0 / 0 | 41/41 / 97/97 | prod |
| verify_recruit_size | base | 0 | 91/91 | prod |
| verify_synth_bgm | base / --negative | 0 / 0 | 35/35 / 34/34 | prod |
| verify_corner_check | base / --negative | 0 / 0 | 20/20 / 変異 14 本捕捉 | prod |
| (参考)driver_heromark_signplate | base / --negative | 3 / 3 | (Z3) アンカー衝突 → #89 後に tools 側で直した(46/46・4/4) | prod |

#### 今の本番で実走した 3 本(2026-10-12・素の本番ツリー・既定ポート)

- `node tools/driver_mapdef_step1.js` → **exit 0 / 208/208 PASS**(本番ツリーで走らせたので (0b) も緑。隊商 2 腕 (G7)(4a) = n=3 `[[37,15],[33,15],[32,13]]` / `[[35,8],[43,17],[34,19]]`)
- `node tools/verify_road_ambush.js` → **exit 0 / 41/41 PASSED**((2a) の積荷 = world.html が書いた実物で `trap:0`・themeId bandits-forest・mapDef 1 部屋)
- `node tools/verify_corner_check.js` → **exit 0 / 20/20 PASSED**(82 秒)

⇒ post89 と一致(mapdef の差は clone 実行時の (0b) だけ)。

#### 実装へのメモ

- **K1 ⛔ 街道の襲撃には今も罠が湧いていない**。出荷中の積荷(`world.html` `writeAmbushBattle` が `AMBUSH_FIELD` を丸写し)は #52 以降カスタム 1 部屋 `role:"boss"` ⇒ `EXCLUDED_ROOMS = [0]` ⇒ `spawnTraps` の候補 0 でシャッフル前に return。§2-2 の「街道 3/3」は起草窓の**合成積荷**(themeId/mapDef 無し = 廃坑の単一マップへ落ちる)で測った値で、実プレイの姿ではない。
  - コード変更(2 段)は**そのまま必要**: 隊商護衛で 11517 だけ直すと 26175 が 0 を 3 へ戻す(合成の街道腕が「宣言 0 → 3 個」で 2 段目の化けを実証)。
  - 崩れる箇所: §1 の題 / changelog の「街道の襲撃から罠を撤去」(プレイヤー向けに**偽**)/ §2-6 の「街道で判定パネルが出なくなる」/ §8 (1b) は実物の積荷だと修正前から緑 ⇒ 変異 `onlyscen` / `nodecl` で赤くならない / §9 の街道の確認。
  - 言い直し案: (1b) を「実物の積荷で 0 個(不変)」+「合成積荷(単一マップ)で宣言 0 → 0 個」の 2 腕にする。changelog は隊商護衛だけを書く。⇒ **文面はユーザー判断**。
  - ✅ **ユーザー決定(2026-10-12)**: ① changelog は隊商護衛だけ =「<b>隊商護衛から罠を撤去</b> — 馬車を守る戦いの最中に、見えない罠を踏むことはなくなった。」(足すのは項目2)。② §8 を (1b) 実物の積荷で 0 個のまま(不変)+ (1b') 合成の単一マップ積荷で宣言 0 なら 0 個(変異 `onlyscen` / `nodecl` で赤)に分ける。負のコントロール表の (1b) は (1b') へ。(3a) の街道腕も合成の積荷で 3 個。③ §1・§2-2・§2-6・§8・§9・§10 は本文を残して訂正注記で直した。依頼書の題(1 行目)と README の #90 行は起草窓の持ち物 = 項目4 の完了時に一緒に直す。
- K2 `index.html` は全行 CRLF(41754 行)。編集は `py` のバイト単位か Edit で。
- K3 `driver_mapdef_step1` の言い直し点 = 244 行の `trapCount: 0`(依頼書の 243-250 ではなく 240-252 のオブジェクト)。コメント 51 の `index.html:6992` も 11517 へ。
- K4 母集団のうち街道の積荷を置くのは `probe_paint_overlay` と `verify_road_ambush` の 2 本だけで、どちらも実物(AMBUSH_FIELD / world.html)⇒ 罠の数は動かない見込み。隊商の積荷(trapCount:0)を置くのは field 系 12 本 + mapdef + paint_grid + sce1_events(sce1 は自前で `traps.length = 0`)。
- K5 pre 色の生データ: `56b80b01-…\scratchpad\item4\run_post89\post89.tsv`。3 本の実走ログ: `8dc0dd47-…\scratchpad\item1\pre_*.log`。

### 12-3 受入(項目3・2026-10-12・HEAD `8ed7c63`)

`tools/verify_declared_traps.js`(新規・素 port **10617** / 変異 **10618〜10622**・次の新規 base = **10623**)。
ポートは `tools/*.js` の 10500〜10699 の数値を grep して衝突 0 を確かめた(直前は `verify_sheet_equip` 10606〜10616)。

- 測り方: `index.html` を直接開き、sessionStorage に積荷を置いて読み込み直後の `traps.length` と `#nodeLayer .trap` を突き合わせる。全 index ページで `Math.random` を mulberry32(90017) へ差し替えてから読み込む。
- ⭐ 期待値は写経しない(項目2 の probe は隊商の積荷を写経していた ⇒ 受入では直した):
  - 隊商護衛 = `tavern.html` を開き、本物の `QuestGen.generateQuest(1, {source:"plaza", forceFamilyId:"caravan-escort"})` → `buildPlazaSynthetic(q).__generated` を**そのまま** index.html へ渡す(isCaravan 分岐の `trapCount = 0` を実体で通す)。
  - tier 表 = 同じページの `QuestGen.combatParams({tierKey})` の trapCount(3/4/5/6)。
  - 街道 = `js/road-events.js` を vm で読んだ `ROAD_EVENTS.AMBUSH_FIELD`(実物)。(1b') の合成積荷はそこから `themeId`・`mapDef`・`start` を外して作る(`start` は `mapDef.start` の写し)。
  - 引けなければ (0b) が赤(固定値へ落とさない)。

#### 節ごとの結果(素・10/10 PASSED・46 秒)

| 節 | 結果 |
|---|---|
| (0a) 対照 tier1(宣言 3) | 3/3 |
| (0b) 実体の宣言 | 隊商 family `caravan-escort`・trapCount **0**・waves/wagonSpawns あり / 街道 AMBUSH_FIELD trapCount **0**(mapDef あり)/ tier 表 [3,4,5,6] |
| (0c) scenarioId・pageerror | 25 腕すべて一致・26 ページで pageerror 0 |
| (1a) 隊商護衛 | `currentScenario.trapCount` 0・罠 0/0(部屋 3・除外 [0,2]) |
| (1b) 街道(実物) | 0/0(部屋 1・除外 [0])、`?trapdecl=0` でも 0/0(不変) |
| (1b') 街道(合成の単一マップ) | 宣言 0・罠 0/0(部屋 2・除外 [1]) |
| (1c) 生成 宣言なし | 3/3 |
| (1d) tier1〜4 | 3/3・4/4・5/5・6/6 |
| (2a) 既定 7 シナリオ `?graph=0` | 全シナリオで RUN=false・座標列が `?trapdecl=0` と一致・合計 31 個(3/4/4/5/5/6/4) |
| (3a) `?trapdecl=0` | 隊商 3/3(宣言 3 へ化ける)・街道(合成)3/3(宣言 0 のまま spawnTraps で 3) |

#### 負のコントロール(`--negative`・5/5・276 秒)— 担当は `--mutate` で 1 本ずつ実走して決めた

| 変異 | 注入 | 依頼書 §8 の予想 | 実測の赤 | 備考 |
|---|---|---|---|---|
| `onlyscen` | spawnTraps の count を `_tc \|\| 3` へ | (1a)(1b') | **(1a)(1b')** | (1a) は宣言 0 なのに罠 3 = §2-2 の罠そのもの |
| `onlyspawn` | 生成クエストの trapCount を `_genScenario.trapCount \|\| 3` へ(2 行 → 1 行 + 注記で行数不変) | (1a) の trapCount 側 | **(1a)** | 宣言 3・罠 3(両方の側で赤) |
| `zeroall` | count を常に 0 | (0a)(1c)(1d) | **(0a)(1c)(1d)(2a)(3a)** | K1 |
| `earlyret` | count 0 でシャッフル前に return | 緑 | **(なし)** | 指紋(全腕の罠の数・座標の sha1)が素と完全一致 = §2-3 の主張どおり罠には効かない |
| `nodecl` | `TRAP_DECL_ON` を常に false | (1a)(1b') | **(1a)(1b')** | (3a) は緑のまま(撤退腕は元から decl=false) |

- 装置: 変異 5 本の注入点は原本でちょうど 1 か所・行数不変・他の `tools/*.js` とアンカー(各行)の重なり 0 を起動時に検算(崩れたら exit 3)。index.html は配信スナップショットだけを差し替え、本番ファイルは無変更(`git status` で確認)。
- 決定性: 素 2 回・`--negative` 2 回の計 4 走で、素の指紋 `3d47edb474…` が全部一致、変異 5 本の指紋も 2 回で一致、判定行も一致。
- **K1** `zeroall` の赤が予想より 2 節多い = (2a)(3a)。どちらも「絶対量の併設」の帰結: (2a) は両腕とも 0 個で座標列は一致するが合計 > 0 の絶対量で赤、(3a) は撤退腕でも count 0 なので 3 個にならない。変異の帰結として説明でき、担当外の漏れではないので担当へ入れた。
- **K2** `earlyret` は測っている量(罠の数・座標)では見えない。早期 return が動かすのは後続のスポーン(隠し宝箱など)の乱数列だが、宣言 0 の腕は隊商(除外 [0,2])と街道で、本チケットは隠し宝箱を測らない(§8 ⛔)。既定シナリオに宣言 0 は無いので (2a) にも現れない。

**再測定コマンド**:

    node tools/verify_declared_traps.js              # 10/10 PASSED・exit 0・約 47 秒
    node tools/verify_declared_traps.js --negative   # 5/5・exit 0・約 276 秒

### 12-4 母集団の非退行(項目4・2026-10-12・HEAD `4a73684`)

- **pre** = #89 項目4 の `post89.tsv`(`7ea29ac`。本番 index/tavern/audio.js は #90 起草 `7c4070d` と同一 = §12-0 の表)。**post** = HEAD `4a73684` で同じ腕定義を逐次実走。
- 母集団 = **25 腕**: §2-5 の 17 本 + `verify_recruit_size` / `verify_synth_bgm` / `verify_corner_check`(post89 の `armlist_89post.json` の腕定義をそのまま = 23 腕。git を読む 6 本は `git clone --shared` の clone90 で実走、`cmptree` で本番と内容差 0)+ `verify_declared_traps` 素 / `--negative`。所要 **86.6 分**(逐次)。
- 道具: この窓の scratchpad `item4/`(`armlist_90post.json` / `sweep_90post.py` / `run_all90post.ps1` / `cmp_90.py` / `pair_90.py` / `mkshadow_90.py` / `anchor_scan90.py`。#89 の道具を複製して腕を絞った)。

#### 結果(`cmp_90.py`)

| 区分 | 件数 | 内訳 |
|---|---|---|
| 緑のまま | 19 | route2 指紋(判定行の多重集合)が pre と**完全一致**: field_scale / step0 / step05_hud / step1_geo / step2 / step3 / step6_png / step7 / verge_gap / wagon / paint_grid / recruit_size / road_ambush 素・負 / synth_bgm 素・負 / corner_check 素・負(corner は件数行なし・exit 0)/ probe_paint_overlay(extra 行のみ) |
| **緑→赤** | **1** | `driver_field_step5` 48/48 → **42/48**(下記・#90 帰属 → 言い直して緑) |
| 赤→緑 | 0 | |
| 両方とも非緑 | 3 | `driver_field_step6` 55/59 → 55/59(赤 4 本はすべて `(C-*) ?graph=auto が前進` = 時間依存の既知 K16。シナリオの組み合わせは pre と 1 つ入れ替わり〔swamp ↔ temple〕)/ `driver_mapdef_step1` 207/208 → 207/208(route2 指紋 `39113bb9…` が pre と一致 = (0b) clone 実行の装置の赤だけ。隊商 2 腕 (G7)(4a) は項目2 の言い直しで緑。本番ツリーでは 208/208 = §12-3 の前に確認済)/ `driver_sce1_events` 211/214 → 211/214(route2 指紋 `a8004ff9…` が pre と一致 = `s3_novice_swayed` の既知の赤) |
| 新規(期待どおり) | 2 | `verify_declared_traps` 素 **10/10**(47 秒)/ `--negative` **5/5・exit 0**(277 秒) |

#### 緑→赤 `driver_field_step5` の切り分け — #90 帰属(型1)→ tools 側で言い直した

- 赤は (A5)(B6)(C3-負値)(C3-範囲外)(C3-縦だけ範囲外)(D4) の 6 本で、すべて「`Math.random` の呼び出し回数が baseline と一致」= **fix=501 / baseline=499**。座標・壁・フットプリントの assert(主題)は全部緑。
- 影のツリー `shadow90git`(index.html / tavern.html だけ `7c4070d` へ戻した clone・tools は現行・CRLF 保持・git clean)と交互に 5 対: **本番 0/5 緑 vs 影 5/5 緑**(Fisher 両側 p=0.008)= **#90 帰属**。決定的(乱数は LCG 固定)。
- 原因: 本ドライバの積荷は出荷の隊商護衛と同形で `trapCount: 0`。baseline `68b7ec9` は 0 を `|| 3` で 3 へ化かし、HEAD は宣言どおり 0 個 ⇒ 罠の数が食い違い、後続のスポーンの乱数消費が +2(読みでは `spawnHiddenChests` が罠のタイルを候補から除いてからシャッフルする)。§2-4 の `driver_mapdef_step1` と同じ「欠陥に頼っていた golden」(型1)で、§2-5 の「罠の数が動く腕」の予想どおり。
- 言い直し(tools のみ): `tools/driver_field_step5.js` の積荷を **`trapCount: 3`** へ(+ 理由のコメント 4 行)。両者とも罠 3 個になり、本ドライバの主題(spawnWagon / findSovereignAddWaveTile / spawnWave の座標安全化と RNG 非汚染)だけを比べられる。`driver_mapdef_step1` の言い直し(項目2)と同じ方針。
- 再走: clone90 で **48/48 PASS**(fix=499 baseline=499)・影でも 48/48。⇒ **言い直し後の #90 帰属の緑→赤 = 0**。

#### アンカー衝突の全数走査(#89 K13 の教訓)

- `anchor_scan90.py`: 全 `tools/*.js` 167 本の文字列リテラル(長さ 3 以上・本ごとに重複除去 = 48,288 個)について、`index.html` / `tavern.html` / `audio.js` の出現数を `7c4070d` と HEAD で比べた。
- 出現数が変わったリテラルは 156 件(長さ 6 以上なら 78 件)。**変異アンカー(置換対象)は `verify_declared_traps` 自身の 6 本だけ**(項目3 が起動時に「原本でちょうど 1 か所」を検算済み・`--negative` 5/5 で実証)。残りはすべて汎用の語(`'number'`(typeof 比較)/ `'search'`(ノード種別)/ `'window.'` / `'new'` / `'const'` / `'.md'`(MIME 表)/ `'trap'`(アイコン名)/ `'隊商護衛'`(題名)など)で、置換・分割のアンカーとして使われている箇所は 0。
- ⇒ **#90 の本番差分による他の本の変異アンカー衝突 = 0**。母集団の外から追加で走らせる本は無し。

#### 作業コピー(削除はユーザー判断・消していない)

- scratchpad `item4/clone90`(`git clone --shared` @`4a73684` + 言い直した step5)/ `item4/shadow90git`(index/tavern を `7c4070d` へ戻した clone)。各 **207 MB**(計約 414 MB)。
- `df_step5_baseline` などのドライバ自身が作る worktree は各ドライバの既存の流儀のまま。
