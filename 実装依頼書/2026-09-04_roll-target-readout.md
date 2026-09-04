# #49 ロールの吹き出しに「必要な出目」と「成功/失敗 + 超過幅」を出す

- **起草**: 2026-09-04(計画窓) / **ステータス**: **承認済**(2026-09-04 ユーザー承認)
- **触るファイル**: `index.html`(CSS 1 ブロック + JS 1 関数 + 3 関数への差し込み)、
  `tools/verify_roll_target.js`(新規)、`tavern.html`(changelog 1 行のみ)
- ✅ **隣窓の #48 は承認直前に着地した**(`d9fd5d2` + `0a557a7`)。起草時にあった
  ` M 実装依頼書/2026-09-03_sheet-skillcheck-pages.md` の未コミット差分は解消済みで、
  `実装依頼書/README.md` の #49 行も**承認時に追加済み**(§11 の保留は解除)。
  ⭐ **`5d00fc5..0a557a7` で `index.html` は 1 バイトも変わっていない**
  (`git diff --stat 5d00fc5..0a557a7 -- index.html` が空)ので、
  **§2 の実測は行番号まで含めてそのまま有効**。
  ⚠ ただし着手時にもう一度 `git log --oneline -3` と `git status` を見ること
  (別窓がまた走り出している可能性がある)。並走中は `git add .` 禁止・**ファイル単位 add**・
  `git diff --cached <file>` を読んでから commit。
- ⛔ **起草時点で headless Chrome を 1 本も起動していない。** 起草中は隣窓の #48 項目4 が
  「既存 golden 2 本の非退行実測」を回している最中で、**並走させると双方が赤くなる**
  ([[project-road-harvest-47]] の実測: `run_chronicle` 並走 71/73・単独 73/73)。
  よって §8 の golden 基準は**実装窓が着手時に自分で採る**(§8 末尾に手順)。

---

## 1. 目的

戦闘中のダイスロールは頭上の吹き出し(`.rollPop`)に出るが、現状は

```
HIT
1d20(12)+6 = 18
vs AC 14
```

としか出ない。**「AC 14 に対して、さいころでいくつ出せば当たるのか」が書かれていない。**
プレイヤーは頭の中で `14 − 6 = 8` を暗算しないと「今のは危なかったのか、余裕だったのか」が分からない。
オートバトルで操作できないぶん、**ロールの読み物としての面白さ**がここに全部乗っているのに、
1.3 秒で消える吹き出しに暗算を要求しているのが問題。

**ユーザー決定(2026-09-04・開発会議 `dev-meetings/2026-09-04_roll-target-readout.md`)**:

- **採用 = 候補① + 候補②**
  - ① **必要出目の明示**: 「出目 8 以上で命中」を書く
  - ② **勝敗の一目化**: 「成功 / 失敗」と**超過幅**(`+4` / `-2`)を日本語で書く
- **不採用 = 候補③(事前ヒット率の常時表示)** … 敵の頭上は #44 の名前札で既に埋まっており、
  場所の取り合いになる。単独チケット向き。
- **不採用 = 候補④(d20 の 20 マス帯で図解)** … ①② の上に後から積める。先に文字で入れて判断する。
- **会議で確定した折衷**: **ラベル(`HIT` / `MISS` / `CRIT!` …)は英語のまま 1 文字も触らない。**
  実測でラベル語彙は **80 語以上**あり、勝敗系だけ日本語にすると語彙がまだらになる。
  日本語の判定は**新設する 1 行**が担う。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

基準コミット = **`5d00fc5`**(2026-09-04 起草時の HEAD)。

### 2-1. 吹き出しの生成点は 3 関数だけ ⭐

| ファイル:行(起草時) | 何 |
|---|---|
| `index.html:19356` | `function showRollAtPlayer(html, type)` — `pop.innerHTML = html` は **:19359** |
| `index.html:19365` | `function showRollAtEnemy(idx, html, type)` — `pop.innerHTML = html` は **:19369** |
| `index.html:19375` | `function showRollAtAlly(ally, html, type)` — `pop.innerHTML = html` は **:19386** |
| `index.html:21803` | `function showBuffPop(text)` — `rollPop skill` を作るが **`vs AC`/`vs DC` を一切含まない**(→ 対象外) |

⚠ **行番号は必ずズレる前提で読むこと。** アンカーは行番号でなく**関数名と `pop.innerHTML = html` という文字列**。

**呼び口の数(リポジトリ全文 grep の実測)**:

| 対象 | 実測値 |
|---|---|
| `showRollAtPlayer` / `showRollAtEnemy` / `showRollAtAlly` の出現 | **207 箇所**(定義 3 を含む) |
| `showRollAt(Player\|Enemy\|Ally)(` の呼び出し | **204 箇所** |
| `vs AC` を含む文字列 | **21 箇所** |
| `vs DC` を含む文字列 | **13 箇所** |
| `showRoll` というローカル別名 | `index.html:27820` / `:27831` で `showRoll = (t,c) => showRollAtPlayer(t,c)` / `= (t,c) => showRollAtAlly(attacker,t,c)` に束縛される → **中で 3 関数へ落ちる。別経路ではない** |

