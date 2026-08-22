# ボス到達ラッチが「戦闘中に帯を跨ぐ」と両方すり抜ける

- **ステータス**: **完了 `24dbb60`**(2026-08-22 実装・検証済。末尾の「実装結果」節を見よ)
- **発見**: 2026-08-22(`driver_grid_p9` の周回中に実測)

## 目的

**グリクスを倒したなら、その前に必ずボス曲とボス到達ナレが鳴っている**状態にする。
いまは条件次第で、ボス部屋の演出が一度も出ないまま決着することがある。

## 背景・現状(実測)

`?autoplay=30&detour=tour` の 1 周で、次の実測が取れた:

```
282.6s p=38,20  latched=false  (玉座 49,21 までチェビシェフ 11 = 帯の外)
   … 戦闘 (8 秒ぶんログが飛ぶ)
290.7s p=39,20  latched=false
291.7s p=40,22  latched=false   ← ここで帯 (8) に入っている
292.7s p=41,22  latched=false
300.8s p=42,22  latched=false
302.8s p=46,21  latched=false
307.9s p=49,21  latched=false   ← 玉座タイルそのもの
309.9s cleared=true  latched=false  narrated=false
```

**ボス曲もボス到達ナレも一度も鳴らずにクリアした。**

ラッチ点は 2 つあるが、どちらもこの経路をすり抜ける:

1. `index.html:17303` 付近(heroAI の部屋マーキング)
   `bossGate = bigRoom ? bossApproachReachedNow() : firstEntry` を見る枝。
   ⚠ `heroAI()` は先頭で **`if (encounterActive) return;`**(`index.html` の heroAI 冒頭)
   なので、**戦闘中は 1 命令も走らない**。さらに `exploreAllyTurnRunning /
   exploreEnemyTurnRunning`・バックライン待ちでも早期 return する。
2. `index.html:19029` 付近(`tryStartEncounter`)
   2026-08-20 に P8 が足した補い。**新しい戦闘が始まる瞬間**にだけ見るので、
   **帯の外で始まった戦闘のまま帯へ押し込む**と一度も評価されない。

→ 「帯を跨いだ瞬間」を見ている点が、**どちらも戦闘の切れ目にしか無い**のが原因。

⚠ 常に起きるわけではない。非戦闘中に帯を跨げば 1 が正しく鳴る(同日の別の周回では
`(41,22)` で `enc="-"` のとき `mine_boss/inBoss` が正しく点いた)。**間欠**。

## 変更範囲

