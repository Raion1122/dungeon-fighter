# #112 赤い卵を持ち帰った後の巣穴は ★ を増やす(親竜の危険を酒場で知らせる)

- **起草**: 2026-11-09(起草窓) / **ステータス**: **✅ 完了**(2026-11-09 実装窓・未 push。承認 = 2026-11-09 ユーザー)
- **基準 HEAD**: `56ac565`(#111 項目4・origin と同期)。並走窓なし(`git status` クリーン)
- **触るファイル**: `tavern.html`(即実行の関数 1 つを足すだけ)/ `js/changelog.js`(1 行)/ `tools/verify_egg_danger.js`(新規)/ 本書 §12 / `実装依頼書/README.md` の #112 行
- ⛔ **触らないファイル**: `index.html` / `town.html` / `world.html` / `title.html` / `audio.js` / `js/world-map.js` / `js/tavern-map.js` / `js/save-slots.js`
  (親竜の値は 1 つも変えない。`index.html` は #111 のまま)

---

## 1. 目的

#111 で、赤い卵を持ち帰った後の「コボルドの巣穴」には親竜(若い赤竜)が出るようになった。強さの実測(4 人・各 10 回。依頼書 #111 §12-3)は次のとおりで、親竜を倒せるかどうかでほぼ決まる。

| | クリア | 全滅 |
|---|---|---|
| 印あり Lv2 | 1 | 9 |
| 印あり Lv4(仲間は Lv2〜4) | 7 | 3 |
| 印なし Lv2 | 10 | 0 |

ところが酒場の札は ★ のまま変わらない。**同じ札がまったく別の難しさになっている**ことを、挑む前に分かるようにする。

**ユーザー決定**:

- 2026-11-09「強さをどうするか」→ **印の回だけ目安を上げる**。不採用 = 何もしない / 親竜を弱める(SRD の値を保つ)
- 2026-11-09「どう知らせるか」→ **★ を増やす**(巣穴を ★ → ★★。内部の推奨 Lv も 2 → 5)。不採用 = 巣穴の札にだけ「推奨 Lv」の文字を出す(他の依頼に無い表示が 1 枚だけ出る)/ 全 12 件に推奨 Lv を表示(札の見た目が全部変わり確認範囲が広がる)

---

## 2. 着手前の実測(2026-11-09 に起草窓が本番で確かめた事実)

### 2-1. ⚠ 「推奨 Lv の表示」は存在しない

`推奨` の全文 grep(`tavern.html` / `town.html` / `world.html` / `index.html` / `js/*.js`)で、画面に出す文言は 0 件。`recommendedLevel` を読むのは次だけ。

| ファイル:行 | 何 |
|---|---|
| `tavern.html:8719` `questLevelOf` | `recommendedLevel` を返す。**唯一の読み口** |
| `tavern.html:8794` 出発時 / `fixCompanionLevelsEarly` | 上の値で仲間の Lv 帯を決める |
| `tools/verify_frost_hold.js:576` | 霜の巨人の砦の値だけ検査(巣穴には無関係) |

`index.html` / `town.html` / `world.html` / `js/*.js` に `recommendedLevel` は 0 件。

### 2-2. 画面に出る目安は ★ で、巣穴が通るのは 2 か所

`sc.difficulty` の読み口の全数(`tavern.html` / `town.html` / `world.html` / `js/*.js`):

| 行 | 何 | 巣穴が通るか |
|---|---|---|
| `tavern.html:11653` | 歩ける酒場の卓の札(`questTable_<id>` の `.tavernSignDesc`) | **通る** |
| `tavern.html:6816` | 話しかけた画面(`#metaDiff`) | **通る** |
| `tavern.html:6786` | 1 枚絵の卓(`renderTables`) | 通らない(`:6766` 既定は `mainScenarios()` = side を載せない) |
| `tavern.html:5190` | `recruitCountLegacy` | `?recruit=0` のときだけ(下の注) |

⚠ `?recruit=0` の開発用の旧経路では、印ありの巣穴の募集が 1 人 → 2 人に変わる。既定の経路(常に 3 人・`:5180`)は変わらない。許容する。

### 2-3. ★ と推奨 Lv の既存の並び(`tavern.html:3627-3900`)

| 推奨 Lv | ★ | 依頼 |
|---|---|---|
| 2 | ★ | **巣穴**(`:3793-3794`) |
| 3 | ★☆☆ | 廃坑 |
| 4 | ★★☆ / ★★ | 森 / 消えた積み荷 |
| 5 | ★★☆ / ★★ | 沼地 / 沈黙の墓所 |
| 6〜8 | ★★★ | 砦・魔女の小屋・塔の母・神殿 |
| 8 / 10 | ★★★★ | 霜の巨人の砦 / 竜の巣 |

⇒ **★★ は本筋の外の依頼で推奨 Lv4〜5 の印**。Lv4 で 7/10 という実測に合う。本筋の外の表記(`☆` なし)にそろえて `"★★"`。

### 2-4. ⚠⚠⚠ 罠 1: 推奨 Lv を 4 にしても仲間は変わらない

`qGetTier`(`tavern.html:4369`): Lv4 以下 = tier1、Lv5〜10 = tier2。帯は `BAND = { tier1: [2, 4], tier2: [5, 8], … }`(`:8700`)、結果は `clampCompanionLevel`(`:5280`)で主人公 Lv 以下へ丸める。

| 主人公 | いま(推奨 2 = tier1) | 推奨 5(tier2) |
|---|---|---|
| Lv2 | 仲間 全員 Lv2 | 全員 Lv2(変わらない) |
| Lv3 | Lv2〜3 | 全員 Lv3 |
| Lv4 | Lv2〜4 | 全員 Lv4 |
| Lv5 以上 | Lv2〜4 | Lv5〜8(主人公以下) |

名簿の顔(`mercId` + `level`)は帯を通らず clamp だけ(`:8709`)で、変わらない。

⇒ **採用値は 5**。★★ の帯の上側で、仲間の帯が実際に動く境目。#111 §12-3 の Lv4 7/10 は「仲間 Lv2〜4」での値なので、実機ではこれより上がる見込み(項目3 で記録する)。
⭐ 4 にする欠陥を変異 `lv4` として内蔵する。

### 2-5. ⚠⚠⚠ 罠 2: 配列の直後で読むと、持ち帰った回の札が古いまま

読み込みの順番(`tavern.html`):

| 行 | 何 |
|---|---|
| `:3627` | `const scenarios = [ … ]` |
| `:3916-3926` | 撤退 `?warren=0` が配列から巣穴を外す |
| `:6242-6304` | `consumeResult()`(即実行)。`:6297` が `markRedEgg()` で**ここで初めて印が立つ** |
| `:10325` | `renderTables()` |
| `:11653` | 歩ける酒場の札を作る |

他の撤退スイッチの真似をして配列の直後(`:3930` 付近)に置くと、**卵を持ち帰って戻った最初の酒場だけ ★ のまま**になる。読み直すと ★★ になるので気づきにくい。

⇒ 置き場所は **`consumeResult()` の閉じ `})();`(`:6304`)の直後**。呼び口はこの 1 か所。⭐ 変異 `beforeconsume` として内蔵する。

### 2-6. その他の確認

- クリア済みの巣穴は卓に出続ける: `drawBoard`(`:11604`)は解放済みの全件から引く(`verify_quest_draw` (1b) の「廃坑 か 巣穴」が同じ事実)。`cleared=[巣穴]` なら解放済みは廃坑と巣穴の 2 件なので、盤面は必ずこの 2 枚になる。
- `writeActiveQuest`(`:3583`)が保存するのは id / place / title / at だけで、★も Lv も焼かない。
- `tavern.html` に記録スロットを読み直す口は無い(`DFSaveSlots` / `SaveSlots.` は 0 件)。スロット切り替えはタイトルから入り直すので、読み込み時に 1 回読めば足りる。
- ⚠ `tools/verify_plaza_map.js:762-764` は `initTavernMap` の本文を比べている。⇒ `:11653` など `initTavernMap` の中は編集しない(本案は外側に足すだけ)。
- ⚠ `tools/verify_kobold_warren.js:146` は撤退 `?warren=0` のコメント行を錨にしている。⇒ その行を複製しない。
- `sc.difficulty` を読むドライバ(`verify_party_four` / `probe_party_size` / `sweep_recruit_balance` など)はあるが、`redEgg` の文字を含むドライバは `verify_egg_parent` / `verify_kobold_warren` / `verify_plaza_map` の 3 本だけ。⇒ 印を種まきしない本では巣穴の値は変わらない。
- `tavern.html` の行末は **CRLF**(`file tavern.html` で確認)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:32` の `GAME_LOGIC` = `("index.html", "tavern.html", "audio.js")`。**鳴る**。プレイヤーに見える変化(札の ★)が実在するので要約は書ける(§10)。

**再測定コマンド**:

    grep -n 'recommendedLevel\|\.difficulty' tavern.html town.html world.html index.html js/*.js
    sed -n '6242p;6297p;6304p;6766p;8719,8723p' tavern.html
    grep -n 'function qGetTier' -A5 tavern.html
    grep -l redEgg tools/*.js

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `consumeResult()` の直後に即実行の関数を 1 つ足す(§4) |
| `js/changelog.js` | 1 行(`py tools/add_changelog.py`) |
| `tools/verify_egg_danger.js` | 新規(port base **10770**。既存の最大 = 10755 台の probe) |

⛔ `scenarios` 配列の巣穴の行(`difficulty: "★"` / `recommendedLevel: 2`)は書き換えない(印なしの姿)。
⛔ `initTavernMap` / `openDialog` / `questLevelOf` / `assignCompanionLevels` / `markRedEgg` は編集しない。

---

## 4. 本体(`tavern.html` の `consumeResult()` の閉じの直後)

```js
  /* ★[#112] 赤い卵を持ち帰った後の巣穴には親竜が出る (#111) ⇒ 札の ★ と仲間の帯を上げる。
     ⚠⚠ 置き場所は consumeResult() より **後** でなければならない。持ち帰った回の印は consumeResult() の
       markRedEgg() で初めて立つので、配列の直後に置くと最初の 1 回だけ ★ のまま札が出る (依頼書 §2-5)。
     ⭐ 推奨 Lv は 5 (4 では qGetTier が tier1 のままで仲間の帯が動かない。依頼書 §2-4)。
     ⚠ ?warren=0 のときは配列に巣穴が居ない ⇒ sc が無ければ何もしない。 */
  (function eggDangerOnWarren() {
    try {
      if (new URLSearchParams(location.search).get("eggdanger") === "0") return;
      if (localStorage.getItem(RED_EGG_KEY) !== "1") return;
    } catch (e) { return; }
    var sc = scenarios.find(function (s) { return s.id === "kobold-warren"; });
    if (!sc) return;
    sc.difficulty = "★★";
    sc.recommendedLevel = 5;
  })();
```

⚠ `tavern.html` は CRLF。足す行も CRLF にし、差分が足した行だけであることを `git diff --stat` で確かめる。

---

## 5〜6. (本体は §4 の 1 か所だけなので節なし)

---

## 7. 撤退スイッチ

- **`?eggdanger=0`** — 印があっても巣穴の ★ と推奨 Lv は元のまま。親竜は出る(親竜の撤退は `index.html?eggparent=0`)。
- 判定位置 = 上の関数の先頭。ページ単位で完結するので sessionStorage へは写さない(`?warren=0` と同じ)。

---

## 8. 受入条件 — `tools/verify_egg_danger.js`(新規)

酒場を実 Chrome で開き、印の種まきと `lastResult` の 2 経路で、**実際に作られた札の DOM**と `scenarios` の実体を見る。

⚠ 歩ける酒場の札を読むので、種まきに `sessionStorage.setItem('dragonfighters.plazaClock', '21')` を入れる(昼に走らせても同じ結果にするため)。
⚠ `cleared=[]` または `cleared=[巣穴]` なら卓は廃坑 + 巣穴の 2 枚に決まるので、盤面の種まきは要らない(§2-6)。
⭐ 仲間の帯は `Math.random` を 0 に固定して `assignCompanionLevels(members, questLevelOf(sc, hero), hero)` を実体で呼ぶ。

### §0 装置

- **(0a)** 配信バイトの `scenarios` 宣言から正規表現で独立に読んだ巣穴の値が `★` / `2`(実体を写経しない)。全 12 件が読めること
- **(0b)** 札 `questTable_kobold-warren` と `.tavernSignDesc` が実在する(⭐ 無いと §1〜§3 が空振りする)
- **(0c)** `__TAVERN_TV.redEgg().mark` が、印ありの腕で真・印なしの腕で偽

### §1 印なし

- **(1a)** 札の `.tavernSignDesc` = `★`、`openDialog(sc, true)` 後の `#metaDiff` = `★`、`questLevelOf(sc, 2)` = 2

### §2 印あり(`localStorage` に種まき)

- **(2a)** 札 = `★★`、`#metaDiff` = `★★`
- **(2b)** `questLevelOf(sc, 2)` = 5
- **(2c)** 巣穴以外の 11 件の `difficulty` / `recommendedLevel` が印なしの腕と完全に同じ

### §3 持ち帰った回(⭐ §2-5 の罠)

- **(3a)** `localStorage` に印なし・`sessionStorage` に巣穴クリアの `lastResult` を置いて酒場を開く → **その 1 回目で** 札 = `★★`、`#metaDiff` = `★★`
- **(3b)** 同じ開き方で、敗走(`defeated`)の `lastResult` なら札 = `★` のまま

### §4 仲間の帯(`Math.random` = 0)

- **(4a)** 主人公 Lv4: 印なし = 仲間 Lv2 / 印あり = 仲間 Lv4
- **(4b)** 主人公 Lv2: 印あり・印なしともに仲間 Lv2
- **(4c)** 名簿の顔(`mercId` + `level: 3`)は主人公 Lv4 で両腕とも Lv3

### §5 恒等

- **(5a)** `?warren=0` + 印あり: `pageerror` 0 件、`scenarios` に巣穴が無い
- **(5b)** `index.html` が基準 HEAD `56ac565` と 1 バイトも違わない

### §6 撤退

- **(Xa)** `?eggdanger=0` + 印あり: 札 = `★`、`questLevelOf(sc, 2)` = 2

### ⛔ 測らないこと

- ★ の字形・札の中の収まり(実機で見る)
- クリア率(下の ⑤ で記録のみ。assert にしない)

### 負のコントロール(`--negative` で内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `beforeconsume` | 関数を配列の直後へ移す(§2-5) | (3a) |
| `lv4` | `recommendedLevel = 4`(§2-4) | (2b)(4a) |
| `nogate` | 印の判定を外す | (1a) |
| `staronly` | `recommendedLevel` を変えない | (2b)(4a) |
| `lvonly` | `difficulty` を変えない | (2a)(3a) |
| `allside` | `side` の全件に適用 | (2c) |
| `nosafe` | `if (!sc) return;` を外す | (5a) |
| `noretreat` | `eggdanger` の判定を外す | (Xa) |

- 罠 E の自己検査を入れる(本ドライバの錨が他の `tools/*.js` に字面で出ない・注入点がちょうど 1 か所)。⚠ #111 §12-4: 新ドライバが他ドライバの錨を字面で持つと相手の起動時検算に当たる
- ポート = 10770(素)/ 10771〜10778(変異)

### ⑤ 強さ(記録のみ・項目3)

`~/.claude/dev-loop/r111/item3/probe_egg_clear.js` を酒場の新しい値のまま使う(仲間 Lv は実際の酒場を通る): 印あり Lv3(`--xp 3000`)・Lv4(`--xp 6000`)各 N=10、ポート 10755〜。#111 の Lv4 7/10 と並べて §12 に書く。

### 既存 golden の非退行

基準の数は未測定。項目1 で測り、項目4 で走らせる。酒場に関わる次の 8 本。

`verify_egg_parent` / `verify_kobold_warren` / `verify_quest_draw` / `verify_tavern_map` / `verify_plaza_map` / `verify_member_identity` / `verify_mercenary_roster` / `verify_recruit_size`

⚠ CLAUDE.md #102: 闇市 / 酒場 / 港町を開く本は**昼に**走らせる。⚠ 基準が違ったら、期待値を書き換える前に理由を突き止める。
⚠ `driver_speech_v2` (A1) は #111 の着手前から赤(本件と無関係)。

---

## 9. 実機/実感の確認

- 巣穴をクリアして酒場へ戻った**その回に**、卓の札が ★★ になっている
- iPhone 幅で ★★ が札からはみ出さない
- ⚠ PC は Ctrl+F5(古い `tavern.html` が出ることがある)。ローカルは http 起動

---

## 10. changelog

    py tools/add_changelog.py "<b>赤い卵を持ち帰った後の巣穴は ★ が増える</b> — 危険が増したことが酒場の札で分かる。集まる仲間も主人公のレベルに近づく。"

---

## 11. やらないこと

- ⛔ 親竜の値を変える(HP / 息 / AC。ユーザー決定 = SRD のまま)
- ⛔ 推奨 Lv の文字を画面に出す(不採用)
- ⛔ 依頼文・敵の札に親竜を足す(隠し要素のまま。#111 の酒場の主人の一言が予告)
- ⛔ 他の隠し要素の依頼へ広げる
- ⛔ 1 枚絵の卓(`renderTables`)に side を載せる

`実装依頼書/README.md` の行(承認後に足す):

    | 112 | [2026-11-09_egg-danger-stars.md](2026-11-09_egg-danger-stars.md) | **承認済** | 0% | 赤い卵の後の巣穴を ★★・推奨 Lv5 へ。⚠ consumeResult の後に置く(持ち帰った回)/ 4 では仲間の帯が動かない |

### 項目の割り方(dev-loop)

| 項目 | 中身 | 完了の印 |
|---|---|---|
| 1 着手前 | §2 を測り直す・golden 8 本の基準 | 表を §12-1 へ |
| 2 本体 | §4 + changelog | 煙検査(印ありで札 ★★) |
| 3 受入 | §8 のドライバ + ⑤ の記録 | 素 ×3 緑・`--negative` 8/8 |
| 4 非退行 | golden 8 本 + README を完了へ | 基準どおり |

---

## 12. 実装結果

### 12-1. 着手前の実測(項目 1)

**測定条件**: 2026-11-09 17:41〜17:47、HEAD `782c12c`、ツリー clean。`index.html` は `56ac565` と差分なし。`tavern.html` は CRLF 12240 / LF 12240 / 単独 CR 0(`py` のバイト計数)。本書は LF。

**行番号**: §2 に書かれた行は全部そのまま。ずれは 0 件。設計を変える必要のある崩れは無い。

**§2 の記述に足す訂正**(いずれも結論は変わらない):

| 節 | 本書の記述 | 実測 | 影響 |
|---|---|---|---|
| §2-6 | `DFSaveSlots` / `SaveSlots.` は 0 件 | 字面は 0 件だが、**実際の API 名は `DFSlots`**(`:2950` で読み込み)。酒場で呼ぶのは `snapshot`(`:6311` / `:8778` / `:12225`)と `wipeLive`(`:8934`、直後に `location.replace` で読み直し)だけ。`switchTo` / `newGame` は `title.html` だけ | 「読み込み時に 1 回読めば足りる」は成り立つ |
| §2-1 | `recommendedLevel` を読むのは `questLevelOf` だけ | 実際の読みは `:8722-8723`(`:8720-8721` の `__generated.questLevel` が先)。呼び手は `:8751` `fixCompanionLevelsEarly` と `:8794` 出発時。`:10834` / `:11292` は生成クエストへの**書き込み**。`:8895` `departAutoDebug` は `questLevelOf` を通らず主人公 Lv を渡す | 読み口は 1 つのまま。自動デバッグ巡回の帯には効かない |
| §2-6 | `tools/verify_plaza_map.js:762-764` が本文を比べる | 762-764 は #103 の差し引きの表。比較は `:773-774`(5a)で、範囲は `(function initTavernMap() {` から次の `\n  })();` まで | `initTavernMap` の外に足す本案は当たらない |
| §2-6 | `redEgg` の字面を持つ 3 本以外は印を種まきしない | **`lastResult` のクリアでも印は立つ**(字面の `redEgg` は要らない)。巣穴のクリアを明示で置くのは `verify_kobold_warren.js:797` で、これは 3 本の中。`verify_egg_parent` / `verify_kobold_warren` / `verify_plaza_map` / `verify_quest_draw` に `difficulty` / `recommendedLevel` / `metaDiff` / `.tavernSignDesc` を読む箇所は 0 件 | 非退行の見込みは変わらない。残り 4 本は項目 4 の実走で確かめる |

**§8 の前提(実ページで確認・`~/.claude/dev-loop/r112/item1/probe_seams.js`)**: `scenarios` / `openDialog` / `assignCompanionLevels` / `questLevelOf` / `QuestGen` / `RED_EGG_KEY` はページから直接呼べる。`__TAVERN_TV.redEgg` は関数。

| 腕(本体を足す前) | `redEgg().mark` | 札 | `#metaDiff` | `questLevelOf(sc,2)` | 仲間(`Math.random`=0) |
|---|---|---|---|---|---|
| 印なし | false | 廃坑 + 巣穴 `★` | `★` | 2 | 主人公 Lv4 → 2 / Lv2 → 2 / 名簿の顔 Lv3 → 3 |
| 印あり(種まき) | true | 同上 | `★` | 2 | 同上 |
| `lastResult` クリア | true(1 回目で立つ) | 同上 | `★` | 2 | 同上 |
| `lastResult` 敗走(`defeated`) | false | 同上 | `★` | 2 | 同上 |
| `?warren=0` + 印あり | true | 廃坑 + 森(`— 未解放 —`) | —(巣穴なし) | — | — |

いずれも `pageerror` 0 件。`scenarios` は 12 件(`?warren=0` は 11 件)。`BOARD_SIZE = 2`(`:11570`)。

**項目 3 への注意**:

- 札の並びは毎回変わる(`drawBoard` が席をランダムに割る)。`#questTable_kobold-warren` を id で引く
- (0a) の正規表現は `difficulty: "` で取る。`:3832` / `:3856` のコメントに `difficulty "★★"` の字面がある
- `:3794` の値の後ろにコメントが続く

**golden 8 本の基準**(素で 1 回ずつ。2 レーンの逐次実行、競合ポートなし。ログ = `~/.claude/dev-loop/r112/item1/golden/`):

| ドライバ | 既定ポート | 基準 | exit | 秒 |
|---|---|---|---|---|
| `verify_egg_parent` | 10740 | 26/26 | 0 | 102 |
| `verify_kobold_warren` | 10642 | 21/21 | 0 | 106 |
| `verify_quest_draw` | 10527 | 18/18 | 0 | 35 |
| `verify_tavern_map` | 9200 | 47/47 | 0 | 23 |
| `verify_plaza_map` | 10637 | 43/43 | 0 | 102 |
| `verify_member_identity` | 10401 | 28/28 | 0 | 139 |
| `verify_mercenary_roster` | 8931 | 44/44 | 0 | 19 |
| `verify_recruit_size` | 8897 | 91/91 | 0 | 32 |

- 着手前から赤いものは無い
- 走らせた時刻帯は昼(17:42〜17:47、闇市の 20:00〜24:59 の外)。CLAUDE.md #102 のとおり。項目 4 も 20:00 より前に走らせる。夜になったら結果を基準と並べず、時刻を記録して翌日の昼に走らせ直す
- 総括行の書式はドライバごとに違う。`PASS` で拾う(`verify_recruit_size` は `結果: N/M PASS`、`verify_mercenary_roster` は `N PASSED / 0 FAILED`)

### 12-2. 本体(項目 2)

**足した行**: `tavern.html:6305-6319`(+15 行・-0 行)。`consumeResult()` の閉じ `})();`(`:6304`)の直後。コメント 5 行(`:6305-6309`)+ 即実行の関数 10 行(`:6310-6319`、宣言は `:6310` の `eggDangerOnWarren`)。本文は §4 のコードブロックをそのまま機械で写した。`js/changelog.js` は §10 の 1 行を足し、目印の間は 4 件のまま。

**改行**: `tavern.html` は CRLF 12255 / LF 12255 / 単独 CR 0(`py` のバイト計数。着手前 12240 + 15)。`git diff --numstat` は `15 0 tavern.html` / `1 1 js/changelog.js`。

**煙検査**(使い捨て `~/.claude/dev-loop/r112/item2/smoke.js`。実 Chrome・port 10761・`plazaClock=21` を種まき): 6/6、`pageerror` は全腕 0 件。

| 腕 | `redEgg().mark` | 札 | `#metaDiff` | `questLevelOf(sc,2)` |
|---|---|---|---|---|
| (a) 印なし | false | `★` | `★` | 2 |
| (b) 印 `"1"` | true | `★★` | `★★` | 5 |
| (c) 印なし + `lastResult` クリアの 1 回目(§2-5) | true | `★★` | `★★` | 5 |
| (d) `lastResult` 敗走(`defeated`) | false | `★` | `★` | 2 |
| (e) `?eggdanger=0` + 印 | true | `★` | `★` | 2 |
| (f) `?warren=0` + 印 | true | 巣穴の札なし | — | —(`scenarios` 11 件) |

受入ドライバ(§8)と変異は項目 3 で作る。

### 12-3. 受入(項目 3)

**ドライバ**: `tools/verify_egg_danger.js`(15 判定・変異 8 本)。ポート 10770(素)/ 10771〜10778(変異)。素は約 6 秒、`--negative` は約 60 秒。

| 節 | 何を見るか |
|---|---|
| (0a) | 配信バイトの `scenarios` 宣言を正規表現で読む。全 12 件・巣穴は `★` / 2 |
| (0b) | 札と `.tavernSignDesc` が 5 腕で実在・`pageerror` 0 件 |
| (0c) | `redEgg().mark` が印あり(種まき / 持ち帰り)で真・印なし(素 / 敗走)で偽 |
| (1a) | 印なし: 札 `★`・`#metaDiff` `★`・`questLevelOf(sc, 2)` = 2 |
| (2a)(2b)(2c) | 印あり: 札と `#metaDiff` が `★★` / 2 → 5 / 巣穴以外の 11 件が印なしの腕および配信バイトと同じ |
| (3a)(3b) | 持ち帰った回の 1 回目で `★★`(`pending` 真・`lastResult` 消費済み)/ 敗走の回は `★` のまま |
| (4a)(4b)(4c) | `Math.random` = 0 で実体を呼ぶ。Lv4 は 2 → 4 / Lv2 は 2 → 2 / 名簿の顔は 3 → 3 |
| (5a)(5b) | `?warren=0` + 印で `pageerror` 0 件・巣穴なし / `index.html` の blob が `56ac565` と同じ |
| (Xa) | `?eggdanger=0` + 印で札 `★`・`questLevelOf(sc, 2)` = 2 |

**§8 からの言い直し**:

- (0b) に `pageerror` 0 件を足した。(3a)(3b) に `lastResult` の消費を足し、(3a) には `pending` 真も足した(経路を通らずに緑にならないようにするため)
- (2c) は印なしの腕に加えて、配信バイトから読んだ値とも比べる
- 変異 `beforeconsume` は、関数を移すだけだと `var RED_EGG_KEY` がまだ `undefined` で門が常に閉じる。すると印を種まきした腕まで `★` になり、§2-5 の罠にならない。移した先では鍵を文字列で持たせた

**素の全緑 3 回**(2026-11-09 18:00 頃、HEAD `6b620da`): 15/15 PASSED・exit 0 が 3 回。

**負のコントロール**: `--negative` 8/8・exit 0。担当は `--mutate` で 1 本ずつ実走して決めた(ログ = `~/.claude/dev-loop/r112/item3/mut/`)。

| 変異 | §8 の予想 | 実際に赤 | 注入行の実行 |
|---|---|---|---|
| `beforeconsume` | (3a) | (3a) | 6 回 |
| `lv4` | (2b)(4a) | (2b)(4a) | 2 回 |
| `nogate` | (1a) | **(1a)(3b)(4a)** | 5 回 |
| `staronly` | (2b)(4a) | (2b)(4a) | 2 回 |
| `lvonly` | (2a)(3a) | (2a)(3a) | 2 回 |
| `allside` | (2c) | (2c) | 2 回 |
| `nosafe` | (5a) | (5a) | 3 回 |
| `noretreat` | (Xa) | (Xa) | 6 回 |

予想と違ったのは `nogate` だけ。印なしの腕がすべて上がるので、敗走の札 (3b) と印なしの帯 (4a) も赤になる。担当は実測を採った。

**罠 E**: 起動時の自己検査で、本ドライバの 7 つの錨が他の `tools/*.js` に字面で出ないこと、注入点がちょうど 1 か所であることを確かめる。逆向き(本ドライバが相手の錨を持っていないか)は、`readdirSync` を持つ 27 本を `puppeteer-core` を読めなくした状態で起動して確かめた。exit 3 は 0 本(26 本が exit 2 = 自己検査を通過、`verify_codex_map_skill` は `exit(3)` の経路を持たず 25 秒で打ち切り)。

**⑤ 強さ**(記録のみ・assert しない。`~/.claude/dev-loop/r111/item3/probe_egg_clear.js`、印あり・各 N=10、ポート 10755 / 10756 で 2 レーン並走): 酒場の本番の出発を通っていて、`KICK` の `rec` は 5、仲間の Lv は全 20 回で主人公と同じだった(直起動の固定値ではないので、使い捨てコピーでの修正は不要)。

| 腕 | 隊の Lv | クリア | 全滅 | 平均秒 | クリア時の残り HP | 倒れた人数の平均 | 親竜を倒せなかった回の残り HP |
|---|---|---|---|---|---|---|---|
| #112 印あり Lv3 | 全員 3 | 3 | 7 | 140 | 50% | 1.2 | 19 / 41 / 70 / 46 / 37 / 72 / 68 |
| #112 印あり Lv4 | 全員 4 | 8 | 2 | 122 | 63% | 0.2 | 1 / 1 |
| (参考)#111 印あり Lv4 | 主人公 4・仲間 2〜4 | 7 | 3 | 136 | 73% | 0.6 | 8 / 60 / 46 |

- 仲間の Lv が主人公にそろったことは確かめられた。ただし 7/10 → 8/10 は N=10 の揺れの範囲で、**勝率が上がったとは言えない**。§2-4 の「これより上がる見込み」は、この数では確かめられていない
- Lv3 は 3/10 で、Lv4 の 8/10 より低い(N=10 なので差の大きさは目安)。★★ の目安(推奨 Lv4〜5)とは矛盾しない
- 全滅は全 9 回とも主人公の死亡で決着していて、仲間は 1〜3 人生き残っていた(#111 の Lv4 の全滅も同じ)
- ⚠ 未解明: Lv4 の全滅 2 回は、どちらも親竜の残り HP がちょうど 1 だった。`index.html` を HP の下限の字面で grep した範囲では、敵の HP を 1 で止める処理は見つからず、原因は特定していない。N=2 なので偶然の可能性もある。本チケットの範囲外なので調べていない

### 12-4. 非退行(項目 4)

**測定条件**: 2026-11-09 18:26〜18:32(昼。闇市の 20:00〜24:59 の外)、HEAD `48d1f68`、ツリー clean。`index.html` は `56ac565` と差分なし。素で 1 回ずつ、2 レーンの逐次実行(§12-1 と同じ組)。ログ = `~/.claude/dev-loop/r112/item4/golden/`。

| ドライバ | 既定ポート | 基準(§12-1) | 今回 | exit | 秒(基準 → 今回) |
|---|---|---|---|---|---|
| `verify_egg_parent` | 10740 | 26/26 | 26/26 | 0 | 102 → 106 |
| `verify_kobold_warren` | 10642 | 21/21 | 21/21 | 0 | 106 → 104 |
| `verify_quest_draw` | 10527 | 18/18 | 18/18 | 0 | 35 → 36 |
| `verify_tavern_map` | 9200 | 47/47 | 47/47 | 0 | 23 → 22 |
| `verify_plaza_map` | 10637 | 43/43 | 43/43 | 0 | 102 → 101 |
| `verify_member_identity` | 10401 | 28/28 | 28/28 | 0 | 139 → 139 |
| `verify_mercenary_roster` | 8931 | 44/44 | 44/44 | 0 | 19 → 19 |
| `verify_recruit_size` | 8897 | 91/91 | 91/91 | 0 | 32 → 34 |
| `verify_egg_danger`(受入・§12-3) | 10770 | 15/15 | 15/15 | 0 | 約 6 → 5 |

- 8 本すべて基準どおり。赤は無く、再走もしていない。ドライバの言い直しは 0 本(§2-6 の予告どおり)
- 本番ファイルは項目 4 で変更していない
- ⚠ 記録の手違い: 走行スクリプトのログ先の置換が効かず、今回の 8 本のログが `item1/golden/` の基準ログを上書きした(走行後に `item4/golden/` へ移した)。基準時のログ本文は残っていない。基準の数は上の §12-1 の表、exit と秒は `item1/golden/_summary.txt` が保存している。今回の走行そのものには影響しない

**残り**:

- §9 実機(持ち帰った回に札が ★★・iPhone 幅で札からはみ出さない)
- 未解明: §12-3 の Lv4 の全滅 2 回で親竜の残り HP がちょうど 1(N=2・範囲外)
