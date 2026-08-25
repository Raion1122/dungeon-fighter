# #20 タイトル画面(キャラ選択)に専用 BGM「opening」を流す

- **起草**: 2026-08-25(計画窓) / **ステータス**: **完了 `5531ffb`**(2026-08-25 ユーザー承認 → 同日実装・push 済)
- **触るファイル**:
  - `assets/bgm/opening.mp3`(**新規**・`C:\Users\PC_User\Desktop\BGM\opening.mp3` からコピー)
  - `audio.js`(`BGM_FILES` へ 1 件追加)
  - `title.html`(ヘッダコメントの ★音 節を書き換え / 撤退スイッチ / 呼び口 2 本)
  - `tools/driver_bgm_title.js`(**新規** = 受入条件の装置)
  - `tools/verify_title_screen.js`(**既存 golden の期待値を反転** — §8-6 に手順)
  - `tavern.html`(changelog 1 行のみ。`py tools/add_changelog.py` が書く)
- ⛔ **触らないファイル**: 無し。**2026-08-25 時点で `git status` はクリーン**・`origin/main` と同期済で、
  別窓は稼働していない(実測)。着手時にもう一度 `git -c core.quotepath=false status --short` を見ること。

---

## 1. 目的

`title.html`(開始画面 → 名乗り = キャラ選択)は **今も完全に無音**。効果音は鳴るが BGM は 1 音も出ない。
これは #6 のときの意図的な判断で、ヘッダコメントにこう書いてある(起草時 `title.html:36-40`):

```
★ 音 (Phase 1 の方針)
  - **BGM を鳴らさない。** tavern の曲を鳴らすと遷移した瞬間に同じ曲が頭出しへ戻る
    (ページごとに AudioContext が別)。しゃっくりが出るくらいなら無音のほうが粗が少ない。
    ⚠ ここに GameAudio.playBgm(...) を足さないこと。タイトル専用 BGM は別チケット。
```

⭐ **本チケットがその「別チケット」。** そして当時の見送り理由(= 遷移先と同じ曲が頭出しへ戻る)は
**今回は原理的に起きない** — タイトルは `opening.mp3`、遷移先の街は `village08.mp3` で **別の曲**だから、
ページが変わったときに曲が変わるのは「しゃっくり」ではなく **正しい場面転換** になる。

**ユーザー決定(2026-08-25)**:

- **曲** = `C:\Users\PC_User\Desktop\BGM\opening.mp3`(実測 3:33 / 128 kbps / 3,418,488 bytes)
- **鳴る範囲** = `title.html` の **両画面**(記録スロット選択 + 名乗り / キャラ選択)。
  同一ページなので画面 1 → 2 で曲は切れない(§2-4)
- **出所(クレジット)** = **魔王魂** → ⭐ **画面のクレジット行は変更不要**(§2-6)
- **音量** = **基準どおり**。実効 −19.9 LUFS = `volume 0.33`(§2-5)。
  ⛔ 不採用: 「オープニングらしく +3 dB(0.47)」— 街へ入った瞬間に 3 dB 下がるのを避けた

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. BGM の呼び口は全部で 5 箇所(リポジトリ全文 grep で実測)

```bash
grep -rn 'playBgm(' --include=*.html --include=*.js . | grep -v node_modules | grep -v '^./tools/' | grep -v 'audio.js:'
```

| ファイル:行 | いつ | 何を渡すか |
|---|---|---|
| `index.html:3091` | ダンジョン中(`bgm(n)` ラッパ経由) | `NODE_BGM` / `SCENARIO_BOSS_BGM` の ID |
| `tavern.html:6173` | 最初の `pointerdown` の中(**ロードでは呼ばれない**) | `TAVERN_BGM_ID` = `"tavern_room"` |
| `town.html:651` | 最初の `pointerdown` の中 | `TOWN_BGM_ID` = `"town"` |
| `town.html:654` | **ページロード中**(即時) | 同上 |
| `title.html` | **0 箇所**(コメントで禁止されているだけ) | — |

⭐ **`town.html` は「ロード中」と「最初のタップ」の 2 本を両方持つ**(`:651` と `:654`)。
本チケットはこの形をそのまま写す。理由は §2-2。

### 2-2. ⚠⚠⚠ 罠 A: `unlock()` は **モジュール内部の** `playBgm` を呼ぶ

ブラウザはユーザー操作の外で音を出せない。`audio.js` はそれを **pendingBgm で待たせる** 設計:

```js
// audio.js:385-386  (playBgmFile)
if (!ensureContext()) { pendingBgm = id; return; }
if (!unlocked)       { pendingBgm = id; return; }

// audio.js:119  (unlock)
if (pendingBgm) { var p = pendingBgm; pendingBgm = null; playBgm(p); }   // ← ★ ここ
```

⚠⚠⚠ この `playBgm(p)` は **クロージャ内のローカル関数** であって `GameAudio.playBgm` ではない。
したがって **`window.GameAudio.playBgm` を差し替えたスパイでは、pendingBgm から再生された分を 1 件も数えられない。**

**この罠が実装と検証の両方を決める**:

