# #45 街道の出来事 — 地図を歩くと、何かが起きる (Phase 1)

- **起草**: 2026-09-03(計画窓) / **ステータス**: **承認済**(2026-09-03 ユーザー承認)
- **触るファイル**:
  - `world.html`(`<script src>` 2 行 / Google Fonts の URL 1 行 / イベントの器 / 発火)
  - `js/road-events.js`(**新規** — イベント表の唯一の正)
  - `tools/verify_road_events.js`(**新規** — 受入条件)
  - `tools/verify_world_steps.js`(**(4c) の書き換え + 変異 `fireevent` の作り替え**)
- ⛔ **触らないファイル**: `index.html` / `tools/verify_enemy_name_label.js`
  — **別窓が依頼書 #44(敵の頭上にも名前札)を実装中**。
  本チケットは `index.html` を**一度も開かずに完了できる**(§2-9 で確認済み)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- ⚠⚠⚠ **起草した瞬間はコミットできない。** 2026-09-03 の起草終了時点で
  隣窓が `tools/verify_enemy_name_label.js`(**+511 / −47**)を**ステージ済み**にしている。
  この状態で `git commit` を打つと**相手の作業が自分のコミットへ丸ごと入る**
  (ファイル単位 add でも防げない = `feedback_peer_session_concurrent_repo` の既知の事故)。
  **`git diff --cached` が自分の変更だけになってから commit すること。**
- ⛔ **`tavern.html` / `town.html` / `title.html` / `js/skill-check.js` / `js/world-map.js` も触らない**(§3 参照)

---

## 1. 目的

#40 / #42 / #43 の 3 チケットで、ワールドマップは「1 タップ = 最大 2.5 マス刻みで歩く」
「刻み点が見える」「主人公の頭上に ▽ が出る」まで作り込まれた。**歩く体験はできた。**

ところが **道中では何ひとつ起きない。** #40 は到着フック `onArriveStep()` を
「⭐ **器だけ**。⛔ ここでイベントを起こさない(後続チケットの担当)」と明記して置き、
`verify_world_steps` の受入条件 **(4c) が「イベントは 1 件も起きない」を機械で縛っている**。
その後続チケットが本件。**器に初めて中身を入れる。**

港町フランから神殿まで **12 ホップ**、廃坑まで **10 ホップ**(§2-5 実測)。
その全部が「押す → 少し進む → 押す」の繰り返しで、**地図は移動のための手続きになっている**。

**ユーザー決定(2026-09-03)**:

- 開発会議(`dev-meetings/2026-09-03_次の題材.md`)の**候補①「街道の出来事」を採用**。
- ⭐ **不採用になった案**(なぜそれではないかが後で効く):
  - **候補② 冒険の賭け金**(撤退・敗北のコスト) … 街に寺院が無く `FACILITIES` の 5 件目に
    なるため規模が中〜大。かつ**候補④が先**でないと理不尽になる(シナリオ2 クリア率 0/3)
  - **候補③ 昇級の見得**(レベルアップ演出) … `index.html` 一点集中で**隣窓と衝突する**
  - **候補④ シナリオ2 の壁**(難易度の測り直し) … 会議より計測の題材。②の前提として後日
- ⭐ **Phase 分割もユーザー決定**: Phase 1 は **`world.html` + 新規 js だけで完結**させ、
  「イベントの結果を次の依頼へ持ち込む」は **Phase 2(別チケット)** へ。
  理由 = 持ち込みを消費するのは `index.html` で、そこは隣窓が使用中。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 器の全数 — `onArriveStep` の呼び口は本番 1 箇所だけ

```bash
grep -rn "onArriveStep" --include=*.html --include=*.js . | grep -v node_modules
```

| ファイル:行 | 種別 | 何 |
|---|---|---|
| `world.html:1017` | **定義** | `function onArriveStep(atId, destId)` |
| `world.html:1054` | **呼び口(本番で唯一)** | `goToPoint()` の `walkPath` 完了コールバック内 |
| `tools/verify_world_steps.js:234` | 変異アンカー | `fireevent` の `from` |
| `tools/verify_world_steps.js:243` | 変異アンカー | `arrivedup` の `to` |
| `tools/verify_world_steps.js:665` | コメント | 説明文 |

⭐ **本番の呼び口は 1 箇所だけ**(リポジトリ全文 grep で実測)。
⚠ #40 が明記している禁止事項をそのまま守ること:

- ⛔ **`walkPath` の中から呼ばない** — 撤退時(`walkStepOff`)は中継ノードを通過するので
  回数が合わなくなる(変異 `arrivedup` が縛っている)
- ⛔ `lastArrival` に**ゲームの状態を置かない**(`__world` が読むための記録)

現在の中身(`world.html:1016-1031`、2026-09-03 実測):

```js
var lastArrival = null, arrivalCount = 0;
function onArriveStep(atId, destId) {
  arrivalCount++;
  lastArrival = { at: atId, dest: destId,
                  kind: WM.has(atId) ? "node" : "step",
                  arrived: atId === destId };
  if (lastArrival.arrived && WM.has(atId)) onArriveNode(atId);
}
```

