# #78 透明化(インビジビリティ)— 忍べない編成でも、魔法使いが姿を消して不意打ちを狙う

- **起草**: 2026-09-30(計画窓 = 起草窓) / **ステータス**: **承認済**(2026-09-30 ユーザー承認)
- **着手**: 実装窓は**窓更新を挟んでから**着手する(2026-09-28 の恒久ルール)
- **触るファイル**: `index.html`(呪文の定義・巻物の表・詠唱・半透明・撤退)/ `tavern.html`(呪文の鏡・巻物の表・傾向の候補・開発用 1G 陳列・changelog)/ `tools/verify_invisibility.js`(新規)/ `tools/verify_scroll_shelf.js`(固定件数の言い直しだけ)
- ⛔ **触らないファイル**: `js/skill-check.js`(有利は付けない = §1 のユーザー決定)/ ほかの `js/*` / `audio.js` / `town.html` / `world.html` / `title.html`。
  §2-7 で**開く必要が無い**ことを確認済み。
- 並走: 実装窓は #77 完了後で待機中。作業ツリーは clean(2026-09-30 `git status --short` = 0 行・HEAD `bb79124`)。
  それでも作法は守る: `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

盗賊がいない編成、またはエルフの外套を持つ者がいない編成では、戦闘の始まりの「隠密の接近」(不意打ち)が**判定ごと出ない**(`index.html` `tryStealthSurprise`)。
「敵の様子を探る魔法」シリーズ(会議 `dev-meetings/2026-09-28_scouting-magic.md` 第2段 + 計画書の修正 2)の B として、
5e SRD の呪文 **Invisibility(インビジビリティ = 透明化・2 レベル)** を魔法使いに足す。
唱えると一行の姿が揺らいで消え、**忍べない編成でも隠密判定を振れる**ようになる。
成功した時の効果は、今の不意打ち(`applySurpriseStun` = ボス以外の敵の初手を封じる)をそのまま使う。

呪文は**巻物で拾って覚える**(珍しい = uncommon・店では売らない)。試遊で見られるよう、**開発モードのときだけ武器防具屋の巻物の棚に 1G で並べる**。

**ユーザー決定**:

- 2026-09-28(会議の決裁): 透明化は呪文の枠を消費してよい / 巻物で拾う・uncommon・拾うだけ / 開発用の 1G 陳列あり。
- 2026-09-30(本起草時):
  - **有利(2d20 の高い方)は付けない**。透明化は「盗賊か外套がいる時だけ」の条件を外すだけ。
    ⭐ 不採用: 有利を付ける(会議の第2段の案)。§2-3 の計算のとおり、有利を付けると DC 12〜16(S1〜S4)で**盗賊入りより成功率が高くなり**、
    同じ会議のリスク欄「成功率は盗賊より下」と両立しない。有利の仕組み自体もこのコードに無い(`index.html:20651` のコメント)。
  - **盗賊か外套がいる編成では唱えない**。有利が無いので、唱えても判定は何も変わらず枠が減るだけになるため。
    ⭐ 不採用: 「毎回唱える(演出だけ)」/「固定 +2 を付けて唱える」(+2 だとエルフ入り・盗賊なしで盗賊入りと同率になり、「盗賊より下」が崩れる)。

---

## 2. 着手前の実測(HEAD `bb79124`・2026-09-30)

### 2-1. 会議・引き継ぎメモの前提のうち、崩れていた/補足が要るもの

| # | 前提 | 実測 |
|---|---|---|
| 1 | 「判定に有利を付ける」(会議 第2段) | **有利の仕組みはコードに無い**。`js/skill-check.js` の振り方は `d20()` 1 回だけ(`:416` パネル / `:483` オート)。`index.html:20651` にも「SRD の有利/不利はこのコードベースに機構が無い」。⇒ ユーザー決定で**付けない**。`js/skill-check.js` は触らない |
| 2 | 「透明化の成功率は盗賊より下」(会議 リスク欄) | 有利を付けると S1〜S4 で**盗賊より上**(§2-3)。付けなければ全 DC で下 ⇒ 受入 (2b) で数値として固定する |
| 3 | 「唱えれば条件が外れる」 | 条件は `tryStealthSurprise` の `canSneak`(`index.html:25414〜25417`)の 1 か所。**盗賊か外套がいれば透明化は要らない** ⇒ 唱えるのは `canSneak` が偽のときだけ(ユーザー決定) |
| 4 | 「呪文の定義は 2 ファイル」(会議) | 呪文 = `index.html` `MAGE_SKILLS`(`:22205〜22265`)と `tavern.html` `MAGE_SKILLS_UI`(`:4490〜4502`)。巻物 = `index.html` `SCROLL_CATALOG`(`:13569〜13590`)と `tavern.html` `SCROLL_CATALOG_TV`(`:5345〜5363`)。**魔法使いの呪文 ID の写しはこの 2 ファイルだけ**(`"ice-storm"` を全ページ・`js/` で grep = `index.html` 12 行 + `tavern.html` 2 行・他 0) |
| 5 | (暗黙)覚えれば NPC の魔法使いも使う | **枠を配らないと使わない**。魔法使い・エルフは**自由配分**で、枠は酒場の配分(`partySkills.mage`)から配られる(`index.html:35415` `hasPreset ? heroMap : defaultCasterMap`)。職業のプリセットは NPC の魔法使いにも効く。プリセットが無い NPC は `CLASS_DEFS.mage.defaultSkills`(固定リスト)⇒ 透明化は入らない。⇒ **既存の作法どおり、マッチング画面の引き出しで枠を置いてもらう**(ファイアボール等と同じ)。⛔ `defaultSkills` に足さない(#54 の並び順が枠の配分を決めている = `index.html:22107〜22115`) |
| 6 | 「半透明は `globalAlpha` のみ」(会議の iOS 検証項目) | 仲間と主人公は **canvas でなく DOM**(`#player` = `:3175`、仲間 = `createAllyDom` `:14073` の `div`)。`globalAlpha` の出番は無い ⇒ CSS の `opacity` アニメーション(§2-2 罠B) |
| 7 | 「B/C の巻物は棚に並ばない」(#77) | 正しい。棚は `rarity === "common"` から導く(`tavern.html:6853〜6856`)。開発用陳列は**別の集合**で足す(§2-2 罠D) |

### 2-2. ⚠⚠⚠ 見つけた設計上の罠(すべて §8 の変異に内蔵する)

**罠A — 主人公の枠は `consumeSpellSlot("player", id)` でしか減らない。**

```js
// index.html:13971 — "player" という文字列のときだけ主人公の枠 (currentSpellSlots) を返す
function getSpellSlotsRef(unit) {
  if (unit === "player" || (unit && unit === window)) { return currentSpellSlots ...; }
  return (unit && unit.spellSlots) || null;
}
```

演出のために `makeLeaderActor()`(`:19819`)の戻り値を術者として持ち回し、それをそのまま `consumeSpellSlot(actor, …)` に渡すと、
`actor.spellSlots` は無いので `null` ⇒ **false が返るだけで枠が減らない**(主人公が魔法使いのときだけ唱え放題になる)。
⇒ 枠の確認と消費は `"player"`、演出(`dfPlayCast`)には `makeLeaderActor()`、と**役割で分ける**。
⭐ 変異 `leaderref`(主人公の枠を actor で消費する)。(1f) で赤くなる。

**罠B — 主人公の `style.opacity` は 10 か所が書き戻す。インラインで半透明にすると被弾の点滅で消える。**

`player.style.opacity = …` は `applyNormalPlayerVisual`(`:15917` `:15923` `:15928`)・ガードの点滅(`:15969` `:15972`)・被弾の点滅(`:16003` `:16006`)ほか `:17776` `:19789` `:33196` `:33280` `:34913` で書かれる。
インラインで `0.5` にしても、次の `applyNormalPlayerVisual()` で `1` に戻る。
⇒ **CSS のクラス + `@keyframes` の `opacity`** で揺らす。CSS アニメーションの値はインラインの宣言(`!important` なし)より強いので、書き戻しに負けない。
`#player` と `.ally` には既存の `animation` が無い(`index.html:125〜144` / `:241〜246`・`className =` での上書きも 0 件)⇒ 衝突しない。
⭐ 変異 `inlineopacity`(クラスでなく `el.style.opacity = "0.5"`)。(3a) の「`applyNormalPlayerVisual()` の後も不透明度 < 1」で赤くなる。

**罠C — 半透明を外し忘れると、次の戦闘までずっと透けている。**

隠密判定は `SkillCheck.resolveSkillCheck` を待つ(パネルは 2 秒 + 結果 3.6 秒)。この間の例外や、判定を返さない経路(`res === null`)でも外れるように、
**`try { … } finally { setPartyInvisible(false) }`** で包む。
⭐ 変異 `nofinally`(成功の枝でだけ外す)。(3b) の「判定が失敗・例外でもクラスが残らない」で赤くなる。

**罠D — 開発用の旗を巻物の表の行に足すと、#77 の受入が壊れる。**

```js
// tools/verify_scroll_shelf.js:107 — 表の行を rarity で閉じる正規表現で引く
/"([a-z0-9-]+)":\s*\{\s*name:\s*"([^"]+)",\s*spellId:\s*"([^"]+)",\s*classKey:\s*"([a-z]+)",\s*rarity:\s*"([a-z]+)"\s*\}/g
```

`SCROLL_CATALOG_TV` の行に `devShelf: true` を足すと、その行だけ正規表現に掛からず (0a)「ページの表と全件一致」が赤くなる。
両ファイルの表の行の形もそろわなくなる(#77 §11 の目安「`c.devShelf`」はこれを見ていなかった)。
⇒ **表の外に集合を置く**: `const SCROLL_DEV_SHELF_TV = ["scroll-invisibility"];`(C で魔法の眼を 1 語足す)。表の行の形は 2 ファイルとも今のまま。
⭐ 変異 `leakdev`(開発モードでなくても開発用の集合を並べる)。(5b) で赤くなる。

**罠E — 棚の絞り込みの行を書き換えると、#77 の受入の変異が exit 3 で止まる。**

`verify_scroll_shelf.js:163〜175` の変異 `allrarity` / `idlist` は、次の 2 つの文字列が `tavern.html` に**ちょうど 1 回**あることをアンカーにしている:
`.filter(id => SCROLL_CATALOG_TV[id].rarity === "common")` と
`    return Object.keys(SCROLL_CATALOG_TV).filter(id => SCROLL_CATALOG_TV[id].rarity === "common");`
⇒ `scrollShelfIds` の**既存の行は 1 バイトも変えず**、開発用の分は `if (DF_DEV_MAGIC_SHOP) return scrollShelfIdsDev();` の 1 行を**前に挟む**。
`scrollShelfIdsDev` の中では上の文字列を**使わない**(`for` で書く = §5-2)。使うとアンカーが 2 回になり exit 3。

**罠F — 戦闘中に AI が透明化を「呪文」として拾う経路。**

主人公の技の候補(`index.html:32836` 付近)と「先出し」(`apTryPreferred` `:32474`)は、`sk.outOfCombat` を持つ技を外す。
仲間の魔法使い(`mageAI` `:30538`)は呪文を**名指し**で選ぶので拾わない。`executeSkillOn` の魔法使いの枝(`:19996〜20008`)も名指し ⇒ `false`。
⇒ 定義に **`outOfCombat: true`** を付ければ、戦闘中に唱えて枠を溶かす経路は無い。
⭐ 変異 `nooutofcombat`(旗を外す)。(4a)「傾向に指定しても `apTryPreferred` が唱えない」で赤くなる。
⚠ 酒場の「傾向」の候補(`tavern.html:7969` / `:9238` の `equippedIds.slice()`)には、枠を置くと透明化が出てしまう(選んでも何も起きない)⇒ §5-3 で外す。

### 2-3. 成功率の計算(有利の有無 — ユーザー決定の根拠)

- 能力値 = `js/abilities.js:41〜48`(盗賊 DEX 15 = +2 / エルフ DEX 14 = +2 / 戦士・魔法使い DEX 11 = 0 / 僧侶・ドワーフ DEX 9 = −1)。
- 隠密の習熟 +2 は盗賊だけ(`js/skill-check.js:57〜64`)。代表 = 最高の者、手伝い +2 = 2 人以上なら必ず 1 人分(`:459〜470`)。**#61 以降は常に 4 人** ⇒ 手伝いは常に付く。
- 1〜20 の出目で数えた(20 は常に成功・1 は常に失敗 = `computeOutcome` `:172`)。DC = 各シナリオの `perceptionDC`(`index.html:10863〜10975` の 12 / 14 / 15 / 16 / 18 / 20)。

| DC | 盗賊入り(+6) | 透明化・エルフなし(+2) | 透明化・エルフ入り(+4) | (不採用)有利・エルフなし | (不採用)有利・エルフ入り |
|---|---|---|---|---|---|
| 12 | 75% | 55% | 65% | 79.8% | 87.8% |
| 14 | 65% | 45% | 55% | 69.8% | 79.8% |
| 15 | 60% | 40% | 50% | 64.0% | 75.0% |
| 16 | 55% | 35% | 45% | 57.8% | 69.8% |
| 18 | 45% | 25% | 35% | 43.8% | 57.8% |
| 20 | 35% | 15% | 25% | 27.8% | 43.8% |

採用の 2 列は**全 DC で盗賊入りより下**。

**計測コマンド**(再測定するとき):

    py - <<'EOF'
    def p(b,dc): return sum(1 for r in range(1,21) if r==20 or (r!=1 and r+b>=dc))/20
    for dc in (12,14,15,16,18,20): print(dc, p(6,dc), p(2,dc), p(4,dc), round(1-(1-p(2,dc))**2,3), round(1-(1-p(4,dc))**2,3))
    EOF
    grep -n "perceptionDC: [0-9]" index.html | head -6          # → 10863/10880/10908/10930/10955/10975
    grep -n "advantage\|有利" index.html js/*.js tavern.html      # → index.html:20651 のコメント 1 行だけ

### 2-4. 呪文と巻物の値

| 対象 | 実測 | → 採用値 |
|---|---|---|
| 呪文の名前 | 実在の SRD 呪文はカタカナ音写(スリープ / ファイアボール … の作法) | 呪文 **「インビジビリティ」**・巻物 **「巻物・インビジビリティ」**。説明文で「透明化」と書く |
| 習得 Lv | 5e の魔法使いは 2 レベル呪文を **Lv3** で覚える。既存 `levelReq` は fireball / lightning-bolt = 3・cone-of-cold = 5・ice-storm = 7(`index.html:22236〜22265`) | **`levelReq: 3`**(2 ファイルとも)。⚠ Lv1〜2 の魔法使いには枠を置けない(引き出しは `[Lv3 必要]` を出す = `renderSpellSlotItem` `tavern.html:7627`) |
| `mpCost` | 呪文の目印(`hasSpellSlot` を見る条件・`defaultCasterMap` の `mpCost > 0`・`restoreLowestSlot` の順位 `levelReq*1000+mpCost`) | **5**(順位 3005 = lightning-bolt 3006 の前) |
| 巻物の珍しさ | uncommon は今 **7 種**(ファイアボール / ライトニングボルト / キュアモデレート / ストライキング / コードンオブアロー / ライトニングアロー / ヘイスト) | uncommon。⇒ **8 種**になり、uncommon を引いたときの 1 種あたりの確率は 1/7 → 1/8 |
| 拾う口 | 宝箱 `index.html:24126`(common 55 / uncommon 35 / rare 10)/ ボス `:13708`(15 / 50 / 35)/ 隠し要素 `:13707`(0 / 30 / 70)。**全部 `pickScrollId` の 1 関数**(`:13688`) | 表に足せば 3 つの口すべてで自動的に出る。口は触らない |
| 開発用の 1G | `DF_DEV_MAGIC_SHOP = !!window.__dfDevMode`(`tavern.html:5020`)。`?dev=1` で `localStorage` `df.devMode` に焼く(`:2866〜2876`) | 開発モードのときだけ棚に並べ、**1G**。common 4 種は開発モードでも 80G のまま |

**計測コマンド**:

    grep -n 'rarity: "uncommon"' index.html tavern.html | wc -l      # → 14 (= 7 × 2)
    grep -n "function pickScrollId\|pickScrollId(" index.html
    grep -n "const DF_DEV_MAGIC_SHOP\|window.__dfDevMode = on" tavern.html

### 2-5. 既存の検証のうち、隠密・巻物・呪文表に触れる本

| 本 | 触れ方 | 影響 |
|---|---|---|
| `tools/verify_scroll_shelf.js` | (0a)「全 **17** 件・common 4 件」・(1b)「uncommon / rare **13** 件」を**固定値**で持つ(`:369` `:389`) | **腐る**(18 / 14 になる)⇒ §6 で言い直す(#77 §12-4 の申し送り) |
| `tools/driver_sce1_events.js` | V4b(`:1334〜1352`)が**盗賊を足してから** `tryStealthSurprise` を直接呼ぶ | 盗賊がいる ⇒ 透明化の枝に入らない。無風のはず |
| `tools/verify_lore_check.js` | `window.tryStealthSurprise` を差し替えて到達だけ見る(`:511〜517`) | 関数名を変えなければ無風 |
| `tools/verify_enemy_traits.js` | `applySurpriseStun` を直接呼ぶ(`:376`) | 付与点は変えない ⇒ 無風 |
| `tools/driver_action_priority.js` | アンカー `const equippedIds = apEquippedIdsFor(slot, classKey);`(`:172`)・(0b) が `AP_TRAVEL_CASTABLE` と `TRAVEL_CASTABLE_IDS` を突き合わせる | アンカーの行は変えない。道中の集合に透明化を**足さない** ⇒ 無風 |
| `tools/verify_party_match_setup.js` | 傾向の行の候補を `eq.filter(…TRAVEL_CASTABLE_IDS…)` から期待する(`:1021`) | 透明化に枠を置かない編成だけを見る ⇒ 無風のはず |
| `tools/driver_dev_gate2.js` | `const DF_DEV_MAGIC_SHOP = !!window.__dfDevMode;` の行を正規表現で読む(`:450`) | その行は変えない ⇒ 無風 |

⚠ `tryStealthSurprise` の**盗賊なしの枝**(`if (!canSneak) return false;` の先)を測る本は **0 本**(`grep -lF "if (!canSneak) return false;" tools/*.js` = 0)。本チケットの新規受入が最初の golden になる。

### 2-6. ポート

`tools/` `scripts/` の 5 桁ポートの最大 = **10492**(`verify_scroll_shelf` の変異)⇒ 本チケットの base = **10493**、変異は 10494〜。

    grep -ohE "\b10[4-5][0-9]{2}\b" tools/*.js | sort -n | uniq | tail -3     # → 10483 / 10484 / 10492

### 2-7. 触る範囲と changelog の要否

- `index.html` と `tavern.html`。`js/skill-check.js` は**触らない**(有利なし)。`audio.js` は触らない(詠唱の効果音は `dfPlayCast` の既存の演出に任せる)。
- `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。プレイヤー向けの要約は実在する(新しい呪文と巻物)。文面は §10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `MAGE_SKILLS` に `invisibility`(§4-1)/ `SCROLL_CATALOG` に 1 行(§4-2)/ `pickScrollId` の撤退(§4-2)/ CSS の揺らぎ(§4-3)/ `tryCastInvisibility` + `setPartyInvisible` + `tryStealthSurprise` の枝(§4-4) |
| `tavern.html` | `MAGE_SKILLS_UI` に 1 行 / `SCROLL_CATALOG_TV` に 1 行 / 傾向の候補から外す 2 か所 / 開発用 1G 陳列(§5)/ changelog 1 行 |
| `tools/verify_invisibility.js`(新規) | 受入(§8)。base ポート **10493**、変異は 10494〜 |
| `tools/verify_scroll_shelf.js` | (0a)(1b) の固定値 17 / 13 の言い直しだけ(§6) |

⛔ `js/skill-check.js` / `applySurpriseStun` / `buildPerceptionParty` / `defaultCasterMap` / `CLASS_DEFS.mage.defaultSkills` / `AP_TRAVEL_CASTABLE` / `TRAVEL_CASTABLE_IDS` / `SCROLL_SHELF_PRICE` / `DF_DEV_MAGIC_SHOP` の行は **1 バイトも変えない**。

---

## 4. STEP1 — `index.html`

### 4-1. 呪文の定義(`MAGE_SKILLS` の `"ice-storm"` の後 = `:22265` の `},` の直後)

```js
      /* ★[#78] インビジビリティ (透明化・5e SRD の 2 レベル呪文)。戦闘の始まりに tryStealthSurprise の中で
       *   「盗賊も外套も居ない」ときだけ自動で唱える (tryCastInvisibility)。効果 = 隠密の接近の条件を外すだけ。
       *   ⛔ 有利は付けない (ユーザー決定 2026-09-30: 付けると S1〜S4 で盗賊より成功率が高くなる)。
       * ⭐ outOfCombat: true —— 主人公の技の候補と apTryPreferred がこの旗で外す。mageAI / executeSkillOn は名指しなので拾わない。
       * ⛔ AP_TRAVEL_CASTABLE には足さない (道中に唱える呪文ではない)。
       * ⚠⚠ tavern.html の MAGE_SKILLS_UI と二重定義 (levelReq / mpCost をそろえる)。 */
      "invisibility": {
        name: "インビジビリティ", category: "utility", target: "party",
        range: "self", outOfCombat: true,
        mpCost: 5, levelReq: 3,
        flavor: "戦闘の始まりに一行の姿を消して忍び寄る (盗賊・外套が居ない時だけ自動で唱える)",
      },
```

### 4-2. 巻物の表と撤退

- `SCROLL_CATALOG` の `"scroll-lightning-bolt"` の行(`:13574`)の直後に、**同じ形の 1 行**:

```js
      "scroll-invisibility":   { name: "巻物・インビジビリティ",    spellId: "invisibility",         classKey: "mage",   rarity: "uncommon" },
```

- 撤退スイッチの判定関数(`isMageSleepOn` `:13612` と同じ作法 = 関数にする。TDZ 回避):

```js
    /* ★[#78] 撤退スイッチ ?invis=0 — 透明化を唱えない + 巻物を拾わない (uncommon の抽選を 7 種へ戻す)。
     * ⚠ 各ページが独立に読む (遷移はまたがない)。tavern.html は isInvisOnTV で開発用の陳列だけ止める。 */
    function isInvisOn() {
      try { return new URLSearchParams(window.location.search).get("invis") !== "0"; }
      catch (e) { return true; }
    }
```

- `pickScrollId`(`:13696` の `let pool = …`)の絞り込みに `&& (isInvisOn() || id !== "scroll-invisibility")` を足す。
  ⭐ 撤退時の抽選が #78 以前と同じ集合になる(受入 (6b))。

### 4-3. 半透明の揺らぎ(CSS。`#player` / `.ally` の規則の近く、`</style>` `:3008` より前)

```css
    /* ★[#78] 透明化中の揺らぎ。⭐ インラインの style.opacity でなくアニメーションにする ——
       主人公の opacity は被弾・ガードの点滅と applyNormalPlayerVisual が 10 か所で書き戻す (依頼書 §2-2 罠B)。
       アニメーションの値はインライン (非 !important) より強いので書き戻しに負けない。 */
    @keyframes dfInvisShimmer {
      0%, 100% { opacity: 0.30; }
      50%      { opacity: 0.55; }
    }
    .dfInvis { animation: dfInvisShimmer 1.4s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      .dfInvis { animation: none; opacity: 0.45 !important; }
    }
```

- ⚠ 値(0.30 / 0.55 / 1.4s)は §9 の実機で目で動かしてよい(§8「測らないこと」)。

### 4-4. 詠唱と隠密の接近(`tryStealthSurprise` `:25404` の直前に 2 関数、本体は 1 か所だけ変える)

```js
    /* ★[#78] 透明化の半透明を一行 (主人公 + 生きている仲間) に付け外しする。 */
    function setPartyInvisible(on) {
      const els = [];
      if (typeof player !== "undefined" && player) els.push(player);
      for (const a of allies) if (a && a.el) els.push(a.el);
      for (const el of els) el.classList.toggle("dfInvis", !!on);
    }
    /* ★[#78] 透明化を唱える。唱えた術者の名前を返す (唱えなければ null)。
     * ⭐ 順 = 主人公 → 仲間 (buildPerceptionParty と同じ並び)。枠が残っている最初の魔法使いが唱える。
     * ⚠⚠ 主人公の枠は consumeSpellSlot("player", …) でしか減らない (依頼書 §2-2 罠A)。
     *   makeLeaderActor() は演出 (dfPlayCast) にだけ使う。 */
    async function tryCastInvisibility() {
      if (!isInvisOn()) return null;
      const ID = "invisibility";
      let unit = null, actor = null, name = null;
      if (hp > 0 && !gameOver && leaderClassKey === "mage" && hasSpellSlot("player", ID)) {
        unit = "player"; actor = makeLeaderActor(); name = getLeaderName();
      } else {
        for (const a of allies) {
          if (a && a.alive && a.classKey === "mage" && hasSpellSlot(a, ID)) {
            unit = a; actor = a; name = a.npcName || (a.def && a.def.name) || "魔法使い"; break;
          }
        }
      }
      if (!unit) return null;
      if (!consumeSpellSlot(unit, ID)) return null;
      const sk = MAGE_SKILLS[ID];
      await dfPlayCast(actor, { name: sk.name, element: "arcane" }, { duration: 1200 });
      setPartyInvisible(true);
      showBanner("🫥 " + sk.name + "!", 1300);
      updateInfo(`${name} が ${sk.name} を唱えた — 一行の姿が揺らぎ、闇に溶けていく`);
      return name;
    }
```

`tryStealthSurprise` の本体(`:25414〜25442`)は次の形に変える。**変えるのは `if (!canSneak) return false;` の 1 行と、その後ろを `try/finally` で包むことだけ**:

```js
      if (!canSneak) {
        // ★[#78] 忍べない編成だけ透明化を唱える (盗賊・外套が居れば唱えない = ユーザー決定)。
        //   ⛔ 有利は付けない —— 下の resolveSkillCheck の引数は透明化の有無で数値に響くキーを変えない。
        invisCaster = await tryCastInvisibility();
        if (!invisCaster) return false;                     // 従来どおり: 隠密無縁の PT は判定を出さない
      }
      try {
        …(既存の const dc 〜 return false まで。flavor だけ invisCaster のとき「姿を消したまま、敵の死角へ忍び寄る…」)…
      } finally {
        if (invisCaster) setPartyInvisible(false);          // ⚠ 失敗・例外・null でも必ず外す (罠C)
      }
```

- `let invisCaster = null;` は関数の先頭(`canSneak` の計算より前)で宣言する。
- ⛔ `targets.length === 0`(ボスだけ)と `!party.length` の早期 return は**透明化より前**のまま = ボスだけの戦闘では唱えない(枠を使わない)。
- ⛔ `resolveSkillCheck` の `extraBonus` を足さない。`title` / `voiceIds` も変えない(受入 (2a))。

---

## 5. STEP2 — `tavern.html`

### 5-1. 呪文の鏡と巻物の表

- `MAGE_SKILLS_UI` の `ice-storm` の行(`:4501`)の直後:

```js
    // ★[#78] インビジビリティ (index.html MAGE_SKILLS と同期)。autoCast = 戦闘の始まりに自動で唱える (傾向の候補に出さない)。
    { id: "invisibility",   name: "インビジビリティ", category: "補助", range: "self", mpCost: 5, levelReq: 3, autoCast: true, flavor: "戦闘の始まりに一行の姿を消して忍び寄る (盗賊・外套が居ない時だけ自動)" },
```

- ⚠ `?drawerlv=0` の撤退(`:4538〜4542`)は fireball / lightning-bolt / cone-of-cold の 3 行だけ `levelReq` を外す。**透明化は足さない**(#72 以前に存在しなかった呪文なので、戻す姿が無い)。
- `SCROLL_CATALOG_TV` の `"scroll-lightning-bolt"` の行(`:5349`)の直後に、`index.html` と**同じ 1 行**(インデントだけ違う)。

### 5-2. 開発用 1G 陳列(`scrollShelfIds` `:6853` の周り)

```js
  /* ★[#78] 開発用の陳列 —— 拾うだけの巻物 (uncommon / rare) を、開発モードのときだけ棚に 1G で並べる。
   * ⚠⚠ 旗を SCROLL_CATALOG_TV の行に足さない —— tools/verify_scroll_shelf.js の正規表現が行を
   *   rarity で閉じるので、その行だけ読めなくなる (依頼書 §2-2 罠D)。C (魔法の眼) はここへ 1 語足す。 */
  const SCROLL_DEV_SHELF_TV = ["scroll-invisibility"];
  function isInvisOnTV() {
    try { return new URLSearchParams(location.search).get("invis") !== "0"; }
    catch (e) { return true; }
  }
  function scrollShelfIdsDev() {
    // ⛔ ここで .filter(id => SCROLL_CATALOG_TV[id].rarity === "common") を書かない
    //   (#77 の変異アンカーが 2 回になり verify_scroll_shelf が exit 3 = 罠E)。
    const out = [];
    for (const id of Object.keys(SCROLL_CATALOG_TV)) {
      const c = SCROLL_CATALOG_TV[id];
      const dev = SCROLL_DEV_SHELF_TV.indexOf(id) >= 0 && (id !== "scroll-invisibility" || isInvisOnTV());
      if (c.rarity === "common" || dev) out.push(id);
    }
    return out;
  }
  function scrollShelfPrice(id) {
    return (DF_DEV_MAGIC_SHOP && SCROLL_DEV_SHELF_TV.indexOf(id) >= 0) ? 1 : SCROLL_SHELF_PRICE;
  }
```

- `scrollShelfIds` は **既存の 3 行をそのまま**にして、`if (!isScrollShopOnTV()) return [];` の直後に 1 行だけ挟む:
  `    if (DF_DEV_MAGIC_SHOP) return scrollShelfIdsDev();   // ★[#78] 開発モードだけ拾う巻物も並べる`
- `dfShopBuyScroll` の `SCROLL_SHELF_PRICE` 3 か所(金貨の比較・引き算・戻り値の `price`)を `scrollShelfPrice(id)` へ。
- `renderShop` の巻物の群の `canBuy` と `購入 ${SCROLL_SHELF_PRICE}G` を `scrollShelfPrice(id)` へ。
- ⛔ `const SCROLL_SHELF_PRICE = 80;` の行は変えない(`verify_scroll_shelf.js:120` が読む)。
- ⭐ 棚の並びは表の並び ⇒ 開発モードでは スリープ → バーニングハンズ → **インビジビリティ** → ブレス → ヘイルオブソーン。

### 5-3. 傾向の候補から外す(`:7969` と `:9238`)

2 か所の `: equippedIds.slice();` を `: equippedIds.filter(id => !isAutoCastSkillTV(slot, id));` へ。関数は 1 つ:

```js
  /* ★[#78] 自動で唱える呪文 (autoCast) は傾向の候補に出さない —— 選んでも戦闘中は唱えない (index.html outOfCombat)。 */
  function isAutoCastSkillTV(slot, id) {
    const hit = (slot.skillPool || []).find(sk => sk.id === id);
    return !!(hit && hit.autoCast);
  }
```

- ⛔ `const equippedIds = apEquippedIdsFor(slot, classKey);` の 2 行は変えない(`driver_action_priority.js:172` のアンカー)。
- ⛔ `apEquippedIdsFor` 本体は変えない(カードの「技」行は透明化を**出す** = 枠を置いたことが見える)。

---

## 6. STEP3 — `tools/verify_scroll_shelf.js` の言い直し(#77 §12-4 の申し送り)

- (0a) `DRV_CAT.length === 17` を **`DRV_CAT.length === DRV_COMMON.length + DRV_OTHER.length && DRV_OTHER.length >= 13`** へ。common 4 件・ページの表と全件一致はそのまま。
- (1b) `DRV_OTHER.length === 13` を **`DRV_OTHER.length >= 13`** へ。「棚に 1 件も無い」の中身はそのまま(開発モードでないので透明化も並ばない = 正しく緑)。
- 表示の文言「全 17 件」「13 件」を件数の変数へ。
- ⛔ `--update-golden` 的に「18 / 14」へ書き換えるだけにしない(common が増えたのか uncommon が増えたのか見分けられなくなる = #77 §12-4)。**common は 4 件で固定**のまま。
- 変異 8 本のアンカーは §5-2 のとおり変えていないので、そのまま通るはず。**`--negative` 8/8 を必ず確かめる**。

---

## 7. 撤退スイッチ

- **`?invis=0`** — `index.html`: 透明化を唱えない(忍べない編成は従来どおり判定を出さない)・巻物を抽選しない(uncommon 7 種)。
  `tavern.html`: 開発用の陳列に透明化を出さない。
- ⚠ 判定位置 = `index.html` `isInvisOn()` / `tavern.html` `isInvisOnTV()` の各 1 か所。**ページ遷移はまたがない**(`?heromark=0` と同じ流儀 = 各ページを直接開いて確かめる)。
- ⚠ 撤退しても、既に覚えた呪文と置いた枠は残る(効き目が無いだけ)。表の行も残す(2 ファイルの同期を崩さないため)。

---

## 8. 受入条件 — `tools/verify_invisibility.js`(新規・base ポート **10493**、変異は 10494〜)

`index.html?autoplay=…` を開き、`page.evaluate` で**編成・枠・交戦中の敵を直接組んで** `tryStealthSurprise()` を呼ぶ(`driver_sce1_events.js:1334〜1352` の V4b が先例)。
`SkillCheck.resolveSkillCheck` は差し替えて**引数を控え、成否を決め打ち**する(元へ戻すのを忘れない)。酒場は `tavern.html` を別に開いて `__equipTV` と DOM を見る。
⭐ 呪文と巻物の値は**ドライバ側でもソースから正規表現で引き**、ページの答えと突き合わせる(片方の写経にしない)。サーバと起動は `verify_scroll_shelf.js` の写経でよい。

### §0 装置(母集団を先に確かめる)

- **(0a)** ソース 2 ファイルの巻物の表に `scroll-invisibility` が**同じ中身**(name / spellId / classKey / rarity = uncommon)で 1 行ずつ。呪文の定義 2 つ(`MAGE_SKILLS` / `MAGE_SKILLS_UI`)の `levelReq` と `mpCost` が一致。
- **(0b)** 差し替えた `resolveSkillCheck` が (1a) で **1 回以上呼ばれた**。`tryStealthSurprise` / `tryCastInvisibility` / `setPartyInvisible` が関数として在る。
  ⭐ **これが無いと全 assert が空振りで永久緑になる。**
- **(0c)** 全ページ起動で pageerror 0(#77 の K6 = 構文崩れの偽検出を見分ける)。

### §1 唱える条件

- **(1a)** 盗賊も外套も居ない編成(戦士 + 魔法使い + 僧侶 + ドワーフ)・魔法使いの仲間に透明化の枠 1・非ボスの敵 2 体 ⇒ 判定が「隠密」で 1 回呼ばれ、枠 1 → **0**、ログに呪文名。成功を決め打ちすると非ボスの敵に `stunned ≥ 1`(`applySurpriseStun` の既存の効果)。
- **(1b)** 同じ編成に**盗賊**を足す ⇒ 唱えない(枠 1 のまま)・判定は従来どおり 1 回。
- **(1c)** 盗賊の代わりに**外套**(`skillBonus.stealth > 0`)⇒ 唱えない。
- **(1d)** 枠 0(または枠を置いていない)⇒ 唱えない・**判定も出ない**(従来の `return false`)。
- **(1e)** 交戦中の敵がボスだけ ⇒ 唱えない・枠 1 のまま。
- **(1f)** 主人公が魔法使い(`partyComposition` を仕込んで読み込み直す)・`currentSpellSlots.invisibility = 1` ⇒ 唱えて **`currentSpellSlots` が 0**(罠A)。
- **(1g)** 枠の関門: `initAllySpellSlots(ally, "mage", 2, {mage:{invisibility:1}})` ⇒ 枠 0(`levelReq` 3)/ Lv3・未習得 ⇒ 0 / Lv3・習得済み ⇒ 1。

### §2 判定は透明化で有利にならない

- **(2a)** (1a) で控えた `resolveSkillCheck` の引数が、同じ敵・同じ DC で盗賊入りの編成を回したときと**数値に響く部分で一致**: 第 1 引数 `"stealth"`・第 2 引数(DC)が同じ・`opts` に `extraBonus` も `advantage` も無い。違ってよいのは `flavor` だけ。
- **(2b)** 盗賊より下: 6 つの DC(ソースの `perceptionDC` から引く)それぞれで、**ページの `SkillCheck`**(`selectRepresentative` / `checkScore` / `HELP_BONUS` / `_computeOutcome` を出目 1〜20 で回す)から出した成功率が、
  「戦士・魔法使い・僧侶・ドワーフ」「エルフ・魔法使い・僧侶・ドワーフ」の 2 編成とも「盗賊・戦士・僧侶・魔法使い」より**小さい**。
  ドライバ側でも §2-3 の式で同じ表を出し、ページの値と一致すること(2 経路)。

### §3 半透明

- **(3a)** 判定の最中(差し替えた `resolveSkillCheck` の中)に、`#player` と生きている仲間全員が `.dfInvis` を持ち、`applyNormalPlayerVisual()` を呼んだ**後でも** `getComputedStyle(player).opacity < 1`(罠B)。
- **(3b)** `tryStealthSurprise` が返った後はクラスが**誰にも残らない**。成功・失敗・`null` を返す・例外を投げる、の 4 通りで確かめる(罠C)。
- **(3c)** 唱えなかった戦闘((1b)(1d))ではクラスが一度も付かない。

### §4 戦闘中は唱えない

- **(4a)** 魔法使いの仲間の傾向を「全般 = invisibility」にして `apTryPreferred(ally)` ⇒ `false`・枠は減らない(罠F)。
- **(4b)** `executeSkillOn(ally, "mage", "invisibility", -1)` ⇒ `false`。
- **(4c)** 主人公(魔法使い)の技の候補に `invisibility` が入らない(枠 1 を置いて候補を作らせる。候補を作る関数が外から呼べなければ、`MAGE_SKILLS.invisibility.outOfCombat === true` と主人公の除外の条件をソースで確かめる形でよい)。

### §5 酒場

- **(5a)** 開発モード(`localStorage` `df.devMode = "1"` を仕込んで読み込み直す)で、巻物の棚に「巻物・インビジビリティ」が並び、ボタンは「購入 1G」。金貨 1G で買える ⇒ 金貨 0・所持 1。common の行は開発モードでも「購入 80G」。
- **(5b)** 開発モードでない ⇒ 並ばない・`shopBuyScroll("scroll-invisibility")` = `{ok:false, reason:"noitem"}`(罠D)。
- **(5c)** 買った巻物を `learnScroll` ⇒ `knownSpellsTV.mage` に `invisibility`。引き出しの呪文一覧に「インビジビリティ」が出る(主人公 Lv1 では `[Lv3 必要]`)。
- **(5d)** 魔法使いのプリセットに透明化を置くと、傾向の「全般 / 雑魚 / ボス」の候補に**出ない**・カードの「技」行には**出る**。

### §6 恒等(非退行)

- **(6a)** 盗賊入りの編成の `tryStealthSurprise` の結果(呼ばれた判定の引数・付与した敵の数・戻り値)が、`?invis=0` と同じ。
- **(6b)** `pickScrollId({common:0, uncommon:1, rare:0})` を `Math.random` を差し替えて全区間で回し、素 = 8 種(透明化あり)・`?invis=0` = 7 種 = #78 以前の uncommon と同じ集合。
- **(6c)** `tools/verify_scroll_shelf.js` が素 19/19・`--negative` 8/8(§6 の言い直し後)。

### §7 撤退

- **(7a)** `index.html?invis=0` ⇒ (1a) と同じ仕込みで唱えない・判定も出ない(従来)。
- **(7b)** `tavern.html?invis=0` + 開発モード ⇒ 棚に透明化が並ばない。

### ⛔ 測らないこと

- 揺らぎの不透明度・周期(0.30 / 0.55 / 1.4s は目で動かす余地を残す。(3a) は「< 1」だけ)。
- 詠唱の演出(`dfPlayCast` の尺)とバナー・ログの文面。
- 実戦での成功率(乱数。(2b) の計算で固定する)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `leaderref` | 主人公の枠を `makeLeaderActor()` で消費する(罠A) | (1f) |
| `inlineopacity` | 半透明をクラスでなく `el.style.opacity = "0.5"` で付ける(罠B) | (3a) |
| `nofinally` | 成功の枝でだけ半透明を外す(罠C) | (3b) |
| `leakdev` | 開発モードでなくても開発用の集合を並べる(罠D) | (5b) |
| `nooutofcombat` | 定義から `outOfCombat` を外す(罠F) | (4a) |
| `advantage` | 透明化のとき `opts.extraBonus = 5`(= 有利の近似)を渡す | (2a) |
| `rogueToo` | 盗賊が居ても唱える(= 不採用案) | (1b) |
| `bossburn` | ボスだけの戦闘でも唱える(早期 return の前に唱える) | (1e) |
| `noautocast` | 傾向の候補から外さない | (5d) |

⭐ 変異は**測っている場所に現れるか**まで設計する(#54 の教訓)。注入した行が実行されたことを変異ごとに 1 つ確かめる。
⚠ #77 の K5 のとおり、赤くなる節は上の表より広がることがある ⇒ 実走の担当を控え、ドライバは**実測の集合との完全一致**を要求する。

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指し: `verify_scroll_shelf.js`(§6)/ `driver_sce1_events.js`(V4b = 盗賊入りの隠密)/ `verify_lore_check.js`(`tryStealthSurprise` を差し替える)/ `verify_enemy_traits.js`(`applySurpriseStun`)/ `driver_action_priority.js`(傾向の候補・(0b) 道中の集合)/ `verify_party_match_setup.js`(傾向の行)/ `driver_dev_gate2.js`(`DF_DEV_MAGIC_SHOP` の行)。
- **母集団**: `index.html` か `tavern.html` を読む本。dev-loop の作法どおり、項目 1 で着手前の色を控え、最後に影のツリーと交互に対比較する(#74〜#77 の方式)。
  #77 の走査(`after77.tsv`・64 腕)は `tavern.html` の母集団だけ ⇒ `index.html` 側は #76 の `after76.tsv`(160 腕)を着手前の色として流用できるかを、項目 1 で blob OID を追試して決める。
- ⚠ 基準値は実装窓が着手時に測る。**走らせて違ったら期待値を書き換える前に理由を突き止める。**
- ⚠ `verify_scroll_shelf` は `git show 54bb89a` を読むので影のツリーでは走らない(#77 K12)⇒ 着手前の色は clone で採る。
- ⚠ `fp74.py` は `  ✓ (0a)` 型の行を読めない(#77 K14)。新規ドライバの判定行も同じ型にするなら、2 経路の比較は exit と総括行で行う(または `fp74.py` に `^\s{1,6}[✓✗]\s` を足す)。

---

## 9. 実機/実感の確認(ここが本当の受入)

- ⚠ ローカルは http 起動が必須。
- `?dev=1` で武器防具屋を開き、「巻物・インビジビリティ」を 1G で買う → マッチング画面の書庫で読む → 引き出しで魔法使いに枠を 1 つ置く(Lv3 以上)。
- 盗賊を連れずに潜り、戦闘の始まりに**魔法陣 → 一行が揺らいで透ける → 隠密判定のパネル**の順で出るか。テンポが悪くないか(伝承判定 → 詠唱 → 隠密判定が続く)。
- iPhone 縦で、揺らぎでコマ落ちしないか・透けすぎて見失わないか。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>透明化の巻物を追加</b> — 珍しい巻物「巻物・インビジビリティ」を宝箱やボスから拾えるように。覚えた魔法使いは、盗賊のいない一行でも戦闘の始まりに姿を消して忍び寄れる(呪文の枠を 1 つ使う)。"

---

## 11. やらないこと

- ⛔ **有利(2d20)の仕組み**を `js/skill-check.js` に作る(ユーザー決定で不採用)。
- ⛔ 透明化を**道中で唱える**(`AP_TRAVEL_CASTABLE` / `TRAVEL_CASTABLE_IDS` に足す)。
- ⛔ 透明化で**敵の攻撃が外れやすくなる**などの戦闘中の効果(5e の「見えない相手への攻撃は不利」)。今回は隠密の接近だけ。
- ⛔ NPC の魔法使いの既定呪文(`CLASS_DEFS.mage.defaultSkills`)に足す。
- ⛔ エルフ・僧侶に透明化を持たせる(5e で Invisibility を持つのは Bard / Sorcerer / Warlock / Wizard。このゲームでは魔法使いだけ)。
- ⛔ 巻物を**店で売る**(拾うだけ。開発モードの 1G 陳列だけ)。
- ⛔ 魔法の眼(C)。`SCROLL_DEV_SHELF_TV` に 1 語足す口だけ用意しておく。
- ⛔ 単眼の暴君のアンチマジック(`isSovereignShellActive` / `isOnSovereignRay`)と透明化の関係。戦闘の始まりに殻が張られている場面は無いはず(着手時に気になれば 1 行で弾いてよいが、受入は足さない)。
- ✅ `実装依頼書/README.md` への行追加は承認時(2026-09-30)に起草窓が済ませた。足した行:

    | 78 | [2026-09-30_invisibility.md](2026-09-30_invisibility.md) | **承認済** | 0% | 透明化(インビジビリティ)。巻物 uncommon・拾うだけ・開発モードで 1G 陳列。盗賊も外套も居ない時だけ戦闘の始まりに自動で唱え、隠密の接近の条件を外す(有利なし)。⚠ 主人公の枠は `consumeSpellSlot("player")` / 半透明は CSS アニメーション(インラインは 10 か所に書き戻される)/ 開発用の旗を巻物の表の行に足さない(#77 の受入の正規表現が壊れる)。撤退 `?invis=0` |

---

## 12. 実装結果

### 12-0. 着手前の実測(HEAD 92a666e)

- **本番の同一性**: `git rev-parse bb79124:index.html 92a666e:index.html` = `f1c6251e…` 同士、`tavern.html` = `67299243…` 同士。
  `git diff --name-only bb79124 92a666e` = 実装依頼書の 2 ファイルだけ ⇒ **起草時(bb79124)の測りはコードについてそのまま有効**。
  `d440334..92a666e` の差 = `tavern.html` / `tools/verify_scroll_shelf.js`(新規)/ 実装依頼書 3 ファイル(`index.html`・`js/*`・`audio.js`・他の `tools/*` は同一)。
- 行末: `index.html` 40050 行・`tavern.html` 11077 行とも**全行 CRLF・LF 単独 0**(`py` でバイト計数)。`git check-attr eol` = crlf。⇒ 編集は `py` でバイト単位。

#### 崩れた主張(K1〜K6)

| K | 主張(依頼書) | 実測(92a666e) | 仕様に響くか |
|---|---|---|---|
| **K1** ⚠⚠ | §2-2 罠A「`makeLeaderActor()` の戻り値を `consumeSpellSlot(actor, …)` に渡すと `actor.spellSlots` は無いので `null` ⇒ 枠が減らない」 | **崩れ**。`makeLeaderActor()`(`:19819`)の actor は `spellSlots: currentSpellSlots`(`:19838`)を**同一参照**で持つ(直上のコメントは「コピー渡し」と書くが `{...}` でない)。`getSpellSlotsRef(actor)` は `actor.spellSlots` = `currentSpellSlots` そのものを返すので、`consumeSpellSlot(actor, id)` でも**主人公の枠は減る**。⇒ 「唱え放題」の欠陥は起きない。⇒ **変異 `leaderref` は (1f) を赤くしない(空振り)**。`"player"` で消費する §4-4 の設計は無害なのでそのままでよい | **響かない**(ユーザー決定に無関係)。**受入の設計に響く** ⇒ 項目3 で `leaderref` を別の欠陥へ差し替える(例: 主人公の枠を消費せずに唱える → (1f) が赤) |
| **K2** ⚠ | §5-2 のコード片(`scrollShelfIdsDev` の中のコメント)/ §2-2 罠E「アンカーは `allrarity` / `idlist` の 2 本」 | §5-2 のコメント `// ⛔ ここで .filter(id => SCROLL_CATALOG_TV[id].rarity === "common") を書かない` は、**それ自体が #77 の変異アンカー文字列を逐語で含む**。`verify_scroll_shelf.js:209` の `countOf` は原本全文(コメント込み)を数え、`:217〜218` で 1 件でなければ exit 3 ⇒ **写経すると exit 3**。さらに同じアンカーを使う変異は `allrarity`(`:163`)だけでなく **`herofilter`(`:175`)** もある | **響かない**。実装の注意 ⇒ 項目2 はコメントの文字列を崩して書く(例: 「rarity が common の filter 行を複製しない」) |
| **K3** | §2-4 計測コマンド `grep -n 'rarity: "uncommon"' index.html tavern.html \| wc -l` → 14 | **28**。装備の表(`index.html:13309` ほか・`tavern.html:4284` ほか)の `rarity: "uncommon"` 14 行も拾う。巻物の表に限れば `index.html:13573/13574/13580/13581/13586/13587/13589` + `tavern.html:5348/5349/5354/5355/5359/5360/5362` = **7 × 2 = 14** で、主張の中身(uncommon 7 種)は正しい | 響かない(計測コマンドの絞り不足) |
| **K4** | 行番号(下表) | 小ずれ 8 件。**意図した場所は一意に決まる**(下表の実測で読み替える) | 響かない |
| **K5** | §2-2 罠B「`player.style.opacity` は **10 か所**」 | 列挙も実測も **12 行**(`:15917 :15923 :15928 :15969 :15972 :16003 :16006 :17776 :19789 :33196 :33280 :34913`)。結論(CSS アニメーション)は不変。`#player`(`:125〜`)・`.ally`(`:241〜246`)に `animation` 無し・`player.className =` 0 件・仲間の `className` は生成時 `:14077` の 1 回だけ = 衝突なし | 響かない |
| **K6** | §8「名指し golden」7 本(暗に緑を前提) | `driver_sce1_events.js` は**着手前から赤**(exit 1・211/214)。FAIL = (2)(4d)(N2-隣) の 3 本で、`sceneFlags` に `s3_novice_swayed`(#53)が増えた既知の赤。after76.tsv(d440334)と**同じ FAIL 集合**。本チケットが触る V4b = (9)「第7弾も同じ付与点を通る」は **PASS** | 響かない。非退行は「FAIL 集合が 3 本のまま」で判定する |

**K4 の行番号(実測)**:

| 依頼書の参照 | 実測 |
|---|---|
| `MAGE_SKILLS`(`:22205〜22265`)/ 挿入位置「`:22265` の `},` の直後」 | `const MAGE_SKILLS = {` = **22201**、`"ice-storm"` = 22257〜**22264**(`},`)、**22265 = `};`**(表の閉じ)。⇒ 挿入は **22264 の後・22265 の前** |
| 既存 `levelReq`(`:22236〜22265`) | fireball 22230 / lightning-bolt 22237 / cone-of-cold 22244 / burning-hands 22252(=1)/ ice-storm 22260 |
| `getSpellSlotsRef`(`:13971`) | **13972**(13971 は直前のコメント)。`hasSpellSlot` 13978 / `consumeSpellSlot` 13982 / `initAllySpellSlots` 13993 |
| `isMageSleepOn`(`:13612`) | **13609**(13612 は関数の閉じ `}`)。⇒ `isInvisOn` は 13612 の後に置けば同じ作法 |
| `canSneak`(`:25414〜25417`)/ 本体(`:25414〜25442`) | `const canSneak` = **25413〜25415**、`if (!canSneak) return false;` = **25416**、`const dc` 25417、`resolveSkillCheck` 25420、`return false;` 25436、関数の閉じ `}` = **25437**(25439〜 は罠解除のコメント) |
| `verify_scroll_shelf.js:107`(表の正規表現) | **108** |
| `CLASS_DEFS.mage.defaultSkills` の並び(`:22107〜22115`) | コメント 22107〜22115 + 代入 `CLASS_DEFS.mage.defaultSkills = withInnateSleepList(…)` = **22116** |
| `apTryPreferred`(`:32474`) | 関数頭 32461・`outOfCombat` の除外が 32474(参照は除外行として正しい) |

**そのまま正しかった行**(抜粋): `tryStealthSurprise` 25404 / `makeLeaderActor` 19819 / `#player` 3175 / `createAllyDom` 14073(`ally.el = el` 14091)/ `applyNormalPlayerVisual` 15912 / `index.html:20651`(有利のコメント・`advantage|有利` の grep はこの 1 行だけ)/ `</style>` 3008 / `SCROLL_CATALOG` 13569〜13590(`scroll-lightning-bolt` 13574)/ `pickScrollId` 13688(`let pool` 13696)/ 拾う口 13707・13708・24126 / `perceptionDC` 10863/10880/10908/10930/10955/10975 / `executeSkillOn` の魔法使いの枝 19996〜20008 / 候補の除外 32836・32848 / `mageAI` 30538 / `index.html:35415`(`hasPreset ? heroMap : defaultCasterMap`)/ `tryStealthSurprise()` の呼び口は 21673 の 1 か所(`runLoreCheck` の直後)。
`tavern.html`: `MAGE_SKILLS_UI` 4490〜4502(`ice-storm` 4501)/ `?drawerlv=0` 4538〜4542 / `DF_DEV_MAGIC_SHOP` 5020 / `?dev=1` 2866〜2876 / `SCROLL_CATALOG_TV` 5345〜5363(`scroll-lightning-bolt` 5349)/ `SCROLL_SHELF_PRICE` 6847 / `isScrollShopOnTV` 6849 / `scrollShelfIds` 6853〜6856 / `dfShopBuyScroll` 6864(価格 3 か所 = 6868・6869・6872)/ `renderShop` 6877(`canBuy` 6958・`購入 ${…}G` 6959)/ `renderSpellSlotItem` 7627(`[Lv… 必要]` 7652)/ `equippedIds.slice()` 7969・9238 / `const equippedIds = apEquippedIdsFor(slot, classKey);` 7958・9218 / 魔法使いの `skillPool: MAGE_SKILLS_UI` 4617。
`js/skill-check.js`: `d20()` 1 回振り 416・483 / `PROFICIENCY_BONUS = 2` 53 / `HELP_BONUS = 2` 56 / 盗賊だけ `stealth` 習熟 / `computeOutcome` 172 / `selectHelper` 150。`js/abilities.js:41〜48` の DEX 値も主張どおり。
§2-3 の計算は計測コマンドで**同じ表を再現**(12: .75/.55/.65/.798/.878 … 20: .35/.15/.25/.278/.438)。
§2-5 の 7 本の行番号(`driver_sce1_events.js:1334〜1352` / `verify_lore_check.js:511〜517` / `verify_enemy_traits.js:376` / `driver_action_priority.js:172` / `verify_party_match_setup.js:1021` / `driver_dev_gate2.js:450`)は全部そのまま。`grep -lF "if (!canSneak) return false;" tools/*.js` = 0 本。
§2-6: `tools/` `scripts/` の 5 桁ポート最大 = **10492** ⇒ base **10493** のまま。
§2-7: `scripts/hooks/check_changelog.py:24` = `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`。
名前の衝突なし: `invisib` / `dfInvis` / `isInvisOn` / `SCROLL_DEV_SHELF_TV` / `scrollShelfPrice` / `isAutoCastSkillTV` / `?invis` は `index.html` `tavern.html` `js/*` `tools/*.js` とも 0 件。

⇒ **仕様(ユーザー決定)に響く崩れは 0 件**。K1 は受入の変異 1 本の差し替え(項目3)、K2 は実装時のコメントの書き方(項目2)で吸収できる。

#### 名指し golden 7 本の着手前の色(本番ツリー・HEAD 92a666e・各 2 回・直列)

| 本 | 1 回目 | 2 回目 | 所要 |
|---|---|---|---|
| `verify_scroll_shelf.js` | exit 0・19/19 | exit 0・19/19 | 3 秒 |
| `verify_scroll_shelf.js --negative` | exit 0・**8/8**(担当に完全一致) | exit 0・8/8 | 25 秒 |
| `driver_sce1_events.js` | **exit 1・211/214**(FAIL (2)(4d)(N2-隣) = K6・V4b (9) は PASS) | exit 1・211/214(同じ 3 本) | 48 秒 |
| `verify_lore_check.js` | exit 0・26/26 | exit 0・26/26 | 3 秒 |
| `verify_enemy_traits.js` | exit 0・15/15 | exit 0・15/15 | 4 秒 |
| `driver_action_priority.js` | exit 0・PASSED 92 / FAILED 0 / PENDING 0 | 同じ | 65 秒 |
| `verify_party_match_setup.js` | exit 0・PASSED 36 / FAILED 0 / PENDING 0 | 同じ | 44 秒 |
| `driver_dev_gate2.js` | exit 0・62/62 PASS | exit 0・62/62 PASS | 27 秒 |

⇒ 7 本とも**決定的**(2 回とも同じ色)。after76 / after77 の同じ本の色とも一致。赤は `driver_sce1_events` の既知 3 本だけ。

#### 母集団と着手前の色の流用判定

- **母集団** = `tools/` と `scripts/` の検証ドライバ(`.js`)のうち、コメントを除いたコードに `index.html` か `tavern.html` を含む本 + `driver_bgm_title.js`(`tavern` の語だけ・#77 の扱いを踏襲)= **148 本**
  (`index.html` だけ 94 本 / `tavern.html` を読む 54 本)。`scripts/` に `.js` は無い。
  ⚠ `.py` 16 本(`check_changelog.py` / `add_changelog.py` / アセット生成系)も語を含むが、検証ドライバではないので外した。
- **流用可否(blob OID で判定)**:
  - `after77.tsv`(本番 bb79124・64 腕)⇒ **全腕 流用可**。`bb79124..92a666e` の差は実装依頼書 2 ファイルだけで、配信物・`js/*`・`tools/*` は同一 OID。
  - `after76.tsv`(本番 d440334・160 腕)⇒ **`tavern.html` を読まない本の腕だけ流用可**。`d440334..92a666e` で `tavern.html`(#77)と `tools/verify_scroll_shelf.js`(新規)が変わったため、`tavern.html` を読む本の腕は after77 から取る。`index.html`・`js/*`・`audio.js`・その他 `tools/*` は同一 OID。
- **148 本の色の出どころ**: `tavern.html` を読む 54 本 = after77 の素の腕 / `index.html` だけの 94 本 = after76 の素の腕。**漏れ 0 本**(素の腕が無い本は無い)。
  `--negative` の腕で流用できるのは 11 本(after77 = aoe_coverage / bolt_aim / hold_person / run_chronicle / scroll_shelf、after76 = bolt_bounce / cone_cast / enemy_name_label / enemy_traits / lore_check / road_ambush)。after76 の neg 腕のうち `tavern.html` を読む 4 本(aoe_coverage / bolt_aim / hold_person / run_chronicle)は after77 側を使う。
  流用できる腕は計 **159**(記録上の所要 333.5 分)。
- **既知の赤(流用する色の中の非緑)**: after76 由来 = `driver_field_step6`(54/59)/ `driver_grid_p4`(exit 3・変異アンカー)/ `driver_grid_p8`(exit 1)/ `driver_mapeditor_painting`(exit 1)/ `driver_monsters_hobgoblin`(12/14)/ `driver_monsters_kobold`(11/12)/ `driver_sce1_events`(211/214)/ `driver_speech_engine`(16/17)/ `driver_speech_v2`(45/46)/ `probe_bandit_map`・`probe_s2_fold`・`probe_swamp_map`(exit 3 = 引数必須の probe)/ `verify_walk_block`(22/23)。
  after77 由来 = `driver_mapeditor`(176/179)/ `driver_monsters_chimera`(16/17)/ `driver_monsters_umberhulk`(21/22・フレーク)/ `probe_party_size`(600 秒で打ち切り)/ `sweep_recruit_balance`(装置 4/4 崩れ)。
- ⚠ 本チケットは `index.html` と `tavern.html` の**両方**を変えるので、148 本すべてが帰属の候補。項目4 は #74〜#77 の方式(影のツリーと交互に対比較)で 148 本 + neg 腕を回す。上の流用は「着手前の色」の参照値で、帰属の判定は影との対比較で行う。
- ⚠ 流用の判定は「コードに語があるか」による(#77 と同じ引き方)。`index.html` から画面遷移で `tavern.html` へ抜ける本が語を書かずに酒場を踏む可能性は構造上残る ⇒ 項目4 の影の対比較で拾う。
- 走行器・集計: このセッションの scratchpad `item1\`(`run_golden.sh` / `pop78.py` / `pop78.json` / `logs\*.r1.log` `*.r2.log`)。

(実装窓が埋める)
