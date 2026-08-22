# ボス到達ラッチが「戦闘中に帯を跨ぐ」と両方すり抜ける

- **ステータス**: 起草中(未承認)
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
