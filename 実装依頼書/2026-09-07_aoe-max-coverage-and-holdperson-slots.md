# #59 範囲呪文を「最大巻き込み」で撃つ + ホールド・パーソンをターンアンデッドと同格へ

- **ステータス**: **承認済**(2026-09-07)
- **着手**: ⏸ **保留** — ⚠⚠⚠ 隣窓 `claude-bf` が **#58 で `index.html` を編集中**。着手は **#58 の着地後**
- **引き渡し**: ✅ **完了**(2026-09-07) — ユーザー指示どおり **#58 の着地を確認してから**送った
- ⚠ **訂正(引き渡し時)**: §13 は「起草(未承認)」の文面で用意していたが、**承認済**なので台帳へは
  `**承認済**(2026-09-07)` で追加した。追加の実行は **#58 の着地(`53fb99f`・作業ツリー clean)を
  確認した後**。⭐ 保留の理由(隣窓が `実装依頼書/README.md` を編集中)が消えたので解除した。⛔ 黙って破っていない
- **起草窓**: claude-6a(起草担当) / **実装窓**: claude-bf
- **元になった会議**: `dev-meetings/2026-09-07_aoe-coverage-and-holdperson.md`(第1段 + 第2段・承認済)
- **測定基準**: `7b6235c`(2026-09-07 18:53 時点の HEAD)。⛔ **行番号は書かない — 識別子で引くこと**

---

## 1. 目的

**(A)** パーティの範囲呪文が「味方が範囲に入る撃ち方」を全部捨てているのをやめ、
**最も多くの敵を巻き込める場所へ撃つ**。味方は元々 1 ダメージも受けないので、巻き込みは**実質ノーコスト**。

**(B)** #57 で入れたホールド・パーソンが実プレイで一度も出ない。真因は「撃たない」のではなく
**撃つ機会が 1 ラン 1 回しかなく、その 1 回を他の枝に取られている**こと。
**ターンアンデッドと同格の資源配分**にして、出る呪文にする。

⛔ 手段ではなく目的で判定すること: 「拒否権を消した」ではなく **「平均巻き込み数が増えた」** が達成条件。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 参照先(⚠ 行番号は隣窓の編集で動く。**識別子で引くこと**)

