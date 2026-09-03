# #48 プレイヤーシートの期待表を「そのページに載っている script」から引く — world の技能区画

- **起草**: 2026-09-03(起草窓 `claude-39`) / **ステータス**: **承認済**(2026-09-03 ユーザー承認)
- **着手**: ⏸ **保留 — #47「街道の実り」の完了待ち**。#47 の §8 が
  「`verify_player_sheet` は FAILED の集合が `{2c,2d,8a,8f}` のままなら非退行」を
  物差しにしているため、先に直すと**その物差しごと動く**(§2-8)。
  ⇒ 着手前に `git log --oneline -6` で #47 の 4 コミットの着地を確認すること。
- **触るファイル**: `tools/verify_player_sheet.js` **のみ**(本番コードは 1 バイトも触らない)
- ⛔ **触らないファイル**: `index.html` / `world.html` / `js/road-events.js` / `js/player-sheet.js` /
  `tools/verify_road_boon.js` / `実装依頼書/README.md`
  — **別窓 (`claude-be`) が依頼書 #47 を実装中**。本チケットはこれらを**一度も開かずに完了できる**
  (§2-8 / §3 で確認済み)。`git add .` 禁止・**ファイル単位 add**・
  `git diff --cached tools/verify_player_sheet.js` を読んでから commit。
- ⛔⛔⛔ **着手 = #47 完了後**。理由は §2-8。**#47 が飛んでいる間は着地させない。**

---

## 1. 目的

`tools/verify_player_sheet.js` は **2026-09-03 の着手前から赤い**。

```
node tools/verify_player_sheet.js
  → 66/70 PASSED   FAILED 4   PENDING 0   (exit 1)
     FAILED: (2c) (2d) (8a) (8f)
```

真因は **#45 項目2 の `475839d`** が `world.html` へ `js/skill-check.js` を載せたこと。
これで world でも `SkillCheck` が生き、プレイヤーシートに**習熟 / 技能の区画が出るようになった**。
ところがドライバの期待表は「world では技能区画を伏せる」のまま取り残された。
⇒ **実装が正しくなり、期待値だけが古い**形であって、実装の退行ではない(§2-1 で数字で示す)。

放置すると 2 つ困る:

