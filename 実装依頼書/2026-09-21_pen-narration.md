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

---

### 12-0b. 着手前の全数走査(項目1b) — 2026-09-24 / 基準 `9a96cc0`(本番コードは `fd67cfe` と 1 バイト同一)

⛔ **本番コードも `tools/` も 1 バイトも触っていない。** `git diff --stat fd67cfe HEAD -- index.html tavern.html audio.js js tools` = **空**
(`9a96cc0` は項目1 の依頼書 `.md` 240 行追加のみ)。走査中も作業ツリーは clean。

#### (1) 走った腕の総数(⛔ 定数で焼かず `population.tsv` から導出)

| | 件数 | 導出 |
|---|---|---|
| 素の腕 | **148** | `population.tsv` の全行(ファイルの並び順のまま = 項目5 が同じ順で再走できる) |
| `--negative` の腕 | **3** | 下記の交点のうち `has_negative=yes` のもの |
| | **151 腕** | 導出器 = `arms73.py` / 台帳 = `%TEMP%\df_pen73\armlist73.json` |

`--negative` を足す交点は 2 つの規則の和で、**この場で本文から測り直した**(⛔ 項目1 の「4 本」を写していない):
① 依頼書 §8 の名指し `probe_party_size.js` ② `audio.js` の *ソース* を `readFileSync` する本
= `driver_bgm_mine` / `driver_bgm_title` / `driver_bgm_town` / `driver_dev_gate`(**再測でも 4 本**)。

- 足せた = **3 本** … `driver_bgm_title` / `driver_bgm_town` / `probe_party_size`
- ⚠ 足さなかった = **2 本** … `driver_bgm_mine` / `driver_dev_gate` は `--negative` フラグを持たない。
  **負のコントロールを素の腕に内蔵している**ため(`driver_bgm_mine` = `MUT_ORDER` を `PORT+1..+3` へ同時配信 /
  `driver_dev_gate` = `--baseline` の git worktree `df_devgate_baseline` @ `7bfa00b` を `/__baseline/` で同時配信)。
  ⇒ **素の腕が既に変異を検査しているので、付けないことで信号は 1 ビットも減っていない。**

#### (2) 所要時間と緑・赤の内訳