| 識別子 | ファイル | 役割 |
|---|---|---|
| `pickAoeOrigin` | `index.html` | 箱型 AoE の着弾点探索。**拒否権はここ** |
| `partyInArea` | `index.html` | PT が範囲に居るか。⚠ **4 呼び口**あり、外すのは 3 つだけ |
| `enemiesInArea` | `index.html` | 被害者列挙(グローバル版)。**敵のみ** |
| `aoeBoxReachable` | `index.html` | 射程 **+ 視線**の判定 |
| `pickClosestEngagedEnemyFromAlly` | `index.html` | 狙点。⛔ **15 呼び口 — 1 文字も触らない** |
| `allySleep` | `index.html` | スリープ。**専用の 2x2 実装** |
| `CLERIC_SLOTS_TABLE` | `index.html` **+ `tavern.html`** | ⚠ **二重定義** |
| `CLERIC_SKILLS_UI` | `tavern.html` | `levelReq` の鏡 |
| `clericAI` | `index.html` | 僧侶の梯子 |
| `pickHoldPersonTarget` / `holdPersonImmune` | `index.html` | 対象の絞り(#57 が畳んだ) |
| `window.__aoeStats` / `noteAoeOutcome` | `index.html` | **既存の観測シーム** |

### 2-2. ⭐⭐⭐ 崩れた主張 その1 — 拒否権は「箱型 4 本」ではない。**3 系統 + 箱型は 5 本**

会議は「該当 = fireball / ice-storm / hail-of-thorns / conjure-volley の 4 本」としたが、**実測で崩れた**。

再測定コマンド:

```bash
git show HEAD:index.html > /tmp/head_index.html
grep -n "partyInArea(" /tmp/head_index.html      # 定義 1 + 呼び口 4
grep -n "pickAoeOrigin(" /tmp/head_index.html    # 定義 1 + 呼び口 5
```

| 系統 | 場所(識別子) | 形 | #50 で直ったか |
|---|---|---|---|
| **箱型** | `pickAoeOrigin` 内 | `if (partyInArea(c.tx, c.ty, S, S)) { partyRejected++; continue; }` | ❌ **未** |
| 円錐 | `coneTilesFrom` を回す探索 | pass0 = 清潔で即棄却 / pass1 = 味方入りを許可 | ⭕ **2 段化済** |
| **直線** | lightning-bolt の方向探索 | `if (partyInArea(tx, ty, 1, 1)) { blocked = true; break; }` | ❌ **未** |
| **splash** | lightning-arrow の周囲 | `const splashOk = !partyInArea(pTX - 1, pTY - 1, 3, 3);` | ❌ **未** |

⭐ 箱型の呼び口は **5 本**(4 本ではない):
`fireball`(S=3) / `ice-storm`(S=5) / `hail-of-thorns`(S=3) / `conjure-volley`(S=5) /
**`cordon-of-arrows`**(S=3・`allowZeroFoes: true`)。⚠ **cordon-of-arrows を数え落としていた**。

⇒ **STEP1 は 3 系統すべてを外す。** 同じ 1 行の欠陥を半分だけ直すと、次に「ライトニング・ボルトも避ける」が来る。

### 2-3. ⭐⭐⭐ 崩れた主張 その2 — `partyInArea` を消してはいけない

`partyInArea` の呼び口は **4 つ**。今回外すのは **箱型・直線・splash の 3 つだけ**で、
**円錐の pass0(`partyInArea(t.tx, t.ty, 1, 1)`)は残す** —— あれは #50 が作った
「清潔な方向を先に探す」2 段構えの 1 段目で、**拒否権ではなく優先順位**だから。

⛔ `partyInArea` の**定義そのもの**を削除・変更しない。

### 2-4. ⭐⭐⭐ 崩れた主張 その3 —「狙点は単体呪文と共有」どころではない。**15 呼び口**

```bash
grep -c "pickClosestEngagedEnemyFromAlly(" /tmp/head_index.html   # 定義 1 + 呼び口 15
```

魔法使い・僧侶・エルフ・盗賊・戦士の**ほぼ全職の狙点**がこの 1 本を通る。

⛔⛔⛔ **1 文字も触らない。** STEP2 は **AoE 専用の新関数**を足して、
**箱型 5 本の呼び口だけ**が新関数を使う。⚠ これを守らないとマジック・ミサイルの狙いまで変わる。

### 2-5. ⭐⭐ 崩れた主張 その4 — `aoeBoxReachable` は視線を見ている

会議でレンツが「射程は見てるが視線は見ていない」と言ったが**誤り**。実体は:

```js
if (tileChebyshev(aCX, aCY, fx, fy) <= rangeTiles && hasLineOfSight(aCX, aCY, fx, fy)) return true;
```

⇒ 新しい中心候補にも**そのまま効かせてよい**(壁の向こうを狙う心配は要らない)。
⭐ ただし現状 `aoeBoxReachable` は **pass1(拡張窓)にしか掛かっていない**。
STEP2 で候補を増やすなら、**増やした候補には必ず掛けること**(でないと射程外へ撃つ)。

### 2-6. 味方は元々 0 ダメージ(= 巻き込みは実質ノーコスト)

被害者列挙は `enemiesInArea`(**敵のみ**)。#50 のコメントが名指しで書いている:

> ⚠⚠⚠ 味方は **元々 1 ダメージも受けない**。…よって拒否権は誤射を防いでいるのではなく
> **絵面のためだけ**に発射率を落としていた

酒場の呪文説明も『PT 巻き込みなし』と約束済み。⇒ **仕様変更ではなく、守っていないガードの撤去**。

### 2-7. ⭐⭐⭐ (B) の真因は 3 系統(Lv 不足ではない)

主人公は **Lv7**。`"hold-person": [0,0,0,0,0,1,1,1,2,2,2]` の index 7 = **1 枚持っている**。
⇒ 「Lv 不足で撃てない」は**外れ**。真因は:

| # | 事実 | 出どころ |
|---|---|---|
| B-α | 固定シナリオの推奨 Lv = **3,4,5,6,8,10**。`qGetTier` は ≤4 が tier1、`BAND.tier1 = [2,4]`。⇒ **シナリオ 1・2 では主人公 Lv7 でも NPC 僧侶が Lv2〜4** = 装備欄に入らず**原理的に 0 回** | `tavern.html` の `assignCompanionLevels` |
| B-β | ⭐⭐⭐ **呪文スロットの回復はダンジョン制覇時のみ**(休憩では戻らない)。= **1 ラン 1 発** | `index.html` の `dungeonCleared` の枝 |
| B-γ | `holdPersonImmune` = アンデッド + ボス。⇒ 廃坑・神殿では**ターンアンデッドが先に 1 手番を取り、対象からも外れる二重の負け** | `holdPersonImmune` |

### 2-8. ⭐⭐⭐ (B) の決着の根拠 — Lv7 僧侶のスロット 18 枚中 1 枚 = 5.6%

`CLERIC_SLOTS_TABLE` を Lv7 で数えた実測:

| 呪文 | Lv7 の枚数 | 解禁 |
|---|---|---|
| cure-light-wounds | 4 | Lv1 |
| shield-of-faith | 3 | Lv1 |
| cure-moderate / bless / striking / **turn-undead** | 2 | Lv3 |
| cure-serious / cure-critical / **hold-person** | 1 | Lv5 / Lv7 / Lv5 |

**合計 18 枚。hold-person は 1 枚 = 5.6%。** 同じ「妨害」系の **turn-undead は Lv3 解禁で 2 枚**。

⇒ **`hold-person` を `turn-undead` と 1 文字も違わない数列にする**。
これで「枚数」と「解禁 Lv」が**一度に**片付き、根拠は
**「同じ Lv3 帯の妨害呪文と同格にした」の一言**で済む(恣意的にレバーを動かしたことにならない)。

```js
"turn-undead":  [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],   // 既存
"hold-person":  [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],   // ← これに揃える
```

### 2-9. ⭐⭐⭐ 梯子の入れ替えは「構造で」安全

`pickHoldPersonTarget` は**アンデッドとボスを対象から外し、居なければ `-1` を返す**。
⇒ アンデッドしか居ない部屋では hold-person の枝が**黙って次へ落ちる**。

**「アンデッド戦ではターンアンデッド、それ以外では金縛り」が自動で成立する。**
⇒ 梯子で hold-person を turn-undead の**前**へ出しても、turn-undead は 1 枚も損しない。
⭐ これは受入で 1 本 assert すること(§9 の §5)。

### 2-10. ⚠⚠ 二重定義が **3 枚**(#57 が実測した跡)

#57 の実装窓が「`tavern.html` に僧侶呪文の鏡が 3 枚ある」と実測し、依頼書 §14 に記録している:
`CLERIC_SKILLS_UI` / `CLERIC_SLOTS_TABLE` / `DEFAULT_KNOWN_TV`。
**コード自身が「index.html と二重定義なので片方だけ直すと食い違う」と警告を書いている**。

今回動かすのは:

- `CLERIC_SLOTS_TABLE` の `hold-person` 行 … **`index.html` と `tavern.html` の両方**
- `CLERIC_SKILLS_UI` の `hold-person` の **`levelReq: 5` → `3`** … `tavern.html`
- `DEFAULT_KNOWN_TV` … ⭕ **変更不要**(習得済み判定であって Lv 判定ではない)

### 2-11. 母集団(既存 golden)— ⭐ 129 本のうち**真の近親は 4 本**

```bash
ls tools/verify_*.js tools/driver_*.js tools/probe_*.js | wc -l          # 129
grep -ln "__aoeStats\|pickAoeOrigin\|clericAI\|hold-person\|allyFireball\|allySleep\|conecast" tools/*.js
```

| ドライバ | なぜ効くか | 記録値 |
|---|---|---|
| ⭐⭐⭐ `tools/driver_field_step7.js` | **`AOE_WIDE_WINDOW` を作った本**。`pickAoeOrigin` を触ると必ず反応する | 実装窓が STEP0 で実測 |
| ⭐⭐⭐ `tools/verify_cone_cast.js` | **#50 の本**。円錐の 2 段構えを守る。⭐ 本文に実測値がある: **素 184/240 = 76.7% / 撤退 57/240 = 23.8%** | 41/41(2026-09-04) |
| ⭐⭐ `tools/verify_hold_person.js` | **#57 の本**。(B) を触ると必ず反応する | 31/31(2026-09-07) |
| ⭐ `tools/driver_action_priority.js` | `executeSkillOn` の**シグネチャ行を逐語アンカー**にしている(#57 §2-10) | 実装窓が STEP0 で実測 |

⛔ **129 本全部は回さない。** 上の 4 本は必須。残りは実装窓が STEP0 で「触る識別子で grep して」足すこと。

⚠⚠ **着手前から赤い本が 2 本ある**(#57 §14-6 から継承・**今回とは無関係**):
`verify_walk_block` 22/23 と `driver_speech_v2` 45/46。真因は #53 の `swampNovice` で
「在庫の総数を写経した検出器」が腐ったもの。⛔ **これを緑にしようとしない**(§12 で別チケット送り)。

### 2-12. changelog の要否

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py   # ("index.html", "tavern.html", "audio.js")
```

⇒ **必須**。`index.html` と `tavern.html` の両方を触る。
⭐ **プレイヤー向けの要約は実在する**(嘘をでっち上げる必要がない):
「魔法使いが仲間ごと巻き込んで撃つようになった」「僧侶の金縛りが早く・多く出るようになった」。

### 2-13. ⚠⚠⚠ 並走 — 隣窓が `index.html` を編集中

```bash
git -c core.quotepath=false status --short
```

2026-09-07 18:53 時点で `claude-bf` が **#58** を回しており、`index.html` / `tavern.html` /
`js/df-mapdef.js` / `tools/driver_graph_p6.js` / `tools/goldens/grid_s2.json` が変更中。
⭐ **`pickAoeOrigin` の行番号が 1 時間で 27536 → 27704 へ動いた**。

⇒ **着手は #58 の着地後**。⛔ `git add .` 禁止・ファイル単位 add・`git diff --cached <file>` を読んでから commit。

---

## 3. 変更範囲

| ファイル | 触る | 内容 |
|---|---|---|
| `index.html` | ✅ | 拒否権 3 系統・AoE 専用狙点・sleep の狙点・「無傷」表示・`CLERIC_SLOTS_TABLE`・`clericAI` の梯子 |
| `tavern.html` | ✅ | `CLERIC_SLOTS_TABLE` の鏡 1 行 + `CLERIC_SKILLS_UI` の `levelReq` |
| `tools/verify_aoe_coverage.js` | ✅ 新規 | 受入ドライバ(base **10141**) |
| `実装依頼書/README.md` | ⏸ | ⚠ 一覧行の追加は**隣窓の #58 が着地してから**(§13 に文面を用意) |
| ⛔ `js/df-mapdef.js` / `tools/driver_graph_p6.js` / `tools/goldens/grid_s2.json` | ❌ | **隣窓 #58 の持ち物**。開かない |

---

## 4. STEP1 — 絶対拒否権の撤廃(3 系統)

### 4-1. 撤退スイッチ

`?aoecover=0` で **2026-09-07 以前**(拒否権が絶対)へ戻る。判定は **1 箇所**にまとめ、
ページ内で完結させる(`?conecast=0` と同じ流儀。sessionStorage へ写さない)。

```js
const AOE_COVER_ON = new URLSearchParams(window.location.search).get("aoecover") !== "0";
```

### 4-2. 3 系統の外し方

1. **箱型**(`pickAoeOrigin` 内) — `if (partyInArea(...)) { partyRejected++; continue; }` を
   スイッチで無効化する。⭐ **`partyRejected` の計上は残す**(観測シームが死ぬと受入が測れない)。
2. **直線**(lightning-bolt の方向探索) — `blocked = true` の枝を同じスイッチで無効化。
3. **splash**(lightning-arrow) — `splashOk` を「スイッチが入っていれば常に true」へ。

⛔ **円錐の pass0 は触らない**(§2-3)。⛔ `partyInArea` の定義も触らない。

---

## 5. STEP2 — 箱型 AoE の「最多巻き込み」狙点(⭐ 本丸)

### 5-1. ⛔⛔⛔ 採ってはいけない形

- ⛔ `pickClosestEngagedEnemyFromAlly` を書き換える(**15 呼び口**が巻き添え。§2-4)
- ⛔ `pickAoeOrigin` の本体の評価順(`partyInArea` → `enemiesInArea`)を組み替える
  (`driver_field_step7` が窓拡張の順序に依存している)

### 5-2. ⭐ 採る形 — 外側で中心候補を回す

**`pickAoeOrigin` 本体は 1 命令も変えない。** 呼び口の側に AoE 専用の新関数を 1 本足す:

```
pickAoeBestOrigin(spellId, ally, S, rangeTiles, allowZeroFoes):
  生存敵(enemiesInArea と同じ除外: !alive / inactive / isEscortObjective)を順に中心候補にし、
  各候補について pickAoeOrigin(...) を回して { best, count } を得る
  → count が最大の best を採る
  → 同数なら **術者に近い方**を優先(⭐ 揺れ防止。これが無いと毎ターン着弾点が踊る)
  → ⭐ 候補には必ず aoeBoxReachable を掛ける(§2-5)
```

⭐ 計算量は敵 N 体 × 窓 S² 通り。N は高々十数体、S² は 9〜25 ⇒ **数百回のループ**。DOM は 1 枚も増えない。

### 5-3. 差し替える呼び口(**5 本**)

`fireball` / `ice-storm` / `hail-of-thorns` / `conjure-volley` / `cordon-of-arrows`。
⚠ `cordon-of-arrows` は `allowZeroFoes: true` を保つこと(敵 0 体の設置は従来仕様)。

---

## 6. STEP3 — スリープの狙点 + 「無傷」表示

### 6-1. スリープ

⭐ `allySleep` は **拒否権を持っていない**(§2-2 の表に無い)。直すのは**狙点だけ**。
現状「最寄りの敵を含む 2x2 の 4 通り」から選んでいるのを、**全生存敵を中心候補**へ広げる。
⛔ `allySleep` 内のローカル `enemiesInArea`(2x2 固定・`inactive` 除外を持たない)は
**その性質を保ったまま**使うこと(グローバル版に置き換えない)。

### 6-2. 「無傷」表示(⭐ 文字だけ。DOM を増やさない)

味方が範囲に入ったとき、既存の `showRollAtAlly` の 1 行へ **`(味方 N 名は無傷)`** を足す。

⛔⛔ **光り物・オーラ・新しい DOM は 1 枚も足さない**(#57 の金の輪の実機体感が**まだ未確認**。
同時 4 体の描画負荷が判っていない段階で光源を増やさない)。

---

## 7. STEP4 — ホールド・パーソンを turn-undead と同格へ(⭐ STEP1〜3 と完全に独立)

### 7-1. 撤退スイッチ

`?holdslots=0` で #57 着地時のテーブルと梯子へ戻る。⭐ #57 の `?holdperson=0`(呪文ごと消す)とは**別物**。

### 7-2. スロット表(**2 ファイル**)

```js
"hold-person":  [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],   // turn-undead と同一
```

⚠ `index.html` と `tavern.html` の**両方**。

### 7-3. 表示の鏡

`tavern.html` の `CLERIC_SKILLS_UI` の `hold-person` を **`levelReq: 5` → `3`**。
⛔ `DEFAULT_KNOWN_TV` は変更不要(§2-10)。

### 7-4. 梯子

`clericAI` で hold-person の枝(#57 の `2b`)を **turn-undead の枝より前**へ移す。
⭐ 確率ゲートは掛けない(#57 の設計を踏襲)。安全性は §2-9 が構造で保証する。

---

## 8. 撤退スイッチ(⭐ 2 本に分ける)

| スイッチ | 戻す先 | 判定点 |
|---|---|---|
| `?aoecover=0` | 拒否権が絶対だった 2026-09-07 以前(A 全体 = STEP1〜3) | `index.html` 1 箇所 |
| `?holdslots=0` | #57 着地時のテーブルと梯子(B = STEP4) | `index.html` 1 箇所 |

⛔ 2 本を 1 本にまとめない。A と B は独立に切り戻せること。

---

## 9. 受入条件 — `tools/verify_aoe_coverage.js`(新規・base **10141**)

⚠ ポートは #56=10081 / #57=10101-10109 / #58=10121 が使用中。**10141〜10149** を取る。
⚠ **10080 は Chrome が `ERR_UNSAFE_PORT` で開かない**(#56 の実測)。

### §0 装置(先に母集団を確かめる)⭐⭐⭐ これが無いと全 assert が空振りで永久緑

- `window.__aoeStats` が **1 呪文以上で `attempts > 0`** を計上していること
- 盤面に **敵が 2 体以上・味方が 1 名以上**居ること(巻き込みの差が出る条件)
- 僧侶が **`equippedSkills` に `hold-person` を持つ**こと

### §1 拒否権の撤廃(3 系統・**2 経路で突き合わせる**)

- `__aoeStats` の `partyRejected` が計上されても **`demoted` が増えない**(= 弾かれても撃てる)
- ⭐ 実挙動側: **味方が範囲に入る着弾点が実際に選ばれる**ことを 1 回以上観測する
- 直線・splash も同様に 1 本ずつ

### §2 巻き込み数(⭐ 目的そのもの)

- 同一盤面で **素 vs `?aoecover=0`** を比べ、**平均巻き込み数が増える**
- ⛔ 「拒否権を消した」ではなく **「巻き込み数が増えた」** で判定する

### §3 単体呪文の非波及(⭐ 起草中に見つけた最大の罠)

- `magic-missile` / `fire-bolt` の狙点が **最寄りの敵のまま**であること
- ⇒ `pickClosestEngagedEnemyFromAlly` が触られていないことを**挙動で**確かめる

### §4 スリープの狙点

- 敵が離れて 2 群に分かれた盤面で、**多い方の群れ**へ撃つ

### §5 hold-person(⭐ §2-9 の構造保証を機械化)

- **Lv3 の僧侶**の `equippedSkills` に `hold-person` が入る
- **Lv7 で 2 枚**(`maxSpellSlots["hold-person"] === 2`)
- 梯子: **非アンデッド戦では turn-undead より先に hold-person が出る**
- ⭐ **アンデッドのみの盤面では hold-person が `-1` で落ち、turn-undead が撃たれる**
- ⚠ `index.html` と `tavern.html` の `CLERIC_SLOTS_TABLE` が**一致**している(二重定義の突き合わせ)

### §6 恒等(非退行)

- §2-11 の **4 本必須** + 実装窓が STEP0 で足した分。⛔ 129 本全部は回さない
- ⚠ `verify_walk_block` / `driver_speech_v2` の**着手前からの赤 2 本は数えない**

### §7 負のコントロール(`--negative`)— **最低 9 本**

| # | 変異 | 赤くなるべき assert |
|---|---|---|
| M1 | 箱型の拒否権を残す | §1 / §2 |
| M2 | 狙点を最寄りのままにする | §2 |
| M3 | ⭐ `pickClosestEngagedEnemyFromAlly` を書き換える | **§3** |
| M4 | `hold-person` を Lv5 のままにする | §5 |
| M5 | 梯子を元の位置(turn-undead の後)に戻す | §5 |
| M6 | ⭐ `tavern.html` の鏡だけ直し忘れる | §5 の二重定義突き合わせ |
| M7 | splash の拒否権を残す | §1 |
| M8 | 直線の `blocked` を残す | §1 |
| M9 | 新しい候補に `aoeBoxReachable` を掛け忘れる | 射程外へ撃つ assert |

⭐⭐⭐ **変異は「注入できたか」でなく「測っている場所に現れるか」まで設計すること**(#54 の教訓)。
空振り(注入しても緑のまま)が 1 本でもあれば、その assert は**測れていない**。

---

## 10. 実機/実感の確認(ここが本当の受入)

1. **仲間ごと巻き込んで撃つ絵が「バグに見えない」か**(「(味方 2 名は無傷)」で伝わるか)
2. **巻き込みが増えた実感があるか**(数字ではなく体感)
3. ⭐⭐ **難易度が下がりすぎていないか** — シナリオ 3(沼地・素装備 70% で調整済)の勝率
4. **僧侶の金縛りが 1 ランに複数回出るか**
5. **アンデッド戦でターンアンデッドが出続けているか**(§2-9 の構造保証が実プレイでも効くか)
6. ⚠ **#57 の金の輪の実機体感 8 項目がまだ未消化**。金縛りの頻度が上がると
   **同時 4 体の描画負荷が現実問題になる** ⇒ 先に #57 の項目 3・5 を見てもらうのが望ましい

---

## 11. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>魔法使いが仲間ごと巻き込んで撃つようになった</b> — 味方は炎を浴びても無傷。敵が最も多く入る場所へ火球を落とす。"
py tools/add_changelog.py "<b>僧侶の金縛りが早く・多く使えるようになった</b> — ターンアンデッドと同じ Lv3 で覚え、1 回の潜行で複数回使える。"
```

⛔ `--no-verify` での迂回は禁止(そもそもハーネスがハードブロックする)。

---

## 12. やらないこと(別チケット送り)

- ⛔ **`AOE_WIDE_WINDOW` の屋内開放** — 却下理由(視線を見ていない)は §2-5 で崩れたが、
  **最多巻き込み狙点を入れると窓拡張の意味が薄れる**。撤退スイッチの互換も保てるので今回は触らない
- ⛔ **呪文スロットの休憩回復** — **全呪文職のバランスが一斉に動く**大物
- ⛔ **仲間 NPC の Lv 下限を主人公に追従**(B-δ)— 主人公 Lv7 で **Lv2 の仲間**が来る問題。
  ⭐ hold-person に限らずパーティ全体の体感に効くので、**独立した価値がある**
- ⛔ **敵側 AoE の狙点** — `enemyCastAoE` は**自軍を避ける判定を 1 つも持たない**(実測済)= 直す先が無い
- ⛔ **在庫の総数を写経した検出器 2 本の回収**(#57 §14-6 から継承)—
  `verify_walk_block (3d)` と `driver_speech_v2 (A1)` が #53 の `swampNovice` で同時に腐っている。
  ⛔ 数値を +1 して緑にしない。「総数を写経するのをやめる」形へ言い直すのが正しい直し方
- ⛔ **`saveAbility` の実装**(#57 §11 から継承)— `MAGE_SKILLS` の 5 呪文の flavor が現状**嘘**

---

## 13. `実装依頼書/README.md` へ足す行(✅ **2026-09-07 追加済** — #58 着地後)

```
| 59 | [2026-09-07_aoe-max-coverage-and-holdperson-slots.md](2026-09-07_aoe-max-coverage-and-holdperson-slots.md) | 起草(未承認) | 0% | 範囲呪文が「味方を避ける」のをやめ**最多巻き込み**で撃つ(拒否権は箱型/直線/splash の**3 系統**に生存・箱型の呼び口は**5 本**)。+ hold-person を **turn-undead と同一テーブル**へ(Lv3 解禁・Lv7 で 2 枚)+ 梯子を前へ。撤退 `?aoecover=0` / `?holdslots=0` |
```

✅ 追加済。⚠ 実際に足した行は上の文面のステータス部分を `**承認済**(2026-09-07)` へ差し替えたもの(承認が出ているため)。それ以外の文言は同一。

---

## 14. 実装結果 — 着地後の実測(実装窓が記入)

(着手後に記入)
