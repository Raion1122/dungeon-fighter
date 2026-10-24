# #100 地下街を歩く住人 — ゴブリン・ホブゴブリン・リザードフォークが通路を行き交い、押すと一言

- **起草**: 2026-10-25(計画窓) / **ステータス**: **承認済**(2026-10-25 ユーザー承認)
- **基準コミット**: `8567dff`(#99 完了・push 済・作業ツリー clean)
- **触るファイル**: `js/map-walk.js` / `js/npc-crowd.js` / `tavern.html` / `tools/codex1_sprites.json` /
  `assets/plaza_goblin_walk.png`・`assets/plaza_hobgoblin_walk.png`・`assets/plaza_lizardfolk_walk.png`(新規 3 枚) /
  `tools/verify_plaza_map.js`(押し所の選び方だけ・§2-4) / `tools/verify_plaza_crowd.js`(新規)
- ⛔ **触らないファイル**: `town.html`・`index.html`・`js/plaza-map.js`・`js/town-map.js`・`js/tavern-map.js`
  (並走する別窓は無い。起草時 `git status` clean。ただし着手前にもう一度 `git status` を見ること)

---

## 1. 目的

#98 で闇市は歩ける地下街になったが、地図の上を歩いているのは主人公だけで、**街なのに誰も居ない**。
港町(#41)には住人が立ち、歩き、押すと一言しゃべる。地下街にも闇市らしい顔ぶれ
(ゴブリン・ホブゴブリン・リザードフォーク)を歩かせる。

**ユーザー決定(2026-10-25)**:

- **絵は敵の歩き 6 コマを流用する。codex1 への発注はしない。**
  会議記録 `dev-meetings/2026-10-20_plaza-undercity.md` l.201 の「歩く絵は無いから codex1 に頼む」は**誤り**だった(§2-1)。
  ⭐ 武器と鎧を持ったまま = 「闇市の荒くれ」として歩く。⛔ 武器を消す加工・色替えはしない。
  - 不採用: 武器なしの住人を新規発注(起草 → 承認 → 投下 → 納品待ちの分だけ遅れる)/ 流用で先行して後で差し替え
- **3 体とも通路を歩く**(巡回)。店主として露店の奥に立たせるのは別チケットのまま。
  - 不採用: 歩く 2 + 店主 1
- **押すと一言**(港町と同じ吹き出し)。代わりに `verify_plaza_map` の押し所の選び方を直す(§2-4)。
  - 不採用: 押せない飾り(既存ドライバに無影響だが、港町で押せる住人が地下街では押せない食い違いになる)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 歩く絵はもうある — ただし**形式が違う**ので畳み直しが要る

| 台帳 `tools/codex1_sprites.json` | 本番シート | codex1 の歩き 6 コマ(`C:\Users\PC_User\Desktop\codex1\assets\` から) |
|---|---|---|
| `goblin`(l.43) | `assets/goblin_anim.png` | `goblin/final/walk/frame-01..06.png` |
| `hobgoblin`(l.59) | `assets/hobgoblin_anim.png` | ⚠ 台帳の `walk_dir` は **null**。実物は `hobgoblin/final/walk/` と `hobgoblin/hobgoblin-walk-right-6/`(safe-frame 6 枚・512x724)の 2 つ |
| `lizardWarrior`(l.137) | `assets/lizardWarrior_anim.png` | `lizardman/lizardman-walk-right-6/lizardman-walk-right-safe-frame-01..06.png` |

⚠⚠ **敵のシートをそのまま住人に差すと攻撃の動きで歩く。**

| | 寸法 | 段 | 住人の描き方が読む段 |
|---|---|---|---|
| 敵 `*_anim.png` | **576x480** | 5 段(段 0〜2・4 = 歩き / **段 3 = 攻撃**) | — |
| 住人 `*_walk.png`(`town_keeper_walk.png` など) | **576x384** | 4 段(中身は段 3 だけ) | `SHEET_ROW_RIGHT = 3`(`js/map-walk.js` の定数・港町と同じ) |

⇒ 段 3 を読む住人に敵シートを当てると、**攻撃 6 コマで巡回する**。だから `pack_codex1_player.py` で住人の形式へ畳み直す。

**畳めることを確かめ済み**(スクラッチに出力・本番には書いていない):

    py tools/pack_codex1_player.py goblin    --walk-dir goblin/final/walk                --attack-dir goblin/final/walk                --char-ratio 0.58 --scale-from walk --center feet --attack-scale 1.0 --walk-out <tmp>/g.png --attack-out <tmp>/junk.png
    py tools/pack_codex1_player.py hobgoblin --walk-dir hobgoblin/final/walk             --attack-dir hobgoblin/final/walk             --char-ratio 0.60 (以下同じ)
    py tools/pack_codex1_player.py lizardman --walk-dir lizardman/lizardman-walk-right-6 --attack-dir lizardman/lizardman-walk-right-6 --char-ratio 0.79 (以下同じ)
    # ⚠ --walk-out だけだと「--walk-out と --attack-out が必要」で止まる。単発実行では --attack-out に捨て先を渡す
    #   (台帳経由の --all なら merchant-bound と同じく attack_out を省ける)

結果(段 3 の不透明 bbox 高 / alpha>64):

| 住人 | char_ratio | 6 コマの体高 px | fit | 戦闘での背丈(体高÷96×displaySize) |
|---|---|---|---|---|
| ゴブリン | 0.58 | 52〜55 | OK | 76/96×**66** = **52** |
| ホブゴブリン | 0.60 | 54〜58 | OK | 73/96×**74** = **56** |
| リザードフォーク | 0.79 | 72〜75 | **left=3 right=86 top=15 OK**(尾は 96px セルに収まる) | 80/96×**88** = **73** |
| (主人公 `warrior_walk.png`) | — | 57 | — | 57 |

displaySize の出所 = `index.html` の敵定義(goblin 66 / hobgoblin 74 / lizardWarrior 88)。
敵シート段 0 の体高(76 / 73 / 80)は `assets/*_anim.png` を PIL で測った値。
⭐ **戦闘と同じ背丈の比**を地下街でも保つ(ゴブリンは主人公より少し小さく、リザードフォークは頭ひとつ大きい)。
char_ratio は上の値を出発点に、体高が 52 / 56 / 73 ±2px に入るよう実装窓が微調整してよい。

⚠ ホブゴブリンは `final/walk` と `hobgoblin-walk-right-6` のどちらが本番 `hobgoblin_anim.png` の歩きと同じ絵かを**目で 1 回確かめてから**台帳に書く
(起草窓は `final/walk` で畳み、本番の歩きと同じ見た目になることを並べて確かめた)。

### 2-2. 地下街の部品には住人を立たせる口が無い

- `js/map-walk.js`(407 行)が生やすのは 絵 / 行き先 / 影 / 主人公 / 暗幕 / 札 だけ(l.71 `create`〜l.372 の戻り値)。
  住人・吹き出し・rAF の群衆ループは**どこにも無い**。
- 港町の住人の描き方は `town.html` l.916 `initNpcCrowd()`(配置の唯一の正は `js/npc-crowd.js` の `NPC_CROWD.TOWN`)。
  酒場は `tavern.html` l.11609 の同名関数。**2 ページに写経された別々の実装**。
- 闇市の地図を作るのは `tavern.html` l.10352 `plazaBuildWalkTV()` → `MAP_WALK.create({...})`。
  入場ごとに l.10386 `plazaMapAfterOpenTV()`、退場で l.10408 `closePlaza()`(主人公の `w.stop()` だけ呼ぶ)。

⇒ **住人の描き方は `js/map-walk.js` に足す**(`opts.crowd`)。配置データは `js/npc-crowd.js` に `PLAZA` 配列を足す
(#83 の `REUNION` と同じ「別の配列」の作法)。`tavern.html` は「渡す・止める・再開する」の数行だけ。

### 2-3. ⚠⚠⚠ 罠 A — `tavern.html` に住人の処理を写すと `verify_npc_crowd` が起動時に止まる

`tools/verify_npc_crowd.js` l.170〜262 の変異は、**`tavern.html` と `town.html` の中に「ちょうど 1 回」ある 1 行**をアンカーにしている
(0 回でも 2 回でも exit 3)。アンカー(l.192〜197・`SCRIPT_TAG` l.126):

    A_FILTER   '      filter: drop-shadow(0 3px 4px rgba(0,0,0,0.45));'
    A_BGPOS    '        u.el.style.backgroundPosition = (-u.frame * SPRITE) + "px " + (-SHEET_ROW_RIGHT * SPRITE) + "px";'
    A_STOP     '          if (ev && ev.stopPropagation) ev.stopPropagation();   /* [nostop] 1 行に閉じたまま保つ */'
    A_HIDE     '        npcBubbleHide();                          /* ⭐ 先に消す = 常に 1 枚 */'
    A_RETREAT  '      if (!NPC_ON) return;                      /* [retreatnoop] 1 行に閉じたまま保つ */'
    SCRIPT_TAG '<script src="js/npc-crowd.js"></script>'

⇒ 住人の処理は **`js/map-walk.js` の中だけ**に書く。`tavern.html` へ港町の `initNpcCrowd` を写経しない。
⇒ 地下街の住人の class は **`.mwNpc` / `.mwNpcShadow` / `.mwNpcBubble` / `.mwNpcLayer`**、属性は **`data-mw-npc`**。
  ⛔ `.npcUnit` / `data-npc` / `.npcBubble` を使わない(`verify_npc_crowd` l.673 が `querySelectorAll('.npcUnit')` を数え、
  (0b-dom) が「`.npcUnit` の数 = `NPC_CROWD.TAVERN.length`」を見ている)。
⇒ `js/npc-crowd.js` のアンカー `  global.NPC_CROWD = {`(l.173)と `A_MASON` などの配置行は **1 文字も変えない**。
  `PLAZA: PLAZA` は l.175 の `TAVERN: TAVERN, TOWN: TOWN, REUNION: REUNION,` の行に足す。
⭐ この罠は §8 の変異 `anchorcopy` として装置に内蔵する。

### 2-4. ⚠⚠⚠ 罠 B — 押せる住人は `verify_plaza_map` の「タイルを押して歩く」を間欠的に赤くする

`tools/verify_plaza_map.js` l.313〜339 `walkByClicks()` は、経路上のタイル中心で `elementFromPoint` を取り、
**「舞台の中で、札でなければ」押す**(l.327):

    if (!e || !stage.contains(e) || e.closest('.mwSign')) continue;

住人は舞台の中(z 3)にいて押せる(伝播を止める)ので、**住人の上のタイルを選ぶと主人公が歩かず「着かない」で (1c) が赤**。
しかも住人は動くので、選んだ時点では空いていても押す瞬間に入ってくる(数 ms の窓)。
港町 #41 で実際に踏んだ形(`verify_npc_crowd` l.155〜166 の `GOLDEN_TAP_TILES` の注記: 巡回が押し所を 38% / 15% / 8% の時間覆っていた)。

対処は 2 段:

1. **配置で避ける** — 巡回の矩形が `verify_plaza_map` (1c) の固定の押し所
   `desktop [[5,6],[17,12],[21,7]] / compact [[5,6],[11,7],[17,7]]`(l.474)を**一度も覆わない**ようにする(§5-1 の下書きは確認済み)。
2. **ドライバの押し所の選び方に 1 条件足す** — `walkByClicks` の候補から「`.mwNpc` の矩形を 24px 広げた範囲に入る点」を外す(§6)。
   ⭐ これは**測り方の修正**であって受入条件を弱めるものではない(実プレイヤーも住人の上は押さない)。
   ⛔ (1c) の期待値・押し所の表・他の節は 1 文字も変えない。

⭐ 1 の罠は §8 の変異 `tapcover` として装置に内蔵する。

### 2-5. 住人の作法(港町 #41 から引き継ぐ不変条件)

`js/npc-crowd.js` 冒頭の I1〜I5 と `validate(list, map, signs)` は `map` を引数で受けるので、**`PLAZA_MAP` にそのまま使える**
(`TILE` 64 / `isWalkable` / `inBounds` を持つ)。巡回に効くのは I4(経路上の全マスが歩ける)と I5(どのマスの矩形も札と交差しない)。

- 経路は `cellsOf()` の直線だけ。⛔ `findPath` を呼ばない(すり抜け許容 = 港町と同じ判断)
- 位置は `placeHero` と同じ 2 行(`left = cx - SPRITE/2` / `top = cy - SPRITE*FOOT`)
- 速さ `MS_PER_TILE = 340`・コマ送りの除数 `190`(`js/map-walk.js` の `MS_PER_TILE` / `FRAME_DIV` を使う。⛔ 別の数にしない)
- 端点で向きを反転して 1.5〜3 秒止まる / タブが隠れたら rAF を止める / 仮想時計の 100ms 頭打ち
- 同じ画面で同じシートを 2 人に当てない(3 体 = 3 シート)

### 2-6. `?npc=0` の旗はもう `window` にある

`tavern.html` l.3018 `window.__tavernNpcOn = (function () { ... })();` — 酒場の住人の撤退 `?npc=0` の結果。
地下街の住人もこれに従わせる(読むだけ。l.11615 の `A_RETREAT` の行は写さない)。

### 2-7. 暗幕と重なりの順

`js/map-walk.js` の z-index: 絵 0 < 行き先 1 < 影 2 < 主人公 3 < 暗幕 5 < 札 6。

- 住人は **z 3、主人公より DOM で前**(港町と同じ: 同じ z で DOM 順により主人公が手前)。
  ⇒ 灯りの外の住人は暗幕の下で暗く沈む = 地下街の雰囲気どおり。⛔ 住人を暗幕より上にしない。
- 吹き出しは **z 7**(札より上・`pointer-events: none`)。灯りの外で押しても読める。
  `pointer-events: none` なので `elementFromPoint` は素通り = `verify_plaza_map` (3c) の札の判定を濁さない。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py` l.24 `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → `tavern.html` を触るので**鳴る**。
書けるプレイヤー向けの要約は実在する(地下街に住人が歩き、押すとしゃべる)。§10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/codex1_sprites.json` | 住人 3 行を追記(`format: "player"`・walk のみ = merchant-bound 型)|
| `assets/plaza_{goblin,hobgoblin,lizardfolk}_walk.png` | 新規 3 枚(576x384・段 3 だけ中身)|
| `js/npc-crowd.js` | `PLAZA` 配列 + 公開行に `PLAZA: PLAZA`。冒頭コメントに #100 の 1 段落 |
| `js/map-walk.js` | `opts.crowd` で住人・影・吹き出し・群衆ループ。戻り値に `crowdPause` / `crowdResume` / `crowdUnits` |
| `tavern.html` | `plazaBuildWalkTV` で `crowd` を渡す / `plazaMapAfterOpenTV` で再開 / `closePlaza` で止める / 撤退 `?undercrowd=0` / 吹き出しの見た目の CSS(`.mwNpcBubble`)|
| `tools/verify_plaza_map.js` | `walkByClicks` の候補から住人の近くを外す 1 条件だけ(§6)|
| `tools/verify_plaza_crowd.js` | 新規(port **10639**)|

---

## 4. STEP1 — 絵を畳む

### 4-1. 台帳に 3 行

merchant-bound(l.355)と同じ形。`attack_dir` が `walk_dir` と同じなのはパッカの必須要件、`attack_out` は持たない。

```json
{
  "key": "plaza-goblin", "out": "assets/plaza_goblin_walk.png",
  "format": "player",
  "cell": 96, "cols": 6, "char_ratio": 0.58, "scale_from": "walk", "center": "feet",
  "attack_scale": 1.0,
  "walk_dir": "goblin/final/walk",
  "attack_dir": "goblin/final/walk",
  "note": "#100 地下街の住人。敵 goblin の歩き 6 コマを住人の形式 (576x384・段 3) へ畳み直した流用 (codex1 発注なし・ユーザー決定)。char_ratio は戦闘の背丈 52px (= 76/96 x displaySize 66) を再現する値。⚠ 敵シート goblin_anim.png (576x480・段 3 = 攻撃) を住人に直接当てると攻撃の動きで歩く。"
}
```

`plaza-hobgoblin`(0.60・§2-1 で確かめた `walk_dir`)/ `plaza-lizardfolk`(0.79・`lizardman/lizardman-walk-right-6`)も同形。

### 4-2. 畳む

⚠ `--all` は台帳の全行を作り直す。**既存シートがバイト不変であることを `git status` で確かめる**
(変わったら --all をやめて 3 行だけ単発で作る)。終わったら:

    py tools/check_sprite_doubling.py
    py tools/check_alpha_bg_residue.py

目視は**地下街の床の上**で(暗い石床 = `assets/plaza_undercity.jpg`)。

---

## 5. STEP2 — 配置データと住人の描き方

### 5-1. `js/npc-crowd.js` に `PLAZA`

```js
  /* ★[#100] 闇市の地下街を歩く住人 3 体。⚠ TAVERN / TOWN / REUNION とは別の配列。
   *   地図は PLAZA_MAP (23x15・TILE 64)。不変条件 I1〜I5 は同じ validate() で検査する
   *   (validate(NPC_CROWD.PLAZA, PLAZA_MAP, signs))。
   *   ⚠ 巡回の矩形は verify_plaza_map (1c) の押し所 (5,6) (17,12) (21,7) (11,7) (17,7) を覆わない (#100 §2-4)。
   *   ⚠ 絵は敵の歩きを住人の形式へ畳み直したもの (assets/plaza_*_walk.png)。⛔ *_anim.png を当てない (段 3 = 攻撃)。 */
  var PLAZA = [
    { key: "lizardfolk", kind: "stroll", from: [7, 6],  to: [18, 6], face: "right",
      sprite: "assets/plaza_lizardfolk_walk.png",
      say: "地上の者か……。牙貨は持っているか、シャァ…" },
    { key: "hobgoblin",  kind: "stroll", from: [11, 9], to: [11, 13], face: "right",
      sprite: "assets/plaza_hobgoblin_walk.png",
      say: "通り道を塞ぐな。ここは闇市だ、フン" },
    { key: "goblin",     kind: "stroll", from: [6, 13], to: [15, 13], face: "right",
      sprite: "assets/plaza_goblin_walk.png",
      say: "ヒヒッ、いい品が入ったぜ。見るだけならタダだぜ" }
  ];
```

⭐ 起草窓が `node` で確かめた(本番の `PLAZA_MAP` と `NPC_CROWD.validate`、札は空で):

    node -e 'global.window=global; require("./js/plaza-map.js"); require("./js/npc-crowd.js");
      console.log(JSON.stringify(window.NPC_CROWD.validate(window.NPC_CROWD.PLAZA, window.PLAZA_MAP, [])))'
    # 下書きの 3 本 → {"ok":true,"problems":[]}  (ゴブリンを [5,13] 始まりにすると I4: (5,13) は木箱)
    # 押し所 5 点との矩形交差 (boxOf で計算) → 0 件  (ゴブリンを [16,13] まで伸ばすと (17,12) を覆う = 変異 tapcover)

⚠ **I5(札との交差)は実 DOM の札の矩形で測る**(札の幅は画面幅で変わる)。下書きの見込み:
ホブゴブリン 11 列の矩形 x 688..784 と、行 9 の札 召喚屋 / 古物商(中心 x 544 / 928・幅 240 前後)の隙間は **左右 24px ずつ**しかない。
赤くなったら**経路のほうを動かす**。⛔ 札・マスク・`js/plaza-map.js` は動かさない。

文言の口調は依頼人 3 体の `speechStyle`(`tavern.html` l.3989〜3991: 「〜だぜ、ヒヒッ」「〜だ、フン」「〜だ、シャァ…」)に合わせた。
⭐ 依頼人本人(ジグ / グラーグ / シャザ)ではなく**名無しの住人**。名前は出さない。牙貨は #99 で入った闇市の通貨。

### 5-2. `js/map-walk.js` に `opts.crowd`

港町 `town.html` l.900〜1094 の `initNpcCrowd()` の**ふるまい**を移す(⛔ 行をコピーしない = 罠 A。変数名・コメントも書き直す)。

- `opts.crowd`(配列 or null)。null / 空なら何も生やさない(レイヤごと作らない)
- 要素: `div.mwNpcLayer`(舞台の中・`elShadow` の**前**に挿す)> `div.mwNpcShadow` + `div.mwNpc[data-mw-npc=key]`
- 位置・寸法・z・背景はインライン style(部品の作法: CSS が読めなくても壊れない)。
  `backgroundSize = 576px 384px`、`backgroundPosition` の Y は `-SHEET_ROW_RIGHT * SPRITE`
- 吹き出し `div.mwNpcBubble[data-mw-npc-say=key]`: 舞台に 1 枚だけ・`textContent`・4000ms で消える・足元追従・
  左右端と上端で clamp・z 7・`pointer-events: none`(インライン)。⛔ `innerHTML` を使わない
- 押す: `click` と `touchend` で `stopPropagation()` → 吹き出し。⛔ `preventDefault` しない
- ループ: rAF・仮想時計(1 フレーム最大 100ms)・`visibilitychange` で止める/再開
- 戻り値に足す: `crowdPause()`(rAF を止める・吹き出しを消す)/ `crowdResume()` / `crowdUnits()`
  (`[{ key, c, r, x, y, left, frame, mode }]` — ドライバ用の読み取り口。⛔ 書き換え口は作らない)
- ⛔ 主人公の `stop()` / `placeAt()` から住人に触らない(住人は主人公と独立に歩き続ける)
- 冒頭コメントの「今のところ使うのは闇市の地下街だけ」「DOM は全部この部品が生やす」の列挙に住人の層を足す

### 5-3. `tavern.html`

- l.10352 `plazaBuildWalkTV` の `MAP_WALK.create({...})` に `crowd: plazaCrowdTV()` を足す
- `plazaCrowdTV()` = 撤退の判定(§7)を通れば `window.NPC_CROWD.PLAZA`、それ以外 `null`
- l.10386 `plazaMapAfterOpenTV` の `layout()` の後で `plazaWalkTV.crowdResume()`
- l.10408 `closePlaza` の `w.stop()` の隣で `plazaWalkTV.crowdPause()`(⭐ 隠れている間に rAF を回さない)
- CSS は `.mwNpcBubble` の見た目(紙・文字・角丸・尻尾)だけ。港町の `.npcBubble` に似せてよいが、
  ⛔ **`A_FILTER` と同じ 1 行(字下げ込み)を作らない**。影が要るなら `filter` を使わず `box-shadow` にする

---

## 6. STEP3 — ドライバの押し所(`tools/verify_plaza_map.js`)

`walkByClicks` l.327 の候補判定の直後に 1 条件:

```js
        if (!e || !stage.contains(e) || e.closest('.mwSign')) continue;
        /* ★[#100] 住人の近く (矩形 +24px) は押さない。住人は押すと伝播を止める = 主人公が歩かない。
           動いているので選んだ瞬間と押す瞬間の差 (数 ms) を 24px で吸う。 */
        if ([].some.call(document.querySelectorAll('.mwNpc'), function (n) { const b = n.getBoundingClientRect();
              return q.x > b.left - 24 && q.x < b.right + 24 && q.y > b.top - 24 && q.y < b.bottom + 24; })) continue;
```

⛔ これ以外は変えない。`verify_plaza_map --negative` が今までどおり全部赤くなることも確かめる。

---

## 7. 撤退スイッチ

- **`?undercrowd=0`** — 地下街に住人を生やさない(#98 の姿)。
- ⚠ 判定位置 = `tavern.html` の `plazaCrowdTV()` 1 か所。次のどれかなら `null`:
  `?undercrowd=0` / `window.__tavernNpcOn === false`(= `?npc=0`)/ 地下街そのものが OFF(`?undercity=0`)/ `NPC_CROWD.PLAZA` が無い
- ページ遷移 = またがない(闇市は `tavern.html` の中の画面。港町へ出て戻るとクエリは消える = dev 専用。`?undercity=0` と同じ扱い)

---

## 8. 受入条件 — `tools/verify_plaza_crowd.js`(新規・port **10639**)

実 Chrome を puppeteer-core で直駆動し、http で配信。闇市へは `tools/verify_plaza_map.js` と同じ入り方
(`window.__plazaTV` の測定台)。desktop と compact(390x844・hover none)の 2 画面で回す。
⭐ 観測するのは **DOM の実位置と画素**。`NPC_CROWD.PLAZA` の写しをドライバに書かない(`page.evaluate` で実体を読む)。
負のコントロールは配信スナップショットをメモリ上で差し替えて作る(本番ファイルを書き換えない)。

### §0 装置

- **(0a)** 闇市を開くと `.mwNpc` が `NPC_CROWD.PLAZA.length` 個あり、それが **3**(0 ではない)。
  ⭐ これが無いと全 assert が空振りで永久緑になる
- **(0b)** 配信した `tavern.html` に `<script src="js/npc-crowd.js">` と `js/map-walk.js` があり、`window.NPC_CROWD.PLAZA` が配列
- **(0c)** 装置の検出器が生きている: ページ内で `NPC_CROWD.validate([{key:"x",kind:"stroll",from:[0,0],to:[3,0]}], PLAZA_MAP, [])` が I4 を返す

### §1 配置と絵

- **(1a)** `validate(NPC_CROWD.PLAZA, PLAZA_MAP, signs)` が ok。`signs` は**実 DOM の `.mwSign` の矩形を舞台座標へ戻したもの**(2 画面とも)
- **(1b)** 2 経路目: 6 秒間 100ms ごとに `crowdUnits()` を読み、どの時点でも足元のタイルが `PLAZA_MAP.isWalkable` で、
  かつ自分の経路(`cellsOf`)の上
- **(1c)** ⭐ 同じ 6 秒間、どの住人の `getBoundingClientRect()` も `verify_plaza_map` (1c) の押し所 5 点
  (`clientFromTile` で出した点)を含まない
- **(1d)** 3 体の `backgroundImage` が互いに違い、どれも `assets/plaza_*_walk.png`。画像を読み込み、`naturalWidth/Height` が 576x384、
  段 3 の各コマに alpha>64 の画素がある / 段 0〜2 は空
- **(1e)** `backgroundPosition` の Y が `-288px`
- **(1f)** 背丈: 段 3 の体高(alpha>64 の bbox 高・6 コマの中央値)が ゴブリン 52±3 / ホブゴブリン 56±3 / リザードフォーク 73±3 px。
  ⭐ 2 経路目として「戦闘の背丈 = 敵シート段 0 の体高 ÷ 96 × `index.html` の displaySize」をドライバが**本番の `*_anim.png` と
  `index.html` から**その場で計算し、それとの差も ±3px

### §2 動き

- **(2a)** 6 秒で 3 体とも位置が変わる(巡回が止まっていない)/ 端点で `left` が反転し、そこで `mode` が `pause`
- **(2b)** 歩いている間 `frame` が 0..5 を巡る
- **(2c)** `closePlaza()` の後 2 秒、`crowdUnits()` の位置が 1px も変わらない(rAF が止まっている)/ 開き直すと再び動く

### §3 一言

- **(3a)** 住人の中心を実クリック → `.mwNpcBubble` がちょうど 1 枚、`data-mw-npc-say` = その住人、文面 = その `say`。
  主人公の `heroTile()` が変わらず `isMoving()` が false
- **(3b)** 別の住人を押す → 吹き出しは 1 枚のまま、持ち主が替わる / 4.5 秒後に 0 枚
- **(3c)** 吹き出しの computed `pointer-events` が `none`、z-index が札(6)より大きい。
  吹き出しが出ている間も、札 7 枚の中心の `elementFromPoint` が札自身
- **(3d)** 文面は `textContent`(`say` に `<b>` を入れた変異で、吹き出しの中に `b` 要素ができない)

### §4 恒等

- **(4a)** `tavern.html` / `town.html` の中で `verify_npc_crowd` のアンカー 6 本(§2-3)がそれぞれ**ちょうど 1 回**
- **(4b)** 酒場(`#tavernStage`)の `.npcUnit` の数 = `NPC_CROWD.TAVERN.length`、地下街の中に `.npcUnit` は 0

### §5 撤退

- **(5a)** `tavern.html?undercrowd=0` → 闇市を開いても `.mwNpc` 0・`.mwNpcLayer` 0
- **(5b)** `?npc=0` → 同上 / **(5c)** `?undercity=0` → 同上(エラー無し)

### ⛔ 測らないこと

- 一言の文面そのもの(実データから読んで照合するだけ。文言は実機で直してよい)
- 暗幕の下での住人の見え方(§9 の実機で目で見る)
- 端点の静止時間の長さ(1.5〜3 秒の中の値は問わない)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nocrowd` | `crowd:` を渡さない | (0a) |
| `animsheet` | ゴブリンの `sprite` を `assets/goblin_anim.png` へ(⭐ §2-1 の罠: 段 3 = 攻撃で歩く)| (1d) |
| `row0` | `backgroundPosition` の Y を 0 へ | (1e) |
| `walkable` | リザードフォークの経路を `[7,4]→[18,4]`(露店の上)へ | (1a) |
| `oversign` | ホブゴブリンを `[10,9]→[10,13]`(札と交差)へ | (1a) |
| `tapcover` | ⭐ ゴブリンを `[6,13]→[16,13]` へ(§2-4 の罠: (17,12) を覆う)| (1c) |
| `samesheet` | ホブゴブリンにゴブリンのシート | (1d) |
| `nopause` | `closePlaza` の `crowdPause()` を外す | (2c) |
| `nostop` | 住人の click の `stopPropagation()` を外す | (3a) |
| `twobubble` | 前の吹き出しを消さない | (3b) |
| `bubblepe` | 吹き出しを `pointer-events: auto` に | (3c) |
| `innerhtml` | 吹き出しを `innerHTML` で入れる + `say` に `<b>` | (3d) |
| `anchorcopy` | ⭐ `tavern.html` に `A_BGPOS` の行をもう 1 行足す(§2-3 の罠)| (4a) |
| `retreatnoop` | `plazaCrowdTV()` の撤退判定を潰す | (5a)(5b) |

⚠ `oversign` の行き先は起草窓が実 DOM の札幅で測っていない。赤くならなければ**変異のほうを**札に確実に重なる経路へ直す
(#38 の恒久教訓 = 空振りしたら受入条件を弱めるのではなく変異を直す)。

### 既存 golden の非退行(実装後に必ず走らせる)

2026-10-25 起草窓の実測(基準 `8567dff`・`node tools/<名>.js` を既定 port で 6 本同時):

| ドライバ | 期待 |
|---|---|
| `tools/verify_npc_crowd.js` | **33/33**(変異 13 本 PENDING 0)|
| `tools/verify_plaza_map.js` | **43/43**(141 秒)|
| `tools/verify_plaza_srd.js` | **27/27** |
| `tools/verify_plaza_curio.js` | **28/28** |
| `tools/verify_tavern_map.js` | **47/47** |
| `tools/verify_town_map.js` | **85/85** |

⚠ `verify_plaza_map` は §6 の 1 条件を足した後に、**住人ありで** 43/43 と `--negative` 全赤の両方。
⚠ 走らせて違ったら、期待値を書き換える前に理由を突き止める。
⭐ #99 と同じく、母集団(全ドライバ)の緑→赤が #100 帰属で 0 件であることを §12 に書く。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須。

- 暗がりの中を住人が行き来するのが見えるか / 灯りの外で沈みすぎていないか
  (沈みすぎなら住人だけ暗幕の上にする案を別途相談。⛔ この窓では変えない)
- 武装した住人が「敵」に見えて紛らわしくないか(ユーザー決定は「荒くれとして可」)
- iPhone で住人をタップして一言が読めるか / 住人のせいで行きたい所へ歩けない場面が無いか

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>闇市の地下街に住人</b> — ゴブリン・ホブゴブリン・リザードフォークが通路を行き交う。押すと一言。"

---

## 11. やらないこと

- ⛔ 露店の店主を立たせる(別チケット候補。今回の 3 体は全員巡回)
- ⛔ codex1 への新規発注・武器を消す加工・色替え
- ⛔ 酒場の店内の歩き(`initTavernMap`)を `js/map-walk.js` へ付け替える(#98 からの別チケット候補のまま)
- ⛔ 港町・酒場の住人の描き方を `js/map-walk.js` へ寄せる(写経の解消は別チケット。今回は地下街だけ)
- ⛔ 住人を 4 体以上にする(同じ画面で同じシートを 2 人に当てない作法。増やすなら別の敵シートの畳み直しから)
- ⛔ `js/plaza-map.js` のマスク・札・露店を動かす
- `実装依頼書/README.md` の行(承認後に起草窓が足す):

    | 100 | [2026-10-25_plaza-residents.md](2026-10-25_plaza-residents.md) | **承認済** | 0% | 地下街を歩く住人 3 体(敵の歩きを住人の形式へ畳み直して流用・押すと一言)。⚠ 敵シートは段 3 = 攻撃 / 住人の処理は js/map-walk.js だけ(tavern.html へ写すと verify_npc_crowd が exit 3)/ verify_plaza_map の押し所を住人から外す |

---

## 12. 実装結果

(実装窓が埋める)
