# 手順の型 — 新しい行き先を 1 か所足す(ワールドマップの中継点 → 本筋外の依頼 1 本)

- **出所**: #103「コボルドの巣穴」(`2026-10-28_kobold-warren.md`・commit `2a6333b` / `2c8a255` / `e9abf8e` / 項目4)の実際の手順を 1 枚にまとめたもの。
  ★ #104「消えた積み荷」(`2026-10-29_lost-cargo.md` §12)で 2 回目を通した。学びは本文の ★[#104] の行。
  ★ #105「沈黙の墓所」(`2026-10-30_silent-tomb.md` §12)で 3 回目を通した。学びは本文の ★[#105] の行。
  ★ #106「霧の中の魔女の小屋」(`2026-11-01_witch-hut.md` §12)で 4 回目を通した。学びは本文の ★[#106] の行。
  ★ #107「霜の巨人の砦」(`2026-11-04_frost-hold.md` §12)で 5 回目を通した。**中継点ではなく点と道を新しく足した**初めての回 = §10 の節。学びは本文の ★[#107] の行。
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

- ★[#105] 全数走査は約 13 時間。夜(20:00〜24:59 = 闇市が開く)をまたげないので `-NotBefore 01:05` で予約し、中断したら翌日の 01:05 から SKIP 再開(終わった腕は飛ばす)。
  緑→赤は**着手前の commit の clone**(`git clone --shared` → checkout)と対比較して帰属を決める。単独 3/3 緑でも、変異の空振りは着手前の側でも回数を取って比べる(#105 `lethalonly` は本番 3/3 空振り・着手前 3/3 検出から始まり、11 回取って着手前でも空振りと分かった)。
- ★[#106] ⚠⚠ **走行器の 1 腕の上限は、いちばん長い `--negative` に合わせる**。#106 は上限 5400 秒のままで、新しい受入 `verify_witch_hut --negative`(項目3 の実測 6720.8 秒)が
  変異 12 本中 10 本目(9 本目までは全部 ✓ OK)で taskkill された(exit 1 = 偽の赤。総括行は最後に終わった変異の `26/29 … [変異 unlockfree]`)。⇒ 走査を起こす前に、項目3 で測った新規ドライバの所要 × 1.3 が上限を超えないか確かめ、超えるなら
  `KILL_AFTER` に腕ごとの上限を足す(#106 は走査後にその 1 腕だけ上限 10800 秒で走らせ直した)。
- ★[#106] 走査の指紋(`fp74.py`)は `  ✓ (1a) …` / `  ✗ (1a) …` の型を読まない = `verify_*` の新しい型は全部 `P0/F0`・r1 = `e3b0c442…`(空文字の sha256)になる(#106 時点で 55 腕)。
  これは出力の拾い漏れではない。合否は exit と総括行(`N/N PASSED   FAILED 0`)で読む。
- ★[#107] 1 腕の上限は 10800 秒にした(いちばん長い `verify_witch_hut --negative` ≈ 6745 秒)。新規の受入の `--negative` が長いときは、項目3 の所要 × 1.3 がこの上限の内か確かめる。
  走行器は `Start-Process pwsh … -WindowStyle Hidden` で切り離して起こす(窓が閉じても走り続ける)。#107 = 250 腕・982.9 分・Phase A 239 腕 + Phase B 11 腕。
- ★[#106] 走査の途中で PC が再起動しても、同じコマンドで SKIP 再開できる(終わった腕は飛ばす・途中の腕は頭から)。
  ⚠ 再開の時刻が夜に掛かるなら、`--stop-at 19:50` で手前で止めて `-NotBefore 01:05` で翌日に回す(#106 は 2 段 = 合計 953.4 分)。

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
   - ★[#105] ⚠ **格子線の幅は納品ごとに違う**(#104 v2 = 1px / #105 = **2px**)。差分画素が x / y ∈ {64k, 64k+1} の 2 列に乗っていれば 2px 線(中心 64k+0.5)= 位相 0・周期 64 の格子で正しい。
     このとき `--check` の drift が #104 の 0.00 でなく 1〜2.4 になるが、閾値内なら正常(線の中心が半画素ずれるだけ)。⛔ 1px 線を前提に「外 0」の判定を書かない = 64k+1 も線の上として数える。
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
- ★[#105] ⚠⚠ **既存の型を手下に借りる前に、元の定義の性質を読む**。`animatedArmor` / `gargoyle` は砦の守護者(`faction` 第三勢力 + `startsDormant` 休眠)の定義 = そのまま slots に置くと玄室の手下が全員眠り、手番 0 になる。
  ⇒ 墓所専用の `tombArmor` / `tombGargoyle` を足し、`faction` / `startsDormant` だけ写さない(体質 `physicalResistance` などは写す)。鳴き声は `SPEECH_LINES` の**参照の代入**で引く(文言を書くと変異アンカーが 2 回ヒットする)。
- ★[#105] ⚠⚠ 特別行動の DC を **`fearDC` と名乗らない**。`fearDC` は戦闘開始時の全体恐怖 `partyWillSave` の器 = 名乗るだけで黙って全体恐怖が起きる。値は行動ごとの名前(#105 = `glareDC` / `glareStunGap`)で持ち、入口は `def.glareDC` で絞る。
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
  ★[#105] 4 段 = `retireTomb()` を先頭へ。⚠ 段を足すと、前の行き先の受入の変異(#104 `nosite` = 中継点を `way` のまま)が**撤退の段の節 (4c) も決定的に赤**にする = 担当表に足す(緩めではない)。言い直しの後で前の受入の `--negative` も回すこと。

## 6. 受入ドライバの型(`tools/verify_kobold_warren.js` を写す)

- 配信は内蔵 http サーバ。本番ファイルは起動時に 1 回読んで凍結し、変異はメモリ上で差し替える(⛔ 本番は 1 バイトも触らない)。favicon は 204。
- 節: §0 装置(検証シームが見える・2 ノードが組み上がり敵が 0 体でない・pageerror 0)/ §1 登録の整合(tavern の `scenarios` と同じページの `WORLD_MAP`・world.html の DOM の 2 経路・本筋に入らない・開始直後の卓・本筋 6 本クリアで本筋 null・`findWalkPath` が通る)/ §2 地図(`make_grid_map.py --check`・本番の `aStar`・罠の数と種類・霧)/ §3 特別行動(probe・1 戦闘 1 回・セーヴ成否・装備の例外・他の敵は使わない)/ §4 語りと撤退と印 / §6 恒等(既存シナリオの罠の座標・種類・乱数の呼び出し回数・次の乱数が着手前の commit と同じ。`git show <rev>:index.html` を `?__base=1` で配る)。
- 強さは assert しない。別の道具で Lv・人数・N=10 のクリア率・全滅率・所要・残り HP を記録し §12 へ(数値の判断はユーザー)。
- `--negative`: 変異 10 本前後。担当は**机上で書かず `--mutate` で 1 本ずつ実走して決める**。罠E(自分のアンカーが他の tools/*.js に出ない)の自己検査を入れる。
- ★[#105] ⚠⚠ ドライバから `enterNode('n1')` を**直接**呼ぶ型は、n0 を倒し切った直後に呼ぶと本番の `tickNodeChoice` が回している「出口の知覚判定 → 出口の矢印」が n1 へ持ち越され、
  矢印の Promise が `dialogPaused = true` を握ったまま残る(戦闘が始まらない・約 1/5 の揺れ)。⇒ n1 へ入る前に「判定パネルは振って閉じる・矢印は Esc で閉じる・`nodeBusy` / `skillCheckActive` / `dialogPaused` が 1 秒続けて下りる」まで待つ。
  切り分けは配信バイトの `dialogPaused = <値>;` を行番号つきの記録に包む診断(`verify_silent_tomb --tracedp`)。普通のプレイでは起きない(本番は触らない)。
- ★[#105] 開幕の語り (4a) は `#dmBody` を **MutationObserver** で拾う(`setInterval` の間引きは負荷が高いと 1 段落を取りこぼす。#104 の受入も #105 項目4 で同じ形へ揃えた)。
- ★[#106] ⚠⚠ **ボスの部屋の取り引き(戦わずに済ませる 2 択)**: 未解決の間は敵を `inactive` **だけ**にする(`passiveNpc` を先に立てると、ボスのノードでは
  `checkDungeonClear` の「全員 `!alive || passiveNpc`」が次の tick で通り、2 択より先に即制覇する = 受入の変異 `passiveearly`)。
  取り引きを選んだら **語りを書き終えてから** `passiveNpc` を立てる(先に立てると約 0.5 秒で VICTORY のオーバーレイが語りを隠す)。次の tick で `checkDungeonClear` が制覇を拾う = クリア判定は触らない。
  受入の「取り引きから制覇まで」の上限は語りの長さ(#106 = 2 行で約 5.2 秒・autoplay で縮む)を見込む。
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
- ★[#105] 表に足す本: `verify_enemy_traits` (0b)(0c) は体質の表のキー数・ドライバの SRD 表に新しい型の行(眠り免疫の集合)/ `verify_lore_check` は手下の専用型の分も数える(#105 = 51 + 2 + 1 + 1 + 3 = 58)/
  `verify_lost_cargo` (4c) など**前の行き先の受入**も撤退の段が 1 段増える(上の §5)。
- ★[#105] ⚠⚠ **札が刻み点のマーカーを覆う**(`verify_world_steps` (2c) = elementFromPoint が札を返す = 刻み点が押せない本物の欠陥)。項目1 で主人公と札の重なりだけ測ると見落とす。
  ⇒ 項目1 で「札 × 主人公」と「**札 × 近くの刻み点マーカー**」の両方を測り、`signDx` を掃引して両方 0 になる値を選ぶ(#105 = 64。代償に 390 幅で札の右端が 34px 画面外 = §9 でユーザー判断)。
- ★[#106] ⚠⚠ **札 × 停留所の点も掃引する**。#106 項目1 の掃引は札 × 他の札・札 × 刻み点マーカー・札 × 主人公だけで、lakeside の札が **temple の停留所の点**を覆うのを見落とした
  (temple は砦の後でしか解放されない = 札の無い未解放の点でも札の下に在る・1440 / 390 とも)→ 項目2 で `verify_world_steps` / `verify_world_map` が予告外の赤 →
  x だけでは両立しない(東へ逃げると 390 で 119px 画面外・西は別の刻み点マーカーに乗る)のでユーザー判断 (a)「点は札の下でよい・神殿へは**神殿の札**を押す」→
  golden の押し口を `COVERED_BY_SIGN = { temple: 'lakeside' }` で言い直した(`verify_quest_walk` も同じ型)。
  ⇒ 項目1 の掃引に **全ノードの停留所の点(解放済み・未解放の両方。進行の世界を 2〜3 通り)** を入れ、札の矩形と交わる点を一覧にしてから `signDx` を決める。
- ★[#107] 表に足す本: `driver_wallbox` は**比率を持つ def の本数**(`N_RATIO`・(1a))と **displaySize ≥ 176 の大型の本数**(`N_LARGE`・(2a)(2b)(5a)(6-oldbox))を握る。新しい敵の def に `bodyRatioX/Y` を付けたら N_RATIO、displaySize 176 以上なら N_LARGE を足す(#107 で初めて 2 つが分かれた = 冬狼は比率ありだが 130)/ `verify_town_changelog` (3a) の酒場の箱の高さは文面で動く(上限は CSS の頭打ち 20 + 38vh = 362 で見る)/ 前の行き先の受入の `nosite` は撤退の段が 1 段増えると (4c) も赤 = 担当表に足す(#107 = `verify_witch_hut`)。
- ★[#107] ⚠ HP を引く点・`MSG_DEFEAT` の参照・ENEMY_TYPES の数は、**強さの見直し(項目3d など)の後の本番で数え直す**(項目2 の予告値を写経しない)。
- ★[#111] **新しい敵の型を 1 つ足すだけ**(隠し要素など・行き先は足さない)でも、敵の型を閉じた全数表で縛る 4 本が赤になる(#111 項目2 で予告外・§8 の名指しの母集団が拾わなかった)。いずれもドライバ独立の表へ SRD の md を見て 1 行足して言い直す(本番の `ENEMY_TYPES` から写さない): `verify_enemy_traits` (0b)(0c)(体質の表のキー数・SRD の免疫)/ `verify_lore_check` (0b)(0c)(0d)(1h)(`DRV_SKILL` / `DRV_SLUG` / `N_*`)/ `driver_wallbox` (1a-装置)(`N_RATIO`・displaySize ≥ 176 なら `N_LARGE` も)/ `verify_frost_hold` (3h)(息持ちを足したときだけ = ボスでない息持ちの集合 `NONBOSS_BREATH`)。⚠ `driver_speech_v2` (A1)(鳴き声の無い型の列挙)は #111 時点で着手前から赤 = 新しい型に `enemy.cry.<型>` を足せば列挙に出ない。
- 着手前から赤の本(#103 時点: `driver_mapeditor_painting` §1 1d2 / `verify_codex_map_skill` (3a) stag-tavern)は範囲外として触らない。#104 / #105 時点も同じ 2 本(1d2 の差は 2 = labels 23 / サイズ 21)。
- 名指しの母集団 = `grep -l -E "<前の行き先 id>|SITES|boardFacts|nextLocked" tools/verify_*.js tools/driver_*.js` + `verify_lore_check` + `driver_graph_p6`。全数は項目4 の走査で拾う。

## 8. port の割り当て

- 新規の受入ドライバ = 素 1 + 変異 10 の連番。#103 `verify_kobold_warren` = 10642〜10652 / #104 `verify_lost_cargo` = 10653〜10663 / #105 `verify_silent_tomb` = 10664〜10676(変異 12 本)/ #106 `verify_witch_hut` = 10677〜10689(変異 12 本)。#107 `verify_frost_hold` = 10690〜10705(変異 15 本)。**次の新規ドライバ base = 10706**(素 10706・変異 10707〜)。
- ⛔ 8765(常駐の試遊サーバ)は使わない・触らない。全数走査は直列(port の衝突で偽の exit 3 が出る)。

## 9. 実機/実感(§9 の型)

- 新しく始めた Lv で卓に並ぶか・ワールドマップの札が縦画面で押せるか・罠と特別行動の吹き出しの回数・絵の中の目印が目に留まるか・一言で伏線が伝わるか。

## 10. 点と道を足す — #107 の実績(中継点が空いていないとき)

`kind: "way"` の中継点が無い・使えない(3 叉路・札が混む)ときは、`NODES` に 1 点・`EDGES` に 1 本を**足す**。⭐ 新しい点は**袋小路**(道 1 本)にする = 既存の点どうしの最短経路は 1 本も通らない。

- **座標の選び方 = 刻み点を生やさない長さ**: 刻み点は `Math.ceil(道の長さ / 160) - 1` 個生える(`STEPS` は読み込み時の IIFE)。
  道を **160px 以下**にすれば刻み点 0 = 刻み点 10 件のまま・停留所は点の数だけ増える(#107 = (1184,416) → (1280,288) = 3:4:5 の 160.0px ちょうど・停留所 24 → 25)。
  ⚠ 刻み点が生えると、札 × 刻み点マーカー(#105 の罠)と `STEPS` の撤退の両方を背負う。
- **撤退の器は 5 つを同じオブジェクトで書き換える**: `retire<Name>()` は `NODES`(`delete`)/ `EDGES`(`splice`・後ろから)/ `STEPS`(`on` に新しい点を含む id を `delete`)/ `SITES` / `UNLOCK`。
  ⛔ 写しを作らない(各ページは `WORLD_MAP` の同じ参照を読む)。⚠ 撤退は**読み込みの後**に呼ばれる = `STEPS` はもう出来ている = 消し忘れると点の無い所にマーカーが残る(`world.html` の `buildSteps()` は `WM.STEPS` を全部描く)。
  刻み点 0 の座標でも `STEPS` の掃除は書く(座標を動かしたとき・器を写したときに効く。受入の変異 `keepsteps` は座標を予備案へずらしてから撤退する)。
  新しい点は最後の行に**先頭のカンマ**で足す(`, frost_peak: { … }`)= 前の行を 1 バイトも変えない。撤退の後は前回の地図と 1 文字も違わない(sha1 で確かめる)。
- **経路の非退行**: 受入の (1d) で、全ての点どうしの `findPath` / `findWalkPath` の結果が着手前のバイト(`?__base=1` で配る `js/world-map.js`)と同じことを縛る。
- **点の数を握る固定値は 2 か所**(中継点を拠点へ変えるだけの回は動かなかった): `verify_world_heromark.js` の `EXPECT_NODES` と `verify_world_map.js` (7f) の母集団ガード(`nodeCount`)。
  ほかに `verify_quest_walk` (2c) の `ids.length`・`verify_quest_visibility` (5c) / `verify_road_events` (4a) / `verify_world_steps` (1d) の NODES / EDGES の数・地図の sha1(**既定の値は必ず変わる** = 前の既定は撤退の 1 段目へ移す)。
  sha1 の新しい既定は、`js/world-map.js` を node の vm で読んで同じ式で求めた値とページの実測を突き合わせて焼く(#107 `r107/item4/sha_vm.js`)。
- ⚠⚠ **新しい点の当たり判定 × 隣の札の押し点も項目1 で実測する**(机上の 4px は外れた)。#107 項目1 の掃引は「新しい札 × 他の札・停留所の点・刻み点・主人公」だけで、
  **新しい点(拠点マーカー 約 36px 角)が隣の拠点の札の端を覆う**向きを測っていなかった。机上では「当たり判定は神殿の札の右端から約 4px 離れる」だったが、
  実描画では札の右端に約 8.6px 食い込み、`verify_world_steps` (2d) の押し点(四隅の内側 8px)を 2 つ奪った(項目2 では札の数のガードで隠れ、項目4 の言い直しで初めて出た)。
  ⇒ ユーザー決定で神殿の `signDx` を −12 へ(§11 の「他の拠点の signDx は触らない」をこの件だけ上書き)。⇒ 掃引には **全札の 5 点の elementFromPoint**(1440 / 1280 / 390)を入れる。
  寄せすぎると今度は別の点に立った主人公が札を隠す(#107 = mine に立つと −12 で 9.8%・−14 で 11.0% = (7f) の上限 10% 超え)= 掃引で両側の端を見て値を決める。
- **強さで推奨 Lv が仲間の帯を動かさない**: 仲間の Lv は `assignCompanionLevels` の帯 `qGetTier(推奨 Lv)` で決まり、推奨 Lv 5〜10 はすべて [5,8]。
  ⇒ 「勝てないから推奨 Lv を上げる」は効かない(#107 項目3b = 主人公 Lv9 / Lv10 でも 0/10)。効いたのは敵そのもの(大斧の回数と出目・頭数)= #107 項目3c / 3d の表。
