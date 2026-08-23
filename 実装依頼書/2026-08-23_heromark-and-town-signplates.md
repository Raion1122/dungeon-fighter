# #15 自キャラの ▽ マーカー + 街の看板を羊皮紙の札へ

**ステータス**: **承認済**(2026-08-23)
**起草**: 2026-08-23
**承認時の決定**: ①▽ は**街とダンジョンの両方**に出す ②札は**テキストだけ**(丸アイコン廃止)
③武器屋の表示名は **「武器防具屋」のまま**(スクショの「武器と具足」には変えない)
④説明文 3 本(§5 B-1 の表)は**そのまま採用**
**撤退スイッチ**: `?heromark=0`(▽) / `?signplate=0`(羊皮紙の札)
**検証**: 新規 `tools/driver_heromark_signplate.js` + 既存 `tools/verify_town_map.js` 85/85 非退行

---

## 1. 目的

1. **自キャラを一目で見つけられるようにする。** 頭上に ▽ の三角マーカーを出す。
2. **街の施設が「何をする所か」文字で分かるようにする。** 丸アイコン(🦌 / 🛡️ / 🌑)をやめ、
   羊皮紙の札に「施設名 + 一行の説明」を書いて立てる。

⚠ 1 と 2 は別の機能だが、**同じ `town.html` を触るので 1 枚の依頼書 = 1 窓で回す。**
別々の窓に割ると、ファイル単位 add で互いのハンクを巻き込む事故になる(2026-08-23 に実測済)。

---

## 2. 着手前の実測(この窓が本番コードを読んで確かめた事実)

⭐ **ここは全部「読んで確かめた」もの。** 実装窓は前提として使ってよい。
逆に、ここに書いていないことは確かめていないので、着手時に 1 回測ること。

### 2-1. 街 (`town.html` / `js/town-map.js`)

