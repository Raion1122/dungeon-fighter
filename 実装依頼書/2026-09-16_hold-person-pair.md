# #69 ホールド・パーソンを 2 体へ(2 体目は 1 体目から 6 マス以内)

- **起草**: 2026-09-16(起草窓 `claude-c5` / セッション `6fb3c892`) / **ステータス**: **承認済**(2026-09-17 ユーザー承認)
- **着手**: ✅ **可能**(2026-09-18 に #68 が `78c7474` で着地。`実装依頼書/README.md` は起草窓へ返却済)。
  ⚠ **本書の行番号は `98419b0` 時点**で、#68 の着地により `index.html` は **39,464 → 39,539 行(+75)**。
  `allyHoldPerson` などは **識別子で引き直してから**着手する(⛔ 本書の `:NNNNN` をそのまま使わない)。
  ⚠ #68 着地後の golden の基準(実装窓の申し送り 2026-09-18): `verify_bolt_aim` 素 **23/23**(約 37 分)・`--negative` **10/10** /
  `verify_aoe_coverage` 28/28・10/10 / `verify_cone_cast` 19/19・41/41 / `driver_field_step7` 79/79 / `driver_action_priority` 素 92/92。
  ⚠⚠ **`driver_action_priority --negative` は #35 `97f350d` 以来 exit 1**(変異 N3 のアンカーが `tavern.html` に 2 箇所 = 起草窓が実測で確認)。
  **着手前から赤 = 本チケットのせいではない**(別チケット候補)。
- **基準コミット**: `98419b0`(#68 起草。`origin/main` = `157a9ca`、未 push 1 本)。起草時の作業ツリーは clean。
- **触るファイル**: `index.html` / `tavern.html`(flavor 1 行 + 撤退の読み 1 箇所 + changelog 1 行) /
  `tools/verify_hold_pair.js`(新規) / `実装依頼書/README.md` /
  (§2-9 で実際に赤くなったときだけ)`tools/verify_hold_person.js`
- ⛔ **着手は #68 の着地後**。#68(実装窓が dev-loop で実装中)が同じ `index.html` / `tavern.html` / `README.md` を触る。
  本書の行番号は**すべて `98419b0` 時点**で、#68 の着地で動く ⇒ **識別子で引き直してから**作業する。
  add は**ファイル単位**、commit は `git add <paths> && git commit -m ... -- <paths>` の 1 複合コマンドで。

---

## 1. 目的

僧侶のホールド・パーソンは、1 回の詠唱で敵を **1 体**しか金縛りにできない。スロットは Lv3〜6 で 1 枚・Lv7 以上で 2 枚と少なく
(`CLERIC_SLOTS_TABLE`)、1 回の潜行で見られるのは 1〜2 回。これを **1 回の詠唱で 2 体**に掛かるようにする。

**ユーザー決定(2026-09-16)**:

- **2 体目 = 1 体目から 6 マス以内の「効く相手」のうち、1 体目に最も近い敵**。5e SRD の上位スロット規則
  (追加の対象は互いに 30ft 以内)に合わせる。射程 12・視線・アンデッド/ボス/金縛り中/護衛対象の除外は 1 体目と共通。
  - 不採用: 「射程内なら距離を問わず、術者に近い順に 2 体」 — 戦線から離れた弓兵などにも掛かる。
- **効き目の測り方 = 合成盤面で「1 回で 2 体」を決定論で固め、実プレイは記録だけ(合否に使わない)**。クリア率は測らない。
  - 不採用: 「合成盤面だけ」 / 「クリア率のペア比較」(1 潜行 1〜2 発なので差がノイズに埋もれ、Chrome を数時間占有する)。
- 分割 = 候補ごとに 1 枚(#68 候補3「マッチング画面の見つけやすさ」は #70 見込みの別の依頼書)。

---

## 2. 着手前の実測(起草窓が HEAD `98419b0` の本番コードで確かめた事実)

⚠ **起草時は実走していない**。実装窓の #68 が母集団の直列走査で Chrome を数時間占有するため
(同時に走らせると色が偽になる = #67 の汚染 9 本)。実走が要る 1 点は STEP1 へ回した(§2-8)。

測り直すときの元:

    git show 98419b0:index.html  > /tmp/idx.html
    git show 98419b0:tavern.html > /tmp/tav.html

### 2-1. ⚠ 下調べの「2 体化は難易度を上げる」は逆 — パーティが強くなる方向

- `held` を立てる行は本番に **1 箇所だけ**(`allyHoldPerson` `:27740`)。`"held"` の出現は全 5 箇所
  = 輪の掃除 `:12348` / 眠りオーラの除外 `:16365` / 二重掛けの除外 `:27679` / **付与 `:27740`** / 敵ターンの言い分け `:33939`。
- `hold-person|holdPerson|HoldPerson` の出現 **29 行はすべて僧侶側**(スロット表 / 初期習得 / `executeSkillOn` の僧侶枝 /
  `CLERIC_SKILLS` / 対象選択 / `clericAI` / `apIsWastedCast`)。敵が使う経路は 0 件。
- ⇒ 2 体化は**難易度を下げる**。#63 の「4 人 PT が砦 n4 で全滅」には緩和側に効く。下がりすぎの確認は §9(実機)。

      grep -n '"held"' /tmp/idx.html
      grep -c 'hold-person\|holdPerson\|HoldPerson' /tmp/idx.html     # 29

### 2-2. 対象は 3 経路から 1 体だけ渡り、`allyHoldPerson` 1 関数に集まる

| 経路 | ファイル:行 | 1 体目に何が渡るか |
|---|---|---|
| 仲間の僧侶 AI | `clericAI` `:29876` の `tryHoldPerson` `:29908`〜 | `pickHoldPersonTarget(ally)` = 効く相手のうち**術者に最寄り** |
| #19 行動の優先度 | `apTryPreferred` `:31922` | `pickClosestEngagedEnemyFromAlly(unit)` = 交戦中で最寄り(**免疫/金縛り中も含む**) |
| 主人公が僧侶 | `pickLeaderAction` 後の `targetIdx = bestInRange` `:32254` → `executeLeaderSkill` `:32347` | 武器射程内で HP 最小(**免疫/金縛り中も含む**) |

- 3 経路とも `executeSkillOn` の 1 行 `:19850` → **`allyHoldPerson(actor, targetIdx)` `:27689`** に集まる。
  ⇒ 2 体目を足す場所は **`allyHoldPerson` の中 1 箇所**で、頭と仲間の両方に効く(#57 と同じ構造)。
- `allyHoldPerson` の流れ(`:27689`〜`:27752`): 死体なら選び直し → 射程/視線外なら前進して終わり →
  **スロット 1 枚 + `mp -= 7`** → `SKILL` 吹き出し → 詠唱演出 `dfPlayCast` → 免疫なら `NO EFFECT` を**術者の頭上**に出して終わり →
  命中ロール(`d20()` + `spellAtkBonus` vs `effectiveEnemyAc`)→ 命中で `stunned` / `held` / 輪 / `HELD!` を**敵の頭上**、
  外れで `RESIST` を**術者の頭上**。
- ⭐ #19 と主人公の経路は、ボスや金縛り中の敵を 1 体目に渡しうる(`apIsWastedCast` `:31880` は「効く相手が 1 体でも居るか」しか見ない。
  主人公側はホールド・パーソンの無駄打ち判定を持たない)。今はそのとき `NO EFFECT` で枠を失う。
  **2 体目がその近くの効く相手に掛かるので、この無駄打ちは本チケットで半分救われる**(直すのは §11 の別チケット)。

### 2-3. ⚠⚠⚠ 罠 1 — 結果の吹き出しは「ずらして並べる」仕組みを持たない

`showRollAtAlly` `:20526` / `showRollAtEnemy` `:20514` は、`.rollPop` の `left/top` を**単位の座標そのまま**に置くだけで、
同じ座標にある既存の吹き出しをずらさない(1.3 秒で自分を消すだけ)。

⇒ 今の「1 体ぶんの結果ブロック」をそのままループで 2 回回すと、**2 体ぶんの `RESIST` / `NO EFFECT` が術者の頭上の同じ座標に重なって読めない**。
⇒ **結果はすべて、その敵の頭上へ出す**(`HELD!` は既に `showRollAtEnemy`。`RESIST` と `NO EFFECT` も `showRollAtEnemy(idx, …)` へ寄せる)。
術者の頭上は詠唱時の `SKILL` 1 枚だけになる。
⛔ `showRollAt*` の本体に重ね置きの仕組みを作らない(出現は `showRollAtAlly(` 113 / `showRollAtEnemy(` 64 = 全部に効いてしまう)。

⭐ この罠は §8 の変異 **`popally`** として装置に内蔵する。

### 2-4. ⚠⚠⚠ 罠 2 — 既存 golden の変異アンカーは「ちょうど 1 箇所」を要求する

`tools/verify_hold_person.js` の `mutate()`(`:88`)は、アンカーが配信 `index.html` に**ちょうど 1 箇所**見つからないと、走る前に exit 3 で止まる。
本チケットで触る関数の周りに掛かっているもの:

| 変異 | アンカー(逐語・部分一致) | 本チケットでの扱い |
|---|---|---|
| `nohold` | `        applyStatus(t, "held", skill.holdTurns);` | ⛔ 2 体目のために**この行を書き写さない**。対象ループの中に 1 回だけ置く |
| `ringground` | `        spawnHoldRing(t);` | 同上 |
| `noimmune` | `      return !t \|\| isUndeadEnemy(t) \|\| !!(t.def && (t.def.isBoss \|\| t.def.boss));` | `holdPersonImmune` は 1 文字も触らない |
| `nocap` | `    const HOLD_RING_MAX = 4;` | 触らない(§2-6) |

- ⚠ 部分一致なので、ループで字下げが深くなっても「8 空白 + 本文」は含まれて 1 件のまま。**行を 2 本にした瞬間に 2 件 = exit 3** で、
  #57 の負のコントロールが**黙って 1 本も走らなくなる**。
- ⚠ ループ内の変数名は **`t` のまま**にする(`enemy` などへ改名するとアンカーが 0 件 = 同じく exit 3)。
- `tools/verify_aoe_coverage.js` の m4/m5/m6 は `CLERIC_SLOTS_TABLE` の行と `clericAI` の `tryHoldPerson` 2 行 ⇒ **触らない**。
- `tools/driver_action_priority.js:131` と `verify_hold_person` (5b) は `executeSkillOn` のシグネチャ行を逐語で掴む ⇒ **触らない**。

⭐ この罠は §8 の変異 **`dupline`** と装置 (0a) で機械化する。

### 2-5. 候補の述語は `pickHoldPersonTarget` 1 本に畳まれている

`pickHoldPersonTarget(ally)` `:27667` の除外 = 死亡 / 護衛対象 `isEscortObjective` / 免疫 `holdPersonImmune` / 金縛り中 `hasStatus(e,"held")` /
射程 `getRange("long").tiles`(= 12)超 / 視線なし。距離は `tileChebyshev`(ピクセル中心をタイルへ切り捨てた Chebyshev)。

- 呼び口 = `allyHoldPerson` `:27693` / `clericAI` `:29910` / `apIsWastedCast` `:31880` + ドライバ `verify_aoe_coverage.js:561`(**すべて 1 引数**)。
- ⇒ 2 体目も**同じ述語を通す**。写経を避けるため `pickHoldPersonTarget(ally, opts)` に**省略可能な第 2 引数**を足す(§5-2)。
  **引数なしの挙動は 1 ビットも変えない**。⛔ 6 条件を 2 体目用の別関数へ書き写さない(`:31878` のコメントが名指しで禁じている)。
- ⚠ 眠っている敵(`stunned > 0` かつ held でない)は 1 体目の候補に今も入る。2 体目でも同じにする(述語を分けない)。

### 2-6. 6 マスは「射程の半分」として導出する / 輪の上限 4 本は据え置く

- 1 マス = 5ft(`RANGE` `:20097` の注記: melee 1 = 5ft / spellBuff 6 = 30ft / long 12 = 60ft)。
- 5e SRD のホールド・パーソン: 射程 60ft、追加の対象は互いに 30ft 以内 = **射程のちょうど半分**。
  ⇒ `spread = Math.floor(getRange(skill.range).tiles / 2)` = 素 **6** / `?dndrange=0`(`RANGE_LEGACY_TABLE.long` = 6)で **3**。
  ⛔ 6 を直書きしない(#68 と同じ方針。`?dndrange=0` の腕で導出を証明する = §8 (5a))。
- `HOLD_RING_MAX = 4`(`:12293`)は**据え置き**。僧侶 1 人なら Lv7 以上の 2 枠 × 2 体 = 4 本で**ちょうど上限**。
  主人公と仲間の両方が僧侶のとき(酒場の 4 席は職が重複しないが、主人公の職は除外していない = `drawTodaysPatrons` `tavern.html:8208`)だけ、
  5 本目で**古い輪が 1 本消える**。
  ⚠ 既存 `verify_hold_person` (4c) が `ringMax === 4` を直接 assert している。上げるなら (4c) の言い直しと iOS 実機の負荷確認が要る = 別チケット。

### 2-7. 数値と鏡

| 対象 | 実測(`98419b0`) | → 本チケット |
|---|---|---|
| `CLERIC_SKILLS["hold-person"]` `:22079` | `target:"single"` / `holdTurns:4` / `range:"long"` / `mpCost:7` / `levelReq:3` | **1 つも動かさない**。`target` は `"single"` のまま(`AP_FRIENDLY_TARGETS` に入らない = #19 の射程判定を変えない) |
| flavor(`index.html` `:22083`) | `敵1体を 4ターン 金縛りにする (アンデッド/ボスには無効、MP 7)` | 2 体へ(§5-4) |
| flavor(`tavern.html` `CLERIC_SKILLS_UI` `:4419`) | `敵1体を 4ターン 金縛り (アンデッド/ボスには無効)` | 2 体へ(§5-4) |
| スロット表(`index.html:13062` / `tavern.html:5079`) | `[0,0,0,1,1,1,1,2,2,2,2]` | **触らない** |
| 1 回の詠唱の消費 | スロット 1 枚 + `mp -= 7` を 1 回 | **2 体でも 1 回**。⛔ 対象ごとに減らさない(`verify_aoe_coverage` (5c) が `used['hold-person'] === 1` で見ている) |

- flavor を文字で縛る tools は **0 本**(`git grep '敵1体を' -- tools` = 0 件)。
- 他の配信ファイル(`town.html` / `world.html` / `title.html` / `js/*.js`)にホールド・パーソンの文言は **0 件**。
- ボールト `spells.md` にもホールド・パーソンの記載は **0 件**(Dropbox 側を grep)。
- ⭐ 年代記(#37)は `showRollAtAlly` の `SKILL` 吹き出しから技名を **Set** へ拾う(`usedSkillNames` `:15101`)ので、
  吹き出しの枚数が変わっても記録は変わらない。

### 2-8. 実プレイで「2 体目が居る割合」と「1 潜行あたりの詠唱回数」は未測定 → STEP1 で先に測る

- 並走のため起草時に実走していない。⚠ #59 の「実質 1 ラン 1 発」は**機構を読んだ結論で、実走の値ではない**。
- ⇒ STEP1 の最後に、素の実プレイで `window.allyHoldPerson` を包むプローブ(本番 0 バイト)を回し、
  **1 走行あたりの詠唱回数**と**1 体目から 6 マス以内に効く相手が居た割合**を先に採る(§4-5)。
  §8 §2 の走行数 N はここから決める(素の腕で詠唱が合計 10 回以上になる N)。

### 2-9. 既存の検査が掴んでいるもの(⚠ 赤くなる本数は予想であって実測ではない)

素で走らせ、**実際に赤くなった assert の ID を控えてから**言い直す(#60 の教訓: 語で数えた「5 本赤」が実際は 2 本)。

- `tools/verify_hold_person.js`(#57・記録値 素 31/31 / `--negative` 8/8):
  - ⚠ **(4a2)** `immRings.regLen === 1` — 免疫の盤面で「輪がちょうど 1 本」。盤面の生者オークの 6 マス以内に
    **部屋に元から居る敵**が居ると、2 体目で輪が 2 本になり赤くなりうる(このドライバは部屋の敵を退けていない = `installProbe` の `cast()`)。
    ⇒ 赤ければ**盤面の外の敵を退ける装置**を足して言い直す。⛔ `=== 1` を `>= 1` へ緩めない。
  - (2a)(2b)(2c)(3a)(3b)(3c)(4a)(4c)(0e) — 1 体目の結果か上限側しか見ない ⇒ 緑のままの見込み。
- `tools/verify_aoe_coverage.js`(#59・記録値 素 28/28 / `--negative` 10/10): (5c)(5d) は**スロットの減り**で梯子を見る ⇒ 1 回 1 枚を守れば緑。
- `tools/driver_action_priority.js`(記録値 92/92): `executeSkillOn` のシグネチャ行 ⇒ 触らなければ緑。
- 実プレイ系(僧侶が居る編成で自動進行する本)は、金縛りの数が増えるぶん**戦闘の経過が変わる**。STEP1 の基準と §8 末尾の 2 経路で見る。

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
書けるプレイヤー向けの要約は実在する(§10 = 呪文の効果そのものが変わる)。

### 2-11. 行末 / 番号 / ポート

- `index.html` 39,464 行・`tavern.html` 10,586 行とも **純 CRLF**(LF 単独 0。`py` のバイト数えで実測)。⛔ 改行を `grep` で測らない。
- 番号の予約: `git grep '#69\|#70' -- 実装依頼書 tools` = **0 件**。
- ポート: tools の base は `10281`(#67)まで。#68 が **10301〜**、起草窓のプローブは 10391 帯。
  ⇒ 本チケットの新規ドライバは **base 10331**(変異 10332〜10344)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 撤退スイッチ 1 本(`HOLD_SLOTS_ON` の直後) / `pickHoldPersonTarget` に省略可能な第 2 引数 / `allyHoldPerson` の後半を対象 1〜2 体のループへ / flavor 1 行と撤退時の旧文 / コメント |
| `tavern.html` | `CLERIC_SKILLS_UI` の flavor 1 行(撤退をページ内で読む) / changelog 1 行 |
| `tools/verify_hold_pair.js` | **新規**。base **10331** |
| `tools/verify_hold_person.js` | §2-9 で**実際に赤くなったときだけ**、装置を足して言い直す |
| `実装依頼書/README.md` | #69 行の進行度 |

⛔ `holdPersonImmune` / `HOLD_RING_MAX` / `CLERIC_SLOTS_TABLE`(両ファイル) / `clericAI` の梯子 / `apIsWastedCast` /
`apTryPreferred` / `pickLeaderAction` / `executeSkillOn` は **1 文字も触らない**。
⛔ `showRollAtEnemy` / `showRollAtAlly` の本体は触らない(§2-3)。

---

## 4. STEP1 — 着手前の基準取り(本番も tools も 1 バイトも触らない)

1. `git log --oneline -1` と `git status` を記録。**#68 が着地していること**(README の #68 行が完了)を確かめる。
2. 母集団は #68 §4 と同じ **3 段の union**:
   - 触る語 — `grep -ln "hold-person\|holdPerson\|allyHoldPerson\|pickHoldPersonTarget\|HOLD_RING\|spawnHoldRing\|ホールド・パーソン" tools/*.js`
     (起草時 = `verify_hold_person` / `verify_aoe_coverage` の 2 本)
   - 変更したファイルを読む本 — `index.html` / `tavern.html` を読む本
   - 測定器のソースを読む測定器 — `grep -ln "'tools/driver_\|'tools/verify_" tools/*.js`
3. ⭐ **#68 の最終項目(非退行の再走)の結果が、いまの HEAD と同じコミットで採られていれば**、その凍結 TSV を基準に流用してよい
   (数時間の直列走査を 1 回省ける)。⚠ HEAD が 1 本でも動いていたら採り直す。
4. 採り直すときは #68 §4 の 3〜5 と同じ(直列 / `timeout` で包まない / 結果 TSV は凍結してから次へ / 非緑の本は判定行の中身で 3 分類)。
5. §2-8 の実プレイプローブ(本番 0 バイト。`window.allyHoldPerson` を包む)を素で回し、
   **1 走行あたりの詠唱回数**と**6 マス以内に 2 体目の候補が居た詠唱の割合**を §12-0 へ書く。
   ⚠ 詠唱が 0 回なら、舞台と編成(僧侶の Lv / 敵がアンデッドだけでないか)を §12-0 に書き、§8 §2 の仕込みを先に決める。

---

## 5. STEP2 — 2 体目を選んで掛ける

### 5-1. 撤退スイッチ(`HOLD_SLOTS_ON` の直後)

```js
    /* ★[#69] 撤退スイッチ ?holdpair=0 — ホールド・パーソンを 1 体だけに戻す (2026-09-16 以前)。
       ⚠ 判定はここ 1 箇所。tavern.html の flavor は同じクエリをページ内で読む (遷移はまたがない)。
       ⚠ 吹き出しを敵の頭上へ出す変更 (依頼書 §2-3) は撤退しても戻さない
         (1 体なら重ならないので害が無い。分岐を増やさない)。 */
    const HOLD_PAIR_ON = (() => {
      try { return new URLSearchParams(window.location.search).get("holdpair") !== "0"; }
      catch (e) { return true; }
    })();
```

### 5-2. `pickHoldPersonTarget(ally, opts)` — 2 体目も同じ述語を通す

```js
    /* 射程内・視線ありで、まだ金縛りでない「効く相手」のうち最寄りを返す。居なければ -1。
       ★[#69] opts を渡すと 2 体目の選び方になる:
         opts.exclude … 除外する添字 (1 体目)
         opts.near    … 近さの基準にする敵 (1 体目)。術者ではなく**この敵に**最も近い候補を返す
         opts.within  … near からの上限マス (Chebyshev)。5e: 追加の対象は互いに 30ft 以内
       ⛔ opts なしの挙動は #57 と 1 ビットも変えない (clericAI / apIsWastedCast / verify_aoe_coverage が 1 引数で呼ぶ)。
       ⛔ 候補の 6 条件 (死亡 / 護衛 / 免疫 / held / 射程 / 視線) を 2 体目用に書き写さない。 */
    function pickHoldPersonTarget(ally, opts) {
      // … 既存の除外 5 条件はそのまま …
      //   if (opts && i === opts.exclude) continue;
      //   射程と視線は **術者から** 測る (既存のまま)
      //   if (opts && opts.near) {
      //     const n = opts.near;
      //     const nd = tileChebyshev(n.x + n.def.displaySize / 2, n.y + n.def.displaySize / 2, ecx, ecy);
      //     if (nd > opts.within) continue;
      //     d = nd;   // 近さの基準を 1 体目へ替える (⚠ 既存の const d は let へ)
      //   }
    }
```

- 同距離なら添字の小さい方(既存の `<` 比較のまま = 決定論)。

### 5-3. `allyHoldPerson` — 対象 1〜2 体のループ

**変えない**: 死体の選び直し / 射程・視線外の前進 / スロット 1 枚と `mp` の消費(1 回) / 向き / `SKILL` 吹き出し / `dfPlayCast`(1 回)。

**変える**: `dfPlayCast` の後ろを、対象の列を回すループにする。

```js
      /* ★[#69] 対象を 1〜2 体に広げる。2 体目は 1 体目から射程の半分 (素 6 マス = 30ft) 以内の
         「効く相手」のうち 1 体目に最も近い敵。居なければ 1 体だけ (枠は上で 1 回ぶんしか減らしていない)。
         ⭐ 1 体目が免疫 (NO EFFECT) でも 2 体目は選ぶ —— #19 と主人公の経路がボスを渡した無駄打ちを半分救う (依頼書 §2-2)。
         ⚠⚠ 結果の吹き出しは **その敵の頭上**。術者の頭上に出すと 2 枚が同じ座標に重なる (§2-3)。
         ⛔⛔ applyStatus(t, "held", …) と spawnHoldRing(t) の行は **1 本ずつのまま**。2 体目のために書き写すと
           verify_hold_person の変異アンカーが 2 件になり、#57 の負のコントロールが exit 3 で黙って死ぬ (§2-4)。 */
      const targets = [enemyIdx];
      if (HOLD_PAIR_ON) {
        const j = pickHoldPersonTarget(ally, { exclude: enemyIdx, near: t, within: Math.floor(rangeTiles / 2) });
        if (j >= 0) targets.push(j);
      }
      const atkBonus = spellAtkBonus(ally);
      for (const idx of targets) {
        const t = enemies[idx];            // ⚠ 名前は t のまま (アンカー)
        // 免疫 → showRollAtEnemy(idx, NO EFFECT …) / updateInfo 1 行 / continue
        // 命中ロールは **対象ごとに d20() を 1 回** (⛔ 1 回引いて 2 体で共有しない)
        // 命中 → 既存の 4 行 (stunned / applyStatus / spawnHoldRing / HELD!) をそのまま
        // 外れ → showRollAtEnemy(idx, RESIST d20(…)+… vs AC …) / updateInfo 1 行
      }
      await sleepMs(800);
```

- 眠り・免疫・抵抗の判定そのもの(`holdPersonImmune` / 命中式 / `holdTurns`)は 1 文字も変えない。

### 5-4. flavor(2 ファイル)

- `index.html` `CLERIC_SKILLS["hold-person"].flavor` → 例 `敵2体まで 4ターン 金縛りにする (2体目は1体目の近く。アンデッド/ボスには無効、MP 7)`
  - 撤退時は `if (!HOLD_PAIR_ON) CLERIC_SKILLS["hold-person"].flavor = "<旧文を逐語で>";`(`:22092` の `levelReq` の撤退行の隣)。
- `tavern.html` `CLERIC_SKILLS_UI` の hold-person 行 → 例 `敵2体まで 4ターン 金縛り (2体目は1体目の近く。アンデッド/ボスには無効)`
  - `isHoldPersonOnTV`(`:5151`)と同じ形で `?holdpair=0` をページ内で読み、旧文へ戻す。
- ⚠ 「6 マス」を文言に入れるかは実装窓の判断でよい(入れるなら `?dndrange=0` では 3 マスになる点をコメントに残す)。

---

## 6. STEP3 — 既存 golden の言い直し(必要なものだけ)

- §2-9 の見立ては予想。**素で走らせて実際に赤くなった assert の ID を控えてから**、分類 1(本チケットが構造的に変えた型)か確かめて直す。
- `verify_hold_person` (4a2) が赤なら、`cast()` の前に**部屋に元から居る敵を遠くへ退ける**装置を足す(§8 の計測機構と同じ作法)。
- ⛔ 閾値を緩めて緑にしない。⛔ `?holdpair=0` を付けて緑に見せない。⛔ 変異アンカーを書き換えて通さない(§2-4 の行を 1 本のまま守るのが正)。

---

## 7. 撤退スイッチ

- **`?holdpair=0`** — 2 体目を選ばない(1 体だけ) + flavor を旧文へ。
- 判定位置 = `index.html` の `HOLD_PAIR_ON` 1 箇所 / `tavern.html` はページ内 1 箇所。**ページ遷移はまたがない**(各ページが独立に読む = `?holdperson=0` と同じ作法)。
- ⚠ 吹き出しの位置(§2-3)は撤退しても戻さない(§5-1 のコメント)。
- `?holdperson=0`(呪文ごと消す) / `?holdslots=0`(#59 の配分) / `?dndrange=0` とは独立。

---

## 8. 受入条件 — `tools/verify_hold_pair.js`(新規・base 10331)

方針: **合成盤面で「1 回で 2 体」を決定論で固める**。実プレイは**記録だけ**で、合否に効くのは記録が空でないこと (0e) だけ(ユーザー決定)。
⭐ 非退行は **2 経路**(assert id の指紋 + 判定行の多重集合)で突き合わせる(#67 項目6)。

### ⚠ 計測機構

- 合成盤面は `verify_hold_person.js` の `installProbe`(`window.__hpProbe`)の作法を流用する:
  `gameOver = true` / `sleepMs` を `setTimeout(0)` で即解決 / `dfPlayCast` を「数えるだけ」のスタブ /
  敵は `createEnemy` → `enemies.push` → `createEnemyDom` の 3 点セット / 枠は `initAllySpellSlots` で開ける(⛔ `spellSlots` を手で書かない)。
- ⭐ **盤面を作る前に、部屋に元から居る敵と他の味方を遠くへ退ける**(`x = y = -999999`。⛔ 敵の `alive` を倒さない = 撃破処理が走る)。
  退けないと 2 体目が部屋の敵に掛かって決定論が崩れる(§2-9 の (4a2) と同じ穴)。
- ⭐ **命中ロールは `window.d20` を差し替えて固定する**。トップレベルの `function d20` `:20400` は `window` のプロパティなので、
  本番の呼び出しがラッパーを通る。値は列で渡す(例 `[20, 1]` = 1 体目命中・2 体目抵抗)。**呼んだ直後に必ず元へ戻す**。
  ⛔ `tries` で撃ち直さない(2 体を同時に見るので、撃ち直すと 1 体目の結果が上書きされる)。
- 盤面の横一列は「連続した床が **13 マス以上**ある行」を探して使う(⛔ 絶対タイル座標を直書きしない)。僧侶は列の左端 `tx0`、敵は `tx0 + k`。
- **2 経路目**: 盤面の配置はドライバが決めるので、「金縛りになるべき敵の集合」は**ドライバが自分の置いた座標と型から独立に**計算する。
  ⛔ `pickHoldPersonTarget` の戻り値を期待値にしない。
- 吹き出しは `document.body` の `MutationObserver` で、詠唱中に足された `.rollPop` の `label` 文字と `left/top` を採る
  (1.3 秒で消えるので後から DOM を読まない)。
- 実プレイは `verify_cone_cast.js` の仕込み(遷移**前**に編成 / XP / `sessionStorage` の舞台を書く `:1166`〜`:1202`、`?autoplay=30&diag=1`)を流用し、
  `window.allyHoldPerson` を包んで詠唱ごとに {1 体目 / 選ばれた対象数 / 新たに held になった数 / 1 体目から spread 以内に効く相手が居たか(ドライバの独立計算) / 枠が減ったか} を TSV へ。
- 変異は**配信スナップショットをメモリ上で差し替え**、変異ごとに別ポート(10332〜)。`index.html` / `tavern.html` は CRLF。
  注入点が**ちょうど 1 箇所**でなければ走らせる前に exit 3。アンカーは**実装後の逐語**で決める。
- 後始末は**このドライバが起動したもの**(内蔵サーバとこのブラウザ)だけを落とす。

### §0 装置

- **(0a)** 配信 `index.html` に `holdpair` の判定が**ちょうど 1 箇所**、かつ
  `applyStatus(t, "held", skill.holdTurns);` と `spawnHoldRing(t);` が**それぞれちょうど 1 箇所**(⭐ §2-4 の罠)。
- **(0b)** 合成盤面で僧侶が 1 人・`hold-person` の枠 ≥ 1、部屋に元から居る敵は**全員が術者から 13 マス以上**離れている。
- **(0c)** `d20` の差し替えが効いている: 敵 1 体の盤面で `[20]` なら held、`[1]` なら held にならない
  (⭐ これが無いと §1 の抵抗系が空振りで永久緑)。
- **(0d)** 各盤面の詠唱で `dfPlayCast` の呼び出しが**ちょうど 1 回**増える(詠唱経路を本当に通った / 2 体でも演出は 1 回)。
- **(0e)** 実プレイ(素の腕)で `allyHoldPerson` による**枠の減った詠唱が合計 1 回以上**、かつ僧侶の `equippedSkills` に `hold-person`
  (⭐ 記録が空のまま「記録だけ」で緑にしない)。

### §1 合成盤面(素・決定論)

- **(1a)** オーク A を `+2`、オーク B を `+4`、`d20 = [20, 20]` → **A と B がともに** `held` かつ `stunned === 4`、輪 2 本。
  **`hold-person` の枠はちょうど 1 減り、`mp` はちょうど 7 減る**(2 体でも 1 回)。
- **(1b)** 同じ盤面で `d20 = [20, 1]` → A は held・**B は held でない**(⭐ ロールが対象ごとに独立)。
- **(1c)** 上限: A `+2`・B `+8`(A から 6)→ B は held。A `+2`・B `+9`(A から 7・術者から 9 = 射程内)→ **B は held でない**。
- **(1d)** 免疫の除外: A `+2`、スケルトン `+3`、ゴブリンキング(`isBoss`)`+4`、オーク C `+5` → 2 体目は **C**。スケルトンとボスの `stunned` は 0 のまま。
- **(1e)** ⭐ 近さの基準は術者でなく 1 体目: A `+6`、B `+3`(A から 3・術者から 3)、C `+8`(A から 2・術者から 8)→ 2 体目は **C**。
- **(1e2)** 金縛り中の除外: A `+2`、B `+3`(事前に `applyStatus(B,"held",4)` + `stunned = 4`)、C `+5` → 2 体目は **C**、B の held の残りは詠唱の前後で同じ。
- **(1f)** 効く相手が 1 体だけ: A だけ → A が held、枠はちょうど 1 減る、輪 1 本(⭐ 1 体でも撃つ)。
- **(1g)** ⭐ 吹き出し: `d20 = [1, 1]` の 2 体盤面で、`RESIST` の `.rollPop` が **2 枚**、その `left` が**A と B それぞれの画面中心 x に ±2px で一致**し、
  **術者の中心 x の吹き出しは `SKILL` の 1 枚だけ**(§2-3 の罠)。
- **(1h)** 1 体目が免疫: ゴブリンキングを `+2` に置いて 1 体目に渡し(#19 / 主人公の経路の再現)、オーク C を `+4` に置く →
  ボスは `NO EFFECT`(`stunned` 0)、**C は held**。`NO EFFECT` の吹き出しはボスの頭上。
- **(1i)** 2 経路: (1a)〜(1h) の全盤面で、held になった敵の集合 == **ドライバが配置と型から独立に計算した集合**。

### §2 実プレイ(記録だけ・合否に使わない)

- **(2a)** 素と撤退の各腕で N 走行(N は STEP1 §4-5 の実測から決める)。詠唱ごとの記録を TSV に残し、総括として
  **詠唱数 / 2 体に掛けた詠唱の割合 / 1 詠唱あたりの平均 held 体数 / spread 以内に候補が居た割合**を §12 に書く。
- **(2b)** 素の腕で「ドライバの独立計算では spread 以内に候補が居たのに、対象が 1 体だった」詠唱の**件数**を記録する。
  0 でなければ理由(1 体目の選び直し・射程外の前進・詠唱中の死亡など)を §12 に書く。⛔ 件数で合否を決めない。

### §3 文言

- **(3a)** 素: `index.html` の `CLERIC_SKILLS["hold-person"].flavor` と `tavern.html` の `CLERIC_SKILLS_UI` の flavor が
  **どちらも**「2体」を含み「敵1体を」を含まない。`?holdpair=0`: **どちらも**「敵1体を」を含む(2 ファイル × 2 腕)。

### §4 撤退

- **(4a)** `?holdpair=0` で (1a) の盤面が「A だけ held・B は held でない」、枠は同じく**ちょうど 1** 減る。
  ⭐ 素の腕の (1a) と**同じ assert 本体**を両腕へ当てて崩れることで見る(撤退の腕だけ見る assert は、実装が壊れていても緑になる)。

### §5 導出(恒等ではなく絶対量で)

- **(5a)** `?dndrange=0`(spread = 3)で A `+2`・B `+5`(A から 3)→ B は held、A `+2`・B `+6`(A から 4)→ **B は held でない**。
  同じ `+6` の盤面が**素では held**(spread 6)。⭐ spread が射程から導出されていることの証明(直書きの 6 なら赤)。

### ⛔ 測らないこと

- 実プレイの率(2 体に掛けた割合・平均体数・候補が居た割合)の**閾値** — 記録だけ(ユーザー決定)。
- クリア率・被ダメージ・難易度(§9 の実機体感へ)。
- 輪と吹き出しの見た目・読みやすさ(§9)。
- `clericAI` の梯子の位置と発射率(#57 / #59 が「実機体感で動かす」と外したもの。⚠ 既存 golden の空白地帯のまま)。
- 眠っている敵を 2 体目に選ぶか(述語を分けない = §2-5。選んでも誤りではない)。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `pairoff` | 2 体目を選ばない(`HOLD_PAIR_ON` の分岐を偽にする) | (1a) (1h) (1i) |
| `nospread` | `within` の判定を外す | (1c) |
| **`nearcaster`** | 2 体目の近さの基準を術者へ戻す(`d = nd` を落とす) | (1e) |
| `immunepair` | 2 体目の選択でだけ免疫を除外しない | (1d) |
| `heldpair` | 2 体目の選択でだけ金縛り中を除外しない | (1e2) |
| `slot2` | 対象ごとに枠を減らす | (1a) (1f) |
| `oneroll` | 命中ロールを 1 回だけ引いて 2 体で共有する | (1b) |
| **`popally`** | ⭐ 結果(`RESIST` / `NO EFFECT`)を術者の頭上へ出す(§2-3 の罠) | (1g) (1h) |
| **`dupline`** | ⭐ 2 体目のために `applyStatus(t, "held", skill.holdTurns);` の行を別に 1 本足す(§2-4 の罠) | (0a) |
| `hardcode6` | spread を `6` と直書きする | (5a) |
| `switchdead` | `HOLD_PAIR_ON` を常に真にする | (4a) |
| `flavor1` | `tavern.html` の flavor だけ「敵1体を」のまま | (3a) |

- ⭐ 各変異の走行に (0b)(0c) を入れ、**変異ページが起動したこと**を毎回ログに出す(構文破壊で全部赤 = 偽の成功を見分ける)。
- ⚠ 担当表は机上で確定させない。`--only <tag>` で 1 本ずつ走らせ、**実際に赤くなった節を見てから**書く(#57 の作法)。
- ⚠ `dupline` は既存 `verify_hold_person` を exit 3 にするのが本来の害。新ドライバでは (0a) がそれを代理で捕まえる。

### 既存 golden の非退行(実装後に必ず走らせる)

- STEP1 の母集団(§4)を**全数**、着手前と同じ順で直列に再走し、2 経路で突き合わせて **緑→赤 0** を示す。新規 `verify_hold_pair` も足す。
- 名指しで必ず見る本(⚠ 基準値は記録値。走って違ったら**期待値を書き換える前に理由を突き止める**):
  - `tools/verify_bolt_aim.js` — 素 23/23 / `--negative` 10/10(#68・2026-09-18 着地。⚠ 素だけで約 37 分)
  - `tools/verify_hold_person.js` — 素 31/31 / `--negative` 8/8(#57・2026-09-07)。⚠ (4a2) は §2-9
  - `tools/verify_aoe_coverage.js` — 素 28/28 / `--negative` 10/10(#59・2026-09-07)。(5c)(5d)
  - `tools/driver_action_priority.js` — 92/92(#34)
  - `tools/verify_cone_cast.js`(#50・実プレイの仕込みを流用する元)

---

## 9. 実機/実感の確認(ここが本当の受入)

- 金縛りが 2 体に掛かったと一目で分かるか(金の輪 2 本・`HELD!` がそれぞれの敵の頭上)。
- `RESIST` / `NO EFFECT` が**敵の頭上**で読めるか(術者の頭上に重なっていないか)。
- 難易度が下がりすぎていないか(特に 4 人 PT の砦・沼地)。
- 主人公と仲間が両方僧侶のとき、5 本目で古い輪が消えて「掛かっているのに光らない」敵が目立たないか(§2-6)。
- iOS で輪 4 本同時の描画負荷(#57 の実機宿題と共通)。
- ⚠ ローカルは http 起動が必須(`file://` では音が出ない)。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>ホールド・パーソンが 2 体に掛かるように</b> — 僧侶の金縛りが、狙った敵のすぐ近くにいるもう 1 体にも掛かる。抵抗は 1 体ずつ判定し、結果はそれぞれの敵の頭上に出る。"

---

## 11. やらないこと

- ⛔ **#19 行動の優先度と主人公の経路が、効かない相手(ボス・アンデッド・金縛り中)を 1 体目に渡して `NO EFFECT` で枠を失う既存挙動**の修正(§2-2)。別チケット候補。
- ⛔ 輪の上限 `HOLD_RING_MAX` の引き上げ(§2-6)。
- ⛔ 吹き出しの重ね置きの仕組み(`showRollAt*` の本体)。
- ⛔ スロット表・解禁 Lv・`holdTurns`・射程・MP の変更。
- ⛔ Lv で対象数を増やす(5e のアップキャスト式に 3 体以上)。
- ⛔ 眠っている敵を候補から外す(述語を分けない。§2-5)。
- ⛔ セーヴ機構(`saveAbility`)の新設(#57 §11 の別チケット)。
- ⛔ ボールト `spells.md` への追記(別 PC の作業。ホールド・パーソンは未記載 = 申し送りだけ)。
- ⛔ 候補3(マッチング画面で使わない魔法を見つけやすく)は**別の依頼書**(#70 見込み)。
- ✅ **`実装依頼書/README.md` への行追加**は承認時(2026-09-17)に起草窓が実装窓へ通告してから足した。足した行:

      | 69 | [2026-09-16_hold-person-pair.md](2026-09-16_hold-person-pair.md) | **承認済**(2026-09-17)・⏸ #68 着地待ち | 0% | ホールド・パーソンを**2 体へ**(2 体目は 1 体目から 6 マス以内 = 5e の 30ft・射程の半分から導出)。⚠ 下調べの「難易度を上げる」は逆(`held` を付けるのは僧侶だけ)。⚠⚠ 吹き出しはずらして並べる仕組みが無い ⇒ 結果は各敵の頭上へ(変異 `popally`)。⚠⚠ #57 の変異アンカー `applyStatus(t, "held"…)` / `spawnHoldRing(t)` はちょうど 1 箇所 ⇒ 行を写経せずループで(変異 `dupline`)。枠は 1 回 1 枚のまま。⛔ #68 着地後に着手 |

---

## 12. 実装結果

### 12-0. 着手前の基準(項目1 / 2026-09-18・実装窓)

⛔ この項目では `index.html` / `tavern.html` / `tools/` を **1 バイトも変更していない**(測っただけ)。

#### (a) 状態

    git log --oneline -1   →  9174c39 #70 起草 — 使わない魔法・特技の見分け + 僧侶の除外 (依頼書 + 台帳)
    git status --porcelain →  (空 = clean)
    git log --oneline origin/main..HEAD → 9174c39 の 1 本だけ (origin/main = 3f87f65)

- `実装依頼書/README.md` の **#68 行 = ✅ 完了**(`a23e002`+`e2927c3`+`e42b7ea`+`d9c8cbf`+`78c7474`)を確認。⇒ **着手可**。
- 隣窓(起草窓)の `9174c39` が触ったのは `2026-09-18_spell-off-visibility.md`(新規)と `README.md`(+1 行)だけ =
  本チケットの `index.html` / `tavern.html` / 本書とは衝突しない。

#### (b) 母集団 — 3 段 union = **134 本**(⭐ 段1・段3・名指しは union を 1 本も増やさなかった)

`tools/*.js` は **146 本** = 走れるドライバ(接頭辞 `driver_` / `verify_` / `probe_` / `sweep_`)**141 本** + ヘルパー 5 本
(`_doors_fixture.js` / `_golden.js` / `_pptr_profile.js` / `auto_debug_run.js` / `sim_plaza_entry.js`)。ヘルパーは #67/#68 と同じく母集団から外した。

| 段 | 引き方 | 本数 |
|---|---|---|
| **段1** | `grep -ln "hold-person\|holdPerson\|allyHoldPerson\|pickHoldPersonTarget\|HOLD_RING\|spawnHoldRing\|ホールド・パーソン" tools/*.js` | **2**(コメントを落としても同じ 2 本)|
| **段2** | `index.html` / `tavern.html` を**コードで**読む本(コメントを落としてから判定) | **134**(index 128 / tavern 46)|
| (参考) | 段2 を素の grep で引くと | 136(コメントだけで触れる `verify_world_heromark` / `verify_world_steps` の 2 本が混ざる)|
| **段3** | `grep -ln "'tools/driver_\|'tools/verify_" tools/*.js` | **2** |
| 名指し | §8「既存 golden の非退行」の 5 本 | 5(全部 段2 の部分集合)|
| | **union** | **134** |
| | 母集団外(段2 に入らないドライバ) | **7** |

- **段1 の 2 本** = `verify_aoe_coverage.js` / `verify_hold_person.js`(⭐ §4-2 の起草時の予想と一致)。
- **段3 の 2 本** = `verify_enemy_name_label.js` / `verify_eol_doorfix.js`。
- **名指し 5 本** = `verify_bolt_aim` / `verify_hold_person` / `verify_aoe_coverage` / `driver_action_priority` / `verify_cone_cast`。
- **母集団外 7 本** = `driver_bgm_title` / `driver_doors_p1` / `probe_town_mask` / `verify_codex_map_skill` /
  `verify_road_events` / `verify_world_heromark` / `verify_world_steps`(#68 と同じ 7 本)。
- ⭐ **#68 の union 133 本との差は `verify_bolt_aim.js` の 1 本だけ**(#68 項目4 が新設した本)。本数は台帳(`tools/` の実体)から導出しており、⛔ 定数で焼いていない。

**確定リスト(134 本・アルファベット順。`.js` は省略)**:

    driver_action_priority / driver_bgm_mine / driver_bgm_town / driver_cast_circle / driver_choice_logslot / driver_cleanup_phase1
    driver_cleric_sprites / driver_depart_menu_clean / driver_dev_gate / driver_dev_gate2 / driver_diag_watchdog / driver_doors_p2
    driver_doors_p5 / driver_doors_p6 / driver_doors_p8 / driver_elf_sprites / driver_encounter_mopup / driver_equip_compact_ios
    driver_field_scale / driver_field_step0 / driver_field_step05_hud / driver_field_step1 / driver_field_step1_geo / driver_field_step2
    driver_field_step3 / driver_field_step5 / driver_field_step6 / driver_field_step6_png / driver_field_step7 / driver_field_verge_gap
    driver_field_wagon / driver_fix4_help_bonus / driver_graph_arrows / driver_graph_kinds / driver_graph_p6 / driver_graph_p7
    driver_graph_reentry / driver_graph_run / driver_graph_sce1 / driver_grid_p3b / driver_grid_p4 / driver_grid_p5
    driver_grid_p7 / driver_grid_p8 / driver_grid_p9 / driver_grid_s2 / driver_heromark_signplate / driver_leader_ai
    driver_log_compact / driver_mapdef_step1 / driver_mapdef_step2 / driver_mapdef_step3 / driver_mapeditor / driver_mapeditor_painting
    driver_mapeditor_pointer / driver_mapeditor_props / driver_mapeditor_railkit / driver_mapeditor_texture / driver_mapeditor_waterkit / driver_mine_wall
    driver_monsters_chimera / driver_monsters_griffon / driver_monsters_hobgoblin / driver_monsters_kobold / driver_monsters_orc / driver_monsters_umberhulk
    driver_paint_blocked / driver_paint_grid / driver_party_view_reopen / driver_rogue_sprites / driver_room_search_roll / driver_sce1_events
    driver_scroll_autoskip / driver_skillcheck_roster / driver_spawn_not_on_gate / driver_speech_boss / driver_speech_engine / driver_speech_hooks
    driver_speech_v2 / driver_trap_disarm / driver_trap_weaponize / driver_wall_face / driver_wall_props / driver_wallbox
    driver_warrior_variants_sprite / probe_bandit_map / probe_boss_latch / probe_n4_stall / probe_p9_tour / probe_paint_overlay
    probe_party_size / probe_rest_premature / probe_s2_clear / probe_s2_fold / probe_s4_relocate / probe_swamp_map
    sweep_recruit_balance / verify_ability_scores / verify_aoe_coverage / verify_bolt_aim / verify_cone_cast / verify_darkvision
    verify_dragon_fold / verify_enemy_name_label / verify_eol_doorfix / verify_fort_fold / verify_hold_person / verify_mercenary_roster
    verify_npc_crowd / verify_party_four / verify_party_match_setup / verify_party_promises / verify_player_sheet / verify_pm_drawer_fit
    verify_prep_retire / verify_quest_visibility / verify_quest_walk / verify_recruit_size / verify_recruit_talk / verify_road_ambush
    verify_road_boon / verify_roll_target / verify_run_chronicle / verify_save_slots / verify_swamp_fold / verify_swamp_lair
    verify_swamp_novice / verify_tavern_map / verify_temple_fold / verify_title_screen / verify_town_exit / verify_town_map
    verify_walk_block / verify_world_map

#### (c) 基準値は **#68 項目5 の凍結 TSV を流用**する(⭐ ユーザー決定 2026-09-18)

§4-3 の ⭐ は「HEAD が 1 本でも動いていたら採り直す」だが、HEAD は動いた(`78c7474` → `9174c39`)のに
**ドライバが読むファイルは 1 バイトも動いていない**。⇒ 流用してよい、とユーザーが決定。**根拠は鵜呑みにせず自分で追試した**:

    git diff --name-status 78c7474..HEAD
      M  実装依頼書/2026-09-16_hold-person-pair.md
      A  実装依頼書/2026-09-18_spell-off-visibility.md
      M  実装依頼書/README.md          ← ⭐ 実装依頼書/ 配下の .md 3 本だけ

    git rev-parse 78c7474:index.html   = 6548a3905a76ffec23f285ec9bdac2fcf543c5be
    git rev-parse HEAD:index.html      = 6548a3905a76ffec23f285ec9bdac2fcf543c5be   ← 一致
    git rev-parse 78c7474:tavern.html  = 32d3b2f9abc9863bd5c402e5a69fa8d80a818fca
    git rev-parse HEAD:tavern.html     = 32d3b2f9abc9863bd5c402e5a69fa8d80a818fca   ← 一致
    git rev-parse 78c7474:tools        = af906aa2b749f878bd3753dc3274a053e1a726a1
    git rev-parse HEAD:tools           = af906aa2b749f878bd3753dc3274a053e1a726a1   ← 一致 (ツリー OID)

**流用する凍結 TSV**(#68 項目5 = `78c7474`・2026-09-17 23:00:41 → 2026-09-18 03:12:22・**251.7 分**):

- 結果 = `result_after68.FINAL.tsv`(**147 行** = ヘッダ + 147 走行。列 = `idx / name / group / exit / secs / start / end / pre_check / log`)
- 名簿 = `runlist_i5.txt`(**147 腕** = `<group>|<file.js>|<args>`。distinct **140 本**)
- 指紋 ① = `fp68_ids_after68.tsv`(`book / id / n_pass / n_fail / n_other`)/ 指紋 ② = `fp68_lines_after68.tsv`(`book / status / count / key_norm`)
- 突き合わせ器 = `fp68_i5.py`(`compare <前.tsv> <後.tsv> <label>`)/ 走査器 = `sweep68_i5.py`
- **凍結 TSV の色** = exit 0 **129** / 非緑 **18**。非緑 18 本 =
  `driver_mapeditor_painting(1)` / `driver_grid_p4(3)` / `driver_grid_p8(1)` / `driver_mapeditor(1)` /
  `driver_monsters_chimera(1)` / `driver_monsters_griffon(1)` / `driver_monsters_hobgoblin(1)` / `driver_sce1_events(1)` /
  `driver_speech_engine(1)` / `driver_speech_v2(1)` / `probe_bandit_map(3)` / `probe_s2_fold(3)` / `probe_swamp_map(3)` /
  `sweep_recruit_balance(1)` / `verify_walk_block(1)` / `driver_field_step6(1)` / `verify_codex_map_skill(1)` /
  **`driver_action_priority_negative(1)`**。
  ⚠ このうち `probe_*` の 3 本の `exit 3 / 0.0 秒`は**引数の使い方ガード**(名簿は `--places` / `--kinds` / `--bfs` の腕で走っている)、
  `driver_action_priority_negative` は **#35 `97f350d` 以来の N3 アンカー腐敗**(#69 のせいではない)。

**⭐ 流用は「#68 が実際に走らせた本」まで — #69 の母集団との差分を機械で取った**(`diff_cover69.py`):

    TSV rows = 147   runlist arms = 147   distinct books = 140
    #69 population = 134   outside = 7
    MISSING books (#69 pop not covered by TSV) = 1 -> ['probe_party_size.js']
    MISSING outside = 0 -> []
    EXTRA books in TSV (not in #69 pop/outside) = 0 -> []
    MISSING named arms = 1 -> [('verify_hold_person.js', '--negative')]

| 差分 | 扱い | 結果 |
|---|---|---|
| **`probe_party_size.js`**(本) | ⭐ #68 項目5 は**別記録**で単独実走していた(600 秒の明示打ち切り。名簿から外してあるだけ) | `probe_party_size_note.txt` = 2026-09-18 03:12:22 開始 / 600.0 秒で自力終了せず / taskkill 後 exit 1 / ログ 46 行。**既知の安定赤** ⇒ 再走しない |
| **`verify_hold_person.js --negative`**(腕) | #68 の名簿に無い = **本当に未測定** ⇒ **今の HEAD で実走した** | **exit 0 / 79 秒 / 変異 8 本すべて担当ラベルが赤くなった(空振り 0)** = #57 の記録値 8/8 と一致 |

    node tools/verify_hold_person.js --negative     # ⛔ timeout で包まない
      → [driver] --negative OK: 8 本すべて担当ラベルが赤くなりました (空振り 0)   EXIT=0  secs=79
      (最後の変異 nocap の素の集計 = 30/31 PASSED / FAILED 1 = (4c)。これは nocap の担当ラベルで、正常)

⇒ **#69 の着手前の基準 = 148 走行(流用 147 + 実走 1)・緑 130 / 非緑 18。**
⚠ 走査中に起草窓が `9174c39` を積んだが、本番と `tools/` は 0 バイト(上の OID)なので基準は有効。

#### (d) 名指し 5 本の基準値(凍結 TSV から引いた実測。⚠ 走って違ったら期待値を書き換える前に理由を突き止める)

| 本 | 腕 | exit | 秒 | 事前検査 |
|---|---|---|---|---|
| `verify_bolt_aim` | 素 | **0** | 2233.4(約 37 分) | `procs=0 ports=` |
| `verify_bolt_aim` | `--negative` | **0** | 82.7 | 同 |
| `verify_hold_person` | 素 | **0** | 9.9 | 同 |
| `verify_hold_person` | `--negative` | **0** | **79**(⭐ 本項目で実走) | `procs=0 ports=` |
| `verify_aoe_coverage` | 素 | **0** | 2.6 | 同 |
| `verify_aoe_coverage` | `--negative` | **0** | 26.1 | 同 |
| `driver_action_priority` | 素 | **0** | 121.4 | 同 |
| `driver_action_priority` | `--negative` | **1** ⚠ | 0.1 | 同(**#35 以来の既知。#69 のせいではない**)|
| `verify_cone_cast` | 素 | **0** | 73.3 | 同 |
| `verify_cone_cast` | `--negative` | **0** | 190.4 | 同 |

#### (e) 実プレイプローブ(§2-8 / §4-5)— **本番 0 バイト**で `window.allyHoldPerson` を包んだ

計測機構 = 配信スナップショット(frozen bytes)をそのまま配り、`page.evaluateOnNewDocument` で
「`window.allyHoldPerson` が生えたら包む」インストーラを注入。⛔ `index.html` / `tavern.html` / `tools/` は無改変。
候補の述語は本番 `pickHoldPersonTarget` の **6 条件を同じ順**で写し(死亡 / 護衛 / 免疫 / held / 射程 / 視線)、
2 体目の判定だけ `tileChebyshev(1体目, 候補) <= spread` を足した。⭐ 装置として `window.d20` も同じ手口で包み、
**全 9 走行で 14〜93 回**呼ばれた = 「トップレベル関数の差し替えが効く」証拠(0 回なら「詠唱されなかった」と読み違える)。

- 舞台 = `goblin-mine` 5 / `bandits-forest` 2 / `lizard-swamp` 2(⛔ アンデッドだけの `undead-temple` は使わない)
- 編成 = 主人公=戦士 + **僧侶(NPC)** + ドワーフ + 魔法使い の 4 人 / `?autoplay=30&diag=1` / 1 走行 **150 秒**
- **9 走行すべて起動成功・包み成功・ページ例外 0**(唯一の console error は `[DIAG][stall] 探索停滞` 1 件 = 診断ログ)

| | 値 |
|---|---|
| 走行数 | **9**(起動 9 / 包み 9)|
| `allyHoldPerson` 呼び出し 合計 | **32**(うち射程内+視線で**実際に詠唱**したもの = **32** = 前進して終わった手番は 0)|
| **(a) 1 走行あたりの詠唱回数** | **3.56**(走行別 4 / 3 / 4 / 3 / 2 / 2 / 5 / 3 / 6)|
| **(b) 6 マス以内に「効く 2 体目の候補」が居た詠唱の割合** | **75.0%(24 / 32)**。舞台別 = 廃坑 68.8%(11/16)/ 森 71.4%(5/7)/ 沼 88.9%(8/9)。**マップ平均 76.4%** |
| 1 体目が免疫だった詠唱 / 既に held | **0 / 0** |
| 術者 | `cleric(npc)` のみ(主人公が僧侶の経路はこの編成では出ない)|
| `spread` / `rangeTiles` の実測 | **6 / 12**(素の腕)|

- **詠唱は 0 回ではない** ⇒ §8 §2 の走行数 N は「素の腕で詠唱合計 10 回以上」を満たすのに **3 走行で足りる**
  (3 × 3.56 ≒ 10.7)。⭐ ただし舞台ごとの率を出すなら **1 舞台あたり 3 走行 × 3 舞台 = 9 走行**が実測どおりの下限。
- ⭐⭐⭐ **新発見 1 — 6 マス(spread)の制限は実プレイではほとんど拘束しない。**
  射程内の「効く他の相手」全 **52 件**のうち、1 体目から **7 マス以上だったのは 3 件だけ**(全部 8 マス)。
  距離の分布 = 0 マス 1 / 1 マス 17 / 2 マス 16 / 3 マス 6 / 4 マス 4 / 5 マス 5。
  ⇒ (b) 75.0% と「射程内に効く他が居た割合」75.0% が**同値**になる。
  ⇒ **変異 `nospread` は実プレイでは空振りする**。§8 (1c) の合成盤面が唯一の口(依頼書の設計はこの点で正しい)。
- ⭐⭐⭐ **新発見 2 — 2 体目の候補は 24 件中 11 件が「同じ遭遇の外」の敵。**
  `encounterEnemyIndices` の中に 1 体目以外の生存者が居た詠唱は **17 / 32** しかないのに、
  6 マス以内に効く候補が居た詠唱は **24 / 32**。内訳 = (候補あり × 同遭遇に他が居ない)**11** /
  (候補あり × 同遭遇にも居る)**13** / (候補なし × 同遭遇には居る)**4**。
  ⇒ 2 体化すると「まだ交戦していない隣の群れ」に掛かる場面が出る。**実装上の誤りではない**が §9 の体感確認の観点に足す。
- 候補が落ちた理由の内訳(詠唱ごとの合計)= `range 106 / los 30 / immune 18 / held 8 / escort 0`。
  ⇒ 効く相手を落としているのは**ほぼ射程と視線**。免疫(アンデッド・ボス)は 18 件。
- ⚠ **この (b) は上限寄りの推定**: プローブは `allyHoldPerson` に入った瞬間(= `dfPlayCast` の 2500ms **前**)に候補を数える。
  実装後の 2 体目選択は詠唱演出の**後**に走るので、その間に敵が動く / 死ぬぶんだけ実際は下がりうる。
  ⇒ §8 (2b)「候補が居たのに 1 体だった詠唱の件数」を記録する設計は、まさにこの差を拾う。**⛔ 件数で合否を決めない**。
- ⚠ **崩れた仕込み**: `partyMembers` に `level: 7` を書いたため、`xp=3000` の腕でも僧侶は **Lv7・枠 2 枚**になった
  (9 走行すべて `slots.hold-person = 2`)。⇒ **「Lv3(枠 1 枚)の腕」は実測できていない**。Lv3 の (a) は未測定。

#### (f) 依頼書・引き渡しメモの主張を HEAD で測り直した結果

| # | 主張 | 実測 |
|---|---|---|
| 1 | 引き渡しメモ「#68 の着地で `index.html` は +75 行ずれた ⇒ 依頼書の `:NNNNN` を使うな」 | ⭐ **半分だけ正しい**。#68 の編集点より**上**(ホールド・パーソン一帯)は **1 行もずれていない**: `pickHoldPersonTarget` **:27667** / `allyHoldPerson` **:27689** / `executeSkillOn` の分岐 **:19850** / `holdPersonImmune` **:27663** / `applyStatus(t,"held"…)` **:27740** / `spawnHoldRing(t);` **:27741** / `HOLD_RING_MAX` **:12293** / `showRollAtEnemy` **:20514** / `showRollAtAlly` **:20526** / index flavor **:22083** / tavern flavor **:4419** — **全部 §2 の記載どおり**。ずれたのは編集点より**下**だけ: `clericAI` :29876→**:29951**(+75)/ `apTryPreferred` :31922→**:31971**(+49)/ `apIsWastedCast` :31880→**:31923**(+43)/ 敵ターンの `"held"` :33939→**:34014**(+75) |
| 2 | §2-1「`"held"` は 5 箇所 / `hold-person\|holdPerson\|HoldPerson` は 29 行」 | ✅ **5 箇所**(:12348 / :16365 / :27679 / :27740 / **:34014**)/ ✅ **29 行** |
| 3 | §2-4「変異アンカー 4 本はちょうど 1 箇所」 | ✅ 4 本とも `hits=1`(`applyStatus(t, "held", skill.holdTurns);` / `spawnHoldRing(t);` / `holdPersonImmune` の return 行 / `const HOLD_RING_MAX = 4;`)|
| 4 | §2-7「flavor を文字で縛る tools は 0 本 / 他の配信ファイルに文言 0 件」 | ✅ `grep -rn "敵1体を" tools/` = **0 件** / `ホールド・パーソン` を含む配信ファイルは `index.html` と `tavern.html` の **2 本だけ** |
| 5 | §2-6「`long` = 12 タイル / `RANGE_LEGACY_TABLE.long` = 6」 | ✅ :20100 `long: { tiles: 12 …}` / :20109 `long: [6, 576]` ⇒ spread は素 **6** / `?dndrange=0` で **3** |
| 6 | §2-9「(4a2) は `immRings.regLen === 1` を直接 assert している」 | ✅ `tools/verify_hold_person.js:872-874`。`installProbe` は部屋に元から居る敵を退けていない(`:383-398` の lane 探索まで見て確認)⇒ §6 の言い直しが要る可能性は残る |
| 7 | §2-11「`#69` / `#70` の番号は tools で 0 件」 | ✅ 今も **0 件**(当たるのは `実装依頼書/*.md` と `README.md` だけ)|
| 8 | §2-11「新規ドライバの base は 10331」 | ✅ `tools/*.js` の base 一覧(10200 以上)= 10201 / 10221 / 10241 / 10261 / 10281 / **10301**(`verify_bolt_aim`)。**10331 は未使用** |
| 9 | §4-2「段1 は `verify_hold_person` / `verify_aoe_coverage` の 2 本」 | ✅ 一致(コメントを落としても同じ)|
| 10 | §4-3「凍結 TSV は HEAD が動いたら採り直す」 | ⚠ **ユーザー決定で覆った**((c) の OID 追試が根拠)。ただし**流用は #68 が走らせた腕まで** ⇒ 差分 1 腕を実走した |
| 11 | §2-3「`showRollAt*` はずらして並べる仕組みを持たない」 | ✅ `:20514-20525` / `:20526-` とも `pop.style.left/top` に単位の座標をそのまま代入するだけ |
| 12 | §8「盤面の横一列は連続した床 **13 マス以上**」 | ⚠ 既存 `verify_hold_person.js:390` の lane 探索は **10 マス以上**。13 マスの行が廃坑に在るかは**未確認** ⇒ 項目4 は自分で探して装置 assert を置くこと |

#### (g) 素材の絶対パス(⚠ scratchpad はセッション固有 = 消える。数値は上に写してある)

このセッション(`0d276b08-6c0c-453b-a44e-0d2212caa78c`)の
`C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\0d276b08-6c0c-453b-a44e-0d2212caa78c\scratchpad\baseline69\`

- 母集団 = `pick_pop69.py` / `population69.txt`(134)/ `population69.json` / `population69_report.txt` / `stage1_roster69.txt` / `outside69.txt`(7)
- 差分 = `diff_cover69.py` / `diff_cover69_report.txt` / `missing69.txt`
- 差分の本の実走 = `logs/verify_hold_person_negative.log`
- 実プレイプローブ = `probe_holdpair69.js`(使い捨て・port **10345**)/ `probe_holdpair69_a.tsv`(32 行 + ヘッダ)/
  `probe_holdpair69_a.json` / `probe_holdpair69_a.summary.txt` / `logs/probe_a.log` / 下見 = `probe_holdpair69_smoke.*`
- ⭐ **#68 の凍結物はこのセッションへコピー済**(#68 の scratchpad が消えても項目5 が使える)=
  `from68/result_after68.FINAL.tsv` / `from68/runlist_i5.txt` / `from68/fp68_ids_after68.tsv` /
  `from68/fp68_lines_after68.tsv` / `from68/summary68_after68.tsv` / `from68/compare68_base68b_vs_after68.txt` /
  `from68/probe_party_size_note.txt` / `from68/fp68_i5.py` / `from68/sweep68_i5.py`
- 原本 = `C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\b0fa1865-6afd-4eba-a0b1-818df2247585\scratchpad\item5\`

#### (h) 後始末

- 走行の前後とも `pwsh -NoProfile -File check_foreign.ps1` = **`procs=0 ports=`**(自分が起こしたもの以外は 1 本も居ない / 残していない)。
- ⛔ 検証ドライバを `timeout` で包んでいない。⛔ 並列に走らせていない(全部直列)。
