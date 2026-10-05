# #85 クエスト開始時に白い石床が一瞬見える — 読み込み中は暗く、届いたらフェードイン

- **起草**: 2026-10-04(起草窓 claude-27) / **ステータス**: **承認済**(2026-10-04 ユーザー承認)
- **着手**: 2026-10-05 実装窓(dev-loop)・基準 `e3ce2b0`(#83 完了 `183a969` + README の #85 行)。§2 の行番号は §12-0 で `e3ce2b0` へ測り直し済み。
- **触るファイル**: `index.html`(描画の 2 か所 + 読み込みの 3 か所)/ `tools/verify_board_load_flash.js`(新規)
- ✅ **着手の順番**: #83 塔の母 B は `183a969` で完了済み。#83 で動いた行番号は §12-0 で測り直した(§2 の表は `35ad1fc` 基準のまま残す)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

クエストを始めると(DM の語り「町外れの森 — 盗賊団の根城」が出ている間)、**卓上マップの絵が出る前の一瞬、白い丸石の古いタイルが盤面に敷かれて見える**(ユーザーの iPhone・4G・2026-10-04 スクショ)。
森だけでなく**どのシナリオでも出る**(ユーザー報告 + §2-3 で砦でも再現)。

正体は全シナリオ共通の予備床 `assets/床2.png`。本来の床(シナリオ別 1.9〜3.4MB の PNG)と卓上マップの絵(0.3〜1MB の JPG)が届く前に、12.9KB の予備床だけが先に届いて盤面を塗っている。

**ユーザー決定(2026-10-04)**:

- ✅ **読み込み中は暗いまま + 届いたらフェードイン**。
- ✗ 暗いままにするだけ(パッと切り替わる)… 不採用。届いた瞬間の切り替わりも柔らげたい。
- ✗ 「地図を広げています…」の幕で覆う … 不採用(変更が大きい)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実・基準 HEAD `35ad1fc`)

### 2-1. 白い丸石の正体と、それを敷く場所

| ファイル:行 | 何 |
|---|---|
| `index.html:3492-3495` | `floorTex.src = "assets/床2.png"` / `floorTexLoaded` = **全シナリオ共通の予備床**(93x93 石畳・12,885 バイト) |
| `index.html:3486-3489` | `tileset.png`(34KB)。onload で `renderMap()` |
| `index.html:3926-3956` | `floorPattern` = シナリオ別の本来の床(`_texSet.floor`)。onload で `createPattern` → `renderMap()`。⚠ **`onerror` が無い** |
| `index.html:3783` | `_texSet = SCENARIO_TEX[_scenIdForTex] \|\| SCENARIO_TEX["goblin-mine"]` = **どのテーマにも必ず専用の床がある** |
| `index.html:6461-6528` | `addPainting` — 絵の `entry.loaded` は onload(フェザー焼き後)で true。`onerror` は空関数(「通常タイル描画のまま」) |
| `index.html:6629-6637` | `isPaintedAndLoaded` — 絵の内側 かつ 絵が loaded のときだけ床を飛ばす |
| `index.html:9027-9040` | Pass 1a 天井: `isPaintedAndLoaded` で飛ばす(未ロードなら tileset の天井を敷く) |
| `index.html:9045-9068` | Pass 1b 床・パターン枝: 本来の床があれば、絵が未ロードのマスも本来の床で塗る |
| `index.html:9069-9086` | Pass 1b 床・**フォールバック枝**: 本来の床が無いとき `floorTexLoaded` なら **`床2.png` を 1 マス 1 枚**、それも無ければ tileset の床 |
| `index.html:9088-9098` | Pass 1b.5 絵: `p.loaded` のものだけ `drawImage(p.canvas \|\| p.img, …)` |

`床2.png` の使用箇所はリポジトリ全文で **`index.html:3493` の 1 か所だけ**(`grep -n "床2" index.html tavern.html town.html world.html js/*.js`)。
⇒ **本来の床として使っているシナリオは 1 つも無い**。読み込み中と 404 のときだけ出る予備。

### 2-2. 素材の大きさ(4G で差が出る理由)

| 素材 | バイト |
|---|---|
| `床2.png`(予備) | 12,885 |
| `シナリオ2床.png`〜`シナリオ6床.png` / `床1.png` / `caravan_road_floor.png` | 1,934,243〜3,447,021 |
| 卓上マップの絵 `room_*_n*.jpg` / `room_*_map.jpg` | 257,312〜1,019,199 |

### 2-3. 再現(遅い回線を模した headless)

床と絵だけを 4 秒遅らせて配信し(他は即時)、390x844 で開始直後を撮った:

| シナリオ | 1500ms | 6500ms |
|---|---|---|
| bandits-forest | `floorPattern:false, floorTexLoaded:true, n7_map.jpg:false` ⇒ **iPhone のスクショと同じ白い丸石** | 森の本来の床 |
| orc-fort | 同上(`n4_map.jpg:false`)⇒ **白い丸石** | 本来の床 |

遅延なしのローカル配信で「本来の床」と「絵」が揃う時刻(`performance.now()`・10ms 間隔の監視):

| goblin-mine | bandits-forest | dragon-lair | undead-temple | orc-fort | lizard-swamp |
|---|---|---|---|---|---|
| 451 | 472 | 568 | 594 | 615 | 675 |

再測定コマンド(起草窓の使い捨てプローブ。§8 の新規ドライバへ同じ仕組みを移す):

    node <scratchpad>/probe_flash.js bandits-forest 4000   # 床と絵を 4 秒遅らせ 1500ms / 6500ms を撮る
    node <scratchpad>/probe_time.js  orc-fort 0            # 遅延なしで揃う時刻

遅延の正規表現 = `/(シナリオ\d床|床1|caravan_road_floor)\.png$|room_[^/]*\.jpg$/`(サーバ側で応答を `setTimeout`)。

### 2-4. ⚠⚠⚠ 罠 1 — `renderMap` は毎フレーム呼ばれていない

`renderMap()` の呼び口は 12 か所。`requestAnimationFrame` で回っているのはカメラ(`cameraFollowTick` :7690 / :7704・**動いている間だけ**)と fx(:8274)だけ。
DM の語りの間はカメラが止まっているので、**フェードの途中の 1 枚が描かれたまま止まる**。
⇒ フェード中だけ自前の rAF ループで `renderMap()` を回し、全部のフェードが終わったら止める。
⭐ §8 の変異 `noloop` で装置に内蔵する。

### 2-5. ⚠⚠⚠ 罠 2 — ピクセルを撮る既存 golden は「`floorPattern` が非 null になった直後」に撮る

`driver_field_step1` / `_step1_geo` / `_step2` / `_step3` / `_step05_hud` / `driver_field_verge_gap` / `driver_mapdef_step1` などは、`wallPattern` / `floorPattern` が非 null になるのを待って、すぐ `toDataURL` のハッシュを撮る(例: `driver_field_step2.js:250` / `:528`、`driver_mapdef_step1.js:527-530`)。
届いた瞬間から 300ms かけて濃くすると、**このハッシュが途中の色を撮って赤くなる**。
⇒ **届くまでに時間がかかったときだけフェードする**。閾値 = ページの開始(`performance.now()` の原点)から **1500ms**。
ローカルでは 451〜675ms で揃う(§2-3)ので、遅い機械(この機械は約 2.6 倍遅い)でも閾値の内側に収まる。4G では数秒かかるので、フェードはそこで効く。
⭐ §8 の変異 `nogate`(閾値 0 = 常にフェード)で装置に内蔵する。

### 2-6. ⚠ 罠 3 — 404 のときの予備床を消してはいけない

