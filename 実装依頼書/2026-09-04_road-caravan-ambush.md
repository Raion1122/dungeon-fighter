# #51 街道の襲撃 — 隊商が魔物に襲われている現場に居合わせる

- **起草**: 2026-09-04(計画窓) / **ステータス**: **承認済**(2026-09-04 ユーザー承認)
- ⚠ **着手前にもう一度測ること** — 起草から時間が経つと別窓のコミットで行番号が動く。
  最低限これ 1 本: `git diff --stat fffd49c..HEAD -- index.html world.html js/road-events.js`
- **触るファイル**: `js/road-events.js` / `world.html` / `index.html` / `tools/verify_road_ambush.js`(新規)
- ⛔ **触らないファイル**: `tools/verify_cone_cast.js` / `index.html` の円錐呪文探索まわり(`coneTargets` 系)
  — #50(円錐呪文の発射率)は **2026-09-04 に `fffd49c` で全 4 項目着地済み**(隣窓からの連絡で確認)。
  ⇒ **`index.html` を開いてよい**。ただし本チケットが触る 4 箇所は円錐探索と 1 行も重ならない(§3)。
  ⚠⚠ **#50 の 4 コミットは未 push**(`origin/main..HEAD` = 4 本)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- **会議記録**: `dev-meetings/2026-09-04_road-caravan-ambush.md`

---

## 1. 目的

ワールドマップを横断している最中に、**まれに**「隊商が魔物に襲われている現場」に出くわす。
プレイヤーは **助けに入る / 見捨てて街道を外れる** を選べる。助けに入れば、その場で 1 戦して街道へ戻る。

