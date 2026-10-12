# #91 測定器の揺れ回収 — 乱数で空振りする装置 7 本を決定的にする(tools のみ)

- **起草**: 2026-10-12(起草窓) / **ステータス**: **承認済**(2026-10-12 ユーザー承認)
- **触るファイル**: `tools/probe_boss_latch.js` / `tools/driver_speech_engine.js` / `tools/driver_monsters_kobold.js` / `tools/driver_monsters_hobgoblin.js` / `tools/driver_mine_wall.js` / `tools/verify_run_chronicle.js` / `tools/verify_mage_hand.js` / 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: `index.html` / `tavern.html` / `audio.js` / `js/*`(**読むだけ**)。2026-10-12 時点で作業ツリーは clean・並走なし。
- 新しいポートの base = **10623**(§8 で 10623〜10627 を使う。次の base = **10628**)

---

## 1. 目的

#87〜#89 の母集団走査で、毎回「緑→赤」の切り分けに時間を食っている本が 7 本ある。どれも**本番の欠陥ではなく、装置が乱数で観測し損ねる**型
(影のツリー = 変更前でも同じ型で赤)。走査のたびに交互 5 対で「帰属 0」を証明し直すコストを払っているので、装置を決定的にして揺れを根から消す。

**ユーザー決定(2026-10-12)**:

- #87/#88/#89 の別チケット候補のうち、測定器の揺れ 7 本を **1 枚にまとめて** tools だけで直す(triage `project_ticket_triage_after_89`)。
- ⭐ 不採用: 「確率赤(`NEG_MAYBE`)として許す」「赤なら数回やり直す」で済ませる案 —— 盲点が恒久化するか、所要が倍化する。**乱数の源を装置の側から止める**のを第一とし、止められないときだけ次点を使う(各節に書いた)。
- `field_step6` Part C(`?graph=auto` の前進)は**別チケット**(真因の調査から要るので単独)。

---

## 2. 着手前の実測(起草窓が本番コードと実走で確かめた事実・基準 `52c7dbe`)

⭐ 7 本とも**素で実走して揺れを再現 or 色を記録**し、真因の行を `index.html` で特定した。修正案は起草窓の scratchpad で試作して素の緑と負のコントロールの赤まで確かめてある(§2-8)。

### 2-0. 今の色(HEAD `52c7dbe`・素・順番に実走)

| 本 | 既定 port | 1 回の所要 | 今の色 | 赤の check |
|---|---|---|---|---|
| `probe_boss_latch` | 9075 | 約 59 s | **0/3 緑**(毎回 1/5 PASS) | (b)(c)(d)(e) |
| `driver_speech_engine` | 8796 | 14〜23 s | **1/3 緑**(17/17・16/17・16/17) | (4) ±8px(maxDiff 9.0 / 8.1px) |
| `driver_monsters_kobold` | 8798 | 7〜11 s | 3/3 緑(別途 12 回中 1 回赤) | (d) maxPack=0 |
| `driver_monsters_hobgoblin` | 8796 | 21〜129 s | **1/3 緑**(14/14・12/14・12/14) | (e) entries=0 ×1 / (d) pack・disc ×1 |
| `driver_mine_wall` | 9080〜9085 | 約 200 s | 2/2 緑(別 probe 3 回中 1 回乱入なし) | (4z)(4z2) |
| `verify_run_chronicle` | 8897 | 170〜205 s | **2/3 緑**(73/73・73/73・71/73) | (1z1)(1c) `{"before":4,"touched":0,"after":4}` |
| `verify_mage_hand` 素 | 10514 | 138 s | 1/1 緑(32/32) | — (`--negative` は約 31〜33 分・走らせていない) |

⚠ `probe_boss_latch` は #89 の記録(本番 3/5 緑)より悪い。`driver_speech_engine` は #88 では camXレンジ側の赤、今回は ±8px 側の赤 —— **同じ真因から両方の色が出る**(§2-2)。
⚠ 揺れる率は小さい数での観測。**率を受入の固定値にしない**。

### 2-1. `probe_boss_latch` (b) — 押し込みを滑走の書き戻しが上書きする

