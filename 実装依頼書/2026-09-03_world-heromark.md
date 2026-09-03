# #43 ワールドマップでも主人公の頭上に ▽ を出す

- **起草**: 2026-09-03(計画窓) / **ステータス**: **完了**(2026-09-03)
  `d4db293`(項目1)+ `1d076db`(項目2)+ `6ac5653`(項目3)+ **本コミット**(項目4)。
  `verify_world_heromark` **18/18 PASSED FAILED 0 PENDING 0** / `--negative` **24/24**(変異 7 本・**空振り 0**)/
  既存 golden **7 本すべて非退行・期待値の変更 0 件**。実装結果の全文は **§12**。
  ⚠ **push は未実施**(dev-loop の orchestrator が実施 → push した窓がこの行と README を直すこと)。
- **着手前の再実測**(2026-09-03): 依頼書が指す 7 行を測り直し、**2 件が 1 行ずれていた**ので訂正済
  (`:491`→**`:492`** 撤退スイッチの挿入点 / `:1075`→**`:1074`** `heroGeom:` の行)。
  残り 5 件(`:325` `.worldSign` / `:443` `#worldHero` の DOM / `:501` `SHEET_ROW_RIGHT` /
  `:509` `var elHero` / `:617` `elShadow.style.top`)は**そのまま正しい**。
