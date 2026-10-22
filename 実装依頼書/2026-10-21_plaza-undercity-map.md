# #98 闇市の地下街 — 歩ける地図と露店 4 軒(闇市の大改修 段2)

- **起草**: 2026-10-21(起草窓) / **ステータス**: **承認済**(2026-10-21 ユーザー承認)
- **基準**: `c310d8c`(#97 完了・push 済・作業ツリー clean)。⭐ `8ad1982` → `c310d8c` の差は依頼書と README だけ = 本番のバイトは #97 §12-3 の 230 腕を回した木と同じ。
- **触るファイル**:
  - 新規 `js/map-walk.js`(歩きの部品)
  - 新規 `js/plaza-map.js`(地下街の通行マスク・露店・出口・立ち位置)
  - `tavern.html`(script 2 本・`#plazaViewport` 1 枚・CSS・闇市の開け閉めと出口の結線・露店の印・撤退 + changelog)
  - `tools/verify_tavern_map.js`(`DOM_ADDED.plazaScreen` に 1 件の申告だけ)
  - 新規 `tools/verify_plaza_map.js`(port **10637**)
  - 新規 `tools/probe_plaza_mask.js`(目視の道具・assert なし)
  - 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: `js/tavern-map.js` / `js/town-map.js` / `town.html` / `index.html` / `js/npc-crowd.js`。
  さらに `tavern.html` の中の **酒場の店内の歩き `initTavernMap`(`:10707`〜`:11527`)は 1 バイトも変えない**(§2-2・ユーザー決定)。
  並走している窓なし(2026-10-21 `git status` = clean)。

---

## 1. 目的

今の闇市ポドルプラザは「夜市の一枚絵の上に、折りたためるパネルが 2 枚あるだけ」の画面(`tavern.html:3392` `#plazaScreen`)。入って、パネルを開いて、買って、出る。歩く要素が無い。
段 1(#97)で薬屋と杖屋の品がそろったので、闇市を**歩ける地下街**に置き換える。地図の絵は codex1 から納品済み(`assets/plaza_undercity.jpg` 23x15・1 マス 64px・`3ca8938`)。

- 露店 4 軒(薬屋・杖屋・召喚屋・古物商)と掲示板を地図の上の施設にする。札を 1 回押すと、店の前まで歩いて品の板が開く(港町と同じ手触り)。
- 主人公に**灯りの輪**が付いて回り、外側は暗く沈む。露店の札だけは暗がりでも見える。
- 出口を 2 つ置く。北西の扉 = 銀の鹿亭へ(今の「← 銀の鹿亭に戻る」と同じ)/ 南西の石段 = **港町フランの石段の前へ**(今は港町から来ても酒場に落ちる)。

**ユーザー決定**:

- (2026-10-20 会議) 候補③の段 2。地下街は **`tavern.html` の中の画面**にする。別ページにすると、露店を開くたびにページが移って白く光る(#85)。
- (2026-10-21 起草) **地下街だけ新しい部品 `js/map-walk.js` で歩く。酒場の店内は 1 バイトも変えない。**
  - 不採用 = 「酒場の店内の歩きも `js/map-walk.js` へ付け替えて共有する」(会議案そのまま)。
  - 理由: 店内の歩きは約 820 行の 1 つの塊で、卓の抽選・NPC・塔の母の再会と同居していた(§2-2)。付け替えると酒場側の約 50 か所の参照を直すことになり、酒場を見ている受入 10 本前後を全部回し直す。工事がおよそ倍になる。
  - 代わりに、歩きの実装は港町・酒場・地下街の 3 つになる。酒場の付け替えは別チケット。
- (2026-10-21 起草) **在庫の抽選は #97 のまま**。品を露店へ振り分けるだけにする。品が 1 つも無い露店は「今日は何も並んでいない……」と一言出す。
  - 不採用 = 「どの露店にも必ず 1 品以上並ぶよう抽選を変える」。#97 の受入の言い直しが要る。
  - 空になる見込み(§2-5 で計算): 召喚屋 約 45% / 古物商 約 14% / 薬屋・杖屋 0%(常設の品がある)。

---

## 2. 着手前の実測(起草窓が本番コードで確かめた事実・基準 `c310d8c`)

### 2-1. 今の闇市の姿と、出入りの口

| ファイル:行 | 何 |
|---|---|
| `tavern.html:3392`〜`:3410` | `#plazaScreen` > `#plazaInner` > `#plazaSign` / `.plazaCols`(パネル 2 枚 = `#plazaQuestHead`+`#plazaQuestBoard` / `#plazaShopHead`+`#plazaShop`)/ `.plazaActions`(`#btnLeavePlaza`) |
| `tavern.html:1914` | `#plazaScreen { position: fixed; inset: 0; z-index: 150; display: none; … url('assets/plaza_bg.png') … }` |
| `tavern.html:10191` `openPlazaScreen()` | パネルの配線・折りたたみ・闇クエストの再抽選・`renderPlazaBoard`・`refreshPlazaStockIfNeeded`・`renderPlazaShop`・牙貨 → `s.style.display = "flex"` |
| `tavern.html:10203` `closePlaza()` | `display = "none"` するだけ(⇒ 港町から来ても酒場に落ちる) |
| `tavern.html:10207` `enterPlaza(opts)` | 在庫を引き直す → 初回 / 生まれつきの術師のナレ → `openPlazaScreen()` |
| `tavern.html:10220` `onTapPlazaDoor()` | 門番の判定(術師 / 変装の杖)→ `enterPlaza` か追い返し |
| `tavern.html:10657` `initEnterVia()` | 港町から `enterVia = "plaza"` で来たら `onTapPlazaDoor()`(`:10666`) |
| `tavern.html:11124` `enterDoor(d)` の `plaza` | 酒場の地図の石段 → `onTapPlazaDoor()` |
| `tavern.html:10504` `initPlaza()` | `#plazaDoor` と `#btnLeavePlaza` の配線 + 検証の橋 `window.__plazaTV` |
| `js/town-map.js:181` | `SPAWNS.plaza = [3, 11]`(闇市の石段の南の広場)。⭐ 用意はあるが、`exitVia = "plaza"` を書く人が 0(`grep -n exitVia tavern.html` = 書くのは `"tavern"` の 3 か所 `:8536` `:10681` `:11118` だけ) |
| `town.html:604`〜`:610` | `sessionStorage["dragonfighters.exitVia"]` を読んで `TM.spawnFor(exitVia)`。⇒ **`town.html` は直さずに石段の前へ立てる**。検証の窓は `window.__town`(`:870`・`spawnVia()` / `heroTile()`) |

### 2-2. ⚠⚠⚠ 罠 A — 酒場の店内の歩きは「地図の差し替え」で使い回せる形をしていない

会議は「店内の歩きを、地図のデータを差し替えて使い回す」と決めた。測ると:

- `initTavernMap` は `tavern.html:10707`〜`:11527` の **約 820 行の 1 つの IIFE**。歩きの部品(主人公の配置・カメラ・1 マスずつの補間・クリック)は約 140 行(`:10738-10866` / `:11022-11084` / `:11161-11172`)。
- 同じ閉包の中に、卓の依頼の抽選(#81)・席札・扉・奥の間・**NPC 群衆(#41)**・塔の母の再会(#83)が同居している。部品の外から `heroPx` / `hero.c` / `tileCenter` / `placeHero` / `zoom` / `SPRITE` / `FOOT` / `MS_PER_TILE` / `walkTo` などを **約 50 か所**参照している(下の計測コマンド)。
- 店内の歩きの部品の行には、tools の変異アンカーが **0 本**。アンカーが刺さっているのは同じ IIFE の抽選・札・扉・NPC の側(下表)。

| 行 | アンカー(1 回だけ出る文字列) | 持ち主 |
|---|---|---|
| `:10736` 他 7 本 | `document.body.classList.toggle("questDrawOn", …)` / `function boardValid(b, f) {` 等 | `verify_quest_draw` |
| `:10915` | `var frontier = main.find(…` | `verify_tower_mother` |
| `:10985` `:11008` `:11095` `:11100` | `var unlocked = isUnlocked(sc);` / `if (d.requiresPlazaUnlock && !plazaUnlocked()) return;` / `function goToTable(t) {` / `if (walkingTo === t.key) return;` | `verify_tavern_map` |
| `:11255` `:11326` `:11381` `:11433` | `if (!NPC_ON) return;  /* [retreatnoop] … */` 他 | `verify_npc_crowd` |
| `:11296` `:11302` | 名前札の 2 行 | `verify_party_promises` / `verify_hold_person` |

⇒ **ユーザー決定どおり、`initTavernMap` には触れない。** 歩きの部品は新しいファイル `js/map-walk.js` に作り、地下街だけが使う。

- ⭐ 写経元は酒場の部品の行(`:10800-10866` / `:11022-11084` / `:11161-11172`)。式は 1 つも変えない:
  - 足元をタイル中心に置く 2 行
  - `MS_PER_TILE = 340` とコマ送りの除数 190
  - compact の倍率の規則(1 マス 34〜96px)
- ⛔ `tavern.html` の中に写さない。写すと上表のアンカーが「ファイルに 2 回」になり、該当ドライバが起動時に exit 3 で止まる(`verify_tavern_map.js:288` / `verify_npc_crowd.js:315` の `split(from).length - 1 !== 1`)。
- ⚠ 変数名は `TM`(港町)・`TVM`(酒場)と別の名前にする。`tavern.html:10714` のコメントのとおり、同名にした過去に `verify_town_map` の変異 `snapnear` が 2 ファイルへヒットした。

### 2-3. ⚠⚠⚠ 罠 B — 露店ごとに絞って描くと、#97 の受入が落ちる / 別の品を買う

- 購入ボタンは**通しの添字**で品を指す: `renderPlazaShop()`(`:10476`)が `data-idx="' + i + '"` を振り、`onPlazaBuy(idx)` は `plazaShopRowsTV()[idx]` を買う。
- `verify_plaza_srd` (5a) は `T.renderPlazaShop()` の直後に `#plazaShop .pbuy[data-idx="<通しの添字>"]` を探す(`verify_plaza_srd.js:750` / `:763`)。
- ⇒ 露店の品だけを描くように `renderPlazaShop` を変えると、2 つの壊れ方をする:
  - 開いている露店以外の品のボタンが DOM から消え、(5a) が赤くなる。
  - 添字を露店の中で振り直すと、押した行と別の品を買う。
- **だからこう決める**: `renderPlazaShop` は**今までどおり全行を描く**。各行に `data-stall="<露店の key>"` を付けるだけにする。開いている露店以外の行は **CSS で隠す**(`#plazaShop[data-open-stall="potion"] .pshopItem:not([data-stall="potion"]) { display: none; }` の形)。`data-idx` は通しのまま。
- ⭐ この罠は変異 `filteridx` として §8 に内蔵させる。

### 2-4. ⚠⚠ 罠 C — 「どの露店か」を品の表に書くと、#97 の受入が落ちる

- `verify_plaza_srd` (0b) は `index.html` の `PLAZA_ITEMS` / `PLAZA_ITEMS_COMMON` と `tavern.html` の `_TV` の写しを、**実行時の定義を丸ごと `JSON.stringify` して**突き合わせる(`verify_plaza_srd.js:452` 付近の `all` / `ixAll`)。
- ⇒ `tavern.html` の品の表だけに `stall:` 欄を足すと不一致で赤。両方に足すと、`index.html` を触る理由のない変更になる。
- **だからこう決める**: 露店と品の対応は **`js/plaza-map.js` の `STALLS[].items`(品の id の列)** に持つ。品の表(両ファイル)は 1 文字も変えない。
- 品の id は #97 の時点で **16 個**(`PLAZA_ITEMS_TV` 6 + `PLAZA_ITEMS_COMMON_TV` 10 = 新しい品 8 + 目玉の旧 4 + 古い一般品 4)。
  - 古い 4 品は `retired` で、撤退 `?plazasrd=0` のときだけ在庫に出る。
  - 16 個がちょうど 1 つずつ、どこかの露店に属すること(§8 (2a))。
  - ⭐ 段 3(#99)で品を足すとこの assert が赤くなり、割り振りを忘れない仕組みになる。

### 2-5. 露店と品の割り振り(ユーザー確認済み)と、空になる見込み

地図の絵の露店(天幕の色と並んだ品)にそろえた:

| key | 露店 | 絵 | 品(id) |
|---|---|---|---|
| `potion` | 薬屋 | 北西・青緑の天幕・薬瓶と釜 | `potion_healing`(常設)/ `potion_greater_healing` / `potion_fire_resistance` / `potion_invisibility` / `oil_of_sharpness` / 古い `potion_shadow` |
| `wand` | 杖屋 | 北東・紫の天幕・杖と巻物 | `wand_polymorph`(常設)/ `wand_magic_missiles` / `pearl_of_power` |
| `summon` | 召喚屋 | 南西・赤の天幕・魔法陣と骸骨 | `scroll_create_golem` / `scroll_animate_dead` |
| `curio` | 古物商 | 南東・緑の天幕・武具 | `ring_spell_turning` / `dust_sneezing_choking` / 古い `fang_charm` / `cursed_blade` / `medusa_mirror`(段 3 で装備品が加わる) |

空になる見込み(`refreshPlazaStock` `:10423` の引き方から計算。撤退していないとき):

- 一般枠 = 5 品(ヒーリングを除く新しい一般品)から 3〜5 品。目玉 = 5 品から 1〜2 品。常設 = 変装の杖・ヒーリング。
- **召喚屋**: 目玉が 1 品なら巻物 2 つとも外れる確率 3/5、2 品なら C(3,2)/C(5,2) = 3/10。平均 **0.45**。
- **古物商**: ダストが外れる確率(3 品 2/5・4 品 1/5・5 品 0 の平均 0.2)× 指輪が外れる確率(0.7)= **0.14**。
- 薬屋と杖屋は常設があるので **0**。

### 2-6. `verify_tavern_map` (6c) が固めているのは「静的な HTML の形」だけ

- (6c) は `tavern.html` の**ソースの文字列**から `id="plazaScreen"` の部分木を切り出す。そして「タグ名 + id + class の並び」を固定コミット `638b479` の同じ部分木と比べる(`verify_tavern_map.js:983` `subtreeOf` / `domSig`)。
- 許されるのは `DOM_ADDED`(`:543`)で申告した**挿入だけ**。今は `plazaScreen: []`。
- ⇒ 実行時に JS で作る DOM は (6c) に写らない。静的に足すタグは**順序どおり申告**する(`(6c2)` が「申告が素通しでない」ことを見張っている)。
- **だからこう決める**: 静的に足すのは `#plazaScreen` の**最初の子の `<div id="plazaViewport"></div>` 1 枚だけ**。
  - 申告は `plazaScreen: ['div#plazaViewport']`。
  - 舞台・主人公・影・行き先の印・暗幕・札・板を閉じるボタンは、すべて `js/map-walk.js` と `tavern.html` の JS が生やす。
- ⛔ `DOM_BASE` を動かして緑にしない(`:531` のコメント)。

### 2-7. 既存の受入が闇市について見ているもの(`grep -l -w` 2026-10-21)

| 語 | 持ち主 | 見ているもの |
|---|---|---|
| `plazaScreen` | `verify_tavern_map` (6c) / `verify_town_map` (6s-plaza) | 静的 DOM の形 / 港町から入ると `#plazaScreen` が見えている |
| `plazaShop` | `verify_plaza_srd` (5a) | `#plazaShop .pbuy[data-idx=…]`(罠 B) |
| `tavernDoor_plaza` | `verify_tavern_map` (4c) | 解禁前は酒場の石段の札が DOM に無い |
| `doorVisible` の 1 行 `:10515` | `verify_recruit_talk` | ⛔ この行を書き換えない(アンカー) |
| `plazaShopHead` / `plazaQuestHead` / `btnLeavePlaza` / `openPlazaScreen` / `enterPlaza` / `closePlaza` / `onTapPlazaDoor` | **0 本** | — |

### 2-8. 地図と通行マスクの下書き

- `tools/make_grid_map.py:423` `GRIDS["plaza-undercity"]` = `cells (23, 15)` / `tile 64`。
- `assets/plaza_undercity.jpg` = **1472x960**(= 23×64 × 15×64・`PIL` で実測)。港町と同じ 1 マス 64px。
- 主人公の絵は 96px のセル ⇒ 港町と同じく表示は 1.5 倍。

**通行マスクの下書き**:

- 起草窓が絵に格子番号を重ねて読み、BFS で検算した。歩けるマス 125・2 つの立ち位置から全部届く・孤立 0・下の入場タイルと立ち位置 9 か所すべて歩ける。
- ⚠ 下書きなので、項目 1 で `probe_plaza_mask.js` を使い、本番の絵の上で 1 マスずつ直すこと。
- ⭐ 作法は `.claude/skills/codex-map-request/references/mask-authoring.md`:
  - 塞ぐ理由を 1 語にまとめない
  - 4 近傍
  - 迷ったら塞がない。ただし孤立は禁止

```js
/*   `.` 歩ける / `W` 石壁・柱・柵の内側 / `S` 階段 / `D` 扉 / `s` 露店・天幕
 *   `c` 木箱・樽・燭台・卓 / `~` 地下水路 / `x` 対岸の通路 (橋の柱で塞がれて渡れない)
 *        0         1         2
 *        01234567890123456789012                                                     */
var MASK = [
  /* row  0 */ "WSDWWWWWWWWWWWWWWWWWWWW",   // (1,0)-(1,2) 酒場への木の階段 / (2,0) 扉
  /* row  1 */ "WS.cc..ccccWWWc...cW~xW",   // (2,1) = 扉の前 / (11,1)-(13,1) 北の壁の掲示板
  /* row  2 */ "WS....sssss..ssss..W~xW",   // 薬屋 (6-10) / 杖屋 (13-16)
  /* row  3 */ "Wc....sssss..ssss..W~xW",
  /* row  4 */ "WWW...sssss..ssss..W~xW",   // (0-2,4)-(0-2,6) 柵で囲まれた張り出し
  /* row  5 */ "WWWc..ssss...s..s..W~xW",   // (14,5)(15,5) 杖屋の敷物 = 平置きなので歩ける
  /* row  6 */ "WWW................W~xW",
  /* row  7 */ "WcW...................W",   // (19,7)-(21,7) 東の小橋 (行き止まりの眺め)
  /* row  8 */ "Wcc...ssss...ssss..W~xW",   // 召喚屋 (6-9/6-10) / 古物商 (13-16)
  /* row  9 */ "Wc....sssss..ssss..W~xW",   // (2,9) 石段の上の踊り場
  /* row 10 */ "W..Wc.sssss..ssss..W~xW",   // (1,10)(2,10) 港町への石段の最上段
  /* row 11 */ "WSSWc.sssss..ssss..W~xW",
  /* row 12 */ "WSSWcc............cW~xW",
  /* row 13 */ "WSSWcc............cW~xW",
  /* row 14 */ "WWWWWWWWWWWWWWWWWWWWWWW"
];
```

**施設・出口・立ち位置の下書き**(`enter` = 歩いて着くタイル、`sign` = 札を浮かせるタイル):

| key | 名前 | enter | sign | 着いたら |
|---|---|---|---|---|
| `potion` | 薬屋 | (8,6) | (8,3) | 品の板(薬屋の品だけ見せる) |
| `wand` | 杖屋 | (14,6) | (15,3) | 同上(杖屋) |
| `summon` | 召喚屋 | (8,12) | (8,9) | 同上(召喚屋) |
| `curio` | 古物商 | (14,12) | (14,9) | 同上(古物商) |
| `board` | 闇クエスト掲示板 | (12,2) | (12,1) | 闇クエストの板 |
| `tavern` | 銀の鹿亭へ | (2,1) | (3,2) | `closePlaza()`(今の「← 銀の鹿亭に戻る」と同じ) |
| `town` | 港町への石段 | (2,10) | (2,12) | `exitVia = "plaza"` → `town.html`。⚠ `?town=0` では DOM に作らない |

- 立ち位置: `SPAWNS = { tavern: [2, 2], town: [2, 9] }`。未知 / 欠損は `tavern` へ落とす。
- ⚠ 札どうしは重ねない。港町の実測では、札の幅 240px ⇒ 同じ行なら 3.75 タイル以上あける(`js/town-map.js:158` のコメント)。
  - 下書きは「掲示板 (12,1)」と「杖屋 (15,3)」が 3 タイル差だが、行が 2 つ違う。
  - §8 (3d) が矩形の交差 0 を見張るので、赤なら sign を動かす(enter は動かさない)。

### 2-9. ⚠ 改行は CRLF(新しい js も)

- `.gitattributes` = `*.html` / `js/*.js` / `audio.js` は `text eol=crlf`(配信物 22 本)。
- `tools/check_tree_eol.py` と `verify_eol_doorfix` は、作業ツリーの配信物の行末の食い違いを**致命**として扱う。
- ⇒ `js/map-walk.js` / `js/plaza-map.js` は**作業ツリーでも CRLF** で置くこと。Write ツールは LF で書くので、`py` でバイト変換する(メモリ「CRLF が LF に化ける」の作法)。
- `tavern.html` の編集も、行末を崩さないように `py` でバイト単位に行う。
- ⚠ 行末は grep で測らない(`check_tree_eol.py` の注意書き)。
- ⭐ 配信物が 22 本 → 24 本に増える。本数を直書きした受入が無いかを項目 1 で `grep -n '22' tools/verify_eol_doorfix.js tools/check_tree_eol.py` で確かめる。起草窓が見た範囲では、`.gitattributes` の宣言行の数しか数えていない(`verify_eol_doorfix.js:366`)。

### 2-10. changelog の要否

- `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ `tavern.html` を触るので**鳴る**。
- プレイヤー向けの要約は実在する(闇市が歩ける地下街になる・露店ごと・港町へ戻れる)。§10 の 1 行を使う。
- ⚠ 項目 1(新しい js 2 本と tools)は `tavern.html` を触らないので、単独でコミットしてよい(フックは鳴らない)。

**計測コマンド**(再測定するとき):

    grep -n 'function enterPlaza\|function closePlaza\|function onTapPlazaDoor\|function openPlazaScreen\|function renderPlazaShop\|function refreshPlazaStock\b\|(function initEnterVia\|(function initPlaza()\|(function initTavernMap\|id="plazaScreen"' tavern.html
    awk 'NR>=10707 && /^  \}\)\(\);/ {print NR; exit}' tavern.html                     # initTavernMap の終わり (11527)
    sed -n '520,560p' tools/verify_tavern_map.js                                          # DOM_BASE / DOM_ROOTS / DOM_ADDED
    for a in plazaScreen plazaShop plazaShopHead btnLeavePlaza tavernDoor_plaza; do echo $a; grep -l -w -F "$a" tools/*.js; done
    py -I -X utf8 <scratch>/anchor_scan.py . tavern.html 10707 11527                      # tools の文字列リテラルで tavern.html に 1 回だけ出るもの (起草窓の使い捨て道具・中身は §8 の作法と同じ)
    py -I -c "from PIL import Image; print(Image.open('assets/plaza_undercity.jpg').size)"

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/map-walk.js`(新規・CRLF) | 歩きの部品 `window.MAP_WALK.create(opts)`(§4-1) |
| `js/plaza-map.js`(新規・CRLF) | `window.PLAZA_MAP`(§4-2)= 通行マスク・露店・掲示板・出口・立ち位置・`findPath`・`stallOf(itemId)` |
| `tools/probe_plaza_mask.js`(新規) | `tools/probe_town_mask.js` の形で、本番の `js/plaza-map.js` と本番の絵を重ねて PNG に出す。⛔ 道具の中にマスクを写さない |
| `tavern.html` | §5: script 2 本 / `#plazaViewport` / CSS / 地図の起動・開け閉め・露店の印・出口・撤退 + changelog |
| `tools/verify_tavern_map.js` | `DOM_ADDED.plazaScreen` に `'div#plazaViewport'` を 1 件と、`:533` の注記の形で日付と理由を 1 段落 |
| `tools/verify_plaza_map.js`(新規) | §8 |

- ⛔ `initTavernMap`(`tavern.html:10707`〜`:11527`)/ `js/tavern-map.js` / `js/town-map.js` / `town.html` / `index.html` / 品の表(両ファイル)/ `refreshPlazaStock` の引き方 は変えない。§8 (5a)〜(5c) が機械で見張る。

---

## 4. STEP1 — 新しい部品 2 本(`tavern.html` は触らない)

### 4-1. `js/map-walk.js` — `window.MAP_WALK.create(opts)`

classic script(ES module にしない)。公開物は末尾で明示的に `window` へ載せる(`js/tavern-map.js` と同じ作法)。

```js
/* opts:
 *   map      … { COLS, ROWS, TILE, inBounds, isWalkable, findPath }  (PLAZA_MAP を渡す)
 *   viewport … この中に舞台を生やす要素 (#plazaViewport)
 *   image    … 地図の絵 ("assets/plaza_undercity.jpg")
 *   heroSheet… "assets/<class>_walk.png"
 *   spawn    … { c, r }
 *   light    … { inner: 192, outer: 384, alpha: 0.72 } | null   (初期値。§9 で動かす)
 *   insets   … function () { return { top, bottom }; }          (帯を引いた可視域)
 * 戻り値: { stage, layout, walkTo(c, r, onArrive, key), stop, placeAt(c, r),
 *          heroTile, heroPx, isMoving, zoom, walkingTo,
 *          clientFromTile, tileFromClient, addSign(o), geom } */
```

- **式は酒場の部品をそのまま写す**(写経元 `tavern.html:10802-10812` / `:10820-10866` / `:11025-11084` / `:11162-11172`):
  - 足元をタイル中心に置く 2 行(`left = cx - SPRITE/2` / `top = cy - SPRITE*FOOT`)
  - `SPRITE = 96` / `FOOT = 0.93` / `SHEET_ROW_RIGHT = 3`
  - `MS_PER_TILE = 340` / コマ送りの除数 190
  - compact 判定の 3 条件と倍率の規則(1 マス 34〜96px)
  - 歩けないタイルを押したら動かない(寄せない)
  - ⛔ 数を変えない(港町・酒場と同じ速さ・同じ大きさ)
- **同じ行き先の再クリックは黙って吸収する**(酒場の罠 A `tavern.html:11087`。`walkingTo === key` で return)。⭐ 変異 `reclick`。
- **隠れている間の `layout()` は何もしない**(`viewport.clientWidth === 0` なら return)。開いた後に必ず `layout()` を呼ぶ。⭐ 変異 `nolayout`。
- **灯り**: 舞台の中に `.mwLight` を 1 枚生やす。
  - 大きさ = 舞台の 2 倍(`2*MAP_W x 2*MAP_H`)。`background: radial-gradient(circle at center, transparent <inner>px, rgba(8,4,16,<alpha>) <outer>px)`。
  - 主人公の足元を中心にするよう `transform: translate(heroX - MAP_W, heroY - MAP_H)` で動かす(⭐ 毎フレーム `background` を書き換えない = 再描画を避ける)。
  - `pointer-events: none`。⭐ 変異 `lightblock`。
  - ⛔ canvas を作らない / `filter` / `backdrop-filter` / `mix-blend-mode` を使わない(会議の決定「CSS 1 枚・ぼかし無し」)。
- **重なりの順**: 絵 < 主人公の影 < 主人公 < 暗幕 < 札。⇒ 札は暗がりでも見えて押せる(会議のミサキ案)。⭐ 変異 `signunder`。
- `addSign(o)` は酒場の `makeSign`(`tavern.html:10879`)と同じ形(名前 + 1 行の説明・`click` で `stopPropagation`)。
  - id は `plazaSign_<key>`、class は `mwSign`。
  - ⛔ class を `tavernSign` にしない(酒場の CSS と受入の数え上げに混ざる)。
- ⛔ 変数名に `TM` / `TVM` を使わない(§2-2)。

### 4-2. `js/plaza-map.js` — `window.PLAZA_MAP`

`js/town-map.js` と同じ形と作法(冒頭コメントの「座標系」「記号を 2 種類にしない理由」「4 近傍」もそろえる):

```js
var COLS = 23, ROWS = 15, TILE = 64;   // ★assets/plaza_undercity.jpg = GRIDS["plaza-undercity"]
var MASK = [ /* §2-8 の下書き → probe で直したもの */ ];
var LEGEND = { ".": …, "W": …, "S": …, "D": …, "s": …, "c": …, "~": …, "x": … };
var STALLS = [
  { key: "potion", name: "薬屋",   enter: [8, 6],  sign: [8, 3],  desc: "<1 行>",
    items: ["potion_healing", "potion_greater_healing", "potion_fire_resistance", "potion_invisibility",
            "oil_of_sharpness", "potion_shadow"] },
  { key: "wand",   name: "杖屋",   enter: [14, 6], sign: [15, 3], desc: "<1 行>",
    items: ["wand_polymorph", "wand_magic_missiles", "pearl_of_power"] },
  { key: "summon", name: "召喚屋", enter: [8, 12], sign: [8, 9],  desc: "<1 行>",
    items: ["scroll_create_golem", "scroll_animate_dead"] },
  { key: "curio",  name: "古物商", enter: [14, 12], sign: [14, 9], desc: "<1 行>",
    items: ["ring_spell_turning", "dust_sneezing_choking", "fang_charm", "cursed_blade", "medusa_mirror"] }
];
var BOARD = { key: "board", name: "闇クエスト掲示板", enter: [12, 2], sign: [12, 1], desc: "<1 行>" };
var EXITS = [
  { key: "tavern", name: "銀の鹿亭へ",   enter: [2, 1],  sign: [3, 2],  desc: "<1 行>" },
  { key: "town",   name: "港町への石段", enter: [2, 10], sign: [2, 12], desc: "<1 行>", to: "town.html" }
];
var SPAWNS = { tavern: [2, 2], town: [2, 9] };
function stallOf(itemId) { /* STALLS を引く。無ければ null */ }
```

- `desc` の文言は実装窓が決めてよい(港町の札と同じ長さ = 1 行 15〜20 字・札の幅 240px 以内)。
- `findPath` は `js/town-map.js:96` と同じ形(4 近傍・マンハッタン・始点を含まない・届かなければ `null`)。
- ⛔ 品の名前・値段を写さない。持つのは id だけ(罠 C)。

### 4-3. `tools/probe_plaza_mask.js` で絵と突き合わせる

- `probe_town_mask.js` を写す。読むのは `/js/plaza-map.js` と `/assets/plaza_undercity.jpg`、出すのは PNG 1 枚。
- 見るのは `mask-authoring.md` の 3 つ:
  - 縁が 1 マスずれていないか
  - `enter` が `.` か
  - 2 つの立ち位置から全部の `enter` へ `findPath` が通るか
- ⚠ 下書きで迷ったマス(読み違えると目に付く所):
  - 北の壁ぞいの樽と木箱 (6,1)〜(10,1) / (14,1)
  - 薬屋の敷物 (8,5)
  - 張り出しの柵 (1,5)〜(2,6)
  - 石段の上の踊り場 (1,9)(2,9)
  - 召喚屋の右の鎧 (10,9)〜(10,11)
- 項目 1 のコミット = 新しい js 2 本(CRLF)+ probe。`tavern.html` を触らないので changelog 不要。

---

## 5. STEP2 — `tavern.html` に地下街をつなぐ

### 5-1. 読み込みと静的 DOM

- `<script src="js/tavern-map.js"></script>`(`:2881`)の**次の行**に `js/map-walk.js` と `js/plaza-map.js` の 2 本を足す。
  - ⛔ `:2881` の行そのものは変えない(`verify_tavern_map` の変異 `nomapjs` のアンカー)。
- `#plazaScreen` の最初の子に `<div id="plazaViewport"></div>` を 1 枚。
  - `tools/verify_tavern_map.js` の `DOM_ADDED.plazaScreen` に `'div#plazaViewport'` を申告する(§2-6)。

### 5-2. 撤退スイッチ `isUndercityOnTV()`(1 か所)

```js
/* ★[#98] 撤退 ?undercity=0 — 闇市を #97 までのパネル 2 枚の画面へ戻す。
   ⚠ 判定はここ 1 か所 (酒場の ?questdraw=0 と同じ作法)。⚠ クエリはページ遷移をまたがない (dev 専用)。 */
function isUndercityOnTV() {
  try { return new URLSearchParams(location.search).get("undercity") !== "0"; } catch (e) { return true; }
}
```

- OFF のときは起動時に `#plazaViewport` を **DOM から remove** する(`display:none` で残さない = 酒場の `?tavernmap=0` と同じ作法)。
- OFF のときは `data-stall` も付けない。⇒ 闇市の画面は 1 バイトも #97 と変わらない(§8 (6a))。
- `window.PLAZA_MAP` / `window.MAP_WALK` が無い(読み込み失敗)ときも OFF と同じ姿へ落とす。
  - ⛔ 握り潰さない(`console.warn` を 1 行)。

### 5-3. 開け閉め(ON のとき)

- `body.plazaMapOn` を付ける。CSS は次のとおり:
  - `#plazaScreen` は暗い地の色だけ(一枚絵 `plaza_bg.png` を敷かない)。
  - `#plazaViewport` が全面。
  - `#plazaInner`(パネルの板)は既定で隠し、露店か掲示板を開いたときだけ地図の上に浮かせる。
- **入った場所の決め方**: `enterPlaza(opts)` に `opts.from`(`"town"` / それ以外)を通す。
  - `initEnterVia` の `onTapPlazaDoor()`(`:10666`)だけ `onTapPlazaDoor({ from: "town" })` にする。`onTapPlazaDoor` は受け取った `from` を `enterPlaza` へ渡す。
  - ⇒ 港町から = `SPAWNS.town`、酒場の石段 / 怪しい扉から = `SPAWNS.tavern`。
  - ⚠ 門番の判定(`onTapPlazaDoor`)は今までどおり**必ず通す**(`:10652` のコメント)。
- `openPlazaScreen()` の最後(`display = "flex"` の後):
  - 地図を初回だけ生やす(`MAP_WALK.create`)。
  - 立ち位置に置く → `layout()`(罠 = 隠れていたときの 0 寸法)。
  - 板は閉じた状態にする。
- `closePlaza()`: 歩きを止める(`stop()`)/ 板を閉じる / `display = "none"`。
  - ⚠ rAF を残さない。
- 札の配線:
  - 露店 → `enter` へ歩いて着いたら `openStall(key)`。
    - `#plazaShop` に `data-open-stall=key` を立て、品の板だけを開く(闇クエストの板は隠す)。
    - その露店の行が 0 なら「今日は何も並んでいない……」を板の中に出す(JS で生やす要素)。
  - 掲示板 → `openBoard()`(闇クエストの板だけ)。
  - 出口 `tavern` → `closePlaza()`。
  - 出口 `town` → `sessionStorage.setItem("dragonfighters.exitVia", "plaza")` → `location.href = "town.html"`。
    - ⛔ `enterVia` を書かない(酒場の一回性キー)。
    - ⛔ クエリを足さない(#6 / #12 の作法)。
    - ⛔ `window.__townOff` のときは札を **DOM に作らない**(酒場の `tavern.html:11006` と同じ)。
- 板を閉じるボタン(「← 地下街へ」)は JS で生やす(静的 DOM を増やさない)。
- `#btnLeavePlaza`(← 銀の鹿亭に戻る)は板の中に残る。地図モードでも押せば今までどおり `closePlaza`。
- 地図の空きタイルを押すと、そこへ歩く(`tileFromClient`)。

### 5-4. `renderPlazaShop` に露店の印(罠 B)

- 各行の `<div class="pshopItem"` に、ON のときだけ ` data-stall="<PLAZA_MAP.stallOf(id)>"` を足す。
- `data-idx` は通しのまま。全行を描くのも今までどおり。
- 開いていない露店の行を隠すのは CSS だけ。
- ⛔ 品の表・`refreshPlazaStock`・`onPlazaBuy`・`plazaShopRowsTV` は変えない。
- ⛔ `:10515`(`doorVisible`)の行を書き換えない(`verify_recruit_talk` のアンカー)。

### 5-5. 検証の窓

`window.__plazaTV` に読み取り専用で足す:

- `map: { on, heroTile, heroPx, isMoving, zoom, walkingTo, geom, clientFromTile, tileFromClient, signKeys, openStall, lightCenter }`

⛔ 状態を書き換える口は作らない(在庫を仕込むのは今ある `getStock()` の配列と `refreshPlazaStock`)。

---

## 6. STEP3 — なし

(地図・露店・出口・灯りは STEP2 で全部。住人と店主の絵は §11)

---

## 7. 撤退スイッチ

- **`?undercity=0`** — 闇市が #97 までの「一枚絵 + パネル 2 枚」に戻る。`#plazaViewport` は DOM に無い。`data-stall` も付かない。出口は「← 銀の鹿亭に戻る」だけ(港町から来ても酒場に落ちる = #97 と同じ)。
- ⚠ 判定位置 = `tavern.html` の `isUndercityOnTV()` 1 か所。**ページ遷移はまたがない**(港町の石段から入り直すと ON に戻る = dev 専用)。

---

## 8. 受入条件 — `tools/verify_plaza_map.js`(新規・port **10637**)

**方針**:

- 本番の `tavern.html` を実 Chrome(`puppeteer-core`)で開き、配信バイトを起動時に凍結する(`verify_tavern_map` の作法)。
- 解禁済み + 変装の杖 1 本の localStorage を種にまいて闇市へ入り、**札とタイルを実際に押して**歩かせる(`clientFromTile` → `page.mouse.click`)。
- 経路はブラウザの `PLAZA_MAP.findPath` を呼ぶ。⛔ 自前で BFS を書かない(`mask-authoring.md`)。
- desktop 1440x900 と compact 390x844(`hasTouch`)の 2 つで見る。
- ⛔ 灯りの見た目・fps は測らない(§9)。

### §0 装置

- **(0a)** `window.PLAZA_MAP` と `window.MAP_WALK` が `tavern.html` から見える。闇市を開くと `#plazaViewport` の中に舞台・主人公・暗幕 1 枚・札 7 枚が在る。
  - ⭐ これが無いと全 assert が空振りで永久緑になる(#23 の読み込み忘れ事故)。
- **(0b)** マスクが 15 行 × 23 桁、`TILE = 64`。これが `tools/make_grid_map.py` の `GRIDS["plaza-undercity"]`(ソースのバイトから読む)の `cells` / `tile` と一致し、絵の実寸 1472x960(`naturalWidth/Height`)とも一致する。
- **(0c)** 品の母集団 = `PLAZA_ITEMS_TV` ∪ `PLAZA_ITEMS_COMMON_TV` の id が **16 個**ある(ゼロ件で (2a) が空振りしない)。

### §1 歩き

- **(1a)** 歩けるマス全部へ、2 つの立ち位置の両方から `PLAZA_MAP.findPath` が届く。孤立 0。
- **(1b)** 露店 4・掲示板・出口 2 の `enter` と立ち位置 2 つが全部 `.`。
- **(1c)** 地図のタイル 3 か所(暗がりの奥を 1 つ含む)を実際に押すと、主人公がそのタイルに着く。押した点の `elementFromPoint` は暗幕ではない。
- **(1d)** 開いた直後に、主人公が viewport の内側に見えている(desktop / compact)。1 マスの表示 px が 34〜96。
- **(1e)** 同じ露店の札を `MS_PER_TILE x 0.55` の間隔で連打しても、5 秒以内に `enter` に着いて板が開く(罠 A の再クリック)。

### §2 露店と品

- **(2a)** 16 個の id が、それぞれちょうど 1 つの露店に属す。2 経路で見る:
  - `PLAZA_MAP.STALLS` の実行時の値
  - `js/plaza-map.js` のソースのバイトを読んだ `items:` の列
  - 余り(表に無い id)も 0。
- **(2b)** 在庫を 4 露店すべてに 1 行以上ある形に仕込む(`getStock()` の配列)。露店ごとに札を押す → `enter` へ歩いて着く → 品の板が開く。そのとき:
  - 見えている行(`offsetParent !== null`)の品が全部その露店のもの。
  - 在庫のうちその露店の品が全部見えている。
  - 闇クエストの板は見えていない。
- **(2c)** ⭐ 4 露店それぞれで、見えている行の「購入」を押すと、**押した行の品**が持ち物に 1 増える(罠 B)。他の品は増えない。
- **(2d)** 召喚屋の品を在庫から抜いて召喚屋を開くと、「今日は何も並んでいない」が見え、見えている購入ボタンは 0。
- **(2e)** 掲示板の札 → 闇クエストの板が開き、品の板は見えない。

### §3 灯り

- **(3a)** 暗幕(`.mwLight`)は闇市の中に 1 枚だけ。その他:
  - `pointer-events: none`
  - 闇市の中に `canvas` が 0 枚
  - 暗幕と舞台の `filter` / `backdrop-filter` / `mix-blend-mode` が `none` / `normal`
- **(3b)** 歩いた後、暗幕の中心(`getBoundingClientRect` の中心)と主人公の足元の画面座標の差が 1px 以内(desktop / compact)。
- **(3c)** 札 7 枚それぞれの中心で `elementFromPoint` が札自身(またはその子)。灯りの外に居る札も同じ。
- **(3d)** 札どうしの矩形が 1 組も交差しない(desktop / compact)。

### §4 出入り

- **(4a)** 酒場の地図の石段から入ると (2,2) に立つ。港町から入る(`sessionStorage["dragonfighters.enterVia"] = "plaza"` を置いて `tavern.html` を開く)と (2,9) に立つ。
- **(4b)** 港町への石段の札 → (2,10) へ歩く → `town.html` へ移り、主人公が **(3,11)** に立つ(港町の `window.__town` の `spawnVia() === "plaza"` + `heroTile()`)。
- **(4c)** `tavern.html?town=0` では、石段の札 `plazaSign_town` が DOM に無い。
- **(4d)** 銀の鹿亭への札 → (2,1) へ歩く → `#plazaScreen` が閉じる。酒場の地図の主人公のタイルは入る前と同じ。歩きの rAF が止まっている(`isMoving() === false`)。
- **(4e)** 変装の手段が無い種(杖 0・戦士)では、港町から来ても地図が開かない(門番の追い返しを経る)。

### §5 恒等(非退行)

- **(5a)** 配信中の `tavern.html` の `(function initTavernMap() {` から次の `})();` までの文字列が、`git show c310d8c:tavern.html` の同じ範囲と**バイト一致**(ユーザー決定「酒場は 1 バイトも変えない」)。
- **(5b)** `js/tavern-map.js` / `js/town-map.js` / `town.html` / `index.html` / `js/npc-crowd.js` が `c310d8c` とバイト一致。
- **(5c)** `tavern.html` の品の表 2 つ(`PLAZA_ITEMS_TV` / `PLAZA_ITEMS_COMMON_TV` の宣言から閉じ括弧まで)と `refreshPlazaStock` の関数本体が `c310d8c` とバイト一致。

### §6 撤退

- **(6a)** `tavern.html?undercity=0` → 次のとおり #97 と同じ姿:
  - `#plazaViewport` が DOM に無い。
  - `body.plazaMapOn` が無い。
  - `renderPlazaShop` の出した HTML に `data-stall` が 0。
  - パネル 2 枚が見えている。

### §9

- **(9a)** pageerror / console error 0 件(酒場・港町)。

### ⛔ 測らないこと

- 灯りの半径・濃さ・色(§4-1 は初期値。§9 で動かす余地を残す)。
- 札の文言・露店の `desc` の細部。
- 歩く速さ(`MS_PER_TILE` は港町・酒場と同じ 340 を写す。数値の assert にはしない)。
- iPhone の fps(§9)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `filteridx` | ⭐ `renderPlazaShop` が開いた露店の行だけを描き、`data-idx` を露店の中で 0 から振る(罠 B) | (2c) |
| `missingitem` | `STALLS` から `pearl_of_power` を 1 つ外す | (2a) |
| `reclick` | 同じ行き先の再クリックを吸収しない(`walkingTo` の return を潰す) | (1e) |
| `nolayout` | `openPlazaScreen` の後の `layout()` を呼ばない(隠れていたときの寸法のまま) | (1d) |
| `lightblock` | 暗幕の `pointer-events` を `auto` にする | (1c)(3a) |
| `signunder` | 札の z-index を暗幕より下にする | (3c) |
| `wrongvia` | 港町への石段で `exitVia` に `"tavern"` を書く | (4b) |
| `townleak` | `?town=0` でも石段の札を作る | (4c) |
| `blockenter` | マスクの (14,6) を `s` にする(杖屋に入れない) | (1b) |
| `noretreat` | `isUndercityOnTV()` が常に true | (6a) |

- 変異はすべて配信スナップショットをメモリ上で置換して作る。⛔ 本番ファイルを書き換えない。
- アンカーは「ファイルに 1 回」を起動時に検算する(`verify_tavern_map.js:288` の作法)。

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指しで先に回す本:
  - `verify_tavern_map`(素 + `--negative`・(6c) が `DOM_ADDED` 込みで緑)
  - `verify_town_map`(6s-plaza)
  - `verify_plaza_srd`(素 + neg・(0b)(5a))
  - `verify_npc_crowd`
  - `verify_recruit_talk`
  - `verify_quest_draw`
  - `verify_eol_doorfix`
  - `py tools/check_tree_eol.py`
- `tavern.html` を触るので、#97 と同じく**母集団の全数走査**を最後の項目で行う(#97 §12-3 の 230 腕 + `verify_plaza_map` 素 / neg)。
- ⚠ 基準の色:
  - #97 §12-3 の post97(HEAD `8ad1982` = 本番のバイトは `c310d8c` と同じ)= **緑 208 / 非緑 22**(2026-10-21)。
  - 項目 1 の先頭で、名指しの本だけは `c310d8c` の色を控え直す。
- ⚠ 既知の揺れ: `driver_monsters_griffon` / `verify_tower_mother_b --negative`(#97 K 候補)/ `verify_lore_check` (1j)。
- ⚠ port 8897 を 4 本が共有(#97 K1)⇒ 全数走査は直列で。
- ⭐ 変異アンカーの衝突は、全 tools の文字列リテラルを `c310d8c` と実装後で数え直して測る(#97 §12-3 の方法)。特に「1 だった / 1 になった / 0→出現」の組を全部見る。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http で起動する(`file://` では音声が出ない)。

- iPhone で地下街を端から端まで歩いて、灯りの輪がカクつかないか(会議の ⚠ = 港町の夜より重い可能性)。
- 灯りの外の露店の札が読めて、1 タップで店の前まで歩いて板が開くか。
- 輪の大きさと濃さ(初期値 内 3 マス / 外 6 マス / 0.72)。暗すぎて「うろちょろ」が楽しくないなら動かす。
- 空の露店の一言が「残念」ではなく「闇市らしさ」に見えるか。
- 港町の石段 → 地下街 → 石段 → 港町、の往復が自然か。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>闇市が歩ける地下街に</b> — 薬屋・杖屋・召喚屋・古物商の露店を灯りを手に巡れる。港町の石段からも出入りできる。"

---

## 11. やらないこと

- ⛔ 酒場の店内の歩きを `js/map-walk.js` へ付け替える(別チケット候補。ユーザー決定)。
- ⛔ 地下街を歩く住人と、露店の店主の絵:
  - 依頼人の胸像 `assets/plaza_client_*.png` は闇クエストの依頼人なので、店主に流用しない。
  - 歩く絵は codex1 への発注が要る(会議の別チケット候補)。
- ⛔ 在庫の抽選を露店ごとにする(ユーザー決定 = 空なら一言)。
- ⛔ 古物商の装備品・独自品の SRD への置き換え・牙貨で装備を買う口(段 3 #99)。
- ⛔ 門番を地図の上に立たせる(判定は今までどおり入口で。⚠ 納品の絵に鉄格子ははっきり描かれていない = `3ca8938` の受入メモ)。
- ⛔ 東の水路の向こう岸を歩けるようにする(橋は行き止まりの眺め)。
- ⛔ 珍しい闇クエスト 2 種の出現率 1.0(#97 で「触らない」と決定済み)。
- ⛔ `verify_codex_map_skill` (3a) の着手前からの赤(焼き直しの件数 17→18 で既知・別チケット候補)。
- `実装依頼書/README.md` の行(承認のコミットで足す):

    | 98 | [2026-10-21_plaza-undercity-map.md](2026-10-21_plaza-undercity-map.md) | **承認済** | 0% | 闇市を歩ける地下街へ(露店 4 軒・掲示板・出口 2 つ・灯りの輪)。⭐ 歩きは新部品 `js/map-walk.js` = 酒場の `initTavernMap` は 1 バイトも変えない / ⚠ 露店で絞るのは CSS だけ(`data-idx` は通し = #97 (5a))/ 露店の割り振りは `js/plaza-map.js` に(品の表は触らない)/ 新しい js も CRLF |

---

## 12. 実装結果

**ステータス: ✅ 完了(2026-10-22 実装窓・未 push)**。記録の詳細は `~/.claude/dev-loop/r98/notes98_item1.md` / `notes98_item2.md` / `notes98_item3.md` / `notes98_item4.md`。

### 12-1. コミット

| commit | 内容 |
|---|---|
| `b444422` | 項目1: 新しい部品 `js/map-walk.js`(歩き・灯りの輪・札・カメラ)と `js/plaza-map.js`(通行マスク・露店 4 軒と掲示板・出口 2 つ・立ち位置)+ マスクの検査 `tools/probe_plaza_mask.js`。`tavern.html` は不触 |
| `498ceda` | 項目2: `tavern.html` に地下街をつなぐ(`#plazaViewport`・札 7 枚・露店で板を絞る CSS・「← 地下街へ」・空の露店の一言・港町への石段・撤退 `?undercity=0`)+ `tools/verify_tavern_map.js` の `DOM_ADDED` 申告 + changelog 1 行(§10 の文面どおり「闇市が歩ける地下街に」) |
| `8463482` | 項目3: 新規受入 `tools/verify_plaza_map.js`(port 10637・負のコントロール 10 本内蔵・純 LF) |
| 本節のコミット | 項目4: 母集団の非退行(全数走査)+ 変異アンカーの衝突 + 本節 + README の #98 行 |

### 12-2. 受入の色と秒

| 走行 | 色 | 秒 |
|---|---|---|
| `verify_plaza_map` 素 | **43/43**(27 節)×3(項目3)+ 全数走査の中で 1 回 43/43 | 101〜102 |
| `verify_plaza_map --negative` | **10/10**(担当の節が赤)×2(項目3)+ 全数走査の中で 1 回 10/10。filteridx=(2c) / missingitem=(2a) / reclick=(1e) / nolayout=(1d) / lightblock=(1c)(3a) / signunder=(3c) / wrongvia=(4b) / townleak=(4c) / blockenter=(1b) / noretreat=(6a) | 1063〜1064 |
| §8 の名指しの既存 golden | 項目1 の着手前(`c310d8c`)と項目2 の後で同色(`verify_tavern_map` 素 47/47・neg 71/71 / `verify_town_map` 85/85 / `verify_plaza_srd` 27/27・neg 8/8 / `verify_npc_crowd` 33/33 / `verify_recruit_talk` 25/25 / `verify_quest_draw` 18/18 / `verify_eol_doorfix` 27/27 / `check_tree_eol` ship 22→24・食い違い 0) | — |
| 単体の動作確認(コミットしない) | 項目1 `check_map_walk.js` 52/52 / 項目2 `check_item2.js` 63/63(desktop 1440x900 / compact 390x844) | — |

### 12-3. 母集団の非退行(全数走査)

- `tavern.html` を触るので全数。HEAD `8463482` で **232 腕・692.3 分**(2.98 分/腕)= #97 の post97 の 230 腕(同順)+ `verify_plaza_map` 素 / neg。直列・SKIP 再開型(窓落ちなし・2026-10-22 01:17 → 12:50)。git を読む本(32 腕)は `git clone --shared @8463482`(本番と 944 ファイルのバイト差 0)で。8765 は走査の前後とも LISTEN なし(post97 と同じ条件)。
- 結果: 緑 211 / 非緑 21。基準 post97(本番 `c310d8c` と同じバイト・緑 208 / 非緑 22)と比べて **緑→赤 0**・赤→緑 1・両方非緑 21・新規 2 腕は緑。
  - 赤→緑 1 = `verify_tower_mother_b --negative`(post97 では intavern の担当外 (4a) が赤 = 既知の「観測 0」型の揺れ。今回は exit 0)。
  - 既知の揺れの本: `driver_monsters_griffon` 素 = 基準と同じく赤(15/17)/ `verify_lore_check` 素 26/26・neg 緑。
- 両方非緑の 21 腕は FAIL 行を集合で突き合わせ、19 腕は中身が同じ。DIFF 2 腕はどちらも非帰属:
  - `driver_mapdef_step1` (0b): worktree list に載る clone の commit の hash が `8ad1982` → `8463482`(#96・#97 と同じ型)。
  - `verify_walk_block`: FAIL 行は同じ。差は PASS 行に出る `scale(0.82)` → `scale(0.820086)` の数値の書式だけ(突き合わせの正規表現が ⛔ を含む PASS 行も拾う)。
  - `verify_codex_map_skill` (3a)(着手前からの赤・§11 で対象外)は SAME。
- `readdirSync(tools)` で他の tools のソースを読む本(罠E)は全部緑: `verify_board_load_flash` 14/14 / `verify_class_line` 素・neg / `verify_corner_check` 素・neg / `verify_declared_traps` 素・neg / `verify_mage_hand` 素・neg / `verify_mage_hand_reach` 素・neg ⇒ `verify_plaza_map` の変異アンカーは他の本と衝突していない。
- ⇒ **#98 帰属の緑→赤 = 0**。tools の言い直しなし・本番ファイルは触っていない。
- 変異アンカー衝突: 全 tools 204 ファイルの文字列リテラル 54,814 個を `c310d8c`→`8463482` の `index.html` / `audio.js` / `tavern.html` + 新しい `js/map-walk.js` / `js/plaza-map.js` で数え直した。
  - 3 ファイル側の「1 だった / 1 になった / 0→出現」は 34 組(`index.html` / `audio.js` は不変 = 全部 `tavern.html`)。17 組は `verify_plaza_map` 自身、3 組は `probe_plaza_mask` 自身。残り 14 組はどれも**変異アンカーではない**: メッセージ文字列(`' / 出口 '` `' マス / '` `' / OFF '` `' / OFF'` `'heroTile: '` `' / 立ち位置 '` `'board='` `' (want '`)/ キーや名前の列挙(`'isMoving'` ×2 = world の窓のキー一覧 / `'freeze'` = watchdog の変異名 / `'verify_tavern_map.js'` = quest_draw の PEER_DRIVERS / `'plaza_undercity'` = make_grid_map.py の地図名)/ `'childList'` = field_step6 の MutationObserver の型比較。どれも `tavern.html` を検索・置換していない。
  - 新しい js 2 本は着手前に存在しないので、どのリテラルも「0→出現」になる(1,623 組)。意味があるのは新しい js を名指しする tools だけ = `verify_plaza_map` / `probe_plaza_mask` / `verify_tavern_map`。`verify_tavern_map` は新しい js をコメントで名指すだけで、その js を置換しない。
  - ⇒ **衝突 0**。

### 12-4. 依頼書と違えた点

- **マスク(項目1)**: 歩けるマス `.` は下書きの 125 → **131**。絵を 64px 格子で拡大して 1 マスずつ確かめた: (7,1)(8,1)(9,1) `c`→`.`(樽と木箱は行の上半分だけ)/ (12,4) `.`→`c`(杖屋の左の木箱が中心の角に乗る)/ (1,5)(1,6)(2,6) `W`→`.`(張り出しの小部屋と柵の切れ目)/ (8,5) `s`→`.`(薬屋の敷物の前の店先)。enter・sign・立ち位置は下書きのまま。2 つの立ち位置から歩けるマスとどの enter へも全部届く。
- **受入の言い直し(項目3・§8 の文言から 8 点)**:
  1. (1d): 文言(主人公が見える・1 マス 34〜96px)だけでは nolayout が空振りする(layout を呼ばなくても zoom 1 = 64px で範囲内)⇒ 「layout() が走った証拠」を AND で足した(desktop = 地図全体が収まり縦か横が viewport に一致 / compact = 縦か横が可視域に一致するか 1 マスが 34 か 96)。
  2. (3c): 暗幕は pointer-events:none なので、札が暗幕の下でも elementFromPoint は札を返す(signunder が空振りする)⇒ 2 腕の AND = (i) そのままで札 / (ii) 測る間だけ暗幕を pointer-events:auto にしても札。灯りの外の札を 1 枚以上含める。
  3. (3c)(3d) compact: 立ち位置から見える札は少ない ⇒ (3c) は (2,2)→(5,6)→(11,7)→(17,7) と歩いて寄りながら画面内の札を測り、7 枚の和集合が全部であることも assert / (3d) は画面外も含めて 7 枚の矩形を比べる。
  4. (1e): desktop だけで、(2,2) から薬屋の札を実クリックで連打(187ms 間隔・実測 3.6 秒で着く)。
  5. (4a) 石段の押し方: 酒場の `tavernDoor_plaza` を押して歩いて入る経路で測る。desktop = 実クリック / compact = 札が画面外か覆われていて `el.click()`(detail に押し方を出す)。
  6. (2b)(2c): 見えている行と押した行の品は**行に描かれた名前 → 品の表**で引く(`data-idx` を信じない)。
  7. (4e): 「門番の追い返しを経る」= `gatekeeperEventSeen` を false で種まきし、true に変わることで測る。
  8. (5a)〜(5c): `git show c310d8c:<file>`(LF)と配信中のバイト(CRLF)を CRLF→LF に揃えて比べる(生のバイトは改行だけの差で全部不一致)。
- **負のコントロールの巻き込み 2 件**(どちらも欠陥の性質どおり): nolayout → (3c)(compact で zoom 1 のままだと立ち寄り 3 か所の画面に札が 4 枚しか入らず和集合が 7 にならない)/ blockenter → (2b)(2c)(杖屋の enter が歩けず札を押しても着かない)。
- 項目2 の補足: 地図の insets は渡していない(闇市の画面は fixed 全面 = 0/0)。品の板の見出しは「闇市商店」のまま(露店名は出していない)。主人公の drop-shadow と行き先の印の見た目は `tavern.html` の CSS で付けた。
- §2 の再測定(基準 `c310d8c` の行番号まで)は全部一致 = **崩れた主張なし**。本番の欠陥なし。

### 12-5. 別チケット候補

- 依頼書 §11 の保留: 酒場の店内の歩きを `js/map-walk.js` へ付け替える / 地下街の住人と露店の店主の絵(codex1 発注)/ 古物商の装備品・独自品の SRD への置き換えと牙貨の橋渡し(段 3・#99)/ 門番を地図の上に立たせる / 東の水路の向こう岸。
- §9 で露店名を板の見出しに出したくなったら別途(今は「闇市商店」)。
- #97 からの持ち越し: port 8897 の共有(K1)/ `driver_monsters_griffon` と `verify_tower_mother_b --negative` (4a) の「観測 0」型の揺れ / `verify_codex_map_skill` (3a) / 両方非緑の既知 21 腕。

### 12-6. 残り

- **§9 実機の確認**(http 起動): iPhone で地下街を端から端まで歩いて灯りの輪がカクつかないか / 灯りの外の札が読めて 1 タップで店の前まで歩いて板が開くか / 輪の大きさと濃さ(内 3 マス・外 6 マス・0.72)/ 空の露店の一言が「闇市らしさ」に見えるか / 港町の石段 → 地下街 → 石段 → 港町 の往復が自然か。
- 次の新規ドライバ base = **10638**。
