# #115 先頭に立った仲間が、育った HP・命中・ダメージを持ったまま戦う

- **起草**: 2026-11-21(起草窓) / **ステータス**: **承認済**(2026-11-21 ユーザー承認)
- **基準 HEAD**: `91e275f`(origin と同期・作業ツリーきれい、2026-11-21 確認)
- **触るファイル**: `index.html`(`tryPromoteNewHead` の中だけ + 撤退スイッチ 1 か所)/ `js/changelog.js`(ヘルパー経由)/ `tools/verify_promote_growth.js`(新規)
- ⛔ **触らないファイル**: なし(並走中の別窓の未コミット差分なし = `git status` clean)。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit(いつもの作法)。

---

## 1. 目的

先頭(頭)の仲間が倒れると、次の仲間が先頭に立つ(`tryPromoteNewHead`)。このとき
`applyLeaderStats()` が頭の数値を **`CLASS_DEFS` の Lv1 の素の値**で作り直すため、
**仲間としてレベルで育った分(最大 HP・命中・ダメージ・能力値)が全部消える**。
Lv10 の盗賊は先頭に立った瞬間に **HP 76 → 22・命中 +11 → +4**、
Lv10 の戦士は **HP 120 → 30・命中 +15 → +4・ダメージ +5 → +3** になる(§2-1 で実測)。
頭が倒れて後続が立つのは苦しい局面なので、そこで Lv1 の体に縮むのは目立つうえに理不尽。

#113 の実装窓が範囲外として見つけた件の残り 2 件(§12-4 の「同根 2 件」)。主人公の最大 HP だけは
`1a44ac8` で直してあるが、**NPC の最大 HP** と **全員の命中・ダメージ・能力値**はまだ直っていない。

**ユーザー決定**:

- (2026-11-10)同根 2 件(NPC の昇格 HP / 昇格した頭の命中・ダメージ)は **#113 とは別のチケットにする**。
- (2026-11-21 起草窓のダイアログ)次チケットとしてこれを選択 → 本チケット。
- 直し方は **「新しい頭は、仲間だったときの体(`nh` の数値)をそのまま引き継ぐ」** に一本化する(§2-3)。
  ⭐ 不採用: 「昇格時に `applyLevelUpToUnit("player", cls, 1, Lv)` で Lv を当て直す」案 —
  NPC の Lv は `member.level` が無いと持っていない(実測で `nh.level === null`)うえ、
  **潜行中のレベルアップ**(`gainXP` が仲間に足した分)を拾えない。持っている値を写す方が正しい。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ⭐ 症状の実測(ヘッドレス Chrome・`91e275f`・2026-11-21)

種 = `dragonfighters.xp` 45000(Lv10)/ 6000(Lv4)、`partyMembers` を sessionStorage に置き、
`hp = 0; onHeadDowned('measure')` で昇格させて前後を読んだ。pageerror 0 件。

| 例 | 昇格する人(仲間だったときの値) | 頭になった後の値 | 失ったもの |
|---|---|---|---|
| **E** 戦士 NPC の頭が倒れ → **盗賊 NPC** Lv10・暗殺者の刃 +1 / 鎧 idx2 | maxHp 76 / atk 11 / dmg 2(うち装備 +1)/ dex 6 / 実効 AC 16 | maxHp **22** / atk **4** / dmg 1 / dex **4** / 実効 AC 16 | HP −54・命中 −7・DEX −2 |
| **F** 同 Lv4・素装備 | maxHp 40 / atk 7 / dex 5 | maxHp **22** / atk **4** / dex **4** | HP −18・命中 −3 |
| **G** 盗賊 NPC の頭が倒れ → **戦士 NPC** Lv10 | maxHp 120 / atk 15 / dmg 5 / str 5 | maxHp **30** / atk **4** / dmg **3** / str **3** | HP −90・命中 −11・ダメージ −2 |
| **C** 戦士 NPC の頭が倒れ → **主人公の魔法使い** Lv10 | maxHp 54 / atk 6 | maxHp **54**(`1a44ac8` で直済)/ atk **1** | 命中 −5 |