- **触るファイル**: `world.html` / `tools/verify_world_heromark.js`(新規) / `実装依頼書/README.md`(#43 行)
- ⛔ **触らないファイル**: `index.html` / `town.html` / `tavern.html` / `js/world-map.js` /
  `tools/driver_heromark_signplate.js`
  — §2 と §3 で「これらを**一度も開かずに完了できる**」ことを確認済み。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- **並走**: 2026-09-03 07:50 時点で `git status --short` は**空**。隣窓 `claude-2e` の #41 STEP4 は
  `2c9f638` で着地済み、`HEAD = origin/main = c1c85e0`。⚠ 着手時にもう一度 `git status` を見ること。

---

## 1. 目的

ワールドマップ(`world.html`)を歩いていると、**自分の駒がどれか一瞬で分からない**。
地図の絵に集落や森が描き込まれており、街道には点線の点(直径 6px)・止まれる点(13px)・
拠点(17px)が並び、拠点には羊皮紙の札が立っている。そこへ 96px の人物スプライトが 1 体だけ居る。

ダンジョン(`index.html`)と街(`town.html`)には**既に頭上マーカー ▽ がある**(#15)。
ワールドマップだけ無い。同じ ▽ を出す。

**ユーザー原文(2026-09-03)**:

> ワールドMAPを歩くときも、ダンジョン内と同様に、頭の上に→表示が欲しい

**解釈の確定(この窓の判断)**:

- 「→」= **ダンジョンと同じ ▽**(下向きの金色の border 三角 `#ffd24a`)。
  根拠 = ユーザー自身が「**ダンジョン内と同様に**」と書いている。既存の実体は `#heroMark` で
  形は ▽。⛔ **右向きの矢印を新規に作らない**(3 ページで見た目が割れる)。
- 出すのは**常時**(歩いている間だけではない)。街もダンジョンも常時。
- ⭐ 不採用にした案: 「駒だけ明滅させる」「駒に輪郭を付ける」——
  どちらも**既に 2 ページで確立している語彙 ▽ を 3 ページ目だけ変える**ことになる。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ▽ の実体はリポジトリ全体で **2 枚だけ**

`grep -rniE 'heromark' --include=*.html --include=*.js .` の実出力から、**実装の実体**だけを抜いた表:

| ファイル:行 | 何 |
|---|---|
| `index.html:914-928` | `#heroMark` の CSS(`--hm-w: 9px` / `--hm-h: 13px` / `#ffd24a` / z-index 8 / `pointer-events: none`) |
| `index.html:929` | `@keyframes heroMarkBob`(`margin-top` 0 → 4px) |
| `index.html:3036` | `<div id="heroMark"></div>` |
| `index.html:6202-6212` | `HERO_MARK_ON`(`?heromark=0`)/ `_heroMarkEl` / `HERO_MARK_HALF_W = 9` / `HERO_MARK_DY = -50` |
| `index.html:6214-6240` | `heroMarkTarget()` / `updateHeroMark()` |
| `index.html:6242-6248` | 検証シーム `window.__heroMark` |
| `town.html:209-223` | `#townHeroMark` の CSS(同じ 9/13/`#ffd24a`、**z-index 5**)+ 同じ `heroMarkBob` |
| `town.html:371` | `<div id="townHeroMark"></div>` |
| `town.html:418-426` | 撤退スイッチ `?heromark=0` |
| `town.html:470-471` | 要素取得 + 撤退時の `remove()` |
| `town.html:499` | `var HEAD_TOP = 32, HM_GAP = 8, HM_W = 9, HM_H = 13;` |
| `town.html:526-531` | `placeHero()` の中で ▽ を置く 2 行 |
| `town.html:781-785` | 検証シーム `__town.heroMarkOn` / `__town.heroMarkGeom` |

**`world.html` は 0 件**(同じ grep で 1 行もヒットしない)。
主人公は `#worldHero`(`world.html:163-176` CSS / `:443` DOM / `:509` 要素取得)。

**再測定コマンド**:

    grep -rniE 'heromark' --include=*.html --include=*.js . | grep -v node_modules

### 2-2. ⚠⚠⚠ 罠 — `verify_world_map` の (7f) は「**96px セルの矩形**」で札の遮蔽を測っている

`tools/verify_world_map.js:515-543`(実出力から引用):

```js
  m.cover = await page.evaluate(() => {
    const g = WD.heroGeom();                       // { sprite, foot, rowRight }
    ...
      const hx = n.x - g.sprite / 2, hy = n.y - g.sprite * g.foot;
      for (const s of signs) {
        const ow = Math.max(0, Math.min(hx + g.sprite, s.x + s.w) - Math.max(hx, s.x));
        const oh = Math.max(0, Math.min(hy + g.sprite, s.y + s.h) - Math.max(hy, s.y));
        rows.push({ ..., ratio: area > 0 ? (ow * oh) / area : 1 });
```

- (7f) は「全 14 ノードに立ったときの**駒の矩形**が、どの札も 10% 以上は隠さない」。
  その矩形は **`n.x - 48, n.y - 89.28` から 96x96** = スプライトの箱そのもの。
- ⭐⭐⭐ **▽ がこの箱の内側にある限り、(7f) の保証はそのまま ▽ にも効く。**
- ⚠⚠⚠ 逆に、▽ を箱の**外**(頭上へさらに離す)へ出すと、**(7f) は永久に気づかない**
  ——(7f) が見るのは `heroGeom()` から計算した箱であって、▽ の DOM ではないから。
  同様に `verify_world_map.js:970` の `heroInside`(駒が画面内)も `#worldHero` の矩形しか見ない。

⇒ **だから受入条件 (1b) に「▽ の矩形が主人公の 96px 箱に完全に含まれる」を置き、
変異 `markbox` で機械証明する。** この罠が §8 の負のコントロールに翻訳された形。

### 2-3. 幾何の実測 — ▽ は主人公の箱の内側に **11px 余って**収まる

町(`town.html:526-531`)の式をそのまま持ってくると、ノード座標 `(cx, cy)` に対して:

| 値 | 式 | 実数 |
|---|---|---|
| 駒の箱 上端 | `cy - SPRITE * FOOT` = `cy - 96 * 0.93` | **cy − 89.28** |
| 頭の天辺 | 箱上端 + `HEAD_TOP`(32) | cy − 57.28 |
| ▽ の下端 | 頭の天辺 − `HM_GAP`(8) | cy − 65.28 |
| ▽ の上端 | ▽ 下端 − `HM_H`(13) | **cy − 78.28** |
| ▽ の左右 | `cx ± HM_W`(9) | cx − 9 … cx + 9 |

- **箱の上端(cy−89.28)と ▽ の上端(cy−78.28)の余白 = 11.00px。**
  bob は `margin-top` を 0 → +4px = **下へ**動かすので、余白は 11.0〜15.0px。⇒ **常に箱の内側**。
- 横も `cx ± 9` ⊂ `cx ± 48` なので内側。

**札との間隔も 1 バイトも動かさなくてよい**:

- `.worldSign` は `bottom: calc(100% + 76px)`(`world.html:325-327`)、親 `.worldNode` は
  `translate(-50%,-50%)` の 44px 角(`:209-214`)→ 親の下端 = `cy + 22`
  → **札の下端 = (cy+22) − (44 + 76) = cy − 98**
- ▽ の上端 cy−78.28 との間隔 = **19.72px**(bob で最大 23.72px)。重ならない。
- ⭐ `world.html:326` の 76px は「駒の上端 −89.3、親の上端 −22 → G ≥ 67.3、余白 8 で 76」と
  **駒の箱から導かれている**。▽ が箱の内側なので **76px は据え置きでよい**。
  ⛔ この依頼書で 76 → 104 へ動かさない(それは #42 の実機体感 5 の別件)。

**`HEAD_TOP = 32` の再測定**(town.html の値を信じずに測り直した / PIL, 6 職 × row3 × 6 コマ):

| クラス | シート | row3 の 6 コマの頭上端 | 最小 |
|---|---|---|---|
| warrior | 576x384 (cell 96) | 33, 32, 32, 32, 32, 32 | 32 |
| dwarf | 〃 | 34, 38, 33, 32, 35, 34 | **32** |
| elf | 〃 | 33, 33, 33, 33, 33, 33 | 33 |
| cleric | 〃 | 34, 34, 34, 34, 34, 34 | 34 |
| mage | 〃 | 32, 33, 33, 32, 32, 33 | 32 |
| rogue | 〃 | 33, 36, 33, 32, 33, 33 | 32 |

⇒ **全体の最小 = 32**。`town.html:499` の `HEAD_TOP = 32` は正しい。
⚠ ただし `town.html:497` のコメントは dwarf を **33** と書いているが実測は **32**。
結論(32)は変わらないので **town.html は直さない**(⛔ 触らないファイル)。

⭐ `world.html:499-501` は `SPRITE = 96` / `FOOT = 0.93` / `SHEET_ROW_RIGHT = 3` を既に持っており、
シートも `assets/<class>_walk.png` の row 3(`:569`)で **街と同一**。
だから `HEAD_TOP = 32` をそのまま使える。

**計測コマンド**(再測定するとき):

    py -c "
    from PIL import Image
    for k in ['warrior','dwarf','elf','cleric','mage','rogue']:
        im=Image.open('assets/%s_walk.png'%k).convert('RGBA'); W,H=im.size; cell=W//6
        tops=[im.crop((f*cell,3*cell,(f+1)*cell,4*cell)).split()[3].getbbox()[1] for f in range(6)]
        print(k, tops, min(tops))
    "

### 2-4. z-index の地図 — ⛔ town.html の「5」を写経してはいけない

`grep -n 'z-index' world.html` / `town.html` の実出力:

| 層 | `world.html` | `town.html` |
|---|---|---|
| 背景 / 経路 | 0, 1 | 1, 2 |
| 影 | 2 (`#worldHeroShadow`) | 2 |
| 刻み点 | **3** (`.worldStep`) | — |
| 主人公 | **5** (`#worldHero`) | **3** (`#townHero`) |
| 札 / 看板 | **4** (`.worldNode`) | **4** (`.townSign`) |
| ▽ | (無い) | **5** (`#townHeroMark`) |
| タイトル帯 | 10 | 10 |
| 確認ダイアログ | 20 | 11 |

⚠⚠ **並びが違う。** 街は「主人公 3 < 札 4 < ▽ 5」だが、世界地図は
「刻み点 3 < 札 4 < **主人公 5**」(`world.html:171-175` が「拠点マーカーが足元に重なるので
主人公を上へ出す」と明記)。
⇒ ▽ は **z-index 6**(主人公の 1 つ上・タイトル帯 10 の下)。⛔ 5 と書くと主人公と同値になる。

### 2-5. 位置の出所は `placeHero` **ただ 1 本**

`grep -n 'elHero\.' world.html` の実出力 = `:569`(背景画像)/ `:612` `:613` `:614` `:615`。
**座標を書くのは `:612-613` の 2 行だけ**で、どちらも `placeHero()`(`world.html:610`)の中。
呼び口は `:619`(初期)/ `:836`(layout 後)/ `:864`(歩行の rAF)/ `:1089`(シーム設置後)の **4 箇所**。

⇒ ▽ もここへ 2 行足す。⛔ 別の場所から書かない(`town.html:522-525` の警告と同じ:
位置の出所を 2 つ持つと**歩くと ▽ だけ取り残される**が静かに起きる)。

### 2-6. `pointer-events: none` は必須(既存 golden 3 本・assert 5 本が前提にしている)

`tools/verify_world_map.js:62-63` が明記:

> (7d) は **札の中心の elementFromPoint** だけを見るので、札を再センタリングしても
> **両方緑のまま戻る**(主人公は pointer-events: none なので elementFromPoint には永久に写らない)。

`world.html:206-207` も「この要素より上に pointer-events を持つ物を重ねないこと
(`#worldHero` / `#worldHeroShadow` / `#worldGoal` は全部 `pointer-events: none`)」と書いている。

▽ に付け忘れると壊れるもの(全部実在の assert):

| ドライバ | assert | 何を測っている |
|---|---|---|
| `verify_world_map` | (7d) `:1733` | 札の中心の `elementFromPoint` が自分自身か子孫 |
| `verify_world_map` | (3b) `:797` / (3c) `:784` | ノードを実際にクリックして歩く / 線の無い所は動かない |
| `verify_world_steps` | (2c) `:1246` | 刻み点マーカー中心の `elementFromPoint` |
| `verify_world_steps` | (2d) `:1283` | 札ごとに**中心 + 四隅の内側 8px の 5 点** |
| `verify_quest_walk` | (3e) `:1429` | 7 枚の札の中心の `elementFromPoint` |

### 2-7. 撤退スイッチは既存の **`?heromark=0`** を再利用する(新しい名前を作らない)

「同名だが各ページが独立に読む」作法が既に 2 ページで確立している:

- `index.html:6202-6205` … `const HERO_MARK_ON` + コメント「town.html の同名スイッチとは**独立**」
- `town.html:418-426` … `var HERO_MARK_ON` + コメント「index.html 側で**独立に**読む」

⇒ `world.html` を 3 枚目として足す。⛔ **sessionStorage へ写さない**
(`?world=0` `:484-491` / `?walkstep=0` `:727-734` は sessionStorage 型だが、
それは**遷移をまたぐ必要があるから**であって、▽ はページ内で完結する)。

### 2-8. changelog は **鳴らない**(⛔ 鳴らすために `tavern.html` を開かない)

`scripts/hooks/check_changelog.py:24` の実出力:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

`world.html` は非トリガー。
**前例**: #42 の 4 コミット(`3c632d6` / `f4ccc37` / `180f20d` / `d2c0d12`)と追補 `f8b07d3` は
`world.html` / `js/world-map.js` / `tools/*` だけを触り、**changelog 追記なしで通っている**
(`git show --stat` で確認)。

⚠ CLAUDE.md の「⭐⭐⭐ プレイヤーに見える変化が 1 つも無いのにトリガー 3 ファイルを触る設計は
採らない」は**逆方向の縛り**であって、「見える変化があるならトリガー外でも書け」ではない。

### 2-9. 既存 golden の当日値(**2026-09-03 に全部走らせた実測**)

| ドライバ | 実測 | 測定日 |
|---|---|---|
| `tools/verify_world_map.js` | **57/57 PASSED FAILED 0 PENDING 0** | 2026-09-03 |
| `tools/verify_world_steps.js` | **33/33 PASSED FAILED 0 PENDING 0** | 2026-09-03 |
| `tools/verify_quest_walk.js` | **25/25 PASSED FAILED 0 PENDING 0** | 2026-09-03 |
| `tools/verify_town_exit.js` | **素 23/23 PASSED (PENDING 0)** | 2026-09-03 |
| `tools/driver_heromark_signplate.js` | **46 / 46** | 2026-09-03 |
| `tools/verify_title_screen.js` | 86/86(#42 の記録。今回は未実行) | 2026-09-02 |
| `tools/verify_tavern_map.js` | 43/43(#42 の記録。今回は未実行) | 2026-09-02 |

⭐ 上 5 本は**今日この窓が実際に走らせて exit 0 を確認した**。下 2 本は #42 の記録のまま
(`world.html` を読むが ▽ には触れないので優先度が低い。着手時に一度は走らせること)。

**再測定コマンド**:

    for d in verify_world_map verify_world_steps verify_quest_walk verify_town_exit \
             driver_heromark_signplate verify_title_screen verify_tavern_map; do
      echo "=== $d ==="; node tools/$d.js 2>&1 | tail -4; done

### 2-10. ポートの空き

`tools/*.js` の `arg('port', 'NNNN')` を全部数えた結果、9400 番台以降の使用中は
9412 / 9440 / **9451**(driver_heromark_signplate、+4 まで) / 9460 / 9470 / 9480 /
9530 / 9540 / 9573 / 9600。
⇒ **base 9490 / 変異 9491〜9500 が空き**(#41 = 9573〜9586、#42 = 9600〜9615 と非衝突)。

    grep -rhoE "arg\('port', '[0-9]+'\)" tools/*.js | grep -oE '[0-9]{4}' | sort -n | uniq -c

### 2-11. 改行コード

`py` でバイトを数えた実測:

| ファイル | bytes | CRLF | LF 単独 |
|---|---|---|---|
| `world.html` | 71042 | **1093** | 0 |
| `tools/driver_heromark_signplate.js` | 43347 | 0 | **730** |

⇒ `world.html` は **CRLF**。Python で置換するなら `io.open(..., newline="")` で読み書きする。
⚠ 変異の置換文字列は**必ず 1 行に閉じる**(既存ドライバのコメントどおり、
CRLF/LF 混在で複数行アンカーは必ず空振りする)。⚠ `python` は Windows Store のスタブ = **`py`** を使う。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `world.html` | ① CSS ブロック `#worldHeroMark` + `@keyframes heroMarkBob` ② `<div id="worldHeroMark">` を `#worldHero` の直後へ 1 行 ③ 撤退スイッチ `?heromark=0`(5 行)④ `HEAD_TOP / HM_GAP / HM_W / HM_H`(1 行 + コメント)⑤ 要素取得 + 撤退 remove(2 行)⑥ `placeHero()` に 4 行 ⑦ 検証シーム 2 キー |
| `tools/verify_world_heromark.js` | **新規**。base port 9490 |
| `実装依頼書/README.md` | #43 の行を 1 行追加(文面は §11。**実装が着地してから**) |

⛔ `index.html` / `town.html` / `tavern.html` / `js/world-map.js` /
`tools/driver_heromark_signplate.js` は**開かない**。§2 で「開く必要が無い」ことを確認済み。

### ⭐ なぜ新規ドライバなのか(既存 `driver_heromark_signplate.js` を 3 ページ目へ拡張しない理由)

拡張案も検討したうえで**却下**した。理由は 3 つ:

1. 既存ドライバは `MUT_TARGETS = ['town.html', 'index.html', 'js/town-map.js']` を起動時に
   **凍結**し(`:110`)、4 変異のアンカーを**逐語で**握っている(`:66-100`)。
   ⚠⚠⚠ #39 の教訓 = **既存ドライバの逐語アンカーに触ると、赤ではなく `exit 3` で
   ドライバごと死ぬ**。46/46 は他 5 チケットの非退行基準でもある。
2. world ページの起動作法(`localStorage` の `partyComposition` / `sessionStorage` の
   `exitVia` peek / `clientFromNode` / 5 点 `elementFromPoint` / 配信バイト凍結 + `--negative` 内蔵)は
   **`tools/verify_world_steps.js` に全部そろっている**。既存ドライバは town/dungeon の
   起動作法しか持っていない。
3. #34〜#42 の 9 チケット連続で「新 driver + 既存 golden 非退行」の型で回っている。

⇒ **`tools/verify_world_heromark.js` を新規作成。流用元 = `tools/verify_world_steps.js`。**
既存 `driver_heromark_signplate.js` は **46/46 のまま非退行**として走らせる。

---

## 4. STEP1 — CSS と DOM(見た目を出す)

**① `world.html` の CSS**。置き場所は `.worldSign` ブロックの手前(`:325` の直前あたり)。

```css
    /* ── 自キャラの ▽ (依頼書 #43) ──────────────────────────────────────
       ⭐ 見た目は town.html の #townHeroMark / index.html の #heroMark と **同じ**
         (border 三角 / #ffd24a / 同じ bob)。⛔ 絵文字 ▽ や文字で描かない
         —— ステージの scale(zoom) の中に居るので、文字だと輪郭が崩れる。
       ⚠⚠ pointer-events: none が必須。#worldHero と同じ理由 (依頼書 §2-6)。
         付け忘れると verify_world_map (7d)(3b)(3c) / verify_world_steps (2c)(2d) /
         verify_quest_walk (3e) の 5 本が壊れる。
       ⚠ z-index 6 = 主人公 (5) の 1 つ上・タイトル帯 (10) の下。
         ⛔ town.html の 5 を写経しない —— 街は「主人公 3 < 札 4 < ▽ 5」だが、
            世界地図は「刻み点 3 < 札 4 < 主人公 5」で **並びが違う** (依頼書 §2-4)。
       ⚠ --hm-w / --hm-h は JS の HM_W / HM_H と一致させること
         (装置 assert (0b) が実描画の矩形と突き合わせて写経ミスを殺す)。 */
    #worldHeroMark {
      --hm-w: 9px;        /* 三角の半幅 (JS の HM_W と一致) */
      --hm-h: 13px;       /* 三角の高さ (JS の HM_H と一致) */
      --hm-color: #ffd24a;
      position: absolute;
      width: 0; height: 0;
      border-left: var(--hm-w) solid transparent;
      border-right: var(--hm-w) solid transparent;
      border-top: var(--hm-h) solid var(--hm-color);
      filter: drop-shadow(0 0 2px #000) drop-shadow(0 2px 3px rgba(0,0,0,0.8));
      pointer-events: none;
      z-index: 6;
      animation: heroMarkBob 1.2s ease-in-out infinite;
    }
    @keyframes heroMarkBob { 0%, 100% { margin-top: 0; } 50% { margin-top: 4px; } }
```

**② DOM**。`world.html:443` の `<div id="worldHero"></div>` の**直後**へ 1 行:

```html
      <div id="worldHeroMark"></div>
```

⚠ `#worldStage` の子として置く(ステージの `scale(zoom)` に一緒に乗る)。
⛔ `#worldViewport` の直下や `position: fixed` にしない。

---

## 5. STEP2 — 位置と撤退(歩いても付いてくる)

**③ 撤退スイッチ**。`world.html:492`(`if (worldOff) { location.replace("town.html"); return; }`)
の**直後**、`var WM = window.WORLD_MAP;`(`:494`)の手前へ:
⚠ 起草時は `:491` と書いていたが、着手前の再実測で **`:492`** が正しかった(`:491` は 1 行手前の `try {...}`)。

```js
    /* ══ 撤退スイッチ ?heromark=0 (依頼書 #43 §7) ═══════════════════════════
       ⚠ index.html:6204 / town.html:425 と **同名**だが、読むのは各ページが独立。
         クエリはページ遷移をまたがない = それが仕様 (#15 §7 が明示的に了承済み)。
       ⛔ sessionStorage へ写さない (?world=0 / ?walkstep=0 の型ではない —— あちらは
          遷移をまたぐ必要があるから写しているだけで、▽ はページ内で完結する)。
       ⛔ ?world=0 / ?questwalk=0 / ?walkstep=0 と相乗りさせない。 */
    var HERO_MARK_ON = true;
    try {
      if (new URLSearchParams(location.search).get("heromark") === "0") HERO_MARK_ON = false;
    } catch (e) {}
```

**④ 幾何の定数**。`world.html:501`(`var SHEET_ROW_RIGHT = 3;`)の直後へ:

```js
    /* ▽ の幾何 (依頼書 #43 §2-3)。⭐ HEAD_TOP は 6 職の <class>_walk.png row3 を実測した
       「96px セル上端 → 頭の天辺」の最小値。2026-09-03 再測 = warrior 32 / dwarf 32 /
       elf 33 / cleric 34 / mage 32 / rogue 32 → 32 (town.html:499 と同じ値)。
       ⚠⚠ FOOT=0.93 は **足元** の話。頭の位置はこれとは別に測らないと ▽ が頭から浮く。
       ⭐⭐⭐ HM_GAP + HM_H (= 21) < HEAD_TOP (= 32) である限り、▽ は主人公の 96px セルの
         **内側** に収まる (余白 11px)。これが verify_world_map の (7f)「駒が札を 10% 以上
         隠さない」を ▽ にも自動で効かせている **唯一の根拠** (依頼書 §2-2)。
         ⛔ この不等式を崩さない。崩すと (7f) は永久に気づかないまま札が隠れる。 */
    var HEAD_TOP = 32, HM_GAP = 8, HM_W = 9, HM_H = 13;
```

**⑤ 要素取得と撤退の remove**。`world.html:509`(`var elHero = ...`)の直後へ:

```js
    var elMark     = document.getElementById("worldHeroMark");
    if (!HERO_MARK_ON && elMark) { elMark.remove(); elMark = null; }
```

⛔ `display: none` で残さない(受入条件 (4a) は **DOM に無いこと**を測る = `town.html:471` と同じ作法)。

**⑥ `placeHero()`**。`world.html:617`(`elShadow.style.top = cy + "px";`)の直後へ:

```js
      /* ⭐ ▽ の位置の出所は **placeHero のこの 2 行だけ** (town.html:526 と同じ規則)。
         別の場所からも書くと「歩くと ▽ だけ取り残される」が静かに起きる。
         三角は width:0 の border 三角なので、**見た目の中心は left + HM_W**。 */
      if (elMark) {
        elMark.style.left = (cx - HM_W) + "px";
        elMark.style.top  = (cy - SPRITE * FOOT + HEAD_TOP - HM_GAP - HM_H) + "px";
      }
```

---

## 6. STEP3 — 検証シーム

**⑦ `window.__world` へ 2 キー**。`world.html:1074` の `heroGeom:` の**直後**へ:
⚠ 起草時は `:1075` と書いていたが、着手前の再実測で **`:1074`** が正しかった(`:1075` は次のコメント行)。

```js
      /* ── #43 が足した窓 (⛔ 読むためだけ。ここへ状態を置かない) ──────────── */
      heroMarkOn:   function () { return HERO_MARK_ON; },
      /* ⚠ ドライバはこの値と **実描画の矩形** を突き合わせる (CSS と JS の写経ズレを殺すため)。
         ⛔ ドライバ側へ 9 / 13 / 32 / 8 を直書きさせない。 */
      heroMarkGeom: function () { return { w: HM_W, h: HM_H, gap: HM_GAP,
                                           headTop: HEAD_TOP, sprite: SPRITE, foot: FOOT }; },
```

⛔ ここにゲームの状態を足さない(既存コメント `world.html:1029-1032` の方針どおり)。

---

## 7. 撤退スイッチ

- **`world.html?heromark=0`** — ▽ が **DOM に 1 枚も作られない**。それ以外(駒・影・札・刻み点・
  カメラ・歩行)は素と 1 バイトも変わらない。
- **判定位置** = IIFE 先頭、`?world=0` の `location.replace` の**直後**(`world.html:491` の次)。
  ⚠ 後ろへ置くと「撤退したはずの ▽ が一瞬見える」。
- **ページ遷移をまたぐか** = **またがない**。`index.html` / `town.html` が同名スイッチを
  **独立に**読む既存の作法(#15 §7)に合わせる。⛔ sessionStorage へ写さない。

---

## 8. 受入条件 — `tools/verify_world_heromark.js`(新規 / base port 9490)

**方針**: 測るのは「▽ が主人公に付いてくる」「▽ が **96px セルの内側**に収まる」
「▽ が誰の当たり判定も奪わない」「撤退できる」の 4 つだけ。
色・影・揺れの速さ・compact での見かけの大きさは**測らない**(下の「測らないこと」)。

⭐ 流用元 = `tools/verify_world_steps.js`(配信バイトの凍結 / `--negative` 内蔵 /
5 点 `elementFromPoint` / 実クリックで歩かせる作法が全部そろっている)。

### ⚠ 計測機構(写経では動かない点)

- **配信バイトは起動時に 1 回だけ読んで凍結する**(別窓が `world.html` を保存しても
  走行中に混合ビルドにならない)。`MUT_TARGETS = ['world.html']` の 1 枚だけでよい。
  ⭐ 変異アンカーが `index.html` / `town.html` の同名行と衝突する心配は無い(配信しないので)。
- **bob は `margin-top` を 0 → 4px 動かす**。1 フレームだけ読むと (1b) が間欠フレークする。
  → **1 周期(1.2s)を 12 点サンプリングして最悪値**を採る。
- ▽ は `pointer-events: none` なので `elementFromPoint` には**絶対に写らない**。
  だから (2a) は「▽ が返らないこと」だけでは自明に緑になる。
  → **変異 `markhit`(`pointer-events: auto`)を赤にできること**を `--negative` で担保する。
- ⛔ `goToNode()` / `goToPoint()` を `page.evaluate` から呼ばない。**実クリックだけで歩かせる**
  (`verify_world_steps` と同じ)。
- ⚠⚠⚠ **行き先に `enter` を持つノード(phlan)を選ばない** —— 着くと `town.html` へ飛んで
  以後の測定が全滅する(2026-09-01 に実際に起きた)。通りすがり(`arrived === false`)は安全。

### §0 装置(先に母集団を確かめる)

- **(0a)** `#worldHeroMark` が DOM に実在し、`__world.heroMarkOn()` が `true`、
  `__world.heroMarkGeom()` が `{w,h,gap,headTop,sprite,foot}` の **6 キーすべてを有限の数値**で返す。
  ⭐⭐⭐ これが無いと §1〜§2 が全部空振りで永久緑になる。
  ⚠ キー集合だけでなく **型と値(有限・0 でない)** まで見る(#38 の教訓)。
- **(0b)** **写経ズレの検出** — `#worldHeroMark` の `getBoundingClientRect()` の実寸を
  `__world.zoom()` で割った値が、`heroMarkGeom()` の `w * 2` / `h` と **0.5px 以内**で一致。
  ⛔ 9 / 13 をドライバへ直書きしない。⭐ 実描画(ブラウザのレイアウト結果)と JS の値の
  **2 経路**の突き合わせ = CSS と JS へ同じ数値を写経したズレを殺す。
- **(0c)** 主人公の幾何も `__world.heroGeom()` から採る(`sprite` / `foot`)。
  ⛔ 96 / 0.93 をドライバへ写経しない(`verify_world_map.js:511` と同じ作法)。

### §1 追従と収まり

- **(1a)** 初期位置で、▽ の**見た目の中心 x**(`rect.left + rect.width/2`)が主人公 `#worldHero` の
  中心 x と **1px 以内**、▽ の**下端 y** が `heroRect.top + (headTop - gap) * zoom` と **1px 以内**。
  ⭐ **2 経路** = 左辺は `getBoundingClientRect()`(ブラウザのレイアウト結果)、
  右辺は `__world.heroPx()` + `heroGeom()` + `heroMarkGeom()` から**ドライバが独立に計算**する。
  ⛔ `elMark.style.top` の文字列を読んで比べない(それは実装の写経になる)。
- **(1b)** ★**▽ の矩形が `#worldHero` の矩形に完全に含まれる**
  (`markRect ⊆ heroRect`、4 辺すべて。bob の 1 周期を 12 点サンプリングして**最悪値**)。
  ⭐⭐⭐ これが `verify_world_map` の (7f)「駒が札を 10% 以上隠さない」を
  **▽ にも継承させる唯一の条件**(§2-2)。
- **(1c)** 実クリックで **3 ホップ**歩かせた後も (1a) が成り立つ。
  ⚠ 母集団ガード: `__world.heroNode()` が押す前と**変わっている**こと(1px も動かないまま
  緑になるのを殺す)。⛔ 行き先に phlan を選ばない。
- **(1d)** 移動中(`__world.isMoving() === true` のサンプル)でも ▽ の中心 x と主人公の中心 x が
  **2px 以内**。⚠ 母集団ガード: `isMoving()` が true のサンプルが **1 件以上**あること
  (0 件なら「移動中を一度も捕まえていない」= 空振り → FAIL)。
- **(1e)** **札と重ならない** — 全 14 ノードに立った場合の ▽ の矩形と、7 枚の `.worldSign` の
  矩形が **1px も交差しない**。⭐ (7f) と同じ手口で **実際には歩かせず計算で出す**
  (`enter` を持つ phlan の札を押す事故を原理的に踏まない)。
  ⛔ 期待値 19.72px をドライバへ書かない。縛るのは「交差 0」だけ。
  ⚠ 母集団: 照合した組が `14 × 7 = 98` 件あること。
- **(1f)** `getComputedStyle(#worldHeroMark).zIndex` が
  `getComputedStyle(#worldHero).zIndex` **より大きい**。
  ⛔ 6 という数値そのものは書かない(§2-4 の「並びが違う」を数値でなく関係で縛る)。

### §2 非干渉(誰の当たり判定も奪わない)

- **(2a)** ★**全 14 ノード + 全刻み点マーカー**について、**中心 + 四隅の内側 8px の 5 点**を
  `document.elementFromPoint` し、返る要素が **`#worldHeroMark` でも その子孫でもない**。
  ⚠ 母集団ガード: 検査した点の数が `(14 + STEPS 件数) × 5` と一致し、0 でないこと。
  ⭐⭐⭐ 「矩形が交差しない」ではなく **「その 1 点を奪わない」** を測る(#42 の教訓 —
  押し込む向きで奪う隅が変わるので中心 1 点では捕まらない)。
- **(2b)** `.worldStep` の DOM 件数が `WORLD_MAP.STEPS` と一致し、`.worldNode` が 14 件。
  かつ **`#worldHeroMark` が `.worldNode` も `.worldStep` も着ていない**
  (`classList.length === 0`)。⚠ 着せると `verify_world_map.js:736/:1187` と
  `verify_quest_walk.js:547` が誤爆する(#40 §2-4 の既知の罠)。

### §3 恒等(非退行)

- **(3a)** `Object.keys(window.__world)` が #42 時点のキー集合を**すべて含み**、
  増えたのは `heroMarkOn` / `heroMarkGeom` の **2 つだけ**。
  ⭐ キー集合だけの恒等 assert は変異を検出できない(#38)ので、
  **2 つとも `typeof === 'function'` で、呼んで boolean / 有限値が返る**ことまで見る。
- **(3b)** `.worldSign` が 7 枚、点線 `<line>` が `EDGES.length` 本のまま
  (▽ が経路や札の枚数に触っていない)。

### §4 撤退

- **(4a)** `world.html?heromark=0` → `document.getElementById('worldHeroMark') === null`
  (**DOM に無い**。`display:none` で残っていたら FAIL)。
- **(4b)** ★**素のアームを同じ assert に同居させる** — `(1a) && (1b) && (2a)` の conjunction を
  **両アームへ当て**、素では**全部真**、`?heromark=0` では**(1a) が偽で崩れる**ことを見る。
  ⭐⭐ 撤退アームだけを見ると永久緑になる(#39 の教訓)。
- **(4c)** **撤退のしすぎ**も測る — `?heromark=0` でも
  `.worldStep` 件数 / `.worldSign` 7 枚 / `__world.heroPx()` / `__world.heroNode()` /
  `__world.zoom()` が素のアームと**一致**する。

### §9 事故

- **(9a)** 測定ページで `pageerror` / `console.error` が 0 件(素・撤退の両アーム)。

### ⛔ 測らないこと

- ▽ の**色** `#ffd24a` / `drop-shadow` の強さ / bob の速さ(1.2s)と振幅(4px)
  → 実機で見て調整する余地を残す。
- **compact(iPhone)での見かけの大きさ**。desktop の実効 zoom は 0.81 前後なので
  ▽ は実効 10.6px。⚠ これは §9 の実機体感で判断する項目であって、機械では縛らない。
- **z-index の数値 6 そのもの**((1f) は「主人公より上」という**関係**だけを縛る)。
- `.worldSign` の `bottom: calc(100% + 76px)`。⛔ この依頼書では動かさない。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ **exit 1**)

⚠ 下記のアンカーは**この依頼書が書けと言っている行**であって、まだ実在しない。
実装後に `--negative` を 1 回回し、**0 件ヒットのアンカーがあれば変異のほうを直す**(#38 の教訓)。
⚠ 置換前後で**長さを変える**こと(同じ長さだと「当たったのに何も変わらない」を検出できない)。
⚠ 置換文字列は**1 行に閉じる**(`world.html` は CRLF なので複数行アンカーは必ず空振りする)。

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `markbox` | `var HEAD_TOP = 32, HM_GAP = 8,` の `HM_GAP` を **30** へ(▽ が 96px セルの外へ出る) | **(1b)** |
| `markstill` | `placeHero` の `elMark.style.top = ...` の行を定数へ固定(歩いても ▽ が取り残される) | (1a) / (1c) |
| `markhit` | CSS `#worldHeroMark` の `pointer-events: none;` → `pointer-events: auto;` | **(2a)** |
| `markwide` | CSS `--hm-w: 9px;` → `--hm-w: 16px;`(JS の `HM_W` は 9 のまま = 写経ズレ) | **(0b)** |
| `marklow` | `#worldHeroMark` の `z-index: 6;` → `z-index: 1;` | (1f) |
| `markalways` | 撤退の `if (... === "0") HERO_MARK_ON = false;` を潰す | (4a) / (4b) |
| `marksign` | `.worldSign` の `bottom: calc(100% + 76px)` → `calc(100% + 20px)`(札が ▽ へ降りてくる) | **(1e)** |

⭐ **§2-2 の罠を再現する変異** = `markbox`。
これが赤くならないなら、(1b) は書かれていない = (7f) の保証が ▽ へ届いていない。
⭐ `marksign` は「▽ 側は正しいのに札のほうが降りてきた」ケースを (1e) が捕まえることの証明。

### 既存 golden の非退行(実装後に必ず走らせる)

    node tools/verify_world_map.js            → 57/57      (2026-09-03 実測)
    node tools/verify_world_steps.js          → 33/33      (2026-09-03 実測)
    node tools/verify_quest_walk.js           → 25/25      (2026-09-03 実測)
    node tools/verify_town_exit.js            → 素 23/23   (2026-09-03 実測)
    node tools/driver_heromark_signplate.js   → 46/46      (2026-09-03 実測。⛔ 1 バイトも触らない)
    node tools/verify_title_screen.js         → 86/86      (2026-09-02 の記録)
    node tools/verify_tavern_map.js           → 43/43      (2026-09-02 の記録)

⚠ 基準値は上記の**測定日**時点の記録。走らせて違ったら
**期待値を書き換える前に理由を突き止める**(別窓のコミットで動いていることがある)。
⭐ 判定は数字でなく **落ちている項目の集合の diff** で見る(#38 の教訓)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` だとナレーション音声が鳴らない)。

1. デスクトップで `world.html` を開き、**▽ が主人公の頭上に出ているか**。
2. 街道を数ホップ歩いて、**▽ が置いていかれないか**(移動中もぴったり付いてくるか)。
3. **拠点の札の下に立ったとき**、▽ と羊皮紙が喧嘩していないか(計算上は 19.7px 空くが、
   目で見て「近すぎる」と感じるなら `HM_GAP` を上げる —— ⛔ ただし
   **`HM_GAP + HM_H < 32` を超えると (1b) が赤になる**。上限は `HM_GAP = 18`)。
4. **compact(iPhone 縦)**で ▽ が見えるか。実効 zoom 0.81 で ▽ は約 10.6px。
   小さすぎるなら `--hm-w` / `--hm-h` を上げる(⚠ JS の `HM_W` / `HM_H` と**必ず同時に**動かす。
   片方だけだと (0b) が赤)。
5. 地図の背景(森・水・草原)の上で、金色 `#ffd24a` が**沈んで見えないか**。
   ⭐ 街道の点(`--route-ink` = クリーム)や札の紙とは色が違うので紛れないはず。
6. **街 → 世界地図 → ダンジョン**と続けて歩いて、3 画面で ▽ の**大きさと高さの印象が揃っているか**
   (ダンジョンは `HERO_MARK_DY = -50` の別式なので、ここだけは目で合わせるしかない)。

---

## 10. changelog

**不要**(§2-8 で実測)。`world.html` は `check_changelog.py` の `GAME_LOGIC` に入っていない。

⛔ **フックを鳴らすためだけに `tavern.html` を開かない。**
⭐ 前例 = #42 の 5 コミットは全部 `world.html` / `js/world-map.js` / `tools/*` だけで通っている。

---

## 11. やらないこと

- ⛔ **`index.html` / `town.html` の ▽ を触る**。3 画面の見た目を揃える調整は §9-6 の
  実機体感で判断してからの別チケット。
- ⛔ **`driver_heromark_signplate.js` を 3 ページ目へ拡張する**(§3 で却下済み)。
- ⛔ **`.worldSign` の `bottom: calc(100% + 76px)` を 104px へ動かす**。
  それは #42 の実機体感 5(「沼地/砦の札の下の 2 点が紙に隠れる」)の別件。
- ⛔ **`town.html:497` のコメント(dwarf 33 → 実測 32)を直す**。1px の誤記で結論に影響しない。
- ⛔ **`?heromark=0` を sessionStorage へ写して遷移をまたがせる**。
- ⛔ **#40 が器だけ作ったランダムイベント**(`onArriveStep` / `lastArrival` / `arrivalCount`)に
  中身を入れる。
- ⛔ **`実装依頼書/README.md` への行追加は、実装が着地してから**。
  ✅ **2026-09-03 項目 4 で追加済**(行 43)。⚠ 実際に入れた行は下の下書きそのままではなく、
  ステータスを **完了 / 100%** にし、§12 の実測(空振りした変異 `markhit` / (2a) の穴 /
  golden 7 本の実測値)を足した版。下書きは**起草時の姿**として残す:

    | 43 | [2026-09-03_world-heromark.md](2026-09-03_world-heromark.md) | **承認済** | 0% | ワールドマップでも主人公の頭上に ▽ を出す。⭐⭐⭐ ▽ を主人公の 96px セルの**内側**(余白 11px)に収めることが、`verify_world_map` (7f)「駒が札を 10% 以上隠さない」を ▽ にも継承させる唯一の条件 — (7f) は `heroGeom()` から計算した箱しか見ないので、外へ出すと**永久に気づかない**。⚠ z-index は town の 5 を写経せず **6**(世界地図は主人公 5 > 札 4 で並びが逆)。撤退 `?heromark=0`(3 ページ目・独立読み) |

---

## 12. 実装結果

**2026-09-03 実装完了**(dev-loop 4 項目 / 停止 0 回)。

### 12-1. コミットと各項目の検証結果

| 項目 | commit | 触ったファイル | 検証 |
|---|---|---|---|
| 1 | `d4db293` | `world.html`(+63)/ `tools/verify_world_heromark.js`(新規 732 行) | `verify_world_heromark` **3/3 PASSED PENDING 15** |
| 2 | `1d076db` | `tools/verify_world_heromark.js`(+522 / -26) | **9/9 PASSED PENDING 9**(§1 の 6 本を実装) |
| 3 | `6ac5653` | `tools/verify_world_heromark.js`(+378 / -24) | **14/14 PASSED PENDING 4**(§2 / §3) |
| 4 | 本コミット | `tools/verify_world_heromark.js` / 本依頼書 / `実装依頼書/README.md` | **18/18 PASSED FAILED 0 PENDING 0** |

⚠ **push は未実施**(dev-loop の orchestrator が実施する)。

### 12-2. 最終の実測値

    node tools/verify_world_heromark.js              → 18/18 PASSED  FAILED 0  **PENDING 0**   exit 0
    node tools/verify_world_heromark.js --negative   → 24/24 PASSED  FAILED 0  **PENDING 0**   exit 0
                                                       (変異 7 本すべて赤 / **空振り 0**)

内訳: (0a)(0b)(0c)(0d) / (1a)(1b)(1c)(1d)(1e)(1f) / (2a)(2b) / (3a)(3b) / (4a)(4b)(4c) / (9a) = **18 本**。
`--negative` は n0a/n0b × 7 = 14 本 + neg-<変異>-<節> 9 本 + (n9a) = **24 本**。

**既存 golden 7 本**(2026-09-03 に項目 4 が実際に走らせた。**期待値の変更 0 件**):

| ドライバ | 基準 | 実測 |
|---|---|---|
| `tools/verify_world_map.js` | 57/57 | **57/57 PASSED FAILED 0 PENDING 0** exit 0 |
| `tools/verify_world_steps.js` | 33/33 | **33/33 PASSED FAILED 0 PENDING 0** exit 0 |
| `tools/verify_quest_walk.js` | 25/25 | **25/25 PASSED FAILED 0 PENDING 0** exit 0 |
| `tools/verify_town_exit.js` | 素 23/23 | **素 23/23 PASSED (PENDING 0)** exit 0 |
| `tools/driver_heromark_signplate.js` | 46/46 | **46 / 46** exit 0(⛔ 1 バイトも触っていない) |
| `tools/verify_title_screen.js` | 86/86 | **86/86 passed** exit 0 |
| `tools/verify_tavern_map.js` | 43/43 | **43/43 PASSED FAILED 0 PENDING 0** exit 0 |

### 12-3. ⚠⚠⚠ 依頼書の指定が実物でずれた点(3 件)

1. **行番号が 2 件ずれていた**(着手前の再実測で訂正済 = ヘッダに記載)。
   `:491`→**`:492`**(撤退スイッチの挿入点。`:491` は 1 行手前の `try {`)/
   `:1075`→**`:1074`**(`heroGeom:` の行)。
   ⭐ **#37 の教訓どおり「行番号は他チケットが 1 本着地しただけで全滅する」** が、今回は
   **同日・同 HEAD なのに 2 件ずれた**(起草窓が数え間違えただけ)。⇒ 座標でなく構造で書く。

2. ⭐⭐⭐ **変異 `markhit` が空振りした**(§8 の負のコントロール表の 3 行目)。
   依頼書は「CSS の `pointer-events: none;` → `auto;` にすれば (2a) が赤くなる」と書いていたが、
   `node tools/verify_world_heromark.js --mutate markhit` の実出力は:

       ▽ の pointer-events="auto" / ▽ が奪った点 0 件 → (2a) は **PASSED のまま**

   **真因は幾何**。▽ は主人公の頭上(ノード中心から **65〜78 map px 上**)に浮いており、
   ノードの当たり判定箱は 44px(中心 **±22 map px**)なので **原理的に交差しない**。
   `pointer-events: auto` にしても、奪える点が 1 つも無い。
   ⇒ **#38 の作法どおり「変異アンカーが空振りしたら変異のほうを直す」**に従い、
   `markhit` を **同じファイル内の 2 箇所を同時に置換する複合変異**へ作り替えた:

   | # | from | to |
   |---|---|---|
   | 1/2 | `      animation: heroMarkBob 1.2s ease-in-out infinite;` | 先頭へ `pointer-events: auto;` を足す |
   | 2/2 | `elMark.style.top  = (cy - SPRITE * FOOT + HEAD_TOP - HM_GAP - HM_H) + "px";` | `elMark.style.top = (cy - HM_H / 2) + "px";`(▽ をノード中心へ落とす) |

   これで「**クリックを食う位置に、クリックを食う設定で置かれた ▽**」= (2a) が守っている
   本当の複合欠陥が再現でき、実測 **1 / 120 点**(`node(pier):中心←#worldHeroMark`)を奪って赤になった。
   ⚠ (1a)(1b) も一緒に赤くなるが、`--negative` は「期待した assert が実際に FAIL したか」を
   見る仕組みで「**それだけ**が FAIL する」ことは要求していないので問題ない。

   ⭐⭐⭐ **教訓 = 「`pointer-events` を切り替える変異」は、その要素が実際に測定点と
   重なる位置に居るときにしか欠陥にならない。設定(pointer-events)と幾何(どこに居るか)は
   別条件で、片方だけを動かす変異は原理的に空振りする。**
   ⇒ 次に「見えるだけの飾りを主人公に足す」チケットが来たら、(2a) 型の assert の
   負のコントロールは **最初から複合**(設定 + 位置)で設計すること。

3. **依頼書は 1 変異 = 1 置換を前提にしていた**(§8 の表が `from` / `to` の 1 組)。
   ⇒ ドライバの凍結機構を `edits: [{from,to}, …]` の配列も受け付ける形へ拡張した
   (単一の `from`/`to` は 1 要素として正規化)。検算(複数行禁止 / 長さが変わる /
   ちょうど 1 件ヒット)は **置換ごと**に走り、2 本目以降は **1 本目を当てた後の body** に
   対して数える(置換どうしがアンカーを食い合っていないことまで見る)。
   `(n0a-markhit)` も 2 箇所すべてを検算する。

### 12-4. ⭐⭐⭐ 負のコントロールが装置自身の穴を 1 件見つけた

複合変異へ作り替えた `markhit` を回したところ、▽ は確かに **1 点を奪った**のに
**(2a) は PASSED のまま**だった。原因は **(2a) の実装**:

- 項目 3 が書いた (2a) は `stolen` 配列を **数えて `detail` に出しているだけ**で、
  **`why` へ入れていなかった** = 見出しが主張している「返る要素が `#worldHeroMark` でも
  その子孫でもない」を **一度も判定していなかった**。
- 素のアームでは ▽ が `pointer-events: none` で奪う点が 0 件なので、
  **緑であることと判定していないことが見分けられない**状態だった。

⇒ 項目 4 で `if (stolen.length) why.push(...)` を追加。
⛔ **受入条件は 1 バイトも弱めていない**(見出しが最初から主張していた条件を足しただけ)。

⭐⭐⭐ **教訓 = 「測って detail に出す」と「判定する」は別。負のコントロールでしか
見つからない種類の穴で、素のアームが自明に緑(この場合 `pointer-events: none`)なほど
埋もれやすい。** #39 の「撤退アームだけだと永久緑」と同じ構造の罠。

### 12-5. 依頼書からの逸脱

- **逸脱 1**: §8 の `markhit` を単一置換 → **複合置換**へ変更(12-3 の 2 番。理由は空振り)。
- **逸脱 2**: (2a) の実装へ `stolen` の判定を追加(12-4。受入条件の**追加**であって緩和ではない)。
- **逸脱 3**: `--negative` の観測ディスパッチに `'4b'` を追加
  (`targets` に `4b` を含む変異は素のアームでも `measureMark` / `measureHits` を採る)。
  ⭐ (4b) は (1a)(1b)(2a) の conjunction なので、素のアームの 3 点セットが無いと
  「観測が無い」で偽になり、**欠陥を検出したのか装置が欠けたのか読めなくなる**。
  同じ理由で `needsRetreat` の変異は **撤退アームでも 3 点セット**を採るようにした
  (⛔ `measure()` だけだと `markalways` が空振りする)。
- **逸脱なし**: §2〜§7 の実装(`world.html` の 7 箇所)は依頼書のコードのまま。
  z-index **6** / `HEAD_TOP = 32, HM_GAP = 8, HM_W = 9, HM_H = 13` / 撤退 `?heromark=0` /
  シーム 2 キー / `.worldSign` の `76px` **据え置き** — 全部そのまま。
- **`world.html` は項目 1 以降 1 バイトも動かしていない**(項目 2〜4 はドライバだけ)。
  ⇒ 既存 golden 7 本が非退行なのは当然だが、**測って確かめた**(上表)。

### 12-6. 実測で確かめた数値(読み解き用。⛔ 期待値ではない)

- `heroMarkGeom()` = `{"w":9,"h":13,"gap":8,"headTop":32,"sprite":96,"foot":0.93}`
- desktop 1280x900 の `zoom` = **0.8125** → ▽ の実描画は **14.6 x 10.6 px**
- (1b) 余白の最悪値 = 左 31.69 / 右 31.69 / **上 11.0 前後** / 下 73.15 px(bob 12 点の最悪値)
  ⇒ §2-3 の「箱の内側に 11px 余って収まる」は**実測で正しかった**
- bob の実測レンジ = **0.03〜3.97 map px**(設計の 0→4px と一致)
- (1e) 照合 **98 組 / 交差 0 組** / 横が被る組の縦の空きの最小 **22.55px**(`pier` x 札(`phlan`))
  ⚠ §2-3 の計算値 19.72px と 2.8px ずれるが、これは **bob と札の実矩形**を使っているため。
  ⛔ どちらも期待値としては書いていない(縛っているのは「交差 0」だけ)
- (2a) 突いた点 **120 点**(`.worldNode` 14 件 + `.worldStep` 10 件 = STEPS 10 件)x 5 点 /
  ▽ が奪った点 **0 件** / `pointer-events="none"`
- (3a) 基準 `c1c85e0` = **23 キー**(:9500 で同時配信 / 49857B)→ 素 **25 キー** /
  消えた 0 件 / 増えた `["heroMarkGeom","heroMarkOn"]`
- (4c) 撤退でも `.worldStep` 10→10 / `.worldSign` 7→7 / `.worldNode` 14→14 /
  `heroNode` `"pier"`→`"pier"` / `heroPx` の差 **0.0000** / `zoom` の差 **0.000000**
- (4b) 素 = (1a)真 (1b)真 (2a)真 / `?heromark=0` = (1a)**偽** (1b)偽 (2a)偽 = **conjunction が崩れた**

### 12-7. 残った宿題

**機械では縛っていない = §9 の実機体感 6 項目**(ローカルは **http 起動が必須**):

1. デスクトップで ▽ が主人公の頭上に出ているか。
2. 数ホップ歩いて ▽ が置いていかれないか(移動中も付いてくるか)。
3. 拠点の札の下に立ったとき、▽ と羊皮紙が喧嘩していないか
   (実測の空き **22.55px**。近すぎるなら `HM_GAP` を上げる。⛔ 上限 18 = `HM_GAP + HM_H < 32`)。
4. compact(iPhone 縦)で ▽ が見えるか(実効 zoom 0.81 で ▽ は約 10.6px)。
   ⚠ 上げるなら CSS の `--hm-w` / `--hm-h` と JS の `HM_W` / `HM_H` を **必ず同時に**
   (片方だけだと (0b) が赤 — 変異 `markwide` がそれを機械証明している)。
5. 地図の背景(森・水・草原)の上で金色 `#ffd24a` が沈んで見えないか。
6. 街 → 世界地図 → ダンジョンと続けて歩いて、3 画面で ▽ の大きさと高さの印象が揃っているか
   (ダンジョンは `HERO_MARK_DY = -50` の別式なので目で合わせるしかない)。

⛔ §11「やらないこと」は 1 件も踏んでいない
(`index.html` / `town.html` / `tavern.html` / `js/world-map.js` /
`tools/driver_heromark_signplate.js` は **一度も開いていない**)。
⛔ changelog は §2-8 / §10 の実測どおり **鳴っていない**(`world.html` は `GAME_LOGIC` 外)。
