# #50 バーニングハンズが撃たれない — 円錐呪文の発射率を 5.6% → 実用域へ

- **起草**: 2026-09-04(計画窓) / **ステータス**: **承認済**(2026-09-04 ユーザー承認 — §1 の 2 択とも推奨案を採用)
- **触るファイル**: `index.html`(`allyBurningHands` / `allyConeOfCold` の探索部のみ)、
  `tools/verify_cone_cast.js`(新規)、`実装依頼書/README.md`(§11 の行)
- ⛔ **触らないファイル**: 無し。`git -c core.quotepath=false status --short` = **空**(2026-09-04 起草時)。
  別窓の並走は無い。それでも `git add .` は使わず**ファイル単位 add**すること。

---

## 1. 目的

ユーザー報告 =「魔法のバーニングハンズを、なかなか唱えてくれません」。

実測すると **「なかなか」ではなく、ほぼ一度も撃っていなかった**。廃坑を自動プレイで
合計 **7 分 20 秒**回した実測で、魔法使いがバーニングハンズを**選んだ手番は 54 回**、
そのうち**実際に発射できたのは 3 回(5.6%)**。残り 51 回は **例外もログも出ないまま
「通常攻撃(スリング)」へ降格**していた。呪文スロットは 1 発も減らない。

真因は 1 つではなく **3 段**ある(全部 §2 で実測):

| # | 原因 | 実測の寄与 |
|---|---|---|
| A | **味方の拒否権** — 円錐 9 マスに味方が 1 人でも立つと**その方向を丸ごと捨てる**。しかも本体のダメージ処理は敵しか拾わないので、**味方は元々 1 ダメージも受けない**(酒場の説明文も『PT 巻き込みなし』と明記済み) | これを外すだけで **5.6% → 65%** |
| B | **方向が 4 つしかない**(上下左右のみ)。斜めに敵が居ても撃てない | 単独では **5.6% → 10〜24%** |
| C | **宣言射程と実効射程が食い違う** — 呪文 def は `range: "medium"` = **8 マス**なのに、円錐は術者起点で **3 マス**しか伸びない。8 マス先の敵を対象に選んだ瞬間、円錐には何も入らない。しかも `allyBurningHands` には**射程チェックが 1 行も無い**(`allyFireball` は持っている) | 残り 35% はこれ |

**ユーザー決定(2026-09-04)**:

- **A = 「炎が味方を通ってよい」**。ただし**素通しにはしない** —
  「味方が入らない方向」を先に探し、**1 つも無いときだけ**味方入りの方向を許す 2 段構え。
  ⭐ 不採用案 = 「拒否権を維持して斜めだけ足す」(10〜24% 止まりで体感が変わらない) /
  「味方も焼く」(酒場の説明文『PT 巻き込みなし』と、範囲呪文 6 種すべての設計を崩す)。
- **C = 「詰め寄る」**。射程内かつ視線が通っていれば `allyAdvanceTowardPoint` で 1 マス寄って
  手番終了 → 次の手番で撃つ。⭐ 不採用案 = 「別の呪文へ回す」(バーニングハンズの出番が
  増えない) / 「今のまま通常攻撃へ降格」(報告された症状そのもの)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 呼び口の全数(リポジトリ全文 grep)

`grep -rn "allyBurningHands\|noteAoeOutcome\|burning-hands" --include=*.html --include=*.js .`

| ファイル:行 | 何 |
|---|---|
| `index.html:12469` | `scroll-burning-hands` の巻物定義(習得アイテム) |
| `index.html:18826` | `executeSkillOn` の mage 枝 → **リーダー(主人公)経路** |
| `index.html:21030-21036` | `MAGE_SKILLS["burning-hands"]` 定義 |
| `index.html:27207-27208` | ⭐ `allyBurningHands` 本体(**唯一の実装**) |
| `index.html:27253` | `noteAoeOutcome(skill.name, coneOk, "cone")` = 既存の観測シーム |
| `index.html:28382-28383` | `mageAI` の候補入り |
| `index.html:28400` | 梯子 `threatScore >= 20` |
| `index.html:28403` | `fallbackOrder` の 5 番目 |
| `index.html:28414` | `mageAI` からの実行 → **仲間 NPC 経路** |
| `tavern.html:3994` | 酒場の説明文(`flavor`) |
| `tavern.html:4636` | 巻物定義(酒場側) |

⭐ **実行経路は 2 本(リーダー 18826 / 仲間 28414)だが、実装は `allyBurningHands` 1 本**。
そこを直せば両方に効く。

`allyConeOfCold`(`index.html:27008`)は **探索ブロックが 1 文字違わぬ写し**
(`index.html:27017-27058` と `27212-27253` を突き合わせ済み)。同じ欠陥を持つ。

### 2-2. ⚠⚠⚠ 罠A — 「味方の拒否権」は誰も守っていない

`index.html:27242-27246`:

