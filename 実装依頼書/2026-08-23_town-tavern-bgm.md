# #17 街と酒場に専用 BGM を入れる(`town` / `tavern_room`)

- **起草**: 2026-08-23(計画窓) / **ステータス**: **完了 `a030c04`**(2026-08-23 / 実装は §12)
- **着手**: ✅ **完了**(#16 着地 `7642eba` を確認してから実装)。
  ⚠ 起草後に別窓が `tavern.html` を編集し始めた。本チケットの `tavern.html:5974` と競合しうるので、
  着手前に `git status` と `git diff tavern.html` を読んで行番号を測り直すこと。
- **触るファイル**: `audio.js` / `town.html` / `tavern.html` / `assets/bgm/*`(素材2件) / `tools/driver_bgm_town.js`(新規)
- ⛔ **触らないファイル**: `index.html` / `js/df-mapdef.js` / `tools/probe_s2_fold.js` / `実装依頼書/README.md`
  — **別窓が依頼書 #16 を実装中**で、この 4 つは相手の作業ツリーに未コミット差分がある。
  本チケットはこの 4 つを**一度も開かずに完了できる**(§3 で確認済み)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

港町フラン(`town.html`)は今も `GameAudio.playBgm("tavern")` を鳴らしている。
⚠⚠ `tavern` は **`audio.js` の合成トラック**(`TRACKS.tavern`, `audio.js:271`)であって **mp3 ではない**。
つまり街には固有の曲が無いうえに、**酒場とまったく同じ音**が鳴っていて音で区別がつかない。

**ユーザー決定(2026-08-23)**:

- 街 = `village08.mp3` / 酒場 = `酒場.mp3` の **別曲**にする(「街だけ」「両方同じ曲」は不採用)。
- ⚠ ページ遷移のたびに AudioContext が作り直されるので、**街と酒場を同じ曲にしても頭出しに戻る**
  (`title.html:39` のコメントが記録している既知の制約)。同じ曲でも「続けて流れている」体験には
  ならない → **別曲のほうが素直**、という判断。
- 出所(クレジット)は **5 曲とも 魔王魂**(ユーザー確認済み。§2-5 参照)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 現状の呼び口は 3 箇所だけ

| ファイル:行 | いつ | 渡している ID |
|---|---|---|
| `town.html:645` | インラインスクリプト内で**即時** | `"tavern"` |
| `town.html:642` | 最初の `pointerdown` の `bootAudio()` 内(iOS の解錠用) | `"tavern"` |
| `tavern.html:5974` | ⚠ **最初の `pointerdown` のみ**(`document.addEventListener("pointerdown", …, { once: true })` の中。**素のページロードでは 1 回も呼ばれない**) | `"tavern"` |

`playBgm("tavern")` はこの 3 箇所だけ(リポジトリ全文 grep で実測)。`index.html` は無関係。
⚠⚠⚠ **2026-08-23 訂正(起草後の実測)**: 起草時この表の `tavern.html:5974` を「酒場の起動時」と書いていたが**誤り**。実体は `document.addEventListener("pointerdown", …, { once: true })` の中で、**素のページロードでは 1 回も呼ばれない**。→ §8 の **(2a) / (6b) は `pointerdown` を 1 回送ってから**assert すること(修正済み)。街 `town.html:645` は即時呼び出しなので**依頼書どおりで正しい**。⭐ この誤りは §8 の **(0a) 母集団ガードが赤にして拾う**ので、装置の設計自体は効いている。

### 2-2. ⚠⚠⚠ `BGM_FILES.tavern` という ID を使ってはいけない

`audio.js:438` の `playBgm` は **ファイル BGM を合成トラックより先に見る**:

```js
if (BGM_FILES[name]) { playBgmFile(name); return; }   // ← TRACKS[name] より前
```

したがって `BGM_FILES` に `tavern` を足すと、**呼び口を 1 行も直していないのに**
`playBgm("tavern")` が黙って mp3 へ逸れる。さらに `renderBgmOffline`(`audio.js:718`)は
`TRACKS` しか見ないので、**同じ `"tavern"` という名前が 2 つの別物を指す**状態になる。

⇒ 新 ID は **`town` / `tavern_room`** とし、**呼び口 3 箇所を明示的に書き換える**。
   (grep して追える名前にする、というのがこのチケットの設計上の要)。

### 2-3. 素材(実在・バイト数・ラウドネスを実測済み)

すべて `C:\Users\PC_User\Desktop\BGM\` にある。廃坑の `d1` / `haikou` / `boss01` も
**この同じフォルダから 2026-08-21 にコピーされている**(バイト数一致を実測) → **同じ手順でよい**。

| 新 ID | 元ファイル | bytes | Integrated | LRA | Peak | → `volume` |
|---|---|---|---|---|---|---|
| `town` | `village08.mp3` | 666,226 | **−14.6 LUFS** | 3.8 LU | −2.2 dBFS | **0.54** |
| `tavern_room` | `酒場.mp3` | 2,838,636 | **−12.6 LUFS** | 2.7 LU | −0.1 dBFS | **0.43** |

**基準の再現も取れている**(依頼書の数字を信じずに測り直した):

- `dungeon_normal` = `maou_game_dangeon22.mp3` の実測 = **−15.5 LUFS**
  (`audio.js:325` のコメントの値と一致)
- × `volume 0.60` → 実効 **−19.94 LUFS** = コメントの「基準 −19.9」を再現
- 式: `volume = 10^((目標 −19.9 − 実測) / 20)`
  - `town`: 10^((−19.9 + 14.6)/20) = 10^(−0.265) = 0.543 → **0.54**
  - `tavern_room`: 10^((−19.9 + 12.6)/20) = 10^(−0.365) = 0.432 → **0.43**

⭐ **目標を探索の基準(−19.9)に合わせる**のは既定であって絶対ではない。街/酒場は安全地帯なので
   耳で下げたくなるかもしれない。**`volume` を動かしても受入条件の assert は 1 つも変わらない**
   ようにドライバを書くこと(§8 で明記。廃坑チケットと同じ作法)。

**計測コマンド**(再測定するとき):

```bash
ffmpeg -hide_banner -nostats -i <file> -filter_complex ebur128=peak=true -f null - 2>&1 \
  | sed -n '/Summary/,/Peak/p' | grep -E 'I:|LRA:|Peak:'
```

### 2-4. ファイル名は素のまま入れてよい(日本語名の前例が実在する)

- `assets/bgm/` は今のところ全部 ASCII だが、**`assets/` 全体では非 ASCII 名が 13 件**
  追跡されており本番で動いている(例: `assets/シナリオ2壁.png`)。
- ⇒ `酒場.mp3` を**リネームせずそのまま**入れてよい。`village08.mp3` も素の名前が
  既存の作法に合う(`assets/bgm/` には `maou_bgm_fantasy12.mp3` などが素の名前で入っている)。

### 2-5. ⚠⚠ 画面に出るクレジット行は `credit:` から生成されていない

- `audio.js:837` は **直書きの `textContent`**:
  `"ナレーション音声  VOICEVOX:… ｜　BGM  魔王魂 / ユーフルカ"`
- エンディングの `index.html:13404-13405` も直書き(`魔王魂` / `Wingless Seraph（ユーフルカ）`)
- ⇒ **`BGM_FILES[].credit` を埋めても画面は 1 文字も変わらない**。データと表示は**別ソース**。
- ✅ 今回は**出所が 5 曲とも 魔王魂**(ユーザー確認済み)で、直書き 2 箇所には
  **既に「魔王魂」が入っている** → **画面側の文言変更は不要**、`index.html` を開く必要も無い。
- ⭐ ついでに `audio.js:331-333` の **`credit: ""` 3 件**(`mine_entrance`/`mine_depths`/`mine_boss`)を
  `"魔王魂"` で埋める。`audio.js:330` の「⚠⚠ credit は出所をユーザーに確認するまで空。
  推測で "魔王魂" 等と書かないこと」という注意書きは**役目を終える**ので、
  **注意書きごと差し替える**(残すと次の人が「まだ未確認」と誤読する)。

### 2-6. mp3 の読み込み失敗は「静かに無音」になるだけ

`playBgmFile`(`audio.js:377` 付近)は `try/catch` で握りつぶす。**src が 404 でも画面には何も出ない**。
⇒ 受入条件で **src の実在**を必ず測る(`driver_bgm_mine.js` §3a と同じ作法)。

### 2-7. 合成トラック `TRACKS.tavern` は消さない

この改修後 `TRACKS.tavern` は本番の `playBgm` から到達しなくなるが、

- 恒久方針は「**dev 機能は消さずゲート**」(出荷前の大掃除で決めた作法)
- §7 の撤退スイッチで**両ページとも `"tavern"` に戻る**ので、`TRACKS.tavern` は生き続ける
- `renderBgmOffline("tavern")` も引き続き合成トラックを指す(§2-2 の二重定義を避けたおかげ)

### 2-8. changelog は **必須**

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`。
本チケットは **`audio.js` と `tavern.html` の両方**を触るので**フックは必ず鳴る**。
`town.html` は非トリガー。
✅ プレイヤーに見える変化(街と酒場に専用の曲がつく)が**実在する**ので、書ける要約がある。

### 2-9. 容量

追加は **666KB + 2.84MB = 3.42MB**。`.git` は現在 451MB → 約 454MB。
GitHub Free 枠の懸念はこの規模では発生しない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `assets/bgm/village08.mp3` | **新規**(`Desktop\BGM` からコピー) |
| `assets/bgm/酒場.mp3` | **新規**(同上) |
| `audio.js` | `BGM_FILES` に `town` / `tavern_room` を追加 + 既存 `credit: ""` 3 件を `"魔王魂"` へ + §2-5 の注意書きを差し替え |
| `town.html` | `playBgm` 引数 2 箇所(`:642` / `:645`)+ 撤退スイッチ + ヘッダコメント |
| `tavern.html` | `playBgm` 引数 1 箇所(`:5974`)+ 撤退スイッチ |
| `tools/driver_bgm_town.js` | **新規**(受入条件の装置) |

⛔ **`index.html` は開かない**。§2-5 で「開く必要が無い」ことを確認済み。
⛔ **`実装依頼書/README.md` の #17 行は、別窓の #16 が着地してから足す**
   (今 README を触ると相手の未コミットの #16 行を巻き込む。行の文面は §11 に用意してある)。

---

## 4. STEP1 — 素材を入れる

```bash
cp "C:/Users/PC_User/Desktop/BGM/village08.mp3" assets/bgm/village08.mp3
cp "C:/Users/PC_User/Desktop/BGM/酒場.mp3"      assets/bgm/酒場.mp3
```

- ⚠ コピー後に**バイト数一致**を確認する(666,226 / 2,838,636)。
- ⚠ `git add` は**この 2 ファイルを名指し**で。

---

## 5. STEP2 — `audio.js`(`BGM_FILES` と credit)

`audio.js:316`(`pharaxus_stage` の行)の直後、廃坑 3 曲のコメントブロックの**前**に追加する。

```js
    /* ── 街 (港町フラン) と 酒場 (銀の鹿亭) ────────────────────────────────────
     *   town.html / tavern.html はどちらも合成トラック TRACKS.tavern を鳴らしていた
     *   (= 街と酒場が同じ音)。専用の mp3 へ分ける (依頼書 #17)。
     *
     *   ⚠⚠⚠ ID を "tavern" にしないこと。playBgm は BGM_FILES を TRACKS より先に見る
     *     ので、"tavern" で登録すると呼び口を直していない playBgm("tavern") が黙って
     *     mp3 へ逸れ、renderBgmOffline("tavern") だけが合成トラックを指す
     *     = 同じ名前が 2 つの別物になる。
     *
     *   ⚠ volume は曲ごとの実測ラウドネスからの逆算。式は volume = 10^((目標 − 実測)/20)、
     *     目標 = 探索の基準 −19.9 LUFS (dungeon_normal −15.5 × 0.60 の実効値)。
     *       village08 −14.6 → 0.54 / 酒場 −12.6 → 0.43
     *     ⭐ 街と酒場は安全地帯なので耳で下げてよい (volume を動かしても
     *        driver_bgm_town の assert は 1 つも変わらない)。 */
    town:        { src: "assets/bgm/village08.mp3", loop: true, volume: 0.54, credit: "魔王魂" },
    tavern_room: { src: "assets/bgm/酒場.mp3",      loop: true, volume: 0.43, credit: "魔王魂" },
```

続けて `audio.js:328-333` の廃坑ブロックを直す:

- コメント末尾の
  `⚠⚠ credit は出所をユーザーに確認するまで空。推測で "魔王魂" 等と書かないこと。` を
  `⭐ 出所は 2026-08-23 にユーザー確認済み = 3 曲とも 魔王魂。` へ**差し替える**。
- `mine_entrance` / `mine_depths` / `mine_boss` の `credit: ""` → `credit: "魔王魂"`。

⛔ **`volume` の既存 3 値(0.74 / 0.43 / 0.52)は 1 つも動かさない。**

---

## 6. STEP3 — 呼び口の書き換えと撤退スイッチ

### 6-1. `town.html`

`?town=0` / `?heromark=0` を判定している**同じ位置**(`town.html:334` 付近の IIFE 冒頭)に足す:

```js
    /* ══ 撤退スイッチ ?townbgm=0 (依頼書 #17 §7) ═══════════════════════════
       0 を渡すと街も酒場も従来どおり合成トラック TRACKS.tavern を鳴らす。
       ⚠ クエリはページ遷移をまたがない。tavern.html 側は**独立に**読む
         (#15 の ?heromark=0 と同じ作法)。 */
    var TOWN_BGM_ID = "town";
    try {
      if (new URLSearchParams(location.search).get("townbgm") === "0") TOWN_BGM_ID = "tavern";
    } catch (e) {}
```

`:642` / `:645` の `GameAudio.playBgm("tavern")` を **`GameAudio.playBgm(TOWN_BGM_ID)`** へ。

⚠ `town.html:57` のヘッダコメント
`GameAudio.playBgm("tavern") — audio.js の合成トラック (mp3 ではない)。` は**もう嘘になる**ので
`GameAudio.playBgm("town") — assets/bgm/village08.mp3 (依頼書 #17)。?townbgm=0 で合成へ戻る。`
へ直す。

### 6-2. `tavern.html`

`:5974` の直前(同じ関数の頭)で読む:

```js
    var TAVERN_BGM_ID = "tavern_room";
    try {
      if (new URLSearchParams(location.search).get("townbgm") === "0") TAVERN_BGM_ID = "tavern";
    } catch (e) {}
    if (window.GameAudio) { GameAudio.unlock(); GameAudio.playBgm(TAVERN_BGM_ID); }
```

---

## 7. 撤退スイッチ

- **`?townbgm=0`** — 街と酒場の両方を従来の合成トラック `tavern` に戻す。
- ⚠ **各ページが独立に読む**(クエリはページ遷移をまたがない)。#15 の `?heromark=0` と同じ作法で、
  「街だけ戻す」「酒場だけ戻す」ができてしまうが、**それで構わない**(切り分けに使える)。
  `?town=0` のように sessionStorage へ写す必要は無い(撤退したい対象が 1 ページで完結するため)。

---

## 8. 受入条件 — `tools/driver_bgm_town.js`(新規)

⭐ **音は headless で聴けない → 「どのキーを渡したか」で測る**(`driver_bgm_mine.js` と同じ方針)。
足場(http サーバ + 配信スナップショットの変異 + puppeteer-core)は `driver_bgm_mine.js` を流用してよい。

### ⚠⚠⚠ 計測機構(ここだけは廃坑ドライバの写経では動かない)

廃坑は `startGame()` を**ドライバが呼ぶ**ので、その前に `window.GameAudio.playBgm` を包めた。
**街と酒場は BGM 呼び出しがページロード中に走る**ので、ロード後に包んでは間に合わない。

⇒ `audio.js` 末尾の `global.GameAudio = GameAudio;` を捕まえる。
`page.evaluateOnNewDocument` で `window.GameAudio` に **setter を仕掛けて**おき、
代入された瞬間に `playBgm` を包む:

```js
await page.evaluateOnNewDocument(() => {
  window.__bgmCalls = [];
  let _ga;
  Object.defineProperty(window, "GameAudio", {
    configurable: true,
    get() { return _ga; },
    set(v) {
      _ga = v;
      if (v && typeof v.playBgm === "function") {
        const orig = v.playBgm;
        v.playBgm = function (n) { window.__bgmCalls.push(n); return orig.apply(this, arguments); };
      }
    },
  });
});
```

⭐ この機構なら **AudioContext が解錠されていなくても測れる**
(`playBgm` は未解錠だと `pendingBgm` へ落ちるが、**渡された引数は記録される**)。

### §0 装置(先に母集団を確かめる)

- **(0a)** `window.__bgmCalls.length >= 1` — ラッパが 1 回以上 ID を捉えている。
  ⭐ **これが無いと全部の assert が空振りで永久緑になる**。
- **(0b)** `GameAudio.__bgmFiles()` が **9 件**返る(既存 7 + 新規 2)。表を写経せず実体から引く。

### §1 街(`town.html`)

- **(1a)** 素のページで `__bgmCalls` に **`"town"` が含まれ、`"tavern"` は含まれない**。
- **(1b)** `pointerdown` を 1 回送った後も、渡された ID は **`"town"` のまま**(`:642` の経路)。

### §2 酒場(`tavern.html`)

- **(2a)** ⚠ **`pointerdown` を 1 回送った後**の `__bgmCalls` に **`"tavern_room"` が含まれ、`"tavern"` は含まれない**。
  ⚠⚠ **素のページロードでは 0 件**(§2-1 の訂正を参照)。ここを「素のページで」と書くと (0a) が正しく赤になる。

### §3 素材(⚠ 404 は無音になるだけで画面に出ない)

- **(3a)** `__bgmFiles()` の `town` / `tavern_room` の `src` に **HTTP HEAD して 200**。
- **(3b)** 同じく既存 7 件の `src` も 200(素材の取り込みで既存を壊していない)。

### §4 クレジット(商用配布のため)

- **(4a)** `__bgmFiles()` の **全 9 件**で `credit` が**空文字でない**。
  ⭐ `mine_*` 3 件の宿題をこのチケットで回収したことの機械的な担保。
- **(4b)** 設定モーダルの直書きクレジット行に **`魔王魂` が含まれる**
  (`audio.js:837`。データと画面が**別ソース**であることを忘れないための 2 経路目)。

### §5 恒等(非退行)

- **(5a)** `__bgmFiles()` の既存 7 件の **`id` と `src` が 1 件も変わっていない**。
- **(5b)** `TRACKS.tavern` が生きている = `GameAudio.__renderBgmOffline("tavern")` が
  reject しない(§2-2 の二重定義を避けられていることの検査でもある)。

### §6 撤退

- **(6a)** `town.html?townbgm=0` → 渡る ID が **`"tavern"`**。
- **(6b)** `tavern.html?townbgm=0` で **`pointerdown` を 1 回送った後**、渡る ID が **`"tavern"`**。

### ⛔ 測らないこと

- **`volume` の値は assert しない。** 耳で動かせる余地を残すため(§2-3)。
  代わりに「`volume` が数値で `0 < v <= 1`」だけ見る。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `revert_town` | `town.html` の ID を `"tavern"` に戻す | (1a) |
| `revert_tavern` | `tavern.html` の ID を `"tavern"` に戻す | (2a) |
| `badsrc` | `BGM_FILES.town` の `src` を存在しないパスへ | (3a) |
| `emptycredit` | `mine_depths` の `credit` を `""` に戻す | (4a) |
| `shadow` | ID を `tavern_room` ではなく **`tavern`** で登録(§2-2 の罠を再現) | (5b) |

⭐ **`shadow` 変異が (5b) を赤くする**ことが、§2-2 の設計判断が効いていることの証明になる。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/driver_bgm_mine.js` → **37/37**
- `node tools/verify_town_map.js` → **85/85**
- `node tools/verify_title_screen.js` → **83/83**

⚠ 上記の基準値は 2026-08-23 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**
(別窓の #16 が `index.html` / `js/df-mapdef.js` を触っているので、巻き添えで動く可能性がある)。

---

## 9. 試聴確認(ここが本当の受入)

⚠ **`file://` 直開きでは音が出ない**(ローカルは http 起動が必須)。

1. 街に立って `village08.mp3` が鳴るか。音量が探索(廃坑)と比べて突出/埋没していないか。
2. 街 → 酒場へ入って**曲が変わる**こと、`酒場.mp3` の音量が街と揃って聞こえること。
3. 酒場 → 出発 → ダンジョンで廃坑の曲へ切り替わること(mp3 → mp3 の相互排他)。
4. `?townbgm=0` で従来の合成トラックに戻ること。

⭐ 1 と 2 で違和感があれば **`volume` を動かしてよい**(assert は 1 つも壊れない)。

---

## 10. changelog(⚠ `audio.js` + `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>街と酒場に専用のBGMを追加</b> — 港町フランと銀の鹿亭で、それぞれ違う曲が流れるようになった。"
```

---

## 11. やらないこと

- ⛔ **タイトル専用 BGM**(`title.html`)。別チケットのまま残す。
- ⛔ **`index.html` を開くこと**。§2-5 で不要と確認済み。
- ⛔ **合成トラック `TRACKS.tavern` の削除**(§2-7)。
- ⛔ **廃坑 3 曲の `volume` 変更**(`credit` だけ埋める)。
- ⛔ **`実装依頼書/README.md` への行追加**(別窓の #16 着地後にこの窓が行う)。用意してある行:

```
| 17 | [2026-08-23_town-tavern-bgm.md](2026-08-23_town-tavern-bgm.md) | **承認済** | 0% | 街(`town.html`)と酒場(`tavern.html`)を合成トラック `tavern` から専用 mp3 へ。ユーザー決定 = **街 `village08.mp3` / 酒場 `酒場.mp3` の別曲**・出所は **5 曲とも魔王魂**。⚠⚠⚠ **`BGM_FILES.tavern` という ID は使えない**(`playBgm` が `TRACKS` より先に `BGM_FILES` を見るので、呼び口を直さないまま黙って mp3 へ逸れ、`renderBgmOffline("tavern")` だけが合成を指す二重定義になる)→ ID は `town` / `tavern_room`。⭐ ラウドネス実測済 village08 −14.6 → volume 0.54 / 酒場 −12.6 → 0.43(基準 −19.9 は `dungeon_normal` −15.5 × 0.60 で再現確認)。⭐⭐ **画面のクレジット行は `credit:` から生成されていない**(`audio.js:837` と `index.html:13404` は直書き)→ 5 曲とも魔王魂なので**画面側は変更不要**、`audio.js:331-333` の空 `credit` 3 件も同時回収。撤退=`?townbgm=0` |
```

---

## 12. 実装結果

**完了 `a030c04`**(2026-08-23 / 実装窓)。着手前に §2-1 の呼び口 3 箇所・§2-3 のバイト数・
§2-4 の非 ASCII 前例をすべて本番の実ファイルで測り直し、**再現した**。崩れたのは
**§8 の負のコントロール設計 1 点だけ**(下記 ⭐⭐⭐)。

### 入ったもの

| ファイル | 実際の変更 |
|---|---|
| `assets/bgm/village08.mp3` | 新規 666,226 B(md5 `0d519ec3…` = `Desktop\BGM` と一致) |
| `assets/bgm/酒場.mp3` | 新規 2,838,636 B(md5 `a9a13b31…` = 同上) |
| `audio.js` | `BGM_FILES` に `town` / `tavern_room`(+16 行)/ `mine_*` 3 件の `credit: ""` → `"魔王魂"` / 注意書きを差し替え |
| `town.html` | `TOWN_BGM_ID` + 呼び口 2 箇所(`:651` / `:654`)+ ヘッダコメント 2 行 |
| `tavern.html` | `TAVERN_BGM_ID` + 呼び口 1 箇所(`:5981`)+ 見出しコメント + changelog 1 行 |
| `tools/driver_bgm_town.js` | **新規 467 行** |
| `tools/driver_bgm_mine.js` | `badsrc` 変異アンカーを `credit: ""` → `"魔王魂"` へ追従(1 行) |

⛔ **`index.html` は一度も開いていない**(§2-5 のとおり不要だった)。
⚠ `driver_bgm_mine.js` のアンカー追従は**必須**だった。放置すると `mine_depths` の行が
一致しなくなり、既存 golden が **exit 3(変異の空振り)で止まる**。

### 測定結果

- `node tools/driver_bgm_town.js` → **17/17 PASS**
- `node tools/driver_bgm_town.js --negative` → **15/15 PASS**(装置 10 + 変異 5)
- 非退行:
  - `node tools/driver_bgm_mine.js` → **37/37**(§8 の記録どおり)
  - `node tools/verify_town_map.js` → **85/85**(同上)
  - `node tools/verify_title_screen.js` → **85/85** ⚠ §8 は **83/83** と記録していたが、
    **この改修を 1 行も含まない HEAD の使い捨て worktree でも 85/85** だった
    → **記録違いであって退行ではない**。`tools/verify_title_screen.js` と `title.html` は
    起草コミット `98f94bd` から 1 バイトも変わっていない(`git diff 98f94bd HEAD --` が空)。
    ⭐ **基準本数が合わない時は、期待値を書き換える前に「素の HEAD を worktree で走らせる」。**

### ⭐⭐⭐ 依頼書から動かした 1 点 — `shadow` 変異の当て先を (5b) → (5c) へ

§8 は「`shadow` 変異(ID を `tavern` で登録)→ **(5b)** `renderBgmOffline("tavern")` が
reject する」と書いていたが、**実測すると (5b) は緑のまま**だった。
`renderBgmOffline` は **`TRACKS` しか見ない**ので、`BGM_FILES` に `tavern` を足しても
`TRACKS.tavern` は生きたまま = **負のコントロールが空振りする**。

⇒ 罠の本体は「**同じ ID が `BGM_FILES` と `TRACKS` の両方に在る**」ことなので、

- **(5c)** `BGM_FILES` の**全 ID** について `renderBgmOffline(id)` が **reject する**
  (= 合成トラックと ID が 1 つも衝突しない)

を足して `shadow` をここへ当てた。実測で `衝突=["tavern"]` を返して赤くなることを確認済み。
(5b) は「撤退スイッチの戻り先 `TRACKS.tavern` が消えていない」を測る節として残してある。

### ⭐ 装置に足したもの

- **(0c)** 酒場は `pointerdown` の**前**は 1 度も鳴らしていない —— §2-1 訂正の因果を
  ドライバ側で固定する母集団ガード。これが無いと (2a)/(6b) は
  「呼ばれていないから `tavern` も含まれない」で**永久に緑**になる。
- **(1b)** 街の解錠経路(`pointerdown` → `bootAudio`)も `town` のまま —— 街は呼び口が
  **2 本**(即時 + 解錠)あるので、片方だけ直しても即時側だけで緑になる。
- ⭐ 5 つの変異は**受入条件と同じ述語関数**を回している(ドライバが変異用に別の式を書くと、
  負のコントロールが受入条件そのものを検査しなくなるため)。

### 残り

- **試聴確認(§9)はユーザー未実施。** `volume` を耳で動かす余地は残してある
  (§8 の ⛔ どおり、ドライバは `0 < v <= 1` しか見ていない)。
- ⛔ **タイトル専用 BGM は別チケットのまま**(§11)。
