# #107 新しい行き先「霜の巨人の砦」— 地下神殿の奥、雪の峠に霜の巨人(推奨 Lv8・神殿の後・本筋の外・ワールドマップに点と道を初めて足す)

- **起草**: 2026-11-04(起草窓) / **ステータス**: **承認済**(2026-11-04 ユーザー承認・承認ダイアログで「承認してノートに記載」。同じダイアログで **冬狼の冷気の息も入れる** = §2-5 を改稿)
- **着手**: ⏸ 保留 — 素材 4 本の納品待ち(§2-9)
- **基準 HEAD**: `241c718`(#106 完了・origin と同期。⚠ 着手時に必ず測り直すこと)
- **会議**: `dev-meetings/2026-11-04_fifth-location.md`(第1段 候補① → 第2段の開発計画書)
- **手順の型**: `実装依頼書/_TEMPLATE_new_location.md`(本書はそれを写して埋めたもの)。⚠ ただし手順の型は「**中継点を格上げ・⛔ EDGES は変えない**」が前提。本件はその前提の外 = **点と道を足す初回**(§2-1)。手順の型への追記は項目4 の仕事(§10)。
- **触るファイル**: `index.html` / `tavern.html` / `js/world-map.js` / `js/df-mapdef.js` / `world.html`(撤退スイッチの読み取り 1 箇所だけ)/ `tools/make_grid_map.py`(台帳 2 行)/ `tools/codex1_sprites.json`(台帳 2 行)/ `assets/`(焼き上がり 2 枚 + シート 2 枚)/ 既存 golden の言い直し / `tools/verify_frost_hold.js`(新規)/ `js/changelog.js`(ヘルパー経由)/ `実装依頼書/_TEMPLATE_new_location.md`(項目4)
- ⏸ **着手の前提 = 素材 4 本の納品**(地図 2 枚・霜の巨人・冬狼)。起草時点では**どれも無い**。依頼文は承認後に起草窓が `codex1/requests/` に起草 → ユーザー承認 → 投下する(§2-9)。⛔ **既存の地図・既存の絵を仮に借りて先に進めない**(#103 のユーザー決定「ダンジョンは新規で」)。
- 並走: なし(2026-11-04 起草時の `git status` は clean・`origin/main..HEAD` = 0 本)

---

## 1. 目的

本筋外の行き先の **5 か所目**。①〜④(#103〜#106)は全部「札の出ない中継点を拠点へ格上げ」で作ったが、**その空きは残り 2 つ**(`cross_n` / `farm_n`)で、どちらも札の混み合う分かれ道だった(§2-1)。本件は**ワールドマップに新しい点と道を足す初回**として、絵に描かれているのに何も無い雪山へ行き先を置く。

> 地下神殿のさらに奥、雪の峠を越えた先。古い氷の砦に、山から下りてきた霜の巨人が住みついた。峠を通る隊商が岩に潰され、生き残りは「巨人は何かから逃げてきたようだった」と言う。
> 大広間で巨人は言う——「山の向こうの赤い竜に、我らの住処は焼かれた。ここは譲らぬ」

型は「**ラスボス前の腕試し**」。神殿(Lv8)の後・竜の巣(Lv10)の前に、寄れる依頼が 1 つも無かった(§2-6)隙間を埋め、竜(ファラクサス)の脅威を本筋の外から語る。

**ユーザー決定(2026-11-04・開発会議の第1段 / 第2段)**:

| 論点 | 採用 | 不採用(と理由) |
|---|---|---|
| 場所 | **雪山。神殿から道を 1 本延ばした先に新しい点 `frost_peak`**(袋小路) | 北の農村 `farm_n` の格上げ(札が混む・Lv 帯が廃坑と重なる)/ 湖の東の小島(湖を横切る道)/ 北の浜の入り江(Lv 帯が埋まらない) |
| 解放と推奨 Lv | **神殿の後・推奨 Lv8**(`locked: true` + `unlockAfter: "undead-temple"`) | — |
| ダンジョン | **地図 2 枚とも新規**(雪の峠道 → 氷の砦の大広間) | ⛔ 既存の地図を借りる |
| ボス | **新しい絵のフロスト・ジャイアント**(5e SRD Frost Giant・CR8) | — |
| ボスの特別な行動 | **岩投げ**(SRD Rock。近くに誰も居ない手番に、後衛へ岩を投げる) | — |
| 手下 | **峠 = 既存のオーク**(巨人に雇われた)/ **大広間 = 新しい絵の冬狼 2 頭**(SRD Winter Wolf・CR3) | 手下も全部新しい絵(発注が増える)/ 大広間もオーク(雪山らしさが出ない) |
| 冬狼の冷気の息 | **入れる**(承認ダイアログ 2026-11-04。SRD Cold Breath = DEX DC12・4d8・Recharge 5-6)。ブレスを「ボスでない敵」「冷気」へ広げる = **新しい仕組みは岩投げと冷気の息の 2 つ**(§2-5) | 噛みつきだけ(起草時の推奨。ユーザーが不採用) |
| 強さの物差し | **同じ帯の本筋 = 神殿 Lv8 の勝率と比べる**(⛔ 最初は SRD どおりに置き、値を変えない) | 前の 4 か所の「10/10 で勝てたか」(甘さの判断が積もるだけ) |
| 竜の伏線 | 大広間に入ったときの語り 1 か所だけ | 戦う / 見逃すの 2 択(#106 でやったばかり) |

⚠ 会議から**この起草で変えた点が 2 つある**(§2-3 の座標・§2-5 の冬狼の息)。承認のときに見てほしい(§12-0)。

---

## 2. 着手前の実測(基準 HEAD `241c718`・2026-11-04)

### 2-1. ⚠⚠⚠ 空いている中継点は 2 つだけ → 点と道を足す

| 実測 | 出所 |
|---|---|
| `kind: "way"` は `cross_n` (480,480) と `farm_n` (608,224) の **2 つだけ**。他の 12 点は全部拠点 | `js/world-map.js` `NODES` |
| どちらも 3 叉路。`cross_n` は主人公が立つとフランの札の 39.9% を隠す地図で唯一の場所。`farm_n` の周りには刻み点 2 つと墓所の札 | `js/world-map.js` の `signDx` の注記 |
| 手順の型 `_TEMPLATE_new_location.md` は「⛔ id・座標・`EDGES` は変えない」が前提。**点と道を足す手順は無い** | 手順の型 §1 の表 |

⇒ 本件は `NODES` に 1 点・`EDGES` に 1 本を**足す**。⭐ 新しい点は**袋小路**(道 1 本)なので、既存の点どうしの最短経路は 1 本も通らない = `findPath` / `findWalkPath` の既存の結果は 1 つも変わらない(§8 (1d) で縛る)。

### 2-2. ⚠⚠⚠ 撤退の器が `STEPS` を消し忘れると、点の無い所にマーカーが残る

```js
/* js/world-map.js — 刻み点は読み込み時に 1 回だけ作る (IIFE) */
var STEPS = (function () {
  var m = {};
  for (var i = 0; i < EDGES.length; i++) { ... m[ss[j].id] = ss[j]; }
  return m;
})();
```

- 撤退の器(`retireTower` 〜 `retireHag`)は**読み込みの後**で各ページが呼ぶ(`world.html` の `?hag=0` の隣・`tavern.html` の撤退スイッチの IIFE)。その時点で `STEPS` は**もう出来ている**。
- `world.html` の `buildSteps()` は `WM.STEPS` を**そのまま全部描く**(`var STEPS = WM.STEPS || {}` → `Object.keys(STEPS).forEach`)。押すと `goToPoint(id)` で歩く。
- 前例: `world.html:1184` の注記「`NODES["lake_n__lakeside@1"]` が undefined になり `.x` で TypeError で落ちる」。

⇒ `retireGiant()` は **`NODES` / `EDGES` / `STEPS` / `SITES` / `UNLOCK` の 5 つを、同じオブジェクトのまま書き換える**(⛔ 写しを作らない・`EDGES` は `splice`・`STEPS` は `on` に `frost_peak` を含む id を `delete`)。
⭐ §2-3 の座標では**刻み点は生えない**が、`STEPS` の掃除は書いておく(座標を予備案へ動かしたとき、6 か所目以降で同じ器を写したときに効く)。
⭐ この罠は §8 の変異 `keepsteps`(`STEPS` を消さない)と `keepedge`(`EDGES` を消さない)として装置に内蔵する。`keepsteps` は刻み点が 0 個だと空振りするので、**変異の中で座標を予備案 (1312,224) へずらしてから**撤退する(1 個生えた刻み点が残ることを (4b) が捉える)。

### 2-3. 点の座標 — 会議の (1312,224) から **(1280,288)** へ変えた

札は点の**上**に出る(`world.html` `.worldSign { bottom: calc(100% + 76px) }` = 札の下端はノードから約 −98px・高さ約 47px)。神殿 (1184,416) の札は机上で y ≈ 271〜318。

| 候補 | 神殿からの道の長さ | 刻み点 | 机上の見込み |
|---|---|---|---|
| 会議の (1312,224) | √(128²+192²) = **230.8px** | 1 個 (1248,320) | ⚠ 刻み点の当たり判定(44px 角 = y 298〜342)が**神殿の札の右下に約 28×20px 食い込む**。中心は札の下端から 2px(沼地の札と同じ際どさ)= #105 の「札が刻み点のマーカーを覆う」の再演候補 |
| **採用 (1280,288)** | √(96²+128²) = **160.0px** ちょうど(3:4:5) | **0 個**(`Math.ceil(160/160) = 1` = 分割しない) | 新しい点の当たり判定 (x 1258〜1302) は神殿の札の右端(机上 ≈ 1254)から約 4px 離れる。新しい札は y ≈ 143〜190 = 周りに札も刻み点も無い |

- 絵 `assets/world_region.jpg` を (900,0)-(1536,600) で 1.5 倍に切り出して目視: (1280,288) は**雪の峰の南の裾**(氷河の谷の東)。札は雪の峰の上に乗る。
- 刻み点が 0 個なので、刻み点 10 個は変わらず、停留所(`NODES ∪ STEPS`)が 24 → **25**。`js/road-events.js` の `WAY_TERRAIN` は**触らない**(新しい点は拠点で、街道の出来事・襲撃は拠点では出ない = `isRoadSite`)。

⇒ **項目1 で実ブラウザで測る**(#106 §12-1 の型・`r106/item1/sign/measure_signs.js` を写す): 新しい札 × 神殿の札・× 主人公(`frost_peak` / `temple` / `mine` に立つ)・× **全ノードの停留所の点**(#106 の学び)・1440x900 と 390x844。**390 幅で札が画面の外へ出る px は 0 を条件にする**(会議のノエル。①〜④ は 21〜34px はみ出してユーザー判断待ち)。
⚠ 交わる・はみ出すなら、まず `signDx` を掃引。それでも 0 にならなければ**座標を動かさずに表を §12-1 に貼ってユーザーに上げる**(⛔ 実装窓が座標を勝手に決め直さない)。

### 2-4. 点と道の数を固定値で握っている検証(言い直しの予告)

| 本 | 握っている値 | 本件の後 |
|---|---|---|
| `verify_world_steps.js`(1680〜1701 行あたり) | `nodesFP.length === 14 && edgesFP.length === 14`(既定 + 撤退の段ごとに **6 か所**)+ `sites` の件数 6〜11 | 既定 = **15 / 15**。撤退の段は `retireGiant()` を先頭に足して 7 段目まで |
| `verify_world_map.js` | 札 12 枚(`sites.length === 12` ほか 3 か所)・(2a) 線分の本数 = `EDGES.length` | 札 **13** 枚。(2a) は `EDGES.length` を読むので緑のまま(本数 15) |
| `verify_world_heromark.js` | `EXPECT_SIGNS` / 点線 `<line>` = `EDGES.length` | 札の枚数を言い直す |
| `verify_road_events` (4a) / `verify_world_steps` (1d)(2d)(5c) / `verify_quest_walk` | 地図の sha1(既定 / 撤退 1 段 / … / 撤退全部) | **7 値**(既定 / retireGiant / +retireHag / +retireTomb / +retireCargo / +retireWarren / +retireTower)。⚠ 今回は sha1 の入力に**点と辺が増える** = 既定の値は必ず変わる。前の既定の値は `retireGiant()` 1 段目の後で 1 文字も変えずに当て直す |
| 手順の型 §7 の表の残り(`verify_quest_draw` / `verify_tavern_map` / `verify_quest_visibility` / `verify_lore_check` / `verify_enemy_traits` / `verify_counterspell` / `verify_run_chronicle` ほか) | side 5・SITES 11・ENEMY_TYPES 59・ENEMY_TRAITS 9・HP を引く点 48 | side 6・SITES 12・ENEMY_TYPES **61**・ENEMY_TRAITS **11**・HP を引く点 +2 以上(岩投げ・冷気の息の主人公 / 仲間。手番の内か外かを確かめてから数える)・`MSG_DEFEAT` の参照(息や岩で主人公が倒れる行を足したとき) |

再測定: `grep -n "=== 14\|=== 12\|EXPECT_SIGNS\|EDGES.length" tools/verify_world_*.js tools/verify_quest_walk.js tools/verify_road_events.js`

### 2-5. ⚠ 冬狼の息は今の仕組みでは吐けない — 会議の「`cold` の弾を流用」は崩れた

| 実測 | 出所 |
|---|---|
| 弾の形 `projectile: "cold"` は**青白い稲妻**(`spawnLightningBolt`)。持ち主は霊体の呪文使い 1 体(`spells: ["fireBolt"], projectile: "cold"`)= 呪文の見た目の差し替えで、息ではない | `index.html` の敵の呪文の演出 `projEl === "cold"`・`ENEMY_TYPES` の 1 体 |
| ブレスは `hydraFireBreath()` 1 つだけ。入口は `enemyAttackTurn` の「**単頭ボス**のブレス」(`def.isBoss && !def.multiHead && def.breathDice`)とハイドラの多頭の 2 か所。演出・語り・反射の名前は**全部火** | `index.html` `enemyAttackTurn` / `hydraFireBreath` |

| `hydraFireBreath` / `applyFireBreathToAlly` は検証 3 本が中身を握る(`driver_cast_circle.js` 7 か所・`verify_counterspell.js` 3・`verify_run_chronicle.js` 3) | `grep -c "hydraFireBreath\|applyFireBreathToAlly" tools/*.js` |
| 火に固定されている所 = 演出(`spawnFireballExplosion` / `"fireball-scorch"` / 橙の粒 / 足元の陣 `"fire"`)・半減(`getFireResistMult`)・文言(「火球で」「BURNED」「火炎ブレス」)・年代記 `RunChronicle.fall(a, "火炎ブレス")`・反射 `fireAcid: true` | `hydraFireBreath` の本体 |
| 敵の呪文の範囲攻撃(`ENEMY_SPELLS` の `kind: "aoe"`)は `el` を持つが、**カウンタースペルで消せる**(`counterspellWanted`)・詠唱の陣が出る = 息には使えない | `index.html` `ENEMY_SPELLS` / `counterspellWanted` |
| 冷気の演出の素材 = `spawnFrostFleck`(冷気の武器の粒) | `index.html` |
| 今 `breathDice` を持つ敵は 3 体とも**ボス**(ファラクサス・ハイドラ・キマイラ)= 「ボスでない敵のブレス」の入口を足しても既存の敵は 1 体も通らない | `ENEMY_TYPES` の `breathDice` |

⇒ **ユーザー決定(承認ダイアログ): 冬狼の冷気の息を入れる。** 作り方はこう決める:

1. ⛔ **`hydraFireBreath` / `applyFireBreathToAlly` は 1 バイトも変えない**(検証 3 本が握る・火のブレスの見た目と文言はそのまま)。
2. 新しい関数 **`coldBreath(enemyIdx)`** を `hydraFireBreath` の**写し**として足す。違いは: 演出を青白い粒(`spawnFrostFleck` の色)に・半減は無し(味方の冷気耐性の器は今無い = 倍率 1)・文言「冷気の息」「FROZEN」・年代記 `"冷気の息"`・反射は `fireAcid: false`(スペルターニングリングの扱いは `tryReflectEnemySpell` の既存の判定に任せる)。着弾の形は**ハイドラと同じ 3x3**(SRD は 15ft の円錐だが、敵 → パーティの円錐は今の作りに無い = 円錐にしない)。
3. 入口は `enemyAttackTurn` に**「ボスでない敵の息」の分岐を 1 つ**(条件 `!def.isBoss && def.breathDice && def.breathElement === "cold"`)。既存のボスのブレスの分岐は触らない。
4. **Recharge 5-6** は SRD どおり: 最初は使える。使ったら `breathReady = false`。使えない間は**自分の手番の頭で d6 を 1 回振り 5〜6 で戻る**。使えるときは必ず吐く(着弾の 3x3 にパーティが 1 人も入らないときは噛む)。
5. ⚠ 乱数: d6 と DEX セーヴのダイスは**冬狼の手番の中だけ**で振る = 既存の敵の手番と乱数列は 1 ビットも動かない(§8 §6 の恒等で縛る)。

### 2-6. 解放の鎖と推奨 Lv の隙間

| 依頼 | 推奨 Lv | 解放 |
|---|---|---|
| 本筋: 廃坑 / 森 / 沼地 / 砦 / 神殿 / 竜の巣 | 3 / 4 / 5 / 6 / 8 / 10 | 1 本ずつ前のクリア後 |
| 本筋外: コボルド / 積み荷 / 墓所 / 魔女 / 塔の母 | 2 / 4 / 5 / 6 / 7 | 最初から / 廃坑 / 森 / 沼地 / 砦 |
| **本件: 霜の巨人の砦** | **8** | **神殿の後**(神殿の後に解放される依頼は今 0 本) |

出所: `tavern.html` `scenarios[]` の `recommendedLevel` / `unlockAfter`。報酬の段: 本筋の `clearXp` 300 / 500 / 700 / 1000 / 1200 / 1500、本筋外の `clearGold` 120 / 200 / 250 / 300(`index.html` `SCENARIOS`)。
⭐ `locked: true` で足すので、**開始直後の卓は変わらない**(手順の型 §4 の 3)。変わるのは `cleared` に神殿を含む盤面だけ。

### 2-7. 足す口(全数・`witch-hut` の足跡を今の行番号で数え直した)

`grep -n "witch-hut\|witchHut\|retireHag\|hag=0\|\bgreenHag\b\|lakeside"` を 8 ファイルにかけた結果(2026-11-04・`241c718`):

| 場所 | 何 | 本件 |
|---|---|---|
| `index.html:3751` `ROAD_CHEST_GOLD` | 消えた隠し宝箱のぶんの金貨 | 要: `"frost-hold": 75`(隠し 3 × 25) |
| `index.html:4083` `SCENARIO_TEX` | 床と壁の質感 | 要(無い id は廃坑へ落ちる)。神殿と同じ石の組を当てる |
| `index.html:4723` `NODE_EXTRA_SPAWN_KINDS` | `t["witch-hut"] = { n0: ["search","loot"], n1: ["search"] }` | 要: 同じ形 |
| `index.html:6994` `ROOM_PAINTINGS_DEF` | `n0big` / `n1big` | 要(峠を屋外 `outdoor: true` にするかは項目1 で絵を見て判断・大広間は屋内) |
| `index.html:10765` `ENEMY_TYPES.greenHag` | ボス | 要: `frostGiant` / `winterWolf` |
| `index.html:12132` `SCENARIOS["witch-hut"]` | `clearXp: 700` ほか・`spawns` | 要: `"frost-hold"`(§4) |
| `index.html:16118` `SCENARIO_NARRATIONS` | 開幕の語り | 要 |
| `index.html:19090` `window.__witchHutTV` | 検証シーム | 要: `window.__frostHoldTV` |
| `index.html:30715` `LORE_SKILL_OF` / `:30748` `LORE_CR` | 伝承 | 要: 巨人と冬狼の家系は既存の分岐から / CR `frostGiant: 8` `winterWolf: 3`(SRD に元がある) |
| `index.html:30658` `ENEMY_TRAITS` | 体質 | 要: `frostGiant: { immune: ["cold"] }` / `winterWolf: { immune: ["cold"] }`(SRD の Damage Immunities・前例 `caelum`) |
| `index.html:41563` `buildScenarioRun` | 振り分け 1 行 | 要: `if (scenId === "frost-hold") return buildFrostHoldRun();` |
| `index.html:42947` `buildWitchHutRun` の `p6Node` | 2 ノード | 要: `buildFrostHoldRun()` |
| `tavern.html:3843` `scenarios[]` | 依頼 1 件 | 要(§5) |
| `tavern.html:3907` 撤退 `?hag=0` | | 要: `?giant=0`(§7) |
| `world.html:685` 撤退の読み取り | | 要: `?giant=0` |
| `js/world-map.js` `NODES` / `EDGES` / `SITES` / `UNLOCK` / `retireHag` / 書き出し | | 要(§3)。⚠ `EDGES` を**初めて**触る |
| `js/df-mapdef.js:60` `THEMES` / `:1905` `THEME_DEFAULT_ENEMIES` | | 要 |
| `tools/make_grid_map.py:571` `GRIDS` | 2 行 | 要 |
| `tools/codex1_sprites.json:269` | 台帳 | 要: 2 行 |

### 2-8. SRD の数値(出所 = ボールト `raw/srd/monsters/frost-giant.md` / `winter-wolf.md`)

| | フロスト・ジャイアント(CR8) | 冬狼(CR3) |
|---|---|---|
| AC / HP | 15 / **138**(12d12+60) | 13 / **75**(10d10+20) |
| 攻撃 | 2 回攻撃・大斧 +9・**3d12+6**(届き 10ft) | 噛みつき +6・**2d6+4** |
| 遠距離 | **岩 +9・4d10+6・射程 60/240ft** | **冷気の息 Recharge 5-6・15ft の円錐・DEX DC12・4d8(セーヴで半減)**(§2-5) |
| 体質 | 冷気に完全耐性 | 冷気に完全耐性 |

### 2-9. 素材 4 本(承認後に起草窓が依頼文を起草する)

| 素材 | 依頼文(予定) | 注意 |
|---|---|---|
| 地図 2 枚(雪の峠道 / 氷の砦の大広間) | `codex1/requests/2026-11-04_frost-hold-maps.md`(`codex-map-request` スキル) | 「格子の無い絵 + コードで 64px 丁度の暗線 + `-nogrid`」(#105・#106 で一発合格)。⚠ 雪の床は明るい = 差分で線を直接測る(手順の型 §2 の ★[#104]) |
| フロスト・ジャイアント | `codex1/requests/2026-11-04_frost-giant.md` | 怖い感じに。大きい(`displaySize` は既存の大型ボスの 176〜192 の帯。項目1 で画面上の身長を測って決める) |
| 冬狼 | `codex1/requests/2026-11-04_winter-wolf.md` | ⚠ **白い毛 = 明るい背景だと透過で毛が抜ける** → クロマキーは白以外。`check_alpha_bg_residue.py` |

### 2-10. 岩投げの口

- 敵の弾の形は `arrow` 5 / `fireBolt` 5 / `cold` 1 / `magicMissile` 1。**岩は無い**。
- 弾の描き方は `index.html` の敵の呪文の演出(`projEl === "cold"` の分岐の並び)= 形を 1 種足す口はここ。岩は**キャンバスに灰色の丸を放物線で**(スプライト不要)。
- ボスの特別な行動の入口は**ボスの行動選択の前**(手順の型 §3。写し元 = #104 `inflictWoundsTouch` / #106 `mistPassage`)。

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → `index.html` / `tavern.html` を触るので**鳴る**。書けるプレイヤー向けの要約は実在する(新しい行き先):

```bash
py tools/add_changelog.py "<b>雪山に新しい行き先「霜の巨人の砦」</b> — 地下神殿の奥の雪の峠に、霜の巨人が住みついた。岩を投げる巨人と冬狼に挑め(神殿のクリア後)。"
```

---

## 3. ワールドマップ(`js/world-map.js`)— 点と道を足す

```js
/* NODES の lakeside の後へ */
/* ★[#107] 雪山の頂に新しい拠点 frost_peak「霜の峠」(本筋外の依頼「霜の巨人の砦」)。
 *   ⭐ #82〜#106 と違い、中継点の格上げではなく **点を新しく足した** (空いている中継点は cross_n / farm_n の 2 つだけ = 依頼書 #107 §2-1)。
 *   ⭐ 袋小路 (道は temple からの 1 本だけ) = 既存の点どうしの最短経路は 1 本も変わらない。
 *   ⭐ 座標は temple (1184,416) から 160px ちょうど (96,−128) = 刻み点が生えない (依頼書 #107 §2-3)。
 *   ⭐ 撤退 ?giant=0 は world.html / tavern.html が自ページで読み、retireGiant() で点・道・札・依頼を消す。 */
frost_peak: { kind: "site", x: 1280, y: 288, label: "霜の峠", desc: "地下神殿の谷の奥。雪の峠に霜の巨人の氷の砦" }

/* EDGES の末尾へ (⛔ 既存の行は 1 バイトも変えない) */
["temple", "frost_peak"]   /* ★[#107] 初めて足した道 */

/* SITES / UNLOCK */
"frost-hold": "frost_peak"      /* ★[#107] 本筋外の 12 本目 (神殿の後に解放) */
"frost-hold": "undead-temple"   /* ★[#107] tavern.html の unlockAfter と同じ */
```

```js
/* ★[#107] 撤退 ?giant=0 の器。⚠ 前の 5 つ (中継点へ戻す) と形が違う = 点も道も消す。
 *   ⚠⚠ STEPS は読み込み時に出来ている = 道を消すなら刻み点も消す (依頼書 #107 §2-2)。
 *   ⚠ NODES / EDGES / STEPS / SITES / UNLOCK の**同じオブジェクト**を書き換える (写しを作らない)。 */
function retireGiant() {
  for (var i = EDGES.length - 1; i >= 0; i--) {
    if (EDGES[i][0] === "frost_peak" || EDGES[i][1] === "frost_peak") EDGES.splice(i, 1);
  }
  for (var k in STEPS) {
    if (Object.prototype.hasOwnProperty.call(STEPS, k) && STEPS[k].on.indexOf("frost_peak") >= 0) delete STEPS[k];
  }
  delete NODES.frost_peak;
  delete SITES["frost-hold"];
  delete UNLOCK["frost-hold"];
}
```

- 書き出しは `retireHag: retireHag,` の次の行に `retireGiant: retireGiant, /* ★[#107] 撤退 ?giant=0 の器 */` を足すだけ(⛔ 前後の行は 1 バイトも変えない)。
- 冒頭の「拠点 ちょうど 12 個」の注記を 13 個へ。`STEPS` の注記(10 件・停留所 24 箇所)は「刻み点 10 件のまま・停留所 25 箇所」へ。

## 4. 依頼の本体(`index.html`)

- `SCENARIOS["frost-hold"]`: `title: "霜の巨人の砦"` / `clearXp: 1200`(神殿と同じ)/ `clearGold: 400`(本筋外の礼金 120 → 200 → 250 → 300 の次の段)/ `trapCount: 1` / `trapTypeByNode: { n0: <雪崩>, n1: <氷の床> }`(`TRAP_TYPES` に語りだけ違う行を足す・⛔ `Math.random` を足さない・減らさない・新しいダイスを足さない = 手順の型 §4 の 2)/ `hiddenChestCount: 3`。
- `SCENARIO_NARRATIONS["frost-hold"]`: 開幕 4 行(神殿の谷の奥・雪の峠・岩に潰された隊商・巨人の砦)。
- `buildFrostHoldRun()`: `p6Node` を直接呼ぶ型(`buildWitchHutRun` を写す)。n0「雪の峠道」= 手下オーク(`orcGrunt` / `orcArcher`。数は #106 と同じ帯から始める)/ n1「氷の砦の大広間」= `boss: [.., .., "frostGiant"]` + 冬狼 2 頭。⚠ `density` / `start` / `paint` は全部明示。
- 大広間の語り(n1 に入ったとき 1 回):「山の向こうの赤い竜に、我らの住処は焼かれた。ここは譲らぬ」の趣旨(文言は実装窓・`dm-narration.md` の口調に合わせる)。
- `ENEMY_TYPES.frostGiant`: §2-8 の数値。`attacksPerTurn: 2`・`isBoss: true`・`dmgDice: "3d12"` `dmgBonus: 6` `atkBonus: 9` `ac: 15` `hp: 138` `rockDice: "4d10"` `rockBonus: 6`。`meleeRange` は届き 10ft = 手下より長め(項目1 で絵を見て決める)。⛔ 最初は SRD どおり(ボス補正をしない)。
- `ENEMY_TYPES.winterWolf`: `hp: 75` `ac: 13` `atkBonus: 6` `dmgDice: "2d6"` `dmgBonus: 4` `range: "melee"` `breathDice: "4d8"` `breathDC: 12` `breathBlast: 3` `breathElement: "cold"`。⛔ `isBoss` を付けない・`breathChance` を付けない(使えるときは必ず吐く)。
- **冷気の息 `coldBreath(idx)`**(§2-5 の 1〜5 のとおり)。検証用 probe `window.__coldBreathProbe`(吐いた回数・着弾の中心・巻き込んだ人数・セーヴの成否・ダメージ・再充填の d6)。
- **岩投げ `giantRockThrow(idx)`**(ボスの手番の入口・ボスの行動選択の前):
  - 条件 = `def.rockDice` を持ち、**届く距離(`meleeRange`)に生きた味方が 1 人も居ない**手番。かつ `enemy.rockCooldown` が 0。
  - 狙い = **いちばん遠い**生きた味方(後衛を狙う巨人)。攻撃ロール `d20 + atkBonus` vs AC(既存の命中の式を使う・クリティカルも既存どおり)。当たれば `4d10+6`。
  - 投げたら `rockCooldown = 1`(次の手番は前へ出る)。1 戦闘の回数の上限は**付けない**(SRD どおり何度でも投げる)。
  - 弾の形 `"boulder"` を 1 種足す(灰色の丸が放物線で飛ぶ・着弾で小さな土煙)。
  - 検証用 probe `window.__giantRockProbe`(投げた回数・狙った相手・命中・ダメージ)。⛔ 他の敵には付けない(`rockDice` を持つのは `frostGiant` だけ = 既存の敵の手番と乱数列は 1 ビットも動かない)。
- `ENEMY_TRAITS`: §2-7 の 2 行。

## 5. 依頼の登録(`tavern.html`)

```js
{
  id: "frost-hold",
  place: "霜の峠",            /* ⚠ id の直後に置く (検証ドライバが id → place の並びで配信バイトを読む) */
  side: true,
  title: "霜の巨人の砦",
  difficulty: "★★★★",
  recommendedLevel: 8,        /* 神殿 8 の後・竜の巣 10 の前。⚠ 強さの実測 (依頼書 §8 ⑤) で直してよい */
  reward: "隊商組合の懸賞金",
  client: { name: <隊商の生き残り>, role: "峠を越える隊商の護衛", type: <既存の type から> },
  dialog: <峠で岩に潰された隊商・巨人は何かから逃げてきたようだった>,
  enemies: [
    { name: "巨人に雇われたオークたち", boss: false },
    { name: "冬狼", boss: false },
    { name: "霜の巨人(フロスト・ジャイアント)", boss: true },
  ],
  locked: true,
  unlockAfter: "undead-temple",
},
```

## 6. 地図 2 枚(`codex-map-request` スキル・手順の型 §2)

- n0「雪の峠道」(吹きだまり・凍った岩・崖沿いの細い道)/ n1「氷の砦の大広間」(巨人の玉座・獣の毛皮・大きな火鉢・氷の柱)。
- 64px・「格子の無い絵 + コード格子 + `-nogrid`」。格子は**本命と `-nogrid` の差分で直接測る**(手順の型 §2 ★[#104] / 線幅 1px or 2px = ★[#105])。
- MASK は塔の母の 5 規則。巨人の立つ玉座の前は `.`・火鉢と氷の柱は `#`。⚠ 巨人は大きい = 大広間の通れる幅が巨人の当たり判定に足りるかを `aStar` で確かめる。

---

## 7. 撤退スイッチ

- **`?giant=0`** — `tavern.html` は配列から `frost-hold` を外し、`window.WORLD_MAP.retireGiant()` を呼ぶ。`world.html` も自分で読んで `retireGiant()` を呼ぶ(`?hag=0` の隣 = **`buildNodes()` / `buildSteps()` より前**)。
- ⚠ 判定位置 = 各ページ(`?heromark=0` と同じ「ページ単位で独立」)。ページ遷移は**またがない**(⛔ sessionStorage へ写さない)。`index.html` は判定しない(卓に出なければ入れない)。
- 撤退すると: 点 14・道 14・刻み点 10・札 12・`SITES` 11・`UNLOCK` から `frost-hold` が消える = **#106 完了時の地図そのもの**。

---

## 8. 受入条件 — `tools/verify_frost_hold.js`(新規・port base **10690**)

`tools/verify_witch_hut.js` を写す(配信は内蔵 http・本番は起動時に 1 回読んで凍結・変異はメモリで差し替え・favicon 204)。

### §0 装置
- **(0a)** `__frostHoldTV` が見える・2 ノードが組み上がり敵が 0 体でない(n0 にオーク・n1 に `frostGiant` と `winterWolf` 2)・pageerror 0。⭐ これが無いと全 assert が空振りで永久緑になる。
- **(0b)** 期待の数(点 15・道 15・札 13)を**写経せず**、配信バイトの `NODES` / `EDGES` を数えた値と突き合わせる。

### §1 登録とワールドマップ(2 経路: 同じページの `WORLD_MAP` / world.html の DOM)
- **(1a)** `NODES.frost_peak` が `site`・`EDGES` に `["temple","frost_peak"]` が 1 本・`SITES` / `UNLOCK` が tavern の `scenarios[]` と一致。
- **(1b)** world.html の DOM: `.worldNode` に `frost_peak`・点線 `<line>` が `EDGES.length`(15)本・`data-edge` に `temple`–`frost_peak`。
- **(1c)** 神殿のクリア前は札が出ない / クリア後に出る(`isRevealed`)。開始直後の卓は**変わらない**。
- **(1d)** ⭐ 経路の非退行: 既存の 14 点の全組(14 × 13)で `findPath` / `findWalkPath` の結果が着手前の commit と**同じ**(`?__base=1` で配る)。`findWalkPath("phlan","frost_peak")` は `temple` を通って着く。
- **(1e)** 通り過ぎても入場ダイアログは開かない(`frost_peak` を押すと神殿を通過して `frost_peak` で開く)。
- **(1f)** 本筋 6 本クリアで本筋 null・`frost-hold` は side として卓に出る。

### §2 地図
- `make_grid_map.py --check` 2 枚・本番の `aStar` で入口 → ボスへ通る(巨人の当たり判定で)・罠の数と種類・霧。

### §3 岩投げ
- **(3a)** probe が 1 回以上(届く距離に誰も居ない手番を作って測る)・狙いが**いちばん遠い**味方・命中の式が既存の攻撃ロールと同じ・ダメージが 4d10+6 の範囲(10〜46。クリティカルは既存の倍率)。
- **(3b)** 届く距離に味方が居る手番では投げない(反転)。`rockCooldown` で連投しない。
- **(3c)** `frostGiant` 以外は投げない。
- **(3d)** 冷気の完全耐性: 冷気の呪文のダメージが 0(`resolveElementDefense` 経由)。

### §3b 冷気の息
- **(3e)** probe が 1 回以上・ダメージが 4d8 の範囲(4〜32)・セーヴ成功で半減(切り捨て・最低 1 は既存の作法に合わせる)・DC 12。
- **(3f)** 最初の手番は使える / 使った後は d6 が 5〜6 の手番でだけ戻る(probe の d6 と吐いた手番を突き合わせる)/ 戻っていない手番は噛む。
- **(3g)** 3x3 にパーティが居ないときは吐かない(噛む)。
- **(3h)** ⭐ 火のブレスの非退行: `hydraFireBreath` / `applyFireBreathToAlly` の配信バイトが着手前の commit と**同じ**・ボス 3 体(ファラクサス・ハイドラ・キマイラ)は冷気の息の分岐を通らない。
- **(3i)** カウンタースペルで消されない(冷気の息は呪文ではない)。

### §4 語りと撤退
- **(4a)** 開幕の語り 4 行(`#dmBody` を MutationObserver で拾う = ★[#105])・大広間の語り 1 回。
- **(4b)** `?giant=0`: tavern の配列から外れる / world.html の DOM から点・線・札が消える / **点 14・道 14・刻み点 10 に戻る** / 刻み点マーカーの DOM に `frost_peak` を含む id が無い / pageerror 0。
- **(4c)** 撤退の段の地図の sha1(§2-4 の 7 値)。

### §6 恒等
- 既存シナリオの罠の座標・種類・乱数の呼び出し回数・次の乱数が着手前の commit と同じ。

### `--negative`(変異。担当は**机上で書かず `--mutate` で 1 本ずつ実走して決める**)
`keepsteps`(座標を予備案へずらし、撤退で STEPS を消さない = §2-2)/ `keepedge`(撤退で EDGES を消さない)/ `noedge`(道を足さない)/ `unlockfree`(`locked: false`)/ `rockall`(届く距離でも投げる)/ `rocknear`(いちばん近い味方を狙う)/ `nocooldown` / `nobreath`(冬狼の `breathDice` を外す)/ `alwaysbreath`(再充填の d6 を見ずに毎手番吐く)/ `breathfull`(セーヴ成功でも半減しない)/ `breathboss`(入口の `!def.isBoss` を外す = ボスが冷気の息の分岐へ入る)/ `firebreathedit`(`hydraFireBreath` の文言を 1 字変える = (3h) が赤)/ `nocoldimmune` / `noretire`(`?giant=0` を読まない)/ `shortcut`(`frost_peak` に 2 本目の道 = 経路の非退行 (1d) が赤)。罠E(自分のアンカーが他の `tools/*.js` に出ない)の自己検査を入れる。

### ⑤ 強さ(⛔ assert しない・値を変えない・判断はユーザー)
- 霜の巨人の砦 Lv8・4 人・N=10: クリア率 / 全滅率 / 所要 / 残り HP / 倒れた人数 / **岩投げの回数・命中率・岩で倒れた回数** / **冷気の息の回数・巻き込んだ人数・息で倒れた回数**。
- ⭐ **比較 = 神殿 Lv8・4 人・N=10 を同じ道具で**(会議の決定。#104〜#106 の比較は N=5 だったが今回は同数)。§12 に並べて書く。

### ⛔ 測らないこと
- 巨人・冬狼の HP / 攻撃の値の良し悪し(⑤ はユーザー判断)。
- 岩の弾の見た目の細部(色・放物線の高さ)。

---

## 9. 実機 / 実感

- 神殿の後で札が雪の峰の上に見えるか・390 幅で押せるか(はみ出し 0px)・巨人の大きさが画面で「巨人」に見えるか・岩が後衛へ飛ぶのが分かるか・竜の一言で伏線が伝わるか。

## 10. 項目の割り方(dev-loop 4 項目)

| 項目 | 中身 | 終わりの印 |
|---|---|---|
| 1 着手前の実測 + 素材の取り込み | §2 を測り直す・札の掃引(§2-3)・地図 2 枚の焼き付けと MASK 草案・シート 2 枚の取り込み | §12-1 に実測表・焼き上がり 2 枚・台帳 3 行 |
| 2 本体 | §3〜§7 を全部・changelog 1 行・予告外で赤くなった golden の言い直し | 煙検査 + 予告どおり赤の一覧 |
| 3 受入 | `tools/verify_frost_hold.js`・⑤ 強さ(神殿 Lv8 と並べて) | 素 N/N × 3・`--negative` 全変異 OK |
| 4 母集団の非退行 + 記録 | §2-4 の言い直し(手順の型 §7 の表 + 本件の点・道の数)・全数走査・§12・README の行・**`_TEMPLATE_new_location.md` に「点と道を足す」節**(座標の選び方 = 刻み点を生やさない長さ / 撤退の器の 5 つ / 経路の非退行 (1d))・`CLAUDE.md` の行き先の列挙に #107 | 帰属の緑→赤 0 |

- 全数走査は約 13〜16 時間。`-NotBefore 01:05` で予約・夜(20:00〜24:59)をまたがない。⚠ 走行器の 1 腕の上限は `verify_frost_hold --negative`(項目3 の実測)× 1.3 に合わせる(★[#106])。

## 11. やらないこと

- ⛔ 冷気の息を円錐にする(3x3 のまま・§2-5)/ 味方の冷気耐性の器(装備の `coldResist` 等は今無い)/ 冬狼以外の敵に冷気の息
- ⛔ `hydraFireBreath` / `applyFireBreathToAlly` を共通化・引数化する(1 バイトも変えない・§2-5)
- ⛔ 冬狼の転倒(噛みつきの STR セーヴ)・群れの戦術(有利)
- ⛔ 戦う / 見逃すの 2 択(#106 の形を流用しない)
- ⛔ #103〜#106 の強さの見直し・390 幅の札(#104 / #105 / #106 のはみ出し)・マミーの火の弱点・縁のマゼンタ(ユーザー判断待ちの別件)
- ⛔ `cross_n` / `farm_n` の格上げ・他の拠点の `signDx`
- ⛔ `js/road-events.js`(新しい点は拠点 = 街道の出来事は出ない)
- ⛔ 触らない: `town.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` / `js/npc-crowd.js`・勝利判定・`defeatEnemy()`・`runEncounter` の手番ループ・`checkTrapTrigger()`
- `実装依頼書/README.md` の #107 行は**承認時に起草窓が足す**(並走窓なし)。

## 12. 記録欄

### 12-0. 起草で会議から変えた点(承認時に確認)
- 点の座標 (1312,224) → **(1280,288)**(§2-3。刻み点を生やさず、神殿の札と離す)
- 冬狼は**噛みつきだけ**(§2-5。冷気の息は今の仕組みに無い)→ ⚠ **承認時にユーザーが「冷気の息も入れる」を選択**。§1 の表・§2-5・§2-8・§4・§8 §3b・変異・⑤・§11 を改稿した(火のブレスは写して冷気の関数を新設・元は 1 バイトも変えない)

### 12-1〜12-4. 実装窓の記録(項目1〜4)