⚠ **行番号は必ずズレる前提**で読むこと。着手時に `grep -n "function onArriveStep" world.html`
で取り直す(#6 は 8 件中 8 件、#11 は 11 件中 4 件ズレた)。

### 2-2. ⚠⚠⚠ 罠 A — `js/skill-check.js` は world.html に載っていない(会議の主張が崩れた)

開発会議の第1段では「`js/skill-check.js` は world.html が**既読**だから d20 判定はタダで使える」
と述べたが、**これは誤りだった**。

```bash
grep -n '<script src="js/skill-check.js"' *.html
#   index.html:2915
#   tavern.html:2511          ← この 2 枚だけ
```

world.html で `skill-check` が出てくるのは **`js/abilities.js` の行末コメントの中だけ**:

```html
<script src="js/abilities.js"></script><!-- … ⚠ js/skill-check.js より前。撤退 ?ability5e=0 -->
```

⭐⭐⭐ **`grep -l "skill-check.js" *.html` は 5 枚すべてを返す。** コメントを拾うからだ。
**「別ファイルの関数が見える」前提は `<script src>` まで grep する**(#23 で踏んだのと同型)。

**なぜ致命的か**: 素直に書くと実装はこうなる。

```js
if (window.SkillCheck) { /* 判定して結果を出す */ }   // ⛔ これが罠
```

`window.SkillCheck` が undefined なので、**例外も出ず、コンソールにも何も出ず、
イベントが静かに全部スキップされる**。受入条件が「イベントが起きること」を測っていなければ
**永久に緑のまま何も起きない**。

**実測でも裏を取った**(使い捨てプローブ / 計測方法は §2-4):

```json
"pure": { "skillCheck": "undefined", "overlayExists": false,
          "scriptSrcs": ["js/abilities.js","js/save-slots.js","js/hero-classes.js",
                         "js/player-sheet.js","js/world-map.js","audio.js"] }
```

⇒ **`<script src="js/skill-check.js">` を 1 行足すことが本チケットの最初の作業**(STEP1)。
依存順序(`js/abilities.js` が先)は既に満たせる。
⭐ この罠は §8 の負のコントロール **`noscript`** として装置に内蔵する。

### 2-3. ⚠⚠⚠ 罠 B — party の出所は localStorage ではなく sessionStorage

`SkillCheck.resolveSkillCheck(checkKey, dc, party, opts)` の `party` は `[{classKey, name}]`。
world.html は既に `partyComposition` を読んでいるので「そのまま渡せる」と考えたが、**中身が違う**。

```bash
grep -rn "partyComposition" --include=*.html --include=*.js . | grep -v node_modules
```

| 書く場所 | ストレージ | 中身 |
|---|---|---|
| `title.html:737` | **localStorage** | `[chosenClass]` = **主人公 1 人だけ** |
| `tavern.html:4973` | **localStorage** | `selection.partyComposition` = **主人公 1 人だけ**(`:4936`「先頭=主人公だけ採用」) |
| `tavern.html:6948` | **sessionStorage** | `selection.partyMembers.map(m => m.classKey)` = **4 人分** |
| `tavern.html:7034` | **sessionStorage** | 同上(もう 1 経路) |

そして **`world.html:610` は localStorage のほうを読んでいる**:

```js
var pc = JSON.parse(localStorage.getItem("dragonfighters.partyComposition") || "[]");
if (Array.isArray(pc) && typeof pc[0] === "string") key = pc[0];
```

これは**主人公のスプライトを決めるための読み**なので正しい。だが **判定に使う party としては 1 人分しかない。**

**導線の順序も実測した**(`tavern.html:6948` → 出発の遷移):

```
酒場で受注 → 出発ボタン → sessionStorage へ partyMembers / partyComposition(4人)を書く
           → window.location.href = "world.html"     ← ⭐ 書いた直後に地図へ出る
```

⇒ **受注して地図を歩いているときは、sessionStorage に 4 人分がある。**
⚠ ただし **街の門「町の外へ」から自由に地図へ出る経路では受注していない** ので、
sessionStorage は前回の残り、または空になりうる。
(⭐ プローブでも `partyRaw: null` = 新規プロファイルでは空、を実測している)

**だから party はこう組む**(⛔ 写経禁止・実装は `js/road-events.js` 側の 1 関数に集約):

1. `sessionStorage["dragonfighters.partyComposition"]` に配列があればそれを使う(**peek のみ**)
2. 無ければ `localStorage` の同名キー(= 主人公 1 人)
3. どちらも無ければ `["warrior"]`(`heroClassKey()` の fail-safe と同じ倒し方)
4. `name` は **`window.HERO_CLASSES` から引く**(world.html が既読)。⛔ 職業名を写経しない

⛔ **`removeItem` は絶対に呼ばない。** `world.html` の #23 規律 —
「⛔⛔⛔ 一回性のキーを 1 つも消さない。読むだけ = peek」。
`partyComposition` は一回性キーではない(`index.html:32835` が読むが消さない)が、
**規律の境界を曖昧にしないため読むだけにする**。
⭐ この罠は負のコントロール **`localparty`** として装置に内蔵する。

### 2-4. SkillCheck のパネルを world.html で実際に出して測った

⭐ **静的に読むだけでなく、配信バイトへ 1 行注入して本当に動かした**(本番ファイルは無変更)。

| 対象 | 実測値 | 判定 |
|---|---|---|
| `window.SkillCheck`(注入後) | `"object"` / `CHECKS` **12 件** | ⭕ |
| `pageerror` / `console.error` | **0 件** | ⭕ |
| パネルの `z-index` | **105** (`#skillCheckOverlay`) | ⭕ `#worldEnterAsk` の **20** より上 |
| パネルの `position` | `fixed` / 矩形 **(0,0,1440,900)** | ⭕ `#worldStage` の `matrix(0.8125,…)` の**外**(縮まない) |
| `document.elementFromPoint(中央)` | パネル内の要素 | ⭕ 本当に最前面 |
| **`__world.askOpen()`** | **`false`** のまま | ⭐⭐⭐ **(4c) の条件が守られることの実証**(§2-6) |
| カード矩形(1440x900) | **420 x 330** @ (510,285) | ⭕ |
| カード矩形(**390x844 = compact**) | **351 x 350** @ (20,247) / `fitsX` `fitsY` とも **true** | ⭕ iPhone 縦でも収まる |
| `#scRollBtn` の矩形 | **204 x 37** | ⚠ **高さ 37px は iOS 推奨 44px 未満**(§8 「測らないこと」) |
| カードの `font-family`(計算値) | `"Noto Serif JP", serif` | ⚠ **§2-4b** |
| `AUTO_ROLL_MS` / `RESULT_HOLD_MS` | **2000 / 3600** | ⭕ 触らない |
| `DC_TIERS` | `veryEasy 5 / easy 10 / medium 15 / hard 20 / veryHard 25` | ⭕ |
| ページの `zoom` | **0.8125**(desktop 1440x900) | ⚠ 依頼書の px は地図座標 / ドライバの detail は画面座標 |
| `localStorage.partyComposition`(新規プロファイル) | **`null`** | ⚠ §2-3 |

**計測方法**(再測定するとき — プローブは使い捨てなので同じものを書き直す):

    # world.html の配信バイトへ <script src="js/skill-check.js"> を 1 行差し込み、
    # SkillCheck.resolveSkillCheck('persuasion','easy',[{classKey:'warrior',name:'戦士'}], …)
    # を呼んで #skillCheckOverlay の getComputedStyle / getBoundingClientRect を読む。
    # サーバと launch 引数は tools/verify_world_steps.js:355 の startServer と :2135 をそのまま流用。
    # ⛔ ?autoplay も opts.auto も使わない (UI を出さず即解決してしまい、パネルを一度も測らない)。
    # ⚠ ポートは 9721 / 9722 を使った (隣窓が 9850〜9870 を予約済み・既存ドライバは 9600 台)。

#### 2-4b. ⚠ 書体 — world.html は `Noto Serif JP` を読み込んでいない

```bash
grep -n "fonts.googleapis.com/css2" index.html town.html world.html
# index.html:9 … &family=Noto+Serif+JP:wght@400;600&display=swap   ← ここだけ
# town.html:9  … Cinzel + MedievalSharp のみ
# world.html:9 … Cinzel + MedievalSharp のみ
```

計算値は `"Noto Serif JP", serif` を返すが、**フォント自体が読み込まれていないので実描画は
`serif` フォールバック**(計算値では判別できない。#36 で「同じシートが 5 ページで違う書体で
出ている」と同型)。
⇒ **STEP2 で `world.html:9` の Google Fonts URL に `&family=Noto+Serif+JP:wght@400;600` を足す。**
⛔ CSS は 1 行も足さない(`skill-check.js` が自前で `font-family` を指定している)。

### 2-5. 停留所は 17 箇所 — 地形割りと「通行料にしない」ことの数値的な裏取り

```bash
node -e "global.window=global;require('./js/world-map.js');const WM=global.WORLD_MAP; …"
```

| 種別 | 件数 | id |
|---|---|---|
| `site`(拠点) | **7** | phlan / forest / swamp / fort / mine / temple / dragon |
| `way`(中継点) | **7** | pier / cross_n / farm_n / pass_n / lake_n / village_s / lakeside |
| `step`(刻み点) | **10** | forest__farm_n@1 / farm_n__pass_n@1 / lake_n__lakeside@1 / @2 / cross_n__swamp@1 / swamp__village_s@1 / village_s__fort@1 / fort__lakeside@1 / lakeside__mine@1 / lakeside__dragon@1 |
| **合計(停留所)** | **24** | `WM.walkNodes()` |
| **イベントの母集団** | **17** | `way` + `step`。⛔ **`site` は除外**(入場ダイアログが優先) |

⭐ **刻み点の id は `a__b@i` の形で両端ノードを持っている**(`STEPS[id].on = [a, b]`)ので、
**地形は id から引ける。⛔ 別表に座標を写さない。**

**地形割り(5 種 / 合計 17)**:

| 地形 | 件数 | 停留所 | 発生率 |
|---|---|---|---|
| `coast`(港のそば) | 2 | pier / cross_n | **5%** |
| `woods`(森と農地) | 2 | farm_n / forest__farm_n@1 | **10%** |
| `lake`(湖畔) | 5 | lake_n / lakeside / lake_n__lakeside@1 / @2 / fort__lakeside@1 | **12%** |
| `mountain`(山道と荒地) | 4 | pass_n / farm_n__pass_n@1 / lakeside__mine@1 / lakeside__dragon@1 | **18%** |
| `swamp`(沼と廃墟) | 4 | village_s / cross_n__swamp@1 / swamp__village_s@1 / village_s__fort@1 | **20%** |

⚠ 会議では「地形 4 種」と言ったが、**実データで割ると `mountain` が 9 件(母集団の半分超)に
なってしまう**ため 5 種へ増やした(意図的な逸脱)。

**「通行料にしない」の数値的裏取り**(⛔ 期待値ではなく設計の妥当性の根拠):

| 経路 | ホップ | 対象停留所 | 期待イベント数 | 1 件も出ない確率 |
|---|---|---|---|---|
| `pier` → `temple` | 12 | 8 | **0.91** | 38% |
| `phlan` → `dragon` | 10 | 8 | **0.91** | 38% |
| `phlan` → `mine` | 10 | 8 | **0.91** | 38% |
| `phlan` → `fort` | 7 | 5 | **0.85** | 39% |
| `phlan` → `swamp` | 3 | 2 | **0.25** | 76% |
| `phlan` → `forest` | 2 | 1 | **0.05** | 95% |

⇒ **遠い依頼で横断 1 回あたり期待 0.85〜0.91 件**、**近い依頼ではほぼ起きない**。
会議でノエルが引いた線「1 回の横断で 0〜1 回」に乗っている。

⚠⚠ **`WM.findWalkPath(a, b)` は始点を含まない**(戻りは「これから進む点の列」)。
起草中に一度ここを間違えて `slice(1)` し、`phlan→forest` の対象停留所を 0 件と数えた。
**ドライバで経路を数えるときは必ずこの仕様を確認すること。**

### 2-6. (4c) が本当に測っているもの / 変異 `fireevent` は作り替えが必要

`tools/verify_world_steps.js:1827` の見出しは

> `⛔ **イベントは 1 件も起きない** — 刻み点に着いてもダイアログ / 遷移が発生しない`

だが、assert 本体(`:1830-1860`)が見ているのは **3 つ**:

1. `t.after.path` が `/world.html$` のまま(= **遷移していない**)
2. **`t.after.askOpen !== false` なら赤** … `askOpen` は `__world.askOpen()` =
   **`#worldEnterAsk` に `.show` が付いているか**だけを見る(`world.html:1105`)
3. 母集団: `onStep`(刻み点に着いたタップ)が 1 件以上

⭐⭐⭐ **だから器を別要素にすれば、① と ② は 1 バイトも触らずに守られたまま残る。**
§2-4 の実測で **SkillCheck のパネルを出しても `askOpen()` は `false` のまま**であることを確認済み。

⛔ **それでも (4c) は書き換える。** 見出しが「イベントは 1 件も起きない」と主張しているのに
イベントが起きるなら、**緑でも嘘**になるからだ。**緩めるのではなく、守っていた 3 条件を
明記する形へ**書き直す(§6-B)。

**変異 `fireevent`(`:232-235`)の作り替えも必須**:

```js
fireevent: { impl: true, file: 'world.html', targets: ['4c'],
  why: '刻み点到着で確認ダイアログを開く (器に中身を入れる)',
  from: 'function onArriveStep(atId, destId) {',
  to:   'function onArriveStep(atId, destId) { if (!WM.has(atId)) askEnter("temple"); …' },
```

これは**本チケット後は「正しい振る舞い」**になってしまう(器に中身が入るのが仕様)。
放置すると **欠陥を検出しない変異が 1 本残る**。#38 / #43 の作法どおり **変異のほうを直す**:

- 新しい `fireevent` = 「**街道イベントを `#worldEnterAsk`(入場の器)へ出す**」= 器の取り違え。
  これなら (4c) の条件②が今後も機械で守られる。

⚠ 変異の `to` は **`from` と同じバイト長にしない**こと。`verify_world_steps` の起動時ガード
「置換の前後が同じ長さ」に当たると **exit 3 でドライバごと死ぬ**(#42 の実測)。

### 2-7. 撤退スイッチの前例 — ページ単位で完結してよい

| スイッチ | 方式 | 出典 |
|---|---|---|
| `?walkstep=0` | **sessionStorage へ写す**(`WALK_STEP_OFF_KEY`、`world.html:789`) | #40 |
| `?heromark=0` | **クエリを読むだけ**(`world.html:528-530`、ページ単位で完結) | #43 |

⇒ **`?roadevent=0` は #43 と同じ「ページ単位で完結・独立読み」にする。**
理由 = イベントは world.html の中でしか起きないので、遷移をまたぐ必要が無い。
⛔ **`?walkstep=0` に相乗りさせない**(別機能を同じスイッチに載せない)。

### 2-8. changelog の要否

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
#   24: GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

⇒ **`world.html` / `js/road-events.js` / `tools/*` は非トリガー = フックは鳴らない**
(#43 で実測済みの結論と一致)。

⭐ ただし本件は**プレイヤーに見える新機能**なので、書ける要約が実在する。
§10 に推奨の 1 行を用意した(⛔ 必須ではない)。

### 2-9. 別窓の差分 — `index.html` を開かずに完了できるか

起草の**開始時**(2026-09-03):

```bash
git status --short          #   M index.html
git diff --stat index.html  #   1 file changed, 132 insertions(+), 9 deletions(-)
```

⚠⚠⚠ **起草中に同じ関数の行番号が 96 行ずれた**(`sfx("levelUp")` が 11938 → 12034)。
隣窓が #44 を実装中である動かぬ証拠。

起草の**終了時**(同日・約 1 時間後)—— 隣窓が 1 本着地させ、次をステージしていた:

```bash
git log --oneline -2
#   1545fa6 #44 項目1 — 敵の頭上に名前札 / 札を 70% へ (実装 + 新 driver の §0 装置)
#   762a6f2 #43 (追補2) …
git status --short          #   M  tools/verify_enemy_name_label.js   ← ⚠ **ステージ済み**
git diff --cached --stat    #   1 file changed, 511 insertions(+), 47 deletions(-)
```

⇒ **`index.html` の #44 分は既にコミットされた**(`1545fa6`)。着手時は行番号を取り直すこと。
⇒ ⚠⚠⚠ **相手のステージが残っている間は commit を打たない**(ヘッダの警告と同じ)。

**`index.html` を開く必要が無いことの確認**:

- イベントの発火・表示・判定はすべて `world.html` と新規 js の中で閉じる
- 報酬の持ち込みは **Phase 2 へ切り出した**(消費側が `index.html` だから)
- `SkillCheck` は `js/skill-check.js` の中で完結。host 側に要るグローバルは
  **`DFAbilities` / `GameAudio` / `HERO_CLASSES` の 3 つだけ**(全文 grep で実測)で、
  **world.html は 3 つとも既読**(プローブで `"object"` を確認)

**既存 golden の基準(2026-09-03)**:

| ドライバ | 基準 | 測り方 |
|---|---|---|
| `tools/verify_world_steps.js` | **33/33 PASSED / FAILED 0 / PENDING 0** | ⭐ **この窓が今日走らせて確認**。⚠ **(4c) だけ書き換える**(唯一の期待値変更) |
| `tools/verify_world_map.js` | 57/57 | #43 完了時の記録(2026-09-03) |
| `tools/verify_world_heromark.js` | 18/18 | 同上 |
| `tools/verify_quest_walk.js` | 25/25 | 同上 |
| `tools/verify_town_exit.js` | 素 23/23 | 同上 |
| `tools/verify_title_screen.js` | 86/86 | 同上 |
| `tools/verify_tavern_map.js` | 43/43 | 同上 |

⚠ 上表は **2026-09-03 時点の記録**。走らせて違ったら**期待値を書き換える前に理由を突き止める**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `world.html` | `<script src="js/skill-check.js">` / `<script src="js/road-events.js">` / Google Fonts URL に `Noto+Serif+JP` / `#worldEventBox` の CSS + HTML / `onArriveStep` からの発火 / `?roadevent=0` / `?roadseed=N` / `__world.roadEvent()` |
| `js/road-events.js` | **新規**。イベント表 6 件 + 地形表 + 発生率 + party の組み立て + 種つき乱数 |
| `tools/verify_road_events.js` | **新規**。受入条件 + `--negative` 内蔵 |
| `tools/verify_world_steps.js` | **(4c) の書き換え** + 変異 `fireevent` の作り替え |

⛔ **`index.html` は開かない**。§2-9 で「開く必要が無い」ことを確認済み。
⛔ **`tavern.html` / `town.html` / `title.html` / `js/skill-check.js` / `js/world-map.js` も触らない**
   (`js/skill-check.js` は**読むだけ**。`AUTO_ROLL_MS` / `RESULT_HOLD_MS` / `CHECKS` を 1 バイトも変えない)。
⛔ **`実装依頼書/README.md` の #45 行は、隣窓の #44 が着地してから足す**
   (行の文面は §11 に用意してある)。

---

## 4. STEP1 — 装置の土台(⭐ ここが立たないと後が全部無意味)

### 4-1. `world.html` に `js/skill-check.js` を載せる

`world.html:493-498` の `<script src>` の並びへ **1 行足す**。
⚠ **`js/abilities.js` より後**(`js/skill-check.js` が「本ファイルより前に読み込むこと」と要求)。

```html
  <script src="js/abilities.js"></script><!-- … -->
  <script src="js/skill-check.js"></script><!-- 街道の出来事 (#45) の d20 判定。⚠ js/abilities.js より後。撤退 ?roadevent=0 -->
  <script src="js/save-slots.js"></script>
```

### 4-2. 新規ドライバ `tools/verify_road_events.js` の骨格と母集団ガード

流用元: `tools/verify_world_steps.js`(同じページを測る・サーバと変異の凍結機構がそのまま使える)。

- サーバ = `:355` の `startServer` / launch = `:2135` / プロファイル = `require('./_pptr_profile')`
- ⚠ **ポートは `verify_world_steps` の 9600 台と、隣窓が予約した 9850〜9870 を避ける**。
  既定 `--port 9760` を推奨
- ⛔ `?autoplay` / `opts.auto` は使わない(`SkillCheck` が UI を出さず即解決してしまい、
  **「パネルが出る」という主張を一度も検査しないまま緑になる**)

**この STEP で立てる母集団ガード**:

- **(0a)** `world.html` を素で開いて **`typeof window.SkillCheck === "object"`**
  ⭐⭐⭐ **これが無いと以降の全 assert が空振りで永久緑になる**(§2-2 の罠 A)
- **(0d)** 測定の走行で「**イベント対象の停留所に着いたタップ**が 1 件以上」

⚠ **STEP1 だけを終えた時点では、イベント本体の assert(§1〜§3)は赤のままが正しい。**
⛔ orchestrator が「全部緑」を完了条件にしないこと(#42 で実際に食い違った)。

---

## 5. STEP2 — 表と器

### 5-1. `js/road-events.js`(新規)— イベント表の唯一の正

構造(⚠ **雛形は「主張」であって実測ではない**。#39 で雛形に潜在クラッシュがあった。
実装窓は貼る前に必ず読み、日本語は自分で書き直すこと):

```js
/*
 * road-events.js — 街道の出来事 (#45 Phase 1) の唯一の正
 * ⛔ 文言を world.html へ 1 文字も写さない (#15 B-1 と同じ規律)。
 * ⛔ 座標を持たない。地形は WORLD_MAP.STEPS[id].on の両端から引く。
 * ⛔ localStorage へ書かない。sessionStorage も **読むだけ (peek)**。
 */
(function (global) {
  "use strict";

  /* 中継点の地形。刻み点は両端から引くので書かない (⛔ 17 件の表を作らない)。 */
  var WAY_TERRAIN = {
    pier: "coast", cross_n: "coast", farm_n: "woods",
    lake_n: "lake", lakeside: "lake", pass_n: "mountain", village_s: "swamp"
  };
  /* 拠点の地形。⚠ **刻み点の両端を引くためだけ**に要る (site 自体では発火しない)。 */
  var SITE_TERRAIN = {
    phlan: "coast", forest: "woods", swamp: "swamp", fort: "swamp",
    mine: "mountain", temple: "mountain", dragon: "mountain"
  };
  /* 地形ごとの発生率。⭐ 遊んで動かすレバー (§8「測らないこと」)。 */
  var RATE = { coast: 0.05, woods: 0.10, lake: 0.12, mountain: 0.18, swamp: 0.20 };

  /* 1 イベント = 導入 + 二択。⭐ 選択肢の 1 つは **判定を伴わない**(立ち去る)。 */
  var EVENTS = [ /* … 下表の 6 件 … */ ];
  ...
})(typeof window !== "undefined" ? window : this);
```

**表に必ず入れる 6 件**(地形 5 種 + `swamp` をもう 1 件):

| id | 地形 | 判定 | DC | 一行 |
|---|---|---|---|---|
| `coast_dock_quarrel` | coast | `persuasion` | easy(10) | 桟橋のいざこざ — 船乗りと仲買が道を塞いでいる |
| `woods_woodcutter` | woods | `insight` | easy(10) | 樵の道案内 — その近道は本当か |
| `lake_ripple` | lake | `perception` | medium(15) | 湖面のさざなみ — 水面下で何かが動いた |
| `mountain_rockfall` | mountain | `athletics` | medium(15) | 山道の落石 — 岩をどけるか、引き返すか |
| `swamp_marker` | swamp | `investigation` | medium(15) | 沼の道しるべ — 誰かが杭を打ち替えた跡がある |
| `swamp_pilgrim` | swamp | `religion` | easy(10) | 行き倒れの巡礼者 — 手向けの作法を知っているか |

各イベントは **導入文 + 選択肢 2 つ**、うち **1 つは判定なし(立ち去る)**。
判定つきの選択肢は **成功文と失敗文を必ず別の文**にする(⛔ 同文だと d20 を振る意味が無い)。

⚠⚠⚠ **使える `checkKey` は 12 個だけ**(`js/skill-check.js:67`):
`perception` / `investigation` / `sleightOfHand` / `stealth` / `athletics` / `arcana` /
`history` / `religion` / `insight` / `persuasion` / `intimidation` / `deception`。
⛔ **`survival` も `medicine` も `nature` も無い。** 5e の技能名で書くと `resolveSkillCheck` が
`console.warn` して **`Promise.resolve(null)` を返し、判定ごと消える**。

⛔ **Product Identity 配慮**: 6 件とも一般的な街道の情景で、WotC 固有 IP を 1 つも使わない。

### 5-2. `#worldEventBox` — イベント専用の器

⛔⛔⛔ **`#worldEnterAsk` を流用しない。** あれは `__world.askOpen()` が握っており、
`verify_world_steps` (4c) の条件②の番人(§2-6)。流用した瞬間に既存 golden が赤くなる。

⭐ 見た目は `#worldEnterBox`(`world.html:425-436`)を**手本にする**:

```css
background-image: linear-gradient(rgba(246,232,198,0.34), rgba(246,232,198,0.34)),
                  url("assets/parchment_plaza.jpg");
```

⛔ `opacity` で薄めない(紙の斑に文字が食われる、と既存コメントが明記)。
⚠ **z-index は写経せず決める。** world.html の層は
`0/1/2/3/4/5/6/10/20`(`#worldEnterAsk` = 20)。**イベントの器は 20 未満**に置き、
判定パネル(105)が必ず上に来るようにする。⭐ 推奨 **15**。

### 5-3. 書体を 1 行足す

`world.html:9` の Google Fonts URL に `&family=Noto+Serif+JP:wght@400;600` を足す(§2-4b)。
⛔ CSS は 1 行も足さない。

---

## 6. STEP3 — 発火と判定

### 6-1. `onArriveStep` からの発火

```js
function onArriveStep(atId, destId) {
  arrivalCount++;
  lastArrival = { at: atId, dest: destId,
                  kind: WM.has(atId) ? "node" : "step",
                  arrived: atId === destId };
  if (lastArrival.arrived && WM.has(atId)) { onArriveNode(atId); return; }   /* ⭐ 入場が優先 */
  maybeRoadEvent(atId);        /* ★ 本チケットの核心。⛔ walkPath の中からは呼ばない */
}
```

**発火の条件(全部満たしたときだけ出す)**:

| 条件 | 理由 |
|---|---|
| `ROAD_EVENT_ON`(`?roadevent=0` でない) | 撤退 |
| `!walkStepOff` | ⚠ 撤退モードは経路全部を 1 回で歩くので `onArriveStep` が 1 ホップ分しか鳴らない。そこで出すと「17 箇所歩いたのに 1 回だけ」という嘘になる |
| **拠点(`site`)ではない** | 入場ダイアログが優先。⭐ 上の `return` で既に満たしている |
| その停留所が**この滞在で初めて** | ノエルの「同じ停留所では二度出さない」。⭐ **ページ内 JS 変数**で持つ(⛔ storage に書かない) |
| 乱数 < 地形の発生率 | §2-5 の表 |
| **移動中でない**(`!moving`) | 歩行アニメの最中に開かない |

### 6-2. `?roadseed=N` — 決定論のシーム

⚠⚠⚠ **確率のままだとドライバが間欠で赤くなる。**
#41 で NPC の巡回が `verify_town_map` を **38% / 15% / 8%** の確率で落とし、
原因の特定に丸一日かかった実例がある。

```js
/* 種つき乱数 (mulberry32 等の 1 行 PRNG で十分)。⛔ Math.random を直接使わない。
   ⚠ 種が無いときは Math.random() 由来の種を 1 回だけ引く = 本番の姿は 1 バイトも変わらない。 */
```

⛔ **`__world` へ書き込みの窓を作らない。** `world.html` の `__world` は
「⛔ 読むためだけ。ここへ状態を置かない」と #23 / #40 / #43 の 3 枚が明記している。
**種は URL から渡す。**

`__world` へ足すのは**読むだけの窓 1 つ**:

```js
roadEvent: function () { return { on: ROAD_EVENT_ON, seed: roadSeed,
                                  fired: roadFiredCount, last: roadLast,
                                  visited: Object.keys(roadVisited) }; },
```

### 6-3. 判定の呼び出し

```js
SkillCheck.resolveSkillCheck(ch.checkKey, ch.dc, buildParty(), {
  title: ev.title, flavor: ev.intro
}).then(function (o) { /* o.success で success / fail の文を出し分ける */ });
```

⚠ **`resolveSkillCheck` は `null` を返しうる**(未知の `checkKey` / 代表者が選べない)。
`null` のときは**失敗扱いにせず、判定なしの結末へ倒す**(⛔ 黙って何も出さないのは禁止)。
⚠ `checkKey` が `null` の選択肢(立ち去る)は判定を呼ばずに結末だけ出す。
⚠ `opts.iconContext` は**渡さない**(未指定なら肖像の領域ごと非表示になる = Phase 1 では不要)。

---

## 6-B. STEP4 — 撤退と非退行

1. `?roadevent=0` の実装(§7)
2. **`verify_world_steps` (4c) の書き換え**(§2-6)。新しい見出しの案:

   > `⛔ **刻み点で入場と遷移は起きない** — 到着で pathname が /world.html のまま・`
   > `__world.askOpen() が false(街道イベントは #worldEnterAsk を使わない)`
   > `⚠ 「刻み点に着いたタップが 1 件以上ある」を同じ assert で見る(0 件だと自明に真)`

   ⛔ **assert 本体のロジックは 1 バイトも緩めない。** 変えるのは**見出しの文言だけ**でよい
   (§2-4 の実測で、パネルを出しても `askOpen()` は false のままだと確認済み)。
3. **変異 `fireevent` の作り替え**(§2-6)。⚠ `from` と `to` を同じバイト長にしない
4. 既存 golden **7 本**の再測(§2-9 の表)

---

## 7. 撤退スイッチ

- **`?roadevent=0`** — 街道イベントが **1 件も起きない**。地図は #43 完了時の姿へ戻る。
- ⚠ 判定位置 = `world.html` のモジュール直下で `URLSearchParams` を 1 回読む
  (**#43 の `HERO_MARK_ON`(`world.html:528-530`)と同じ書き方**)。
- ⚠ **ページ遷移をまたがない**(sessionStorage へ写さない)。理由は §2-7。
- ⛔ **器ごと作らない**(`display:none` で残さない)。#41 の `?npc=0` と同じ倒し方。
- ⛔ `?roadseed=N` は**撤退スイッチではない**(決定論のシームであって機能の on/off ではない)。

---

## 8. 受入条件 — `tools/verify_road_events.js`(新規)

**測り方の方針**: 本物の UI 経路を通す(⛔ `?autoplay` / `opts.auto` は使わない)。
`?roadseed=N` で決定論に固定し、**同じ種で 2 回走らせて同じ列**になることまで見る。
観測するのは「どの停留所で / 何件 / どの器に / 何を奪ったか」。
⛔ **観測しない**のは発生率の具体値と演出の待ち時間(§「測らないこと」)。

### ⚠ 計測機構(既存ドライバの写経では動かない点)

- ⚠ **`WM.findWalkPath(a, b)` は始点を含まない**(§2-5)。経路上の停留所を数えるとき
  `slice(1)` すると 1 つ落ちる
- ⚠ **依頼書の px は地図座標 / ドライバの detail は画面座標**(desktop の `zoom` = **0.8125**)。
  合わないときはまず単位を疑う(#42 の実測)
- ⚠ `world.html` は **CRLF**、`js/*` と `tools/*` は **LF**。変異アンカーは必ず 1 行に閉じる(#40)
- ⚠ ドライバは `?walkstep=0` を**踏まないタブ**で測ること(sessionStorage 経由で効き続ける)

### §0 装置(先に母集団を確かめる)

- **(0a)** ⭐⭐⭐ 素の `world.html` で **`typeof window.SkillCheck === "object"`**、かつ
  `document.querySelector('script[src="js/skill-check.js"]')` が存在する。
  **これが無いと以降の全 assert が空振りで永久緑になる**(§2-2 の罠 A)
- **(0b)** イベントの文言は **`js/road-events.js` から引いている** ——
  `world.html` の配信バイトに **6 件の `title` / `intro` が 1 つも出てこない**
  (⛔ 写経の検出。#15 B-1 と同じ規律)
- **(0c)** **決定論**: `?roadseed=4242` で 2 回走らせて、発火した停留所の列が**完全に一致**する
- **(0d)** **母集団**: 測定の走行で「イベント対象の停留所(17 件のいずれか)に着いたタップ」が
  **1 件以上**。⛔ 0 件だと「起きない」が自明に真になる
- **(0e)** イベント表は **6 件**、地形は **5 種**、母集団の停留所は **17 件**
  (⛔ ドライバは `js/road-events.js` と `js/world-map.js` の**実体から数える**。数字を直書きしない)

### §1 器(どこに出るか)

- **(1a)** イベントが出ているとき、**`#worldEventBox` が可視**で、
  **`__world.askOpen()` は `false` のまま**(⛔ `#worldEnterAsk` を使っていない)
- **(1b)** 拠点(`site`)へ「着いた」タップでは**イベントが 1 件も出ない**
  (母集団ガード = 拠点へ着いたタップが 1 件以上あること)
- **(1c)** イベントの器の `z-index` < 判定パネル(`#skillCheckOverlay` の **105**)。
  ⭐ **105 はドライバがページから読む**(⛔ 直書きしない)
- **(1d)** compact(390x844)でイベントの器が**画面内に収まる**(`fitsX` / `fitsY`)

### §2 party(誰が判定するか)

- **(2a)** ⭐⭐⭐ **sessionStorage に 4 人分**を書いた状態で走らせると、判定パネルのロスターが
  **4 行**出る(= §2-3 の罠 B の検出)。⛔ localStorage しか無い状態と**区別できること**
- **(2b)** sessionStorage を空にすると **1 行**(主人公のみ)に落ちるが、
  **判定は成立する**(`resolveSkillCheck` が `null` を返さない)
- **(2c)** ⛔ **`removeItem` が 1 回も増えていない** ——
  `world.html` の配信バイトに含まれる `sessionStorage.removeItem` の**出現数が
  着手前と同じ**(⚠ 既存の `world.html:995` の 1 件は #23 のもの = 数で見る)

### §3 発火の規則

- **(3a)** **同じ停留所では二度出ない**(往復させて再訪させ、2 回目に出ないことを見る)
- **(3b)** **地形ごとに発生率が異なる**(種を変えて N 回走らせ、`swamp` の発火率 >
  `coast` の発火率。⛔ 具体値は縛らない)
- **(3c)** **`?walkstep=0` では 1 件も出ない**(母集団ガード = そのアームでもホップが 1 件以上)
- **(3d)** 移動中(`__world.isMoving()` が true)にはイベントが開かない
- **(3e)** 判定を伴わない選択肢では **`#skillCheckOverlay` が作られない**
- **(3f)** 判定を伴う選択肢では **`o.success` に応じて出る文が変わる**
  (⭐ 種を変えて成功と失敗の**両方**を引くこと。片方だけだと分岐を一度も見ていない)

### §4 恒等(非退行)

- **(4a)** `WORLD_MAP.NODES` / `EDGES` / `STEPS` が **1 件も変わっていない**
  (⭐ `verify_world_steps` (1d) と同じ恒等ハッシュで突き合わせる)
- **(4b)** `__world` の既存の窓(`heroNode` / `askOpen` / `arrivalCount` / `lastArrival` /
  `stepIds` / `heroMarkGeom` …)が**全部残っている**
- **(4c)** `arrivalCount` は **1 ホップにつきちょうど 1 増える**(#40 の (4b) と同じ規則)

### §5 撤退

- **(5a)** `world.html?roadevent=0` → **`#worldEventBox` が DOM に存在しない**
  (⛔ `display:none` で残っていたら赤)
- **(5b)** `?roadevent=0` のとき **`__world.roadEvent().on === false`** かつ発火 0 件。
  ⭐ **§1〜§3 の assert を撤退アームにも当てる**(#43 の (4b) と同じ設計 ——
  撤退アームだけの assert は自明に緑になる)
- **(5c)** `?roadevent=0` でも **歩行そのものは 1 ミリも変わらない**
  (同じ種・同じ経路で `arrivalCount` と最終ノードが一致)

### ⛔ 測らないこと

- **発生率の具体値**(5% / 10% / 12% / 18% / 20%)—— 遊んで動かすレバー。
  縛るのは (3b) の「地形ごとに違う」という**向き**だけ
- **`AUTO_ROLL_MS` = 2000 / `RESULT_HOLD_MS` = 3600** —— `js/skill-check.js` の共有レバー。
  本チケットでは 1 バイトも触らない
- ⚠ **`#scRollBtn` の高さ 37px**(iOS 推奨 44px 未満)—— **既存の共有部品**なので
  本チケットでは直さない。§9 の実機確認で「押しにくいか」だけ見て、直すなら別チケット
- **イベントの文言そのもの**(6 件の日本語) —— 目で読んで直す余地を残す

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **`noscript`** | ⭐ `world.html` から `<script src="js/skill-check.js">` を外す(**§2-2 の罠 A の再現**) | (0a) |
| **`localparty`** | ⭐ party を **localStorage** から読む(**§2-3 の罠 B の再現**) | (2a) |
| `askreuse` | イベントを `#worldEnterAsk` へ出す(器の取り違え) | (1a) / `verify_world_steps` (4c) |
| `copytext` | 文言を `world.html` に写経して `js/road-events.js` を使わない | (0b) |
| `neverfire` | 1 件も発火させない | (0d) |
| `alwaysfire` | 確率を無視して毎停留所で出す | (3b) |
| `revisit` | 再訪でも出す | (3a) |
| `sitefire` | 拠点でも出す | (1b) |
| `retreatfire` | `?walkstep=0` でも出す | (3c) |
| `seedignore` | `?roadseed` を無視する | (0c) |
| `movefire` | 移動中でも開く | (3d) |
| `sameresult` | 成功と失敗で同じ文を出す | (3f) |
| `retreatkeep` | `?roadevent=0` でも器を DOM に残す | (5a) |
| `nodecount` | 母集団を 17 → 10(刻み点だけ)に狭める | (0e) |

⭐ **§2-2 / §2-3 の罠を再現する `noscript` と `localparty` は必須。**
⚠ 変異の `from` / `to` は**同じバイト長にしない**(#42 の起動時ガードで exit 3 になる)。
⚠ **変異が空振りしたら変異のほうを直す**(#38 / #43 の作法)。受入条件は 1 バイトも弱めない。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_world_steps.js` → **33/33**(⚠ **(4c) の見出しだけ書き換わる**)
- `node tools/verify_world_steps.js --negative` → 変異全本が赤(⚠ `fireevent` を作り替えた後)
- `node tools/verify_world_map.js` → **57/57**
- `node tools/verify_world_heromark.js` → **18/18**
- `node tools/verify_quest_walk.js` → **25/25**
- `node tools/verify_town_exit.js` → 素 **23/23**
- `node tools/verify_title_screen.js` → **86/86**
- `node tools/verify_tavern_map.js` → **43/43**

⚠ 基準値は **2026-09-03 時点**の記録(`verify_world_steps` の 33/33 だけはこの窓が今日実測)。
**走らせて違ったら期待値を書き換える前に理由を突き止める。**

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` では音が出ない)。

1. iPhone 縦持ちで、イベントの一枚が**片手で読める**か(文字サイズ・行長)
2. 二択のボタンが**指で押し分けられる**か(タップ領域 44px)
3. `touchend` → `click` の**ゴーストクリック**で、開いた瞬間に選択肢が押されないか(#35 の実測)
4. 判定パネルの `#scRollBtn`(**37px**)が押しにくくないか(⛔ 直すのは別チケット)
5. 港町 → 廃坑を通しで歩いて、**イベントが「通行料」に感じないか**(期待 0.91 件 / 38% は無風)
6. 逆に**近場の依頼(森)で 95% 何も起きない**のが物足りなくないか
7. 6 件の文章を読んで、**二度目に出たときに飛ばしたくならないか**
8. 歩行アニメ中に押しても壊れないか
9. AudioContext 未アンロックのままイベントを開いても無音で通るか
10. 書体が `Noto Serif JP` で出ているか(§2-4b の 1 行が効いているか)

---

## 10. changelog

⛔ **必須ではない。** `scripts/hooks/check_changelog.py` の
`GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` に `world.html` は入っていないので
**フックは鳴らない**(§2-8)。

⭐ ただし本件は**プレイヤーに見える新機能**なので、push 前に 1 行足すことを**推奨**する:

    py tools/add_changelog.py "<b>街道で出来事が起きるようになった</b> — 地図を歩いていると、行商人や落石に出くわすことがある。応じ方を選ぶと、腕前しだいで結末が変わる。"

⚠ これを打つと `tavern.html` を触ることになるが、`changelogList` を同時に更新するので
フックは通る。⛔ 隣窓は `tavern.html` を触っていない(§2-9 で `git status` 確認済み)が、
**commit 前に `git diff --cached tavern.html` を必ず読む**こと。

---

## 11. やらないこと

- ⛔ **報酬の持ち込み**(Phase 2「街道の実り」)—— イベントの結果を sessionStorage の 1 キーで
  次の依頼へ渡し、`index.html` が消費する。**隣窓の #44 が push されてから別チケット**
- ⛔ **金貨 / XP の増減**、**localStorage への書き込み** ——
  `world.html` は現在 `setItem` / `removeItem` が **0 件**。この性質を壊さない
- ⛔ **イベントを 7 件以上に増やす** —— 6 件で遊んでから決める
- ⛔ **`#scRollBtn` の 37px を 44px にする** —— `js/skill-check.js` の共有部品で全ページに波及する
- ⛔ **`AUTO_ROLL_MS` / `RESULT_HOLD_MS` の変更**
- ⛔ **拠点(`site`)でのイベント** —— 入場ダイアログと二重になる
- ⛔ **戦闘の発生** —— 街道で戦闘に入る導線は今回作らない(テキストと判定だけ)
- ⛔ **`実装依頼書/README.md` への行追加**(隣窓の #44 着地後)。用意してある行:

    | 45 | [2026-09-03_road-events.md](2026-09-03_road-events.md) | **承認済** | 0% | 街道の出来事 Phase 1。停留所 17 箇所で低確率の 1 枚テキスト + 二択、d20 で結末が分岐。⚠⚠⚠ 罠A = **`js/skill-check.js` は world.html に載っていない**(`grep -l` はコメントを拾うので 5 枚返す)→ `if (window.SkillCheck)` で書くと例外も出ずに全イベントが静かに消える。⚠⚠⚠ 罠B = **party の 4 人分は sessionStorage / localStorage は主人公 1 人だけ**。⭐ 器は `#worldEventBox`(⛔ `#worldEnterAsk` を流用すると `verify_world_steps` (4c) が赤)。⭐ 判定パネルは z-index **105** で `#worldStage` の scale の外(実測済み・compact でも収まる)。⭐ 期待イベント数は横断 1 回で **0.85〜0.91 件**(38% は無風)。⚠ (4c) の**見出しだけ**書き換え + 変異 `fireevent` の作り替えが必須。撤退 `?roadevent=0` / 種 `?roadseed=N` |

---

## 12. 実装結果

**結論 = 完了**(dev-loop 5 項目 / 停止 0 回)。⛔ **push は未実施**(ユーザー承認事項)。

### 12-1. コミットと検証値

| 項目 | commit | 触ったもの | そのときの検証 |
|---|---|---|---|
| 1(STEP1 装置) | `a9485f3` | `world.html` に `<script src="js/skill-check.js">` 1 行 / 新規 `tools/verify_road_events.js`(739 行・ポート 9760) | `verify_road_events` **3/3** PENDING 22 / `--negative` 3/3(`noscript` のみ実装)/ `verify_world_steps` 33/33 |
| 2(STEP2 表と器) | `475839d` | 新規 `js/road-events.js`(イベント 6 件・地形 5 種・器の描画)/ `world.html` に `#worldEventBox` と CSS と `Noto Serif JP` | `verify_road_events` **7/7** PENDING 18 / `--negative` 6/6 空振り 0 / `verify_world_steps` 33/33 |
| 3(STEP3 発火と判定) | `413ca36` | `world.html` の `maybeRoadEvent` / `onRoadChoice` / `finishRoadEvent` / 窓 `__world.roadEvent()` / `js/road-events.js` に種つき乱数・`buildParty`・`resultText` | `verify_road_events` **21/21** PENDING 4 / 変異 10 本 impl |
| 4(STEP4 撤退) | `4d7db24` | `world.html` の `ROAD_EVENT_ON` と `elRoadBox.remove()` / ドライバの撤退アーム 3 本 | `verify_road_events` **25/25 PENDING 0** / `--negative` **43/43**(変異 14 本すべて赤・空振り 0) |
| 5(既存 golden の直し + 締め) | 本コミット | `tools/verify_world_steps.js` / `verify_world_map.js` / `verify_quest_walk.js` / `verify_world_heromark.js` / 本依頼書 §12 / `README.md` | 下の 12-3 |

⛔ 項目 5 では **`world.html` / `js/road-events.js` を 1 バイトも触っていない**
(直したのは検証ドライバだけ = 機能は項目 4 の姿のまま)。

### 12-2. ⚠⚠⚠ 依頼書が外していた点(⭐ ここが本チケット最大の学び)

#### (a) ⚠⚠⚠ 器が**全画面モーダル**なので、既存 golden のクリックを**構造的に全部飲む**

§8 の「既存 golden の非退行(実装後に必ず走らせる)」は **7 本とも基準どおり**を要求していたが、
その非退行は **この機能自身によって成立しなくなった**。依頼書はこの副作用を 1 行も予見していない。

`#worldEventBox` は `position: fixed; inset: 0`(`world.html:475`)。`.show` の間は
**地図のどこを押しても器が受ける**。実測(項目 3 の時点):

| golden | 素の基準 | #45 実装後 | 指紋 |
|---|---|---|---|
| `verify_world_steps` | 33/33 | **間欠**(3 回中 1 回だけ緑) | 「1px も進まなくなった」 |
| `verify_world_map` | 57/57 | **51/57** | 「押した先が別要素(worldEventBox)」/「遷移待ちタイムアウト」 |
| `verify_quest_walk` | 25/25 | **20/25** | 「12 回押しても着かない: mine(最後の位置=lake_n)」 |
| `verify_world_heromark` | 18/18 | **17/18** | (3a) が `roadEvent` を「増えた 3 つ目のキー」として赤(⭐ これだけは器と無関係で、**正当な期待値更新**) |

⭐⭐⭐ **#41 の `stopPropagation` 事件と同型だが、性質が 1 段悪い。**
⭐ #41 は NPC が 96x96 の「板」になってタップを食ったので **巡回の端点をずらして避けられた**。
今回は **全画面**なので、データをずらして避ける道が原理的に無い。
⇒ 教訓 = **「モーダルを 1 枚足す」は、その地図を実クリックで歩く既存ドライバ全部への破壊的変更。**
新しい `position: fixed; inset: 0` を足すチケットでは、**着手前に「そのページを実クリックする
golden を全部列挙する」**こと(今回は 4 本 = steps / map / quest_walk / heromark)。

#### (b) ⚠⚠⚠ **`?roadevent=0` では既存 golden を救えない**(ユーザー決定の前提が 1 つ崩れた)

ユーザー決定(2026-09-03)は「`verify_world_map` / `verify_quest_walk` は
**ページ URL に `?roadevent=0` を足す**。⛔ 期待値は 1 つも書き換えない」だったが、
**その 2 本は撤退クエリを受け取れない**ことが実測で判明した:

| 節 | 実体 | 意味 |
|---|---|---|
| `verify_world_map` (7e) | `if (r.search !== '') bad.push(...)` | 歩く当のページで `location.search === ''` を要求 |
| `verify_quest_walk` (2d) | 同上 | 同上 |
| `verify_quest_walk` (3a) | `s1.search === ''` | 同上 |

⇒ URL にクエリを足すと **その 3 本が赤くなる** = 「期待値を書き換えない」と両立しない。
⭐ **両立させる唯一の道は「直すのは押し口だけ」**(この 2 本のドライバ自身が
`⛔ ?walkstep=0 を URL へ足して逃げない` と同じ規律を既に明文で持っている)。
⇒ **3 本とも `dismissRoadEvent()`(器が開いたら「立ち去る」= 判定を伴わない選択肢を押して進む)
で通した。期待値の変更は 0 件**、しかも **3 本とも「出荷される姿(イベントあり)」を測り続ける**
(撤退アームで走らせると #39 の「撤退アームだけの受入条件は永久緑」に落ちる)。

⚠ 器を閉じるクリックは **タップ数に数えない**((3b) の刻み回数と (4b) の `arrivalCount` 増分が狂う)。
⚠ `ROAD_EVENTS.ARM_MS`(260ms)のゴーストクリック除けを **開くたびに 2 回**待つ
(導入 → 結末 で `armAt` が引き直されるため)。

#### (c) ⚠⚠⚠ (3c) の `if (walkStepOff) return false;` は**実質デッドコード**

§6-1 の実装雛形が要求した撤退ガード(`?walkstep=0` のときは出さない)は、
**その行を消しても振る舞いが 1 ミリも変わらない**。理由 = 撤退モードでは `goToPoint` が
`var hop = walkStepOff ? path : path.slice(0, 1)` で **経路全部を 1 ホップで歩き切る**ので、
`onArriveStep(last, id)` の `last === id` が必ず真になり
`if (lastArrival.arrived && WM.has(atId)) { onArriveNode(atId); return; }` で抜ける
= **`maybeRoadEvent` にそもそも到達しない**。
⇒ 項目 4 で変異 `retreatfire`(「`?walkstep=0` でも出す」)が**空振り**した。
⇒ #38 / #43 の作法どおり **変異のほうを直し**、`walkPath` の rAF の中から決定論的に発火させる形へ
作り替えて赤にした。⭐ 教訓 = **「ガードを 1 行消す」変異は、そのガードに到達する経路が
実在するときにしか欠陥にならない**(#43 の `pointer-events` = 「設定と幾何は別条件」と同型)。

#### (d) 地形は **4 種では割れない** — 5 種へ増やした

開発会議は「地形 4 種」と言っていたが、実データで割ると **`mountain` が 9 件 = 母集団 17 の
半分超**になる。起草時の実測でこれを潰し、§2-5 で **5 種**(coast 2 / woods 2 / lake 5 /
mountain 4 / swamp 4)へ増やしてある。項目 2 の実装は `TERRAIN_RANK`(低→高で
`coast < woods < swamp < lake < mountain`、刻み点は**より辺境な側が勝つ**)だけで
この割りを **1 件の座標も書かずに完全再現**した(⛔ 17 件の表を作っていない)。
⭐ 教訓 = **「n 種類に分ける」は実データで割ってみるまで決めてはいけない。**

#### (e) 変異 `fireevent` の作り替え(§2-6 の予告どおり・実装で確定)

旧 `fireevent`(「刻み点到着で確認ダイアログを開く」)は **#45 の後は正しい振る舞い**になり、
**欠陥を検出しない変異が 1 本残る**。⇒ 新 `fireevent` = **器の取り違え**
(`RE.open(ev, …)` の 1 行を `elAsk.classList.add("show")` へ)。
これで (4c) の条件②(`__world.askOpen()` が false)が今後も機械で守られる。
実測 = 変異ポート `:9611` で (4c) が赤(`ダイアログが開いた=52 件`)。

#### (f) ⚠ `verify_world_steps` 側にも `?roadseed=N` が要った

依頼書は `?roadseed` を「新ドライバの決定論のシーム」としか書いていないが、
**既存 golden 側でも必要だった**。理由 = 素の一巡で **1 件も出来事が出ない確率が約 7%**
(∏(1-rate) = 0.95²·0.90²·0.88⁵·0.82⁴·0.80⁴)あり、そのときは変異 `fireevent` が
**「たまたま何も起きなかった」で空振り**する。⇒ `measurePlay` の URL へ `?roadseed=45` を
足して固定(⛔ `?roadevent=0` ではない = 機能は on のまま)。
この種での実測 = 3 件発火(`cross_n` 桟橋のいざこざ / `lake_n__lakeside@2` 湖面のさざなみ /
`village_s` 行き倒れの巡礼者)。

### 12-3. 最終の検証値(項目 5 の完了条件)

```
node tools/verify_road_events.js              → 25/25 PASSED / FAILED 0 / PENDING 0
node tools/verify_road_events.js --negative   → 43/43 PASSED / FAILED 0 (変異 14 本すべて赤・空振り 0)

既存 golden 7 本(⛔ 期待値の変更は heromark (3a) の +1 キーのみ):
node tools/verify_world_steps.js              → 33/33  ⭐ 3 回連続で緑(間欠だったので必須)
node tools/verify_world_steps.js --negative   → 56/56  (変異 15 本・新 fireevent 含めて空振り 0)
node tools/verify_world_map.js                → 57/57
node tools/verify_quest_walk.js               → 25/25
node tools/verify_world_heromark.js           → 18/18
node tools/verify_town_exit.js                → 23/23
node tools/verify_title_screen.js             → 86/86
node tools/verify_tavern_map.js               → 43/43
```

### 12-4. 期待値を書き換えた箇所(⭐ 1 件だけ・理由つき)

- `tools/verify_world_heromark.js` の `NEW_SEAM_KEYS` に **`roadEvent` を 1 個追加**。
  §8 (4b) が「#45 が足すのは **読むだけの窓 1 個**」を最初から宣言しているので **正当な更新**。
  ⛔ assert 本体(消えたキー 0 件 / `typeof` / 戻り値の有限性)は 1 バイトも触っていない。
- それ以外の 6 本は **期待値の変更 0 件**(直したのは押し口と、(4c) の**見出しの文言だけ**)。

### 12-5. 残っていること

- **§9 の実機/実感の確認 10 項目**(iPhone 縦持ちで読めるか / 二択が押し分けられるか /
  ゴーストクリック / `#scRollBtn` 37px / 通行料に感じないか / 近場で 95% 無風が物足りないか /
  二度目に飛ばしたくならないか / 歩行アニメ中 / AudioContext 未解錠 / 書体 `Noto Serif JP`)。
- **push**(ユーザー承認事項)。
- §10 の changelog 1 行は **任意**(`world.html` はフックの `GAME_LOGIC` 外)。
- ⛔ Phase 2「街道の実り」(結果を次の依頼へ持ち込む)は §11 のとおり **別チケット**。