```js
for (const t of tiles) {
  if (partyInArea(t.tx, t.ty, 1, 1)) { safe = false; break; }   // ← 方向ごと丸ごと破棄
  cnt += enemiesInArea(t.tx, t.ty, 1, 1).length;
}
```

一方、実際にダメージを受け取るのは `index.html:27260-27263` の

```js
const coneEnemyIdxs = new Set();
for (const t of best.tiles) {
  for (const i of enemiesInArea(t.tx, t.ty, 1, 1)) coneEnemyIdxs.add(i);
}
```

**`enemiesInArea` は敵しか返さない。味方の HP を触る行は 1 行も無い。**
`tavern.html:3994` の説明文も `"前方円錐 3d6+INT 火炎 (DEX セーヴ半減)、PT 巻き込みなし"`。
⇒ **拒否権は「起きえない誤射」を防いでいる**。守っているのは見た目だけで、代償は発射率 0。

⭐ この罠を §8 の変異 `vetoback` として装置に内蔵させる。

### 2-3. ⚠⚠ 罠B — 「無言の降格」は既に設計者が予見して観測シームを残していた

`index.html:26697-26703` と `27249-27251` のコメント(**既存**):

> オートバトルなので降格は例外もログも出ない =「撃たない術者」としてしか現れない。
> だから下の観測シームを必ず残すこと。
> 円錐は術者起点で origin 自由度がゼロなので、箱型の窓拡張では**救済されない**(計画書 §6 の P2)。
> 降格が残ることを承知で出す代わりに、降格率だけは観測できるようにしておく。

⇒ **本チケットは「§6 P2 の再判断」そのもの**。数字が出たので判断する、が今回の仕事。
⭐ `window.__aoeStats` は**既定 `undefined` = no-op** の実在シーム。
**新しい計測シームを本番へ足す必要は無い**(CLAUDE.md の changelog ガードに引っかからない)。

### 2-4. ⚠⚠⚠ 罠C — 宣言射程 8 マス vs 実効射程 3 マス

`index.html:19018` `medium: { tiles: 8, ... }` / `index.html:21033` `range: "medium"`。
一方 `coneTiles` は `for (let step = 1; step <= 3; step++)` = **前方 3 マス**。

- `mageAI` は射程を一切見ずに `burning-hands` を選ぶ(`index.html:28400`)
- `allyBurningHands` にも射程チェックが**無い**
- 対して `allyFireball` は `index.html:26824-26827` で
  `if (tileChebyshev(...) > rangeTiles || !hasLineOfSight(...)) { await allyAdvanceTowardPoint(ally, ex, ey); return; }`
  を**持っている**

⇒ 採用する形は**既に本番にある `allyFireball` の写し**。新機構ゼロ。

### 2-5. 実測値(実プレイ 2 回・合計 7 分 20 秒・廃坑 goblin-mine)

計測は使い捨て装置 `probe_burning_hands.js`(scratchpad)で実施。本番コードは 1 バイトも
触っていない(`allyBurningHands` を**入口でラップ**して状態を鏡写しにし、そのまま本物へ委譲)。

編成 = 勇者(戦士・Lv3)/ ミラ(魔法使い・Lv3)/ グリム(ドワーフ)/ リタ(僧侶)。
魔法使いの配分 = `burning-hands ×4` + `magic-missile ×1`(装置の母集団ガードで確認済み)。

| 指標 | run1 (180s) | run2 (240s) | 合計 |
|---|---|---|---|
| バーニングハンズを**選んだ**手番 | 25 | 29 | **54** |
| 実際に**発射**できた | **0** | **3** | **3 = 5.6%** |
| 呪文スロット消費 | 0/4 | 2/4 | — |

**4 方向の落ち方(方向ごとの評価 = 54 標本 × 4 = 216 件)**

| 落ち方 | run1 | run2 |
|---|---|---|
| 味方の拒否権で破棄 | 32 | 28 |
| 敵が 1 体も入っていない | 68 | 85 |
| 通った | 0 | 3 |

**対案の反実仮想(同じ標本の上で、探索だけを差し替えて再評価)**

| 探索 | run1 | run2 | 合算 |
|---|---|---|---|
| **現行**(4 方向・拒否権あり) | 0/25 | 3/29 | **3/54 = 5.6%** |
| 斜めを足すだけ(8 方向・拒否権あり) | 6/25 | 5/29 | 11/54 = 20.4% |
| 拒否権だけ外す(4 方向) | 17/25 | 11/29 | 28/54 = 51.9% |
| **採用案 P3**(8 方向・清潔優先→味方入り許可) | 18/25 | 17/29 | **35/54 = 64.8%** |
| 1 マス寄ってから(4 方向・拒否権あり) | 1/25 | 4/29 | 5/54 = 9.3% |

**採用案 P3 が方向を選べたときの巻き込み人数**(run2・17 件中)

| 円錐内の味方 | 件数 |
|---|---|
| 0 人(清潔な方向が見つかった) | 5 |
| 1 人 | 10 |
| 2 人 | 2 |

⭐ **残りの 35% は「敵が 3 マスより遠い」**。対象までの距離の分布(run2・29 標本):

| 距離(マス) | 0 | 2 | 3 | 4 | 5 | 6 | 7 | 11 |
|---|---|---|---|---|---|---|---|---|
| 件数 | 4 | 3 | 4 | 4 | 3 | 8 | 1 | 2 |

⇒ **18/29 が距離 4 以上** = 円錐の外。これが原因 C。
決定 §1 の「詰め寄る」で、この 35% は**次の手番へ持ち越して撃つ**形になる。

**再測定コマンド**(装置は使い捨てなので、実装窓は §8 の新 driver で測ること):

```bash
node tools/verify_cone_cast.js
```

### 2-6. ⚠ `driver_field_step7.js` の (P) の数字は**本番を測っていない**

`tools/driver_field_step7.js:330-347` の `conePick` は **ドライバ側の再実装(鏡)**で、
本番の `allyBurningHands` を呼んでいない。(P1)/(P2) は「標本が採れたか」しか見ていない
(`tools/driver_field_step7.js:933-941`)ので、**本チケットの変更後も緑のまま**だが、
表示される cone の降格率は **旧アルゴリズムの値**になる。

⇒ ⛔ **`driver_field_step7.js` は「非退行 golden」として扱ってよいが、
その (P) の cone 行を「修正後の実測値」として引用してはいけない。**
実測値の正は §8 の新 driver。§12 にこの区別を書き残すこと。

### 2-7. 前例の有無 / 並走 / ポート

- `git -c core.quotepath=false status --short` → **空**(並走なし)
- ポートの空き: `tools/*.js` が使う番号を全部拾うと最大 **9880**(#49 が 9880 + 変異 9881-9896
  + 予備 9897 + 撤退 9898 を占有)。⭐ #47 の教訓どおり **base だけでなく `--negative` の
  レンジまで数えた**。⇒ 本チケットは **9940**(変異 9941-9958 / 予備 9959 / 撤退アーム 9960)。
- 撤退スイッチの読み方の前例 = `index.html:3667` / `4220`
  (`new URLSearchParams(window.location.search).get("<name>") !== "0"`)。
- ⚠ **バーニングハンズは初期習得ではない**(`index.html:12490` `DEFAULT_KNOWN.mage =
  ["magic-missile","fire-bolt","arcane-shield"]`)。NPC 魔法使いの既定配分
  (`index.html:32949 defaultCasterMap`)も `defaultSkills` だけ。
  ⇒ **既存ドライバは 1 本もバーニングハンズを撃っていない** = 本変更で動く既存 golden は原理的に無い。
  ⭐ 新 driver は **`knownSpells` + `partySkills` を遷移前に仕込む**こと(§8)。

### 2-8. changelog の要否

`grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py` →
`GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`(2026-09-04 実測)。

**`index.html` を触るので鳴る = changelog 必須。**
⭐ 書けるプレイヤー向けの要約は**実在する**(「魔法使いがバーニングハンズを撃つようになった」)
ので、CLAUDE.md の「嘘の要約をでっち上げない」条項には抵触しない。文面は §10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `allyBurningHands`(27208-)と `allyConeOfCold`(27008-)の**探索ブロックのみ**。共通ヘルパ 1 本へ寄せる |
| `tools/verify_cone_cast.js` | 新規。port 9940 / 変異 9941-9958 / 予備 9959 / 撤退アーム 9960 |
| `実装依頼書/README.md` | §11 の行を追加(着地後) |

⛔ **`tavern.html` は開かない**(説明文『PT 巻き込みなし』は変更後も正しいまま)。
⛔ **`mageAI` の梯子(`index.html:28394-28406`)は 1 行も触らない**。今回直すのは実行側だけ。
⛔ **`RANGE` テーブル(`index.html:19016-19025`)は触らない**。`medium` は他 6 か所が読んでいる。

---

## 4. STEP1 — 円錐探索を 1 本のヘルパーへ寄せる

