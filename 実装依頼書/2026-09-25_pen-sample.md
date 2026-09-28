# #74 ペンの音を録音へ — フェルトペンの実録を 1 画ずつ鳴らす

- **起草**: 2026-09-25(起草窓 `claude-c6`) / **ステータス**: **完了**(2026-09-25 ユーザー承認 → 2026-09-28 実装窓が項目1〜5 を着地。総括は §12-6)
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

### 12-0. 着手前の基準取り(項目1) — 2026-09-25 / 基準 `9c6197a`

⛔ **本番も `tools/` も 1 バイトも触っていない。** 使い捨ての道具は全部 scratchpad
(`…/39a966a8-…/scratchpad/item1/`)に置いた。走り終わった時点で作業ツリーは clean。

#### (1) 着手前の状態

- `git log --oneline -1` → `9c6197a #74 依頼書 — ペンの音を録音へ …`
- `git status --short` → **0 行(clean)**
- `git diff --stat 5051a2b HEAD` = 依頼書 `.md` と台帳 `README.md` の 2 本だけ ⇒ **本番コードは基準 `5051a2b` と 1 バイト同一**
  (`HEAD:audio.js` の blob = `b34af25…`)。§2 の行番号はそのまま読める。
- 行末(`py` でバイト実測): `audio.js` 純 CRLF 972/972 / `tavern.html` 純 CRLF 10,994/10,994 /
  `sfx-manifest.json` 純 LF(111 行)/ `CREDITS.md` 純 LF(15 行)/ `sfx-sources.json` 純 LF(64 行)/ 本書 純 LF(362 行)。

#### (2) 逐語アンカー(⭐ 件数を数えてから採った)

| アンカー(逐語) | 件数 | 実測の行 | 本書 |
|---|---|---|---|
| `function playSampled(` | **1** | `audio.js:681` | 一致 |
| `var route = (def.bus === "ui" \|\| name === "button" \|\| name === "narration")` | **1** | `audio.js:694` | 一致 |
| `var route = (PEN_NARRATION && name === "narration")` | **1** | `audio.js:743` | 一致 |
| `if (i % 3 === 0) sfx("narration")` | **index 1 / tavern 1** | `index.html:14711` / `tavern.html:8414` | 一致 |
| `cred.textContent = "ナレーション音声` | **1** | `audio.js:910` | 一致 |
| `def write_credits(` | **1**(呼び口 1) | 定義 `build_sfx.py:156` / 呼び口 `:146` | 一致 |

その他の行番号も**全部一致**: `audio.js` 18(`PEN_NARRATION`)/ 31(`textSpeed` の clamp)/ 221(`penStrokes` の cutoff)/
664(`eagerPreloadSfx`)/ 685(粒のランダム選択)/ 687(「初回は fetch だけ」)/ 737(`playSfx`)/ 740(`playSampled` を先に試す)/
834(`closeSettings`)/ 841(`openSettings`)/ 971(`global.GameAudio`)、`index.html` 14703(文字送りの間隔)、
`tavern.html` 8400(`sfx()` ラッパ)、`build_sfx.py` 73(`pack_meta`)/ 78(仮置き文字列)、`check_changelog.py:24`、`.gitignore:11`。
⚠ `index.html` の `sfx()` ラッパだけ **3252**(本書は 3253)。設計への影響なし。
`grep '"narration"'` = `audio.js` 694 / 742 / 743 + 呼び口 2 = §2-2 のとおり(`js/*.js` は 0)。

#### (3) ポート

- `tools/*.js` が宣言する base の最大は **10441**(`verify_pen_narration`)。帯 10442〜10450 は同書の変異。
- **10451〜10458 を名指す箇所は `tools/` にも `%TEMP%` の `.js` にも 0 件**(`10448` / `10462` の一致は `verify_road_ambush.js:680/686` の乱数 literal の部分文字列)。
- `Get-NetTCPConnection -State Listen` で **10380〜10470 に待ち受け 0 件**。**8765 は待ち受け中(PID 34768 = ユーザーの試遊サーバ)** — 触っていない。
- **10451 で実際に配信 → goto が通った**(下の (5) の再現装置。`ERR_UNSAFE_PORT` なし)⇒ **base 10451 / 変異 10452〜10458 を確定**。

#### (4) 母集団 — 3 段の union = **147 本 / 153 腕**(⛔ 本数は導出。台帳 = scratchpad `item1/population74.tsv`)

導出器 `item1/build_population74.py`(⛔ 定数を焼かない。コメントを落としてから判定)。

| 段 | 引き方 | 件数 |
|---|---|---|
| 段1 | #74 が触る語: `narration` / `playSampled` / `preloadSfx` / `sfxManifest` / `__sfxManifestLoaded` / `sfx-manifest` / `assets/sfx` / `CREDITS` / `playSfx` / `openSettings` / `changelog` / `verify_pen_narration` / `pensample` / `penvoice` / `VOICEVOX` / `sfx-pipeline` | **7** |
| 段2 | `audio.js` を読み込む配信ページ(実測 5 枚 = index / tavern / title / town / world)または `audio.js` 自体を参照 | **147** |
| 段3 | 測定器のソースを読む測定器(`readFileSync` の引数 or 文字列に `tools/` / `verify_` / `driver_` / `probe_` / `sweep_`) | **2**(`verify_enemy_name_label` / `verify_eol_doorfix`) |
| | **UNION** | **147**(`tools/*.js` 全 **151** 本のうち) |

- 段1 = `driver_bgm_title`(playSfx)/ `driver_bgm_town`(openSettings)/ `driver_dev_gate`(openSettings)/ `driver_diag_watchdog`(narration)/
  `probe_n4_stall`(narration)/ `verify_pen_narration`(narration, playSampled, sfx-manifest, assets/sfx, playSfx, openSettings, penvoice)/ `verify_title_screen`(playSfx)。
  **段1 ⊂ 段2 / 段3 ⊂ 段2**(union を 1 本も増やさなかった)。⚠ コード中で `changelog` を握る本は **0 本**(`grep -l` の 10 本はコメントのみ)。
- ⭐ **sfx の素材に触る本は `verify_pen_narration` の 1 本だけ**(`sfx-manifest\|assets/sfx\|playSampled\|preloadSfx\|sfxManifest\|CREDITS\|sfx-pipeline\|build_sfx` を `tools/*` 全体で)= §2-9 と一致。
- union の外 = **4 本**: `_doors_fixture.js`(ドライバが require するモジュール・`index.html` はコメントだけ)/ `driver_doors_p1.js` / `sim_plaza_entry.js`(コメントだけ)/ `verify_codex_map_skill.js`。
  #73 の 148 本との差 = −`_doors_fixture` −`sim_plaza_entry`(#73 はコメント込みで数えた)+`verify_pen_narration`(#73 で新設)。
- `audio.js` を**ソースとして読む**本 = **8**: `driver_bgm_mine` / `driver_bgm_title` / `driver_bgm_town` / `driver_dev_gate` / `probe_s2_clear`(`git diff HEAD -- … audio.js` を表示)/
  `verify_eol_doorfix`(行末)/ `verify_mercenary_roster`(配信スナップショット)/ `verify_pen_narration`。
