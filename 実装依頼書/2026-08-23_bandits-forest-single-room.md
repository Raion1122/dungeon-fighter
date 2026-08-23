# シナリオ2 を「盗賊団のアジト」1 枚マップ 1 部屋へ畳む

**ステータス**: **承認済** (2026-08-23 ユーザー承認。**着手前実測も完了** — 下記「着手前実測」節)
**撤退スイッチ**: `?s2fold=0`

---

## 目的

シナリオ2「町外れの森 — 盗賊団の根城」を、**codex1 納品の卓上バトルマップ 1 枚だけ**で完結させる。
森の街道に降り立った瞬間からその絵の上にいて、東へ歩き、橋を渡り、丸太柵の門をくぐって
頭目スカーの天幕へ詰める。**7x6 の小部屋を 7 つ歩かされない。**

⭐ **ユーザーの発端**: 「プレイしても(あの絵が)出てこない」「手前の部屋とか古いの使ってない?」
その通りで、依頼書 #11 は**案A = n7 だけ大部屋化**という決定だったため、n0〜n6 は
2026-08-13 以前の姿(6 部屋は絵なしのタイル床、n4 だけ古い 7x6 の絵)のまま残っている。

---

## ユーザー決定 (2026-08-23)

4 案を数字つきで提示して選んでもらった。**これが唯一の正**で、実装窓が勝手に変えない。

| 論点 | 決定 | 却下した案 |
|---|---|---|
| 構成 | **案1: シナリオ2 を 1 部屋にする。**罠 / 宝箱 / 残影の獣は大部屋の中へ再アンカー | 案2 (2 部屋へ畳む) / 案3 (8 部屋のまま手前の絵を新調) / 案4 (構成は触らず 0% クリア率を先に直す) |
| 湧き水の泉 (`kind:"rest"`) | **消してよい**。エンカ後の回復が 1 回減ることを承知の上 | 大部屋のどこかへ rest 相当を再現する |
| ノード遷移が 0 回になる | **いったんそれでよい**。「引き返す」矢印も分岐の選択肢もシナリオ2 から消える | 分岐を別の形で残す |
| 罠 8 / 宝箱 8 の総数 | **そのままの数を 1 部屋に出す**(密度は下がるが総数は維持) | 部屋が 1 つになるぶん数を減らす |

---

## 着手前実測 (2026-08-23 / 承認前)

⚠ **勘で書いた数字は 1 つも無い。**新規プローブ `tools/probe_s2_fold.js` を書いて測った。

### ⭕ (1) 1 ノードのグラフは成立する — 本番の lint が error 0 / warning 0

`node tools/probe_s2_fold.js --lint` — 今の n7 の mapDef をそのまま素材にして、
1 ノードだけのグラフを本番の `DFMapDef.lintRun` へ通した:

```
── 対照 (今の 8 ノード): error [] / warning []
⭕ 1 ノード / kind:"boss" (本命)              (error 0 / warning 0)
⛔ 1 ノード / kind:"search"   error graph-no-boss / warning graph-dead-end-empty, graph-kind-role
⛔ 1 ノード / kind:"loot"     error graph-no-boss / warning graph-kind-role
```

- `entry` と boss ノードが**同一でよい**。`graph-unreachable-node` / `graph-not-tree` /
  `graph-entry-start` はどれも鳴らない (start `{tx:12, ty:15}` は rect `[1,10,26,61]` の中)
- ノード数の下限を要求する検査は存在しない (`js/df-mapdef.js:2857` が見るのは「空でないこと」だけ)

### ⛔⛔⛔ (2) 1 ノードでは kind は "boss" 一択 → **罠も玄室宝箱も原理的にゼロになる**

上の実測のとおり、`kind` を "search" / "loot" にすると `graph-no-boss` で **error** になる
(クリア条件 `defeatBoss` の終着点が消えるため)。ところが罠と宝箱の門番は kind しか見ない:

```js
// js/df-mapdef.js:2082-2094
var KIND_SPAWNS_TRAPS       = { search: 1 };   // 罠 / 隠し宝箱 / 探索宝箱
var KIND_SPAWNS_ROOM_CHESTS = { loot: 1 };     // 玄室宝箱
function excludedRoomIdxForKind(d, kind)      { return KIND_SPAWNS_TRAPS[kind]       ? new Set() : allRoomIdx(d); }
function chestExcludedRoomIdxForKind(d, kind) { return KIND_SPAWNS_ROOM_CHESTS[kind] ? new Set() : allRoomIdx(d); }
```

→ **1 部屋にした時点で、コードを 1 行も足さなければ罠 8 個と宝箱 8 個が無言でゼロになる。**
廃坑 P8 が実際に払った代償(`index.html:34211` の注記「罠と宝箱は n2/n3 撤去時から
既にゼロのまま」)と同じもの。**本件はこれを払わない**ので、opt-in の口を足す (STEP2)。

⭐ **呼び口は 1 箇所しかない** — `applyNodeKindExclusions` (`index.html:4502`)。
判定の出所も上の 2 関数だけ。**index.html 側で kind を再判定しないこと**(出所が 2 つになる)。

### (3) 畳むと何を失うか — 実測 (`node tools/probe_s2_fold.js --kinds`)