- **主人公が頭のまま倒れたときは昇格しない**(`onHeadDowned` `:22118` の `if (heroIsHead) return false;` = ゲームオーバー)。
  ⇒ 昇格が起きるのは **「NPC の頭が倒れたとき」だけ**。新しい頭は NPC(E/F/G)か主人公(C)。
- 実効 AC は E でも 16 → 16 で**崩れていない**(装備の分を頭は読み出し時に足すため)。AC は本チケットの対象外。

**計測コマンド**(再測定するとき。puppeteer-core は `%TEMP%/df_pptr/node_modules` に入っている。
⚠ 2026-11-21 時点で `puppeteer-core/package.json` が欠けて require できなかった → `npm i puppeteer-core` で入れ直して通った):

    cd "$TEMP/df_pptr" && node driver_measure_promote.js

要点だけ抜くと:

    const ni = pickNextHeadIndex(); const nh = allies[ni];
    // 前: nh.maxHp / nh.atkBonus / nh.dmgBonus / nh._dmgEnhDelta / nh.str / nh.dex / currentAllyAc(nh) / effectiveAllyDmgBonus(nh)
    hp = 0; onHeadDowned('measure');
    // 後: maxHp / playerStats.* / currentPlayerAtkBonus() / currentPlayerDmgBonus() / currentPlayerAc()

### 2-2. 真因 — `applyLeaderStats` は Lv1 の素の値で作り直す

`index.html:22461` `applyLeaderStats(leaderKey)`:

    playerStats.str = def.str || 0; ... playerStats.atkBonus = def.atkBonus || 0; ... playerStats.dmgBonus = def.dmgBonus || 0;
    maxHp = def.hpMax || 30;   // 「Lv up での加算は applyInitialLevels で別途やる」

起動時はこの直後に `applyInitialLevels`(`:40031`)が `applyLevelUpToUnit("player", …, 1, headLv)` で
Lv の分を足すので正しい。**昇格の経路(`:22056`)には、その「足し直し」が無い**。

昇格の経路の今の姿(`index.html:22051-22063`):

| 行 | 中身 | 状態 |
|---|---|---|
| `:22056` | `applyLeaderStats(leaderClassKey);` | 素の値へ作り直す(真因) |
| `:22057` | `if (nh.isHero && nh.maxHp > 0) maxHp = nh.maxHp;` | `1a44ac8`: **主人公の最大 HP だけ**引き継ぐ |
| `:22058` | `hp = Math.max(1, Math.min(maxHp, nh.hp \|\| 1));` | 現在 HP の復元 |
| `:22059` | `if (ACC_EQUIP_ON && Array.isArray(nh.accessoryIndices)) {` | #113。⚠ **`verify_accessory_equip.js` の変異 `promote` のアンカー**(1 文字も変えない) |
| `:22061` | `const pb = getAccessoryHpBonus("player");` | |
| `:22062` | `if (pb > 0 && !nh.isHero) { maxHp += pb; hp = …; }` | NPC にだけ装身具の HP を足し直す |

仲間側の数値の作られ方(引き継ぐ元):

| 値 | 作る所 | 中身 |
|---|---|---|
| `a.maxHp` | `createAlly` `:15626` → `applyLevelUpToUnit` `:14806` → `applyAccessoryHpBonus` `:40053` | **Lv の分 + 装身具の HP まで込み** |
| `a.atkBonus` | `createAlly` → `applyLevelUpToUnit` `:14808` | Lv の BAB + 能力値上昇の分。**装備の +N は入っていない** |
| `a.dmgBonus` | `createAlly` → `applyLevelUpToUnit` `:14809` → `applyAllyEquipment` `:25672` | ⚠ **武器の +N の差分 `_dmgEnhDelta` が焼き込まれている** |
| `a.ac` | `applyAllyEquipment` `:25673` | ⚠ 鎧+盾の差分 `_acEnhDelta` が焼き込まれている |
| `a.str/dex/con/wis/int` | `applyLevelUpToUnit` `:14811` | 4 Lv ごとの能力値上昇込み |