- **腕 = 素 147 + `--negative` 6 = 153**。`--negative` の腕 = union ∩ `--negative` を持つ ∩(`audio.js` をソースで読む or #74 の信号語を握る)=
  `driver_bgm_title` / `driver_bgm_town` / `probe_s2_clear` / `verify_eol_doorfix` / `verify_mercenary_roster` / `verify_pen_narration`。
  (`driver_bgm_mine` / `driver_dev_gate` は `--negative` を持たない。)
  - `tavern.html` をソースで読み `--negative` を持つ本 **11 本**は腕を足さなかった(台帳の `neg_tavern_optional`)。理由 = #74 が `tavern.html` に触るのは
    `add_changelog.py` の 1 行だけ(`<li>` +1 / −1 = 行数不変)で、`changelog` をコードで握る本が 0 本。⚠ 項目5 で赤が出たらここを疑う。
- ⚠⚠ union 内の**ポート衝突 20 組**(最大 8831 = 4 本 / 8801 = 4 本)⇒ **全数走査は直列のみ**。
- ⚠⚠ **`auto_debug_run.js` は 8765 を自前で立てる**(`arg('port','8765')`)⇒ 走査前に試遊サーバ 8765 を止め、終わったら立て直す。
  `verify_title_screen.js` の 8765 は `.vbs` の中身を正規表現で見ているだけ(待ち受けない)。
- 所要の見込み: #73 の着手前走査 = 151 腕 298.1 分 ⇒ **153 腕でおよそ 300〜330 分**(`--negative` が 3 → 6 腕。`verify_pen_narration --negative` 単独で約 912 秒)。

#### (5) 本番での再現(⛔ 本番ファイルは無改造。配信する `sfx-manifest.json` だけをメモリ上で書き換えた)

装置 = scratchpad `item1/repro74.js`(puppeteer-core + 実 Chrome headless・自前の http サーバ 10451・`?autoplay` なし)。
`narration` の代役の粒 = 既存の `ui/ui_tap_1.mp3`(0.0909s)/ `ui/ui_confirm_1.mp3`(0.2898s)/ `ui/ui_cancel_1.mp3`(0.0610s)。
⭐ mapping は **§5-2 の案どおり `bus: "voice"`** で足した(= 台帳で voice と書いても出口が ui へ行くかを見る)。
観測 = `createBufferSource` / `createOscillator` の生成数・`start` 時の `buffer.duration`・名前付き 5 バスへの `connect` 先。unlock 後 300ms 待ってから `playSfx("narration")` を 700ms おきに 3 回。

| ページ | manifest | URL | `/assets/sfx/*.mp3` 要求(読込時) | `playSfx("narration")` 3 回 = [BufferSource, Oscillator, 出口] | button / hit |
|---|---|---|---|---|---|
| index | 素(narration 無し) | 素 | 1 | 3 回とも [3, 0, voice×3] | ui / sfx |
| index | 素 | `?penvoice=0` | 1 | 3 回とも [0, 1, ui](「ピッ」) | ui / sfx |
| index | **+narration(eager)** | 素 | **3** | 3 回とも **[1, 0, ui]**(粒の長さ = 代役のどれか) | ui / sfx |
| index | **+narration(eager)** | **`?penvoice=0`** | **3** | 3 回とも **[1, 0, ui]** | ui / sfx |
| index | +narration(preload 無し) | 素 | 1 | **1・2 回目 [3, 0, voice×3](合成)→ 3 回目 [1, 0, ui]** | ui / sfx |
| tavern | 上と同じ 5 腕 | | 1 / 1 / 3 / 3 / 1 | 素・`?penvoice=0`・eager 2 腕は index と同じ | ui / sfx |

ページエラーは全 10 腕 0 件。

- **罠A(§2-3)= ✅ 再現**: 録音が鳴ると出口は **ui バス**。mapping の `bus: "voice"` は `audio.js:694` の `name === "narration"` に負ける。
- **罠B(§2-4)= ✅ 再現**: `?penvoice=0` でも **BufferSource 1・Oscillator 0** = 録音が鳴り、「ピッ」(Oscillator 1)は戻らない(index / tavern とも)。
- **罠E(§2-7)= ✅ 再現(index)**: preload 無しでは最初の 2 回が合成 3 画(voice)、3 回目から録音。eager では読込時に粒 3 本の要求が出て 1 回目から録音。
  ⚠ tavern の preload 無しの腕は 1 回目から録音だったが、これは**代役の `ui_tap_1.mp3` が既存の `ui_tap`(eager)と URL を共有**しているから
  (`sfxBufCache` は URL が鍵)。本物の粒は URL を共有しないので結論は変わらない。
- ⇒ **§4-4 は成立。STEP2 へ進んでよい。**

#### (6) 素材と `build_sfx.py`(⛔ 書き込みなしで測った)

- ZIP `Downloads/Felt_Tip_Pen03-mp3.zip` = **457,283 バイト・2026-09-25 20:06:03**・中身 **14 本 すべて 44.1kHz ステレオ MP3**・ライセンス文書なし(§2-1 と一致)。
  展開先は scratchpad `item1/zip/`(⛔ `sfx-pipeline/raw/` へは置いていない = 項目2 の担当)。
- 02(Write) = **9.394s**。§2-5 の 2 コマンド: 全体 **`input_i` −21.15 / `input_tp` −3.17 / `target_offset` 0.60**・1 粒(0.30s から 0.12s)**`input_i` −inf / `target_offset` inf** ⇒ **罠C を再現**。
- 切り出しの再現(10ms RMS・ピーク包絡比・scratchpad `item1/seg.py` = 本書とは別実装): −18/−28/25 = **31 粒**(80/100/380ms・峰の幅 14.2dB・画の間隔の中央 245ms)/
  −20/−30/25 = 33 / −16/−26/25 = 32 / −18/−28/40 = 31。先頭無音(−40 dBFS 初到達)= **136.6ms**。⇒ 実装差で ±1 揺れる = §2-8「定数で焼かない・20〜40」を支持。
- `build_sfx.py` を**書き込みなしで**実行(scratchpad `item1/dry_build_sfx.py` = `Path.write_text` と `normalize_*` を差し替え、書くはずだった内容を現物と比較):
  - 全体: **built 0 / skipped 8 / inbox 待ち 18**・`normalize_*` の呼び出し 0 回・manifest と `CREDITS.md` の**内容は現物と完全一致**(8 行)⇒ §2-6 と一致。
  - `--only ui_tap`: `CREDITS.md` が **1 行(ui_tap)だけ**になる(1,121 → 417 バイト)・manifest は不変 ⇒ **罠D を再現**。
- `git ls-files sfx-pipeline/raw` = **0 件**。`sfx-pipeline/raw/` にあるのは `packs/` だけで **`inbox/` はこの PC に無い**(項目2 が作る)。

#### (7) ⚠ 崩れた主張(番号付き)

1. ⚠⚠⚠ **§2-6「全体で回すのは安全」は内容についてだけ正しい — Windows では行末が壊れる(新しい罠 = 罠F)。**
   `build_sfx.py` は `Path.write_text(...)` で書く。Windows の Python は改行を **CRLF に変換**する(scratchpad で実測: `'a\nb\n'` → `b'a\r\nb\r\n'`)。
   ⇒ 全体で回すと `sfx-manifest.json`(2,606 → 2,717 バイト)と `CREDITS.md`(1,121 → 1,136 バイト)が **CRLF で書き直される**。
   `.gitattributes` はどちらも **`eol=lf`**(`git check-attr` で確認)で、`tools/check_tree_eol.py` は other の食い違いを**致命**にしている(今は 863 本すべて一致)。
   `verify_eol_doorfix`(§1 が `git ls-files` の全テキストを測る)も赤くなる見込み。
   ⇒ 項目2 は `build_sfx.py` の書き出しを **LF 固定**(`write_text(..., newline="\n")` か `write_bytes`)にしてから回すこと。直後に `py tools/check_tree_eol.py` で確かめる。
   ⭐ `build_sfx.py` は §3 で触るファイルなので、**設計の変更もユーザー判断も要らない**。
2. ⚠ **§2-4 の「#73 受入の (4a) … が崩れる」は誤り。** (4a) は `__renderSfxOffline`(合成レシピのオフライン描画)で、`playSampled` を通らない —
   §2-9 自身が「(4a) は崩れない」と書いている(本書の中で食い違っていた)。罠B で実際に崩れるのは **(2b)(2c) の off 腕**(`?penvoice=0` で BufferSource 1・Oscillator 0 になる = (5) の実測)と、それを束ねる **(5a)**。§7 の方針(関門で `?penvoice=0` の腕から録音を外す)で戻る。
3. (軽微)`index.html` の `sfx()` ラッパは `:3253` でなく **`:3252`**。
4. (補足・崩れではない)§2-1 の「峰 −3.2 dBFS」はステレオの true peak。`-ac 1` でモノラルへ下ろすと同相成分が足されて峰は **−0.45 dBFS**(実測)。
   §2-8 の「峰 −14.6〜−0.4」はモノラル側の値と読める。⇒ 項目2 の `grains` は **モノラル化の後に loudnorm**(§5-3 の順)を守れば (1c) の −1.0 dBFS は TP −1.5 で守られる。

#### ⇒ 判定

**§4-4(罠A・罠B の再現)は成立。STEP2 へ進んでよい。** 設計が変わる崩れは無い。
項目1b(全数走査)への申し送り = 母集団 147 本 / 153 腕(`population74.tsv` / `armlist74.json`)・直列のみ・8765 を止める。
項目2 への申し送り = 罠F(LF 固定)・`raw/inbox/narration/` の新設・§2-4 の読み替え。

### 12-1. 着手前の全数走査(項目1b) — 2026-09-25〜26 / 基準 `19d731b`(本番コードは `5051a2b` と 1 バイト同一)

⛔ **本番コードも `tools/` も 1 バイトも触っていない。** 走査の前後で `git status --short` = **0 行**・HEAD = `19d731b`(`9c6197a` と `19d731b` は依頼書 `.md` と台帳だけ)。
試遊サーバ 8765 は**走査の間ずっと止めていた**(`auto_debug_run.js` が 8765 を自前で立てるため)。走り終えてから立て直した(下の (7))。

#### (1) 走った腕 = **153 腕**(素 147 + `--negative` 6。⛔ 定数で焼かず §12-0 (4) の `armlist74.json` から導出)

- 並び順 = `item1/armlist74.json` の順(= `population74.tsv` の順 + `--negative` 6 腕が末尾)。項目5 も同じ順で走る。
- `--negative` の 6 腕 = `driver_bgm_title` / `driver_bgm_town` / `probe_s2_clear` / `verify_eol_doorfix` / `verify_mercenary_roster` / `verify_pen_narration`(導出規則は §12-0 (4))。
- ⚠⚠ **直列のみ**(union 内にポート衝突 20 組)。

#### (2) 所要時間と中断

| | 実測 |
|---|---|
| 腕の合計時間(`duration_sec` の和) | **301.9 分 = 5.03 時間** / **1 腕あたり 118.4 秒**(#73 は 151 腕 298.1 分・118.5 秒) |
| 実時間 | 1 回目 20:42:30 → 21:40:52(30 腕)+ 再開 21:43:33 → 翌 01:47:56(**244.4 分**・123 腕) |
| ⚠ 中断 | 1 回目の走行器が**窓の終了とともにプロセスごと止まった**。31 腕目 `driver_field_step6`(素)が START のまま DONE 無し ⇒ **失った腕 = 1**(TSV に行が無いので再開時に頭から走り直した。標準出力は `wb` で上書きされるので途中の残骸は残っていない)。再開前の居残り(走行器・Chrome)は 0 |
| 打ち切り | **1 腕**のみ = `probe_party_size`(素)を 600 秒で `taskkill /T /F`(#72・#73 と同じ扱い) |
| 腕の後の居残り Chrome | **0 腕**(全 153 腕で `strays_killed = 0`) |
| 最長 6 腕 | `verify_bolt_aim` 2,243.4s / `driver_field_step6` 1,769.9s / `probe_p9_tour` 1,731.7s / `auto_debug_run` 1,039.4s / `verify_pen_narration --negative` 911.4s / `verify_hold_pair` 904.7s |

#### (3) 緑・赤の内訳

| | 実測 |
|---|---|
| 緑 / 赤 | **135 / 18**(赤 **11.8%**) |
| 判定行 合計 | **7,224** 行(PASS **7,103** / FAIL **74** / PENDING **4**)・assert id 合計 **7,181** |
| 判定行 0 行(指紋が効かない)腕 | **15 腕** = `_golden` / `_pptr_profile` / `auto_debug_run` / `driver_grid_p4` / `probe_bandit_map` / `probe_n4_stall` / `probe_p9_tour` / `probe_paint_overlay` / `probe_rest_premature` / `probe_s2_fold` / `probe_s4_relocate` / `probe_swamp_map` / `probe_town_mask` / `sweep_recruit_balance` / `probe_s2_clear --negative` ⇒ **exit code だけが比較材料** |
| 異なる経路②の指紋 | **139 個**(= 153 − 15 + 1) |

⭐ `--negative` の FAIL は**変異で赤くなるべき判定**が数えられたもの(`verify_mercenary_roster --negative` F17・`verify_pen_narration --negative` F33 はどちらも exit 0 = 空振り 0)。FAIL 合計 74 のうち 50 はこの 2 腕。

#### (4) 赤 18 腕の分類 — **型1 = 0 / 型2 = 0 / 型3 = 18**(軸A = 追加 2 回の再走 `rerun74.py`・計 107.4 分)

- **型1(#74 が構造的に殺す)= 0。** 赤 18 腕に sfx の素材・`playSampled`・`narration` を測る本は無い(§12-0 (4): sfx の素材に触る本は `verify_pen_narration` の 1 本だけで、素・`--negative` とも緑)。
- **型2(exit=3 のポート由来の偽の赤)= 0。** exit=3 の 4 腕は**本自身の早期終了**で、3 回とも同じ exit=3・指紋一致: `driver_grid_p4` = 変異 `n1ringonly` の置換対象が本文に無い(負のコントロールの空振り)/ `probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map` = 引数が要る道具を素で起動した使用法エラー。
- **型3(無関係)= 18。**

| arm_id | exit 凍結/再1/再2 | 軸A | 凍結 P/F | #73 凍結 | 指紋(再1 / 再2) | 赤の理由(1 行) |
|---|---|---|---|---|---|---|
| `driver_field_step6_base` | 1/1/1 | (赤,赤) | 56/3 | 1(57/2) | 一致 / ⚠**不一致 55/4** | `?graph=auto` が entry から前進しない(#73 と同じ)。FAIL 数が走行ごとに動く |
| `driver_grid_p4_base` | 3/3/3 | (赤,赤) | 0/0 | 3 | 一致 / 一致 | 変異 `n1ringonly` の置換対象が本文に無い(**ポートではない**) |
| `driver_grid_p8_base` | 1/1/1 | (赤,赤) | 55/1 | 1(55/1) | 一致 / 一致 | 音声と無関係(#72・#73 基準でも赤) |
| `driver_mapeditor_base` | 1/1/1 | (赤,赤) | 176/3 | 1(176/3) | 一致 / 一致 | 同上 |
| `driver_mapeditor_painting_base` | 1/1/1 | (赤,赤) | 105/1 | 1(105/1) | 一致 / 一致 | 同上 |
| `driver_monsters_griffon_base` | 1/1/1 | (赤,赤) | 15/2 | 1(14/3) | ⚠**不一致 16/1** / 一致 | 非決定の本(#72 で実証済み)。今回は色は動かず FAIL 数だけ動いた |
| `driver_monsters_umberhulk_base` | 1/1/1 | (赤,赤) | 21/1 | 1(21/1) | 一致 / 一致 | 音声と無関係 |
| `driver_sce1_events_base` | 1/1/1 | (赤,赤) | 211/3 | 1(211/3) | 一致 / 一致 | 音声と無関係 |
| `driver_speech_engine_base` | 1/1/1 | (赤,赤) | 16/1 | 1(16/1) | 一致 / 一致 | カメラ追従の非決定(#73 では 1/0/1 のフレーク)。今回は 3 回とも赤 |
| `driver_speech_v2_base` | 1/1/1 | (赤,赤) | 45/1 | 1(45/1) | 一致 / 一致 | 音声と無関係 |
| `probe_bandit_map_base` | 3/3/3 | (赤,赤) | 0/0 | 3 | 一致 / 一致 | 使用法エラー(`--mapdefs` 等が要る)。**ポートではない** |
| `probe_n4_stall_base` | 1/**0**/**0** | **フレーク** | 0/0 | **0** | 一致 / 一致(判定行 0) | 停滞の**再現プローブ**(`tools/probe_n4_stall.js:414` = 停滞を捕まえたら exit 0 / 捕まえなければ 1)。凍結の走行は「停滞は観測されませんでした」 |
| `probe_party_size_base` | 1/1/1 | (赤,赤) | 13/7 | 1(13/7) | 一致 / 一致 | 自力で終わらない本。600 秒で打ち切り(ワールドマップ挿入で導線が腐っている = #73 §12-0b (5)) |
| `probe_s2_fold_base` | 3/3/3 | (赤,赤) | 0/0 | 3 | 一致 / 一致 | 使用法エラー(`--kinds` / `--lint`)。**ポートではない** |
| `probe_swamp_map_base` | 3/3/3 | (赤,赤) | 0/0 | 3 | 一致 / 一致 | 使用法エラー(`--bfs`)。**ポートではない** |
| `sweep_recruit_balance_base` | 1/1/1 | (赤,赤) | 0/0 | 1 | 一致 / 一致 | 装置 assert が崩れた走行(#72・#73 と同じ総括) |
| `verify_walk_block_base` | 1/1/1 | (赤,赤) | 22/1 | 1(22/1) | 一致 / 一致 | 音声と無関係 |
| `probe_s2_clear_negative` | 1/1/1 | (赤,赤) | 0/0 | —(#73 に無い腕) | 一致 / 一致 | 変異 `wipeblind` が赤くならない(全滅決着で検査力 0 = #73 の別チケット候補)。**#74 と無関係** |

軸A 集計: **(赤,赤) 17 / (緑,緑) 1(`probe_n4_stall`)/ 混在 0**。

#### (5) フレークと指紋

- **色が動いた本 = 1 本** = `probe_n4_stall`(凍結 1 → 再走 0/0)。⭐ 判定行 0 行の本なので exit だけが材料で、しかも **exit の意味が「停滞を再現できたか」**(緑 = 停滞を捕まえた)。⛔ 項目5 はこの本の色の変化を #74 の退行とも改善とも読まない。
- **色は動かず指紋が動いた本 = 2 本** = `driver_field_step6`(FAIL 3 → 3 → 4)/ `driver_monsters_griffon`(FAIL 2 → 1 → 2)。⛔ 項目5 はこの 2 本の指紋を非退行の根拠に使わない(exit で見る)。
- **#73 の凍結と色が違う腕 = 2 本** = `driver_field_verge_gap`(#73 赤 → 今回 緑)/ `probe_n4_stall`(#73 緑 → 今回 赤)。どちらも #73 で非決定と実証済み。
  #73 でフレークだった `driver_monsters_hobgoblin`(14/14)/ `driver_monsters_kobold`(12/12)は今回 緑。
- ⇒ 項目5 で「指紋を根拠にしない」腕 = 判定行 0 行の **15 腕** + 指紋が動く **2 腕** = **17 腕**。
  非決定の既知候補(今回 + #73)= `probe_n4_stall` / `driver_field_step6` / `driver_monsters_griffon` / `driver_field_verge_gap` / `driver_speech_engine` / `driver_monsters_hobgoblin` / `driver_monsters_kobold`。⚠ この一覧は要約。赤が出たら再走で測り直すこと。

#### (6) 凍結 TSV・走行器・項目5 の手順

置き場 = scratchpad `…/39a966a8-5807-4d8e-b6cc-9c0f2f680fb2/scratchpad/item1b/`(以下 `item1b/`)。

| パス | 中身 |
|---|---|
| `item1b/baseline_frozen74.tsv` | **凍結 TSV 153 行 + ヘッダ**(LF・UTF-8・18 列・キー = `arm_id`)。**項目5 が読む正** |
| `item1b/baseline/<arm_id>.txt` | 全 153 腕の標準出力 |
| `item1b/fp/<arm_id>.json` | 全 153 腕の 2 経路の指紋の全量(経路① id 列 / 経路② 多重集合) |
| `item1b/rerun/rerun_pass{1,2}.tsv` + `pass{1,2}/` + `pass{1,2}_fp/` | 赤 18 腕の追加 2 回 |
| `item1b/classify74.json` | 赤の分類・判定行 0 行の腕・#73 との色の差 |
| `item1b/{sweep74,rerun74,classify74,fp74}.py` | 走行器 / 再走器 / 分類器 / 指紋抽出器(`fp74.py` = #73 `fp73.py` = #72 `fp72e.py` の逐語コピー) |
| `item1b/sweep74.log` / `rerun74.log` | 走行ログ(`=== RESUME …` の行が中断と再開の境目) |

列 = `arm_id` / `book` / `arg` / `exit_code`(**合否の主**・0 = 緑)/ `pass_count` / `fail_count` / `pending_count`(従)/ `duration_sec` /
`route1_n` / `route1_fingerprint`(経路① = assert id と合否の並び → sha256 先頭 16 桁)/ `route2_n` / `route2_fingerprint`(経路② = 正規化した判定行の多重集合 → sha256 先頭 16 桁)/
`summary_line`(人が読むためだけ)/ `strays_killed` / `killed`(`taskkill@600s` = 打ち切り)/ `started_at` / `stdout_path` / `fp_json`。指紋の作り方は #73 §12-0b (7) と同一。

**走行器の使い方**(`py` で起動・直列・TSV に行がある腕は SKIP して再開する = 中断で失うのは最大 1 腕):

```
py item1b/sweep74.py                                # 凍結の走行(済・153 腕とも SKIP になる)。⛔ 項目5 では使わない
py item1b/sweep74.py --out <dir>                    # ⭐ 項目5: <dir>/after74.tsv・<dir>/after/・<dir>/fp_after/ へ同じ 153 腕を同じ順で書く
py item1b/sweep74.py --list                         # 腕の一覧
py item1b/sweep74.py --rerun <out.tsv> <arm_id>...  # 色が動いた腕だけ別 TSV へ再走(標準出力は既定の baseline/ に上書きされる点に注意 ⇒ 項目5 では --out と併用)
```

項目5 の突き合わせ: ① 試遊サーバ 8765 を止める ② `--out <dir>` で走らせる(⛔ `<dir>` に `item1b/` 自身を指さない)③ `arm_id` をキーに `baseline_frozen74.tsv` と `after74.tsv` を結び、**exit code で色の遷移**(緑→赤 を 1 本ずつ)④ 経路①②のハッシュ不一致を `fp/` と `fp_after/` の JSON 差分で**構造差と値差へ分類** ⑤ 緑→赤 は再走 2 回で (5) の非決定候補かどうかを測る(⛔ 一覧に載っているだけで片付けない)⑥ 8765 を立て直す。

#### (7) 試遊サーバ 8765

起動コマンドは `ゲームを起動.vbs` と同じもの = `cmd /c cd /d "<リポ直下>" && (py -m http.server 8765 2>nul || python -m http.server 8765 2>nul)`(隠しウィンドウ)。
走査と再走が終わってから立て直した(ブラウザは開いていない)。

#### ⇒ 判定

**着手前の色は凍結できた(153 腕 / 301.9 分 / 緑 135・赤 18、赤はすべて型3)。STEP2 へ進んでよい。**
項目5 への申し送り: ① 指紋を根拠にしない腕 17(判定行 0 行 15 + 指紋が動く 2)② `probe_n4_stall` は再現プローブで色が揺れる ③ `probe_s2_clear --negative` は着手前から赤(`wipeblind`)④ 罠F(`build_sfx.py` が CRLF を書く)を踏むと `verify_eol_doorfix` が赤くなる見込み(§12-0 (7))。

### 12-2. 素材化 + audio.js(項目2) — 2026-09-26 / 基準 `010822a`

⛔ `index.html` は開いていない。`penStrokes` / `SFX.narration` / `playSfx` の合成側(`:749` の `var route = (PEN_NARRATION && name === "narration")`)は無改造。
使い捨ての道具は scratchpad `item2/`(`measure.py` / `check74.js` / `golden/`)。本番 `tools/` には何も足していない。

#### (1) STEP2 — パイプライン(`build_sfx.py` / `sfx_common.py` / `sfx-sources.json`)

- 元素材: `sfx-pipeline/raw/inbox/narration/Felt_Tip_Pen03-02(Write).mp3`(147,250 バイト・`raw/inbox/` はこの項目で新設・gitignore = コミットしない)。
- `sfx_common.py` に 3 関数: `decode_normalized_mono`(`aformat=channel_layouts=mono,loudnorm=I=-16:TP=-1.5,aresample=44100` = **モノラル化 → 全体を 1 回 loudnorm**・`silenceremove` なし)/
  `segment_grains`(§2-8 の方式 = 10ms RMS・包絡の最大比・ヒステリシス・併合・長さで捨てる。**純 Python**=numpy を依存に足していない)/ `write_grain_mp3`(`preMs` 前から切り、直線フェード → 128kbps モノラル 44.1kHz mp3)。
  ⛔ 粒は `normalize_single` を通らない(罠C)。
- `build_sfx.py`: ① `grains` モード(`build_grains`)。**ハッシュの params に `grains` を足すのは `grains` を持つ ID だけ**(全 ID に `grains: null` を足すと既存 8 ID のハッシュが変わり作り直しになる)。
  粒の数は切るまで決まらないので skip 判定は前回 manifest の `files` で行い、粒が減ったら余った古い粒のファイルを消す。
  ② mapping の `source` / `license` / `credit` を `pack_meta()` より優先。③ **`write_credits(manifest)` = 最終 manifest の全 ID から**(罠D)。
  ④ **罠F の直し方 = `write_text(..., encoding="utf-8", newline="\n")`**(manifest / CREDITS / sfx-report の 3 箇所)。
- mapping `narration` は §5-2 の値そのまま(`grains` = `hiDb −18 / loDb −28 / mergeMs 25 / minMs 40 / maxMs 400 / preMs 5 / fadeInMs 2 / fadeOutMs 20`・**調整なし**)。
- 全体実行: `built=1 skipped(冪等)=8 inbox待ち=18`(narration: grains **33 粒**)。既存 12 本の mp3 は md5 すべて一致・`git status` で modified になったのは manifest / CREDITS だけ(差分は narration の追加のみ)。
  再実行 = `built=0 skipped=9`(粒・manifest・CREDITS の md5 不変 = 冪等)。`--only ui_tap` でも `CREDITS.md` は 9 行のまま(罠D が消えた)。`py tools/check_tree_eol.py` → **RESULT: OK**。

#### (2) 粒の実測(ffmpeg で 33 本 + ページ内 `decodeAudioData` で同じ値)

| 項目 | 実測 | 範囲 |
|---|---|---|
| 本数 N | **33**(§2-8 の 31 と違うのは loudnorm 後の包絡で切るため。項目1 の再現でも 31/33/32/31 と揺れた) | 20〜40 ✅ |
| 長さ min / 中央 / max | **65 / 125 / 395 ms** | 40〜400 ✅(max は切り出し 390 + `preMs` 5) |
| 先頭の −40 dBFS 超え | 最大 **8.7ms** | ≤ 15 ✅ |
| 峰 max / min / 幅 | **−1.47 / −15.08 dBFS / 13.61 dB** | ≤ −1.0 ✅ / ≥ 6 ✅ |
| 形式 | 全粒 モノラル 44.1kHz | ✅ |
| 合計 | 121,385 バイト(2,133〜7,567) | — |

- ⭐ Chrome の `decodeAudioData` の長さは ffmpeg と一致(LAME のギャップレス情報が効き、符号化遅延の無音は付かない)。
- ⚠ **粒の長さは 33 本で 18 種類しかない**(105.6ms が 6 本 など)⇒ (2d)「選ばれた粒が N/2 種以上」を **buffer の長さで識別すると上限 18 で、N/2 = 16.5 をぎりぎりしか超えない**。項目4 は buffer の同一性(`sfxBufCache` の URL か AudioBuffer の参照)で数えること。

#### (3) STEP3 — `audio.js`(+8 行 −2 行・CRLF 978/978 を保った)

| 行(実装後) | 変更 |
|---|---|
| 21〜24 | `var PEN_SAMPLE = (function () { … get("pensample") !== "0" … })();`(`PEN_NARRATION` の直後) |
| 687 | 関門 `if (name === "narration" && !(PEN_NARRATION && PEN_SAMPLE)) return false;   // #74 撤退の腕では録音を鳴らさない (罠B)` |
| 699〜700 | 出口 `var route = (name === "narration") ? buses.voice` / `: ((def.bus === "ui" \|\| name === "button") ? buses.ui : buses.sfx);` |
| 916 | クレジット行の末尾へ `　｜　効果音  OtoLogic (CC BY 4.0)`(`PEN_SAMPLE` で出し分けない) |

#### (4) 使い捨て検証 `item2/check74.js`(実ページ・`?autoplay` なし・自前ポート 10461・8765 は無接触)

| ページ | 腕 | 読込時の粒の要求 | `playSfx("narration")` ×3 = [BufferSource, Oscillator, 出口] | button / hit | 200 回の散らばり | 「語り 音量」→ 37 | クレジット |
|---|---|---|---|---|---|---|---|
| index / tavern | 素 | **33 / 33** | 3 回とも **[1, 0, voice]**(buffer 長は粒のどれか) | ui / sfx | 長さ **18 種**(= 全種) | voice 0.95→**0.37**・sfx 0.9 / ui 0.81 不変 | ✅ |
| index / tavern | `?pensample=0` | 33 | **[3, 0, voice×3]**(#73 の合成) | ui / sfx | 0 | 同上 | ✅ |
| index / tavern | `?penvoice=0` | 33 | **[0, 1, ui]**(「ピッ」・録音 0) | ui / sfx | 0 | 同上 | ✅ |
| index / tavern | manifest から narration を消す | 0 | **[3, 0, voice×3]**(fallback) | ui / sfx | 0 | 同上 | ✅ |

pageerror は全 8 腕 0 件。⇒ (a)〜(f) すべて成立。罠A・罠B は項目1 の再現(出口 ui / `?penvoice=0` で録音)から**反転**した。

#### (5) 既存 golden(着手前 = 凍結 TSV `item1b/baseline_frozen74.tsv`)

| 本 | 着手前 | 項目2 後 |
|---|---|---|
| `driver_bgm_mine` / `driver_bgm_title` / `driver_bgm_town` / `driver_dev_gate` / `driver_dev_gate2` / `verify_mercenary_roster` / `verify_title_screen` | 緑 | **緑**(exit 0) |
| `driver_bgm_title --negative` / `driver_bgm_town --negative` | 緑 | **緑** |
| `verify_eol_doorfix`(素・`--negative`) | 緑 | コミット前は赤 = (1e-1)「`git diff HEAD` が宣言外を含まない」と (3b)「本番 5 ファイルの blob が HEAD と同一」。**作業ツリーと HEAD の差を測る本**なので未コミットの間だけ赤い。コミット後の再走は下の (7) |
| `verify_pen_narration`(素) | 緑 28/28 相当 | **赤 15/19・exit 1** — 下の (6) |

#### (6) 赤くなった #73 受入 `tools/verify_pen_narration.js` の assert(⛔ 言い直しは項目3)

- **(0c)** 配信 manifest に `narration` キーがある(= 本チケットの正)。
- **(0e)** 変異 `sampledpen` の注入点(manifest に `ui_tap` をコピーして `narration` を足す)が成り立たない(`narration` が既に在る)。⚠ §2-9 の表に無かった赤。
- **(2b)** 素の腕が `bs1/osc0`(期待 bs3)— off の腕は `bs0/osc1` で期待どおり。
- **(2c)** 素の腕の出口が `["voice"]` 1 本(期待 3 画すべて voice)— off / button / hit は期待どおり。
- ✅ **(5a) は緑**(関門で `?penvoice=0` から録音が外れた = 罠B の直しが効いている)。§12-0 (7)-2 の「(5a) が崩れる」は**関門が無い場合**の話で、関門込みでは崩れない。
- (2a)(3a)(3b)(4a)(4b)(1a)〜(1d)(0f) は緑。

#### (7) コミット後の `verify_eol_doorfix`

コミット `8a1b8e2` の直後(作業ツリー clean)に再走: **素 27/27 PASSED・exit 0** / **`--negative` 9/9 実行・空振り 0・exit 0**(着手前の凍結と同じ色)。`py tools/check_tree_eol.py` → RESULT: OK。
⇒ (5) の赤は未コミットの差分由来と確定(型3)。

#### (8) ⚠ 崩れた主張

1. §2-8 / §1 の「約 31 粒」⇒ 実装では **33 粒**(同じしきい値でも、loudnorm 後の包絡で切るので揺れる)。範囲 20〜40 の中 = 設計どおり(定数で焼かない)。
2. §12-0 (7)-2 の「罠B で (5a) が崩れる」⇒ 関門込みの実装では **(5a) は緑**。赤くなるのは (0c)(0e)(2b)(2c) の 4 つ。
3. §2-9 の表に **(0e)** が無い(`sampledpen` の注入点が消えるので装置 assert も赤くなる)。
4. (補足)§2-5 の懸念どおり loudnorm は単発の dynamic モードで、峰の最大は −0.45 → **−1.47 dBFS** に下がったが幅は 14.15 → **13.61 dB** とほぼ保たれた(罠C の潰れは起きない)。

### 12-3. #73 受入の言い直し(項目3) — 2026-09-26 / 基準 `0a68b04`

⛔ `index.html` / `tavern.html` / `audio.js` は開いていない(changelog 不要)。触ったのは `tools/verify_pen_narration.js`(LF 988 → 1049 行・LF を保った)だけ。使い捨てのログは scratchpad `item3/`。

#### (1) 着手前の色(`0a68b04`)

- 素: **15/19・exit 1**(170.3 秒)。赤 = (0c)(0e)(2b)(2c)(§12-2 (6) と同じ 4 つ・理由も同じ)。
- `--negative`: 起動時の (0e) 検算で `sampledpen` のアンカー腐敗(`narration 有り` ×0)⇒ **exit 3**(変異は 1 本も走らない)。

#### (2) 言い直した所

| 対象 | 前 | 後 | 条件の個数(前 → 後) |
|---|---|---|---|
| 素の腕の URL | 撤退スイッチ無し | **`?pensample=0`**(`ON_QS`・`qsOf(mode)`)。NARR_IDX / NARR_TAV / PARTS / WAVE の 4 ユニット全部。off の腕 `?penvoice=0` はそのまま(`pensample=0` を足さない = 罠B の関門を off の腕でも踏ませる) | — |
| **(0c)** | 配信 manifest に `narration` が**無い** | 配信 manifest に `narration`(粒 ≥1)が在り、撤退の 2 腕(素 `?pensample=0` / off `?penvoice=0`)では **全粒が decode 済なのに** `playSfx("narration")` の BufferSource に**録音の粒が入らない** / 対照 = スイッチ無しの腕(PARTS に新設した `smp`)では粒が**ちょうど 1 つ**入る(index / tavern) | **4 → 14**(status・配列・非空・粒 ≥1 の 4 + 撤退 2 腕 × 2 ページ × 〔全粒 decode 済・粒が入らない〕の 8 + 対照 2 ページの 2) |
| **(2b)(2c)** | 素の腕 = スイッチ無し | 素の腕 = `?pensample=0`。**述語は 1 文字も変えていない**(BufferSource 3・Oscillator 0 / 3 画すべて voice) | (2b) 4 → 4 / (2c) 変化なし |
| **(0e)** | 変異 9 本・注入点 13 行 | 変異 **8 本**・注入点 **12 行**(`sampledpen` の json 1 行が退役で抜けた分だけ)。残り 8 本の注入点は引き続き「原本でちょうど 1 件」 | 13 → 12(退役分) |
| 変異 `sampledpen` | 担当 (0c)(2b)(2c) | **退役**(理由をコード注記)。json 変異の機構は残す(使う変異なし) + `NEG_EXPECT` と `MUTATIONS` の突き合わせ番人を追加 | — |
| `switchdead` の担当 | 12 件 | **13 件 = +(0c)**(実走で決めた。`PEN_NARRATION` が常に真 ⇒ `?penvoice=0` の腕でも関門を通って粒が 1 つ入る) | — |

- 観測の仕組み(`PAGE_PROBES` に追加・本番は無改造): `Response.prototype.arrayBuffer` で ArrayBuffer に出所 URL を、`BaseAudioContext.prototype.decodeAudioData` で AudioBuffer に出所 URL を紐付け(⚠ decode で ab が detach されるので**呼ぶ前に**引く)、`AudioBufferSourceNode.prototype.buffer` の setter で「BufferSource に入った buffer の出所」を記録。合成の雑音 buffer は出所 null。
- PARTS は 3 腕とも、`playSfx` の前に**全粒の decode を待つ**(最大 15 秒・実測は 3 腕とも待ち 0ms = 読み込み時点で 33/33 済)。⭐ 待たないと「未 decode で合成へ落ちた」だけの素の腕の緑があり得る(`playSampled` の `if (!buf) { sfxFetchBuf(file); return false; }`)。
- ポート: 素 10441 / 変異 **10442〜10449**(`switchdead` は 10450 → 10449)。

#### (3) (0c) の検査力の確認(一回限り・コミットしていない)

`tools/_tmp_vpn_item3.js`(本体の写し + 変異 `nogate` = 関門 `audio.js:687` を消す)を `--mutate nogate --units PARTS` で走らせて削除: **赤 = (0c)(2b)(2c)**(on / off の両腕で粒 1/1・bs1)。⇒ 言い直した (0c) は関門の撤去を捕まえる。この変異は依頼書どおり項目4 の新受入 `nogate` が正式に負う(この本には入れない)。

#### (4) 実行結果

| 走行 | 結果 | 所要 |
|---|---|---|
| 素 1 回目 | **19/19・exit 0** | 171.9 秒 |
| 素 2 回目 | **19/19・exit 0** | 171.8 秒 |
| 素 3 回目 | **19/19・exit 0** | 172.2 秒 |
| `--negative`(8 本) | 素の基準 19/19 + **8/8 検出・空振り 0・exit 0** | 917.0 秒 |
| `--negative --only switchdead`(担当に (0c) を足した後の再走) | 素の基準 19/19 + 担当 13 件すべて赤・✓ OK・exit 0 | 284.2 秒 |

- 指紋: 3 回とも (0c) の詳細は同一(index / tavern とも on 粒 0/3・off 0/0・smp 1/1・decode 33/33)。(2b)(2c) も同一。揺れたのは (4b) の「完全一致の件数」と「自己比較で揺れたレシピ」の一覧だけ(#73 で既知の Chrome オフライン描画の ~6e-8 の揺れ・許容 1e-6 の内)。
- 変異ごとの赤(`--negative`): manifestleak (1a)(1a')(1b)(1c)(1d) / durleak (1a')(1b)(1c)〔(1a) 緑のまま〕/ preloadleak (1a)(1a')(1d)〔(1b)(1c) 緑のまま〕/ blipback (2a)(2b)(2c)(4a) / uiroute (2c) / sliderdead (3a) / oldchanged (4a) / switchdead (0a)(0c)(1a)(1a')(1b)(1c)(1d)(2a)(2b)(2c)(3a)(4a)(5a)。**#73 時点の担当表と switchdead の (0c) 以外は同じ**(注入点は +4〜+6 行ずれたが逐語で当たる)。

#### (5) ⚠ 崩れた主張

1. §2-9 / §7 は `sampledpen` の退役だけを挙げていたが、**`switchdead` の担当が 1 件増える**((0c) が撤退の腕でも録音を見るようになったため)。
2. (0c) は「在る」だけの言い直しでは**素の腕が未 decode で合成へ落ちた緑と区別できない** ⇒ 「全粒 decode 済」と「スイッチ無しの対照で粒が鳴る」を条件へ足した(依頼書の文言より強い)。
3. #73 の header の「変異 9 本 / 10442〜10450」は 8 本 / 10442〜10449 へ。

### 12-4. 新規受入 verify_pen_sample.js(項目4) — 2026-09-26 / 基準 `9fc7ae6`

⛔ `index.html` / `tavern.html` / `audio.js` は開いていない(changelog 不要)。足したのは `tools/verify_pen_sample.js`(新規・LF 816 行)だけ。
走行ログは scratchpad `item4/`(`base_{1,2,3}.log` / `neg.log` / `mut_<変異>.log`)。

#### (1) 装置

- ポート = 素 **10451** / 変異 **10452〜10458**(着手時に `tools/` の grep 0 件・待ち受け 0 件を再確認)。8765 は無接触。
- 配信は内蔵 http。`audio.js` / `sfx-manifest.json` / `CREDITS.md` を起動時に凍結し、変異はメモリ上で差し替える(本番は無改造)。
  `flatgrain` / `leadpad` は **同じ URL のまま** 配信 mp3 を ffmpeg で作り直して配る(`os.tmpdir()/df_pen74_<pid>_*`・終了時に削除。実走後 0 個を確認)。
- ユニット 4 本: META(http・node)/ GRAIN(空ページで全粒を `decodeAudioData`)/ PLAY(index / tavern × smp・`?pensample=0`・`?penvoice=0`・fb = manifest から narration を抜いた配信〔puppeteer の要求差し替え〕= 8 腕)/ GATE(index / tavern の開始の関門 → 1 文字目)。`?autoplay` は不使用。
- 観測 = #73 本の PAGE_PROBES と同じ作法(最初の 5 個の Gain に名前 / connect で出口 / `Response.arrayBuffer` → `decodeAudioData` → `AudioBufferSourceNode.buffer` の setter で buffer の出所 URL)+ **AudioParam の目標値の記録**((2c)・下の崩れた主張 1)。
- PLAY は `playSfx` の前に `GameAudio.preloadSfx(["narration"])` を呼び、**全粒の decode を待つ**(実測は 8 腕とも待ち 0ms = 読み込み時点で 33/33)。⇒ eager の有無は (2e) だけが測る(`lazy` の担当が (2e) 1 本に絞れた理由)。

#### (2) assert 一覧 = **19 本**(素 19/19 × 3 回)

| id | 中身(実測値は素の 1 回目) |
|---|---|
| (0a) | manifest 200・N = **33**(実体から導出)・20 ≤ N ≤ 40・全粒 200 |
| (0b) | `git ls-files sfx-pipeline/raw` = 0 件 |
| (0c) | 変異 7 本の注入点が原本でちょうど 1 箇所(busui `audio.js:699` / nogate `audio.js:687` / nocredit `CREDITS.md:13` / lazy・nonarr = manifest の `"narration":` ×1〔lazy は preload = eager も〕/ flatgrain・leadpad = 粒 33/33 実在 + ffmpeg 有り)。腐ったら `--negative` / `--mutate` は exit 3(実証済み) |
| (0f) | 開いたページ 11/11 起動・pageerror 0 |
| (1a) | 長さ 40〜420ms: **65.0〜395.0ms** |
| (1b) | −40dBFS 初到達 ≤ 15ms: **0.2〜8.7ms** |
| (1c) | 峰 ≤ −1.0 dBFS: 最大 **−1.47** |
| (1d) | 峰の幅 ≥ 6dB: **−15.08〜−1.47 = 13.61dB** |
| (1e) | decode の numberOfChannels = 1 **かつ** 配信バイトの MPEG フレームヘッダ = 44100Hz・mono(channelMode 3) |
| (2a) | 全粒 decode 済で `playSfx("narration")` 1 回 = BufferSource 1(出所 = manifest の粒)・出所無し 0・Oscillator 0(index / tavern) |
| (2b) | 出口 = `["voice"]`・button = ui・hit = sfx・配線(master→destination / bgm→master / voice→master) |
| (2c) | 「語り 音量」つまみ → 37: **録音の出口のバス** と voice バスの目標値 0.95 → 0.37・master 0.8 / sfx 0.9 / ui 0.81 不変 |
| (2d) | 200 回で選ばれた粒の**出所 URL** = **33 種**(≥ N/2 = 16.5)・200 回とも粒 1 つ |
| (2e) | 開始のクリック → 1 文字目の時点で全 33 粒の要求が発行済み(関門の時点で既に 33) |
| (3a) | fb: 合成 3 画(出所無しの buffer 3・Oscillator 0)・voice×3・粒の要求 0 |
| (4a) | `?pensample=0`: 全粒 decode 済でも合成 3 画・voice×3・粒 0 |
| (4b) | `?penvoice=0`: 全粒 decode 済でも Oscillator 1・BufferSource 0・`["ui"]` |
| (5a) | 配信 `CREDITS.md` の narration 行 = `OtoLogic` / `CC BY 4.0`(仮置きでない)・manifest の 9 ID 全部に行 |
| (5b) | 設定モーダルに `効果音  OtoLogic (CC BY 4.0)`(smp / `?pensample=0` × index / tavern) |

⛔ 測らない(§8): volume / pitchVar・粒の正確な本数・しきい値・重なり・音色。

#### (3) 変異の担当(⭐ 実走で決めた = `--mutate <key>` で全ユニットを 1 本ずつ)

| 変異 | 注入 | §8 の机上の表 | 実走で赤 | 赤の中身 |
|---|---|---|---|---|
| `busui` | 出口 `buses.voice` → `buses.ui` | (2b)(2c) | **(2b)(2c)** | 出口 `["ui"]` / (2c) = voice は 0.37 へ動くが**出口の ui は 0.81 のまま** |
| `nogate` | 関門の行を消す | (4b) | **(4a)(4b)** | `?pensample=0` / `?penvoice=0` の両腕で bs1・粒 1・voice |
| `flatgrain` | 全粒の峰を −6dBFS へ(再エンコード) | (1d) | **(1d)** | 峰 −7.21〜−5.65 = 幅 **1.56dB**((1c) は −5.65 で緑のまま) |
| `lazy` | manifest の `narration.preload` を削除 | (2e) | **(2e)** | 関門 0 → 1 文字目 **1/33**(最初の `sfx("narration")` が 1 本だけ取りに行く) |
| `nonarr` | manifest から `narration` を削除 | (0a)(2a) | **(0a)(1a)〜(1e)(2a)〜(2e)(4a)(4b) = 13** | N = 0。§1 / §2 / §4 は「N ≥ 1・全粒 decode 済」を自前の条件に持つので空振りせず赤。(3a)(5a)(5b)(0b)(0c)(0f) は緑 |
| `leadpad` | 全粒の頭に 150ms の無音(再エンコード) | (1b) | **(1a)(1b)** | 初到達 150.1〜158.7ms / 長さ 215〜545ms(最長 395 + 150 が上限 420 を超える) |
| `nocredit` | `CREDITS.md` の `\| OtoLogic \| CC BY 4.0 \|` → 仮置き | (5a) | **(5a)** | narration 行 = `["inbox(手動)","(要 inbox の出典記入)"]` |

- ⭐ **机上の表と違ったのは 3/7**(`nogate` +(4a) / `nonarr` +11 / `leadpad` +(1a))。どれも本番の欠陥ではなく、測定の範囲が机上より広いことによる。
- ⭐ **NEG_GREEN 相当のガード** = `--negative` は全ユニットを走らせ、**赤の集合が担当と完全一致**(担当の外が 1 つでも赤 = 「担当が絞れていない」・担当が 1 つでも緑 = 「空振り」・素にある assert が出ない = 「判定が出ていない」・(0f) 赤 = 起動確認 NG)を要求し、外れたら exit 1。
  ガード自体の検査: 写しで `busui` の担当を (2b) だけにして走らせ → `担当が絞れていない (2c)`・**exit 1**(写しは削除済み)。アンカーを 1 本壊した写し → `⛔ busui audio.js:null ×0`・**exit 3**。

#### (4) 実行結果と所要

| 走行 | 結果 | 所要 |
|---|---|---|
| 素 1 / 2 / 3 回目 | **19/19・exit 0** ×3 | 14.4 / 14.4 / 14.4 秒 |
| `--negative`(7 本・全ユニット) | 素の基準 19/19 + **7/7 検出・空振り 0・漏れ 0・exit 0** | 114.5 秒 |

- 指紋: 判定行を「ms の数値」と ctx の時刻を落として正規化 → 3 回とも sha256 先頭 16 桁 **`2a730c8b1d075154`**(id と合否の並びは `e0c56106f79d2d3e`)で一致。
- 居残り: Chrome 0・`df_pen74_*` 0・作業ツリーは新規 1 本だけ。

#### (5) ⚠ 崩れた主張

1. ⚠⚠ **(2c) の測り方 — `gain.value` は鳴っていないバスでは動かない。** つまみを 37 へ動かすと `GameSettings.voice` は 0.37 になるのに、voice バスの `gain.value` は 600ms 待っても **0.95 のまま**(index / tavern・ctx は running)。
   Chrome は入力の無いノードの AudioParam を描画スレッドで進めないため(項目2 の `check74.js` で 0.37 が読めたのは測る直前まで何かが鳴っていたからと読める)。
   ⇒ `AudioParam.setTargetAtTime` / `value =` を包んで **audio.js が書いた目標値** を読む。⛔ `gain.value` で測ると素が赤(1 回目の実走で (2c) だけ赤 = これで発覚)。
2. ⚠⚠ **§8 (2c) の文言「voice バスの利得が変わる」は `busui` を捕まえない。** 出口を ui へ戻しても voice バス自体はつまみで 0.95 → 0.37 と動く(`busui` の実測)。
   ⇒ 「**録音が流れ込むバス**((2b) で観測した出口)の利得も 0.95 → 0.37」を足した(期待値は弱めず条件を足した)。これで `busui` の担当が §8 どおり (2b)(2c) になる。
3. ⚠ **(1e)「44.1kHz」は `decodeAudioData` では測れない。** decode は文脈の sampleRate へリサンプルするので、decode 側の `sampleRate` は常に文脈の値(項目2 の「ページ内 decodeAudioData で同じ値」の 44.1kHz は自明に一致していた)。
   ⇒ チャンネル数は decode、サンプルレートとモノラルは **配信バイトの MPEG フレームヘッダ**(node で ID3v2 を飛ばして最初のフレーム)で測る 2 経路にした。
4. ⚠ §8 の変異表は 3/7 が実測と違った(上の (3))。担当は実走の集合を `NEG_EXPECT` に書いた。
5. (補足)`lazy` の注入点は逐語では差せない — `"preload": "eager",` は manifest に **2 件**(ui_tap と narration)。JSON を読んで `narration.preload` だけを消す(注入点の検算は「`"narration":` ×1 かつ preload = eager」)。
6. (補足)(2d) は依頼書の申し送りどおり **buffer の出所 URL** で数えた(長さなら上限 18 種)。実測 33 種 / 200 回。

#### ⇒ 判定

**受入 19/19 × 3・`--negative` 7/7(空振り 0・漏れ 0)。項目5(全数走査)へ進んでよい。**
項目5 への申し送り: この本は母集団に**新規で入る**(凍結 TSV `item1b/baseline_frozen74.tsv` に行が無い = 着手前の色が無い)⇒ 突き合わせでは「新規・緑」として別枠で数える。所要は素 約 15 秒・`--negative` 約 115 秒。

### 12-5. 母集団の非退行(項目5) — 2026-09-26 着手 → ⏸ 一時中止 → 2026-09-28 再開・完了 / 基準 `13c2a42`

⛔ 本番も `tools/` も `assets/` も `sfx-pipeline/` も 1 バイトも触っていない(走査・再走の前後で `git status --short` = **0 行**・HEAD = `13c2a42`)。
#74 の実装差分 = `git diff --name-only 010822a 13c2a42` = `audio.js` / `tavern.html`(changelog 1 行)/ `assets/sfx/CREDITS.md` / `assets/sfx/sfx-manifest.json` / `assets/sfx/ui/narration_1..33.mp3` /
`sfx-pipeline/{data/sfx-sources.json, scripts/build_sfx.py, scripts/sfx_common.py}` / `tools/verify_pen_narration.js`(項目3)/ `tools/verify_pen_sample.js`(項目4)/ 本書。
成果物 = scratchpad `…/39a966a8-5807-4d8e-b6cc-9c0f2f680fb2/scratchpad/item5/`(以下 `item5/`)。

#### (1) 走った腕 = **155 腕** = 凍結の 153 腕(同じ腕・同じ順)+ 新規受入 `verify_pen_sample` の素 / `--negative` の 2 腕(別枠)

- 腕の表 = `item5/armlist75.json`(`item5/build_arms75.py` が `item1/armlist74.json` の 153 腕に、`git diff --diff-filter=A 9c6197a HEAD -- tools/` で**足された本**のうち union 規則と `--negative` 規則を満たすものを足して導出。⛔ 155 を定数で焼いていない)。
- 走行器 = `item5/sweep75.py`(`item1b/sweep74.py` と同じ本体で、読む腕の表だけ `armlist75.json`)。`--out item5/run` ⇒ `item5/run/after74.tsv`(155 行 + ヘッダ・18 列)/ `after/` / `fp_after/`。直列・毎腕後に `df_*` の居残り Chrome を掃除(**全 155 腕で 0**)。
- 打ち切り = `probe_party_size`(素)の 600 秒だけ(着手前と同じ扱い)。

#### (2) 中断と再開(⏸ 2026-09-26 ユーザー指示「後日続きをやるので、いったん一時中止」)

| | 実測 |
|---|---|
| 1 回目 | 2026-09-26 04:56:53 → 07:20:42。**92 腕済**(最後に DONE = 92 腕目 `probe_n4_stall` 素)。93 腕目 `probe_p9_tour`(素)が START のまま停止 ⇒ **失った腕 = 1**(TSV に行が無いので再開時に頭から走り直した) |
| 停止中 | 走行器・ドライバ・Chrome の残存 0・作業ツリー clean(orchestrator が 2026-09-28 に実測) |
| 再開 | 2026-09-28 13:11:18 → 15:33:46(**142.5 分**・93〜155 腕目の 63 腕)。`RESUME: 92 arms already done -> SKIP` |
| 腕の合計時間 | **285.3 分**(共通 153 腕 **283.0 分**・凍結 301.9 分 → **−18.9 分**。うち約 −15 分は下の `verify_pen_narration --negative` が 1 秒で落ちた分) |
| 最長 6 腕 | `verify_bolt_aim` 2,245.8s / `probe_p9_tour` 1,730.6s / `driver_field_step6` 1,584.9s / `auto_debug_run` 1,074.4s / `verify_hold_pair` 904.7s / `driver_diag_watchdog` 677.3s |

⚠ 試遊サーバ 8765 は再開の時点で**すでに LISTEN していなかった**(止める対象なし)。走査と再走の間は空けたままにし、全部終えてから立て直した(下の (7))。

#### (3) 色の遷移(exit code が主)

| 遷移 | 件数 | 本 |
|---|---|---|
| 緑→緑 | **131** | — |
| 赤→赤 | **18** | 着手前の赤 18 腕がそのまま(§12-1 (4) の表と同じ 18 腕。`probe_n4_stall` も今回は赤) |
| **緑→赤** | **4** | `driver_field_step2`(素)/ `driver_monsters_hobgoblin`(素)/ `verify_world_heromark`(素)/ `verify_pen_narration --negative` ⇒ 下の (5) で**4 本とも #74 に帰属しない**と決着 |
| 赤→緑 | **0** | — |
| exit の値だけ変化 | 0 | — |
| 新規(別枠) | **2** | `verify_pen_sample` 素 **19/19 PASSED・exit 0**(16.0 秒)/ `--negative` **7/7 検出・空振り 0・exit 0**(123.0 秒) |

- 一時中止の時点(92 腕)での緑→赤は 2 本(`driver_field_step2` / `driver_monsters_hobgoblin`)。残り 63 腕で `verify_world_heromark` と `verify_pen_narration --negative` の 2 本が増えた。
- 判定行の合計(共通 153 腕): 凍結 PASS 7,103 / FAIL 74 / PENDING 4 → 実装後 **PASS 7,011 / FAIL 47 / PENDING 4**(減った分の大半は `verify_pen_narration --negative` が 1 秒で落ちた = 判定行 127 → 8)。

#### (4) 2 経路の突き合わせ

指紋を比べられる腕 = **136**(153 − 判定行 0 行の 15 腕 − 指紋が走行ごとに動く 2 腕〔`driver_field_step6` / `driver_monsters_griffon`〕。⛔ この 17 腕は exit だけで見た。§12-1 (5) の申し送りどおり)。

| | 一致 | 不一致 |
|---|---|---|
| 経路① assert id の並び | **130 / 136** | `driver_field_step2` / `driver_monsters_hobgoblin` / `verify_world_heromark` / `verify_pen_narration`(素)/ `verify_pen_narration --negative` / `verify_mercenary_roster --negative` |
| 経路② 判定行の多重集合 | **129 / 136** | 上の 6 本 + `driver_grid_p5` |

差の分類(⛔ 正規化して消していない。全量は `item1b/fp/<arm_id>.json` と `item5/run/fp_after/<arm_id>.json`・比較器 `item5/cmp75.py -v`):

| 腕 | 分類 | 中身 |
|---|---|---|
| `verify_pen_narration`(素) | **構造差 = 予定した型1** | (0c) の判定行が「narration キーが無い」→「narration(粒 ≥1)が在り、撤退の 2 腕では録音を鳴らさない」へ(§12-3 (2))+ 退役した `sampledpen` の行が消えた(経路① 28 → 27)。色は緑のまま **19/19** |
| `verify_pen_narration --negative` | **構造差 = 装置の異常終了**(+ 予定した型1) | 走査では **1.0 秒で exit 3221226505(0xC0000409 = STATUS_STACK_BUFFER_OVERRUN)**。§0e の検算 8 行と「旧版 = git show 0e8370d:audio.js」を出した直後に node が落ち、ページを 1 枚も開いていない。(5) で再走 |
| `driver_field_step2` | **値差**(`D2-dragon-lair` の合否が 1 件反転 + 失敗の再掲行) | `mapCanvas` の SHA が `edf3960915a9251d`(golden `01b23f482dcdfe2f`)。⭐ 同じ走行の **D1(描画コマンドの引数列)は golden と完全一致** = 命令は同じで画素だけ違う |
| `driver_monsters_hobgoblin` | **値差**(id の並びは同一・`(e)` 2 行の合否だけ反転) | `entries=0` / `minAc=0 maxAc=0` = **装置が 1 件も観測できなかった**(#73 §12-5 (4) と同じ形) |
| `verify_world_heromark` | **値差**(`(1c)` の合否反転 + 失敗の再掲行) | 「ホップ 3: 1px も進まなかった / 進んだホップ 2/3 / heroNode が pier のまま」(実クリックで 3 ホップ歩かせる母集団ガード) |
| `verify_mercenary_roster --negative` | **値差**(緑→緑) | ⭐ **凍結側の揺れ**: 凍結の走行では 10 本の変異の 1 本で `(2z3) [母集団]` が NG(編成に載った生 Lv = 1 = 名簿の抽選)。実装後は 10 本とも OK。exit は両方 0 |
| `driver_grid_p5` | **構造差(経路②のキー)**・経路①は一致・緑のまま | 本文の職業名 `ally:elf` / `ally:rogue` → `ally:cleric`(抽選の編成)。#73 §12-5 (3) で既知 |

#### (5) 緑→赤 4 本の帰属判定(⛔「既知フレークの一覧に載っている」で片付けていない)

**① 構造: 4 本とも #74 のバイトを踏む。** `index.html` / `world.html` は `audio.js` を読み、`sfx-manifest.json` を取って `eagerPreloadSfx()` が**33 粒を取りに行く**(撤退の腕でも)。
`verify_pen_narration` は #74 が書き換えた本そのもの。⇒ 「触れていないので無関係」とは言えない ⇒ **影のツリーとの対比較で測った**。

**② 影のツリー** = `item5/shadow/`(作業ツリーを `.git` と `source_images` を除いて実体コピー → `item5/mkshadow.py` で本番バイトだけ `010822a`〔= #74 の実装前〕へ戻した)。
戻したもの = `audio.js` / `tavern.html`(CRLF へ戻して配置)/ `assets/sfx/CREDITS.md` / `assets/sfx/sfx-manifest.json` / `sfx-pipeline/{data/sfx-sources.json, scripts/build_sfx.py, scripts/sfx_common.py}`(LF)+ 粒 33 本を削除。
⭐ 検算: 各ファイルで「HEAD の blob を同じ行末変換にかけたもの == 作業ツリーのバイト」が **7/7 一致**(= 変換の作法が正しい)。`tools/` は実体コピー(#69 の教訓 = junction だと ROOT が本番へ戻る)。
走らせ方 = `item5/pair75.py`: 本番と影を**交互に**(奇数回は本番が先・偶数回は影が先)直列で走らせ、毎回 `df_*` の Chrome を掃除。

| 腕 | 見た assert | 本番(`13c2a42`) | 影(`010822a` 相当) | Fisher 両側 | 判定 |
|---|---|---|---|---|---|
| `driver_field_step2` | `D2-dragon-lair` | 赤 **0 / 6** | 赤 **1 / 6**(影の 3 回目・同じ FAIL) | p = 1.0 | **#74 前から在る非決定**。⭐ 影(= #74 の粒が無い)でも同じ D2 が赤くなった。`project_headless_verification` の既知(2026-08-10 から「D2-dragon-lair が約 1/16 で別ハッシュ」)と同じ形 |
| `driver_monsters_hobgoblin` | 全体の exit(赤の中身) | 赤 **7 / 12**(`(e)` 観測 0 件 ×5・`(d)` pack/disc 0 ×2) | 赤 **5 / 12**(`(e)` 観測 0 件 ×3・`(d)` pack/disc 0 ×3。1 回は両方) | p = 0.68 | **#74 前から在る非決定**。赤の中身は両方とも「観測 0 件」の同じ 2 形 = フレークの指紋。#73 でも途中で一度赤くなり帰属なしと判定された本 |
| `verify_world_heromark` | `(1c)`(⚠ exit ではない) | 赤 **0 / 6** | 赤 **0 / 6** | p = 1.0 | **再現しない 1 回きりの赤**(本番の再走 6/6 で緑)。凍結・本番の再走 6 回・影 6 回の計 13 回で赤は走査の 1 回だけ |
| `verify_pen_narration --negative` | 全体 | 再走 **1 回 = 8/8 検出・空振り 0・exit 0**(924.4 秒) | —(この本は #74 後の本番を前提に書き換えた本なので影では測れない) | — | **装置の異常終了(1 回きり)**。落ちたのはページを開く前(node の fast-fail)。同じ本の `--negative` は項目3 でも緑(917.0 秒)⇒ 緑 2 / 落ち 1 |

⚠ **影では `verify_world_heromark` の exit は比べられない。** 影には `.git` が無いので `(3a)`(`git show c1c85e0` で着手前のキー集合を取る)が**影では毎回赤**になる(6/6)。⇒ 対比較は**色が動いた assert `(1c)` の合否**で数えた。
(`driver_field_step2` は `%TEMP%/df_step2_baseline` の既存 worktree を再利用するので影でも B 節が走る = exit で比べてよい。)

⇒ **#74 に帰属する緑→赤 = 0 本。** 再走の総量 = `item5/rr_vpn/`(15.4 分)+ `item5/rr_pairs/`(3 本 × 6 対)+ `item5/rr_hob2/`(hobgoblin 6 対)。

#### (6) 新規受入(別枠)と #73 受入

- `node tools/verify_pen_sample.js` → **19/19 PASSED FAILED 0・exit 0**(16.0 秒)/ `--negative` → **7/7 検出・空振り 0・漏れ 0・exit 0**(123.0 秒)。項目4 の 3 回 + 本項目の 1 回。
- `node tools/verify_pen_narration.js` → **19/19・exit 0**(173.1 秒)/ `--negative` → **8/8・exit 0**(再走・924.4 秒)。
- 「全ページで起動時の要求が 33 本増える」(§8)で赤くなった本は**無かった**(要求数・ロード時間を測る golden に色の変化なし)。

#### (7) 試遊サーバ 8765

走査と再走をすべて終えてから、`ゲームを起動.vbs` と同じコマンド(`cmd /c cd /d "<リポ直下>" && (py -m http.server 8765 2>nul || python -m http.server 8765 2>nul)`)を `Win32_Process.Create` でデタッチ起動。
**`LISTEN :::8765`** ・ `http://localhost:8765/title.html` = **200**。居残りの Chrome(`df_*`)/ node(`tools/`)/ 8765 以外の `http.server` = **0**。

#### (8) ⚠ 崩れた主張

1. 一時中止の申し送り「再開は `py item1b/sweep74.py --out …`」⇒ `sweep74.py` は `item1/armlist74.json`(**153 腕**)を読む。新規 2 腕を含む **155 腕**の表を読むのは `item5/sweep75.py`(`armlist75.json`)で、中断前の 92 腕もこちらで走っていた(`sweep75.log` の 1 行目 = `arms=155`)。⇒ 再開は `sweep75.py` で行った。
2. 「試遊サーバ 8765 は LISTEN 中(ユーザーのもの)」⇒ 再開の時点で **LISTEN 0 件**(`Get-NetTCPConnection` / `netstat` とも)。止める対象が無かった。
3. §12-1 (5) の「非決定の既知候補」一覧は**また要約だった**。今回の緑→赤 4 本のうち一覧に載っていたのは `driver_monsters_hobgoblin` だけ。`driver_field_step2` の `D2-dragon-lair`(2026-08-10 からの既知フレーク = メモリにはある)/ `verify_world_heromark` の `(1c)` / `verify_pen_narration --negative` の node 異常終了の 3 本は載っていなかった。

#### ⇒ 判定

**155 腕(凍結 153 + 新規 2)で #74 に帰属する緑→赤は 0。** 緑→赤 4 本は、影のツリーとの交互の対比較(3 本)と再走(1 本)で、どれも #74 の前から在る非決定か 1 回きりの異常と決着。
赤→緑 0・新規 2 腕は緑。指紋の差 7 本は、予定した言い直し 1・装置の異常終了 1・値差 4(うち 1 本は凍結側の揺れ)・既知の抽選の本文 1 で説明が付く。

### 12-6. 総括

**何を実装したか(プレイヤー向け)**

1. 語りの文字送りに合わせて、**フェルトペンで紙に書く録音の音**が 1 画ずつ鳴る(#73 の合成の「シャッ」を置き換え)。
   元素材(OtoLogic「Felt_Tip_Pen03 — 02 Write」)をモノラル化 → **全体で 1 回 loudnorm** → 1 画ずつ **33 粒**に切った(粒ごとの正規化はしない = 強弱 13.6dB が残る)。呼び口ごとに 33 粒からランダムに 1 粒。
2. 録音の音は **voice バス**へ流れるので、設定の「**語り 音量**」でペンの音だけの大きさを変えられる(罠A の直し)。
3. `?penvoice=0`(#73 の撤退)では録音を鳴らさず朗読 +「ピッ」へ戻る(罠B の関門)。新しい撤退 **`?pensample=0`** は #73 の合成ペンへ戻す。
4. 設定のクレジット行に **`効果音  OtoLogic (CC BY 4.0)`**、`assets/sfx/CREDITS.md` に narration 行(`build_sfx.py` が最終 manifest の全 ID から書く = 罠D の直し)。

- 実装 = `audio.js`(`PEN_SAMPLE`・関門・出口・クレジット)+ `sfx-pipeline`(`grains` モード・mapping の上書き・CREDITS の書き方・LF 固定 = 罠F)+ 粒 33 本 + manifest / CREDITS + changelog 1 行。`index.html` は無改造。
- 受入 `tools/verify_pen_sample.js`(新規・base 10451 / 変異 10452〜10458)= 素 **19/19**(項目4 で 3 回 + 項目5 で 1 回)/ `--negative` **7/7**(空振り 0・漏れ 0)。
- #73 受入 `tools/verify_pen_narration.js` の言い直し(項目3)= 素 **19/19**(3 回 + 項目5 で 1 回)/ `--negative` **8/8**(`sampledpen` 退役・`switchdead` の担当に (0c))。
- 母集団の非退行 = **155 腕**(凍結 153 + 新規 2)で **#74 に帰属する緑→赤 0**(§12-5)。

**崩れた主張 = 20 件**

| # | 依頼書・申し送りの主張 | 実測 | 出典 |
|---|---|---|---|
| 1 | §2-6「`build_sfx.py` を全体で回すのは安全」 | 内容は正しいが **Windows では manifest / CREDITS が CRLF で書き直される**(罠F)⇒ LF 固定が要る | §12-0 (7)-1 |
| 2 | §2-4「罠B で #73 受入の (4a) が崩れる」 | (4a) は `__renderSfxOffline` で `playSampled` を通らない。崩れるのは (2b)(2c) の off 腕と (5a) | §12-0 (7)-2 |
| 3 | `index.html` の `sfx()` ラッパは `:3253` | **`:3252`** | §12-0 (7)-3 |
| 4 | §2-1「峰 −3.2 dBFS」 | ステレオの true peak。モノラル化後は **−0.45 dBFS**(モノラル化 → loudnorm の順が要る) | §12-0 (7)-4 |
| 5 | §2-8 / §1「約 31 粒」 | **33 粒**(loudnorm 後の包絡で切るので揺れる・範囲内) | §12-2 (8)-1 |
| 6 | §12-0 (7)-2「罠B で (5a) が崩れる」 | 関門込みでは **(5a) は緑**。赤は (0c)(0e)(2b)(2c) | §12-2 (8)-2 |
| 7 | §2-9 の「崩れる assert」の表 | **(0e)** が無い(`sampledpen` の注入点が消える) | §12-2 (8)-3 |
| 8 | §2-5 の懸念(全体 loudnorm でも強弱が潰れるか) | 峰の最大 −0.45 → −1.47 dBFS、幅 14.15 → **13.61 dB** = ほぼ保たれた | §12-2 (8)-4 |
| 9 | §2-9 / §7「言い直しは `sampledpen` の退役」 | **`switchdead` の担当も 1 件増える**((0c)) | §12-3 (5)-1 |
| 10 | §7「(0c) を『在る』へ言い直す」 | 「在る」だけでは未 decode で合成へ落ちた緑と区別できない ⇒ 「全粒 decode 済」+「スイッチ無しの対照で粒が鳴る」を足した | §12-3 (5)-2 |
| 11 | #73 本の header「変異 9 本 / 10442〜10450」 | **8 本 / 10442〜10449** | §12-3 (5)-3 |
| 12 | §8 (2c) を `gain.value` で測れる | 鳴っていないバスの `gain.value` は動かない ⇒ **audio.js が書いた目標値**で測る | §12-4 (5)-1 |
| 13 | §8 (2c)「voice バスの利得が変わる」で `busui` を捕まえる | 捕まえない(voice バス自体は動く)⇒「録音が流れ込むバスの利得も」を足した | §12-4 (5)-2 |
| 14 | §8 (1e)「44.1kHz」を decode で測る | decode は文脈の sampleRate へリサンプル ⇒ **MPEG フレームヘッダ**で測る | §12-4 (5)-3 |
| 15 | §8 の変異表の担当 | **3/7 が実測と違う**(`nogate` +(4a) / `nonarr` +11 / `leadpad` +(1a)) | §12-4 (5)-4 |
| 16 | `lazy` は逐語の置換で差せる | `"preload": "eager",` が manifest に **2 件** ⇒ JSON で `narration.preload` だけ消す | §12-4 (5)-5 |
| 17 | (2d) を buffer の長さで数える | 長さは 18 種しかない ⇒ **出所 URL** で数えた(33 種) | §12-4 (5)-6 |
| 18 | 一時中止の申し送り「再開は `item1b/sweep74.py --out`」 | それは 153 腕の表を読む。155 腕の `item5/sweep75.py` で再開した | §12-5 (8)-1 |
| 19 | 「8765 は LISTEN 中」 | 再開時 **LISTEN 0 件** | §12-5 (8)-2 |
| 20 | §12-1 (5) の非決定の既知候補の一覧 | 緑→赤 4 本のうち載っていたのは 1 本だけ = **一覧は要約** | §12-5 (8)-3 |

**残**

- **§9 の実機確認 5 項目(ユーザー担当・そのまま)**: ① ダンジョン導入の語りでフェルトペンの音が文字に合わせて鳴るか・うるさくないか(`volume` は耳で詰める)② 「語り 音量」でペンの音だけの大きさが変わるか ③ 酒場の前口上でも同じ音か ④ `?pensample=0` で #73 の合成ペン・`?penvoice=0` で朗読 +「ピッ」へ戻るか ⑤ 文字送りを最速にしたときの重なりが耳障りでないか。⚠ http 起動が必須。
- **素材の出所 OtoLogic は起草窓の推定**(CC BY 4.0 = クレジット必須)。**ユーザーの最終確認待ち**。違っていたら `sfx-sources.json` の `source` / `license` / `credit` と `audio.js` のクレジット行を差し替える。

**別チケット候補(本チケットでは直さない)**: `driver_field_step2` の `D2-dragon-lair` の非決定(2026-08-10 から未解決・D1 は一致するので画像の decode の待ち方)/
`driver_monsters_hobgoblin` の「観測 0 件」(12 対で本番 7・影 5 = 半分近く赤)/ `probe_s2_clear --negative` の `wipeblind` の検査力 0 / `probe_party_size` の両腕 /
`auto_debug_run.js` のポート 8765 固定(#73 から継続)。