| # | 事実 | 出所 |
|---|---|---|
| a | 主人公は `#townHero` 1 枚。足元をタイル中心に置く(`top = cy - 96 × FOOT`、`FOOT = 0.93`) | [town.html:104](town.html#L104) / [:266](town.html#L266) / [:317](town.html#L317) |
| b | 看板は `.townSign`(64x64 の丸)+ 子の `.townSignName`(名前) | [town.html:126-153](town.html#L126-L153) / [:391](town.html#L391) |
| c | **施設データの唯一の正は `FACILITIES`**。看板の文字列・座標・遷移先は全部ここ | [js/town-map.js:144](js/town-map.js#L144) |
| d | ⚠ **武器屋の表示名は「武器防具屋」**。スクショで「武器と具足」に見えるが、実データはこの 5 文字 | 同上 |
| e | ステージは `translate() scale(zoom)` 1 本。desktop は「帯を除いた領域に 23x15 が全部入る」倍率 = **zoom < 1**。compact は最大 1.5 | [town.html:346-375](town.html#L346-L375) |
| f | → **札の中の文字も zoom で一緒に縮む。** desktop 1440x900 の実効倍率はおよそ 0.88 | 同上 |
| g | compact では画面下の `#townHud` ボタン(`f.icon + " " + f.name`)が施設への導線 | [town.html:413-420](town.html#L413-L420) |

### 2-2. 街の既存回帰が縛っていること(`tools/verify_town_map.js` 85/85)

⚠⚠ **この 4 つを壊すと既存 85 本が赤くなる。** 札の形を変えても必ず維持すること。

| # | 縛り | 出所 |
|---|---|---|
| a | id は `townSign_<key>` のまま(`tavern` / `shop` / `plaza`) | [tools/verify_town_map.js:464](tools/verify_town_map.js#L464) ほか 4 箇所 |
| b | `.townSign` の枚数はちょうど **3**(解禁前は 2) | [:668](tools/verify_town_map.js#L668) / [:690-692](tools/verify_town_map.js#L690-L692) |
| c | ⭐⭐ **矩形の中心の `elementFromPoint` が自分自身か子孫**であること = 「在るのに押せない」を禁じている | [:659-663](tools/verify_town_map.js#L659-L663) |
| d | 変異アンカー 5 本(`canalopen` / `isolate` / `snapnear` / `addquery` / `hidebehind`)の**文字列を 1 文字も動かさない**。特に `snapnear` は `town.html` の `if (!TM.isWalkable(c, r)) return false;` 行そのもの | [:61-98](tools/verify_town_map.js#L61-L98) |

### 2-3. ダンジョン (`index.html`)

| # | 事実 | 出所 |
|---|---|---|
| a | ⭐⭐⭐ **「頭(player アバター)」と「主人公(isHero)」は別物。** 主人公が僧侶/魔法使い/エルフ/盗賊だと**主人公は `allies` 側に居る** | [index.html:6082-6086](index.html#L6082-L6086) / [:31607](index.html#L31607) |
| b | ⚠⚠⚠ **NPC 頭が死ぬと主人公が頭へ昇格する。** そのとき主人公の ally 側 DOM(`el` / `hpWrapEl` / `nameLabelEl`)は `remove()` される | [index.html:17776-17787](index.html#L17776-L17787) |
| c | → **▽ を ally ごとに 1 個持たせると、昇格した瞬間に消える。**<br>**▽ は 1 枚だけ作り、毎フレーム「今の主人公」を引き直す**設計にすること | (b から従う) |
| d | 頭上 UI の高さ: HP バー `dy=-10` / 名前ラベル `dy=-28` / 敵の装備バッジ `dy=-46` | [:14461-14467](index.html#L14461-L14467) / [:14636-14643](index.html#L14636-L14643) / [:14605](index.html#L14605) |
| e | ⭐ ズームしても縮まない頭上 UI の置き方は `placeUnscaledUi(el, wx, wy, size, dx, dy)` **1 本だけ**。自前で `SX/SY` を書かない | [index.html:4025](index.html#L4025) |
| f | `.allyLabel` の z-index は **7** | [index.html:283-297](index.html#L283-L297) |
| g | 主人公 ally には既に金色グロー + 「(あなた)」ラベルが付いている。▽ は**置き換えではなく追加** | [:12572](index.html#L12572) / [:12583](index.html#L12583) |
| h | 画面端マーカーの前例 = `#escortMarker`(`try-catch` + エラー計数シーム付き) | [:864-905](index.html#L864-L905) / [:14442](index.html#L14442) |
| i | パーティ編成は `sessionStorage["dragonfighters.partyMembers"]`(隊列順 `[0]` = 頭)から読む → **ドライバはこれを仕込めば「主人公が後衛」の局面を作れる** | [:31536-31556](index.html#L31536-L31556) |

### 2-4. スプライトの頭の位置(この窓で 6 職の PNG を実測)

`assets/<class>_walk.png` は 576x384 = 96px セル 6 列 x 4 行、右向きは row 3。
**row 3 の不透明画素(alpha ≥ 16)の上端**をセル上端からの距離で測った実測値:

| 職 | warrior | dwarf | elf | cleric | mage | rogue |
|---|---|---|---|---|---|---|
| 上端 | 32 | 33 | 33 | 34 | 32 | 32 |

⭐ **つまり 96px の箱の上には約 32px の空白がある。** 頭の実際の天辺は
`箱の上端 + 32px`。▽ をこの空白の中に置くと「頭からかなり浮いた矢印」になるので、
**街では箱の上端ではなく実測 32px を足した位置を基準にする**(§4-1 参照)。

### 2-5. 羊皮紙(プロジェクトに既にある作法)

| # | 事実 | 出所 |
|---|---|---|
| a | 紙テクスチャ `assets/parchment_plaza.jpg`(700x851 / RGB / 130KB)。実測 平均輝度 **149.8**、最大 202 = **セピアの中間調** | この窓で計測 |
| b | 闇市の札はそれに `--pq-veil: 0.62` の**純黒の暗幕**を掛けて沈めている。街の札は**暗幕を外して明るい紙として使える** | [tavern.html:1489-1545](tavern.html#L1489-L1545) |
| c | 紙質は「変数ブロック 1 つだけで決まる」作法。街も同じ形で `--sp-*` を 1 ブロックに畳む | 同上 |

### 2-6. changelog

⚠ フックのトリガーは `index.html` / `tavern.html` / `audio.js` の 3 本だけ(CLAUDE.md)。
**本件は `index.html` を触るので changelog 1 行が必須。** 文案は §9。

---

## 3. 変更範囲

**触る**

- `town.html` — ▽ の DOM/CSS/配置、看板を札へ
- `js/town-map.js` — `FACILITIES` に **`desc` フィールドを追加**(説明文の唯一の正)
- `index.html` — ▽ の DOM/CSS/毎フレーム配置
- `tools/driver_heromark_signplate.js` — **新規**

**触らない**

- `tavern.html`(闇市の札 `.pqcard` は 1 バイトも触らない。街の札は別系統として新規に書く)
- `assets/town_phlan.jpg`(絵は描き直さない)
- `js/town-map.js` の `MASK` / `SPAWNS` / 座標 / `icon` / `name`(**追加だけ**、既存フィールドは不変)
- `index.html` の主人公の金色グロー・「(あなた)」ラベル(▽ は追加であって置き換えではない)

---

## 4. STEP A — ▽ 三角マーカー

### A-1. 街 (`town.html`)

- `#townStage` の中に `<div id="townHeroMark"></div>` を **1 枚だけ**追加(`#townHero` の直後)。
- CSS は **1 つの変数ブロック**に畳む(色を後から触れるように):

```css
#townHeroMark {
  --hm-w: 9px;        /* 三角の半幅 */
  --hm-h: 13px;       /* 三角の高さ */
  --hm-color: #ffd24a;
  position: absolute;
  width: 0; height: 0;
  border-left: var(--hm-w) solid transparent;
  border-right: var(--hm-w) solid transparent;
  border-top: var(--hm-h) solid var(--hm-color);
  filter: drop-shadow(0 0 2px #000) drop-shadow(0 2px 3px rgba(0,0,0,0.8));
  pointer-events: none;
  z-index: 5;                      /* 看板(4) より上、帯(10) より下 */
  animation: heroMarkBob 1.2s ease-in-out infinite;
}
@keyframes heroMarkBob { 0%,100% { margin-top: 0; } 50% { margin-top: 4px; } }
```

- 配置は `placeHero()` の中で 1 行(**位置の出所を 2 つ持たない**):

```
HEAD_TOP = 32          /* §2-4 の実測。6 職の最小値 */
GAP      = 8           /* 頭の天辺と ▽ の先端の隙間 */
left = cx - hm-w
top  = cy - SPRITE * FOOT + HEAD_TOP - GAP - hm-h
```

- ⛔ **絵文字 ▽ や文字で描かない。** border 三角なら zoom 0.88〜1.5 のどこでも輪郭が崩れない。

### A-2. ダンジョン (`index.html`)

- `<div id="heroMark"></div>` を **1 枚だけ**追加(`#warriorLabel` の直後、[index.html:3006](index.html#L3006) の並び)。
  CSS は A-1 と同じ形。ただし `position: absolute` / `z-index: 8`(`.allyLabel` の 7 の 1 つ上)。
- 配置は `renderWorld()` の頭上 UI ブロック(§2-3 d と同じ場所)で **毎フレーム主人公を引き直す**:

```
主人公 = heroIsHead ? { x: playerX, y: playerY, size: playerWidth }
                    : (heroRef ? { x: heroRef.x, y: heroRef.y,
                                   size: (heroRef.def && heroRef.def.displaySize) || 96 } : null);
表示条件 = 主人公が居る && !gameOver && その主人公が生存 && 対応スプライトが display:none でない
placeUnscaledUi(heroMark, 主人公.x, 主人公.y, 主人公.size, -(hm-w), -46);
```

- ⚠ `dy = -46` は敵の装備バッジと同じ帯。**名前ラベル(-28)と重ならない**ことを受入条件で測る。
- ⚠ `placeUnscaledUi` を使うこと(§2-3 e)。camZ で縮む書き方をすると寄り引きで位置がずれる。
- ⚠ `#escortMarker` と同じく `try { ... } catch (e) { window.__heroMarkErr = (…||0)+1; }` で包み、
  **失敗回数を観測できる形にする**(黙って消えないため)。

---

## 5. STEP B — 街の看板を羊皮紙の札へ

### B-1. データ(`js/town-map.js`)

`FACILITIES` の各要素に `desc` を**追加**する(既存フィールドは触らない)。文案:

| key | name(既存・不変) | desc(新規) |
|---|---|---|
| tavern | 銀の鹿亭 | 宿と酒。仲間を募り、依頼を受ける |
| shop | 武器防具屋 | 剣・鎧・弓。旅装を整える |
| plaza | 怪しい石段 | 下りれば闇市。牙貨だけが物を言う |

⚠ 文言はユーザーが後で触る前提。**`town.html` に文字列を写さない**(唯一の正は `FACILITIES`)。

### B-2. 見た目(`town.html`)

- `.townSign` を **丸アイコンから羊皮紙の札へ**作り替える。
  - **アイコンは載せない**(ユーザー決定 = テキストだけ)。ただし `f.icon` のデータは残し、
    **compact の `#townHud` ボタンは今まで通り絵文字付きのまま**にする(小画面での識別が落ちるため)。
  - 構成: 上段 = `.townSignName`(施設名 / `font-size: 16px`)、
    下段 = `.townSignDesc`(説明 / `font-size: 12px` / `opacity: 0.85`)。
  - ⚠ `.townSignName` の**クラス名は残す**(既存の DOM 構造に合わせる)。
- 紙の質感は **1 つの変数ブロック**に畳む(§2-5 c の作法):

```css
.townSign {
  --sp-paper-img: url("assets/parchment_plaza.jpg");
  --sp-veil: 0;                 /* 街は明るい紙。闇市の 0.62 と違い暗幕は掛けない */
  --sp-ink: #2e2113;            /* 本文インク(明るい紙なので濃い墨) */
  --sp-ink-soft: #5a4526;
  --sp-edge: rgba(120,86,44,0.85);
  /* …以下、丸のスタイル(border-radius:50% / font-size:30px)は捨てる… */
  width: auto; min-width: 150px; max-width: 210px;
  padding: 6px 12px 7px;
  margin-left: 0; margin-top: 0;
  transform: translate(-50%, -50%);   /* ⭐ タイル中心に置く規則は維持 */
  white-space: nowrap; text-align: center;
  border: 1px solid var(--sp-edge);
  border-radius: 2px;
  background-image: linear-gradient(rgba(0,0,0,var(--sp-veil)), rgba(0,0,0,var(--sp-veil))),
                    var(--sp-paper-img);
  background-size: auto, cover;
  box-shadow: 0 2px 8px rgba(0,0,0,0.6), inset 0 0 18px rgba(120,80,30,0.25);
}
```

- ⚠⚠ 位置決めを `margin-left/-top` から `transform: translate(-50%,-50%)` へ移すこと。
  幅が可変になるので固定 `-32px` では中心がずれる。
  ⛔ ただし `.townSign:hover { transform: scale(1.12); }` は **`translate` を潰す**ので、
  `transform: translate(-50%,-50%) scale(1.06)` の形へ書き直す(消さない)。
- `.beckon`(初回に鹿亭を光らせる)は**残す**。札の縁が光る形へ読み替えてよい。

---

## 6. 受入条件

新規ドライバ `tools/driver_heromark_signplate.js` で機械的に測る。
⭐ **負のコントロールはドライバに内蔵する**(`--mutate <key>` で赤くならなければ `exit 1`)。

### 装置(先に母集団を確かめる)

- **(Z1)** town.html / index.html が起動し、検証シームが載っている
- **(Z2)** ⭐⭐⭐ **主人公が後衛の編成を実際に作れた**(`__heroMark.heroIsHead() === false`)。
  これを先に確かめずに (A3) を測ると、**永久に「頭だけ」を測って緑になる**
- **(Z3)** 変異アンカーが 1 ファイル 1 箇所にヒットする(0 件ヒットなら `exit 3` で死ぬ)

### A. ▽ マーカー

1. **(A1)** 街: `#townHeroMark` が主人公の**頭の天辺より上**にある
   (下端 ≤ `cy - 96×0.93 + 32`)、かつ**頭から 32px 以内**(浮きすぎていない)
2. **(A2)** 街: 主人公が 3 マス歩いたあと、▽ が**同じ相対位置**に居る(追従している。誤差 ±2px)
3. **(A3)** ⭐⭐ ダンジョン: **主人公が後衛(僧侶)の編成で、▽ が「頭」ではなく「主人公 ally」に付く**
   (▽ の中心 x が主人公 ally の中心 x と一致し、頭の中心 x とは一致しない)
4. **(A4)** ⚠⚠⚠ ダンジョン: **NPC 頭が死んで主人公が頭へ昇格したあとも ▽ が生きている**
   (§2-3 b。`tryPromoteNewHead` を直接呼んで確かめてよい)
5. **(A5)** ダンジョン: ▽ の下端が名前ラベルの上端より上(重なっていない)
6. **(A6)** ダンジョン: 主人公が死ぬ / `gameOver` で ▽ が消える
7. **(A7)** `window.__heroMarkErr` が **0**(try-catch が一度も発火していない)

### B. 羊皮紙の札

8. **(B1)** 3 施設の札に **`name` と `desc` の両方**が出ている(`desc` は `FACILITIES` の文字列と一致)
9. **(B2)** 札に**絵文字が 1 文字も含まれていない**(アイコン廃止の機械検査)
10. **(B3)** ⭐ 札の**中心の `elementFromPoint` が自分自身か子孫**(= 押せる。§2-2 c と同じ物差し)
11. **(B4)** desktop 1440x900 で、**札の上端が `#townTitle` の下端より下**(帯に潜っていない)
12. **(B5)** desktop 1440x900 で、説明文の**実効文字高が 10px 以上**(`font-size × zoom`)
13. **(B6)** 3 枚の札が**互いに重なっていない**(矩形の交差が 0)
14. **(B7)** compact 390x844 で `#townHud` のボタンが 3 つとも押せる(既存の姿のまま)

### C. 非退行・撤退

15. **(C1)** `tools/verify_town_map.js` が **85/85 のまま**
16. **(C2)** `?heromark=0` で ▽ が両ページとも DOM に無い / `?signplate=0` で看板が**今日と同じ丸アイコン**に戻る
17. **(C3)** ⭐⭐⭐ 撤退の測り方は「`=0` で緑」ではなく、**同じ assert を両モードへ当てて崩れること**を見る
18. **(C4)** 既存 golden の非退行: `driver_graph_p6`(244)/`driver_grid_p8`(56)/`driver_doors_p8`
19. **(C5)** 両ページとも `pageerror` 0 件

### 負のコントロール(`--mutate`)

| key | 変異 | 赤くなるべき条件 |
|---|---|---|
| `markhead` | ▽ の追従先を**常に頭**へ固定する | (A3) |
| `marklow` | ▽ の `dy` を `-46` → `+40` にする | (A1) / (A5) |
| `plateflat` | 札から `.townSignDesc` を出さない | (B1) |
| `platehide` | 札を `#townTitle` の下へ潜らせる | (B4) |

---

## 7. 撤退スイッチ

- `?heromark=0` — ▽ を **DOM ごと作らない**(`town.html` / `index.html` の両方で読む)
- `?signplate=0` — 看板を今日と同じ丸アイコン + 名前ラベルへ戻す(`town.html`)

⚠ `town.html` の作法に合わせ、**描画より前に判定する**([town.html:250-265](town.html#L250-L265) と同じ位置)。
⚠ クエリはページ遷移をまたがない。街だけの `?signplate=0` は `sessionStorage` へ写さなくてよいが、
`?heromark=0` は**両ページで独立に読む**(酒場経由で index へ渡らない点を依頼書として了承する)。

---

## 8. やらないこと

- ⛔ **敵・仲間 NPC には ▽ を付けない。** 主人公 1 人だけ
- ⛔ **既存の金色グローと「(あなた)」ラベルを消さない**(▽ は追加)
- ⛔ **`tavern.html` の闇市の札(`.pqcard`)を触らない**。街の札は新規に書く
- ⛔ **compact の `#townHud` ボタンから絵文字を消さない**(小画面の識別が落ちる)
- ⛔ **`assets/` に新しい画像を足さない**(紙は既存の `parchment_plaza.jpg` を流用)
- ⛔ **`FACILITIES` の `name` / `icon` / 座標を書き換えない**(`desc` の**追加**だけ)
- ⛔ 街の絵(`town_phlan.jpg`)の描き直し・看板の位置移動

---

## 9. changelog(⚠ `index.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>自分のキャラの頭上に金色の ▽ が出るようになった</b> — 仲間と入り乱れても、どれが自分か一目で分かる。"
py tools/add_changelog.py "<b>街の看板が羊皮紙の立て札になった</b> — 施設名だけでなく「何ができる場所か」も書いてある。"
```

⚠ 1 コミット = 1 行。`index.html` を含まないコミット(街だけ・ドライバだけ)ではフックは鳴らないので、
**空振りの行を足さないこと**(CLAUDE.md ⭐⭐⭐ の方針)。

---

## 10. 実装結果(実装窓が埋める)

- コミット:
- ドライバ結果:
- 実測で分かったこと:
