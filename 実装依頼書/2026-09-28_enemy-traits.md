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

### 12-0. 着手前の実測(項目1・HEAD 1951914)

⛔ 本番(`index.html` / `tavern.html` / `audio.js` / `js/*.js`)と `tools/` は 1 バイトも触っていない。変えたのは本書 §12 だけ。
`git diff --stat e3880ba 1951914` = `dev-meetings/2026-09-28_scouting-magic.md` / 本書 / `実装依頼書/README.md` の **docs 3 本だけ**
(`13c2a42..1951914` でも docs 4 本 = #74 の依頼書を足しただけ)⇒ **§2 の行番号は HEAD `1951914` でもそのまま有効**(1 行もずれていない)。
⚠ `index.html` はディスク上 **CRLF**(`git check-attr eol` = crlf・39,742 行すべて CRLF)。本書は LF。
成果物(ログ・スクリプト)= scratchpad `…/77bd3943-0319-4699-9438-549ec95bd6b8/scratchpad/item1/`。

#### (1) §2-1 敵の表と `e.type`

- `ENEMY_TYPES` = `index.html:9645`〜`:10853`、**51 キー**(§2-1 の awk をそのまま実行)。✅
- §2-2 の 10 キーの行: skeleton 9853 / zombie 9872 / skeletonArcher 9890 / wraith 9909 / lich 9928 / caelum 9962 / pharaxus 10122 / stoneGolem 10156 / animatedArmor 10176 / stoneLegionary 10199 / ghostFlame 10584(対照: goblin 9661 / orc 9982 / gargoyle 10227 / hydra 10519)。✅ 全一致
- `undead: true` のプロパティ行 = **7 行・7 キー**(skeleton 9868 / zombie 9888 / skeletonArcher 9907 / wraith 9925 / lich 9955 / caelum 9976 / ghostFlame 10602)。✅
  ⚠ ただし範囲内を `grep -c "undead: *true"` で数えると **8** になる(`:9871` のコメント「全て undead:true」を拾う)。⇒ ドライバで数えるなら**キー単位**で数えること。
- `isUndeadEnemy(e)` `:27459` = `!!(e && ((e.def && e.def.undead) || e.type === "skeleton"))`。✅
  `holdPersonImmune(t)` `:27744` = `!t || isUndeadEnemy(t) || !!(t.def && (t.def.isBoss || t.def.boss))`(⭐ ボスも免疫。眠りの関数へは写さない)。
- **`e.type` は ENEMY_TYPES のキーと一致する**: 敵を作るのは `createEnemy(typeKey, tx, ty)` `:12830` の 1 本だけで、`{ def: ENEMY_TYPES[typeKey], type: typeKey, … }` を返す。
  呼び口 9 か所(`:13876` / `:24253` / `:24447` / `:25763` / `:26382` / `:32648` / `:33459` / `:33575` / `:33706`)すべてが `createEnemy(…)` → `enemies.push`。
  `.type =` / `.def =` の再代入は `index.html` に 0 件(ヒットは `btn.type = "button"` の 2 件だけ)。⇒ `ENEMY_TRAITS[e.type]` で引いてよい。✅
- ⭐ stoneGolem / animatedArmor / stoneLegionary / gargoyle / shadowBeast は `faction: "beast"`(第三勢力)。
- 新しく足す名前(`ENEMY_TRAITS` / `enemyElementMult` / `enemySleepImmune` / `resolveElementDefense` / `__dfEnemyTraits`)と URL キー `enemytraits` は `index.html` / `tavern.html` / `js/*.js` / `tools/*.js` に **0 件**(衝突なし)。✅

#### (2) §2-3 属性の 11 か所 — 行番号の対照表(項目2 はこの表で入れる)

「底上げ」= 最後の `Math.max(1, …)` の行。「差す位置」= **`tryDisplacement` の後・HP 行の直前**(下の崩れ 3)。表示・ログはすべて HP 行より**後**。

| # | 関数(開始行) | 技 / 属性 | ダメージの乱数 | 底上げ | `tryDisplacement` | `__tookFireAcid` | **HP 行** | `showDmgAt` | ログ | 撃破 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `applyWeaponSpecialEffects` 23104(余波ループ 23141〜) | 余波 / `swIsFire ? fire : lightning` | `rollDiceDD` 23151 + セーヴ `d20` 23153 | 23155 `let sdmg = Math.max(1, sr.total)` / 23156 セーヴ半減 | なし | 23159(HP の**後**) | **23157** `e.hp = Math.max(0, e.hp - sdmg)` | 23161 | 23169(体数だけ) | 呼び側 |
| 2 | 同上(追加属性) | `bonusDmgType` fire/cold/lightning(holy/acid は素通し) | `rollDiceDD` 23179 / 対アンデッド 23184 | 23180 `let extra = Math.max(1, br.total)` + 23185 `+= Math.max(1, …)` | なし | 23189(HP の**前**) | **23190** `target.hp = Math.max(0, target.hp - extra)` | 23215 | 23218(`extra`) | 呼び側 |
| 3 | `allyFireBolt` 27960 | ファイアボルト / fire | `rollDiceDD` 28045 | 28047 **`const dmg`** = Math.max(1, …) | なし | 28054 | **28055** | 28058 | 28060(`${dmg} 炎ダメージ`) | 28063 |
| 4 | `allyFireball` 28636 | ファイアボール / fire | **`Math.random`** 28706 + `d20` 28702 | 28709 | 28711 | 28712 | **28713** | 28717 | 28721(体数) | 28719 |
| 5 | `allyLightningBolt` 28845 | ライトニングボルト / lightning | **`Math.random`** 28941 + `d20` 28937 | 28943 | 28944 | — | **28945** | 28949 | 28953(体数) | 28951 |
| 6 | `allyConeOfCold` 28959 | コーンオブコールド / cold | **`Math.random`** 29038 + `d20` 29034 | 29040 | 29041 | — | **29042** | 29046 | 29055(体数) | 29053 |
| 7 | `allyIceStorm` 29062 | アイスストーム / cold | **`Math.random`** 29123 + `d20` 29119 | 29126 | 29128 | — | **29129** | 29133 | 29140(体数) | 29138 |
| 8 | `allyBurningHands` 29146 | バーニングハンズ / fire | **`Math.random`** 29231 + `d20` 29227 | 29234 | 29235 | 29236 | **29237** | 29241 | 29245(体数) | 29243 |
| 9 | `allyLightningArrow` 30981(本命中) | lightning | **`Math.random`** 31039 | 31040 | 31041(`if (!tryDisplacement(enemyIdx)) {` の中) | — | **31042** | 31046 | 31047(`${dmg} 雷ダメージ`) | 31048 |
| 10 | 同上(飛び散り) | lightning | **`Math.random`** 31076 + `d20` 31072 | 31078 | 31079 | — | **31080** | 31084 | 31087(体数) | 31085 |
| 11 | `tryReflectEnemySpell` 32700 | 反射 / `spell.fireAcid` のときだけ fire | `spell.rollDamage()`(呼び側の関数) | 32729 **`const dmg`** = Math.max(1, …) | なし | 32730 | **32731** | 32733 | 32734(`${dmg} ダメージ`) | 32736 |

- 範囲の 7 か所(#1 #4〜#8 #10)は**すべて敵ごとの `for` ループの中**(`for (const idx of affectedIdxs / lineEnemyIdxs / coneEnemyIdxs / splashIdxs)`・余波は `for (let i …)`)。⇒ 1 体ずつ判定できる形。✅
- `applyWeaponSpecialEffects` の呼び口は 2 か所(主人公 `:23438` / 仲間 `:27449`)だけ。武器の属性キーの実数 = cold 5 / fire 4 / lightning 4 / holy 3 行(`bonusDmgType` + `shockwaveType`)。✅ `acid` を持つ武器は 0 本(`bonusType === "acid"` はガードだけ)。
- 反射の `spell` は `{ name, rollDamage, fireAcid }` だけで、**冷気・雷の印を持たない**。呼び口は 2 か所: ブレス `:32803`(`fireAcid: true`)と敵の呪文 `:33087`(`fireAcid: meta.el === "fire"`)。`ENEMY_SPELLS` `:32932` の属性は fire / arcane の 2 種だけ ⇒ **反射で冷気・雷が出る経路は無い**(§5 の「`fireAcid` のときだけ fire」で過不足なし)。
- 主人公の魔法使いも `executeSkillOn` `:19871` → `:19974〜19984` で同じ `ally*` を呼ぶ。✅ 主人公専用のスキル(`skill_*` `:23450〜23520`)は戦士の 7 本だけで属性なし。
- **11 か所の外の属性経路を振る舞いで探した**(`fire` / `cold` / `lightning` / `ice` / `element:` / `bonusDmgType` / `shockwaveType` / `fireAcid` / `fireball-scorch` / 呪文の `flavor` の「炎・冷気・雷・氷・火」/ `ally*` 全 52 本の HP 行):
  - パーティ発の属性ダメージは**上の 11 か所で全部**。`flavor` に属性語を持つ呪文は 7 本(22187 / 22207 / 22214 / 22222 / 22229 / 22238 / 22285)= #3〜#10 と 1 対 1。
    `allyMagicArrow` / `allyMagicMissile`(arcane)、`allyHailOfThorns` / `allyConjureVolley` / コードン(`tickCordonZones` 31094〜・`fireball-scorch` の地面演出を流用しているだけ)/ `allyEarthShatter` / 斧系は属性なし。闇市は `wand_polymorph` だけでダメージなし。✅
  - 範囲外(敵が敵を撃つ): `applyEnemySpellDamage` `:32947〜32953` = 敵のキャスターが**第三勢力(beast)**へ fireBolt / scorchingRay を撃つ経路。beast 側で表に載るのは石の 3 種(眠りだけ・属性なし)なので、**入れなくても数字は変わらない**。§11「敵が与える属性」と同じ扱いで**触らない**。
- `resolvePhysDefense(enemyIdx, attackerEnh, dmg, label)` `:17046` ✅ / `applyPhysResistHalving(dmg)` `:17031` = `Math.max(1, Math.floor(dmg / 2))` ✅ /
  `showRollAtEnemy(idx, html, type)` `:20590` ✅(`rollTargetLine` は `1d20(` と `vs AC|DC` を含む html にしか判定行を足さない = IMMUNE/RESIST の文言は素通し)/ `updateInfo(message)` `:15772` ✅ / `showDmgAt(worldX, worldY, dmg, isCrit)` `:21112`。
  `resolvePhysDefense(` の呼び口は 11 か所(17235 / 26796 / 29330 / 29489 / 29575 / 29643 / 29904 / 30632 / 31639 / 31709 / 31772)。
- 乱数: `d20()` `:20476` = `1 + Math.floor(Math.random() * 20)`、`rollDiceDD` `:20477` も `Math.random` を読む ⇒ **`Math.random` を 1 か所固定すれば 11 か所すべての乱数が止まる**(下の崩れ 1)。
- 敵の HP を引く行は `grep -nE "(\b(t|target|e|enemy|tgt|foe|o)|enemies\[[^]]+\])\.hp *(= *Math\.max\(0,|-=)" index.html` で **31 行**(依頼書「32 か所」は数え方の違いの範囲。敵→敵の 1 行を含む)。

#### (3) §2-4 眠り

- パーティが敵を眠らせる経路は **`allySleep` `:28069` の 1 本だけ**。✅ 呼び口 = 味方 `mageAI` `:30305`(判断 `:30300〜30302`)と主人公 `executeSkillOn` `:19977`。
  - 範囲 `const affectedIdxs = enemiesInArea(best.tx, best.ty)` `:28166` / 霧 `:28187` / `let hits = 0, resists = 0` `:28191` / **命中ループ `:28193〜28205`** / `t.stunned = Math.max(t.stunned || 0, skill.stunTarget)` **`:28200`** / 結果の吹き出し `:28207〜28210`(`命中 ${hits} / 抵抗 ${resists}<br>範囲 ${affectedIdxs.length}体`)/ ログ `:28212`。✅
  - ⚠ `verify_aoe_coverage` の §4(依頼書の `:842-857` ⇒ 実際は **`:836〜857`**、(4a) は `:847`)は吹き出しの「**範囲 N体**」を `areaFromPops` で読む。⇒ 免疫の表記は「範囲 N体」の書式を崩さずに足すこと。
- 敵の `stunned` を非 0 で書く箇所(`allySleep` を除く)= **13 か所**(依頼書「他に 15 種類」):
  パーティ発 12 = メデューサの鏡 21421(`applyBattleStartConsumables`)/ 牙の魅了 21443(`tryNegatePreemptive`)/ 武器のクリティカル 23224 / 主人公の盾打ち 23504(`skill_shieldBash`)/ 不意打ち 25366(`applySurpriseStun` `:25363`)/ 廃坑の開幕 25785(`applyMineRangedOpening`)/ 街道の警戒 25809(`applyRoadVigilance`)/ ターン・アンデッド 27719 / ホールド・パーソン 27859 / **コーンオブコールドの凍結 29049** / アースシャッター 29652 / 仲間の盾打ち 29988。
  敵発 1 = **単眼の暴君の「眠りの目」`:20884`**(第三勢力の敵を眠らせる)。0 へ戻す行は 21262 / 21510。
  `applySurpriseStun(indices)` `:25363` は実在(呼び口 25398 / 26407)。✅ 味方用 `sleepImmune(unit)` `:20655` は実在・中身は依頼書どおり(エルフ + `hasFreeAction`)。✅
- `helpless` 側: `grep -c "stunned > 0"` = 22 / `helpless *=` の行 = 19(依頼書「約 15」)。
- ⭐ ⇒ §2-4 の方針(免疫は `allySleep` の命中ループの中だけ)は**そのまま成り立つ**。パーティ発の眠りの経路は他に無い。

#### (4) §2-5 ハイドラの首

- `__tookFireAcid = true` の行 = **6 か所** 23159 / 23189 / 28054 / 28712 / 29236 / 32730。✅ 読むのは `defeatEnemy` `:17390` の `:17394`、リセットは `:17395` と `initHydra` `:24811`。✅
- ⚠ 23159(余波)だけは HP 行の**後**、他の 5 か所は**前**。どちらでも挙動は同じ(`defeatEnemy` は HP 行の後)だが、判定の挿入で**この順序を動かさない**。
- ⚠ `createEnemy` は `hydraHeads` / `headHpMax` を初期化しない(`initHydra` `:24800〜` が本番の配置時に入れる)。⇒ 受入 (3b) で盤面にハイドラを置くときは、ドライバが `hydraHeads` / `headHpMax` を自分で入れる。

#### (5) §2-8 撤退の定数

- `AOE_COVER_ON` `:28393-28394` / `CONE_CAST_ON` `:28566-28567` = `new URLSearchParams(window.location.search).get("…") !== "0";`(2 行の形)。✅

#### (6) ⚠ 崩れた主張(依頼書の記述 → 実測 → 影響)

1. **§8 方針「乱数を固定し(`d20` / `rollDiceDD` を決まった値にする)」** → 11 か所のうち **7 か所(#4〜#10)はダメージを `Math.floor(Math.random() * sides) + 1` で直接振る**(`rollDiceDD` を通らない)。`rollDiceDD` は #1〜#3 だけ、#11 は呼び側の `rollDamage`。
   → **影響(項目3)**: `d20` / `rollDiceDD` の差し替えでは 7 か所の素のダメージが揺れたまま。⇒ **`Math.random` そのものを固定する**(`d20` / `rollDiceDD` も内部で `Math.random` を読むので、これ 1 つで全部止まる)。(1b) の「素のダメージはゴブリンに撃った減りから取る」は、**同じ乱数列で 2 走行**(ゴブリン / 体質の敵)にして成立させる。
2. **§2-3「`dmg = resolveElementDefense(idx, "<属性>", dmg).dmg;`」** → #3(`:28047`)と #11(`:32729`)は **`const dmg`**。そのまま代入すると TypeError。#1 の変数は `sdmg`、#2 は `extra`。
   → **影響(項目2)**: #3 / #11 は `const` → `let`(または別名で受ける)。#1 / #2 は変数名を合わせる。⭐ HP 行より後の `showDmgAt` とログはすべて同じ変数を読むので、**変数を上書きすれば (1e) は自動で満たされる**(= `preshow` 変異は「表示にだけ判定前の値を渡す」形で書く)。
3. **§2-3 罠 1「底上げの後、HP を引く行の直前」** → 正しい。ただし 7 か所(#4〜#10)では底上げと HP 行の間に **`tryDisplacement`(残影の回避)** が挟まる。判定をその前に置くと、回避された攻撃にも IMMUNE/RESIST の吹き出しが出る。
   → **影響(項目2)**: 差す位置は「`tryDisplacement` の後 = HP 行の直前」(上の表の「HP 行」の真上)。#9 は `if (!tryDisplacement(enemyIdx)) {` の**中**。
4. **§2-4「stunned を書く効果が他に 15 種類」** → **13 か所**(パーティ発 12 + 敵発 1)。方針は不変。
5. **行の指し違い(中身は正しい)**: §2-3 物理の呼び口の例 `:29344` → **`:29330`**(`:29344` は閉じ括弧)/ §2-7 アイスストームの `dmgDice` `:22233` → **`:22234`**(`:22233` は `name`)/ §8 `verify_aoe_coverage` の §4 `:842-857` → **`:836〜857`**。
6. **§2-1「`undead: true` が 7 行」** → プロパティは 7 行で正しいが、範囲を `grep -c` で数えると**コメントを拾って 8**。受入で数えるならキー単位で。
7. **§8 盤面「ゴブリン・オーク・スケルトンを並べている」** → `verify_aoe_coverage` はゴブリンが主で、スケルトン/オークはホールド・パーソンの §5(`:911〜915`)にだけ出る。`verify_cone_cast` は合成盤面を**自前の LCG** で敷く。⇒ 流用するのは**盤面の据え付けの口**(下の (7))で、敵の種類は新受入が決める。
8. **§8 勝率の記録「`probe_s2_clear.js` の `--arm qs:<key>=<val>` を S5/S6 へ広げる」** → そのままでは使えない(下の (10))。

#### (7) 盤面の流用元(項目3 の雛形)

- **`verify_aoe_coverage.js`**(port 10141): `openIndex`(`:258〜287`)が `evaluateOnNewDocument` で `currentScenario = 'goblin-mine'`・`partyMembers`(SEED_PARTY `:252`)・`xp = 45000`・`prologueSeen` を焼いて `index.html<qs>` を開き、**裸の識別子**(`allies` / `enemies` / `createEnemy` / `pickAoeOrigin` / `mapData`)で待つ。
  `installProbe`(`:312〜`)= 隔離レシピ(`gameOver = true` / `encounterActive = false` / `window.sleepMs = () => new Promise(r => setTimeout(r, 0))`〔⛔ `Promise.resolve()` はマイクロタスク飢餓〕/ `moveEnemies` と `dfPlayCast` と await される rAF 演出 3 本〔`spawnFireballProjectile` / `spawnArrow` / `castMagicMissileBarrage`〕を即解決)+ `spawnGroundFx` と `.rollPop`(MutationObserver)の記録。
  盤面 `__ap.board(spec)`(`:400〜`)= 既存の敵は消さずに `alive=false`(添字並列の配列を崩さない)→ 床が最長の行(lane)を実測して**相対オフセット**で置く → 敵は **`createEnemy` → `enemies.push` → `createEnemyDom` の 3 点セット**(el の無い偽の敵は `defeatEnemy` / `triggerEnemyDamageFlash` を壊す)で足し、`maxHp = hp = 400` で死なせない → `encounterEnemyIndices` を差し替え。
  ⚠ **乱数は固定していない**(命中の揺れは「記録するが assert しない」で逃げている)。
- **`verify_cone_cast.js`**(port 9940): `installBoard`(`:673〜`)が `renderWorld` / `moveEnemies` を黙らせ、`quiet(T)` で `sleepMs` / `dfPlayCast` / `showRollAtEnemy` / `showDmgAt` / `updateInfo` / `tryDisplacement`(→ false)/ `defeatEnemy`(→ alive=false)を `window.*` の差し替えで握る(⭐ 関数宣言は `window` に載るので本番の呼び口からも差し替えが効く)。盤面は `mkLcg(seed)`(`x = x*1664525+1013904223`)で敷く。撤退の対は `?conecast=0` を URL に付けた別ページ。
- ⇒ 新受入は aoe_coverage の `openIndex` + `installProbe` + `board()` を土台に、`showRollAtEnemy` / `showDmgAt` / `updateInfo` を**記録付きで**包み(`quiet` の形)、`Math.random` を固定する。撤退の腕は `index.html?enemytraits=0` を別ページで開く(ページ単位の定数)。

#### (8) 判断メモ(ブロックではない)

- **単眼の暴君の「眠りの目」`:20884`** は第三勢力の敵も眠らせる。第三勢力には石の 3 種(本チケットで眠らない側)が居るが、**敵発**なので範囲外(§2-4 の方針どおり `allySleep` だけ)。単眼の暴君と石の 3 種が同じ戦場に並ぶ固定配置は無い(石の 3 種は砦の隠し `:10945〜10946` / `:38227〜38228` だけ)。
- **コーンオブコールドの凍結 `:29047〜29050`** はセーヴ失敗で付く(ダメージと無関係)⇒ 冷気が**効かない**カエルムでも凍結は付く。§2-4 と (2c) の方針(凍結は今までどおり)に合うのでそのまま。
- ウィル・オ・ウィスプの呪文は `spells: ["fireBolt"], projectile: "cold"` `:10600`(見た目は冷たい光・中身は fireBolt)⇒ 反射すると **fire** 扱い。ウィスプは炎・冷気とも半分なので数字は変わらない。

#### (9) 既存 golden 7 本の着手前の色(素で 1 回ずつ・直列・HEAD `1951914`)

`run_golden7.ps1`(PowerShell から `node tools/<本>.js` を引数なしで直列)。ログ = `item1/<本>.log`。#74 の実装後走査 `after74.tsv` の同じ腕と並べた。

| 本 | port | exit | 総括行 | 秒 | `after74.tsv` の同じ腕 | 型 |
|---|---|---|---|---|---|---|
| `verify_aoe_coverage` | 10141 | **0** | 28/28 PASSED FAILED 0 PENDING 0 | 3 | exit 0・28/28 | 緑 |
| `verify_cone_cast` | 9940 | **0** | 19/19 PASSED FAILED 0 PENDING 0 | 89 | exit 0・19/19 | 緑 |
| `verify_bolt_aim` | 10301 | **0** | 23/23 PASSED FAILED 0 PENDING 0 | 2,246 | exit 0・23/23(2,245.8 秒) | 緑 |
| `verify_bolt_bounce` | 10371 | **0** | 15/15 PASSED FAILED 0 | 10 | exit 0・15/15 | 緑 |
| `driver_sce1_events` | 8845 | **1** | `[drv] RESULT: 211/214 passed` | 49 | exit 1・211/214 | **赤・型3(真に無関係)** |
| `verify_road_boon` | 9790 | **0** | 20/20 PASSED FAILED 0 PENDING 0 | 70 | exit 0・20/20 | 緑 |
| `driver_action_priority` | 8843 | **0** | RESULT: PASSED 92 / FAILED 0 / PENDING 0 | 64 | exit 0・92/0 | 緑 |

- `driver_sce1_events` の赤 3 件の理由(1 行): **`sceneFlags` のキーが 3 本と焼かれているのに、#53 の `s3_novice_swayed` で 4 本になっている**(FAIL `(2)` / `(4d)` / `(N2-隣)` の 3 件とも `["mine_alerted","mine_ranged_opening","s3_novice_swayed","servant_rescued"]`)。⇒ 体質とも不意打ちとも無関係。⭐ 依頼書 §2-4 が名指しした **G10(不意打ち)は緑**(N14 の変異で G10/G10b が同時に赤くなる = 装置も生きている)。`verify_road_boon` の `(2c)`(街道の備え = 最初の交戦で stunned ≥ 1)も緑。
- 7 本とも **#74 の実装後走査と色・件数が同一**(`driver_sce1_events` も 211/214 で同じ)。⇒ 着手前の色 = 緑 6 / 赤 1(型3)。項目5 で `driver_sce1_events` が 211/214 から動いたら #75 を疑う。

#### (10) 勝率の記録の道具(§8 末尾)

- **`probe_s2_clear.js` はそのままでは S5/S6 に使えない**(崩れ 8):
  - 舞台が **`const SCEN = 'bandits-forest'` `:106` に固定**(`--scen` の口が無い)。期待値の表も `S2_EXPECT`(★2 / NPC 2)`:123` だけ。
  - `--arm qs:<key>=<val>` は **白リスト `INDEX_SWITCHES = { dndrange, mopup, s2fold }` `:126`** に無いキーを exit 2 で止める。しかも表の 3 本はどれも「`=0` で const が **true** になる」極性(`RANGE_LEGACY` / `MOPUP_OFF` / `S2_FOLD_OFF`・`want: (v === '0')` `:146`)。`ENEMY_TRAITS_ON` は逆(`=0` で false)。
  - 腕は **1 つの spec しか取らない**(`base` / `xp:<N>` / `qs:<k>=<v>` / `mine` のどれか)⇒ 「S5/S6 に見合う Lv(`xp:`)」と「`qs:enemytraits=0`」を**同時に**指定できない。
  - ⭐ 使える部品: 酒場 → `prepScenario` → `regeneratePartyMembers()` → `departToScenario()` の本番の出発(人数が本番どおり)、`evaluateOnNewDocument` + `history.replaceState` で index 側の `location.search` を着弾前に書き換える口(`:254〜274`)= ページ単位の定数 `ENEMY_TRAITS_ON` にも届く、決着の 4 分類(clear / defeat / stall / timeout)と装置 assert。
  - ⚠ `probe_s2_clear` は母集団の腕(素 + `--negative`)なので、中を広げると #75 の非退行の対象そのものが動く。
- **`auto_debug_run.js --scen <id> --qs enemytraits=0` も使えない**: 巡回の 2 走行目以降は `index.html?autodebug=resume` `index.html:39596` へ飛ぶので **`--qs` が 1 走行目にしか付かない**(ページ単位の定数が黙って ON へ戻る)。さらに `index.html` の直起動は XP を焼かないので **Lv1 の既定パーティ**になる。
  - 実測(1 回だけ): `node tools/auto_debug_run.js --scen dragon-lair --runs 1 --speed 15 --port 10470` → exit 0・**43 秒**・`#0 dragon-lair [defeat, 43s, R5] HP=0 生存=3`(主人公だけ倒れて終わり・critical 0 / warn 0)。⇒ Lv1 では竜の巣の最初の交戦で終わり、**ファラクサスにもアンデッドにも届かない** = 体質の差を測れない。
- ⇒ **見立て = 新しい道具**(例 `tools/probe_enemy_traits_winrate.js`)。`probe_s2_clear.js` をコピーして次を変える: ① `--scen undead-temple|dragon-lair` と舞台ごとの期待値表 ② 腕を「`xp:<N>` + `qs:enemytraits=0|1`」の組で取る ③ スイッチ表に `enemytraits: 'ENEMY_TRAITS_ON'` を**極性つき**で足す(`=0` → false を装置 assert (0f) で確かめる)④ 到達ノード数を記録する列を足す(今の `probe_s2_clear` は決着と生存数だけ)。⛔ `probe_s2_clear.js` 本体は触らない(母集団の腕を動かさない)。
  - シナリオ id: S5 = **`undead-temple`**、S6 = **`dragon-lair`**(`index.html:3367` の ALL 表)。酒場の出発では `prepScenario` にこの id を入れる。`index.html` を直に開くなら `sessionStorage["dragonfighters.currentScenario"]` を goto 前に焼く(`?scen=` は autodebug 経由でしか効かない)。
  - XP は Lv の見合う値を焼く(D&D 3.5 の累積 = `500 × Lv × (Lv−1)`。S5/S6 の想定 Lv は未確認 = 道具を書く項目で酒場の推奨 Lv を実測して決める)。
  - 所要の見込み: `probe_s2_clear` は 1 走行の上限 `--max 420` 秒(既定)・#74 の走査で 3 走行 117 秒。S5/S6 は長いので **1 走行 3〜7 分**と見る ⇒ S5・S6 × 2 腕 × N=10 = **40 走行 ≒ 2〜5 時間**(この機械は約 2.6 倍遅い)。`--workers` は 1(ポート衝突と CPU 競合で揺れを増やさない)。

#### (11) 母集団の着手前の色 — #74 の実装後走査 `after74.tsv` を再利用できるか

- **判定 = 素の 148 腕は #75 の着手前の色としてそのまま使える。`--negative` の 7 腕は使えない(#74 用に選んだ腕なので、#75 は選び直して影のツリーで測る)。**
  - 根拠: `after74.tsv` は #74 の実装後の本番 `13c2a42` で走った(`sec12_5_6.md` の (1)〜(3))。`git diff --stat 13c2a42 1951914` = docs 4 本だけ(`index.html` / `tavern.html` / `audio.js` / `js/` / `tools/` / `assets/` は 0 バイト差)⇒ **本番のバイトも、走らせた本のバイトも #75 の着手前と同一**。
  - 素の 148 腕 = `armlist75.json` の `union` 147 本(ページを開く本の和集合)+ `verify_pen_sample`(素)。`--negative` の 7 腕 = `driver_bgm_title` / `driver_bgm_town` / `probe_s2_clear` / `verify_eol_doorfix` / `verify_mercenary_roster` / `verify_pen_narration` / `verify_pen_sample` は、#74 の署名(narration / playSampled / sfx-manifest …)で選ばれた腕。
    #75 は `index.html` の 11 か所 + `allySleep` を書き換えるので、**変異アンカーを `index.html` に持つ `--negative`** が壊れる候補になる(`--negative` を持つ本 51 本のうち、粗い grep で変異の口を持つ本 47 本。名指しの golden のうち `driver_sce1_events` だけは `--negative` なし)。
    ⇒ 項目5 は「`index.html` へ変異を当てる `--negative` のうち、アンカーが #75 の差分に掛かる本」を**機械で**選び(各本のアンカー文字列を `1951914` と #75 後の `index.html` に当てて件数が変わるかで判定)、その着手前の色は **影のツリー**(本番のバイトだけ `1951914` に戻したコピー)との交互の対比較で取る。⛔ 表を目で選ばない。
- **`after74.tsv` の中身**: 155 行 + ヘッダ・18 列 = `arm_id` / `book` / `arg` / `exit_code` / `pass_count` / `fail_count` / `pending_count` / `duration_sec` / `route1_n` / `route1_fingerprint`(assert id と合否の**並び**の sha256 先頭 16 桁)/ `route2_n` / `route2_fingerprint`(判定行の**多重集合**)/ `summary_line` / `strays_killed` / `killed` / `started_at` / `stdout_path` / `fp_json`(`fp_after/<arm_id>.json` に id 列と多重集合の全量)。腕の合計 **285.3 分**。
- **赤の腕 = 24**(exit ≠ 0 か FAIL > 0):
  - 素 20: `driver_field_step2`(63/64・`D2-dragon-lair`)/ `driver_field_step6`(55/59)/ `driver_grid_p4`(exit 3・変異 `n1ringonly` のアンカー不在)/ `driver_grid_p8`(55/56)/ `driver_mapeditor`(176/179)/ `driver_mapeditor_painting`(105/106)/ `driver_monsters_griffon`(14/17)/ `driver_monsters_hobgoblin`(12/14・観測 0 件)/ `driver_monsters_umberhulk`(21/22)/ **`driver_sce1_events`(211/214・exit 1)** / `driver_speech_engine`(16/17)/ `driver_speech_v2`(45/46)/ `probe_bandit_map` `probe_s2_fold` `probe_swamp_map`(exit 3・引数なしでは走らない調査道具)/ `probe_n4_stall`(exit 1・停滞が観測されない)/ `probe_party_size`(13/20・600 秒で打ち切り)/ `sweep_recruit_balance`(exit 1・装置 4/4 崩れ)/ `verify_walk_block`(22/23)/ `verify_world_heromark`(17/18・`(1c)`)。
  - `--negative` 4: `probe_s2_clear`(exit 1・`wipeblind` が赤くならない)/ `verify_mercenary_roster`(exit 0・FAIL 16 は変異が意図どおり赤くした行)/ `verify_pen_narration`(exit 3221226505・node の異常終了 1 回きり)/ `verify_pen_sample`(exit 0・同上の意図した赤)。
- **既知の非決定(着手前から揺れる = 緑→赤が出ても即 #75 のせいにしない・ただし影のツリーで決着を付ける)**: `driver_field_step2` の `D2-dragon-lair` / `driver_monsters_hobgoblin`(観測 0 件)/ `driver_monsters_griffon` / `driver_field_step6`(指紋が走行ごとに動く)/ `verify_world_heromark` の `(1c)` / `verify_pen_narration --negative`(node の fast-fail)/ `verify_mercenary_roster --negative` の `(2z3)`(名簿の抽選)/ `driver_grid_p5`(抽選の職業名が本文に出る = 経路②だけ揺れる)。⚠ この一覧も要約(#74 の崩れ 20)= 足りないと思って読むこと。
- **項目5 の手順(再利用する道具と直すべき点)**:
  1. 走行器 = `…/39a966a8-…/scratchpad/item5/sweep75.py`。⚠ **中身が他のフォルダを直に指している**: `HERE` = 兄弟の `item1b/`(指紋の抽出器 `fp74.py` をそこから import)、`ARMS` = `item5/armlist75.json`、`--out <dir>` を付けると出力名は `after74.tsv` / `after/` / `fp_after/` に**固定**。
     ⇒ #75 用には `sweep75.py` と `item1b/fp74.py` を #75 の scratchpad へコピーし、`ARMS` を #75 の腕の表(素 148 + `verify_enemy_traits` の素/`--negative` + 上で選び直した `--negative`)へ、出力名を `after75.tsv` へ書き換える。⛔ `after74.tsv` を上書きしない(着手前の色そのもの)。
  2. 中断と再開: 1 腕終わるごとに TSV へ 1 行追記し、再起動時は TSV にある `arm_id` を **SKIP**(`RESUME: N arms already done`)= 失うのは走行中の 1 腕だけ。直列のみ(ポートの同番が 20 組ある)。`timeout` で包まない(打ち切りは内部の `taskkill /T /F`・`probe_party_size`(素)だけ 600 秒、他は 5400 秒)。毎腕後に `df_*` の居残り Chrome を掃除(node は殺さない)。
  3. 比較 = `item5/cmp75.py -v`(2 経路の指紋の突き合わせ)。緑→赤の帰属 = `item5/mkshadow.py` で影のツリー(`item5/shadow/` の型: 作業ツリーを `.git` と `source_images` を除いて**実体コピー**・`tools/` も実体〔junction だと ROOT が本番へ戻る〕)を作り、本番のバイトだけ着手前の blob へ戻す。⚠ `mkshadow.py` は #74 の 7 ファイル + 粒 33 本を**名指し**で戻す作り ⇒ #75 では `index.html` だけを `1951914` の blob から **CRLF へ変換して**置く(`git check-attr eol` を読んで変換し、「HEAD の blob を同じ変換にかけたもの == 作業ツリーのバイト」を検算する形はそのまま流用)。
     `item5/pair75.py <outdir> <N> <book[:--negative]>…` で本番と影を**交互**(奇数回は本番が先)に N 対走らせる。
  4. ⚠⚠ **試遊サーバ 8765**: 今は LISTEN 中(pid 5200・ユーザーのもの)。母集団の `auto_debug_run.js`(素)は**既定でポート 8765 を立てる**(`--port` の既定値)⇒ そのまま走らせると `EADDRINUSE` で偽の赤。#74 は再開時に 8765 が空いていた。⇒ 項目5 の前にユーザーへ「8765 を止めてよいか」を確かめる(止めない場合は `auto_debug_run` を走査から外して理由を §12 に書く)。走査の後は `ゲームを起動.vbs` と同じコマンドで立て直す(#74 §12-5 (7))。
  5. 見積もり: 素 148 腕で約 **285 分**(#74 の実測)+ 新受入 2 腕 + 選び直した `--negative`。最長は `verify_bolt_aim` 約 37 分。

#### (12) ポート

- base **10459** / 変異 **10460〜10467**: `netstat -ano` で LISTEN 0 件。`tools/*.js` の `arg('port', …)` の台帳の最大は `verify_pen_sample` 10451(変異 〜10458)。`grep -E "104(59|6[0-7])" tools/*.js tools/*.py` のヒットは `verify_road_ambush.js:686` の乱数表の小数 1 件だけ(ポートではない)。✅
- golden 7 本のポート = aoe_coverage 10141 / cone_cast 9940 / bolt_aim 10301 / bolt_bounce 10371 / sce1_events 8845 / road_boon 9790 / action_priority 8843 = **互いに衝突なし・8765 を使わない**(各本が自前のサーバを立てる)。試遊サーバ 8765 は LISTEN 中(pid 5200・ユーザーのもの)で、止めていない。
