# #85 クエスト開始時に白い石床が一瞬見える — 読み込み中は暗く、届いたらフェードイン

- **起草**: 2026-10-04(起草窓 claude-27) / **ステータス**: **承認済**(2026-10-04 ユーザー承認)
- **着手**: ⏸ **保留 — #83 塔の母 B の完了待ち**(同じ `index.html` を実装窓が dev-loop で編集中)。README の #85 行も #83 着地後に足す(文面は §11)。
- **触るファイル**: `index.html`(描画の 2 か所 + 読み込みの 3 か所)/ `tools/verify_board_load_flash.js`(新規)
- ⛔ **着手の順番**: 実装窓が **#83 塔の母 B** を dev-loop で実装中(`index.html` / `tavern.html` を触る)。
  本チケットも `index.html` を触る ⇒ **着手は #83 の完了後**。行番号は #83 で必ず動くので、着手時に §2 を測り直すこと。
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

(実装窓が埋める)
