# #19 行動の優先度 — 「雑魚にはスリープ / ボスにはファイアボール / 道中にはブレス」を指示できるようにする

- **起草**: 2026-08-23(計画窓) / **ステータス**: **承認済**(2026-08-23 ユーザー承認 —「判断は任せます」)
- **触るファイル**: `tavern.html` / `index.html` / `tools/driver_action_priority.js`(新規)
- ⛔ **触らないファイル**: なし。起草時点で `git status --porcelain` は**空**(HEAD = `2fe3b94`)。
  別窓の並走は検出されなかったが、**着手時にもう一度 `git status` を見ること**。
  並走が見つかったら `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

出発前に、パーティ各員へ **「この状況ではこの技を使ってほしい」** を指示できるようにする。
指示は**命令ではなく傾向**で、条件が合わなければ従来どおり別の手を打ってよい。

現状、行動選択は完全にコード側へ固定されている。プレイヤーは「どの技を装備するか」までは
決められるが、「**いつ**使うか」には一切関与できない。例えば魔法使いに雑魚戦でスリープを
使ってほしくても、`mageAI` の固定連鎖(§2-3)が「敵 2 体以上 & 50%」でしか撃たないため、
プレイヤーの意図は届かない。

**ユーザー決定(2026-08-23)**:

- **設置場所** = 「出発の準備」画面(`#prep`)のキャラクターパネル。
  ⭐ 不採用: マッチング演出(依頼時の添付画面)へ置く案。理由は §2-1 —
  **あの画面は「どこをタップしても出発」なので、選択 UI と操作が原理的に衝突する**。
- **「道中」の意味** = **探索フェーズ中に本当に詠唱させる**(新規フック)。
  ⭐ 不採用: 「戦闘 1R 目に優先」で済ませる案。歩きながら唱える絵にならないため。
- **効きの強さ** = **強め(条件が合えば 8 割くらいその技)**。
  ⭐ 不採用: 5 割案 / 3 段階を UI で選ばせる案(プルダウンが 2 列になり画面が混む)。
- **状況の枠** = **全般 / 雑魚 / ボス / 道中 の 4 枠**。未設定の枠は「全般」へ落ちる。
  ⭐ 不採用: 「ピンチ」枠の追加。既存の緊急回復(45% 未満で即発動)と二重になる。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. ⚠⚠⚠ 依頼時に添付された画面は「設定画面」ではない — 開示専用オーバーレイ

添付されたスクリーンショットは `playPartyMatchCinematic()`(`tavern.html:5834`)。
コード内コメントが自分でこう書いている:

```
// ⚠ 乱数・編成ロジックは一切触らない (開示専用)。
```

閉じる経路は `onTap` **ただ 1 つ**(`tavern.html:5877` 付近の `finishReveal` に
「閉じる唯一の経路は onTap」と明記)。つまり画面のどこを叩いても出発する。
ここへ `<select>` を置くと、**プルダウンを開こうとした指がそのまま出発を叩く**。

一方、その直後に開く **「出発の準備」画面**(`#prep` = `tavern.html:1935`)には既に:

| 要素 | 行 | 内容 |
|---|---|---|
| `#charTabs` | `tavern.html:1967` | キャラ切替タブ(主人公 + 仲間) |
| `#skillSection` | `tavern.html:2011` | スキル選択リスト |
| `#magicSection` | `tavern.html:2015` | 魔法(呪文スロット ±UI) |
| `renderCharLoadout()` | `tavern.html:5193` | 上記を `activeCharTab` で描き直す唯一の入口 |

⭐ **装備とスキルを決める場所が既にここにある。優先度もここへ置くのが正。**

### 2-2. 仲間は classKey で識別される(出発のたび NPC は引き直される)

`openPrep()` は毎回 `regeneratePartyMembers()` を呼ぶ(`tavern.html:4237` 付近、
コメント「Q3=A: 出発のたび再抽選」)。個体は毎回入れ替わる。

一方 `selection.partySkills` は **`{ classKey: [skillId,...] }`** というクラス別マップで、
`localStorage["dragonfighters.partySkills"]` に保存される(`tavern.html:4016`)。

→ **優先度も classKey をキーにする。** 個体キーにすると出発のたびに設定が消える。

### 2-3. 主人公と仲間で AI の作りが全く違う(呼び口の全数)

| 誰 | 決める関数 | ファイル:行 | 方式 |
|---|---|---|---|
| 主人公 | `pickLeaderAction(choices, ctx)` | `index.html:29030` | **重み付き抽選**(softmax 風) |
| 仲間(僧侶) | `clericAI(ally)` | `index.html:27250` | 固定 if 連鎖 |
| 仲間(魔法使い) | `mageAI(ally)` | `index.html:27345` | 固定 if 連鎖 |
| 仲間(ドワーフ) | `dwarfAI(ally)` | `index.html:27447` | 固定 if 連鎖 |
| 仲間(エルフ) | `elfAI(ally)` | `index.html:28251` | 固定 if 連鎖 |
| 仲間(盗賊) | `rogueAI(ally)` | `index.html:28899` | 固定 if 連鎖 |
| 仲間(戦士) | **無し** | — | ⚠ `allyAttackTurn` に warrior 分岐が無い |

⭐⭐⭐ **主人公側には「傾向」の仕組みが既にある。** `pickLeaderAction` は
`LEADER_W_ATK / W_HEAL / W_BUFF / W_BOSS / W_BASE`(`index.html:28996-29005`)で重みを作り、
`Math.random()` を**ちょうど 1 回**引いて選ぶ。本チケットはこれに倍率を 1 つ掛けるだけで済む。

**仲間側の確率ゲート本数**(実測: 各関数の行範囲で `Math.random() <` を数えた):

