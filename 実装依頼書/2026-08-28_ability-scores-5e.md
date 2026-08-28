# #28 能力値を D&D 5e の 6 能力へ一本化する(基盤・UI なし)

- **起草**: 2026-08-28(計画窓) / **ステータス**: **承認済**(2026-08-28 ユーザー承認)
- **触るファイル**: `js/abilities.js`(新規) / `js/skill-check.js` / `index.html` / `tavern.html` /
  `town.html` / `world.html` / `title.html` / `tools/verify_ability_scores.js`(新規)
- ✅ **着手順のブロッカーは解消済み**。起草時は「#25 が完走してから」としていたが、
  **#25 は 2026-08-28 に `231d1f6` で完走**(全 4 項目 done / golden 3 本も 82/82・25/25・41/41 へ復帰)。
  着手直前に `git status --short` を取り直して clean を確認すること。
- ⚠ **番号の由来**: 起草時は #26 としたが、**#25 が #26 =「復興評議会館」/ #27 =「ポドルプラザ MAP 化」を
  予約済み**だった(`verify_tavern_map.js` の (4b) にも「#26 で扉ごと消える節」と焼き込み済み)。
  完了済みのドライバとチケットを書き換えるより安全なので、**本チケットを #28 へ繰り下げた**。
- ⚠ 別窓と並走する場合は `git add .` 禁止・**ファイル単位 add**・
  `git diff --cached <file>` を読んでから commit。
- ⭐ **本チケットは UI を一切作らない。** シート画面は #29。ここは土台だけを固める
  (#5 `save-slots` が「UI を作らない」で土台を先に固めたのと同じ作法)。

---

## 1. 目的

**いま能力値が 2 系統に分裂している。**

- **戦闘用の修正値** — `index.html:17873 playerStats` / `index.html:20011 CLASS_DEFS`。
  `str: 3, dex: 1, con: 2, wis: 0, int: 0` のように **0〜4 の小さい値**で、
  **d20 に直接足される修正値そのもの**(命中・イニシアチブ・セーヴ・ダメージ)。**CHA が存在しない**。
- **技能判定用の能力値** — `js/skill-check.js:41 CLASS_ABILITIES`。
  `warrior: { str: 15, dex: 11, con: 14, int: 9, wis: 10, cha: 11 }` のように
  **D&D の生スコア 9〜15**で、**CHA を含む 6 能力が揃っている**。

両者は独立に育っており、**値が食い違っている**。戦士の STR は戦闘側で `+3`、技能側では
`15`(現行の B/X 式で `+1`)。この状態のままプレイヤーシート(#29)を作ると、
**「シートに書いてある STR」と「実際の命中」が食い違う嘘の画面**になる。

⭐ **だからシートを作る前に、能力値の唯一の正を決める。** それが本チケット。

**ユーザー決定(2026-08-28)**:

- **段階的に 5e スコアへ一本化する。** 第 1 段(本チケット)は
  「`js/skill-check.js` の 6 能力スコアを**唯一の正**へ昇格させ、修正値の式を 5e へ切り替える」まで。
  **戦闘用の修正値は 1 も動かさない**(第 2 段 = 別チケットで、戦闘値をスコアから導出へ差し替える)。
- **修正値の式を B/X 式から 5e 式 `floor((値-10)/2)` へ切り替える。**
- ⭐ **不採用にした案(なぜそれではないか)**:
  - **「併存のまま、シートには技能側の 6 能力を表示するだけ」** — バランスは 1 も動かず最も安全だが、
    §1 の食い違いが残る。シートは「そのキャラの真実」を見せる画面なので、
    **嘘を額装することになる**。
  - **「戦闘用修正値を正にして `score = 10 + 2×mod` で逆算する」** — 戦闘が 1 も動かない利点はあるが、
    `js/skill-check.js` に既に練り込まれている**職ごとの個性(ドワーフの WIS 13・盗賊の CHA 12 等)を
    捨てる**ことになる。逆算では全職の CHA が新規に決め直しになる。
  - **「B/X 式のまま据え置く」** — 「5e 準拠」と言いながら修正値だけ B/X という食い違いが残る。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 能力値の 2 系統 — 全数

| 系統 | 定義場所 | スケール | CHA | 使われ方 |
|---|---|---|---|---|
| 戦闘用修正値 | `index.html:20011` `CLASS_DEFS` の `str/dex/con/wis/int`、`index.html:17873` `playerStats` | **0〜4**(修正値そのもの) | **無し** | d20 に直接加算。命中・イニシアチブ・セーヴ・ダメージ・回復量 |
| 技能判定用スコア | `js/skill-check.js:41` `CLASS_ABILITIES` | **9〜15**(生スコア) | **有り** | `abilityModifier()` を通してから d20 に加算 |

`js/skill-check.js:39-40` は**この分裂を自分で明記している**:

```js
// これが本システム唯一の新規キャラデータ。index.html の CLASS_DEFS が持つ
// 「戦闘用の修正値（str:3 等・CHA無し）」とは別物なので混同しないこと。
```

**戦闘用修正値の参照箇所(リポジトリ全文 grep で実測)**: `index.html` に **50 箇所超**。
主な用途 = イニシアチブ(`19747: u.initiative = n + u.dex`)、
セーヴ(`18793: roll + (playerStats.wis || 0) + sb`)、
ダメージ(`21518: dmgBonus: playerStats.str`)、
回復(`21588: r.total + playerStats.con`)、
呪文命中(`25543: ally.atkBonus + (ally.int || 0) + ...`)。
⛔ **本チケットではこの 50 箇所を 1 つも触らない。**

**再測定コマンド**:

```bash
grep -nE "\.(str|dex|con|wis|int|cha)\b" index.html | grep -vE "^\s*[0-9]+:\s*str: [0-9]"
grep -n "CLASS_ABILITIES" js/skill-check.js
```

### 2-2. ⚠⚠⚠ 罠 A — 「共有モジュールだから全ページで見える」は成立しない

`js/skill-check.js` の**ファイル冒頭のコメントが実物とズレている**:

```
* ★ 共有モジュール: index.html / tavern.html の両方から
*      <script src="js/skill-check.js"></script>
```

同様に `js/hero-classes.js:23` は「title.html と tavern.html が読み込む」と書いている。
**実測すると tavern.html は `hero-classes.js` を読んでいない(grep ヒット 0 件)。**

全 5 ページの `<script src>` の実測(2026-08-28 / `4aaea2b` 時点):

| ページ | audio | df-mapdef | save-slots | skill-check | hero-classes | town-map | world-map | tavern-map |
|---|---|---|---|---|---|---|---|---|
| `index.html` | ○ | ○ | ○ | **○** | ✕ | ✕ | ✕ | ✕ |
| `tavern.html` | ○ | ○ | ○ | **○** | **✕** | ✕ | ○ | ○ |
| `town.html` | ○ | ✕ | ○ | **✕** | ○ | ○ | ✕ | ✕ |
| `world.html` | ○ | ✕ | ○ | **✕** | ○ | ✕ | ○ | ✕ |
| `title.html` | ○ | ✕ | ○ | **✕** | ○ | ✕ | ✕ | ✕ |

⭐ **`js/save-slots.js` だけが 5 ページ全部に載っている。** 能力値は 5 ページ全部から見える必要が
あるので(#29 のシートがどのページからでも開くため)、**新モジュールは 5 ページ全部に
`<script src>` を書く**。「skill-check があるから見えるはず」は 3 ページで false になる。

**再測定コマンド**:

```bash
for f in index.html tavern.html town.html world.html title.html; do \
  echo "--- $f ---"; grep -oE '<script src="[^"]+"' $f | sort -u; done
```

⭐ この罠は §8 の負のコントロール `nopage` として装置に内蔵させる。

### 2-3. B/X 式 → 5e 式 の差分(実測)

`js/skill-check.js:27-36` の現行式(B/X):

```js
// === §2 能力修正値（B/X準拠。5e式 (値-10)/2 は使わない） =============
function abilityModifier(score) {
  if (score <= 3) return -3;   if (score <= 5)  return -2;
  if (score <= 8) return -1;   if (score <= 12) return 0;
  if (score <= 15) return 1;   if (score <= 17) return 2;
  return 3; // 18
}
```

**36 マス(6 職 × 6 能力)の実測**:

| 職 | STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|---|
| warrior | 15: +1→**+2** | 11: +0→+0 | 14: +1→**+2** | 9: +0→**−1** | 10: +0→+0 | 11: +0→+0 |
| dwarf | 14: +1→**+2** | 9: +0→**−1** | 15: +1→**+2** | 10: +0→+0 | 13: +1→+1 | 9: +0→**−1** |
| rogue | 10: +0→+0 | 15: +1→**+2** | 11: +0→+0 | 13: +1→+1 | 12: +0→**+1** | 12: +0→**+1** |
| elf | 10: +0→+0 | 14: +1→**+2** | 10: +0→+0 | 14: +1→**+2** | 13: +1→+1 | 12: +0→**+1** |
| cleric | 12: +0→**+1** | 9: +0→**−1** | 13: +1→+1 | 11: +0→+0 | 15: +1→**+2** | 13: +1→+1 |
| mage | 9: +0→**−1** | 11: +0→+0 | 10: +0→+0 | 15: +1→**+2** | 13: +1→+1 | 11: +0→+0 |

**36 マス中: 上昇 13 / 下降 5 / 据置 18。**

⭐⭐ **ただし実プレイに効くのは「代表者(その判定で最高値の者)」だけ**である
(`js/skill-check.js:118 selectRepresentative` が最高値を自動選出し、
`driver_skillcheck_roster.js (c)` が「非代表の出目は成否に無関与」を既に機械保証している)。
**代表者のスコアで測り直すと下がる判定は 1 つも無い**:

| 判定 | 代表(B/X) | 代表(5e) | 差 |
|---|---|---|---|
| perception(知覚) | +3 dwarf/elf | +3 dwarf/elf | **±0** |
| investigation(捜査) | +3 rogue | +3 rogue | **±0** |
| sleightOfHand(手先の早業) | +3 rogue | +4 rogue | **+1** |
| stealth(隠密) | +3 rogue | +4 rogue | **+1** |
| athletics(運動) | +3 warrior | +4 warrior | **+1** |
| arcana(魔法学) | +3 elf/mage | +4 elf/mage | **+1** |
| history(歴史) | +3 mage | +4 mage | **+1** |
| religion(宗教) | +3 cleric | +4 cleric | **+1** |
| insight(看破) | +3 cleric | +4 cleric | **+1** |
| persuasion(説得) | +1 cleric | +1 rogue/elf/cleric | **±0** |
| intimidation(威圧) | +2 warrior | +2 warrior | **±0** |
| deception(ペテン) | +1 cleric | +1 rogue/elf/cleric | **±0** |

**= 12 判定中 6 判定が +1、残り 6 判定は ±0。下がる判定は無い。**
⭐ **最頻出の知覚は ±0**(ドワーフ WIS 13 / エルフ WIS 13 はどちらの式でも +1)。
⚠ persuasion / deception は**代表者が cleric 単独 → rogue/elf/cleric の 3 者同点**へ変わる。
同点時は `selectRepresentative` が**配列順(= 隊列順)の安定ソート**で決めるので、
**「誰が喋るか」が隊列によって変わる**。数値は変わらないが台詞の主が変わりうる。

**実際に呼ばれている判定の実測(全数)**:

```
resolveSkillCheck("sleightOfHand")  3 箇所   check: "perception"     2 箇所
resolveSkillCheck("perception")     1 箇所   check: "persuasion"     2 箇所
resolveSkillCheck("stealth")        1 箇所   check: "athletics"      1 箇所
resolveSkillCheck("athletics")      1 箇所   check: "deception"      1 箇所
                                             check: "investigation"  1 箇所
                                             check: "religion"       1 箇所
                                             check: "stealth"        1 箇所
```

**→ 実際に易しくなるのは sleightOfHand(罠解除・開錠、3 箇所)/ stealth / athletics /
investigation / religion。知覚・説得・ペテンは ±0。**

**再測定スクリプト**(この表を再生成する。scratchpad へ置いて `py` で走らせる):

```python
CA = {"warrior":dict(str=15,dex=11,con=14,int=9,wis=10,cha=11),
      "dwarf":dict(str=14,dex=9,con=15,int=10,wis=13,cha=9),
      "rogue":dict(str=10,dex=15,con=11,int=13,wis=12,cha=12),
      "elf":dict(str=10,dex=14,con=10,int=14,wis=13,cha=12),
      "cleric":dict(str=12,dex=9,con=13,int=11,wis=15,cha=13),
      "mage":dict(str=9,dex=11,con=10,int=15,wis=13,cha=11)}
PROF={"warrior":["athletics","intimidation"],"dwarf":["perception","constitution"],
      "rogue":["sleightOfHand","stealth","investigation"],"elf":["perception","arcana"],
      "cleric":["insight","religion"],"mage":["arcana","history"]}
CHK={"perception":"wis","investigation":"int","sleightOfHand":"dex","stealth":"dex",
     "athletics":"str","arcana":"int","history":"int","religion":"wis","insight":"wis",
     "persuasion":"cha","intimidation":"cha","deception":"cha"}
bx=lambda s:-3 if s<=3 else -2 if s<=5 else -1 if s<=8 else 0 if s<=12 else 1 if s<=15 else 2 if s<=17 else 3
e5=lambda s:(s-10)//2
for ck,ab in CHK.items():
    f=lambda c,g: g(CA[c][ab])+(2 if ck in PROF[c] else 0)
    print(ck, max(f(c,bx) for c in CA), "->", max(f(c,e5) for c in CA))
```

### 2-4. CHA は「飾り」ではない — 既に本番で判定に使われている

戦闘側に CHA が無いので「CHA は未使用」と思いがちだが、**技能側では既に生きている**:

| 呼び口 | 判定 | 何 |
|---|---|---|
| `tavern.html:5119`(`4aaea2b` 以前の行番号。⚠ 必ず測り直す) | `persuasion` | 酒場「💬 周囲に聞き込む」= 依頼の下調べ |
| `index.html:24081` | `persuasion` | シナリオ1 グリクス 説得判定 |
| `index.html:24084` | `deception` | シナリオ1 グリクス 欺瞞判定 |

⭐ **したがって「6 能力を唯一の正にする」は、CHA を新規に発明する話ではなく、
既にある CHA を戦闘側にも見えるようにする話**である。

### 2-5. 保存キーは prefix 総なめ — 新キーの取りこぼしは原理的に起きない

`js/save-slots.js:84`:

```js
if (k.indexOf(LIVE_PREFIX) === 0 && !KEEP[k]) out.push(k);
```

⭐ **キーのハードコード列挙ではない。** よって将来 `dragonfighters.abilities` 等を足しても
セーブスロットに自動で乗る。**「新キーを save-slots の表に追記し忘れてスロット間で値が漏れる」
という落とし穴は存在しない**(起草時に疑ったが、実測で不成立だった)。
⛔ ただし `KEEP`(= スロットをまたいで残す設定キー)には**足さないこと**。

### 2-6. 既存 golden は修正値をハードコードしていない

`tools/driver_skillcheck_roster.js:110-115` は期待値を直書きせず、
`SkillCheck.checkScore` と `SkillCheck.checkScoreBreakdown().total` の**一致**を見ている。
`tools/driver_room_search_roll.js:333` も `SkillCheck.checkScore` を実行時に呼んでいる。
**→ 式を差し替えても既存 golden の期待値書き換えは不要な見込み。**
⚠ 「見込み」なので §8 で実測して確かめること。

**ベースライン実測(2026-08-28 / `638b479` 時点)**:

| ドライバ | 実測 | 記録との差 |
|---|---|---|
| `node tools/driver_skillcheck_roster.js` | **12/12** | — |
| `node tools/driver_room_search_roll.js` | **39/39** | 記録どおり |
| `node tools/verify_title_screen.js --port 8917` | **86/86** | ⚠ メモの記録は **83/83** で**古い**。86 が正 |

⚠ ポートが掴まれていると `EADDRINUSE` で落ちる。`--port` を変えて再試行すること。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24`:

```python
GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

**→ 鳴る。** 本チケットは `index.html` と `tavern.html` に `<script src>` を 1 行ずつ足す。

⭐ **書けるプレイヤー向けの要約は実在する**(嘘をでっち上げる必要が無い):
「技能判定の修正値を D&D 5e 方式へ揃えた。罠解除・隠密・運動など、
得意分野の判定がわずかに通りやすくなった。」
= §2-3 で実測した「12 判定中 6 判定が +1」がそのまま player-facing な変化。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/abilities.js` | **新規**。6 能力スコア表(CHA 込み)+ 5e 式 `abilityMod` + 撤退スイッチ |
| `js/skill-check.js` | `CLASS_ABILITIES` と `abilityModifier` を**削除し** `DFAbilities` へ委譲 |
| `index.html` | `<script src="js/abilities.js">` を `js/skill-check.js` の**前**へ 1 行 |
| `tavern.html` | 同上 1 行 |
| `town.html` / `world.html` / `title.html` | 同上 1 行ずつ(3 ページとも skill-check は読まないが、#29 のシートが読む) |
| `tools/verify_ability_scores.js` | **新規**。§8 |

⛔ **`index.html` の戦闘用修正値(`CLASS_DEFS` / `playerStats` / 50 箇所超の参照)は 1 文字も触らない。**
✅ **`実装依頼書/README.md` の #28 行は追加済み**(2026-08-28。#25 が `231d1f6` で完走したため)。

---

## 4. STEP1 — `js/abilities.js` を新規作成する

`js/save-slots.js` / `js/hero-classes.js` と同じ **classic script + 明示 window 代入**の作法。
⚠ classic script 直下の `let/const/function` は window に載らないので、公開物は必ず代入する。

```js
/*
 * js/abilities.js — D&D 5e 6 能力値の唯一の正 v1
 * ------------------------------------------------------------------
 * 実装依頼書 #28。
 *
 * ★ 何のためのデータか
 *   このゲームの「そのキャラが何者か」を決める 6 能力の生スコア(3〜18)。
 *   技能判定 (js/skill-check.js) はここだけを読む。
 *
 * ★ 出自: js/skill-check.js:41 CLASS_ABILITIES を **1 マスも変えずに** 移設したもの。
 *   移設であって改変ではない。値を動かすのは別チケット。
 *
 * ★ 共有モジュール / classic script。**5 ページ全部**が読む
 *   (index / tavern / town / world / title)。
 *   ⚠ skill-check.js は index / tavern しか読んでいない (2026-08-28 実測)。
 *      「skill-check があるから見える」は town/world/title で false。
 *
 * ★ 修正値は 5e 式 floor((score-10)/2)。B/X 式ではない。
 *   ⛔ 戦闘用の修正値 (index.html の CLASS_DEFS.str 等・0〜4) とは **まだ別物**。
 *      両者の統合は第 2 段 = 別チケット。ここで index.html を触らないこと。
 */
(function (global) {
  "use strict";

  // 撤退スイッチ: ?ability5e=0 で修正値だけ従来の B/X 式へ戻る。
  // ⚠ ページ単位で完結する (クエリは遷移をまたがない)。?heromark=0 と同じ作法。
  var USE_5E = true;
  try {
    USE_5E = new URLSearchParams(global.location.search).get("ability5e") !== "0";
  } catch (e) { USE_5E = true; }

  // === 職業固定の 6 能力スコア (生値 3〜18)。js/skill-check.js:41 からの移設 ===
  var CLASS_ABILITIES = {
    warrior: { str: 15, dex: 11, con: 14, int: 9,  wis: 10, cha: 11 },
    dwarf:   { str: 14, dex: 9,  con: 15, int: 10, wis: 13, cha: 9  },
    rogue:   { str: 10, dex: 15, con: 11, int: 13, wis: 12, cha: 12 },
    elf:     { str: 10, dex: 14, con: 10, int: 14, wis: 13, cha: 12 },
    cleric:  { str: 12, dex: 9,  con: 13, int: 11, wis: 15, cha: 13 },
    mage:    { str: 9,  dex: 11, con: 10, int: 15, wis: 13, cha: 11 },
  };

  var ABILITY_KEYS  = ["str", "dex", "con", "int", "wis", "cha"];
  var ABILITY_ABBR  = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
  var ABILITY_LABEL = {
    str: "筋力", dex: "敏捷力", con: "耐久力",
    int: "知力", wis: "判断力", cha: "魅力",
  };

  // 5e 式。Math.floor は負数でも下方向 (floor(-0.5) === -1) なので式のままでよい。
  function mod5e(score) { return Math.floor((score - 10) / 2); }

  // 旧 B/X 式 (撤退スイッチ専用。通常経路からは呼ばない)
  function modBX(score) {
    if (score <= 3)  return -3;
    if (score <= 5)  return -2;
    if (score <= 8)  return -1;
    if (score <= 12) return 0;
    if (score <= 15) return 1;
    if (score <= 17) return 2;
    return 3;
  }

  function abilityMod(score) {
    var s = (typeof score === "number" && isFinite(score)) ? score : 10;
    return USE_5E ? mod5e(s) : modBX(s);
  }

  function scoresFor(classKey) { return CLASS_ABILITIES[classKey] || null; }

  global.DFAbilities = {
    CLASS_ABILITIES: CLASS_ABILITIES,
    ABILITY_KEYS: ABILITY_KEYS,
    ABILITY_ABBR: ABILITY_ABBR,
    ABILITY_LABEL: ABILITY_LABEL,
    abilityMod: abilityMod,
    mod5e: mod5e,
    modBX: modBX,
    scoresFor: scoresFor,
    use5e: function () { return USE_5E; },
  };
})(typeof window !== "undefined" ? window : this);
```

⛔ **`CLASS_ABILITIES` の 36 個の数値を 1 つも変えないこと。** 移設であって改変ではない。
値の見直しは第 2 段(別チケット)。

---

## 5. STEP2 — `js/skill-check.js` を委譲へ差し替える

`js/skill-check.js` から **`CLASS_ABILITIES` の定義(`:41-48`)と `abilityModifier`(`:28-36`)を削除**し、
`DFAbilities` を見るようにする。⭐ **写しを残さないこと**(残すと二重定義になり、
片方だけ古くなる = §2-1 で見た分裂がもう 1 組増える)。

```js
// === §2 能力修正値 =================================================
// ⚠ 式もスコア表も js/abilities.js が唯一の正。ここに写しを置かないこと。
//   (#28 以前は本ファイルが B/X 式と CLASS_ABILITIES を自前で持っていた)
function abilityModifier(score) {
  return (global.DFAbilities && global.DFAbilities.abilityMod)
    ? global.DFAbilities.abilityMod(score)
    : 0;   // ⚠ 未読込は 0 (= 修正なし)。silent fail-open だが §8 (3a) が 5 ページ全部で検査する
}
function classAbilities(classKey) {
  return (global.DFAbilities && global.DFAbilities.scoresFor)
    ? global.DFAbilities.scoresFor(classKey) : null;
}
```

`checkScore` / `checkScoreBreakdown` の `var ab = CLASS_ABILITIES[member.classKey];` を
`var ab = classAbilities(member.classKey);` へ置換する(**2 箇所**)。

⚠ **公開 API は減らさない。** `SkillCheck.CLASS_ABILITIES` は
`tools/driver_skillcheck_roster.js:110` が読んでいるので、
`CLASS_ABILITIES: (global.DFAbilities && global.DFAbilities.CLASS_ABILITIES) || {}` として
**転送で残す**。⛔ ここを消すと既存 golden が落ちる。

⚠ `js/skill-check.js` の `ABILITY_ABBR`(`:115`)も `DFAbilities.ABILITY_ABBR` へ委譲する。

⚠ **行番号は必ず測り直す。** #25 の項目 3・4 が入ると全部ズレる
(実測: `tavern.html` の `const WEAPONS` は `4aaea2b` で 2994 → **3246** へ 252 行動いた)。

---

## 6. STEP3 — 5 ページに `<script src>` を足す

**`js/skill-check.js` より前**に置くこと(skill-check が読み込み時に `DFAbilities` を触るため)。

| ファイル | 挿入位置 |
|---|---|
| `index.html` | `<script src="js/skill-check.js">` の直前 |
| `tavern.html` | 同上 |
| `town.html` / `world.html` / `title.html` | `<script src="js/save-slots.js">` の直前 |

⚠⚠ **HTML はディスク上 CRLF、`core.autocrlf=true` なので `git diff` では改行の化けに気づけない。**
Python で差し込むなら**読み側も書き側も `newline=""`**。Edit ツールで 1 行足すのが安全。

---

## 7. 撤退スイッチ

- **`?ability5e=0`** — 修正値が従来の B/X 式へ戻る。スコア表と CHA の存在はそのまま
  (= 「見た目は 5e、判定の重みだけ従来」へ戻る)。
- **判定位置** = `js/abilities.js` の IIFE 先頭。`location.search` を 1 回だけ読む。
- **ページ遷移をまたぐか = またがない。** 各ページが独立に自分の URL を読む
  (`?heromark=0` と同じ作法)。sessionStorage へ写す必要は無い —
  技能判定が起きるのは `index.html` と `tavern.html` の 2 ページだけで、
  どちらも判定の直前にそのページが読み込まれているため。

---

## 8. 受入条件 — `tools/verify_ability_scores.js`(新規)

`about:blank` に `js/abilities.js` を `addScriptTag` で注入するエンジン単体検査 +
http サーバ経由の 5 ページ統合検査の 2 段構え
(`tools/driver_skillcheck_roster.js` の作法を流用)。

⭐ **観測するのは「スコア表の同一性」「式」「5 ページ全部に載っているか」の 3 つ。**
⛔ **DC の値は観測しない**(§「測らないこと」)。

### ⚠ 計測機構 — 期待値を写経しないための 2 経路

**旧スコア表は「ドライバに書き写す」のではなく `git show` で採る。**
これで「移設のつもりで 1 マス書き換えた」を機械が捕まえる。

```js
const { execFileSync } = require('child_process');
// #28 着手前 (= abilities.js が無い版) の skill-check.js から旧表を採る。
// ⚠ 実装後は HEAD が新版になるので、DF_BASE_REF に着手前の hash を渡すこと。
const BASE = process.env.DF_BASE_REF || 'HEAD';
const oldSrc = execFileSync('git', ['show', BASE + ':js/skill-check.js'],
                            { cwd: ROOT, encoding: 'utf8' });
const m = oldSrc.match(/CLASS_ABILITIES\s*=\s*\{([\s\S]*?)\n\s*\};/);
const OLD_TABLE = parseAbilityTable(m && m[1]);   // {warrior:{str:15,...},...}
```

⛔ **「旧表が採れなかった」を PASS にしないこと。** (0b) が件数を検査する。

### §0 装置(先に母集団を確かめる)

- **(0a)** `js/abilities.js` を注入した `about:blank` で `window.DFAbilities` が生えている。
  ⭐ **これが無いと以降の assert が全部 `undefined` 比較で空振りし、永久緑になる。**
- **(0b)** `OLD_TABLE` が **6 職 × 6 能力 = 36 マス**採れている(0 件や 5 職なら exit 1)。
- **(0c)** 統合検査で **5 ページすべてが HTTP 200 で読めている**(母集団 = 5)。

### §1 スコア表(移設であって改変ではない)

- **(1a)** `DFAbilities.CLASS_ABILITIES` の 36 マスが `OLD_TABLE` と**完全一致**。
  ⭐ 2 経路 = 「ブラウザで評価した新モジュール」vs「git から採った旧ソース」。写経ではない。
- **(1b)** 6 職すべてが `cha` を持つ(1 職でも欠けたら赤)。
- **(1c)** `SkillCheck.CLASS_ABILITIES`(転送)が `DFAbilities.CLASS_ABILITIES` と同一内容。

### §2 修正値の式

- **(2a)** `s = 1..30` の全域で `DFAbilities.abilityMod(s) === Math.floor((s-10)/2)`。
- **(2b)** `DFAbilities.modBX` が旧式と一致(撤退経路が生きている):
  `[3,5,8,12,15,17,18] → [-3,-2,-1,0,1,2,3]`。
- **(2c)** **代表者スコアの実測が §2-3 の予告表と一致**する。
  12 判定について `SkillCheck.selectRepresentative` + `SkillCheck.checkScore` を実行し、
  **+1 になるのがちょうど 6 判定**(§2-3 の表と同じ集合)、**残りが ±0**、**下がる判定が 0 件**。
  ⭐ 予告表は依頼書の主張なので、**ドライバ側で実際に走らせて突き合わせる**。

### §3 搭載(罠 A の検査)

- **(3a)** **5 ページすべて**で `window.DFAbilities` が truthy。⭐ 1 ページでも欠けたら赤。
- **(3b)** `js/skill-check.js` のソース文字列に **`str: 15` が現れない**
  (= 自前のスコア表の写しが残っていない)。
- **(3c)** `js/skill-check.js` のソース文字列に **`if (score <= 15) return 1;` が現れない**
  (= 自前の B/X 式の写しが残っていない)。

### §4 恒等(非退行)

- **(4a)** `checkScoreBreakdown(m, cd, 0).total === checkScore(m, cd)`
  を **全 CHECKS(12)× 全クラス(6)= 72 組**で。
  (既存 `driver_skillcheck_roster (f)` と同じ不変式。式を替えても壊れないこと)
- **(4b)** **戦闘用修正値が 1 も動いていない。**
  `index.html` を http で読み、`CLASS_DEFS` の 6 職 × `str/dex/con/wis/int` を評価して、
  `git show <BASE>:index.html` から採った同じ 30 マスと一致。
  ⭐ **本チケットの「戦闘は触らない」を機械で担保する唯一の assert。**
- **(4c)** 5 ページすべてで `pageerror` ゼロ。

### §5 撤退

- **(5a)** `index.html?ability5e=0` で `DFAbilities.abilityMod(15) === 1`(B/X 値)。
- **(5b)** 同条件で §2-3 の代表者スコアが**旧値へ戻る**(12 判定すべてが B/X 側の値)。

### ⛔ 測らないこと

- **DC の値**(`DC_TIERS` / `disarmDC()` / `exitHintDc()` / `SCE1_*_DC`)。
  §2-3 のとおり判定は最大 +1 易しくなるが、**その再調整は別チケット**で
  実プレイのペア比較をしてから決める。ここで DC を assert で縛ると調整余地が消える。
- **`PROFICIENCY_BONUS` / `HELP_BONUS`**(どちらも +2)。5e ではレベル依存だが本チケットでは動かさない。
- **戦闘用修正値の「値そのものが妥当か」**。(4b) は「変わっていないこと」だけを見る。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `bxmod` | `abilityMod` を `modBX` へ差し替える | **(2a) (2c)** |
| `nocha` | `CLASS_ABILITIES` から全職の `cha` を削る | **(1a) (1b)** |
| `tweak` | `warrior.str` を 15 → 16 に書き換える(「移設のついでの改変」) | **(1a)** |
| `nopage` | `town.html` の `<script src="js/abilities.js">` を配信時に落とす | **(3a)** ⭐ §2-2 罠 A の再現 |
| `shadow` | `js/skill-check.js` に旧 `CLASS_ABILITIES` の写しを復活させる | **(3b)** |
| `combat` | `index.html` の `CLASS_DEFS.warrior.str` を 3 → 4 にする | **(4b)** |

⚠ 変異は**配信スナップショットへ実行時に注入**すること(本番ファイルを書き換えない)。
⭐ CLAUDE.md の「プレイヤーに見える変化が無いのに本番ファイルを触る設計は採らない」に従い、
計測シームは**ドライバ側**に置く。

⚠ **変異アンカーは行番号でなく部分文字列で照合**する。同じ文字列が 2 箇所ヒットしたら exit 3
(#20 で実際に踏んだ)。

### 既存 golden の非退行(実装後に必ず走らせる)

| ドライバ | 基準 | 測定日 |
|---|---|---|
| `node tools/driver_skillcheck_roster.js` | **12/12** | 2026-08-28 実測 |
| `node tools/driver_room_search_roll.js` | **39/39** | 2026-08-28 実測 |
| `node tools/verify_title_screen.js --port 8917` | **86/86** | 2026-08-28 実測(⚠ メモの 83/83 は古い) |
| `node tools/driver_trap_disarm.js` | **44/44** | 2026-08-28 実測(起草後に追測) |
| `node tools/verify_town_map.js` | 85/85(記録値) | 記録 |
| `node tools/verify_world_map.js` | 57/57(記録値) | 記録 |

⚠ 基準値は 2026-08-28 時点。**走らせて違ったら期待値を書き換える前に理由を突き止める**
(#25 が golden 3 本を触っている最中なので、赤が自分のせいとは限らない)。
⭐ **`driver_trap_disarm` は sleightOfHand = +1 になる判定なので、最も赤くなりやすい。**
着手前にベースラインを取っておくこと。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ **ローカルは http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. 廃坑を 1 周し、**罠解除と開錠が易しくなりすぎていないか**を体感する
   (数値は +1 だが、DC 15 に対する成功率は 55% → 60% 相当)。
2. シナリオ1 グリクスの**説得/欺瞞の代表者が誰になるか**を見る
   (§2-3 のとおり cleric 単独 → rogue/elf/cleric の同点になり、**隊列順で決まる**)。
3. `?ability5e=0` を付けて、判定パネルの内訳表示が旧値へ戻ることを目視。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>技能判定を D&D 5e 方式へ</b> — 罠解除・隠密・運動など得意分野の判定が、わずかに通りやすくなった。"
```

---

## 11. やらないこと

- ⛔ **戦闘用修正値をスコアから導出する差し替え**(= 一本化の第 2 段)。別チケット。
  `index.html` の `CLASS_DEFS` / `playerStats` / 50 箇所超の参照は**開かない**。
- ⛔ **プレイヤーシート画面の UI**。**#29** の担当。本チケットは UI を 1px も作らない。
- ⛔ **言語(language)**。#29 の担当。`js/abilities.js` に `LANGUAGES` を足さないこと。
- ⛔ **DC の再調整**。判定が最大 +1 易しくなるが、調整は実プレイのペア比較をしてから別チケットで。
- ⛔ **`PROFICIENCY_BONUS` のレベル依存化**(5e は Lv1-4:+2 → Lv17+:+6)。別チケット。
- ⛔ **敵側の能力値**(`index.html` の敵 def 42 件が `str/dex/con` を持つ)。触らない。
- ✅ **`実装依頼書/README.md` への行追加は完了済み**(2026-08-28)。足した行:

```
| 28 | [2026-08-28_ability-scores-5e.md](2026-08-28_ability-scores-5e.md) | **承認済** | 0% | 能力値を 5e の 6 能力(CHA 込み)へ一本化する土台。**UI は作らない**。⭐ 修正値を B/X → 5e 式へ(代表者は 12 判定中 6 判定が +1・下がる判定は 0)。⚠ **skill-check.js を読むのは index/tavern の 2 ページだけ**なので新モジュールは 5 ページ全部に載せる |
```

---

## 12. 実装結果

(実装窓が埋める)
