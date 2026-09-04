# #53 沼の参道を卓上マップ 1 枚へ + 若い蛇神司祭の交渉ギミック

- **起草**: 2026-09-04(計画窓) / **ステータス**: **承認済**(2026-09-05 ユーザー承認)
- **着手**: ⏸ **保留 — #52「街道の卓上マップ」の着地待ち**(2026-09-05)。
  ⚠ #52 も `tools/make_grid_map.py` の `GRIDS` と `index.html` の `ROOM_PAINTINGS_DEF` を触るため、
  同時進行すると同じ dict で衝突する。**#52 が着地してから着手すること。**
- ⚠ **承認後の訂正(2026-09-05)**: §11 の「`実装依頼書/README.md` への行追加は #52 の着地後」は
  **承認と同時に実施した**(起草時の判断を訂正)。理由 = 承認時点で `git status` がクリーン・
  `origin/main..HEAD` = **0 本** = 並走窓がゼロで、保留の根拠だった「相手が同じファイルを add する事故」が
  存在しない。一方で「承認済なのに索引に無いチケット」は**着手順の唯一の正から漏れて忘れられる**。
- **触るファイル**: `codex1/requests/2026-09-04_swamp-approach-map.md`(新規・発注文) /
  `tools/make_grid_map.py`(GRIDS へ 1 キー) / `assets/room_lizard-swamp_n4_map.jpg`(新規・焼き上がり) /
  `index.html` / `tools/verify_swamp_novice.js`(新規) / `tavern.html`(changelog の 1 行のみ)
- ⛔ **触らないファイル**: なし(2026-09-04 時点で `git status` はクリーン / `origin/main..HEAD` = 0 本 = 並走窓なし)
- ⚠⚠ **着手順**: **#52 の着地後に着手する。** #52 も `tools/make_grid_map.py` の `GRIDS` と
  `index.html` を触るので、同時進行すると台帳の同じ dict と `ROOM_PAINTINGS_DEF` で衝突する。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

シナリオ3「沼地(lizard-swamp)」は 8 ノードすべてが **7x6 / 9x6 の小部屋**で、卓上バトルマップが 1 枚も無い。
廃坑(n0=33x22 / n1=39x23)と森(n7big=52x26)には既に codex1 納品のマップが入っており、
沼地だけが「D&D の卓を囲んでいる」感じから取り残されている。

同時に、沼地の**本線の導線上には小ギミックが 1 つも無い**。
廃坑には EV-2 見張り / EV-5 捕らわれた従者 / EV-9 玉座のグリクス の 3 つ、森には残影の獣がある。
沼地にあるのはハイドラ 1 つだけで、しかもそれは **n2→n6 の行き止まりの側枝**にあり、
寄り道しなければ一度も踏まない(§2-3 で実測)。

**ユーザー決定(2026-09-04 / 開発会議 `dev-meetings/2026-09-04_swamp-dnd-map-gimmick.md`)**:

- ⭐ **採用 = 候補④「若い司祭の逡巡」**。n4「蛇神の参道」を卓上マップ 1 枚にし、その参道に
  **戦わずに話しかけられる若い蛇神司祭**を置く。交渉の成否で**族長の巣の護衛が ±1 体**動く
- ⭐ **盤面構造 = n4 を大部屋化。8 ノードのまま。折り畳まない**(第2段の会議で決定)
- **不採用①「供物の杭」(NPC 救出)** — 同行者システムがシナリオ1限定と**コードに明記**されており
  (`index.html:20969`)、「助けたら仲間が増える」まで欲張ると汎用化工数が別途乗る
- **不採用②「沼の主」(第三勢力)** — 檻スプライトが**鉄格子**(`assets/cage_closed.png`)で沼に嘘。
  描き直しの発注が必須。加えて沼の隠し要素がハイドラと 2 つになりどちらも薄まる
- **不採用③「骨の鳴子」(警報)** — 狙い(編成が効く)は④の判定 3 種が**得意クラス 3 職に散る**形で吸収された
- **却下「水位ギミック」** — オートバトルは経路をプレイヤーが選べないので地形変化の体感がゼロ。
  ⭐ ただし「参道の一部が浅い水に沈み石畳が水越しに透ける」は**絵の中で解決**する(実装コスト 0)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 行番号の実測(⚠ すべて `grep -n` で取り直した。会議中の記述は 6 件ズレていた)

| ファイル:行 | 何 |
|---|---|
| `index.html:3675` | `const FIELD_THEMES = new Set(["caravan-road"]);` |
| `index.html:4010` | `const BANDIT_MAP_OFF = (() => {` — 撤退スイッチの型 |
| `index.html:4965` | `const ROOM_PAINTINGS_DEF = {` |
| `index.html:5957` | `function applyPaintingBlocking(enemySpawns, playerStartTx, playerStartTy)` |
| `index.html:9193` | `// 友好・無視ルートでは戦わず passiveNpc のまま (勝利判定から除外)。` |
| `index.html:9655` | `lizardRaider: {`(失敗側で +1 する敵) |
| `index.html:9674` | `lizardPriest: {` / `:9675` `flavor: "ファラクサスを蛇神として崇める異教の祭祀"` |
| `index.html:9698` | `lizardChieftain.flavor = "蛇神を祀る沼の主、ファラクサスの忠実なる走狗"` |
| `index.html:9718` | `lizardChieftain.deathLine = "…炎の…御方よ…我が血を…捧げ…ます…"` |
| `index.html:10328` | `function questFlagOn(flagName)` |
| `index.html:10339` | `let sceneFlags = {` — 潜行内フラグの器 |
| `index.html:10465` | `function nodeExtrasFor(nodeId)` |
| `index.html:10477` | `/* ★[P2] ノード別の敵スポーン (P1 が残した穴 #3)。` |
| `index.html:10481` | `function nodeSpawnsFor(nodeId)` |
| `index.html:13261` | `function showCharChoice(message, candidates, cancelLabel, opts)` |
| `index.html:23541` | `function initCaelum()` ← **主たる写経元** |
| `index.html:23558` | `async function tryApproachCaelum()` / `:23574` `runCaelumDialog()` |
| `index.html:23633` | `function initHydra()` / `:23662` `tryApproachAltar()` / `:23678` `runAltarDialog()` |
| `index.html:33428` | `function spawnNodeEntities()` |
| `index.html:33912` | `function buildNode(mapDef, nodeId)` / `:33941` `if (RUN && nodeId) ENEMY_SPAWNS = nodeSpawnsFor(nodeId);` |
| `index.html:35942` | `function p6Node(scenId, themeId, id, name, rect, opt)` |
| `index.html:36072` | `rect: [1, 10, 26, 61], paint: "n7big", density: 0,` ← 森の前例 |
| `index.html:36114` | `function buildLizardSwampRun()` / `:36124` `n4: { name: "蛇神の参道",` / `:36129` `n7: { name: "族長の巣",` |
| `tavern.html:3091` | 依頼人の台詞「族長は『炎の支配者』とやらの命を受けているとか」 |
| `tavern.html:3224-3225` | 酒場 talk の success / crit(「炎の支配者」「赤き竜」) |

