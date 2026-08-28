# #34 戦士の仲間にも「行動の優先度」を効かせる

- **起草**: 2026-08-28(計画窓) / **ステータス**: ✅ **完了** `692fb3e`(2026-08-29 実装窓)
- **着手**: 可(#28 は `a7f194e` で着地済・tree clean)。⚠ 実装前に §2 の行番号をもう一度測り直すこと。
- **触るファイル**: `index.html` / `tools/driver_action_priority.js`
- ⛔ **触らないファイル**: `tavern.html` / `js/skill-check.js` / `js/abilities.js` / `title.html` /
  `town.html` / `world.html` / `tools/driver_skillcheck_roster.js` /
  `tools/driver_fix4_help_bonus.js` / `tools/driver_scroll_autoskip.js`
  — #28 で新設/変更されたファイル群。**本チケットは一度も開かずに完了できる**。
  ⚠ `index.html` は別窓も触りうるので、§3 の並走ルールを必ず読むこと。
- ✅ **#28 は 2026-08-28 に着地済**(`aea44a8` / `a7f194e`)。起草中に別窓が完了させたので
  「#28 待ち」の制約は解消している。⚠ ただし別窓は今も同じリポを触りうるので、
  **着手前に `git status --short` を取り直す**こと。
- **後続**: #35(マッチング画面で全員分のスキル/傾向を設定する)。**本チケットが先**
  — #35 は戦士の仲間にも傾向の欄を出すので、本チケットが無いと**画面に出るのに効かない欄**ができる。

---

## 1. 目的

依頼書 #19「行動の優先度」(完了 `2f33dfd`)で、酒場の「出発の準備」画面から
**全般 / 雑魚 / ボス / 道中** の 4 状況ごとに「この技を優先して使ってほしい」を
指示できるようになった。仲間側も 5 職(僧侶・魔法使い・ドワーフ・エルフ・盗賊)は
`apTryPreferred` + `apGateP` で実装済みで、**指示は実際に届いている**。

**しかし戦士の仲間だけ、指示が 1 ビットも効かない。**
`warriorAI` が存在せず、`executeSkillOn` の warrior 分岐が
`if (!isLeader) return false;` で仲間経路を明示的に塞いでいる(§2-2)。
つまり酒場の「戦士」タブで指定した傾向は、**主人公が戦士のときしか意味を持たない**。
主人公が魔法使いで戦士の NPC が来た場合、その戦士は**能動スキルを 1 つも使わず**
通常攻撃とカウンター(リアクティブ)だけで戦っている。

**ユーザー決定(2026-08-28)**:

- **やる** = 戦士の仲間にも行動の優先度を効かせる(AskUserQuestion で ① を選択)。
- ⭐ 不採用: 「戦士の仲間には効きません」と UI に正直に出して終わりにする案。
- ⛔ **今回やらないと決まったもの**: メンバー単位(NPC 個人ごと)の傾向指定。
  出発のたびに `regeneratePartyMembers()` で顔ぶれが再抽選されるため、
  設定が毎回消える。ユーザー判断で見送り(「② は今回やらない」)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⚠ **行番号はすべて HEAD = `a7f194e`(#28 着地直後)で測り直した値。**
⭐ 起草中に #28 が着地し、**12 件の行番号が実際にズレた**(例: `executeSkillOn` の warrior 枝 18072→18073)。
⚠ **着手時にもう一度測り直す。**
以下すべて `grep -n -F` で再現できる形にしてある。

### 2-1. 現状の全数 — 仲間 AI 6 職のうち、戦士だけ入口が無い

`grep -n "async function \(cleric\|mage\|dwarf\|elf\|rogue\|warrior\)AI" index.html`:

| 職 | AI 関数 | 行(HEAD) | `apTryPreferred` | `apGateP` ゲート |
|---|---|---|---|---|
| 僧侶 | `clericAI` | 27323 | ✅ 27332 | 3 本 |
| 魔法使い | `mageAI` | 27422 | ✅ 27431 | 2 本 |
| ドワーフ | `dwarfAI` | 27528 | ✅ 27533 | 8 本 |
| エルフ | `elfAI` | 28336 | ✅ 28345 | 6 本 |
| 盗賊 | `rogueAI` | 28988 | ✅ 28997 | 0 本 |
| **戦士** | **無し** | — | **❌** | **0 本** |

ディスパッチャ(`index.html:27271-27282`)も 5 分岐しかなく、戦士は素通りして
通常攻撃(`allyBasicAttack`)へ落ちる:

```js
      if (ally.classKey === "cleric") {
        if (await clericAI(ally)) return;
      } else if (ally.classKey === "mage") {
      ...
      } else if (ally.classKey === "rogue") {
        if (await rogueAI(ally)) return;
      }
      // 通常攻撃: 最寄りの交戦敵を狙う。
```

⭐ **酒場側は既に 6 職すべてに欄が出ている**(触る必要が無い理由)。
`node tools/driver_action_priority.js` の実測:

```
(S7) 母集団: 6 職すべてで #apRows に select が 4 個ある
     -- warrior:4 dwarf:4 cleric:4 mage:4 elf:4 rogue:4
(6a-1) apSel_<classKey>_<sit> が general/mob/boss は 6 職すべてで存在し可視  -- 18/18 OK
```

**再測定コマンド**:

    grep -n "async function \(cleric\|mage\|dwarf\|elf\|rogue\|warrior\)AI" index.html
    grep -c "Math.random() < apGateP(ally," index.html      # → 20

### 2-2. ⚠⚠⚠ 罠 A — 戦士のスキル実装は「プレイヤーのグローバルを直に触るリーダー専用」

`index.html:18073`(`executeSkillOn` の中):

```js
      // 戦士: executeWarriorSkill はプレイヤーのグローバルを直に触るリーダー専用実装。
      // 仲間の戦士には AI 分岐そのものが無い (依頼書 §2-3) ので、ここへ来ても何もしない。
      if (classKey === "warrior") {
        if (!isLeader) return false;
        await executeWarriorSkill(skillId, targetIdx);
        return true;
      }
```

`executeWarriorSkill`(`index.html:29064`)が呼ぶ 7 本は、すべて
**`playerStats` / `playerBuffs` / `hp` / `maxHp` というプレイヤーのグローバルを直に書く**
(`index.html:21515-21600`)。

⭐⭐⭐ **したがって「`warriorAI` を足して `apTryPreferred` を呼ぶ」だけでは動かない。**
`executeSkillOn` の warrior 分岐に**仲間用の実装**を足すのが本丸。

### 2-3. ⭐ 前例は既にある — ドワーフの仲間版 11 本

`grep -n "async function ally\(PowerAttack\|ShieldWall\|BattleRest\|ThrowingAxe\|AxeStorm\|EarthShatter\|StoneSkin\|SteelWill\|Brace\|BattleRoar\|BigEater\)" index.html`:

| 関数 | 行(HEAD) | 戦士側の相当 |
|---|---|---|
| `allyPowerAttack` | 26533 | **強斬り** の型(攻撃を手で組んでいる 95 行) |
| `allyShieldWall` | 26628 | — |
| `allyBattleRest` | 26675 | **闘志**(HP 回復)の型 |
| `allyThrowingAxe` | 26702 | — |
| `allyAxeStorm` | 26790 | **なぎ払い** の型(周囲全体) |
| `allyEarthShatter` | 26875 | — |
| `allyStoneSkin` | 26951 | — |
| `allySteelWill` | 26965 | — |
| `allyBrace` | 26978 | **鉄壁の構え**(被ダメ軽減)の型 |
| `allyBattleRoar` | 27008 | **士気高揚**(攻撃ロール +)の型 |
| `allyBigEater` | 27023 | **闘志** の型(2d8+CON 回復) |

⭐ **バフ系 3 本(鉄壁の構え / 士気高揚 / 闘志)は `allyBrace` / `allyBattleRoar` /
`allyBigEater` をほぼそのまま転用できる** — 使うバフのフィールドが同じだから:

```js
// allyBrace (index.html:26978) — 鉄壁の構えが使う 2 つを既に書いている
      ally.buffs.dmgReductionDice = skill.dmgReductionDice;
      ally.buffs.dmgReductionRemaining = skill.duration;
// allyBattleRoar (index.html:27008) — 士気高揚が使う 2 つ
      ally.buffs.atkBonusAmount = Math.max(ally.buffs.atkBonusAmount || 0, skill.atkBonusAmount);
      ally.buffs.atkBonusRemaining = skill.duration;
```

`createAlly`(`index.html:12528`)の `buffs` に
`dmgReductionRemaining` / `dmgReductionDice` / `atkBonusRemaining` / `atkBonusAmount` が
すべて実在することを確認済み(`index.html:12549-12559`)。

### 2-4. ⚠⚠⚠ 罠 B — `ally.buffs.skipNextTurn` は**誰も読まない死にフィールド**

`grep -n "skipNextTurn" index.html` の全 10 件:

| 行(HEAD) | 何 |
|---|---|
| 12557 | `createAlly` が `skipNextTurn: false` で**作る** |
| 19209 | `resetAllyBuffs` が `false` に**戻す** |
| 20847 / 20876 | `playerBuffs` 側の初期化・リセット |
| 21545 | `skill_finisher` が `playerBuffs.skipNextTurn = true`(リーダー) |
| 29506-29507 | **`playerBuffs.skipNextTurn` を読む唯一の場所**(リーダーの手番) |
| 18953 / 20851 / 20964 / 31109 | コメント |

⭐⭐⭐ **`ally.buffs.skipNextTurn` を読むコードは 1 行も無い。**
コード自身がその理由を書いている(`index.html:20964`):

```
      // 頭はスタンを数値ではなく skipNextTurn(bool) で表す (渾身の一撃のセルフスタン)。
      // ... 仲間/敵は既存の stunned。
```

⚠⚠⚠ **したがって仲間版の渾身の一撃で `ally.buffs.skipNextTurn = true` と書くと、
デメリット(次ターン行動不能)が黙って消える。** 3d10 の必殺技が
「デメリット無しの上位互換」になり、指定すると壊れる。
**正しくは `ally.stunned = 1`**(`allyAttackTurn`(`index.html:27217`)の先頭 `index.html:27249` が
`ally.stunned--` して 1 手番飛ばす)。

⭐ `ally.stunned` を立てても仲間が自動クリを食らう心配は無い。`index.html:27247` が
明記している ——「`helpless = target.stunned > 0` は PT→敵 の攻撃経路にしか存在しない
(`enemyAttackAllyTarget` は非参照)」。

→ この罠は §8 の負のコントロール **N5** に内蔵する。

### 2-5. ⚠⚠ 罠 C — `apIsWastedCast` に 士気高揚 / 鉄壁の構え の枝が無い

`index.html:29192-29199` は「もう効いている / 撃っても無駄」を **skillId の直書き**で弾いている:

```js
      if (skillId === "arcane-shield" || skillId === "shield-wall") return (b.acBonusRemaining || 0) > 0;
      ...
      if (skillId === "brace")       return (b.dmgReductionRemaining || 0) > 0;
      if (skillId === "battle-roar") return (b.atkBonusRemaining || 0) > 0;
```

⚠ **`morale`(士気高揚)も `iron-guard`(鉄壁の構え)も、この列に無い。**
そのまま指定すると `apIsWastedCast` が `false` を返し続け、
**効いている最中も毎手番撃ち直してターンを溶かす**
(コメント自身が「ここを省くと…毎手番同じバフを撃ち直してスロットを溶かす」と書いている)。

⭐ `fighting-spirit`(闘志)だけは対策済み —— `sk.healDice` を持つので
末尾の汎用枝(`index.html:29221`)が `unit.hp >= unit.maxHp` で弾く。

→ 追加が必要なのは **2 行**。§5 STEP2 に書いてある。負のコントロール **N6**。

### 2-6. ⚠⚠⚠ 罠 D — `(2e)` の「20 本」は**件数の直書き**

`tools/driver_action_priority.js:996-1004`:

```js
      const s = src.indexOf('async function clericAI(ally) {');
      const e = src.indexOf('async function executeWarriorSkill(');
      const region = (s >= 0 && e > s) ? src.slice(s, e) : '';
      const all     = (region.match(/Math\.random\(\) </g) || []).length;
      const wrapped = (region.match(/Math\.random\(\) < apGateP\(ally,/g) || []).length;
      check('(2e) 仲間 AI (clericAI〜elfAI) の確率ゲート 20 本がすべて apGateP でラップされている',
        region.length > 0 && all === 20 && wrapped === 20, ...);
```

⚠⚠ **`warriorAI` は必ずこの region の内側に入る**(`clericAI` 〜 `executeWarriorSkill` の間 =
`index.html:27322`〜`29064`。`rogueAI` 28987 もこの中)。
**ゲートを N 本足すと `all === 20` が偽になり、全部正しくラップしていても赤くなる。**
これは退行ではない。§8 で **期待値を `20 + N` へ書き換える**と明記してある。

⚠ 文字列は `Math.random() < apGateP(ally,` と**完全一致**でなければ `wrapped` に数えられない。
`apGateP(a,` や改行を挟む書き方は不可。

### 2-7. `allyBasicAttack` には opts が無い(`playerSingleAttack` には有る)

| 関数 | 行(HEAD) | シグネチャ | opts |
|---|---|---|---|
| `playerSingleAttack` | 21348 | `(targetIdx, opts)` | `range` / `critMult` / `skillName` / `dmgBonus` / `dmgDice` / `suppressWeaponFx` / `onAfterHit` の **7 キー** |
| `allyBasicAttack` | 25124 | `(ally, enemyIdx)` | **無し**(`parseDiceDD(ally.dmgDice)` 固定・返り値も無し) |

⭐ **リーダー側の戦士スキル 4 本(強斬り/なぎ払い/渾身の一撃/盾バッシュ)は、
すべて `playerSingleAttack` の薄いラッパでしかない**(`index.html:21515-21574`)。
たとえば強斬りは 7 行:

```js
    async function skill_strongCleave(targetIdx) {
      await playerSingleAttack(targetIdx, {
        skillName: "強斬り", dmgDice: "2d8", dmgBonus: playerStats.str,
        range: WARRIOR_SKILLS["strong-cleave"].range,
      });
    }
```

⭐⭐⭐ **したがって `allyBasicAttack` に同じ opts の口を開ければ、仲間版も同じ薄さで書ける。**
`allyPowerAttack` のように 95 行を手で組み直す必要は無い
(memory の教訓「書き込み点を 1 つに畳んでから機能を足す」)。
⛔ **`allyPowerAttack` 以下 11 本は 1 行も書き換えない**(既存の挙動を動かさないため)。

### 2-8. 戦士 10 技のうち、指定できるのはちょうど 7 本

`WARRIOR_SKILLS`(`index.html:20509`)の全 10 件を `apTryPreferred`
(`index.html:29230-29244`)のガードに通した結果:

| id | 名前 | target | 判定 |
|---|---|---|---|
| `strong-cleave` | 強斬り | `single` | ✅ 敵対象(2d8+STR / melee) |
| `sweep` | なぎ払い | `all` | ✅ 敵対象(1d6+STR / 交戦中の生存敵すべて) |
| `finisher` | 渾身の一撃 | `single` | ✅ 敵対象(3d10+STR / **セルフスタン**) |
| `iron-guard` | 鉄壁の構え | `self` | ✅ 自己(被ダメ -1d6 / 1T) |
| `shield-bash` | 盾バッシュ | `single` | ✅ 敵対象(1d4+STR / **スタン 1T**) |
| `morale` | 士気高揚 | `self` | ✅ 自己(攻撃 +2 / 3T) |
| `fighting-spirit` | 闘志 | `self` | ✅ 自己(1d8+CON 回復) |
| `counter` | カウンター | `reactive` | ⛔ `sk.reactive` で弾かれる(既に `performAllyCounter` で動く) |
| `resilient` | 不屈 | `reactive` | ⛔ 同上(`index.html:24579` で仲間も動く) |
| `second-wind` | セカンドウィンド | `self` | ⛔ `sk.outOfCombat` で弾かれる |

⭐ `AP_FRIENDLY_TARGETS = new Set(["self","ally","party"])`(`index.html:29229`)なので、
`self` の 3 本は射程内の敵を要求しない。`single`/`all` の 4 本は
`pickClosestEngagedEnemyFromAlly` が -1 を返したら**撃たずに false**(手番を潰さない)。

⚠ **どの技も `cooldown` / `oncePerEncounter` を宣言していない**
(`WARRIOR_SKILLS` の 10 件に `oncePerEncounter` は 1 件も無い)。
つまり**回数制限はバフの残り時間(§2-5)だけが担保する**。ここが抜けると壊れる。

### 2-9. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

```py
GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

→ **鳴る**(`index.html` を触るため)。**書けるプレイヤー向けの要約は実在する**:

> 戦士の仲間が、指示した技を戦闘で使うようになった。強斬りや盾バッシュなど、
> これまで通常攻撃しかしなかった仲間の戦士が指示どおりに動く。

§2-1 の実測(戦士だけ AI 分岐が無く能動スキルが 0 本)が根拠。⛔ 嘘ではない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `allyBasicAttack` に opts の口 / 戦士の仲間版スキル 7 本 / `warriorAI` + ディスパッチャ 1 分岐 / `executeSkillOn` の warrior 仲間枝 / `apIsWastedCast` に 2 行 / 撤退スイッチ |
| `tools/driver_action_priority.js` | `(2d-1)`/`(2d-2)` を書き換え・`(2e)` の期待値更新・新節 `§7` 追加・負のコントロール 3 本追加 |

⛔ **`tavern.html` は 1 バイトも触らない。** §2-1 のとおり酒場側は既に 6 職すべてに欄があり、
`(S7)`/`(6a-1)` が機械保証している。**触ると #28 実装中の別窓と衝突する。**

### 並走ルール(⚠ 必ず守る)

- `git add .` **禁止**。`git add index.html tools/driver_action_priority.js` のように**ファイル単位**。
- `git commit` の前に **`git diff --cached index.html` を全部読む**。
  指紋 = 自分が書いた量と `--stat` の行数が合わない → 相手の hunk が混ざっている。
- ⚠⚠ **ファイル単位 add でも「相手が同じ index.html を add する」事故は防げない。**
  着手前に `git log --oneline -1` を取り、#28 が着地していることを確かめる。
- ⛔ **`実装依頼書/README.md` への行追加は #28/#29 が着地してから**(文面は §11)。

---

## 4. STEP1 — `allyBasicAttack` に opts の口を開ける

⛔ **ここだけは既存挙動を 1 ビットも変えない。** opts 未指定のときの挙動が
現在と厳密に一致することを `(7a-0)` で機械検査する。

`index.html:25124`:

```js
    // opts は playerSingleAttack (index.html:21348) と同じ契約。⚠ 未指定なら従来どおり。
    //   skillName / dmgDice / dmgBonus / range / suppressWeaponFx
    // ⛔ critMult / onAfterHit は今回使わないので受けない (使わない口を開けない)。
    async function allyBasicAttack(ally, enemyIdx, opts) {
      const o = opts || {};
      ...
      // 射程: o.range (スキル側) が優先、なければ武器射程。⚠ 既定は従来どおり ally.weaponRange。
      const rangeKey = o.range || ally.weaponRange || "melee";
      ...
      // ダメージダイス: o.dmgDice が優先。⚠ 無ければ ally.dmgDice (従来と同一)。
      const { n, sides } = parseDiceDD(o.dmgDice || ally.dmgDice);
      // ダメージ修正: o.dmgBonus が **null/undefined でないとき** 優先 (0 を潰さない)。
      const dmgBonus = (o.dmgBonus != null ? o.dmgBonus : <従来の式>) + <武器 enhancement>;
```

⚠ **`o.dmgBonus != null` で判定する**(`||` にすると `dmgBonus: 0` が従来値へ落ちる)。
`playerSingleAttack` が同じ書き方をしている(`opts.dmgBonus != null ? ... : ...`)。

さらに **返り値を `{ missed: bool }` にする**。盾バッシュが「当たったときだけスタン」を
判定するのに要る(リーダー側 `skill_shieldBash` が `res.missed` を見ている)。
⚠ 既存の `return;`(射程外 / 対象死亡 / ファンブル / ミス)はすべて
`return { missed: true };` へ。命中時の末尾は `return { missed: false };`。
⛔ **既存の呼び口は返り値を見ていない**ので影響なし
(`grep -n "allyBasicAttack(" index.html` で全数確認してから変えること)。

`skillName` は `showRollAtAlly` のラベルに出す(`allyPowerAttack` の書式に合わせる)。
`suppressWeaponFx` は `applyWeaponSpecialEffects` へそのまま渡す。

---

## 5. STEP2 — 戦士の仲間版スキル 7 本 + `apIsWastedCast` の 2 行

### 5-1. 攻撃系 4 本(`allyBasicAttack` の薄いラッパ)

`allyBattleRoar`(`index.html:27008`)の隣に置く。⚠ 既存の ally* 群と並べる。

```js
    // ══════════ 戦士 仲間版 (実装依頼書 #34) ══════════
    // ⛔ リーダー側 (skill_* / executeWarriorSkill) は 1 行も触らない。
    async function allyStrongCleave(ally, enemyIdx) {
      const sk = WARRIOR_SKILLS["strong-cleave"];
      return await allyBasicAttack(ally, enemyIdx, {
        skillName: sk.name, dmgDice: sk.dmgDice, dmgBonus: ally.str, range: sk.range,
      });
    }
    async function allySweep(ally) {
      // 前列全体: 交戦中の生存敵すべてに個別に攻撃ロール (リーダー側 skill_sweep と同じ作法)
      const sk = WARRIOR_SKILLS["sweep"];
      const idxs = encounterEnemyIndices.filter(i => enemies[i] && enemies[i].alive);
      for (const idx of idxs) {
        if (!ally.alive) break;
        if (!enemies[idx].alive) continue;
        await allyBasicAttack(ally, idx, {
          skillName: sk.name, dmgDice: sk.dmgDice, dmgBonus: ally.str, range: sk.range,
        });
        await sleepMs(200);
      }
    }
    async function allyFinisher(ally, enemyIdx) {
      const sk = WARRIOR_SKILLS["finisher"];
      await allyBasicAttack(ally, enemyIdx, {
        skillName: sk.name, dmgDice: sk.dmgDice, dmgBonus: ally.str, range: sk.range,
      });
      // ⚠⚠⚠ 依頼書 §2-4: ally.buffs.skipNextTurn は **誰も読まない死にフィールド**。
      //   ここへ書くとデメリットが黙って消え、3d10 がノーリスクの上位互換になる。
      //   仲間のスタンは既存の数値枠 ally.stunned が唯一の正 (index.html:20964 のコメント)。
      ally.stunned = Math.max(ally.stunned || 0, 1);
      showRollAtAlly(ally, `<span class="label">SELF STUN</span>息切れ — 次ターン休み`, "miss");
      await sleepMs(400);
    }
    async function allyShieldBash(ally, enemyIdx) {
      const sk = WARRIOR_SKILLS["shield-bash"];
      const res = await allyBasicAttack(ally, enemyIdx, {
        skillName: sk.name, dmgDice: sk.dmgDice, dmgBonus: ally.str, range: sk.range,
        suppressWeaponFx: true,   // 盾の打撃なので武器の炎エフェクトは出さない
      });
      if (res && !res.missed && enemies[enemyIdx] && enemies[enemyIdx].alive) {
        enemies[enemyIdx].stunned = sk.stunTarget;
        showRollAtEnemy(enemyIdx, `<span class="label">STUNNED</span>次ターン行動不能`, "miss");
        await sleepMs(500);
      }
    }
```

### 5-2. バフ系 3 本(ドワーフの型を転用)

```js
    async function allyIronGuard(ally) {          // ← allyBrace (26978) の型
      const sk = WARRIOR_SKILLS["iron-guard"];
      flashAction(ally.el, "skill");
      ally.buffs.dmgReductionDice = sk.dmgReductionDice;
      ally.buffs.dmgReductionRemaining = sk.duration + 1;   // ⚠ リーダー側 (21550) と同じ +1
      showRollAtAlly(ally,
        `<span class="label">SKILL</span><span class="big">${sk.name}</span><br>被ダメ -${sk.dmgReductionDice}`, "skill");
      updateInfo(`${ally.def.name}: 鉄壁の構え! 被ダメージを ${sk.dmgReductionDice} 軽減`);
      await sleepMs(800);
    }
    async function allyMorale(ally) {             // ← allyBattleRoar (27008) の型
      const sk = WARRIOR_SKILLS["morale"];
      flashAction(ally.el, "skill");
      // ⚠ 既存の atk バフより弱い場合は上書きしない (allyBattleRoar と同じ Math.max)。
      //   戦闘の咆哮 +4 の上に 士気高揚 +2 を書くと弱体化になる。
      ally.buffs.atkBonusAmount = Math.max(ally.buffs.atkBonusAmount || 0, sk.atkBonusAmount);
      ally.buffs.atkBonusRemaining = sk.duration + 1;       // ⚠ リーダー側 (21576) と同じ +1
      ...
    }
    async function allyFightingSpirit(ally) {     // ← allyBigEater (27023) の型
      const sk = WARRIOR_SKILLS["fighting-spirit"];
      const { n, sides } = parseDiceDD(sk.healDice);
      const r = rollDiceDD(n, sides);
      const heal = Math.max(1, r.total + ally.con);
      const prev = ally.hp;
      ally.hp = Math.min(ally.maxHp, ally.hp + heal);
      ...
      showHealAt(ally.x + ally.def.displaySize / 2, ally.y, ally.hp - prev);
    }
```

⚠ 表記は既存 ally* に揃える(`allyBattleRoar` は `ally.def.name` を使っている)。
NPC 名を出したいなら `ally.npcName || ally.def.name`。**新しい書式を発明しない。**

### 5-3. `executeSkillOn` の warrior 枝を仲間へ開ける

`index.html:18073` を差し替える:

```js
      if (classKey === "warrior") {
        if (isLeader) { await executeWarriorSkill(skillId, targetIdx); return true; }
        // #34: 仲間の戦士。⛔ リーダー用 executeWarriorSkill は絶対に通さない
        //   (playerStats / playerBuffs / hp を直に書くため、仲間が唱えると主人公が回復する)。
        if (!WARRIOR_ALLY_ON) return false;      // 撤退スイッチ (§7)
        if (skillId === "strong-cleave")   { await allyStrongCleave(actor, targetIdx); return true; }
        if (skillId === "sweep")           { await allySweep(actor);                   return true; }
        if (skillId === "finisher")        { await allyFinisher(actor, targetIdx);     return true; }
        if (skillId === "iron-guard")      { await allyIronGuard(actor);               return true; }
        if (skillId === "shield-bash")     { await allyShieldBash(actor, targetIdx);   return true; }
        if (skillId === "morale")          { await allyMorale(actor);                  return true; }
        if (skillId === "fighting-spirit") { await allyFightingSpirit(actor);          return true; }
        return false;   // counter / resilient / second-wind はここへ来ない (apTryPreferred が弾く)
      }
```

⚠⚠⚠ **`if (!isLeader) return false;` を消すだけにしてはいけない。** そのまま下へ流すと
`executeWarriorSkill` が `playerBuffs` を書き、**仲間の戦士が唱えた闘志で主人公の HP が回復する**。
→ 負のコントロール **N7**。

### 5-4. `apIsWastedCast` に 2 行(§2-5)

`index.html:29199`(`battle-roar` の行)の直後へ:

```js
      if (skillId === "morale")      return (b.atkBonusRemaining || 0) > 0;        // #34
      if (skillId === "iron-guard")  return (b.dmgReductionRemaining || 0) > 0;    // #34
```

⛔ **`fighting-spirit` は足さない。** `sk.healDice` を持つので末尾の汎用枝が既に弾く(§2-5)。
足すと二重になり、`healNeedRatio`(道中詠唱の 0.75)が効かなくなる。

---

## 6. STEP3 — `warriorAI` とディスパッチャ

`rogueAI`(`index.html:28988`)の隣に置く。

```js
    // 戦士 AI (実装依頼書 #34)。⭐ 既存 5 職と同じ形:
    //   ① クールダウンのデクリメント → ② 先出し (apTryPreferred) → ③ 従来の if 連鎖
    // ⚠⚠ このブロックは driver の (2e) が数える region の内側 (clericAI〜executeWarriorSkill)。
    //    確率ゲートは **必ず** `Math.random() < apGateP(ally, "<id>", <base>)` の
    //    文字列そのままで書く。1 本でも裸で残すと (2e) が赤くなる。
    async function warriorAI(ally) {
      if (!WARRIOR_ALLY_ON) return false;
      if (ally.skillCooldowns) {
        for (const k of Object.keys(ally.skillCooldowns)) {
          if (ally.skillCooldowns[k] > 0) ally.skillCooldowns[k]--;
        }
      }
      // ★#19/#34: 先出しは **クールダウンのデクリメントより後**。前に置くと
      //   先出しが成立した手番で CD が減らず永久に塞がる (rogueAI と同じ理由)。
      if (await apTryPreferred(ally)) return true;
      const eq = ally.equippedSkills || [];
      const has = (id) => eq.includes(id);
      ...
    }
```

**既定の if 連鎖(指示が無いときの振る舞い)** は下記 4 本だけにする。
⛔ **ゲートを増やすほど `(2e)` の期待値がずれるので、本数は依頼書の通りに固定する。**

| 順 | 条件 | ゲート | 理由 |
|---|---|---|---|
| 1 | HP < 50% かつ `fighting-spirit` 装備 | `apGateP(ally, "fighting-spirit", 0.6)` | 生き残りが最優先 |
| 2 | 隣接敵 ≥ 2 かつ `sweep` 装備 | `apGateP(ally, "sweep", 0.5)` | 複数を巻き込めるとき |
| 3 | `morale` 装備 かつ `atkBonusRemaining <= 0` | `apGateP(ally, "morale", 0.4)` | 開幕バフ |
| 4 | 隣接敵 ≥ 1 かつ `strong-cleave` 装備 | `apGateP(ally, "strong-cleave", 0.5)` | 素の一撃より強い |

→ **新規ゲート 4 本。`(2e)` の期待値は 20 → 24。**

⛔ **`finisher` / `shield-bash` / `iron-guard` は既定の連鎖に入れない。**
`finisher` はセルフスタンでテンポが死ぬ、`shield-bash` は 1d4 で素の攻撃より弱い、
`iron-guard` は受け身すぎる —— **どれも「プレイヤーが明示的に指定したときだけ出る」**にする。
⭐ これが本チケットの体感的な価値(指定に意味が生まれる)。

ディスパッチャ(`index.html:27271`)に 1 分岐:

```js
      if (ally.classKey === "cleric") {
        if (await clericAI(ally)) return;
      } else if (ally.classKey === "warrior") {     // ← #34 で追加
        if (await warriorAI(ally)) return;
      } else if (ally.classKey === "mage") {
```

⚠ `warriorAI` が `false` を返したら**従来どおり通常攻撃へ落ちる**(手番を潰さない)。

---

## 7. 撤退スイッチ

- **`?warally=0`** — 戦士の仲間が完全に従来へ戻る(`warriorAI` が即 `false` /
  `executeSkillOn` の仲間枝も `false`)= **通常攻撃とカウンターだけ**。
- ⚠ **判定位置** = `ACTION_PRIORITY_ON`(`index.html:29117`)の隣に同じ形で 1 つ:

```js
    const WARRIOR_ALLY_ON = (function () {
      try { return new URLSearchParams(window.location.search).get("warally") !== "0"; }
      catch (e) { return true; }
    })();
```

- ⚠ **ページ遷移をまたがない。** `index.html` が自分で読むだけ(先例 = `?actionpri=0` /
  `?heromark=0`)。酒場の欄は消さない(そもそも `tavern.html` を触らない)。
- ⚠ `?actionpri=0` は**上位**。両方 off でも矛盾しない(`apTryPreferred` が先に `false`)。
- ⛔ **`allyBasicAttack` の opts の口はスイッチで消さない。** opts 未指定なら
  従来と厳密に同じ(§4)なので、消す意味が無く、消すと `(7a-0)` が測れなくなる。

---

## 8. 受入条件 — `tools/driver_action_priority.js`(**既存を拡張**)

⭐ **新規ドライバを作らない。** #19 の装置(`__apAllyRun` / `__apMkAlly` / `__apMkBoss` /
`window.__apLog` の計測シーム)がそのまま使える。⚠ **本番ファイルに計測シームを置かない** —
必要な細工は配信スナップショットへ実行時に注入する(既存 `NEG_ANCHOR` の作法)。

**何を観測するか**: 「指定した技が**実際に実行された**」を `executeSkillOn` の呼び出しログ
(`window.__apLog`)と、**バフ/HP/スタンの状態変化**の **2 経路**で突き合わせる。
片方の写経にしない。

### 既存 assert の書き換え(⚠ 退行ではない)

| 既存 | 現在の主張 | #34 後 |
|---|---|---|
| `(2d-1)` | 戦士の仲間の手番で `executeSkillOn` が **1 回も呼ばれない** | **削除して `(7b)` へ置換**(呼ばれるのが正になる) |
| `(2d-2)` | `apTryPreferred(戦士)` が **false** を返す | **削除して `(7c)` へ置換** |
| `(2e)` | ゲート **20 本** | **24 本**(§6 で 4 本追加。⚠ `wrapped` も 24) |

⛔ **`(2d-*)` を「コメントアウトして残す」ことはしない。** 消して新節へ書き直す。

### §7 装置(先に母集団を確かめる)

- **(7a-0)** ⭐⭐⭐ **`allyBasicAttack` に opts を渡さない呼び方が、STEP1 の前後で
  1 ビットも変わっていない。** 固定 seed で戦士の仲間に 200 回通常攻撃させ、
  **与ダメージの列と命中/ミスの列が HEAD と厳密一致**すること。
  ⚠ HEAD 側は `git show HEAD:index.html` を別ポートで配信して同じ seed で採る。
  **これが無いと「口を開けたついでに従来の攻撃が変わった」を見逃す。**
- **(7a-1)** 母集団: `WARRIOR_SKILLS` の 10 件のうち `apTryPreferred` を通るのが
  **ちょうど 7 件**(§2-8 の表と集合一致)。表を写経せず `WARRIOR_SKILLS` の実体から引く。
- **(7a-2)** 母集団: 戦士の仲間が実際に生成でき、`equippedSkills` が空でない。

### §7 本体

- **(7b-0)** 母集団: 指定なしでは 200 回すべて通常攻撃で、強斬りが **0 回**。
- **(7b)** 戦士の仲間の手番(`allyAttackTurn`)で `ボス=強斬り` を指定すると
  `executeSkillOn` が呼ばれ、**指定した技だけ**が実行される。
- **(7c)** `apTryPreferred(戦士の仲間)` が **true** を返し、
  **敵の HP が実際に減っている**(ログだけでなく盤面で確認 = 2 経路目)。
- **(7d)** ⚠⚠⚠ **渾身の一撃を指定すると `ally.stunned` が 1 になり、
  `ally.buffs.skipNextTurn` は `false` のまま**(§2-4)。
  さらに**次の手番が実際に飛んでいる**こと(2 経路目)。
- **(7e)** 盾バッシュを指定して**命中したときだけ** `enemies[i].stunned === 1`。
  ミスした試行では 0 のまま(`res.missed` が効いている証明)。
- **(7f)** 士気高揚を指定すると `atkBonusRemaining > 0` になり、
  **効いている間は 2 回目が撃たれない**(§2-5 の `apIsWastedCast`)。
  ⭐ 20 手番回して `executeSkillOn("morale")` が **1 回だけ**。
- **(7g)** 鉄壁の構えも同じ(`dmgReductionRemaining > 0` の間は撃ち直さない)。
- **(7h)** ⚠⚠⚠ **仲間の戦士が唱えた闘志で、主人公の `hp` が 1 も動かない**
  (`executeWarriorSkill` へ流れていないことの直接証明)。
- **(7i)** 射程外の敵しかいないとき、`強斬り` 指定でも**撃たずに false** を返し、
  従来の連鎖(前進 or 通常攻撃)へ落ちる = 手番を潰していない。
- **(7j)** 既定の連鎖(指示なし)で `finisher` / `shield-bash` / `iron-guard` が
  **1 回も出ない**(§6 の設計どおり)。300 手番で 0 回。

### §7 恒等(非退行)

- **(7k)** ドワーフ / 僧侶 / 魔法使い / エルフ / 盗賊の仲間の挙動が
  **STEP1 の前後で 1 件も変わっていない**(同 seed で 200 手番の行動列が厳密一致)。
  ⭐ `allyBasicAttack` は 5 職すべてが通る共有点なので、ここが本当の非退行検査。

### §7 撤退

- **(7l-0)** 母集団: スイッチが無ければ撃てた盤面(指定あり・装備あり・射程内)。
- **(7l)** `index.html?warally=0` → 戦士の仲間が `executeSkillOn` を **1 回も呼ばない**
  (= `(2d-1)` の旧主張が「スイッチ off のとき」だけ成立する)。
- **(7m)** `?warally=0` でも**他 5 職の先出しは従来どおり効く**(`?actionpri=0` と別物)。

### ⛔ 測らないこと

- **既定の連鎖 4 本の base 値(0.6 / 0.5 / 0.4 / 0.5)**。iOS 実機の体感で動かす余地を残す。
  ⭐ `(7j)` は「出ない 3 本」だけを縛る。出る 4 本の**頻度**は縛らない。
- **`allyMorale` などの演出時間(`sleepMs`)**。テンポは目で決める。
- **NPC 名の表記**(`ally.npcName || ally.def.name` のどちらでもよい)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **N4** | `allyBasicAttack` の `o.dmgBonus != null` を `o.dmgBonus \|\|` へ | `(7b)`(dmgBonus 0 の技が従来値へ落ちる) |
| **N5** ⭐ | `allyFinisher` の `ally.stunned = 1` を `ally.buffs.skipNextTurn = true` へ(**§2-4 の罠そのもの**) | `(7d)` |
| **N6** | `apIsWastedCast` の `morale` の行を削る(**§2-5 の罠**) | `(7f)` |
| **N7** ⭐ | `executeSkillOn` の warrior 枝から `if (isLeader)` を外して全部 `executeWarriorSkill` へ流す(**§2-2 の罠**) | `(7h)` |
| **N8** | `warriorAI` のゲート 1 本を `apGateP` から裸の `Math.random() <` へ(**§2-6 の罠**) | `(2e)` |

⭐ **N5 / N7 / N8 が §2 の罠 B / A / D の再現。** どれか 1 本でも赤くならなければ
その罠は機械で守られていない = テストが空振りしている。

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ **すべて HEAD = `a7f194e`(#28 着地後・tree clean)で 2026-08-28 に実測し直した値。**
⭐ 起草中に #28 が着地したので採り直したが、**4 本とも一字も変わらなかった**
(= #28 はこの 4 本に 1 ビットも影響していない)。
⚠ **走らせて違ったら、期待値を書き換える前に理由を突き止める。**

- `node tools/driver_action_priority.js` → **75/75 PENDING 0**
  (⚠ 本チケットで `(2d-1)`/`(2d-2)` を消して §7 を足すので**本数は必ず変わる**。
   完了条件は「**PENDING 0 かつ FAILED 0**」であって 75 ではない)
- `node tools/verify_recruit_size.js` → **82/82**
- `node tools/verify_quest_walk.js` → **25/25 PENDING 0**
- `node tools/driver_depart_menu_clean.js` → **41/41**
- `node tools/driver_grid_p8.js` → **56/56**(記録値。戦闘ループを触るので念のため)

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレ音声が鳴らない)。

1. 主人公を**戦士以外**(魔法使い等)にして出発し、**戦士の NPC が来る**編成を引く。
2. 酒場の「戦士」タブで `ボス = 渾身の一撃` / `雑魚 = なぎ払い` を指定する。
3. 雑魚戦で仲間の戦士が**なぎ払いを撃つ**か。ボス戦で**渾身の一撃 → 次ターン休み**が
   絵として分かるか(`STUNNED` の吹き出しが出るか)。
4. ⚠ **士気高揚を指定して、効いている間に撃ち直していないか**(ログを目で追う)。
5. ⚠ **戦士の仲間が 2 人来たとき**、2 人とも同じ指示で動くか(職業単位の設計どおり)。
6. `?warally=0` を付けて、従来の「通常攻撃だけ」に戻るか。
7. テンポ ——`sleepMs` の合計が長すぎて手番が間延びしないか(⭐ ここは目で決める)。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>仲間の戦士が指示どおりの技を使うようになった</b> — 強斬りや盾バッシュなど、これまで通常攻撃しかしなかった仲間の戦士が、出発前に指定した傾向で動く。"

---

## 11. やらないこと

- ⛔ **`tavern.html` の変更**(§3)。酒場側は既に 6 職すべてに欄がある。
- ⛔ **メンバー単位(NPC 個人ごと)の傾向指定**。ユーザー判断で見送り(§1)。
- ⛔ **マッチング画面での設定**。**#35** の担当。
- ⛔ **リーダー側(`skill_*` / `executeWarriorSkill` / `pickLeaderAction`)の変更**。
- ⛔ **`allyPowerAttack` 以下ドワーフの仲間版 11 本の書き換え**(§2-7)。
  `allyBasicAttack` へ寄せたくなるが、既存の挙動が動くので今回は触らない。
- ⛔ **`counter` / `resilient` / `second-wind` の指定対応**(§2-8。リアクティブ/戦闘外)。
- ⛔ **戦闘バランスの再調整**。戦士の仲間が強くなるが、数値は #34 では動かさない
  (⭐ 実機の体感で必要と分かったら別チケット)。
- ⛔ **`実装依頼書/README.md` への行追加**(#28/#29 が着地してから)。用意してある行:

    | 34 | [2026-08-28_warrior-ally-action-priority.md](2026-08-28_warrior-ally-action-priority.md) | **承認済** | 0% | 戦士の仲間にも「行動の優先度」を効かせる。⭐ 酒場側は既に 6 職すべてに欄がある(触らない)。⚠⚠⚠ `ally.buffs.skipNextTurn` は**誰も読まない死にフィールド**(渾身の一撃のデメリットが消える → `ally.stunned`)。⚠⚠ `executeWarriorSkill` は**プレイヤーのグローバル直触り**(仲間に通すと主人公が回復する)。⚠⚠ `(2e)` のゲート数 20 は直書き → 24 へ。撤退=`?warally=0` |

---

## 12. 実装結果

- **実装**: 2026-08-29(実装窓) / **コミット**: `692fb3e` / **ステータス**: ✅ 完了
- **触ったファイル**: `index.html` / `tavern.html`(changelog 1 行のみ) / `tools/driver_action_priority.js`
- ⛔ `tavern.html` のロジックは 1 バイトも触っていない(§3 の約束どおり。更新情報の 1 行だけ)。

### 12-1. 計測結果

| ドライバ | 着手前 | 実装後 |
|---|---|---|
| `driver_action_priority` 素 | 75/75 PENDING 0 | **92/92 PENDING 0** |
| `driver_action_priority --negative` | N1〜N6 が全部赤 | **N1〜N11 が全部赤(空振り 0)/ exit 0** |
| `verify_recruit_size` | 82/82 | 82/82 |
| `verify_quest_walk` | 25/25 PENDING 0 | 25/25 PENDING 0 |
| `driver_depart_menu_clean` | 41/41 | 41/41 |
| `driver_grid_p8` | 56/56 | 56/56 |
| `verify_ability_scores` | 24/24 | 24/24 |
| `driver_skillcheck_roster` | 13/13 | 13/13 |
| `verify_player_sheet` | 42/42 | 42/42 |
| `verify_title_screen` | 86/86 | 86/86 |
| `verify_town_map` | 85/85 | 85/85 |
| `verify_tavern_map` | 42/42 | 42/42 |
| `verify_world_map` | 57/57 | 57/57 |

### 12-2. ⚠ 依頼書からの逸脱(全 5 件)

**(1) 負のコントロールの番号を N4〜N8 → N7〜N11 へ繰り下げた。**
§8 の表は N4/N5/N6 を新規として書いていたが、**その 3 つは #19 で既に使われていた**
(N4 = 道中許可リスト / N5 = バフ退避 / N6 = ラッチ)。中身は §8 の表と 1 対 1 で対応する。

**(2) §4 の `dmgBonus = (o.dmgBonus != null ? … : 従来値) + <武器 enhancement>` は採らなかった。**
`effectiveAllyDmgBonus` が `_dmgEnhDelta`(武器 +N のダメージ寄与)を**既に畳み込んでいる**
(`index.html` の `ally.dmgBonus = (ally.dmgBonus || 0) + dmgEnhDelta;`)。式どおりに `+N` を足すと
**opts を渡さない経路で二重計上**になり、(7a-0) が赤くなる。実装は
`const skillDmgBonus = (o.dmgBonus != null) ? o.dmgBonus : effectiveAllyDmgBonus(ally);` とした。
これはドワーフ仲間版 11 本(`(skill.useStr ? ally.str : 0) * times`)と同じ作法でもある。

**(3) (7b-0)/(7b) の題材を 強斬り → 盾バッシュ に替えた。**
§8 は「指定なしでは 200 回すべて通常攻撃で、**強斬りが 0 回**」と書いていたが、
強斬りは §6 の既定の連鎖 ④ に入っているので **0 にならない**(実測 300 手番で 108 回)。
「指定して初めて出る」ことを測れるのは §6 が既定から外した 3 本
(渾身の一撃 / 盾バッシュ / 鉄壁の構え)だけ。→ (7b-0) は盾バッシュ 0 回で母集団を張り、
(7j) が 3 本すべての 0 回を縛る。

**(4) (7i) の「射程外なら撃たずに false」は実測すると成立しない。**
`pickClosestEngagedEnemyFromAlly` に**射程の絞り込みが無く**、距離に関係なく最寄りの
交戦敵を返す。撃たずに false になるのは「交戦敵が 0 体」のときだけで、射程外のときは
既存 ally*(`allyPowerAttack` 等)と同じく**前進して間合いを詰める**。
→ (7i) = 交戦敵ゼロ / (7i-2) = 射程外は前進に化けて敵の HP は 1 も減らない、の 2 本に割った。
⭐ 技は消費されない(戦士 10 技に `cooldown` も `oncePerEncounter` も無い)ので実害は無い。

**(5) (7f) の「20 手番で 1 回だけ」は成立しない。**
士気高揚は duration 3 + 1 = 4 ターン持続なので、20 手番なら 5 回前後が正しい。
「効いている最中に撃ち直さない」+「発動回数が効果時間ぶんに収まる」の 2 本で測った。

### 12-3. ⭐⭐⭐ 実装中に踏んだ罠(次の窓のために)

**(A) コメントに書いた文字列が (2e) の数え上げに拾われて 25 本になった。**
`warriorAI` の注意書きへ「乱数 < apGateP(ally,」と**そのまま書いた**ら、(2e) は配信バイトを
正規表現で数えるので**コメントの 1 本も本物のゲートとして数えた**。ゲートは 4 本しか
足していないのに `all=25 / wrapped=25`。→ 注意書きから比較の形を消して 24/24 になった。
⛔ region 内のコメントに「Math.random() <」を書かないこと。ドライバ側にも警告を書いた。

**(B) (7f)/(7g) が正しい実装で赤くなった。** `allyAttackTurn` は**手番の冒頭でバフを 1 減らして
から** AI を呼ぶ。手番開始時の残ターンをそのまま「効いているか」に使うと、
**切れた瞬間に掛け直した正しい動作**を撃ち直しと誤検出する(残ターンの推移が
`[4,3,2,1,4,3,2,1,…]` = 隙間なく正しい)。→ 判断時の残り = `max(0, 手番開始時 - 1)` で測る。

**(C) (7b-2) が 54 ダメージで赤くなった。** 1 手番のダメージには**通常攻撃の手番**が混ざる。
先出しが外れた手番は opts 無しの `allyBasicAttack` に落ちるので、武器の修正値(テストでは +50)が
乗る。→ 装置に「通常攻撃も記録する」ラッパを足し(`basicPlain` / `basicOpts`)、
**強斬りだけの手番**に絞って測る。

**(D) ⭐⭐⭐ 変異どうしが互いを覆い隠して N9 と N10 が両方空振りした。**
`--negative` は**全部の変異を同時に注入する**。N10(仲間をリーダー用実装へ流す)が入ると
仲間側の `allyMorale` が 1 回も走らないので、**N9(士気高揚の無駄撃ち判定を削る)の証拠が
仲間側から消える**。→ 発動回数を**経路①(executeSkillOn)と経路②(実際に走った ally*)の
大きい方**で数えるようにしたら、両方とも赤くなった。
⚠ 新しい変異を足すときは「他の変異が入った状態でも赤くなるか」を必ず確かめること。

**(E) (7h) が N10 で緑のままだった(2 つの原因が重なっていた)。**
① 仲間の HP を maxHp の半分未満にしていたので `warriorAI` の既定の連鎖 ① が闘志を
**直に**撃ってしまい、`executeSkillOn` を通らず変異が観測できなかった。
② 主人公が満タンだったので、リーダー用実装へ流れても `Math.min(maxHp, …)` に吸われて
**「主人公の hp が動かない = 正常」に化けた**。
→ 仲間 hp = 20(maxHp 30 の半分より上)/ 主人公 hp = 10 で測るようにした。

**(F) `driver_grid_p8` の (8e) が 1 回だけ赤くなった(退行ではない)。**
実プレイ(autoplay)を回すドライバなので、変異側のランが 90 秒で強制終了して `null` を返した。
**再実行で 56/56 PASS**。⚠ このドライバの単発の赤は必ず 1 回再実行してから疑うこと。

**(G) 依頼書の行番号は 1 件だけズレていた。** `executeSkillOn` の warrior 枝は 18073 → **18074**。
⚠ しかも `if (!isLeader) return false;` は**同じ文字列が 18067 にもある**(`fallbackAttack` の中)。
行番号ではなく**文脈**で選ぶこと。他は #29 着地ぶん (+17) を足せば全部合っていた。

### 12-4. 残り(この窓では測れないもの)

§9 の実機/実感 7 項目はユーザーの体感確認が必要。特に:

1. 主人公を戦士以外にして、戦士の NPC が来る編成で 雑魚=なぎ払い / ボス=渾身の一撃 を指定する。
2. 渾身の一撃 →「次ターン休み」が絵として分かるか(`SELF STUN` の吹き出し)。
3. ⭐ テンポ —— 仲間版スキルの `sleepMs` 合計が長すぎて手番が間延びしないか(目で決める)。
4. 戦士の仲間が 2 人来たとき、2 人とも同じ指示で動くか(職業単位の設計どおり)。
5. `?warally=0` で従来の「通常攻撃だけ」に戻るか。

⛔ 既定の連鎖 4 本の base 値(0.6 / 0.5 / 0.4 / 0.5)は**わざと assert していない**。
実機の体感で動かす余地を残してある(§8 の「測らないこと」)。