`allyBurningHands` / `allyConeOfCold` に**同じコードが 2 部ある**ので、まず共通化する。
⚠ **この STEP では振る舞いを 1 ビットも変えない**(#49 の「恒等を先に作る」型)。

`index.html` の `noteAoeOutcome`(26802-)の直後あたりに新設:

```js
/* ── #50 円錐 AoE の方向探索 ────────────────────────────────────────────────
 * burning-hands / cone-of-cold が持っていた同一の探索ブロックを 1 本へ寄せたもの。
 * ⚠ 円錐は術者起点なので origin の自由度がゼロ = 箱型の pickAoeOrigin では救済されない
 *   (計画書 dev-meetings/2026-07-19 §6 の P2)。救済は「方向を増やす」「味方の拒否権を
 *   2 段にする」の 2 つだけで作る。
 * ⚠⚠⚠ 味方は **元々 1 ダメージも受けない** (下流の被害者列挙は enemiesInArea = 敵のみ。
 *   酒場の説明文も『PT 巻き込みなし』)。よって拒否権は誤射を防いでいるのではなく
 *   **絵面のためだけ**に発射率を 5.6% まで落としていた (依頼書 #50 §2-5 の実測)。
 *   → 清潔な方向を **先に** 探し、1 つも無いときだけ味方入りを許す 2 段構えにする。
 */
const CONE_REACH_TILES = 3;   // ⚠ coneTilesFrom の上限と STEP3 の距離判定が **この 1 本**を読む
const CONE_DIRS_4 = [
  { dx:  1, dy:  0 }, { dx: -1, dy:  0 }, { dx:  0, dy:  1 }, { dx:  0, dy: -1 },
];
// ★#50: 斜め 4 方向。⛔ 4 方向版を消さない (?conecast=0 の撤退で使う)
const CONE_DIRS_8 = CONE_DIRS_4.concat([
  { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
]);
/* ★#50 撤退スイッチ ?conecast=0 — 探索を 2026-09-04 以前(4 方向・拒否権が絶対)へ戻す。
 * ⚠ 判定はこの 1 箇所だけ。ページ内で完結する (?castanchor=0 / ?rolltarget=0 と同じ流儀。
 *   sessionStorage へは写さない = index.html は自分の search を読むだけでよい)。 */
const CONE_CAST_ON =
  new URLSearchParams(window.location.search).get("conecast") !== "0";

function coneTilesFrom(aTX, aTY, d) {
  const tiles = [];
  for (let step = 1; step <= CONE_REACH_TILES; step++) {
    const halfWidth = step;   // 1, 2, 3
    for (let lat = -halfWidth + 1; lat <= halfWidth - 1; lat++) {
      tiles.push({ tx: aTX + d.dx * step + (-d.dy) * lat,
                   ty: aTY + d.dy * step + (d.dx)  * lat });
    }
  }
  return tiles;
}

/* 返り = { d, tiles, count, partyInCone } / 撃てなければ null。
 * ⚠ 「敵 0 体の方向」は両パスとも採らない (呪文を空撃ちさせない)。 */
function pickConeDirection(aTX, aTY) {
  const dirs = CONE_CAST_ON ? CONE_DIRS_8 : CONE_DIRS_4;
  // pass 0 = 味方が 1 人も入らない方向だけ / pass 1 = 味方入りも許す (★#50)
  const passes = CONE_CAST_ON ? [0, 1] : [0];
  for (const pass of passes) {
    let best = null, bestCount = 0;
    for (const d of dirs) {
      const tiles = coneTilesFrom(aTX, aTY, d);
      let party = 0, cnt = 0, rejected = false;
      for (const t of tiles) {
        if (partyInArea(t.tx, t.ty, 1, 1)) {
          party++;
          if (pass === 0) { rejected = true; break; }   // 清潔パスは 1 人でも即棄却 (従来と同じ短絡)
        }
        cnt += enemiesInArea(t.tx, t.ty, 1, 1).length;
      }
      if (rejected) continue;
      if (cnt <= 0) continue;
      if (cnt > bestCount) { best = { d, tiles, count: cnt, partyInCone: party }; bestCount = cnt; }
    }
    if (best) return best;
  }
  return null;
}
```

⚠⚠ **`pass === 0` の棄却は `break` で打ち切る**(従来と同じ短絡)。
`cnt` の集計を最後までやると、**清潔パスと味方入りパスで `cnt` の値がずれる**
(従来コードは `break` した時点で `cnt` が中途半端な値のまま捨てていた)。
⭐ ここは「最良方向の選び方」に直結するので、**変異 `nobreak` で機械的に守る**(§8)。

### STEP1 の受入(振る舞いを変えていないことの証明)

- `?conecast=0` を付けたアームで、**新ヘルパーの返り値が旧探索と 200 標本すべてで一致**すること
  (§8 (1a))。⭐ ここを先に緑にしてから STEP2 へ行く。

---

## 5. STEP2 — 2 つの呪文を新ヘルパーへ差し替える

`allyBurningHands`(`index.html:27218-27248`)の

```js
      // 4 方向の円錐 (前方 3 タイル分、横幅 1→3→5 タイル拡張)
      const directions = [ ... ];
      function coneTiles(d) { ... }
      let best = null, bestCount = 0;
      for (const d of directions) { ... }
```

を **丸ごと** 次へ置き換える(`allyConeOfCold` の `index.html:27017-27048` も同一の置換):

```js
      const best = pickConeDirection(aTX, aTY);
      const bestCount = best ? best.count : 0;
```

⛔ **`noteAoeOutcome(skill.name, coneOk, "cone")` の行は 1 文字も動かさない**
(既存の観測シーム。新 driver の母集団ガード (0c) がここを読む)。

⛔ **`ally.facing` の更新(`if (best.d.dx !== 0) ...`)はそのまま**。
斜め方向でも `dx !== 0` なので左右は正しく向く。上下方向は従来どおり向きを変えない。

⚠ **`best.tiles` を使う下流(`coneEnemyIdxs` の列挙 / `spawnGroundFx` のループ)は無改修**。
新ヘルパーが同じ形 `{ d, tiles }` を返すので、そのまま通る。

---

## 6. STEP3 — 届かないときは「詰め寄る」

`coneOk` が false のときの分岐(`index.html:27254-27258` / `27055-27059`)を、
**`allyFireball`(`index.html:26824-26827`)と同じ形**へ:

```js
      const coneOk = !!best && bestCount > 0;
      noteAoeOutcome(skill.name, coneOk, "cone");
      if (!coneOk) {
        /* ★#50 円錐が 1 方向も立たない。理由は 2 つに分かれる:
         *   (i) 敵が円錐の 3 マスより遠い → **詰め寄る** (allyFireball と同じ形)。
         *       ⚠ 呪文の宣言射程 medium は 8 マスだが円錐の実効射程は 3 マス。
         *          この食い違いが降格の 35% を作っていた (依頼書 #50 §2-4/§2-5)。
         *   (ii) 隣接しているのに敵が円錐へ入らない (真後ろ等) → 従来どおり通常攻撃。
         * ⚠ 撤退モードでは (i) を採らない = 2026-09-04 以前の挙動へ完全に戻す。 */
        if (CONE_CAST_ON && target && target.alive) {
          const ex = target.x + target.def.displaySize / 2;
          const ey = target.y + target.def.displaySize / 2;
          const rangeTiles = getRange(skill.range).tiles;
          const dist = tileChebyshev(aCX, aCY, ex, ey);
          if (dist > CONE_REACH_TILES && dist <= rangeTiles && hasLineOfSight(aCX, aCY, ex, ey)) {
            await allyAdvanceTowardPoint(ally, ex, ey);
            return;
          }
        }
        await allyBasicAttack(ally, enemyIdx);
        return;
      }
```

⚠⚠ **`const target = enemies[enemyIdx];` は関数の先頭に既にある**
(`index.html:27210`)。上のブロックで**再宣言すると `SyntaxError` でページ全体が死ぬ**。
既存の `target` をそのまま使うこと。
⚠ `allyConeOfCold` 側も同様に既存の宣言を確認してから書く(行番号は必ずズレる前提)。

---

## 7. 撤退スイッチ

- **`?conecast=0`** — 探索を 2026-09-04 以前へ完全に戻す:
  4 方向のみ / 味方の拒否権は絶対 / 届かなくても詰め寄らず通常攻撃へ降格。
- ⚠ **判定位置 = `CONE_CAST_ON` の 1 箇所だけ**(STEP1 のヘルパー群の直後)。
  `pickConeDirection` と STEP3 の分岐がこの 1 つの定数を読む。
- ⚠ **ページ遷移をまたがない**。`index.html` が自分の `location.search` を読むだけ
  (`?castanchor=0` / `?rolltarget=0` と同じ流儀)。⛔ sessionStorage へ写さない。

---

## 8. 受入条件 — `tools/verify_cone_cast.js`(新規)

**測り方の方針**: 探索は `Math.random` を 1 度も引かない**純粋な関数**なので、
実プレイの運に頼らずに測れる。

- **本体の assert は合成盤面で決定論的に採る** — 実マップ・実 `partyInArea` /
  `enemiesInArea` の上に、決定論 LCG で「敵の塊 + その手前に前衛 + さらに後ろに術者」を
  大量に敷き、`pickConeDirection` を直接叩く(`driver_field_step7.js` の標本生成の流儀)。
- **実プレイは母集団ガードにだけ使う** — `window.__aoeStats`(既存シーム)で
  「本当にこの経路が走っているか」を確認する。⭐ 発射率そのものを実プレイで assert しない
  (非決定論なのでフレークする)。
- ⭐ **検証シームは明示公開が要る**。classic script 直下の `const`/`function` は
  `window` に自動で載らないので、`pickConeDirection` / `coneTilesFrom` / `CONE_CAST_ON` /
  `CONE_REACH_TILES` を `window.__cone = {...}` へ出すこと
  (先例 = `window.pickLeaderAction` / `window.apGateP`)。
  ⛔ **本番の判断ロジックに計測用の分岐を足さない**。露出だけ。

### ⚠ 計測機構

```js
// 起動時に配信バイトを凍結し、負のコントロールはメモリ上のスナップショットへ注入する。
// ⛔ 本番ファイルを書き換えない。
// ⚠ index.html は CRLF。'\n' で split したら各行末の '\r' を trim してから比較し、
//    書き戻す行には '\r' を付け直す (先例: driver_action_priority.js editIndexLines)。
// ⚠ 魔法使いにバーニングハンズを持たせるには **遷移前** に 2 つ仕込む (§2-7):
//    localStorage['dragonfighters.knownSpells'] = {"mage":[...,"burning-hands"],...}
//    localStorage['dragonfighters.partySkills'] = {"mage":["burning-hands", ...]}
//    どちらも欠けると equippedSkills に入らず、全 assert が空振りする。
// ⚠ 実プレイのアームは ?autoplay=30&diag=1 / sessionStorage['dragonfighters.currentScenario']
//    = 'goblin-mine' / xp=3000 (Lv3)。⚠ 起草時の計測もこの条件で採った。
```

### §0 装置(先に母集団を確かめる)

- **(0a)** `window.__cone` が実在し、`pickConeDirection` / `coneTilesFrom` /
  `CONE_CAST_ON` / `CONE_REACH_TILES` の 4 つが取れる。
  ⭐ **これが無いと以下の assert が全部「関数が無いので false」で空振りする**。
- **(0b)** 合成盤面の標本が **200 件以上**あり、そのうち
  **「4 方向・拒否権あり」では撃てないが「8 方向・2 段」では撃てる**標本が **50 件以上**ある。
  ⭐ 差の出ない盤面で測ると (2a)(2b) が自明に緑になる。
- **(0c)** 実プレイ 90 秒で `window.__aoeStats["バーニングハンズ"].attempts >= 5`。
  ⭐ **経路が本当に走っている**ことの直接証明。0 件なら仕込み(上の ⚠)が失敗している。
- **(0d)** 魔法使いの `equippedSkills` に `"burning-hands"` があり `spellSlots` が 1 以上。

### §1 STEP1 の恒等(振る舞いを変えていない)

- **(1a)** `?conecast=0` のアームで、全標本(200 件以上)について
  `pickConeDirection` の返り値(方向・タイル集合・count)が
  **ドライバ側が独立に書いた旧アルゴリズムの再実装**と完全一致する。
  ⭐ **写経にしない** — ドライバの鏡は本番のソースを見ながらではなく、
  **本依頼書 §2-2 に引用した擬似コードから起こす**こと。
- **(1b)** 同じアームで「味方入りの方向」が **1 件も選ばれていない**(拒否権が絶対に戻っている)。
- **(1c)** 同じアームで **斜め方向が 1 件も選ばれていない**。

### §2 STEP2 — 発射率が上がる

- **(2a)** 素のアームの発射率(= `pickConeDirection` が非 null を返す割合)が
  **撤退アームの 3 倍以上**。⭐ 実測の期待は 5.6% → 65% だが、
  **合成盤面なので絶対値は違って当然**。⛔ 実プレイの % を写経しない。
- **(2b)** 素のアームで選ばれた方向のうち、**清潔な方向(`partyInCone === 0`)が
  実在する標本では必ず清潔な方向が選ばれている**(2 段構えの順序が守られている)。
  ⭐ ここが (2a) と独立の 2 経路目。「味方入りを許す」を「常に味方入りを選ぶ」と
  取り違える実装を捕まえる。
- **(2c)** 素のアームで、**敵 0 体の方向は 1 件も選ばれていない**(空撃ちしない)。

### §3 STEP3 — 届かないときは詰め寄る

- **(3a)** 「対象が 4〜8 マス・視線が通る」合成盤面で、
  `allyBurningHands` が **`allyAdvanceTowardPoint` を呼び、`allyBasicAttack` を呼ばない**。
  ⭐ 呼び出しはスタブで観測する(`driver_action_priority.js` の `__warQuiet` の流儀。
  演出だけ黙らせ、判断は 1 行も触らない)。
- **(3b)** 「対象が 9 マス以上(= `medium` の外)」では **`allyAdvanceTowardPoint` を呼ばず
  `allyBasicAttack` へ落ちる**(無限に歩き続けない)。
- **(3c)** 「対象が隣接(1 マス)なのに円錐へ入らない」盤面では
  **`allyBasicAttack` へ落ちる**(その場で足踏みしない)。
- **(3d)** `?conecast=0` では (3a) の盤面でも **`allyAdvanceTowardPoint` を呼ばない**。

### §4 コーンオブコールドにも同じ改善が効く

- **(4a)** 配信ソース上で、`allyBurningHands` / `allyConeOfCold` の本文に
  `const directions = [` が **0 件**(旧探索ブロックが残っていない)。
- **(4b)** 同じ合成盤面で、コーンオブコールドの発射率もバーニングハンズと**同じ値**になる
  (探索が 1 本に寄っていることの機械的証明)。

### §5 実プレイ(母集団と非退行の確認のみ)

- **(5a)** 90 秒の実プレイで `__aoeStats["バーニングハンズ"].cast >= 1`。
  ⭐ **「1 発以上撃った」だけを見る**(率は合成盤面で測る)。
- **(5b)** `pageerror` が 0 件。

### §6 撤退

- **(6a)** `index.html?conecast=0` で (1a)(1b)(1c)(3d) が全部成立する。
- ⚠⚠⚠ **(6a) だけを受入条件にしない**。#39 の「撤退アームだけの受入条件は永久緑」の轍。
  素のアームの (2a)(2b)(2c)(3a)(3b)(3c) と**対**で見ること。

### ⛔ 測らないこと

- **「味方が円錐に何人まで入ってよいか」の上限** — 今回は上限を設けない。
  絵面の許容度は実機で見て決めるので、**assert で縛らない**(§9 の宿題)。
- **`mageAI` の梯子の閾値(32/30/25/25/20)と `fallbackOrder`** — 1 行も触らないので測らない。
- **ダメージ量・セーヴ DC・エフェクトの見た目** — 探索しか変えていない。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `vetoback` | ⭐ **§2-2 の罠の再現**。`passes` を `[0]` 固定にし、味方入りパスを消す | (2a) |
| `only4dir` | `CONE_DIRS_8` を `CONE_DIRS_4` にする | (2a) |
| `dirtyfirst` | `passes` を `[1, 0]` へ逆順にする(常に味方入りを先に採る) | (2b) |
| `nobreak` | ⭐ **§4 の ⚠⚠ の再現**。清潔パスの `break` を消して `cnt` を最後まで足す | (1a) |
| `zerofoe` | `if (cnt <= 0) continue;` を消す(敵 0 体の方向を採る) | (2c) |
| `noadvance` | STEP3 の `allyAdvanceTowardPoint` を `allyBasicAttack` へ戻す | (3a) |
| `alwaysadvance` | STEP3 の `dist <= rangeTiles` を外す(射程外でも歩き続ける) | (3b) |
| `advadjacent` | STEP3 の `dist > CONE_REACH_TILES` を外す(隣接でも歩く) | (3c) |
| `reachdrift` | ⭐ `coneTilesFrom` の上限だけ 4 に直書きして `CONE_REACH_TILES` は 3 のまま | (3a) or (3c) |
| `retreatdead` | `CONE_CAST_ON` を `true` 固定にする(撤退スイッチが効かない) | (6a) |
| `coldstale` | `allyConeOfCold` だけ旧探索へ戻す | (4a)(4b) |
| `seamonly` | `window.__cone` の公開を消す | (0a) |
| `noknown` | 仕込む `knownSpells` から `burning-hands` を抜く | (0c)(0d) |
| `flatpop` | 合成盤面の生成を「敵と味方を同じ 1 マスに固める」へ潰す | (0b) |

⚠⚠⚠ **変異は「仕様の言葉」ではなく「その assert が実際に読む値の供給口」へ当てる**
(#47 の `taintlabel` の教訓)。**注入点がちょうど 1 箇所見つからなければ走らせる前に exit 1**。
⚠ **「1 行消す」で終わらせず、消して欠陥が実際に発現するかまで筋を追う**
(#47 の `dismissboon` は門番が 2 本あって空振りした)。
`vetoback` は特に注意 —— **`only4dir` と効果が重なる**ので、
**片方だけを注入したときに (2a) が赤くなるか**を 1 本ずつ確認すること。
⚠ 変異が原理的に赤にできないと分かったら、#38/#43/#45 の作法どおり
**変異のほうを作り替える**(assert を緩めない)。その経緯は §12 に必ず書く。

### 既存 golden の非退行(実装後に必ず走らせる)

⭐ **母集団は「前のチケットが数えた本数」ではなく、自分で grep して数え直した**
(#47 の教訓)。`grep -ln "allyBurningHands\|allyConeOfCold\|burning-hands\|cone-of-cold\|noteAoeOutcome\|__aoeStats\|partyInArea\|coneTiles" tools/*.js`
→ **2 本**(`driver_action_priority.js` / `driver_field_step7.js`)。
そこへ直近チケットの golden 3 本を足した **5 本**を基準にする。
⚠ 着手前に**この grep を自分でもう 1 回回し**、本数が変わっていないか確かめること。

| ドライバ | 期待 | 測定日 | 備考 |
|---|---|---|---|
| `node tools/driver_action_priority.js` | **92/92 PENDING 0** | 2026-09-04(#49 の記録) | mageAI の梯子。`allyBurningHands` をスタブ化するので原理的に無関係だが最近接 |
| `node tools/driver_field_step7.js` | (着手前に走らせて記録) | 未測定 | ⚠ §2-6 — (P) の cone 行は**鏡**なので値は変わらない。**緑であること**だけを見る。baseline worktree を作るので時間がかかる |
| `node tools/driver_cast_circle.js` | **56/56** | 2026-09-04(#49 の記録) | `dfPlayCast` — バーニングハンズが呼ぶ |
| `node tools/verify_roll_target.js` | **30/30**(`--negative` 53/53) | 2026-09-04(#49 の記録) | `showRollAtAlly` — バーニングハンズが呼ぶ |
| `node tools/verify_enemy_name_label.js` | **30/30** | 2026-09-04(#49 の記録) | 直近 golden |

⚠ 基準値は 2026-09-04 時点の記録。**走らせて違ったら期待値を書き換える前に理由を突き止める**。
⚠⚠ **実プレイ系は逐次で走らせる**(#47 で並走すると揺れることが実測されている)。
⚠ **単発の赤はまず 1 回だけ再実行**(`driver_grid_p8` の flake の前例)。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレーション音声が鳴らない)。

1. 廃坑を魔法使い入りで 1 周し、**バーニングハンズが実際に何度も出るか**。
2. ⭐⭐ **炎が味方を包む絵面が許せるか**。実測では味方 1 人が 71% / 2 人が 14%。
   許せないなら「清潔な方向が無いときは 1 人までなら許す」等の上限を後から足す(§11)。
3. 魔法使いが**前に出すぎていないか**(STEP3 の「詰め寄る」の副作用)。
   後衛が melee の間合いへ入って落ちるようなら、詰め寄りの条件を厳しくする。
4. 円錐の炎エフェクト(`spawnConeFlames`)が**斜め方向でも破綻しないか**。
   ⚠⚠ 従来は上下左右しか渡っていないので、**斜めは初めて通る経路**。
   絵が横に伸びる・向きがおかしいなら §12 に記録し、別チケットへ。
5. 焼夷地面(`spawnGroundFx`)と小バースト(`spawnFireImpactBurst`)が
   斜めの円錐でも正しい位置に出るか(こちらは `best.d.dx/dy` を直接読んでいる)。
6. コーンオブコールド(Lv5〜)でも同じ改善が体感できるか。

---

## 10. changelog(⚠ `index.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>魔法使いがバーニングハンズを撃つようになった</b> — 前方の炎は仲間を傷つけないので、仲間が前に立っていても遠慮せず放つ。狙いが遠いときは間合いを詰めてから唱える。"
```

---

## 11. やらないこと

- ⛔ **`mageAI` の梯子と `fallbackOrder` の調整**。今回は実行側だけ直す。
  ⚠ 実測メモ: 主人公が魔法使いのとき、`pickLeaderAction`(`index.html:30341`)は
  **`target: "cone3"` を (d)「その他」枝に落として重み `LEADER_W_BASE = 1.0` 固定**にしている
  (`index.html:30437`)。単体攻撃呪文は (a) 枝で最大 `LEADER_W_MAX = 3` まで伸びるので、
  **範囲呪文はリーダーが構造的に選びにくい**。これは別チケットの題材(#51 候補)。
- ⛔ **ライトニングボルト(直線 3 タイル)の同型の欠陥**。`allyLightningBolt`
  (`index.html:26943` に `noteAoeOutcome(..., "line")`)も同じ拒否権を持つが、
  探索の形が違う(直線 8 方向・幅 1)ので別チケット。
- ⛔ **`RANGE.medium` を円錐の実効射程 3 に合わせる**。他が読んでいる共有値。
- ⛔ **`tavern.html` の説明文の変更**。『PT 巻き込みなし』は変更後も正しい。
- ⛔ **バーニングハンズを初期習得(`DEFAULT_KNOWN.mage`)に足す**。
  巻物で覚える設計は意図されたもの。
- ⛔ **`driver_field_step7.js` の `conePick`(鏡)を新実装へ追随させる**。
  §2-6 のとおり (P) は参考値なので、**壊れていないものを触らない**。
  ただし §12 に「この鏡は旧アルゴリズムのままである」と**必ず書き残す**。
- ⛔ **`実装依頼書/README.md` への行追加**は、実装が着地してから。用意してある行:

  | 50 | [2026-09-04_cone-spell-cast-rate.md](2026-09-04_cone-spell-cast-rate.md) | **承認済** | 0% | バーニングハンズ/コーンオブコールドの発射率を 5.6% → 実用域へ。⭐ 実測 = 54 手番中 51 回が**無言で通常攻撃へ降格**、呪文スロットは 1 発も減らない。⚠⚠⚠ 真因は「円錐 9 マスに味方が 1 人でも居たら方向ごと破棄」する拒否権だが、**下流の被害者列挙は `enemiesInArea` = 敵のみ**で味方は元々 1 ダメージも受けない(酒場の説明文も『PT 巻き込みなし』)= **起きえない誤射を防ぐために発射率を捨てていた**。⭐ 反実仮想の実測 = 斜めだけ足す 20.4% / 拒否権だけ外す 51.9% / **両方(清潔優先→味方入り許可)64.8%**。⚠ 残り 35% は「宣言射程 medium=8 マス vs 円錐の実効射程 3 マス」の食い違い → `allyFireball` と同じ「詰め寄る」で回収。撤退 `?conecast=0` |

---

## 12. 実装結果

(実装窓が埋める。⭐ **依頼書が外していた点を必ず書く** — 行番号のズレ / 変異の空振り /
斜め方向で初めて通るエフェクト経路の破綻 / §2-6 の鏡の扱い)