本来の床や絵が 404 で落ちたとき、今は `床2.png` / 床パターンが出て**少なくとも歩ける盤面が見える**。
「届くまで暗く」を「届かなければ永久に暗い」にしないこと。
⇒ 本来の床には `onerror` を新たに足して「落ちた」印を立て、落ちたときだけ従来のフォールバック(`床2.png` → tileset)へ戻す。絵も `onerror` で印を立て、落ちた絵のマスは従来どおり床で塗る。
⭐ §8 の変異 `nofail` で装置に内蔵する。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | (a) 本来の床の `onerror` と到着時刻 (b) 絵の `onerror` と到着時刻 (c) Pass 1a / 1b で「届くのを待っているマス」を描かない (d) Pass 1b / 1b.5 のフェード (e) フェード中だけ回す rAF ループ (f) 撤退 `?boardfade=0` (g) changelog |
| `tools/verify_board_load_flash.js` | 新規の受入 |

⛔ `tavern.html` / `audio.js` / `js/*` は開かない(§2-1 で `床2.png` の読み口が `index.html` だけと確認済み)。

---

## 4. STEP1 — 読み込み中は暗いまま

- 「待っている」の定義:
  - **床**: `floorPattern` が null **かつ** 本来の床がまだ落ちていない(新設 `floorTex1Failed` が false)。
  - **絵のマス**: `isPaintedTile(tx, ty)` で、そのマスを覆う絵が **loaded でも failed でもない**(新設 `isPaintedPending(tx, ty)`)。
- Pass 1a(天井)と Pass 1b(床・両方の枝)で、**待っているマスは何も描かない**(`renderMap` 冒頭の暗い背景のまま)。
- Pass 1b のフォールバック枝(`床2.png` / tileset の床)へ入るのは **`floorTex1Failed` のときだけ**。
- `floorTex1.onerror = () => { floorTex1Failed = true; renderMap(); };` を足す。`addPainting` の `onerror` は `entry.failed = true; renderMap();` にする。
- ⛔ 当たり判定(`blocked` / `sealRing` / `paintedTileMask`)は今と同じく **onload を待たずに確定**させる(`addPainting` の既存の注記)。描画だけを変える。
- ⛔ 壁(Pass 2 以降)は触らない(§11)。

## 5. STEP2 — 届いたらフェードイン

- 定数: `BOARD_FADE_MS = 300` / `BOARD_FADE_MIN_WAIT_MS = 1500`(§2-5)。
- 到着時刻: 本来の床 = `floorPatternAt = performance.now()`(onload で `floorPattern` を作った時刻)/ 絵 = `entry.loadedAt`(フェザー焼き後に `loaded = true` にした時刻)。
- アルファ: `at < BOARD_FADE_MIN_WAIT_MS` なら 1(フェードしない)。そうでなければ `min(1, (now - at) / BOARD_FADE_MS)`。
- 描画: Pass 1b の床(パターン枝)と Pass 1b.5 の絵を、そのアルファの `globalAlpha` で描く(`save`/`restore` で囲む)。
- ループ: フェード中のものが 1 つでもあれば `requestAnimationFrame` で `renderMap()` を回す。全部 1 に達したら止める。多重起動しないこと(フラグ 1 本)。
- ⛔ 待っていないマス・閾値の内側で届いたものの描画は、**今と 1 画素も変えない**(§2-5 の既存 golden を守る)。

## 6. STEP3 — changelog(§10)

---

## 7. 撤退スイッチ

- **`?boardfade=0`** — STEP1・STEP2 を両方外し、今の挙動(読み込み中は `床2.png` → 届いたらパッと切り替わる)へ戻す。
- ⚠ 判定位置 = `index.html` の床の読み込みより前で 1 回読む(`URLSearchParams`)。`index.html` で閉じているので、ページ遷移をまたぐ必要はない。

---

## 8. 受入条件 — `tools/verify_board_load_flash.js`(新規)

方針: 内蔵サーバで **§2-3 の正規表現に当たる素材だけを遅らせる / 404 にする**。390x844 で開き、DM の語りの「クリックして…」で止まっている静止した盤面を観測する。
2 経路で突き合わせる: ① 画素(盤面の明るさ・ハッシュ)② 呼び出しの記録(`evaluateOnNewDocument` で `CanvasRenderingContext2D.prototype.drawImage` を包み、`床2.png` の Image を描いた回数を数える)。

- port base = **#83 の §12 に書かれる「次の base」**(着手時に README で確かめる)。変異は base+1 から。

### §0 装置

- **(0a)** 遅延が効いている: 1500ms の時点で `floorPattern === null` かつ絵が 1 枚以上あり全部 `loaded === false`。⭐ これが無いと全部が空振りで永久に緑になる。
- **(0b)** 予備床は届いている: 1500ms の時点で `floorTexLoaded === true`(= 直す前なら白い丸石が出ていた状況で測っている)。
- **(0c)** 撤退の腕 `?boardfade=0` + 遅延で、1500ms までに `床2.png` の drawImage が 1 回以上 = 計数器が本当に数えている。

### §1 暗いまま(遅延 4000ms・6 シナリオ: goblin-mine / bandits-forest / lizard-swamp / orc-fort / undead-temple / dragon-lair)

- **(1a)** 1500ms までの `床2.png` の drawImage が **0 回**。
- **(1b)** 1500ms の盤面(HUD と語りの枠を除いた canvas の画素)の平均輝度が、同じ腕を `?boardfade=0` で撮ったときより明確に低い(閾値は着手時に `床2.png` の平均輝度から決めて §12 に書く)。

### §2 フェードイン(遅延 4000ms・森)

- **(2a)** 素材が届いた直後(届いた時刻 + 約 100ms)の盤面の平均輝度が、暗い時点と落ち着いた時点の**あいだ**にある。
- **(2b)** 届いてから 1000ms 後と 1500ms 後のハッシュが一致する(フェードが終わってループが止まり、最後まで濃くなっている)。
- **(2c)** (2b) のハッシュが、遅延なしで開いて落ち着いた盤面のハッシュと一致する(フェードを経ても最終の絵は同じ)。

### §3 速い読み込みではフェードしない(遅延なし・6 シナリオ)

- **(3a)** `floorPattern` が非 null になり全部の絵が loaded になった直後のハッシュが、1000ms 後のハッシュと一致する(既存のピクセル golden が撮る瞬間の絵が変わらない)。

### §4 404 では従来どおり(本来の床と絵を 404 にする・森)

- **(4a)** 1500ms 以降に `床2.png` の drawImage が 1 回以上 = 予備床で盤面が見える。
- **(4b)** 3000ms の盤面の平均輝度が、§1 の暗い盤面より明確に高い(永久に暗くなっていない)。

### §5 撤退

- **(5a)** `?boardfade=0` + 遅延で 1500ms の盤面ハッシュが、`35ad1fc` の `index.html` を配信した同じ腕のハッシュと一致する(従来の姿へ戻る)。⚠ 着手前の `index.html` は `git show 35ad1fc:index.html` をドライバが自前で配信する(影のツリーを作らない)。

### ⛔ 測らないこと

- フェードの見た目の気持ちよさ(300ms という長さ・ease の形)。実機で動かす余地を残す。
- 暗い盤面の正確な色(フォグの暗さと揃っていれば足りる)。
- 壁(Pass 2 以降)。今回は触らない(§11)。

### 負のコントロール(`--negative`。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `fallback` | Pass 1b のフォールバック枝を元へ戻す(`floorTex1Failed` を見ない) | §1 (1a)(1b) |
| `noloop` | フェードの rAF ループを消す(§2-4 の罠) | §2 (2b)(2c) |
| `nogate` | `BOARD_FADE_MIN_WAIT_MS = 0`(§2-5 の罠) | §3 (3a) |
| `nofail` | `floorTex1.onerror` と絵の `failed` を立てない(§2-6 の罠) | §4 (4a)(4b) |
| `nooff` | `?boardfade=0` を読まない | §0 (0c) / §5 (5a) |

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指し(ピクセルを撮る本・§2-5): `driver_field_step1` / `driver_field_step1_geo` / `driver_field_step2` / `driver_field_step3` / `driver_field_step05_hud` / `driver_field_verge_gap` / `driver_mapdef_step1` / `driver_paint_blocked`(絵の読み込みを遮断する本)。着手前の色を項目 1 で控え、実装後に同じ色であること。
- 母集団: #84 の `post84`(204 腕)+ #83 の追加分。⭐ dev-loop の作法どおり、緑→赤は影のツリーとの交互の対で帰属を切り分ける。

