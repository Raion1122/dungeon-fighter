# #114 不意打ちの第 1 ラウンド — 敵が無防備になり、最初の一撃に「暗殺!」の見せ場が付く

- **起草**: 2026-11-10(起草窓) / **ステータス**: **承認済**(2026-11-10 ユーザー承認)
- **起草時 HEAD**: `5fd5999`(`index.html` は clean)
- **触るファイル**: `index.html` / `js/changelog.js` / `tools/verify_ambush_round.js`(新規) / `tools/verify_hold_person.js`((5a) の言い直し 1 か所)
- ⛔ **触らないファイル**: `tools/verify_accessory_equip.js` — 起草時点で別窓 `claude-ca` の未コミット差分あり(#113 の後に見つかった「頭へ昇格した主人公の最大 HP が Lv 分を失う」件の作業と見られる)。その修正で `index.html` の行番号が動く可能性があるので、**着手時に §2 の行番号を必ず測り直す**。
- `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

D&D 5 版のビルド考察記事(ホイホイTRPG部 <https://note.com/hoihoitrpgclub/n/n71164d579968>)の「バグベア + アサシン = 不意打ちの一撃が必ずクリティカルになる」という発想を取り入れる。

ゲームには「隠密の接近」(不意打ち)が既にあるが、効果は**敵の手番を 1 回飛ばすだけ**で、不意打ちらしい「無防備な敵への一撃」が見えない。敵が自分の手番で立ち直ると、その後に殴っても普通の攻撃になる。

**ユーザー決定(2026-11-10)**:

- 採用 = **不意打ちされた敵は第 1 ラウンドの間ずっと無防備**(自動命中・確定クリティカル・スニーク成立)+ **その戦闘の最初の一撃に専用のバナー**。
- 不採用 = 「見せ方だけ(数値を変えない)」。頻度が低いという実測を受けて、第 1 ラウンド案が選ばれた。
- 記事のほかの案(無抵抗の敵へパワーアタック / グッドベリー / 捨て身の攻撃)は今回やらない。軽いものから様子を見る方針で、次回以降に選び直す。

---

## 2. 着手前の実測(起草窓が本番コードで確かめた事実。HEAD `5fd5999`)

### 2-1. 不意打ちの今の姿

| index.html:行 | 何 |
|---|---|
| 24511-24530 | 行動順を決める(**不意打ちより先**) |
| 24537 | `await tryStealthSurprise();` = 隠密判定。非ボスだけが対象 |
| 24538 | `consumeSce1Surprise();` = EV-9 の奇襲。**ボス(グリクス本人)も対象** |
| 28648-28654 | `applySurpriseStun` = 不意打ちの**唯一の付与点**(`stunned` を最低 1 にする) |
| 38944-38945 | 敵の手番で `enemy.stunned -= 1;` して行動を飛ばす |
| 24397 | 交戦の初期化で `e.stunned = 0;`(不意打ちの付与より前) |
| 24556 / 24690 | `encounterRound` の更新(1 に戻す / ラウンド末に進める) |
| 35688 | `canSneakOnTarget` の `if (target.stunned > 0) return true;` |

**「無防備」の判定は 15 か所だけ**(`const helpless = target.stunned > 0;` の形。`t.stunned` が 2 か所。全文 grep で実測):

| 行 | 関数 | 行 | 関数 |
|---|---|---|---|
| 26271 | playerSingleAttack | 33557 | allyEarthShatter(`t`) |
| 30519 | performAllyCounter | 34565 | allyAimedShot |
| 31009 | allyBasicAttack | 34658 | allyMagicArrow |
| 31838 | allyMagicMissile | 34999 | allyLightningArrow |
| 31912 | allyFireBolt | 35801 | allyShadowStep |
| 33221 | allyPowerAttack | 35882 | allyThrownDagger |
| 33390 | allyThrowingAxe | 35941 | allyPoisonBlade |
| 33490 | allyAxeStorm(`t`) | | |

### 2-2. ⚠⚠⚠ 罠: `stunned` の減算を遅らせる設計は採らない

素直に思いつくのは「第 1 ラウンド中は `enemy.stunned -= 1` を止めて、ラウンド末にまとめて引く」だが、**これは別の効果を壊す**。`stunned` の書き手は全部 `Math.max` なので(23221 / 31771 / 32129 ほか)、

- 敵の手番の後に盾バッシュ(1)が当たると、今は `0 → 1` で第 2 ラウンドも止まる。遅延版だと `1 → max(1,1)=1 → ラウンド末に 0` になり、**盾バッシュが無かったことになる**。
- 敵の手番の後にスリープ(2)が当たると、今は 2、遅延版は 1 に縮む。

よって **`stunned` には一切触らず**、「無防備の窓」を別の印(`e.__ambushOpen`)で持つ。これで敵が動ける回数は構造的に今と同じになり、増えるのは「第 1 ラウンドの一撃が自動命中 + クリティカルになる機会」だけになる。

⭐ この罠は §8 の変異 `holdstun` として装置に内蔵する。

### 2-3. ⚠⚠ 罠: 文字列で固定している既存ドライバが 3 本

| ドライバ | 固定しているもの | 対応 |
|---|---|---|
| `tools/verify_hold_person.js` (5a) | `helpless` を含むコード行が `b1143ac` と **1 文字も同じ** | 15 か所を変えるので**赤くなる**。§6 で言い直す |
| `tools/driver_sce1_events.js:177` | applySurpriseStun の `enemies[i].stunned = Math.max(...); n++;` の行 | **この行は変えない**(変異の注入点) |
| `tools/verify_enemy_traits.js:152` | 同上 | 同上 |

⭐ 新しいコードに小文字の `helpless` という語を書かない((5a) が行を拾う)。`isHelplessStrike` は大文字の H なので拾われない(`indexOf('helpless')` で確認)。

`tools/driver_speech_v2.js` の `!helpless && isThreat` は変数名 `helpless` を残すので影響なし。

### 2-4. ボスの扱い

EV-9 はグリクス本人にも `stunned` を付ける。第 1 ラウンドの間ずっと確定クリティカルをボスに入れられると影響が大きいので、**窓の印は非ボスだけ**に付ける。グリクスは今どおり手番が 1 回飛ぶだけ(`applySurpriseStun` の中で `markAmbushOpen` がボスを除く)。

### 2-5. 実戦の計測(本番ファイルは変えず、配信時にメモリ上で注入)

条件 = `?autoplay=15&diag=1`・廃坑 / 森 / 沼地を各 100 秒・**不意打ちを必ず成功させる**(`await tryStealthSurprise();` の直後で非ボスへ `applySurpriseStun` を強制)。15 か所の `helpless` を計数関数に置き換え、案の版はそこと `canSneakOnTarget` で窓を効かせた。

| | 不意打ちした戦闘 | 窓の中で一撃が入った戦闘 | 窓の中の一撃 | 無防備への一撃(全体) |
|---|---|---|---|---|
| 現行 | 8 | 4 | 4 | 13 |
| 本案 | 8 | 4 | 5 | 19 |

⚠ **標本が小さく、編成も走行ごとに違う。この数では「演出が出る戦闘が増える」とは言えない。** 窓の中の一撃が少ないのは行動順よりも、第 1 ラウンドに届く攻撃が少ないため(近接役は歩いて終わる・主人公はラウンド 1 にバフを選びやすい [36570]・範囲呪文は 15 か所の外)。一撃を入れたのは魔法使いが多く、盗賊は 1 回だけ。**頻度は §9 の実機で判断する。**

### 2-6. 既存 golden の基準(2026-11-10・HEAD `5fd5999`)

| ドライバ | 実測 | 所要 |
|---|---|---|
| `node tools/verify_hold_person.js` | 31/31 | 10 秒 |
| `node tools/verify_enemy_traits.js` | 15/15 | 4 秒 |
| `node tools/driver_sce1_events.js` | **211/214**(⚠ 既存の赤 3 件: (2) / (4d) / (N2-隣) = `sceneFlags` のキーが 3 本の前提だが今は 5 本。今回とは無関係) | 49 秒 |
| `node tools/verify_corner_check.js` | 20/20 | 82 秒 |
| `node tools/verify_lore_check.js` | 26/26 | 3 秒 |
| `node tools/verify_invisibility.js` | 27/27 | 28 秒 |
| `node tools/driver_action_priority.js` | 92 PASSED | 65 秒 |

### 2-7. 語の扱い

「暗殺」「不意の一撃」は一般語で、Product Identity の固有名詞ではない(`index.html` にも既に「暗殺者の刃」「アサシン」がある)。記事のサブクラス名や種族名は使わない。

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py` の `GAME_LOGIC` = `index.html` / `tavern.html` / `audio.js` ⇒ **鳴る**。プレイヤーに見える変化があるので §10 の要約は実在する。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | §4 / §5 の追加と、15 か所の置き換え・`canSneakOnTarget` の 1 行 |
| `js/changelog.js` | §10 |
| `tools/verify_ambush_round.js` | 新規(§8) |
| `tools/verify_hold_person.js` | (5a) の言い直し(§6) |

---

## 4. STEP1 — 窓の印(`applySurpriseStun` の直前へ足す)

```js
/* ★#114 不意打ちの第 1 ラウンド。撤退 ?ambushround=0。index は酒場からの遷移で開くので sessionStorage へ写す (#113 と同じ作法)。 */
const AMBUSH_ROUND_ON = (function () {
  try {
    if (/[?&]ambushround=0(&|$)/.test(location.search)) sessionStorage.setItem("dragonfighters.ambushRoundOff", "1");
    return sessionStorage.getItem("dragonfighters.ambushRoundOff") !== "1";
  } catch (e) { return !/[?&]ambushround=0(&|$)/.test(location.search); }
})();
let ambushStrikeShown = false;   // 見せ場は 1 戦 1 回
let ambushActorClass = null;     // 今の手番の職 (手番ループが入れる)

/* ⭐ stunned には触らない (依頼書 §2-2)。ボスは対象外 (§2-4)。 */
function markAmbushOpen(indices) {
  if (!AMBUSH_ROUND_ON) return;
  ambushStrikeShown = false;
  for (const i of indices) {
    const e = enemies[i];
    if (e && e.alive && !(e.def && e.def.isBoss)) e.__ambushOpen = true;
  }
}
function isAmbushOpen(t) { return !!(t && t.__ambushOpen) && encounterRound === 1; }

function showAmbushStrike(t) {
  ambushStrikeShown = true;
  const rogue = ambushActorClass === "rogue";
  showBanner(rogue ? "🗡 暗殺!" : "⚔ 不意の一撃!", 1500);
  const nm = (t.def && t.def.name) || "敵";
  updateInfo(rogue ? `${nm} は声を上げる間もなく、背後から刃を受けた!` : `${nm} は構える間もなく、一撃を受けた!`);
}

/* 15 か所の「無防備か」の唯一の判定。 */
function isHelplessStrike(t) {
  const open = isAmbushOpen(t);
  if (open && !ambushStrikeShown) showAmbushStrike(t);
  return t.stunned > 0 || open;
}
```

- `applySurpriseStun` の `return n;` の直前に `markAmbushOpen(indices);` を 1 行足す。⛔ `enemies[i].stunned = Math.max(...); n++;` の行は変えない(§2-3)。
- 交戦の初期化(24397 の `e.stunned = 0;` の次)に `e.__ambushOpen = false;` を足す。⛔ 24041 の同じ文の方ではない。
- `encounterRound` は不意打ちの付与時点では前の戦闘の値のままだが、読むのは 24556 で 1 に戻した後の攻撃だけなので問題ない。

## 5. STEP2 — 配線

- **15 か所**: `const helpless = target.stunned > 0;` → `const helpless = isHelplessStrike(target);`(33490 / 33557 は `t`)。26271 の行末コメントは残す。⛔ 表示の `HELPLESS!` 等には触らない。
- `canSneakOnTarget`(35688): `if (target.stunned > 0 || isAmbushOpen(target)) return true;`
- 手番ループ(24643 の `if (actor.kind === "player") {` の直前)に 1 行:
  `ambushActorClass = actor.kind === "player" ? leaderClassKey : actor.kind === "ally" ? actor.ally.classKey : null;`
- ⛔ `enemyAttackTurn` の `enemy.stunned -= 1;` は変えない。AI や描画が読む `stunned`(18190 / 31356 / 34231)もそのまま。

## 6. STEP3 — `verify_hold_person.js` (5a) の言い直し

守っているもの(「`helpless` のコードが変わっていない」)は残し、今回の置き換えだけを元の形へ畳んでから比べる。`const b = linesWith(cur, 'helpless');` を次へ:

```js
/* #114: 15 か所は isHelplessStrike 経由になった (窓を足しただけで弱めていない)。元の形へ畳んで比べる */
const b = linesWith(cur, 'helpless').map((l) => l.replace(/helpless = isHelplessStrike\((target|t)\);/, 'helpless = $1.stunned > 0;'));
```

⚠ 判定文の「1 文字も変わっていない」も「#114 の置き換えを畳むと」に直す。件数は 31/31 のまま。

---

## 7. 撤退スイッチ

- **`?ambushround=0`** — 印が付かないので、窓もバナーも無くなり、`isHelplessStrike` は `t.stunned > 0` と等価になる。
- 判定位置 = 読み込み時に 1 回(`AMBUSH_ROUND_ON`)。sessionStorage へ写すのでページ遷移をまたぐ(#113 の `?accequip=0` と同じ型)。

---

## 8. 受入条件 — `tools/verify_ambush_round.js`(新規)

`verify_invisibility.js` の型(内蔵サーバ・配信スナップショットの凍結・`--negative` 内蔵・`__MUTHIT__`)で書く。ページの中で交戦中の敵を直接組み、本物の `applySurpriseStun` / `enemyAttackTurn` / `allyBasicAttack` を呼ぶ。⭐ 自動命中は **`Math.random` を固定して d20 = 1 を振らせ**、ファンブルにならず命中することで確かめる(`isHelplessStrike` の戻り値の写経にしない)。

### §0 装置

- **(0a)** ソースの `isHelplessStrike(` の呼び出しが 15 か所・`helpless = (target|t).stunned > 0` が 0 件(ドライバが正規表現で数える)
- **(0b)** ゴブリンで (1a) の一撃が実際に HP を減らした・バナーの差し替えが 1 回以上呼ばれた ⭐ **これが無いと全 assert が空振りで永久緑**
- **(0c)** 全ページ起動・pageerror 0 件

### §1 窓

- **(1a)** 不意打ち → 敵の手番(`stunned` 1→0)→ 第 1 ラウンドの `allyBasicAttack` が d20 = 1 でも命中 + クリティカル
- **(1b)** 同じ仕込みで `encounterRound = 2` ⇒ d20 = 1 はファンブル(窓は閉じている)
- **(1c)** ボスに `applySurpriseStun` ⇒ `stunned` は付くが窓は無い(手番の後の d20 = 1 はファンブル)
- **(1d)** 盾バッシュ等だけで止めた敵(不意打ちなし)⇒ 手番の後は窓なし
- **(1e)** 手番の後でも `canSneakOnTarget` が真・第 2 ラウンドは(隣接役がいなければ)偽
- **(1f)** 次の交戦の初期化で印が消える(第 1 ラウンドに終わった戦闘の生き残りで確かめる)

### §2 敵の行動回数は変わらない(⭐ 2 経路)

- **(2a)** 不意打ちされた敵の `enemyAttackTurn` を 2 回呼ぶ ⇒ 1 回目は行動せず `stunned` 0、2 回目は行動する
- **(2b)** 同じ手順を `?ambushround=0` で走らせ、`stunned` の推移と行動の有無が (2a) と一致
- **(2c)** 手番の後に `stunned` を `Math.max(…, 1)` / `Math.max(…, 2)` で書く(盾バッシュ・スリープ相当)⇒ それぞれ 1 / 2 のまま第 2 ラウンドへ(§2-2 の罠)

### §3 見せ場

- **(3a)** 1 戦で 2 体に一撃 ⇒ バナーは 1 回だけ
- **(3b)** 手番の主が盗賊 ⇒ 「暗殺」/ 戦士 ⇒ 「不意の一撃」(`ambushActorClass` は手番ループの代入を通すか、代入行をソースで確認)
- **(3c)** 不意打ちなしの `stunned` の敵を殴る ⇒ バナーなし
- **(3d)** 次の不意打ちでまた 1 回出る

### §4 撤退

- **(4a)** `index.html?ambushround=0` ⇒ (1a) の仕込みで d20 = 1 はファンブル・バナーなし
- **(4b)** sessionStorage に写り、クエリなしの再読み込みでも撤退のまま

### ⛔ 測らないこと

バナーの尺と文面の細部 / 実戦での出現頻度・勝率(§9 で見る)

### 負のコントロール(`--negative` で内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `holdstun` | ⭐ §2-2 の罠: 窓の間 `stunned -= 1` を止める | (2a) (2c) |
| `bossopen` | `markAmbushOpen` のボス除外を外す | (1c) |
| `noround` | `isAmbushOpen` の `encounterRound === 1` を外す | (1b) (1e) |
| `onesite` | 15 か所のうち 1 か所を元へ戻す | (0a) |
| `nosneak` | `canSneakOnTarget` を元へ戻す | (1e) |
| `noreset` | 交戦の初期化の印の消去を外す | (1f) |
| `everybanner` | `ambushStrikeShown` の latch を外す | (3a) |
| `noactor` | 手番の職を入れない | (3b) |
| `alwaysoff` | `AMBUSH_ROUND_ON` を常に偽 | (1a) (0b) |

### 既存 golden の非退行

§2-6 の 7 本。`driver_sce1_events` の期待は **211/214 で同じ 3 件が赤**(増えたら本件を疑う)。

⚠ 基準値は 2026-11-10 の記録。走らせて違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動。

1. 盗賊入りの編成で不意打ちを成功させ、第 1 ラウンドにバナーが出る頻度が「たまに出て嬉しい」程度にあるか。⭐ 少なすぎるなら、別チケットで「窓を第 2 ラウンドの頭まで」等を検討する(§2-5)。
2. 第 1 ラウンドの確定クリティカルで雑魚戦が簡単になりすぎないか。⚠ 不意打ちの判定に成功した戦闘だけの効果。
3. バナーが「🥷 不意打ち成功!」や他の演出と重なって読めなくならないか。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>不意打ちの一撃に見せ場を</b> — 奇襲に成功すると、第 1 ラウンドの間は敵が無防備に。盗賊の一撃は「暗殺!」と響く。"

---

## 11. やらないこと

- ⛔ 窓の長さや発動率を上げる調整(§9 の結果を見て別チケット)
- ⛔ 近接役が第 1 ラウンドに届くようにする AI・配置の変更
- ⛔ `HELPLESS!` などの吹き出しの文面変更 / 不意打ちの判定(DC・対象)の変更
- ⛔ 範囲呪文など 15 か所の外の攻撃を無防備扱いにすること
- ⛔ 物理無効の敵への一撃でもバナーは出る(弾かれても出す)。稀なので今回は直さない
- ⛔ 記事のほかの案(無抵抗の敵へパワーアタック / グッドベリー / 捨て身の攻撃)
- ⛔ `driver_sce1_events` の既存の赤 3 件の修正(別件)
- README の行(承認時に起草窓が足す):

      | 114 | [2026-11-10_ambush-round.md](2026-11-10_ambush-round.md) | **承認済** | 0% | 不意打ちされた敵は第 1 ラウンドの間無防備 + 最初の一撃に「暗殺!」。⚠ `stunned` には触らず別の印で窓を持つ(減算を遅らせると盾バッシュが消える) / ⚠ `verify_hold_person` (5a) の言い直しが要る |

---

## 12. 実装結果

### 12-1. 着手前の測り直し(1a44ac8)

**結論: §4〜§8 の設計どおりに進められる。** 崩れた前提は無い(§2-2 の文言に 1 件だけ訂正あり。設計には響かない)。

**行番号**: `5fd5999..1a44ac8` の `index.html` の差分は 22057 の 1 行追加 + 22062 の 1 行変更だけ。**22057 より後の行はすべて +1、前の行は不変**(内容も実測で照合)。

| 依頼書の行 (5fd5999) | 1a44ac8 | 何 |
|---|---|---|
| 24511-24530 | 24512-24531 | 行動順 |
| 24537 / 24538 | 24538 / 24539 | `tryStealthSurprise` / `consumeSce1Surprise` |
| 28648-28654 | 28649-28655 | `applySurpriseStun`(注釈は 28645-28648) |
| 38944-38945 | 38945-38946 | `enemy.stunned -= 1;` |
| 24397 / 24041 | 24398 / 24042 | 交戦の初期化 / `mergeReinforcements` の方 |
| 24556 / 24690 | 24557 / 24691 | `encounterRound` の更新 |
| 35688 | 35689 | `canSneakOnTarget` |
| 24643 | 24644 | 手番ループの `if (actor.kind === "player") {` |
| 18190 / 31356 / 34231 | 18190 / 31357 / 34232 | AI・描画が読む `stunned` |
| 23221 / 31771 / 32129 | 23222 / 31772 / 32130 | `Math.max` の書き手の例 |

「無防備」の判定 15 か所(関数名も §2-1 の表どおり): 26272 playerSingleAttack / 30520 performAllyCounter / 31010 allyBasicAttack / 31839 allyMagicMissile / 31913 allyFireBolt / 33222 allyPowerAttack / 33391 allyThrowingAxe / 33491 allyAxeStorm(`t`) / 33558 allyEarthShatter(`t`) / 34566 allyAimedShot / 34659 allyMagicArrow / 35000 allyLightningArrow / 35802 allyShadowStep / 35883 allyThrownDagger / 35942 allyPoisonBlade。

**§2 の主張の照合**

| 主張 | 実測 |
|---|---|
| §2-2 `stunned` の書き手は全部 `Math.max` | ⚠ **文言は不正確**。敵への直接代入が 2 か所ある = 26469 `enemies[targetIdx].stunned = 1;`(主人公の盾バッシュ)/ 33928 `enemies[enemyIdx].stunned = sk.stunTarget;`(仲間の盾バッシュ)。ほかの書き手は `Math.max`、残りは 0 へのリセット。⭐ **設計は変わらない**(`stunned` に触らない方針なので、書き手の形に依存しない)。(2c) は 0 → 1 / 0 → 2 の結果を見るので `Math.max` で書いても盾バッシュの実物と同じ値になる |
| §2-3 文字列固定 3 本 | ✅ `verify_hold_person.js` (5a) は 998-1006 行(`const b = linesWith(cur, 'helpless');` は 999 行)。`driver_sce1_events.js:177` と `verify_enemy_traits.js:152` は applySurpriseStun の 1 行を固定(後者は字下げなし)。`tools/*.js` 全体で、15 か所・`canSneakOnTarget`・手番ループの `if`・交戦初期化の行をアンカーにしているものはほかに無い |
| §2-3 `driver_speech_v2` | ✅ 正規表現 `!helpless && isThreat` のみ。変数名を残すので影響なし |
| §2-4 ボス判定 | ✅ `goblinKing`(グリクス)の定義 10700 行に `isBoss: true`。`tryStealthSurprise` と同じ `e.def.isBoss` で効く。EV-9 は 30047 でボスも対象 |
| §4 `showBanner` / `updateInfo` | ✅ `showBanner(text, ms = 1000)`(23904)/ `updateInfo(message)`(17520)。呼び方は合う |
| §5 `leaderClassKey` / `actor.ally.classKey` | ✅ 8048 の `let`(同じスコープ、24168 や 28675 でも読んでいる)。`actor.ally` は 24627 で既に参照。`classKey` の値は `"rogue"`(15052) |
| 新しい名前 | ✅ `isHelplessStrike` / `markAmbushOpen` / `isAmbushOpen` / `showAmbushStrike` / `__ambushOpen` / `AMBUSH_ROUND_ON` / `ambushStrikeShown` / `ambushActorClass` / `ambushround` / `ambushRoundOff` はこの依頼書以外に出てこない。`tools/verify_ambush_round.js` も未作成 |
| §4 `encounterRound` の古い値 | ✅ 書き手は 22873 / 24557 / 24691 のみ。24539 の付与から 24557 までに PT → 敵の攻撃は無い。第 1 ラウンドで決着しても 24690 で進むので、戦闘の外で窓は開かない |
| §2-5 実戦の計測 | 再測定していない(一度きりの注入実験で、項目1 の範囲外) |

**実装で気をつける点(§1〜§11 には書かれていない)**

1. **(0a) の数え方**: コメントの 3 行(23175 / 31646 / 34009)に `helpless = target.stunned > 0` がそのまま書かれている。素朴に数えると「0 件」にならないので、(5a) と同じくコメントを剥いでから数える。`isHelplessStrike(` も定義行で 1 件増えるので、`helpless = isHelplessStrike(` の形で数える。
2. **`mergeReinforcements`(24042)で印を消さなくても安全**: 呼ばれるのは `round > 1` の頭と、参加者全滅の直後(この後に攻撃は無く 24690 で第 2 ラウンドへ進む)だけで、`isAmbushOpen` は `encounterRound === 1` を要求する。
3. **allyMagicMissile / allyMagicArrow には d20 が無い**: `helpless` はダメージの倍化だけに効く(必中の呪文なので「自動命中」は元から)。(1a) を `allyBasicAttack` で測る §8 の設計で問題ない。
4. **バナーが早く消える可能性(コードを読んだ推定。走らせて測ってはいない)**: `showBanner` は前のタイマーを消さない。隠密の不意打ちは `showDMMessage(…, 2600)` の `narrationHold` が手番を待たせるので、実プレイでは先の 2 本のタイマーが切れた後になる。EV-9 は DM の語りが無いので、「偽りの荷」(1600ms)と `ROUND 1`(850ms)の古いタイマーに `showAmbushStrike` のバナーが消されうる。§9-3 の実機で見る項目。`showBanner` は §3 の変更範囲の外なので今回は変えない。

**golden 7 本の基準(2026-11-10 09:02〜09:06 に実行。ログ = `C:\Users\PC_User\.claude\dev-loop\r114\item1\`)**

| ドライバ | 実測 | 所要 | §2-6 との比較 |
|---|---|---|---|
| `node tools/verify_hold_person.js` | 31/31 | 10 秒 | 同じ |
| `node tools/verify_enemy_traits.js` | 15/15 | 4 秒 | 同じ |
| `node tools/driver_sce1_events.js` | **211/214**(exit 1) | 48 秒 | 同じ。赤は (2) / (4d) / (N2-隣) の 3 件で、原因も §2-6 どおり(`sceneFlags` のキーが 5 本) |
| `node tools/verify_corner_check.js` | 20/20 | 81 秒 | 同じ |
| `node tools/verify_lore_check.js` | 26/26 | 4 秒 | 同じ |
| `node tools/verify_invisibility.js` | 27/27 | 27 秒 | 同じ |
| `node tools/driver_action_priority.js` | 92 PASSED | 65 秒 | 同じ |

時間帯: 上の 7 本は**昼(09 時台)に走らせた結果**。夜の走行は測っていない。

### 12-2. 本体

**入れた行(`index.html`・この項目のコミット後の行番号)**

| 行 | 何 |
|---|---|
| 24399 | 交戦の初期化 `e.__ambushOpen = false;`(24398 `e.stunned = 0;` の次) |
| 24645 | 手番ループ `ambushActorClass = ...`(`try {` の内側、`if (actor.kind === "player") {` の直前) |
| 28647-28681 | §4 のブロック(`AMBUSH_ROUND_ON` 28648 / `markAmbushOpen` 28658 / `isAmbushOpen` 28666 / `showAmbushStrike` 28668 / `isHelplessStrike` 28677) |
| 28687-28693 | `applySurpriseStun`(`stunned` を書く行 28690 は無変更 / `markAmbushOpen(indices);` 28692) |
| 35728 | `canSneakOnTarget` |

15 か所: 26274 / 30559 / 31049 / 31878 / 31952 / 33261 / 33430 / 33530(`t`)/ 33597(`t`)/ 34605 / 34698 / 35039 / 35841 / 35922 / 35981。

**ソースの計数(`py` のバイト数え)**: CRLF 45388 = LF 45388(+39 行)。`helpless = isHelplessStrike(` 15 件。コメントを除いた `helpless = (target|t).stunned > 0` は 0 件(コメントの 3 行 23175 / 31685 / 34048 は無変更)。

**煙検査(使い捨て・`C:\Users\PC_User\.claude\dev-loop\r114\item2\smoke.js`・22/22・pageerror 0 件・ログ = 同フォルダ `smoke.log`)**

本物の `applySurpriseStun` / `isAmbushOpen` / `isHelplessStrike` を呼んで確かめた。

- 非ボスの生存 2 体に `__ambushOpen` が付き、ボスと死体には付かない。`stunned` の付与は今までどおり(ボスにも付く)
- `encounterRound` が 2 の間は窓が閉じ、1 のときだけ非ボスで開く。付与時に `encounterRound` が古い値(7)でも問題なし
- バナーは最初の一撃の 1 回だけ。次の不意打ちでまた出る。文面は `ambushActorClass` が `"fighter"` で「不意の一撃」、`"rogue"` で「暗殺」。DOM の `battleBannerEl` にも書かれる
- `isHelplessStrike` は `stunned` を書き換えない
- `?ambushround=0`: 印もバナーも無し、`stunned` の付与は残り、sessionStorage へ写る
- 手番ループの代入: `?autoplay=15&diag=1` の実戦で約 23 秒後に `ambushActorClass === "cleric"`(仲間の手番)を観測した

**golden(2026-11-10 09 時台・昼に実行・ログ = 同フォルダ)**

| ドライバ | 実測 | §12-1 との比較 |
|---|---|---|
| `node tools/verify_hold_person.js` | 31/31((5a) 一致=true・着手前 79 行 / 現在 79 行・15 箇所) | 同じ |
| `node tools/verify_enemy_traits.js` | 15/15 | 同じ |
| `node tools/driver_sce1_events.js` | 211/214(exit 1) | 同じ。赤は (2) / (4d) / (N2-隣) の 3 件で、`item1` のログと行番号・文面とも一致 |

残りの 4 本(`verify_corner_check` / `verify_lore_check` / `verify_invisibility` / `driver_action_priority`)はこの項目の範囲外で、走らせていない。

**依頼書と違った点**

1. §4 のコードは、周囲に合わせて全行を 4 桁字下げして入れた。中身は同じ。
2. §6 の判定文の言い直しは、指示の 1001 行に加えて、同じ番号 (5a) で出る装置故障の枝(995 行)の文言にも当てた。`check` の判定条件には触っていない。
3. `tools/verify_hold_person.js` は LF のファイルだった(CRLF 0 / LF 1073)。LF のまま編集した。
4. 煙検査に「手番ループの実走」を足した(§5 の 1 行は読み込みだけでは通らないため)。受入の代わりにはしていない。