1. **実装**: ロード中の 1 本だけにすると、実際には鳴っているのに外からは見えない
   → **`town.html` と同じく「ロード中」+「最初の pointerdown の中」の 2 本** を置く。
   タップ中の 1 本は `GameAudio.playBgm` 経由なので **外から観測できる**。
2. **検証**: 「どのキーを渡したか」(スパイ)だけでは足りない。
   **`GameAudio.__bgmFileState()` で「実際にどの mp3 を掴んで鳴らしているか」を突き合わせる**(§8 の 2 経路)。

### 2-3. ⚠⚠ 罠 B: 既存 golden `verify_title_screen.js` が「BGM は 0 回」を assert している

`tools/verify_title_screen.js` の **受入条件 10** は、本チケットで **必ず赤くなる**。3 箇所ある:

| 場所(起草時の行) | 現在の式 | 本チケット後 |
|---|---|---|
| `judgeTitleAudio()` `:305` | `(o.bgmCalls || []).length === 0` | **1 件で、その ID が `title`** |
| `(10)` `:1907` | 「BGM は 1 回も鳴らない」 | 「BGM が `title` でちょうど 1 回鳴る」 |
| `(10n)` `:1923` | `bgmBefore === 0` | `bgmBefore === 1` |

⛔ **削除して逃げないこと。** この 3 段(① `installed.playBgm === true` ② `unlockAfter === 1`
③ 負のコントロール)は「**スパイの掛け損ねでも緑になる**」を塞ぐために作られている。
**仕様が反転したので期待値を反転する** のであって、検査そのものを弱めるのではない。書き換え方は §8-6。

⭐ このドライバのスパイは `openPage()` の **後** に掛かる(起草時 `:1877-1878`)ので、
**ロード中の 1 本は捉えられず、最初のタップの 1 本だけを捉える** → だから `=== 1`。
(新規ドライバ側は `evaluateOnNewDocument` の setter 方式でロード中の分も捉える。§8 の計測機構)

### 2-4. `title` という ID は誰とも衝突しない(実測)

合成トラック `TRACKS` のキーは **6 個**(`audio.js` を読んで実測):
`tavern` / `explore` / `combat` / `boss` / `midboss` / `rest`。
`BGM_FILES` のキーは **9 個**: `dungeon_normal` / `dungeon_climax` / `boss_battle` / `pharaxus_stage` /
`town` / `tavern_room` / `mine_entrance` / `mine_depths` / `mine_boss`。

⭐ **`title` はどちらにも無い** → #17 が踏みかけた「同じ ID が `BGM_FILES` と `TRACKS` の両方に在る」
罠(`playBgm` は `BGM_FILES` を `TRACKS` より **先に** 見る。`audio.js:454`)には当たらない。
⚠ ただし **その罠が復活していないことは機械で検査し続ける** → §8 の (3a) と `shadow` 変異。

⭐ **画面 1(スロット)→ 画面 2(名乗り)で曲は切れない。** 同一ページ・同一 `AudioContext` で、
`playBgmFile` に dedup がある(`audio.js:387`: `if (bgmFileId === id && bgmEl && !bgmEl.paused) return;`)。
そもそも呼び口を画面遷移に足さないので、二度目の呼び自体が起きない。

### 2-5. 音量の実測と逆算

| 対象 | 実測 | → 採用値 |
|---|---|---|
| `opening.mp3` | **I = −10.3 LUFS** / LRA 14.0 LU / True Peak **+1.6 dBFS** / 213.66 秒 | **`volume: 0.33`**(実効 −19.9 LUFS) |

逆算式(既存 8 曲と同じ): `volume = 10^((−19.9 − 実測)/20) = 10^((−19.9 + 10.3)/20) = 10^(−0.48) = 0.331`

**基準の再現も取れている**(依頼書の数字を信じずに測り直した):

- 基準 = `dungeon_normal` = `assets/bgm/maou_game_dangeon22.mp3` を **この窓で再測定 → I = −15.5 LUFS**
  (`audio.js:313` のコメントの値と一致)
- その `volume 0.60` = `20*log10(0.6) = −4.44 dB` → 実効 **−15.5 − 4.44 = −19.94 ≒ −19.9 LUFS** ✅

**計測コマンド**(再測定するとき):

```bash
ffmpeg -hide_banner -nostats -i assets/bgm/opening.mp3 -filter_complex ebur128=peak=true -f null - 2>&1 \
  | sed -n '/Summary/,$p' | grep -E 'I:|LRA:|Peak:'
```

⚠ True Peak が **+1.6 dBFS**(0 を超えている)= 元素材の時点でインターサンプルクリップ気味。
`volume 0.33` を掛けた後は −8 dBFS 前後なので実害は無い。⛔ **音源をリマスタしない**(§11)。

### 2-6. クレジットは画面側の変更が要らない(#17 の知見の再確認)

