# #44 敵の頭上にも名前札を出す / 札を 70% へ

- **起草**: 2026-09-03(計画窓) / **ステータス**: **承認済**(2026-09-03 ユーザー承認)
  > 「承認します。窓更新後進めてください。」
- **触るファイル**: `index.html` / `tools/verify_enemy_name_label.js`(新規) /
  `tools/driver_cast_circle.js`(**1 語だけ**・§5-5 参照) / `tavern.html`(changelog 1 行) /
  `実装依頼書/README.md`(#44 行)
- ⛔ **触らないファイル**: `world.html` / `js/world-map.js` / `tools/verify_world_heromark.js`
  — 隣窓の #43「ワールドマップでも主人公の頭上に ▽ を出す」の領分。**#43 は着地済み**だが、
  本チケットはこれらを**一度も開かずに完了できる**(§2-6 で確認済み)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- **着手**: ✅ **可**(2026-09-03)。2 つあった条件は**両方解消**:
  ① 「隣窓の実装完了」(> 「実装自体は、となりの窓の実装が終わってからにしたい。」)
     → #43 が `8e66fa6` で push 完了。
  ② ユーザー承認 → 上記のとおり取得。
  ⚠ **着手は窓更新後の新しい窓**で行う(ユーザー指示「窓更新後進めてください」)。
  ⚠⚠ 着手時にもう一度 `git pull` / `git status` / §8 の既存 golden 4 本の素の値を取り直すこと
  (§2-11(d): 行番号は同日・同 HEAD でも 2 件ずれた実績がある)。
- **並走**: **2026-09-03 更新** — `HEAD = origin/main = 8e66fa6`(隣窓 #43 完了)。
  `git status --short` の未追跡は**本依頼書 1 件のみ**(隣窓は一度も `add` していないと明言し、
  こちらの `git status` でも untracked のままであることを確認)。
  隣窓が触った全ファイルを `git diff --name-only c1c85e0..HEAD` で実測 →
  **`world.html` / `tools/verify_world_heromark.js` / 依頼書 2 件の 4 つだけ**。
  ⭐ **本チケットが触る `index.html` / `tavern.html` / `tools/driver_cast_circle.js` は 0 バイト**
  (`git diff --stat c1c85e0..HEAD -- index.html tavern.html tools/driver_cast_circle.js` が空)。
  ⚠ 着手時にもう一度 `git status` を見ること。

---

## 1. 目的

ダンジョン(`index.html`)では、**味方だけ**が頭上に名前札を持っている
(`#warriorLabel` = 主人公 / `.allyLabel` = NPC 仲間)。
敵には札が無く、頭上にあるのは **HP バー / 装備バッジ(絵文字) / 状態アイコン列**だけ。
「今戦っているのがゴブリンなのかホブゴブリンなのか」が絵だけの判断になっている。

同時に、その札は**引き(ズーム)で縮まない設計**(`index.html:4106` に明記)。
`ZOOM_MIN = 0.25` まで引くと **キャラ 96px → 24px** になる一方、札は高さ 20px のまま残る。
実測で札の幅は中央値 72px・最大 191.2px あり、**66px のゴブリンの 2.9 倍**。これが
「大きく感じる」の正体。

**ユーザー原文(2026-09-03)**:

> ゴブリン、ホブゴブリンなど、敵の頭の上にも、名前入りの札つけてほしい。
> 現状のプレイヤーキャラのものと同様に札を付けてほしい。
> 合わせて、、現状の７割くらいまで大きさ落としてほしい。今は大きくかんじる。

**ユーザー決定(2026-09-03)**:

- **70% の適用範囲 = 名前札だけ**。HP バー(52x8) と装備バッジ(font 22px) と状態アイコン列は
  **寸法を 1px も変えない**。
- ⭐ 不採用にした案「頭上 UI 一式を 70%」——
  `placeUnscaledUi` の呼び口 9 箇所と `hpBarOffX = (displaySize - 52)/2` の恒等式
  (`index.html:4107` に「実測: 味方 18+30=48 / 敵 (S-52)/2+26=S/2」と記録されている)を
  全部導出し直すことになり、既存 golden 4 本への影響範囲が広すぎる。
- ⭐ 不採用にした案「装備バッジを札の中へ前置きして 2 段にまとめる」——
  頭上 UI の全高が 46px → 27px になり「大きく感じる」への効き目は最大だが、
  **バッジの見え方を変える**ので上のユーザー決定に反する。§11 に別チケット候補として置く。

**⭐ 起草前実測で分かったこと**

- 「敵が大きく感じる」ではない。ユーザーが名指しした **ゴブリン = 66px / ホブゴブリン = 74px** は
  どちらも**主人公スプライト 96px より小さい**(§2-3)。**大きいのは札**。
  → 敵の `displaySize` は 1 つも触らない。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 敵の頭上 DOM は「添字並列の配列 10 本」で回っている。札を足すと **11 本目**になる

`createEnemyDom` が push する配列は 10 本。最も近い前例 = `enemyStatusElements`
(状態アイコン列)は、リポジトリ全文 grep で **7 箇所 + テスト 1 箇所**に現れる。
**札を足すときに触るのはこの 8 箇所と同じ場所**。

| ファイル:行 | 何 |
|---|---|
| `index.html:11534` | 宣言 `const enemyStatusElements = [];` — コメントが **「敵は名前ラベルが無いので HP バーの上に列を置く」**。本チケットでこの前提が消える |
| `index.html:11571` | `createEnemyDom` 内で `push` |
| `index.html:15044` | **ハイドラ封印中**の hide(`return` で以降スキップ) |
| `index.html:15062` | **伏兵化フォグ**(未視認 idle)の hide(`return` で以降スキップ) |
| `index.html:15084` | 生存時の show + `placeUnscaledUi(..., hpBarOffX, -27)` |
| `index.html:15103` | 死亡時(`else` 枝)の hide |
| `index.html:32998` | `clearNodeArrays()` の `length = 0`(コメントに **「DOM 配列 10 本」**) |
| `tools/driver_cast_circle.js:402` | フィクスチャ撤去ループ(**10 本を splice + remove**) |

**再測定コマンド**:

    grep -rn "enemyStatusElements" index.html tools/*.js

⭐⭐⭐ **「敵の札を足す = createEnemyDom に 1 行」ではない。表示を消す枝が 3 本ある**
(封印ハイドラ / 伏兵化フォグ / 死亡)。どれか 1 本でも忘れると
「倒した敵の名前が床に残る」「フォグの中の敵の名前だけ見える(伏兵が丸見え)」になる。

### 2-2. ⚠⚠⚠ 罠A — 配列を 11 本にすると、既存 golden `driver_cast_circle.js` が**黙って取りこぼす**

`tools/driver_cast_circle.js:395-408` はフィクスチャの敵を撤去するとき、
**10 本の配列名を逐語で並べて** `splice` + `remove()` している。
その直後の検算は

    check('6.11 フィクスチャ撤去後も enemies と enemyElements の長さが一致', torn === true)

で、**比べているのは `enemies.length === enemyElements.length` の 2 本だけ**。
11 本目(札)を足しても**このチェックは緑のまま**で、札の DOM だけが画面に残る。

→ 本チケットは `tools/driver_cast_circle.js:402` の配列リストへ `enemyLabelElements` を
**1 語だけ**足す。⛔ 期待値(53/53)は 1 つも変えない。
⭐ この罠は §8 の変異 `noteardown` として機械で検査する。

### 2-3. 「大きく感じる」の対象は札で確定(敵スプライトではない)

| 対象 | 実測 `displaySize` | 主人公 96px との比 |
|---|---|---|
| ゴブリン(ユーザーが名指し) | **66** | 0.69 倍 |
| ホブゴブリン(ユーザーが名指し) | **74** | 0.77 倍 |
| コボルド | 56 | 0.58 倍 |
| オーク | 82 | 0.85 倍 |
| リザードマン戦士 | 88 | 0.92 倍 |

敵 46 種のうち **`displaySize < 96` が 25 種 / `>= 96` が 10 種**(残りは可変)。
ユーザーが名指しした 2 種はどちらも主人公より**小さい**。

**再測定コマンド**:

    grep -on "displaySize: *[0-9]*" index.html | sed 's/.*displaySize: *//' | sort -n | uniq -c

### 2-4. 頭上 UI の箱を実測した(計算値ではなく Chrome の `getBoundingClientRect`)

`index.html` から CSS ブロックを切り出して実 Chrome で描いた実測値:

| 要素 | 実測 w x h | 現在の `dy` | 占める帯(スプライト上端基準) |
|---|---|---|---|
| 名前札 現状(font 11px, 「ホブゴブリン」) | **83 x 20** | -28(味方) | -28 .. -8 |
| 名前札 **70%**(font 7.7px) | **58.7 x 14.4** | 同上 | -28 .. -13.6 |
| `.enemyBadge`(🛡 font 22px) | **34 x 28** | -46 | -46 .. -18 |
| `.enemy-status-slot`(状態 2 個) | **43 x 15.6** | -27 | -27 .. -11.4 |
| `.enemyHpBar` | **54 x 10** | -10 | -10 .. 0 |
| `.allyHpBar` | **62 x 10** | -10 | -10 .. 0 |

**70% の検算**: 高さ 20 → 14.4 = **72.0%** / 幅 83 → 58.7 = **70.7%**。
文字幅は `letter-spacing` の分だけ高さより縮みが素直なので、**「7 割くらい」として採用する**。

**基準の再現も取れている**(既存ドライバのコメントを自分で測り直した):
`tools/driver_grid_p7.js:581-583` に

> 「ラベルの下端がバーの上端より上」という素朴な期待値は **camZ=1 でも成り立たない**
> (実測: plain でも 2px 食い込む = 元からの見た目)

とある。上の表で味方は 札 -28..**-8** / HP バー **-10**..0 = **2px 食い込む**。**一致した**。
⭐ 70% にすると 札 -28..**-13.6** になり、この 2px の食い込みは**自然に解消される**
(副次的な改善。⛔ これを目的にはしない)。

**計測スクリプト**(再測定するとき。⚠ Bash ヒアドキュメントは `\\` を 1 段落とすので Write ツールで置く):

    // index.html から .allyLabel / .allyHpBar / .enemyHpBar / .enemyBadge /
    // .enemy-status-slot / .status-badge / .status-slot の CSS ブロックを indexOf で切り出し、
    // 実 Chrome (puppeteer-core + tools/_pptr_profile.js) に描いて
    // getBoundingClientRect を読むだけ。ファイルへの書き込みは無し。
    node <scratchpad>/measure_stack.js

### 2-5. ⚠⚠⚠ 罠B — 敵の札を置ける高さは **-27 しか空いていない**。バッジと必ずぶつかる

§2-4 の帯を並べると、敵の頭上は既に埋まっている:

    バッジ         -46 .. -18   (34 x 28)
    状態アイコン列  -27 .. -11.4 (43 x 15.6)
    HP バー        -10 ..   0   (54 x 10)

⭐ **既存の実装で、バッジと状態アイコン列は `-27 .. -18` の 9px が既に重なっている**
(状態異常が付いている敵に限り、目に見える)。これは今回作った欠陥ではなく**元からある**。

70% の札(高さ 14.4)を味方と同じ `-27` へ置くと 札 = `-27 .. -12.6`。
バッジ(`-46 .. -18`)と **`-27 .. -18` の 9px が重なる**。

**だから採る形(§4〜§6)**:

1. 敵の札を **`-27`** に置く(= 今の状態アイコン列の位置)。
2. 状態アイコン列を**札の子へ入れる**(= 味方と完全に同じ作法。`index.html:12747-12752` が前例)。
   → `updateStatusSlot` は `refreshStatusIcons` で `innerHTML` を書くだけで**位置を触らない**
   (`index.html` の `function updateStatusSlot` を読んで確認済み)ので、親を替えても動く。
3. **装備バッジの `dy` を -46 → -58 に上げる**(バッジ = `-58 .. -30`、札の上に 3px の隙間)。
   ⭐ これで**既存の 9px の重なりも同時に消える**。
   ⛔ バッジの**寸法(34x28)は 1px も変えない**(ユーザー決定)。

結果の帯:

    バッジ         -58 .. -30   (寸法そのまま。位置だけ上げた)
    名前札+状態     -27 .. -12.6 (新規。味方と同じ 2 段構成)
    HP バー        -10 ..   0   (1px も動かさない)

頭上 UI の全高は 46px → 58px(+12px)。⚠ これは**バッジを持つ 40/46 種**のときだけで、
バッジ無しの 6 種は 27px に収まる。

### 2-6. ⛔ 隣窓 #43 と 1 バイトも重ならないことの確認

隣窓の `実装依頼書/2026-09-03_world-heromark.md` を開いて読んだ結果:

- 相手の **触るファイル** = `world.html` / `tools/verify_world_heromark.js`(新規) / `README.md`
- 相手の **⛔ 触らないファイル**に **`index.html` が名指しで入っている**(相手のヘッダ 5 行目)
- 相手が `index.html:914-928` 等を引用しているのは **▽ の CSS を world.html へ写すための読み取り**
  だけで、書き込みの宣言は無い

→ 本チケットが書く `index.html` の箇所(`.allyLabel` 283 / `.enemyBadge` 2375 /
`createEnemyDom` 11536 / 描画 15025-15145 / `clearNodeArrays` 32993)は、
相手が読む箇所(`#heroMark` 914-929 / 3036 / 6202-6248)と**重ならない**。
⚠ ただし **同じファイル**なので、`git add index.html` の前に必ず
`git diff --cached index.html` を読むこと(ファイル単位 add でも相手の hunk は巻き込む)。

⭐ **番号の取り合いは交渉なしで解決した。** 隣窓が先に `2026-09-03_world-heromark.md` を
起草して #43 を名乗っていたので、**相手の依頼書を開いて読みに行き**、本チケットを #44 にした。

**2026-09-03 追記 — 隣窓の #43 は着地済み(`8e66fa6`)**。相手からの完了通知の主張を
`git` で検算した結果、**すべて一致**:

| 相手の主張 | こちらの検算 | 結果 |
|---|---|---|
| 「触ったのは `world.html` +63 行と新規ドライバだけ」 | `git diff --name-only c1c85e0..HEAD` | `world.html` / `tools/verify_world_heromark.js` / 依頼書 2 件 の **4 つだけ** ✅ |
| 「`index.html` は触っていない」 | `git diff --stat c1c85e0..HEAD -- index.html tavern.html tools/driver_cast_circle.js` | **空 = 0 バイト** ✅ |
| 「あなたの依頼書は一度も `add` していない」 | `git status --short` | `?? 実装依頼書/2026-09-03_enemy-name-label.md` のまま ✅ |
| 「`world.html` は解放した」 | — | 本チケットは元から開かない ⛔ |

⚠ 相手は `world.html` の**行番号が下へずれた**(`.worldSign` 325→353 等)と報告しているが、
本チケットはそのファイルを開かないので影響なし。

### 2-7. ⚠ 罠C — `.heroLabel` は **CSS が 1 行も無い**(死んだクラス)

`index.html:12746` は

    label.className = "allyLabel" + (ally.isHero ? " heroLabel" : "");

と書くが、`grep -c "\.heroLabel" index.html` = **0**。主人公 ally の見分けは
2 行下の `label.style.color = "#e0b43c"` (インライン)だけが担っている。
⛔ **本チケットで直さない**(直すと「主人公の札の色」が変わり、ユーザーが頼んでいない見た目が動く)。
⚠ ただし敵の札の色を CSS クラスで足すとき、**同じ轍を踏まない**こと
(= `.enemyLabel` の CSS を必ず書く。書き忘れても札は出るので、目視では気づけない)。
→ §8 の (2d) が「敵の札の背景色が味方と違うこと」を機械で見る。

### 2-8. 敵 46 種はすべて `name` を持っている(欠けは 0)

`ENEMY_TYPES`(`index.html:8689-9869`)の **46 種すべてに `name:` がある**。
最長は `レッドドラゴン「ファラクサス」`(15 文字 / 札幅 191.2px → 70% で 134.5px)、
次が `ゴブリンキング「グリクス」`(13 文字 / 166.9 → 117.4px)。中央値は 5 文字。

`def.name` は既に戦闘ログが使っている語彙(`index.html:15603` 「${def.name} は残影で攻撃をかわした!」
ほか多数)。**札とログで同じ名前が出る**。

⭐ **ミミック(偽宝箱)の心配は要らない**。`index.html:9569-9591` のコメントどおり
「宝箱に擬態 → 接近 or 盗賊察知で**起動して敵スポーン**」なので、正体を現すまで
`enemies` に居ない。加えて伏兵化フォグ(§2-1)が未視認 idle の敵を丸ごと隠すので、
**札が伏兵の位置を漏らすことも無い**(受入条件 (1c) で機械検査する)。

### 2-9. 撤退スイッチの名前は空いている

`grep -c "namelabel" index.html` = **0**。既存の撤退スイッチは
`?doors=0` `?heromark=0` `?darkvision=0` `?field=0` 等の形で、
`new URLSearchParams(location.search).get("<key>") === "0"` が house style
(`index.html:4696` 等)。

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`
を読んだ結果 → **鳴る**(`index.html` を触る)。

**書けるプレイヤー向けの要約は実在する**:

> `<li><b>敵の頭の上にも名前の札が出るようになった</b> — ゴブリンかホブゴブリンか、名前で見分けが付く。合わせて札を一回り小さくした。</li>`

### 2-11. ⭐⭐⭐ 隣窓 #43 から引き継いだ知見(2026-09-03。本チケットへ翻訳済み)

⚠ 行頭に `#43` と書くと Markdown が見出しに化けるので、以下では「隣窓の #43」と書く。
隣窓が #43 完了時に渡してきた 3 点を、そのまま鵜呑みにせず**本番コードで測り直した**結果:

**(a) 「計算した箱しか見ていない assert は、DOM の飾りに永久に気づかない」**

隣窓の実例 = `verify_world_map` の (7f)「駒が札を 10% 以上隠さない」は `heroGeom()` から
計算した 96px の箱しか見ておらず、DOM を一切見ていない。だから主人公に ▽ を足しても
気づかない。

**本チケットでの同型**: `grep -rln "displaySize" tools/*.js` = **20 本以上**。
既存ドライバは敵の箱を `displaySize` から計算しており、**名前札は `displaySize` の箱の外**
(スプライト上端の -27..-12.6)に出る。
⭐⭐⭐ **つまり「札が既存の何かを壊していない」は、既存 golden 4 本では原理的に担保できない。**
担保するのは新ドライバ側の (1f)(1h)(3a)(3b) が **DOM 矩形**で測ることだけ。
→ §8 に **(0g)** を新設し、「ドライバが `displaySize` から箱を計算していない」ことを検査する。

**(b) 「pointer-events の変異は、その要素が測定点と実際に重なるときにしか欠陥にならない」**

隣窓は `pointer-events: none → auto` の変異が**空振り**した(▽ が当たり判定箱と原理的に
交差しない位置に浮いていた)ので、#38 の作法どおり**変異のほうを直した**。

**本チケットでの実測結果 — この型の変異は最初から作らない**:

    grep -c "elementFromPoint" index.html     → 0
    grep -n "addEventListener(\"click\"" index.html → 16568 = document への 1 本

ダンジョンの遊びのクリックは **`document` に張られた 1 本**で、`e.clientX/clientY` を
`WX()/WY()` で世界座標へ直して `openChestAt()` を呼ぶだけ。**`elementFromPoint` は 0 件**、
札に `stopPropagation` も付けない。
⭐ よって **`.enemyLabel` に `pointer-events` が何であってもクリックは通る**
(#41 で街の `.npcUnit` が `#tavernViewport` のハンドラを `stopPropagation` で
奪った構図とは**受け口の張り先が違う**)。
→ §8 の「⛔ 測らないこと」に**理由付きで**書く。⛔ 空振りする `pointerauto` 変異は作らない。

**(c) 「値を測って detail に出している」のと「判定している」のは別**

素のアームで自明に真になる assert は、**緑と『そもそも判定していない』が見分けられない**。
→ §8 の全 assert は「素で真 / 変異で偽」の**対**が表に書かれているものだけを採用した。
表に対の無い assert は書かない。

**(e) ⭐⭐⭐ 「宣言された穴」と「気づいていない穴」は別物 — 比の assert には絶対量を 1 本添える**

こちらが隣窓へ「相対比較の assert は**両方同じだけ壊れる変更**を検出できない」と返したところ、
隣窓は自分の (0b) にも同じ穴があることを認めたうえで、**それは意図して宣言した穴**だと返してきた
(依頼書の「⛔ 測らないこと」に「▽ の大きさは実機で調整する」と明記し、§9 に
「CSS と JS を**必ず同時に**動かす」と手順まで書いてある)。

**本チケットの (2a)(2b) にも同じ穴がある**。あれは「素 ÷ `?namelabel=0`」の**比**なので、
`.allyLabel` の素の `font-size: 11px` と `body.labelSmall` の `7.7px` を**同率で膨らませる**と
比 0.70 のまま札だけが大きくなり、**緑のまま通る**。

⭐ そして本チケットが依存する既存 golden の穴は**「気づいていない穴」の側**:
`driver_grid_p7` の (4c)(4f) は「ズーム時 vs 素」の相対比較、
`driver_heromark_signplate` は `labelTop`(上端)のみ。**誰も「札の大きさは測らない」と宣言していない**。

→ **絶対量を 1 本足す**。隣窓の (0b)「実描画の矩形 × JS の定数」の 2 経路をこちらの語彙へ翻訳:

| 経路 | 源 | |
|---|---|---|
| ① 札の高さ | `.enemyLabel` の `getBoundingClientRect().height` | **CSS 由来** |
| ② スプライトの高さ | `.enemy` の `getBoundingClientRect().height` | **`def.displaySize` 由来 = ゲームデータ** |

⭐⭐⭐ **この 2 つは完全に独立した源**。CSS を丸ごと膨らませてもスプライトは 1px も動かないので、
「両方同じだけ壊れる」が原理的に起きない。しかもこの比こそ、ユーザーが訴えた
「**札がゴブリン(66px)の 2.9 倍で大きく感じる**」そのものの量。
→ §8 に **(2f)**(比の上限)と母集団ガード **(0h)**、変異 `bothgrow` を新設した。

**(d) ⚠ 起草時の行番号は同日・同 HEAD でも 2 件ずれた**(隣窓の実測)。
→ 本依頼書の行番号も**着手時に必ず取り直す**。⭐ 座標でなく**構造**(件数・集約点)で書いた
箇所(§2-1 の「7 箇所 + テスト 1 箇所」/ §2-5 の帯)は着地をまたいで生き残る。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `body.labelSmall` 配下に 70% の上書きを追加 / `.enemyLabel` CSS 新設 / `enemyLabelElements` 配列 1 本 / `createEnemyDom` で札生成 + 状態アイコン列の再親付け / 描画の 4 点(封印・フォグ・生存・死亡) / バッジ `dy` -46 → -58 / `clearNodeArrays` / 撤退 `NAME_LABEL_ON` / 検証シーム |
| `tools/verify_enemy_name_label.js` | **新規**。§8 の受入条件 + `--negative` |
| `tools/driver_cast_circle.js` | **1 語だけ**。402 行の配列リストへ `enemyLabelElements` を追加。⛔ 期待値(53/53)は変えない |
| `tavern.html` | changelog 1 行(`py tools/add_changelog.py`) |
| `実装依頼書/README.md` | #44 行(⛔ 隣窓 #43 着地後) |

⛔ **`world.html` / `js/world-map.js` は開かない**。§2-6 で確認済み。

---

## 4. STEP1 — 札を 70% にする(味方・主人公。敵はまだ無い)

`index.html:283-297` の `.allyLabel` は**触らない**。house style
(`index.html:6716` 「camZ===1 では class も変数も付けない = 既存の見た目が 1px も動かない」)に
倣い、**`body.labelSmall` が付いたときだけ**効く上書きを足す。

```css
    /* #44: 名前札を 70% へ。⭐ 素の .allyLabel は 1 行も触らない —
       body.labelSmall が付かない状態 (= ?namelabel=0) が「従来の見た目」の定義になる。
       実測 (2026-09-03, 実 Chrome の getBoundingClientRect / 文字は「ホブゴブリン」):
         font 11px   → 83 x 20px
         font 7.7px  → 58.7 x 14.4px   = 幅 70.7% / 高さ 72.0%
       ⚠ padding / letter-spacing / border も同率で落とさないと 7 割にならない
         (font だけ落とすと高さが 17.4px = 87% にしかならない)。 */
    body.labelSmall .allyLabel {
      font-size: 7.7px;
      letter-spacing: 0.7px;
      padding: 0.7px 3.5px;
      border-width: 0.7px;
    }
```

ブート時に 1 回だけ付ける(`?namelabel=0` なら付けない):

```js
    /* #44 撤退スイッチ。⚠ index.html 単独で完結する (ページ遷移をまたがない)。
       OFF のとき: 札は 100% のまま / 敵の札は 1 枚も作らない /
                   状態アイコン列は従来どおり独立配置 (-27) / バッジは -46。 */
    const NAME_LABEL_ON =
      new URLSearchParams(window.location.search).get("namelabel") !== "0";
    if (NAME_LABEL_ON) document.body.classList.add("labelSmall");
```

⛔ **`placeUnscaledUi` の `dy` は 1px も動かさない**
(`index.html:14994` の `-28` / `15174` の `-28` / `14992`・`15162` の `-10`)。
札の `top` は `dy` が決めるので、縮んでも**上端は動かない**
= `tools/driver_heromark_signplate.js` が見ている `labelTop` が不変になる(§8 の非退行)。

---

## 5. STEP2 — 敵の名前札を足す(11 本目の並列配列)

### 5-1. CSS

```css
    /* #44: 敵の名前札。味方 (.allyLabel) と同じ幾何・同じ 70%。
       ⚠ 色だけ敵側の語彙へ寄せる (HP バーの塗りが #ff5f6d→#ffc371 の暖色なので、
         札も暖色の縁で「敵の物」と分かるようにする)。
       ⚠⚠ .heroLabel は className に書かれているのに CSS が 0 行という前例がある
         (§2-7)。ここは必ず実体を書くこと — 書き忘れても札は出るので目視では気づけない。 */
    .enemyLabel {
      position: absolute;
      font-family: 'Times New Roman', serif;
      font-size: 11px;
      letter-spacing: 1px;
      color: #ffe0d8;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.8);
      z-index: 7;
      pointer-events: none;
      background: rgba(56,20,20,0.55);
      padding: 1px 5px;
      border-radius: 2px;
      border: 1px solid rgba(255,190,170,0.32);
      white-space: nowrap;
    }
    body.labelSmall .enemyLabel {
      font-size: 7.7px;
      letter-spacing: 0.7px;
      padding: 0.7px 3.5px;
      border-width: 0.7px;
    }
```

### 5-2. 配列(11 本目)と生成

`index.html:11525-11534` の並びの末尾へ:

```js
    const enemyLabelElements  = [];   // #44: 敵の名前札。⚠ 状態アイコン列はこの中の子になる
```

⚠ `index.html:11534` の既存コメント
「`status-effect v1.1: 敵は名前ラベルが無いので HP バーの上に列を置く`」は**嘘になる**ので
書き換えること(前提を書いた本人のコメントを残すと次の窓が誤読する)。

`createEnemyDom`(`index.html:11568-11571` の状態アイコン列を作っている所)を差し替え:

```js
      // status-effect v1.1: 状態アイコン列
      const st = document.createElement("div");
      st.id = "enemyStatus" + index;
      if (NAME_LABEL_ON) {
        /* #44: 味方 (index.html:12747-12752) と同じ作法 — 名前札の中へ入れる。
           ⭐ updateStatusSlot は refreshStatusIcons で innerHTML を書くだけで
             位置を触らないので、親を替えても従来どおり動く (実測で確認済み)。 */
        st.className = "status-slot";
        const lb = document.createElement("div");
        lb.className = "enemyLabel";
        lb.id = "enemyLabel" + index;
        const nameSpan = document.createElement("span");
        nameSpan.textContent = def.name || "";      // ⭐ 表を写経しない。def から引く
        lb.appendChild(nameSpan);
        lb.appendChild(st);
        enemyLayer.appendChild(lb);
        enemyLabelElements.push(lb);
      } else {
        st.className = "enemy-status-slot";          // 従来どおり独立配置
        enemyLayer.appendChild(st);
        enemyLabelElements.push(null);               // ⚠ 添字並列を崩さないため null を積む
      }
      enemyStatusElements.push(st);
```

⚠⚠⚠ **`enemyLabelElements.push(null)` を忘れないこと。**
撤退時に push を丸ごと飛ばすと**添字がずれ**、`enemyLabelElements[index]` が
別の敵の札を指す(= `?namelabel=0` のときだけ全部の頭上がおかしくなる、という
最も見つけにくい壊れ方になる)。

### 5-3. 描画(4 点。§2-1 の表の 15044 / 15062 / 15084 / 15103 と**同じ行**)

```js
      // (a) ハイドラ封印中 (index.html:15044 の隣)
      const _hl = enemyLabelElements[index]; if (_hl) _hl.style.display = "none";

      // (b) 伏兵化フォグ (index.html:15062 の隣)
      const _labelEl = enemyLabelElements[index];
      if (_labelEl) _labelEl.style.display = "none";

      // (c) 生存時 (index.html:15084 の statusEl ブロックを置き換える)
      const labelEl = enemyLabelElements[index];
      if (labelEl) {
        labelEl.style.display = "block";
        /* ⭐ dx は味方と同じ作法で決める — 味方は HP バー dx=18 に対し札 dx=20 (+2)。
             敵の HP バーは dx = hpBarOffX なので、札は hpBarOffX + 2。
           ⛔ 札の実幅を毎フレーム offsetWidth で読んで中央寄せしない
             (レイアウトスラッシングで camera-perf STEP7 の 16.9ms/frame が壊れる)。 */
        placeUnscaledUi(labelEl, enemy.x, enemy.y, enemy.def.displaySize, hpBarOffX + 2, -27);
        updateStatusSlot(enemy, enemyStatusElements[index]);
      } else if (statusEl) {
        statusEl.style.display = "flex";                            // 撤退時の従来経路
        placeUnscaledUi(statusEl, enemy.x, enemy.y, enemy.def.displaySize, hpBarOffX, -27);
        updateStatusSlot(enemy, statusEl);
      }

      // (d) 死亡時 (index.html:15103 の隣)
      const _deadLabelEl = enemyLabelElements[index];
      if (_deadLabelEl) _deadLabelEl.style.display = "none";
```

### 5-4. `clearNodeArrays`(`index.html:32993-32999`)

```js
      // 敵本体 + 添字並列の DOM 配列 11 本 (createEnemyDom が push する全部)  ← 10 本 から
      ...
      alertMarkElements.length = 0; enemyBadgeElements.length = 0;
      enemyStatusElements.length = 0; enemyLabelElements.length = 0;
```

### 5-5. `tools/driver_cast_circle.js:402`

```js
                       alertMarkElements, enemyBadgeElements, enemyStatusElements,
                       enemyLabelElements]) {
```

⛔ このファイルはこの 1 語だけ。期待値(53/53)は 1 つも変えない。

### 5-6. 検証シーム

```js
    if (typeof window !== "undefined") {
      window.__enemyLabels = () => enemyLabelElements;    // #44 ドライバの観測口
      window.__nameLabelOn = () => NAME_LABEL_ON;
    }
```

---

## 6. STEP3 — 装備バッジを -46 → -58 へ上げる

`index.html:15134-15145` の

    placeUnscaledUi(badgeEl, enemy.x, enemy.y, enemy.def.displaySize, offX, -46);

を、札が居るときだけ -58 にする:

```js
            /* #44: 名前札 (-27..-12.6, 高さ 14.4px 実測) の上へ退避。
               バッジは 34x28 (実測) なので -58 で bottom = -30 = 札の上端 -27 の 3px 上。
               ⭐ 副次効果: 従来は バッジ(-46..-18) と 状態アイコン列(-27..-11.4) が
                 9px 重なっていた (§2-5)。札に統合されたのでこれも消える。
               ⛔ バッジの寸法 (font-size / padding / border) は 1px も変えない。 */
            const badgeDy = NAME_LABEL_ON ? -58 : -46;
            placeUnscaledUi(badgeEl, enemy.x, enemy.y, enemy.def.displaySize, offX, badgeDy);
```

---

## 7. 撤退スイッチ

- **`?namelabel=0`** — 次の 4 つが**同時に**従来へ戻る:
  1. 味方・主人公の札が 100%(高さ 20px)へ戻る(`body.labelSmall` が付かない)
  2. 敵の札が **1 枚も作られない**(`enemyLabelElements` は `null` で埋まる)
  3. 状態アイコン列が従来どおり `.enemy-status-slot` として独立配置(-27)
  4. 装備バッジが -46 へ戻る
- ⚠ 判定位置 = `index.html` のブート時に 1 回(`NAME_LABEL_ON`)。
  **ページ遷移はまたがない**(ダンジョン内で完結する変更なので `sessionStorage` へ写す必要が無い)。
  ⭐ `?heromark=0` と同じ「各ページが独立に読む」型。`?town=0` の型(遷移をまたぐ)は採らない。

---

## 8. 受入条件 — `tools/verify_enemy_name_label.js`(新規)

**測り方の方針**: 札は「出ているか」でなく **「正しい敵に / 正しい名前で / 正しい高さで /
他の頭上 UI と重ならずに」** 出ているかを測る。位置は必ず **DOM の `getBoundingClientRect`**
で採る(`placeUnscaledUi` の式を写経すると実装と同じ間違いを共有して両方緑になる)。
70% は**絶対 px を直書きせず、`?namelabel=0` の同じ札との比**で測る
(⭐ 依頼書の 14.4px を写経すると、フォントが変わった日に嘘の緑になる)。

### ⚠ 計測機構(既存ドライバの写経では動かない点)

```js
/* 頭上 UI の帯は「矩形の交差」で測る。⛔ 中心 1 点や上端 1 点では取りこぼす
   (#42 で「中心の逃げ幅は不変なのに食われる面積は増えていた」を踏んだ)。 */
const overlaps = (a, b) => !(a.right <= b.left || b.right <= a.left ||
                             a.bottom <= b.top  || b.bottom <= a.top);
```

### §0 装置(先に母集団を確かめる)

- **(0a)** ★ダンジョンが起動し、**見えている生存中の敵が 1 体以上**居る
  (`enemies.filter(alive && label.display!=='none').length >= 1`)。
  ⭐⭐⭐ **これが無いと §1 の全 assert が空振りで永久緑になる**
- **(0b)** ★ドライバは敵名の表を**写経していない**: 配信バイト(`GET /index.html`)から
  `ENEMY_TYPES` の `name:` を抜いた集合 **46 件** を作り、以降の突き合わせに使う
  (⭐ (0b) 自身が「46 件抜けた」ことを検算する。0 件なら装置不成立)
- **(0c)** ★素の起動で `document.body.classList.contains('labelSmall')` === true
- **(0d)** ★`window.__enemyLabels()` の長さ === `enemies.length`(添字並列が崩れていない)
- **(0e)** ★**バッジを持つ敵**が 1 体以上見えている((1h) の母集団)
- **(0f)** ★**伏兵化フォグで隠れている敵**が 1 体以上居る((1c) の母集団)
- **(0g)** ★**ドライバが敵の箱を `displaySize` から計算していない**(位置・寸法はすべて
  `getBoundingClientRect`)。⭐⭐⭐ §2-11(a) — 既存ドライバ 20 本以上は `displaySize` から
  箱を計算しており、**`displaySize` の外に出る札には原理的に気づけない**。
  DOM 経路で測っていることを装置自身で宣言しておかないと、次の窓が善意で
  計算経路へ書き換えて**永久緑**になる
- **(0h)** ★**見えている敵のうち最小のものが `displaySize <= 70`** である
  ((2f) の母集団。⭐ 大きい敵しか居ない場面で (2f) を測ると自明に緑になる。
  廃坑なら rat 54 / goblin 66 が該当する)
  ⚠⚠⚠ **(0h) が偽のときは (2f) を「スキップして緑」にしてはいけない。**
  **(0h) 自身が FAIL、かつ (2f) も FAIL** とする。装置が測れなかったのだから緑ではない。
  ⭐ 「母集団が無いので skip = 緑」にすると、**大型の敵しか出ない部屋を測った日に
  (2f) が丸ごと消え、しかも記録行は正常に見える**
  (#39 の「撤退アームだけ見ると永久緑」と同じ形)。
  → 母集団を確実に立てるため、**(2f) を測るタブは廃坑(シナリオ1)に固定**し、
  (0h) の detail に**実際に booted したシナリオ ID** を出す。
  ⭐ detail には次の 3 つを必ず出す(閾値 0.30 の意味を後から追える形にする):
  `minEnemyKey`(最小だった敵の type キー) / `minDisplaySize`(その実測値) /
  `rosterMin`(配信バイトの `ENEMY_TYPES` 全 46 種の `displaySize` の最小値)。
  ⚠ **閾値 0.30 はモンスター名簿に依存している**。`rosterMin` より小さい敵
  (例: `displaySize: 50`)が将来追加されると比が上がって (2f) は厳しくなる
  — それは**正しい挙動**だが、依存していること自体を記録に残す。

**ポート**: base **9850** / 変異 **9851-9867**(17 本) / `?namelabel=0` の基準ページ **9870**。
⚠ 既存の使用済みポートと非衝突であることを実測済み
(#41 = 9573-9586 / #42 = 9600-9615 / #43 = 9490-9500 / 他 = 9412-9497, 9530-9593, 9632-9681,
9715-9789, 9840, 9999。`grep -rho "9[0-9]\{3\}" tools/*.js | sort -n | uniq -c` で確認)。

⚠ (0a)(0e)(0f) の母集団が**全部同じ 1 体**にならないこと。
1 体だけで測ると「その 1 体だけを特別扱いした実装」で全部通る
(#39 で「母集団が全部 tiles=8 だと 8 を直書きした実装で通る」を踏んだ)。

⚠⚠⚠ **§0 の全ガードに共通の規則 — 母集団が立たなかったら「スキップして緑」にしない。**
`(0a)(0e)(0f)(0h)` のどれかが偽になったら、**そのガード自身を FAIL にし、
それを母集団とする本体の assert も FAIL** にする。
⭐ 「母集団が無いので測れなかった」を緑で記録すると、**assert が静かに消えるのに
記録行は正常に見える**。これは #39 の「撤退アームだけ見ると永久緑」と同じ形で、
本チケットでいちばん起こりやすい壊れ方。
→ 変異 `bigonly` がこの規則自体を機械で検査する(下表)。

### §1 敵の札

- **(1a)** ★見えている生存敵**すべて**に札があり、テキストが `enemies[i].def.name` と一致
  (DOM 経路 × ページのデータ経路)
- **(1b)** ★その札のテキストが **(0b) の配信バイト由来の 46 件**に含まれる
  (⭐ 2 経路目。実装が `def.name` でなく type キーを書いていたらここで落ちる)
- **(1c)** ★伏兵化フォグで隠れている敵の札は `display:none`(母集団 = (0f))
- **(1d)** ★倒した敵の札は `display:none`(⭐ 1 体倒してから測る)
- **(1e)** ★封印中のハイドラ(シナリオ3)の札は出ない
- **(1f)** ★札の下端が HP バーの上端より**上**: `label.bottom <= hpBar.top + 0.5`
  (⭐ 味方は元から 2px 食い込んでいた(§2-4)が、**敵は新規なので最初から正しくできる**)
- **(1g)** ★状態アイコン列が札の**子**: `labelEl.contains(document.getElementById('enemyStatus'+i))`
- **(1h)** ★装備バッジの矩形と札の矩形が**交差しない**(`overlaps()` が false。母集団 = (0e))

### §2 70%

- **(2a)** ★味方の札の**高さ**が `?namelabel=0` の同じ札の **0.70〜0.75 倍**
  (⭐ 絶対 px を書かない。⭐ 対照は同じドライバの中で両方開いて採る)
- **(2b)** ★味方の札の**幅**が `?namelabel=0` の同じ札の **0.68〜0.73 倍**
- **(2c)** ★主人公 `#warriorLabel` / NPC 仲間 `.allyLabel` / 敵 `.enemyLabel` の **3 種の高さが同じ**
  (±0.6px)。⭐ 「敵の札だけ 100% のまま」を捕まえる
- **(2d)** ★敵の札の `background-color` が味方の札と**異なる**
  (⭐ §2-7 の `.heroLabel` 事故 = className だけ書いて CSS が 0 行、を捕まえる)
- **(2e)** ★札の**上端**(`top`)が `?namelabel=0` と**同じ**(±0.6px)
  = `placeUnscaledUi` の `dy` を動かしていない
- **(2f)** ★⭐⭐⭐ **絶対量の歯止め** — **見えている最小の敵**について
  `札の高さ ÷ その敵のスプライトの高さ <= 0.30`(母集団 = (0h))。
  **2 経路が完全に独立している**のがこの assert の値打ち:
  ① 札の高さ = `.enemyLabel` の `getBoundingClientRect().height`(**CSS 由来**)
  ② スプライトの高さ = `.enemy` の `getBoundingClientRect().height`(**`def.displaySize` 由来**)
  → CSS を丸ごと膨らませてもスプライトは 1px も動かないので、
  **(2a)(2b) の「比」をすり抜ける『素と 70% を同率で膨らませる』変更をここで落とせる**(§2-11(e))。
  ⭐ この比こそユーザーが訴えた量そのもの(「札がゴブリン 66px の 2.9 倍」)。

  **閾値 0.30 の較正**(札 100% = h20 / 70% = h14.4 の実測から):

  | 敵 | `displaySize` | 100%(h20) | **70%(h14.4)** | font 8.5px 相当(h≈15.5) |
  |---|---|---|---|---|
  | ジャイアントラット | 54 | 0.370 ✗ | **0.267 ✅** | 0.287 ✅ |
  | コボルド | 56 | 0.357 ✗ | **0.257 ✅** | 0.277 ✅ |
  | ゴブリン | 66 | 0.303 ✗ | **0.218 ✅** | 0.235 ✅ |
  | ホブゴブリン | 74 | 0.270 ✅ | **0.195 ✅** | 0.209 ✅ |

  ⭐ **0.30 は「100% を確実に赤にし、実機調整の余地(font 8.9px まで)を残す」点**。
  ⚠ ホブゴブリン(74)だけは 100% でも 0.270 で通ってしまうので、
  **(0h) で「最小の敵」に当てることが必須**。任意の敵に当てると空振りする。

### §3 恒等(非退行)

- **(3a)** ★HP バー(味方/敵)の矩形が `?namelabel=0` と**完全一致**(±0.5px)
- **(3b)** ★スプライト `#player` / `.enemy` の矩形が `?namelabel=0` と**完全一致**(±0.5px)
- **(3c)** ★装備バッジの**寸法**(w x h)が `?namelabel=0` と**完全一致**(±0.5px)
  — ⭐ 位置(top)は -58 へ動かすので**測らない**。「動かしたのは位置だけ」という宣言
- **(3d)** ★部屋を 1 つ跨いだあと、`enemyLabelElements.length === enemies.length`
  かつ **`.enemyLabel` の DOM 総数 <= 敵の数**
  (⭐ `clearNodeArrays` と `driver_cast_circle` の取りこぼしを捕まえる)

### §4 撤退

- **(4a)** ★`index.html?namelabel=0` で 4 条件を測る:
  `{ enemyLabelCount, allyLabelH, statusIsChild, badgeTop }`
  → **ON `{>0, 素の 0.7 倍, true, 札より上}` / OFF `{0, 素と同じ, false, -46 相当}`**
  ⭐⭐⭐ **撤退アームだけを見る assert は永久緑になる**(実装が丸ごと壊れていても OFF は緑)。
  → **素のアームの対照を同じ assert の中に同居させる**
- **(4b)** ★OFF でも **HP バーとスプライトの矩形は ON と一致**する
  (⭐ 「撤退のしすぎ」= 札ごと HP バーまで壊した実装をここで落とす)
- **(4c)** ★OFF で `pageerror` / `console.error` が 0 件

### ⛔ 測らないこと

- **敵の札の色そのもの**(`#ffe0d8` / `rgba(56,20,20,0.55)` の具体値)。
  ⭐ 目で調整する余地を残す。測るのは (2d)「**味方と違う**」だけ
- **バッジの `dy = -58` という具体値**。測るのは (1h)「**札と重ならない**」だけ
- **`font-size: 7.7px` という具体値**。測るのは (2a)(2b)「**素の 0.70 倍前後**」だけ
- 札が長い敵(ファラクサス 134.5px)が**隣の敵の札**と重なること
  — ⭐ 混雑時の重なりは**別チケット**(§11)
- **札の `pointer-events`**。⭐⭐⭐ 測らない理由を実測付きで残す(§2-11(b)):
  ダンジョンの遊びのクリックは **`document` に張られた 1 本**(`index.html:16568`)で、
  `e.clientX/clientY` を `WX()/WY()` で世界座標へ直して `openChestAt()` を呼ぶだけ。
  `grep -c "elementFromPoint" index.html` = **0**、札に `stopPropagation` も付けない。
  → **札が何であってもクリックは通る** = 「札がクリックの盾になる」欠陥は**原理的に起きない**。
  ⛔ だから `pointer-events: none → auto` の変異は**作らない**(必ず空振りする)。
  ⚠ #41 で街の `.npcUnit` がクリックを奪ったのは、受け口が `#tavernViewport` で
  `stopPropagation` を足したから。**受け口の張り先が違うので、あの教訓はここには効かない**。
- ⭐⭐⭐ **「素のアームで自明に真になる assert」は 1 本も書かない**(§2-11(c))。
  上の表は全 assert に「素で真 / どの変異で偽」の**対**がある。対が書けないものは
  **測っているつもりで判定していない**ので、assert にせず detail の出力に留める。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nolabel` | `createEnemyDom` の札生成ブロックを消す | (0a)(1a)(1b) |
| `noscale` | `document.body.classList.add("labelSmall")` を消す | (0c)(2a)(2b) |
| `nocss` | `body.labelSmall .enemyLabel { … }` を消す | (2c) — 敵だけ 100% |
| `noenemycss` | `.enemyLabel { … }` を丸ごと消す(className は残す) | (2d) — §2-7 罠C の再現 |
| `deadshow` | 死亡時の札 hide を消す | (1d) |
| `fogshow` | 伏兵化フォグの札 hide を消す | (1c) |
| `hydrashow` | ハイドラ封印の札 hide を消す | (1e) |
| `badgestay` | バッジ `dy` を -58 → -46 に戻す | (1h) — §2-5 罠B の再現 |
| `statusdetach` | 状態アイコン列を札の子にせず独立配置のまま | (1g) |
| `typekey` | 札のテキストを `def.name` でなく `typeKey` にする | (1b) |
| `nonull` | 撤退時の `enemyLabelElements.push(null)` を消す | (0d) — 添字ずれ |
| `noclear` | `clearNodeArrays` に 11 本目を足さない | (3d) |
| `noteardown` | `driver_cast_circle.js:402` の配列リストへ足さない | (3d) — §2-2 罠A の再現 |
| `dyshift` | 札の `dy` を -27 → -30 にする | (2e) |
| `hpshift` | HP バーの `dy` を -10 → -12 にする | (3a) — 恒等の空振り検査 |
| `bothgrow` | `.allyLabel` の素を `font-size: 16px` に、`body.labelSmall` の上書きを `11.2px` に**同率で**膨らませる | **(2f) だけ** — ⭐⭐⭐ (2a)(2b)(2c) は比 0.70 のまま**緑で通る**。§2-11(e) の「両方同じだけ壊れる変更」の再現。**この 1 本のためだけに (2f) がある** |
| `bigonly` | 配信バイトの `ENEMY_TYPES` で `displaySize` が **71 未満のものを全部 96 へ**書き換える(= (2f) の母集団を殺す) | **(0h) と (2f) が両方赤** — ⭐⭐⭐ 「母集団が立たないので skip = 緑」を実装するとこの変異が**空振り**する。**§0 の共通規則そのものを機械で検査する 1 本**。⚠ この変異での (2f) は「測れないから赤」であって「比が悪いから赤」ではないので、detail に `population: none` と出して区別できるようにする |

⭐ **§2-2 の罠A = `noteardown` / §2-5 の罠B = `badgestay` / §2-7 の罠C = `noenemycss`**
の 3 本が、起草中にしか見つからない知見を実装後まで生かす唯一の形。
⭐⭐⭐ **`bothgrow` と `bigonly` の 2 本は、隣窓 #43 との往復で足りないと分かって足したもの**
(§2-11(e) と §0 の共通規則)。前者は「比だけで縛って絶対量を誰も見ていない」、
後者は「母集団が消えると assert も静かに消える」を、それぞれ機械で捕まえる。

### 既存 golden の非退行(実装後に必ず走らせる)

**基準は 2026-09-03 にこの窓が実際に走らせて採った値**(コミット `c1c85e0` / 全部 exit 0):

- `node tools/driver_grid_p7.js` → **44/44**
  ⭐ (4c)(4f) が `#warriorLabel` の矩形を見るが、どちらも
  **「ズーム時 vs 素」の相対比較**なので、札を一様に縮めても**両方等しく縮んで緑のまま**
  (`tools/driver_grid_p7.js:584-592` を読んで確認済み)
- `node tools/driver_heromark_signplate.js` → **46/46**
  ⭐ `labelTop`(札の**上端**)しか見ていない。上端は `placeUnscaledUi` の `dy` が決めるので
  札が縮んでも不変(§4 の ⛔ を守れば緑)
- `node tools/driver_cast_circle.js` → **53/53**
  ⚠ §5-5 で 1 語足したあと**必ず再実行**する
- `node tools/driver_sce1_events.js` → **214/214**

⚠ 基準値は **2026-09-03**・コミット `c1c85e0` 時点の記録。
⭐ その後 隣窓の #43 が `8e66fa6` まで着地したが、**`index.html` は 0 バイトも動いていない**
(§ヘッダの `git diff --stat` で実測)ので、上の 4 本の基準はそのまま持ち越せる。
うち `driver_heromark_signplate` は**隣窓も `8e66fa6` で走らせて 46/46** と報告してきており、
2 窓の独立した実測が一致している。
⚠ それでも**着手直前にもう一度この 4 本の素の値を採り直す**(確かめるのが仕事)。
⚠ **走らせて違ったら、期待値を書き換える前に理由を突き止める**。

**隣窓 #43 が `8e66fa6` で採った基準**(本チケットは `world.html` を触らないので直接の非退行
対象ではないが、万一 `index.html` の変更が波及したときの参照値として記録する):
`verify_world_map` 57/57 / `verify_world_steps` 33/33 / `verify_quest_walk` 25/25 /
`verify_town_exit` 素 23/23 / `verify_title_screen` 86/86 / `verify_tavern_map` 43/43 /
`verify_world_heromark` 18/18(新規)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. **iPhone 縦(390x844)で札が読めるか。** 70% = font 7.7px。⭐ ここが唯一の本当のリスク。
   読めなければ font を 8.5px 前後へ戻す(受入条件は比で書いてあるので 0.70〜0.75 の幅に収まる)
2. **ゴブリンが 3〜4 体並んだときに札が重なって読めなくならないか**(混雑時の見え方)
3. **引き(camZ=0.25 の大部屋)で札が絵を邪魔しないか** — これが今回の主目的
4. **敵の札の色**が味方の札と一目で区別できるか(暖色の縁)
5. **バッジが -58 まで上がったことで、上の敵の HP バーとぶつかっていないか**
6. ボス(ファラクサス 360px / 名前 15 文字)の札が巨大に見えないか

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>敵の頭の上にも名前の札が出るようになった</b> — ゴブリンかホブゴブリンか、名前で見分けが付く。合わせて札を一回り小さくした。"

---

## 11. やらないこと

- ⛔ **敵スプライトの `displaySize` を変える**(§1・§2-3 で「大きいのは札」と確定済み)
- ⛔ **HP バー / 装備バッジ / 状態アイコンの寸法**(ユーザー決定 = 札だけ 70%)
- ⛔ **装備バッジを札の中へ前置きして 2 段にまとめる**(頭上 UI 46px → 27px。
  効き目は最大だがバッジの見え方が変わる。⭐ 実機体感 §9-5 で「バッジが上に行き過ぎ」と
  感じたら**別チケット**で起こす)
- ⛔ **`.heroLabel` の CSS 追加**(§2-7。主人公の札の色が動く)
- ⛔ **札が混雑して重なるときの回避**(ずらす / 近い敵だけ出す / 交戦中だけ出す)。
  ⭐ 実機で §9-2 が問題になってから**別チケット**
- ⛔ **味方の札を中央寄せにする**(現状 `dx=20` 固定で中央寄せされていない。
  敵も同じ作法に揃えたので、直すなら味方と敵を同時に別チケットで)
- ⛔ **`world.html` / `js/world-map.js`**(隣窓 #43 の領分。**着地済み・解放済み**だが、
  本チケットは元から開かない)
- **`実装依頼書/README.md` への #44 行の追加** — ⭐ 隣窓の #43 行は `8e66fa6` で**着地済み**
  なので、**保留は解除**。承認が出たら実装の最初のコミットで足してよい。用意してある行:

    | 44 | [2026-09-03_enemy-name-label.md](2026-09-03_enemy-name-label.md) | **承認済** | 0% | 敵 46 種の頭上に名前札を出し、札を 70% へ。⚠ 敵の頭上は既に埋まっている(バッジ -46..-18 / 状態 -27..-11.4 / HP -10..0)ので札は -27・バッジは -58 へ。⭐ 添字並列の DOM 配列が **10 → 11 本**になり `driver_cast_circle.js:402` の撤去ループが黙って取りこぼす。撤退 `?namelabel=0` |

---

## 12. 実装結果

**2026-09-03 完了**(dev-loop 4 項目・停止 0 回)。⛔ push はユーザー承認事項なのでこの窓では未実施。

### 12-1. コミットと最終の件数

| 項目 | commit | 触ったファイル | 結果 |
|---|---|---|---|
| 1. 本番実装 全部 + §0 装置 | `1545fa6` | `index.html` / `tools/driver_cast_circle.js`(1 語) / `tavern.html`(changelog) / 新 driver | §0 **8/8 PASSED / PENDING 21** |
| 2. §1 敵の札 + §2 70% | `d0f4124` | `tools/verify_enemy_name_label.js` のみ | **22/22 PASSED / PENDING 7** |
| 3. §3 恒等 + §4 撤退 | `92a2f4d` | 同上 | **29/29 PASSED / PENDING 0** |
| 4. `--negative` 変異 17 本 + 台帳 | (本コミット) | 同上 + 依頼書 2 枚 | **受入 30/30 / `--negative` 58/58 / PENDING 0** |

- **受入条件**: `node tools/verify_enemy_name_label.js` → **30/30 PASSED / FAILED 0 / PENDING 0**(exit 0)
  ⭐ 項目 4 で **(3e) を 1 本新設**したので 29 → 30(⛔ 既存の 29 本は 1 バイトも弱めていない。理由は 12-2 ⑥)。
- **負のコントロール**: `node tools/verify_enemy_name_label.js --negative` →
  **58/58 PASSED / FAILED 0 / PENDING 0**(exit 0)。内訳 = `(n0a/n0b)` 各 17 本 + 変異ごとの担当節 23 本 + `(n9a)`。
  **17 本すべてが担当の節を赤にした = 空振り 0**。

### 12-2. ⭐⭐⭐ 依頼書の主張が崩れた/直した 7 件

⛔ **どれも受入条件を弱めずに直した**(#38 の作法 = 変異が空振りしたら変異のほうを直す)。

**① §2-8「敵 46 種」は起草時の数え違い — 実測 50 種**
配信バイトの `ENEMY_TYPES` から抜くと top-level キー **50** / `name:` **50** で 1:1(同名の重複 0 件)。
`rosterMin`(名簿全体の `displaySize` 最小)= **54**。
⭐ (0b) は件数を写経せず「配信バイト由来の集合 × ページの `Object.keys(ENEMY_TYPES)`」の
**2 経路一致**だけを縛ってあるので、この数が動いても腐らない。

**② §8 (2b) の帯 0.68〜0.73 が実測を通らない — 真因は「縮まない固定費 6px」**
`#warriorLabel` は 幅 52 → 38.2 = **0.7346**(高さは 20 → 14.38 = 0.7190 で (2a) の帯内)。
内訳を実測すると **名前 span 単体は 36 → 25.2 = ちょうど 0.7000** で文字は正しく 70%。
残りは `border-width: 0.7px` を Chrome が端末の 1px へ丸める分 + 共通定数 4px = **6px の固定費**で、
これは文字数に依存しないので**短い札ほど比が上がる**(3 文字 0.7346 / 9 文字 ≈0.708)。
⛔「敵の札へ測定点を移す」は**原理的に不可能** — 撤退アームに `.enemyLabel` は 1 枚も無く
(`push(null)`)、NPC 仲間の名前はランダム、両アームで同じテキストが出るのは `#warriorLabel` だけ。
⇒ **箱の帯を 0.68〜0.75 へ広げ、同時に「名前テキストの幅の比 0.68〜0.72」を AND で追加**
(テキストの比には固定費が乗らないので狭く縛れる = 条件は 1 本増えている)。
変異 `noscale` で箱もテキストも **1.0000 = 両方赤**を実走確認。⛔ CSS は 1px も触っていない。

**③ §8 (2d)「味方と異なる」だけでは変異 `noenemycss` が空振りする**
CSS を丸ごと消すと背景は `rgba(0,0,0,0)` になり、味方の `rgba(20,40,60,0.55)` と「異なる」ので緑。
⇒ **「自前の背景色を実際に持つ (alpha > 0)」を AND で追加**(`bgAlpha()` = 正規表現なしのパーサ)。
実走で敵 3 体とも `rgba(0, 0, 0, 0)` = 赤を確認。

**④ §8 変異 `hpshift`「HP バーの dy を -10 → -12」(無条件) は空振りする**
負のコントロールは素のアームも撤退アームも**同じ変異ポートから配る**ので、無条件に動かすと
**両アームが等しく動いて恒等 assert (3a) は緑のまま**(項目 3 が実走で緑を確認)。
⇒ `'hpBarOffX, -10);'` → `'hpBarOffX, NAME_LABEL_ON ? -12.5 : -10);'` の**分岐形**へ。
(3a) が敵 3 体とも 2.50px ずれ / (4b) も同時に赤。
⭐⭐⭐ **一般化 = 恒等 assert は「片方のアームだけを壊す変更」でしか赤くならない。**

**⑤ §8 変異 `nonull` の targets (0d) は原理的に赤くならない**
`enemyLabelElements.push(null)` は `createEnemyDom` の**撤退枝にしか無い**ので、
素のアームしか見ない (0d) では捕まらない。
⇒ (4a) に **5 本目の条件**「撤退アームの `labelArrayLen === enemies.length`」を AND で足し、
targets を `['4a']` へ移した(依頼書の 4 条件は 1 つも弱めていない)。
実走 = OFF の札配列 **0 / 敵 8** で赤。

**⑥ §8 変異 `noteardown` の targets (3d) も原理的に赤くならない — ⭐ (3e) を新設した**
(3d) は**本ドライバが配信する `index.html` の `clearNodeArrays`** しか見ておらず、
別ドライバ `tools/driver_cast_circle.js` の撤去ループとは無関係。
⇒ **(3e)** を新設 = 「**配信した 2 本のソースを突き合わせて**、`createEnemyDom` が push する
添字並列の配列(実測 11 本)が、あちらの撤去ループの配列リストに 1 本残らず並んでいる」。
⛔ 件数(11)は期待値に持たない = **12 本目が増えた日にも自動で効く**。
変異 `noteardown` で「撤去ループ 10 本 / 取りこぼし `["enemyLabelElements"]`」= 赤。

⚠⚠⚠ **罠A を実物で 1 回測った**(2026-09-03。`tools/driver_cast_circle.js` を手で壊して実走 →
復元 → `git diff --quiet` で検算):

| 撤去ループ | `driver_cast_circle.js` の結果 | 検算 6.11 |
|---|---|---|
| 11 本(正しい) | **53/53 PASS** exit 0 | PASS |
| **10 本(11 本目を消した)** | **53/53 PASS** exit 0 ← **1 つも赤くならない** | **PASS のまま** |

⭐⭐⭐ **依頼書 §2-2 の予言どおり、罠A はあのドライバでは永久に検出できない。**
(3e) が唯一の検出器で、それが本チケットで初めて機械化された。

**⑦ §8 変異 `bothgrow` は依頼書の字面(`.allyLabel` だけ)では空振りする**
(2f) が測るのは**敵の札の高さ ÷ 敵のスプライトの高さ**なので、味方の札だけ膨らませても
(2f) は 0.2662 のまま緑(しかも (2c)「3 種の高さが同じ」が別の理由で壊れて狙いがぼける)。
⇒ **味方と敵の 4 本を同率で** 1.4545 倍(11px → 16px / 7.7px → 11.2px)にする形へ。
アンカーは `font-size: 7.7px;` が 2 箇所あって一意にならないので、`.enemyLabel {` の 1 行へ
`!important` の上書き 2 本を注入する形にした。

⭐⭐⭐ **そのうえで、依頼書 §2-11(e) の狙いが実測で証明された**
(`record` = 同じ走行で「緑のまま通ってしまう節」も記録する仕掛けを足した):

| 変異 `bothgrow` での節 | 結果 |
|---|---|
| (2a) 高さの比 | 19.38 / 27.00 = **0.7176** → **緑のまま** |
| (2b) 幅の比 | 箱 0.7269 / テキスト 0.7001 → **緑のまま** |
| (2c) 3 種の高さが同じ | ばらつき 0.00px → **緑のまま** |
| **(2f) 絶対量** | 札 19.38px ÷ rat 54.00px = **0.3588 > 0.30** → **⛔ 赤** |

= **比だけで縛った 3 本を全部すり抜ける変更を、(2f) 1 本だけが落とした。**

### 12-3. 変異 17 本の一覧(全部 `impl: true` / 空振り 0)

| 変異 | 実際に赤くなった節 | 実測の指紋 |
|---|---|---|
| `nolabel` | (0a)(1a)(1b) | 見えている生存敵 **0 体** / 札 `present=false` |
| `noscale` | (0c)(2a)(2b) | `body.labelSmall=false` / 比 **1.0000** |
| `nocss` | (2c) | 味方 14.38px vs 敵 **20px** = ばらつき 5.63px |
| `noenemycss` | (2d) | 敵の背景 **`rgba(0, 0, 0, 0)`**(罠C の再現) |
| `deadshow` | (1d) | 倒した kobold の札が `""`(残る) |
| `fogshow` | (1c) | フォグの goblin 3 体の札が `""`(伏兵が丸見え) |
| `hydrashow` | (1e) | 封印中 hydra の札が `""` |
| `badgestay` | (1h) | 札上端 − バッジ下端 = **−9.00px**(罠B の 9px がそのまま出た) |
| `statusdetach` | (1g) | `child=false` × 3 体 |
| `typekey` | (1b) | 札が `"rat"` `"goblin"` `"hobgoblin"` |
| `nonull` | **(4a)** | OFF の札配列 **0 / 敵 8** |
| `noclear` | (3d) | 跨いだ後 札の配列 **6 / 敵 2** |
| `noteardown` | **(3e)** | 撤去ループ **10 本** / 取りこぼし `enemyLabelElements`(罠A) |
| `dyshift` | (2e) | 敵の dy **−30.00 vs −27.00** |
| `hpshift` | (3a)(4b) | 敵の HP バーが **2.50px** ずれ |
| `bothgrow` | **(2f) だけ** | 0.3588 > 0.30(比の 3 本は緑のまま = 12-2 ⑦) |
| `bigonly` | (0h)(2f) | 最小の敵 **hobgoblin 74**(7 種を 96 へ)/ (2f) は **`population: none`** |

⭐ `bigonly` だけは 1 行置換で書けない(小さい敵は 7 種あり、どの数値も名簿の中で一意にならない)ので
**変換関数 `transform` で配る**機構を足した。(n0a) の代わりは
`verifyServed` =「名簿の最小 素 **54** / 変異 **72** が境界 70 をまたいだ」の検算。
⚠ この変異での (2f) は「**測れないから赤**」なので detail に `population: none` が出る
= 「比が悪いから赤」と記録の上で区別できる(依頼書 §8 の要求どおり)。

### 12-4. 既存 golden の非退行(**期待値の変更 0 件**)

着手前 `762a6f2` で採った基準と、実装後の実測が **4 本とも一致**:

| ドライバ | 基準 | 実装後 | exit |
|---|---|---|---|
| `node tools/driver_grid_p7.js` | 44/44 | **PASS 44 / FAIL 0** | 0 |
| `node tools/driver_heromark_signplate.js` | 46/46 | **46 / 46** | 0 |
| `node tools/driver_cast_circle.js` | 53/53 | **53/53 PASS**(§5-5 で 1 語足した後) | 0 |
| `node tools/driver_sce1_events.js` | 214/214 | **214/214 passed** | 0 |

⭐ 依頼書 §8 の見立てどおり、`driver_grid_p7` (4c)(4f) は「ズーム時 vs 素」の相対比較、
`driver_heromark_signplate` は `labelTop`(上端)だけなので、**札を一様に縮めても両方緑**だった。
⚠⚠⚠ ただしこれは **§4 の ⛔「配置関数の `dy` を 1px も動かさない」を守った結果**であって、
あの 2 本が札の大きさを見ているという意味ではない(§2-11(e) の「気づいていない穴」は残っている)。

### 12-5. 撤退スイッチ `?namelabel=0` の実測

`index.html?namelabel=0` を同じ走行で開いて対にして測った((4a)(4b)(4c)):

| 見るもの | ON(素) | OFF(`?namelabel=0`) |
|---|---|---|
| `.enemyLabel` の DOM 総数 | **8 枚** | **0 枚** |
| `.enemy-status-slot` の DOM 総数 | 0 | **8** |
| 状態アイコン列の親 | 札の子 3/3 | 独立配置 0/3(class = `enemy-status-slot`) |
| 主人公の札 | **38.2 x 14.4px** | **52.0 x 20.0px**(高さ比 0.7188) |
| 装備バッジ(上端 − スプライト上端) | **−58.0** | **−46.0** |
| `enemyLabelElements.length` / `enemies.length` | 8 / 8 | **8 / 8**(`push(null)` が効いている) |
| 主人公 `#player` / `#warriorHpBar` | 96.0x96.0 / 62.0x10.0 | **4 辺とも 0.00px 差** |
| 敵の HP バー・スプライト | — | **rat / goblin / hobgoblin とも 0.00px 差** |
| `pageerror` / `console.error` | **0 件** | **0 件** |

⭐ ON 側の実測(参考): 札の高さは 3 種とも **14.38px** で完全に揃い、
札の下端は HP バー上端の **2.63px 上**(依頼書 §2-4 の「味方は元から 2px 食い込む」が敵では解消)、
バッジ下端と札上端の隙間は **3.00px**(罠B の 9px の重なりが消えた)。
最小の敵 rat は 札 14.38px ÷ スプライト 54.00px = **0.2662**(上限 0.30)。

### 12-6. 実装で踏んだ罠(次の窓へ)

1. ⚠⚠⚠ **変異の `to` が素に元から居ると (n0a) が破れる。**
   `statusdetach` の `to` を `'enemyLayer.appendChild(st);'`(空白なし)にすると、その文字列は
   **撤退用の else 枝に元から居る**。`noclear` の `to` を接頭辞だけにしても同じ形で破れる。
   ⇒ **必ず素に無い形**(空白やコメントを足す)にする。
2. ⚠⚠⚠ **置換前後が同じ長さだと起動時の検算に `exit 3` で弾かれる。**
   `dyshift` を `'-27);'` → `'-30);'` にすると同じ長さ。**小数を足して長さを変える**。
   同じ理由で `bigonly` の置換も `96 /* bigonly */` とコメント込みにしてある。
3. ⚠⚠⚠ **変異アンカーに配置関数の呼び出し行を丸ごと使うと (0g) が赤くなる。**
   `FORBIDDEN_IN_SELF`(呼び出しの形)と `SELF_MARK`(敵の寸法データ語)の 2 段に同時に当たる。
   短いアンカー(`'hpBarOffX, -10);'` など)を使う。
   ⭐ 同じ理由で `bigonly` の `transform` は寸法データ語を **`'display' + 'Size'` の連結**で作っている。
4. ⭐ **`--negative` は対照ページを「要る変異でだけ」開く**ようにした
   (`REF_ASSERTS` = (2a)(2b)(2e)(3a)(3b)(3c)(4a)(4b)(4c))。
   ⚠ 逆に**要るのに開かないと `popFail` で必ず赤**になり、**変異が効いていなくても赤 = 空振りに
   気づけない**。判断は 1 箇所(`REF_ASSERTS`)に畳んである。

### 12-7. 残 = 実機体感(§9 の 6 項目)

⚠ ローカルは **http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. ⭐⭐⭐ **iPhone 縦(390x844)で札が読めるか。** 70% = font 7.7px。**ここが唯一の本当のリスク。**
   読めなければ font を 8.5px 前後へ戻す(受入条件は比で書いてあるので 0.70〜0.75 の帯に収まり、
   (2f) も 0.287 で上限 0.30 の内側 = **ドライバを 1 バイトも直さずに調整できる**)。
2. ゴブリンが 3〜4 体並んだときに札が重なって読めなくならないか(混雑時の見え方)。
   ⛔ 重なりの回避は §11 のとおり**別チケット**。
3. 引き(camZ=0.25 の大部屋)で札が絵を邪魔しないか — **これが今回の主目的**。
4. 敵の札の色(`rgba(56,20,20,0.55)` + 暖色の縁)が味方と一目で区別できるか。
   ⭐ 受入条件は (2d)「味方と違う色を実際に持つ」だけなので**色は自由に調整できる**。
5. バッジが -58 まで上がったことで、上の敵の HP バーとぶつかっていないか。
   ⭐ ここで「バッジが上に行き過ぎ」と感じたら §11 の「バッジを札の中へ前置き」を別チケットで。
6. ボス(ファラクサス 360px / 名前 15 文字)の札が巨大に見えないか。

### 12-8. ⭐ 宣言しておく穴(隣窓 #43 §12-8 と同型)

- **(2f) の閾値 0.30 はモンスター名簿に依存している。** `rosterMin`(現在 54)より小さい敵が
  将来追加されると比が上がって (2f) は厳しくなる — それは**正しい挙動**だが、依存していること自体を
  ここに記録する((0h) の detail に `minEnemyKey` / `minDisplaySize` / `rosterMin` を毎回出している)。
- **敵の札の色・font の具体値・バッジの `dy = -58` は 1 つも assert していない**(§8「測らないこと」)。
  ⭐ 実機で調整する余地を残すための**意図した穴**であって、気づいていない穴ではない。
- **札の `pointer-events` は測っていない。** 理由は §2-11(b) の実測どおり
  (ダンジョンのクリックは `document` の 1 本 / `elementFromPoint` は 0 件)。
  ⛔ 空振りする変異は作らない、という判断を変えるときはこの実測から取り直すこと。