```bash
for r in "27250 27344 clericAI" "27345 27446 mageAI" "27447 27613 dwarfAI" \
         "28251 28360 elfAI" "28899 29010 rogueAI"; do set -- $r; \
  n=$(awk -v a=$1 -v b=$2 'NR>=a && NR<=b && /Math\.random\(\) </' index.html | wc -l); \
  echo "$3: $n"; done
```

| 関数 | 確率ゲート |
|---|---|
| `clericAI` | 3 本 |
| `mageAI` | 2 本 |
| `dwarfAI` | 9 本 |
| `elfAI` | 6 本 |
| `rogueAI` | **0 本**(完全に決定論) |
| **計** | **20 本** |

⚠ **確率ゲートを上げるだけでは足りない。** 例えばユーザーの挙げた「ボス→ファイアボール」は、
`mageAI` の攻撃呪文が**確率ゲートではなく `threatScore` の梯子**(`index.html:27416-27425`)で
選ばれるため、ゲートを触っても届かない。**先出しブロックが要る**(§5 STEP4-b)。

### 2-4. ⚠⚠⚠ 罠①: 重み倍率を **クランプの前**に掛けると黙って効かなくなる

`pickLeaderAction` の重み確定部(`index.html:29115-29118`、実測):

```js
if (!isFinite(w)) { nonFinite++; w = LEADER_W_FLOOR; }
w = Math.min(LEADER_W_MAX, Math.max(LEADER_W_FLOOR, w));
w = Math.pow(w, 1 / T);
```

`LEADER_W_MAX = 3`(`index.html:29005`)。倍率をこの `Math.min` より**前**に掛けると、
重みが既に 0.75 以上ある候補(= 実際に使いたい強い技ほど該当する)で**上限に張り付いて
倍率が丸ごと消える**。テストは「たまたま弱い技」でだけ緑になり、本命で無言に失敗する。

→ **倍率は `Math.min` の後・`Math.pow` の前に掛ける。** §8 の負のコントロール N1 で機械検査する。

⭐ RNG パリティ: 倍率は乗算だけなので `Math.random()` の消費回数は変わらない。
既存 `tools/driver_leader_ai.js` の **G2(抽選はちょうど 1 回消費)** は非退行のまま通る。

### 2-5. ⚠⚠⚠ 罠②: 戦闘開始時に **主人公のバフだけ**消える

エンカウント開始処理(`index.html:19578-19587`、実測):

```js
// プレイヤーのバフ・デバフもリセット
resetPlayerBuffs();
// 仲間の 1戦1回スキル使用記録 + クールダウンをリセット
for (const a of allies) {
  if (a.skillsUsedInEncounter) a.skillsUsedInEncounter.clear();
  if (a.skillCooldowns) a.skillCooldowns = {};
}
```

仲間ループには **`resetAllyBuffs(a)` が無い**。`resetAllyBuffs` の呼び口は
`index.html:19858`(戦闘**終了**時)の 1 箇所だけ。

→ **道中でブレスを唱えると、戦闘が始まった瞬間に主人公だけ祝福が剥がれ、仲間には乗ったまま**
という非対称が出る。プレイヤーには「主人公にだけ効かないバグ」に見える。

→ **道中で付与したバフは `resetPlayerBuffs()` の前後で退避・復元する**(§6 STEP6)。
`resetPlayerBuffs` 自体は触らない(もう 1 箇所 `index.html:19856` から呼ばれている)。

### 2-6. ⚠⚠⚠ 罠③: 「1戦1回」スキルを道中で唱えると使用記録が戦闘開始で消えて**実質 2 回撃てる**

上の引用のとおり、`a.skillsUsedInEncounter.clear()` は戦闘**開始**時に走る
(`index.html:19582`)。道中で `battle-roar` などを唱えると、戦闘が始まった時点で
記録が消え、戦闘中にもう一度撃てる。

→ **道中に選べるのは「呪文スロットを消費し、敵を対象に取らない呪文」だけ**にする。
呪文スロットは戦闘開始でリセットされない(`hasSpellSlot` = `index.html:12592`、
補充は勝利後の `index.html:19867-19881` のみ)。

該当 ID を全数で洗った結果 = **10 件**(`mpCost > 0` かつ `target` が敵でないもの):

| 職 | ID |
|---|---|
| 僧侶 | `bless` / `shield-of-faith` / `striking` / `cure-light-wounds` / `cure-moderate-wounds` / `cure-serious-wounds` / `cure-critical-wounds` |
| 魔法使い | `arcane-shield` |
| エルフ | `cure-minor` / `haste` |

⛔ 除外: `turn-undead`(敵対象) / 攻撃呪文すべて / `hunters-mark`(敵に烙印) /
戦士・ドワーフ・盗賊の全スキル(`mpCost` を持たない)。

→ **戦士・ドワーフ・盗賊は「道中」行が空になる。行ごと隠す。**

### 2-7. 仲間は戦闘外で一切行動しない(呼び口の全数)

```bash
grep -n "allyAttackTurn(" index.html
grep -n "exploreAllyTurn(" index.html
```

| 関数 | 定義 | 呼び口 |
|---|---|---|
| `allyAttackTurn` | `index.html:27144` | **`index.html:19795` の 1 箇所だけ**(戦闘ターンループ内) |
| `exploreAllyTurn` | `index.html:16954` | **`index.html:17439` の 1 箇所だけ**(主人公が 1 タイル進むたび) |

`exploreAllyTurn` の中身は「前の人がいたタイルへ 1 マス寄る」だけで、技は一切撃たない。

→ **道中詠唱のフックは `exploreAllyTurn` の中に置く。** 呼び口が 1 箇所なので、
「たまに呼ばれない」経路は原理的に存在しない。

### 2-8. ボス/雑魚の判定は既にある(ただし `evaluateThreat` のものは使わない)

```js
function isBossLikeDef(def) {
  return !!(def && (def.isBoss || def.eyeStalks || (def.maxSummons || 0) > 0));
}
```

`index.html:29016`。`window.isBossLikeDef` として**検証用に公開済み**(`index.html:29155`)。
`clericAI`(27250)と同じ兄弟スコープにあるので、仲間 AI から**そのまま呼べる**
(26900〜29040 の間に 2 スペース階層の閉じ括弧が 1 つも無いことを確認済み)。

⚠ 一方 `evaluateThreat()`(`index.html:27230`)が作る `hasBoss` は
**`maxSummons > 0` だけ**の別物で、しかも `score` に +20 するためだけに使われ、
**関数の外では一度も読まれていない**(`grep -n hasBoss` = 4 件すべて `evaluateThreat` 内)。

→ **雑魚/ボスの切り替えは `isBossLikeDef` を使う。`evaluateThreat().hasBoss` は使わない。**
既存コメント(`index.html:29013`)自身が「ボス判定式が別途 3 本あり意味論が違うので統合しない」
と書いているので、**統合もしない**。

### 2-9. 選択肢に出す技の母数(実測)

`tavern.html:3102-3184` の `*_SKILLS_UI` を数えた:

| 職 | 技数 | うち道中に選べる |
|---|---|---|
| 戦士 | 10 | 0 |
| 僧侶 | 8 | **7** |
| 魔法使い | 9 | 1 |
| ドワーフ | 12 | 0 |
| エルフ | 9 | 2 |
| 盗賊 | 7 | 0 |
| **計** | **55** | **10** |

⚠ プルダウンに出すのは**全 55 件ではなく「そのキャラが今その枠に入れている技」**
(`selection.partySkills[classKey]`、僧侶は `CLERIC_SLOTS_TABLE` の自動配分)。
装備していない技を指定できると、指示が永久に空振りする。

### 2-10. `<select>` はこのプロジェクト初(前例ゼロ)

```bash
grep -c "<select" tavern.html    # → 0
```

既存の選択 UI は全部「クリックできる `div` に `.selected` を付ける」方式
(`renderSkillItem` = `tavern.html:5147`)。`<select>` はプロジェクト初になる。

→ ユーザー指定どおり `<select>` を使う。iPhone ではネイティブピッカーが出るので
4 行 × 6 職ぶんの情報を最小面積に収められる。**既存のリスト UI は 1 行も触らない。**

### 2-11. changelog の要否

```bash
grep -n 'GAME_LOGIC' scripts/hooks/check_changelog.py
# 24: GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

**鳴る**(`index.html` と `tavern.html` の両方を触る)。
書けるプレイヤー向けの要約は実在する = 「仲間に行動の指示が出せるようになった」。§10 に文面あり。

### 2-12. 既存 golden(本チケットで壊しうるもの)を**この窓で実走**した

```bash
node tools/driver_leader_ai.js
# → [driver] RESULT: 42/42 passed        (2026-08-23 実測)
```

⭐ 基準の再現も取れている: `driver_leader_ai.js` の **G2** が
「pick 抽選が `Math.random` をちょうど 1 回だけ消費する」を測っている。
§2-4 の倍率は乗算のみなので、この本数は**変わってはいけない**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `selection.actionPriority` の追加(load/save)、`#actionPrioritySection` の DOM とレンダ、`TRAVEL_CASTABLE_IDS` |
| `index.html` | 優先度の読み込み、`pickLeaderAction` に倍率 1 行、`executeSkillOn` 抽出、仲間 AI の先出し 5 箇所、確率ゲート 20 本のラップ、道中詠唱、バフ退避/復元 |
| `tools/driver_action_priority.js` | 新規(受入条件・`--negative` 内蔵) |

⛔ **`audio.js` / `town.html` / `title.html` は開かない。**
⛔ **`実装依頼書/README.md` への行追加は §11 の文面を使う。**

### dev-loop で 4 項目に割るなら

| 項目 | 範囲 | 中身 |
|---|---|---|
| ① | STEP1 + STEP2 | 酒場のデータ + UI。**ドライバの骨組みと空セクション**も作り、受入条件 §6 を 1 本通す |
| ② | STEP3 + STEP4-a | index 側の読み込み + `apSituationNow`/`apPreferredId` + 主人公の倍率。受入条件 §0/§1 |
| ③ | STEP4-b + STEP4-c | `executeSkillOn` 抽出 + 仲間の先出し + ゲート 20 本。受入条件 §2 |
| ④ | STEP5〜STEP7 | 道中詠唱 + バフ退避 + 撤退スイッチ。受入条件 §3/§4/§5 + **既存 golden 非退行** + §12 |

⭐ **changelog は ① の時点で 1 行入れておく**(①〜④ すべてが本番ファイルを触るので、
最初のコミットで入れておかないと ① がフックに止められる)。
⛔ ①〜④ を**別々の窓へ配らない**(1 つの依頼書は 1 窓だけが回す)。

---

## 4. STEP1 — 酒場側のデータと保存

### STEP1-1. 状況キーと道中許可リストを定義する

`tavern.html`、`SKILL_SLOT_LIMIT`(`tavern.html:3184` 付近)の直後に置く:

```js
// ── 行動の優先度 (実装依頼書 #19) ──
// 状況キー。UI の行順もこの順。"general" は他 3 つが未設定のときの落とし先。
const AP_SITUATIONS = [
  { key: "general", label: "全般", hint: "下の 3 つが未設定のときに使う" },
  { key: "mob",     label: "雑魚", hint: "ボス格がいない戦闘" },
  { key: "boss",    label: "ボス", hint: "ボス格が 1 体でもいる戦闘" },
  { key: "travel",  label: "道中", hint: "探索フェーズ (歩いている間)" },
];
// ⚠⚠⚠ 道中に唱えられるのは「呪文スロットを消費し、敵を対象に取らない呪文」だけ。
//   1戦1回スキル (battle-roar 等) を許すと、戦闘開始の
//   `a.skillsUsedInEncounter.clear()` (index.html:19582) で使用記録が消え、
//   同じ戦闘でもう一度撃てる = 実質2回撃てる抜け道になる。
//   ⚠ このリストは index.html 側と **完全に一致していなければならない** (二重定義)。
//     ドライバ §0b が両者の突合を機械検査する。
const TRAVEL_CASTABLE_IDS = [
  "bless", "shield-of-faith", "striking",
  "cure-light-wounds", "cure-moderate-wounds", "cure-serious-wounds", "cure-critical-wounds",
  "arcane-shield",
  "cure-minor", "haste",
];
```