| | 実測 |
|---|---|
| 腕 | **151**(直列。⛔ 並列は禁止 = union 内に**ポート衝突 20 組**) |
| 所要 | **298.1 分 = 4.97 時間** / **1 腕あたり 118.5 秒** |
| 緑 / 赤 | **133 / 18**(赤 **11.9%**) |
| 判定行 合計 | **6,616** 行(PASS **6,563** / FAIL **33** / PENDING **4**) |
| assert id 合計 | **6,600** |
| 打ち切り | **1 腕**のみ = `probe_party_size`(素)を 600 秒で `taskkill /T /F`(#72 基準の 600.2 秒と同じ扱い) |
| 腕の後の居残り Chrome | **0 腕**(毎腕後に `df_*` プロファイルの chrome を実測して掃いた。1 件も出なかった) |

⭐ 依頼書 §8 の見積り「ほぼ全数・**6 時間前後**」に対し実測 **4.97 時間**。⚠ ただし
**総分でなく「腕数 × 腕あたり」で見積もること**(#72 の教訓)。最長 5 腕 =
`verify_bolt_aim` 2,239.3s / `driver_field_step6` 2,100.9s / `probe_p9_tour` 1,706.6s /
`auto_debug_run` 1,101.6s / `verify_hold_pair` 904.4s ⇒ **この 5 腕だけで全体の 45%**。

#### (3) 赤 18 腕の 3 分類 — **型1 = 0 / 型2 = 0 / 型3 = 18**

赤は **2 軸**で分類した(⛔ 「フレーク」の 1 語で片付けない)。
軸A = 3 走行での色の安定性 / 軸B = #55 の 3 型。各腕を **追加 2 回**再走した(`rerun73.py`・pass1/pass2 を別ディレクトリへ)。

- **型1(このチケットが構造的に殺す)= 0 本。** ⭐ 机上判断ではない: `tools/*.js` **150 本**を
  `getVoiceDuration|playVoiceClip|loadVoiceManifest|preloadVoice` で引いて **当たったのは `probe_party_size.js` の 1 本だけ**で、
  それも assert ではない(下の (5) 参照)⇒ **#73 が殺す assert は母集団に存在しない。**
- **型2(exit=3 / ポート由来の偽の赤)= 0 本。** ⚠⚠ **exit=3 を「ポート = 偽の赤」と読むのは誤り。**
  exit=3 の 4 腕はいずれも**本自身の早期終了**で、直列で 3 回とも同じ exit=3・**指紋も 3 回完全一致**。
  例 `driver_grid_p4` = 変異 `n1ringonly` の置換対象(地図行リテラル)が本文から消えて**負のコントロールが空振り**。
- **型3(真に無関係)= 18 本。** 全 18 本に赤の理由を 1 行で付けた(下表)。

| 腕 | exit 素/再1/再2 | 軸A | 指紋 | #72 基準 | 赤の理由(1 行) |
|---|---|---|---|---|---|
| `driver_field_step6` 素 | 1/1/1 | (赤,赤) | ⚠**不安定** 57/2→56/3→55/4 | 1 | `?graph=auto` が出口を自動選択せず entry から前進しない(bandits-forest / lizard-swamp) |
| `driver_field_verge_gap` 素 | 1/**0**/**0** | **フレーク** | ⚠不安定 38/2→39/0→39/0 | 0 | 負のコントロール (B3) の判定が揺れる(baseline 側 bbox x0=272 が穴矩形 x0=280 の外) |
| `driver_grid_p4` 素 | 3/3/3 | (赤,赤) | 一致 | 3 | 変異 `n1ringonly` の置換対象が本文から消え負のコントロールが空振り(**ポートではない**) |
| `driver_grid_p8` 素 | 1/1/1 | (赤,赤) | 一致 55/1 | 1 | 音声と無関係(#72 基準でも赤) |
| `driver_mapeditor` 素 | 1/1/1 | (赤,赤) | 一致 176/3 | 1 | 音声と無関係(#72 基準でも赤) |
| `driver_mapeditor_painting` 素 | 1/1/1 | (赤,赤) | 一致 105/1 | 1 | 音声と無関係(#72 基準でも赤) |
| `driver_monsters_griffon` 素 | 1/1/**0** | **フレーク** | ⚠不安定 14/3→15/2→17/0 | 0 | #72 が非決定と実証済みの本(単独 5 走行 17/14/14/17/17) |
| `driver_monsters_umberhulk` 素 | 1/1/1 | (赤,赤) | 一致 21/1 | 1 | 音声と無関係(#72 基準でも赤) |
| `driver_sce1_events` 素 | 1/1/1 | (赤,赤) | 一致 211/3 | 1 | 音声と無関係(#72 基準でも赤) |
| `driver_speech_engine` 素 | 1/**0**/1 | **フレーク** | ⚠不安定 16/1→17/0→16/1 | 0 | (4) カメラが動かない(camX レンジ **0.0px**・`follow=000000`)= **台詞ではなくカメラ追従の非決定** |
| `driver_speech_v2` 素 | 1/1/1 | (赤,赤) | 一致 45/1 | 1 | 音声と無関係(#72 基準でも赤) |
| `probe_bandit_map` 素 | 3/3/3 | (赤,赤) | 一致 | 3 | 本自身の早期終了(**ポートではない**) |
| `probe_party_size` 素 | 1/1/1 | (赤,赤) | 一致 13/7 | 1 | 自力で終わらない本。600 秒で打ち切り。判定は `--negative` 側だけが行う |
| `probe_s2_fold` 素 | 3/3/3 | (赤,赤) | 一致 | 3 | 本自身の早期終了(**ポートではない**) |
| `probe_swamp_map` 素 | 3/3/3 | (赤,赤) | 一致 | 3 | 本自身の早期終了(**ポートではない**) |
| `sweep_recruit_balance` 素 | 1/1/1 | (赤,赤) | 一致 | 1 | 装置 assert が崩れた走行が 4/4 件(#72 基準でも同じ総括行) |
| `verify_walk_block` 素 | 1/1/1 | (赤,赤) | 一致 22/1 | 1 | 音声と無関係(#72 基準でも赤) |
| `probe_party_size` `--negative` | 1/1/1 | (赤,赤) | 一致 15/7 | — | 15/22。7 NG すべて**ワールドマップ挿入で導線が腐った**ことに由来(現在地 = `world.html` / 以降どのシナリオも 計1人) |

軸A 集計: **(赤,赤) 15 / (緑,緑) 1 / 混在 2**。

#### (4) フレーク(色が動いた本)= **3 本** / 指紋が動いた本 = **4 本**

- **色が動いた 3 本** = `driver_field_verge_gap`(素の赤が外れ値)/ `driver_monsters_griffon` / `driver_speech_engine`。
- ⭐⭐ **色が動かないのに指紋が動く本が 1 本ある** = `driver_field_step6`(exit は 3 回とも 1 のまま、FAIL が **2→3→4** と単調に増える)。
  ⇒ **exit code だけ見ていると「安定した赤」に見えるが、指紋を golden にすると項目5 で必ず偽の差が出る。**
  ⛔ 項目5 はこの 4 本の指紋を非退行の根拠に使わないこと(exit code で見る)。
- ⭐⭐ さらに **#72 基準では赤だったのにここでは緑になった本が 3 本** =
  `driver_monsters_hobgoblin`(14/14)/ `driver_monsters_kobold`(12/12)/ `probe_n4_stall`。
  ⇒ **非決定な本は「基準の色」という単一の値を持たない**(#72 の教訓の再確認)。
  本走査で非決定と実証できた本は合計 **7 本**(上の 4 + この 3)。⚠ #72 が数えた既知フレーク **9 本**とは集合が違う
  = **フレークの一覧そのものが要約であり、走行ごとに引き直すべきもの**。

#### (5) ⚠⚠⚠ 崩れた主張 — §8 が名指した golden は**声を測っていない**

依頼書 §8「既存 golden の非退行」は `tools/probe_party_size.js`(素 / `--negative`)を
「声に依存する唯一の golden」として名指しているが、**実測で 2 つとも崩れた**。

1. ⭐⭐⭐ **この本は声を *測って* いない。声を *無効化* している。**
   `tools/probe_party_size.js:868`(`PLAY_PREP`)は
   `window.GameAudio.getVoiceDuration = function () { return 0; };` で**声の尺を 0 に潰し**、
   導入ナレをテキストペースへ落として連打で送るためのものである(同 `:651` のコメントが明言)。
   結果を入れる `o.voicePatched` は **どの assert からも参照されていない**(出現は `:864` と `:868` の 2 箇所だけ)。
   ⇒ **§5-2 で `loadVoiceManifest` を止めると `getVoiceDuration` は元から 0 を返すので、この差し替えは no-op になる。
   本は今までどおり動き、#73 の変化を 1 ビットも検出しない。**
2. ⭐⭐⭐ **`tools/*.js` 150 本のうち、声の API に触る本はこの 1 本だけ**
   (`grep -lE "getVoiceDuration|playVoiceClip|loadVoiceManifest|preloadVoice" tools/*.js` → 1 件)。
   ⇒ **#73 の変化を捕まえられる既存 golden は 1 本も存在しない。声の信号は新規 `tools/verify_pen_narration.js` が
   全部背負う。** 項目5 は既存 golden の緑を「声が正しい」の根拠にしてはならない(**原理的に永久緑**)。
3. **両腕が着手前から赤**(素 = 600 秒で打ち切り / `--negative` = 15/22)。
   `--negative` の 7 NG は 3 走行とも**完全に同一**(P15/F7・指紋一致)= **決定的な既存の腐り**で、
   真因は**ワールドマップの挿入**((1e) の観測値が `現在地 = http://localhost:9345/world.html`。
   以降 (2b)(2z1)(2z2)(2z3)(2z4)(4d) がすべて「計1人」= 編成に到達していない)。
   ⇒ 項目5 はこの赤を #73 の退行と読んではならない。⚠ 逆に**緑になったら**それは #73 とは無関係の別の変化。

#### (6) ⚠⚠ 崩れた主張 — `emptycredit` は VOICEVOX クレジット行の変異では**ない**

§12-0 (4) は «`driver_bgm_town.js` は `emptycredit` = **VOICEVOX クレジット行(`audio.js:885`)を空にする変異**を持つ
⇒ §5-6 の「クレジット行は残す」は、この変異アンカーの生存条件でもある» と書いているが、**両方とも違う**。

- 実体(`tools/driver_bgm_town.js:97-99`)は **`BGM_FILES.mine_depths` の行**の `credit: "魔王魂"` を `""` にする変異で、
  赤くなるのは (4a)「全 9 件の credit が空文字でない」。実走の観測値も
  `dungeon_normal="魔王魂" … pharaxus_stage="ユーフルカ" … mine_depths=""` = **BGM のトラック別クレジット**であって、
  `audio.js:885` の `cred.textContent`(ナレーション音声の VOICEVOX 表記)ではない。
- `audio.js:885` を**アンカーに使っている本は 1 本も無い**。§5-6 / §11 の「クレジット行を残す」は
  **配布物としての要件**であって、変異アンカーの生存条件ではない。

⇒ **§5 が本当に腐らせうる `audio.js` の逐語は次の 2 種類だけ**(4 本すべて実走で緑・アンカー生存を確認済み):

| 本 | 素 / `--negative` | `audio.js` のアンカー | §5 との距離 |
|---|---|---|---|
| `driver_bgm_mine` | 37/37 緑 | `BGM_FILES.mine_depths` の行(`badsrc`) | 遠い |
| `driver_bgm_title` | 16/16 緑 / 14/14 緑 | `BGM_FILES.title` の行(`badsrc` / `shadow` の 2 変異が共有) | 遠い |
| `driver_bgm_town` | 17/17 緑 / 15/15 緑 | `BGM_FILES` の `town` / `mine_depths` / `tavern_room` の **3 行**(`badsrc` / `emptycredit` / `shadow`) | 遠い |
| `driver_dev_gate` | 52/52 緑 | 正規表現 `/function closeSettings\(\)\s*\{[\s\S]{0,300}_settingsCleanup\[i\]\(\)/`(`:312`) | ⚠ **近い** |

- ⭐ **`BGM_FILES` の 5 行は空白まで逐語**で参照されている ⇒ §5 でこの表を**整形し直すと 4 本の変異が同時に腐る**。触らないこと。
- ⭐⭐ `driver_dev_gate` の唯一の `audio.js` assert は **300 文字の窓**。実測の内訳 = **現在 123 文字使用 / 余裕 177 文字**。
  ⚠ §5-5(つまみの名前)の編集点は `audio.js:835`(`ボイス音量` / `setVoiceVolume`)で、
  窓が張るのは `closeSettings`(`:809`)〜`_settingsCleanup[i]()`(`:811-812`)⇒ **編集点は窓の外**。
  ⛔ ただし `closeSettings` の**中**に行を足す設計に変えると、余裕 177 文字を食って (`:312`) が黙って赤くなる。

#### (7) 2 経路の指紋の作り方(⭐ 項目5 が同じ形で再現するための定義)

抽出器 = `fp73.py` = **#72 の `item1/fp72e.py` の逐語コピー**(sha256 `818535166700358c…` で同一性を確認済。
#70/#71/#72 で実証済みのものを作り直さない)。1 腕の標準出力から:

- **経路① assert id の指紋** = 各 assert の `(識別子, 合否)` を **並び順のまま**列にし、
  `id\t合否` を `\n` で連結 → sha256 の先頭 16 桁。列の長さは `route1_n`。
  id の採り方 = 括弧つき `(0a)` / 節見出しつき `§0 0a` / 裸トークン。⛔ **裸の数字だけは id と読まない**
  (総括行 `PASS 30 / FAIL 0` が判定行に混ざるのを防ぐ = #67 の教訓)。
- **経路② 判定行の多重集合** = `(status, 正規化本文) → 件数` の Counter を key でソートして連結 → sha256 先頭 16 桁。
  正規化 = ` — ` 以降と 3 連空白以降を落とし、空白を 1 つに畳み、**数字を全部 `#` へ**(観測値の揺れを吸う)。
  **順序ゆらぎに強い**のがこちらの役目。件数は `route2_n`。
- 実体は 1 腕 1 ファイル: 標準出力 = `%TEMP%\df_pen73\baseline\<arm_id>.txt` /
  指紋の全量(id 列 + 多重集合)= `%TEMP%\df_pen73\fp\<arm_id>.json`。
  ⇒ 項目5 は**ハッシュの不一致で気づき、JSON の差分で構造差と値差へ分類**する。
- ⚠⚠ **総括行の書式は 3〜5 種類ある**ので、合否は **exit code を主**・判定行を従にした
  (`summary_line` 列は人が読むためだけのもの。`PASSED` で grep すると母集団の記録が痩せる = #56 の教訓)。
- ⚠⚠⚠ **指紋が効かない腕が 16 腕ある**(判定行 0 行 ⇒ 経路①②とも空文字の sha `e3b0c44298fc1c14`):
  `_doors_fixture` / `_golden` / `_pptr_profile`(モジュールなので直接起動しても何も出ない)/
  `auto_debug_run` / `probe_n4_stall` / `probe_p9_tour` / `probe_paint_overlay` / `probe_rest_premature` /
  `probe_s4_relocate` / `probe_town_mask` / `sim_plaza_entry` / `sweep_recruit_balance` /
  `driver_grid_p4` / `probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map`。
  ⇒ **この 16 腕は exit code だけが比較材料**。⭐ 151 腕中 **136 個**しか異なる指紋が無いのはこのため
  (16 腕が同じ空ハッシュを共有 ⇒ 151 − 16 + 1 = 136)。

#### (8) 凍結 TSV のパスと列の意味

**`%TEMP%\df_pen73\baseline_frozen.tsv`**(151 行 + ヘッダ・LF・UTF-8)。1 腕 = 1 行を**走り終えるたび追記**しており、
再起動時は済んだ腕を SKIP する(⇒ 中断で失うのは最大 1 腕)。

| 列 | 意味 |
|---|---|
| `arm_id` | `<本の名前>_base` / `<本の名前>_negative`(⭐ 項目5 の突き合わせキー) |
| `book` / `arg` | `tools/<book>` と引数(空 / `--negative`) |
| `exit_code` | **合否の主**。0 = 緑 |
| `pass_count` / `fail_count` / `pending_count` | 判定行の status 別件数(**従**) |
| `duration_sec` | 秒。項目5 の見積りに使う |
| `route1_n` / `route1_fingerprint` | 経路① = assert id の並びの長さと sha256 先頭 16 桁 |
| `route2_n` / `route2_fingerprint` | 経路② = 判定行の多重集合の件数と sha256 先頭 16 桁 |
| `summary_line` | 総括行(5 書式を拾い、取れなければ最後の非空行)。**人が読むためだけ** |
| `strays_killed` | その腕の後に掃いた居残り Chrome の数(全 151 腕で **0**) |
| `killed` | `taskkill@<秒>s` = 打ち切った腕(`probe_party_size_base` のみ) |
| `started_at` | ISO-8601 ローカル |
| `stdout_path` / `fp_json` | 標準出力の実体 / 指紋の全量 JSON |

#### (9) 成果物

| パス | 中身 |
|---|---|
| `%TEMP%\df_pen73\baseline_frozen.tsv` | **凍結 TSV 151 行**(項目5 が読む正) |
| `%TEMP%\df_pen73\baseline\<arm_id>.txt` | 全 151 腕の標準出力の実体 |
| `%TEMP%\df_pen73\fp\<arm_id>.json` | 全 151 腕の 2 経路の指紋の全量 |
| `%TEMP%\df_pen73\armlist73.json` | 腕 151 の導出結果(`--negative` を足した / 足さなかった理由つき) |
| `%TEMP%\df_pen73\rerun\rerun_pass{1,2}.tsv` + `pass{1,2}/` + `pass{1,2}_fp/` | 赤 18 腕の追加 2 回の再走 |
| `%TEMP%\df_pen73\classify73.json` | 赤の 2 軸分類・フレーク一覧・指紋が動いた本 |
| `scratchpad\item1b\{arms73,sweep73,rerun73,classify73,fp73}.py` | 導出器 / 走行器 / 再走器 / 分類器 / 指紋抽出器 |

#### ⇒ 判定

**着手前の色は凍結できた(151 腕 / 298.1 分 / 緑 133・赤 18、赤はすべて型3)。STEP2 へ進んでよい。**
⚠ 項目5 へ申し送る 3 点:

1. **既存 golden は #73 の声の変化を 1 本も検出しない**((5))⇒ 緑を「声が正しい」の根拠にしない。声は新規受入が全部背負う。
2. **指紋を非退行の根拠に使えない腕が 20 腕ある** = 判定行 0 行の **16 腕** + 指紋が走行ごとに動く **4 腕**
   (`driver_field_step6` / `driver_field_verge_gap` / `driver_monsters_griffon` / `driver_speech_engine`)。
3. **`audio.js` の逐語アンカーは `BGM_FILES` の 5 行と `closeSettings` の 300 文字窓(余裕 177 文字)だけ**((6))。
   この 2 つを避ければ既存の変異は 1 つも腐らない。

### 12-3. STEP3 既存 golden(項目3) — 2026-09-25 / 基準 `2f31ce6`(実装 = `d80ca9b` + `2f31ce6`)

⭐ **言い直した本数 = 0 本**(assert の書き換え 0 件)。見込み(§6)どおり。**実装で赤くなった既存 golden は 0 本**。
⛔ `tools/` も本番も 1 バイトも触っていない(本節の依頼書 `.md` だけ)。実装の差分は
`git diff --stat fd67cfe 2f31ce6 -- index.html tavern.html audio.js js tools` = **`audio.js` 31 行 + `tavern.html` 2 行(changelog の `<li>` 1 本の入れ替え)だけ**。

#### (1) 対象の導出(⛔ 定数で焼かず、この場で `tools/*.js` を引き直した)

| 段 | 規則 | 件数 | 本 |
|---|---|---|---|
| 1 | 触る語 `narration\|playVoice\|getVoiceDuration\|preloadVoice\|loadVoiceManifest\|__renderSfxOffline\|openSettings\|voiceManifest\|語りに耳\|ボイス音量\|setVoiceVolume\|typeNarrationParagraph\|changelogList` | **5** | `driver_bgm_town` / `driver_dev_gate` / `driver_diag_watchdog` / `probe_n4_stall` / `probe_party_size` |
| 2 | `audio.js` の**ソースを `readFileSync` する本** | **6** | `driver_bgm_mine` / `driver_bgm_title` / `driver_bgm_town` / `driver_dev_gate` + ⚠ **`verify_mercenary_roster`**(配信スナップショット `FROZEN` へ読む)/ **`verify_eol_doorfix`**(行末のバイト検査) |
| 2' | `audio.js` を名指すが読まない本(`git diff` / コメント / 実行時の `GameAudio`) | 3 | `probe_s2_clear` / `verify_title_screen` / `verify_world_map` |
| 3 | changelog を逐語で握る本(`changelog\|更新情報\|<li><b>`) | **0** | 当たり 10 本はすべて**コメント**(「changelog ガードに掛かるので本番へシームを置かない」の類)。変異アンカーではない |
| 3' | 段3 の当たりのうち `tavern.html` を HEAD と突き合わせる本 | 1 | `driver_cleric_sprites`(N6 は cleric ポートレート行だけを見る) |
| 4 | **語りの UI を実行時に通る本** `prologueOverlay\|dmNarration\|voice` | 24(新規 **20**) | `driver_action_priority` / `driver_depart_menu_clean` / `driver_equip_compact_ios` / `driver_party_view_reopen` / `verify_darkvision` / `verify_member_identity` / `verify_npc_crowd` / `verify_party_match_setup` / `verify_party_promises` / `verify_player_sheet` / `verify_pm_drawer_fit` / `verify_prep_retire` / `verify_quest_visibility` / `verify_quest_walk` / `verify_recruit_size` / `verify_recruit_talk` / `verify_save_slots` / `verify_spell_off` / `verify_tavern_map` / `verify_town_map` |
| | **和集合** | **33 本** | 全 33 本が `population.tsv`(148 本)に在ることを確認 |

- ⚠⚠ **崩れた主張 = §12-0b の「`audio.js` のソースを読む本は 4 本」**。`readFileSync` の引数が**変数**(`['index.html', …, 'audio.js'].forEach`)の本と、
  **バイト**で読む本(`rawRead`)が落ちていた ⇒ **実測 6 本**(+ `verify_mercenary_roster` / `verify_eol_doorfix`)。
  どちらも実装後に緑・指紋一致なので実害は無いが、**項目5 は 4 本と写さないこと**。
- ⭐ 段4 はタスクの 3 段に**足した**段。声を止めると受注ナレ(`#prologueOverlay`)が**音声ペース → テキストペース**へ落ちるので、
  連打で送る本の**タイミングが動く**。ここが「語りに触れる本」の実体(下の (3) で所要が実際に半減した)。

腕の数: 素 **33** + `--negative` **7** = **40 腕**。
`--negative` は「フラグを持つ本 ∩ 段1〜2'」の 7 本 = 凍結あり 3(`driver_bgm_title` / `driver_bgm_town` / `probe_party_size`)
+ 凍結なし 4(`verify_mercenary_roster` / `verify_eol_doorfix` / `probe_s2_clear` / `verify_world_map`)。
- ⚠ 段4 の 20 本の `--negative` は走らせていない。理由は**構造で閉じている**:
  実装が消した/書き換えた逐語(`audio.js` の `freq: 880` の旧レシピ・`isUi ? buses.ui : buses.sfx`・`ボイス音量`・`setVoiceVolume` /
  `tavern.html` から落ちた changelog 行「稲妻を撃てる場面」・足した行「語りがペンの音」)を `tools/*.js` 全本で引いて **0 件** ⇒
  **実装の差分に乗っている変異アンカーは 1 本も無い**。実行時の挙動(タイミング)は素の腕が見ている。項目5 の全数で素と同じ順に回る。

#### (2) 着手前(`baseline_frozen.tsv`)→ 実装後(`2f31ce6`)

直列 1 腕ずつ・毎腕後に `df_*` の居残り Chrome を掃除(全腕 **0**)。指紋は `fp73.py`(項目1b と同じ抽出器・`sweep73.run_one` を再利用)。

| 腕 | 着手前 exit/P/F | 実装後 exit/P/F | 色 | 経路① | 経路② | 秒 |
|---|---|---|---|---|---|---|
| `driver_bgm_town` 素 | 0/17/0 | 0/17/0 | 同 | 一致 | 一致 | 3 |
| `driver_bgm_town` `--negative` | 0/15/0 | 0/15/0 | 同 | 一致 | 一致 | 10 |
| `driver_dev_gate` 素 | 0/52/0 | 0/52/0 | 同 | 一致 | 一致 | 26 |
| `probe_party_size` 素 | 1/13/7 | 1/13/7 | 同(赤のまま) | 一致 | 一致 | 600(打ち切り) |
| `probe_party_size` `--negative` | 1/15/7 | 1/15/7 | 同(赤のまま) | 一致 | 一致 | 5 |
| `driver_bgm_mine` 素 | 0/37/0 | 0/37/0 | 同 | 一致 | 一致 | 12 |
| `driver_bgm_title` 素 | 0/16/0 | 0/16/0 | 同 | 一致 | 一致 | 3 |
| `driver_bgm_title` `--negative` | 0/14/0 | 0/14/0 | 同 | 一致 | 一致 | 13 |
| `verify_mercenary_roster` 素 | 0/44/0 | 0/44/0 | 同 | 一致 | 一致 | 19 |
| `verify_eol_doorfix` 素 | 0/27/0 | 0/27/0 | 同 | 一致 | 一致 | 6 |
| `probe_s2_clear` 素 | 0/4/0 | 0/4/0 | 同 | 一致 | 一致 | 103 |
| `verify_title_screen` 素 | 0/86/0 | 0/86/0 | 同 | 一致 | 一致 | 66 |
| `verify_world_map` 素 | 0/57/0 | 0/57/0 | 同 | 一致 | 一致 | 73 |
| `driver_cleric_sprites` 素 | 0/85/0 | 0/85/0 | 同 | 一致 | 一致 | 2 |
| `probe_n4_stall` 素 | 0/—/— | **1**/—/— | ⚠**動いた** | (判定行 0) | (判定行 0) | 144 |
| `driver_diag_watchdog` 素 | 0/34/0 | 0/34/0 | 同 | 一致 | 一致 | 696 |
| 段4 の 20 本 素 | 全 0 / 計 P935 | 全 0 / 計 P935 | 20/20 同 | **20/20 一致** | **20/20 一致** | 計 941 |
| `verify_mercenary_roster` `--negative` | (凍結なし) | 0 / P424 F16 | 緑 | — | — | 188 |
| `verify_eol_doorfix` `--negative` | (凍結なし) | 0 / P9 | 緑 | — | — | 43 |
| `verify_world_map` `--negative` | (凍結なし) | 0 / P44 | 緑 | — | — | 88 |
| `probe_s2_clear` `--negative` | (凍結なし) | **1** | 赤 | — | — | 81 |

⇒ 凍結と比べられる **36 腕**: 色が同じ **35** / 動いた **1**(`probe_n4_stall`)。指紋を持つ 34 腕は**経路①②とも 34/34 一致**。
`verify_mercenary_roster --negative` の F16 は変異が期待どおり赤くした判定行(exit 0 = 全変異が発火)。

#### (3) 色が動いた/凍結の無い赤 — 再走 + 影のツリーで切り分け(⛔ 「フレーク」で片付ける前に測った)

影のツリー = `git worktree add --detach %TEMP%\df_pen73\shadow_fd67cfe fd67cfe`(作業ツリー clean・`index.html` と当該 `tools/*.js` は現 HEAD と sha1 一致・
`audio.js` / `tavern.html` だけが着手前の姿)。使い終えて `git worktree remove` 済。

| 腕 | 実装後(HEAD)3 走行 | 着手前(影 `fd67cfe`)| 凍結 / #72 基準 | 判定 |
|---|---|---|---|---|
| `probe_n4_stall` 素 | exit **1 / 0 / 0** | exit **1 / 1 / 1** | 0 / 1 | **両ツリーで揺れる = 非決定**(本は「停滞を捉えたら exit 0」の調査プローブで受入を持たない・`?autoplay` で声の経路を通らない)。§12-0b (4) の既知の非決定 7 本の 1 本。**#73 の退行ではない** |
| `probe_s2_clear` `--negative` | exit **1 / 1 / 1** | exit **1 / 1 / 1** | 凍結なし | **両ツリーで同一に赤 = 着手前からの腐り**。6 変異中 5 本は発火、⛔ `wipeblind` だけ 6 走行すべて「赤くなった節: なし」(決着 = defeat)。**#73 の退行ではない** |

- ⭐ `wipeblind` の空振りの形(本チケットの範囲外・直さない): 目隠しは「仲間の生存数を常に 0」と報告させるが、
  (2a) は ±1 の許容・(2b) は「死んだ瞬間に仲間が生きていた」ときしか矛盾を作れない ⇒ **全滅で終わる走行では検査力 0**。
  今の砦/森の難度では敗北が全滅で終わるので 6/6 空振り。⇒ 別チケット候補(変異を「敗北時に仲間が生存している走行」へ当てる設計へ)。

#### (4) ⭐ 実装で実際に動いたもの = 所要時間(語りが音声ペースでなくなった)

段4 の 20 本は assert も指紋も 1 つも動かず、**所要だけが 1,772.5 秒 → 941.2 秒(−47%)**。
例 `verify_party_promises` 249→40 秒 / `verify_party_match_setup` 100→43 秒 / `verify_quest_walk` 212→98 秒 / `verify_prep_retire` 147→60 秒。
= 受注ナレが VOICEVOX の尺でなくテキストペースで送れるようになった(§2-3 の「声なしの経路」へ落ちた)ことの**副次的な実測**。
⚠ 項目5 の見積りは §12-0b の 1 腕 118.5 秒より**短くなる**(段4 だけで約 14 分縮む)。

#### ⇒ 判定

**言い直し 0 本。対象 33 本 40 腕(+ 切り分けの再走 10 腕)で、実装が赤くした既存 golden は 0 本。** 項目4(新規受入)へ進んでよい。
所要 = 本走 3,122.9 秒 + 再走 947.5 秒 = **約 68 分**。成果物 = `%TEMP%\df_pen73\item3\{run1,run2,rr_head{1,2},rr_shadow{1,2,3}}\`(`after.tsv` + 標準出力 + 指紋 JSON)/
走行器 `scratchpad\item3\run3.py`・比較器 `cmp3.py`。

### 12-4. 受入(項目4) — 2026-09-25 / 基準 `1df0eca`(実装 = `d80ca9b` + `2f31ce6`)

新規 **`tools/verify_pen_narration.js`**(base **10441** / 変異 **10442〜10450**)。⛔ 本番 3 ファイルは 1 バイトも触っていない
(変異は内蔵 http サーバの**配信スナップショット**だけを書き換える)。書式は `tools/verify_member_identity.js` に揃えた
(`--negative` / `--mutate <key>` / `--only` / `--units`・exit 0 = 期待どおり / 1 = FAIL・空振り / 2 = 環境・例外 / 3 = 変異アンカーの腐敗)。

#### (1) assert 一覧 = **19 本**(素で全部出る)

| id | ユニット | 何を見るか |
|---|---|---|
| (0a) | NARR | off の腕で manifest.json が読まれ、導出 id で `getVoiceDuration > 0`・`document.title`・開始の関門 |
| (0b) | META | 声 id を `assets/voice/manifest.json` から導出(導入 `dungeon_intro_goblin-mine_*` 4 / 前口上 `dungeon_intro_prologue_*` 7 / 依頼人 `quest_dialog_goblin-mine_*` 2) |
| (0c) | META | **配信された** `sfx-manifest.json` に `narration` が無い(罠5) |
| (0d) | META | 配信された `audio.js` に逐語 `get("penvoice")` が 1 箇所(参考: 語 `penvoice` は 2) |
| (0e) | META | 変異 9 本の注入点が原本でちょうど 1 箇所 |
| (0f) | 全部 | 開いたページが全部起動・pageerror 0 |
| (1a) | NARR | **声の mp3** の要求: 素 0 件 / off は導入・前口上・依頼人の**それぞれ**で 1 件以上 |
| (1a') | NARR | **manifest.json** の要求(mp3 と分けて数える): 素 0 件(`loadVoiceManifest` の呼び口は通った上で)/ off 1 件以上 |
| (1b) | NARR | 導出 13 id で `getVoiceDuration === 0`(素)/ `> 0`(off) |
| (1c) | NARR | 罠1: **全段落**のヒント文字列(主)+ 保持秒数(従)+ 段落数 = id 数 / off は全段落が「♪」 |
| (1d) | NARR | 罠2: 1 文字目が出た時点の mp3 要求 0 件(事前読み込みの口に全 id で到達した上で)/ off は 1 件以上 |
| (2a) | WAVE | 波形: 素 200 種すべて ZCR > 0.08 かつ山 3 / off 5 種 ZCR 0.0399±0.004 かつ山 1 |
| (2b) | PARTS | `playSfx("narration")` 1 回: 素 BufferSource 3・Osc 0 / off Osc 1・BS 0(index / tavern の実ページ) |
| (2c) | PARTS | 出口: 素 voice ×3 / off ui。button = ui / hit = sfx は不変・バスの名前付けの配線確認つき |
| (3a) | PARTS | モーダル: 素「語り 音量」のみ / off「ボイス音量」のみ(index / tavern の実ページ) |
| (3b) | PARTS | そのつまみで `GameSettings.voice` 0.95 → 0.37・他の音量は不変(両腕) |
| (4a) | WAVE | off の narration = `0e8370d` 版と**差 0**(2 種)・無音でない・旧版の素も同じ / 対照: 素は旧版と異なる |
| (4b) | WAVE | narration 以外 28 レシピ × 両腕 × 2 種 = 112 比較が ≤ 1e-6 + 自己比較 112 件も ≤ 1e-6 |
| (5a) | NARR + PARTS (+ WAVE) | 上の各節の**従来側**(off)の期待 10 項目が全部成り立つ |

#### (2) 素 3 回 — **3 回とも 19/19 exit 0・指紋一致**

| 走行 | 結果 | 所要 | 導入 素 保持 ms | 前口上 素 保持 ms | 依頼人 素 保持 ms |
|---|---|---|---|---|---|
| 1 | 19/19 | 170.5 秒 | 180 / 240 / 240 | 2600 ×6 | 240 |
| 2 | 19/19 | 170.1 秒 | 239 / 301 / 239 | 2600 ×6 | 242 |
| 3 | 19/19 | 170.4 秒 | 180 / 241 / 240 | 2594〜2601 | 240 |

- 指紋(`(id, 合否)` を並び順のまま連結した sha256 先頭 16 桁)= **`af96064e3d1322a9` が 3 回とも同一**。
- 所要の内訳: 前口上(素)47 秒 + 前口上(off・声ペース)62 秒 + 依頼人(off)21 秒 + 導入(off)27 秒 が大半。PARTS 4 秒 / WAVE 2 秒。
- ⭐ 素の 1 文字目 = 14〜23ms(mp3 0 件)/ off = 33〜64ms(導入 mp3 4 件・前口上 7 件)⇒ 秒数の差は 20〜40ms しか無い(下の言い直し 2)。

#### (3) `--negative`(1 回・**9/9 検出・空振り 0・exit 0・912.2 秒**)— 依頼書の期待 → 実測の担当

⚠ 担当は机上で決めず、`--mutate <key>` で **全ユニット**を 1 本ずつ実走して決めた(`--negative` は変異ごとに必要なユニットだけ走らせる)。

| 変異 | 注入点(`1df0eca` の逐語) | 依頼書 §8 の期待 | 実測の担当(`--negative`) | 緑のままであるべき(番人) |
|---|---|---|---|---|
| `manifestleak` | `audio.js:546` 関門 | (1a)(1b) | **(1a)(1a')(1b)(1c)(1d)** | — |
| `durleak` ⭐ | `:546` + `:579` + `:599` | **(1c) だけ** | **(1a')(1b)(1c)** | **(1a)** ✓ 緑のまま |
| `preloadleak` | `:546` + `:579` + `:623` | (1a)(1d) | **(1a)(1a')(1d)** | **(1b)(1c)** ✓ 緑のまま |
| `blipback` | `:253` | (2a)(2b) | **(2a)(2b)(2c)(4a)** | — |
| `uiroute` | `:743` | (2c) | **(2c)** | — |
| `sliderdead` | `:860` | (3a) | **(3a)** | — |
| `oldchanged` | `:254` | (4a) | **(4a)** | — |
| `sampledpen` | `sfx-manifest.json`(配信上で `ui_tap` を写す) | (0c) | **(0c)(2b)(2c)** | — |
| `switchdead` | `:19` | (5a) | **(0a)(1a)(1a')(1b)(1c)(1d)(2a)(2b)(2c)(3a)(4a)(5a)** | — |

表と食い違った担当の理由(全部実測):

- ⭐⭐ **`durleak` は「(1c) だけ」ではなく (1a')(1b)(1c)**。`getVoiceDuration` を生かすので **(1b) は必ず赤**
  (素の 13 id が manifest の尺をそのまま返す)。(1a') は関門を外したので manifest.json を読むから赤。
  ⭐ **守るべき本質は成立**: **(1a) = mp3 の要求は 0 件のまま緑**(`NEG_GREEN` で番人にした = 赤くなったら変異の作りが間違い)。
  ⇒ 担当は「声の再生」側でなく「尺」側に絞られている。実害の姿も再現: 素の腕が全段落「♪」・クリックしても保持
  3241 / 10662 / 5921ms(導入)・4000ms(依頼人)で 250ms 毎 104 クリックが効かない。
- `preloadleak` は (1b)(1c) が緑のまま(`getVoiceDuration` が 0 ⇒ テキストペースへ落ちる)= 担当が罠2 に絞られている。これも番人にした。
- `manifestleak` は関門を外すと声が丸ごと戻るので §1 の 5 本すべて。
- `blipback` の (2c) = 正弦は画が 1 つなので出口が `["voice"]` の 1 本(3 本でない)。(4a) = 対照「素の narration は旧版と異なる」が崩れる(差 0)。
- ⭐ `sampledpen` の (2b)(2c) = **実ページは `sfx-manifest.json` を先読みするので、足した録音素材が実際に鳴る**
  (素も off も BufferSource 1・出口 ui)。番人 (0c) だけでなく**挙動でも赤**になる = 罠5 は本物。
  (全ユニットで回すと off の腕も録音素材になるので (5a) も赤。`--negative` は PARTS だけなので担当には入れていない。)
- `switchdead` は off の腕を持つ assert が総崩れ。(3b) だけ緑 = 名前が変わってもつまみ自体は両腕で生きている。

#### (4) 依頼書 §8 から言い直した点と根拠の数値

1. **(1c) は全段落・文字列が主** — 第1段落だけだと `durleak` の保持が **400ms** で緑を抜ける(§12-0 (5-2))。
   「クリックで 1 秒以内」は**クリック送りの口がある語り**(`index.html` の導入 + `tavern.html` の依頼人 `playQuestAcceptNarration`)にだけ当てた。
   ⚠ **酒場の前口上(`initTavernPrologue`)には元からクリック送りの口が無い**(関門の `begin` を外した後は 2.5 秒の自動送りだけ)
   ⇒ 前口上は「保持 2000〜3200ms = テキストペースの固定間隔」で見る(実測 2594〜2601ms)。
2. **(1d) は秒数で測らない** — localhost では事前読み込み有り 43ms / 無し 34ms(§12-0)、本受入でも off 33〜64ms / 素 14〜23ms で
   「≤ 500ms」は**永久緑**。⇒ **「1 文字目が出た時点の mp3 要求 0 件」**(構造)+「事前読み込みの口に全 id で到達した」
   (`GameAudio.preloadVoice` の呼び口を包んで記録)で測る。`preloadleak` で 4 件 / 7 件になり赤。
3. **事前読み込みの口は 3 つだが検出力があるのは 2 つ** — `index.html:39726`(導入)/ `tavern.html:9712`(前口上)。
   `index.html:14870`(エピローグ)は manifest に `ending_epilogue_*` が **0 件**(未録音)なので `?penvoice=0` でも mp3 を取りに行かない
   (項目2a で実測)⇒ 受入の対象から外した。
4. **(1a) は mp3 と manifest を分けて数える** — `assets/voice/` 配下には `manifest.json` 自身もある。
   mp3 = (1a) / manifest = **(1a')**(新設)。`durleak` は manifest を読むが mp3 は取りに行かない ⇒ (1a) 緑・(1a') 赤で分離できた。
5. **`durleak` の担当は表と食い違う** — 上の (3) のとおり (1a')(1b)(1c)。本質(mp3 0 = (1a) 緑)は番人で固定。
6. **(2a) の閾値** — ZCR > **0.08**(項目2b 実測 素 0.158〜0.198 / 200 種・off 0.03986 = 理論 0.0399 ⇒ 余裕約 2 倍)。
   本受入の 3 走行も素 **0.1582〜0.1984**・off **0.03986** で同値。山の数え方 = 5ms 窓 RMS 包絡を両端 0 で挟み、極大が emax の 25% 超を候補、
   隣との谷が「低い方の山の 50%」を超えたら併合(プロミネンス)⇒ **200/200 で 3**。⛔ ヒステリシス(25%/8%)は 200 種中 6 種で 2 と数える(項目2b)ので不採用。
   種は mulberry32 の **1〜200**(素)/ **1〜5**(off)。
7. **(4a) は厳密一致** — off の narration vs `0e8370d` 版 = **差 0**(種 7 / 12345)。旧版を `?penvoice` 無しで開いても差 0(旧版は撤退スイッチを知らない)。
   ⭐ **`0e8370d` / `59fce15` / `fd67cfe` の `audio.js` は同じ blob `b3aaa1fd2b93a379877fd6b861e01213386e5c61`**(`git rev-parse` で確認)
   ⇒ 依頼書の「`0e8370d` 版」と項目2b が使った「`59fce15` 版」は同一物。HEAD の `audio.js` は `b34af2555156…`。
8. **(4b) は厳密一致にできない ⇒ 許容 1e-6** — 同じ走行で**自己比較**(同じ版・同じ種で 2 回描く)を 112 件測り、
   **最大 5.96e-8**。揺れたのは多音源レシピ 8 種(crit / buff / bossDeath / hiddenFound / cageOpen / levelUp / sword_swing / hit_bone)で、
   両版とも揺れる(版の差ではなく Chrome のオフライン描画の加算順)。両版比較 112 件は**最大 5.96e-8・完全一致 87 件**。
   ⇒ 許容 1e-6 は自己比較の揺れの約 17 倍で、`oldchanged`(freq 880→881)は (4a) 側で差 0.087 として出る。
9. **声の信号はこの受入が全部背負う** — 既存 golden は声の変化を 1 本も検出しない(§12-0b (5)・§12-3)。

計測機構で足したもの:
- **`?autoplay` 無し**で `index.html` を開き、開始の関門をクリックで越える(罠3)。酒場は `tavern.html` を直に開き、前口上 → `playQuestAcceptNarration(goblin-mine)` を
  直に呼ぶ(⛔ `openPrep` を経由しない)。腕ごとに別の BrowserContext(`prologueSeen` が無い状態から)。
- バスの特定 = `evaluateOnNewDocument` で `createGain` / `AudioNode.prototype.connect` を包み、最初の 5 個の Gain に `master/bgm/sfx/ui/voice`。
  **配線の装置確認**(`master→destination` / `bgm→master` / `voice→master`)を (2c) に入れた = 名前付けが外れたら赤。
- 観測先は測る直前に空へ戻す(`#dmBody` / サンプル列 / 部品の計数)。⛔ `audio.js` に検証用の口は足していない(`__renderSfxOffline` / `sfxNames` だけ使う)。
- Chrome は `--autoplay-policy=no-user-gesture-required --mute-audio`。

#### (5) 起動と成果物

    node tools/verify_pen_narration.js              # 素 約 170 秒 / 19 assert
    node tools/verify_pen_narration.js --negative   # 約 912 秒 / 変異 9 本

- 走行ログ = `%TEMP%\df_pen73\item4_plain{1,2,3}.txt` / `item4_neg1.txt` / `item4_mut_<変異>.txt`(担当を決めた手回し 9 本)。
- 走行後の居残り Chrome 0 / ポート 10441〜10450 の待ち受け 0。8765(ユーザーの試遊サーバ)には触っていない(走行後も稼働)。

#### ⇒ 判定

**受入 19/19(素 3 回・指紋一致)/ 負のコントロール 9/9(空振り 0・`durleak` の (1a) と `preloadleak` の (1b)(1c) は緑のまま)。**
`audio.js` の欠陥は見つからなかった。項目5(全数走査)へ進んでよい。
