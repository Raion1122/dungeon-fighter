# #74 ペンの音を録音へ — フェルトペンの実録を 1 画ずつ鳴らす

- **起草**: 2026-09-25(起草窓 `claude-c6`) / **ステータス**: **承認済**(2026-09-25 ユーザー承認)
- ⚠ **素材 = OtoLogic・CC BY 4.0・クレジット必須**(§2-1)。起草窓が 2026-09-25 にウェブで特定した**推定**で、ユーザーの最終確認待ち。
  §5-2 の `source` / `license` / `credit` と §6-3 のクレジット行はこの前提で埋めてある。⚠ 出所が違うと分かったら、着地前にこの 3 つとクレジット行を差し替える。
- **触るファイル**: `audio.js`(本体) / `sfx-pipeline/scripts/build_sfx.py` + `sfx_common.py`(粒の切り出し) / `sfx-pipeline/data/sfx-sources.json` /
  `assets/sfx/ui/narration_*.mp3`(新規・約 31 本) / `assets/sfx/sfx-manifest.json` / `assets/sfx/CREDITS.md` /
  `tavern.html`(**changelog 1 行だけ**・`add_changelog.py` 経由) / `tools/verify_pen_narration.js`(#73 受入の言い直し) / `tools/verify_pen_sample.js`(新規)
- ⛔ **触らないファイル**: `index.html` / `js/skill-check.js` / `assets/voice/**` / `sfx-pipeline/raw/**`(gitignore・コミットしない)
- 並走: 実装窓は待機中(#73 完了・push 済 `5051a2b`)。起草時点で作業ツリー clean。`git add .` 禁止・**ファイル単位 add**。

> ⚠⚠⚠ **行番号の読み方** — 本書の行番号は **基準 `5051a2b`**(= origin/main、2026-09-25)。⛔ 行番号は従、**識別子(逐語)が主**。着手時に逐語で引き直す。

---

## 1. 目的

#73 で朗読の声をやめ、文字送りに合わせて**合成のペンの音**(雑音を帯域フィルタに通した 3 画)を鳴らすようにした。
これを**フェルトペンで紙に書く実録音**へ差し替え、「DM が物語を書き綴っている」手触りを本物にする。

起草窓の測定で、合成音が本物らしく聞こえない理由も分かった(§2-1)。合成音のエネルギーは **1.8〜4.4kHz** に寄っているが、
実録のフェルトペンは **1〜15kHz に広く、重心 6〜9kHz**。合成は本物より**低くこもっている**。

**ユーザー決定(2026-09-25)**:

- ✅ **方針 A** — 録音 `Felt_Tip_Pen03-02(Write).mp3` を **1 画ずつ(約 31 粒)に切り**、文字送りの呼び口(3 文字に 1 回)で **1 粒ずつランダムに**鳴らす。
- ⛔ 不採用: **B** 合成のまま帯域を 6〜9kHz へ上げる / **A+おまけ** 語りの始めにキャップを開ける音・終わりにペンを置く音。
- ⚠ **9/21 の #73 の決定「録音素材は使わない」を、ユーザーがこのチケットで覆した**(利用条件の確認が要るのはそのため)。

---

## 2. 着手前の実測(起草窓が `5051a2b` の本番コードと実ファイルで確かめた事実・headless は回していない)

### 2-1. 素材 — `Downloads/Felt_Tip_Pen03-mp3.zip`(2026-09-25 20:06・457,283 バイト)

14 本・すべて **ステレオ 44.1kHz MP3**。**ライセンス文書は同梱なし**。
⭐ **出所 = OtoLogic(推定)** — `sfx-pipeline/README.md` が「inbox 方式・クレジット必須」と名指しするサイト。同サイトの「筆記用具」ページ
(`otologic.jp/free/se/writing_material01.html`)に、この ZIP と同じ種類分け(書く・直線・丸・チェック・塗りつぶし・開ける・閉める・置く)のフェルトペン素材がある
(2026-09-25 ウェブ検索。ページ本体は 403 で読めず)。
**利用条件 = CC BY 4.0**(`otologic.jp/free/license.html`)— 商用・ゲーム・加工すべて可、**「OtoLogic」のクレジット表記が必須**。
ゲームは**画面内の表記が最も望ましい**とされ、可能なら `https://otologic.jp` か `CC BY 4.0` を併記。⚠ CC BY 4.0 は**加工した場合その旨を示す**ことを求める(切り出し + 正規化 = 加工)。

| 種類 | 本数 | 長さ | 中身(起草窓の実測) |
|---|---|---|---|
| **02(Write)** ⭐採用 | 1 | 9.39s | **31 画・間隔の中央値 248ms・1 画の中央値 106ms**・全体 **−21.0 LUFS** / 峰 −3.2 dBFS(ebur128) |
| 01(Write) | 1 | 11.15s | 15 画・間隔 806ms(ゆっくり) |
| 直線・丸・チェック・塗り | 8 | 約 1.7s | 1〜2 画のひと筆 |
| キャップ開/閉・置く | 4 | 約 1.7s | ⚠ 12(Close) 峰 **+2.0 dBFS** / 14(Put_Down) **+0.8 dBFS** = 割れている(今回は使わない) |

- ⭐ **02 のリズムはゲームの呼び口とほぼ一致する** — 呼び口は 3 文字に 1 回 × 既定 70ms = **210ms おき**、02 の画の間隔は **248ms**。
- ⚠ **全 14 本に先頭無音 113〜192ms**(MP3 の符号化遅延 + 収録)。丸ごと鳴らすと文字から音が遅れる → 粒の切り出しで消える(§5-3)。
- 重心(全帯域の振幅重み平均): Write 7,052〜7,715Hz / 直線・丸・チェック 6,086〜9,023Hz。合成の `penStrokes` は `cutoff 2800〜4400 → 1800〜3400`(`audio.js:221`)。

### 2-2. 呼び口は 2 箇所・経路は 1 本

| ファイル:行 | 何 |
|---|---|
| `index.html:14711` | `typeNarrationParagraph` 内 `if (i % 3 === 0) sfx("narration");` |
| `tavern.html:8414` | 同上(酒場の前口上) |

(本番を `grep -rn '"narration"' --include=*.html --include=*.js` で全数。他は `audio.js` の 3 行だけ)
両方とも `sfx()` ラッパ(`index.html:3253` / `tavern.html:8400`)→ `GameAudio.playSfx(name)`(`audio.js:737`)。
`playSfx` は**最初に `playSampled(name)` を試し、false のときだけ合成レシピへ落ちる**(`audio.js:740`)。
⇒ ⭐ **`sfx-manifest.json` に `narration` を登録するだけで、呼び口を 1 行も直さずに録音へ切り替わる**。`index.html` は開かない。

### 2-3. ⚠⚠⚠ 罠A — 録音の経路は「語り 音量」を通らない

```js
// audio.js:694 (playSampled)
var route = (def.bus === "ui" || name === "button" || name === "narration") ? buses.ui : buses.sfx;
```

#73 が `voice` バスへ付け替えたのは**合成の経路だけ**(`audio.js:743`)。録音の経路は `narration` を **`ui` バス**へ流す。
⇒ 素材を登録しただけだと、**「語り 音量」つまみでペンの音が変わらない**(効果音 音量 × 0.9 に連動してしまう)。
⭐ §8 の変異 **`busui`** で装置に内蔵する。

### 2-4. ⚠⚠⚠ 罠B — 撤退 `?penvoice=0` でも録音が鳴る

`playSampled` は `PEN_NARRATION` を見ない(`audio.js:681-699`)。素材を登録すると、
**`?penvoice=0`(朗読 + 3 文字ごとの「ピッ」へ戻す撤退)でも録音のペンが鳴り、「ピッ」が戻らない**。
#73 受入の (4a)「off の narration が旧版とサンプル単位で一致」と (5a) の撤退が崩れる。
⭐ §8 の変異 **`nogate`** で装置に内蔵する。

### 2-5. ⚠⚠⚠ 罠C — 粒ごとの正規化はできない(測定不能)

既存パイプラインの単発整形は **1 ファイルごとに `loudnorm=I=-16:TP=-1.5` + 先頭無音トリム**(`sfx_common.py` `normalize_single`)。

| 対象 | loudnorm の `input_i` |
|---|---|
| 02(Write) 全体 9.39s | **−21.15 LUFS**(正常・`target_offset` 0.60) |
| 1 粒(0.30s 地点から 0.12s) | **`-inf`(測定不能)** — EBU R128 のゲートは 400ms 窓 |

⇒ 粒を 1 本ずつ `normalize_single` に通すと**利得が定まらない**うえ、成功しても**画ごとの強弱(峰の幅 14.2dB)が全部同じ大きさに潰れる**。
**全体を 1 回正規化してから切る**。⭐ §8 (1d)「峰の幅 ≥ 6dB」と変異 **`flatgrain`** で装置に内蔵する。

    ffmpeg -hide_banner -nostats -i "<02(Write).mp3>" -af loudnorm=I=-16:TP=-1.5:print_format=json -f null - 2>&1 | grep input_i
    ffmpeg -hide_banner -nostats -ss 0.30 -t 0.12 -i "<02(Write).mp3>" -af loudnorm=I=-16:TP=-1.5:print_format=json -f null - 2>&1 | grep input_i

### 2-6. ⚠⚠ 罠D — `build_sfx.py` のクレジット台帳は「処理した ID だけ」で書き直される

`write_credits(credit_rows)`(`build_sfx.py:146`・定義 `:156`)は、**その回にループで通った ID の行だけで `CREDITS.md` を丸ごと書き直す**。
⇒ **`--only narration` で回すと、既存 8 ID の行が消える**(manifest は既存を読んでから上書きするので残る = 2 つが食い違う)。

- 全体で回すのは安全だった(起草窓が `gather()` とハッシュを**書き込みなしで**実行して確認):
  素材があるのは既存の 8 ID だけ(`hit_flesh` / `hit_bone` / `hit_blocked` / `ui_tap` / `ui_confirm` / `ui_cancel` / `door_open` / `item_get`)で、
  **8 本ともハッシュ一致 = skip**(再エンコードされない)。残り 18 ID は素材 0 本 = inbox 待ちのまま。`raw/packs/` はこの PC に在る。
- ⚠ 手動投入(inbox)素材のライセンスは `pack_meta()`(`:73`)が **`"(要 inbox の出典記入)"`**(`:78`)という仮置きを返す = 台帳に正しい条件を書く口が無い。

### 2-7. ⚠ 罠E — 初回の粒は合成に落ちる

`playSampled` は buffer が未ロードなら **fetch だけして false を返す**(`audio.js:687`「初回は fetch だけ→今回は合成へ」)。
31 粒をランダムに選ぶ(`:685`)ので、先読みしないと**最初の数十回は合成と録音が混ざる**。
⇒ **`preload: "eager"`**(manifest 読込直後に全粒を取りに行く・`eagerPreloadSfx` `audio.js:664`)。
合成 `penStrokes` は**消さずに fallback として残す**(file:// ・fetch 失敗・読込前)。

### 2-8. 切り出しの実測(しきい値を振っても安定)

10ms 窓 RMS 包絡・ヒステリシス(開始 hi / 終了 lo・ピーク包絡比)・隙間 < 併合ms を 1 画に併合:

| hi / lo / 併合 | 粒数 | 長さ min / 中央 / max | 峰の範囲 |
|---|---|---|---|
| **−18 / −28 dB / 25ms** ⭐既定 | **31** | 84 / 106 / 375 ms | −14.6〜−0.4 dBFS(幅 14.2dB) |
| −20 / −30 / 25 | 33 | 54 / 108 / 383 | 幅 19.0dB |
| −16 / −26 / 25 | 33 | 36 / 98 / 337 | 幅 14.2dB |
| −18 / −28 / 40 | 30 | 84 / 104 / 375 | 幅 14.2dB |

⇒ 粒数は**定数で焼かない**(30〜33 で揺れる)。受入は manifest から導出し、範囲 **20〜40** で守る。

### 2-9. #73 受入 `tools/verify_pen_narration.js` の前提が崩れる所

sfx の素材に触る検証道具は**この 1 本だけ**(`grep -ln "sfx-manifest\|assets/sfx\|playSampled\|preloadSfx" tools/*`)。その中で「録音を鳴らさない」を正としているもの:

| assert / 変異 | 今の正 | #74 後 |
|---|---|---|
| **(0c)** | 配信 manifest に `narration` キーが**無い** | ある |
| **(2b)** | `playSfx("narration")` 1 回 = BufferSource **3**・Oscillator 0 | 録音 1 |
| **(2c)** | 3 画すべて voice バス | 1 粒が voice バス |
| 変異 **`sampledpen`** | manifest に narration を足すと赤 | それが正になる |

- 崩れない: (2a)(4a)(4b) は `__renderSfxOffline`(合成レシピの描画)= 録音を通らない / (1d) の mp3 数えは **`/assets/voice/` だけ**(`:463` のフィルタ)= 粒の先読みでは赤くならない。
- ⭐ 言い直しの方針は §7。

### 2-10. 文字送りの速さ

間隔 = `charMs || GameAudio.textSpeed || 70`(`index.html:14703`)。`textSpeed` は `clamp(0, 200)`(`audio.js:31`・0 は `||` で 70 へ)。
⇒ 呼び口の間隔は 3 文字ぶん = **3〜600ms**。速い設定では粒(中央 106ms・最長 375ms)が重なる。**許容する**(§8「測らないこと」)。

### 2-11. changelog とクレジット

- `check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ `audio.js` を触るので**必須**。書けるプレイヤー向けの要約が実在する(§10)。
- クレジット必須素材なら 2 箇所: `assets/sfx/CREDITS.md`(自動生成)と、**ゲーム内設定画面のクレジット行 `audio.js:910`**
  (`openSettings` 内・`"ナレーション音声  VOICEVOX:… ｜ BGM  魔王魂 / ユーフルカ"`)。`sfx-pipeline/README.md` と `CREDITS.md` 冒頭がこの 2 箇所を指示している。
- ⭐ `:910` は `driver_dev_gate (D7)` の `closeSettings` 300 文字窓(`audio.js:834`〜`:836`)の**外** = 行を足しても (D7) は腐らない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `sfx-pipeline/scripts/build_sfx.py` / `sfx_common.py` | ① mapping の **`grains`** モード(全体を 1 回正規化 → 切る) ② mapping の `license` / `credit` / `source` の上書き(inbox 用) ③ `CREDITS.md` を**最終 manifest から**書く(罠D) |
| `sfx-pipeline/data/sfx-sources.json` | mapping に `narration` を 1 件 |
| `assets/sfx/ui/narration_1..N.mp3` / `sfx-manifest.json` / `CREDITS.md` | パイプラインの出力(手で書かない) |
| `audio.js` | ① 撤退スイッチ `PEN_SAMPLE` ② `playSampled` の関門と出口(罠A・罠B) ③ 設定画面のクレジット行(OtoLogic・CC BY 4.0 = 必須) |
| `tavern.html` | **changelog 1 行だけ** |
| `tools/verify_pen_narration.js` | (0c)(2b)(2c) と変異 `sampledpen` の言い直し(§7) |
| `tools/verify_pen_sample.js` | 新規受入(§8) |

⛔ `index.html` は開かない(§2-2)。⛔ `sfx-pipeline/raw/` はコミットしない(`.gitignore:11`)。⛔ `assets/voice/**` と `penStrokes` の数値は動かさない。

---

## 4. STEP1 — 着手前の基準取り(本番も tools も 1 バイトも触らない)

1. `git log --oneline -1` / `git status --short`。
2. アンカーを逐語で引き直して件数を数える: `function playSampled(` / `var route = (def.bus === "ui" || name === "button" || name === "narration")` /
   `var route = (PEN_NARRATION && name === "narration")` / `if (i % 3 === 0) sfx("narration")`(index・tavern 各 1)/ `cred.textContent = "ナレーション音声` / `def write_credits(`。
3. 母集団を 3 段の union で導出(⛔ 本数を定数で焼かない)。`audio.js` の blob が変わるので #73 の凍結 TSV は**流用不可** ⇒ 着手前の全数走査が要る(#73 実績 151 腕 298 分)。
   ⚠ **試遊サーバ 8765 を止めてから**走らせ、終わったら立て直す(`auto_debug_run.js` が 8765 を自前で立てる)。
4. §2-3 罠A と §2-4 罠B を**本番で 1 回再現**する — 配信スナップショットの manifest に `narration` を足した腕で、
   (a) 出口が `ui` バス (b) `?penvoice=0` でも録音が鳴る、を観測。⚠ 再現しなければ §12 に理由を書いて止まる。

---

## 5. STEP2 — 素材化(`sfx-pipeline/` と `assets/sfx/`)

### 5-1. 元素材を inbox へ

`Felt_Tip_Pen03-02(Write).mp3` を ZIP から `sfx-pipeline/raw/inbox/narration/` へ置く(**コミットしない**)。

### 5-2. mapping に `narration`(`sfx-sources.json`)

```json
"narration": {
  "category": "ui", "takes": 1, "volume": 0.4, "pitchVar": 0.05, "bus": "voice", "preload": "eager",
  "candidates": ["raw/inbox/narration/*"],
  "grains": { "hiDb": -18, "loDb": -28, "mergeMs": 25, "minMs": 40, "maxMs": 400, "preMs": 5, "fadeInMs": 2, "fadeOutMs": 20 },
  "source": "OtoLogic", "license": "CC BY 4.0", "credit": "OtoLogic (https://otologic.jp) — 1 画ずつ切り出し・音量正規化の加工あり",
  "_note": "#74 ペンの実録を 1 画ずつ。全体を 1 回 loudnorm してから切る (粒ごとは -inf で測れない = 依頼書 §2-5)"
}
```

- `volume` 0.4 は**耳で詰める初期値**(§8 測らないこと)。`bus: "voice"` は台帳の記録用(出口は `audio.js` 側で決める = §6-2)。

### 5-3. `grains` モード(`build_sfx.py` / `sfx_common.py`)

1. 元素材を **1 回だけ** `loudnorm=I=-16:TP=-1.5` → モノラル 44.1kHz の中間 wav(⛔ `silenceremove` はかけない = 粒の位置がずれる)。
2. 中間 wav を §2-8 の方式で切る(`grains` の値を使う)。長さ `minMs`〜`maxMs` の外の粒は捨てる。
3. 各粒を `preMs` 前から切り出し、`fadeInMs` / `fadeOutMs` の直線フェード → **128kbps モノラル mp3** で `assets/sfx/ui/narration_<n>.mp3`。
4. ハッシュに `grains` の値も含める(値を変えたら作り直される)。manifest の `files` は実際に書いた粒の数だけ。
5. ⛔ **粒を `normalize_single` に通さない**(罠C)。

### 5-4. `license` / `credit` / `source` の上書きと、クレジット台帳(罠D)

- mapping の値があれば `pack_meta()` の結果より優先する(inbox の仮置き `"(要 inbox の出典記入)"` を台帳に残さない)。
- `write_credits` は**最終 manifest の全 ID から**行を作る(処理した ID だけで書き直さない)。⇒ `--only` でも既存の行が消えない。
- 実行は `py sfx-pipeline/scripts/build_sfx.py`(全体)。既存 8 ID が **skip** で終わること(§2-6)を出力で確かめる。

---

## 6. STEP3 — `audio.js`

### 6-1. 撤退スイッチ(`PEN_NARRATION` の隣)

```js
  // #74 ペンの音を録音へ。?pensample=0 で #73 の合成ペン (3 画の帯域雑音) へ戻す。?penvoice=0 は従来 (朗読 +「ピッ」) のまま。
  var PEN_SAMPLE = (function () {
    try { return new URLSearchParams(global.location.search).get("pensample") !== "0"; } catch (e) { return true; }
  })();
```

### 6-2. `playSampled` の関門と出口(罠A・罠B)

```js
  function playSampled(name, opts) {
    if (!sfxManifest || !buses) return false;
    if (name === "narration" && !(PEN_NARRATION && PEN_SAMPLE)) return false;   // #74 撤退の腕では録音を鳴らさない (罠B)
    …
      var route = (name === "narration") ? buses.voice                            // #74 「語り 音量」を通す (罠A)
        : ((def.bus === "ui" || name === "button") ? buses.ui : buses.sfx);
```

- `narration` がこの行へ来るのは `PEN_NARRATION && PEN_SAMPLE` のときだけ ⇒ 出口は常に voice で正しい。
- ⛔ `penStrokes` / `SFX.narration` / `playSfx` の合成側(`:743`)は動かさない(fallback と `?pensample=0` の腕)。

### 6-3. 設定画面のクレジット行(`audio.js:910`・OtoLogic は CC BY 4.0 = **必須**)

`"… ｜ BGM  魔王魂 / ユーフルカ"` の後ろへ `"　｜　効果音  OtoLogic (CC BY 4.0)"` を足す(§2-11 のとおり `driver_dev_gate (D7)` の窓の外)。
加工の旨は `CREDITS.md` の `credit` 欄が負う(§5-2)。⚠ 撤退の腕でも素材ファイルは配信物に残るので、クレジット行は `PEN_SAMPLE` で出し分けない。

---

## 7. STEP4 — #73 受入の言い直し(`tools/verify_pen_narration.js`)

- ⭐ 方針: **#73 の本は「合成のペン」を測る本として残す** — 素の腕の URL に `pensample=0` を足す。そのうえで:
  - **(0c)** → 「配信 manifest に `narration` があり、**`?pensample=0` の腕では `playSampled` が鳴らさない**」へ言い直す。
  - **(2b)(2c)** → `pensample=0` の腕で従来の期待(BufferSource 3・voice バス)のまま成り立つはず。赤くなったら ID を控えてから直す。
  - 変異 **`sampledpen`** → 関門が効いている限り赤くならない = 検査力 0。**退役**させ、その役は新受入の `nogate` / `busui` が負う。
- ⚠ **言い直した assert の条件の個数を前後で数える**(減っていたら弱体化)。言い直した本数を §12 に書く。

---

## 8. 受入条件 — `tools/verify_pen_sample.js`(新規・base **10451** / 変異 **10452〜10458**。⚠ 着手時に空きを再確認)

⚠ **`?autoplay` を使わない**(#73 罠3: 声の経路を迂回する)。音は **BufferSource の生成と接続先を in-page のラッパで観測**し、粒の中身は**配信された mp3 をページ内で `decodeAudioData`** して測る(2 経路)。

### §0 装置

- **(0a)** 配信 manifest の `narration.files` の本数 N を**実体から導出**し、**20 ≤ N ≤ 40**・全粒が HTTP 200。⭐ これが無いと §1 が空振りで永久緑。
- **(0b)** `git ls-files sfx-pipeline/raw` = 0 件(元素材をコミットしていない)。
- **(0c)** 変異の注入点が配信スナップショットでちょうど 1 箇所ずつ。

### §1 粒の中身(配信 mp3 をページ内でデコード)

- **(1a)** 全粒の長さ 40〜400ms(+符号化の余白)。
- **(1b)** 先頭無音なし: 各粒で最初に −40 dBFS を超えるのが **15ms 以内**(元素材の 113〜192ms が残っていない)。
- **(1c)** 割れなし: 全粒の峰 ≤ −1.0 dBFS。
- **(1d)** ★ 強弱が残っている: 粒の峰の最大 − 最小 **≥ 6dB**(罠C: 粒ごとに正規化すると ≈0dB に潰れる)。
- **(1e)** モノラル・44.1kHz。

### §2 鳴り方(index / tavern の実ページ)

- **(2a)** 先読み完了後(`__sfxManifestLoaded` + 全粒の buffer 在り)に `playSfx("narration")` 1 回 = **録音の BufferSource ちょうど 1**(buffer が manifest の粒のどれか)・合成の雑音 0。
- **(2b)** ★ その出口 = **voice バス**(罠A)。`button` = ui / `hit` = sfx は不変。
- **(2c)** 「語り 音量」を 37 へ → voice バスの利得が変わり、`sfx` / `ui` は不変。
- **(2d)** 200 回鳴らして選ばれた粒が **N/2 種以上**(ランダムに散っている)。
- **(2e)** 開始のクリック → 語りの 1 文字目の時点で、粒の要求が全部発行済み(`preload: "eager"` = 罠E)。

### §3 fallback

- **(3a)** manifest から `narration` を消した配信 → `playSfx("narration")` は #73 の合成 3 画・voice バス。

### §4 撤退

- **(4a)** `?pensample=0` → 合成 3 画・voice バス・録音の BufferSource 0(index / tavern)。
- **(4b)** ★ `?penvoice=0` → Oscillator 1(「ピッ」)・ui バス・録音 0(**manifest に `narration` が在っても**)= 罠B。

### §5 クレジット

- **(5a)** `CREDITS.md` に `narration` 行があり、ライセンス欄が `(要 inbox の出典記入)` でない。既存 8 ID の行も全部在る(罠D)。
- **(5b)** `openSettings()` のクレジット行に `OtoLogic` が在る(素・`?pensample=0` の両腕)。

### ⛔ 測らないこと

`volume` / `pitchVar` の値・粒の正確な本数(範囲だけ)・切り出しのしきい値・速い文字送りでの粒の重なり・音色の好み。**耳で動かす余地を残す**。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **`busui`** | 出口の `narration` を ui へ戻す(罠A) | (2b)(2c) |
| **`nogate`** | `playSampled` の関門を外す(罠B) | (4b) |
| **`flatgrain`** | 配信スナップショットで全粒を同じ峰へ揃える(罠C の再現) | (1d) |
| **`lazy`** | manifest の `preload` を外す(罠E) | (2e) |
| **`nonarr`** | manifest から `narration` を消す | (0a)(2a) |
| **`leadpad`** | 配信スナップショットで全粒の頭に 150ms の無音を足す | (1b) |
| **`nocredit`** | `CREDITS.md` の `narration` 行を仮置きへ | (5a) |

⭐ **変異の担当は実走で決める**(#73 は机上の表の 6/9 が実測と違った)。担当が絞られていることは `NEG_GREEN` ガードで装置化する。

### 既存 golden の非退行

- `node tools/verify_pen_narration.js` → §7 の言い直し後に 素 + `--negative` 緑。
- 母集団の全数走査(2 経路・着手前の凍結 TSV と突き合わせ)。⚠ 基準値は 2026-09-25 時点。**違ったら期待値を書き換える前に理由を突き止める**。
- ⚠ 全ページで起動時の要求が約 31 本増える。要求数やロード時間を測る golden が赤くなったら**帰属を確かめてから**扱う。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ **http 起動が必須**(`file://` では manifest が読めず合成へ落ちる)。

1. ダンジョン導入の語りで、**フェルトペンで書く音**が文字に合わせて鳴るか。うるさくないか → `volume` を耳で詰める。
2. 設定の「**語り 音量**」でペンの音だけ大きさが変わるか。
3. 酒場の前口上でも同じ音か。
4. `?pensample=0` で #73 の合成ペン、`?penvoice=0` で朗読 +「ピッ」へ戻るか。
5. 文字送りを最速にしたとき、重なりが耳障りでないか。

---

## 10. changelog(⚠ `audio.js` を触るので必須・`tavern.html` に書かれる)

    py tools/add_changelog.py "<b>ペンの音が本物になった</b> — 語りの文字に合わせて、フェルトペンで紙に書く録音の音が鳴るように。"

---

## 11. やらないこと

- ⛔ **キャップを開ける音・ペンを置く音**などの演出(A+おまけ = 不採用)/ 他の 13 本の素材。
- ⛔ **1 ファイル + 位置指定(スプライト方式)**への作り替え — 既存の `files` 配列 + ランダム選択(`audio.js:685`)で足りる。
- ⛔ 合成 `penStrokes` の音色の調整(方針 B = 不採用)と、その削除(fallback として残す)。
- ⛔ 呼び口の間隔 `i % 3` の変更(`index.html` を開かない)。
- ⛔ 朗読 mp3 と声のコードの削除(#73 のやらないことを継続)。
- `実装依頼書/README.md` への行(承認後に起草窓が足す):

    | 74 | [2026-09-25_pen-sample.md](2026-09-25_pen-sample.md) | **承認済** | 0% | ペンの音を録音へ。フェルトペンの実録(02 Write)を**全体で 1 回正規化してから 1 画ずつ約 31 粒に切り**、文字送りの呼び口で 1 粒ずつランダムに鳴らす。⚠⚠⚠ 録音の経路は `narration` を **ui バス**へ流す(`audio.js:694`)= 「語り 音量」が効かない(罠A)/ `playSampled` は `PEN_NARRATION` を見ないので **`?penvoice=0` でも録音が鳴る**(罠B)/ **粒ごとの loudnorm は `-inf` で測定不能**(罠C)/ `build_sfx.py` は **`CREDITS.md` を処理した ID だけで書き直す**(罠D)。素材 = OtoLogic(推定)・**CC BY 4.0 = クレジット必須**。撤退 `?pensample=0`。受入 `tools/verify_pen_sample.js`(base **10451**) |

---

## 12. 実装結果

(実装窓が埋める)
