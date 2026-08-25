# #23 受注した依頼の地まで、ワールドマップを歩いて向かう

- **起草**: 2026-08-25(計画窓) / **ステータス**: **承認済**(2026-08-26 ユーザー承認)
- **着手**: 2026-08-26 実装窓。
  ⚠ 起草は 2026-08-25。**着手前に §2 の行番号をもう一度 `sed -n` で測り直すこと**
  (#6 は 8 件中 8 件、#11 は 11 件中 4 件ズレていた)。
- **触るファイル**: `js/world-map.js` / `tavern.html` / `world.html` /
  `tools/verify_quest_walk.js`(新規) / `tools/verify_world_map.js`(装置の 1 箇所だけ)
- ⛔ **触らないファイル**: `index.html` / `town.html` / `js/town-map.js` / `title.html` / `audio.js`
  — §2-7 / §3 で「一度も開かずに完了できる」ことを確認済み。
- **並走窓**: 無し。起草時点で `git status --porcelain` は空、HEAD = `a71378c`(= origin/main)。

---

## 1. 目的

今は酒場で依頼を受注 → 準備画面 → 「出発する」を押した瞬間に `index.html` へ飛ぶ。
`tavern.html:5618` の `window.location.href = target` ただ 1 行で、**廃坑だろうがドラゴンの巣
だろうが等しく 0 歩でワープする**。#21 / #22 で地方全景(`world.html`)と港町からの出口までは
作ったが、**地図は「帰り道」にしか使われていない**(出発は今日も直行ワープ)。

同時に、地図の札は **常に 7 枚とも出ている**。`world.html:552` に当時の判断がそのまま
書いてある —— 「⛔ 札に『未解放 / 解放済』の状態を持たせない。v1 は常に 7 枚とも出す」。
つまりまだ解放していないドラゴンの巣も地下神殿も、初回起動の時点で地名ごと見えている。

本チケットは **#21 が意図的に見送った 2 点を、今回まとめて反転させる**:

| | #21 v1 の決定(現状) | #23 で反転させる先 |
|---|---|---|
| 出発 | 酒場 → `index.html` へ直行 | 酒場 → **地方全景** → 歩く → 目的地 |
| 札 | 常に 7 枚。押しても歩くだけ | **解放済みだけ**表示。**受注中の地だけ**入れる |

**ユーザー決定(2026-08-25)**:

- **出発ボタンは地方全景へ直行**(`world.html`)。駒は港町フラン(`phlan`)に立ち、そこから歩く。
  - ⭐ 不採用: 「港町フランへ出して #22 の北の街道口 (6,0) から自分で出る」案。
    最も「自分で歩いた」感は強いが画面が 2 つ増えるため見送り。
- **生成クエスト(酒場の掲示板 / 闇市ポドルプラザ)は据え置き** = 今日どおり直行ワープ。
  - ⭐ ユーザー談「まだ方針が定まらない」。歩かせるのは**本筋 6 シナリオだけ**。
  - ⭐ 不採用(保留): `placeTags` から近い拠点へ割り当てる案 / 全部を港町フラン発にする案。
- **到着したら確認をはさむ**。札を押す → 「〈廃坑〉へ入りますか?」 → 「入る」で `index.html`。
  - ⭐ 不採用: 港町フランの札と同じ「即入る」。誤タップで潜行が始まるのを嫌った。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 出発の呼び口(リポジトリ全文 grep で実測)

**出発処理は `departToScenario()` ただ 1 本**。ボタンは 3 つあるが全部ここへ合流する。

| ファイル:行 | 何 |
|---|---|
| `tavern.html:5562` | `function departToScenario(autoplayOverride)` — **出発処理(共通)** |
| `tavern.html:5599` | `let target = prepScenario.target \|\| "index.html";` |
| `tavern.html:5618` | `window.location.href = target;` — ⭐ **書き口はこの 1 行だけ** |
| `tavern.html:5620` | `#btnDepart` click → `departToScenario()` |
| `tavern.html:5622` | `#btnDepartAutoplay` click → `departToScenario(10)` |
| `tavern.html:5624` | `#btnDepartAutoplayFast` click → `departToScenario(30)` |
| `tavern.html:5628` | `function departAutoDebug(runs)` — **別関数**。⛔ 触らない(6 シナリオ巡回) |

準備画面へ入る口(`openPrep`)は **3 つ**:

| ファイル:行 | 出所 | `sc.id` |
|---|---|---|
| `tavern.html:4304` | 固定 6 シナリオ(テーブルの依頼人) | `goblin-mine` 等の実 id |
| `tavern.html:6457` | 闇市ポドルプラザ | **`"generated-quest"`** |
| `tavern.html:6736` | 酒場の掲示板 | **`"generated-quest"`** |

⭐⭐⭐ **生成クエストは 2 経路とも id が同じ `"generated-quest"`**(実測)。
`WORLD_MAP.SITES` にこのキーは無いので、**「`SITES` に在るか」ただ 1 つで本筋と生成を判別できる**。
別表を作らないこと。

### 2-2. ⚠⚠⚠ 罠 A — 未解放ノードを「歩けなく」すると、開始直後に詰む

「目視できないようにする」を素直に「ノードごと消す」と実装すると **ゲームが進行不能になる**。
街道網は**環状**なので、1 つ消しただけでは切れず、**単体テストでは永久に緑**になる。

実測(`js/world-map.js` の実体を `node` で読み込み、`EDGES` からグラフを起こして計測):

```
=== 各拠点を 1 つだけ取り除いたとき、phlan から到達できなくなるノード ===
  mine        ⛔ 到達不能 temple
  forest      影響なし(葉)
  swamp       影響なし(葉)
  fort        影響なし(葉)
  temple      影響なし(葉)
  dragon      影響なし(葉)

=== ゲーム開始時 (cleared=[] → 解放は goblin-mine のみ) に未解放 5 拠点を消したら ===
  消すノード: forest,swamp,fort,temple,dragon
  phlan から到達可能: phlan,pier,cross_n
  ⇒ 廃坑(mine)へ到達できるか: ⛔⛔⛔ いいえ = 詰み
```

⭐⭐⭐ **だから「隠す」は見た目だけ**にする。当たり判定・`EDGES`・`findPath` は 1 バイトも変えない。
未解放の拠点は **中継点(`.worldNode-way`)と同じ小さな点**に化けるだけで、今までどおり歩けるし
通り抜けられる。
⭐ この罠は §8 の負のコントロール **`blockwalk`** として装置に内蔵させること。

**再測定コマンド**:

```bash
node -e '
const fs=require("fs");const g={};(new Function("window",fs.readFileSync("js/world-map.js","utf8")))(g);
const {NODES,EDGES,SITES}=g.WORLD_MAP;
function reach(rm){rm=new Set(rm);const a={};for(const id of Object.keys(NODES))if(!rm.has(id))a[id]=[];
for(const[x,y]of EDGES){if(rm.has(x)||rm.has(y))continue;a[x].push(y);a[y].push(x);}
const s=new Set(["phlan"]),q=["phlan"];while(q.length){const c=q.shift();for(const n of a[c]||[])if(!s.has(n)){s.add(n);q.push(n);}}return s;}
const r=reach(["forest","swamp","fort","temple","dragon"]);
console.log("到達:",[...r].join(","),"/ mine:",r.has("mine"));'
```

### 2-3. ⚠⚠ 罠 B — 地図を挟むと `autoplay` / `evade` が落ち、既存ドライバが死ぬ

`departToScenario` は URL パラメータを **`target` の文字列に連結**している
(`tavern.html:5600-5617`)。`world.html` を 1 段挟むと、地図から `index.html` へ飛ぶときの
クエリは **空文字**(#21 の受入条件 (3d) が `location.search === ""` を要求している)なので、
`autoplay` / `evade` は**そこで確実に消える**。

`probe_s2_clear.js:26` に先人の実測がそのまま残っている ——
「⭐⭐⭐ 実測で分かった罠: `departToScenario()` は autoplay と evade しか引き継がない」。

酒場の `#btnDepart` を参照するドライバの全数(`grep -rl` で実測)と、その影響:

| ドライバ | `btnDepart` の使い方 | 影響 |
|---|---|---|
| `tools/probe_s2_clear.js` | `tavern.html?autoplay=N` → 実クリック → **index.html まで行く** | ⛔ **落ちる** |
| `tools/sweep_recruit_balance.js` | `tavern.html?autoplay=N`(`:220`)→ 同上 | ⛔ **落ちる** |
| `tools/verify_recruit_size.js` | `:443` クリック直後に**同じ evaluate 内で** sessionStorage を読む。着地先は見ない | 影響なし |
| `tools/probe_party_size.js` | `?autoplay` は使えないと明記(`:647`)。ボタンの状態のみ | 影響なし |
| `tools/driver_depart_menu_clean.js` | `:185` `vis(q('btnDepart'))` = 可視性だけ | 影響なし |
| `tools/driver_dev_gate.js` | `btnDepartAutoplay` 等の表示可否だけ | 影響なし |
| `tools/verify_title_screen.js` | `:1102` `:1189` の `#btnDepart` は **`title.html` の「この者として旅立つ」**(別ページの同名 id) | 影響なし |

⭐⭐⭐ **だから `autoplay` / `evade` / `autodebug` が付いているときは地図を挟まない**
(dev / ヘッドレス検証の URL 規約。`index.html:2701-` の解析を潰すと 29 本が全滅する、と
`driver_dev_gate.js:24` にも同じ趣旨が書いてある)。
⭐ この罠は負のコントロール **`eatquery`** として装置に内蔵させること。

### 2-4. ⚠⚠ 罠 C — `exitVia` を書かずに地図へ飛ぶと、駒は港町でなく**桟橋**に立つ

`world.html:476` の実体:

```js
var spawnVia = (exitVia === null || exitVia === "") ? "title" : exitVia;
```

`js/world-map.js:170` の `spawnFor()` は `"title"` → **`pier`**(船で上陸した所)を返す。
つまり **何も書かずに `world.html` へ飛ばすと、酒場から出たのに桟橋に居る**。

⭐ 正しくは `sessionStorage["dragonfighters.exitVia"] = "tavern"` を**書いてから**飛ぶ。
`spawnFor` は `"tavern"` を知らないので fail-safe の **`phlan`(港町フラン)** へ落ちる ——
これは #22 が `exitVia="town"` で使ったのと**まったく同じ手**(`town.html:641` に記録あり)。
⭐ 前例もある: `tavern.html:6771` の「街へ出る」ボタンが既に `exitVia = "tavern"` を書いている。

⛔ **`enterVia` / `lastResult` には一切触れない**(#21 §2-2 の罠 A。消費するのは酒場)。

### 2-5. 解放の鎖 — 唯一の正は `tavern.html`

`tavern.html:4179`:

```js
function isUnlocked(sc) {
  if (!sc.locked) return true;
  if (!sc.unlockAfter) return true;
  return progress.cleared.has(sc.unlockAfter);
}
```

進行の実体は `tavern.html:2934` の `const PROGRESS_KEY = "dragonfighters.cleared"` ——
**localStorage の JSON 配列 1 本だけ**。`world.html` は同一オリジンなので**そのまま読める**
(前例: `town.html:505` が `dragonfighters.plazaState` を、`world.html:434` が
`dragonfighters.partyComposition` を同じやり方で読んでいる)。

`tavern.html:2218` の `scenarios[]` から実測した鎖(6 本):

| `id` | `place` | `locked` | `unlockAfter` | world ノード |
|---|---|---|---|---|
| `goblin-mine` | 廃坑 | `false` | — | `mine` |
| `bandits-forest` | 町外れの森 | `true` | `goblin-mine` | `forest` |
| `lizard-swamp` | 沼地 | `true` | `bandits-forest` | `swamp` |
| `orc-fort` | 廃墟の砦 | `true` | `lizard-swamp` | `fort` |
| `undead-temple` | 地下神殿 | `true` | `orc-fort` | `temple` |
| `dragon-lair` | ドラゴンの巣 | `true` | `undead-temple` | `dragon` |

⭐⭐⭐ **鎖は `js/world-map.js` へ意図的に重複させる**。地図から 6,802 行の `tavern.html` は
読めないので、#21 が `label` でやったのと**同じ作法**を使う ——
重複させたうえで、**ドライバが配信中の `tavern.html` の実体と機械照合する**
(`verify_world_map.js:1524` の (7a) がその前例)。
⛔ `progress` / `isUnlocked` を `tavern.html` から括り出して共有モジュールにしない(範囲が爆発する)。

### 2-6. 既存 golden のベースライン(**2026-08-25 この窓で実測**)

```
$ node tools/verify_world_map.js
  55/55 PASSED   FAILED 0   **PENDING** 0
```

⚠⚠⚠ **本チケットは、そのうち 3 本の母集団を壊す。**
`(7b-dom)` / `(7d)` は「札が**ちょうど 7 枚**」、`(7e)` は「**6 枚とも**歩くだけ」を要求している
(`verify_world_map.js:1576` / `:1599` / `:1613`)。ヘッドレスの素のプロファイルは
`dragonfighters.cleared` が未設定 = **解放は廃坑のみ** → 札が **2 枚**になって 3 本とも赤くなる。

⭐⭐⭐ **これは退行ではないが、「期待値を弱める」のも間違い。** 正しい直し方は
**装置側で母集団を復元する** = 測定ページを開くときに
`localStorage["dragonfighters.cleared"]` へ **6 本すべて**を仕込む。こうすると
`7 枚` も `6 枚とも` も**文面ごと不変**のまま 55/55 が保てる(段数を 1 つも減らさない)。

⚠ ただしこれは**この窓の予測**であって実測ではない。実装窓は必ず走らせ、
**55/55 に戻らなければ期待値を書き換える前に理由を突き止めること**。

その他の golden(本チケットで触らない。§2-3 の表が根拠):

| ドライバ | 期待 | 測定日 |
|---|---|---|
| `tools/verify_town_map.js` | 85/85 | 2026-08-23(記録) |
| `tools/verify_town_exit.js` | 23/23(`--negative` 4/4) | 2026-08-25(記録) |
| `tools/verify_title_screen.js` | 83/83 | 2026-08-23(記録) |
| `tools/verify_recruit_size.js` | 82/82 | 2026-08-23(記録) |

⚠ `probe_s2_clear.js` / `sweep_recruit_balance.js` は**測定に数十分かかる長尺**なので
非退行の本命ではない。代わりに §8 の **(4d)** が「autoplay 付きでは地図を挟まない」を直接測る。

### 2-7. changelog の要否

```bash
$ grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
24:GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

**鳴る**(`tavern.html` を触るため)。⭐ **書けるプレイヤー向けの要約は実在する**
——「受注した依頼の地まで、自分で地図を歩いて向かうようになった」。§10 に文面を用意した。
⛔ `world.html` / `js/world-map.js` / `tools/*` だけならフックは鳴らない(トリガーは上記 3 つのみ)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/world-map.js` | `UNLOCK` 鎖 + `isRevealed()` + `scenarioOfNode()` を追加。⛔ `NODES` / `EDGES` / `SITES` / `findPath` / `spawnFor` は 1 バイトも変えない |
| `tavern.html` | `departToScenario()` に地図経由の分岐 + `questDest` の書き込み / `?questwalk=0` の読み取り |
| `world.html` | 未解放拠点の非表示 / 受注地の入場 + 確認ダイアログ / `questDest` の消費 |
| `tools/verify_quest_walk.js` | **新規**。§8 の受入条件。`--negative` 内蔵 |
| `tools/verify_world_map.js` | **装置 1 箇所だけ** — 測定ページへ `cleared` = 6 本を仕込む(§2-6)。⛔ assert の文面と本数は 1 つも変えない |

⛔ **`index.html` は開かない。** 帰り道 `dfReturnPage()`(`:3086`)は #21 で既に
`world.html` を返すようになっており、本チケットは**行きの導線しか触らない**。
⛔ **`実装依頼書/README.md` の #23 行は §11 に用意してある**(承認後に足す)。

---

## 4. STEP1 — `js/world-map.js`(解放の鎖を持たせる)

`SITES` の直後へ足す。⛔ 既存の宣言の**行を縦に揃え直さない**
(`verify_world_map.js` の変異アンカーが `mine` / `swamp` / `temple` の 1 行まるごとを
文字列で握っている。0 件ヒットで exit 3)。

```js
  /* ── 解放の鎖 (依頼書 #23 §2-5) ─────────────────────────────────
   *  ⭐⭐⭐ **唯一の正は tavern.html:2218 の scenarios[] の locked / unlockAfter。**
   *     world から 6,802 行の tavern は読めないので #21 の label と同じく
   *     **意図的に重複させ、ドライバが配信中の実体と機械照合する**
   *     (tools/verify_quest_walk.js の (2z) / verify_world_map.js:1524 (7a) が前例)。
   *  ⚠ null = 最初から解放済み (goblin-mine だけ locked: false)。
   *  ⛔ ここへ「クリア済みか」を持たせない。状態の出所は localStorage の 1 キーだけ。 */
  var UNLOCK = {
    "goblin-mine":    null,
    "bandits-forest": "goblin-mine",
    "lizard-swamp":   "bandits-forest",
    "orc-fort":       "lizard-swamp",
    "undead-temple":  "orc-fort",
    "dragon-lair":    "undead-temple"
  };

  /* シナリオが地図に出るか。cleared は localStorage["dragonfighters.cleared"] の配列そのもの。
   * ⚠ 契約は tavern.html:4179 の isUnlocked() と同一 — 前提が無ければ常に true。 */
  function isRevealed(scenarioId, cleared) {
    if (!Object.prototype.hasOwnProperty.call(UNLOCK, scenarioId)) return true;
    var need = UNLOCK[scenarioId];
    if (!need) return true;
    return Array.isArray(cleared) && cleared.indexOf(need) >= 0;
  }

  /* ノード id → シナリオ id (SITES の逆引き)。⛔ 別表を作らず SITES から毎回引く。 */
  function scenarioOfNode(nodeId) {
    var ks = Object.keys(SITES);
    for (var i = 0; i < ks.length; i++) if (SITES[ks[i]] === nodeId) return ks[i];
    return null;
  }
```

エクスポートへ 3 つ足す(既存の並びは崩さない):

```js
    NODES: NODES, EDGES: EDGES, SITES: SITES, UNLOCK: UNLOCK,
    has: has, neighbors: neighbors, findPath: findPath, spawnFor: spawnFor,
    isRevealed: isRevealed, scenarioOfNode: scenarioOfNode
```

---

## 5. STEP2 — `tavern.html`(出発を地図へ回す)

### 5-1. 撤退スイッチの読み取り

`tavern.html:1885` の `window.__townOff` の**すぐ下**へ、同じ形で足す
(⚠ クエリは遷移をまたがないので、見た時点で sessionStorage へ写す):

```js
    /* ══ 出発導線の撤退スイッチ ?questwalk=0 (依頼書 #23 §7) ═══════════════════
       立っているときは「今日とまったく同じ」= 出発は index.html へ直行し、
       地図の札も 7 枚とも出て誰も入れない。⛔ ?town=0 / ?world=0 とは独立。 */
    try {
      if (new URLSearchParams(location.search).get("questwalk") === "0") {
        sessionStorage.setItem("dragonfighters.questWalkOff", "1");
      }
    } catch (e) {}
    window.__questWalkOff = (function () {
      try { return sessionStorage.getItem("dragonfighters.questWalkOff") === "1"; } catch (e) { return false; }
    })();
```

### 5-2. `departToScenario()` の分岐

`tavern.html:5618` の `window.location.href = target;` を**この形へ置き換える**
(⛔ その上の `params` 組み立ては 1 行も動かさない)。

```js
    /* ══ 地方全景を経由するか (依頼書 #23 §5-2) ═══════════════════════════════
       ⭐ 5 条件の **すべて**が揃ったときだけ地図を挟む。1 つでも欠けたら今日どおり直行。
         ① 行き先が素の index.html      … battle.html 等の単体検証は素通し
         ② 本筋 6 シナリオ              … 生成クエストは据え置き (ユーザー決定 2026-08-25)。
                                          ⭐ 判定は SITES に在るかだけ。両方とも id は
                                          "generated-quest" なので別表は要らない (§2-1)
         ③ dev / ヘッドレスの印が無い   … ⚠⚠⚠ 地図を挟むと autoplay / evade が
                                          **確実に落ちる** (§2-3 罠 B)。probe_s2_clear.js /
                                          sweep_recruit_balance.js がここで死ぬ
         ④ ?questwalk=0 が立っていない
         ⑤ ?world=0 が立っていない      … ⚠ 立っていると world.html は即 town.html へ
                                          replace するので、依頼を持ったまま街に放り出される */
    var viaWorld = (params.length === 0)
      && (target === "index.html")
      && !!(window.WORLD_MAP && WORLD_MAP.SITES && WORLD_MAP.SITES[prepScenario.id])
      && !window.__questWalkOff
      && !(function () {
           try { return sessionStorage.getItem("dragonfighters.worldOff") === "1"; } catch (e) { return false; }
         })();

    if (viaWorld) {
      /* ⭐ 受注中の行き先。world.html だけが読み、入場の直前に消費する。
         ⛔ currentScenario で代用しない — 帰還後も残る値なので「受注中」を表せない。 */
      try { sessionStorage.setItem("dragonfighters.questDest", prepScenario.id); } catch (e) {}
      /* ⚠⚠ §2-4 罠 C: これを書かないと駒は港町でなく **桟橋** に立つ
         (world.html:476 が空の exitVia を "title" と読み、spawnFor が pier を返す)。
         ⭐ "tavern" は spawnFor が知らない値 → fail-safe の phlan へ落ちる。#22 と同じ手。
         ⛔ enterVia / lastResult には触れない (消費するのは酒場)。 */
      try { sessionStorage.setItem("dragonfighters.exitVia", "tavern"); } catch (e) {}
      window.location.href = "world.html";   // ⛔ クエリを足さない
      return;
    }
    window.location.href = target;
```

⛔ `departAutoDebug()`(`:5628`)は**触らない**。6 シナリオ巡回は常に直行のまま。

---

## 6. STEP3 — `world.html`(隠す・入る・確認する)

### 6-1. 解放状態を読む

`buildNodes()`(`:555`)の**手前**へ:

```js
    /* ══ 解放状態 (依頼書 #23 §2-5) ═══════════════════════════════════════
       ⚠ 出所は localStorage の 1 キーだけ (tavern.html:2934 と同じ)。写しを作らない。
       ⚠ ?questwalk=0 のときは「今日どおり」= 全部見せる。 */
    var QUEST_WALK_OFF_KEY = "dragonfighters.questWalkOff";
    try {
      if (new URLSearchParams(location.search).get("questwalk") === "0") {
        sessionStorage.setItem(QUEST_WALK_OFF_KEY, "1");
      }
    } catch (e) {}
    var questWalkOff = false;
    try { questWalkOff = sessionStorage.getItem(QUEST_WALK_OFF_KEY) === "1"; } catch (e) {}

    var clearedList = [];
    try { clearedList = JSON.parse(localStorage.getItem("dragonfighters.cleared") || "[]"); } catch (e) { clearedList = []; }
    if (!Array.isArray(clearedList)) clearedList = [];

    /* ⭐ 受注中の依頼。⛔ ここでは消費しない (入場の直前に 1 回だけ消す)。 */
    var questDest = null;
    try { questDest = sessionStorage.getItem("dragonfighters.questDest"); } catch (e) {}

    /* このノードの札を出すか。⭐ 拠点でない中継点は常に false (元から札が無い)。 */
    function isNodeRevealed(id) {
      if (questWalkOff) return true;
      var sc = WM.scenarioOfNode(id);
      if (!sc) return true;                 /* phlan は SITES に居ないので常に見える */
      return WM.isRevealed(sc, clearedList);
    }
```

### 6-2. 未解放の拠点を「中継点の点」に化けさせる

`buildNodes()` の `if (n.kind === "site")`(`:568`)を
`if (n.kind === "site" && isNodeRevealed(id))` へ変え、`else` で way と同じ体裁にする。

```js
        el.className = "worldNode worldNode-"
          + (n.kind === "site" && isNodeRevealed(id) ? "site" : "way");
        ...
        /* ⛔ 未解放では title 属性も付けない (hover で地名が漏れる)。 */
        if (n.label && isNodeRevealed(id)) el.title = n.label;
```

⭐⭐⭐ **当たり判定 (`.worldNode[data-node]` 44px 角) も `EDGES` も `findPath` も 1 バイトも
変えない。** §2-2 罠 A の実測どおり、歩けなくすると**開始直後に廃坑へ到達できず詰む**。
未解放の拠点は「街道の折れ目」に見えるだけで、今までどおり通り抜けられる。

### 6-3. 確認ダイアログ

`#worldTitle`(`:342`)の**後ろ**へ。⚠ 既定は `display: none`
——(7d) の `elementFromPoint` が札より上の要素に食われるのを防ぐ。

```html
  <div id="worldEnterAsk" aria-hidden="true">
    <div id="worldEnterBox">
      <div id="worldEnterText"></div>
      <div id="worldEnterBtns">
        <button type="button" id="worldEnterYes">入る</button>
        <button type="button" id="worldEnterNo">やめる</button>
      </div>
    </div>
  </div>
```

```css
    /* ⚠⚠ 既定は display:none。visibility:hidden にすると (7d) の elementFromPoint が
       この要素に食われて 7 枚とも赤くなる (#15 の town.html で踏んだ罠と同型)。 */
    #worldEnterAsk { display: none; position: fixed; inset: 0; z-index: 20;
      align-items: center; justify-content: center; background: rgba(8,6,4,0.62); }
    #worldEnterAsk.show { display: flex; }
```

### 6-4. 入場

`onArriveNode()`(`:665`)を差し替える。⭐ **遷移の書き口はここ 1 本のまま**。

```js
    function onArriveNode(id) {
      var n = NODES[id];
      if (!n) return;
      if (n.enter) { location.href = n.enter; return; }   /* 港町フランは今日どおり即入る */
      /* ⭐ 受注中の依頼の地だけが入れる。⛔ NODES に enter を足さない —
         行き先は「ページの静的な属性」ではなく「受注状態の関数」。
         ⚠ NODES へ enter を足すと verify_world_map.js の (7b-data)(7b-dom)
           「enter を持つのはただ 1 つ」が赤くなる (§2-6)。 */
      if (questWalkOff || !questDest) return;
      if (WM.scenarioOfNode(id) !== questDest) return;
      askEnter(id);
    }

    function askEnter(id) {
      /* ⛔ 文言を写経しない。地名の唯一の正は js/world-map.js の label。 */
      elAskText.textContent = "〈" + (NODES[id].label || id) + "〉へ入りますか?";
      elAsk.classList.add("show");
      elAsk.setAttribute("aria-hidden", "false");
      elAskYes.onclick = function () {
        /* ⭐ questDest を消費するのはこの 1 箇所だけ。⛔ exitVia / enterVia /
           lastResult / currentScenario / partyMembers には触れない (酒場と index が読む)。 */
        try { sessionStorage.removeItem("dragonfighters.questDest"); } catch (e) {}
        location.href = "index.html";        /* ⛔ クエリを足さない */
      };
      elAskNo.onclick = function () {
        elAsk.classList.remove("show");
        elAsk.setAttribute("aria-hidden", "true");
      };
    }
```

⭐ `__world` 検証シーム(`:712`)へ**読むための窓だけ**足す
(⛔ ここへ状態を置かない):

```js
      revealed:  function () { return Object.keys(NODES).filter(isNodeRevealed); },
      questDest: function () { return questDest; },
      askOpen:   function () { return elAsk.classList.contains("show"); },
```

---

## 7. 撤退スイッチ

- **`?questwalk=0`** — **今日とまったく同じ姿**へ戻る。
  ① 酒場の「出発する」が `index.html` へ直行 ② 地図の札が **7 枚とも**出る
  ③ 港町フラン以外はどれも入れず、確認ダイアログも出ない。
- **判定位置** = `tavern.html`(§5-1 / `window.__townOff` の直下)と `world.html`(§6-1)の**両方**。
- **ページ遷移をまたぐか** = ⚠ **またぐ**。クエリは遷移で消えるので、
  見た時点で `sessionStorage["dragonfighters.questWalkOff"]` へ写して両ページが読む
  (`?town=0` / `?world=0` とまったく同じ作法。⛔ 相乗りさせない —
  赤が出たときどの撤退か切り分けられなくなる)。
- ⚠ **`?world=0` が立っているときも出発は直行**になる(§5-2 の条件⑤)。
  これは撤退スイッチの相乗りではなく、**地図が素通りされるなら歩きようがない**という含意。

---

## 8. 受入条件 — `tools/verify_quest_walk.js`(新規)

方針: **配信中の本番ページの上で測る**。解放状態は `localStorage["dragonfighters.cleared"]` を
`evaluateOnNewDocument` で仕込んで作る(6 段階を実際に作って札の枚数の変化を見る)。
⭐ **観測するもの** = 出発の着地先 / 札の枚数と地名 / `findPath` の到達性 / 遷移先と `location.search` /
sessionStorage の生死。
⛔ **観測しないもの** = 札の見た目の寸法・確認ダイアログの配色・BGM
(#21 の `verify_world_map.js` が既に測っている領分。二重に縛らない)。

⭐ `verify_world_map.js` と同じく **§0〜§5 の枠を全部宣言し、未実装は `pending()` で
PENDING を明示出力**する。最終項目の完了条件は **PENDING 0**。

### §0 装置(先に母集団を確かめる)

- **(0z)** 配信中の `tavern.html` から `id` / `place` / `locked` / `unlockAfter` を
  **6 組**抜けている(正規表現が空振りしていない)。
  ⭐⭐⭐ **これが無いと (2z) の照合が「両方 0 件で一致」= 永久緑になる**
- **(0a)** 仕込んだ `cleared` が実際にページへ届いている
  (`localStorage` の実体と `__world.revealed()` の**両方**を読む)
- **(0b)** `cleared` を 0 本 → 6 本へ動かすと **札の DOM 枚数が実際に変わる**
  (検出器が状態に反応している = 常に同じ数を返していない)

### §1 出発の導線

- **(1a)** ★酒場で廃坑を受注 → 準備 → `#btnDepart` → **`world.html` に着き、
  `location.search === ""`**。⭐ 2 経路で突き合わせる:
  `page.url()` と、着地後の `__world.heroNode()` が `"phlan"` であること(§2-4 罠 C の裏返し)
- **(1b)** ★`departToScenario` が書く既存キーが **地図に着いた後も全部生きている**:
  `currentScenario` / `partyMembers` / `partyComposition` / `questFlags` /
  `exitVia`(= `"tavern"`)/ 新設 `questDest`(= `"goblin-mine"`)。
  ⛔ `lastResult` / `enterVia` は **getItem すらしていない**
  (`grep -n 'lastResult\|enterVia' world.html` が全部コメント行を返す)
- **(1c)** 生成クエスト(掲示板 / 闇市)で出発 → **`index.html` へ直行**し、`questDest` が書かれない
  (ユーザー決定「据え置き」の機械化)

### §2 未解放の不可視

- **(2z)** ★`js/world-map.js` の `UNLOCK` が、**配信中の `tavern.html` の `scenarios[]` から
  読み取った `locked` / `unlockAfter` と 1 文字違わず一致**(別ファイルの実体どうしの照合)
- **(2a)** ★`cleared = []` のとき、札は **港町フランと廃坑の 2 枚だけ**。未解放 5 拠点は
  `.worldSign` が 0 枚・`.worldNode-site` でなく `.worldNode-way`・**`title` 属性が空**
- **(2b)** `cleared` を 0 → 1 → 2 → 3 → 4 → 5 本と伸ばすと、札が **2 → 3 → 4 → 5 → 6 → 7 枚**へ
  1 枚ずつ増える(6 段階を実測。順序も `UNLOCK` の鎖どおり)
- **(2c)** ★★★ **未解放でも歩ける。** `cleared = []` の状態で、本番の
  `WORLD_MAP.findPath("phlan", X)` が **14 ノードすべてに対して `null` を返さない**。
  ⭐ 特に `mine` と `temple` を名指しで見る(§2-2 の詰みが起きていない証明)
- **(2d)** 未解放拠点を実クリック → **歩けて、そのノードに立つ**(`__world.heroNode()` が一致)。
  遷移も確認ダイアログも起きない

### §3 受注地のクリック

- **(3z)** [装置] `questDest = "goblin-mine"` を仕込んだ状態で測っている(`__world.questDest()` で確認)
- **(3a)** ★受注地(廃坑)の札をタップ → **確認ダイアログが出る**(`__world.askOpen()` が true)。
  文言に `NODES.mine.label`(= 「廃坑」)がそのまま入っている(⛔ 写経していない)
- **(3b)** ★「入る」→ **`index.html` へ遷移**し、`location.search === ""`。
  かつ `questDest` が **消費されている**(`sessionStorage` に無い)。
  ⭐ `currentScenario` / `partyMembers` は **生きたまま**(消費するのは `questDest` だけ)
- **(3c)** 「やめる」→ `world.html` のまま・ダイアログが閉じ・**`questDest` は残る**
- **(3d)** ★**受注していない解放済み拠点**(例: `cleared` を 6 本にしたうえで
  `questDest = "goblin-mine"` のまま森をタップ)→ 歩くだけ・遷移せず・確認も出ない
- **(3e)** 確認ダイアログが閉じているとき、**7 枚の札の中心の `elementFromPoint` が
  自分自身か子孫**(#21 の (7d) を壊していない = ダイアログが `display:none` である証明)

### §4 撤退

- **(4a)** `tavern.html?questwalk=0` で受注 → 出発 → **`index.html` へ直行**。`questDest` が無い
- **(4b)** `world.html?questwalk=0` → 札が **7 枚とも**出る(`cleared = []` でも)。
  港町フラン以外はどれも遷移しない = **#21 の (7e) と同じ姿**
- **(4c)** `?questwalk=0` を付けた後、**クエリ無しで開き直しても**撤退が効いている
  (`sessionStorage` へ写せている)。⭐ 同じタブで測る
- **(4d)** ★★★ **`tavern.html?autoplay=10` で出発 → `index.html` へ直行し、
  `location.search` に `autoplay=10` が残っている**(§2-3 罠 B の直接の検査。
  `probe_s2_clear.js` / `sweep_recruit_balance.js` の身代わり)
- **(4e)** `?world=0` が立っているとき、出発は `index.html` 直行(依頼を持ったまま街に落ちない)

### §5 恒等(非退行)

- **(5a)** `WORLD_MAP.NODES` / `EDGES` / `SITES` の中身が **1 件も変わっていない**
  (件数・キー・座標・`enter` の有無をハッシュで固定)
- **(5b)** `enter` を持つノードは **今も `phlan` ただ 1 つ**
  (⛔ 受注地の入場を `NODES.enter` で実装していないことの証明)

### ⛔ 測らないこと

- 確認ダイアログの**配色・寸法・文字サイズ**(目で決める余地を残す)
- 未解放拠点の点の**大きさ**(`.worldNode-way` に合わせる、以上の縛りは置かない)
- `world` BGM の `volume`(#17 / #21 の「耳で下げてよい」を壊さない)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **`blockwalk`** | ⭐⭐⭐ **§2-2 罠 A の再現** — 未解放ノードを `EDGES` から外して歩けなくする | **(2c)** / (2d) |
| **`eatquery`** | ⭐⭐⭐ **§2-3 罠 B の再現** — `autoplay` 付きでも地図を挟む | **(4d)** |
| `pier` | §2-4 罠 C の再現 — `exitVia` を書かずに `world.html` へ飛ぶ | (1a) |
| `showall` | 未解放でも札を出す | (2a) / (2b) |
| `enterany` | `questDest` の一致を見ずにどの拠点でも入れる | (3d) |
| `eatdest` | `world.html` が `questDest` を読む**前**に消す | (3a) / (3b) |
| `chaindrift` | `UNLOCK` の 1 本を隣へずらす(`orc-fort` → `bandits-forest`) | (2z) |
| `nodialog` | 確認をはさまず即遷移する | (3a) / (3c) |
| `asktop` | ダイアログを `visibility:hidden` で隠す(常に最前面に残る) | (3e) |
| `enterprop` | `NODES` の 6 拠点へ `enter: "index.html"` を足して実装する | (5b) |

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_world_map.js` → **55/55 / FAILED 0 / PENDING 0**
  ⚠⚠⚠ §2-6 のとおり、**装置へ `cleared` = 6 本を仕込むまでは (7b-dom) / (7d) / (7e) の
  3 本が赤くなる**。これは退行ではない。⛔ **assert の文面と本数は 1 つも減らさない** ——
  直すのは測定ページの仕込みだけ。
- `node tools/verify_recruit_size.js` → **82/82**(`:443` が着地先を見ていないことの確認)
- `node tools/verify_town_exit.js` → **23/23**、`node tools/verify_town_map.js` → **85/85**

⚠ 基準値は 2026-08-25(`verify_world_map` のみこの窓で実測 / 他は記録)。
**走らせて違ったら期待値を書き換える前に理由を突き止める。**

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` は音が鳴らず fetch も死ぬ)。

1. 新規プレイで酒場 → 廃坑を受注 → 出発。**港町フランに立つ**か(桟橋ではないか)。
2. 地図に **廃坑と港町フランの札しか無い**か。ドラゴンの巣の地名が漏れていないか。
3. 廃坑まで歩く距離の**体感**。#21 で `PX_PER_MS` を 0.36 → 0.18 に半減した後なので、
   港町 → 廃坑は**かなり長い**可能性がある。⭐ 長すぎたら速度でなく**経路**を疑う。
4. 未解放の拠点が「街道の折れ目」として自然に見えるか(何かを隠している感じが出ていないか)。
5. 確認ダイアログの文字サイズ — iPhone 実機(compact)で読めるか。
6. 廃坑をクリアして酒場へ戻り、**森の札が増えている**か。
7. ⚠ iOS Safari 実機での確認ダイアログのタップ(`click` 非発火端末の懸念)。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>依頼の地まで自分で歩いて向かう</b> — 受注しても即出発ではなく、地方全景を歩いて目的地の立て札にたどり着いてから潜るようになった。まだ解放していない依頼の地は地図に現れない。"
```

⛔ `--no-verify` / `-c core.hooksPath=` はハーネスが全部ハードブロックする。迂回路は無い。

---

## 11. やらないこと

- ⛔ **生成クエスト(掲示板 / 闇市ポドルプラザ)を歩かせる。** ユーザー決定「据え置き」。
  §8 (1c) が「直行のまま」を機械で固定するので、勝手に広げると赤くなる。
- ⛔ **`NODES` へ `enter` を足す。** 行き先は受注状態の関数であってページの静的属性ではない
  (§6-4 / (5b) / 変異 `enterprop`)。
- ⛔ **`EDGES` / `findPath` / `spawnFor` / 札の文言・座標を変える。**(5a) が固定する。
- ⛔ **`progress` / `isUnlocked` を `tavern.html` から共有モジュールへ括り出す。**
  今回は §2-5 の「重複させてドライバが照合する」作法を使う。
- ⛔ **`index.html` を開く。** 帰り道は #21 で既に地図経由になっている。
- ⛔ **移動速度(`PX_PER_MS` / `MS_PER_TILE`)の調整。** §9-3 で長すぎたら別チケット。
- ⛔ **受注中の目的地を光らせる等の強調演出。** まず歩いてみて、要るなら別チケット。
- ⛔ **`実装依頼書/README.md` への行追加**(承認後に足す)。用意してある行:

  | 23 | [2026-08-25_quest-walk-to-site.md](2026-08-25_quest-walk-to-site.md) | **承認済** | 0% | 受注した依頼の地まで地方全景を歩いて向かう + 未解放の拠点を地図から隠す。⚠⚠⚠ **未解放ノードを歩けなくすると開始直後に廃坑へ到達できず詰む**(実測)→ 隠すのは見た目だけ。⚠⚠ **地図を挟むと autoplay/evade が落ちる**ので dev URL では素通し。⭐ 既存 `verify_world_map.js` は装置へ `cleared`=6 本を仕込めば 55/55 のまま |

---

## 12. 実装結果

**2026-08-26 実装窓(dev-loop / 1 項目 = 1 サブエージェント)で完了。4 項目分割・停止 0 回。**

### 12-1. 項目ごとの commit

| 項目 | commit | 何をしたか |
|---|---|---|
| ① 共有データ + ドライバの枠 | `85b6de3` | `js/world-map.js` へ `UNLOCK` / `isRevealed()` / `scenarioOfNode()` を追加(§4)。`tools/verify_quest_walk.js` を新規作成し、**§0〜§5 の assert を 25 本とも先に宣言**して未実装は `pending()` で **PENDING** を明示出力。装置(`startServer` / `readTavernScenarios` / `clearedUpTo` / `seedPage` / `newPage` / `readStorage` / `measureWorld` / `measureDevice`)を先に置いた |
| ② 出発を地図へ回す | `f0f185c` | `tavern.html` の `departToScenario()` へ `viaWorld` の 5 条件 + `questDest` / `exitVia` の書き込み、`?questwalk=0` の読み取り(§5)。**`tavern.html` へ `<script src="js/world-map.js">` を追加**(下記 12-2 の 1)。ドライバの §1 / §4 と `advanceToPrep` / `measureDepart` / `readWorldSource` を実装。§10 の changelog 1 行も投入 |
| ③ 隠す・入る・確認する | `d588584` | `world.html` へ解放状態の読み取り・未解放拠点の way 化・確認ダイアログ・`onArriveNode` の分岐・検証シーム 3 本(§6)。ドライバの §2 / §3 / §5 と `clickNode` / `readAskState` / `measureAskChain` / `measureSeededAsk` / `measureWorldClicks` を実装 |
| ④ 負のコントロール + 仕上げ | `e7f3ea1` | 変異 **10 本**を `--negative` へ内蔵(素と同じ装置・同じ述語を変異ポートへ回す形)/ `(0b)` を実装して **PENDING 0** / `verify_world_map.js` の**装置 1 箇所**へ `cleared` = 6 本を仕込んで **55/55 へ復帰** / 本節と `README.md` |

### 12-2. 依頼書の主張が実際と違っていた点(⭐ 次の起草への申し送り)

1. ⚠⚠⚠ **`tavern.html` は `js/world-map.js` を読み込んでいなかった。**
   §5-2 は `window.WORLD_MAP` が酒場から見える前提で書かれていたが、`<script src>` が
   無かった(地図データを読むのは `world.html` だけだった)。項目② が 1 行足して解決。
   ⭐⭐⭐ **これが無いと条件②が永久 false = `viaWorld` が一度も立たず、「何も起きないのに
   (1c)(4a)(4c)(4d)(4e) が全部緑」**という最悪の空振りになる。
   → だからこれらの述語には **`d.seam.worldMapInTavern === 'object'` を必ず AND** してある。
   **恒久教訓: 「別ファイルの関数が見える」前提は、`grep` で `<script src>` まで確かめる。**
2. ⚠⚠ **§2-3 の「影響を受けないドライバ」表が誤っていた。**
   `tools/verify_recruit_size.js` は「`:443` はクリック直後に同じ evaluate 内で読むので
   着地先を見ない → 影響なし」と書いたが、**実際に壊れた**
   (82/82 → 57/66 + FATAL `Execution context was destroyed`)。真因 = `openPage()` の
   request interception が **`/index.html` だけ**を abort していたので、酒場のタブが本当に
   `world.html` へ遷移し、以降の `evaluate` が全滅した。項目② が正規表現を
   `/\/(index|world)\.html/` へ広げて解決(82/82 へ復帰)。
   ⭐ **「着地先を見ない」は「遷移しても平気」を意味しない。** 遷移そのものが
   実行コンテキストを壊す。導線を 1 枚挟むチケットでは **`btnDepart` を押す全ドライバの
   遷移横取りの正規表現**を洗うこと(⛔ 「何を読むか」だけ見て安全と判断しない)。
3. ⚠ **§2-6 の「3 本が赤くなる」という予測は外れて、実際は 2 本だった。**
   赤くなったのは `(7b-dom)` と `(7d)` の 2 本だけ。`(7e)` は「札」ではなく
   **ノード**(`.worldNode`)をクリックするので、札が消えても母集団が減らない。
4. ⚠ **`tools/verify_title_screen.js` の golden は 83/83 ではなく 86/86。**
   §2-6 の記録値が古かった(項目② が HEAD でも 86/86 であることを確認して切り分け済み)。
5. ⭐ **確認ダイアログのハンドラ登録を §6-4 の原文から変えた。**
   原文どおり `askEnter()` の中で `elAskYes.onclick = …` を書くと、iOS 対策で `touchend` を
   `addEventListener` で足したときに **開くたびにハンドラが積み上がる**。
   → `bindAsk(el, fn)` で **1 回だけ**登録し、対象ノードは `askNodeId` に持たせる形にした
   (機能は同一。二重発火は `preventDefault` + `askBusy` が吸う)。
6. ⭐ **押し口は `click` に加えて `touchend` も併用**(`click` 非発火端末で
   「閉じることも入ることもできない」になるのを避ける。#5 で踏んだ罠)。
7. ⚠⚠ **負のコントロール `eatquery` は、§8 の表どおり「条件①(`params.length === 0`)を
   潰す」だけでは (4d) が緑のままだった**(2026-08-26 実測)。
   すぐ上の `target += sep + params.join("&")` で `target` が `"index.html?autoplay=10"` に
   なっているので、**条件②の `target === "index.html"` が代わりに止めていた**。
   ⭐ **dev URL を素通しさせているのは①と②の 2 つ**で、①だけでは罠 B を再現できない。
   → 変異は②を `|| (target.split("?")[0] === "index.html")` へ書き換える形へ直した。
8. ⭐ **`(0b)` の PENDING 理由文(「world.html が未実装なので必ず 7 = 7 になる」)は、
   項目③ の実装後には事実と食い違っていた。** 実際には **0 本→2 枚 / 6 本→7 枚**に割れて
   おり、述語 `lo.signCount !== hi.signCount` はそのままで緑になった。
   項目④ は **4 番目の要素(PENDING の理由)を外しただけ**で PENDING 0 に届いた。
9. ⭐ 依頼書 §8 の負のコントロール表は「赤くなるべき節」を**最小限**しか書いていない。
   実際には**担当外も一緒に赤くなる**ものがあり(下表)、これは欠陥の性質そのものなので
   `MUTATIONS[k].allowRed` へ明示許可し、`(neg-*-範囲)` が
   **それ以外の巻き込み**だけを落とす形にした。
10. ⭐ `verify_world_map.js` の直し方は §2-6 の予測どおりで正しかったが、**仕込み口は
    「1 箇所」ではなかった**。`browser.newPage()` は 9 箇所から呼ばれている
    (札 / 実クリック / compact / BGM / title / return / result)。1 箇所だけ仕込むと
    `(7b-dom)` は緑になるのに `(7d)` が赤のまま、という割れ方をする。
    → **`browser.newPage` を 1 回だけ包む**形にして全タブへ届かせた(差分は 1 箇所のまま)。

### 12-3. 最終的な数字(2026-08-26 実測)

**受入条件(素)— PENDING 0:**

```
$ node tools/verify_quest_walk.js
  25/25 PASSED   FAILED 0   **PENDING** 0
```

**負のコントロール — 10 本すべてが担当の節を赤くし、空振り 0:**

```
$ node tools/verify_quest_walk.js --negative
  46/46 PASSED   FAILED 0   **PENDING** 0     (exit 0)
```

| port | mutate | 担当の節 (§8 の表) | 一緒に赤くなる(想定内) | 緑のまま |
|---|---|---|---|---|
| 9161 | `blockwalk` | **(2c)(2d)** | (5a) EDGES を触ったので恒等ハッシュ | (2z)(2a)(5b) |
| 9162 | `eatquery` | **(4d)** | — | — |
| 9163 | `pier` | **(1a)** | (1b) `exitVia === "tavern"` を要求している | — |
| 9164 | `showall` | **(2a)(2b)** | — | (2z)(2c)(5a)(5b) |
| 9165 | `enterany` | **(3d)** | — | — |
| 9166 | `eatdest` | **(3a)(3b)** | (3z)(3c) 受注の印ごと消えるため | — |
| 9167 | `chaindrift` | **(2z)** | — | (2a)(2c)(5a)(5b) |
| 9168 | `nodialog` | **(3a)(3c)** | (3b) 押す相手が居ないので遷移も起きない | (3z) |
| 9169 | `asktop` | **(3e)** | — | (0a)(0b) |
| 9170 | `enterprop` | **(5b)** | (5a) 恒等ハッシュが `enter` の有無を含む | (2z)(2a)(2c) |

⭐ `blockwalk` は §2-2 罠 A の機械証明そのもの:
`findPath` の手数が `{"swamp":null,"fort":null,…}` になり、実クリックでも
`swamp→forest / fort→forest`(= 動けていない)が出た。

**既存 golden の非退行:**

```
$ node tools/verify_world_map.js     55/55 PASSED   FAILED 0   **PENDING** 0
$ node tools/verify_recruit_size.js  82/82 PASS
$ node tools/verify_title_screen.js  86/86 passed
$ node tools/verify_town_exit.js     23/23 PASSED   (--negative 4/4)
$ node tools/verify_town_map.js      85/85
```

### 12-4. 残っている宿題

⚠ **§9「実機/実感の確認」7 項目は、ヘッドレスでは代替できないものが残っている。**
ローカルは `py -m http.server 8000` で **http 起動が必須**(`file://` は不可)。

| §9 | 内容 | ヘッドレスでの代替 |
|---|---|---|
| 1 | 出発したら**港町フランに立つ**か(桟橋ではないか) | ✅ **代替済** — (1a) が `__world.heroNode() === "phlan"` を実測。変異 `pier` が「書かないと桟橋に立つ」を機械証明 |
| 2 | 廃坑と港町フランの**札しか無い**か / ドラゴンの巣の地名が漏れていないか | ✅ **代替済** — (2a) が `.worldSign` 0 枚・`worldNode-way`・**`title` 属性が空**まで実測 |
| 3 | 港町 → 廃坑を歩く距離の**体感** | ⛔ **未確認(ユーザーの目が要る)**。実測値だけ記録: 本番 `findPath` で **6 手** / `PX_PER_MS` 0.18。⭐ 長すぎたら速度でなく**経路**を疑うこと(§9-3) |
| 4 | 未解放拠点が「街道の折れ目」として**自然に見える**か | ⛔ **未確認(絵の判断)**。機械で見たのは class と札の有無だけ |
| 5 | 確認ダイアログの**文字サイズ**が iPhone(compact)で読めるか | ⛔ **未確認**。⭐ ダイアログは `#worldStage` の `scale(zoom)` の**外**(`position: fixed`)なので、札と違って**書いた px がそのまま実効サイズ**になる |
| 6 | 廃坑をクリアして酒場へ戻ると**森の札が増えている**か | ✅ **代替済** — (2b) が `cleared` を 0→5 本まで動かして 2→3→4→5→6→7 枚を実測(順序も鎖どおり) |
| 7 | iOS Safari 実機での確認ダイアログの**タップ** | ⛔ **未確認(実機のみ)**。⭐ 対策として `click` + `touchend` の 2 本を `bindAsk()` で登録済み(12-2 の 6) |

その他:

- ⛔ **移動速度(`PX_PER_MS` / `MS_PER_TILE`)は §11 のとおり触っていない。** §9-3 の体感で
  長すぎると判断されたら別チケット。
- ⛔ **受注中の目的地を光らせる等の強調演出も入れていない**(§11)。まず歩いてみて、
  要るなら別チケット。
- ⭐ 撤退スイッチ **`?questwalk=0`** は (4a)(4b)(4c) が「酒場も地図も今日どおりの姿へ戻る」
  ことを機械で押さえている。`?world=0` との独立も (4e) が押さえている。
