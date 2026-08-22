# 手前の 1 体を倒しただけで休憩フェーズに入る (目の前の敵が戦闘に合流しない)

- **ステータス**: **完了**(2026-08-23。受入条件 1〜5 すべて緑 → 末尾「実装結果」節)
  ⚠⚠ **`index.html` の変更は別窓の #12 コミット `3cc3eaf` に紛れて入った**(相手が
  `git add index.html` のファイル単位 add を使い、同居していた本チケットの 5 hunk ごと
  取り込んだ)。未 push の段階で気づいたが、別窓が稼働中に履歴を切り直すのは相手の作業を
  壊しうるため、ユーザー判断で**そのままにした**。⭐ 教訓 = **同一ファイルを 2 窓が同時に
  触っている間は、ファイル単位 add でも安全でない**([[feedback_peer_session_concurrent_repo]])。
  `tavern.html` の更新情報 1 行も同じ理由で別窓のコミットに載せている。
- **発見**: 2026-08-23(ユーザーの実プレイ。スクリーンショット = 「英気を養った。再び前へ。」が
  出ているのに、画面内に HP バー付きの生存敵が 2 体、パーティのすぐ右に立っている)
- **調査プローブ**: `tools/probe_rest_premature.js`(本チケットで新設。受入条件は持たない調査用)

## 目的

**「まだ目の前に敵が立っているのに VICTORY → 休憩 → 行軍再開の演出が挟まる」を無くす。**

手段ではなく目的で言うと: *1 つの部屋の中で「見えていて・届く距離にいる」敵は、
1 回の戦闘で片付ける*。休憩フェーズは**本当に周りに敵が居なくなった時だけ**入る。

## 背景・現状(実測)

### 測り方

`tools/probe_rest_premature.js` を新設し、`setPhase("rest")` が走った**その瞬間**に

- そのエンカウントの終了ラウンド / 交戦していた敵の数
- **本番の `detectReinforcements()` の戻り値**(判定ロジックは 1 行も再実装していない)
- 周囲 14 タイルの生存敵の距離・`engagePx`・`hasLineOfSight`・`isEnemyVisibleToParty`
- 休憩明けに次の戦闘が始まるまでの時間

を読み出した。⚠ 50ms 間隔のページ内監視で採っている(休憩は数秒で明けるうえ、
その間にパーティが動くので 1 秒サンプルの 1 点読みでは周囲を取り違える)。

```
node tools/probe_rest_premature.js --scen goblin-mine    --speed 15 --max 300
node tools/probe_rest_premature.js --scen bandits-forest --speed 15 --max 300
```

### 実測結果 (2 シナリオ・休憩 13 回)

| | 廃坑 | 森 | 合計 |
|---|---|---|---|
| 休憩に入った回数 | 8 | 5 | 13 |
| 周囲 14 タイルに未参戦の生存敵がいた | 5 | 1 | **6** |
| **本番の `detectReinforcements()` が非ゼロなのに休憩へ落ちた** | 1 | 0 | **1** |
| 休憩明け **3 秒以内**に再戦闘が始まった | 3 | 1 | **4** |