⭐⭐⭐ **したがって呼び口 204 は 1 バイトも触らない。** 3 関数の `pop.innerHTML = html` の直前に
純関数を 1 本挟めば、攻撃・セーヴ・カウンター・敵の攻撃、**全部に同時に効く**
(#37 の年代記フックと同じ形)。

**再測定コマンド**:

    grep -c "showRollAtPlayer\|showRollAtAlly\|showRollAtEnemy" index.html   # → 207
    grep -c "vs AC" index.html                                              # → 21
    grep -c "vs DC" index.html                                              # → 13
    grep -n "function showRollAt\|pop.innerHTML = html" index.html

### 2-2. ⚠⚠⚠ 罠 A — 判定行の HTML は 1 種類ではない(4 形態ある)

実測した現物:

| 形 | 実例(起草時の行) | 特徴 |
|---|---|---|
| A-1 | `1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14` | HIT/CRIT。合計が `.big` に入る |
| A-2 | `1d20(<b>12</b>)+6 = 18<br>vs AC 14` | **MISS 系は `.big` が無い形がある**(`:29672` 等) |
| A-3 | `1d20(<b>12</b>)+6 = 18 vs AC 14` | `:27887` 混乱の暴走だけ **`<br>` が無く半角スペース** |
| A-4 | `1d20(<b>12</b>)+3装+2 = 17<br>vs DC 15` | セーヴ。`:13855` `saveModDD(mod, sb)` = `signedDD(mod) + (sb ? "装"+signedDD(sb) : "")` → **修正が 2 項になる** |

⛔ **「`+数字` が 1 個」で正規表現を書くと A-4(セーヴ 13 箇所)が全滅する。**
⛔ **`<br>` を必須にすると A-3 が落ちる。**

⭐ 正しい捕まえ方 = **「`= [合計]`」と「`vs (AC|DC) [目標]`」の AND**。修正項の中身は読まなくてよい
(必要出目は `出目` と `合計` と `目標` の 3 つだけで出せる。§4-2 参照)。

### 2-3. ⚠⚠⚠ 罠 B — 勝敗を算術で判定すると CRIT が「失敗」と表示される

`index.html:22060` 付近:

    const hit = helpless || isThreat || atkTotal >= effectiveEnemyAc(target);

- `isThreat`(ナチュラルが `playerStats.critRange` 以上)は **合計が AC に届いていなくても命中**になる
- `helpless`(スタン/スリープ中の敵)は **ロールに関係なく自動命中**

したがって `合計 ≥ 目標` を自分で計算して「成功」と書くと、
**`CRIT!` の吹き出しに「失敗 -3」と出る事故**が現実に起きる。

⭐ **勝敗は 3 関数が既に受け取っている `type` 引数から引く。** 算術は
**必要出目と超過幅の計算にしか使わない**。`type` の語彙は実測で 7 語しかない:

| type | 出現数(実測) | 判定 |
|---|---|---|
| `"hit"` | 27 | **成功** |
| `"crit"` | 31 | **成功** |
| `"miss"` | 66 | **失敗** |
| `"fumble"` | 13 | **失敗** |
| `"init"` | 15 | 対象外 |
| `"skill"` | 107 | 対象外 |
| `"buff"` | 3 | 対象外 |

⭐ セーヴも `saved ? "hit" : "miss"` を渡している(`:19591` / `:19770` で確認)
→ **同じ `type` 規約で攻撃もセーヴも扱える**。だから判定語は「命中/外れ」でなく
**「成功/失敗」**にする(セーヴにも自然に乗る)。

**再測定コマンド**:

    grep -oE '"(hit|miss|crit|fumble|init|skill|buff)"\)' index.html | sort | uniq -c

### 2-4. ⚠⚠⚠ 罠 C — `transform` で上へ逃がすと CSS アニメーションに負ける

`index.html:2449` の `.rollPop` は `animation: rollRise 1.3s ease-out forwards;`。
その `@keyframes rollRise`(`:2566`)は **全キーフレームで `transform` を書いている**:

    0%   { transform: translate(-50%, 0)     scale(0.5); }
    15%  { transform: translate(-50%, -6px)  scale(1.1); }
    80%  { transform: translate(-50%, -18px) scale(1); }
    100% { transform: translate(-50%, -30px) scale(0.95); }

`.crit` / `.skill` はさらに `@keyframes rollCritBurst`(`:2572`。こちらも `transform` を書く)。

⛔ **`.rollPop.hasVerdict { transform: translate(-50%, -16px) }` は 100% 効かない。**
CSS アニメーションは `!important` でない宣言に勝つ([[project-walk-block-vfx-fixes]] #46 で同じ罠を踏んでいる)。

⭐ **`margin-top: -16px` を使う**(アニメーションが触っていないプロパティ)。
`.rollPop` は `position: absolute` なので `margin-top` はそのまま上への移動になる。

### 2-5. ⚠⚠ 罠 D — `showRollAtAlly` は #37 の年代記がラベル文字列を読んでいる

`index.html:19380`:

    if (html && html.indexOf('class="label">SKILL') >= 0) {
      const m = html.match(new RegExp('class="big">([^<]*)'));
      if (m && m[1]) RunChronicle.usedSkill(m[1]);
    }

⛔ **この検出より後に注釈を足す。** 順番を間違えると仲間の技が年代記から消える。
なお本チケットはラベルも `class="big">` も触らないので、順番さえ守れば衝突しない。

**実測**: ラベル文字列に依存するコードは**リポジトリ全体でここ 1 箇所だけ**
(`grep -n 'class="label">' index.html tools/*.js` で確認)。

### 2-6. ラベル語彙は 80 語以上 = ②「日本語化」は全訳しない

    grep -oE 'class="label">[^<$]*' index.html | sed 's/class="label">//' | sort | uniq -c | sort -rn

実測の上位: `SKILL` 33 / `MISS` 12 / `FUMBLE!` 11 / `SPELL` 10 / `不屈!` 6 / `STUNNED` 5 /
`CONFUSED` 5 / `RESIST` 4 / `INITIATIVE` 4 / `IMMUNE` 4 / `FREE ACTION` 4 …
テンプレート補間で組む形(`${labelPrefix}${isCrit ? "CRIT!" : "HIT"}` 等)が **36 箇所**あり、
`HIT` のリテラルは 1 回しか出ないが実際には多数生成される。

⭐ **既に日本語のラベルが 8 語混在している**(`不屈!` `鉄壁の構え` `鉄壁 DR` `脱出!` `聖印!`
`待機` `奥義` `士気高揚` `闘志 HEAL`)。ここへ勝敗系だけ足すと**まだら度が上がる**。
→ **ラベルは触らない**という会議の結論は実測でも裏付けられた。

### 2-7. 幅の制約(`white-space: nowrap`)

`index.html:2449` の `.rollPop` は `font-size: 12px` / `padding: 5px 10px` /
**`white-space: nowrap`** / `line-height: 1.3`。`.big` は 18px。

- 現行の最長行 `1d20(12)+6 = <span class="big">18</span>` ≒ **105px**(+ padding 20 = 125px)
- キャラのスプライトは **96px**
- ⛔ **横に足すと際限なく伸び、敵が 3 体並ぶと吹き出しが重なって読めなくなる**

⭐ **判定は横でなく縦(1 行追加)に足す。追加行は 122px 以内に収める。**
採用文言 `出目 8+ → 成功 +4` の見積:
`出目`(全角2 × 12 = 24)+ ` 8+ `(半角4 ≒ 27)+ `→ `(≒ 20)+ `成功`(13px bold 全角2 = 26)+ ` +4`(≒ 20)
= **約 117px** → padding 込み 137px。現行 125px に対し **+12px**。

### 2-8. `.rollPop` を見ている既存ドライバは 0 本

    grep -l "rollPop" tools/*.js      # → 出力なし

⭐ **既存 golden がこの DOM を縛っていない** = 期待値の書き換えが発生する確率は低い。
その代わり**新規ドライバが唯一の検査器**になるので、§8 の負のコントロールを手抜きしないこと。

### 2-9. 撤退スイッチの実装作法(直近の実例をそのまま踏襲)

`index.html:3641`(#44):

    const NAME_LABEL_ON =
      new URLSearchParams(window.location.search).get("namelabel") !== "0";

⭐ ダンジョン内で完結する変更なので **`?heromark=0` / `?namelabel=0` と同じ「各ページが独立に読む」型**。
`?town=0` の型(sessionStorage へ写して遷移をまたぐ)は**採らない**。

### 2-10. ポート帯の空き(⭐ base だけでなく変異が開くレンジまで数えた)

    grep -hoE "arg\('port', *'[0-9]+'\)" tools/*.js | grep -oE "[0-9]+" | sort -n | uniq

実測された base: 8765 … 9600 / **9620**(#48) / 9760 / **9790**(#47) / **9850**(#44)。
9871〜9998 の帯を全文検索した結果:

    grep -hoE "\b9(8[7-9][0-9]|9[0-9][0-9])\b" tools/*.js | sort -n | uniq -c
    # →  3 9870   (= #44 の撤退アーム基準)
    #   13 9999   (ポートではない定数)

⭐ **9880〜9899 は衝突 0 本。** 本チケットは **base 9880 / 変異 9881-9897(17 枠) / 撤退アーム基準 9898** を使う。
⛔ 他のドライバのポートは 1 つも触らない。

### 2-11. セーヴにはナチュラル 1 の自動失敗が無い(必要出目のクランプに効く)

`index.html:19586` / `:19766` で実測:

    const total = roll + wisMod + saveB;
    const saved = total >= dc;              // ← nat1 の特例も nat20 の特例も無い

一方、攻撃ロールは `index.html:22038` で
`const isFumble = !helpless && natD20 === 1;` = **ナチュラル 1 は必ず外れる**。

⭐ **クランプの規則が vs AC と vs DC で違う**(§4-3 の表)。片方の写経は禁止。

### 2-12. changelog の要否

`scripts/hooks/check_changelog.py` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

→ `index.html` を触るので **鳴る = changelog 必須**。

⭐ **書けるプレイヤー向けの要約は実在する**(「ロールの吹き出しに、さいころでいくつ出せば
当たるかと、成功/失敗が出るようになった」)。本チケットは**画面に見える変化そのもの**なので、
CLAUDE.md の「見える変化が無いのに本番ファイルを触る設計は採らない」に抵触しない。文面は §10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | ① CSS: `.rollPop .verdictLine` 系 + `.rollPop.hasVerdict` を 1 ブロック追加 ② JS: 純関数 `rollTargetLine(html, type)` を新設し `window.__rollTargetFmt` に露出 ③ `showRollAtPlayer` / `showRollAtEnemy` / `showRollAtAlly` の `pop.innerHTML = html` を 3 行ずつ差し替え ④ 撤退スイッチ定数 1 本 |
| `tools/verify_roll_target.js` | **新規**。port 9880 / 変異 9881-9897 / 撤退アーム基準 9898 |
| `tavern.html` | **changelog 1 行のみ**(`py tools/add_changelog.py` が書く。手で編集しない) |

✅ `実装依頼書/README.md` の #49 行は**承認時(2026-09-04)に追加済み**。実装窓は
**この依頼書自身の §12 と README の進行度だけ**を更新すればよい。
⛔ `実装依頼書/2026-09-03_sheet-skillcheck-pages.md`(#48)は開かない。
§2-1〜§2-12 の実測はこれを一度も読まずに全部取れており、実装にも必要ない。

⛔ **動かしてはいけない既存値**(名指し):
`.rollPop` の `font-size: 12px` / `padding: 5px 10px` / `white-space: nowrap` / `animation` 各種 /
`@keyframes rollRise` / `@keyframes rollCritBurst` / 吹き出しの寿命 `1500 : 1300` /
`pop.style.left` の式 / ラベル 80 語 / `showRollAtAlly` の SKILL 検出ブロック。

---

## 4. STEP1 — 表示仕様を決める(実装前にここを読み切る)

### 4-1. 変更は「既存 HTML の末尾に 1 行 append する」だけ ⭐

**既存の 3 行は 1 文字も変えない。** これにより §8 の恒等 assert が
「元の HTML が新 HTML の**前方一致プレフィックス**になっている」という機械的に強い形で書ける。

**現行**:

    HIT
    1d20(12)+6 = 18
    vs AC 14

**新(vs AC・成功)**:

    HIT
    1d20(12)+6 = 18
    vs AC 14
    出目 8+ → 成功 +4

**新(vs AC・失敗)**:

    MISS
    1d20(5)+6 = 11
    vs AC 14
    出目 8+ → 失敗 -3

**新(vs DC・セーヴ成功)**:

    SAVE
    1d20(14)+3装+2 = 19
    vs DC 15
    出目 10+ → 成功 +4

追加する DOM(1 行ぶん):

    <span class="verdictLine">出目 <b class="need">8+</b> → <b class="win">成功</b> <span class="marg">+4</span></span>

`win` は成功、`lose` は失敗。**この 5 つの class 名(`verdictLine` / `need` / `win` / `lose` / `marg`)は
§8 のドライバが文字列で握るので改名禁止。**

### 4-2. 必要出目の計算

読み取れるのは 3 つだけ:

- `natD20` … `1d20(<b>N</b>)` の N
- `total` … `= [<span class="big">]T[</span>]` の T
- `target` … `vs (AC|DC) D` の D

    修正 = T − N
    必要出目 raw = D − 修正 = D − T + N

⭐ **修正項の中身(`+6` / `+3装+2`)を読む必要が無い。** これが §2-2 罠 A への答え。

### 4-3. クランプ(⚠ vs AC と vs DC で規則が違う。§2-11 の実測に基づく)

| raw の値 | vs AC の表記 | vs DC の表記 | 理由 |
|---|---|---|---|
| `raw ≤ 1` | `出目 2+` | `出目 1+` | 攻撃はナチュラル 1 = ファンブル自動ミス(`:22038`)。セーヴにその特例は無い(`:19587`) |
| `2 ≤ raw ≤ 20` | `出目 N+` | `出目 N+` | そのまま |
| `raw > 20` | `会心のみ` | `届かない` | 攻撃は `isThreat` でナチュラル 20 が自動命中扱いになる。セーヴには救済が無い |

### 4-4. 超過幅

    margin = T − D

- `margin ≥ 0` → `+N` / `margin < 0` → `-N`(符号付きでそのまま)
- ⚠ **`type` が示す勝敗と `margin` の符号が食い違う場合は、超過幅を出さない**
  (§2-3 の罠 B。`CRIT!` で `margin < 0` = ナチュラル 20 の脅威、`HIT` で `margin < 0` = 無抵抗の自動命中)。
  そのときは `出目 8+ → 成功` だけを出す。
  ⭐ **矛盾した数字を出すくらいなら、数字を落とす。**

### 4-5. 対象の判定(この AND を満たすものだけ注釈する)

1. `type` が **`hit` / `miss` / `crit` / `fumble`** のいずれか
2. HTML が **`1d20(<b>N</b>)`** を含む
3. HTML が **`= [<span class="big">]T[</span>]`** を含む
4. HTML が **`vs (AC|DC) D`** を含む

⛔ 1 つでも欠けたら **HTML を 1 バイトも変えずに返す**。
これで `FUMBLE!`(`=` が無い)/ `CRIT THREAT!`(同)/ `INITIATIVE`(`vs` が無い)/
クリ確認ロール / `SKILL` / `SPELL` / バフ / `HELPLESS!` / `AUTO HIT` / `STORM!` / `SHATTER!` /
`OUT OF RANGE` などが自動的に除外される。

---

## 5. STEP2 — 実装

### 5-1. CSS(`.rollPop` のブロックの直後へ)

    /* ══ #49 判定行 ═══════════════════════════════════════════════════════
     * ⚠⚠⚠ 上へ逃がすのに transform を使ってはいけない。.rollPop は
     *   animation: rollRise (と .crit/.skill の rollCritBurst) が全キーフレームで
     *   transform を書いており、CSS アニメーションは !important でない宣言に勝つ。
     *   margin-top はアニメーションが触っていないので効く。 */
    .rollPop.hasVerdict { margin-top: -16px; }
    .rollPop .verdictLine {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      opacity: 0.95;
    }
    .rollPop .verdictLine .need { font-weight: 700; }
    .rollPop .verdictLine .win  { font-size: 13px; font-weight: 700; color: #ffd980; }
    .rollPop .verdictLine .lose { font-size: 13px; font-weight: 700; color: #9a9aa6; }
    .rollPop .verdictLine .marg { font-size: 11px; opacity: 0.80; }

### 5-2. 撤退スイッチ(`NAME_LABEL_ON` の隣へ)

    /* ══ #49 撤退スイッチ ?rolltarget=0 ══════════════════════════════════
     * OFF のとき、判定行の append を一切行わない = 吹き出しは #49 以前の
     * 3 行構成へ完全に戻る (.hasVerdict も付かないので margin-top も戻る)。
     * ⚠ 判定はブート時に 1 回だけ。ページ遷移はまたがない
     *   (ダンジョン内で完結するので ?namelabel=0 / ?heromark=0 と同じ型。
     *    ?town=0 の sessionStorage 型は採らない)。 */
    const ROLL_TARGET_ON =
      new URLSearchParams(window.location.search).get("rolltarget") !== "0";

### 5-3. 純関数(3 関数の定義より前に置く)

    /* #49: ロールの吹き出しへ「必要な出目」と「成功/失敗+超過幅」の 1 行を足す。
     * ⭐ 呼び口 204 箇所は 1 バイトも触らない。生成点 3 関数の innerHTML 直前でここを通す。
     * ⚠ 勝敗は必ず type から引く (合計 vs 目標 の算術から引くと、ナチュラル20 の脅威と
     *   無抵抗の自動命中で「CRIT! なのに 失敗 -3」と出る)。
     * ⚠ 修正項は読まない (セーヴは saveModDD が "+3装+2" の 2 項を返すため)。
     *   必要出目は 出目 N・合計 T・目標 D の 3 つだけで出る: raw = D - T + N。
     * 戻り値: 変えなかったときは元の html を === で同一のまま返す (呼び側が判定に使う)。*/
    function rollTargetLine(html, type) {
      if (!ROLL_TARGET_ON) return html;
      if (!html) return html;
      if (type !== "hit" && type !== "miss" && type !== "crit" && type !== "fumble") return html;

      const mNat = html.match(/1d20\(<b>(\d+)<\/b>\)/);
      const mTot = html.match(/=\s*(?:<span class="big">)?(-?\d+)/);
      const mTgt = html.match(/vs\s+(AC|DC)\s+(\d+)/);
      if (!mNat || !mTot || !mTgt) return html;

      const nat = +mNat[1], total = +mTot[1], kind = mTgt[1], target = +mTgt[2];
      const raw    = target - total + nat;         // 必要出目 (素の値)
      const floorN = (kind === "AC") ? 2 : 1;      // ⚠ 攻撃は nat1 が自動ミス / セーヴには特例なし
      const need   = (raw > 20) ? null : Math.max(floorN, raw);   // null = 20 でも届かない

      const won    = (type === "hit" || type === "crit");
      const margin = total - target;
      // ⚠ type と算術が食い違うとき (nat20 の脅威 / 無抵抗の自動命中) は超過幅を出さない。
      //   矛盾した数字を出すくらいなら数字を落とす。
      const showMargin = (won === (margin >= 0));

      const needTxt = (need === null)
        ? (kind === "AC" ? '<b class="need">会心のみ</b>' : '<b class="need">届かない</b>')
        : '出目 <b class="need">' + need + '+</b>';
      const verdict = won ? '<b class="win">成功</b>' : '<b class="lose">失敗</b>';
      const margTxt = showMargin
        ? ' <span class="marg">' + (margin >= 0 ? "+" : "") + margin + '</span>'
        : '';

      return html + '<span class="verdictLine">' + needTxt + ' → ' + verdict + margTxt + '</span>';
    }
    // 検証シーム (純関数なので本番挙動に影響しない。__composeSpriteTransform と同じ型)
    window.__rollTargetFmt = rollTargetLine;

### 5-4. 3 関数の差し替え(各 1 箇所 × 3)

`pop.innerHTML = html;` を次に置き換える。**`showRollAtAlly` では #37 の SKILL 検出ブロックより後**
(= 元の `pop.innerHTML = html;` の位置のまま)であることを確認すること。

    const html2 = rollTargetLine(html, type);
    pop.innerHTML = html2;
    if (html2 !== html) pop.classList.add("hasVerdict");   // 1行ぶん上へ逃がす (margin-top)

---

## 6. STEP3 — 検証ドライバ

`tools/verify_roll_target.js`(新規)。既存ドライバ(`verify_enemy_name_label.js` 等)の
puppeteer-core 骨格をそのまま流用する。

### ⚠ 計測機構 — 実プレイに頼らない ⭐⭐⭐

[[project-road-harvest-47]] の実測どおり、**実プレイ系ドライバを他の headless Chrome と並走させると
偽の赤が出る**(`run_chronicle` 73/73 が並走で 71/73)。本チケットは検査対象が**純関数**なので、
**合成入力を `window.__rollTargetFmt` へ直接食わせる**方式を主にする。

    const out = await page.evaluate((h, t) => window.__rollTargetFmt(h, t), html, type);

実プレイが要るのは §0 の母集団ガード 2 本と (4c)(5a)(5b)(5c)(6a)(6b) だけ。

---

## 7. 撤退スイッチ

- **`?rolltarget=0`** — 判定行を一切 append しない。吹き出しは #49 以前の 3 行構成へ戻り、
  `.hasVerdict` も付かないので `margin-top` も元へ戻る。
- ⚠ 判定位置 = ブート時 1 回(`ROLL_TARGET_ON` の定数化)。
  ページ遷移は**またがない**(ダンジョン内で完結。`?namelabel=0` と同じ型)。

---

## 8. 受入条件 — `tools/verify_roll_target.js`(新規)

**観測するもの** = 純関数の出力文字列(決定論)と、実プレイで判定行が実在すること。
**観測しないもの** = 色・フォントサイズ・`margin-top` の px 値・文言そのもの(下の「測らないこと」)。

### §0 装置(先に母集団を確かめる)

- **(0a)** `window.__rollTargetFmt` が `typeof === "function"` である。
  ⭐ **これが無いと以降の全 assert が例外か undefined で空振りする。**
- **(0b)** 期待値を**この依頼書から写経せず、配信中の `index.html` から導出する**:
  配信バイトから `function showRollAt` の定義を数え **3 本ちょうど**、
  かつ `pop.innerHTML = html2` が **3 箇所**であること。
  ⭐ 生成点が 4 本目に増えたら(=どこかで注釈が抜けたら)ここで赤くなる。
- **(0c)** 実プレイ(シナリオ1 を `?autoplay` で回す)で `.rollPop` が **1 枚以上**出ている。
  ⭐ 母集団ガード。0 枚なら以降の実プレイ assert は全部空振り。
- **(0d)** そのうち **`.verdictLine` を持つものが 1 枚以上**ある。

### §1 必要出目

- **(1a)** `1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14`, `"hit"`
  → `出目 8+` を含む。**2 経路照合**: ドライバ側は `14 - 18 + 12 = 8` を**自分で計算**して
  期待文字列を組む(依頼書の "8" を写経しない)。
- **(1b)** `.big` が無い形(A-2)でも同じ `出目 8+` が出る。
- **(1c)** `<br>` が無い形(A-3 = `= 18 vs AC 14`)でも同じ `出目 8+` が出る。
- **(1d)** 修正が 2 項の形(A-4)でも正しい必要出目が出る
  (`1d20(<b>14</b>)+3装+2 = 19<br>vs DC 15` → `出目 10+`)。
- **(1e)** クランプ下限(AC): 修正 +18 / AC 14(raw = −2)→ **`出目 2+`**(1 ではない)。
- **(1f)** クランプ下限(DC): 修正 +18 / DC 14(raw = −2)→ **`出目 1+`**。
  ⭐ **(1e) と (1f) が同じ値になったら赤**。§2-11 の「AC と DC で規則が違う」を機械で守る。
- **(1g)** クランプ上限(AC): raw = 23 → **`会心のみ`**。
- **(1h)** クランプ上限(DC): raw = 23 → **`届かない`**。

### §2 勝敗と超過幅

- **(2a)** `type="hit"` → `class="win"` を含み `class="lose"` を含まない。
- **(2b)** `type="miss"` → `class="lose"` を含み `class="win"` を含まない。
- **(2c)** `type="crit"` → `class="win"`。`type="fumble"` → `class="lose"`。
- **(2d)** 超過幅: 合計 18 / 目標 14 / `"hit"` → `+4`。合計 11 / 目標 14 / `"miss"` → `-3`。
  ⭐ 数値はドライバが `total - target` を**自分で計算**して照合する。
- **(2e)** ⚠ **矛盾ケースで超過幅が出ない**: 合計 11 / 目標 14 / `type="crit"`
  (= ナチュラル 20 の脅威)→ `class="win"` は出るが **`class="marg"` は出ない**。
- **(2f)** 逆の矛盾ケース: 合計 18 / 目標 14 / `type="miss"` → `class="lose"` かつ `marg` なし。

### §3 対象外(触らないもの)

- **(3a)** `type="skill"` / `"init"` / `"buff"` は、`vs AC` を含む HTML を渡しても
  **出力が入力と完全一致**(`out === input`)。
- **(3b)** `FUMBLE!` の実形(`<span class="label">FUMBLE!</span>1d20(<b>1</b>)+6`、`=` が無い)
  → **出力が入力と完全一致**。
- **(3c)** `INITIATIVE` の実形(`= <span class="big">15</span>`、`vs` が無い)
  → **出力が入力と完全一致**。
- **(3d)** `HELPLESS!` の実形(`無抵抗の敵に自動命中 ×2`)→ **出力が入力と完全一致**。

### §4 恒等(非退行)

- **(4a)** 注釈された出力は、**入力を前方一致プレフィックスとして含む**
  (`out.startsWith(input) === true`)。⭐ 既存 3 行が 1 文字も変わっていないことの機械証明。
- **(4b)** 追加分は `<span class="verdictLine">` で始まり `</span>` で終わる 1 塊のみ
  (`out.slice(input.length)` を検査)。
- **(4c)** #37 の年代記シーム: 実プレイで `RunChronicle` が技名を 1 件以上拾えていること。
  ⭐ 罠 D の回帰検査。

### §5 レイアウト

- **(5a)** 実プレイで `.verdictLine` を持つ `.rollPop` は `hasVerdict` class を持つ。
- **(5b)** `.rollPop.hasVerdict` の `getComputedStyle().marginTop` が **負の値**である。
  ⚠ **`transform` では検査しない**(§2-4 の罠 C。アニメーション中の `transform` を読むと
  `rollRise` の値が返り、実装が正しくても間違っていても同じ値になる = 永久緑)。
- **(5c)** `.verdictLine` を持つ `.rollPop` の `offsetWidth` が **200px 未満**である。
  ⭐ `white-space: nowrap` で横に膨らんでいないことの検査(§2-7)。

### §6 撤退

- **(6a)** `index.html?rolltarget=0` で実プレイ → `.rollPop` は 1 枚以上出るが
  **`.verdictLine` は 0 枚**。
  ⚠ **「`.verdictLine` が 0 枚」だけでは自明に緑になりうる**ので、
  **同じページで (0c) の母集団ガード(`.rollPop` ≥ 1)を必ず同時に測る**
  ([[project-dnd-map-maker]] の `?doors=0` が母集団未到達で空振りした事故と同型)。
- **(6b)** `?rolltarget=0` のページで `hasVerdict` class が 0 個。

### ⛔ 測らないこと

- **色そのもの**(`#ffd980` / `#9a9aa6`)… ミサキが実機を見て動かす余地を残す
- **フォントサイズの px 値**(11px / 13px)… 同上
- **`margin-top` の絶対値**(-16px)… 負であることだけ縛る((5b))
- **文言そのもの**(`出目` / `成功` / `失敗` / `会心のみ` / `届かない`)…
  ⭐ ただし `class` 名(`verdictLine` / `need` / `win` / `lose` / `marg`)は縛る。
  **文言は日本語として推敲する余地を残し、構造だけ固定する。**
  (⚠ (1a)〜(1h) の `出目 N+` は数値部分の照合が目的。文言を変えるときは
   ドライバ側の組み立ても同時に直すこと ＝ 写経ではなく計算で作る)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `noseam` | `window.__rollTargetFmt` を消す | **(0a)** |
| `onlyplayer` | `showRollAtEnemy` / `showRollAtAlly` の差し替えを元へ戻す | **(0b)** |
| `verdictbymath` | ⭐ **罠 B の再現** — `won` を `type` でなく `total >= target` から引く | **(2e)(2f)** |
| `singlemod` | ⭐ **罠 A の再現** — 合計の正規表現を `\+\d+ = ` 前提の 1 項限定にする | **(1d)** |
| `nobr` | ⭐ **罠 A-3 の再現** — `vs` の正規表現に `<br>` を必須にする | **(1c)** |
| `samefloor1` | ⭐ **§2-11 の再現** — `floorN` を AC/DC ともに 1 に固定 | **(1e)** |
| `samefloor2` | 同上を 2 に固定 | **(1f)** |
| `nocap` | `raw > 20` の分岐を消して `出目 23+` を出す | **(1g)(1h)** |
| `xformlift` | ⭐ **罠 C の再現** — `margin-top` をやめて `transform: translate(-50%,-16px)` にする | **(5b)** |
| `sidebyside` | 判定行を `display:block` でなく横へ連結する | **(5c)** |
| `clobber` | 追加行を append でなく `vs AC 14` の**置換**にする | **(4a)** |
| `skillmangle` | ⭐ **罠 D の再現** — `showRollAtAlly` で SKILL 検出**より前**に注釈する | **(4c)** |
| `alltypes` | `type` の白名簿を外して `skill`/`init`/`buff` も注釈する | **(3a)** |
| `looseanchor` | `= 合計` の AND 条件を外し `vs` だけで注釈する | **(3b)(3c)** |
| `retreatdead` | `ROLL_TARGET_ON` の判定を消して常に注釈する | **(6a)(6b)** |
| `retreatall` | 逆に常に `false` にして注釈を一切しない | **(0d)** |

⭐ **§2-2 / §2-3 / §2-4 / §2-5 / §2-11 の罠が、それぞれ `singlemod`+`nobr` / `verdictbymath` /
`xformlift` / `skillmangle` / `samefloor1`+`samefloor2` として全部装置に内蔵されている。**
起草中にしか見えなかった知見が、実装後も機械で守られる形になる。

⚠ 変異の当て先は**「その assert が実際に読む値の供給口」**にすること
([[project-road-harvest-47]] の教訓)。仕様の言葉で当てると空振りする。
⚠ 条件を潰す変異は**「条件が 1 本とは限らない」**(§4-5 の AND は 4 本ある)。

### 既存 golden の非退行(実装後に必ず走らせる)

⛔ **起草窓では 1 本も走らせていない**(隣窓の #48 が headless を回しており、並走で双方が赤くなるため)。
**実装窓が着手時に、実装に手を付ける前の HEAD で自分で基準を採ること。** 手順:

    # ① 着手前に 3 本の基準を採る (実装に 1 行も書く前)
    node tools/driver_action_priority.js   > /tmp/base_ap.txt   2>&1
    node tools/driver_cast_circle.js       > /tmp/base_cc.txt   2>&1
    node tools/verify_enemy_name_label.js  > /tmp/base_enl.txt  2>&1
    # ② 実装後に同じ 3 本を走らせ、NG の「項目の集合」を diff で比べる (数字だけ見ない)

⭐ **判定は「N/N の数字」でなく「落ちている項目の集合」で見る**
([[project-mercenary-roster]] の教訓: golden の記録済み期待値そのものが腐る)。
⚠ 実プレイ系ドライバの**単発の赤はまず 1 回再実行**する。
⚠ **他の headless Chrome と並走させない**(隣窓の #48 が完了してから走らせる)。

**この 3 本を選んだ理由**: `.rollPop` を直接見ているドライバは実測 0 本(§2-8)なので、
リスクは「吹き出しが 1 行伸びて他の DOM 計測に被る」経路のみ。
戦闘を実際に回す 2 本(`driver_action_priority` / `driver_cast_circle`)と、
**頭上の幾何を px で測る** 1 本(`verify_enemy_name_label`)で押さえる。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` 直開きはナレーション音声が無音になる)。

1. **iPhone 縦持ちで 4 行が 1.3 秒で読めるか**(← 唯一の本当のリスク)。読めなければ
   寿命でなく**文言を削る**(`出目 8+ → 成功` まで落とす)。⛔ 1300ms は動かさない。
2. 敵が 3 体以上並んだとき、吹き出しどうしが重ならないか((5c) は単体幅しか見ていない)。
3. `margin-top: -16px` でキャラの顔が潰れなくなったか。逆に名前札(#44)と被っていないか。
4. `成功` の金(`#ffd980`)が `.hit` の金枠(`#c8a046`)に埋もれていないか。
5. `失敗` の灰(`#9a9aa6`)が `.miss` の灰背景で読めるか。
6. CRIT の派手なアニメーション(`rollCritBurst` の rotate)の中で判定行が読めるか。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>ロールに「いくつ出せば当たるか」を表示</b> — 命中判定とセーヴの吹き出しに、さいころで必要な出目と、成功か失敗か、目標値との差が出るようになった。"

---

## 11. やらないこと

- ⛔ **ラベル(`HIT` / `MISS` / `CRIT!` …)の日本語化**。実測で 80 語以上あり、
  勝敗系だけ訳すと語彙がまだらになる(§2-6)。全訳は別チケット。
- ⛔ **候補③(交戦前のヒット率%表示)**。頭上が #44 の名前札で埋まっている。別チケット。
- ⛔ **候補④(d20 の 20 マス帯による図解)**。①② の上に後から積める。別チケット。
- ⛔ **`showBuffPop` への適用**。`vs AC` / `vs DC` を 1 つも含まないので対象外(§2-1)。
- ⛔ **吹き出しの寿命(1300 / 1500ms)の変更**。テンポが全戦闘で鈍る。
- ⛔ **`updateInfo` 側のログ文言**(`18 vs AC14 → ミス` 等)の変更。今回は吹き出しだけ。
- ✅ **`実装依頼書/README.md` への #49 行追加は完了済み**(2026-09-04 承認時)。
  実装窓は**進行度とステータスの更新だけ**を行う(行を新設しない)。

---

## 12. 実装結果

**dev-loop 4 項目・停止 0 回。** 締めの実測日 = 2026-09-04。

### 12-1. コミット

| 項目 | hash | 内容 |
|---|---|---|
| 起草 | `e61c871` | 本依頼書 + 台帳への #49 行追加 |
| 項目1 | `bbcb091` | 装置 `tools/verify_roll_target.js`(§0 (0a)〜(0d) / port 9880) |
| 項目2 | `066e5fb` | 判定行の本体実装 / 受入 §1〜§6 を緑に(30/30) |
| 項目3 | `3a2f28a` | 負のコントロール 16 本 / `--negative` を全緑(53/53) |
| 項目4 | 本節を書いたコミット | golden 3 本の非退行 / §12 の実測記録 / 台帳の更新 |

### 12-2. 受入条件 — `tools/verify_roll_target.js`(新規 1,661 行)

    node tools/verify_roll_target.js             → 30/30 PASSED   FAILED 0   PENDING 0   (exit 0)
    node tools/verify_roll_target.js --negative  → 53/53 PASSED   FAILED 0   PENDING 0   (exit 0)

- assert **30 本** / 変異 **16 本**。PENDING 0 = (n9a)「PENDING の変異が 0 件(16 本すべて実装済)」が機械確認。
- 装置が印字した追記の実物:
  `<span class="verdictLine">出目 <b class="need">8+</b> → <b class="win">成功</b> <span class="marg">+4</span></span>`
- ポート: base **9880** / 変異 **9881〜9896** / 予備 9897 / 撤退アーム **9898**。
  他ドライバとの衝突 0 本(他のポート帯には一切触れていない)。

### 12-3. 既存 golden 3 本の非退行(⭐ 1 本ずつ順に実行。headless の並走なし)

| golden | 実装前(`e61c871`)の基準 | 実装後(本コミット直前)の実測 | 判定 |
|---|---|---|---|
| `node tools/driver_action_priority.js` | PASSED 92 / FAILED 0 / PENDING 0 | **PASSED 92 / FAILED 0 / PENDING 0** | 一致 |
| `node tools/driver_cast_circle.js` | 56/56 PASS | **56/56 PASS**(NG 行 0) | 一致 |
| `node tools/verify_enemy_name_label.js` | 30/30 PASSED / FAILED 0 / PENDING 0 | **30/30 PASSED / FAILED 0 / PENDING 0** | 一致 |

⭐ **判定は数字ではなく「落ちている項目の集合」で見た** — 3 本とも FAILED / NG 行が **0** なので集合は空。
再実行を要した単発の赤も **0 件**(3 本とも 1 回目で緑)。
⛔ **golden の期待値は 1 文字も書き換えていない** — `git diff --numstat e61c871 HEAD` に
`tools/driver_action_priority.js` / `tools/driver_cast_circle.js` / `tools/verify_enemy_name_label.js` は
**1 本も出てこない**。

### 12-4. 変更範囲の実測(`git diff --numstat e61c871 HEAD`)

      75      3   index.html                    ← 本体(CSS + 撤退スイッチ + 純関数 + 3 関数の差し替え)
       1      1   tavern.html                   ← changelog 1 行(§10)
    1661      0   tools/verify_roll_target.js   ← 新規

⭐ **呼び口 204 箇所は無改修** — `grep -c -E "showRollAt(Player|Enemy|Ally)\(" index.html` = **204** のまま。
DOM 生成点の 3 関数だけを差し替えた(§2-1 の設計どおり)。

### 12-5. 依頼書からの逸脱と理由

**無し。** 表示仕様(§4)・実装方針(§5)・撤退スイッチ(§7)・やらないこと(§11)は依頼書のまま実装した。
逸脱ではなく **「依頼書の指定が実物とずれていた」** 点が 6 件あり、下記のとおり装置側で吸収している
(いずれも受入条件を**緩めず**、必要な箇所は**強めて**解いた)。

### 12-6. ⭐ 依頼書の指定が実物でずれた点(次のチケットの資産)

1. **§8 変異表 `onlyplayer`** — 「`edits[]` で 2 箇所」とあったが、実物は **3 箇所とも同一文字列**で
   一意にならず **exit 3**。→ `transform` 方式へ変更した。
   ⭐ 教訓 = **変異アンカーの「箇所数」は起草時の目視ではなく、実際に置換して一意になるかで決まる。**
2. **§8 変異表 `looseanchor`** — 「`mTot` を条件から外す」だけでは **(3b)(3c) は緑のまま**だった。
   AND を **2 本**外して初めて赤くなる(`FUMBLE!` は `=` も `vs` も持たない / `INITIATIVE` は `vs` を持たない)。
   ⭐ 教訓 = **§4-5 の AND 4 本のうち「実際にその標本を弾いている条件」は標本ごとに違う。**
3. **§8 変異表 `skillmangle`** — 「SKILL 検出より前に注釈する」形では、白名簿が `"skill"` を弾くため
   **原理的に (4c) を赤にできない**。→ **4 点同時変異** + **(4c) を 2 経路照合へ強化**して解いた。
4. **§8 (5c)** — 「`offsetWidth` 200px 未満」だけでは `sidebyside` を検出できない
   (素 115〜126px / inline 化しても 160〜168px で、**変異の前後とも閾値の同じ側**に居る)。→ **AND を 1 本追加**。
   ⭐ 教訓 = **閾値 1 本だけの assert は空振りしうる。必ず変異を当ててから確定する。**
5. **項目1 の観測メモにあった `INITIATIVE` の実形 `1d20(<b>8</b>)` は誤り** —
   本番テンプレは `1d20(${n})` で **`<b>` を付けない**。
6. **⭐⭐⭐ 装置の観測打ち切りを「`.rollPop` 総数 20 枚」にすると (0d) が「測れない」赤になる** —
   交戦の頭でイニシアチブが人数ぶん一斉に出るため、**観測した 24 枚が全部 init** で窓が閉じ、
   注釈対象が 1 枚も入らない。→ 打ち切りは **§4-5 の AND を満たす吹き出しの数(8 枚)**にした。
   ⭐ 教訓 = **母集団の打ち切りは「全体の枚数」でなく「測りたい母集団の枚数」で切る。**

### 12-7. 残った宿題

- **§9 の実機/実感の確認 6 項目**(機械では測れない)。筆頭 = **1. iPhone 縦持ちで 4 行が 1.3 秒で読めるか**。
  読めなければ**寿命(1300ms)は動かさず文言を削る**(`出目 8+ → 成功` まで落とす)。
- 撤退 = **`?rolltarget=0`**。実測で `.rollPop` は 50 枚出るが `.verdictLine` は **0 枚** /
  `hasVerdict` class も **0 個**(母集団ガードを同じページで同時に測っているので自明な緑ではない)。