⚠ 8 ノードを**実プレイと同じ入場手順**で巡って数えた
(`resetNodeState → buildNode(resolveNodeMapDef(id), id) → restoreNodeState → spawnNodeEntities`。
`buildNode(mapDef)` を直に呼ぶと `MAPDEF.isCustom` が付かず別の絵のマスクを測る — #11 §7 の罠):

| id | kind | 部屋 | マス | 絵 | 敵 | 罠 | 玄室宝箱 | 檻 | 出口 |
|---|---|---|---|---|---|---|---|---|---|
| n0 | start | 森の入口 | 42 | — | 0 | 0 | 0 | 0 | n1,n2,n3 |
| n1 | combat | 野営の焚き火跡 | 42 | — | 5 | 0 | 0 | 0 | n4,n5 |
| n2 | **search** | 猟師の廃屋 | 42 | — | 3 | **8** | **6** | 0 | n6 |
| n3 | **loot** | 略奪品の隠し穴 | 42 | — | 2 | 0 | **2** | 0 | 行き止まり |
| n4 | combat | 丸太の砦 | 42 | n4 (古) | 5 | 0 | 0 | 0 | n7 |
| n5 | rest | 湧き水の泉 | 42 | — | 0 | 0 | 0 | 0 | 行き止まり |
| n6 | event | 苔むした檻の前 | 42 | — | 1 | 0 | 0 | **2** | 行き止まり |
| **n7** | **boss** | **盗賊団のアジト** | **1352** | **n7big** | **10** | 0 | 0 | 0 | 行き止まり |
| | | | | **合計** | **26** | **8** | **8** | **2** | |

→ 畳むと**敵は 26 体 → 10 体**。罠 8 / 宝箱 8 / 檻 2 は STEP2〜4 で戻す。

### (4) ⭐ 「出てこない」の正体 — **今は n7 に一度も到達していない**

`node tools/auto_debug_run.js --scen bandits-forest --runs 3 --port 8799`:

| ラン | 結果 | 時間 | ラウンド | 生存 |
|---|---|---|---|---|
| #0 | **defeat** | 190s | R9 | 2 |
| #1 | **defeat** | 24s | R6 | 2 |
| #2 | **defeat** | 48s | R8 | 2 |

**完走 0/3。**R6〜R9 = n0/n1 の最初の戦闘で折れている(依頼書 #8 の 120 走行が出した
「シナリオ2 はクリア率 0%、n1 で折れる」と一致。README の未解決宿題 1 そのもの)。
⭐ **畳むと 1 部屋目がその絵になるので、「絵に到達できない」問題は構造的に消える。**
⚠ n4 (38,14) の停止は今回 1 度も出なかった — `d2b7709` (敵が閉じた扉の中に湧く欠陥) で解決済み。

### ✅ (5) シナリオ2 にノードイベントは 1 本も無い

`registerNodeEvent` の呼び口は 3 つで、**全部シナリオ1**
(`mine_watch` / `captive_servant` / `grix_parley` — `index.html:33751/33753/33758`)。
→ 畳んで失う会話イベント・選択肢は**ゼロ**。

### ⚠⚠⚠ (6) 残影の獣の座標は**必ず移す** — 今の値は大部屋では岩の中

`index.html:10140` の `SCENARIO_NODE_EXTRAS`:

```js
"bandits-forest": {
  n6: { spawns: [["shadowBeast", 36, 13, "s2_beast_intel"]],
        cages:  [{ tx: 36, ty: 13, flag: "s2_beast_intel" }] },
},
```

- `(36,13)` は 7x6 の小部屋の中心。**52x26 の大部屋では絵ローカル (26,12) = 北東の岩場の内側**。
  依頼書 #11 が「起点の床保証がここに無言で穴を開ける」と名指ししたまさにそのタイル
- ⚠ **檻と獣は同一タイルに置くこと**(`linkCagedBeasts` が最寄りの檻へ吸着する。上の注記が明記)
- ⚠ 4 要素目 `"s2_beast_intel"` は酒場の噂フラグ。**受入条件は「フラグ ON の母集団」と対で書く**
  (フラグ OFF で 0 体なのは正常なので、母集団ガードが無いと永久に緑になる)

### (7) 大部屋の床 (#11 の実測を再確認済み)

歩けるマス **262 / 1352 (19.4%)**、入場から**全部**到達可 (孤立 0)。
外周で歩けるのは 4 方向のゲートタイル `(35,1) (35,26) (61,13) (10,15)` だけ (`sealRing`)。
入場 (12,15) → ボス (57,12) は本番 `aStar` で **48 歩**、経路は必ず橋を通る。

---

## 設計

### グラフ

**1 ノード。id は `n7` のまま変えない。**

```js
{ entry: "n7",
  nodes: [ { id: "n7", kind: "boss",
             mapDef: /* 今の n7 と同一 = rect [1,10,26,61] / paint "n7big" / density 0
                        / start {tx:12,ty:15} / slots 9 体 / boss scar */,
             exits: [] } ] }
```

⭐ **id を `nf` などへ変えない理由**: `tools/driver_grid_s2.js` (93 本) と
`tools/driver_graph_p6.js` (244 本) が `n7` を名指しで測っている。id を変えると
**変異アンカーが 0 件ヒットしてドライバごと exit 3 で死ぬ**(空振り = 偽の緑)。
畳むのは構成であって、測定点の名前ではない。

### 罠と宝箱を戻す口 (判定の出所は 1 本のまま)

`js/df-mapdef.js` の 2 関数に**第 3 引数 `extraKinds` を足す**。⚠ **既定は 1 ビットも動かさない**:

```js
/* ★[#16] 1 ノードのグラフでは kind が "boss" 一択になる (graph-no-boss)。
 *   kind を分け合えないノードのために「この kind も兼ねる」を外から渡せるようにする。
 * ⚠ 判定の出所はここ 1 本のまま。呼び口 (index.html) で kind を再判定しないこと。 */
function kindSpawnsFrom(table, kind, extraKinds) {
  if (table[kind]) return true;
  if (Array.isArray(extraKinds))
    for (var i = 0; i < extraKinds.length; i++) if (table[extraKinds[i]]) return true;
  return false;
}
function excludedRoomIdxForKind(d, kind, extraKinds) {
  return kindSpawnsFrom(KIND_SPAWNS_TRAPS, kind, extraKinds) ? new Set() : allRoomIdx(d);
}
function chestExcludedRoomIdxForKind(d, kind, extraKinds) {
  return kindSpawnsFrom(KIND_SPAWNS_ROOM_CHESTS, kind, extraKinds) ? new Set() : allRoomIdx(d);
}
```

index.html 側は**台帳 1 つ + 呼び口 1 箇所**(`SCENARIO_NODE_EXTRAS` と同じ流儀):

```js
/* ★[#16] 「このノードは kind に加えてこの kind も兼ねる」台帳。
 * ⚠ 畳んだシナリオだけが載る。他 5 シナリオは 1 度も引かれない。 */
const NODE_EXTRA_SPAWN_KINDS = { "bandits-forest": { n7: ["search", "loot"] } };
```

`applyNodeKindExclusions` (`index.html:4502`) が引いて第 3 引数へ渡す。
⚠ **2 系統 (`EXCLUDED_ROOMS` / `ROOM_CHEST_EXCLUDED_ROOMS`) は必ず一緒に差し替える**
(既存の注記が「片方だけだと中間状態になる」と明記している)。

### 残影の獣の再アンカー

`SCENARIO_NODE_EXTRAS["bandits-forest"]` のキーを **`n6` → `n7`** にし、座標を大部屋の床へ移す。
⚠ **座標は STEP1 で `probe_bandit_map.js --places` に掛けて床であることを確認してから書く**
(#10 で候補 3 つが全部岩だった前例)。置き場所の意図 = 「街道から見える、柵の外の脇道」。

---

## 変更範囲

### 触るファイル

| ファイル | 何を |
|---|---|
| `js/df-mapdef.js` | `excludedRoomIdxForKind` / `chestExcludedRoomIdxForKind` に第 3 引数。既定は不変 |
| `index.html` | `S2_FOLD_OFF` / 1 ノードグラフ / `NODE_EXTRA_SPAWN_KINDS` / `SCENARIO_NODE_EXTRAS` の再アンカー |
| `tools/driver_s2_fold.js` | **新規** 検証ドライバ |
| `tools/probe_s2_fold.js` | **既に作成済**(本節の実測に使用)。STEP1 で座標モードを足すかは実装窓の判断 |
| `tavern.html` | **changelog を 1 行**。`py tools/add_changelog.py "<b>…</b> — …"` |

### 触らないと決めたファイル

- `assets/room_bandits-forest_n7_map.jpg` — 焼き直さない。**新規アセットは 0 枚**
- `assets/room_bandits-forest_n4.jpg` / `_n7.jpg` — 残置(`?s2fold=0` / `?banditmap=0` の行き先)
- `tools/make_grid_map.py` — 台帳は #11 のまま
- `buildGoblinMineRun` / 他 4 シナリオの spec — 1 バイトも触らない
- `ROOM_PAINTINGS_DEF` — `n7big` は #11 のまま使う

---

## STEP

### STEP1 — 座標の実測

`probe_bandit_map.js --places --tiles "…"` で、檻 / 残影の獣 の候補タイルが**本番の
`isTileWall` で床**であること、入場から本番の `aStar` で到達可能であることを確認する。
⚠ ここを飛ばして座標を書かない。

### STEP2 — `js/df-mapdef.js` に第 3 引数 (**挙動不変**の段)

⭐ 機能を足す前に「配線だけ」の段を挟む。第 3 引数を渡さない限り**今と 1 ビットも変わらない**。
**受入**: 6 シナリオ 42 ノードの mapDef が `JSON.stringify` で完全一致
(`probe_bandit_map.js --mapdefs` がこの比較そのものを実装済み)。

### STEP3 — 1 ノードへ畳む + 撤退スイッチ

`S2_FOLD_OFF` を `BANDIT_MAP_OFF` の隣で読む(⚠ **TDZ**。RUN の即時評価より前に宣言する)。
⚠ **スイッチは 1 箇所で読み、分岐も 1 箇所**(`MINE_FOLD_OFF` / `BANDIT_MAP_OFF` と同じ流儀)。
⚠ `?s2fold=0` は**今の 8 ノード構成へ完全復帰**する。`?banditmap=0` との組み合わせも定義する
(`s2fold=0 & banditmap=0` = #11 より前の姿)。

### STEP4 — 罠 / 宝箱 / 残影の獣を大部屋へ戻す

`NODE_EXTRA_SPAWN_KINDS` + `SCENARIO_NODE_EXTRAS` の再アンカー。
⚠ 罠が**橋の上や門のタイルに湧かないか**を見る(隘路が塞がると詰む)。
⚠ 敵スロット 9 + ボスのタイルと重ならないこと。

### STEP5 — 検証ドライバ `tools/driver_s2_fold.js` (新規)

`tools/driver_grid_s2.js` を下敷きにする。⚠ `require('./_pptr_profile')` を忘れない。

| # | 何を | 負のコントロール |
|---|---|---|
| §1 | グラフが 1 ノード / entry === boss ノード / `lintRun` error 0 warning 0 | — |
| §2 | 絵が `n7big`、rect が `[1,10,26,61]`、入場が (12,15) | — |
| §3 | **罠が 1 個以上湧く** | `NODE_EXTRA_SPAWN_KINDS` から "search" を抜くと**赤** |
| §4 | **玄室宝箱が 1 個以上湧く** | 同上 "loot" を抜くと**赤** |
| §5 | 檻 2 + 残影の獣 1(**噂フラグ ON の母集団ガードと対**) | 獣の座標を (36,13) へ戻すと**赤** |
| §6 | 罠 / 宝箱 / 檻 / 敵 / ボスが**全部 `isTileWall` の床**の上 | — |
| §7 | 入場 → ボスが本番 `aStar` で到達可、経路が橋を通る | 橋を塞ぐと**赤** |
| §8 | 他 5 シナリオの mapDef が `JSON.stringify` で完全一致 (golden) | — |
| §9 | `?s2fold=0` で **8 ノードへ完全復帰**(§1〜§5 の同じ assert 本体を当てて**赤**) | — |

⚠⚠ **§9 は「`?s2fold=0` で緑」ではなく「同じ assert 本体を当てて赤」で測る**
(#5 で緑側だけを見て空振りした前例がある)。
⚠⚠ **負のコントロールはドライバに内蔵する**(`--negative` で赤くならなければ exit 1)。

### STEP6 — 非退行 + 実プレイ

既存ドライバを回す(基準値は着手日に**自分で 1 回測ってから**使う。README の数字は腐る):
`driver_grid_s2` 93 / `driver_graph_p6` 244 / `driver_grid_p8` 56 /
`driver_spawn_not_on_gate` 47 / `driver_encounter_mopup` 36 / `probe_party_size` 57。
⚠ 赤が出たら `git stash -u` して HEAD で同じドライバを回し、自分由来か切り分ける。

実プレイ: `node tools/auto_debug_run.js --scen bandits-forest --runs 3` を
**既定と `?s2fold=0` の両方**で回して突き合わせる(`--qs` 通し口は #11 で追加済み)。
⚠ 「2 回連続で同じ = フレークでない」は成立しない。

### STEP7 — changelog + コミット

`index.html` を触るので `scripts/hooks/pre-commit` が changelog 未更新のコミットを**中止する**。

```bash
py tools/add_changelog.py "<b>盗賊団の根城が 1 枚の戦場になった</b> — 森の街道からアジトの天幕まで、途切れずひと続きの野営地を進む。"
```

⚠ `--no-verify` での迂回は禁止(そもそもハーネスが全経路をブロックする)。
⚠ `python` ではなく **`py`**。
⚠ 別窓と並行しているときは `git add .` 禁止。**ファイル単位 add** + `git diff --cached <file>` を
**commit の前に読む**(自分が書いた量と `--stat` の行数が合わなければ相手の差分が混ざっている)。

---

## 受入条件

1. `node tools/driver_s2_fold.js` が**全項目緑**、`--negative` で**全部赤**
2. `?s2fold=0` で今の 8 ノード構成へ**完全復帰**(mapDef が `JSON.stringify` で一致)
3. 他 5 シナリオの mapDef が `JSON.stringify` で**完全一致**
4. 畳んだ 1 部屋で **罠 ≥ 1 / 玄室宝箱 ≥ 1 / 檻 2 / 残影の獣 1**(噂フラグ ON)が湧く
5. 既存ドライバの**非退行** 6 本
6. 実プレイ 3 周を既定と `?s2fold=0` の両方で回し、**完走率を数字で報告する**
   ⚠ 「0/3 → 何 /3 になったか」を出すのが仕事。**数値そのものの調整は #8 の宿題**
7. changelog が 1 行増えている

---

## やらないこと (スコープ外)

- ⛔ **他 5 シナリオの畳み込み**。素材が無い(未使用の codex1 マップ 3 枚は石造りの屋内)
- ⛔ **難易度 / XP の数値調整**。敵が 26 → 10 体に減るので必ず易しくなるが、数値は #8 へ
- ⛔ **旧 8 ノードの削除**。`?s2fold=0` の行き先として残す
- ⛔ **新規アセットの発注**。絵は #11 で焼いた 1 枚で足りる
- ⛔ `MAP_H` を 28 から広げる
- ⛔ n4 の古い絵 `room_bandits-forest_n4.jpg` の描き直し

---

## 判断を仰いだ点 → **3 点とも回答済 (2026-08-23)**

1. **`kind:"rest"` の湧き水が消える** → ⭕ **消してよい**。入室 1 回きりの `applyRoomClearHeal` が
   無くなる。#13 で休憩が 8 回 → 3 回に減った上での更なる減少だが、敵も 26 → 10 体になるので
   差し引きは実測でしか分からない。**STEP6 で数字を出して報告する**(調整そのものは #8)
2. **ノード遷移が 0 回になる** → ⭕ **いったんそれでよい**。「引き返す」矢印も分岐の選択肢も
   シナリオ2 からは消える。⚠ **他 5 シナリオの分岐は無改修**なので、体験が消えるのは
   シナリオ2 だけ。戻したくなったら `?s2fold=0`
3. **罠 8 / 宝箱 8 をそのまま 1 部屋に出すか** → ⭕ **そのままの総数で 1 部屋**。
   42 マス x 2 部屋 → 1352 マス x 1 部屋なので**密度は 1/16 以下に下がる**が総数は維持する。
   ⚠ 減らす方が戻しやすいので、多すぎたら次で減らす

### 残る未解決

- iOS 実機での体感(引き倍率 compact 0.2700 は #11 で実測済み)

---

## 実装結果 (2026-08-23)

**結果**: シナリオ2 は既定で **1 ノード (n7「盗賊団のアジト」52x26)** になった。
罠 8 / 玄室宝箱 7〜9 / 檻 2 / 残影の獣 1 はすべて大部屋の中へ戻っている。
撤退は `?s2fold=0`(8 ノードへ完全復帰)。

### 実測値 (依頼書の予告と突き合わせ)

| 物 | 依頼書の予告 | 実測 |
|---|---|---|
| 1 ノード / kind:"boss" の lint | error 0 / warning 0 | **完全一致**(`driver_grid_s2 (13c)`) |
| 畳んだ後の敵 | 10 体 | **11 体**(スロット 9 + ボス 1 + **残影の獣 1**)。獣を数え忘れていた |
| 罠 | 1 個以上 | **8 個**(畳む前に n2 で湧いていた数と同じ) |
| 玄室宝箱 | 1 個以上 | **7〜9 個**(`roomChests` は 2 系統の合算。下記 §3 参照) |
| 檻 / 残影の獣 | 2 / 1 | **2 / 1**、どちらも (41,17) の同一タイル |
| 罠・宝箱・檻が壁の上 | 0 | **0** |
| 入場 → ボス | 48 歩・橋を通る | **完全一致**(#11 から不変) |

### 依頼書との差分 (逸脱と、その理由)

1. ⚠⚠⚠ **`roomChests` は玄室宝箱と隠し宝箱の**両方**を抱えていた**。
   `spawnRoomChests`(`kind:"loot"` 系)と `spawnHiddenChests`(`kind:"search"` 系)が
   同じ配列へ push する。**総数だけを見ると "loot" の兼務を抜く負のコントロールが
   空振りする**(実際に (3f) が「宝箱 6 個が残る」で赤を出した)。
   → 検出器は**門番の除外集合そのもの**(`EXCLUDED_ROOMS` / `ROOM_CHEST_EXCLUDED_ROOMS`
   の要素数)を測る形へ変えた。総数の assert は残しつつ、切り分けは除外集合で行う。
2. ⚠⚠ **TDZ を踏みかけた**。`applyNodeKindExclusions` は宣言より前の
   `index.html:4502`(MAPDEF 構築の直後)から呼ばれるので、`NODE_EXTRA_SPAWN_KINDS` を
   4500 行台に `const` で置くと一時的死角で `ReferenceError`。
   → 台帳は `S2_FOLD_OFF` の隣(3800 行台)へ置いた。`MINE_FOLD_OFF` / `BANDIT_MAP_OFF` が
   そこに居るのとまったく同じ理由。
3. ⚠⚠ **`?banditmap=0` を単独で渡すと不整合な状態になっていた**(依頼書に無い)。
   #11 の退避口は「#11 より前へ戻す」ものだが、#11 より前のシナリオ2 は **8 ノード**。
   畳みだけを残すと「9x6 の旧小部屋 1 つでシナリオが完結し、残影の獣の (41,17) は
   その rect の外」という、どちらの版でもない姿になる。
   → 畳みの真偽を **`S2_FOLDED = !S2_FOLD_OFF && !BANDIT_MAP_OFF`** の 1 本へ集約し、
   3 箇所(グラフの形 / 兼務の台帳 / 隠し要素のアンカー)がすべてそれを読むようにした。
4. **檻と獣の座標 (41,17) の出所**は依頼書どおり「旧・単一マップ版のシナリオ2 が
   使っていた檻」。本番の `isTileWall` で床、入場から本番 `aStar` で **31 歩**。
5. **ノード id は `n7` のまま**にした(依頼書の指定どおり)。おかげで
   `driver_grid_s2` の変異アンカーも `driver_graph_p6` の測定点も生き残った。

### 既存ドライバ — **期待値は 1 つも緩めず、測定点か内訳の名指しへ移した**

| ドライバ | 前 | 後 | 何をしたか |
|---|---|---|---|
| `driver_grid_s2` | 93 | **111** | §13 を新設(11 本)+ 負のコントロール 3 本 + (7c)/§11/§12 の腕を `?s2fold=0` へ |
| `driver_graph_p6` | 244 | **245** | 5 ループの腕を `?s2fold=0` へ(P6 共通骨格は撤退先に生きている)+ 装置 assert (1s2fold) を追加 |
| `driver_spawn_not_on_gate` | 47 | **51** | 主題(n4 の出口ゲート)は 8 ノードの話なので §2〜§4 を `?s2fold=0` へ。**既定の腕も測り続ける**ため (1a2)〜(1d2) を追加 |
| `driver_graph_kinds` | 66 | **66** | 装置 assert のしきい値「ノード数 ≧ 2」→「`active` の反転」。1 ノードは分岐が無いだけでグラフは立っている |
| `driver_grid_p3b` | 42 | **43** | (3i) の「他 5 本とも 0/0」→ **シナリオごとの名指し**(シナリオ2 = 1 部屋 / 1352 マス)+ 「屋外の起点はちょうど 1 本」の母集団ガード |
| `driver_doors_p6` | 39 | **39** | `bad.stuck` から**ボスノードを除外**。出口 0 本は `defeatBoss` では詰みではない(8 ノードの頃は n7 に親が居たので hasParent で拾えていた) |

⭐ **`driver_grid_s2` の負のコントロールは 4 本 → 7 本**:
`nobridge` / `nostart` / `nodensity` / `noring` / **`nosearchkind`** / **`nolootkind`** / **`nobeastmove`**。
7 本とも同一 run で実際に赤くなることを確認済み。

### 受入条件の達成状況

| # | 受入条件 | 結果 |
|---|---|---|
| 1 | `driver_s2_fold.js` 全緑 + 負のコントロール | ⭕ **`driver_grid_s2` へ §13 として内蔵**(新規ファイルは作らず、同じ絵を測る検出器を 1 本に保った)。**111/111**、負のコントロール **7 本**すべて赤 |
| 2 | `?s2fold=0` で 8 ノードへ完全復帰 | ⭕ mapDef 一致・(13i)/(13j) で機械検査 |
| 3 | 他 5 シナリオの mapDef が完全一致 | ⭕ golden 39 件 + `probe_bandit_map --mapdefs` |
| 4 | 罠 ≥1 / 玄室宝箱 ≥1 / 檻 2 / 獣 1 | ⭕ **罠 8 / 宝箱 9 / 檻 2 / 獣 1**(噂フラグ ON の母集団ガード付き) |
| 5 | 既存ドライバの非退行 | ⭕ 下表 |
| 6 | 実プレイ 3 周の完走率を数字で報告 | ⭕ 報告した(**改善せず 0/3**。下記) |
| 7 | changelog 1 行 | ⭕ |

**非退行 (全 12 本)**: `grid_s2` 111 / `graph_p6` 245 / `graph_p7` 60 / `grid_p3b` 43 /
`paint_blocked` 65 / `mapdef_step1` 208 / `doors_p6` 39 / `grid_p8` 56 / `grid_p9` 52 /
`graph_kinds` 66 / `spawn_not_on_gate` 51 / `encounter_mopup` 36 / `bgm_mine` 37 /
`heromark_signplate` 0 FAIL。

### ⚠ 受入条件 6 — **完走率は改善しなかった (0/3 のまま)**

| 腕 | #0 | #1 | #2 | 完走 |
|---|---|---|---|---|
| **既定 (畳んだ姿)** | defeat 111s R5 | defeat 100s R4 | defeat 105s R5 | **0/3** |
| `?s2fold=0` (8 ノード) | defeat 17s R2 | aborted R2 (stall×9) | aborted R3 (stall×9) | **0/3** |
| (参考) 着手前 = 畳む前 | defeat R9 | defeat R6 | defeat R8 | **0/3** |

⭐ **本件が解いたのは「絵が出てこない」であって「クリアできない」ではない。**
畳んだ後は **1 部屋目がそのまま盗賊団のアジト**なので、負けても必ずあの絵の上で戦う。
⛔ **難易度そのものは依頼書 #8 の宿題のまま**(敵 26 → 11 体に減ったが、まだ全滅する)。

### ⚠⚠ 新しく見えた既存の欠陥 — **n7 大部屋での間欠停止**(別チケット送り)

畳んだことで**毎回 n7 に入る**ようになった結果、#11 が出荷した大部屋に元からあった停止が
観測できるようになった。**畳み込みが作った欠陥ではない**(`?s2fold=0` の腕でも出る):

- 指紋: `sig = 39/16/9/2/n7/330/0` = タイル **(39,16)** / 生存敵 **9** / ノード **n7** /
  `hero.pathLen: 0`(= 目標へ経路が無い)。10 秒無進行 ×9 → run-timeout
- 頻度: **6 走行中 3 回**(既定 1/3・`?s2fold=0` 2/3)。**間欠**
- ⛔ **静的な配置の欠陥ではない** — 敵 9 体 + ボス + 檻の **12 タイルすべてが本番の
  `isTileWall` で床、入場から本番 `aStar` で 21〜48 歩で到達可**(実測)。
  つまり原因は配置ではなく**実行時**(丸太柵の門 = 1〜2 マスの隘路に敵の体が詰まって
  経路が消える、等)。⚠ #11 の「敵が閉じた扉に湧く」欠陥とは**別物**
- 撤退: `?s2fold=0`(ただしあちらの腕でも出るので回避にはならない)
