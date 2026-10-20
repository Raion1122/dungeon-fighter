# #96 カウンタースペル — 敵の詠唱を打ち消す魔法使いの反応呪文

- **起草**: 2026-10-18(起草窓) / **ステータス**: **承認済**(2026-10-18 ユーザー承認)
- **触るファイル**: `index.html`(呪文の定義・割り込み関数・差し込み 1 行・演出・巻物・撤退スイッチ)/ `tavern.html`(写し 3 枚 + changelog)/ `tools/verify_counterspell.js`(新規)/ 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: なし(並走している窓なし。2026-10-18 `git status` = 会議記録 1 枚の変更だけ)

---

## 1. 目的

7.9-1 で敵が呪文を撃つようになった(ゴブリンシャーマン・盗賊魔術師・蛇神司祭・オーク呪術師・リッチ など)。ところが、こちらにはそれを打ち消す手段が無い。返し手は闇市のスペルターニングの指輪(回数つき)だけだ。

5e SRD の **カウンタースペル**(3 レベル・反応・60ft)を魔法使いに足す。敵が詠唱を終えた瞬間に魔法使いが割り込み、呪文を消す。オートバトルで「何も起きなかった」と見分けがつくよう、**打ち消した**ことがはっきり見える演出にする。

**ユーザー決定(2026-10-18・開発会議 `dev-meetings/2026-10-17_new-spells-items.md` 第2段)**:

- 打ち消す範囲 = **詠唱する敵だけ**。`enemyCastSpell` を通る呪文に限り、ブレス・眼柄・視線・オーラ・召喚は打ち消さない(5e の作法: 呪文ではない)。
- 使う条件 = **重い呪文と危ない時だけ**。次の 3 つのどれかに当たるときに打ち消す。
  - 範囲の呪文(ファイアボール・シャター)
  - スコーチングレイ
  - 単体の軽い呪文で、パーティの誰かが一撃で倒れうる HP のとき
- 会議の合意:
  - 指輪が先で、カウンターは後。
  - 判定は振らない(敵の呪文は全部 3 レベル以下 = 自動成功)。
  - 唱えるのは主人公 → 仲間の魔法使い(並び順)。
  - 巻物で覚える(uncommon)。
  - AI が自分から唱える候補には入れない(反応専用)。
  - 依頼書は 1 枚・3 項目。
- 不採用:
  - 単眼の暴君の眼柄の MM / 火球も打ち消せるようにする案(5e の眼光線は呪文ではない。暴君は魔法使いを黙らせる相手)。
  - 枠がある限り毎回打ち消す案(序盤のファイアボルトで枠を使い切る)。
  - 4 レベル以上の呪文への能力判定(該当する敵の呪文が今は 0)。

---

## 2. 着手前の実測(起草窓が本番コードで確かめた事実・基準 `17be12f`)

### 2-1. 敵が呪文らしいものを撃つ入口(`enemyAttackTurn` `index.html:36366` の中・全数)

| 入口 | 行 | 使い手 | 呪文か | 今回 |
|---|---|---|---|---|
| `sovereignEyeStalkTurn` | `:35442`(呼び口 `:36524`) | 単眼の暴君(眼柄 7 種) | ✗ 眼光線 | 打ち消さない |
| `hydraFireBreath`(単頭ボス) | `:34974`(呼び口 `:36533`) | ファラクサス・キマイラ | ✗ ブレス | 打ち消さない |
| `umberGaze` | (呼び口 `:36543`) | アンバーハルク | ✗ 視線 | 打ち消さない |
| `hydraFireBreath`(多頭) | 呼び口 `:36558` | 古代ハイドラ | ✗ ブレス | 打ち消さない |
| **`enemyCastSpell`** | **`:35291`**(呼び口 `:36584`) | 下の 7 種 | **○** | **打ち消す** |
| `bossTurnSummon` / `partyWillSave(def.fearDC)` | `:34901` / 激怒の枝 | リッチ | ✗ 召喚・オーラ | 打ち消さない |

`enemyCastSpell` の使い手(`spellcaster: true` の 7 行)と、置かれているシナリオ(`build*Run` の中の置き場所を grep):