決定的な 1 件(廃坑 n1・休憩 #3):

```
[休憩 #3] node=n1  終了ラウンド=2  交戦していた敵=1 体
  本番 detectReinforcements() が返した数 = 2 (ホブゴブリン、ゴブリンブルート)
  休憩明けに再戦闘まで = 0.2 秒
  ⚠ 未参戦のまま生きている敵 6 体 (うち 4 体は engagePx の内側)
    名前              距離px  タイル  engagePx  視線  視界
    ゴブリンブルート           120     1.2       400   o    o   ← 隣のマス
    ホブゴブリン             143     1.5       400   o    o   ← 隣のマス
    ゴブリンライダー           521     5.4       768   x    o
    ゴブリン               565     5.9       400   o    o
```

**本番の増援判定そのものが「2 体は合流すべき」と答えているのに、勝利判定のほうが
先に成立して休憩へ落ちている。** ユーザーのスクリーンショットはこれ。

もう 1 例(森 n7・休憩 #4)。`detectReinforcements()` は 0 だが、**視界には入っている**
盗賊アーチャーが 5.1 タイル先(`engagePx` は 1152 = 12 タイル)に立っていて、
2.8 秒後に再戦闘になっている:

```
    盗賊アーチャー            488     5.1      1152   x    o   ← 視界 o / 視線 x
```

### 真因(実測で確定した順)

#### ① 勝利判定が「参加者が全滅したか」しか見ておらず、周囲を一度も見ない ★本命

`index.html:19477` のラウンドループの while:

```js
while (!gameOver && hp > 0 && !escortWagonLost() &&
       (encounterEnemyIndices.some(i => enemies[i].alive) || wavesRemaining())) {
```

`encounterEnemyIndices` = **その戦闘に参加している敵**だけ。ここが空になった瞬間に
while を抜け、`index.html:19609` の `showBanner("VICTORY", 1200); setPhase("rest");` へ落ちる。
**周囲に未参戦の敵が居るかどうかは、この経路のどこでも一度も問われない。**

#### ② 増援を見る点が「ラウンド先頭」の 1 点しかない

`index.html:19480`:

```js
if (round > 1) {
  const reinforce = detectReinforcements();
```

- ラウンド**先頭**でしか見ない。ところがパーティは戦闘中も `playerAdvanceOneTile` で
  1 手番 1 タイル前進し、敵も寄ってくる。**ラウンドの途中で近づいてきた敵**は、
  そのラウンドの最後の一撃で決着すると**二度と評価されない**。
- `round > 1` なので、**1 ラウンドで決着した戦闘では増援判定が 0 回**になる。

上の休憩 #3 は「ラウンド 2 の先頭では 0 だったが、ラウンド 2 の途中で 2 体が
条件を満たすところまで来ていた」= まさにこの穴。

#### ③ 視界はパーティ全員・視線はリーダーだけ、という非対称(②の残りを説明する)

`detectEnemiesEngagedByRange`(`index.html:19060`)は

- 距離 … **リーダー中心** `(playerX+48, playerY+58)` から
- `hasLineOfSight(pCX, pCY, ex, ey)` … **リーダーから**
- `isEnemyVisibleToParty(e)` … **パーティ全員の視界**(`computeVisibleTiles` は
  主人公 + 生存仲間の和集合、`index.html:16113`)

の 3 つを AND する。**視界は全員なのに視線はリーダー 1 人**なので、
「パーティは見えているのに、リーダーが柱の陰にいるので合流しない」が起きる。
実測の森 #4 の盗賊アーチャー(`vis=o / los=x`・5.1 タイル・`engagePx` 1152)がこれ。

⚠⚠ ただし**全部が①②③のせいではない**。廃坑 #1 のゴブリン(4.1 タイル・`los=x`・`vis=x`)は
**霧の外で本当に見えていない**ので、除外は正しい。「見えていない敵に気づかず休憩する」のは
仕様どおり。**直すべきなのは「判定が合流すべきと言っているのに休憩する」ほう**。

### 副作用として効いていること(申し送り)

1 戦闘を N 回に分割すると、`index.html:19609` 以降の**立て直し処理が N 回もらえる**:

- 呪文スロット `maxSpellSlots × 25%` 回復(切上)
- `applyRoomClearHeal()`(`index.html:24640`)= **生存 PT 全員 HP +33%** + 最低位スロット +1
- `secondWindUsed = false`(セカンドウィンドの使用権が戻る)

つまり **本件を直すと、その部屋の難易度は確実に上がる**。数値の再調整はこのチケットでは
やらない(→ `2026-08-20_recruit-balance-retune.md` #8 の宿題へ合流させる)。

### 演出コスト(なぜ「気持ち悪い」か)

分割 1 回につき、ソース上の待ちだけで概算

- 休憩側: `sleepMs(900)` +(スロット回復 `450` × 人数)+ `500` + 回復 `300` + `sleepMs(700)`
- 再戦闘側: `sleepMs(1050)` + イニシアチブ `380` × ユニット数 + `sleepMs(600)`

= **おおむね 8〜12 秒**が丸ごと 1 回余分に挟まる(通常速度)。実測でも休憩明け
**0.2 / 0.8 / 2.8 / 3.4 秒**で再戦闘に入った回が 13 回中 4 回あった。

## 変更範囲

- 触る: `index.html` の `runEncounter` 内(増援合流の呼び出し点)と
  `detectEnemiesEngagedByRange` の**引数追加のみ**
- 触る: `tavern.html` の更新情報(changelog 1 行。`index.html` を触るので pre-commit フックが要求する)
- **触らない**: `detectEngaged()`(初期の交戦開始判定)。`RANGE` の `engagePx`。`CLASS_SIGHT`
- **触らない**: 隊商護衛のウェーブ状態機械(`escortWaveList` / `waveNext` / `spawnWave`)
- **触らない**: `applyRoomClearHeal` / スロット 25% 回復 / `secondWindUsed` の数値
- **触らない**: `round > 40` の安全ブレーキ

## 実装の方針(案。実装窓が鳥瞰してから決めてよい)

### STEP 1 — 増援合流を関数へ括り出す(挙動不変)

`index.html:19481` からの増援ブロック(バナー → 各敵の状態リセット → イニシアチブ →
`units.push` → `sortUnits()`)を、そのまま `mergeReinforcements(list, units, sortUnits)` へ
括り出す。**この段階では呼び出し点を増やさない**(挙動不変の段を先に置く作法)。

⚠ `units` / `sortUnits` は `runEncounter` のローカルなので**引数で受ける**
(`spawnGoblinChariot` / `spawnWave` と同型。`index.html:29919` のコメント参照)。

### STEP 2 — 「参加者が全滅した瞬間」にもう一度だけ増援を見る ★本命

`for (const actor of units)` を抜けた直後(`round++` の手前)に 1 点足す:

```js
/* ★ 参加者が全滅した瞬間にも増援を見る。ここが無いと while を抜けて VICTORY へ落ち、
 *   隣のマスに敵が立ったまま休憩フェーズに入る (2026-08-23 実測: 廃坑 n1 で
 *   detectReinforcements() が 2 体を返しているのに休憩へ落ちた)。
 * ⚠ ウェーブ防衛は wavesRemaining() が while を持たせているので手を出さない。 */
if (!MOPUP_OFF && !gameOver && hp > 0 && !wavesRemaining() &&
    !encounterEnemyIndices.some(i => enemies[i].alive)) {
  const late = detectReinforcements();
  if (late.length > 0) await mergeReinforcements(late, units, sortUnits);
}
```

- 判定式は `detectReinforcements()` **ただ 1 本**のまま(述語を 2 本にしない)。
- 合流できたら while 条件が真に戻るので、そのまま同じ戦闘が続く = VICTORY へ落ちない。
- `round > 1` のガードは**そのまま残す**(初手で `engagePx` を 160px 広げないため)。
  掃討側は round 1 でも通す。ここが真因②の核。
- 無限化しない: 合流した敵はその戦闘で倒されるし、`round > 40` の安全ブレーキが最終防壁。

### STEP 3 — 増援の視線だけパーティ基準へ広げる(真因③)

`detectEnemiesEngagedByRange(excludeSet, extraPx, partySight)` に第 3 引数を足し、
`partySight` が真のときだけ `hasLineOfSight` を**リーダー + 生存仲間の誰か 1 人**で見る。

- `detectReinforcements()` **だけ** `partySight = true` で呼ぶ。
- `detectEngaged()`(初期交戦)は **1 バイトも変えない**。
  ⚠ `index.html:18107` が名指しで警告している「交戦距離を広げると入場した瞬間に戦闘 =
  冒頭の 3 択 (EV-2) が消える」に触らないため。
- **距離の基準はリーダーのまま**(距離まで全員に広げると `engagePx` の意味が変わる)。

## 受入条件

1. **決定論の負のコントロール**(★これを最初に作る)。新規 `tools/driver_encounter_mopup.js` で:
   1. `?diag=1&intel=0` で起動 → `__graphRun.enter('n1')`(廃坑 n1)
   2. 敵を 2 体だけ残す(他は `alive=false`)。A をリーダーから 2 タイル、
      B を **`engagePx + REINFORCE_MARGIN_PX` の外**(8 タイル程度)へ `snapEnemyToTile` で置く
   3. `tryStartEncounter()` → **参加者は A の 1 体だけ**であることを assert(装置 assert)
   4. 50ms 監視で戦闘中に B を **1.5 タイル**へ `snapEnemyToTile` で寄せる
      (= 本番で「ラウンドの途中に敵が近づいてくる」ことの短縮版。`probe_boss_latch.js` と同じ手口)
   5. 期待値:
      - **修正後** … B が合流して戦闘が続き、`currentPhase === "rest"` になった時点で
        `detectReinforcements().length === 0`
      - **`?mopup=0`** … A が死んだ瞬間に `currentPhase === "rest"`、かつ B は 1.5 タイルで生存
        = **赤**。⚠ この赤が出ることを**実装前に 1 回実測**すること
2. **目的そのものの不変条件**(実プレイ)。`?autoplay=15` で廃坑を 1 周し、
   `setPhase("rest")` が走った全ての瞬間で `detectReinforcements().length === 0`。
   ⚠ 母集団ガード: 休憩が **3 回以上**観測されたこと(0 回なら測っていない)。
   ⚠ ウェーブ防衛シナリオ(`escortWaveList().length > 0`)はこの assert の対象外。
3. **調査プローブの再実行で ①が 0 件**になること:
   `node tools/probe_rest_premature.js --scen goblin-mine --speed 15 --max 300` の出力で
   「本番 detectReinforcements() が返した数」が **全ての休憩で 0**。
   ⚠ 「未参戦のまま生きている敵」が 0 になることは**要求しない**(霧の外の敵は残ってよい)。
4. **既存ドライバの非退行**(最低限これだけは回す):
   `driver_grid_p8` / `driver_grid_p9` / `driver_graph_p6` / `driver_bgm_mine` /
   `driver_bandit_hideout`(#11 で新設した 93/93)。
   ⚠ 戦闘が長くなるので、**時間窓を持つ assert が赤くなる可能性がある**。赤が出たら
   期待値を緩めず、まず「窓をまたいだだけか」を実測してから判断すること。
5. changelog を 1 行追記(`py tools/add_changelog.py "<b>…</b> — …"`)。
   ⚠ `--no-verify` での迂回は禁止。

## 撤退スイッチ

- **`?mopup=0`** … STEP 2(掃討合流)を切って従来どおりにする
- **`?mopupsight=0`** … STEP 3(増援の視線をパーティ基準へ)だけを切る

⚠ 両方 OFF にしたとき、`detectEnemiesEngagedByRange` の戻り値が現状と**恒等**であること
(スイッチを外すと赤くなる装置 assert を 1 本添える。「全緑で空振り」を避けるため)。

## やらないこと

- **初期交戦(`detectEngaged`)の距離・視界を広げること**。EV-2 の 3 択が消える(`index.html:18107`)
- **`engagePx` / `CLASS_SIGHT` の数値変更**
- **隊商護衛のウェーブ状態機械に手を入れること**(`wavesRemaining()` が真の間は素通し)
- **休憩演出そのものの短縮**(VICTORY バナー / スロット回復 / 行軍再開 の尺)。
  → 本件を直せば発生回数が減るので、まず回数で効くか見る。別チケット候補
- **難易度・XP の再調整**。回復の回数が減る = 難しくなる方向の変化は必至だが、
  数値は `2026-08-20_recruit-balance-retune.md`(#8)で**ペア比較で実測してから**動かす
- **`round > 40` の安全ブレーキの変更**

## 付録: 本チケットで新設した調査プローブ

`tools/probe_rest_premature.js`(受入条件を持たない**調査の道具**)

```
node tools/probe_rest_premature.js                                  # 廃坑を 1 周
node tools/probe_rest_premature.js --scen bandits-forest --runs 2
node tools/probe_rest_premature.js --qs mopup=0                     # 負のコントロール
```

判定ロジックは再実装していない(`detectReinforcements` / `getRange` /
`hasLineOfSight` / `isEnemyVisibleToParty` は本番の関数をそのまま呼ぶ)。

---

## 実装結果(2026-08-23 実装窓)

- **新規**: `tools/driver_encounter_mopup.js`(**36/36 PASS**)
- **変更**: `index.html` 5 hunk(19086〜19662 行)+ `tavern.html` の更新情報 1 行

### ⛔ 着手前の「赤」の実測(受入条件 1)

上のドライバを**実装より先に**書き、HEAD(= まだ `?mopup=0` が存在しない状態)へ当てた:

```
[rig]  A=ホブゴブリン @22,8 (313px)  B=ホブゴブリン @23,7 (438px)  PT@21,11
       engagePx=400 +margin=160
[rest] round=2  reinf=1 ["ホブゴブリン"]  bAlive=true  bTiles=1.5  participants=1
→ 26/29 PASS(装置 assert 7 本は 3 腕とも緑・§1 の 3 本だけが赤)
```

**本番の `detectReinforcements()` が「B は合流すべき」と答えているのに `setPhase("rest")` へ
落ち、B は 1.5 タイル(隣のマス)に生きたまま立っていた。** ユーザーのスクリーンショットの再現。

### ★ 起草時の設計から変えた 1 点(受入条件 1 の作り方)

依頼書は「**戦闘中に** B を 1.5 タイルへ寄せる」手順だったが、**寄せる方式は使わなかった**。

> 寄せる方式は「寄せた瞬間」と「**ラウンド 2 の先頭**」の競争になる。ラウンド 2 に到達すると
> 既存の `if (round > 1)` が合流させてしまうので、**修正前でも緑になる**(= 偽の緑)。

代わりに **A の HP を 1 にして静置**した。A はラウンド 1 で必ず落ちるので「参加者が全滅した
瞬間」が確実に来る一方、B は engagePx の外・engagePx+160 の内側に置いたままなので
`detectReinforcements()` は最初から B を返し続ける。**競争が原理的に無い。**

⚠ B は「A と同じ側」へ置く。戦闘中リーダーは `playerAdvanceOneTile` で A へ 1 タイル詰めるので、
反対側だと B が増援帯から押し出されて**測っていないのに緑**になる。

### 実装した 3 段(依頼書の方針どおり)

| STEP | 変更 | 備考 |
|---|---|---|
| 1 | 増援ブロックを `mergeReinforcements(list, units, sortUnits)` へ括り出し | **挙動不変を機械照合**(下記) |
| 2 | `for (const actor of units)` を抜けた直後に掃討合流を 1 点 | 判定式は `detectReinforcements()` **ただ 1 本**のまま |
| 3 | `detectEnemiesEngagedByRange(excludeSet, extraPx, partySight)` 第 3 引数 | `detectEngaged()` は **1 バイトも不変** |

STEP 1 の挙動不変は目視でなく**差分の集合演算**で確かめた
(`diff` の削除行と追加行を trim+sort して `comm -23`)。残った 7 行は
`reinforce` → `list` の改名 3 行・`const reinforce = ...` のインライン化 1 行・
シグネチャ 2 行・LOS 行 1 行で、**意図しない欠落はゼロ**。

### 実測(受入条件 2 / 3 / 4)

- **受入条件 2**(実プレイ不変条件): `?autoplay=15` で廃坑 1 周。`setPhase("rest")` の全ての瞬間で
  `detectReinforcements().length === 0`。母集団ガード = 休憩 **3〜5 回**観測(n0 / n1 の両方)。
- **受入条件 3**(調査プローブ再実行):

  ```
  [休憩 #1] node=n0  終了ラウンド=3  交戦していた敵=2 体   detectReinforcements() = 0   再戦闘まで 43.5 秒
  [休憩 #2] node=n1  終了ラウンド=9  交戦していた敵=7 体   detectReinforcements() = 0   再戦闘まで 55.8 秒
  [休憩 #3] node=n1  終了ラウンド=7  交戦していた敵=3 体   detectReinforcements() = 0
  → 休憩 3 回中、周囲 14 タイルに未参戦の生存敵がいたのは 0 回
  ```

  ⭐ 依頼書は「未参戦の生存敵が 0 になることは**要求しない**」としていたが、実測では 0 になった。
  ⭐ **休憩の回数そのものが 8 回 → 3 回へ減った**(1 部屋 1 戦闘へまとまった)。修正前に
  13 回中 4 回あった「休憩明け 0.2〜3.4 秒で再戦闘」は**消えた**(43.5 / 55.8 秒)。

- **受入条件 4**(既存ドライバの非退行): 依頼書指定の 5 本 + `driver_spawn_not_on_gate` の
  **6 本すべて緑・FAIL 0 行**。

  | ドライバ | 結果 |
  |---|---|
  | `driver_grid_p8` | 56/56 |
  | `driver_grid_p9` | 52/52 |
  | `driver_graph_p6` | 244/244 |
  | `driver_bgm_mine` | 37/37 |
  | `driver_grid_s2`(= 依頼書が「driver_bandit_hideout」と書いていた #11 の 93 本) | 93/93 |
  | `driver_spawn_not_on_gate` | 47/47 |

  ⭐ 依頼書は「戦闘が長くなるので時間窓を持つ assert が赤くなる可能性がある」と予告していたが、
  **1 本も赤くならなかった**。`driver_grid_p8` の §8(300 秒の autoplay 完走)も含めて素通し。
  ⚠ 依頼書の「`driver_bandit_hideout`」は**実在しない名前**だった(#11 で新設された実体は
  `tools/driver_grid_s2.js`)。

### ★ STEP 3 を単体で測る節を足した(依頼書に無い追加)

依頼書の受入条件は `?mopupsight=0` について「両方 OFF にしたとき恒等」しか要求していない。
しかし**それだけだと STEP 3 が丸ごと死んでいても全緑になる**(空振り)。そこで §5 を足し、
非対称そのものを作って測った:

```
[sight] tile=22,11  leaderTile=27,9  d=513px  vis=true  leaderOnly=false  withParty=true
        (?mopupsight=0 では withParty=false = リーダー基準と同じ)
```

⚠ この配置は `snapPlayerToTile` でリーダーを動かして作ったもので、**実プレイの隊列の再現ではない**
(自然発生は依頼書冒頭の森 n7 の実測が根拠)。測っているのは
`detectEnemiesEngagedByRange` の視線分岐ただ 1 つ。
⚠ 敵タイルの候補は `computeVisibleTiles`(:16140)と**同じ 2 条件**(円形の視界半径 `dr²+dc² <= R²`
と `hasLineOfSight`)で選ぶ。片方だけにすると、再計算が走った瞬間に見えなくなる
「作れない状態」を測ってしまう。

### 副作用の申し送り(→ #8)

**難易度は上がった。** 1 部屋の休憩が 8 回 → 3 回になった = `applyRoomClearHeal()`(生存 PT 全員
HP +33%)・呪文スロット 25% 回復・`secondWindUsed` のリセットを**もらえる回数がその分減った**。
数値の再調整は本チケットではやらない(`2026-08-20_recruit-balance-retune.md` #8 の担当)。
