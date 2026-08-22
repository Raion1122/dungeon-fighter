# 手前の 1 体を倒しただけで休憩フェーズに入る (目の前の敵が戦闘に合流しない)

- **ステータス**: **承認済**(2026-08-23 ユーザー承認。未着手)
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