### 2-2. ⚠⚠⚠ 罠 A — `lizard-swamp` は屋外テーマ**ではない**(#52 の罠は本件にかからない)

    index.html:3675
    const FIELD_THEMES = new Set(["caravan-road"]);

#52「街道の卓上マップ」を縛っている `df-mapdef.js resolve()` 規則④(屋外テーマ × カスタム幾何 →
既定値へ落として `isCustom=false`)は、**`lizard-swamp` には一切かからない**。
森 n7big と**完全に同じ経路**で貼れる。⛔ #52 の依頼書を写経して「テーマを移す」処置を入れないこと。

### 2-3. ⚠⚠ 罠 B — n6(ハイドラ)は側枝、n4 は必経路

`buildP6Run`(`index.html:35975`)の骨格:

    n0 → n1(right) / n2(up) / n3(down)
    n1 → n4(right) / n5(up)
    n2 → n6(right)          ← 行き止まり。ハイドラの祭壇はここ
    n4 → n7(right)          ← ボスへの唯一の道

⭐ **ボスへ行くには必ず n4 を通る。** だからギミックは n4 に置く(廃坑の EV-5 が本線にあるのと同じ思想)。
⛔ **8 ノードを 1 ノードへ畳まないこと。** 畳むと n6 が消え、
`SCENARIO_NODE_EXTRAS["lizard-swamp"].n6`(`index.html:10461`)に載っている**出荷済みのハイドラ**の
置き場所が無くなる。森が `S2_FOLDED` で畳んでいるのを見て真似したくなるが、森は畳むときに
隠し要素を n6 → n7 へ移す作業を伴っている。**今回はそれをやらない。**

### 2-4. ⚠⚠⚠ 罠 C — `lizardPriest` の def にフラグを立ててはいけない

カエルム(`index.html:23541`)は def の `isNpcSpirit: true` を見て `inactive + passiveNpc` にする。
同じことを `lizardPriest` でやると **n4 の他の司祭も n7 の護衛司祭も全部会話可能**になり、
シナリオが崩壊する。実測した現在の配置:

| ノード | slots(`index.html:36124` / `:36129`) |
|---|---|
| n4「蛇神の参道」 | `lizardRaider` / `lizardWarrior` / `lizardHunter` / **`lizardPriest`** |
| n7「族長の巣」 | `lizardWarrior` / **`lizardPriest`** + boss `lizardChieftain` |

⇒ **新しい ENEMY_TYPES キー `swampNovice` を 1 つ起こす**(スプライトは `lizardPriest_anim.png` を
幾何ごと流用)。⭐ この罠は §8 の変異 `flagonpriest` として装置に内蔵する。

### 2-5. ⚠⚠ 罠 D — `?autoplay` は選択肢の index 0 を自動選択する

    index.html:13263
    if (window.__autoplay && candidates && candidates.length > 0) { ... return Promise.resolve(0); }

既存の 2 例が**両方とも「何もしない」を先頭に置いて**巡回検証を安全側へ倒している:

- `runAltarDialog`(`:23684`) — `[{立ち去る(封印を保つ)}, {祭壇を破壊する}, {供物を奪う}]`
- `runCaelumDialog`(`:23583`) — `[{弔いの言葉を述べる}, {無視して通り過ぎる}, {剣を抜く}]`

⇒ **1 番目は必ず「そのまま通り過ぎる」**。判定つきの 3 つはその後ろ。
⭐ 変異 `autoplayfirst` として内蔵する。

### 2-6. ⚠⚠ 罠 E — `p6Node` の 3 つの既定値

`index.html:35942` の注記が名指しで警告している。**大部屋ノードでは 3 つとも明示する**:

| 既定 | そのままだと | 明示する値 |
|---|---|---|
| `density` 既定 1 | 描き込まれた絵の上に草・倒木が湧く | **`density: 0`** |
| `start` 既定 `{tx:36, ty:13}` | buildNode が「起点の床保証」で**問答無用に床へ彫る** → 絵の岩の内側に**マスクの穴が無言で開く** | 入場地点へ明示 |
| `paint` 既定 = ノード id | `n4` = 既存の小さい絵を指す | **`paint: "n4big"`** |

⭐ `density` / `start` は変異 `density1` / `nostart` として内蔵する。

### 2-7. ⭐⭐⭐ 報いが実装可能であることの実測(n4 の結果で n7 の顔ぶれを変えられるか)

    index.html:33941   (buildNode の中)
    if (RUN && nodeId) ENEMY_SPAWNS = nodeSpawnsFor(nodeId);

**敵は RUN 構築時に焼き付いていない。ノード入場のたびに作り直される。** ⇒ n4 で立てたフラグを
n7 の入場時に読める。ただし既存のフラグ機構は使えない:

    index.html:10477-10480 (注記そのもの)
    ⚠ mapDef 由来のスロットに questFlagOn のフィルタは掛けない (4 要素目が無いので常に通る)。
      噂フラグで出し分ける敵は ★[P6] の台帳から来て、そこにだけフィルタが掛かる。

    index.html:10328  questFlagOn() が読むのは questFlags(酒場 → sessionStorage)であって
                      潜行内の sceneFlags ではない。

⇒ **`nodeSpawnsFor()` にフィルタを 1 本足すのが唯一の新規配線**(§7-1)。
⛔ `SCENARIO_NODE_EXTRAS` へ逃がす案は**成立しない**(あちらは `questFlagOn` = 酒場フラグしか見ない)。

### 2-8. ⚠⚠⚠ 罠 F — 「ファラクサスの伏線を初回収」は**誤り**。既に 6 箇所で回収済み

会議の第1段でこの案の狙いを「伏線の初回収」と書いたが、実測で崩れた:

