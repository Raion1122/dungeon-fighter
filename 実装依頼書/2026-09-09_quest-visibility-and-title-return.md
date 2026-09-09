# #64 受注の器 + 封蝋 + 記憶へ戻る道

- **起草**: 2026-09-09(計画窓) / **ステータス**: **承認済**(2026-09-09 ユーザー承認)
- **着手**: ⏸ **#63(砦の畳み)の着地後**。⚠ 引き渡し時点で隣窓が `index.html` と
  `tools/driver_graph_p6.js` / `driver_graph_p7.js` / `driver_grid_s2.js` /
  `driver_spawn_not_on_gate.js` / `tools/make_grid_map.py` を編集中 = **作業ツリーは clean でない**。
  ⭐ 着地の判定は台帳の文面でなく **`git status` が clean になったこと**で行う。
- **会議記録**: [dev-meetings/2026-09-09_quest-visibility-and-title-return.md](../dev-meetings/2026-09-09_quest-visibility-and-title-return.md)(第1段 + 第2段まで承認済)
- **触るファイル**: `tavern.html` / `world.html` / `town.html` / `tools/verify_quest_visibility.js`(新規)
- ⛔ **触らないファイル**: `js/world-map.js` / `js/save-slots.js` / `index.html` / `tools/make_grid_map.py` / `assets/room_orc-fort_*`
  — **別窓が依頼書 #63(砦の畳み)を実装中**で、`tools/make_grid_map.py` と砦の MAP 素材に未コミット差分がある。
  本チケットはこれらを**一度も開かずに完了できる**(§2-16 で確認済み)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
  ⭐ 着手は **#63 の着地後**が望ましい(`tavern.html` は #63 が触らない見込みだが、`git status` を読んでから始めること)。

---

## 1. 目的

受注した依頼が「今どれなのか」を画面から読み取れない。世界地図には羊皮紙の立て札が 7 枚並ぶだけで、受注していても**見た目が 1px も変わらない**。依頼の名前(「ゴブリンの巣窟」)はどのページにも出ておらず、そもそも**どこにも保存されていない**(§2-1 / §2-2)。

加えて、一度キャラを選んで潜り始めると**キャラ選択画面へ戻る道が 1 本も無い**。`title.html` が `location.replace` で自分を履歴から消しているため、スマートフォンの戻るジェスチャでも戻れない。プレイヤーからは「詰んだ」ように見える。

**ユーザー決定(2026-09-09)**:

- **候補② に候補③ の封蝋を混ぜ、戻るボタンを同じチケットに入れる。**
- ⭐ 不採用になった案(後で効くので残す):
  - **候補①(最小の 3 点留め)** … 器を作らないので**クエスト名が原理的に出せない**。`questDest` はシナリオ id しか持たない(§2-1)。要望が半分しか満たせない
  - **候補③ 単独** … 要望 3(戻る導線)を 1 mm も解決しない
  - **候補④(共通メニュー)** … `index.html` にも及び、#63 と並走する面が広くなる
  - **クエストログ画面(journal)** … 会議でガイウスが提案したが「導線が足りないのに導線を増やすのは筋が悪い」で次の議題送り(§12)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⭐ **この節が依頼書の価値の大半。** 数値には出所を、コマンドはそのまま貼る。

### 2-1. 受注状態を表すものの全数

```bash
grep -rn 'questDest' --include=*.html --include=*.js . | grep -v node_modules
grep -n 'prepScenario = ' tavern.html
```

| ファイル:行 | いつ | 何 |
|---|---|---|
| `tavern.html:7812` | 出発時(`viaWorld` が真の枝**だけ**) | `sessionStorage["dragonfighters.questDest"] = prepScenario.id` |
| `world.html:887` | 地図の起動時 | 上を `getItem` |
| `world.html:1086` | 札に着いたとき | `WM.scenarioOfNode(id) !== questDest` なら入場ダイアログを開かない |
| `world.html:1118` | 「入る」を押したとき | `removeItem` で消費 |
| `tavern.html:6236` | 受注時 | `prepScenario = sc`(**JS 変数**) |
| `tavern.html:7651` | 準備画面の「戻る」 | `prepScenario = null` |

**受注中を表す永続値は `questDest` ただ 1 つで、中身はシナリオ id の文字列だけ**(リポジトリ全文 grep で実測)。`prepScenario` はページを 1 枚またいだ瞬間に消える。

⚠ 生成クエスト(掲示板 / 闇市)では `questDest` が**書かれない**。
`tools/verify_quest_walk.js:1272` の (1c) が「生成クエストで出発 → `index.html` へ直行し、`questDest` が書かれない」を**受入条件として持っている**。

### 2-2. クエスト名の在処

```bash
grep -n 'place:' tavern.html | head -12
grep -n '^\s*title:' tavern.html | head -12
```

