# #81 酒場の依頼を「戻るたびに入れ替わる 2 件」へ + 奥の小部屋を武器防具屋へ

- **起草**: 2026-10-02(起草窓) / **ステータス**: **承認済**(2026-10-02 ユーザー承認)
- **基準 HEAD**: `36f4ba0`(作業ツリー clean・origin/main と一致)
- **触るファイル**: `tavern.html` / `js/tavern-map.js` / `tools/verify_tavern_map.js`(言い直し)/ `tools/verify_quest_draw.js`(新規)
- ⛔ **触らないファイル**: `index.html` / `town.html` / `world.html` / `js/world-map.js` / `js/save-slots.js` / `audio.js`
  — §2 で「開かずに完了できる」ことを確認済み。並走中の別窓は無い(実装窓は #80 完了後で待機)。

---

## 1. 目的

酒場(銀の鹿亭)の地図では、卓 3 つが **廃坑 / 町外れの森 / 沼地 に固定**で、北東の扉「奥の間へ」を開けると
**砦 / 神殿 / 竜の巣** の 3 件が並ぶ。行きたい依頼をいつでも狙って選べるので、「酒場に来たら今日はこの依頼が出ていた」という
手触りが無い。

これを **ダンジョンから戻るたびに入れ替わる 2 件** にする。狙った依頼へピンポイントには行けなくなるが、そのほうがリアル。
空いた「奥の間」は **武器防具屋** にする(扉を押すと店が開く)。

**ユーザー決定(2026-10-02)**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 抽選の母集団 | **解放済みの依頼だけ** | 未解放も混ぜる — 解放は一本道(§2-2)なので「2 件とも ??? で出発できない」日が出る |
| 物語の次の依頼 | **必ず 1 件入れる**(残り 1 件を抽選) | 完全ランダム — 解放 6 件のとき本筋が出るのは約 1/3。本筋が止まる |
| 入れ替わる時 | **ダンジョンから戻るたび**(クリア/敗北/撤退・生成クエストも含む) | 酒場に入るたび — 町と往復すれば引き直せてしまい、狙い撃ちが残る |
| 右下の「🛡️ 武器防具屋」ボタン | **消して扉だけにする** | 残す |

---

## 2. 着手前の実測(基準 HEAD `36f4ba0`)

### 2-1. いまの酒場の姿

| ファイル:行 | 何 |
|---|---|
| `js/tavern-map.js:139-143` | `TABLES` = 3 卓。`t1 goblin-mine enter[4,4] sign[4,1]` / `t2 bandits-forest enter[4,8] sign[4,5]` / `t3 lizard-swamp enter[9,6] sign[9,3]` |
| `js/tavern-map.js:153-160` | `DOORS` = 3 扉。`town`(町へ出る)/ **`back`(奥の間へ・`provisional:true`)** / `plaza`(闇市・解禁前は DOM に作らない) |
| `js/tavern-map.js:166-172` | `SPAWNS` に `back:[13,3]` |
| `tavern.html:10604-10647` | `buildSigns()` — `TVM.TABLES` を回して席札 `#questTable_<scenarioId>` を作り、`TVM.DOORS` を回して扉札 `#tavernDoor_<key>` を作る。**呼び口は `:10826` の 1 箇所だけ**(全文 grep) |
| `tavern.html:10733-10755` | `enterDoor(d)` — `d.key === "back"` → `openBackroom()`(`:10744`) |
| `tavern.html:10767-10776` | `openBackroom()` = `renderTables(scenarios.slice(3))` で #tableArea を全画面に重ねる / `closeBackroom()` |
| `tavern.html:6291-6295` | `isUnlocked(sc)` = `!sc.locked` または `progress.cleared.has(sc.unlockAfter)` |
| `tavern.html:3391` | `<div id="shopEntry">🛡️ 武器防具屋</div>`(右下 HUD)。`:7048` で `openShop` を結ぶ |
| `tavern.html:7027` | `openShop()` — 店の唯一の開き口。街の店先(`enterVia="shop"`)も `:10378` でこれを呼ぶ |
| `tavern.html:5815-5870` | `consumeResult()` — `dragonfighters.lastResult` を **1 回きりで消費**。コメント「クリア/敗北/撤退の 3 経路すべてがここへ来る」。生成クエストの帰還も同じ口(`:5862` で `generated-quest` を分けているのは解放だけ) |
| `tavern.html:9810` | `renderTables()`(引数なし = 全 6 件)。地図モードでは `#tableArea` は `display:none`(`:2752`)、`?tavernmap=0` の 1 枚絵がこれを使う |

### 2-2. ⚠⚠⚠ 罠 1 — 解放は一本道で、序盤は解放済みが 1 件しかない

`tavern.html:3513-3646` の `scenarios` は `locked`/`unlockAfter` で **廃坑 → 森 → 沼地 → 砦 → 神殿 → 竜の巣** の一本道。
新規プレイ(`dragonfighters.cleared` が空)で解放済みは **廃坑の 1 件だけ**。

- 「解放済みから 2 件」をそのまま書くと、序盤は **2 件目が引けない**(配列が 1 件で `pick` が `undefined` を返す)。
- ⇒ 規則: **解放済みが 2 件未満のときは、空いた枠に「次の未解放」(scenarios 順で最初の未解放)を ??? で出す**。
  これは今の見た目(未解放の卓は `???` / `— 未解放 —`)と同じで、`verify_tavern_map` の (2d)「未解放の卓は DOM に在り ??? 表示」も生き残る。

### 2-3. ⚠⚠⚠ 罠 2 — 抽選結果をメモリにしか持たないと、再読込が「引き直し」になる

`buildSigns()` の中で `Math.random()` を引くだけだと、**F5 や 町→酒場の往復**で毎回違う 2 件になり、ユーザー決定
「戻るたび」が黙って「入るたび」に化ける。⇒ **抽選結果は `localStorage["dragonfighters.questBoard"]` に保存**し、
次に読むときは**保存値が正しい限りそのまま使う**。引き直すのは `consumeResult()` が鍵を消したときだけ。

- ⭐ 鍵は `dragonfighters.` で始めること。`js/save-slots.js:45` の `LIVE_PREFIX` で **prefix まるごとコピー**しているので
  (`:77`「キーをハードコード列挙しない」)、記録スロットの切替・新規開始に **1 行も足さずに**追従する。⛔ `save-slots.js` は開かない。
- ⭐ 並び順は問題ない: `consumeResult()`(`:5815`)は `buildSigns()`(`:10826`)より先に評価される IIFE なので、
  鍵を消す → クリアを `progress.cleared` へ反映 → 地図が新しい解放状態で抽選、の順になる。

### 2-4. ⚠⚠ 罠 3 — 保存値の「正しさ」を検査しないと、古い盤面が居座る

記録スロットの切替・`?unlockall=1`・ドライバの種まきで、`cleared` と保存済みの盤面が食い違うことがある。
⇒ 読み出し時に下の **妥当性** を全部満たさなければ捨てて引き直す(§4 の `boardValid()`):

1. ちょうど 2 件 / 席(`t1`〜`t3`)が重複せず実在 / 依頼 id が重複せず `scenarios` に実在
2. 各 id が解放済み — **ただし**解放済みが 2 件未満のときに限り「次の未解放」1 件を許す
3. **本筋**(scenarios 順で最初の「解放済み かつ 未クリア」)が在るなら、それが含まれている

### 2-5. 既存の検証ドライバへの影響(全数 grep)

`grep -lE 'questTable_|TAVERN_MAP\.TABLES|TVM\.TABLES|openBackroom|tavernDoor_back|backroom' tools/*.js`:

| ドライバ | 依存 | 影響 |
|---|---|---|
| `verify_tavern_map.js` | 席札ちょうど 3 枚 (2a)(5b) / TABLES[0] の卓へ歩く (3a) / 奥の間 (4b) | **必ず赤** ⇒ §8-言い直し。**基準 43/43(2026-10-02 実測・HEAD `36f4ba0`)** |
| `driver_depart_menu_clean.js` `:175` | `#questTable_goblin-mine` を押す | 新規状態は「解放 = 廃坑だけ」⇒ 本筋 = 廃坑 ⇒ **廃坑は必ず盤面に居る**(§2-2)。席は動く(歩く距離が変わるだけ) |
| `driver_party_view_reopen.js` `:260` | 同上 | 同上 |
| `verify_quest_walk.js` `:674` | 同上(種 `cleared: []`) | 同上 |
| `verify_recruit_size.js` `:425` | 同上 | 同上 |
| `verify_quest_visibility.js` `:566` | `#questTable_<SC.id>`、`SC = scenarios[0]` = 廃坑。T ページの種は `{}`(`:695`) | 同上 |

⇒ 構造上、上の 5 本は緑のまま残るはず。**ただし色は項目1 で実走して控える**(席が動いて歩数が変わる)。
店を開くドライバ(`verify_scroll_shelf` 8 回・`verify_arcane_eye`/`verify_invisibility`/`verify_mage_hand` 各 1 回)は
**全部 `__equipTV.openShop()` シーム経由**で `#shopEntry` を押していない ⇒ 影響なし。
`verify_town_map.js:608` の `#shopEntry` は**コメントだけ**。

### 2-6. ⚠ `?tavernmap=0`(1 枚絵)では右下ボタンが唯一の店の入口

1 枚絵モードには扉が無く、`#shopEntry` しか店へ行く道が無い。⇒ **DOM は消さず、地図モード + 抽選 ON のときだけ CSS で隠す**
(`body.tavernMapOn.questDrawOn #shopEntry { display: none; }`)。CSS で隠した要素はクリックを受けないので「押せる事故」は起きない。
`?tavernmap=0` の 1 枚絵は **6 卓 + 右下ボタンのまま 1 バイトも変えない**(`verify_tavern_map` (7b) が 6 枚を縛っている)。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ `tavern.html` を触るので**鳴る**。
プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/tavern-map.js` | `DOORS` の `back` を **`shop`**(武器防具屋)へ。撤退用に旧文言を `off` に持たせる。`TABLES` の `scenarioId` は**残す**(撤退時の固定配置 + `verify_tavern_map` (2b) の照合先) |
| `tavern.html` | 盤面の抽選・保存・妥当性検査 / `buildSigns()` を盤面から作る / `enterDoor` の `shop` → `openShop()` / `consumeResult()` で盤面の鍵を消す / `#shopEntry` を CSS で隠す / 撤退スイッチ / 検証シーム / changelog |
| `tools/verify_tavern_map.js` | §8 の言い直し(⛔ assert の本数・文面の意図を減らさない。測定点を移す) |
| `tools/verify_quest_draw.js` | 新規受入。port base **10527** |

⛔ `#backroomBar` / `#tableArea.backroomOpen` の CSS / `openBackroom()` / `closeBackroom()` は**消さない**(撤退 `?questdraw=0` が使う)。
⛔ `scenarios` 配列・`isUnlocked()`・`openDialog()`・`#questBoard`(掲示板の生成クエスト)は触らない。

---

## 4. STEP1 — 盤面(`js/tavern-map.js` の扉 + `tavern.html` の抽選)

### 4-1. `js/tavern-map.js` の扉

```js
    { key: "shop",  name: "武器防具屋",   enter: [13, 2], sign: [13, 3],
      desc: "剣も鎧も巻物も、奥の小部屋で",
      /* ?questdraw=0 のときだけ旧「奥の間」へ戻す (tavern.html の buildSigns / enterDoor が読む) */
      off: { key: "back", name: "奥の間へ", desc: "格の違う依頼はこの奥で" } },
```

- `SPAWNS.back` は残す(`spawnFor` の未知値は `door` へ落ちるので害は無いが、撤退時の整合のため)。
- ⛔ `enter`/`sign` 座標は動かさない(絵の扉に貼り付いている。`js/tavern-map.js:48-50` のコメント)。
- コメント中の「奥の間へ」「#26 で撤去」の記述は、新しい役目に合わせて書き直す。

### 4-2. `tavern.html` — 抽選と保存(地図 IIFE の `buildSigns()` の手前に置く)

```js
    /* ══ 卓の依頼 = 戻るたびに入れ替わる 2 件 (実装依頼書 #81) ══════════════════
       ⭐ 母集団 = 解放済み。本筋 (scenarios 順で最初の「解放済み かつ 未クリア」) は必ず 1 件入れる。
       ⭐ 解放済みが 2 件未満の序盤は、空いた枠に「次の未解放」を ??? で出す (今日の見た目と同じ)。
       ⚠⚠⚠ 抽選結果は localStorage に置く。メモリだけだと再読込や町との往復が「引き直し」に化ける。
       ⚠⚠ 引き直す口は consumeResult() が鍵を消す 1 箇所だけ。⛔ ここに消し口を増やさない。 */
    var BOARD_KEY = "dragonfighters.questBoard";
    var BOARD_SIZE = 2;
    function boardFacts() {
      var unlocked = scenarios.filter(function (s) { return isUnlocked(s); });
      var frontier = unlocked.find(function (s) { return !progress.cleared.has(s.id); }) || null;
      var nextLocked = scenarios.find(function (s) { return !isUnlocked(s); }) || null;
      return { unlocked: unlocked, frontier: frontier, nextLocked: nextLocked };
    }
    function boardValid(b, f) { /* §2-4 の 3 条件。1 つでも外れたら false */ }
    function drawBoard(f) {
      var ids = [];
      if (f.frontier) ids.push(f.frontier.id);
      var rest = f.unlocked.filter(function (s) { return ids.indexOf(s.id) < 0; });
      while (ids.length < BOARD_SIZE && rest.length) {
        ids.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0].id);
      }
      if (ids.length < BOARD_SIZE && f.nextLocked) ids.push(f.nextLocked.id);
      var seats = TVM.TABLES.map(function (t) { return t.key; });
      var out = {};
      ids.forEach(function (id) { out[seats.splice(Math.floor(Math.random() * seats.length), 1)[0]] = id; });
      return { v: 1, seats: out, nonce: Date.now() + "-" + Math.random().toString(36).slice(2, 8) };
    }
    function loadOrDrawBoard() { /* 読む → boardValid → だめなら drawBoard して setItem。try/catch で握る (失敗しても卓は出す) */ }
```

- **席も抽選**(3 卓のうち 2 卓)。依頼の無い 1 卓には札を出さない(座っている客は絵のまま)。
- `nonce` は「引き直したか」を機械で見分けるための印(§8 (3a))。ゲームの判定には使わない。

### 4-3. `buildSigns()` を盤面から作る

- 抽選 ON: `TVM.TABLES` を回し、`board.seats[t.key]` がある卓だけ札を作る。札の id は今と同じ **`questTable_<scenarioId>`**
  (5 本のドライバがこの id で押す)。`goToTable()` に渡す卓は `{ key, enter, sign, scenarioId: 盤面の id }` の**写し**にする
  (⛔ `TVM.TABLES` の要素を書き換えない — 撤退時の固定配置と (2b) の照合が壊れる)。
- 抽選 OFF(`?questdraw=0`): 今のまま `t.scenarioId` で 3 卓。
- ⚠ コメント「未解放の卓も 3 つとも出す」(`:10611`)は「盤面の 2 件を出す。序盤の ??? も隠さない」へ書き直す。

---

## 5. STEP2 — 奥の小部屋を武器防具屋へ

- `enterDoor(d)`: `d.key === "shop"` → `openShop()`。抽選 OFF のときは `buildSigns()` が `d.off` の key/name/desc で札を作り、
  `"back"` → `openBackroom()` の既存経路に乗せる(扉オブジェクトを `Object.assign({}, d, d.off)` で写して渡す)。
- `#shopEntry`: `body` に `questDrawOn` クラスを付け(地図 IIFE の起動時に 1 回)、
  `body.tavernMapOn.questDrawOn #shopEntry { display: none; }`。⛔ DOM は消さない(§2-6)。
- 店を閉じたら主人公は扉の前 (13,2) に立ったまま(何もしない = 今の `closeShop()` のまま)。

---

## 6. STEP3 — 帰還で引き直す

`consumeResult()` の `sessionStorage.removeItem("dragonfighters.lastResult");` の直後(`clearActiveQuest();` の隣)に 1 行:

```js
    try { localStorage.removeItem("dragonfighters.questBoard"); } catch (e) {}   /* ★[#81] 戻るたびに卓の依頼を引き直す。⛔ 消し口はここ 1 つ */
```

- ⭐ クリア/敗北/撤退/生成クエストの帰還が全部ここを通る(`:5819` のコメント)⇒ 1 行で 4 経路を覆う。
- ⛔ `enterVia`(町から入る)や `pagehide` で消さない — それは「入るたび」(不採用案)になる。

### 検証シーム

`window.__TAVERN_TV` に読み取り専用で `board: function () { return 現在の盤面の写し; }` と
`boardFacts: function () { return { unlocked: id 配列, frontier: id|null, nextLocked: id|null }; }` を足す。
⛔ 盤面を書き換えるシームは作らない(ドライバは `localStorage` へ種をまく)。

---

## 7. 撤退スイッチ

- **`?questdraw=0`** — 卓 3 つの固定配置(廃坑/森/沼地)+「奥の間へ」の扉 + 右下の武器防具屋ボタン、つまり今日の姿へ戻る。
- 判定位置 = `tavern.html` の地図 IIFE で 1 回(`?tavernmap=0` の判定 `:2923` と同じ作法の関数宣言)。
  ページ遷移はまたがない(町から入り直すと ON に戻る)= `?tavernmap=0` と同じ dev 専用の扱い。
- ⚠ OFF でも `consumeResult()` の鍵消しは動いてよい(盤面を使わないだけ)。

---

## 8. 受入条件 — `tools/verify_quest_draw.js`(新規・port base 10527)

方針: 盤面は**ブラウザで本番の関数に作らせ**、ドライバは `localStorage` の種(`dragonfighters.cleared` / `dragonfighters.questBoard` /
`sessionStorage["dragonfighters.lastResult"]`)と DOM の札だけで判定する。乱数は固定しない — 決定的に測れる形(種と nonce)で問う。

### §0 装置

- **(0a)** `window.TAVERN_MAP` と `__TAVERN_TV.board` が在り、盤面が 2 件(⭐ 無いと全部空振りで緑)
- **(0b)** 期待値は `scenarios`(ページ内の実体)から**ドライバ側で独立に**計算する(本番の `boardFacts` の写経にしない)。
  `scenarios` が 6 件・一本道であることを先に確かめる

### §1 母集団と本筋

- **(1a)** 新規(`cleared=[]`)→ 札は `questTable_goblin-mine`(押せる)+ `questTable_bandits-forest`(`???`・`.locked`)の 2 枚ちょうど
- **(1b)** `cleared=[廃坑]` → 盤面 = {廃坑, 森}(順不同)・両方押せる
- **(1c)** `cleared` を 1〜5 本の各状態で、鍵を消して 8 回読み直す → **全回で本筋が入り**、もう 1 件は解放済み、未解放の札は 0 枚
- **(1d)** `cleared` = 6 本 → 本筋なし・2 件とも解放済み・重複なし
- **(1e)** 2 経路: DOM の札 id 集合 === `__TAVERN_TV.board().seats` の値集合 === `localStorage` の保存値の集合

### §2 保存(罠 2)

- **(2a)** `cleared` = 3 本で盤面を作らせた後、**再読込 5 回**・**町へ出て戻る 3 回**で `nonce` も席も 1 文字も変わらない
- **(2b)** 妥当な盤面を種まきすると**そのまま採用**される(`nonce` が種のまま)

### §3 引き直し

- **(3a)** 種の盤面(`nonce:"SEED"`)+ `lastResult` を cleared / defeated / retreated / generated-quest の 4 通りで種まき → 4 通りとも `nonce !== "SEED"`
- **(3b)** 妥当性(罠 3): 本筋の欠けた盤面・未解放 id を含む盤面・3 件の盤面・存在しない席の盤面を種まき → 全部**捨てて引き直す**(`nonce !== "SEED"`)

### §4 武器防具屋

- **(4a)** `#tavernDoor_shop` が在り文言が「武器防具屋」/ `#tavernDoor_back` は DOM に無い
- **(4b)** 扉札を押す → 扉前 (13,2) へ歩いてから `#shopScreen` が `display:flex`、`#backroomBar` は出ない
- **(4c)** 地図モードで `#shopEntry` が見えない(`checkVisibility()` false)かつ DOM には在る
- **(4d)** `?tavernmap=0` では `#shopEntry` が見えて押すと店が開く(§2-6)

### §5 撤退

- **(5a)** `?questdraw=0` → 札 3 枚 = 廃坑/森/沼地 が `TABLES` の席どおり・`#tavernDoor_back`「奥の間へ」が奥の間を開く・`#shopEntry` が見える
- **(5b)** ⭐ (1e)(4a)(4c) の 3 条件を ON/OFF の両方へ当てて**全部反転**すること(OFF で緑、だけを見ない)

### ⛔ 測らないこと

- 抽選の**分布の偏り**(一様かどうか)。回数を稼ぐと遅くなるうえ、ユーザーが体感で決める余地を残す。
- 扉札の説明文の文言(「剣も鎧も巻物も、奥の小部屋で」は耳/目で直してよい)。

### 負のコントロール(`--negative`。配信スナップショットをメモリ上で差し替える。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `memonly` | ⭐ 罠 2: 保存せず毎回 `drawBoard()` | (2a)(2b) |
| `lockedpool` | ⭐ 罠 1: 母集団を `scenarios` 全件にする | (1c) |
| `nofrontier` | 本筋を入れない | (1c)(3b) |
| `novalidate` | ⭐ 罠 3: `boardValid` が常に true | (3b) |
| `noreroll` | `consumeResult()` の鍵消しを外す | (3a) |
| `enterreroll` | 不採用案: 地図の起動時に毎回鍵を消す | (2a) |
| `oneonly` | 序盤の ??? 埋めを外す | (1a) |
| `backroomdoor` | `shop` の扉を `openBackroom()` へ | (4b) |
| `shopbtn` | `#shopEntry` を隠す CSS を外す | (4c)(5b) |
| `killshopdom` | `#shopEntry` の DOM を消す | (4c)(4d) |

### 既存 golden の言い直し — `tools/verify_tavern_map.js`(基準 **43/43**・2026-10-02 実測)

⭐ **測定点を移す。assert を緩めない・本数を減らさない。** 地図の幾何を見る節は、`dragonfighters.questBoard` に
`{t1:"goblin-mine", t2:"bandits-forest"}` の盤面を種まきして決定的にする(新規状態で妥当 = §2-4)。

| 節 | いま | 言い直し |
|---|---|---|
| (2a)(5b) | 席札ちょうど 3 枚 | 抽選 ON は**ちょうど 2 枚**(種の盤面どおり)。旧 3 枚の検査は `?questdraw=0` へ移して残す |
| (3a)(3b) | `TABLES[0]` の卓へ歩く | 種の盤面の `t1` の卓(= 同じ (4,4))へ歩く。幾何は不変 |
| (4b) | 「奥の間へ」で 3 卓が並ぶ | `?questdraw=0` へ移す(暫定扉の検査として残す)。ON 側は新規の (4b) が持つ |
| 変異 `copyplace` 他 | アンカー `  var TABLES = [` | `TABLES` は残すのでアンカーは生きる見込み — 項目1 で `--negative` を実走して確かめる |

### 非退行(実装後に走らせる)

- `node tools/verify_tavern_map.js` → 言い直し後 **43 本以上**すべて緑
- §2-5 の 5 本(`driver_depart_menu_clean` / `driver_party_view_reopen` / `verify_quest_walk` / `verify_recruit_size` / `verify_quest_visibility`)
  ⇒ **着手前の色を項目1 で控えてから**比較(ここでは未測定。席が動くので歩数・所要は変わる)
- `verify_town_map.js`(町 ⇄ 酒場 / 店先からの入店)・`verify_scroll_shelf.js`(店の中身)
- 母集団の全数走査は `tavern.html` を読む本(いつもの「変更したファイルを読むか」で引く)

⚠ 基準値は 2026-10-02 の記録。違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認

- 数回潜って戻り、「今日はこれが出ている」と感じられるか / 本筋が必ず居て詰まらないか
- 北東の扉の札「武器防具屋」が見つけやすいか(右下ボタンが消えたぶん)。縦画面(iPhone)で札が押せるか
- 依頼の無い卓が寂しく見えないか(気になるなら別チケットで客の札など)

---

## 10. changelog(`tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>酒場の依頼が入れ替わるように</b> — 卓に並ぶ依頼はダンジョンから戻るたびに変わる 2 件だけ。物語の次の依頼は必ず並ぶ。奥の小部屋は武器防具屋になった。"

---

## 11. やらないこと

- ⛔ 掲示板(`#questBoard`「✨ 依頼を引く」)の生成クエストには触らない
- ⛔ 依頼の無い卓に客や別の依頼を座らせる演出
- ⛔ 盤面の件数を Lv や名声で増やす / 日付・時間で入れ替える
- ⛔ 奥の小部屋を専用の店内画面(新しい絵・歩ける店内)にする — 今回は既存の `#shopScreen` を開くだけ
- ⛔ `?tavernmap=0` の 1 枚絵(6 卓)を抽選にする
- ⛔ `#backroomBar` / `openBackroom()` の撤去(撤退スイッチが使う)
- `実装依頼書/README.md` へ足す行(承認後に起草窓が足す):

    | 81 | [2026-10-02_quest-draw-shop-room.md](2026-10-02_quest-draw-shop-room.md) | **承認済** | 0% | 酒場の卓の依頼を「戻るたびに入れ替わる 2 件」へ(母集団 = 解放済み・本筋は必ず 1 件・序盤は ??? で埋める)+ 奥の間の扉を武器防具屋へ・右下ボタンは地図モードで隠す。⚠⚠⚠ 抽選は localStorage `dragonfighters.questBoard` に保存(メモリだけだと再読込が引き直しになる)・引き直す口は `consumeResult()` の 1 箇所だけ。⚠ `verify_tavern_map` 43/43 は (2a)(3a)(4b)(5b) が必ず赤 ⇒ 盤面を種まきして測定点を移す。撤退 `?questdraw=0` |

---

## 12. 実装結果

(実装窓が埋める)