| 場所 | 実物 |
|---|---|
| `tavern.html:3091` | 依頼人「族長は『炎の支配者』とやらの命を受けているとか」← **出発前に既に明かされる** |
| `tavern.html:3224` | 酒場 talk success「族長は「炎の支配者」なる者にひれ伏しているという」 |
| `tavern.html:3225` | 同 crit「「炎の支配者」とは赤き竜の異名では、と囁く者も」 |
| `index.html:9620` | `lizardWarrior.flavor` = 「炎の支配者の名のもとに咆哮する沼の戦士」 |
| `index.html:9675` | `lizardPriest.flavor` = 「ファラクサスを蛇神として崇める異教の祭祀」 |
| `index.html:9718` | `lizardChieftain.deathLine` = 「…炎の…御方よ…我が血を…捧げ…ます…」 |

⇒ **文面の方針を訂正する**。司祭は「情報を明かす役」ではない(プレイヤーは出発前から知っている)。
⭐ **司祭自身が『炎の支配者は本当に我らの蛇神なのか』と迷っている**、という一点だけを足す。
既にデータが言っていることの延長であり、新しい設定を発明しない。
⛔ 「ファラクサスとは何者か」を司祭に説明させないこと(7 回目の繰り返しになる)。

### 2-9. 判定 3 種の実測(得意クラスが全部違うことの裏取り)

`js/skill-check.js` の `CHECKS` と `CLASS_PROFICIENCIES` を実読:

| 判定キー | ラベル | 能力値 | 得意クラス(`CLASS_PROFICIENCIES` の実体) |
|---|---|---|---|
| `history` | 歴史 | int | **mage**(`["arcana", "history"]`) |
| `religion` | 宗教 | wis | **cleric**(`["insight", "religion"]`) |
| `intimidation` | 威圧 | cha | **warrior**(`["athletics", "intimidation"]`) |

⭐ 3 つとも得意クラスが違う = 編成によって通る道が変わる。
⛔ `persuasion` は**どのクラスも得意でない**ので使わない(選択肢が 1 つだけ不利になる)。

**再測定コマンド**:

    sed -n '/var CHECKS = {/,/};/p' js/skill-check.js
    sed -n '/var CLASS_PROFICIENCIES = {/,/};/p' js/skill-check.js

### 2-10. ⚠⚠⚠ 罠 G — `driver_paint_blocked` (8d) の正規表現が `n<数字>big` を弾く

    tools/driver_paint_blocked.js:769
    W.every(n => n.err || (n.paints || []).every(p => p === null || /\/n\d+$/.test(p)))
    ※ paints = MAPDEF.rooms.map(rm => rm.painting.theme + '/' + rm.painting.key)   (:451)

実測(`node -e` で正規表現を直接当てた):

| 文字列 | `/\/n\d+$/` | 拡張案 `/\/n\d+[a-z]*$/` |
|---|---|---|
| `lizard-swamp/n4` | true | true |
| `lizard-swamp/n7` | true | true |
| `bandits-forest/n7big` | **false** | true |
| `lizard-swamp/n4big` | **false** | true |
| `lizard-swamp/1`(旧在庫) | false | **false** ← 守りたい判別は保たれる |

⭐⭐⭐ **これは本件が作る欠陥ではなく、森の `n7big` が先に破っていた既存の齟齬**。
`--stage` の既定が `goblin-mine`(`:60`)なので**今日まで誰も踏んでいない**だけ。
ドライバ自身の注記が「判定式は『ノード用 = /\/n\d+$/』**であって列挙ではない**」と書いており、
`n7big` / `n4big` は明らかにノード用なので**式が意図に追いついていない**。

⇒ **STEP4 で正規表現を `/\/n\d+[a-z]*$/` へ広げる**。⛔ 広げる前に必ず
`node tools/driver_paint_blocked.js --stage bandits-forest` を**先に走らせて赤を実見**すること
(「たぶん赤い」で直さない)。旧在庫 `1` / `2` を弾く性質は上の表のとおり保たれる。

### 2-11. 既存 golden への影響(式を読解して切り分けた)

| ドライバ | 影響 | 根拠 |
|---|---|---|
| `driver_graph_p7.js` (1b)(1c)(1d)(1e) | **緑のまま** | `:284` `for (const k of ['n4','n7'])` = キー `n4`/`n7` **だけ**を読む。`n4big` を**追加**し既存 `n4` を残せば見えない |
| `driver_graph_p7.js` (4c)(4d)(4e) | **緑のまま** | `:64` `TOUR_SCEN = 'orc-fort'` = 沼地を見ない |
| `driver_graph_p7.js` (5a) 旧在庫 12 枚 | **緑のまま** | `n4big` は `node:true` なので `o.old` ではなく `o.node` へ入る。旧在庫は 6 テーマ × キー 1/2 = 12 のまま |
| `driver_graph_p7.js` (5b) `node.length >= 12` | **緑**(15 → 16 へ増える) | 現状のノード用 = 6 テーマ×(n4,n7)=12 + 廃坑 n0/n1 + 森 n7big = 15 |
| `driver_graph_p6.js` (3e) 敵スロットが部屋の矩形の中 | **緑**(要実走) | `:471` の注記どおり**そのノード自身の rect** を使う実装(骨格定数を当てていない) |
| `driver_graph_p6.js` (G2) 5 本のグラフが相互に異なる | **緑** | slots が変わっても相異は保たれる |
| `driver_paint_blocked.js` §3 (3a〜3e) 6 テーマ BFS | ⭐ **本件の主検出器** | `:601` `for (const th of THEMES)`。新マスクで「全部屋・ボススロットへ到達」「`?paintblock=0` と到達可否が完全一致」を測る |
| `driver_paint_blocked.js` (8d) | ⚠ `--stage lizard-swamp` で**赤**(§2-10) | 上記 |

**再測定コマンド**:

    node tools/driver_graph_p7.js
    node tools/driver_graph_p6.js
    node tools/driver_paint_blocked.js
    node tools/driver_paint_blocked.js --stage lizard-swamp
    node tools/driver_paint_blocked.js --stage bandits-forest
    node tools/driver_grid_s2.js

