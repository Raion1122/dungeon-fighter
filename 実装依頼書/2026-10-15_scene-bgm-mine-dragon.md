# #94 廃坑の入口曲 + 最終ボス曲を合成で 2 曲(シナリオ別の差し替えを 1 か所に)

- **起草**: 2026-10-15(起草窓) / **ステータス**: **承認済**(2026-10-15 ユーザー承認)
- **触るファイル**: `audio.js`(`TRACKS` に 2 曲)/ `index.html`(`sceneBgmTrack` + 呼び口 + 撤退スイッチ)/ `tavern.html`(changelog 1 行だけ)/ `tools/verify_synth_bgm.js`(言い直し)/ `tools/verify_scene_bgm.js`(新規)/ 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: なし(2026-10-15 時点で作業ツリーは会議記録 1 本以外 clean・並走なし)。
- 新規ドライバのポート = **10629**(素)/ **10630〜10633**(変異 4 本)。**次の base = 10634**。

---

## 1. 目的

#88 で BGM を合成曲(`audio.js` の `TRACKS`)に統一したとき、シナリオ別の曲は「別チケット」として残した(#88 依頼書 §11)。
mp3 だった頃は廃坑に 3 曲、竜の巣にファラクサス専用曲があったが、今はどのシナリオでも同じ探索曲・同じボス曲が鳴る。
最初の依頼の入口と、最後の黒幕との決戦に専用曲を 1 曲ずつ足し、場所の手応えを戻す。

**ユーザー決定(2026-10-15・開発会議 `dev-meetings/2026-10-14_next-draft-topic.md` 第 2 段)**:

- 曲は **2 曲だけ**: 廃坑の最初の部屋(entry ノード)の探索 = `mine_gate` / 竜の巣のボス戦 = `finalboss`。
- 曲調(選択ダイアログ・プレビュー付き 3 択から):
  - `mine_gate` = **「暗い坑道の足音」** — 88bpm・E フリジアン・間のあるドラムとミュートした単音リフ・ベースは E1 の持続音・歪みは `explore` より弱め
  - `finalboss` = **「業火の行進」** — 132bpm・F# マイナー・ツーバスの行進(`kk s kk s …`)・三全音(F#-C)の動機・歪み最大