⚠ 基準は 2026-10-04 時点。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

- iPhone・4G(Wi-Fi を切る)で、酒場からクエストを始める。**白い丸石が一瞬も見えない**こと。語りの裏の盤面が暗く、絵が届いたら浮かび上がること。
- 2 回目以降(キャッシュあり)は暗い時間がほぼ無く、すぐ絵が出ること。
- 撤退 `?boardfade=0` で今の姿へ戻ること。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>クエスト開始時のちらつきを修正</b> — 地図が届く前に古い石の床が一瞬見えていたのを直し、暗い盤面から地図が浮かび上がるようにした。"

---

## 11. やらないこと

- ⛔ **床の PNG を軽くする**(1.9〜3.4MB → JPG/WebP など)。暗い時間を縮める本筋だが、絵柄の目視確認と既存のピクセル golden の基準の付け替えが要る = 別チケット候補。
- ⛔ **壁の予備描画**(`wallPattern` 未ロード時の tileset の壁・`index.html:9314` 以降)。今回のスクショには出ていない。実機で古い壁が見えたら別チケット。
- ⛔ 「地図を広げています…」の幕・酒場での先読み(ユーザーが不採用にした案)。
- ⛔ `town.html` / `world.html` / `tavern.html` の盤面(`床2.png` を読んでいない)。
- ⛔ **`実装依頼書/README.md` への行追加**(#83 の着地後)。用意してある行:

    | 85 | [2026-10-04_board-load-flash.md](2026-10-04_board-load-flash.md) | **承認済** | 0% | クエスト開始時に白い石床(予備床 `床2.png`)が一瞬見えるのを直す。読み込み中は暗いまま + 届くまで 1500ms 超かかったときだけ 300ms でフェードイン(⚠ ピクセル golden は届いた直後に撮るので速い読み込みではフェードしない / `renderMap` は毎フレームではない ⇒ フェード中だけ rAF / 404 のときは従来の予備床へ)。#83 完了後に着手。撤退 `?boardfade=0` |

---

## 12. 実装結果

### 12-0. 項目1 — 着手前の実測(基準 e3ce2b0)

本番ファイルは 1 バイトも触っていない(`git status --porcelain` はこの依頼書だけ)。
測定プローブ = 実装窓の scratchpad `item1/probe85.js`(内蔵 node http・port 10601・390x844・Chrome headless。
§2-3 の正規表現に当たる応答だけを `setTimeout` / 404。`drawImage` を包んで `床2.png` の描画回数、
`#mapCanvas` への `fillRect(0,0,…,'#0a0a0a')` を包んで `renderMap` の回数を数える。10ms 間隔で `floorPattern` / 絵の `loaded` を見張る)。

#### 行番号(`35ad1fc` → `e3ce2b0`)

| 何 | 35ad1fc(§2-1 の記載) | e3ce2b0 |
|---|---|---|
| `tileset.png`(onload で `renderMap()`) | 3486-3489 | **3508-3511** |
| 予備床 `floorTex.src = "assets/床2.png"` / `floorTexLoaded` / onload | 3492-3495 | **3514-3517**(src = 3515) |
| `_texSet = SCENARIO_TEX[...] \|\| goblin-mine` | 3783 | **3805** |
| `floorPattern` / `floorTex1`(onload = 3975-3978・`onerror` 無し) | 3926-3956 | **3948-3978** |
| `addPainting`(onload 6505-6535 / `entry.loaded = true` 6534 / 空の `onerror` 6536 / マスク 6539-6547) | 6461-6528 | **6483-6548** |
| `isPaintedTile` / `isPaintedAndLoaded` | 6629-6637(⚠ 35ad1fc でも実は 6593) | **6611-6614 / 6615-6622** |
| `renderMap()` 本体 | — | **9018** |
| Pass 1a 天井 | 9027-9040 | **9045-9063** |
| Pass 1b 床・パターン枝 | 9045-9068 | **9064-9090** |
| Pass 1b 床・フォールバック枝(`floorTexLoaded` なら `床2.png` = 9100-9101) | 9069-9086 | **9091-9109** |
| Pass 1b.5 絵 | 9088-9098 | **9111-9122** |
| `cameraFollowTick`(rAF 7712 / 7726)/ `renderWorld` → `renderMap()` | 7690 / 7704 | **7711-7728 / 16625** |
| `fxTick`(rAF 8296 / 8407) | 8274 | **8396-8408** |
| 壁の予備描画(§11 で触らない) | 9314 以降 | (Pass 2 以降・未計測) |

#### §2 の主張の実測(○ = 成立)

- ○ `床2.png` の読み口はリポジトリで 1 か所(`index.html:3515`。ほかは 9065 のコメントだけ。tavern/town/world/js は 0 件)。
- ○ `floorTex1` に `onerror` が無い(`grep -n "floorTex1\."` = `.src` 3974 と `.onload` 3975 だけ)。
- ○ `addPainting` の `onerror` は空関数(6536)。`isPaintedAndLoaded` は「マスクの内側 かつ loaded」のときだけ真。
- ○ Pass 1a / 1b パターン枝 / フォールバック枝 / 1b.5 の構造は §2-1 のとおり。
- ○ §2-4: 語りの間は `renderMap` が毎フレーム呼ばれていない。遅延 4000ms の森で、呼び出しは 6 回(176〜264ms)の後、床の onload の 1 回(4219ms)だけで、9 秒まで 0 回。
- △ 呼び口は直接の `renderMap()` が 12 か所(3511/3517/3977/4031/4064/4402/4470/4472/4480/4487/8735/16625)。rAF で `renderMap` に届くのはカメラ(`cameraFollowTick` → `renderWorldWithShake` → `renderWorld` :16625)だけ。→ K2
- △ §2-5: 名指しの golden は「非 null になった直後」には撮っていない。→ K3

#### 崩れた主張

- **K1 ⚠⚠⚠ 絵の onload は `renderMap()` を呼ばない**(6505-6535)。床より後に届いた絵は、語りの間ずっと描かれない。
  実測: 床 3000ms / 絵 5000ms 遅延で、森・砦とも 7000ms の時点で `paints:true` なのに `renderMap` の回数は増えず、
  強制で `renderMap()` を 1 回呼ぶと mapCanvas が変わった(`staleBeforeForcedRender:true`・絵は画面内)。
  床と絵を同じ 4000ms 遅らせると競争になる: 森 1 回目は絵の到着 4234ms が最後の描画 4202ms より後(6500ms の輝度 59.3 = 絵が出ていない)、2 回目は先(輝度 76.6 = 出ている)。
  ⇒ 項目2: **絵の onload でも描画を起こす(フェードのループを起動する)こと**。§4 は `onerror` にだけ `renderMap()` を足すと書いているが、onload 側にも要る。これが無いと §8 (2a)〜(2c) が競争のせいで非決定になる。
- **K2(軽微)** §2-4 の「rAF で回っているのはカメラと fx」の fx は `renderMap` を呼ばない(`fxTick` は `fxctx` の粒子だけ)。結論(フェード中は自前の rAF が要る)は変わらない。
- **K3 §2-5 の「`floorPattern` が非 null になった直後にハッシュを撮る」は不正確。** 実際の撮り方:
  - `driver_field_step1` / `_step1_geo` / `_step2` / `_step3` / `_step05_hud` / `driver_mapdef_step1` は `waitImages`(追跡した Image が全部 complete で、250ms 間隔の 3 回連続で変わらない)を待ち、パターンが非 null かを assert し、**`requestAnimationFrame` を空関数に差し替えて**から(`P.freeze`)、自分で `renderMap()` を呼んでハッシュを撮る。
  - `driver_field_verge_gap` は画像を待たず、`tilesetLoaded` → `startGame()` → **固定で 2500ms** 待ち → rAF を潰して → `?graph=0` で撮る(8 本の中でいちばん脆い)。
  - `driver_field_step1` は `performance.now = () => 0`。ほかの freeze 系は **`Date.now` / `new Date()` を T0 = 1700000000000 に固定**している。
  - ⇒ 閾値 1500ms の方針は維持でよい(撮る瞬間には余裕がある)。ただし項目2 は次を守ること。
    ① 到着時刻とアルファは **`performance.now()` で取る。`Date.now()` は使わない**(T0 = 1.7e12 ≥ 1500 になってフェードに入り、`(T0−T0)/300 = 0` = 盤面が消えて golden が赤くなる)。
    ② アルファは **時刻から導出する**(rAF のコマ数で積み上げない)。golden は rAF を潰した後で `renderMap()` を直接呼ぶので、時刻ベースなら 1 になる。
    ③ step1 は perf = 0 ⇒ 到着時刻も 0 ⇒ フェードしない(安全)。
- **K4(軽微)** §2-1 の `isPaintedAndLoaded` の行番号は `35ad1fc` でも 6593(表の 6629 は番地違い)。内容は正しい。
- **K5(参考)** 遅延なしでも `床2.png` は最初の約 300ms に描かれている(`drawImage` 60〜336 回・6 シナリオ全部)。速い回線でも 1〜2 コマは白い丸石が出ている。STEP1 が入ればこれも 0 回になるはず(§8 (1a) は遅延の腕だけを測るので、遅延なしの 0 回は受入の外。入れるかは項目3 で判断)。
- **K6(参考)** `caravan-road` は絵が 0 枚で、同じフォールバック枝(`床2.png`)を通る(遅延なしでも 126〜196 回)。§8 §1 の 6 シナリオに入っておらず、(0a) は「絵が 1 枚以上」を要求するので、そのままでは入れられない。床の規則(STEP1)はこのテーマにも効く。

#### 揃う時刻(遅延なし・`floorPattern` 非 null と全部の絵の loaded が揃った時刻・`performance.now()` ms)

| | goblin-mine | bandits-forest | dragon-lair | undead-temple | orc-fort | lizard-swamp |
|---|---|---|---|---|---|---|
| 390x844 3 回 | 314 / 330 / 334 | 360 / 364 / 329 | 324 / 299 / 306 | 307 / 308 / 377 | 330 / 311 / 287 | 329 / 321 / 324 |
| 1440x900 1 回 | 315 | 349 | 319 | 320 | 325 | 329 |

最大 377ms(依頼書の 451〜675ms より速い)。今日のこの機械は速いほう。過去の「約 2.6 倍遅い」状態でも 377×2.6 ≒ 980ms で、1500ms の内側。

#### 再現(遅延 4000ms・390x844・1500ms 時点)

| | floorPattern | floorTexLoaded | 絵 | 床2 drawImage | 盤面の平均輝度 / 明るい画素(L>120) | 6500ms |
|---|---|---|---|---|---|---|
| bandits-forest(2 回) | false | true | `n7_map.jpg:false` | 240 | 186.2 / 93.5% | 本来の床(輝度 59.3〜76.6) |
| orc-fort | false | true | `n4_map.jpg:false` | 180 | 186.2 / 93.5% | 本来の床(85.6) |

スクショ(1500ms)は iPhone の報告と同じ白い丸石。語りの枠も出ている(`narr:true`)。
⇒ §8 (1b) の閾値の材料: 白い丸石の盤面は平均輝度 **186.2**、落ち着いた盤面は 52〜86(遅延なし 1500ms: 鉱山 80.7 / 森 76.6 / 竜 52.4 / 神殿 79.1 / 砦 85.6 / 沼 66.0)。

#### 名指し golden 8 本 — 着手前の色(`e3ce2b0`・逐次・単独)

| 本 | exit | 要約 | 所要 |
|---|---|---|---|
| driver_field_step1 | 0 | 95/95 PASS | 74.5s |
| driver_field_step1_geo | 0 | 71/71 PASS | 102.2s |
| driver_field_step2 | 0 | 64/64 ALL PASS | 40.0s |
| driver_field_step3 | 0 | 65/65 ALL PASS | 70.0s |
| driver_field_step05_hud | 0 | 測定妥当性 6/6 PASS | 38.4s |
| driver_field_verge_gap | 0 | 39/39 ALL PASS | 25.5s |
| driver_mapdef_step1 | 0 | 208/208 PASS | 19.1s |
| driver_paint_blocked | 0 | PASS 65 / FAIL 0 | 7.1s |

合計 **376.8 秒(約 6.3 分)**。8 本とも `--negative` を持たない(`driver_mapdef_step1` / `driver_paint_blocked` は `--mutate` の口を持つ)。
⚠ post83 の走査では `driver_mapdef_step1` が 207/208(`(0b)` = baseline の worktree 登録。clone83 で走った環境由来)だったが、本番ツリーでは 208/208。

#### 母集団(項目4)

- `183a969` → `e3ce2b0` の差分は `実装依頼書/README.md` の 1 行だけ。`d7766d0` / `183a969` / `e3ce2b0` で `index.html` `491abf55…` / `tavern.html` `5030cb12…` / `audio.js` / `js/` / `tools/` / `assets/` のツリー OID が全部同じ。トップレベルで違うのは `実装依頼書/` だけ。
  ⇒ **post83(207 腕・#83 項目4 の `post83.tsv`)は着手前の色にそのまま流用できる**(走査し直さない)。
- 再利用できるもの(#83 の scratchpad `item4\`): 走行器 `sweep_83post.py` + `armlist_83post.json` + `run_all83post.ps1` / 比較 `cmp_83.py` / 対比較 `pair_83.py` + `fisher.py` / 影の作り方 `mkshadow_83.py`(#85 では `index.html` だけを `e3ce2b0` にした影でよい)。⚠ `clone83` / `shadow83` は `d7766d0` = 今の本番と同じ中身だが、`clone83` の `index.html` は #85 の実装後には古い ⇒ clone で走る腕は clone を作り直すか、本番で再走する。
- 床と絵の読み込みの時刻に敏感な本(画素ハッシュ / 描画コマンド / パターンを読む本。post83 の色):
  名指し 8 本(全部緑)+ `driver_field_scale`(緑)/ `driver_field_step6_png`(緑)/ `driver_field_step7`(golden・緑)/ `driver_paint_grid`(緑・`performance.now` を `_p0` に固定して撮る)/ `driver_wall_face`(golden・緑)/ `driver_wall_props`(緑)/ `driver_wallbox`(緑)/ `driver_grid_p7`(緑)/ `driver_doors_p2`(緑)/ `driver_grid_s2`(緑)/ `driver_mapdef_step2`(緑)/ `driver_graph_p7`・`driver_graph_reentry`(緑)/ `driver_mine_wall`(緑)/ `probe_paint_overlay`(exit 0)/ `verify_fort_fold`・`verify_swamp_fold`・`verify_swamp_novice`(素は緑・`--negative` は着手前から exit 3)/ `verify_swamp_lair` / `verify_road_ambush` / `verify_tower_mother`(緑)。
  ⚠ 着手前から非緑: `driver_mapeditor`(176/3)・`driver_mapeditor_painting`(105/1)= マップエディタのページで `index.html` の盤面ではない。

#### §5 (5a) の基準の推奨

**`35ad1fc` ではなく `e3ce2b0`(= #85 着手前)の `index.html` を `git show e3ce2b0:index.html` で配る。**
理由: `35ad1fc`→`e3ce2b0` で `index.html` は #83 により +283 行変わっている。(5a) が示したいのは「撤退すると #85 の直前の姿へ戻る」。`35ad1fc` と比べると #83 の差まで巻き込む(1500ms の森の盤面ではたぶん同じ画素だが、#83 の差を混ぜない理由が無い)。
⚠ blob は LF(41246 行)、作業ツリーは純 CRLF(CRLF 41246 = LF 41246)⇒ **配る前に CRLF へ戻す**(変異アンカーや配信バイトの照合を揃えるため)。

#### 項目2 への申し送り

1. K1: 絵の `onload` でも描画(フェードのループ)を起こす。床が先・絵が後の順でも絵が出ること。
2. K3: 到着時刻・アルファは `performance.now()`。`Date.now()` は禁止。アルファは時刻から導出し、rAF のコマ数で積まない。
3. 閾値 1500ms は今日の実測(最大 377ms)で十分に余裕がある。
4. `driver_field_verge_gap` は固定 2500ms 待ち + `?graph=0`。遅い機械で床がそれより遅れると、今も白い丸石を撮るし、直した後は暗い盤面を撮る(どちらも赤)。帰属の切り分けで思い出すこと。
5. 名指し 8 本の着手前はすべて exit 0(合計 6.3 分)。項目2 の後に同じ 8 本を回せばよい。
6. プローブは `item1/probe85.js`(`--jpgdelay` で絵だけ遅らせられる・`--mode 404`・`--q boardfade=0`・`--vp 1440x900`)。項目3 の受入へ同じ仕組みを移せる。

### 12-1. 項目2 — 本番実装

触ったのは `index.html`(+84 / −3 行)と `tavern.html`(changelog 1 行の入れ替え)だけ。行番号は実装後の `index.html`。

#### 変更箇所

| 何 | 行 | 中身 |
|---|---|---|
| 撤退・定数・フェードの係 | 3513-3547(予備床 `floorTex` の直前 = 床の読み込みより前) | `BOARD_FADE_ON`(`?boardfade=0` を 1 回読む・3521)/ `BOARD_FADE_MS = 300` / `BOARD_FADE_MIN_WAIT_MS = 1500`(3524)/ `boardFadeAlpha(at)` / `boardFadeActive()` / `boardFadeTick()` / `kickBoardFade()`(rAF は 3545 の 1 行だけ・フラグ `boardFadeLoopOn` 1 本) |
| 本来の床の印 | 3984-3985 | `floorPatternAt` / `floorTex1Failed` |
| `floorTex1.onload` / `onerror` | 4012-4019 | onload で `floorPatternAt = performance.now()` → `renderMap()` → `kickBoardFade()`。`onerror` を新設(4019・`floorTex1Failed = true` + 撤退でなければ `renderMap()`) |
| `addPainting` | 6524-(entry 6532-6533 / onload 6577-6582 / onerror 6583-6587) | entry に `failed: false` / `loadedAt: null`。onload でフェザー焼き後に `loadedAt = performance.now()`、`loaded = true` の後に **撤退でなければ `renderMap(); kickBoardFade();`**(K1)。onerror = `entry.failed = true;`(6585)+ 撤退でなければ `renderMap()` |
| `isPaintedPending(tx, ty)` | 6674-6685 | 絵の内側(`isPaintedTile`)で、覆う絵が loaded でも failed でもない。撤退時は常に false |
| `renderMap` Pass 1a | 9121 | `isPaintedPending` のマスは天井を敷かない |
| Pass 1b 共通 | 9131-9132 | `boardFloorWaiting = BOARD_FADE_ON && !floorPattern && !floorTex1Failed` |
| Pass 1b パターン枝 | 9137-9139 / 9156 | `floorFadeA = boardFadeAlpha(floorPatternAt)`。1 未満のときだけ `globalAlpha`(既存の save/restore の内側)。`isPaintedPending` のマスは塗らない |
| Pass 1b フォールバック枝 | 9161-9162 / 9169 | `} else {` → `} else if (!boardFloorWaiting) {`(9161)。`isPaintedPending` のマスは塗らない |
| Pass 1b.5 絵 | 9193-9202 | `paintFadeA = boardFadeAlpha(p.loadedAt)` が 1 未満のときだけ save / `globalAlpha` / drawImage / restore。1 なら従来の 1 行と同じ drawImage |

削除行は 3 行だけ(`git diff -U0 index.html | grep '^-'`): 空の `entry.img.onerror` / `} else {` / Pass 1b.5 の `drawImage` 1 行(同じ文が if/else の両枝に残る)。
当たり判定(`blocked` / `sealRing` / `paintedTileMask`)・壁(Pass 2 以降)・Pass 1b.6 以降は触っていない。

#### 決定事項の反映

- **K1**: 絵の onload で `renderMap()` + `kickBoardFade()`。⚠ 撤退(`?boardfade=0`)のときは呼ばない(撤退は「今と 1 画素も変えない」なので、K1 の直しごと外す)。床の onerror / 絵の onerror の `renderMap()` も同じく撤退時は呼ばない(印だけ立つが、撤退時は誰も読まない)。
- **K3**: 到着時刻は `performance.now()`。アルファは `boardFadeAlpha(at)` が毎回 `performance.now() - at` から出す(積算しない)。`Date.now()` は使っていない。rAF を潰した golden が自分で `renderMap()` を呼んでも、届いてから 300ms 過ぎていれば 1。

#### プローブ(`item2/probe85b.js` = 項目1 の probe85 に `--floordelay` / `--index <file>`(index.html の差し替え配信)/ `--fade`(揃った時刻 +100/+1000/+1500 で撮る)/ ハッシュを足したもの・port 10610・390x844)

| 確認 | 結果 |
|---|---|
| (a) 遅延 4000ms・1500ms | 森・砦とも `床2.png` の drawImage **0**、平均輝度 **10.0**(= `#0a0a0a`)、明るい画素 0%。`floorPattern:false` / `floorTexLoaded:true` / 絵 `loaded:false` |
| (b) 届いた後 | 森: tAll 4252 → +100ms 輝度 **39.2** / +1000ms **76.6** `51518e6eac42` / +1500ms 同ハッシュ。砦: +100 **41.5** / +1000・+1500 **85.6** `b515e82d2193`。強制 `renderMap()` で変わらない(`stale:false` = ループが最後の濃さまで描いて止まった) |
| (b)(2c) 遅延なしと一致 | 森 `51518e6eac42` / 砦 `b515e82d2193` = 遅延なしの落ち着いた盤面と同じ |
| (c) 遅延なし 6 シナリオ | 揃った瞬間 = +1000 = +1500 のハッシュが 6 本とも一致(tAll 309〜338ms)。さらに 1500ms のハッシュが **e3ce2b0 の index.html と 6 本とも一致**(鉱山 `2a15cdce8982` / 森 `51518e6eac42` / 沼 `c3d069dc96cd` / 砦 `b515e82d2193` / 神殿 `5e7e49b66259` / 竜 `34d93f43e2c9`)。`床2.png` の drawImage は 0(e3ce2b0 では 60〜140 = K5 も消えた) |
| (d) 床と絵を 404 | 森 200 回・砦 190 回 `床2.png` を描き、1500 / 3000ms とも輝度 186.2(予備床の盤面・永久に暗くならない) |
| (e) `?boardfade=0` + 遅延 4000 | 1500ms のハッシュ 森・砦とも `53fd14001932` = e3ce2b0 を配信した同じ腕と一致(白い丸石・drawImage 森 240 / 砦 180 = 旧と同数)。届いた後の最終も旧と同じ |
| (f) 床 3000・絵 5000(K1) | 森: 4000ms 輝度 20.1(床だけ・絵のマスは暗い)→ 7000ms 76.6 `51518e6eac42`(絵が描かれ、遅延なしと一致)。砦: 23.3 → 85.6 `b515e82d2193`。`stale:false` |
| (g) pageerror | 全腕 0 |

#### 名指し golden 8 本(実装後・逐次・単独)

| 本 | exit | 要約 | 所要 |
|---|---|---|---|
| driver_field_step1 | 0 | 95/95 PASS | 74.1s |
| driver_field_step1_geo | 0 | 71/71 PASS | 101.4s |
| driver_field_step2 | 0 | 64/64 ALL PASS | 39.8s |
| driver_field_step3 | 0 | 65/65 ALL PASS | 69.5s |
| driver_field_step05_hud | 0 | 測定妥当性 6/6 PASS | 44.0s |
| driver_field_verge_gap | 0 | 39/39 ALL PASS | 25.5s |
| driver_mapdef_step1 | 0 | 208/208 PASS | 18.9s |
| driver_paint_blocked | 0 | PASS 65 / FAIL 0 | 6.8s |

合計 380.0 秒。assert 数は 8 本とも着手前(§12-0)と同じ。

#### 改行

`index.html` CRLF 41246 → 41327(+81 = 追加 84 − 削除 3)・bare LF 0・bare CR 0。`tavern.html` CRLF 11357 → 11357(1 行入れ替え)・bare LF 0・bare CR 0。

#### 崩れ / 気づき

- **K7(仕様どおりに実装・項目4 で見ること)** 閾値はページの開始からの時刻なので、**分岐ノードへ入って絵を積み直したとき**(`buildNode` → `loadRoomPaintings`)は、キャッシュから数 ms で届いても `loadedAt ≥ 1500` になり、**絵が 300ms でフェードインする**(届くまでの数 ms は絵の内側が暗い)。§5 の式どおりの挙動で、見た目としても自然だと考えて変えていない(未計測)。ただし「ノードへ入った直後に画素を撮る」本があると、300ms 以内に撮れば途中の濃さを撮る。項目4 の母集団で緑→赤が出たらまずこれを疑う。別解(「その絵を読み始めてからの待ち時間」で閾値を見る)は依頼書の式から外れるので採っていない。
- K5 は STEP1 で消えた(遅延なしでも `床2.png` の drawImage 0)。

#### 項目3(受入)への申し送り — 変異アンカー(すべて `index.html` で 1 件だけ・複製しないこと)

| 変異 | 置換元(一意) | 置換先の例 |
|---|---|---|
| `fallback` | `      } else if (!boardFloorWaiting) {`(9161) | `      } else {` |
| `noloop` | `      requestAnimationFrame(boardFadeTick);`(3545) | `      /* noloop */` |
| `nogate` | `    const BOARD_FADE_MIN_WAIT_MS = 1500;`(3524) | `    const BOARD_FADE_MIN_WAIT_MS = 0;` |
| `nofail` | `    floorTex1.onerror = () => { floorTex1Failed = true; if (BOARD_FADE_ON) renderMap(); };`(4019)と `          entry.failed = true;`(6585)の 2 か所 | 前者 = `    floorTex1.onerror = () => {};` / 後者 = `          /* nofail */` |
| `nooff` | `    const BOARD_FADE_ON = new URLSearchParams(window.location.search).get("boardfade") !== "0";`(3521) | `    const BOARD_FADE_ON = true;` |

- ⚠ `nogate` は閾値 0 = 常にフェード。(3a) は「揃った直後」と「1000ms 後」を比べるので、揃った直後が途中の濃さになって赤くなるはず。
- ⚠ `nooff` を当てると `?boardfade=0` の腕でも暗いまま ⇒ (0c) の `床2.png` 計数が 0 になる。
- (5a) の基準は §12-0 の推奨どおり `git show e3ce2b0:index.html` を CRLF に戻して配る(プローブで実証済み = (e))。
- プローブ `item2/probe85b.js` の `--index` / `--fade` / ハッシュはそのまま移せる。

### 12-1b. 項目2b — 閾値を待ち時間へ(K7・ユーザー決定)

#### 決定(ユーザー・2026-10-05)

K7(§12-1)への答えは「**待ち時間で判定**」。フェードするのは「**その素材を読み始めてから届くまでの待ち時間が 1500ms を超えたとき**」だけ。クエスト開始時の挙動は項目2 と同じで、分岐ノードへ入って絵を積み直したときは、すぐ届けば従来どおりパッと出る。§5 の「アルファ: `at < BOARD_FADE_MIN_WAIT_MS` なら 1」は「`at − 読み始め < BOARD_FADE_MIN_WAIT_MS` なら 1」と読み替える(残りの式 `min(1, (now − at) / BOARD_FADE_MS)` はそのまま)。

#### 変更箇所(`index.html` +13 / −7・行番号は実装後)

| 何 | 行 | 中身 |
|---|---|---|
| `boardFadeAlpha(at, requestedAt)` | 3523-3531 | 判定を `at - (requestedAt \|\| 0) < BOARD_FADE_MIN_WAIT_MS` なら 1 へ(`<` のまま = `nogate` の 0 で常にフェード)。注記 2 行(K7・ユーザー決定) |
| `boardFadeActive()` | 3535-3536 | 床 = `boardFadeAlpha(floorPatternAt, floorRequestAt)` / 絵 = `boardFadeAlpha(p.loadedAt, p.requestedAt)` |
| 本来の床を読み始めた時刻 | 3987 / 4014 | `let floorRequestAt = null;` を新設し、`floorTex1.src = …` の直前で `floorRequestAt = performance.now();` |
| 絵を読み始めた時刻 | 6538 / 6593 | entry に `requestedAt: null`。`entry.img.src = src;` の直前で `entry.requestedAt = performance.now();` |
| Pass 1b / Pass 1b.5 | 9144 / 9200 | `boardFadeAlpha` へ読み始めの時刻を渡すだけ |

削除行 7 行の内訳 = 判定の if 1 行・関数の頭 1 行・呼び出し 4 行(引数を 1 つ足しただけ)・閾値の注記 1 行(`git diff -U0 index.html` で目視)。到着時刻(`floorPatternAt` / `entry.loadedAt`)・`?boardfade=0`・rAF ループ・暗いまま(STEP1)は触っていない。時刻は `performance.now()` だけで、積み上げもしない。
`tavern.html` は #85 の `<li>` の説明文だけを直した(1 行のまま・4 件のまま):「…一瞬見えていたのを直し、地図が届くまで盤面を暗く保つようにした。届くのに時間がかかったときは、暗い盤面から地図が浮かび上がる。」

#### (h) 分岐ノードへの入場(新設プローブ `item2b/probe85h.js`・port 10611・390x844・**キャッシュを許す配信**(`max-age=3600`)・揃った 4000ms 後に `enterNode(id)` を page 内で直接呼ぶ・`mapCanvas` 上の絵の drawImage の `globalAlpha` を全部記録)

| 腕 | 入場先 | 待ち時間(読み始め→到着) | 届いた直後 / +50 / +150 / +1000ms の `boardFadeAlpha` | 絵の drawImage(回数・最小アルファ・1 未満の回数) |
|---|---|---|---|---|
| 実装後・砦 | n7(初めて) | 19.6ms | 1 / 1 / 1 / 1 | 1 回・1・0 |
| 実装後・砦 | n4(再訪・キャッシュ = 配信 1 回だけ) | 4.9ms | 1 / 1 / 1 / 1 | 1 回・1・0 |
| **対照 a3e193e**・砦 | n7 | — | 0.027 / 0.204 / 0.534 / 1 | 20 回・**0**・19 |
| **対照 a3e193e**・砦 | n4(再訪) | — | 0.039 / 0.225 / 0.556 / 1 | 21 回・**0.002**・20 |
| 実装後・沼 | n6 / n7 | 20.0 / 10.1ms | 全部 1 | 各 1 回・1・0 |
| 実装後・砦・絵だけ遅延 2500ms | n7 | 2512ms | 0.029 / 0.195 / 0.544 / 1 | 20 回・0.001・19(= 遅いときはノードでもフェード) |

⇒ 項目2 の実装では入場直後のアルファが 1 未満(K7 の再現)、項目2b では入場直後から 1。pageerror 全腕 0。森(bandits-forest)は `RUN.byId` が n7 の 1 ノードだけなので入場の腕が立たない。

#### (i) 遅いときは従来どおりフェード

下の (b) が緑(床は読み込みの冒頭で読み始めるので、遅延 4000ms なら待ち時間も約 4000ms)+ 上の「絵だけ遅延 2500ms」の腕。

#### プローブ (a)〜(g) の再走(`item2/probe85b.js`・port 10610)

| 確認 | 結果(項目2 と同じか) |
|---|---|
| (a) 遅延 4000ms・1500ms | 森・砦とも `床2.png` 0 回・輝度 10・`31002f77b485` ○ |
| (b) 届いた後 | 森 +100 輝度 37.4 → +1000 / +1500 `51518e6eac42`。砦 +100 42.7 → `b515e82d2193`。`stale:false` ○(+100 の輝度は届いた時刻との位相で ±2 動く) |
| (c) 遅延なし 6 シナリオ | 揃った瞬間 = +100 = +1000 = +1500 = 1500ms のハッシュが 6 本とも項目2 と同じ値(鉱山 `2a15cdce8982` / 森 `51518e6eac42` / 沼 `c3d069dc96cd` / 砦 `b515e82d2193` / 神殿 `5e7e49b66259` / 竜 `34d93f43e2c9`)・`床2.png` 0 ○ |
| (d) 404 | 1500 / 3000ms とも輝度 186.2(森 250 回・砦 190 回 `床2.png`)○ |
| (e) `?boardfade=0` + 遅延 4000 | 1500ms のハッシュ 森・砦とも `53fd14001932`(e3ce2b0 と同じ)○ |
| (f) 床 3000・絵 5000 | 森 4000ms 20.1 → 7000ms `51518e6eac42`、砦 23.3 → `b515e82d2193` ○ |
| (g) pageerror | 全腕 0 ○ |

- **K8(既存・項目2b 由来ではない)** (e) の砦で「届いた後の最終盤面」が 6 回に 1〜2 回 `stale:true`(`c54f5c8de522` = 絵が届いたのに誰も描き直していない)。**e3ce2b0 の index.html を配っても同じ腕で出た**(`item2b/e_timing.txt` の交互 6 対: 着手前 1/6・実装後 0/6。それ以前の走行: 実装後 2/4・着手前 0/10・a3e193e 0/6 = 床と絵の到着順しだいの競合)。撤退時は K1 の直しごと外す決定(§12-1)なので、もとの K1 の競合がそのまま残っているだけ。撤退時の分岐は `BOARD_FADE_ON` が false で `boardFadeAlpha` が 1 を返す道しか通らず、項目2b の差分は関わらない。項目3 の (5a) は **1500ms の盤面**を比べるので影響しない。⚠ 届いた後の最終盤面を撤退の腕で比べる assert は作らないこと。

#### 名指し golden 8 本(実装後・逐次・単独)

| 本 | exit | 要約 | 所要 |
|---|---|---|---|
| driver_field_step1 | 0 | 95/95 PASS | 74.1s |
| driver_field_step1_geo | 0 | 71/71 PASS | 100.9s |
| driver_field_step2 | 0 | 64/64 ALL PASS | 39.8s |
| driver_field_step3 | 0 | 65/65 ALL PASS | 69.5s |
| driver_field_step05_hud | 0 | 測定妥当性 6/6 PASS | 44.2s |
| driver_field_verge_gap | 0 | 39/39 ALL PASS | 25.5s |
| driver_mapdef_step1 | 0 | 208/208 PASS | 18.8s |
| driver_paint_blocked | 0 | PASS 65 / FAIL 0 | 6.7s |

assert 数は 8 本とも §12-0 / §12-1 と同じ。

#### 改行

`index.html` CRLF 41327 → 41333(+6 = 追加 13 − 削除 7)・bare LF 0・bare CR 0。`tavern.html` CRLF 11357 → 11357(1 行の入れ替え)・bare LF 0・bare CR 0。

#### 項目3(受入)への申し送り

- **受入 §3 に分岐ノード入場の腕を足す提案**: (3b) 遅延なし・キャッシュを許す配信で、砦(`RUN.byId` = n4 / n7)の盤面が揃ってから `enterNode("n7")` → 絵が届いた直後の `boardFadeAlpha(p.loadedAt, p.requestedAt)` が 1、`mapCanvas` 上の絵の drawImage の `globalAlpha` が全部 1。続けて `enterNode("n4")`(再訪)でも同じ。`item2b/probe85h.js` の page 内の手順をそのまま移せる。⚠ 森は 1 ノードしかないので砦か沼(n4 / n6 / n7)を使う。⚠ 砦の n7 を 2500ms 遅らせた腕では 1 未満が出る(負のコントロールの代わりにもなる)。
- **変異アンカー表の更新**(§12-1 の表の置換元・置換先は 1 文字も変わっていない。行番号だけ +2〜+6・すべて `index.html` で 1 件だけ):

| 変異 | 置換元(一意) | 新しい行 |
|---|---|---|
| `fallback` | `      } else if (!boardFloorWaiting) {` | 9167 |
| `noloop` | `      requestAnimationFrame(boardFadeTick);` | 3547 |
| `nogate` | `    const BOARD_FADE_MIN_WAIT_MS = 1500;` | 3526 |
| `nofail` | `    floorTex1.onerror = () => { floorTex1Failed = true; if (BOARD_FADE_ON) renderMap(); };` / `          entry.failed = true;` | 4023 / 6590 |
| `nooff` | `    const BOARD_FADE_ON = new URLSearchParams(window.location.search).get("boardfade") !== "0";` | 3521 |

- ⚠ `nogate`(閾値 0)は判定が `<` なので、待ち時間がいくら短くても常にフェードする ⇒ (3a) も (3b) も赤くなるはず。
- 足すなら新しい変異 `noreq`(読み始めの時刻を渡さない = 項目2 の挙動へ戻す): 置換元 `      if (!BOARD_FADE_ON || at == null || at - (requestedAt || 0) < BOARD_FADE_MIN_WAIT_MS) return 1;` → 置換先は `(requestedAt || 0)` を `0` に。(3b) だけが赤くなり、(3a) は緑のまま(遅延なしの初回は 1500ms より前に届く)のはず。

### 12-2. 項目3 — 受入 `tools/verify_board_load_flash.js`

本番ファイルは 1 バイトも触っていない(新規はドライバ 1 本だけ)。基準 HEAD `dd085ad`。

#### 仕組み

- 内蔵 http サーバ・390x844・Chrome headless。ページは `/__arm/<id>/index.html` から開き(index.html の素材参照は相対 ⇒ 素材の URL にも腕の id が乗る)、腕ごとに配信条件(床 / 絵の遅延・404・index の版・キャッシュ)を切り替える。§2-3 の正規表現に当たる応答だけを `setTimeout` / 404。
- index.html は起動時に 1 回 readFileSync して凍結し、変異はメモリ上で置換(アンカーは原本で 1 件・注入文字列が原本に無い・行数不変・他の `tools/*.js` に同じアンカーが無い(罠E)を起動時に検算。崩れたら exit 3)。
- (5a) の基準は `git show e3ce2b0:index.html` を起動時に取り出して CRLF へ戻して配る(41246 行・影のツリーは作らない)。git が無い環境向けに `--base-index <file>` も持つ。
- 撮影はページ内の `setTimeout`(1500 / 3000ms と、揃った時刻 +100 / +1000 / +1500ms)。「揃った」= `floorPattern` 非 null かつ全部の絵が loaded(10ms 間隔の見張り)。画素は `#mapCanvas` だけを読む(HUD・語りの枠は入らない)。`drawImage` を包んで `床2.png` を描いた時刻を全部控える。
- 腕 27 枚: 遅延 4000ms(素 / `?boardfade=0` / e3ce2b0 の `?boardfade=0`)× 6 シナリオ + 遅延なし × 6 + 404(森)+ 入場(砦)+ 入場の対照(砦・絵 2500ms)。

#### assert(14)

| # | 中身 | 閾値・根拠 |
|---|---|---|
| (0a) | 遅延の 18 腕の 1500ms で `floorPattern === null`・絵 ≥1 枚で全部 `loaded === false` | 空振り防止 |
| (0b) | 同じ 18 腕で `floorTexLoaded === true` | — |
| (0c) | `?boardfade=0` + 遅延の 6 腕で 1500ms までに `床2.png` drawImage ≥1(実測 180〜240 回・e3ce2b0 と同数) | — |
| (0d) | 全 27 ページで pageerror 0(独自追加) | — |
| (1a) | 遅延 6 腕で 1500ms までの `床2.png` drawImage 0 回 | — |
| (1b) | 遅延 6 腕の 1500ms の平均輝度 ≤ **30** かつ同じ腕の `?boardfade=0` より **100** 以上低い | 実測: 暗い盤面 10.0(= `#0a0a0a`)/ 白い丸石 186.2(鉱山 186.6)/ 落ち着いた盤面 52〜86。30 は落ち着いた盤面の最小 52 より下、100 は差 176 の約 57% |
| (2a) | 森・遅延: 揃った +100ms の輝度が 1500ms(暗い)+5 より上、+1500ms(落ち着いた)−5 より下 | 実測 10 < 40.1〜40.4 < 76.6 |
| (2b) | 森・遅延: +1000ms と +1500ms のハッシュ一致 **かつ** その後の強制 `renderMap()` で盤面が変わらない | ⭐ 強制描画の比較が無いと `noloop` で「途中の濃さのまま 2 枚一致」して緑になる(実測 13.2 で止まる) |
| (2c) | (2b) の盤面 = 遅延なしの森の +1000ms(`51518e6eac42`) | — |
| (3a) | 遅延なし 6 シナリオ: 揃った瞬間 = +1000ms のハッシュ、揃う時刻 < 1500ms(実測 237〜261ms) | — |
| (3b) | 砦・遅延なし・`max-age` 配信: 揃った後(4000ms)に `enterNode("n7")` → `enterNode("n4")`(開始ノード = n4 の再訪)。両方とも積み直した絵(`requestedAt` ≥ 入場時刻)の待ち時間 < 1500ms(実測 n7 22〜26ms / n4 10〜12ms)・入場直後 / +50 / +150 / +1000ms の `boardFadeAlpha` が全部 1・`#mapCanvas` への絵の drawImage ≥1 回で globalAlpha < 1 が 0 回。**対照**: 絵だけ 2500ms 遅らせた別ページの `enterNode("n7")` で待ち > 1500 かつ globalAlpha < 1 が出る | K7 / ユーザー決定の受入 |
| (4a) | 森・床と絵を 404: 3000ms までに `床2.png` drawImage ≥1(実測 200 回・204〜220ms) | ⚠ K9 |
| (4b) | 同じ腕の 3000ms の輝度が §1 の森の暗い盤面より 100 以上高い(実測 186.2 vs 10) | — |
| (5a) | `?boardfade=0` + 遅延の 1500ms のハッシュ = e3ce2b0 を配った同じ腕(6 シナリオとも一致: 鉱山 `decbfbbaa3b3` / 他 5 本 `53fd14001932`) | ⚠ K8 に従い届いた後の最終盤面は比べない |

#### 担当表(`--mutate` で 1 本ずつ実走して決めた・`--negative` 2 回とも同じ集合)

| 変異 | 置換 | 依頼書の予想 | 実際の赤(= NEG_EXPECT) |
|---|---|---|---|
| `fallback` | `} else if (!boardFloorWaiting) {` → `} else {` | (1a)(1b) | **(1a)(1b)(2a)** |
| `noloop` | `requestAnimationFrame(boardFadeTick);` を消す | (2b)(2c) | **(2a)(2b)(2c)** |
| `nogate` | `BOARD_FADE_MIN_WAIT_MS = 0` | (3a)(+3b) | (3a)(3b) |
| `nofail` | `floorTex1.onerror` を空に + `entry.failed = true;` を消す | (4a)(4b) | (4a)(4b) |
| `nooff` | `BOARD_FADE_ON = true` | (0c)(5a) | **(0c)(1b)(5a)** |
| `noreq` | `(requestedAt \|\| 0)` → `0` | (3b) | (3b) |

予想より広い分の理由(すべて連鎖で決定的・NEG_MAYBE は 6 本とも空):
- `fallback` の (2a): 比較の「暗い時点」= 同じ森の腕の 1500ms が予備床で 45.9 に上がり、+100ms(37.2)が下回る。
- `noloop` の (2a): 届いた瞬間の 1 コマ(輝度 13.2)のまま止まり、+100ms と +1500ms が同じ 13.2 = 余白が無い。
- `nooff` の (1b): 比較相手の `?boardfade=0` の腕も暗くなる(10 vs 10)。

#### 所要(この機械・2026-10-05)

| 走行 | 結果 | 所要 |
|---|---|---|
| 素 1 回目(担当表の修正前・assert は同じ) | 14/14 exit 0 | 63.7 秒 |
| 素 2 回目 | 14/14 exit 0 | 63.6 秒 |
| 素 3 回目 | 14/14 exit 0 | 63.7 秒 |
| `--negative` 1 回目 | 6/6 検出・exit 0 | 442.6 秒(素の基準 + 変異 6 本 × 約 63 秒) |
| `--negative` 2 回目 | 6/6 検出・exit 0 | 446.5 秒 |

#### 崩れ

- **K9 §8 (4a) の「1500ms 以降に `床2.png` の drawImage が 1 回以上」は成り立たない。** 404 は 200ms 台で確定し、予備床はそのときの描画(204〜220ms・200 回)だけで、以後は描き直されない(静止盤面。1500ms 以降は 3 回とも 0 回)。製品の欠陥ではない(盤面は 1500 / 3000ms とも輝度 186.2 = 予備床が見えている)。⇒ (4a) は「3000ms までに 1 回以上」で測り、「見えている」は (4b) の輝度で押さえた。`nofail` では 0 回・輝度 10 で赤くなる。
- **K10 鉱山(goblin-mine)では `fallback` を単独で検出できない。** `fallback` を当てても鉱山の遅延の腕は 1500ms で `床2.png` 0 回・輝度 10。開始ノードの絵が画面全体を覆っており、待っている絵のマスは `isPaintedPending` で塗らないので、フォールバック枝の出番が画面内に無い。他の 5 シナリオは 30〜40 回・輝度 45.9 で赤。assert は 6 シナリオの AND なので受入としては効いている。⚠ 鉱山だけで受入を組み直すと空振りする。
- (参考)`fallback` 下の暗い盤面は 186 でなく 45.9: 絵の下のマスは `isPaintedPending` が守るので、予備床が出るのは絵の外側だけ。
- (参考)K5 は受入の外に置いた(遅延なしの `床2.png` 0 回は (3a) の detail に `fb2` として出しているが assert にはしていない。6 シナリオとも 0)。

#### 次の新規ドライバ base

**10574**(素 10567・変異 10568〜10573 を使用)。

#### 項目4(母集団)への申し送り

1. `tools/verify_board_load_flash.js` を母集団に足す(素 約 64 秒・14 assert。`--negative` は約 445 秒)。⚠ git を読む(`git show e3ce2b0:index.html`)ので、影のツリー / clone で走らせるときは `--base-index <CRLF の e3ce2b0 版>` を渡すか、e3ce2b0 を含む clone で走らせる。基準ファイルに `BOARD_FADE_ON` が在る / 配信する index.html に無いと exit 3。
2. 影のツリー(`index.html` だけ e3ce2b0)で走らせると、このドライバ自身は配信の index.html に `BOARD_FADE_ON` が無いので exit 3 で止まる(= 着手前の色は「装置停止」。緑→赤の帰属の対象外)。
3. ポートは 10567〜10573 の 7 個。母集団を並列で回すときは他のドライバと重ならないこと。
4. 名指し 8 本 + post83 の母集団の再走は項目4 の仕事(本項目では走らせていない)。