1. **赤が常態になる。** 次に本当の退行が入っても「いつもの 4 本」に埋もれて気づけない。
2. **負のコントロールが壊れている。** `--negative` は **91/101 FAILED 10**(#36 完了時は 101/101)。
   素の赤 4 本のうち (2c)(2d) が**他の変異 6 本の「担当外を巻き込まない」検査を偽の赤にしている**(§2-6)。

**ユーザー決定(2026-09-03)**:

- ⭐ **world でシートに「習熟 / 技能」が出る現状を『正しい姿』として認める。**
  ⇒ 直すのは**ドライバの期待値だけ**。`js/player-sheet.js` に「world では伏せる」条件は**足さない**。
  - 不採用にした案 = 「world では伏せる」(本番コード変更)。⭐ **なぜそれではないか**:
    実装の規則は `(2c)` のコメントどおり「**伏せる理由は『供給口が無い』『SkillCheck が無い』の
    2 つだけ**」。ここへ「ページ名の名指し」という 3 つ目の理由を持ち込むと、#36 が畳んだ設計が
    1 段戻る。しかも world は街道の出来事で技能判定(説得/洞察/知覚/運動/捜査/宗教)を**実際に振る**
    ページで、自分の技能値が見えないほうが不自然になる。
- ⭐ **直し方は「導出 + 集合固定」**(定数の書き換えだけで済ませない)。
  ⇒ 期待表を「**配信バイトに `<script src="js/skill-check.js">` があるか**」から導出し、
  併せて「**SkillCheck 搭載ページ = {index, tavern, world} の 3 枚**」を固定する assert を新設する。
  - 不採用にした案 = 5 箇所の定数を書き換えるだけ。⭐ **なぜそれではないか**: 次に
    skill-check.js が別ページへ載った瞬間、**#45 と同じ事故(赤に気づかず出荷)がそのまま再発する**。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ **行番号は書かない。** #47 の起草中に「他チケットが 1 本着地しただけで行番号が全滅する」を
踏んでいるので、**すべて構造(関数名・assert の id・定数名)で位置を指す**。

### 2-1. ⭐⭐⭐ 4 本とも「実測値は正しく、ハードコードした定数だけが古い」

`node tools/verify_player_sheet.js` の実出力(2026-09-03、この窓が採取):

| assert | 実測された姿 | 古い期待 | 不一致の中身 |
|---|---|---|---|
| **(2c)** | world 伏せ = `["Saves","Combat","Body","Attacks"]`(4 区画) / 伏せ計 **20** / 全部出たページ 1 | world = SUPPLY+SKILLC(6) / 計 **22** | **表と母集団ガードの定数だけ** |
| **(2d)** | SkillCheck 有り **3 枚(照合 36 マス)** / 無し 2 枚 / **不一致 0 件** | `withSC===2` `withoutSC===3` `cells===24` | **カウンタの定数だけ** |
| **(8a)** | world 伏せ = `["dfSheetSecBody"]` | world = `["dfSheetSecSkills","dfSheetSecBody"]` | **表だけ** |
| **(8f)** | index / tavern / **world** とも受動知覚 **13 = 期待 13** / **不一致 0 件** | `withSC===2` `withoutSC===3` | **カウンタの定数だけ** |

⭐⭐⭐ **これが「期待値を緩めるのではない」ことの証拠**:
(2d) の照合マスは **24 → 36 へ 12 増える**。(8f) の 2 経路照合ページは **2 → 3 枚に増える**。
つまり直したあとのほうが**縛りは強い**。緩むのは「world では技能を伏せているはずだ」という
**事実に反した 1 行だけ**。

**再測定コマンド**:

```bash
node tools/verify_player_sheet.js
```

### 2-2. 真因と、#45 がなぜ気づけなかったか

```bash
git show 475839d -- world.html | grep skill-check
#  + <script src="js/skill-check.js"></script><!-- 街道の出来事 (#45) の d20 判定。... -->
```

⭐ **#45 が非退行を確認した golden は 7 本**で、`verify_player_sheet` は**その外に居た**
(`実装依頼書/2026-09-03_road-events.md` の「既存 golden の基準(2026-09-03)」の表 = 7 行。
`grep -n "player_sheet" 2026-09-03_road-events.md` → **0 件**)。
`world.html` を開くドライバは実測 **13 本**あり、#45/#46 が数えた 7 本は取りこぼしだった。

```bash
grep -rln "world\.html" tools/*.js | wc -l     # → 13
```

### 2-3. 5 ページの `js/skill-check.js` 搭載実態(= 新しい期待の出所)

```bash
for f in index.html world.html tavern.html town.html title.html; do
  printf '%-12s %s\n' "$f" "$(grep -c 'src="js/skill-check.js"' $f)"
done
```

| ページ | `js/skill-check.js` | 技能 / 習熟の区画 | 入った経緯 |
|---|---|---|---|
| `index.html` | **有り** | 出る | #29 から |
| `tavern.html` | **有り** | 出る | #29 から |
| `world.html` | **有り** | **出る(#45 `475839d` から)** | 街道の出来事の d20 判定 |
| `town.html` | 無し | 伏せる | — |
| `title.html` | 無し | 伏せる | — |

⇒ **SkillCheck 搭載 = 3 枚 / 非搭載 = 2 枚。** これが (2d) / (8f) のカウンタの正しい値。

### 2-4. ⚠ 期待表は **2 箇所**ある(#47 §2-11 の記載は片方だけ)

| 場所(構造で指す) | 定数 | 誰が使う |
|---|---|---|
| assert **(2c)** の中 | `SUPPLY` / `SKILLC` / **`wantHidden`** | 素のアーム |
| assert **(8a)** の中 | **`want`** | 撤退アーム `?sheet5e=0` |

⭐ **#47 の §2-11 は `verify_player_sheet.js:1973-1975`(= (8a) 側)しか挙げていない。**
(2c) 側の表を見落とすと 4 本のうち 2 本しか直らない。**両方直すこと。**

⚠ さらに **(8a) は撤退アーム**である点に注意。`?sheet5e=0` は `js/player-sheet.js` の
`renderV1` 経路へ落ちるが、**`renderV1` も `dfSheetSecSkills: !!d.skills` で供給を見ている**ため、
撤退しても world では技能が出る(実測: `world:5区画/伏["Body"]`)。
⇒ (8a) の world 期待は **`['dfSheetSecBody']`**(= tavern と同じ)。

### 2-5. ⚠⚠⚠ 罠 — 「導出」だけにすると、実体を壊す変異に追随して**永久緑**になる

期待を `<script src="js/skill-check.js">` の有無から導出すると、こうなる:

> `world.html` から script タグを剥がす → world で SkillCheck が消える →
> 技能区画も消える → **導出した期待も「伏せる」に変わる** → **(2c)(2d)(8f) は緑のまま**

つまり「街道の判定に必要な script が消えた」という**本物の退行を 1 本も検出できない**。
⭐⭐⭐ **だから導出は集合固定とセットでなければならない。**
⇒ §6 の変異 **`noscworld`** でこれを機械証明する
(= 新設する **(0e)** だけが赤くなり、(2c)(2d)(8f) は緑のまま、という形を実測で示す)。

### 2-6. 素の赤 4 本が、負のコントロールを 6 本壊している

```bash
node tools/verify_player_sheet.js --negative
  → 91/101 PASSED   FAILED 10   PENDING 0   (exit 1)      # #36 完了時は 101/101
```

FAILED 10 の内訳:

| 種類 | 本数 | 中身 |
|---|---|---|
| 素の赤 | 4 | (2c) (2d) (8a) (8f) |
| **偽の赤**(担当外の巻き込み検査) | **6** | `neg-nocha-範囲` / `neg-ownmod-範囲` / `neg-blankdata-範囲` / `neg-blankundeclared-範囲` / `neg-emptycol-範囲` / `neg-abilrow-範囲` — すべて `⛔ 想定外の巻き込み=2c,2d` |

判定の仕組み(構造で指す = `NEGATIVE` ブロックの `unexpected` の計算):

```js
const red = ev.filter(id => res[id][0] === false);
const extra = red.filter(id => mu.targets.indexOf(id) < 0);
const unexpected = extra.filter(id => (mu.allowRed || []).indexOf(id) < 0);
```

⇒ **(2c)(2d) は変異と無関係に赤い**ので、それを `evaluable` に載せている変異 6 本すべてで
`unexpected` に入る。**変異の副作用の設計が正しいかどうかが、いま一切検査できていない。**

⚠ **正確に**: `(neg-blankrow-2c)` と `(neg-retreatkeep-8a)` は **PASSED**。
変異が world 以外のページ(tavern / index)も壊すため、変異由来の赤も同時に出ているからである。
⛔ ただし**素で赤い以上、「変異のおかげで赤くなった」ことは機械的に分離できていない**。
直せば分離できるようになる。

### 2-7. ⭐ 同じ形の表なのに (7b) は腐らなかった — 何が違ったか

assert **(7b)** も `{'world.html': ['A','C'], ...}` という**ページごとのハードコード表**を持つが、
実測は PASSED。理由は `js/player-sheet.js` の区画定義で
**習熟 / 技能が `col: "A"`** に属し、A 段は 5 ページ共通で必ず在るから
(B 段 = 供給口の 4 区画だけが index 限定)。

```bash
grep -n 'dfSheetSecProficiency\|dfSheetSecSkills' js/player-sheet.js | grep 'col:'
#  { id: "dfSheetSecProficiency", label: "習熟", col: "A" },
#  { id: "dfSheetSecSkills",      label: "技能", col: "A" },
```

⇒ **「ページ名で引く表」がすべて危ういのではなく、『SkillCheck の有無で変わる量』を
ページ名で書いた表だけが腐った。** ⛔ よって (7b) は**触らない**(§11)。

### 2-8. #47 との相互作用は **ゼロ**(ただし着手は #47 完了後)

- **測定点の重なり無し**: `grep -n "maxHp" tools/verify_player_sheet.js` → **0 件**。
  #47 の「糧 = 全員 maxHp +3」はこのドライバが見ている値に**一切触れない**。
  そもそも #47 の恩恵は `dragonfighters.roadBoon` が在るときだけ発動し、
  このドライバはそのキーを一度も書かない。
- **ファイルの重なり無し**: #47 が触るのは `js/road-events.js` / `world.html` / `index.html` /
  `tools/verify_road_boon.js`。本チケットは `tools/verify_player_sheet.js` のみ。
- ⛔ **それでも着手は #47 完了後**。#47 の §8 は
  「`verify_player_sheet` は **FAILED の集合が `{2c,2d,8a,8f}` のままなら非退行**」を
  基準にしている。先に直すと **#47 の非退行判定の物差しそのものが動く**。
  ⇒ #47 の commit が入り、`実装依頼書/README.md` の #47 行が「完了」になってから着手する。

### 2-9. changelog は **不要**

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
#  GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

本チケットが触るのは `tools/verify_player_sheet.js` **だけ**なのでフックは鳴らない。
⭐ CLAUDE.md の「プレイヤーに見える変化が無いのにトリガー 3 ファイルを触る設計は採らない」に
**完全に合致**する(本番ファイルを 1 バイトも触らないので、書ける要約が無くても矛盾しない)。

### 2-10. 別窓の差分

```bash
git -c core.quotepath=false status --short     # → 空 (2026-09-03 18:5x 時点)
git rev-parse HEAD origin/main                 # → 35ee8e8 / 35ee8e8
```

⚠ 起草時点の `git status` は空だが、**隣窓は既に #47 の項目 1 を着地させている**
(`a30bb39` = `tools/verify_road_boon.js` 1143 行・**ポート 9790**)。着手時には #47 の
4 コミットが入っている前提で、`git log --oneline -6` を見て着地を確認すること。

### 2-11. ⚠⚠⚠ ポート — 変異を 2 本足すと占有帯が伸び、**既にある衝突が悪化する**

`verify_player_sheet` は **base 9470**、変異ポートは `PORT_OF[k] = PORT + 1 + i` なので
**変異 15 本 = 9471〜9485** を `--negative` 中に占有する。
⛔ **ところがドライバ冒頭のコメントは「9470〜9479 が丸ごと空きであることを確認して選んだ」**
のままで、**実際の占有幅 (15 本) を反映していない**。

```bash
grep -hoE "arg\('port', '[0-9]+'\)" tools/*.js | grep -oE "[0-9]+" | sort -n | uniq
```

2026-09-03 実測、9400〜9600 帯の base:

| base | ドライバ | 占有 |
|---|---|---|
| 9410 | `verify_walk_block` | 変異 16 本 = **9411〜9426** |
| 9412 | `probe_rest_premature` | ⚠ **上の帯の内側**(既存の衝突) |
| 9440 | `driver_encounter_mopup` | |
| 9451 | `driver_heromark_signplate` | +4 = 9455 |
| 9460 | `verify_town_exit` | +4 = 9464 |
| **9470** | **`verify_player_sheet`** | **変異 15 本 = 9471〜9485** |
| 9480 | `driver_party_view_reopen` | ⚠⚠ **上の帯の内側**(既存の衝突) |
| 9490 | `verify_world_heromark` | +10 = 9500 |

⇒ **本チケットで変異が 17 本になると占有は 9471〜9487 へ伸び、衝突が 1 本ぶん深くなる。**
⭐ #47 でも隣窓が**同じ罠**(依頼書の「ポート 9770 は空き」が誤りで、`verify_road_events` が
`--negative` 時に 9761〜9774 を占有していた)を実測で踏み、base を 9790 へ移している。

**⇒ 本チケットでは `verify_player_sheet` の base を `9620` へ移す**(§6-3)。
実測で **9615(`verify_world_steps` 系の上端)〜9760(`verify_road_events`) が丸ごと空き**なので、
`9620 + 17 = 9637` まで取っても他と重ならない。
⚠ **`--port` は引数で上書きできる**ので、既定値を変えても手動実行の作法は変わらない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/verify_player_sheet.js` | 導出ヘルパ 1 本の新設 / assert **(0e)** の新設 / **(2c)(2d)(8a)(8f)** の期待を導出へ / 変異 **2 本**の追加 / `SECTIONS` と `MUT_ORDER` への登録 / **base ポート 9470 → 9620** と冒頭コメントの訂正(§2-11) |

⛔ **本番コード(`index.html` / `world.html` / `js/player-sheet.js` / `js/skill-check.js`)は
1 バイトも触らない。** §2-1 で「実装は正しい」ことを実測済み。
⛔ **`実装依頼書/README.md` の #48 行は、#47 が着地してから足す**(文面は §11 に用意)。

---

## 4. STEP1 — 導出の土台と、集合を固定する新 assert (0e)

### 4-1. 導出ヘルパ(既存の「配信バイトの凍結」にそのまま乗せる)

ドライバには既に **`frozen(rel)` / `servedSrc(mutKey, rel)`**(「ソースからの抽出 = ブラウザを
通さない 2 経路目」節)があり、`PAGES` 5 枚は起動時に `frozen()` 済み。ここへ 1 本足す:

```js
/** そのページの配信バイトに <script src="js/skill-check.js"> が載っているか。
 *  ⭐ DOM ではなく **配信されたソース**を見る = 実行時の window.SkillCheck とは独立の経路。
 *  ⚠ 変異ポートでも servedSrc(mutKey, ...) で追随する (noscworld が効くのはこのため)。 */
function pageHasSkillCheckSrc(mutKey, file) {
  const s = servedSrc(mutKey || null, file) || '';
  return /<script\s+src="js\/skill-check\.js"/.test(s);
}
```

⚠ **測定側 (`measureAll`) から `mutKey` が渡らない assert がある。** assert は `M`(測定結果)しか
受け取らないので、**採取時に測っておいて `M` に載せる**のが筋:
`probeRealPage` 系がページごとに返すオブジェクト(`p.file` / `p.hasSkillCheck` を持つもの)へ
**`p.hasSkillCheckSrc`** を 1 つ足す。⭐ こうすると assert 側は `p.hasSkillCheckSrc` を読むだけでよく、
変異ポートでも自動的に正しい値になる。

### 4-2. 新 assert **(0e)** — 搭載ページの集合そのものを固定する

`SECTIONS` の **`'§0 装置 — 実ページの母集団 (5 枚)'`** の配列(`['0a','0b','0c']`)へ
**`'0e'`** を足す(⚠ `0d` は既に別の節で使われているので **`0e`**)。

```js
['0e', '[装置] SkillCheck を載せているページは {index, tavern, world} の 3 枚ちょうど '
     + '(配信バイトの <script src> と 実行時の window.SkillCheck の 2 経路が一致する)', (M) => {
  const P = M.pages || [];
  if (P.length !== 5) return [false, '⛔ 母集団が 5 でない'];
  /* ⭐⭐⭐ この表だけは「導出」しない。導出した期待は実体を壊す変異に追随して永久緑になる
     (依頼書 §2-5 の罠 / 変異 noscworld が機械証明する)。集合が動いたらここが赤くなる。 */
  const WANT_SC = ['index.html', 'tavern.html', 'world.html'];
  const bad = [];
  for (const p of P) {
    const wantSC = WANT_SC.indexOf(p.file) >= 0;
    // 経路① 配信バイトの <script src>
    if (p.hasSkillCheckSrc !== wantSC) bad.push(p.label + ' src=' + p.hasSkillCheckSrc + ' (期待 ' + wantSC + ')');
    // 経路② 実行時の window.SkillCheck  ⭐ ①の写経にしない
    if (p.hasSkillCheck !== wantSC) bad.push(p.label + ' runtime=' + p.hasSkillCheck + ' (期待 ' + wantSC + ')');
  }
  const nSrc = P.filter(p => p.hasSkillCheckSrc).length;
  const nRun = P.filter(p => p.hasSkillCheck).length;
  return [bad.length === 0 && nSrc === 3 && nRun === 3,
    P.map(p => p.label + ':' + (p.hasSkillCheckSrc ? 'src' : '—') + '/' + (p.hasSkillCheck ? 'run' : '—')).join(' ')
    + '  搭載 src ' + nSrc + ' 枚 / runtime ' + nRun + ' 枚'
    + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
}],
```

⭐ **なぜ (0e) だけ表を固定するのか**を、上のコメントとして**コードに書き残すこと**。
これが無いと次の人が「ここも導出にすればいいのに」と直して罠へ戻る。

---

## 5. STEP2 — 4 本の期待を「導出」へ

⛔ **`hasSkillCheckSrc` ではなく `hasSkillCheck`(実行時)を使う。** 区画が出る/出ないは
実行時に `SkillCheck` が生きているかで決まるため。集合の固定は (0e) の担当で、**役割を分ける**。

### 5-1. (2c) — `wantHidden` をページごとに組み立てる

```js
const SUPPLY = ['dfSheetSecSaves', 'dfSheetSecCombat', 'dfSheetSecBody', 'dfSheetSecAttacks'];
const SKILLC = ['dfSheetSecProficiency', 'dfSheetSecSkills'];
/* ⭐ #48: 表を「ページ名 → 伏せる区画」で持たず、**規則そのもの**から組む。
   伏せる理由は 2 つだけ = ①供給口が無い (index 以外) ②SkillCheck が無い (載っていないページ)。
   ⚠ 集合 {index,tavern,world} の固定は (0e) が担当する (ここで固定すると二重管理になる)。 */
const hiddenWantOf = (p) => (p.file === 'index.html' ? [] : SUPPLY)
  .concat(p.hasSkillCheck ? [] : SKILLC);
```

`sameSet(st.hidden || [], wantHidden[p.file])` を **`sameSet(st.hidden || [], hiddenWantOf(p))`** へ。

**母集団ガードも実測値へ**:

```js
/* 母集団ガード: 伏せ計 = tavern 4 + town 6 + world 4 + title 6 = 20 / 全部出たページ 1 (index)。
   ⚠ #45 で world に skill-check.js が載り 22 → 20 になった (#48 で更新)。 */
hiddenTotal === 20 && allShown === 1
```

⛔ **`allShown === 1` は動かさない**(index だけが全部出る、は今も真)。

### 5-2. (2d) — カウンタを母集団から引く

```js
const nSC = P.filter(p => p.hasSkillCheck).length;      // 実測 3
return [bad.length === 0 && cells === nSC * 12 && nSC === 3 && (P.length - nSC) === 2, ...]
```

⭐ `cells === nSC * 12` と `nSC === 3` の **両方**を書く
(前者は「12 種すべて照合した」、後者は「3 枚で照合した」。片方だけだと空振りする)。

### 5-3. (8a) — 撤退アームの表も同じ規則で

```js
/* ⭐ #48: 撤退 (?sheet5e=0 → renderV1) でも SkillCheck の有無で技能区画が決まる。
   renderV1 も dfSheetSecSkills: !!d.skills で供給を見ているため。 */
const wantOf = (p) => (p.file === 'index.html' ? [] : ['dfSheetSecBody'])
  .concat(p.hasSkillCheck ? [] : ['dfSheetSecSkills']);
```

⚠ **(8a) の母集団 `M.retreat5e` の要素が `hasSkillCheck` を持っているか確認すること。**
持っていなければ、`M.pages` の同じ `file` から引くか、撤退アームの採取にも
`hasSkillCheck` を載せる(**どちらでもよいが、載せるほうが素直**)。

### 5-4. (8f) — カウンタと見出し

```js
return [bad.length === 0 && withSC === 3 && withoutSC === 2, ...]
```

⭐ assert の**見出し文字列も直す**: `... 習熟ボーナスも 2 経路 (index / tavern)` →
**`(index / tavern / world)`**。⛔ 見出しが古いままだと、次の人が実測より見出しを信じる。

---

## 6. STEP3 — 変異 2 本(`MUTATIONS` と `MUT_ORDER` へ登録)

### 6-1. `noscworld` — §2-5 の罠の再現(⭐ 本チケットの中核)

```js
noscworld: {
  impl: true, file: 'world.html', targets: ['0e'],
  from: '  <script src="js/skill-check.js"></script><!-- 街道の出来事 (#45) の d20 判定。⚠ js/abilities.js より後。撤退 ?roadevent=0 -->',
  to:   '  <!-- #48 negative: skill-check.js を剥がした -->',
  want: { pages: true }, evaluable: ['0e', '2c', '2d', '8f'], allowRed: [],
  why: '⭐⭐⭐ 依頼書 §2-5 の罠の再現。world.html から js/skill-check.js を剥がす。'
     + ' 期待を「載っている script から導出」しただけだと **期待も一緒に動く**ので'
     + ' (2c)(2d)(8f) は緑のまま = 本物の退行を 1 本も検出できない。'
     + ' 集合を固定した (0e) だけが赤くなることを機械証明する。',
},
```

⚠ **`from` の文字列は着手時に実物からコピーすること**(#47 が `world.html` を触るので、
コメント部分が変わっている可能性がある)。ドライバは起動時に
「置換対象が 1 箇所か」「置換前後の長さが違うか」を検査して `exit 3` で落ちるので、
**空振りには必ず気づける**。⛔ 手で数えずドライバに数えさせること。

⭐ **実測で `evaluable` / `allowRed` を決め直すこと**(机上で決めない)。上の値は予測であり、
`node tools/verify_player_sheet.js --mutate noscworld` を**単体で 1 回回して**
実際に赤くなった節から確定する(#29 で 7 本中 5 本が担当外を巻き込んだ前例あり)。

### 6-2. `stalepages` — 導出が実際に効いていることの証明(装置側の変異)

`closedread` と同じ **`driverSide: true`**(ファイル置換を持たない)。
`STALE` フラグが立ったときだけ、(2c)/(8a) の期待を **#45 以前の固定表**へ戻す:

```js
stalepages: {
  impl: true, file: null, driverSide: true, targets: ['2c', '2d', '8a', '8f'],
  stale: true,                       // ⭐ 導出ヘルパがこれを見て #45 以前の固定表を返す
  want: { pages: true, retreat5e: true }, evaluable: ['2c', '2d', '8a', '8f'], allowRed: [],
  why: '⭐ 装置側の変異: 期待を #45 以前の「world では技能を伏せる」固定表へ戻す。'
     + ' 導出が飾りで、実は別経路で緑になっているのではないことを機械証明する'
     + ' (= この 4 本が本当に world の実体を見ていること)。',
},
```

⚠ 実装は「導出ヘルパ 2 本 + カウンタ」が `STALE` を見るだけの最小で足りる:

```js
const STALE = (MUTATE === 'stalepages') || (NEG_KEY === 'stalepages');
const hiddenWantOf = (p) => STALE
  ? (p.file === 'index.html' ? [] : SUPPLY).concat(p.file === 'tavern.html' ? [] : SKILLC)  // #45 以前
  : (p.file === 'index.html' ? [] : SUPPLY).concat(p.hasSkillCheck ? [] : SKILLC);
```

⚠⚠ **`--negative` のループから現在の変異キーを取れるようにすること。** 既存の
`measureAll(PORT_OF[k], k, ...)` は変異キー `k` を測定側へ渡しているが、**assert 側には渡していない**。
⭐ 素直な実装 = ループで `NEG_KEY = k` を立ててから assert を評価し、評価後に `NEG_KEY = null` へ戻す
(`closedread` が `probeOpts` で測定側だけを切り替えているのと**対になる、期待側の切り替え**)。

### 6-3. base ポートを **9470 → 9620** へ移す(⚠ 変異を足す前にやること)

```js
const PORT     = parseInt(arg('port', '9620'), 10);
```

⭐ **冒頭コメントも同時に直す。** 現在の「9470〜9479 が丸ごと空きであることを確認して選んだ」は
**占有幅 (変異の本数ぶん) を勘定していない**ので、同じ間違いを繰り返さない書き方にする:

```
 *     node tools/verify_player_sheet.js --port 9620 --headful
 *
 *   ⚠ ポート **9620** (変異 17 本ぶんが 9621〜9637)。⛔ base だけでなく **占有幅**で空きを見ること。
 *     2026-09-03 実測: 9410(+16=9426) / 9412 / 9440 / 9451(+4) / 9460(+4) / 9480 / 9490(+10) /
 *     9530 / 9540 / 9573(→9586) / 9600(→9615) / 9760(+14=9774) / 9790(+14=9804)。
 *     ⇒ 9615〜9760 が丸ごと空きなので 9620 を取った (9637 まで使っても重ならない)。
```

⚠ **変異を 1 本足すごとに占有が 1 つ伸びる**(`PORT_OF[k] = PORT + 1 + i`)。
⛔ 次に変異を増やす人が同じ罠へ戻らないよう、この対応関係をコメントに明示すること。

---

## 7. 撤退スイッチ — **該当なし**

⭐ 本チケットは**本番コードを 1 バイトも触らない**(検証ドライバのみ)。プレイヤーに見える
振る舞いは 1 つも変わらないので、`?<slug>=0` を作る対象が存在しない。

⛔ **代わりに「戻し方」を書く**: 万一この変更で判断を誤ったとわかった場合は、
`tools/verify_player_sheet.js` を `git checkout <#47 の最終 hash> -- tools/verify_player_sheet.js`
で戻せる(1 ファイルなので影響は閉じている)。

---

## 8. 受入条件 — `tools/verify_player_sheet.js`(既存を直す)

**方針**: 「FAILED 0 になった」だけでは受け入れない。**期待値を実体から引くようにしたのだから、
実体を壊したときに赤くなること**まで見る。⛔ 逆に、実体を壊しても緑なら**それは緩めただけ**。

### §0 装置(先に母集団を確かめる)

- **(0e-1)** 新設 (0e) が **PASSED**。搭載 src 3 枚 / runtime 3 枚、集合 = {index, tavern, world}
  ⭐ **これが無いと (2c)(2d)(8f) は導出のせいで永久緑になる**
- **(0e-2)** `--mutate noscworld` 単体で **(0e) が赤くなり、(2c)(2d)(8f) は緑のまま**
  ⭐ 「導出だけでは検出できない」を実測で示す = §2-5 の罠がコードで固定される

### §1 本体(4 本が緑になる — ただし**数字が増える形で**)

- **(1-1)** `node tools/verify_player_sheet.js` → **FAILED 0 / PENDING 0**
  ⭐ 合計は **70/70 か 71/71**(0e を足すので 1 本増える。**実測して記録すること**)
- **(1-2)** (2d) の照合マスが **36**(24 ではない)。出力文字列に `照合 36 マス` が出る
- **(1-3)** (8f) が **3 枚**で 2 経路照合(`withSC === 3`)。world の受動知覚 13 が期待 13 と一致
- **(1-4)** (2c) の母集団ガードが **伏せ計 20 / 全部出たページ 1**
- **(1-5)** (8a) の world 伏せが **`["Body"]`**

### §2 恒等(非退行)

- **(2-1)** **本番ファイルの差分が 0 バイト**:
  `git diff --stat -- index.html world.html tavern.html title.html town.html js/` → **空**
- **(2-2)** (7b) の表は**触っていない**(`git diff` に `'world.html': ['A', 'C']` の変更が出ない)
- **(2-3)** 既存の他 assert の期待値を**1 つも書き換えていない**
  (`git diff tools/verify_player_sheet.js` を読み、変更が (0e) 新設 / (2c)(2d)(8a)(8f) /
   変異 2 本 / `SECTIONS` / `MUT_ORDER` の**範囲に収まっている**こと)

### §3 負のコントロール(`--negative` で道具に内蔵)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **`noscworld`** | `world.html` から `js/skill-check.js` を剥がす | **(0e)** のみ(⭐ 2c/2d/8f は緑のまま = 罠の再現) |
| **`stalepages`** | 期待を #45 以前の固定表へ戻す(装置側) | **(2c)(2d)(8a)(8f)** |

- **(3-1)** `node tools/verify_player_sheet.js --negative` → **FAILED 0**
  ⭐ 基準: **91/101 → 全部緑**。合計本数は変異が 15→17 本になるので**増える**(実測して記録)
- **(3-2)** §2-6 の**偽の赤 6 本が消える**(`neg-nocha-範囲` ほか 5 本に
  `⛔ 想定外の巻き込み=2c,2d` が出ない)
- **(3-3)** `neg-blankrow-2c` / `neg-retreatkeep-8a` が**素で赤くない状態で** PASSED
  ⭐ これで初めて「変異のおかげで赤い」が分離できる
- **(3-4)** ⚠ **ポートが他ドライバと重なっていない**。`--negative` の起動ログ
  (`[drv] ROOT=... PORT=... 変異ポート=...`)に出る番号が **9620〜9637** に収まり、
  §2-11 の実測表のどの帯とも交わらないこと。
  ⭐ 検算: `grep -hoE "arg\('port', '[0-9]+'\)" tools/*.js | grep -oE "[0-9]+" | sort -n | uniq`
  の出力に **9620〜9637 が 1 つも無い**ことを確認する(⛔ base だけでなく**占有幅**で見る)

### ⛔ 測らないこと

- **シートの見た目**(区画の位置・文字サイズ・色)。#36 で決着済みで、本チケットは 1px も動かさない
- **`js/skill-check.js` の判定ロジック**(#45 の担当。ここでは「載っているか」だけを見る)
- **world で技能を出すべきかどうかの是非**。⭐ **ユーザーが 2026-09-03 に「正とする」と決定済み**
  (§1)。実装窓が善意で `js/player-sheet.js` に条件を足すのは**禁止**

### 既存 golden の非退行(実装後に必ず走らせる)

⭐ **本番コードを 1 バイトも触らないので、原理的に他ドライバへは波及しない。**
それでも「触っていないこと」を**数字で**示すため、**2 本だけ**走らせる:

- `node tools/verify_ability_scores.js` → **24/24**(2026-09-03 #47 起草窓が実測)
- `node tools/verify_road_events.js` → **25/25**(#45 完了時の記録)

⚠ 上は **2026-09-03 時点の記録**。⛔ **#47 の 4 コミットが先に入っている**ため、
違ったら **まず #47 のせいかを確かめる**(`git log --oneline -6` で #47 の着地を確認 →
`git show <#47最終hash>:tools/...` と比べる)。
**期待値を書き換える前に理由を突き止める。**

---

## 9. 実機/実感の確認

⭐ **本チケットには実機確認が無い**(プレイヤーに見える変化が 0 のため)。

ただし **1 つだけ目視しておくと安い**: ローカル http 起動で `world.html` を開き、
シートを開いて「習熟 / 技能」の区画が出ていること、数字が index のシートと同じであることを見る。
⚠ これは**受入条件ではない**(機械が (8f) で 2 経路照合済み)。「ユーザー決定が実物と合っているか」の
最終確認にすぎない。

```bash
py -m http.server 8000        # ⚠ file:// 直開きは不可 (音とfetchが死ぬ)
# → http://localhost:8000/world.html
```

---

## 10. changelog — **不要**

`scripts/hooks/check_changelog.py` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` に
`tools/*` は含まれない(§2-9 で実測)。⛔ **書けるプレイヤー向けの要約が実在しないので、
本番ファイルを触る設計に変えてまで鳴らさないこと。**

---

## 11. やらないこと

- ⛔ **`js/player-sheet.js` に「world では技能を伏せる」条件を足す**
  — ユーザーが「world でも出るのが正」と決定済み(§1)
- ⛔ **(7b) の `{'world.html': ['A','C']}` を導出へ変える** — §2-7 で「腐っていない」ことを実測済み。
  段の割り当ては SkillCheck の有無に依存しない。**触ると無意味に壊れる**
- ⛔ **`verify_ability_scores.js` など他ドライバの「ページ表」を予防的に直す**
  — 実測でページ別の期待表を持っていない(`PAGES` 定数のみ)。予備軍ではない
- ⛔ **`world.html` に `js/class-sight.js` を足す等、他の script の載せ方を揃える**
  — 別チケット。本チケットは「今そうなっている姿」を測るだけ
- ⛔ **`実装依頼書/README.md` への行追加**(**#47 が着地してから**)。用意してある行:

  | 48 | [2026-09-03_sheet-skillcheck-pages.md](2026-09-03_sheet-skillcheck-pages.md) | **承認済** | 0% | `verify_player_sheet` の着手前からの赤 4 本 `{2c,2d,8a,8f}` を直す。真因 = #45 `475839d` が `world.html` へ `js/skill-check.js` を載せ、world でも技能/習熟が出るようになったのに期待表が「伏せる」のまま。⭐ **緩めるのではない** — 照合マスは 24→36 に増える。⭐ 期待を「載っている script」から導出し、集合 {index,tavern,world} は新 assert (0e) で固定(⚠⚠⚠ 導出だけだと `world.html` から script を剥がす退行に追随して**永久緑**になる = 変異 `noscworld` で機械証明)。⚠ `--negative` は素の赤のせいで 91/101 に落ちていた(偽の赤 6 本)。⚠⚠ base ポート **9470→9620**(変異 17 本で 9621〜9637。⛔ base でなく**占有幅**で空きを見る — 9470 は既に `driver_party_view_reopen` の 9480 と重なっていた)。本番コード 0 バイト・changelog 不要・撤退スイッチ無し |

---

## 12. 実装結果

(実装窓が埋める)

- コミットハッシュ:
- `node tools/verify_player_sheet.js` → **?/?**(0e を足した後の実測値)
- `node tools/verify_player_sheet.js --negative` → **?/?**(変異 17 本)
- `--mutate noscworld` 単体の実測(⭐ **どの節が赤くなったか**。予測は (0e) のみ):
- `--mutate stalepages` 単体の実測(予測は (2c)(2d)(8a)(8f)):
- 依頼書からの逸脱と理由:
- ⚠ 依頼書の指定が実物でずれた点:
- 残った宿題:
