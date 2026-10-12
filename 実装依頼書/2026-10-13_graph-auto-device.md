# #92 field_step6 Part C の「`?graph=auto` が前進した」を勝敗から切り離す(tools のみ)

- **起草**: 2026-10-13(起草窓) / **ステータス**: **承認済**(2026-10-13 ユーザー承認)
- **触るファイル**: `tools/driver_field_step6.js` / 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: `index.html` / `tavern.html` / `audio.js` / `js/*`(**読むだけ**)。2026-10-13 時点で作業ツリーは clean・並走なし。
- 新しいポートは使わない(既定 `--port 8801` のまま・変異も同じプロセスの同じサーバで順に走らせる)。**次の base = 10628 のまま**。

---

## 1. 目的

`driver_field_step6` は #86〜#91 の母集団走査で毎回 55〜57/59。赤はいつも Part C の
`(C-<sid>) ★?graph=auto が出口を自動選択して entry から前進した` で、**どのシナリオが赤くなるかが走るたびに変わる**ため、
走査のたびに「帰属なし」を証明し直している(#89 K16)。以前 `50302b8`(2026-08-20)で「固定 90 秒窓が短い」として待ちを +210 秒延ばしたが、また腐った。

起草窓が実走で測った結果、**真因は待ち時間ではない**(§2)。

1. **出口 0 本のノードを判定している** — 森は #16(`7642eba`・2026-08-23)で 1 ノードに畳まれ、entry = ボス部屋 = 出口なし。**原理的に永久に赤**。
2. **前進が「Lv1 の 4 人パーティが entry の乱戦に勝つこと」に依存している** — #62/#63/#66/#67 で沼地・砦・神殿・竜の巣の entry は
   **敵 10〜11 体の大部屋**になった。主人公が倒れれば gameOver でループを抜けるので前進は観測されない。砦は毎回 27〜28 秒で主人公が倒れる(決定的に赤)、
   沼地・神殿・竜の巣は勝つか負けるかで色が変わる(二峰)。

この assert が守りたかったのは「分岐が黙って entry に居座っていないか = **`?graph=auto` が矢印もダイアログも出さずに出口を選んで進むか**」(`driver_field_step6.js:770-776` の注記)。
勝敗は関係ない。そこで装置を**本番の勝敗から切り離した別ステージ**へ移し、救済の母集団走行(Part C 本体)からは外す。

**起草窓の判断(2026-10-13)**:

- ⭐ 採用: **装置ステージを分ける**。別ページで `?graph=auto` を起動し、entry の敵をドライバ側で倒した状態(テストダブル)を作ってから「矢印・ダイアログ 0 で前進したか」を測る。母集団 = **entry の出口が 1 本以上あるシナリオ**(`RUN.byId[entry].exits` から実体で数える。名前で森を除外しない)。
- 不採用 A: **待ちをさらに延ばす** —— 砦は 27 秒で主人公が倒れて終わるので、何秒待っても緑にならない。`50302b8` の延長が効かなかった理由そのもの。
- 不採用 B: **`?swampfold=0` などで畳む前の構成へ戻して測る** —— `driver_field_step6.js:555-557` の注記どおり禁止(プレイヤーが二度と見ないマップへ母集団をすり替える)。
- 不採用 C: **Lv10 の種で勝たせる** —— Part C 本体の救済の母集団(Lv1 の実プレイ)がまるごと別物になる。装置のためだけに種を変えるなら、敵を倒すほうが決定的で速い。
- 不採用 D: **assert を消すだけ** —— `?graph=auto` が壊れても誰も気づかなくなる(Part C の calls>0 は entry の戦闘だけで満たされる)。

---

## 2. 着手前の実測(起草窓が本番コードと実走で確かめた事実・基準 `ce61fd8`)

### 2-0. 今の色(HEAD `ce61fd8`・Part C だけを実走)

    node tools/driver_field_step6.js --skip-a --skip-b --port 10628 --out <scratch>

→ Part C の判定 **27 PASS / 4 FAIL**(赤 = 森・沼地・砦・竜の巣)。廃坑は 64 秒、神殿は 149 秒で前進して緑。
フル走行の 55/59(#89 の記録)とも合う。

### 2-1. 過去 5 回の走査ログ(scratchpad に残っていた `driver_field_step6_base.txt`)

| シナリオ | post86 | post87 | post88 | post89 | post90 | 今回 | 型 |
|---|---|---|---|---|---|---|---|
| goblin-mine | 緑 62s | 緑 65s | 緑 66s | 緑 66s | 緑 66s | 緑 64s | 常に緑 |
| bandits-forest | 赤 | 赤 | 赤 | 赤 | 赤 | 赤 | **構造的に赤**(出口 0) |
| lizard-swamp | 赤 | 赤 | 緑 167s | 赤 | 緑 154s | 赤 | 二峰(勝敗) |
| orc-fort | 赤(終了 114s) | 赤(27s) | 赤(27s) | 赤(27s) | 赤(27s) | 赤(27s) | **決定的に赤**(主人公が倒れる) |
| undead-temple | 赤 | 緑 149s | 緑 149s | 緑 149s | 赤(112s) | 緑 149s | 二峰(勝敗) |
| dragon-lair | 赤 | 赤(52s) | 赤(52s) | 赤(52s) | 赤(52s) | 赤(150s) | ほぼ赤(勝敗) |

⚠ 括弧の秒数 = ループが終わった時刻(gameOver で抜けると 90 秒の標本窓より前に終わる)。

### 2-2. いつ腐ったか(git で確認)

| いつ | コミット | 何が起きたか |
|---|---|---|
| 2026-08-12 | `5170a9a` P6 | 森/沼地/砦/神殿/竜が分岐版になり、この assert の母集団に入る。このとき entry は**敵 0 体**(`50302b8` の記録で「他 5 本は 10〜20 秒で前進」) |
| 2026-08-20 | `50302b8` | 廃坑の entry が大部屋になった分を待ちの延長で吸収(この時点ではこれで正しかった) |
| 2026-08-23 | `7642eba` #16 | 森を 1 ノードへ(`index.html:39950-39952` `return { entry: "n7", nodes: [boss] }`)→ **出口 0** |
| 2026-09-08〜16 | `fc3dd60` #62 / `9d25648` #63 / `2de59cb` #66 / `4a9a997` #67 | 沼地/砦/神殿/竜を畳み、**entry = 敵入りの大部屋 n4** |

### 2-3. ⚠⚠⚠ 赤の中身は「時間切れ」ではなく「主人公が倒れた」と「出口 0」

起草窓の時系列プローブ(Part C と同じ起動条件 = `?intel=0&graph=auto`・種 20260719・`sleepMs` を 1/8 に)で、2 秒ごとに `currentNodeId` / `currentPhase` / 生きている敵 / `hp` / `gameOver` を記録した。

| シナリオ | entry | 生きている敵(開始時) | 終わり方 |
|---|---|---|---|
| lizard-swamp | n4(出口 `n7:right`,`n6:up`) | 11 | 115 秒で `hp:0, go:true`(敵 4 体残り・仲間 2/3 生存) |
| orc-fort | n4(出口 `n7:right`) | 11 | **28 秒**で `hp:0, go:true`(敵 10 体残り・仲間 3/3 生存) |
| dragon-lair | n4(出口 `n7:right`) | 10 | 52 秒で `hp:0, go:true`(敵 7 体残り) |
| bandits-forest | n7(**出口 `[]`**・`nNodes:1`) | 10 | 171 秒で `hp:0, go:true`(スカー含む 4 体残り)。勝っても進む先が無い |

⭐ gameOver は**主人公の HP 0 で立つ**(仲間が全員生きていても終わる)。ドライバのループは `if (last.gameOver) break;`(`driver_field_step6.js:625`)で抜けるので、
前進を待つ延長(`:603-604`)には入らない。**待ちを何秒延ばしても砦は緑にならない。**

### 2-4. ⭐ 敵を倒した状態なら 5 本とも前進する(装置ステージの成立性)

同じプローブで、`gameStarted && enemies.length > 0` を待ってから entry の非 `passiveNpc` の敵を全部 `alive = false; hp = 0` にした(ドライバ側のテストダブル)。

| シナリオ | 倒した数 | entry の出口 | 前進までの時間(倒してから) |
|---|---|---|---|
| goblin-mine | 2 | `n1:right` | 54 s |
| lizard-swamp | 11 | `n7:right`,`n6:up` | 117 s |
| orc-fort | 11 | `n7:right` | 80 s |
| undead-temple | 11 | `n7:right` | 84 s |
| dragon-lair | 10 | `n7:right` | 82 s |
| bandits-forest | 10 | **`[]`** | 前進せず(120 秒) |

- 砦で 2 秒ごとに `.exitArrow` の数と `#choiceDialog.show` を記録 → **42 標本すべて 矢印 0・ダイアログ 0・phase=explore**。前進は `chooseExit` の `if (RUN.auto) return opts[0];`(`index.html:37990`)経由。
- 前進まで 54〜117 秒かかるのは、大部屋を出口まで歩くため(この機械は約 2.6 倍遅い)。**上限は 240 秒**にする(最遅 117 秒の約 2 倍)。
- ⭐ `isNodeSettled()`(`index.html:38978-38982`)= 非 `passiveNpc` が全滅 AND 落とし物なし。テストダブルは落とし物を作らないので、倒した直後に成立する。

### 2-5. 本番の関数(行番号は `ce61fd8` で `sed -n` 確認済)

| ファイル:行 | 何 |
|---|---|
| `index.html:37987-38000` | `chooseExit` — `RUN.auto` なら `opts[0]`、それ以外で `!window.__autoplay` なら `showExitArrows` |
| `index.html:38610-` | `showExitArrows` — `.exitArrow` の div を作る(`:38635` `el.className = "exitArrow"…`) |
| `index.html:38978-38982` | `isNodeSettled` |
| `index.html:39083-39155` | `tickNodeChoice`(400ms・`:39155` `if (RUN) setInterval(tickNodeChoice, 400);`) |
| `index.html:39878-39952` | `buildBanditsForestRun`(`S2_FOLDED` なら 1 ノード) |
| `tools/driver_field_step6.js:546-631` | `runPartC`(延長 `:587-605`・gameOver で抜ける `:625`) |
| `tools/driver_field_step6.js:749-788` | Part C の判定(前進 assert `:770-784`) |
| `tools/driver_field_step6.js:841` | `(C0)` 呼び出し合計 ≥100(今回 368) |

### 2-6. 変異の目印(衝突なし)

- `if (RUN.auto) return opts[0];` … `index.html` に **1 回**。`tools/` 全体の文字列には **0 件**。
- `if (RUN) setInterval(tickNodeChoice, 400);` … `index.html` に **1 回**。`tools/` には **0 件**。
- `driver_field_step6.js` には今 `--negative` が無い。配信時の書き換えは `startServer` の `SERVE.bandRows`(`:189-196`)が前例 = 同じ場所に足す。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → tools だけなので**鳴らない・書かない**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/driver_field_step6.js` | ① Part C 本体から前進 assert と延長を外す(前進の秒数と終了理由はログに残す) ② 装置ステージ `runGraphAutoDevice` を新設 ③ `--negative`(配信時の変異 3 本) ④ 冒頭の注記更新 |
| 本依頼書 | §12 実装結果 |
| `実装依頼書/README.md` | 完了時の #92 行更新 |

⛔ `index.html` は開いて読むだけ。

---

## 4. STEP1 — Part C 本体を「救済の母集団」に戻す

- `runPartC` の第 6 引数 `extraMs` と延長ループの条件(`:600-604`)を外し、**`budgetMs` で必ず抜ける**形に戻す(gameOver で抜けるのはそのまま)。
- `advancedAt` は**観測して記録するだけ**(assert しない)。ログに「自然な前進: 64s / せず」を出す。
- ⭐ **終了理由をログに出す**: `gameOver@27s`(主人公の HP 0)/ `budget@90s`。砦は救済の標本が 27 秒しかないことが、今は見えていない。
- `(C-<sid>) ★?graph=auto が…前進した` の check を**消す**(STEP2 の装置ステージへ移す)。
- ⛔ 変えない: `(C-<sid>) 屋外テーマではない` / `経路探索が実際に走った` / `pageerror 0` / `(C0) 合計 ≥100` / 種 20260719 / speed 8 / `budgetMs` 90000 / ダイアログの代役(`:615-623`)。

## 5. STEP2 — 装置ステージ `runGraphAutoDevice`

Part C 本体の後に、`DUNGEONS` の各シナリオで**別ページ**を起動する(Part C 本体の母集団には 1 バイトも触れない)。

1. `bootPage(..., { scenarioId, seed: 20260719, qs: '&graph=auto' })` → 同じ `sleepMs` の 1/8 → **観測器を先に入れる**:
   `MutationObserver` で `.exitArrow` の出現と `#choiceDialog` の `show` クラスを数える(2 秒ごとのポーリングだと短く出た矢印を取りこぼすため)。
2. `startGame()` → `gameStarted && enemies.length > 0 && RUN && currentNodeId === RUN.graph.entry` を待つ(上限 60 秒)。
3. `exits = RUN.byId[RUN.graph.entry].exits` を**ページの実体から**読む。
   - `exits.length === 0` → **母集団外**としてログ(`(dev) bandits-forest: entry n7 の出口 0 本 = 判定しない`)。assert を出さない。
   - それ以外 → 非 `passiveNpc` の生きている敵を全部 `alive = false; hp = 0`(テストダブル。倒した数をログ)。
4. `currentNodeId !== entry` になるまで 400ms ごとに見る(上限 **240 秒**)。⭐ 矢印かダイアログを 1 回でも観測したら**その場で打ち切る**(負のコントロールが速く終わる)。
5. 判定:
   - **(Cd-<sid>) ★?graph=auto が矢印もダイアログも出さずに entry から前進した** = `advancedAt !== null && arrowsSeen === 0 && dialogSeen === 0 && !gameOver`。詳細に `倒した N 体 / 出口 [..] / 前進 Ns / 矢印 0 / ダイアログ 0`。
   - **(Cd0) 装置の母集団** = 判定したシナリオ数 ≥ 1 **かつ** 「出口 1 本以上」のシナリオ数と一致。詳細に判定した/母集団外の内訳を出す(既定 6 本なら 5 判定 + 1 母集団外)。
   ⚠ (Cd0) は**シナリオ名を書かない**。森が将来 2 ノードへ戻れば自然に判定へ入る。
   - `pageerror 0` も装置ページごとに見る。

## 6. STEP3 — `--negative`(配信時の変異)

`startServer` の `/index.html` 配信で、`SERVE.mutate` が立っているときだけ目印を書き換える(`SERVE.bandRows` と同じ場所・目印が見つからなければ 500 を返して**変異自体を赤**にする)。
`--negative` は **Part A/B/C 本体を走らせず**、装置ステージだけを変異ごとに `--scenarios` の既定 = `goblin-mine,orc-fort` で走らせる(所要を抑える)。

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `noauto` | `if (RUN.auto) return opts[0];` を消す → `showExitArrows` へ落ちる | (Cd-goblin-mine)(Cd-orc-fort) = 矢印を観測 |
| `notick` | `if (RUN) setInterval(tickNodeChoice, 400);` を消す → 出口を選ばない | (Cd-*) = 240 秒前進せず |
| `nokill` ⭐ | ドライバ側の倒すテストダブルを止める(配信は無変更) | **(Cd-orc-fort)** = 主人公が倒れて前進しない |

⭐ `nokill` が §2-3 の罠(**装置が勝敗に依存すると赤くなる**)の再現。砦の Lv1 は 5 回の走査すべてで 27 秒で主人公が倒れている。
将来、砦が Lv1 で勝てるようになって `nokill` が緑になったら、それは「勝敗依存に戻しても気づけない」状態 = 変異の作り直しが要る、という合図。
⚠ `nokill` の goblin-mine は勝って緑になりうる → **`nokill` の判定は (Cd-orc-fort) だけ**を見る。

変異が 1 本でも赤くならなければ exit 1。

---

## 7. 撤退スイッチ

本番の挙動は 1 バイトも変えないので**ゲーム側の撤退スイッチは無い**。撤退 = `git revert`。

---

## 8. 受入条件

### §0 装置

- **(Cd0)** 判定したシナリオ数 ≥ 1 かつ「entry の出口 1 本以上」の数と一致(既定 6 本で 5 + 母集団外 1)。⭐ これが無いと全部母集団外で空振り緑になる。
- 装置ページでテストダブルが**倒した数 ≥ 1**(出口のあるシナリオ全部)。0 なら敵の読み出しが壊れている → (Cd-*) を赤にする。

### §1 本体

- **(Cd-<sid>)** 出口のある 5 本すべて緑(矢印 0・ダイアログ 0・240 秒以内に前進)。
- 2 経路で突き合わせる: 前進は `currentNodeId` の変化、経路は MutationObserver の矢印/ダイアログ数(写経ではなく DOM の実体)。

### §2 非退行

- `node tools/driver_field_step6.js` → **全緑**。総数は Part C の前進 assert 6 本を消して (Cd-*) 5 本 + (Cd0) 1 本 + 装置ページの pageerror を足すので変わる → **実装窓が実測で確定**し §12 に書く。
- Part A/B/S の判定と数値(切断率・救済発火)は今と同じ(装置ステージは別ページ・Part C 本体は延長を外しただけで標本は 90 秒凍結のまま)。
  ⚠ 基準は 2026-10-13 の今回の走行(Part C 27/31・(C0) 368 回)。違ったら期待値を書き換える前に理由を突き止める。
- `node tools/driver_field_step6.js --negative` → **3/3 変異が赤**。
- ⭐ **3 回連続で素の全緑**を確かめる(揺れの回収が目的なので 1 回の緑では受入にしない)。

### ⛔ 測らないこと

- 自然な前進の秒数(`advancedAt`)と終了理由 —— ログに出すだけ。勝敗はゲームバランスの問題でこの道具の守備範囲ではない。
- 装置ページの前進までの秒数(上限 240 秒を割れば何秒でもよい)。

---

## 9. 実機/実感の確認

なし(tools のみ)。

---

## 10. changelog

不要(§2-7)。

---

## 11. やらないこと

- ⛔ Lv1 の 4 人パーティが畳んだ entry で主人公が倒れる難易度(砦 28 秒・竜 52 秒)を直すこと —— ゲームバランスの別件(#63 の宿題「4 人 PT は畳んだ砦の n4 で全滅」と同じ根)。
- ⛔ gameOver の条件(仲間が生きていても主人公の HP 0 で終わる)を変えること。
- ⛔ `?xxxfold=0` / `?graph=0` で母集団を作ること(`driver_field_step6.js:555-557` の禁止)。
- ⛔ Part A / Part B / 静的スキャン (S1)〜(S5) を触ること。
- ⛔ 別チケ候補 K4(`driver_mine_wall` (6a) 探索停滞検出の揺れ)/ K5(noring の目印が `driver_grid_s2.js` と衝突)—— 要否はユーザー判断待ち。
- `実装依頼書/README.md` へ足す行(起草コミットで追加):

    | 92 | [2026-10-13_graph-auto-device.md](2026-10-13_graph-auto-device.md) | **承認済** | 0% | field_step6 Part C の「`?graph=auto` が前進した」を勝敗から切り離す(tools のみ)。⚠ 真因は待ち時間ではなく **出口 0 本の森を判定** + **Lv1 で主人公が entry で倒れる**(砦 27 秒)。⭐ 装置は別ページで entry の敵を倒してから矢印/ダイアログ 0 で前進を見る・母集団は出口数から実体で。`--negative` noauto/notick/nokill。新 port なし・次 base 10628 |

---

## 12. 実装結果

### 12-0. 着手前の実測(2026-10-13・HEAD `6154caf`)

- `index.html` sha1 = `3a5dbd8ed7f7d57e3c7fec73a80dfeb017d12593`(CRLF 41762 行・末尾改行なし)。`tools/driver_field_step6.js` と本依頼書は**純 LF**。
- §2-5 の行番号: `chooseExit` 37987(`if (RUN.auto) return opts[0];` は **37990**)/ `showExitArrows` 38610・`.exitArrow` 38635 / `isNodeSettled` 38978-38982 / `buildBanditsForestRun` 39878・`return { entry: "n7", nodes: [boss] }` 39952 … **一致**。
  - ⚠ ずれ 1 件: `tickNodeChoice` は **39083-39148**、`if (RUN) setInterval(tickNodeChoice, 400);` は **39149**(依頼書の 39155 ではない)。
  - ⚠ ずれ 1 件(driver 側): gameOver で抜ける行は着手前 **:624**(依頼書の :625 ではない)。他の driver 行番号(:546-631 / :587-605 / :615-623 / :749-788 / :770-784 / :841 / :189-196 / :555-557)は一致。
- §2-6 アンカー: `if (RUN.auto) return opts[0];` = index.html **1 回**・`tools/` の全ファイル **0 件** / `if (RUN) setInterval(tickNodeChoice, 400);` = index.html **1 回**・`tools/` **0 件** … **一致**(衝突なし)。
- ⚠ §2-0 の「Part C だけで 27/31」は総数が数え違い。`--skip-a --skip-b` の判定は (S1)〜(S5) 5 本 + シナリオごと 4 本 × 6 + (C0) 1 本 = **30 本**(赤 4 なら 26/30)。フル = 30 + Part A 13 本((A-*) 12 + (A0))+ Part B 12 本 + (J1)(J1b)(J1c)(J2) 4 本 = **59 本**で依頼書と一致。
- **素の色(フル走行・port 10628)= 56/59・EXIT=1・所要約 25 分**。ログ = scratchpad `f6_base_92.txt`(JSON = `f6_base_92/field_step6_metrics.json`)。
  - 赤 3 本 = `(C-bandits-forest)`(entry n7・前進せず)/ `(C-orc-fort)`(**27s** で終了)/ `(C-dragon-lair)`(**51s** で終了)。
  - 沼地は今回 **緑(191s で前進)**・神殿は緑(149s)・廃坑は緑(67s)= §2-1 の「二峰」どおり(依頼書の今回 4 赤 → この走行は 3 赤)。
  - (C0) = **390 回**(依頼書の 368 は別走行の値。実プレイの非決定な標本なので回数は揺れる)。内訳 呼出/救済発火/完全に進めず: 廃坑 76/5/0・森 94/1/1・沼地 67/7/0・砦 16/2/0・神殿 86/10/0・竜 51/1/0。
  - Part A(決定的・非退行の基準): 切断率 帯3行 救済なし **45.450%** → あり **76.300%** / 帯5行 **0.300%** → **0.200%**、移動不能 3行 **17239/20396 → 0/4236**、5行 **6889/11379 → 0/4808**、救済発火 0 / 1225 / 0 / 400。
  - Part B(実プレイ・非決定・合否は 12 本の PASS だけ): 切断率 iphone_port 44.063% → 12.121%・desktop 29.194% → 24.784%、全腕 waves-cleared・最大同時敵 3。

### 12-1. STEP1(Part C 本体を救済の母集団へ戻す)

- `runPartC(browser, base, scenarioId, speed, budgetMs)` — 第 6 引数 `extraMs` と延長条件を削除。ループは **`el >= budgetMs` で必ず抜ける**(gameOver ならその前)。標本 `sample` は従来どおり抜けた時点の `last.rescue`(= 90 秒窓、gameOver ならそれより短い)。
- 戻り値に `endReason`(`budget@90s` / `gameOver@27s` / `evaluate-failed@Ns`)を追加。ログ行 `→ 90s (標本 90s) / 終了理由 budget@90s / …`、分岐行に `自然な前進: 66s / せず`、Part C サマリ表に「終了理由」「自然な前進」列。
- `(C-<sid>) ★?graph=auto が出口を自動選択して entry から前進した` の check を削除(観測ログは残す)。冒頭注記と該当箇所の注記を #92 の事実へ更新。
- ⛔ 変えていない: `(C-<sid>) 屋外テーマではない` / `経路探索が実際に走った` / `pageerror 0` / `(C0) ≥100` / 種 20260719 / speed 8 / budgetMs 90000 / ダイアログの代役。
- 検証(Part C だけ・`--skip-a --skip-b --port 10628`)= **24/24 PASS・EXIT=0**(30 − 前進 assert 6 本)。終了理由 = 廃坑 budget@90s(自然な前進 66s)/ 森 budget@90s(せず)/ 沼地 budget@90s(せず)/ 砦 **gameOver@27s** / 神殿 budget@90s(せず)/ 竜 **gameOver@51s**。(C0) = 395 回。
- 検証(フル・`--port 10628`)= **53/53 PASS・EXIT=0**(59 − 6)。ログ = scratchpad `f6_step1_full.txt`。
  - Part A は 12-0 と**完全一致**(45.450 / 76.300 / 0.300 / 0.200%・移動不能 17239→0 / 6889→0・救済発火 0/1225/0/400)。Part B は 12 本とも PASS(切断率は実プレイで揺れる: 18.487/23.221/46.570/34.229%・全腕 waves-cleared)。(J1)(J1b)(J1c)(J2) PASS。
  - Part C: (C0) = 432 回。終了理由 = 廃坑 budget@90s(自然な前進 74s)/ 森・沼地・神殿 budget@90s(せず)/ 砦 **gameOver@27s** / 竜 **budget@90s**(この走行では 90 秒以内に倒れなかった = 竜の終わり方も揺れる)。
  - `index.html` sha1 は着手前と同値 `3a5dbd8e…`(本番は 1 バイトも変えていない)。
