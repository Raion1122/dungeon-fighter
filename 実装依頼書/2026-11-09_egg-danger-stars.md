# #112 赤い卵を持ち帰った後の巣穴は ★ を増やす(親竜の危険を酒場で知らせる)

- **起草**: 2026-11-09(起草窓) / **ステータス**: **承認済**(2026-11-09 ユーザー承認)
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

(実装窓が埋める)
