# #75 敵の体質(眠らない・炎/冷気/雷が効きにくい・効かない)を戦いに効かせる

- **起草**: 2026-09-28(計画窓 = 起草窓) / **ステータス**: **承認済**(2026-09-28 ユーザー承認)
- **着手**: 実装窓は**窓更新を挟んでから**着手する(2026-09-28 ユーザー指示)
- **触るファイル**: `index.html` / `tools/verify_enemy_traits.js`(新規)
- ⛔ **触らないファイル**: `tavern.html` / `audio.js` / `js/*.js`(§2-6 で開く必要が無いことを確認済み)
- 並走: 実装窓は #74 完了後で待機中、作業ツリーは clean(2026-09-28 `git status` 実測。未追跡は会議記録 `dev-meetings/2026-09-28_scouting-magic.md` だけ)。
  それでも作法は守る: `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

「敵の様子を探る魔法」シリーズの **1 枚目(A-1)**。会議記録 `dev-meetings/2026-09-28_scouting-magic.md` が唯一の正。

今のゲームの敵には**体質がない**。スリープは呪文攻撃が AC に当たるかどうかだけで決まるので、スケルトンもリッチもゴーレムも眠る。炎の呪文は赤竜ファラクサスにもそのまま効く。
そのため、次の A-2 で入れる**伝承判定**(戦闘の始まりに敵の正体を見抜き、効く呪文を選ぶ)で分かることが何もない。
本チケットでは、5e SRD に従って敵ごとに体質を持たせ、**伝承判定をするかどうかに関係なく、常に**ダメージと眠りに効かせる。

**ユーザー決定(2026-09-28)**:

- 特性表を入れることで難易度が変わるのは**受け入れる**(「難易度の変化は仕方ないので、オッケーです」)。勝率は前後で測って**記録するだけ**で、調整はしない。
- 値は **SRD どおりにする(弱点は付けない)**。起草者の推奨は「ゲーム独自の弱点を付ける」だったが、**不採用**になった。
  ⇒ SRD で炎に弱いマミーやトレントなどは本作に出てこないので、**弱点(2 倍)は 0 件**。入るのは「効きにくい(半分)」「効かない(0)」「眠らない」の 3 つだけ。
- A-2(伝承判定と AI の呪文選び)、S(武器防具屋の巻物棚)、B(透明化)、C(魔法の眼)は別チケット。キャラクリエイトでの技能選択は後日の別チケット。

---

## 2. 着手前の実測(HEAD `e3880ba`・2026-09-28)

### 2-1. 敵の種類は 51 種で、定義は 1 つの表にまとまっている

- `index.html:9645` `const ENEMY_TYPES = {`(〜10853)。**51 キー**(下のコマンドで実測)。
- `tavern.html:3890〜3979` と `js/road-events.js:484` にあるのは**キー名だけ**で、敵のデータは持っていない。
- 既存の特性フラグは次のとおり。
  - `undead`(`index.html` の ENEMY_TYPES 内に `undead: true` が 7 行)
  - `physicalImmunity`(stoneGolem だけ)
  - `physicalResistance`(gargoyle だけ)
  - `multiHead`(hydra)
  - `isBoss`
- **アンデッドかどうかを決める唯一の口**は `isUndeadEnemy(e)` `index.html:27459` = `(e.def && e.def.undead) || e.type === "skeleton"`。
  ホールド・パーソンの免疫 `holdPersonImmune(t)` `:27744` も、この口を通している。

```bash
awk '/^    const ENEMY_TYPES = \{/{f=1;next} f&&/^    \};/{exit} f&&/^      [A-Za-z_]+: \{/{c++} END{print c}' index.html   # → 51
```

### 2-2. 採用する体質の表(5e SRD 5.1 の値そのまま)

本作に居る敵のうち、**呪文・武器で与える属性(炎 / 冷気 / 雷)に関係する SRD の体質を持つもの**だけを表にした。
毒・酸・死霊・雷鳴・精神はパーティ側に与える手段が無いか、あっても本チケットの範囲外(§11)。

| キー(`index.html` 行) | 名前 | SRD の元 | 炎 | 冷気 | 雷 | 眠り |
|---|---|---|---|---|---|---|
| `skeleton` 9853 / `skeletonArcher` 9890 | スケルトン系 | Skeleton | — | — | — | **効かない**(アンデッド) |
| `zombie` 9872 | ゾンビ | Zombie | — | — | — | **効かない**(アンデッド) |
| `wraith` 9909 | レイス | Wraith | 半分 | 半分 | 半分 | **効かない**(アンデッド) |
| `lich` 9928 | リッチ | Lich | — | 半分 | 半分 | **効かない**(アンデッド) |
| `caelum` 9962 | カエルム | Ghost | 半分 | **0** | 半分 | **効かない**(アンデッド) |
| `ghostFlame` 10584 | ウィル・オ・ウィスプ | Will-o'-Wisp | 半分 | 半分 | **0** | **効かない**(アンデッド) |
| `pharaxus` 10122 | ファラクサス | Adult Red Dragon | **0** | — | — | — |
| `stoneGolem` 10156 | ストーンゴーレム | Stone Golem | — | — | — | **効かない**(魅了に免疫 = 構造体) |
| `animatedArmor` 10176 | 動く鎧 | Animated Armor | — | — | — | **効かない**(同上。⚠ 今は出現しない) |
| `stoneLegionary` 10199 | 石の軍団兵 | (SRD に無い独自の構造体) | — | — | — | **効かない**(⭐ ゴーレムと揃える判断。§2-7) |

- 眠りの根拠は 5e の *Sleep* の本文「アンデッドと、魅了に免疫のあるクリーチャーには効かない」。
- ⚠ 残りの 41 種は体質なし(= 今と 1 ビットも変わらない)。ゴブリン、盗賊、オーク、リザードマン、ハイドラ、ガーゴイル(SRD の免疫は毒だけ)、ミミック(酸だけ)などが該当する。
- **数え方**:
  - 眠らない敵 = アンデッド 7 キー(`isUndeadEnemy` が真になるもの)+ 構造体 3 キー = **10 キー**
  - 属性の体質を持つ敵 = **5 キー**(wraith / lich / caelum / ghostFlame / pharaxus)

### 2-3. ⚠⚠⚠ 敵へのダメージは 1 か所に集まっていない ⇒ 属性の 11 か所に同じ関数を挟む

- パーティが敵の HP を減らす場所は **32 か所**あった(`hp -=` / `hp = Math.max(0, …)` / `= 0`)。`damageEnemy` `:17198` は探索中の斬りだけのもので、呼び口は 1 か所しかない。
- そのうち**属性(炎 / 冷気 / 雷)のダメージは次の 11 か所**。

| `index.html` 行 | 関数 | 技 | 属性 |
|---|---|---|---|
| 23157 | `applyWeaponSpecialEffects` | 武器の衝撃波(雷斧 / 溶岩の槌) | `swIsFire` なら炎、そうでなければ雷 |
| 23190 | `applyWeaponSpecialEffects` | 武器の追加属性 `bonusDmgType` | fire / cold / lightning(holy は対象外) |
| 28055 | `allyFireBolt` | ファイアボルト | 炎 |
| 28713 | `allyFireball` | ファイアボール | 炎 |
| 28945 | `allyLightningBolt` | ライトニングボルト | 雷 |
| 29042 | `allyConeOfCold` | コーンオブコールド | 冷気 |
| 29129 | `allyIceStorm` | アイスストーム | 冷気(⭐ §2-7) |
| 29237 | `allyBurningHands` | バーニングハンズ | 炎 |
| 31042 | `allyLightningArrow`(本命中) | ライトニングアロー | 雷 |
| 31080 | `allyLightningArrow`(飛び散り) | ライトニングアロー | 雷 |
| 32731 | `tryReflectEnemySpell` | 指輪が敵の呪文を跳ね返す | `spell.fireAcid` なら炎 |

- 主人公も同じ `ally*` 関数を `executeSkillOn` `:19871` 経由で使う(魔法使いの分岐は `:19975〜19984`)。**主人公用に別の口を作らない。**
- スクロールは呪文を覚えるだけでダメージは与えない(`SCROLL_CATALOG` `:13566`)。闇市の消耗品にも属性ダメージは無い(`:13754〜13785`)。
- 武器の属性キーの実数: `bonusDmgType` と `shockwaveType` を合わせて cold 5 / fire 4 / lightning 4 / holy 3 行。
- **手本にする既存の形**:
  - `resolvePhysDefense(enemyIdx, attackerEnh, dmg, label)` `:17046` は `{immune, resisted, dmg}` を返し、IMMUNE / RESIST の吹き出しも出す。
  - 呼び口は `const physDef = resolvePhysDefense(...); if (physDef.immune) return; dmg = physDef.dmg;` と書く(`:17235`、`:29344`)。
  - 半減の式は `applyPhysResistHalving(dmg)` `:17031` = `Math.max(1, Math.floor(dmg / 2))`(端数切り捨て・最低 1)。

⇒ **属性用に `resolveElementDefense(enemyIdx, element, dmg)` を 1 本作り、11 か所すべてで HP を引く直前に通す。** 半減は物理と同じ式を使う。

⚠⚠⚠ **罠 1 — 最低 1 の底上げ**
各呼び口は、ダメージを引く手前で `Math.max(1, …)` の底上げを済ませている(例: `:23155`、`:23180`)。
属性の判定を底上げより**前**に入れると、「効かない」が 1 ダメージに化ける。⇒ 判定は**底上げの後、HP を引く行の直前**に置く。「効かない」は 0 を返す。
⭐ §8 の変異 `immunefloor` で装置に内蔵する。

### 2-4. ⚠⚠⚠ 眠りは「stunned」を 15 種類の効果と共有している ⇒ 免疫はスリープの中でしか判定しない

- パーティが敵を眠らせる経路は **`allySleep` `:28069` の 1 本だけ**(味方の魔法使い `mageAI :30305` と、魔法使いの主人公 `:19977` の両方がここを通る)。
- 眠らせた時に書くのは `t.stunned = Math.max(t.stunned || 0, skill.stunTarget)` `:28200`。**眠り専用の状態は無い**。
- 同じ `stunned` を書く効果が他に 15 種類ある: 不意打ち `:25366`、廃坑の開幕 `:25785`、街道の警戒 `:25809`、ターン・アンデッド `:27719`、ホールド・パーソン `:27859`、コーンオブコールドの凍結 `:29049`、アースシャッター `:29652`、盾打ち `:23504` / `:29988`、武器のクリティカル `:23224`、メデューサの鏡 `:21421`、牙の魅了 `:21443` など。
- `helpless = target.stunned > 0` を読む攻撃側の分岐は約 15 か所ある。

⇒ **眠りの免疫は `allySleep` の命中ループの中で判定する。`stunned` への書き込みそのものに条件を付けてはいけない。**
付けてしまうと、アンデッドへの不意打ち、ターン・アンデッドの怯え、コーンオブコールドの凍結まで消える。既存の `driver_sce1_events` の G10 と `verify_road_boon` の 2c(不意打ち)も壊れる。
⭐ §8 の変異 `stunguard` で装置に内蔵する。

免疫の判定は `holdPersonImmune` と同じく、**1 つの関数 `enemySleepImmune(t)`** にまとめる(`isUndeadEnemy(t) || 表の sleepImmune`)。
⚠ 味方用の `sleepImmune(unit)` `:20655` とは**別物**なので名前を分ける。味方用はエルフの種族特性と指輪を見ていて、`sovereignSuppressed` を通さない非対称な作りになっている。**写経しない。**

### 2-5. ハイドラの首とファラクサスの反射(触らないが、壊してはいけない)

- ハイドラの「炎で焼いた首は生えない」は**実装済み**。炎と酸の経路 6 か所(`:23159`、`:23189`、`:28054`、`:28712`、`:29236`、`:32730`)で `__tookFireAcid` を立て、`defeatEnemy` `:17393〜17421` が読む。
  - ハイドラは表で体質なしなので、挙動は変わらない。
  - ⛔ `__tookFireAcid` を立てる行の**順序と条件を動かさない**。
- 指輪の反射 `:32731` は、ファラクサスのブレスを跳ね返すと竜自身に当たる。表で**炎が効かない**ので、**反射ダメージは 0 になる**。これは SRD どおりで、意図した変化。

### 2-6. 触る範囲

- 体質はダメージと眠りの計算だけに効く。どちらも `index.html` の中だけで閉じている。`tavern.html` は敵のデータを持っていない(§2-1)。
  ⇒ **`tavern.html` を開く必要は無い**(二重ファイルの同期コストは 0)。
- 魔法使いの AI(`mageAI` `:30270`)は、ターゲットの種類も属性も見ていない。
  - スリープは「眠っていない敵が 2 体以上」かつ 50% の確率で選ぶ。攻撃呪文は脅威度の点数で選ぶ。
  - ⇒ **本チケットの後から A-2 が入るまでの間、ファラクサスにファイアボールを撃ち、アンデッドにスリープを撃って空振りする。** これは決裁済みの難易度変化に含まれる。**AI は触らない**(A-2 の仕事)。

### 2-7. 判断を要した 2 点(起草者が決めた。変えたいなら承認時に)

1. **アイスストームを冷気として扱う**。
   - SRD の *Ice Storm* は「2d8 殴打 + 4d6 冷気」。本作が振るのは 2d8 だけ(`:22233` `dmgDice: "2d8"`)なので、ダイスだけ見れば殴打の部分にあたる。
   - しかしプレイヤーに見える説明文は `flavor: "5x5 範囲 2d8+INT 冷気 + 鈍足3T …"`(`:22238`)で、演出も氷(`element: 'ice'`)。
   - ⇒ **画面に出している「冷気」に合わせる**。
2. **石の軍団兵を眠らない側に入れる**。
   - SRD に居ない独自の敵だが、動く鎧と同じ石の構造体として描かれ、同じ役割の置き換え(`:10942〜10944` のコメント)でもある。
   - ⇒ ゴーレムと揃える。

### 2-8. 撤退スイッチの作法(既存の実例)

- `CONE_CAST_ON` `index.html:28566-28567` = `new URLSearchParams(window.location.search).get("conecast") !== "0";`(#50)
- `AOE_COVER_ON` `:28393-28394`(#59)
- ページ単位の定数で、遷移はまたがない。本チケットも同じ形にする(§7)。

### 2-9. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
プレイヤーに見える変化があるので、要約は実在する(アンデッドとゴーレムが眠らない / 赤竜に炎が効かない / レイスたちが冷気や雷を和らげる)。§10 に用意した。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 体質の表 `ENEMY_TRAITS`、判定関数 3 本、撤退の定数、属性の 11 か所への挿入、`allySleep` の免疫、検証用の窓 `window.__dfEnemyTraits` |
| `tools/verify_enemy_traits.js` | 新規。受入条件 §8 と `--negative` |
| `実装依頼書/2026-09-28_enemy-traits.md` | §12 実装結果 |

⛔ `tavern.html` / `audio.js` / `js/*.js` は開かない。

---

## 4. STEP1 — 体質の表と判定関数(`isUndeadEnemy` の近く、`:27459` の後ろ)

```js
    /* ★[#75] 敵の体質 (5e SRD 5.1)。⚠ 撤退 ?enemytraits=0 で表ごと無効 = 従来どおり全部等倍・全部眠る。
       ⭐ 表に無い敵は体質なし (= 等倍・眠る)。値は SRD のまま、弱点 (2 倍) は SRD の該当が本作に居ないので 0 件 (ユーザー決定)。
       ⭐ 眠りの免疫は「アンデッド (isUndeadEnemy)」と「表の sleepImmune」の和。アンデッドを表に書き写さない。
       ⛔ ここを読むのは resolveElementDefense / enemySleepImmune の 2 本だけ。呼び口で表を直接引かない。 */
    const ENEMY_TRAITS_ON =
      new URLSearchParams(window.location.search).get("enemytraits") !== "0";
    const ENEMY_TRAITS = {
      wraith:         { resist: ["fire", "cold", "lightning"] },
      lich:           { resist: ["cold", "lightning"] },
      caelum:         { resist: ["fire", "lightning"], immune: ["cold"] },       // Ghost
      ghostFlame:     { resist: ["fire", "cold"], immune: ["lightning"] },      // Will-o'-Wisp
      pharaxus:       { immune: ["fire"] },                                      // Adult Red Dragon
      stoneGolem:     { sleepImmune: true },                                     // 構造体 = 魅了に免疫
      animatedArmor:  { sleepImmune: true },
      stoneLegionary: { sleepImmune: true },                                     // 独自。ゴーレムと揃える (依頼書 §2-7)
    };
    /* 属性の倍率。0 = 効かない / 0.5 = 効きにくい / 1 = 等倍。element は "fire" | "cold" | "lightning"。 */
    function enemyElementMult(e, element) {
      if (!ENEMY_TRAITS_ON || !e) return 1;
      const tr = ENEMY_TRAITS[e.type];
      if (!tr) return 1;
      if (tr.immune && tr.immune.indexOf(element) >= 0) return 0;
      if (tr.resist && tr.resist.indexOf(element) >= 0) return 0.5;
      return 1;
    }
    function enemySleepImmune(e) {
      if (!ENEMY_TRAITS_ON || !e) return false;
      if (isUndeadEnemy(e)) return true;
      const tr = ENEMY_TRAITS[e.type];
      return !!(tr && tr.sleepImmune);
    }
```

- `e.type` が ENEMY_TYPES のキーであることを、着手前に 1 回確かめる(`isUndeadEnemy` も `e.type === "skeleton"` を見ているので、ほぼ確実)。
- 検証用の窓: `window.__dfEnemyTraits = { on: ENEMY_TRAITS_ON, table: ENEMY_TRAITS, mult: enemyElementMult, sleepImmune: enemySleepImmune, resolve: resolveElementDefense };`
  classic script 直下の `const`/`function` は `window` に載らないので、明示的に載せる。

## 5. STEP2 — `resolveElementDefense` と、属性の 11 か所への挿入

`resolvePhysDefense` `:17046` の直後に置く。

```js
    /* ★[#75] 属性の防御。{immune, resisted, dmg} を返す (resolvePhysDefense と同じ形)。
       ⚠⚠ 呼び口では「最低 1 の底上げ」の後、HP を引く行の直前で呼ぶ (依頼書 §2-3 罠 1)。
       immune のとき dmg は 0。呼び口は return / continue せず 0 を引いてよい
       (撃破判定・ハイドラの __tookFireAcid の順序を動かさないため)。 */
    function resolveElementDefense(enemyIdx, element, dmg) {
      const e = enemies[enemyIdx];
      const m = enemyElementMult(e, element);
      if (m === 1) return { immune: false, resisted: false, dmg: dmg };
      const nm = (e && e.def && e.def.name) || "敵";
      const jp = { fire: "炎", cold: "冷気", lightning: "雷" }[element] || element;
      if (m === 0) {
        showRollAtEnemy(enemyIdx, `<span class="label">IMMUNE</span>${jp}が効かない!`, "miss");
        updateInfo(`${nm}: ${jp}は通用しない!`);
        return { immune: true, resisted: false, dmg: 0 };
      }
      showRollAtEnemy(enemyIdx, `<span class="label">RESIST</span>${jp}を和らげた`, "hit");
      updateInfo(`${nm}: ${jp}を和らげた (ダメージ半減)`);
      return { immune: false, resisted: true, dmg: applyPhysResistHalving(dmg) };
    }
```

- 11 か所それぞれで、HP を引く行を `dmg = resolveElementDefense(idx, "<属性>", dmg).dmg;` + 既存の引き算にする。
  - 属性は §2-3 の表どおり。
  - `:23190` は `bonusType` が `fire` / `cold` / `lightning` の時だけ通す。`holy` と `acid` は素通し。
  - `:23157` は `swIsFire ? "fire" : "lightning"`。
  - `:32731` は `spell.fireAcid` の時だけ `"fire"` を通す。
- **与えたダメージの表示(`showDmgAt` など)は、判定後の値にする。** 判定前の値のままにすると、「効かない」のに数字が出てしまう。
- ⚠ 範囲呪文は敵ごとに判定する(物理の `:29574` と同じ)。1 体が効かないからといって、呪文全体を止めない。
- ⛔ 物理の 21 か所と、力場・聖・毒の経路には入れない(§11)。

## 6. STEP3 — スリープの免疫(`allySleep` の命中ループ `:28193〜28205`)

- ループの先頭で `if (enemySleepImmune(t)) { immune++; immuneNames.push(t.def.name); continue; }` とする。命中ロールは振らない(5e では効かない相手に判定は無い)。
- 結果表示 `:28207〜` は `命中 ${hits} / 抵抗 ${resists}` の後ろに、免疫がいた時だけ ` / 効かない ${immune}` を足す。
  - ラベルは、全員が免疫なら `IMMUNE`。1 体でも眠れば従来どおり `SLEEP!`。
- ログ `:28212` にも「(アンデッドは眠らない)」など、免疫の数と名前を足す。
- ⛔ `stunned` を書く他の 15 か所には触らない(§2-4)。
- ⛔ 味方の `sleepImmune(unit)` `:20655` には触らない。

---

## 7. 撤退スイッチ

- **`?enemytraits=0`** — 表ごと無効になる。全部の敵が等倍で、全員眠る(= #74 時点と同じ)。
- 判定位置: `index.html` のページ単位の定数 `ENEMY_TRAITS_ON`(STEP1)。**遷移はまたがない**(`?conecast=0` と同じ作法)。酒場から出発すると消えるので、検証は `index.html` を直接起動して行う。

---

## 8. 受入条件 — `tools/verify_enemy_traits.js`(新規・base ポート **10459**、変異は 10460〜)

**方針**: 乱数を固定し(`d20` / `rollDiceDD` を決まった値にする)、**11 か所の属性経路と `allySleep` を実際に撃たせて、敵の HP の減りと `stunned` を観測する**。
期待値は 2 経路で出して突き合わせる。① ページの窓 `__dfEnemyTraits` から引いた値。② **ドライバが自分で持つ SRD の表**(§2-2 を独立に書いたもの)。どちらか一方の写経にしない。
盤面の作り方は、既存の `tools/verify_aoe_coverage.js` / `tools/verify_cone_cast.js` の盤面セットアップを流用する(ゴブリン・オーク・スケルトンを並べている)。

### §0 装置(母集団を先に確かめる)

- **(0a)** 11 か所の属性経路と `allySleep` が、**すべて 1 回以上実際に通った**(対照のゴブリンの HP が減った / 眠った)。
  ⭐ **これが無いと全 assert が空振りで永久緑になる。**
- **(0b)** `__dfEnemyTraits` が存在し、`on === true`、表のキーが 8 個。さらに、表のすべてのキーが `ENEMY_TYPES` に実在する(表の打ち間違いで体質が黙って消える事故を防ぐ)。
- **(0c)** ドライバ側の SRD の表と、ページの表の**中身が一致**する(キーの数・各属性の集合)。

### §1 属性ダメージ

- **(1a)** ファラクサスに炎の 5 経路(ファイアボルト / ファイアボール / バーニングハンズ / 武器の追加属性 fire / 反射)→ **HP の減りが 0**、`IMMUNE` の吹き出しが出る。
- **(1b)** レイスに炎・冷気・雷 → 減りが `max(1, floor(素のダメージ / 2))`。素のダメージは、同じ乱数でゴブリンに撃った減りから取る(= 2 経路)。
- **(1c)** カエルムに冷気 0 / 炎・雷は半分。ウィル・オ・ウィスプに雷 0 / 炎・冷気は半分。リッチに炎は等倍、冷気・雷は半分。
- **(1d)** 範囲呪文(ファイアボール)に、ファラクサスとゴブリンを一緒に巻き込む → ゴブリンだけ減り、ファラクサスは 0(敵ごとに判定されている)。
- **(1e)** 表示される数字が判定後の値である(ファラクサスへの炎で「0」または IMMUNE。判定前の数字は出ない)。

### §2 眠り

- **(2a)** スケルトン・ゾンビ・レイス・リッチ・ストーンゴーレムにスリープ → `stunned` が増えない。免疫の数が表示とログに出る。
- **(2b)** ゴブリンとスケルトンを一緒に巻き込む → ゴブリンは(命中すれば)眠り、スケルトンは眠らない。
- **(2c)** ⭐ **スケルトンへの不意打ち `applySurpriseStun` と、コーンオブコールドの凍結は、今までどおり `stunned` を付ける**(§2-4 の罠)。

### §3 恒等(非退行)

- **(3a)** 体質なしの敵(ゴブリン・オーク・ハイドラ・ガーゴイル)への 11 経路のダメージが、`?enemytraits=0` の腕と**同じ乱数で 1 の差も無い**。
- **(3b)** ハイドラを炎で倒した首は生えない(`__tookFireAcid` の挙動は不変)。

### §4 撤退

- **(4a)** `index.html?enemytraits=0` では、(1a)〜(2b) の条件が**同じ assert の本体のまま**すべて崩れる(ファラクサスに炎が通る・スケルトンが眠る)。
  ⭐ 「OFF で緑」ではなく、**同じ conjunction を ON と OFF の両方に当てて、OFF で崩れる**ことを確かめる。

### ⛔ 測らないこと

- 吹き出しとログの**文言**(`IMMUNE` のラベル以外)。後で耳と目で直す余地を残す。
- 魔法使いの AI が何を撃つか(A-2 の仕事)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `immunefloor` | `resolveElementDefense` の免疫が `Math.max(1, …)` を返す(§2-3 罠 1) | (1a) |
| `stunguard` | 眠りの免疫を `allySleep` でなく、`stunned` への書き込み全般に掛ける(§2-4 の罠) | (2c) |
| `onesite` | 11 か所のうち 1 か所(ライトニングアローの飛び散り `:31080`)だけ挿入を外す | (1c) または (0a) |
| `aoeabort` | 範囲呪文で、1 体が免疫なら呪文ごと 0 にする | (1d) |
| `preshow` | ダメージの表示を判定前の値にする | (1e) |
| `tabletypo` | 表のキー `pharaxus` を `pharaxsus` にする | (0b) |
| `switchdead` | `ENEMY_TRAITS_ON` を常に true にする | (4a) |

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指しで確かめるもの(属性呪文と眠りに触れる本):
  - `verify_aoe_coverage.js`(ファイアボール・ライトニング・スリープ。§4 はスリープの範囲の体数を読む `:842-857`)
  - `verify_cone_cast.js`
  - `verify_bolt_aim.js` / `verify_bolt_bounce.js`(ゴブリンの HP の減りを当たりの合図に使う)
  - `driver_sce1_events.js`(G10 = 不意打ち)
  - `verify_road_boon.js`(2c)
  - `driver_action_priority.js`
- 上の本はゴブリンを的にしている(表に無い = 体質なし)ので、**緑のままのはず**。赤くなったら、期待値を書き換える前に理由を突き止める。
- **母集団**: `index.html` はほぼ全部の本が読む。⇒ dev-loop の作法どおり、項目 1 で「着手前の色」を控え、最後に影のツリーと交互に対比較する(#74 の方式)。
- ⚠ 基準値は実装窓が着手時に測る(本書では数えていない)。

### 勝率の記録(決裁どおり、記録するだけで調整しない)

- 体質が効くのは主にシナリオ 5(地下神殿 = アンデッド)と 6(竜の巣 = ファラクサス・スケルトン)。4(砦)は隠しの石の敵だけ。
- **シナリオ 5 と 6 を、既定と `?enemytraits=0` の対で、それぞれ N=10 ペア**走らせ、クリア率・到達ノード・所要時間を §12 に記録する。
  - 道具: `tools/probe_s2_clear.js` の `--arm qs:<key>=<val>` の仕組みを S5 / S6 へ広げるか、同じ形の新しい道具を書く。どちらにするかは実装窓が決める。
- ⚠ この機械は遅い(約 2.6 倍)。竜の巣は 1 走行が長い。

---

## 9. 実機/実感の確認

- iPhone で、アンデッドにスリープを撃った時の「効かない」表示と、ファラクサスへの炎の `IMMUNE` が読めるか。
- 範囲呪文で IMMUNE と RESIST の吹き出しが何体ぶんも重なった時に、うるさすぎないか。
- ⚠ ローカルは http で起動する(file:// だと音が出ない)。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>敵の体質が戦いに効くように</b> — アンデッドやゴーレムには眠りの呪文が効かず、赤竜に炎は通じない。レイスやリッチは冷気や雷を和らげる。"

---

## 11. やらないこと

- ⛔ **魔法使いの AI に体質を読ませる**(スリープや属性呪文の選び直し)→ A-2(伝承判定と AI)。
- ⛔ **伝承判定**(魔法学 / 歴史 / 宗教。習熟を持つ者だけが振れる)→ A-2。
- ⛔ **弱点(2 倍)** — SRD に該当する敵が本作にいない(ユーザー決定で独自の弱点は付けない)。
- ⛔ **毒の免疫**(アンデッド・構造体・ガーゴイルは SRD では毒が効かない)→ 盗賊の毒塗り短剣と毒の継続ダメージ `:17384` / `:34191` に効く別の話。必要なら別チケット。
- ⛔ 酸・死霊・雷鳴・精神・聖の体質、物理の種類(スケルトンは殴打に弱い)。
- ⛔ 敵がパーティに与える属性ダメージ(ファラクサスのブレスなど)。これは味方側の火耐性 `:15039` で扱い済み。
- ⛔ 敵の図鑑・能力値の画面。
- ⛔ **`実装依頼書/README.md` への行追加**は、承認後に起草窓が引き渡しと一緒に行う。用意してある行:

    | 75 | [2026-09-28_enemy-traits.md](2026-09-28_enemy-traits.md) | **承認済** | 0% | 敵の体質(5e SRD)を戦いに効かせる。眠らない 10 種・炎/冷気/雷の半分と無効 5 種・弱点 0 件。⚠⚠⚠ 属性の 11 か所に `resolveElementDefense` を「底上げの後」に挟む / 眠りの免疫は `allySleep` の中だけ(`stunned` は 15 種類の効果と共有)。撤退 `?enemytraits=0`。「敵の様子を探る魔法」シリーズの A-1 |

---

## 12. 実装結果

(実装窓が埋める)