### STEP1-2. `selection.actionPriority` を load/save に足す

`loadSelections()`(`tavern.html:3922`)へ。`partySkills` の作り方(`tavern.html:3930`)に倣う:

```js
// 行動の優先度 { classKey: { general, mob, boss, travel } }。値は skillId または null。
const actionPriority = {};
for (const slot of PARTY_SLOTS) {
  if (slot) actionPriority[slot.classKey] = { general: null, mob: null, boss: null, travel: null };
}
try {
  const apRaw = localStorage.getItem("dragonfighters.actionPriority");
  if (apRaw) {
    const parsed = JSON.parse(apRaw) || {};
    for (const slot of PARTY_SLOTS) {
      if (!slot) continue;
      const src = parsed[slot.classKey];
      if (!src) continue;
      // ⚠ skillPool に無い ID は捨てる (旧セーブ / 手書き改変への耐性。partySkills:3978 と同じ作法)
      const validIds = new Set(slot.skillPool.map(sk => sk.id));
      for (const s of AP_SITUATIONS) {
        const v = src[s.key];
        if (typeof v === "string" && validIds.has(v)) actionPriority[slot.classKey][s.key] = v;
      }
    }
  }
} catch (e) { /* 壊れていたら既定 (全部 null) のまま */ }
```

`return` 文(`tavern.html:4007`)に `actionPriority` を足す。
`saveSelections()`(`tavern.html:4011`)へ 1 行:

```js
localStorage.setItem("dragonfighters.actionPriority", JSON.stringify(selection.actionPriority));
```

⛔ **`dragonfighters.partySkills` の形も名前も 1 文字も変えない。**

---

## 5. STEP2〜STEP4 — 酒場の UI と、主人公・仲間への反映

### STEP2. 「出発の準備」画面へ優先度セクションを追加

`tavern.html:2018`(`#magicSection` の `</div>` の直後)へ:

```html
<div class="equipGroup" id="actionPrioritySection">
  <div class="equipLabel">🎯 行動の優先度
    <span id="apHint" style="opacity:0.55;font-size:11px;font-style:italic;"></span>
  </div>
  <div class="apRows" id="apRows"></div>
</div>
```

`renderCharLoadout()`(`tavern.html:5193`)の末尾(スキルカウンタ更新の後)から呼ぶ
`renderActionPriority()` を新設する。要件:

- `AP_SITUATIONS` の 4 行を `<label>` + `<select>` で描く。`select` の id は
  **`apSel_<classKey>_<situationKey>`**(例 `apSel_mage_boss`)。
- 選択肢 = `[{ value:"", label:"おまかせ" }]` +
  **今そのキャラが枠に入れている技**。母集団の作り方は既存の 2 本をそのまま流用する:
  - 僧侶(自動配分職) … `CLERIC_SLOTS_TABLE`(`tavern.html:3667`)から現 Lv で残数 > 0 の呪文
  - それ以外 … `selection.partySkills[classKey]`
  - どちらも `slot.skillPool` から `name` を引く(`tavern.html:3757` の `find` と同じ)
- **道中の行だけ** `TRAVEL_CASTABLE_IDS` で絞る。**候補が 0 件ならその行ごと `display:none`**。
  (戦士・ドワーフ・盗賊は必ず 0 件 = §2-6)
- `change` で `selection.actionPriority[classKey][key] = value || null` → `saveSelections()`。
  ⛔ **`renderCharLoadout()` を再帰で呼ばない**(select が閉じた直後に作り直されて選べなくなる)。
- 保存済みの ID が現在の候補に無い(装備を外した等)なら **「おまかせ」を選択状態にし、
  値も `null` へ書き戻す**。黙って古い ID を残さない。
- `#apHint` の文言 = 「指示は**傾向**です。射程やスロットが足りなければ別の手を打ちます」。

⚠ **既存の `.skillItem` / `.equipList` の CSS は 1 行も触らない。** 新規 class は
`.apRows` / `.apRow` / `.apSel` のみ。`.apSel` は `width:100%; max-width:260px` 程度で、
iPhone(compact)でも横スクロールを起こさないこと。

### STEP3. index.html 側で読み込む + 状況を判定する

`loadPersistentProgress()`(`index.html:11729-11751`)の返却へ 1 行足す
(`partySkills:` の隣、`index.html:11740`):

```js
actionPriority: localStorage.getItem("dragonfighters.actionPriority"),
```

そのうえで `isBossLikeDef`(`index.html:29016`)と**同じ兄弟スコープ**に置く
(⚠ `clericAI` から呼ぶので、`runEncounter` の内側に書くと ReferenceError になる —
`index.html:29010` のコメントが同じ罠を記録している):