| シナリオ | `place:` | `title:` |
|---|---|---|
| `tavern.html:3386/3387` | 廃坑 | ゴブリンの巣窟 |
| `tavern.html:3418/3419` | 町外れの森 | 盗賊団の根城 |
| `tavern.html:3438/3439` | 沼地 | リザードマン族長の討伐 |
| `tavern.html:3458/3459` | 廃墟の砦 | オーク将軍ガロック |
| `tavern.html:3478/3479` | 地下神殿 | リッチと召喚の儀 |
| `tavern.html:3498/3499` | ドラゴンの巣 | レッドドラゴン「ファラクサス」 |

`tavern.html:10002` が既に `sc.place + " — " + sc.title` の形で組んでいる。
⚠ `js/world-map.js:61-67` の `label` は `place` の写しだが **`title` を持たない**(そのファイルのコメント自身が「札の文言の唯一の正は `tavern.html` の `place:`」と書いている)。

### 2-3. ⚠⚠⚠ 罠 A — 会議の「街は `#townHud` にボタンを 1 個足すだけ」は**崩れた**

```bash
grep -rn "townHud" tools/*.js
```

```js
// tools/verify_town_exit.js:653  (1a)
check('(1a) .townSign の枚数 == FACILITIES.length / compact 390 の #townHud button も同数',
      s.signCount === s.facCount && !!cs && cs.hudCount === cs.facCount, ...)

// tools/driver_heromark_signplate.js:401  (B7a)
check('(B7a) compact 390x844 の #townHud ボタンが 4 つとも押せる',
      cs.hudCount === 4 && cs.hudClickable === 4, ...)
```

**`#townHud` に button を 1 個足すと、この 2 本が同時に赤くなる。** (1a) は `FACILITIES.length` から導いており、(B7a) は **4 を直書き**している。

⇒ **だから戻るボタンは `#townHud` の外に、独立した固定要素として置く**(街も世界地図も同じ作りに揃える)。§7 で確定。

### 2-4. ⚠⚠⚠ 罠 B — 印を器から出すと「印が出るのに入れない」

`questDest` は **sessionStorage**、新設する器は **localStorage**。タブを閉じて開き直すと**器だけ残って `questDest` が消える**。そのとき器で封蝋を出すと、入場の可否は `world.html:1086` の `questDest` 一致で決まるままなので、**封蝋が付いた札を押しても何も起きない**。

⇒ **封蝋は `questDest` から出す。器からは出さない。器は名前を出すためだけに使う。**
⭐ この罠は §9 の変異 `sealfromvessel` として装置に内蔵させる。

### 2-5. ⚠⚠⚠ 罠 C — `#worldHud` という id は **予約済み**

```js
/* world.html:806-811 */
   ⚠ #worldHud はまだ無い (後続項目が compact 用の帯を足すならここが読み口)。 */
function insets() {
  var elTitle = document.getElementById("worldTitle");
  var elHud   = document.getElementById("worldHud");
  var top = elTitle ? elTitle.offsetHeight : 0;
  var bottom = 0;
  if (elHud && elHud.offsetHeight > 0) { ... bottom = elHud.offsetHeight; }
```

**戻るボタンの器に `worldHud` という id を付けると `insets().bottom` が 0 から動き、地図の幾何が引き直される。**
⇒ id は **`worldBack`**(街は `townBack`)にする。⭐ 変異 `hudid` として内蔵。

### 2-6. ⚠⚠⚠ 罠 D — `world.html` に `localStorage.setItem` という**語**を書くと赤

```js
/* tools/verify_road_events.js:1354-1359  (2c) */
const n = (needle) => m.served.split(needle).length - 1;
const rm = n('sessionStorage.removeItem');
const lset = n('localStorage.setItem'), lrm = n('localStorage.removeItem');
const ok = rm === BASE_REMOVE && lset === 0 && lrm === 0;
```

**配信バイトの文字列カウント**なので、**コメントに書いただけでも 1 件と数えられて赤くなる**。既存コメント(`world.html:1236` / `1339`)が「localStorage へ書かない」と語を避けているのはこのため。

⭐ 一方、**読むのは安全**。`world.html:697`(`partyComposition`)と `881`(`cleared`)が既に `getItem` している。(2c) は `setItem` / `removeItem` しか数えていない。
⭐ **`sessionStorage.setItem` も縛られていない**(既存の `QUEST_WALK_OFF_KEY` が同じことをしている)。ただし `sessionStorage.removeItem` は **1 件のまま**でなければならない。

### 2-7. ⚠⚠ 罠 E — `__world` に検証シームを 1 つも足せない / `js/world-map.js` を触れない

```js
/* tools/verify_road_events.js:1488-1502  (4b) */
const KEEP = ['heroNode', 'heroPx', ... 25 個 ...];
const added = s.keys.filter(k => KEEP.indexOf(k) < 0);
if (!eqList(added.slice().sort(), ['roadEvent'])) why.push('⛔ 足された窓が roadEvent 以外にもある: ...');
```

`__world` の窓は **26 個ちょうど**で恒等固定されている。⇒ **世界地図側の受入は DOM から測る**
(`document.querySelector('.worldSeal')` / `#worldTitle small` の `textContent`)。⭐ 変異 `seamwindow` として内蔵。

同じファイルの (4a) は `WORLD_MAP` の NODES / EDGES / STEPS / SITES を **sha1 で恒等固定**している
(14 / 14 / 10 / 6)。⇒ **`js/world-map.js` にフィールドを 1 つも足せない**(`seal: true` などを書いた瞬間に赤)。

### 2-8. ⭐⭐ 会議の想定を超えた事実 — 生成クエストも `openPrep` を通る

```bash
grep -n "openPrep(" tavern.html
```

| ファイル:行 | 経路 |
|---|---|
| `tavern.html:6125` | 単身出発の確認 → 「一人で行く」 |
| `tavern.html:6133` | 依頼カードの「受ける」 |
| `tavern.html:9464` | **闇市ポドルプラザの生成クエスト**(`openPrep(synthetic)`) |
| `tavern.html:9743` | **もう 1 本の生成クエスト**(`openPrep(synthetic)`) |
| `tavern.html:6235` | 定義本体 |

**呼び口 4 本すべてが `openPrep` を通る。** ⇒ **器を `openPrep` の中に書けば、生成クエストにも自動で乗る。**
会議は「生成クエストは対象外」と読んでいたが、**名前の常時表示は生成クエストでも出る**(封蝋だけが出ない。`questDest` が書かれないため)。

⚠ `tavern.html:6066` に「**openPrep() の中に入れない**」という警告があるが、あれが禁じているのは
**待ちを挟むこと**(「そこに待ちを挟むと 7 本のドライバが黙ってハングする」)。
器の書き込みは同期処理なので該当しない。⛔ ただし **`await` を足さない**こと。

### 2-9. 器を消す場所は 1 箇所に畳める

```bash
grep -n 'lastResult' index.html tavern.html
```

| ファイル:行 | 何 |
|---|---|
| `index.html:38057` | クリア / 敗北で `lastResult` を書く(`cleared` / `defeated`) |
| `index.html:38119` | **撤退**で `lastResult` を書く(`retreated: true`) |
| `tavern.html:5463-5465` | `consumeResult()` が読んで `removeItem` する **唯一の消費口** |

**3 経路すべてで必ず書かれる**ので、器を消すのは `consumeResult()` の中 **1 箇所**でよい。

### 2-10. ⭐ 3 面が同じ構造を持っていた

| ページ | 見出し | 副行 | 現在の文言 |
|---|---|---|---|
| `world.html:549` | `#worldTitle` | `small` | 行き先をタップ / 街道の点線をたどって歩く |
| `town.html:375` | `#townTitle` | `small` | 行きたい場所をタップ / 看板をタップで中へ |
| `tavern.html:3035` | `#title` | `small` | Silver Stag Tavern — フランの町・復興半ばの交易都市 |

⭐ **3 面とも「見出し + `<small>` 1 行」で完全に同型**。会議は酒場の置き場を特定していなかったが、実測で見つかった。
⚠ `#worldTitle` / `#townTitle` は `pointer-events: none`(帯の下の札を押せなくしないため)。
`tavern.html:67` の `#title` は `position: absolute` で `pointer-events` の指定なし。

**どの副行も golden で逐語固定されていない**:

```bash
grep -rn "行きたい場所\|行き先をタップ\|Silver Stag" tools/*.js    # → 0 件
```

### 2-11. ⚠ 副行に**行を足す**と地図の幾何が動く

`world.html:807` の `insets()` は `#worldTitle` の `offsetHeight` を**実測**する。
街も同型で、`verify_town_exit.js` (1b) が「札が全部 `#townTitle` の下端より下」を測る。

⇒ ⛔ **行数を増やさない。既存の 1 行を差し替える。** ⭐ 変異 `addline` として内蔵。

### 2-12. 戻る道が安全である根拠

```js
/* js/save-slots.js:250-267  switchTo() */
snapshot();   // ① 先に焼く。ここを飛ばすと進行が消える
wipeLive();   // ②
...           // ③ 流し込む
lsSet(ACTIVE_KEY, String(n));  // ④
```

`switchTo` も `newGame`(285-) も**必ず先に `snapshot()` を焼く**。
⇒ ⛔ **`js/save-slots.js` は 1 行も触らない。** 戻るボタンがやるのは `location.href = "title.html"` **1 行だけ**。

`LIVE_PREFIX = "dragonfighters."` / `KEEP = { settings, panelCollapsed }`。
⇒ 器のキーを `dragonfighters.activeQuest` にすれば、**スロット保存に自動で乗る**(`KEEP` に入れない = スロットごとに独立)。

### 2-13. キー名の衝突確認

```bash
grep -rn "activeQuest" --include=*.html --include=*.js .   # → 0 件
```

