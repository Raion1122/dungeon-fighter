# #107 新しい行き先「霜の巨人の砦」— 地下神殿の奥、雪の峠に霜の巨人(推奨 Lv8・神殿の後・本筋の外・ワールドマップに点と道を初めて足す)

- **起草**: 2026-11-04(起草窓) / **ステータス**: **承認済**(2026-11-04 ユーザー承認・承認ダイアログで「承認してノートに記載」。同じダイアログで **冬狼の冷気の息も入れる** = §2-5 を改稿)
- **着手**: ✅ **着手できる**(2026-11-04 素材 4 本とも納品・起草窓が受け取りの検算と目視まで済ませた = §2-9 の表の下の「納品」。⚠ 巨人・冬狼は **v3 のフォルダ**を使う)
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

**納品(2026-11-04・起草窓の受け取り検算)**:

| 素材 | 使うもの | 受け取り側の実測 |
|---|---|---|
| 地図 2 枚 | `codex1/assets/maps/frost-pass-v1.png` / `frost-hall-v1.png`(+ 各 `-nogrid`) | 本命と `-nogrid` の差分 99246 画素 = x, y ∈ {64k−1, 64k} の **2px 線**(中心 64k−0.5)+ 左隣 64k−2 のにじみ 2439 画素だけ。線の明度 95.7 / 90.1 < 格子無し 160.0 / 150.0 = 暗い線 ⇒ 位相 0・周期 64・24x16 の見込み。⚠ #105 の 2px 線(中心 64k+0.5)の**鏡写し** = 手順の型 §2 の「64k / 64k+1 を線の上として数える」は **64k−1 / 64k** に読み替える(64k−2 のにじみも線の側)。3 指標は項目1 の焼き付けで測る。目視◎(峠道は西端〜門まで広い・潰れた荷車と岩・焚き火の跡・崖と凍った滝 / 大広間は門・真俯瞰の玉座と毛皮・青い火鉢 2・広い床)。⚠ 足跡は獣の足跡に見える・氷の柱は壁際(実害なし) |
| 霜の巨人 | `codex1/assets/frost-giant/frost-giant-walk-attack-right-6-v3-aligned/`(**v3**) | 768x720 x 12・接地線 spread 0・最大高 1.011・walk 幅 0.668・attack 幅 0.866・連結成分 各 1・縁の緑み 0・本体の端の縦の連続 ≤ 11px・md5 12/12。v1 = attack 03〜05、v2 = attack 02 の斧の刃がシートの切り分けで切れていた → v3 で全部入った |
| 冬狼 | `codex1/assets/winter-wolf/winter-wolf-walk-attack-right-6-v3-aligned/`(**v3**) | 768x720 x 12・接地線 spread 0・walk 幅 1.854・attack 幅 1.954・高さ中央値の差 −3.08%・黒い塊 0・縁の青緑 1〜8・walk / attack の色の差 0.5 / 0.1・md5 12/12。v1 = walk の腰に黒い塊、v2 = walk と attack が別の個体 → v3 で 12 コマを同じ 1 頭で作り直した |

⚠ 取り込み(台帳 `tools/codex1_sprites.json` の 2 行・`pack_codex1_sprites.py`・`check_sprite_doubling.py` / `check_alpha_bg_residue.py`・本番の床の上での目視)は項目1 の仕事。キャンバスが 768x720(ハグ等の 576x480 と違う)なので、`char_ratio` は手下の物差しで測り直す。

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
- ⛔ `cross_n` / `farm_n` の格上げ・他の拠点の `signDx`(★ 項目4 で神殿 `temple` だけはユーザー決定 (b) 2026-11-05 により `signDx: -12` へ = §12-4 (2))
- ⛔ `js/road-events.js`(新しい点は拠点 = 街道の出来事は出ない)
- ⛔ 触らない: `town.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` / `js/npc-crowd.js`・勝利判定・`defeatEnemy()`・`runEncounter` の手番ループ・`checkTrapTrigger()`
- `実装依頼書/README.md` の #107 行は**承認時に起草窓が足す**(並走窓なし)。

## 12. 記録欄

### 12-0. 起草で会議から変えた点(承認時に確認)
- 点の座標 (1312,224) → **(1280,288)**(§2-3。刻み点を生やさず、神殿の札と離す)
- 冬狼は**噛みつきだけ**(§2-5。冷気の息は今の仕組みに無い)→ ⚠ **承認時にユーザーが「冷気の息も入れる」を選択**。§1 の表・§2-5・§2-8・§4・§8 §3b・変異・⑤・§11 を改稿した(火のブレスは写して冷気の関数を新設・元は 1 バイトも変えない)

### 12-1〜12-4. 実装窓の記録(項目1〜4)

### 12-1. 項目1 — 着手前の実測 + 素材の取り込み(2026-11-04・基準 HEAD `0298eca`)

⭐ 本番 3 ファイル(`index.html` / `tavern.html` / `audio.js`)と `js/*.js` / `world.html` は**無変更**(changelog 不要)。足したのは `tools/make_grid_map.py`(GRIDS 2 行)/ `tools/codex1_sprites.json`(2 行)/ `assets/` 4 枚(焼き上がり 2 + シート 2)/ 本節。作業の置き場 = `~/.claude/dev-loop/r107/item1/`(`map/` `sign/` `sprite/`)。
⚠ 終わりの印の「台帳 3 行」は**4 行**(GRIDS 2 + codex1_sprites 2)。

#### (1) §2 の測り直し

| 主張 | 実測(`0298eca`) |
|---|---|
| 基準 HEAD | 依頼書の `241c718` ではなく **`0298eca`**。差は `4b867b2`(起草)と `0298eca`(素材の受け取り)の 2 本で、`git diff --quiet 241c718 0298eca -- index.html tavern.html js world.html tools scripts audio.js` = **差 0** ⇒ 行番号は全部そのまま |
| §2-7 の行番号 | **全部一致**: `ROAD_CHEST_GOLD` の witch-hut 行 3751(器は 3740)/ `SCENARIO_TEX` 4083(器 3878)/ `NODE_EXTRA_SPAWN_KINDS` 4723(器 4673)/ `ROOM_PAINTINGS_DEF` 6994(器 5633)/ `greenHag` 10765 / `SCENARIOS["witch-hut"]` 12132 / `SCENARIO_NARRATIONS` 16118(器 16052)/ `__witchHutTV` 19090 / `LORE_SKILL_OF` 30715(器 30695)/ `LORE_CR` 30748(器 30737)/ `ENEMY_TRAITS` 30658 / 振り分け 41563 / `buildWitchHutRun` 42940(`p6Node` 42947)/ tavern 3843・3907 / world.html 685 / df-mapdef 60・1905 / make_grid_map 571 / codex1_sprites 269 |
| §2-1 中継点 | `kind: "way"` は `cross_n` (480,480) と `farm_n` (608,224) の 2 つだけ・点 14・道 14 ✅ |
| §2-2 `STEPS` | `js/world-map.js:319` の IIFE で読み込み時に 1 回 ✅。`world.html:1135` `var STEPS = WM.STEPS \|\| {};`(同じオブジェクトの別名)→ `buildSteps()` 1137。注記 1184 ✅ |
| §2-3 刻み点 | temple→(1280,288) = **160.000px**・`Math.ceil(160/160)=1` = 刻み点 0 ✅ / 会議案 (1312,224) = 230.76px = 刻み点 1 ✅。`.worldSign { bottom: calc(100% + 76px) }` ✅ |
| §2-4 固定値 | 依頼書の表どおり + **表に無い握り 2 つ**: `verify_world_heromark.js:470` `EXPECT_NODES = 14` / `verify_world_map.js:1892` `m.cover.nodeCount !== 14`。`verify_road_events.js` 1537〜1563 は 6 段とも `stepsFP.length === 10` も握る(刻み点 0 なので 10 のまま)。`verify_quest_walk.js:1472` `ids.length === 14` ⇒ 項目4 の言い直し名簿に足す |
| §2-5 火のブレス | `hydraFireBreath` 36576 / `applyFireBreathToAlly` 36735・握る検証 = driver_cast_circle 7 / verify_counterspell 3 / verify_run_chronicle 3 ✅。`breathDice` を持つのはファラクサス 11077・ハイドラ 11521・キマイラ 11663 の 3 体(全部 `isBoss`)✅。単頭ボスの入口 38170 / `projEl === "cold"` 13060 / `spawnFrostFleck` 9042 / `counterspellWanted` 36487 / `ENEMY_SPELLS` 36764 |
| §2-6 推奨 Lv | tavern `scenarios[]` = 本筋 3/4/5/6/8/10・本筋外 7/2/4/5/6 ✅ |
| §2-8 SRD | ボールト `raw/srd/monsters/frost-giant.md` = Huge・AC 15・HP 138 (12d12+60)・大斧 +9 3d12+6 届き 10ft・岩 +9 4d10+6 60/240ft・冷気に完全耐性・CR 8 ✅ / `winter-wolf.md` = Large・AC 13・HP 75・噛みつき +6 2d6+4(DC14 STR で転倒 = §11 でやらない)・Cold Breath Recharge 5-6 15ft 円錐 DEX DC12 4d8・冷気に完全耐性・CR 3 ✅ |
| §2-10 弾の形 | `arrow` 5 / `fireBolt` 5 / `cold` 1 / `magicMissile` 1 ✅ |
| §2-11 | `scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ✅ |

#### (2) 札の掃引(§2-3)— ⭐ 推奨 `signDx: -112`

道具 = `r107/item1/sign/measure_signs.js`(port 10691。frost_peak・道・SITES・UNLOCK を足した world-map.js をメモリで配る・本番は触らない。#106 の型に「全停留所の点の `elementFromPoint`」「霜の峠の点が他の札に奪われていないか」「霜の峠の拠点マーカー × 神殿の札」を足した)。世界 = cleared 本筋 5 本(神殿まで = 札 13 枚)。読み取り: 点 15・道 15・刻み点 10・点線 `<line>` 15・pageerror 0(全腕)。

| signDx | 1440: 札 × 他の札 / 停留所 25 点 / 刻み点 / 拠点マーカー / 主人公 | 390: 霜の峠の点が画面内の立ち位置で 札がはみ出す px(右 / 左) |
|---|---|---|
| 0 | **全部 0**(26 の立ち位置すべて)。札の 5 点は全部札自身 | mine / lakeside / lakeside__mine@1 = **右 66.2** ⚠ / temple・dragon・frost_peak・lakeside__dragon@1 = 0 |
| −32 / −64 / −80 | 0 | 右 42 / 17 / 5 |
| −84 / −86 | 0 | 右 2 / 0.5 |
| **−88〜−136** | 0 | **0 / 0**(境目 = 右は −88・左は −136) |
| −144 / −152 / −160 / −192 | 0 | 左 5.1〜5.6 / 11.2〜11.7 / 17〜18 / 42(frost_peak・dragon に立つと左へ出る) |

- ⭐ **推奨 −112**(帯 −88〜−136 の中央・両側 24 原寸 px の余裕)。−112 で 26 の立ち位置 × 2 幅を全部測り直し: 札 × 他の札 0・停留所 25 点はどれも札に奪われない(`elementFromPoint`)・刻み点マーカー / 拠点マーカーとの交わり 0・主人公が霜の峠の札を隠す 0%・霜の峠の点そのものは自分(`self`)・pageerror 0。本筋外も全部クリアした世界でも同じ(札 13 枚)。
- 霜の峠の拠点マーカー × 神殿の札 = 交わり 0・x の隙間 **2.4px**(1440)/ 7.2px(390)(依頼書の机上 4px に対し実測 2.4px)。
- 札の寸法: 1440 = 208.8x38.2px / 390 = 180.2x34px。−112 の 1440 で札は x 940.6〜1149.4(点 x 1136 の左上に寄る・廃坑の札の 14px 上)。
- ⚠ **霜の峠の点が画面の外にある立ち位置**(390 幅で fort / lake_n__lakeside@1・@2 / village_s__fort@1 / fort__lakeside@1)では、遠くの札の端が画面に入って右へ 29.5〜151.7px 出る(−112)。同じ立ち位置で**既存の神殿の札も 11.2〜133.4px 出る** = 遠くの札の性質で、どの signDx でも 0 にならない。⇒ 条件「390 幅ではみ出し 0」は**霜の峠の点が画面内に入る立ち位置**で判定した(#106 の title 起点 436.6 = 遠くの札と同じ扱い)。この読み方でよいかは §9 で確認してほしい。
- 新しい作用(札ではない): 主人公が frost_peak に立つと**神殿の札の 11.0%(1440)/ 9.2%(390)を隠す**(signDx に依らない。#106 の lakeside 札 18.2% と同じ種類)。
- 画面: `r107/item1/sign/shot_dx0_390_mine.png`(右へ 66px 切れる)/ `shot_dx-112_390_mine.png` / `shot_dx-112_1440_temple.png`。表の元 = `all0.json` / `sweep390.json` / `fine390.json` / `all112.json` / `allclear112.json`。

#### (3) 地図 2 枚

| 指標 | 雪の峠道 `frost-pass` → n0 | 氷の砦の大広間 `frost-hall` → n1 |
|---|---|---|
| 本命と `-nogrid` の差分 | 99246 画素・x / y ∈ {64k−1, 64k} の外 **2479**(全部 64k−2 のにじみ。64k−2 も線の側に数えると外 **0**) | 99246 / 2479 / 0(同じ) |
| 線 | **2px 幅・中心 64k−0.5**(#105 の鏡写し)。全行が変わる列 = x 0, 63, 64, …, 1471, 1472, 1534, 1535 / 行 y 0, 63, 64, …, 960, 1022, 1023 | 同じ |
| 線の明度(格子あり / 無し・{64k−1, 64k} の全画素) | 99.4 / 165.2 = 暗い線 | 93.5 / 154.7 |
| ⇒ 台帳 | **(0,0) / 64.000 / 24x16 / tile 64**(恒等の焼き) | 同じ |
| `--fit --fit-around 64` の一次解(貼らない) | (63.05, 63.15) / (64.020, 64.025) / **23x15** = 外周を落とす(西の入口 col 0 と東の門 col 23 が切れる) | (63.05, 63.30) / (64.020, 64.015) / 23x15 |
| 雪・目地を拾っていない証拠(`-nogrid` の fit) | score 2.50 / 1.78・周期 65.96 / 63.98(格子あり 54.72 / 55.42) | 2.79 / 2.99・周期 64.14 / 60.39(格子あり 50.68 / 51.11) |
| 焼き上がり | `assets/room_frost-hold_n0_map.jpg` **1536x1024 = 24x16**(0.48 MB) | `assets/room_frost-hold_n1_map.jpg` 1536x1024(0.52 MB) |
| `--check`(drift ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%) | 縦 1.12 / 0.75 / 98.1% **OK**・横 0.50 / 0.75 / 98.5% **OK** | ⚠⚠ **縦 1.12 / 2.25 / 97.0% = NG**・横 0.86 / 0.75 / 98.4% OK |
| 独立の物差し `check_grid_alignment.py` | 縦 97.1% / 横 94.8% OK | 縦 **97.2%** / 横 96.2% **OK**(1/4 ずらしの負のコントロール 3.8% / 3.5% = NG) |

- ⚠⚠⚠ **大広間の縦の NG は測定器の同点の扱い**(絵も台帳も正しい)。2px 線は TILE 固定の櫛で 2 つの台地(ph 62.5〜63.4 → 列 64k−1 / ph 63.5〜64.4 → 列 64k)を作り、`verify()` は「ph 0 から掃いて最初の最大」を採る。大広間の縦だけ列 64k−1 の平均 49.146 が列 64k の 48.721 を **0.4** 上回る(峠と横線は逆)ので、台地の左端 ph 62.5 = dev −1.5px(= 2.25 world-px)が選ばれる。線の本当の中心は 64k−0.5(dev −0.5px = 0.75 world-px)。#105 の 2px 線(64k / 64k+1)は台地が ph 0 から始まるので原理的にこの誤報が出ない = **鏡写しの線だけが踏む**。
  - `verify_codex_map_skill` (3a) は着手前から赤(stag-tavern)。今回 **SHA は 28 件全部一致**・赤の中身が「検算 NG: stag-tavern,frost-hall」に増えた(色は赤のまま)。
  - ⛔ 閾値は緩めていない・6 数値も動かしていない(負の位相は PIL が受け付けない `box offset can't be negative`・+0.5 は本当にずれる方向へ動かして指標だけ通す = やらない)。
  - **ユーザー判断**: (a) stag-tavern と同じ「構造的な誤報」として受け入れる(GRIDS の注記に根拠を書いた)/ (b) `verify()` の同点の扱いを「|dev| の小さい方」に直す(⚠ stag-tavern の位相も動く = 既存の赤が変わる)/ (c) codex1 へ線を {64k, 64k+1} にした v2 を発注する。
