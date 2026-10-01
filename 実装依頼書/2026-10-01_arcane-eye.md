# #79 魔法の眼(アーケインアイ)— 部屋に入った時と出口の前に、眼を飛ばして敵の様子を探る

- **起草**: 2026-10-01(計画窓 = 起草窓) / **ステータス**: **承認済**(2026-10-01 ユーザー承認)
- **着手**: 実装窓は**窓更新を挟んでから**着手する(2026-09-28 の恒久ルール)
- **触るファイル**: `index.html`(呪文の定義・巻物の表・詠唱・報告の文と影絵・眼の演出・撤退)/ `tavern.html`(呪文の鏡・巻物の表・開発用 1G 陳列・changelog)/ `tools/verify_arcane_eye.js`(新規)/ `tools/verify_invisibility.js`((7b) の固定件数の言い直しだけ)/ `assets/arcane_eye.png`(codex1 の納品を取り込むだけ・無くても動く)
- ⛔ **触らないファイル**: `js/*`(`js/skill-check.js` を含む)/ `audio.js`(ペンの音は既存の `sfx("narration")` を鳴らすだけ)/ `town.html` / `world.html` / `title.html`。§2-9 で**開く必要が無い**ことを確認済み。
- 並走: 実装窓は #78 完了後で待機中。作業ツリーは clean(2026-10-01 `git status --short` = 0 行・HEAD `620b844`)。
  それでも作法は守る: `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

「敵の様子を探る魔法」シリーズ(会議 `dev-meetings/2026-09-28_scouting-magic.md` 第2段フェーズ C + 計画書の修正 1・2)の最後の 1 枚。
5e SRD の呪文 **Arcane Eye(アーケインアイ = 魔法の眼・4 レベル)** を魔法使いに足す。
枠が残っていれば、魔法使いが小さな光る眼を飛ばし、**霧の奥に隠れた敵の種類と数**を DM の一行(ペンの音)と羊皮紙の影絵で知らせる。
例:「ゴブリンどもが 4 匹ほど待ち構えているようだ。シャーマンの姿もある」「……静かだ。何もいない」「ただならぬ大きな影がひとつ」。

呪文は**巻物で拾って覚える**(稀少 = rare・店では売らない)。試遊で見られるよう、**開発モードのときだけ武器防具屋の巻物の棚に 1G で並べる**(#78 が用意した `SCROLL_DEV_SHELF_TV` に 1 語足す)。

**ユーザー決定**:

- 2026-09-28(会議の決裁): 呪文の枠を消費してよい / 巻物で拾う・rare・拾うだけ / 開発用 1G 陳列あり / 眼の索敵テキストを軽く一行出す(修正 1)/ 眼の絵は codex1 へ依頼。
- 2026-10-01(本起草時。§2-1 の実測を見せたうえで):
  - **唱える時 = 両方**。① **部屋に入った時**に、今いる大部屋の敵を報告する。② **出口の前**(出口の知覚判定の代わり)に、出口の先の部屋を報告する。
    ⭐ 不採用: 「出口の前だけ」(会議の案)。§2-1 のとおり、畳んだ後は出口の先がほぼボス部屋だけで、盗賊の森には出口が無い。
    不採用: 「入った時だけ」(推奨だった案)。
  - **見せ方 = 文章 + 影絵**(会議どおり)。DM の一行に加えて、見えた敵の種類を黒く塗ったスプライトで数秒並べる。
- 起草窓が既定として決めたこと(聞くまでもないもの):
  - 同じ部屋は 2 度覗かない。出口の前で覗いた部屋へ入った時は唱えない(枠を二重に使わない)。
  - ボス本人は**種類をぼかす**(会議の修正 1「ボスの部屋は種類をぼかして『ただならぬ気配』」)。**護衛は種類と数を言う**。
  - 隠し要素(カエルムの霊・若き蛇神司祭・残影の獣・ゴーレム・ハイドラ・ミミック)は**報告に含めない**(ネタバレしない)。
  - 呪文の結果は常に正しい(会議の リスク欄「嘘が出るのは技能判定だけ」)⇒ 出口の前で唱えたら**知覚判定を振らない**。

---

## 2. 着手前の実測(HEAD `620b844`・2026-10-01)

### 2-1. ⭐⭐⭐ 畳んだ後のグラフ — 出口の先はほぼボス部屋(会議の前提が崩れた)

会議(2026-09-28・HEAD `e3880ba`)は「分岐の先を偵察し、敵の種類と数を知ってから扉を選ぶ」を前提にしていた。
その後、#62〜#67 で全シナリオが卓上マップへ畳まれている。本番ページで 6 シナリオのグラフを実際に組んで数えた:

| シナリオ | ノード | 入った部屋の敵(`enemySlots` の型) | 出口 |
|---|---|---|---|
| 廃坑 | n0 start → n1 boss | goblin ×2 | n0 → n1(boss: hobgoblin ×4・goblinBrute・goblin・goblinRider・goblinShaman・goblinArcher + **goblinKing**) |
| 盗賊の森 | n7 boss だけ | bandit 系 9 + **scar** | **出口なし** |
| 沼地 | n4 start → n7 boss / n6 event | lizard 系 11 + **swampNovice**(隠し要素) | n4 → n7(boss: lizardWarrior・lizardPriest + **lizardChieftain**)/ n4 → n6(event: **敵 0**) |
| 砦 | n4 start → n7 boss | orc 系 11 | n4 → n7(boss: orcBerserker・orcGrunt + **garrock**) |
| 神殿 | n4 start → n7 boss | undead 系 11 + **caelum**(隠し要素) | n4 → n7(boss: skeleton ×2 + **lich**) |
| 竜の巣 | n4 start → n7 boss | minotaur・orc・skeleton 計 10 | n4 → n7(boss: minotaur ×2 + **pharaxus**) |

⇒ 出口の前で唱える機会は**全ゲームで 5 回**(盗賊の森 0)、覗く先は 6 本中 5 本がボス部屋。
敵が多いのは**今入った大部屋**(10〜12 体が霧に隠れている)。⇒ ユーザー決定「両方」の根拠。
⚠ 生成クエスト・街道の襲撃は `RUN = null`(分岐グラフなし)⇒ 本チケットでは唱えない(§11)。

**計測コマンド**(再測定するとき。scratchpad の使い捨て probe と同じ中身):

    // index.html を ?diag=1 で開き、page.evaluate の中で:
    for (const id of ["goblin-mine","bandits-forest","lizard-swamp","orc-fort","undead-temple","dragon-lair"]) {
      const g = DFMapDef.graphInfo(buildScenarioRun(id)).graph;
      // g.nodes[].exits[].to / g.nodes[].mapDef.rooms[].enemySlots[][2] / bossSlot[2] を数える
    }

### 2-2. 会議・引き継ぎメモの前提のうち、崩れていた/補足が要るもの

| # | 前提 | 実測 |
|---|---|---|
| 1 | 「分岐の先を覗いて扉を選ぶ」(会議 第2段) | §2-1。分岐は沼地の 1 か所だけ。⇒ ユーザー決定で「入った時 + 出口の前」 |
| 2 | 「種類は先のノードの `enemySlots` から作る」(修正 1) | **半分だけ正しい**。`enemySlots` は座標 `[tx, ty]` が本体で(`js/df-mapdef.js:20` の注記)、**種類は 3 番目の要素**(`[51, 20, "hobgoblin"]` `index.html:38017`)。6 シナリオの全スロットに種類が入っていることは §2-1 の probe で確認済み(`"?"` = 0 件) |
| 3 | 「数は `exitEnemyCount` から」(修正 1) | `exitEnemyCount`(`index.html:36772`)は**ボスと隠し要素も数える**(`bossSlot` に +1・`caelum` / `swampNovice` のスロットも数える)。⇒ 報告の数は種類ごとに自分で数える(§4-4) |
| 4 | 「気配読みはクリティカル扱いに」(会議) | 強制の口 `revealExitHints(node, forcedTier)` は**検証専用**と明記(`:36828`「本編からは渡さない」)。⇒ 本編からは `forcedTier` を使わず、関数の中で眼を唱えたら `tier = "crit"` にする(§4-5・罠D) |
| 5 | 「DM の語り(ペンの音)で一行」(修正 1) | ペンの音(`sfx("narration")`)が鳴るのは**導入ナレの窓だけ**(`typeNarrationParagraph` `:14720`・3 文字ごと `:14732`)。一行のバナー `showDMMessage`(`:14269`)は**音を鳴らさない**。⇒ 眼の報告は `showDMMessage` + 自前でペンの音を刻む(§4-6)。`audio.js` は触らない |
| 6 | 「フォグを実際に削らない」(第2段) | 正しい。戦闘の開始は `tryStartEncounter`(`:21330`)の `detectEngaged()`。眼は `exploredTiles` / `visibleTiles` に**一切書かない**(罠A) |
| 7 | (暗黙)詠唱中に戦闘が割り込まない | メインループは `if (dialogPaused \|\| narrationHold \|\| narrationPlaying) return;`(`:18544`)で止まり、`tryStartEncounter` はその後ろ(`:18549`)。⚠ `narrationHold` は **autoplay では立たない**(`showDMMessage` `:14280`)⇒ 詠唱中は `dialogPaused = true` を自分で立てる(罠B) |
| 8 | 「眼の結果は羊皮紙に」 | 出口の羊皮紙(`.exitHint`)は**出口の前だけ**に出る UI。入った時の報告には器が無い ⇒ 影絵の小さな羊皮紙パネルを 1 つ新設(紙は既存 `assets/parchment_plaza.jpg` を流用・#15 と同じ)。フォグとは無関係の DOM |

### 2-3. ⚠⚠⚠ 見つけた設計上の罠(すべて §8 の変異に内蔵する)

**罠A — 眼の演出でフォグを削ると、戦闘の開始が動く。**
`exploredTiles` / `visibleTiles`(CLAUDE.md の訂正 #39 §2-1)に 1 マスでも足すと、描画だけでなく「見えている敵」の判定にも響きうる。
⇒ 眼の飛行は**DOM の要素を 1 つ動かすだけ**。フォグの集合には触らない。
⭐ 変異 `fogtouch`(眼が通るタイルを `exploredTiles` に足す)。(3a)「詠唱の前後で 2 つの集合の大きさと中身が同じ」で赤くなる。

**罠B — autoplay では `narrationHold` が立たないので、詠唱の `await` の間にゲームが進む。**
`showDMMessage` は `if (!window.__autoplay) narrationHold = true;`(`:14280`)。autoplay の検証(と、`RUN.auto`)では詠唱と報告の間に主人公が歩き、敵が見えて**戦闘が始まる**。
⇒ `revealExitHints` と同じ作法(`skillCheckActive = true; dialogPaused = true;` … `finally` で戻す = `:36852`〜`:36868`)で包む。
⭐ 変異 `nopause`(`dialogPaused` を立てない)。(3b)「詠唱中に `playerX/Y` が動かない・`encounterActive` が立たない」で赤くなる(autoplay で測る)。

**罠C — 出口の前で覗いたノードを `nodeStateFor(先のノード)` で覚えると、出口の並び順が壊れる。**
`nodeStateFor` は「今いるノード専用」(`:36829〜36834` の注記:「まだ入っていないノードに対して呼ぶと visited が立ち、exitsWithReturn の『未踏の枝を先に並べる』順序が壊れる」。`:37590` 付近の注記は「DFS 順が壊れて ?autoplay が無限ループ」)。
⇒ 「覗いた部屋」は**別の集合** `eyeScoutedNodes`(ページ内の `Set`)に持つ。`nodeState` には今いるノードの分しか書かない。
⭐ 変異 `nodestate`(先のノードを `nodeStateFor(to)` で覚える)。(2d)「出口の前で唱えた後、`nodeState[先]` が未定義のまま」で赤くなる。

**罠D — `forcedTier` を本編から渡すと「検証専用の口」の約束が壊れる。**
`revealExitHints(node, forcedTier)` の `forcedTier` は、再入場で振り直さない(`st.hintsRevealed.rolled`)ガードも**飛び越える**(`:36843`)。本編から渡すと、同じノードへ戻るたびに眼を唱え直す。
⇒ 関数の中で「まだ振っていない & 眼を唱えられた」ときだけ `tier = "crit"` にし、`rolled: true` を同じく焼く(§4-5)。
⭐ 変異 `rollanyway`(眼を唱えても知覚判定を振る)。(2b)「眼を唱えたら `resolveSkillCheck` の呼び出し 0 回」で赤くなる。

**罠E — #78 の受入の変異アンカーを逐語で複製すると、`verify_invisibility.js` が exit 3 で止まる。**
`verify_invisibility.js:170〜206` の変異は、`index.html` / `tavern.html` の次の行が**ちょうど 1 回(一部 2 回)**あることをアンカーにしている。
眼の詠唱を透明化の写経で書くと、たとえば `      if (!consumeSpellSlot(unit, ID)) return null;`(`:170`)が 2 回になる。
⇒ 詠唱の関数は**透明化と行の文字列が一致しない形で書く**(変数名を変える: `caster` / `EYE_ID` など)。#78 のコードは 1 バイトも変えない(共通化のための書き換えもしない)。
同じく `tavern.html` の `    if (DF_DEV_MAGIC_SHOP) return scrollShelfIdsDev();   // ★[#78] 開発モードだけ拾う巻物も並べる`(`:184` の `leakdev`)と、`driver_graph_sce1.js:78` の `      await tryInteractNodeEvent();`(`noimmediate`)も**複製しない・変えない**。
⭐ 装置 (0d)「§3 に挙げた他ドライバのアンカー文字列の出現回数が HEAD と同じ」で検査する。

