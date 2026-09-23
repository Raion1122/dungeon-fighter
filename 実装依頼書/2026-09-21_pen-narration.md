# #73 語りをペンの音へ — 朗読の声をやめ、物語が紙に書き綴られていく音にする

- **起草**: 2026-09-21(起草窓 `claude-80`) / **ステータス**: **承認済**(2026-09-22)
- **触るファイル**: `audio.js`(本体) / `tavern.html`(**changelog 1 行だけ**・`add_changelog.py` 経由) / `tools/verify_pen_narration.js`(新規)
- ⛔ **触らないファイル**: `index.html` / `js/skill-check.js` / `assets/voice/**`(mp3 69 本と `manifest.json`) / `assets/sfx/sfx-manifest.json`
  — 本チケットは **`audio.js` の中だけで完結する**(§2-2 で「朗読の呼び口 11 箇所がすべて `audio.js` の関門を通る」ことを確認済み)。
- ⏸ **着手条件: #72 の着地後。** changelog は `tavern.html` の `#changelogBox` に載るが、`tavern.html` は実装窓が #72 で編集中。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

> ⚠⚠⚠ **行番号の読み方**
> 本書の行番号は **基準 `0e8370d`**(= `origin/main`、2026-09-21)。⛔ **行番号は従、識別子(逐語)が主。**
> `tavern.html` は #72 の着地で**確実に動く**。着手時は必ず逐語で引き直すこと。
> ⭐ 着手時の引き直しは「動いたか」ではなく **「そもそも合っているか」** を見る(#72 の依頼書は、動いていないファイルで起草時から 5 箇所ずれていた)。

---

## 1. 目的

いま DM の語りは、**VOICEVOX で事前生成した朗読 mp3(69 本・計 485.1 秒)** が喋り、画面では文字が 1 字ずつ現れて、
**3 文字に 1 回「ピッ」**(880Hz の正弦波・12 ミリ秒)が鳴っている。

これを、**声をやめて「ペンで紙に文字を書いている音」だけにする**。DM が物語を語るのではなく**書き綴る**演出。
TRPG の卓で DM がメモを取る手触り、プール・オブ・レイディアンスの「冒険日誌」への目配せでもある。

**ユーザー決定(2026-09-21)**:

- ✅ **朗読の声は 69 本すべて止める** — 依頼人が「」で話す台詞(話者 玄野武宏 / 剣崎雌雄 / 九州そら / 麒ヶ島宗麟)も含む。ゲームから人の声が無くなる。
- ✅ **ペンの音は合成で作る** — 既存の効果音と同じく `audio.js` の中で、雑音を帯域フィルタに通して作る。素材もライセンスも要らない。
- ⛔ 不採用: **タイプ音だけペンにして朗読は残す** / **語り手(DM)だけ止めて依頼人の台詞は残す** / **設定で「朗読 / ペン」を切り替える** / **録音素材を使う**

**起草窓の決定(承認時に覆してよい)**:

- ✅ 設定画面の **「ボイス音量」つまみを「語り 音量」へ読み替え**、ペンの音を **voice バス**へ流す。
  - 理由: 声を止めるとこのつまみは**何も操作しない死んだつまみ**になる。一方ペンの音は**1 文字ごとに鳴り続ける**ので、
    戦闘の効果音とは**別に絞れる**ほうがよい。既存のつまみと保存キー(`voice`)をそのまま使えば、保存形も変わらない。
  - ⛔ 不採用: つまみを**隠す**案(ペンの音が「効果音 音量」に連動し、戦闘音と一緒にしか絞れなくなる)。

⚠ **遊び心地の変化(意図したもの)**: 朗読があるときは「声が鳴り終わるまで次へ進めない」声ペースだったが、
声を止めると既存の**テキストペース**(クリックで送る / 2.5 秒で自動送り)になる。**導入の語りは短く、飛ばせるようになる。**

---

## 2. 着手前の実測(起草窓が `0e8370d` の本番コードと実ファイルで確かめた事実・headless は回していない)

### 2-1. 今の「声」は 2 種類ある

**① タイプ音「ピッ」** — 呼び口は **2 箇所だけ**(`grep -rn "['\"]narration['\"]"` でリポジトリ全文を実測・`tools/` を除く):

| ファイル:行 | 何 |
|---|---|
| `audio.js:231` | レシピ `narration: function (c, d, t) { tone(c, d, t, { type: "sine", freq: 880, dur: 0.012, peak: 0.05, a: 0.001 }); }` |
| `audio.js:245` | `SFX_VAR` の `narration: 0`(ピッチのゆらぎ無し) |
| `index.html:14711` | `typeNarrationParagraph` の中 `if (i % 3 === 0) sfx("narration");   // タイプ音 (3文字に1回・極小)` |
| `tavern.html:8217` | 同上(`if (i % 3 === 0) sfx("narration");`) |

**② 朗読の声** — `assets/voice/manifest.json` は **69 件・合計 485.1 秒**。話者は VOICEVOX の ID で 7 種:

| 分類 | 話者 ID | 本数 | 中身の例 |
|---|---|---|---|
| `dungeon` | 84 | 31 | ダンジョン導入の語り(`dungeon_intro_<舞台>_<n>`) |
| `event` | 84 / 86 / 13 | 9 / 7 / 2 | ボス部屋の前・ボス登場の語り(`nar_boss_room_enter` 等) |
| `quest` | 13 / 84 / 11 / 16 / 21 / 53 | 4 / 6 / 2 / 1 / 1 / 1 | 依頼を受けた一言(`quest_accept_00N`)・依頼人の台詞(`quest_dialog_<舞台>_1`) |
| `plaza` | 86 | 5 | 闇市の一言 |

話者名は `audio.js:885` のクレジット行が正(「ナレーション音声 VOICEVOX:青山龍星 / 玄野武宏 / 剣崎雌雄 / 九州そら / 麒ヶ島宗麟」)。

    # 再測定
    py -c "import json,io,collections;m=json.load(io.open('assets/voice/manifest.json',encoding='utf-8'));print(len(m), round(sum(float(v.get('durationSec') or 0) for v in m.values()),1));print(collections.Counter((v.get('category'),v.get('speaker')) for v in m.values()))"

### 2-2. ⭐⭐⭐ 朗読の呼び口 11 箇所は、すべて `audio.js` の関門を通る

| ファイル:行 | 何を呼ぶか |
|---|---|
| `index.html:14252` | `voice(voiceId)`(任意のナレーション) |
| `index.html:14748` | `voice(voiceId)`(導入の語り・声ペース) |
| `index.html:14760` | `voice(voiceId)`(同・テキストペース) |
| `index.html:39726` | `GameAudio.preloadVoice(ids)`(導入の事前読み込み) |
| `tavern.html:8243` / `:8253` | `voice(voiceId)`(酒場の語り・声ペース / テキストペース) |
| `tavern.html:8323` | `GameAudio.playVoice("quest_accept_00" + …)` |
| `tavern.html:9512` / `:9706` / `:9816` | `voice(voiceId)` / `voice("plaza_quest_accept")` / `voice("plaza_buy_highvalue")` |
| `js/skill-check.js:441` | `playVoice(pickVoiceId(…))`(`:187`〜`:189` のラッパ経由) |

ページ側の `voice()`(`index.html:3255` / `tavern.html:8202`)も含め、**全部が `GameAudio.playVoice` / `getVoiceDuration` / `preloadVoice`** に行き着く
(`audio.js:912`〜`:916` の公開 API = `playVoiceClip` / `getVoiceDuration` / `preloadVoiceClips`)。

⭐ そして **3 つとも `voiceManifest` を読んで初めて動く**(`audio.js:555` / `:575` / `:605`)。`voiceManifest` の読み手は **`audio.js` の外に 0 件**。
manifest を読み込む口は `loadVoiceManifest`(`audio.js:521`)ただ 1 つで、呼び口は `index.html:3279` と `tavern.html:9435` の 2 箇所。

⇒ ⭐⭐⭐ **`loadVoiceManifest` を止めるだけで、11 箇所すべてが既存の「声なし」経路へ落ちる。**
これは新しい状態ではない — `audio.js:513` のコメントどおり **「manifest 未ロード/未生成/file:///未 unlock では全 API が無音 no-op」** で、
`file://` 直開き(音声だけ無音になる既知の状態)と**同じ経路**。本番で既に通っている道を常時通すだけになる。

### 2-3. ⭐ 声なしの経路は既に在り、既存 golden が通している

`getVoiceDuration`(`audio.js:598`〜`:607`)は、ミュート / 音量 0 / manifest なしのとき **0 を返す**。
呼び元の `playNarration` は 0 を受けると**テキストペース**へ落ちる:

| | 声ペース(`durMs > 0`) | テキストペース(`durMs === 0`) |
|---|---|---|
| `index.html` | `:14746`〜`:14757` | `:14758`〜`:14766` |
| `tavern.html` | `:8241`〜`:8250` | `:8251`〜`:8259` |
| 送り | 声が鳴り終わるまで**全文を保持**(クリックでは送らない) | 「クリックで続ける」+ `NARRATION_PARA_GAP_MS = 2500` で自動送り |
| ヒント文 | 「♪ 語りに耳をかたむけよう…」 | 「クリックで続ける」 |

⭐ `tools/probe_party_size.js:868` が `GameAudio.getVoiceDuration = function () { return 0; }` と差し替えて**この経路を実際に走らせている**(`:651` の注記)。

### 2-4. ⚠⚠⚠ 罠1 — 「声を鳴らす関数」だけ止めると、語りが無音のまま固まる

いちばん素直に見える実装は「`playVoiceClip` の先頭で `return`」だが、**これをやると壊れる**:
`getVoiceDuration` は manifest の `durationSec` を返し続けるので `durMs > 0` のまま **声ペースの分岐に入り**、
`while (Date.now() - startMs < durMs) await sleepMs(40);`(`index.html:14757` / `tavern.html:8250`)で
**声の長さぶん、無音のまま全文が保持され、クリックも効かない**。ヒントは「♪ 語りに耳をかたむけよう…」のまま。
導入の語りは 1 段落あたり数秒〜十数秒 × 4 段落なので、**実害がはっきり出る**。

⇒ **止める場所は `loadVoiceManifest` 1 箇所にする**(§5-2)。3 関数が manifest なしで揃って no-op になるので、この食い違いが原理的に起きない。
⭐ この罠は §8 の変異 **`durleak`** として装置に内蔵させること。

### 2-5. ⚠⚠ 罠2 — 事前読み込みを止め忘れると、導入が最大 4 秒止まる

`index.html:39723`〜`:39728` は、開始のクリックの**後に**
`await Promise.race([GameAudio.preloadVoice(ids), sleepMs(4000)]);` で導入クリップを取りに行く。
`preloadVoiceClips` が manifest を見て mp3 を fetch + decode すると、**声は鳴らないのに最大 4 秒、1 文字目が出ない**。
manifest を読まなければ `audio.js:575` の `!voiceManifest` で即座に解決する。
⭐ 変異 **`preloadleak`** として内蔵させること。

### 2-6. ⚠⚠⚠ 罠3 — `?autoplay` は声の経路を丸ごと迂回する(罠1・罠2 が検証で見えなくなる)

- `index.html:14744` — `if (window.__autoplay) durMs = 0;`(自動テストは常にテキストペース)
- `index.html:39709`〜`:39711` — autoplay は開始の関門も事前読み込みも**飛ばす**
- ⚠ **`tavern.html` の `playNarration`(`:8239`〜`:8240`)には autoplay の上書きが無い** — 酒場側は自動テストでも声ペースに入りうる

⇒ 既存 golden の大半は `index.html?autoplay=…` で入るので、**罠1・罠2 を踏んでも緑のまま**になる。
**受入の §1 は `?autoplay` を付けずに入り、開始の関門(`index.html:39716`「▶ クリックして物語を始める」)をクリックで越えて測ること**(§8 の計測機構)。

### 2-7. ⚠⚠ 罠4 — 設定モーダルは HTML ではなく `audio.js` の中で組み立てられている

「ボイス音量」つまみは **`audio.js:835`** の `volRow("ボイス音量", …)`。⚠ 起草窓は最初 `*.html` だけを grep して **「つまみは無い」と誤って判断しかけた**。
音量つまみとバスの対応(`applyVolumes` `audio.js:97`〜`:106`):

| つまみ(`audio.js:832`〜`:835`) | 保存キー | バス | 係数 |
|---|---|---|---|
| マスター音量 | `master` | `master` | `muted ? 0 : master` |
| BGM 音量 | `bgm` | `bgm` | そのまま |
| 効果音 音量 | `sfx` | `sfx` / `ui` | `ui` は **`sfx × 0.9`** |
| ボイス音量 | `voice` | `voice` | そのまま(既定 `0.95` = `audio.js:13`) |

`narration` は今 **`ui` バス**へ出ている(`audio.js:717`〜`:718` の `isUi`。録音素材経路の `:669` も同じ)。
⇒ §5-4 / §5-5 で **ペンの音を `voice` バスへ流し、つまみの名前を「語り 音量」へ**変える。
⭐ 変異 **`uiroute`** / **`sliderdead`** として内蔵させること。

### 2-8. ⚠ 罠5 — 録音素材が合成レシピより先に使われる

`playSfx`(`audio.js:712`〜)は **`playSampled(name, opts)` を先に試す**(`:715`)。`assets/sfx/sfx-manifest.json` のキーは
**8 件**(`door_open` / `hit_blocked` / `hit_bone` / `hit_flesh` / `item_get` / `ui_cancel` / `ui_confirm` / `ui_tap`)で、
**`narration` は無い** ⇒ 今は合成レシピが使われる。⚠ 将来ここへ `narration` を足すと**ペンのレシピが黙って迂回される**
⇒ §8 の (0c) で番人にする。

    py -c "import json,io;m=json.load(io.open('assets/sfx/sfx-manifest.json',encoding='utf-8'));print(sorted(m), 'narration' in m)"

### 2-9. 合成の部品と、音を測る口

- `noise(c, dest, t0, o)`(`audio.js:159`〜) — `filter` / `cutoff` / `cutoffTo` / `q` / `peak` / `a` / `dur`。
  1 秒ぶんの雑音バッファ(`getNoiseBuf` `:123`〜`:131`)の**乱数の位置から**再生する(`:175`)⇒ **毎回わずかに違う音**になる。
- `tone(c, dest, t0, o)`(`audio.js:141`〜)。
- ⭐ **`GameAudio.__renderSfxOffline(name, opts, seconds)`**(= `renderOffline` `audio.js:746`〜`:761`、公開は `:925`)が
  レシピを `OfflineAudioContext` で描いて**波形の配列を返す**。受入はこれで音色を測れる。
- 物理で決まる基準値: 880Hz の正弦波の**ゼロ交差率** = 2 × 880 ÷ 44100 = **0.0399 / サンプル**。雑音系はこれより桁で大きい。

### 2-10. 開始の関門は声と無関係に張られる(触らない)

`index.html:39713`〜`:39720` の「▶ クリックして物語を始める」は **autoplay 以外で無条件**に張られる(声の有無を見ていない)。
WebAudio の解錠はペンの音にも必要なので、**そのまま効く**。⛔ 触らない。

### 2-11. その他

- `audio.js` は IIFE `(function (global) { … })(window)`(`:8`)。**`audio.js` が URL を読んだ前例は 0 件**(`location` / `URLSearchParams` の grep が空)⇒ 撤退スイッチが初の前例になる。
- `penvoice` の先客は **0 件**(`.html` / `.js` 全文 grep)。
- 行末: `audio.js` **純 CRLF(947 / 947)** / `tavern.html` **純 CRLF(10,751 / 10,751)** ⇒ 編集は `py` でバイト単位。⛔ 改行を `grep` で測らない。
- ポート: 本チケットの新規ドライバは **base 10441**(変異 **10442〜10450**)。
  根拠(2026-09-22 更新): #72 の受入 `verify_member_identity.js` が **10401〜10413**、#72 のプローブが **10414〜10440** を実使用
  (実装窓の申告。プローブは scratchpad 側にあり `tools/*.js` の grep には現れない — `tools/` で見えるのは 10413 まで)。
  ⛔ 当初案の 10411 / 10421 はどちらも使用済み。⚠ 着手時に空きを再確認する。
- 声に依存する既存 golden は **`tools/probe_party_size.js` の 1 本だけ**(`getVoiceDuration` / `playVoice` / `preloadVoice` / 「語りに耳」/ `voiceManifest` / `"narration"` / `typeNarrationParagraph` の全文 grep)。
  声を止めると `:868` の差し替えは**冗長になるが無害**(元から 0 を返させているため)。

### 2-12. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **`audio.js` を触るので鳴る**。
書けるプレイヤー向けの要約は実在する(§10)。⚠ `add_changelog.py` は **`tavern.html` を書き換える** ⇒ #72 と衝突するので**着手は #72 の着地後**。

⭐ #72 の受入 `tools/verify_member_identity.js` は `tavern.html` の **14 行を逐語で握っている**(実装窓の申告)が、
**changelog は握っていない**(`changelog` / `更新情報` / `changelogList` / `<li><b>` の grep が **0 件**・2026-09-22 実測)
⇒ #73 の changelog 追記(最古の 1 行が落ちる)で #72 の受入は赤くならない見込み。⚠ 着手時に同じ grep で再確認する。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `audio.js` | ① 撤退スイッチの定数 1 本 ② `loadVoiceManifest` の先頭で止める ③ `narration` レシピをペンの音へ(従来の正弦は撤退の腕で残す) ④ ペンの音の出口を `voice` バスへ ⑤ 設定モーダルのつまみの名前 |
| `tavern.html` | **changelog 1 行だけ**(`py tools/add_changelog.py`)。⛔ ロジックは触らない |
| `tools/verify_pen_narration.js` | 新規(受入) |

⛔ **`index.html` は開かない**(呼び口 2 箇所の `i % 3` も含めて変えずに済む = §5-3)。
⛔ **`js/skill-check.js` は開かない**(§2-2 の関門で止まる)。
⛔ **`assets/voice/**` は消さない**(撤退スイッチで戻すため。VOICEVOX のクレジット行 `audio.js:885` も残す)。
⛔ **`実装依頼書/README.md` の #73 行は、#72 の着地後に足す**(行の文面は §11)。

---

## 4. STEP1 — 着手前の基準取り(本番も tools も 1 バイトも触らない)

1. `git log --oneline -1` / `git status --short` を記録。**#72 が着地して作業ツリーが clean であること**を確認する。
2. 本書の行番号を**識別子で引き直す**。アンカー(逐語):
   - `narration: function (c, d, t)` / `narration: 0,`(`SFX_VAR`)/ `function loadVoiceManifest(` /
     `function getVoiceDuration(` / `var isUi = (name === "button" || name === "narration");` / `volRow("ボイス音量"` — いずれも `audio.js` に **1 件**のはず。
   - ⭐ **件数を数えてからアンカーに採る**(「その語で一意に引ける」も要約である)。
3. 母集団を 3 段の union で導出(⛔ 本数を定数で焼かない):
   - 段1 触る語 — `grep -ln "narration\|playVoice\|getVoiceDuration\|preloadVoice\|loadVoiceManifest\|__renderSfxOffline\|openSettings" tools/*.js`
   - 段2 `audio.js` または `tavern.html` を読む本(⚠ `audio.js` は**全ページが読み込む**ので、ほぼ全数になる見込み)
   - 段3 測定器のソースを読む測定器
   ⚠ `audio.js` の blob が変わるので、前チケットの凍結 TSV は**流用できない**。全数の直列再走 = **6 時間前後**を見込む(#71 実績 363.4 分)。
4. §2-2 の「manifest が無ければ 3 関数とも no-op」を**本番で 1 回再現**する(`?penvoice` 実装前の本番で、
   `GameAudio.loadVoiceManifest` を呼ばせない腕を作り、導入の語りがテキストペースで進むことを DOM で見る)。
   ⚠ 再現しなければ実装へ進まず §12-0 に理由を書いて止まる。
5. §2-4 の罠1 を**本番で 1 回再現**する(`playVoiceClip` だけを no-op に差し替えた腕で、ヒントが「♪ 語りに耳をかたむけよう…」のまま固まること)。
   ⭐ ここで罠1 の実害の秒数を控える(変異 `durleak` の担当 assert の閾値の根拠になる)。

---

## 5. STEP2 — 実装(`audio.js` のみ)

### 5-1. 撤退スイッチ

IIFE の冒頭付近(`DEFAULTS` の近く)に 1 本:

```js
  // #73 語りをペンの音へ。?penvoice=0 で従来 (VOICEVOX 朗読 + 3 文字ごとの「ピッ」+「ボイス音量」) へ戻す。
  //   ⚠ audio.js が URL を読むのはこれが初めて。ページ遷移はまたがない (各ページが独立に読む)。
  var PEN_NARRATION = (function () {
    try { return new URLSearchParams(global.location.search).get("penvoice") !== "0"; } catch (e) { return true; }
  })();
```

⚠ 判定の逐語 `get("penvoice")` は **`audio.js` にちょうど 1 箇所**。⛔ `sessionStorage` へ写さない。

### 5-2. 声を止める — `loadVoiceManifest` の先頭 1 行

```js
  function loadVoiceManifest(url, baseDir) {
    if (PEN_NARRATION) return;   // #73 manifest を読まない ⇒ playVoice / getVoiceDuration / preloadVoice が揃って no-op
    if (typeof fetch !== "function" || !url) return;
    …(以下そのまま)
```

- ⭐ これで §2-2 の 11 箇所すべてが既存の「声なし」経路へ落ちる。**3 関数を個別に止めない**(§2-4 の食い違いを作る余地を残さない)。
- ⛔ `playVoiceClip` / `getVoiceDuration` / `preloadVoiceClips` / `stopVoiceClip` の本体は触らない。

### 5-3. ペンの音 — `narration` レシピ

呼び口(`index.html:14711` / `tavern.html:8217`)は **3 文字に 1 回**のまま変えない。
代わりに**1 回の呼び出しで 3 画(= 3 文字ぶん)を、文字送りの間隔で刻む**。声を止めると文字送りは常にテキストペースで、
間隔は `GameAudio.textSpeed`(= `GameSettings` の `textSpeed`、既定 70ms)になるので、同じ値を読めば 1 字 1 画で揃う。

```js
  // #73 ペンで紙に書く音。呼び口は 3 文字に 1 回なので、1 回で 3 画 (= 3 文字ぶん) を文字送りの間隔で刻む。
  //   ⚠ 音色の数値は耳で詰めてよい (§8「測らないこと」)。
  function penStrokes(c, d, t) {
    var step = 0.07;
    try { step = Math.max(0.03, Math.min(0.2, (GameSettings.get().textSpeed || 70) / 1000)); } catch (e) {}
    for (var k = 0; k < 3; k++) {
      var tk = t + k * step + Math.random() * step * 0.25;       // 筆の走りのゆらぎ
      noise(c, d, tk, {
        filter: "bandpass",
        cutoff: 2800 + Math.random() * 1600, cutoffTo: 1800 + Math.random() * 800,   // 紙を擦る「シャッ」
        q: 1.4, dur: 0.025 + Math.random() * 0.03, peak: 0.07 + Math.random() * 0.04, a: 0.004,
      });
    }
  }
```

`SFX` 表の `narration` を差し替える:

```js
    narration: function (c, d, t) {
      if (PEN_NARRATION) { penStrokes(c, d, t); return; }
      tone(c, d, t, { type: "sine", freq: 880, dur: 0.012, peak: 0.05, a: 0.001 });   // 従来 (⛔ 値を 1 つも変えない)
    },
```

- ⚠ 段落を飛ばした直後に、刻み途中の画が最大 2 つ(≒ 140ms)残って鳴る。**許容する**。
- ⛔ `SFX_VAR` の `narration: 0` は変えない(ゆらぎはレシピ内の乱数で付ける。ピッチゆらぎを足すと従来の腕の音が変わる)。

### 5-4. ペンの音の出口を `voice` バスへ

`playSfx`(`audio.js:717`〜`:718`):

```js
    var isUi = (name === "button" || name === "narration");
    var route = (PEN_NARRATION && name === "narration") ? buses.voice : (isUi ? buses.ui : buses.sfx);   // #73
```

- ⭐ `voice` バスは `master` に繋がっている(`audio.js:73`)のでミュートも効く。声が鳴らないので `duckForVoice`(`:550`)は発火しない。
- `:669`(録音素材の経路)は `narration` の素材が無いので**触らない**(§2-8 の番人で担保)。

### 5-5. 設定モーダルのつまみの名前

`audio.js:835`:

```js
    box.appendChild(volRow(PEN_NARRATION ? "語り 音量" : "ボイス音量", function () { return GameSettings.get().voice; }, function (v) { GameAudio.setVoiceVolume(v); }));
```

- ⛔ **保存キー `voice` と `setVoiceVolume` は変えない**(保存形を変えない。「効果音 音量」と同じ書式で「語り 音量」)。

### 5-6. ⛔ 動かさないもの

`narration` の従来値(`sine` / `880` / `0.012` / `0.05` / `0.001`)・`SFX_VAR.narration = 0`・呼び口 2 箇所の `i % 3`・
`playVoiceClip` / `getVoiceDuration` / `preloadVoiceClips` の本体・`assets/voice/**`・VOICEVOX のクレジット行(`:885`)・
開始の関門(`index.html:39713`〜)。

---

## 6. STEP3 — 既存 golden の言い直し(必要なものだけ)

- 見込みは **0 本**。声に触れる golden は `probe_party_size.js` だけで、`:868` の差し替えは声なしでも成り立つ(§2-11)。
  大半の golden は `?autoplay` で入り、元から声ペースを通らない(§2-6)。
- ⚠ **赤くなった assert の ID を控えてから**言い直す。予想で書き換えない。
- ⭐ **言い直した本数を報告に書く**(0 本なら 0 本と書く)。言い直した assert は**条件の個数を前後で数える**(減っていたら弱体化)。

---

## 7. 撤退スイッチ

- **`?penvoice=0`** — VOICEVOX の朗読・3 文字ごとの「ピッ」・`ui` バスへの出口・「ボイス音量」の名前が**すべて従来へ戻る**。
- 判定位置 = `audio.js` の `PEN_NARRATION` 定数 1 箇所(逐語 `get("penvoice")` ちょうど 1)。
- ページ遷移は**またがない**(`audio.js` は各ページで読み込まれ、各ページが自分の URL を読む)。酒場 → ダンジョンへ移ると外れる。

---

## 8. 受入条件 — `tools/verify_pen_narration.js`(新規・base **10441** / 変異 **10442〜10450**。⚠ 着手時に空きを再確認)

方針: **「声が鳴らない」を 2 経路**(ネットワークに mp3 の要求が出ない / 声の長さが 0 として扱われる)で、
**「ペンの音になった」を 2 経路**(オフライン描画の波形 / ページ内で実際に作られる音の部品)で突き合わせる。
⭐ **罠1〜罠3 は `?autoplay` では見えない**ので、§1 は autoplay を付けずに入る。

### ⚠ 計測機構

- 配信は http。変異は**配信スナップショットをメモリ上で差し替えて**作る(本番ファイルを書き換えない)。
- **§1 は `index.html` を `?autoplay` 無しで開き**、`startScreen` から導入の語りへ進めて「▶ クリックして物語を始める」をクリックで越える。
  ⚠ `index.html:14744` / `:39709` のとおり、autoplay を付けると罠1・罠2 が**原理的に**再現しない。
- 酒場は `tavern.html` を直接開き、語りを 1 本(依頼人の台詞 `quest_dialog_*` を含むもの)通す。⛔ `openPrep` を経由して編成を仕込まない。
- mp3 の要求は `page.on("request")` で `assets/voice/` を数える。
- バスの特定: `audio.js:69` は `master` → `bgm` → `sfx` → `ui` → `voice` の順で `createGain` を 5 回呼ぶ。
  `evaluateOnNewDocument` で `AudioContext.prototype.createGain` と `AudioNode.prototype.connect` を包み、
  **最初の 5 個の Gain に名前を付けて**、`playSfx("narration")` の各画が最後にどのバスへ `connect` したかを記録する。
  ⛔ 検証用の読み取り口を `audio.js` に足さない(既存の `__renderSfxOffline` は使ってよい)。
- ⭐ 観測先は**測る直前に空へ戻し、本番の口にだけ書かせる**(「呼ばれた / 在る」で緑にしない)。
- ⭐ 乱数を含む描画を比べるときは、ページの `Math.random` を**固定種の擬似乱数へ差し替えてから**両腕を描く(`noise()` は乱数の位置から再生する = §2-9)。

### §0 装置

- **(0a)** `?penvoice=0` の腕で manifest が読み込まれ、実在の id(manifest から導出)に対し `getVoiceDuration(id) > 0`。
  ⭐ これが無いと「声が鳴らない」が**manifest の配信失敗でも緑**になる。ページが実際に描けたこと(`document.title` 等)も併せて見る。
- **(0b)** 期待する id は `assets/voice/manifest.json` から導出する(⛔ id を写経しない)。
- **(0c)** `assets/sfx/sfx-manifest.json` に `narration` キーが**無い**(あれば §2 のペンの assert は全部無意味 = 罠5)。
- **(0d)** 撤退の判定は逐語 `get("penvoice")` で **`audio.js` にちょうど 1 箇所**を数える。⛔ 語 `penvoice` の件数で数えない。

### §1 声が止まる(素の腕)

- **(1a)** 導入の語り(4 段落)+ 酒場の語り 1 本を通して、`assets/voice/` への要求が **0 件**。`?penvoice=0` の腕では **1 件以上**。
- **(1b)** manifest に在る id について `getVoiceDuration(id) === 0`。`?penvoice=0` の腕では `> 0`。
- **(1c)** ⭐ **罠1**: 各段落でヒントが「クリックで続ける」になり、「♪ 語りに耳をかたむけよう…」が**一度も出ない**。
  段落が打ち終わったあとのクリックで、**1 秒以内**に次の段落が始まる。
- **(1d)** ⭐ **罠2**: 開始のクリックから 1 文字目が出るまで **≤ 500ms**(STEP1 の実測で閾値を確定してよい。⚠ 事前読み込みが走ると最大 4 秒)。

### §2 ペンの音

- **(2a)** `__renderSfxOffline("narration")` の波形(固定種): 素の腕は**雑音系**(ゼロ交差率が 880Hz 正弦の 0.0399 を**大きく上回る**)で、
  振幅の山(画)が **3 つ**。`?penvoice=0` の腕は**正弦系**(ゼロ交差率 ≒ 0.0399)で山は 1 つ。
  ⚠ 閾値は STEP1 の実測で決め、**根拠の数値を本書 §12 に書く**。
- **(2b)** ページ内で `GameAudio.playSfx("narration")` を 1 回呼ぶと、素の腕は `createBufferSource` が **3**・`createOscillator` が **0**。
  `?penvoice=0` の腕は `createOscillator` が **1**・`createBufferSource` が **0**。
- **(2c)** 素の腕では各画の出口が **`voice` バス**、`?penvoice=0` の腕では **`ui` バス**(計測機構の Gain の名前付けで判定)。

### §3 設定

- **(3a)** `GameAudio.openSettings()` のモーダルに、素の腕は「語り 音量」があり「ボイス音量」が**無い**。`?penvoice=0` の腕は逆。
- **(3b)** そのつまみを動かすと `GameSettings.get().voice` が変わる(**つまみが死んでいない**)。

### §4 恒等(非退行)

- **(4a)** `?penvoice=0` の腕の `narration` のオフライン描画が、**`0e8370d` の `audio.js` で描いたものとサンプル単位で一致**
  (旧 `audio.js` は `git show 0e8370d:audio.js` を配信スナップショットへ差し替えて描く。正弦なので乱数の影響を受けない)。
- **(4b)** `narration` 以外の全レシピ(`sfxNames()`)が、両版で**サンプル単位で一致**(固定種で描く)。

### §5 撤退

- **(5a)** `index.html?penvoice=0` と `tavern.html?penvoice=0` の両方で、§1〜§3 の従来側の期待が**全部**成り立つ。

### ⛔ 測らないこと

- **ペンの音色の細部**(`cutoff` / `q` / `dur` / `peak` の値・3 画の間隔・乱数の幅)— 耳で詰める。assert は「雑音系か正弦系か」「画の数」「出口のバス」まで。
- 語り全体の**所要秒数**の変化(声ペース → テキストペースで短くなるのは意図どおり)。
- 「語り 音量」の既定値(保存キー `voice` の既定 `0.95` をそのまま使う)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `manifestleak` | `loadVoiceManifest` の関門を外す | (1a)(1b) |
| `durleak` ⭐ | 関門を外し、代わりに `playVoiceClip` と `preloadVoiceClips` **だけ**を止める(`getVoiceDuration` は生かす) | **(1c) だけ** ← 罠1。mp3 は要求されないので (1a) は緑のまま = 担当が (1c) に絞られていることを確かめる |
| `preloadleak` | 関門を外し、`playVoiceClip` と `getVoiceDuration` だけを止める | (1a)(1d) ← 罠2 |
| `blipback` | 素の腕でも従来の正弦を鳴らす | (2a)(2b) |
| `uiroute` | ペンの音の出口を `ui` バスに戻す | (2c) |
| `sliderdead` | つまみの名前を「ボイス音量」のままにする | (3a) |
| `oldchanged` | 従来のレシピの `freq` を 880 → 881 にする | (4a) |
| `sampledpen` | `sfx-manifest.json` に `narration` の素材を足す(配信スナップショット上で) | (0c) ← 罠5 |
| `switchdead` | `PEN_NARRATION` を常に `true` にする | (5a) |

⚠⚠ **変異の担当は机上で決めず、1 本ずつ実走して決める**。アンカーは**実装後の逐語**で取り直す(本書の逐語は `0e8370d` のもの)。
⭐ `durleak` は「担当が 1 つに絞られるように」設計してある。**(1a) まで赤くなったら変異の作りが間違っている**。

### 既存 golden の非退行(実装後に必ず走らせる)

- 母集団 = STEP1 の導出値(⚠ ほぼ全数・6 時間前後)。全数・同じ順で直列再走し、**2 経路**(assert id の指紋 + 判定行の多重集合)で着手前と突き合わせる。
- 経路②の差は**構造差と値差に分類**して報告する(⛔ 正規化して消さない)。
- 色が動いた本は再走 2 回 + 凍結指紋との差 0 で切り分ける。**2 回とも赤なら影のツリーへ**(新規フレークの宣言で済ませない)。
- 名指し: `tools/probe_party_size.js`(素 / `--negative`)。

⚠ 基準値は 2026-09-21 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ **ローカルは http 起動が必須**(`file://` では manifest も効果音素材も読めず、比較にならない)。

1. 酒場から依頼を受けてダンジョンへ。**導入の語りで声が鳴らず、文字が出るのに合わせて「シャッ、シャッ」とペンの音がする**か。
   - 書いている音に聞こえるか / うるさくないか / 軽すぎないか → 気になれば §5-3 の数値を耳で詰める。
2. 設定(⚙)を開き、**「語り 音量」でペンの音だけが大きく / 小さくなる**か。戦闘の効果音は変わらないか。
3. 語りが**クリックで送れ、放っておいても 2.5 秒で進む**か(以前は声が鳴り終わるまで進めなかった)。
4. 酒場で依頼人の話を聞く・闇市で買い物をする・判定を振る — **どこでも人の声が鳴らない**か。
5. `index.html?penvoice=0` / `tavern.html?penvoice=0` で、**朗読と「ピッ」と「ボイス音量」が戻る**か。

---

## 10. changelog(⚠ `audio.js` を触るので必須・`tavern.html` に書かれる)

    py tools/add_changelog.py "<b>語りがペンの音になった</b> — ダンジョンマスターの朗読をやめ、物語が紙に書き綴られていく音で進むように。設定の「語り 音量」で大きさを変えられる。"

---

## 11. やらないこと(別チケット送り)

- ⛔ **朗読 mp3 69 本と `manifest.json` の削除**(撤退スイッチで戻すため)。
- ⛔ **VOICEVOX のクレジット行(`audio.js:885`)の削除**(mp3 は配布物に残り、撤退で鳴る)。
- ⛔ **声まわりのコード(`playVoiceClip` 等)と、11 箇所の呼び口の削除**。
- ⛔ **文字送りの呼び口の間隔(`i % 3`)の変更**(`index.html` を開かずに済ませるため。1 字 1 画はレシピ側で刻む = §5-3)。
- ⛔ **設定に「朗読 / ペン」の切り替えを足す**(ユーザー不採用)/ **録音素材**(ユーザー不採用)。
- ⛔ 紙をめくる音・インク壺・羽根ペンのカリカリなどの**追加演出**、話者ごとの書き味の違い。
- ⛔ **`実装依頼書/README.md` への行追加**(#72 の着地後)。用意してある行:

    | 73 | [2026-09-21_pen-narration.md](2026-09-21_pen-narration.md) | **承認済** | 0% | 語りをペンの音へ。VOICEVOX の朗読 **69 本をすべて止め**(依頼人の台詞も含む)、文字が出るのに合わせて**合成のペンの音**(雑音を帯域フィルタに通した 3 画)を鳴らす。設定の「ボイス音量」は「語り 音量」へ読み替え、ペンの音を `voice` バスへ。⭐⭐⭐ 朗読の呼び口 11 箇所はすべて `audio.js` の関門を通り、**`loadVoiceManifest` を止めるだけで既存の「声なし」経路(`file://` と同じ)へ落ちる**。⚠⚠⚠ **`playVoiceClip` だけ止めると語りが無音のまま固まる**(`getVoiceDuration` が長さを返し続けて声ペースに入るため = 罠1)/ **`?autoplay` は声の経路を丸ごと迂回する**ので受入は autoplay 無しで測る。撤退 `?penvoice=0`。受入 `tools/verify_pen_narration.js`(base **10441**)。⏸ #72 着地後(changelog が `tavern.html` に載るため) |

---

## 12. 実装結果

(実装窓が埋める)

### 12-0. STEP1 基準取り(項目1) — 2026-09-24 / 基準 `fd67cfe`

#### (1) 着手前の状態

- `git log --oneline -1` → `fd67cfe #73 引き渡し — 台帳へ | 73 | 行を追加 …`
- `git status --short` → **出力 0 行(clean)**
- `git ls-remote origin main` → `fd67cfe24d870024bb49b217317b5592bc9cc546	refs/heads/main`
  ⇒ HEAD = `origin/main`・未 push 0。**#72 は着地済み** = §7 の ⏸ 着手条件は満たされた。

#### (2) 逐語アンカーの引き直し(⭐ 件数を数えてから採った)

`audio.js` の 6 本は **すべて `grep -cF` = 1 件**。行番号も `0e8370d` から **1 行も動いていない**
(#72 は `audio.js` を触っていないため)。

| アンカー(逐語) | 件数 | 実行番号 | 依頼書 |
|---|---|---|---|
| `narration: function (c, d, t)` | **1** | 231 | 231 一致 |
| `narration: 0,` | **1** | 245 | 245 一致 |
| `function loadVoiceManifest(` | **1** | 521 | 521 一致 |
| `function getVoiceDuration(` | **1** | 598 | 598 一致 |
| `var isUi = (name === "button" \|\| name === "narration");` | **1** | 717 | 717 一致 |
| `volRow("ボイス音量"` | **1** | 835 | 835 一致 |

`audio.js` のその他の参照点も**全部一致**: 13(`DEFAULTS` の `voice: 0.95`)/ 92(`duckForVoice`)/
97+105(`applyVolumes`)/ 123(`getNoiseBuf`)/ 141(`tone`)/ 159(`noise`)/ 512+546(voice バス)/
656(`playSampled`)/ 669(録音素材の route)/ 712(`playSfx`)/ 746(`renderOffline`)/ 816(`openSettings`)/
885(VOICEVOX クレジット)/ 916(公開 `loadVoiceManifest`)/ 925(`__renderSfxOffline`)。

`loadVoiceManifest` の呼び口 2 箇所:

- `index.html:3279` — **一致**
- `tavern.html:9678` — 依頼書 `:9435` から **+243 行**(#72 で動いた)

`index.html` は **1 行も動いていない**: 3255 / 14252 / 14711 / 14731 / 14741–14742 / 14748 / 14760 /
39713–39726 すべて依頼書どおり。

`tavern.html` は #72 で **+197〜+243 行**動いた:

| 依頼書 | 実行番号 | 何 |
|---|---|---|
| 8202 | **8399** | `function voice(id)` |
| 8217 | **8414** | `sfx("narration")`(タイプ音) |
| (記載なし) | **8427** | `async function playNarration` |
| 8241–8250 | **8439–8448** | 声ペースの枝 |
| 8243 | **8440** | `voice(voiceId)`(声ペース) |
| 8251–8259 | **8449–8457** | テキストペースの枝 |
| 8253 | **8450** | `voice(voiceId)`(テキストペース) |
| 8323 | **8520** | `GameAudio.playVoice("quest_accept_00" + …)` |
| 9435 | **9678** | `GameAudio.loadVoiceManifest(…)` |
| 9512 | **9755** | `voice(voiceId)` |
| 9706 | **9949** | `voice("plaza_quest_accept")` |
| 9816 | **10059** | `voice("plaza_buy_highvalue")` |

`tavern.html` の行数: 依頼書 10,751 → 実測 **10,994**(+243)。

⚠ **§2-1 の grep の書き方が実際と違う。** `grep -rn "['\"]narration['\"]"` が返すのは **4 行**だが、
その中身は `audio.js:669` / `audio.js:717` / `index.html:14711` / `tavern.html:8414` で、
表に載っている `audio.js:231` / `:245` は**引用符が付いていないのでこの grep には出ない**。
表の 4 行そのものは実在するので**設計への影響なし**。
⭐ 副産物 = `:669`(録音素材の route・§2-8 罠5 の現場)は引用符付き grep で**必ず出る** ⇒ 罠5 の番人は語で引ける。

⚠⚠ **§2-2 の「呼び口 11 箇所」は 11 箇所すべて実在するが、母集団としては痩せている(実測 16 箇所)。**
表に無い 5 箇所:

| ファイル:行 | 何 | 依頼書の扱い |
|---|---|---|
| `index.html:14741`–`:14742` | `GameAudio.getVoiceDuration(voiceId)`(導入 `playNarration` の主時計) | §2-3 が触れている(表には無い) |
| `tavern.html:8436`–`:8437` | 同(酒場 `playNarration`) | §2-3 が触れている(表には無い) |
| `index.html:14539` | `GameAudio.getVoiceDuration(line.voiceId)`(`narrate()` = DM バナーの表示尺) | ⚠ **どこにも無い** |
| `index.html:14870` | `GameAudio.preloadVoice(ids)`(**エピローグ** `ending_epilogue_*`) | ⚠ **どこにも無い**(§2-5 は `:39726` だけ) |
| `tavern.html:9712` | `GameAudio.preloadVoice(ids)`(**酒場の前口上** `dungeon_intro_prologue_*`) | ⚠ **どこにも無い** |

⭐⭐⭐ **設計の結論は崩れない — むしろ強くなる。** 16 箇所すべてが `playVoiceClip` / `getVoiceDuration` /
`preloadVoiceClips` の 3 関数へ行き着き、3 つとも `voiceManifest` を見る(`audio.js:555` / `:575` / `:605`)。
`voiceManifest` の読み手は `audio.js` の外に **0 件**(実測)。⇒ §5-2 の 1 行で **16 箇所**が落ちる。

⚠ 受入への影響 2 件:

- **事前読み込みの口は 1 つではなく 3 つ**(`index:39726` / `index:14870` / `tavern:9712`)。
  §8 の変異 `preloadleak` と (1d) が「導入の 1 箇所」だけを見ていると**残り 2 つを見逃す**。
- `index.html:14539` は、声を止めると DM バナーの表示尺が「声の尺 + 600ms」から `line.ms || 2600` の
  既定へ落ちる = **意図した(が依頼書に書かれていない)振る舞いの変化**。

#### (3) 依頼書の主張の実測

| 主張 | 結果 |
|---|---|
| 朗読 mp3 = **69 件 / 485.1 秒 / 話者 7 種** | **一致**(69 / 485.1 / 話者 ID = 84, 86, 13, 11, 16, 21, 53 の 7 種)。分類 × 話者の内訳も §2-1 の表と**完全一致**(dungeon/84=31、event/84=9・86=7・13=2、quest/84=6・13=4・11=2・16=1・21=1・53=1、plaza/86=5) |
| `sfx-manifest.json` = **8 キー・`narration` 無し** | **一致**(`door_open` / `hit_blocked` / `hit_bone` / `hit_flesh` / `item_get` / `ui_cancel` / `ui_confirm` / `ui_tap`。`'narration' in m` = `False`) |
| 語 `penvoice` の先客 **0 件** | **一致**(`.html` / `.js` 全文 grep = 0) |
| `audio.js` が URL を読んだ前例 **0 件** | **一致**(`location` / `URLSearchParams` の grep = **0 行**) |
| `audio.js` は**純 CRLF 947 / 947** | **一致**(CRLF=947 / LF=947 / bareCR=0。`py` でバイト実測) |
| `tavern.html` は純 CRLF 10,751 / 10,751 | **行数だけ変化**: CRLF=**10,994** / LF=10,994 / bareCR=0(純 CRLF は維持) |
| #72 の受入が changelog を握っていない | **一致**。`tools/verify_member_identity.js` に対し `changelog`(**大小無視**)/ `changelogList` / `更新情報` / `<li><b>` が**すべて 0 件** ⇒ #73 の changelog 追記で #72 の受入は赤くならない |
| 声に依存する既存 golden は `probe_party_size.js` の **1 本だけ** | **一致**。`:651` の注記と `:868` の `window.GameAudio.getVoiceDuration = function () { return 0; };` を逐語で確認。段1 に入る他 4 本が当たった語は `openSettings` / `narration` だけで、**声の API は握っていない** |
| ポート base **10441** / 変異 **10442–10450** が空き | **一致**(下記) |

ポートの再確認:

- `tools/*.js` が宣言する base の最大は **10413**(`verify_member_identity.js` = 10401)。
- #72 のプローブは scratchpad 側で **10414–10440** を実使用(実測。`tools/` の grep には現れない)。
- **10441–10450 は `tools/*.js` / scratchpad / `%TEMP%\df_pptr` のどこにも 0 件。**
  ⚠ 10448 だけ 1 件出るが、`tools/verify_road_ambush.js:680` の乱数 literal `0.9779461044818163` の
  **部分文字列**であってポートではない。
- `Get-NetTCPConnection -State Listen` で **10380–10460 に待ち受け 0 件**。
- **Chrome の制限ポートではない** — 10441 で実際に配信し `goto` が通った(`ERR_UNSAFE_PORT` なし)。
  ⛔ 10xxx の制限ポートは 10080 のみ。
- ⇒ **base 10441 / 変異 10442–10450 を確定。**

#### (4) 母集団 — 3 段の union = **148 本**(⛔ 本数は導出。台帳 = `%TEMP%\df_pen73\population.tsv` 148 行)

| 段 | 引き方(実行したもの) | 件数 |
|---|---|---|
| 段1 | `grep -ln "narration\|playVoice\|getVoiceDuration\|preloadVoice\|loadVoiceManifest\|__renderSfxOffline\|openSettings" tools/*.js` | **5** |
| 段2 | `audio.js` を読み込む配信ページ(実測 = `index.html` / `tavern.html` / `title.html` / `town.html` / `world.html` の **5 枚**)のいずれか、または `audio.js` 自体を参照する本 | **148** |
| 段3 | 測定器のソースを読む測定器(`readFileSync` の引数が `tools/` または `verify_`/`driver_`/`probe_`/`sweep_`) | **0** |
| | **UNION** | **148**(`tools/*.js` 全 **150** 本のうち) |

- **段1 ⊂ 段2**(差 0)。段1 の 5 本と当たった語:
  `driver_bgm_town.js`(`openSettings` ×1)/ `driver_dev_gate.js`(`openSettings` ×9)/
  `driver_diag_watchdog.js`(`narration` ×1)/ `probe_n4_stall.js`(`narration` ×2)/
  `probe_party_size.js`(`getVoiceDuration` ×2)。
- union の外 = **2 本**: `driver_doors_p1.js`(素の node・`js/df-mapdef.js` の純関数だけ)/
  `verify_codex_map_skill.js`(素の node・`py` を回すだけ)。どちらも `audio.js` を載せるページへ入らない。
  ⭐ ⇒ 依頼書の「ほぼ全数になる見込み」は **一致**(148 / 150)。
- union の内訳: ブラウザを立てる本 **143** / 素の node またはモジュール **5**
  (`_doors_fixture.js` / `_golden.js` / `driver_heromark_signplate.js` / `sim_plaza_entry.js` / `verify_recruit_talk.js`)。
- `--negative` を持つ本 = **48**。本番ソースを逐語で `readFileSync` する本 = **45**。
- ⭐⭐ **`audio.js` の *ソース* を `readFileSync` する本 = 4 本** —
  `driver_bgm_mine.js` / `driver_bgm_title.js` / `driver_bgm_town.js` / `driver_dev_gate.js`。
  この 4 本は `audio.js` の逐語を**変異の注入点**に使っているので、**§5 の編集で注入点が腐りうる最有力**。
  ⚠ `driver_bgm_town.js` は `emptycredit` = **VOICEVOX クレジット行(`audio.js:885`)を空にする変異**を持つ
  ⇒ §5-6 の「クレジット行は残す」は、この変異アンカーの生存条件でもある。
- ⭐ `openSettings` を 9 回叩く `driver_dev_gate.js` は §5-5(つまみの名前)の近傍だが、assert は
  `#wipeSaveSection` / `#btnWipeSave` / `#btnWipeConfirm` と `GameAudio.openSettings()` の**出現回数**だけで、
  **つまみのラベルも行数も見ていない**。`ボイス音量` / `setVoiceVolume` を grep する本は `tools/*.js` に **0 本**
  ⇒ §6 の「言い直し 0 本」の見込みは支持される(⚠ 実走で確かめること)。
- ⚠⚠ union の内部で **20 組のポート衝突**(最大は 8831 = `driver_dev_gate` / `driver_equip_compact_ios` /
  `driver_field_step2` / `driver_leader_ai` の **4 本**)⇒ **並列は確実に偽の赤(exit 3)。直列が唯一の解**
  (TSV のヘッダに全 20 組を記録)。
- ⏸ **全数走査(着手前の色)は本項目では回していない**(項目1b の担当)。

#### (5) 本番での再現(⛔ 本番も `tools/` も 1 バイトも触っていない)

装置 = `%TEMP%\df_pptr\driver_pen73_step1.js`(使い捨て・⛔ `tools/` には置かない)。
puppeteer-core **23.11.1** + 実 Chrome(`C:/Program Files/Google/Chrome/Application/chrome.exe`)を
`headless:true --no-sandbox --disable-gpu --autoplay-policy=no-user-gesture-required` で直駆動。
配信 `py -m http.server 10441`。⚠ **`?autoplay` は付けていない**。
シナリオは `goblin-mine`(`sessionStorage["dragonfighters.currentScenario"]`)。
腕は `evaluateOnNewDocument` で `window.GameAudio` に **setter を仕掛け**、`audio.js:946` の
`global.GameAudio = GameAudio;` が走った瞬間に対象メソッドだけ差し替える(⇒ 本番ファイルは無改造)。
声 id は `manifest.json` から**導出**(`dungeon_intro_goblin-mine_0`–`_3` /
3.381 + 10.912 + 6.016 + 6.656 = **26.965 秒**)。
観測は 20ms 毎に `#dmHint` の文字列・`show` クラス・`#dmBody` の文字数をサンプリングし、
段落境界(`#dmBody` の文字数が**減った**点)から「打ち終わり → 次段落開始」= **保持(hold)** を導出。

| 腕 | クリック | `assets/voice/` 要求 | `getVoiceDuration(実在id)` | `loadVoiceManifest` 差替 | `playVoice` 差替 | 1文字目 ms | 第1段落後のヒント | 段落ごとの保持 ms | 語り総尺 ms |
|---|---|---|---|---|---|---|---|---|---|
| **素**(無改造) | 関門のみ | **5**(manifest + mp3 4) | **3.381 / 10.912 / 6.016 / 6.656** | 0 | 0 | **43** | ♪ 語りに耳をかたむけよう… | 421 / 900 / 740 | **27,224** |
| `nomanifest` | 関門のみ | **0** | **0 / 0 / 0 / 0** | 1 回 | 0 | 34 | **クリックで続ける** | **2600 / 2600 / 2600** | 23,232 |
| `nomanifest` | 250ms 毎(**7** 回) | **0** | **0 / 0 / 0 / 0** | 1 回 | 0 | 33 | **クリックで続ける** | **140 / 240 / 241** | **3,441** |
| `durleak` | 関門のみ | **5** | **3.381 …**(生きている) | 0 | **4 回吸収** | 53 | ♪ 語りに耳をかたむけよう… | 440 / 919 / 760 | **27,226** |
| `durleak` | 250ms 毎(**92** 回) | **5** | **3.381 …** | 0 | **4 回吸収** | 43 | ♪ 語りに耳をかたむけよう… | 400 / **10,820** / **5,920** | **27,225** |

ページエラーは **全腕 0 件**。`document.title` = `ダンジョンファイターズ - 剣盾画像版`
(= ページが実際に描けたことも併せて確認・§8 (0a) の趣旨)。

**(5-1) §2-2 の再現 = ✅ 成立。**
`GameAudio.loadVoiceManifest` を no-op にしただけで:

- `assets/voice/` への要求が **5 → 0 件**(`manifest.json` も取りに行かない)
- `getVoiceDuration(実在 id)` が **3.381 → 0**(4 id すべて)
- ヒントが 4 段落すべて **「クリックで続ける」**。**「♪ 語りに耳をかたむけよう…」は一度も出ない**
- 放置の保持 = **2,600ms**(= `NARRATION_PARA_GAP_MS` 2500 + 観測の刻み)
- **クリックで送れる**: 保持 **2,600 → 140〜241ms** / 総尺 **23,232 → 3,441ms**

⇒ 依頼書の「3 関数が揃って no-op になり、既存のテキストペース経路へ落ちる」は**本番で成立**。
⭐ `playVoiceClip` / `getVoiceDuration` / `preloadVoiceClips` を**個別に触っていない**のに 3 つとも死んだ
= **関門が 1 箇所であること**の直接の証拠(§5-2 の設計を支持)。

**(5-2) §2-4 罠1 の再現 = ✅ 成立(依頼書より実害が大きい)。**
`playVoice` **だけ**を no-op にした腕で:

- ヒントは 4 段落すべて **「♪ 語りに耳をかたむけよう…」**。**「クリックで続ける」は一度も出ない**。
  そして **音は 1 つも鳴っていない**(`playVoice` の 4 回すべてを no-op が吸収)。
- **クリックが一切効かない**: 250ms 毎に **92 回**叩いても総尺は **27,225ms**、
  無クリックの **27,226ms** と **差 1ms**。⇒ 声の尺(26,965ms)が主時計のまま。
- ⭐ **保持秒数(= 変異 `durleak` の担当 assert の閾値の根拠)**:
  - 放置(クリック無し)の**無音保持** = **440 / 919 / 760 ms**。
    これは `durMs` の**残り 15%** — `charMs = durMs × 0.85 / 文字数` を 30〜200ms にクランプするので、
    打ちに 85% が使われる(`index.html:14751` / `tavern.html:8442`)。
    ⇒ 依頼書の「**声の長さぶん**、無音のまま全文が保持され」は**厳密には過大**。保持だけなら 15% ぶん。
  - ⚠⚠ **クリックすると保持が爆発する** = **400 / 10,820 / 5,920 ms**。
    クリックは `typeNarrationParagraph` の `narrationSkipRequested` だけを消費して全文を即表示し、
    そのあと `while (Date.now() - startMs < durMs) await sleepMs(40);` が**声の残り全部**を保持する。
    **最悪 10.8 秒、全文が出たまま何も起きない。**
  - 実害の総量 = 導入 4 段落で **27.2 秒に固定**。テキストペースなら放置 **23.2 秒** / クリック送り **3.4 秒**
    ⇒ **クリック送りとの差 = 23.8 秒**。
- ⭐⭐⭐ **§8 (1c) の閾値設計への警告**:「段落が打ち終わったあとのクリックで **1 秒以内**に次の段落が始まる」を
  **第1段落だけで測ると `durleak` は緑で通る**(第1段落の保持は **400ms** < 1,000ms)。
  ⇒ (1c) は **全段落**で測ること。ヒントの文字列(「♪ 語りに耳をかたむけよう…」が**一度も出ない**)は
  全段落で頑健なので、**ヒント文字列を主・秒数を従**にするのが安全。

⚠⚠⚠ **崩れた主張がもう 1 件 — §8 (1d) は localhost では永久緑。**
罠2(事前読み込みで最大 4 秒止まる)の実測:

- 事前読み込みが走る腕の「開始のクリック → 1 文字目」= **43 / 53 / 43 ms**
- 走らない腕(`nomanifest`)= **34 / 33 ms**
- ⇒ 差は **約 10〜20ms**。mp3 4 本が localhost から来るので、**4 秒どころか 50ms 未満**で終わる。
- ⭐ `durleak` 腕は `playVoice` が no-op なのに mp3 を **4 本要求している**
  ⇒ **要求元は `preloadVoiceClips` 単独**(= 事前読み込みは確かに走っている)。それでも 53ms。
  **率ではなく「触れているバイトが動いたか」で帰属を取った**形。
- ⇒ **(1d) の「≤ 500ms」は素でも `preloadleak` でも緑**になり、**変異を 1 つも捕まえられない**。
  ⭐ 代わりに **構造で測る**:「**1 文字目が出るまでに `assets/voice/` への要求が 0 件**」
  (`preloadleak` では 4 件出る)。または CDP `Network.emulateNetworkConditions` で帯域を絞る。
  ⛔ 秒数の閾値だけに頼らない。

**⭐ 素の腕の健全性(これが無いと「声が止まった」が後で自明に緑になる)**: 素の腕で
`assets/voice/` への要求 **5 件**(manifest + mp3 4 本)/ `getVoiceDuration` が manifest の値
(3.381 / 10.912 / 6.016 / 6.656)を返す / 語り総尺 **27,224ms ≒ 26,965ms**(声が主時計)
⇒ **着手前は確かに声が鳴っている。**

#### 成果物(項目1b 以降と起草窓が読む)

| パス | 中身 |
|---|---|
| `%TEMP%\df_pen73\population.tsv` | 母集団 **148 行**(段の内訳・s1 で当たった語・ポート・`--negative` 有無・`BASELINE` 依存・起動コマンド案・ポート衝突 20 組) |
| `%TEMP%\df_pen73\step1_arms.json` | 5 腕の生データ(DOM サンプル列・段落ごとの保持を含む) |
| `%TEMP%\df_pen73\build_population.py` | 母集団の導出器(⛔ 本数を定数で焼かない) |
| `%TEMP%\df_pptr\driver_pen73_step1.js` | 再現装置(使い捨て・⛔ `tools/` には置かない) |

#### ⇒ 判定

**§4-4(§2-2 の再現)と §4-5(§2-4 罠1 の再現)はどちらも成立。STEP2 へ進んでよい。**
⚠ ただし §8 の受入設計は次の 3 点を織り込むこと:

1. **事前読み込みの口は 3 箇所**(`index.html:39726` / `index.html:14870` / `tavern.html:9712`)。
2. **(1c) は全段落で測る**(第1段落だけだと `durleak` が **400ms** で緑を抜ける)。
3. **(1d) の秒数閾値は localhost では効かない** ⇒「1 文字目までに `assets/voice/` 要求 0 件」へ言い直す。