- 行数 16 = 偶数 ⇒ midR = 絵ローカル **row 7**(峠 = 西の端 → 東の門 / 大広間 = 西の門)。写像は #106 と同じ絵ローカル + (16, 6)・入場 global (18,13) = 絵ローカル (2,7)・n0 の出口 (39,13) = 絵ローカル (23,7)(門の通路)。
- **`outdoor` の判断**: 峠 n0 = **`outdoor: true`**(昼の雪の峠・空の下。前例 = 塔の母 n0「丘の道」/ コボルド n0「丘」/ 沼の参道)。大広間 n1 = 屋内(付けない)。⛔ `FIELD_THEMES` に入れない。⚠ 暗幕の撮影(#106 の `fog_shot.js`)はしていない = 絵を見て決めた。項目2 で n0 を屋外で入れた後に目視する。

**MASK 草案(⭐ 唯一の正。`#` = 塞ぐ・`.` = 歩ける。外周 1 マスは `.` = sealRing の仕事)** — 道具 `r107/item1/map/masks.py`(sealRing を模した 4 近傍 BFS・重ね絵 `overlay_pass.png` / `overlay_hall.png` で目視済み)

```
n0big 雪の峠道 (24x16)
"........................",  // 0  外周 (sealRing)
".######################.",  // 1  北の岩・氷の塊
".######################.",  // 2  岩・氷・潰れた荷車と木箱 (col 12-16)
".######...#######..####.",  // 3  獣の足跡の雪 col 7-9 (平置き) / 荷車と岩 col 10-16 / 雪 col 17-18 / 岩・氷柱 col 19-22
".#...........##......##.",  // 4  毛皮 col 2-3・焚き火の跡 col 4 (平置き = 塞がない) / 荷車の車輪 col 13-14 / 東の雪 col 15-20 / col 21-22 砦の壁
".#.....###...........##.",  // 5  岩 col 7-8・小石と氷 col 9 / col 21-22 門扉 (開いた扉板)
"........#...............",  // 6  岩 col 8 / ⭐ 門の通路 col 21-23
"........................",  // 7  ⭐ 入口の行 = 西の端 → 東の門 (23,7) まで端から端まで開ける (midR)
"........................",  // 8  門の通路 col 21-23
".#.......##.###......##.",  // 9  岩 col 9-10 / 氷の塊と岩 col 12-14 / col 21-22 門扉
".##.....###.####.....##.",  // 10 氷の塊 col 1-2 / 岩 col 8-10 / 氷と岩 col 12-15
".##########.#####...###.",  // 11 崖の縁 (col 11 と col 17-19 だけ雪)
".######################.",  // 12 崖・凍った滝
".######################.",  // 13
".######################.",  // 14
"........................",  // 15 外周
n1big 氷の砦の大広間 (24x16)
"........................",  // 0  外周
".######################.",  // 1  北の壁際: 氷の柱・樽・卓 (骨と角杯)・毛皮の寝床・骨の山・武器掛け・大斧
".######################.",  // 2
".#..................###.",  // 3  col 1 西の壁 / 石畳 col 2-19 / ⭐ 北の青い火鉢 col 20-21 (上に立たせない)・col 22 東の壁際
".#..................###.",  // 4
".#..................###.",  // 5  col 1 = 内開きの門扉
".#..................###.",  // 6  ⭐ 玉座 col 20-22 (rows 6-9)。玉座の前 col 19 は '.'
"....................###.",  // 7  ⭐ 入口の行 (西の門 col 0 → 石畳 → 玉座で止まる)
"....................###.",  // 8  col 1 = 門の敷居
".#..................###.",  // 9  col 1 = 南の門扉
".#..................###.",  // 10 ⭐ 南の青い火鉢 col 20-21 (rows 10-11)
".#..................###.",  // 11
".#...................##.",  // 12 石畳 col 2-20
".######################.",  // 13 南の壁際: 氷の柱・毛皮の寝床 (平置きだが瓦礫に囲まれる)・樽・瓦礫
".######################.",  // 14
"........................",  // 15 外周
```

- 峠: 歩ける 136 / 到達 134 / 孤立 = (11,0)(11,15) だけ(外周の中点 = 内側が塞がっている)。東の門 (23,7)・(22,7) に届く。
- 大広間: 歩ける 187 / 到達 184 / 孤立 = (11,0)(11,15)(23,7)(東の中点 = 玉座の裏の行き止まり。ボス部屋なので出口は使わない)。玉座の前 (19,6)(19,7)(19,8) に届く。
- ⭐ **巨人の当たり判定で通れるか**: 本番の `aStar` は**中心 1 マス**(`isTileWall`)しか見ない(体の footprint `isBodyClear` は戦車の 3 経路だけ = `index.html` 19897 の注記)⇒ 草案の `.` はどれも巨人の中心として通れる。念のため `unitBodyTiles` の式を displaySize 184・下の実寸比で写すと巨人の体は **縦 1x3 マス**(例 (18,7) → (18,6)(18,7)(18,8))で、体がどこも `#` に触れない立ち位置は入口 (3,7) から **144 マス**・rows 4〜11 全部・玉座の前 (19,7) に届く。
- 敵の置き場の案(出発点・絵ローカル → global = +(16,6)。⚠ 決めるのは項目2): n0 オーク (14,6)(15,8)(16,7)(13,8) = 入場 (2,7) から 11.05〜14.00 / n1 巨人 (18,7)(入場から **16.00**)・冬狼 (16,5)(16,9)(14.14・巨人との最大 2.83 = 1 つの戦闘)。全部 `.`。

#### (4) シート 2 枚(取り込み済み)

| 項目 | 霜の巨人 `frostGiant` | 冬狼 `winterWolf` |
|---|---|---|
| 素材 | codex1 `frost-giant/frost-giant-walk-attack-right-6-v3-aligned/`(⭐ v3・768x720 x 12) | `winter-wolf/winter-wolf-walk-attack-right-6-v3-aligned/`(⭐ v3・768x720 x 12) |
| 素材の bbox(walk) | 高さ 491〜501・幅 242〜331 / attack 幅 277〜429(斧) | 高さ 129〜130・幅 240〜241(横長 1.85)/ attack 121〜132 x 239〜254 |
| 台帳 | `tools/codex1_sprites.json` の `frostGiant` 行(glob で walk / attack を分離・`scale_from: walk`・`attack_scale: auto` = 1.0267) | `winterWolf` 行(同・auto = 1.0130) |
| セル | **192**(大型ボス = garrock / stoneGolem / shadowBeast と同じ) | **192**(大型の四足獣 = direBear / shadowBeast と同じ) |
| `char_ratio` | **0.76**。0.80 は attack の斧が右へ 3px はみ出す・0.78 は 1px・0.77 は右端ちょうど (right=192) ⇒ 0.76 = fit left=29 right=190 top=33 クリップ無し | **0.47**(横幅で決まる)。0.52 は右へ 8px・0.48 は 1px ⇒ 0.47 = fit left=11 right=190 top=90 |
| 出力 | `assets/frostGiant_anim.png` 1152x960(md5 `7b3e3943…`)。台帳から別所へ再パックして md5 一致 = 再現性 OK | `assets/winterWolf_anim.png` 1152x960(md5 `fd71ec50…`)。再パック一致 |
| 分身 | `check_sprite_doubling.py` = 候補 1 コマ(attack col 1 `clusters=2 2nd=23`)⇒ 8 近傍で数え直すと 1 塊 6525 画素・3 倍で目視 = 頭上に振りかぶった斧の刃(`giant_r3c1_x3.png`)= **分身ではない**。col 2-3 の `wide-pose` WARN は振り抜いた斧 | **clean** |
| 背景残り | `check_alpha_bg_residue.py` = 本シート 6 セル疑い 0・全体 643 セル疑い 0 | 同じ(疑い 0) |
| 目視 | 本番の大広間の床の上で 2 倍(`r107/item1/sprite/lineup_hall.png` / `lineup_hall_zoom.png`)= 縁の残り・切れ端なし。青白い肌・白い髭・毛皮の肩当て・大斧が読める | 同じ床の上 = 白い毛は灰の陰影で床から分かれる・毛の抜けなし。牙を剥いた横向き |
| 体高 / 体長(walk・セル 192 中) | 146 / 96 | 90 / 167 |
| 体の実寸比(row2・alpha>0・shadowBeast の定義値を同じ式で再現できることを確かめた) | `bodyRatioX 0.505, bodyRatioY 0.766, bodyOffX 0.240, bodyOffY 0.182` | `bodyRatioX 0.922, bodyRatioY 0.474, bodyOffX 0.057, bodyOffY 0.474` |
| ⭐ `displaySize` 案 | **184**(画面上 **140px** = 主人公 58 の 2.4 倍・orcGrunt 49 の 2.9 倍・shadowBeast 132 / goblinChariot 126 より一回り上 = 帯 176〜192 の中央。176 = 134px / 192 = 146px)。当たり判定 `getEnemyHitbox` = inset 33 → 118px 角 | **130**(画面上 高さ 61px・体長 113px = 主人公と同じ背丈で横に長い・minotaur 87 / direBear 104 より小さい)。当たり判定 = inset 23 → 84px 角 |

- 画面上の身長の物差し = (walk H_max / セル) × displaySize(`pack_codex1_sprites.py` の docstring)。既存の値は `r107/item1/sprite/screen_h.py` で測った: orcGrunt 49.2 / orcArcher 48.6 / garrock 70.0 / stoneGolem 79.8 / minotaur 86.7 / greenHag 80.3 / mummy 80.2 / shadowBeast 132.0 / goblinChariot 125.6 / direBear 104.3 / 主人公(warrior_walk)58。
- `meleeRange` の材料(⛔ 決めるのは項目2): 巨人の attack の斧の先 = 体の中心から 93/192 × 184 ≈ **89px**(画面上)。既存の大型の帯 = garrock 200 / stoneGolem 210 / hydra 210 / chimera 210 / minotaur 190 / orcGrunt 160。SRD の届き 10ft(2 マス = 192px)+ 体の半幅。`attackDuration` / `attackHitFrame` は attack の伸び(幅)= col 2-3 が最大(stoneGolem / hydra と同じ帯の 40 / 20 が候補)。

### 12-2. 項目2 — 本体(2026-11-04・基準 HEAD `6c2680d`)

⭐ §3〜§7 を全部入れた(`index.html` / `tavern.html` / `world.html` / `js/world-map.js` / `js/df-mapdef.js` / `js/changelog.js`)。作業の置き場 = `~/.claude/dev-loop/r107/item2/`(煙検査 `smoke_frost.js`・撮影 `shots/`・golden のログ `golden_logs/`・走らせ方 `run_golden.sh` / `run_rerun.sh`・申し送り `item2_notes.md`)。
⭐ 既存のコードは 1 行も消していない(`git diff` の `-` 行 = `js/world-map.js` の注記 2 行だけ)。`hydraFireBreath` / `applyFireBreathToAlly` は 1 バイトも変えていない(`driver_cast_circle` 56/56)。

#### (1) 実装した口・決めた値・依頼書との差

| 口 | 中身 |
|---|---|
| `js/world-map.js` | `NODES.frost_peak` (1280,288)「霜の峠」`signDx: -112` / `EDGES` 末尾 `["temple","frost_peak"]` / `SITES` / `UNLOCK` / `retireGiant()`(EDGES は splice・STEPS は `on` に frost_peak を含む id を delete・NODES / SITES / UNLOCK は delete = 同じオブジェクト)/ 書き出し 1 行 / 冒頭の注記「拠点 13 個・点 15・道 15」・STEPS の注記「刻み点 10・停留所 25」 |
| ⚠ 前の行を変えない作法 | `lakeside` / `["lakeside","dragon"]` / SITES・UNLOCK の `witch-hut` の行は末尾にカンマが無い = 足した行は**先頭のカンマ** `, frost_peak: …` で続けた(既存の行は 1 バイトも変えない・変異アンカーが行まるごとを握るため) |
| `world.html` / `tavern.html` | `?giant=0`(world は `?hag=0` の隣 = `buildNodes` / `buildSteps` より前・tavern は配列から外して `retireGiant()`)。⛔ sessionStorage へ写さない |
| `tavern.html` `scenarios[]` | `frost-hold`(id の直後に place「霜の峠」・side・★★★★・推奨 Lv8・`locked:true`・`unlockAfter: "undead-temple"` の行にコメント = 竜の巣の行と一意)・依頼人 ブラン(峠を越える隊商の護衛・`soldier`) |
| `js/df-mapdef.js` | `THEMES` に `frost-hold`(⛔ FIELD_THEMES に入れない)/ `THEME_DEFAULT_ENEMIES` = mob orcGrunt・orcArcher・winterWolf / boss frostGiant。`LINT_PAINTING_ASPECTS` は不要(24x16 は在庫にある・`driver_graph_p6` 250/250) |
| `index.html` 表 | `ROAD_CHEST_GOLD` 75 / `SCENARIO_TEX` = 神殿と同じ石の組 / `NODE_EXTRA_SPAWN_KINDS` n0 search・loot / n1 search / `ROOM_PAINTINGS_DEF["frost-hold"]` n0big(**outdoor: true**)・n1big(屋内)・MASK = §12-1 (3) を逐語 / `SCENARIOS["frost-hold"]`(clearXp 1200・clearGold 400・trapCount 1・`trapTypeByNode {n0: "avalanche", n1: "iceFloor"}`・hiddenChestCount 3・`?graph=0` 用 spawns)/ `TRAP_TYPES.avalanche` / `iceFloor`(語りだけ違う行・乱数なし)/ `SCENARIO_NARRATIONS` 4 行(dm-narration.md の「君たちは…」の口調)/ `LORE_SKILL_OF.frostGiant = "history"`(Giant = 氏族と掟を持つ巨人 = 既存の人型の分岐・冬狼は Monstrosity = 自然 = 載せない)/ `LORE_CR` frostGiant 8・winterWolf 3 / `ENEMY_TRAITS` 両方 `immune: ["cold"]` / `detectEnemyFamily` winterWolf → beast(既存の語り)/ 振り分け 1 行 / `buildFrostHoldRun()` |
| `buildFrostHoldRun` | rect `[6,16,21,39]`・start (18,13)・density 0・出口 (39,13)。n0 = オーク兵 (29,14)(30,12)・オーク弓兵 (31,14)(32,13)(§12-1 (3) の 4 か所)/ n1 = 巨人 (34,13)・冬狼 (32,11)(32,15) |
| `ENEMY_TYPES.frostGiant` | HP 138(⛔ ボス補正なし)/ AC 15 / +9 / 3d12+6 × `attacksPerTurn 2` / **critMult 3**(大斧 = 3.5 の greataxe)/ `displaySize 184` / bodyRatio = §12-1 (4) / **meleeRange 210** / hitRange 300 / attack 40・20・70(stoneGolem の帯)/ speed 0.6 / `maxSummons 0` / `rockDice "4d10"` `rockBonus 6` / deathLine(竜の伏線の 2 本目)/ xp 1200 |
| `ENEMY_TYPES.winterWolf` | HP 75 / AC 13 / +6 / 2d6+4 / `displaySize 130` / bodyRatio = §12-1 (4) / meleeRange 170 / hitRange 250 / 28・14・50 / speed 0.9 / `breathDice "4d8"` `breathDC 12` `breathBlast 3` `breathElement "cold"` / xp 350。⛔ isBoss / breathChance / packTactics なし |
| 冷気の息 `coldBreath(idx)` | `hydraFireBreath` の写し(§2-5 の 1〜5)。入口 = `enemyAttackTurn` のハイドラの分岐の直後に `!def.isBoss && def.breathDice && def.breathElement === "cold"` の 1 分岐。Recharge = `enemy.__coldBreathSpent`(最初は使える・使えない間は手番の頭で `rollDiceDD(1,6)`・5〜6 で戻りその手番に吐ける)。演出 = 青白い粒(吸い込み・噴射・3x3 に氷の粒)・半減なし(倍率 1)・「冷気の息」「FROZEN」・年代記 `"冷気の息"`・反射 `fireAcid: false`。仲間は `applyColdBreathToAlly`(`applyFireBreathToAlly` の写し・文言と年代記だけ違う) |
| ⚠ 依頼書に無い判断 1 | **3x3 の中心** = 狙い (`pickEnemyTarget`) のタイル。ただし狼の中心タイルから Chebyshev 2 より遠ければ 2 マスまで寄せる(`COLD_BREATH_REACH = 2` = 3x3 の遠い縁が 3 マス = 15ft)。寄せた 3x3 にパーティが 0 人なら吐かずに噛む(再充填は使わない)。⇒ §2-5 の 4「3x3 に 1 人も入らないときは噛む」が意味を持つ(ハイドラの中心の決め方そのままだと狙いが必ず 3x3 に入る) |
| 岩投げ `giantRockThrow(idx)` | 入口 = 霧渡りの直後・ボスの行動選択の前。`rockCooldown > 0` なら 1 減らして普通の行動 / 届く距離に誰か居れば普通の行動 / それ以外は**いちばん遠い**隊員へ。命中 = 既存の敵の攻撃と同じ式(d20 + atkBonus・激怒 +2・煙幕のペナルティ・1 はファンブル・critRange で脅威 → 確認の d20 → ダイスとボーナスを critMult 倍)。命中で 4d10+6。投げたら `rockCooldown = 1`。弾 = `spawnBoulderProjectile`(灰色の丸が放物線・着弾の土煙は固定の角度 = 乱数なし)。頭は `applyEnemySpellDamage({kind:"leader"}, …, "巨人の岩")`・仲間は霧渡りと同じ手順(年代記 `"巨人の岩"`) |
| ⚠ 依頼書に無い判断 2 | **「届く距離」** = 噛撃の射程チェック(`resolveOneBite`)と**同じ式** `tileChebyshev(巨人, 隊員) ≤ getRange(def.range).tiles`(melee = 1)。§4 の「`meleeRange`」は px の値で、探索中のリアルタイム攻撃モーションの間合い(`moveEnemies`)= 手番の戦闘の届く距離ではない。届かない手番に岩を投げ、届く手番に噛む(殴れない手番を岩で埋める)が成り立つのはこの式 |
| 大広間の語り | `tryFrostHallNarration`(400ms tick・1 回だけ)。ボスノードで `nodeBusy` / 語り / 選択 / 判定が無く、`#dmMessage` が出ていない(到着・ボス部屋の囁きを上書きしない)ときに「玉座の巨人が、低く唸った——『山の向こうの赤い竜に、我らの住処は焼かれた。逃げ延びた先が、ここだ。ここは譲らぬ』」。⛔ Math.random なし・⛔ 2 択なし |
| `srdEnemyUsesFire` に 1 行 | `if (def.breathElement === "cold") return false;` を**足した**(既存の行は不変)。無いと冬狼の盤面でポーションオブファイアレジスタンスを飲む。breathDice を持つ既存の 3 体は全部炎 = 結果は不変(`verify_plaza_srd` 27/27) |
| ⚠ 既知の癖(記録のみ) | スペルターニングリングがあると冷気の息は冬狼へ跳ね返り、**冷気の完全耐性を通らない**(`tryReflectEnemySpell` は炎のときだけ体質を判定する既存の作り)。§2-5 の 2 のとおり既存の判定に任せた |
| 検証シーム | `window.__frostHoldTV`(ENEMY_TYPES 4 種・buildFrostHoldRun・coldBreath・giantRockThrow・giantRockReachable(idx)・coldBreathCenter(idx)・TRAP_TYPES()・trapTypeForNode()・traps()・nodeId()・hall()・scenario())/ `window.__giantRockProbe`(site rock / skip)/ `window.__coldBreathProbe`(site recharge / breath / bite)/ `window.__frostHallProbe` / `window.buildFrostHoldRun` / `coldBreath` / `giantRockThrow`。形は `r107/item2/item2_notes.md` |
| changelog | `py tools/add_changelog.py "<b>雪山に新しい行き先「霜の巨人の砦」</b> — …(神殿のクリア後)。"`(§2-11 の文面のまま) |

#### (2) 煙検査(`smoke_frost.js`)

| 腕 | 結果 | 中身 |
|---|---|---|
| A 酒場(port 10693) | 7/7 | 依頼(side・locked・神殿の後・Lv8・霜の峠・★★★★)/ 同じページの WORLD_MAP = 点 15・道 15・刻み点 10・frost_peak (1280,288 signDx −112)/ 開始直後と本筋 4 本では出ない / 本筋 5 本で竜の巣と同時に解放 / `?giant=0` で消え 点 14・道 14・刻み点 10 / 件数 ON = OFF + 1 |
| B 世界(同) | 6/6 | 神殿の前は点と線だけ・札なし / 神殿の後: `#worldNode_frost_peak`・点線 15 本・`temple__frost_peak`・札「霜の峠」1 枚・刻み点 10 / `findWalkPath` は temple を通る / 霜の峠を押すと神殿を**通過して**霜の峠で「〈霜の峠〉へ入りますか?」→ index の frost-hold (n0 start / n1 boss) / `world.html?giant=0` = 点・線・札・frost_peak を含む刻み点の DOM が全部無い・点 14・道 14・刻み点 10・線 14 |
| C 素(port 10694) | 8/8 | n0 = 絵 24x16・outdoor・オーク兵 2 + 弓兵 2(壁の上に居ない)・罠 avalanche 1 / n1 = 屋内・巨人 1 + 冬狼 2・罠 iceFloor 1 / 大広間の語り 1 回(戦闘の前)/ 岩 1 回(いちばん遠い魔法使い 960px・13+9 = 22 vs AC 12・28 ダメージ)→ 次の手番 cooldown → その次は届く距離に居て skip / 冷気の息 2 回(DC 12・2 人ずつ・セーヴ成功 17→8・失敗 17 / 25)・3x3 が空で噛んだ手番 1・再充填の d6 = 2,3,3,3…(戻らない手番は噛む)/ **全滅**(105 秒・Lv8・4 人)/ pageerror 0 |
| C 巨人 HP 20(port 10695) | 9/9 | 同じ + **クリア**(113 秒)・金貨 475 = 礼金 400 + 隠し 75・クリア XP 1200・表は 400 / 1200 のまま |

- 画面で目視(`shots/`): 雪の峠道の絵と隊列(C_n0_start)/ 大広間に入った直後(C_n1_enter)/ 冷気の息の DM と「冬狼の冷気の息: 2体に着弾 (1体セーヴ半減)」「霜の巨人が大岩を持ち上げた! イレーナ めがけて投げつける!」のログ・白い冬狼と大斧の巨人が床の上で読める(C_rock)/ 世界の札「霜の峠」が雪の峰の上(B_world)。
- ⚠ ⑤ の材料(⛔ 判断しない): 素の 1 回は全滅。強さは項目3 の N=10(神殿 Lv8 と並べる)で測る。

#### (3) 名指し golden 32 本の再走(14:51〜15:40・昼)

- 緑のまま: driver_graph_p6 250/250・kobold_warren 21/21・plaza_map 43/43・road_ambush 41/41・road_boon 20/20・tower_mother 19/19・fort_fold・temple_fold・**plaza_srd 27/27**(srdEnemyUsesFire)・**driver_cast_circle 56/56**(火のブレス)。
- 着手前から赤(範囲外): verify_codex_map_skill (3a)(stag-tavern + frost-hall = §12-1 (3) のユーザー決定どおり)/ driver_mapeditor_painting §1 1d2。
- **項目2 で言い直した(予告どおり赤・前の値は 1 文字も変えず撤退の段へ移した)**:

| 本 | 節 | 言い直し |
|---|---|---|
| verify_lost_cargo / verify_silent_tomb / verify_witch_hut | (4c) | 撤退の 1 段目に `retireGiant()` を足して 6 段。`SHA_AFTER_GIANT = '63f3bce7696bf14a'` = #106 完了時の既定の地図(verify_world_steps の WANT_ON を 1 文字も変えず当て直し)。2〜6 段目は今の固定値のまま。今の既定 `644bf9dac129dffb` はそのどれとも違う |
| verify_dragon_fold | (7b) | NODE_EXTRA_SPAWN_KINDS のキー集合に `frost-hold`・両腕で同じ中身 |
| verify_swamp_novice | (4b) | ROOM_PAINTINGS_DEF の例外表に `frost-hold`(着手前 cdaaf91 に無いキー) |

- **予告どおり赤のまま(項目4 で言い直す)** — 中身はすべて件数・枚数・sha1・表の行・HP を引く点。挙動は煙検査と各ログの実測で正しい:

| 本 | 赤い節 | 中身 |
|---|---|---|
| verify_quest_draw | (0b)(1d) | side 5→6 / cleared 6 本の解放済みに frost-hold |
| verify_quest_visibility | (0b)(0c)(3b)(3d)(5c) | side 6・札 12→13・NODES/EDGES 14→15・SITES 11→12(3d は 13 枚とも自分に当たる) |
| verify_quest_walk | (0z)(2z)(2a)(2b)(2c)(2d)(3d)(3e)(4b)(5a) | 11→12 組・未解放 9→10・`ids.length === 14`→15(2c は 15 ノードとも経路あり・frost_peak 8 手)・札・sha1 |
| verify_road_events | (4a) | 地図の sha1(撤退の段 +1) |
| verify_tavern_map | (6a)(6b)(7b) | scenarios 11→12 |
| verify_world_heromark | (1e)(2a)(2b)(3b)(4b)(4c) | ノード 14→15・札 12→13・照合の組 168→195(交差 0・奪った点 0)/ `EXPECT_NODES = 14`(§12-1 で名簿に足した) |
| verify_world_map | (7b-data)(7b-dom)(7d)(7e)(7f) | 札 12→13(7d は 13 枚とも自分に当たる)/ (7f) は母集団のガード `札=13/12 ノード=15/14` で止まっている(下の ⚠⚠) |
| verify_world_steps | (1d)(2d)(5c) | sha1 の段 +1・札 13 |
| driver_mapeditor_painting | §1 1a / 1a2 / §3 3e | テーマ 11→12・n0big/n1big・optgroup |
| verify_lore_check | (0b)(0c)(0d)(1h) | ENEMY_TYPES 61・技能あり +1(frostGiant history)・CR の表 +2(frost-giant / winter-wolf の slug)・(1h) は frostGiant の札 `CR8` がドライバの表に無い = 表に行を足す |
| verify_party_four | (0a) | scenarios 12 件 |
| verify_enemy_traits | (0b)(0c) | 表のキー 9→11・SRD の表に frostGiant / winterWolf(冷気の完全耐性) |
| verify_counterspell (4c) / verify_run_chronicle (0c) | 各 1 | HP を引く点 48→**51**(+3 = 冷気の息の仲間 `a.hp -=` / 頭 `hp -=` / 岩の仲間 `ally.hp -=`。3 つとも敵の手番の内)。岩の頭は既存の `applyEnemySpellDamage` = 点は増えない |
| driver_cleanup_phase1 | (D4) | `MSG_DEFEAT_*` の参照 17→**21**(冷気の息の仲間 1・頭の三項式 2・岩の仲間 1) |

- ⚠⚠ **項目4 の言い直しで判断が要る見込み 1 件(予告外・ユーザー判断)**: verify_world_map **(7f)**「主人公が札を隠さない(札の面積の 10% 以上は重ならない)」。今は母集団のガードで止まっているが、札 13 枚へ言い直すと **主人公が frost_peak に立つと神殿の札を 11.0%(1440)/ 9.2%(390)隠す**(§12-1 (2) の実測・signDx に依らない = 神殿の札の位置の問題)ので 1440 で上限 10% を超える見込み。⛔ 神殿の signDx は動かさない(§11)・⛔ 点の座標は動かさない(§2-3)。#106 の前例 = ユーザー判断 (a) で `COVER_EXCEPT temple->lakeside 0.20`。⇒ 同じ形の例外(`frost_peak->temple` の組だけ上限を上げる)にするかはユーザー判断。札の中心は 13 枚とも押せる(7d)= 押せない欠陥ではない。

#### (4) 言い直した 5 本と揺れの単独再走(15:40〜16:03)

- verify_lost_cargo **22/22**・verify_silent_tomb **24/24**・verify_witch_hut **29/29**・verify_dragon_fold **35/35**・verify_swamp_novice **34/34**(どれも exit 0)。
- verify_tower_mother_b は単独で **22/22**(1 回目の赤は #106 項目2 と同じ揺れ = 本件の帰属ではない)。
- ⚠ 前の行き先の受入の `--negative` は回していない(項目4 の全数走査で回る。撤退の段を 1 段足しただけ = 変異の担当は変わらない見込み)。

### 12-3. 項目3 — 受入 `tools/verify_frost_hold.js` + ⑤ 強さ(2026-11-04・基準 HEAD `5cfdf10`)

⭐ 本番ファイル(`index.html` / `tavern.html` / `world.html` / `js/*`)は**1 バイトも触っていない**(changelog 不要)。足したのは `tools/verify_frost_hold.js`(新規)と本節だけ。作業の置き場 = `~/.claude/dev-loop/r107/item3/`(素のログ `final_plain_{1,2,3}.log`・負 `negative_final.log`・手回し `mut/*.log`・⑤ の道具 `probe_frost_clear.js` とデータ `frost_lv8.tsv` / `temple_lv8.tsv` / `detail_*`・要約 `summ5.py`)。

#### (1) 判定の一覧(27 節・port **10690**・変異 **10691〜10705**・次の新規ドライバ base = **10706**)

写し元 = `tools/verify_witch_hut.js`(配信は内蔵 http・5 ファイルを起動時に凍結・変異はメモリで差し替え・favicon 204・`?__base=1` で着手前 `0298eca` のバイト)。⭐ 今回は `?__base=1` で **`js/world-map.js` も**配る((1d) の経路の比較)。点・道・札の数は**配信バイトの `js/world-map.js` を node の vm で読んだ値**と突き合わせる(⛔ 15 / 15 / 13 を写経しない)。撤退後の数は `0298eca` の `js/world-map.js` を同じ vm で読んだ値(14 / 14 / 10)。

| 節 | 中身 | 素の実測(`final_plain_1.log`) |
|---|---|---|
| (0a) | `__frostHoldTV`(4 型・岩・息)/ `buildFrostHoldRun` / `coldBreath` / `giantRockThrow` / `giantRockReachable` / `coldBreathCenter` / probe 3 本・2 ノード・台帳と実体(n0 オーク 4・n1 巨人 1 + 冬狼 2) | ✓ |
| (0b) | 点・道・拠点 = vm の 15 / 15 / 13 = tavern の WORLD_MAP = world.html の WORLD_MAP / DOM(点 15・点線 15・全部クリアの札 13)・`0298eca` より 1 つずつ多い | ✓ |
| (0c) | 全ページで pageerror 0(起動 38 回)・段の例外 0 | ✓ |
| (1a) | `frost_peak` が拠点「霜の峠」(配信バイトの id → place)・道は `temple__frost_peak` の 1 本だけ(袋小路)・SITES / UNLOCK = scenarios(tavern と world.html) | ✓ |
| (1b) | world.html の DOM: 拠点の点・点線 = EDGES.length・`data-edge="temple__frost_peak"` 1 本・刻み点 = `0298eca` と同じ 10(frost_peak の刻み点 0) | ✓ |
| (1c) | cleared=[] / 本筋 4 本の解放済み = `?giant=0` と同じ・本筋 4 本の world.html は点だけ(札なし・`isRevealed` 偽)/ 本筋 5 本で札が出て解放済み = `?giant=0` + frost-hold | ✓ |
| (1d) | ⭐ `0298eca` の `js/world-map.js` と同じページに並べ、既存 14 点の全組 **182 組**の `findPath` / `findWalkPath` が同じ・`findWalkPath("phlan","frost_peak")` は `… → mine → temple → frost_peak` | ✓ diff 0 / 0 |
| (1e) | 受注 = 霜の巨人の砦で phlan から frost_peak を押して歩く: 13 停留所(temple を踏む)で入場が開かず、frost_peak で「〈霜の峠〉へ入りますか?」1 回(約 10 秒) | ✓ |
| (1f) | 本筋 6 本で frontier null・frost-hold は side の解放済み・推奨 Lv8 | ✓ |
| (2a) | n0 = `make_grid_map.py --check` 縦横 OK / n1 = 横 OK + 縦は `--check` か `check_grid_alignment.py` の縦(⚠ 下の言い直し) | ✓(n1 縦 = --check NG・alignment 97.2% OK) |
| (2b) | 本番の `aStar`: n0 入口 → 出口の手前 19 手・オーク 4 体へ 11〜13 手 / n1 入口 → 巨人・冬狼へ 16 手・敵のタイルは全部歩ける・巨人の体 `unitBodyTiles` = (34,12)(34,13)(34,14) は全部歩ける | ✓ |
| (2c) | 罠 n0 = 1 (`avalanche`)・n1 = 1 (`iceFloor`)・踏むと dmText(頭・仲間・湧いた罠)・第 2 引数が優先 | ✓ |
| (2d) | n0big `outdoor: true`(屋外の開放 1 部屋以上)/ n1big 屋内(開放 0・探索済み < 絵の範囲)・どちらも isCustom | ✓ |
| (3a) | 岩: 型の値(4d10・+6・+9・critMult 3)/ ① 届かない盤面で d20 = 12 / 2 / 1 / 20+19 / 20+1 — 狙い = いちばん遠い隊員(自前の距離)・AC = その隊員・d20+9・確認の d20 は脅威で命中のときだけ・4d10+6(クリティカルは 12 個 + 18)・その隊員の HP だけが減る / ② 戦闘で岩 1 回以上・狙いは dists の最遠 | ✓ |
| (3b) | ① 巨人が頭の隣: 投げない(skip reach・d20 0 回・HP 不変)・投げた後は `rockCooldown = 1` / ② 戦闘の巨人 4 手番 = 岩 → skip cooldown → skip reach → skip reach | ✓ |
| (3c) | `rockDice` を持つ型 = frostGiant だけ・冬狼の手番(① 6・② 7)と写したボスの手番で岩の probe 0 | ✓ |
| (3d) | `resolveElementDefense` 冷気 20 → 0(immune)・炎 20 → 20(巨人・冬狼) | ✓ |
| (3e) | 冷気の息: 型の値(4d8・DC 12・3x3・cold・ボスでない)/ ① d20 = 2 / 19 — 3x3(中心は冬狼から 2 マス以内)の中の隊員全員(自前で数える = 3 人)に 1 回ずつ・成功で `max(1, floor(raw/2))`・HP がちょうど dmg 減り外の 1 人は減らない・使用済みになる / ② 戦闘の息 4 回も同じ式 | ✓ |
| (3f) | Recharge 5-6: ① 本番の `enemyAttackTurn` を 6 手番(1d6 だけ 2,4,5,6,3 に差し替え)= `breath` / `recharge:2:no,bite:spent` / `recharge:4:no,bite:spent` / `recharge:5:ready,breath` / `recharge:6:ready,breath` / `recharge:3:no,bite:spent` / ② 戦闘の冬狼 2 頭・7 手番が同じ状態機械に乗る | ✓ |
| (3g) | 冬狼が隊から 10 マス: 吐かない(bite empty・中心は寄せた 2 マス `clamped`・d20 0 回・使用済みにならない・HP 不変) | ✓ |
| (3h) | ⭐ `hydraFireBreath`(7471 字)/ `applyFireBreathToAlly`(1008 字)のソースが `0298eca` と同じ・breathDice を持つボス = chimera / hydra / pharaxus(breathElement なし)・冷気 = winterWolf だけ・① 巨人の def を写して breathDice / breathElement "cold" を持たせても冷気の分岐を通らない(probe 0・`__wolfTurn` なし・火のブレス 0)・② 戦闘の巨人の手番で冷気 0 | ✓ |
| (3i) | ① の息 2 回の間に `tryCounterEnemySpell` / `counterspellWanted` / `findCounterspeller` が 0 回(`isCounterspellOn()` = true の盤面)・着弾・反射なし | ✓ |
| (4a) | 開幕の語り 4 行が `#dmBody` に出る・大広間の語り = n1 入場で 0 → **約 20.7 秒後に 1 回**(到着の語りが消えるのを待つ作り)・赤い竜の一言・2.5 秒待っても / 戦闘の後も 1 回・既存 11 シナリオの罠の語りは `0298eca` と同じ | ✓ |
| (4b) | `?giant=0`: tavern の配列・SITES・UNLOCK から消え 点 14・道 14・刻み点 10(= `0298eca`)・刻み点の id に frost_peak なし / world.html の DOM から点・線・札が消え刻み点マーカーにも無い・解放済み ON − 1 | ✓ |
| (4c) | 撤退 6 段の sha1 = 既定 `644bf9dac129dffb` → `63f3bce7696bf14a` → `3dd5550782057025` → `44b1de14f8b2c9d0` → `3918d569e7f3f7db` → `647e71f6b2956389` → `876c5f6336f96811` | ✓ |
| (6a) | 既存 11 シナリオで同じ種の `spawnTraps` の罠・乱数の呼び出し回数・次の乱数が `0298eca` と同じ | ✓ |
| (6b) | 触らない約束の 10 関数(`pickBossAction` / `tryReflectEnemySpell` / `tryCounterEnemySpell` / `counterspellWanted` / `resolveElementDefense` / `hagMistPassage` / `checkDungeonClear` / `defeatEnemy` / `runEncounter` / `checkTrapTrigger`)のソースが `0298eca` と同じ | ✓ |

**依頼書 §8 からの言い直し**(ドライバの冒頭にも書いた):
- pageerror 0 は (0c) に分けた(§8 の (0a) に含まれていた)。(6b) を足した。
- ⚠ **(2a)**: 大広間の縦の `--check` は項目1 の構造的な誤報(§12-1 (3)・ユーザー判断 (a)/(b)/(c) 待ち)。⇒ n1 の縦は「`--check` が OK か、独立の物差し `check_grid_alignment.py` の縦が OK」で縛った(判断が (b)/(c) で決着して `--check` が OK になっても緑のまま)。⛔ 閾値は緩めていない。⚠ `check_grid_alignment.py` は cp932 の端末だと最後の `⭐` の行で `UnicodeEncodeError` = exit 1 になる(ドライバは `PYTHONIOENCODING=utf-8` で呼ぶ・道具は直していない)。
- (2d) の「霧」= n0 は屋外の開放あり・n1 は暗幕が効く(項目2 の `outdoor` の判断のとおり)。
- (3h) の「ボス 3 体は冷気の分岐を通らない」は、今の 3 体が breathElement を持たない(静的)うえに、**巨人の def を一時的に写して冷気の息を持たせても**入口の `!def.isBoss` で弾かれることで縛った(変異 `breathboss` はこれでしか捕まらない = 今のデータでは誰も通らない分岐)。
- 岩・息の観測は 3 経路: ① `?diag=1` のページで n1 の敵を inactive にして語りを待ち、`dialogPaused` でループを止めて直接呼ぶ(d20 / 1d6 だけを呼び出しの間だけ差し替え・隊列は (22,13) ほかへ置き直す)/ ② 同じページで本番の `runEncounter`(頭と仲間の手番は何もしない・HP 999・巨人の 3 マス左から開戦)/ ③ 静的(型の値・ソース)。

#### (2) 変異ごとの担当(`--mutate` で 1 本ずつ実走して決めた = `mut/*.log`)

| 変異 | 中身 | 必ず赤(実走) | 依頼書の予想 |
|---|---|---|---|
| `keepsteps` | 座標を予備案 (1312,224) へ + 撤退で STEPS を消さない(§2-2) | (1b)(1d)(4b)(4c) | (4b) |
| `keepedge` | 撤退で EDGES を消さない | (4b)(4c) | (4b) |
| `noedge` | 道を足さない(点だけ) | (0b)(1a)(1b)(1d)(1e)(4c) | (1a)(1b) |
| `unlockfree` | `locked: false`(後に書いたキーが勝つ) | (1a)(1c) | (1c) |
| `rockall` | 届く距離でも投げる | (3b) | (3b) |
| `rocknear` | いちばん近い隊員を狙う | (3a) | (3a) |
| `nocooldown` | 投げても `rockCooldown` を立てない | (3b) | (3b) |
| `nobreath` | 冬狼の `breathDice` を外す | (3e)(3f)(3h) | (3e) |
| `alwaysbreath` | 吐いても使用済みにしない | (3e)(3f) | (3f) |
| `breathfull` | セーヴ成功でも半減しない(仲間と頭の 2 行) | (3e) | (3e) |
| `breathboss` | 入口の `!def.isBoss` を外す | (3h) | (3h) |
| `firebreathedit` | `hydraFireBreath` の文言を 1 字(「火炎」→「火焔」) | (3h) | (3h) |
| `nocoldimmune` | 巨人の冷気の完全耐性を外す | (3d) | (3d) |
| `noretire` | `?giant=0` を読まない(tavern / world.html) | (1c)(4b) | (4b) |
| `shortcut` | frost_peak に 2 本目の道(→ dragon。vm の実測で既存の最短経路 2 組が変わる先) | (0b)(1a)(1b)(1d)(4c) | (1d) |

- 確率で赤(NEG_MAYBE)= 15 本とも **なし**(①の直接呼び・静的照合で決まる節が担当・② の戦闘の観測は「1 回以上」と規則の照合だけ)。
- 予想との差の理由: `keepsteps` は座標を動かすと刻み点が 1 個生える = 刻み点の数 (1b)・歩きの最後の 2 手 (1d)・既定の sha1 (4c) も変わる。`noedge` / `shortcut` は道の数・点線・経路・sha1 がまとめて動く。`unlockfree` は配信バイトの locked と UNLOCK の食い違い (1a) が先に捕まえる。⚠ **`nobreath`**: `coldBreath` は `def.breathDice || "4d8"` で吐く作り = 直接呼びは breathDice が無くても吐く ⇒ 1 回目の実走では (3e) が緑だった(`mut/nobreath.log` = (3f)(3h) だけ)。(3e) に**冬狼の型の値の静的な照合**(4d8・DC 12・3x3・cold)を足して捕まえた(`mut/nobreath2.log`)。`alwaysbreath` は直接呼びの「使用済みになる」(3e) も赤。`noretire` は「ON = OFF + 1」の (1c) も赤。
- 罠E の自己検査: 起動時に 17 個のアンカーが他の `tools/*.js` に出ないことを確かめる(素で毎回通る)。注入行は全部 `__MUTHIT__` を持つ(撤退の器・火のブレスは素の流れで実行されない場所なので、load で走る行に印だけの 2 本目を足した)。`breathfull` の対象行は 2 回出る = 変異の定義に `n: 2` を持たせ、原本でちょうど 2 件を検算する。

#### (3) 終わりの印

- 素 3 回連続(最終版のドライバ・`--verbose`): `final_plain_1.log` **27/27 PASSED   FAILED 0   PENDING 0**(144 秒・exit 0)/ `final_plain_2.log` **27/27**(148 秒・exit 0)/ `final_plain_3.log` **27/27**(145 秒・exit 0)。その前の試走 `plain_try1.log` も 27/27(148 秒)。
- `--negative`(`negative_final.log`・単独・直列): `[素・基準] 27/27 PASSED   FAILED 0   PENDING 0` → `負のコントロール 15 / 15 が検出成功` → `[vet] --negative OK: 15 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行`(**2325 秒 = 38.8 分**・exit 0)。15 本とも担当は手回しの集合と同じ(担当外の赤 0)。

#### (4) ⑤ 強さ(⛔ assert しない・値は変えていない・判断はユーザー)

道具 = `item3/probe_frost_clear.js`(`r106/item3/probe_hag_clear.js` の写し。酒場で本番の出発 → index で決着まで 1 秒ごと・autoplay 15。数えるのは `giantRockThrow` / `coldBreath` を包んだ前後の生死と probe の増分)。Lv8(xp 28000)・4 人(主人公 = 戦士 + 酒場の仲間 3 人は抽選)。cleared = その依頼に初めて挑む状態(霜の巨人の砦 = 本筋 5 本・神殿 = 本筋 4 本)。⭐ **同じ道具・同じ N=10**(2 本を別ポートで並走)。

| | 霜の巨人の砦 Lv8・N=10 | 比較: 神殿 Lv8・N=10 |
|---|---|---|
| クリア / 敗北 | **0 / 10** | **9 / 1** |
| 全滅(全員が倒れた) | 0 / 10(敗北 10 回とも**主人公が倒れて終わり**・仲間は残る) | 0 / 10(敗北 1 回は主人公が倒れて終わり) |
| 所要(平均・最小〜最大) | **102 秒**(92〜123)・大広間に入るのは 59〜90 秒(平均 68)= 入ってから約 34 秒で決着 | **144 秒**(102〜173)・クリア回 141 秒 |
| 終わりの主人公の HP | 0 / 100 × 10 | クリア回 69・11・17・100・14・31・41・3・64 / 100・敗北回 0 |
| 終わりの仲間の HP | 66/90,29/46,46/46 ・ 58/58,73/73,18/38 ・ 67/96,46/46,15/34 ・ 82/82,8/52,**0/34✝** ・ 65/65,46/46,34/46 ・ **0/86✝**,8/58,9/38 ・ 100/100,82/82,21/42 ・ 74/74,73/73,27/38 ・ 57/96,82/82,42/42 ・ 74/74,57/57,21/46 | 10 回とも全員生存 |
| 倒れた人数 | 計 **12**(主人公 10・仲間 2 = 魔法使い 1(岩)・ドワーフ 1(岩でも息でもない)) | 計 **1**(敗北回の主人公) |
| ボスの残り HP | 霜の巨人 **96〜138 / 138**(平均 124.8・無傷 4 回) | リッチは 9 回討伐・敗北回は残り 15 |
| ボスの手番 | 巨人 3〜8(平均 4.3)・冬狼 5〜8(平均 6.6) | 3〜10 |
| **岩投げ** | **11 回**(1 戦闘 1 回・1 回だけ 2 回)・狙いは 11 回とも仲間(後衛)・**命中 8 / 11 = 73%**・ダメージ 19〜39(平均 28.5)・**岩で倒れた 1**(魔法使い 34 HP に 39) | — |
| **冷気の息** | **22 回**(1 戦闘 1〜5 回・平均 2.2)・**巻き込んだ延べ 28 人**(1 回 1〜3 人・平均 1.27)・セーヴ成功 14 / 28・ダメージ 5〜21・**息で倒れた 2**(どちらも主人公) | — |
| 主人公の倒れ方 | 息 2 / 岩 0 / **それ以外(巨人の大斧 3d12+6 × 2・冬狼の噛みつき)8** | — |
| 罠 | 発見 n0 8 / 10・n1 9 / 10・踏んだ 3 回(n0 の雪崩・1〜3 点) | 踏んだ 5 回(2〜5 点) |

⇒ **神殿 Lv8 は 9 / 10 で勝てる隊が、霜の巨人の砦では 10 回とも負けた**(項目2 の素の 1 回の全滅と同じ形)。負け方は 1 つで、大広間に入ってから約 34 秒(巨人の手番 3〜8)で**前衛の主人公(HP 100)が倒れ**、巨人の HP はほぼ減っていない(平均 124.8 / 138)。岩投げは後衛へ飛ぶが倒したのは 1 回だけ・冷気の息は主人公を 2 回倒した。数字が指すのは岩と息より「巨人の近接(2 回攻撃・3d12+6・critMult 3)と HP 138・AC 15」の方。どう直すか(推奨 Lv・巨人の HP / 攻撃回数・冬狼の数・ボス補正なしの方針)は**ユーザー判断**(⛔ 値は変えていない)。

#### (5) 所要と項目4 への申し送り

- 素 1 本 = **約 144〜148 秒**(起動 38 ページ・(1e) の歩き約 10 秒・大広間の語り待ち約 21 秒・戦闘約 30 秒・(6a) 23 ページ)。
- `--negative`(素の基準 + 変異 15 本・直列・単独)= **2325 秒(38.8 分)** ⇒ ⭐ **項目4 の走行器の 1 腕の上限 = その × 1.3 = **約 3023 秒(50.4 分)****。
- 揺れ・罠(ドライバ側・本番の欠陥ではない):
  - 大広間の語りは到着の語り (`#dmMessage`) が消えるのを待つので、入場から約 20.7 秒かかる(待ちの上限 45 秒)。それまで敵を inactive にして戦闘を始めさせない。
  - n0 の敵は最初の観測の直後に inactive にする(n0 で戦闘が始まると「落ち着き」を待てない)。
  - `coldBreath` の直接呼びは `breathDice` が無くても既定値の 4d8 で吐く(変異 `nobreath` は型の値の静的照合で捕まえる)。
  - 変異 `noedge` は frost_peak へ道が無い = 歩きの腕は `findWalkPath` が null になった時点で打ち切る(300 秒待たない)。
- 既存の golden: 本項では 1 本も触っていない(予告どおり赤の言い直しと verify_world_map (7f) の `COVER_EXCEPT` は項目4)。

#### (6) ⑤ 強さの見直し(2026-11-04〜05・項目3b / 3c / 3d)

⚠⚠ **§8 ⑤ と §12-3 (4) の「⛔ 最初は SRD どおり・値を変えない」は、2026-11-05 のユーザー判断で上書きした**(下の X3 を本番に入れる)。推奨 Lv は 8 のまま。

**① 推奨 Lv を上げる案(項目3b・値は SRD のまま・`item3b/table5b.md`)**: 主人公 Lv9 / Lv10 でも霜の巨人の砦は **0 / 10・0 / 10**(神殿 Lv9 は 8 / 10)。仲間の Lv は `assignCompanionLevels` の帯 `qGetTier(推奨 Lv)` で決まり、推奨 Lv 5〜10 はすべて [5,8] = 推奨 Lv を 9 / 10 に書き換えても仲間は 5〜8 のまま。⇒ 推奨 Lv では勝てる依頼にならない。

**② 巨人と冬狼を弱める案(項目3c・測定中だけページのメモリ / 配信バイトを差し替え・本番ファイルは無傷・Lv8・4 人・N=10)**: 道具 = `item3c/probe_frost_variant.js`(`--giant <JSON>` / `--wolf <JSON>` / `--onewolf 1`)。

| 案 | 中身(SRD からの差) | クリア / 10 |
|---|---|---|
| SRD(項目3) | 大斧 2 回・HP 138・3d12+6・+9・×3・冬狼 2 頭 | 0 |
| A | 大斧 1 回(attacksPerTurn 1) | 1 |
| A+C | A + HP 104 | 2 |
| A+D | A + atkBonus 6・critMult 2 | 1 |
| A+C+D | A + HP 104 + atkBonus 6・critMult 2 | 2 |
| W1 | A+C + 冬狼 1 頭 | 3 |
| W2 | A+C + 冬狼 HP 56・+4(2 頭) | 2 |
| W3 | A+C + 冬狼 1 頭・HP 56・+4 | 4 |
| X1 | A+C + 大斧 2d12+6・critMult 2 | 4 |
| X2 | A+C + 大斧 2d12+4・critMult 2 | 5 |
| **X3** | **X1 + 冬狼 1 頭** | **6** |
| 比較: 神殿 Lv8 | — | 9 |

詳しい表(`item3c/table5f.md` をそのまま):

| | SRD | A+C | W3 (A+C・狼 1・狼 HP56 +4) | X1 (A+C・2d12+6 ×2) | X2 (A+C・2d12+4 ×2) | X3 (X1・狼 1) | 神殿 Lv8 |
|---|---|---|---|---|---|---|---|
| クリア / 敗北 | 0 / 10 | 2 / 8 | 4 / 6 | 4 / 6 | 5 / 5 | **6 / 4** | 9 / 1 |
| 全滅 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |
| 所要の平均 (最小〜最大) | 102 秒 (92〜123) | 107 (83〜127) | 105 (90〜114) | 103 (97〜119) | 106 (92〜135) | 104 (88〜114) | 144 (102〜173) |
| 大広間入り (平均) | 68 秒 | 67 | 66 | 64 | 66 | 65 | — |
| 倒れた人数 (主人公 / 仲間) | 12 (10 / 2) | 12 (8 / 4) | 6 (6 / 0) | 10 (6 / 4) | 5 (5 / 0) | 5 (4 / 1) | 1 (1 / 0) |
| 巨人の残り HP (平均・討伐数) | 124.8 /138・0 | 52.0 /104・3 | 14.4 /104・4 | 36.2 /104・4 | 25.5 /104・5 | 18.8 /104・6 | リッチ 9 討伐 |
| 岩投げ 回数 / 命中 / 岩で倒れた | 11 / 8 / 1 | 11 / 11 / 3 | 8 / 8 / 0 | 11 / 8 / 3 | 10 / 9 / 0 | 9 / 9 / 0 | — |
| 冷気の息 回数 / 巻き込み延べ / 息で倒れた | 22 / 28 / 2 | 33 / 44 / 2 | 12 / 14 / 0 | 27 / 50 / 1 | 28 / 49 / 0 | 7 / 11 / 0 | — |
| 主人公の倒れ方 (息 / 岩 / 大斧 / 噛みつき) | 2 / 0 / (それ以外 8) | 1 / 0 / (それ以外 7) | 0 / 0 / 6 / 0 | 1 / 0 / 4 / 1 | 0 / 0 / 5 / 0 | 0 / 0 / 4 / 0 | 0 / 0 / (それ以外 1) |

所見: 主人公を倒しているのはほぼ全部、巨人の大斧の一撃(3d12+6・×3 で最大 114 / HP 100 の前衛)。巨人の HP や命中を下げるより、大斧そのものと冬狼の頭数が効いた。⚠ attacksPerTurn が効くのは主人公を狙う手番(`enemyAttackTurn` の biteCount ループ)だけで、仲間を狙う手番は常に 1 回。

**③ ユーザー決定(2026-11-05)**: **X3 を本番に入れる。推奨 Lv は 8 のまま。**

**④ 本番に入れた値(項目3d)**:
- `index.html` `ENEMY_TYPES.frostGiant`: **attacksPerTurn 1**(SRD 2)・**hp 104**(SRD 138。maxHp は湧くときに hp から作られる)・**dmgDice "2d12"**(SRD 3d12)・dmgBonus 6 のまま・**critMult 2**(SRD 3。⚠ 岩のクリティカルも `def.critMult` を使う = 岩も ×2 になった)。AC 15・atkBonus +9・岩 4d10+6・冷気の完全耐性・CR 8・xp は変えていない。見出しコメントに「SRD からユーザー判断で弱めた(2026-11-05・Lv8 N=10 で 0/10 → 6/10)」の注記。
- 冬狼は大広間 n1 に **1 頭**(SRD 2 頭)= `buildFrostHoldRun` の n1 `slots: [[32, 11, "winterWolf"]]`(右前 (32,15) を外した)と `?graph=0` 用の `SCENARIOS["frost-hold"].spawns` の `["winterWolf", 55, 11]`(55,15 を外した)の**両方**。冬狼の値(HP 75・+6・2d6+4・冷気の息 4d8 DC12)は SRD のまま。
- `tavern.html` の依頼の `enemies` は「冬狼」で頭数を言っていない = 触らない。
- `js/changelog.js`: 未公開の霜の巨人の砦の行(目印の間の先頭)を「大斧を振るい岩を投げる巨人と、冷気を吐く番犬の冬狼に挑め(神殿のクリア後・推奨 Lv8)」に直した(新しい行は足していない・pre-commit の検査は目印の間の差で通る)。

**⑤ 本番の値での N=20(項目3d・差し替えなし・道具 = `item3c/probe_frost_variant.js` を差し替え引数なしで・2 本を port 10719 / 10720 で並走・`frost_lv8_prod.tsv` / `detail_prod/` / 要約 `summ5g.txt`)**:
- 効いた証拠(20 回とも): 大広間の巨人 `{hp:104,maxHp:104,apt:1,atk:9,dice:"2d12",bonus:6,crit:2,sameDef:true}`・冬狼 1 頭 `[{hp:75,maxHp:75,atk:6,dice:"2d6"}]`・上書き `{"before":{"g":{},"w":{}},"after":{"g":{},"w":{}}}`(何も差し替えていない)。

| | 霜の巨人の砦 Lv8・本番 X3・**N=20** | 参考: X3 メモリ差し替え N=10 | 神殿 Lv8 N=10(項目3) |
|---|---|---|---|
| クリア / 敗北 | **13 / 7**(10 本ずつ 6 / 4・7 / 3) | 6 / 4 | 9 / 1 |
| 全滅 | 0 | 0 | 0 |
| 所要の平均 (最小〜最大) | 106 秒 (94〜124) | 104 (88〜114) | 144 (102〜173) |
| 大広間入り (平均) | 66 秒 | 65 | — |
| 倒れた人数 (主人公 / 仲間) | 9 (7 / 2) | 5 (4 / 1) | 1 (1 / 0) |
| 巨人の残り HP (平均・討伐数) | 9.3 /104・13 | 18.8 /104・6 | リッチ 9 討伐 |
| 岩投げ 回数 / 命中 / 岩で倒れた | 18 / 16 / 2 | 9 / 9 / 0 | — |
| 冷気の息 回数 / 巻き込み延べ / 息で倒れた | 15 / 17 / 0 | 7 / 11 / 0 | — |
| 主人公の倒れ方 (息 / 岩 / 大斧) | 0 / 0 / 7 | 0 / 0 / 4 | — |

巨人の残り HP の並び: 0,16,9,0,17,0,11,0,0,0 / 0,0,48,0,49,0,0,0,0,37。⚠ 測定は素の 3 回と `--negative` と同時に走らせた負荷の下。
所見: 本番に入れた X3 で **13 / 20 = 65%**(項目3c の N=10 の 6 / 10 と同じ帯)。負けた 7 回は全部、大広間で主人公が巨人の大斧に倒されて終わる。神殿 Lv8(9 / 10)よりは厳しいまま = 「神殿の次の山」の手応え。

**⑥ 言い直した判定(`tools/verify_frost_hold.js`)**:
- 定数 `GIANT_X3 = { hp: 104, dmgDice: '2d12', dmgBonus: 6, critMult: 2, attacksPerTurn: 1, ac: 15 }`・`HALL_WOLVES = 1` を足した(期待値は依頼書のユーザー決定を写す = 配信バイトから読まない。読むと値が変わっても緑のままになる)。
- (0a): n1 = 巨人 1 + 冬狼 **2 → 1**(台帳の slots と実体の両方)。
- (3a): 型の値 critMult **3 → 2**・岩のクリティカルの倍数(直接呼びの `times` と戦闘の岩の式)を **×3 → ×2**。型の値の照合に hp 104・2d12・dmgBonus 6・attacksPerTurn 1・AC 15 を足した(probe の `o.defs.giant` に 5 項目を足して読む)。
- (3e) の冬狼の値(4d8・DC 12)と `ROCK` / `BREATH` は SRD のまま = 触っていない。変異 15 本の担当(NEG_EXPECT)は 1 本も変えていない。
- 結果: 素 3 回連続 = `plain_{1,2,3}.log` **27/27 PASSED   FAILED 0   PENDING 0** × 3(130 / 129 / 131 秒・exit 0)/ `--negative`(`negative.log`)= `[素・基準] 27/27` → `負のコントロール 15 / 15 が検出成功` → `[vet] --negative OK: 15 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行`(**2041 秒 = 34.0 分**・exit 0・N=20 の測定と同時) ⇒ 項目4 の 1 腕の上限は項目3 の 2325 秒 × 1.3 = 約 3023 秒のままでよい。
- 既存 golden: frostGiant / winterWolf を握るのは本ドライバだけ(`grep -ln "frostGiant\|winterWolf" tools/*.js`)。frost-hold を名指しする `verify_dragon_fold`(**PASS 35 / FAIL 0**)と `verify_swamp_novice`(**PASS 34 / FAIL 0**)を再走 = 項目2 の言い直しのあとの色(緑)から退行なし。

### 12-4. 項目4 — 既存 golden の言い直し + 母集団の非退行(2026-11-05〜11-06・基準 HEAD `b59766e`)

作業の置き場 = `~/.claude/dev-loop/r107/item4/`(申し送り `item4_notes.md`・パッチ `fix/fix_*.py`・ログ `logs/{pre,post,sdx,tri}/`・地図の sha1 の独立計算 `sha_vm.js`・札の掃引 `sign/measure_temple.js`)。
本番ファイルで触ったのは `js/world-map.js` の 1 行(神殿の `signDx: -12` = 下の (2)・ユーザー決定 (b))だけ。`index.html` / `tavern.html` / `audio.js` は 1 バイトも触っていない(changelog の要否は (2) の末尾)。

#### (1) 予告どおり赤の 15 本の言い直し(commit `5190e48`・⛔ 期待値は緩めず、前の値は撤退の世界へ当て直して残す)

⭐ 地図の sha1 は `js/world-map.js` を node の vm で読み、既定 → `retireGiant()` → … → `retireTower()` の順に同じ式で求めた値(`sha_vm.js`)と、ページで測った値が一致した。今回は**点と道が増えた**ので既定の値は必ず変わり、#106 の既定の値は 1 文字も変えず `retireGiant()` の 1 段目へ移した。

| 段 | `verify_quest_walk` (5a) / `verify_world_steps` (1d) の式 | `verify_road_events` (4a) の式(STEPS 込み) | 点 / 道 / SITES |
|---|---|---|---|
| 既定(#107) | `644bf9dac129dffb` | `026ec0e8d3863628` | 15 / 15 / 12 |
| `retireGiant()` 後 = #106 の既定 | `63f3bce7696bf14a` | `62a182595bd19ac4` | 14 / 14 / 11 |
| + `retireHag()` | `3dd5550782057025` | `2145a1b895486427` | 14 / 14 / 10 |
| + `retireTomb()` | `44b1de14f8b2c9d0` | `cba6eec82b479584` | 14 / 14 / 9 |
| + `retireCargo()` | `3918d569e7f3f7db` | `23ee1c56f280c2e7` | 14 / 14 / 8 |
| + `retireWarren()` | `647e71f6b2956389` | `391c6d4c0c6b4857` | 14 / 14 / 7 |
| + `retireTower()` | `876c5f6336f96811` | `4c0a8a6b3d65cda0` | 14 / 14 / 6 |

| 本 | 言い直し(本件の点 15・道 15・札 13・停留所 25・刻み点 10) | 素の再走 |
|---|---|---|
| `verify_quest_walk` | (0z) 12 組・unlockAfter 10・side 6 /(2z) 12 組 /(2a) 未解放 10 /(2b) 3 → 5 → 7 → 9 → 11 → **13** 枚(霜の峠は神殿の後 = 5 本目から)/(2c) **15 ノード**すべてへ経路 /(2d) 拠点 12・未解放 10 /(3d)(3e)(4b) 札 13 /(5a) 上の 7 値 /(n1z) 12 組 | 25/25 |
| `verify_world_steps` | (1d) 上の 7 値・既定は NODES 15 / EDGES 15 / SITES 12 /(2d)(5c) 札 13 | 33/33(⚠ (2d) は (2) を経て緑) |
| `verify_road_events` (4a) | 上の 7 値・既定は NODES 15 / EDGES 15 / STEPS 10 / SITES 12 | 25/25 |
| `verify_quest_draw` | (0b) side 6(`frost-hold` = locked・前提は本筋の 5 番目)/(1d) 解放済み 12 | 18/18 |
| `verify_quest_visibility` | (0b) scenarios 12 / side 6・(0c)(3b)(3d) 札 13・(5c) NODES 15 / EDGES 15 / STEPS 10 / SITES 12 | 39/39 |
| `verify_tavern_map` (6a)(6b)(7b) | 12 件 / side 6 / SITES 12 | 47/47 |
| `verify_party_four` (0a) | 本筋 6 + side 6 | 緑 |
| `verify_world_heromark` | `EXPECT_NODES` 14 → **15**(項目1 で名簿に足した `:470`)・`EXPECT_SIGNS` 13(照合 15 x 13 = 195 組・交差 0) | 18/18 |
| `verify_world_map` | (7b-data)(7b-dom)(7d) 札 13・(7e) 12 枚・(7f) ノード 15 / 札 13(`:1892` の母集団ガード)。(7f) の例外は (2) で外した | 57/57・`--negative` 44/44 |
| `driver_mapeditor_painting` | 1a テーマ 12・1a2 `frost-hold` も n0big / n1big・3e optgroup 12 | 105/106(1d2 だけ = 着手前から赤) |
| `verify_lore_check` | **数え直し**(HEAD `b59766e` のページ)= 61 キー = 技能あり 49(frostGiant = history・SRD Giant)/ 対象外 12(winterWolf・SRD Monstrosity)・cr 43(frost-giant 8 / winter-wolf 3)/ 出さない 18 | 26/26 |
| `verify_enemy_traits` (0b)(0c) | 表のキー 11・ドライバの SRD 表に frostGiant / winterWolf(冷気の完全耐性・眠りの免疫なし) | 15/15 |
| `verify_counterspell` (4c) / `verify_run_chronicle` (0c) | 「HP を引く点」48 → **51**(項目3d の後の本番で数え直し = 20 + 31。冷気の息の仲間 `a.hp -=`・頭 `hp -=` と岩投げの仲間 `ally.hp -=`。呼び口は 2 つとも `enemyAttackTurn` の中 = 手番の内) | 25/25 / 74 PASSED |
| `driver_cleanup_phase1` (D4) | `MSG_DEFEAT` の参照 17 → **21**(冷気の息の単文 1・三項式 1 行 = 2 出現・岩投げの単文 1) | 28/28 |

- 着手前から赤の 2 本(`verify_codex_map_skill` (3a)・`driver_mapeditor_painting` 1d2)は触っていない。

#### (2) ⚠⚠ 予告外の赤 — `verify_world_steps` (2d) → ユーザー決定 (b)「神殿の札を少し左へ」(commit `42736a0`)

- **何が起きたか**: 言い直しの後、(2d)「札の押し点(中心 + 四隅の内側 8px)を何も奪わない」が赤になった。奪われていた点は `temple:右上` / `temple:右下` の 2 つで、奪っていたのは **frost_peak の点の当たり判定**(`.worldNode`)。項目2 の時点では母集団ガード(札 13 ≠ 12)で止まっていて見えなかった。
- **実測**(`r107/item4/probe_ws2d.js`): 1280x900 では神殿の札 x 909.0〜1046.2・frost_peak の点 x 1037.6〜1073.4。札の右端の約 **8.6px x 31.7px** を押すと霜の峠へ歩く(札の中心は神殿)。1440x900 も同じ形。390x844 は神殿の札が画面外。`?giant=0` では 3 点とも神殿。
  ⇒ §2-3 の机上「当たり判定 (x 1258〜1302) は神殿の札の右端(机上 ≈ 1254)から約 4px 離れる」は**崩れた**(実描画の札の右端は world ≈ 1266)。
- **ユーザー決定 (b)(2026-11-05)**: 神殿の札を左へ寄せる。⚠ **§11「他の拠点の `signDx` は触らない」をこの件だけユーザー判断で上書き**した。frost_peak の座標・`signDx` −112・点・道は動かしていない(⇒ 地図の sha1 は不変 = `signDx` は nodesFP に入らない)。
- **掃引**(`r107/item4/sign/measure_temple.js` = 項目1 の `measure_signs.js` を写し、神殿の `signDx` を変える形へ。`sign/sweep.json`。cleared = 本筋 6 本・主人公 = title / frost_peak / temple / mine・1440 / 1280 / 390):

| 神殿の `signDx` | 押し点の奪われ(全札) | 札の右端と frost_peak の当たり判定(1440 / 1280) | 主人公 mine → 神殿の札(1440) | 主人公 frost_peak → 神殿の札(1440) | 札 × 札 / 停留所の点 / 刻み点 / はみ出し |
|---|---|---|---|---|---|
| 0(項目2) | temple 2 点 ← frost_peak | 8.6px 食い込む | 2.7% | 11.0% | 0 |
| −4 | 0 | 5.3px 食い込む | 5.0% | 9.8% | 0 |
| −10 | 0 | 0.4px 食い込む | 8.6% | 8.0% | 0 |
| **−12(採用)** | **0** | **1.2px / 0.7px 離れる** | **9.8%** | **7.4%** | **0** |
| −14 | 0 | 離れる | **11.0%**((7f) の上限 10% 超え) | 6.8% | 0 |

  ⇒ **−12** = 押し点が全部戻り、かつ札の矩形が当たり判定から離れる最小の値。これより左は (7f)(主人公が mine に立つと神殿の札を 10% 以上隠す)が赤。390 は 3 か所とも札が画面内(title だけは神殿の札が画面外 = どの値でも同じ)。
- **言い直し**: `verify_world_map` の (7f) は frost_peak → 神殿が **7.3%**(ドライバの実測)= 上限 10% の内に戻ったので、`5190e48` で足した例外 `frost_peak->temple: 0.12` を**外した**(例外は #106 の `temple->lakeside` だけ)。mine → 神殿は 9.8%(上限の内)。変異 `crowdsign` のアンカーを `signDx: -12` 付きの行へ(中身は x を寄せるだけのまま)。
- **再走**(`logs/sdx/`・11 本 exit 0): `verify_world_steps` 33/33((2d) 奪われた点 0)・`verify_world_map` 57/57・同 `--negative` 44/44・`verify_world_heromark` 18/18・`verify_quest_walk` 25/25・`verify_quest_visibility` 39/39・`verify_road_events` 25/25・`verify_frost_hold` 27/27・`verify_witch_hut` 29/29・`verify_silent_tomb` 24/24・`verify_lost_cargo` 22/22。
- **changelog**: `js/world-map.js` はフックの対象外。変化は「新しい点の隣の札を 12px 寄せた」で、未公開の行「雪山に新しい行き先『霜の巨人の砦』」に含まれる ⇒ 行は足していない。

#### (3) 母集団の非退行(全数走査・#106 §12-4 と同じ手順)

- **基準** `base107.tsv` = #106 の走査 `r106/item4/run_post106/post106.tsv`(248 腕)の `verify_witch_hut --negative` を、#106 の再走(上限 10800 秒・`run_rerun106` = 12/12 OK・exit 0)で上書きしたもの。`241c718..0298eca` は md と素材だけ ⇒ 着手前 = `0298eca` の色。
- **腕** = その 248 腕(同じ並び)+ `verify_frost_hold` 素 / `--negative` = **250 腕**。clone 根 = `git clone --shared` → `42736a0`(`cmptree107.py`: content differ 0・md 2 本の改行だけ違う = #106 と同じ)。直列・SKIP 再開型・**1 腕の上限 10800 秒**(#106 の教訓 = いちばん長い `verify_witch_hut --negative` 約 6745 秒に合わせた。新しい `verify_frost_hold --negative` は 2055 秒で、この上限の内)。
- **走らせ方**: 11-05 08:17 に起動(Phase A = 19:50 の手前で止める `--stop-at`・239 腕)→ 01:05 まで待って Phase B(11 腕・SKIP 再開)→ **11-06 06:03 に完了・合計 982.9 分**。夜(20:00〜24:59)はまたいでいない。
- **結果: 緑 224 / 非緑 26**。
  - **緑→赤 4**:

| 腕 | 中身 | 帰属 | 処置(commit `9fee173`) |
|---|---|---|---|
| `driver_wallbox` 素 | (1a) 比率あり 16 ≠ 14・(2a)(2b)(5a)(6-oldbox) 大型 15 ≠ 14 | **#107**(霜の巨人 = displaySize 184・比率あり / 冬狼 = 比率ありだが displaySize 130 < 176 = 「比率あり」と「大型」の数が初めて分かれた) | `N_LARGE` = 12+2+1(displaySize ≥ 176)/ `N_RATIO` = 12+2+2((1a))へ分けた。霜の巨人の箱は (2a) の仕様どおり(badSpec 0)= 箱の値は直していない。素 28/28 |
| `verify_town_changelog` 素 | (3a) d1440 酒場の更新情報の箱 bottom 362 > legacy 360 + 1 | **#107**(霜の巨人の砦の行で 4 件が長くなり、箱は CSS の `max-height: 38vh`(border-box)= 20 + 342 = **362** で頭打ち) | 上限を文面に依らない「20 + 38vh」へ移した(de7617e の 4 件で 360 ±1 に戻る `[legacy]` の行はそのまま)。素 56/56・`--negative` 8/8 |
| `verify_witch_hut --negative` | 変異 `nosite` が担当外の (4c) も赤 | **#107**(項目2 で (4c) の 1 段目を `retireGiant()` にした = lakeside が `way` のままの変異では `retireGiant()` 後の地図が固定値と食い違う。決定的・手順の型 §5 の予告どおり) | `NEG_EXPECT.nosite` に (4c)。`--negative --only nosite` = ✓ OK(6 節赤 = 担当どおり) |
| `verify_npc_crowd` 素 | (1a)(4d) 盤面の種が捨てられる(t3 の席札が無い・id 一致 false) | **非帰属**(本番 `42736a0` で 1/3 緑・着手前 = `r106/item4/clone106 @1e79b20` で **0/3 緑** = 盤面の種の揺れ。#104 / #106 の走査でも同じ本が赤 ↔ 緑を往復) | なし |

  - **赤→緑 0** / **両方非緑 22**(`verify_tower_mother_b --negative` は基準も赤 = #106 で非帰属と判定した揺れ。総括行は今回 `[素・基準]` = 素で止まった形)。
  - **exit 3 = 7 腕・基準と同じ 7 腕** ⇒ #107 が増やした exit 3 = 0。taskkill は `probe_party_size`(600 秒の設計どおり)だけ。
  - **新規 2**: `verify_frost_hold` 素 **27/27**(132 秒)・`--negative` **15/15 OK**(`[vet] --negative OK: 15 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行`・2055 秒・exit 0。総括行は最後の変異の `22/27 … [変異 shortcut]`)。
  - 言い直した 15 本 + (2) の 2 本は、走査でも素・`--negative` とも exit 0(`driver_mapeditor_painting` は着手前からの 1d2 だけ)。
- ⇒ **#107 帰属の緑→赤 = 0**(帰属 3 本は件数・文面依存の上限・撤退の段の担当表 = 言い直し済み・挙動の退行ではない)。

#### (4) ユーザー判断待ち

| 件 | 中身 |
|---|---|
| §9 実機 | 卓に Lv8 で並ぶか・霜の峠の札と神殿の札が縦画面で押せるか(神殿の札を 12px 寄せた後)・岩投げと冷気の息の吹き出しの回数・大広間の竜の語り |
| push | #107 のコミットはすべて未 push。ユーザー指示待ち |
| 揺れ(別件・本件の範囲外) | `verify_npc_crowd` の盤面の種・`verify_tower_mother_b --negative` の随伴と出口の競走(#106 §12-4 (3) の仮説のまま) |