- 音色は既存の合成メタルのまま(#88 の決定を引き継ぐ)。
- ⭐ 不採用: **グリクス戦の専用曲**(ガイウス案)/ 廃坑の玉座の間(n1)の専用曲 —— #88 の新曲 3 曲がまだ実機で聴かれていない。2 曲の試聴の後で別チケットとして判断する。
- 不採用: 曲の頭だけ 1 回鳴らす「イントロ」をエンジンに足す —— エンジンは 1 曲 = 1 ループ(`audio.js:389` `tr.loop = tr.lead.length`)。頭の演出は毎周くり返す形で作る。

---

## 2. 着手前の実測(起草窓が本番コードと実走で確かめた事実・基準 `342d076`)

### 2-1. 選曲の呼び口(`index.html`・全数)

| ファイル:行 | いつ | 何 |
|---|---|---|
| `index.html:3403` | — | `function bgm(n)` = `GameAudio.playBgm(n)` の薄い包み(BGM を鳴らす唯一の口) |
| `index.html:15092-15096` | 戦闘フェーズ | `combatBgmTrack()` — `__inMidBoss` → `midboss` / `__inBossRoom` → `boss` / それ以外 `combat` |
| `index.html:15099` | フェーズ切替 | `dungeonBgmTrack(kind)` — `combat` なら `combatBgmTrack()`、それ以外は `kind`(`explore` / `rest`) |
| `index.html:15104` | `setPhase` | `bgm(dungeonBgmTrack(kind))` |
| `index.html:19942` | 探索中にボス部屋へ入った | `bgm("boss")` **直呼び** |
| `index.html:22644` | 戦闘中に玉座へ詰めた(ラッチ) | `if (latchBossApproachIfReached()) bgm("boss");` **直呼び** |
| `index.html:25544` / `:25730` / `:25839` / `:25940` | 隠し中ボスの覚醒 | `bgm(combatBgmTrack())` |
| `index.html:15337` | エンディング | `bgm("rest")` |
| `index.html:40815` | 検証シーム | `__graphRun.bgm()` = `{ id: dungeonBgmTrack(currentPhase), … }` |

- `tavern.html:9913` は酒場の `TAVERN_BGM_ID` だけ(今回は無関係)。`GameAudio.playBgm` を直接呼ぶのは `index.html:3403` と `tavern.html:9913` の 2 箇所だけ(grep で実測)。
- ⇒ **差し替えが要る口は 3 つ**: `dungeonBgmTrack`(探索 → `mine_gate`)/ `combatBgmTrack`(ボス → `finalboss`)/ 直呼び 2 本(`:19942` `:22644`)。中ボスの 4 箇所は `combatBgmTrack()` を通るので自動で揃う。シーム `:40815` も `dungeonBgmTrack` を通るので自動で新 ID を返す。

### 2-2. ⚠⚠⚠ 罠 A — シナリオの判定を `themeId` で取ると生成クエストに漏れる

- `index.html:3712-3714` `_scenIdForTex` は「どのテクスチャを敷くか」= **themeId**。生成クエストが `themeId: "goblin-mine"` / `"dragon-lair"` を持つと、その値を返す(注記 `:3715-3721`)。
- 素の `scenarioId`(`index.html:11476` 宣言)は、既定 6 シナリオならその ID、生成クエストなら `"generated-quest"`、街道の襲撃なら `"road-ambush"`。
- ⇒ **`sceneBgmTrack` は `scenarioId` で判定する**。`_scenIdForTex` で判定すると、闇市/酒場の生成クエストで廃坑の曲やファラクサス曲が鳴る。
- ⭐ この罠は §8 の変異 `themekey` として装置に内蔵する。

### 2-3. ⚠⚠ 罠 B — ボス曲の直呼びが 2 本ある

`:19942`(探索中にボス部屋へ入った)と `:22644`(戦闘中に玉座へ詰めた)は `combatBgmTrack()` を通らない。片方を包み忘れると、**その経路でだけ汎用のボス曲**が鳴る(探索 → 戦闘の切り替えで `combatBgmTrack` 経由に戻るまで)。
⭐ §8 の変異 `latchleak`(`:22644` だけ素通し)で検査する。

### 2-4. 曲の音量(RMS)— 基準を測り直した

`verify_synth_bgm.js:278-292` と同じ式(`GameAudio.__renderBgmOffline(id, 12)` の先頭 10% を捨てた RMS)で、既存 9 曲を測った:

| 曲 | RMS (dBFS) |
|---|---|
| tavern | -15.03 |
| **explore** | **-13.38** |
| combat | -13.85 |
| **boss** | **-14.58** |
| midboss | -15.94 |
| rest | -16.18 |
| title / town / world | -14.94 / -14.09 / -14.96 |

**基準の再現も取れている**: title / town / world の値が `verify_synth_bgm` の素の記録(`[記録] 新曲 RMS: title=-14.94 / town=-14.09 / world=-14.96`)と小数第 2 位まで一致。

**計測コマンド**(scratchpad `bgm94/rms.js`・title.html を 10630 で配って全曲を描く):

    node bgm94/rms.js
    → {"tavern":-15.03,"explore":-13.38,"combat":-13.85,"boss":-14.58,"midboss":-15.94,"rest":-16.18,"title":-14.94,"town":-14.09,"world":-14.96}

⇒ 受入: `mine_gate` は **-18.0 以上かつ `explore` + 1.0 dB(-12.38)以下**、`finalboss` は **-18.0 以上かつ `boss` + 1.0 dB(-13.58)以下**。「既存より大きくしない」を守り、静かめの曲調を作る余地は残す。

### 2-5. ⚠ 今回の変更で意図して赤くなる既存の検査(`verify_synth_bgm.js`)

素の色: **35/35 緑**(2026-10-15・27 秒・port 10598)。今回の変更で**赤くなる見込み**の判定:

| 判定 | 行 | なぜ赤くなるか | 言い直し |
|---|---|---|---|
| (0b) | `:420` | `__bgmTrackIds()` が **9 件(直書き)** → 11 件 | 「#88 の 9 曲 + #94 の 2 曲 = 11 件、名前で全部」 |
| (2b) | `:461` | 「他の 8 曲」の数え方 | 「他の全曲(実体から数える)」 |
| (1e-A)(1e-B) / (3a) | `:481` ほか | index ページは廃坑の entry(`n0`)で起動 → 探索曲が `mine_gate` に変わる | 廃坑 entry では `mine_gate`、(3a) は entry 以外のノードか別シナリオで `explore` を見る |
| (3e) | `:485` | `scenarioId='dragon-lair'` でボス曲が `finalboss` になる = 「シナリオ別の表が残っていない」の主張が崩れる | 「差し替えは `sceneBgmTrack` の 2 件だけ・それ以外のシナリオと生成クエスト(`tierKey:"tier3"`)は基準列と同じ」 |

⚠ 見込みは起草窓の読み。**実装窓は着手前に素の色を控え、実装後の赤がこの表の範囲に収まるかで確かめる**。表の外が赤くなったら理由を突き止めてから言い直す。

### 2-6. ID の衝突

- `pharaxus` は**敵の種類の名前**として使用中(`ENEMY_TYPES.pharaxus`・`tools/driver_cast_circle.js:138` ほか)⇒ 曲の ID には使わない。
- `mine_gate` / `finalboss` は `index.html` / `audio.js` / `tools/` に **0 件**(grep で実測)。
- 旧 mp3 の ID(`mine_entrance` / `mine_depths` / `mine_boss` / `pharaxus_stage`)は**再利用しない**(`probe_boss_latch.js` ほかの注記に旧名が残っている = 読み違いの元)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **鳴る**。プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `audio.js` | `TRACKS` に `mine_gate` / `finalboss` を足す(`world` の後ろ・`:344` の `};` の前) |
| `index.html` | `SCENE_BGM_OFF`(撤退)/ `sceneBgmTrack(id)` / `dungeonBgmTrack` と `combatBgmTrack` の戻り値を包む / `:19942` `:22644` の `bgm("boss")` → `bgm(sceneBgmTrack("boss"))` |
| `tavern.html` | changelog 1 行(`py tools/add_changelog.py`) |
| `tools/verify_synth_bgm.js` | §2-5 の言い直し |
| `tools/verify_scene_bgm.js` | 新規(§8) |

---

## 4. STEP1 — 2 曲を `TRACKS` に足す(`audio.js`)

- 書式は既存と同じ(`bpm` / `stepsPerBeat: 4` / `leadType` / `bassType` / `dist` / `power` / `harmony` / `makeup` / `leadGain` / `bassGain` / `drumGain` / `lead` / `bass` / `drum`)。
- **`mine_gate`(暗い坑道の足音)**: 88bpm・E フリジアン(E-F の半音)。lead は単音の刻みで休符多め(例 `E . E F . E . . | E . G F . E . .`)、bass は E1 の持続、drum は `k . . . s . . . | k . k . s . . .`。`dist` は `explore`(0.5)より下。
- **`finalboss`(業火の行進)**: 132bpm・F# マイナー。lead は三全音の動機(例 `F# . C . F# . C . | A G# F# . C . . .`)、bass は `F#1` の刻みから `D1` `C#1` へ、drum はツーバスの行進(`k k s k k s …`)。`dist` は `midboss`(0.72)と同程度・`cabCut` あり。
- ⭐ ループの長さは lead の歩数で決まる(32 でも 64 でもよい)。lead / bass / drum の歩数を揃える。
- 初期値の `makeup` と各 Gain は `explore` / `boss` の値から始め、§2-4 の RMS の受入に入るまで下げる。
- ⛔ 既存 9 曲は 1 文字も変えない。

## 5. STEP2 — `sceneBgmTrack` と呼び口(`index.html`)

```js
/* ★[#94] シナリオと場面ごとの BGM の差し替え (唯一の口)。差し替えは 2 件だけ:
 *   ① 既定の廃坑の entry ノードの探索 → mine_gate  ② 既定の竜の巣のボス戦 → finalboss
 * ⚠⚠ シナリオは scenarioId で見る。_scenIdForTex (= themeId) で見ると生成クエストに漏れる (罠 A)。
 * ⚠ ボス曲の直呼び 2 本 (ボス部屋に入った / 戦闘中に玉座へ詰めた) も必ずここを通す (罠 B)。 */
const SCENE_BGM_OFF = (() => {
  try { return new URLSearchParams(window.location.search).get("scenebgm") === "0"; } catch (e) { return false; }
})();
function sceneBgmTrack(id) {
  if (SCENE_BGM_OFF) return id;
  if (id === "explore" && scenarioId === "goblin-mine" &&
      typeof RUN !== "undefined" && RUN && currentNodeId === RUN.graph.entry) return "mine_gate";
  if (id === "boss" && scenarioId === "dragon-lair") return "finalboss";
  return id;
}
```

- `combatBgmTrack()` の `return "boss";` → `return sceneBgmTrack("boss");`
- `dungeonBgmTrack(kind)` → `kind === "combat" ? combatBgmTrack() : sceneBgmTrack(kind)`
- `:19942` / `:22644` の `bgm("boss")` → `bgm(sceneBgmTrack("boss"))`
- ⚠ 置き場所: `SCENE_BGM_OFF` は他の撤退スイッチ(`BOSS_APPROACH_OFF` `index.html:4292` など)の近く。`sceneBgmTrack` は `combatBgmTrack` の直前。`scenarioId` / `RUN` / `currentNodeId` は呼ばれる時点(ゲーム開始後)では宣言済み。
- ⚠ 廃坑の `?graph=0`(旧単一マップ・プレイヤーは見ない)は `RUN` が null なので `mine_gate` は鳴らない。それでよい。
- ⛔ 中ボス(`midboss`)・エンディング(`rest`)・酒場は変えない。

## 6. STEP3 — `verify_synth_bgm.js` の言い直し

§2-5 の表の判定を言い直す。⭐ (3e) は消さずに**主張を狭める**: 「`sceneBgmTrack` の差し替え 2 件を除けば、`dragon-lair` も生成クエストも基準列と同じ」。
⭐ 言い直しは**新規受入より前のコミット**に置く(dev-loop の作法: 既存 golden の言い直し → 新規受入)。

---

## 7. 撤退スイッチ

- **`?scenebgm=0`** — `sceneBgmTrack` が恒等になり、#88 の 9 曲だけの姿へ戻る(`TRACKS` に 2 曲が在っても鳴らない)。
- ⚠ 判定位置 = `index.html` の `SCENE_BGM_OFF`(ページ読み込み時に 1 回)。ページ遷移はまたがない(BGM の差し替えは `index.html` の中だけで完結するので、各ページが独立に読めばよい = `?heromark=0` と同じ型)。

---

## 8. 受入条件 — `tools/verify_scene_bgm.js`(新規・port 10629)

#88 の `verify_synth_bgm.js` の配信・スパイ・オフライン描画をそのまま流用する。ID は **2 経路**で取る: 経路 A = `GameAudio.playBgm` を包んだスパイへ渡った最後の ID / 経路 B = `GameAudio.__bgmTrack().name`(実際に鳴っている曲)。関数 `sceneBgmTrack` を直接呼んだ値は**補助**(経路 A/B の代わりにしない)。

### §0 装置

- **(0a)** 経路 A のスパイが 1 件以上 ID を捉えている(全ページ)。⭐ これが無いと全 assert が空振りで永久緑になる。
- **(0b)** `__bgmTrackIds()` に `mine_gate` と `finalboss` が在る / 2 曲とも `__renderBgmOffline(id, 12)` が無音でない(RMS > -40)。
- **(0c)** 廃坑のページで `RUN.graph.entry` が取れ、`currentNodeId` がそれに一致する(entry に居ることの確認)。

### §1 廃坑

- **(1a)** 廃坑の entry で探索 → A・B とも `mine_gate`。
- **(1b)** `setPhase("combat")` → `combat`、戦闘後 `setPhase("explore")` → `mine_gate` に戻る。
- **(1c)** n1(玉座の間)へ進んで探索 → `explore`(entry だけの曲であること)。
- **(1d)** n1 のボス(グリクス)戦 → `boss`(廃坑のボスは汎用のまま)。

### §2 竜の巣

- **(2a)** ボス部屋に入った経路(`:19942`)→ `finalboss`。
- **(2b)** 戦闘中に玉座へ詰めた経路(`:22644` のラッチ)→ `finalboss`。
- **(2c)** `__inBossRoom = true` で `setPhase("combat")` → `finalboss`。
- **(2d)** 竜の巣の普通の探索 → `explore` / 普通の戦闘 → `combat`。

### §3 他のシナリオと生成クエスト

- **(3a)** 森・沼地・砦・神殿で探索 → `explore`・ボス → `boss`(4 シナリオとも)。
- **(3b)** ⭐ 生成クエスト(`themeId: "goblin-mine"` と `themeId: "dragon-lair"` の 2 本)で探索 → `explore`・ボス → `boss`(罠 A の検出器)。
- **(3c)** 街道の襲撃(`road-ambush`)で探索/戦闘が差し替わらない。

### §4 音量

- **(4a)** `mine_gate` の RMS が -18.0 以上かつ -12.38 以下(`explore` + 1dB)/ `finalboss` が -18.0 以上かつ -13.58 以下(`boss` + 1dB)。⚠ 基準の `explore` / `boss` は**実行時に同じ式で測った値**から出す(-13.38 / -14.58 を直書きしない)。
- **(4b)** 2 曲の lead が他の全曲のどれとも一致しない(写し間違いの検出)。

### §5 撤退

- **(5a)** `?scenebgm=0` で廃坑の entry → `explore`、竜の巣のボス → `boss`。
- **(5b)** `?scenebgm=0` でも `TRACKS` に 2 曲は在る(撤退は選曲だけを戻す)。

### §9

- **(9a)** pageerror 0 件。

### ⛔ 測らないこと

- `bpm` / `makeup` / 各 Gain の具体値、旋律の良し悪し、ピーク(#88 依頼書 K7 と同じ)。曲調の最終判断は §9 の実機で耳で。

### 負のコントロール(`--negative`。赤くならなければ exit 1)

配信スナップショットへ実行時に文字列置換で欠陥を注入する(#88 の方式。アンカーは 1 行・ちょうど 1 ヒット・置換前後で長さを変える・他の tools にアンカーが出てこないことを起動時に検査)。

| port | 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|---|
| 10630 | `themekey` ⭐ | `sceneBgmTrack` の 2 つの `scenarioId` を `_scenIdForTex` に置き換える | **(3b)** |
| 10631 | `latchleak` ⭐ | `:22644` を `bgm("boss")` に戻す(素通し) | **(2b)** だけ |
| 10632 | `entryall` | `mine_gate` の条件から `currentNodeId === RUN.graph.entry` を外す | **(1c)** |
| 10633 | `noswitch` | `SCENE_BGM_OFF` を常に `false` に | **(5a)** |

⭐ `themekey` が §2-2 の罠 A、`latchleak` が §2-3 の罠 B の再現。各変異で「担当の節が赤・担当外は全部緑」でなければ ✗。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_synth_bgm.js` → 言い直し後に**全緑**(本数は実装窓が実測で確定。素は 35/35・2026-10-15)/ `--negative` 6/6。
- BGM を読む本: `driver_grid_p8.js`((6a2) は「ボス曲でない」を見る = 影響なしの見込み)/ `probe_boss_latch.js`(廃坑の `boss` = 影響なしの見込み)/ `probe_p9_tour.js` / `driver_graph_sce1.js` / `driver_graph_kinds.js` / `verify_title_screen.js` / `verify_world_map.js`。
- 母集団の非退行は dev-loop の作法どおり(#93 の基準から)。
- ⚠ 基準は 2026-10-15 時点の記録。走らせて違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須(file:// では音が出ない)。**#88 の新曲 3 曲の試聴と同じ回で、5 曲まとめて聴く**順番:

1. `title.html` → タイトル曲(#88)
2. 酒場から港町へ → 港町曲(#88)/ ワールドへ → 広野の曲(#88)
3. 廃坑を受注 → **最初の部屋で `mine_gate`**(戦闘で切り替わり、戦闘後に戻るか)→ 玉座の間で汎用の探索曲に変わるか
4. 竜の巣 → **ボス部屋で `finalboss`**(DM の語り・効果音とかぶらないか)
5. 音量: 合成曲が mp3 時代より 5〜6dB 大きい疑い(#88 の宿題)も一緒に判断する

---

## 10. changelog(⚠ `index.html` / `audio.js` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>廃坑の入口とファラクサス戦に専用曲</b> — 廃坑の最初の部屋では暗い坑道の曲が、竜の巣の決戦では業火の行進が流れるようになった。"

---

## 11. やらないこと

- ⛔ グリクス戦の専用曲 / 廃坑の玉座の間(n1)の専用曲(別チケット候補・2 曲の試聴の後で判断)。
- ⛔ 既存 9 曲の旋律・音量の変更(#88 の宿題「音量 +5〜6dB」は §9 の耳の判断を待つ)。
- ⛔ エンジンに「イントロ(1 回だけ鳴る頭)」を足すこと。
- ⛔ 生成クエスト・街道の襲撃・酒場の曲の差し替え。
- ⛔ mp3 の復活(#88 で撤去済み)。
- `実装依頼書/README.md` へ足す行(起草コミットで追加):

    | 94 | [2026-10-15_scene-bgm-mine-dragon.md](2026-10-15_scene-bgm-mine-dragon.md) | **承認済** | 0% | 廃坑の入口曲(暗い坑道の足音)+ 最終ボス曲(業火の行進)を合成で 2 曲。差し替えは `sceneBgmTrack` 1 か所に集める。⚠ シナリオは `scenarioId` で見る(themeId だと生成クエストに漏れる)・ボス曲の直呼び 2 本も包む。⚠ `verify_synth_bgm` の (0b)(2b)(1e)(3a)(3e) は意図して赤くなる → 言い直し。撤退 `?scenebgm=0`。新 port 10629〜10633・次 base 10634 |

---

## 12. 実装結果

(実装窓が埋める)