今は街道で起きることが**文と d20 だけ**(#45 の 6 件 + #47 の恩恵)で、
**ワールドマップから戦闘へ入る経路が 1 本も無い**。「街道は安全ではない」という手触りを、
既にあるものだけで作る。

### ⚠⚠⚠ 依頼の発端にあった前提が 1 つ崩れている

起案時の想定は「隊商のスプライトは流用が効くものがあるはず」だったが、実測すると
**「隊商が魔物に襲われる戦闘」そのものが既に丸ごと出荷済み**だった(§2-1)。
7.9-3「隊商護衛」が闇市ポドルプラザの稀少クエストとして動いており、馬車・街道テクスチャ・
ウェーブ状態機械・敗北条件まで全部ある。

⇒ **本チケットで作るのは戦闘ではなく「横断中にそれが割り込んでくる導線」だけ。**
⛔ 戦闘の中身を作り直さないこと。

### ユーザー決定(2026-09-04 AskUserQuestion で確認済)

| 論点 | 決定 | ⭐ 不採用案とその理由 |
|---|---|---|
| 戦闘の重さ | **1 波・短期決戦**(敵 3〜4 体を 1 度だけ) | 2 波 = 守り抜いた手応えは増すが「通りすがり」の枠付けから重くなる / 3 波 = 7.9-3 と同じ重さになり、本命のダンジョンへ行く気力を削ぐ |
| リスクと罰 | **HP の消耗を本命のダンジョンへ持ち越す** | ⛔ 起草窓の推奨は「持ち越さない + 馬車で罰」だったが、ユーザーは**緊張を取る側**を選んだ。⚠ #47 は逆に「恵みだけ」で落としている(理由 = 関わらず立ち去るが最適解になる圧)。今回は **リスクが無いと関わるが常に最適解**になるので、同じ罠の裏返しとして持ち越しを採る |
| 報酬 | **経験値 + 金貨・物資**(⛔ #47 の恩恵は流用しない / ⛔ 傭兵名簿への加入もしない) | 恩恵流用 = 最も安いが #47 と区別がつかなくなる / 名簿加入 = 配線先が未特定で #51 の範囲を超える |
| codex 発注 | **#51 の起草と同時に発注**(並走) | マップ納品を待たずに導線を通す。⛔ 発注文は起草で止め、承認後に投下 |

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

**基準 hash = `fffd49c`**(#50 全項目の着地時点。2026-09-04 に実測)。
`origin/main` = `fffd49c` / **未 push 0**(#50 は push 済)。作業ツリーは本依頼書と会議記録の未追跡 2 件のみ。
⛔ 非退行は `HEAD` ではなく**この hash**を基準にする(HEAD 基準にすると永久緑)。

### ⭐ 行番号は `fffd49c` で検証済み(⛔ 「#50 が触ったから測り直せ」は不要だった)

起草時の測定は `4c69862`。実装窓から「#50 の push で `index.html` が 114 行増/65 行減しているので
行番号を取り直せ」と申し送りがあったが、**実測すると 1 件もズレていなかった**:

    git diff --stat 739a9e4..fffd49c -- index.html   # 114 insertions(+), 65 deletions(-)
    git diff --stat 4c69862..fffd49c -- index.html   # ← 出力が空 = index.html は 1 バイトも変わっていない

⭐⭐⭐ **真因** = その +114/-65 は `739a9e4..4c69862`(#50 項目 1〜3)のぶんで、
**起草時の測定はその後(`4c69862`)に行っている**。締めの `fffd49c` は `index.html` を触っていない。
⇒ **下表の行番号は `fffd49c` でそのまま有効**(2026-09-04 に全件 `grep -n` で再確認済み)。

⭐ **恒久教訓 = 「HEAD が動いた」と「自分の測定基準より後に動いた」は別物。**
差分の範囲は **自分の測定 hash から HEAD まで**で取る(`git diff --stat <測定hash>..HEAD -- <file>`)。
コミット件数や合計行数で判断すると、今回のように**不要な測り直しを 1 周する**。

⚠ 別窓が動き続ける以上、**着手時にもう一度この 1 コマンドだけ**回すこと:

    git diff --stat fffd49c..HEAD -- index.html world.html js/road-events.js

### 2-1. 既にあるもの(⛔ 作り直さない)

| ファイル:行 | 何 |
|---|---|
| `tavern.html:3474` | クエスト系統 `caravan-escort`(`rareOnly` / 屋外の街道ウェーブ防衛) |
| `tavern.html:8158-8180` | `buildPlazaSynthetic` の `isCaravan` 分岐。`gen.waves` / `gen.wagonSpawns` / 手置き `gen.spawns` を積む |
| `index.html:9999-10010` | `ENEMY_TYPES.caravanWagon`(`isObjective` / hp 60 / displaySize 240 / `assets/caravan_anim.png`) |
| `index.html:10187-10197` | 生成シナリオの `wagonSpawns` / `waves` の**素通し口**(`Array.isArray` で検疫済) |
| `index.html:20512-20560` | 隊商護衛のウェーブ状態機械(`spawnWave` / `escortWaveList`) |
| `index.html:20638-20646` | 馬車全損の敗北確定(`escortWagonLost()` → `gameOver = true`) |
| `index.html:23066` / `:33316` | `spawnWagon()` の配置と呼び口 |
| `index.html:3621-3622` | `SCENARIO_TEX["caravan-road"]`(`caravan_road_floor.png` / `caravan_road_verge.png?v=1`) |
| `index.html:8169` / `:10445` | 隊商キャンプの焚火(街道テーマ限定・非衝突の純演出) |

**再測定コマンド**:

    grep -n "caravan" index.html tavern.html | head -40
    ls assets/ | grep -iE "caravan"

### 2-2. 街道の出来事(#45 / #47)の現状

| ファイル:行 | 何 |
|---|---|
| `js/road-events.js` | **唯一の正**。イベント表 6 件 + 器の描画。⛔ 文言を world.html へ 1 文字も写さない((0b) が番人) |
| `js/road-events.js:81` `:104` `:127` `:149` `:172` `:196` | 6 件の id。`coast_dock_quarrel` / `woods_woodcutter` / `lake_ripple` / `mountain_rockfall` / `swamp_marker` / `swamp_pilgrim` |
| `world.html:1145` | `maybeRoadEvent(atId)` — 撤退・歩行中・拠点・再訪・地形・確率の 6 段ガード |
| `world.html:1220-1238` | `onArriveStep(atId, destId)` — 拠点の入場が優先、それ以外で `maybeRoadEvent` |
| `world.html:1181` | `finishRoadEvent(ev, choice, outcome)` — `resultText` → `boonOf` → `showResult` |
| `js/road-events.js` `showResult(ev, text, onDone, boon)` | ⭐ **第 3 引数 `onDone` は「先へ進む」を押したときに実際に呼ばれる**(実読で確認)。⇒ 新しい UI を 1 つも作らずに「結末の文 → 戦闘へ」が書ける |
| `world.html:1083` | world → index の**唯一の入場口**。⛔ クエリを足さない |
| `world.html:1204-1210` | `pushRoadBoon` — #47 が敷いた「街道 → 潜行」の持ち込み配管の実例 |
| `index.html:33275-33299` | `consumeRoadBoon` — 消費側の実例(getItem → removeItem → 適用) |

### 2-3. ⚠⚠⚠ 罠 A — `EVENTS` に 7 件目として足すと golden が非決定的に赤くなる

`tools/verify_road_events.js:1769` は固定種で 1 件だけ発火させ:

    if (want.choiceWin)  m.choiceWin  = await measureChoice(browser, port, errs, { force: D20_WIN,  session: PARTY4 });

`measureChoice` は `seed: SEED_NEAR, dest: DEST_NEAR` の**固定種**で歩き、
`tools/verify_road_events.js:1449` の (3f) が**発火したイベントの判定つきの枝を押す**:

    const ch = def ? (def.choices || []).filter(c => c.check)[0] : null;

`pickEvent` は `list[Math.floor(rnd() * list.length) % list.length]`(`js/road-events.js`)なので、
**表に 1 件足すとその地形の引きが動く**。押される先が襲撃に変わった瞬間、
(3f) は `w.resultText === ch.success` を要求しているのに**ページが index.html へ遷移してしまう**。

⭐ **だから襲撃は `EVENTS` に入れず、別の表 `AMBUSH` + 別の振りにする。**
既存 6 件の分布は 1 ビットも動かない。
⭐ 件数そのものは直書きされていない(`tools/verify_road_events.js:469` =「⛔ 6 / 5 / 17 を直書きしない」)ので、
**赤くなる理由は件数ではなく引きのズレ**。ここを取り違えないこと。

### 2-4. ⚠⚠⚠ 罠 B — 乱数を同じストリームから引くと決定論の golden が全部ずれる

`js/road-events.js` の `rnd()` は**単一の可変状態** `rndState` を進める:

    function rnd() {
      ensureRnd();
      rndState = (rndState + 0x6D2B79F5) >>> 0;
      ...
    }

`verify_road_events` は `seed` / `seedFromUrl` / `SEED_NEAR` / `SEED_MAIN` で決定論を要求している
(`measureSeedSig` は同じ種で 2 回走らせて一致を見る)。
⇒ **襲撃の振りが `RE.rnd()` を 1 回でも呼ぶと、その後の全ての引きが 1 つずれる。**

⭐ **襲撃は独立した状態 `ambState` を持つ専用ストリーム `ambRnd()` を使う。**
⛔ `rnd()` を呼ばない。⛔ `Math.random()` を発火判定に直接使わない(決定論が要る)。
⭐ この罠は変異 `sharedrng` として `--negative` に内蔵する。

### 2-5. ⚠⚠⚠ 罠 C — 「判定なしの枝」が戦闘へ繋がると既存 golden 3 本が全部戦闘へ落ちる

| ドライバ | 行 | 押すもの |
|---|---|---|
| `tools/verify_world_steps.js` | 774 | `(ev.choices \|\| []).filter(x => !x.check)[0]` |
| `tools/verify_world_map.js` | 683 | 同上 |
| `tools/verify_quest_walk.js` | 831 | 同上 |

⇒ **襲撃の「判定なし」の枝は必ず「見捨てて通り過ぎる」でなければならない。**
「助けに入る」を判定なしにすると、この 3 本が横断のたびに index.html へ落ちる。
⭐ D&D の作法(関わる側が判定を要求する)と番人の要求がたまたま完全に一致している。
⭐ 変異 `helpnocheck` が番人。

### 2-6. ⚠⚠⚠ 罠 D — world.html に 2 本目の `sessionStorage.removeItem` を書けない

`tools/verify_road_events.js:1346-1364` の (2c) は world.html の**配信バイトを文字列検索**する:

    const rm   = n('sessionStorage.removeItem');
    const lset = n('localStorage.setItem'), lrm = n('localStorage.removeItem');
    const BASE_REMOVE = 1;   /* 2026-09-03 着手前の実測 */
    const ok = rm === BASE_REMOVE && lset === 0 && lrm === 0;

⇒ world.html 側で一回性キーを消すのに `removeItem` を使うと**即赤**。
⭐ **空文字で上書き(`setItem(key, "")`)して消費する。** `setItem` の件数は判定に使われていない
(報告文字列に出るだけ)。⛔ `BASE_REMOVE` を 2 に緩めない。

### 2-7. ⚠⚠⚠ 罠 E — 素直に作ると「街道で戦ったら港町フランへワープ」する

    // index.html:3171 dfReturnPage()
    if (worldOff) return "town.html";
    return "world.html";

    // world.html:740
    var heroNodeId = WM.spawnFor(spawnVia, scenarioId);

    // js/world-map.js spawnFor()
    if (via === "dungeon") { var n = SITES[scenarioId]; if (n && has(n)) return n; return "phlan"; }

**world.html は主人公位置を保存していない。** 襲撃の合成シナリオ id は `SITES` に無いので
`"phlan"` が返る = **港町フランに立たされる**。
⚠ ノエル役の指摘どおり「バグだと気づかれない壊れ方」なので、**必須の対処項目**。

⭐ 直し方は `world.html:740` の**呼び口**に 1 段挟むだけ(#23 の型 =「行き先はページの静的な属性ではなく状態の関数」)。
⛔ **`js/world-map.js` の `spawnFor` は 1 バイトも触らない**
(`tools/verify_quest_walk.js` (5a) が `{nodesFP, edges, sites}` の sha1 を **876c5f6336f96811** で固定している)。

### 2-8. ⚠⚠⚠ 罠 F — `currentScenario` を上書きすると本命のクエストが襲撃に化ける

`tavern.html:6921` が出発時に `dragonfighters.currentScenario` を焼き、`index.html:10201` が読む。
**戻ってきたときに誰も元へ戻さない。**
⇒ 襲撃で上書きすると、その後クエスト地へ入場したときに**襲撃シナリオが起動する**。

⭐ **専用キー `dragonfighters.roadBattle` を立て、index.html が最優先で読んで消す**(#47 `roadBoon` と同型)。
`currentScenario` / `generatedScenario` は 1 バイトも汚さない。

### 2-9. 報酬の配線 — XP は無料 / 金貨は 1 本足りない

| 対象 | 実測 | 結論 |
|---|---|---|
| クリア XP | `index.html:10177` が `clearXp: _genScenario.clearXp \|\| 0` で素通し / `:36425` が読む | ⭐ **新規配線ゼロ**。`clearXp` を積むだけ |
| 撃破 XP | `index.html:12141` `earnedXpThisRun += amount` | ⭐ 戦えば自然に入る |
| 金貨 | `index.html:36413` `const earnedGold = coins;`。`coins` の加算口は **宝箱と各種ボーナスだけ**(`:16140` `:16325` `:16669` `:16710` `:22808` `:22827-22874`)。**敵の撃破では増えない** | ⚠ 襲撃は `trapCount:0` / `hiddenChestCount:0` にするので **金貨が 0 になる**。⇒ **`clearGold` の素通しを 1 本足す**(§6 STEP3) |
| 牙貨 | `fangReward` は既存の素通し口あり | ⛔ 使わない(闇市の通貨なので街道では出さない) |

**再測定コマンド**:

    grep -n "coins +=\|const earnedGold\|clearXp" index.html

### 2-10. 消耗の持ち越し(ユーザー決定)の挿入位置

`index.html` の run 開始 3 連 IIFE を実読した順序:

| 行 | 何 | hp をどうするか |
|---|---|---|
| `:33241` | `applyAccessoryHpBonus()` | `maxHp += pb; hp = maxHp;`(**全快させる**) |
| `:33253` | `consumePendingSummon()` | 召喚ユニットを `allies` へ**追加する**(= 添字が動く) |
| `:33275` | `consumeRoadBoon()` | 糧なら `maxHp += 3; hp = maxHp;`(**全快させる**) |

⭐ **消耗の適用は `applyAccessoryHpBonus` の直後・`consumePendingSummon` の前**に置く。理由 2 つ:

1. `applyAccessoryHpBonus` より前だと `hp = maxHp` で**上書きされて消える**
2. `consumePendingSummon` より後だと **`allies` の添字がずれる**(召喚が編成へ入る)

⭐ **`consumeRoadBoon` より前**に置くことで、#47 の「糧」(`hp = maxHp`)が**傷を癒やす**形になる。
これは事故ではなく設計:「街道で得た糧が効いている」という既存の文言と意味が一致する。

### 2-11. 空きポート

`tools/*.js` に出現する 9000 番台の実測(最大順):
`9899 / 9900 / **9940 / 9941 / 9954 / 9958 / 9959 / 9960**(= `verify_cone_cast` / #50 が使用中) / 9999`。

⇒ 新ドライバの base は **9970**。変異 18 本なら `9971`〜`9988` を占有する。
⚠⚠ **ポートの空きは base ではなく `--negative` で開くレンジまで数える**(#47 が 9770 で踏んだ)。
⚠ #50 の項目 4 が未着地なので `verify_cone_cast` のレンジが 9960 より伸びる可能性がある。
**着手時にもう一度数え直すこと。**

**再測定コマンド**:

    grep -rhoE "9[0-9]{3}" tools/*.js | sort -n | uniq | tail -25

### 2-12. golden の母集団(⛔ 前のチケットの本数を信じない)

    grep -l "world\.html" tools/*.js        # world.html を触るドライバ
    grep -l "road-events\|roadBoon" tools/*.js

⚠ #45 / #46 は「7 本」として非退行を見ていたが実測は **13 本**で、取りこぼした 1 本
(`verify_player_sheet`)が**実物の赤として出荷されていた**。**毎回数え直すこと。**

⛔ `verify_player_sheet` の FAILED `{(2c)(2d)(8a)(8f)}` は **#45 以来ずっと赤**(#48 の担当)。
**集合が同じなら非退行 / 増えたら #51 のせい。**

### 2-13. changelog の要否

`scripts/hooks/check_changelog.py:24` を実読:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

⇒ **鳴る**(`index.html` を触る)。書けるプレイヤー向けの要約は実在する:
「街道で隊商が襲われている場に出くわすことがある。助けに入るか、見て見ぬふりをするか選べる。」
⛔ 嘘の要約をでっち上げる必要はない。§10 に文面を用意した。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/road-events.js` | `AMBUSH` 表 1 件 + `ambRnd` / `ambRoll` / `ambSeed` を追加し `window.ROAD_EVENTS` へ公開。⛔ `EVENTS` / `RATE` / `rnd` / `pickEvent` は 1 バイトも触らない |
| `world.html` | `maybeRoadAmbush()` の追加 / `onArriveStep` から 1 行呼ぶ / 戦闘ペイロードと帰還位置の書き出し / `heroNodeId` 初期化に 1 段 / 撤退 `?ambush=0` |
| `index.html` | `roadBattle` の消費と ad-hoc シナリオへの流し込み / `roadWounds` の消費と書き出し / `clearGold` の素通し 1 本 / 馬車全損で `gameOver` を立てない分岐 / 撤退 `?ambush=0` |
| `tools/verify_road_ambush.js` | 新規(base ポート 9970) |
| `tavern.html` | ⛔ **触らない**(7.9-3 の `caravan-escort` は無傷のまま) |
| `js/world-map.js` | ⛔ **触らない**(sha1 固定) |

### ⛔ 別窓(#50)との切り分けの確認

#50 が触るのは `index.html` の**円錐呪文の探索まわり**(`004b5e3` =「円錐探索を共通ヘルパーへ / 8 方向 + 清潔優先の 2 段」)と
`tools/verify_cone_cast.js`。本チケットが `index.html` で開くのは

- run 開始 3 連 IIFE(`:33241`〜`:33299`)
- シナリオ解決(`:10170`〜`:10205`)
- リザルト(`:36405`〜`:36480`)
- ウェーブ敗北確定(`:20638`〜`:20646`)

の 4 箇所だけで、**円錐探索とは 1 行も重ならない**。
⭐ #50 は `fffd49c` で全項目着地・**push 済**(`origin/main = fffd49c` / 未 push 0)。**待ちは無い**。
⚠⚠ **`実装依頼書/README.md` は #50 の締めで 1 行追加されて push 済**。
#51 の行を足すときは**その 1 行が既に origin にある前提**で、`git pull` してから触ること。

⛔ **`実装依頼書/README.md` の #51 行は、#50 が着地してから足す**(文面は §11)。

---

## 4. STEP1 — 装置を先に立てる(`tools/verify_road_ambush.js`)

⭐ **母集団ガード(§0)を先に緑にする。** §1〜§5 はこの時点では PENDING でよい。
base ポート **9970**(⚠ 着手時に §2-11 のコマンドで数え直す)。

### §0 装置

- **(0a) 表が在る** — `window.ROAD_EVENTS.AMBUSH` が存在し、`choices` が 2 つ、
  **判定つきが 1 つ・判定なしが 1 つ**。⛔ 件数を直書きせず、実体から数えて整合だけ見る
- **(0b) 写経していない** — world.html の**配信バイト**に `AMBUSH` の `title` / `intro` /
  `label` / 結末文が **1 つも出てこない**(#45 (0b) と同じ物差し)
- **(0c) 決定論の腕が在る** — 襲撃が**必ず出る種**と**必ず出ない種**が両方存在する
  (⛔ どちらか片方しか作れないなら、以降の assert は全部空振りする)
- **(0d) 既存の引きが動いていない** — 同じ種で `RE.rnd()` を N 回引いた列が、
  **襲撃機能を通す前後で 1 つも変わらない**(⭐ 罠 B の検出器。§2-4)
- **(0e) 3 経路の腕が全部立つ** — 判定なし / 判定つき成功 / 判定つき失敗 の**それぞれで
  襲撃が発火する種が存在する**。⛔ 「発火が 1 件以上」で満足しない

> ⭐⭐⭐ **#50 §12-6 の教訓を先に取り込んである。**
> #50 では母集団ガード (0b) が「差 50 件以上」しか要求していなかったため、
> **(0b) は緑のまま後続の (2a)(3 倍以上)が原理的に達成不能**という構造ができていた。
> ⇒ **母集団ガードには「後続 assert の敷居を満たすだけの差が出ること」まで書く。**
> 本チケットでは (0c)(0e) がその役目を負う —— 「出る/出ない」だけでなく
> **§1 の 3 経路と §2 の勝敗 2 経路が全部踏めること**を (0c)(0e) で先に証明する。

> ⚠⚠ **headless で編成を仕込むには 3 点セットが要る**(#50 §12 の実測):
> `knownSpells` / `partySkills`(配列)に加えて
> **`sessionStorage["dragonfighters.partyMembers"]`** が必須。
> 無いと `buildParty` がランダムに組み、run ごとに編成が変わって数値が編成差と混ざる。
> ⭐ 本チケットの (1f) は**その逆**を測る = `partyMembers` を空にしたら襲撃が出ないこと。

---

## 5. STEP2 — 街道側(`js/road-events.js` + `world.html`)

### 5-1. `js/road-events.js` に `AMBUSH` を足す

⛔ **`EVENTS` 配列には入れない**(§2-3)。⛔ `rnd()` を呼ばない(§2-4)。

    /* ══ 街道の襲撃 (#51) ═══════════════════════════════════════════════════
       ⛔ EVENTS に入れない —— 入れると pickEvent の引きが動き、verify_road_events の
         固定種 (SEED_NEAR) で発火する 1 件が変わって (3f) が index.html へ落ちる (#51 §2-3)。
       ⛔ rnd() を呼ばない —— rndState は単一の可変状態なので、1 回引くだけで
         既存 golden の決定論が全部 1 つずれる (#51 §2-4)。専用ストリームを持つ。
       ⭐ 選択肢は 2 つ。**判定なしの枝は必ず「見捨てて通り過ぎる」側**
         (既存 golden 3 本が filter(x => !x.check)[0] を機械的に押す。#51 §2-5)。
       ⭐ 判定は「戦うかどうか」ではなく「**どう戦うか**」を決める
         (成功 = 奇襲 / 失敗 = 正面からの乱戦。⛔ 失敗で戦闘が消える設計にしない)。
       ⚠ checkKey は js/skill-check.js の CHECKS にある 12 個から選ぶ
         (survival / nature は存在せず、書くと判定ごと静かに消える)。 */
    var AMBUSH_RATE = 0.06;          /* ⭐ 遊んで動かすレバー。⛔ 受入条件で具体値を縛らない */
    var ambState = 0, ambReady = false;
    function ambEnsure() { /* seedInfo と同じ種から、別の定数でずらして初期化する */ }
    function ambRnd() { /* ⛔ rndState を触らない */ }
    function ambRoll() { return ambRnd() < AMBUSH_RATE; }

    var AMBUSH = {
      id: "road_caravan_ambush", checkKey: "perception", dc: "medium",
      title: "街道の襲撃",
      intro: "<悲鳴と、車輪の軋み。街道の先で、荷を積んだ幌車が傾いている——>",
      choices: [
        { label: "茂みから回り込み、隙を突く", check: true,
          success: "<気づかれずに背後を取った>",
          fail:    "<足元の枝を踏んだ。敵がいっせいにこちらへ向き直る>" },
        { label: "見つからぬよう街道を外れて通り過ぎる", check: false,
          result: "<背中で悲鳴が遠ざかっていく>" }
      ]
    };

⭐ 公開は `AMBUSH` / `ambRoll` / `ambSeed` の 3 つ。⛔ `AMBUSH_RATE` は公開しない
(world.html が確率を知らない状態を保つ。#45 の変異 `alwaysfire` と同じ規律)。

### 5-2. `world.html` に振りと分岐を足す

    /* ★ 街道の襲撃 (#51)。⛔ maybeRoadEvent より **前**に振り、出たらそちらは振らない
       (同じ停留所で器が 2 回開くのを防ぐ)。 */
    function maybeRoadAmbush(atId) {
      if (!AMBUSH_ON) return false;              /* 撤退 ?ambush=0 */
      if (walkStepOff) return false;
      if (moving) return false;
      if (isRoadSite(atId)) return false;
      if (ambVisited[atId]) return false;
      ambVisited[atId] = true;
      if (!hasRealParty()) return false;         /* ⭐ 編成が無いなら出さない (§5-3) */
      var RE = window.ROAD_EVENTS;
      if (!RE || !RE.AMBUSH || typeof RE.ambRoll !== "function") return false;
      if (!RE.ambRoll()) return false;
      RE.open(RE.AMBUSH, function (choice) { onAmbushChoice(choice); });
      return true;
    }

`onArriveStep` の末尾は 1 行だけ変える:

    if (maybeRoadAmbush(atId)) return;    /* ★ #51 */
    maybeRoadEvent(atId);

### 5-3. ⚠ 編成が無いときは出さない(罠 G)

ワールドマップは**受注なしでも歩ける**。`dragonfighters.partyMembers`(rich)が無いまま
戦闘へ飛ばすと、index.html の `buildParty` が**フォールバックで別編成を組む**
(= 黙って壊れる。#47 の実測メモにある型)。
⇒ `hasRealParty()` = `partyMembers` を JSON.parse して**長さ 1 以上の配列**であること。
⛔ `partyComposition` で代用しない(職業キーだけでは rich な編成にならない)。

### 5-4. 選んだ後 — 器の `onDone` に乗せて戦闘へ

⭐ **新しい UI を 1 つも作らない。** `showResult(ev, text, onDone, boon)` の第 3 引数を使う
(§2-2 で実読確認済 = 「先へ進む」で実際に呼ばれる)。

- **判定なしの枝**(見捨てる) … 従来どおり結末の文を出して閉じる。⛔ 戦闘へ行かない・⛔ 何も保存しない
- **判定つきの枝**(助けに入る) … d20 → 結末の文(成功=奇襲 / 失敗=乱戦)→「先へ進む」→ 戦闘へ

    /* ⛔ 保存も遷移も、判定つきの枝を押したときだけ。 */
    RE.showResult(RE.AMBUSH, text, function () { departToAmbush(atId, surprise); });

⚠ `resolveSkillCheck` は **null を返しうる**(未知の checkKey / 代表者が選べない)。
null は**失敗ではない** —— #45 の作法どおり「判定なしの結末」へ倒す。
⇒ **null のときは戦闘へ行かない**(見捨てたのと同じ扱い)。⛔ 黙って何も出さないのは禁止。

### 5-5. 積荷と帰り道を書く(⛔ `removeItem` を使わない。§2-6)

| キー | 中身(合成例) | 誰が消すか |
|---|---|---|
| `dragonfighters.roadBattle` | `{"at":"cross_n","surprise":true,"waves":[{"count":3,"pool":["goblin","goblinArcher"]}],"wagonSpawns":[{"tx":9,"ty":14}],"spawns":[["goblin",14,13],["goblinArcher",15,13],["goblin",14,14]],"themeId":"caravan-road","trapCount":0,"hiddenChestCount":0,"clearXp":<数>,"clearGold":<数>}` | **index.html**(`removeItem`) |
| `dragonfighters.roadReturn` | `"cross_n"`(停留所 id の文字列) | **world.html が空文字で上書き**(⛔ `removeItem` は使えない) |

⛔ `currentScenario` / `generatedScenario` / `questDest` / `exitVia` / `lastResult` / `partyMembers` には**触らない**。
⭐ `waves` は **1 件だけ**(ユーザー決定 = 1 波・短期決戦)。
⚠ 敵キーは `ENEMY_TYPES` 実在のものだけ(`goblin` / `goblinArcher` / `hobgoblin` / `goblinRider`)。
未知キーは検疫で無言消去され、`spawns` が空になると **goblin-mine へフォールバック**して
ゴブリン鉱山の敵が湧く化けバグになる(7.9-3 の実測注記)。

### 5-6. 帰ってきたときに立つ場所(§2-7)

`world.html:740` の**呼び口**を変える。⛔ `js/world-map.js` は開かない。

    var resume = peek("dragonfighters.roadReturn");        /* ⛔ removeItem を呼ばない */
    var heroNodeId = (resume && WM.walkNodes()[resume]) ? resume
                                                        : WM.spawnFor(spawnVia, scenarioId);
    if (resume) { try { sessionStorage.setItem("dragonfighters.roadReturn", ""); } catch (e) {} }

⚠ 母集団は `NODES` ではなく**細分化グラフ**(`WM.walkNodes()` = NODES ∪ STEPS)。
襲撃は刻み点で起きるので `WM.has()` では引けない。

### 5-7. 撤退 `?ambush=0`(world 側)

`ROAD_EVENT_ON` と同じ形で URLSearchParams を 1 回読む。
⛔ sessionStorage へ写さない(ページ内完結。#47 `?roadboon=0` と同じ扱い)。

---

## 6. STEP3 — 潜行側(`index.html`)⚠ #50 項目 4 の着地後に着手する

### 6-1. `roadBattle` の消費(シナリオ解決の**最優先**)

`index.html:10170` 付近の `_genScenario` 解決の**手前**に置く。

    /* ★ 街道の襲撃 (#51)。⭐ consumeRoadBoon と同型: getItem → removeItem → 適用。
       ⛔ currentScenario / generatedScenario を**読まない・書かない**
         (酒場が焼いた本命のクエストを 1 バイトも汚さない。#51 §2-8)。
       **キーが無い = 通常の潜行**。 */

読めたら `_genScenario` 相当のオブジェクトを組み、`scenarioId` は `"road-ambush"` 固定。
⛔ `progress.cleared` に載る経路へ流さない(生成クエスト扱いのまま = 反復可)。
⭐ 奇襲(`surprise: true`)は **#47 の `applyRoadVigilance`(`index.html:20313` / `:24407`)と同じ効果**
= 最初の交戦で敵の初手を 1 ターン潰す。⛔ 新しい戦闘機構を作らない。

### 6-2. 馬車全損でも `gameOver` を立てない(⛔ 7.9-3 と分岐させる)

`index.html:20638-20646` は現在:

    if (!gameOver && hp > 0 && escortWagonLost()) {
      updateInfo("隊商は失われた…");
      gameOver = true;
    }

⇒ 街道の襲撃のときは **`gameOver = true` を立てない**(文だけ出す)。
理由: 通りすがりの襲撃で全滅扱いにすると「本命のクエストへ行く途中で潜行が終わる」。
⛔ 7.9-3(ポドルプラザの隊商護衛)の挙動は 1 バイトも変えない。

### 6-3. 報酬(§2-9)

| 何 | どうする |
|---|---|
| 撃破 XP | ⭐ 何もしない(自然に入る) |
| クリア XP | `clearXp` を積むだけ(素通し口が既にある) |
| 金貨・物資 | **`clearGold` の素通しを 1 本足し**、`earnedGold = coins + clearGold` にする |
| 馬車が全損したとき | **`clearGold` を 0 にする**(⭐ 罰は数値ではなく結末で与える) |

⛔ マジックアイテム抽選確率(`magicItemChance`)は上書きしない(既定 1% のまま)。
⛔ `fangReward` は使わない。

### 6-4. 消耗の持ち越し(ユーザー決定)

**書き出し** — リザルトで**勝ったときだけ**、かつ**襲撃だったときだけ**:

    dragonfighters.roadWounds = {"n":4,"hp":[0.62,1,0.31,0.85]}

- `n` = `[player, ...allies]` の人数 / `hp` = 各人の **hp / maxHp**(0〜1)
- ⭐ **下限 1 HP**。0 で保存すると次の潜行が開始即死になる
- ⛔ **負けたときは書かない**(§6-5)

**消費** — `applyAccessoryHpBonus` の**直後**・`consumePendingSummon` の**前**(§2-10)。

- `n` が実際の人数と食い違ったら**丸ごと捨てる**(⛔ 部分適用しない)
- ⭐ `consumeRoadBoon` より前なので、#47 の「糧」(`hp = maxHp`)が**傷を癒やす**

### 6-5. 負けたときは仕切り直し

襲撃で PT が全滅したら:

- ⛔ `roadWounds` を**書かない**
- **`roadReturn` を消す**(index.html なら `removeItem` を使ってよい。制約は world.html 側だけ)
- ⇒ `spawnFor` のフォールバックが効いて **港町フラン**に戻る = 敗北の代償は「街道の一往復」

⭐ これで **勝ち = 傷を負って先へ進む / 負け = 無傷だが街まで戻される** という
非対称だが筋の通った構造になる。

### 6-6. 撤退 `?ambush=0`(index 側)

`roadBattle` / `roadWounds` を**読まない・消さない**。⛔ 判定は 2 ページで独立
(#47 `?roadboon=0` と同じ作法)。

---

## 7. 撤退スイッチ

- **`?ambush=0`** — world 側 = 襲撃が 1 度も出ない・キーを 1 バイトも書かない /
  index 側 = `roadBattle` / `roadWounds` を無視する
- ⚠ **判定は 2 ページで独立**。world.html は `location.href = "index.html"` に**クエリを足さない**
  ので、`?ambush=0` は **world.html のレグにしか効かない**。これは仕様(#47 と同じ)
- ⚠ sessionStorage へ写さない = 開き直せば元に戻る

---

## 8. 受入条件 — `tools/verify_road_ambush.js`(新規・base 9970)

**観測するもの** = 表の形 / 押した枝ごとの結末 / storage に何が書かれたか / 遷移先 /
帰還後に立っている停留所 / 開始 HP。
**観測しないもの** = 発生率の具体値・敵の構成・文言の中身。

### §1 街道側

- **(1a) 3 経路** — 判定なし / 判定つき成功 / 判定つき失敗 の**全部**を実際に押して観測する
- **(1b) 見捨てたときは 1 バイトも書かない** — `roadBattle` も `roadReturn` も生えない
- **(1c) 助けたときだけ書かれる** — `roadBattle` に `waves` が **1 件**、`roadReturn` が刻み点 id
- **(1d) 奇襲は成否で変わる** — d20=20 と d20=1 で `roadBattle.surprise` が **true / false** に割れる
- **(1e) 遷移先** — `location.search === ""` の `index.html`(⛔ クエリを足していない)
- **(1f) 編成が無ければ出ない** — `partyMembers` を空にすると襲撃が 0 件
- **(1g) 器が 390x844 に収まる** — 襲撃の器も `verify_road_events` (1d) と同じ物差しで測る
  (⭐ `EVENTS` に入れていないので既存 (1d) は襲撃を測らない = **ここで測らないと誰も測らない**)

### §2 潜行側

- **(2a) 消費** — `roadBattle` が `removeItem` され、`waves` が 1 件のシナリオが立つ
- **(2b) 本命が汚れない** — 走行の前後で `currentScenario` / `generatedScenario` が **1 バイトも変わらない**
- **(2c) 消耗の往復** — 勝利後に `roadWounds` が書かれ、次の起動でその比率どおりの hp で始まる
  ⭐ **2 経路で突き合わせる**: 書かれた JSON の比率 と 実際の `hp / maxHp`
- **(2d) 下限** — 比率 0 を注入しても hp は **1 以上**
- **(2e) 人数不一致は丸ごと捨てる** — `n` を偽装すると消耗が **1 も適用されない**
- **(2f) 馬車全損で金貨が 0** — 馬車を殺して勝つと `clearGold` 分が入らない
- **(2g) 馬車全損で `gameOver` が立たない** — ⛔ 7.9-3 側は従来どおり立つ(**両方**測る)

### §3 帰還

- **(3a) 襲撃地点に戻る** — 勝って帰ると `__world.heroNode()` が**襲撃した刻み点**
- **(3b) 一回性** — もう一度 world.html を開くと `roadReturn` は空で、従来の `spawnFor` に戻る
- **(3c) 負けたら港町** — 敗北で帰ると `phlan`、かつ `roadWounds` が**書かれていない**
- **(3d) 依頼の目印が残る** — 帰還後も `questDest` が生きている

### §4 恒等(非退行)

- **(4a) 既存の引きが不変** — (0d) を本実装後にもう一度(⭐ 罠 B の本検査)
- **(4b) world.html の storage の数** — `sessionStorage.removeItem` が**依然 1 件**・localStorage 0 件
- **(4c) 既存 6 件が同じ** — `EVENTS` の id 集合・件数・地形割りが着手前と一致

### §5 撤退

- **(5a)** `world.html?ambush=0` → 襲撃 0 件・キー 0 バイト・既存の出来事は従来どおり出る
- **(5b)** `index.html?ambush=0` → `roadBattle` を注入しても通常の潜行が立つ

### ⛔ 測らないこと

- **`AMBUSH_RATE` の具体値**(0.06)— 遊んで動かすレバー。縛るのは「出る種と出ない種が両方ある」だけ
- **敵の構成 / count**(1 波の 3 体)— バランス調整の余地
- **文言の中身** — 写経していないこと((0b))だけ見る
- **`WAGON_TARGET_CHANCE`** — 7.9-3 のレバーなので触らない

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `sharedrng` | ⭐ **罠 B の再現**: `ambRnd` をやめて `rnd()` を呼ぶ | (0d)(4a) |
| `helpnocheck` | ⭐ **罠 C の再現**: 「助けに入る」を `check:false` にする | (0a)(1a) |
| `intoevents` | ⭐ **罠 A の再現**: `AMBUSH` を `EVENTS` へ push する | (4c) + `verify_road_events` |
| `worldremove` | ⭐ **罠 D の再現**: `roadReturn` の消費を `removeItem` にする | (4b) |
| `overwritescen` | ⭐ **罠 F の再現**: `currentScenario` を襲撃で上書き | (2b) |
| `nospawnresume` | ⭐ **罠 E の再現**: `roadReturn` を見ずに `spawnFor` だけ使う | (3a) |
| `resumesticky` | `roadReturn` を空文字で潰さない | (3b) |
| `dismisswrite` | 見捨てた枝でも `roadBattle` を書く | (1b) |
| `nullfight` | `resolveSkillCheck` が null でも戦闘へ行く | (1a) |
| `nosurprise` | `surprise` を常に true | (1d) |
| `woundzero` | 下限クランプを外す | (2d) |
| `woundpartial` | 人数不一致でも先頭から適用 | (2e) |
| `woundonlose` | 敗北時にも `roadWounds` を書く | (3c) |
| `woundtoolate` | 消耗の適用を `consumeRoadBoon` の**後**へ動かす | (2c) |
| `goldalways` | 馬車全損でも `clearGold` を入れる | (2f) |
| `gameoveramb` | 街道の襲撃でも `gameOver` を立てる | (2g) |
| `gameovernever` | 7.9-3 でも `gameOver` を立てない | (2g) |
| `nopartyguard` | `hasRealParty()` を外す | (1f) |
| `copytext` | `AMBUSH` の文言を world.html のコメントへ写経 | (0b) |
| `boxleak` | 器を閉じずに描き直す | (1g) |

⚠ 変異は「仕様の言葉」ではなく **その assert が実際に読む値の供給口**へ当てる(#47 の教訓 2)。
⚠ 条件を潰す変異は「門番が 1 本とは限らない」(#47 の教訓 4)。空振りしたら**欠陥そのものを再現**する形へ書き直す。

### 既存 golden の非退行(実装後に必ず走らせる)

⛔ **本数は着手時に数え直す**(§2-12)。⛔ **並走させず 1 本ずつ逐次**。単発の赤はまず 1 回だけ再実行。

| ドライバ | 基準(2026-09-03 実測) |
|---|---|
| `verify_road_events` | 着手時に採る(#45 の基準を再取得) |
| `verify_road_boon` | **20/20** PASSED / FAILED 0 |
| `verify_world_steps` | 着手時に採る |
| `verify_world_map` | 着手時に採る |
| `verify_quest_walk` | 着手時に採る |
| `verify_ability_scores` | **24/24** |
| `verify_darkvision` | **25/25** |
| `verify_mercenary_roster` | **44/44** |
| `verify_recruit_size` | **82/82 PASS** |
| `verify_run_chronicle` | **73/73**(⚠ 並走時 71/73 = flake。単独で走らせる) |
| `verify_player_sheet` | ⛔ **FAILED 4 本 `{(2c)(2d)(8a)(8f)}` が着手前から赤**(#48 の担当)。**集合が同じなら非退行** |
| `probe_party_size` | ⛔ **#23 以前から壊れている**(酒場の出発先が world.html になった時点で遷移横取りが死んだ)。**#51 では直さない** |

⚠ 基準値は 2026-09-03 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める。**
⭐ 着手前の基準を採り損ねたら `git worktree add --detach <path> 4c69862` で当時の木を取り出して測り直せる。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレ音声だけ無音)。

1. 襲撃の器が iPhone 縦(390x844)で読めるか。導入文の長さは適切か
2. 「助けに入る」→ d20 → 結末 → 戦闘 の間が長すぎないか(ページ遷移を挟む)
3. ページ遷移で BGM が不自然に切れないか
4. **帰還後、襲撃した場所に立っているか**(港町ではない)
5. **傷を負ったまま本命のダンジョンへ入る**手応え。きつすぎないか
6. `AMBUSH_RATE = 0.06` の頻度。横断 1 回あたり何回出るか
7. 馬車を守れなかったときの「金貨が入らない」が、罰として伝わるか

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>街道で隊商が襲われる場に出くわす</b> — 助けに入るか、見て見ぬふりをするか選べる。助けた傷はそのまま次の潜行へ持ち越す。"

---

## 11. やらないこと

- ⛔ **7.9-3「隊商護衛」(ポドルプラザの稀少クエスト)の挙動を変えない。** `tavern.html` を開かない
- ⛔ **街道の卓上マップは #52(codex 発注)**。#51 は既存の `caravan-road` テクスチャで通す
- ⛔ **救った護衛の傭兵名簿(#38)への加入** — 配線先が未特定。別チケット
- ⛔ **`verify_player_sheet` の FAILED 4 本を直す** — #48 の担当
- ⛔ **`probe_party_size` の遷移横取りを直す** — #23 以前からの別件
- ⛔ **`EVENTS` の 6 件・`RATE` の値・`js/world-map.js` を触る**
- ⛔ **`実装依頼書/README.md` への行追加**(別窓の #50 着地後)。用意してある行:

    | 51 | [2026-09-04_road-caravan-ambush.md](2026-09-04_road-caravan-ambush.md) | **承認済** | 0% | 街道で隊商が襲われる場に出くわす。⭐ 戦闘は 7.9-3 の完成品を流用 = 新規は導線だけ。⚠⚠⚠ 罠 5 つ(EVENTS へ足すと引きがズレる / rnd を共有すると決定論が死ぬ / 判定なしの枝が戦闘だと golden 3 本が落ちる / world で removeItem を増やせない / 帰還先が港町へ化ける) |

---

## 12. 実装結果(実装窓が実測で埋めた)

- **着地**: dev-loop 4 項目・停止 0 回。基準 hash = `fffd49c`(#50 締め)。
  `357e0ae`(項目1 装置)→ `4dbdd25`(項目1 追補)→ `74ebbbf`(項目2 街道側)→
  `6f4d755`(項目3 潜行側)→ 本コミット(項目4 締め)。
- **受入条件**: `node tools/verify_road_ambush.js` = **28/28 PASSED / FAILED 0 / PENDING 0**(exit 0)。
  `pageerror / console.error` **0 件**。
- **負のコントロール**: `node tools/verify_road_ambush.js --negative` = **65/65 PASSED /
  FAILED 0 / PENDING 0**(exit 0)。**変異 20 本すべてが担当節を実際に赤にした**(空振り 0)。
- **触ったファイル**: `js/road-events.js` / `world.html` / `index.html` /
  `tools/verify_road_ambush.js`(新規)。⛔ `tavern.html` / `js/world-map.js` は 1 バイトも触っていない。

### 12-1. ⚠⚠⚠ 依頼書の主張が実測で崩れた点(全 12 件)

| # | 依頼書の主張 | 実測 | どうしたか |
|---|---|---|---|
| ① | **§4 (0b)** は「写経していないので緑」 | **赤が正しい**。検索対象が 0 本のとき「1 つも出てこない」は**自明に真**になり母集団が立たない | #48 の則で **assert を緩めず予測のほうを訂正**。母集団ガード(`MIN_STRINGS = 4`)を入れて `popFail` を返す形にした |
| ② | **§6-1** 「`roadBattle` の消費はシナリオ解決の手前(`:10170`)」 | **遅すぎる**。`_scenIdForTex`(テーマ)と `_builtinScenId`(分岐グラフ)が両方この値を要る | 消費を **テクスチャ解決の直前(`:3383`)へ上げた**。下ろすと襲撃に**本命クエストの地形と分岐グラフが載る** |
| ③ | **§6-5** 「敗北時に `roadReturn` を `removeItem` すれば `spawnFor` のフォールバックで港町へ戻る」 | **成立しない**。`currentScenario` は本命クエスト id のままなので `SITES` に当たる。実測 `spawnFor("dungeon","lizard-swamp")` → **`"swamp"`** = 負けたのに目的地の前へワープ | 消すのではなく `roadReturn` へ **`"phlan"` を書く**形へ訂正((3c) がこの実測をそのまま記録に残す) |
| ④ | **§2-12** 「`verify_player_sheet` は FAILED 4 本 `{(2c)(2d)(8a)(8f)}` が着手前から赤」 | **解消済み**(#48 が着地したため) | 非退行の基準を **FAILED 0** に引き上げた |
| ⑤ | **§2-12** golden 母集団 **13 本** | `grep -l "world\.html" tools/*.js` = **15 本**(うち 1 本は `verify_road_ambush` 自身) ⇒ **golden は 14 本** | 14 本を 1 本ずつ逐次で回した(§12-3) |
| ⑥ | (依頼書に無い制約 — §8 は観測用の窓を足す前提で書かれている) | **`__world` に窓を 1 つも足せない**。`verify_road_events` (4b) が `__world` の窓を「既存 25 + `roadEvent` = **ちょうど 26 個**」で**集合固定**している(2026-09-04 に `roadAmbush` を足して赤にして戻した) | 分類は `ev.id === RE.AMBUSH.id` を**ページの中で**見て、書かれた値は `sessionStorage` を直に読む形にした |
| ⑦ | (依頼書に無い制約) | `js/road-events.js` に `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` を **2 本目として書けない** —— `verify_road_events` の変異 `seedignore` の逐語アンカーが 2 ヒットして**起動時検算 exit 3**。0 本にしても exit 3 | `ambRnd` の最終行を **2 行に割った**。⛔ 共通ヘルパへ畳むのも不可 |
| ⑧ | (依頼書に無い実測) | `showResult` も `paint()` を通るので **結末画面でも `armAt` がリセットされる** | 器を畳む前に毎回 `ARM_MS + 200ms` 待つ。踏んだ症状は「街道の出来事を畳めなかった」で歩行が 2 タップ目で停止 |
| ⑨ | **§5-5** 盤面(座標 / themeId / waves)を world.html に書く前提 | 隣窓 #52 が「盤面を 1 つの名前つき定数へ束ねてほしい」と依頼 | `js/road-events.js` に **`AMBUSH_FIELD`** を新設し、world.html は**丸ごと写して `at` / `surprise` を足すだけ**。⚠ `df-mapdef.js resolve()` 規則④で `themeId:"caravan-road"` にできるのは**カスタム幾何を持たない今だけ** |
| ⑩ | **§8** 変異 `woundtoolate` = 「適用を `consumeRoadBoon` の**後**へ動かす」 | **1 行置換にならない**(ブロックの移動)= そのままでは空振り | #48 の則で assert を 1 文字も緩めず、**欠陥そのものの再現**へ書き直した = 「適用した hp が後から `hp = maxHp` で上書きされる」。実測で (2c) の②だけが `[1,1,0.31,0.854]` になり赤 |
| ⑪ | **§8** 変異 `nospawnresume` の担当節 = **(3a)** | **(3a)(3c) の 2 つ**。項目 3 で敗北の帰還も同じ resume 枝を通るようになった(③の訂正の副作用) | 担当節を広げた。実測 = (3a) は `phlan`、(3c) は `swamp`(= spawnFor の答え)で両方赤 |
| ⑫ | **§8** 変異 `gameoveramb` / `gameovernever` は別々の当て先 | **同じアンカー(`escortWagonLossEndsRun()` の定義行)を共有**する | 共有のまま実装した。各変異は素のソースから**独立に**組むので一意性検算はそれぞれ 1 件で通る |

### 12-2. 負のコントロール 20 本 — どの変異がどの節を赤にしたか(**実走で確定**)

⭐⭐⭐ 担当節は机上で書かず、**1 本ずつ実走して**確定した。⛔ 空振り 0 本。

| 変異 | 配信先 | 担当節 | 赤くなった実測 |
|---|---|---|---|
| `sharedrng` | `js/road-events.js` | (0d)(4a) | 挟み込みレグが 3 種とも **`⛔不一致@16`**(= `ambRoll` を 8 回呼んだ直後から列がずれる)。⭐ 素の boot 列は 3 種とも一致したまま = **挟み込みが無いと罠 B は無傷に見える**ことの実証 |
| `helpnocheck` | `js/road-events.js` | (0a)(1a) | (0a) `choices 2 件 (判定つき 0 / 判定なし 2)`・成功文≠失敗文=false / (1a) 判定つきの 3 腕とも「選択肢が引けない」。記録 (0e) も赤 |
| `intoevents` | `js/road-events.js` | (4c) | `EVENTS 7 件` = `["road_caravan_ambush", null]` が 7 行目に生えた。記録 (0a) は**緑のまま**(= 件数を直書きしなくても並びで捕まる) |
| `boxleak` | `js/road-events.js` | (1g) | `intro:2btn success:3btn fail:4btn result:5btn` = 結末画面に前の二択が残る。器の高さも 325 → 438px へ膨らむ |
| `worldremove` | `world.html` | (4b) | `sessionStorage.removeItem = 2 件 (着手前 1)`。記録 (3b) も赤(`roadReturn = null` = キーごと消えた) |
| `nospawnresume` | `world.html` | (3a)(3c) | (3a) 帰還後 = `"phlan"`(注入した刻み点でない)/ (3c) 帰った先 = `"swamp"`(期待 `phlan`)。記録 (3b) は母集団が立たず `popFail` |
| `resumesticky` | `world.html` | (3b) | 帰還直後の `roadReturn = "forest__farm_n@1"`(空文字になっていない)・2 回目も同じ刻み点に立つ |
| `dismisswrite` | `world.html` | (1b) | 見捨てた腕の走行後に `["battle","ret"]` が生えた(⭐ 走行前は `[]`)。記録 (1a) も赤 |
| `nullfight` | `world.html` | (1a) | 判定 null の腕で結末が `null`(= `resultText` が落ちる)。⭐ 変異ページ側に `PAGEERROR Cannot read properties of null (reading 'success')` が 1 件出る |
| `nosurprise` | `world.html` | (1d) | d20=20 / d20=1 の**両方**で `surprise=true` = 割れない |
| `nopartyguard` | `world.html` | (1f) | 編成なしでも襲撃 **1 件**(対照の編成ありと同数) |
| `copytext` | `world.html` | (0b) | 写経ヒット 1 本 = `choices[1].label="見つからぬよう街道を外れて通り過ぎる"` |
| `overwritescen` | `index.html` | (2b) | 起動直後・`showResult` 後とも `currentScenario = "road-ambush"`(仕込みは `"lizard-swamp"`) |
| `woundzero` | `index.html` | (2d) | `hp/maxHp = ["0/50","0/56","0/42","0/41"]` = 次の潜行が開始即死 |
| `woundpartial` | `index.html` | (2e) | `n` を 99 に偽装しても `["1/50","1/56","1/42","1/41"]` = 先頭から部分適用された |
| `woundtoolate` | `index.html` | (2c) | 書き出し①は正しいのに、読み込み②が `[1,1,0.31,0.854]`(主人公だけ全快)。記録 (2d) も赤 |
| `woundonlose` | `index.html` | (3c) | 敗北後に `roadWounds = {"n":4,"hp":[1,1,1,1]}` が書かれ、`roadReturn` も襲撃地点のまま(⭐ `if/else` なので `resetRoadReturnHome()` も同時に止まる) |
| `goldalways` | `index.html` | (2f) | 全損の腕でも `gold = 80` = 守り切った腕と同額 |
| `gameoveramb` | `index.html` | (2g) | 街道の襲撃側 `escortWagonLossEndsRun() = true`(期待 false) |
| `gameovernever` | `index.html` | (2g) | 7.9-3 側 `escortWagonLossEndsRun() = false`(期待 true) |

**装置側の締め**: `(n0a-*)` 20 本 = 「素には注入文字列が無く、変異側にちょうど 1 つ」/
`(n0b-*)` 20 本 = 「素と変異で配信バイト長が違う」/ `(n9a)` = PENDING の変異 0 件 /
`(n9b)` = 変異表 20 行そろっている。合計 **65 assert**。

**⭐ 実装で足した仕掛け** — `LEG_NEED` / `LEG_DEP` / `legsFor()` / `collect()`。
変異ごとに **targets ∪ record が読む値の供給レグだけ**を走らせる(20 本 x 全レグは実時間で
現実的でない)。⛔ 母集団は 1 つも削っていない —— 対照の腕(`idxPlain` / `idxZero` /
`fireNone` など)も表に含めてある。受入条件(`--negative` なし)は**常に全レグ**。

### 12-3. 既存 golden の非退行 — **14 本すべて緑・期待値の書き換え 0 件**

⛔ 母集団は数え直した: `grep -l "world\.html" tools/*.js` = **15 本**、うち 1 本は
`verify_road_ambush` 自身 ⇒ **golden は 14 本**(依頼書 §2-12 の「13 本」は古い)。
`grep -l "road-events\|roadBoon" tools/*.js` = **5 本**で、全部この 15 本の内側。
⚠⚠⚠ **1 本ずつ逐次**で回した(並走させると偽の赤が出る)。**単発の赤による再実行は 0 回**
(`verify_run_chronicle` の既知 flake も出なかった)。**14 本とも exit 0**。

| ドライバ | 実測(2026-09-04 / 項目 4 の締めで実行) | 依頼書 / 申し送りの基準 |
|---|---|---|
| `verify_road_events` | **25/25 PASSED FAILED 0 PENDING 0** | 25/25(一致) |
| `verify_road_boon` | **20/20 PASSED FAILED 0 PENDING 0** | 20/20(一致) |
| `verify_world_steps` | **33/33 PASSED FAILED 0 PENDING 0** | 33/33(一致) |
| `verify_world_map` | **57/57 PASSED FAILED 0 PENDING 0** | ⭐ 基準が無かった本数(申し送りの 10 本に入っていなかった)。FAILED 0 |
| `verify_quest_walk` | **25/25 PASSED FAILED 0 PENDING 0** | 25/25(一致) |
| `verify_world_heromark` | **18/18 PASSED FAILED 0 PENDING 0** | ⭐ 未実行だった 3 本の 1 つ。FAILED 0 |
| `verify_town_exit` | **素 23/23 PASSED / PENDING 0** | ⭐ 未実行だった 3 本の 1 つ。FAILED 0 |
| `verify_title_screen` | **86/86 passed** | ⭐ 未実行だった 3 本の 1 つ。FAILED 0 |
| `verify_ability_scores` | **24/24 PASSED FAILED 0 PENDING 0** | 24/24(一致) |
| `verify_darkvision` | **25/25 PASSED FAILED 0 PENDING 0** | 25/25(一致) |
| `verify_mercenary_roster` | **44 PASSED / 0 FAILED / 0 PENDING (44/44)** | 44/44(一致) |
| `verify_player_sheet` | **73/73 PASSED FAILED 0 PENDING 0** | ⭐ 依頼書 §2-12 の「FAILED 4 本が着手前から赤」は**解消済み**(#48 が着地)。基準は **FAILED 0** |
| `verify_recruit_size` | **82/82 PASS** | 82/82(一致) |
| `verify_run_chronicle` | **73 PASSED / 0 FAILED / 0 PENDING** | 73/73(一致) |

⭐ 項目 4 は **本番ファイルを 1 バイトも触っていない**(`git status` = `tools/verify_road_ambush.js`
と本依頼書・台帳のみ)。⇒ この 14 本は「項目 1〜3 が着地した木」に対する非退行の実測であり、
着手前 = 着手後。⇒ **changelog は不要**(`scripts/hooks/check_changelog.py` の
`GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` に 1 つも当たらない)。

### 12-4. ⚠ 残課題(**未対処**。#51 では直さないと決めたもの)

1. ⚠⚠ **勝利が `progress.cleared` に載る。** `index.html` は `lastResult` に
   `{ scenarioId: "road-ambush", cleared: true }` を書き(`:36711` 付近)、`tavern.html:5058` の
   ガードは `!== "generated-quest"` なので**通ってしまう** → `progress.cleared.add("road-ambush")`。
   - **解放は 1 つも動かない**(読み手は `progress.cleared.has("dragon-lair")`(`:3579`)と
     `has(sc.unlockAfter)`(`:5489`)= 既定 6 シナリオの id しか見ない)= **実害なし**。
   - ⚠ ただし**ガードの外**にある `plazaStateTV.totalQuestsCleared`(`:5053`)は **+1 される** ——
     闇市「怪しい扉」の常設化カウンタが街道の襲撃 1 回でも進む。
   - ⚠ 発火するのは「襲撃に勝った後、別の潜行を挟まずに酒場へ入ったとき」だけ(`lastResult` は
     次の潜行で上書きされ、酒場は読んだら `removeItem` する)。
   - ⛔ **`tavern.html` は本チケットの禁止ファイル**なので手を付けていない。§6-1 の
     「⛔ `progress.cleared` に載る経路へ流さない」とは食い違うので、直すなら別チケット。
2. **撤退ボタンで襲撃から抜けると `roadWounds` は書かれず `roadReturn` も襲撃地点のまま** =
   「無傷で襲撃地点へ戻る」。既存の「撤退はペナルティなし」設計どおりだが、実機体感の確認項目。
3. ⛔ `probe_party_size` は #23 以前から壊れている(酒場の出発先が world.html になった時点で
   遷移横取りが死んだ)。**#51 では直していない**(依頼書 §11 のとおり)。

### 12-5. 実機で確かめてほしいこと(§9 の 7 項目 + 実装で増えた 2 件)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレ音声だけ無音)。

1. 襲撃の器が iPhone 縦(390x844)で読めるか。導入文の長さは適切か
   (⭐ 機械では 4 枚とも収まっている = 導入 325px / 結末 228・203・203px)
2. 「助けに入る」→ d20 → 結末 → 戦闘 の間が長すぎないか(ページ遷移を挟む)
3. ページ遷移で BGM が不自然に切れないか
4. **帰還後、襲撃した場所に立っているか**(港町ではない)
5. **傷を負ったまま本命のダンジョンへ入る**手応え。きつすぎないか
6. `AMBUSH_RATE = 0.06` の頻度。横断 1 回あたり何回出るか
   (⭐ 参考実測 = `DEST_FIRE` の経路で襲撃を振る停留所は **2 つだけ**。拠点と押した行き先では振らない)
7. 馬車を守れなかったときの「金貨が入らない」が、罰として伝わるか
   (⭐ 実測 = 守り切ると `clearGold 80`、全損だと `0`)
8. ⭐ **奇襲(判定成功)と乱戦(判定失敗)の差が体感できるか** —— 中身は #47 の
   `applyRoadVigilance` そのまま(最初の交戦で敵の初手を 1 ターン潰す)なので、
   「1 ターンぶん」で足りるかは実プレイでしか分からない
9. ⭐ 街道の襲撃の戦場が `caravan-road` の屋外テーマのままで見劣りしないか
   (⚠ 卓上マップは **#52** の担当。`AMBUSH_FIELD` の差し替え 1 つで移せるようにしてある)