⭐ **画面のクレジット行は `credit:` フィールドから生成されていない**(#17 で確定済)。実測で 2 箇所とも直書き:

| ファイル:行 | 中身 |
|---|---|
| `audio.js:853` | `"… ｜ BGM  魔王魂 / ユーフルカ"`(設定ダイアログ) |
| `index.html:13416-13417` | `<div class="erItem">魔王魂</div>` / `Wingless Seraph（ユーフルカ）`(スタッフロール) |

出所がユーザー決定で **魔王魂**(2026-08-25)= どちらの行にも既に載っている
→ ⛔ **`index.html` は 1 バイトも触らない。`audio.js:853` も触らない。**
`BGM_FILES.title` の `credit: "魔王魂"` を埋めるだけ(データ側の一貫性のため)。

⚠ `opening.mp3` に **ID3 タグは 1 バイトも無い**(`ffprobe -show_entries format_tags` が空の `[FORMAT]` を返す)。
出所はファイルからは永久に確認できない = **ユーザー回答が唯一の正**。

### 2-7. 容量(push 前)

| 対象 | 実測 |
|---|---|
| `opening.mp3` | 3,418,488 bytes(**3.26 MB**) |
| `.git` | **459 MB** |
| 既存 `assets/bgm/` の追跡ファイル | **9 件**(`git ls-files assets/bgm/` で実測) |

⭐ 追加 3.26 MB は既存の `Ariadne-LastBoss.mp3`(4.4 MB)より小さい。GitHub Free 枠の懸念は無い。
⚠ ファイル名は **ASCII のまま `opening.mp3`** で置く(`酒場.mp3` のような非 ASCII 名は
`core.quotepath` の罠を呼ぶので増やさない)。

### 2-8. 全ファイルが CRLF(変異の書き方に効く)

`audio.js` / `title.html` / `town.html` / `tavern.html` / `index.html` は **全部 CRLF**(実測)。
⚠ **ドライバの変異は必ず 1 行**にする。複数行の置換文字列は原理的に一致しない。

### 2-9. changelog の要否 → **鳴る(必須)**

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
# 24:GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

**`audio.js` を触るのでフックが発火する。** ⭐ そして **書けるプレイヤー向けの要約は実在する**
(「タイトル画面に曲が流れるようになった」は画面の外から見える変化そのもの)。§10 に文面。

⛔ `--no-verify` / `-c core.hooksPath=` は **ハーネスが全経路をハードブロック** する。迂回路は無い。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `assets/bgm/opening.mp3` | **新規**(コピーのみ・加工しない) |
| `audio.js` | `BGM_FILES` へ `title:` を 1 行 + 由来コメント |
| `title.html` | ヘッダ ★音 節の書き換え / `TITLE_BGM_ID` + `?titlebgm=0` / 呼び口 2 本 |
| `tools/driver_bgm_title.js` | **新規**(受入条件の装置・`--negative` 内蔵) |
| `tools/verify_title_screen.js` | 受入条件 10 の期待値を **反転**(3 箇所。§8-6) |
| `tavern.html` | changelog 1 行(`py tools/add_changelog.py` が書く。手で編集しない) |

⛔ **`index.html` は開かない。** §2-6 でクレジット行を触る必要が無いことを確認済み。
⛔ **`town.html` / `tavern.html` の BGM 配線は 1 文字も動かさない。**(§8 の (4a) が非退行を測る)

---

## 4. STEP1 — 曲を置いて `BGM_FILES` へ登録する

**4-1.** `assets/bgm/` へコピーする(加工しない):

```bash
cp "/c/Users/PC_User/Desktop/BGM/opening.mp3" assets/bgm/opening.mp3
ls -la assets/bgm/opening.mp3          # 3,418,488 bytes であること
```

**4-2.** `audio.js` の `BGM_FILES` へ追加する。
⚠ **行番号は必ず測り直す**(起草時 = `audio.js:316` の `pharaxus_stage` の直後、街コメントの直前)。
⚠ `audio.js` は CRLF。登録行は **1 行** で書く。

```js
    /* ── タイトル画面 (title.html) — 開始画面と名乗り (依頼書 #20) ──────────────
     *   #6 の Phase 1 は「無音」だった。見送り理由は「遷移先と同じ曲が頭出しへ戻る」で、
     *   ⭐ 今回は街が village08 = **別の曲**なので原理的に起きない。
     *
     *   ⚠⚠⚠ ブラウザはユーザー操作の外で音を出せない。ロード時の playBgm は
     *     pendingBgm へ落ちて、最初の pointerdown の unlock() が鳴らす (audio.js:119)。
     *     その再生は **モジュール内部の playBgm** を通るので、GameAudio.playBgm を
     *     包んだスパイからは見えない → title.html 側は「ロード」と「最初のタップ」の
     *     2 本を持ち、検証は __bgmFileState() と 2 経路で突き合わせる (依頼書 #20 §2-2)。
     *
     *   ⚠ volume は実測ラウドネスからの逆算。opening −10.3 LUFS → 0.33 (実効 −19.9 = 基準どおり)。
     *     ⭐ タイトルは安全地帯なので耳で動かしてよい
     *        (volume を動かしても driver_bgm_title の assert は 1 つも変わらない)。
     *   ⭐ 出所は 2026-08-25 にユーザー確認済み = 魔王魂。 */
    title:          { src: "assets/bgm/opening.mp3",             loop: true, volume: 0.33, credit: "魔王魂" },
```

⛔ **既存 9 件の `src` / `volume` / `credit` を 1 文字も動かさない**(§8 の (4b) が測る)。

---

## 5. STEP2 — `title.html` の配線

**5-1. ヘッダコメントの ★音 節を書き換える**(起草時 `title.html:36-40`)。
⛔ **古い禁止文を残さない。** 残すと次の人が「コメントに反している」と判断して剥がす。

```
    ★ 音 (依頼書 #20)
      - **BGM = GameAudio.playBgm("title")** — assets/bgm/opening.mp3 (魔王魂)。?titlebgm=0 で無音へ戻る。
        #6 の Phase 1 が無音だった理由 (遷移先と同じ曲が頭出しへ戻る) は、街が別の曲なので消えている。
      - 効果音だけでなく BGM も鳴る。最初の pointerdown で GameAudio.unlock() (iOS Safari の音声解錠に必須)。
      - ⚠⚠ 鳴り出すのは **最初のタップから**。ブラウザの自動再生ポリシーで、ページを開いた
        だけでは音が出ない (バグではない。依頼書 #20 §6)。
      - ⚠⚠ 呼び口は **2 本**。ロード時 (pendingBgm へ落ちる) と最初の pointerdown の中。
        unlock() が鳴らす分は **モジュール内部の playBgm** を通るので外から観測できない
        → タップ中の 1 本が「実装が生きている」ことを見せる唯一の窓になる (town.html と同じ形)。
      - ⚠ 実機で耳障りなら audio.js の BGM_FILES.title の volume を下げる (assert は壊れない)。
```

**5-2. `TITLE_BGM_ID` と撤退スイッチ** を、`?emblem=0` ブロックの **直後** に置く
(起草時 `title.html:374-379` の `} catch (e) {}` の後)。⚠ 行番号は測り直す。

```js
    /* ══ BGM の撤退スイッチ ?titlebgm=0 (依頼書 #20 §7) ═══════════════════
       タイトルを **無音** (Phase 1 の姿) へ戻す。効果音と unlock() は生かしたまま。
       ⚠ ?title=0 / ?emblem=0 とは **別のスイッチ**。相乗りさせると、赤が出たときに
         「タイトルを撤退したのか BGM を撤退したのか」が切り分けられなくなる。
       ⚠ sessionStorage へ写さない。タイトルは 1 ページで完結する話で、街は
         ?townbgm=0 を **独立に** 持っている (#15 / #17 と同じ作法)。 */
    var TITLE_BGM_ID = "title";
    try {
      if (new URLSearchParams(location.search).get("titlebgm") === "0") TITLE_BGM_ID = null;
    } catch (e) {}
```

**5-3. 呼び口 2 本**(起草時 `title.html:651-656` の ★音 ブロックを置き換える)。

```js
    // ══ 音 ═══════════════════════════════════════════════════════════
    /* iOS Safari は「ユーザー操作の中」でしか AudioContext を起こせない。最初の 1 回だけ解錠する。
       ⚠⚠ playBgm は **2 本**呼ぶ (town.html:651/654 と同じ形)。ロード時の 1 本は未解錠なので
         pendingBgm へ落ち、unlock() が鳴らす。タップ中の 1 本は GameAudio.playBgm を通るので
         外から観測できる = 検証がここを窓にする (依頼書 #20 §2-2)。
       ⛔ TITLE_BGM_ID が null (?titlebgm=0) のときは **1 本も呼ばない**。 */
    document.addEventListener("pointerdown", function () {
      try { if (window.GameAudio && GameAudio.unlock) GameAudio.unlock(); } catch (e) {}
      try { if (TITLE_BGM_ID && window.GameAudio && GameAudio.playBgm) GameAudio.playBgm(TITLE_BGM_ID); } catch (e) {}
    }, { once: true });
    try { if (TITLE_BGM_ID && window.GameAudio && GameAudio.playBgm) GameAudio.playBgm(TITLE_BGM_ID); } catch (e) {}
```

⛔ **`document.addEventListener` のままにする**(`window` へ変えない)。
既存 golden がこのリスナに実座標クリックを当てて `unlock` の回数を数えている。
⛔ **`showScreen("naming")` に `playBgm` を足さない**(§2-4。足すと画面 2 で曲が跳ねる余地を作る)。

---

## 6. STEP3 — 「鳴り始めはユーザーの最初のタップから」を仕様として書く

⭐ これは実装ではなく **受け入れの前提**。ブラウザの自動再生ポリシーにより、
**ページを開いた瞬間には音は出ない**。最初のタップ / クリックで鳴り出す。

- 既に `title.html` は最初の `pointerdown` で `GameAudio.unlock()` を呼んでいる(#6 の資産)
- ⛔ **「▶ タップして始める」のような待ち受け画面を作らない。** 今回の範囲外(§11)
- ⛔ **`--autoplay-policy` に相当する回避を本番へ入れない**(検証ドライバの Chrome 起動フラグだけの話)
- ⚠ この仕様を §5-1 のヘッダコメントに残すこと。書かないと「タイトルを開いても鳴らない」を
  次の人がバグとして追う

---

## 7. 撤退スイッチ

- **`?titlebgm=0`** — タイトルが **無音**(#6 Phase 1 の姿)へ戻る。効果音と `unlock()` は生きたまま。
- ⚠ **判定位置** = `title.html` の IIFE 内、`?emblem=0` ブロックの直後(§5-2)。
- ⚠ **ページ遷移をまたがない。** タイトルは 1 ページで完結し、街は `?townbgm=0` を独立に持つ。
  `sessionStorage` へ写す作法(`?town=0`)は **採らない**。
- ⚠ `?title=0`(タイトルごと素通り)とは **別のスイッチ**。`?title=0` を渡した時は
  そもそも `title.html` が `location.replace` するので BGM の話にならない。

---

## 8. 受入条件 — `tools/driver_bgm_title.js`(新規)

⭐ **音は headless で聴けない。「どのキーを渡したか」と「どの mp3 を掴んだか」の 2 経路で測る**
(`driver_bgm_mine` / `driver_bgm_town` と同じ方針)。流用元は **`tools/driver_bgm_town.js`(467 行)**。

⚠ **ポートは `PORT=9110`(`9110..9114` の 5 本)**。
`grep -rn "arg('port'" tools/*.js` の数え上げで **9102〜9309 は空き** と実測済(9101 の次は 9310)。

### ⚠ 計測機構(既存ドライバの写経では動かない点)

```js
/* ⚠⚠⚠ title.html は **ページロード中に** playBgm を呼ぶ (即時実行の 1 本)。
 *   ロード後に包んでは間に合わない → evaluateOnNewDocument で window.GameAudio に
 *   **setter を仕掛け**、audio.js 末尾の `global.GameAudio = GameAudio;` が走った瞬間に包む。
 *   (driver_bgm_town.js の機構をそのまま流用) */
await page.evaluateOnNewDocument(() => {
  window.__bgmSpy = { calls: [], installed: false };
  var _G = undefined;
  Object.defineProperty(window, 'GameAudio', {
    configurable: true,
    get() { return _G; },
    set(v) {
      _G = v;
      try {
        var orig = v.playBgm;
        v.playBgm = function () {
          window.__bgmSpy.calls.push(Array.prototype.slice.call(arguments));
          return orig.apply(this, arguments);
        };
        window.__bgmSpy.installed = true;
      } catch (e) {}
    },
  });
});
```

⚠⚠⚠ **このスパイでも `unlock()` の再生分は数えられない**(§2-2 の罠 A)。
だから **経路 B = `GameAudio.__bgmFileState()`** を必ず併走させる。片方の写経にしない。

⚠ Chrome の起動フラグは `driver_bgm_town.js:413-414` と同じ
(`--autoplay-policy=no-user-gesture-required` / `--mute-audio`)。
⛔ **このフラグは装置のもの。本番の設計根拠にしない**(実機では最初のタップが要る。§6)。

### §0 装置(先に母集団を確かめる)

- **(0a)** [装置] スパイが実際に掛かっている: `__bgmSpy.installed === true` かつ、
  **素の腕で `title.html` を開いただけ**(どのクリックよりも前)に `__bgmSpy.calls.length >= 1`。
  ⭐ **これが無いと (2a) 以降が「呼ばれていないから違反も無い」で永久緑になる**
- **(0b)** [装置] 変異ごとに配信バイト長が違う(同じ物を 2 回測っていない)
- **(0c)** [装置] `GameAudio.__bgmFiles()` を **実体から引けている**(表を写経していない):
  返る件数が **10 以上** かつ `town` / `tavern_room` / `mine_depths` を含む

### §1 曲の登録

- **(1a)** `__bgmFiles()` に `id === "title"` が在り、`src === "assets/bgm/opening.mp3"` で、
  その src への **HTTP GET が 200**(404 は **静かに無音** になるだけで画面に何も出ない)
- **(1b)** `title` の `credit` が空文字でない
- **(1c)** `title` の `volume` が数値で `0 < v <= 1`
  (⛔ **値そのものは assert しない** — 下の「測らないこと」)

### §2 タイトルで鳴ること(⭐ 2 経路)

- **(2a)** [経路 A] `title.html` を素で開くと、**どのクリックよりも前に** `playBgm` へ渡った
  引数がちょうど `["title"]` 1 件(= ロード時の呼び口が生きている)
- **(2b)** [経路 B] 最初の `pointerdown` を送った後、`__bgmFileState()` が
  `{ id: "title", srcId: "title", paused: false }` を返す(= 実際にその mp3 を掴んで再生している)
- **(2c)** 名乗り(キャラ選択)画面まで進めても `__bgmFileState().id === "title"` のまま
  (画面 1 → 2 で頭出しへ戻らない。§2-4)
- **(2d)** `__bgmSpy.calls` のうち `"title"` 以外の ID が **0 件**(タイトルで別の曲へ逸れていない)

### §3 ID 衝突(#17 の罠が復活していないこと)

- **(3a)** `__bgmFileIds()` の **全 ID** について `__renderBgmOffline(id, 0.2)` が **reject** する
  (= `BGM_FILES` の ID が合成 `TRACKS` と 1 つも衝突していない)。
  ⭐ `renderBgmOffline` は `TRACKS` しか見ないので、resolve したら「同じ名前が 2 つの別物」

### §4 恒等(非退行)

- **(4a)** `town.html` を素で開くと `playBgm` へ渡る ID が `"town"` のまま(街を巻き込んでいない)
- **(4b)** `__bgmFiles()` の **既存 9 件** の `id` / `src` / `volume` / `credit` が
  起草時のスナップショットと 1 件も違わない

### §5 撤退

- **(5a)** `title.html?titlebgm=0` → `__bgmSpy.calls.length === 0`(ロード時もタップ後も 1 本も呼ばれない)
  かつ最初のタップ後も `__bgmFileState().id === null`
- **(5b)** ⭐ **同じ腕で効果音は鳴っている**(ボタンを押すと `playSfx` が 1 回以上)
  = 「音まわりが丸ごと死んだ」で緑になっていない

### §6 ページエラー

- **(6a)** 測定した全ページで `pageerror` / `console.error` が 0 件

### ⛔ 測らないこと

- **`volume` の値**(0.33)。タイトルは安全地帯なので **耳で下げる余地を残す**。
  ⚠ 縛ると「うるさいから下げた」だけでドライバが赤くなる
- **鳴り始めの正確な時刻 / フェード**。ブラウザとデバイスで動く
- **曲の中身**(ラウドネス・尺・ループの継ぎ目)。`ffmpeg` で測る話であって配線の検査ではない

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

⚠ 置換文字列は **必ず 1 行**(全ファイル CRLF。§2-8)。置換後の長さを 1 文字以上ずらす((0b) が見る)。

| port | 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|---|
| 9110 | (素) | — | — |
| 9111 | `silent` | `title.html` の **ロード時の呼び口 1 本** を消す | **(0a) と (2a)** |
| 9112 | `badsrc` | `BGM_FILES.title` の `src` を存在しないパスへ | (1a) |
| 9113 | `shadow` | ID を `title` でなく **`tavern`** で登録する | **(3a)** |
| 9114 | `wrongkey` | `TITLE_BGM_ID` を `"tavern_room"` へ差し替える | (2b) と (2d) |

⭐ **`shadow` が §2-4 の罠(#17 の再演)を再現する変異。** `tavern` で登録すると
`BGM_FILES` と `TRACKS` が同じ名前を持ち、`__renderBgmOffline("tavern")` が resolve して (3a) が赤くなる。

⭐⭐ **`silent` が §2-2 の罠 A を突く。** ロード時の呼びを消しても pointerdown の 1 本は残るので
**(2b) は緑のまま** — 捉えられるのは母集団ガード (0a) と (2a) だけ。
**「装置が空振りしていない」ことを機械で見せるのがこの変異の役目** なので、必ず入れる。

### 8-6. ⚠⚠ 既存 golden `tools/verify_title_screen.js` の受入条件 10 を反転する

**仕様が反転したので期待値を反転する。検査の段数は減らさない。** 3 箇所:

```js
/* ① judgeTitleAudio()  (起草時 :298-305) — 最後の 1 行を差し替え */
    && o.unlockAfter === 1
    && (o.bgmCalls || []).length === 1                 // ★ #20: タイトル専用 BGM がちょうど 1 回
    && o.bgmCalls[0][0] === 'title';                   // ★ #20: 渡した ID は title

/* ② (10) のラベル (起草時 :1907) */
'(10) ★受入条件10: 最初のタップで GameAudio.unlock() がちょうど 1 回呼ばれ、BGM が title でちょうど 1 回鳴る'

/* ③ (10n) 負のコントロール (起草時 :1923-1929) */
const bgmBefore = (await readSpy(p10)).bgmCalls.length;   // ★ #20: 0 ではなく 1
…
  bgmBefore === 1 && spy3.bgmCalls.length === 2 && spy3.bgmCalls[1][0] === NO_SUCH
    && judgeTitleAudio(Object.assign({}, verdict, { bgmCalls: spy3.bgmCalls })) === false,
```

⭐ **`=== 1` であって `>= 1` ではない。** このスパイは `openPage()` の後に掛かるので
**ロード時の 1 本は見えず、最初のタップの 1 本だけ** を数える(§2-3)。
⚠ **(10z0)** の `spy0.bgmCalls.length === 0`(タップ前は 0)は **そのまま生かす**
— スパイを掛けるより前に走ったロード時の呼びは、この機構では原理的に見えないため。
⛔ **(10a)**(効果音は数えている)は 1 文字も触らない。
⛔ **ヘッダコメント `:16` の「BGM は 0 回」も一緒に直す**(直さないと本文と矛盾したまま残る)。

### 既存 golden の非退行(実装後に必ず走らせる)

| ドライバ | 期待 | 測定日 |
|---|---|---|
| `node tools/verify_title_screen.js` | **85/85**(⚠ §8-6 の書き換え **後**。書き換え前は必ず赤い) | ⭐ **2026-08-25 にこの窓で実測** |
| `node tools/driver_bgm_town.js` | **17/17** | ⭐ **2026-08-25 にこの窓で実測** |
| `node tools/driver_bgm_mine.js` | 37/37 | 2026-08-23 の記録(未再測) |
| `node tools/verify_town_map.js` | 85/85 | 2026-08-23 の記録(未再測) |

⚠⚠⚠ **`verify_title_screen.js` は 83/83 ではない。**
`.claude/skills/impl-request/references/measure-recipes.md` の golden 表は 83/83 と記録しているが、
**2026-08-25 に走らせたら 85/85 だった**(#12 が装置 assert を足したぶん増えている)。
⭐ **#19 で学んだ「依頼書の golden 基準値は起草時のスナップショットで、着手時には古い」がまた出た。**
⚠ **走らせて違ったら、期待値を書き換える前に理由を突き止める**(退行か、他チケットの追加か)。

---

## 9. 実機 / 実感の確認(ここが本当の受入)

⚠ **ローカルは http 起動が必須**(`file://` では音が出ない)。

1. **鳴り出しのタイミング** — タイトルを開き、**最初のタップで曲が立ち上がるか**。
   ⭐ ここが今回いちばん体感に効く。無音 → 1 タップ目で鳴る、という間が不自然でないか
2. **音量** — 街(`village08`)へ入った瞬間に **段差を感じないか**。感じたら
   `audio.js` の `BGM_FILES.title.volume` を耳で動かす(assert は壊れない)
3. **画面 1 → 2** — 記録スロットを選んで名乗り画面へ進んだとき、**曲が頭出しへ戻らないか**
4. **タイトル → 街** — 出発したとき、曲が `opening` から `village08` へ **素直に切り替わるか**
5. **ループ** — 3:33 でループする継ぎ目が耳につかないか(タイトルに 3 分半留まる人向け)
6. **iOS 実機(Safari)** — 最初の `pointerdown` で解錠されて鳴るか。
   ⚠ iOS 実機の確認は **全チケット共通の未了宿題**。ここも同じ扱い

---

## 10. changelog(⚠ `audio.js` を触るので必須)

```bash
py tools/add_changelog.py "<b>タイトル画面に曲が流れるようになった</b> — 記録を選ぶ画面と名乗りの画面で、序章のテーマが鳴る。"
```

⚠ 先頭 = 最新・既定 4 件維持(古いものが 1 件落ちる)。⛔ コミット件名のコピペ禁止。

---

## 11. やらないこと

- ⛔ **「▶ タップして始める」待ち受け画面**(自動再生ポリシーを演出で吸収する案)。別チケット
- ⛔ **`index.html` のクレジット / スタッフロールの変更**(§2-6 で不要と確認済)
- ⛔ **`audio.js:853` の設定ダイアログのクレジット行の変更**(同上)
- ⛔ **`town.html` / `tavern.html` / ダンジョンの BGM の音量や曲の変更**(#17 / #4 の決着に触らない)
- ⛔ **`opening.mp3` のリマスタ / トリム / ループポイント加工**(True Peak +1.6 dBFS は素材のまま使う)
- ⛔ **`?titlebgm=0` を `sessionStorage` へ写すこと**(§7。タイトルは 1 ページで完結する)
- ⛔ **`showScreen()` へ `playBgm` を足すこと**(§2-4)
- ⛔ **`実装依頼書/README.md` への行追加** は着手時に足す。用意してある行:

    | 20 | [2026-08-25_title-bgm-opening.md](2026-08-25_title-bgm-opening.md) | **承認済** | 0% | タイトル画面(記録選択 + 名乗り)へ専用 BGM `opening.mp3` を敷く。⭐ #6 が「別チケット」として明示的に残していた宿題で、見送り理由(遷移先と同じ曲が頭出しへ戻る)は街が別曲なので消えている。⚠⚠⚠ `unlock()` は **モジュール内部の** `playBgm` を呼ぶので `GameAudio.playBgm` スパイでは pendingBgm の再生分が見えない → 呼び口は `town.html` と同じ **ロード + 最初の pointerdown の 2 本**、検証は `__bgmFileState()` と 2 経路。⚠⚠ 既存 golden `verify_title_screen.js` の **受入条件 10 は「BGM 0 回」を assert している** ので必ず赤くなる → §8-6 の手順で **期待値を反転**(段数は減らさない)。⚠⚠⚠ その golden は **83/83 ではなく 85/85**(2026-08-25 実測。レシピ集の記録が古い)。⭐ 実測 opening −10.3 LUFS → `volume 0.33`(実効 −19.9 = 基準どおり)/ 出所 = 魔王魂(ID3 タグ無し・ユーザー確認)→ 画面のクレジット行は変更不要。⛔ 鳴り出しは **最初のタップから**(ブラウザの自動再生ポリシー)。撤退=`?titlebgm=0`(無音へ) |

---

## 12. 実装結果(2026-08-25 実装)

### 12-1. 検証の結果

| ドライバ | 結果 |
|---|---|
| `node tools/driver_bgm_title.js`(新規) | **16/16 PASS** |
| `node tools/driver_bgm_title.js --negative` | **14/14 PASS**(変異 4 本すべてが担当 assert を赤くした) |
| `node tools/verify_title_screen.js` | **85/85**(§8-6 の反転後) |
| `node tools/driver_bgm_town.js` | **17/17**(⚠ (0b) を 9→10 へ更新した後。下記) |
| `node tools/driver_bgm_town.js --negative` | **15/15** |
| `node tools/driver_bgm_mine.js` | **37/37**(無傷) |
| `node tools/verify_town_map.js` | **85/85**(無傷) |

⭐ **経路 B が headless でも取れた。** `(2b)` の実測値は
`{"id":"title","srcId":"title","hasEl":true,"paused":false,"node":true}` —
「ID を渡した」だけでなく **実際に mp3 を掴んで再生していた**。

### 12-2. ⭐⭐⭐ §2-2 の罠は実在した(機械で証明できた)

負のコントロール `silent`(ロード時の呼び口 1 本だけ消す)の実測:

- **(0a) 赤**(`loadCalls=[]`)/ **(2a) 赤**(同上)
- **(2b) 緑のまま** — pointerdown の 1 本が残っているので、実際には鳴り続ける

⇒ **「BGM が鳴っているか」だけを見ていたら、呼び口が 1 本死んでも永久に緑だった。**
母集団ガード (0a) と経路 A の (2a) が唯一これを捉える。§2-2 の設計判断が正しかったことの実測。

### 12-3. ⚠ 依頼書からの逸脱(3 件)

1. **§8 (4b) の「既存 9 件の volume も固定」を採らなかった。**
   `id` / `src` / `credit` の 3 つだけに縮めた。理由 = **#17 が「街と酒場の volume は耳で下げてよい」と
   明示的に決めており**(`audio.js:329` のコメント)、volume を固定すると**その決定を壊す**
   (耳で 0.54 → 0.45 にした瞬間にドライバが赤くなる)。volume は (1c) の `0 < v <= 1` に任せた。
2. **`title.html` のロード時の呼び口に末尾コメント `// ロード時 (pendingBgm へ落ちる)` を足した。**
   §8 の変異アンカーが**部分文字列一致**なので、コメント無しだと 2 箇所ヒットして
   起動時ガードが exit 3 になる(下記 12-4)。
3. **`tools/driver_bgm_town.js` の `(0b)` を触った**(依頼書の「触るファイル」に無かった)。
   曲を 1 件足すと `__bgmFiles()` が 9 → 10 になり、直書きの件数 assert が必ず赤くなる。
   **退行ではない**ので 9 → 10 へ更新し、「わざと直書きしている / 赤くなったら理由を突き止めてから直す」
   という意図をコメントで残した。

### 12-4. ⚠⚠⚠ 依頼書が外していた点

**変異アンカーは行ではなく部分文字列で照合される。**
`title.html` の呼び口 2 本は中身が同じで**インデントだけが違う**:

```
    try { if (TITLE_BGM_ID && … ) … } catch (e) {}       ← ロード時 (インデント 4)
      try { if (TITLE_BGM_ID && … ) … } catch (e) {}     ← pointerdown の中 (インデント 6)
```

インデント 6 の行は **インデント 4 の文字列を丸ごと含む** ので、`silent` のアンカーが
**2 箇所ヒット**して `MUT_SRC` の構築ガードが `exit 3`(変異の空振り)で止まった。
⇒ ロード時の行にだけ末尾コメントを付けて一意にした。
⭐ **「1 行 = 一意」ではない。同じ処理を 2 箇所に置く設計では、変異アンカーに識別子を仕込む。**

### 12-5. 依頼書が当てていた点

- ⭐ **`verify_title_screen.js` が 83/83 ではなく 85/85** だった(§8 に実測で書いておいたので混乱ゼロ)
- ⭐ 行番号のズレは **`(10)` 1907→1908 / `bgmBefore` 1923→1921 の 2 件だけ**(起草から同日のため)
- ⭐ `title` の ID 衝突は無し。`shadow` 変異(`tavern` で登録)は狙いどおり (3a) だけを赤くした
- ⭐ `?titlebgm=0` は `calls=[] state={"id":null,…}` で無音へ戻り、**効果音は鳴ったまま**((5b) 緑)

### 12-6. 残った宿題

- ⚠ **§9 の実機/実感の確認は未了**(6 項目)。特に **①鳴り出しの間** と **②街へ入る時の音量段差**。
  段差を感じたら `audio.js` の `BGM_FILES.title.volume`(現 0.33)を耳で動かす
  — **assert は 1 つも壊れない**((1c) が `0 < v <= 1` しか見ていない)
- ⚠ **iOS 実機(Safari)は未確認**(全チケット共通の宿題)
- ⚠ 3:33 のループ継ぎ目の耳障りは未評価
