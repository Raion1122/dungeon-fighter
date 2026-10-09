# #88 BGM を Claude の合成曲へ統一(mp3 11 曲を廃止 + 新曲 3 曲)

- **起草**: 2026-10-10(計画窓 claude-67) / **ステータス**: **承認済**(2026-10-10 ユーザー承認)
- **触るファイル**: `audio.js` / `index.html` / `tavern.html` / `town.html` / `title.html` / `world.html` /
  `assets/bgm/*.mp3`(11 本を `git rm`)/ `voicevox-pipeline/CREDITS.md` /
  `tools/verify_synth_bgm.js`(新規)/ `tools/verify_world_map.js` / `tools/driver_grid_p8.js` /
  `tools/driver_bgm_mine.js`・`tools/driver_bgm_town.js`・`tools/driver_bgm_title.js`(3 本とも `git rm`)
- ⛔ **触らないファイル**: なし(起草時点で作業ツリーは clean、実装窓は #87 を完了済み)。
  それでも `git add .` は禁止。**ファイル単位 add** で、`git diff --cached <file>` を読んでから commit する。

---

## 1. 目的

今の BGM は 2 種類が混ざっている。ダンジョン・タイトル・街・酒場・ワールドマップは **mp3 11 曲**
(魔王魂 10 曲 + ユーフルカ 1 曲)、休憩と一部の予備経路だけが **Claude の合成曲**
(`audio.js` の `TRACKS`、ノコギリ波に歪みを掛けたメタルの音色)。
2026-06-14 の `7275613` より前は、ダンジョンも全部合成曲で、探索・戦闘・ボスに合わせて曲が切り替わっていた。

これを **全部合成曲へ戻して統一**する。合成曲が無い 3 画面(タイトル・街・ワールドマップ)には **新しく合成曲を作る**。

**ユーザー決定(2026-10-10)**:

- **音色 = 今の合成メタルをそのまま戻す**。⛔ 「矩形波・三角波のファミコン風に作り直す」は不採用。
  ⇒ 既存 6 曲(`tavern`/`explore`/`combat`/`boss`/`midboss`/`rest`)の**データは 1 文字も変えない**。
- **合成曲の無い 3 画面には新曲を 3 曲作る**。⛔ 「既存曲の流用(街→酒場バラード / ワールド→探索 / タイトル→無音)」は不採用。曲調:
  - タイトル `title` = **荘厳な幕開け**(Dm→F→C / 96bpm / ロングトーンのリード + 長 3 度ハモリ / dist 0.55 / タム風の重い 4 つ打ち)
  - 街 `town` = **にぎやかな港町**(G / 112bpm / 跳ねるリード / ハモリなし / dist 0.4 / ドラム軽め)
  - ワールドマップ `world` = **広野の叙事詩**(Am→F→G / 92bpm / 大きく跳ぶリード / ドラム控えめ / dist 0.45)
  - ⛔ 不採用の案: タイトル「疾走オープニング」「暗い予感」/ 街「旅支度の静けさ」/ ワールド「行進する旅路」
- **mp3 11 曲は削除**。画面に出るクレジットからも魔王魂(BGM の分)とユーフルカを外す。
  ⇒ mp3 へ戻す道は **`git revert` だけ**になる(撤退スイッチでは戻せない。§7)。

---

## 2. 着手前の実測(2026-10-10・基準 `15b23ab`)

### 2-1. 曲の在庫

| 層 | 場所 | 曲 |
|---|---|---|
| 合成 `TRACKS` | `audio.js:297-331` | `tavern` / `explore` / `combat` / `boss` / `midboss` / `rest` の **6 曲** |
| mp3 `BGM_FILES` | `audio.js:340-410` | `dungeon_normal` / `dungeon_climax` / `boss_battle` / `pharaxus_stage` / `title` / `town` / `tavern_room` / `world` / `mine_entrance` / `mine_depths` / `mine_boss` の **11 曲** |
| 実ファイル | `assets/bgm/` | mp3 **11 本・計 23,776,636 bytes**(`cat assets/bgm/*.mp3 | wc -c`) |

mp3 の再生経路 = `audio.js` の Section F1(`:334-456`)。`bgmEl` / `bgmElNode` / `bgmFileId` / `bgmElSrcId` /
`ensureBgmEl` / `applyFileBgmVolume` / `stopBgmFile` / `playBgmFile` が属する。
**この層の外から呼んでいる行は 6 行だけ**(`grep -n "bgmEl\b\|bgmFileId\|ensureBgmEl\|playBgmFile\|stopBgmFile\|applyFileBgmVolume\|BGM_FILES" audio.js` で実測):

| `audio.js` 行 | 何 |
|---|---|
| `:116` | 設定変更時の `applyFileBgmVolume()` |
| `:128` | `unlock()` 内の `ensureBgmEl()`(iOS のジェスチャ内で `<audio>` を用意) |
| `:514` | `playBgm` 先頭の `if (BGM_FILES[name]) { playBgmFile(name); return; }` |
| `:516` | `playBgm` の `if (bgmFileId) stopBgmFile();` |
| `:534` | `stopBgm` の `stopBgmFile();` |
| `:959-968` | 検証フック `__bgmFileState` / `__bgmFiles` / `__bgmFileIds` |

### 2-2. 呼び口(`grep -n "playBgm(\|[^a-zA-Z_.]bgm(" *.html audio.js`)

| ページ:行 | 渡す ID(今) | いつ走るか |
|---|---|---|
| `title.html:871` / `:873` | `TITLE_BGM_ID = "title"`(`:467`) | `:873` = ロード時(`pendingBgm` へ落ちる)/ `:871` = 最初の pointerdown |
| `town.html:862` / `:865` | `TOWN_BGM_ID = "town"`(`:474`) | 同上の 2 本 |
| `world.html:1565` | `WORLD_BGM_ID = "world"`(`:1564`) | `playWorldBgm()` 1 関数に畳んである(ロード時 + pointerdown から呼ぶ) |
| `tavern.html:9912` | `TAVERN_BGM_ID = "tavern_room"`(`:9908`) | ⚠ **pointerdown `{ once: true }` の中だけ**(#17 で実測した罠。素のロードでは 1 回も呼ばれない) |
| `index.html:15145` | `setPhase` → `bgm(cb ? cb : (kind === "combat" ? combatBgmTrack() : kind))` | フェーズ切替のたび |
| `index.html:15379` | `bgm("rest")` | 休憩 |
| `index.html:19984` | `bgm(currentBgmId() \|\| "boss")` | ボス部屋の初入室 |
| `index.html:22434` | `if (latchBossApproachIfReached()) bgm(currentBgmId() \|\| "boss")` | 戦闘中のボス接近ラッチ |
| `index.html:25318` / `:25504` / `:25613` / `:25714` | `bgm(sceneBgmId() \|\| combatBgmTrack())` | 隠し中ボス 4 体の覚醒(戦闘中のみ) |

`index.html` の曲選びの表 = `:15076-15137`(`MINE_BGM_OFF` / `SCENE_BGM` / `NODE_BGM` / `SCENARIO_BOSS_BGM` /
`sceneBgmId()` / `combatBgmTrack()` / `currentBgmId()`)。

⭐ **mp3 導入前の姿は `git show 7275613 -- index.html` で取れる**。差分は上の呼び口 7 本だけで、全部
「`sceneBgmId() ||` を前置しただけ」だった:

    -      bgm(kind === "combat" ? combatBgmTrack() : kind);
    -            bgm("boss");
    -          if (encounterActive) bgm(combatBgmTrack());     (× 4)

⇒ ダンジョン側の「以前のように」は **この 3 形へ戻すこと**と同じ意味になる。

### 2-3. ⚠⚠⚠ 罠 A — 表を消し残すと **黙って無音**になる(ID の衝突は逆向きにも起きる)

`playBgm`(`audio.js:511-517`):

```js
if (BGM_FILES[name]) { playBgmFile(name); return; }   // ← 先に見る
if (!TRACKS[name]) return;                           // ← 無ければ黙って return
```

- **A-1(タイトル・街・ワールド)** — 新曲を `TRACKS.title` / `TRACKS.town` / `TRACKS.world` と**同じ ID**で足す
  (呼び口を 1 行も変えずに済むので、この ID にする)。⚠ このとき `BGM_FILES` の `title` / `town` / `world` が
  1 件でも残っていると、`playBgm` は mp3 側へ逸れ、**消した mp3 を読みに行って無音**になる。エラーは出ない。
  これは #17 の罠(`BGM_FILES.tavern` が `TRACKS.tavern` を食う)の**逆向き**。
- **A-2(ダンジョン)** — `sceneBgmId()` / `currentBgmId()` を残すと `"dungeon_normal"` などを返し続け、
  `TRACKS` にも無いので **`if (!TRACKS[name]) return;` で黙って無音**になる。`setPhase` の `cb ? cb : …` は
  cb が null のときしか合成へ落ちない。
- ⇒ **mp3 層は表ごと・関数ごと消す**。`playBgm` の `BGM_FILES` 分岐も消す。
  受入では「**渡された ID がすべて `TRACKS` に在る**」を全ページで見る(§8 (0c))。
- ⭐ この罠は §8 の負のコントロール **`shadow`**(A-1)と **`ghostscene`**(A-2)として装置に内蔵する。

### 2-4. ⚠⚠ 罠 B — `unlock()` 経由の再生はスパイから見えない(既知・#20)

`audio.js:129` `if (pendingBgm) { var p = pendingBgm; pendingBgm = null; playBgm(p); }` は**モジュール内部の**
`playBgm` を呼ぶので、`window.GameAudio.playBgm` を包んだスパイでは数えられない。
⇒ 検証は **2 経路**: 経路 A = スパイへ渡った ID / 経路 B = 実際に鳴っている合成曲
(**新しい検証フック `__bgmTrack()`** で `bgmState.name` を読む。§4 STEP1)。

### 2-5. 合成曲の音量感(実測)

`__renderBgmOffline(id, 12)` を headless Chrome で描き、先頭 10% を捨てた RMS とピーク
(起草用の使い捨てプローブ。scratchpad の `probe_synth_loud.js`):

| id | RMS dBFS | ピーク dBFS |
|---|---|---|
| `tavern` | −15.0 | −6.8 |
| `explore` | −13.4 | −6.6 |
| `combat` | −13.8 | −7.6 |
| `boss` | −14.6 | −8.4 |
| `midboss` | −15.9 | −7.6 |
| `rest` | −16.2 | −7.4 |

⇒ 新曲 3 曲の目安 = **RMS −16.5〜−13.0 dBFS**(既存 6 曲の幅)。受入はゆるく **−18.0〜−12.0** で見る(§8 (2c))。
⚠ 参考: 今の mp3 は実効 **−19.9 LUFS** に揃えてある(#17 で `−15.5 × 0.60` から再現済み)。合成曲は
**5〜6 dB ほど大きく聞こえる可能性がある**(RMS と LUFS は厳密には同じ尺度ではないので、これは目安)。
⛔ ユーザー決定は「合成曲はそのまま戻す」なので、**既存 6 曲の gain はここでは動かさない**。§9 で耳で確かめる。

### 2-6. 画面のクレジット(`credit:` からは生成されていない。#17 で実測済みの事実を再確認)

| 場所 | 今 | → |
|---|---|---|
| `audio.js:916` 設定モーダル | `…　｜　BGM  魔王魂 / ユーフルカ　｜　効果音  OtoLogic (CC BY 4.0)` | `BGM  オリジナル(Web Audio 合成)` |
| `index.html:15320-15322` エンディング「音楽」 | `魔王魂` / `Wingless Seraph（ユーフルカ）` | `オリジナル楽曲(Web Audio 合成)` の 1 行 |
| `index.html:15324` エンディング「効果音」 | `魔王魂 ／ Kenney (CC0)` | ⛔ **変えない**(効果音は今回の対象外) |
| `voicevox-pipeline/CREDITS.md:41-42` | BGM 節に mp3 の出典 | BGM 節を「オリジナル合成曲」へ書き換え |

### 2-7. 検証ツールへの影響(`grep -lE "__bgmFile|BGM_FILES|sceneBgmId|currentBgmId" tools/*.js`)

| ツール | 依存 | 対応 |
|---|---|---|
| `driver_bgm_mine.js` | 廃坑 mp3 3 曲・`?minebgm=0` | **`git rm`**(対象が消える) |
| `driver_bgm_town.js` | 街・酒場の mp3・`__bgmFiles` | **`git rm`** |
| `driver_bgm_title.js` | タイトルの mp3 | **`git rm`** |
| `verify_world_map.js` | (8b) `__bgmFileState` + `fierd.mp3` の要求ログ / (8c) `BGM_FILES.world` | (8b)(8c) を書き直す(§6) |
| `driver_grid_p8.js:500-518` | (6a2) `currentBgmId()` と `bgm().scene` の一致 | 言い直す(§6) |
| `verify_title_screen.js` 受入条件 10 | スパイへ渡った ID が `"title"` で 1 回 | **ID を変えないので無改修で緑のはず** |
| `probe_p9_tour.js:129` | `__graphRun.bgm().id` | シームの `id` を残すので無改修(golden ではない) |

⭐ 3 本を消すのは「対象が無くなった」から。**守っていた性質のうち生き残るもの**(2 経路・呼び口の数・
ジェスチャ後に鳴る)は新ドライバが引き継ぐ。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **鳴る**。
プレイヤー向けの要約は実在する(音がはっきり変わる)。§10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `audio.js` | Section F1(mp3 層)を丸ごと削除 / `playBgm`・`stopBgm`・`unlock`・設定同期から mp3 の行を削除 / `TRACKS` に `title`・`town`・`world` を追加 / 検証フックを差し替え / クレジット行 |
| `index.html` | 曲選びの表(`:15076-15137`)を削除して `dungeonBgmTrack()` へ / 呼び口 7 本を mp3 導入前の形へ / `__graphRun.bgm()` シーム / エンディングのクレジット |
| `tavern.html` | `TAVERN_BGM_ID = "tavern"` / `?townbgm=0` の行(`:9905-9911`)を削除 |
| `town.html` | ヘッダコメント `:57` と撤退スイッチの注記(`:470-477`)を合成曲の説明へ(⛔ 呼び口と ID は変えない) |
| `title.html` | ヘッダコメント `:23` `:41-43` / 撤退スイッチの注記(⛔ 呼び口と ID は変えない) |
| `world.html` | ヘッダコメント `:25` `:77` `:1549` / 撤退スイッチ `?worldbgm=0` を追加(⛔ `playWorldBgm()` の 1 行は変えない = `verify_world_map` の変異アンカー) |
| `assets/bgm/*.mp3` | 11 本を `git rm`(`assets/bgm/` は空になる) |
| `voicevox-pipeline/CREDITS.md` | BGM 節 |
| `tools/verify_synth_bgm.js` | 新規(§8) |
| `tools/verify_world_map.js` / `tools/driver_grid_p8.js` | 言い直し(§6) |
| `tools/driver_bgm_{mine,town,title}.js` | `git rm` |

---

## 4. STEP1 — `audio.js`

1. **Section F1(`:334-456`)を削除**。`BGM_FILES` の長いコメント群(#17/#20/#21 の罠の記録)も一緒に消してよい
   (その罠は mp3 層ごと無くなる)。代わりに `TRACKS` の直前へ 3 行だけ残す:

   ```js
   // ⚠ BGM は合成 (TRACKS) だけ。2026-10-10 (#88) に mp3 層 (BGM_FILES) を廃止した。
   //   ⛔ 別名の表を TRACKS より先に引く分岐を足さないこと — 同じ ID を食って黙って無音になる (#88 §2-3)。
   ```

2. `:116` の `applyFileBgmVolume();` / `:128` の `ensureBgmEl();` / `:514` / `:516` / `:534` の行を削除。
   `playBgm` は `if (!TRACKS[name]) return;` から始まる形になる。
3. **`TRACKS` に 3 曲を追加**(既存 6 曲と同じスキーマ: `bpm` / `stepsPerBeat: 4` / `leadType`・`bassType: "sawtooth"` /
   `dist` / `cabCut` / `power` / `harmony` / `makeup` / `leadGain`・`bassGain`・`drumGain` / `lead`・`bass`・`drum` 各 **32 step**)。
   ドラム記号は `k`/`h`/`s`/`o`/`c` だけ(`scheduleStep` `:470-474` が知っているもの)。

   | id | 曲調(ユーザー選択) | 骨格 |
   |---|---|---|
   | `title` | 荘厳な幕開け | Dm→F→C / **96bpm** / ロングトーンのリード / `harmony: 2`(長 3 度)/ `dist: 0.55` / `k` を 4 分で刻む重い 4 つ打ち + 小節頭に `c` |
   | `town` | にぎやかな港町 | **G 長調** / **112bpm** / 8 分の跳ねるリード / `harmony: 0` / `dist: 0.4` / `drumGain` は `explore`(0.12)より低く |
   | `world` | 広野の叙事詩 | Am→F→G / **92bpm** / 5 度・オクターブで大きく跳ぶリード / `harmony: 1` / `dist: 0.45` / `drumGain` は `rest`(0.06)〜`tavern`(0.07)並み |

   - ⭐ 旋律そのものは実装窓が書いてよい。**既存 6 曲のどれとも `lead` 配列が一致しないこと**(§8 (2b))。
   - ⭐ 音量は `makeup` で合わせ、**RMS −16.5〜−13.0 dBFS** を狙う(§2-5。確認は `__renderBgmOffline` + 自前の RMS)。
   - ⛔ **既存 6 曲の行は 1 文字も変えない**(ユーザー決定)。

4. 検証フックを差し替える(`:959-968`):

   ```js
   __bgmRunning: function () { return bgmRunning; },                      // 既存のまま
   /* 今鳴っている合成曲 (経路 B)。unlock() 経由の再生はスパイから見えないので、これで測る (#88 §2-4) */
   __bgmTrack: function () { return { name: bgmState.name, voice: !!bgmState.voice, running: bgmRunning }; },
   /* 合成曲の登録表 (表を写経せず実体から引く) */
   __bgmTrackIds: function () { var a = []; for (var k in TRACKS) a.push(k); return a; },
   /* 曲データの読み取り口 (lead の重複検査用・コピーを返す) */
   __bgmTrackLead: function (id) { var t = TRACKS[id]; return t && t.lead ? t.lead.slice() : null; },
   ```

   `__bgmFileState` / `__bgmFiles` / `__bgmFileIds` は**削除**(残すと「mp3 層が在る」ように見える)。

5. `:916` のクレジット行の BGM 部分を `BGM  オリジナル(Web Audio 合成)` へ。

## 5. STEP2 — `index.html` と各ページ

1. `:15076-15137` の `MINE_BGM_OFF` / `SCENE_BGM` / `NODE_BGM` / `SCENARIO_BOSS_BGM` / `sceneBgmId` / `currentBgmId` を削除し、
   `combatBgmTrack()` は残して 1 関数を足す:

   ```js
   /* ダンジョンの BGM = 合成曲だけ (#88)。探索 explore / 休憩 rest / 戦闘 combat・ボス部屋 boss・隠し中ボス midboss。
    * ⚠ mp3 導入前 (7275613 より前) の鳴らし分けそのもの。 */
   function dungeonBgmTrack(kind) { return kind === "combat" ? combatBgmTrack() : kind; }
   ```

   ⚠ `MINE_BGM_OFF` を他所で読んでいないか、削除前に `grep -n "MINE_BGM_OFF\|sceneBgmId\|currentBgmId\|SCENE_BGM\|NODE_BGM" index.html` で確認する
   (起草時点では上の表と `__graphRun.bgm()` のシームだけ)。

2. 呼び口(行番号は起草時点の値):
   - `:15145` `bgm(dungeonBgmTrack(kind));`(`const cb = …` の行と、その上のコメント 2 行も削除)
   - `:19984` / `:22434` → `bgm("boss")`
   - `:25318` / `:25504` / `:25613` / `:25714` → `bgm(combatBgmTrack())`
   - `:15379` `bgm("rest")` はコメントの「Phase D で専用曲に差替余地」だけ削除し、行は変えない
3. `__graphRun.bgm()`(`:40584-40591` 付近)を言い直す:

   ```js
   /* ★[#88] 検証シーム: 今のフェーズで鳴らすべき合成曲 (曲を鳴らさない純粋な読み取り)。
    * ⚠ 実際に鳴った側は __bgmTrack() (audio.js) で別に測る = 2 経路で突き合わせる。 */
   bgm: () => ({ id: dungeonBgmTrack(currentPhase), inBossRoom: !!window.__inBossRoom,
                 scenarioId: scenarioId, nodeId: currentNodeId }),
   ```

4. エンディングのクレジット(`:15320-15322`)の「音楽」を `<div class="erItem">オリジナル楽曲(Web Audio 合成)</div>` 1 行へ。
   ⛔ `:15324` の効果音行は変えない。
5. `tavern.html:9905-9912` → `var TAVERN_BGM_ID = "tavern";` だけにし、`?townbgm=0` の行は削除(既定が同じになるので意味が無い)。
6. `town.html` / `title.html` / `world.html` は **呼び口と ID を変えない**。ヘッダコメントの mp3 の説明だけ書き換える。
   `world.html` には `?worldbgm=0` を足す(§7)。

## 6. STEP3 — mp3 の削除と既存ツールの言い直し

1. `git rm assets/bgm/*.mp3`(11 本)。⚠ 非 ASCII 名の `酒場.mp3` があるので、確認は
   `git -c core.quotepath=false ls-files assets/bgm` で **0 行**になるまで。
2. `git rm tools/driver_bgm_mine.js tools/driver_bgm_town.js tools/driver_bgm_title.js`。
3. `tools/verify_world_map.js`:
   - (8b) → 最初の pointerdown の後、`__bgmTrack()` が `{ name: "world", voice: true }`。**`/assets/bgm/` への要求が 0 件**(リクエストログ)
   - (8c) → `__bgmTrackIds()` に `world` が在り、`__renderBgmOffline("world", 0.5)` が resolve する
   - `spyonly`(pointerdown 側の `unlock()` だけ消す)の「(8a) は緑のまま (8b) だけ赤」は**そのまま成立させる**
   - ヘッダの mp3 の記述(`:24-33` `:85`)を合わせて直す
4. `tools/driver_grid_p8.js:497-518` の (6a2) を言い直す:
   取る値を `bgm: window.__graphRun.bgm().id` にして、
   `check('(6a2) ★そのとき BGM はボス曲ではない', A0.bgm !== 'boss' && A0.bgm !== 'midboss', …)`。
   ⚠ 期待値を `'explore'` などで直書きしない(#4 で同じ形の直書きが腐った記録が `:507-513` に在る)。

---

## 7. 撤退スイッチ

⚠⚠ **mp3 へ戻す撤退スイッチは作れない**(ユーザー決定で mp3 を削除する)。戻すときは `git revert`。
撤退スイッチは「新曲 3 曲」の側に、ページごとに独立で持たせる(#17 / #20 と同じ作法・sessionStorage へは写さない):

- **`title.html?titlebgm=0`** — 既存のまま(無音へ)。
- **`town.html?townbgm=0`** — 既存のまま(`town` → 合成 `tavern`)。注記だけ「mp3 から」→「新曲 `town` から」へ。
- **`world.html?worldbgm=0`**(新設)— `WORLD_BGM_ID = "explore"`。判定は `:1564` の直下で、`?titlebgm=0` と同じ形。
- `?minebgm=0` は**削除**(廃坑の mp3 表ごと無くなる)。

---

## 8. 受入条件 — `tools/verify_synth_bgm.js`(新規・素 port **10598** / 変異 **10599, 10601〜10605**)

⚠ **10600 は `probe_magehand_reach.js` が使っている**ので飛ばす。

方針: 5 ページそれぞれで **経路 A(スパイへ渡った ID)と 経路 B(`__bgmTrack()` で実際に鳴っている合成曲)**を突き合わせる。
起動・スパイの掛け方・pointerdown の送り方は、消す前の `driver_bgm_town.js` / `driver_bgm_title.js` の `bootPage` を流用してよい
(⚠ 流用するなら**消す前に**写す)。Chrome は `--autoplay-policy=no-user-gesture-required --mute-audio`。

### §0 装置(先に母集団を確かめる)

- **(0a)** 5 ページすべてでスパイが掛かり、**経路 A が 1 件以上の ID を捉えた**(酒場は pointerdown を 1 回送ってから)。
  ⭐ これが無いと全 assert が空振りで永久緑になる。
- **(0b)** `__bgmTrackIds()` が **9 件**で、`title`/`town`/`world` を含む。**件数はわざと直書きする**(気づかずに曲を増減したら赤。
  `driver_bgm_town` (0b) と同じ意図)。
- **(0c)** ⭐ 全ページで経路 A に渡った ID が**すべて** `__bgmTrackIds()` に在る(罠 A の検出器そのもの)。
- **(0d)** `GameAudio.__bgmFileState` / `__bgmFiles` / `__bgmFileIds` が `undefined`(mp3 層の検証口が残っていない)。

### §1 ページごとの BGM(2 経路)

| ページ | 操作 | 経路 A | 経路 B(`__bgmTrack().name`) |
|---|---|---|---|
| `title.html` | ロード → pointerdown | `title` | `title` |
| `town.html` | 同上 | `town` | `town` |
| `world.html` | 同上 | `world` | `world` |
| `tavern.html` | pointerdown | `tavern` | `tavern` |
| `index.html` | 廃坑を起動して探索フェーズ | `explore` | `explore` |

- **(1a)〜(1e)** 上の 5 行。経路 B は `voice: true` も見る。
- **(1f)** 5 ページのどれも **`/assets/bgm/` を 1 件も要求しない**(リクエストログ = 別経路)。

### §2 新曲 3 曲

- **(2a)** `__renderBgmOffline(id, 12)` が `title`/`town`/`world` で resolve し、無音でない(RMS > −40 dBFS)。
- **(2b)** 3 曲の `__bgmTrackLead(id)` が、**他の 8 曲のどれとも一致しない**(流用の取り違えを止める)。
- **(2c)** 3 曲の RMS が **−18.0〜−12.0 dBFS**(§2-5 の幅をゆるく)。

### §3 ダンジョンの鳴らし分け(`index.html`)

シーム `__graphRun.bgm().id` と `__bgmTrack().name` の 2 経路で:

- **(3a)** 探索フェーズ → `explore`
- **(3b)** `setPhase("combat")` → `combat`
- **(3c)** `window.__inBossRoom = true` にして `setPhase("combat")` → `boss`
- **(3d)** `window.__inMidBoss = true` で `setPhase("combat")` → `midboss`
- **(3e)** ⭐ `scenarioId` を `dragon-lair`、`_genScenario` を生成クエストにしても (3a)〜(3c) と同じ ID になる
  (シナリオ別の表が残っていないこと。旧 `pharaxus_stage` / tier 振り分けの消し残しの検出)

### §4 クレジット

- **(4a)** 設定モーダルを開いたときのクレジット行(`audio.js:916` 由来の DOM)に `魔王魂` も `ユーフルカ` も無く、`オリジナル` が在る。
- **(4b)** エンディングの「音楽」見出しの直後の `erItem` が `オリジナル楽曲` を含み、`ユーフルカ` / `Wingless Seraph` を含まない。
  ⛔ 効果音の行の `魔王魂` は**在ってよい**(効果音は対象外)。⚠ 「`魔王魂` がページに 0 件」で見ると効果音行で必ず赤くなる。

### §5 撤退

- **(5a)** `world.html?worldbgm=0` → 経路 A・B とも `explore`
- **(5b)** `town.html?townbgm=0` → `tavern` / **(5c)** `title.html?titlebgm=0` → 経路 A が 0 件・経路 B が `null`

### ⛔ 測らないこと

- 各曲の `makeup` / `*Gain` / `bpm` の具体値(耳で動かす余地を残す。§2-5 の RMS 幅だけ見る)
- 既存 6 曲の RMS(データを変えない決定なので、測っても情報が無い)
- 旋律の良し悪し(§9 で耳で)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| port | 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|---|
| 10599 | **`shadow`** | ⭐ `playBgm` の先頭に旧分岐の残骸 `if (({ title: 1 })[name]) return;` を戻す(罠 A-1 の再現) | (1a) の経路 B だけ赤 / 経路 A と (0c) は緑 |
| 10601 | **`ghostscene`** | ⭐ `index.html` の `setPhase` で `bgm("dungeon_normal")` を渡す(罠 A-2 の再現) | (0c)(1e)(3a) |
| 10602 | `silent` | `world.html` の `playWorldBgm()` の中身を空にする | (0a) の world 腕・(1c) |
| 10603 | `staleCredit` | エンディングの「音楽」に `Wingless Seraph（ユーフルカ）` の行を戻す | (4b) のみ |
| 10604 | `copytrack` | `TRACKS.world.lead` を `TRACKS.explore.lead` と同じ配列にする | (2b) のみ |
| 10605 | `bossstuck` | `combatBgmTrack()` が `__inBossRoom` を見ない | (3c) のみ |

⭐ `shadow` で **(0c) が緑のまま (1a) の経路 B だけ赤**になることが罠 A-1 の機械証明
(渡された ID は正しいのに鳴らない = 経路 A だけでは永久に緑)。両方赤なら変異点が誤り。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_world_map.js`(§6 で言い直した後)/ `--negative`
- `node tools/driver_grid_p8.js`(§6 で言い直した後)
- `node tools/verify_title_screen.js` → **85/85**(無改修で緑のはず)
- 母集団の非退行は #87 と同じ作法(#88 帰属の緑→赤 0 を確かめる)

⚠ 基準値は 2026-10-10 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`ゲームを起動.vbs`。`file://` では音が出ない)。

1. タイトル / 街 / ワールドマップの新曲 3 曲を聴く(曲調が選んだものになっているか)
2. ダンジョンで探索 → 戦闘 → ボス部屋で曲が切り替わるか、クロスフェード(0.6 秒)が唐突でないか
3. ⭐ **音量**: 合成曲は今の mp3 より 5〜6 dB 大きい可能性がある(§2-5)。DM の語り・効果音とかぶるなら
   設定の BGM 音量で済むか、`makeup` を下げるか(⚠ 既存 6 曲を下げるならユーザーに確認してから)
4. 酒場(`tavern` = メタルバラード)へ戻ったときの印象

---

## 10. changelog(⚠ `audio.js` / `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>BGM をオリジナルの合成曲に統一</b> — タイトル・港町・ワールドマップに新曲。ダンジョンは探索・戦闘・ボスで曲が切り替わる。"

---

## 11. やらないこと

- ⛔ **矩形波のファミコン風への作り直し**(ユーザーが不採用にした案)
- ⛔ 既存 6 曲(`tavern`/`explore`/`combat`/`boss`/`midboss`/`rest`)のデータ・gain の変更
- ⛔ 効果音の mp3(`assets/sfx/`)と効果音のクレジット(`index.html:15324` の `魔王魂 ／ Kenney`)
- ⛔ ボイス(`assets/voice/`・VOICEVOX)
- ⛔ 新しいシーン別の曲(廃坑専用・最終ボス専用など)。mp3 時代の「廃坑 3 曲」「Pharaxus 専用曲」の合成版は別チケット
- ⛔ `Desktop\BGM\` の原本の整理(リポジトリ外)
- `実装依頼書/README.md` に足す行(承認後の起草コミットで足す):

    | 88 | [2026-10-10_synth-bgm-unify.md](2026-10-10_synth-bgm-unify.md) | **承認済** | 0% | BGM を合成曲へ統一。mp3 11 曲を削除し、タイトル・街・ワールドに新曲 3 曲。⚠⚠⚠ mp3 の表を消し残すと同じ ID を食って**黙って無音**(罠 A)。⭐ 呼び口の ID は変えない |

---

## 12. 実装結果

(実装窓が埋める)
