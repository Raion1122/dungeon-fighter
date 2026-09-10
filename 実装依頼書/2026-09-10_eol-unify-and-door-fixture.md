# #65 行末を CRLF へ一本化 + 扉の測定台を撤退スイッチから降ろす

- **起草**: 2026-09-10(計画窓) / **ステータス**: **承認済**(2026-09-10 ユーザー承認)
- **触るファイル**:
  - `.gitattributes`(**新規**)
  - `tools/check_tree_eol.py`(**新規**)
  - 本番作業ツリーの **17 ファイル**(行末のバイトだけ。中身は 1 文字も変えない)
  - `tools/verify_road_ambush.js`(変異 `boxleak` のアンカー 1 本)
  - `tools/driver_doors_p2.js` / `driver_doors_p5.js` / `driver_doors_p8.js`
  - `tools/verify_eol_doorfix.js`(**新規**・受入・base **10241**)
  - `実装依頼書/README.md`(#65 の行。§11 に文面あり)
- ⛔ **触らないファイル**: `index.html` / `tavern.html` / `audio.js` / `world.html` / `town.html`
  — この 5 本は**既に CRLF なので行末も変わらない**。本チケットは **1 バイトも開かずに完了できる**
  (§2-3 で実測済み)。⭐ したがって changelog フックは鳴らない(§2-7)。
- **並走**: 2026-09-10 時点で `git status` は本チケットの会議録のみ untracked、
  `origin/main..HEAD` = **0 本**。**別窓の稼働は無い。**

---

## 1. 目的

測定台が「この PC のこの作業ツリーの偶然」に乗っている。#64 は隔離ワークツリーで基準を取ろうとして
`verify_road_ambush` の**偽の EXIT=3** を踏んだ。原因は行末で、本番ツリーだけが CRLF と LF の混在に
なっており、`git worktree add` が吐く姿と食い違っていた。**別の PC でクローンすれば初日に同じことが起きる。**

もう 1 つ、扉ドライバ 3 本(`doors_p2` / `p5` / `p8`)が **廃止予定の撤退スイッチ `?fortfold=0`** の上に
立っている。#63 が畳んだ砦の扉が 1 枚になったので、退避の腕を足して緑に戻した形。F3 神殿 / F4 竜の巣を
畳むと同じことが起きるが、⭐ **今回は「台帳から導出」では解けない**(§2-5)。

**ユーザー決定(2026-09-10)**:

- **①行末の一本化 + ②扉の fixture 化** の 2 本立てで進める(会議の候補①+②)
- ⭐ 不採用: 候補③**母集団ランナー**(#64 が 52 本を手で回した作業の自動化)。
  レンツが「52 本の所要時間が未測定で見積もりの土台が無い」「`timeout` で包むな / Bash 経由で
  exit 127 / ポート 14 本予約 の地雷を全部踏み直す」と慎重。**別チケット送り**。
- ⭐ 不採用: 候補④**難易度・XP の再調整**。ガイウスが「測定台が腐ったままバランスを触ると
  赤の原因が切り分けられなくなる」。⇒ ①②の後に回す(要因は 5 つ溜まったまま)。
- ⭐ **揃える先は CRLF**(会議の第2段で決着。理由は §2-4)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ⛔ アンカーが挙げた 3 件のうち **2 件は前提が崩れた**

| アンカーの主張 | 実測 |
|---|---|
| 「押し所の黒リストが 3 件目。白リストへ言い直せ」 | ⛔ **既に完了済み**。`verify_npc_crowd` は #64 (`247685a`) で白リスト化され、装置 assert `(3c-pick)` まで入っている |
| 「酒場でも `#changelogBox` / `#promisesBadge` の下を素通ししていた」 | ⛔ **`verify_tavern_map` には当てはまらない**。`usable()`(`tools/verify_tavern_map.js:795-802`)は**最初から白リスト複合**で、`#tavernViewport` が `contains` する要素しか通さない。⭐ 実測: `#tavernViewport` は `tavern.html:3042` で開き **3049 で閉じる**。`#changelogBox` は **3264**、`#promisesBadge` は **3346** = **器の外** |
| 「`doors_p2/p5/p8` の `STAGE` が 1 本固定で腐っている」 | ⚠ **赤ではない**。#63 が `STAGE_ARM = '&fortfold=0'` を足して緑に戻してある(p2 に 7 箇所 / p5 に 8 箇所 / p8 に 5 箇所 = 計 **20 箇所**) |

⭐ **任意の点を選ぶ picker を持つドライバは全 136 本中 3 本だけ**
(`verify_npc_crowd` / `verify_tavern_map` / `probe_town_mask`)。`verify_town_map` は picker を持たず
`clickTile(6, 3)` の直書き。⇒ **押し所の掃除は本チケットの対象外**(§11)。

**再測定コマンド**:

    grep -ln "isWalkable" tools/*.js
    grep -n 'id="tavernViewport"\|id="changelogBox"\|id="promisesBadge"' tavern.html

### 2-2. ⚠⚠⚠ 罠①:自作マップの扉は **施錠の抽選を 1 度も引かない**

`rebuildNodeDoors`(`index.html:34980`)は `MAPDEF.doors` を持つマップで**早期 return** する:

    if (MAPDEF && Array.isArray(MAPDEF.doors) && MAPDEF.doors.length) {
      nodeDoors = MAPDEF.doors.map(d => Object.assign({}, d));
      applySavedDoorStates(nodeId);
      rebuildDoorBlockMask();
      return;                                   // ★ ここで抜ける
    }

施錠の抽選 `doorLockedByRng(nodeId, doorId)`(`:35049`)は**この return より下**、
「RUN の出口から扉を作る経路」にしか無い。

⛔ **したがって「扉 6 枚の自作マップを 1 枚持つ」という会議 第1段の案では、§1 が測りたいものを
1 つも測れない**(レンツが第2段で自分の案を撤回した)。
⭐ **正しい fixture は「ノード」**。`RUN.byId` へ出口を持つ合成ノードを足す。

⚠ `RUN` は **`const`**(`index.html:4687`)なので丸ごとの差し替えは不可能。
`RUN.byId` は素のオブジェクトなので**追加はできる**。

⭐ この罠は §8 の変異 **`fixturefake`** として装置に内蔵させること。

### 2-3. 行末の実測(隔離ツリーを実際に作って byte 比較した)

| 測ったもの | 実測 |
|---|---|
| `core.autocrlf` | **true** |
| `.gitattributes` | **無し**(`git check-attr text eol -- index.html` = 両方 `unspecified`) |
| **blob の行末** | ⭐ **全部 LF**(`index.html` の blob に CR は **0 件**) |
| **本番作業ツリー** | ⚠ **混在** — `index.html` / `tavern.html` / `town.html` / `world.html` / `audio.js` = **CRLF**、`js/*.js` / `battle.html` / `title.html` / `map-editor.html` = **LF** |
| **隔離ツリー**(`git worktree add --detach <dir> HEAD`) | **全部 CRLF** |
| byte 差のあるファイル | **310 / 835** |
| ⇒ **行末が反転する配信物** | **17 ファイル**(下表) |
| ⇒ **反転しない** | `index.html` / `tavern.html` / `town.html` / `world.html` / `audio.js`(本番が既に CRLF) |

**行末を反転させられる 17 ファイル**(= STEP2 で CRLF へ直す対象):

    js/abilities.js  js/class-sight.js  js/df-mapdef.js  js/hero-classes.js
    js/mercenary-roster.js  js/npc-crowd.js  js/player-sheet.js  js/recruit-candidates.js
    js/road-events.js  js/save-slots.js  js/skill-check.js  js/tavern-map.js
    js/town-map.js  js/world-map.js            (= js/ 配下 14 本)
    battle.html  title.html  map-editor.html   (= 3 本)

⚠ `sfx-pipeline/data/sfx-sources.json` と `voicevox-pipeline/data/script.json` も隔離ツリーでは
CRLF になる(本番は LF)。**配信物ではない**ので実害は無いが、`check_tree_eol.py` の対象からは外さない。

⭐⭐⭐ **異常なのは本番ツリーの方**。blob は全部 LF で、素直に取り出せば全部 CRLF に揃う。

**再測定コマンド**(⚠ 測り終わったら必ず撤去する):

    WT="$TEMP/df_measure_crlf"
    git worktree add --detach "$WT" HEAD
    for f in $(git ls-files); do [ -f "$WT/$f" ] && cmp -s "$f" "$WT/$f" || echo "$f"; done
    git worktree remove --force "$WT"

### 2-4. なぜ **CRLF** へ揃えるか(数で決めた)

| 揃える先 | 配信バイトが動くファイル | **それを text で読むドライバ** |
|---|---|---|
| **CRLF**(採用) | 17(js/* ほか) | **11 本** |
| LF | 5(index / tavern / town / world / audio) | **56 本** |

⭐ さらに **CRLF はこの PC の `git worktree add` と `git clone` が既に吐いている姿**。
CRLF へ揃えるのは「本番を、全員が既に受け取っている姿へ戻す」だけ。
⛔ LF へ揃えると「全員が受け取る姿を変える」ことになり、`.gitattributes` を失った瞬間に静かに崩れる。

⭐ **どちらを選んでも壊れる複数行アンカーは 1 本ずつ**。全 136 本で複数行アンカーは **2 本しかない**:

| 変異 | ファイル | アンカーの改行 | CRLF へ揃えると |
|---|---|---|---|
| `boxleak`(`verify_road_ambush.js:199`) | `js/road-events.js` | LF のみ | ⚠ **空振り → exit 3**。STEP2 で直す |
| `bridgefill`(`verify_road_ambush.js:329`) | `index.html` | CRLF を明示 | ✅ そのまま通る |

⚠ `verify_road_ambush` の起動時検算(`:384-411`)は**アンカーが 1 箇所ヒットしないと即 exit 3**。
そのとき**素の assert が 1 本も走らない**(#64 が踏んだ偽の赤の正体)。
起動時検算を持つドライバは **87 本**。

### 2-5. 扉の測定台 — なぜ「台帳から導出」では解けないか

- 扉は `rebuildNodeDoors`(`index.html:35004-35053`)で **ノードの出口 1 本につき 1 枚**だけ立つ
- 畳んだ舞台の扉: 砦 **1 枚**(#63)/ 沼 **2 枚**(#62 の台帳)
- `driver_doors_p5` §1 の要求: `(1a)` 2 枚以上 / `(1c0)(1c)(1d)` は**グラフ全体**で 4 枚以上
- ⇒ **F3 神殿 / F4 竜の巣を畳むと、要求を満たす舞台が本番に 1 つも残らない**

⭐ 一方 **§1x は #62 が既に正しい形にしてある** — 廃坑以外の 5 舞台を実測して台帳を作り、
下限定数を 1 つも書かず、装置 assert `(1x-z)`「扉を 1 枚以上持つ舞台が 2 つ以上ある」で
空振りを止めている。⇒ **§1x は触らない。触るのは §1 だけ。**

⭐ 注入という手口は既にこのドライバ群で通っている:
`driver_doors_p2.js:341` が `page.evaluate` の中で `MAPDEF.doors` へ直に代入している。

⚠ `doorLockedByRng` の seed は `RUN.byId[nodeId].mapDef.id` + `/lock/` + `doorId`(`index.html:34932`)。
⇒ 合成ノードに**別々の `mapDef.id`** を与えるだけで抽選が割れる。

⚠ `nodeGateTile(MAPDEF, dir)`(`:35475`)は**現在の盤面**から扉のタイルを出す。
合成ノードの扉も現在の MAPDEF の矩形から座標が付く。⭐ §1 は元々 `tx/ty` を読まない
(「施錠は mapDef.id + door id だけで決まる」が測りたい主張)ので問題にならない。

⚠ `doorHideableExit`(`:34959`)は `RUN.byId[ex.to]` を読む。行き先が存在しない id なら
`to` が undefined で **false を返す**ので安全。加えて §1 は `?secret=0` で起動しており、
`doorHiddenByRng` は `DOORS_NOSECRET` で即 false(`:34975`)。⇒ 合成ノードに隠し扉は立たない。

### 2-6. ⚠⚠⚠ 罠②:`scripts/hooks/pre-commit` を CRLF にすると changelog ガードが死ぬ

先頭行は `#!/bin/sh` で、CR の個数は **0**(2026-09-10 実測)。
`core.hooksPath = scripts/hooks` で git が起動する**シェルスクリプト**なので、shebang の行末が
CRLF になると Git Bash が `bad interpreter` で落ちる。

⛔ **`.gitattributes` は `scripts/hooks/*` を `eol=lf` で明示除外すること。**
⭐ 除外は「日付つきの例外」なので、**例外が生きていることを装置 assert で見る**(§8 の `(1d)`)。
⚠ shebang を持つ追跡ファイルは `scripts/hooks/pre-commit` の **1 本だけ**(`check_changelog.py` は
`py` から起動されるので CRLF でも動くが、同じディレクトリなのでまとめて LF にする)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

判定 = **鳴らない**。本チケットはこの 3 本を **1 バイトも触らない**(§2-3 で 3 本とも既に CRLF =
STEP2 の対象外であることを実測済み)。

⭐⭐⭐ CLAUDE.md の「プレイヤーに見える変化が 1 つも無いのに `index.html` / `tavern.html` /
`audio.js` を触る設計は採るな」に**正面から従った形**。②の fixture を本番の `js/df-mapdef.js` や
`index.html` に置かず、**ドライバ側の注入で完結させる**のはこの条項が理由。

### 2-8. 参考にした既存の数値(2026-09-10 実測)

| 対象 | 値 |
|---|---|
| 追跡ファイル総数 | **835** |
| `tools/*.js` | **156** |
| 起動時検算を持つドライバ | **87 本** |
| 複数行の変異アンカー | **2 本**(両方 `verify_road_ambush.js`) |
| 使用済みの base port 最大 | **10221**(#64 `verify_quest_visibility`)⇒ **新規は 10241** |
| `STAGE_ARM` の出現 | p2 **7** / p5 **8** / p8 **5** = 計 **20** |
| 追跡ファイルの拡張子 | png 230 / js 156 / md 103 / mp3 92 / jsonl 91 / txt 59 / jpg 41 / py 36 / json 15 / html 7 |

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `.gitattributes` | **新規**。全体を CRLF へ + バイナリ 3 種を除外 + `scripts/hooks/*` を LF で除外 |
| 本番作業ツリーの 17 ファイル | **行末のバイトだけ** LF から CRLF へ。⭐ git の差分は **0**(blob は元から LF) |
| `tools/check_tree_eol.py` | **新規**。任意のツリーの行末を検査する道具 |
| `tools/verify_road_ambush.js` | 変異 `boxleak` のアンカーを CRLF へ(**1 箇所**) |
| `tools/driver_doors_p2.js` | 合成ノードの注入 + `STAGE_ARM` 撤去(7 箇所)+ (6c) の言い直し |
| `tools/driver_doors_p5.js` | 合成ノードの注入 + `STAGE_ARM` 撤去(8 箇所)。⛔ §1x は触らない |
| `tools/driver_doors_p8.js` | 合成ノードの注入 + `STAGE_ARM` 撤去(5 箇所) |
| `tools/verify_eol_doorfix.js` | **新規**。受入(base **10241**) |
| `実装依頼書/README.md` | #65 の行(§11 に文面) |

⛔ **`index.html` / `tavern.html` / `audio.js` / `world.html` / `town.html` は開かない。**
⛔ **`js/df-mapdef.js` に fixture を置かない**(§2-7 の理由。行末以外は触らない)。

---

## 4. STEP1 — 着手前の基準取り(⭐ 本番を触る前に色を控える)

⭐ **#61 で効いた型**: 赤の予想は必ず外れるので、実装前に母集団の色を控える。

1. 母集団を引く。⭐ **機能の語ではなく「変更するファイルを読むか」で引く**(#62 / #64 の教訓):

       grep -ln "road-events\|df-mapdef\|npc-crowd\|world-map\|town-map\|tavern-map" tools/*.js
       grep -ln "save-slots\|skill-check\|player-sheet\|hero-classes\|abilities\|class-sight" tools/*.js
       grep -ln "mercenary-roster\|recruit-candidates\|title.html\|battle.html\|map-editor.html" tools/*.js
       grep -ln "doors" tools/*.js

2. ⚠⚠ **この時点では隔離ツリーを使わない**(行末がまだ揃っていないので偽の赤が出る)。
   **本番ツリーで**走らせ、`exit` / 集計行 / FAIL 行の集合を控える。
3. ⚠⚠ **検証ドライバを `timeout` で包まない**(#64: ポートを 14 本予約するので孤児が次を殺す。
   Bash 経由は終了コードが 127 なのに node は生存)。⭐ **PowerShell ツールから走らせる**。
4. 特に次の 5 本は必ず控える:
   `verify_road_ambush` / `driver_doors_p2` / `driver_doors_p5` / `driver_doors_p8` / `verify_road_events`
   ⚠ 既知の赤: `driver_doors_p2` の **(6c)** は #16 の森畳み以来ずっと FAIL(#63 とは無関係)。

---

## 5. STEP2 — 行末を CRLF へ一本化する

### 5-1. `.gitattributes` を新設

内容(コメントは日本語で残すこと):

- 全ファイルを `text=auto` かつ取り出し時 **CRLF** にする
- ⭐ blob は従来どおり LF。取り出すときだけ CRLF にするので **git の差分は出ない**
- バイナリは変換しない。追跡されているのは **png / jpg / mp3 の 3 種のみ**(§2-8)
- ⚠⚠⚠ `scripts/hooks/*` は **LF で除外**。理由を §2-6 への参照付きでコメントに書く

### 5-2. 本番作業ツリーの 17 ファイルを CRLF へ

⛔ **中身は 1 文字も変えない。行末のバイトだけ。**
⚠ 直したら**必ず `git status` が clean のままであることを確認**する(blob は LF なので差分は出ない)。
出たら**そこで止めて原因を突き止める**(⛔ 差分をコミットして先へ進まない)。

### 5-3. `tools/check_tree_eol.py` を新設

- 引数: ツリーの根(既定 = リポジトリ根)
- `git -C <root> ls-files` で追跡ファイルを引き、`.gitattributes` の期待と食い違う行末を列挙
- ⭐ **本番ツリーにも隔離ツリーにも同じものを当てられる**ことが肝
- 終了コード: 0 = 一致 / 1 = 食い違いあり / 2 = 環境不備

### 5-4. `verify_road_ambush` の `boxleak` を直す

`tools/verify_road_ambush.js:199-202` の `from` / `to` の改行を CRLF へ。
⭐ 同じファイルの `bridgefill`(`:329`)が既に CRLF を明示しているので、**書き方を揃える**形になる。
⚠ 直したら `node tools/verify_road_ambush.js` が **exit 3 にならない**ことを確認する。

---

## 6. STEP3 — 扉の測定台を撤退スイッチから降ろす

### 6-1. 合成ノードの注入(3 本に共通の器)

`page.evaluate` の中で `RUN.byId` へノードを足す。⛔ `RUN` 自体は `const` なので代入しない。

    /* ★#65 fixture — 畳み系チケットで腐らない扉の母集団を、その場で作る。
     * ⛔ MAPDEF.doors を持つ自作マップでは駄目 (rebuildNodeDoors が早期 return して
     *   施錠の抽選 doorLockedByRng を 1 度も引かない = 測りたいものが測れない)。
     * ⭐ 出口を持つ「ノード」を足すと、実在ノードと 1 バイトも違わない経路を通る。
     * ⚠ RUN は const なので差し替え不可。byId への追加だけで足りる。 */
    const FX = ['fxa', 'fxb', 'fxc', 'fxd'];
    FX.forEach((id) => {
      RUN.byId[id] = {
        id: id, kind: 'search',
        mapDef: { id: 'fixture65/' + id },      // ★ seed を割るのはこの id (index.html:34932)
        exits: [{ dir: 'left', to: id + '_x' }, { dir: 'right', to: id + '_y' }],
      };
    });
    // ⇒ 4 ノード × 2 出口 = 扉 8 枚。畳みの影響を受けない。

⚠ 行き先 `fxa_x` 等は `RUN.byId` に**存在しなくてよい**。`doorHideableExit` は
`RUN.byId[ex.to]` が undefined なら false を返す(`index.html:34961-34962`)。

### 6-2. `driver_doors_p5` の §1

- `STAGE_ARM`(8 箇所)を撤去し、素の砦で起動する
- §1 の母集団ループ(`:339` の `for (const id of Object.keys(RUN.byId))`)は**そのまま**。
  合成ノードを足しておけば自動的に拾われる
- `(1a)`「このノードに扉が 2 枚以上」は **合成ノードを見る**形へ言い直す
  (`rebuildNodeDoors('fxa')` の後に `doorsForRender().length >= 2`)
- ⛔ **§1x は 1 バイトも触らない**(#62 が台帳導出 + 装置 assert `(1x-z)` で既に正しい)

### 6-3. ⭐ ノエルの条件 — 合成が別経路を通っていないことを示す

**実在ノード 1 つと合成ノード 1 つに同じ `mapDef.id` を与え、出てくる扉の state が一致する**
ことを見る装置 assert を新設する。一致しなければ合成が別経路を通っている証拠になる。

### 6-4. `driver_doors_p2` / `driver_doors_p8`

- `STAGE_ARM`(p2 = 7 / p8 = 5)を撤去
- 「扉が 2 枚以上」を要求する母集団ガード((3b)(4a)(5a)(5b)(6e)(6f))と描画の assert
  ((2f)(3a))は、合成ノードの扉を見る形へ移す
- ⚠ `(6c)`「既存 6 シナリオすべてで扉が立つ」は **#16 以来ずっと赤**。
  ⭐ #62 が §1x でやったのと同じ**台帳から導出**へ言い直す
  (「扉を持つ舞台が 2 つ以上」+「持つ舞台では規則どおり」)。⛔ 閾値を下げて緑にしない
- ⛔ **`?doors=states` のブート(§7 の絵の確認)はそのまま**。あちらは 5 状態を強制的に当てるので
  母集団がスイッチに影響されない(p2 のコメントが名指しで書いている)

---

## 7. 撤退スイッチ

⛔ **作れない。** URL パラメータで戻せる種類の変更ではない(本番のコードを 1 行も足さないため)。

**巻き戻し手順**(撤退スイッチの代わり):

1. `.gitattributes` を削除する
2. 作業ツリーの 17 ファイルを LF へ戻す
3. `tools/` の変更は通常どおりコミット単位で戻す

⚠ 依頼書にこれを書いておくのは、**「撤退スイッチが無い」を実装窓が欠陥と読まないため**。

---

## 8. 受入条件 — `tools/verify_eol_doorfix.js`(新規・base **10241**)

**測り方の方針**: 前半(§0〜§1)は**ブラウザを使わない** — git と実ファイルだけで行末を測る。
後半(§2)は puppeteer で扉の fixture を測る。⭐ 観測するのは「行末のバイト」と「扉の state」だけで、
**ファイルの中身(トークン列)は観測しない**。

### §0 装置(先に母集団を確かめる)

- **(0a)** 追跡テキストファイルが **700 本以上**ある(`git ls-files` から png / jpg / mp3 を除いた数)
  ⭐ **これが無いと「0 本を検査して全部緑」になる**
- **(0b)** ⭐ 期待の行末を `.gitattributes` の**写経ではなく `git check-attr eol -- <path>` の答え**から引く
  (2 経路。宣言と git の解釈が食い違っていたら気づける)
- **(0c)** 扉の fixture が実際に立っている = 合成ノードの扉が **8 枚**

### §1 行末

- **(1a)** ★★本番作業ツリーの追跡テキストファイルが**全部 CRLF**(`scripts/hooks/*` を除く)
- **(1b)** ★★★ `git worktree add --detach <tmp> HEAD` で作った隔離ツリーが、
  追跡ファイル **全部で本番と byte 一致**する(作って比較して**必ず撤去する**)
- **(1c)** ★複数行アンカー **2 本**が、**本番ツリーと隔離ツリーの両方で 1 箇所ちょうど**ヒットする
  ⭐ #64 が踏んだ偽の EXIT=3 の直接の再現防止。アンカーはドライバから読み出して当てる
- **(1d)** ★★[例外が生きていること] `scripts/hooks/pre-commit` が **LF** で、先頭が shebang
  ⭐ 例外表ではなく**振る舞い**で見る(§2-6 の罠)
- **(1e)** `git status --porcelain` が空 = **行末の一本化で git の差分が 1 件も出ていない**

### §2 扉の fixture

- **(2a)** ★★ `doors_p2` / `p5` / `p8` の**ソースに `fortfold` が 1 件も無い**
  (`grep -c fortfold` = 0 を 3 本とも)
- **(2b)** ★★★ 合成ノードの扉の state が、ドライバ側で書き下した規則
  (`mapDef.id` + `/lock/` + `doorId` のハッシュ < 0.25)と一致する
  ⛔ 実装の `doorLockedByRng` を呼ばない(片方の写経にしない)
- **(2c)** ★★★[ノエルの条件] 実在ノードと合成ノードに**同じ `mapDef.id`** を与えると、
  出てくる扉の state が**一致する**(= 合成が別経路を通っていない)
- **(2d)** ★ 合成ノードの扉に **locked が 1 枚以上あり、全部ではない**(抽選が効いている)
- **(2e)** ★ 抽選が `Math.random` を **1 度も引かない**(RNG 消費順を動かさない)

### §3 恒等(非退行)

- **(3a)** `driver_doors_p5` の **§1x が 1 バイトも変わっていない**
  (`(1x-z)(1x-a)(1x-b)(1x-c)(1x-c2)` の 5 本が素で緑)
- **(3b)** `index.html` / `tavern.html` / `audio.js` / `world.html` / `town.html` の
  **blob が HEAD と同一**(= 本チケットが本番を 1 バイトも触っていない)

### ⛔ 測らないこと

- **jsonl / txt / md の行末** — 配信物ではなく、CRLF でも LF でも動く。
  ⭐ 一本化の対象には**する**が、**assert では縛らない**(将来ツールが LF で書き出しても止めない)
- **ファイルの中身(トークン列)** — 行末以外は本チケットの関心事ではない
- **扉のタイル座標 `tx/ty`** — 合成ノードの座標は現在の盤面から付くので意味を持たない

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `eolrevert` | `js/road-events.js` を LF へ戻す | (1a)(1b) |
| `attrdrop` | `.gitattributes` の CRLF 宣言行を消す | (0b)(1b) |
| `hookscrlf` | `scripts/hooks/*` の除外行を消す | (1d) |
| `anchorlf` | `boxleak` のアンカーを LF へ戻す | (1c) |
| `armback` | `driver_doors_p5` へ `STAGE_ARM` を戻す | (2a) |
| `fixturemiss` | 合成ノードの注入を消す | (0c)(2b)(2d) |
| ⭐ **`fixturefake`** | 合成ノードをやめ **`MAPDEF.doors` を持つ自作マップ**で扉を作る | **(2b)(2c)(2d)** — §2-2 の罠(早期 return で抽選が引かれない)の再現 |
| `seedplain` | ドライバ側の規則を `mapDef.id` でなく素の node id にする | (2b)(2c) |

⭐ `fixturefake` が **§2-2 の罠を再現する変異**。これが無いと「なぜ自作マップではなくノードなのか」が
機械で検査されない。

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ 2026-09-10 時点で**基準を控えていない**(STEP1 が控える仕事)。最低限この 5 本:

- `node tools/verify_road_ambush.js` → ⚠ 本番ツリーで **41/41 exit 0**(#64 の実測)
- `node tools/driver_doors_p2.js` → ⚠ **(6c) は着手前から FAIL**
- `node tools/driver_doors_p5.js`
- `node tools/driver_doors_p8.js`
- `node tools/verify_road_events.js`

⚠ 基準値は 2026-09-10 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認

**該当なし。** 配信物の中身(トークン列)は 1 文字も変わらず、変わるのは行末のバイトだけ。

⚠ ただし念のため、STEP2 の後に **http 起動**で次の 3 つが立ち上がることを目視する
(⚠ ローカルは http 起動が必須。`file://` 直開きだとナレ音声だけ無音になる):

- `title.html`(行末が変わる側)
- `battle.html`(行末が変わる側)
- `map-editor.html`(行末が変わる側)

---

## 10. changelog

**不要。** `scripts/hooks/check_changelog.py:24` の `GAME_LOGIC` = `index.html` / `tavern.html` / `audio.js`
の 3 本を **1 バイトも触らない**(§2-7)。

⛔ **プレイヤー向けの要約は実在しない。嘘の行を足して通そうとしないこと。**

---

## 11. やらないこと

- ⛔ **押し所の白リスト化**(アンカーの項目1)— §2-1 で**既に完了済み**と実測。掃除する対象が無い
- ⛔ **`#townBack` が compact 390 で歩ける地図を 2 マス覆う件の修正** — 実機体感の宿題。
  ⚠ 動かしたら `verify_npc_crowd` の `(3c-pick)` の腕 ② を腕 ① だけへ言い直す必要がある
- ⛔ **母集団ランナー**(会議の候補③)— 別チケット
- ⛔ **難易度・XP の再調整**(会議の候補④)— 要因 5 つを合算して別チケットで 1 度に測る
- ⛔ **`?fortfold=0` そのものの削除** — 旧地図の全廃は F3 / F4 の仕事
- ⛔ **F3 神殿 / F4 竜の巣の畳み** — 本チケットは「畳んでも腐らない測定台」を作るだけ
- ⛔ **`driver_doors_p5` の §1x への変更** — #62 が既に正しい形にしてある
- ⛔ **本番 5 ファイルへの変更**(`index.html` / `tavern.html` / `audio.js` / `world.html` / `town.html`)

**`実装依頼書/README.md` へ足す行**(⭐ 並走窓が無いので**着手時にそのまま足してよい**):

    | 65 | [2026-09-10_eol-unify-and-door-fixture.md](2026-09-10_eol-unify-and-door-fixture.md) | **承認済** | 0% | 行末を **CRLF へ一本化**(`.gitattributes` 新設 + 本番 17 ファイル + `check_tree_eol.py`)して隔離ワークツリーを byte 同一にする + 扉ドライバ 3 本を撤退スイッチ `?fortfold=0` から降ろし**合成ノード**で仕組みを測る。⭐⭐⭐ **自作マップ(`MAPDEF.doors`)では駄目** — `rebuildNodeDoors` が早期 return して施錠の抽選を 1 度も引かない ⇒ fixture は「出口を持つノード」。⚠ `RUN` は `const` なので `RUN.byId` へ**追加**する。⚠⚠⚠ `.gitattributes` は `scripts/hooks/*` を LF で**除外必須**(shebang が CRLF になると changelog ガードが bad interpreter で死ぬ)。⭐ 複数行アンカーは全 136 本で **2 本だけ**(`boxleak` を CRLF へ)。⛔ 撤退スイッチは作れない(巻き戻し手順で代替)。⛔ changelog は鳴らない。受入 `verify_eol_doorfix`(新規・base **10241**) |

---

## 12. 実装結果

### 12-0. 着手前の基準(STEP1)

- **測定日**: 2026-09-10 / **HEAD** = `85a90f3` / 作業ツリー **clean**
- ⛔ 本番コードも `tools/` のドライバも **1 バイトも触っていない**(項目1 は色を控えるだけ)
- ⚠⚠ **本番ツリーでそのまま実走**。§2-3 のとおり隔離ツリーは CRLF 化するので、この時点で
  `git worktree add` を使うと偽の赤が出る(#64 が踏んだ罠)
- ⚠⚠ 検証ドライバを `timeout` で**包んでいない**。完了は終了コードでなく集計行で判定した
- **総所要 = 73 分**(58 本・逐次・PowerShell スイープ)。⭐ 項目5 の再走もほぼ同じと見てよい

#### (a) 母集団の引き方

「STEP2 で行末が反転する 17 ファイル」を名指しし、かつ `readFile*` を呼ぶ `tools/*.js`:

```bash
# (1) 17 ファイルを名指しするか (§4 の書き方 = 素の名前)
grep -lE "road-events|df-mapdef|npc-crowd|world-map|town-map|tavern-map|save-slots|skill-check|player-sheet|hero-classes|abilities|class-sight|mercenary-roster|recruit-candidates|title\.html|battle\.html|map-editor\.html" tools/*.js | sort   # -> 61 本
# (2) そのうち readFile* を呼ぶもの
grep -lE "readFile(Sync)?\(" tools/*.js | sort                                     # -> 98 本
comm -12 (1) (2)                                                                   # -> 55 本
```

⇒ **母集団 = 55 本**。orchestrator の実測(55 本)と**集合まで完全一致**。

⭐ **ただし 3 本は「読んでいない」。** `verify_fort_fold` / `verify_swamp_fold` / `verify_swamp_lair` は
日本語コメント行(`⚠⚠ df-mapdef.js の paintingBlockedTilesFor も …`)で語に当たっているだけで、
実際にはこの 17 ファイルを 1 本も読まない。**厳密な「読む」母集団は 52 本**
(`js/<name>.js` の**パス形**で引き直すと 52 本)。⭐ 3 本とも緑なので **多いほう(55 本)を採用**して実走した。

⭐ 取りこぼしを 2 経路で潰した(#62 / #64 の「見積もりは常に不足」への対処):

- **`readdir` で `js/` を丸ごと読む本**: `verify_mercenary_roster`(`:90` が `js/` の `.js` を全件読む)= 母集団内。
  ほかに `probe_party_size` / `verify_codex_map_skill` / `_pptr_profile`(共通ヘルパ)
- **ファイルのバイトを hash / 長さで縛る本**: `createHash` を持つ 16 本を全部当たったが、
  ⭐ **どれもハッシュしているのは実行時のデータ**(canvas の dataURL・ページから取った map JSON)で、
  **ファイルのテキストではない** ⇒ 行末では動かない。⇒ 母集団を増やす必要なし

#### (b) 一覧表 — 母集団 55 本(全件。省略なし)

| ドライバ | exit | 集計行 | FAIL した assert | 秒 |
|---|---|---|---|---|
| `driver_bgm_title` | 0 | `16/16 PASS` | — | 4.7 |
| `driver_depart_menu_clean` | 0 | `結果: 41/41 PASS` | — | 125.9 |
| `driver_dev_gate` | 0 | `[driver] RESULT: 52/52 passed` | — | 25.5 |
| `driver_dev_gate2` | 0 | `結果: 62/62 PASS` | — | 26.6 |
| `driver_doors_p1` | 0 | `PASS 44 / FAIL 0` | — | 0.1 |
| `driver_doors_p2` | **1** | `結果: 33/34 PASS` | **(6c)** — `goblin-mine:1 bandits-forest:0 lizard-swamp:2 orc-fort:1 undead-temple:3 dragon-lair:3` | 20.4 |
| `driver_doors_p5` | 0 | `結果: 32/32 PASS` | — | 16.7 |
| `driver_doors_p6` | 0 | `結果: 40/40 PASS` | — | 25.3 |
| `driver_doors_p8` | 0 | `結果: 15/15 PASS` | — | 6.8 |
| `driver_field_step7` | 0 | `=== driver_field_step7  79/79 PASS ===` | — | 245.3 |
| `driver_graph_kinds` | 0 | `[drv] 66/66 PASS   (--mutate nokind)` | — | 37.4 |
| `driver_graph_p7` | 0 | `結果: 60/60 PASS` | — | 4.2 |
| `driver_grid_p3b` | 0 | `PASS 44 / FAIL 0` | — | 16.6 |
| `driver_grid_p4` | **3** | **集計行が出ない**(exit 3 = 装置を作れなかった ⇒ 素の assert が 1 本も走らない) | ⛔ 変異 `n1ringonly` の置換対象が見つからず**空振り** | 0.5 |
| `driver_grid_p5` | 0 | `PASS 103 / FAIL 0` | — | 173.1 |
| `driver_grid_p7` | 0 | `PASS 44 / FAIL 0` | — | 25.7 |
| `driver_grid_p9` | 0 | `[drv] 52/52 PASS` | — | 406.1 |
| `driver_heromark_signplate` | 0 | `46 / 46`(⭐ PASS の語を含まない書式) | — | 13.6 |
| `driver_mapdef_step1` | 0 | `=== 208/208 PASS ===` | — | 18.7 |
| `driver_mapdef_step2` | 0 | `74/74 PASS` | — | 115.6 |
| `driver_mapdef_step3` | 0 | `122/122 PASS` | — | 113.8 |
| `driver_mapeditor` | **1** | `[driver] 176/179 PASS  (FAIL 3)` | `§2 12b` / `§3 12a` / `§3 12b`(いずれも地図エディタの実マウス操作) | 2.7 |
| `driver_mapeditor_painting` | **1** | `PASS 105 / FAIL 1  (合計 106)` | `§1 1d2`(label 13 種 vs サイズ 12 種) | 8.3 |
| `driver_mapeditor_pointer` | 0 | `PASS 31 / FAIL 0  (合計 31)` | — | 20.6 |
| `driver_mapeditor_props` | 0 | `PASS 71 / FAIL 0  (合計 71)` | — | 3.6 |
| `driver_mapeditor_railkit` | 0 | `PASS 134 / FAIL 0  (合計 134)` | — | 8.3 |
| `driver_mapeditor_texture` | 0 | `PASS 30 / FAIL 0  (合計 30)` | — | 3.6 |
| `driver_mapeditor_waterkit` | 0 | `PASS 138 / FAIL 0  (合計 138)` | — | 8.0 |
| `driver_paint_blocked` | 0 | `PASS 65 / FAIL 0` | — | 6.6 |
| `driver_party_view_reopen` | 0 | `結果: 35/35 PASSED / 0 FAILED / 0 PENDING` | — | 72.1 |
| `driver_spawn_not_on_gate` | 0 | `[drv] 59/59 PASS` | — | 4.2 |
| `verify_ability_scores` | 0 | `24/24 PASSED   FAILED 0   PENDING 0` | — | 3.2 |
| `verify_darkvision` | 0 | `25/25 PASSED   FAILED 0   PENDING 0` | — | 79.3 |
| `verify_fort_fold` | 0 | `PASS 30 / FAIL 0` | — | 1.2 |
| `verify_mercenary_roster` | 0 | `[mercenary-roster] 44 PASSED / 0 FAILED / 0 PENDING (44/44)` | — | 18.6 |
| `verify_npc_crowd` | 0 | `33/33 PASSED   FAILED 0   PENDING 0` | — | 71.8 |
| `verify_party_promises` | 0 | `35/35 PASSED   FAILED 0   PENDING 0` | — | 248.9 |
| `verify_player_sheet` | 0 | `73/73 PASSED   FAILED 0   PENDING 0` | — | 56.6 |
| `verify_quest_visibility` | 0 | `素 39/39 PASSED  (PENDING 0)` | — | 16.6 |
| `verify_quest_walk` | 0 | `25/25 PASSED   FAILED 0   PENDING 0` | — | 209.8 |
| `verify_recruit_talk` | 0 | `25/25 PASSED   FAILED 0   PENDING 0` | — | 62.9 |
| `verify_road_ambush` | 0 | `41/41 PASSED` | — | 67.1 |
| `verify_road_boon` | 0 | `20/20 PASSED   FAILED 0   PENDING 0` | — | 69.9 |
| `verify_road_events` | 0 | `25/25 PASSED   FAILED 0   PENDING 0` | — | 84.0 |
| `verify_run_chronicle` | 0 | `[run-chronicle] 73 PASSED / 0 FAILED / 0 PENDING` | — | 227.0 |
| `verify_swamp_fold` | 0 | `PASS 30 / FAIL 0` | — | 2.1 |
| `verify_swamp_lair` | 0 | `PASS 26 / FAIL 0` | — | 2.5 |
| `verify_swamp_novice` | 0 | `PASS 34 / FAIL 0` | — | 9.8 |
| `verify_tavern_map` | 0 | `43/43 PASSED   FAILED 0   PENDING 0` | — | 21.2 |
| `verify_title_screen` | 0 | `[title-screen] RESULT: 86/86 passed` | — | 66.4 |
| `verify_town_exit` | 0 | `素 23/23 PASSED  (PENDING 0)` | — | 7.1 |
| `verify_town_map` | 0 | `85 / 85`(⭐ PASS の語を含まない書式) | — | 51.1 |
| `verify_world_heromark` | 0 | `18/18 PASSED   FAILED 0   PENDING 0` | — | 9.5 |
| `verify_world_map` | 0 | `57/57 PASSED   FAILED 0   PENDING 0` | — | 75.3 |
| `verify_world_steps` | 0 | `33/33 PASSED   FAILED 0   PENDING 0` | — | 53.8 |

⇒ **緑 51 本 / 赤 4 本**。

#### (c) 突き合わせ用の 3 本(母集団外・#64 の「着手前から赤 4 本」の残り)

| ドライバ | exit | 集計行 | FAIL した assert | 秒 |
|---|---|---|---|---|
| `sweep_recruit_balance` | **1** | 集計行なし。**装置崩れ 4/4**(母集団ガード OLD 0/2 / NEW 0/2) | `4_partySize(got=1 want=4)` ほか(#61 以降の腐り) | 153.6 |
| `probe_party_size` | **終了せず** | 集計行なし | ⚠ **941.5 秒で終了せず**、手で停止(#64 は 900 秒で打ち切り = 同じ振る舞い) | 941.5 |
| `driver_monsters_umberhulk` | **1** | `[driver] RESULT: 21/22 passed` | umber hulk の gaze 再発火(1 件) | 209.9 |

#### (d) 着手前から赤いドライバ = **7 本**(#64 の記録との突き合わせ)

| ドライバ | 着手前(2026-09-10 実測) | #64 の記録 | 一致? |
|---|---|---|---|
| `driver_mapeditor` | EXIT=1 **176/179** | EXIT=1 176/179 | ✅ **完全一致** |
| `sweep_recruit_balance` | EXIT=1 **装置崩れ 4/4**(`4_partySize(got=1 want=4)`) | EXIT=1 装置崩れ 4/4 同左 | ✅ **完全一致** |
| `probe_party_size` | **終了せず**(941.5 秒で手で停止) | EXIT=124(900 秒打ち切り) | ✅ **同じ振る舞い**(⚠ 終了コードは打ち切り方の違いで別値) |
| `driver_monsters_umberhulk` | EXIT=1 **21/22** | EXIT=1 21/22 | ✅ **完全一致** |
| `driver_doors_p2` | EXIT=1 **33/34**、FAIL=**(6c)** | (#64 の 4 本には**無い**) | ⚠ §8 と §6-4 が予告済み |
| `driver_grid_p4` | **EXIT=3**(0.5 秒) | (#64 の 4 本には**無い**) | ⛔ **記録に無い赤** |
| `driver_mapeditor_painting` | EXIT=1 **105/106** | (#64 の 4 本には**無い**) | ⛔ **記録に無い赤** |

⭐ **#64 の「着手前から赤 4 本」は 4 本とも再現した**(数字まで一致)。
⛔ **ただしそれが全部ではない。** #64 の母集団は「`tavern.html` / `world.html` / `town.html` を読む 59 本」で、
本チケットの母集団(17 ファイルを読む 55 本)とは**別の集合**。重なっていない領域に赤が 3 本あった。
⇒ ⭐⭐⭐ **一般解 = 前チケットの「既知の赤」表は、母集団が変わった瞬間に不完全になる。**
**期待表に合わせて数字を書き換えず、母集団ごとに取り直す。**

**赤 3 本の中身**(いずれも #65 とは無関係。行末にも扉にも触れていない領域):

- `driver_doors_p2` **(6c)** … `bandits-forest:0` = 森に扉が 1 枚も立たない。**#16 の森畳み以来**(§6-4 が言い直し対象に指名済み)
- `driver_grid_p4` … 変異 `n1ringonly` の置換対象(`index.html` の地図行)が**見つからず空振り** ⇒ 起動時検算で **exit 3**。
  ⚠⚠ **素の assert が 1 本も走っていない**(§2-4 が言う「偽の赤の正体」と**同型**。ただし原因は行末ではなく地図行の腐り)
- `driver_mapeditor_painting` **(§1 1d2)** … label が 13 種あるのにサイズの種類数が 12(`部屋n7big 30×20` と `部屋n4big 30×20` の重複)

#### (e) §8 が名指しする 5 本 — 予想と実測

| ドライバ | 依頼書 §8 の予想 | **実測** | 判定 |
|---|---|---|---|
| `verify_road_ambush` | **41/41 exit 0** | **41/41 PASSED / exit 0**(67.1 秒) | ✅ **的中** |
| `driver_doors_p2` | **(6c) は着手前から FAIL** | **33/34 / exit 1**、FAIL は **(6c) ただ 1 本** | ✅ **的中** |
| `driver_doors_p5` | (予想なし) | **32/32 / exit 0**(16.7 秒) | — |
| `driver_doors_p8` | (予想なし) | **15/15 / exit 0**(6.8 秒) | — |
| `verify_road_events` | (予想なし) | **25/25 / exit 0**(84.0 秒) | — |

⭐ **§8 の予想は 2 件とも当たった。訂正すべき予想は無い。**

#### (f) ついでに確かめた STEP2 の前提(全部そのまま生きている)

- **17 ファイルは全部 LF**、`index.html` / `tavern.html` / `town.html` / `world.html` / `audio.js` は
  **全部 CRLF** ⇒ §2-3 のとおり
- `scripts/hooks/pre-commit` は **LF・CR 0 個** ⇒ §2-6 のとおり(`.gitattributes` の除外は必須のまま)
- 複数行アンカーは **2 本**とも §2-4 のとおり:
  `boxleak`(`verify_road_ambush.js:199-202`)は `\n` = **LF**(コメントにも「(LF ファイル)」と明記)⇒ STEP2 で空振りする。
  `bridgefill`(`:329`)は `\r\n` を明示 ⇒ そのまま通る

#### (g) ⭐⭐⭐ STEP1 で崩れた点(項目5 / 次の窓への申し送り)

**1. ⚠⚠⚠ 集計行の書式は 3 つではなく 7 つ以上。しかも 2 つは `PASS` の語を含まない。**

手順書は「集計行は `PASS` で grep する。`PASSED` では 3 書式のうち 2 つが 0 件になる」と書いていたが、
**`PASS` で grep しても 2 書式が 0 件になる**。実測した書式:

```
[driver] RESULT: PASSED N / FAILED 0 / PENDING 0
[title-screen] RESULT: 86/86 passed              <- 小文字 passed
========== 結果: N/M PASS ==========
=== driver_field_step7  79/79 PASS ===
[drv] 66/66 PASS   (--mutate nokind)
PASS 44 / FAIL 0                                 <- N/M 形ですらない
[mercenary-roster] 44 PASSED / 0 FAILED / 0 PENDING (44/44)
  46 / 46                                        <- PASS の語が 1 つも無い
```

⇒ ⭐ **対処 = 完全なログをドライバごとにファイルへ残し、集計行は後段で抽出し直す。**
この形なら書式が増えても**走り直さずに**回収できる(実際 STEP1 で 2 度直したが再走 0 回)。
⛔ スイープ中に集計行だけ拾って捨てる作りにすると、書式漏れのたびに 73 分を焼く。

**2. ⚠⚠ 12 時間前の node 孤児が 20 本残っていた**(`StartTime` = 06:38 / 実行 740 分)。

スイープ開始時点で、本スイープと無関係な `node.exe` が **20 本**生存していた。
⚠ ドライバは起動時にポートを最大 14 本予約するので、これは**偽の赤の火種**そのもの。
⭐ 今回は実害が出なかった(赤 4 本はすべて `EADDRINUSE` ではなく中身の理由で赤)が、
⇒ **項目5 の再走前に `Get-Process node` を必ず確認すること。**

**3. ⚠ §2-8 の「`tools/*.js` = 156 本」は誤り。** 実測 `git ls-files "tools/*.js"` = **141 本**。
156 は**リポジトリ全体の追跡 `.js`**(`git ls-files "*.js"`)の数。
⭐ 母集団の割合を語るときの分母がずれるだけで、本チケットの判断には影響しない。

**4. ⚠⚠⚠ 行末を `grep -c` で測ると嘘が返る。**

LF しか無い `js/*.js` に対しても CR を数える grep が**行数と同じ値**を返し、
「17 ファイルは既に CRLF」という**真逆の結論**が一度出た。`py` でバイトを数え直して §2-3 が正しいと確認。
⇒ ⭐ メモリ [[feedback_crlf_python_patch]] の「改行は `py` か `od -c` で測る」は**今回も的中**。
⛔ 行末の判定に grep を使わないこと。

#### (h) 生ログの置き場

scratchpad に 58 本ぶんの完全なログを残してある(⛔ リポジトリ内には置いていない):

```
...\scratchpad\sweep.txt         ... 1 行 = ドライバ名 / exit / 集計行 / FAIL / 秒
...\scratchpad\logs\<name>.log   ... 各ドライバの stdout+stderr 全文
```