- 触る: `index.html`(ラッチ点の追加のみ)
- 触らない: `audio.js` / `BGM_FILES` / 曲そのもの(#4 `4090a99` の成果は 1 バイトも動かさない)
- 触らない: `BOSS_APPROACH_TILES`(8)、`bossApproachReachedNow()` の式

## 実装の方針(案。実装窓が鳥瞰してから決めてよい)

「戦闘の切れ目でしか見ていない」を直すので、**戦闘中も回る場所**に同じ述語を 1 本置く。
候補は runEncounter のターンループ、または `syncBossRoomFlag` を呼んでいる箇所。
⚠⚠ **述語は増やさないこと**。`bossApproachReachedNow()` を呼ぶだけにして、
判定式が 2 本にならないようにする(P8 の注記と同じ理由)。
⚠ ナレーション `narrate("boss_room_enter")` は**戦闘中には出さない**(P8 の既存方針)。
BGM とラッチだけを戦闘中にも立てる。

## 受入条件

1. `node tools/driver_grid_p9.js` が全 PASS(周回で `cleared` に至る)。
2. `node tools/driver_bgm_mine.js` が既存どおり全 PASS(廃坑 3 曲の切替が壊れていない)。
3. 新規 assert:**`dungeonCleared` に至ったなら `bossApproachLatched` が真である**
   を測るドライバ(既存 `driver_grid_p9` の §4 に足すのが素直)。
   ⚠ この assert は**現状では間欠的に赤くなる**。実装前に「赤くなること」を 1 回は
   実測してから直すこと(負のコントロールの代わり)。
4. 「戦闘中に帯を跨ぐ」経路を意図的に作った観測で、`bgm.id` がボス曲になること。

## 撤退スイッチ

既存の **`?bossapproach=0`** をそのまま使う(新しいスイッチは増やさない)。
`BOSS_APPROACH_OFF` が真のときは従来どおり `firstEntry` 判定へ恒等的に落ちること。

## やらないこと

- ボス曲そのものの差し替え・音量調整(#4 で決着済み)
- `heroAI` の早期 return の順序を変えること(バックライン待ちなどは別の目的を持つ)
- 玉座の護衛やボスの配置・索敵距離を動かすこと(→ 別チケット `2026-08-22_mine-s4-guard-fog.md`)

---

## 実装結果 (2026-08-22)

### 入れたもの

- `index.html` に **`latchBossApproachIfReached()`** を 1 本新設(`bossApproachReachedNow()` の直後)。
  「ラッチと `window.__inBossRoom` を立てる」だけの共通の書き込み点で、**距離の式は
  `bossApproachReachedNow()` ただ 1 本のまま**(依頼書の「述語を増やさない」に従った)。
- `runEncounter()` の**手番ループ**(`for (const actor of units)` の `await sleepMs(220)` の直後)へ
  `if (latchBossApproachIfReached()) bgm(currentBgmId() || "boss");` を 1 行。
  ナレーションは呼ばない(戦闘中には語らせない = P8 の方針を維持)。
- `tryStartEncounter()` の既存ラッチ点も同じ共通関数へ畳んだ(条件も代入も同じなので恒等)。
  → `bossApproachLatched` の書き込み点は「初期化 / heroAI / 共通関数」の 3 か所のままで増えていない。

### 依頼書からの逸脱・追記

1. **⚠ 受入条件 3 の「実プレイで赤を 1 回実測」は、決定論的な負のコントロールへ置き換えた。**
   新規プローブ `tools/probe_boss_latch.js` が「帯の外で始まった戦闘のまま帯へ押し込む」状態を
   シームで作る。**修正前の `index.html`(HEAD `567fa98`)を `--index` で配ると毎回赤**、
   作業ツリーでは毎回緑。実プレイ 1 周は 350〜560 秒・出現率は 8 周に 1 周程度なので、
   8〜10 周まわす代わりにこちらを正典にした(実プレイ版の (4e) はドライバ側に別途足してある)。
2. **⚠⚠⚠ 最初に書いたプローブは「修正前でも緑」だった**(2026-08-22 に実際に踏んだ)。
   「ラッチが立った瞬間に `encounterActive` が真か」だけを見ていたが、`tryStartEncounter` は
   **ラッチした直後に同期で `runEncounter` を呼んで `encounterActive = true` にする**ので、
   **帯の中で新しく始まった戦闘**でも `enc=true` に見えてしまう。
   → **戦闘の同一性 `encounterStartedAt`**(`runEncounter` の先頭で 1 戦闘 1 回だけ書かれる)を
   ラッチ記録に載せ、「押し込んだときと同じ戦闘 ID か」を要求して初めて赤くなった。
   ⭐⭐⭐ **「戦闘中だったか」は「同じ戦闘だったか」ではない。**
3. ラッチ点は**ラウンド先頭ではなく手番ごと**に置いた。最後の 1 手番で帯へ入って決着すると
   ラウンド先頭の点は二度と回らず、しかも**ボス撃破後は `bossApproachReachedNow()` が false へ戻る**
   (生存中のボスしか見ない)ので、ラウンド粒度では取りこぼす。
4. 依頼書が指した行番号 (`index.html:17303` / `:19029`) は実測とほぼ一致していた
   (heroAI の枝 = 17303/17304、`tryStartEncounter` = 19015、そのラッチ点 = 19029)。
   **主張した真因も 2 点とも実測で成立**した(#10 と違い訂正は不要)。
   なお真因の本質は「戦闘中もパーティは `playerAdvanceOneTile` で 1 手番 1 タイル前進する」
   ことで、これが「戦闘中に帯を跨ぐ」を起こしている。

### 検証

| コマンド | 結果 |
|---|---|
| `node tools/probe_boss_latch.js --index <修正前の index.html>` | **2/5 PASS = 期待どおり赤**((c)(d)(e))。ラッチは押し込んだ戦闘 ID `36330.2` ではなく**約 24 秒後の別の戦闘 `60720.8`** で立った = `tryStartEncounter` 経路 |
| `node tools/probe_boss_latch.js`(作業ツリー) | **5/5 PASS**。ラッチ時 `enc=true` / 戦闘 ID が押し込み時と一致 / `seamBgm=mine_boss` かつ `playBgm` へ実際に渡ったのも `mine_boss` / `narrated=false` |
| `node tools/driver_bgm_mine.js` | **37/37 PASS**(廃坑 3 曲の切替・他 5 シナリオ恒等・`?minebgm=0` すべて既存どおり) |
| `node tools/driver_grid_p9.js` | **52/52 PASS**。(4c) は 350.9s で cleared、新規 (4e) は「cleared=true / 周回中に見た latched=true / 初出 310.4s」 |
| `node tools/driver_grid_p8.js` | **54 PASS / 1 FAIL**。ただし (6a2) は **HEAD `567fa98` の素の worktree でも同じ 54/1**、FAIL 行も完全一致 = **既存の赤**(下記) |

### 新しい道具

- `tools/probe_boss_latch.js` — 「戦闘中に帯を跨ぐ」を決定論的に作るプローブ。
  `--index <path>` で**別版の index.html を配れる**ので、機能が入る前のコミットを
  worktree へ展開しなくても負のコントロールが回せる。
- `tools/driver_grid_p9.js` §4 に **(4e)**「クリアしたならボス到達ラッチが立っている」を追加。
  実プレイ側の目的そのもの。⚠ 間欠事象なので**この 1 本だけを負のコントロールにしない**
  (決定論的な赤はプローブ側が持つ)。

### ⚠ 見つけた既存の赤(自分由来ではない・別コミットで回収)

`driver_grid_p8` の **(6a2)「そのとき BGM はシーン曲のまま」** が期待値を `'dungeon_normal'` と
直書きしており、**#4 `4090a99` で廃坑 n1 のシーン曲が `dungeon_normal` から `mine_depths` へ
変わった時に golden を更新し忘れていた**。HEAD `567fa98` を素の worktree へ展開して同じ
ドライバを回すと **54 PASS / 1 FAIL・FAIL 行まで完全一致**したので、#9 由来でないことを
実測で切り分けた。→ 曲名を写経せず「**`currentBgmId()` が `sceneBgmId()` と一致する**」=
測りたかった不変条件へ言い直して**別コミット**で回収した。

⭐⭐ **golden の更新し忘れは今回も起きていた。** #4 のような「表を差し替える」変更を入れたら、
その表を読む**他のドライバの直書き期待値**を必ず洗うこと。
