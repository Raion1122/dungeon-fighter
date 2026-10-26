# #101 港町フランにも「📜 更新情報」の窓を置く(中身は js/changelog.js の 1 か所へ)

- **起草**: 2026-10-26(計画窓) / **ステータス**: **承認済**(2026-10-26 ユーザー承認)
- **基準**: `de7617e`(clean・push 済) / 新規ドライバの port base **10640**
- **触るファイル**: `js/changelog.js`(新規)・`tavern.html`・`town.html`・`tools/add_changelog.py`・
  `scripts/hooks/check_changelog.py`・`tools/verify_town_changelog.js`(新規)・`CLAUDE.md`(運用節の書き換え)・
  `実装依頼書/README.md`(#101 行)
- ⛔ **触らないファイル**: なし(並走している別窓なし。起草時 `git status` = clean)

---

## 1. 目的

更新情報は今、銀の鹿亭(`tavern.html`)右上の `#changelogBox` にしか無い。タイトル → 酒場 → 港町 → …と
動くので、港町フラン(`town.html`)の街中でも最近の変更を開けるようにする。

ただし文面を 2 ページへ書き写すと二重管理になり、しかも追記ツールとコミット時チェックが
**`tavern.html` しか見ていない**(§2-1)ので、港町側は黙って古くなる。そこで文面を共有ファイル
`js/changelog.js` へ移し、**酒場と港町の両方がそこから描く**。追記ツールとチェックもそちらを見るよう直す。

**ユーザー決定(2026-10-26)**:

- **文面の置き場 = 共有ファイル `js/changelog.js`**(採用)。
  - ✗ 不採用「港町が `tavern.html`(745KB)を取得して `<ul>` を抜き出す」— ツール無改修で済むが、
    4 行を見せるために港町を開くたび重いページを取りにいく。
  - ✗ 不採用「2 ファイルへ書いて、チェックで一致を強制」— 仕組みは単純だが同じ文面が 2 か所に残る。
- **港町の初期状態 = 常にたたんで出す**(どの画面幅でも「📜 更新情報 ▸」の見出しだけ。タップで開く)。
  - ✗ 不採用「酒場と同じ判定(PC は開いて出す)」— §2-3 のとおり幅 720px で開いて出すと
    武器防具屋の看板の上に重なって押せなくなる。
  - ⭐ 酒場の判定(PC では開いて出す)は**変えない**。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 更新情報に触れている場所(リポジトリ全文 grep で実測)

    grep -rln 'changelogList\|changelogBox' --include=*.js --include=*.py --include=*.html --include=*.md . \
      | grep -v node_modules | grep -v '^./実装依頼書/完了'

本番コード・ツールで**動く**のは次の 4 か所だけ(他はコメント・依頼書・会議録):

| ファイル:行 | 何 |
|---|---|
| `tavern.html:3425-3433` | `#changelogBox` の本体。`<ul class="changelogList">` の中に `<li>` が**直書きで 4 件**(3428-3431) |
| `tavern.html:3434-3448` | 折りたたみの IIFE。compact = `(max-width: 560px)` ∨ `(max-height: 480px)` ∨ `(hover: none)` の 3 条件で `collapsed` を付け、見出しのクリックで開閉 |
| `tools/add_changelog.py:27` | `TAVERN = …/"tavern.html"` 固定。`changelogList` を含む `<ul` 行〜`</ul>` を行単位で書き換える |
| `scripts/hooks/check_changelog.py:24-25, 47-48` | `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`。`BLOCK_RE = <ul class="changelogList">(.*?)</ul>` を `:tavern.html` と `HEAD:tavern.html` で比べ、同じなら commit を止める |

- CSS は `tavern.html:1179-1220`(本体・折りたたみ)/ `:913-915`(タッチ端末で拡大)/ `:946-947`(スマホで位置)。
- コメントで言及しているだけ: `js/map-walk.js:70`・`tools/verify_sheet_equip.js:26`(「酒場の位置は #changelogBox の高さで動く」)・
  `tavern.html:1680/1710/1722/1743/2841/6365/11155`・`town.html:578`(「tavern.html と同じ 3 条件」)。
- `town.html` には更新情報が**1 つも無い**(`grep -c changelog town.html` = 0)。

### 2-2. ⚠⚠⚠ 罠 — 新しいチェックの「判定不能なら通す」が永久に素通しになる

今のチェックは、ブロックが見つからないとき**安全側で通す**:

    # scripts/hooks/check_changelog.py:49-51
    # 判定不能(tavern.html 未ステージ / 初回コミット等)は安全側でブロックしない
    if staged_block is None or head_block is None:
        sys.exit(0)

これを `js/changelog.js` 用にそのまま書き換えると、**目印の綴りを 1 文字違えただけで
`staged_block` が毎回 `None` になり、以後すべてのコミットが無言で通る**(チェックが死んでも誰も気づかない)。
しかも `--no-verify` が封鎖されている分、ここは「止まらない方向」に壊れると発見手段が無い。

⇒ **次のとおり分ける**(§4 STEP1):

| 状態 | 扱い |
|---|---|
| `HEAD:js/changelog.js` が無い(移行コミット) | 通す(従来どおり) |
| `HEAD` にはあるのに、ステージ版で目印が見つからない | ⛔ **止める**(「目印が見つからない」と出す) |
| 両方見つかって同じ | 止める(従来どおり) |
| 両方見つかって違う | 通す |

⭐ この罠は §8 の負のコントロール **`hook-silent`**(目印不在で exit 0 を返す旧来の書き方)として装置に内蔵すること。

### 2-3. 港町の画面に置いたときの重なり(実 Chrome で実測・2026-10-26)

`de7617e` を http 配信し、`town.html` / `tavern.html` を 3 画面で開いて矩形を取った([left, top, right, bottom])。

| 画面 | 港町の固定要素 | 港町の看板 | 酒場の `#changelogBox` |
|---|---|---|---|
| 1440×900 | `#townTitle` [0,0,1440,69] z10 / `#townBack` [10,8,154,52] z12 / `#dfSheetBtn` [18,842,209,882] z62 | tavern [560,128,769,175]・shop [860,128,1024,175]・plaza [116,627,326,674]・gate [282,183,492,230] | [1140,20,1420,360] 開 |
| 720×900 | `#townTitle` [0,0,720,69] / `#townBack` 同上 / `#dfSheetBtn` 同上 | tavern [270,283,388,309]・**shop [439,283,532,309]**・plaza [19,565,137,591]・gate [113,314,231,341] | [420,20,700,360] 開 |
| 390×844(mobile) | `#townTitle` [0,0,390,63] / `#townHud` [0,684,390,844] z11 / `#townBack` 同上 | (compact は看板でなく `#townHud` のボタンで入る) | [230,20,370,69] 畳 |

読み取れること:

- **右上は空いている**(港町の固定要素は左上の `#townBack` と全幅の帯 `#townTitle` だけ)。
- ⚠ 酒場と同じ寸法(幅 280・高さ 340)で開いて置くと、**720×900 で shop の看板の中心 (485,296) を覆う**
  → `verify_town_map` の `(11b-boundary720)`「4 施設が押せる」が赤くなる。これが「常にたたむ」を選んだ理由。
- ⚠ **`#townTitle` は全幅・中央寄せ**。酒場のように top:20px に置くと、390 幅で副題
  「行きたい場所をタップ / 看板をタップで中へ」(およそ x 70〜320)に重なる。
  ⇒ 港町では**帯の下**(top ≥ 帯の下端)へ置く。帯の高さは 69px(デスクトップ)/ 63px(compact)。
  ⛔ 酒場は `#title` が左寄せになる(compact で [12,18,136,67])ので同じ問題は無い。酒場の位置は動かさない。
- 港町の z-index は 1/2/3/4/5/10/11/12/62 が使用中(`town.html:276` のコメント + 上表)。帯 (10) より上に出すので **12** を使う(`#townBack` と同じ)。

**計測コマンド**(再測定するとき): 起草窓の使い捨てプローブ。要点だけ書く —
`puppeteer-core` で 3 画面を開き、`#townTitle/#townBack/#townHud/#changelogBox/.townSign` と
`position:fixed` の全要素の `getBoundingClientRect()` を出す。localStorage に
`partyComposition=["warrior"]`・`prologueSeen=1`・`plazaState={unlocked,everEntered,gatekeeperEventSeen}` を入れてから開くこと
(入れないとプロローグが被る)。

### 2-4. 港町に無い CSS 変数

酒場の箱は `--parchment-bg / --parchment-ink / --parchment-ink-soft / --parchment-border / --parchment-shadow / --parchment-gold`
を使う(`tavern.html:12-17` で定義)。港町の `:root`(`town.html:68-73`)にあるのは **`--parchment-ink` と `--parchment-gold` だけ**。
⚠ CSS をそのまま写すと**背景が透明**になり、地図の上で文字が読めない。足りない 4 つを港町の `:root` へ足す
(値は `tavern.html:12-17` と同じ。⚠ `tavern.html:1418-` の闇市版の値は写さない)。

### 2-5. 文面は描画の前に同期で入れる(酒場の位置を 1px も動かさない)

`tavern.html` の `<script src="js/…">` は `<head>` 内(2929-2958、`</head>` = 2959)、箱は `<body>` の 3425。
⇒ `js/changelog.js` を `<head>` で読み、**箱の直後の既存 IIFE の中で同期に `<li>` を入れれば**、
初回描画の時点で今と同じ 4 件が入っている(後から入れると箱の高さが変わり、
`verify_sheet_equip` が言う「酒場の位置は #changelogBox の高さで動く」が起きる)。
基準の矩形: 1440×900 で [1140,20,1420,360]、390×844 で [230,20,370,69](§2-3)。

### 2-6. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC` を読んだ結果: `("index.html", "tavern.html", "audio.js")`。
`town.html` は非トリガーだが、**`tavern.html` を触るので鳴る**。
書けるプレイヤー向けの要約は実在する(港町に窓が増える) → §10。
⚠ `tavern.html` の書き換えは「見た目が 1 つも変わらない変更」なので、**港町の窓と同じコミットに入れる**(§5)。
酒場だけ先に単独コミットしない(書ける要約が無い = CLAUDE.md の禁止パターン)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/changelog.js`(新規) | 文面の唯一の正。`window.DF_CHANGELOG`(文字列配列・先頭=最新)と描画関数 `window.dfFillChangelog(ul)` |
| `tools/add_changelog.py` | 対象を `js/changelog.js` の目印の間へ。文字列は JSON で書く |
| `scripts/hooks/check_changelog.py` | 比べる対象を `js/changelog.js` の目印の間へ。§2-2 の 4 分岐 |
| `tavern.html` | `<head>` で `js/changelog.js` を読む。`<ul>` の直書き 4 件を消し、既存 IIFE で `dfFillChangelog` を呼ぶ。CSS・折りたたみ判定は不変 |
| `town.html` | `<head>` で `js/changelog.js` を読む。右上・帯の下に `#changelogBox`(常に畳んで開始)。CSS 変数 4 つ追加。撤退 `?townlog=0` |
| `tools/verify_town_changelog.js`(新規) | 受入ドライバ(§8)。port 10640 |
| `CLAUDE.md` | 「更新情報(changelog)の運用」節: 置き場を `js/changelog.js` へ、港町にも出ることを追記 |

---

## 4. STEP1 — 共有ファイルとツール 2 本(トリガー 3 ファイルは触らない)

### `js/changelog.js`(新規)

```js
/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>闇市の地下街に住人</b> — …",
  …(tavern.html:3428-3431 の 4 件を同じ順・同じ文字で)…
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
```

- ⚠ 2 件目(古物商)の `D&amp;D` と 4 件目(薬屋と杖屋)の素の `D&D` は**今の文字のまま**移す
  (`innerHTML` で入れるので見た目は同じ。揃えない — (1b) が 1 文字単位で比べる)。
- 文字列は JSON 互換の二重引用符・1 行 1 件・行末カンマ。

### `tools/add_changelog.py`

- 対象を `ROOT/"js"/"changelog.js"` へ。`/* CHANGELOG:BEGIN */` 行と `/* CHANGELOG:END */` 行の間を 1 行 1 件として読む。
- 新しい件は `json.dumps(entry, ensure_ascii=False)` で文字列リテラルにして先頭へ。`--max`(既定 4)で切る。
- `<li>…</li>` で渡されたら外側の `<li>` を剥がす(今の挙動の互換)。
- 目印が無ければ `sys.exit("error: …")`(黙って何もしないのは禁止)。
- `--file` は残す(既定値だけ変える)。

### `scripts/hooks/check_changelog.py`

- `GAME_LOGIC` は**不変**(`town.html` は足さない — §11)。
- `SOURCE = "js/changelog.js"`、`BLOCK_RE = /\* CHANGELOG:BEGIN \*/(.*?)/\* CHANGELOG:END \*/`(re.S)。
- §2-2 の 4 分岐。止めるときのメッセージは「`js/changelog.js` の更新情報が未更新」/「`js/changelog.js` に BEGIN/END の目印が見つからない」の 2 種。
- ⭐ この STEP の時点で手で 1 回確かめる: `index.html` に空白 1 つ足して `git add` → `git commit` が止まる
  → `git restore --staged index.html && git checkout index.html` で戻す。

⚠ この STEP のあと STEP2 までの間、酒場はまだ直書きを表示している(`add_changelog.py` は js にしか書かない)。
**STEP1 と STEP2 の間で `add_changelog.py` を使うコミットを挟まない**こと。

---

## 5. STEP2 — 酒場を js から描く + 港町に窓(1 コミット・changelog 1 行)

### `tavern.html`

- `<head>` の `js/abilities.js` の並び(2931 付近)に `<script src="js/changelog.js"></script><!-- 更新情報の文面の唯一の正 (#101)。酒場と港町が共有 -->` を足す。
- `<ul class="changelogList">` の中の `<li>` 4 件を消して空にする(`<ul class="changelogList"></ul>`)。
  直前のコメント「更新時はこの中身を書き換える」を「中身は js/changelog.js (#101)。`py tools/add_changelog.py` で追記」へ。
- 既存 IIFE(3436-)の `if (!box) return;` の直後に `if (window.dfFillChangelog) window.dfFillChangelog(box.querySelector('.changelogList'));` を 1 行。
- ⛔ CSS(913-915 / 946-947 / 1179-1220)と compact の 3 条件は**1 文字も変えない**。

### `town.html`

- `<head>` の `<script src="js/…">` の並び(408-413)に同じ 1 行。
- `:root` に `--parchment-bg / --parchment-ink-soft / --parchment-border / --parchment-shadow` を足す(値は `tavern.html:12,14,16,17`)。
- `<body>` の `#townBack` の後に:

```html
<!-- ★[#101] 更新情報。文面は js/changelog.js (酒場と共有)。
     ⚠ 常にたたんで出す — 720px 幅で開いて出すと武器防具屋の看板を覆う (依頼書 §2-3)。
     ⛔ #townHud / #townTitle の子にしない (前者は golden 2 本の button 数、後者は pointer-events:none)。
     ⚠ ?townlog=0 のときは JS が DOM ごと remove する。 -->
<div id="changelogBox" class="collapsed">
  <div class="changelogHeader">📜 更新情報</div>
  <ul class="changelogList"></ul>
</div>
```

- CSS は酒場の 1179-1220 を写して**港町用に 3 点だけ変える**(⛔ 酒場とセレクタは共有しない。#41 と同じ流儀):
  - `position: fixed; right: 10px; z-index: 12;`
  - `top` = **帯の下**。値は実装窓が決める(受入は「`#townTitle` と交わらない」で縛る。§8)。
    ⚠ safe-area を足すなら `env(safe-area-inset-top, 0px)` を `#townTitle` と同じく加える。
  - 開いたときの `max-height` は「帯の下〜`#townHud` の上」に収まる値(compact で `#townHud` と交わらない)。
- JS(`HERO_MARK_ON` 等の撤退判定の並び、`town.html:460-470` 付近):

```js
/* ★[#101] 更新情報 — 撤退 ?townlog=0 (このページだけ。sessionStorage へ写さない = ?heromark=0 と同じ型) */
(function () {
  var box = document.getElementById("changelogBox");
  if (!box) return;
  if (new URLSearchParams(location.search).get("townlog") === "0") { box.remove(); return; }
  if (window.dfFillChangelog) window.dfFillChangelog(box.querySelector(".changelogList"));
  var header = box.querySelector(".changelogHeader");
  if (header) header.addEventListener("click", function (ev) {
    ev.stopPropagation();
    box.classList.toggle("collapsed");
  });
})();
```

- ⛔ compact 判定で開閉を変えない(常に `collapsed` で始める。ユーザー決定)。
- `py tools/add_changelog.py "…"`(§10)を同じコミットで。

---

## 6. STEP3 — 受入ドライバ `tools/verify_town_changelog.js`(§8)

流用元: `tools/verify_town_map.js`(`openTown` の purge + seed、`findBrowser`、`startServer(port, mutKey)` の配信差し替え)。

### STEP4 — 非退行 + CLAUDE.md + §12 + README

- `CLAUDE.md` の「更新情報(changelog)の運用」: 「銀の鹿亭 … `changelogList`」→「文面は `js/changelog.js`(酒場と港町が共有)」、
  チェックの説明を「`js/changelog.js` が未更新のコミットを中止」へ。トリガー 3 ファイルの記述は不変。

---

## 7. 撤退スイッチ

- **`town.html?townlog=0`** — 港町の窓を DOM ごと消す(今日の港町と同じ姿)。
- ⚠ 判定位置 = `town.html` の §5 の IIFE。ページ遷移をまたがない(sessionStorage へ写さない)。
- ⚠ 酒場には撤退スイッチを付けない(見た目が変わらない移し替えなので戻す姿が無い)。
  文面の置き場を戻すときは `git revert`。

---

## 8. 受入条件 — `tools/verify_town_changelog.js`(新規・port 10640)

方針: **文面は 3 経路で突き合わせる** — (A) 配信した `js/changelog.js` の**テキスト**を Node 側で正規表現で抜いた配列 /
(B) 酒場の DOM の `<li>` / (C) 港町の DOM の `<li>`。ページ内の `window.DF_CHANGELOG` を正にしない
(実装とドライバが同じ間違いを共有しないため)。配置は §2-3 の 3 画面で矩形と `elementFromPoint` で見る。
チェックは一時ディレクトリに `git init` した使い捨てリポで**実際に commit させて** exit code を見る。

### §0 装置(先に母集団を確かめる)

- **(0a)** (A) の配列が **4 件**、各件に `<b>` を含む(正規表現が空振りしていない)
  ⭐ **これが無いと文面一致の assert が空振りで永久緑になる**
- **(0b)** 3 画面とも港町の `.townSign` が 4 枚・`#townTitle` の矩形が高さ > 0(矩形の検査が空振りしていない)
- **(0c)** 使い捨てリポで「`index.html` だけ変えた commit」が**止まる**(チェックが実際に動いている)

### §1 文面の一致(唯一の正)

- **(1a)** (A) == (B) == (C)(件数・順・`innerHTML` の文字列)
- **(1b)** 酒場の `<li>` の 4 件が `git show de7617e:tavern.html` の直書き 4 件と `innerHTML` で一致(移し替えで 1 文字も変わっていない)
  ⚠ STEP2 で §10 の 1 件が先頭に入るので、比べるのは**2〜4 件目 == de7617e の 1〜3 件目**(4 件目は押し出される)
- **(1c)** `tavern.html` / `town.html` の**配信バイト**の `changelogList` の中に `<li>` の直書きが 0 件(二重管理が残っていない)

### §2 港町の窓

3 画面(1440×900 / 720×900 / 390×844 mobile)それぞれで:

- **(2a)** 開いた直後は `collapsed`(リストは `display:none`)
- **(2b)** 箱の矩形が画面内・`#townTitle`・`#townBack`・`#dfSheetBtn`・(compact は)`#townHud` と交わらない
- **(2c)** 4 施設が押せる(compact = `#townHud` のボタン / それ以外 = 看板。`verify_town_map` (11b) と同じ `elementFromPoint` 判定)
- **(2d)** 見出しの中心の `elementFromPoint` が見出し自身 → クリックで開き、リストが見えて `<li>` 4 件 → もう一度で畳む
- **(2e)** 見出しをクリックしても主人公のタイルが変わらない(地図の歩きへ抜けていない)
- **(2f)** 開いた箱の背景が透明でない(`getComputedStyle(box).backgroundImage !== 'none'` — §2-4)
- **(2g)** compact で開いたとき箱の下端 ≤ `#townHud` の上端

### §3 酒場の恒等(非退行)

- **(3a)** 酒場の `#changelogBox` の矩形が 1440×900 で [1140,20,1420,360]、390×844 で [230,20,370,69](§2-3 の基準。±1px)
  ⚠ 1440 の高さは文面の長さで動く(`max-height: 38vh` で頭打ち = 342px)。§10 の 1 件で変わったら、
  **期待値を書き換える前に**「de7617e の 4 件を js に入れた変異で [1140,20,1420,360] に戻る」ことを確かめる
- **(3b)** 酒場の折りたたみ: 1440×900 で開・390×844 で畳(従来どおり)

### §4 チェック(使い捨てリポで実 commit)

一時ディレクトリに `git init` → `scripts/hooks/`・`js/changelog.js`・空の `index.html` を置き、
`core.hooksPath=scripts/hooks` で初回 commit してから:

- **(4a)** `index.html` だけ変えた commit → **止まる**(exit ≠ 0)
- **(4b)** `index.html` + `py tools/add_changelog.py --file <tmp>/js/changelog.js "…"` → **通る**
- **(4c)** `index.html` + `js/changelog.js` の BEGIN 行を壊した commit → **止まる**(§2-2)
- **(4d)** `tools/` だけ変えた commit → 通る(トリガー外)
- **(4e)** `add_changelog.py` を 5 回 → 件数 4・先頭が最新・(A) と同じ正規表現で読める

### §5 撤退

- **(5a)** `town.html?townlog=0` → `#changelogBox` が DOM に無い・4 施設が押せる
- **(5b)** `?townlog=0` は酒場へ遷移したあと効かない(酒場の箱はある)

### ⛔ 測らないこと

- 港町の箱の**正確な座標と幅**(`top` の値・右余白・開いたときの幅)— 目で動かす余地を残す。縛るのは「交わらない」「押せる」だけ。
- 文面の中身(どの 4 件か)— 次のコミットで変わる。(1a) の 3 経路一致と (0a) の件数だけ見る。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

配信スナップショットをメモリ上で差し替える(本番ファイルは書き換えない)。チェックの変異は使い捨てリポ側で差し替える。

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `town-copy` | 港町の `<ul>` に直書き `<li>` を入れ、`dfFillChangelog` を呼ばない(文面を 1 件古く) | (1a)(1c) |
| `tavern-static` | 酒場の `<ul>` に de7617e の直書き 4 件を戻し、`dfFillChangelog` を呼ばない | (1c) |
| `town-open` | 港町の `class="collapsed"` を外す | (2a)(2c-boundary720) |
| `town-top20` | 港町の箱を `top:20px` に置く(酒場と同じ) | (2b) |
| `no-vars` | 港町の `:root` に足した 4 変数を消す | (2f) |
| `bubble` | 見出しの `ev.stopPropagation()` を消し、`#changelogBox` を `#townViewport` の中へ移す | (2e) |
| ⭐ `hook-silent` | チェックを「ステージ版で目印が見つからなければ exit 0」に戻す(§2-2 の罠) | (4c) |
| `hook-tavern` | チェックの比較対象を旧来の `tavern.html` の `<ul>` に戻す | (4a) または (4b) |

### 既存 golden の非退行(実装後に必ず走らせる)

起草窓が `de7617e` で実際に走らせた値(2026-10-26):

| ドライバ | 期待 | なぜ対象か |
|---|---|---|
| `node tools/verify_town_map.js` | **85/85** | 港町の看板・HUD・compact の押せる判定 ((11b)(R2)) |
| `node tools/verify_town_exit.js` | **23/23** | 港町 ⇄ 酒場の導線 |
| `node tools/driver_heromark_signplate.js` | **46/46** | 港町の札が押せる(4 直書き) |
| `node tools/verify_sheet_equip.js` | **21/21** | 酒場の位置が `#changelogBox` の高さで動く(コメント 26 行目) |

+ #100 で使った母集団(`tools/` の全ドライバ)の緑→赤 0 を #100 §12 と同じ手順で。

⚠ 基準値は 2026-10-26 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須。

- PC(1440 前後)の港町で、右上の「📜 更新情報 ▸」が帯の文字に被らず、タップで開いて読めること。
- スマホ縦で、見出しが「← はじめの画面へ」・帯の副題・下の施設ボタンに被らないこと。開いたときに下の施設ボタンを隠さないこと。
- 酒場の更新情報が今日と同じ見た目であること(先頭に §10 の 1 件が増えるのは正常)。

---

## 10. changelog(⚠ `tavern.html` を触るので必須・STEP2 のコミットで)

    py tools/add_changelog.py "<b>港町フランにも更新情報</b> — 街の右上の「📜 更新情報」をタップすると、最近の変更が読める。"

⚠ STEP1 で `add_changelog.py` の書き込み先が `js/changelog.js` に変わっているので、STEP2 ではこれで酒場と港町の両方に出る。

---

## 11. やらないこと

- ⛔ `GAME_LOGIC` に `town.html` を足す(トリガー範囲の変更は別判断。今回は文面の置き場だけ)。
- ⛔ 酒場の更新情報の位置・寸法・折りたたみ判定を変える。
- ⛔ 他のページ(`world.html` / `title.html` / `index.html` / 闇市の地下街)に窓を置く。
- ⛔ 「未読の更新があるよ」の印(既読管理)。
- ⛔ 開閉状態を覚えておく(酒場も覚えていない)。
- ⛔ 件数(既定 4)を変える。
- `実装依頼書/README.md` の行(承認時に足す):

    | 101 | [2026-10-26_town-changelog.md](2026-10-26_town-changelog.md) | **承認済** | 0% | 港町フランにも「📜 更新情報」(常に畳んで開始・帯の下の右上)。文面は `js/changelog.js` の 1 か所へ移し、酒場と港町が共有。⭐ 追記ツールとコミット時チェックも js を見る。⚠⚠ チェックは「目印が見つからない」を**止める**(通すと永久に素通し) |

---

## 12. 実装結果

(実装窓が埋める)
