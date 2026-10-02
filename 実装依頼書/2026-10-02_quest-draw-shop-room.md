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

### 12-0. 着手前の実測(項目1・2026-10-03・HEAD `04fa8ac`)

#### (0) 基準 HEAD の差

`git diff --stat 36f4ba0 04fa8ac` = `実装依頼書/2026-10-02_quest-draw-shop-room.md`(+337)と `実装依頼書/README.md`(+1)の 2 ファイルだけ。
`git rev-parse <rev>:<path>` で `tavern.html` / `index.html` / `js` / `tools` / `audio.js` / `town.html` / `world.html` / `assets` の
blob/tree OID が 36f4ba0 と 04fa8ac で**全一致** ⇒ §2 の行番号はそのまま `04fa8ac` でも有効。

#### (1) §2 の主張の測り直し

| 主張 | 実測 | 判定 |
|---|---|---|
| §2-1 `js/tavern-map.js:139-143` TABLES / `:153-160` DOORS / `:166-172` SPAWNS(`back:[13,3]` は `:170`) | 一致 | ✓ |
| §2-1 `tavern.html:10604-10647` buildSigns / `:10767-10776` openBackroom・closeBackroom / `:6291-6295` isUnlocked / `:3391` `#shopEntry` / `:7048` 結線 / `:7027` openShop / `:10378` 店先入店 / `:5815` consumeResult / `:2752` `#tableArea{display:none}` / `:9810` renderTables() | 一致 | ✓ |
| §2-1 enterDoor `:10733-10755` | 関数頭は `:10734`(`:10733` は `var leaving`)。`back` 分岐 `:10744` は一致 | ✓(1 行ずれ・害なし) |
| §2-1 生成クエストの分け `:5862` | `:5864` | ✓(2 行ずれ・害なし) |
| §2-1「buildSigns の呼び口は `:10826` の 1 箇所だけ」 | **K1** 下記 | 崩れ |
| §2-2 一本道・新規で解放 1 件 | `scenarios`(`:3513`)の locked/unlockAfter は 廃坑→森→沼→砦→神殿→竜。`isUnlocked` は `!locked` か `cleared.has(unlockAfter)` ⇒ 新規は廃坑だけ | ✓ |
| §2-3 consumeResult が buildSigns より先 | どちらも同じ `<script>`(`:3441`〜`:11120`)の同期 IIFE。`:5815` consumeResult → `:10421` initTavernMap → `:10826` buildSigns() | ✓ |
| §2-3 LIVE_PREFIX の prefix コピー | `js/save-slots.js:45` `LIVE_PREFIX = "dragonfighters."`、`:77` 「キーをハードコード列挙しない」、`:84` で prefix 総なめ。`dragonfighters.questBoard` は既存キーと衝突なし(DOM の `#questBoard` は別物) | ✓ |
| §2-4 種が食い違う経路 | `?unlockall=1` は `:4261` の IIFE で consumeResult より前に `cleared` を 6 本へ書く ⇒ 盤面の妥当性検査が要るのは正しい | ✓ |
| §2-5 grep の全数 | 同じ grep を再実行 = 6 本で一致。ただし語を広げると **K2**(`verify_npc_crowd`)が漏れていた | 崩れ |
| §2-5 店を開くドライバは全部シーム経由 | `verify_scroll_shelf` 8 回・`verify_arcane_eye`/`verify_invisibility`/`verify_mage_hand` 各 1 回、すべて `__equipTV.openShop()`。`#shopEntry` を押す本は 0。`verify_town_map:608` はコメントだけ | ✓ |
| §2-5 5 本の構造(新規状態 ⇒ 廃坑が本筋で必ず盤面に居る) | 5 本とも `#questTable_goblin-mine, #tableArea .table`。種は `cleared:[]` か `{}`。`verify_quest_visibility` の帰還の腕(`:816-818`)は廃坑クリア ⇒ 解放 2 件 = 盤面は {廃坑, 森} 固定。⭐ t1 (4,4) は spawn (7,8) から**最も遠い席**なので、席が動いても歩数は減る方向だけ | ✓ |
| §2-6 `?tavernmap=0` では `#shopEntry` が唯一の入口 | 地図 IIFE は `?tavernmap=0` で即 return(`:10426`)。openShop の呼び口は `:7049`(#shopEntry)と `:10378`(町の店先)だけで、後者は町からの遷移 = クエリが落ちて地図モードに戻る。`#shopEntry` にインライン display を書く JS は無い ⇒ CSS で隠せる | ✓ |
| §2-7 changelog | `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`・`core.hooksPath=scripts/hooks` | ✓ |

**崩れた主張(K1〜K3)。どれも仕様には響かない(実装方針・受入条件はそのままで満たせる)。**

- **K1** buildSigns の呼び口は 1 箇所ではない。`tavern.html:10824` `window.__tavernRefreshSigns = buildSigns;` があり、
  `updatePlazaDoor()`(`:9868`、闇市の解禁は遊んでいる最中に起きる)と `verify_tavern_map` の (2c) `placeLinkProbe`(`:701`/`:704`)が**再実行**する。
  ⇒ 響き: 盤面の読み出し(`loadOrDrawBoard`)は buildSigns が何度呼ばれても**保存値を読むだけ**で引き直さないこと(引き直しは consumeResult の鍵消し 1 つ、は変わらない)。
- **K2** §2-5 の「全数 grep」の語では `tools/verify_npc_crowd.js` が漏れる。`:139` `POP.tavern.signs: 5`(卓 3 + 町 + 奥の間)を (0c) が**ちょうど一致**で見ているので、
  抽選 ON(卓 2 + 町 + 武器防具屋 = 4 枚)で**必ず赤**。⇒ 言い直し対象に `tools/verify_npc_crowd.js` を 1 本足す(触るファイルが +1。§3 の表には無い)。
  (1a) の札×NPC 交差は、盤面の席が既存 3 席の部分集合なので新しい交差は生まれない見込み。素 33/33・`--negative` 58/58(下表)。
- **K3** §8 の言い直し表は (2a)(3a)(3b)(4b)(5b) だけだが、種の盤面 `{t1:goblin-mine, t2:bandits-forest}` でも次の 2 本が赤になる:
  - **(2d)** `tableRows()`(`tools/verify_tavern_map.js:1067`)は `TABLES` の 3 行を回すので、盤面に居ない沼地の行が「DOM に無い」で bad ⇒ 赤。測定点を盤面(または `?questdraw=0`)へ移す。
  - **(5c)** `(s.signs || []).length !== 3` で空振り扱い ⇒ 赤。(5b) と同じ言い直しが要る。
  - (2b)(2c)(1b)(1c) は `TABLES` を残すかぎり緑のまま(2c は TABLES の先頭の解放済み = 廃坑 を種の盤面が含むので成立)。

#### (2) 名指し golden の着手前の色(本番の作業ツリー・素 ×2)

| 本 | 1 回目 | 2 回目 | 所要(秒) | ポート |
|---|---|---|---|---|
| `verify_tavern_map` 素 | exit 0 `43/43 PASSED FAILED 0 PENDING 0` | 同 43/43 | 24 / 21 | 9161〜9200 帯 |
| `verify_tavern_map --negative` | exit 0 `67/67 PASSED`(変異 10/10、`(n9a)` PENDING 0) | 同 67/67 | 43 / 43 | 同上 |
| `driver_depart_menu_clean` | exit 0 `41/41 PASS` | 41/41 | 52 / 52 | 内蔵サーバ |
| `driver_party_view_reopen` | exit 0 `35/35 PASSED / 0 FAILED / 0 PENDING` | 35/35 | 36 / 35 | 9480 |
| `verify_quest_walk` | exit 0 `25/25 PASSED FAILED 0 PENDING 0` | 25/25 | 98 / 97 | 9161〜9164 |
| `verify_recruit_size` | exit 0 `91/91 PASS` | 91/91 | 35 / 35 | 内蔵サーバ |
| `verify_quest_visibility` | exit 0 `素 39/39 PASSED (PENDING 0)` | 39/39 | 17 / 16 | 10221〜10228 |
| `verify_town_map` | exit 0 `85 / 85` | 85/85 | 51 / 52 | 9000 |
| `verify_scroll_shelf` | exit 0 `19/19 PASSED FAILED 0 PENDING 0` | 19/19 | 4 / 3 | 10484 |
| `verify_npc_crowd`(K2) | exit 0 `33/33 PASSED FAILED 0 PENDING 0` | 33/33 | 72 / 72 | 9572〜9586 |
| `verify_npc_crowd --negative`(K2) | exit 0 `58/58 PASSED`(1 回) | — | 195 | 同上 |
| `verify_recruit_talk --negative`(下の (3)) | exit 0 `25/25 PASSED`・`負のコントロール: 11/11 本が期待どおり`(1 回) | — | 612 | — |

⇒ 全 20 腕 + 2 腕が緑。2 回とも同色同数(揺れなし)。8765(試遊サーバ)は触っていない。

`verify_tavern_map --negative` の変異アンカー 10 本は全部 HEAD で 1 ヒット(67/67 が証拠)。#81 で動く場所にあるのは:
`reclick` `      if (walkingTo === t.key) return;`(`:10722`)/ `instant` `    function goToTable(t) {`(`:10717`)/
**`hidelock` `        var unlocked = isUnlocked(sc);`(`:10610`・buildSigns の中)** / `plazashow`(`:10630`・buildSigns の扉ループ)/
`gatetable`・`copyplace` `  var TABLES = [`(`js/tavern-map.js:139-140`)/ `noretreat`(`:2923`)。§8 の見込みどおり `  var TABLES = [` は生きる。

#### (3) 母集団の着手前の色(流用)

- 母集団 = 3 段の union(`item1/pop81.py`): ① コメントを落としたコードが `tavern.html` か `tavern-map` を読む **57 本** /
  ② 舞台の語(`TAVERN_MAP` `__TAVERN_TV` `questTable_` `tavernDoor_` `shopEntry` `openShop` `backroom`)11 本 / ③ 母集団の本を名指しで読む本 3 本。
  ②③ はどちらも ① の真部分集合で、union は **57 本**。`auto_debug_run` は母集団外(2026-10-02 ユーザー決定の「未走査」はそのまま)。
- 流用の可否: (0) のとおりドライバが読む木(配信物 + `tools/`)の OID が 36f4ba0 と全一致 ⇒ #80 項目4 の走査 TSV
  (`post80.tsv`・本番 36f4ba0・176 腕)を**着手前の色として流用可**。57 本はすべて post80 に在り(欠け 0)、
  腕 **72**(素 57 + `--negative` 15)を `pre81.tsv` へ抜き出した(凍結コピー = scratchpad `item1/from80/`)。
- 72 腕の色(exit code が主): **緑 66 / 非緑 6**。非緑は全部 #80 の §12-0/§12-3 で分類済みの既知:
  `driver_mapeditor` 176/179・`driver_monsters_umberhulk` 21/22・`probe_party_size` 13/20(600 秒打ち切り)・
  `sweep_recruit_balance`(装置 assert 4/4 = 調査の道具)・`verify_pm_drawer_fit` 74/75((5d) の揺れ・p=1.00)・
  `verify_mage_hand --negative`(K26 の揺れ。単独再走 12/12 × 2)。腕の所要合計 13,483 秒(約 225 分)。
- ⚠ 母集団で `--negative` を持つのに post80 に腕が無い本が 23 本ある(`verify_tavern_map` / `verify_npc_crowd` / `verify_quest_walk` ほか)。
  #81 の差分が触る変異アンカーを持つのは `verify_tavern_map`(上の 7 本)と `verify_recruit_talk`(`DFRecruits.clear()` `:5854`・consumeResult の中)だけ
  (`item1/anchor81.py` で 57 本の `from:` を tavern.html / js/tavern-map.js の変更区域へ当てた)⇒ この 2 本 + K2 の `verify_npc_crowd --negative` の着手前の色を上の表で取った。
  項目4 で差分から選んだ `--negative` の腕がこれ以外に出たら、その腕だけ 04fa8ac の影のツリーで着手前の色を取る。

#### (4) 項目2 への申し送り

1. `hidelock` のアンカー `        var unlocked = isUnlocked(sc);` は buildSigns 内に**ちょうど 1 回**残すこと(ON/OFF の分岐で 2 回書くと `verify_tavern_map --negative` が exit 3)。`reclick` / `instant` のため `goToTable` も 1 バイトも変えない(盤面の写し `{key, enter, sign, scenarioId}` を渡すだけ)。
2. `dropscen` は (4b) を `back` フェーズで見る ⇒ (4b) を `?questdraw=0` へ移すとき `back` フェーズの URL にも `?questdraw=0` を付ける(付けないと扉が無くて (4b) が空振り)。
3. 言い直しが要る assert = `verify_tavern_map` (2a)(2d)(3a)(3b)(4b)(5b)(5c) + `verify_npc_crowd` (0c)(K2・K3)。数は盤面(または `__TAVERN_TV.board()`)から導出し、定数 4 を焼かない。
4. buildSigns は `__tavernRefreshSigns` 経由で何度でも呼ばれる(K1)⇒ 盤面は buildSigns の中で「読む」だけ。
5. 行末: `tavern.html` / `js/tavern-map.js` は純 CRLF(11122/11122・184/184)、`tools/verify_tavern_map.js` / `tools/verify_npc_crowd.js` は純 LF。
6. 作業ツリーに `dev-meetings/2026-10-03_tower-mother-quest.md`(未追跡)が居る = 別窓の持ち物。⛔ add しない。

### 12-1. 本番実装(項目2・2026-10-03・基準 HEAD `d8ec8cd`)

#### (1) 変更

| ファイル | 変更 |
|---|---|
| `js/tavern-map.js` | `DOORS` の `back` → **`shop`「武器防具屋」**(enter/sign 不動)。`off: {key:"back", name:"奥の間へ", desc, provisional:true}` を持たせた。`TABLES`・`SPAWNS.back` は残す。コメント 2 箇所を新しい役目へ |
| `tavern.html` | 地図 IIFE の起動時に撤退判定 `QUEST_DRAW_ON`(`?questdraw=0`・`?tavernmap=0` と同じ関数宣言の作法)+ `body.questDrawOn` / 盤面 `BOARD_KEY` `boardFacts()` `boardValid()`(§2-4 の 3 条件)`drawBoard()` `loadOrDrawBoard()` / `buildSigns()` は盤面の 2 卓だけ札を作り、`goToTable` へは `{key,enter,sign,scenarioId}` の写しを渡す(`TVM.TABLES` 不変)/ OFF は扉を `Object.assign({}, d, d.off)` で旧「奥の間へ」へ / `enterDoor` に `shop` → `openShop()` / `consumeResult()` の `clearActiveQuest();` 直後に鍵消し 1 行(消し口はここだけ)/ CSS `body.tavernMapOn.questDrawOn #shopEntry{display:none}`(DOM は残す)/ `__TAVERN_TV.board()`(写し・OFF は null)`boardFacts()`(id 配列)/ changelog 1 行(§10 の文面そのまま。最古の 1 件が押し出された) |
| `tools/verify_tavern_map.js` | 言い直し(下の (3))。43 → **47** 本 |
| `tools/verify_npc_crowd.js` | (0c)(4d) の枚数を盤面から導出 + 盤面の種まき + (1a) へ盤面 B の 2 面(下の (3))。本数 33 のまま |

⛔ 触っていない: `openBackroom` / `closeBackroom` / `#backroomBar` / `scenarios` / `isUnlocked` / `openDialog` / `#questBoard` / `goToTable`(1 バイトも変えていない)/ `?tavernmap=0` の 1 枚絵(地図 IIFE が先に return するので `questDrawOn` は付かず、(7a)(7b) 緑)。
行末: `tavern.html` 11227/11227・`js/tavern-map.js` 188/188 の純 CRLF、ドライバ 2 本は純 LF のまま(py でバイト単位に編集)。
`git diff` の削除行は全部、上の表の置き換え(コメント・`back` の 2 行・buildSigns の頭 2 行・`geom` の閉じ・ドライバの言い直し対象・changelog の最古 1 件)だけ。

#### (2) 使い捨て probe(scratchpad `item2/probe81.js`・port 10031)= **25/25**

新規で {廃坑(押せる), 森(???・.locked)} の 2 枚 / 保存値 = `board()` / 再読込 3 回 + 町→酒場で nonce 不変 / `__tavernRefreshSigns()` 2 回でも nonce 不変(K1)/
`lastResult` の cleared(廃坑)・defeated・retreated・generated-quest の 4 通りで引き直し(廃坑クリア後は {廃坑, 森} とも押せる)/
不正な盤面 6 種(本筋欠け+未解放・3 件・存在しない席・id 重複・存在しない id・1 件)を全部捨てる / 妥当な種は nonce `SEED` のまま採用 /
6 本クリア = 本筋なし・2 件とも解放済み / 3 本クリアで 8 回引き直して砦が毎回入り未解放 0 /
扉 `#tavernDoor_shop`「武器防具屋」→ (13,2) まで歩いて `#shopScreen` が flex・`#backroomBar` 出ない / 地図モードで `#shopEntry` は DOM に在り `checkVisibility()` false /
`?tavernmap=0` で `#shopEntry` が見えて押すと店が開く・6 卓 / `?questdraw=0` で 3 卓固定・「奥の間へ」・`#shopEntry` 見える・`board()` null / `DOORS`/`TABLES` 不変 / ページエラー 0。

#### (3) 既存 golden の言い直し(⛔ 緩めない・本数を減らさない)

- `verify_tavern_map`: ON のページへ `{v:1, seats:{t1:"goblin-mine", t2:"bandits-forest"}, nonce:"SEED-vtm"}` を種まき。
  (2a) = 盤面どおりちょうど 2 枚 **かつ nonce が種のまま**(引き直されたら赤)/ (2d) = 盤面の卓で測る(`tableSidsOf()`)/ (3a)(3b) = 盤面の t1 の卓(= 同じ (4,4))/
  (5b)(5c) = 盤面の枚数 + 種の採用を確認 / (4b) = back フェーズを `?questdraw=0` で開く(dropscen も同じ URL)。
  旧 3 卓の検査は新フェーズ `qoff` / `qoffc`(`?questdraw=0` の desktop / compact)へ **(2aq)(2dq)(5bq)(5cq)** として移して残した = +4 本。
- `verify_npc_crowd`: `POP.tavern.signs: 5` → `doors: 2` + `wantSigns()` = **そのページの `board()` の席数 + 扉**(盤面が測れなければ NaN = 赤)。(0c)(4d) とも。
  種 `{t1, t2}` を purge の直後にまく(乱数の席だと desktop/compact で札の並びが変わり (4d) の id 一致が揺れる)。

#### (4) 名指し golden の色(着手前 §12-0 (2) → 実装後)

| 本 | 着手前 | 実装後 |
|---|---|---|
| `verify_tavern_map` 素 | 43/43 ×2 | **47/47 ×2**(+4 = (2aq)(2dq)(5bq)(5cq)) |
| `verify_tavern_map --negative` | 67/67(変異 10/10) | **71/71**(変異 10/10・`(n9a)` PENDING 0) |
| `driver_depart_menu_clean` | 41/41 | 41/41(261 秒。並走中の `--negative` 2 本と CPU を取り合った) |
| `driver_party_view_reopen` | 35/35 | 35/35 |
| `verify_quest_walk` | 25/25 | 25/25 |
| `verify_recruit_size` | 91/91 | 91/91 |
| `verify_quest_visibility` | 39/39 | 39/39 |
| `verify_town_map` | 85/85 | 85/85 |
| `verify_scroll_shelf` | 19/19 | 19/19 |
| `verify_npc_crowd` 素 | 33/33 | 33/33 |
| `verify_npc_crowd --negative` | 58/58 | 1 回目 **57/58**(K4)→ 直して **58/58** |
| `verify_recruit_talk --negative` | 25/25(11/11) | 25/25(11/11) |

緑→赤 = 0(K4 は言い直しの漏れで、直した後は 0)。

#### (5) 崩れ(K4〜)

- **K4** `verify_npc_crowd` の変異 `strollsign`(酒場 server の巡回を (8,3)⇄(8,6) へ)が空振りした。交差する相手は **t3 の席札 (9,3)**。
  #81 で札が出る席は 3 つのうち 2 つになり、種 {t1, t2} では t3 に札が無い ⇒ (1a) が t3 を覆わなくなっていた。
  本番はどの 2 席も引き得るので (1a) は 3 席すべてで守る必要がある ⇒ (1a) 専用に **盤面 B `{t3:廃坑, t2:森}` の酒場 2 面**(desktop / compact)を足し、
  B の面は `boardSeats.t3` が在ることも見る(種が捨てられたら赤)。直した後は `strollsign` が盤面 B の desktop で ①② 各 2 件の交差として赤 = 58/58。
  ⭐ 依頼書 §2-5 / §12-0 K2 は (0c) の枚数だけを影響として挙げていたが、**「札が出る席が減る」は札を相手にした交差検査の母集団も痩せさせる**。

#### (6) 逸脱(D1〜)

- **D1** 依頼書 §8 は「(4b) を `?questdraw=0` へ移す」だけだったが、(2a)(2d)(5b)(5c) の旧 3 卓の検査も削らずに `?questdraw=0` 側へ別 assert として残した(本数 +4)。
  ON 側の (2a)(5b)(5c) には「種が採用されたこと(nonce)」を足した(乱数の席で偶然緑になるのを塞ぐ)。
- **D2** `boardValid()` は `v` も `nonce` も検査しない(依頼書 §2-4 の 3 条件だけ)。ドライバが `v` 抜きの種をまいても採用される。
- **D3** `loadOrDrawBoard()` は localStorage が読めない/壊れているときに、メモリの盤面(`board`)を使う(依頼書 §4-2 の「try/catch で握る」の具体化。K1 の再実行で引き直さないため)。

#### (7) 項目3 への申し送り

- 変異アンカー(HEAD = 本コミット・すべて `tavern.html` で 1 ヒットを確認):
  `memonly` → `      try { b = JSON.parse(localStorage.getItem(BOARD_KEY) || "null"); }`(:10678)/
  `lockedpool` → `      var unlocked = scenarios.filter(function (s) { return isUnlocked(s); });`(:10631)/
  `nofrontier` → `      if (f.frontier) ids.push(f.frontier.id);`(:10663)。⚠ これだけだと `boardValid` ③ が捨て続けるので (3b) と (1c) が赤になる見込み /
  `novalidate` → `    function boardValid(b, f) {`(:10640)/ `noreroll` → `    try { localStorage.removeItem("dragonfighters.questBoard"); } catch (e) {}`(:5825)/
  `enterreroll` → `    document.body.classList.toggle("questDrawOn", QUEST_DRAW_ON);`(:10454)の後ろに removeItem を足す形 /
  `oneonly` → `      if (ids.length < BOARD_SIZE && f.nextLocked) ids.push(f.nextLocked.id);`(:10668)。⚠ 1 件の盤面は `boardValid` ① で捨てられ、毎回引き直す(保存値は毎回変わる)/
  `backroomdoor` → `      if (d.key === "shop") { openShop(); return; }`(:10839)/ `shopbtn` → `    body.tavernMapOn.questDrawOn #shopEntry { display: none; }`(:2756)/
  `killshopdom` → `    <div id="shopEntry" title="武器防具屋">🛡️ 武器防具屋</div>`(:3395)。
- ⛔ `hidelock` のアンカー `        var unlocked = isUnlocked(sc);` は buildSigns 内に 1 回だけ。`lockedpool` のアンカーは `var unlocked = scenarios.filter` で別の行(衝突しない)。
- シーム: `__TAVERN_TV.board()` = `{v:1, seats:{t?:id,...}, nonce}` の写し(OFF は null)。`__TAVERN_TV.boardFacts()` = `{unlocked:[id], frontier:id|null, nextLocked:id|null}`。
- 罠: 種の盤面はページの `cleared` に照らして妥当でないと捨てられる(新規状態では {廃坑, 森} だけが妥当)。`?unlockall=1` は `cleared` を 6 本にするので、それ以前の種は本筋の条件で捨てられることがある。
  `verify_npc_crowd` の新規ページは purge(sessionStorage の `__drvSeeded`)のあと盤面を種まきする。新しいドライバで同じ作法を使うなら、席 t3 の扱い(K4)に注意。

### 12-2. 新規受入(項目3・2026-10-03・基準 HEAD `d914fdc`)

#### (1) `tools/verify_quest_draw.js` — **18 assert**(port 素 **10527** / 変異 **10528〜10537**)

§8 の (0a)(0b)(1a)〜(1e)(2a)(2b)(3a)(3b)(4a)〜(4d)(5a)(5b) の 17 本 + 独自の **(0c)**(全ページ pageerror 0)。
盤面は tavern.html を開くだけで本番の `buildSigns → loadOrDrawBoard` に作らせ、ドライバは空ページ `/__blank.html`(同じオリジン)で
`dragonfighters.cleared` / `dragonfighters.questBoard` / `sessionStorage lastResult` をまいて、DOM の札・保存値・`board()` の写しで判定する。
期待値(解放済み / 本筋 / 次の未解放 / 妥当性 3 条件)はページの `scenarios` の `{id, locked, unlockAfter}` とまいた cleared から
**ドライバ側で独立に**計算する(`indepFacts` / `indepValid`)。`__TAVERN_TV.boardFacts()` は判定に使っていない。乱数は固定していない。
町との往復 (2a) は town.html を実際に開き、`enterFacility` と同じ `enterVia="tavern"` + `location.href="tavern.html"` で戻る。

| 実行 | 結果 | 所要 |
|---|---|---|
| `node tools/verify_quest_draw.js` ×3 | 3 回とも exit 0 `18/18 PASSED   FAILED 0   PENDING 0`(起動 86 ページ) | 32.0 / 32.1 / 32.2 秒 |
| `node tools/verify_quest_draw.js --negative` ×2 | 2 回とも exit 0「負のコントロール 10 / 10 が検出成功」(素の基準 18/18 込み) | 350.8 / 349.9 秒 |

#### (2) 変異の担当表(実走で決めた・`--mutate` 1 回 + `--negative` 2 回)

合否 = **必ず赤 ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤** + 注入行の実行 > 0(担当外の赤は NG)。注入行は `console.log("__MUTHIT__<key>")` を
欠陥が効く枝に置いた(CSS の shopbtn だけは `--mut-shopbtn: 1` を宣言し、`#shopEntry` の計算値で数える)。

| 変異 | §8 の予想 | 必ず赤(実測) | 確率で赤 | 1 回目の赤 | 2 回目の赤 |
|---|---|---|---|---|---|
| `memonly` | (2a)(2b) | (2a)(2b) | — | (2a)(2b) | (2a)(2b) |
| `lockedpool` | (1c) | **(1a)(1b)**(1c)**(2b)** | (2a)(3a)(3b) | +(2a)(3a)(3b) | +(3a)(3b) |
| `nofrontier` | (1c)(3b) | (1c)(3b) | (2a) | +(2a) | — |
| `novalidate` | (3b) | (3b) | — | (3b) | (3b) |
| `noreroll` | (3a) | (3a) | — | (3a) | (3a) |
| `enterreroll` | (2a) | (2a)**(2b)** | — | (2a)(2b) | (2a)(2b) |
| `oneonly` | (1a) | **(0a)**(1a)**(3a)** | — | 同左 | 同左 |
| `backroomdoor` | (4b) | (4b) | — | (4b) | (4b) |
| `shopbtn` | (4c)(5b) | (4c)(5b) | — | (4c)(5b) | (4c)(5b) |
| `killshopdom` | (4c)(4d) | (4c)(4d)**(5a)(5b)** | — | 同左 | 同左 |

「必ず赤」で乱数に依るものは、緑になる確率を回数で 1e-4 未満にしてある:
lockedpool (1a)(1b) = 各 6 回の引きが全部「森 / 廃坑」を引く確率 (1/5)^6 ≒ 6.4e-5 / nofrontier (1c) ≒ 1e-14・(3b) = (1/2)^6 × 0.4^6 ≒ 6.4e-5。
「確率で赤」は 2 回の `--negative` で実際に赤と緑の両方が出た((2a) は lockedpool・nofrontier とも 1 回目だけ赤)⇒ 完全一致を要求すると揺れる。

#### (3) 崩れ(K5〜)

- **K5** `oneonly` は (1a) だけでなく **(0a)(3a)** も必ず赤。新規状態の盤面が 1 件になる ⇒ (0a) の「2 件」と、(3a) の敗北/撤退/生成クエスト 3 通り
  (帰還後も新規状態のまま引き直す)が 1 件の盤面になる。1 件の盤面は boardValid ① で毎回捨てられるので、保存しても毎読み込みで引き直される(notes_item2 の予告どおり)。
- **K6** `lockedpool` は (1c) だけでなく **(1a)(1b)(2b)** も必ず赤。(1a)(1b) は 2 件目を全 5 件から引くので森/廃坑以外が出る。
  (2b) は母集団が 6 件になると boardValid ② の「解放済みが 2 件未満なら次の未解放を許す」が成り立たなくなり、新規状態の ??? 入りの種が**捨てられる**。
  ⇒ (1a)(1b) を 1 回ではなく 6 回引く形にした(1 回だと 80% でしか赤くならない)。
- **K7** §8 の (3b) を文字どおり(`nonce !== "SEED"` だけ)書くと **`nofrontier` は赤くならない** — 捨てる側(boardValid ③)は無傷なので、本筋欠けの種は正しく捨てられる。
  欠陥が出るのは「引き直した盤面に本筋が無い」こと ⇒ (3a)(3b) は**引き直した盤面も独立計算で妥当**であることを見る形にし、(3b) は解放済みが 4〜5 件の
  cleared 3 本 / 4 本で 6 種ずつ(12 回)まく(cleared 1 本では引きが {廃坑, 森} しかなく本筋が必ず入るので変異が見えない)。
- **K8** `enterreroll` は (2a) だけでなく **(2b)** も必ず赤(起動時に種そのものが消える)。
- **K9** `killshopdom` は (4c)(4d) だけでなく **(5a)(5b)** も必ず赤((5a) は `?questdraw=0` で `#shopEntry` が見えること、(5b) は ON 側の (4c) 条件を含む)。
- **K10** CSS の変異(shopbtn)は console を持てないので「注入行の実行」を測れない ⇒ 代わりに `--mut-shopbtn: 1` を宣言し、ドライバが `getComputedStyle(#shopEntry)` でその規則が当たったページを数える(84 回)。
  killshopdom は要素の代わりに `<script>` を置いて印にした(`bindShop` は `if (entry)` で守られているので落ちない・(0c) 緑)。
- **K11** 乱数を固定しない受入では、変異の赤の集合が実行ごとに揺れる(lockedpool の (2a) は最初の引きに未解放が入ったときだけ赤)⇒ verify_mage_hand の
  「赤の集合 = 担当の完全一致」は使えない。必ず赤 / 確率で赤 の 2 表に分け、必ず赤は回数で決定的にした。

#### (4) 逸脱(D4〜)

- **D4** (0c) pageerror 0 を足した(§8 に無い)。(1e) は §1 の全 56 読み込みに当て、席の位置(札が `TABLES` の sign タイルに立つ)と「保存値の JSON === `board()`」も見る。
- **D5** (3b) の種を §8 の 4 種 + **id 重複・存在しない id** の 6 種にした。(2b) は新規状態の ??? 入り / cleared 3 本の 2 つの種。
- **D6** (4b) は「押した時点で主人公が (13,2) に居ない」ことも見る(歩いてから開く)。(5a) は「奥の間へ」を押して `body.backroomOn` と `#tableArea.backroomOpen` まで見る。