| 敵 | 定義の行 | 呪文 | 置き場所 |
|---|---|---|---|
| ゴブリンシャーマン `goblinShaman` | `:10208` | fireBolt | 廃坑 `buildGoblinMineRun` |
| 盗賊魔術師 `banditMage` | `:10800` | fireBolt / magicMissile / scorchingRay | 森 `buildBanditsForestRun` |
| 蛇神司祭 `lizardPriest` | `:10953` | + shatter | 沼地 `buildLizardSwampRun` |
| 若き蛇神司祭 `swampNovice` | `:10979` | + shatter | 沼地 n4(#53) |
| オーク呪術師 `orcShaman` | `:10567` | fireBolt / magicMissile / scorchingRay | 砦 `buildOrcFortRun` |
| リッチ `lich`(ボス) | `:10443` | magicMissile / fireBolt / **fireball** | 神殿 `buildUndeadTempleRun` |
| Will-o'-Wisp `ghostFlame` | `:11097` | fireBolt | ⚠ **置き場所 0 件**(定義・台詞・体質の表だけ = 今はどこにも出ない) |

- ⭐ ファラクサス(`:10642`)は `spells` を持たない(ブレスと噛みつきだけ)。ボールト `spells.md` の「ファラクサスの SLA 対策」は古い想定(別 PC の宿題・§11)。

### 2-2. ⭐ 差し込み口はすでにある — スペルターニングの指輪 `tryReflectEnemySpell`(`:34929`)

`enemyCastSpell`(`:35291-35330`)の流れ:

1. 呪文を抽選する(`Math.random`)。
2. `showRollAtEnemy` で `SPELL` の札を出す → `flashAction` → `updateInfo` → `await dfPlayCast(...)`(詠唱の演出 1100ms)。
3. **`if (await tryReflectEnemySpell(idx, {...})) return;`**(`:35317-35326`)。指輪が跳ね返したら、被弾の解決を丸ごと飛ばす。
4. `if (meta.kind === "aoe") { await enemyCastAoE(...); return; }`(`:35329`)。
5. 単体: `pickEnemyTarget(idx)` → 命中 → `applyEnemySpellDamage`。

⇒ **3 と 4 の間に 1 行足す**:`if (await tryCounterEnemySpell(idx, spellId, meta)) return;`。

- 指輪は先に `return` するので、二重には効かない。
- 敵のクールダウンは呼び口(`:36585` `enemy.spellCooldown = (def.spellCooldownTurns || 2) + 1;`)が `await` の後で立てる。早く `return` しても、通常どおり進む(打ち消されても敵は手番と枠を失う = 5e どおり)。
- 指輪の口を読む受入は `verify_enemy_traits.js` の P11 だけで、`window.__plaza.tryReflect`(`:14627`)のシームを直叩きしている(行のアンカーは無い)。
- ⚠⚠ **`enemyCastSpell` を走らせる受入は tools/ に 1 本も無い**(7.9-1 のドライバ `driver_ranged_step2.js` は `%TEMP%` にあって既に消えている)。⇒ 新しいドライバで、打ち消さない時の素の経路(被弾が出る)も一緒に測る(§8 §1)。

### 2-3. ⚠⚠⚠ 罠 A — 割り込む時点で、敵の足元の陣はもう消えている

`dfPlayCast`(`:12352`)は足元の陣を `spawnCastCircle(ally, elem, dur)`(`:12292`)で出し、詠唱が終わると `cleanup` で `circle.destroy()` を呼ぶ。指輪の口は `await dfPlayCast` の**後**にある。
⇒ 会議の「敵の陣をガラスみたいに割る」は、**既存の陣には触れない**。割り込みの演出で、`spawnCastCircle({ x: enemy.x, y: enemy.y, def }, "arcane", 短い ms)` を**新しく 1 枚出し**、それを割る。

- 戻り値 `{ el, destroy }` の `el` にクラス(`fxCastCircle--broken`)を足して、ひび・震え・フェードを CSS で付ける。
- 破片は `emitParticle` で 12 個まで。
- ⚠ `spawnCastCircle` はシート未ロードで `null` を返す(陣なしで続ける作り)。⇒ `null` でも落ちないこと。
- ⚠ `dfPlayCast` は `window.__autoplay > 1` で演出を省く。新しい演出も同じ旗で軽くしてよい(バナーと札は残す)。

⭐ §8 の負のコントロール `oldcircle`(既存の陣の参照を探して割ろうとして、何も出さない変異)で守る。

### 2-4. ⚠⚠ 罠 B — 単体呪文の狙いは、差し込み口の**後**で引かれる

`pickEnemyTarget(idx)` は `:35332`(指輪と範囲の分岐の後)。狙いを先に引くように並べ替えると、乱数の順番が変わり、既存の受入が揺れる。
⇒ 「一撃で倒れうる」は**狙いを見ずに**判定する。**パーティの生きている誰かの HP ≤ その呪文の最大値**なら打ち消す。

- 最大値は `ENEMY_SPELLS`(`:35162`)から計算する。ダイスの最大 + `flat`、`rays` があれば本数倍、クリティカルは数えない。
  - fireBolt = 12
  - magicMissile = 13
  - scorchingRay = 24(条件の②で常に打ち消す)
- ⛔ `tryCounterEnemySpell` は、打ち消さないときに**乱数を 1 つも引かない**。判定は表と HP だけで行う。

⭐ 負のコントロール `rngdrift`(判定の中で `Math.random()` を 1 回引く変異)は、§8 の (1a) の「素の経路の被弾の値が、カウンターの有無で変わらない」で赤くなる。

### 2-5. ⚠⚠ 罠 C — 主人公の「装備した技」と、仲間の枠は出所が違う(#95 K3)

- 魔法使いの枠は**クラスごとの割り当て** `partySkillsMap.mage` を、主人公(`initLeaderSpellSlots` `:21215`)と仲間(`initAllySpellSlots` `:14789`)が共有する。どちらも `levelReq` と `isSpellKnown` で絞る。
- 主人公の `equippedSkills` は、酒場で選んだ技(またはクラスの既定)から来る。枠とは別物だ(#95 §12-4 K3)。
- ⇒ カウンターは **`hasSpellSlot(unit, "counterspell")` だけで判定する**(アーケインアイ `takeArcaneEyeCaster` `:38750` と同じ)。⛔ `equippedSkills.includes` を条件にしない(戦士のカウンター `:36845` の書き方を写さない)。
- 主人公の枠は `"player"` で確かめて使う。演出の位置には `makeLeaderActor()`(`:20949`)を使う(#78 / #79 の役割分け)。

### 2-6. 反応の技の前例 — `reactive` の旗(`:23610` / `:23690` / `:23696`)

- 戦士の `counter`(`reactive: "onHit"`)・`resilient`(`onLethal`)、ドワーフの意地(`onLowHp`)が使っている。
- 主人公の技の候補(`:34758` / `:34770`)と `apTryPreferred`(`:34396`)は、`sk.reactive || sk.outOfCombat` の技を外す。
- `mageAI`(`:32240`)は呪文を名指しで拾うので、新しい id は拾わない。
- ⇒ `MAGE_SKILLS["counterspell"]` に **`reactive: "onEnemySpell"`** を付ければ、AI の 3 つの口から自然に外れる。⛔ 新しい除外の条件は書かない。
- 酒場の「傾向」の候補(`tavern.html:7983-7986`)は `autoCast` の行を外す。⇒ `MAGE_SKILLS_UI` の行に **`autoCast: true`** を付ける(#78 / #79 と同じ)。

### 2-7. 唱える人の 5 条件(本番の欄名で)

| 条件 | 主人公 | 仲間(`classKey === "mage"`) |
|---|---|---|
| ① 枠 | `hasSpellSlot("player", "counterspell")` かつ `leaderClassKey === "mage"` | `hasSpellSlot(a, "counterspell")` |
| ② 生存 | `hp > 0 && !gameOver` | `a.alive` |
| ③ 動ける | `!playerBuffs.skipNextTurn && !(playerBuffs.confused > 0) && !((playerBuffs.sleepRemaining \|\| 0) > 0) && !(playerBuffs.wildConfused > 0)`(`playerAttackTurn` `:34665-34700` が手番を飛ばす 4 つ) | `!(a.stunned > 0) && !(a.confused > 0) && !(a.wildConfused > 0)`(`allyAttackTurn` の `:32032-32052`。眠りは `stunned` で表している) |
| ④ 届く | 中心 `playerX + 48, playerY + 58` | 中心 `a.x + a.def.displaySize / 2, a.y + a.def.displaySize / 2` |
|  | 術者の中心まで `tileChebyshev(...) <= getRange("long").tiles`(**12 マス = 60ft**・`?dndrange=0` では 6)かつ `hasLineOfSight(...)`(`:18927`) | 同左 |
| ⑤ 反魔法の外 | `!isSovereignShellActive() && !isOnSovereignRay("player")` | `!isSovereignShellActive() && !isOnSovereignRay(a)` |

順は **主人公 → `allies` の並び順**。最初に 5 つを全部満たした 1 人が唱える。

### 2-8. ⚠ 罠 D — 枠は「クリアまで戻らない」わけではない(会議の前提の訂正)

会議の第 2 段は「枠はシナリオをクリアしたときにしか戻らない(`:20416`)」を前提に、使う条件を絞った。実測では、戦闘の勝利ごとに戻る口が 2 つある。

- **勝利ボーナス**(`:22998-23024`): **仲間だけ**、呪文ごとに `ceil(max × 25%)` を戻す。⇒ カウンターの枠が 1〜4 個なら、勝つたびに **1 個戻る**。
- **部屋クリアの小回復** `applyRoomClearHeal`(`:28843`・ボス部屋では戻さない): 主人公も仲間も、満タンでない呪文のうち**位が一番低いもの**(`levelReq × 1000 + mpCost` が最小)を 1 つ戻す。

⇒ ユーザー決定の「使う条件」は**そのまま採る**(慎重寄りでも出番は十分ある)。ただし枠の温存が効く場面は、会議の想定より少ない。§9 で出る頻度を見て、緩めるかどうかを決める(別チケット候補)。

### 2-9. 呪文の数値

| 項目 | 値 | 根拠 |
|---|---|---|
| id / 名前 | `counterspell` / カウンタースペル | `grep -rni counterspell` 0 件(衝突なし・2026-10-18) |
| `levelReq` | **3** | 3 レベル呪文。ファイアボール・ライトニングボルトと同じ段 |
| `mpCost` | **6** | 枠の順位 `levelReq*1000+mpCost` にだけ効く。ライトニングボルトと同じ |
| `range` | `"long"`(12 マス) | 60ft。§2-7 ④ |
| `category` / `target` | `"defense"` / `"reactive"` | 戦士の `counter`(`:23690`)と同じ形 |
| `reactive` | `"onEnemySpell"` | §2-6 |
| 判定 | なし(自動成功) | 敵の呪文は全部 3 レベル以下(§1 の不採用) |
| 巻物 | `scroll-counterspell` / 巻物・カウンタースペル / uncommon | 店の棚(#77)は common だけ ⇒ 開発用の棚とボスの落とし物で手に入る |

### 2-10. 既存の受入が持つアンカー(触るものを掴む本・`grep -lE` 2026-10-18)

| 触るもの | 掴む本 |
|---|---|
| `tryReflectEnemySpell` / `ring_spell_turning` | `verify_enemy_traits`(シーム直叩き・行のアンカーなし) |
| `MAGE_SKILLS_UI` | `verify_arcane_eye` / `verify_bolt_aim` / `verify_invisibility` / `verify_mage_hand` / `verify_mage_hand_reach` / `verify_member_identity`((2k) = 酒場と本体の `levelReq` の一致) |
| `MAGE_SKILLS` | `driver_field_step7` / `verify_arcane_eye` / `verify_bolt_aim` / `verify_bolt_bounce` / `verify_invisibility` / `verify_recruit_talk` |
| `SCROLL_CATALOG` / `pickScrollId` | `sim_plaza_entry` / `verify_arcane_eye` / `verify_cleric_spirits` / `verify_invisibility` / `verify_mage_hand` / `verify_save_slots` / `verify_scroll_shelf` |
| `SCROLL_DEV_SHELF_TV` / `devShelfSwitchOnTV` | `verify_arcane_eye`(`:217` が `const dev = …` の行を逐語で掴む)/ `verify_cleric_spirits`(含まれるかだけ) |
| `mageAI` | `driver_action_priority` / `verify_aoe_coverage` / `verify_cone_cast` / `verify_lore_check` |
| 枠の台帳(使わなかった技) | `verify_run_chronicle`(年代記の `computeIdle` `:16100-16133` は「max − 残」で使ったかを見る) |

- ⭐ 既存の行を書き換えず、新しい行を足すだけにする。⛔ `pickScrollId`(`:14492`)の filter の 1 行だけは書き換えが要る(#95 と同じ。逐語で掴む本は無い)。
- ⛔ `tavern.html` の `const dev = SCROLL_DEV_SHELF_TV.indexOf(id) >= 0 && devShelfSwitchOnTV(id);` の行は書き換えない(`verify_arcane_eye` の変異 `invisoff` のアンカー)。
- ⚠ `verify_mage_hand` (9b) は引き出しの呪文の行(`.spellCountItem`)を数える。カウンタースペルを**覚えていない**ときは行が増えないことを、項目 1 の後に走らせて確かめる。
- 年代記: カウンターは**敵の手番の中**で起きる。⛔ `RunChronicle.usedSkill` を呼ばない(帰属が敵の手番に乗る)。使った記録は枠の台帳(max − 残)が自然に拾う。⛔ HP を引く点は増えない(`verify_run_chronicle` (0c) の 45 は動かない)。

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。書ける要約は実在する(§10)。

**再測定コマンド**(着手前にもう一度):

    grep -n "async function enemyCastSpell\|async function tryReflectEnemySpell\|const ENEMY_SPELLS\|function spawnCastCircle\|function takeArcaneEyeCaster\|function pickScrollId\|async function applyRoomClearHeal" index.html
    grep -n "spellcaster: *true" index.html
    grep -n "const MAGE_SKILLS_UI\|const SCROLL_CATALOG_TV\|const SCROLL_DEV_SHELF_TV\|function devShelfSwitchOnTV" tavern.html
    grep -rni "counterspell" --include=*.html --include=*.js . | grep -v node_modules

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 撤退スイッチ `isCounterspellOn()` / `MAGE_SKILLS` 1 行 / `SCROLL_CATALOG` 1 行 / `pickScrollId` の撤退条件 / `ENEMY_SPELLS` の最大値を返す関数 / `tryCounterEnemySpell` + 唱える人を探す関数 / `enemyCastSpell` に差し込み 1 行 / 演出(CSS `.fxCastCircle--broken` ほか + 生成)/ 最初の 1 回の語り / 検証用の窓口(`window.__counterspellProbe`) |
| `tavern.html` | `MAGE_SKILLS_UI` 1 行 / `SCROLL_CATALOG_TV` 1 行 / `SCROLL_DEV_SHELF_TV` に 1 語 + `devShelfSwitchOnTV` に 1 枝 + `isCounterspellOnTV()` / changelog 1 行 |
| `tools/verify_counterspell.js` | 新規(port **10635**) |
| `実装依頼書/README.md` | 完了時に #96 の行を更新 |

---

## 4. STEP1 — 土台(呪文の定義・割り込み・5 条件・使う条件・巻物・撤退)

### 4-1. 撤退スイッチ(`isClericSpiritOn` `:14400` の隣)

    /* ★[#96] 撤退スイッチ ?counterspell=0 — カウンタースペルで打ち消さない + 巻物を拾わない。
     * ⚠ const に畳まず関数にする (TDZ 回避。#54 isMageSleepOn と同じ)。各ページが独立に読む (遷移はまたがない)。 */
    function isCounterspellOn() {
      try { return new URLSearchParams(window.location.search).get("counterspell") !== "0"; }
      catch (e) { return true; }
    }

### 4-2. 表

- `MAGE_SKILLS` の `arcane-eye` の後に足す(値は §2-9):

      "counterspell": {
        name: "カウンタースペル", category: "defense", target: "reactive",
        range: "long", reactive: "onEnemySpell",
        mpCost: 6, levelReq: 3,
        flavor: "敵の詠唱に割り込んで呪文を打ち消す (範囲の呪文・スコーチングレイ・仲間が危ない時に自動)",
      },

- `SCROLL_CATALOG` の魔法使いの行(`scroll-arcane-eye` の後)に、既存と同じ書式で足す:
  `"scroll-counterspell":   { name: "巻物・カウンタースペル",    spellId: "counterspell",         classKey: "mage",   rarity: "uncommon" },`
  ⚠ 1 行 1 冊・`rarity` で閉じる(`verify_scroll_shelf` の正規表現・#78 罠 D)。
- `pickScrollId`(`:14492`)の filter の末尾に `&& (isCounterspellOn() || id !== "scroll-counterspell")` を足す。

### 4-3. 使う条件 `counterspellWanted(meta)`

    /* ★[#96] 打ち消すに値する呪文か (ユーザー決定 2026-10-18「重い呪文と危ない時だけ」)。
     * ⛔ 乱数を引かない・狙いを見ない (罠 B)。 */
    function enemySpellMaxDamage(meta) { /* ダイスの最大 + flat、rays 倍。クリティカルは数えない */ }
    function counterspellWanted(meta) {
      if (!meta) return false;
      if (meta.kind === "aoe") return true;                 // ファイアボール / シャター
      if ((meta.rays || 1) > 1) return true;                // スコーチングレイ
      const mx = enemySpellMaxDamage(meta);
      if (hp > 0 && !gameOver && hp <= mx) return true;     // 主人公が一撃で倒れうる
      return allies.some(a => a && a.alive && a.hp <= mx);  // 仲間の誰かが一撃で倒れうる
    }

### 4-4. 唱える人 `findCounterspeller(enemy)`(§2-7 の 5 条件)

- 戻り値は `{ unit: "player" | ally, actor, name, cx, cy }` か `null`。
- 名前: 主人公 = `getLeaderName()`、仲間 = `a.npcName || a.def.name`(`takeArcaneEyeCaster` と同じ)。
- 主人公 → `allies` の並び順。⛔ 枠をここでは減らさない(探すだけ)。

### 4-5. `tryCounterEnemySpell(enemyIdx, spellId, meta)`(`tryReflectEnemySpell` の直後に置く)

1. `if (gameOver || !isCounterspellOn()) return false;`
2. 敵が居ない・倒れている → `false`。
3. `if (!counterspellWanted(meta)) return false;`
4. `const c = findCounterspeller(enemy); if (!c) return false;`
5. `consumeSpellSlot(c.unit, "counterspell")`。失敗したら `false`(念のため)。
6. 演出(STEP2)を `await` する。
7. `updateInfo(\`${c.name} のカウンタースペル! ${enemy.def.name} の ${meta.jp} を打ち消した\`)`。
8. `window.__counterspellProbe` があれば `push({ caster: c.name, unit: c.unit === "player" ? "player" : allies.indexOf(c.unit), enemy: enemy.def.name, spell: spellId })`。
9. `return true;`

### 4-6. 差し込み(`enemyCastSpell` の `:35326` `})) return;` の直後・`:35329` の前)

    // ── ★[#96] カウンタースペル: 指輪が跳ね返さなかったときだけ、魔法使いが割り込んで打ち消す ──
    if (await tryCounterEnemySpell(idx, spellId, meta)) return;

⛔ `tryReflectEnemySpell` の呼び口の行と、範囲の呪文の分岐の行は 1 文字も変えない。

---

## 5. STEP2 — 見せ場(何も起きなかったと見分けられる 3 つの印 + 札・バナー・語り)

1. **敵の足元で陣が割れる**(罠 A):
   - `spawnCastCircle({ x: enemy.x, y: enemy.y, def: enemy.def }, "arcane", 600)` を新しく出す。
   - 戻り値の `el` に `fxCastCircle--broken` を足す(CSS: 短い震え + ひびの擬似要素 + フェード)。
   - 破片は `emitParticle` で 12 個まで。
   - ⛔ blur を使わない。⛔ 陣の位置合わせの `transform` を CSS animation で動かさない(`spawnCastCircle` が毎フレーム inline で書く。#95 罠 F と同じ)。震えは `::before` / `::after` か `opacity` に持たせる。
2. **こちらの足元に青白い輪**: `spawnCastCircle(c.actor, "ice", 700)`。
3. **光の線**: こちらの中心から敵の中心へ、既存の飛翔体 `spawnEnemySpellBolt("magicMissile", c.cx, c.cy, ecx, ecy)`(`:12478`)を流用する(敵の呪文の弾を逆向きに使う)。
4. 敵の頭上に `showRollAtEnemy(idx, '<span class="label">COUNTERED</span>' + meta.jp, "miss")`。
5. バナー `showBanner(\`🚫 カウンタースペル! ── ${meta.jp} を打ち消した\`, 1700)`、SFX は `sfx("counter")`(指輪と同じ流用)。
6. 最初の 1 回だけ語り:`showDMMessage("「術が編み上がる刹那、もう一つの声がその綾を断ち切る。」", 3200)`。旗はページ内の `let` 1 本(ページを開き直せば戻ってよい)。

- 順番: 輪 → 光の線(await)→ 陣が割れる + 札 + バナー → `sleepMs(450)`。
- ⚠ 主人公が唱えたときは `makeLeaderActor()` を演出に使う(§2-5)。

---

## 6. STEP3 — `tavern.html` の写し 3 枚と開発用の棚

- `MAGE_SKILLS_UI` の `arcane-eye` の後に 1 行。`levelReq: 3`・`mpCost: 6`・`range: "long"`・**`autoCast: true`**(§2-6)。flavor は index と同じ。⚠ `verify_member_identity` (2k) が `levelReq` の一致を見る。
- `SCROLL_CATALOG_TV` に 1 行(index と同じ中身・同じ書式)。
- 開発用の棚:
  - `SCROLL_DEV_SHELF_TV` の配列に `"scroll-counterspell"` を足す。
  - `devShelfSwitchOnTV` に `if (id === "scroll-counterspell") return isCounterspellOnTV();` を足す。
  - `isCounterspellOnTV()` を `isClericSpiritOnTV` の隣に置く。
  - ⛔ `const dev = …` の行は書き換えない(§2-10)。
- ⛔ `DEFAULT_KNOWN` / `DEFAULT_KNOWN_TV` には入れない(巻物で覚える)。

---

## 7. 撤退スイッチ

- **`?counterspell=0`** — 枠があっても打ち消さない(`tryCounterEnemySpell` が最初の行で `false`)。巻物を `pickScrollId` で拾わない。`tavern.html` では開発用の棚に並べない。
- ⚠ 判定位置: `index.html` = `isCounterspellOn()`、`tavern.html` = `isCounterspellOnTV()`。**ページ遷移はまたがない**(各ページが独立に読む)。
- ⚠ 既に覚えた呪文と、割り当てた枠はそのまま(セーブを壊さない)。撤退中は、枠は残るが使われない。

---

## 8. 受入条件 — `tools/verify_counterspell.js`(新規・port 10635)

**方針**: 本番のページを実 Chrome(`puppeteer-core`)で開く。盤面の作り方は `verify_cleric_spirits.js` を流用する。

- 魔法使いを主人公と仲間の両方に立て、`counterspell` を知っていて枠がある状態にする。
- 呪文使いの敵 1 体を置き、`enemyCastSpell(idx)` を直叩きする。
- 演出の待ちは `sleepMs` を潰す(`driver_speech_boss.js:132` の作法)。
- 呪文の抽選は `Math.random` を差し替えて、狙った呪文を出す。
- 観測するもの:
  - パーティの HP の変化
  - 枠の数
  - `window.__counterspellProbe`
  - 呼び口のクールダウン(`enemyAttackTurn` 経由の 1 本で)
- ⛔ AI が「いつ」打ち消すかの頻度は測らない(§9)。

### §0 装置

- **(0a)** `getSkill("counterspell")` が引ける / `reactive === "onEnemySpell"` / 巻物が `SCROLL_CATALOG` に在る / 仕込んだ主人公と仲間の枠に `counterspell` が載る(Lv3 以上)。⭐ これが無いと全 assert が空振りで永久緑になる。
- **(0b)** 盤面: 敵の呪文使いと魔法使いの距離・視線が、ドライバの座標計算で「届く」「届かない」の両方を作れている。
- **(0c)** ソース 2 ファイルの写し 3 枚(呪文の表の `levelReq` / `mpCost` / `range`・巻物の行・開発用の棚)が一致して 1 行ずつ。

### §1 打ち消し

- **(1a)** ⭐ 素の経路: 枠が 0 のとき、ファイアボルトを撃たせるとパーティの HP が減る(被弾が実在する = 永久緑よけ)。同じ乱数の列で、カウンターの枠がある(が使う条件に当たらない)ときも、**被弾の値がまったく同じ**(罠 B: 打ち消さないときは乱数を引かない)。
- **(1b)** ファイアボール(リッチ)を撃たせると、カウンターの枠があればパーティの HP が 1 も減らない・枠が 1 減る・`__counterspellProbe` に 1 件。
- **(1c)** シャターとスコーチングレイも、全員の HP が満タンでも打ち消す。
- **(1d)** ファイアボルト: 全員が 13 以上の HP なら打ち消さない。誰か 1 人を 12 にすると打ち消す。マジックミサイル: 13 / 14 の境目で同じ。
- **(1e)** `enemyAttackTurn` 経由で打ち消されても、敵の `spellCooldown` が `(spellCooldownTurns || 2) + 1` になる。
- **(1f)** 唱える人の順: 主人公と仲間の両方に枠があれば、主人公の枠だけが減る。主人公の枠が 0 なら、仲間の先頭の枠が減る。

### §2 唱えられない 5 条件(それぞれ単独で崩して、打ち消さない・枠が減らない)

- **(2a)** 枠 0
- **(2b)** 倒れている
- **(2c)** 眠り / スタン / 混乱(主人公は `sleepRemaining` / `skipNextTurn` / `confused` / `wildConfused`、仲間は `stunned` / `confused` / `wildConfused`)
- **(2d)** 13 マス離す / 視線を壁で切る
- **(2e)** 殻の展開中 / 帯の上

各条件で、もう 1 人が条件を満たしていれば、そちらが唱えることも確かめる。

### §3 指輪と、打ち消さないもの

- **(3a)** 指輪を持っていれば指輪が跳ね返し、カウンターの枠は減らない(二重にならない)。
- **(3b)** 指輪の回数を使い切った状態ではカウンターが打ち消す。
- **(3c)** `hydraFireBreath`(`window.__plaza.fireBreath`)は、カウンターの枠があっても打ち消されない(被弾が出る・枠が減らない)。
- **(3d)** 単眼の暴君の眼柄(`sovereignEyeStalkTurn`)の MM は打ち消されない。

### §4 演出と記録

- **(4a)** 打ち消したとき、新しい陣の DOM(`.fxCastCircle--broken`)が 1 枚出る・`COUNTERED` の札が敵に出る。⚠ 演出を省く `__autoplay` を立てずに測る。
- **(4b)** 語りは最初の 1 回だけ(2 回目は出ない)。
- **(4c)** 年代記: カウンターの枠を使ったら「使わなかった技」に**入らない**。使わなければ入る。HP を引く点の総数(`verify_run_chronicle` (0c) = 45)は変わらない。

### §5 撤退

- **(5a)** `?counterspell=0` → 枠があっても (1b) の場面で被弾が出る・枠が減らない。
- **(5b)** `?counterspell=0` → `pickScrollId` の全区間で巻物が出ない。素では uncommon の集合に入る。
- **(5c)** `tavern.html?counterspell=0` → 開発用の棚に巻物が無い。素の開発モードでは 1G で並ぶ。

### §9

- **(9a)** pageerror 0 件。

### ⛔ 測らないこと

- 実戦で何回打ち消すか(頻度・手触りは §9 の実機で)。
- 演出の見た目(色・ひびの形・破片の動き)。DOM の数と札の文字だけを測る。
- 使う条件の妥当性(数値は §2-4 で固定。緩めるかどうかは §9 の後で決める)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `noslot` | 打ち消しても枠を減らさない | (1b) |
| `reach` | 距離と視線を見ない | (2d) |
| `ringlast` | 差し込みを指輪の呼び口より前に置く | (3a) |
| `sleepcast` | 動ける条件を外す(眠っていても唱える) | (2c) |
| `rngdrift` | 判定の中で `Math.random()` を 1 回引く(罠 B) | (1a) |
| `oldcircle` | 既存の陣を探して割る(新しい陣を出さない・罠 A) | (4a) |
| `leak` | `pickScrollId` の撤退条件を外す | (5b) |

### 既存 golden の非退行(実装後に必ず走らせる)

§2-10 の 19 本(`verify_enemy_traits` / `verify_arcane_eye` / `verify_bolt_aim` / `verify_invisibility` / `verify_mage_hand` / `verify_mage_hand_reach` / `verify_member_identity` / `driver_field_step7` / `verify_bolt_bounce` / `verify_recruit_talk` / `sim_plaza_entry` / `verify_cleric_spirits` / `verify_save_slots` / `verify_scroll_shelf` / `driver_action_priority` / `verify_aoe_coverage` / `verify_cone_cast` / `verify_lore_check` / `verify_run_chronicle`。`--negative` を持つものは neg も)。
`index.html` / `tavern.html` を触るので、#95 と同じく **母集団の全数走査**(#95 §12-3 の 226 腕 + `verify_counterspell` 素 / neg)を項目 3 で行う。

- ⚠ 基準の色は **項目 1 の先頭で控える**(着手前の `17be12f` の色)。
- ⚠ #95 の完了時点で既知の非緑 = 20 腕(#95 §12-3)。`verify_lore_check` (1j) は並列で回すと揺れる(#95 K8)⇒ 直列で比べる。
- ⭐ 変異アンカーの衝突は、全 tools の文字列リテラルを着手前と後で数え直して測る(#94 / #95 §12-3 の方法)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須。開発モード(`tavern.html?dev=1`)で、武器防具屋の巻物の棚から巻物を 1G で買い、酒場で「読む」。そのあと、魔法使いの枠をカウンタースペルに 1〜2 個割り当てる。

- 砦(オーク呪術師 2 体)や神殿(リッチ)で、「打ち消した」が片手で見て分かるか(割れる陣・こちらの輪・光の線)。
- リッチ戦(召喚・恐怖・火球が重なる)で、破片の演出がフレームを落とさないか(iPhone)。
- 出る頻度。少なすぎないか / ボスの前に空にならないか(§2-8 で、仲間の枠は勝つたびに戻ると分かった)。
- 「暴君の火球は消せない」が不具合に見えないか(暴君のバナーは「眼柄斉射」)。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>魔法使いにカウンタースペル</b> — 巻物で覚える新呪文。敵の詠唱に割り込み、火球などの呪文が完成する前に打ち消す。"

---

## 11. やらないこと

- ⛔ ブレス・眼柄・視線・オーラ・召喚の打ち消し(ユーザー決定)。
- ⛔ 4 レベル以上の呪文への能力判定(該当する敵の呪文が 0)。
- ⛔ 探索中の敵の飛び道具(7.9-1 で演出だけ・1 ダメージ固定)の打ち消し。
- ⛔ 単体呪文の狙いを差し込み口より前に引く並べ替え(罠 B)。
- ⛔ 打ち消した回数を「戦いの記録」(#37)に出す欄(別チケット候補)。
- ⛔ 混乱して味方を狙う敵(`__wildActiveTurn`)の呪文を打ち消さない、といった細かい例外(狙いを見ない設計なので、その場合も打ち消す)。
- ⛔ Will-o'-Wisp を盤面に置くこと(今は出ない敵・§2-1)。
- ⛔ 専用の SFX(既存の `counter` を流用)。
- ⛔ ボールト `spells.md` の更新(「ファラクサスの SLA 対策」の記述 / ✅⬜)= 別 PC の宿題。
- ⛔ 店の通常の巻物の棚に並べる(uncommon は拾う呪文。#77 の方針どおり)。
- `実装依頼書/README.md` へ足す行(承認時に起草窓が足す):

    | 96 | [2026-10-18_counterspell.md](2026-10-18_counterspell.md) | **承認済** | 0% | カウンタースペル = 敵の詠唱を打ち消す魔法使いの反応呪文。⭐ 指輪の口 `tryReflectEnemySpell` の直後に 1 行差し込む(`enemyCastSpell` の 7 種だけ・ブレス/眼柄は対象外)/ ⚠ 割り込む時点で敵の陣は消えている ⇒ 新しく出して割る / ⚠ 打ち消さないときは乱数を引かない・狙いを見ない / ⚠ 判定は `hasSpellSlot` だけ(`equippedSkills` を見ない)/ ⚠ 枠は勝つたびに戻る(会議の前提の訂正)。撤退 `?counterspell=0` |

---

## 12. 実装結果

**ステータス: ✅ 完了(2026-10-20 実装窓・未 push)**。記録の詳細は `~/.claude/dev-loop/r96/notes96_item1.md` / `notes96_item2.md` / `notes96_item3.md`。

### 12-1. コミット

| commit | 内容 |
|---|---|
| `b7c9689` | 項目1 本番: カウンタースペル。`MAGE_SKILLS["counterspell"]`(arcane-eye の後)・巻物 `scroll-counterspell`(uncommon・`pickScrollId` の filter 末尾に撤退条件)・撤退 `?counterspell=0`(`isCounterspellOn`)・`tryReflectEnemySpell` の直後に `enemySpellMaxDamage` / `counterspellWanted` / `findCounterspeller` / `playCounterspellFx` / `tryCounterEnemySpell`・`enemyCastSpell` の指輪の行の直後に 1 行(指輪の呼び口は無改変)・CSS `.fxCastCircle--broken`(quick のときは輪・光の線・割れる陣・破片を省く)。`tavern.html` の写し(`MAGE_SKILLS_UI` / `SCROLL_CATALOG_TV` / 開発用の棚 + `isCounterspellOnTV`)+ changelog 1 行(§10 の文面どおり) |
| `51c9146` | 項目2: 新規受入 `tools/verify_counterspell.js`(port 10635・素も変異も同じ port を順に・純 LF) |
| 本節のコミット | 項目3: 母集団の非退行(全数走査)+ 変異アンカーの衝突 + 本節 + README の #96 行 |

### 12-2. 受入の色と秒

| 走行 | 色 | 秒 |
|---|---|---|
| `verify_counterspell` 素 | **25/25** ×4(項目2)+ 全数走査の中で 1 回 25/25 | 52〜53 |
| `verify_counterspell --negative` | **7/7** ×2(項目2)+ 全数走査の中で 1 回 7/7。noslot=(1b) / reach=(2d) / ringlast=(3a) / sleepcast=(2c) / rngdrift=(1a) / oldcircle=(4a) / leak=(5b)。巻き込みは noslot だけ = 「誰が唱えたか」を probe と枠の増減の両方で読むので、打ち消しを見る全節に出る自然な連鎖 | 371 |
| §8 の既存 golden 19 本(34 腕) | 項目1 で着手前(post95)と同色。`verify_run_chronicle` (0c) の HP を引く点は 45 のまま(言い直し不要)・`verify_cleric_spirits` の leak アンカー 1 hit のまま | — |
| 一時プローブ(コミットしない) | `r96/probe96.js` 12/12 ×2(1 回目の (c) 赤は測定器の誤り = 飛翔体の rAF 火の粉の乱数。「tryCounterEnemySpell の中で引いた回数」で測り直した) | — |

assert の中身(25 本・§8 の番号と 1 対 1):

| ラベル | 測ること(要点) |
|---|---|
| (0a) | getSkill / reactive=onEnemySpell / 巻物 uncommon / isSpellKnown / 主人公・仲間の枠に Lv3 で載り Lv2 で 0 |
| (0b) | 盤面: 届く(主人公 7・仲間 6 マス)/ 13 マス / 壁越し(本番 hasLineOfSight とドライバ自前の線分の両方で切れる床)を作れている |
| (0c) | 写し 3 枚(index / tavern / 巻物の行)が 1 行ずつで中身一致・酒場の autoCast・開発用の棚に 1 回 |
| (1a) | ファイアボルト 3 腕(カウンター無し / 枠 0 / 枠 2 で使う条件外)で被弾 14・乱数の総回数 6 が一致・**tryCounter の中で引いた回数 0**・枠 2/2 |
| (1b) | リッチのファイアボール: 被弾 0・主人公 2→1・仲間 2→2・probe 1 件。対照は被弾 48 |
| (1c) | シャター / スコーチングレイを全員満タンで打ち消す(対照 24 / 48) |
| (1d) | 最大値 12/13/24 をダイスの式から計算(本番 `enemySpellMaxDamage` と一致)。HP 13 → 打ち消さない / 12 → 打ち消す |
| (1e) | `enemyAttackTurn` 経由でも打ち消された詠唱のクールダウン 0→3 |
| (1f) | 順: 主人公 → allies の先頭 → 次 |
| (2a)〜(2e) | 枠 0 / 倒れている / 眠り・混乱など 7 状態 / 13 マス・壁越し / 暴君の殻と帯の上 = 唱えない、もう 1 人が唱える |
| (3a)〜(3d) | 指輪が先(5→4・tryCounter は呼ばれない)/ 指輪 0 回ならカウンター / ブレス・眼柄は対象外 |
| (4a)〜(4c) | 敵の足元に新しい陣 1 枚 + `.fxCastCircle--broken` 1 枚 + COUNTERED の札 / 語りは 1 回目だけ / 年代記の「使わなかった技」と HP を引く点 45(= `7ae53c7`) |
| (5a)〜(5c) | `?counterspell=0` で被弾 48・枠そのまま / 巻物の抽選に出ない / 酒場の棚から消える |
| (9a) | pageerror / console error 0 |

### 12-3. 母集団の非退行(全数走査)

- `index.html` / `tavern.html` = 全ページが踏むファイルなので全数。HEAD `51c9146` で **228 腕・667.4 分**(2.93 分/腕)= #95 の post95 の 226 腕(同順)+ `verify_counterspell` 素 / neg。直列・SKIP 再開型(2026-10-19 に 71 腕で窓が落ち、2026-10-20 00:02 に再開 → 09:14 完了)。git を読む本(29 腕)は `git clone --shared @51c9146`(本番と 935 ファイルのバイト差 0・再開前にも測り直した)で。8765 は走査中 LISTEN なし(post95 と同じ条件)。
- 結果: 緑 208 / 非緑 20。基準 post95(本番は `7ae53c7` と同一 = #96 の直前)と比べて **緑→赤 0**・赤→緑 0・両方非緑 20・新規 2 腕は緑。
- 両方非緑の 20 腕は FAIL 行を集合で突き合わせ、**20 腕とも中身が同じ**(`driver_mapdef_step1` (0b) は clone の commit の hash が違うだけ)。件数だけ一致して中身が入れ替わった腕は 0。
- 緑→赤が 0 なので、影のツリーとの対比較は不要だった ⇒ **#96 帰属の緑→赤 = 0**。
- 変異アンカー衝突: 全 tools 201 ファイルの文字列リテラル 53,938 個を `7ae53c7`→`51c9146` の 3 ファイルで数え直した。件数が変わった 607 組のうち「1 だった / 1 になった / 0→出現」は 21 組で、**21 組すべて `verify_counterspell` 自身**(変異アンカー・撤退スイッチ・呪文名・巻物 ID・CSS クラス名)⇒ **衝突 0**(項目1 の 43,020 行の走査とも一致)。

### 12-4. 崩れた主張・依頼書から変えた点(K 番号)

- **K1**(「既知の赤」`verify_lore_check` (1j)): #95 K8 は「並列負荷でだけ揺れる・直列では緑」としたが、項目1 の機械では**直列でも揺れた**。`7ae53c7` の木(#96 無し)と実装後の木で素を交互 6 回ずつ ⇒ 着手前 赤 4/6・実装後 赤 1/6。--negative の担当外の赤 11 件もすべて (1j) で変異名は毎回違う ⇒ **#96 非帰属**(#96 のコードは `enemyCastSpell` の中でしか走らず、(1j) の合流判定は敵の詠唱を通らない)。全数走査の 1 回は素 26/26・neg 12/12 で緑。
- **K2**(申し送り「`enemyAttackTurn` 経由のクールダウンは未確認」): 呼び口が await の後でクールダウンを立てるので、打ち消されても 3 = 本番の欠陥なし。(1e) で固定した。
- **K3**(受入の測り方): 「乱数を引かない」を Math.random の総回数で測ると、飛翔体の絵(`spawnFireballProjectile` の毎フレームの火の粉)で ±1 揺れて偽の赤になる ⇒ 飛翔体を即解決に差し替え + 「tryCounterEnemySpell の中で引いた回数 = 0」で測った。
- **K4**(年代記): 主人公の行は `equippedSkills` に counterspell が無いと「使わなかった技」に載らない(枠と装備技は別物 = 罠 C の写し)。(4c) の主人公の腕は `equippedSkills` に入れて測った。
- 本番の欠陥: なし。

### 12-5. 別チケット候補

- `verify_lore_check` (1j) の乱数回数の assert が直列でも揺れる(K1)。測る窓の中に裏のループ(rAF / setInterval)の乱数が混ざっている疑い。余分な引きに頑丈な測り方へ。
- 打ち消した回数を「戦いの記録」(#37)に出す欄(§11)。
- #95 から持ち越し: `spellAtkBonus` の INT → WIS / カエルムの能力値 / 頭の僧侶の装備スキルの出所 / 唱えた手番の乱数の消費数の揺れ / `driver_action_priority --negative` N3 のアンカー腐り / `driver_grid_p8` (6d)(#62 以来の赤・今回も同じ中身)。
- §11 の保留: ブレス・眼柄などの打ち消し(ユーザー決定で対象外)/ 専用の SFX / ボールト `spells.md` の更新(別 PC の宿題)。

### 12-6. 残り

- **§9 実機の確認**(開発モード `tavern.html?dev=1` で巻物を 1G で買い、酒場で読み、枠を 1〜2 個割り当てる): 砦(オーク呪術師)や神殿(リッチ)で「打ち消した」が片手で見て分かるか / リッチ戦で破片の演出がフレームを落とさないか(iPhone)/ 出る頻度(少なすぎないか・ボスの前に空にならないか)/ 「暴君の火球は消せない」が不具合に見えないか。
- 次の新規ドライバ base = **10636**。
