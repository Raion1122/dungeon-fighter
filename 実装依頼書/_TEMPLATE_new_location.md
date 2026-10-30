# 手順の型 — 新しい行き先を 1 か所足す(ワールドマップの中継点 → 本筋外の依頼 1 本)

- **出所**: #103「コボルドの巣穴」(`2026-10-28_kobold-warren.md`・commit `2a6333b` / `2c8a255` / `e9abf8e` / 項目4)の実際の手順を 1 枚にまとめたもの。
  ★ #104「消えた積み荷」(`2026-10-29_lost-cargo.md` §12)で 2 回目を通した。学びは本文の ★[#104] の行。
- **使い方**: 次の行き先(③ 倉庫街の教団 → ② 湖の島の墓所 → ④ 湖畔の魔女)の依頼書を起草するとき、この 1 枚を写して `<…>` を埋める。
  ⚠ 行番号は書かない(毎回ずれる)。**定義の名前で探し、着手前に本番で測り直す**(`impl-request` スキルの作法)。
- 置き場所・強さ・ダンジョンの形はユーザー決定の表で先に決める(#103 §1 の表の型。⛔ 既存の地図を仮に借りて先に進めない)。

---

## 0. 項目の割り方(dev-loop 4 項目)

| 項目 | 中身 | 終わりの印 |
|---|---|---|
| 1 着手前の実測 + 素材の取り込み | §1 の口を測り直す・名指し golden の色を控える・地図 2 枚の焼き付けと MASK 草案・敵シートの取り込み | 依頼書 §12-1 に実測表・焼き上がり 2 枚・台帳行 |
| 2 本体 | §1 の「要」を全部・changelog 1 行・予告外で赤くなった golden の言い直し | 煙検査 + 予告どおり赤の一覧(申し送り) |
| 3 受入 | `tools/verify_<slug>.js` 新規(§6 の型)・強さの実測(assert しない) | 素 N/N × 3・`--negative` 全変異 OK |
| 4 母集団の非退行 + 記録 | 予告どおり赤の golden を言い直す(§7)・全数走査(#102 / #103 の項目4 の型)・§12・README の行 | 帰属の緑→赤 0 |

## 1. 足す口(全数)— #103 で実際に触った所

`grep -n "<前の行き先の id>"` を下の 5 ファイルにかけ、前回の行き先の足跡を数え直してから写す(#103 は `tower-mother` から写した)。

| ファイル | 口 | 要否 / 注意 |
|---|---|---|
| `tavern.html` | `scenarios` に 1 件(`id` の直後に `place`・`side: true`・`locked`・`recommendedLevel`・`client`・`dialog`・`enemies`) | 要。⚠ `id` → `place` の並びは検証ドライバが配信バイトで読む |
| `tavern.html` | 撤退スイッチ `?<slug>=0`(配列から外す + ワールドマップの写しを今日の姿へ) | 要(§5) |
| `tavern.html` | 帰還の処理(`markTowerMotherHome` / `markRedEgg` の隣)| 印・一言を足すときだけ |
| `index.html` | `SCENARIOS[id]`(`title` / `flavor` / `perceptionDC` / `trapCount` / `trapTypeByNode` / `hiddenChestCount` / `clearXp` / `clearGold` / `spawns`) | 要 |
| `index.html` | `SCENARIO_NARRATIONS[id]`(開幕の語り 4 行) | 要 |
| `index.html` | `buildScenarioRun` の振り分け 1 行 + `build<Name>Run()`(`p6Node()` を直接呼ぶ型) | 要。⚠ 振り分けの行を縦に揃え直さない(ドライバが逐語で握っている)。⚠ `p6Node` の `density` / `start` / `paint` は全部明示 |
| `index.html` | `ROOM_PAINTINGS_DEF[theme]`(`n0big` / `n1big`・`node: true`・屋外は `outdoor: true`・MASK) | 要 |
| `index.html` | `NODE_EXTRA_SPAWN_KINDS`(罠と宝箱を出すノードに `search` / `loot`) | ⚠ 宣言しないと罠と宝箱が**黙って 0** |
| `index.html` | `SCENARIO_TEX` / `ROAD_CHEST_GOLD` | 要(無い id は廃坑へ落ちる / 消えた隠し宝箱の金貨) |
| `index.html` | `ENEMY_TYPES` / `LORE_SKILL_OF` / `LORE_CR` / `detectEnemyFamily` | 新しい敵のとき(§3) |
| `js/df-mapdef.js` | `THEMES` / `THEME_DEFAULT_ENEMIES` / `LINT_PAINTING_ASPECTS` | `THEMES` は要(無いと validate で落ち黙って絵が消える)。⛔ 屋外でも `FIELD_THEMES` に入れない。縦横比が在庫に無ければ `LINT_PAINTING_ASPECTS` に足す(足さないと `driver_graph_p6` (2c) が赤) |
| `js/world-map.js` | `NODES.<中継点>` を `kind: "site"`・`label`・`desc` へ / `SITES` / `UNLOCK` / `retire<Name>()` | 要。⛔ id・座標・`EDGES` は変えない。札の数のコメントも直す |
| `world.html` | 撤退の読み取り 1 箇所(`?tower=0` / `?warren=0` の隣) | 要 |
| `tools/make_grid_map.py` | `GRIDS` に 2 行 | 要(§2) |
| `tools/codex1_sprites.json` | 敵シートの台帳 1 行 | 新しい絵のとき |
| `assets/` | `room_<id>_n0_map.jpg` / `room_<id>_n1_map.jpg` / `<enemy>_anim.png` | 要 |
| `js/changelog.js` | `py tools/add_changelog.py "<b>…</b> — …"` | `index.html` / `tavern.html` を触るので必須 |

⛔ 触らない: `town.html` / `title.html` / `audio.js` / `js/save-slots.js` / `js/tavern-map.js` / `js/npc-crowd.js`・勝利判定・`defeatEnemy()`・`runEncounter` の手番ループ・`checkTrapTrigger()`。BGM は全シナリオ共通(`sceneBgmTrack()`)= 作業なし。

## 2. 地図 — 発注 → 格子の検算 → 焼き付け → MASK(`codex-map-request` スキル)

1. **発注**: codex1 の `dnd-map-maker` へ 2 枚(入口の部屋 → ボスの部屋)。起草 → ユーザー承認 → 投下。read-only の下見で生成されたらそれを受け取ってよい(#103)。
   - ★[#104] ⭐⭐ **格子は絵に描かせない**。画像生成に格子を描かせると周期が揺れる(#104 v1 = 72〜81px で不等間隔・しかも暗い床に明るい線 = `line_response` が拾わず目地を測る)。
     ⇒ 発注は「**格子の無い絵**を描き、その上に**コードで 1 マス 64px 丁度・原点 0 の暗い 1px 線**を重ねる」+ 格子無しの `-nogrid` も一緒に納品、の方式で出す(#104 v2 で合格)。
2. **格子の検算** — ⭐⭐⭐ **一次解は周期から疑う**。
   - #103 は起草窓の `--fit --fit-around 48` の一次解が**2 枚とも偽解**だった(本当の格子は 64px。48 と 64 の公約数 16 の櫛が線の一部にだけ当たり、位相の山が 16px 刻みに並んだ)。塔の最上階(#82)・砦にも同じ前例。
   - 手順: 床を 4 倍に拡大して焼き込み線の**間隔を目で数える** → その周期の窓(`--fit-around <周期>`)で解き直す → 床の線位置の直線回帰で残差を見る(本物 ≤ 0.2px・偽解は数 px)。
   - 位相 0.00 や窓の端の値は「端に張り付いた」疑いだが、**疑うべきは周期のほう**(#103 の祭壇の位相 0.00 は本物だった)。
   - 稜線の縁に乗った解は (位相 × 周期) の 2 次元で振り、上下左右の隣も OK な basin の中心を採る。
   - ★[#104] コードで重ねた格子なら **本命と `-nogrid` の差分で線を直接測る**(差分画素が全部 x / y = 64 の倍数の上・外 0 なら、定義上 位相 0・周期 64.000・全マス)。
     ⚠ `--fit` の一次解はこのとき**端の線 (x = 0 / y = 0) を捨てる**(`line_response` の edge パディングで端の応答が弱い)= 63.5 / 64.030 / 22x15 のように外周 1 列・1 行を落とし、西の大扉が切れる。
     一次解も 3 指標は通るので見た目では気づかない ⇒ 差分で測った (0, 0) / 64.000 / 全マスを台帳へ(根拠は `GRIDS` の注記)。
3. **焼き付け**: `GRIDS` に 2 行(根拠は各エントリの注記が唯一の正)→ `--name` で焼く → 検算 3 指標(drift ≤ 4.0 / 位相 ≤ 2.0 / score ≥ 70%)。⛔ 閾値を緩めない。通らなければ v2 を発注。
   - tile は素材の格子と同じ(拡大しない)。マス数が依頼書の想定と違えば依頼書を訂正する(#103: 31x19 → 23x15)。
4. **MASK**(塔の母 n0big / n1big の 5 規則): 外周 1 マスは `.`(sealRing の仕事)/ 平置きの物は塞がない / 通れない物を塞ぐ / 入口の行は端から端まで開ける / 孤立 0。
   - 4 近傍の BFS(sealRing を模す)で入場地点から連結を確かめる。敵のタイルは全部 `.`(`slots` を決めたら測り直す)。祭壇・卵など「上に立たせない物」は `#`。
   - 焼き上がりに MASK を赤で重ねて目視(半マス・1 マスずれ)。本番の最終確認は受入の `aStar`。

## 3. 敵とスプライトの取り込み

- 依頼文は `codex1/requests/` に起草 → 承認 → `py tools/codex_request.py`。受け取ったら**依頼文 §3-3 を受け取り側で実走**(キャンバス・接地線・md5 相違・連結成分)。
- `tools/codex1_sprites.json` に 1 行(セル・列・`char_ratio` は手下と同じ物差し)→ `py tools/pack_codex1_sprites.py --all --only <key>`。
- 必ず `py tools/check_sprite_doubling.py <sheet>` と `py tools/check_alpha_bg_residue.py`。目視は**本番の床の上**で(#103 は祭壇の間の床と暗い土の 2 枚)。足元の縁が既存の手下より少なければ `-clean` は作らない。
- `ENEMY_TYPES` は手下の定義から `meleeRange` / `hitRange` / `attackDuration` / `attackHitFrame` / `attackCooldown` / シート寸法を写す。`displaySize` は当たり判定に直結(#103 族長 = 72・手下 56)。ボス枠は `isBoss: true`。
- 伝承: `LORE_SKILL_OF` は種族の技能。`LORE_CR` は **5e SRD に元がある敵だけ**(独自の頭目は載せない = #76)。家系の掛け声は既存の分岐に足す(新しい台詞は足さない)。
- 特別な行動は**ボスの手番の行動**として作る(写し元 = `sovereignPressEye()`)。入口は**ボスの行動選択の前**(最初の手番が強打の抽選でずれない)。検証用 probe(`window.__<name>Probe`)を置く。他の敵には付けない。

## 4. ⚠⚠⚠ 罠の 3 つの落とし穴

1. **罠は戦闘中に発動しない**(`checkTrapTrigger` は `encounterActive || encounterRunning` で return・見えている罠は踏まれない)⇒ 戦闘中の「仕掛け罠」を `traps[]` に足すと永久に発動しない。手番の行動で作る(§3)。
2. **罠の数はノードごと**(`spawnTraps()` はノードに入るたびに `trapCount` 個・`search` を兼ねるノードだけ)⇒ `trapCount: 1` + 両ノードに `search` = 「部屋ごとに 1 つ」。種類は `TRAP_TYPES` に語りだけ違う行を足し、`trapTypeByNode` で宣言(⛔ `Math.random` を 1 つも足さない・減らさない = 後続のスポーンの乱数列がずれる。⛔ 新しいダイスを足さない)。
3. **開始直後の卓が変わる**(`boardValid` 条件②: 解放済みが 2 件未満のときだけ「次の未解放」1 件を許す)⇒ `locked: false` で足すと開始直後の卓が「廃坑 + 次の未解放(森の予告)」から「廃坑 + 新しい行き先」に変わる。開始直後の卓を縛る golden は言い直しが要る(§7)。`locked: true` で足すなら変わらない。

## 5. 撤退スイッチ

- `?<slug>=0`(#103 = `?warren=0`)。`tavern.html` と `world.html` がそれぞれ自分のページで読む(遷移はまたがない)。`index.html` は判定しない(依頼が卓に出なければ入れない)。
- 撤退で今日の姿へ戻ること(配列から外れる・中継点が `way` へ戻る・開始直後の卓が元へ戻る)を受入で ON/OFF の両方へ当てて反転で測る。
- ⭐ 恒等ハッシュを持つ golden は「撤退を全部呼んだ後の地図 = 前の固定値」で縛る。撤退関数は前の行き先の分も含めて**全部**呼ぶ(#103 では `retireWarren()` → `retireTower()` の 2 段)。
  ★[#104] 3 段 = `retireCargo()` → `retireWarren()` → `retireTower()`。**各段の後の sha1 を全部**固定値で縛る(1 段目の後 = 前回の既定の値を 1 文字も変えず当て直す)。

## 6. 受入ドライバの型(`tools/verify_kobold_warren.js` を写す)

- 配信は内蔵 http サーバ。本番ファイルは起動時に 1 回読んで凍結し、変異はメモリ上で差し替える(⛔ 本番は 1 バイトも触らない)。favicon は 204。
- 節: §0 装置(検証シームが見える・2 ノードが組み上がり敵が 0 体でない・pageerror 0)/ §1 登録の整合(tavern の `scenarios` と同じページの `WORLD_MAP`・world.html の DOM の 2 経路・本筋に入らない・開始直後の卓・本筋 6 本クリアで本筋 null・`findWalkPath` が通る)/ §2 地図(`make_grid_map.py --check`・本番の `aStar`・罠の数と種類・霧)/ §3 特別行動(probe・1 戦闘 1 回・セーヴ成否・装備の例外・他の敵は使わない)/ §4 語りと撤退と印 / §6 恒等(既存シナリオの罠の座標・種類・乱数の呼び出し回数・次の乱数が着手前の commit と同じ。`git show <rev>:index.html` を `?__base=1` で配る)。
- 強さは assert しない。別の道具で Lv・人数・N=10 のクリア率・全滅率・所要・残り HP を記録し §12 へ(数値の判断はユーザー)。
- `--negative`: 変異 10 本前後。担当は**机上で書かず `--mutate` で 1 本ずつ実走して決める**。罠E(自分のアンカーが他の tools/*.js に出ない)の自己検査を入れる。
- 総括行は `  N/N PASSED   FAILED 0   PENDING 0`。⚠ `git show` を使う本は git の無い影ツリーで exit 2 になる(全数走査の帰属判定では prod / clone 根で回す)。

## 7. 言い直しが要る既存 golden(件数・ハッシュ系)— #103 の実績

⛔ 期待値を緩めない(`≥` にしない)。測定点を新しい正しい値へ移し、前の値は撤退の世界へ当て直して残す。

| 本 | 何が変わるか(#103 の言い直し) |
|---|---|
| `verify_quest_draw` | side の件数・開始直後の卓(廃坑 + 新しい行き先)・`cleared=[廃坑]` の解放済み件数・妥当な種。??? の経路は `?<slug>=0` 側で同じ回数だけ測る。変異の担当(oneonly / nofrontier)を実走で更新 |
| `verify_tavern_map` | 種の盤面・scenarios / side / `WORLD_MAP.SITES` の件数・1 枚絵の `scenLen`。(2d) の ??? は `?<slug>=0` のページ(base0)で測る |
| `verify_quest_visibility` | scenarios / side の件数・`.worldSign` の枚数・`SITES` の件数 |
| `verify_quest_walk` | 配信から読む組数・`locked:false` の件数・開始時の札・未解放拠点数・地図の sha1(既定 / 撤退 1 段 / 撤退全部の 3 値) |
| `verify_road_events` (4a) / `verify_world_steps` (1d)(2d)(5c) | 地図の sha1(同じ 3 値の作法)・札の枚数 |
| `verify_world_heromark` | `EXPECT_SIGNS`(札の枚数 → 照合の組数) |
| `verify_world_map` | (7b-data)(7b-dom)(7d)(7e)(7f) の札の枚数 /(7c-2)拠点が絵の集落そのものなら向きを逆に縛る |
| `driver_mapeditor_painting` | テーマ数(1a)・side テーマの `n0big` / `n1big`(1a2)・optgroup 数(3e) |
| `verify_lore_check` | **数え直してから** `N_TYPES` / `N_SKILL` / `N_NOCR` と表(`DRV_SKILL` / `DRV_NO_CR`) |
| `verify_dragon_fold` (7b) / `verify_swamp_novice` (4b) / `verify_road_ambush` (4c) | `NODE_EXTRA_SPAWN_KINDS` の行の集合・撤退の腕に `?<slug>=0` を足す・テーマの台帳(項目2 で予告外に赤くなった) |
| `driver_graph_p6` (2c) | `LINT_PAINTING_ASPECTS` に縦横比を足せば緑のまま |
| ↓ #103 では**名指しの grep の外**で、全数走査が初めて見つけた本 | |
| `verify_party_four` (0a) | scenarios の件数(本筋 + side) |
| `verify_counterspell` (4c) / `verify_run_chronicle` (0c) | 「HP を引く点」の総数(新しい敵の特別行動で `hp -=` が 1 つ増える。点が手番の内か外かを確かめてから数を足す) |
| `verify_plaza_map` (5a) | `initTavernMap` の恒等(`tavern.html` の地図の IIFE に足したブロックを UNDO で外す) |
| `driver_cleanup_phase1` (D4) | `MSG_DEFEAT_*` の参照数(特別行動で主人公が倒れる行を足したとき) |

- ★[#104] 表に足す本: `verify_road_ambush` (4c) は撤退の腕へ `&<slug>=0` を足し「消えた停留所の数」を 1 つ増やす / `verify_quest_draw` は**解放済みが増えた盤面**(#104 = `cleared=[廃坑]`)を
  新しい集合で測り、前の期待は `?<slug>=0` の腕で同じ回数だけ測る / `verify_lore_check` の CR 表は SRD の slug で 1 行(#104 = `cult-fanatic`)/
  `verify_world_map` (7c-1) は**動かせない隣の札**(#104 phlan↔pier)を `ADJACENT_SIGN_PAIRS` で縛る(96 未満 かつ signDx が負)/
  `verify_town_changelog` (1b) は更新情報が移行(`af45b85`)から 4 件以上積まれた日に予告どおり畳む(#104 で畳んだ = 以後は赤くならない)。
- ★[#104] ⚠ 注記に**実データのリテラル**(place / title。例「廃坑」)を書くと `verify_quest_visibility` (0b) の写経の検査が赤になる = 注記では id か「本筋の先頭」と書く。
- 着手前から赤の本(#103 時点: `driver_mapeditor_painting` §1 1d2 / `verify_codex_map_skill` (3a) stag-tavern)は範囲外として触らない。#104 時点も同じ 2 本(1d2 の差は 2 = labels 23 / サイズ 21)。
- 名指しの母集団 = `grep -l -E "<前の行き先 id>|SITES|boardFacts|nextLocked" tools/verify_*.js tools/driver_*.js` + `verify_lore_check` + `driver_graph_p6`。全数は項目4 の走査で拾う。

## 8. port の割り当て

- 新規の受入ドライバ = 素 1 + 変異 10 の連番。#103 `verify_kobold_warren` = 10642〜10652 / #104 `verify_lost_cargo` = 10653〜10663。**次の新規ドライバ base = 10664**(素 10664・変異 10665〜)。
- ⛔ 8765(常駐の試遊サーバ)は使わない・触らない。全数走査は直列(port の衝突で偽の exit 3 が出る)。

## 9. 実機/実感(§9 の型)

- 新しく始めた Lv で卓に並ぶか・ワールドマップの札が縦画面で押せるか・罠と特別行動の吹き出しの回数・絵の中の目印が目に留まるか・一言で伏線が伝わるか。