- 押し込み `tools/probe_boss_latch.js:237` `snapPlayerToTile(tx, ty);` / (b) の assert `:284-285`(値は待ちループ `:250-276` の最後の `post.reached`)。
- 真因: 押し込んだ瞬間(戦闘開始から 44ms)は**探索の 1 タイル滑走が途中**。`heroSlideOneTileExplore`(`index.html:19784-`)の `slideAnim` コールバック
  `index.html:19795-19796` `playerX = x; playerY = y; playerMovingThisFrame = true;` が次の rAF で元の位置へ書き戻す。
  `tryStartEncounter`(22154)は `heroSliding` を見ないので滑走中にも戦闘が始まり、`HERO_SLIDE_MS`(19558)= 最大 380ms 書き戻しが続く。
  戦闘中の前進(`playerAdvanceOneTile` 21202 → 21248-21249)も同じ型。ラッチは手番の終わり(`latchBossApproachIfReached()` 22644)にしか評価されないので、戻った後では立たない。
- 計装トレース: `{t:0, p:"47,19", hs:true} → {t:0, p:"23,11", hs:true} → … 5.9 秒後に主人公の手番で 27,12 へ`。

### 2-2. `driver_speech_engine` (4) — 測定が探索→戦闘の境目に掛かる

- ナッジ `tools/driver_speech_engine.js:210` `playerX += d` / 測定 `:212-227` / 逆向き `:234-239` / camXレンジ `:243-250` / ±8px `:251-253`。
- 真因 2 つ:
  1. 戦闘中は `camFocus` がカメラを握る(`computeCameraTarget` 7767- の 7782 `if (camFocus) cx = camFocus.x - …`)。`camFocus` は戦闘開始 22343・手番ごと 22609 の `focusCameraOn`(8107)で置かれ、戦闘終了 22758 まで null に戻らない → **camXレンジの赤**(#88)。
  2. 戦闘の前進が `playerX` を書き戻す(21248-21249)→ 45px ずつ増えず、描画と読み取りのずれで **±8px の赤**(今回)。
- 母集団(`goblin-mine&autoplay=15&graph=0`)の時間割: 2.5s 既に戦闘 / **探索は 3.4〜7.5s だけ** / 7.5s から戦闘 / 39.9s で gameOver(Lv1 は全滅)・以後も phase=combat。(1)〜(3) に約 6 秒かかるので (4) の開始が境目に重なる。
- ⚠⚠ **「探索を待つだけ」の素直な案は 3/3 失敗**(待つ間に全滅して探索へ戻らない)⇒ Lv10 の種が要る。

### 2-3. `driver_monsters_kobold` (d) — 先に仲間が倒れて隣が空く

- 配置 `tools/driver_monsters_kobold.js:202` `CLUSTER`(隊長 (25,13) の周りに 8 体)/ ループ `:214`(320 回・`maxPack === 2` で抜ける)/ 赤 `:220` / 集計 `aggProbe :89-100`。
- 判定本体 `nearbyAlliedEnemies` `index.html:28350-28364`。隊長への攻撃 36107 / 仲間への攻撃 36349、プローブ書き込み 36110 / 36352。
- 真因(素で 12 回): 赤の 1 回は最初の攻撃が `ally:p0d0@3557ms [x,x,5,x,x,x,5,5]` = コボルドの手番の時点で 8 体中 5 体(hp5 の下位)が倒れ、狙った仲間の隣に味方の敵が居ない → そのまま全滅し窓が閉じる。triage の「maxPack=2 が 3/5」と #89 の「maxPack=0」は同じ現象。

### 2-4. `driver_monsters_hobgoblin` (e)/(d) — AC を参照しない手段で先に倒される

- 配置 `tools/driver_monsters_hobgoblin.js:238` `ISOLATED = [['hobgoblin', 31, 12]]`(**試行 1 回だけ**)/ ループ `:249`(最大 48 秒・`iAc.n >= 3`)/ 赤 `:255`、`:256-257`(minAc/maxAc === 16)。
- ⚠ `:258` の「pack/disc が 0」は**記録 0 件でも緑**(空振りで緑)。
- 真因: `__acProbe` は `effectiveEnemyAc`(`index.html:24162-24178`・push 24174)= **パーティが攻撃ロールを振った時だけ**積まれる。素 10 回中 acN=0 が 3 回 = 盗賊のシャドウステップ CRIT ×2 / 魔法使いのマジックミサイル(必中)×1 で開戦直後に倒していた。(d) の揺れ(`atk=1 maxPack=0 maxDisc=0`)も同じ根。

### 2-5. `driver_mine_wall` (4z)(4z2) — 70% 超から 1 ラウンドで倒し切ると戦車が出ない

- 観測ページ `tools/driver_mine_wall.js:703` `bootPage(browser, PORT, '?autoplay=30&intel=1', playErrs)` / ループ `:706-716` / (4z) `:722-724` / (4z2) `:725-728` / プローブ初期化 `:187-196`。
- 真因: `shouldSpawnChariot`(`index.html:34999-35006`)の `return king.hp <= king.maxHp * CHARIOT_HP_TRIGGER;`(35005・0.70 = 34968)を**ラウンド開始時の 1 点だけ**見る(ラウンドループ 22568-22571・ラッチ 22536)。probe 3 回中 1 回 = `R1 45 → R2 開始 45(>70%)→ 同ラウンド中に 8 → 0` で乱入なし。
- 既存の `--negative` §5 の 5 変異(noring / ringall / centeronly / nofallback / nomass)に **§4 を担当する変異は無い**。
- `applyGrixEnrage`(27717)が戦闘前に `hp = maxHp` へ戻す ⇒ **削るのは戦闘開始後**でなければ効かない。

### 2-6. `verify_run_chronicle` (1z1)(1c) / (2z3)(2a) — 待つと触るの間の隙 / 6 秒固定窓

- `pollUntil :403-412`(時間切れでも失敗にしない)/ arm A `:441-455`(1500ms 間隔)/ cage と (1z1)(1c) `:483-503`(生きた敵だけ `alive=false`。0 体なら touched=0)/ `waitEncounter :800-804`(**盤面の全敵**を数える)/ `:842-847` の `sleep(6000)` 固定窓(845)/ (2z3)(2a) `:858-866` / 881 にも同じ 6 秒((2c) の窓)。
- 真因:
  - (1z1)(1c): arm A の 1 回の待ち(1500ms)の間に部屋の最後の敵が倒れる(実測 `kills 4 / deaths 4`)。撃破記録は `defeatEnemy` の 17941 `RunChronicle.kill(...)` だけ。
  - (2z3)(2a): ① 6 秒はほぼ 1 ラウンド(関所 `tickCordonZones` 22563・ラウンドごとの `sleepMs(650)` 22559)。与ダメ 17 / 173 / 55 = 全員外す窓なら 0(過去の赤 `boardEnemyLoss=0` と一致)。② `encounterActive = true`(22328)は休憩後の finally 22756 まで真、ラウンドの while(22549-22550)は `encounterEnemyIndices`(21393)を見る ⇒ 800-804 は勝った直後の休憩中を「交戦中」と誤認し得る(`verify_sheet_equip.js:52` に同じ注記)。
- 既存の `--negative`(N1〜N8・子プロセスで 1 本ずつ・port = PORT+1+i)あり。

### 2-7. `verify_mage_hand` 変異 `escapeon` — 自然脱走 20% が手のダイアログと競争する

- 変異 `tools/verify_mage_hand.js:187-189`(`if (cage.noAutoEscape) continue;` を殺す)/ 担当 `:230` `NEG_EXPECT.escapeon = ['(4a)']`・`:244` `NEG_PREDICTED` / 判定 `:1062-1071`(担当と**完全一致**のみ許す・1066)/ (3a)(3c) の実戦闘 `:651-689`(主人公を檻から約 430px・`tryStartEncounter()`・`clickChoice(p, HAND_NAME, 45000)`)/ (4a) `:692-712`(別ページで `Math.random = () => 0`)。
- 真因: 檻の `setInterval`(`index.html:26117-26166`)は `encounterActive` 中・`dialogPaused`(14839)でない時、戦闘開始(22331)から 5 秒後に 5 秒ごと判定 → 26156 `if (cage.noAutoEscape) continue;` → 800px 以内なら 26163 `Math.random() >= CAGE_ESCAPE_CHANCE`(20%)で `openCage`。escapeon 下では開戦の演出(5 秒超)の間に当たると手の口 `tryMageHandInCombat`(22594)より先に檻が開き、`dlg:null・asked:["calm"]` で (3a)(3c)(6a) が連れ赤(約 1/5・#80 K26)。
- `_lastCageEscapeCheck`(26116 `let`)へ書くのは本番では 26147 だけ・戦闘開始で書き戻されない(`encounterStartedAt` は 22331 で上書きされるので使えない)。
- 確率赤 `NEG_MAYBE` を中身入りで持つ本: `verify_quest_draw.js:170` / `verify_tower_mother.js:192`。verify_mage_hand は持たない。

### 2-8. 修正案の試作結果(起草窓 scratchpad・本番ファイルは未編集)

| 本 | 試作の素 | 負のコントロール |
|---|---|---|
| `probe_boss_latch` | **3/3 で 5/5 PASS**(held=47,19・slidingAtPush=false・ラッチは同じ戦闘 ID) | `24dbb60^:index.html` を `--index` で配ると (a)(b) 緑・**(c)(d)(e) だけ赤**(2/5) |
| `driver_speech_engine` | **3/3 で 18/18**(camXレンジ 205〜215px・maxDiff 0.0・phases=eeeeee・所要 47〜67s) | `updateSpeechBubbles` の `b.el.style.left = SX(a.x) + "px";`(1 件)を最初の座標に固定 → camX 緑のまま **±8px だけ赤**(maxDiff 71.8)。⚠ この回だけ (7) `__diag` も赤(`combat-no-round, combat-stall`)= §8 の宿題 |
| kobold / hobgoblin | HP 999 注入で **8/8 観測成立**(kobold は最初の攻撃が pack=2 / hob は acN 3〜7・maxAc=16・反撃 6/8) | — (変異は §8 で新設) |
| `driver_mine_wall` | 王を 69% へ削る注入で **3/3 乱入・3/3 クリア・体の壁 0**(140〜216s) | — (変異 `nochariot` を §8 で新設) |

試作物(参考・この窓のセッション scratchpad。消えても依頼書の §4〜6 だけで実装できる):
`C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\5bdd1f0a-f68c-4358-9107-d098f4eabe5c\scratchpad\`
(`fix_bl.js` / `fix_sp2.js` / `mk_fix.py` / `mk_sp2.py` / `probe_trait.js` / `probe_chariot.js` / `index_pre9.html`)

### 2-9. 写しの有無(直しの波及)

- `__chLedger` / `armGate` / `waitEncounter` / `touched < 3` → `verify_run_chronicle` 以外 **0 件**。
- `playerX += d` / `camSpan` / `camXレンジ` → `driver_speech_engine` だけ。
- `__traitProbe` → kobold・hobgoblin の 2 本 / `__acProbe` → hobgoblin だけ / `__chariotProbe` → mine_wall だけ。
- `_lastCageEscapeCheck` → `verify_mage_hand.js:700` だけ。`noAutoEscape` は `driver_grid_s2.js:212` が n7 の檻の行をアンカーに持つ(足す行は変異アンカーの文字列を含まない = PEER_DRIVERS の重なり検査に触れない)。
- `snapPlayerToTile` を呼ぶ tools は 7 本あるが、どれも同期の配置探索で「戦闘中に押し込む」装置の写しではない。

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`。本チケットは `tools/*` だけ ⇒ **鳴らない・changelog 不要**。
⛔ 直しのために本番ファイルへ計測シームを置かない(CLAUDE.md の方針)。全部ページへの外からの注入で済むことを §2-8 で確認済み。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/probe_boss_latch.js` | 押し込み前に滑走待ち + (b) を「押し込み直後に 3 フレーム残る」装置へ言い直し(§4-1) |
| `tools/driver_speech_engine.js` | Lv10 の種 + 探索中に一時停止して測る + 装置 assert + `--negative` 新設(§4-2) |
| `tools/driver_monsters_kobold.js` | HP 999 注入 + 装置 assert + `--negative` 新設(§5-1) |
| `tools/driver_monsters_hobgoblin.js` | HP 999 注入((d) と (e) の両配置)+ 装置 assert + `--negative` 新設(§5-2) |
| `tools/driver_mine_wall.js` | 開戦後に王を 69% へ削る + (4z3) 装置 + 変異 `nochariot`(§5-3) |
| `tools/verify_run_chronicle.js` | 待つと触るを同じ evaluate に / `waitEncounter` を交戦中の敵で / 固定 6 秒を伸びる窓へ(§6-1) |
| `tools/verify_mage_hand.js` | (3a) の間だけ自然脱走の判定時刻を止める 1 行(§6-2) |

⛔ `index.html` / `tavern.html` / `audio.js` / `js/*` は**開いて読むだけ**。

---

## 4. STEP1 — 位置とカメラの競争(boss_latch / speech_engine)

### 4-1. `probe_boss_latch`

```js
// 押し込みの直前(:223 の前): 探索の滑走と戦闘の前進が終わるのを待つ
await page.waitForFunction('!heroSliding && !playerMovingThisFrame', { timeout: 10000, polling: 'raf' }).catch(() => {});
const moved = await page.evaluate(async () => {
  // …(既存の tx,ty の選定)…
  const sliding = heroSliding;
  snapPlayerToTile(tx, ty);
  for (let k = 0; k < 3; k++) await new Promise(r => requestAnimationFrame(r));   // 3 フレーム跨いでも残るか
  const held = Math.floor((playerX + 48) / TILE_SIZE) + ',' + Math.floor((playerY + 58) / TILE_SIZE);
  return { to: tx + ',' + ty, held, sliding, reachedNow: window.__graphRun.bossApproach().reached };
});
check('(b) 装置: 押し込んだ位置が 3 フレーム後も残り、帯の中に居る',
  moved.held === moved.to && !!moved.reachedNow, 'to=' + moved.to + ' held=' + moved.held + ' slidingAtPush=' + moved.sliding);
```

- ⛔ (c)(d)(e)(本命 = ラッチが同じ戦闘 ID で立つ)の主張は変えない。

### 4-2. `driver_speech_engine`

```js
// ページを開く前(:107 の Q の前): 待つ間に全滅しないよう Lv10(probe_boss_latch と同じ種)
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {} });

// (4) の頭: 探索中を見つけたら、同じ evaluate の中で時間を止める
let explored = true; const t0 = Date.now();
for (;;) {
  const ok = await page.evaluate(() => {
    if (gameOver || currentPhase !== 'explore' || encounterActive || camFocus || dialogPaused || skillCheckActive) return false;
    dialogPaused = true; return true;   // moveEnemies 先頭(19091)で heroAI・敵の移動・tryStartEncounter(呼び口 19096 だけ)が止まる
  });
  if (ok) break;
  if (Date.now() - t0 > 120000) { explored = false; break; }
  await sleep(100);
}
await page.waitForFunction('!heroSliding', { polling: 'raf', timeout: 10000 }).catch(() => {});
// ナッジ: moveEnemies が止まっている(19302 の updatePositions も中にある)ので本番の入口を自分で叩く
await page.evaluate((d) => { playerX += d; updatePositions(); }, dir * 45);
// …(既存の測定)…
await page.evaluate(() => { dialogPaused = false; });
check('(4-装置) 探索中・戦闘外で測った (全サンプル phase=explore)', explored && samples.every(s => s.phase === 'explore'),
  'explored=' + explored + ' phases=' + samples.map(s => (s.phase || '?')[0]).join(''));
```

- ⚠ 所要が 14〜23s → 47〜67s に延びる(次の探索を待つ)。
- ⚠ 種で (1)〜(7) の母集団も Lv10 になるが、どれも勝敗に依存しない check(§2-9)。

---

## 5. STEP2 — 先に倒し切られる型(kobold / hobgoblin / mine_wall)

### 5-1. `driver_monsters_kobold`(`:208` の evaluateOnNewDocument の中に足す)

```js
const iv = setInterval(() => { try { if (enemies.length) {
  for (const e of enemies) { e.hp = e.maxHp = 999; }   // 先に倒されない(HP 999 はスリープの HP プールにも掛からない)
  window.__pumped = enemies.length; clearInterval(iv); } } catch (e) {} }, 10);
```

- 裸の `enemies` は `index.html:14399` の `let`(注入関数から読めることを実測済み)。
- 装置 assert を足す: `(d0) 装置: 配置した全敵の HP を吊り上げた  __pumped === CLUSTER.length`。

### 5-2. `driver_monsters_hobgoblin`

- 同じ注入を `:213`((d) の密集配置)と `:241`((e) の孤立配置)の両方へ。装置 assert も両方へ。
- これで `:258`(pack/disc=0)が実際の反撃記録の上で測れる。⭐ 空振り緑を塞ぐため `:258` に「反撃記録 ≥ 1」を AND する(実測 6/8 で記録あり ⇒ 塞ぐなら観測を待つループ `:249` の抜け条件にも足す。所要の上限 48 秒は維持)。

### 5-3. `driver_mine_wall`(`:703` の直後・`bootPage` は変えない)

```js
await play.evaluate(() => { const iv = setInterval(() => { try {
  if (!encounterActive || window.__kingCut) return;
  const ki = encounterEnemyIndices.find(i => enemies[i].alive && enemies[i].type === 'goblinKing');
  if (ki === undefined) return;
  const k = enemies[ki];
  window.__kingCut = { before: k.hp, max: k.maxHp, chariotBefore: (window.__chariotProbe || []).length };
  if (k.hp > k.maxHp * 0.70) k.hp = Math.floor(k.maxHp * 0.69);   // applyGrixEnrage(27717)が戦闘前に満タンへ戻すので開戦後に削る
  clearInterval(iv); } catch (e) {} }, 10); });
```

- `runEncounter` は 22334 で `encounterEnemyIndices` を立ててから演出で待つ ⇒ **ラウンド 1 の判定より前に必ず削れる**(実測で latchAt はラウンドループ開始前)。
- 装置 assert `(4z3)`: `__kingCut` がある && `chariotBefore === 0`(70% 以下になる前は出ていなかった)。
- 判定は本物の `shouldSpawnChariot` を通る ⇒ 乱入経路が壊れれば (4z) は赤のまま。

---

## 6. STEP3 — 窓と乱数の競争(run_chronicle / mage_hand)

### 6-1. `verify_run_chronicle`

```js
// (1z1)(1c) :483〜 — 生きた敵を待つのと触るのを同じ evaluate の中で(待つ間に倒される隙を作らない)
const cage = await page.evaluate(async () => {
  const t0 = performance.now();
  while (!enemies.some(e => e && e.alive) && performance.now() - t0 < 60000)
    await new Promise(r => setTimeout(r, 200));
  const out = { waitedMs: Math.round(performance.now() - t0) };
  out.before = RunChronicle.snapshot(null).kills;
  let touched = 0;
  for (let i = 0; i < enemies.length && touched < 3; i++)
    if (enemies[i] && enemies[i].alive) { enemies[i].alive = false; touched++; }   // 同期 = ゲームが割り込まない
  out.touched = touched; out.after = RunChronicle.snapshot(null).kills;
  return out;
});
// (1z1) の判定はそのまま。60 秒待っても 0 体なら本当に装置が壊れている = 赤のままでよい
```

```js
// :800-804 — 数えるのは交戦中の敵だけ
try { n = encounterEnemyIndices.filter(i => enemies[i] && enemies[i].alive).length; } catch (e) {}

// :842-847 — 固定 6 秒をやめ、敵の HP が減るまで窓を伸ばす(上限 8 窓 = 48 秒)
const p0 = await armGate(page);
const D0 = await page.evaluate(() => window.__chLedger());
let D1 = D0, p1 = null, win = 0;
for (; win < 8; win++) {
  await releaseGate(page); await sleep(6000);
  p1 = await armGate(page);
  D1 = await page.evaluate(() => window.__chLedger());
  if (D1.enemyN !== D0.enemyN || D1.enc !== true || D0.enemyHp - D1.enemyHp >= 1) break;   // 入れ替わりは (2z2) が捕まえる
}
check('(2z5) [装置] 関所に 2 回とも停まれた', !!(p0 && p0.done && p1 && p1.done), JSON.stringify({ p0, p1, windows: win + 1 }));
```

- (2a) の帳尻(`dDealt === dEnemyLoss`)は関所から関所までのどの窓でも成り立つ ⇒ 窓を伸ばしても主張は弱くならない。
- 881 の (2c) の窓は任意(今回の赤ではない。直すなら同じ形)。
- ⛔ 既存の `--negative` N1〜N8 の担当表(`:120-`)は変えない。

### 6-2. `verify_mage_hand`(`:651` の E0 の evaluate の先頭・`tryStartEncounter` の前に 1 行)

```js
_lastCageEscapeCheck = Infinity;   // (3a) の間は自然脱走②の 5 秒判定を走らせない(now - Infinity < 5000 で即 return)。
                                   // 素では noAutoEscape で元々開かない = 素の挙動は不変。escapeon の担当 (4a) は別ページ(:692-)= 検出力も不変
```

- ページは (3a) の後に `closePage` するので戻し不要。(4a) は新しいページ = 初期値 0 から。`HIT('escapeon')` は (4a) で到達 ⇒ 「注入行の実行 > 0」も保たれる。
- ⭐ 不採用: `Math.random` 固定((3a) は実戦闘 = d20・伝承・隠密・ドロップが同じ乱数を引き、(3c) の順序の主張まで変わる)/ `NEG_MAYBE` で (3a)(3c)(6a) を確率赤に(本当の漏れも黙って通す。乱数の源を止められない時の最後の手)。
- ⛔ 完全一致の判定(`:1066`)は緩めない。

---

## 7. 撤退スイッチ

- 本番の挙動は 1 バイトも変えないので**ゲーム側の撤退スイッチは無い**。撤退 = 該当 tools のコミットを `git revert`。
- 各本の直しは**コミットを本ごとに分けてもよい**(1 本だけ戻せるように)。

---

## 8. 受入条件

測り方の方針: 新しい総合ドライバは作らない。**直した 7 本それ自体**を素で繰り返し走らせて揺れが消えたことを示し、新設の変異で「本物が壊れたら赤くなる」ことを示す。

### §0 装置(空振りしていないこと)

- **(0a)** 足した装置 assert が全部緑で、その値が実際に観測している: boss_latch `slidingAtPush=false`・`held===to` / speech `phases` が全部 e / kobold・hob `__pumped === 配置数` / mine_wall `__kingCut.before` が記録され `chariotBefore === 0` / run_chronicle `waitedMs` と `windows` が出力に出る。
  ⭐ **これが無いと全 assert が空振りで永久緑になる**

### §1 揺れが消えた(素の繰り返し・順番に・並列にしない)

| 本 | 回数 | 合格 |
|---|---|---|
| `probe_boss_latch` | 5 | 5/5 で 5/5 PASS |
| `driver_speech_engine` | 5 | 5/5 で全緑(18/18 想定) |
| `driver_monsters_kobold` | 10 | 10/10 全緑 |
| `driver_monsters_hobgoblin` | 5 | 5/5 全緑 |
| `driver_mine_wall` | 3 | 3/3 全緑((4z)(4z2)(4z3)) |
| `verify_run_chronicle` | 5 | 5/5 全緑 |
| `verify_mage_hand --negative` | 2 | 2 回とも exit 0・`escapeon` は (4a) だけ赤 |

- ⚠ 走行中は `index.html` を変えない(sha1 を控えてから回す)。

### §2 負のコントロール(新設は `--negative` で道具に内蔵。赤くならなければ exit 1)

| 本 | 変異 | 注入する欠陥 | 赤くなるべき節 | port |
|---|---|---|---|---|
| kobold | `nopack` | `nearbyAlliedEnemies` の `if (tileChebyshev(cx, cy, oCX, oCY) <= tiles) n++;` を無効化 | (d) | 10623 |
| kobold | `allyside` | 36349 の `nearbyAlliedEnemies(enemyIdx, tCX, tCY, 1) > 0` → `true` | (e) | 10624 |
| hobgoblin | `discac` | `if (nearbyAlliedEnemies(idx, cx, cy, 2) > 0) ac += 1;` → `ac += 1;` | (e)(maxAc=17) | 10625 |
| mine_wall | `nochariot` | 35005 `return king.hp <= king.maxHp * CHARIOT_HP_TRIGGER;` → `return false;` | (4z)(4z2)。**(4z3) は緑のまま**(削れたことの装置) | 10626 |
| speech_engine | `bubblepin` | `updateSpeechBubbles` の `b.el.style.left = SX(a.x) + "px";` を最初の座標に固定 | (4) ±8px。**camXレンジ・(4-装置) は緑のまま** | 10627 |
| boss_latch | (既存の `--index`) | `git show 24dbb60^:index.html` を配る | (c)(d)(e)。**(a)(b) は緑のまま** | — |

- ⭐ 各アンカーは配信物の中で **1 件だけ**ヒットすることを起草窓で確認済み。変異の実装は既存 `--negative` を持つ本(`verify_mage_hand` の変異表と判定 `:1062-1071`)の形を写す: 担当と完全一致・注入行の到達 > 0・担当外の赤 0。
- ⭐ **#89 の教訓**: 新しい変異アンカーが他の tools の文字列リテラルと衝突しないか、全 tools の文字列リテラル走査で測る。
- ⚠⚠ **`bubblepin` の回だけ (7) `__diag` が赤**(`combat-no-round, combat-stall`)になった(素の 3 回では出ていない)。一時停止(約 3 秒)が停滞検出を鳴らした可能性を否定できていない ⇒ 素の 5 回で (7) が緑であることを §1 で必ず確かめ、`bubblepin` の担当に (7) が混ざるなら理由を突き止めてから担当表を決める。

### §3 既存の負のコントロールの非退行

- `node tools/verify_run_chronicle.js --negative` → **exit 0**(N1〜N8 すべて担当どおり)
- `node tools/driver_mine_wall.js` の §5 の 5 変異 → 担当どおり(noring / ringall / centeronly / nofallback / nomass)
- `node tools/verify_mage_hand.js --negative` → **exit 0・12/12 担当どおり**(§1 と兼ねる)

### ⛔ 測らないこと

- 揺れる率そのもの(1/12 や 3/10 は小さい数の観測)。§1 の回数は「揺れが消えた」の目安で、率の主張ではない。
- 閾値 70% そのもの(現状どの tools も測っていない。守りたくなったら別チケット = 測定ページで 71%→false / 70%→true を直接叩く)。

### 既存 golden の非退行

- 本チケットは本番を変えないので母集団走査は不要。⭐ 代わりに、**直した 7 本を参照する tools が無い**ことを §2-9 で確認済み(`probe_boss_latch` はコメント `driver_grid_p9.js:777` と依頼書から参照されるだけ)。
- ⚠ ポートの重なり: kobold 8798(field_step05_hud / speech_boss と同じ)・hobgoblin と speech_engine 8796(field_step1 と同じ)。**並列に走らせない**(今回ポートは動かさない)。

---

## 9. 実機/実感の確認

なし(tools だけ。プレイヤーに見える変化は無い)。

---

## 10. changelog

不要(§2-10)。

---

## 11. やらないこと

- ⛔ `driver_field_step6` Part C「`?graph=auto` が前進した」(別チケット・真因の調査から)。
- ⛔ `index.html` へ計測シームを足す / ゲームの乱数・HP・閾値を変える。
- ⛔ 既定ポートの付け替え(8796 / 8798 の重なりは既知・並列に走らせないことで回避)。
- ⛔ `verify_run_chronicle` 881 の (2c) の窓(任意。直すなら §6-1 と同じ形)。
- ⛔ `driver_wallbox` ほか戦車を別経路で見る本(`driver_graph_run.js:435-448` / `probe_paint_overlay.js:242-256` / `verify_lore_check.js:100,126`)。
- `実装依頼書/README.md` へ足す行(起草コミットで追加):

    | 91 | [2026-10-12_flaky-probes.md](2026-10-12_flaky-probes.md) | **承認済** | 0% | 測定器の揺れ回収 — 乱数で空振りする装置 7 本(boss_latch / speech_engine / kobold / hobgoblin / mine_wall / run_chronicle / mage_hand escapeon)を tools だけで決定的に。⭐ 乱数の源を装置側で止める(確率赤・やり直しは不採用)。新 port 10623〜10627・次 base 10628 |

---

## 12. 実装結果

### 12-0. 着手前の実測(実装窓)

- 基準: HEAD `638624b`・作業ツリー clean・`index.html` sha1 = `3a5dbd8ed7f7d57e3c7fec73a80dfeb017d12593`(以後の走行中は不変)。
- tools 7 本はすべて LF(CRLF 0)。

**行番号の測り直し(§2-1〜§2-7)** — tools 側の引用行は全部一致。`index.html` 側も挙動の前提は全部一致し、ずれは次の 3 点だけ(数行):

| 依頼書 | 実際 | 内容 |
|---|---|---|
| §2-7「書くのは本番では 26147 だけ」 | **26150** `_lastCageEscapeCheck = now;` | 26147 は `now - encounterStartedAt < CAGE_ESCAPE_INTERVAL_MS` の門(26149 が 5 秒門) |
| §2-7 手の口 `tryMageHandInCombat`(22594) | **22595** | 22594 はコメント行 |
| §5-3「runEncounter は 22334 で `encounterEnemyIndices` を立てる」 | **22335** | 22334 は `setPhase("combat")` |

**変異アンカー 5 本**(nopack / allyside / discac / nochariot / bubblepin)— 配信物 `index.html` で各 **1 件**、`tavern.html` / `audio.js` / `js/*.js` に 0 件、`tools/*` の文字列にも 0 件(`SX(a.x)` / `CHARIOT_HP_TRIGGER` 等の部分語でも 0 件)。

**素の 1 回ずつ(順番に・並列なし)**:

| 本 | 所要 | 色 | 赤の check |
|---|---|---|---|
| `probe_boss_latch` | 36 s | 緑 5/5(今回は揺れが出なかった) | — |
| `driver_speech_engine` | 15 s | **赤 16/17** | (4) ±8px `maxDiff=651.8px (samples=2)` |
| `driver_monsters_kobold` | 10 s | 緑 12/12 | — |
| `driver_monsters_hobgoblin` | 129 s | **赤 11/14** | (d) `maxPack=0` / `maxDisc=0` / `maxAc=16` の 3 件(§2-0 の「12/14」より 1 件多いが同じ根 = 密集配置で観測ゼロ) |
| `driver_mine_wall` | 214 s | 緑 66/66((4z)(4z2) 緑) | — |
| `verify_run_chronicle` | 200 s | 緑 73/73 | — |
| `verify_mage_hand` 素 | 148 s | 緑 32/32 | — |

崩れた前提(挙動レベル)は **無し**。
