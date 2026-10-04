# #84 メイジハンドが実機で一度も出ない — 覚えていることを見せる + 檻に届かせる + 2 秒で消さない

- **起草**: 2026-10-03(起草窓) / **ステータス**: **承認済**(2026-10-03 ユーザー承認)
- **着手**: 2026-10-04 実装窓(dev-loop・4 項目)。#82 完了 `06ee666` の後
- **基準 HEAD**: `1a2859b`(⚠ 作業ツリーの `index.html` / `tavern.html` は実装窓の #82 が編集中。本書の行番号は **`git show HEAD:`** で測った値)/ **実装の基準は `06ee666`(§10-0)**
- **触るファイル**: `index.html`(2 行)/ `tavern.html`(引き出しに表示 1 行ぶん)/ `tools/verify_mage_hand_reach.js`(新規)/ 既存 golden の言い直し(要れば)
- ⛔ **着手の前提**(✅ 満たした — #82 は `06ee666` で完了・作業ツリー clean): **#82 の完了**。#82 が `index.html` / `tavern.html` を大きく書き換え中で、同じファイルを並走で触ると取り違えが起きる(`git add` のファイル単位でも防げない)
- 元のチケット: #80 `実装依頼書/2026-10-01_mage-hand.md`(完了 `36f4ba0`)

---

## 1. 目的

ユーザーが実機(盗賊の森・Lv7・主人公は魔法使いではない・**仲間に NPC の魔法使い**)で遊んだ報告:

> 「マジックハンド覚えたんだけど、出撃前にセット出来ないし、道中発動もしないね。」

調べると、原因が 4 つ重なっていた(§2)。設計どおりのもの(枠なし・檻は噂の判定しだい)と、実際の欠陥(普通に遊ぶと届かない・2 秒で消える)が混ざって、「覚えたのに何も起きない呪文」になっている。

**ユーザー決定(2026-10-03)**:

| 論点 | 採用 | 不採用 |
|---|---|---|
| 見せ方 | **出撃前の引き出しに「覚えている」ことを表示だけする**(押せない 1 行。セットは不要のまま) | 呪文枠に入れて選ばせる(#80 の「枠なし」を崩す) |
| ダイアログの待ち方 | **押すまで待つ**(戦闘は止まったまま。オートプレイの検証だけは今までどおり 1 番目を自動で選ぶ) | 2 秒で自動で消える(今)/ 8 秒 |
| 檻への届きやすさ | **戦闘中の射程を 6 → 12 マス** | 9 マス(実測で 5/5 届く最小値)/ アジトに入ったら距離を問わず 1 回聞く |
| 自分から唱える場面 | **別チケット**(#80 の「案 B = 新しいレバー仕掛け」。地図に置き場を設計する分だけ大きい) | 本チケットに混ぜる |

---

## 2. 着手前の実測(基準 HEAD `1a2859b`)

### 2-1. 原因の内訳(⭐ 4 つ。どれか 1 つでも当たると「何も起きない」)

| # | 原因 | 根拠 | 本チケット |
|---|---|---|---|
| A | **枠を使わない初級呪文なので、出撃前の装備欄に出ない**(#80 の設計)。覚えたかどうかが画面のどこにも出ない | #80 §2-3 罠A: `MAGE_SKILLS_UI` に足すと MP の有無で「技」か「呪文枠」に振り分けられて漏れる ⇒ 表に入れていない | **直す**(表示だけ) |
| B | **檻そのものが、酒場の噂の判定(DC12)に成功したときだけ湧く**。失敗した回は檻 0 個 = メイジハンドは原理的に出ない | `index.html:11308-11309` の `["shadowBeast", 55, 8, "s2_beast_intel"]` / `cages: [{ … flag: "s2_beast_intel" … }]`。ユーザーは「北の奥の檻の獣を見ていない」と回答 ⇒ 今回はこれに当たった可能性が高い | **直さない**(隠し要素の設計 = `shadow-beast.md`) |
| C | **戦闘前の口(12 マス + 視線)は、普通のプレイで一度も成立しない**。戦闘中の口(6 マス)も 5 回中 3 回だけ | §2-2 の実測 | **直す**(戦闘中 12 マス) |
| D | ⚠ **ダイアログが 2 秒で勝手に「触らない」で閉じる**。しかも同じ檻へ同じ口からは二度と聞かない(`t._handAsked[gate] = true` を**聞く前に**立てる) | `offerMageHand` の `showCharChoice(…, { autoSkipMs: SkillCheck.AUTO_ROLL_MS })`(HEAD `index.html:24868`)・`AUTO_ROLL_MS = 2000`(`js/skill-check.js:86`)・`showCharChoice` の `setTimeout(() => { cleanup(); resolve(null); }, autoSkipMs)` | **直す**(押すまで待つ) |

⭐ 罠の解除の口(`runTrapDisarmCheck` HEAD `:25730`)の「メイジハンドで解除する」は**もともと待つ**(`autoSkipMs` なし)。2 秒で消えるのは**檻・宝の山の口(`offerMageHand`)の 1 箇所だけ**。
⭐ もう 1 つの `autoSkipMs` の呼び口(HEAD `:14268` 召喚スクロール「召喚スクロールを使うか?」)は本チケットの対象外(⛔ 触らない)。

### 2-2. 実測 — 盗賊の森で魔法使いは檻にどこまで近づくか(2026-10-03・5 走行)

測定台: `tools/probe_magehand_reach.js`(起草で作成・本番は書き換えない。HEAD の配信物を `git show HEAD:` で配る)。酒場経由 `?autoplay=15&recruittalk=0`・主人公 Lv7(xp 21000)・魔法使いでない主人公 + **NPC の魔法使い 1 人**の 4 人・`knownSpells = {mage:["mage-hand"]}`・**噂は成功に固定**(原因 B を外すため)・上限 240 秒。

| 走行(主人公) | 結果 / 秒 | 最初の戦闘(主人公のマス) | 戦闘外の最小距離(檻が閉じていて生存) | ラウンドの頭の最小距離 | 聞かれた回数 | 魔法使いの死亡 |
|---|---|---|---|---|---|---|
| 0 戦士 | 敗北 143 | 32.6 秒 (24,15) | 7.0・視線あり(**主人公が倒れた瞬間** = 口は `hp<=0` で抜ける) | 7.0・視線あり | 0 | なし |
| 1 ドワーフ | 敗北 159 | 26.8 (22,15) | 20 前後・視線なし | 6.0 | 1(戦闘中) | なし |
| 2 盗賊 | クリア 160 | 26.2 (22,15) | 20 前後・視線なし | 6.0 | 1(戦闘中) | なし |
| 3 僧侶 | 敗北 159 | 29.9 (23,15) | 9.06・視線なし | 8.55 | 0 | なし |
| 4 エルフ | 敗北 150 | 26.2 (22,15) | 19.3・視線なし | 5.26 | 1(戦闘中) | 142 秒(戦闘中) |

- **戦闘外の口は 5 回とも成立しない**: 戦っていない間の魔法使いは x 35〜41(橋を越えた所)で止まり、x≈41〜48 の柵が視線を遮る。檻まで 12 マス以内で視線が通るタイルは全部 x≥48 にある(#80 受入 (1d) と一致)。⇒ **戦闘前の射程を伸ばしても効かない**
- 柵の内側へは**戦闘中に**入る(橋の最初の戦闘から野営地まで、実質 1 つの戦闘が続く)
- 戦闘中の口: 6 マスなら 3/5、**9 マスなら 5/5**、12 マスなら初めて 12 マス以内に入った時点(83〜113 秒)で 5/5
- ⚠ 実機では、聞かれても 2 秒で消える(原因 D)。オートプレイは 1 番目を即座に選ぶので、この測定台ではそこが見えない

**再測定コマンド**(⚠ 出力 `--out` はリポジトリの外へ。ポートは 10600〜10620 を使う):

    node tools/probe_magehand_reach.js --runs 5 --max 240 --workers 5 --port 10601 --out "$TMP/mh5.json"
    # --intel 0 で「噂に失敗 = 檻 0 個」も再現する

### 2-3. 直す場所(HEAD 基準・全数)

| ファイル:行(HEAD) | いま | 変更 |
|---|---|---|
| `index.html:13688` `MAGE_HAND` | `calmRangeTiles: 12, combatRangeTiles: 6` | `combatRangeTiles: 12`(⛔ calm は 12 のまま) |
| `index.html:24868` `offerMageHand` の `showCharChoice` | `{ autoSkipMs: (window.SkillCheck && SkillCheck.AUTO_ROLL_MS) \|\| 0 }` | 第 4 引数を外す(= 押すまで待つ)。⭐ オートプレイは `showCharChoice` 先頭の `if (window.__autoplay …)` で 1 番目を選ぶので影響なし |
| `tavern.html:9076` `pmRenderDrawer` の `magics.forEach(…)`(`:9160` / `:9162`)の直後 | — | 魔法使いのカードで `isSpellKnownTV("mage", "mage-hand")` なら、押せない 1 行「✋ メイジハンド — 枠なし・いつでも(檻のレバー・罠・怪しい宝箱に離れて触る)」を `#pmDrawerSkillList` の末尾へ |

⚠⚠ **罠 1 — 表示のために `MAGE_SKILLS_UI` に足すと必ず漏れる**(#80 罠A そのもの)。酒場は `mpCost` で「技」か「呪文枠」に振り分けるので、表に入れた瞬間に**装備できる技**か**枠を食う呪文**として並ぶ。⇒ 表を通さず、引き出しの組み立てに**専用の 1 行**を足す。§5 の変異 `handinpool`。

⚠ **罠 2 — `_handAsked[gate]` は聞く前に立つ**。待つようにしても「断ったら同じ口からは二度と聞かない」は**仕様のまま**(#80 §4-4)。⛔ 本チケットで「断っても後でまた聞く」にしない(戦闘のたびにダイアログが出る)。

### 2-4. 引き出しの一覧を数えているドライバ

`grep -l pmDrawerSkillList tools/*.js` = `verify_pm_drawer_fit.js:464` / `verify_prep_retire.js:609` の 2 本。**どちらも存在だけを見ていて行数を数えていない** ⇒ 1 行足しても壊れない(着手時に実走で確かめる)。
`verify_mage_hand.js` は `window.__ccHold` で `autoSkipMs` を**外してから**測っている(`:18` `:387`)⇒ 自動スキップを外しても壊れない。⚠ ただし射程 6 マスを前提にした仕込み(6 マス以内 / 外の境界)があれば言い直しが要る — 項目1 で `combatRange` / `6` を grep して表にする。

### 2-5. changelog の要否

`GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(§8)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `MAGE_HAND.combatRangeTiles` 6 → 12 / `offerMageHand` の自動スキップを外す |
| `tavern.html` | 引き出しに「メイジハンド(枠なし・いつでも)」の表示 1 行 / changelog |
| `tools/verify_mage_hand_reach.js` | 新規受入(port base は #82 完了時に決める) |

⛔ `MAGE_SKILLS` / `MAGE_SKILLS_UI` / 呪文枠 / 噂の判定(`s2_beast_intel`)/ 檻の位置 (55,8) / 召喚スクロールの自動スキップ / 罠の解除の口は触らない。

---

## 4. 撤退スイッチ

- 既存の **`?magehand=0`**(#80)で、手のダイアログは 1 つも出ない。本チケットの 3 点はすべて手が出るときだけの話なので、**新しいスイッチは足さない**
- ⭐ 表示の 1 行は `?magehand=0` でも出してよい(覚えている事実は変わらない)— ⛔ ただし迷うなら出さない側に倒す(実装窓が決めてよい。§10 に書く)

---

## 5. 受入条件 — `tools/verify_mage_hand_reach.js`(新規)

方針: ① 表示は酒場の引き出しを実際に開いて DOM で見る ② 射程は本番の `offerMageHand` を、魔法使いと檻の距離を変えた仕込みで呼んで見る ③ 待ちは **`__autoplay` を切った**ページで `showCharChoice` を開かせ、時間が経っても閉じないことを見る ④ 普通のプレイでの到達は §2-2 の測定台で**報告**する(assert しない)。

### §0 装置
- **(0a)** 噂を成功に固定した森で檻が 1 個・中に獣が居る(⭐ 原因 B で 0 個だと全部空振り)
- **(0b)** 魔法使いの仲間が 1 人居て、`isSpellKnown("mage","mage-hand")` が真

### §1 表示
- **(1a)** 覚えている + 魔法使いのカードの引き出し → `#pmDrawerSkillList` に「メイジハンド」の行が 1 つ・押しても何も起きない(枠の数も `selection.partySkills` も変わらない)
- **(1b)** 覚えていない → 行が無い / 魔法使い以外のカード → 行が無い
- **(1c)** 呪文枠の表示(± 欄)と技の一覧の**件数が、覚える前と後で同じ**(⭐ 罠 1 の検出)

### §2 射程
- **(2a)** 戦闘中・魔法使いと檻が 11 マス + 視線あり → 聞かれる / 13 マス → 聞かれない
- **(2b)** 戦闘前の射程は 12 マスのまま(13 マスで聞かれない)

### §3 待つ
- **(3a)** `__autoplay` を切ったページで檻のダイアログを出し、**5 秒待っても開いたまま**(今は 2 秒で閉じる)
- **(3b)** 「触らない」を押すと閉じ、同じ口からは二度と聞かない(罠 2 = 仕様のまま)
- **(3c)** オートプレイのページでは今までどおり 1 番目を即座に選ぶ

### §4 非退行
- `verify_mage_hand`(#80・32 assert・`--negative` 12)/ `verify_pm_drawer_fit` / `verify_prep_retire` / `driver_trap_disarm`
- ⭐ §2-2 の測定台を N=5 で回し、**戦闘中に聞かれた回数が 5/5** になったことを §10 へ報告

### 負のコントロール(`--negative`)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `handinpool` | ⭐ 罠 1: 表示のために `MAGE_SKILLS_UI` へ足す | (1c) |
| `autoskip` | 自動スキップを戻す | (3a) |
| `range6` | 戦闘中の射程を 6 へ戻す | (2a) |
| `calm13` | 戦闘前の射程まで伸ばす | (2b) |
| `asklater` | 断った後も同じ口から聞く | (3b) |
| `showall` | 覚えていなくても行を出す | (1b) |

---

## 6. 実機/実感の確認

- 噂に成功した回の盗賊の森で、野営地に踏み込んだあたりで「メイジハンドで、離れた所から倒すか?」が出て、押すまで待ってくれるか
- 引き出しの 1 行で「覚えている・セット不要」と伝わるか

---

## 7. やらないこと

- ⛔ **自分から唱える場面を足す**(#80 の案 B「新しいレバー仕掛け」。器 `MAGE_HAND_TARGETS` に行を足せば 3 つの口に乗る)→ 別チケット
- ⛔ 噂に失敗しても檻を出す(隠し要素の設計を変える。変えたいならボールトの `shadow-beast.md` から)
- ⛔ 戦闘前の口の射程・視線の扱いを変える(伸ばしても柵で効かないと実測済み)
- ⛔ 召喚スクロールの 2 秒の自動スキップ

---

## 8. changelog(`index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>メイジハンドが使いやすく</b> — 覚えていると出撃前の画面に表示される。檻のレバーに手が届く距離が戦闘中も 12 マスに伸び、「触りますか?」は押すまで待つようになった。"

---

## 9. README へ足す行(承認後に起草窓が足す)

    | 84 | [2026-10-03_mage-hand-reach.md](2026-10-03_mage-hand-reach.md) | **承認済**(⏸ #82 完了待ち) | 0% | 実機でメイジハンドが一度も出ない。原因 4 つ = A 枠なしで画面に出ない / B 檻は噂の判定に成功した回だけ(仕様のまま)/ C 戦闘前の口は普通のプレイで 0/5・戦闘中 6 マスは 3/5 / D ダイアログが 2 秒で消えて二度と聞かない。直す = 引き出しに表示 1 行(⛔ `MAGE_SKILLS_UI` に足さない)・戦闘中 12 マス・押すまで待つ。撤退は既存 `?magehand=0` |

---

## 10. 実装結果

(実装窓が埋める)

### 10-0. 着手前の実測(項目1・2026-10-04・基準 HEAD `06ee666`)

- 作業ツリー clean・本番(`index.html` / `tavern.html` / `audio.js` / `js/*`)は 1 バイトも触っていない。測定中に起草窓が `09b729d` を積んだ(**`実装依頼書/2026-10-04_tower-mother-b.md` の新規 1 本だけ = docs のみ**。`git diff --name-status 06ee666 09b729d` で確認)⇒ 配信物は `06ee666` と同一なので基準は `06ee666` のまま。
- 作業物は scratchpad `…/8952464a-dc76-4a52-9528-5d559bedff3f/scratchpad/item1/`。

#### (1) 行番号の訂正表(`git show 06ee666:` で測定。中身は `1a2859b` と同一 — `git diff 1a2859b 06ee666` はこの区域を 1 行も触らない)

| 対象 | §2 の値(`1a2859b`) | `06ee666` |
|---|---|---|
| `MAGE_HAND` 定義 `calmRangeTiles: 12, combatRangeTiles: 6` | `index.html:13688` | **`:13888`**(射程の注記 `:13884-13886`「戦闘中 6 マス (= 5e の 30 ft)」) |
| `calmRangeTiles` / `combatRangeTiles` の参照(全数 2) | — | `:25179` `tryMageHandCalm` → `"calm"` / `:25185` `tryMageHandInCombat` → `"combat"`。戦闘中の口の呼び口は `:22113`(ラウンドの頭・注記 `:22110`「射程 6 マス」)、`:25182` の注記も「射程 6 マス」 |
| `offerMageHand` 本体 / `t._handAsked[gate] = true` | — | `:25132` / **`:25147`(`showCharChoice` より前 = 聞く前に立つ・§2-3 罠 2 どおり)** |
| `offerMageHand` の `showCharChoice` + `{ autoSkipMs: … }` | `:24868` | **`:25152-25153`**(次の行 `:25155` が `if (pick !== 0) return false;`) |
| `showCharChoice` 本体 / `__autoplay` で 1 番目を即決 / 自動スキップの `setTimeout` | — | `:14614` / `:14616-14619` / `:14682-14685` |
| `AUTO_ROLL_MS = 2000` | `js/skill-check.js:86` | 同じ(`:504` で公開) |
| `autoSkipMs` を渡す呼び口(全数) | 2 | **2**: 召喚 `:14467-14468`(⛔ 触らない)/ 手 `:25152-25153`。他の `showCharChoice` 呼び口 11 箇所(`:17625` `:24959` `:24967` `:25303` `:25405` `:25539` `:26041` `:26473` `:26773` `:27195` `:37202`)は渡していない。`js/*` / `audio.js` / `tavern.html` に `autoSkipMs` は 0 件 |
| `runTrapDisarmCheck` / 手の 2 択 | `:25730` | `:26015` / `:26041-26042`(`autoSkipMs` なし = もともと待つ) |
| 檻の行 `s2_beast_intel` | `:11308-11309` | `:11508-11509` |
| `?magehand=0` の読み口 | — | `index.html:13879-13882` `isMageHandOn` だけ(→ K5) |
| `pmRenderDrawer` | `tavern.html:9076` | **`:9114`**。`listEl.id = "pmDrawerSkillList"` `:9187` / `magics` `:9189` / `magics.forEach` **`:9198`(魔法職)/ `:9200`(それ以外)** / `skillSec` へ付けるのは `:9203-9205` |
| `isSpellKnownTV` | — | `:5477`(`DEFAULT_KNOWN_TV` `:5414` に `mage` キーが在る ⇒ `isSpellKnownTV("mage","mage-hand")` は未習得で false になる = ゲートとして使える) |

#### (2) 崩れ(K1〜K9)

- **K1** 行番号は上表のとおり移動(`index.html` +200 / `tavern.html` +38)。中身は同一 ⇒ §2-3 の 3 点はそのまま成立する(直す 3 点に構造上の支障なし)。
- **K2** ⚠ §2-4「`verify_mage_hand` は `__ccHold` で `autoSkipMs` を外してから測る ⇒ 自動スキップを外しても壊れない」は**押す腕だけの話**。押さない腕(`:557` (2b) の注記「押さない腕 = 自動スキップのまま」)は 2 秒の自動スキップで `offerMageHand` が返る前提。素では押さない腕にダイアログは出ない(0 件を測る)ので緑のままだが、**ダイアログを出してしまう変異の腕**(`nogate` の (0c) `:551` `await offerMageHand('calm', 12)` / `nolos`・`cageold` の (2b) `:566` / `rollbackleak` の (11a) `:771-779`)と、(a) 後の **(3b) の素**は、待つようになると `page.evaluate` が返らない(またはダイアログが開いたまま `mageHandBusy` が立ち続け、同じページの後段が別の理由で赤くなる)。⇒ 項目2/3 でドライバ側に「押さない腕のダイアログを閉じる装置」(包み側で明示の `autoSkipMs` を渡す / 「触らない」を押す)を足し、担当表を実走で取り直すこと。
- **K3** ⚠ `verify_mage_hand` **(9b)**(`:932-940`)は「読んだ後の引き出しに『メイジハンド』が**出ない**」を測っている = (c) と正面から逆。⇒ 「`MAGE_SKILLS_UI` に無い・技 / 呪文の行(`.skillItem` / `.spellCountItem`)に無い・表示の 1 行がちょうど 1 つ」へ言い直す。変異 `handinpool`(`:172-174`・担当 (9b) `:218`)が言い直し後も赤くなることを確かめる。
- **K4** ⚠ `verify_mage_hand` **(3b)**(`:617-628`)は「戦闘中の口は 6 マス超・12 マス以内では出ない」= (a) と逆。⇒ 12 マス境界(11 / 13)へ言い直す。変異 **`combatfar`**(`:187-190`「戦闘中も calmRangeTiles で聞く」)は (a) 後 calm = combat = 12 で**挙動が変わらない = 空振り**(注入行は鳴るので exit 1)⇒ 定義し直しが要る(新ドライバの `range6` / `calm13` と同型へ)。ヘッダ `:41` `:43`(≤6 / 7〜12 マス)と (3a) の文言も。
- **K5** `tavern.html` には `?magehand=0` の読み口が無い(`magehand` の語は棚の巻物 1 行だけ)。§4 の「迷うなら出さない側」を採るなら酒場側に読み口を新設することになる(⛔ 既存の `isEyeOnTV` 型を写す)。出す側なら何も要らない。
- **K6** §2-4「`pmDrawerSkillList` を見るのは 2 本・存在だけ」は正しい(`verify_pm_drawer_fit.js:464` / `verify_prep_retire.js:609`)。ただし引き出しの **`.skillItem` を数える本**が別に在る: `verify_member_identity.js:400`・`verify_party_match_setup.js:541` `:1102` `:1129`。どれもメイジハンドを覚えさせない ⇒ 1 行は出ず影響なし。⭐ 表示の 1 行は `.skillItem` / `.spellCountItem` を付けない専用の class にする(数える本と (1c) を汚さない)。
- **K7** 変異アンカーと変更区域: 変更する行そのもの(`index.html:13888` / `:25152-25153` / `tavern.html` の `:9198-9200` 直後)に掛かるアンカーは **0**(`tools/*.js` 162 本の全文で各行を突き合わせた)。隣接は 3 つ — `verify_mage_hand` の `slotburn` `:169`(`index.html:25155` `if (pick !== 0) return false;`。(b) の直後の行 = 消さない・重複させない)/ 同 `combatfar` `:189`(`:25185`。K4)/ `verify_member_identity` の `lvhero` `:117`・`capfromhero` `:121`(`tavern.html:9194` `:9195`。範囲 `pmRenderDrawer` の中で**ちょうど 1 行**を要求 ⇒ (c) で同じ行を複製しない)。
- **K8** §2-2 の測定台を `06ee666` 相当(配信 = `09b729d` の HEAD blob = `06ee666` と同一)で N=5: **戦闘中に聞かれた 2/5**(§2-2 は 3/5)。さらに**戦闘外の口が 2/5 で成立**した(走行 2・3。野営地の戦闘が終わった後 = クリアの直前 133 / 161 秒に、柵の内側で魔法使い 7.0 マス・視線あり)⇒ §2-2「戦闘外の口は 5 回とも成立しない」は崩れたが、出るのは敵を倒し切った後なので実用上の結論(戦闘前の口では檻に届かない)は変わらない。⚠ 測定台の「主人公」(`*` = `isHero`)と `leaderClassKey` が 3/5 で違う(走行 2・4 = warrior / 走行 3 = dwarf が先頭)。
- **K9** フレーク(着手前の色として控える): `verify_pm_drawer_fit` の **(5d)**(開いて閉じるだけで localStorage が変わる)が素 r1 で赤・r2 で緑・`--negative` の `norestore` 腕でも漏れ(post82 は緑)。`verify_mage_hand --negative` の **`escapeon` が (3a)(3c)(6a) へ漏れ**て exit 1(= #80 K26 の揺れ)→ `--only escapeon` の単独再走は 32/32・担当どおり exit 0。

#### (3) 名指し golden の着手前の色(本番の作業ツリー・直列・既定ポート)

| 本 | 素 r1 | 素 r2 | `--negative` |
|---|---|---|---|
| `verify_mage_hand` | exit 0・32/32(142 秒) | exit 0・32/32 | **exit 1**(11/12・`escapeon` の漏れ = K9)/ 単独再走 `--only escapeon` exit 0 |
| `verify_pm_drawer_fit` | **exit 1**・74/79・PENDING 4((5d) = K9) | exit 0・75/79・PENDING 4 | exit 0(9 本すべて担当が赤・空振り 0) |
| `verify_prep_retire` | exit 0・30/30 | exit 0・30/30 | exit 0(12 本すべて担当が赤) |
| `driver_trap_disarm` | exit 0・44/44 | exit 0・44/44 | (`--negative` なし) |

#### (4) 項目2 で赤くなる既存 golden の予告表(`combatRangeTiles` / `calmRangeTiles` / `autoSkipMs` / `AUTO_ROLL_MS` / `__ccHold` / `pmDrawerSkillList` / `offerMageHand` / `mage-hand` + `メイジハンド` / `showCharChoice` / `.skillItem` で grep し、中身を読んで判定)

| ファイル:行 | 前提にしていること | 項目2 後 |
|---|---|---|
| `verify_mage_hand.js:617-628` (3b) | 戦闘中 6 マス超・12 以内で出ない | **赤**(+ ダイアログが閉じず evaluate が返らない恐れ・同じページの (3a)(3c)(6a) へ連鎖しうる)→ K4 |
| `verify_mage_hand.js:187-190` `combatfar` / `:224` | 戦闘中と戦闘前の射程が違う | **空振り**(exit 1)→ K4 |
| `verify_mage_hand.js:932-940` (9b) / `:172-174` `handinpool` / `:218` | 引き出しにメイジハンドが出ない | **赤**(素)→ K3 |
| `verify_mage_hand.js:549-575` (0c)(2b)・`:771-779` (11a)・ヘッダ `:18-19` | 押さない腕のダイアログは 2 秒で閉じる | 素は緑のまま / **変異 `nogate`・`nolos`・`cageold`・`rollbackleak` の腕が返らない・担当が動く** → K2 |
| `verify_mage_hand.js` ヘッダ `:41` `:43`・(3a) の文言 `:661` | 「≤6 マス」「7〜12 マス」 | 文言の言い直し(判定は (3a) = 5 マスで緑のまま) |
| `driver_scroll_autoskip.js:11-14` `:103-150` | `AUTO_ROLL_MS === 2000`・`showCharChoice` の `autoSkipMs` の機構(直に呼ぶ) | 緑のまま(機構と召喚の口は残る)。⭐ 項目2 の名指しに足すとよい |
| `verify_pm_drawer_fit.js:464` / `verify_prep_retire.js:609` | `#pmDrawerSkillList` の存在だけ | 緑のまま |
| `verify_member_identity.js:117` `:121`(アンカー)/ `:400`・`verify_party_match_setup.js:541` `:1102` `:1129`(`.skillItem` の数) | アンカー 1 行一致 / メイジハンド未習得 | 緑のまま(K6・K7 の条件つき) |
| `verify_scroll_shelf.js:169` / `driver_choice_logslot.js:184` / `verify_road_ambush.js:941`・`verify_road_boon.js:648`・`verify_road_events.js:697` | 巻物 id の並び / 注記だけ | 緑のまま |
| `probe_magehand_reach.js` | 測定台(母集団外) | 項目4 で N=5 を再測(待つようになってもオートプレイは即決) |

#### (5) 測定台 N=5(`node tools/probe_magehand_reach.js --runs 5 --max 240 --workers 5 --port 10601`・出力 = scratchpad `item1/mh5_pre.json`・`git status` clean のまま)

| 走行(`*` 主人公 / 先頭) | 結果 / 秒 | 最初の戦闘 | ラウンドの頭の最小距離 | 聞かれた(戦闘中 / 戦闘外) | 魔法使いの死亡 |
|---|---|---|---|---|---|
| 0 戦士 / 戦士 | クリア 142 | 32.3 秒 (24,15) | 5.61・視線あり | **1** / 0 | なし |
| 1 ドワーフ / ドワーフ | 敗北 158 | 26.0 (22,15) | 8.06・視線なし | 0 / 0 | 145.8 秒(戦闘中) |
| 2 盗賊 / 戦士 | クリア 134 | 32.9 (24,15) | 7.0・視線あり | 0 / **1**(133 秒) | なし |
| 3 僧侶 / ドワーフ | クリア 161 | 26.0 (22,15) | 7.0・視線あり | 0 / **1**(161 秒) | なし |
| 4 エルフ / 戦士 | 敗北 157 | 30.5 (24,15) | 4.88・視線あり | **1** / 0 | なし |

⇒ 戦闘中 **2/5**(§2-2 は 3/5)。ラウンドの頭で 12 マス以内 + 視線ありは 4/5(走行 1 は視線なし)= 項目2 後の期待は 4〜5/5。

#### (6) 母集団の着手前の色(流用)

- 母集団 = `index.html` / `tavern.html` を読む既存ドライバ(#82 の 160 本 183 腕 + `verify_tower_mother` 2 腕 = 185 腕)。
- `b89a5c5..06ee666` の配信物の差は 3 点だけ: ① ワイバーン 2 種の `bodyRatioY`/`bodyOffY`(塔の母でだけ湧く)② `LORE_SKILL_OF` / `LORE_CR` にワイバーン 2 行 ③ `tavern.html` の changelog の #82 行の書き換え。ツールの差は `driver_wallbox` / `verify_lore_check` / `verify_swamp_novice`。
  - ①② を読む腕 = `ENEMY_TYPES` を全数で回す本・伝承の表・塔の母 = `driver_wallbox` / `driver_mine_wall` / `driver_speech_v2` / `driver_trap_weaponize` / `verify_enemy_name_label` / `verify_enemy_traits` / `verify_lore_check` / `verify_swamp_novice` / `verify_tower_mother` / `verify_walk_block` の**全腕が #82 の `fix82`(直した後 = `06ee666` 相当)で再走済み**。他に `tower-mother` を名指す `driver_mapeditor_painting` / `verify_dragon_fold` / `verify_quest_walk` / `verify_road_ambush` / `probe_s5s6_clear` は、読むのがテーマ一覧・湧きの種類表・拠点・`?tower=0` の地図・S5/S6 の伝承 = ①②③に触れない(構造)。
  - ③ は changelog の文字列を読む本 0 本(`changelogBox`/`changelogList` の grep 0 件)。`#changelogBox` は `position:absolute` なので他の要素の配置は動かさず、覆う範囲だけが問題 ⇒ `b89a5c5` と `06ee666` の `tavern.html` を同じ配信で 7 画面(1280x800 / 1024x768 / 1366x768 / 844x390 / 390x844 / 375x667 / 414x896)開いて**矩形が全画面で完全一致**(PC は max-height で頭打ち・縦持ちは畳まれている。中の `scrollHeight` だけ 326→343)。
  - ⇒ **流用可**。合成 = `post82.tsv`(`b89a5c5`)を `fix82.tsv` の 15 腕(`pre_` を除く)で置換 + `extra82.tsv` の `--negative` 14 腕(`pre_` を除く)。
- 合成した **`item1/pre84.tsv`(列は `post82.tsv` と同じ・出所は `pre84_src.tsv`)= 200 腕・緑 179 / 非緑 21**。内訳: 母集団 185 腕 = **緑 168 / 非緑 17**(既知の赤・使い方ガード・調査の道具・揺れ = #82 §12-3 の分類のまま)/ 追加の `--negative` 15 腕 = 緑 11 / 非緑 4(`verify_swamp_novice` `nostart`・`verify_fort_fold` `addn6`・`verify_swamp_fold` `entryn0` のアンカー腐敗 exit 3 と `probe_s2_clear` `wipeblind` の空振り exit 1 = #82 K27)。実走し直した腕は 0。
- ⚠ 上の (3) の名指しの色は本項で実走した値。`pre84.tsv` の同じ腕(`post82`)は `verify_pm_drawer_fit` 素 exit 0・`verify_mage_hand --negative` exit 0 ⇒ 違いは K9 の揺れ。

### 10-1. 本番実装(項目2・2026-10-04・基準 `ba2d4e7` = 配信物は `06ee666` と同一)

#### (1) diff の要約(行番号は実装後)

| ファイル:行 | 変更 |
|---|---|
| `index.html:13888` `MAGE_HAND` | `combatRangeTiles: 6` → **`12`**(`calmRangeTiles: 12` は不変) |
| `index.html:25152` `offerMageHand` | `showCharChoice(…, "触らない (Esc)", { autoSkipMs: … })` の 2 行 → 第 4 引数なしの 1 行(**押すまで待つ**)。`_handAsked[gate] = true` は `:25147`(聞く前)のまま = 罠 2 は仕様どおり。次の行 `if (pick !== 0) return false;` は `:25154`(1 行上へ詰まっただけ・複製なし) |
| `index.html:13886` `:22110` `:25181`(注記) | 「戦闘中 6 マス」→「12 マス・#84」(コメントのみ。⚠ 指示の「3 点 + changelog 以外 1 バイトも変えない」からの逸脱 **D1**: 嘘になる注記を残さないため。この 3 行をアンカーに持つツールは 0 本(`tools/*.js` `*.py` を grep)) |
| `tavern.html:2328-2329`(CSS) | `#pmDrawer .pmDrawerInnateRow`(全幅 `grid-column: 1 / -1`・点線枠・`cursor: default`・`user-select: none`・色は既存 `#cbbd98`)+ 注記 1 行 |
| `tavern.html:9204-9214` `pmRenderDrawer` | `magics.forEach` の if/else の直後: `classKey === "mage" && isSpellKnownTV("mage","mage-hand")` のとき `<div class="pmDrawerInnateRow" id="pmDrawerMageHand">✋ メイジハンド — 枠なし・いつでも(檻のレバー・罠・怪しい宝箱に離れて触る)</div>` を `#pmDrawerSkillList` の末尾へ。`.skillItem` / `.spellCountItem` なし・ハンドラなし。`MAGE_SKILLS` / `MAGE_SKILLS_UI` / 呪文枠は不変 |
| `tavern.html:3335` changelog | §8 の 1 行を先頭へ(最古の「魔法の眼の巻物を追加」を落とした = 4 件維持) |

- 差分の削除行の全数(`git diff -U0` の `-` 行): `index.html` 6 行 = 上の (a) 1 + (b) 2 + 注記 3 / `tavern.html` 1 行 = changelog の最古行。これ以外の行は 1 バイトも変えていない。
- 改行: `index.html` CRLF 40965・LF のみ 0 / `tavern.html` CRLF 11279・LF のみ 0(`py` のバイト数え)。
- ⭐ 召喚スクロールの `autoSkipMs`(`:14467-14468`)・罠の解除の口(`runTrapDisarmCheck`)・`showCharChoice` 本体は触っていない(`driver_scroll_autoskip` 9/9 で機構が残ることを確認)。

#### (2) K5 の決定(orchestrator)

表示の 1 行は **`?magehand=0` でも出す**。tavern に新しい URL の読み口は作らない。理由 = 覚えている事実は撤退しても変わらない / 撤退スイッチ `?magehand=0` が止めるのは手のダイアログ(`index.html` の `isMageHandOn`)で、表示の 1 行は押せず何も起こさない = 無害。実測: `tavern.html?magehand=0` で覚えた魔法使いの引き出しに 1 行出る。

#### (3) 既存 golden の言い直し(`tools/verify_mage_hand.js`・⛔ assert は緩めていない)

| 何を | → 何へ | 理由 |
|---|---|---|
| (3b) 戦闘中は 6 マス超・12 マス以内(視線あり)で出ない | **12 マス境界**: 12 マス超で最も近い視線ありの床(実測 (47,17) 12.04)では出ない・`_handAsked.combat` も立たない / 12 マス以内で最も遠い視線ありの床(≥10.5・実測 (58,19) 11.4)では**ちょうど 1 回出る**・鍵が立つ。出ない側を先に測る(出た側の鍵が残ると射程と無関係に素通り = 永久緑) | (a) と逆向き(K4) |
| 変異 `combatfar`(戦闘中も calm の射程で聞く) | **`combat6`**(戦闘中の射程を #80 の 6 マスへ戻す・担当 (3b)・アンカー行は同じ `return offerMageHand("combat", …)`) | (a) 後は calm = combat = 12 で空振り(K4)。⚠ キー名を変えた(ポートは並び順で同じ 10521) |
| (9b) 引き出しに「メイジハンド」が出ない | `MAGE_SKILLS_UI` に無い・`.skillItem` / `.spellCountItem` に「メイジハンド」0・`#pmDrawerSkillList .pmDrawerInnateRow` がちょうど 1 で技/呪文の class を持たない・引き出しの「メイジハンド」は 1 回だけ・その行を押しても `selection.partySkills` と引き出しが変わらない・対照「スリープ」は出る | (c) と逆向き(K3)。守るのは #80 罠A(技 / 枠への漏れ)。`handinpool` は言い直し後も (9b) だけが赤 |
| 押さない腕(包み `INSTALL` の `showCharChoice`) | `__ccHold` が偽の腕で、取り消しが「触らない (Esc)」(= 手のダイアログだけ。`index.html` で 1 箇所)のとき、ドライバが明示の `autoSkipMs = window.__ccAutoClose`(既定 2000)を渡して閉じる。押す腕と罠の 2 択には掛けない | 本番に自動スキップが無くなり、変異で出てしまう腕と (3b) の出る側が閉じない(K2) |
| ヘッダ :18-19 / :41 / :43 / (9b) の説明 / (3a) の文言 | 新仕様へ(≤6 → 3〜5 マス = 仕込みの実距離)+ #84 の言い直しの段落 | — |

#### (4) 担当表の取り直し(実走)

`verify_mage_hand --negative`(1886.8 秒): 11/12 が担当と完全一致。`escapeon` だけ (3a)(3c)(6a) へ漏れて exit 1 = **着手前と同じ揺れ**(K9・#80 K26。漏れた腕の (3a) は `opened:true / asked:["calm"]` = 戦闘の前に自然脱走で開いていた = 手の変更と無関係)→ `--negative --only escapeon` 単独で (4a) だけが赤・exit 0。

| 変異 | 担当(赤) | 注入行の実行 |
|---|---|---|
| nogate | (0c)(5c)(7d)(10a) | 7 |
| slotburn | (6a) | 4 |
| handinpool | (9b) | 2 |
| cageold | (0b)(1a)(1d)(2b)(2c)(3a)(3c)(6a) | 9 |
| escapeon | (4a)(単独再走) | 7 |
| escapeall | (1c)(4b) | 1 |
| **combat6**(旧 combatfar) | (3b) | 6 |
| nolos | (2b) | 1 |
| fumblehurts | (7b) | 1 |
| trapchoice | (7d)(11a) | 4 |
| eyechainoff | (5a)(6a) | 3 |
| rollbackleak | (5c)(11a)(11b) | 10008 |

⇒ 集合は #80 の担当表と全部同じ(`combatfar` → `combat6` の名前だけ)。`NEG_EXPECT` / `NEG_PREDICTED` は書き換え不要だった(キー名のみ)。

#### (5) 検証

- 使い捨ての確認(scratchpad `item2/probe84.js`・port 10580・`__autoplay = 0`): 射程 `[12,12]` / 戦闘中・13.04 マス (54,21) で聞かない(鍵も立たない)/ 11.18 マス (50,18) で聞く → **5.8 秒後も `#choiceDialog.show`・`mageHandBusy`・`cage.dialogActive` が立ったまま** → 「触らない」で閉じ false・同じ口から再度聞かない(`_handAsked = ["combat"]`)/ 酒場: 未習得の魔法使い・僧侶 0 行 → 習得後 魔法使い 1 行(末尾・`cursor: default`・`grid-column: 1 / -1`・onclick なし)・僧侶 / エルフ / 戦士 0 行 / `?magehand=0` でも 1 行 / pageerror 0。
- 名指し golden(本番の作業ツリー・直列・既定ポート):

| 本 | 結果 |
|---|---|
| `verify_mage_hand` 素 | r1 exit 0・32/32(138.9 秒)/ r2 exit 0・32/32(140.6 秒) |
| `verify_mage_hand --negative` | exit 1(11/12・escapeon の揺れ = K9)→ `--only escapeon` exit 0 |
| `verify_pm_drawer_fit` 素 / `--negative` | exit 0・75/79・PENDING 4 / exit 0(9 本・空振り 0) |
| `verify_prep_retire` 素 / `--negative` | exit 0・30/30 / exit 0(12 本・空振り 0) |
| `driver_trap_disarm` 素 | exit 0・44/44 |
| `driver_scroll_autoskip` 素 | exit 0・9/9 |
| `verify_member_identity` 素 / `--negative --only lvhero,capfromhero` | exit 0・28/28(アンカー lvhero=9196 / capfromhero=9197 = CSS 2 行ぶん下がっただけ・範囲内ちょうど 1 行)/ exit 0(2/2) |

#### (6) 崩れ・逸脱

- **K10** 依頼書 §10-0 の「ヘッダ :41 の ≤6 マス」は (3a) の実際の仕込み(主人公の脇・檻から 3〜5 マス)の言い方だった ⇒ 判定は不変・文言だけ「3〜5 マス」へ。
- **K11** `#choiceDialog` は最初のダイアログまで DOM に無い(`getElementById` が null)⇒ 新しい受入で「開いたまま」を測るときは null を偽として扱うこと。
- **D1** 注記 3 行の書き換え(上表)。
- **D2** 変異キー `combatfar` → `combat6`(意味が変わったので名前も変えた。母集団の TSV は腕 = 本 + `--negative` 単位なので影響なし)。

### 10-2. 新規受入 + 測定台(項目3・2026-10-04・基準 HEAD `c7e60d1`)

- 本番(`index.html` / `tavern.html` / `audio.js` / `js/*`)は 1 バイトも触っていない。新規は `tools/verify_mage_hand_reach.js` だけ(LF・`.gitattributes` の `tools/*.js` 既定)。作業物は scratchpad `…/scratchpad/item3/`。

#### (1) `tools/verify_mage_hand_reach.js`(port **10548** 素 / 変異 **10549〜10554**)

| assert | 測り方 |
|---|---|
| (0a) [装置] | `sessionStorage dragonfighters.questFlags = {s2_beast_intel:true}`(酒場で噂に成功した後と同じ)で森 n7 に獣つきの檻がちょうど 1 つ・(55,8)・獣が同じタイル / 対照: `{s2_beast_intel:false}` で獣つきの檻 0 |
| (0b) [装置] | 魔法使いの仲間が居る(実走では自然に 1 人)・`isSpellKnown` 真・`mageHandCaster()` がその仲間・主人公は魔法使いでない・`__autoplay = 0`・静止 |
| (0c) [装置] | 全 5 ページ(index 3 + tavern 2)起動・pageerror 0 |
| (1a) | 覚えた魔法使いの引き出し: `#pmDrawerSkillList` に `#pmDrawerMageHand.pmDrawerInnateRow` が 1 つ・技 / 呪文の class なし・`onclick` なし・押しても `selection.partySkills`・見出し「スキル (n/m)」・± 欄の文字列が不変 |
| (1b) | 覚えていない魔法使い → 0 行 / 覚えている僧侶・エルフ・戦士 → 0 行(対照: 覚えた魔法使い 1 行) |
| (1c) | 魔法使い・僧侶・エルフで `.skillItem` / `.spellCountItem` の件数と並び・見出しが覚える前(localStorage なし)と後(`knownSpells = {mage:["mage-hand"]}` を読み込み前に焼く)で同じ |
| (2a) | 戦闘中の口 `tryMageHandInCombat`(`encounterActive` を同期区間だけ立てる): 12 < d ≤ 13 + 視線あり(実測 (58,20) 12.37)で聞かれない・鍵も立たない → 10.5〜11.5 + 視線あり((50,18) 11.18)で聞かれる。出ない側を先に測る |
| (2b) | 戦闘前の口 `tryMageHandCalm`(`gameStarted` を同期区間だけ立てる = 仲間は 1 tick も動かない): 同じ 2 点で 出ない / 出る |
| (3a) | `__autoplay = 0`・戦闘中の口・檻から 4 マス((51,8)): 0.4 秒で開いた(`#choiceDialog` が在って `.show`)ことを先に assert → 5.5 秒後も `.show`・口が返っていない・`mageHandBusy`・`cage.dialogActive`・`showCharChoice` の第 4 引数なし(argc 3) |
| (3b) | 戦闘前の口・4 マス: 聞かれる → 「触らない」をクリック → 閉じる・口が返る・檻は閉じたまま・鍵 calm → 同じ口をもう一度呼んでも聞かれない |
| (3c) | 別ページ・`window.__autoplay = 1`・戦闘中の口・4 マス: `showCharChoice` が 0ms で 0 を返す・`#choiceDialog` は DOM に一度も作られない・口が true・檻が開く・✋ 1 行 |

- 包みは `showCharChoice` を**記録だけ**する(⛔ 引数を変えない。`verify_mage_hand` の `__ccAutoClose` は持たない = 待つかどうかそのものを測る)。開いたダイアログは毎回ドライバが「触らない」を押して閉じる。
- (3a)(3b)(3c) は檻から 4 マスで測る = 射程の変異が漏れない。射程は (2a)(2b) だけが持つ。
- 罠E の自己検査は `tools/*.js` の他 162 本すべてを走査(重なり 0)。`handinpool` は `verify_mage_hand` と同じアンカー(`const MAGE_SKILLS_UI = [`)を避け、表の 1 行目(magic-missile)の行に前置する。

#### (2) 結果

| 走らせ方 | 結果 |
|---|---|
| 素 ×5(連続) | 5 回とも exit 0・**11/11 PASSED**・各 14.2 秒(揺れなし) |
| `--negative` ×2(連続) | 2 回とも exit 0「6 本すべて担当ラベルだけが赤くなりました」・各 96 秒 |
| `--negative --only range6,asklater` | exit 0(2/2) |

#### (3) 担当表(予測 vs 実測)

| 変異 | 注入(アンカー = 原本で 1 件) | 予測 (§5) | 実測の赤 | 注入行の実行 |
|---|---|---|---|---|
| handinpool | tavern `MAGE_SKILLS_UI` の magic-missile 行の前に mpCost 1 のメイジハンド | (1c) | (1c) | 2 |
| autoskip | index `offerMageHand` の `showCharChoice(…, "触らない (Esc)")` に `{autoSkipMs: AUTO_ROLL_MS}` | (3a) | (3a) | 5 |
| range6 | index `calmRangeTiles: 12, combatRangeTiles: 12 };` の combat をゲッター 6 に | (2a) | (2a) | 4 |
| calm13 | 同じ行の calm をゲッター 13 に | (2b) | (2b)(⚠ 初回は空振り → K12) | 4 |
| asklater | index `if (t._handAsked[gate]) continue;` を効かせない | (3b) | (3b) | 1 |
| showall | tavern `if (classKey === "mage" && isSpellKnownTV("mage", "mage-hand")) {` に「覚えていなくても」 | (1b) | (1b) | 1 |

⇒ 6 本とも予測どおり(K12 の測定点を直した後)。

#### (4) 測定台 N=5(`node tools/probe_magehand_reach.js --runs 5 --max 240 --workers 5 --port 10601`・配信 = `git show HEAD:` = `c7e60d1`・`git show HEAD:index.html` に `calmRangeTiles: 12, combatRangeTiles: 12 };` が 1 件 = 実装後を配っている・出力 scratchpad `item3/mh5_post.json`)

| 走行(主人公 / 先頭) | 結果 / 秒 | 聞かれた(戦闘中 / 外)・時刻・距離 | ラウンドの頭の最小距離 | 魔法使いの死亡 | 着手前 `mh5_pre`(戦闘中 / 外) |
|---|---|---|---|---|---|
| 0 戦士 / 戦士 | 敗北 157 | **1** / 0・139.7 秒・5.83・視線あり | 5.0 | なし | 1 / 0(5.75) |
| 1 ドワーフ / ドワーフ | クリア 124 | **1** / 0・106.4 秒・9.22・視線あり | 5.0 | なし | 0 / 0(視線なし・145.8 秒に死亡) |
| 2 盗賊 / 戦士 | クリア 124 | **1** / 0・100.0 秒・8.06・視線あり | 4.75 | なし | 0 / 1(クリア直前 133 秒) |
| 3 僧侶 / 戦士 | 敗北 156 | **1** / 0・124.4 秒・5.16・視線あり | 5.16 | 146.4 秒(聞かれた後) | 0 / 1(クリア直前 161 秒) |
| 4 エルフ / ドワーフ | クリア 174 | **1** / 0・138.5 秒・8.57・視線あり | 8.57 | 166.4 秒(聞かれた後) | 1 / 0(4.88) |

⇒ **戦闘中に聞かれた 5/5**(着手前 2/5)= §5 §4 の目標どおり。N=10 の追加は不要と判断。5 本とも聞かれた時点は魔法使いの生存中・最初の戦闘から続く野営地の戦闘の中。

#### (5) 崩れ

- **K12** §5 の (2a)(2b)「13 マス → 聞かれない」を d = 13.04((54,21)・項目2 の申し送りの値)で測ると、変異 `calm13`(戦闘前の射程を 13 へ)が **13.04 > 13 で聞かない = 空振り**(初回の `--negative` で exit 1)。⇒ 期待は変えず測定点を **12 < d ≤ 13 の床で 13 に最も近いもの**(実測 (58,20) 12.37)へ移した。森 n7 の檻からの視線ありの床は 12.37 の次が 13.04 = (12.37, 13] は空。
- **K13** 射程 12 マスでも、実際に聞かれる距離は 5.2〜9.2 マス(測定台 5 本)。柵が視線を遮るので「12 マス以内に入った瞬間」ではなく「柵の内側で視線が通った瞬間」に出る(§2-2「柵の内側へは戦闘中に入る」と同じ)。5 本中 3 本(9.22 / 8.06 / 8.57)は旧 6 マスでは届かない距離 ⇒ 12 への変更が 5/5 に効いている。
- **K14** 着手前に 2/5 あった「戦闘外の口」(クリア直前・柵の内側 7.0 マス)は実装後 0/5。戦闘中の口が先に聞いて鍵ではなく**檻を開けてしまう**(オートプレイは 1 番目 = 開ける)ため、戦闘外で聞く対象が残らない。実害なし。
- **K15** `.spellCountItem` の行は `.skillItem` も持つ(引き出しの魔法使いで skills = spells の 4 行)。(1c) は両方の件数と並びを比べているので重複は判定に影響しない。