⚠⚠ 上の期待値は 2026-09-04 時点の**式の読解**であって実走ではない(headless は Chrome 実行が要る)。
**STEP0 で必ず着手前に 1 回全部走らせ、その本数を §12-0 へ記録すること。**
着手前に赤い assert があれば、それは本件の責任ではない = 先に記録して切り分ける
(#51 は依頼書の「FAILED 4 本が着手前から赤」が実は解消済みで、基準がまるごと古かった)。

### 2-12. codex1 の在庫確認(沼のマップは無い)

`codex1/maps/` の実体 8 件を実読した。うち未使用の 1536x1024 が 2 枚:

- `ancient-ruin-dungeon-player.png` — **屋内石造の古代遺跡**。沼ではない
- `flooded-crypt-player.png` — **屋内石造の水没墓所**。沼ではない
  (⭐ ただし「水没した間 + 八角形の高台」の構図は祭壇まわりの参考になる。発注文に添えてよい)

`grep -rn "ancient-ruin\|flooded-crypt"` = **0 件**(どちらも本体から参照されていない)。
⇒ **沼の参道マップは新規発注が必要**。

### 2-13. GRIDS 台帳の現状

`tools/make_grid_map.py` の `GRIDS` は 5 キー:
`mine-entrance`(33x22 @64) / `mine`(39x23 @64) / `bandit-hideout`(52x26 @48) /
`phlan-harbor`(23x15 @64) / `stag-tavern`(15x10 @96)。

⚠ **#52 が 6 キー目(`road-ambush`)を足す。本件は 7 キー目**。着手時に必ず現物を読み直すこと。

### 2-14. changelog の要否

`scripts/hooks/check_changelog.py:24` を実読:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

`index.html` を触るので **鳴る = changelog 必須**。
⭐ **書けるプレイヤー向けの要約は実在する**(「沼の参道が 1 枚の卓上マップになった」「若い司祭と
話せるようになった」の 2 本とも実際にプレイヤーに見える)。嘘をでっち上げる必要はない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `codex1/requests/2026-09-04_swamp-approach-map.md` | **新規**。発注文(⛔ ユーザー承認が別途要る) |
| `codex1/maps/swamp-approach-v1.png` | 納品物(codex1 が置く) |
| `tools/make_grid_map.py` | `GRIDS` へ 1 キー(`swamp-approach`) |
| `assets/room_lizard-swamp_n4_map.jpg` | **新規**。焼き上がり(⛔ PNG ではなく **jpg**) |
| `index.html` | ① `ROOM_PAINTINGS_DEF["lizard-swamp"].n4big` ② `buildLizardSwampRun()` の n4 ③ `SWAMP_MAP_OFF` ④ `swampNovice` の def ⑤ `initSwampNovice` / `tryApproachNovice` / `runNoviceDialog` ⑥ `sceneFlags.s3_novice_swayed` ⑦ `nodeSpawnsFor` のフィルタ ⑧ ナレ 3 本 ⑨ CSS 1 クラス |
| `tools/verify_swamp_novice.js` | **新規**。受入ドライバ(base port **9910** / 変異 9911〜9930) |
| `tools/probe_swamp_map.js` | **新規**(任意)。敵座標を本番の `isTileWall` で確認する調査プローブ |
| `tools/driver_paint_blocked.js` | (8d) の正規表現を `/\/n\d+[a-z]*$/` へ(§2-10。⚠ **赤を実見してから**) |
| `tavern.html` | ⚠ **changelog の 1〜2 行だけ**。ロジックは 1 バイトも触らない |

⛔ **`js/df-mapdef.js` は触らない**。`paintingAspectFits` も `resolve()` も既存のまま通る。
⛔ **`js/road-events.js` / `world.html` は触らない**(#51/#52 の領分)。
⛔ **`実装依頼書/README.md` の #53 行は、#52 が着地してから足す**(行の文面は §11 に用意した)。

---

## 4. STEP1 — 発注 → 焼き付け → GRIDS(⭐ `index.html` を 1 バイトも触らない)

### 4-1. 発注前に決める 5 つ(`codex-map-request` 段1)

| 決める | 本件の値 |
|---|---|
| 用途 | 屋内テーマの**部屋絵**(ノード用の大部屋) |
| 貼り先の変数名 | `GRIDS["swamp-approach"]["out"] = "room_lizard-swamp_n4_map"` |
| 1 マス px | **48**(森 n7big と同じ。⛔ 96 は台帳が却下した水増し比率) |
| 歩ける床の割合 | ⭐ **参道 1 本を東西に切らさず通す**。BFS が通らないマップは受け入れない |
| 捨ててよい外周 | 上下左右のフェザー帯。⚠ 捨てる帯に歩ける床を置かせない |

⛔ **マス数は発注する値ではなく `--fit` で測って出てくる値。** 「N×M マスで納品せよ」と書かない。
発注は「**1 マス 48px 相当の格子で 1536x1024**」まで。
⚠ 上限は `MAP_H = 28`(`index.html:3362`)。森は元絵 52x30 のうち上下 2 行ずつを捨てて 52x26 にした。
本件も **26 行以下**に収める(捨てる行に歩ける床を置かせない)。

### 4-2. 絵に描かせるもの(ミサキの要件)

- 参道の石畳が東西に 1 本通る(**これが唯一の必須**。ここが切れると詰む)
- ⭐ **参道の一部が浅い水に沈み、石畳が水越しに透けて見える**(却下された水位ギミックの代替)
- 蛇のレリーフ / 祭壇へ続く石段 / 葦の茂み / 朽ちた木の桟橋 / 泥の窪み
- 若い司祭が立てる「参道の脇のひらけた石畳」を 1 箇所(2x2 マス以上)

⚠⚠ **格子線の濃さに数値目標を書かない。** 2026-08-16 の扉 v2 と同じ事故が起きる
(指標に合わせて codex が床の階調を潰す方向へ寄せる)。
⭐ 雛形末尾に必ず「**指標と本文が食い違ったら、閾値をいじらず数値で差し戻してほしい**」を入れる。

### 4-3. 投下と受入

    py tools/codex_request.py --request "<md への絶対パス>" --dry-run            # ヘッダ全文を読む
    py tools/codex_request.py --request "<md への絶対パス>" --sandbox read-only  # 下見
    py tools/codex_request.py --request "<md への絶対パス>"                      # 本番

    py tools/make_grid_map.py --fit "codex1/maps/swamp-approach-v1.png" --fit-around <中心px>
    # → 出力末尾の phase / period / cells をそのまま GRIDS へ貼る
    py tools/make_grid_map.py --name swamp-approach
    py tools/make_grid_map.py --check assets/room_lizard-swamp_n4_map.jpg --tile 48

⚠ `--fit` には**探索中心が要る**(中心無しの広域探索は倍音を拾う)。
⚠⚠ 繰り返しパターン(板張り・石畳の目地)を持つ素材では `--fit` の答えをそのまま信じない
(銀の鹿亭で実際に外し、基本周期の 2 倍の倍音へ吸い込まれた)。
⛔ 検算 3 指標(ドリフト 4.0 / 位相 2.0 / score 70%)は**緩めない**。

**STEP1 の完了条件**: `--check` が 3 指標とも通る。`index.html` の差分が **0 行**。

---

## 5. STEP2 — n4 を大部屋へ差し替え(⭐ **司祭はまだ入れない**)

⭐ **司祭抜きで一度遊べる状態を作る。** マップだけの非退行を先に確定させないと、
後で赤が出たときに「マスクのせい」か「司祭のせい」かが切り分けられない。

### 5-1. `ROOM_PAINTINGS_DEF["lizard-swamp"]` に `n4big` を**追加**(既存 `n4` は残す)

    n4big: { src: "assets/room_lizard-swamp_n4_map.jpg",
             tileBounds: [<r1>, <c1>, <r2>, <c2>], node: true,
             sealRing: true,
             outdoor: true,                      // ★§5-3 の決定。実測してから入れる
             gates: { left: [<絵ローカル>], right: [<絵ローカル>] },
             blocked: [ /* 行数 = tileBounds の高さ / 各行の長さ = 幅 */ ] },

⛔ **既存の `n4`(7x6)を消さない・書き換えない。** `driver_graph_p7` (1c-lizard-swamp) が
`tileBounds === [11,33,16,39]` を要求している(§2-11)。撤退スイッチの行き先でもある。

⚠ マスクの作法(森 n7big の 5 規則。⭐ **写経ではなく毎回この 5 つを確認する**):
1. 外周には `#` を書かない(描画のフェザー帯)。外周は `sealRing` が別に塞ぐ
2. 平置きの物は塞がない(倒木・板は跨げる。天幕・火は塞ぐ)
3. 水は塞ぐ。**浅瀬の渡りだけ**空ける = 唯一の渡り
4. **ゲートへのレーンを明示的に空ける** — 絵は接続を知らずに描かれている
5. 連結の検査は必ず **4 方向 BFS**(本番の aStar は斜めを踏まない)

⚠ `paintingAspectFits` は縦横比の**完全一致**(`rw*bh === rh*bw`)を要求する
⇒ **`rect` と `tileBounds` を同値**にする(森・廃坑と同じ)。

### 5-2. `buildLizardSwampRun()` の n4 を差し替え(`index.html:36124`)

    n4: SWAMP_MAP_OFF
      /* ── ?swampmap=0 の行き先 = 大部屋化より前の姿そのまま(7x6 / 旧絵 / density 1) */
      ? { name: "蛇神の参道",
          slots: [[34, 13, "lizardRaider"], [35, 15, "lizardWarrior"],
                  [38, 12, "lizardHunter"], [39, 14, "lizardPriest"]] }
      /* ── 既定 = codex1 納品の卓上バトルマップ 1 枚がそのまま戦場 */
      : { name: "蛇神の参道",
          rect: [<tileBounds と同値>], paint: "n4big", density: 0,
          start: { tx: <入場地点>, ty: <入場地点> },
          slots: [ /* ⭐ 体数も種類も変えない(raider/warrior/hunter/priest の 4 体)。
                    *   置き直すだけ。⚠ 入場地点から 7 タイル(672px)以上離す。
                    *   ★ここに 5 体目として swampNovice を足すのは STEP3。 */ ] },

⚠⚠ **敵スポーンは全部 MASK の `.` のマスに置くこと。** マスクで塞いだタイルに敵を置くと
`applyPaintingBlocking` の門番を通って**そこだけ穴が開く**。
⭐ 置く前に `tools/probe_bandit_map.js --places` と同型のプローブを書き、
**本番の `isTileWall` で全座標を確認**する。

### 5-3. ⚠ `outdoor` を立てるかの決定

森 n7big は `outdoor: true` を立てており、その注記が警告している:

    ⚠ これは exploredTiles と visitedTiles を**両方**立てるので、「屋外の部屋では最初から
      部屋中の敵が索敵対象になる」= heroAI の狙いが変わる。

**本件の決定 = `outdoor: true` を採る。** 理由 = 卓上マップの狙いは「盤面の全体が見えていること」で、
沼の参道は屋外である。⚠ ただし **heroAI の入場直後の最寄り目標が変わる**ので、
森が `probe_bandit_map.js --ai` でやったのと同じく **STEP2 で実測して §12 に記録する**。
⛔ 実測せずに `outdoor: true` を入れて出荷しない。

### 5-4. 撤退スイッチ

    /* ★[#53] 沼の参道の大部屋化 + 若い司祭の撤退スイッチ。?swampmap=0 で両方が従来へ戻る。
     * ⚠ スイッチはここ 1 箇所で読み、分岐も buildLizardSwampRun / initSwampNovice /
     *   applySwampNoviceOutcome の 3 箇所だけにする。読む場所を増やすと
     *   「片方だけ効いた中間状態」が生まれる。
     * ⚠ dev チートではなく退避口なので __dfDevCheat では包まない(?banditmap=0 と同じ扱い)。 */
    const SWAMP_MAP_OFF = (() => {
      try { return new URLSearchParams(window.location.search).get("swampmap") === "0"; }
      catch (e) { return false; }
    })();

⚠ 宣言位置は `BANDIT_MAP_OFF`(`index.html:4010`)の隣。**`RUN` の即時評価より前**に置く
(後ろに置くと一時的死角 (TDZ) で `ReferenceError` になり、黙って従来の姿へ落ちる)。
⚠ ページ遷移をまたがない(`index.html` 内で完結するので sessionStorage への写しは不要)。

**STEP2 の完了条件**: `driver_paint_blocked --stage lizard-swamp` の §3 が緑
(全部屋・ボススロットへ到達 / `?paintblock=0` と到達可否が完全一致)。
⚠ (8d) は §2-10 のとおり赤になる — **ここでは直さない。STEP4 で赤を実見してから直す。**

---

## 6. STEP3 — 若い蛇神司祭 `swampNovice`

### 6-1. ENEMY_TYPES に 1 キー(`lizardPriest` の隣)

    swampNovice: {
      name: "若き蛇神司祭",
      flavor: "蛇神への供物を捧げるのをためらう、まだ若い祭祀",
      badge: "🐍",
      sprite: "assets/lizardPriest_anim.png?v=2",     // ★流用。幾何は完全一致させる
      sheetW: 576, sheetH: 480, frameW: 96, frameH: 96, cols: 6, rowOffset: 0,
      displaySize: 84,
      hp: 12, speed: 0.75,
      // …以下 lizardPriest と同値(敵対化したとき普通の司祭として戦えること)
      isSwampNovice: true,      // ★初期 inactive + 接近で対話(initSwampNovice / tryApproachNovice)
      xp: 200,
    },

⛔ **`lizardPriest` の def は 1 バイトも触らない**(§2-4)。
⚠ 幾何(`sheetW/H` `frameW/H` `cols` `rowOffset`)を流用元と**完全一致**させる(寸法ズレ = 描画破綻)。

### 6-2. `initSwampNovice()` — `initCaelum()`(`index.html:23541`)の写し

`inactive = true` / `passiveNpc = true` にし、`setEnemyVfx` で淡い色味を当てる
(ミサキ「まだ血に染まっていない」)。CSS クラスは `.caelum-spirit` と同型で 1 つ足す。

⚠ **`spawnNodeEntities()`(`:33428`)の `initHydra()` の隣**に 1 行足す。
⛔ **`spawnDetourChests()` より後に置かない**(あれは「必ず最後」= 乱数列がずれる)。

### 6-3. `tryApproachNovice()` — `tryApproachAltar()`(`:23662`)の写し

400ms tick。接近半径は **220**(`ALTAR_APPROACH_RADIUS` の実測値をそのまま引き継ぐ。
⛔ 新しい数字を発明しない)。多重起動防止のフラグは `async` の前に確定させる。

### 6-4. `runNoviceDialog()` — 4 択

    const c = await showCharChoice(
      "若い司祭が、供物を抱えたまま立ち尽くしている。こちらを見ても、槍を構えない。",
      [{ label: "そのまま通り過ぎる" },            // ★1 番目 = 判定なし(§2-5)
       { label: "碑文を読み解く(歴史)" },
       { label: "信仰の矛盾を突く(宗教)" },
       { label: "脅す(威圧)" }],
      "何も言わずに離れる (Esc)");

判定は既存の作法どおり:

    res = await SkillCheck.resolveSkillCheck(spec.check, SWAMP_NOVICE_DC, party, { ... });

| 選択 | `check` | 成功 | 失敗 |
|---|---|---|---|
| 1 | なし | 何も起きない(`passiveNpc` のまま。クリア非ブロック) | — |
| 2 | `history` | 司祭は退く | 敵対化 |
| 3 | `religion` | 司祭は退く | 敵対化 |
| 4 | `intimidation` | 司祭は退く | 敵対化 |

- **成功** → `sceneFlags.s3_novice_swayed = true` / 司祭を盤面から消す
- **失敗** → `sceneFlags.s3_novice_swayed = false` / `inactive = false; passiveNpc = false` で敵対化
- **1 番目 / Esc** → `null` のまま。司祭は立ったまま(⭐ `passiveNpc` なので `isNodeSettled()` を
  ブロックしない = 出口は普通に出る)

**DC**: `SCE1_WATCH_DC` / `SCE1_SERVANT_DC` の実値を読んで**同水準に合わせる**
(⛔ 新しい難易度帯を発明しない。着手時に `grep -n "SCE1_WATCH_DC\s*=" index.html` で実値を取る)。

### 6-5. `sceneFlags` に 1 行(`index.html:10339`)

    s3_novice_swayed: null,   // #53: 若い司祭の交渉 (true=退いた / false=敵対化 / null=未接触)

⚠ 既存 2 件は `false` 初期値だが、本件は **3 値**なので `null` 始まり。
`if (sceneFlags.s3_novice_swayed)` では `null` と `false` が同じ扱いになるので、
**n7 のフィルタは `=== true` / `=== false` で明示的に見る**(§7-1)。

**STEP3 の完了条件**: 4 分岐すべてが手動で踏める。`?autoplay` が 1 番目を引いて完走する。

---

## 7. STEP4 — n7 の顔ぶれ ±1 + ドライバ + 締め

### 7-1. `nodeSpawnsFor()`(`index.html:10481`)にフィルタを 1 本

    function nodeSpawnsFor(nodeId) {
      if (!RUN || !window.DFMapDef) return [];
      const rnd = makeNodeRng(nodeId + "/spawns");
      let base = rescueCustomSpawns(DFMapDef.spawnsFromMapDef(MAPDEF, rnd));
      base = applySwampNoviceOutcome(nodeId, base);   // ★[#53] ここだけが新規
      const ex = nodeExtrasFor(nodeId);
      if (!ex || !Array.isArray(ex.spawns)) return base;
      return base.concat(ex.spawns.filter(sp => questFlagOn(sp[3])));
    }

⚠⚠ **`makeNodeRng` より後、`spawnsFromMapDef` の直後に挿すこと。** 前に挿すと乱数列がずれ、
他ノードのスポーンまで動く(`spawnDetourChests` が「必ず最後」なのと同じ理屈)。

`applySwampNoviceOutcome(nodeId, list)` の契約:

- `SWAMP_MAP_OFF` なら `list` をそのまま返す(⭐ 撤退スイッチは司祭も一緒に戻す)
- 沼地でない / `nodeId !== "n7"` なら `list` をそのまま返す
- `s3_novice_swayed === true` → `lizardPriest` を**先頭 1 体だけ**取り除く
- `s3_novice_swayed === false` → `lizardRaider` を 1 体足す(座標はマスク済みの床。n7 は小部屋のまま
  なので `[38, 15]` 前後。⚠ 入場地点から 7 タイル以上離す)
- `null` → `list` をそのまま返す

⛔ **`=== true` / `=== false` で見る**(`null` を falsy として巻き込まない)。

### 7-2. ナレーション 3 本

発見 / 成功 / 失敗。既存の `showDMMessage` を使う(音声は付けない = `audio.js` を触らない)。
⚠ 文面は §2-8 のとおり「司祭自身の迷い」に絞る。ファラクサスの説明はしない。

### 7-3. `driver_paint_blocked.js` (8d) の正規表現(§2-10)

⛔ **先に `node tools/driver_paint_blocked.js --stage bandits-forest` を走らせて赤を実見する。**
実見できたら `/\/n\d+$/` → `/\/n\d+[a-z]*$/` へ広げ、注記に
「⭐ `n7big` / `n4big` のような大部屋キーもノード用。旧在庫のキー `1` / `2` は依然として弾く」を足す。
⚠ 赤が出なかったら**式を触らない**(前提が崩れている = §12 に記録して報告する)。

---

## 8. 受入条件 — `tools/verify_swamp_novice.js`(新規 / base port **9910** / 変異 9911〜9930)

測る方針: **盤面の幾何は絵のマスクから直に**、**分岐の結果は n7 の実スポーンから**測る。
⛔ 「実装の戻り値どうしを突き合わせる」形にしない(実装とドライバが同じ誤りを共有すると両方緑になる)。

### §0 装置(先に母集団を確かめる)

- **(0a) ★装置**: 沼地の n4 が `paintings.length === 1` で、その `rect` が **7x6 ではない**
  (= 大部屋化が効いている本番の盤面を見ている)
  ⭐ **これが無いと以降の全 assert が「小部屋を測って緑」になる**
- **(0b) ★装置**: `n4big` の `blocked` マスクを**実体から**引いており、行数 = `tileBounds` の高さ、
  各行の長さ = `tileBounds` の幅で揃っている(ドライバ側に写経していないことの検査)
- **(0c) ★装置**: n4 に `swampNovice` が**ちょうど 1 体**湧いており、初期状態が
  `inactive === true && passiveNpc === true`
- **(0d) ★装置**: n7 の**素の**顔ぶれが `lizardWarrior` 1 + `lizardPriest` 1 + boss `lizardChieftain`
  = 「±1 の差が観測可能な母集団」であること
  ⭐ #50/#51 の教訓 = 母集団ガードは「差が出ること」ではなく「**後続 assert の敷居を満たす差が
  出ること**」まで縛る。ここで `lizardPriest` が 0 体なら (3a) は永久に空振りする
- **(0e) ★装置**: 4 分岐すべてを踏める仕込み(判定の強制成功 / 強制失敗シーム)が実在し、
  1 回のドライバ実行で 4 経路とも到達できる

### §1 盤面(STEP1+2)

- **(1a)** `rect` と `tileBounds` が**同値**(`paintingAspectFits` の完全一致要求)
- **(1b)** `density === 0`(絵の上に scenery が湧いていない = `__paintRects` と scenery 数の 2 経路)
- **(1c)** `start` が明示されており、そのタイルが**マスクで `.`** である
  (⭐ 「起点の床保証」が穴を開けていないことを**マスク側から**確認する)
- **(1d)** 敵スポーン全体の座標が**マスクで `.`** かつ本番の `isTileWall` が false(2 経路)
- **(1e)** 入場地点から最寄りの敵まで **7 タイル(672px)以上**
- **(1f)** 4 方向 BFS で入場地点から **全部屋・全スポーン・出口ゲート**へ到達できる(孤立ゼロ)

### §2 司祭(STEP3)

- **(2a)** 選択肢の**1 番目が判定なし**(`?autoplay` が index 0 を引いて戦闘に入らず完走する)
- **(2b)** 3 つの判定キーが `history` / `religion` / `intimidation` で、
  それぞれの得意クラスが `mage` / `cleric` / `warrior` と**全部異なる**
  (⭐ `js/skill-check.js` の `CLASS_PROFICIENCIES` から**独立に**引いて突き合わせる)
- **(2c)** 1 番目 / Esc を選んだとき司祭は `passiveNpc` のままで、**出口の矢印が出る**
  (= `isNodeSettled()` をブロックしていない)
- **(2d)** 失敗を選んだとき司祭が `inactive === false && passiveNpc === false` になり、
  通常の敵として撃破対象に入る
- **(2e)** `lizardPriest` の def に `isSwampNovice` が**立っていない**(§2-4 の罠)

### §3 報い(STEP4)

- **(3a)** `s3_novice_swayed === true` で n7 に入ると `lizardPriest` が **0 体**
  (⭐ 素の 1 体と比べる。差分ではなく**両方の実測値**を出す)
- **(3b)** `s3_novice_swayed === false` で n7 に入ると `lizardRaider` が **1 体**増える
- **(3c)** `s3_novice_swayed === null` で n7 の顔ぶれが**素と完全一致**
- **(3d)** ボス `lizardChieftain` はどの分岐でも**必ず 1 体**(報いがボスを消していない)
- **(3e)** n4/n7 以外・沼地以外のノードのスポーンが**1 件も変わっていない**
  (⭐ 廃坑 / 森 / 砦 / 神殿 / 竜巣 の全ノードで素と一致)

### §4 恒等(非退行)

- **(4a)** `ROOM_PAINTINGS_DEF["lizard-swamp"].n4` が `tileBounds [11,33,16,39]` のまま残っている
- **(4b)** 他 5 テーマの `ROOM_PAINTINGS_DEF` が `JSON.stringify` で**完全一致**
- **(4c)** 旧在庫(`node` を持たないキー)の総数が **12** のまま

### §5 撤退

- **(5a)** `index.html?swampmap=0` → n4 の rect が `[11,33,16,39]` / `paint === "n4"` /
  slots が元の 4 体、かつ **`swampNovice` が 0 体**
  (⭐ マップと司祭が**同じ 1 本のスイッチ**で戻る)
- **(5b)** `?swampmap=0` で n7 の顔ぶれが素と一致(フィルタも一緒に無効化されている)

### ⛔ 測らないこと

- **絵の見た目 / 色味 / 光量** — 目で決める
- **ナレーションの文面** — 文言はプレイして直す
- **DC の絶対値** — バランス調整で動かす(測るのは「3 択とも同じ DC」だけ)
- **`outdoor: true` による heroAI の狙いの変化** — §9 の実機体感で見る
  (⭐ ただし**実測値を §12 に記録する**こと。assert にはしない)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `density1` | `density: 0` を落として既定 1 に戻す | (1b) |
| `nostart` | `start` の指定を落として既定 `{36,13}` に戻す | (1c) |
| `flagonpriest` | `lizardPriest` の def に `isSwampNovice: true` を足す(§2-4 の罠の再現) | (0c)(2e) |
| `autoplayfirst` | 選択肢の 1 番目を判定つきの枝に入れ替える(§2-5 の罠の再現) | (2a) |
| `alwaysdrop` | `s3_novice_swayed` を見ずに常に `lizardPriest` を落とす | (3c)(3e) |
| `nullfalsy` | `=== true` を truthy 判定へ緩める(`null` を巻き込む) | (3c) |
| `rngbefore` | フィルタを `makeNodeRng` より前に挿す(乱数列がずれる) | (3e) |
| `oldn4` | `n4big` の `src` を既存の小さい `room_lizard-swamp_n4.jpg` へ向ける | (1a) |
| `maskrow` | マスクを 1 行削る(高さが `tileBounds` と食い違う) | (0b) |
| `spawnonwall` | 敵スポーンを 1 体マスクの `#` のマスへ移す | (1d) |
| `sealoff` | `sealRing` を落とす | (1f) |
| `switchsplit` | 撤退スイッチをマップ側だけに効かせ、司祭は残す | (5a) |
| `n4wipe` | 既存の小さい `n4` エントリを消す | (4a) |

⭐ **§2-4 / §2-5 / §2-6 の 3 つの罠は `flagonpriest` / `autoplayfirst` / `density1`+`nostart` として
必ず内蔵する。** これが「起草中にしか見つからない知見」が実装後まで生き残る唯一の形。

### 既存 golden の非退行(⚠ **STEP0 で着手前に 1 回、締めでもう 1 回**)

    node tools/driver_graph_p7.js          # (1c)(5a)(5b) が沼地を見る
    node tools/driver_graph_p6.js          # (3e)(G2) が沼地を見る
    node tools/driver_paint_blocked.js                        # 既定 stage = goblin-mine
    node tools/driver_paint_blocked.js --stage lizard-swamp   # ★本件の主検出器 + (8d) の赤
    node tools/driver_paint_blocked.js --stage bandits-forest # ★(8d) の赤を実見する
    node tools/driver_grid_s2.js           # 森の大部屋機構の非退行
    node tools/driver_grid_p7.js
    node tools/driver_graph_kinds.js

⚠⚠ **本数と基準値をここに書かない。** 2026-09-04 時点で計画窓は headless を走らせていない
(Chrome 実行が要る)。**STEP0 で実測した本数を §12-0 へ記録し、それを基準にする。**

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレ音声だけ無音)。

1. **iPhone 縦持ちで 4 択ボタンが全部見えるか** — ⭐ 選択肢 4 つは既存最多クラス
   (祭壇もカエルムも 3 つ + Esc)。**ここが本件で一番危ない実機項目**
2. **卓上マップの体感** — 参道を歩いて「卓を囲んでいる」感じになったか。1 マス 48px で
   iPhone 縦の視野に収まる情報量か
3. **司祭に気づけるか** — 淡い色味だけで「こいつは戦わない」と伝わるか。伝わらなければ
   頭上のバッジか一言の吹き出しを足す(⚠ `?namelabel` の札と喧嘩しないか)
4. **交渉の見返りが体感できるか** — n7 で司祭が居ない / 襲撃者が増えたことに気づけるか。
   気づけなければボス部屋の入場ナレをもう 1 本足す
5. **`outdoor: true` の副作用** — 入場した瞬間に部屋中の敵が索敵対象になることで、
   パーティが散らばりすぎないか(⭐ 森 n7big で同じ懸念を実測している)
6. **判定 3 種の使い分け** — 魔法使い / 僧侶 / 戦士 が居ない編成で理不尽に感じないか
   (1 番目の「通り過ぎる」が必ずあるので詰みはしない)

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>沼の参道が 1 枚の卓上マップに</b> — 蛇神の参道が、浅い水に沈む石畳の広い戦場になった。"
    py tools/add_changelog.py "<b>若い蛇神司祭と話せるようになった</b> — 供物を抱えて迷う司祭を説き伏せれば、族長の広間から護衛が 1 人減る。"

⚠ 2 行足すと既定 4 件のうち 2 件が落ちる。**1 行に畳むか 2 行にするかは実装窓の判断**でよい。
⛔ `--no-verify` での迂回は禁止(そもそも Claude からは実行できない)。

---

## 11. やらないこと

- ⛔ **8 ノード → 1 ノードの折り畳み**。n6 が消えると**出荷済みのハイドラの置き場所が無くなる**(§2-3)
- ⛔ **n6 のハイドラ関連コードに触ること**(`initHydra` / `tryApproachAltar` / `runAltarDialog` /
  `SCENARIO_NODE_EXTRAS["lizard-swamp"]`)。1 バイトも動かさない
- ⛔ **n7 を大部屋にすること**。今回は n4 だけ(n7 の大部屋化は別チケット)
- ⛔ **同行者システムの汎用化**(シナリオ1限定のまま。不採用①の理由)
- ⛔ **檻スプライトの描き直し**(不採用②。第三勢力をやるときの宿題)
- ⛔ **酒場に新しい噂を足すこと**。`s3_hydra_intel` はハイドラ用。司祭は噂なしで常に居る
- ⛔ **`lizardPriest` / `lizardChieftain` の def を触ること**
- ⛔ **`js/df-mapdef.js` を触ること**
- ~~⛔ **`実装依頼書/README.md` への行追加**(#52 の着地後)~~ → **2026-09-05 の承認と同時に追加済み**
  (訂正の理由は冒頭の「承認後の訂正」を参照)。追加した行:

    | 53 | [2026-09-04_swamp-novice-map.md](2026-09-04_swamp-novice-map.md) | **承認済**(2026-09-04) / **着手は #52 着地待ち** | 0% | 沼の n4「蛇神の参道」を codex1 納品の卓上マップ 1 枚にし、参道に**戦わずに話しかけられる若い蛇神司祭**を置く。交渉の成否で n7 の護衛が ±1。⭐⭐⭐ **`lizard-swamp` は `FIELD_THEMES` に入っていない**(`index.html:3675`)= #52 を縛る「屋外テーマに 1 枚絵は載らない」罠は**かからない**(森 n7big と同じ経路)。⭐⭐⭐ 会話できる敵は**カエルム(`initCaelum` `:23541`)が完成品**で写経元がある。⭐⭐ 敵は `buildNode`(`:33941`)が**ノード入場のたび**作り直すので n4 の結果で n7 を変えられるが、`questFlagOn`(`:10328`)は酒場フラグしか見ない ⇒ **`nodeSpawnsFor` にフィルタ 1 本**が唯一の新規配線。⚠⚠⚠ **`lizardPriest` の def にフラグを立てない**(n4/n7 の全司祭が会話可能になる)→ 新キー `swampNovice`。⚠⚠ **折り畳まない**(n6 が消えるとハイドラの置き場所が無くなる)。⚠⚠ `driver_paint_blocked` (8d) の `/\/n\d+$/` が `n4big` を弾く — **森の `n7big` が先に破っていた既存の齟齬**(`--stage` 既定が goblin-mine なので今日まで誰も踏んでいない)→ `/\/n\d+[a-z]*$/` へ(⛔ 赤を実見してから)。⚠ 伏線「炎の支配者」は**既に 6 箇所で回収済み** = 司祭に説明させない。撤退 `?swampmap=0`。changelog 必須。会議 = `dev-meetings/2026-09-04_swamp-dnd-map-gimmick.md` |

---

## 12. 実装結果

(実装窓が埋める)

### 12-0. STEP0 の着手前実測(⚠ **着手して最初にやること**)

| ドライバ | 着手前の本数 | 備考 |
|---|---|---|
| `driver_graph_p7.js` | | |
| `driver_graph_p6.js` | | |
| `driver_paint_blocked.js`(既定 goblin-mine) | | |
| `driver_paint_blocked.js --stage lizard-swamp` | | |
| `driver_paint_blocked.js --stage bandits-forest` | | ⭐ (8d) が赤かどうか |
| `driver_grid_s2.js` | | |
| `driver_grid_p7.js` | | |
| `driver_graph_kinds.js` | | |

⭐ 着手前に赤い assert があれば**本件の責任ではない**。ここに記録して切り分ける。
