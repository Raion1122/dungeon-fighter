# #119 分かれ道で仲間が道を勧め、主人公が返事をする

- **起草**: 2026-11-22(計画窓) / **ステータス**: **承認済**(2026-11-22 ユーザー承認。時間切れ = `AUTO_ROLL_MS` の 2 秒のまま = 会議どおり・ユーザー判断)
- **前提**: #117 固定キャスト 12 人(`ad19da5`)・#118 気づいた本人が名前を呼ぶ(`3ccd5cb`)。どちらも着地・push 済み。`DFCast` の `voice` と、本体の `ally.castId` / `castVoiceText` / `fillVoice` を使う。
- **触るファイル**: `js/companion-cast.js` / `index.html` / `js/changelog.js` / `tools/verify_path_advice.js`(新規)/ `実装依頼書/README.md`
- ⛔ **触らないファイル**: `tavern.html` / `js/mercenary-roster.js`(酒場側の変更は 0 本。`castId` は #117 で既に本体へ届いている)
- 並走: 起草時の `git status` はクリーン・HEAD = `3ccd5cb`。並走している窓は無い。

---

## 1. 目的

今の分かれ道では、部屋が片付くと知覚判定が 1 回振られ、矢印の横の羊皮紙に「金属の匂いがする」などのヒントが出て、プレイヤーが矢印をタップして道を選びます。仲間は何も言いません。#117 で仲間が名前と口調を持つ 12 人になり、#118 で見つけた本人が話すようになったので、**分かれ道でも、気配を読み取った仲間が「東の道だ。風が抜けている。こっちに進もう」と勧め、主人公が返事を選べる**ようにします。

返事は 2 択です。「わかった、そっちに進もう」ならその道へ進み、「いや、自分で選ぶ」なら今の矢印が出ます。放っておくと「わかった」に倒れるので、ゲームは止まりません。判定がファンブルだった仲間は、**間違った道を自信満々に勧めます**(D&D らしい失敗)。

**ユーザー決定(2026-11-21 会議 `dev-meetings/2026-11-21_party-banter.md` 第 2 段 C 節・2026-11-22 着手指示)**:

- 採用 = 会議の候補 ③「仲間が道を勧め、主人公が返事をする」(#117 ④・#118 ② と合わせて 3 本に分けたうちの 3 本目)
- `?autoplay` / `?graph=auto` では勧めを**一切出さない**(既存ドライバ 49 本が `chooseExit` を通る)
- 時間切れは「わかった」。長さはロール判定の自動ロールと同じ `SkillCheck.AUTO_ROLL_MS`(数字を増やさない)
- ファンブルなら間違った道を勧める / 勧めは 1 部屋 1 回 / 返事の後に勧めた本人がひと言
- セリフは依頼書の段階で全文を書いて承認を取る(実装窓には書かせない)= §4
- 不採用 = 主人公が勧めること(主人公は返事をする側)・判定に失敗した仲間が「分からない」と言うこと(失敗のときは黙る = 羊皮紙のぼかした文だけ)

---

## 2. 着手前の実測(2026-11-22・HEAD `3ccd5cb`)

### 2-1. 分かれ道の流れ(呼び口の全数)

| ファイル:行 | 何 |
|---|---|
| `index.html:42589` | `tickNodeChoice` → `await revealExitHints(node)` → `chosen = await chooseExit(node)` → `commitExit(chosen)`。部屋が片付いた後に 400ms ごとの tick で入る |
| `index.html:41415` `chooseExit` | **出口選びの唯一の入口**。呼び口は 2 か所だけ(`:42590` 本編 / `:44385` 検証シーム `__graph.choose`)= リポジトリ全文 grep で実測 |
| `index.html:41418` | `if (RUN.auto) return opts[0];` ← `?graph=auto`。矢印もダイアログも出さない |
| `index.html:41429` | `if (!window.__autoplay) return await showExitArrows(node, opts);` ← **矢印の経路**。`?autoplay` はこの下のダイアログ経路へ落ちる |
| `index.html:41873` `revealExitHints` | 1 部屋 1 回だけ知覚判定を振り、`st.hintsRevealed = { rolled, tier, byExit }` に焼く。再入場では振り直さない(`:41877`)。魔法の眼(#79)を唱えたら判定せず `tier = "crit"` |
| `index.html:41830` `buildExitHint` | 出口 1 本ぶんのヒント `{ text, icon, kind, wrong, count }`。crit/success = 本当の kind / fail = `kind: null`(ぼかした文)/ **fumble = 別の kind の文(`wrong: true`)**。⚠ ボス行きの出口はファンブルでも嘘をつかず、fail と同じぼかした文になる |
| `index.html:41378` `exitsWithReturn` | 選択肢の並び = 未踏の出口 → 引き返す口(`back: true`)→ 訪れた出口。未発見の隠し扉は除く |

⇒ **勧めを差し込む場所は `:41429` の 1 行の中だけ**。この行の内側に置けば、`RUN.auto`(`:41418` で先に return)と `?autoplay`(この行の条件が偽)のどちらでも**構造的に 1 命令も走らない**。

### 2-2. ⚠⚠⚠ 罠 A — 選択肢を開いている間は吹き出しが出ない

`showCharChoice` / `showExitArrows` は `dialogPaused = true` を立てます。`moveEnemies`(`index.html:20614`)は `dialogPaused` で早めに return するので、`renderWorld` → `updateSpeechBubbles`(`:18225`)が毎フレームは回りません。**ダイアログが開いている間に `sayLine` で積んだ吹き出しは、閉じるまで表示されません**(行列で待ち、`SPEECH_STALE_MS = 6000` を過ぎると捨てられる)。

⇒ **勧めの文はダイアログの文面(`.choiceMessage`)に入れる**: `ファルケ「東の道だ。風が抜けている。こっちに進もう。」`。吹き出しにはしない。
⇒ 返事の後のひと言は吹き出しで出します。「わかった」の後はダイアログが閉じて歩き出すので普通に出ます。「自分で選ぶ」の後はすぐ矢印(`dialogPaused`)になるので、**`sayLine` の直後に `updateSpeechBubbles()` を 1 回直接呼んで**その場で出します(矢印を選ぶまで画面に残り、閉じた後のフレームで期限切れとして消える)。
⭐ §8 の変異 `bubble`。

### 2-3. ⚠⚠⚠ 罠 B — 時間切れは今は「キャンセル」になる

`showCharChoice`(`index.html:16213`)の `opts.autoSkipMs` は、時間切れで **`resolve(null)` = キャンセルボタンと同じ**です(`:16283`)。今の呼び口は召喚の 1 か所だけ(`:16064`「召喚しない」へ倒す)。今回は「わかった」(候補 0)へ倒したいので、**`opts.autoSkipTo`(時間切れで返す添字)を足します**。

⚠ 書き方の罠: `opts.autoSkipTo || null` と書くと、**添字 0 が偽なので null になります**(召喚と同じキャンセルへ倒れる = 黙って「自分で選ぶ」になる)。必ず `Number.isInteger(opts.autoSkipTo) ? opts.autoSkipTo : null` で読むこと。
⇒ 召喚の呼び口は `autoSkipTo` を渡さないので、今までどおり null(恒等)。
⭐ §8 の変異 `zero`。

### 2-4. ⚠⚠ 罠 C — 判定した本人は `res.rep`(写し)から直接は引けない

`revealExitHints` は `dfSkillCheck("perception", …, buildPerceptionParty(), …)` を振ります(`:41898`)。`buildPerceptionParty`(`:28683`)が返すのは**判定用の写し** `{ classKey, name, isHero?, skillBonus }` で、`castId` も本物の ally も持ちません(#118 の罠 A と同じ)。
⇒ #118 の探索判定(`:28828-28833`)と同じ作法で、**party と同じ瞬間に同じ並び**(生きている主人公 → 生きている仲間)の対応表 `unitOf` を作り、`unitOf.get(res.rep)` で本物を引きます。勧める人 = 本物の ally で `castId` があるときだけ(主人公・`castId` の無い仲間なら勧めない)。
⇒ 覚えておくのは **`castId` だけ**(`st.adviceBy`)。勧める瞬間に、その `castId` を持つ**生きている** ally を引き直します(判定から出口を選ぶまでの間に倒れていたら勧めない)。
⭐ §8 の変異 `copyrep`。

### 2-5. ⚠⚠ 罠 D — 勧める道は「見えているヒント」で選ぶ

ファンブルのとき、`buildExitHint` は本当の kind とは別の kind の文を出します(`wrong: true`)。勧める道を**本当の行き先の kind**(`RUN.byId[ex.to].kind`)で選ぶと、ファンブルでも正しい道を勧めてしまいます。
⇒ 勧める道は **`hintForExit(node, o).kind`(羊皮紙に出ている kind)** で選びます。こうすると「ファンブル = 自信満々に間違った道」が、特別な枝を書かなくても自然に起きます。fail では `kind` が null なので勧める道が無い = 黙ります。ボス行きの出口はファンブルでもぼかした文(`kind: null`)なので、**嘘の勧めでボス部屋へ誘い込むことは起きない**(`EXIT_HINT_WRONG_KINDS` の方針をそのまま守る)。
⭐ §8 の変異 `truekind`。⚠ ファンブルでは非ボスの出口が全部 `wrong: true` になるので、「勧めた道が `wrong`」を見るだけでは `truekind` を捕まえられません。**「勧めた道 = 見えている kind の順位がいちばん上」**を 2 経路で突き合わせ、さらに母集団ガード (0c) で「見えている順位と本当の順位が食い違う盤面」が 1 つ以上あることを確かめます。

### 2-6. ⚠ 罠 E — `DFCast.copyOf` は声の場面を名前で写す

`js/companion-cast.js:186-191` の `copyOf` は `voice: { trap, chest, door, lore, call }` を**場面ごとに名前で**写しています(#118 の罠 F)。新しい場面 `advise` / `yes` / `no` を表に足しても、`copyOf` に書き足さないと `byId()` の結果から**黙って消え**、勧めが一度も出ません。
⭐ §8 の変異 `copyof`。

### 2-7. 「1 部屋 1 回」は nodeState に覚える

「留まる」(Esc)を選ぶと `nodeChoiceCooldownUntil` の後に `tickNodeChoice` がもう一度 `chooseExit` を呼びます(`:42601`)。再入場でも同じ部屋の `chooseExit` が呼ばれます。
⇒ 勧めを出したら `st.adviceDone = true`(返事がどちらでも)。2 回目以降は矢印だけ。
⚠ `st.hintsRevealed` には書き足さない。`tools/driver_graph_arrows.js` が `JSON.stringify(g.hints())` を 7 か所で比べている(`:481` `:518` `:521` `:539-544` `:721` `:1082`)= 欄を足すと比較が動く。`adviceBy` / `adviceDone` は nodeState の**別の欄**に置く。
⭐ §8 の変異 `again`。

### 2-8. 既存ドライバへの影響

`castId` を持つ仲間がいないと勧めは出ません。`castId` は酒場がキャスト ON のときだけ付けます(#117)。

| ドライバ | 起動 | 分かれ道の通り方 | 勧めは出るか |
|---|---|---|---|
| `driver_graph_arrows` / `driver_graph_kinds` / `driver_graph_run` / `driver_graph_sce1` / `driver_grid_p9` / `driver_field_step6` | index.html 直起動(`castId` 無し) | 矢印 / `?autoplay` | 出ない(`castId` 無し) |
| `verify_egg_parent` / `verify_frost_hold` / `verify_silent_tomb` / `verify_witch_hut` | 手で組んだ `partyMembers`(`castId` の grep = 0 件) | 矢印を Esc | 出ない |
| `probe_party_size` | 酒場から出発(`castId` が付く) | `RUN.auto = true`(`:864`) | 出ない(`:41418` で先に return) |
| `verify_banter_callouts` / `verify_companion_cast` | `castId` 入り | `?autoplay=15` で起動・`chooseExit` を通らない | 出ない |

⇒ どの既存ドライバでも勧めは出ません。ただし `showCharChoice` に手が入るので、召喚の自動スキップを含む非退行を §8 で走らせます。

### 2-9. 文面の差し込み

- `{dir}` = 方角の 1 語。新しい表 `ADVICE_DIR_WORD = { up: "奥", down: "手前", left: "西", right: "東" }`(`DIR_LABELS` は「東へ進む」= 動詞まで入っていて文に入らない)
- `{hint}` = その出口の `hint.text` から **` — ` の手前**だけ(crit の「— 3 体ばかりの気配だ」を落とす)。末尾の「。」も落とす
- ヒント文の実測: 既定表 `EXIT_HINTS` の sure 文 9 本と、著者が書いた `hint.text` 8 本(`grep -rhoE 'hint: *\{ *text: *"[^"]*"'`)。いちばん長いのは「北の石段が、霧の向こうの祠へ続いている」(19 文字)。**「。」で終わるものは 0 本**
- `{hint}` の後ろに「わい」「ぞ」「ぜ」「っす」「だろうよ」を付ける行があります。sure 文はどれも用言の終止形で終わるので、付けても文になります(「扉があるわい」「風が抜けているっす」)。⚠ 「来た道だ」(`start`)だけは付けられませんが、`start` は勧める候補にしません(§5-3)
- `{to}` は使いません(勧める相手は主人公 = 「あなた」の名前は呼ばない・#118 の罠 B)
- 差し込みは `fillVoice` の**手前で** `{dir}` / `{hint}` を置き換えてから `fillVoice(lines, {})` に渡します(#118 の `fillVoice` 本体は 1 文字も変えない)

### 2-10. 数値

| 対象 | 実測値 | → 採用値 |
|---|---|---|
| `SkillCheck.AUTO_ROLL_MS` | `js/skill-check.js:86` = **2000** | 時間切れ = 2000ms(会議の決着どおり。⚠ §9 で読める長さかを確かめる) |
| `SPEECH_MS` / `SPEECH_STALE_MS` | `index.html:14086` = 2000 / `:14088` = 6000 | 触らない |
| `ARROW_TAP_GATE` | `index.html:41952` = 500 | 触らない(⚠ `showCharChoice` には連打よけの間が無い。召喚と同じ。§9 で確かめる) |
| 受入ドライバのポート | `tools/*.js` で使われている最大 = 10900(#118) | 素 **10901** / 変異 **10902〜10911** |

**計測コマンド**(再測定するとき):

    grep -n "async function chooseExit\|async function revealExitHints\|function showCharChoice\|function buildExitHint\|function hintForExit" index.html
    grep -n "chooseExit(" index.html
    grep -n "autoSkipMs" index.html tavern.html
    grep -n "AUTO_ROLL_MS = " js/skill-check.js
    grep -n "voice: { trap" js/companion-cast.js
    grep -n "\.hints(" tools/*.js
    grep -ln "castId" tools/*.js
    grep -rhoE "\b109[0-9]{2}\b" tools/*.js | sort -u | tail -3

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → `index.html` を触るので**鳴る**。プレイヤーに見える変化(勧めのダイアログ・返事・ひと言)があるので、書ける要約が実在する = §10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/companion-cast.js` | 12 人の `voice` に `advise` / `yes` / `no` を足す(§4)。`copyOf` に 3 場面を足す(罠 E)。ヘッダのコメントに #119 の行 |
| `index.html` | `showCharChoice` に `opts.autoSkipTo`(罠 B)/ `revealExitHints` で判定した本人の `castId` を `st.adviceBy` へ(罠 C)/ 勧めの本体 `offerPathAdvice`(§5-3)/ `chooseExit` の `:41429` の 1 行を差し替え / 検証シーム `window.__advice` |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行(§10) |
| `tools/verify_path_advice.js` | 新規(§8) |
| `実装依頼書/README.md` | #119 の行(承認時に計画窓が足す) |

⛔ `tavern.html` / `js/mercenary-roster.js` は開かない(§2-8 で `castId` は既に本体へ届いていることを確認済み)。
⛔ `fillVoice` / `castVoiceText` / `sayFind` / `sayLine` / `buildExitHint` / `exitsWithReturn` / `showExitArrows` の本体は変えない。

---

## 4. 声の表(⭐ 承認対象 — 全文)

各人に 3 つの場面を足します。`advise` = 勧めの文(ダイアログの文面に「名前「…」」の形で出す)/ `yes` = 「わかった」の後のひと言 / `no` = 「自分で選ぶ」の後のひと言。どれも 2 本ずつ・計 **72 本**。
印: `{dir}` = 方角(奥 / 手前 / 西 / 東)・`{hint}` = 羊皮紙のヒント文(例: 「風が抜けている」「金属の匂いがする」)。
⚠ 勧めの文では「安全だ」「宝がある」のように**行き先の中身を言い切らない**(ファンブルでは嘘になり、成功でも行き先が戦闘のことがある)。言うのはヒントと「こっちだ」だけです。

ダイアログのボタン(全員共通): **「1. わかった、そっちに進もう」** / **「いや、自分で選ぶ (Esc)」**

### 戦士

**イレーナ**(丁寧で硬い)
- advise: 「{dir}の道を勧めます。{hint}。こちらへ参りましょう。」/「{dir}です。{hint}。私はこちらが良いと思います。」
- yes: 「承知しました。隊列を整えて参ります。」/「ありがとうございます。私が先頭に立ちます。」
- no: 「……わかりました。ご判断に従います。」/「承知しました。どの道でもお守りします。」

**ミラ**(荒っぽい)
- advise: 「{dir}だ! {hint}。こっちに行こうよ!」/「{dir}にしな。{hint}。あたしの勘だよ!」
- yes: 「そうこなくっちゃ! ついて来な!」/「よし、決まり! 先に行くよ!」
- no: 「ちぇっ。まあ、あんたが決めなよ。」/「なんだい、つまんないねえ。」

### ドワーフ

**ラスムーゼン**(極端に短い)
- advise: 「……{dir}へ。……{hint}。」/「……{dir}。……{hint}。……こっちだ。」
- yes: 「……任せろ。」/「……行くぞ。」
- no: 「……好きにしろ。」/「……そうか。」

**ダグ**(豪快)
- advise: 「{dir}じゃ! {hint}わい。こっちに行こうじゃないか!」/「ガハハ、{dir}じゃ! {hint}ぞ。儂の鼻を信じい!」
- yes: 「ガハハ! そうこなくてはな!」/「よし、儂についてくるんじゃわい!」
- no: 「むう、そうかい。まあ、お主が決めい。」/「ガハハ、儂の鼻も鈍ったかのう。」

### 僧侶

**ヨナ**(若く丁寧)
- advise: 「{dir}の道です。{hint}。こちらへ進みましょう。」/「{dir}へ参りましょう。{hint}。神のお導きだと思います。」
- yes: 「はい! 神よ、私たちをお守りください。」/「ありがとうございます。参りましょう。」
- no: 「わかりました。あなたの道を信じます。」/「はい。神はどの道にもおられますから。」

**ガウェイン**(重々しい)
- advise: 「{dir}へ進むがよい。{hint}。」/「若いの、{dir}だ。{hint}。こちらであろう。」
- yes: 「うむ。遅れるでないぞ。」/「よかろう。我が後に続け。」
- no: 「ふむ。己の道を行くか。それもよかろう。」/「うむ。決めたのはお主だ、悔いるでないぞ。」

### 魔法使い

**オズ**(学者肌)
- advise: 「{dir}の道がいいと思うよ。{hint}。理屈に合うね。」/「観察によれば、{dir}だね。{hint}。」
- yes: 「決まりだね。行こう。」/「うん、合理的な判断だ。」
- no: 「そう? まあ、君の判断も興味深いね。」/「わかった。別の仮説を試そう。」

**ベルント**(皮肉)
- advise: 「ふん、{dir}だ。{hint}。わからんのか?」/「{dir}にしておけ。{hint}だろうよ。」
- yes: 「ふん、たまには素直だな。」/「よかろう。遅れるなよ。」
- no: 「ふん、好きにしろ。後で泣くなよ。」/「勝手にするがいい。私は知らんぞ。」

### エルフ

**ファルケ**(冷静で簡潔)
- advise: 「{dir}の道だ。{hint}。こっちに進もう。」/「静かに。{dir}だ。{hint}。こっちへ行こう。」
- yes: 「よし。音を立てずについて来い。」/「わかった。足元に気をつけろ。」
- no: 「そうか。なら、慎重に選べ。」/「……わかった。お前に任せる。」

**ブラン**(明るい)
- advise: 「{dir}だよ! {hint}。きっと冒険が待ってるさ!」/「ねえ、{dir}に行こうよ! {hint}。歌になるぞ!」
- yes: 「やった! 英雄の道だ!」/「よし、行こう! この章はきっと盛り上がるさ!」
- no: 「えー……まあ、それも物語さ。」/「そっか。英雄は自分で道を選ぶんだね!」

### 盗賊

**ロルフ**(軽口)
- advise: 「へっ、{dir}だな。{hint}。こっちに進もうぜ。」/「{dir}にしとけ。{hint}ぜ。」
- yes: 「へっ、話が早え。ついて来な。」/「そうこなくちゃな。行くぜ。」
- no: 「へっ、そうかい。あんたが決めな。」/「まあいいさ。どっちでも付き合うぜ。」

**クヌート**(小心で早口)
- advise: 「ひっ、{dir}っす。{hint}っすよ。こっちがいいっす!」/「{dir}っす! {hint}っす。勘っすけど!」
- yes: 「ひっ、了解っす! 先導するっす!」/「わかったっす! 分け前は忘れないでくださいっす!」
- no: 「ひっ、そうっすか。お任せするっす。」/「了解っす。約束どおり、ついて行くっす。」

**画面での見え方の例**(いちばん長いもの): `ラスムーゼン「……東。……北の石段が、霧の向こうの祠へ続いている。……こっちだ。」`(39 文字)

---

## 5. 実装手順

### 5-1. `js/companion-cast.js`

- 12 人の `voice` に `advise` / `yes` / `no` を §4 のとおり 1 文字も変えずに足す
- `copyOf` の `voice` に `advise: c.voice.advise.slice(), yes: c.voice.yes.slice(), no: c.voice.no.slice()` を足す(罠 E)
- ヘッダの「各人の voice = { … }」の行に 3 場面を書き足す

### 5-2. `index.html` — `showCharChoice` の時間切れの行き先(`:16213` 付近)

```js
// opts.autoSkipTo: ★#119 時間切れで返す添字 (既定 = null = キャンセルと同じ・召喚の呼び口はこれ)。
//   ⚠ 罠 B: `opts.autoSkipTo || null` と書かない (0 が null になる)。
const autoSkipTo = (opts && Number.isInteger(opts.autoSkipTo)) ? opts.autoSkipTo : null;
...
autoTimer = setTimeout(() => { cleanup(); resolve(autoSkipTo); }, autoSkipMs);
```

⛔ `?autoplay` の早期 return(`:16215`)・キャンセルボタン・キー操作は変えない。

### 5-3. `index.html` — 勧め(`chooseExit` の近く・`:41415` の直前に置く)

**(a) 判定した本人を覚える**(`revealExitHints` の知覚判定の枝・`:41887-41908`)

- `const party = buildPerceptionParty()` の**直後に**、#118 の探索判定(`:28828-28833`)と同じ形で `units` と `unitOf` を作る
- 判定の後で `const repUnit = (res && res.rep) ? (unitOf.get(res.rep) || null) : null;`
- `st.adviceBy = (repUnit && repUnit !== "player" && repUnit.castId) ? repUnit.castId : null;`
- ⚠ 魔法の眼の枝・`forcedTier` の枝・判定する人がいない枝では `st.adviceBy` を書かない(= undefined = 勧めない)
- ⛔ `st.hintsRevealed` には足さない(§2-7)

**(b) 勧める道の順位**

```js
// ★#119 見えている kind (羊皮紙) の順位。高いほど勧める。⚠ 罠 D: 本当の行き先の kind で選ばない
//   寄り道を先に勧める (loot / rest / search / event) → 戦闘 → ボスは最後。start (来た道) は候補にしない。
const ADVICE_KIND_RANK = { loot: 5, rest: 4, search: 3, event: 2, combat: 1, boss: 0 };
const ADVICE_DIR_WORD  = { up: "奥", down: "手前", left: "西", right: "東" };
```

`pickAdviceExit(node, opts)` → 出口 1 本 or null(純関数・乱数を引かない):
1. 候補 = `opts` のうち `!o.back && !o.spot` で、`nodeState[o.to]` が訪れていない(`!(nodeState[o.to] && nodeState[o.to].visited)`)もの
2. **候補が 2 本未満なら null**(道が 1 本なら勧めるまでもない)
3. 各候補の `h = hintForExit(node, o)`。`h && h.kind && ADVICE_KIND_RANK[h.kind] !== undefined` のものだけ残す
4. 順位がいちばん高いもの。同じなら `opts` の並びで先のもの。1 本も残らなければ null

**(c) 本体** `offerPathAdvice(node, opts)` → 選ばれた出口 or null(null = 今までどおり矢印へ):

```js
async function offerPathAdvice(node, opts) {
  if (!adviceOn()) return null;                              // ?advise=0
  const st = nodeState[node.id];
  if (!st || st.adviceDone || !st.adviceBy) return null;     // 1 部屋 1 回 / 判定した本人がキャストの仲間でない
  const advisor = (typeof allies !== "undefined") ? allies.find(a => a && a.alive && a.castId === st.adviceBy) : null;
  if (!advisor) return null;                                 // 判定の後で倒れた
  const o = pickAdviceExit(node, opts);
  if (!o) return null;
  const h = hintForExit(node, o);
  const text = adviceText(advisor, "advise", o, h);          // {dir} {hint} を差し込んでから fillVoice
  if (!text) return null;
  st.adviceDone = true;                                      // 出したら返事に関係なく 1 回で終わり
  const msg = advisor.npcName + "「" + text + "」";          // ⚠ 罠 A: 吹き出しではなくダイアログの文面
  const idx = await showCharChoice(msg, [{ label: "わかった、そっちに進もう" }], "いや、自分で選ぶ (Esc)",
    { autoSkipMs: (window.SkillCheck && SkillCheck.AUTO_ROLL_MS) || 0, autoSkipTo: 0 });   // 時間切れ = わかった
  const yes = (idx === 0);
  /* 返事の後のひと言。key は新しい advice.yes / advice.no (優先度は speechPrio の既定 = 2) */
  ...sayLine(yes ? "advice.yes" : "advice.no", advisor, { text: 返事の文, meta: { scene: yes ? "yes" : "no", to: o.to } });
  if (!yes) updateSpeechBubbles();                           // ⚠ 罠 A: 直後に矢印 (dialogPaused) になるので、その場で 1 回出す
  adviceLog.push({ node: node.id, castId: advisor.castId, to: o.to, kind: h.kind, wrong: !!h.wrong, yes, msg });
  return yes ? o : null;
}
```

- `adviceOn()` = `new URLSearchParams(location.search).get("advise") !== "0"`(呼ぶたびに読む・`banterOn` と同じ作法)
- `adviceText(unit, scene, o, h)`: `DFCast.byId(unit.castId).voice[scene]` の各行の `{dir}` を `ADVICE_DIR_WORD[o.dir]`、`{hint}` を `h.text.split(" — ")[0].replace(/。$/, "")` に置き換えてから `fillVoice(lines, {})`。返事の行(`yes` / `no`)は `o` / `h` が無くても引ける(`fillVoice(voice[scene], {})`)
- 1 本も引けなければ null(勧めない)

**(d) `chooseExit` の `:41429` の 1 行を差し替え**

```js
if (!window.__autoplay) {
  const advised = await offerPathAdvice(node, opts);   // ★#119 勧め (⚠ この if の内側 = ?autoplay / ?graph=auto では 1 命令も走らない)
  if (advised) return advised;
  return await showExitArrows(node, opts);
}
```

⛔ 勧めを `if (RUN.auto)` より前や、この `if` の外に置かない(変異 `autoplay`)。

**(e) 検証シーム**

```js
window.__advice = {
  on: adviceOn, pick: pickAdviceExit, text: adviceText, offer: offerPathAdvice, log: adviceLog,
  rank: ADVICE_KIND_RANK, dir: ADVICE_DIR_WORD,
  state: (id) => { const st = nodeState[id || currentNodeId]; return st ? { by: st.adviceBy, done: !!st.adviceDone } : null; },
  setBy: (castId, id) => { const st = nodeState[id || currentNodeId]; if (st) { st.adviceBy = castId; st.adviceDone = false; } },   // 検証専用 (forcedTier は本人を残さないため)
};
```

`adviceLog` は長さ 20 の輪(古いものから捨てる)。

---

## 6. (欠番 — 酒場側の変更は無い)

---

## 7. 撤退スイッチ

- **`?advise=0`** — 勧めを出さない(`chooseExit` は #118 までと同じ = すぐ矢印)。`st.adviceBy` は書いてよい(読む側が止まる)
- ⚠ 判定位置 = `offerPathAdvice` の先頭(呼ぶたびに URL を読む)。index.html の中だけで完結するので、ページ遷移はまたがない(酒場から `?advise=0` を引き継ぐ作りは要らない)
- `showCharChoice` の `autoSkipTo` は撤退の対象にしない(渡さない呼び口では今までどおり = 恒等)

---

## 8. 受入条件 — `tools/verify_path_advice.js`(新規・素 port 10901 / 変異 10902〜10911)

方針: ゲームを最後まで遊ばせず、分かれ道の部屋で本体の関数を直接呼んで、ダイアログの DOM・`__advice.log`・吹き出しの予約を読みます。期待値はドライバが自分で計算します(勧める道 = ドライバが `__graph.hints()` の `byExit` から見えている kind を読み、§5-3 (b) の規則で選び直す。声の文はページの `DFCast.byId()` の実体から「あり得る文の集合」を作る ⛔ §4 の 72 本を写経しない)。

### 計測機構

- 起動: `tools/driver_graph_arrows.js` の `QT`(`/index.html?diag=1&graphtest=1&secret=0`)の作法で、**`?autoplay` を付けずに**開く(付けると勧めが出ない = §2-1)。`sessionStorage["dragonfighters.partyMembers"]` に `castId` 入りの人物(主人公 + キャスト 3 人)を入れる。人物は `verify_banter_callouts.js` と同じく node 側で `DFCast` を評価して作る
- 吹き出しの予約は `speechQueue.push` をその配列 1 本だけ包んで記録する(#118 と同じ)
- 乱数は Math.random を seed 付き(mulberry32)に差し替えて固定
- 結果の段階(crit / success / fail / fumble)は `__graph.reveal(tier)` で作り、勧める人は `__advice.setBy(castId)` で入れる。実際の判定から入る経路は (1a) の 1 本だけで見る
- `index.html` / `js/companion-cast.js` は起動時に 1 回だけ読んで凍結し、変異はメモリ上で差し替えて配る。変異の注入点は原本でちょうど 1 件・行数不変、を起動時に検算する(#118 と同じ。空振りの変異 = exit 3)

### §0 装置

- **(0a)** 分かれ道の部屋に、`opts` のうち未踏の出口が 2 本以上ある(無ければ全節が空振り = exit 3)
- **(0b)** `allies` に `castId` を持つ生きた仲間が 2 人以上いる
- **(0c)** fumble の盤面で、**見えている kind の順位で選んだ出口 ≠ 本当の kind の順位で選んだ出口**になる部屋が 1 つ以上ある(無ければ `truekind` の変異を捕まえられない = 罠 D)。見つからなければ graphtest の部屋を順に回って探す
- **(0d)** `DFCast.byId(id).voice` の 12 人すべてに `advise` / `yes` / `no` が 2 本ずつある(写しから消えていない = 罠 E)

### §1 判定した本人

- **(1a)** 本物の `revealExitHints` を振る(Math.random を高い出目に固定・主人公の判定値を最も低くする)→ `__advice.state().by` = `res.rep` を `buildPerceptionParty()` の並びで本物へ戻したものの `castId`(2 経路: ドライバも `SkillCheck` の結果から同じ並びで引き直す)
- **(1b)** 主人公が判定した → `by` は null。`chooseExit` → ダイアログは出ず、すぐ矢印

### §2 勧めの中身

- **(2a)** success + `setBy(B)` → `chooseExit` → `#choiceDialog` が出る。文面 = `B.npcName + "「" + 文 + "」"`、文は B の `advise` に (2b) の出口の `{dir}` / `{hint}` を差し込んだ集合のどれか。ボタンは「1. わかった、そっちに進もう」と「いや、自分で選ぶ (Esc)」
- **(2b)** 勧めた出口(`__advice.log` の最後の `to`)= ドライバが `hints().byExit` の見えている kind で選び直した出口(2 経路)
- **(2c)** fumble → (2b) と同じ規則で選ばれ、`wrong === true`。(0c) の部屋では、本当の kind で選んだ出口と**違う**
- **(2d)** fail → ダイアログは出ず、すぐ矢印。`log` は増えない
- **(2e)** 訪れた出口・引き返す口は勧めない(loot の出口を訪れた印にしておくと、勧めは別の出口)
- **(2f)** crit → `{hint}` に「— N 体ばかり」が入っていない

### §3 返事

- **(3a)** 「わかった」をタップ → `chooseExit` が勧めた出口を返す。`advice.yes` の予約が 1 本、話し手 = B、文は B の `yes` のどれか
- **(3b)** 何もしない → `AUTO_ROLL_MS` + 500ms 以内にダイアログが閉じ、勧めた出口を返す(= わかった・罠 B)
- **(3c)** 「自分で選ぶ」→ ダイアログが閉じて矢印が出る。`speechLog` に `advice.no` の行が 1 本(話し手 = B)= 矢印が出ている間に**表示済み**(罠 A)
- **(3d)** 召喚の呼び口と同じ `autoSkipMs` だけを渡した `showCharChoice` → 時間切れで null(恒等)

### §4 1 部屋 1 回

- **(4a)** (3c) の後に矢印を Esc(留まる)→ もう一度 `chooseExit` → ダイアログは出ず、矢印だけ。`log` の本数は変わらない

### §5 恒等

- **(5a)** 同じ仕込みで `?autoplay=15` のページ → `chooseExit` の戻りが今までどおり(ダイアログ経路の候補 0)、`log` は 0 本
- **(5b)** `castId` の無いパーティ(直起動)→ 勧めは出ない

### §6 撤退

- **(6a)** `?advise=0` → (2a) と同じ仕込みでもダイアログは出ず、すぐ矢印

### ⛔ 測らないこと

- どの行が選ばれるかの偏り・吹き出しやダイアログの見た目・時間切れの長さそのもの(2000ms は §9 で耳と目で確かめる。受入は `AUTO_ROLL_MS` を読んで使っていることだけを見る)
- 勧めに従った先で何が起きるか(戦闘・宝箱の中身)

### 負のコントロール(`--negative` に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `autoplay` | 勧めを `if (!window.__autoplay)` の外(`RUN.auto` の後・この if の前)へ出す | (5a) |
| `zero` | `autoSkipTo` を `opts.autoSkipTo \|\| null` で読む(罠 B) | (3b) |
| `bubble` | 勧めの文を `sayLine` の吹き出しで出し、ダイアログの文面は「分かれ道だ。」(罠 A) | (2a) |
| `copyrep` | `st.adviceBy = res.rep.castId`(写しから直接引く・罠 C) | (1a) |
| `copyof` | `copyOf` から `advise` を落とす(罠 E) | (0d) (2a) |
| `truekind` | 順位を `RUN.byId[o.to].kind` で付ける(罠 D) | (2c) |
| `failadvise` | `kind` が null の出口も順位 0 として残す | (2d) |
| `seen` | 訪れた出口を候補から外さない | (2e) |
| `again` | `st.adviceDone = true` を書かない | (4a) |
| `switch` | `adviceOn()` が常に true | (6a) |

### 既存 golden の非退行

基準 = 項目 1 で HEAD `3ccd5cb` の上で取り直す(⚠ 下の数字は #118 §12-4・2026-11-22 07:26〜07:40 の記録):

- #118 の 13 本: `driver_speech_engine` 18/18 / `driver_speech_v2` 45/46 {(A1)}(#117 の前から赤) / `driver_speech_hooks` 13/13 / `driver_speech_boss` 19/19 / `verify_tower_mother_b` 22/22 / `driver_dev_gate2` 62/62(`--baseline` に別名が要る・#118 §12-4) / `verify_companion_cast` 24/24 / `verify_goodberry` 23/23 / `driver_doors_p6` 40/40 / `driver_room_search_roll` 39/39 / `verify_lore_check` 26/26 / `verify_corner_check` 20/20 / `verify_ambush_round` 18/18
- 加えて分かれ道を通るもの(項目 1 で基準を取る): `driver_graph_arrows` / `driver_graph_kinds` / `driver_graph_run` / `driver_graph_sce1` / `driver_grid_p9` / `driver_field_step6` / `verify_banter_callouts`(20/20)/ `probe_party_size`
- `showCharChoice` の召喚の自動スキップを測っているドライバがあれば足す(項目 1 で `grep -ln "召喚しない\|autoSkipMs" tools/*.js` を数える)

⚠ 基準値は 2026-11-22 時点の記録です。**走らせて違ったら、期待値を書き換える前に理由を突き止めること**。期待値が変わる想定はありません(§2-8: 既存ドライバでは勧めが出ない)。

---

## 9. 実機/実感の確認

⚠ ローカルは http で起動すること(file:// ではナレーションの音が出ない)。
1. 酒場から出発し、分かれ道で気配を読んだ仲間がその人の口調で道を勧めるか。返事の後のひと言が出るか
2. ⚠ **時間切れの 2 秒で、文を読んで「自分で選ぶ」を押せるか**。短すぎたら `AUTO_ROLL_MS` とは別の長さにするかを決める(別チケット)
3. 直前の判定パネルを閉じたタップが、勧めのボタンまで突き抜けないか(`showCharChoice` には矢印の `ARROW_TAP_GATE` のような連打よけが無い)
4. 「自分で選ぶ」の後、ひと言の吹き出しが矢印や羊皮紙と重なって読めなくならないか
5. iPhone: いちばん長い勧め(ラスムーゼン・39 文字)とボタン 2 つが、ログ枠の帯に収まって片手でタップできるか。時間切れで閉じたとき、矢印が一瞬出て消えるちらつきが無いか

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>分かれ道で仲間が道を勧める</b> — 気配を読んだ仲間が「こっちに進もう」と勧め、返事を選べる。黙っていれば勧めに従う。判定を大きく外した仲間は、自信満々に間違った道を勧めることも。"

---

## 11. やらないこと

- ⛔ 主人公が勧める・判定に失敗した仲間が「分からない」と言う(会議で不採用)
- ⛔ 魔法の眼(#79)を唱えた部屋での勧め(判定を振らない = 本人がいない。眼の報告が既に出ている)
- ⛔ 勧めに従った結果への反応(「ほら、言ったとおりだ」「……すまん、外れた」)= 別チケット候補
- ⛔ 2 人 1 組の専用の掛け合い・弱点(ダメージ増)(次回以降の議題)
- ⛔ 時間切れの長さを `AUTO_ROLL_MS` 以外にすること(§9 の 2 で決める)・`showCharChoice` への連打よけの追加(§9 の 3)
- ⛔ `?autoplay` のダイアログ経路・寄り道(P9 `offerDetour`)・`showExitArrows` の見た目
- ⛔ `README.md` の行は承認時に計画窓が足す。用意してある行:

    | 119 | [2026-11-22_path-advice.md](2026-11-22_path-advice.md) | **承認済** | 0% | 分かれ道で気配を読んだ仲間が道を勧め、主人公が「わかった / 自分で選ぶ」で返事(時間切れ = わかった)。セリフ 72 本は承認済。⚠⭐ 選択肢の間は吹き出しが出ない = 勧めはダイアログの文面へ / 時間切れの添字 0 を `\|\|` で読まない / 勧める道は見えている kind で選ぶ(ファンブルで自然に間違える) |

---

## 12. 実装結果

### 12-1. 着手前の実測(項目 1・2026-11-22 朝・HEAD `7d009a4`)

コードは 1 バイトも変えていない。`7d009a4` は `3ccd5cb` に依頼書と README の 2 ファイルを足しただけ(`git diff --stat 3ccd5cb 7d009a4`)なので、§2 の行番号はそのまま使える。ずれは下の表のとおり(どれも起草時の書き間違い・中身は同じ)。

#### 測り直し(§2)

| 節 | 主張 | HEAD の実測 | 判定 |
|---|---|---|---|
| 2-1 | `chooseExit` `41415`・`RUN.auto` `41418`・矢印の 1 行 `41429`・`revealExitHints` `41873`(再入場で振り直さない `41877`)・`buildExitHint` `41830`・`exitsWithReturn` `41378`・`tickNodeChoice` から `42589-42590` | 同じ行 | ✅ |
| 2-1 | `chooseExit(` の呼び口は 2 か所(`42590` / `44385` 検証シーム `__graph.choose`) | `index.html` `js/*.js` `*.html` の grep = 定義 `41415` + 呼び口 `42590` / `44385` の 2 か所。⚠ シームの名前は **`window.__graphRun`**(`44374` で定義)。`__graph.choose` / `__graph.reveal` / `__graph.hints` という名前はどこにも無い(`driver_graph_arrows.js:279` も `const g = window.__graphRun`)。§8 本文の `__graph.hints()` / `__graph.reveal(tier)` も **`__graphRun.*`** と読み替える(`reveal` `44423`・`hints` `44424`) | ⚠ 名前の書き間違い |
| 2-2 | `dialogPaused` で `moveEnemies` `20614` が早めに return・`renderWorld` → `updateSpeechBubbles` `18225` | `moveEnemies` の定義は **`20611`**(return は `20614`)・`18225` は同じ | ✅ |
| 2-2 | 「自分で選ぶ」の直後に `updateSpeechBubbles()` を 1 回直接呼べば出る | ⚠ **条件付き**: `updateSpeechBubbles` は `14230` で `if (speechBubbles.length \|\| now < speechBusyUntil) return;` = **他の吹き出しが表示中か、直前の吹き出しから `SPEECH_MS + SPEECH_GAP_MS`(2000+260ms)以内だと何も出さない**。勧めのダイアログは知覚判定の直後に開くので、その前に出た吹き出し(`find.*` / `lore.share` など)が残っていると、「no」のひと言は矢印が閉じるまで行列で待つ(6000ms で捨てられる) | ⚠ 罠 A の補足(注意 2) |
| 2-3 | `showCharChoice` `16213`・時間切れ `resolve(null)` `16283`・召喚の呼び口 `16064` | 同じ行(`autoSkipMs` の grep = `16064` / `16211` / `16236` / `16281-16283` のみ・`tavern.html` は 0 件)。`?autoplay` の即返しは `16215-16216`(`chooseExit` の注記にある `index.html:10288` は古い行番号) | ✅ |
| 2-4 | `revealExitHints` の知覚判定 `41898`・`buildPerceptionParty` `28683` が `{classKey,name,isHero?,skillBonus}` の写し | 同じ(主人公 `28686`・仲間 `28693`)。#118 の対応表 `unitOf` は `28826-28833` | ✅ |
| 2-5 | 勧める道は `hintForExit(node,o).kind` | `hintForExit` `41923`・`EXIT_HINTS` `41474`・`EXIT_HINT_WRONG_KINDS`(boss なし)`41490` | ✅ |
| 2-6 | `copyOf` `js/companion-cast.js:186-191` が `voice` を場面ごとに名前で写す | `copyOf` `186`・`voice: { trap, chest, door, lore, call }` は `190-191` | ✅ |
| 2-7 | 「留まる」の後に再提示 `:42601` | **`42598`** `if (!chosen) { nodeChoiceCooldownUntil = Date.now() + NODE_CHOICE_COOLDOWN_MS; return; }`(`NODE_CHOICE_COOLDOWN_MS = 6000` `41027`・再提示の門 `42560`) | ⚠ 行 −3 |
| 2-7 | `driver_graph_arrows.js` が `JSON.stringify(g.hints())` を 7 か所で比べる | `.hints(` の grep = `481` / `518` / `521` / `539` / `541` / `544` / `721` / `1082` の 8 行(`539-544` が 3 行)・ほかのドライバは 0 件。`newNodeState` `40994` に `adviceBy` / `adviceDone` の欄はまだ無い | ✅ |
| 2-8 | `probe_party_size` は `RUN.auto = true`(`:864`) | **`:865`**。⚠ ただしこの probe は装置ごと壊れていて `index.html` に一度も着地しない(下の golden の表)= 勧めの非退行の役に立たない | ⚠ 行 +1・装置ごと故障 |
| 2-8 | `verify_egg_parent` / `verify_frost_hold` / `verify_silent_tomb` / `verify_witch_hut` の `castId` = 0 件 | 4 本とも `castId` の grep = 0 件 | ✅ |
| 2-8 | `verify_banter_callouts` / `verify_companion_cast` は `?autoplay=15` で `chooseExit` を通らない | 両方とも `?diag=1&scen=goblin-mine&graph=0&autoplay=15`(`verify_banter_callouts.js:332`)= **`graph=0` で `RUN` 自体が無い**ので分かれ道に入らない(`tickNodeChoice` の先頭 `if (!RUN) return`) | ✅(理由はさらに強い) |
| 2-8 | `castId` を持つドライバ | `grep -ln castId tools/*.js` = `verify_banter_callouts.js` / `verify_companion_cast.js` の 2 本だけ | ✅ |
| 2-8 | 召喚の自動スキップを測るドライバ | `grep -ln "召喚しない\|autoSkipMs" tools/*.js` = **4 本**(`driver_scroll_autoskip` / `driver_choice_logslot` / `verify_mage_hand` / `verify_mage_hand_reach`)= 下の golden に入れた | ✅ |
| 2-9 | ヒント文 = `EXIT_HINTS` の sure 9 本(`start` 除く)+ 著者の `hint.text` 8 本・最長「北の石段が、霧の向こうの祠へ続いている」19 文字・「。」で終わるもの 0 本 | sure は `start` を除いて 9 本 ✅。`hint: { text:` の grep は 8 件だが **1 件は `js/df-mapdef.js:2922` の注記の `hint:{text:"…"}`** = 著者の実文は 7 本。最長 19 文字・「。」終わり 0 本は ✅。最長の文は `index.html:43587`(`dir: "up"` = `{dir}` は「奥」) | ✅(件数の注記だけ) |
| 2-9/4 | 画面での見え方の例「いちばん長いもの」= ラスムーゼン 39 文字(§4 末尾・§9-5) | ⚠ **崩れている**。§4 の `advise` 24 本 × ヒント 12 種 × 方角 4 語を全部差し込んで数えると、最長は **イレーナ「手前の道を勧めます。北の石段が、霧の向こうの祠へ続いている。こちらへ参りましょう。」= 47 文字**(名前と括弧込み)。次がヨナ・クヌートの 46。ラスムーゼンは最長でも 42(「手前」)。最長のヒントは実際には `dir: "up"`(「奥」)にしか付かないので、実在する組み合わせの最長はイレーナ「奥」の 46 文字 | ⚠ 例の人選が誤り(承認済みの文面は変えない・注意 6) |
| 2-10 | `AUTO_ROLL_MS = 2000` `js/skill-check.js:86`・`SPEECH_MS` `14086`・`SPEECH_STALE_MS` `14088`・`ARROW_TAP_GATE = 500` `41952` | `SPEECH_MS = 2000` `14086`・`SPEECH_GAP_MS = 260` `14087`・`SPEECH_STALE_MS = 6000` `14088`・`ARROW_TAP_GATE` `41952`・`AUTO_ROLL_MS` `86` | ✅ |
| 2-10 | ポートの最大 = 10900・素 10901 / 変異 10902〜10911 | `grep -rhoE "\b109[0-9]{2}\b" tools/*.js` の最大 = 10900。10901〜10911 は `tools/` に 0 件 | ✅ |
| 2-11 | `check_changelog.py:32` `GAME_LOGIC` | `:32` に同じ定義 | ✅ |
| — | 新しい名前(`adviceBy` / `adviceDone` / `autoSkipTo` / `__advice` / `ADVICE_DIR_WORD`)が既にあるか | `index.html` `js/*.js` で 0 件 | ✅ |

#### golden(HEAD `7d009a4`・直列・2026-11-22 08:21〜09:30 + 再走 09:30〜10:02 = 昼)

ログ = `C:\Users\PC_User\.claude\dev-loop\r119\item1\`(`run_golden.ps1` / `golden_raw.txt` / `golden_rerun.txt` / 各 `<driver>.log` / 再走は `<driver>.rerun.log`)。
⚠ 08:22 に同じ項目の重複ワーカーが同じフォルダで走り、`run_golden.ps1` の上書き・`golden_raw.txt` の見出しと engine 行の消失・`driver_speech_engine.log` / `driver_speech_v2.log` の上書き・`driver_speech_hooks` の同時実行が起きた(リポは無変更)。⇒ **この 3 本は単独で走らせ直した値を基準にする**(下の表の「再走」)。

| ドライバ | 起草時の記録 | 今回 | 赤 | 備考 |
|---|---|---|---|---|
| `driver_speech_engine` | 18/18 | **18/18**(再走) | ∅ | |
| `driver_speech_v2` | 45/46 | **45/46**(再走) | {(A1)} | 既知(#117 の前から・敵種の鳴き声) |
| `driver_speech_hooks` | 13/13 | **13/13**(再走) | ∅ | |
| `driver_speech_boss` | 19/19 | 19/19 | ∅ | |
| `verify_tower_mother_b` | 22/22 | 22/22 | ∅ | 339 秒 |
| `driver_dev_gate2` | 62/62 | 62/62 | ∅ | `--baseline %TEMP%\df_cleanup2_base_r119i1` で回し、後で `git worktree remove` 済み(既定の `df_cleanup2_base` は壊れたまま・触っていない) |
| `verify_companion_cast` | 24/24 | 24/24 | ∅ | |
| `verify_goodberry` | 23/23 | 23/23 | ∅ | |
| `driver_doors_p6` | 40/40 | 40/40 | ∅ | |
| `driver_room_search_roll` | 39/39 | 39/39 | ∅ | |
| `verify_lore_check` | 26/26 | 26/26 | ∅ | |
| `verify_corner_check` | 20/20 | 20/20 | ∅ | |
| `verify_ambush_round` | 18/18 | 18/18 | ∅ | |
| `verify_banter_callouts` | 20/20 | 20/20 | ∅ | |
| `driver_graph_arrows` | (新) | **80/80** | ∅ | |
| `driver_graph_kinds` | (新) | **66/66** | ∅ | |
| `driver_graph_run` | (新) | **99/99** | ∅ | |
| `driver_graph_sce1` | (新) | **106/106** | ∅ | 192 秒 |
| `driver_grid_p9` | (新) | **52/52** | ∅ | 486 秒 |
| `driver_field_step6` | (新) | **65/65**(再走) | ∅ | ⚠ 1 回目は rc=3(装置の故障): 既定の baseline `%TEMP%\df_step6_baseline`(`ad6f648`)の作業木が壊れていて `index.html` が無く、`git worktree add` が「already exists」で落ちた。`--baseline-dir %TEMP%\df_step6_baseline_r119i1` で別名を作って 65/65・後で `git worktree remove` 済み(既定のほうは触っていない)。**1694 秒(28 分)** |
| `probe_party_size` | (新) | **装置ごと故障**(§0〜§7 で NG 21 / OK 20 の時点で止めた) | (対象外) | §1 (1e) で `departToScenario()` の行き先が `world.html` になり `index.html` に一度も着地しない(#21 `8b1b126` で酒場→ワールドマップ→`index.html` の導線になった後、この probe(#14)は直されていない)⇒ 以降の (2a)〜(7e) は全部その連鎖(人数 0・TIMEOUT)。実プレイ §8 は 1 腕 60 秒の TIMEOUT が続くので 1296 秒で止めた。**#119 の非退行には使えない**(`RUN.auto` の行に届かない)。`RUN.auto` の経路は `driver_field_step6`(`?graph=auto` の装置)が通る |
| `driver_scroll_autoskip` | (新) | **9/9** | ∅ | 召喚の自動スキップ (2a)〜(2c) |
| `driver_choice_logslot` | (新) | **29/29** | ∅ | |
| `verify_mage_hand` | (新) | **32/32** | ∅ | `showCharChoice` を包んで `autoSkipMs` を外す装置 |
| `verify_mage_hand_reach` | (新) | **11/11** | ∅ | |
| `verify_arcane_eye` | (新) | **34/34** | ∅ | `revealExitHints` の `crit` 経路(項目 2 が同じ関数の近くに手を入れる) |
| `verify_egg_parent` | (新) | **25/26** | {(6a)} | 既知: 触らない約束の `runEncounter` の長さ 21906 → 22068 = #114 `9034fc7` 由来(#116 の別チケ候補 ①) |
| `verify_frost_hold` | (新) | **27/28** | {(6b)} | 既知: 同じく `runEncounter`(基準 `0298eca`)が #114 で変わった。#109 §12 の記録 {(6b)} と同じ集合(当時の理由は `defeatEnemy`・今は基準が `614270e` へ直され `runEncounter` だけが違う) |
| `verify_silent_tomb` | (新) | **24/24** | ∅ | |
| `verify_witch_hut` | (新) | **28/29** | {(6b)} | 既存の赤(新しく見つかった): 写し元の関数のうち `allyShadowStep` だけ 4549 → 4555 文字。`git blame` = #114 `9034fc7`(11-10)の 1 行。#111 §12(11-07)では 29/29 ⇒ #114 から赤いまま。⚠ この (6b) は `showCharChoice` のソースも基準の版と比べている(今は 3043 → 3043 で同じ) |

**赤の集合 = { `driver_speech_v2` (A1) / `verify_egg_parent` (6a) / `verify_frost_hold` (6b) / `verify_witch_hut` (6b) }** + `probe_party_size` は装置ごと故障(対象外)。どれも #119 より前から・#119 に帰属しない。

#### 項目 2〜4 への注意

1. 検証シームは **`window.__graphRun`**(`.choose()` `.reveal(tier, id)` `.hints(id)`)。§8 の `__graph.*` は全部これに読み替える。
2. 罠 A の「`updateSpeechBubbles()` を直接 1 回呼ぶ」は、表示中の吹き出しか `speechBusyUntil` があると空振りする(`14230`)。項目 2 はそれを承知で書き、受入の変異 `bubble` は吹き出しの無い盤面(`__speech.clear` の後)で測る。
3. 「留まる」後の再提示は `42598` → `42560` の門 → `42590`。`adviceBy` / `adviceDone` は nodeState の別の欄(`newNodeState` `40994` に足すか、使う所で `=== true` だけを見る)。`hintsRevealed` には書かない。
4. `verify_witch_hut` (6b) は `showCharChoice` のソースを基準の版と比べる ⇒ 項目 2 で `autoSkipTo` を足すと `showCharChoice` も `same:false` になる。項目 4 では (6b) の `same:false` の関数が {`allyShadowStep`} → {`allyShadowStep`, `showCharChoice`} に増えるのを #119 由来として説明し、それ以外が増えないことを見る(FAILED の集合は {(6b)} のまま)。
5. 項目 4 の golden は上の表から `probe_party_size` を外す。`driver_field_step6` は `--baseline-dir` に別名が要り 28 分・`driver_grid_p9` は 8 分。
6. iPhone の確認(§9-5)はラスムーゼンではなくイレーナ / ヨナ / クヌートの勧めで見る(最長 46〜47 文字)。

### 12-2. 本体 + changelog(項目 2・2026-11-22・基準 HEAD `e96d2eb`)

触ったファイル = `js/companion-cast.js` / `index.html` / `js/changelog.js` の 3 本だけ(`tavern.html` / `js/mercenary-roster.js` は開いていない)。

#### やったこと

| 節 | 内容 | 場所(変更後の行) |
|---|---|---|
| 5-1 | 12 人の `voice` に `advise` / `yes` / `no` を 2 本ずつ = **72 本**。⭐ 手で写さず、§4 の本文をスクリプトで読んで差し込んだ(写経の誤りが入らない)。`copyOf` に 3 場面(罠 E)・ヘッダに #119 の行 | `js/companion-cast.js` 各人の `call:` の直後・`copyOf` |
| 5-2 | `showCharChoice` に `opts.autoSkipTo`(`Number.isInteger` で読む・罠 B)。渡さない呼び口は今までどおり null | `index.html` `16215` の関数内 |
| 5-3 (a) | `revealExitHints` の知覚判定の枝で、`party` と同じ瞬間・同じ並びの対応表 `adviceUnitOf` を作り、`st.adviceBy` = 本物の判定者の `castId`(主人公 / castId 無しなら null)。魔法の眼・`forcedTier`・判定する人がいない枝では書かない。`hintsRevealed` には足していない | `41974` の関数内 |
| 5-3 (b)(c) | `adviceOn` / `ADVICE_KIND_RANK` / `ADVICE_DIR_WORD` / `adviceLog`(輪 20)/ `pickAdviceExit` / `adviceText` / `sayAdviceReply` / `offerPathAdvice` | `41416`〜`41497` |
| 5-3 (d) | `chooseExit` に勧めを足した(下の「依頼書と違うところ ①」) | `41529-41530` |
| 5-3 (e) | 検証シーム `window.__advice = { on, pick, text, offer, reply, log, rank, dir, state, setBy }`(`__banter` と同じく dev ゲートの外。`state().by` は未設定なら null を返す) | `41499` |
| 10 | `py tools/add_changelog.py`(§10 の文面のまま・4 件に保つ) | `js/changelog.js` |

#### 依頼書と違うところ(どれも挙動は同じ)

1. **`chooseExit` の矢印の 1 行は 1 文字も変えず、その上に 1 行足した**:
   `if (!window.__autoplay) { const advised = await offerPathAdvice(node, opts); if (advised) return advised; }` → 元の `if (!window.__autoplay) return await showExitArrows(node, opts);`。
   理由 = 元の行は `driver_graph_arrows.js:81-84` の変異 `compactdialog` / `noautoguard` のアンカー。§5-3 (d) のとおり `{ }` で包むとアンカーが消え、その 2 変異が空振りになる。勧めは同じく `!window.__autoplay` の内側だけで走る(`RUN.auto` はさらに前で return)ので、項目 3 の変異 `autoplay`(勧めをこの if の外へ出す)もそのまま書ける。
2. **罠 A(§12-1 注意 2)は `updateSpeechBubbles()` を 1 回呼ぶのではなく `sayAdviceReply` で確実に出す**: 「自分で選ぶ」のときは `sayLine("advice.no", …)` で予約した後、その予約を行列から取り出し、表示中の吹き出しを片付け `speechBusyUntil = 0` にしてから `_renderBubble` で直接描く(行列があふれて `sayLine` が false でも同じ形の予約を作って描く)。⇒ 他の吹き出しが表示中でも、矢印が出ている間に必ず出る。「わかった」のほうは普通の予約(ダイアログが閉じて歩き出すので出る)。
   - 乱数: `adviceText` の `fillVoice` で 1 回 + `sayLine` で 1 回(文面を渡しても 1 回引く)= 勧め 1 回 + 返事 2 回 = **1 部屋で 3 回**。勧めの順位付けは乱数を引かない。

#### 手元の確認(受入ドライバではない・スクラッチの `check_advice.js`)

`?diag=1&graphtest=1&secret=0`(`?autoplay` なし)を実ブラウザ(puppeteer-core・ヘッドレス)で開き、`partyMembers` にキャスト 3 人(ファルケ / ラスムーゼン / イレーナ)を入れて n0(出口 3 本)で測った = **17/17**:
(0a)(0b)(0d) 装置 / (1a) 本物の知覚判定 → `by = "falke"` / (2a) ダイアログ `ファルケ「静かに。東だ。金属の匂いがする。こっちへ行こう。」` + ボタン 2 つ / (2b) 勧めた出口 = 見えている kind で選び直した出口(n2・loot)/ (3a) わかった → n2 を返す・`advice.yes` 1 本(ファルケの yes の文)/ (3b) 放置 → 約 2 秒で閉じて n2(`yes: true`)/ (3c) **他の吹き出しを表示中にしてから**「自分で選ぶ」→ 矢印 3 本・`advice.no` が `speechLog` と DOM の両方に出ている / (4a) 留まる → 再提示はダイアログ無し・log 不変 / (2d) fail → ダイアログ無し / (2c) fumble → n1(見えている kind = rest・`wrong: true`)/ (3d) `autoSkipMs` だけ → null / (6a) `?advise=0` → すぐ矢印 / (5a) `?autoplay=30` → 候補 0 を即返し・log 0 / (5b) castId 無し → `by: null`・ダイアログ無し / pageerror・console.error 0 件。

#### 非退行(項目 1 の値と比べる)

| ドライバ | 項目 1 | 今回 |
|---|---|---|
| `driver_graph_arrows` | 80/80 | **80/80** |
| `driver_graph_run` | 99/99 | **99/99** |
| `driver_speech_engine` | 18/18 | **18/18** |
| `driver_scroll_autoskip` | 9/9 | **9/9** |

#### 項目 3・4 への注意

1. シーム = `window.__advice`(上の表)+ `window.__graphRun`(`.reveal(tier)` / `.hints()` / `.choose()` / `.clearHints()`)。撤退 = `?advise=0`(`offerPathAdvice` の先頭で毎回読む)。
2. ⚠ `__advice.log` の行は**返事の後**に積む(ダイアログが開いている間は増えない)。「勧めた出口」は返事を押した後に読むこと。
3. ⚠ 矢印は `ARROW_TAP_GATE`(500ms)の間は Esc も効かない。矢印を開いてすぐ Esc を送ると閉じず、次の `choose()` がぶつかる(手元確認で踏んだ)。
4. §12-1 注意 2 の「(3c) は `__speech.clear` の後の盤面で測る」は要らなくなった。「自分で選ぶ」の吹き出しは表示中の吹き出しを片付けて出すので、他の吹き出しが出ている盤面でも (3c) は緑になる(手元確認はその盤面で測った)。
5. `verify_witch_hut` (6b): `showCharChoice` の中身が変わった(コメント 2 行・`autoSkipTo` の 1 行・`resolve(null)` → `resolve(autoSkipTo)`)ので、`same:false` の関数が {`allyShadowStep`} → {`allyShadowStep`, `showCharChoice`} に増える見込み(#119 由来)。項目 4 で確かめる。
6. `driver_graph_arrows` の変異 `compactdialog` / `noautoguard` のアンカーは残してある(上の ①)ので、言い直しは要らない見込み。

### 12-3. 受入 `tools/verify_path_advice.js`(項目 3・2026-11-22・基準 HEAD `6e56491`)

新規ファイル 1 本だけ(本体 `index.html` / `js/*` は 1 バイトも変えていない・`git status` = `?? tools/verify_path_advice.js` のみ)。手本 = `verify_banter_callouts.js`(配信スナップショットの凍結・変異のメモリ注入・注入点の検算・他ドライバとのアンカー重なり検査・出力書式は同じ)。

#### 作り

- 起動 = `/index.html?diag=1&graphtest=1&secret=0`(`?autoplay` なし)。`partyMembers` = 主人公 戦士 + ファルケ / ラスムーゼン / イレーナ(node 側で `DFCast` を評価して作る)。分かれ道 = graphtest の `n0`(出口 `n1`/up・`n2`/right・`n4`/down)。
- 入口は本番の `window.__graphRun.choose()`(= `chooseExit`)。ダイアログの DOM・`__advice.log`・`speechQueue.push` の記録・`__speech.log` を読む。乱数は mulberry32 で固定、(1a)(1b)(5b) の本物の判定だけ出目 0.97。
- 期待値はドライバが自分で持つ(2 経路): 順位表 `{loot:5, rest:4, search:3, event:2, combat:1, boss:0}` と方角の語 `{up:奥, down:手前, left:西, right:東}` を§5-3 (b)・§2-9 から写し、`hints().byExit` の見えている kind で選び直す。文はページの `DFCast.byId()` の実体に差し込んだ集合。(1a) の判定者は `SkillCheck.resolveSkillCheck` を包んで受け取った `party` / `res.rep` をドライバの並び(生きている主人公 → 生きている仲間)で本物へ戻す。⛔ §4 の 72 本は写経していない。
- 矢印は 700ms 待ってから Esc(`ARROW_TAP_GATE`)・次の `choose()` の前に必ず前を解決させる(`settle`)= §12-2 注意 2・3。
- 判定 = §8 の 20 節 + **(0e) 全ページで pageerror 0 件**(手本の (0d) と同じ役。§8 の (0d) は声の装置なので別の番号にした)= **21 判定**。母集団ガード = (0a)(0b)(0c)(素で赤なら exit 3)。

#### 判定一覧(素・21/21)

| 節 | 何を見るか | 素の実測 |
|---|---|---|
| (0a) | `n0` に未踏の出口 2 本以上・`?autoplay` ではない | n1 / n2 / n4 |
| (0b) | `castId` を持つ生きた仲間 2 人以上・主人公 = 戦士 | falke / rasmussen / irena |
| (0c) | fumble で「見えている順位の出口 ≠ 本当の順位の出口」 | 見えている = n1(rest!)・本当 = n2(loot)= `n0` で成立(他の部屋を探す必要は無かった) |
| (0d) | 12 人すべての `byId().voice` に advise / yes / no が 2 本ずつ・advise は `{dir}` `{hint}` を含む | 12 人・欠け 0 |
| (0e) | pageerror 0 件 | 0 |
| (1a) | 本物の `revealExitHints` → `by` = ドライバが引き直した判定者の `castId` | `falke`(party の 1 番・tier crit) |
| (1b) | 仲間を倒れたことにして本物の判定 → `by` = null(先に `falke` を入れておき、書かれたことを見る)→ ダイアログ無しで矢印 | null・矢印 3 |
| (2a) | success + `setBy(falke)` → 文面 = `ファルケ「…」` の集合のどれか・ボタン 2 つ・矢印 0 | `ファルケ「東の道だ。金属の匂いがする。こっちに進もう。」` |
| (2b) | log の最後の `to` = 見えている kind で選び直した出口 | n2(loot) |
| (2c) | fumble → 見えている kind で選ぶ・`wrong: true`・本当の順位の出口と違う | n1(rest!)≠ n2 |
| (2d) | fail → ダイアログ無し・矢印・log 不変 | ✓ |
| (2e) | n2 を訪れた印にする → 勧めは別の出口(ドライバが訪れた出口を除いて選び直したもの)・引き返す口でもない | n4(search) |
| (2f) | crit → ダイアログの文面と、「— N 体」の付いた出口すべてで `__advice.text` を直叩きして「体ばかり」「 — 」が無い | n1「— 3 体」/ n4「— 1 体」とも落ちている |
| (3a) | 「わかった」→ 勧めた出口を返す・`advice.yes` 1 本・話し手 falke・yes の文 | 「わかった。足元に気をつけろ。」 |
| (3b) | 放置 → `AUTO_ROLL_MS`(ページから読む)−100〜+500ms で閉じ、勧めた出口・矢印 0 | 2002ms・n2・`yes: true` |
| (3c) | 他の吹き出しを表示中にしてから「自分で選ぶ」→ 矢印・`speechLog` と DOM に `advice.no`(irena・no の文) | 「……わかりました。ご判断に従います。」 |
| (3d) | `autoSkipMs` だけの `showCharChoice` → null | null(312ms) |
| (4a) | (3c) の後に Esc → もう一度 `choose()` → ダイアログ無し・log 不変・`state().done` | log 3 → 3 |
| (5a) | `?autoplay=15` → `choose()` = 候補 0・log 0・ダイアログ無し | n1 = opts[0] |
| (5b) | `castId` の無い直起動 → 本物の判定でも `by` null・勧め無し | ✓ |
| (6a) | `?advise=0` → `__advice.on()` = false・ダイアログ無し・矢印・log 0 | ✓ |

#### 実走(PowerShell から直列・各回の間に 4 秒)

ログ = `C:\Users\PC_User\.claude\dev-loop\r119\item3\`(`plain1.log` / `negative1.log` / `plain2.log`)。

| 実行 | 結果 | 所要 |
|---|---|---|
| `node tools/verify_path_advice.js`(1 回目) | **21/21 PASSED**・exit 0 | 43 秒 |
| `node tools/verify_path_advice.js --negative` | 素の基準 **21/21** + **負のコントロール 10 / 10 が検出成功**・exit 0 | 479 秒 |
| `node tools/verify_path_advice.js`(2 回目) | **21/21 PASSED**・exit 0 | 43 秒 |

⇒ 素は 3 回(1 回目・`--negative` の基準・2 回目)とも 21/21 = flaky ではない。

#### 変異ごとの落ちた判定の集合(`--negative` 実走)

| 変異 | 注入した欠陥 | 担当 | 実際に赤 | 担当外 |
|---|---|---|---|---|
| `autoplay` | 勧めを `if (!window.__autoplay)` の外へ | (5a) | **{(5a)}** | — |
| `zero` | `autoSkipTo` を `(opts && opts.autoSkipTo) \|\| null` で読む | (3b) | **{(3b)}** | — |
| `bubble` | ダイアログの文面を「分かれ道だ。」にし、勧めの文は `sayLine` の吹き出しへ | (2a) | **{(2a)}** | — |
| `copyrep` | `st.adviceBy = res.rep.castId`(写しから引く) | (1a) | **{(1a)}** | — |
| `copyof` | `copyOf` から `advise` を落とす | (0d)(2a) | **{(0d)(2a)(2b)(2c)(2e)(2f)(3a)(3b)(3c)(4a)}** | (2b)(2c)(2e)(2f)(3a)(3b)(3c)(4a) = 勧めが一度も出ないので、勧めの後を見る節が全部連鎖で赤(`NEG_ALSO` に記録・合否には使わない) |
| `truekind` | 順位を `RUN.byId[o.to].kind` で付ける | (2c) | **{(2c)}** | — |
| `failadvise` | `kind` が null の出口も順位 0 で残す | (2d) | **{(2d)}** | — |
| `seen` | 訪れた出口を候補から外さない | (2e) | **{(2e)}** | — |
| `again` | `st.adviceDone = true` を書かない | (4a) | **{(4a)}** | — |
| `switch` | `adviceOn()` が常に true | (6a) | **{(6a)}** | — |

`copyof` 以外の 9 本は**担当の 1 節だけ**が落ちる(節がきれいに分かれている)。注入点は 10 本とも原本でちょうど 1 件・行数不変・他の `tools/*.js` のアンカー / 書き換え行と重なり 0(起動時の検算)。逆向き(他ドライバの文字列リテラルのうち `index.html` / `js/companion-cast.js` に実在するコード片が、このドライバの本文に出てこない)もスクラッチの走査で 0 件 = `driver_graph_arrows` の `compactdialog` / `noautoguard` のアンカー(矢印の 1 行)にも触れていない。

#### 項目 4 への注意

1. golden の表に `verify_path_advice` を足す(21/21・約 43 秒)。`--negative` は 8 分。
2. ポート 10901〜10911 を使う(`tools/` で他に 0 件)。
3. 本体を触っていないので、§12-2 の非退行の見込み(`verify_witch_hut` (6b) の `same:false` が {`allyShadowStep`, `showCharChoice`} に増える件など)はこの項目で変わらない。
