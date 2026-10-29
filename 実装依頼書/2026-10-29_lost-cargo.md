# #104 新しい行き先「消えた積み荷」— 港の倉庫街の床下から、疫病の教団の祠へ(推奨 Lv4・廃坑の後・本筋の外)

- **起草**: 2026-10-29(起草窓) / **ステータス**: **承認済**(2026-10-29 ユーザー承認)
- **着手**: ✅ **着手できる**(2026-10-29 素材 3 本とも納品・起草窓が受け取りの目視と検算まで済ませた = §2-10。⚠ 地図の格子の一次解は偽解の疑い → 項目1 で解き直す)
- **基準 HEAD**: `ddf3368`(#103 完了・origin と同期。⚠ 着手時に必ず測り直すこと)
- **会議**: `dev-meetings/2026-10-28_new-locations.md` の第1段 候補③(第2段の計画書は無い → §1 の表のユーザー決定 2026-10-29 が代わり)
- **手順の型**: `実装依頼書/_TEMPLATE_new_location.md`(本書はそれを写して埋めたもの)
- **触るファイル**: `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `world.html`(撤退スイッチの読み取り 1 箇所だけ)/ `tools/make_grid_map.py`(台帳 2 行)/ `tools/codex1_sprites.json`(台帳 1 行)/ `assets/`(焼き上がり 2 枚 + 司祭のシート)/ 既存 golden の言い直し / `tools/verify_lost_cargo.js`(新規)/ `js/changelog.js`(ヘルパー経由)
- ⏸ **着手の前提 = 素材 3 本の納品**(§2-10)。起草時点では地図 2 枚も司祭の絵も**無い**。起草窓が codex1 への依頼文 2 本を起草済み(承認後に投下)。⛔ **既存の地図・既存の絵を仮に借りて先に進めない**(#103 のユーザー決定「ダンジョンは新規で」を引き継ぐ)。
- 並走: なし(2026-10-29 起草時の `git status` は clean)

---

## 1. 目的

ワールドマップの行き先を、D&D らしい依頼で 1 か所ずつ増やす方針の **2 か所目**(順番 = ① コボルドの巣穴 ✅ → **③ 倉庫街の教団** → ② 湖の島の墓所 → ④ 湖畔の魔女)。型は「街に潜む教団」。

> 港の荷主が酒場に来る。「倉庫に入れた積み荷が、夜のうちに消えるんです。錠は壊されていない。番人も一人、戻ってこない……床下から歌が聞こえると言う者もいます」
> 倉庫に入ると、かじられた木箱と、床板の下へ続く穴。穴の先は古い地下水道で、その奥には、疫病の神を拝む教団の祠があった。緑に光る汚水、ろうそくの列。消えた番人は、そこで歩く屍になっていた。

港町から歩いてすぐの場所が、実は一番おぞましい——という落差が狙い(会議 第1段 ミサキ案)。

**ユーザー決定(2026-10-29・AskUserQuestion 4 問。すべて推奨案)**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 置き場所 | 本筋の外(`side: true`)。**`pier`(船着き場)を拠点「港の倉庫街」へ格上げ** | — (会議で決定済み) |
| 解放と推奨 Lv | **廃坑の後・推奨 Lv4**(`locked: true` + `unlockAfter: "goblin-mine"`。森と同時に解放) | 最初から・Lv3(開始直後の卓が 3 件からの抽選に変わり、言い直す golden が増える)/ 森の後・Lv5(序盤の穴埋めにならない) |
| ダンジョン | **地図 2 枚とも新規**(倉庫 → 地下水道の祠) | ⛔ 既存の地図を借りる(#103 の決定を引き継ぐ) |
| ボス | **新しい絵の「疫病の司祭」1 体**(codex1 へ発注) | 仲間の僧侶の絵を流用(酒場で仲間になる僧侶と取り違える)/ 蛇神司祭を流用(リザードマンなので「港町の人間の教団」とずれる) |
| 手下 | **既存の絵だけ**: ジャイアントラット `rat`・ゾンビ `zombie`・巨大ガエル `plagueFrog` | 人間の信者 Cultist を発注(発注が 1 本増える) |
| ボスの特別な行動 | **「傷を腐らせる手」= 5e SRD の Cult Fanatic の呪文 Inflict Wounds**(1 戦闘 1 回・1 人へ死霊の大ダメージ) | 命令「ひれ伏せ」(Command)/ 特別な行動なし |

---

## 2. 着手前の実測(基準 HEAD `ddf3368`)

### 2-1. ⚠⚠⚠ `pier` は**ゲーム開始の立ち位置**(巣穴・塔には無かった条件)

| 実測 | 出所 |
|---|---|
| `pier: { kind: "way", x: 352, y: 608 }`。辺は `["pier", "phlan"]` の **1 本だけ** = 行き止まり | `js/world-map.js:70` / `:90` |
| `spawnFor("title")` は **`"pier"` を返す**(キャラ選択の後は桟橋に立つ)。`verify_world_map (4s-3)` がこれを縛る | `js/world-map.js:216` / `tools/verify_world_map.js:1539` |
| 拠点の入場は**「押した行き先へ着いたとき」だけ**(`onArriveStep` → `arrived && WM.has` → `onArriveNode`)。湧いた瞬間には呼ばれない | `world.html:1503-1517` |
| 札は `n.kind === "site" && shown` のときだけ出る(`shown` = `isRevealed`) | `world.html:1052` / `:1062` |

⇒ 3 つの帰結:

1. **開始直後は今日の見た目のまま**。依頼は廃坑の後に解放されるので、`isRevealed` が偽 = `pier` に札が出ない(中継点の丸)。
2. **湧いても入場ダイアログは開かない**(押して着いたときだけ)。⚠ ただし「受注中に桟橋へ湧く」経路は今まで無かったので、§8 (1g) で**機械で確かめる**。
3. **港町からの道は 1 歩**(phlan → pier)。受注して町を出ると phlan に立ち、桟橋を押すと 1 ホップで着く。

⭐ 街道の出来事・襲撃への影響は**無い**: `pier` は行き止まりなので「通りすがり」にならず、着いたときは `onArriveStep` が入場を先に処理して return する(`world.html:1517`)。⇒ `isRoadSite("pier")` が真になっても、今日の `pier` で出来事が起きる経路は元から無い(`js/road-events.js:46` の `pier: "coast"` は触らない)。

### 2-2. ⚠⚠ 札の重なり — 港町フランの札は左へ 72px 逃がしてある

`phlan` は `signDx: -72`(主人公が北の辻に立つと札を隠すため・`js/world-map.js:47-56`)。札は足元から上へ 76px の位置に出る(`world.html:352-358`・札の下端 = ノードから −98px)。

| | ノード | 札の中心 x | 札の下端 y(机上) |
|---|---|---|---|
| 港町フラン | (416, 544) | 416 − 72 = 344 | 544 − 98 = 446 |
| 港の倉庫街(新) | (352, 608) | 352 | 608 − 98 = 510 |

⇒ 横はほぼ真上に重なり、縦は倉庫街の札の上端(≈ 510 − 47 = 463)とフランの札の下端 446 の間が **約 17px**。**机上では重ならない見込み**だが、札の高さ 47px は 1440x900 / zoom 0.8125 での実測値(`js/world-map.js:51`)で、地図 px と画面 px の換算をこの窓では確かめていない。
⇒ **項目1 で実ブラウザで測る**(両札の `getBoundingClientRect()` の交わりの面積)。重なるなら**倉庫街の側に** `signDx` を足す(⛔ フランの `signDx` は動かさない = 北の辻の理由が生きている)。§8 (1f) が縛る。

### 2-3. 新しい行き先を足す口(全数・`kobold-warren` の足跡を今の行番号で数え直した)

`grep -n "kobold-warren\|koboldChief\|koboldSnare\|warren\|Warren"` を手順の型 §1 の 7 ファイルにかけた結果(2026-10-29・`ddf3368`):

| 場所 | 何 | 本件 |
|---|---|---|
| `index.html:3748` `ROAD_CHEST_GOLD` | 消えた隠し宝箱のぶんの金貨 | 要: `"lost-cargo": 50`(隠し 2 × 25) |
| `index.html:4062` `SCENARIO_TEX` | 床と壁(無い id は廃坑へ落ちる) | 要(絵の下に敷くだけ。`床1.png` / `壁1.png` でよい) |
| `index.html:4690` `NODE_EXTRA_SPAWN_KINDS` | ⚠ 宣言しないと罠と宝箱が**黙って 0** | 要: `t["lost-cargo"] = { n0: ["search", "loot"], n1: ["search"] };` |
| `index.html:6780` `ROOM_PAINTINGS_DEF` | 大部屋の絵 + MASK。`node: true` | 要: `n0big` / `n1big`。⭐ **2 枚とも屋内**(`outdoor` を付けない = 霧が効く) |
| `index.html:10459` `ENEMY_TYPES.koboldChief` | ボスの型 | 写し元(§5-2) |
| `index.html:11707` `SCENARIOS` | 依頼の数値 | 要(§6) |
| `index.html:15446` `detectEnemyFamily` | 掛け声の家系 | **触らない**(司祭は generic のまま・新しい台詞を足さない) |
| `index.html:15665` `SCENARIO_NARRATIONS` | 開幕の語り 4 行 | 要(§6) |
| `index.html:18594-18599` 検証シーム `__koboldWarrenTV` | ドライバ用の窓 | 要: `__lostCargoTV`(同じ形) |
| `index.html:20651` 巣穴専用の DM の一言 | | 写し元(任意。司祭の手番で語るので無くてよい) |
| `index.html:22483` `koboldSnare(enemyIdx)` | ボスの手番の特別行動 | **写し元**(§5-3) |
| `index.html:29737` `LORE_SKILL_OF` | 伝承の技能 | 要: `plaguePriest: "religion"` |
| `index.html:29766` 付近 `LORE_CR` | 5e SRD の CR | 要: `plaguePriest: 2`(⭐ 族長と違い **SRD に元がある** = Cult Fanatic CR2・§2-6) |
| `index.html:37138-37145` 仕掛け罠の入口(ボスの行動選択の前) | | 要: 同じ位置に 1 ブロック(§5-3) |
| `index.html:27391` `TRAP_TYPES` | 罠の語り | 要: `miasma` 1 行(§5-4) |
| `index.html:40555` `buildScenarioRun` の振り分け | ⚠ 行を縦に揃え直さない | 要: 1 行 |
| `index.html:41793` `buildKoboldWarrenRun()` | `p6Node()` 2 回 | 写し元(§5-5) |
| `tavern.html:3773` `scenarios` | 卓の依頼 | 要(§4-1)。写し元は**塔の母**(`:3750`・`locked: true` + `unlockAfter` の型) |
| `tavern.html:3803-3813` 撤退 `?warren=0` | | 写し元(§7) |
| `tavern.html:6136` 帰還の処理(卵の印) | | **触らない**(本件に印は無い・§11) |
| `js/world-map.js:70` `NODES.pier` | 中継点 | 要: `kind: "site"`・`label`・`desc`(⛔ id・座標・`EDGES` は変えない) |
| `js/world-map.js:158` `SITES` / `:176` `UNLOCK` / `:386` `retireWarren` / `:398` 公開 | | 要: 1 行ずつ + `retireCargo()` |
| `js/world-map.js:42` 札の数のコメント「ちょうど 9 つ」 | | 要: 10 へ |
| `js/df-mapdef.js:51` `THEMES` / `:1893` `THEME_DEFAULT_ENEMIES` / `:2233` `LINT_PAINTING_ASPECTS` | | `THEMES` 要・`THEME_DEFAULT_ENEMIES` 推奨・縦横比は焼き上がりしだい(23x15 / 23x16 なら**在庫にある** = 足さない) |
| `world.html:670-673` 撤退 `?warren=0` | | 要: `?cargo=0` を隣へ 1 行 |
| `tools/make_grid_map.py:457` / `:477` `GRIDS` | | 要: 2 行 |
| `tools/codex1_sprites.json:237` | | 要: 1 行 |

⚠ BGM は全シナリオ共通(`sceneBgmTrack()`)= **作業なし**。

### 2-4. ⚠⚠⚠ 罠の 3 つの落とし穴(手順の型 §4)— 本件での当てはめ

1. **罠は戦闘中に発動しない**(`checkTrapTrigger` が `encounterActive || encounterRunning` で return)⇒ 司祭の「傷を腐らせる手」は罠ではないが、**ボスの手番の行動として作る**点は同じ(§5-3)。
2. **罠の数はノードごと**: `trapCount: 1` + n0・n1 の両方に `search` = 部屋ごとに 1 つ。種類は `trapTypeByNode: { n0: "pit", n1: "miasma" }`。
   - n0 の `pit` は**既存の行をそのまま使う**: 語り「足元の板が抜けた——落とし穴だ!」が**倉庫の腐った床板**にそのまま合う(`index.html:27395`)。
   - n1 の `miasma` は**語りだけの新しい行**(ダイス・解除 XP は `damage` と同じ)。⛔ `Math.random` を 1 つも足さない・減らさない。⛔ 新しいダイスを足さない。
3. **開始直後の卓は変わらない**(⭐ #103 と違う点): `locked: true` で足すので、開始直後の解放済みは「廃坑 + 巣穴」の 2 件のまま = 卓も今日のまま。
   ⚠ ただし **`cleared=[廃坑]` の世界が変わる**: 解放済みが「廃坑・森・巣穴」の 3 件 → **4 件**(+ 倉庫街)。卓は「本筋 = 森」+ 残り 3 件から 1 件の抽選になる(`tavern.html:11409-11417` `drawBoard`)。⇒ `cleared=[廃坑]` の件数や抽選を縛る golden(少なくとも `verify_quest_draw`)は言い直しが要る(§8 既存 golden)。

### 2-5. 解放の鎖(`boardFacts` / `isUnlocked`)

| 実測 | 出所 |
|---|---|
| 本筋の判定(`frontier` / `nextLocked`)は `side` を除いた 6 本だけで行う。抽選の母集団 `unlocked` には side も入る | `tavern.html:11377-11383` |
| 塔の母 = `locked: true` + `unlockAfter: "orc-fort"`。world 側の `UNLOCK["tower-mother"] = "orc-fort"` と対 | `tavern.html:3765-3766` / `js/world-map.js:183` |
| 推奨 Lv の帯: 廃坑 3 / 森 4 / 沼地 5 / 塔の母 7 / 巣穴 2 | `tavern.html:3626` / `:3649` / `:3669` / `:3755` / `:3778` |
| 森の数値: `perceptionDC: 14`・`trapCount: 4`・`hiddenChestCount: 3`・`clearXp: 500`・`ROAD_CHEST_GOLD 75` | `index.html:11569-` / `:3742` |

⇒ 倉庫街は `unlockAfter: "goblin-mine"`・`recommendedLevel: 4`。数値は「森より一段軽い本筋外」を出発点にする(§6)。

### 2-6. 司祭と手下の型

| 実測 | 出所 |
|---|---|
| 5e SRD **Cult Fanatic**: CR2・AC13・HP22(6d8+6)・WIS 13・呪文 DC11 / 呪文攻撃 **+3**・短剣 +4(1d4+2)×2・Dark Devotion・呪文に **Inflict Wounds**(5e: 近接の呪文攻撃・命中で **3d10 死霊**) | Dropbox `raw/srd/monsters/cult-fanatic.md` |
| 5e SRD Cultist(CR1/8・HP9)も在るが、本件では使わない(ユーザー決定) | 同 `cultist.md` |
| 人間の敵の絵: 盗賊 5 種と NPC の僧侶 6 変種(`assets/cleric_*`)だけ。**敵側の人間の聖職者は無い** | `ls assets` |
| `rat`: HP4・AC14・XP50 / `zombie`: HP26・AC12・XP180・`undead: true`・遅い(0.5)/ `plagueFrog`(表示名 Giant Frog): HP5・AC13・XP90 | `index.html:10246` / `:10498` / `:11231` |
| `koboldChief`: HP27・AC14・atk+4・`isBoss`・`displaySize: 72`・`snareDC 12` / `snareDice "1d6"`・XP200 | `index.html:10459-10477` |
| `verify_lore_check` の固定数: `N_TYPES = 51+2+1`(=54)・`N_SKILL = 40+2+1`(=43)・`N_NATURE = 11`・`N_CRKEYS = 34+2`(=36)・`N_NOCR = 17+1`(=18) | `tools/verify_lore_check.js:128` |

⇒ 司祭 `plaguePriest` は **SRD の Cult Fanatic をもとにしたボス**。`LORE_CR` に載せる(2)= #76 の決まり(SRD に元がある敵は CR をそのまま)。`LORE_SKILL_OF` は `religion`(SRD の技能に religion がある・教団の知識)。⇒ `verify_lore_check` は **55 / 44 / 11 / 37 / 18** へ言い直す。

### 2-7. 敵の呪文の仕組みは使わない

敵には実スペルの仕組みがある(`spellcaster: true` / `spells: [...]` / `spellDC` / `spellCooldownTurns`・`index.html:35922` 付近・蛇神司祭が使う)。だが **Inflict Wounds は呪文表に足さない**:
- 呪文表に足すと、AI の呪文選び・クールダウン・射程の抽選に混ざり「1 戦闘 1 回」が保証できない。
- 表の呪文はほかの術者も引ける。⛔ 他の敵に使わせない(ユーザー決定は「ボスの特別な行動」)。

⇒ `koboldSnare` と同じ「**ボスの手番の行動・最初の手番に 1 度だけ**」で作る(§5-3)。

### 2-8. 推奨 Lv と仲間の Lv

`questLevelOf()` が `recommendedLevel` を返し、仲間の Lv はその帯から振られる(#72)。⇒ 推奨 Lv4 なら仲間も Lv4 前後。⚠ Inflict Wounds の 3d10(平均 16.5・最大 30)は **Lv4 の魔法使いを 1 撃で倒しうる**。値は SRD のまま出発し、⑤ で「1 撃で倒れた回数」を記録してユーザーが判断する(⛔ 実装窓が勝手に下げない)。

### 2-9. 名指しで色を控える既存 golden(着手前に実走)

- `grep -l -E "kobold-warren|SITES|boardFacts|nextLocked" tools/verify_*.js tools/driver_*.js` = **17 本**(2026-10-29): `verify_dragon_fold` / `verify_kobold_warren` / `verify_plaza_map` / `verify_quest_draw` / `verify_quest_visibility` / `verify_quest_walk` / `verify_road_ambush` / `verify_road_boon` / `verify_road_events` / `verify_swamp_novice` / `verify_tavern_map` / `verify_tower_mother` / `verify_tower_mother_b` / `verify_world_heromark` / `verify_world_map` / `verify_world_steps` / `driver_mapeditor_painting`
- `pier` を名指しする本: `verify_quest_walk`(変異 `pier`)/ `verify_world_map`(4s-3・972 行の 0 タップ)— ⭐ 本件で一番動きうる 2 本
- 敵の在庫: `verify_lore_check` / 地図と lint: `driver_graph_p6`
- 件数系(#103 で名指しの外から見つかった本): `verify_party_four` (0a) / `verify_counterspell` (4c) / `verify_run_chronicle` (0c) / `verify_plaza_map` (5a) / `driver_cleanup_phase1` (D4)
- ⭐ 母集団の全数は、いつもどおり項目4 の全数走査で拾う

### 2-10. 素材(起草時点で 0 本・起草窓が依頼文 2 本を起草済み)

| 素材 | 依頼文 | 納品先(codex1) |
|---|---|---|
| 地図 2 枚(倉庫 → 地下水道の祠) | `codex1/requests/2026-10-29_lost-cargo-maps.md` | `assets/maps/cargo-warehouse-v1.png` / `assets/maps/cargo-shrine-v1.png` |
| 疫病の司祭(walk 6 + attack 6) | `codex1/requests/2026-10-29_plague-priest.md` | `assets/plague-priest/plague-priest-walk-attack-right-6-aligned/` |

**納品の記録(2026-10-29 起草窓)**:

| 素材 | 置き場 | 起草窓の実測 |
|---|---|---|
| 港の倉庫 | `C:\Users\PC_User\Desktop\codex1\assets\maps\cargo-warehouse-v1.png`(md5 `ec11f452…`・1536x1024) | ⭐ read-only の下見だけで生成(#103 と同じ)= 本番投下はせず受け取り側で保存。目視 = 西の端の中ほどに開いた入口(月明かり)◎ / 東の端の中ほどに梯子ののぞく床の穴◎ / かじられた木箱・錠のかかった木箱・割れたランタンと帽子・ネズミの足跡・穴へ続く緑の染み◎ / 床は広く開けている◎。`--fit --fit-around 64` 一次解 = phase (47.50, 60.95) / period (**65.980, 61.540**) / cells (22, 15) |
| 地下水道の祠 | `…\assets\maps\cargo-shrine-v1.png`(md5 `4accda3c…`・1536x1024) | 同上。目視 = 西の中ほどに梯子の足元◎ / 光る緑の汚水は北と南の外周だけ = 横断路を切らない(橋は不要の構図)◎ / 東に緑の布の祭壇・黒い蝋のろうそくの列・骨、脇に積み荷の山◎ / 文字なし・真俯瞰◎。一次解 = phase (49.00, 47.00) / period (**59.980, 67.980**) / cells (24, 14) |
| 疫病の司祭 | `…\assets\plague-priest\plague-priest-walk-attack-right-6-aligned\`(walk 6 + attack 6・各 **768x683**)。単独フォルダ `plague-priest-walk-right-6\` / `-attack-right-6\` も在る | 下見(read-only)では保存できず → 本番 1045 秒。⚠ codex 側に Python が無く validator は PowerShell 代替(正直に申告)→ **受け取り側の Python で依頼文 §3-3 を実走**(scipy が無いので連結成分は純 Python の BFS): キャンバス一致 / 接地線 spread **0px** / 中央値差 +0.21% / 最大高 **1.029** × H_w / walk 最大幅 0.640 / attack 最大幅 0.975 / 端の接触 0 / md5 **12/12 相違** / 連結成分 各コマ 1(attack 3・5 コマ目だけ 2 = 手の緑の光。許容内)/ `check_alpha_bg_residue.py` **疑い 0 件**。QA シート(暗い煉瓦と明るい灰)目視 = フードの灰緑の長衣・腐った片手の緑の光・反った短剣・ネズミの頭蓋の首飾り◎・ペスト医師の仮面なし◎・**仲間の僧侶(白と青の法衣・金の聖印)と一目で区別できる**◎・縁の残りなし◎。⚠ 分身チェック `check_sprite_doubling.py` は取り込み(シート化)の後に項目1 で |

⚠⚠⚠ **地図の一次解は 2 枚とも偽解の疑いが濃い**: 周期 59.98 / 65.98 / 67.98 は探索窓(64 ± 4)の**端に張り付いて**おり、縦横の差も 7〜13%(巣穴は 4.5%・廃坑は 7.75%)。⇒ 項目1 で**床を 4 倍に拡大して焼き込み線の間隔を目で数え**、その周期の窓で解き直す(手順の型 §2-2)。⛔ この一次解を `GRIDS` へ貼らない。

⭐ 地図は **1 マス 64px 相当**で発注した(#103 は 48px で発注して実際の格子は 64px だった = 焼き上がり 23x15 / 23x16。今回は最初から 64 で頼み、`LINT_PAINTING_ASPECTS` の在庫に乗る寸法を狙う)。⚠ それでも**一次解は周期から疑う**(手順の型 §2-2)。

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `scenarios` に `lost-cargo` 1 件(巣穴の後ろ)・撤退 `?cargo=0` の IIFE 1 つ |
| `index.html` | `ROAD_CHEST_GOLD` / `SCENARIO_TEX` / `NODE_EXTRA_SPAWN_KINDS` / `ROOM_PAINTINGS_DEF` / `ENEMY_TYPES.plaguePriest` / `SCENARIOS` / `SCENARIO_NARRATIONS` / `TRAP_TYPES.miasma` / `inflictWoundsTouch()` と入口 / `LORE_SKILL_OF` / `LORE_CR` / 振り分け 1 行 / `buildLostCargoRun()` / 検証シーム `__lostCargoTV` |
| `js/world-map.js` | `NODES.pier` を拠点へ / `SITES` / `UNLOCK` / `retireCargo()` と公開 1 行 / 札の数のコメント |
| `js/df-mapdef.js` | `THEMES` / `THEME_DEFAULT_ENEMIES` /(要るなら)`LINT_PAINTING_ASPECTS` |
| `world.html` | 撤退 `?cargo=0` の読み取り 1 行 |
| `tools/make_grid_map.py` | `GRIDS` に `cargo-warehouse` / `cargo-shrine` |
| `tools/codex1_sprites.json` | `plaguePriest` 1 行 |
| `assets/` | `room_lost-cargo_n0_map.jpg` / `room_lost-cargo_n1_map.jpg` / `plaguePriest_anim.png` |
| `tools/verify_lost_cargo.js` | 新規(§8) |
| 既存 golden | §8 の表の言い直し(期待値は緩めない) |

⛔ 触らない: `town.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` / `js/npc-crowd.js` / `js/road-events.js`・勝利判定・`defeatEnemy()`・`runEncounter` の手番ループ(入口 1 ブロックを除く)・`checkTrapTrigger()`・`spawnFor()`・`EDGES`・`phlan` の `signDx`。

---

## 4. STEP1 — 依頼の登録(酒場・ワールドマップ)

### 4-1. `tavern.html` の `scenarios`(`kobold-warren` の後ろに足す)

```js
    /* ★[#104] 新しい行き先の 2 か所目「消えた積み荷」(本筋の外・廃坑の後)。
       ⭐ side = 卓の抽選の母集団には入るが、「本筋」「次の未解放」の判定からは外れる (#82 と同じ)。
       ⭐ locked:true = 開始直後の卓は今日のまま (廃坑 + 巣穴)。廃坑のクリアで森と同時に解放。
       ⚠ id は index.html の SCENARIOS / js/world-map.js の SITES・UNLOCK と同じ (verify_world_map (4s) が照合)。 */
    {
      id: "lost-cargo",
      place: "港の倉庫街",        /* ⚠ id の直後に置く (検証ドライバが id → place の並びで配信バイトを読む) */
      side: true,
      title: "消えた積み荷",
      difficulty: "★★",
      recommendedLevel: 4,        /* 廃坑 3 の後・森 4 と同じ帯。⚠ 強さの実測 (依頼書 §8 ⑤) で直してよい */
      reward: "荷主の礼金",
      client: { name: "マーロウ", role: "港の荷主", type: "villager" },
      dialog:
        "「倉庫に入れた積み荷が、夜のうちに消えるんです。錠は壊されていない。番人も一人、戻ってこない……" +
        "床下から歌が聞こえると言う者もいます。気味が悪くて、誰も夜の倉庫に入りたがらない。どうか調べてください」",
      enemies: [
        { name: "倉庫と地下水道の魔物", boss: false },
        { name: "疫病の司祭", boss: true },
      ],
      locked: true,
      unlockAfter: "goblin-mine",
    },
```

撤退 `?cargo=0` は `?warren=0` の IIFE の後ろへ同じ形で(§7)。

### 4-2. `js/world-map.js`

```js
    /* ★[#104] 船着き場 pier を拠点「港の倉庫街」(本筋外の依頼「消えた積み荷」) へ格上げ。
     *   ⛔ id と座標は変えない・EDGES も触らない (phlan からの行き止まりのまま)。
     *   ⚠ pier は spawnFor("title") の立ち位置。依頼の解放 (廃坑の後) までは札が出ない = 開始直後は今日のまま。
     *   ⭐ 撤退 ?cargo=0 は world.html / tavern.html が自ページで読み、retireCargo() で中継点へ戻す。 */
    pier:      { kind: "site", x:  352, y: 608, label: "港の倉庫街", desc: "桟橋の脇に並ぶ古い倉庫。床下は地下水道へ続く" },
```

- 中継点だったときのコメント(水 6.1%)はそのまま残す
- `SITES` に `"lost-cargo": "pier"`、`UNLOCK` に `"lost-cargo": "goblin-mine"`(tavern の `unlockAfter` と同じ)
- `retireCargo()` は `retireWarren()` と同じ形(`NODES.pier = { kind: "way", x: 352, y: 608 };` + `delete` 2 行)。公開行は `retireWarren` の下へ 1 行
- 札の数のコメント「ちょうど 9 つ」→ 10(★[#104] 10 個目 = pier「港の倉庫街」)
- 項目1 の実測(§2-2)で札が重なったら、**pier に** `signDx` を足す

---

## 5. STEP2 — 地図 2 枚・司祭・罠(`index.html` ほか)

### 5-1. 地図の焼き付け(`codex-map-request` スキルの段 3〜4・手順の型 §2)

1. 納品 2 枚を `--fit --fit-around 64` で測る。⚠ **床を 4 倍に拡大して焼き込み線の間隔を目で数え**、一次解の周期を疑う。直線回帰の残差(本物 ≤ 0.2px)
2. `GRIDS["cargo-warehouse"]`(out `room_lost-cargo_n0_map`)/ `GRIDS["cargo-shrine"]`(out `room_lost-cargo_n1_map`)を足し、`--name` で焼く → 3 指標(drift ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%)。⛔ 閾値を緩めない。通らなければ v2 を発注
3. MASK(5 規則): 外周 1 マス `.` / 平置きの物は塞がない / 通れない物(積み荷の山・汚水の溝・祭壇)を塞ぐ / 入口の行は端から端まで開ける / 孤立 0。⭐ **汚水の溝は `#`**(歩けない)。祭壇と供物の台も `#`
4. 焼き上がりに MASK を赤で重ねて目視。本番の最終確認は受入の `aStar`

### 5-2. `ENEMY_TYPES.plaguePriest`

`koboldChief` の定義を写し、数値だけ下の表へ(⚠ 出発点。⑤ で直してよい):

| 項目 | 値 | 根拠 |
|---|---|---|
| `name` | `"疫病の司祭"` | |
| `flavor` | `"疫病の神を拝む教団の司祭。腐った手で触れた傷は膿み崩れる"` | |
| `hp` / `ac` / `atkBonus` | **33 / 13 / 4** | SRD 22 × 1.5(ボス補正。族長 27 は SRD に元が無いので比べない)/ 革鎧 13 / 短剣 +4 |
| 攻撃のダメージ | 短剣 1d4+2(書式は既存のボスの定義に合わせる) | SRD |
| `inflictAtk` / `inflictDice` | **3 / `"3d10"`** | SRD の呪文攻撃 +3 / Inflict Wounds |
| `xp` | 450 | CR2 |
| `isBoss` | `true` | ボス枠 |
| シート | 576x480・96px・6 列(`tools/codex1_sprites.json` に揃える) | 手下と同じ物差し |
| `displaySize` | **人間大のボス(`scar` / `lizardPriest` 等)を項目1 で実測して揃える** | ⚠ 当たり判定に直結 |
| `meleeRange` / `attackDuration` / `attackHitFrame` / `attackCooldown` | `koboldChief` を写し、攻撃のコマを目で見て `attackHitFrame` だけ合わせる | |

`LORE_SKILL_OF.plaguePriest = "religion"` / `LORE_CR.plaguePriest = 2`。⛔ `detectEnemyFamily` には足さない(generic)。⛔ 新しい掛け声の台詞を足さない。

### 5-3. 傷を腐らせる手 `inflictWoundsTouch(enemyIdx)`

**写し元 = `koboldSnare`(`index.html:22483`)**。違いは「DEX セーヴ」の代わりに「**呪文攻撃 vs AC**」と、転倒が無いことだけ:

- 狙い: `pickEnemyTarget(enemyIdx)`(仕掛け罠と同じ)
- 判定: `d20() + def.inflictAtk` vs 相手の AC(主人公 `currentPlayerAc()` / 仲間 `currentAllyAc(a)` / 敵 `effectiveEnemyAc(o)`・`index.html:24709` / `:24721` / `:24933`)。⭐ 1 の出目は外れ・20 はクリティカル(ダイス 2 倍)= 既存の命中判定の作法に合わせる(項目2 で既存の関数を探して使う。⛔ 新しい作法を作らない)
- 命中: `parseDice(def.inflictDice)` のダメージ。仲間なら「不屈」の分岐も仕掛け罠と同じ手順で(写す)。倒れたら `RunChronicle.fall(ally, "傷を腐らせる手")`
- 語り: バナー `☠ 傷を腐らせる手 ☠`・DM の一言「司祭が汚れた祈りを唱える——腐った手が伸びる!」・吹き出しのラベル `HIT` / `MISS`
- probe: `window.__inflictProbe`(1 件 = 1 回の発動。`{ site: "inflict", enemyIdx, atk, ac, roll, total, hit, crit, dmg, kind, idx, target, trapsLen }`)。⛔ ゲームの判定には使わない
- **入口**: 仕掛け罠の入口(`index.html:37138-37145`)の**すぐ下**に、同じ形で 1 ブロック:

```js
      // ── ★[#104] 疫病の司祭の「傷を腐らせる手」: 戦闘の最初の手番に 1 度だけ (この手番は呪文で消費) ──
      // ⭐ 行動選択 (pickBossAction の Math.random) より**前** = 仕掛け罠と同じ理由。
      //   inflictDice を持つのは plaguePriest だけ = 既存の敵の手番と乱数列は 1 ビットも動かない。
      if (def.inflictDice && !enemy.__inflictUsed) {
        enemy.__inflictUsed = true;
        await inflictWoundsTouch(idx);
        await sleepMs(1100);
        return;
      }
```

⚠ 5e の Inflict Wounds は**接触**の呪文だが、仕掛け罠と同じく**間合いを見ない**(最初の手番で必ず 1 回撃つ)。間合いの条件を足すと「撃たない戦闘」が生まれ、手番ごとに `pickEnemyTarget` の乱数を引くことになる。⇒ 語りを「腐った手が**伸びる**」にして、距離の不自然さは語りで吸う。

### 5-4. 罠の種類(`TRAP_TYPES` に 1 行)

```js
      miasma:   { damageDice: "1d6", weaponizeDice: "2d6", disarmXP: 25, dmText: "汚水から緑の瘴気が噴き上がった!" },
```

⛔ `pit` / `rockfall` / `damage` の行は 1 バイトも変えない。

### 5-5. `buildLostCargoRun()`

`buildKoboldWarrenRun()`(`index.html:41793`)を写す。⚠ `p6Node` の `density` / `start` / `paint` は全部明示。⚠ rect は焼き上がりのマス数と `ROOM_PAINTINGS_DEF` の `tileBounds` と同値(唯一解の作法・#53)。敵の置き場は**焼き上がりを見て項目1 で決める**(出発点):

| ノード | 名前 | 敵 |
|---|---|---|
| n0(start) | 港の倉庫 | 積み荷の山のあいだにネズミ 3(`rat`)/ 床下へ降りる穴の前にゾンビ 2(`zombie` = 消えた番人)。⭐ 2 群は `DETECTION_RANGE` より離して別々の戦闘に |
| n1(boss) | 地下水道の祠 | ゾンビ 1 + 巨大ガエル 2(`plagueFrog`)+ 司祭 `boss: [.., .., "plaguePriest"]`。入場から 13 タイル以上 = 入場の語りの最中に戦闘が始まらない |

振り分けは `if (scenId === "lost-cargo") return buildLostCargoRun();   // ★[#104] 本筋外の 9 本目` を巣穴の行の下へ(⚠ 縦に揃え直さない)。

---

## 6. STEP3 — シナリオ定義と語り

```js
      /* ★[#104] 消えた積み荷 (本筋外の 9 本目・廃坑の後・推奨 Lv4)。
       * ⭐ 実際の盤面は buildLostCargoRun (卓上マップ 2 枚)。spawns は ?graph=0 の単一マップ用の退避先。
       * ⭐ trapCount:1 × NODE_EXTRA_SPAWN_KINDS の n0/n1 両方の search = 罠は部屋ごとに 1 つ。
       *   trapTypeByNode は罠の**語り**だけを変える (乱数を 1 つも足さない)。
       * ⚠ 値は出発点。強さの実測 (依頼書 §8 ⑤) と合わせて直してよい。 */
      "lost-cargo": {
        title: "消えた積み荷 — 疫病の祠",
        flavor: "倉庫の床下に潜む者を突き止め、消えた積み荷の行方を暴け",
        perceptionDC: 13,
        trapCount: 1,
        trapTypeByNode: { n0: "pit", n1: "miasma" },
        hiddenChestCount: 2,
        clearXp: 400,
        clearGold: 200,
        spawns: [ /* ?graph=0 用。buildLostCargoRun の slots と同じ顔ぶれを並べる */ ],
      },
```

`SCENARIO_NARRATIONS["lost-cargo"]`(4 行):

```js
      "lost-cargo": [
        "君たちは、桟橋の脇の古い倉庫に入った。かじられた木箱が転がり、湿った床板の下から、かすかな歌声が聞こえる。",
        "床板が一枚、外されていた。穴の下は、港町の地下を流れる古い水道だ。汚水が、ぼんやりと緑に光っている。",
        "疫病の神を拝む者たちがいる——港ではそう噂されてきた。噂ではなかったのかもしれない。",
        "さあ、穴へ降りろ。",
      ],
```

`ROAD_CHEST_GOLD["lost-cargo"] = 50` / `SCENARIO_TEX["lost-cargo"]` / `NODE_EXTRA_SPAWN_KINDS` / `THEMES` / `THEME_DEFAULT_ENEMIES`(`mob: ["rat", "zombie", "plagueFrog"], boss: "plaguePriest"`)は §2-3 の表どおり。

---

## 7. 撤退スイッチ

- **`?cargo=0`** — `tavern.html` は配列から `lost-cargo` を外し、同じページの `WORLD_MAP.retireCargo()` を呼ぶ。`world.html` も自ページで読んで `retireCargo()`(`?warren=0` の隣に 1 行)。⇒ `pier` が中継点へ戻り、`cleared=[廃坑]` の卓が今日の姿(廃坑・森・巣穴の 3 件)へ戻る。
- ⚠ 判定位置 = 各ページ。**ページ遷移をまたがない**(sessionStorage へ写さない)。`index.html` は判定しない(卓に出なければ入れない)。
- ⭐ 恒等ハッシュを持つ golden は「撤退を**全部**呼んだ後の地図 = 前の固定値」で縛る。撤退関数は `retireCargo()` → `retireWarren()` → `retireTower()` の **3 段**(手順の型 §5)。

---

## 8. 受入条件 — `tools/verify_lost_cargo.js`(新規・port base **10653**・変異 **10654〜**)

`tools/verify_kobold_warren.js` を写す(手順の型 §6)。配信は内蔵 http サーバ・本番ファイルは起動時に 1 回読んで凍結・変異はメモリ上で差し替え(⛔ 本番は 1 バイトも触らない)・favicon 204。⛔ 8765 は使わない。

### §0 装置

- **(0a)** `__lostCargoTV` が見える・`buildLostCargoRun()` が 2 ノードを返し、各ノードの敵が 0 体でない・pageerror 0
  ⭐ これが無いと全 assert が空振りで永久緑になる
- **(0b)** `__inflictProbe` が配列で在る(発動前は 0 件)

### §1 登録の整合(2 経路)

- **(1a)** tavern の `scenarios` の `lost-cargo`(配信バイトで `id` → `place` の並び)と、同じページの `WORLD_MAP.SITES` / `UNLOCK`、world.html の DOM の札が一致
- **(1b)** `side: true`・本筋 6 本に入らない・本筋 6 本クリアで `frontier` が null
- **(1c)** 開始直後(`cleared=[]`)の卓は「廃坑 + 巣穴」のまま・`pier` は札を出さない(中継点の見た目)
- **(1d)** `cleared=["goblin-mine"]` で解放済みが 4 件(廃坑・森・巣穴・倉庫街)・`pier` に札「港の倉庫街」
- **(1e)** `findWalkPath("phlan", "pier")` が 1 ホップ
- **(1f)** ⭐ §2-2: `cleared=["goblin-mine"]` の world.html で、倉庫街の札とフランの札の `getBoundingClientRect()` の**交わりの面積が 0**(1440x900 と 390x844 の 2 画面)
- **(1g)** ⭐ §2-1: 受注中(行き先 = `lost-cargo`)を種まきしてタイトル経由(exitVia 無し)で world.html に入ると、駒は `pier` に立ち、**入場ダイアログは開かない**。phlan へ歩いて戻り、もう一度 pier を押して着くと**開く**(2 経路の反転)

### §2 地図

- **(2a)** `make_grid_map.py --check` が 2 枚とも 3 指標 OK
- **(2b)** 本番の `aStar` で n0 の入場 → 出口ゲート、n1 の入場 → 司祭の隣が通る
- **(2c)** 罠は部屋ごとに 1 つ・種類は n0 = `pit` / n1 = `miasma`・踏んだときの語りが `dmText`
- **(2d)** 2 枚とも屋内 = 霧(`renderLighting` の暗幕)が効く(`outdoor` が付いていない)

### §3 傷を腐らせる手

- **(3a)** 司祭の最初の手番で probe が 1 件・2 手番目以降は増えない(1 戦闘 1 回)
- **(3b)** 命中 / 外れの両方を乱数の種で作り、命中は `total >= ac` かつ HP が `dmg` だけ減る・外れは減らない(⭐ HP の差分と probe の 2 経路)
- **(3c)** 他のボス(`koboldChief` 等)と手下は probe を増やさない
- **(3d)** `traps.length` は発動の前後で変わらない(罠の仕組みに乗せていない)

### §4 語りと撤退

- **(4a)** 開幕の語りが 4 行・`trapTypeByNode` の語りが出る
- **(4b)** `?cargo=0` で: tavern の配列から消える・`pier` が中継点・`cleared=[廃坑]` の解放済みが 3 件へ戻る(ON/OFF の反転)
- **(4c)** `retireCargo()` → `retireWarren()` → `retireTower()` を全部呼んだ地図の sha1 = 塔の母より前の固定値

### ⑤ 実測して報告する(⛔ assert しない)

Lv4・4 人・N=10 で: クリア率 / 全滅率 / 所要 / 残り HP / **「傷を腐らせる手」の命中率と、1 撃で倒れた回数**。§12 に書き、数値の判断はユーザー(⛔ 値を変えない)。

### §6 恒等(非退行)

- **(6a)** 既存 8 シナリオ(本筋 6 + 塔の母 + 巣穴)の罠の座標・種類・乱数の呼び出し回数・次の乱数が `ddf3368` と同じ(`git show ddf3368:index.html` を `?__base=1` で配る = `verify_kobold_warren` の型)

### ⛔ 測らないこと

- 司祭の `displaySize` の値そのもの・語りの文面・バナーの絵文字・クリアの XP と金貨(⑤ と実機で動かす)
- 札の位置の px(重ならないことだけを縛る)

### 負のコントロール(`--negative`。担当は**机上で書かず `--mutate` で 1 本ずつ実走して決める**)

| 変異 | 注入する欠陥 | 赤くなるべき節(見込み) |
|---|---|---|
| `inflictastrap` | 傷を腐らせる手を `traps[]` 経由にする | (3a)(3d) |
| `inflictafter` | 入口を `pickBossAction` の後ろへ動かす | (3a)(6a) |
| `inflictall` | `def.inflictDice` の条件を外し全ボスで撃つ | (3c) |
| `typerng` | 罠の種類を決めるのに `Math.random` を 1 回足す | (6a) |
| `unlockfree` | `locked: false` にする | (1c) |
| `nosite` | `NODES.pier` を `way` のまま | (1a)(1d) |
| `signclash` | 倉庫街の札を `signDx: -72` にしてフランに重ねる | (1f) |
| `spawnenter` | 湧いた瞬間に `onArriveNode` を呼ぶ | (1g) |
| `nosearch` | `NODE_EXTRA_SPAWN_KINDS` の宣言を消す | (2c) |
| `outdoor` | n1big に `outdoor: true` | (2d) |
| 罠E | 自分の変異アンカーが他の `tools/*.js` に出ない(自己検査) | — |

総括行は `  N/N PASSED   FAILED 0   PENDING 0`。

### 既存 golden(項目1 で着手前の色を控える・期待値は緩めない)

手順の型 §7 の表がそのまま当てはまる。本件で**特に**動くと見込むもの(⭐ 名指しの外は項目4 の全数走査で拾う):

| 本 | 見込み |
|---|---|
| `verify_quest_draw` | `cleared=[廃坑]` の解放済み件数 3 → 4・抽選・side 件数 |
| `verify_tavern_map` / `verify_quest_visibility` / `verify_party_four` (0a) | scenarios / side / `SITES` の件数 |
| `verify_quest_walk` | 配信から読む組数・地図の sha1(既定 / 撤退 1 段 / 2 段 / 3 段)・変異 `pier`(湧く場所の意味は変わらないので緑のはず。赤なら理由を突き止める) |
| `verify_world_map` | 札の枚数 (7b-data)(7b-dom)(7d)(7e)(7f)・(4s-3) は緑のまま・972 行の 0 タップ |
| `verify_road_events` (4a) / `verify_world_steps` / `verify_world_heromark` | 地図の sha1・札の枚数 |
| `verify_lore_check` | 55 / 44 / 11 / 37 / 18 と表(`DRV_SKILL` に religion で 1 行・CR 表に 1 行) |
| `driver_mapeditor_painting` | テーマ数・side テーマの `n0big` / `n1big`・optgroup |
| `verify_counterspell` (4c) / `verify_run_chronicle` (0c) | 「HP を引く点」の総数(傷を腐らせる手で増える) |
| `verify_dragon_fold` (7b) / `verify_swamp_novice` (4b) / `verify_road_ambush` (4c) | `NODE_EXTRA_SPAWN_KINDS` の行の集合・撤退の腕に `?cargo=0` |
| `driver_graph_p6` (2c) | 縦横比が在庫に無ければ赤 → `LINT_PAINTING_ASPECTS` |
| `verify_kobold_warren` | (6a) の恒等の対象に `lost-cargo` は入らない = 緑のはず |

⚠ 着手前から赤の本(#103 時点: `driver_mapeditor_painting` §1 1d2 / `verify_codex_map_skill` (3a))は範囲外。項目1 で測り直す。

---

## 9. 実機/実感の確認(iPhone)

- 廃坑をクリアした後、ワールドマップで**桟橋に「港の倉庫街」の札**が出て、港町の札と重ならずに押せる
- 新しく始めたとき、桟橋に立っても何も開かない(札も出ない)
- 罠の吹き出しが 1 回の潜行で 2 回
- 「傷を腐らせる手」が 1 戦闘 1 回で、Lv4 の 4 人で全滅しない
- 地下水道の緑の光が目に留まる・霧の描画で重くない(会議の懸念)
- 新しい絵(地図 2 枚・司祭)の読み込みで白い床が出ない(#85)
- ⚠ ローカルは http 起動が必須

---

## 10. changelog(`index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>港の倉庫街に新しい依頼「消えた積み荷」</b> — 廃坑を片づけると、船着き場の倉庫の床下に潜む疫病の教団を追える(推奨 Lv4)。"

---

## 11. やらないこと

- ⛔ 人間の信者(Cultist)の敵・新しい手下の絵(ユーザー決定)
- ⛔ 「傷を腐らせる手」を敵の呪文表(`spells`)に足す・他の敵に持たせる(§2-7)
- ⛔ 間合いを見る条件(§5-3)
- ⛔ 帰還の印・酒場の主人の一言・後日談(巣穴の卵の型)。教団と黒幕の関係も語らない(本筋の語りを変えない)
- ⛔ 疫病の状態異常(SRD の Diseased Giant Rat の病気・回復できない状態)。別チケット
- ⛔ 汚水の光のアニメーション・新しい BGM・新しい効果音
- ⛔ #103 の強さの見直し(族長 HP27 / DC12。ユーザー判断待ちの別件)
- ⛔ `phlan` の `signDx`・`spawnFor`・`EDGES`・`js/road-events.js`
- `実装依頼書/README.md` の一覧への行(承認時に起草窓が足す):

    | 104 | [2026-10-29_lost-cargo.md](2026-10-29_lost-cargo.md) | **承認済** | 0% | 新しい行き先 2 か所目「消えた積み荷」(pier を拠点「港の倉庫街」へ・廃坑の後・推奨 Lv4・地図 2 枚 + 疫病の司祭は新規発注)。⚠ pier はゲーム開始の立ち位置 / 札がフランの札の真下 / 開始直後の卓は変わらないが cleared=[廃坑] の解放済みが 4 件へ |

### 項目の割り方(dev-loop・手順の型 §0)

| 項目 | 中身 | 終わりの印 |
|---|---|---|
| 1 着手前の実測 + 素材の取り込み | §2 を測り直す・札の重なりの実測(§2-2)・名指し golden の色を控える・地図 2 枚の焼き付けと MASK 草案・司祭シートの取り込みと `displaySize` の実測 | §12-1 に実測表・焼き上がり 2 枚・台帳行 |
| 2 本体 | §4〜§7・changelog 1 行・予告外で赤くなった golden の言い直し | 煙検査 + 予告どおり赤の一覧 |
| 3 受入 | `tools/verify_lost_cargo.js`・⑤ 強さの実測 | 素 N/N × 3・`--negative` 全変異 OK |
| 4 母集団の非退行 + 記録 | golden の言い直し・全数走査・§12・README の行 | 帰属の緑→赤 0 |

---

## 12. 実装結果

### 12-1. 項目1 — 着手前の実測 + 素材の取り込み(2026-10-29・基準 HEAD `c6aa85f`)

⚠ 前半(commit `9d4b273`)の時点では **地図 2 枚は焼き付けできなかった**(v1 の格子が素材の側で崩れていた = (3) の前段)。ユーザー承認のもと v2 を発注し、**後半で v2 を焼いた**(`GRIDS` 2 行・焼き上がり 2 枚・MASK 草案 = (3) の後段)。司祭のシート・§2 の測り直し・札の実測・golden の控えは前半で済み。

#### (1) §2 の測り直し

- `git diff --stat ddf3368 HEAD` = 依頼書と README だけ ⇒ 本番ファイルは無変更。§2-3 の表の行番号(index / tavern / world-map / df-mapdef / world.html / make_grid_map / codex1_sprites / verify_lore_check:128 / check_changelog:32)と §2-5・§2-6 の出所は**全部一致**(訂正なし)。
- §2-9 の grep = **17 本**(主張どおり)。`pier` を名指しする本は主張の 2 本の外に `verify_road_ambush` / `verify_road_boon` / `verify_road_events` / `verify_world_steps` / `verify_town_exit` も在る(控えの名簿に入れた)。
- **§2-1 補足**: `world.html:1535` `goToPoint` は「立っているノードを押す」と即 `onArriveNode` を呼ぶ ⇒ 桟橋に湧いた直後に**桟橋そのものを押すと**、受注中なら即ダイアログが開く(歩いて戻らなくてよい)。湧いた瞬間に開かないのは主張どおり。⇒ (1g) はこの経路も縛ると強い。

#### (2) 札の重なり(§2-2)— 実ブラウザで実測

pier を拠点にした `js/world-map.js` を**メモリ上で**配り(本番は 1 バイトも触らない・道具 = `~/.claude/dev-loop/r104/item1/sign/measure_signs.js`・port 10690)、`cleared=["goblin-mine"]` で world.html を開いた。

| 画面 | 主人公の立ち位置 | 札どうしの交わり | 縦の隙間 | 主人公が倉庫街の札を隠す面積 |
|---|---|---|---|---|
| 1440x900 | pier(exitVia 無し = title) | **0** | 13.7px | 0 |
| 1440x900 | **phlan(exitVia "town")** | **0** | 13.7px | ⚠ **2987px² = 35.9%** |
| 390x844 | pier | **0** | 14.9px | 0 |
| 390x844 | **phlan** | **0** | 14.9px | ⚠ **2496px² = 39.1%** |

- 札の高さは 38.2px(1440)/ 34px(390)。§2-2 の 47px は別の測り方の値。
- ⇒ **札どうしは重ならない**(§2-2 の見込みどおり)。
- ⚠⚠ **新発見**: 主人公が **phlan に立つ**(町を出た直後 = いちばん多い状態)と、78px 角の主人公が倉庫街の札の右側(説明文の右半分)を隠す。phlan の `signDx: -72` を決めた理由の 39.9%(`js/world-map.js:50`)と同じ規模。札の右端を主人公の左端(1440 で 395)より左へ出すには、pier に `signDx` ≈ **−100** が要る。⛔ 項目1 では決めない(項目2 / ユーザー判断)。
- ⚠ §8 の負のコントロール `signclash`(倉庫街に `signDx: -72`)では札どうしは**重ならない**(縦に 13.7px 空いているため)⇒ その変異は (1f) を赤くしない。項目3 は別の注入を実走で選ぶこと。

#### (3) 地図 2 枚 — v1 は格子が不合格 → v2 を発注 → v2 で焼けた

##### (3-1) v1 — ⛔ 格子が素材の側で崩れていた(前半 `9d4b273` の記録・そのまま残す)

床を 4 倍に拡大して目で数え(`r104/item1/fit/wh_zoom_*.png` / `sh_zoom_*.png`)、明るい細線の位置を列・行ごとの平均輝度の山で測って直線回帰した:

| 素材 | 軸 | 線の本数 | 回帰の周期 | 残差の最大(本物は ≤ 0.2px) | 線の間隔 |
|---|---|---|---|---|---|
| 倉庫 `cargo-warehouse-v1` | 縦 | 18(x 102.0〜1420.9) | **77.35** | ⚠ **9.2px** | 77〜81、中ほどの 2 マスだけ 68.8 / 69.9 |
| 〃 | 横 | 8(y 169.0〜733.9) | **81.09** | 2.8px | 77〜86 |
| 祠 `cargo-shrine-v1` | 縦 | 16(x 107.0〜1199.0) | **72.61** | ⚠ **8.1px** | 72 前後、西の 2 マスだけ 79 / 78 |
| 〃 | 横 | 8(y 238.9〜757.6) | **74.01** | 3.9px | 69〜80 |

- ⇒ 起草窓の一次解(65.98 / 61.54 / 59.98 / 67.98)は**偽解**(疑いどおり)。ただ、本当の格子のほうも **64px ではなく**(72〜81px)、**等間隔でもない**。依頼文(`codex1/requests/2026-10-29_lost-cargo-maps.md`)の要件「**1 マス 64px 相当**」と「**間隔が一定であること**」(§193)の両方を満たしていない。
- さらに線が**暗い床の上の明るい細線**になっていた(台帳の既存の素材は明るい床の上の暗い線)。`make_grid_map.py` の `line_response` は**暗い線しか拾わない**ので、`--fit` も `verify()` も描かれた格子ではなく**板の継ぎ目・石の目地**を測ってしまう(`r104/item1/fit/*_overlay.png`)。
- 試し焼き(scratch のみ・⛔ 閾値は緩めていない):

| 台帳の値 | 倉庫 縦 | 倉庫 横 | 祠 縦 | 祠 横 |
|---|---|---|---|---|
| 明るい線の回帰(77.35 / 81.09・72.61 / 74.01) | NG drift 10.09 | NG drift 22.88 | NG drift 38.40 | NG drift 20.20 |
| 起草窓の一次解 fit64 | NG drift 21.58 | OK | OK | NG drift 4.43 |

- ⇒ 前半では `GRIDS` に足さず blocked(ユーザー判断待ち)とした。

##### (3-2) v2 の発注(ユーザー承認の後)

- 依頼文 `codex1/requests/2026-10-29_lost-cargo-maps-v2.md`。⭐ 作り方を変えた = **格子の無い絵を描き、その上にコードで 1 マス 64px 丁度・原点 0 の暗い細線を重ねる**(画像生成に格子を描かせると周期が揺れるため)。格子無しの `-nogrid` も一緒に納品。
- 納品 = `codex1/assets/maps/cargo-warehouse-v2.png`(md5 `37446695…`)/ `-nogrid`(`b098488f…`)・`cargo-shrine-v2.png`(`42fecb59…`)/ `-nogrid`(`afd5a9bb…`)。各 1536x1024。
- codex の自己申告: 1px 黒 45%・x,y = 64 の倍数・差分画素は格子位置の外に 0・格子上の平均明度 28.0(格子無し 51.2)/ 26.2(47.9)。
- ⚠ 構図は v1 の写しではなく**新しく描かれた**(倉庫 = 西の端の中ほどに開いた大扉 → 東の端の中ほどに梯子ののぞく床の穴・北と南に積み荷の山・中央は広い板張り / 祠 = 西の端の中ほどに梯子の足元 → 東に緑の布の祭壇 + ろうそく + 積み荷の山・北と南に光る緑の汚水の水路と排水口・中央は煉瓦と石畳)。前提が新しい絵で成り立つかは (3-5) で測り直した。

##### (3-3) v2 の格子 — 受け取り側の実測と、台帳の値の決め方

- **差分で線の位置を直接測った**(`r104/item1/v2/diff_lines.py`): 本命と `-nogrid` の差分画素 = 倉庫 48430 / 祠 48452、**全部が x または y = 64 の倍数の上**(外 0)。全行が変わった列 = x 0, 64, …, 1472(24 本)/ 行 = y 0, 64, …, 960(16 本)。1px。⇒ 格子は**定義上** 周期 64.000・位相 0・24 x 16 マス(x = 1536 / y = 1024 の線は画像の外)。codex の自己申告と一致。
- `--fit --fit-around 64` の一次解は 2 枚とも phase (63.50, 63.50) / period (64.030, 64.030) / cells (22, 15)。⚠ **偽解ではないが、外周を落とす**:
  - 当たっている線は本物と同じ(round(63.5 + k x 64.030) = 64k が k = 0〜22 で全部成り立つ = 累積 0.66px で丸めの内側)。
  - ただし左端の線 x = 0 と上端の線 y = 0 を**捨てる** → 切り出しが (63.5, 63.5)〜(1472.2, 1024.0) = **西の 1 列・東の 1 列・北の 1 行**が消える(22 x 15)。理由 = `line_response` は端を edge パディングするので index 0 の線の応答が弱く、櫛の平均を下げる。
  - ⇒ 一次解を貼ると**西の大扉(col 0)と梯子(col 0〜1)が切れる**。
- ⭐ 目地・板の継ぎ目を拾っていない証拠: 同じ窓で `-nogrid` を測ると 倉庫 score 2.35 / 7.69(周期 68.4 / 61.5)・祠 4.29 / 5.72(67.5 / 68.1)= ばらばら。格子ありは 倉庫 21.27 / 21.43・祠 19.47 / 18.87。⇒ 一次解は**重ねた格子**に乗っている(祠の石畳の目地ではない)。
- 試し焼き(scratch `r104/item1/v2/bake/`・⛔ 閾値は緩めていない):

| 台帳の値 | 倉庫 縦 | 倉庫 横 | 祠 縦 | 祠 横 |
|---|---|---|---|---|
| 一次解 (63.50 / 64.030 / 22x15) | OK drift 0.00 / 位相 0.75 / 100% | OK 同 | OK 同 | OK 同 |
| **採用** (0.00 / 64.000 / 24x16) | **OK drift 0.00 / 位相 0.75 / 100%** | **OK 同** | **OK 同** | **OK 同** |

- ⇒ どちらも 3 指標を通る。**絵を全部残す (0.00, 0.00) / (64.000, 64.000) / (24, 16) を台帳へ**。位相 0.75 world-px = 0.5px x 1.5 は `verify()` の櫛が端の線を避けて 63.5 を選ぶ量子化(巣穴 2 枚と同じ値)。根拠は `GRIDS` の各エントリの注記が唯一の正。

##### (3-4) 焼き上がり

| キー | 出力 | 寸法 | マス | 行数の偶奇 → midR | 異方性 |
|---|---|---|---|---|---|
| `cargo-warehouse` | `assets/room_lost-cargo_n0_map.jpg`(0.39 MB) | 1536x1024 | **24 x 16**(tile 64・等倍) | 16 = 偶数 → midR = 絵ローカル **row 7**(半行上)= 大扉と床の穴の行 | 0.00% |
| `cargo-shrine` | `assets/room_lost-cargo_n1_map.jpg`(0.48 MB) | 1536x1024 | **24 x 16** | 16 = 偶数 → midR = 絵ローカル **row 7** = 梯子の足元の行 | 0.00% |

- `py tools/make_grid_map.py --check assets/room_lost-cargo_n0_map.jpg --tile 64` / `…n1_map.jpg` = 縦横とも `OK 周期 64.000px … ドリフト 0.00 … 位相ズレ 0.75 … score比 100.0%`。
- ⭐ **`LINT_PAINTING_ASPECTS` に行は要らない**: 24 x 16 = 3:2 = 既存の「ノードボス 9×6 (3:2)」と同比(24 x 6 = 144 = 16 x 9)。砦 #63 の 30x20 と同じ「偶然の一致」。⇒ `js/df-mapdef.js` は触らない見込み(項目2 で `driver_graph_p6` (2c) を走らせて確かめる)。
- `MAP_W 72 / MAP_H 28` の内側に収まる。rect の出発点 = **`[6, 16, 21, 39]`**(16 行 x 24 列・右辺 col 39 を巣穴と揃える。midR = floor((6+21)/2) = 13 = 絵ローカル row 7。右辺の中点 = 出口ゲート (39, 13))。写像 = 絵ローカル (col, row) + (16, 6) = global。⚠ 唯一解かどうかは項目2 で `nodeGateTile` と突き合わせる。
- `node tools/verify_codex_map_skill.js` = **16/17**(着手前と同じ = (3a) stag-tavern の検算 NG だけ赤・範囲外)。台帳 22 件を焼き直して SHA 全件一致(`cargo-warehouse=0343a9ff` / `cargo-shrine=c70fbe05` を含む)。

##### (3-5) 新しい絵で依頼書の前提が成り立つか(実測)

| 前提 | 倉庫 n0 | 祠 n1 |
|---|---|---|
| 入口 → 出口の途切れない横断路 | ✅ row 7 が col 0 → col 23 を 1 マスも切らさない(大扉 (0,7) → 床の穴 (22,7) → 出口 (23,7)) | ✅ row 6〜8 が col 0 → col 20 まで全部開いている(梯子 (0,7)〜祭壇の前 (20,7)) |
| 4x4 以上の開けた床を 13 マス以上離して 2 か所 | ✅ 西 col 2〜7 / row 3〜11(6 x 9)と 東 col 15〜21 / row 3〜11(7 x 9)。中心間 13 マス超 | — |
| 祭壇の手前 6x6 以上の開けた石畳 | — | ✅ col 14〜19 / row 4〜11(6 x 8・石畳)。煉瓦の床を含めると col 1〜19 / row 4〜11 が全部開いている |
| 汚水が横断路を切らない | — | ✅ 水路は北 row 1〜3 と南 row 12〜14 だけ(橋は不要の構図) |
| 2 群を `DETECTION_RANGE` 12.5 より離す | ✅ 下の置き場で最短 14.32 タイル | — |
| 入場から 13 タイル以上 | — | ✅ 下の置き場で最短 14.0 タイル |

⇒ 再発注は要らない。

##### (3-6) MASK 草案 2 枚(⚠ `index.html` は項目2 で触るので、ここに置いて渡す)

作法は巣穴 n0big / n1big と同じ 5 規則(外周 1 マスは `.` = sealRing の仕事 / 平置きの物は塞がない / 通れない物を塞ぐ / 入口の行を端から端まで開ける / 孤立 0)。判定は「足元(タイル中心)が物の上か」。
⚠⚠ **歩けない理由は記号でなく行コメントで分ける**: `js/df-mapdef.js:733` `PAINTING_BLOCK_CHAR = "#"` = 本番は `#` だけを塞ぎ、`~` や `B` は**歩ける**扱いになる(`paintingBlockedTilesFor`)。⛔ 港町の `js/town-map.js` の LEGEND の記号を写さないこと。
連結は **sealRing を模した 4 近傍 BFS**(外周は辺の中点 4 つ = (0,7) (23,7) (11,0) (11,15) だけ歩ける)で入場地点 絵ローカル (2,7) から確かめた(`r104/item1/v2/masks.py`)。焼き上がりに MASK を赤・敵の置き場を水色・入場を緑で重ねて目視(`r104/item1/v2/overlay_warehouse.png` / `overlay_shrine.png`)= 積み荷・扉の板・床の穴・机・水路・祭壇・ろうそくの上に `#`、板張り・石畳・煉瓦の床の上に `.`。半マス・1 マスずれは見当たらない。⭐ 本番での最終確認は項目3 の (2b)(本番の `aStar`)。

n0big「港の倉庫」(16 行 x 24 列・霧あり)— 歩ける 221 / 入場から到達 219 / 孤立は外周の上下の中点 (11,0) (11,15) だけ(行き止まりの縁 = 実害なし・巣穴と同じ)。西の大扉 (0,7) → 東の出口 (23,7) が通る。

```
........................   //  0  外周
.######################.   //  1  北の積み荷 (樽・木箱・麻袋・荷車の輪・帆布・縄・かじられた木箱) col 1-22
.###.##..#######.....##.   //  2  樽と木箱と麻袋 (col 1-3) / こぼれた穀物 (col 4) は平置き / 木箱 (col 5-6) / 樽・荷車の輪・帆布・樽・木箱 (col 9-15) / 縄と麻袋 (col 21-22)
........................   //  3
........................   //  4
........................   //  5
.#....................#.   //  6  大扉の北の扉板 (col 1) / 傾いた木箱 (col 22)。ろうそく (col 21) は平置き
........................   //  7  ★入場の行 (col 0 = 西の大扉 / col 22 = 床の穴の北半分 / col 23 = n1 への出口)
......................#.   //  8  床の穴の南半分 (col 22)
.#......................   //  9  大扉の南の扉板 (col 1)
........................   // 10
........................   // 11
.####...#...##...######.   // 12  木箱と麻袋 (col 1-4) / こぼれた穀物と縄 (col 5-7) は平置き / 椅子 (col 8) / 麻袋と縄 (col 12-13) / 錠のかかった大箱・木箱・麻袋・樽 (col 17-22)
.#############...######.   // 13  樽・麻袋・木箱・縄・机 (col 1-13) / ランタン・ろうそく・帽子 (col 14-16) は平置き / 大箱と木箱 (col 17-22)
.#############...######.   // 14  樽・木箱・机の脚・壊れた木箱・麻袋 (col 1-13) / 大箱・木箱・こぼれた穀物 (col 17-22)
........................   // 15  外周
```

n1big「地下水道の祠」(16 行 x 24 列・霧あり)— 歩ける 160 / 入場から到達 157 / 孤立は (11,0) (11,15) と**東の中点 (23,7)**(祭壇の裏の行き止まり。ボス部屋なので出口は使わない = 巣穴 n1 と同じ)。西の梯子 (0,7) → 祭壇の前 (19,7) (20,7) が通る。**祭壇 (col 21-22 / row 6-8) と周りのろうそく・供物の鉢・積み荷 (col 20-22 / row 4-5・9-10 と col 21-22 / row 11) は全部 `#`**。

```
........................   //  0  外周
.######################.   //  1  北の水路 (光る緑の汚水・排水口の滝) + 水路の縁の麻袋・樽・木箱・帆布
.######################.   //  2  北の水路 / 西の排水格子 (col 1) / 東の梯子と木箱 (col 21-22)
.######################.   //  3  北の水路 + 縁石 + 排水口の格子 (col 4 / col 19)
....................###.   //  4  ★床 (煉瓦 col 1-13 / 石畳 col 14-19) / 麻袋とろうそく (col 20)・縄と樽 (col 21)・木箱 (col 22)
....................###.   //  5  ろうそく (col 20)・供物の鉢 (col 21)・麻袋と木箱 (col 22)
.....................##.   //  6  ★祭壇 (col 21-22)。col 20 は祭壇の縁石 = 立てる
.....................##.   //  7  ★入場の行 (col 0 = 梯子 / col 1 = 梯子の足元) / 祭壇 (col 21-22)
.....................##.   //  8  祭壇 (col 21-22)
....................###.   //  9  ろうそく (col 20)・藁とろうそく (col 21)・木箱 (col 22)
....................###.   // 10  ろうそく (col 20)・供物の鉢 (col 21)・木箱 (col 22)
.....................##.   // 11  床 (縁石の手前) / 麻袋と木箱 (col 21-22)
.######################.   // 12  南の水路 + 縁石 + 排水口の格子 (col 4 / col 19) / 木箱 (col 21-22)
.######################.   // 13  南の水路
.######################.   // 14  南の水路 + 水路の縁の麻袋・木箱・樽・ろうそく・帆布
........................   // 15  外周
```

##### (3-7) 敵の置き場(出発点・§5-5 の表を新しい絵に当てた)

| ノード | 群 | 絵ローカル (col,row) | global(rect `[6,16,21,39]` の写像) | 根拠 |
|---|---|---|---|---|
| n0 | ネズミ 3(`rat`)= 北西の積み荷のあいだ | (5,3) (6,3) (6,4) | (21,9) (22,9) (22,10) | 入場 (2,7) からの最短 5.0 タイル(480px)> melee 交戦距離 400px(巣穴と同じ) |
| n0 | ゾンビ 2(`zombie` = 消えた番人)= 床の穴の前 | (20,7) (21,8) | (36,13) (37,14) | 2 群の最短 (6,4)-(20,7) = **14.32** タイル > `DETECTION_RANGE` 12.5 = 別々の戦闘 |
| n1 | 司祭 `boss`(`plaguePriest`)= 祭壇の前 | (19,7) | (35,13) | 入場からちょうど 17 タイル |
| n1 | ゾンビ 1 + 巨大ガエル 2(`plagueFrog`)= その前 | (16,7) / (17,5) (17,9) | (32,13) / (33,11) (33,15) | 入場からの最短 (16,7) = **14.0** タイル ≥ 13 |

- ⚠ 9 タイルとも MASK で `.`・入場から到達できることを BFS で確かめた。⚠ 項目2 で `slots` を決めたら**必ず測り直す**こと(ゾンビ・カエル・ネズミの種類の割り振りは項目2)。
- 入場 = 西辺の中点 (16,13) + `NODE_ENTRY_INSET`(2) = global (18,13) = 絵ローカル (2,7)(巣穴の (19,13) から 1 列西 = 24 列になった分)。

#### (4) 疫病の司祭のシート(§5-2)— 取り込み済み

| 項目 | 値 |
|---|---|
| 台帳 | `tools/codex1_sprites.json` の `plaguePriest`(koboldChief の直後・第3陣テンプレの glob)。`py tools/pack_codex1_sprites.py --all --only plaguePriest` で再生成できる |
| シート | `assets/plaguePriest_anim.png` 576x480・`frameW/frameH 96`・`cols 6`・`rowOffset 0`(行 0/1/4 = 待機・2 = 歩き・3 = 攻撃 = 既存の敵と同じ並び)・`sprite: "assets/plaguePriest_anim.png?v=1"` |
| char_ratio | **0.80**(0.86 だと攻撃 3〜4 コマ目の腕が右へ 3px、0.81 でも 1px はみ出す → wyvern の前例にならって下げた)。attack_scale auto = 1.0086・fit left=20 right=95 top=12 でクリップ無し |
| 検査 | `py tools/check_sprite_doubling.py assets/plaguePriest_anim.png` → `✅ plaguePriest_anim.png (6x5 cell96): clean` / `py tools/check_alpha_bg_residue.py` → 疑い 0 件(613 枚) |
| 目視 | 暗い床 #1c1814・祠の石床・倉庫の板床の上で、縁の残りなし。突き出し + 緑の光は 3〜4 コマ目 |
| 攻撃の値 | koboldChief を写す(`meleeRange 110 / hitRange 180 / attackDuration 26 / attackHitFrame 11 / attackCooldown 32`)。hitFrame 11 = col 2 = 突き出しのコマと合う |

`displaySize` の実測(画面上の身長 = displaySize × walk の体高 / 96):

| 敵 | displaySize | 体高 / 96 | 画面上の身長 |
|---|---|---|---|
| zombie(手下) | 82 | 81 | 69.2px |
| bandit | 72 | 82 | 61.5px |
| banditHeavy | 88 | 83 | 76.1px |
| scar(人間の中ボス) | 100 | 82 | 85.4px |
| lizardPriest | 84 | 56 | 49.0px |
| koboldChief | 72 | 82 | 61.5px |
| **plaguePriest** | — | **76** | 100 なら 79px / 108 なら 85.5px |

⇒ **推奨 `displaySize: 100`**(当たり判定が scar と同じ・手下のゾンビ 69px より一回り大きい)。scar と同じ身長に揃えるなら 108。⛔ 項目1 では決めない(項目2 で `ENEMY_TYPES` に書く値)。

#### (5) 名指し golden の着手前の色

2026-10-29 20:00〜20:26 に 25 本を素で逐次に走らせた(控え = `~/.claude/dev-loop/r104/item1_baseline.md`・ログ `r104/item1/golden_logs/`)。名簿 = §2-9 の 17 本 + `verify_lore_check` + `driver_graph_p6` + 件数系(`verify_party_four` / `verify_counterspell` / `verify_run_chronicle` / `driver_cleanup_phase1`)+ `verify_town_exit`(pier を名指し)+ 参考 `verify_codex_map_skill`。

- **緑 23 本**: dragon_fold 35/35・kobold_warren 21/21・plaza_map 43/43・quest_draw 18/18・quest_visibility 39/39・quest_walk 25/25・road_ambush 41/41・road_boon 20/20・road_events 25/25・swamp_novice 34/34・tavern_map 47/47・tower_mother 19/19・tower_mother_b 22/22・world_heromark 18/18・world_map 57/57・world_steps 33/33・lore_check 26/26・graph_p6 250/250・party_four 17/17・counterspell 25/25・run_chronicle 74/74・cleanup_phase1 28/28・town_exit 23/23
- **着手前から赤 2 本**(#103 項目1 と同じ・範囲外): `driver_mapeditor_painting` §1 1d2(105/106。labels 21 種 / サイズ 20 種)/ `verify_codex_map_skill` (3a)(16/17。stag-tavern の検算 NG・SHA は 20 件一致)
- ⚠ 走り始めが 20:00 = 闇市の開く時刻をまたいだ(plaza_map は 20:01 開始)。闇市を名指しするドライバは自分で時刻を種まきしているので色は変わらない見込みだが、記録として残す。

#### (6) 項目2 への申し送り

- ✅ 地図は v2 で焼けた((3-2)〜(3-7))。`GRIDS` 2 行(`cargo-warehouse` / `cargo-shrine`)と焼き上がり 2 枚(`assets/room_lost-cargo_n0_map.jpg` / `_n1_map.jpg`・各 24 x 16・tile 64)は項目1 で入れた。
  項目2 がやること = `ROOM_PAINTINGS_DEF["lost-cargo"]` の n0big / n1big(`tileBounds` = rect と同値・出発点 `[6, 16, 21, 39]`・`node: true`・`sealRing: true`・**`outdoor` は付けない** = 2 枚とも屋内 = §8 (2d))に (3-6) の MASK を写す / `buildLostCargoRun` の rect・`start`(global (18,13))・`slots` を (3-7) から / `LINT_PAINTING_ASPECTS` は**足さない見込み**(24x16 = 3:2)を `driver_graph_p6` で確かめる。
- `ENEMY_TYPES.plaguePriest` のシート値は (4) のとおり。⭐ **ユーザー決定: `displaySize` = 100**。
- ⭐ **ユーザー決定: pier に `signDx` ≈ −100**(主人公が phlan に立つと札の 36〜39% が隠れる件)。値は項目2 で実測して決める。
- 項目1 では `index.html` / `tavern.html` / `audio.js` に触れていない(changelog は不要)。

### 12-3. 項目3 — 受入ドライバ + ⑤ 強さの実測(2026-10-30・基準 HEAD `a53074d`)

#### (1) `tools/verify_lost_cargo.js`(port 10653・変異 10654〜10663)

- 22 assert: (0a)(0b)(0c)(1a)〜(1g)(2a)〜(2d)(3a)〜(3d)(4a)〜(4c)(6a)。総括行 `  N/N PASSED   FAILED 0   PENDING 0`。素 1 回 約 175 秒。
- §8 からの言い直し(ドライバ冒頭の注記が唯一の正):
  - (0a) の pageerror 0 は (0c) に分けた(verify_kobold_warren と同じ)。
  - (1f) = 札どうしの交わり 0 **と**、主人公が phlan / pier に立ったとき倉庫街の札を覆う割合 < 10%(verify_world_map (7f) の COVER_MAX)。1440x900 / 390x844 の 2 画面。実測 = 主人公 phlan で 6.7% / 2.8%・pier で 0%。⛔ 390 幅の画面外は縛らない(ユーザー決定)。
  - 変異 signclash は signDx -72 ではなく **signDx 0**(-72 は札どうしが重ならず赤くならない = §12-1 (2))。
  - (1g) = 受注中に桟橋へ湧く → 開かない → **桟橋そのものを押す**と開く / 受注なしなら押しても開かない / 町を出た直後 (phlan) から pier へ歩いて着くと開く(phlan へ「歩いて戻る」は phlan が town.html へ入るので、この経路で代えた)。
  - (3a) は「最初の手番で pickBossAction が呼ばれていない」も縛る(変異 inflictafter を捕まえる)。(3c) の「他のボス」は巣穴の族長と同じ包みで 1 戦闘回す。
  - (4a) の開幕の語りは `?autoplay=1` のページで `#dmBody` に実際に出た文を拾う(4 行すべて)。
  - (4c) は 3 段の各段を固定値で縛る(retireCargo 後 `3918d569e7f3f7db` / +retireWarren `647e71f6b2956389` / +retireTower `876c5f6336f96811` = verify_quest_walk (5a) の WANT_ON / WANT_W0 / WANT)。
  - (6a) の基準は `f80543c`(既存 8 シナリオ = 本筋 6 + 塔の母 + 巣穴)。
- 負のコントロールの担当(`--mutate` で 1 本ずつ実走して決めた):

| 変異 | 依頼書の予想 | 実際の赤(担当) | 予想との差の理由 |
|---|---|---|---|
| inflictastrap | (3a)(3d) | (3a)(3d) | — |
| inflictafter | (3a)(6a) | (3a) | (6a) は既存シナリオの罠の湧きだけを見る = 入口の位置は届かない。代わりに (3a) の pickBossAction 0 回で捕まえる |
| inflictall | (3c) | (3c) | — |
| typerng | (6a) | (6a) | — |
| unlockfree | (1c) | (1a)(1c)(4b) | (1a) は locked:true を、(4b) の ON 腕は (1a) の条件を含む(巣穴の `locked` と同じ構造) |
| nosite | (1a)(1d) | (1a)(1d)(1f)(4b) | 札が消える = (1f) の母集団が空 / (4b) の ON 腕。(1g) は緑 = 入場は SITES と questDest で決まり kind を見ない |
| signclash | (1f) | (1f) | — |
| spawnenter | (1g) | (1g) | — |
| nosearch | (2c) | (2c) | — |
| outdoor | (2d) | (2d) | — |

#### (2) ⑤ 強さの実測(⛔ assert しない・⛔ 値は変えていない)

道具 = `~/.claude/dev-loop/r104/item3/probe_cargo_clear.js`(scratch・本番 0 バイト変更。#103 の probe_warren_clear.js の写し + 傷を腐らせる手の前後の HP を包みで記録)。酒場から本番の出発 `?recruittalk=0`(自動抽選 4 人)・XP 6000(主人公 Lv4)・autoplay=15。TSV = `r104/item3/cargo_lv4.tsv`、詳細 JSON = `detail_cargo/`。

| 走行 | 結果 | 秒 (祠に入って→司祭撃破) | 主人公 終了/最小 (最大 60) | 仲間 終了 | 傷を腐らせる手 (標的: d20+3=計/AC) | 罠 |
|---|---|---|---|---|---|---|
| 1 | clear | 105 (71→105) | 57 / 37 | 42/42・40/40・26/26 | 頭 13/AC17 MISS | 頭 落とし穴 5 |
| 2 | clear | 113 (74→113) | 54 / 54 | 50/50・50/50・22/22 | 頭 13/AC17 MISS | — |
| 3 | clear | 123 (80→123) | 44 / 44 | 47/60・40/40・22/22 | 頭 18/AC16 HIT 16 (60→44) | — |
| 4 | clear | 120 (78→120) | 50 / 50 | 28/33・34/34・26/26 | 頭 14/AC17 MISS | — |
| 5 | clear | 116 (71→116) | 48 / 48 | 41/41・34/34・22/22 | 頭 9/AC16 MISS | — |
| 6 | clear | 119 (81→119) | 60 / 59 | 46/56・9/28・26/26 | 仲間(盗賊 Lv2) 20/AC14 HIT 14 (23→9/28) | 頭 落とし穴 1 |
| 7 | clear | 159 (103→159) | 46 / 39 | 56/66・33/33・22/22 | 頭 18/AC16 HIT 21 (60→39) | — |
| 8 | clear | 119 (76→119) | 55 / 55 | 41/41・22/22・22/22 | 頭 9/AC16 MISS | — |
| 9 | clear | 122 (86→122) | 42 / 42 | 34/34・40/40・26/26 | 頭 17/AC17 HIT 18 (60→42) | — |
| 10 | clear | 125 (82→125) | 27 / 27 | 50/50・49/49・22/22 | 頭 16/AC16 HIT 22 (49→27) | 頭 落とし穴 1 |

- **クリア 10/10・全滅 0/10・倒れた人 0**(主人公・仲間とも)。所要 平均 122 秒(105〜159)。祠に入ってから司祭を倒すまで 平均 42 秒(34〜56)。
- 残り HP: 主人公 平均 48.3/60(80%・最小 27)。仲間の最小 = 盗賊 9/28(走行 6 = 傷を腐らせる手)。魔法使いは 10 走行とも無傷。
- 傷を腐らせる手: 10 走行で 10 回(1 戦闘 1 回どおり)。**命中 5 / 外れ 5**(クリティカル 0)。ダメージ 14〜22(平均 18.2)。標的 = 頭(戦士 AC16〜17)9 回 / 仲間 1 回。**1 撃で倒れた回数 0**。
- ⚠ 仲間の Lv は推奨 Lv4 の帯から振られて Lv2〜4(Lv2 の盗賊 28 / 魔法使い 22 なら 3d10 の最大 30 は 1 撃で倒しうる。今回の 10 走行では標的の 9/10 が頭だった)。
- 比較 = 森 bandits-forest(推奨 Lv4)・同じ条件・N=5(`forest_lv4.tsv`): クリア 3/5・全滅 2/5・仲間の戦死あり(走行 2・4)・主人公の最小 5/0/0。⇒ **倉庫街は同じ帯の森よりはっきり易しい**。

#### (3) 所見(判断はユーザー)

- 「Lv4 の 4 人で全滅しない」(§9) は満たす。ただし被害は小さい側に寄っている(主人公 8 割残り・倒れる人 0)。巣穴 (#103 ⑤) と同じ傾向 =「本筋外は本筋より一段軽い」の狙いどおりとも読めるが、ボスの見せ場としては甘め。
- 傷を腐らせる手は命中率 50%(戦士 AC16〜17 に +3)。標的がほぼ頭(前衛の戦士)なので、後衛を 1 撃で落とす場面は 10 回に 0 回。厳しくするなら候補 = 司祭 HP 33→40 前後 / 祠の手下を 1 体足す。緩める必要は見えない。⛔ 値は変えていない。