### 2-14. 新規ドライバの base port

```bash
grep -rhoE "1[0-9]{4}" tools/*.js | sort -n | uniq | awk '$1>=10100 && $1<=10400'
# → 10101 10102 10109 10121 10122 10131 10139 10141 10142 10150 10151
#    10161 10162 10169 10171 10172 10176 10180 10181 10182 10188 10240 10264
```

⚠ **#63 が 10201..10208 を予約済み**(`実装依頼書/2026-09-09_orc-fort-fold.md:154`)。
⇒ **#64 は base `10221`**(10221..10228 を掴む)。

### 2-15. changelog の要否

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
# → GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

**鳴る。** `tavern.html` を触る(器の書き / 消し / 副行の差し替え)。
⭐ プレイヤー向けの要約は実在する。§11 に 3 行分の文面を用意。
⚠ `world.html` / `town.html` / `title.html` は非トリガー。

### 2-16. 並走の確認

```bash
git -c core.quotepath=false status --short
# →  M tools/make_grid_map.py
#    ?? assets/room_orc-fort_n4_map.jpg
#    ?? assets/room_orc-fort_n7_map.jpg
git log --oneline origin/main..HEAD
# → ef70295 #63 起草 …(未 push 1 本)
```

隣窓は **#63 の砦 MAP を作業中**。本チケットが触る 3 つの html はどれも差分に含まれていない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | 器の書き(`openPrep` 内)/ 消し(`consumeResult` 内)/ `#title small` の差し替え / 撤退スイッチの写し |
| `world.html` | `#worldTitle small` の差し替え / `.worldSeal` の付与 / `#worldBack` ボタン |
| `town.html` | `#townTitle small` の差し替え / `#townBack` ボタン |
| `tools/verify_quest_visibility.js` | 新規(受入・base **10221**) |

⛔ **`js/world-map.js` / `js/save-slots.js` / `index.html` は開かない**。§2-7 / §2-12 / §2-9 で「開く必要が無い」ことを確認済み。
⛔ **`実装依頼書/README.md` の #64 行は、別窓の #63 が着地してから足す**(行の文面は §12 に用意してある)。

---

## 4. STEP1 — 受注中の器

