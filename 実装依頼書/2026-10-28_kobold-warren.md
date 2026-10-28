# #103 新しい行き先「コボルドの巣穴」— 南の村から、竜を崇めるコボルドの巣へ(推奨 Lv2・本筋の外)

- **起草**: 2026-10-28(起草窓) / **ステータス**: **承認済**(2026-10-28 ユーザー承認)
- **着手**: ✅ 着手できる(2026-10-28 素材 3 本とも納品・起草窓が受け取りの目視と検算まで済ませた = §2-11)
- **基準 HEAD**: `4928049`(#102 完了。⚠ 着手時に必ず測り直すこと)
- **会議**: `dev-meetings/2026-10-28_new-locations.md`(第1段 → ユーザー決裁「①から順に進もうか」→ 第2段の開発計画書 → 追加決裁「ダンジョンは、新規で作ってほしい」)
- **触るファイル**: `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `world.html`(撤退スイッチの読み取り 1 箇所だけ)/ `tools/make_grid_map.py`(台帳 2 行)/ `tools/codex1_sprites.json`(台帳 1 行)/ `assets/`(焼き上がり 2 枚 + 族長のシート)/ 既存 golden の言い直し / `tools/verify_kobold_warren.js`(新規)
- ✅ **着手の前提(素材 3 本の納品)= 満たされた**(§2-11)。発注時の記録: 巣穴の地図 2 枚と族長の絵は起草時には**無かった**。起草窓が codex1 へ発注した(依頼文 `codex1/requests/2026-10-28_kobold-warren-maps.md` / `2026-10-28_kobold-chief.md`)。⛔ **既存の地図(廃坑など)を仮に借りて先に進めない**(ユーザー決定)。3 本とも受け取ってから着手する。
- 並走: なし(2026-10-28 起草時の `git status` は `dev-meetings/2026-10-28_new-locations.md` の未追跡 1 件だけ = 起草窓のもの)

---

## 1. 目的

ワールドマップの行き先を、D&D らしい依頼で 1 か所ずつ増やしていく(ユーザー方針 2026-10-28「MAP 上でいける新ロケーションをどんどん追加する方向」)。本チケットはその 1 か所目。

> 湖の南の村から、若者が酒場に駆け込んでくる。「夜ごと家畜がさらわれる。足跡は丘の下の穴へ続いていた」
> 行ってみると、そこはコボルドの巣だった。仕掛けだらけの穴を抜けた奥には、赤い竜を描いた祭壇と、さらわれた家畜の骨。族長は「大いなる赤き翼に捧げよ」と叫ぶ。祭壇には、赤い竜の卵が 1 つ置かれていた。

さらわれた家畜は、黒幕ファラクサスへの貢ぎ物だった。序盤の小さな依頼が、黒幕の影を初めて見せる場所になる。

あわせて、**2 か所目以降を足すための手順の型**を、今回の実際の手順から 1 枚にまとめる(項目4)。

**ユーザー決定(2026-10-28・会議の第 1 段 / 第 2 段 / 追加決裁)**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 増やし方 | ワールドマップの空いている中継点へ 1 か所ずつ。順番 = ① コボルドの巣穴 → ③ 倉庫街の教団 → ② 湖の島の墓所 → ④ 湖畔の魔女 | 一度に複数(地図の発注待ちが重なる) |
| 置き場所 | 本筋の外(`side: true`・#82 の器)。`village_s` を拠点「南の村」へ格上げ | 本筋の一本道に挿す |
| 推奨 Lv / 解放 | **Lv2・最初から受けられる**(`locked: false`)。廃坑(Lv3)の前の初仕事 | 廃坑の後(Lv1〜2 の行き先が無いままになる) |
| ダンジョン | **地図 2 枚とも新規**(丘と巣穴の口 → 赤い竜の祭壇の間) | ⛔ 既存の地図を仮に借りる(追加決裁で取り消し) |
| ボス | **新しい絵の族長 1 体**(竜の頭骨をかぶり杖を持つ) | 雑魚のコボルドを大きくして色を変える(すぐ見抜かれる) |
| 罠 | **部屋ごとに 1 つ**(入口 = 落とし穴 / 奥 = 落石)+ 族長の「仕掛け罠」1 回 | 罠を通路に並べる(オートでは吹き出しが続くだけ・Lv2 が崩れる) |
| 竜 | **祭壇に卵を描き込み、持ち帰ると酒場の主人が青ざめる**だけ | ⛔ 竜の幼体との戦闘(絵とブレスが増え、Lv2 の強さの読みが崩れる) |

---

## 2. 着手前の実測(基準 HEAD `4928049`)

### 2-1. ワールドマップ — `village_s` は最初から歩いて行ける

| 実測 | 出所 |
|---|---|
| `village_s` = `{ kind: "way", x: 736, y: 864 }`。辺は `["swamp","village_s"]` と `["village_s","fort"]` の 2 本 | `js/world-map.js:78` / `:90` |
| 地図の絵のその位置には、**畑と家の集まった村が描かれている**(1536x1024 の (560,700)-(920,1000) を切り出して目視) | `assets/world_region.jpg` |
| 歩く道 `findWalkPath` は**解放の有無を見ない**(未解放の沼地・砦の札の上も通り抜けられる) | `js/world-map.js:325-339`。⭐ `verify_quest_walk` の変異 `blockwalk` が「未解放ノードを道から外すと開始直後に詰む」を機械で押さえている |

⇒ 開始直後(`cleared=[]`)でも、港町 → 北の辻 → 沼地 → 南の村と歩ける。⛔ `EDGES` と座標は触らない(塔の母の `pass_n` と同じ流儀)。

### 2-2. 新しい行き先を足す口(全数・塔の母の足跡を今の行番号で数え直した)

`grep -n "tower-mother"` を `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` にかけ、塔の母の随伴(#83)専用の行を除いたもの:

| 場所 | 何 | 本件 |
|---|---|---|
| `index.html:3740` `ROAD_CHEST_GOLD` | 消えた隠し宝箱のぶんのクリア金貨 | 要: `"kobold-warren": 50`(隠し 2 × 25) |
| `index.html:4054` 付近 `SCENARIO_TEX` | 床と壁。無い id は廃坑へ落ちる | 要(絵の下に敷くだけ。廃坑の `床1.png` / `壁1.png` を指してよい) |
| `index.html:4678` `NODE_EXTRA_SPAWN_KINDS` | ⚠ **宣言しないと罠と宝箱が黙って 0** | 要: `t["kobold-warren"] = { n0: ["search", "loot"], n1: ["search"] }`(§2-4) |
| `index.html:6676` 付近 `ROOM_PAINTINGS_DEF[theme]` | 大部屋の絵 + MASK。⚠ `node: true` 必須 | 要: `n0big`(`outdoor: true`)/ `n1big` |
| `index.html:11589` 付近 `SCENARIOS[id]` | `title` / `flavor` / `perceptionDC` / `trapCount` / `hiddenChestCount` / `clearXp` / `clearGold` / `spawns` | 要(§6) |
| `index.html:15538` 付近 `SCENARIO_NARRATIONS` | 開幕の DM の語り | 要(§6) |
| `index.html:40288` `buildScenarioRun` の振り分け | ⚠ **行を縦に揃え直さない**(ドライバが逐語で握っている) | 要: `if (scenId === "kobold-warren") return buildKoboldWarrenRun();` |
| `index.html:41487` 付近 `buildTowerMotherRun()` | `p6Node()` を直接 2 回呼ぶ型 | 写し元 |
| `index.html:10174` `ENEMY_TYPES` | 敵の定義 | 要: `koboldChief`(§5-2) |
| `index.html:29472` `LORE_SKILL_OF` | 伝承判定の技能 | 要: `koboldChief: "history"`(コボルドと同じ) |
| `index.html:29509` `LORE_CR` | 脅威度 = **5e SRD の CR そのまま。SRD に元が無い敵は載せない**(#76 の決まり) | ⛔ **載せない**(族長は SRD に無い独自の頭目。§2-6) |
| `js/df-mapdef.js:48` `THEMES` | ⚠ 載っていないと validate で落ち、黙って絵が消える(#82 罠 3) | 要: `kobold-warren`(⛔ `FIELD_THEMES` には入れない) |
| `js/df-mapdef.js:1889` `THEME_DEFAULT_ENEMIES` | 地図エディタ用 | 推奨 |
| `js/df-mapdef.js:2205-2234` `LINT_PAINTING_ASPECTS` | ⚠ 焼き上がりの縦横比が既存 14 種のどれとも合わないと、起動時 lint が警告し `driver_graph_p6` (2c) が赤 | 焼き上がりの寸法しだいで要(7 例目) |
| `tavern.html:3750` `scenarios` | 卓の依頼 | 要(§4-1) |
| `tavern.html:3768-3780` 撤退スイッチ `?tower=0` | 配列から外し、ワールドマップの写しも今日の姿へ | 写し元(§7) |
| `tavern.html:6087` 帰還の処理 | `if (r.scenarioId === "tower-mother") markTowerMotherHome();` | 写し元(卵の印・§5-6) |
| `js/world-map.js:155` `SITES` / `:172` `UNLOCK` / `:375` 撤退 | tavern の写し(`verify_world_map (4s)` が機械照合) | 要 |
| `js/world-map.js:78` `NODES.village_s` | 中継点 | 要: `kind: "site"`・`label: "南の村"`・`desc`(⛔ id・座標・EDGES は変えない) |

⚠ **#82 の表にあった `SCENE_BGM` は、今はもう無い**。BGM は `sceneBgmTrack()`(`index.html:15456`)が全シナリオ共通の合成曲を返し、差し替えは廃坑の入口と竜の巣のボスの 2 件だけ。⇒ **BGM の作業は無い**(⛔ 新しい曲を足さない)。

### 2-3. ⚠⚠⚠ 罠 1 — 罠は戦闘中に発動しない(族長の「仕掛け罠」を罠の仕組みに乗せてはいけない)

```js
// index.html:28594
function checkTrapTrigger() {
  if (!gameStarted || gameOver) return;
  if (encounterActive || encounterRunning) return;   // ← 戦闘中は 1 つも調べない
  ...
  if (trap.tx === pTX && trap.ty === pTY && !trap.found) {   // ← 踏むのは「見えていない罠」だけ
```

会議では「族長が戦闘の始めに足元へ罠を仕掛ける」とした。これを `traps[]` へ罠を 1 つ足す形で作ると、**戦闘中は判定されず、見えている罠は踏まれもしない** = 仕掛けた罠は永久に発動しない。

⇒ **族長の「仕掛け罠」は、ボスの手番の特別な行動として作る**。写し元 = 単眼の暴君の「押し潰す眼」`sovereignPressEye()`(`index.html:22272`。1 体を `pickEnemyTarget` で狙う・DEX セーヴ・失敗で `applyStatus(unit, "prone", dur)`・リングオブフリーアクションで無効・検証用の probe 配列)。入口は、ボスの手番の特別行動が並ぶ所(アンバーハルクの眩惑の視線 `index.html:36911` の並び)に 1 つ足す。
⭐ §8 の変異 `snareastrap` で機械検査する(仕掛け罠を `traps[]` 経由にすると (3a) が赤)。

### 2-4. ⚠⚠ 罠 2 — 罠の数はノードごと・種類は 1 つしか無い

- `spawnTraps()`(`index.html:26712`)は**ノードに入るたびに**呼ばれ(`spawnNodeEntities` `:37882`)、`currentScenario.trapCount` 個を置く。置くのは `search` を兼ねるノードだけ(判定の唯一の正は `js/df-mapdef.js` の `KIND_SPAWNS_TRAPS`。台帳は `NODE_EXTRA_SPAWN_KINDS`)
  ⇒ **`trapCount: 1` と、n0・n1 の両方に `search` を宣言すれば「部屋ごとに 1 つ」**になる
- 罠の種類は `TRAP_TYPES = { damage: {...} }` の 1 種だけ(`:27153`)。`spawnTraps` は `type: "damage"` を**直書き**している(`:26746`)。踏んだときの 1d6 も `triggerTrapOnPlayer` が直書き(`:28638` 付近)。
  ⇒ 「落とし穴」「落石」は**語りの違いだけ**で作る。`TRAP_TYPES` に `pit` / `rockfall` の 2 行(ダイスは `damage` と同じ 1d6・`disarmXP` も同じ)と、その種類の語り(`dmText`)を足す。種類はシナリオがノードごとに宣言する(`trapTypeByNode: { n0: "pit", n1: "rockfall" }`)。宣言の無いシナリオは今日どおり `damage`。
  ⛔ **`spawnTraps` の乱数の消費順を変えない**(`Math.random` の呼び出しを 1 つも足さない・減らさない。後続のスポーンが同じ乱数列を引く = #90 §2-3)。⛔ 新しいダイスを足さない(Lv2 の強さの読みを崩さない)。
  ⭐ §8 の変異 `typerng` で機械検査する(種類を決めるのに `Math.random` を 1 回足すと (6a) の既存シナリオの罠の座標がずれて赤)。

### 2-5. ⚠⚠ 罠 3 — 開始直後の卓が変わる(森の予告が出なくなる)

```js
// tavern.html boardFacts() / boardValid() 条件②
//   各 id が解放済み — ただし解放済みが 2 件未満のときに限り「次の未解放」1 件を許す
```

今の開始直後(`cleared=[]`)は、解放済みが廃坑の 1 件だけなので、卓は「廃坑 + 次の未解放 = 森の予告」。巣穴を `locked: false` で足すと解放済みが 2 件になり、卓は「**廃坑 + 巣穴**」で埋まる。**森の予告は出なくなる。**

⇒ これは**意図どおり**(Lv1〜2 で受けられる依頼が卓に並ぶのが本件の狙い)。ただし開始直後の卓を見ている既存 golden(少なくとも `verify_quest_draw`)は**期待値の言い直し**が要る。⛔ 期待値を緩めない(「廃坑 + 巣穴」を名指しで縛る形へ移す)。⭐ 撤退 `?warren=0` では今日どおり「廃坑 + 森の予告」へ戻ることを §8 (4b) で確かめる。

### 2-6. コボルドと族長の型

| 実測 | 出所 |
|---|---|
| `kobold`: HP5・AC13・1d4+1・群れ戦術 `packTactics`・XP70・96px セル・`displaySize: 56`。「罠好き `trap_master`」は**未実装**(コメントのみ) | `index.html:10363-10380` |
| 5e SRD のコボルドは **1 種だけ**(CR1/8・HP5・AC12・Pack Tactics・Sunlight Sensitivity・言語に竜語)。族長・羽のあるコボルドは SRD に**無い** | Dropbox `raw/srd/monsters/kobold.md`(`kobold*` は 1 ファイル) |
| ボス枠は `isBoss: true` の型を置く(#82 §12-0 K3: `direBear` は isBoss なので丘の道に置けなかった = 逆にボス枠には isBoss が要る) | `wyvernBoss`(`index.html:11294`)の `boss: [31, 15, "wyvernBoss"]` |
| 遭遇の掛け声は「家系」で引く(`detectEnemyFamily` `:15314` が `kobold` → `fam = "kobold"`)。`encounter.kobold` / `enemy.cry.kobold` の台詞あり | `index.html:15326` / `:13189` / `:13238` |
| ⚠ `verify_lore_check` の (0b) は **`ENEMY_TYPES` のキー数 51 を固定で数え**、ドライバ側の表で「技能あり 40 / 対象外 11」に振り分けている | `tools/verify_lore_check.js:31` / `:905` |

⇒ 族長 `koboldChief` は **SRD のコボルドをもとにした独自の頭目**。`LORE_SKILL_OF` には載せる(`history`)・`LORE_CR` には載せない(#76 の決まり)。家系の判定でコボルドとして扱われるよう、`detectEnemyFamily` の `kobold` 分岐に `koboldChief` も入れる。`verify_lore_check` は 51 → 52 / 41 / 11 へ言い直す。

### 2-7. 卵 — イベントアイテムの表は使わない

`EVENT_ITEMS = []`(`index.html:25223`)は配線だけあって**一度も使われていない**。置き場所は乱数で、**スタートとボスの部屋は候補から外れる**(`spawnExplorationChests` `:25348`)= 祭壇(ボスの部屋)に置けない。

⇒ 卵は**絵に描き込み**、クリアしたら印を残す。写し元 = 塔の母の「連れ帰った印」(`tavern.html:6013` `TOWER_MOTHER_HOME_KEY` / `:6087` 帰還の処理 / `:11933` 再会の場面)。酒場の主人は `NPC_CROWD.TAVERN` の `keeper`(`js/npc-crowd.js:37`)。

### 2-8. 推奨 Lv と仲間の Lv

`questLevelOf()`(`tavern.html:8474`)が `recommendedLevel` を返し、仲間の Lv はその帯から振られる(#72)。⇒ 推奨 Lv2 なら仲間も Lv2 前後で来る。廃坑 = `recommendedLevel: 3`・`clearXp: 300`・`perceptionDC: 12`・`trapCount: 3`(`tavern.html:3614` / `index.html:11455`)。

### 2-9. 名指しで色を控える既存 golden(着手前に実走)

- `SITES` / 卓 / `tower-mother` を読む 17 本(`grep -l -E "tower-mother|SITES|boardFacts|nextLocked" tools/verify_*.js tools/driver_*.js`): `verify_corner_check` / `verify_declared_traps` / `verify_dragon_fold` / `verify_quest_draw` / `verify_quest_visibility` / `verify_quest_walk` / `verify_road_ambush` / `verify_road_boon` / `verify_road_events` / `verify_swamp_novice` / `verify_tavern_map` / `verify_tower_mother` / `verify_tower_mother_b` / `verify_world_heromark` / `verify_world_map` / `verify_world_steps` / `driver_mapeditor_painting`
- 敵の在庫: `verify_lore_check`(§2-6)
- 地図と lint: `driver_graph_p6`
- ⭐ 母集団の全数は、いつもどおり「変更したファイル(`index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `world.html`)を読む本」で引く

### 2-11. 素材の納品(2026-10-28 起草窓・3 本とも納品済み)

| 素材 | 置き場 | 起草窓の実測 |
|---|---|---|
| 村はずれの丘 | `C:\Users\PC_User\Desktop\codex1\assets\maps\warren-hill-v1.png`(md5 `19d1561c…`・1536x1024) | ⭐ read-only の下見だけで生成(214 秒)= 本番投下は不要・受け取り側で保存。目視 = 西の端から東の巣穴の口まで途切れない土の道◎ / 壊れた羊の囲いと干し草(南西)◎ / くくり罠の縄・杭の見張り台・骨◎ / 坑木・線路なし◎。`--fit --fit-around 48` 一次解 = phase (14.75, 42.75) / period (48.010, 50.150) / cells (31, 19)。⚠ **縦横差 4.5%**(塔の最上階 3.6% より大きく、出荷済みの廃坑 7.75% より小さい)→ 焼いて 3 指標を必ず見る |
| 赤い竜の祭壇の間 | `…\assets\maps\warren-altar-v1.png`(md5 `dbe306b6…`・1536x1024) | 同上。目視 = 西辺の中ほどにトンネルの口◎ / 中央の広い土の床◎ / 東に赤い竜の絵の石の祭壇 + 中央に赤い卵(よく目立つ)◎ / ろうそく・骨の山・羊毛の寝床・槍と縄・掘りかけの穴と板◎ / 天井から差す光(北西)◎。一次解 = phase (47.35, **0.00**) / period (48.005, 47.960) / cells (31, 21)。⚠ **縦の位相がちょうど 0.00 = 端に張り付いた疑い**(砦の「一次解が外れた」前例)→ 位相ごと見直してから焼く |
| 族長 | `…\assets\kobold-chief\kobold-chief-walk-attack-right-6-aligned\`(walk 6 + attack 6・各 768x724)。単独フォルダ `kobold-chief-walk-right-6\` / `-attack-right-6\` も在る | 下見 82 秒 → 本番 859 秒。⚠ codex 側に Python が無く validator は PowerShell 代替だった(正直に申告)→ **受け取り側で依頼文 §3-3 を実走**: キャンバス一致 / 接地線 spread **0px** / 中央値差 −2.4% / 最大高 **1.003** × H_w / walk 最大幅 0.675 / attack 最大幅 0.826 / 端の接触なし / md5 **12/12 相違** / 連結成分(8 近傍・64px 以上)**各コマ 1** / `check_alpha_bg_residue.py` **疑い 0 件**。QA シート(暗い土 #2a1c14 と明るい灰)目視 = 竜の頭骨・杖・赤いマント◎・手下のコボルドと同じ種族◎。⚠ 暗い背景で足元にわずかにマゼンタの縁(既存の `kobold` と同程度)→ 取り込み時に本番の床の上で目視し、目立てば `tools/clean_codex1_frames.py` の `-clean` 派生 |

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `scenarios` に `kobold-warren`(`side: true`・`locked: false`)/ 撤退 `?warren=0` / 帰還で卵の印 / 酒場の主人の一言(初回だけ)/ changelog |
| `index.html` | §2-2 の「要」の口 / `ENEMY_TYPES.koboldChief` / 仕掛け罠 `koboldSnare()` と手番の入口 / `TRAP_TYPES` に 2 行 + `spawnTraps` の種類の宣言 / `buildKoboldWarrenRun()` / 大部屋 2 枚の `ROOM_PAINTINGS_DEF` + MASK |
| `js/df-mapdef.js` | `THEMES` に `kobold-warren` / `THEME_DEFAULT_ENEMIES` / 必要なら `LINT_PAINTING_ASPECTS` |
| `js/world-map.js` | `village_s` を拠点「南の村」へ / `SITES` / `UNLOCK` / 撤退で中継点へ戻す |
| `world.html` | 撤退スイッチ `?warren=0` の読み取り 1 箇所(`?tower=0` の隣) |
| `tools/make_grid_map.py` | `GRIDS["warren-hill"]` / `GRIDS["warren-altar"]` |
| `tools/codex1_sprites.json` | `koboldChief` 1 行 |
| `assets/` | `room_kobold-warren_n0_map.jpg` / `room_kobold-warren_n1_map.jpg` / `koboldChief_anim.png` |

⛔ `town.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` / `js/npc-crowd.js` は触らない。
⛔ 勝利判定・`defeatEnemy()`・`runEncounter` の手番ループ・`checkTrapTrigger()` は触らない。

---

## 4. STEP1 — 依頼の登録(酒場・ワールドマップ)

### 4-1. `tavern.html` の `scenarios`(`tower-mother` の後ろに足す)

```js
    /* ★[#103] 新しい行き先の 1 か所目「コボルドの巣穴」(本筋の外・最初から受けられる初仕事)。
       ⭐ side フラグ = 卓の抽選 (#81) の母集団には入るが、「本筋」「次の未解放」の判定からは外れる (#82 と同じ)。
       ⚠ locked:false = 開始直後から解放済み → 卓の 2 枠目が「森の予告」から「巣穴」に変わる (依頼書 §2-5)。
       ⚠ id は index.html の SCENARIOS / js/world-map.js の SITES・UNLOCK と同じ (verify_world_map (4s) が照合)。 */
    {
      id: "kobold-warren",
      place: "南の村",            /* ⚠ id の直後に置く (検証ドライバが id → place の並びで配信バイトを読む) */
      side: true,
      title: "コボルドの巣穴",
      difficulty: "★",
      recommendedLevel: 2,        /* 廃坑 3 の手前。⚠ 強さの実測 (§8 ⑤) で直してよい */
      reward: "村の謝礼",
      client: { name: "<名前>", role: "南の村の若者", type: "<既存の人形の型>" },
      dialog:
        "「湖の南の村から来ました。夜ごと羊がさらわれるんです。足跡をたどったら、丘の下の穴に続いていて……" +
        "中から甲高い鳴き声がしました。村の者では手に負えません。どうか助けてください」",
      enemies: [
        { name: "巣穴のコボルド", boss: false },
        { name: "コボルドの族長", boss: true },
      ],
      locked: false,
    },
```

- 名前と人形の型は既存の `client.type` から選ぶ(実装窓が決めてよい。若者に見える型)
- `ALL_MAIN_SCENARIOS` には入れない(本筋 6 本のまま)。1 枚絵(`?tavernmap=0`)と奥の間(`?questdraw=0`)は #82 の `side` 除外がそのまま効く(⭐ 項目1 で効いていることを測る)

### 4-2. `js/world-map.js`

- `NODES.village_s` を `{ kind: "site", x: 736, y: 864, label: "南の村", desc: "湖の南の農村。丘の下にコボルドの巣穴" }` へ(⛔ id・座標・EDGES は変えない)
- `SITES["kobold-warren"] = "village_s"` / `UNLOCK["kobold-warren"] = null`
- 札の数を書いたコメント(8 つ)は 9 つへ直す
- 撤退は `retireTower()`(`:371` 付近)の隣に同じ形で(`delete SITES[...]` / `delete UNLOCK[...]` / `village_s` を `kind: "way"` へ)

---

## 5. STEP2 — 地図 2 枚・族長・罠(`index.html` ほか)

### 5-1. 地図の焼き付け(`codex-map-request` スキルの段 3〜4)

1. `py tools/make_grid_map.py --fit … --fit-around 48` を**位相ごと**見直す(⚠ 砦で一次解が外れた前例)→ `GRIDS` に 2 行 → `--name` で焼く → 検算 3 指標(ドリフト ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%)。⛔ 閾値を緩めない。通らなければ codex1 へ v2 を発注(起草窓へ戻す)
2. MASK(`blocked`)を書く。⚠ 外周 1 マスは `.`・入口の行は端から端まで開ける・敵のタイルは全部 `.`・4 近傍の BFS で連結を確かめる(写し元 = 塔の母の n0big / n1big)
   - n0「村はずれの丘と巣穴の口」: 西の村の道 → 東の巣穴の口(屋外 = `outdoor: true`)
   - n1「赤い竜の祭壇の間」: 西の入口(坑道)→ 東の祭壇の前。⚠ 祭壇そのものと卵のタイルは `blocked`(上に敵を置かない・歩かせない)

### 5-2. `ENEMY_TYPES.koboldChief`

```js
      /* ★[#103] コボルドの族長。5e SRD のコボルド (CR1/8) をもとにした独自の頭目 (SRD に族長は無い)。
       * ⭐ 竜を崇める部族の長。竜の頭骨をかぶり杖を持つ。戦闘の最初の手番に 1 度だけ「仕掛け罠」(koboldSnare)。
       * ⚠ LORE_CR には載せない (SRD に元が無い = #76 の決まり)。LORE_SKILL_OF は history (コボルドと同じ)。
       * ⚠ 値は出発点。強さの実測 (依頼書 §8 ⑤) で直してよい。 */
      koboldChief: {
        name: "コボルドの族長",
        flavor: "竜の頭骨をかぶったコボルドの長。赤き翼への貢ぎ物を集め、巣を罠で固める",
        sprite: "assets/koboldChief_anim.png?v=1",
        /* sheetW / sheetH / frameW / frameH / cols / displaySize / bodyRatio* は納品物の実測で入れる
           (⚠ displaySize は当たり判定に直結。コボルド 56 より一回り大きく、主人公より小さい) */
        hp: 27, speed: 1.0,
        hasAttackAnim: true,
        str: 0, dex: 2, atkBonus: 4, ac: 14,
        dmgDice: "1d6", dmgBonus: 2, critRange: 20, critMult: 2,
        range: "melee",
        packTactics: true,
        isBoss: true,
        maxSummons: 0,
        snareDC: 12, snareDice: "1d6",   /* ★[#103] 仕掛け罠: 1 戦闘に 1 回 (koboldSnare) */
        xp: 200,
      },
```

### 5-3. 仕掛け罠 `koboldSnare(enemyIdx)`

- 写し元 = `sovereignPressEye()`(`index.html:22272`)。`pickEnemyTarget(enemyIdx)` で 1 体を狙う → DEX セーヴ(`d20 + dex + getSaveBonus`)vs `def.snareDC` → 失敗で `snareDice` のダメージ + `applyStatus(unit, "prone", 1)`。リングオブフリーアクションは転倒だけを防ぐ(ダメージは受ける)
- 演出: `showBanner("🪤 仕掛け罠 🪤")` / 吹き出しは `SAVE` / `SNARED`。DM の一言「族長が杖で床を叩いた——足元の縄が跳ね上がる!」
- 入口: ボスの手番の特別行動の並び(`index.html:36911` の眩惑の視線の**前**)に `if (def.snareDC && !enemy.__snareUsed && bossAction === "normal") { enemy.__snareUsed = true; koboldSnare(idx); await sleepMs(1100); return; }`
- 検証用 probe: `window.__snareProbe`(`__pressEyeProbe` と同じ形)。⛔ ゲームの判定には使わない
- ⛔ `traps[]` へ足さない(§2-3)。⛔ 他の敵に `snareDC` を付けない

### 5-4. 罠の種類(落とし穴 / 落石)

- `TRAP_TYPES` に `pit: { damageDice: "1d6", weaponizeDice: "2d6", disarmXP: 25, dmText: "足元の板が抜けた——落とし穴だ!" }` / `rockfall: { …同じ…, dmText: "頭上で縄が切れる音——落石だ!" }`
- `spawnTraps()` の `type: "damage"` を `type: trapTypeForNode()` へ。`trapTypeForNode()` は `currentScenario.trapTypeByNode` と `currentNodeId` から引き、無ければ `"damage"`。⛔ `Math.random` を呼ばない(§2-4)
- 踏んだときの語りは `TRAP_TYPES[trap.type].dmText`(無ければ今日の「しまった! 罠だ!」)。⚠ `triggerTrapOnPlayer(trap, dmText)` の第 2 引数(ファンブル等の文脈の語り)が来ているときは**そちらを優先**(今日の挙動を変えない)

### 5-5. `buildKoboldWarrenRun()`

塔の母(`index.html:41487`)の型で、`p6Node()` を直接 2 回呼ぶ:

- n0「村はずれの丘」: `paint: "n0big"`・`density: 0`・`start` は西の村の道・コボルドの 2 群(初期案: 3 体 + 2 体。2 群の距離は `DETECTION_RANGE` 12.5 タイルより離す = 別々の戦闘)・出口 `ex("n1", "right", <右辺の中点>)`(⚠ 出口を持つ rect は唯一解 = #53)
- n1「赤い竜の祭壇の間」(`kind: "boss"`): `paint: "n1big"`・`start` は西の入口・コボルド 3 体 + `boss: [.., .., "koboldChief"]`
- ⚠ p6Node の既定 3 つ(`density` / `start` / `paint`)は全部明示する(#53 の罠)
- ⚠ 敵のタイルは MASK で全部 `.`。入場から最寄りの敵まで交戦距離(400px)より離す(入場の語りの最中に戦闘が始まらない)

### 5-6. 卵の印と酒場の主人の一言

- `tavern.html` の帰還の処理(`:6087` の隣)に `if (r.scenarioId === "kobold-warren") markRedEgg();`。印 = `localStorage["dragonfighters.redEgg"] = "1"`(2 回目以降も 1 のまま)
- 初めて印が立った回だけ、帰還の帯が出た後に `keeper` が 1 回しゃべる: 「その卵……赤い鱗の色をしている。まさか、あの竜の……。悪いことは言わない、それは誰にも見せるな」(⚠ 塔の母の再会の場面 `:11933` の型。`window.__redEggPending` は初回だけ真)
- 勝利時の DM の一言(`index.html`): 「祭壇の上に、赤い卵が 1 つ残されていた。君たちはそれを布に包んだ。」
- ⛔ 卵の効果・売買・後日談は作らない(§11)

---

## 6. STEP3 — シナリオ定義と語り

- `SCENARIOS["kobold-warren"]`: `title: "コボルドの巣穴 — 赤き翼の祭壇"` / `flavor: "家畜をさらうコボルドを追い、丘の下の巣穴を一掃せよ"` / `perceptionDC: 11` / `trapCount: 1` / `trapTypeByNode: { n0: "pit", n1: "rockfall" }` / `hiddenChestCount: 2` / `clearXp: 200` / `clearGold: 120` / `spawns`(`?graph=0` の単一マップ用の退避先。塔の母と同じ扱い)
- `SCENARIO_NARRATIONS["kobold-warren"]`:
  1. 「君たちは、湖の南の小さな村に着いた。柵は壊され、羊の囲いは空だった。」
  2. 「泥に残る小さな足跡は、村はずれの丘を登り、草に隠れた穴へと消えている。甲高い鳴き声が、地の底から響いてくる。」
  3. 「コボルド——竜を崇める小さな種族だ。数を頼みに群れ、罠を好む。足元に気をつけろ。」
  4. 「さあ、穴へ降りろ。」
- 遭遇の掛け声は既存の `kobold` 家系を使う(⛔ 新しい台詞を足さない)

---

## 7. 撤退スイッチ

- **`?warren=0`** — 酒場の `scenarios` から `kobold-warren` を外し、ワールドマップの `village_s` を中継点のまま描く(= 今日の姿。開始直後の卓は「廃坑 + 森の予告」に戻る)
- 判定位置 = `tavern.html` と `world.html` がそれぞれ自分のページで読む(`?tower=0` と同じ「ページ単位で独立」)。⚠ 遷移はまたがない
- ⭐ `index.html` は判定しない(依頼が卓に出なければ入れない)
- ⚠ 族長の仕掛け罠・罠の種類は `kobold-warren` にしか付かないので撤退の対象外

---

## 8. 受入条件 — `tools/verify_kobold_warren.js`(新規・port base **10642**・変異は **10643〜**。#102 の `verify_plaza_hours` が 10641 まで)

方針: 登録の整合は**ブラウザに載った実体どうし**で突き合わせる(写経しない)。仕掛け罠は本番の `runEncounter` を回して probe で観測する。強さは assert にせず**実測値を報告**する(⑤)。

### §0 装置

- **(0a)** `ENEMY_TYPES.koboldChief` / `buildKoboldWarrenRun` / `koboldSnare` / `__snareProbe` が window から見える(⚠ classic script 直下は window に載らない → 検証シームを明示)
- **(0b)** `kobold-warren` の 2 ノードが組み上がり、族長が 1 体・コボルドが n0 に 1 体以上・n1 に 1 体以上いる(⭐ 0 体だと §3 が全部空振り)

### §1 登録の整合(2 経路)

- **(1a)** tavern の `scenarios` の `kobold-warren`(`side: true`・`locked: false`)と、`js/world-map.js` の `SITES` / `UNLOCK`(null)が一致。`village_s` が `kind: "site"`
- **(1b)** `ALL_MAIN_SCENARIOS` に入っていない
- **(1c)** `cleared=[]` → 卓は「廃坑 + 巣穴」(⭐ 本筋 = 廃坑)。8 回引き直しても変わらない
- **(1d)** 本筋 6 本クリア → 本筋は null(⛔ 巣穴を本筋にしない)
- **(1e)** `cleared=[]` の `world.html` で、港町から `village_s` まで `WM.findWalkPath` が null でない(⛔ 自前の BFS を書かない)

### §2 地図

- **(2a)** 焼き上がり 2 枚が `--check` の 3 指標で OK
- **(2b)** 本番の経路探索で、n0 の入口 → 出口、n1 の入口 → 祭壇の前が通る。敵のタイルが全部歩ける。祭壇のタイルは `blocked`
- **(2c)** 罠が n0 に 1 つ・n1 に 1 つ(`type` がそれぞれ `pit` / `rockfall`)。玄室の宝箱が n0 に出る
- **(2d)** n0 は `outdoor` で霧が晴れ、絵が出ている(`isCustom` が true)/ n1 は霧がある

### §3 仕掛け罠

- **(3a)** 族長の最初の手番で `__snareProbe` に 1 件(標的・DC・ロール・成否)。`traps.length` は変わらない
- **(3b)** 2 回目以降の手番では発動しない(1 戦闘に 1 回)
- **(3c)** セーヴ失敗(d20 を 1 に固定)→ 標的が `prone`・HP が 1〜6 減る / 成功(20 に固定)→ どちらも起きない
- **(3d)** リングオブフリーアクション → `prone` は付かない・ダメージは受ける
- **(3e)** 他の敵(コボルド・既存のボス)は仕掛け罠を使わない

### §4 罠の種類と卵

- **(4a)** n0 の罠を踏むと「落とし穴」の語り・n1 では「落石」の語り・既存シナリオは今日の語り
- **(4b)** 撤退 `tavern.html?warren=0` で `scenarios` に `kobold-warren` が無く、開始直後の卓が「廃坑 + 森の予告」/ `world.html?warren=0` で `village_s` が中継点。⭐ (1a)(1c)(4b) の条件を ON/OFF の両方へ当てて反転すること
- **(4c)** 帰還(`kobold-warren` クリア)で印が立ち、初回だけ `keeper` がしゃべる・2 回目は黙る

### ⑤ 実測して報告する(assert しない)

- Lv2・4 人で N=10 走行のクリア率・全滅率・所要。強すぎ/弱すぎなら頭数・族長の HP・罠の DC を直し、**直した値と根拠を §12 へ**(⭐ 目安 = Lv2 の 4 人で全滅しない・廃坑より易しい)

### §6 恒等(非退行)

- **(6a)** 既存 7 シナリオで、罠の座標と種類(`damage`)が着手前と同じ(同じ乱数の種で比べる)

### ⛔ 測らないこと

- 地図の絵の出来・族長の見た目・仕掛け罠の演出の長さ(目で直す)/ 依頼の文面 / 謝礼の額 / 主人の台詞

### 負のコントロール(`--negative`。配信スナップショットをメモリ上で差し替える)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `snareastrap` | ⭐ 罠 1: 仕掛け罠を `traps[]` へ罠を 1 つ足す形にする | (3a) |
| `snareevery` | `__snareUsed` を立てない(毎手番使う) | (3b) |
| `typerng` | ⭐ 罠 2: 種類を決めるのに `Math.random` を 1 回足す | (6a) |
| `nosearch` | `NODE_EXTRA_SPAWN_KINDS` から n1 の `search` を外す | (2c) |
| `fieldtheme` | `kobold-warren` を `FIELD_THEMES` に入れる | (2d) |
| `locked` | ⭐ 罠 3 の裏: `locked: true, unlockAfter: "goblin-mine"` にする | (1c) |
| `inmain` | `ALL_MAIN_SCENARIOS` に足す | (1b) |
| `nositeflag` | `village_s` を `kind: "way"` のままにする | (1a) |
| `snareall` | すべての敵に `snareDC` を付ける | (3e) |
| `ringall` | フリーアクションでダメージも防ぐ | (3d) |

### 既存 golden

- §2-9 の名指しの本は、着手前の色を項目1 で控えてから比較。⚠ 「開始直後の卓 = 廃坑 + 森の予告」「site 8 つ」「ENEMY_TYPES 51 キー」を縛る assert は**期待値を緩めず**、巣穴の 1 件 / site 9 つ / 52 キーを足した形へ測定点を移す(⛔ 本数を減らさない)

---

## 9. 実機/実感の確認

- 新しく始めた Lv1〜2 で、卓に巣穴が並び、ワールドマップの「南の村」の札が縦画面で押せるか
- 罠の吹き出しが 1 回の潜行で 2 回 + 仕掛け罠 1 回に収まっているか
- 祭壇の卵が絵の中で目に留まるか / 主人の一言で「ファラクサスの影」が伝わるか

---

## 10. changelog(`index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>新しい行き先「コボルドの巣穴」</b> — 湖の南の村から、家畜をさらわれたという依頼が駆け出しの冒険者の卓に並ぶ。罠だらけの巣の奥で待つ族長は、何かを崇めているらしい。"

---

## 11. やらないこと

- ⛔ 竜の幼体との戦闘 / 卵の効果・売買・後日談(持ち帰った印と主人の一言まで)
- ⛔ コボルドの日光過敏(Sunlight Sensitivity)/ 雑魚コボルドの新しい絵 / 新しい BGM / 依頼人の肖像
- ⛔ 罠の新しいダイス / 他の敵への仕掛け罠の展開
- ⛔ ③ 倉庫街の教団・② 湖の島の墓所・④ 湖畔の魔女(次のチケット以降)
- ⛔ 既存の地図を仮に借りて先に進める(ユーザー決定)
- `実装依頼書/README.md` へ足す行(承認後に起草窓が足す):

    | 103 | [2026-10-28_kobold-warren.md](2026-10-28_kobold-warren.md) | **承認済**(⏸ 素材待ち) | 0% | 新しい行き先の 1 か所目「コボルドの巣穴」。本筋外 `kobold-warren`(`side:true`・`locked:false`・推奨 Lv2)/ `village_s` を拠点「南の村」へ / 新規の卓上マップ 2 枚(丘と巣穴の口 → 赤い竜の祭壇の間)/ 新しい敵 `koboldChief`(1 戦闘に 1 回の仕掛け罠 = DEX セーヴ → 転倒 + 1d6)/ 罠は部屋ごとに 1 つ(落とし穴 / 落石は語りだけ違う)/ 卵の印と酒場の主人の一言。⚠⚠⚠ 罠は戦闘中に発動しない = 仕掛け罠は手番の行動で作る / 罠の種類で乱数を足さない / 開始直後の卓が「廃坑 + 巣穴」に変わる。撤退 `?warren=0` |

### 項目の割り方(dev-loop)

1. **着手前の実測 + 素材の取り込み** — §2 を測り直す・名指し golden の色を控える・地図 2 枚の焼き付けと MASK・族長のシートの取り込み(分身チェック・背景残りチェックを焼き上がりで)
2. **本体** — §4〜§6・changelog
3. **受入** — `tools/verify_kobold_warren.js` 新規・強さの実測 ⑤
4. **母集団の非退行 + 手順の型** — 既存 golden の言い直し・§12 / README の行を完了へ・`実装依頼書/_TEMPLATE_new_location.md`(今回の実際の手順を「新しい行き先を 1 か所足す手順」として 1 枚に。⭐ 次の ③ 倉庫街で使う)

---

## 12. 実装結果

(実装窓が書く)