**罠F — #78 の受入 (7b) は、開発用の棚を「common 4 件ちょうど」と数で縛っている。**
`verify_invisibility.js:745` `rows.length === COMMON_TV.length`(`?invis=0` + 開発モード)。眼の巻物を開発用の棚に足すと、`?invis=0` でも眼は並ぶので **(7b) が赤くなる**。
⇒ §6 で「透明化の行が無い」+「common 4 件はすべて並ぶ」へ言い直す(件数は数えない)。#78 の §6 と同じ型の言い直し。
⭐ 変異 `invisoff`(`?invis=0` で眼も棚から消える = 撤退スイッチの取り違え)。(7c)「`tavern.html?invis=0` + 開発 ⇒ 眼は並ぶ」で赤くなる。

**罠G — 隠し要素を数えるとネタバレになる。**
沼地 n4 の `swampNovice`・神殿 n4 の `caelum` は `enemySlots` に素で書かれ(`index.html:11255` の注記)、生きた敵としても湧く(`inactive` / `passiveNpc` / `isNpcSpirit`)。
⇒ 報告から外す条件は 1 つの関数に集める(§4-4 `eyeHidesEnemy`)。
⭐ 変異 `spoilhidden`(除外をやめる)。(1c)「神殿 n4 の報告にカエルム、沼地 n4 の報告に若き蛇神司祭が出ない」で赤くなる。

### 2-4. 呪文と巻物の値

