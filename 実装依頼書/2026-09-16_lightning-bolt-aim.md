# #68 ライトニングボルトを敵へ向けて 10 マス撃つ

- **起草**: 2026-09-16(起草窓 `claude-c5` / セッション `52dfe631`) / **ステータス**: **承認済**(2026-09-16 ユーザー承認)
- **基準コミット**: `157a9ca`(#67 着地・push 済。`origin/main` と一致・作業ツリー clean)
- **触るファイル**: `index.html` / `tavern.html`(flavor 1 行 + changelog 1 行) /
  `tools/verify_bolt_aim.js`(新規) / `実装依頼書/README.md` /
  (必要な場合のみ)`tools/verify_aoe_coverage.js`(変異 m8 のアンカー 1 行)
- ✅ **並走なし**: 実装窓の #67 は着地済みで、起草時点の未コミット差分は 0 件。
  ⚠ それでも add は**ファイル単位**、commit は `git add <paths> && git commit -m ... -- <paths>` の 1 複合コマンドで。

---

## 1. 目的

魔法使いの仲間が**ライトニングボルトをほとんど撃たない**。さらに、ライトニングボルトと一緒に装備した
**コーン・オブ・コールドは一度も選ばれない**。ユーザーの体感「なかなか撃たれない」は、2 呪文とも実測で再現した(§2-1)。

原因は発射率の機構にあり、習得導線ではない。直線は**術者からちょうど 3 マス、上下左右と斜めの 8 本の筋**にしか
伸びないため、敵が 3 マスより遠いか筋から外れていると必ず不発になり、通常攻撃へ落ちる。
しかも**不発は呪文の枠を減らさない**ので、魔法使いの AI は次の手番もライトニングボルトを最優先で選び続け、
その下の順位にあるコーン・オブ・コールドへ出番が回らない(§2-2)。

**ユーザー決定(2026-09-16)**:

- ✅ **射程を延ばし、8 本の筋ではなく敵へ向けた角度で直線を引く。長さは 10 マス**(宣言射程 `spellAoE` と同じ 50ft)。
- ✅ **壁で止める**(起草窓の既定。実測で成功率を 1 点も落とさないため聞かずに決めた = §2-4)。
- ⛔ 不採用「**射程を延ばすだけ**(8 方向のまま)」— 実測で **43% に頭打ち**。不発が過半のまま残り、
  コーン・オブ・コールドの居座りも消えない(§2-4)。
- ⛔ 不採用「**不発時は次の呪文へ回す**」— 居座りを原理的に消すが魔法使い AI の梯子に触る。
  狙いの修正で不発がほぼ消える見込みなので今回はやらない(§11)。受入 (2c) で居座りの実害が消えたかだけ観測する。
- ⛔ 不採用「長さ 20 マス」(設計書 spells.md の 100ft 線)— 宣言射程 10 マスと食い違い、狙いと貫通の 2 段定義になる。
  実測でも 8 マス以降は効き目がほぼ増えない。

---

## 2. 着手前の実測(起草窓が本番コードと実走で確かめた事実)

⭐ 実走はすべて**本番 0 バイト変更**のプローブで行った(起草窓 scratchpad の `probe68/probe68_spells.js`)。
配信はリポジトリを読むだけ、ポート 10391、Lv5 の 4 人 PT(戦士リーダー / 魔法使い / ドワーフ / 僧侶)、
`?autoplay=30&diag=1`、90 秒。仕込みは `tools/verify_cone_cast.js:64-80` と同じ 4 点
(`sessionStorage["dragonfighters.partyMembers"]` / `localStorage` の `knownSpells` / `partySkills`(**配列**) / `xp`)。
観測は既存シーム `window.__aoeStats[skill.name]` の `attempts / cast / demoted`(`noteAoeOutcome`)。

### 2-1. 装備していても撃たれない(1 回目の実走・廃坑・各 2 回)

| 装備(Lv5 の 8 枠) | 選ばれた | 撃てた | 不発 |
|---|---|---|---|
| ライトニングボルト ×8 | 15 | **0** | 15 |
| コーンオブコールド ×8 | 18 | 9 | 9 |
| バーニングハンズ ×8(#50 の対照) | 15 | 10 | 5 |
| 混成の LB ×2 | 13 | 2 | 11 |
| 混成の CC ×2 | **0** | 0 | 0 |
| 混成のファイアボール ×1 | 4 | 4 | 0 |

混成 = `magic-missile ×2 / sleep ×1 / fireball ×1 / lightning-bolt ×2 / cone-of-cold ×2`。
⭐ **コーンオブコールド単独はバーニングハンズと同程度** ⇒ 円錐の探索は健全(#50 が効いている)。問題は直線と梯子。
⚠ 2 回目の実走(§2-4)を足して**混成の CC は累計 4 走行すべて 0 回**。

### 2-2. ⚠⚠⚠ 不発が梯子に居座る仕組み(本番コード)

`index.html:28583` `allyLightningBolt`:

    const boltOk = !!best && bestCount > 0;                // :28622
    noteAoeOutcome(skill.name, boltOk, "line");            // :28623
    if (!boltOk) {
      await allyBasicAttack(ally, enemyIdx);               // :28626  ← 手番は通常攻撃で消費
      return;                                              //         ← 枠を減らさずに抜ける
    }
    ...
    ally.spellSlots[skill._slotId] = Math.max(0, ... - 1); // :28640  ← 枠の減算は成功経路だけ

`index.html:29999` `mageAI` の選択:

    else if (threatScore >= 25 && attackSpells.includes("lightning-bolt")) spellId = "lightning-bolt";  // :30077
    else if (threatScore >= 25 && attackSpells.includes("cone-of-cold"))   spellId = "cone-of-cold";
    ...
    const fallbackOrder = ["ice-storm", "lightning-bolt", "cone-of-cold", "fireball", ...];            // :30082

⇒ **ライトニングボルトは常にコーンオブコールドより先**に選ばれ、不発では枠が減らないので**永久に尽きない**。
⭐ 本チケットは梯子に触らない。**不発そのものを消す**ことで居座りを解く(受入 (2c) で観測)。

### 2-3. ⚠⚠⚠ 「3」が本体の 4 箇所に直書きされている — 探索だけ延ばすと当たらない

| `index.html` 行 | 何 |
|---|---|
| `:28610` | 探索の `for (let step = 1; step <= 3; step++)` |
| `:28631` | ダメージ対象を集める `for (let step = 1; step <= 3; step++)` |
| `:28646` | 無傷表示 `aoeLineSafeAllyTag(aTX, aTY, best.dx, best.dy, 3)` |
| `:28653`-`:28654` | 描画の終点 `aCX + best.dx * 3 * TILE_SIZE` |

加えて flavor「直線 3 タイル」が **2 枚**: `index.html:22133`(`MAGE_SKILLS`)と `tavern.html:4429`(酒場の鏡)。
コメント `index.html:28582` も「直線 3 タイル」。

⚠⚠ **探索だけ直すと、撃てたのにダメージは旧 3 マスの筋にしか入らない**(「撃ったのに 0 体」が出る)。
⇒ **直線上のマス列を 1 回だけ計算し、ダメージ・無傷表示・描画の終点が同じ列を読む**形にすること。
⭐ この罠は §8 の変異 **`dmgray`** として装置に内蔵する。

⛔ **一括置換しない。** 同じ文字列 `for (let step = 1; step <= 3; step++)` は本番に **4 箇所**あり、
残り 2 つはバーニングハンズの演出(`:12245` 火炎コア / `:28937` 円錐 3 段のバースト)。

### 2-4. 延ばす長さごとの成功率(2 回目の実走・廃坑と森・LB の試行 44 件)

プローブ v2 は **`window.allyLightningBolt` をページ内のメモリ上で包み**、試行のたびに術者と全敵のタイルを採って、
長さ L ごとに「当たる直線が引けるか」を再計算した(本番 0 バイト)。

⭐⭐⭐ **再計算は実物と一致した**: L=3・8 方向の計算値が 4 条件すべてで実際に撃てた割合と同値
(廃坑 LB 単独 8/24 = 33% ↔ 33% / 森 LB 単独 1/11 = 9% ↔ 9% / 廃坑混成 0/7 ↔ 0% / 森混成 0/2 ↔ 0%)。

| L | 8 方向の筋を延ばす | 敵へ向けた角度の上限 |
|---|---|---|
| 3 | 20% | 34% |
| 4 | 25% | 59% |
| 5 | 27% | 70% |
| 6 | 32% | 84% |
| 8 | 43% | 95% |
| **10** | 43% | **98%** |
| 20 | 43% | 100% |

- ⭐⭐⭐ **8 方向のまま延ばすと L=8 で 43% に頭打ち**。残り 57% は敵がどの筋にも乗っていない。
- 右列は「最寄りの敵までのチェビシェフ距離 ≤ L」の割合で、**視線は検査していない上限**。
  ⚠ しかも全 `enemies` の最寄りで数えている。本チケットは候補を**交戦中の敵**に絞る(§5)ので、実値は下がりうる。
  ⇒ 受入 (2a) の閾値は上限 98% ではなく **70%** に置く。
- ⭐ **壁越しは全 L・全 44 件で 0%**。壁で止めても 8 方向版の成功率は 1 点も落ちなかった ⇒ 壁で止めるを既定にした。
- 最寄りの敵までの距離は中央値 4 / 最小 1 / 最大 11。
- ⚠ 森では遠くの敵が道の帯で同じ行に並ぶので、「どれかの敵が筋に乗っているか」は距離を見ないと誤誘導になる。
  判定は必ず長さ込みで行うこと。

### 2-5. 射程と壁の既存の定義

| 対象 | 実測 |
|---|---|
| 宣言射程 | `index.html:20104` `spellAoE: { tiles: 10, ... }` // 50ft |
| 撤退 `?dndrange=0` | `:20108` `RANGE_LEGACY_TABLE.spellAoE = [5, 480]` を `:20113`-`:20115` が **`RANGE` へ上書き** ⇒ `getRange("spellAoE").tiles` は 5 |
| 射程の測り方 | `tileChebyshev`(`:20119`)= **チェビシェフ距離**。箱型・円錐の射程判定はすべてこれ |
| 壁 | `isTileWall(tx, ty)`(`:7089`)= 盤外 / 壁 / **塞いでいる扉** / 倒木などの障害物。`hasLineOfSight`(`:17975`)もこれを読む |
| 狙う相手 | `pickClosestEngagedEnemyFromAlly`(`:27138`)は **`encounterEnemyIndices`** だけを回し、護衛対象を除く |
| 設計書 | ボールト `spells.md` の Lightning Bolt = **100ft 線・幅 5ft・8d6**(実装は 3 マス・5d6)。⛔ ダメージは今回触らない |

⭐ **長さは `getRange(skill.range).tiles` から導出する**。直書きの `10` にしない。
⇒ 素で 10、`?dndrange=0` で 5 になり、宣言射程と実効射程の食い違い(#50 の降格の 35% を作った型)が構造的に再発しない。

### 2-6. 既存の検査が掴んでいるもの

| ドライバ | 掴んでいるもの | 本チケットでの扱い |
|---|---|---|
| `verify_aoe_coverage.js:189` 変異 **m8** | 逐語アンカー `          if (!AOE_COVER_ON && partyInArea(tx, ty, 1, 1)) { blocked = true; break; }` が `index.html` に**ちょうど 1 箇所** | ⚠⚠ **要注意**。下記 |
| `verify_aoe_coverage.js:696-706` (1c) | 盤面 L(術者 1 / 主人公 2 / 敵 3・4 が一列)。素 cast 1・撤退 `?aoecover=0` demoted 1 | 敵へ向けた直線も同じ列を通るので**緑のまま**のはず。実走で確認 |
| `driver_field_step7.js:313` `linePick` | 旧 3 マス 8 方向の**自前の写し**で降格率を記録するだけ。本番と突き合わせない | 変更不要。⚠ 記録の「line」は旧仕様を測り続ける |
| `verify_cone_cast.js:1683` (4a) | 配信全体の `const directions = [` の件数を**記録**に出すだけ(合否は円錐 2 関数の本文だけ) | 変更不要 |
| `driver_action_priority.js:1232` | `allyLightningBolt` を**スタブ**に差し替える名前の一覧 | 変更不要(関数名を変えないこと) |

⚠⚠ **m8 の扱い**: 新経路でも「`?aoecover=0` のときだけ味方の居るマスで直線を捨てる」判定は要る。
**逐語アンカー行を 1 箇所だけ残せる書き方なら m8 はそのまま生きる**。
撤退経路(§7)に旧ループを丸ごと残すとアンカーが **2 箇所**になり、`--negative` が exit 3 で即死する(#60 の「壊れるのは assert でなく変異アンカー」)。
⇒ ①マス列を歩く共通ループへ判定を 1 箇所に寄せて逐語で残す、を第一案。
②どうしても残せないなら m8 のアンカーを新しい行へ言い直し、**新旧どちらの経路にも効く**ことを `--negative` で確かめて §12 に理由を書く。
⛔ 期待値を写し直すだけの言い直しは禁止。

### 2-7. 呼び口の全数(配信ファイル全文 grep)

    grep -n '"lightning-bolt"\|line3\|allyLightningBolt\|aoeLineSafeAllyTag\|ライトニングボルト' \
      index.html tavern.html audio.js js/*.js world.html town.html title.html

| ファイル:行 | 何 |
|---|---|
| `index.html:13495` / `tavern.html:5109` | 巻物カタログ(触らない) |
| `index.html:19905` | `executeSkillOn` の分岐 = **リーダーが魔法使いのときも同じ関数** |
| `index.html:22128`-`:22134` | `MAGE_SKILLS["lightning-bolt"]`(`target: "line3"` / flavor) |
| `index.html:28174` | `aoeLineSafeAllyTag` 定義(`:28399` で `window.__aoeCover` へ公開。tools からの直接呼び出しは 0 件) |
| `index.html:28582`-`:28683` | `allyLightningBolt` 本体 |
| `index.html:30055`-`:30091` | `mageAI` の候補化・梯子・分岐 |
| `tavern.html:4429` | 酒場の呪文 UI の鏡(flavor) |

⭐ `target: "line3"` を**読む側は 0 件**(ラベルとしてだけ在る)。名前は変えなくてよい。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
書けるプレイヤー向けの要約は実在する(魔法使いが目に見えてライトニングボルトを撃つようになる)= §10。

### 2-9. 行末

`index.html` / `tavern.html` は**純 CRLF**(CRLF 39464 = LF 39464 / CRLF 10586 = LF 10586)。
⚠ 編集は `py` でバイト単位、**挿入する箇所の前後の行**を測ってから(同じファイルでも節ごとに違うことがある)。
依頼書の `.md` は LF。

**再測定コマンド**:

    py -c "d=open('index.html','rb').read(); print(d.count(b'\r\n'), d.count(b'\n'))"
    grep -nF 'for (let step = 1; step <= 3; step++)' index.html      # 4 件 (:12245 :28610 :28631 :28937)
    grep -nF '"lightning-bolt": {' index.html                          # :22128
    grep -nF 'spellAoE:    { tiles: 10' index.html                     # :20104

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 撤退スイッチ 1 本(`CONE_CAST_ON` の隣) / 直線のマス列を返すヘルパー 1 本 / `allyLightningBolt` の探索・ダメージ・無傷表示・描画をその列へ寄せる / `MAGE_SKILLS` の flavor / `:28582` のコメント |
| `tavern.html` | `:4429` の flavor 1 行 / changelog 1 行 |
| `tools/verify_bolt_aim.js` | **新規**。base **10301** |
| `tools/verify_aoe_coverage.js` | **§2-6 の ② のときだけ** m8 のアンカー 1 行 |
| `実装依頼書/README.md` | #68 行の進行度 |

⛔ `mageAI`(`:29999`-)の梯子・`fallbackOrder` は **1 文字も触らない**。
⛔ 他の呪文(円錐 / 箱型 / splash)の探索は触らない。`:12245` と `:28937` のバーニングハンズ演出も触らない。

---

## 4. STEP1 — 着手前の基準取り(本番も tools も 1 バイトも触らない)

#67 と同じ作法。

1. `git log --oneline -1` と `git status` を記録(`157a9ca`・clean を期待)。
2. 母集団を **3 段の union** で引く:
   - 触る語 — `grep -ln "lightning-bolt\|allyLightningBolt\|ライトニングボルト\|aoeLineSafeAllyTag" tools/*.js`
   - **変更したファイルを読む本** — `index.html` / `tavern.html` を読む本(#67 では 134 本)
   - **測定器のソースを読む測定器** — `grep -ln "'tools/driver_\|'tools/verify_" tools/*.js`
   ⭐ 増えなかったことを確かめるのが 3 段の価値(#67 では段 1・段 3 とも段 2 の真部分集合)。
3. 全部を**直列**で走らせ、ログ全文を保存。⛔ `timeout` で包まない。⛔ 並列にしない。
4. 走り終えた結果 TSV は **`*.FINAL.tsv` へ凍結**してから次を起動(⚠ 走査スクリプトが `"w"` で開き直すと全消え = #67)。
5. 着手前から非緑の本を**判定行の中身で** 3 分類して §12-0 へ。⚠ 「非緑 = 赤」ではない
   (#67 では非緑 20 本のうち 9 本が赤でないかフレーク。`probe_n4_stall` は健全なとき exit 1)。
   ⚠ **同じ色が 2 回続くフレークが実在する** ⇒ 2 回一致を安定の根拠にしない。

---

## 5. STEP2 — 敵へ向けて引く直線

### 5-1. 撤退スイッチ(`CONE_CAST_ON` `:28437` の直後)

    /* ★#68 撤退スイッチ ?boltaim=0 — ライトニングボルトを 2026-09-16 以前
     *   (術者から 3 マス・8 方向の筋・壁を見ない) へ戻す。
     * ⚠ 判定はこの 1 箇所だけ。ページ内で完結する (?conecast=0 と同じ流儀。sessionStorage へは写さない)。 */
    const BOLT_AIM_ON =
      new URLSearchParams(window.location.search).get("boltaim") !== "0";

### 5-2. 直線のマス列を返すヘルパー(1 本)

仕様(⭐ 実装窓が書く。形は自由だが次を満たすこと):

- 入力 = 術者のタイル `(aTX, aTY)`、向きの整数ベクトル `(dx, dy)`、長さ `L`、壁で止めるか。
- 出力 = 術者の次のマスから始まる**マス座標の列**。チェビシェフ距離 `L` を超えたら打ち切る。
  壁で止める指定なら **`isTileWall` が真のマスに入る手前で打ち切る**(そのマスは含めない)。
- ⭐ **狙った敵のマスを必ず通る**こと。整数倍の終点 `(aTX + dx·m, aTY + dy·m)` へ Bresenham で引けば
  格子点 `(aTX+dx, aTY+dy)` は誤差 0 で必ず選ばれる(`hasLineOfSight` `:17975` と同じ歩き方)。
  ⚠ 終点を `L / max(|dx|,|dy|)` 倍して**丸めると、狙った敵のマスを外すことがある**。丸めない。
- 撤退(`BOLT_AIM_ON === false`)では `L = 3`・8 方向・**壁を見ない**を**完全に再現**すること。

### 5-3. `allyLightningBolt` の探索

- `L = BOLT_AIM_ON ? getRange(skill.range).tiles : 3`(⭐ 直書きの 10 にしない = §2-5)。
- 候補の向き:
  - 素 = **`encounterEnemyIndices` の生存敵**(護衛対象を除く = `pickClosestEngagedEnemyFromAlly` と同じ母集団)のうち、
    **チェビシェフ距離 ≤ L かつ `hasLineOfSight` が真**の各敵へ向けた `(ex - aTX, ey - aTY)`。
    向きが同じ(既約化して一致)ものは 1 本にまとめてよい。
  - 撤退 = 従来の 8 方向。
- 各候補でマス列を歩き、`enemiesInArea(tx, ty, 1, 1)` を集める(⭐ **貫通の集計は従来どおり全 `enemies`**。候補を絞るのは向きだけ)。
- 味方の拒否権: **`!AOE_COVER_ON` のときだけ**、列の途中に `partyInArea(tx, ty, 1, 1)` が真ならその候補を捨てる。
  ⚠ §2-6 の m8(アンカー行を 1 箇所だけ逐語で残す)。
- 採用 = 敵数が最大の候補。⭐ 同数なら**候補の並び順で先勝ち**(乱数を引かない = 探索は決定論のまま)。
- `noteAoeOutcome(skill.name, boltOk, "line")` の呼び方は変えない(受入と既存シームがこれを読む)。
- 不発時の `allyBasicAttack` へ落ちる挙動は**変えない**(§1 の不採用案)。

### 5-4. ダメージ・無傷表示・描画を同じ列へ寄せる(§2-3 の罠)

- 採用した候補の**マス列そのもの**から被弾対象を集める(`:28631` の 3 マスループを置き換える)。
- 無傷表示は同じ列の味方数を数える。`aoeLineSafeAllyTag` の引数形が合わなければ**列を受け取る版を足す**
  (⚠ 既存の `aoeLineSafeAllyTag` と `window.__aoeCover` の公開は消さない。撤退経路が使う)。
- 描画の終点 = **列の最後のマスの中心**。`spawnLightningBolt(aCX, aCY - 8, endWX, endWY)` は任意の終点を受け取れる。
- 向きの左右 `ally.facing` は `dx` の符号で従来どおり。

### 5-5. flavor

- `index.html` `MAGE_SKILLS["lightning-bolt"].flavor` と `tavern.html:4429` の flavor を
  「**敵へ向けて直線 10 マス**」の趣旨へ。⚠ 2 枚を必ず揃える(酒場の鏡 = #57 の教訓)。
- ⚠ 酒場は別ページなので `?boltaim=0` でも文言は変わらない。これは許容する(撤退はゲーム内の挙動を戻すスイッチ)。

---

## 6. STEP3 — 既存 golden の言い直し(必要なものだけ)

- `verify_aoe_coverage.js` の m8 — §2-6 の ② のときだけ。
- 母集団の非退行(§8 末尾)で赤くなった本は、**直す前に** 分類 1(本チケットが構造的に殺す型)か確かめる。
  ⛔ 閾値を緩めて緑にしない。⛔ `?boltaim=0` を付けて緑に見せない。

---

## 7. 撤退スイッチ

- **`?boltaim=0`** — ライトニングボルトの探索・ダメージ・描画を 2026-09-16 以前(3 マス・8 方向・壁を見ない)へ戻す。
- 判定位置 = `index.html` の `BOLT_AIM_ON` 1 箇所(`CONE_CAST_ON` の直後)。ページ遷移はまたがない。
- ⚠ `?dndrange=0` とは独立。素 + `?dndrange=0` では長さ 5 マス(§2-5 の導出の証明に使う = (5a))。

---

## 8. 受入条件 — `tools/verify_bolt_aim.js`(新規・base 10301)

方針: **合成盤面で決定論的に形を固め、実プレイで率を測る**。率は回数と比率で書き、1 回の色に賭けない。
⭐ 非退行は **2 経路**(assert id の指紋 + 判定行の多重集合)で突き合わせる(#67 項目6 で id の指紋が判定行の 48.2% を見落とした)。

### ⚠ 計測機構

- 合成盤面は `verify_aoe_coverage.js:382` の `window.__ap = { board, cast }` を**ドライバ側で注入**する作法を流用
  (⛔ 本番に計測シームを足さない = changelog ガードとの衝突を避ける)。
- 実プレイの 2 経路目は、起草時のプローブと同じく **`window.allyLightningBolt` をページ内で包み**、
  試行ごとに術者と敵のタイルを採ってドライバ側で「撃てたはず」を再計算する(§2-4 で実物と一致を確認済みの方式)。
- 変異は**配信スナップショットをメモリ上で差し替え**、変異ごとに別ポート(10302〜)から配る。
  ⚠ `index.html` は CRLF。アンカーは 1 行に閉じる。注入点が**ちょうど 1 箇所**見つからなければ走らせる前に exit 3。
- 後始末は**このドライバが起動したものだけ**を落とす(内蔵サーバとこのブラウザ)。
  ⛔ 「LISTEN を 0 にする」で他のプロセスを落とさない(#67 で 8765 のユーザー用サーバを落とした実害)。

### §0 装置

- **(0a)** 配信 `index.html` に `boltaim` の判定が**ちょうど 1 箇所**、`allyLightningBolt` の定義が 1 箇所。
- **(0b)** 合成盤面で `allyLightningBolt` を呼ぶと `__aoeStats["ライトニングボルト"].attempts` が 1 増える
  (⭐ シームが生きていることの証明。0 なら以降の assert は全部空振り)。
- **(0c)** 実プレイで魔法使いの `equippedSkills` に `lightning-bolt` が入り、90 秒で `attempts ≥ 5`(素の腕・各走行)。
  → §12-3 (g) のユーザー決定 2026-09-17 で変更(各走行 `attempts ≥ 1` かつ 素の全走行の合計 ≥ 20)。
- **(0d)** 撤退の腕で、ドライバの再計算(L=3・8 方向・壁なし)が実物の成否と**全件一致**
  (⭐ 2 経路目の再計算器そのものが正しいことの証明。一致しなければ §2 の率の assert を信じない)。

### §1 合成盤面(決定論・素と撤退の 2 腕)

- **(1a)** 敵 1 体を**筋から外れた位置**(術者から `(dx, dy) = (4, 1)`)に置く → 素 `cast 1` / 撤退 `demoted 1`。
- **(1b)** 敵 1 体を**筋の上 7 マス**に置く → 素 `cast 1` / 撤退 `demoted 1`。
- **(1c)** 敵 1 体を**チェビシェフ 11 マス**(`L + 1`)に置く → 素も `demoted 1`(射程の上限)。
- **(1d)** 術者と敵(5 マス先・筋の上)の間に壁 1 マス → 素 `demoted 1`(壁で止まる)。
- **(1e)** 狙える敵の奥、同じ直線上 `L` 以内にもう 1 体 → 素で**2 体とも HP が減る**(貫通)。
- **(1f)** 被弾した敵の集合 == **ドライバが同じ盤面で独立に引いた直線**上の敵の集合(2 経路)。
- **(1g)** 味方を唯一の候補直線の途中に置く → 素 `cast 1` / `?aoecover=0` で `demoted 1`。
- **(1h)** `spawnLightningBolt` が受け取った終点が、被弾計算に使ったマス列の**最後のマスの中心**と一致。

### §2 実プレイ(回数と比率)

- **(2a)** LB ×8 単独・廃坑と森・**各 3 回**を素と撤退で走らせ、合算で
  **素の `cast / attempts ≥ 70%`** かつ **素 ≥ 撤退 + 30pt** かつ **素の `cast` 合計 ≥ 20**(絶対量)。
  ⚠ 差だけを見る assert は両腕へ等しく効く欠陥を捕まえられない(#67 (8a))ので絶対量を必ず添える。
  → §12-3 (g) のユーザー決定 2026-09-17 で変更(回数を**各 5 回**へ。閾値 3 本はそのまま)。
  → §12-3 (g) のユーザー決定 2026-09-17 で変更(決定 E: 率と差は**マップごとの率の単純平均**で測る。合算とマップ別は記録だけ)。
- **(2b)** 素の腕の全試行で、ドライバの再計算(§5 の仕様どおり L=10・敵へ向けて・壁で止める)と実物の成否の
  一致率 **≥ 95%**。
- **(2c)** 混成装備(§2-1 と同じ 8 枠)・廃坑と森・各 2 回で、**コーンオブコールドの `attempts` 合計 ≥ 1**。
  ⭐ 居座り(§2-2)の実害が消えたことの観測。⚠ 着手前は 4 走行すべて 0。
  → §12-3 (g) のユーザー決定 2026-09-17 で変更(assert から外して**記録だけ**。混成は各 2 回のまま)。

### §3 文言

- **(3a)** `index.html` の `MAGE_SKILLS["lightning-bolt"].flavor` と `tavern.html` の鏡の flavor が
  **どちらも**「10」を含み「3 タイル」を含まない(2 ファイル = 2 経路)。

### §4 撤退

- **(4a)** `?boltaim=0` で (1a)(1b) が `demoted` に戻る(§1 の腕として実施)。
- **(4b)** `?boltaim=0` の実プレイで (0d) の一致が成り立つ = 旧挙動の完全再現。

### §5 導出(恒等ではなく絶対量で)

- **(5a)** `?dndrange=0` で、(1b) の敵を 6 マスに置くと素でも `demoted`、4 マスなら `cast`
  (⭐ 長さが宣言射程から導出されていることの証明。直書きの 10 ならこの assert は赤)。

### ⛔ 測らないこと

- ダメージ量(5d6 のまま。設計書の 8d6 は別チケット)・セーヴ DC・稲妻の見た目。
- 魔法使い AI の梯子の順番・閾値、不発時に枠を減らさないこと(§1 の不採用案)。
- 1 回あたりの貫通体数の平均。
- 実プレイの cast 率の上限側(98% を目標にしない。視線と交戦中の絞り込みで下がるのは仕様)。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `reach3` | 素の長さを 3 に固定する | (1b) (5a) |
| `rays8` | 素の候補を 8 方向の筋へ戻す | (1a) |
| `nowall` | 壁で止めない | (1d) |
| **`dmgray`** | ⭐ **探索は新経路のまま、ダメージだけ旧 3 マスの筋で集める**(§2-3 の罠の再現) | (1e) (1f) |
| `norange` | 候補の距離上限を外す | (1c) |
| `hardcode10` | 長さを `getRange` から導出せず 10 を直書きする | (5a) |
| `vetogone` | `?aoecover=0` でも味方の拒否権を掛けない | (1g) |
| `switchdead` | `BOLT_AIM_ON` を常に真にする | (4a) |
| `endstale` | 描画の終点を旧 `best.dx * 3 * TILE_SIZE` のままにする | (1h) |
| `flavor3` | `tavern.html` の flavor だけ「3 タイル」のまま | (3a) |

⭐ 各変異の走行に (0a)(0b) を入れ、**変異ページが起動したこと**を毎回ログに出す(構文破壊で全部赤の偽の緑を見分ける)。

### 既存 golden の非退行(実装後に必ず走らせる)

- STEP1 の母集団(§4)を**全数**、着手前と同じ順で直列に再走し、**2 経路**で突き合わせて **緑→赤 0** を示す。
- 名指しで必ず見る本(2026-09-16 起草時の見立て。⚠ 走って違ったら期待値を書き換える前に理由を突き止める):
  - `tools/verify_aoe_coverage.js`(素 + `--negative`。m8 と (1c))
  - `tools/verify_cone_cast.js`(円錐の発射率が動いていないこと)
  - `tools/driver_field_step7.js` / `tools/driver_action_priority.js`

---

## 9. 実機/実感の確認(ここが本当の受入)

- 実プレイで魔法使いがライトニングボルトを**斜めや半端な位置の敵へも**撃つか、稲妻が**狙った敵を通って**伸びて見えるか。
- 10 マスの稲妻が**壁の手前で止まって見える**か(壁を突き抜けて描かれていないか)。
- コーンオブコールドとの併用で、両方が戦闘中に見られるか。
- ⚠ ローカルは http 起動が必須(`file://` では音が出ない)。iOS 実機の目視は別途。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>ライトニングボルトが敵を狙えるように</b> — 直線を 3 マスから 10 マスへ延ばし、斜めや半端な位置の敵にも向きを合わせて撃つ。壁は貫通しない。"

---

## 11. やらないこと

- ⛔ **不発時に次の呪文へ回す / 不発で枠を減らす**(魔法使い AI の梯子の変更)。(2c) で居座りが残ると分かったら別チケット。
- ⛔ ダメージを設計書の **8d6** へ上げる。
- ⛔ 円錐・箱型・splash の探索、バーニングハンズの演出(`:12245` / `:28937`)。
- ⛔ 敵側の直線呪文(`enemyCastAoE`)。
- ⛔ エルフの `lightning-arrow`(単体 + splash。別の呪文)。
- ⛔ ボールト `spells.md` の書き換え(別 PC の作業。「⬜ 未実装」表記と 3 マス/5d6 の実装差の記録は申し送りだけ)。
- ⛔ #68 の残り候補(ホールド・パーソン 2 体化 / マッチング画面の見つけやすさ)は**別の依頼書**。

用意してある README の行(承認時に起草窓が足す):

    | 68 | [2026-09-16_lightning-bolt-aim.md](2026-09-16_lightning-bolt-aim.md) | **承認済**(2026-09-16) | 0% | ライトニングボルトを**敵へ向けて 10 マス**撃つ。⭐⭐⭐ 8 方向のまま延ばすと **43% で頭打ち**(起草時 44 試行で実測)。⭐⭐ 不発は枠を減らさず梯子に居座り、併用したコーンオブコールドは**着手前 4 走行すべて 0 回**。⚠ 本体の「3」は **4 箇所**に直書き = 探索だけ延ばすと撃てても当たらない(変異 `dmgray`)。⚠ 同じ `step <= 3` の行が本番に 4 箇所・うち 2 つはバーニングハンズの演出。長さは `getRange` から導出 |

---

## 12. 実装結果

(実装窓が埋める)

### 12-0. 着手前の基準(項目1)

- **測定日**: 2026-09-17(実装窓 `b0fa1865`・dev-loop 項目1)
- **基準コミット** = **`98419b0`**(#68 起草)。着手時(06:48:51)の `git status --short` = 起草窓の未追跡 `実装依頼書/2026-09-16_hold-person-pair.md` の 1 行だけ。
  ⚠ 走査の起動前(06:51:24)に起草窓が **`4ef76eb`**(#69 起草 = 依頼書 + README の 2 ファイル)を積んだので、**全走行は `4ef76eb` の上**。
  `git diff --quiet 98419b0 4ef76eb -- index.html tavern.html audio.js js tools world.html town.html title.html assets` = **差分なし**
  (`157a9ca..98419b0` も依頼書 + README だけ)⇒ 測った本番は `157a9ca` と同一。
- ⛔ 本番(`index.html` / `tavern.html` / `audio.js` / `js/*`)も `tools/` も **1 バイトも触っていない**。
  `git hash-object index.html tavern.html audio.js` と `js` / `tools` のツリー hash を走査の前後で取り、**一致**(`blob_before.txt` = `blob_after.txt`)。終了時の `git status --short` は空、HEAD は `4ef76eb` のまま。
- ⚠⚠ ドライバを `timeout` で**包んでいない**。**並列にしていない**(1 本ずつ `subprocess.run`)。
  走行の直前ごとに「tools を読む node / headless ブラウザ / 8000〜11000 の LISTEN(lghub の 9010・9180 を除く)」を数え、**本走査 144 回・再走 42 回のすべてで `procs=0 ports=`**(並走・孤児による汚染なし)。
- **所要**: 本走査 **144 走行 208.5 分**(06:55:10 → 10:23:40。1 本ごとの秒の合計は 206.5 分、長尺 6 本が 91.2 分)
  + 再走 21 本 × 2 巡(10:24:28 → 11:13:39 = 49.2 分 / → 12:03:11 = 49.5 分)+ `probe_party_size` の 600 秒打ち切り(12:03:36 → 12:13:36)。

#### (0) ⚠ 同じ項目1 の走査が既に 1 本あり、途中で止まっていた

この scratchpad(`baseline68\`)には、前回投入された同じ項目1 の走査(2026-09-16 21:23 → 00:29・名簿 143 走行)が残っていた。
**136 本目で中断**しており、完走していない。

- 00:29:04 に `driver_field_step6` が 28.5 秒で exit **1073807364**(0x40010004 = 外から終了させられた)、続く 7 本が 0.0 秒で exit **3221226091**(0xC000026B = DLL 初期化失敗)。
- 原因は **Windows Update による OS 再起動**。System ログに id **1074**(00:30:22 `TrustedInstaller.exe` が再起動を開始)と id **13**(00:30:31 シャットダウン)がある。
- ⇒ **基準には使わず、本走査をタグ `base68b` でやり直した**。中断した走査の有効な **135 走行**(`result_base68int.VALID.FINAL.tsv`)は、
  同じ本番に対する**独立の 1 標本**として非緑の判定((e))にだけ使う。凍結 = `result_base68.INTERRUPTED.FINAL.tsv`。

#### (a) LISTEN の控え

| 時刻 | 8000〜11000 の LISTEN | 10300〜10320 |
|---|---|---|
| 06:49:33(着手前) | `127.0.0.1:9180` lghub_updater(pid 4764)/ `127.0.0.1:9010` lghub_agent(pid 19412)**の 2 件だけ** | 0 |
| 12:14:05(後始末の後) | **同じ 2 件**(pid も同じ) | 0 |

- 着手前の chrome.exe は 0 本、py/python は 0 本。node.exe は MCP サーバ(server-github / context7 / server-memory / playwright mcp / sequential-thinking)だけ。
- 後始末: ドライバはどれも自分の http サーバとブラウザを閉じて終わり、**ドライバ由来で残ったプロセスは 0 本**。落としたものは無い
  (`probe_party_size` は打ち切ったうえでツリーごと `taskkill /F /T`、残存 node は「なし」)。⛔ lghub などの着手前から在ったプロセスには触っていない。

#### (b) 母集団の引き方 — 3 段の union = **133 本**

`tools/*.js` は **145 本** = 走れるドライバ(接頭辞 `driver_` / `verify_` / `probe_` / `sweep_`)**140 本** + ヘルパー 5 本
(`_golden.js` / `_pptr_profile.js` / `_doors_fixture.js` はドライバが `require` する部品。`auto_debug_run.js` は合否の無い巡回ランナー、`sim_plaza_entry.js` は本番を読まないモンテカルロ)。
ヘルパーは #67 と同じく母集団から外した(読む側のドライバは全部母集団に入っている)。

| 段 | 引き方 | 本数 |
|---|---|---|
| **段1** | `grep -ln "lightning-bolt\|allyLightningBolt\|ライトニングボルト\|aoeLineSafeAllyTag" tools/*.js`(コメントを落としても同じ 4 本) | **4** |
| **段2** | `index.html` / `tavern.html` を**コードで**読む本(コメントを落としてから判定) | **133**(`index.html` 127 / `tavern.html` 45) |
| (参考) | 段2 を素の grep で引くと | 135(コメントだけで触れる `verify_world_heromark` / `verify_world_steps` の 2 本が混ざる) |
| **段3** | `grep -ln "'tools/driver_\|'tools/verify_" tools/*.js` | **2**(`verify_enemy_name_label` / `verify_eol_doorfix`) |
| 名指し | `verify_aoe_coverage` / `verify_cone_cast` / `driver_field_step7` / `driver_action_priority` | 4(= 段1 と同じ 4 本) |
| | **union** | **133** |
| | 母集団外(念のため実走) | 7 |

- **包含関係**: 段1 ⊂ 段2(真部分集合)/ 段3 ⊂ 段2(真部分集合)/ 名指し 4 本 = 段1 ⊂ 段2 ⇒ **union = 段2 = 133**。
  ⭐ 段1・段3 は union を 1 本も増やさなかった(理由は #67 と同じく `index.html` が変更範囲だから)。**増えなかったことを確かめた**のが 3 段の価値。
- **段1 のリスト**(項目3 が使う)= `driver_action_priority.js` / `driver_field_step7.js` / `verify_aoe_coverage.js` / `verify_cone_cast.js`
  → 別ファイル `stage1_roster.txt`。
- ⚠ #67 の union 135 本との差 = **`verify_codex_map_skill`**(`make_grid_map.py` を読む)と **`driver_doors_p1`**(`js/` のモジュールを読む)の 2 本。
  どちらも今回の変更ファイルを読まないので母集団外へ移り、母集団外は 5 → **7 本**(`driver_bgm_title` / `driver_doors_p1` / `probe_town_mask` /
  `verify_codex_map_skill` / `verify_road_events` / `verify_world_heromark` / `verify_world_steps`)。7 本が実際に開くものもソースで確かめた(title / town / world の各ページと `js/` のモジュールと `make_grid_map.py` だけで、`index.html` / `tavern.html` を読まない)。

#### (c) 走行名簿 = **144 走行**(`runlist68b.txt`。⭐ 項目5 はこの名簿をこの順で再走する)

- 母集団 133 本 − `probe_party_size`(別枠の 600 秒打ち切り)= **132 本の素の走行**
- \+ 引数腕 3(`probe_bandit_map --places` / `probe_s2_fold --kinds` / `probe_swamp_map --bfs`。引数なしは使い方ガードで 0 秒 exit 3 になる = #67 の実測)
- \+ `--negative` 腕 **2**(`verify_aoe_coverage` = 指示どおり / **`verify_cone_cast` = 項目1 が足した**。理由は (h) の崩れた主張 2)
- \+ 母集団外 7
- 順序 = #67 項目6 の名簿の順(アルファベット順・長尺 6 本を末尾)。追加の腕は元の本の直後、母集団外は最後。

⭐ **#68 が書き換える行に逐語のアンカーを持つ本の洗い出し**(`anchor_scan68.py`)。`tools/*.js` 全 145 本の文字列リテラル(12 字以上)を、
`index.html` の R1 `MAGE_SKILLS` の LB(:22120-22140)/ R2 `aoeLineSafeAllyTag`(:28170-28200)/ R3 `window.__aoeCover`(:28388-28410)/
R4 `CONE_CAST_ON`(:28430-28445)/ R5 `allyLightningBolt`(:28575-28690)と、`tavern.html` の T1 flavor の鏡(:4425-4433)/ T2 `changelogList`(:3273-3278)の行に照らした。
**逐語の 1 行アンカーで当たったのは 2 本だけ**(ほかの 9 本は `arcane-shield` / `allyBasicAttack` のような短い識別子の偶然一致):

| 本 | tools 行 | 掴んでいる本番の行 | 本番での出現数 |
|---|---|---|---|
| `verify_aoe_coverage` | :190(変異 **m8**) | `          if (!AOE_COVER_ON && partyInArea(tx, ty, 1, 1)) { blocked = true; break; }` = **:28615** | **1** |
| `verify_cone_cast` | :313(変異 `retreatdead` の `from`) | `new URLSearchParams(window.location.search).get("conecast") !== "0";` = **:28438**(`BOLT_AIM_ON` の挿入点の直前) | 1 |
| `verify_cone_cast` | :307(変異 `reachdrift` の `from`) | `for (let step = 1; step <= CONE_REACH_TILES; step++) {` = :28442 | 1 |
| `verify_cone_cast` | :358 / :618(変異 `coldstale` の配信検算と (4a) の記録) | `const directions = [` = **:28595 = LB の本文** | **1** |

#### (d) 結果 — 緑 **130** / 非緑 **14**

| # | 本 (腕) | 段 | exit | 判定行 P/F | 集計行 (末尾の候補) | 秒 | 中断 run | 再走 | #67項目6 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `verify_dragon_fold` | 段2 | 0 | 44/0 | `PASS 35 / FAIL 0` | 4 | 0 | — — | 0 |
| 2 | `driver_graph_p6` | 段2 | 0 | 250/0 | `══ 結果: 250/250 PASS ══` | 42 | 0 | — — | 0 |
| 3 | `driver_grid_s2` | 段2 | 0 | 124/0 | `[drv] 124/124 PASS` | 6 | 0 | — — | 0 |
| 4 | `driver_spawn_not_on_gate` | 段2 | 0 | 71/0 | `[drv] 71/71 PASS` | 5 | 0 | — — | 0 |
| 5 | `driver_doors_p6` | 段2 | 0 | 40/0 | `══ 結果: 40/40 PASS ══` | 39 | 0 | — — | 0 |
| 6 | `verify_swamp_novice` | 段2 | 0 | 34/0 | `PASS 34 / FAIL 0` | 10 | 0 | — — | 0 |
| 7 | `verify_fort_fold` | 段2 | 0 | 30/0 | `PASS 30 / FAIL 0` | 1 | 0 | — — | 0 |
| 8 | `verify_swamp_fold` | 段2 | 0 | 30/0 | `PASS 30 / FAIL 0` | 2 | 0 | — — | 0 |
| 9 | `verify_temple_fold` | 段2 | 0 | 31/0 | `PASS 24 / FAIL 0` | 114 | 0 | — — | 0 |
| 10 | `driver_graph_p7` | 段2 | 0 | 60/0 | `══ 結果: 60/60 PASS ══` | 4 | 0 | — — | 0 |
| 11 | `driver_graph_kinds` | 段2 | 0 | 66/0 | `[drv] 66/66 PASS   (--mutate nokind)` | 37 | 0 | — — | 0 |
| 12 | `driver_paint_blocked` | 段2 | 0 | 65/0 | `PASS 65 / FAIL 0` | 7 | 0 | — — | 0 |
| 13 | `driver_grid_p3b` | 段2 | 0 | 44/0 | `PASS 44 / FAIL 0` | 17 | 0 | — — | 0 |
| 14 | `verify_eol_doorfix` | 段2 | 0 | 27/0 | `素 27/27 PASSED` | 6 | 0 | — — | 0 |
| 15 | `verify_enemy_name_label` | 段2 | 0 | 30/0 | `30/30 PASSED   FAILED 0   **PENDING** 0` | 2 | 0 | — — | 0 |
| 16 | **`driver_mapeditor_painting`** | 段2 | **1** | 105/1 | `PASS 105 / FAIL 1  (合計 106)` | 8 | 1 | 1 1 | 1 |
| 17 | **`driver_grid_p4`** | 段2 | **3** | 0/0 | `[drv] ⛔ 変異 n1ringonly の置換対象が 見つからない → 負のコントロールが空振りする: "               \".............#...###...…` | 0 | 3 | 3 3 | 3 |
| 18 | `driver_doors_p5` | 段2 | 0 | 36/0 | `══ 結果: 36/36 PASS ══` | 17 | 0 | — — | 0 |
| 19 | `driver_doors_p2` | 段2 | 0 | 40/0 | `══ 結果: 40/40 PASS ══` | 21 | 0 | — — | 0 |
| 20 | `driver_bgm_mine` | 段2 | 0 | 37/0 | `37/37 PASS` | 10 | 0 | — — | 0 |
| 21 | `driver_action_priority` | 段1 | 0 | 92/0 | `[driver] RESULT: PASSED 92 / FAILED 0 / PENDING 0` | 122 | 0 | — — | 0 |
| 22 | `driver_bgm_town` | 段2 | 0 | 17/0 | `17/17 PASS` | 2 | 0 | — — | 0 |
| 23 | `driver_cast_circle` | 段2 | 0 | 56/0 | `56/56 PASS` | 4 | 0 | — — | 0 |
| 24 | `driver_choice_logslot` | 段2 | 0 | 29/0 | `[drv] 29/29 PASS   (--mutate nope)` | 5 | 0 | — — | 0 |
| 25 | `driver_cleanup_phase1` | 段2 | 0 | 28/0 | `[driver] RESULT: 28/28 passed` | 18 | 0 | — — | 0 |
| 26 | `driver_cleric_sprites` | 段2 | 0 | 85/0 | `[driver] RESULT: 85/85 passed` | 1 | 0 | — — | 0 |
| 27 | `driver_depart_menu_clean` | 段2 | 0 | 41/0 | `══════════ 結果: 41/41 PASS ══════════` | 126 | 0 | — — | 0 |
| 28 | `driver_dev_gate` | 段2 | 0 | 52/0 | `[driver] RESULT: 52/52 passed` | 25 | 0 | — — | 0 |
| 29 | `driver_dev_gate2` | 段2 | 0 | 62/0 | `══════════ 結果: 62/62 PASS ══════════` | 26 | 0 | — — | 0 |
| 30 | `driver_doors_p8` | 段2 | 0 | 18/0 | `══ 結果: 18/18 PASS ══` | 7 | 0 | — — | 0 |
| 31 | `driver_elf_sprites` | 段2 | 0 | 87/0 | `[driver] RESULT: 87/87 passed` | 1 | 0 | — — | 0 |
| 32 | `driver_encounter_mopup` | 段2 | 0 | 36/0 | `[drv] 36/36 PASS` | 321 | 0 | — — | 0 |
| 33 | `driver_equip_compact_ios` | 段2 | 0 | 31/0 | `=== WORKTREE: 31/31 PASS ===` | 46 | 0 | — — | 0 |
| 34 | `driver_field_scale` | 段2 | 0 | 49/0 | `[drv] working: 49/49 PASS` | 24 | 0 | — — | 0 |
| 35 | `driver_field_step05_hud` | 段2 | 0 | 6/0 | `=== 測定妥当性 6/6 PASS ===` | 38 | 0 | — — | 0 |
| 36 | `driver_field_step1` | 段2 | 0 | 95/0 | `=== 95/95 PASS ===` | 74 | 0 | — — | 0 |
| 37 | `driver_field_step1_geo` | 段2 | 0 | 71/0 | `=== 71/71 PASS ===` | 100 | 0 | — — | 0 |
| 38 | `driver_field_step2` | 段2 | 0 | 64/0 | `RESULT: 64/64  ALL PASS` | 39 | 0 | — — | 0 |
| 39 | `driver_field_step3` | 段2 | 0 | 65/0 | `RESULT: 65/65  ALL PASS` | 69 | 0 | — — | 0 |
| 40 | `driver_field_step5` | 段2 | 0 | 48/0 | `=== driver_field_step5  48/48 PASS ===` | 5 | 0 | — — | 0 |
| 41 | `driver_field_step6_png` | 段2 | 0 | 16/0 | `RESULT: 16/16  ALL PASS` | 20 | 0 | — — | 0 |
| 42 | `driver_field_step7` | 段1 | 0 | 79/0 | `=== driver_field_step7  79/79 PASS ===` | 245 | 0 | — — | 0 |
| 43 | `driver_field_verge_gap` | 段2 | 0 | 39/0 | `RESULT: 39/39  ALL PASS` | 24 | 0 | — — | 0 |
| 44 | `driver_fix4_help_bonus` | 段2 | 0 | 13/0 | `[driver] RESULT: 13/13 passed` | 4 | 0 | — — | 0 |
| 45 | `driver_graph_arrows` | 段2 | 0 | 80/0 | `[drv] 80/80 PASS   (--mutate nope)` | 14 | 0 | — — | 0 |
| 46 | `driver_graph_reentry` | 段2 | 0 | 57/0 | `[drv] 57/57 PASS   (--mutate nodom / cycles=5)` | 2 | 0 | — — | 0 |
| 47 | `driver_graph_run` | 段2 | 0 | 99/0 | `[drv] 99/99 PASS   (--mutate nosave)` | 72 | 0 | — — | 0 |
| 48 | `driver_graph_sce1` | 段2 | 0 | 106/0 | `[drv] 106/106 PASS` | 208 | 0 | — — | 0 |
| 49 | `driver_grid_p5` | 段2 | 0 | 103/0 | `PASS 103 / FAIL 0` | 171 | 0 | — — | 0 |
| 50 | `driver_grid_p7` | 段2 | 0 | 44/0 | `PASS 44 / FAIL 0` | 26 | 0 | — — | 0 |
| 51 | **`driver_grid_p8`** | 段2 | **1** | 55/1 | `PASS 55 / FAIL 1` | 280 | 1 | 1 1 | 1 |
| 52 | `driver_heromark_signplate` | 段2 | 0 | 46/0 | `46 / 46` | 14 | 0 | — — | 0 |
| 53 | `driver_leader_ai` | 段2 | 0 | 42/0 | `[driver] RESULT: 42/42 passed` | 32 | 0 | — — | 0 |
| 54 | `driver_log_compact` | 段2 | 0 | 29/0 | `[driver] RESULT: 29/29 passed` | 5 | 0 | — — | 0 |
| 55 | `driver_mapdef_step1` | 段2 | 0 | 208/0 | `=== 208/208 PASS ===` | 19 | 0 | — — | 0 |
| 56 | `driver_mapdef_step2` | 段2 | 0 | 75/0 | `74/74 PASS` | 116 | 0 | — — | 0 |
| 57 | `driver_mapdef_step3` | 段2 | 0 | 122/0 | `122/122 PASS` | 114 | 0 | — — | 0 |
| 58 | **`driver_mapeditor`** | 段2 | **1** | 176/3 | `[driver] 176/179 PASS  (FAIL 3)` | 3 | 1 | 1 1 | 1 |
| 59 | `driver_mapeditor_pointer` | 段2 | 0 | 31/0 | `PASS 31 / FAIL 0  (合計 31)` | 21 | 0 | — — | 0 |
| 60 | `driver_mapeditor_props` | 段2 | 0 | 71/0 | `PASS 71 / FAIL 0  (合計 71)` | 4 | 0 | — — | 0 |
| 61 | `driver_mapeditor_railkit` | 段2 | 0 | 134/0 | `PASS 134 / FAIL 0  (合計 134)` | 8 | 0 | — — | 0 |
| 62 | `driver_mapeditor_texture` | 段2 | 0 | 30/0 | `PASS 30 / FAIL 0  (合計 30)` | 4 | 0 | — — | 0 |
| 63 | `driver_mapeditor_waterkit` | 段2 | 0 | 138/0 | `PASS 138 / FAIL 0  (合計 138)` | 8 | 0 | — — | 0 |
| 64 | `driver_mine_wall` | 段2 | 0 | 66/0 | `66/66 PASS` | 202 | 0 | — — | 0 |
| 65 | `driver_monsters_chimera` | 段2 | 0 | 17/0 | `[driver] RESULT: 17/17 passed` | 125 | 0 | — — | 0 |
| 66 | `driver_monsters_griffon` | 段2 | 0 | 17/0 | `[driver] RESULT: 17/17 passed` | 73 | 0 | 0 1 | 0 |
| 67 | `driver_monsters_hobgoblin` | 段2 | 0 | 14/0 | `[driver] RESULT: 14/14 passed` | 56 | 1 | 1 1 | 0 |
| 68 | `driver_monsters_kobold` | 段2 | 0 | 12/0 | `[driver] RESULT: 12/12 passed` | 83 | 0 | 0 0 | 0 |
| 69 | `driver_monsters_orc` | 段2 | 0 | 7/0 | `[driver] RESULT: 7/7 passed` | 3 | 0 | — — | 0 |
| 70 | **`driver_monsters_umberhulk`** | 段2 | **1** | 21/1 | `[driver] RESULT: 21/22 passed` | 203 | 1 | 1 1 | 1 |
| 71 | `driver_paint_grid` | 段2 | 0 | 21/0 | `PASS 21 / FAIL 0  (shots: C:\Users\PC_User\AppData\Local\Temp\claude\df_paint_grid_shots)` | 2 | 0 | — — | 0 |
| 72 | `driver_party_view_reopen` | 段2 | 0 | 35/0 | `========== 結果: 35/35 PASSED / 0 FAILED / 0 PENDING ==========` | 72 | 0 | — — | 0 |
| 73 | `driver_rogue_sprites` | 段2 | 0 | 49/0 | `[driver] RESULT: 49/49 passed` | 1 | 0 | — — | 0 |
| 74 | `driver_room_search_roll` | 段2 | 0 | 39/0 | `[driver] RESULT: 39/39 passed` | 1 | 0 | — — | 0 |
| 75 | **`driver_sce1_events`** | 段2 | **1** | 211/3 | `[drv] RESULT: 211/214 passed` | 48 | 1 | 1 1 | 1 |
| 76 | `driver_scroll_autoskip` | 段2 | 0 | 9/0 | `[driver] RESULT: 9/9 passed` | 4 | 0 | — — | 0 |
| 77 | `driver_skillcheck_roster` | 段2 | 0 | 13/0 | `[driver] RESULT: 13/13 passed` | 4 | 0 | — — | 0 |
| 78 | `driver_speech_boss` | 段2 | 0 | 19/0 | `[driver] RESULT: 19/19 passed` | 15 | 0 | — — | 0 |
| 79 | `driver_speech_engine` | 段2 | 0 | 17/0 | `[driver] RESULT: 17/17 passed` | 14 | 0 | 0 1 | 0 |
| 80 | `driver_speech_hooks` | 段2 | 0 | 13/0 | `[driver] RESULT: 13/13 passed` | 54 | 0 | — — | 0 |
| 81 | **`driver_speech_v2`** | 段2 | **1** | 45/1 | `[driver] RESULT: 45/46 passed` | 47 | 1 | 1 1 | 1 |
| 82 | `driver_trap_disarm` | 段2 | 0 | 44/0 | `[driver] RESULT: 44/44 passed` | 1 | 0 | — — | 0 |
| 83 | `driver_trap_weaponize` | 段2 | 0 | 43/0 | `[driver] RESULT: 43/43 passed` | 1 | 0 | — — | 0 |
| 84 | `driver_wall_face` | 段2 | 0 | 54/0 | `[drv] 54/54 PASS` | 32 | 0 | — — | 0 |
| 85 | `driver_wall_props` | 段2 | 0 | 29/0 | `[drv] 29/29 PASS` | 16 | 1 | 0 0 | 0 |
| 86 | `driver_wallbox` | 段2 | 0 | 28/0 | `28/28 PASS` | 6 | 0 | — — | 0 |
| 87 | `driver_warrior_variants_sprite` | 段2 | 0 | 50/0 | `[driver] RESULT: 50/50 passed` | 1 | 0 | — — | 0 |
| 88 | **`probe_bandit_map`** | 段2 | **3** | 0/0 | `[probe] --mapdefs / --places / --grid / --ai のどれかを指定` | 0 | 3 | 3 3 | 3 |
| 89 | `probe_bandit_map_places` | 段2 | 0 | 0/0 | `56  16   false       true   45` | 1 | 0 | — — | — |
| 90 | `probe_boss_latch` | 段2 | 0 | 5/0 | `[prb] 5/5 PASS` | 45 | 0 | — — | 0 |
| 91 | `probe_n4_stall` | 段2 | 0 | 0/0 | `heroTurnPause 消化中 (通常は数 tick で抜ける)` | 85 | 1 | 1 0 | 1 |
| 92 | `probe_paint_overlay` | 段2 | 0 | 0/0 | `extra={"theme":"goblin-mine","scenarioId":"goblin-mine","isCustom":true,"fieldMode":false,"pain…` | 4 | 0 | — — | 0 |
| 93 | `probe_rest_premature` | 段2 | 0 | 0/0 | `[probe] 休憩 5 回中、周囲に未参戦の生存敵がいたのは 2 回` | 210 | 0 | — — | 0 |
| 94 | `probe_s2_clear` | 段2 | 0 | 4/0 | `[probe] ✓ 全 3 走行が装置 assert を通りました` | 146 | 0 | — — | 0 |
| 95 | **`probe_s2_fold`** | 段2 | **3** | 0/0 | `[probe] --kinds / --lint のどちらかを指定` | 0 | 3 | 3 3 | 3 |
| 96 | `probe_s2_fold_kinds` | 段2 | 0 | 0/0 | `⚠ 畳むと、この行のうち**残すノードの kind が拾わないもの**が無言でゼロになる` | 1 | 0 | — — | — |
| 97 | `probe_s4_relocate` | 段2 | 0 | 0/0 | `[probe] raw: C:\Users\PC_User\AppData\Local\Temp\probe_s4_relocate.json` | 2 | 0 | — — | 0 |
| 98 | **`probe_swamp_map`** | 段2 | **3** | 0/0 | `[probe] --bfs を指定してください (任意で --cut <global col>)` | 0 | 3 | 3 3 | 3 |
| 99 | `probe_swamp_map_bfs` | 段2 | 0 | 0/0 | `slot lizardHunter   (37,12)  isTileWall=false  起点からの aStar 歩数=26` | 1 | 0 | — — | — |
| 100 | **`sweep_recruit_balance`** | 段2 | **1** | 0/0 | `[sweep] ⛔ 装置 assert が崩れた走行が 4/4 件あります` | 156 | 1 | 1 1 | 1 |
| 101 | `verify_ability_scores` | 段2 | 0 | 24/0 | `24/24 PASSED   FAILED 0   **PENDING** 0` | 3 | 0 | — — | 0 |
| 102 | `verify_aoe_coverage` | 段1 | 0 | 28/0 | `28/28 PASSED   FAILED 0   PENDING 0` | 2 | 0 | — — | 0 |
| 103 | `verify_aoe_coverage_negative` | 段1 | 0 | 270/20 | `27/28 PASSED   FAILED 1   PENDING 0` | 26 | 0 | — — | — |
| 104 | `verify_cone_cast` | 段1 | 0 | 19/0 | `19/19 PASSED   FAILED 0   **PENDING** 0` | 74 | 0 | — — | 0 |
| 105 | `verify_cone_cast_negative` | 段1 | 0 | 41/0 | `41/41 PASSED   FAILED 0   **PENDING** 0` | 190 | — | — — | — |
| 106 | `verify_darkvision` | 段2 | 0 | 25/0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | 79 | 0 | — — | 0 |
| 107 | `verify_hold_person` | 段2 | 0 | 31/0 | `31/31 PASSED   FAILED 0   PENDING 0` | 10 | 0 | — — | 0 |
| 108 | `verify_mercenary_roster` | 段2 | 0 | 44/0 | `[mercenary-roster] 44 PASSED / 0 FAILED / 0 PENDING  (44/44)` | 18 | 0 | — — | 0 |
| 109 | `verify_npc_crowd` | 段2 | 0 | 33/0 | `33/33 PASSED   FAILED 0   **PENDING** 0` | 72 | 0 | — — | 0 |
| 110 | `verify_party_four` | 段2 | 0 | 17/0 | `PASS 17 / FAIL 0` | 7 | 0 | — — | 0 |
| 111 | `verify_party_match_setup` | 段2 | 0 | 36/0 | `[driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0   (合計 36)` | 100 | 0 | — — | 0 |
| 112 | `verify_party_promises` | 段2 | 0 | 35/0 | `35/35 PASSED   FAILED 0   PENDING 0` | 249 | 0 | — — | 0 |
| 113 | `verify_player_sheet` | 段2 | 0 | 73/0 | `73/73 PASSED   FAILED 0   **PENDING** 0` | 56 | 0 | — — | 0 |
| 114 | `verify_pm_drawer_fit` | 段2 | 0 | 75/0 | `75/79 PASSED   FAILED 0   PENDING 4` | 70 | 0 | — — | 0 |
| 115 | `verify_prep_retire` | 段2 | 0 | 30/0 | `30/30 PASSED   FAILED 0   PENDING 0` | 146 | 0 | — — | 0 |
| 116 | `verify_quest_visibility` | 段2 | 0 | 39/0 | `素 39/39 PASSED  (PENDING 0)` | 16 | 0 | — — | 0 |
| 117 | `verify_quest_walk` | 段2 | 0 | 25/0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | 212 | 0 | — — | 0 |
| 118 | `verify_recruit_size` | 段2 | 0 | 91/0 | `══════════ 結果: 91/91 PASS ══════════` | 71 | 0 | — — | 0 |
| 119 | `verify_recruit_talk` | 段2 | 0 | 25/0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | 63 | 0 | — — | 0 |
| 120 | `verify_road_ambush` | 段2 | 0 | 41/0 | `41/41 PASSED` | 66 | 0 | — — | 0 |
| 121 | `verify_road_boon` | 段2 | 0 | 20/0 | `20/20 PASSED   FAILED 0   **PENDING** 0` | 70 | 0 | — — | 0 |
| 122 | `verify_roll_target` | 段2 | 0 | 30/0 | `30/30 PASSED   FAILED 0   **PENDING** 0` | 192 | 0 | — — | 0 |
| 123 | `verify_run_chronicle` | 段2 | 0 | 73/0 | `[run-chronicle] 73 PASSED / 0 FAILED / 0 PENDING` | 182 | 0 | 0 0 | 0 |
| 124 | `verify_save_slots` | 段2 | 0 | 30/0 | `[save-slots] RESULT: 30/30 passed` | 5 | 0 | — — | 0 |
| 125 | `verify_swamp_lair` | 段2 | 0 | 26/0 | `PASS 26 / FAIL 0` | 3 | 0 | — — | 0 |
| 126 | `verify_tavern_map` | 段2 | 0 | 43/0 | `43/43 PASSED   FAILED 0   **PENDING** 0` | 22 | 0 | — — | 0 |
| 127 | `verify_title_screen` | 段2 | 0 | 86/0 | `[title-screen] RESULT: 86/86 passed` | 66 | 0 | — — | 0 |
| 128 | `verify_town_exit` | 段2 | 0 | 23/0 | `素 23/23 PASSED  (PENDING 0)` | 7 | 0 | — — | 0 |
| 129 | `verify_town_map` | 段2 | 0 | 85/0 | `85 / 85` | 51 | 0 | — — | 0 |
| 130 | **`verify_walk_block`** | 段2 | **1** | 22/1 | `22/23 PASSED   FAILED 1   **PENDING** 0` | 15 | 1 | 1 1 | 1 |
| 131 | `verify_world_map` | 段2 | 0 | 57/0 | `57/57 PASSED   FAILED 0   **PENDING** 0` | 76 | 0 | — — | 0 |
| 132 | `driver_grid_p9` | 段2 | 0 | 52/0 | `[drv] 52/52 PASS` | 429 | 0 | — — | 0 |
| 133 | `driver_field_wagon` | 段2 | 0 | 18/0 | `=== 測定妥当性 18/18 PASS ===` | 590 | 0 | — — | 0 |
| 134 | `driver_field_step0` | 段2 | 0 | 33/0 | `=== 測定妥当性 33/33 PASS ===` | 675 | 0 | — — | 0 |
| 135 | `driver_diag_watchdog` | 段2 | 0 | 34/0 | `PASS 34 / FAIL 0` | 734 | 0 | — — | 0 |
| 136 | `probe_p9_tour` | 段2 | 0 | 0/0 | `→ 4 か所すべて回れた: 4 / 4` | 1658 | 0 | — — | 0 |
| 137 | **`driver_field_step6`** | 段2 | **1** | 55/4 | `=== 55/59 PASS ===` | 1384 | — | 1 1 | 1 |
| 138 | `driver_bgm_title` | 外 | 0 | 16/0 | `16/16 PASS` | 2 | — | — — | 0 |
| 139 | `driver_doors_p1` | 外 | 0 | 44/0 | `PASS 44 / FAIL 0` | 0 | — | — — | 0 |
| 140 | `probe_town_mask` | 外 | 0 | 0/0 | `到達できないマス = 0 件 (0 件が正常)` | 1 | — | — — | 0 |
| 141 | **`verify_codex_map_skill`** | 外 | **1** | 16/1 | `16/17 PASSED   FAILED 1   **PENDING** 0` | 16 | — | 1 1 | 1 |
| 142 | `verify_road_events` | 外 | 0 | 25/0 | `25/25 PASSED   FAILED 0   **PENDING** 0` | 84 | — | — — | 0 |
| 143 | `verify_world_heromark` | 外 | 0 | 18/0 | `18/18 PASSED   FAILED 0   **PENDING** 0` | 10 | — | — — | 0 |
| 144 | `verify_world_steps` | 外 | 0 | 33/0 | `33/33 PASSED   FAILED 0   **PENDING** 0` | 54 | — | — — | 0 |

- 列の読み方: 「判定行 P/F」は `fp68.py` が数えた PASS/FAIL 判定行の数(集計行の数字と違う本がある = 小見出しや再掲の数え方の違い)。
  「中断 run」= (0) の独立標本、「再走」= 再走 1 巡目 / 2 巡目、「#67項目6」= `157a9ca` での #67 項目6 の exit(`—` はその走行が無い)。
- ⚠ **`verify_aoe_coverage_negative` の集計行 `27/28 PASSED FAILED 1` は最後の変異(m9)の走行の集計**で、赤ではない。判定は exit 0 と `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)`。

#### (e) 非緑 14 本の分類 — ⛔ どれも #68 の責任ではない(本番は `157a9ca` と同一)

標本 = 中断 run / 本走査 / 再走 1 / 再走 2 の **4 回**(`verify_codex_map_skill` と `driver_field_step6` は中断 run に無いので **3 回**)。
⚠ 2 回一致を安定の根拠にしていない(#67 の `verify_run_chronicle` の教訓)。観測の行列 = `obs_matrix68.tsv`。

**(a) 安定した赤 — 11 本**(全標本で赤、FAIL の判定行も全標本で同じ)

| 本 | exit | 赤/標本 | 判定行(引用) |
|---|---|---|---|
| `driver_grid_p4` | 3 | 4/4 | `[drv] ⛔ 変異 n1ringonly の置換対象が 見つからない → 負のコントロールが空振りする` = 変異アンカーの腐敗で起動時に即死 |
| `driver_mapeditor` | 1 | 4/4 | `176/179 PASS (FAIL 3)` — `FAIL §2 12b 実マウス: 部屋の上の左ドラッグは部屋が動く (パンしない)` / `§3 12a 実マウス: 部屋内クリックで敵スロットが置かれる` / `§3 12b 実マウス: 既存スロットをドラッグすると移動する` |
| `driver_mapeditor_painting` | 1 | 4/4 | `PASS 105 / FAIL 1` — `FAIL §1 1d2 ★label は全件が非空で、種類数 = 縦横サイズの種類数 (無言の取り違えの検出)`(label 17 / サイズ種類数 16) |
| `driver_grid_p8` | 1 | 4/4 | `PASS 55 / FAIL 1` — `FAIL (6d) ★★他 4 シナリオの n7 (9x6) は大部屋ではないので入室即ボス部屋 = 恒等` |
| `driver_monsters_umberhulk` | 1 | 4/4 | `21/22 passed` — `(3) 再発火: 同一 enemyIdx が2回以上 gaze (gazeCooldown 明けに再発火)` |
| `driver_sce1_events` | 1 | 4/4 | `211/214 passed` — `(2) sceneFlags のキーはちょうど 3 本` / `(4d) 母集団ガード` / `(N2-隣) 変異N2 は D1/D4 を巻き込まない`(実測 `flags=["mine_alerted","mine_ranged_opening","s3_novice_swayed","servant_rescued"]`) |
| `driver_speech_v2` | 1 | 4/4 | `45/46 passed` — `NG (A1) 全 50 敵種に enemy.cry.<type> がある (ENEMY_TYPES 51 件中)`(`swampNovice`) |
| `sweep_recruit_balance` | 1 | 4/4 | `[sweep] ⛔ 装置 assert が崩れた走行が 4/4 件あります` |
| `verify_walk_block` | 1 | 4/4 | `22/23` — `FAILED (3d) badge を持つ ENEMY_TYPES 定義が 44 件のまま`(実測 `badge 持ち 45 件`) |
| `verify_codex_map_skill`(母集団外) | 1 | 3/3 | `16/17` — `FAILED (3a) 既存 4 件を焼き直すと assets/ の現物と SHA-256 が完全一致する`(`検算 NG: stag-tavern`) |
| `driver_field_step6` | 1 | 3/3 | `(C-bandits-forest)` / `(C-lizard-swamp)` / `(C-orc-fort)` が 3/3 で FAIL(`★?graph=auto が出口を自動選択して entry から前進した — 前進=せず`)。⚠ 4 本目の **`(C-undead-temple)` は FAIL / FAIL / PASS** = 本の中のフレーク(#67 と同じ)⇒ 集計は `55/59` と `56/59` の 2 通りが出る |

⭐ この 11 本は #67 §12-5 (e) の「安定して赤い 11 本」と**同じ顔ぶれ・同じ FAIL 行**。

**(b) フレーク — 本走査では緑に出たが、同じ木で赤も出る本**

| 本 | 中断 run | 本走査 | 再走 1 | 再走 2 | 赤の判定行 |
|---|---|---|---|---|---|
| ⭐ **`driver_monsters_hobgoblin`**(新顔) | **1** | 0 | **1** | **1** | `❌ (e) 孤立配置でパーティが hobgoblin を攻撃した (acProbe 記録あり) — entries=0` + `❌ (e) 孤立配置では実効AC=16 のみ — minAc=0 maxAc=0` |
| `driver_monsters_griffon`(#67 フレーク) | 0 | 0 | 0 | **1** | `❌ (3) swoop: グリフォン が rear/mid を実際に狙う (>=1回) — grifRearMid=0/10` |
| `driver_speech_engine`(#67 フレーク) | 0 | 0 | 0 | **1** | `❌ (4) カメラが実際に動いた (テストが空回りしていない) — camXレンジ=4.2px` |
| `driver_wall_props`(#67 フレーク) | **1** | 0 | 0 | 0 | `(3a) ★北壁の帯は 1 画素も変化しない` / `(3b) ★床は 1 画素も変化しない` |
| `driver_monsters_kobold`(#67 フレーク) | 0 | 0 | 0 | 0 | —(4 回とも緑。#67 の着手前では赤が出た) |
| `verify_run_chronicle`(#67 フレーク) | 0 | 0 | 0 | 0 | —(4 回とも緑。#67 では 7/10 緑) |

- ⭐ `driver_monsters_hobgoblin` は **#67 の 2 走行(着手前 `bed11e7` / 項目6 `157a9ca`)ではどちらも緑**だったが、今回は同じ本番で **3/4 赤**。
  赤は全部 `entries=0` = 観測窓(`driver_monsters_hobgoblin.js:249` の `for (let i = 0; i < 160; i++) {   // 最大 ~48s`)のうちに、パーティが孤立したホブゴブリンを 1 度も殴らなかった空振り。
  緑の回も `entries=1`(#67 は `entries=3`)で、所要も #67 の 14〜19 秒に対して 56〜70 秒 = 観測窓の上限まで待っている。
  ⚠ 機械が遅くなったせいではない: 20 秒以上かかる 69 本の所要の比(本走査 ÷ #67 項目6)の**中央値は 1.002**。
  ⇒ **観測窓に依存するフレーク**として扱う(`driver_field_step6 (C-undead-temple)` と同じ型)。⛔ 項目5 はこの本の赤を #68 のせいにしない。
- #67 のフレーク 5 本のうち、4 回の中で赤が出たのは griffon / speech_engine / wall_props の 3 本。kobold と run_chronicle は 4 回とも緑(⛔「直った」とは読まない)。

**(c) 赤ではない — 4 本**

| 本 | exit | 根拠 |
|---|---|---|
| `probe_bandit_map` / `probe_s2_fold` / `probe_swamp_map` | 3(0.0 秒)4/4 | 引数なしの使い方ガード(`[probe] --mapdefs / --places / --grid / --ai のどれかを指定` ほか)。**引数腕 `--places` / `--kinds` / `--bfs` は 3 本とも exit 0**(中断 run と本走査の 2/2)で実データを出し切った |
| `probe_n4_stall` | **1 / 0 / 1 / 0** | ⚠ **調査の道具で検出器ではない**(冒頭 `⚠ これは**調査の道具**であって検出器ではない (受入条件を持たない)`、`:414 process.exit(caught ? 0 : 1)`)。exit 1 = `試行 1: 停滞は観測されませんでした`、exit 0 = `★ 停滞を捕捉: node=n7 tile=(39,16) … 同一タイル 8 秒`(道具の解釈 `heroTurnPause 消化中 (通常は数 tick で抜ける)`)。**どちらの色も退行の信号にならない** ⇒ 項目5 はこの本で緑→赤 / 赤→緑を数えない |

**未完走 — `probe_party_size`**(600 秒で打ち切り。⭐ SKIP ではなく単独で測った)

- 12:03:36 開始 → 12:13:36 に **自力で終了せず**打ち切り(`taskkill /F /T` 後の exit 1、残存 node なし)。ログ 46 行。
- 打ち切り時点の末尾は #67 項目6(`probe_party_size_note.txt`)と**数字を除いて同一**(`NG (1e)` / `NG (2a)` / `NG (2b)` / `NG (2z1)`〜`(2z4)` / `OK (2z5)` / `OK (4z0) 変異アンカーが tavern.html にちょうど 1 箇所ある -- hits=1`)。

#### (f) 名指し 4 本 + `--negative` の基準値(本走査。判定は `verify_cone_cast --negative` 以外は中断 run でも同じ)

| 本 | exit | 集計 | 秒 | 基準として控える中身 |
|---|---|---|---|---|
| `verify_aoe_coverage` | 0 | `28/28 PASSED FAILED 0 PENDING 0` | 2.5 | `OK (1c) ★ 直線 (ライトニングボルト): 味方が線上に居ても方向を捨てない … 素 ライトニングボルト {"kind":"line","attempts":1,"cast":1,…}` / `OK (6b) … 直線 ["SPELLライトニングボルト 直線 2体(味方 1 名は無傷)"]` |
| `verify_aoe_coverage --negative` | 0 | `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)` | 25.7 | 変異 m1,m2,m2s,m3,m4,m5,m6,m7,m8,m9。**m8** = `★ 負のコントロール m8 (直線 lightning-bolt の blocked を残す) を注入しました (/index.html)` → `--negative m8: 担当=(1c) / 実際に赤くなった=(1c),(6b)` → `✓ m8 OK`。ほかの変異の走行では `(m8 はアンカー健在・--only 指定により注入せず)` = **アンカー :28615 が 1 箇所**。m2s は担当 (4a) に加えて (4b) も赤 |
| `verify_cone_cast` | 0 | `19/19 PASSED FAILED 0 **PENDING** 0` | 74.5 | `PASSED (4a) … allyBurningHands / allyConeOfCold の本文に const directions = [ が 0 件` / 記録 `配信全体の const directions = [ = 1 件 (allyLightningBolt の 8 方向は別物なので残る)` |
| `verify_cone_cast --negative` | 0 | `41/41 PASSED FAILED 0 **PENDING** 0` | 190.4 | 変異 **14 本**(vetoback / only4dir / dirtyfirst / nobreak / zerofoe / noadvance / alwaysadvance / advadjacent / reachdrift / retreatdead / coldstale / seamonly / noknown / flatpop)が全部担当の節を赤くした。配信検算 `n0a-coldstale`: ヘルパー呼び出し 素×2 → 変異×1 / `const directions = [` **素×1 → 変異×2** / 素の配信 1899991 B |
| `driver_field_step7` | 0 | `79/79 PASS` | 245.4 | 記録 `(P2) 直線/円錐/splash の降格率を実測できた — line 68.0% / cone 80.5% / splash 86.8%`(line = 272/400。ドライバ自前の旧 3 マス 8 方向の写しなので #68 の後も動かないはず) |
| `driver_action_priority` | 0 | `RESULT: PASSED 92 / FAILED 0 / PENDING 0` | 121.5 | `allyLightningBolt` は `:1232` でスタブへ差し替える名前の一覧に居る(関数名を変えないこと) |

#### (g) #67 項目6(`157a9ca`)との突き合わせ — 同じ本番なので一致するはず

`py fp68.py compare <#67 の item6\result_item6a.FINAL.tsv> result_base68b.FINAL.tsv item6a67_vs_base68b`(→ `compare68_item6a67_vs_base68b.txt`)。共通 **139 本**。

- **exit**: 緑→赤 **0** / 赤→緑 **1**(`probe_n4_stall` 1→0 = (e)(c) の調査プローブ)/ 非緑のまま **14**(集合も一致)。
- **経路① assert id の集合**: 新しく FAIL になった id = **1**(`driver_field_step6` の `C-undead-temple`。(e)(a) の本の中のフレーク)/ 消えた id 0 / 増えた id 0。
- **経路② 判定行の多重集合**: 新しい FAIL 行 = **1**(同じ `(C-undead-temple)`)/ PASS から消えて FAIL にもなっていない行 = 6。
  6 行はどれも**鍵に実測値が混ざる表記ゆれ**で退行ではない: `driver_grid_p5` の `(2b1)` 系 4 行が `ally:dwarf` ↔ `ally:elf`(乱数で組まれた職業名が鍵に入る)/
  `driver_field_step1` の対照行の末尾文言 / `probe_s2_clear` の `残敵=##` ↔ `残敵=#`(桁数)。
- ⇒ **一致**。本番が同じ木で、違いは両方の色が出る 2 点だけ(`probe_n4_stall` / `(C-undead-temple)`)。

指紋の被覆率(`py fp68.py coverage result_base68b.FINAL.tsv base68b`): 判定行 **6752** 行のうち id を取れた行 **6743(99.9%)**
(id の無い行 9 行 = `probe_s2_clear` 1 / `driver_skillcheck_roster` 1 / `driver_field_step2` 3 / `driver_mapeditor_painting` 2 / `driver_mapeditor_props` 1 / `driver_mapdef_step2` 1)。
比較として #67 の旧正規表現(数字始まりの id)で拾えるのは 3471 行(51.4%)= **48.6% を見落とす**(#67 項目6 の 48.2% と同じ穴)。

#### (h) 崩れた主張

| # | 主張(出どころ) | 実測 |
|---|---|---|
| 1 | §4-1「`157a9ca`・clean を期待」 | 着手時 HEAD = `98419b0`(#68 起草)+ 起草窓の未追跡 1。走査は起草窓が積んだ `4ef76eb`(#69 起草)の上。**本番・tools の差分はどちらも 0 バイト** |
| 2 | §2-6「`verify_cone_cast.js:1683` (4a) は件数を記録に出すだけ → 変更不要」 | 素の (4a) は記録だけで正しい。⚠ ただし **`--negative` の 3 変異が #68 の触る行を逐語で掴んでいる**((c) の表): `retreatdead` のアンカーは `BOLT_AIM_ON` の挿入点の直前 :28438、`coldstale` の配信検算は `const directions = [` の本数を「素 +1」で数え、**素の 1 本は LB 本文 :28595**。相対比較なので LB 側を消しても理屈では緑のまま。ただ、素の走行だけではアンカーの腐敗が見えない(#60)ので、**基準に `verify_cone_cast --negative`(41/41・14 変異)を足した** |
| 3 | 指示「今回の色は #67 項目6 の最終結果と一致するはず」 | exit は共通 139 本のうち **138 本が一致**。不一致 1 本 = `probe_n4_stall`(4 標本で 1/0/1/0)。判定行では `(C-undead-temple)` が FAIL 側。**どちらも同じ木で両方の色が出る**ので、一致とみなした |
| 4 | メモ「`probe_n4_stall` は健全なとき exit 1」 | 正しいが片側だけ。**exit 0 は「停滞を捕捉した」**(`:414`)で、4 回中 2 回そうなった。受入条件を持たない調査の道具 = **どちらの色も合否に使わない** |
| 5 | 指示「非緑は `flake5.txt` のフレーク 5 本が特に」 | 4 回で赤が出たのは 5 本中 3 本(griffon / speech_engine / wall_props)。⭐ **フレーク 5 本の外に新顔 `driver_monsters_hobgoblin`(3/4 赤)**。#67 の 2 走行ではどちらも緑だった |
| 6 | 指示「段2 は #67 では 134 本」 | `index.html` / `tavern.html` だけで引き直すと **133 本**。`verify_codex_map_skill` と `driver_doors_p1` が母集団外へ移った((b)) |
| 7 | (指示に無い)この scratchpad は空のはず | 同じ項目1 の**中断した走査**が残っていた。原因は Windows Update の再起動((0))。やり直した |

⭐ 当たったもの: LISTEN は着手前も後も lghub の 9010 / 9180 だけ / §2-3 の行番号(`step <= 3` の 4 件 :12245 :28610 :28631 :28937、`"lightning-bolt": {` :22128、`spellAoE` :20104、`CONE_CAST_ON` :28437、`allyLightningBolt` :28583、`aoeLineSafeAllyTag` :28174)/
§2-6 の m8 アンカーが**ちょうど 1 箇所**(:28615)/ §2-7 の `:28399` は `window.__aoeCover` の中の `aoeLineSafeAllyTag: aoeLineSafeAllyTag,`(代入の開始は :28393)/ §2-9 の行末(`index.html` CRLF 39464 = LF 39464、`tavern.html` 10586 = 10586、依頼書 `.md` は純 LF 426 行)。

#### (i) ポート衝突 — **なし**

- 10300〜10320 を使う本は `tools/*.js` 全 145 本で **0 本**(直書き 0。10000 番台の base は全部 `PORT + 1 + i` 型で、最上位は `verify_dragon_fold` 10281〜10290、次が `verify_temple_fold` 10261〜10268 / `verify_eol_doorfix` 10241〜10250)。
- 走査中の LISTEN の事前確認でも 10300 番台は 1 度も出ていない。⚠ `ERR_UNSAFE_PORT` の goto 実測は項目4 の担当。
- 参考: `driver_doors_p2` の既定ポートは **9010** で lghub_agent の `127.0.0.1:9010` と同じ番号だが、本走査・中断 run とも緑で完走している。

#### (j) 生ログ・TSV・指紋の絶対パス(⭐ 項目5 はこの表でなく**ここ**と突き合わせる)

`C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\b0fa1865-6afd-4eba-a0b1-818df2247585\scratchpad\baseline68\`

- 走行名簿 = `runlist68b.txt`(144 行・`<group>|<file.js>|<args>`)/ 再走の名簿 = `runlist_rr68.txt`(21 行)
- 母集団 = `population68.txt`(133)/ `outside68.txt`(7)/ `population68.json` / `population68_report.txt` / **段1 = `stage1_roster.txt`** / 抽出器 = `pick_pop68.py`
- 結果(凍結)= **`result_base68b.FINAL.tsv`**(本走査)/ `result_rr68_1.FINAL.tsv` / `result_rr68_2.FINAL.tsv` / `result_base68int.VALID.FINAL.tsv`(中断 run の有効 135)/ `result_base68.INTERRUPTED.FINAL.tsv`(中断 run の全 143)
- 生ログ = `logs\base68b\<本>[_<引数>].log`(144 本)/ `logs\rr68_1\` / `logs\rr68_2\`(各 21 本)/ `logs\base68\`(中断 run)/ `logs\party_size\probe_party_size_CUTOFF.log` + `probe_party_size_note.txt`
- **指紋 ① assert id の集合** = `fp68_ids_base68b.tsv`(`book / id / n_pass / n_fail / n_other`)
- **指紋 ② 判定行の多重集合** = `fp68_lines_base68b.tsv`(`book / status / count / key_norm`。数字は `#` に置換)
- 両方 + 集計行 + 末尾 5 行 = `fp68_base68b.json` / 本ごとの要約 = `summary68_base68b.tsv` / 再走と中断 run も同じ形(`*_rr68_1` / `*_rr68_2` / `*_base68int`)
- 突き合わせの道具 = `fp68.py`(`analyze` / `compare <前.tsv> <後.tsv> <label>` / `coverage`)。⭐ 項目5 は `py fp68.py compare result_base68b.FINAL.tsv <着手後.FINAL.tsv> <label>` で 2 経路を同時に出せる
- 非緑の抜粋 = `nongreen_base68b.FINAL.txt` / 観測の行列 = `obs_matrix68.tsv` / #67 項目6 との比較 = `compare68_item6a67_vs_base68b.txt` / 表 = `table68_base68b.md`
- 走査器 = `sweep68.py`(⚠ 既に在るタグは exit 2 で拒否する。TSV は走り終えたら `*.FINAL.tsv` へ凍結)/ 並走検査 = `check_foreign.ps1`(`pwsh` で起動)/ 待機 = `wait68.py` / 打ち切り走行 = `run_party_size68.py`
- アンカーの洗い出し = `anchor_scan68.py` → `anchor_scan68.txt` / ポート = `port_check68.txt` / 着手前後の控え = `pre_state.txt` / `blob_before.txt` / `blob_after.txt`
- ⚠ scratchpad はセッション固有。消えても困らないよう、分類と基準値はこの §12-0 に写した。

#### (k) 項目2〜5 へ

- ⭐ 項目5 の非退行で**赤に数えない本**: (e)(c) の 4 本(使い方ガード 3 本 + `probe_n4_stall`)。**フレークとして単独再走してから判定する本**: `driver_monsters_hobgoblin` / `driver_monsters_griffon` / `driver_speech_engine` / `driver_wall_props` / `driver_monsters_kobold` / `verify_run_chronicle` と、`driver_field_step6` の `(C-undead-temple)`。
- ⭐ 項目2/3 で本体を書くときの地雷: m8 のアンカー行(:28615)を**逐語のまま 1 箇所**に保つ / `BOLT_AIM_ON` の行に `get("conecast")` を写経しない(`retreatdead` のアンカーが 2 箇所になる)/ LB 本文の `const directions = [` を消すかどうかで `verify_cone_cast` の `coldstale` の検算の数字(素×1)が動く = 項目5 で `--negative` の中身まで見る。
- ⭐ `driver_field_step7 (P2)` の line 68.0% はドライバ自前の写しなので、#68 の後も同じ値のはず(動いたら理由を突き止める)。

### 12-1. 本体の実装(項目2)

- **測定日**: 2026-09-17(実装窓 `b0fa1865`・dev-loop 項目2)/ 基準 = `a23e002`(項目1)。
- 触ったのは `index.html` / `tavern.html` / 本書だけ。⛔ `tools/` は 0 バイト。`mageAI` の梯子・`fallbackOrder`・円錐/箱型/splash・バーニングハンズの演出(`:12245` / 着手後 `:29012`)は diff に 1 行も出ていない。
- 編集は `py` でバイト単位(置換ごとに出現数 1 を assert、1 件以外なら書き込み前に exit)。行末は `index.html` CRLF **39539 = LF 39539**、`tavern.html` CRLF **10586 = LF 10586**(changelog は 1 行足して 1 行落とすので数は同じ)。本書は LF のまま。

#### (a) 変えた箇所(行番号は着手後)

| 行 | 何 |
|---|---|
| `index.html:22133` | `MAGE_SKILLS["lightning-bolt"].flavor` = `"敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減、MP 6)"` |
| `:28179`-`:28186` | **新** `aoeTilesSafeAllyTag(tiles)` = 列を受け取る無傷表示。既存の `aoeLineSafeAllyTag` と `window.__aoeCover` への公開は残した |
| `:28447`-`:28451` | **新** 撤退スイッチ `BOLT_AIM_ON`(`CONE_CAST_ON` の直後。§5-1 のコメントと形のまま) |
| `:28595`-`:28625` | **新** `boltLineTiles(aTX, aTY, dx, dy, L, stopAtWall)` = マス列ヘルパー |
| `:28626`-`:28655` | **新** `boltAimRays(aCX, aCY, L)` = 素の候補の向き |
| `:28657` | 見出しコメント(直線 3 タイル → 敵へ向けて直線 10 タイル・壁で止まる) |
| `:28658` `allyLightningBolt` | 探索 `:28668`-`:28697` / ダメージ対象 `:28708` / 無傷表示 `:28719` / 描画の終点 `:28727`-`:28730` |
| `tavern.html:4429` | flavor の鏡 = `"敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし"` |
| `tavern.html:3274` | changelog = §10 の文面そのまま(`py tools/add_changelog.py`。4 件維持) |

- 関数名 `allyLightningBolt` は不変(`driver_action_priority.js:1232` のスタブ一覧 / `window[fnName]` 呼びが読む)。
- `noteAoeOutcome(skill.name, boltOk, "line")` と、不発時に `allyBasicAttack` へ落ちて枠を減らさない挙動は不変。
- `best` は方向オブジェクトそのもの(`name` 付き)から `{ dx, dy, tiles }` へ変わった。`best.name` を読む箇所は元から 0 件。

#### (b) マス列ヘルパーの仕様と、撤退で旧挙動を再現する根拠

- `boltLineTiles` は整数倍の終点 `(aTX + dx·m, aTY + dy·m)`(`m = ceil(L / max(|dx|,|dy|))`)へ、`hasLineOfSight` と同じ Bresenham で歩く。
  チェビシェフ距離が `L` を超えたら打ち切り、`stopAtWall` なら `isTileWall` が真のマスの手前で打ち切る。終点は丸めない。
- ⭐ この Bresenham の判定(`2err > -ady` / `2err < adx`)は、終点ベクトルを正の整数倍しても変わらない
  (err も ady / adx も同じ倍率で伸びる)。したがって:
  - 既約ベクトル `(dx, dy)` の格子点を誤差 0 で周期的に通る。
  - 術者→敵の `hasLineOfSight` が調べるマス列は、ヘルパーの列の**先頭部分と完全に一致**する
    ⇒ 視線が通る敵は、壁で止まる前に必ず列に入る。
- **数値検証**(`bres_check.py`、|DX|,|DY| ≤ 12 × L ∈ {3, 5, 10} = **1872 通り**)で `bad 0`:
  - 敵のマスが列に入る ⇔ チェビシェフ ≤ L
  - 列の先頭 = LOS の経路
  - 列のチェビシェフ距離は単調増加で、最後が L
- **撤退**(`L = 3`・8 方向の単位ベクトル・`stopAtWall = false`)の列は 8 方向すべてで `[(dx,dy),(2dx,2dy),(3dx,3dy)]` = 旧 3 マスループと同じ(同じ検証で `bad 0`)。
- **探索**: `boltLen = BOLT_AIM_ON ? getRange(skill.range).tiles : 3`(`skill.range === "spellAoE"` を実測)。
  候補は `rays = BOLT_AIM_ON ? boltAimRays(...) : directions`。
  各候補の列を**共通ループ 1 本**で歩き、m8 のアンカー行(逐語・10 スペース)はそのループの中に 1 箇所だけ残る。
- **素の候補**:
  - 母集団 = `encounterEnemyIndices` のうち、生存かつ護衛対象でない敵。
  - 条件 = `tileChebyshev ≤ L` かつ `hasLineOfSight` が真。
  - 向き = `(ex − aTX, ey − aTY)` を gcd で既約化し、重複を除く。並びは `encounterEnemyIndices` 順で、同数なら先勝ち(`>`)。
- **ダメージ・無傷表示・描画**は採用した `best.tiles` だけを読む。探索とダメージが別々に「3」を持つ形は無い(本体に残る `3` は `boltLen` の撤退値と、撤退の描画終点の 2 つ)。

#### (c) 撤退の腕の描画終点 — 旧式のまま

- 素 = **列の最後のマスの中心** `((t.tx + 0.5)·T, (t.ty + 0.5)·T)`(依頼書 (1h))。
- 撤退 = 旧式 `aCX + best.dx * 3 * TILE_SIZE` のまま。
  理由: 旧式は術者の**中心ピクセル**起点で、術者がタイル中心に居ないとき(移動のスライド中など)はタイル中心とずれる。旧挙動の完全再現を優先した。
- 1 行の分岐 `const boltEnd = BOLT_AIM_ON ? best.tiles[best.tiles.length - 1] : null;` で切り替える(変異 `endstale` の注入点)。

#### (d) アンカー表(`anchor_table.py`。`tools/*.js` 全 145 本の 12 字以上の文字列リテラルを、`index.html` / `tavern.html` での出現数で前後比較)

| 範囲 | 着手前 | 着手後 | 変化 |
|---|---|---|---|
| 全 145 本(出現 ≥ 1 の行) | 2843 | 2841 | **3 件** |
| 名指し 4 本(`verify_aoe_coverage` / `verify_cone_cast` / `driver_action_priority` / `driver_field_step7`) | 268 | 266 | **2 件**(下表)。他の 264 件は出現数が 1 つも変わっていない |

変わった 3 件と、測定が壊れない理由(ソースで確認):

| 本:行 | リテラル | 数 | 理由 |
|---|---|---|---|
| `verify_cone_cast.js:328` | `        for (let step = 1; step <= 3; step++) {` | 1→0 | 変異 `coldstale` の**注入する側の文面**(`OLD` 配列 `:323`-`:346`)。`verifyServed`(`:356`-`:364`)が数えるのは `neg:coldstale` / `const best = pickConeDirection(aTX, aTY);` / `const directions = [` の 3 つだけ |
| `verify_cone_cast.js:337` | `      for (const d of directions) {` | 1→0 | 同上 |
| `verify_road_events.js:1320` | `'sessionStorage '` | 16→17 | assert の detail 文字列。`BOLT_AIM_ON` のコメント(§5-1 の指定文面)に当たっただけ。この本は母集団外(`index.html` を読まない) |

- ⚠ 初回の書き込み直後は **9 件**だった。残り 6 件は全部コメントか変数名の偶然一致(`'allyLightningBolt'` ×4 がコメント中の関数名 / `driver_cast_circle` の罫線 `──` / `driver_mapeditor` の `'    const seen = new Set();'`)で、実害は無かった。それでも差分を小さくするため、コメントの語・罫線の長さ・変数名(`seen` → `seenDirs`)を直して 3 件にした。
- 逐語アンカーの個別の数:

| アンカー | 前 | 後 |
|---|---|---|
| m8 `          if (!AOE_COVER_ON && partyInArea(tx, ty, 1, 1)) { blocked = true; break; }` | 1(:28615) | **1**(:28692) |
| `retreatdead` `new URLSearchParams(window.location.search).get("conecast") !== "0";` | 1 | **1** |
| `reachdrift` `for (let step = 1; step <= CONE_REACH_TILES; step++) {` | 1 | **1** |
| `zerofoe` `if (cnt <= 0) continue;` | 1 | **1** |
| `coldstale` の検算 `const directions = [` | 1(:28595) | **1**(:28669) |
| `function allyLightningBolt` | 1 | **1** |
| `get("boltaim")` | 0 | **1**(:28451) |
| `for (let step = 1; step <= 3; step++)` | 4(:12245 :28610 :28631 :28937) | **2**(:12245 `spawnConeFlames` / :29012 `allyBurningHands`。どちらも無変更) |

- ⚠ `grep -c boltaim index.html` は **4 行**(判定 1 + コメント 3 = :28447 / :28605 / :28668)。(0a) は語でなく `get("boltaim")` の数で測ること。

#### (e) 検証

1. **ページが壊れていない**:
   - 合成盤面プローブの 4 腕(素 / `?boltaim=0` / `?aoecover=0` / `?dndrange=0`)すべてで、盤面を叩いた後も含めて **pageerror 0 / console.error 0**。
   - `verify_aoe_coverage` の `(7a)`(index の 2 腕と tavern を開いた後のページエラー 0)も OK。
2. **合成盤面プローブ**(`probe_board68.js`、port 10331)= **25/25 OK**。
   - 作法は `verify_aoe_coverage` の `installProbe` を写した。
   - goblin-mine には 14×4 の自然な床が無かったので、最長の床の行 (25,14) の周りを `mapData = 0` で掘った(プローブの中だけ)。
   - 判定 = `__aoeStats["ライトニングボルト"]` の attempts / cast / demoted と、敵 HP の減り。

| # | 盤面(術者からの相対) | 素 | `?boltaim=0` | ほか |
|---|---|---|---|---|
| (a) | 敵 (4,1) | cast 1 | demoted 1 | |
| (b) | 敵 (7,0) | cast 1 | demoted 1 | |
| (c) | 敵 (11,0) | demoted 1 | demoted 1 | |
| (d) | 壁 (3,0) / 敵 (5,0) | demoted 1 | | |
| (e) | 敵 (3,0) + (8,0) | cast 1・**2 体とも HP 減** | | 吹き出し `直線 2体` |
| (f) | 味方 (3,0) / 敵 (6,0) | cast 1 `(味方 1 名は無傷)` | | `?aoecover=0` demoted 1 |
| (f2) | 味方 (2,1) / 敵 (4,2)(斜め) | cast 1 `(味方 1 名は無傷)` | | `?aoecover=0` demoted 1 |
| (g) | 敵 (6,0) / 敵 (4,0) | cast / cast | | `?dndrange=0`(L=5)で **demoted 1 / cast 1** |
| (h) | 敵 (7,0) | 終点 (3408,1392) = タイル (35,14) の中心 = 10 マス先 | | |
| (h2) | 敵 (4,1) | 終点 (3408,1584) = タイル (35,16) の中心 | | |
| (hw) | 壁 (6,0) / 敵 (3,0) | 終点 (2928,1392) = タイル (30,14) = **壁の手前** | | |
| (r3) | 敵 (3,0) | cast 1(終点 10 マス先) | cast 1・終点 2736 = `aCX + 3·96`(旧式) | |
| (r3d) | 敵 (2,2) | cast 1 | cast 1 | |
| wall2 | 敵 A (2,0) / 壁 (4,0) / 敵 B (6,0) | cast 1・hit = [A] | | `nowall` の検出用((f)-1) |
| range3 | A (5,0) / C (7,1) / B (11,1) | cast 1・hit = [A] | | `norange` の検出用((f)-2) |

3. **実プレイの煙試験**(起草窓の `probe68_spells.js` を複製し、`PROBE_QS` だけ足した。LB ×8 単独・廃坑・90 秒・各 1 回):

| 腕 | attempts | cast | 率 |
|---|---|---|---|
| 素(port 10341) | 7 | **5** | 71% |
| `?boltaim=0`(port 10342) | 11 | 2 | 18% |
| 素・診断つき再走(port 10343) | 5 | **4** | 80% |

   - 起草時の着手前(LB 単独)は 15 回選ばれて 0 回、2 回目は 24 回中 8 回(33%)。
   - 診断つき再走の不発 1 件は、**交戦中の唯一の敵が `hasLineOfSight = false`**(d = (1,−3)、cheb 3)= 仕様どおりの不発。撃てた 4 件はどれも、交戦中で L 以内かつ LOS 真の敵が居た。
   - どの走行も pageErrors は空。
4. **アンカーを掴む既存ドライバ**(直列・`timeout` なし):

| 本 | 結果 | 項目1 の基準 |
|---|---|---|
| `verify_aoe_coverage` | exit 0 `28/28 PASSED FAILED 0 PENDING 0`。(1c) 素 cast 1 / 撤退 demoted 1、(6b) `SPELLライトニングボルト 直線 2体(味方 1 名は無傷)` | 28/28 |
| `verify_aoe_coverage --negative` | exit 0 `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)`。**m8 = 注入成功 → 赤 (1c),(6b)**。m2s = (4a),(4b) | 10/10 |
| `verify_cone_cast` | exit 0 `19/19 PASSED FAILED 0 **PENDING** 0` | 19/19 |
| `verify_cone_cast --negative` | exit 0 `41/41 PASSED FAILED 0 **PENDING** 0`。`n0a-coldstale` = ヘルパー呼び出し 素×2 → 変異×1 / `const directions = [` **素×1 → 変異×2** | 41/41 |

   ⇒ 色も中身も項目1 の基準と同じ。
5. **後始末**: 8000〜11000 の LISTEN は着手前も後も `127.0.0.1:9010`(pid 19412)/ `127.0.0.1:9180`(pid 4764)の 2 件だけ。chrome 0 本。node は MCP サーバだけ。

#### (f) 依頼書の主張で崩れた点

| # | 主張 | 実測 |
|---|---|---|
| 1 | §8 負のコントロール「`nowall` → (1d) が赤」 | ⚠ **(1d) の盤面では赤くならない**。素の候補は `hasLineOfSight` が真の敵だけなので、壁の向こうの 1 体は `stopAtWall` を外しても候補に入らず demoted のまま。⇒ 盤面 **wall2**(A (2,0) / 壁 (4,0) / B (6,0)、素は A だけ被弾。`nowall` なら B も被弾するはず)で見る必要がある |
| 2 | §8「`norange` → (1c) が赤」 | ⚠ **(1c) の盤面では赤くならない**。候補の距離上限を外しても、列の歩きが L で打ち切るので 11 マス先の 1 体には届かず demoted のまま。⇒ 盤面 **range3**(A (5,0) / C (7,1) / B (11,1))。素は A だけ被弾。`norange` なら B への向き (11,1) の列が A と C の 2 体を通り、それが採られて C も被弾するはず(py の模擬で確認。敵 2 体の盤面では検出できる配置が 0 件) |
| 3 | §5-4「既存の `aoeLineSafeAllyTag` は撤退経路が使う」 | 撤退も**同じ `aoeTilesSafeAllyTag(best.tiles)`** を通した。撤退の列 = 単位ベクトル 1〜3 歩なので数は同じ。撤退だけ `aoeLineSafeAllyTag(..., 3)` を呼ぶと、本体に 3 つ目の「3」と 2 本目の列の引き直しが生まれるため(§2-3 の罠の型)。`aoeLineSafeAllyTag` は定義と `window.__aoeCover` の公開を残した(本番の呼び口は 0 件になった) |
| 4 | §8 (0a)「`boltaim` の判定がちょうど 1 箇所」 | 語 `boltaim` の行は **4**(コメント 3)。判定 `get("boltaim")` は 1 |
| 5 | (指示に無い)合成盤面は `verify_aoe_coverage` の作法で組める | ⚠ **不発の盤面で CDP が 240 秒ハングする**。不発 → `allyBasicAttack` → 射程外なら `allyAdvanceTowardPoint` の rAF が背景タブで止まる。`verify_aoe_coverage` の盤面は射程外の不発を作らないので踏んでいなかった。⇒ `allyBasicAttack` / `allyAdvanceTowardPoint` を即解決にする(`noteAoeOutcome` はその前に記録済み = 判定に影響しない) |
| 6 | (指示に無い)lane(最長の床の行)で盤面が組める | goblin-mine の lane は 21 マスの 1 行だけで、`dy = 1, 2` と壁の盤面に要る 14×4 の床が無い。プローブは掘って組んだ |

⭐ 当たったもの:
- §2-3 の「3」の 4 箇所の行番号(:28610 / :28631 / :28646 / :28653-:28654)
- `CONE_CAST_ON` :28437 / `allyLightningBolt` :28583 / m8 アンカー :28615 / flavor 2 枚の位置
- `spellAoE.tiles` = 10(`?dndrange=0` で 5)
- `aCX` は術者の中心ピクセル
- `add_changelog.py` は CRLF を保つ(読み込みで LF 化 → Windows の書き出しで CRLF に戻る = `tavern.html` 10586 = 10586)

#### (g) 項目3/4 へ

- 変異を 1 行の置換で入れる注入点(すべて `index.html` / `tavern.html` で**出現数 1** を実測):

| 変異 | 逐語行 | 置換の例 |
|---|---|---|
| `reach3` / `hardcode10` | `      const boltLen = BOLT_AIM_ON ? getRange(skill.range).tiles : 3;` | `? 3 : 3` / `? 10 : 3` |
| `rays8` | `      const rays = BOLT_AIM_ON ? boltAimRays(aCX, aCY, boltLen) : directions;` | `      const rays = directions;` |
| `nowall` | `        const tiles = boltLineTiles(aTX, aTY, d.dx, d.dy, boltLen, BOLT_AIM_ON);` | 末尾の引数を `false`(別案 = ヘルパー内 `        if (stopAtWall && isTileWall(tx, ty)) break;`) |
| `dmgray` | `      for (const t of best.tiles) for (const i of enemiesInArea(t.tx, t.ty, 1, 1)) lineEnemyIdxs.add(i);` | `aTX + best.dx * s` の 3 歩ループへ |
| `norange` | `        if (tileChebyshev(aCX, aCY, eCX, eCY) > L) continue;` | 行を無効化 |
| `vetogone` | m8 と同じ行 | `!AOE_COVER_ON &&` → `false &&` |
| `switchdead` | `      new URLSearchParams(window.location.search).get("boltaim") !== "0";` | `      true;` |
| `endstale` | `      const boltEnd = BOLT_AIM_ON ? best.tiles[best.tiles.length - 1] : null;` | `      const boltEnd = null;` |
| `flavor3` | `tavern.html` の `flavor: "敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし"` | `"直線 3 タイル …"` へ |

- 素のアンカー表(着手後)は scratchpad `item2\anchors_after2.tsv`。項目5 はこれと突き合わせれば、#68 の後に足したアンカーの腐敗を拾える。
- 実プレイの 2 経路目((2b))は次の順で再計算すること(`probe68_spells_diag.js` の `cands` に全部の材料がある):
  1. `encounterEnemyIndices`(全 `enemies` ではない)
  2. 生存・非護衛
  3. cheb ≤ L
  4. `hasLineOfSight`
  5. gcd で既約化
  6. Bresenham で壁の手前まで
  7. `enemiesInArea` と同じ条件(非 inactive)で数える
- 生ログ・スクリプト = `C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\b0fa1865-6afd-4eba-a0b1-818df2247585\scratchpad\item2\`
  - 盤面: `probe_board68.js` / `.log`
  - 実プレイ: `smoke_base.log` / `smoke_boltaim0.log` / `smoke_diag.log`
  - 既存ドライバ: `aoe_cov.log` / `aoe_cov_neg.log` / `cone_cast.log` / `cone_cast_neg.log`
  - アンカー: `anchor_table.py` / `anchors_before.tsv` / `anchors_after2.tsv` / `anchor_diff2.txt`
  - 検証: `bres_check.py` / `board_sim.py`
  - 書き換え: `patch68.py` / `patch68b.py`

### 12-2. 既存 golden の言い直し(項目3)

- **測定日**: 2026-09-17(実装窓 `b0fa1865`・dev-loop 項目3)/ HEAD = `e2927c3`(項目2)・作業ツリー clean。⛔ push していない。
- **結論 = 言い直し不要**。#68 の本体変更で腐った既存ドライバは **0 本**。`tools/` は 0 バイト(この項目で触ったのは本書だけ)。
- LISTEN(8000〜11000): 着手前 13:04:07 = `127.0.0.1:9010`(pid 19412)/ `127.0.0.1:9180`(pid 4764)の 2 件、chrome 0 本、node 24 本(MCP)。後始末の確認 13:12:26 も**同じ**。ドライバはどれも自分のサーバとブラウザを閉じて終わり、落としたプロセスは無い。

#### (a) 腐りうる本の引き方 — 4 経路の union = **4 本**(= 段1 と同じ)

| 経路 | 引き方 | 当たり | 読んだ結果 |
|---|---|---|---|
| ① 段1 | 項目1 の `stage1_roster.txt` | 4 本 | `driver_action_priority` / `driver_field_step7` / `verify_aoe_coverage` / `verify_cone_cast` |
| ② 語(**コメントを落としてから**) | `scan68_item3.py`。25 語 × `tools/*.js` 145 本 | 下の箇条 | 段1 の外で当たった本は、どれも #68 と無関係な文脈 |
| ③ 11 字以下の文字列リテラル + **正規表現リテラル** | `lit_scan_i3.py`(項目2 のアンカー表は 12 字以上の文字列だけ = その穴)。`a23e002` と作業ツリーで出現数 / マッチ数が変わったものを全部出した | 392 行(`function` / 空白 / `null` などの雑音を除くと 143 行) | 143 行を全部読んだ。どれも「ログの見出し文字列」「DOM から読んだ文字列に当てる正規表現」「#68 が触らない関数の切り出し」。**index.html / tavern.html の本文を数えて assert する本は 0** |
| ④ 呪文 UI の描画 | `.skillItem` / `sFlavor` / `spellCountItem` / `renderSpellSlotItem` / `MAGE_SKILLS_UI` | 2 本(`driver_action_priority` / `verify_party_match_setup`) | 押す位置は実行時の DOM 矩形から取る(`clickCenterOfSel`)か `.click()`。flavor の文言は比べていない ⇒ flavor が長くなって折り返しが変わっても壊れない |

経路②の内訳:

- `lightning-bolt` 2 本 / `allyLightningBolt` 3 本 / `ライトニングボルト` 1 本 / `__aoeStats` 3 本 / `noteAoeOutcome` 2 本 / `MAGE_SKILLS` 1 本 / `__aoeCover` 1 本 / `mageAI` 2 本 / `cone-of-cold` 1 本 / `step <= 3` 1 本 / `directions` 1 本 ⇒ **全部段1 の 4 本の中**。
- `aoeLineSafeAllyTag` / `spawnLightningBolt` / `changelog`(大文字小文字無視)/ `更新情報` / `はじめの画面` / `line3` / `boltaim` ほか #68 の新名 / `Object.keys(MAGE_SKILLS)` ⇒ **0 本**。
  ⚠ `changelog` は素の grep だと 9 本出るが、全部コメント(changelog ガードの注記)。changelog の件数や先頭行を比べる本は無い。
- `flavor` 32 本:生成クエストの `flavor: ''`、敵定義の flavor、部屋イベントの flavor。**`MAGE_SKILLS` や酒場の呪文 UI の flavor を読む本は 0**。
- `直線` 3 本 / `spellAoE` 2 本:段1 以外は `driver_grid_p5`。見ているのは射程表 `WANT_RANGE.spellAoE = 10` と「直線レーン」(歩数の計測用の床)で、#68 は射程表を触っていない。
- `'line'` 6 本:段1 以外は world 系と傭兵名簿の `line`(台詞)で、呪文とは関係ない。
- 実プレイの乱数経路:LB を装備させる本は `driver_field_step7`(Part R)と `verify_aoe_coverage` だけ。本番の NPC 既定装備(`defaultSkills`)と `DEFAULT_KNOWN.mage` にも LB は無い ⇒ 実プレイで偶然 LB が出るようになる本は増えない。

#### (b) 走らせた本(HEAD・直列・`timeout` なし・走行の直前ごとに `procs=0 ports=`)

| 本 | 腕 | 走行 | exit | 集計 | 基準(`base68b`) |
|---|---|---|---|---|---|
| `driver_field_step7` | 素 | 本項目 `i3a` 245.5 秒 | 0 | `79/79 PASS` | 0 / `79/79` |
| `driver_action_priority` | 素 | `i3a` 121.6 秒 | 0 | `PASSED 92 / FAILED 0 / PENDING 0` | 0 / 92 |
| `driver_action_priority` | `--negative` | `i3a` **0.1 秒** | **1** | 注入前の事前検査で停止((c)) | 基準に無い |
| `verify_aoe_coverage` | 素 | 項目2 のログ | 0 | `28/28 PASSED FAILED 0 PENDING 0` | 0 / 28/28 |
| `verify_aoe_coverage` | `--negative` | 項目2 のログ | 0 | `10 本すべて担当ラベルが赤`。m8 = 注入 → (1c)(6b) 赤 | 同じ |
| `verify_cone_cast` | 素 | 項目2 のログ | 0 | `19/19` | 同じ |
| `verify_cone_cast` | `--negative` | 項目2 のログ | 0 | `41/41`。`coldstale` の `const directions = [` = 素×1 → 変異×2 | 同じ |

- 項目2 のログを引用してよい根拠:4 本のログ(12:47〜12:52)は `index.html` / `tavern.html` の最終更新(12:33:55 / 12:32:32)より後に書かれている。しかも `e2927c3` の後の作業ツリーは clean ⇒ HEAD と同じ本番を測っている。
- 突き合わせ = `py fp68_i3.py compare ..\baseline68\result_base68b.FINAL.tsv result_i3.FINAL.tsv base68b_vs_i3`(共通 6 本):
  - exit:緑→赤 **0** / 赤→緑 0
  - 経路① assert id:新しい FAIL id **0** / 消えた id 0 / 増えた id 0
  - 経路② 判定行の多重集合:新しい FAIL 行 **0** / 消えた PASS 行 0 / 増えた PASS 行 0
- `driver_field_step7` のログ全文の差(数字を `#` に正規化)は 2 箇所だけ:
  - `[profile]` の掃除の行 1 行
  - Part R の実プレイで観測された呪文名(基準 `ice-storm` → 今回 `conjure-volley`)
  - `(P2)` の `line 68.0% / cone 80.5% / splash 86.8%` は基準と同じ値(ドライバ自前の旧 3 マスの写し = §12-0 (k) の予想どおり)。
- 赤くなった本が 0 本なので、「単独 3 回の再走」は発生しなかった。

#### (c) `driver_action_priority --negative` の exit 1 — ⛔ #68 のせいではない(#35 `97f350d` 以来の死んだ変異)

- ログ:`[driver] 負のコントロール N3 の注入点が 2 箇所 (期待 1)。アンカーが腐っています:` / `const equippedIds = apEquippedIdsFor(slot, classKey);`。ブラウザを起こす前の事前検査で止まり、変異は 1 本も走らない。
- **切り分け 1 = 版ごとの注入点の数**(`ap_neg_anchors_i3.py`。ドライバ `:170-318` と同じ判定規則)

| 注入点 | `97f350d^` | `97f350d` | `157a9ca` | `98419b0` | `a23e002` | `e2927c3` | 作業ツリー |
|---|---|---|---|---|---|---|---|
| **N3**(tavern の部分文字列) | 1 | **2** | 2 | 2 | 2 | 2 | 2 |
| SEAM / BUFF / N1 / N2 / N4〜N11(index の行) | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

  ⇒ 腐らせたのは **#35 項目2 `97f350d`(2026-08-29)**。引き出し `#pmDrawer` に同じ行を足した(`tavern.html:7560` / `:8745`)。#68 は 13 個の注入点をどれも動かしていない。
- **切り分け 2 = 実走**:`git show 98419b0:index.html` / `98419b0:tavern.html` を scratchpad の `root98419b0\` へ書き出し、同じドライバ(`tools/` は `98419b0..HEAD` で差分なし)を `--negative` で向けた ⇒ **同じ exit 1・同じ文面**。
- ⛔ 直していない:#68 由来ではない(「#68 由来と確定した本だけを直す」)。しかもこのドライバは `allyLightningBolt` をスタブに差し替えるので、N3 を直しても #68 の挙動はこの変異群の射程外。⇒ 別チケット候補として申し送る。

#### (d) 言い直し

- 言い直した本は **0 本**。assert 数は前後で同じ:
  - `driver_field_step7` 79
  - `driver_action_priority` 92
  - `verify_aoe_coverage` 28 + 変異 10 本
  - `verify_cone_cast` 19 + 変異 14 本(41 判定)
- `verify_aoe_coverage` の m8 は、項目2 の実測どおり生きている(アンカー 1 箇所、注入すると (1c)(6b) が赤)。§2-6 の ② に当たらないので触らない。

#### (e) 崩れた主張

| # | 主張 | 実測 |
|---|---|---|
| 1 | 指示「`driver_action_priority --negative` は基準に無い。赤なら #68 のせいか切り分ける」 | 赤(exit 1)だが **#68 より前から**。`97f350d`(#35)以来、事前検査で止まって変異 11 本がどれも走っていない = **#19 の N1〜N6 と #34 の N7〜N11 は 2026-08-29 から誰にも測られていない**。項目1 の名簿に `--negative` 腕が無かったので、これまで見えていなかった |
| 2 | 指示「語 `flavor` は 36 本ヒット」 | コメントを落とすと **32 本**。`MAGE_SKILLS` / 酒場の呪文 UI の flavor を読む本は 0 |
| 3 | §2-6「`driver_field_step7` は変更不要。記録の line は旧仕様を測り続ける」 | **当たり**(`(P2)` line 68.0% は同じ値)。⚠ ただし Part R は魔法使いに LB を装備させて 240 秒実プレイするのに、観測されたキーは基準・今回とも **1 件(箱型)だけ**で、LB は一度も記録されていない = この本は #68 の実挙動を実質測っていない(`(R2)` は「キー 1 件以上」しか見ない) |
| 4 | 項目2「アンカー表(12 字以上)で変化 3 件、どれもアンカーではない」 | 当たり。11 字以下と正規表現まで広げると変化は 392 行出るが、#68 の本文を数える assert は 0 |

⭐ 当たったもの:LISTEN は着手前も後も lghub の 9010 / 9180 だけ。段1 の 4 本が腐りうる本の全部(4 経路の union が増えなかった)。

#### (f) 項目4/5 へ

- ⭐ 項目5:`driver_action_priority --negative` を名簿に足すなら、**着手前(`98419b0`)から exit 1(事前検査)** の「非緑のまま」として数える。⛔ 緑→赤に数えない。
- ⭐ 項目4:`verify_bolt_aim` の変異の注入点を「ファイル全体の部分文字列」で数えると、同じ行が別の関数に写された日に N3 と同じ死に方をする(#35 は酒場 UI の行を 1 行写しただけで #19/#34 の変異 11 本を止めた)。⇒ **行単位 + 関数本体の範囲で数える**ほうが腐りにくい。
- ⚠ `driver_field_step7` は実測 JSON を別セッションの scratchpad(`d59476b7-…\scratchpad\field_step7_metrics.json`)へ書く。着手前からの既定値で、基準の走行も同じ。
- 生ログ・スクリプト = `C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\b0fa1865-6afd-4eba-a0b1-818df2247585\scratchpad\item3\`
  - 走査:`sweep68_i3.py` / `fp68_i3.py`(項目1 の写しで、出力先だけ変えた)/ `runlist_i3.txt` / `progress_i3a.txt` / `result_i3a.FINAL.tsv` / `result_i3.FINAL.tsv`(+ 項目2 の 4 本)
  - 比較:`compare68_base68b_vs_i3.txt` / `summary68_i3.tsv` / `fp68_ids_i3.tsv` / `fp68_lines_i3.tsv` / `diff_field_step7.txt`
  - 生ログ:`logs\i3a\*.log` / `logs\i3b\driver_action_priority_negative_98419b0.log`
  - 引き方:`scan68_item3.py` → `scan68_item3.txt` / `lit_scan_i3.py` → `lit_scan_i3.txt` / `lit_scan_i3_filtered.txt`
  - 切り分け:`ap_neg_anchors_i3.py` → `ap_neg_anchors_i3.txt` / `root98419b0\`

### 12-3. 受入 verify_bolt_aim(項目4)

- **測定日**: 2026-09-17(実装窓 `b0fa1865`・dev-loop 項目4)/ HEAD = `e42b7ea`(項目3)・着手時の作業ツリー clean。⛔ push していない。
- 触ったのは **新規 `tools/verify_bolt_aim.js` と本書だけ**。⛔ 本番(`index.html` / `tavern.html` / `audio.js` / `js/*`)と既存 tools は 0 バイト、本番に計測シームも足していない。
- **結論 = ✅ 完了**(ユーザー決定 2 回を経て。詳細は (g))。
  - 最終形の素の完走 **C / D が 2 回とも `23/23 PASSED   FAILED 0   PENDING 0`**(exit 0)、`--negative` 10/10。
  - 経緯 1 度目(各 3 回): (0c)(2a) の cast 合計・(2c) の母集団の閾値が立たず blocked ⇒ ユーザー決定 1(**(0c) 合算化・LB×8 各 5 回・(2c) 記録化**)。
  - 経緯 2 度目(各 5 回・完走 A / B): (2a) の合算の率が 68.4% / 67.9% で blocked。
    原因は、試行の 7 割強が廃坑に寄って率が廃坑(56〜58%)へ引き寄せられたこと。本体は再計算器と 100% 一致。
    ⇒ ユーザー決定 2 = **案 E**(率と差を**マップごとの率の単純平均**で測る)。
  - ⛔ 閾値の値(70% / 30pt / cast ≥ 20)はどの段でも変えていない。変えたのは (0c) の各走行の下限(5 → 1・承認済み)と、率の重み付け(案 E)。
  - 合成盤面(§0 / §1 / §3 / §4a / §5)は全走行で全 PASS、`--negative` は 10/10 を 4 回。
- LISTEN(8000〜11000): 着手前 13:23 = `127.0.0.1:9010` / `127.0.0.1:9180` の 2 件 → 後始末後 14:44 / 17:26 / 21:37 / 22:54 も**同じ 2 件**。chrome 0 本。

#### (a) 作ったもの

| 起動 | 何をするか | 所要 |
|---|---|---|
| `node tools/verify_bolt_aim.js` | 素 = (0e) + 合成盤面 + 実プレイ **24 走行**(LB×8 各マップ 5 回 × 素と撤退 + 混成 各 2 回。直列) | 最終形 **2232.5 / 2232.7 秒**(決定前の 16 走行版は 1493.0 / 1491.8 秒) |
| `--no-play` | 合成盤面だけ(実プレイの 5 節は PENDING。(2c) は記録なので数えない) | 8.0 秒 |
| `--negative [--only k,..]` | 素の合成盤面(基準)→ 変異 10 本を 1 本ずつ(合成盤面だけ) | 82.7 / 82.8 秒 |
| `--mutate <k>` / `--dump <path>` | 変異を手で 1 本 / 実プレイの試行ごとの盤面の写しを JSON で書き出す | — |

- ポート = 素 **10301** / 変異 **10302〜10311**。10301〜10312 は goto で `ERR_UNSAFE_PORT` が出ないことを先に実測した(`port_check.log` 全 200)。
- 計測はすべてドライバ側の注入:
  - 合成盤面 = `page.evaluate` で据え付ける(`verify_aoe_coverage` の作法 + 項目2 の罠 = `allyBasicAttack` / `allyAdvanceTowardPoint` を即解決・goblin-mine は術者から x −2..13 / y −2..3 を掘る)。
  - 実プレイ = `evaluateOnNewDocument` の DOMContentLoaded で `window.allyLightningBolt` を包む。試行ごとに盤面の生データを `exposeFunction` で Node へ送る(遷移しても漏れない)。
    送るのは、術者と生存敵のタイル / `encounterEnemyIndices` / `isTileWall` の 23×23 の写し / 味方のタイル / 宣言射程 / 実物の成否(`__aoeStats` の増分)。
- 再計算器 `oracleBolt` は**本番のヘルパーを 1 つも呼ばない**(直線・視線は Node 側の Bresenham)。撤退の仕様は Bresenham を使わず「単位ベクトル × 1,2,3・壁を見ない」で書いた。
- 変異の注入点は**行単位 + 属する範囲**(関数本体 / `const` 文 / 配列リテラル)で「ちょうど 1 行」を起動時に数える(項目3 の N3 の教訓)。10 本とも範囲内 1 行・ファイル全体でも 1 行。
- 後始末 = 内蔵サーバ(`closeAllConnections()` → `close()`)とこのブラウザ・プロファイルだけ。

#### (b) assert と素の結果(⚠ 決定前の版の完走 2 回 = diag1 / run2。最終形の C / D は (g-5))

| id | 中身 | diag1 | run2 |
|---|---|---|---|
| (0e) | 変異 10 本の注入点が範囲内でちょうど 1 行 | OK | OK |
| (0a) | 配信 `index.html` の `get("boltaim")` = 1・`async function allyLightningBolt(` = 1・関数として読める | OK | OK |
| (0b) | 合成盤面で呼ぶと `__aoeStats["ライトニングボルト"].attempts` 0 → 1 | OK | OK |
| (0f) | 盤面に歩けないマスが 0・4 腕で原点が同じ(goblin-mine は (25,14) の周りを掘る) | OK | OK |
| (1a) | 敵 (4,1) → 素 cast 1 / 撤退 demoted 1 | OK | OK |
| (1b) | 敵 (7,0) → 素 cast 1 / 撤退 demoted 1 | OK | OK |
| (1c) | 敵 (11,0) → 素 demoted 1 | OK | OK |
| **(1c2)** | A (5,0) / C (7,1) / B (11,1) → 素 cast 1・被弾は A だけ | OK | OK |
| (1d) | 壁 (3,0) + 敵 (5,0) → 素 demoted 1 | OK | OK |
| **(1d2)** | A (2,0) / 壁 (4,0) / B (6,0) → 素 cast 1・被弾は A だけ | OK | OK |
| (1e) | 敵 (3,0) + (8,0) → 素 cast 1・2 体とも HP 減 | OK | OK |
| (1f) | 素の盤面 **10 枚**で成否 + 被弾集合 == 再計算器 | OK | OK |
| (1g) | 味方が唯一の直線の途中(横 (3,0) / 斜め (2,1))→ 素 cast 1 / `?aoecover=0` demoted 1 | OK | OK |
| (1h) | `spawnLightningBolt` の終点 == 列の最後のマスの中心(横 7 → (35,14) / 斜め (4,1) → (35,16) / 壁 (6,0) の手前 → (30,14)) | OK | OK |
| (3a) | index と tavern の flavor がどちらも「10」を含み「3 タイル」を含まない | OK | OK |
| (4a) | `?boltaim=0` で BOLT_AIM_ON=false・(1a)(1b) demoted・旧挙動で撃てる (3,0)/(2,2) は cast(被弾 = 旧仕様の再計算 / 終点 = 術者の中心 + 3 マス) | OK | OK |
| (5a) | `?dndrange=0`(L=5)で 6 マス demoted 1・4 マス cast 1 | OK | OK |
| (0g) | 合成盤面の 5 ページでページエラー / console.error 0 | OK | OK |
| **(0c)** | LB×8 の素の**各走行**で equipped に LB・attempts ≥ 5 | **NG**(4,4,8,4,4,3) | **NG**(8,7,4,2,1,2) |
| (0d) | 撤退の腕で旧仕様の再計算と全件一致(≥ 10) | OK 26/26 | OK 49/49 |
| **(2a)** | 素 ≥ 70% かつ 素 ≥ 撤退 + 30pt かつ 素の cast ≥ 20 | OK 21/27=77.8% vs 38.5% | **NG** 18/24=75.0% vs 16.3%(cast **18** < 20) |
| (2b) | 素の全試行(LB×8 + 混成)で新仕様の再計算と一致 ≥ 95%(≥ 20) | OK 42/42 | OK 36/36 |
| **(2c)** | 混成・廃坑と森・各 2 回で CC attempts 合計 ≥ 1 | OK 4 | **NG 0** |
| (4b) | 撤退の実プレイで BOLT_AIM_ON=false・旧仕様と全件一致・新仕様と 1 件以上食い違う | OK(食い違い 10) | OK(食い違い 33) |

- 集計行: diag1 = `23/24 PASSED   FAILED 1   PENDING 0`(exit 1)/ run2 = `21/24 PASSED   FAILED 3   PENDING 0`(exit 1)。
- 合成盤面の 18 本は、中断 run・diag1・run2・`--no-play` 2 回・`--negative` の基準 2 回(17 本)の**全 7 回で全 PASS**。

#### (c) 実プレイの表(LB の attempts(cast)。Lv5 の 4 人 PT・`?autoplay=30&diag=1`・90 秒)

| マップ | 装備 | 腕 | 中断 run(5 走行で打ち切り) | diag1 | run2 |
|---|---|---|---|---|---|
| 廃坑 | LB×8 | 素 | 9(4) 6(2) 3(1) = 7/18 **38.9%** | 4(2) 4(2) 8(6) = 10/16 **62.5%** | 8(5) 7(6) 4(2) = 13/19 **68.4%** |
| 廃坑 | LB×8 | 撤退 | 14(2) 6(0) = 2/20 10.0% | 2(1) 9(4) 6(2) = 7/17 41.2% | 9(4) 14(2) 13(1) = 7/36 19.4% |
| 森 | LB×8 | 素 | — | 4(4) 4(4) 3(3) = 11/11 **100%** | 2(2) 1(1) 2(2) = 5/5 **100%** |
| 森 | LB×8 | 撤退 | — | 3(1) 3(1) 3(1) = 3/9 33.3% | 7(1) 3(0) 3(0) = 1/13 7.7% |
| 廃坑 | 混成 | 素 | — | LB 5(2) 5(3) / **CC 3・1** | LB 4(2) 2(1) / CC 0・0 |
| 森 | 混成 | 素 | — | LB 2(2) 3(3) / CC 0・0 | LB 4(4) 2(2) / CC 0・0 |

- 素の不発の内訳(ドライバの分類): diag1 = 視線 10 + 交戦中の敵が L の外 1 / run2 = 視線 9。**「交戦外の敵なら届いた」は 0 件**、術者や敵が壁のマスに立っていた例も 0 件。
  - 視線の不発は**廃坑だけ**。坑道の入口 (39,10) から、角の向こう (+1,−3) の敵へ引いた Bresenham が角の壁 (+1,−2) に当たる形が、3 回とも同じ場所で出る(`los_cases.js` で盤面を描いて確認)。
  - ⇒ 本番の `hasLineOfSight`(遠隔攻撃と同じ定義)どおりで、§5-3「視線が通る敵だけ」の仕様そのもの。
- 中断 run の 5 走行でも一致は 素 19/19・撤退 20/20。⚠ 中断 run の廃坑 素 #2 は包みの記録 7 に対して `__aoeStats` の読みが 6 だった(ポーリングの取りこぼし)。⇒ 終了直前にもう 1 回読むよう直してから diag1 / run2 を走らせた。

#### (d) 負のコントロール 10 本(`--negative` 2 回とも同じ集合・起動確認 10/10 OK)

| 変異 | 注入点 | 担当 | 実際に赤くなった |
|---|---|---|---|
| `reach3` | `index.html:28680` | (1b)(5a) | (1a)(1b)(1c2)(1e)(1f)(1g)(1h)(5a) |
| `rays8` | `:28681` | (1a) | (1a)(1f)(1g)(1h) |
| `nowall` | `:28688` | **(1d2)** | (1d2)(1f)(1h) —— ⚠ (1d) は緑 |
| `dmgray` | `:28708` | (1e)(1f) | (1c2)(1e)(1f) |
| `norange` | `:28641`(`boltAimRays`) | **(1c2)** | (1c2)(1f) —— ⚠ (1c) は緑 |
| `hardcode10` | `:28680` | (5a) | (5a) |
| `vetogone` | `:28692` | (1g) | (1g) |
| `switchdead` | `:28451` | (4a) | (0a)(1a)(1b)(4a) |
| `endstale` | `:28727` | (1h) | (1h) |
| `flavor3` | `tavern.html:4429` | (3a) | (3a) |

- 集計行: `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)`(exit 0)。
- 起動確認 = 4 腕 + tavern が起動し (0b) が OK。⚠ (0a) は `switchdead` で巻き添えの赤(判定の行そのものを消す)なので起動確認に使わず、ログにだけ出す。

#### (e) 依頼書 §8 から変えた点(⭐ どれも期待値を弱めていない = 条件を足す / 測定点を移す)

| 点 | 理由 |
|---|---|
| **(1c2) 新設**、`norange` の担当を (1c) → (1c2) | (1c) の 1 体盤面は、列の歩きが L で打ち切るので距離上限を外しても赤くならない(実走で (1c) 緑を確認)。敵 2 体で検出できる配置は 0 件(項目2)。(1c) は素の性質として残した |
| **(1d2) 新設**、`nowall` の担当を (1d) → (1d2) | (1d) の 1 体盤面は、壁の向こうの敵が視線で候補から落ちるので赤くならない(実走で (1d) 緑を確認)。(1d) は残した |
| (1f) を 1 盤面 → **10 盤面** | 被弾集合の 2 経路を §1 の全盤面へ広げた |
| (1g) に斜め、(1h) に斜め・壁の手前を追加 | 横の 1 盤面だけでは向きの丸めの欠陥を見落とす |
| (4a) に「旧挙動で撃てる盤面 (3,0)/(2,2) で cast・被弾集合・旧式の終点」を追加 | (1a)(1b) が demoted に戻るだけでは「撤退の腕は何も撃たない」でも緑になる |
| (4b) に「新仕様の再計算と 1 件以上食い違う」を追加 | (0d) と同じ一致だけだと、撤退の腕が黙って新挙動のままでも捕まえられない(両腕へ等しく効く型の防止) |
| (0e)(0f)(0g) 新設 | 変異アンカーの起動時検算 / 盤面の掘削結果 / ページエラー 0 |
| (2b) の母集団に混成の素の試行も入れた | 「素の腕の全試行」の文言どおり(LB×8 だけより 15 件多い) |

#### (f) 崩れた主張

| # | 主張 | 実測 |
|---|---|---|
| 1 | §8 (0c)「90 秒で attempts ≥ 5(素の各走行)」 | **完走 2 回とも赤**。森の素は **1〜4 回**、廃坑も 4 回が出る(12 走行中 8 走行が 5 未満)。起草時の 15 回と項目2 の 7 / 5 回は廃坑だけの数字 |
| 2 | §8 (2a)「素の cast 合計 ≥ 20」 | **21 / 18**。率(≥ 70%)と差(≥ 30pt)は 2 回とも余裕で立つが、絶対量が閾値をまたぐ。⭐ 素で撃てるようになると戦闘が早く終わり、試行が減る場合がある(LB×8 の試行 run2 = 素 24 / 撤退 49、diag1 = 27 / 26) |
| 3 | §8 (2c)「混成・各 2 回で CC attempts ≥ 1」 | **4 / 0**。CC が出たのは diag1 の廃坑の 2 走行だけ。混成の LB 枠 2 を撃ち切ったあとも戦闘が続くかで決まる = 90 秒の中で安定しない |
| 4 | §2-4「上限 98%・視線と交戦中の絞りで下がる ⇒ 70%」 | 合算では 75.0〜77.8% で立つ。ただし**マップで二極化**: 森 100%(16/16)/ 廃坑 38.9〜68.4%。廃坑の不発は全部、坑道の角での視線(本番の `hasLineOfSight` どおり)。交戦中の絞りで落ちた試行は 0 件 |
| 5 | 項目2 の煙試験「素 71% / 80%」 | 廃坑 1 走行ずつの値。廃坑の走行別は **33〜86%** とばらつく |
| 6 | 項目2「nowall は (1d)・norange は (1c) を赤くしない」 | **当たり**(変異を実際に入れて確認)。(1d2)(1c2) だけが赤くなる |
| 7 | 指示「各変異の走行で (0a)(0b) を起動確認に使う」 | (0a) は `switchdead` で巻き添えの赤になる ⇒ 起動確認はページ起動 + (0b) で判定し、(0a) はログにだけ出した |

⭐ 当たったもの:
- 項目2 の注入点 9 本(+ `flavor3`)は、行単位 + 範囲でどれもちょうど 1。
- 合成盤面の罠(不発のハング / goblin-mine の掘削)。
- (1h) の終点 3 件の座標。
- 本番を触っていないので既存の番人は基準どおり:
  - `verify_aoe_coverage` = `28/28 PASSED   FAILED 0   PENDING 0`
  - 同 `--negative` = `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)`(m8 = (1c),(6b))
  - `verify_cone_cast` = `19/19 PASSED   FAILED 0   **PENDING** 0`

#### (g) ユーザー決定(1 回目・決定 E)と、その後の実測

##### (g-1) 1 度目の blocked で出した選択肢(記録)

| 案 | 中身 |
|---|---|
| A | 1 走行を 90 秒 → 180 秒へ延ばす |
| B | 回数を増やす |
| C | (0c) を「各走行 attempts ≥ 1 かつ 素の attempts 合計 ≥ 20」へ移す |
| D | (2c) を合否から外して記録だけにする |

##### (g-2) ユーザー決定(2026-09-17・orchestrator 経由)

1. **(0c)** を「素の各走行で attempts ≥ 1、かつ素の全走行の attempts 合計 ≥ 20」へ移す(各走行の下限 5 → 1 は承認済み)。
2. **LB×8 単独は各マップ 5 回**(廃坑 5 + 森 5)× 素と撤退。(2a) の閾値 3 本(素の率 ≥ 70% / 素 ≥ 撤退 + 30pt / 素の cast 合計 ≥ 20)は**そのまま**。
3. **(2c)** は assert から外して**記録だけ**。混成は各マップ 2 回のまま。

ドライバへの反映:
- `LB_REPS = 5` / `POP_MIN_TOTAL = 20`。
- (0c) は各走行 ≥ 1 + 合計 ≥ 20。
- (2c) は `[record] (2c) …` 行だけにした(PASS/FAIL を出さない)。総括の分母から外れたことを確かめた: `--no-play` の集計が `18/24 PENDING 6` → **`18/23 PENDING 5`**。
- 実プレイは 24 走行、所要 **2238.8 / 2237.9 秒**。
- 依頼書 §8 の該当 3 行に注記を足した(元の文は残した)。

##### (g-3) 決定 1 の後の完走 2 回(A / B)— ⛔ 合算の率で (2a) が 2 回とも赤 → 2 度目の blocked

| id | A | B |
|---|---|---|
| (0e)(0a)(0b)(0f)(1a)〜(1h)(3a)(4a)(5a)(0g) = 合成 18 本 | 全 OK | 全 OK |
| **(0c)** 各走行 ≥ 1・合計 ≥ 20 | OK 合計 **57**(廃坑 9,9,8,10,5 / 森 3,2,4,5,2) | OK 合計 **56**(廃坑 7,9,5,10,12 / 森 4,1,4,2,2) |
| (0d) 旧仕様の再計算と全件一致 | OK **81/81** | OK **67/67** |
| **(2a)** 素 ≥ 70% / 素 ≥ 撤退 + 30pt / 素の cast ≥ 20 | **NG** 素 39/57 = **68.4%** / 撤退 8/81 = 9.9% / 差 +58.5pt / cast 39 | **NG** 素 38/56 = **67.9%** / 撤退 9/67 = 13.4% / 差 +54.4pt / cast 38 |
| (2b) 新仕様の再計算と一致 ≥ 95% | OK **71/71** | OK **70/70** |
| (4b) 撤退で BOLT_AIM_ON=false・旧仕様と全件一致・新仕様と食い違い ≥ 1 | OK(食い違い 56) | OK(食い違い 46) |
| 集計行 | `22/23 PASSED   FAILED 1   PENDING 0`(exit 1) | `22/23 PASSED   FAILED 1   PENDING 0`(exit 1) |

**(2c) の記録**(assert ではない):

| 走行 | CC attempts(cast) | LB attempts(cast) |
|---|---|---|
| A 廃坑 #1 / #2 | 0 / **3(1)** | 4(3) / 6(4) |
| A 森 #1 / #2 | 0 / 0 | 3(3) / 1(1) |
| B 廃坑 #1 / #2 | **1(0)** / **2(1)** | 6(4) / 4(2) |
| B 森 #1 / #2 | 0 / 0 | 2(2) / 2(2) |

- 合計は A = 3(0 の走行 3/4)/ B = 3(0 の走行 2/4)。決定前の diag1 = 4(0 の走行 2/4)/ run2 = 0(4/4)。
- ⚠⚠ **CC attempts 0 の走行が 8 走行中 5 走行**(A 3 + B 2)。森の 4 走行はすべて 0。
- ⇒ **「不発で枠を減らさず梯子に居座る実害が一部残っている」観測**。依頼書 §11 の別チケット候補「不発時に次の呪文へ回す」の根拠になる。
- ⚠ ただし森では LB の不発が 0 件(LB 2 枠をすべて撃てている)。森の CC 0 は居座りではなく、梯子の順(LB が CC より先)と 90 秒の戦闘の長さで出番が回らなかったもの。居座りが実際に効いているのは廃坑(LB の不発 4 件)。

**(2a) が赤い理由 — フレークではなく、回数を増やしたことによる母集団の偏り**(2 回とも同じ原因・同じ水準):

| 標本 | 合算の素 | 廃坑の素 | 森の素 | マップ平均 | 射程外を分母から除く |
|---|---|---|---|---|---|
| diag1(各 3 回) | 21/27 = 77.8% | 10/16 = 62.5% | 11/11 = 100% | 81.3% | 21/27 = 77.8% |
| run2(各 3 回) | 18/24 = 75.0% | 13/19 = 68.4% | 5/5 = 100% | 84.2% | 18/24 = 75.0% |
| **A(各 5 回)** | 39/57 = **68.4%** | 23/41 = 56.1% | 16/16 = 100% | 78.0% | 39/51 = 76.5% |
| **B(各 5 回)** | 38/56 = **67.9%** | 25/43 = 58.1% | 13/13 = 100% | 79.1% | 38/51 = 74.5% |

- 廃坑の素を全標本(中断 run を含む)で合算すると **78/137 = 56.9%**、森の素は **45/45 = 100%**。
- 1 走行あたりの試行は廃坑 ≈ 8・森 ≈ 3。⇒ 各 5 回の合算の期待値は約 68〜69% で、**70% をわずかに下回るのが正常**。
- 各 3 回で 75〜78% だったのは、廃坑の試行が少なかった回に当たっただけ。
- **素の不発の中身**(A 21 件 / B 22 件。`why_final.js` で 1 件ずつ): **全部廃坑**。
  - 視線 12 / 13 件: 坑道入口 (39,10) → 角の向こう (+1,−3) が A・B とも 5 回ずつ。ほかに (39,7) → (+5,+1) など。
  - 交戦中の敵が全員 L の外 6 / 5 件: (21,11) → (+11,−1) = チェビシェフ **11** が A 5 / B 4 回。梯子が射程 10 の外の標的へ LB を選んでいる。
  - 敵が術者と同じマス(B の (40,7) で 2 件): §5-3 の `dx === 0 && dy === 0` を除外する仕様どおり。
    ⚠ ドライバの分類は当初これを「視線」に数えていた ⇒ `sameTile` として分けるよう直した(記録用のみ・合否には関係しない)。
  - 「交戦外の敵なら届いた」は 0 件。
  - ⇒ どれも §5-3 の仕様と本番の `hasLineOfSight` / 宣言射程どおり。再計算器とも 100% 一致している。
- `--negative`(決定反映後): `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)`(82.7 秒 / exit 0)。

2 度目の blocked で出した選択肢(記録):

| 案 | 中身 | A / B での値 |
|---|---|---|
| **E ← 採用** | 率を「マップごとの素の率の平均 ≥ 70%」で測る(廃坑と森を同じ重みに) | 78.0% / 79.1% |
| F | 「交戦中の敵が全員 L の外」の試行を分母から除く | 76.5% / 74.5% |
| G | 閾値を 70% → 60% へ下げる(合算のまま) | 68.4% / 67.9% |
| H | 回数を各 3 回へ戻す(決定の撤回) | 77.8% / 75.0%(決定前) |

##### (g-4) ユーザー決定 E(2026-09-17・orchestrator 経由)

- (2a) の率は**マップごとの素の率(cast/attempts)の単純平均 ≥ 70%** で測る。
- 撤退との差も重み付けをそろえて、**マップ平均(素)− マップ平均(撤退)≥ 30pt**。
- **素の cast 合計 ≥ 20**(絶対量)は据え置き。
- LB×8 各 5 回・(0c) の合算化・(2c) の記録化もそのまま。
- 合算の率(pooled)とマップ別の率は判定に使わず、`[record] (2a) …` 行に必ず出す(廃坑の 57% 前後が森の 100% に隠れないように)。
- ドライバへの反映:
  - `perMap` でマップごとの素・撤退の率を出し、単純平均で判定する。
  - **全マップで素と撤退が各 5 走行・attempts ≥ 1 そろわなければ、平均せず FAIL**(detail に `⛔ 平均の母数がそろっていない`)。
    この FAIL の経路は、走行時間を 8 秒・各 1 回に縮めた scratchpad の写し `smoke_logic_copy.js`(port 10321)で実際に踏んで確かめた(attempts 0 ⇒ (2a) NG)。
  - 依頼書 §8 の (2a) 行へ 2 本目の注記を足した。

##### (g-5) 決定 E の後の完走 2 回(C / D)— ✅ 2 回とも全 PASS

| 項目 | C | D |
|---|---|---|
| 集計行 | **`23/23 PASSED   FAILED 0   PENDING 0`**(exit 0 / 2232.5 秒) | **`23/23 PASSED   FAILED 0   PENDING 0`**(exit 0 / 2232.7 秒) |
| 合成 18 本 | 全 OK | 全 OK |
| (0c) 各走行 ≥ 1・合計 ≥ 20 | OK 合計 **59**(廃坑 6,9,9,6,11 / 森 4,4,3,2,5) | OK 合計 **61**(廃坑 9,9,7,8,8 / 森 5,4,4,3,4) |
| (2a) 廃坑 素 / 撤退 | 25/41 = **61.0%** / 8/52 = 15.4% | 28/41 = **68.3%** / 12/48 = 25.0% |
| (2a) 森 素 / 撤退 | 18/18 = **100%** / 1/22 = 4.5% | 20/20 = **100%** / 2/21 = 9.5% |
| (2a) **マップ平均** 素 / 撤退 | **80.5%** / 10.0% | **84.1%** / 17.3% |
| (2a) **差**(マップ平均) | **+70.5pt** | **+66.9pt** |
| (2a) 素の cast 合計 | **43** | **48** |
| [record] 合算 pooled 素 / 撤退 / 差 | 43/59 = 72.9% / 9/74 = 12.2% / +60.7pt | 48/61 = 78.7% / 14/69 = 20.3% / +58.4pt |
| (2a) 素の不発の内訳 | 視線 10 / 交戦中の敵が L の外 6 | 視線 9 / L の外 4 |
| (0d) 旧仕様の再計算と全件一致 | OK **74/74** | OK **69/69** |
| (2b) 新仕様の再計算と一致 | OK **75/75 = 100%** | OK **76/76 = 100%** |
| (4b) 撤退で BOLT_AIM_ON=false・旧仕様と一致・新仕様と食い違い | OK(74/74・74/74・48) | OK(69/69・69/69・44) |
| [record] (2c) CC attempts 合計 / 0 の走行 | **2** / 2/4(廃坑 1・0 / 森 0・1) | **2** / 2/4(廃坑 1・1 / 森 0・0) |

- ⚠ **(2c) の CC attempts 0 の走行は、決定後の 4 回の完走(A / B / C / D)で 16 走行中 9 走行**。
  「不発で枠を減らさず梯子に居座る実害が一部残っている」観測として記録する(依頼書 §11 の別チケット候補「不発時に次の呪文へ回す」の根拠)。
  - 居座りが実際に効くのは LB の不発が出る廃坑(D の廃坑 #1 は LB 3/5・#2 は 2/4 で、CC は各 1 回選ばれて 0 cast)。
  - 森の CC 0 は LB の不発が 0 件なので居座りではなく、梯子の順と 90 秒の長さによる。
- ⚠ **廃坑の素の率は単独では 56〜68%**(A 56.1 / B 58.1 / C 61.0 / D 68.3%)。案 E の平均は森の 100% と並べた値で、廃坑の低さは `[record] (2a)` 行と上の表で見えるようにしてある。
- `--negative`(決定 E の反映後): `--negative OK: 10 本すべて担当ラベルが赤くなりました (空振り 0)`(82.6 秒 / exit 0 / 担当と赤の集合は前回と同じ)。

##### (g-6) 判断材料(ドライバには入れない)— 壁で反射する直線の試算

orchestrator が決定前の完走 A / B のダンプ(`dump_final_A.json` / `dump_final_B.json`)から出した試算:
- 廃坑の素の不発 **43 件**の内訳は、視線 **29** / 射程外 **12** / 同じマス **2**。
- 壁で反射する直線にすると、**反射 1 回で救えるのは約 4 件**(視線 3 + 同じマス 1)。
- 反射なしでも、タイル中心ではなく**端を狙えば届くもの**が視線 29 件中 **20 件**(簡易計算で、角のすり抜けを含む上限)。
- 射程外の 12 件はどちらでも救えない。

⇒ これを受けてユーザーは「反射」を #68 に入れず、**別チケット候補**とした。
試算スクリプト = `C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\b0fa1865-6afd-4eba-a0b1-818df2247585\scratchpad\orch\bounce_sim.py`(⚠ 実装窓は数字を写しただけで再実行していない)。

- 生ログ・スクリプト = `C:\Users\PC_User\AppData\Local\Temp\claude\c--Users-PC-User-Desktop------------\b0fa1865-6afd-4eba-a0b1-818df2247585\scratchpad\item4\`
  - **最終形(決定 E 後)の素**: `run_E_C.log` / `run_E_D.log`。生データ: `dump_E_C.json` / `dump_E_D.json`。`--negative`: `run_neg_E.log`
  - 母数がそろわない経路の確認: `smoke_logic_copy.js` / `smoke_logic.log`。LISTEN の控え: `listen_before_E.txt`
  - 決定 1 後の素(A / B): `run_final_A.log` / `run_final_B.log`。生データ: `dump_final_A.json` / `dump_final_B.json`。`--negative`: `run_neg_final2.log`
  - 分析: `opts68.js`(E〜H の値)/ `why_final.js`(不発を 1 件ずつ)
  - 決定前の素: `run_diag1.log` / `run_full2.log`。中断 run = `run_full1.log`(5 走行で打ち切り。ポーリングの取りこぼしを直す前の版)
  - 決定前の生データ: `dump_diag1.json` / `dump_run2.json`
  - 変異: `dev_neg1.log` / `run_neg_final.log`。`--no-play`: `dev_noplay1.log`
  - 既存の番人: `aoe_cov.log` / `aoe_cov_neg.log` / `cone_cast.log`
  - 分析: `table68.js`(マップ × 腕の表)/ `los_cases.js`(不発の盤面を描く)/ `port_check.js` + `.log`
- ⚠ 中断 run は自分の node をツリーごと落とした。そのブラウザ・プロファイル `%TEMP%\df_verify_boltaim_gmFkAy` が 1 個残っている(削除コマンドはフックに止められた)。`_pptr_profile` の掃除が 6 時間後に回収する。ポートとプロセスは残っていない