頭側の読み出し(装備は**読み出し時に足す**):

- 命中 `currentPlayerAtkBonus()` `:25984` = `playerStats.atkBonus + effectiveWeaponEnh("player") + …`
- ダメージ `currentPlayerDmgBonus()` `:25993` = `playerStats.dmgBonus + effectiveWeaponEnh("player") + getAccessoryDmgBonus("player") + …`
- AC `currentPlayerAc()` `:25999` = `playerStats.ac + 鎧 +N + 盾 +N + …`

### 2-3. ⚠⚠⚠ 罠 — 仲間の `dmgBonus` / `ac` / `maxHp` をそのまま写すと二重に数える

1. **ダメージの二重計上**: `nh.dmgBonus` には武器の +N(`_dmgEnhDelta`)が焼き込み済み。頭は読み出し時に
   武器の +N を**もう一度**足す。⇒ `playerStats.dmgBonus = nh.dmgBonus` と素直に写すと、E の盗賊
   (暗殺者の刃 +1)は実効ダメージ **2 → 3** に化ける。**正しくは `nh.dmgBonus - (nh._dmgEnhDelta || 0)`**
   (実測 E: 2 − 1 = 1 → 頭として読むと 1 + 1 = 2 = 仲間だったときの `effectiveAllyDmgBonus(nh)` = 2 と一致)。
2. **AC は写さない**: `nh.ac` には鎧+盾の差分が焼き込み済み。`playerStats.ac` は `applyLeaderStats` の
   `def.ac` のままでよい(Lv で AC は伸びない = `applyLevelUpToUnit` は ac を触らない)。E の実測で
   実効 AC 16 → 16 と崩れていないのが裏付け。⛔ `playerStats.ac = nh.ac` を書かない。
3. **装身具の HP の二重計上**: `nh.maxHp` は `applyAccessoryHpBonus` で**装身具の HP まで込み**。
   新しい経路で NPC の最大 HP を `nh.maxHp` から引き継ぐなら、`:22062` の
   **「NPC にだけ `pb` を足し直す」は外す**(残すとアミュレットオブヘルスの +8 が 2 回乗る)。
   主人公はすでに `!nh.isHero` で外してある(`1a44ac8`)ので、これを**全員へ広げる**だけ。

⭐ 3 つとも §8 の負のコントロールの変異にする(`dmgdouble` / `accoverwrite` / `hpdouble`)。

### 2-4. 命中の「装備の +N」は頭と仲間で数え方が違う(既存・本チケットでは揃えない)

仲間の命中(`:30561` `ally.atkBonus + allyAtkBuff(ally)` ほか)は**武器の +N を足さない**。頭の命中は足す。
⇒ 引き継ぎ後の頭の命中は「仲間だったときの命中 + 武器の +N」になる(E: 11 → **12**)。
これは昇格の欠陥ではなく、**頭と仲間で命中の式が前から違う**だけ。本チケットでは**揃えない**(§11)。
受入はこの差を前提に書く(§8 (1b))。

### 2-5. 呼び口の全数

`tryPromoteNewHead(` の呼び口は **本番 1 か所**(`onHeadDowned` `:22119`)。
`applyLeaderStats(` の呼び口は **本番 2 か所**(`:22056` 昇格 / `:39887` 起動時)。起動時は触らない。
(`grep -n "applyLeaderStats(\|tryPromoteNewHead(" index.html` で実測)

ドライバ側で昇格を直接叩いているのは 3 本(`driver_heromark_signplate.js:596` / `verify_class_line.js:415` /
`verify_accessory_equip.js` (5a))。どれも**札・名前・装身具**を見ていて、`:22056`〜`:22062` の行をアンカーに
しているのは `verify_accessory_equip.js` の `:22059` だけ(grep で確認)。⇒ 非退行で走らせるが、言い直しは要らない見込み。