```js
// ── 行動の優先度 (実装依頼書 #19) ──
// 酒場で指定した「傾向」。命令ではないので、射程・スロット・緊急回復などの
// 既存条件は一切曲げない。曲げるのは「候補の重み」と「先出しするかどうか」だけ。
const ACTION_PRIORITY_ON = (function () {
  try { return new URLSearchParams(window.location.search).get("actionpri") !== "0"; }
  catch (e) { return true; }
})();
const AP_BOOST = 4.0;   // 主人公の重み倍率 (§2-4: クランプの後に掛ける)
const AP_P     = 0.8;   // 仲間の先出し確率 / 確率ゲートの引き上げ先
// ⚠ tavern.html の TRAVEL_CASTABLE_IDS と完全一致させること (二重定義)。
const AP_TRAVEL_CASTABLE = new Set([
  "bless", "shield-of-faith", "striking",
  "cure-light-wounds", "cure-moderate-wounds", "cure-serious-wounds", "cure-critical-wounds",
  "arcane-shield",
  "cure-minor", "haste",
]);
let actionPriorityMap = null;   // { classKey: {general,mob,boss,travel} }
try { actionPriorityMap = JSON.parse(persistent.actionPriority || "null"); } catch (e) {}

// 今この瞬間が「ボス戦」か。⚠ evaluateThreat().hasBoss は maxSummons だけの別物なので使わない (§2-8)。
function apSituationNow() {
  if (!encounterActive) return "travel";
  for (const i of encounterEnemyIndices) {
    const e = enemies[i];
    if (e && e.alive && isBossLikeDef(e.def)) return "boss";
  }
  return "mob";
}
// 指定された skillId。無ければ general へ落ち、それも無ければ null。
function apPreferredId(classKey, situation) {
  if (!ACTION_PRIORITY_ON || !actionPriorityMap) return null;
  const row = actionPriorityMap[classKey];
  if (!row) return null;
  return row[situation] || row.general || null;
}
// 確率ゲートの引き上げ。⭐ 上げるだけで、下げない = 指定していない技の挙動は 1 も変わらない。
function apGateP(unit, skillId, base) {
  const cls = (unit && unit.classKey) || null;
  if (!cls) return base;
  return (apPreferredId(cls, apSituationNow()) === skillId) ? Math.max(base, AP_P) : base;
}
if (typeof window !== "undefined") {
  window.apSituationNow     = apSituationNow;
  window.apPreferredId      = apPreferredId;
  window.apGateP            = apGateP;
  window.AP_TRAVEL_CASTABLE = AP_TRAVEL_CASTABLE;
  window.ACTION_PRIORITY_ON = ACTION_PRIORITY_ON;
  window.AP_BOOST           = AP_BOOST;
  window.AP_P               = AP_P;
}
```

⚠ **classic script 直下の `const`/`function` は `window` に自動で載らない**ので、
検証シームは上のとおり明示公開する(先例 = `window.pickLeaderAction`)。

### STEP4-a. 主人公 — `pickLeaderAction` に倍率 1 行

`index.html:29116`(`w = Math.min(LEADER_W_MAX, ...)` の行)の**直後**、
`w = Math.pow(w, 1 / T);` の**直前**に挿す:

```js
// ★#19 行動の優先度。⚠⚠⚠ この行は必ず Math.min(LEADER_W_MAX,...) の **後** に置く。
//   前に置くと LEADER_W_MAX=3 に張り付いて倍率が丸ごと消え、弱い技でだけテストが緑になる。
if (apPrefId && id === apPrefId) w *= AP_BOOST;
```

`apPrefId` はループの外(`const T = ...` の隣)で 1 回だけ引く:

```js
const apPrefId = apPreferredId(leaderClassKey, apSituationNow());
```

⛔ **`LEADER_PICK_T` / `LEADER_W_*` の既存値は 1 つも動かさない**(`index.html:28996-29005`)。
⛔ **`Math.random()` の呼び出し位置と回数は動かさない**(`driver_leader_ai.js` G2)。

### STEP4-b. 仲間 — 「先出し」を 1 段だけ足す(書き込み点は 1 つに畳む)

まず `executeLeaderSkill`(`index.html:18026-18161`)の本体を
**ユニット非依存の `executeSkillOn(actor, classKey, skillId, targetIdx)` へ抽出**する。

- 機械的な置換は 1 つだけ: 本体中の **`leaderClassKey` → 引数 `classKey`**。
- `executeLeaderSkill(skillId, targetIdx)` は
  `executeSkillOn(makeLeaderActor(), leaderClassKey, skillId, targetIdx)` を呼ぶ薄い皮にし、
  `finally { syncLeaderFromActor(actor) }` は **リーダー経路だけ**に残す。
- ⚠ `classKey === "warrior"` の枝は `executeWarriorSkill`(リーダー専用)を呼ぶので、
  **リーダー以外から来たときは何もせず false を返す**。
  §2-3 のとおり仲間の戦士には AI 分岐が無く、ここへ来る経路も無い。
- ⚠ 抽出後、`playerSingleAttack(targetIdx)` へのフォールバックが**仲間経路で暴発しない**こと。
  仲間から来たときは「何もせず false」で戻し、呼び元(`apTryPreferred`)が従来の連鎖へ落とす。

そのうえで、5 つの class AI の**先頭**(アンチマジックのガード 2 本の直後、既存の「1.」の前)へ
**同じ 1 行**を入れる:

```js
// ★#19 行動の優先度: 指定された技を「まず 1 回だけ」試す。撃てない (スロット切れ /
//   射程外 / 対象なし / 既にバフ済) なら黙って従来の連鎖へ落ちる。
//   AP_P の確率でしか先出ししないので「たまに違う行動をする」が保たれる。
if (await apTryPreferred(ally)) return true;
```

`apTryPreferred(unit)` の要件(`executeSkillOn` の隣に置く):

1. `ACTION_PRIORITY_ON` が false / 指定なし → `false`
2. `unit.equippedSkills.includes(id)` でない → `false`
   (⚠ 僧侶は自動配分なので `equippedSkills` = `spellSlots` のキー集合 = `index.html:12643`)
3. `sk.mpCost && !hasSpellSlot(unit, id)` → `false`
4. `sk.oncePerEncounter && unit.skillsUsedInEncounter.has(id)` → `false`
5. `sk.cooldown && (unit.skillCooldowns[id]||0) > 0` → `false`
6. **既に効いているバフは撃たない**(既存 `index.html:29285-29289` の除外条件をそのまま使う:
   `sk.acBonusAmount && unit.buffs.acBonusRemaining > 0` 等)
