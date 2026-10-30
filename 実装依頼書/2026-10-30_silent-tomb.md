# #105 新しい行き先「沈黙の墓所」— 湖の小島に眠る古の魔法使いの墓へ(推奨 Lv5・森の後・本筋の外)

- **起草**: 2026-10-30(起草窓) / **ステータス**: **承認済**(2026-10-30 ユーザー承認・承認ダイアログで「動く鎧をリアルな D&D 風に」の追加指示を反映済み)
- **着手**: ✅ **着手できる**(2026-10-30 素材 3 本とも納品・起草窓が受け取りの目視と検算まで済ませた = §2-10。⚠ マミーは v2 のフォルダを使う・2 体とも縁のマゼンタは「このまま使う」= 床の上で目視して記録)
- **基準 HEAD**: `2e2e291`(#104 完了・origin と同期。⚠ 着手時に必ず測り直すこと)
- **会議**: `dev-meetings/2026-10-28_new-locations.md` の第1段 候補②(第2段の計画書は無い → §1 の表のユーザー決定 2026-10-30 が代わり)
- **手順の型**: `実装依頼書/_TEMPLATE_new_location.md`(本書はそれを写して埋めたもの・#104 の学び込み)
- **触るファイル**: `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `world.html`(撤退スイッチの読み取り 1 箇所だけ)/ `tools/make_grid_map.py`(台帳 2 行)/ `tools/codex1_sprites.json`(台帳 2 行)/ `assets/`(焼き上がり 2 枚 + マミーと墓所の動く鎧のシート)/ 既存 golden の言い直し / `tools/verify_silent_tomb.js`(新規)/ `js/changelog.js`(ヘルパー経由)
- ⏸ **着手の前提 = 素材 3 本の納品**(§2-10)。起草時点では地図 2 枚もマミーと動く鎧の新しい絵も**無い**。起草窓が codex1 への依頼文 3 本を起草済み(承認後に投下)。⛔ **既存の地図・既存の絵を仮に借りて先に進めない**(#103 のユーザー決定「ダンジョンは新規で」を引き継ぐ)。
- 並走: なし(2026-10-30 起草時の `git status` は clean)

---

## 1. 目的

ワールドマップの行き先を、D&D らしい依頼で 1 か所ずつ増やす方針の **3 か所目**(順番 = ① コボルドの巣穴 ✅ → ③ 倉庫街の教団 ✅ → **② 湖の島の墓所** → ④ 湖畔の魔女)。型は「**罠の墓所**」。

> 湖の渡し守が酒場に来る。「北の小島の墓所に、夜になると青い灯がともるんです。墓荒らしが三人、舟を借りて渡ったきり戻らない。島へ渡る舟は出します……ですが、あそこの入口には『眠りを妨げる者に沈黙を』と刻まれているんです」
> 舟で小島に渡ると、碑文の刻まれた石の扉。中は罠の仕掛けられた前室と、主を守り続ける動く鎧の回廊。最奥の玄室では、包帯に巻かれた古の魔法使いが、石棺から身を起こす。

罠の解除と探索判定が主役になる、初めての場所(会議 第1段 ガイウス案)。ノエルの懸念「罠を並べすぎない」に従い、**罠は部屋ごとに 1 つ**・**入口の碑文で警告する**。

**ユーザー決定(2026-10-30・AskUserQuestion 4 問。すべて推奨案)**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 置き場所 | 本筋の外(`side: true`)。**`lake_n`(湖の北)を拠点「湖の北の島」へ格上げ** | — (会議で決定済み) |
| 解放と推奨 Lv | **森の後・推奨 Lv5**(`locked: true` + `unlockAfter: "bandits-forest"`。沼地と同時に解放)= Lv2 巣穴 → Lv4 倉庫街 → **Lv5 墓所** の階段 | 沼地の後・Lv6 / 廃坑の後・Lv4(Lv4 に AC18 の動く鎧は硬すぎるおそれ) |
| ダンジョン | **地図 2 枚とも新規**(墓所の前室 → 魔法使いの玄室) | ⛔ 既存の地図を借りる(#103 の決定を引き継ぐ) |
| ボス | **新しい絵の「マミー」1 体**(5e SRD Mummy・CR3。codex1 へ発注)= 包帯を巻いた古の魔法使いの亡骸 | ワイト(騎士寄り)/ 既存のレイス(神殿の雑魚として出ている) |
| ボスの特別な行動 | **「恐怖のまなざし」= SRD の Dreadful Glare**(1 戦闘 1 回・1 人へ WIS セーヴ → 失敗で恐怖、5 以上の差で失敗なら 1 手番の行動不能) | 腐れの拳(回復できない呪いの仕組みが新規)/ 特別な行動なし |
| 手下 | **動く鎧・ガーゴイル・骸骨**。ガーゴイルと骸骨は既存の絵 | ミミックを入れる(ドラゴンの巣の隠し要素「宝箱が化ける」の驚きを守る)/ 石の軍団兵(砦の隠し要素の顔) |
| 動く鎧の絵(承認ダイアログでの追加指示) | **「もっとリアルなダンジョンズ&ドラゴンズ風に」= 新しい絵を codex1 へ発注**(5e SRD Animated Armor = 誰も着ていない空っぽの板金鎧)。既存のデフォルメの騎士の絵(`assets/animatedArmor_anim.png`)は墓所では使わない | 既存の絵のまま |

---

## 2. 着手前の実測(基準 HEAD `2e2e291`)

### 2-1. ⚠⚠⚠ `lake_n` は**通り道の途中**(倉庫街・塔は行き止まり、巣穴と同じ型)

| 実測 | 出所 |
|---|---|
| `lake_n: { kind: "way", x: 736, y: 288 }`。辺は `["farm_n", "lake_n"]` と `["lake_n", "lakeside"]` の **2 本** = 通り抜けの点 | `js/world-map.js:87` / `:102` |
| 港町から廃坑・地下神殿へ向かう経路が `lake_n`–`lakeside` を通る(`findPath("phlan","temple")` は lake_n-lakeside を通る側) | `tools/verify_world_steps.js:519` の注記 |
| 拠点の入場は**「押した行き先へ着いたとき」だけ**(`onArriveStep` → `arrived && WM.has` → `onArriveNode`)= 通り過ぎても入場ダイアログは開かない | `world.html:1503-1517`(#104 §2-1 で実測済み・着手時に測り直す) |
| `isRoadSite(id)` = `kind === "site"` なら街道の出来事も襲撃も**出さない**(`maybeRoadEvent` / `maybeRoadAmbush` の門) | `world.html:1325` / `:1333` / `:1428` |
| `js/road-events.js` の `WAY_TERRAIN.lake_n = "lake"`(拠点になっても刻み点の地形を引くのに使う) | `js/road-events.js:47` |

⇒ 3 つの帰結:

1. **通り過ぎても入場ダイアログは開かない**(巣穴 `village_s` と同じ)。⚠ ただし廃坑・神殿へ向かう**本筋の経路の真ん中**にある点はこれが初めて。§8 (1g) で「廃坑へ向かう途中に lake_n を通っても開かない / lake_n を押して着いたら開く」の反転を機械で確かめる。
2. ⚠⚠ **`lake_n` の停留所で街道の出来事・襲撃が起きなくなる**(`kind: "site"` にした瞬間から。依頼が未解放で札が出ていない間も)。湖の地形の停留所は lake_n–lakeside の刻み点 2 つ(`lake_n__lakeside@1` / `@2`)と `lakeside` が残る。巣穴(`village_s` = 沼地の地形)と同じ扱いで、**受け入れる**(⛔ `js/road-events.js` は触らない)。`verify_road_events` の恒等ハッシュは言い直しが要る(§8 既存 golden)。
3. ⭐ **島はこの点の南にある**: `assets/world_region.jpg` を (560,140)-(920,440) で切り出して目視 = `lake_n` (736,288) は**湖の北岸の草地**、小島は南へ約 90px の湖の中 (≈ 725,375)。⇒ 拠点は「北岸の渡し場」で、島へは舟で渡る(語りで吸う)。⛔ ノードの座標は動かさない。

### 2-2. ⚠ 札と主人公の重なり — 北の刻み点に立つと札を隠すかもしれない

札は足元から上へ 76px の位置に出る(札の下端 = ノードから −98px・`world.html:352-358`・#104 §2-2)。`lake_n` の札は机上で x ≈ 736 中心・y ≈ 143〜190。

| 近くの立ち位置 | 座標 | 机上の見込み |
|---|---|---|
| `lake_n` に立つ | (736, 288) | 札は自分の真上 = 他の拠点と同じ(問題なし) |
| `farm_n` → `lake_n` の辺の刻み点 | 辺 `farm_n`(608,224)–`lake_n` は刻み点の一覧(`js/world-map.js:287-291`)に**無い** | 刻み点は無い = 立ち止まらない |
| `farm_n__pass_n@1` | (672, 160) | ⚠ 78px 角の主人公が x 633〜711・y 121〜199 = 札の**左端に掛かる見込み** |
| 見張りの塔 `pass_n` の札 | (736, 96) の上 | 縦に 40px 以上離れる見込み(机上) |

⇒ **項目1 で実ブラウザで測る**(#104 §12-1 (2) の型: 主人公の箱と札の `getBoundingClientRect()` の交わり率・札どうしの交わり面積・1440x900 と 390x844)。主人公が札を大きく覆うなら**墓所の側に** `signDx` を足す(⛔ 他の拠点の `signDx` は動かさない)。§8 (1f) が「札どうしの交わり 0」を縛る。⚠ 390 幅で札が画面外に出ないかも同時に記録する(#104 の倉庫街で踏んだ)。

### 2-3. 新しい行き先を足す口(全数・`lost-cargo` の足跡を今の行番号で数え直した)

`grep -n "lost-cargo\|plaguePriest\|lostCargo\|LostCargo\|retireCargo\|cargo=0"` を手順の型 §1 の 8 ファイルにかけた結果(2026-10-30・`2e2e291`):

| 場所 | 何 | 本件 |
|---|---|---|
| `index.html:3749` `ROAD_CHEST_GOLD` | 消えた隠し宝箱のぶんの金貨 | 要: `"silent-tomb": 75`(隠し 3 × 25) |
| `index.html:4069` `SCENARIO_TEX` | 床と壁(無い id は廃坑へ落ちる) | 要(絵の下に敷くだけ。`床1.png` / `壁1.png` でよい) |
| `index.html:4701` `NODE_EXTRA_SPAWN_KINDS` | ⚠ 宣言しないと罠と宝箱が**黙って 0** | 要: `t["silent-tomb"] = { n0: ["search", "loot"], n1: ["search"] };` |
| `index.html:6850` `ROOM_PAINTINGS_DEF` | 大部屋の絵 + MASK。`node: true` | 要: `n0big` / `n1big`。⭐ **2 枚とも屋内**(`outdoor` を付けない = 霧が効く) |
| `index.html:10557` `ENEMY_TYPES.plaguePriest` | ボスの型 | 写し元(§5-2) |
| `index.html:10576` `skeleton` | 手下の型 | **触らない**(そのまま使う) |
| `index.html:10899` `animatedArmor` / `:10950` `gargoyle` | 砦の守護者の型(`faction: "beast"` + `startsDormant`) | **触らない**。写し元にして墓所専用の `tombArmor` / `tombGargoyle` を足す(§2-12・§5-2b) |
| `index.html:13498` / `:13500` `enemy.cry.animatedArmor` / `.gargoyle` | 鳴き声 | 要: `tombArmor` / `tombGargoyle` の鍵を**同じ行の参照**で足す(⛔ 文言は新しく書かない) |
| `index.html:29934` `ENEMY_TRAITS.animatedArmor`(眠り免疫) | 体質 | 要: `tombArmor` に同じ 1 行(構造体 = 眠りに免疫) |
| `index.html:11827` `SCENARIOS` | 依頼の数値 | 要(§6) |
| `index.html:15793` `SCENARIO_NARRATIONS` | 開幕の語り 4 行 | 要(§6) |
| `index.html:18734-18739` 検証シーム `__lostCargoTV` | ドライバ用の窓 | 要: `__silentTombTV`(同じ形) |
| `index.html:22466` `sovereignFearEye(enemyIdx)` | 単体の WIS セーヴ → 恐怖 | **写し元**(§5-3) |
| `index.html:22720` `inflictWoundsTouch(enemyIdx)` | ボスの手番の特別行動・probe の型 | 写し元(probe・語りの型) |
| `index.html:27624` `TRAP_TYPES` | 罠の語り | 要: `dart` / `glyph` の 2 行(§5-4) |
| `index.html:29963` `LORE_SKILL_OF` | 伝承の技能 | 要: `mummy: "religion"`(アンデッドの並びと同じ)・`tombArmor: "arcana"` / `tombGargoyle: "arcana"`(元の 2 種と同じ) |
| `index.html:30002` `LORE_CR` | 5e SRD の CR | 要: `mummy: 3`(⭐ SRD に元がある = `raw/srd/monsters/mummy.md` の cr 3)・`tombArmor: 1` / `tombGargoyle: 2`(元の 2 種と同じ SRD の CR) |
| `index.html:37387-37392` 傷を腐らせる手の入口(ボスの行動選択の前) | | 要: 同じ位置に 1 ブロック(§5-3) |
| `index.html:40802` `buildScenarioRun` の振り分け | ⚠ 行を縦に揃え直さない | 要: 1 行 |
| `index.html:42085` `buildLostCargoRun()` | `p6Node()` 2 回 | 写し元(§5-5) |
| `tavern.html:3795` `scenarios` | 卓の依頼 | 要(§4-1)。写し元は倉庫街(`locked: true` + `unlockAfter` の型) |
| `tavern.html:3837-3847` 撤退 `?cargo=0` | | 写し元(§7) |
| `js/world-map.js:87` `NODES.lake_n` | 中継点 | 要: `kind: "site"`・`label`・`desc`(⛔ id・座標・`EDGES` は変えない) |
| `js/world-map.js:177` `SITES` / `:196` `UNLOCK` / `:406` `retireCargo` / `:419` 公開 | | 要: 1 行ずつ + `retireTomb()` |
| `js/world-map.js:42` 札の数のコメント「ちょうど 10 個」 | | 要: 11 へ |
| `js/df-mapdef.js:54` `THEMES` / `:1897` `THEME_DEFAULT_ENEMIES` / `:2166` `LINT_PAINTING_ASPECTS` | | `THEMES` 要・`THEME_DEFAULT_ENEMIES` 推奨・縦横比は焼き上がりしだい(24x16 = 3:2 なら**在庫の 9x6 と同じ比** = 足さない) |
| `world.html:675-678` 撤退 `?cargo=0` | | 要: `?tomb=0` を隣へ 1 行 |
| `tools/make_grid_map.py:497` / `:521` `GRIDS` | | 要: 2 行 |
| `tools/codex1_sprites.json:245` | | 要: 2 行(`mummy` / `tombArmor`) |

⚠ BGM は全シナリオ共通(`sceneBgmTrack()`)= **作業なし**。⚠ `detectEnemyFamily` の `t === "skeleton" || t === "zombie" || t === "wraith"`(`index.html:15563`)にマミーを足すかは §5-2(⛔ 新しい台詞は足さない)。

### 2-4. ⚠⚠⚠ 罠の 3 つの落とし穴(手順の型 §4)— 本件での当てはめ

1. **罠は戦闘中に発動しない**(`checkTrapTrigger` が `encounterActive || encounterRunning` で return)⇒ マミーの「恐怖のまなざし」は罠ではないが、**ボスの手番の行動として作る**点は同じ(§5-3)。
2. **罠の数はノードごと**: `trapCount: 1` + n0・n1 の両方に `search` = 部屋ごとに 1 つ。種類は `trapTypeByNode: { n0: "dart", n1: "glyph" }`。どちらも**語りだけの新しい行**(ダイス・解除 XP は `damage` と同じ)。⛔ `Math.random` を 1 つも足さない・減らさない。⛔ 新しいダイスを足さない(Lv5 に 1d6 は軽いが、ダイスを変えると罠を踏んだ後の乱数列がずれる = 型の決まり。罠の重さは会議の合意どおり「数ではなく見せ方」)。
3. **開始直後の卓は変わらない**: `locked: true` で足すので、開始直後の解放済みは「廃坑 + 巣穴」の 2 件のまま。`cleared=[廃坑]` の世界(廃坑・森・巣穴・倉庫街 = 4 件)も**変わらない**。
   ⚠ **変わるのは `cleared=[廃坑, 森]` の世界**: 解放済みに墓所が 1 件増える(本筋 = 沼地 + 残りからの抽選・`tavern.html` `drawBoard`)。⇒ 森をクリアした盤面の件数や抽選を縛る golden は言い直しが要る(§8 既存 golden・項目4 の全数走査で拾う)。

### 2-5. 解放の鎖と数値の帯

| 実測 | 出所 |
|---|---|
| 推奨 Lv の帯: 廃坑 3 / 森 4 / 沼地 5 / 砦 6 / 塔の母 7 / 巣穴 2 / 倉庫街 4 | `tavern.html:3626` / `:3649` / `:3669` / `:3689` / `:3755` / `:3778` / `:3800` |
| 森: `perceptionDC 14`・`trapCount 4`・`hiddenChestCount 3`・`clearXp 500` / 沼地: 15・4・3・700 / 倉庫街: 13・1・2・400・`clearGold 200` | `index.html:11666-` / `:11694-` / `:11827-` |
| `ROAD_CHEST_GOLD`: 森 75 / 沼地 75 / 塔の母 75 / 巣穴 50 / 倉庫街 50 | `index.html:3740-3750` |

⇒ 墓所は `unlockAfter: "bandits-forest"`・`recommendedLevel: 5`。数値は「沼地と同じ帯の本筋外・**探索判定が主役**」を出発点にする(§6: `perceptionDC 15`・隠し 3)。

### 2-6. マミーと手下の型

| 実測 | 出所 |
|---|---|
| 5e SRD **Mummy**: CR3・AC11(天然)・HP58(9d8+18)・歩行 20ft・STR16 DEX8 CON15 INT6 WIS10 CHA12・**Rotting Fist** +5(2d6+3 殴打 + 3d6 死霊 + 呪い)・**Dreadful Glare**(60ft・1 体・**WIS DC11** → 失敗で次の手番の終わりまで恐怖、**5 以上の差で失敗なら麻痺**も)・火に弱い・非魔法の武器に抵抗・死霊/毒に完全耐性・恐怖/麻痺/魅了に免疫 | Dropbox `raw/srd/monsters/mummy.md` |
| `animatedArmor`: HP33・AC18・atk+4・1d6+2・XP150・sheet 576x480・96px 6 列・`displaySize 78`・`ENEMY_TRAITS` で眠り免疫・`LORE_CR 1`。⭐ **どのシナリオの `spawns` / `slots` にも出てこない**(定義・掛け声・体質・伝承の 4 か所だけ)= 本件が初登場 | `index.html:10899` / `:13498` / `:29934` / `:30005`・`grep -n animatedArmor` |
| `gargoyle`: HP42・AC15・atk+4・1d8+2・XP280・`displaySize 80`。砦の隠し要素(古代王国の守護者)で休眠 `inactive` の 2 体として出る | `index.html:10950` / `:11738` / `:41648` |
| `skeleton`: HP12・AC15・atk+3・1d6+1・XP150・`displaySize 72`・`undead: true`。地下神殿の雑魚 | `index.html:10576` |
| `plaguePriest`(#104 のボス): HP33(SRD 22 × 1.5)・AC13・`displaySize 100`・XP450・`inflictAtk 3 / inflictDice "3d10"` | `index.html:10557-` |
| `verify_lore_check` の固定数: `N_TYPES = 51+2+1+1`(=55)・`N_SKILL = 40+2+1+1`(=44)・`N_NATURE = 11`・`N_CRKEYS = 34+2+1`(=37)・`N_NOCR = 17+1`(=18) | `tools/verify_lore_check.js:133` |

⇒ マミー `mummy` は **SRD の Mummy をもとにしたボス**。`LORE_CR` に載せる(3)= #76 の決まり。`LORE_SKILL_OF` は `religion`(既存のアンデッド `skeleton` / `zombie` / `wraith` と同じ・`index.html:29975`)。
⇒ `ENEMY_TYPES` は **3 キー**増える(`mummy` / `tombArmor` / `tombGargoyle`・§2-12)。3 つとも技能あり・CR あり ⇒ `verify_lore_check` は **58 / 47 / 11 / 40 / 18** へ言い直す(項目2 で数え直してから)。

⭐ 既存の動く鎧の絵(`assets/animatedArmor_anim.png` 576x480 RGBA)を暗い床色の上に 2 倍で目視(2026-10-30): デフォルメの頭身の、顔のある銀の騎士(青い目・盾と剣)。⇒ ユーザー指示「もっとリアルな D&D 風に」で**新しい絵を発注**する(§2-10)。⚠ 初登場なので、項目2 の煙検査で新しい絵の**歩き・攻撃・倒れ**を一度は画面で見る。

### 2-12. ⚠⚠⚠ 動く鎧とガーゴイルの定義は**砦の守護者**のもの — そのまま置くと墓所が壊れる

| 実測 | 出所 |
|---|---|
| `animatedArmor` / `gargoyle`(と `stoneGolem` / `stoneLegionary`)は **`faction: "beast"` + `startsDormant: true`** = 砦の隠し要素「古代王国の守護者」(fort-golems.md)の定義 | `index.html:10913-10915` / `:10967-10969` |
| **`initGuardians()` は全シナリオの開始時に呼ばれる**(シナリオ判定なし)。`startsDormant` の敵を `inactive` + `dormant` にし、石化の見た目を付ける | `index.html:38407` / `:26700-26711` |
| 近づくと `awakenGuardians()`: バナー「⚙ 古代王国の守護者、起動! ⚙」と「守護者は**敵味方を問わず**、この間のすべてを敵と見なした」の語り | `index.html:26714-26754` |
| `faction: "beast"` = **第三勢力**: 非 beast の敵(骸骨・マミー)と相互に敵対する・群れ戦術の味方に数えない・中ボス扱い(`isMidBossEnemy` = 中ボスの BGM 判定)・魔法の眼に映らない | `index.html:29466-29480` / `:29377-29383` / `:15683` / `:39552` |
| 敵の鳴き声は `"enemy.cry.<type>"` を個別に引き、無ければ汎用(「グアアッ!」)へ落ちる | `index.html:13467-13469` |

⇒ 墓所で `animatedArmor` / `gargoyle` をそのまま置くと、①入った瞬間に石化して休眠し(⛔ 休眠する敵を大部屋へ置くとクリア不能になる前例)、②近づくと砦の語りが出て、③起きた鎧とガーゴイルが**マミーや骸骨と殴り合う**。
⇒ **墓所専用の型を 2 つ足す**: `tombArmor`(墓所の動く鎧・新しい絵)と `tombGargoyle`(墓所のガーゴイル・既存の絵)。どちらも元の定義を写し、**`faction` と `startsDormant` を持たない**普通の敵にする。⛔ 元の `animatedArmor` / `gargoyle` は 1 バイトも変えない(砦の隠し要素が使う)。
⇒ この罠は**変異 `useguardian`**(墓所の slots に元の `animatedArmor` / `gargoyle` を置く)で `--negative` に内蔵する(§8)。

### 2-7. ⚠⚠⚠ 恐怖の器の罠 — `fearDC` を名乗ると戦闘開始時に全員が判定する

| 実測 | 出所 |
|---|---|
| **戦闘開始時に 1 回、`def.isBoss && def.fearDC` を持つボスがいれば、パーティ全員が WIS セーヴ**(`partyWillSave(fb.def.fearDC)`)= ドラゴンの威圧(Frightful Presence)の器 | `index.html:23487-23496` |
| 単体の恐怖は単眼の暴君の `sovereignFearEye(enemyIdx)`(`def.fearEyeDC`・`fearEyeDurationTurns`)。狙い `pickEnemyTarget`・免疫は `playerFearImmune()` / `allyFearImmune(a)`(神殿の加護・恐怖免疫の効果・自由行動の指輪)・付与は `frightenedRemaining` / `frightenedPenalty`。敵(第三勢力)には効かない | `index.html:22466-` / `:22181` / `:22184` |
| 恐怖の既定: `FRIGHTENED_DURATION = 3`(3 手番)・`FRIGHTENED_PENALTY = 2`(攻撃ロール −2) | `index.html:22166-22167` |
| 行動不能: **主人公は `playerBuffs.skipNextTurn`(bool)**・**仲間は `a.stunned`(数)**。⚠ 仲間の `stunned` は眠りと同居し、`a.buffs.sleepWatchHp` が「眠り由来」の唯一の印 | `index.html:24673-24677` / `:22413-22424` / `computeDisplayList` |

⇒ まなざしの値は **`glareDC` という新しい名前**で持つ(⛔ `fearDC` を付けると、まなざしとは別に**戦闘開始時の全体恐怖**が黙って起きる)。⛔ `fearEyeDC` も流用しない(暴君の名前 = 「マミーだけ」が `grep` で言い切れなくなる)。この罠は**変異 `usefeardc`** で `--negative` に内蔵する(§8)。
⇒ 行動不能は主人公 = `skipNextTurn = true`・仲間 = `stunned = max(stunned, 1)`。⛔ 仲間に `sleepWatchHp` を書かない(書くと「眠り」扱いになり、殴られて起きる)。

### 2-8. 推奨 Lv と仲間の Lv

`questLevelOf()` が `recommendedLevel` を返し、仲間の Lv はその帯から振られる(#72)。⇒ 推奨 Lv5 なら仲間も Lv5 前後。
⚠ 前の 2 か所は**どちらも甘め**だった(#103 Lv2 で 10/10 クリア・被害ほぼ無し / #104 Lv4 で 10/10 クリア・倒れた人 0)= ユーザー判断待ち。⇒ 本件は出発点を**前の 2 件より一段重く**置く(マミー HP は SRD × 1.5 = 87・玄室の手下 3 体)。⑤ で測ってユーザーが判断する(⛔ 実装窓が勝手に値を動かさない)。

### 2-9. 名指しで色を控える既存 golden(着手前に実走)

- `grep -l -E "lost-cargo|SITES|boardFacts|nextLocked" tools/verify_*.js tools/driver_*.js` = **17 本**(2026-10-30): `verify_dragon_fold` / `verify_kobold_warren` / `verify_lost_cargo` / `verify_quest_draw` / `verify_quest_visibility` / `verify_quest_walk` / `verify_road_ambush` / `verify_road_boon` / `verify_road_events` / `verify_swamp_novice` / `verify_tavern_map` / `verify_tower_mother` / `verify_tower_mother_b` / `verify_world_heromark` / `verify_world_map` / `verify_world_steps` / `driver_mapeditor_painting`
- `lake_n` を名指しする本: `verify_world_steps`(変異 `handcoord` / `nodemut` が `lake_n__lakeside@1` を握る)/ `verify_quest_walk`(865 行の注記)— ⭐ 本件で一番動きうる
- 敵の在庫: `verify_lore_check` / 地図と lint: `driver_graph_p6`
- 件数系(#103 で名指しの外から見つかった本): `verify_party_four` (0a) / `verify_plaza_map` (5a)。⭐ `verify_counterspell` (4c) / `verify_run_chronicle` (0c) の「HP を引く点」と `driver_cleanup_phase1` (D4) の `MSG_DEFEAT` は、まなざしが**ダメージを与えない**ので増えない見込み(着手時に確かめる)
- ⭐ 母集団の全数は、いつもどおり項目4 の全数走査で拾う

### 2-10. 素材(起草時点で 0 本・起草窓が依頼文 2 本を起草済み)

| 素材 | 依頼文 | 納品先(codex1) |
|---|---|---|
| 地図 2 枚(墓所の前室 → 魔法使いの玄室) | `codex1/requests/2026-10-30_silent-tomb-maps.md` | `assets/maps/tomb-hall-v1.png` / `tomb-crypt-v1.png` + 各 `-nogrid` |
| マミー(walk 6 + attack 6) | `codex1/requests/2026-10-30_tomb-mummy.md` | `assets/tomb-mummy/tomb-mummy-walk-attack-right-6-aligned/` |
| 墓所の動く鎧(walk 6 + attack 6・リアルな D&D 風) | `codex1/requests/2026-10-30_tomb-armor.md` | `assets/tomb-armor/tomb-armor-walk-attack-right-6-aligned/` |

**納品の記録(2026-10-30 起草窓)** — ⭐ 3 本とも納品済み:

| 素材 | 置き場(codex1) | 起草窓の実測 |
|---|---|---|
| 墓所の前室 | `assets/maps/tomb-hall-v1.png` + `-nogrid`(1536x1024) | ⚠ read-only の下見は格子の合成と保存ができず → 本番 322 秒。本命と `-nogrid` の差分 **79015 画素・格子位置の外 0**・線の明度 15.3 < 格子無し 28.0(暗い線)⇒ **(0, 0) / 64.000 / 24x16** で焼ける。目視 = 西の霧の大扉 → 東の下り階段の横断路◎・空の台座の列・青い灯・墓荒らしの松明と背負い袋と折れた矢◎。⚠ 外周は黒い余白 = 歩ける範囲は 24x16 より狭い(MASK で塞ぐ) |
| 魔法使いの玄室 | `assets/maps/tomb-crypt-v1.png` + `-nogrid` | 差分 **83691 画素・外 0**・線の明度 18.2 < 33.4。目視 = 西の階段の足元 → 東の台座と蓋のずれた石棺・紫に光る魔法陣・古書/砕けた水晶球/倒れた燭台/杖立て・空の台座◎。石棺の西に開けた床◎ |
| 墓所の動く鎧 | `assets/tomb-armor/tomb-armor-walk-attack-right-6-aligned/`(456x691 x 12) | 本番 833 秒(codex 側に Python が無く validator は PowerShell 移植)。受け取り側 Python で §3-3 = キャンバス一致 / 接地線 spread **0** / 最大高 **1.017** / walk 幅 0.556・attack 幅 0.593 / 連結成分 1〜2 / 端の接触 0 / md5 **12/12** / `check_alpha_bg_residue.py` 疑い 0 件。QA = リアルな頭身の空っぽの鎧・面頬の奥は空洞・味方の戦士とドワーフと区別できる◎ |
| マミー | `assets/tomb-mummy/tomb-mummy-walk-attack-right-6-v2-aligned/`(768x683 x 12)⭐ **v2 を使う** | 本番 1149 秒 → v2(縁の修正)117 秒。§3-3 = 接地線 spread 1 / 最大高 **1.074** / walk 幅 0.449・attack 幅 0.851 / 連結成分 各 1 / md5 12/12 / 背景残り 0 件。QA = 全身包帯・青紫の肩掛け・眼の青白い光・右向き◎ |

⚠⚠ **2 体とも縁にマゼンタが残っている(ユーザー判断 2026-10-30「このまま使う」)**:
- マミー: attack の細い包帯の端にピンクの縁(v1 で差し戻したが、v2 は起草窓の物差し = 赤≒青の画素だけを暗く塗り替えて 0 にしただけで、見えるピンク = 赤 ≥ 青 > 緑 の画素 1 コマ 2848〜9853 は残った。⇒ **物差しの誤りは依頼側** = codex1 の書き方の指針 #6 の再演)
- 動く鎧: attack のコマの輪郭に紫〜マゼンタの縁取り(2 倍で見える)
- ⇒ 項目1 で取り込んだら**本番の床(玄室・前室の焼き上がり)の上で目視**し、目立つなら §12-1 に記録してユーザーに上げる(⛔ 実装窓が勝手に色を加工しない・別チケット候補 = 受け取り側の色の分離)。参考: コボルドの族長も足元にわずかな縁が残ったまま採用している

⭐ 地図は #104 v2 で合格した作り方で**最初から**頼む: **格子の無い絵を描き、その上にコードで 1 マス 64px 丁度・原点 0 の暗い 1px 線を重ねる** + 格子無しの `-nogrid` も納品(手順の型 §2-1 ★[#104])。⇒ 受け取り側は**本命と `-nogrid` の差分で線を直接測る**(差分画素が全部 x / y = 64 の倍数の上・外 0 なら、定義上 位相 0・周期 64.000・24x16)。
⚠ `--fit` の一次解は端の線 (x = 0 / y = 0) を捨てて 22x15 などに落ちる(#104 で実測)= **一次解を `GRIDS` に貼らない**。差分で測った (0, 0) / 64.000 / 全マスを台帳へ。

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `scenarios` に `silent-tomb` 1 件(倉庫街の後ろ)・撤退 `?tomb=0` の IIFE 1 つ |
| `index.html` | `ROAD_CHEST_GOLD` / `SCENARIO_TEX` / `NODE_EXTRA_SPAWN_KINDS` / `ROOM_PAINTINGS_DEF` / `ENEMY_TYPES.mummy` `.tombArmor` `.tombGargoyle` / 鳴き声の鍵 2 つ(参照)/ `ENEMY_TRAITS.tombArmor` / `SCENARIOS` / `SCENARIO_NARRATIONS` / `TRAP_TYPES.dart` `.glyph` / `mummyDreadfulGlare()` と入口 / `LORE_SKILL_OF` / `LORE_CR` / 振り分け 1 行 / `buildSilentTombRun()` / 検証シーム `__silentTombTV` /(任意)`detectEnemyFamily` |
| `js/world-map.js` | `NODES.lake_n` を拠点へ / `SITES` / `UNLOCK` / `retireTomb()` と公開 1 行 / 札の数のコメント /(要るなら)`signDx` |
| `js/df-mapdef.js` | `THEMES` / `THEME_DEFAULT_ENEMIES` /(要るなら)`LINT_PAINTING_ASPECTS` |
| `world.html` | 撤退 `?tomb=0` の読み取り 1 行 |
| `tools/make_grid_map.py` | `GRIDS` に `tomb-hall` / `tomb-crypt` |
| `tools/codex1_sprites.json` | `mummy` / `tombArmor` の 2 行 |
| `assets/` | `room_silent-tomb_n0_map.jpg` / `room_silent-tomb_n1_map.jpg` / `mummy_anim.png` / `tombArmor_anim.png`(⛔ 既存の `animatedArmor_anim.png` は上書きしない) |
| `tools/verify_silent_tomb.js` | 新規(§8) |
| 既存 golden | §8 の表の言い直し(期待値は緩めない) |

⛔ 触らない: `town.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` / `js/npc-crowd.js` / `js/road-events.js`・勝利判定・`defeatEnemy()`・`runEncounter` の手番ループ(入口 1 ブロックを除く)・`checkTrapTrigger()`・`spawnFor()`・`EDGES`・他の拠点の `signDx`・`partyWillSave()`・`sovereignFearEye()`・`initGuardians()` / `awakenGuardians()`・既存の `skeleton` / `animatedArmor` / `gargoyle` の定義と絵・`ENEMY_TRAITS` の既存の行。

---

## 4. STEP1 — 依頼の登録(酒場・ワールドマップ)

### 4-1. `tavern.html` の `scenarios`(`lost-cargo` の後ろに足す)

```js
    /* ★[#105] 新しい行き先の 3 か所目「沈黙の墓所」(本筋の外・森の後)。
       ⭐ side = 卓の抽選の母集団には入るが、「本筋」「次の未解放」の判定からは外れる (#82 と同じ)。
       ⭐ locked:true = 開始直後の卓・廃坑の後の卓は今日のまま。森のクリアで沼地と同時に解放。
       ⚠ id は index.html の SCENARIOS / js/world-map.js の SITES・UNLOCK と同じ (verify_world_map (4s) が照合)。 */
    {
      id: "silent-tomb",
      place: "湖の北の島",        /* ⚠ id の直後に置く (検証ドライバが id → place の並びで配信バイトを読む) */
      side: true,
      title: "沈黙の墓所",
      difficulty: "★★★",
      recommendedLevel: 5,        /* 森 4 の後・沼地 5 と同じ帯。⚠ 強さの実測 (依頼書 §8 ⑤) で直してよい */
      reward: "渡し守の礼金",
      client: { name: "オズウィン", role: "湖の渡し守", type: "villager" },
      dialog:
        "「北の小島の墓所に、夜になると青い灯がともるんです。墓荒らしが三人、わしの舟を借りて渡ったきり戻らない……" +
        "舟は出します。ですが、あそこの入口には『眠りを妨げる者に沈黙を』と刻まれている。罠には、よくよくお気をつけて」",
      enemies: [
        { name: "墓所の番人たち", boss: false },
        { name: "墓所の主(マミー)", boss: true },
      ],
      locked: true,
      unlockAfter: "bandits-forest",
    },
```

⚠ `difficulty` は帯の並び(巣穴・倉庫街の値と本筋の Lv5 の値)を項目1 で読んで揃える(★★★ は出発点)。撤退 `?tomb=0` は `?cargo=0` の IIFE の後ろへ同じ形で(§7)。

### 4-2. `js/world-map.js`

```js
    /* ★[#105] 湖の北岸 lake_n を拠点「湖の北の島」(本筋外の依頼「沈黙の墓所」) へ格上げ。
     *   ⛔ id と座標は変えない・EDGES も触らない (farm_n と lakeside をつなぐ通り道のまま = 廃坑・神殿への経路の途中)。
     *   ⚠ 通り過ぎても入場ダイアログは開かない (押して着いたときだけ)。街道の出来事・襲撃は拠点では出ない (isRoadSite)。
     *   ⭐ 小島は絵の中でこの点の南の湖上 (≈ 725,375)。拠点は北岸の渡し場 = 島へは舟で渡る (語りで吸う)。
     *   ⭐ 撤退 ?tomb=0 は world.html / tavern.html が自ページで読み、retireTomb() で中継点へ戻す。 */
    lake_n:    { kind: "site", x:  736, y: 288, label: "湖の北の島", desc: "湖に浮かぶ小島。古の魔法使いが眠る墓所" },
```

- `SITES` に `"silent-tomb": "lake_n"`、`UNLOCK` に `"silent-tomb": "bandits-forest"`(tavern の `unlockAfter` と同じ)
- `retireTomb()` は `retireCargo()` と同じ形(`NODES.lake_n = { kind: "way", x: 736, y: 288 };` + `delete` 2 行)。公開行は `retireCargo` の下へ 1 行
- 札の数のコメント「ちょうど 10 個」→ 11(★[#105] 11 個目 = lake_n「湖の北の島」)
- 項目1 の実測(§2-2)で主人公が札を大きく覆う / 札が重なるなら、**lake_n に** `signDx` を足す

---

## 5. STEP2 — 地図 2 枚・マミー・罠(`index.html` ほか)

### 5-1. 地図の焼き付け(`codex-map-request` スキルの段 3〜4・手順の型 §2)

1. 納品の本命と `-nogrid` の**差分画素**を数え、全部が x / y = 64 の倍数(±1)の上・外 0 であることを確かめる(= 位相 0・周期 64.000・24x16)。比較のため `--fit --fit-around 64` の一次解も記録する(⚠ 端の線を捨てる = 貼らない)
2. `GRIDS["tomb-hall"]`(out `room_silent-tomb_n0_map`)/ `GRIDS["tomb-crypt"]`(out `room_silent-tomb_n1_map`)を足し、根拠を注記(#104 の `cargo-warehouse` の注記が型)→ `--name` で焼く → 3 指標(drift ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%)。⛔ 閾値を緩めない。通らなければ v2 を発注
3. MASK(5 規則): 外周 1 マス `.` / 平置きの物(床の銀の象嵌・魔法陣・塵)は塞がない / 通れない物(石棺と台座・壁龕・柱・崩れた石)を塞ぐ / 入口の行は端から端まで開ける / 孤立 0。⭐ **石棺の台座は `#`**(上に立たせない)
4. 焼き上がりに MASK を赤で重ねて目視。本番の最終確認は受入の `aStar`

### 5-2. `ENEMY_TYPES.mummy`

`plaguePriest` の定義を写し、数値だけ下の表へ(⚠ 出発点。⑤ で直してよい):

| 項目 | 値 | 根拠 |
|---|---|---|
| `name` | `"墓所の主(マミー)"` | |
| `flavor` | `"包帯に巻かれた古の魔法使いの亡骸。その眼に射すくめられた者は、恐怖で動けなくなる"` | |
| `hp` / `ac` / `atkBonus` | **87 / 11 / 5** | SRD 58 × 1.5(#104 と同じボス補正)/ 天然 11 / 腐れの拳 +5 |
| 攻撃のダメージ | 腐れの拳 **2d6+3**(書式は既存のボスの定義に合わせる) | SRD の殴打ぶんだけ。⛔ 3d6 の死霊と呪いは足さない(§11) |
| `speed` | 0.5(`zombie` と同じ遅さ) | SRD 歩行 20ft |
| `undead` | `true` | アンデッド(ターン・アンデッドの対象・眠りに免疫・家系の検出) |
| `glareDC` / `glareStunGap` | **11 / 5** | SRD の Dreadful Glare(⛔ `fearDC` / `fearEyeDC` を名乗らない = §2-7) |
| `xp` | 700 | CR3 |
| `isBoss` | `true` | ボス枠 |
| シート | 576x480・96px・6 列(`tools/codex1_sprites.json` に揃える) | 手下と同じ物差し |
| `displaySize` | **人間大のボス(`plaguePriest` 100 / `scar` 等)を項目1 で実測して揃える** | ⚠ 当たり判定に直結 |
| `meleeRange` / `attackDuration` / `attackHitFrame` / `attackCooldown` | `plaguePriest` を写し、攻撃のコマを目で見て `attackHitFrame` だけ合わせる | |

`LORE_SKILL_OF.mummy = "religion"` / `LORE_CR.mummy = 3`。⚠ ターン・アンデッドがボスにどう効くか(既存のアンデッドのボス `lich` と同じ扱いか)を項目1 で確かめて §12 に書く(⛔ ターン・アンデッドの仕組みは触らない)。
`detectEnemyFamily`(`index.html:15563`)の undead の並びに `t === "mummy"` を足すのは**可**(既存のアンデッドの掛け声を引くだけ・⛔ 新しい台詞を足さない)。足すなら `verify_lore_check` などの家系の数を項目2 で測り直す。

### 5-2b. 墓所専用の手下 `ENEMY_TYPES.tombArmor` / `.tombGargoyle`(§2-12)

| 項目 | `tombArmor`(墓所の動く鎧) | `tombGargoyle`(墓所のガーゴイル) |
|---|---|---|
| 写し元 | `animatedArmor`(`index.html:10899`) | `gargoyle`(`index.html:10950`) |
| `name` | `"動く鎧"`(同じ表示名でよい) | `"ガーゴイル"` |
| `flavor` | `"主の眠りを守り続ける、誰も着ていない古い板金鎧"` | 写し元のまま |
| 数値(HP / AC / 攻撃 / XP / 速さ) | **写し元のまま**(HP33・AC18・+4・1d6+2・XP150 = SRD Animated Armor) | **写し元のまま**(HP42・AC15・+4・1d8+2・XP280) |
| シート | ⭐ **新しい絵** `assets/tombArmor_anim.png`(576x480・96px・6 列・`tools/codex1_sprites.json` に揃える) | 写し元と同じ `assets/gargoyle_anim.png` |
| `displaySize` | 項目1 で新しい絵を見て決める(写し元 78 が出発点・手下のガーゴイル 80 と並べて) | 写し元のまま |
| ⛔ **持たせないもの** | `faction` / `startsDormant` | `faction` / `startsDormant`(と写し元にある休眠・覚醒まわりの鍵があれば全部) |

- 鳴き声: `"enemy.cry.tombArmor"` / `"enemy.cry.tombGargoyle"` を、元の `animatedArmor` / `gargoyle` の**行の参照**で足す(⛔ 文言を新しく書かない)。表の形が参照を許さなければ、同じ文字列の写しでよい(⚠ その場合は掛け声を握る golden の変異アンカーが 2 回ヒットしないか確かめる = 罠E)
- 体質: `ENEMY_TRAITS.tombArmor = { sleepImmune: true }`(元の行と同じ)。ガーゴイルは元に行が無い = 足さない
- 伝承: `LORE_SKILL_OF` は 2 つとも `arcana` / `LORE_CR` は 1 / 2(元と同じ)
- 家系: `detectEnemyFamily` に足すかは元の 2 種の扱いに揃える(⛔ 新しい台詞を足さない)

### 5-3. 恐怖のまなざし `mummyDreadfulGlare(enemyIdx)`

**写し元 = `sovereignFearEye`(`index.html:22466`)**。違いは「**5 以上の差で失敗したら 1 手番の行動不能も**」が付くことと、名前の値(`glareDC`)だけ:

- 狙い: `pickEnemyTarget(enemyIdx)`(暴君の眼・仕掛け罠・傷を腐らせる手と同じ)
- 免疫: `playerFearImmune()` / `allyFearImmune(a)` を**そのまま**使う(神殿の加護・恐怖免疫の効果・自由行動の指輪 = 恐怖にも行動不能にも効く)。⛔ 免疫の条件を組み直さない(暴君の眼の注記どおり「可否の判断は 1 か所」)
- 判定: `d20() + WIS 修正 + getSaveBonus(...)` vs `def.glareDC`(暴君の眼と同じ式)
- 失敗: 恐怖 = `frightenedRemaining = max(.., FRIGHTENED_DURATION)` / `frightenedPenalty = FRIGHTENED_PENALTY`(暴君の眼と同じ)。さらに **`total <= glareDC - glareStunGap`** なら行動不能: 主人公 `playerBuffs.skipNextTurn = true` / 仲間 `a.stunned = Math.max(a.stunned || 0, 1)`。⛔ `sleepWatchHp` を書かない(§2-7)
- 敵(第三勢力)を引いたら: 暴君の眼と同じく効かない
- 語り: バナー `👁 恐怖のまなざし 👁`・DM の一言「包帯の隙間から、乾いた眼がこちらを射すくめた——」・吹き出しのラベル `FEAR RESIST` / `FRIGHTENED` / `PARALYZED`(行動不能のとき)
- probe: `window.__glareProbe`(1 件 = 1 回の発動。`{ site: "glare", enemyIdx, dc, roll, total, saved, frightened, stunned, immune, kind, idx, target, trapsLen }`)。⛔ ゲームの判定には使わない
- ⚠ ダメージは与えない(`hp -=` を 1 つも足さない = 「HP を引く点」を数える golden が動かない)
- **入口**: 傷を腐らせる手の入口(`index.html:37387-37392`)の**すぐ下**に、同じ形で 1 ブロック:

```js
      // ── ★[#105] 墓所の主 (マミー) の「恐怖のまなざし」: 戦闘の最初の手番に 1 度だけ (この手番はまなざしで消費) ──
      // ⭐ 行動選択 (pickBossAction の Math.random) より**前** = 仕掛け罠・傷を腐らせる手と同じ理由。
      //   glareDC を持つのは mummy だけ = 既存の敵の手番と乱数列は 1 ビットも動かない。
      //   ⛔ fearDC を名乗らない (戦闘開始時の全体恐怖 partyWillSave が黙って起きる・依頼書 #105 §2-7)。
      if (def.glareDC && !enemy.__glareUsed) {
        enemy.__glareUsed = true;
        await mummyDreadfulGlare(idx);
        await sleepMs(1100);
        return;
      }
```

⚠ SRD のまなざしは「60ft・見えている相手」だが、仕掛け罠・傷を腐らせる手と同じく**間合いを見ない**(最初の手番で必ず 1 回)。間合いの条件を足すと「使わない戦闘」が生まれ、手番ごとに `pickEnemyTarget` の乱数を引くことになる。
⚠ SRD の恐怖は「マミーの次の手番の終わりまで」だが、本作の恐怖はどれも `FRIGHTENED_DURATION`(3 手番)で揃っている = **3 手番を出発点**にする(⑤ で回数を記録・ユーザー判断)。

### 5-4. 罠の種類(`TRAP_TYPES` に 2 行)

```js
      /* ★[#105] 矢の罠 / 魔法の紋 = 語りだけ違う罠 (ダイス・解除 XP は damage と同じ)。沈黙の墓所の n0 (前室) / n1 (玄室) が宣言する。 */
      dart:     { damageDice: "1d6", weaponizeDice: "2d6", disarmXP: 25, dmText: "壁の小穴から矢が放たれた!" },
      glyph:    { damageDice: "1d6", weaponizeDice: "2d6", disarmXP: 25, dmText: "床の銀の紋が光った——魔法の罠だ!" },
```

⛔ `damage` / `pit` / `rockfall` / `miasma` の行は 1 バイトも変えない。

### 5-5. `buildSilentTombRun()`

`buildLostCargoRun()`(`index.html:42085`)を写す。⚠ `p6Node` の `density` / `start` / `paint` は全部明示。⚠ rect は焼き上がりのマス数と `ROOM_PAINTINGS_DEF` の `tileBounds` と同値(唯一解の作法・#53)。敵の置き場は**焼き上がりを見て項目1 で決める**(出発点):

| ノード | 名前 | 敵 |
|---|---|---|
| n0(start) | 墓所の前室 | 西寄りの開けた床に骸骨 3(`skeleton` = 戻らなかった墓荒らし)/ 玄室へ下る石段の前に動く鎧 2(`tombArmor` = 主を守る番人)。⭐ 2 群は `DETECTION_RANGE` より離して別々の戦闘に |
| n1(boss) | 魔法使いの玄室 | ガーゴイル 2(`tombGargoyle`)+ 動く鎧 1(`tombArmor`)+ マミー `boss: [.., .., "mummy"]`。入場から 13 タイル以上 = 入場の語りの最中に戦闘が始まらない |

⚠⚠ slots には**墓所専用の鍵だけ**を書く(⛔ `animatedArmor` / `gargoyle` を置くと §2-12 の 3 つが全部起きる)。ガーゴイルは**休眠させない**= 普通に動く手下。⛔ 休眠する敵を大部屋へ置くとクリア不能になる前例あり(旧タイプ MAP 全廃の記録)。
振り分けは `if (scenId === "silent-tomb") return buildSilentTombRun();   // ★[#105] 本筋外の 10 本目` を倉庫街の行の下へ(⚠ 縦に揃え直さない)。

---

## 6. STEP3 — シナリオ定義と語り

```js
      /* ★[#105] 沈黙の墓所 (本筋外の 10 本目・森の後・推奨 Lv5)。
       * ⭐ 実際の盤面は buildSilentTombRun (卓上マップ 2 枚)。spawns は ?graph=0 の単一マップ用の退避先。
       * ⭐ trapCount:1 × NODE_EXTRA_SPAWN_KINDS の n0/n1 両方の search = 罠は部屋ごとに 1 つ。
       *   trapTypeByNode は罠の**語り**だけを変える (乱数を 1 つも足さない)。
       * ⭐ 探索判定が主役の墓所 = perceptionDC は沼地と同じ 15・隠し宝箱 3。
       * ⚠ 値は出発点。強さの実測 (依頼書 §8 ⑤) と合わせて直してよい。 */
      "silent-tomb": {
        title: "沈黙の墓所 — 古の魔法使いの玄室",
        flavor: "湖の小島の墓所に潜り、眠りから覚めた墓の主を再び鎮めよ",
        perceptionDC: 15,
        trapCount: 1,
        trapTypeByNode: { n0: "dart", n1: "glyph" },
        hiddenChestCount: 3,
        clearXp: 600,
        clearGold: 250,
        spawns: [ /* ?graph=0 用。buildSilentTombRun の slots と同じ顔ぶれを並べる */ ],
      },
```

`SCENARIO_NARRATIONS["silent-tomb"]`(4 行・⭐ 2 行目が会議の「入口の碑文で警告する」):

```js
      "silent-tomb": [
        "渡し守の舟が、霧の湖を音もなく進む。北の小島に、苔むした石の扉が口を開けていた。",
        "扉の脇の石碑には、古い文字が刻まれている——『眠りを妨げる者に、沈黙を』。",
        "墓荒らしたちは、この警告を笑い飛ばしたのだろう。罠に気をつけろ。床も、壁も、信じるな。",
        "さあ、墓所へ踏み込め。",
      ],
```

`ROAD_CHEST_GOLD["silent-tomb"] = 75` / `SCENARIO_TEX["silent-tomb"]` / `NODE_EXTRA_SPAWN_KINDS` / `THEMES`(`{ id: "silent-tomb", name: "沈黙の墓所 (silent-tomb)" }`)/ `THEME_DEFAULT_ENEMIES`(`mob: ["skeleton", "tombArmor", "tombGargoyle"], boss: "mummy"`)は §2-3 の表どおり。

---

## 7. 撤退スイッチ

- **`?tomb=0`** — `tavern.html` は配列から `silent-tomb` を外し、同じページの `WORLD_MAP.retireTomb()` を呼ぶ。`world.html` も自ページで読んで `retireTomb()`(`?cargo=0` の隣に 1 行)。⇒ `lake_n` が中継点へ戻り(街道の出来事・襲撃も今日どおり lake_n で起きる)、`cleared=[廃坑, 森]` の卓が今日の姿へ戻る。
- ⚠ 判定位置 = 各ページ。**ページ遷移をまたがない**(sessionStorage へ写さない)。`index.html` は判定しない(卓に出なければ入れない)。
- ⭐ 恒等ハッシュを持つ golden は「撤退を**全部**呼んだ後の地図 = 前の固定値」で縛る。撤退関数は `retireTomb()` → `retireCargo()` → `retireWarren()` → `retireTower()` の **4 段**。**各段の後の sha1 を全部**固定値で縛る(1 段目の後 = 今日 `2e2e291` の既定の値を 1 文字も変えず当て直す・手順の型 §5 ★[#104])。

---

## 8. 受入条件 — `tools/verify_silent_tomb.js`(新規・port base **10664**・変異 **10665〜**)

`tools/verify_lost_cargo.js` を写す(手順の型 §6)。配信は内蔵 http サーバ・本番ファイルは起動時に 1 回読んで凍結・変異はメモリ上で差し替え(⛔ 本番は 1 バイトも触らない)・favicon 204。⛔ 8765 は使わない。

### §0 装置

- **(0a)** `__silentTombTV` が見える・`buildSilentTombRun()` が 2 ノードを返し、各ノードの敵が 0 体でない・n1 のボスはマミー 1・pageerror 0
- **(0c)** ⭐ §2-12: 墓所の 2 ノードに入った直後、敵の**誰も** `inactive` / `dormant` でなく、`faction === "beast"` の敵が 0・`startsDormant` の敵が 0。n0 の戦闘を最後まで回して「古代王国の守護者、起動!」のバナーが出ない(⭐ 台帳 = slots の鍵と、実体 = 生成された敵の `type` / 状態の 2 経路)
  ⭐ これが無いと全 assert が空振りで永久緑になる
- **(0b)** `__glareProbe` が配列で在る(発動前は 0 件)

### §1 登録の整合(2 経路)

- **(1a)** tavern の `scenarios` の `silent-tomb`(配信バイトで `id` → `place` の並び)と、同じページの `WORLD_MAP.SITES` / `UNLOCK`、world.html の DOM の札が一致
- **(1b)** `side: true`・本筋 6 本に入らない・本筋 6 本クリアで `frontier` が null
- **(1c)** 開始直後(`cleared=[]`)の卓は「廃坑 + 巣穴」のまま・`cleared=["goblin-mine"]` の解放済みは 4 件のまま・どちらも `lake_n` は札を出さない(中継点の見た目)
- **(1d)** `cleared=["goblin-mine","bandits-forest"]` で解放済みに墓所が入る・`lake_n` に札「湖の北の島」
- **(1e)** `findWalkPath("phlan", "lake_n")` が null でない(⛔ 自前の BFS を書かない)
- **(1f)** ⭐ §2-2: `cleared=["goblin-mine","bandits-forest"]` の world.html で、墓所の札と他のすべての札の `getBoundingClientRect()` の**交わりの面積が 0**(1440x900 と 390x844 の 2 画面)
- **(1g)** ⭐ §2-1: 墓所が解放済みの世界で、港町から**廃坑を押して歩く**(経路が `lake_n` を通ることを母集団ガードで確かめる)と、`lake_n` を通過しても**入場ダイアログは開かず**廃坑の入場が開く / `lake_n` を押して着くと**墓所の入場が開く**(2 経路の反転)

### §2 地図

- **(2a)** `make_grid_map.py --check` が 2 枚とも 3 指標 OK
- **(2b)** 本番の `aStar` で n0 の入場 → 出口ゲート、n1 の入場 → マミーの隣が通る
- **(2c)** 罠は部屋ごとに 1 つ・種類は n0 = `dart` / n1 = `glyph`・踏んだときの語りが `dmText`
- **(2d)** 2 枚とも屋内 = 霧(`renderLighting` の暗幕)が効く(`outdoor` が付いていない)

### §3 恐怖のまなざし

- **(3a)** マミーの最初の手番で probe が 1 件・2 手番目以降は増えない(1 戦闘 1 回)
- **(3b)** 成功 / 失敗(恐怖だけ)/ 失敗(5 以上の差 = 恐怖 + 行動不能)の 3 通りを d20 の差し替えで作り、主人公と仲間の両方で: 失敗なら `frightenedRemaining > 0`・5 以上の差なら主人公 `skipNextTurn === true` / 仲間 `stunned >= 1`、成功ならどれも立たない(⭐ 状態と probe の 2 経路)。⭐ 仲間の行動不能に `sleepWatchHp` が**書かれていない**
- **(3c)** 恐怖に免疫のある相手(自由行動の指輪)は probe の `immune: true` で、恐怖も行動不能も立たない
- **(3d)** 戦闘開始時の全体恐怖(`partyWillSave`)が墓所の戦闘で**呼ばれない**(⭐ §2-7 の罠の番人)
- **(3e)** 他のボス(`koboldChief` / `plaguePriest` 等)と手下は probe を増やさない・`traps.length` は発動の前後で変わらない・HP は 1 も減らない

### §4 語りと撤退

- **(4a)** 開幕の語りが 4 行(2 行目に碑文)・`trapTypeByNode` の語りが出る
- **(4b)** `?tomb=0` で: tavern の配列から消える・`lake_n` が中継点・`cleared=[廃坑, 森]` の解放済みが今日の件数へ戻る(ON/OFF の反転)
- **(4c)** `retireTomb()` → `retireCargo()` → `retireWarren()` → `retireTower()` を 1 段ずつ呼び、**各段の後の地図の sha1** = 前の固定値(1 段目の後 = `2e2e291` の既定)

### ⑤ 実測して報告する(⛔ assert しない)

Lv5・4 人・N=10 で: クリア率 / 全滅率 / 所要 / 残り HP / 倒れた人数 / **まなざしの失敗率・行動不能になった回数** / 罠を見つけた回数・踏んだ回数。比較のため**沼地 Lv5** を同じ道具で N=5。§12 に書き、数値の判断はユーザー(⛔ 値を変えない)。

### §6 恒等(非退行)

- **(6a)** 既存 9 シナリオ(本筋 6 + 塔の母 + 巣穴 + 倉庫街)の罠の座標・種類・乱数の呼び出し回数・次の乱数が `2e2e291` と同じ(`git show 2e2e291:index.html` を `?__base=1` で配る = `verify_lost_cargo` の型)

### ⛔ 測らないこと

- マミーの `displaySize` の値そのもの・語りの文面・バナーの絵文字・クリアの XP と金貨・恐怖の手番数(⑤ と実機で動かす)
- 札の位置の px(重ならないことだけを縛る)

### 負のコントロール(`--negative`。担当は**机上で書かず `--mutate` で 1 本ずつ実走して決める**)

| 変異 | 注入する欠陥 | 赤くなるべき節(見込み) |
|---|---|---|
| `usefeardc` | ⭐ マミーの `glareDC` を `fearDC` と名乗らせる(§2-7 の罠) | (3d) |
| `glareastrap` | まなざしを `traps[]` 経由にする | (3a)(3e) |
| `glareafter` | 入口を `pickBossAction` の後ろへ動かす | (3a)(6a) |
| `glareall` | `def.glareDC` の条件を外し全ボスで使う | (3e) |
| `stunassleep` | 仲間の行動不能に `sleepWatchHp` も書く | (3b) |
| `typerng` | 罠の種類を決めるのに `Math.random` を 1 回足す | (6a) |
| `unlockfree` | `locked: false` にする | (1c) |
| `nosite` | `NODES.lake_n` を `way` のまま | (1a)(1d) |
| `passopen` | 通過した拠点でも入場ダイアログを開く(`arrived` の条件を外す) | (1g) |
| `nosearch` | `NODE_EXTRA_SPAWN_KINDS` の宣言を消す | (2c) |
| `useguardian` | ⭐ 墓所の slots の `tombArmor` / `tombGargoyle` を元の `animatedArmor` / `gargoyle` に戻す(§2-12 の罠) | (0c) |
| 罠E | 自分の変異アンカーが他の `tools/*.js` に出ない(自己検査) | — |

⚠ 変異は 11 本で port 10665〜10675。`--negative` の本数が変わったら port の並びと依頼書 §12 を合わせる。総括行は `  N/N PASSED   FAILED 0   PENDING 0`。

### 既存 golden(項目1 で着手前の色を控える・期待値は緩めない)

手順の型 §7 の表がそのまま当てはまる。本件で**特に**動くと見込むもの(⭐ 名指しの外は項目4 の全数走査で拾う):

| 本 | 見込み |
|---|---|
| `verify_quest_draw` | `cleared=[廃坑, 森]` の盤面がある本は解放済み件数 +1・抽選。前の期待は `?tomb=0` の腕で同じ回数だけ測る |
| `verify_tavern_map` / `verify_quest_visibility` / `verify_party_four` (0a) | scenarios / side / `SITES` の件数 |
| `verify_quest_walk` | 配信から読む組数・地図の sha1(既定 / 撤退 1〜4 段)・森の後の札の枚数 |
| `verify_world_map` | 札の枚数 (7b-data)(7b-dom)(7d)(7e)(7f)・(4s) の照合 |
| `verify_world_steps` | ⭐ `lake_n__lakeside@1` を握る変異 `handcoord` / `nodemut`・地図の sha1。`lake_n` が site になっても刻み点は両端から引けるか(`SITE_TERRAIN` に `lake_n` は無いが `WAY_TERRAIN` の行は残る = 巣穴 `village_s` と同じ形)を確かめる |
| `verify_road_events` (4a) / `verify_road_ambush` / `verify_road_boon` | 地図の sha1・イベント対象の停留所(`lake_n` が外れる = 巣穴の `IDENT_WANT_ON` と同じ作法で言い直す)・撤退の腕に `&tomb=0` |
| `verify_world_heromark` | `EXPECT_SIGNS`(札の枚数 → 照合の組数) |
| `verify_lore_check` | 58 / 47 / 11 / 40 / 18 と表(`DRV_SKILL` に `mummy` religion・`tombArmor` / `tombGargoyle` arcana の 3 行・CR 表に 3 行)。体質の表(`ENEMY_TRAITS`)を数える節があれば `tombArmor` の 1 行ぶん |
| `verify_fort_fold` / `verify_temple_fold`(`animatedArmor` / 守護者の休眠を名指し) | 元の `animatedArmor` / `gargoyle` は 1 バイトも変えない = **緑のはず** |
| `verify_enemy_traits` | `ENEMY_TRAITS` の行数・眠り免疫の集合を縛っていれば `tombArmor` の 1 行ぶん言い直し(期待値は緩めない) |
| `driver_mapeditor_painting` | テーマ数・side テーマの `n0big` / `n1big`・optgroup |
| `verify_dragon_fold` (7b) / `verify_swamp_novice` (4b) | `NODE_EXTRA_SPAWN_KINDS` の行の集合・撤退の腕に `?tomb=0` |
| `driver_graph_p6` (2c) | 縦横比が在庫に無ければ赤 → `LINT_PAINTING_ASPECTS`(24x16 なら在庫の 3:2) |
| `verify_kobold_warren` / `verify_lost_cargo` | (6a) の恒等の対象に `silent-tomb` は入らない = 緑のはず。(4c) の撤退の段は 1 段増える世界で読み直す |
| `verify_counterspell` (4c) / `verify_run_chronicle` (0c) / `driver_cleanup_phase1` (D4) | まなざしはダメージも倒れる行も足さない = **緑のはず**(赤なら理由を突き止める) |

⚠ 着手前から赤の本(#104 時点: `driver_mapeditor_painting` §1 1d2 / `verify_codex_map_skill` (3a))は範囲外。項目1 で測り直す。
⚠ `verify_town_changelog` (1b) は #104 で畳んだので、更新情報を 1 行足しても赤くならないはず(赤なら記録)。

---

## 9. 実機/実感の確認(iPhone)

- 森をクリアした後、ワールドマップで**湖の北に「湖の北の島」の札**が出て、他の札と重ならずに押せる・縦画面で画面外に出ない
- 廃坑や神殿へ向かう途中で湖の北を通っても、墓所の入場は開かない
- 罠の吹き出しが 1 回の潜行で 2 回・碑文の語りで「罠の墓所」だと伝わる
- 動く鎧が初めて画面に出る — 新しいリアルな絵で「誰も着ていない鎧」に見える・歩き・攻撃・倒れが不自然でない・骸骨やガーゴイルと並べて大きさが不自然でない
- 墓所で敵が石化して止まっていない・砦の「古代王国の守護者、起動!」が出ない
- 「恐怖のまなざし」が 1 戦闘 1 回で、行動不能の吹き出しが読める・Lv5 の 4 人で全滅しない
- 新しい絵(地図 2 枚・マミー)の読み込みで白い床が出ない(#85)
- ⚠ ローカルは http 起動が必須

---

## 10. changelog(`index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>湖の北の島に新しい依頼「沈黙の墓所」</b> — 森を片づけると、罠と動く鎧に守られた古の魔法使いの墓へ渡れる。墓の主の眼に気をつけろ(推奨 Lv5)。"

---

## 11. やらないこと

- ⛔ ミミック・石の軍団兵を手下にする(ユーザー決定 = ドラゴンの巣と砦の隠し要素の驚きを守る)
- ⛔ 腐れの拳の 3d6 の死霊ダメージと「回復できない呪い」(mummy rot)。呪いの仕組みは別チケット
- ⛔ マミーの体質(SRD = 火に弱い・非魔法の武器に抵抗・死霊/毒に完全耐性)を `ENEMY_TRAITS` に足す。⚠ 火の弱点(2 倍)は本作で**初めての弱点**になる(#75 のユーザー決定「弱点は 0 件」を動かす話)= 別チケット候補としてユーザーに上げる
- ⛔ まなざしを敵の呪文表(`spells`)に足す・他の敵に持たせる・間合いの条件を足す(§5-3)
- ⛔ 罠のダイスを重くする・罠を部屋に 2 つ以上置く(§2-4)
- ⛔ ガーゴイルを休眠させる(§5-5)
- ⛔ 元の `animatedArmor` / `gargoyle` の定義・絵を変える。⚠ 新しい動く鎧の絵を砦の `animatedArmor` にも使うか(今はどのシナリオにも出ていない)は別の判断 = 本件では墓所の `tombArmor` だけ
- ⛔ 帰還の印・酒場の主人の一言・後日談・墓荒らしの遺品。魔法使いと黒幕の関係も語らない(本筋の語りを変えない)
- ⛔ 島へ渡る舟の演出・湖の霧のアニメーション・新しい BGM・新しい効果音
- ⛔ #103 / #104 の強さの見直し・390 幅の倉庫街の札(ユーザー判断待ちの別件)
- ⛔ 他の拠点の `signDx`・`spawnFor`・`EDGES`・`js/road-events.js`
- `実装依頼書/README.md` の一覧への行(承認時に起草窓が足す):

    | 105 | [2026-10-30_silent-tomb.md](2026-10-30_silent-tomb.md) | **承認済** | 0% | 新しい行き先 3 か所目「沈黙の墓所」(lake_n を拠点「湖の北の島」へ・森の後・推奨 Lv5・地図 2 枚 + マミー + リアルな動く鎧は新規発注・手下 = 動く鎧(初登場)/ガーゴイル/骸骨)。マミーの「恐怖のまなざし」= WIS DC11 → 恐怖、5 以上の差で 1 手番の行動不能。⚠ lake_n は廃坑・神殿への通り道の途中 / `fearDC` を名乗ると戦闘開始時に全体恐怖が起きる / 動く鎧とガーゴイルの元の定義は砦の守護者(第三勢力 + 休眠)= 墓所専用の `tombArmor` / `tombGargoyle` を足す / cleared=[廃坑, 森] の解放済みが 1 件増える。撤退 `?tomb=0` |

### 項目の割り方(dev-loop・手順の型 §0)

| 項目 | 中身 | 終わりの印 |
|---|---|---|
| 1 着手前の実測 + 素材の取り込み | §2 を測り直す・札と主人公の重なりの実測(§2-2)・名指し golden の色を控える・地図 2 枚の差分の検算と焼き付けと MASK 草案・マミーと墓所の動く鎧のシートの取り込みと `displaySize` の実測・ターン・アンデッドの扱い | §12-1 に実測表・焼き上がり 2 枚・台帳行 |
| 2 本体 | §4〜§7・changelog 1 行・予告外で赤くなった golden の言い直し・動く鎧の煙検査 | 煙検査 + 予告どおり赤の一覧 |
| 3 受入 | `tools/verify_silent_tomb.js`・⑤ 強さの実測 | 素 N/N × 3・`--negative` 全変異 OK |
| 4 母集団の非退行 + 記録 | golden の言い直し・全数走査・§12・README の行・手順の型に #105 の学び | 帰属の緑→赤 0 |

---

## 12. 実装結果

(実装窓が書く)

### 12-1. 項目1 — 着手前の実測 + 素材の取り込み(2026-10-30・基準 HEAD `fa21d59`)

⭐ 本番 3 ファイル(`index.html` / `tavern.html` / `audio.js`)と `js/*.js` / `world.html` は**無変更**。足したのは `tools/make_grid_map.py`(GRIDS 2 行)/ `tools/codex1_sprites.json`(2 行)/ `assets/` 4 枚 / 本節。作業の置き場 = `~/.claude/dev-loop/r105/item1/`(申し送り `r105/item1_notes.md`)。

#### (1) §2 の測り直し

| 主張 | 実測(`fa21d59`) |
|---|---|
| §2-3 の行番号(index / tavern / world-map / df-mapdef / world.html / road-events / verify_lore_check / check_changelog) | `2e2e291..fa21d59` の差は依頼書と README の 2 本だけ ⇒ **全部一致**(41 か所を `sed -n <行>p` で照合。`__lostCargoTV` の代入は 18736 = 範囲 18734-18739 の中) |
| §2-1 `lake_n` は通り道の途中 | ✅ `findPath("phlan", "mine" / "temple" / "dragon")` は 3 本とも `…farm_n>lake_n>lakeside>…` を通る(node で world-map.js を直接読んだ)。`findWalkPath("phlan","mine")` = `…farm_n>lake_n>lake_n__lakeside@1>lake_n__lakeside@2>lakeside>…` |
| §2-6 / §2-12 動く鎧・ガーゴイルの定義 | ✅ `animatedArmor` HP33・AC18・atk+4・1d6+2・XP150・`displaySize 78`・`attackDuration 24 / attackHitFrame 12`・`faction:"beast"`・`startsDormant:true` / `gargoyle` HP42・`displaySize 80`・同じ 2 鍵。`initGuardians()` は 38407 で無条件に呼ばれる |
| §2-7 `fearDC` の器 | ✅ 23487-23496 `def.isBoss && def.fearDC` → `partyWillSave(fb.def.fearDC)` |
| §4-1 `difficulty` の帯 | 本筋 = ☆ 付き 3 桁(廃坑 Lv3「★☆☆」/ 森 Lv4・沼地 Lv5「★★☆」/ 砦 Lv6「★★★」)、本筋外 = ☆ なしで数だけ(巣穴 Lv2「★」/ 倉庫街 Lv4「★★」/ 塔の母 Lv7「★★★」)⇒ Lv5 の墓所は **「★★」が帯に揃う**(出発点「★★★」は塔の母と同じ = 一段重い)。⚠ 項目2 で決める(提案) |

#### (2) 札と主人公の重なり(§2-2)

道具 = `r105/item1/sign/measure_signs.js`(port 10694。`lake_n` を拠点にした world-map.js をメモリで配る・本番は触らない)。主人公の立ち位置は `sessionStorage["dragonfighters.roadReturn"]`(襲撃からの再開の口)で置いた。

| 世界 | 画面 | 主人公の立ち位置 | 札の枚数 | 墓所の札と他の札の交わり | 主人公が墓所の札を隠す割合 | 墓所の札が画面内 |
|---|---|---|---|---|---|---|
| cleared=[廃坑, 森] | 1440x900 | lake_n / pass_n / lake_n__lakeside@1 | 7 | **0** | 0 | ✅ |
| 〃 | 1440x900 | **farm_n__pass_n@1** (672,160) | 7 | 0 | **20.8%**(札の左上の角) | ✅ |
| 〃 | 1440x900 | farm_n(廃坑・神殿への経路の途中) | 7 | 0 | 16.0% | ✅ |
| 〃 | 390x844 | lake_n / pass_n / lake_n__lakeside@1 | 7 | **0** | 0 | ✅ |
| 〃 | 390x844 | farm_n__pass_n@1 / farm_n | 7 | 0 | 20.3% / 13.0% | ✅ |
| 〃 | 390x844 | title 起点(主人公は pier) | 7 | 0 | 0 | ⚠ 画面外(カメラが南西 = 遠くの札は見えない。倉庫街の 390 幅と同じ種類) |
| 本筋 6 本クリア | 1440 / 390 | lake_n / farm_n__pass_n@1 / pass_n | 11 | **0**(見張りの塔の札の下端 → 墓所の札の上端 = 117.7px / 112.6px) | 20.8% / 20.3%(farm_n__pass_n@1) | ✅ |

- 札の寸法: 1440 = 190.9x38.2px(t=184.1)/ 390 = 165x34px。
- ⇒ #104 で `signDx` を足した基準(phlan に立つと倉庫街の札を 35.9〜39.9% 隠す)の**約半分**。札の文字「湖の北の島」は隠れない(`r105/item1/sign/crop_1440_farmpass.png`)。**`signDx` は足さない見込み**(⛔ 項目1 では決めない。項目2 / ユーザー判断)。(1f) は「札どうしの交わり 0」なので現状で緑の見込み。

#### (3) 地図 2 枚(段 3〜4)

| 指標 | 墓所の前室 `tomb-hall` → n0 | 魔法使いの玄室 `tomb-crypt` → n1 |
|---|---|---|
| 本命と `-nogrid` の差分 | 79015 画素・**x / y ∈ {64k, 64k+1} の外 0** | 83691 画素・外 0 |
| 線 | ⚠ **2px 幅**(x = 64k と 64k+1。#104 v2 の 1px と違う)。全行が変わる列 = x 0,1,…,1472,1473。行の被覆が 1 未満なのは黒い余白(暗い線を黒に重ねても変わらない) | 同じ |
| 線の明度(格子あり / 無し) | 12.9 / 23.6 = 暗い線 | 16.0 / 29.3 |
| ⇒ 台帳 | **(0,0) / 64.000 / 24x16 / tile 64**(恒等の焼き) | 同じ |
| `--fit --fit-around 64` の一次解(貼らない) | (64.05, 64.10) / (64.060, 64.105) / **22x14** = 外周 4 辺を落とす | (63.95, 63.75) / (64.035, 64.080) / 22x14 |
| 目地を拾っていない証拠(`-nogrid` の fit) | score 2.75 / 5.27・周期 65.3 / 63.7(格子あり 8.64 / 8.92) | 2.95 / 4.53・66.1 / 65.9(格子あり 10.67 / 11.20) |
| 焼き上がり | `assets/room_silent-tomb_n0_map.jpg` **1536x1024 = 24x16**(0.24 MB) | `assets/room_silent-tomb_n1_map.jpg` 1536x1024 = 24x16(0.29 MB) |
| `--check`(drift ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%) | 縦 1.30 / 0.90 / 97.9% OK・横 2.42 / 0.90 / 95.5% OK | 縦 1.66 / 0.90 / 96.6% OK・横 0.00 / 0.75 / 100% OK |

- ⚠ drift が #104 の 0.00 でなく 1.2〜2.4 world-px なのは線が 2px(中心 = 64k+0.5)だから。閾値は緩めていない。
- 行数 16 = 偶数 ⇒ midR = 絵ローカル **row 7**(前室 = 大扉と石段の行 / 玄室 = 石段の足元と石棺の行)。rect の出発点 = #104 と同じ `[6, 16, 21, 39]`・写像 = 絵ローカル + (16, 6)・入場 global (18,13) = 絵ローカル (2,7)・n0 の出口 (39,13) = 絵ローカル (23,7) = 石段。
- 24x16 = 3:2 = 在庫「ノードボス 9×6 (3:2)」と同比 ⇒ `LINT_PAINTING_ASPECTS` に行は要らない見込み(項目2 で `driver_graph_p6` (2c))。
- 2 枚とも屋内(⛔ `outdoor` を付けない = §8 (2d))。

**MASK 草案(⭐ 唯一の正。`#` = 塞ぐ・`.` = 歩ける。外周 1 マスは `.` = sealRing の仕事)** — 道具 `r105/item1/map/masks.py`(sealRing を模した 4 近傍 BFS・重ね絵 `overlay_hall.png` / `overlay_crypt.png` で目視済み)

```
n0big 墓所の前室 (24x16)
"........................",  // 0  外周 (sealRing)
".######################.",  // 1  北の黒い余白・控えの間の北壁
".######################.",  // 2  控えの間の北の壁龕 (青い灯)・回廊の北の余白
".#.....################.",  // 3  控えの間の床 col 2-6 / 回廊の北壁
".#.....###########....#.",  // 4  col 7 崩れた石 / 回廊の北の壁龕の足元と台座の上半分 col 8-17 / 東の間 col 18-21
".#......#.#.#.#.#.....#.",  // 5  回廊の北の台座 col 8,10,12,14,16 (間の床・墓石の蓋 col 13・折れた矢 col 15 は平置き)
".#......................",  // 6  col 1 = 大扉の北の扉板 / col 22-23 = 石段
"........................",  // 7  ⭐ 入口の行 = 大扉 → 石段まで端から端まで開ける (midR)
".#......................",  // 8  col 1 = 大扉の南の扉板
".#......................",  // 9
".#......#.#.#.#.#.....#.",  // 10 回廊の南の台座 col 8,10,12,14,16
".#.....################.",  // 11 回廊の南壁 (壁龕) / col 7 崩れた石の角
".#.###.################.",  // 12 控えの間の南の壁龕 col 3-5
".######################.",  // 13
".######################.",  // 14
"........................",  // 15
```
歩ける 140 / 入場 (2,7) から到達 138 / 孤立 = (11,0)(11,15)(sealRing が残す辺の中点 = #104 と同じ)だけ。出口 (23,7) 到達 ✅。col 1 は大扉の行 row 7 を除き全部 `#`(扉板・倒れた石板・瓦礫)。墓荒らしの松明 (2,3)・背負い袋 (2,4)(3,3)・折れた矢は平置き = 塞がない。

```
n1big 魔法使いの玄室 (24x16)
"........................",  // 0
".######################.",  // 1
".######################.",  // 2  北壁・壁龕 (柱の足元が row 2 に掛かる)
".##....####.##......###.",  // 3  col 1-2 瓦礫と倒れた石板 / 空の台座 col 7-8, 9-10, 12-13 / col 20-22 倒れた燭台・古書・東の角
".##..................##.",  // 4  col 21-22 古書の山
".##.............#####...",  // 5  ⭐ 石棺の台座 col 16-20 / row 5-9 (上に立たせない)
".#..............#####.#.",  // 6  col 1 = 石段の北の縁 / col 22 = 水晶球の破片
"................#####.#.",  // 7  ⭐ 入口の行 (石段 col 0-1 → 足元 col 2-3 → 魔法陣 → 石棺の台座で止まる) / col 22 砕けた水晶球
".#..............#####...",  // 8  col 1 = 石段の南の縁 (col 22 の破片は平置き)
".##.............#####.#.",  // 9  col 2 瓦礫 / col 22 杖立て
".##...................#.",  // 10 col 22 杖立て
".###...####.##.......##.",  // 11 col 3 倒れた石板 / 空の台座 col 7-8, 9-10, 12-13 / col 21-22 倒れた書架
".##########.##..###..##.",  // 12 南の壁龕 col 4-6 (+瓦礫 col 1-3) / 台座 col 7-10, 12-13 / 壁龕 col 16-18 / 書架 col 21-22
".######################.",  // 13
".######################.",  // 14
"........................",  // 15
```
歩ける 144 / 到達 141 / 孤立 = (11,0)(11,15)(23,7)(砕けた水晶球の裏 = #104 の祭壇の裏と同じ)。魔法陣の床は平置き = 塞がない。⚠ 空の台座は絵の上で 2 列にまたがる(x 470-535 / 615-670 / 800-855)ので両列とも `#`。石棺の西 col 3-15 は開けた床。

#### (4) 敵の置き場(出発点。絵ローカル → global = + (16, 6))

| ノード | 敵 | 絵ローカル | global | 入場 (2,7) からの距離 |
|---|---|---|---|---|
| n0 | 骸骨 ×3(戻らなかった墓荒らし) | (5,3)(6,3)(6,4) | (21,9)(22,9)(22,10) | 5.0 / 5.66 / 5.0(480px > melee 交戦 400px) |
| n0 | 墓所の動く鎧 ×2(石段の前) | (21,6)(21,8) | (37,12)(37,14) | 19.03 |
| n0 | 2 群の最短 | (6,4)-(21,6) | | **15.13 > DETECTION_RANGE 12.5** = 別々の戦闘 |
| n1 | マミー(ボス・石棺の西) | (15,7) | **(31,13)** | **13.0** ≥ 13 |
| n1 | 墓所の動く鎧 | (15,9) | (31,15) | 13.15 |
| n1 | 墓所のガーゴイル ×2 | (15,4)(15,10) | (31,10)(31,16) | 13.34 |

全部 MASK で `.`・入場から到達可・マミーの隣 (14,7)(15,6)(15,8) も到達可(本番の `aStar` は受入 (2b))。

#### (5) シート 2 枚の取り込み

| | `mummy`(墓所の主) | `tombArmor`(墓所の動く鎧) |
|---|---|---|
| 素材 | `codex1/assets/tomb-mummy/tomb-mummy-walk-attack-right-6-v2-aligned/`(⭐ v2) | `codex1/assets/tomb-armor/tomb-armor-walk-attack-right-6-aligned/` |
| 台帳 | `tools/codex1_sprites.json` に 1 行(plaguePriest の直後) | 同(mummy の直後) |
| シート | `assets/mummy_anim.png` 576x480 / 96px / 6 列 / rowOffset 0 | `assets/tombArmor_anim.png` 576x480 / 96px / 6 列(⛔ `animatedArmor_anim.png` は上書きしていない = mtime 2026-06-06 のまま) |
| char_ratio | **0.80**(0.86 だと attack の腕が fit right=96・top=1 で余白 0 = plaguePriest と同じ理由で下げた) | **0.86**(skeleton / zombie と同じ物差し) |
| fit(cell 96) | left=26 right=93 top=6 クリップ無し・attack_scale auto 1.0209 | left=26 right=76 top=5 クリップ無し・attack_scale auto 1.0367 |
| 再現性 | 台帳から `--out-dir` へ再パック = バイト一致 | 同 |
| `check_sprite_doubling.py` | 候補なし(attack 4 コマに wide-pose の WARN = 伸ばした腕・clusters=1 = 分身ではない) | **clean** |
| `check_alpha_bg_residue.py` | 疑い 0 件(6 セル) | 疑い 0 件(6 セル) |
| 縁のマゼンタ(ユーザー判断「このまま使う」・⛔ 色は加工していない) | 本番の玄室の床の上で 2 倍で目視 = **包帯の垂れの先が赤みがかって見える**(walk / attack とも・`r105/item1/sprite/mummy_on_crypt.png`)。等倍では「包帯の汚れ」にも読める程度。画素(r ≥ b−10 かつ b, r > g+50)186 / 不透明 35978 | 本番の前室の床の上で 2 倍で目視 = **attack の輪郭に紫の縁がうっすら**(`tombArmor_on_hall.png`)。画素 92 / 39144。参考: 採用済みの koboldChief 95 / lich 92 |
| 体高(walk の bbox 最大) | 77 / 96 | 82 / 96 |
| **displaySize(推奨)** | **100** = 画面 80px(plaguePriest 100 → 79 / scar 100 → 85 / zombie 82 → 70 / skeleton 72 → 57)= 人間大のボス | **78**(写し元のまま)= 画面 67px(skeleton 57 / gargoyle 80 → 62 / zombie 70 の間・マミー 80 より小さい)。並べ絵 `lineup.png` で不自然なし |
| 攻撃の当たりコマ | 腕の伸びが col 2〜3 ⇒ plaguePriest の `attackDuration 26 / attackHitFrame 11`(フレーム = floor(attackTimer/4)・index.html:13918 → col 2)をそのまま写せば合う | 突きが col 3 ⇒ 写し元 `animatedArmor` の `24 / 12`(→ col 3)がそのまま合う |

- ⚠ 縁は**記録のみ**。目立つかどうかはユーザーの判断(別チケット候補 = 受け取り側の色の分離)。

#### (6) ターン・アンデッドの扱い(⛔ 仕組みは触らない)

- `allyTurnUndead`(index.html 30353-)の対象は `isUndeadEnemy(e)`(`def.undead || type === "skeleton"`)**だけ** = ボスを除外しない。既存のアンデッドのボス **`lich`(`isBoss` + `undead`)と同じ扱い**になる: HP ≤ Lv×3(Lv5 = 15)なら浄化、それ以外は `stunned = max(.., turnDuration 3)`。
  ⇒ `mummy` に `undead: true` を付けるだけで足りる。SRD の Mummy にターン耐性は無い(リッチにはある)ので、本作の扱いは SRD に反しない。
- ホールド・パーソンはアンデッドとボスに無効(`holdPersonImmune`)。眠りは `isUndeadEnemy` で自動の免疫(⛔ `ENEMY_TRAITS` に mummy を書かない)。
- ⚠ Lv5 の僧侶はマミーを 3 手番止められる = ⑤ の強さに効く。⑤ で僧侶入りの盤面とターン・アンデッドの回数も記録するとよい。

#### (7) 名指し golden の着手前の色(`fa21d59`)

- 測った日: 2026-10-30 17:37〜18:09(昼 = 闇市の夜の窓の外)。走らせ方 `bash ~/.claude/dev-loop/r105/item1/run_golden.sh`(28 本を素で直列・timeout で包まない)。ログ `r105/item1/golden_logs/`
- 名簿 = §2-9 の grep 17 本(verify_lost_cargo を含む)+ verify_lore_check + driver_graph_p6 + 件数系 4 本(party_four / counterspell / run_chronicle / cleanup_phase1)+ §8 末尾の verify_enemy_traits / verify_fort_fold / verify_temple_fold + 参考 verify_codex_map_skill
- ⭐ 着手前から赤 = **2 本だけ**(#103 / #104 と同じ・#105 帰属ではない): driver_mapeditor_painting §1 1d2 / verify_codex_map_skill (3a) stag-tavern。他の 26 本は緑。
- 走行中に並行した作業: GRIDS 2 行・地図 2 枚・シート 2 枚・台帳 2 行の追加(本番ページは読まない資産)と札の実測(port 10694)。verify_codex_map_skill は GRIDS を触る前に走り終えた(17:37:48)。

| ドライバ | exit | 色 | 秒 |
|---|---|---|---|
| **verify_codex_map_skill** | 1 | **16/17 PASSED FAILED 1 PENDING 0** — (3a) stag-tavern の検算 NG だけ赤(着手前から)。⭐ GRIDS 2 行を足した後に再走 = 台帳 24 件・SHA 24 件一致・(3b) 24 行 OK・赤は同じ (3a) stag-tavern だけ | 22 |
| driver_graph_p6 | 0 | ══ 結果: 250/250 PASS ══ | 41 |
| verify_dragon_fold | 0 | PASS 35 / FAIL 0 | 2 |
| verify_kobold_warren | 0 | 21/21 PASSED FAILED 0 PENDING 0 | 103 |
| verify_lost_cargo | 0 | 22/22 PASSED FAILED 0 PENDING 0 | 174 |
| verify_plaza_map | 0 | 43/43 PASSED FAILED 0 節 27 (101 秒) | 101 |
| verify_quest_draw | 0 | 18/18 PASSED FAILED 0 PENDING 0 | 36 |
| verify_quest_visibility | 0 | 素 39/39 PASSED (PENDING 0) | 16 |
| verify_quest_walk | 0 | 25/25 PASSED FAILED 0 PENDING 0 | 130 |
| verify_road_ambush | 0 | 41/41 PASSED | 68 |
| verify_road_boon | 0 | 20/20 PASSED FAILED 0 PENDING 0 | 68 |
| verify_road_events | 0 | 25/25 PASSED FAILED 0 PENDING 0 | 81 |
| verify_swamp_novice | 0 | PASS 34 / FAIL 0 | 10 |
| verify_tavern_map | 0 | 47/47 PASSED FAILED 0 PENDING 0 | 21 |
| verify_tower_mother | 0 | 19/19 PASSED FAILED 0 PENDING 0 | 125 |
| verify_tower_mother_b | 0 | 22/22 PASSED FAILED 0 PENDING 0 | 332 |
| verify_world_heromark | 0 | 18/18 PASSED FAILED 0 PENDING 0 | 10 |
| verify_world_map | 0 | 57/57 PASSED FAILED 0 PENDING 0 | 68 |
| verify_world_steps | 0 | 33/33 PASSED FAILED 0 PENDING 0 | 54 |
| **driver_mapeditor_painting** | 1 | **PASS 105 / FAIL 1 (合計 106)** — §1 1d2 だけ赤(labels 23 種 / サイズ 21 種 = 差 2。#104 と同じ・着手前から) | 8 |
| verify_lore_check | 0 | 26/26 PASSED FAILED 0 PENDING 0 | 3 |
| verify_party_four | 0 | PASS 17 / FAIL 0 | 8 |
| verify_counterspell | 0 | 25/25 PASSED FAILED 0 (52 秒) | 52 |
| verify_run_chronicle | 0 | [run-chronicle] 74 PASSED / 0 FAILED / 0 PENDING | 188 |
| driver_cleanup_phase1 | 0 | [driver] RESULT: 28/28 passed | 18 |
| verify_enemy_traits | 0 | 15/15 PASSED FAILED 0 PENDING 0 | 4 |
| verify_fort_fold | 0 | PASS 30 / FAIL 0 | 2 |
| verify_temple_fold | 0 | PASS 24 / FAIL 0 | 158 |

### 12-2. 項目2 — 本体(2026-10-30・基準 HEAD `0014d8f`)

⭐ §4〜§7 を全部入れた。作業の置き場 = `~/.claude/dev-loop/r105/item2/`(申し送り `r105/item2_notes.md`)。依頼書からの差は下の「決めた値」の 3 つだけ。

#### (1) 決めた値と根拠

| 論点 | 決定 | 根拠 |
|---|---|---|
| `difficulty` | **「★★」**(出発点「★★★」から変えた) | §12-1 (1) の帯: 本筋外は ☆ なしで数だけ(巣穴 Lv2「★」/ 倉庫街 Lv4「★★」/ 塔の母 Lv7「★★★」)。Lv5 は 4 と 7 の間で 4 寄り = 「★★」。★★★ は塔の母と同じ = Lv7 相当に見える |
| `lake_n` の `signDx` | **64**(⚠ 項目1 の見込み「足さない」から変えた) | ⚠⚠ 予告外の赤: `verify_world_steps` (2c)「刻み点マーカーが押せる」— signDx 0 だと墓所の札が北西の刻み点 `farm_n__pass_n@1` (672,160) のマーカーの上に被さり、elementFromPoint が札を返す(**刻み点が押せない** = 本物の欠陥。項目1 は主人公と札の重なりしか測っていなかった)。道具 `r105/item2/measure_signdx.js`(本番の world-map.js の lake_n 行だけをメモリで差し替え・cleared = 10 本)で掃引: 1280/1440 幅では 52 が赤・**56 から緑**(390 幅は 48 から緑)。余白を見て 64。実測 (64) = 刻み点 10 個とも押せる・札 11 枚の 5 点は奪われない・札どうしの交わり 0・主人公が farm_n__pass_n@1 に立つと墓所の札を隠す割合 **8.1% (1440) / 6.2% (390)**(signDx 0 は 20.6% / 20.3%)。⚠ **390 幅で主人公が `farm_n` に立つと札の右端が画面外へ 34px 出る**(signDx 0 でも右端 375/390 = 寸前・#104 の倉庫街の 24px と同じ種類 = §9 実機・ユーザー判断の材料)。参考: 390 幅で `pass_n` の札の 1 点が `worldBack`(戻るボタン)に奪われるのは signDx 0 でも同じ = 本件の前から |
| `LINT_PAINTING_ASPECTS` | **足さない** | `driver_graph_p6` 250/250 PASS(24x16 = 3:2 が在庫にある) |
| `detectEnemyFamily` | `mummy` を undead へ(**新しい行**を 1 本足した・既存の行は触らない) | §5-2 の「可」。台詞は既存のアンデッドのものを引くだけ。墓所専用の動く鎧 / ガーゴイルは元の 2 種と同じく generic のまま |
| 鳴き声 | `SPEECH_LINES` の閉じの直後に**参照の代入** 2 行(`SPEECH_LINES["enemy.cry.tombArmor"] = SPEECH_LINES["enemy.cry.animatedArmor"]` ほか) | 文言を新しく書かない(§5-2b)。文字列の写しではない = 変異アンカーが 2 回ヒットする罠E は起きない。煙検査の画面で「ガシャン! ガシャン!」を目視 |
| `tombGargoyle` の `physicalResistance` | 写した | SRD の Gargoyle の体質(守護者の仕掛けではない)。持たせないのは `faction` / `startsDormant` だけ |

#### (2) 煙検査(`r105/item2/smoke_tomb.js`・port 10695/10696/10711-10714 ・ ⚠ 10697/10698 は別窓のプロセスが握っていた)

| 回 | 条件 | 結果 |
|---|---|---|
| A,B | 酒場 / ワールドマップ | **SMOKE 12/12** — 開始直後は廃坑 + 巣穴・cleared=[廃坑] は 4 件のまま・cleared=[廃坑, 森] で墓所が解放・`?tomb=0` で件数が 1 減り lake_n は中継点 / 港町 → 廃坑の経路が lake_n を通り(母集団)、**通過しても開かず廃坑で開く** / lake_n を押して着くと「〈湖の北の島〉へ入りますか?」→ index の silent-tomb (n0 start / n1 boss) / world.html?tomb=0 で札なし |
| C,D #1 | xp 10000・マミー HP 400 に上げる(手番を稼ぐ操作) | 7/9 — まなざし 1 回(主人公 roll 2 = **恐怖 + 行動不能**: frightenedRemaining 3・skipNextTurn true)・マミーの手番 13・partyWillSave 0・awakenGuardians 0。HP 400 のマミーに主人公が倒れた = C3/D1 の 2 本だけ赤(操作の結果) |
| C,D #2 | xp 20000・HP 150 | 7/9 — まなざし 1 回(roll 11 = 成功)・手番 20・同上。同じく HP を上げたマミーに主人公が倒れた |
| C,D #3 | **xp 10000 (Lv5)・HP そのまま (87)** | **SMOKE 9/9** — n0 → n1 → マミー撃破 → `lastResult.cleared` (181 秒)・まなざし 1 回(仲間ミラ roll 13 成功・sleepWatchHp null)・手番 11 |
| C,D #4 | 同上 | **SMOKE 9/9** — 221 秒でクリア・まなざし 1 回(主人公 roll 14 成功)・手番 5 |
| 絵 | `shot_armor.js`(Lv5・HP そのまま) | 2 回とも VICTORY。新しい動く鎧の歩き(前室・頭上札「動く鎧」・鳴き声)・攻撃(玄室)・倒れ(宝箱を落とす)を全画面で目視。範囲スリープの語り「2体は眠らない (動く鎧, 墓所の主(マミー))」= 体質と undead の眠り免疫が効いている |

4 回すべてで: n0 = 骸骨 3 + 動く鎧 2・罠 1 つ `dart` / n1 = マミー 1 (31,13) + 動く鎧 1 + ガーゴイル 2・罠 1 つ `glyph`・**誰も inactive / dormant / faction beast でない(200ms ごとに全期間監視して 0 件)**・「古代王国の守護者」のバナー 0・「👁 恐怖のまなざし 👁」のバナーちょうど 1 回・`traps.length` は発動の前後で 1 のまま・pageerror / console.error 0。⇒ ⚠ 強さは ⑤ で測る(HP を上げた 2 回の敗北は強さの参考にしない)。
砦の守護者(元の `animatedArmor` / `gargoyle`)は `verify_fort_fold` PASS 30 / FAIL 0(休眠 5 体の旧 n6 を含む)・`verify_temple_fold` 24/24 = 従来どおり。

#### (3) 名指し golden(基準 = §12-1 (7)。走らせ方 `bash r105/item2/run_golden.sh`・18:49〜19:21 = 昼。signDx 後に世界地図系 8 本を再走 = `r105/item2/golden_logs2/`)

- 緑のまま: driver_graph_p6 250/250・verify_kobold_warren 21/21・verify_plaza_map 43/43・verify_road_boon・verify_tower_mother 19/19・verify_tower_mother_b 22/22・verify_counterspell 25/25(まなざしは HP を引かない = 予告どおり)・verify_run_chronicle 74/0・driver_cleanup_phase1 28/28・verify_fort_fold 30/0・verify_temple_fold 24/0
- 着手前から赤(範囲外): verify_codex_map_skill (3a) stag-tavern・driver_mapeditor_painting §1 1d2(labels / サイズの差は同じ 2)
- **予告外で赤 → 本体で直した**: verify_world_steps (2c) → `signDx: 64`(上の表)。再走で緑
- **予告どおり赤(項目4 で言い直す)** = `r105/item2_notes.md` の表(件数・枚数・sha1・行の集合だけ)