### 2-6. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **鳴る**。
プレイヤー向けの要約は実在する(先頭に立った仲間が弱くならない = 見える変化)。§10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `tryPromoteNewHead` の `:22056` の直後に引き継ぎ 1 ブロック + `:22062` の条件 1 か所。撤退スイッチの定数 1 つ(`AMBUSH_ROUND_ON` `:28648` と同型) |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行 |
| `tools/verify_promote_growth.js` | 新規(受入ドライバ・port **10830** / 変異 10831〜10835。1083x / 1084x は既存 tools/*.js で未使用を grep で確認) |

⛔ `applyLeaderStats` 本体は**変えない**(起動時 `:39887` も通る。起動時は `applyInitialLevels` が後で足すので正しい)。
⛔ `:22059` の行は 1 文字も変えない(`verify_accessory_equip.js` の変異アンカー。変えると exit 3)。

---

## 4. STEP1 — 撤退スイッチ

`AMBUSH_ROUND_ON`(`:28648`)と同じ作法。`tryPromoteNewHead`(`:22051`)の手前に置く
(関数の中で読むだけなので TDZ には当たらないが、読む人のために近くへ置く)。

    /* ★#115 先頭に立った仲間は育った体のまま頭になる。撤退 ?promotegrowth=0。index は酒場からの遷移で開くので sessionStorage へ写す (#113/#114 と同じ作法)。 */
    const PROMOTE_GROWTH_ON = (function () {
      try {
        if (/[?&]promotegrowth=0(&|$)/.test(location.search)) sessionStorage.setItem("dragonfighters.promoteGrowthOff", "1");
        return sessionStorage.getItem("dragonfighters.promoteGrowthOff") !== "1";
      } catch (e) { return !/[?&]promotegrowth=0(&|$)/.test(location.search); }
    })();

## 5. STEP2 — 本体(`tryPromoteNewHead`)

`:22056` の直後に足す:

    applyLeaderStats(leaderClassKey);                 // playerStats/maxHp 再構築 (hp は満タンになる)
    if (PROMOTE_GROWTH_ON) {   // ★#115 仲間として育った体 (Lv・能力値上昇・装身具の HP) をそのまま頭へ写す
      for (const k of ["str", "dex", "con", "wis", "int"]) playerStats[k] = nh[k] | 0;
      playerStats.atkBonus = nh.atkBonus | 0;                                 // 仲間の atkBonus に装備の +N は入っていない
      playerStats.dmgBonus = (nh.dmgBonus | 0) - (nh._dmgEnhDelta | 0);       // ⚠ 焼き込まれた武器の +N を抜く (頭は読み出し時に足す)
      if (nh.maxHp > 0) maxHp = nh.maxHp;                                     // Lv と装身具の HP 込み
      // ⛔ playerStats.ac は写さない (nh.ac には鎧/盾の +N が焼き込み済み。Lv で AC は伸びない)
    }
    if (nh.isHero && nh.maxHp > 0) maxHp = nh.maxHp;  // (1a44ac8 の行。そのまま残す = 撤退時も主人公の HP は守る)

`:22062` を:

    if (pb > 0 && !nh.isHero && !PROMOTE_GROWTH_ON) { maxHp += pb; hp = Math.max(1, Math.min(maxHp, nh.hp || 1)); }

(引き継ぎ後は `nh.maxHp` が装身具の HP を含むので足し直さない。撤退時は従来どおり NPC に足す)

⛔ 動かしてはいけないもの: `:22058` の現在 HP 復元・`:22059` の行・呪文枠/バフ/状態異常の写し(`:22064` 以降)。
⚠ `critRange` / `critMult` / `dmgDice` / `weaponRange` は `def` のまま(Lv で伸びない・武器は読み出し時)。

## 6. STEP3 — 受入ドライバ

§8。`verify_accessory_equip.js` の骨組み(配信スナップショットの凍結・変異の検算・`--negative`)を流用する。

---

## 7. 撤退スイッチ

- **`?promotegrowth=0`** — 昇格した頭が従来どおり `CLASS_DEFS` の素の値になる(**主人公の最大 HP だけは `1a44ac8` のまま引き継ぐ** = `91e275f` と同じ振る舞い)。
- ⚠ 判定位置 = `index.html` の `PROMOTE_GROWTH_ON`(読み込み時 1 回)。ページ遷移をまたぐ = **sessionStorage `dragonfighters.promoteGrowthOff` へ写す**(酒場から `?promotegrowth=0` 付きで入っても、部屋の遷移で消えない)。

---

## 8. 受入条件 — `tools/verify_promote_growth.js`(新規・port 10830 / 変異 10831〜10835)

昇格の前に `allies[pickNextHeadIndex()]` の「仲間としての実効値」を読み、`hp = 0; onHeadDowned('verify')` で
昇格させ、後で「頭としての実効値」を読んで突き合わせる。⭐ **2 経路**: ① 仲間だったときの実効値との一致
② `CLASS_DEFS` + `LEVEL_PROGRESSION` から**ドライバが独自に**計算した Lv の期待値との一致
(① だけだと「仲間側も素の値だった」と同じ間違いを共有して緑になる)。

### §0 装置

- **(0a)** 全例で `onHeadDowned` が `true`(昇格が起きた)・`heroIsHead` が期待どおり・`leaderClassKey` が昇格した人の職。
  ⭐ これが無いと「昇格しなかったので値が変わらず緑」になる
- **(0b)** 昇格前の仲間の値が素の値と**違う**(Lv10 種で `nh.maxHp > CLASS_DEFS[cls].hpMax` / `nh.atkBonus > def.atkBonus`)。
  = 母集団に「失うもの」が実在する
- **(0c)** E の例で `nh._dmgEnhDelta >= 1`(罠 §2-3-1 を踏める種になっている)
- **(0d)** 全ページで pageerror 0 件

### §1 本体(例 E / F / G / C + 装身具の例 H)

- **(1a)** 最大 HP: 昇格後の `maxHp === nh.maxHp`(昇格前)・かつ ② `def.hpMax + (Lv−1)×hitDieMax (+ 装身具の HP)` と一致
- **(1b)** 命中: `currentPlayerAtkBonus() === nh.atkBonus + effectiveWeaponEnh("player")`(§2-4 の差を明示)・② BAB の伸びと一致
- **(1c)** ダメージ: `currentPlayerDmgBonus() === effectiveAllyDmgBonus(nh)`(昇格前)。E で 2 === 2(⚠ 二重計上なら 3)
- **(1d)** 能力値: `playerStats.str/dex/con/wis/int === nh.*`(G の戦士 str 5・E の盗賊 dex 6)
- **(1e)** AC: `currentPlayerAc() === currentAllyAc(nh)`(昇格前)。E で 16 === 16
- **(1f)** 例 H(アミュレットオブヘルスを持つ NPC が昇格): `maxHp === nh.maxHp`(+8 が**1 回だけ**)
- **(1g)** 現在 HP: 昇格前に `nh.hp` を半分へ減らしておき、昇格後 `hp === nh.hp`(満タンに戻らない)

### §2 恒等

- **(2a)** 起動時の頭(昇格していない)の `maxHp` / `playerStats` が `?promotegrowth=0` と素で一致(起動時の経路を壊していない)

### §3 撤退

- **(3a)** `?promotegrowth=0` で例 E/G が §2-1 の表の「頭になった後の値」(素の値)へ戻る・C の maxHp は 54 のまま
- **(3b)** `?promotegrowth=0` で入り、部屋を 1 つ遷移しても撤退が効いている(sessionStorage)

### ⛔ 測らないこと

- 戦闘の勝率・クリア率(昇格は全滅寸前でしか起きず、ばらつきが大きい)
- 頭と仲間の命中式の違い(§2-4)を「直ったか」で測らない — 揃えないと決めてある

### 負のコントロール(`--negative`)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `off` | `if (PROMOTE_GROWTH_ON) {` → `if (false) {` | (1a)(1b)(1d) |
| `dmgdouble` | `- (nh._dmgEnhDelta \| 0)` を消す(§2-3-1 の罠) | (1c) |
| `accoverwrite` | `playerStats.ac = nh.ac` を足す(§2-3-2 の罠) | (1e) |
| `hpdouble` | `:22062` の `&& !PROMOTE_GROWTH_ON` を消す(§2-3-3 の罠) | (1f) |
| `nohp` | `if (nh.maxHp > 0) maxHp = nh.maxHp;` を消す | (1a)(1f) |

### 既存 golden の非退行(実装後に必ず走らせる)

昇格を叩くもの + 頭の数値に触れるもの。**基準値は項目1 で `91e275f` の上で取る**(起草窓では取っていない):

- `node tools/verify_accessory_equip.js` → 32/32(2026-11-10 の記録。(5a) の主人公の昇格は値が変わらない見込み)
- `node tools/verify_class_line.js`
- `node tools/driver_heromark_signplate.js`
- `node tools/verify_run_chronicle.js`
- `node tools/verify_ambush_round.js` → 18/18(2026-11-10 の記録)

⚠ 走らせて違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認

- NPC を先頭にした 3〜4 人の隊で潜り、先頭が倒れたとき、次に立った仲間の HP バーが**縮まない**(最大値が仲間のときと同じ)
- 主人公が頭になったときのシートの命中・ダメージが、倒れる前の仲間のときと同じ桁

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>先頭に立った仲間が弱くならないように</b> — 先頭が倒れて次の仲間が前に出たとき、レベルで伸びた HP・命中・ダメージが消えていた不具合を直した。"

---

## 11. やらないこと

- ⛔ **頭と仲間の命中式を揃える**(仲間の命中が武器の +N を足さない件 §2-4)。別チケット候補
- ⛔ **`leaderLevel` の付け替え**: 昇格しても `leaderLevel`(サイドバーの Lv 表示)は倒れた頭の Lv のまま。
  NPC は `member.level` が無いと Lv を持っていない(実測 `nh.level === null`)ので、出所から決める必要がある。別チケット候補
- ⛔ **戦士の NPC が頭になったときの装備**: 頭が戦士だと装備は主人公の `currentWeaponIndex` 系を読む(`getLeaderWeaponIdx` `:16651`)。
  仲間の戦士の装備(`allyEquipSelection.warrior`)とは別物。本チケットでは触らない
- ⛔ `applyLeaderStats` 本体・起動時の `applyInitialLevels` の変更
- ⛔ 主人公が頭のまま倒れたときの扱い(ゲームオーバー)の変更
- `実装依頼書/README.md` の一覧へ足す行(承認後に起草窓が足す):

    | 115 | [2026-11-21_promote-keeps-growth.md](2026-11-21_promote-keeps-growth.md) | **承認済** | 0% | 先頭に立った仲間が育った HP・命中・ダメージを持ったまま戦う(#113 同根 2 件)。⚠⭐ 仲間の dmgBonus / ac / maxHp は装備・装身具が焼き込み済み = そのまま写すと二重計上 |

---

## 12. 実装結果

### 12-1. 着手前の測り直し(373f59a)

**結論: §4〜§8 の設計どおりに進められる。** 崩れた前提は無い(§2-5 に補足が 1 件。設計には響かない)。

**行番号**: `91e275f..373f59a` の差分は依頼書と `実装依頼書/README.md` の 2 ファイルだけで、**`index.html` は同一**。
§2〜§5 の行番号はすべてそのまま当たる(中身も実測で照合)。

| 依頼書の行 | 373f59a | 何 |
|---|---|---|
| 22051 / 22052 / 22054 | 同じ | `tryPromoteNewHead` / `pickNextHeadIndex()` / `const nh = allies[ni];` |
| 22056 | 同じ | `applyLeaderStats(leaderClassKey);` |
| 22057 / 22058 | 同じ | 主人公の maxHp 引き継ぎ(`1a44ac8`)/ 現在 HP の復元 |
| 22059 | 同じ | `if (ACC_EQUIP_ON && Array.isArray(nh.accessoryIndices)) {` |
| 22061 / 22062 | 同じ | `getAccessoryHpBonus("player")` / `if (pb > 0 && !nh.isHero) { maxHp += pb; … }` |
| 22113 / 22118 / 22119 | 同じ | `onHeadDowned` / `if (heroIsHead) return false;` / `return tryPromoteNewHead(context);` |
| 22461 | 同じ | `applyLeaderStats`(22465-22479 で str/dex/con/wis/int・atkBonus・ac・dmgBonus を `def` から、`maxHp = def.hpMax`・`hp = maxHp`) |
| 39887 / 40031 / 40048 / 40053 | 同じ | 起動時の `applyLeaderStats` / `applyInitialLevels` / `applyAccessoryHpBonus` / 仲間へ装身具の HP を足す行 |
| 28648 | 同じ | `const AMBUSH_ROUND_ON = (function () {` |
| 15626 / 14806 / 14808 / 14809 / 14811 | 同じ | `createAlly` の `maxHp: cd.hpMax` / `applyLevelUpToUnit` の仲間側 maxHp・atkBonus・dmgBonus・能力値 |
| 25669 / 25672 / 25673 | 同じ | `ally._dmgEnhDelta = …` / `ally.dmgBonus += dmgEnhDelta` / `ally.ac += acEnhDelta` |
| 25977 / 25984 / 25993 / 25999 / 26011 | 同じ | `effectiveAllyDmgBonus` / `currentPlayerAtkBonus` / `currentPlayerDmgBonus` / `currentPlayerAc` / `currentAllyAc` |
| 30561 | 同じ | 仲間の命中 `ally.atkBonus + allyAtkBuff(ally)`(武器の +N を足さない = §2-4) |
| 16651 | 同じ | `getLeaderWeaponIdx` |
| `check_changelog.py:32` | 同じ | `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` |

**§2 の主張の照合**

| 主張 | 実測 |
|---|---|
| §2-1 症状表 E/F/G/C | ✅ **ヘッドレスで再現**(`driver_measure_promote.js` を 373f59a で再走・pageerror 0。ログ `measure_promote.log`)。E: 76/11/2/dex6/AC16 → maxHp 22・atk 4・dmg 1・dex 4・実効 AC 16 / F: 40/7/dex5 → 22/4/4 / G: 120/15/5/str5 → 30/4/3/3 / C: 54/6 → 54/**1**。⭐ 補足: E の頭の**実効**命中 `currentPlayerAtkBonus()` は 5(素 4 + 武器 +1)、実効ダメージ `currentPlayerDmgBonus()` は 2(1 + 1)= 仲間のときの `effectiveAllyDmgBonus` 2 と一致 ⇒ **E ではダメージは今も失われていない**(表の「失ったもの」欄にダメージが無いのと整合。盗賊は Lv10 でも dmgBonus が伸びない)。ダメージの喪失が見えるのは G(5 → 3) |
| §2-2 `applyLeaderStats` は素の値 | ✅ 22465-22479。`applyLevelUpToUnit` の player 側(14797〜)が足す分は昇格経路に無い |
| §2-3-1 `_dmgEnhDelta` の焼き込み | ✅ 書き手は 25669 の 1 か所のみ(grep)。E の実測 `nh.dmgBonus 2` / `nh._dmgEnhDelta 1` / `effectiveAllyDmgBonus(nh) 2` |
| §2-3-2 AC を写さない | ✅ E で `nh.ac 16`(`_acEnhDelta 2` 込み)・昇格後 `playerStats.ac 14` + 鎧の +2 = 実効 16 |
| §2-3-3 装身具の HP | ✅ 40053 `a.maxHp += ab`。22062 は `!nh.isHero` のときだけ足し直す |
| §2-5 呼び口 | ✅ `tryPromoteNewHead(` 本番 1(22119)/ `applyLeaderStats(` 本番 2(22056 / 39887。ほか 21589 / 21658 はコメント) |
| §2-5 ドライバのアンカー | ✅ ただし**補足 1 件**: `verify_accessory_equip.js:101` 変異 `promote` は 22059 の**行全体(行末コメント `// ★#113 新しい頭は…` 込み)**を逐語で持つ。さらに `verify_class_line.js:151` 変異 `headstale` が同じ関数の **22097** `paintHeadClassLine(!nh.isHero && !!nh.npcName, nh.classKey);` をアンカーにしている(§2-5 の「アンカーは 22059 だけ」は 22056〜22062 の範囲に限れば正しい)。どちらも逐語一致なので、行の挿入で番号がずれても効く。⛔ 22097 の行も変えない |
| 新しい名前 | ✅ `PROMOTE_GROWTH_ON` / `promotegrowth` / `promoteGrowthOff` / `verify_promote_growth` は `index.html` / `tools` / `js` に未出 |
| ポート 10830〜10835 | ✅ `tools/*.js` に `1083x` / `1084x` は 0 件(近くの使用は 10780 / 10790 / 10810 / 10819)。Chrome の制限ポートにも当たらない |
| §5 の `nh[k] \| 0` | ✅ 仲間の str/dex/con/wis/int は `createAlly`(15635)が必ず持つ(`int: cd.int \|\| 0`)。`applyLeaderStats` も `def.* \|\| 0` なので、値の無いキーが 0 になる振る舞いは同じ。仲間の能力値・atkBonus の書き手は `applyLevelUpToUnit` 以外に無い(grep) |

**実装で気をつける点(§1〜§11 には書かれていない)**

1. **(1c) の E は修正前でも緑になる**: E のダメージは今も 2 === 2(上の §2-1 の補足)。(1c) が「直ったか」を見分けるのは **G(3 が 5 に戻る)**。変異 `dmgdouble` は E で 3 になるので赤くできる。⇒ (1c) は E と G の両方で判定すること。
2. **`currentPlayerDmgBonus` は `getAccessoryDmgBonus("player")` も足す**。`effectiveAllyDmgBonus` も装身具のダメージを足す(25979)うえ、`nh.dmgBonus` には入っていない ⇒ 二重にならない。例 H でダメージ系の装身具を持たせても (1c) の式はそのまま成り立つ見込み(コードを読んだ推定。未測定)。

**golden 5 本の基準(2026-11-21 09:31〜09:38 に実行。HEAD 373f59a = `index.html` は 91e275f と同一。ログ = `C:\Users\PC_User\.claude\dev-loop\r115\item1\`)**

| ドライバ | 実測 | rc | 所要 | §8 の記録との比較 |
|---|---|---|---|---|
| `node tools/verify_accessory_equip.js` | 32/32 | 0 | 147 秒 | 同じ(32/32) |
| `node tools/verify_class_line.js` | 18/18 | 0 | 14 秒 | (記録なし) |
| `node tools/driver_heromark_signplate.js` | 46/46 | 0 | 14 秒 | (記録なし) |
| `node tools/verify_run_chronicle.js` | 74 PASSED / 0 FAILED | 0 | 223 秒 | (記録なし) |
| `node tools/verify_ambush_round.js` | 18/18 | 0 | 6 秒 | 同じ(18/18) |

赤は 0 本。時間帯: **昼(09 時台)に走らせた結果**。`verify_accessory_equip` の走行中に §2-1 の計測ドライバ(port 10795)を並走させた(所要秒が数秒伸びた可能性があるだけで、判定には響かない)。