**`tavern.html` だけを触る。表示はまだ作らない**(#5〜#6 と同じ「土台だけ先に固める」作法)。

### 4-1. 撤退スイッチの写し(ページをまたぐので sessionStorage へ)

```js
/* ★[#64] 受注中の依頼の可視化。⚠⚠ クエリはページ遷移をまたがないので、
   **見た時点で sessionStorage へ写して**全ページで読む (?town=0 と同じ作法)。 */
var QUEST_MARK_OFF_KEY = "dragonfighters.questMarkOff";
try {
  if (new URLSearchParams(location.search).get("questmark") === "0") {
    sessionStorage.setItem(QUEST_MARK_OFF_KEY, "1");
  }
} catch (e) {}
function isQuestMarkOn() {
  try { return sessionStorage.getItem(QUEST_MARK_OFF_KEY) !== "1"; } catch (e) { return true; }
}
```

⚠ 同じ形を `world.html` / `town.html` にも置く(各ページが独立に読む)。
⛔ `?titleback=0` と相乗りさせない(赤が出たときどちらの撤退か切り分けられなくなる)。

### 4-2. 器

```js
/* ★[#64] 受注中の依頼。⭐ **名前を出すためだけ**の器。
   ⛔ 入場の可否を器で決めない —— それは questDest の仕事 (依頼書 §2-4 の罠 B)。
   ⭐ キーは dragonfighters. で始まるので DFSlots のスロット保存に自動で乗る。
      KEEP には入れない = スロットごとに独立する。 */
var ACTIVE_QUEST_KEY = "dragonfighters.activeQuest";
function writeActiveQuest(sc) {
  if (!isQuestMarkOn() || !sc) return;
  try {
    localStorage.setItem(ACTIVE_QUEST_KEY, JSON.stringify({
      id: sc.id || null,
      place: sc.place || "",
      title: sc.title || "",
      at: Date.now(),
    }));
  } catch (e) {}
}
function clearActiveQuest() {
  /* ⭐ 撤退中でも消す。消すのは常に安全側 (fail-safe)。 */
  try { localStorage.removeItem(ACTIVE_QUEST_KEY); } catch (e) {}
}
function readActiveQuest() {
  if (!isQuestMarkOn()) return null;
  try {
    var o = JSON.parse(localStorage.getItem(ACTIVE_QUEST_KEY) || "null");
    return (o && typeof o === "object" && o.place) ? o : null;
  } catch (e) { return null; }
}
```

保存される形(合成値):

```json
{"id":"goblin-mine","place":"廃坑","title":"ゴブリンの巣窟","at":1757400000000}
```

### 4-3. 書き口は `openPrep` の中 1 箇所

```js
async function openPrep(sc) {
  prepScenario = sc;
  writeActiveQuest(sc);          /* ★[#64] ⭐ 呼び口 4 本すべてがここを通る (依頼書 §2-8)。
                                    ⛔ btnAccept 側に置くと闇市の生成クエストが乗らない。
                                    ⛔ await を足さない (:6066 の警告 = ドライバがハングする)。 */
  document.getElementById("prepTitle").textContent = `出発の準備 — ${sc.place}`;
```

⛔ **`btnAccept`(`tavern.html:6133`)側に置かない。** 生成クエストの 2 本(`:9464` / `:9743`)が乗らなくなる。

### 4-4. 消し口は `consumeResult()` の中 1 箇所

```js
(function consumeResult() {
  const resultRaw = sessionStorage.getItem("dragonfighters.lastResult");
  if (!resultRaw) return;
  sessionStorage.removeItem("dragonfighters.lastResult");
  clearActiveQuest();            /* ★[#64] ⭐ クリア/敗北/撤退の 3 経路すべてがここへ来る
                                    (依頼書 §2-9)。⛔ 消し口を増やさない。 */
```

⛔ **`world.html` に消し口を置かない。** `localStorage.removeItem` という語を書いた瞬間に (2c) が赤くなる(§2-6)。

---

## 5. STEP2 — 常時表示 3 面

⭐ **3 面とも同じ形。既存の `<small>` の `textContent` を差し替える。⛔ 行を増やさない**(§2-11)。

### 5-1. 文言を組む(3 面で同じ)

```js
/* ★[#64] 受注中の副行。⛔ 未受注なら null を返し、既定の文言に 1 文字も触らない。 */
function questSubline() {
  var q = readActiveQuest();
  if (!q) return null;
  return q.title ? ("受注中 — " + q.place + "「" + q.title + "」")
                 : ("受注中 — " + q.place);
}
function applyQuestSubline(titleId) {
  var line = questSubline();
  if (!line) return;                       /* ⛔ 未受注では触らない */
  var el = document.getElementById(titleId);
  var sm = el ? el.querySelector("small") : null;
  if (!sm) return;
  sm.textContent = line;                   /* ⭐ 差し替え。⛔ appendChild しない */
}
```

### 5-2. 3 面の呼び口

| ファイル | 呼ぶもの |
|---|---|
| `world.html` | `applyQuestSubline("worldTitle")` |
| `town.html` | `applyQuestSubline("townTitle")` |
| `tavern.html` | `applyQuestSubline("title")` |

⚠ `world.html` では **`layout()` が走る前**に呼ぶ(高さは変わらない設計だが、順序を揃えておく)。
⛔ **`world.html` / `town.html` で器を書かない・消さない**。読むだけ(§2-6)。

---

## 6. STEP3 — 封蝋(`world.html` のみ)

### 6-1. 出す条件は `questDest`。⛔ 器ではない

```js
/* ★[#64] 受注中の目的地の印。⭐ 出す条件は questDest **だけ**。
   ⛔ 器 (activeQuest) から出さない —— 器は localStorage で questDest は sessionStorage なので、
      タブを開き直すと「印は出るのに押しても入れない」が起きる (依頼書 §2-4 の罠 B)。
   ⭐ 判定式は入場条件 (:1086) と同じものを使う = 印が出る ⟺ 入れる。 */
if (isQuestMarkOn() && questDest && WM.scenarioOfNode(id) === questDest) {
  var seal = document.createElement("span");
  seal.className = "worldSeal";
  sign.appendChild(seal);        /* ⭐ .worldSign の **子**。⛔ 兄弟にすると枚数の勘定が濁る */
}
```

⛔ **`.worldSign` の class を持つ要素を増やさない。**
`verify_quest_walk.js:1571` が「DOM の `.worldSign` を**実際に数えて** 7 と比べる」。子として足せば枚数は動かない。

⛔ **`js/world-map.js` に `seal:` などのフィールドを足さない**(§2-7 の (4a) が sha1 で固定)。

### 6-2. CSS

```css
/* ★[#64] 依頼の封蝋。⛔ box-shadow のアニメは iPhone で落ちるので transform + opacity だけ。 */
.worldSeal {
  position: absolute; left: 50%; top: -14px;
  width: 18px; height: 18px; margin-left: -9px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #d4402f, #8e1b14 70%, #5a0f0a);
  border: 1px solid #3a0a06;
  pointer-events: none;                     /* ⚠ 札のクリックを奪わない */
  animation: worldSealPulse 2s ease-in-out infinite;
}
@keyframes worldSealPulse {
  0%, 100% { transform: scale(1);    opacity: 0.92; }
  50%      { transform: scale(1.12); opacity: 1; }
}
```

⚠ `pointer-events: none` は必須。付けないと `verify_world_map.js` (7d) の「札の中心の `elementFromPoint` が自分自身か子孫」が**封蝋の位置しだいで赤くなる**。

---

## 7. STEP4 — 「はじめの画面へ」(`world.html` / `town.html`)

### 7-1. 置いてはいけない場所が 3 つある

- ⛔ **`#townHud` の中** … `verify_town_exit.js` (1a) と `driver_heromark_signplate.js` (B7a) が赤(§2-3)
- ⛔ **id を `worldHud` にする** … `insets().bottom` が動いて地図の幾何がずれる(§2-5)
- ⛔ **`#worldTitle` / `#townTitle` の中** … `pointer-events: none` を外すと札 7 枚のクリックが死ぬ(§2-10)

⇒ **独立した固定要素。id は `worldBack` / `townBack`。左上の隅。**

### 7-2. マークアップと CSS(2 面で同じ)

```html
<button type="button" id="worldBack">← はじめの画面へ</button>
```

```css
/* ★[#64] キャラ選択画面 (title.html) へ戻る道。
   ⛔ #worldHud という id にしない (insets() が拾って地図の幾何がずれる・依頼書 §2-5)。
   ⚠ z-index は帯 (10) より上・イベント箱 (15) と入場ダイアログ (20) より下。 */
#worldBack {
  position: fixed; z-index: 12;
  left: 10px; top: calc(8px + env(safe-area-inset-top, 0px));
  min-height: 44px;                         /* 指で押せる高さ */
  padding: 6px 12px;
  font-family: 'MedievalSharp', 'Cinzel', serif; font-size: 14px;
  color: #f5e8c8;
  background: linear-gradient(to bottom, var(--wood-mid, #6b5334), var(--wood-dark, #3f2f1c));
  border: 2px solid var(--parchment-gold, #c8a45a);
  border-radius: 8px;
  cursor: pointer;
}
#worldBack:active { transform: translateY(1px); }
```

### 7-3. 押したときの動作は 1 行

```js
/* ★[#64] ⛔ location.replace にしない —— href なら履歴に前のページが残り、
   タイトルで気が変わったときに戻ってこられる (title.html:445 の逆をやる)。
   ⛔ js/save-slots.js は 1 行も触らない。進行はスロット選択時に switchTo() が
      必ず先に snapshot() を焼くので守られる (依頼書 §2-12)。
   ⚠ 押し口は click と touchend の 2 本 (click 非発火端末の保険・#5 の罠)。 */
function bindBack(el) {
  if (!el) return;
  var run = function (ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    location.href = "title.html";
  };
  el.addEventListener("click", run);
  el.addEventListener("touchend", run);
}
```

⛔ 確認ダイアログは作らない。進行が消えないので押しても損が無く、危険な操作(「はじめから」)は
`title.html` 側に 2 段タップ確認が既にある(`verify_title_screen.js` の受入条件 4)。

### 7-4. 撤退スイッチの写し

```js
var TITLE_BACK_OFF_KEY = "dragonfighters.titleBackOff";
try {
  if (new URLSearchParams(location.search).get("titleback") === "0") {
    sessionStorage.setItem(TITLE_BACK_OFF_KEY, "1");
  }
} catch (e) {}
/* OFF なら DOM ごと remove する。⛔ display:none で残さない
   (elementFromPoint に写って受入条件が濁る・#25 の作法)。 */
```

---

## 8. 撤退スイッチ

- **`?questmark=0`** … 器・常時表示 3 面・封蝋がまとめて今日の姿へ戻る
- **`?titleback=0`** … 戻るボタンが 2 面とも消える

⚠ 判定位置 = **各ページの IIFE の先頭**。ページ遷移をまたぐので **sessionStorage へ写す**
(`?town=0` と同じ作法)。⛔ 2 本を相乗りさせない。

⭐ **2 本は独立**。片方を OFF にしてももう片方は生きる(§9 の (6c) が測る)。

---

## 9. 受入条件 — `tools/verify_quest_visibility.js`(新規・base **10221**)

⭐ **世界地図側は `__world` を使わず DOM から測る**(§2-7 の罠 E)。
観測するのは「器の中身」「3 面の副行の文字列」「`.worldSeal` の枚数」「`#worldBack` / `#townBack` の可押性」。
⛔ **観測しないもの**は §9-8 に明記。

### §0 装置(先に母集団を確かめる)

- **(0a)** 器を仕込んだ状態と素の状態で `#worldTitle small` の `textContent` が**違う値を返す**
  ⭐ **これが無いと全 assert が空振りで永久緑になる**
- **(0b)** 期待文言を写経していない — `tavern.html` の `SCENARIOS` から `place` / `title` を
  **ブラウザで引いて**組み立て、画面の文字列と突き合わせる
- **(0c)** 素の `world.html` で `.worldSign` が **7 枚**ある(封蝋の母集団が立っている)

### §1 器

- **(1a)** 依頼カードから**実クリック**で受注 → `localStorage["dragonfighters.activeQuest"]` が
  `{id, place, title, at}` の 4 キーを持ち、`place` / `title` が `SCENARIOS` の実体と一致
- **(1b)** ⭐ **闇市の生成クエスト**で受注しても器が書かれる(§2-8。`openPrep` を通るため)
- **(1c)** `lastResult` を **cleared / defeated / retreated の 3 経路それぞれ**で仕込んで酒場を開く →
  器が 3 回とも消えている
- **(1d)** 器のキーが `KEEP` に入っていない = `DFSlots.snapshot()` の `data` に含まれる

### §2 常時表示

- **(2a)** 受注後、`#worldTitle small` / `#townTitle small` / `#title small` の 3 面が
  `受注中 — 廃坑「ゴブリンの巣窟」` になる(文言は (0b) の実体から組む)
- **(2b)** 未受注では 3 面とも**今日の文言のまま**(1 文字も変わらない)
- **(2c)** ⭐ `#worldTitle` の `offsetHeight` が **受注前と受注後で同じ**(行を増やしていない)
- **(2d)** `#townTitle` の下端より下に `.townSign` が全部ある(`verify_town_exit` (1b) と同じ不変条件)

### §3 封蝋

- **(3a)** `questDest = "goblin-mine"` を仕込む → `.worldSeal` が **ちょうど 1 枚**で、
  その親の `.worldSign` が廃坑のノードのもの
- **(3b)** `.worldSign` の枚数が **7 のまま**(封蝋は子として足されている)
- **(3c)** ⭐⭐ **器はあるが `questDest` が無い**状態 → `.worldSeal` は **0 枚**
  (罠 B の検査。器から出していたらここで赤くなる)
- **(3d)** 7 枚の札の中心の `elementFromPoint` が自分自身か子孫(封蝋が奪っていない)

### §4 戻る道

- **(4a)** `world.html` に `#worldBack` / `town.html` に `#townBack` があり、
  中心の `elementFromPoint` が自分自身か子孫(= 実際に押せる)
- **(4b)** ⭐ **実クリック**で `title.html` に着き、かつ `history.length` が**増えている**
  (`replace` にしていない)
- **(4c)** 戻った先でスロットを選ぶと `xp` / `gold` / 主人公が戻る
  (`verify_title_screen.js` の受入条件 3 と同じ手順を借りる)
- **(4d)** ⭐ `document.getElementById("worldHud")` が **null のまま** = `__world.insets().bottom === 0`
  (罠 C の検査)

### §5 恒等(非退行)

- **(5a)** `__world` の窓が **26 個のまま**(⛔ 1 つも足していない)
- **(5b)** `world.html` の配信バイトに `localStorage.setItem` / `localStorage.removeItem` が **0 件**、
  `sessionStorage.removeItem` が **1 件**
- **(5c)** `WORLD_MAP` の `NODES` / `EDGES` / `STEPS` / `SITES` が無傷(14 / 14 / 10 / 6)
- **(5d)** ⭐ compact 390 の `#townHud` の button 数が **`FACILITIES.length` のまま**(罠 A の検査)

### §6 撤退

- **(6a)** `tavern.html?questmark=0` で受注 → 器が書かれず、3 面の副行が既定のまま、`.worldSeal` が 0 枚
- **(6b)** `world.html?titleback=0` / `town.html?titleback=0` → `#worldBack` / `#townBack` が **DOM ごと無い**
- **(6c)** ⭐ **2 本が独立** — `?questmark=0` だけで戻るボタンは生き、`?titleback=0` だけで副行と封蝋は生きる

### §9-8 ⛔ 測らないこと

- **封蝋の配色・寸法・脈動の周期** … 実機の目視で動かす余地を残す。数値で縛らない
- **戻るボタンの文言** … 「← はじめの画面へ」は暫定。ユーザーが実機で決める
- **`#worldBack` / `#townBack` の座標** … 左上は暫定。⭐ 縛るのは「押せること」(4a)と
  「札の `elementFromPoint` を奪わないこと」(3d)の 2 つだけ

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `sealfromvessel` | ⭐ 封蝋を**器から**出す(`questDest` を見ない) | (3c) |
| `addline` | ⭐ 副行を差し替えでなく `appendChild` で**足す** | (2c) |
| `hudid` | ⭐ 戻るボタンの id を `worldHud` にする | (4d) |
| `seamwindow` | ⭐ `__world` に `activeQuest` の窓を足す | (5a) |
| `lsword` | ⭐ `world.html` のコメントに `localStorage.setItem` と書く | (5b) |
| `hudbutton` | ⭐ 戻るボタンを `#townHud` の中の `button` にする | (5d) |
| `replacenav` | 戻るを `location.replace` にする | (4b) |
| `noclear` | 帰還時に器を消さない | (1c) |
| `skipgen` | 器の書きを `openPrep` でなく `btnAccept` に置く | (1b) |
| `sealsibling` | 封蝋を `.worldSign` の**兄弟**にして class も `worldSign` にする | (3b) |

⭐ **§2-3 / §2-4 / §2-5 / §2-6 / §2-7 の罠がすべて変異として内蔵されている。**

### 既存 golden の非退行(⭐⭐⭐ **着手前に必ず 1 回走らせて基準を控える**)

⚠ 下表は**着手前に実測して埋める欄**。#61 の教訓 = 「赤の予想は必ず外れるので、本番を触る前に色を控える」。

| ドライバ | 着手前 | 実装後 |
|---|---|---|
| `tools/verify_quest_walk.js` | (控える) | 同じ |
| `tools/verify_world_map.js` | (控える) | 同じ |
| `tools/verify_town_exit.js` | (控える) | 同じ |
| `tools/verify_town_map.js` | (控える) | 同じ |
| `tools/driver_heromark_signplate.js` | (控える) | 同じ |
| `tools/verify_title_screen.js` | (控える) | 同じ |
| `tools/verify_road_events.js` | (控える) | 同じ |
| `tools/verify_road_ambush.js` | (控える) | 同じ |
| `tools/verify_player_sheet.js` | (控える) | 同じ |
| `tools/verify_tavern_map.js` | (控える) | 同じ |
| `tools/verify_npc_crowd.js` | (控える) | 同じ |
| `tools/verify_world_steps.js` | (控える) | 同じ |
| `tools/verify_world_heromark.js` | (控える) | 同じ |
| `tools/verify_save_slots.js` | (控える) | 同じ |

⚠⚠ **母集団の見積もりは常に不足する**(#62 で「リスト外で 5 本が赤くなった」)。
⇒ 上の 14 本で緑を保てても、`tools/` を 1 周させて増えた赤が 0 であることを最後に確かめる。

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` では音が出ない)。

- 封蝋の脈動が 390px の iPhone で**うるさくない**か。速すぎたら周期を 2s から伸ばす
- 歩行中(街道を辿っている最中)に**駒が跳ねない**か
- 副行の「受注中 — 廃坑「ゴブリンの巣窟」」が compact(16px)で**読めるか**。長い依頼名
  (「レッドドラゴン「ファラクサス」」)で**折り返して帯が伸びないか** ⚠ 伸びると地図の幾何が動く
- 戻るボタンが左上で**親指に届くか**。右手持ちだと遠い可能性がある(右上へ移す判断は実機で)
- 戻るボタンが世界地図の札や街の看板と**重なっていないか**

---

## 11. changelog(⚠ `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>受注中の依頼が画面にずっと出るようになった</b> — 地図と街と酒場の見出しの下に、いま受けている依頼の名前が表示される。"
py tools/add_changelog.py "<b>依頼の地に赤い封蝋の印が付く</b> — 世界地図で向かうべき場所がひと目で分かる。"
py tools/add_changelog.py "<b>はじめの画面へ戻れるようになった</b> — 街と世界地図の左上のボタンから、記録の選び直しができる。進行は消えない。"
```

⭐ 3 行とも**プレイヤーに見える変化**。⛔ コミット件名のコピペにしない。
⚠ 既定 4 件維持なので、古いものを落としながら積む。

---

## 12. やらないこと

- ⛔ **クエストログ(journal)画面** … 会議でガイウスが提案したが次の議題送り。
  「導線が足りないのに導線を増やすのは筋が悪い」(ノエル)
- ⛔ **依頼人・報酬・受注日の保持** … 器に入れない。入れると表示画面が要る
- ⛔ **潜行中(`index.html`)の常時表示と戻るボタン** … 戦闘の画面に情報を足さない
- ⛔ **主人公まで伸びる光の線** … 歩行アニメと衝突する(会議で却下)
- ⛔ **生成クエストへの封蝋** … `questDest` が書かれないので原理的に出ない(§2-1)。
  ⭐ ただし**名前の常時表示は出る**(§2-8)
- ⛔ **`js/world-map.js` にフィールドを足す** … (4a) の sha1 が赤
- ⛔ **`__world` に窓を足す** … (4b) の恒等が赤
- ⛔ **`js/save-slots.js` を触る** … 戻る道は `location.href` 1 行で足りる
- ⛔ **`#townHud` に button を足す** … (1a) と (B7a) が赤
- ⛔ **`実装依頼書/README.md` への行追加**(別窓の #63 着地後)。用意してある行:

    | 64 | [2026-09-09_quest-visibility-and-title-return.md](2026-09-09_quest-visibility-and-title-return.md) | **承認済** | 0% | 受注中の依頼を器に持たせ、3 面の副行と世界地図の封蝋で見せる + 街と世界地図から title.html へ戻る道。⚠⚠ `#townHud` に button を足すと golden 2 本が赤 / ⚠⚠ id `worldHud` は `insets()` が拾う予約語 / ⚠⚠ `world.html` に `localStorage.setItem` の**語**を書くと赤 / ⭐ 封蝋は `questDest` から出す(器からだと「印が出るのに入れない」) |

---

## 13. 実装結果

(実装窓が埋める)