7. `Math.random() >= AP_P` → `false`(⭐ ここが「たまに外れる」の唯一の出所)
8. 敵対象の技なら `pickClosestEngagedEnemyFromAlly(unit)` が `>= 0` であること。
   射程外なら **撃たずに `false`**(既存の各 `ally*` 関数が持つ「射程外なら前進」は流用しない
   — 前進で手番を潰すと「指示したのに何もしない」に見える)
9. すべて通ったら `await executeSkillOn(unit, unit.classKey, id, tgtIdx); return true;`

⛔ **既存の if 連鎖の順序・閾値・確率は 1 つも書き換えない。**
唯一の例外が次の STEP4-c。

### STEP4-c. 仲間 — 既存の確率ゲート 20 本をラップする

`clericAI` 3 / `mageAI` 2 / `dwarfAI` 9 / `elfAI` 6 の計 **20 本**(§2-3 の表)を、
**機械的に**こう置き換える:

```diff
-  if (... && Math.random() < 0.5) {
+  if (... && Math.random() < apGateP(ally, "bless", 0.5)) {
```

- 第 2 引数は**そのブロックが撃つ技の ID**。
- `apGateP` は `Math.max(base, AP_P)` なので **上げるだけ**。
  指定していない技では `base` がそのまま返り、**挙動は 1 ビットも変わらない**。
- ⛔ `rogueAI` は確率ゲート 0 本なので**触らない**(先出しだけが効く)。
- ⛔ `Math.random()` の**呼び出し回数と順序は変えない**(引数の評価だけを差し替える)。

---

## 6. STEP5〜STEP7 — 道中詠唱

### STEP5. 探索フェーズで唱えさせる

`exploreAllyTurn`(`index.html:16954`)の中、各 ally の 1 マス追従が終わった直後へ:

```js
// ★#19 道中詠唱。呼び口は index.html:17439 の 1 箇所だけなので取りこぼしは起きない。
if (ACTION_PRIORITY_ON) await apTryTravelCast(ally);
```

`apTryTravelCast(ally)` の発動条件(**全部 AND**):

| # | 条件 | 根拠 |
|---|---|---|
| 1 | `apPreferredId(ally.classKey, "travel")` が非 null | 指定がある |
| 2 | `AP_TRAVEL_CASTABLE.has(id)` | §2-6 の抜け道封じ。**UI 側と二重に守る** |
| 3 | `currentPhase === "explore"` かつ `!encounterActive && !encounterRunning` | 探索中だけ |
| 4 | `hasSpellSlot(ally, id)` | スロット残 |
| 5 | 効果が未適用(バフ系 = 該当 `*Remaining <= 0` / 回復系 = `findLowestHpPartyMember().ratio < 0.75`) | 無駄打ち防止 |
| 6 | **敵に見つかっている**: 生存敵に `state === "alert"` または `"chase"` が 1 体以上 | 「戦いが近い」= 唱える価値がある。⭐ これが無いと歩くたびにスロットを溶かす |
| 7 | `apTravelCastDone` に `${allyIdx}:${id}` が無い | 1 接敵につき 1 回 |

- `apTravelCastDone` は `Set<string>`。**クリアは戦闘終了時の 1 箇所だけ**
  (`index.html:19858` の `resetAllyBuffs` ループの直後)。
  戦闘が終われば交戦敵は全滅しているので条件 6 が自然に落ち、次の接敵で再武装される。
- 発動したら `await executeSkillOn(ally, ally.classKey, id, -1)`。
- ⛔ **主人公は道中詠唱しない**(`heroAI` は 1 タイル前進の同期ループで、
  そこに `await` を挟むと前進が止まる)。§11 に明記。

### STEP6. ⚠⚠⚠ 道中バフを戦闘開始のリセットから守る

`index.html:19579` の `resetPlayerBuffs();` を**3 行に置き換える**
(⛔ `resetPlayerBuffs` 本体は触らない — `index.html:19856` からも呼ばれている):

```js
// ★#19 ⚠⚠⚠ 道中で受けたバフはここで消さない。
//   この直下の仲間ループは skillsUsedInEncounter しかクリアしないので (resetAllyBuffs の
//   呼び口は戦闘終了時の 1 箇所だけ)、素直にリセットすると
//   **主人公だけ祝福が剥がれ、仲間には乗ったまま** という非対称が出る。
const __apKeep = apCaptureTravelBuffs();   // ?actionpri=0 なら null
resetPlayerBuffs();
if (__apKeep) apRestoreTravelBuffs(__apKeep);
```

- `apCaptureTravelBuffs()` は **道中詠唱で付いたぶんだけ**を退避する。
  そのために `apTryTravelCast` は付与の直前に `playerBuffs.__apTravel = true` を立て、
  `apCaptureTravelBuffs` は `__apTravel` が立っているときだけ
  `atkBonusRemaining / atkBonusAmount / blessMoveRemaining / acBonusRemaining /
  strikingRemaining / strikingDie / hastedRemaining` を写し取る。
- `apRestoreTravelBuffs` は `Math.max(現在値, 退避値)` で戻す(既存 `allyBless` と同じ作法)。
- 戦闘**終了**時(`index.html:19856-19859`)では従来どおり全部消す。`__apTravel` も落とす。

### STEP7. `?actionpri=0` を両ページへ

- `index.html` … `ACTION_PRIORITY_ON`(STEP3)。false なら
  倍率・先出し・ゲート引き上げ・道中詠唱・バフ退避が**全部** no-op。
- `tavern.html` … 同じクエリを見て `#actionPrioritySection` を `display:none` にする。
  ⚠ **保存済みの値は消さない**(スイッチを外せば戻る)。

