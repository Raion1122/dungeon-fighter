# #67 F4 竜の巣を卓上マップ 2 枚へ畳む(旧タイプ MAP 全廃 F4 = 最後の 1 枚)

- **起草**: 2026-09-11(計画窓 `claude-3e`) / **ステータス**: **承認済**(2026-09-12 ユーザー承認)
- **⚠ 2026-09-12 改訂**: #66 が着地したので本番で測り直し、**3 件を訂正**した。
  ① §2-3 に格子の窓走査 6 本を追加(#66 が `--fit-around` の中心で外した申し送りを受けて)。
  ② §2-8 を新設 — **`js/df-mapdef.js` の比の在庫**が変更範囲から漏れていた(#66 と同じ穴)。
  ③ §2-6 のドライバ 3 本を #66 着地後の姿へ書き直した(`NODES_EXPECTED` は**廃止済み**)。
- **触るファイル**: `index.html` / `tools/make_grid_map.py` / `tools/verify_dragon_fold.js`(新規) /
  `tools/driver_graph_p6.js` / `tools/driver_grid_s2.js` / `tools/driver_spawn_not_on_gate.js` /
  `assets/room_dragon-lair_n4_map.jpg` `_n7_map.jpg`(生成物) /
  `tavern.html`(changelog の 1 行のみ) / `実装依頼書/README.md`
- ✅ **#66 は着地済み**(2026-09-12 / `origin/main` = `7008057`)。起草時に懸念した
  「`driver_grid_s2.js` と `driver_spawn_not_on_gate.js` を #66 と同じ行で取り合う」問題は解消した。
  §2-6 の表は**着地後の姿で測り直してある**。

---

## 1. 目的

旧タイプの自動生成 7x6 小部屋で残っているのは、#66 の着地後は **竜の巣(F4)ただ 1 つ**になる。
廃坑 / 森 / 沼 / 砦 / 神殿はすべて卓上バトルマップへ畳み終えており、最終シナリオだけが
古い見た目のまま残ると、5 シナリオ歩いてきた先の**ラスボスの舞台が一番みすぼらしい**という
順序になる。

本チケットは #62(沼)/ #63(砦)/ #66(神殿)と同じ型で、竜の巣を **8 ノード → 2 ノード**へ畳む。

    n4 骨の谷 (start = entry) ── right → n7 ファラクサスの巣 (boss)

**ユーザー決定(2026-09-11)**:

- **財宝の山は畳んだノードの `mapDef` に置き場を宣言し、そこへ固めて並べる**(案A)。
  ⭐ 不採用になった案 = 案B「西寄りの帯をタイル数で上限を切る」/ 案C「西 45% のまま散らす」。
  採用理由は §2-2。設計書 `final-mimic.md` が「整然と並んだ古びた宝箱」と書いており、
  30 列の大部屋で 13 列に散らすとその絵が崩れる。
  ⭐ 宣言が無いときは**従来の西 45% 規則へ落ちる**ので `?dragonfold=0` は 1 ビットも変わらない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ `index.html` の行番号は **`0b9034d`** 時点のまま。#66 が大きく動かしたので**必ずズレる**。
`tools/*` と `js/*` の行番号は **`7008057`**(#66 着地後)で測り直してある。
⛔ どちらも着手時に `grep -n` で引き直すこと(#6 は 8/8 件、#11 は 11 件中 4 件ズレた)。

### 2-1. いまの竜の巣は 8 ノードの旧タイプ

`index.html:37731` `buildDragonLairRun()` は 19 行で、`buildP6Run` の共通骨格をそのまま使う。

| ノード | 名前 | kind | 敵 |
|---|---|---|---|
| n0 | 溶岩洞の入口 | start | — |
| n1 | 焼け焦げた坑道 | combat | orc x2 / skeleton x1 |
| n2 | 竜の抜け殻 | search | orc x1 / minotaur x1 |
| n3 | 溶けた財宝溜まり | loot | orc x1 / skeleton x1 |
| n4 | 骨の谷 | combat | minotaur x2 / orc x1 |
| n5 | 冷えた溶岩溜まり | rest | — |
| n6 | 竜の蓄えた財宝 | **loot**(spec が既定 event を上書き) | — |
| n7 | ファラクサスの巣 | boss | minotaur x2 + boss `pharaxus` |

⭐ **移設するのは n1 + n2 + n3 の 7 体**(orc x4 / skeleton x2 / minotaur x1)。
砦 #63 とちょうど同数で、畳んだ n4 は **3 + 7 = 10 体**になる。
⛔ 体数も種類も変えない(難易度の再調整は別チケット)。

⚠ **竜だけ loot ノードが 2 つある**(n3 と n6)。畳むと両方消えるので、
`NODE_EXTRA_SPAWN_KINDS` への n4 兼務 `["search","loot"]` は砦・沼と同じく**必須**。
⛔ 忘れると罠と玄室の宝箱が**無言でゼロ**になる(森 #16 で実際に踏んだ)。

### 2-2. ⚠⚠⚠ 最大の地雷 — `spawnDragonHoard` は部屋の西 45% に財宝を撒く

`index.html:23808`。ミミックと囮の宝箱を湧かせる唯一の口で、**竜の巣専用**。

    const westLimit = c1 + Math.floor((c2 - c1) * 0.45);

`ROOMS[BOSS_ROOM_IDX]` の rect から西 45% の床タイルを全部集め、シャッフルして
**ダミー 3 個 + ミミック 1 個 = 4 マス**を取る。

| ボス部屋 | 西 45% の幅 | 撒かれ方 |
|---|---|---|
| いまの 9x6(cols 32-40) | **4 列** | 自然に固まる |
| 畳んだ 30x19 | **13 列** | 19 行 x 13 列 の中に 4 個が散る |

崩れるものが 3 つある。

1. `final-mimic.md` の「**整然と並んだ古びた宝箱**」という絵が成立しない。
2. ミミックの起動半径 `MIMIC_APPROACH_RADIUS = 200`(= 2.08 タイル)なので、
   **入場地点の隣に湧くと入った瞬間に不意打ちが始まる**。
   入場は西辺なので、西 45% は入場地点をそのまま含む。
3. 竜の寝床は絵の**東**にある。財宝が西端に散ると「竜が抱えていた財宝」に見えない。

⇒ **案A**。`p6Node` の `opt` に `hoard` を足し、畳んだ n7 だけが置き場を宣言する。

⚠⚠⚠ **`hoard` を無条件に mapDef へ載せてはいけない。** `driver_grid_s2.js:699` の §8 は
他シナリオの mapDef を `JSON.stringify` の**完全一致**で golden と突き合わせている。
`hoard: null` を全 mapDef に足すと**畳みと無関係な全シナリオの golden が一斉に赤くなる**。
⇒ キーは**渡されたときだけ生やす**(§6-4 に書き方)。
⭐ この罠は §8 の変異 `hoardnull` として装置に内蔵させる。

### 2-3. 絵 2 枚は納品済み。格子を実測した

`codex1/assets/maps/dragon-vale-v1.png`(道中)/ `dragon-nest-v1.png`(ボス)。
どちらも 1536x1024 RGB。発注文 = `codex1/requests/2026-09-11_dragon-lair-maps.md`。

**計測コマンド**(再測定するとき):

    py tools/make_grid_map.py --fit "C:\Users\PC_User\Desktop\codex1\assets\maps\dragon-vale-v1.png" --fit-around 48
    py tools/make_grid_map.py --fit "C:\Users\PC_User\Desktop\codex1\assets\maps\dragon-nest-v1.png" --fit-around 48

| 素材 | 縦線 周期 / 位相 | 横線 周期 / 位相 | マス | 異方性 |
|---|---|---|---|---|
| `dragon-vale-v1.png` | 47.660 / 33.00 | 48.025 / 23.15 | **31 x 20** | 0.76% |
| `dragon-nest-v1.png` | 48.425 / 38.15 | 51.075 / 49.35 | **30 x 19** | **5.33%** |

⚠⚠⚠ **上の表は `--fit-around 48` だけの答えではない。** #66 の実装窓が
「`--fit-around` の中心は**発注した px ではなく「素材の幅 ÷ ざっと数えたマス数」**で出す。
依頼書の 48 は 2 枚とも外し、本物は 53px と 73px で ±8% の探索窓に**一度も入っていなかった**」
という申し送りを残している。同じ穴に落ちていないことを確かめるため、
**窓を 6 本(中心 41 / 48 / 56 / 65 / 76.8 / 88 = 実質 38〜95px を連続被覆)**走査した。

| 中心 | 道中 縦 score | 道中 横 score | 道中 マス | ボス 縦 score | ボス 横 score | ボス マス |
|---|---|---|---|---|---|---|
| 41 | 2.919 | 2.238 | 38x25 | 2.257 | 2.145 | 38x24 |
| **48** | **5.261** | **5.317** | **31x20** | **3.685** | **5.478** | **30x19** |
| 56 | 3.026 | 2.719 | 29x17 | 2.846 | 3.666 | 25x19 |
| 65 | 3.223 | 2.732 | 22x15 | 2.846 | 2.835 | 25x15 |
| 76.8 | 3.452 | 3.457 | 21x13 | 2.874 | 3.479 | 20x12 |
| 88 | 4.822 | 3.406 | 15x10 | 2.833 | 2.794 | 16x10 |

- ⭐ **道中は 48 の窓が明確な勝者**(5.26 / 5.32)。88 の窓が返す 94.630 は
  **47.3 の 2 倍音**(ヘッダが警告している倍音そのもの)で、スコアも下。⇒ 31x20 が生き残る。
- ⚠⚠ **ボスの縦線 3.685 は弱い。** 6 本中の最大ではあるが 2 位(2.874)との差が小さく、
  横線の 5.478 とも桁が違う。⛔ **この 1 本に賭けない** —— STEP2 で必ず焼いて検算する。
- ⭐ どの窓も**自信たっぷりに整数マスを返す**。答えが返ることは正しさの根拠にならない。
- 道中の異方性 0.76% は台帳 11 枚の中でも良いほう。
- ⚠⚠ **ボスの 5.33% は台帳で 2 番目に悪い**(最悪は廃坑 7.75%、次点だった巣は 2.53%)。
- ⚠⚠⚠ **`--fit` の一次解を信じて台帳へ貼らないこと。** 砦 #63 は 2 枚とも横線が外れ、
  しかも**位相も動かさないと基底に入らなかった**(OK 領域は「位相 + 20 x 周期 ≒ 一定」の
  斜めの稜線として現れる)。⛔ 周期だけの 1 次元走査では永久に見つからない。
  ⭐ 手順は §5-1。

⭐ 目視で確認済み(2026-09-11、本番の焼き付け前):

- **道中** … 横断路が西端から東端まで 1 マスも切れずに通っている。開けた床は 4 箇所
  (北西の坑道、南西の坑道、中央の竜鱗、東の骨の谷)。財宝の描き込みはゼロ。
- **ボス** … 東に骨の寝床、西 2/3 が開けた暗い床。寝床の手前に開けた床が 2 箇所ある
  (発注文が「互いに 2〜4 マス離す」と指定したもの。護衛 2 体の置き場)。
- ⚠ **ボスの左辺中央(入場する辺)は溶岩と岩で塞がって見える。** マスクで開けるかは
  STEP2 で焼いてから判断する(§5-3 に判断規則)。

### 2-4. 道中の rect には唯一解がある

`buildP6Run` が作る出口は `P6_RIGHT = [39, 13]` で固定。`nodeGateTile` は
**右辺の中点** = `(c2, floor((r1+r2)/2))` を返すので、**rect の右辺は必ず col 39**、
**行の中点は必ず 13** でなければゲートの上書きが要る。

31 列 x 20 行でこれを満たす rect は 1 つだけ:

    rect: [4, 9, 23, 39]      /* r1=4 c1=9 r2=23 c2=39 → 20 行 x 31 列 */
                              /* 右辺 col 39 / midR = floor((4+23)/2) = 13 → (39,13) = P6_RIGHT */

⭐ 砦と同じく**ゲートの上書きが要らない**(沼 n4big が `gates.up` を足したのとは事情が違う)。
絵ローカル (col,row) + **(9, 4)** = global。

ボスは出口を持たないのでゲートの制約が無い。行の中点を 13 に揃えると:

    rect: [4, 10, 22, 39]     /* 19 行 x 30 列 / midR = floor((4+22)/2) = 13 */

絵ローカル (col,row) + **(10, 4)** = global。
⚠ どちらも `MAP_W = 72` / `MAP_H = 28` の内側なので行を捨てる処置は不要。
⚠ `rect` は `tileBounds` と**同値**にすること(`paintingAspectFits` が縦横比の完全一致を要求)。

入場地点(`NODE_ENTRY_INSET = 2`):

| ノード | 左辺の中点 | 入場 global | 絵ローカル |
|---|---|---|---|
| n4 道中 | (9, 13) | **(11, 13)** | (2, 9) |
| n7 ボス | (10, 13) | **(12, 13)** | (2, 9) |

⚠⚠⚠ **`start` は必ず入場地点へ寄せる。** `buildNode` は「起点の床保証」で起点タイルを
問答無用に床へ彫るので、既定の `(36,13)` のままだと絵の内側に**マスクの穴が無言で開く**
(砦 #63 の注記と同じ)。しかも検証は 1 マスずれて赤くなるので「マスクが間違っている」と誤診させる。

### 2-5. ⭐ 隠し要素は `SCENARIO_NODE_EXTRAS` を通らない

`index.html:10997` の `SCENARIO_NODE_EXTRAS` に載っているのは `bandits-forest` と
`lizard-swamp` の 2 つだけで、**竜は載っていない**。`driver_graph_p6.js:62` の期待表も
竜は `hidden: null` / `cages: 0` / `dormant: 0`。

⇒ 竜の隠し要素(偽宝箱)の出所は `spawnDragonHoard()` **ただ 1 本**。
⭐ 砦 #63 の「守護者を大部屋へ移すとクリア不能」は**竜にはかからない**
(`inactive` な敵を 1 体も置かないので `isNodeSettled()` を止めるものが無い)。
⛔ 砦のコメントを写経して「隠し要素は撤退の腕にだけ残す」と書かないこと —— 竜は残せる。

### 2-6. ⚠⚠ 既存ドライバ 3 本が腐る(#66 着地後に測り直した)

竜に言及するドライバは **35 本**(`grep -l "dragon-lair" tools/*.js`)。⭐ これは母集団の
**下限**であって、実際の母集団は #64 の一般解どおり「**変更したファイルを読むか**」で
引き直すこと(名指し 14 → 実測 59 になった実績がある)。

腐るのは次の 3 本。

⭐⭐⭐ **母集団は撤退スイッチの語では引けない。** #66 の実測 = `templefold` で引くと 4 本、
`undead-temple` で引くと **34 本**で、腐っていた 5 本のうち **2 本は前者に入っていなかった**。
⇒ **最初から `dragon-lair` を読む本で引く**(#66 が名指しで #67 へ申し送った事項)。

⚠ 下表は **#66 着地後(`7008057`)の実測**。起草時(`0b9034d`)から 2 件動いている。

| ファイル:行 | 今の姿 | #67 での扱い |
|---|---|---|
| `driver_graph_p6.js:372` `FOLDED` | 森 / 沼 / 砦 / 神殿 の 4 行 | **1 行足すだけ** |
| `driver_grid_s2.js:93` `UNTOUCHED` | **`['dragon-lair']` の 1 件だけ** | **要注意。下記** |
| `driver_spawn_not_on_gate.js:83` `FOLD_ARM` | 廃坑 / 森 / 沼 / 砦 / 神殿 | **1 行足すだけ** |

⭐ **`NODES_EXPECTED` は #66 が廃止した。** 畳みのたびに書き換えてきた契約表をやめ、
台帳 `FOLD_ARM` と撤退の腕の実測から**導出する**形になっている(#62 の一般解)。
⇒ 起草時に書いた「竜を 2 へ書き換える」は**もう要らない**。足すのは `FOLD_ARM` の 1 行だけ。

⭐ **腐らないことを実測で確かめた 4 本**(どれも撤退の腕で測るため):

- `driver_graph_p6` の `(1z)` / `(1z2)` —— 大部屋の例外が広がっていないことを見る装置 assert。
  `P6_ARM(sid)` が撤退の腕を当てるので、畳んでも旧 9x6 を数え続ける。
- `driver_graph_p6` の `(5f)` / `(5g)` —— ミミックがボスノードだけに湧くことを見る。
  ⚠⚠ ただし **#67 以降、畳んだ姿のミミックを見張るのは新ドライバ `verify_dragon_fold` §3 だけ**になる
  (p6 の目は撤退の腕へ移る)。§8 §3 を薄くしないこと。
- `driver_graph_p7` —— シナリオ名の一覧に持っているだけ(`:57`)。
- `driver_graph_kinds` —— 竜の行は `g0: true` = `?graph=0` の腕(`:630`)。

⭐ `driver_graph_p7.js` は `dragon-lair` を**シナリオ名の一覧に持っているだけ**(:57)で
旧タイプであることを測定台にしていないので腐らない(砦 #63 が 3 箇所赤くしたのとは違う)。
⭐ `driver_graph_kinds.js:630` の竜の行は `g0: true` = `?graph=0` の腕なので腐らない。

⚠⚠⚠ **`UNTOUCHED` が空配列になる。** #66 が神殿を抜くと竜 1 件、
  #67 が竜を抜くと **0 件**になり、`driver_grid_s2.js:711` の

    for (const s of UNTOUCHED) { ... G.check(...) }

が **1 回も回らない = §8 の golden 検査が永久緑**になる。これは #59 が名指しした
「前のチケットが受入から外した項目は次で golden の空白地帯になる」の実例そのもの。

⇒ **受け皿を必ず作る**(§6-6)。UNTOUCHED を空にしたうえで、
**golden と突き合わせた mapDef の総数が下限を割っていないこと**を装置 assert で見る。
⛔ 「畳み切ったので §8 は役目を終えた」として消さないこと —— 撤退の腕 5 本
(`?s2fold=0` / `?swampfold=0` / `?fortfold=0` / `?templefold=0` / `?dragonfold=0`)の
旧 8 ノードは golden で押さえ続けるのが契約。

### 2-7. changelog は**鳴る**

`scripts/hooks/check_changelog.py:24` を読んだ結果 = `GAME_LOGIC` は
`index.html` / `tavern.html` / `audio.js` の 3 つ。本チケットは `index.html` を触るので**必須**。

⭐ 書けるプレイヤー向けの要約は実在する(見た目が変わる変更なので嘘にならない)。文面は §10。

### 2-8. ⚠⚠⚠ `js/df-mapdef.js` の比の在庫へ 2 行が要る(起草時に漏れていた)

起動時の `lintRun` は `setPaintingCatalog` より**前**に走るので、絵の縦横比の判定が
`js/df-mapdef.js:2154` の `LINT_PAINTING_ASPECTS` へ落ちる。しかもこの在庫は
**サイズではなく比**で当てる(`:2230` が `rw * A.h === rh * A.w`)。

⭐ 砦 #63 がこれを足さずに済んだのは **30x20 = 3:2 が既存「ノードボス 9x6」と同比だった偶然**
にすぎない。#11 / #53 / #58 / #66 と 4 回続けて踏まれている穴なので、竜でも必ず検算する。

**検算**(既存 8 種のどれとも一致しないことを確かめた):

| 竜の rect | 比 | 既存で最も近いもの | 一致するか |
|---|---|---|---|
| n4big **31 x 20** | 1.5500 | 神殿 14:9 = 1.5556(`31*9 = 279` vs `20*14 = 280`) | ❌ |
| n7big **30 x 19** | 1.5789 | 神殿 20x13 = 1.5385 / 3:2 = 1.5 | ❌ |

⇒ **2 行とも足す。** 足さないと毎起動 warning が出続け、
`driver_graph_p6 (2c-dragon-lair)` が赤くなる(#66 で実際にそうなった)。
⚠ マス数は STEP2 で焼いて確定するので、**在庫へ書くのは焼き上がりの実測値**。
⛔ ここに書いた 31x20 / 30x19 を先に貼らない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/make_grid_map.py` | `GRIDS` へ `dragon-vale` / `dragon-nest` の 2 エントリ |
| `assets/room_dragon-lair_n4_map.jpg` `_n7_map.jpg` | 焼き付けの生成物(新規 2 枚) |
| `index.html` | `DRAGON_FOLD_OFF` / `DRAGON_FOLDED` / `NODE_EXTRA_SPAWN_KINDS` / `ROOM_PAINTINGS_DEF` の `n4big` `n7big` とマスク / `buildDragonLairRun` の畳み / `p6Node` の `hoard` / `spawnDragonHoard` の宣言優先 |
| `tools/verify_dragon_fold.js` | 新規。base **10281** |
| `tools/driver_graph_p6.js` | `FOLDED` へ 1 行 |
| `tools/driver_grid_s2.js` | `UNTOUCHED` から竜を抜く + `?dragonfold=0` の腕 + **空母集団の受け皿** |
| `tools/driver_spawn_not_on_gate.js` | `NODES_EXPECTED` の竜を 2 へ + `FOLD_ARM` へ 1 行 |
| `tavern.html` | changelog の 1 行のみ |
| `js/df-mapdef.js` | `LINT_PAINTING_ASPECTS` へ竜の 2 比(§2-8)。⚠ 起草時に**漏れていた** |
| `実装依頼書/README.md` | #67 の行(§11 に文面) |

⛔ **`js/df-mapdef.js` で触るのは `LINT_PAINTING_ASPECTS` の在庫だけ。**
罠と宝箱の真偽を決める `KIND_SPAWNS_TRAPS` / `KIND_SPAWNS_ROOM_CHESTS` は**動かさない**。
  #67 が `index.html` 側へ足すのは「**何を兼ねるか**」の台帳で、判定の出所は 1 本のまま。

---

## 4. STEP1 — 着手前の基準取り

⛔ **本番コードも `tools/` も 1 バイトも触らない。**

1. `git log --oneline -1` と `git status` を記録する(#66 が着地して clean であること)。
2. §2-6 の母集団を「**変更したファイルを読むか**」で引き直す。名指し 35 本は下限。
   ⭐⭐⭐ **3 つの引き方を union で取る**(#66 が 1 つ目だけで引いて緑→赤 2 本を作った):
   - 舞台名 —— `grep -ln "dragon-lair" tools/*.js`(⛔ `dragonfold` では引けない)
   - 変更したファイルを読む本 —— `index.html` / `js/df-mapdef.js` / 触った tools を読む本
   - ⭐ **その測定器のソースを読む測定器** ——
     `grep -ln "'tools/driver_\|'tools/verify_" tools/*.js`(リポジトリ全体で **2 本**)。
     #66 の 3 本目 `verify_eol_doorfix (3a)` は**これでしか引けなかった**。
3. 引いた母集団を全部走らせ、**ログ全文**を保存する。
   ⭐⭐ **集計行 1 行に賭けない** —— 書式は 7 種以上あり 2 つは `PASS` を含まない(#65 の教訓)。
   突き合わせは「**判定トークン + assert id の列**」で行う。
4. この時点で既に赤い本を列挙する(#65 時点では `driver_grid_p4` / `driver_mapeditor` /
   `driver_mapeditor_painting` / `sweep_recruit_balance` / `driver_monsters_umberhulk` の 5 本と、
   終了しない `probe_party_size`)。**着手前から赤いものは #67 の責任ではない**ことを先に確定させる。

---

## 5. STEP2 — 絵の受入とマスク 2 枚

### 5-1. 格子を当てる(⚠ `--fit` の一次解で止まらない)

§2-3 の値を `GRIDS` へ貼り、**焼いてから検算する**。

    py tools/make_grid_map.py --name dragon-vale --tile 48
    py tools/make_grid_map.py --check assets/room_dragon-lair_n4_map.jpg --tile 48

検算が NG(累積ドリフト 4.0 world-px 超)なら、**位相と周期の 2 次元**で振る。

- ⛔ 周期だけの 1 次元走査はしない。OK 領域は斜めの稜線なので横切るだけで終わる。
- ⛔ 素材のスコア最大を採らない。砦の玉座は**全域の最大**が間違いだった。
- ⭐ 採用点は drift と score比 の折り合い。score比の門番 70% に余裕を残す。
- ⚠ ボスは異方性 5.33% なので縦横で別々に追い込むこと。

⚠⚠ **焼き tile は 2 枚で違ってよい。⛔ 48 と決め打ちしない。**
起草時の「2 枚とも 48」は砦 30x20 / tile 48 の**写経**で、根拠が無い。
  #66 の実測では広間 **48** / 祭壇 **64** と 2 枚で割れた。
⭐ 判断は「素材の情報量(周期 px)に対して水増しにならない最小の倍数」。
⚠ `--check` に渡す `--tile` は**実際に焼いた値**にすること(食い違うと検算が無意味になる)。

### 5-2. マスクを絵へ当て直す

`ROOM_PAINTINGS_DEF["dragon-lair"]` へ `n4big` / `n7big` を足す。既存の `n4` / `n7`
(旧 7x6 / 9x6 のノード絵)は **1 バイトも触らない** —— `?dragonfold=0` の行き先として生かす。

- 作法は沼 `n4big` / 森 `n7big` と同じ 5 規則。⭐ 2 枚は**別々に**当て直す。
- 行数 = `n4big` **20 行 x 31 列** / `n7big` **19 行 x 30 列**。
- 写像は `n4big` が絵ローカル + **(9, 4)**、`n7big` が + **(10, 4)**。⚠ 足し算が 2 枚で違う。
- ⚠ 敵スポーンは `applyPaintingBlocking` の門番を通るのでマスクで塞がれない。
  **逆に、マスクで塞いだタイルに敵を置くと絵の中に穴が開く**。座標は必ず開いたマスにする。

### 5-3. ボスの左辺の入口をどうするか(⭐ 判断規則)

⚠ 納品された `dragon-nest-v1.png` は**左辺中央が溶岩と岩で塞がって見える**。
焼いたあと、絵ローカル (0,9)〜(3,9) を実際に見て次の順で決める。

1. 入場 (12,13) = 絵ローカル (2,9) が**開けた床に見える**なら、マスクを開けて終わり。
2. 見えないが**その上下 1〜2 行**に開けた床があるなら、`rect` を動かさず
   **`start` を開けた行へ寄せる**(`start` は宣言なので自由。ゲートの制約はボスには無い)。
   ⚠ ただし `start` を動かしたら §8 の (5b) の期待式もそこから導き直すこと。
3. どちらも無いなら、**マスクで左辺中央の 1x3 を開ける**。
   ⚠ これは「絵に描かれていない床を歩ける」ことになるので最後の手段。
   ⛔ 絵を描き足す・発注し直すのは #67 の範囲外(別チケット)。

### 5-4. 財宝の置き場を決める(案A)

`n7big` のマスクを当てたあと、**4 マスの塊**を選ぶ。制約:

- 4 マスすべてマスクで開いている(塞がれていない)。
- 互いに **2 タイル以内**で隣接し、塊として読めること(`final-mimic.md` の「整然と並んだ」)。
- 入場 (12,13) から **4 タイル(384px)以上**離す。
  ⭐ 根拠 = `MIMIC_APPROACH_RADIUS = 200px`(2.08 タイル)。入った瞬間の不意打ちを避ける。
- ボス `pharaxus` から **4 タイル以上**離す(触った瞬間にボス戦へ雪崩れないため)。
- 竜の寝床(絵の東の骨の窪み)の**手前**に置く。
  ⛔ 護衛 2 体のために確保した「寝床の手前の開けた床 2 箇所」とは重ねない。

---

## 6. STEP3 — 畳みと撤退スイッチ

### 6-1. 撤退スイッチの定数(置き場所は `FORT_FOLD_OFF` の隣 = `index.html:4160` 付近)

    /* ★[#67] 竜の巣の畳みの撤退スイッチ。
     *   ?dragonfold=0 で**畳む前の 8 ノード構成へ完全に戻る**(n0〜n7 の 7x6 / 9x6 の小部屋、
     *   旧ノード絵 n4 / n7、density 1、財宝の西 45% 規則)。
     * ⚠⚠ **置き場所が FORT_FOLD_OFF の隣なのは同じ理由**。RUN の即時評価から
     *   buildScenarioRun → buildDragonLairRun が呼ばれるので、4500 行台に置くと TDZ。 */
    const DRAGON_FOLD_OFF = (() => {
      try { return new URLSearchParams(window.location.search).get("dragonfold") === "0"; }
      catch (e) { return false; }
    })();
    const DRAGON_FOLDED = !DRAGON_FOLD_OFF;

⭐ 竜には沼の `?swampmap=0` にあたる「畳みより前に入っていた大部屋」が無いので、
**AND を取る相手がいない**(`FORT_FOLDED` と同じ 1 本きりの形)。

### 6-2. `NODE_EXTRA_SPAWN_KINDS` へ 1 行

    /* ★[#67] 竜を畳むと search (n2 竜の抜け殻) と loot (n3 溶けた財宝溜まり /
     *   n6 竜の蓄えた財宝) が消えるので、罠と玄室の宝箱の湧き口を n4 (骨の谷) へ兼務させる。
     *   ⛔ 忘れると罠も宝箱も無言でゼロになる (森 #16 で実際に踏んだ)。
     * ⚠ 竜だけ loot ノードが **2 つ** (n3 と n6) ある。兼務の宣言は kind の集合なので
     *   1 行で足りるが、数が変わることは §8 (4a) が実測で押さえる。
     * ⚠ 畳んでいないとき (?dragonfold=0) は載せない。 */
    if (DRAGON_FOLDED) t["dragon-lair"] = { n4: ["search", "loot"] };

⛔ 既存の森 3 行は**整形し直さない**(`driver_grid_s2` の変異 `nosearchkind` /
`nolootkind` が逐語で握っている。触ると素は緑のまま `--negative` だけが exit 3 になる)。

### 6-3. `buildDragonLairRun` の畳み

砦 `buildOrcFortRun`(`index.html:37581`)を**構造だけ**手本にする。⛔ コメントは写経しない
(砦は「守護者を残せない」と書いているが、竜は残せる。§2-5)。

- 関数の先頭で `FOLD_MOVED_DRAGON` を作る(`DRAGON_FOLDED` のときだけ 7 体)。
  ⚠ 畳んでいないときは**空配列**。旧構成では n1/n2/n3 に居るので足すと二重に湧く。
- `n4` を `DRAGON_FOLDED` の三項にし、畳んだ側は
  `rect: [4, 9, 23, 39]` / `paint: "n4big"` / `density: 0` / `start: { tx: 11, ty: 13 }`。
- `n7` も同様に `rect: [4, 10, 22, 39]` / `paint: "n7big"` / `density: 0` /
  `start: { tx: 12, ty: 13 }`(§5-3 の判断で動く場合あり)/ `hoard: <§5-4 で決めた 4 マス>`。
- 末尾で `if (!DRAGON_FOLDED) return run;` してから 2 ノードへ畳む。

⛔ **n4/n7 の mapDef はここで組み直さない** —— `buildP6Run` が作ったものを `pick(id)` で
取り出す。組み直すと「畳んだ版と畳んでいない版で幾何が違う」中間状態が生まれる。
⚠ id は `"n4"` / `"n7"` のまま。n4 の kind は `"start"`。`kind:"boss"` はちょうど 1 つ = n7。
⚠ `density` は `||` で既定へ落とさない(0 は falsy)。
⚠ n5 の `rest`(入室で全快)は**復活させない**。補填は難易度・XP のチケットへ。

### 6-4. `p6Node` へ `hoard` を足す(⚠ 条件付きで生やす)

    /* ★[#67] 財宝の山の置き場。⚠⚠⚠ **渡されたときだけキーを生やすこと。**
     *   無条件に載せると、宣言していない 5 シナリオの mapDef も JSON.stringify が変わり、
     *   driver_grid_s2 §8 の golden が一斉に赤くなる。 */
    const md = { /* 既存のまま 1 ビットも動かさない */ };
    if (opt.hoard != null) md.hoard = opt.hoard;
    return md;

### 6-5. `spawnDragonHoard` を宣言優先にする

`index.html:23808`。⭐ **既存の西 45% 規則は 1 行も消さない** —— 宣言が無いときの
フォールバックとして残す(これが `?dragonfold=0` の恒等性の根拠)。

    /* ★[#67] 畳んだボス部屋は 30 列あるので、西 45% (= 13 列) に撒くと財宝が散る。
     *   mapDef が置き場を宣言していればそれを使う。⚠ 宣言が無ければ従来の西 45% 規則
     *   (= ?dragonfold=0 の行き先) へそのまま落ちる。 */
    const declared = (MAPDEF && Array.isArray(MAPDEF.hoard)) ? MAPDEF.hoard : null;

- 宣言タイルも `isOccupied` / `isTileWall` / `mapData` の門番は**通す**
  (敵や既存の宝箱と重なったら候補から外す)。
- 宣言タイルが 1 マスも生き残らなかったら**従来規則へ落ちる**(黙って 0 個にしない)。
- ⛔ シャッフルは宣言側では**しない**(「整然と並んだ」が崩れる)。
- ⚠ `MAPDEF` は `index.html:4771` の `let`。`spawnDragonHoard` は :23808 なので参照できる。

### 6-6. `driver_grid_s2` の空母集団の受け皿(⚠⚠⚠ 忘れると §8 が永久緑)

`UNTOUCHED` から竜を抜くと 0 件になる。沼 / 砦と同じ形で `?dragonfold=0` の腕を足したうえで、
**golden と突き合わせた mapDef の総数**を数える装置 assert を新設する。

- 畳んだ腕で竜が `["n4","n7"]` / `entry === "n4"` であること(= 腕を移した理由が実在する)。
- `?dragonfold=0` の腕で 8 ノード / `entry === "n0"` が実在すること。
- ⭐ **`G.check` を呼んだ回数が下限(撤退 5 シナリオ x 8 ノード + 廃坑)を割っていない**こと。
  ⛔ 下限をシナリオ名で焼かない —— 台帳(腕の一覧)から導く
  (#62 の教訓 = 母集団の下限や舞台名を定数で焼く assert は畳み系のたびに腐る)。

---

## 7. 撤退スイッチ

- **`?dragonfold=0`** — 畳む前の 8 ノード構成へ完全に戻る。
  戻るもの = ノード 8 個 / 旧 rect(7x6 と 9x6)/ 旧ノード絵 `n4` `n7` / `density` 1 /
  `NODE_EXTRA_SPAWN_KINDS` の竜の行が載らない / 財宝が西 45% 規則へ戻る。
- ⚠ 判定位置 = `index.html` の `DRAGON_FOLD_OFF`(`FORT_FOLD_OFF` の隣)。
- ⚠ ページ遷移を**またがない**。竜の巣は `index.html` 内で完結するので `sessionStorage` への
  写しは要らない(`?town=0` のような作法は不要。`?fortfold=0` と同じ)。

---

## 8. 受入条件 — `tools/verify_dragon_fold.js`(新規・base **10281**)

⭐ **期待値はその場で導く。** 移設した敵の顔ぶれは `?dragonfold=0` の n1+n2+n3+n4 の合計から、
ノード数は `buildScenarioRun("dragon-lair")` の戻り値から数える。
⛔ 体数・座標・ノード数を数字で焼き込まない(焼くと仕様変更で黙って腐る)。
⭐ 幾何は**本番の関数だけ**を通す(`nodeGateTile` / `isTileWall` / `NODE_ENTRY_INSET` /
`TILE_SIZE` / `MIMIC_APPROACH_RADIUS`)。マスクは**配信した `index.html` を自前でパース**して組む。

### §0 装置(先に母集団を確かめる)

- **(0a)** 既定の腕で竜が `["n4","n7"]` の 2 ノードへ畳まれ `entry === "n4"`。
  ⭐ **これが無いと以下の assert が全部空振りで永久緑になる。**
- **(0b)** `?dragonfold=0` の腕では 8 ノード / `entry === "n0"` が実在する。
- **(0c)** 自前パースしたマスクの開きマスが 0 でなく、塞ぎマスも 0 でない(パーサが死んでいない)。
- **(0d)** `MIMIC_APPROACH_RADIUS` が本番から読めている(0 でも `undefined` でもない)。

### §1 構造

- **(1a)** 既定の腕のノードが 2 件で id が `n4` / `n7`、`kind` が `start` / `boss`。
- **(1b)** `kind:"boss"` がグラフにちょうど 1 つ。
- **(1c)** `?dragonfold=0` の 8 ノードの kind の列が共通骨格と一致
  (⭐ n6 は竜だけ `loot`。⛔ ここを `event` と書かない)。

### §2 敵(⭐ 2 経路で突き合わせる)

- **(2a)** 畳んだ n4 の敵の**顔ぶれ**(種類ごとの体数)が、`?dragonfold=0` の
  n1+n2+n3+n4 の合計と**完全一致**。⛔ 座標は比べない(rect が変わる以上一致しない)。
- **(2b)** 畳んだ n7 の顔ぶれが `?dragonfold=0` の n7 と一致し、ボスが `pharaxus` 単騎。
- **(2c)** 敵の全タイルがマスクで開いている(絵に穴を開けていない)。
- **(2d)** 入場地点から最も近い敵まで **melee 交戦距離 400px より遠い**
  (入場ナレの最中に乱戦が始まらない)。

### §3 財宝とミミック(⭐ 本チケットの山場)

- **(3a)** 畳んだ n7 の mapDef に `hoard` が在り、宣言タイルが**すべてマスクで開いている**。
- **(3b)** 実際に湧いた宝箱 4 個の座標が**宣言タイルの集合と一致**する。
- **(3c)** 4 個の**相互の最大距離が 2 タイル以内**(塊として読める)。
  ⭐ `final-mimic.md` の「整然と並んだ古びた宝箱」を機械で測る唯一の形。
- **(3d)** ミミックから入場地点までの距離が `MIMIC_APPROACH_RADIUS` の **2 倍より遠い**
  (入った瞬間に起動しない)。
- **(3e)** ミミックからボス個体までの距離が 4 タイル(384px)より遠い。
- **(3f)** `?dragonfold=0` の腕では宝箱が**従来どおり西 45% の内側**に出る
  (フォールバックが生きている = 恒等性の根拠)。

### §4 罠と宝箱

- **(4a)** 畳んだ n4 で罠と玄室の宝箱が**どちらも 1 個以上**湧く
  (`NODE_EXTRA_SPAWN_KINDS` の兼務が効いている)。
- **(4b)** `?dragonfold=0` では n4 に兼務が載らない(旧構成では n2 / n3 が持っている)。

### §5 幾何

- **(5a)** n4 の rect が `tileBounds` と完全一致(`paintingAspectFits` の要求)。n7 も同様。
- **(5b)** パーティが実際に立ったタイルが「入る辺の中点 + `NODE_ENTRY_INSET`」と一致。
  ⚠ 数字を焼かず rect からの**独立式**で組む。
  ⭐ #58 の教訓 —— 行数の偶奇で `Math.floor` の midR が中心から 1 行ずれる。
  n4 は 20 行(偶数)、n7 は **19 行(奇数)**なので**2 枚で挙動が違う**。
- **(5c)** n4 の出口が `P6_RIGHT [39,13]` にあり、`nodeGateTile(rect,"right")` と一致。
- **(5d)** 起点タイルがマスクで開いている(「起点の床保証」が絵に穴を開けていない)。
- **(5e)** `density` が 2 ノードとも 0。

### §6 詰み防止

- **(6a)** 畳んだグラフの**全ノード**に `inactive` な敵が 0 体。
  ⭐ 竜は `inactive` を使わないので素で緑になるはず。装置として (0a) と対で読む。
- **(6b)** 入場地点から全敵へ 4 近傍で到達可能(`aStar` を本番から通す)。
- **(6c)** n4 → n7 の出口が `isNodeSettled()` の後に実際に立つ。

### §7 撤退

- **(7a)** `?dragonfold=0` で 8 ノードへ戻り、rect が 7x6 / 9x6、絵が旧 `n4` / `n7`。
- **(7b)** `?dragonfold=0` で `NODE_EXTRA_SPAWN_KINDS` に竜の行が載らない。

### §8 恒等(非退行)

- **(8a)** 他 5 シナリオの mapDef が `JSON.stringify` で 1 バイトも変わっていない。
  ⭐⭐⭐ **`hoard` を無条件に生やしていないことの検査**でもある(§2-2 の罠)。

### ⛔ 測らないこと

- **マスクの 1 マス単位の中身**。絵の解釈は目でやる領分で、数字で固定すると
  絵を差し替えた日に「マスクが正しいのに赤い」状態になる。
- **敵の座標そのもの**。rect が変わる以上、両腕で一致させることは原理的に不可能。
- **財宝の 4 マスがどのタイルか**。§5-4 で絵を見て決めるものなので、
  (3a)〜(3c) の**性質**だけを測る。⛔ 座標を焼き込まない。
- **難易度**(戦闘の勝率・所要ターン)。別チケット。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nofold` | `DRAGON_FOLDED` を常に false | §0 §1 §2 §3 §4 §5 |
| `nokinds` | `NODE_EXTRA_SPAWN_KINDS` の竜の行を落とす | §4 |
| `dropfoes` | `FOLD_MOVED_DRAGON` を空配列に | §2 (2a) |
| `hoardwide` | `hoard` 宣言を無視して西 45% 規則へ戻す | §3 (3b)(3c)(3d) |
| `hoardnull` | `p6Node` が `hoard` を**無条件に**載せる | §8 (8a) |
| `gateshift` | 出口を `P6_RIGHT` から 1 タイルずらす | §5 (5c) |
| `rectshift` | n4 の rect を 1 列ずらす | §5 (5a)(5c) |
| `startdefault` | `start` を既定 (36,13) に戻す | §5 (5b)(5d) |
| `density1` | `density` を 1 に戻す | §5 (5e) |

⭐ `hoardwide` と `hoardnull` が **§2-2 の罠を再現する変異**。
⚠ 変異の置換文字列は**必ず 1 行**に収める。置換前後で**バイト長をずらす**。
⛔ 次の行はアンカーに使わない(既存ドライバが逐語で握っている):

    ? { "bandits-forest": { n7: ["search", "loot"] } }        (grid_s2 の nosearchkind)
    const SWAMP_FOLDED = !SWAMP_FOLD_OFF && !SWAMP_MAP_OFF;   (swamp_fold の nofold/mapoff)

⚠⚠⚠ 変異の一覧は**机上で書かない**。1 本ずつ実走して**実際に赤くなった id** を §12 へ書く(#57 の教訓)。

### 既存 golden の非退行(実装後に必ず走らせる)

STEP1 で引き直した母集団を**全部**再走し、**判定トークン + assert id の列**で突き合わせる。
名指しで必ず含めるもの:

- `node tools/driver_graph_p6.js`
- `node tools/driver_grid_s2.js`(⛔ `--update-golden` は**使わない**。腕を移すだけ)
- `node tools/driver_spawn_not_on_gate.js`
- `node tools/driver_graph_p7.js` / `driver_graph_kinds.js`(腐らないはずのものを実測で確かめる)
- `node tools/driver_paint_blocked.js` / `driver_grid_p3b.js` / `probe_n4_stall.js`
- `node tools/verify_fort_fold.js` / `verify_swamp_fold.js` / `verify_temple_fold.js`

⚠ 基準値は 2026-09-11 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。
⛔ 期待値を下げて緑にしない。golden の焼き直しもしない。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` だとナレーション音声が無音)。

1. 溶岩の谷を西から東まで歩いて、横断路が 1 マスも切れていないこと。
2. 骨の谷の 10 体が**2 群**に分かれて襲ってくること(1 群で全部来ると事故)。
   ⭐⭐⭐ **畳んだ大部屋の難易度は体数でなく「群の分かれ方」で決まる。** 砦 #63 の
   「4 人 PT が n4 で全滅」は神殿では**再現しなかった** —— 西 5 + 東 6 に割れ、
   最短 13.00 タイルが `DETECTION_RANGE` 12.5 を超えて別々の戦闘になったため。
   ⇒ 31 列の骨の谷でも**群の最短距離を 12.5 タイル超**に保つこと(§5-2 で座標を決める時点の制約)。
3. 竜の寝床の手前に**宝箱が固まって並んで見える**こと。1 つがミミックだと分からないこと。
4. 入場した瞬間にミミックが起動しないこと。
5. ボス部屋へ入る演出で、左辺から出てくるのが不自然に見えないこと(§5-3 の判断の答え合わせ)。
6. iPhone 縦(390x844)で大部屋のカメラが破綻しないこと。
   ⚠ #14 の実測で **compact + 竜の巣は 4 人の時点で既にクランプ区間が空**。
   症状が出ていないのは `[compact-hero-anchor]` の 2 点ハードクランプが吸収しているから。
   ⛔ **この救済節を壊す改修を #67 に混ぜない。**

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>竜の巣が卓上マップ 2 枚になった</b> — 溶岩の谷と竜の寝床を、マス目入りの大きな一枚絵で歩けるようになった。"

⛔ `--no-verify` での迂回は禁止。そもそも Claude からは実行できない(ハーネスがハードブロック)。

---

## 11. やらないこと

- ⛔ **n5「冷えた溶岩溜まり」の rest の復活** — 廃坑 P8 / 沼 #62 / 砦 #63 / 神殿 #66 と同じ。
  補填は難易度・XP のチケット
- ⛔ **難易度・XP の再調整** — ⚠⚠ 砦 #63 で「**4 人 PT が畳んだ砦の n4 で全滅**」という
  実測が出ている。竜は最終シナリオなので同じ症状が出る可能性が高いが、
  その測定台 `sweep_recruit_balance` と `probe_party_size` が**両方壊れている**ので
  道具の修理を内包する別チケットにする
- ⛔ **`spawnDragonHoard` の西 45% 規則そのものの削除** — `?dragonfold=0` の行き先
- ⛔ **ミミックの強さ・演出・台詞の変更** — `final-mimic.md` の領分
- ⛔ **ボスの絵の描き足し・発注し直し** — §5-3 でマスクを開ける判断までが #67
- ⛔ **`?fortfold=0` など既存の撤退スイッチの削除**
- ⛔ **測定台の一斉健康診断 / 母集団ランナー** — 別チケット
- ⛔ **`git worktree list` に残った旧 baseline ツリー 10 本の掃除** — 別チケット。
  ⚠ `.gitattributes` を持たない古いコミットなので**測定台に使うと偽の結果**
- ⛔ **酒場の名前札が鏡文字になる不具合** — 別の単独コミットで直す
  (`tavern.html` の `npcPlace` が左向きの席に `scaleX(-1)` を掛け、子要素の
  `.patronLabel` が反転を継ぐ。直し方は特定済み。#66 着地後にユーザー判断で着手)
- ⛔ **`実装依頼書/README.md` への行追加**(#66 が着地してから)。用意してある行:

    | 67 | [2026-09-11_dragon-lair-fold.md](2026-09-11_dragon-lair-fold.md) | **承認済**(2026-09-12) | 0% | 竜の巣を **8 ノード → 2 ノード**へ畳む(旧タイプ MAP 全廃 **F4 = 最後の 1 枚**)。⭐⭐⭐ 最大の地雷は **`spawnDragonHoard` の西 45%** — 9x6 では 4 列なので固まるが、畳んだ 30x19 では **13 列**に散り、`final-mimic.md` の「整然と並んだ古びた宝箱」が崩れるうえ、**入場地点の隣に湧くと入った瞬間にミミックが起動**する(`MIMIC_APPROACH_RADIUS = 200px = 2.08 タイル`)⇒ 置き場を `mapDef` へ宣言し固めて並べる(ユーザー決定 = 案A)。⚠⚠⚠ **`hoard` を無条件に生やすと `driver_grid_s2` §8 の golden が全シナリオ一斉に赤くなる** ⇒ 渡されたときだけキーを生やす。⚠⚠⚠ **`UNTOUCHED` が空配列になる**(#66 が神殿を抜き #67 が竜を抜く)= §8 が永久緑 ⇒ 受け皿が要る。⭐ 道中の rect は **`[4,9,23,39]` が唯一解**(右辺中点 = `P6_RIGHT [39,13]`)。⚠ ボスは **19 行 = 奇数**なので n4(20 行 = 偶数)と midR の挙動が違う。⚠ ボスの異方性 **5.33%** は台帳で 2 番目に悪い ⇒ `--fit` の一次解を信じず (位相 x 周期) の 2 次元で振る。⚠⚠ `driver_grid_s2.js:90` と `driver_spawn_not_on_gate.js:69` は **#66 と同じ行**なので着地後に読み直す。⭐ 砦の「守護者を移すとクリア不能」は**竜にはかからない**(`inactive` を使わない)。⚠⚠⚠ **`js/df-mapdef.js` の `LINT_PAINTING_ASPECTS` へ 2 行が要る**(31x20 = 1.5500 / 30x19 = 1.5789 はどの既存比とも一致しない。砦が足さずに済んだのは 3:2 の偶然。#11/#53/#58/#66 に続く **5 例目**)。⚠⚠ **焼き tile は 2 枚で違ってよい**(#66 は広間 48 / 祭壇 64。⛔ 砦の 48 を写経しない)。⭐⭐⭐ 母集団は **`dragon-lair` + 変更ファイルを読む本 + 「測定器のソースを読む測定器」2 本** の union(⛔ `dragonfold` では引けない = #66 が緑→赤 2 本を作った原因)。⭐ `NODES_EXPECTED` は #66 が廃止済 ⇒ 足すのは `FOLD_ARM` の 1 行だけ。⭐ 難易度は体数でなく**群の分かれ方**(最短 > `DETECTION_RANGE` 12.5 タイルで別戦闘)。撤退 `?dragonfold=0`。受入 `verify_dragon_fold`(新規・base **10281**) |

---

## 12. 実装結果

### 12-0. 項目1 — 着手前の基準取り

- **測定日**: 2026-09-12(実装窓・項目1)
- **着手直前の `HEAD`** = **`bed11e7`**(`#67 起草 — F4 竜の巣を卓上マップ 2 枚へ畳む (依頼書 + 台帳)`)/
  作業ツリー **clean**(`git status --short` が空)/ ブランチ `main`
- ⛔ 本番コード(`index.html` / `tavern.html` / `audio.js` / `js/*.js`)も `tools/` の既存ファイルも
  **1 バイトも触っていない**。全走行の後に `git status --short` を取り直して **clean / `bed11e7`** を確認済み
- ⚠⚠ 検証ドライバを `timeout` で**包んでいない**(#64)。唯一の例外 `probe_party_size` は
  GNU `timeout` ではなく **Python から `taskkill /F /T` でプロセスツリーごと**落としている(下記 (f))
- ⚠⚠ **本番ツリーでそのまま逐次実走**。隔離 worktree は `verify_run_chronicle` の原因調査((e2))でだけ使い、
  使用後に撤去した。⛔ `git worktree list` に残る旧 baseline 10 本は**流用していない**
  (`.gitattributes` を持たない古いコミットなので測定台にすると偽の結果になる)
- **総所要 = 209.4 分**(母集団 138 本・逐次 / 08:17:51 → 11:47)
  + 再走 14 本 + フレーク確認 15 走行 + 隔離ツリー 5 走行 + HEAD 追試 5 走行 + プローブ 4 本
- **生ログ**(⭐ 項目5 / 項目6 はこの表ではなく**生ログ**と突き合わせること):
  `C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\54aab6f0-1319-431f-b690-1a3f0823d659\scratchpad\baseline67\`
  - `logs\<name>.log` … 母集団 138 本の全文
  - `logs\<name>_RERUN.log` … 汚染 9 本 + 新規非緑 5 本の単独再走
  - `logs\<name>_FLAKE{3,4,5}.log` … フレーク確認の 3 巡
  - `logs\verify_run_chronicle_WT7008057_{1..5}.log` / `_HEAD_{6..10}.log` … 原因調査
  - `logs\probe_{s2_fold,swamp_map,bandit_map}_ARG.log` … 引数つきプローブ
  - `logs\probe_party_size_CUTOFF.log` + `probe_party_size_note.txt`
  - 一覧 = `result_base67.FINAL.tsv`(**凍結済み**)/ `table_base67.md` /
    指紋 = `fingerprint_base67.tsv` / 非緑の抜粋 = `nongreen_base67.txt`

#### (a) 母集団の引き方と実測本数 — 下限 35 本に対し **union 134 本**

⛔ 走れるドライバは `tools/*.js` のうち `driver_` / `verify_` / `probe_` / `sweep_` で始まる **139 本**
(ヘルパ `_golden.js` / `_pptr_profile.js` / `_doors_fixture.js` / `auto_debug_run.js` /
`sim_plaza_entry.js` の 5 本は単体で `node <file>` として走らないので対象外)。
⭐ #66 の 138 本から 1 本増えているのは **#66 が `verify_temple_fold.js` を作ったぶん**。

| 段 | 引き方 | 本数 |
|---|---|---|
| **(i)** | 舞台名 `dragon-lair`(コメントを落としてから) | **36** |
| (参考) | 撤退スイッチの語 `dragonfold` | **0** |
| **(ii)** | 変更予定ファイルを**コードで**読む本 | **134** |
| **(iii)** | その測定器のソースを読む測定器 | **2** |
| | **union** | **134** |
| | 母集団外 | 5 |

⭐⭐⭐ **参考行の 0 本が、依頼書 §4-2 の警告の実体。** `dragonfold` は**まだ実装していないので
リポジトリのどこにも存在しない**。⇒ 撤退スイッチの語で引く手は、畳み系チケットでは
「痩せる」どころか**原理的に空集合**になる。

(ii) の内訳(⚠ **コメントを落としてから**判定した。`grep -l` はコメントも拾う = #47 の罠):

| 変更予定ファイル | 読む本 |
|---|---|
| `index.html` | **126** |
| `tavern.html` | 45 |
| `js/df-mapdef.js` | **21** |
| `tools/make_grid_map.py` | 4(`verify_codex_map_skill` / `verify_road_ambush` / `verify_tavern_map` / `verify_town_map`)|
| `tools/driver_grid_s2.js` | 1(`verify_swamp_fold`)|
| `tools/driver_graph_p6.js` / `driver_spawn_not_on_gate.js` | **0**(名指しはコメントの中だけ)|
| コメントでのみ言及(母集団外) | 2(`verify_world_heromark` / `verify_world_steps`)|

(iii) = `grep -ln "'tools/driver_\|'tools/verify_" tools/*.js` → **`verify_enemy_name_label` / `verify_eol_doorfix` の 2 本**。
⭐ 依頼書 §4-2 の「リポジトリ全体で 2 本」は**的中**。

⭐⭐⭐ **ただし #67 では (i) と (iii) は union を 1 本も増やさなかった。** どちらも (ii) の真部分集合で、
union = (ii) = 134。理由は **`index.html` が変更範囲に入っているから**で、竜に触れる本も
測定器を読む測定器も、ほぼ例外なく `index.html` を読む。
⛔ **これを「3 段は要らなかった」と読まないこと。** #66 は `index.html` を変えたのに
`verify_eol_doorfix (3a)` を取りこぼした(あれは `driver_doors_p5` の一節をバイト単位で凍結していた)。
⭐ 3 段を取る価値は「**union が増えたか**」ではなく「**増えなかったことを確かめられたか**」にある。

⭐ 母集団外の 5 本(`driver_bgm_title` / `probe_town_mask` / `verify_road_events` /
`verify_world_heromark` / `verify_world_steps`)も**念のため実走した**(#47「取りこぼした 1 本が
赤いまま出荷された」の再発防止)。**5 本とも EXIT=0**。
⚠ #66 の母集団外は 6 本だったが、#67 は `js/df-mapdef.js` も触るので
**`driver_doors_p1` が母集団の内側へ移った**(実走 EXIT=0 / 44/44)。

⚠ **実走したのは 138 本。** `probe_party_size` は母集団((i) に居る)だが既知の無限走行なので
スイープからは外し、**別枠で打ち切り実測した**((f))。

#### (a2) ⭐ 別窓が独立に同じ母集団を引き、**完全一致**した

走行中、別の Claude 窓(PID 28268 / セッション `52dfe631`)が `RESUME_ANCHOR.md` を
SessionStart で拾って**同じ #67 項目1 を独立に**引き直していた(08:33:18 開始。走行中の
`sweep67.py`(PID 3892)を検出して 08:39 ごろ自分から停止し、自分の node と chrome だけを落とした。
⭐ **リポジトリは両窓とも 1 バイトも変更していない**)。

その窓の母集団と本窓の母集団は **4 点すべてで一致**した:

1. **union = 134 本**
2. **母集団外 = 5 本**(`driver_bgm_title` / `probe_town_mask` / `verify_road_events` /
   `verify_world_heromark` / `verify_world_steps`)
3. **段1(舞台名)= 36 本**
4. **段3(測定器を読む測定器)= 2 本で、段2 の真部分集合**

⭐ 依頼書 §2-6 の「**35 本**」とのずれは、**#66 が `verify_temple_fold.js` を足したぶん**で説明がつく。
⇒ 母集団の引き方は**再現性がある**(2 つの独立な実装が同じ集合へ到達した)。

#### (b) 全ドライバの色(138 本 = 母集団 133 実走 + 母集団外 5)

⚠ 集計行は原文のまま(装飾の罫線だけ縮めてある)。**秒**は逐次実走時の実測。
⚠ 「FAIL 行」欄の id は機械抽出で、`(9x6)` のような**本文中の括弧を拾う偽陽性**が混ざる。
**正は生ログ**((c) に非緑の全 FAIL 行を原文で載せた)。

| ドライバ | exit | 集計行 | FAIL 行 | 秒 |
|---|---|---|---|---|
| `driver_action_priority` | 0 | `[driver] RESULT: PASSED 92 / FAILED 0 / PENDING 0` | — | 122 |
| `driver_bgm_mine` | 0 | `37/37 PASS` | — | 11 |
| `driver_bgm_title` | 0 | `16/16 PASS` | — | 2 |
| `driver_bgm_town` | 0 | `17/17 PASS` | — | 2 |
| `driver_cast_circle` | 0 | `56/56 PASS` | — | 4 |
| `driver_choice_logslot` | 0 | `[drv] 29/29 PASS   (--mutate nope)` | — | 5 |
| `driver_cleanup_phase1` | 0 | `[driver] RESULT: 28/28 passed` | — | 18 |
| `driver_cleric_sprites` | 0 | `[driver] RESULT: 85/85 passed` | — | 2 |
| `driver_depart_menu_clean` | 0 | `══════════ 結果: 41/41 PASS ══════════` | — | 126 |
| `driver_dev_gate` | 0 | `[driver] RESULT: 52/52 passed` | — | 26 |
| `driver_dev_gate2` | 0 | `══════════ 結果: 62/62 PASS ══════════` | — | 26 |
| `driver_diag_watchdog` | 0 | `PASS 34 / FAIL 0` | — | 624 |
| `driver_doors_p1` | 0 | `PASS 44 / FAIL 0` | — | 0 |
| `driver_doors_p2` | 0 | `══ 結果: 40/40 PASS ══` | — | 20 |
| `driver_doors_p5` | 0 | `══ 結果: 36/36 PASS ══` | — | 17 |
| `driver_doors_p6` | 0 | `══ 結果: 40/40 PASS ══` | — | 25 |
| `driver_doors_p8` | 0 | `══ 結果: 18/18 PASS ══` | — | 7 |
| `driver_elf_sprites` | 0 | `[driver] RESULT: 87/87 passed` | — | 1 |
| `driver_encounter_mopup` | 0 | `[drv] 36/36 PASS` | — | 350 |
| `driver_equip_compact_ios` | 0 | `=== WORKTREE: 31/31 PASS ===` | — | 46 |
| `driver_field_scale` | 0 | `[drv] working: 49/49 PASS` | — | 24 |
| `driver_field_step0` | 0 | `=== 測定妥当性 33/33 PASS ===` | — | 615 |
| `driver_field_step05_hud` | 0 | `=== 測定妥当性 6/6 PASS ===` | — | 38 |
| `driver_field_step1` | 0 | `=== 95/95 PASS ===` | — | 73 |
| `driver_field_step1_geo` | 0 | `=== 71/71 PASS ===` | — | 100 |
| `driver_field_step2` | 0 | `RESULT: 64/64  ALL PASS` | — | 39 |
| `driver_field_step3` | 0 | `RESULT: 65/65  ALL PASS` | — | 69 |
| `driver_field_step5` | 0 | `=== driver_field_step5  48/48 PASS ===` | — | 4 |
| **`driver_field_step6`** | **1** | `=== 55/59 PASS ===` | ⛔ | 1781 |
| `driver_field_step6_png` | 0 | `RESULT: 16/16  ALL PASS` | — | 22 |
| `driver_field_step7` | 0 | `=== driver_field_step7  79/79 PASS ===` | — | 245 |
| `driver_field_verge_gap` | 0 | `RESULT: 39/39  ALL PASS` | — | 26 |
| `driver_field_wagon` | 0 | `=== 測定妥当性 18/18 PASS ===` | — | 491 |
| `driver_fix4_help_bonus` | 0 | `[driver] RESULT: 13/13 passed` | — | 4 |
| `driver_graph_arrows` | 0 | `[drv] 80/80 PASS   (--mutate nope)` | — | 15 |
| `driver_graph_kinds` | 0 | `[drv] 66/66 PASS   (--mutate nokind)` | — | 38 |
| `driver_graph_p6` | 0 | `══ 結果: 249/249 PASS ══` | — | 43 |
| `driver_graph_p7` | 0 | `══ 結果: 60/60 PASS ══` | — | 5 |
| `driver_graph_reentry` | 0 | `[drv] 57/57 PASS   (--mutate nodom / cycles=5)` | — | 2 |
| `driver_graph_run` | 0 | `[drv] 99/99 PASS   (--mutate nosave)` | — | 76 |
| `driver_graph_sce1` | 0 | `[drv] 106/106 PASS` | — | 203 |
| `driver_grid_p3b` | 0 | `PASS 44 / FAIL 0` | — | 17 |
| **`driver_grid_p4`** | **3** | `[drv] ⛔ 変異 n1ringonly の置換対象が 見つからない → 負のコントロールが空振りする: "               \".............#...###.........###..#…` | — | 0 |
| `driver_grid_p5` | 0 | `PASS 103 / FAIL 0` | — | 175 |
| `driver_grid_p7` | 0 | `PASS 44 / FAIL 0` | — | 26 |
| **`driver_grid_p8`** | **1** | `PASS 55 / FAIL 1` | `6d` `9x6` | 288 |
| `driver_grid_p9` | 0 | `[drv] 52/52 PASS` | — | 441 |
| `driver_grid_s2` | 0 | `[drv] 119/119 PASS` | — | 5 |
| `driver_heromark_signplate` | 0 | `46 / 46` | — | 14 |
| `driver_leader_ai` | 0 | `[driver] RESULT: 42/42 passed` | — | 38 |
| `driver_log_compact` | 0 | `[driver] RESULT: 29/29 passed` | — | 6 |
| `driver_mapdef_step1` | 0 | `=== 208/208 PASS ===` | — | 19 |
| `driver_mapdef_step2` | 0 | `74/74 PASS` | — | 116 |
| `driver_mapdef_step3` | 0 | `122/122 PASS` | — | 114 |
| **`driver_mapeditor`** | **1** | `[driver] 176/179 PASS  (FAIL 3)` | ⛔ | 3 |
| **`driver_mapeditor_painting`** | **1** | `PASS 105 / FAIL 1  (合計 106)` | ⛔ | 9 |
| `driver_mapeditor_pointer` | 0 | `PASS 31 / FAIL 0  (合計 31)` | — | 21 |
| `driver_mapeditor_props` | 0 | `PASS 71 / FAIL 0  (合計 71)` | — | 4 |
| `driver_mapeditor_railkit` | 0 | `PASS 134 / FAIL 0  (合計 134)` | — | 9 |
| `driver_mapeditor_texture` | 0 | `PASS 30 / FAIL 0  (合計 30)` | — | 4 |
| `driver_mapeditor_waterkit` | 0 | `PASS 138 / FAIL 0  (合計 138)` | — | 9 |
| `driver_mine_wall` | 0 | `66/66 PASS` | — | 221 |
| `driver_monsters_chimera` | 0 | `[driver] RESULT: 17/17 passed` | — | 44 |
| **`driver_monsters_griffon`** | **1** | `[driver] RESULT: 14/17 passed` | — | 72 |
| `driver_monsters_hobgoblin` | 0 | `[driver] RESULT: 14/14 passed` | — | 14 |
| **`driver_monsters_kobold`** | **1** | `[driver] RESULT: 11/12 passed` | — | 107 |
| `driver_monsters_orc` | 0 | `[driver] RESULT: 7/7 passed` | — | 12 |
| **`driver_monsters_umberhulk`** | **1** | `[driver] RESULT: 21/22 passed` | — | 211 |
| `driver_paint_blocked` | 0 | `PASS 65 / FAIL 0` | — | 7 |
| `driver_paint_grid` | 0 | `PASS 21 / FAIL 0  (shots: C:\Users\PC_User\AppData\Local\Temp\claude\df_paint_grid_shots)` | — | 2 |
| `driver_party_view_reopen` | 0 | `========== 結果: 35/35 PASSED / 0 FAILED / 0 PENDING ==========` | — | 73 |
| `driver_rogue_sprites` | 0 | `[driver] RESULT: 49/49 passed` | — | 1 |
| `driver_room_search_roll` | 0 | `[driver] RESULT: 39/39 passed` | — | 1 |
| **`driver_sce1_events`** | **1** | `[drv] RESULT: 211/214 passed` | `4d` | 48 |
| `driver_scroll_autoskip` | 0 | `[driver] RESULT: 9/9 passed` | — | 4 |
| `driver_skillcheck_roster` | 0 | `[driver] RESULT: 13/13 passed` | — | 4 |
| `driver_spawn_not_on_gate` | 0 | `[drv] 67/67 PASS` | — | 5 |
| `driver_speech_boss` | 0 | `[driver] RESULT: 19/19 passed` | — | 21 |
| **`driver_speech_engine`** | **1** | `[driver] RESULT: 16/17 passed` | ⛔ | 17 |
| `driver_speech_hooks` | 0 | `[driver] RESULT: 13/13 passed` | — | 141 |
| **`driver_speech_v2`** | **1** | `[driver] RESULT: 45/46 passed` | ⛔ | 52 |
| `driver_trap_disarm` | 0 | `[driver] RESULT: 44/44 passed` | — | 1 |
| `driver_trap_weaponize` | 0 | `[driver] RESULT: 43/43 passed` | — | 1 |
| `driver_wall_face` | 0 | `[drv] 54/54 PASS` | — | 35 |
| **`driver_wall_props`** | **1** | `[drv] 27/29 PASS` | `3a` `3b` | 17 |
| `driver_wallbox` | 0 | `28/28 PASS` | — | 6 |
| `driver_warrior_variants_sprite` | 0 | `[driver] RESULT: 50/50 passed` | — | 1 |
| **`probe_bandit_map`** | **3** | `[probe] --mapdefs / --places / --grid / --ai のどれかを指定` | — | 0 |
| `probe_boss_latch` | 0 | `[prb] 5/5 PASS` | — | 45 |
| **`probe_n4_stall`** | **1** | `[probe] 試行 1: 停滞は観測されませんでした` | — | 102 |
| `probe_p9_tour` | 0 | `→ 4 か所すべて回れた: 4 / 4` | — | 1654 |
| `probe_paint_overlay` | 0 | `extra={"theme":"goblin-mine","scenarioId":"goblin-mine","isCustom":true,"fieldMode":false,"painting":{"them…` | — | 7 |
| `probe_rest_premature` | 0 | `[probe] 休憩 3 回中、周囲に未参戦の生存敵がいたのは 0 回` | — | 290 |
| `probe_s2_clear` | 0 | `[probe] ✓ 全 3 走行が装置 assert を通りました` | — | 159 |
| **`probe_s2_fold`** | **3** | `[probe] --kinds / --lint のどちらかを指定` | — | 0 |
| `probe_s4_relocate` | 0 | `[probe] raw: C:\Users\PC_User\AppData\Local\Temp\probe_s4_relocate.json` | — | 2 |
| **`probe_swamp_map`** | **3** | `[probe] --bfs を指定してください (任意で --cut <global col>)` | — | 0 |
| `probe_town_mask` | 0 | `到達できないマス = 0 件 (0 件が正常)` | — | 1 |
| **`sweep_recruit_balance`** | **1** | `[sweep] ⛔ 装置 assert が崩れた走行が 4/4 件あります` | — | 157 |
| `verify_ability_scores` | 0 | `24/24 PASSED   FAILED 0   **PENDING** 0` | — | 3 |
| `verify_aoe_coverage` | 0 | `28/28 PASSED   FAILED 0   PENDING 0` | — | 2 |
| **`verify_codex_map_skill`** | **1** | `16/17 PASSED   FAILED 1   **PENDING** 0` | `3a` | 35 |
| `verify_cone_cast` | 0 | `19/19 PASSED   FAILED 0   **PENDING** 0` | — | 67 |
| `verify_darkvision` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 81 |
| `verify_enemy_name_label` | 0 | `30/30 PASSED   FAILED 0   **PENDING** 0` | — | 2 |
| `verify_eol_doorfix` | 0 | `素 27/27 PASSED` | — | 6 |
| `verify_fort_fold` | 0 | `PASS 30 / FAIL 0` | — | 1 |
| `verify_hold_person` | 0 | `31/31 PASSED   FAILED 0   PENDING 0` | — | 10 |
| `verify_mercenary_roster` | 0 | `[mercenary-roster] 44 PASSED / 0 FAILED / 0 PENDING  (44/44)` | — | 20 |
| `verify_npc_crowd` | 0 | `33/33 PASSED   FAILED 0   **PENDING** 0` | — | 72 |
| `verify_party_four` | 0 | `PASS 17 / FAIL 0` | — | 7 |
| `verify_party_match_setup` | 0 | `[driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0   (合計 36)` | — | 101 |
| `verify_party_promises` | 0 | `35/35 PASSED   FAILED 0   PENDING 0` | — | 250 |
| `verify_player_sheet` | 0 | `73/73 PASSED   FAILED 0   **PENDING** 0` | — | 56 |
| `verify_pm_drawer_fit` | 0 | `75/79 PASSED   FAILED 0   PENDING 4` | — | 70 |
| `verify_prep_retire` | 0 | `30/30 PASSED   FAILED 0   PENDING 0` | — | 147 |
| `verify_quest_visibility` | 0 | `素 39/39 PASSED  (PENDING 0)` | — | 16 |
| `verify_quest_walk` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 208 |
| `verify_recruit_size` | 0 | `══════════ 結果: 91/91 PASS ══════════` | — | 72 |
| `verify_recruit_talk` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 63 |
| `verify_road_ambush` | 0 | `41/41 PASSED` | — | 66 |
| `verify_road_boon` | 0 | `20/20 PASSED   FAILED 0   **PENDING** 0` | — | 70 |
| `verify_road_events` | 0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | — | 84 |
| `verify_roll_target` | 0 | `30/30 PASSED   FAILED 0   **PENDING** 0` | — | 219 |
| **`verify_run_chronicle`** | **1** | `[run-chronicle] 71 PASSED / 2 FAILED / 0 PENDING` | `2z3` `2a` `2z3` `2a` | 218 |
| `verify_save_slots` | 0 | `[save-slots] RESULT: 30/30 passed` | — | 5 |
| `verify_swamp_fold` | 0 | `PASS 30 / FAIL 0` | — | 2 |
| `verify_swamp_lair` | 0 | `PASS 26 / FAIL 0` | — | 3 |
| `verify_swamp_novice` | 0 | `PASS 34 / FAIL 0` | — | 10 |
| `verify_tavern_map` | 0 | `43/43 PASSED   FAILED 0   **PENDING** 0` | — | 21 |
| `verify_temple_fold` | 0 | `PASS 24 / FAIL 0` | — | 93 |
| `verify_title_screen` | 0 | `[title-screen] RESULT: 86/86 passed` | — | 66 |
| `verify_town_exit` | 0 | `素 23/23 PASSED  (PENDING 0)` | — | 7 |
| `verify_town_map` | 0 | `85 / 85` | — | 51 |
| **`verify_walk_block`** | **1** | `22/23 PASSED   FAILED 1   **PENDING** 0` | `3d` | 15 |
| `verify_world_heromark` | 0 | `18/18 PASSED   FAILED 0   **PENDING** 0` | — | 10 |
| `verify_world_map` | 0 | `57/57 PASSED   FAILED 0   **PENDING** 0` | — | 74 |
| `verify_world_steps` | 0 | `33/33 PASSED   FAILED 0   **PENDING** 0` | — | 54 |

⇒ **緑 118 本 / 非緑 20 本**(母集団外 5 本は全部緑)。

#### (c) 着手前から非緑の **20 本** — ⛔ どれも #67 の責任ではない

⭐ 内訳 = **#65 から続く 5 本** + **#66 で増えた 10 本** + **#67 で新たに非緑になった 5 本**。

**c-1. #65(依頼書 §4-4 が名指し)から続く 5 本 — 5 本とも今も非緑**

| ドライバ | exit | 型 | 赤の理由(1 行) |
|---|---|---|---|
| `driver_grid_p4` | **3** | 3(無関係) | 変異 `n1ringonly` のアンカー(廃坑 n1 のマスク行)が腐って**置換対象 0 箇所** ⇒ 起動時検算で即死。⚠⚠ **素の assert が 1 本も走っていない**(0.5 秒・集計行なし) |
| `driver_mapeditor` | 1 | 3 | 176/179。`map-editor.html` の実マウス操作 3 本(`§2 12b` / `§3 12a` / `§3 12b`) |
| `driver_mapeditor_painting` | 1 | 3 | `§1 1d2` label 15 種に対しサイズの種類数 **14**。衝突は **`部屋n4big 30×20` と `部屋n7big 30×20`**(#63 砦が同寸で入ったもの) |
| `sweep_recruit_balance` | 1 | 3 | 装置崩れ 4/4(`4_partySize(got=1 want=4)` = #61 以降の腐り) |
| `driver_monsters_umberhulk` | 1 | 3 | 21/22。umber hulk の gaze 再発火 1 件(#64 / #65 / #66 と同一) |

**c-2. #66 で増えた 10 本**

| ドライバ | exit | 型 | 赤の理由(1 行) |
|---|---|---|---|
| `driver_field_step6` | 1 | **1 の予兆** | **55/59**。`(C-bandits-forest)(C-lizard-swamp)(C-orc-fort)` に **`(C-undead-temple)` が 4 本目として加わった**(#66 の予告どおり)。⭐⭐⭐ **畳んだシナリオは入口ノードがそのまま戦闘部屋になり「前進した」が成立しない** ⇒ **#67 が竜を畳むと `(C-dragon-lair)` が 5 本目として必ず増える。これは退行ではない**。⛔ `?dragonfold=0` で緑にするのは Part C の注記が禁止。⚠ 所要 **1780.9 秒(29.7 分)は正常**(「完走しない」は古い記録) |
| `driver_grid_p8` | 1 | 3 | `(6d)`「他 4 シナリオの n7 (9x6) は大部屋ではない」— 実測 `{"size":{"w":29,"h":20},"bigRoom":true}`。#63 砦で n7 が大部屋になったため |
| `driver_sce1_events` | 1 | 3 | `(2)(4d)(N2-隣)` `sceneFlags` の期待表が 3 本固定なのに `s3_novice_swayed`(#53)が増えて **4 本** |
| `driver_speech_v2` | 1 | 3 | `(A1)` `swampNovice` に `enemy.cry.<type>` が無い(#53 で敵種だけ増えた) |
| `verify_codex_map_skill` | 1 | 3(⚠ 要注意) | `(3a)` 既存 **13 件**の焼き直し SHA 照合で **`stag-tavern` だけ不一致**。⚠⚠ **`tools/make_grid_map.py` を読む 4 本のうち唯一の受入ドライバ** = STEP2 で `GRIDS` に竜 2 エントリを足す本チケットの隣人。⭐ 13 件に増えているのは #66 が `temple-hall` / `temple-altar` を足したため |
| `verify_walk_block` | 1 | 3 | `(3d)` badge を持つ `ENEMY_TYPES` が期待 44 件に対し **45 件**(`goblinRider` / `goblinArcher`) |
| `probe_bandit_map` | 3 | **—** | ⭐ **赤ではない**(下記 (g) で実測確定) |
| `probe_s2_fold` | 3 | **—** | 同上 |
| `probe_swamp_map` | 3 | **—** | 同上 |
| `probe_n4_stall` | 1 | **—** | ⭐ **赤ではない**。「停滞は観測されませんでした」= 健全。exit 1 が正常系 |

**c-3. #67 で新たに非緑になった 5 本 — ⭐ 5 本とも「型2(偽の赤)」= フレーク**

⚠⚠ これらは **#66 の基準では全部緑**だった。⇒ (e) で 5 回ずつ回して分類した。

| ドライバ | 走査中 | 型 | 5 回中の緑 |
|---|---|---|---|
| `driver_monsters_griffon` | 14/17 | 2(偽の赤) | **3/5** |
| `driver_monsters_kobold` | 11/12 | 2 | **4/5** |
| `driver_speech_engine` | 16/17 | 2 | **3/5** |
| `driver_wall_props` | 27/29 | 2 | **4/5** |
| `verify_run_chronicle` | 71/73 | 2 | **7/10**(下記 (e2)) |

⭐⭐⭐ **5 本とも失敗の指紋が「観測そのものが無い」**(#47 の型)。
`griffon` = `grifRearMid=0/8` かつ回帰 assert が `entries=0` / `kobold` = `maxPack=0` /
`speech_engine` = `(4) カメラが実際に動いた(テストが空回りしていない)` /
`wall_props` = 画素変化 **18/18144 px (0.099%)** と **13/387072 px (0.003%)** /
`run_chronicle` = `(2z3) [装置] 母集団が空でない — boardEnemyLoss=0`。
⛔ **期待値と実測値が両方とも意味のある数**で食い違っているものは 1 本も無い。

#### (d) 汚染 9 本の単独再走 — ⭐ 色は 1 本も動かなかった

別窓(セッション `52dfe631`)が 08:33:18〜08:39 に headless Chrome を走らせていた区間は、
本窓の elapsed **15.45〜21.15 分**にあたる。その区間に在庫していた 9 本を**単独で**走らせ直した。

⚠ うち `driver_equip_compact_ios` だけは本窓のログ上 **elapsed 23.13 分(= 08:40:59)開始**で、
相手の停止(08:39)の約 2 分後にあたり**重なっていない**。⭐ 残骸 chrome の可能性を否定できないので
**保険として再走に含めた**(46 秒)。

| ドライバ | 初回(走査中・汚染区間) | 再走(単独) | 採用値 |
|---|---|---|---|
| `driver_diag_watchdog` | exit=0 / 623.8s | exit=0 / 774.0s | **exit=0**(一致) |
| `driver_doors_p1` | exit=0 / 0.1s | exit=0 / 0.1s | **exit=0**(一致) |
| `driver_doors_p2` | exit=0 / 20.5s | exit=0 / 21.5s | **exit=0**(一致) |
| `driver_doors_p5` | exit=0 / 16.6s | exit=0 / 16.6s | **exit=0**(一致) |
| `driver_doors_p6` | exit=0 / 25.1s | exit=0 / 25.2s | **exit=0**(一致) |
| `driver_doors_p8` | exit=0 / 6.7s | exit=0 / 6.7s | **exit=0**(一致) |
| `driver_elf_sprites` | exit=0 / 1.4s | exit=0 / 1.4s | **exit=0**(一致) |
| `driver_encounter_mopup` | exit=0 / 350.1s | exit=0 / 349.4s | **exit=0**(一致) |
| `driver_equip_compact_ios` | exit=0 / 46.1s | exit=0 / 46.2s | **exit=0**(一致) |

⭐ **exit だけに賭けず集計行でも突き合わせた** — 9 本とも**完全一致**:
`driver_diag_watchdog` 34/34 / `driver_doors_p1` 44/44 / `driver_doors_p2` 40/40 /
`driver_doors_p5` **36/36** / `driver_doors_p6` 40/40 / `driver_doors_p8` 18/18 /
`driver_elf_sprites` 87/87 / `driver_encounter_mopup` 36/36 / `driver_equip_compact_ios` 31/31。
⚠ `driver_doors_p5` が #66 の 35/35 から **36/36** になっているのは、**#66 項目5 が言い直して
assert を 1 本増やした**ぶんで、退行ではない。

⭐ **結論 = 並走は本窓の 9 本の色を 1 ビットも動かしていない。** 動いたのは所要秒だけで、
それも `driver_diag_watchdog` の 623.8 → 774.0 秒(+24%)が最大。
⛔ **「相手の窓で緑だった」ことは根拠にならない**(相手が走らせた本と本窓の 9 本は別物)。
根拠は**本窓で同じ 9 本を単独で走らせ直した出力**。

#### (e) フレーク判定 — 新規非緑 5 本を **5 回ずつ**

| ドライバ | 1 走査 | 2 単独 | 3 単独 | 4 単独 | 5 単独 | 判定 |
|---|---|---|---|---|---|---|
| `driver_monsters_griffon` | 赤 | 緑 | 緑 | **赤** | 緑 | ⭐ フレーク 3/5 緑 |
| `driver_monsters_kobold` | 赤 | 緑 | 緑 | 緑 | 緑 | ⭐ フレーク 4/5 緑 |
| `driver_speech_engine` | 赤 | 緑 | 緑 | 緑 | **赤** | ⭐ フレーク 3/5 緑 |
| `driver_wall_props` | 赤 | 緑 | 緑 | 緑 | 緑 | ⭐ フレーク 4/5 緑 |
| `verify_run_chronicle` | 赤 | **赤** | 緑 | **赤** | 緑 | ⭐ フレーク(追試で 7/10 緑)|

⭐⭐⭐ **2 回では足りなかった。** `verify_run_chronicle` は 1 回目・2 回目とも赤で、
集計行も `71 PASSED / 2 FAILED` と**完全に一致**していたため、本窓は一度
「**再現する安定した赤**」と判定しかけた。3 回目で緑になって覆った。
⇒ **「単独で再走して同じ色なら本物」は誤り。同じ色が 2 回続くフレークが実在する。**
⛔ 非緑の分類は **3〜5 回**回してから書くこと。

#### (e2) ⭐ `verify_run_chronicle` の原因調査 — **`0c63af2` の退行という仮説は棄却された**

`verify_run_chronicle` は #66 の基準で **73/73 緑**だった。#66 着地(`7008057`)から本窓の
着手前(`bed11e7`)までの間にある**依頼書以外のコミットは `0c63af2`(酒場の名札の鏡文字修正)1 本だけ**で、
これは `tavern.html` を触っている。そして `verify_run_chronicle.js:87` は
`fs.readFileSync(path.join(ROOT, 'tavern.html'))` で **`tavern.html` を読んで配信している**。
さらに `0c63af2` のコミットメッセージが実走を報告している golden は
`verify_hold_person` / `verify_party_promises` / `verify_npc_crowd` / `verify_tavern_map` の **4 本だけ**で、
**`verify_run_chronicle` は含まれていない**。

⇒ 「`0c63af2` が入れた退行では?」という仮説を、**両方の木で実際に走らせて**検証した。

| 木 | コミット | 走行 | 結果 |
|---|---|---|---|
| 隔離 worktree | **`7008057`**(#66 着地) | 5 回 | **5/5 緑**(全部 `73 PASSED / 0 FAILED`)|
| 本番ツリー | **`bed11e7`**(着手前) | 10 回 | **7/10 緑**(赤 3 回はすべて `71 PASSED / 2 FAILED`)|

- ⚠⚠⚠ **#64 の罠(`git worktree add` が CRLF 化して偽の赤を作る)は踏んでいない。**
  隔離ツリーを作った直後に **blob OID を 6 本突き合わせて全一致**
  (`index.html` / `tavern.html` / `js/df-mapdef.js` / `tools/verify_run_chronicle.js` /
  `.gitattributes` / `audio.js`)。さらに `index.html` の行末を `py` でバイト単位に数えて
  **両ツリーとも CRLF=39161 / LF-only=0** を確認した(⛔ `grep` では測っていない)。
  ⇒ `.gitattributes`(#65 が `8566218` で入れたもの)が効いている。
- ⛔ **`git worktree list` に残る旧 baseline 10 本は流用していない**(`7008057` から新規に作成し、
  使用後に `git worktree remove --force` + `git worktree prune` で撤去した)。

**⇒ 統計的に差が無い。** Fisher の正確確率検定で **両側 p = 0.51**。
⭐⭐⭐ **仮説は棄却。`0c63af2` が退行を入れた証拠は無い。** `verify_run_chronicle` は
**両方の木で起こりうるフレーク**(型2)であり、`7008057` の 5 回が全部緑だったのは
標本が小さいだけで説明がつく。

⭐⭐⭐ **この調査から出る一般則**: 「隔離ツリーで緑なら原因コミットが確定する」という設計は、
**その赤が決定論的であることを暗黙に仮定している**。フレークに対して 1 回だけ走らせると、
**40% の確率で「退行を発見した」という誤った結論**が出る。
⇒ **原因調査に入る前に、その赤が決定論的かを 3〜5 回で確かめる。**
⚠ 本窓は当初 2/5 緑の時点で p=0.17 を見込んでいたが、追試 5 回が全部緑になり p=0.51 へ動いた。
**途中の見込みで結論を書かなくてよかった実例。**

#### (f) `probe_party_size` — 「終了しない」ことの実測

⚠ 依頼書 §4-5 / メモリが「終了しない 1 本」と名指ししているが、**除外したものは「測った」ことにならない**。
⇒ スイープとは別枠で単独起動し、**明示的に打ち切って**記録した。
⛔ GNU `timeout` では包んでいない(#64 = 打ち切った node が孤児として残りポートを掴み、
次の起動が `EADDRINUSE` で即死する)。**Python から `taskkill /F /PID <pid> /T` でプロセスツリーごと**落とした。

```
probe_party_size.js — 明示的な打ち切りつき単独実走
開始      : 2026-09-12 13:09:35
打ち切り秒: 600
打ち切り時刻: 2026-09-12 13:19:35 (600.0 秒経過。⭐ 自力では終了しなかった)
taskkill 後の exit: 1
ログ行数  : 46
打ち切り時点の出力の末尾 15 行:
      NG  (1e) departToScenario() が実際に index.html へ遷移しようとし、横取りで酒場に留まった  -- 横取り 0 件 / 現在地 = http://localhost:9345/world.html
      OK  (1f) 既定腕は募集 ON のまま (?recruit を触っていない)  -- isRecruitOn()=true search=""
    ====== §2 受入条件 1. 既定が本番と 1 ビットも変わらない ======
      既定腕: goblin-mine(星1)=計1人/NPC0  bandits-forest(星2)=計1人/NPC0  lizard-swamp(星2)=計1人/NPC0  orc-fort(星3)=計1人/NPC0  undead-temple(星3)=計1人/NPC0  dragon-lair(星4)=計1人/NPC0
      NG  (2a) ?party 無指定で 6 シナリオの formation 人数が #7 と一致する  -- goblin-mine: NPC 0 (期待 3) / bandits-forest: NPC 0 (期待 2) / lizard-swamp: NPC 0 (期待 2) / orc-fort: NPC 0 (期待 3) / undead-temple: NPC 0 (期待 3) / dragon-lair: NPC 0 (期待 3)
      NG  (2b) 経路 B (recruitCountOf の戻り値) とも一致する — 2 経路の突き合わせ  -- goblin-mine:3 bandits-forest:3 lizard-swamp:3 orc-fort:3 undead-temple:3 dragon-lair:3
      ?party=5 腕: goblin-mine(星1)=計1人/NPC0  bandits-forest(星2)=計1人/NPC0  lizard-swamp(星2)=計1人/NPC0  orc-fort(星3)=計1人/NPC0  undead-temple(星3)=計1人/NPC0  dragon-lair(星4)=計1人/NPC0
      NG  (2z1) 対照群: ?party=5 で 6 シナリオとも計 5 人 (シームは生きている)  -- goblin-mine:計1人 / bandits-forest:計1人 / lizard-swamp:計1人 / orc-fort:計1人 / undead-temple:計1人 / dragon-lair:計1人
      NG  (2z2) 既定腕と ?party=5 腕は実際に別物 (腕が割れている)  -- 既定=[1,1,1,1,1,1] / 指定=[1,1,1,1,1,1]
      NG  (2z3) 不正値 (?party=abc) は恒等に戻り、silent fail-open にならない ([DIAG] が出る)  -- [DIAG] 6 行 / 例: [DIAG] party override: ignored (2〜8 の整数ではない) raw="abc" -> 4
      NG  (2z4) 範囲外 (?party=9) は恒等に戻り、[DIAG] が出る  -- [DIAG] 6 行 / 例: [DIAG] party override: ignored (2〜8 の整数ではない) raw="9" -> 4
      OK  (2z5) ページエラーが 0 件  -- なし
    ====== §4 受入条件 2. 負のコントロール ======
      (--negative を付けたときだけ判定する。ここでは変異が配信できることだけ確かめる)
      OK  (4z0) 変異アンカーが tavern.html にちょうど 1 箇所ある  -- hits=1
残存 node (probe_party_size): 'なし'
```

#### (g) ⭐ 即死 4 本の分類を**引数を与えて**決着させた

`exit=3` かつ 0.0〜0.5 秒の本が 4 本ある。このうち後ろ 3 本について
「畳みの済んだ舞台のプローブなので、母集団の下限や舞台名を定数で焼いた assert が
#66 で構造的に死んだ型ではないか」という疑いが出たので、**本来の引数を与えて実走**した。

| プローブ | 引数なし | 引数つき | 結論 |
|---|---|---|---|
| `probe_s2_fold` | exit=3 / 0.0s | **`--kinds` → exit=0** | ⭐ 引数なしの正常終了。`bandits-forest` の n7 を実入場して 敵 11 / 罠 8 / 玄室宝箱 9 / 檻 2 を数え切った |
| `probe_swamp_map` | exit=3 / 0.0s | **`--bfs` → exit=0** | ⭐ 同上。`lizard-swamp` n4 の敵スロット全件に `isTileWall` と `aStar` 歩数(8〜26)を出した |
| `probe_bandit_map` | exit=3 / 0.0s | **`--places` → exit=0** | ⭐ 同上。候補タイル表を歩数つきで出した(到達不能 1 マスを含む) |
| `driver_grid_p4` | exit=3 / **0.5s** | — | ⛔ **これだけは本物の腐り**。変異アンカーが 0 箇所で起動時検算に落ちる(c-1) |

⭐ ソース側の裏づけも取れている: 3 本とも `process.exit(3)` は**モード分岐の行**にあり、
**ブラウザを 1 度も起動する前**に `console.error` で使い方を出して抜ける
(`probe_s2_fold.js:188` / `probe_swamp_map.js:98` / `probe_bandit_map.js:338` 付近)。
所要 0.0 秒はその裏づけ。
⇒ **「引数なしで正常に非 0 終了するプローブ」で確定。構造的な死ではない。**
⛔ 3 本を「着手前から赤い」に数えない。

#### (h) 予想と実測の食い違い

| 予想(orchestrator / 依頼書 §4-4) | **実測** | 判定 |
|---|---|---|
| `driver_grid_p4` EXIT=3 | **EXIT=3**(0.5 秒・集計行なし) | ✅ 的中 |
| `driver_mapeditor` 176/179 | **176/179 / EXIT=1** | ✅ 的中 |
| `driver_mapeditor_painting` 105/106 | **PASS 105 / FAIL 1 / EXIT=1** | ✅ 的中 |
| `sweep_recruit_balance` 装置崩れ | **装置崩れ 4/4 / EXIT=1** | ✅ 的中 |
| `driver_monsters_umberhulk` 21/22 | **21/22 / EXIT=1** | ✅ 的中 |
| `probe_party_size` 終了しない | **10 分で打ち切り・自力では終了せず**((f)) | ✅ 的中 |
| 引数なしプローブの正常な非 0 終了 **4 本** | **3 本**(`probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map`)+ `probe_n4_stall` の exit 1 | ⚠ 内訳が違う |
| 母集団は「名指し 35 本が下限、#66 実測 132 本と同程度」 | **union 134 本**(実走 138) | ✅ ほぼ的中 |

⛔ **訂正 4 件:**

1. ⭐⭐⭐ **非緑は 6 本でも 15 本でもなく 20 本。** うち「本物の赤」は **16 本**、
   「調査プローブの正常な非 0」が 4 本(`probe_n4_stall` を含む)。
   さらに 16 本のうち **5 本はフレーク**なので、**安定して赤いのは 11 本**。
2. ⭐⭐ **`driver_field_step6` は 56/59 ではなく 55/59。** #66 が予告した
   `(C-undead-temple)` が **4 本目として実在した**。⇒ #67 で **5 本目 `(C-dragon-lair)` が増えるのは既定路線**。
3. ⭐⭐ **`verify_codex_map_skill (3a)` の母集団は 4 件ではなく 13 件**(#66 が神殿 2 枚を足した)。
   不一致は `stag-tavern` 1 件のまま。
4. ⭐⭐ **`driver_doors_p2` / `p5` / `p8` は緑**(40/40 / 36/36 / 18/18)。
   #62 のメモが `driver_doors_p2` 33/34 を赤と記録しているが **#65 が回収済み**。
   ⛔ 「昔から赤い」を引き継がないこと。

#### (i) ⭐ 測って分かった罠

- ⭐⭐⭐ **同じ色が 2 回続くフレークが実在する**((e))。「単独再走で同じ色なら本物」は誤り。
- ⭐⭐⭐ **原因調査は「その赤が決定論的か」を先に測ってから始める**((e2))。
  フレークに 1 回だけ隔離ツリーを当てると、**誤って「退行を発見した」と結論する**。
- ⭐⭐⭐ **母集団の 3 段は「union が増えないこと」を確かめるために取る**((a))。
  #67 では (i)(iii) とも (ii) の真部分集合だったが、それは `index.html` を触るからで、
  次の畳みで同じとは限らない。
- ⚠⚠⚠ **スイープ道具の `tag` が TSV 名を決め、起動時に `"w"` で開き直す**。
  再走を同じ `tag` で起動すると**母集団 138 本の記録が丸ごと消える**。
  ⇒ 再走は `tag` を変える + **走り終えた TSV を `*.FINAL.tsv` へ凍結してから**次を起動する。
  本窓は凍結後に `md5sum` で一致を確認してから再走に入った。
- ⚠⚠ **Bash ツールのクォート付き heredoc でも `\\` が `\` へ潰れる**。
  Python の `'\\'` と正規表現の `[/\\]` が両方壊れて `SyntaxError` / `PatternError` になった。
  ⇒ スクリプトは **Write ツール**で書くか、バックスラッシュを `chr(92)` で組む。
- ⭐⭐ **所要 209.4 分 / 138 本**(#66 は 202 分 / 131 本)。上位 6 本で **93.4 分(45%)**:
  `driver_field_step6` 1781s / `probe_p9_tour` 1654s / `driver_diag_watchdog` 624s /
  `driver_field_step0` 615s / `driver_field_wagon` 491s / `driver_grid_p9` 441s。
  **残り 132 本は合計 115.9 分**。⇒ 項目6 の再走はこの 6 本を別枠にすること。
- ⭐ **`index.html` の行番号は依頼書(`0b9034d` 時点)から全部ズレている**。実測:
  `buildDragonLairRun` = **37961**(依頼書 37731)/ `spawnDragonHoard` = **23919**(同 23808)/
  `MIMIC_APPROACH_RADIUS = 200` = **23915** / `FORT_FOLD_OFF` = 4160 / `TEMPLE_FOLD_OFF` = **4182** /
  `NODE_EXTRA_SPAWN_KINDS` = **4237** / `js/df-mapdef.js` の `LINT_PAINTING_ASPECTS` = 2154。
- ⭐ **依頼書 §2-6 の 3 本のアンカーは実在した**(#66 着地後の姿):
  `driver_graph_p6.js:366` `const FOLDED = {` / `driver_grid_s2.js:93` **`const UNTOUCHED = ['dragon-lair'];`**(1 件だけ)/
  `driver_spawn_not_on_gate.js:83` `const FOLD_ARM = {`。
  ⚠ **`NODES_EXPECTED` は本当に廃止済み**(`driver_spawn_not_on_gate.js` のコメント :57/:63/:81 にしか残っていない)。
  ⇒ **依頼書 §3 の変更範囲表にある「`NODES_EXPECTED` の竜を 2 へ」は古い**。足すのは `FOLD_ARM` の 1 行だけ。
- ⭐ **納品 PNG は 2 枚とも実在**(`codex1/assets/maps/dragon-vale-v1.png` 3.8MB /
  `dragon-nest-v1.png` 3.3MB)。`tools/make_grid_map.py` の `GRIDS`(:75)に竜のエントリは**まだ無い**。
  旧ノード絵 `assets/room_dragon-lair_n4.jpg` / `_n7.jpg` も実在(= `?dragonfold=0` の行き先)。

#### (j) ⭐ 項目2 の着手材料(⛔ 絵はまだ 1 枚も焼いていない)

依頼書 §5-2〜§5-4 は判断を実装窓へ委ねている。**いま手元にある材料から「何を確かめれば決まるか」**だけを残す。

1. **マスク案** — `n4big` は **20 行 x 31 列**(rect `[4, 9, 23, 39]`、絵ローカル + **(9, 4)**)、
   `n7big` は **19 行 x 30 列**(rect `[4, 10, 22, 39]`、絵ローカル + **(10, 4)**)。⚠ 足し算が 2 枚で違う。
   手順は沼 `n4big` / 森 `n7big` と同じ 5 規則で **2 枚を別々に**当て直す。
   **焼いた絵のどこを見れば決まるか** = ①道中は「西端→東端の横断路が 1 マスも切れていないこと」
   (切れていたら周期か位相が外れている)、②開けた床 4 箇所(北西/南西の坑道・中央の竜鱗・東の骨の谷)が
   マスクで開いていること、③`rect` と `tileBounds` が**完全一致**していること(`paintingAspectFits` の要求)。
   ⚠⚠⚠ **`js/df-mapdef.js:2154` の `LINT_PAINTING_ASPECTS` へ 2 行を足すのを忘れない**
   (31x20 = 1.5500 / 30x19 = 1.5789 はどの既存比とも一致しない)。⛔ 書くのは**焼き上がりの実測値**。
   ⚠ **`driver_mapeditor_painting (§1 1d2)` は既に「label 15 種 vs サイズ 14 種」で赤**で、衝突源は
   **`部屋n4big 30×20` と `部屋n7big 30×20`**。⇒ 竜を **30x20 で焼くと衝突が 1 つ増える**。
   31x20 / 30x19 のままなら増えない。**焼き寸法を決めた直後にここを確認すること。**
2. **左辺入口の可否** — 納品 `dragon-nest-v1.png` は**左辺中央が溶岩と岩で塞がって見える**。
   **何を見てどれを選ぶか** = 焼いたあと**絵ローカル (0,9)〜(3,9)** を実際に見る。
   ①入場 (12,13) = 絵ローカル (2,9) が開けた床に見えるなら**マスクを開けて終わり**。
   ②見えないが上下 1〜2 行に開けた床があるなら **`start` をその行へ寄せる**(ボスに出口の制約は無い)。
   ③どちらも無いなら**マスクで左辺中央の 1x3 を開ける**(最後の手段)。
   ⚠ **②を選んだら §8 (5b) の期待式も `start` から導き直すこと**(数字を焼かず rect からの独立式で組む)。
   ⭐ #58 の教訓 = 行数の偶奇で `Math.floor` の midR が 1 行ずれる。**n4 は 20 行(偶数)、n7 は 19 行(奇数)**
   なので **2 枚で挙動が違う**。
3. **財宝 4 マスの候補** — §5-4 の 5 制約を、焼いた `n7big` の上で次のように測る。
   ①**マスクで開いている** = 自前パースしたマスクで 4 マスとも開き。
   ②**相互 2 タイル以内** = 4 マスの相互最大距離(§8 (3c) がこれを機械で測る)。
   ③**入場から 4 タイル(384px)以上** = 根拠は `MIMIC_APPROACH_RADIUS = 200px`(`index.html:23915` で実測確認済 = 2.08 タイル)。
   ④**ボス `pharaxus` から 4 タイル以上**。
   ⑤**護衛 2 体の置き場(寝床の手前の開けた床 2 箇所)と重ねない**。
   ⭐ 置き場は**絵の東=竜の寝床の手前**。⛔ 座標は §8 に焼き込まない(性質だけ測る)。
   ⚠ 実装側は `p6Node` で **`opt.hoard` が渡されたときだけキーを生やす**こと
   (無条件に載せると `driver_grid_s2` §8 の golden が全シナリオ一斉に赤くなる = 変異 `hoardnull` が再現する罠)。

⭐ **項目2 の非退行で「増えても退行ではない」もの** = `driver_field_step6` の **`(C-dragon-lair)`**(5 本目)。
⛔ これを `?dragonfold=0` で緑にしないこと。

### 12-1. 項目2 — 竜 MAP 2 枚を格子へ焼く(`GRIDS` 2 エントリ + 生成物)

- **測定日**: 2026-09-12(実装窓・項目2)/ **着手直前の `HEAD`** = **`3d4bba4`**(項目1 の着地)・作業ツリー clean
- **触ったファイル** = `tools/make_grid_map.py`(`GRIDS` へ 2 エントリ)+ 生成物 2 枚
  (`assets/room_dragon-lair_n4_map.jpg` 528KB / `_n7_map.jpg` 442KB)+ 本節。
  ⛔ `index.html` / `js/df-mapdef.js` / `tavern.html` は **1 バイトも触っていない**(= changelog も書かない。
  フックのトリガー範囲 3 ファイルのどれにも触れていないので鳴らない)。
- **生ログ**: `…\scratchpad\item2\`(`bake_vale.log` / `bake_nest.log` / `bake_nest2.log` /
  `check_n4.log` / `check_n7.log` / `align.log` / `sweep_fixpoint.log` / `sweep_grid{1,2,3}.log` /
  `tilestats.log` / `maskdraft.log` / `pre_*.log` / `post_*.log` / 目視用 PNG 13 枚)

#### (a) 台帳へ入れた値

| キー | phase (x,y) | period (x,y) | cells (col,row) | tile | out | 焼き上がり |
|---|---|---|---|---|---|---|
| `dragon-vale` | (33.00, 23.15) | (47.660, 48.025) | **31 x 20** | **48** | `room_dragon-lair_n4_map` | 1488x960 / 0.52 MB |
| `dragon-nest` | **(36.90, 49.35)** | **(48.800, 51.075)** | **30 x 19** | **48** | `room_dragon-lair_n7_map` | 1440x912 / 0.43 MB |

⭐ **太字は依頼書 §2-3 の一次解から動かした値**(下記 (c))。マス数 31x20 / 30x19 は §2-3 のまま。

#### (b) 焼き tile を 2 枚それぞれどう決めたか(⛔ 48 の決め打ちではない)

規則は台帳の「素材の情報量より大きくしない」。素材の焼き込み周期に対する倍率で判断した。

| 素材 | 素材の周期 (縦/横) | tile 48 なら | tile 64 なら | 採用 |
|---|---|---|---|---|
| `dragon-vale` | 47.660 / 48.025 | x1.007 / x0.999 = **ほぼ等倍** | x1.343 / x1.333 = 水増し | **48** |
| `dragon-nest` | 48.800 / 51.075 | x0.984 / x0.940 = ほぼ等倍〜微縮小 | x1.311 / x1.253 = 水増し | **48** |

- ⭐ **#66 の祭壇が 64 だったのは素材の格子が 73px あったから**で、48〜51px の素材へ写経してはいけない。
  逆に竜を 64 で焼くと 2 枚とも 1.25〜1.34 倍の水増しになり、ファイルだけ膨らむ。
- ⭐ 結果として 2 枚とも 48 になったが、**同じ値になったことと写経は別物**。#66 は 48 / 64 に割れ、#67 は割れなかった。
- ⚠ `--check` に渡した `--tile` は**実際に焼いた 48**(2 枚とも)。依頼書 §5-1 のコマンド例は竜では正しかった
  (神殿で誤っていた「n7 も 48」の罠は今回は踏んでいない)。

#### (c) 格子を当てた軌跡

**① 一次解(`--fit --fit-around 48`)は §2-3 の 6 数値をそのまま再現した。**

    dragon-vale 縦 47.660 / 位相 33.00 / 31 マス / score 5.261   横 48.025 / 23.15 / 20 マス / 5.317
    dragon-nest 縦 48.425 / 位相 38.15 / 30 マス / score 3.685   横 51.075 / 49.35 / 19 マス / 5.478

**② ⭐ 探索窓の中心が正しいことを、`--fit` とは独立な方法で確かめた。**
#66 神殿は本物が 53px / 73px で **±8% の窓(44.16〜51.84)に一度も入っていなかった**。
同じ穴を踏んでいないことを、`line_response` の**自己相関**(周期の探索窓を持たない別法)で見た:

| 素材 | 縦線の山(強い順) | 横線の山(強い順) | 読み |
|---|---|---|---|
| `dragon-vale` | lag=**48**(r .606)/ 96(.425)/ 94(.334) | lag=**48**(.756)/ 96(.596)/ 52(.379) | 基本波 48・96 は 2 倍音 |
| `dragon-nest` | lag=**48**(.557)/ 98(.410)/ 96(.380) | lag=**102**(.630)/ **51**(.420)/ 48(.301) | 縦 48 / 横 51(102 は 2 倍音) |

⇒ 2 枚とも本物は窓の内側。⭐ **ボスの横 51.075 が窓の縁(51.84)から 0.77px** なのは #58 祭壇の
「窓の縁の偽の極大」と同じ形に見えるが、中心を 50 / 51.5 へ動かしても **51.075 で不動**、
かつ自己相関が独立に 51 / 102 を指すので**偽解ではない**と判定した。

**③ 焼いて検算 — 道中は一次解で通り、ボスは落ちた。**

    dragon-vale @48  OK 縦 drift 0.00 / 位相 1.00 / score比 100.0%   OK 横 drift 1.88 / 1.00 / 98.9%
    dragon-nest @48  NG 縦 drift **25.92** / 位相 1.00 / score比 77.7%   OK 横 drift 1.60 / 1.00 / 99.9%

⚠⚠ **依頼書 §2-3 の警告「ボスの縦線 score 3.685 は弱い。⛔ この 1 本に賭けない」が的中した。**

**④ (位相 x 周期) の 2 次元スイープ**(⛔ 周期だけの 1 次元はやっていない)。判定は
`make_grid_map.verify()` そのものをメモリ上の焼き上がりへ当てた(別の測定器を作らない)。

- **不動点反復**(位相を 38.15 に据え置き、周期だけを `T×実測周期/48` で寄せる)= **1 次元の限界の実演**:

| 反復 | ph | T | 縦 drift | 縦 位相ズレ | 判定 |
|---|---|---|---|---|---|
| 0 | 38.15 | 48.425 | 25.92 | 1.00 | NG |
| 1 | 38.15 | 48.861 | **3.18** | **5.00** | NG(drift は入ったが位相が出た)|
| 2 | 38.15 | 48.807 | 3.18 | **11.00** | NG |
| 3 | 38.15 | 48.753 | 3.72 | **3.00** | NG |
| 4 | 38.15 | 48.816 | 3.78 | **11.00** | NG |

  ⭐⭐⭐ **周期だけ直すと drift は許容に入るのに位相ズレが 3〜11 world-px(許容 2.0)へ飛ぶ。**
  #63 練兵場 / #66 広間と同じ「斜めの稜線」。⛔ 1 次元走査ではここから先へ行けない。

- **2 次元(粗)** T 48.70〜48.95 x ph 33〜45 = 42 点 → OK は **4 点だけ**
  (ph33/T48.700・ph33/T48.800・**ph37/T48.800**・ph33/T48.850)。⭐ OK が「点在」する = 稜線を横切っている証拠。
- **2 次元(細)** T 48.76〜48.86 x ph 35.0〜38.5 → OK 8 点。稜線は ph が T とともに下がる向き
  (T48.76→ph36〜37 / T48.84→ph35.5〜36.5 / T48.86→ph35.5〜36.5)。
- **2 次元(最細)** T 48.79〜48.81 x ph 36.6〜37.4 → **basin の中心が出た**(数値は drift / score比):

| ph \ T | 48.790 | 48.800 | 48.810 |
|---|---|---|---|
| 36.70 | OK 3.78 / 96.5% | OK 1.32 / 99.8% | OK 2.22 / 99.8% |
| 36.80 | OK 2.82 / 99.3% | OK 1.32 / 99.8% | OK 1.68 / 98.8% |
| **36.90** | OK 2.82 / 99.7% | **OK 0.00 / 100.0%** | OK 1.68 / 96.4% |
| 37.00 | NG 4.02 | OK 1.68 / 98.3% | NG 3.18 |

  ⇒ **採用 = ph 36.90 / T 48.800**(drift **0.00** / 位相ズレ 1.00 / score比 **100.0%**)。
  ⭐ 上下左右の隣が全部 OK = **稜線の縁ではなく basin の中心**を採った(#63 の「drift 最小より余裕」の作法)。
  ⛔ 素材のスコア最大(縦 score 3.685 の 48.425)は**正解ではなかった** —— #63 玉座と同じ型。

#### (d) `--check` の出力(⭐ 焼いた tile で検算した)

    $ py tools/make_grid_map.py --check assets/room_dragon-lair_n4_map.jpg --tile 48
        OK 縦線: 周期 48.000px → 端の累積ドリフト 0.00world-px (許容 4.0) / 位相ズレ 1.00world-px (許容 2.0) / score比 100.0%
        OK 横線: 周期 48.047px → 端の累積ドリフト 1.88world-px (許容 4.0) / 位相ズレ 1.00world-px (許容 2.0) / score比 99.0%
    $ py tools/make_grid_map.py --check assets/room_dragon-lair_n7_map.jpg --tile 48
        OK 縦線: 周期 48.000px → 端の累積ドリフト 0.00world-px / 位相ズレ 1.00world-px / score比 100.0%
        OK 横線: 周期 48.000px → 端の累積ドリフト 0.00world-px / 位相ズレ 1.00world-px / score比 100.0%

⭐ **第 2 の意見**として `tools/check_grid_alignment.py`(「タイル境界が描かれた線の**上**にあるか」を測る別指標)も通した。
**負のコントロール(1/4 タイルずらし)込み**:

| 画像 | 素(縦 / 横) | `--shift 12`(縦 / 横) |
|---|---|---|
| `room_dragon-lair_n4_map.jpg` | **OK 89.5% / 94.4%** | NG 7.2% / 4.2% |
| `room_dragon-lair_n7_map.jpg` | **OK 79.1% / 78.5%** | NG 12.7% / 6.8% |

⚠ `check_grid_alignment.py` は**判定を出した直後に `UnicodeEncodeError` で落ちる**(cp932 コンソールで
`⭐` / `⚠` を print する行。`make_grid_map.py` と違い `reconfigure(encoding="utf-8")` を持たない)。
⇒ **exit code は当てにならない**(OK でも 1)。判定行そのものを読むこと。⛔ #67 の範囲外なので直していない。

#### (e) 既存 golden の非退行(⭐ 着手前の色を先に取ってある)

| ドライバ | 着手前(`3d4bba4`) | 項目2 の後 | 差 |
|---|---|---|---|
| `verify_codex_map_skill` | `16/17 PASSED FAILED 1` / (3a) **13 件** SHA 全件一致 / 検算 NG: `stag-tavern` | `16/17 PASSED FAILED 1` / (3a) **15 件** SHA 全件一致 / 検算 NG: `stag-tavern` | **母集団 +2**・色は不変 |
| `driver_mapeditor_painting` | `PASS 105 / FAIL 1 (合計 106)` | `PASS 105 / FAIL 1 (合計 106)` | **1 ビットも動かず** |

- ⭐ **`(3a)` は焼き直した 15 件と `assets/` の現物を SHA-256 で突き合わせる。竜 2 枚は一致した**
  (`dragon-vale=3a131f5b` / `dragon-nest=cf596fbc`)。⇒ コミットした jpg は「今の台帳で焼き直すと同じ」もの。
- ⚠⚠ **項目1 の記録 (c-2) の言い直し**: `(3a)` が落ちている理由は「`stag-tavern` の **SHA 不一致**」ではなく
  「**SHA は全件一致**していて `stag-tavern` だけ **bake 末尾の検算が NG**」。
  これは台帳 `stag-tavern` のコメントが「この素材では位相ズレが**構造的に誤報する**」と明記している既知の症状で、
  #67 とは無関係(着手前から同じ)。
- ⭐ `driver_mapeditor_painting` は `index.html` を読むドライバなので、**項目2 では原理的に動かない**
  (この項目は `index.html` を触っていない)。動かなかったことを実測で確かめた、が正しい読み。

#### (f) ⭐ 焼き寸法と `driver_mapeditor_painting (§1 1d2)` の衝突の**先読み検算**

着手前の `(1d2)` の実測値(ログ原文)= `labels=[... 15 種 ...] サイズ種類数=14`。
15 の label に対しサイズが 14 種なのは **`部屋n4big 30×20`(砦 n4)と `部屋n7big 30×20`(砦 n7)が同寸**だから。

竜を足したとき何が起きるかを、そのログの label 集合へ実際に足して数えた:

| 焼き寸法 | label 数 | サイズ種類数 | 衝突 | 判定 |
|---|---|---|---|---|
| **31x20 / 30x19(採用)** | 15 → **17** | 14 → **16** | **1 組のまま**(砦) | ⭐ 増えない |
| 30x20 / 30x19 | 17 | 15 | **2 組**(砦 + 竜 n4big) | ⛔ 増える |
| 30x20 / 30x20 | 17 | 14 | **3 組** | ⛔ 増える |

⇒ **31x20 と 30x19 はどちらも既存 14 種のどれとも一致しない**(30x19 は既存 `29x19` / `30x20` / `30x21` と別物、
31x20 は `30x20` / `30x21` と別物)。⭐ 項目3 で label が増えたあと、この表のとおりかを `(1d2)` の行で確かめること。

#### (g) ⚠⚠⚠ 崩れた依頼書の主張 — **5 件**(⛔ 予測のほうを訂正した)

| 依頼書の主張 | 実測 | 判定 |
|---|---|---|
| §2-3 ボスの 6 数値 = ph(38.15, 49.35) / T(48.425, 51.075) | **縦は外れ**(焼くと drift 25.92)。採用は ph 36.90 / T 48.800 | 訂正 |
| §2-3 ボスの異方性 **5.33%**(台帳で 2 番目に悪い) | 採用値では **4.56%**((51.075-48.800)/49.938)= 台帳で **3 番目**(廃坑 7.75% / 広間 4.83% の次) | 訂正 |
| §2-3 目視「寝床の手前に開けた床が 2 箇所ある(**護衛 2 体の置き場**)」 | 2 箇所は実在するが**溶岩に囲まれた孤島**。敵を置くと到達不能 | 訂正((h-1)) |
| §5-4「竜の寝床(絵の東の骨の窪み)の**手前**に置く」 | 寝床そのものが**溶岩の堀で隔てられた島**。"手前" は堀の**西岸**になる | 訂正((h-3)) |
| §12-0 (c-2)「(3a) は `stag-tavern` だけ **SHA 不一致**」 | **SHA は全件一致**。落ちているのは `stag-tavern` の**検算 NG** | 訂正((e)) |
| (参考) §2-3「ボスの縦 score 3.685 は弱い。⛔ この 1 本に賭けない」 | **的中**(実際に外れた) | 成立 |

⭐ 依頼書 §2-3 の「31x20 / 30x19」「道中の異方性 0.76%」「道中は 48 の窓が明確な勝者」は**そのまま成立**。
⭐ また **`--fit` は中心を 46 / 48 / 50 / 51.5 と振っても同じ答えを返した**が、ボスの縦はそれでも間違いだった。
⇒ #58 の「**再現性は正しさの裏付けにならない**」が 2 例目として再現。

#### (h) 項目3 のための判断材料(⛔ 実装はしていない。`index.html` は 1 バイトも触っていない)

⭐ 材料は「焼いた絵を見る」だけでなく、**1 マスずつ測って 4 近傍の連結を出す**ところまでやった
(`item2\tilestats.log` / `maskdraft.log`、重ね画像 `mask_n4_draft.png` / `mask_n7_draft.png`)。
⛔ これは**受入 assert に焼くためではない**(依頼書 §8「測らないこと = マスクの 1 マス単位の中身」は守る)。

##### (h-1) マスク案

**共通** — 作法は神殿 `n4big`(`index.html:5996`)の 5 規則をそのまま使う。特に
**① 外周には `'#'` を書かない**(`sealRing` の仕事)、**④ ゲートへのレーンを明示的に空ける**。

**`n4big` 骨の谷(20 行 x 31 列 / 絵ローカル + (9,4) = global)**

- ⭐ **規則④ の横断路は絵にそのまま描かれている**: **絵ローカル row 9 と row 10 の 2 行**が、
  col 0(西の坑道口の外光)から col 30(東)まで **1 マスも切れずに明るい床で通っている**(目視 + 測定の両方で確認)。
  ⇒ 入場 (2,9) も出口 (30,9) = `P6_RIGHT [39,13]` もこのレーンの上。**ゲートの上書きは要らない**。
  ⚠ 絵の**最東列 (col 30) の row 8〜11 には溶岩が描かれている**が、そこは外周 = `sealRing` とゲートの領分。
  規則④ に従い row 9 は col 0 → col 30 まで `'.'` にする。
- **塞ぐもの**: ① 西の坑道の**崩れた坑木と鉱車**(col 0-2 の rows 1-8 / rows 12-18)、
  ② 中央を南北に走る**溶岩の筋**(おおむね col 9-12。⚠ ただし row 9-10 では切らさない)、
  ③ **黒曜石の塊と溶岩溜まり**(col 13-18 の rows 0-8 / rows 12-19 にある明るい溶岩)、
  ④ 東の**大きな肋骨アーチと頭蓋**(col 19-29 の rows 0-4 / rows 16-19、および col 27-29 の rows 1-3)。
- **塞がないもの**(規則②「平置きの物は跨げる」): 床に散った**竜鱗の板**(col 12-18 の rows 2-8 / 12-18)と
  **転がった細い骨**。⇒ 中央〜東は「鱗と骨を跨いで歩ける広間」になる。
- ⭐ しきい値の下書き(`mask_n4_draft.png`)では**床 455 / 到達 449 / 島 6**。島 6 は北東隅 (col 27-29, row 1-3) の
  骨山の裏だけで、**横断路は下書きの段階で既に切れていない**。⇒ n4 のマスクは素直に描ける。

**`n7big` ファラクサスの巣(19 行 x 30 列 / 絵ローカル + (10,4) = global)**

- ⭐⭐⭐ **最大の発見 = 竜の寝床は「溶岩の堀に囲まれた島」として描かれている。**
  しきい値の下書き(明溶岩 12% 以上 / 赤熱 45% 以上を壁)で測ると、
  **床 388 マスのうち 69 マスが入場 (2,9) から 4 近傍で到達できない**(= 寝床 + 手前の冷えた島 2 つが丸ごと孤立)。
  堀は **rows 3〜14 のどの行にも壁の列がある**(主に col 18-22、南では col 21-25)。寝床の**北の縁 (row 3 の col 22-29) も溶岩の帯**で、
  北の岩棚(rows 1-2 は col 1〜28 まで開いている)から降りる口が無い。南(rows 14-18)は玄武岩の柱と溶岩で全面不可。
  ⇒ **「寝床に `pharaxus` を置く」と、パーティが到達できずクリア不能になる。**
- したがって項目3 は次のどちらかを選ぶ(⭐ 推奨は **案α**):
  - **案α(推奨)**: **ボスを堀の西岸(= 西 2/3 の広い床)へ置く。** 寝床・冷えた島 2 つ・溶岩原は**全部 `'#'`**
    にして背景として残す。絵の意味は「竜が寝床から降りて迎え撃つ」で、**マスクは絵に一度も嘘をつかない**。
    ⭐ 入場から歩ける床は下書きの実測で **319 マス**(col 1-17 x row 1-14 の広間 + 北の岩棚 rows 1-2)。
    10 体でも 2 群でも十分入る。
  - **案β**: マスクで堀に**橋を 1 本開ける**(例 row 8-9 の col 18-21)。ボスを寝床に置ける代わりに、
    **4 マス分の「明らかな溶岩」を歩けることにする**嘘が要る(§5-3 ③「最後の手段」より重い嘘。堀の幅が 1 マスではない)。
  - ⛔ **案γ(絵の描き足し・発注し直し)は #67 の範囲外**(依頼書 §11)。
- ⚠ どちらを採っても **入場 (2,9) の可否は別問題で、そちらは無条件に OK**((h-2))。
- ⚠⚠ **下書きの `mask_n7_draft.png` をそのまま貼らないこと。** しきい値は「明るい溶岩」しか見ておらず、
  `n4big` 側では**竜鱗の板と溶岩を取り違える**。#66 が燭台・吊り香炉・倒れた列柱で **3 箇所**直したのと同じ工程
  (本番の背景の上にマスクを重ねて目で確かめる)を項目3 で必ず通すこと。

##### (h-2) ボスの左辺の入口 → **§5-3 の ①「マスクを開けて終わり」**

- 入場 global (12,13) = **絵ローカル (2,9)**。実際に見た(`annot_n7_west.png` = 絵ローカル col 0-11 / row 4-15 を 1.25 倍):
  **col 2 以東 row 4-13 は素の暗い岩床で、(2,9) は完全に開けている。**
  測定でも (2,9) の明溶岩率 0.00 / 赤熱率 0.00。
- 塞がって見えるのは **col 0 と col 1 だけ**(row 8 に溶岩、rows 4-7 / 9-15 に黒い岩)。
  ⇒ そこは `sealRing` が塞ぐ外周 1 タイルと一致するので**実害が無い**(神殿 `temple-altar` の「絵ローカル列 0 は
  外周になる」と同じ形)。
- ⇒ **`start` は動かさない。`rect [4,10,22,39]` / `start { tx: 12, ty: 13 }` のまま。**
  ⭐ したがって **§8 (5b) の期待式を導き直す必要は無い**(依頼書 §5-3 ② の分岐に入らない)。
  ⚠ 19 行 = 奇数なので `midR = floor((4+22)/2) = 13` は部屋の**ちょうど中心行**(絵ローカル row 9)。
  n4 は 20 行 = 偶数で `midR = floor((4+23)/2) = 13` が**中心より半行上**。**2 枚で挙動が違う**ことは変わらない。

##### (h-3) 財宝の置き場 4 マス

⚠ §5-4 の「竜の寝床の**手前**」は、(h-1) の発見により **堀の西岸**の意味になる(寝床の中は到達不能)。
**案α を採った場合**の候補(⭐ 5 制約を全部満たすことを数で確かめた):

| | 候補 | 根拠 |
|---|---|---|
| 置き場 4 マス | 絵ローカル **(15,6) (16,6) (15,7) (16,7)** = global **(25,10) (26,10) (25,11) (26,11)** | 2x2 の塊 |
| ① マスクで開いている | 下書きでも 4 マスとも `'.'`(明溶岩率 0.00 / 赤熱率 0.00) | `tilestats.log` |
| ② 相互 2 タイル以内 | 相互最大 **1.41 タイル**(対角) | §8 (3c) を余裕で通る |
| ③ 入場から 4 タイル以上 | (2,9) → 最も近い (15,7) で **13.2 タイル**(1267px) | `MIMIC_APPROACH_RADIUS` 200px の **6.3 倍** |
| ④ ボスから 4 タイル以上 | ボスを (15,12) = global (25,16) に置くなら最短 **5.0 タイル**(480px > 384px) | ⚠ ボス座標は項目3 の決定。動かすならここも測り直す |
| ⑤ 護衛 2 体と重ねない | 護衛は堀の西岸へ(例 (13,6) / (13,12) = どちらも下書きで `'.'`)。⛔ 冷えた島 (19,5-6) / (19,10-11) は**到達不能なので使わない** | (h-1) |

⭐ 絵の上での意味 = **溶岩の堀のすぐ手前(北寄り)に宝箱が 4 つ固まって並ぶ**。
パーティは西から row 9 の床を東へ進み、堀の手前で財宝に行き当たる ⇒ `final-mimic.md` の「整然と並んだ古びた宝箱」が成立する。
⛔ **座標は §8 に焼き込まないこと**(依頼書「測らないこと」)。測るのは (3a)〜(3e) の**性質**だけ。

##### (h-4) ⭐ 骨の谷の 10 体を 2 群に割れるか(31 列で可能か)= **可能**

- 制約は 2 つ: **(2d)** 入場 (2,9) から最も近い敵まで **4.17 タイル(400px)より遠い**、
  **§9-2** 群の最短距離が `DETECTION_RANGE` **12.5 タイル**超。
- 31 列での解の一例: **西群 = 絵ローカル col 7-9**(入場から 5.0〜7.1 タイル)/
  **東群 = col 22-28**(西群との最短 **13 タイル** > 12.5)。
  どちらの帯も上下(rows 4-8 / rows 11-16)に開けた床があり、**10 体を 3+7 でも 5+5 でも置ける**。
- ⭐ 神殿は 28 列で「西 5 + 東 6 / 最短 13.00 タイル」だった。**竜は 31 列あるので条件はむしろ緩い。**
- ⚠ ただし**横断路 (row 9-10) の上に敵を置くと 1 群にまとまりやすい**(視線が通る)。
  神殿と同じく**南北の区画へ振り分ける**こと。

### 12-2. 項目3 — 竜を 2 ノードへ畳む

- **測定日**: 2026-09-16(実装窓・項目3)/ **着手直前の `HEAD`** = **`5cd8f6f`**(項目2 の着地)・作業ツリー clean
- **触ったファイル** = `index.html`(撤退スイッチ / 兼務の台帳 / `ROOM_PAINTINGS_DEF` の `n4big` `n7big` +
  マスク 2 枚 / `buildDragonLairRun` の畳み / `p6Node` の `hoard` / `spawnDragonHoard` の宣言優先)+
  `js/df-mapdef.js`(`LINT_PAINTING_ASPECTS` へ 2 行)+ `tavern.html`(changelog 1 行)+ 本節。
  ⛔ `tools/verify_dragon_fold.js` は作っていない(項目5)。既存ドライバの言い直しもしていない(項目4)。
- **生ログ / 目視用 PNG**:
  `…\scratchpad\item3\`(`mask3.py` / `probe_dragon3.js` / `diag_n7.js` / `logs\<name>.log` /
  重ね画像 `i3_mask_n4.png` `i3_mask_n7.png` と拡大 `i3_mask_n4_{0,1}.png` `i3_mask_n7_{0,1}.png` /
  素材の拡大 `i3_n4_w.png` `i3_n4_e.png` `i3_n4_band_{w,e}.png` `i3_n7_{west,east}.png`)

#### (a) ⭐⭐⭐ 案α を採った根拠(⛔ 項目2 の推奨を鵜呑みにせず自分で測り直した)

項目2 §12-1 (h-1) の「竜の寝床は溶岩の堀に囲まれた島」は**そのまま成立した**。自分で組んだマスクに対し
**本番の `aStar`(4 近傍)**と同等の BFS の両方で測り直した結果:

| 測ったもの | 値 |
|---|---|
| 項目2 のしきい値下書き(参考) | n7 床 388 / 到達 **319** / **島 69**(寝床 + 冷えた島 2 つが丸ごと孤立) |
| **採用した n7big マスク(案α)** | 床 **234** / 全 570、到達 **232**、島 **2** |
| **採用した n4big マスク** | 床 **203** / 全 620、到達 **201**、島 **2** |
| 島 2 の正体 | どちらも**外周に残るゲート中点**(n4 = 絵ローカル (15,0)(15,19) / n7 = (14,18)(29,9))。`applyPaintingBlocking` の `gateKeys` が `sealRing` から守るので床のまま残るが、出口を持たない向きなので実害なし。⭐ **神殿 `n4big` と同型**(#66 も同じ 2 マスを持っている) |

⭐ 案α = **ボスを堀の西岸(絵ローカル (15,12) = global (25,16))へ置き、寝床・冷えた島 2 つ・溶岩原は
全部 `'#'` にして背景として残す**。案β(堀に橋を開ける)は採らなかった —— 絵に描かれた溶岩を 4 マス
歩けることにする嘘が重く、案α なら**マスクが絵に一度も嘘をつかない**。

**本番の `aStar` で測った到達性**(n7・入場 global (12,13)):

    護衛 ミノタウロス(23,15) 経路長 13 / ミノタウロス(23,17) 15
    ボス レッドドラゴン「ファラクサス」(25,16) 経路長 16
    財宝 (26,10) 17 / (27,10) 18 / (26,11) 16 / (27,11) 17      ⇒ 到達不能 0 件

n4 も同じく**本番 `aStar` で 10 体すべて到達可能**、出口ゲート `P6_RIGHT [39,13]` も到達可能
(`gateOK=true`)。⇒ **案α で正しい**と確認して進めた。

#### (b) マスクをどう組んだか + 本番背景の上での目視所見

- 下書きは項目2 の `maskdraft.py` と同じしきい値で起こしたが、**そのまま貼っていない**。
  ⚠⚠ しきい値は「明るい溶岩」しか見ないので、**黒曜石の池・黒岩の塊・崩れた坑木**を取り逃がす
  (項目2 の警告「竜鱗と溶岩を取り違える」と同じ穴の別の顔)。
- ⭐ **本番背景の上にマスクを重ねた PNG を実際に目で見て 6 マスを直した**
  (`i3_mask_n4.png` / `i3_mask_n7.png` と 1.7 倍の拡大 4 枚):
  n4 = (2,2) 瓦礫 / (3,12)(3,13) 崩れた坑木の山 / (4,16) 黒岩の塊、
  n7 = (9,2)(10,2)(11,2) 黒曜石の池の南縁 / (1,5)(1,6)(1,7) 西壁ぎわの巨岩。
- **`n4big`(20 行 x 31 列 / 絵ローカル + (9,4))**
  - ⭐ 規則④ の横断路は**絵にそのまま描かれている**。**row 9 と row 10 の 2 行**が col 0 → col 30 まで
    1 マスも切れずに平らな谷底で通っている(実測でも赤熱率が col 2-29 で 0〜8%)。
    入場 (2,9) も出口 (30,9) = `P6_RIGHT` もこのレーンの上 ⇒ **ゲートの上書きは不要**。
  - ⚠⚠⚠ **項目2 §12-1 (h-1) の区画の読みは焼いて測ると変わった。** 「開けた床 4 箇所 = 北西の坑道 /
    南西の坑道 / **中央の竜鱗** / 東の骨の谷」のうち、**中央の竜鱗帯は溶岩の筋に囲まれて歩けない**。
    実際の 4 区画は **北西 (col 2-8 / row 2-8)** / **南西 (col 2-8 / row 11-16)** /
    **北東の骨の谷 (col 20-27 / row 5-8)** / **南東の骨の谷 (col 21-27 / row 11-16)**。
    中央 col 8-20 は溶岩原としてまるごと塞いだ。
  - ⚠⚠ **row 8 と row 11 の瓦礫堤は「口だけ」空ける。** 絵はこの 2 行に瓦礫と溶岩の筋を描いて
    横断路を額縁のように縁取っているが、**全部塞ぐと 4 区画が横断路から切り離されて全部島になる**
    (4 近傍 BFS で実測)。⇒ 西は col 3-7 / 東は col 20-27 を開けた。
- **`n7big`(19 行 x 30 列 / 絵ローカル + (10,4))**
  - 西 2/3 の暗い岩床(col 1-18)が歩ける平原。東の境界は**行ごとに凸凹**させて溶岩の堀の縁を
    なぞった(col 16/17/18/19 が行によって変わる)。⛔ 直線で切ると平らな岩床の上に見えない壁が立つ。
  - **入場は §5-3 の ①「マスクを開けて終わり」で確定。** 絵ローカル (2,9) は素の暗い岩床
    (明溶岩率 0.00 / 赤熱率 0.00)。⇒ **`start { tx: 12, ty: 13 }` は動かさず、§8 (5b) の期待式を
    導き直す必要も無い**(項目2 (h-2) の結論がそのまま成立)。
  - ⚠ 19 行 = 奇数なので `midR = floor((4+22)/2) = 13` は部屋のちょうど中心行(絵ローカル row 9)。
    n4 は 20 行 = 偶数で中心より半行上。**2 枚で挙動が違う**ことは実装のコメントにも残した。

#### (c) 敵・財宝・ボスの最終座標とその根拠

| | global 座標 | 根拠(実測) |
|---|---|---|
| n4 入場 | (11,13) | 左辺中点 (9,13) + `NODE_ENTRY_INSET` 2 |
| n4 敵 **西群 5 体** | (14,7) orc / (16,8) minotaur / (14,9) orc / (14,17) orc / (16,18) skeleton | 北西・南西の坑道。入場から**最近でも 5.00 タイル (480px)** > `engagePx` 400px |
| n4 敵 **東群 5 体** | (31,10) minotaur / (34,11) orc / (32,12) orc / (32,17) minotaur / (34,18) skeleton | 北東・南東の骨の谷 |
| n7 入場 | (12,13) | 左辺中点 (10,13) + 2 |
| n7 護衛 | (23,15) minotaur / (23,17) minotaur | ボスの左右 2.24 タイル = 同じ戦闘。入場から 11.18 タイル (1073px) |
| n7 ボス | **(25,16) pharaxus** | 堀の**西岸**。⛔ 寝床 (絵の東) は到達不能 |
| n7 財宝 4 マス | **(26,10) (27,10) (26,11) (27,11)** | 相互最大 **1.41 タイル** / 入場から **14.14 タイル (1358px = `MIMIC_APPROACH_RADIUS` 200px の 6.8 倍)** / ボスから **5.10 タイル (490px > 384px)** |

⭐ **2 群の最短距離 = 15.13 タイル** > `DETECTION_RANGE` 12.5 タイル ⇒ 別々の戦闘になる。
さらに両群の間には溶岩原 (global col 17-29) が立ち、横断路 (global row 13-14) 以外は視線も通らない。
⚠ 項目2 (h-4) の案「西群 絵ローカル col 7-9 / 東群 col 22-28 で最短 13 タイル」は、
**col 7-9 が実際のマスクでは溶岩原**なので使えなかった。⇒ 西群を col 5-7 へ寄せた結果、
最短はむしろ **13 → 15.13 タイル**へ広がった。

**実走(autoplay)で確かめたこと**: 畳んだ n4 で **罠 6 個 / 玄室宝箱 5 個**が湧いた
(= `NODE_EXTRA_SPAWN_KINDS` の兼務が効いている)。`?dragonfold=0` の n4 は **罠 0 / 宝箱 0**
(旧構成では n2 / n3 が持つ)。n7 では宝箱 4 個が**宣言タイルと完全一致**し、ミミックは (27,11)
= 入場から 15.13 タイル (1452px)。`?dragonfold=0` では (32,12)(32,11)(33,12)(33,13) =
**西 45%(westLimit = 35)の内側** ⇒ フォールバックが生きている。

#### (d) ⚠⚠⚠ 崩れた依頼書 / 項目2 の主張 — **5 件**(⛔ 予測のほうを訂正した)

| 主張 | 実測 | 判定 |
|---|---|---|
| §6-5「`MAPDEF` は `let`。`spawnDragonHoard` から**参照できる**」 | 参照はできるが **`MAPDEF.hoard` が存在しない**。`enterNode → resolveNodeMapDef → DFMapDef.resolve → sanitize` が **固定のキー一覧から `out` を組み直す**(`js/df-mapdef.js:1334`)ので、宣言した `hoard` は MAPDEF へ着く前に消える。実測で **4 マスとも西 45% へ落ちた**((26,10) を期待したのに (20,15)(18,16)(16,16)(11,8) が出た) | **訂正** |
| 項目2 (h-3) の財宝候補 (25,10)(26,10)(25,11)(26,11) | **(25,11) は `buildMap` の瓦礫床 (`mapData === 1`)**。`spawnDragonHoard` の門番 `mapData[r][c] !== 0` がそれを弾くので**宝箱が黙って 3 個になる**。部屋の中は `((r*7 + c*13) ^ (r*3 - c)) % 5 === 0` のマスが値 1 | **訂正** |
| §6-4「`p6Node` へ `hoard` を足す」を `nd()` の同じ行へ書く | `verify_temple_fold` の変異 `densityone` が `density: d.density, start: d.start }),` を**逐語で**握っており、同じ行へ足すと**アンカー 0 箇所 = exit 3**。⛔ 依頼書 §8 の「アンカーに使わない行」一覧に**この行は載っていなかった** | **訂正** |
| 項目2 (h-4)「西群 絵ローカル col 7-9 / 最短 13 タイル」 | col 7-9 は実マスクでは溶岩原。西群を col 5-7 へ寄せて**最短 15.13 タイル** | 訂正(良い方向) |
| §2-3 目視「開けた床は 4 箇所(…**中央の竜鱗**…)」 | 中央の竜鱗帯は溶岩の筋に囲まれて歩けない。実際は **北西 / 南西 / 北東 / 南東**の 4 区画 | 訂正 |

**訂正の中身(実装)**:

- `spawnDragonHoard` は宣言を **`RUN.byId[currentNodeId].mapDef.hoard`**(= 宣言の出所そのもの)から引く。
  `MAPDEF.hoard` も先に見るので、将来 `sanitize` が通すようになっても壊れない。
  ⛔ `sanitize` へ `hoard` を足して直していない —— そうすると 6 シナリオ全部の mapDef に `hoard:null` が生え、
  `driver_grid_s2` §8 の golden が一斉に赤くなる(§2-2 の罠と同型)。
- 財宝 4 マスを **1 列東へ**動かし、4 マスとも `mapData === 0` になる (26,10)(27,10)(26,11)(27,11) にした
  (入場から 13.15 → **14.14** タイル / ボスから 5.00 → **5.10** タイルと数値も良くなった)。
- `nd()` には **独立した行 `hoard: d.hoard,`** を `density/start` の行の**前**に置いた。

#### (e) この項目で赤くなった既存ドライバ(⭐ 項目4 の宿題)

| ドライバ | exit | 落ちた assert | 直し方 |
|---|---|---|---|
| `driver_graph_p6` | **9** | `(1c-dragon-lair)(1d-)(1f-)(1g-)(1h-)` + **`:498` で `byId.n0.slots` の FATAL** | `FOLDED` へ 1 行 `'dragon-lair': { arm: '&dragonfold=0', sw: '?dragonfold', nodes: 2, entry: 'n4' }`。⭐ これを足すと `P6_ARM('dragon-lair')` が撤退の腕を当てるので FATAL ごと消える |
| `driver_spawn_not_on_gate` | 1 | `(1a-dragon-lair)`(66/67) | `FOLD_ARM` へ 1 行。⭐ `(1e)` は**素で PASS**(`dragon-lair:2n13e` と数えている) |
| `driver_grid_s2` | 1 | `(8-dragon-lair/n4)` `(8-dragon-lair/n7)` `(G0)`(今回 33 件 / golden 39 件) | `UNTOUCHED` から竜を抜く + `?dragonfold=0` の腕 + §6-6 の**空母集団の受け皿**。⛔ `--update-golden` は使っていない |
| `verify_swamp_novice` | 1 | `(4b)` 「他テーマの `ROOM_PAINTINGS_DEF` が着手前 (`cdaaf91`) と完全一致」— **差分 = dragon-lair** | ⭐⭐⭐ **依頼書 §2-6 が予見していなかった 4 本目。** #66 の「畳みで腐る golden は撤退スイッチの語では引けない」がまた当たった |

⭐ **`verify_temple_fold` は一度 exit 3 にしてから直した。** 変異 `densityone` のアンカーを
`p6Node` の呼び口で潰していたのが原因で、(d) のとおり独立行へ移して **24/24 PASS** に戻した。
⇒ **項目4 へ残していない**(自分で作った赤は自分で消した)。

#### (f) 着手前から赤く、この項目で**悪化していない**もの

| ドライバ | 着手前(§12-0 (c)) | 項目3 のあと | 差 |
|---|---|---|---|
| `driver_grid_p8` | `PASS 55 / FAIL 1` `(6d)` | `(6d)` のみ | 変化なし(砦 n7 が大部屋。竜とは無関係) |
| `driver_mapeditor_painting` | `PASS 105 / FAIL 1` `(§1 1d2)` label 15 / サイズ 14 | `(§1 1d2)` label **17** / サイズ **16** | ⭐ **衝突は砦の `部屋n4big 30×20` vs `部屋n7big 30×20` の 1 組のまま**。項目2 (f) の先読み表どおり |
| `verify_codex_map_skill` | `16/17` `(3a)` `stag-tavern` の検算 NG | 同左。SHA は **15 件全件一致**(`dragon-vale=3a131f5b` / `dragon-nest=cf596fbc` を含む) | 変化なし |
| `probe_n4_stall` | exit 1 =「停滞は観測されませんでした」 | 同左(104 秒) | ⭐ **これは赤ではない**(正常系) |
| `driver_field_step6` | `=== 55/59 PASS ===`(`(C-bandits-forest)(C-lizard-swamp)(C-orc-fort)(C-undead-temple)`) | **`=== 55/59 PASS ===`** / 同じ 4 本 | ⭐⭐⭐ **増えなかった**(予告は外れた。下記 (k)) |

#### (g) 緑のままを実測で確かめた 18 本

`driver_graph_p7` 60/60 / `driver_graph_kinds` 66/66 / `driver_graph_arrows` 80/80 /
`driver_graph_reentry` 57/57 / `driver_graph_run` 99/99 / `driver_graph_sce1` 106/106 /
`driver_paint_blocked` 65/65 / `driver_grid_p3b` 44/44 / `driver_grid_p5` 103/103 /
`driver_grid_p7` 44/44 / `driver_mapdef_step1` 208/208 / `_step2` 74/74 / `_step3` 122/122 /
`driver_room_search_roll` 39/39 / `driver_trap_disarm` 44/44 / `verify_fort_fold` 30/30 /
`verify_swamp_fold` 30/30 / `verify_swamp_lair` 26/26 /(+ 直した `verify_temple_fold` 24/24)

⚠ 集計行は書式が揃わないので、**判定トークン + assert id** で突き合わせた原文は
`…\scratchpad\item3\logs\<name>.log`。非緑 5 本の集計行だけ原文で引く:

    driver_grid_s2              110/113 PASS          (着手前 119/119)
    driver_spawn_not_on_gate     66/67 PASS           (着手前 67/67)
    verify_swamp_novice         PASS 33 / FAIL 1      (着手前 34/34)
    driver_grid_p8              PASS 55 / FAIL 1      (着手前と同じ)
    driver_mapeditor_painting   PASS 105 / FAIL 1     (着手前と同じ)
    verify_codex_map_skill      16/17 PASSED          (着手前と同じ)

⭐⭐⭐ **`hoard` を条件付きで生やしたことは `driver_grid_s2` §8 がそのまま証明している。**
`(8-…)` は **24 PASS / 2 FAIL**で、PASS の 24 本は `lizard-swamp/n0〜n7` `orc-fort/n0〜n7`
`undead-temple/n0〜n7` の mapDef が `JSON.stringify` で **1 バイトも変わっていない**こと。
FAIL は `dragon-lair/n4` と `/n7` の 2 本だけ(= 畳んだ本人)。
⇒ 依頼書 §2-2 の罠(`hoard: null` を全 mapDef に足すと一斉に赤くなる)を**踏んでいない**。

⭐ **起動時 lint は鳴っていない。** `driver_graph_p6` の `(2a-dragon-lair)` `(2b-)` `(2c-)` が
3 本とも PASS = `LINT_PAINTING_ASPECTS` へ足した **31×20 / 30×19** が効いている(#11 / #53 / #58 / #66 に続く 5 例目)。
`(1i2-dragon-lair)` も PASS = 絵の `tileBounds` と部屋 `rect` が**完全一致**。

#### (h) ⭐⭐⭐ クリアまで到達できることの実測(最大の地雷の答え合わせ)

| 腕 | autoplay(素) | autoplay(ボス戦だけ hp=1 へ落とした腕) |
|---|---|---|
| 畳んだ既定 | `n4@1s → n7@126s` / **全滅**(169〜186s) | `n4@1s → n7@169s` / **cleared=true / bossKilled=true**(186.6s) |
| `?dragonfold=0` | `n0@1s → n1@10s → n4@26s → n7@44s` / **全滅**(72s) | **cleared=true / bossKilled=true**(66.9s) |

- ⭐⭐⭐ **素の全滅は畳みのせいではない。`?dragonfold=0` の腕(= 出荷済みの姿)も同じく全滅する。**
  ⇒ ラスボスの難易度そのもので、依頼書 §11 が明記した範囲外。⛔ #67 では触っていない。
- ⭐ 構造の詰みが無いことは、**n7 に入った時点で敵の hp を 1 にし、倒すのは本番のダメージ経路に任せる**腕で
  実測した(両腕とも `dungeonCleared`)。⇒ **寝床の島の罠は踏んでいない**。
- ⚠ 「全敵を手で `alive=false` にして `isNodeSettled()` を見る」測り方は**使えなかった**
  (本番の撃破経路を通らないので `false` のまま)。⭐ 勝敗は**本番の経路で倒して観測する**のが正。

#### (j) ⭐⭐⭐ 全ドライバ横断の「逐語アンカー腐敗」走査(⭐ 実走 1 本ぶんの時間で 139 本ぶん数えられる)

`tools/*.js` の **25 文字以上の文字列リテラル**を全部取り出し、着手前(`5cd8f6f`)と今とで
`index.html` / `js/df-mapdef.js` / `tavern.html` の中の**出現数がどう変わったか**を数えた。
`--negative` の変異アンカーはどれもこの形のリテラルなので、**変異を 1 本も走らせずに腐敗を数えられる**。

| 対象 | 1 → 0(腐敗) | 1 → 複数(曖昧化) |
|---|---|---|
| `index.html` | **0 件** | **0 件** |
| `js/df-mapdef.js` | **0 件** | **0 件** |
| `tavern.html` | **0 件** | **0 件** |

⭐ **走査そのものの負のコントロール**も通した。直す前の姿(`hoard` を `density/start` と同じ行へ書いた形)を
メモリ上で作って同じ走査を当てると **2 件**検出する:

    verify_fort_fold.js    '                                  density: d.density, start: d.start }),'
    verify_temple_fold.js  '                                  density: d.density, start: d.start }),'

⭐⭐⭐ **`verify_fort_fold` はこのアンカーを持っているのに、起動時のアンカー検算を持っていない**
(`anchorAudit` は `verify_temple_fold` にしか無い)。⇒ 素の実走は **30/30 で緑のまま**通り、
`--negative` を走らせた日に初めて空振りが分かる。**この走査でしか事前に見つけられない型**。

##### ⚠⚠⚠ 項目5 への警告 — 依頼書 §8 が指定した変異アンカー 2 本は**既に使えない**

「1 → 複数」ではなく「**2 → 3**」「**3 → 4**」なので上の表には出ないが、実測で次が分かった:

| リテラル | `5cd8f6f` | 現在 | 影響 |
|---|---|---|---|
| `          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },` | **2** | **3** | `verify_fort_fold` の `gateshift` が `n !== 1` で **exit 3**(⛔ #66 が神殿を足した時点で既に壊れている = 着手前から) |
| `              start: { tx: 12, ty: 13 },` | **3** | **4** | `verify_swamp_novice` の `nostart` が **exit 3**(実測: `node tools/verify_swamp_novice.js --mutate nostart` → 「1 ファイル / 4 箇所」)。⛔ こちらも着手前から |

⇒ **`verify_dragon_fold`(項目5)は §8 が挙げた `gateshift` / `startdefault` を
この 2 本のリテラルで作ってはいけない。** 竜にしか無い行(例 `rect: [4, 10, 22, 39], paint: "n7big", density: 0,`
や `hoard: [[26, 10], [27, 10], [26, 11], [27, 11]] }`)を握ること。
⭐ 畳みが 4 枚目に達したことで、「共通骨格の 1 行」はもう**一意なアンカーにならない**。

#### (k) ⭐⭐⭐ `driver_field_step6` —— **「畳むと (C-*) が 1 本増える」という予告は外れた**

§12-0 (c-2) と項目2 (j) は「#67 が竜を畳むと `(C-dragon-lair)` が **5 本目**として必ず増える」と
書いていた。**28.2 分かけて実走したら、増えなかった。**

    $ node tools/driver_field_step6.js
    === 55/59 PASS ===        (EXIT=1 / 1693 秒 = 28.2 分)
      FAIL (C-bandits-forest) ★?graph=auto が出口を自動選択して entry から前進した — entry=n7 現在=n7 訪問=0 前進=せず
      FAIL (C-lizard-swamp)   … entry=n4 現在=n4 訪問=0 前進=せず
      FAIL (C-orc-fort)       … entry=n4 現在=n4 訪問=0 前進=せず
      FAIL (C-undead-temple)  … entry=n4 現在=n4 訪問=0 前進=せず
      PASS (C-dragon-lair) ★?graph=auto が出口を自動選択して entry から前進した
                           — entry=n4 現在=n7 訪問=2 前進=246s
      PASS (C-dragon-lair) 屋外テーマではない / 経路探索が実際に走った (69 回) / pageerror 0

⭐ 集計は **55/59 = 着手前(§12-0 (b))とまったく同じ**。落ちている 4 本も**同じ 4 本**。

⭐⭐⭐ **一般則の訂正**: `(C-*)` が落ちる原因は「**畳んだこと**」ではなく
「**入口ノードを観測窓のうちに片付けられないこと**」。竜の畳んだ n4 は 10 体を 2 群に割ってあるので
`?graph=auto` が **246 秒で n4 → n7 へ前進**し、素直に緑になった
(神殿 n4 は 11 体・42 秒の観測で訪問 0 / 砦 n4 は 45 秒で訪問 0)。
⇒ 「畳んだシナリオは必ず Part C を落とす」という読みは**畳み 4 枚目で反証された**。

#### (i) やり残し / 申し送り

- ⛔ **`tools/verify_dragon_fold.js`(base 10281)は未着手** = 項目5。
- ⛔ (e) の 4 本の言い直し = 項目4。⭐ **`verify_swamp_novice (4b)` を忘れないこと**(依頼書に無い 4 本目)。
- ⭐⭐⭐ **`driver_field_step6` の予告は外れた(実測済・下記 (k))。** `(C-dragon-lair)` は**増えない**ので
  項目4 / 項目5 が身構える必要は無い。
- ▶ **難易度**: 4 人 PT はボス戦で全滅する(両腕とも)。砦 #63 の「n4 で全滅」とは別の場所。
  測定台 `sweep_recruit_balance` / `probe_party_size` が両方壊れているので、道具の修理を内包する別チケットへ。

### 12-3. 項目4 — 畳みで腐った既存 golden の言い直し

- **測定日**: 2026-09-16(実装窓・項目4)/ **着手直前の `HEAD`** = **`41add2a`**(項目3c の着地)・作業ツリー clean
- **触ったファイル** = `tools/driver_graph_p6.js` / `tools/driver_grid_s2.js` /
  `tools/driver_spawn_not_on_gate.js` / `tools/verify_swamp_novice.js` /
  **`tools/driver_doors_p6.js`(依頼書にも項目3 にも無い 5 本目)** + 本節。
  ⛔ **本番コード(`index.html` / `js/df-mapdef.js` / `tavern.html`)は 1 バイトも触っていない**
  (`verify_eol_doorfix (3b)` が「本番 5 ファイルの blob が HEAD と同一」で実測)。⇒ changelog は不要。
  ⛔ `tools/goldens/grid_s2.json` も 1 バイトも触っていない(`git diff --stat tools/goldens/` が空)。
- **生ログ**: `…\scratchpad\logs_A\`(着手前の走査 21 本)/ `logs_B\`(直した 5 本)/
  `logs_C\`(負のコントロール 6 本)/ `logs_D\`(アンカー腐敗の実測 3 本)。

#### (a) 母集団の引き方と実測本数

⛔ **撤退スイッチの語で引かない**(#66 の教訓)。⭐ 本項目が変えたのは `tools/*.js` だけなので、
3 段 union のうち段2「変更したファイルをコードで読む本」は**実測 0 本**になる — ここが #67 の他の項目と違う。

| 段 | 引き方 | 本数 |
|---|---|---|
| **(i)** | 舞台名 `dragon-lair`(`grep -l "dragon-lair" tools/*.js`) | **36** |
| **(ii)** | 変更した 5 本の `tools/*.js` を**コードで読む本** | **0**(全部コメント / assert のラベル文字列の中だけ) |
| **(iii)** | その測定器のソースを読む測定器 | **2**(`verify_enemy_name_label` / `verify_eol_doorfix`) |
| | **union** | **38** |

(ii) の内訳(`grep -n` の全ヒットを 1 件ずつ読んだ): `probe_bandit_map:4` / `probe_s2_fold:5,32` /
`verify_fort_fold:24` / `verify_swamp_fold:718`(assert のラベル本文)/ `verify_swamp_lair:214` /
`driver_graph_p7:50` / `driver_heromark_signplate:17` / `probe_swamp_map:4,206` —— **どれも `require` でも
`readFileSync` でもない**。(iii) の 2 本も、凍結しているのは `driver_cast_circle.js` と
`driver_doors_p2/p5/p8.js` で、本項目が触った 5 本は**含まれない**(ただし `verify_eol_doorfix` は
追跡ファイル**全部**の行末と blob を見るので母集団に入る)。

**(i) 36 本の実走の分担**(⭐ `probe_party_size` を除く **35 本すべてを HEAD で実走済み**):

- **項目3 が実走済み = 16 本**(§12-2 (e)(f)(g))
- **項目4 がこの日に実走 = 20 本**(`logs_A`。所要 17.2 分・直列)
- **未実走 = 1 本** = `probe_party_size`(§12-0 (f) の既知の無限走行)

#### (b) ⭐⭐⭐ 4 本ではなく **5 本**だった —— `driver_doors_p6` が腐っていた

`logs_A` の 20 本のうち **非緑は `driver_doors_p6` ただ 1 本**(`34/40 PASS` / EXIT=1)。
残り 19 本は集計行まで §12-0 (b) の着手前と**完全一致**した。

    driver_bgm_mine 37/37 / driver_dev_gate2 62/62 / driver_doors_p2 40/40 / driver_doors_p5 36/36 /
    driver_field_scale 49/49 / driver_field_step1 95/95 / _step1_geo 71/71 / _step2 64/64 /
    _step3 65/65 / _step7 79/79 / _verge_gap 39/39 / driver_mine_wall 66/66 /
    driver_monsters_orc 7/7 / driver_wall_face 54/54 / driver_wallbox 28/28 /
    probe_bandit_map --mapdefs EXIT=0 / verify_party_four 17/17 / verify_recruit_size 91/91 /
    verify_enemy_name_label 30/30 / verify_eol_doorfix 27/27

⭐ **`driver_doors_p6` の赤 6 本**(`(0b)(1a)(5a)(5b)(6a)(7a)`)**は型1 = #67 が構造的に殺した型**で、
無関係な既存の赤ではない(#55 の 3 分類)。落ちた理由:

    FAIL (0b) 選定=lizard-swamp ★条件を満たす舞台なし → 扉が最多の舞台へ退避
              — lizard-swamp:hidden0/扉2 orc-fort:hidden0/扉1 undead-temple:hidden0/扉1
                dragon-lair:hidden0/扉1 bandits-forest:hidden0/扉0
    FAIL (7a) — goblin-mine:0/1 bandits-forest:0/0 lizard-swamp:0/2 orc-fort:0/1
                undead-temple:0/1 dragon-lair:0/1  (ノード 2,1,3,2,2,2)

⭐⭐⭐ **真因は欠陥ではなく構造**。隠せる扉は「行き先が行き止まり(`exits 0`)かつ非ボス」だけなので、
6 シナリオ全部が 1〜3 ノードへ畳まれた今、**既定の腕には隠せる候補が原理的に 1 枚も無い**。
#62 が入れた「舞台を台帳から導く」受け皿は正しく働いた(名前を焼いていれば FATAL だった)が、
**候補が全滅する**ところまでは想定していなかった。
⇒ #66 の裁定どおり**閾値を下げず母集団を作り直した** = 撤退の腕(`&<x>fold=0`)を候補と §7 の走査に足す。

⚠⚠ **依頼書 §2-6 の「腐るのは 3 本」も、項目3 の「4 本」も、どちらも過少だった。**
項目3 の 4 本目(`verify_swamp_novice`)は §2-6 の見落とし、5 本目(`driver_doors_p6`)は
**項目3 が走らせた範囲の外**にあった。⭐ 一般則 = **「前の項目が数えた本数」も信じない**
(#47 の「前のチケットの完了報告を出発点にするな」が、**同じチケットの前の項目**にも当てはまる)。

#### (c) 5 本それぞれの前後の集計行(⭐ 原文)

| ドライバ | 着手前(§12-0 (b)) | 項目3 のあと | **項目4 のあと** | assert の増減 |
|---|---|---|---|---|
| `driver_graph_p6` | `══ 結果: 249/249 PASS ══` | **EXIT=9**(`:498` で `byId.n0.slots` の FATAL) | `══ 結果: 250/250 PASS ══` EXIT=0 | **+1**(`(1dragonfold-dragon-lair)`) |
| `driver_grid_s2` | `[drv] 119/119 PASS` | `110/113` EXIT=1 | `[drv] 124/124 PASS` EXIT=0 | **+5**(`(8u)(8u2)(8z4)(8t)(8t2)`) |
| `driver_spawn_not_on_gate` | `[drv] 67/67 PASS` | `66/67` EXIT=1 | `[drv] 71/71 PASS` EXIT=0 | **+4**(`(1a2/1b2/1c2/1d2-dragon-lair)`) |
| `verify_swamp_novice` | `PASS 34 / FAIL 0` | `PASS 33 / FAIL 1` `(4b)` | `PASS 34 / FAIL 0` EXIT=0 | ±0 |
| **`driver_doors_p6`** | `══ 結果: 40/40 PASS ══` | (項目3 は走らせていない) → **項目4 が実測 `34/40` EXIT=1** | `══ 結果: 40/40 PASS ══` EXIT=0 | ±0(**母集団が 12→57 ノードへ増えた**) |

⭐ **どれも assert が 1 本も減っていない**(#66 の「言い直した結果 assert が減っていたら失敗」)。

**直し方(全部「腕の移設」/「母集団の追加」。⛔ 期待値も golden も 1 つも緩めていない)**:

1. `driver_graph_p6` —— `FOLDED` 表へ 1 行 `'dragon-lair': { arm: '&dragonfold=0', …, nodes: 2, entry: 'n4' }`。
   ⭐ これだけで `P6_ARM('dragon-lair')` が撤退の腕を当て、`(1c-dragon-lair) ノードが 8 件 — 件数=8` が
   戻り、**FATAL ごと消えた**。⛔ 「8 件」を「2 件」に書き換えていない。
2. `driver_spawn_not_on_gate` —— `FOLD_ARM` へ 1 行。⭐ `NODES_EXPECTED` は #66 が廃止済みなので
   これ 1 行で `(1a-dragon-lair)` の期待値が「既定 2 ノードは骨格 8 ノードの真部分集合」へ自動で言い直った:

       PASS (1a-dragon-lair) 既定の腕のノード集合が骨格 (?dragonfold=0) の空でない真部分集合
            — 既定=["n4","n7"] / 骨格=["n0","n1","n2","n3","n4","n5","n6","n7"]
       PASS (1e) 腕 12/12 = … dragon-lair:2n13e dragon-lair?dragonfold=0:8n13e
            (ノード 57 件 / 湧き 182 体)

3. `driver_grid_s2` —— `UNTOUCHED` から竜を抜き(**0 件**になった)、`?dragonfold=0` の腕を新設。
   golden のキーは 39 件のまま 1 バイトも動いていない:`(G0) 今回 39 件 / golden 39 件`。
   ⛔ `--update-golden` は 1 度も打っていない。
4. `verify_swamp_novice` —— `THEME_EXCEPTIONS` へ `'dragon-lair'` を 1 行。#66 と**同じ形がそのまま使えた**。
   ⭐ 例外はタダではない:`(4b2)` が「例外表のテーマが実際に着手前と差分を持つ」を要求しており、
   3 件すべて緑 = 古い免罪符が残っていない。⛔ `BASELINE_REV`(`cdaaf91`)は進めていない。
5. `driver_doors_p6` —— `FOLD_ARM` / `ARMS_OF()` / `STAGE_Q` を新設し、
   §0b の候補を **(舞台 × 腕)** へ、§7 の走査を **6 シナリオ × (既定 + 撤退)** へ広げた。
   ⭐ **既定の腕を先に全部試してから撤退の腕へ落ちる**ので、将来また既定に隠し扉が生えたら自動で戻る。

       ── 着手前 ──  (7a) FAIL  ノード 12 / 扉 6 / hidden 0 / 行 6
       ── 項目4 ──  (7a) PASS  ノード 57 / 扉 45 / hidden 5 / 行 12
                     (0b) PASS  選定=lizard-swamp&swampfold=0 (hidden1/扉7/entry=n0・前進3)
                     (7i) 母集団 1 シナリオ / 扉 1 枚 → **6 シナリオ / 扉 6 枚**
                     (7f) ユニークな配置 4/6 → **8/12**

#### (d) ⭐ `driver_grid_s2` の空母集団の受け皿(依頼書 §6-6)

`UNTOUCHED` が **0 件**になったので `for (const s of UNTOUCHED) { … G.check(…) }` が 1 回も回らない。
⇒ §6-6 の 3 要求をこう組んだ:

| 要求 | assert | 実測 |
|---|---|---|
| 畳んだ腕で竜が `["n4","n7"]` / `entry==="n4"` | **(8u)** | `ids=["n4","n7"] entry=n4` |
| `?dragonfold=0` で 8 ノード / `entry==="n0"` | **(8u2)** | `ids=["n0"…"n7"] entry=n0` |
| `G.check` の回数が下限を割らない | **(8t)** | **実測 39 件 / 下限 39 件 / UNTOUCHED=[]** |

**⭐ 下限の導出式(⛔ シナリオ名も件数も焼いていない)**:

```js
const GOLDEN_POP = [
  { key: 's2-',             keyNodes: S2_KEEP_NODES,     sw: 's2fold'     },  // 7
  { key: 'lizard-swamp/',   keyNodes: SWAMP_KEEP_NODES,  sw: 'swampfold'  },  // 8
  { key: 'orc-fort/',       keyNodes: FORT_KEEP_NODES,   sw: 'fortfold'   },  // 8
  { key: 'undead-temple/',  keyNodes: TEMPLE_KEEP_NODES, sw: 'templefold' },  // 8
  { key: 'dragon-lair/',    keyNodes: DRAGON_KEEP_NODES, sw: 'dragonfold' },  // 8
];
const GOLDEN_MIN = GOLDEN_POP.reduce((a, e) => a + e.keyNodes.length, 0);   // = 39
// 実測は「golden 照合にしか使っていない id」を results から数える
const goldenPop = results.filter(r => /^\((?:8|11)-/.test(r.name)).length;
```

⚠⚠ **ただしこれだけでは循環する。** 台帳から 1 行消せば下限も一緒に下がるので、
「畳まれた舞台を §8 から黙って落とす」= **#67 の着手時点で `UNTOUCHED` に対して実際にやれた形**は
捕まらない。⇒ **外側の台帳(本番 `index.html` の撤退スイッチ)**と突き合わせる assert を併設した:

    PASS (8t2) ★★装置: 本番 index.html が持つ畳みの撤退スイッチが、台帳 GOLDEN_POP の腕 +
               既知の除外 ["minefold"] と完全一致 (= 6 枚目の畳みが着地したら必ずここが赤くなる)
               — 本番=["dragonfold","fortfold","minefold","s2fold","swampfold","templefold"]
                 台帳+除外=同左

⭐ **(8t2) は #67 の着手時点なら赤かった**(本番 5 スイッチ vs 台帳 4 腕 + 除外 1)。
⭐ 除外 `minefold` は**タダではない** —— (8t2) は完全一致を要求するので、廃坑に golden を足した日には
この行を消さないと赤くなる(古い免罪符が黙って残らない。`verify_swamp_novice` の `THEME_EXCEPTIONS` と同型)。
⚠ 読み口は **`fs` ではなく配信**(`page.evaluate(fetch('index.html'))`)。作業ツリーを直接読むと
`--mutate` が効かない(本ファイル冒頭の作法)。

#### (e) 負のコントロールの再検算(⭐ 母集団を触ったので必ず撃ち直す)

| 走らせたもの | EXIT | 赤くなった assert |
|---|---|---|
| `driver_doors_p6 --mutate nosecretroll` | 1 | `35/40` = `(0b)(1a)(1c)(7a)(7d)` |
| `driver_doors_p6 --mutate noleafguard` | 1 | `36/40` = `(7g)(7h)(7c)(7d)` —— ⭐ **5 舞台で**ボス到達不能を検出 |
| `driver_doors_p6 --mutate noexclude` | 1 | `36/40` = `(1c)(1l)(7i)(7d)` —— ⭐ (7i) が **5 舞台**で違反を挙げた |
| `driver_grid_s2 --mutate nobridge` | 0 | ⭐ このドライバは変異 7 本を**同一 run 内の別ポートで配る**設計で、負のコントロールは `(3a)〜(3g)` の方。7 本とも緑 = 検出力は落ちていない |
| `driver_graph_p6 --mutate nop6` | 1 | `208/211` = `(1a-orc-fort)(6c-orc-fort)(G1)` |
| `driver_spawn_not_on_gate --mutate regressnolint` | 1 | `55/64` =(`(1c2-bandits-forest)(2b)(2c)(2d)(3a)(3b)` ほか 9 本) |

⭐⭐ **`noleafguard` / `noexclude` は #67 以前より強くなった**。畳む前は 1 舞台でしか撃てなかった欠陥が、
撤退の腕を足したことで **5 舞台すべてで**検出されるようになっている(母集団の追加が検出力に直結した実例)。

⚠⚠⚠ **実測でヘッダの記述を 1 件訂正した** —— `driver_doors_p6` の負のコントロール表は
`nosecretroll → §6 (6a)` と書いていたが、**(6a) は nosecretroll では原理的に赤くならない**。
(6a) の母集団 `nWould` は実装ではなく**ドライバ側の規則 `wantHidden`** から数えるので、実装の抽選を
殺しても `nWould` は減らず、`nHidden === 0` はむしろ (6a) が要求する側だから。
⇒ #67 以前に (6a) が赤く見えていたのは**畳みで舞台の母集団が 0 枚になっていたため**で、
負のコントロールの成果ではない。ヘッダの表を実測値へ書き直した。
⭐ (6a) には**今も変異が無い**(= `?secret=0` が効かなくなる欠陥を撃つ腕が存在しない)。⛔ #67 の範囲外なので足していない。

#### (f) ⚠⚠⚠ アンカー腐敗 2 件 —— **記録して項目5 へ申し送る**(直していない)

**実測(`logs_D`)**:

    $ node tools/verify_swamp_novice.js --mutate nostart
    [drv] ⛔ 変異 nostart の置換対象が 1 ファイル / 4 箇所 → 負のコントロールが空振りする  (EXIT=3)
    $ node tools/verify_fort_fold.js --mutate gateshift
    [drv] ⛔ 変異 gateshift の置換対象が 1 ファイル / 3 箇所 → 負のコントロールが空振りする  (EXIT=3)
    $ node tools/verify_swamp_novice.js --negative
    … density1: 期待 ["1b"] / 実際に赤 ["1b"] → OK  →  nostart で EXIT=3 (**残り 13 本が 1 度も走らない**)

**リテラルの出現数を 4 リビジョンで数え直した**(⭐ 項目3 の申し送りを鵜呑みにせず自分で測った):

| アンカー | `da7cce6` | `7008057`(#66) | `5cd8f6f`(#67 項目2) | `41add2a`(現在) |
|---|---|---|---|---|
| `              start: { tx: 12, ty: 13 },` | **3** | 3 | 3 | **4** |
| `          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },` | **1** | **2** | 2 | **3** |

**判断 = 直さず記録して項目5 へ渡す。理由は 3 つ、どれも実測で裏付けた。**

1. ⭐⭐⭐ **#67 は「壊した」のではなく「既に壊れていたものを 1 増やした」だけ。**
   門番は `hits.length !== 1 || n !== 1` という**二値**なので、3→4 も 2→3 も
   **観測される結果は完全に同じ(EXIT=3・変異が 1 度も走らない)**。
   `nostart` は `da7cce6`(2026-09-10 = #65 着手直前)の時点で既に **3**、
   `gateshift` は **#66 が神殿を足した `7008057` で 2 になった時点**で死んでいる。
   ⇒ #67 は**悪化させていない**(依頼の分岐の後者)。
2. ⭐⭐⭐ **単一行アンカーでは直せないことを実測で確かめた。** 置換エンジンは
   `if (from.indexOf('\n') >= 0) … exit 3` で**複数行アンカーを明示的に禁止**している。
   そのうえで本番の 4 箇所 / 3 箇所を数えたところ:
   - `start:` の 4 箇所のうち**砦 / 神殿 / 竜には固有の末尾コメントが付いており 3 本とも一意**
     (`… /* 崩れた城門の 2 タイル内側 */` `… /* 西の大扉の 2 タイル内側 */` `… /* 西辺の岩床の 2 タイル内側 */`)。
     **沼だけがコメント無し**で、他 3 本の**接頭辞**になっている ⇒ 沼を名指しする 1 行が存在しない。
   - `{ id: "n4", kind: "start", … }` は **3 箇所が完全同形**で、**直前の 2 行のコメントまで同一**
     (`index.html:38003 / 38145 / 38277`)。⇒ 1 行では砦を名指しできない。
   ⇒ 直すには「測定点を別の行へ移す」= **負のコントロールの設計変更**が要る。これは
   *言い直し*ではなく*作り直し*で、本項目(既存 golden の言い直し)の範囲を超える。
3. ⭐ **項目5 が同じ問題を必ず解く。** `verify_dragon_fold` の `gateshift` / `startdefault` は
   まさにこの 2 本のリテラルを使えない(項目3 §12-2 (j) の警告)。項目5 が竜で解いた形を
   そのまま砦・沼へ横展開するのが、3 本バラバラに当てるより安全で安い。

⛔ **したがって `verify_fort_fold` / `verify_swamp_novice --negative` は着手前と同じ EXIT=3 のままである。**
素の実走は両方とも緑(`verify_fort_fold` 30/30 は項目3 が / `verify_swamp_novice` 34/34 は本項目が実測)。

#### (g) 崩れた依頼書 / 前項目の主張 — **3 件**(⛔ 予測のほうを訂正した)

| 主張 | 実測 | 判定 |
|---|---|---|
| 依頼書 §2-6「腐るのは 3 本」/ 項目3「4 本」 | **5 本**。5 本目 `driver_doors_p6` は項目3 が走らせた範囲の外に居た | **訂正** |
| 依頼書 §6-6「下限 = 撤退 5 シナリオ x 8 ノード + 廃坑」 | 廃坑は `driver_grid_s2` の golden に**最初から 1 キーも無い**(`buildP6Run` を使わないため)。森は n0〜n6 の **7 件**。正しい下限は **7+8+8+8+8 = 39** | **訂正** |
| `driver_doors_p6` のヘッダ「`nosecretroll` → §6 (6a)」 | (6a) の母集団はドライバ側の `wantHidden` から数えるので**実装の抽選を殺しても赤くならない**。ヘッダを実測値へ書き直した | **訂正** |

#### (h) やり残し / 申し送り

- ⛔ **`tools/verify_dragon_fold.js`(base 10281)は未着手** = 項目5。
- ⭐⭐⭐ **項目5 が使える「竜にしか無い一意な 1 行」**(2026-09-16 に `index.html` で出現数 1 を実測):

      rect: [4, 10, 22, 39], paint: "n7big", density: 0,
      rect: [4, 9, 23, 39], paint: "n4big", density: 0,
      start: { tx: 12, ty: 13 },   /* 西辺の岩床の 2 タイル内側 */
      hoard: [[26, 10], [27, 10], [26, 11], [27, 11]] }
      if (DRAGON_FOLDED) t["dragon-lair"] = { n4: ["search", "loot"] };
      const DRAGON_FOLDED = !DRAGON_FOLD_OFF;

  ⛔ `{ id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },`(3 箇所)と
  `              start: { tx: 12, ty: 13 },`(4 箇所・沼が接頭辞)は**使えない**。
- ⭐ 項目5 が `verify_dragon_fold` を作ったら、`driver_grid_s2 (8t2)` の台帳と競合しないか一度だけ見ること
  (あちらは本番のスイッチ名だけを見るので、新ドライバが増えても影響しないはず)。
- ▶ `verify_fort_fold` の `gateshift` / `verify_swamp_novice` の `nostart` の**アンカー作り直し**((f))。

### 12-4. 項目5 — 受入ドライバ verify_dragon_fold

- **測定日**: 2026-09-16(実装窓・項目5)/ **着手直前の `HEAD`** = **`b3d2d74`**(項目4b の着地)・作業ツリー clean
- **触ったファイル** = **`tools/verify_dragon_fold.js`(新規・1122 行)** + 本節のみ。
  ⛔ **本番コード(`index.html` / `js/df-mapdef.js` / `tavern.html`)は 1 バイトも触っていない**
  (`git status --porcelain` が着手前から `?? tools/verify_dragon_fold.js` の 1 行だけ)。⇒ changelog は不要。
- **生ログ**: `…\scratchpad\item5\`(`probe_dragon5.js` / `probe1.log` = 下見 / `count_anchors.py` /
  `plain1.log` `plain2.log` `plain3.log` = 素 3 回 / `neg1.log` = 変異 9 本 /
  `grid_s2_pre.log` `eol_pre.log` = 隣人 2 本)。
- **ポート**: base **10281** / 変異の子 **10282〜10290**(9 本)。
  ⇒ **次の新規ドライバの base は 10301 以降**。⛔ 10080 は Chrome の `ERR_UNSAFE_PORT`。

#### (a) 素の集計行(⭐ 原文)— 35/35 を **4 回**

    $ node tools/verify_dragon_fold.js
    ════════════════════════════════════════
      PASS 35 / FAIL 0
    ════════════════════════════════════════
                                  (EXIT=0。plain1 / plain2 / plain3 の 3 回とも同一)

`--negative` の先頭で回る「素の 1 本 (基準)」でも FAIL 0(`⛔ 素の実行で FAIL がある` は 1 度も出ていない)
⇒ **合計 4 回とも緑**。⭐ #67 項目1 の「同じ色が 2 回続くフレークが実在する」を踏まえ、2 回では止めなかった。

⚠ `[drv] 例外 / console.error·warning = 1 ["ERROR Failed to load resource: … 404 …"]` が毎回出るが、
これは**ブラウザが勝手に取りに行く `/favicon.ico`**(`ls favicon.ico` = 存在しない)。
判定に使う (1d) は `[graph]` を含む warning/error だけに絞ってあるので影響しない。

**35 本の内訳**: §0 = 0a 0b 0c 0d 0e / §1 = 1a 1b 1c 1d / §2 = 2a 2b 2c 2d 2e /
§3 = 3a 3b 3c 3d 3e 3f / §4 = 4a 4b 4c / §5 = 5a 5b 5c 5d 5e / §6 = 6a 6b 6c / §7 = 7a 7b / §8 = 8a 8a2。

#### (b) 選んだ変異アンカーと出現数の実測(⭐ 着手前に `py` で数えた)

    $ py count_anchors.py            (index.html を newline='' で読み、str.count で数える)
    density1       1        dropfoes       1        gateshift      1
    hoardnull      1        hoardwide      1        nofold         1
    nokinds        1        rectshift      1        startdefault   1
    REF_n4start    3    ← 依頼書 §8 が gateshift に指定していた行(使えない)
    REF_start12    4    ← 依頼書 §8 が startdefault に指定していた行(使えない)

⭐ **項目4 (f) の実測(3 箇所 / 4 箇所)をそのまま再現できた。** 9 本すべて「竜にしか無い 1 行」:

| 変異 | アンカー(原文) |
|---|---|
| `nofold` | `    const DRAGON_FOLDED = !DRAGON_FOLD_OFF;` |
| `nokinds` | `      if (DRAGON_FOLDED) t["dragon-lair"] = { n4: ["search", "loot"] };` |
| `dropfoes` | `      const FOLD_MOVED_DRAGON = DRAGON_FOLDED` |
| `hoardwide` | `          if (MAPDEF && Array.isArray(MAPDEF.hoard)) return MAPDEF.hoard;` |
| `hoardnull` | `      if (opt.hoard != null) md.hoard = opt.hoard;` |
| `gateshift` | `      if (!DRAGON_FOLDED) return run;     // ?dragonfold=0 = 8 ノードの旧構成` |
| `rectshift` | `              rect: [4, 9, 23, 39], paint: "n4big", density: 0,` |
| `startdefault` | `              start: { tx: 12, ty: 13 },   /* 西辺の岩床の 2 タイル内側 */` |
| `density1` | `                                  density: d.density, start: d.start }),` |

⭐ **`gateshift` は依頼書の指定を捨てて「撤退の早期 return の行へ `else { … }` を生やす」形にした。**
既存の `exits` を写像するだけなので 1 行に収まる(`_gs.exits = _gs.exits.map(e => ({… at:[e.at[0], e.at[1]+1] …}))`)。
⚠ `density1` のアンカーだけは `verify_fort_fold` / `verify_temple_fold` と**共有**している
(buildP6Run の `nd()`)。変異ごとに原本を読み直す実装なので互いを食わない(#56 の作法)。

⭐ さらに **(0e) として起動時のアンカー検算を内蔵**した(`verify_temple_fold` 由来)。
⛔ `verify_fort_fold` にはこれが無く、そのせいで「素は 30/30 緑・`--negative` だけ EXIT=3」が
1 チケット生き延びた(項目3 (j) / 項目4 (f))。⇒ **畳み系の新規ドライバには必ず持たせること。**

#### (c) 変異 9 本で**実際に赤くなった** assert id(⭐ 原文。⛔ 机上で書いていない)

    $ node tools/verify_dragon_fold.js --negative          (EXIT=0 / 10 走行)
      負のコントロール 9 / 9 が検出成功
       ・nofold        期待 ["0a"]  / 赤 ["0a","0b","1a","2a","2c","2d","2e","3a","3b","3c","3d",
                                          "4a","4b","5a","5b","5c","5d","5e","6a","7a","8a2"]
       ・nokinds       期待 ["4a"]  / 赤 ["4a","4b"]
       ・dropfoes      期待 ["2a"]  / 赤 ["2a"]
       ・hoardwide     期待 ["3b"]  / 赤 ["3b","3c"]
       ・hoardnull     期待 ["8a2"] / 赤 ["8a2"]
       ・gateshift     期待 ["5c"]  / 赤 ["5c"]
       ・rectshift     期待 ["5a"]  / 赤 ["5a","5b","5c"]
       ・startdefault  期待 ["5b"]  / 赤 ["2c","5b","5d"]
       ・density1      期待 ["5e"]  / 赤 ["5e"]

⭐ **`dropfoes` / `hoardnull` / `gateshift` / `density1` が 1 本ずつ**しか赤くしない
= **節が分離している**証拠(1 つの変異が全部を赤くする「爆風だけの装置」ではない)。
⭐ `nofold` で緑のまま残ったのは **14 本**(0c 0d 0e 1b 1c 1d 2b 3e 3f 4c 6b 6c 7b 8a)。
旧 8 ノード構成でも「歩けること」自体は成り立つので **(6b)(6c) が緑なのは正しい**。

#### (d) ⚠⚠⚠ 崩れた依頼書の主張 — **2 件**(⛔ 予測のほうを訂正した)

| 主張 | 実測 | 判定 |
|---|---|---|
| §8 (8a)「他 5 シナリオの mapDef が 1 バイトも変わっていない」は「**`hoard` を無条件に生やしていないことの検査でもある**」 | ⚠⚠⚠ **両立しない。** (8a) は**両腕の差**なので、`p6Node` が無条件にキーを生やす欠陥は**両方の腕へ等しく**効いて差が出ない。実測でも変異 `hoardnull` で **(8a) は PASS のまま**(ハッシュは両腕とも `bandits-forest 976d03ab:717 → 67026816:730` と等しく動いた)。⇒ **絶対量の (8a2) を新設**し、そちらだけが赤くなった(畳んだ腕 10 件 / 撤退の腕 16 件 vs 正しくは 1 件 / 0 件) | **訂正** |
| §8 の負のコントロール表「`hoardwide` → §3 (3b)(3c)(**3d**)」 | **(3d) は赤くならなかった。** 西 45% 規則へ落ちたとき、種つき乱数がミミックを **(11,8)** へ置き、入場 (12,13) から **489.5px = 半径の 2.45 倍**で (3d) の敷居(2 倍)を上回った。⇒ (3d) は「入場の隣に湧く」欠陥の番人として正しいが、**この変異では発火しない**。担当は (3b)(3c) | **訂正** |

⭐ 一般則(#44 の再演): **恒等 assert は「片方のアームだけを壊す変更」でしか赤くならない。**
「無条件に載せる」型の欠陥は**絶対量**でしか捕まらない。
⭐ もう 1 つ(#57 の再演): **負のコントロールの赤は机上で書くと必ず外れる。** 今回も 9 本中 2 本で外れた。

#### (e) 依頼書 §8 から変えた点 — **6 件**(⛔ 弱めたものは 1 つも無い)

| id | 変えた点 | 理由 |
|---|---|---|
| **(8a2)** 新設 | 「`hoard` キーを持つ mapDef が 6 シナリオ全ノードで**畳んだ竜の n7 ただ 1 つ**、撤退の腕では 0 件」 | (d) のとおり (8a) では原理的に測れない。⭐ 依頼書 §2-2 の罠(全 mapDef に `hoard:null` が生えて `driver_grid_s2 §8` が一斉に赤くなる)の番人はこちら |
| **(2c)** 強化 | 「スロットがマスクの `.` に載る」+「マスクの `#` が 1 つも歩けるようになっていない」の **2 本立て** | ⚠ `isTileWall` だけでは**永久緑**(`applyPaintingBlocking` の門番 `skipSpawn` が敵スポーンを必ず素通しさせる = #58 の教訓) |
| **(2e)** 追加 | 「n4 の敵が 2 群に割れ、群間の最短 > `DETECTION_RANGE`」 | 依頼書 §9-2 が**設計の制約として決めている**値なので、決定を記録する assert として置いた(⛔ 決定の先取りではない)。実測 **群 [5,5] / 群間 15.13 タイル > 12.5** |
| **(1d)** 追加 | 起動時 lint が error 0 / warning 0 | `LINT_PAINTING_ASPECTS` へ足した 31x20 / 30x19 が効いていることを、このドライバ単体でも読めるようにする |
| **(0e)** 追加 | 変異アンカーの起動時検算 | `verify_fort_fold` にこれが無かったせいで空振りが 1 チケット生き延びた((b) の注記) |
| **(4c)** 追加 | 他 4 シナリオの兼務宣言が 1 ビットも動いていない | fort / temple と同じ形 |

⚠ **(6a) には変異が無い(宣言された穴)。** 竜は `inactive` な敵を 1 体も置かないので、竜側のどんな欠陥でも
原理的に赤くならない。⭐ ただし「空集合を測って緑」だけは母集団ガード(各ノードに敵が実在する =
実測 `["n4:10","n7:3"]`)を同居させて塞いである。⛔ この穴は隠さずここに書く。

#### (f) ⭐ 写経していないことの実測(期待値の出所)

| 測っているもの | 出所 | 実測値 |
|---|---|---|
| ノード数 / id / entry | **3 経路** = `RUN.graph` / `buildScenarioRun("dragon-lair")` / `buildDragonLairRun()` | どれも `entry=n4 ids=["n4","n7"] kinds=["start","boss"]` |
| 敵の顔ぶれ | `?dragonfold=0` の **n1+n2+n3+n4 の合計** | 旧 10 体 `{orc:5,skeleton:2,minotaur:3}` = 畳んだ n4 10 体 |
| 入場地点 | rect からの**独立式**(辺の中点 + `NODE_ENTRY_INSET`) | n4 (20 行 偶数) `[11,13]` / n7 (**19 行 奇数**) `[12,13]` — 2 枚とも実際に立ったタイル・`mapDef.start` と 3 経路一致 |
| 出口タイル | **3 経路** = `exits[].at` / `nodeGateTile(md,"right")` / rect の右辺の中点 | `[39,13]` で一致 |
| 交戦距離 | 本番の `RANGE.melee.engagePx` | 400px = 4.17 タイル(n4 最寄り 5.00 / n7 最寄り 11.18) |
| 群の閾値 | 本番の `DETECTION_RANGE / TILE_SIZE` | 1200 / 96 = 12.5 タイル |
| ミミックの半径 | 本番の `MIMIC_APPROACH_RADIUS` | 200px(実測の距離 1452.7px = **7.26 倍**) |
| 西 45% の比 | **配信バイトの `westLimit` の行を正規表現で読む** | `0.45` ⇒ 旧 n7 rect `[11,32,16,40]` から westLimit = col 35、宝箱 4 個とも内側 |
| マスク | **配信した `index.html` を自前でパース** | n4big 20 行 x 31 列(開き 297 / 塞ぎ 323)/ n7big 19 行 x 30 列(開き 324 / 塞ぎ 246) |

⭐ **(6c) は出口ゲートに閉じた扉が立つので `aStar` が素で `null` を返す**(#66 が神殿で踏んだのと同型。
下見でも `gate:null` を再現した)⇒ 扉の**手前**まで測って扉のタイルを末尾へ足す形にした。
実測 `{"via":"door-front","steps":28,"front":[38,13]}`。

#### (g) 隣人 2 本の非退行(⭐ 項目4 (h) の申し送りに応えた)

    $ node tools/driver_grid_s2.js        → [drv] 124/124 PASS              (EXIT=0)
        PASS (G0) golden のキー集合が今回の実行と完全一致 — 今回 39 件 / golden 39 件
    $ node tools/verify_eol_doorfix.js    → 素 27/27 PASSED                 (EXIT=0)
        PASSED (3b) ★★本番 5 ファイルの blob が HEAD と同一 — 食い違い 0 本

⭐ **`driver_grid_s2 (8t2)` の台帳(本番の撤退スイッチ名だけを見る)とは競合しなかった** =
項目4 (h) の見立てどおり。`verify_eol_doorfix` も、新規 `tools/*.js` が `.gitattributes` の既定 LF に
従っている限り無傷(本ドライバは **純 LF / CR 0 バイト**を `py` で実測済み)。

#### (h) ⚠⚠⚠ 横展開は**やらなかった** — 理由は「安い」が実測で崩れたから

項目4 (f) は「竜で解いた形を `verify_fort_fold` / `verify_swamp_novice` へ横展開するのが一番安い」と
見立てていた。⭐ **着手前に数えたら、その見立ての前提が 2 つ崩れた。**

1. ⚠⚠⚠ **`verify_fort_fold` で死んでいるのは `gateshift` 1 本ではなく `addn6` と `gateshift` の 2 本。**
   実測 = `grep -n -F '{ id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },' tools/verify_fort_fold.js`
   → **91 行 (addn6) と 94 行 (gateshift) の 2 箇所**が同じ 3 箇所アンカーを共有している。
   `MUT_ORDER` は `… dropfoes, addn6, gateshift …` なので **`--negative` は gateshift へ届く前に
   addn6 で EXIT=3** になる。⇒ 項目4 の記録(`--mutate gateshift` 単独での実測)は正しいが**不完全**。
2. ⚠⚠ **竜で使った形は `addn6` には移植できない。** 竜の `gateshift` は「既存の `exits` を写像するだけ」
   なので `if (!DRAGON_FOLDED) return run; else { … }` の 1 行に収まったが、`addn6` は
   **返り値の `nodes` 配列へ要素を挿す**変異で、返り値のオブジェクトリテラルはその行より後に作られる。
   ⇒ 1 行アンカーでは書き換えられず、**負のコントロールの設計変更**が要る。
3. ⚠ 直した瞬間に「**一度も走ったことのない 3 本**」(`rectshift` / `startdefault` / `density1`)が初めて走る。
   そこが赤なら EXIT=3 が EXIT=1 に変わるだけで、#67 の範囲外の修理を抱え込む。
   `verify_swamp_novice` は更に重い(**13 本**が未走 / `nostart` を 1 行で言い直せる口が
   **コメント行しか無い** —— 沼の `start:` 行は末尾コメントを持たず他 3 本の接頭辞)。
4. ⭐ どちらも **#67 の着手前から壊れている**もので、#67 は 1 ビットも悪化させていない(項目4 (f) の裁定)。

⇒ **単独チケット向き**と判断した。⭐ 設計は本節がそのまま使える —
**「舞台固有の 1 行アンカー」+「(0e) 起動時アンカー検算」**の 2 点セット
(実測: `grep -c anchorAudit` は `verify_temple_fold` = 2 / `verify_dragon_fold` = 2 /
**`verify_fort_fold` = 0 / `verify_swamp_novice` = 0**)。

#### (i) やり残し / 申し送り

- ▶ **項目6(母集団の非退行 + §12 総括 + 台帳)**: 本項目で**新たに赤くなった本は 0 本**。
  触ったのは `tools/verify_dragon_fold.js`(新規)だけなので、母集団の段2「変更したファイルをコードで読む本」は
  **0 本**(項目4 と同じ事情)。段1(舞台名 `dragon-lair`)と段3(測定器のソースを読む測定器)は項目3/項目4 の
  union をそのまま使える。⭐ 新ドライバ自身を母集団へ足すこと。
- ▶ **`verify_fort_fold` / `verify_swamp_novice` のアンカー作り直し**は (h) のとおり別チケット。
  ⚠ 依頼書 §11 の「やらないこと」には無いが、#67 の範囲外(項目4 の裁定を踏襲)。
- ⭐ **ポート台帳**: `verify_dragon_fold` = **10281〜10290**。次の新規ドライバは **10301 以降**。
- ⚠ 難易度は #67 の範囲外のまま(項目3 (i) の申し送り = 4 人 PT はボス戦で全滅。
  ⭐ `?dragonfold=0` でも同じなのでラスボスの難易度そのもの)。

### 12-5. 項目6 — 母集団の非退行と総括

- **測定日**: 2026-09-16(実装窓・項目6)/ **着手直前の `HEAD`** = **`7935fb4`**(項目5b の着地)・作業ツリー clean・未 push 9 件
- **触ったファイル** = 本節 + §12-6 + `実装依頼書/README.md` の #67 行**だけ**。
  ⛔ 本番コード(`index.html` / `js/df-mapdef.js` / `tavern.html`)も `tools/*.js` も**1 バイトも触っていない** ⇒ changelog は不要。
- **比較の相手** = 項目1 が `bed11e7` で取った生ログ(`…\scratchpad\baseline67\`)。
  ⭐ 本項目の走行の前後で、凍結ファイル 5 本(`result_base67.FINAL.tsv` / `fingerprint_base67.tsv` /
  `nongreen_base67.txt` / `probe_party_size_note.txt` / `logs\probe_party_size_CUTOFF.log`)の **md5 が一致** = 基準を汚していない。
- **生ログ**: `…\scratchpad\item6\`
  - `logs\<name>.log`(140 走行の全文)/ `result_item6a.FINAL.tsv`(凍結)/ `progress_item6a.txt`
  - `population6.json` / `population6_report.txt`(母集団)
  - `compare_item6a.txt`(第 1 経路)/ `compare_b_item6a.txt`(第 2 経路)/ `prepost_item6a.md`(前後の全行表)
  - `logs\probe_party_size_CUTOFF.log` + `probe_party_size_note.txt`
  - 道具 = `pick_pop6.py` / `sweep6.py` / `analyze6.py` / `compare6.py` / `compare6b.py` / `run_party_size6.py`
- ⚠⚠ **直列 1 本ずつ**(並列にしていない)/ `timeout` で包んでいない / 走行中に本番ファイルもリポジトリも触っていない。

#### (a) 母集団の引き方と実測本数 — union **135 本**(項目1 の 134 + 新規 1)

| 段 | 引き方 | 項目1(`bed11e7`) | **項目6(`7935fb4`)** |
|---|---|---|---|
| (i) | 舞台名 `dragon-lair`(コメントを落としてから) | 36 | **37**(+`verify_dragon_fold`) |
| (参考) | 撤退スイッチの語 `dragonfold` | 0 | **5**(#67 が語を持ち込んだ 5 本だけ) |
| (ii) | #67 が実際に触ったファイルを**コードで**読む本 | 134 | **135** |
| (iii) | その測定器のソースを読む測定器 | 2 | **2**(`verify_enemy_name_label` / `verify_eol_doorfix`) |
| (iv) | 新規 `verify_dragon_fold` 自身 | — | **1** |
| | **union** | 134 | **135**(消えた本 0 / 増えたのは `verify_dragon_fold` だけ) |
| | 母集団外 | 5 | **5**(項目1 と同じ 5 本) |

(ii) の内訳 = `index.html` 127 / `tavern.html` 45 / `js/df-mapdef.js` 21 / `tools/make_grid_map.py` 4 /
`tools/driver_grid_s2.js` 2(`verify_swamp_fold` + 新規 `verify_dragon_fold`)/
`driver_graph_p6` `driver_spawn_not_on_gate` `driver_doors_p6` `verify_swamp_novice` `verify_dragon_fold` を**コードで読む本は 0**。

⭐⭐⭐ **参考行の「0 → 5」が #66 の教訓の実物。** 着手後に撤退スイッチの語で引くと
**#67 が自分で書き換えた 5 本しか返ってこない**(舞台名なら 37 本、変更ファイルを読む本なら 135 本)。
⇒ 撤退スイッチの語は「自分が触った本の一覧」であって、**非退行の母集団には原理的にならない**。

⭐ 母集団外 5 本も項目1 と同じく**念のため実走した**(5 本とも EXIT=0)。

#### (b) 走り方と所要 — **140 走行 / 205.5 分**

- 対象 = `tools/*.js` の走れる 140 本 − `probe_party_size` = **139 本** + `verify_dragon_fold --negative` = **140 走行**。
- 順序 = §8 の名指し 21 本を先頭 → 残り → **遅い 6 本を末尾**(並べ替えただけで直列)。
- **所要 205.5 分**(項目1 は 138 走行 209.4 分)。遅い 6 本 = **94.9 分** / 残り 134 走行 = **110.6 分**。

| 遅い 6 本 | 着手前 秒 | 着手後 秒 | exit |
|---|---|---|---|
| `driver_field_step6` | 1780.9 | 1647.9 | 1 → 1 |
| `probe_p9_tour` | 1654.2 | 1735.1 | 0 → 0 |
| `driver_diag_watchdog` | 623.8 | 670.0 | 0 → 0 |
| `driver_field_step0` | 615.1 | 571.8 | 0 → 0 |
| `driver_field_wagon` | 490.8 | 597.1 | 0 → 0 |
| `driver_grid_p9` | 441.0 | 470.4 | 0 → 0 |

- `probe_party_size` は**別枠で 600 秒の打ち切り実走**((f))。

#### (c) ⭐⭐⭐ 突き合わせの結果 — **緑→赤 0 本 / 新しく赤くなった判定 0 件**(2 経路とも)

**第 1 経路** = 項目1 の `analyze67.py` と**逐語で同じ抽出規則**(exit + FAIL 行の assert id の集合 + 全 assert id の列):

    本数: 着手前 138 / 着手後 140 / 共通 138
    着手後だけに在る = ['verify_dragon_fold', 'verify_dragon_fold_negative']
    ■ 緑 → 赤 : 0 本
    ■ 赤 → 緑 : 5 本
    ■ exit は同じだが FAIL 集合が動いた : 0 本
    ■ 新しく赤くなった assert id を持つ本 : 0 本
    ■ 全 assert id の列が変わった本 : 8 本 (本数が同じで中身が入れ替わる退行の検出)
    ■ 色も FAIL 集合も動かなかった本 : 133 本

**第 2 経路** = 判定行そのもの(`PASS / PASSED / OK / ok / ✅` と `FAIL / FAILED / NG / ❌` + `- (id)` 記法)を、
鍵 =「判定の後ろの本文を詳細区切りの手前で切ったもの」の**多重集合**として比べる(⚠ 第 1 経路の穴を塞ぐため = (g)):

    共通 138 本 / 判定行 合計: 着手前 PASS 6337 FAIL 36 / 着手後 PASS 6357 FAIL 22
    ■ 新しく FAIL になった判定行を持つ本 : 0 本
    ■ FAIL が消えた本 : 6 本
    ■ PASS から消え FAIL にもなっていない判定行を持つ本 : 7 本 (母集団が痩せていないかの検査)
    ■ 判定行の総数が動いた本 : 6 本

⭐ **「本数が同じで中身が入れ替わる退行」は第 2 経路では「FAIL の鍵が 1 つ増えて 1 つ減る」として出る** ——
増えた FAIL の鍵が **0** なので入れ替わりも **0**。
⭐ 「母集団が黙って痩せる退行」は「PASS の鍵が消えて FAIL にもなっていない」として出る —— 7 本を 1 本ずつ読んだ((d-4))。

#### (d) 動いた本の理由 — ⛔ 理由の分からない差は 0 件

**d-1. 赤 → 緑 5 本 — 5 本とも §12-0 (e) で着手前に判定済みのフレーク**(⛔ #67 が直したとは読まない)

| ドライバ | 着手前 | 着手後 | 着手前の判定 |
|---|---|---|---|
| `driver_monsters_griffon` | 14/17 | 17/17 | 3/5 緑 |
| `driver_monsters_kobold` | 11/12 | 12/12 | 4/5 緑 |
| `driver_speech_engine` | 16/17 | 17/17 | 3/5 緑 |
| `driver_wall_props` | 27/29 | 29/29 | 4/5 緑 |
| `verify_run_chronicle` | 71 PASSED / 2 FAILED | 73 PASSED / 0 FAILED | 7/10 緑 |

**d-2. exit は動かないが判定が 1 つ緑になった本 — `driver_field_step6` `=== 55/59 PASS ===` → `=== 56/59 PASS ===`**

    FAIL (C-bandits-forest) … entry=n7 現在=n7 訪問=0 前進=せず     (着手前と同じ)
    FAIL (C-lizard-swamp)   … entry=n4 現在=n4 訪問=0 前進=せず     (着手前と同じ)
    FAIL (C-orc-fort)       … entry=n4 現在=n4 訪問=0 前進=せず     (着手前と同じ)
    PASS (C-undead-temple)  … entry=n4 現在=n7 訪問=2 前進=277s     ← 着手前は FAIL
    PASS (C-dragon-lair)    … entry=n4 現在=n7 訪問=2 前進=249s     (項目3 (k) の 246s と同じく PASS)

- ⚠⚠ **第 1 経路には現れなかった**(id が `C-` で始まるので項目1 の規則に拾われない = (g))。第 2 経路で見つけた。
- ⭐ **観測は 3 回 = 着手前 FAIL / 項目3 FAIL / 項目6 PASS**。⇒ `(C-undead-temple)` は**観測窓に依存する型**で、
  §12-0 (c-2) が「4 本目として実在した」と書いた安定した赤ではない
  (項目3 (k) の「落ちる原因は畳んだことではなく、入口ノードを観測窓のうちに片付けられないこと」をさらに裏づけた)。
- ⭐ #67 は神殿を**動かしていない**: `git diff bed11e7..HEAD -- index.html` の追加/削除行のうち神殿に触れるのは
  **コメント 2 行だけ**。`verify_dragon_fold (8a2)` が「`hoard` キーを持つ mapDef は竜の n7 ただ 1 つ」を実測している。
  ⛔ 1 回の緑で「直った」とは書かない(項目1 の「同じ色が 2 回続くフレーク」の裏返し)。

**d-3. 全 assert id の列が動いた 8 本**

| ドライバ | id 数 | 理由 |
|---|---|---|
| `driver_graph_p6` | 213 → 214 | 項目4 が足した `(1dragonfold-dragon-lair)`(集計 249 → **250**) |
| `driver_grid_s2` | 74 → 79 | 項目4 が足した `(8u)(8u2)(8z4)(8t)(8t2)`(集計 119 → **124**) |
| `driver_spawn_not_on_gate` | 66 → 70 | 項目4 が足した `(1a2/1b2/1c2/1d2-dragon-lair)`(集計 67 → **71**) |
| `driver_mine_wall` | 63 → 63 | ⭐ **竜が `(3b)`「封鎖が効かない舞台」から `(3d)`「効く舞台」へ移った**。分岐は #62 が台帳導出へ言い直したもの(`ROOM_PAINTINGS_DEF` の `sealRing` + `blocked`)で、`(3b-z) dragon-lair` が「台帳 1 枚 / 実装 1 枚」、`(3d) dragon-lair` が 素=202 / off=296 / ring=94 を実測 = **竜の大部屋に外周封鎖が効いた正しい移動**。集計は 66/66 のまま |
| `driver_wall_props` / `verify_run_chronicle` | 31 → 29 / 73 → 71 | d-1 のフレークの FAIL 行が消えたぶん |
| `driver_field_verge_gap` | 4 → 4 | ⚠ 抽出規則が保存 PNG のバイト数 `(1568818B)` を id と誤読したノイズ(撮るたびにサイズが違う) |
| `driver_graph_run` | 94 → 94 | ⚠ 同じく所要 `(63s)` → `(49s)` を誤読したノイズ |

**d-4. PASS から消え FAIL にもなっていない鍵を持つ 7 本 — どれも「ラベルに焼いた数値・名前」が動いただけ**

| ドライバ | 何が動いたか | 判定 |
|---|---|---|
| `driver_doors_p6` | `(7a)` の「6 シナリオ」→「6 シナリオ × 腕 12 本」/ `(7i)` の「母集団 2 シナリオ / 扉 2 枚」→「**6 シナリオ / 扉 6 枚**」 | 項目4 の母集団追加(**増えた**方向) |
| `driver_spawn_not_on_gate` | `(1a-dragon-lair)` の文言が「共通骨格と一致」→「骨格の空でない真部分集合」 | 項目4 の言い直し |
| `driver_mine_wall` | d-3 のとおり `(3b)` → `(3d)` | 正しい移動 |
| `driver_mapeditor_painting` | カタログ **35 → 37 枚** / アセット名 **48 → 50 個** / options 36 → 38 がラベルに入っている | 竜の大部屋 2 枚ぶん(**増えた**方向) |
| `driver_grid_p5` | `(2b1)` 系 4 本が `ally:warrior`(6 タイル)→ `ally:dwarf`(4 タイル) | パーティ編成が実行ごとにランダム。期待値は職業ごとに導出され両方 PASS |
| `probe_s2_clear` | `run1〜3 → defeat …` の残敵数・秒数 | 実プレイの乱数(調査プローブの記録行) |
| `verify_swamp_novice` | `(4b)` の「例外表を除く **3 件**」→「**2 件**」 | ⚠ **比較テーマが 1 つ減った**(項目4 が `THEME_EXCEPTIONS` へ竜を足したため。#66 の神殿と同じ形)。`(4b2)`「例外表のテーマが実際に着手前と差分を持つ」は緑 = 古い免罪符は残っていない |

**d-5. 判定行の総数が動いた 6 本** = `driver_graph_p6` +1 / `driver_grid_s2` +5 / `driver_spawn_not_on_gate` +4(項目4 が足した)と、
`driver_speech_engine` −1 / `driver_wall_props` −2 / `verify_run_chronicle` −1(FAIL を 2 回ずつ表示していた行が消えただけ)。
⛔ **assert が減った本は 0 本**。

#### (e) 非緑 15 本 = **着手前と同じ集合**(安定して赤い 11 + 赤ではない 4)

⭐ 着手前の非緑 20 本からフレーク 5 本(d-1)を除いた 15 本と**完全一致**。集計行も FAIL 行も同じ
(唯一の差は `driver_field_step6` の d-2 で、これは緑の方向)。⛔ **どれも #67 の責任ではない。緑にしにいっていない。**

| ドライバ | exit | 着手前 | 着手後 | 型 |
|---|---|---|---|---|
| `driver_grid_p4` | 3 | 変異 `n1ringonly` のアンカー 0 箇所で起動時に即死 | 同左 | 3 |
| `driver_mapeditor` | 1 | `176/179 PASS (FAIL 3)` `§2 12b` `§3 12a` `§3 12b` | 同左 | 3 |
| `driver_mapeditor_painting` | 1 | `PASS 105 / FAIL 1` `§1 1d2` label 15 / サイズ 14 | `PASS 105 / FAIL 1` `§1 1d2` label **17** / サイズ **16** | 3 ⭐ 衝突は砦の 1 組のまま(項目2 (f) の先読みどおり) |
| `sweep_recruit_balance` | 1 | 装置崩れ 4/4 | 同左 | 3 |
| `driver_monsters_umberhulk` | 1 | `21/22 passed` `(3)` 再発火 | 同左 | 3 |
| `driver_field_step6` | 1 | `55/59` | **`56/59`** | d-2 |
| `driver_grid_p8` | 1 | `PASS 55 / FAIL 1` `(6d)` | 同左 | 3 |
| `driver_sce1_events` | 1 | `211/214 passed` `(2)(4d)(N2-隣)` | 同左 | 3 |
| `driver_speech_v2` | 1 | `45/46 passed` `(A1)` swampNovice | 同左 | 3 |
| `verify_codex_map_skill` | 1 | `16/17` `(3a)` **13 件** SHA 全件一致 / 検算 NG `stag-tavern` | `16/17` `(3a)` **15 件** SHA 全件一致 / 検算 NG `stag-tavern` | 3 ⭐ 母集団 +2(竜の 2 枚) |
| `verify_walk_block` | 1 | `22/23` `(3d)` badge 45 件 | 同左 | 3 |
| `probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map` | 3 | 引数なしの使い方ガード | 同左 | **赤ではない**(§12-0 (g)) |
| `probe_n4_stall` | 1 | 「停滞は観測されませんでした」 | 同左 | **赤ではない**(正常系) |

#### (f) 新規 `verify_dragon_fold` と `probe_party_size`

- `node tools/verify_dragon_fold.js` = **`PASS 35 / FAIL 0`**・EXIT=0・1.2 秒(項目5 の 4 回に続いて **5 回目の緑**)。
- `node tools/verify_dragon_fold.js --negative` = **`負のコントロール 9 / 9 が検出成功`**・EXIT=0・7.6 秒。
  赤くなった id は §12-4 (c) の原文と **9 本とも一致**
  (例 `nokinds 期待 ["4a"] / 赤 ["4a","4b"]` / `startdefault 期待 ["5b"] / 赤 ["2c","5b","5d"]`)。
- `probe_party_size`(600 秒で打ち切り。項目1 の `run_party_size.py` の出力先だけを替えた写しで、
  `taskkill /F /PID <pid> /T` でツリーごと落とした)= **今回も自力では終了せず**・`taskkill` 後 exit 1・`残存 node: 'なし'`。
  判定 20 本の列 `OK (0a)(0b)(0c)(3a)(3b)(3c)(1a)(1b)(1c)(1d) / NG (1e) / OK (1f) / NG (2a)(2b)(2z1)(2z2)(2z3)(2z4) / OK (2z5)(4z0)` が
  **項目1 の打ち切りログと 1 つ残らず一致**(赤い 7 本の理由も同じ = `world.html` を経由して NPC 0 人になる #23 以降の測定台の腐り)。
  ⇒ 「除外した」ではなく、**同じ打ち切り点で前後を突き合わせた**。

#### (g) ⚠⚠⚠ 測定器の穴 — **項目1 の指紋規則は判定の 48% を見ていない**

項目1 の assert id 正規表現 `\(([0-9]+[a-zA-Z][0-9a-zA-Z_\-]*)\)` は**数字で始まる id しか拾わない**。

- `(C-undead-temple)` `(E1)` `(G0)` `(A1)` のような**文字始まり**、`§0 0a` `A0-iphone_port` `0.1` のような**括弧なし**の判定は、
  前後どちらの指紋にも**原理的に現れない**。
- 実測(着手後 140 ログの判定行): **6776 本中 3266 本(48.2%)が不可視** / 判定行を持つ 129 本のうち **96 本**に不可視の判定がある /
  FAIL 行 51 本のうち **12 本**が不可視。
- 実害の実例 = d-2。`(C-undead-temple)` の FAIL → PASS は、第 1 経路では
  「exit は同じだが FAIL 集合が動いた : 0 本」と**動いていないことにされた**。⇒ **向きが逆(緑 → 赤)なら退行が見えなかった**。
- ✅ 対処 = 第 2 経路(判定行の多重集合)を併走させ、**両方で 0 件**を示した((c))。
  ⛔ 項目1 の凍結ファイルは書き換えていない(基準を後から作り直すと突き合わせの意味が消える。md5 一致を確認済み)。
- ⭐ 一般則 = **「判定トークン + id」で突き合わせるときは、id の正規表現を全ログの判定行へ当てて被覆率を先に測る。**
  集計行 1 行に賭けないのと同じ理由で、**id の書式 1 種にも賭けない**。

#### (h) ⚠⚠⚠ 崩れた主張 — **4 件**(⛔ 予測のほうを訂正した)

| 主張 | 実測 | 判定 |
|---|---|---|
| オーケストレータ「`driver_doors_p6` は**着手前 34/40** → 40/40 = 赤→緑(#67 が直した)」 | `bed11e7` の生ログは **`══ 結果: 40/40 PASS ══` EXIT=0**(§12-0 (d) の単独再走も 40/40)。34/40 は**項目3 が畳んだあとの途中の姿**で、§12-3 (c) の表も「着手前 40/40 → 項目4 が実測 34/40 → 40/40」。⇒ **緑 →(#67 が壊す)→ 赤 →(項目4 が戻す)→ 緑** = #67 全体としては**緑→緑** | **訂正** |
| 項目1 / オーケストレータ「突き合わせは判定トークン + assert id の列で行う」(= `fingerprint_base67.tsv` で足りる) | 指紋規則は判定の **48.2%** を見ていない((g))。実例 d-2 | **訂正**(第 2 経路を追加) |
| §12-0 (c-2)「`(C-undead-temple)` が **4 本目として実在した**」(安定した赤として記録) | 観測 3 回で **FAIL / FAIL / PASS**(前進 277 秒)= 観測窓依存 | **訂正** |
| オーケストレータ「`verify_dragon_fold` は素 **約 1 分** / `--negative` **約 8 分**」 | 素 **1.2 秒** / `--negative` **7.6 秒**(変異 9 本 + 素 1 本) | 訂正(軽微) |

⭐ 当たったもの: 「非緑 20 本 = 安定して赤い 11 + フレーク 5 + 赤ではない 4」は**そのまま再現**した
(フレーク 5 本が今回は全部緑に出て、残り 15 本が一致)/ 言い直した golden 5 本の数字
(`250/250` / `124/124` / `71/71` / `PASS 34 / FAIL 0` / `40/40`)は**項目4 の記録と完全一致**。

### 12-6. §12 総括 — 依頼書が崩れた点の一覧(**27 件**)と残件

⭐ #65 は 47 件 / #66 は 17 件だった。#67 は **27 件**(項目1 5 / 項目2 5 / 項目3 7 / 項目4 3 / 項目5 3 / 項目6 4)。
⛔ どれも「予測のほうを訂正した」もので、期待値を下げて合わせたものは 0 件。

#### (a) 一覧

| # | 出所 | 崩れた主張 | 実測 |
|---|---|---|---|
| 1 | §12-0 (h) | 着手前の非緑は 6 本 / 15 本。引数なしで正常に非 0 終了するプローブは 4 本 | **20 本**(安定して赤い 11 + フレーク 5 + 赤ではない 4)。正常な非 0 は 3 本 + `probe_n4_stall` |
| 2 | §12-0 (h) | `driver_field_step6` は 56/59 | **55/59**(`(C-undead-temple)` が 4 本目として出ていた。⚠ #26 で観測窓依存と判明) |
| 3 | §12-0 (h) | `verify_codex_map_skill (3a)` の母集団は 4 件 | **13 件**(#66 が神殿 2 枚を足した) |
| 4 | §12-0 (h) | `driver_doors_p2` は 33/34 で赤(#62 のメモ) | **緑**(#65 が回収済み。p5 / p8 も緑) |
| 5 | §12-0 (i) | §3「`NODES_EXPECTED` の竜を 2 へ」 | **古い**(#66 が廃止済み。足すのは `FOLD_ARM` の 1 行) |
| 6 | §12-1 (g) | §2-3 ボスの 6 数値 ph(38.15, 49.35) / T(48.425, 51.075) | 縦が外れた(drift 25.92)。採用 ph 36.90 / T 48.800 |
| 7 | §12-1 (g) | §2-3 ボスの異方性 5.33%(台帳で 2 番目に悪い) | **4.56%**(3 番目) |
| 8 | §12-1 (g) | §2-3「寝床の手前に開けた床が 2 箇所(護衛の置き場)」 | **溶岩に囲まれた孤島**。敵を置くと到達不能 |
| 9 | §12-1 (g) | §5-4「竜の寝床の手前に置く」 | 寝床そのものが**溶岩の堀で隔てられた島**。"手前" は堀の西岸 |
| 10 | §12-1 (g) | §12-0 (c-2)「`(3a)` は `stag-tavern` だけ SHA 不一致」 | **SHA は全件一致**。落ちているのは `stag-tavern` の検算 NG |
| 11 | §12-2 (d) | §6-5「`MAPDEF` から `hoard` を参照できる」 | `sanitize` が固定キーで組み直すので**消える**(4 マスとも西 45% へ落ちた) |
| 12 | §12-2 (d) | 項目2 (h-3) の財宝候補 (25,11) | **瓦礫床**で門番に弾かれ、宝箱が**黙って 3 個**になる |
| 13 | §12-2 (d) | §6-4「`hoard` を `nd()` の同じ行へ書く」 | `verify_temple_fold` の変異 `densityone` のアンカーが **0 箇所 = exit 3** |
| 14 | §12-2 (d) | 項目2 (h-4)「西群 col 7-9 / 最短 13 タイル」 | col 7-9 は溶岩原。**col 5-7 / 15.13 タイル** |
| 15 | §12-2 (d) | §2-3 目視「中央の竜鱗が開けた床」 | 溶岩の筋に囲まれて歩けない。開けた床は北西 / 南西 / 北東 / 南東 |
| 16 | §12-2 (j) | §8 の変異 `gateshift` / `startdefault` を共通骨格の行で作る | 出現 **3 / 4 箇所**で**既に使えない**(畳み 4 枚目で共通骨格の 1 行は一意にならない) |
| 17 | §12-2 (k) | §12-0 (c-2) / 項目2 (j)「竜を畳むと `(C-dragon-lair)` が 5 本目として**必ず**増える」 | **増えなかった**(246 秒で n4 → n7 へ前進) |
| 18 | §12-3 (g) | §2-6「腐るのは 3 本」/ 項目3「4 本」 | **5 本**(`driver_doors_p6` は項目3 が走らせた範囲の外) |
| 19 | §12-3 (g) | §6-6「下限 = 撤退 5 シナリオ × 8 ノード + 廃坑」 | 廃坑は golden に 1 キーも無く森は 7 件 ⇒ **39** |
| 20 | §12-3 (g) | `driver_doors_p6` ヘッダ「`nosecretroll` → (6a)」 | (6a) の母集団はドライバ側の規則から数えるので**原理的に赤くならない** |
| 21 | §12-4 (d) | §8 (8a) は「`hoard` を無条件に生やしていないことの検査でもある」 | **両立しない**(両腕の差なので等しく動く)。絶対量の **(8a2)** を新設 |
| 22 | §12-4 (d) | §8「`hoardwide` → (3b)(3c)(3d)」 | **(3d) は赤くならない**(ミミックが入場から 489.5px = 半径の 2.45 倍) |
| 23 | §12-4 (h) | 項目4 (f)「竜で解いた形を `verify_fort_fold` / `verify_swamp_novice` へ横展開するのが一番安い」 | 前提が 2 つ崩れた(`verify_fort_fold` は `addn6` も同じアンカーで死んでいる / `addn6` は 1 行アンカーでは書き換えられない)⇒ 単独チケット |
| 24 | §12-5 (h) | オーケストレータ「`driver_doors_p6` は着手前 34/40」 | 着手前は **40/40**(34/40 は項目3 のあとの途中の姿) |
| 25 | §12-5 (h) | 「判定トークン + assert id の列」(項目1 の指紋)で足りる | **判定の 48.2% が不可視** |
| 26 | §12-5 (h) | §12-0 (c-2)「`(C-undead-temple)` は 4 本目として実在」 | 観測 3 回で **FAIL / FAIL / PASS** |
| 27 | §12-5 (h) | 「`verify_dragon_fold` は素 約 1 分 / `--negative` 約 8 分」 | **1.2 秒 / 7.6 秒** |

#### (b) 数字でみる #67

| 項目 | 値 |
|---|---|
| 畳み | 竜の巣 **8 ノード → 2 ノード**(n4 溶岩の谷 31x20 / n7 竜の寝床 30x19)= 旧タイプ MAP 全廃 **F4 = 最後の 1 枚** |
| 撤退スイッチ | `?dragonfold=0` |
| 受入 `verify_dragon_fold`(base **10281** / 変異 10282〜10290) | 素 **35/35**(5 回)/ `--negative` **9/9 空振り 0**(2 回) |
| 言い直した既存 golden | **5 本** — `driver_graph_p6` 250/250 / `driver_grid_s2` 124/124 / `driver_spawn_not_on_gate` 71/71 / `verify_swamp_novice` PASS 34 / FAIL 0 / `driver_doors_p6` 40/40。⛔ 期待値を下げた箇所 0 / golden の焼き直し 0 / assert が減った本 0 |
| 母集団 | union **135 本** + 母集団外 5 = 140 本 → **140 走行 / 205.5 分** + `probe_party_size` 600 秒打ち切り |
| 非退行 | **緑→赤 0 本 / 新しく赤くなった判定 0 件**(2 経路)/ 赤→緑 5(着手前フレーク)/ 非緑 15 = 着手前と同じ集合 |
| 依頼書が崩れた点 | **27 件** |

#### (c) 残件 1 — 実機/実感の確認(§9)⛔ 本チケットでは 1 つもしていない(ユーザーの領分)

⚠ ローカルは **http 起動が必須**(`file://` だとナレーション音声が無音)。

1. 溶岩の谷を西から東まで歩いて、横断路が 1 マスも切れていないこと
2. 骨の谷の 10 体が **2 群**に分かれて襲ってくること(`verify_dragon_fold (2e)` の実測 = 群 [5,5] / 群間 **15.13 タイル** > `DETECTION_RANGE` 12.5)
3. 竜の寝床の手前に宝箱が固まって並んで見え、1 つがミミックだと分からないこと
4. 入場した瞬間にミミックが起動しないこと(実測距離 1452.7px = `MIMIC_APPROACH_RADIUS` の 7.26 倍)
5. ボス部屋へ入る演出で、左辺から出てくるのが不自然に見えないこと(§5-3 の判断の答え合わせ)
6. iPhone 縦(390x844)で大部屋のカメラが破綻しないこと(⚠ `[compact-hero-anchor]` の救済節は触っていない)

⭐ あわせて見てほしいもの = **4 人 PT でボス戦を最後まで**(§12-2 (h): 素の autoplay は**全滅**。ただし `?dragonfold=0` でも同じ = ラスボスの難易度そのもの)。

#### (d) 残件 2 — 別チケット送り

- ▶ **難易度・XP の再調整**(4 人 PT はボス戦で全滅 = 両腕とも)+ 測定台 `sweep_recruit_balance`(装置崩れ 4/4)/
  `probe_party_size`(終了しない・NPC 0 人)の**修理を内包する**
- ▶ `verify_fort_fold`(`addn6` + `gateshift`)/ `verify_swamp_novice`(`nostart` 以降 13 本)の**変異アンカー作り直し** ——
  設計は §12-4 (h) の「舞台固有の 1 行アンカー + (0e) 起動時アンカー検算」
- ▶ `driver_doors_p6 (6a)` に**変異が無い**(`?secret=0` が効かなくなる欠陥を撃つ腕が無い)—— §12-3 (e)
- ▶ `git worktree list` の**旧 baseline 10 本の掃除**(`.gitattributes` を持たない古い hash。⛔ 測定台に使わない)
- ▶ **着手前から安定して赤い 11 本**(⛔ どれも #67 の責任ではない): `driver_grid_p4`(アンカー腐敗)/ `driver_mapeditor` 3 本 /
  `driver_mapeditor_painting (§1 1d2)` / `sweep_recruit_balance` / `driver_monsters_umberhulk (3)` / `driver_grid_p8 (6d)` /
  `driver_sce1_events` / `driver_speech_v2 (A1)` / `verify_codex_map_skill (3a)` / `verify_walk_block (3d)` / `driver_field_step6 (C-*)`
- ▶ **次の非退行の道具**: 判定行の第 2 経路(`compare6b.py` の形)を最初から併走させる(§12-5 (g))
- ⭐ `driver_mine_wall (3b2)` の「封鎖が効かない舞台」の腕が **2 本 → 1 本(`graph0` だけ)**に痩せた。
  F4 が最後の畳みなのでこれ以上は減らないが、`?graph=0` の単一マップを消す日には `(3b2)` が赤くなる(= 母集団ガードが正しく鳴る)
- ⛔ §11 のまま: n5「冷えた溶岩溜まり」の rest の復活 / `spawnDragonHoard` の西 45% 規則の削除 / ミミックの強さ・演出・台詞 /
  ボスの絵の描き足し / 既存の撤退スイッチの削除

#### (e) ⭐ #67 から持ち帰る恒久教訓(どれも本チケットで実測したもの)

1. ⭐⭐⭐ **撤退スイッチの語で母集団を引くと、着手前は 0 本・着手後は「自分が触った本」だけが返る**(0 → 5)。舞台名は 37 本、変更ファイルを読む本は 135 本。
2. ⭐⭐⭐ **「前の項目が数えた本数」も信じない** —— 腐る golden は依頼書 3 → 項目3 4 → 実測 **5**(§12-3 (b))。
3. ⭐⭐⭐ **絵の目視所見は焼くまで確定しない** —— 「護衛の置き場」2 箇所も竜の寝床も溶岩に囲まれた島だった(§12-1 (g))。
4. ⭐⭐⭐ **同じ色が 2 回続くフレークが実在する** / **状況証拠 3 つでも仮説は棄却されうる**(Fisher p=0.51。途中 2/5 では p=0.17)(§12-0 (e)(e2))。
5. ⭐⭐⭐ **恒等 assert(両腕の差)は「無条件に載せる」型の欠陥を捕まえない** ⇒ 絶対量を別に置く(§12-4 (d))。
6. ⭐⭐⭐ **突き合わせの id 正規表現も被覆率を測る** —— 項目1 の規則は判定の 48% を見ていなかった(§12-5 (g))。
7. ⭐⭐ **畳み系の新規ドライバには起動時アンカー検算 (0e) を必ず持たせる**(無いと「素は緑・`--negative` だけ exit 3」が何チケットも生き延びる)。