| 対象 | 実測 | → 採用値 |
|---|---|---|
| 呪文の名前 | 実在の SRD 呪文はカタカナ音写(`feedback_magic_item_katakana_naming`) | 呪文 **「アーケインアイ」**・巻物 **「巻物・アーケインアイ」**。説明文で「魔法の眼」と書く |
| 習得 Lv | 5e の魔法使いは 4 レベル呪文を **Lv7** で覚える。既存の 4 レベル呪文 ice-storm = `levelReq: 7`(`index.html:22278` / `tavern.html:4501`) | **`levelReq: 7`**(2 ファイルとも) |
| `mpCost` | 順位 `levelReq*1000+mpCost`(`restoreLowestSlot`)。ice-storm = 9 | **8**(順位 7008 = ice-storm 7009 の前) |
| 巻物の珍しさ | rare は今 **6 種**(`index.html:13587〜13600` の巻物の表: コーンオブコールド / アイスストーム / ポリモーフ / キュアシリアス / キュアクリティカル / コンジュアヴォリー) | rare ⇒ **7 種**。rare を引いたときの 1 種あたり 1/6 → 1/7 |
| 拾う口 | 全部 `pickScrollId` の 1 関数(`:13706`)。宝箱 rare 10 / ボス 35 / 隠し要素 70 | 表に足せば 3 つの口すべてで出る。撤退時だけ抽選から外す(§4-2) |
| 開発用の 1G | `SCROLL_DEV_SHELF_TV = ["scroll-invisibility"]`(`tavern.html:6859`)・価格 `scrollShelfPrice`(`:6875`) | 集合に `"scroll-arcane-eye"` を足す。価格は集合を見ているので**自動で 1G** |
| 傾向の候補 | `isAutoCastSkillTV`(`tavern.html:7863`)は `autoCast` を見る | 鏡の行に `autoCast: true` を付ければ**自動で外れる**(#78 の仕組みを流用・コード追加なし) |

**計測コマンド**:

    grep -n '"ice-storm": {' index.html                                  # → 22275 (levelReq 7 は 22278)
    awk 'NR>=13575 && NR<=13605' index.html | grep -c 'rarity: "rare"'    # → 6
    grep -n "SCROLL_DEV_SHELF_TV\|function scrollShelfPrice" tavern.html   # → 6859 / 6870 / 6875(6876)

### 2-5. 報告の材料(敵の名前・影絵・ボスの判定)

- 名前 = `ENEMY_TYPES[type].name`(`index.html:9658〜`。例 `goblinShaman.name = "ゴブリンシャーマン"`)。
- 影絵 = `ENEMY_TYPES[type].sprite` の**先頭コマ**(`frameW` / `frameH` / `sheetW` / `sheetH` / `rowOffset`)を `background` で切り出し、CSS `filter: brightness(0)` で黒く塗る。**新しい素材は不要**。
- ボス = 出口の先は `bossSlot`、入った部屋は生きた敵の `def.isBoss || def.boss`(`maybeGrantScrollDrop` `:13724` と同じ判定)。
- 隠し要素 = `isMidBossEnemy(e)`(`:14570` = `isHydra` / `faction === "beast"` / `isNpcSpirit`)+ `e.inactive` / `e.passiveNpc` / `e.dormant` / `type === "mimic"` / `def.isSwampNovice`。出口の先(スロットだけ)は同じ条件を `def` で見る。
- 系統(数え方の「匹 / 体」) = `def.undead` と竜・ゴーレムだけ「体」、ほかは「匹」(`detectEnemyFamily` `:14443` は交戦中の添字が要るので使わない)。

### 2-6. 詠唱の口(どこに差すか)

| 口 | 場所 | いつ |
|---|---|---|
| 入った時 ① 最初の部屋 | `startGame()`(`index.html:14222`。呼び口 5 か所 = クリック / マウス / キー / autoplay の `setTimeout` / 導入ナレの後 `:40120`) | `gameStarted = true` の直後 |
| 入った時 ② 2 部屋目以降 | `enterNode`(`:37308`)の到着の一行(`showDMMessage(nodeArrivalText(node), NODE_ARRIVAL_HOLD_MS)`)の後、`tryInteractNodeEvent()` の前 | ノードの遷移のたび |
| 出口の前 | `revealExitHints`(`:36839`)の「まだ振っていない」枝の中、知覚判定の前 | 部屋が片付いて出口を選ぶ直前(`tickNodeChoice` `:37542`) |

- `startGame` は同期関数なので、①では `tryArcaneEyeOnEntry()` を **`await` せずに**呼び、関数の**先頭で同期的に** `dialogPaused = true` を立ててから最初の `await` に入る(次のフレームから止まる)。
- ②は到着の一行が消えるのを待ってから唱える(`awaitNarrationClear()` `:20536`。autoplay は即抜け)。

### 2-7. 既存の検証のうち、触れる本

| 本 | 触れ方 | 影響 |
|---|---|---|
| `tools/verify_invisibility.js` | (7b) `rows.length === COMMON_TV.length`(`:745`)/ 変異アンカー 11 本(`:170〜206`) | **(7b) が腐る** ⇒ §6 で言い直す。アンカーは罠E のとおり複製しない |
| `tools/verify_scroll_shelf.js` | (0a)「common 4 + それ以外 ≥ 13」・(1b)「≥ 13」(#78 で言い直し済み) | rare を足しても**腐らない**(#78 §12-4) |
| `tools/driver_graph_arrows.js` | `g.reveal()`(`__graphRun.reveal` = `revealExitHints` の検証の口 `:39094`)で 4 つの結果を作る | 魔法使いに眼の枠が無い限り、関数の振る舞いは 1 ビットも変わらない ⇒ 無風のはず |
| `tools/driver_graph_sce1.js` | アンカー `      await tryInteractNodeEvent();`(`:78`) | その行を変えない・複製しない ⇒ 無風 |
| `tools/driver_dev_gate2.js` | `const DF_DEV_MAGIC_SHOP = !!window.__dfDevMode;` の行(`:450`) | その行は変えない ⇒ 無風 |
| `tools/sim_plaza_entry.js` | `RARE_POLYMORPH_P = 1 / 5`(`:30`)の直書き | **既に古い**(今 rare は 6 種)。シミュレーションで assert は無い ⇒ 触らない(§11) |

⚠ 出口の前で眼を唱える枝を測る本は **0 本**(新規)。本チケットの新規受入が最初の golden になる。

### 2-8. ポート

`tools/` `scripts/` の 5 桁ポートの最大 = **10502**(`verify_invisibility` の変異)⇒ 本チケットの base = **10503**、変異は 10504〜。

    grep -ohE "\b10[4-6][0-9]{2}\b" tools/*.js | sort -n | uniq | tail -3     # → 10492 / 10493 / 10502

### 2-9. 触る範囲と changelog の要否

- `index.html` と `tavern.html`。`js/*` は触らない(知覚判定を振らないだけ・技能判定の仕組みは変えない)。`audio.js` は触らない(ペンの音は既存の `sfx("narration")`)。
- `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(新しい呪文と巻物)。文面は §10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `MAGE_SKILLS` に `arcane-eye`(§4-1)/ `SCROLL_CATALOG` に 1 行 + 撤退 + `pickScrollId`(§4-2)/ CSS(眼・影絵の羊皮紙)(§4-3)/ 報告の組み立て(§4-4)/ 詠唱と口 3 つ(§4-5)/ 報告の表示(§4-6) |
| `tavern.html` | `MAGE_SKILLS_UI` に 1 行 / `SCROLL_CATALOG_TV` に 1 行 / `SCROLL_DEV_SHELF_TV` に 1 語 + 撤退の判定(§5)/ changelog 1 行 |
| `tools/verify_arcane_eye.js`(新規) | 受入(§8)。base ポート **10503**、変異は 10504〜 |
| `tools/verify_invisibility.js` | (7b) の言い直しだけ(§6) |
| `assets/arcane_eye.png` | codex1 の納品(§4-7)。**無くても動く**(フォールバックの光の玉) |

⛔ #78 の行(`tryCastInvisibility` / `setPartyInvisible` / `tryStealthSurprise` / `scrollShelfIds` / `isAutoCastSkillTV`)・`buildExitHint` / `exitEnemyCount` / `EXIT_HINTS` / `exitHintTier` / `nodeStateFor` / `exploredTiles` / `visibleTiles` / `CLASS_DEFS.mage.defaultSkills` / `AP_TRAVEL_CASTABLE` / `TRAVEL_CASTABLE_IDS` / `const SCROLL_SHELF_PRICE = 80;` / `const DF_DEV_MAGIC_SHOP = !!window.__dfDevMode;` は **1 バイトも変えない**。
⚠ `scrollShelfIdsDev` の中の `(id !== "scroll-invisibility" || isInvisOnTV())` だけは §5-2 で**撤退の判定を 1 つの関数へ出す**ために書き換える(罠E のアンカーには含まれない行 = 実装時に `verify_invisibility.js` を `grep -F` して 0 件を確かめること)。

---

## 4. STEP1 — `index.html`

### 4-1. 呪文の定義(`MAGE_SKILLS` の `"invisibility"` の後 = 表の閉じ `};` の直前)

```js
      /* ★[#79] アーケインアイ (魔法の眼・5e SRD の 4 レベル呪文)。探索中に自動で唱える:
       *   ① 部屋に入った時 (今いる部屋の敵) ② 出口の前 (出口の先の部屋・知覚判定の代わり)。
       *   効果 = 報告だけ (DM の一行 + 羊皮紙の影絵)。⛔ フォグは削らない (依頼書 §2-3 罠A)。
       * ⭐ outOfCombat —— 主人公の技の候補と apTryPreferred がこの旗で外す (#78 と同じ)。
       * ⛔ AP_TRAVEL_CASTABLE には足さない。
       * ⚠⚠ tavern.html の MAGE_SKILLS_UI と二重定義 (levelReq / mpCost をそろえる)。 */
      "arcane-eye": {
        name: "アーケインアイ", category: "utility", target: "self",
        range: "self",
        outOfCombat: true,
        mpCost: 8, levelReq: 7,
        flavor: "魔法の眼を飛ばし、霧の奥の敵の種類と数を探る (部屋に入った時と出口の前に自動で唱える)",
      },
```

⚠ `range: "self", outOfCombat: true,` の 1 行は #78 の変異 `nooutofcombat` のアンカー(`verify_invisibility.js:188`)と**同じ文字列**。
眼の定義では上のとおり**行を分けて**書く(罠E)。

### 4-2. 巻物の表・撤退・抽選

- `SCROLL_CATALOG` の `"scroll-ice-storm"` の行(`:13588`)の直後に、**同じ形の 1 行**:

```js
      "scroll-arcane-eye":     { name: "巻物・アーケインアイ",      spellId: "arcane-eye",           classKey: "mage",   rarity: "rare"     },
```

- 撤退スイッチの判定関数(`isInvisOn` `:13627` の直後。同じ作法 = 関数にする):

```js
    /* ★[#79] 撤退スイッチ ?eye=0 — 魔法の眼を唱えない + 巻物を拾わない (rare の抽選を 6 種へ戻す)。
     * ⚠ 各ページが独立に読む (遷移はまたがない)。tavern.html は isEyeOnTV で開発用の陳列だけ止める。 */
    function isEyeOn() {
      try { return new URLSearchParams(window.location.search).get("eye") !== "0"; }
      catch (e) { return true; }
    }
```

- `pickScrollId` の `let pool = …`(`:13714`)の絞り込みに `&& (isEyeOn() || id !== "scroll-arcane-eye")` を**末尾に**足す(透明化の条件はそのまま)。

### 4-3. CSS(`</style>` より前。#78 の `.dfInvis` の近く)

```css
    /* ★[#79] 魔法の眼。⛔ フォグ (canvas) には触らない —— 眼は DOM の要素を 1 つ飛ばすだけ (依頼書 §2-3 罠A)。 */
    .dfArcaneEye {
      position: absolute; width: 48px; height: 48px; pointer-events: none; z-index: 13;
      background: url("assets/arcane_eye.png") center / contain no-repeat;
      filter: drop-shadow(0 0 8px rgba(140, 200, 255, 0.9));
      transition: left 0.9s ease-in-out, top 0.9s ease-in-out, opacity 0.4s;
    }
    .dfArcaneEye.noimg {                                   /* 素材が無い間のフォールバック = 光の玉 */
      background: radial-gradient(circle, #eaf6ff 0 20%, #7ec8ff 45%, rgba(126,200,255,0) 70%);
    }
    /* 影絵の羊皮紙 (#15 の立て札と同じ紙を暗幕なしで流用) */
    #eyeScoutPanel {
      position: fixed; left: 50%; top: 12%; transform: translateX(-50%); z-index: 81;
      display: none; gap: 10px; padding: 10px 16px; max-width: min(92vw, 520px); flex-wrap: wrap; justify-content: center;
      background: url("assets/parchment_plaza.jpg") center / cover; border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5); pointer-events: none;
    }
    #eyeScoutPanel.show { display: flex; }
    #eyeScoutPanel .eyeShade { display: flex; flex-direction: column; align-items: center; font: 12px/1.2 "Noto Serif JP", serif; color: #2a1a08; }
    #eyeScoutPanel .eyeShade i { display: block; width: 48px; height: 48px; filter: brightness(0); opacity: 0.85; background-repeat: no-repeat; }
    #eyeScoutPanel .eyeShade.boss i { width: 64px; height: 64px; border-radius: 50%; background: radial-gradient(circle, #000 55%, transparent 72%); filter: none; }
```

- ⚠ `z-index`: 報告の一行 `#dmMessage` は z80(`:37258` の注記)⇒ 羊皮紙は 81 で、一行と重ならない位置(上 12%)へ置く。値は §9 の実機で動かしてよい(§8「測らないこと」)。
- `<div id="eyeScoutPanel"></div>` を `#dmMessage` の兄弟として 1 つ足す。

### 4-4. 報告の組み立て(純関数。`exitEnemyCount` `:36772` の近く)

```js
    /* ★[#79] 魔法の眼に映さない敵 —— 隠し要素 (ネタバレ) と、まだ動いていない者 (依頼書 §2-3 罠G)。
     *   生きた敵 (e あり) と、出口の先のスロット (def だけ) の両方をここ 1 か所で判定する。 */
    function eyeHidesEnemy(def, e) {
      if (!def) return true;
      if (def.isHydra || def.faction === "beast" || def.isNpcSpirit || def.isSwampNovice) return true;
      if (e && (e.type === "mimic" || e.inactive || e.passiveNpc || e.dormant)) return true;
      return false;
    }
    /* [{type, n}] (出現順・ボスは別) と boss (有無) から報告の一行を作る。
     * 例: 「ゴブリンどもが 4 匹ほど待ち構えているようだ。シャーマンの姿もある」
     *     「……静かだ。何もいない」 / 「ただならぬ大きな影がひとつ。ホブゴブリンどもが 4 匹ほど従っている」 */
    function eyeReportText(groups, boss) { … }
```

- **集計の入口は 2 つ**(2 経路・写経にしない):
  - 入った時 = `eyeGroupsLive()` … `enemies` のうち `alive && !eyeHidesEnemy(e.def, e)`。ボスは `def.isBoss || def.boss` で別に数える。
  - 出口の先 = `eyeGroupsSlots(toId)` … `RUN.byId[toId].mapDef.rooms[].enemySlots[][2]` を `ENEMY_TYPES` で引いて `!eyeHidesEnemy(def, null)`。`bossSlot` があればボスあり。
- 文の規則(受入はこの規則をドライバ側でも組んで突き合わせる):
  - 敵 0・ボスなし ⇒ 「……静かだ。何もいない」
  - 最多の種類(同数なら出現順で先)1 つ目: n ≥ 2 なら「〈名前〉どもが n 〈匹/体〉ほど待ち構えているようだ」、n = 1 なら「〈名前〉が 1 〈匹/体〉潜んでいる」
  - 2 つ目以降(最大 2 種まで): 「〈名前〉の姿もある」。3 種目以降は「ほかにも影がある」
  - ボスあり ⇒ 先頭に「ただならぬ大きな影がひとつ。」を置き、護衛の文は「…が n 匹ほど従っている」。⛔ **ボスの名前は出さない**
  - 数え方: `def.undead` / 竜 / ゴーレムは「体」、ほかは「匹」
- ⛔ 乱数を引かない(同じ部屋は同じ文 = `pickHintLine` のハッシュ抽選と同じ目的)。

### 4-5. 詠唱と口 3 つ

```js
    /* ★[#79] 覗いた部屋 (ノード id)。⚠⚠ nodeState に書かない —— nodeStateFor は「今いるノード専用」で、
     *   先のノードに対して呼ぶと visited が立ち exitsWithReturn の DFS 順が壊れる (依頼書 §2-3 罠C)。 */
    const eyeScoutedNodes = new Set();

    /* ★[#79] 魔法の眼を唱える術者を探して枠を 1 つ使う。唱えなければ null。
     * ⚠⚠ #78 の tryCastInvisibility と**同じ文字列の行を書かない** (verify_invisibility の変異アンカーが
     *   2 回になり exit 3 = 依頼書 §2-3 罠E)。変数名を変えて書く。
     * ⚠ 主人公の枠は consumeSpellSlot("player", …) (#78 と同じ役割分け)。順 = 主人公 → 仲間。 */
    function takeArcaneEyeCaster() { … return { unit, actor, name } or null; }

    /* ★[#79] 眼を飛ばして報告する (枠は呼ぶ前に取ってある)。toPx = 眼が飛ぶ先 (画面 px)。 */
    async function flyArcaneEye(caster, toPx, groups, boss) { … }

    /* ★[#79] ① 入った時。startGame から await せずに呼ばれる ⇒ **最初の await より前に** dialogPaused を立てる。 */
    async function tryArcaneEyeOnEntry() {
      if (!RUN || !isEyeOn() || !currentNodeId || eyeScoutedNodes.has(currentNodeId)) return false;
      const caster = takeArcaneEyeCaster();
      if (!caster) return false;
      eyeScoutedNodes.add(currentNodeId);
      const prevSk = skillCheckActive, prevDp = dialogPaused;
      skillCheckActive = true; dialogPaused = true;          // ⚠ 罠B: autoplay でも時間を止める
      try {
        await awaitNarrationClear();                          // 到着の一行が消えてから (autoplay は即抜け)
        await flyArcaneEye(caster, /* 部屋の中心の画面座標 */, eyeGroupsLive(), eyeBossLive());
      } finally { skillCheckActive = prevSk; dialogPaused = prevDp; }
      return true;
    }
```

- **① `startGame()`**: `setPhase("explore");` の後に `tryArcaneEyeOnEntry();`(`await` しない・戻り値を捨てる)。
  ⚠ `awaitNarrationClear` は `dialogPaused` を見ない(`narrationHold || narrationPlaying` だけ)ので、自分で立てても詰まらない。
- **② `enterNode`**: `nodeChoiceCooldownUntil = Date.now() + nodeArrivalHoldMs();` の後、`finally` より**前**に `await tryArcaneEyeOnEntry();`。
  ⛔ `      await tryInteractNodeEvent();` の行は動かさない・複製しない(`driver_graph_sce1` のアンカー)。
  ⚠ `enterNode` の中は `nodeBusy = true` の最中 = 出口の tick は入らない。
- **③ `revealExitHints`**: `let tier = forcedTier || null;` の直後に、次の枝を足す(`forcedTier` があるときは**素通り** = 検証の口は 1 ビットも変えない):

```js
      /* ★[#79] 出口の前の魔法の眼。唱えたら知覚判定を振らない (呪文の結果は常に正しい = 会議のリスク欄)。
       * ⚠ forcedTier は検証専用の口なので使わない (依頼書 §2-3 罠D)。rolled: true は下で同じく焼く。 */
      let eyeByExit = null;
      if (!tier) eyeByExit = await tryArcaneEyeAtExits(node, outs);
      if (eyeByExit) tier = "crit";
```

  `tryArcaneEyeAtExits(node, outs)` は、`outs` のうち `eyeScoutedNodes` に無い先が 1 つも無ければ `null`。唱えたら先のノードを**全部** `eyeScoutedNodes` へ入れ、
  `{ [to]: { groups, boss, text } }` を返す(沼地の 2 本なら 1 回の詠唱で両方 = 眼は分かれ道の先を両方見て戻る)。
  報告の一行は出口ごとに続けて出す(「東へ進む — …」「奥へ進む — …」= `DIR_LABELS` `:36317`)。`dialogPaused` の扱いは ① と同じ。
  `byExit` を組んだ後で、眼の結果がある出口の `text` に「 — 〈報告〉」を足し、`eye: true` を持たせる(`buildExitHint` 本体は触らない)。
  ⇒ 矢印の羊皮紙とダイアログのラベル(`exitChoiceLabel`)に眼の報告が同じく出る。
- ⛔ `hintsRevealed.tier` に新しい値("eye" 等)を作らない(4 段を前提に読む本がある)。

### 4-6. 報告の表示

- `flyArcaneEye` の順: `dfPlayCast(actor, { name: "アーケインアイ", element: "arcane" }, { duration: 900 })` → 眼の要素を術者の頭上に出して `toPx` へ飛ばす(0.9 秒)→ 消す → **一行** + **羊皮紙の影絵**を同時に出す → 保持 → 閉じる。
- 一行 = `showDMMessage(text, ms)` + ペンの音: 3 文字ごとに `sfx("narration")` を `NARRATION_CHAR_MS` の間隔で刻む(導入ナレと同じ比率 = `:14732`)。
- 保持 = `ms = max(2600, text.length × 90)`。autoplay は `sleepMs` の速度倍率で縮む。
- 羊皮紙 = 種類ごとに 1 マス(影絵 + 「×n」)、最大 4 マス。ボスありは先頭に丸い影(`.eyeShade.boss`)+「?」。
- ログ = `appendLog("👁 " + name + " の魔法の眼 — " + text)`(`appendLog` `:15522`)。受入はこのログで測る(#78 K12 = `updateInfo` はログに残らない)。
- 眼の画像が読めないとき(`onerror`)は `.noimg` を付ける。**codex1 の納品を待たずに実装・受入を通せる**。

### 4-7. 眼のスプライト(codex1)

- 依頼文 = `C:\Users\PC_User\Desktop\codex1\requests\2026-10-01_arcane-eye.md`(本依頼書と一緒に起草・承認後に `py tools/codex_request.py` で投下)。
- 納品 = 静止画 1 枚 `arcane-eye-v1.png`(256×256・透過)⇒ 受け取り側で `assets/arcane_eye.png` へ取り込み、`tools/codex1_sprites.json` に追記、`codex1/requests/README.md` の一覧を「完了」へ。
- ⚠ 受け取り時は `py tools/check_alpha_bg_residue.py` を必ず通し、**暗い石床の上**で目視する(CLAUDE.md の扉の教訓)。
- ⛔ **単眼の暴君(ビホルダー系)に似せない**(会議の NG 確認)= 触手・眼柄・牙・口なし。

---

## 5. STEP2 — `tavern.html`

### 5-1. 呪文の鏡と巻物の表

- `MAGE_SKILLS_UI` の `invisibility` の行(`:4503`)の直後:

```js
    // ★[#79] アーケインアイ (index.html MAGE_SKILLS と同期)。autoCast = 探索中に自動で唱える (傾向の候補に出さない)。
    { id: "arcane-eye",     name: "アーケインアイ",   category: "補助", range: "self", mpCost: 8, levelReq: 7, autoCast: true, flavor: "魔法の眼で霧の奥の敵の種類と数を探る (部屋に入った時と出口の前に自動)" },
```

- ⚠ `?drawerlv=0` の撤退(`:4538` 付近)には**足さない**(#72 以前に無かった呪文 = #78 と同じ扱い)。
- `SCROLL_CATALOG_TV` の `"scroll-ice-storm"` の行(`:5354`)の直後に、`index.html` と**同じ 1 行**(インデントだけ違う)。

### 5-2. 開発用 1G 陳列(`:6859〜6872`)

- `const SCROLL_DEV_SHELF_TV = ["scroll-invisibility"];` を `["scroll-invisibility", "scroll-arcane-eye"];` へ。
- 撤退の判定を 1 つにまとめる(#78 の `(id !== "scroll-invisibility" || isInvisOnTV())` をこの関数の呼び出しへ置き換える):

```js
  /* ★[#79] 開発用の陳列の撤退 —— 巻物ごとに自分の撤退スイッチを見る (?invis=0 は透明化だけ・?eye=0 は眼だけ)。 */
  function isEyeOnTV() {
    try { return new URLSearchParams(location.search).get("eye") !== "0"; }
    catch (e) { return true; }
  }
  function devShelfSwitchOnTV(id) {
    if (id === "scroll-invisibility") return isInvisOnTV();
    if (id === "scroll-arcane-eye") return isEyeOnTV();
    return true;
  }
```

  `scrollShelfIdsDev` の中: `const dev = SCROLL_DEV_SHELF_TV.indexOf(id) >= 0 && devShelfSwitchOnTV(id);`
- ⛔ `scrollShelfIds` / `scrollShelfPrice` / `dfShopBuyScroll` / `renderShop` は触らない(集合を見ているので自動で 1G・自動で並ぶ)。
- ⭐ 棚の並びは表の並び ⇒ 開発モードでは スリープ → バーニングハンズ → インビジビリティ → **アーケインアイ** → ブレス → ヘイルオブソーン(実装時に `scrollShelf()` で確かめる)。

---

## 6. STEP3 — `tools/verify_invisibility.js` の言い直し(罠F)

- (7b) `dev === true && rows.length === COMMON_TV.length && !rows.some((x) => x.name === INV_SCROLL.name)` を
  **`dev === true && !rows.some((x) => x.name === INV_SCROLL.name) && COMMON_TV.every((c) => rows.some((x) => x.name === c.name))`** へ。
  表示の文言「(common N 件だけ)」を「(透明化なし・common N 件はすべて並ぶ)」へ。
- ⛔ `rows.length === COMMON_TV.length + 1` へ書き換えるだけにしない(開発用の集合がまた増えたときに同じく腐る)。
- 変異 9 本のアンカーは罠E のとおり変えていないので、そのまま通るはず。**素 27/27・`--negative` 9/9 を必ず確かめる**。

---

## 7. 撤退スイッチ

- **`?eye=0`** — `index.html`: 眼を唱えない(入った時・出口の前とも。出口の前は従来どおり知覚判定を振る)・巻物を抽選しない(rare 6 種)。
  `tavern.html`: 開発用の陳列に眼を出さない(透明化は `?invis=0` で独立に消える)。
- ⚠ 判定位置 = `index.html` `isEyeOn()` / `tavern.html` `isEyeOnTV()` の各 1 か所。**ページ遷移はまたがない**(`?invis=0` と同じ流儀)。
- ⚠ 撤退しても、既に覚えた呪文と置いた枠は残る(効き目が無いだけ)。表の行も残す。

---

## 8. 受入条件 — `tools/verify_arcane_eye.js`(新規・base ポート **10503**、変異は 10504〜)

`index.html` を `sessionStorage["dragonfighters.currentScenario"]` を仕込んで開き(`evaluateOnNewDocument`)、`page.evaluate` で**編成・枠を直接組んで**
`tryArcaneEyeOnEntry()` / `__graphRun.reveal()`(= `revealExitHints` の検証の口・`forcedTier` なし)を呼ぶ。
`SkillCheck.resolveSkillCheck` は差し替えて呼び出し回数を数える。`appendLog` を包んで報告のログを拾う。乱数に依る所は `Math.random` を差し替え = **決定的**に。
⭐ 報告の文は**ドライバ側でも §4-4 の規則で組み**、ページの答えと突き合わせる(2 経路)。種類と数はソースの `enemySlots` の型からドライバが自前で数える。
酒場は `tavern.html` を別に開いて `__equipTV` と DOM を見る。サーバと起動は `verify_invisibility.js` の写経でよい。

### §0 装置(母集団を先に確かめる)

- **(0a)** ソース 2 ファイルの巻物の表に `scroll-arcane-eye` が**同じ中身**(name / spellId / classKey / rarity = rare)で 1 行ずつ。呪文の定義 2 つの `levelReq`(= 7)と `mpCost` が一致。
- **(0b)** (1a) で**報告のログが 1 行以上**拾えた・`tryArcaneEyeOnEntry` / `tryArcaneEyeAtExits` / `eyeHidesEnemy` / `eyeReportText` が関数として在る。
  ⭐ **これが無いと全 assert が空振りで永久緑になる。**
- **(0c)** 全ページ起動で pageerror 0。
- **(0d)** 罠E: `verify_invisibility.js` の変異アンカー 11 本と `driver_graph_sce1.js` の `noimmediate` のアンカーが、原本の `index.html` / `tavern.html` で **HEAD `620b844` と同じ回数**。

### §1 入った時

- **(1a)** 砦 n4・魔法使いの仲間に眼の枠 1 ⇒ 唱えて枠 1 → **0**、報告のログ 1 行。種類と数がドライバの数え(スロットの型 → `ENEMY_TYPES` の名前)と一致し、**ボスの名前が出ない**。
- **(1b)** 枠 0 / 眼を知らない / `?eye=0` ⇒ 唱えない・ログ 0・枠は変わらない。
- **(1c)** 罠G: 神殿 n4 の報告に「カエルム」、沼地 n4 の報告に「若き蛇神司祭」が**出ない**(対照: スケルトン・リザードマンは出る)。
- **(1d)** 同じ部屋で 2 回呼ぶ ⇒ 2 回目は唱えない(枠 1 つだけ減る)。
- **(1e)** 主人公が魔法使い(`partyComposition` を仕込んで読み込み直す)・`currentSpellSlots["arcane-eye"] = 1` ⇒ 唱えて `currentSpellSlots` が 0。
- **(1f)** `startGame()` を呼んだ直後(同期で戻った時点)に `dialogPaused === true`(① の口が効いている)。
- **(1g)** 枠の関門: `initAllySpellSlots(ally, "mage", 6, {mage:{"arcane-eye":1}})` ⇒ 0(`levelReq` 7)/ Lv7・未習得 ⇒ 0 / Lv7・習得済み ⇒ 1。

### §2 出口の前

- **(2a)** 砦 n4 で出口を見せる前(`__graphRun.reveal()`)⇒ 唱えて枠 1 → 0、出口 n7 の報告に「ただならぬ大きな影がひとつ」+ 護衛 2 種(orcBerserker・orcGrunt の名前)。`hints().tier === "crit"`・`byExit.n7.eye === true`・ラベル(`choiceLabels()`)にも同じ報告。
- **(2b)** 罠D: 眼を唱えたら `resolveSkillCheck` の呼び出し **0 回**。唱えなければ(枠 0)従来どおり **1 回**・4 段の tier のどれか。
- **(2c)** 沼地 n4 ⇒ 1 回の詠唱で n7 と n6 の両方(n6 は「……静かだ。何もいない」)。枠は 1 つだけ減る。
- **(2d)** 罠C: 出口の前で唱えた後、`nodeState["n7"]` が**未定義のまま**・`eyeScoutedNodes` に n7。
- **(2e)** 出口の前で覗いた n7 へ `__graphRun.enter("n7")` ⇒ 入った時の詠唱は**しない**(枠は減らない)。
- **(2f)** 再入場: 同じノードで `reveal()` を 2 回 ⇒ 2 回目は唱えない(`rolled` のガード)。

### §3 フォグと時間

- **(3a)** 罠A: 詠唱(①・③)の前後で `exploredTiles` / `visibleTiles` の大きさと中身が同じ。
- **(3b)** 罠B: `?autoplay=1` で、詠唱の最中(報告のログが出た瞬間を `appendLog` の包みで捕まえる)に `dialogPaused === true`・`encounterActive === false`、詠唱の前後で `playerX/Y` が同じ。詠唱が終わると `dialogPaused` が元へ戻る。
- **(3c)** 報告の間、`#eyeScoutPanel` に種類の数だけ影絵(ボスありは丸い影 +1)、閉じた後は非表示。眼の要素は後に残らない。

### §4 戦闘中は唱えない

- **(4a)** 魔法使いの仲間の傾向を「全般 = arcane-eye」にして `apTryPreferred(ally)` ⇒ `false`・枠は減らない・`apTryPreferred` から `executeSkillOn` へ届いた回数 = 0(#78 K9 の測り方)。
- **(4b)** `executeSkillOn(ally, "mage", "arcane-eye", -1)` ⇒ `false`。
- **(4c)** 主人公(魔法使い)の技の候補に `arcane-eye` が入らない(#78 の (4c) と同じく `playerAttackTurn(0)` の中の `pickLeaderAction` の `choices` を捕まえる)。

### §5 酒場

- **(5a)** 開発モードで、巻物の棚に「巻物・アーケインアイ」が並び「購入 1G」。金貨 1G で買える ⇒ 金貨 0・所持 1。透明化も並ぶ・common は「購入 80G」。
- **(5b)** 開発モードでない ⇒ 並ばない・`shopBuyScroll("scroll-arcane-eye")` = `{ok:false, reason:"noitem"}`。
- **(5c)** 買った巻物を `learnScroll` ⇒ `knownSpellsTV.mage` に `arcane-eye`。引き出しの呪文一覧に「アーケインアイ」(主人公 Lv1 では `[Lv7 必要]`)。
- **(5d)** 魔法使いのプリセットに眼を置くと、傾向の「全般 / 雑魚 / ボス」の候補に**出ない**・カードの「技」行には**出る**(#78 の `isAutoCastSkillTV` の流用が効いている)。

### §6 恒等(非退行)

- **(6a)** 眼の枠が無い編成で `reveal()` ⇒ 知覚判定の引数(DC・`extraBonus`・`title`)と `hintsRevealed` の中身が `?eye=0` と同じ。
- **(6b)** `pickScrollId({common:0, uncommon:0, rare:1})` を `Math.random` を差し替えて全区間で回し、素 = 7 種(眼あり)・`?eye=0` = 6 種 = #79 以前の rare。uncommon の集合(8 種・透明化あり)は変わらない。
- **(6c)** `tools/verify_invisibility.js` が素 27/27・`--negative` 9/9(§6 の言い直し後)。`tools/verify_scroll_shelf.js` が素 19/19・`--negative` 8/8。

### §7 撤退

- **(7a)** `index.html?eye=0` ⇒ (1a)(2a) と同じ仕込みで唱えない(出口の前は知覚判定を 1 回振る)。
- **(7b)** `tavern.html?eye=0` + 開発モード ⇒ 眼が並ばない・透明化は並ぶ。
- **(7c)** 罠F: `tavern.html?invis=0` + 開発モード ⇒ 透明化は並ばない・**眼は並ぶ**。

### ⛔ 測らないこと

- 眼の飛行の尺・軌道・大きさ、羊皮紙の位置と `z-index`、報告の保持時間(目で動かす余地を残す)。
- ペンの音の刻み(鳴っていないバスの `gain` は測れない = #74 の教訓)。「`sfx("narration")` が 1 回以上呼ばれた」だけ見る。
- 眼の画像(codex1 の納品は §9 の目視。受入は `.noimg` のフォールバックのままで通る)。
- 実戦で眼が唱えられる頻度(Lv7 の魔法使いと巻物に依る)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `fogtouch` | 眼が通るタイルを `exploredTiles` に足す(罠A) | (3a) |
| `nopause` | 詠唱中に `dialogPaused` を立てない(罠B) | (3b)(1f) |
| `nodestate` | 覗いた先を `nodeStateFor(to)` で覚える(罠C) | (2d) |
| `rollanyway` | 眼を唱えても知覚判定を振る(罠D) | (2b) |
| `invisoff` | 開発用の陳列の撤退を `isInvisOnTV()` 1 本で見る(罠F) | (7c) |
| `spoilhidden` | `eyeHidesEnemy` が常に false(罠G) | (1c) |
| `bossname` | ボスありのとき先頭にボスの名前を出す | (1a)(2a) |
| `recast` | `eyeScoutedNodes` を見ない(同じ部屋で何度も唱える) | (1d)(2e) |
| `nooutofcombat` | 眼の定義から `outOfCombat` を外す | (4a)(4c) |
| `leakdev` | 開発モードでなくても眼を棚に並べる | (5b) |

⭐ 変異は**測っている場所に現れるか**まで設計する(#54 の教訓)。注入した行が実行されたことを変異ごとに 1 つ確かめる。
⚠ #78 の K10 のとおり、赤くなる節は上の表より広がる。実走の担当を控え、ドライバは**実測の集合との完全一致**を要求する。
⚠ `leakdev` と `nooutofcombat` のアンカーは眼の側の行を使う(#78 の同名の変異のアンカー行を**使わない** = 罠E)。

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指し: `verify_invisibility.js`(§6)/ `verify_scroll_shelf.js`(rare を足しても腐らないことの確認)/ `driver_graph_arrows.js`(`reveal` の 4 段)/ `driver_graph_sce1.js`(`noimmediate` のアンカー)/ `driver_graph_run.js`・`driver_graph_kinds.js`・`driver_graph_reentry.js`(`revealExitHints` と `enterNode` を通る)/ `driver_dev_gate2.js`(`DF_DEV_MAGIC_SHOP` の行)/ `driver_action_priority.js`・`verify_party_match_setup.js`(傾向の候補)。
- **母集団**: `index.html` か `tavern.html` を読む本。dev-loop の作法どおり、項目 1 で着手前の色を控え、最後に影のツリー(+ `git` を読む本は clone)と交互に対比較する(#74〜#78 の方式)。
  #78 の走査(169 腕・本番 `cfff418`)は `cfff418..620b844` で配信物が変わっていなければ着手前の色として流用できる ⇒ 項目 1 で blob OID を追試して決める。
- ⚠ 基準値は実装窓が着手時に測る。**走らせて違ったら期待値を書き換える前に理由を突き止める。**
- ⚠ `verify_invisibility` と `verify_scroll_shelf` は `git show` を読む(#78 K15)⇒ 影では走らない。clone で。
- ⚠ 全数走査は試遊サーバ 8765 を止めてから(#73 の教訓・#78 §12-3 (7))。PowerShell から起動する(#78 の Git Bash 6 倍遅延)。

---

## 9. 実機/実感の確認(ここが本当の受入)

- ⚠ ローカルは http 起動が必須(`file://` ではペンの音が鳴らない)。
- `?dev=1` で武器防具屋を開き、「巻物・アーケインアイ」を 1G で買う → 書庫で読む → 引き出しで Lv7 以上の魔法使いに枠を 1 つ置く。
- 砦へ潜り、最初の大部屋で **魔法陣 → 眼が飛ぶ → 一行 + 羊皮紙の影絵** の順で出るか。報告の数と、実際に霧から出てくる敵が合っているか。
- 敵を片付けた後、出口の矢印の前で眼が飛び、羊皮紙(矢印の横)に「ただならぬ大きな影がひとつ…」が出るか。ボス部屋へ入った時に**もう一度唱えない**か。
- 沼地の分かれ道で、1 回の詠唱で 2 本とも報告されるか。
- テンポ(入った時の到着の一行 → 眼 → 報告)。iPhone 縦で羊皮紙が折り返しても読めるか・一行と重ならないか。
- 眼の絵(codex1 の納品後): 暗い石床の上で白い縁や矩形が出ないか。単眼の暴君に見えないか。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>魔法の眼の巻物を追加</b> — 稀少な巻物「巻物・アーケインアイ」を宝箱やボスから拾えるように。覚えた魔法使いは、部屋に入った時と出口の前に魔法の眼を飛ばし、霧の奥の敵の種類と数を教えてくれる(呪文の枠を 1 つ使う)。"

---

## 11. やらないこと

- ⛔ **フォグを削る**・敵を「見えた」扱いにする(会議の決定)。
- ⛔ 眼の報告で**分岐を自動で選ぶ**(出口の選択は今までどおり。AI の扉選びは作らない)。
- ⛔ **生成クエスト・街道の襲撃**で唱える(`RUN = null` = 分岐グラフなし)。入った時の口は `RUN` があるときだけ。
- ⛔ ボス本人の名前・隠し要素を報告する。
- ⛔ 道中・戦闘中に唱える(`AP_TRAVEL_CASTABLE` / `TRAVEL_CASTABLE_IDS` に足さない)。
- ⛔ NPC の魔法使いの既定呪文(`CLASS_DEFS.mage.defaultSkills`)に足す。
- ⛔ エルフ・僧侶に眼を持たせる(5e で Arcane Eye を持つのは Wizard。このゲームでは魔法使いだけ)。
- ⛔ 巻物を**店で売る**(拾うだけ。開発モードの 1G 陳列だけ)。
- ⛔ `audio.js` に眼専用の効果音を足す(詠唱は `dfPlayCast`・報告はペンの音で足りる)。
- ⛔ #78 のコードの共通化(`tryCastInvisibility` と眼の術者探しを 1 つの関数へまとめる等)。罠E のアンカーが崩れる。
- ⛔ `tools/sim_plaza_entry.js` の `RARE_POLYMORPH_P = 1 / 5` の直し(既に古い・assert なし・別チケット候補)。
- ✅ `実装依頼書/README.md` への行追加は承認時に起草窓が行う。用意してある行:

    | 79 | [2026-10-01_arcane-eye.md](2026-10-01_arcane-eye.md) | **承認済** | 0% | 魔法の眼(アーケインアイ)。巻物 rare・拾うだけ・開発モードで 1G 陳列。部屋に入った時(今の部屋)と出口の前(先の部屋・知覚判定の代わり)に自動で唱え、敵の種類と数を一行 + 羊皮紙の影絵で報告(ボスは名前を伏せ・隠し要素は出さない・同じ部屋は 2 度覗かない)。⚠ 畳んだ後は出口の先がほぼボス部屋(会議の前提が崩れた)/ `enemySlots` の種類は 3 番目の要素 / フォグに触らない / autoplay では `narrationHold` が立たない ⇒ `dialogPaused` / 覗いた先を `nodeStateFor` で覚えない / #78 の変異アンカーを複製しない / #78 の (7b) を言い直す。撤退 `?eye=0` |

---

## 12. 実装結果

### 12-0. 着手前の実測(項目1・基準 HEAD `cd32146`・本番ファイルは 1 バイトも触っていない)

- **基準の HEAD**: 承認コミットは `00275b1`。項目1 の最中に起草窓が `cd32146`(眼の素材)を積んだので、基準を `cd32146` に置く。
  `git diff --stat 00275b1 cd32146` の差分は 2 ファイルだけだった。`assets/arcane_eye.png`(新規・20,424 バイト)と `tools/codex1_sprites.json`(+7 行。`sheets` に `key: "arcane-eye"`・`format: "prop"` を 1 件足しただけ)。
- **本番の同一性**: `git rev-parse <rev>:<path>` の値は `cfff418` / `620b844` / `00275b1` / `cd32146` の 4 点で次のとおり**全部同じ**。
  `index.html` = `ac969497…` / `tavern.html` = `64130d22…` / `js` = `00e2267a…` / `audio.js` = `311aee29…` / `title.html` = `483e8cc6…` / `town.html` = `3db92db7…` / `world.html` = `65305dff…`。
  ⇒ 起草時(`620b844`)にコードを測った結果は、そのまま `cd32146` にも当てはまる。
- 行末: `index.html` は 40123 行、`tavern.html` は 11108 行。どちらも**全行 CRLF・LF 単独 0**(バイト数で確認)。⇒ 編集は `py` を使いバイト単位で行う。
- **§2-1 のグラフは本番ページで組み直した**(`index.html?diag=1` で `DFMapDef.graphInfo(buildScenarioRun(id))`・pageerror 0)。**6 シナリオとも表と完全に一致**した。ノード・出口・スロットの型と数・ボスの型のすべてで一致し、型の入っていないスロットは全ノードで 0 だった。
  隠し要素のスロットは沼地 n4 `swampNovice`(`isSwampNovice`)と神殿 n4 `caelum`(`isNpcSpirit`・`undead`)の 2 つだけ。**出口の先(n1 / n6 / n7)に隠し要素のスロットは 0**。
  沼地 n6 のハイドラと森 n7 の残影の獣はスロットには居らず、`SCENARIO_NODE_EXTRAS`(`:11258`)が噂フラグを見て湧かせる。⇒ 出口の先の報告(スロット)には原理的に出ない。入った部屋の報告は `eyeHidesEnemy` で落とす。
  ⚠ `:11255` の注記「砦の守護者は素の enemySlots に書く」はグラフ版では古い。畳んだ砦(n4 / n7)に守護者の型は 1 つも無い。

#### 崩れた主張(K1〜K6)— **仕様(ユーザー決定)に響くものは 0 件**(blocked ではない)

| K | 主張(依頼書) | 実測(`cd32146`) | 仕様に響くか |
|---|---|---|---|
| **K1** ⚠⚠ | §2-3 罠A / §8 (3a)「`exploredTiles` / `visibleTiles` の**集合の大きさと中身**」「`exploredTiles` に足すと『見えている敵』の判定にも響きうる」 | **崩れ(型と役割の 2 点)**。① 2 つとも集合ではない。`MAP_H` 本の `Uint8Array(MAP_W)` の配列(`:5061〜5062`)で、`buildNode` のたびに作り直される(`:36178〜36179`)⇒ 「大きさ」は常に同じで何も測れない。② 伏兵の判定 `isEnemyVisibleToParty`(`:18187`)に効くのは **`visibleTiles`** のほう。こちらは `computeVisibleTiles`(`:18114`)が毎回 0 に戻す(`:18128`)。`exploredTiles` は「影響は描画に閉じる」(`:18160〜18162` の注記)もので、そのほかにはノードの保存 `st.explored`(`:37123`)と屋外の計数 `__outdoorRevealProbe`(`:36099`)にしか効かない | **響かない**(「フォグに触らない」という方針はそのまま)。**受入の書き方が変わる** ⇒ 項目3 の (3a) は、行ごとのバイト列(例: 全行を連結した hash と 1 の個数)が詠唱の前後で同じかを見る。変異 `fogtouch` の `exploredTiles[ty][tx] = 1` は、この比較で赤くなる。戦闘の開始には効かない |
| **K2** | 行番号(下表) | 小ずれが 4 件。**差す場所は一意に決まる** | 響かない |
| **K3** | §2-6 ①「`gameStarted = true` の直後」と §4-5「`setPhase("explore");` の後」 | 同じ依頼書の中で食い違っている。`startGame`(`:14222`)の中で `gameStarted = true` は `:14224`、`setPhase("explore")` は `:14228`(最終行)。`setPhase("explore")` は `PHASE_NARRATION.explore` を `showDMMessage(…, 2200)` で出す(`:14667`)。⇒ **§4-5 のほうが正しい**(`setPhase` の後に呼べば `awaitNarrationClear` がこの一行を待てる。前に呼ぶと眼の報告の上にフェーズの一行がかぶる) | 響かない(§4-5 に従う) |
| **K4** | §1 の例「…シャーマンの姿もある」 | §4-4 の規則は「〈名前〉の姿もある」で、名前は `ENEMY_TYPES[type].name` = **「ゴブリンシャーマン」**(`:9709`)。例は略記にすぎない | 響かない(規則が正。受入も規則から組む) |
| **K5** | §4-5 ③「眼の結果がある出口の `text` に『 — 〈報告〉』を足す」 | 補足。`tier = "crit"` のとき、`buildExitHint`(`:36796`)は既に `sure + " — N 体ばかりの気配だ"` を返す。N は `exitEnemyCount` で、**ボスも +1 して数える**(`:36772`)。⇒ 眼の出口の文は「〈著者の文〉 — 3 体ばかりの気配だ — ただならぬ大きな影がひとつ。…」の二段になる(砦 n7 の例。n6 は N = 0 なので「— N 体」は付かない)。出口の先には隠し要素が居ない(上記)ので、N がネタバレになることは無い | 響かない(`buildExitHint` を触らない方針のまま。二段の文言が冗長かどうかは §9 の実機で見る) |
| **K6** | §2-7「`driver_graph_arrows` は魔法使いに眼の枠が無い限り無風」 | 実際はもっと強い。`reveal(tier)` は `forcedTier` を渡すので、§4-5 の `if (!tier)` で**眼の枝そのものを通らない** ⇒ 枠の有無に関係なく無風。`driver_dev_gate2.js:450` は文字列ではなく**正規表現**(`/const DF_DEV_MAGIC_SHOP\s*=\s*!!window\.__dfDevMode;/`)で見ている。それでも「その行を変えない」で十分 | 響かない |

**K2 の行番号(実測)**:

| 依頼書の参照 | 実測 |
|---|---|
| `tickNodeChoice` `:37542` | 関数の頭は **37488**。37542 は中の呼び口 `await revealExitHints(node);`(参照先としてはこちらで正しい) |
| DFS の注記 `:37590` 付近 | **37577**(「exitsWithReturn の DFS 順が壊れて ?autoplay が無限ループ」) |
| `maybeGrantScrollDrop` のボス判定 `:13724` | 関数の頭は 13720、`def.isBoss \|\| def.boss` は **13726**(13725 は隠し要素 70) |
| §5-2 開発用の陳列 `:6859〜6872` | `SCROLL_DEV_SHELF_TV` 6859 / `isInvisOnTV` 6860 / `scrollShelfIdsDev` **6864〜6874**(書き換える行 = **6870**)/ `scrollShelfPrice` 6875〜6877 / `scrollShelfIds` 6878〜6882(`leakdev` のアンカー 6880) |

**そのまま正しかった主張**(抜粋。すべて `cd32146` で確認):
- `index.html`: `MAGE_SKILLS` 22219(`"ice-storm"` 22275・`levelReq: 7` 22278 / `"invisibility"` 22289〜22294 / 表の閉じ `};` **22295**)。
  `SCROLL_CATALOG` 13580(`scroll-ice-storm` 13588。rare は 13587/13588/13589/13594/13595/13600 の **6 種**)/ `isMageSleepOn` 13621 / `isInvisOn` 13627 / `pickScrollId` 13706(`let pool` 13714)。
  拾う口は 3 つ(13725 = 隠し要素 70 / 13726 = ボス 35 / 24156 = 宝箱 10)。
  `ENEMY_TYPES` 9658(`sprite` / `sheetW` / `sheetH` / `frameW` / `frameH` / `rowOffset` あり)/ `startGame` 14222(呼び口 5 = 18003 / 18023 / 18062 / 40076 autoplay / 40120 導入ナレの後)。
  `showDMMessage` 14269(効果音なし・`narrationHold` は `:14280` で autoplay 以外だけ)/ `dialogPaused` 14291 / `detectEnemyFamily` 14443 / `isMidBossEnemy` 14570 / `setPhase` 14642。
  `NARRATION_CHAR_MS = 70` 14717 / `typeNarrationParagraph` 14720(3 文字ごとの `sfx("narration")` 14732)/ `appendLog` 15522。
  `moveEnemies` 18541(`dialogPaused` の早期 return 18544 → `tryStartEncounter()` 18549 → `heroAI()` 18750 = 詠唱中は主人公も止まる)/ `awaitNarrationClear` 20536 / `tryStartEncounter` 21330(`detectEngaged` 21276)。
  `setPartyInvisible` 25435 / `tryCastInvisibility` 25445 / `tryStealthSurprise` 25467 / `AP_TRAVEL_CASTABLE` 32423 / `apTryPreferred` 32534 / `pickLeaderAction` 32663 / `playerAttackTurn` 32809。
  `DIR_LABELS` 36317(right = 東へ進む / up = 奥へ進む)/ `EXIT_HINTS` 36723 / `exitHintTier` 36756 / `exitEnemyCount` 36772 / `buildExitHint` 36796 / `:36828` の「本編からは渡さない」/ `nodeStateFor` 36835(注記 36829〜36834)。
  `revealExitHints` 36839(再入場ガード 36843・`let tier` 36846・`skillCheckActive = true; dialogPaused = true;` 36852・`finally` 36868 = **元の値へ戻さず false を書く**)/ `exitChoiceLabel` 36888。
  `#dmMessage` z-index 80(`:932`・DOM は `:3140`)/ `NODE_ARRIVAL_HOLD_MS` 37265 / `enterNode` 37308(`nodeChoiceCooldownUntil = Date.now() + nodeArrivalHoldMs();` **37354**・`await tryInteractNodeEvent();` は try の外)/ `__graphRun.reveal` 39094(`enter` / `hints` / `choiceLabels` あり・dev ゲートの内側)。
  `consumeSpellSlot` 14000 / `initAllySpellSlots` 14011(Lv と習得の関門あり)/ `dfPlayCast` 11775 / CSS `.dfInvis` 3015 / `</style>` 3019。
- `tavern.html`: `MAGE_SKILLS_UI` 4490(ice-storm 4501・invisibility 4503)/ `?drawerlv=0` 4538 / `DF_DEV_MAGIC_SHOP` 5022 / `SCROLL_CATALOG_TV` 5347(ice-storm 5354)/ `SCROLL_SHELF_PRICE` 6850 / `isAutoCastSkillTV` 7863。
- `js/df-mapdef.js:20`(`enemySlots = [tx, ty]`)/ `index.html:38017`(`[51, 20, "hobgoblin"]`)/ `scripts/hooks/check_changelog.py:24`(GAME_LOGIC)。
- `assets/parchment_plaza.jpg` は在る(git 管理下・132,576 バイト・tavern / town / world が使用)。`index.html` からはまだ参照されていない(§4-3 が初めての参照になる)。
- **§2-8 ポート**: `tools/*.js` に 10503 以上の 5 桁の数は在るが、ポートとして使われているものは 0(行番号や面積の数字)。最大ポートは **10502** ⇒ base **10503** のまま。
- 名前の衝突なし: `eyeScout` / `ArcaneEye` / `arcane-eye` / `isEyeOn` / `eyeHidesEnemy` / `eyeReportText` / `get("eye")` / `?eye=` は、`index.html` `tavern.html` `js/*` `tools/*.js` のどれにも 0 件(`arcane-shield` と `element: "arcane"` は別物)。

**罠E のアンカー((0d) の基準値)**:
- `verify_invisibility.js:170〜206` の変異アンカーは 11 本(`from:` の数)。原本の出現回数は**全部要求どおり**だった(10 本が 1 回、`noautocast` = `tavern.html` 8000 / 9269 で 2 回)。
  所在は index 25459 / 25439 / 25508 / 25498 / 22291 / 25492 / 25480 / 25484 / 25472、tavern 6880。
- `driver_graph_sce1.js:78` の `      await tryInteractNodeEvent();` は `index.html` に **1 回**。
- §5-2 で書き換える行(`tavern.html:6870` `const dev = … (id !== "scroll-invisibility" || isInvisOnTV());`)を `grep -F` した結果は、`verify_invisibility.js` で **0 件**、`tools/*` 全体でも 0 件。`SCROLL_DEV_SHELF_TV` の語を含む本も 0 本 ⇒ 書き換えてよい。
- `verify_scroll_shelf.js` のアンカー(`.filter(id => SCROLL_CATALOG_TV[id].rarity === "common")` など 4 種)は `tavern.html` にどれも 1 回。
- **依頼書のコード片 9 ブロックに、上のアンカー文字列はどれも含まれない**(機械照合で 0 件 = #78 K2 の型の事故は無い)。

**補足(項目2 への注意・仕様不変)**:
- 400ms の見回りのうち `tryInteractCage` / `tryAwakenGuardian` / `tryApproachCaelum` / `tryApproachAltar` は、`skillCheckActive` / `dialogPaused` を見ていない(条件は位置と戦闘中かどうかだけ)。
  ただし詠唱中は `moveEnemies` の早期 return で `heroAI` も止まるので、条件が新しく真になることは無い。`tryDiscoverChest` / `tryApproachMimic` / `tickNodeChoice` / `tryInteractNodeEvent` はどちらかの旗を見ている。
- `revealExitHints` の知覚判定の `finally` は `skillCheckActive = false; dialogPaused = false;` と書く(元の値へ戻さない)。眼の枝は判定の**代わり**に走るので衝突しない。
  ただし `tryArcaneEyeAtExits` が唱えなかったとき(`null`)は、旗を 1 つも触らずに返すこと。

#### 名指し golden 10 本の着手前の色(直列・各 2 回・PowerShell)

`git` を読む 2 本(`verify_invisibility` / `verify_scroll_shelf`)は clone(scratchpad `item1\clone79`)で走らせた。1〜2 回目は `00275b1` で走らせ、`cd32146` へ fast-forward した後にもう 1 回(3 回目)走らせた。残る 8 本は本番の作業ツリー(`cd32146`)で走らせた。

| 本 | 1 回目 | 2 回目 | 所要 | after78(`cfff418`) |
|---|---|---|---|---|
| `verify_invisibility.js` | exit 0・27/27 | exit 0・27/27(3 回目 `cd32146` も 27/27) | 26 秒(3 回目は 142 秒 ⚠ 機械の揺れ) | 27/27 |
| `verify_invisibility.js --negative` | exit 0・**9/9**(空振り 0・漏れ 0) | exit 0・9/9(3 回目も 9/9) | 157 / 42 / 159 秒 | 9/9 |
| `verify_scroll_shelf.js` | exit 0・19/19 | exit 0・19/19(3 回目も) | 3 秒 | 19/19 |
| `verify_scroll_shelf.js --negative` | exit 0・8/8 | exit 0・8/8(3 回目も) | 24 秒 | 8/8 |
| `driver_graph_arrows.js` | exit 0・80/80 | exit 0・80/80 | 15 秒 | 80/80 |
| `driver_graph_sce1.js` | exit 0・106/106 | exit 0・106/106 | 207 / 184 秒 | 106/106 |
| `driver_graph_run.js` | exit 0・99/99 | exit 0・99/99 | 62 / 71 秒 | 99/99 |
| `driver_graph_kinds.js` | exit 0・66/66 | exit 0・66/66 | 38 秒 | 66/66 |
| `driver_graph_reentry.js` | exit 0・57/57 | exit 0・57/57 | 2 秒 | 57/57 |
| `driver_dev_gate2.js` | exit 0・62/62 | exit 0・62/62 | 26 秒 | 62/62 |
| `driver_action_priority.js` | exit 0・PASSED 92 / FAILED 0 | 同じ | 64 秒 | 92/0 |
| `verify_party_match_setup.js` | exit 0・PASSED 36 / FAILED 0 | 同じ | 43 秒 | 36/0 |

⇒ **10 本 12 腕が全部緑で、決定的**(毎回同じ色・同じ件数)。after78 の色と件数とも一致した。**着手前から赤の本は 0**。
ログは scratchpad `item1\logs\*.r1.log` / `*.r2.log`、集計は `item1\golden79.tsv`、走らせた道具は `item1\run_golden79.ps1`。

#### 母集団と着手前の色の流用判定 — **#78 の走査(169 腕・本番 `cfff418`)をそのまま流用する**

- **母集団** = `tools/` と `scripts/` の `.js` のうち、コメントを除いたコードに `index.html` / `tavern.html`(または `tavern` の語)を含む本 = **149 本**(#78 の 148 本 + `verify_invisibility.js`)。
  内訳は `tavern` を読む本が 55、`index.html` だけの本が 94。`scripts/` に `.js` は無い。一覧は scratchpad `item1\pop79.json`。
- **流用してよい理由(blob OID)**: `cfff418..cd32146` の差分は、実装依頼書 3 本・`assets/arcane_eye.png`(新規)・`tools/codex1_sprites.json` の 3 種類だけ。配信物(`index.html` / `tavern.html` / `js` / `audio.js` / `title` / `town` / `world`)の blob はすべて同じ。
  - 実装依頼書を**読む**本は 0 本(`2026-09-30_invisibility.md` という語は `verify_invisibility.js:4` のコメントに出てくるだけ)。
  - `tools/codex1_sprites.json` を読む母集団の本は **`driver_elf_sprites.js` の 1 本だけ**(`/tools/codex1_sprites.json` を fetch し、`key` が `elf` / `female-elf` の行だけを見る)。今回足されたのは `arcane-eye` の行なので無関係。ほかに読むのは `tools/*.py`(パッカー・検査器)で、母集団の外。
  - `assets/` の一覧を読む本は `verify_codex_map_skill.js` の 1 本だけ(`readdirSync(assets)` で**前後の差**を取る)。この本は母集団の外で、ファイルが 1 枚増えても前後の差は変わらない。`arcane_eye.png` を参照するページも本も 0。
  - `git` の `HEAD` を読む本(`_golden.js` の rev 記録や `driver_cleric_sprites` の `git show HEAD:index.html` など)も、読む blob は同じ。
- **腕の突き合わせ**(機械で照合): 母集団 149 本は、after78 の素の腕 153 本(母集団外の 4 本 = `probe_town_mask` / `verify_road_events` / `verify_world_heromark` / `verify_world_steps` を含む)に**全部含まれている(漏れ 0)**。
  `--negative` の腕は 16 本ある(`verify_invisibility` / `verify_scroll_shelf` / `verify_party_match_setup` などを含む)。
  ⇒ 流用する着手前の色は **169 腕すべて**。#78 は 365.8 分かけて測っている。
- **流用元**: #78 の scratchpad(`5ad0d5a7…\scratchpad\item4\run\after78.tsv` + `after\` + `fp_after\`)。本チケットの scratchpad `item1\from78\` へ**退避コピー済み**(4.9 MB。`sweep_78.py` / `cmp_78.py` / `fp74.py` / `mkshadow_78.py` / `pair_78.py` / `fisher.py` / `select_neg78.py` / `build_arms_78.py` / `armlist_78.json` も同梱)。
- **after78 で緑でない腕は 18 本**(= 着手前から赤。項目4 では「同じ赤のままか」で判定する)。
  - `driver_mapeditor` 176/179 / `driver_monsters_griffon` 15/17 / `driver_monsters_umberhulk` 21/22 / `driver_monsters_hobgoblin` 12/14 / `driver_field_step6` 55/59 / `driver_grid_p8` 55/56 / `driver_mapeditor_painting` 105/106
  - `driver_sce1_events` 211/214 / `driver_speech_v2` 45/46 / `verify_roll_target` 29/30 / `verify_walk_block` 22/23 / `probe_party_size` / `sweep_recruit_balance` / `probe_n4_stall`(exit 1 が健全な probe)
  - `driver_grid_p4` と、引数が要る probe 3 本(`probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map`)は exit 3
  - ⚠ #78 項目4 のとおり、griffon / roll_target / n4_stall / hobgoblin / chimera / kobold / speech_engine は**どちらの色にも転ぶ**。1 回の色で退行と決めない。
- ⚠ 本チケットも `index.html` と `tavern.html` の両方を変える ⇒ 149 本すべてが帰属の候補になる。項目4 では、影のツリー(`index.html` / `tavern.html` / `tools/verify_invisibility.js` を `cd32146` へ戻した実体コピー)と、`git` を読む本のための clone を交互に走らせて比べる(#78 の方式)。
  `--negative` の腕は「差分を含む関数の中にアンカーを持つ本」で、項目2 の差分が出てから選び直す。

### 12-1. 項目2 — 本番実装(基準 HEAD `677e4de`・`index.html` / `tavern.html` / `tools/verify_invisibility.js`)

- **差し込み**(行番号は実装後の `index.html`): 呪文 `"arcane-eye"` 22334 / 巻物 13614 / `isEyeOn` 13659 / `pickScrollId` の抽選 13746 / CSS `.dfArcaneEye` 3021・`#eyeScoutPanel` / DOM `#eyeScoutPanel` 3165 /
  本体 36828〜37085(`eyeHidesEnemy` 36835・`eyeReportText` 36857・`eyeGroupsLive` 36875・`eyeGroupsSlots` 36892・`eyeScoutedNodes` 36914・`takeArcaneEyeCaster` 36919・`renderEyeScoutPanel` 36934・`showArcaneEyeReport` 36975・`flyArcaneEye` 36987・`tryArcaneEyeOnEntry` 37023・`tryArcaneEyeAtExits` 37051)/
  口 ① `startGame` 14261 ② `enterNode` 37671 ③ `revealExitHints` 37155(眼の文を足す枝 37184〜37189)。
  `tavern.html`: `MAGE_SKILLS_UI` 4505 / `SCROLL_CATALOG_TV` 5357 / `SCROLL_DEV_SHELF_TV` 6862 / `isEyeOnTV` 6868 / `devShelfSwitchOnTV` 6872 / 書き換え行 6883 / changelog 1 行。
- 行末: 3 ファイルとも LF 単独 0(`index.html` 40440 行・`tavern.html` 11121 行は全行 CRLF / `verify_invisibility.js` は元どおり全行 LF)。
- 削除行は 4 行だけ(`pickScrollId` の `let pool` 行・`SCROLL_DEV_SHELF_TV` の宣言・§5-2 で許された 6870 行・changelog の最古の 1 件)。§3 の「1 バイトも変えない」シンボルの grep は 0 件。
- **使い捨て probe**(scratchpad `item2\probe_eye79.js`・自前サーバ 18991)34/34 PASS: (1a)(1c 神殿・沼地)(1d)(1f)(2a)(2b 両腕)(2c)(2d)(2e)(2f)(3a 入った時・出口の前)(3b autoplay 実走)(3c)(4b)(5a)(5b)(5c)(6b 素 7 種・`?eye=0` 6 種・uncommon 8 種)(7a)(7b)(7c)・`.noimg`(png を 404)と画像ありの両方・pageerror 0。
- **名指し golden 10 本 12 腕**(本番の作業ツリー・1 回): 全部 exit 0 で着手前と同じ件数。verify_invisibility 27/27・`--negative` 9/9(空振り 0・漏れ 0)/ verify_scroll_shelf 19/19・8/8 / graph_arrows 80 / graph_sce1 106 / graph_run 99 / graph_kinds 66 / graph_reentry 57 / dev_gate2 62 / action_priority 92 / party_match_setup 36。
  ⚠ git を読む 2 本は固定コミット(`54bb89a` 等)を `git show` するだけで HEAD を読まない ⇒ 本番の作業ツリー(それ自体が git リポ)で走らせた。影のツリーでは走らない点は変わらない。

#### 崩れた主張・補足(K7〜K12)— 仕様に響くもの 0 件

| K | 主張(依頼書) | 実測・実装 | 仕様に響くか |
|---|---|---|---|
| **K7** | §4-3 羊皮紙は「上 12%」 | `#dmMessage` は `top: 90px`・高さ約 60px ⇒ 800px 級の画面では 12% (96px) で一行と重なる。⇒ `top: 172px` に置いた | 響かない(§8 で測らない値・§9 で動かしてよい) |
| **K8** | §4-3 `.dfArcaneEye` に `transition: left/top 0.9s` | 眼は `flyArcaneEye` が毎フレーム `SX()/SY()` で置く(カメラ追従・`dfPlayCast` と同じ方式)。CSS の left/top の transition は rAF と喧嘩するので opacity だけにした | 響かない |
| **K9** | §4-5 ③「先のノードを全部覗く」 | 未発見の隠し扉(`doorHiddenAt`)の先は覗かない・報告しない(一行で道の存在を明かさない = `exitsWithReturn` と同じ扱い)。6 シナリオの本番グラフでは該当 0(沼地 n4 の 2 本とも false) | 響かない |
| **K10** | §4-4「2 つ目以降(最大 2 種まで)…3 種目以降は『ほかにも影がある』」 | 読みを 1 つに決めた: **名前を出すのは先頭 + 1 種 = 計 2 種**、3 種目があれば「ほかにも影がある」。ボスあり + 護衛 n=1 は「〈名前〉が 1 匹従っている」、護衛なしは「ただならぬ大きな影がひとつ」だけ。文は「。」でつなぎ末尾に「。」を付けない | 響かない(受入は同じ規則をドライバで組む) |
| **K11** | §8 (2a)「護衛 2 種の名前」 | 砦 n7 の護衛は orcBerserker 1・orcGrunt 1 ⇒ 実文は「ただならぬ大きな影がひとつ。オーク狂戦士が 1 匹従っている。オーク兵の姿もある」。出口の文は K5 のとおり二段(「地の底から重い足音が響く — 3 体ばかりの気配だ — ただならぬ…」) | 響かない |
| **K12** | §8 (1c)「沼地 n4 に若き蛇神司祭が出ない」 | 沼地 n7 の護衛 lizardPriest の名前は「蛇神司祭」で、隠し要素 swampNovice は「若き蛇神司祭」。部分一致で測ると n7 の報告(出口の前)で誤検知しうる ⇒ 受入は**全名**で n4 の入った時の報告を見ること | 響かない(受入の書き方) |

- ログの形: 入った時 `👁 〈術者〉 の魔法の眼 — 〈報告〉` / 出口の前 `👁 〈術者〉 の魔法の眼 — 〈DIR_LABELS〉 — 〈報告〉`(出口ごとに 1 行)。
- 羊皮紙の影絵の数 = `min(4, 種類)` + ボスありで丸い影 1(砦 n4 は 4 種 = 4 マス)。
- `executeSkillOn(ally, "mage", "arcane-eye", -1)` は元から偽(名指しの枝が無い)。

### 12-2. 項目3 — 新規受入 `tools/verify_arcane_eye.js`(基準 HEAD `15200f4`・本番ファイルは 1 バイトも触っていない)

- **assert 34 本**: §0 5 本 (0a)〜(0e) / §1 7 本 / §2 6 本 / §3 3 本 / §4 3 本 / §5 4 本 / §6 3 本 / §7 3 本。§8 の 33 節に、装置として (0e) を 1 本足した。(0e) は 2 腕。画像あり ⇒ `.noimg` が付かず報告が届く / png を 404 ⇒ `.noimg` の光の玉で飛び、報告が届き、眼が残らない。どちらも `__autoplay = 1` で眼を実際に飛ばす。
- ページは index 11 枚と tavern 4 回。index は砦 8 枚・沼地・神殿・`?autoplay=10` の実走 1 枚。tavern は開発 / 非開発 / `?eye=0` / `?invis=0`。
  報告の文は**ドライバ側で §4-4 + K10 の規則から組む**。`RUN.byId[id].mapDef.rooms[].enemySlots[][2]` と `ENEMY_TYPES` の生の旗をドライバ自身が数え、ページの答えと突き合わせる(ページの `eyeGroups*` / `eyeReportText` は答え合わせに使わない)。
- **変異 10 本**(port 10504〜10513・base 10503)。アンカーはすべて**眼の側の行**から取った(罠E)。起動時に自己検査で 3 点を確かめる:
  - #78 のアンカー 11 本と `noimmediate` のアンカーに、1 本も重ならないこと
  - 原本での出現回数が期待どおりであること
  - 行数が変わらないこと

  注入行は `__MUTHIT__` を持ち、欠陥が効く枝でだけ鳴る。`--negative` は「注入行が実行された」と「赤の集合 = 担当」の完全一致の両方を要求する。

| 変異 | 注入(アンカー = 眼の側の行) | §8 の予想 | **実測の担当** |
|---|---|---|---|
| `fogtouch` | `const dest = target \|\| from;` の後に、術者 → 行き先の線分が通るタイルを `exploredTiles` に 1 にする行 | (3a) | (3a) |
| `nopause` | `prevSk/prevDp` + `skillCheckActive = true; dialogPaused = true;` の 2 行(2 か所)から `dialogPaused` を抜く | (3b)(1f) | (1f)(3b) |
| `nodestate` | `eyeScoutedNodes.add(ex.to);` の後に `nodeStateFor(ex.to)` を足す | (2d) | (2d) |
| `rollanyway` | `if (eyeByExit) tier = "crit";` を外す | (2b) | **(2a)(2b)(2c)** |
| `invisoff` | tavern の `const dev = … devShelfSwitchOnTV(id);` を `isInvisOnTV()` へ | (7c) | **(7b)(7c)** |
| `spoilhidden` | `eyeHidesEnemy` の 2 行を常に false | (1c) | (1c)。ただし **K13** で (1c) を強めた後 |
| `bossname` | ボスの判定 2 か所と `bossSlot` で名前を持ち回り、文の頭に置く | (1a)(2a) | **(1a)(2a)(2c)** |
| `recast` | 入った時・出口の前の `eyeScoutedNodes.has` を見ない | (1d)(2e) | (1d)(2e) |
| `nooutofcombat` | 眼の 2 行版 `range: "self",` + `outOfCombat: true,` | (4a)(4c) | (4a)(4c)。(4a) は `executeSkillOn` へ届いた回数で見る(#78 K9) |
| `leakdev` | tavern の眼の巻物の行で、開発モードでない時だけ `rarity` を `"common"` に化けさせる(**K16**) | (5b) | (5b) |

#### 崩れた主張・補足(K13〜K19)— 仕様に響くもの 0 件・本番の不具合 0 件

| K | 主張(依頼書) | 実測・受入での扱い | 仕様に響くか |
|---|---|---|---|
| **K13** ⚠⚠ | §8 (1c)「神殿 n4 の報告にカエルム、沼地 n4 の報告に若き蛇神司祭が出ない」で変異 `spoilhidden` が赤くなる | **空振りした**(注入行は 8 回実行・赤 0)。本番の 2 部屋では、隠し要素は**出現順で 5 種目**にあたる(沼地 = raider / warrior / hunter / priest の後、神殿 = zombie / wraith / skeletonArcher / skeleton の後)。文に名前が出るのは 2 種まで、影絵は 4 マスまでなので、除外をやめても**画面には原理的に出ない**。⇒ (1c) を強めた。報告の材料(`eyeGroupsLive()` の種類と数)と影絵の各マス(「×n」と、マス i の絵 = i 番目の種類の絵)を、ドライバの数えと突き合わせる | 響かない(今の部屋では漏れても見えない)。ただし種類の少ない部屋に隠し要素を置けば見えるので、守る価値はある |
| **K14** | (暗黙)影絵の絵で隠し要素を見分けられる | `swampNovice` の `sprite` は `lizardPriest` と**同じ絵**(`assets/lizardPriest_anim.png?v=2`)。⇒「隠し要素の絵が無い」とは書けない(そう書いたら素で赤くなった)。⇒ 正の一致(マス i の絵 = i 番目の種類の絵)にした | 響かない |
| **K15** | §8 (0d)「HEAD `620b844` と同じ回数」 | 受入は git を読まない(影のツリーで走らせるため)。代わりに、`verify_invisibility.js` の変異表の `count`(= 要求回数。§12-0 で `620b844` の実測と全部一致を確認済み)と、`driver_graph_sce1.js` の `noimmediate` を**ソースから正規表現で引いて**基準にした(12 本・`1,…,1,2,1`) | 響かない |
| **K16** | 項目2 の申し送り「leakdev のアンカー = `const dev = …` か `if (id === "scroll-arcane-eye") return isEyeOnTV();`」 | どちらの行も `scrollShelfIdsDev` の中にあり、**開発モードでしか通らない**。開発モードでないときに通る行は、#78 の `if (DF_DEV_MAGIC_SHOP) return scrollShelfIdsDev();` と #77 の common の filter だけで、どちらも他ドライバのアンカー。⇒ 申し送りの 2 行では「開発モードでなくても並ぶ」という欠陥を注入できない。⇒ tavern の眼の巻物の行(`SCROLL_CATALOG_TV`)を使い、開発モードでない時だけ `rarity` が `"common"` になるようにした | 響かない |
| **K17** | §8 (1e)「`partyComposition` を仕込んで読み込み直す」 | 読み込み直さずに、`leaderClassKey = "mage"` と `currentSpellSlots["arcane-eye"] = 1` を代入した(#78 の (1f) と同じ経路。`takeArcaneEyeCaster` は `hasSpellSlot("player")` と `getLeaderName()` を読む)。ログは「👁 あなた の魔法の眼 — …」 | 響かない |
| **K18** | §8 (1a)「砦 n4 …**ボスの名前が出ない**」で変異 `bossname` が赤くなる | 砦 n4 には**ボスが居ない** ⇒ n4 だけでは空振りする。⇒ (1a) に、口②(`enterNode`)で**まだ覗いていない** n7 へ入る腕を足した。実際の報告は「ただならぬ大きな影がひとつ。オーク狂戦士が 1 匹従っている。オーク兵の姿もある」で、ボスの名前は出ない | 響かない |
| **K19** | 担当表(§8)= 予想どおりに赤くなる | 担当が広がった(#78 K10 と同じ型)。`rollanyway` +(2a)(2c)(tier が crit でなくなる)/ `invisoff` +(7b)(`?eye=0` でも透明化のスイッチを見るので、眼が並ぶ)/ `bossname` +(2c)(沼地 n7 もボス部屋)。⚠ **非決定**: 1 回目の `--negative` では、`rollanyway` の (2a) が緑に転んだ。本物の出目で自然の crit を引くと tier が "crit" になるため。⇒ 出口の腕(砦 A・沼地 E)は `resolveSkillCheck` を決め打ち(crit でない成功)にした。素の実行では眼が唱えるので判定は 0 回 = 決め打ちは変異のときにしか効かない | 響かない |

- 測り方の補足:
  - (3a) は、2 つの `Uint8Array` 行の配列について全バイトの FNV hash と 1 の個数を見る(K1)。砦 n4 = `95/2016`・`90/2016` で、入った時・出口の前とも前後で一致した。
  - (3b) は `?autoplay=10` の実走。`tryArcaneEyeOnEntry` を包み、報告の瞬間と詠唱の終わりの瞬間について `dialogPaused` / `encounterActive` / `playerX/Y` を見る。
- **走らせ方**: PowerShell から `node tools/verify_arcane_eye.js`(素)/ `--negative`(素の基準 + 変異 10 本)/ `--mutate <key>` / `--skip-6c`。
- **所要**(この機械・PowerShell):
  - 素 = **約 65 秒**(うち (6c) の入れ子 `verify_invisibility --negative` が約 42 秒、本体は約 23 秒。1 回だけ 182 秒 = 機械の揺れ)
  - `--negative` = **285〜403 秒**
- **決定性**: 素 3 回 = 34/34 ×3 / `--negative` 2 回 = 10/10 ×2(空振り 0・漏れ 0)。ログは scratchpad の `item3\base.r*.log` / `neg.r*.log`。
- ⚠ **git**: 本体は git を読まない。ただし (6c) の入れ子(`verify_invisibility` → `verify_scroll_shelf`)は `git show` を読む ⇒ **影のツリーでは (6c) だけが赤くなる**。項目4 の対比較では、clone で走らせるか、影のツリー側は `--skip-6c` で走らせて (6c) を除いて比べること。