---

## 7. 撤退スイッチ

- **`?actionpri=0`** — 優先度の指定が一切効かなくなり、AI は現行(#19 前)の挙動へ戻る。
  酒場では設定欄そのものが消える。
- **判定位置**: `index.html` = `ACTION_PRIORITY_ON`(STEP3、スクリプト冒頭で 1 回)。
  `tavern.html` = `renderActionPriority()` の先頭。
- **ページ遷移をまたぐか**: またがない。**各ページが独立に読む**。
  `sessionStorage` へ写す作法は要らない(先例 = `?heromark=0`)。

---

## 8. 受入条件 — `tools/driver_action_priority.js`(新規)

実 Chrome を `puppeteer-core` で直駆動し、http サーバで配信する
(流用元 = `tools/driver_leader_ai.js` = サーバ + 負のコントロール内蔵型)。

観測するのは **「指定した技のシェアが上がったか」** と **「指定していない技の挙動が
1 ビットも変わっていないか」** の 2 つ。⭐ **具体的な発動率の数値そのものは測らない**
(末尾「測らないこと」)。

### ⚠ 計測機構

- 主人公側は `window.pickLeaderAction` を**多数回**(≥ 3000)呼んで id の分布を採る。
  `driver_leader_ai.js` の G3/G4 と同じ形。
- 仲間側は `executeSkillOn` を**ラップして呼び出しログを採る**。
  ⭐⭐ ラッパは **配信スナップショットへ実行時に注入**する(本番ファイルに計測シームを置かない
  — CLAUDE.md の changelog ガードと「プレイヤーに見える変化のない本番改変」を避けるため)。
- `localStorage["dragonfighters.actionPriority"]` はドライバが直接書いてから遷移する。
- ⭐⭐ **配信バイトの凍結を装置に内蔵**する(別窓の並走で汚れないように)。

### §0 装置(先に母集団を確かめる)

- **(0a)** `window.apPreferredId("mage","boss")` が仕込んだ ID を返す。
  ⭐⭐⭐ **これが null のまま全 assert が緑になるのが最悪の空振り。**
- **(0b)** **二重定義の突合**: `tavern.html` の `TRAVEL_CASTABLE_IDS` と
  `index.html` の `window.AP_TRAVEL_CASTABLE` が**集合として完全一致**(10 件)。
  ⚠ 片方に足してもう片方を忘れると、酒場で選べるのに一生唱えない技ができる。
- **(0c)** ラッパが `executeSkillOn` を 1 回以上捕まえている(ログが空でない)。
- **(0d)** 道中テストで「敵が `alert`/`chase` になった」瞬間が 1 回以上ある
  (条件 6 が一度も真にならないと、道中の assert は全部空振りする)。

### §1 主人公 — 重み倍率がクランプに食われていない

- **(1a)** 僧侶リーダー・`boss` 指定 = `bless` で、**ボス格を対象にしたとき**の
  `bless` のシェアが、指定なしのときより**有意に高い**(3000 回・両側で比較)。
- **(1b)** ⭐ **2 経路で突き合わせる**: 上のシェア差が、
  `w_pref / w_none ≈ AP_BOOST^(1/T)` から**独立に計算した期待シェア**と一致する
  (許容 ±0.05)。ドライバ側で重みを再実装せず、**`AP_BOOST` と `LEADER_PICK_T` を
  ページから読んで**式に入れる(写経しない)。
- **(1c)** **クランプ後に掛かっている証拠**: 素の重みが `LEADER_W_MAX`(=3)に
  張り付く候補(高 EV の攻撃技)を指定しても、シェアが上がる。
  ⚠⚠⚠ **ここが §2-4 の罠の本丸。** N1 で赤くなることまで確かめる。
- **(1d)** RNG パリティ: `pickLeaderAction` 1 回あたりの `Math.random()` 消費が
  **ちょうど 1 回**(`driver_leader_ai.js` G2 と同じ測り方)。

### §2 仲間 — 先出しが効き、指定外は不変

- **(2a)** 魔法使い仲間・`boss` = `fireball` 指定で、ボス戦の 1 手目に
  `fireball` が出る回数が指定なしより増える。
  ⚠ **`threatScore` の梯子(`index.html:27416`)を素通りできているか**がここの本質。
- **(2b)** 盗賊(確率ゲート 0 本)でも先出しが効く。
- **(2c)** **指定外の非退行**: 指定を `null` にしたとき、`window.apGateP` の返り値が
  20 箇所すべての `base` 値(0.3/0.35/0.4/0.5/0.6/0.7)で **`base` と厳密に等しい**。
- **(2d)** 戦士の仲間には AI 分岐が無い(§2-3)。`apTryPreferred` を呼んでも
  **`executeSkillOn` は 1 回も呼ばれない**(warrior 枝のリーダー限定ガード)。

### §3 道中詠唱

- **(3a)** 僧侶仲間・`travel` = `bless` で、**探索フェーズ中に** `bless` が発動する
  (ログに `phase:"explore"` の記録が 1 件以上)。
- **(3b)** 敵が `idle` しかいない間は**一度も**発動しない(条件 6)。
- **(3c)** 1 回の接敵で **2 回以上は撃たない**(条件 7 のラッチ)。
- **(3d)** ⛔ 抜け道封じ: `travel` に `battle-roar`(1戦1回)を
  `localStorage` へ**手で書き込んでも**発動しない(`AP_TRAVEL_CASTABLE` の 2 重ガード)。
  ⭐ §2-6 の罠の機械検査。

### §4 バフ退避(§2-5 の罠)

- **(4a)** 道中ブレスの後に戦闘が始まったとき、**主人公と仲間で
  `atkBonusRemaining > 0` が一致する**。
  ⚠⚠⚠ 片方だけ見ると、退避を外しても仲間側だけで緑になる。**必ず両方を突き合わせる。**
- **(4b)** 道中詠唱をしていない戦闘では、開始時の `playerBuffs` が**従来どおり全部 0**
  (退避が「常時バフ持ち越し」に化けていない)。

### §5 撤退

- **(5a)** `index.html?actionpri=0` … 指定を入れても `apPreferredId` が null を返し、
  §1〜§4 の assert が**すべて現行値**に戻る。
- **(5b)** `tavern.html?actionpri=0` … `#actionPrioritySection` が非表示。
  かつ `localStorage["dragonfighters.actionPriority"]` の**中身が消えていない**。

### §6 酒場 UI

- **(6a)** 6 職すべてでタブを切り替え、`apSel_<classKey>_<sit>` が
  **general/mob/boss は 6 職すべてで存在**、travel は
  **僧侶・魔法使い・エルフのみ表示、戦士・ドワーフ・盗賊は非表示**(§2-9 の表と突合)。
- **(6b)** 装備していない技は選択肢に**出ない**。
- **(6c)** 指定した技の装備を外して再描画すると「おまかせ」へ戻り、
  `localStorage` の値も `null` になっている。
- **(6d)** compact(iPhone 幅)で `#apRows` が**横スクロールを起こさない**
  (`scrollWidth <= clientWidth`)。

### ⛔ 測らないこと

- **`AP_BOOST` / `AP_P` の具体的な数値**。「8 割くらい」は体感で調整する余地を残す。
  assert は**方向(増えた)と整合(式と一致)**だけを見る。
- 各技の発動率の絶対値。既存 AI の閾値は本チケットで動かさないので、そこは既存の担当。
- 道中詠唱の演出(`dfPlayCast` の陣・SE)。目で見る(§9)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| **N1** | `w *= AP_BOOST` を `Math.min(LEADER_W_MAX,...)` の**前**へ移す(§2-4 の罠) | (1c) |
| **N2** | `apGateP` を `Math.min(base, AP_P)` にする(上げずに下げる) | (2c) |
| **N3** | `apTryPreferred` の `equippedSkills` チェックを外す | (6b) 相当 = 未装備の技が発動 |
| **N4** | `AP_TRAVEL_CASTABLE` のガードを片方(index 側)だけ外す(§2-6 の罠) | (3d) |
| **N5** | `apCaptureTravelBuffs` / `apRestoreTravelBuffs` を no-op にする(§2-5 の罠) | (4a) |
| **N6** | `apTravelCastDone` のラッチを外す | (3c) |

⭐ **N1 / N4 / N5 が §2 の 3 つの罠の再現**。この 3 本が赤くならなければ実装は信用できない。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/driver_leader_ai.js` → **42/42**(⭐ **2026-08-23 にこの窓で実走して確認済み**)
- `node tools/verify_recruit_size.js` → 82/82(酒場 `#prep` の DOM を触るため)
- `node tools/verify_title_screen.js` → 83/83(`loadSelections`/`saveSelections` を触るため)
- `node tools/driver_grid_s2.js` → 93/93(仲間の手番ループを触るため)

⚠ 上の基準値は 2026-08-23 時点の記録(`driver_leader_ai.js` **以外は再走行していない**)。
**走らせて違ったら、期待値を書き換える前に理由を突き止める。**

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ **ローカルは http 起動が必須**(`file://` だと音が出ない)。

1. 魔法使いに「雑魚→スリープ / ボス→ファイアボール」を指定して廃坑を 2 周する。
   **雑魚戦で本当にスリープが目立って増えたか**、ボス戦でファイアボールが飛ぶか。
2. 僧侶に「道中→ブレス」を指定する。**接敵の直前に足元の魔法陣が出て、
   戦闘 1R 目に主人公と仲間の両方へ +1d4 が乗っているか**(§2-5 の罠の目視確認)。
3. 「たまに違う行動をする」が**息苦しくない範囲か**。8 割が強すぎる/弱すぎると感じたら
   `AP_P` / `AP_BOOST` を目で調整する(assert は縛っていない)。
4. iPhone(compact)で 4 行のプルダウンが読めるか、ネイティブピッカーが出るか。

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>仲間に戦い方を指示できるようになった</b> — 出発の準備で「雑魚にはスリープ、ボスにはファイアボール」のように技の優先度を決められる。僧侶なら道中に祝福をかけさせることもできる。"
```

---

## 11. やらないこと

- ⛔ **マッチング演出(`playPartyMatchCinematic`)への UI 追加**。§2-1 のとおり操作が衝突する。
  現在の設定を「読み取り専用の 1 行」で出す案も**今回は入れない**(別チケット)。
- ⛔ **NPC 戦士の AI 追加**。§2-3 のとおり `allyAttackTurn` に warrior 分岐が無い。
  仲間の戦士は通常攻撃とカウンターのみで、優先度は**主人公が戦士のときだけ**効く。
  UI にその旨のヒントを出すのも別チケット。
- ⛔ **主人公の道中詠唱**。`heroAI` は 1 タイル前進の同期ループで、`await` を挟むと前進が止まる。
- ⛔ **既存 AI の閾値・優先順序の調整**(`threat.score >= 10` 等)。今回は**上げるだけ**。
- ⛔ **`evaluateThreat().hasBoss` の修正 / ボス判定 3 本の統合**。
  `index.html:29013` のコメントが「意味論が違うので統合しない」と明記している。既知の別案件。
- ⛔ **`?actionpri` の sessionStorage 引き継ぎ**。§7 のとおりページ単位で完結する。
- ⛔ **`実装依頼書/README.md` の #19 行の追加は起草窓が済ませた**(並走窓が無いため保留不要)。
  実装窓がやるのは**ステータスと進行度の更新だけ**(`**承認済** → **完了 <hash>**` / `0% → 100%`)。

---

## 12. 実装結果

(実装窓が埋める)
