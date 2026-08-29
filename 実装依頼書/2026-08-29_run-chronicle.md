# #37 戦いの記録 — 帰還後レポート(冒険の年代記)

- **起草**: 2026-08-29(計画窓) / **ステータス**: ✅ **完了**(2026-08-29 / dev-loop 4 項目・停止 0 回)
  — 実装結果は **§13**。⛔ **push は未実施**(ユーザー承認事項)。
- **着手**: ✅ 済(#36 の着地 `1d3dbd2` を待って開始)。
  当初は ⏸ 保留だった(2026-08-29 ユーザー判断:
  「隣の実装窓が完了した状態を待って、そのあと実装に進んでください」)。
  ⚠ **着手時に §2 の測定をやり直して行番号を取り直した** → 訂正表は **§2-0**。
- **出所**: 開発会議 `dev-meetings/2026-08-29_次の方向性.md`(第1段 候補① → 第2段 開発計画書)
- **測定の基準コミット**: `a51dad3`。⚠ **本書の行番号はすべて `git show HEAD:<file>` で測った値**
- **触るファイル**: `index.html` / `tavern.html` / `tools/verify_run_chronicle.js`(新規)
- ⛔ **触らないファイル**: `js/player-sheet.js` / `js/hero-classes.js` / `world.html` / `town.html` / `title.html`
  — **別窓が依頼書 #36 を実装中**。2026-08-29 時点で `js/player-sheet.js`(+415/-14) と
  **`index.html`(+31/-2)・`tavern.html`(+1)** に未コミット差分がある。
  ⛔⛔ **本チケットは #36 と同じ 2 ファイルを触るので、#36 が着地するまで着手できない**(§3-1)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

本作はオートバトルで、プレイヤーが触れるのは**出発前の準備だけ**。にもかかわらず、
1 回の冒険が終わったときに返ってくるのは `showResult`(index.html:35515)の
**「DEFEAT / この道中で得た宝は、すべて失われた」の一行**と、酒場の 5.5 秒で消える
バナー(`showReturnBanner` tavern.html:4434)だけである。

つまり **「準備をどう変えれば勝てたのか」の手がかりが 1 つも無い**。
準備 → 結果 → 次の準備 というフィードバックループが、結果のところで切れている。

本チケットは 1 回の冒険で起きたことを記録し、帰還後に銀の鹿亭で
**羊皮紙の年代記**として読めるようにする。**ゲームバランスの数値は 1 つも変えない。**

**ユーザー決定(2026-08-29)**:

- 開発会議の候補①〜④をすべて採用し、**①(本件)から順に進める**
- **難易度調整は本件のスコープ外**(別議題として切り出し)
- ⭐ 不採用になった案 — **「一言アドバイスの自動生成」は却下**(ガイウス)。
  理由: 自動生成の助言は必ず外し、外した瞬間にゲームが嘘つきになる。
  代わりに**「空振りしたものを事実として並べる」**(未使用呪文スロット/未発動スキル/残存敵数)。
  これは説教ではなく記録であり、しかも **#35 のロードアウトと直結する**
- ⭐ 不採用 — **レポートを DEFEAT オーバーレイの上に全文出す案は却下**(ミサキ/ガイウス)。
  年代記は帰ってから書くもの。**リザルトには結論 1 行だけ、全文は酒場**という折衷で着地

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

再測定コマンド(すべてこの前置きの上で走らせること):

```bash
cd "c:/Users/PC_User/Desktop/ダンジョンファイターズ"
S=<scratchpad>
git show HEAD:index.html  > "$S/HEAD_index.html"
git show HEAD:tavern.html > "$S/HEAD_tavern.html"
```

### 2-0. ⚠⚠⚠ 【実装窓が再測定】本書 §2 の行番号は **全部ズレている**(2026-08-29 / 基準 `4f7710d`)

本書は `a51dad3` で測られている。その後 **#36 の 3 コミット + #35 の 4 コミット**が乗ったため、
実装窓(orchestrator)が `git show HEAD:` で測り直した。**以降の §2 の行番号は下表で読み替えること。**
⭐ 主張(件数・構造)は **1 件も崩れていない**。崩れたのは行番号だけ。

**ズレ幅**: `index.html` = **+29〜+30 行** / `tavern.html` = **+142 行**。

#### index.html(HEAD `4f7710d` / `git show` なので LF)

| 内容 | 本書(`a51dad3`) | **実測(`4f7710d`)** |
|---|---|---|
| `hp -=` の件数 | 14 | **14** ✅(15493 / 15985 / 21545 / 24682 / 24812 / 25309 / 27254 / 27262 / 27274 / 30188 / 30222 / 30272 / 31871 / 32087) |
| `hp = Math.max(0, X.hp - …)` の件数 | 29 | **29** ✅ |
| **合計 / 関数の数** | 43 / 37 | **43 / 37** ✅ |
| `runEncounter` 定義 | 19610 | **19639** |
| ⭐ `for (const actor of units) {` | 19871 | **19900** |
| `await playerAttackTurn(tgtIdx);` | 19887 | **19916** |
| `await allyAttackTurn(actor.ally);` | 19889 | **19918** |
| `await enemyAttackTurn(actor.idx);` | 19891 | **19920** |
| `damageEnemy` 定義 / HP 書込 | 15453 / 15492 | **15454 / 15493** |
| `damagePlayer` 定義 / HP 書込 | 15961 / 15984 | **15962 / 15985** |
| `triggerTrapOnPlayer` 定義 / HP 書込 | 24575 / 24589 | **24604 / 24618** |
| `triggerTrapOnAlly` 定義 / HP 書込 | 24598 / 24612 | **24627 / 24641** |
| `triggerTrapOnEnemy` 定義 / HP 書込 | 24642 / 24653 | **24671 / 24682** |
| `tickCordonZones` 定義 / HP 書込 | 28386 / 28400 | **28415 / 28429** |
| `defeatEnemy` 定義 | 15638 | **15639**(呼び口 **33** ✅ / `enemy.alive=false` は 15672) |
| `onHeadDowned` 定義 | 17993 | **18022** |
| `onHeadDowned` 呼び口 5 箇所 | 15990 / 24595 / 30164 / 30247 / 31856 | **15991 / 24624 / 30193 / 30276 / 31885** |
| ally `alive = false` 4 箇所 | 24619 / 27239 / 30197 / 32067 | **24648**(`triggerTrapOnAlly`)/ **27268**(`wildConfusedStrike`)/ **30226**(`applyFireBreathToAlly`)/ **32096**(`enemyAttackAllyTarget`) |
| ⛔ 撃破でない `alive = false` 2 箇所 | 24221 / 33909 | **24250**(`applyGrixGuardFlee` = 檻の解放)/ **33938**(`restoreNodeState` = 一括消去) |
| `COMBAT_LOG_MAX = 18` | 13764 | **13765**(値は **18 のまま** ✅) |
| `combatLogLines.shift()` | 13794 | **13795** |
| `appendLog` 定義(記録係の設置目安) | 13760 付近 | **13791** |
| `showResult` 定義 | 35515 | **35544** |
| `lastResult` 書出(clear / defeat) | 35643 | **35672** |
| `lastResult` 書出(retreat) | 35698 | **35727** |

#### tavern.html(HEAD `4f7710d`)

| 内容 | 本書 | **実測** |
|---|---|---|
| `(function consumeResult() {` | 4400 | **4542** |
| `sessionStorage.removeItem("dragonfighters.lastResult")` | 4403 | **4545** |
| `function showReturnBanner(r) {` | 4434 | **4576**(呼び口 4561 / 4563 = `setTimeout(…, 100)`) |
| 羊皮紙 CSS 変数 `--parchment-*` | 12-17 | **12-17** ✅ 変わらず |
| ⭐ z-index の空き **170** | 空き | **空き** ✅(実測 = 100 / **150 `#plazaScreen`(1484)** / **160 `#shopScreen`(1418)** / 200(1242) / **210 `#partyMatchOverlay`(1706)** / 9999(トースト 5673)。**170 は誰も使っていない**) |
| `js/player-sheet.js` のシート overlay | 220 | **220** ✅(`js/player-sheet.js:445`) |

#### ⚠ 本書の記述そのものが誤っていた 2 件(行番号ズレではない)

1. **§7 の「`#townHud` に 5 本目の `<button>` を足すな」は `tavern.html` には無関係。**
   `#townHud` は **`town.html`** にあり、`tavern.html` の出現回数は **0 件**(実測)。
   本件は `town.html` を触らないので、この制約は**自動的に満たされる**。
   → ⭐ **記録棚を開き直す導線は `tavern.html` の中に置くしかない**(場所は実装窓の判断で可)。

2. **§4-3 の「`index.html:18642` 付近にコメントがある」は、コメント内に書かれた古い行番号。**
   コメント本体は **13771-13773**(`MSG_DEFEAT_PARTY` / `MSG_DEFEAT_YOU` の直前)にあり、逐語は
   「・18642 探索中の罠で頭が死ぬ経路 = 敗北ログを 1 行も出さずに gameOver が立つ」。
   **実際の経路は `triggerTrapOnPlayer` 内の 24624**:
   `if (hp <= 0) { if (!onHeadDowned("explore")) gameOver = true; }`
   → 受入条件 **(1d)** はこの 24624 を起点に測ること。

#### 変わっていないことの再確認

- `chronicle` の全文 grep = **`index.html` 0 件 / `tavern.html` 0 件**(名前の空きは維持されている)
- `js/save-slots.js` の `LIVE_PREFIX = "dragonfighters."` / `KEEP` は 2 キーのまま(§2-6 は有効)
- `tools/verify_quest_walk.js:975` の world.html ガードは `/enterVia|lastResult/` を行ごとに見る形。
  新キー `dragonfighters.chronicles` は**掛からない**(§2-9 は有効)

#### §9「既存 golden の非退行」の基準値も差し替え(隣窓 claude-36 の申し送り + 本窓の確認)

| ドライバ | 本書 | **着手時点の基準** |
|---|---|---|
| `tools/verify_player_sheet.js` | 42/42 | **70/70**(#36 で増えた) |
| `tools/verify_tavern_map.js` | 43/43(#35 で動く可能性) | **43/43**(#35 の着地後も**据置**と実測済) |
| `tools/verify_party_match_setup.js` | (存在しなかった) | **36/36 PENDING 0**(#35 の新規ドライバ・**非退行表に追加**) |
| `tools/verify_recruit_size.js` | (記載なし) | **82/82**(#35 が突破手順を付け替えたので巻き込まれ得る・**追加**) |
| `tools/driver_party_view_reopen.js` | (記載なし) | **35/35**(同上・**追加**) |
| `tools/driver_depart_menu_clean.js` | (記載なし) | **41/41**(同上・**追加**) |
| 他(ability 24 / title 86 / town 85 / world 57 / action_priority 92 / save_slots 30 / quest_walk 25) | 据置 | **据置** |
| `tools/verify_town_exit.js` | (着手時に実測) | **項目 4 の worker が実測して記録する** |

⚠⚠⚠ **#35 は「背景タップ = 出発」を廃止した。** 実プレイ系のドライバを書くなら突破手順は
`q('pmDepart') ? q('pmDepart').click() : q('partyMatchOverlay').click()` の 2 段にすること。
さらに「全カラムが filled」で待つと **まだ `phase === "reveal"`**。待つのは `finishReveal` が付ける
`.pmWait` + `PM_TAP_GATE`。filled + 750ms で叩くと `close` ではなく `skipRest` に落ちる。
⚠ `#pmHint` の文言も #35 で変わった。**verbatim で縛らないこと。**


### 2-1. ⚠⚠⚠ 罠 A — 開発計画書の「HP を引く点は 14 箇所」は**誤り。実際は 43 箇所**

計画書は `hp -=` だけを数えていた。**第二の書き方が別に 29 箇所ある**。

再測定(`py` のスクリプトを一時ファイルへ書いてから実行する。
⚠ ヒアドキュメントを入れ子にすると Bash の引用が壊れる — 2026-08-29 に実際に踏んだ):

```python
import re
lines = open(r"<S>/HEAD_index.html", encoding="utf-8", newline="").read().split("\n")
a = [i+1 for i, l in enumerate(lines) if re.search(r'\bhp\s*-=', l)]
b = [i+1 for i, l in enumerate(lines)
     if re.search(r'\bhp\s*=\s*Math\.max\(\s*0\s*,\s*[A-Za-z0-9_.\[\]]*\.?hp\s*-', l)]
print(len(a), len(b), len(a) + len(b))
```

**実測(基準 `a51dad3`)**:

| 書き方 | 件数 |
|---|---|
| `hp -=` | **14** |
| `hp = Math.max(0, X.hp - dmg)` | **29** |
| **合計** | **43 箇所 / 37 関数** |

29 箇所のほぼ全部が **`ally*` の呪文・スキル**(`allyMagicMissile` 25653 / `allyFireball` 26137 /
`allyLightningBolt` 26241 / `allyIceStorm` 26438 / `allyAxeStorm` 26899 / `allyHailOfThorns` 28130 …)。
**計画書のとおり 43 箇所へフックを刺す設計は採らない。**

### 2-2. ⭐⭐⭐ 罠 A の解 — 手番ディスパッチが **1 箇所**にある

`runEncounter`(19610)の中に、全ユニットの手番を回す唯一のループがある:

| HEAD:行 | 内容 |
|---|---|
| **19871** | `for (const actor of units) {` ← **ここが唯一のディスパッチ** |
| 19887 | `await playerAttackTurn(tgtIdx);` |
| 19889 | `await allyAttackTurn(actor.ally);` |
| 19891 | `await enemyAttackTurn(actor.idx);` |

戦闘は厳密に手番制なので、**手番の前後で全ユニットの HP を差分すれば、
その手番の行動者に全増減を帰属できる**。43 のうち **37 箇所がこのラップ 1 点で覆われる**。

⛔ **`Object.defineProperty` によるアクセサ方式は採らない。**
`.hp` の**読み**は HP バー描画と AI のターゲット選択で高頻度に走るため、
書き込みを 1 点に畳む目的でアクセサを入れると読み側にコストが乗る。
手番ラップは**読みに一切触れない**。

**手番の外にあるのは 6 箇所だけ**(こちらは個別にラップする):

| HEAD:行 | 関数(HEAD:行) | いつ |
|---|---|---|
| 15492 | `damageEnemy` (:15453) | 探索フェーズの斬撃 |
| 15984 | `damagePlayer` (:15961) | 探索フェーズの被弾(⚠ 固定 `hp -= 1`) |
| 24589 | `triggerTrapOnPlayer` (:24575) | 罠 |
| 24612 | `triggerTrapOnAlly` (:24598) | 罠 |
| 24653 | `triggerTrapOnEnemy` (:24642) | 罠 |
| 28400 | `tickCordonZones` (:28386) | ラウンド開始時(19842、**actor ループの前**) |

→ **書き込み点は 43 ではなく 7**(手番ラップ 1 + 手番外 6)。全部が同じヘルパーを通る。

### 2-3. 死の集約点 — 6 点で「誰がいつ倒れたか」が全部取れる

| 対象 | 集約点(HEAD:行) | 呼び口 |
|---|---|---|
| 敵の撃破 | **`defeatEnemy` (:15638) 1 関数** | 33 箇所 |
| 頭(主人公/委譲先)の死 | **`onHeadDowned` (:17993) 1 関数** | 5 箇所(15990 / 24595 / 30164 / 30247 / 31856) |
| 仲間の死 | `ally.alive = false` **4 箇所**(24619 / 27239 / 30197 / 32067) | — |

⭐ **`defeatEnemy` を通らない `alive = false` が 2 箇所ある**(24221 檻の解放 / 33909 一括消去)。
これは**撃破ではない**とコード自身が明言している(24221 のコメント:
「★撃破ではない (defeatEnemy を通さない = XP/ドロップ無し)」)。
→ **撃破数に混ざらないのが正しい**。この 2 点は触らない。

### 2-4. ⚠⚠⚠ 罠 B — 戦闘ログは **18 行のリングバッファ**で、年代記の源にはできない

計画会議で「戦闘ログの器は既にある」という主張が出たが、実体は:

```
index.html:13764   const COMBAT_LOG_MAX = 18;
index.html:13794   if (combatLogLines.length > COMBAT_LOG_MAX) combatLogLines.shift();
```

**1 ラン分の記録は保持できない**(18 行を超えた瞬間に序盤が消える)。
→ `RunChronicle` は**自前の配列を持つ**。`combatLogLines` は 1 バイトも触らない。
⭐ この罠は §9 の負のコントロール `N3 ringbuffer` として装置に内蔵する。

### 2-5. 運搬の配管は既にある(ただし 1 回きり消費)

| HEAD:行 | 何 |
|---|---|
| index.html:35643 | `showResult` が `sessionStorage` へ `dragonfighters.lastResult` を書く(クリア/敗北) |
| index.html:35698 | **撤退も同じキーを書く** → 結果は **clear / defeat / retreat の 3 状態** |
| tavern.html:4400 | `(function consumeResult() {` が受ける |
| tavern.html:4403 | ⚠ `sessionStorage.removeItem(...)` = **1 回きりで消える** |
| tavern.html:4434 | `showReturnBanner(r)` が羊皮紙のバナーを出し 5.5 秒で消す |

→ **運搬は `lastResult` に相乗り**(新しい経路を作らない)。
→ **見返すには別途 `localStorage` の記録棚が要る**(STEP4)。

### 2-6. ⭐⭐⭐ セーブスロットは新キーの面倒を**自動で**見る

`js/save-slots.js`(HEAD = 作業ツリーと同一。別窓は触っていない):

```
45:  var LIVE_PREFIX = "dragonfighters.";
47:  var KEEP = { "dragonfighters.settings": 1, "dragonfighters.panelCollapsed": 1 };
     keysOf(store) … Object.keys(store) のうち LIVE_PREFIX で始まり KEEP でないもの
```

`keysOf()` は**前置詞での総なめ**なので、**`dragonfighters.chronicles` を 1 本足すだけで**:

- `snapshot()` … スロットごとに焼かれる(記録が他スロットへ漏れない)
- `wipeLive()` … 新規ゲームで消える(前の主人公の冒険が残らない)

が**こちらのコードを 1 行も書かずに正しくなる**。
⛔ **だからキー名の前置詞を `dragonfighters.` 以外にしてはならない。**
⭐ この罠は §9 の負のコントロール `N6 wipeleak` として装置に内蔵する。

### 2-7. 羊皮紙の地は既にある(新規 CSS 変数は不要)

`tavern.html:12-17` に `--parchment-bg / -ink / -ink-soft / -gold / -border / -shadow` が定義済で、
`showReturnBanner`(:4434)が既にこれを使っている。**新しいカラー変数を足さない。**

### 2-8. z-index の空き — **170** を使う

tavern.html の実測(HEAD):

| z | 持ち主 |
|---|---|
| 150 | `#plazaScreen` |
| 160 | `#shopScreen` |
| **170** | **← ここが空き。`#chronicleOverlay` に使う** |
| 200 | `#prologueOverlay` |
| 210 | `#partyMatchOverlay` (⚠ #35 が触る) |
| 220 | プレイヤーシートのオーバーレイ(`js/player-sheet.js:445`) |

170 なら**買い物画面は覆い、プロローグ・マッチング・キャラシートには覆われる**。
これが正しい重なり順(シートはレポートの上から開けるべき)。

### 2-9. 帰還導線を縛っている既存 golden

| ドライバ | 何を縛っているか |
|---|---|
| `tools/verify_save_slots.js:437` (5a) | `wipeLive()` が `lastResult` を消すこと(`removed >= 3`) |
| `tools/verify_town_exit.js:719` (3b) | 町の遷移前後で `lastResult` が**不変**であること |
| ⚠⚠ `tools/verify_quest_walk.js:1118` | **world.html の配信バイトに `enterVia|lastResult` が 1 回も出現しないこと** |

→ ⛔ **`world.html` を 1 バイトも触らない**。新キー名 `chronicles` は上の正規表現に**掛からない**。
→ ⛔ **`showReturnBanner` を削除しない**(バナーは残し、レポートは別 overlay として足す)。

### 2-10. changelog の要否

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
# 24: GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

**鳴る**(`index.html` と `tavern.html` の両方を触るため必発)。

⭐ **書けるプレイヤー向けの要約は実在する** — 本件はプレイヤーに見える変化そのものなので、
CLAUDE.md が禁じる「見える変化が無いのにトリガーファイルを触る」設計には当たらない。
文面は §11 に用意した。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `RunChronicle` の新設 / 手番ラップ 1 点 / 手番外 6 点 / 死の 6 点 / `showResult` へ結論 1 行 + 記録の書き出し |
| `tavern.html` | `#chronicleOverlay`(z:170)の新設 / `consumeResult` からレポートを開ける導線 / 記録棚 |
| `tools/verify_run_chronicle.js` | 新規ドライバ |

### 3-1. ⛔ 着手順(これを守らないと隣窓のコミットを壊す)

**#35 → #36 → 本件(#37)。** 2026-08-29 現在、隣窓が #36 を実装中で
`index.html` / `tavern.html` **の両方に未コミット差分がある**。本件は同じ 2 ファイルを
触るため、**同一ファイルへの同時 add 事故は原理的に避けられない**。

⛔ **#36 のコミットが出るまで着手しない。** 着手時に必ず:

```bash
git -c core.quotepath=false status --short     # index.html / tavern.html が clean か
git rev-parse --short HEAD                     # 本書の基準 a51dad3 から動いた分だけ行番号がズレる
```

⚠ **本書の行番号は #36 の着地で必ずズレる**(#36 は index.html に +31 行入れている)。
実装前に §2 の測定を**もう一度回して行番号を取り直すこと**。

⛔ **`実装依頼書/README.md` の #37 行は、#36 が着地してから足す**(文面は §12)。

---

## 4. STEP1 — 記録係 `RunChronicle` と年代記

### 4-1. 記録係を 1 つだけ置く

`index.html` の戦闘スコープ内(`appendLog` の近く = 13760 付近)に置く。
**公開するのは数本だけ。記録の出所を 2 つ作らない。**

```js
/* ── 冒険の年代記 (#37) ────────────────────────────────────────────────
 * 1 回の冒険で起きたことを溜めて、帰還時に lastResult へ載せる。
 * ⛔ combatLogLines は使わない。あれは COMBAT_LOG_MAX = 18 のリングバッファで
 *    1 ラン分を保持できない (依頼書 #37 §2-4)。ここは自前の配列を持つ。
 * ⛔ 保存キーの前置詞 "dragonfighters." を変えないこと。js/save-slots.js の keysOf() が
 *    前置詞で総なめしており、スロット振り分けと新規ゲームでの消去がタダで付く (§2-6)。 */
const CHRONICLE_ON = !/[?&]chronicle=0(&|$)/.test(location.search);
const RunChronicle = (() => {
  const members = new Map();   // key -> { name, classKey, isHero, dealt, taken, kills, healed, fellAt }
  const events  = [];          // { round, node, kind, who, by, text }
  const EVENT_MAX = 40;        // 年代記の上限 (localStorage 肥大の歯止め)
  let round = 0;

  function keyOf(u) { /* "player" / ally は npcName+classKey / 敵は type+idx */ }

  function here() {
    // 「どこで」= 部屋名。ガイウス要求: 場所と名前がある文だけが記録
    const n = (typeof RUN !== "undefined" && RUN && RUN.byId) ? RUN.byId[currentNodeId] : null;
    return (n && n.mapDef && n.mapDef.name) || (n && n.name) || null;
  }

  return {
    setRound(r) { round = r; },
    beginTurn(actor) { /* 全ユニットの hp を控える。CHRONICLE_ON が false なら null を返す */ },
    endTurn(snap)    { /* 差分を actor へ帰属。delta<0 = ダメージ / delta>0 = 回復 */ },
    kill(actorKey, enemyDef) { },
    fall(unit, byName)       { },   // 倒れた: events へ 1 行 + members[].fellAt
    snapshot(outcome)        { },   // showResult から 1 回だけ呼ぶ
  };
})();
```

⛔ **`CHRONICLE_ON` が false のときは全 API が即 return する**(記録も表示も起きない)。

### 4-2. 死の 6 点にフックを刺す

| HEAD:行 | 挿す内容 |
|---|---|
| `defeatEnemy` (:15638) 冒頭 | `RunChronicle.kill(いまの行動者, enemies[index].def)` |
| `onHeadDowned` (:17993) 冒頭 | `RunChronicle.fall(頭のユニット, 直近の加害者名)` |
| 24619 / 27239 / 30197 / 32067 の直前 | `RunChronicle.fall(ally, 直近の加害者名)` |

⛔ 24221 と 33909 の `alive = false` には**刺さない**(撃破ではない・§2-3)。

### 4-3. `showResult` から 1 回だけ書き出す

`index.html:35643` / `:35698` の `lastResult` へ `chronicle:` を 1 キー足す。
**書き出しはこの 2 箇所だけ**(clear/defeat は 35643、retreat は 35698)。

データ形状(唯一の正は `RunChronicle.snapshot()`。tavern は読むだけ):

```
{ v: 1,
  outcome: "clear" | "defeat" | "retreat",
  rounds: 7,
  members: [ { name: "ミラ", classKey: "thief", isHero: false,
               dealt: 42, taken: 18, kills: 3, healed: 0, fellAt: null } ],
  events:  [ { round: 4, node: "湧き水の間", kind: "fall",
               who: "ミラ", by: "ゴブリン戦車" } ],
  idle:     { spellSlotsLeft: 3, unusedSkills: ["盾構え"] },   // STEP3
  lastBlow: { by: "オーガの棍棒", enemiesLeft: 4 } }           // STEP3 / 敗北時のみ
```

⚠ **既知の穴**: `index.html:18642` 付近に「探索中の罠で頭が死ぬ経路は敗北ログを 1 行も出さない」
というコメントがある。この経路で `showResult` に到達するかを**実測で確認すること**
(到達しないなら年代記も保存されない = 受入条件 (1d) で捕まえる)。

### 4-4. 酒場に最小のレポートを出す

`tavern.html` に `#chronicleOverlay`(**z-index: 170**、§2-8)を新設。
地は `var(--parchment-bg)` 他の既存変数(§2-7)。**新しいカラー変数を作らない。**

⛔ `showReturnBanner`(:4434)は**残す**。バナーの文面末尾に「📜 記録を読む」を足し、
押すとレポートが開く。バナー自体の自動消滅(5.5 秒)は**変えない**(§2-9 の golden 保護)。

⚠ **閉じ方を 2 つ用意する**(ノエル要求 / #29 の実測): 明示的な閉じるボタン(**タップ領域 44px 以上**)
＋ 背景タップ。両方に `click` と `touchend` を配線する。

---

## 5. STEP2 — 働きの集計

### 5-1. 手番ラップ(1 点)

`index.html:19871` の `for (const actor of units) {` の本体を、
**HP スナップショット → 手番 → 差分**で挟む。

```js
for (const actor of units) {
  // … 既存のガード (gameOver / 生存チェック / awaitNarrationClear / カメラ) はそのまま …
  const __snap = RunChronicle.beginTurn(actor);   // 全ユニットの hp を控える
  try {
    // … 既存の playerAttackTurn / allyAttackTurn / enemyAttackTurn の分岐 …
  } finally {
    RunChronicle.endTurn(__snap);                 // 差分を actor へ帰属
  }
  await sleepMs(220);
  // …
}
```

⛔ **`try/finally` にすること。** 手番の途中で例外や `break` が起きても差分を必ず閉じる。
⛔ **既存のガード行(19872-19875)より内側に置く**。外側に置くと死んだユニットの手番でも
スナップショットが走り、差分が空回りする。

### 5-2. 手番外(6 点)

§2-2 の表の 6 関数を、同じヘルパーで包む:

```js
// 例: damagePlayer (:15961)
function damagePlayer(enemy, enemyIndex) {
  const __snap = RunChronicle.beginTurn({ kind: "enemy", idx: enemyIndex });
  try {
    // … 既存の本体をそのまま …
  } finally {
    RunChronicle.endTurn(__snap);
  }
}
```

⚠ `tickCordonZones`(:28386)の加害者は**設置したエルフ**であって手番の行動者ではない。
ゾーンに設置者を持たせるか、持っていなければ `"cordon"` という無名の加害者にする
(**どちらでもよいが、選んだほうを §13 に書く**)。

### 5-3. 隊列表を描く

各メンバーの 与ダメ / 被ダメ / 撃破 / 生死 を、墨の棒グラフ(`div` の幅 %)で。
⛔ 画像アセットは使わない(素材調達ゼロ)。

---

## 6. STEP3 — 空振りとリザルト 1 行

### 6-1. 「空振り」を事実として並べる(⛔ 助言は書かない)

- **使わずに終わった呪文スロット**: `currentSpellSlots` / ally の `spellSlots` の残数
- **一度も発動しなかったスキル**: `equippedSkills` / `ally.equippedSkills` のうち記録 0 件のもの
- **敗北時に残っていた敵の数**: `enemies.filter(e => e.alive && !e.passiveNpc).length`

⛔ **「◯◯しましょう」という文を 1 つも書かないこと。** 事実だけを並べる(§1 のユーザー決定)。

### 6-2. リザルト画面へ結論 1 行

`showResult`(:35515)の敗北分岐(`resultRewardEl.innerHTML` を書いている箇所)へ **1 行だけ**足す:

> あなたを倒したのは〈オーガの棍棒〉／ 残っていた敵は 4 体

⛔ **リザルト画面を作り替えない。** `innerHTML` に 1 行足すだけ。新しい画面もロードも作らない。

---

## 7. STEP4 — 記録棚

`localStorage` の **`dragonfighters.chronicles`** に **直近 5 件**(JSON 配列)。
6 件目を足すときは最古を落とす。

⛔ 前置詞 `dragonfighters.` を変えない(§2-6)。⛔ `KEEP` に載せない(スロットごとに分かれるべき)。

酒場から開き直す導線を 1 つ置く(場所は実装窓の判断でよい)。

⚠ 【実装窓が訂正】**「`#townHud` に 5 本目の `<button>` を足すな」は `tavern.html` には無関係。**
`#townHud` は **`town.html` にしかなく**、`tavern.html` での出現は **0 件**(実測)。
`verify_town_map` (11b) は `town.html` を測っているので、本件が `town.html` を触らない限り
この制約は**自動的に満たされる**。
→ ⭐ **実装した置き場所** = 酒場左上の `#townExit` の**真下**(`#chronicleShelf`)。
右下(`#shopEntry` + ⚙)/ 左下(`#questBoard`)/ 右上(`#changelogBox`)は既に埋まっており、
重ねると `elementFromPoint` がそちらを返す。**隙間 11px** で、`#chronicleShelf` と `#townExit`
**両方の中心の `elementFromPoint` が自分自身**であることを **(6b3)** が機械化している
(⚠ 矩形の比較では見えない欠陥 — #12 の実測)。

**サイズを実測して §13 へ書き戻すこと**(基準: #5 の実測で 3 スロット満杯 78,326 B = 5MB の 1.49%)。

---

## 8. 撤退スイッチ

- **`?chronicle=0`** — 記録も表示も一切行わず、現行の `showReturnBanner` だけの挙動へ戻る
- **判定位置**: `index.html` と `tavern.html` が**それぞれ独立に `location.search` を読む**
  (`?heromark=0` と同じ作法)
- **ページ遷移をまたぐか**: **またがない**。index で `?chronicle=0` を付けて出発した回は
  年代記が `lastResult` に載らないので、酒場側は付いていなくても**自然に何も出ない**
- ⭐ 名前の空き確認済: リポジトリ全文 grep で `chronicle` は **0 件**(2026-08-29)

---

## 9. 受入条件 — `tools/verify_run_chronicle.js`(新規)

**測り方の方針**: 記録の正しさは「年代記に何行出たか」では測らない(表示は後段の都合で変わる)。
**盤面から独立に数えた値と、年代記の値を突き合わせる**。
⛔ ドライバへ本番の集計式を写経しないこと(同じ間違いを共有すると両方緑になる)。

### §0 装置(先に母集団を確かめる)

- **(0a)** 1 回のオートプレイで年代記に **1 件以上**の記録が積まれている
  ⭐⭐⭐ **これが無いと以降の全 assert が空振りで永久緑になる**
- **(0b)** 表を写経していないこと — 年代記の撃破数が、**`defeatEnemy` が呼ばれた回数**
  (ドライバ側でラップして数えた実測)と**一致**する
- **(0c)** 配信バイトの `hp -=` と `hp = Math.max(0, X.hp -` の合計が **43**
  (2026-08-29 / `a51dad3` 実測)。増えていたら「新しいダメージ点が手番の内か外か」を確認する合図
  ⚠ **#34 の罠**: 注記コメントに `hp -=` と書くと**それも数えられる**。コメントに書かない

### §1 年代記(死と撃破)

- **(1a)** 仲間が倒れた回数 = 年代記の `fall` イベント数(**盤面の `alive` を直接数えた値と突き合わせ**)
  ⚠⚠⚠ 【実装窓が訂正・検出力の追加】**倒れた直後に数えると N3(罠 B)を捕まえられない。**
  4 人倒した時点では年代記がまだ溢れていないので、18 行 + 素の `shift` でも `fall` が生き残り
  **空振りする**。→ 倒したあとに**本番の記録口** `RunChronicle.kill` を **80 回**叩いて
  **わざと溢れさせてから**数える。母集団は新設 **(1z5)**「押し込んだ件数より総イベント数が
  少ない = 上限で捨てが起きた」で縛る(実測: 4 + 80 → **40**)。
  ⭐ これが罠 B の本体「**序盤が消える**」を機械で再現する唯一の形。
- **(1b)** 年代記の各 `fall` 行に**場所(部屋名)と名前**が入っている(ガイウス要求)
- **(1c)** 檻の解放(24221)と一括消去(33909)が**撃破数に混ざっていない**
- **(1d)** 探索中の罠で頭が死ぬ経路(§4-3 の既知の穴)でも年代記が保存される。
  ⚠ **保存されないことが実測で判明したら、それを (1d) の期待値として明記し §13 に書く**

### §2 働きの集計

- **(2a)** 各メンバーの与ダメ合計 = **敵の `maxHp` からの減少量の合計**(別経路で盤面から算出)
- **(2b)** 手番外の 6 点(罠・探索)のダメージも計上されている
- **(2c)** 回復(`hp` の増加)がダメージとして計上されて**いない**

### §3 記録棚と永続化

- **(3a)** `dragonfighters.chronicles` が `localStorage` にあり、**前置詞が `dragonfighters.`**
- **(3b)** `DFSlots.wipeLive()` の後に `dragonfighters.chronicles` が **null**
- **(3c)** 6 件目を保存すると件数が **5 のまま**(最古が落ちる)

### §4 恒等(非退行)

- **(4a)** `showReturnBanner` が**従来どおり存在し、5.5 秒で消える**
- **(4b)** `lastResult` の既存キー(`scenarioId` / `scenarioTitle` / `cleared` / `defeated` / `reward`)が
  **1 つも欠けていない**
- **(4c)** ⚠⚠ 【実装窓が訂正】**「`world.html` の配信バイトに `enterVia|lastResult` が 0 回」は誤り。**
  実測(2026-08-29 / `d5484ff`)= **その語を含む行が 8 行 / 出現 14 回**(全部コメント)。
  既存 golden `verify_quest_walk (1b)` の**実際の述語**は
  「その語を含む行が `Storage` と同居しない(実測 **0 行**)∧
  `(session|local)Storage.(get|set|remove)Item("…enterVia|lastResult")` が **0 件**」
  = **getItem すらしていない**。⛔ 期待値を緩めるのではなく **golden と同じ述語**を使うこと。
  さらに **(4z2) で「その語を含む行が 1 行以上ある」を母集団として先に縛る**(0 行だと述語が
  空回りして永久緑になる)。
- **(4d)** `#combatLog` の `COMBAT_LOG_MAX` が **18 のまま**

### §5 iOS / 手触り

- **(5a)** レポートに**明示的な閉じるボタンがあり、タップ領域が 44px 以上**
- **(5b)** 閉じるボタンと背景の**両方**に `click` と `touchend` が配線されている
- **(5c)** ⚠ 【実装窓が訂正】**`body.ui-compact` は `tavern.html` には付かない。**
  `ui-compact` を付けるのは `index.html` だけ(6394 行)。酒場の狭幅クラスの**実体は
  `body.compact`**(`tavern.html:8027` の `layout()`)。420x860 の実測で
  `bodyClass = "tavernMapOn compact"`。→ **`body.compact` で**年代記が 10 行を超えても
  スクロールできること(器ではなく `#chronicleBody` が縦スクロールを持つ)。
  ⚠ `ui-compact` で測ると「狭幅になっていないのに緑」になる。

### §6 撤退

- **(6a)** `index.html?chronicle=0` → `lastResult` に `chronicle` キーが**載らない**
- **(6b)** `tavern.html?chronicle=0` → レポートの導線が出ず、バナーだけが従来どおり出る

### ⛔ 測らないこと

- **年代記の文面そのもの**(語り口はガイウスの領分。文字列 assert で縛ると推敲できなくなる)
- **棒グラフの色・幅・並び順**(ミサキが目で動かす余地を残す)
- **レポートを開くボタンの置き場所**(実装窓の判断に任せる。⚠ ただし §7 の `#townHud` 制約は守る)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

⚠⚠⚠ 【実装窓が訂正】**「赤くなるべき節」の列は起草時の机上の想定で、2 件が崩れた**
(N3 / N6)。下表は **`--only N<i>` で 1 本ずつ実際に走らせて確定させた実測値**。
巻き添えで赤くなった節は**列挙しない**(巻き添えを担当表へ書くと、その節の母集団が
消えただけの「偽の赤」で空振りを隠してしまう)。

| 変異 | 注入する欠陥(配信バイトへの実行時注入) | 赤くなる節(実測) |
|---|---|---|
| **N1** `noturnwrap` | 手番ラップ(§5-1)= `const __chSnap = RunChronicle.beginTurn(actor);`(**1 箇所**)を殺す | **(2a)** |
| **N2** `nofall` | 仲間の死の 4 点(`RunChronicle.fall(…) // 仲間の死 n/4`)を記録しない。⚠ 頭の死は消さない | **(1a)** |
| **N3** `ringbuffer` | ⭐ **罠 B の再現** — `EVENT_MAX` を 40 → **18**、かつ「倒れた行を守る `splice`」を素の `shift` へ戻す | **(1a) のみ** |
| **N4** `sessiononly` | 記録棚の読み書き 2 点を `sessionStorage` に置く | **(3a)(3c)** |
| **N5** `noclose` | `<button id="chronicleClose">` を DOM ごと外し背景タップだけにする | **(5a)(5b)** |
| **N6** `wipeleak` | ⭐ **罠 §2-6 の再現** — キーを `df_chronicles`(前置詞違い)にする | **(3a)(3b)** |
| **N7** `outofturn` | 手番外 6 点の `const __chOut = RunChronicle.beginTurn(…)`(**6 箇所**)を殺す | **(2b)** |
| **N8** `healasdmg` | 回復をダメージとして計上する(`const dmg = -delta;` → `Math.abs(delta)`) | **(2c)** |

⭐ **N3 と N6 が §2 の罠を機械で守る本体。** この 2 本が赤くならなければ実装は受け入れない。
⚠ **#34 の罠**: 変異を全部同時に注入すると互いを覆い隠す。**1 本ずつ注入して測る**
(素の `--negative` は自分自身を**子プロセスで 1 タグずつ**呼び直す。#35 と同じ形)。

**崩れた 2 件**:

1. ⚠⚠ **N3 の「(0a) も赤くなる」は成立しない。** 18 行のリングバッファでも 1 件以上は
   積まれるので **(0a) は緑のまま**(実測 `events=3`)。赤くなるのは **(1a) だけ**。
   さらに **(1a) は測り方を強くしないと N3 に対して空振りする**(上の (1a) の訂正を参照)。
2. ⚠⚠ **N6 は (3b) だけでなく (3a) も赤くなる。**(3a) は「使っているキーが
   `dragonfighters.chronicles` であること」を直接見ているため。

⛔⛔ **負のコントロールの基準に `git show HEAD:<path>` を使わないこと。**
コミットした瞬間 `HEAD === 作業ツリー`になり、測る節が全滅する(#35 の実測)。
本装置は **起動時に凍結した配信バイトへ実行時に文字列注入する**方式で、
**本番ファイルは 1 バイトも書き換えない**。
⭐ 副産物として、凍結は素の run でも効く = **別窓が同じリポを触っても、この run が読むのは 1 枚**。

### 既存 golden の非退行(実装後に必ず走らせる)

| ドライバ | 期待 | **実測(2026-08-29 / 項目4 完了時)** |
|---|---|---|
| `tools/verify_player_sheet.js` | 42/42 ⚠ **#36 で動く** | **70/70**(#36 で 42 → 70 へ増えた) |
| `tools/verify_ability_scores.js` | 24/24 | **24/24** |
| `tools/verify_title_screen.js` | 86/86 | **86/86** |
| `tools/verify_town_map.js` | 85/85 | **85/85** |
| `tools/verify_world_map.js` | 57/57 | **57/57** |
| `tools/verify_tavern_map.js` | 43/43 ⚠ **#35 で動く可能性** | **43/43**(据置) |
| `tools/driver_action_priority.js` | 92/92 | **92/92** |
| `tools/verify_save_slots.js` | 30/30 | **30/30**(⚠ (8) の total = **78,326 B のまま**) |
| `tools/verify_quest_walk.js` | 25/25 | **25/25** |
| `tools/verify_town_exit.js` | (着手時に実測して記録する) | **23/23 PENDING 0**(← 本チケットで初計測) |
| `tools/verify_party_match_setup.js` | (#35 の新規) | **36/36 PENDING 0** |
| `tools/verify_recruit_size.js` | (#35 が突破手順を付け替え) | **82/82** |
| `tools/driver_party_view_reopen.js` | 〃 | **35/35** |
| `tools/driver_depart_menu_clean.js` | 〃 | **41/41** |

⚠ **基準値は 2026-08-29 時点の記録**(出所 = `実装依頼書/README.md` の #36 行)。
**#35 / #36 の着地後に取り直すこと。** 走らせて違ったら、期待値を書き換える前に理由を突き止める。
⚠ **実プレイ系ドライバの単発の赤はまず 1 回再実行する**(フレークする / #34 の実測)。

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレ音声が無音)。

1. iPhone(iOS Safari)縦持ちで、敗北 → 酒場 → レポートを開く → 閉じる が**片手で**通るか
2. 年代記が「読み物」になっているか(数字の羅列に見えないか)
3. 墨の棒グラフが羊皮紙の斑に食われていないか
   (⚠ #15 の実測: **説明文に `opacity` は禁止**。クリームの薄掛けで解く)
4. レポートを開いたままキャラクターシート(z:220)を開けるか
5. 記録棚に 5 件溜めたときの `localStorage` サイズ

---

## 11. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

STEP ごとに 1 行:

```bash
py tools/add_changelog.py "<b>冒険の記録が残るようになった</b> — 帰還後、酒場の羊皮紙で「誰が何に倒れたか」を読み返せる。"
py tools/add_changelog.py "<b>仲間の働きが数字で見える</b> — 与えたダメージ・受けたダメージ・倒した数を隊列ごとに記録する。"
py tools/add_changelog.py "<b>使わずに終わったものが分かる</b> — 余った呪文スロットや一度も出番の無かったスキルを、記録の末尾に並べる。"
py tools/add_changelog.py "<b>過去の冒険を読み返せる</b> — 直近 5 回ぶんの記録を酒場に残す。"
```

⛔ `--no-verify` での迂回は**ハーネスが全経路をハードブロック**する。嘘の要約をでっち上げるのも禁止。

---

## 12. やらないこと

- ⛔ **助言・アドバイスの自動生成**(§1 のユーザー決定で却下)
- ⛔ **難易度・報酬・敵の数値の変更**(別議題。シナリオ2 のクリア率 0/3、沼 `lizard-swamp` の未測定、
  n7 大部屋の間欠停止はすべて本件のスコープ外)
- ⛔ **リザルト画面(`resultOverlay`)の作り替え**(1 行足すだけ)
- ⛔ **`#combatLog` / `COMBAT_LOG_MAX` への変更**
- ⛔ **`Object.defineProperty` によるアクセサ方式**(§2-2 で不採用)
- ⛔ **`world.html` / `town.html` / `title.html` を触ること**
- ⛔ **候補② 傭兵名簿 / ③ 冒険の賭け金 / ④ 灯りと闇**(本件の完了後に順次)
- ✅ **`実装依頼書/README.md` への行追加は 項目4 で実施済**(#36 `1d3dbd2` の着地を確認してから)。
  ⚠ 実際に載せた行は下の下書きではなく、**§13 の実測(装置 73/73・`--negative` 8 本 空振り 0・
  既存 golden 14 本 非退行・崩れた主張 9 件)を反映した完了版**。以下は起草時の下書き(履歴として残す):

```
| 37 | [2026-08-29_run-chronicle.md](2026-08-29_run-chronicle.md) | **承認済** | 0% | 帰還後レポート「冒険の年代記」。⛔ **#36 の後**(index/tavern を共有)。⚠⚠⚠ **HP を引く点は 14 でなく 43 箇所 / 37 関数**(第二の書き方 `hp = Math.max(0, X.hp - dmg)` が 29 箇所)→ 個別フックは採らず **手番ディスパッチ `for (const actor of units)` (19871) の 1 点ラップ + 手番外 6 点**で覆う。⛔ **アクセサ方式は不採用**(`.hp` の読みが高頻度)。⚠⚠⚠ **`combatLogLines` は `COMBAT_LOG_MAX = 18` のリングバッファ**で年代記の源にできない。⭐⭐⭐ **`keysOf()` は `dragonfighters.` の前置詞総なめ**なので新キーはスロット振り分けも新規ゲームでの消去もタダで付く(前置詞を変えると壊れる)。⭐ 死の集約点は **6 点**(`defeatEnemy` 1 / `onHeadDowned` 1 / `ally.alive=false` 4)。⚠ 24221・33909 の `alive=false` は**撃破ではない**ので刺さない。⚠ z-index は **170**(shop 160 の上・prologue 200 / partyMatch 210 / sheet 220 の下)。⛔ **`world.html` を 1 バイトも触らない**(`verify_quest_walk` 1118 が `enterVia|lastResult` の 0 件を機械化)。撤退 = `?chronicle=0` |
```

---

## 13. 実装結果

**着地 = 2026-08-29。dev-loop 4 項目で完走(停止 0 回)。** ⛔ push はユーザー承認事項なので未実施。

### 13-1. コミット

| 項目 | commit | 何を実装したか |
|---|---|---|
| 項目1 | `b069a4a` | 記録係 `RunChronicle` と年代記(自前配列 / `EVENT_MAX = 40`)/ **死の 6 点**(`defeatEnemy` 1・`onHeadDowned` 1・仲間の `alive=false` 4)/ `showResult` からの `lastResult.chronicle` 書き出し / 酒場の `#chronicleOverlay`(z:170)と帰還後レポート |
| 項目2 | `f8bb159` | **手番ラップ 1 点**(`for (const actor of units)`)+ **手番外 6 点**で与ダメ・被ダメ・回復・撃破を集計 / 隊列表(墨の棒グラフ)/ 装置の §2 を PASS へ |
| 項目3 | `b2d638a` + `6aabbf3` + `d5484ff` | 空振り(未使用スロット・未発動スキル)/ 敗北リザルトの結論 1 行 / 記録棚 `dragonfighters.chronicles` 直近 5 件 / 装置を **PENDING 0** へ / (3b)(3c)(5b) を締め、(6b3) で新 HUD が「街へ出る」を塞がないことを `elementFromPoint` で縛る |
| **項目4** | **(本コミット)** | **`--negative` で N1〜N8 を実装**(配信バイトへの実行時注入)/ **(1a) に罠 B の検出力を追加**((1z5) 新設)/ 本節 §13 と §9 の訂正 / `README.md` へ #37 行 |

### 13-2. 装置の最終値

```
node tools/verify_run_chronicle.js
  → [run-chronicle] 73 PASSED / 0 FAILED / 0 PENDING
```

⚠ **72 → 73 に増えたのは退行ではない。** 項目4 で **(1z5)**(年代記が実際に溢れたことの母集団)を
新設した。理由は上の (1a) の訂正のとおり —— これが無いと **N3(罠 B)が空振りする**。

```
node tools/verify_run_chronicle.js --negative
  → 8 本すべてで担当ラベルが赤くなった (空振り 0)
```

| 変異 | 素点 | **赤くなったラベル(実測)** | うち担当 |
|---|---|---|---|
| N1 `noturnwrap` | 70 PASSED / 3 FAILED | `(2a)` `(2z7)` `(2c)` | **(2a)** |
| N2 `nofall` | 71 / 2 | `(1a)` `(1b)` | **(1a)** |
| N3 `ringbuffer` ⭐ | 71 / 2 | `(1a)` `(1b)` | **(1a)** |
| N4 `sessiononly` | 69 / 4 | `(3z1)` `(3a)` `(3z2)` `(3c)` | **(3a)(3c)** |
| N5 `noclose` | 71 / 2 | `(5a)` `(5b)` | **(5a)(5b)** |
| N6 `wipeleak` ⭐ | 68 / 5 | `(3z1)` `(3a)` `(3b)` `(3c)` `(6b2)` | **(3a)(3b)** |
| N7 `outofturn` | 71 / 2 | `(2b)` `(6-2a)` | **(2b)** |
| N8 `healasdmg` | 71 / 2 | `(2z7)` `(2c)` | **(2c)** |

⭐ N3 の実測: `events 4 → 18`(上限 18・素の `shift`)で **`fall` が 4 → 0 に消えた**
= 罠 B「序盤が消える」の再現。正常時は `events 4 → 40` で **`fall` は 4 のまま**。

### 13-3. 既存 golden の非退行(実測)

**14 本すべて期待値どおり。期待値の書き換えは 0 件。**
`verify_tavern_map 43/43` / `verify_player_sheet 70/70` / `verify_party_match_setup 36/36` /
`verify_recruit_size 82/82` / `driver_party_view_reopen 35/35` / `driver_depart_menu_clean 41/41` /
`verify_ability_scores 24/24` / `verify_save_slots 30/30`(**(8) の total = 78,326 B のまま**)/
`verify_quest_walk 25/25` / `verify_town_exit 23/23` / `verify_title_screen 86/86` /
`verify_town_map 85/85` / `verify_world_map 57/57` / `driver_action_priority 92/92`。

### 13-4. ⚠⚠⚠ 依頼書の主張で崩れた点(全部)

**行番号ズレを除いて 9 件。**(行番号のズレ自体は §2-0 の表で既に訂正済)

1. ⚠⚠ **§9 (4c)「`world.html` の配信バイトに `enterVia|lastResult` が 0 回」は誤り。**
   実測 **8 行 / 出現 14 回**(全部コメント)。既存 golden `verify_quest_walk (1b)` の実際の述語は
   「その語を含む行が `Storage` と同居しない ∧ `(session|local)Storage.(get|set|remove)Item(…)` が 0 件」
   = **getItem すらしていない**。装置はこの述語に合わせ、(4z2) で母集団も縛った。
2. ⚠⚠ **§9 の N3 表「(0a)(1a) が赤くなる」は成立しない。** 18 行のリングバッファでも
   (0a) は 1 件以上積まれるので緑のまま。赤くなるのは **(1a) のみ**。
   さらに **(1a) は「倒した直後に数える」形では N3 に対して空振りする** ——
   本番の記録口 `RunChronicle.kill` で **80 回積んで溢れさせてから**数える形に締めた((1z5) 新設)。
3. ⚠⚠ **§9 の N6 表「(3b) だけ」も不足。** **(3a) も赤くなる**(使っているキー名を直接見ているため)。
4. ⚠ **§9 (5c) の `body.ui-compact` は `tavern.html` には付かない。**
   `ui-compact` を付けるのは `index.html` だけ(6394 行)。酒場の狭幅クラスの実体は
   **`body.compact`**(`tavern.html:8027` の `layout()`)。420x860 で `bodyClass="tavernMapOn compact"`。
5. ⚠ **§7 の「`#townHud` に 5 本目の `<button>` を足すな」は `tavern.html` には無関係。**
   `#townHud` は `town.html` にしかなく、`tavern.html` での出現は **0 件**。
   導線は左上 `#townExit` の直下に置き、**隙間 11px / 両方の中心の `elementFromPoint` が自分自身**
   であることを **(6b3)** で機械化した。
6. ⭐ **(1d) は「年代記が保存される」が正。** 罠で頭が死ぬ経路
   (`triggerTrapOnPlayer` の `if (hp <= 0) { if (!onHeadDowned("explore")) gameOver = true; }`)から
   `showResult` は**直接呼ばれない**が、**300ms 周期の `setInterval` 監視**が `gameOver` を見て
   `showResult(false)` を発火する → **到達するので保存される**。
7. ⚠ **§4-2 の「`defeatEnemy` の冒頭」は誤り。** 実装は **`enemy.alive = false` の直後**へずらした。
   冒頭に置くと多頭ハイドラの「頭を焼き切った = 撃破でない早期 return」まで撃破に数えてしまう。
8. ⚠ **§5-2 の `tickCordonZones` の加害者**は「関数丸ごと」ではなく **ゾーンごとに `owner: ally` を
   持たせて**包んだ(欠けたときのフォールバックは `"コードン"`)。
9. ⚠ **`triggerTrapOnEnemy` の加害者は依頼書が指定していなかった** → **頭(`{head:true}`)へ帰属**させた。

### 13-5. 実装上の判断と実測値(次のチケットへ効くもの)

- **`beginTurn` のネスト**は **`turnDepth` カウンタ + `NESTED` センチネル**で解いた
  (手番の中から手番外の 6 点が呼ばれても、閉じるのは外側 1 回だけ)。
- **手番ラップの実測コスト = 0.78µs / 手番**(10 ユニット・40,000 回平均)。⛔ アクセサ方式は不採用のまま。
- **記録棚の実測サイズ** = 実プレイ 5 件 **21,242 B(5MB の 0.405%)** / 最悪 5 件 **64,142 B(1.223%)**。
  (基準: #5 の 3 スロット満杯 78,326 B = 1.49%)
- **技の発動の記録口は 3 点だけ** — `showRollAtAlly`(仲間の SKILL 吹き出し **33 箇所を 1 点で覆う**)/
  `showSkillAnnounce`(頭)/ `checkDwarvenGritTrigger`(リアクティブ)。
  ⭐ **呪文スロット消費型には 1 箇所も刺していない** —— 既存台帳 `maxSpellSlots[id] > spellSlots[id]`
  から導出できるので、呪文の入口 40 近くへフックを刺す必要が無い。
- ⚠⚠⚠ **`snapshot(null)` の覗き見で `idle` / `lastBlow` を封印すると本番が壊れる。**
  ドライバの計器が何十回も呼ぶため。**封は決着時のみ**(`seal(outcome)`)。
- ⛔⛔ **負のコントロールの基準に `git show HEAD:<path>` を使わない。** コミットした瞬間
  `HEAD === 作業ツリー`になり測る節が全滅する。**起動時に凍結した配信バイトへ実行時注入**が正解。

### 13-6. 残件

**§10「実機/実感の確認」5 項目**(ユーザーの iPhone 実機待ち)。

1. iOS Safari 縦持ちで 敗北 → 酒場 → レポートを開く → 閉じる が**片手で**通るか
2. 年代記が「読み物」になっているか(数字の羅列に見えないか)
3. 墨の棒グラフが羊皮紙の斑に食われていないか(⚠ #15: 説明文に `opacity` は禁止)
4. レポートを開いたままキャラクターシート(z:220)を開けるか
5. 記録棚に 5 件溜めたときの `localStorage` サイズの体感
   (数値は 13-5 に実測済 = 実プレイ 5 件 21,242 B)
