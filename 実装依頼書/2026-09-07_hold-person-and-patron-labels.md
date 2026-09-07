# #57 僧侶にホールド・パーソン + 酒場の卓の 4 人の頭上に職業と名前

- **起草**: 2026-09-07(計画窓) / **ステータス**: **承認済**(2026-09-07 ユーザー承認)
- **会議**: `dev-meetings/2026-09-07_hold-person-and-patron-labels.md`(第1段の合意 + 第2段の開発計画書 + VFX 決裁)
- **VFX モックアップ**: https://claude.ai/code/artifact/efe9b999-ff00-4613-aad4-68072b5fb325
  (4 案を実機と同じ 96px タイル・実物のオークのスプライトに乗せて提示 → **案 IV「聖印の檻」で決裁**)
- **触るファイル**: `index.html` / `tavern.html` / `tools/verify_hold_person.js`(新規)
- ✅ **着手可能**(2026-09-07 実測)。`git status` = クリーン(会議記録の未追跡 1 件のみ)/
  `git log origin/main..HEAD` = **0 本** ⇒ **並走窓なし**。`origin/main` = `d36937a`。
  ⛔ 触らないファイルの指定は**無し**(相手が居ないため)。ただし `git add .` は禁止・**ファイル単位 add**。

---

## 1. 目的

**(A) 僧侶が生者に対して何もできない。** `CLERIC_SKILLS` は 8 個あるが、**敵を対象に取るのは
`turn-undead` 1 個だけ**で、しかもアンデッド限定(§2-2)。オーク・盗賊・リザードフォークが
相手のとき、僧侶は**回復とバフしか撃たない置物**になっている。

**(B) 酒場の卓の 4 人が誰なのか、話しかけるまで分からない。** #54 で「声を掛けて仲間にする」が
入ったが、4 人の職業と名前は `todaysPatrons` に**実行時に確定しているのに画面に出ていない**。
誰を誘うか決めるのに**毎回 4 人を歩いて回らされる**。しかも卓の顔ぶれは毎回引き直されるので、
**前回の記憶が使えない**(§2-8)。

**ユーザー決定(2026-09-07)**:

- ⭐ **単体・4 ターン・長射程(`long` = 12 タイル)**
  ⭐ 不採用 = 「隣接 2 体まで・2 ターン」(スリープ 2x2/2T と守備範囲がかぶり、
  「魔法使いが居れば僧侶の枠は要らない」になる)
- ⭐ **麻痺中の敵への自動クリティカルは入れる(演出込み 1 セット)**
  ⚠ ただし §2-3 の実測で **これは既に出荷済**と判明。残る仕事は表示の言い分けだけになった
- ⭐ **VFX は案 IV「聖印の檻」**(環 2 本 + 足元の回る魔法陣 + 天へ伸びる光条 / 金色)
  ⚠⚠ **提示時に明示した弱点を了解のうえの決裁** = ① 4 案中 iOS 負荷が最大 ②
  暗所で光が強すぎて敵が読みにくくなる可能性。⛔ **作り直しで対処しない。最初から
  調整できる形で入れる**(同時本数の上限 + 光量を 1 か所のレバーに)
  ⭐ 不採用 = I 二重の環(安全だが地味)/ II 螺旋の縛鎖(「止まっている」情報が弱い)/
  III 拘束の枷(静止画でも成立するが地味)
- ⭐ **頭上札は「職業 + 名前」だけ**。⛔ Lv は出さない(出発時に `assignCompanionLevels()` が
  確定するので酒場の表示が嘘になる)。⛔ 性格も出さない(対話ダイアログの見せ場を残す)
- ⭐ **約束済みの相手には 🤝 を足す**

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⭐ **この節が依頼書の価値の大半。開発計画書の主張を信じずに当て直した結果、6 件が崩れた。**

### 2-1. 参照先(⚠ 行番号は動く。**識別子で引くこと**。参考行は `d36937a` 時点)

| 引く識別子(`grep -n` の当て先) | ファイル | 何 | 参考行 |
|---|---|---|---|
| `const CLERIC_SKILLS = {` | index.html | 僧侶の呪文定義(現在 **8 個**) | 21243 |
| `const CLERIC_SLOTS_TABLE = {` | index.html | Lv 別使用回数表。⭐ 末尾に**「将来呪文を追加する場合はここに追記」**とある | 12333 |
| `const DEFAULT_KNOWN = {` | index.html | 初期習得。`cleric: [...]` は 3 個 | 12770 |
| `const STATUS_EFFECT_DEFS = {` | index.html | 状態表示の定義。`prone` が「配列が真実の源」の前例 | 21951 |
| `function applyStatus` | index.html | ⚠ **内部で +1 して保持する**(§2-5) | 21982 |
| `function tickStatusEffects` | index.html | 残ターン減衰 | 21997 |
| `async function executeSkillOn` | index.html | ⭐⭐⭐ **頭と仲間の共通ディスパッチャ**(§2-6) | 19026 |
| `// リーダー版スキル発動` | index.html | 19191 で同じ関数を呼ぶ | 19182 |
| `async function clericAI` | index.html | 僧侶 AI の梯子 | 28740 |
| `if (skillId === "turn-undead") {` | index.html | `apIsWasted` の無駄打ち判定 | 30707 |
| `if (enemy.stunned && enemy.stunned > 0) {` | index.html | 敵の行動不能判定 + `STUNNED 行動不能` 表示 | 32771 |
| `tickStatusEffects(enemy);` | index.html | 敵ターンの残ターン減衰 | 32713 |
| `const speechBubbles = []` | index.html | ⭐ **レジストリ + 毎フレーム再配置の手本** | 11760 |
| `function spawnGroundFx` | index.html | ⛔ **これは使わない**(§2-7) | 10942 |
| `function isUndeadEnemy` | index.html | アンデッド判定 | — |
| `el.className = "npcUnit";` | tavern.html | 酒場 NPC の DOM 生成。⭐ **96×96 を inline で固定** | 9670 |
| `function npcPlace` | tavern.html | ⭐ 毎フレームの位置更新。吹き出しの追従もここ | 9757 |
| `let todaysPatrons = null;` | tavern.html | 卓の 4 人(職業・名前・性格・Lv を持つ) | 7750 |
| `const PM_CLASS_EMOJI` | tavern.html | ⭐ 職業アイコン。**表を写経せずここから引く** | 7787 |
| `function recruitClassLabel` | tavern.html | classKey → 日本語職業名 | 5881 |
| `.npcUnit {` | tavern.html | **z-index: 3** | 2420 |
| `.tavernSign {` | tavern.html | **z-index: 4** | 2482 |

**再測定コマンド**:

    git show HEAD:index.html  > /tmp/idx.html && grep -n '<識別子>' /tmp/idx.html
    git show HEAD:tavern.html > /tmp/tav.html && grep -n '<識別子>' /tmp/tav.html

### 2-2. 僧侶の穴は実在する(数えた)

`CLERIC_SKILLS` = **8 個**。内訳:

| 分類 | 呪文 | 対象 |
|---|---|---|
| 回復 | cure-light / moderate / serious / critical | 味方 |
| バフ | shield-of-faith / bless / striking | 味方 |
| 神聖 | **turn-undead** | **敵(アンデッドのみ)** |

⇒ **敵を対象に取れるのは 1 個だけ**、かつ**アンデッド限定**。生者相手の僧侶は手数ゼロ。

### 2-3. ⭐⭐⭐ 崩れた主張 その1 —「自動クリティカルを 12 箇所へ配る」作業は**存在しない**

開発計画書は「`effectiveCritRange` の口が 13 箇所あり、うち 1 箇所(盗賊シャドウステップ)だけ
`helpless` が実装済。**残り 12 箇所へ配るのが中規模の作業**」と書いた。**これは誤り。**

    grep -c "helpless" index.html   →  90

`helpless = target.stunned > 0` を持つ**攻撃解決は 15 箇所**あり、**すでに全部配られている**:

| 行 | 関数 | 種別 |
|---|---|---|
| 22423 | `playerSingleAttack` | ⭐ **頭の単体攻撃の唯一のファンネル** |
| 25954 | `performAllyCounter` | 盾構えカウンター |
| 26409 | `allyBasicAttack` | 通常攻撃 |
| 26852 | (必中系) | `times = helpless ? critMult : 1` |
| 26926 | `allyFireBolt` | 呪文 |
| 27876 | `allyPowerAttack` | 近接 |
| 28045 | `allyThrowingAxe` | 投擲 |
| 28145 | `allyAxeStorm` | 範囲 |
| 28212 | `allyEarthShatter` | 範囲 |
| 29160 | `allyAimedShot` | 弓 |
| 29253 | (必中系) | ⭐ **`HELPLESS HIT!` のラベルが既にある** |
| 29594 | `allyLightningArrow` | 弓 |
| 30175 | `allyShadowStep` | 近接 |
| 30256 | `allyThrownDagger` | 投擲 |
| 30315 | `allyPoisonBlade` | 近接 |

さらに設計意図がコードに明記されている(`index.html:19985-19988`):

    //   「スタン中の敵は helpless = 自動クリ」の旨味を、暴君の乱入がある回だけ削らないため)。
    // ⚠ PT 側 (頭/仲間) に helpless (自動クリ) を波及させてはいけない。現状 enemyAttackAllyTarget は
    //   helpless を一切参照しない (helpless = target.stunned > 0 は PT→敵 の攻撃経路にしか存在しない)。
    //   ここに enemy→ally の helpless を足すと「眠らされた仲間が確定クリで即死」= 過酷すぎる。足さないこと。

⭐⭐⭐ **したがって「自動クリティカルを入れる」の実装コストはゼロ。**
ホールドパーソンが `stunned` を立てれば、**15 経路すべてで自動的に効く。**

### 2-4. ⭐⭐⭐ 崩れた主張 その2 —「近接だけに限る」は**やってはいけない**

開発計画書は「D&D 5e に合わせて近接のみに限る」と書いた。**却下する。**

上表のとおり、**既存 15 箇所は射程を一切見ていない**。弓(`allyAimedShot`)も投擲
(`allyThrownDagger`)も呪文(`allyFireBolt`)も `helpless` で自動クリになる。
これを近接限定にすると:

- **出荷済みの挙動を 15 箇所で弱める** = 本チケットの範囲外の退行
- スリープ(魔法使い)の既存の遊びも同時に弱まる
- **ルールが 2 つになる**(僧侶の hold だけ近接限定 / 魔法使いの sleep は全射程)

⇒ ⭐ **既存の型に合わせる = 射程制限を入れない。** `helpless` に 1 バイトも触らない。
⚠ 近接限定にしたくなったら**別チケット**(15 箇所すべてが対象で、バランス再測定が要る)。

### 2-5. ⭐⭐⭐ 崩れた主張 その3 — tick は**既に揃う**(「唯一の技術リスク」は消えた)

開発計画書は「`tickStatusEffects` と `enemy.stunned--` は別経路で回るので 1 ターンずれる
可能性がある = 唯一の技術リスク」と書いた。**実測すると同じ関数の中にある。**

    32713:      tickStatusEffects(enemy);          ← 敵ターンの冒頭
    32771:      if (enemy.stunned && enemy.stunned > 0) {
    32772:        enemy.stunned -= 1;
    32773:        showRollAtEnemy(idx, `<span class="label">STUNNED</span>行動不能`, "miss");
    32777:        return;

さらに `applyStatus` は**内部で +1 して保持する**(21982 のコメント「visibleTurns = プレイヤーから
見た『効くターン数』。内部では +1 して保持する(対象の次のターン開始 tick で即 1 減るため)」)。

⇒ **`stunned = 4` と `applyStatus(target, "held", 4)` を同時に立てれば、両者は同じターンに切れる。**
5 ターン目の tick で `held` が消え、同じターンの 32771 で `stunned === 0` なので敵が動き出す。

⚠ 仲間側も同型(`tickStatusEffects(ally)` = 28656 / `ally.stunned--` = 28665 = **同じ関数の 9 行差**)。

⭐ **とはいえ受入条件では測る**(§9 の (2a))。実測で揃っていることと、揃い続けることは別。

### 2-6. ⭐⭐⭐ 崩れた主張 その4 — 頭と仲間で 2 経路要らない。**共通ディスパッチャが 1 本ある**

開発計画書は「主人公も僧侶になれるので頭経路も要る。`turn-undead` が両方持っているのが手本」
と書いた。**両方誤り。**

- `turn-undead` は **`allyTurnUndead` 1 本しかない**(`CLERIC_SKILLS["turn-undead"]` の呼び口は
  26749 の実装 + 28764 / 30710 の射程読みだけ)
- 実際の手本は **`executeSkillOn(actor, classKey, skillId, targetIdx)`**(19026)。
  19182 のコメントが明言:「**リーダー版スキル発動: 戦士は executeWarriorSkill、
  それ以外は executeSkillOn の薄い皮。**」→ 19191 で `executeSkillOn(actor, leaderClassKey, ...)`

⇒ ⭐ **`executeSkillOn` の cleric 枝に 1 行足すだけで、頭と仲間の両方に効く。**

### 2-7. ⚠⚠⚠ 罠 — VFX の置き場所を間違えると「掛かっている」に見えない

**罠 A: `spawnGroundFx` は使えない。**

    index.html:726  ⚠⚠ z-index は **.groundFx と同値の 1** =「床 (mapCanvas z0) より上・敵 (z2) より下」

⇒ 地面に置くと**輪が敵の下に潜る**。慶彦さんの要望「輪がキャラに掛かっている」が成立しない。

**罠 B: 敵 DOM の添字並列配列に 12 本目を足してはいけない。**

`createEnemyDom`(11995)は DOM を**添字並列の配列 11 本**で持つ。#44 と #46 が**同じ罠を 2 回
踏んでいて**、コードにその教訓が残っている:

    ⚠⚠⚠ OFF でも **null を push する**。push ごと飛ばすと添字並列が崩れ、
      enemyBadgeElements[index] が **別の敵**を指す (#44 が 11 本目で同じ罠を踏んでいる)。

⇒ ⭐⭐⭐ **採る形 = `speechBubbles`(11760)と同じ「レジストリ + 毎フレーム再配置」。**
`{ el, unit, expireAt }` の独立した配列を持ち、**添字並列に一切触らない。**
これで罠 A(z-index を自分で決められる)と罠 B(配列を増やさない)の両方が同時に消える。

⚠ **この罠は §9 の負のコントロールの変異 M5 / M6 として装置に内蔵させること。**

### 2-8. ⭐⭐⭐ 崩れた主張 その5 —(I5) の真の不変条件は「矩形」ではなく **z-index**

開発計画書は「着手前に golden 4 本の札の矩形を実測して、頭上札の高さを決めよ(px は仮)」と
書いた。**実測すると、高さを測る必要はない。**

`tools/verify_npc_crowd.js:157` が真の理由を書いている:

    //      .npcUnit の z-index は 3 / 札は 4 なので、矩形が重なっても elementFromPoint が
    //      札を返す

そして 2 本の assert の測り方はこう:

| assert | 何を測るか |
|---|---|
| **(1a)** | `.npcUnit` の矩形 × `.tavernSign` の矩形の交差が 0 件(データ経路 2 本 + **実 DOM 経路** 1 本) |
| **(2b)** | 札 5 枚の**中心の `elementFromPoint` が自分自身か子孫** |

⭐⭐⭐ **したがって頭上札は次の 3 条件を満たせば、既存 golden を 1 本も動かさない**:

1. **`.npcUnit` の子として作る** — `.npcUnit` は `el.style.width/height = SPRITE + "px"` で
   **96×96 に固定**(tavern.html:9672-9673)。はみ出す子は親の `getBoundingClientRect()` を
   **広げない** ⇒ **(1a) の測る矩形が 1px も変わらない**
2. **z-index を 4 未満にする**(= `.npcUnit` と同じ 3 か、それ以下)⇒ **(2b) は札を返し続ける**
   ⚠ 既に前例がある: tavern.html:2442「**⚠⚠ z-index は 3 = .npcUnit と同じ。⛔ 4 以上にしない(札が 4)**」
3. **`pointer-events: none`** — #41 項目 3 で「NPC がタップを食う板」になった実例が
   `js/npc-crowd.js` の冒頭に記録されている

⇒ ⛔ **「札の矩形を実測して高さを決める」は不要。** 上の 3 条件が構造的な答え。

### 2-9. ⭐ 崩れた主張 その6 — 「ボス」判定は実在する(未測定の穴は埋まった)

開発計画書は「ボスの判定方法は着手時に実測して決める(起草時点で未確認)」と書いた。**実在する。**

    $ grep -c "isBoss: *true" index.html   →  12
    index.html:12868  if (def.isBoss || def.boss) { addScroll(...) }
    index.html:12890  if (!(enemy.def.isBoss || enemy.def.boss)) return;  // ボス撃破のみ

⇒ **`enemy.def.isBoss || enemy.def.boss`** が既存の唯一の口。⛔ 新しい判定を作らない。

⚠ **例外が 1 件ある**(index.html:9140):

    // isBoss を付けない: 激怒/召喚/恐怖オーラのゲートに乗せたくないため。

この個体には**ホールドパーソンが効く**。⭐ これは仕様として受け入れる(意図的に「ボス扱い
しない強敵」なので、縛れてよい)。⛔ この個体に `isBoss` を足して回らないこと。

### 2-10. ⚠⚠ 罠 — `executeSkillOn` のシグネチャ行を 1 文字も変えない

`tools/driver_action_priority.js:131` が**逐語アンカー**で計測シームを注入する:

    const SEAM_FN = 'async function executeSkillOn(actor, classKey, skillId, targetIdx) {';

⇒ ⛔ **この行を変えると既存 golden `driver_action_priority`(92/92)が起動時検算で落ちる。**
枝を足すのは**関数の中**であって、シグネチャではない。

### 2-11. 敵の抵抗判定は「セーヴ」ではなく「命中ロール」

⚠ `saveAbility` は `MAGE_SKILLS` の 5 呪文に宣言されているが、**消費点が 0 件**
(`grep "\.saveAbility" index.html` = 0)。flavor の「DEX セーヴ半減」は**現状では嘘**。
実際の抵抗は `sleep` と同じ **`d20 + spellAtkBonus(ally)` vs `effectiveEnemyAc(t)`**(27075-27085)。

⇒ ⭐ **ホールドパーソンもこの型に乗せる。** ⛔ セーヴ機構を新設しない
(建てるなら魔法使いの 5 呪文も同時に直さないと嘘の flavor が 5 個残る = **別チケット**、§11)。

### 2-12. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

⇒ **鳴る**(両方を触る)。**プレイヤー向けの要約は実在する**(嘘をでっち上げる必要がない):

    <li><b>僧侶がホールド・パーソンを覚えた</b> — 敵1体を金の輪で縛り上げ、動けなくする。縛られた相手への攻撃は必ず急所に入る。</li>
    <li><b>酒場の卓の顔ぶれが一目で分かるように</b> — 話しかけなくても、職業と名前が頭の上に出る。</li>

### 2-13. 母集団(既存 golden)

**着手前に必ず素で回して基準を採ること**(下の表は起草時点の見込みであり、実測ではない)。

| ドライバ | なぜ母集団か |
|---|---|
| `verify_npc_crowd` | ⭐⭐⭐ **(1a) と (2b) が §2-8 の当事者**。最優先 |
| `verify_tavern_map` | 席札 3 枚の `elementFromPoint`((2a)) |
| `verify_recruit_talk` | #54。卓の 4 人と `todaysPatrons` の当事者 |
| `driver_action_priority` | ⭐ §2-10 の逐語アンカー。`clericAI` の梯子も測っている |
| `verify_cone_cast` | 呪文の発射率。`CLERIC_SKILLS` を触るので念のため |
| `verify_run_chronicle` | HP 減算とスタンを見ている |
| `verify_pm_drawer_fit` / `verify_prep_retire` / `verify_party_match_setup` | tavern.html の直近 3 本 |

⚠ **同じポートを使うドライバが混ざる**(#55 の実測: 8831 / 8893 が 2 組)⇒ **必ず直列**で回す。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | `CLERIC_SKILLS` / `CLERIC_SLOTS_TABLE` / `DEFAULT_KNOWN.cleric` / `STATUS_EFFECT_DEFS` に `held` / `allyHoldPerson` 新設 / `executeSkillOn` の cleric 枝に 1 行 / `clericAI` に 1 分岐 / `apIsWasted` に 1 分岐 / 金の輪 VFX(レジストリ)/ 表示の言い分け |
| `tavern.html` | 頭上札の DOM + CSS + 撤退スイッチ + changelog |
| `tools/verify_hold_person.js` | 新規(受入ドライバ) |

⛔ **`js/npc-crowd.js` は読むだけ。1 バイトも書かない**(配置データが動くと `verify_npc_crowd` の
データ経路が全部ずれる)。
⛔ **`js/recruit-candidates.js` / `js/mercenary-roster.js` も触らない。**
⛔ **`helpless` を含む 15 箇所に 1 バイトも触らない**(§2-4)。
⛔ **`executeSkillOn` のシグネチャ行を変えない**(§2-10)。

---

## 4. STEP1 — 卓の 4 人の頭上に職業と名前(`tavern.html` 単独・A と完全独立)

⭐ **先にこれを着地させる。** A が転んでも 1 つは出せる。

### 4-1. 撤退スイッチ

    /* ⚠ const に畳まない。呼ぶたびに読む (isRecruitTalkOn と同じ TDZ 回避の作法)。 */
    function isPatronLabelOn() {
      try { return new URLSearchParams(location.search).get("patronlabel") !== "0"; }
      catch (e) { return true; }
    }

### 4-2. DOM(`el.className = "npcUnit";` の直後、`layer.appendChild(el)` より前)

⭐⭐⭐ **`.npcUnit` の子として作る**(§2-8 の条件 1)。

    /* ★[#57] 頭上の名札。⛔⛔⛔ 3 つの条件を崩さないこと (依頼書 §2-8):
     *   ① .npcUnit の **子** にする — .npcUnit は 96x96 に固定されているので、
     *      はみ出す子は親の getBoundingClientRect() を広げない
     *      ⇒ verify_npc_crowd (1a) の測る矩形が 1px も変わらない
     *   ② z-index を **4 未満** にする (札が 4) ⇒ (2b) の elementFromPoint は札を返し続ける
     *   ③ pointer-events: none  ⇒ #41 の「NPC がタップを食う板」を再発させない
     * ⚠ 卓の 4 人 (todaysPatrons に居る席) だけ。店主/酔漢/給仕/荷運びには出さない。 */
    if (isPatronLabelOn() && seatMember) {
      var lb = document.createElement("div");
      lb.className = "patronLabel";
      lb.setAttribute("data-patron", n.key);   /* ⚠ ドライバはここから key を読む */
      /* ⛔ 表を写経しない。PM_CLASS_EMOJI と recruitClassLabel から引く */
      var promised = false;
      try { promised = !!(window.DFRecruits && DFRecruits.has(seatMember.name)); } catch (e) {}
      lb.textContent = (promised ? "🤝 " : "")
                     + (PM_CLASS_EMOJI[seatMember.classKey] || "")
                     + " " + (seatMember.name || "");
      lb.title = recruitClassLabel(seatMember.classKey);
      el.appendChild(lb);
      /* ⚠ 下で組む u オブジェクトへ labelEl として持たせる (約束の付け外しで引き直すため) */
    }

### 4-3. CSS(`.npcUnit` の定義の直後に置く)

    /* ★[#57] 卓の 4 人の頭上の名札。
       ⛔⛔ z-index は **3 以下**。4 以上にすると .tavernSign (z=4) を奪い、
            verify_npc_crowd (2b) と verify_tavern_map (2a) が赤くなる。
       ⛔⛔ pointer-events: none は外さない。 */
    .patronLabel {
      position: absolute;
      left: 50%;
      top: -18px;                 /* 頭の少し上。⚠ 親からはみ出すが親の矩形は広がらない */
      transform: translateX(-50%);
      z-index: 3;
      pointer-events: none;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1.25;
      padding: 1px 7px 2px;
      color: #f0e6cf;
      background: rgba(24,18,10,0.78);
      border: 1px solid rgba(160,124,60,0.75);
      border-radius: 3px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9);
    }

⚠ **font-size は 12px から始める。** #44 で敵の名前札を 70% に縮めたとき
「iPhone 縦で 7.7px が読めるか未確認」が残っている。酒場の TILE は 96px あるので敵より余裕がある。
**実機で読めなければ数値だけ動かす**(§10)。

### 4-4. 追従

⭐ **追従のコードは要らない。** 名札は **`.npcUnit` の子**なので、`npcPlace()` が親を動かせば
自動で付いてくる。⛔ `npcBubbleFollow` を写経して 2 本目の追従経路を作らないこと。

### 4-5. 約束の反映

`btnRecruitYes` のハンドラ(約束を取る枝 / 取り消す枝の**両方**)で、該当席の名札の
`textContent` を引き直す(🤝 の付け外し)。⛔ 名札の要素を作り直さない(参照が切れる)。

---

## 5. STEP2 — ホールド・パーソン本体(`index.html`)

### 5-1. 撤退スイッチ

    function isHoldPersonOn() {
      try { return new URLSearchParams(window.location.search).get("holdperson") !== "0"; }
      catch (e) { return true; }
    }

⚠ **`DEFAULT_KNOWN.cleric` への追加はこのスイッチで包む**(`withInnateSleepList` と同じ作法)。

### 5-2. 呪文定義(`CLERIC_SKILLS` に追記)

    // ── ホールド・パーソン (単体を金縛り。アンデッド/ボスには無効) ──
    "hold-person": {
      name: "ホールド・パーソン", category: "妨害", target: "single",
      holdTurns: 4, range: "long",
      mpCost: 7, levelReq: 5,
      flavor: "敵1体を 4ターン 金縛りにする (アンデッド/ボスには無効、MP 7)",
    },

⚠ `range: "long"` = **12 タイル**(`RANGE` 実測: melee 1 / medium 8 / **long 12** / spellSingle 10)。
**僧侶の他の呪文はすべて `medium`(8)** なので、ホールドパーソンだけ 4 マス長い。
⭐ これは慶彦さんの決裁。スロットが希少(下表)なので強くてよい、というのが会議の合意。

### 5-3. スロット表(`CLERIC_SLOTS_TABLE` の「将来呪文を追加する場合はここに追記」の位置へ)

    "hold-person":          [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2],   // Lv5 解禁 (単体 4T 金縛り)

⭐ **ここが唯一のバランスレバー。** Lv5-7 で 1 回 / Lv8-10 で 2 回。

### 5-4. 習得(`DEFAULT_KNOWN.cleric`)

`turn-undead` と同じ「初期習得」にする。⚠ Lv5 まで枠が 0 なので**実質 Lv5 で覚える**。
⛔ 聖典巻物(`tome-hold-person`)にしない — 僧侶の非回復呪文(bless / turn-undead)が
どちらも初期習得なので、そこと揃える。

### 5-5. 状態の印(`STATUS_EFFECT_DEFS` に 1 行)

    held:       { icon: "⛓", label: "金縛り",       type: "debuff" },

⭐⭐⭐ **`prone` と同じ「配列が真実の源」の枝。** 役割分担:

| 役割 | どこ |
|---|---|
| **行動不能の実体** | 既存の `target.stunned`(AI・tick・描画が全部そのまま動く) |
| **「これは hold だ」の印** | `applyStatus(target, "held", 4)` |

⛔ **これが無いとスリープと区別がつかず、眠っている敵にも金の輪が出る。**

### 5-6. 実装(`allyTurnUndead` の隣に `allyHoldPerson` を新設)

要点だけ列挙する(既存の `allyTurnUndead` / sleep 解決の作法をそのまま踏襲):

1. スロット消費 → `dfPlayCast(ally, { name: skill.name, element: ... }, ...)`
   ⚠ **element に実在するキーを使う**。⛔ 新しい element 名を発明すると `dfPlayCast` が
   黙って無音になる。**着手時に既存キーを grep して確かめる**
2. **対象の絞り**:

       const immune = isUndeadEnemy(t) || !!(t.def && (t.def.isBoss || t.def.boss));

   ⭐ 無効なら **`showRollAtAlly(ally, '<span class="label">NO EFFECT</span>金縛りは通じない', "miss")`**
   ⇒ ルールを説明せずにルールが伝わる。⛔ 黙って外さない
3. **抵抗判定は命中ロール**(§2-11):

       const natD20   = d20();
       const atkTotal = natD20 + spellAtkBonus(ally);
       const hit = (natD20 !== 1) && (natD20 >= effectiveCritRange(ally) || atkTotal >= effectiveEnemyAc(t));

4. 命中したら **2 つを同時に立てる**:

       t.stunned = Math.max(t.stunned || 0, skill.holdTurns);
       applyStatus(t, "held", skill.holdTurns);
       spawnHoldRing(t, skill.holdTurns);   // ← STEP3

5. 外れたら `RESIST` を出す

### 5-7. ディスパッチャ(`executeSkillOn` の cleric 枝)

⛔ **シグネチャ行は 1 文字も変えない**(§2-10)。枝を 1 行足すだけ:

    if (skillId === "hold-person") { await allyHoldPerson(actor, targetIdx); return true; }

⭐ これで**頭と仲間の両方**に効く(19191 が同じ関数を呼ぶ)。

### 5-8. AI(`clericAI`)

**優先度 = 緊急回復 → ターンアンデッド → ホールドパーソン → ブレス → …**
⛔ 回復より先に出させない。

条件(`turn-undead` の枝と同じ作法で書く):

- `ally.equippedSkills.includes("hold-person")` かつ `hasSpellSlot(ally, "hold-person")`
- 射程 `getRange(CLERIC_SKILLS["hold-person"].range).tiles` 以内 **かつ `hasLineOfSight`**
- **有効な対象が居る**(アンデッドでもボスでもなく、まだ `held` でない)
- ⭐ **既に `held` の敵に撃たない**(`hasStatus(t, "held")` で除外)

### 5-9. 無駄打ち判定(`apIsWasted` の `turn-undead` の枝の隣)

同じ条件を「射程内に有効な対象が 1 体も居なければ無駄」として書く。

---

## 6. STEP3 — 金の輪 VFX「聖印の檻」+ 表示の言い分け

### 6-1. ⛔⛔⛔ 採ってはいけない 2 つの形(§2-7)

- ⛔ **`spawnGroundFx` を使わない**(z-index 1 = 敵の下に潜る)
- ⛔ **敵 DOM の添字並列配列に 12 本目を足さない**(#44/#46 が 2 回踏んだ罠)

### 6-2. ⭐⭐⭐ 採る形 = `speechBubbles` と同じレジストリ

    /* ★[#57] 金縛りの輪。⭐ speechBubbles (index.html:11760) と同じ規約 =
     *   「レジストリ配列 + 毎フレーム再配置」。⛔ 敵 DOM の添字並列配列には 1 本も足さない
     *   (#44/#46 が 2 回踏んだ「null を push し忘れて別の敵を指す」罠を構造的に回避する)。 */
    const holdRings = [];      // { el, unit, expireAt }
    const HOLD_RING_MAX = 4;   // ⚠ 同時本数の上限。超えたら古いものから消す (iOS 対策)

⚠ **毎フレームの再配置は `groundFxElements` / `speechBubbles` の掃除ループと同じ場所へ足す**
(11629 付近)。⛔ 別の場所に 3 本目のループを作らない。
⚠ **`resetForNewRun` 相当(33926 の `groundFxElements.length = 0; speechBubbles.length = 0;`)にも
`holdRings.length = 0;` を足す。** 忘れると前の潜行の輪が残る。

### 6-3. 見た目(案 IV「聖印の檻」/ モックアップの再現)

**環 2 本 + 足元の回る魔法陣 + 天へ伸びる光条。色は金。CSS のみ・アセット追加 0 枚。**

⭐⭐⭐ **「掛かっている」に見せる肝**(モックアップで実証済):
**同じ楕円を 2 枚出し、`clip-path` で上半分を敵の後ろ・下半分を敵の前に置く。**

    .holdRing i.back  { z-index: 1; clip-path: inset(0 0 50% 0); }   /* 敵より下 */
    .holdRing i.front { z-index: 3; clip-path: inset(50% 0 0 0); }   /* 敵より上 */

⚠ **敵の実際の z-index を着手時に測ってから決める。** 起草時の根拠は index.html:726 の
**コメント**(「敵 (z2)」)であって CSS の実測ではない。⛔ コメントを信じず実 CSS を引くこと。

⭐⭐ **光量は 1 か所のレバーにする**(慶彦さんが了解した弱点②への備え):
CSS 変数 `--holdGlow` を 1 本置き、`box-shadow` と `opacity` を**すべてそこから導く**。
⇒ 実機で「明るすぎて敵が読めない」と分かったら**この 1 行だけ動かす**。⛔ 案の作り直しはしない。

### 6-4. 表示の言い分け(⭐ 実装は 1 語)

§2-3 のとおり **`HELPLESS! 無抵抗の敵に自動命中 ×N` は既に出ている。** 足りないのは
「眠っているのか金縛りなのか」だけ。

- **敵ターンの行動不能表示**(`index.html:32773`):

      showRollAtEnemy(idx, `<span class="label">STUNNED</span>行動不能`, "miss");

  → `hasStatus(enemy, "held")` なら `<span class="label">HELD</span>金縛り` にする。

⚠ **これ 1 箇所だけ。** ⛔ `helpless` を持つ 15 箇所の表示には触らない(§2-4)。

---

## 7. STEP4 — 受入ドライバ + 非退行 + 締め

`tools/verify_hold_person.js`(新規)。**base ポートは 10101**
(⚠ 10080 は Chrome が `ERR_UNSAFE_PORT` で拒否する。#56 の実測)。変異は 10102〜10120 を予約。

---

## 8. 撤退スイッチ(⭐ 2 本に分ける)

| スイッチ | 何が戻るか | 判定位置 |
|---|---|---|
| **`?holdperson=0`** | 呪文が `DEFAULT_KNOWN.cleric` から落ち、`held` も輪も出ない | `index.html`。⚠ ページ遷移をまたがない(潜行は index.html 内で完結) |
| **`?patronlabel=0`** | 頭上札を 1 枚も作らない(従来の見た目) | `tavern.html`。⚠ 同上 |

⚠ **`?recruittalk=0`(#54)のときは `todaysPatrons` が null** ⇒ 頭上札は**自動的に 1 枚も出ない**。
⭐ これは撤退スイッチの二重化ではなく、**上流が消えれば下流も消える**という正しい依存。

---

## 9. 受入条件 — `tools/verify_hold_person.js`(新規・base 10101)

**観測するもの** = ①札の DOM と既存 golden の不変条件 ②`held` と `stunned` の同時性
③対象の絞り ④輪が `held` だけを見ているか。
**観測しないもの** = §12 に明記。

### §0 装置(先に母集団を確かめる)

- **(0a)** 酒場で **`.patronLabel` が 4 枚**測れている
  ⭐⭐⭐ **これが 0 枚だと §1 の全 assert が空振りで永久緑になる**
- **(0b)** 札のテキストが **`PM_CLASS_EMOJI` と `todaysPatrons` の実体から導かれている**
  (表の写経でないこと)= ページ内の `todaysPatrons` を読み出し、4 席の `classKey` から
  期待テキストを**ドライバ側で独立に組んで**照合する
- **(0c)** 戦闘で **ホールドパーソンが 1 回以上発射されている**(発射 0 なら §2〜§4 が空振り)
  ⭐ 仕込み = `knownSpells.cleric` に `hold-person` / Lv を 5 以上 /
  `sessionStorage["dragonfighters.partyMembers"]` の **3 点セット**
  (#50 の実測: この 3 つが揃わないと僧侶が来ない run が出る)
- **(0d)** **アンデッドの敵とボスの敵が母集団に 1 体以上ずついる**
  ⚠ #50 の教訓 =「差が出ること」ではなく「**後続 assert の敷居を満たす差が出ること**」まで縛る

### §1 頭上札(2 経路で突き合わせる)

- **(1a)** ★★ 4 席すべてで、札のテキストが `🤝?` + 職業アイコン + 名前 の形で、
  **ドライバが `todaysPatrons` から独立に組んだ期待値と一致**する
- **(1b)** **`.patronLabel` の `pointer-events` が `none`**(`getComputedStyle` で実 CSS を読む)
- **(1c)** **`.patronLabel` の z-index が 4 未満**(同上)
- **(1d)** 札は **`.npcUnit` の子**であり、**`.npcUnit` の矩形が 96×96 のまま**
  (親の rect が広がっていない = `verify_npc_crowd` (1a) を壊していないことの直接証拠)
- **(1e)** 卓の 4 人**以外**(店主 / 酔漢 / 給仕 / 荷運び)に札が**付いていない**
- **(1f)** 約束すると 🤝 が付き、取り消すと消える

### §2 `held` と `stunned` の同時性

- **(2a)** ★★ 命中直後に `stunned === 4` かつ `hasStatus(t,"held") === true`。
  **4 ターン後に両方が同時に消える**(敵ターンを 5 回進め、各ターンで両方を記録して突き合わせる)
  ⭐ 片方の写経にしない = `stunned` は敵オブジェクトから、`held` は `computeDisplayList` から読む
- **(2b)** 眠らせた敵(sleep)は `stunned > 0` だが **`held` が false**

### §3 対象の絞り

- **(3a)** アンデッドに撃つと `stunned` が **1 も増えず**、`NO EFFECT` 相当の表示が出る
- **(3b)** ボス(`def.isBoss || def.boss`)でも同じ
- **(3c)** 通常の生者には通る(命中した run が 1 件以上ある)

### §4 金の輪

- **(4a)** ★★ 輪の DOM が **`held` の敵にだけ**出ている(眠っている敵には出ない)
  = (2b) と同じ盤面で数える
- **(4b)** 輪は **敵 DOM の添字並列配列に入っていない**(レジストリ方式であることの機械確認)
  ⇒ `createEnemyDom` が push する配列の**本数が着手前と同じ**であることを配信バイトから数える
- **(4c)** 同時に `held` の敵が 5 体以上いても、輪は **4 本以下**(上限が効いている)
- **(4d)** 潜行をやり直すと輪が **0 本にリセットされる**(§6-2 の `holdRings.length = 0`)

### §5 恒等(非退行)

- **(5a)** `helpless` を含む 15 箇所が**着手前と 1 文字も変わっていない**(配信バイトで照合)
- **(5b)** `executeSkillOn` の**シグネチャ行が逐語で一致**(§2-10)
- **(5c)** `?holdperson=0` / `?patronlabel=0` で従来の姿へ戻る
- **(5d)** 既存 golden(§2-13 の母集団)が**着手前の基準どおり**・**期待値の変更 0 件**
  ⚠ **必ず直列**(同ポートの衝突がある)

### §6 負のコントロール(`--negative`)— 変異は最低 8 本

| # | 変異 | 担当節 |
|---|---|---|
| M1 | 札の `pointer-events` を `auto` にする | (1b) |
| M2 | 札の z-index を 5 にする | (1c) + `verify_npc_crowd` (2b) |
| M3 | 札を `.npcUnit` の**兄弟**にして親の外へ出す | (1d) |
| M4 | `applyStatus(t,"held",…)` を落とす(`stunned` だけ立てる) | (2a) + (4a) |
| M5 | ⭐⭐⭐ **輪を `spawnGroundFx` で出す**(z-index 1 = 敵の下に潜る) | (4a) / (4b) |
| M6 | ⭐⭐⭐ **輪を敵 DOM の添字並列配列に足す** | (4b) |
| M7 | アンデッド除外を落とす | (3a) |
| M8 | 上限 `HOLD_RING_MAX` を外す | (4c) |

⚠ **変異は「注入できたか」でなく「測っている場所に現れるか」まで設計する**(#54 の教訓)。
実走して**空振り 0**を確認すること。空振りしたら
**assert を緩めず、担当節を測れる場所へ移す**(#50 / #53 の作法)。

---

## 10. 実機体感(iPhone 縦持ちで確かめてもらう項目)

1. **頭上札の 12px が読めるか**(#44 で 7.7px が未確認のまま残っている)
2. **札 4 枚が画面内で重ならないか**(patronA/B は隣接タイル、C/D も隣接)
3. ⭐⭐ **金の輪の光が強すぎて敵が読めなくならないか**(慶彦さんが了解した弱点②)
   → 強すぎたら `--holdGlow` を下げる
4. ⭐⭐ **同時 4 体で描画がカクつかないか**(弱点①)
   → `project_camera_perf` のアブレーション法で測る
5. **輪が「掛かっている」に見えるか**(モックアップと実機で印象が変わらないか)
6. **4 ターンの拘束が長すぎないか**(シナリオ 4 以降の勝率)
7. **「金縛り」表示が読めるか**(`STUNNED` との言い分けが伝わるか)

---

## 11. やらないこと(別チケット送り)

- ⛔ **`saveAbility` の実装**(魔法使いの 5 呪文の flavor が現状**嘘**。§2-11)
  → ガイウスが会議で名指しで切り出しを提案。**#58 候補**
- ⛔ **`helpless` を近接限定にする**(§2-4。15 箇所すべてが対象でバランス再測定が要る)
- ⛔ **`ENEMY_TYPES` 44 件へ `humanoid` フラグを配る**(§2-9 の近似で足りる)
- ⛔ **主人公が僧侶のときに呪文を選んで撃つ UI**(§2-6 で `executeSkillOn` 経由になるので
  ロジックは通るが、**リーダーの呪文選択 UI 自体が別の話**)
- ⛔ **`isBoss` を持たない強敵(index.html:9140)に `isBoss` を足す**(意図的に外されている)
- ⛔ **ボールト `spells.md` へのホールド・パーソン追記**(別 PC の宿題。§2 で「設計書に無い」と実測済み)

---

## 12. ⛔ 測らないこと(明記しておかないと実装窓が善意で縛りにいく)

- **輪の色・太さ・脈動の速さ・光量** — 実機を見てから動かす余地を残す。
  ⛔ 受入条件で数値を固定しない(固定すると `--holdGlow` を触るたびに赤くなる)
- **札の font-size と top のピクセル値** — 同上。⭐ 縛るのは
  **z-index < 4** / **pointer-events: none** / **`.npcUnit` の子** の 3 条件だけ(§2-8)
- **ホールドパーソンの発射率** — `clericAI` の梯子の位置は実機体感で動かす

---

## 13. `実装依頼書/README.md` へ足す行(✅ 2026-09-07 追加済)

⭐ 並走窓が無い(冒頭で実測済)ので**承認と同時に足してよい**。

    | 57 | [2026-09-07_hold-person-and-patron-labels.md](2026-09-07_hold-person-and-patron-labels.md) | 起草(未承認) | 0% | 僧侶にホールド・パーソン(単体 / 4T / long=12タイル / アンデッド・ボスには無効)+ 酒場の卓の 4 人の頭上に職業と名前。VFX は案 IV「聖印の檻」(環2本 + 足元の魔法陣 + 光条 / 金 / CSS のみ)。撤退 `?holdperson=0` / `?patronlabel=0`。⭐⭐⭐ **自動クリティカルは実装コスト 0** — `helpless = target.stunned > 0` は **15 箇所すべてに配布済**(計画書の「12 箇所へ配る」は誤り)。⛔ 近接限定にすると出荷済みの挙動を 15 箇所で弱めるので**やらない**。⭐⭐⭐ **(I5) の真の不変条件は矩形ではなく z-index**(`.npcUnit` 3 / `.tavernSign` 4)⇒ 札を `.npcUnit` の子 + z<4 + `pointer-events:none` にすれば既存 golden を 1 本も動かさない。⭐⭐⭐ **tick は既に揃う**(`tickStatusEffects(enemy)` と `enemy.stunned -= 1` は同じ敵ターン関数の中 / `applyStatus` は内部で +1)⇒ 計画書の「唯一の技術リスク」は消えた。⭐⭐ **頭と仲間で 2 経路要らない** — `executeSkillOn` が共通ディスパッチャ(⛔ シグネチャ行は `driver_action_priority` の逐語アンカー = 1 文字も変えない)。⛔ `spawnGroundFx` で輪を出すと z=1 で**敵の下に潜る** / 敵 DOM の添字並列配列に足すと #44・#46 の罠 ⇒ `speechBubbles` と同じレジストリ方式。会議 = `dev-meetings/2026-09-07_hold-person-and-patron-labels.md`。モックアップ = https://claude.ai/code/artifact/efe9b999-ff00-4613-aad4-68072b5fb325 |

---

## 14. 実装結果 — 着地後の実測(実装窓が記入・2026-09-07)

実装 `b2d782e` / 受入ドライバ `62bf613`(起草 `b1143ac`)。
**受入 `verify_hold_person`(新規・base 10101)= 素 31/31 PASSED / FAILED 0 / PENDING 0 ・
`--negative` 8 本すべて担当ラベルが赤(空振り 0)。母集団 15 本の非退行は完全一致(§14-4)。**

⭐⭐⭐ **依頼書 §9 の (0c) を字義どおり読んで実装したら穴が開いていた。**
(0c) は「戦闘で **1 回以上発射されている**」を求めていたのに、初版の私の (0c) は
「枠に入っている」までしか測っていなかった。⇒ **(2c) を新設**し、本番の `clericAI` を
そのまま呼んで「実際に撃つ」ところまで縛った(実測 `ran: 2` で `stunned:4 / held:true`)。
⚠ これが無いと **#50 と同じ「配線は正しいのに実プレイでは死んでいる」欠陥**を 1 assert も
捕まえられない。⛔ 発射「率」は測っていない(§12 の宣言どおり)—— 他の枝が成立しない盤面
(全員満タン / アンデッド不在)で通すので、梯子の**順番**を後から動かしても腐らない。

### 14-0. 素の基準(STEP0。着手前 `b1143ac` / ⚠ 必ず直列)

⚠ §2-13 の母集団は「見込み」だったので、**機能の語 ∪ 導線の語**で数え直して 15 本にした。
ポートは 15 本の中で重複なし(実測)。

| ドライバ | 素 | exit | |
|---|---|---|---|
| `verify_npc_crowd` | 32/32 | 0 | ⭐ (1a)(2b) の当事者 |
| `verify_tavern_map` | 43/43 | 0 | |
| `verify_recruit_talk` | 25/25 | 0 | |
| `verify_pm_drawer_fit` | 75/79 (PENDING 4) | 0 | #56 の記録と一致 |
| `verify_prep_retire` | 30/30 | 0 | #55 の記録と一致 |
| `verify_party_match_setup` | 36/36 | 0 | |
| `driver_heromark_signplate` | 全 PASS | 0 | |
| `driver_action_priority` | 92/92 | 0 | ⭐ §2-10 の逐語アンカー |
| `verify_cone_cast` | 19/19 | 0 | |
| **`verify_walk_block`** | **22/23** | **1** | **着手前から赤(型3)** |
| `verify_run_chronicle` | 73/73 | 0 | |
| `driver_cast_circle` | 56/56 | 0 | |
| `verify_enemy_name_label` | 30/30 | 0 | |
| `driver_graph_reentry` | 57/57 | 0 | |
| **`driver_speech_v2`** | **45/46** | **1** | **着手前から赤(型3)** |

⭐⭐⭐ **着手前から赤い 2 本は、同じ真因の 1 つの欠陥だった**(#57 とは無関係 = 型3):
#53 が敵種 `swampNovice`(51 種目・`badge: "🐍"` あり・`enemy.cry.swampNovice` なし)を
足したとき、**在庫の総数を写経した検出器が 2 本同時に赤くなり、そのまま 4 チケット生き延びていた**。

- `verify_walk_block (3d)` … 「`badge` を持つ定義が **44 件**のまま」← 実測 45 件
- `driver_speech_v2 (A1)` … 「全 **50** 敵種に `enemy.cry.<type>` がある」← 実測 50/51

⛔ 数値を +1 して緑にするのは最悪手(次に敵種を足した日にまた同じ形で腐る)。
直し方は恒久教訓⑪のとおり **「在庫の総数を写経するのをやめる」**。#57 の範囲外なので**別チケット候補**。

### 14-1. 依頼書の主張が崩れた点(着手前 / 着地後の実測)

1. ⭐⭐⭐ **§3 の変更範囲が足りない — `tavern.html` に僧侶呪文の鏡が 3 枚ある。**
   `CLERIC_SKILLS_UI`(4145)/ `CLERIC_SLOTS_TABLE`(4775)/ `DEFAULT_KNOWN_TV`(4829)。
   コード自身が「**index.html と二重定義なので片方だけ直すと食い違う**」と警告している
   (#54 の sleep で同じ罠を踏んだ跡)。⇒ 3 枚とも更新した。
   ⚠ 放置すると「戦闘では撃てるのに酒場の聖典一覧では未習得に見える」。
2. ⭐⭐⭐ **§6-4「言い分けが要るのは 1 箇所だけ」は誤り。2 箇所目があった。**
   `stunned` を真実の源にしている **`fx-sleep` の紫オーラ**(`index.html` の 1 箇所)で、
   金縛りの敵が**眠っているように見えていた**。しかも文字より目立つ。
   ⚠⚠ **これは数値の assert では 1 つも捕まらなかった** —— 本番の暗い床の上で
   焼いて目視し、`.hrFx` を消すアブレーションで「紫は自分の輪ではない」と切り分けて初めて出た。
   ⇒ `held` のときだけ紫を譲る 1 行を足した(`fx-sleep` を読むドライバは 0 本と実測済)。
3. ⭐⭐ **§5-5 の `held` は STATUS_EFFECT_DEFS の先頭キーにできない。**
   `tools/verify_walk_block.js:950` が `Object.keys(STATUS_EFFECT_DEFS)[0]` を
   「適当な効果 id」として引いている。⇒ `prone` の**直後**へ置いた(装置 (0c2) で機械化)。
4. ⚠ **§2-1 の行番号 `CLERIC_SLOTS_TABLE` 12333 は実測 12323。**(識別子で引けば無害)
5. ⭕ **§2-3 の「helpless は 15 箇所すべてに配布済」は正しかった。**
   受入 (5a) が着手前 `b1143ac` と突き合わせて **ちょうど 15 箇所**と機械で数えた。
   ⇒ 自動クリティカルの実装コストは宣言どおり **0 行**。
6. ⭕ **§2-5(tick は既に揃う)/ §2-6(`executeSkillOn` 1 本で頭と仲間の両方)/
   §2-7(`spawnGroundFx` は z1 で敵の下)/ §2-8((I5) の真の不変条件は z-index)/
   §2-9(ボス判定は `def.isBoss || def.boss`)は全部正しかった。**
   ⭐ 特に §2-8 は当たりで、札を `.npcUnit` の子 + z<4 + `pointer-events:none` にしただけで
   `verify_npc_crowd` / `verify_tavern_map` を 1 assert も動かさずに済んだ。
   ⭐ おまけの保険も見つかった: `.npcUnit` は `filter` を持つので **stacking context を作る** =
   子は構造的に親の z-index 3 を超えられない。⛔ それに寄りかからず宣言でも守っている。

### 14-2. 測定器の欠陥 5 件(⛔ assert は 1 つも緩めていない。実装は全件無罪)

初回実走は 25/29。**落ちた 4 本はすべてドライバ側の欠陥**で、実装の欠陥は 0 件だった。
さらに `--negative` の初回で 2 本が空振りし、そこからもう 1 件出た。

| # | 症状 | 真因 | 直し方(⛔ 期待値は書き換えない) |
|---|---|---|---|
| 1 | (1d) `.npcUnit` が 96x96 でない(実測 **79.2**) | ⭐ **元から成り立っていない期待値を書いた**。酒場ステージは CSS で縮尺される | 96 を 79 にするのは最悪手(端末で動く)。**測定点を移す** = 「札の有無で矩形が 1px も変わらない」を **3 経路**(子である / `?patronlabel=0` の同じ席と一致 / **札の無い NPC** とも一致)で突き合わせる。縮尺非依存になり、しかも目的そのものを測る形に**強くなった** |
| 2 | (1f) 勧誘ダイアログが開かない | ⭐⭐ **背景タブへの `page.mouse.click` は届かない**。(1f) の前に別クエリのタブを 2 枚開いていた | 叩く直前に `bringToFront()`。併せて「開かなかった理由」(命中先 / ダイアログの有無 / 席一覧)を必ず持ち帰るようにした(⛔ 黙って false を返さない) |
| 3 | (5a) `helpless` の行が 81 → **83** | ⭐⭐⭐ **自分が書いた解説コメントの `helpless` を実参照として数えていた**(既知の恒久教訓の再演) | ⛔「コメントに書かない」で回避しない。**コメントを剥いでから数える**形へ直し、主張どおり「**コード**が変わっていない」を測る。剥ぎ過ぎの検算に「`helpless =` の攻撃解決が 15 箇所」を装置として添えた |
| 4 | (4c) held が 4 体で「5 体以上」に届かない | ⭐ **母集団ガードが本体の敷居を満たしていなかった**(#50 の型)。命中ロールがあるので 6 発撃っても 2 体は RESIST | ⛔ 敷居を下げない。**命中するまで撃ち直す**決定論的な仕込みへ(免疫の相手では何回撃っても `held` にならないので主張は 1 ビットも弱まらない) |
| 5 | 変異 `ringarray` が空振り | ⭐⭐⭐ (4b)(5a)(5b) が**凍結した原本**を読んでいて、**配信バイト(変異後)を見ていなかった**。恒久教訓「`--mutate` は fs で作業ツリーを読む assert には効かない」の同型 | 配信バイトを読む形へ直したら、`ringarray` が一発で赤くなった |

⭐⭐⭐ **もう 1 件、負のコントロールが暴いた本物のフレーク**:
命中ロール(d20)があるので 1 発では 2〜3 割が RESIST に落ち、**(3a)(3c)(2a) が
「運で緑・運で赤」のコイン投げ**になっていた。症状は 2 つの顔で出た ——
`labelsib`(酒場側の変異)で **index 側の (3a)(4a2) が巻き添えで赤**になり、
`noimmune` では逆に **担当の (3a) が空振り**した。#4 と同じ「撃ち直す」仕込みで両方消え、
`labelsib` の巻き添えは 7 ラベル → 5 ラベルへ縮んだ(= 診断が正しかったことの裏付け)。

### 14-3. 負のコントロール(⚠ 担当表は机上で書かず `--only` で 1 本ずつ実走して確定)

| 変異 | 何を壊すか | 担当(実測で赤くなったラベル) |
|---|---|---|
| `labelhit` | 札の `pointer-events` を `auto` に | **(1b)** のみ |
| `labelz` | 札の z-index を 5 に(席札 4 を奪う) | **(1c)** のみ |
| `labelsib` | 札を `.npcUnit` の**兄弟**にして親の外へ | **(1d)** + (0a)(1a)(1a2)(1b) |
| `nohold` | `applyStatus(t,"held",…)` を落とす(`stunned` だけ) | **(2a)** + (2c)(3c)(4a)(4a2)(4c) |
| `ringground` | 輪を `spawnGroundFx` で出す(z1 = 敵の下) | **(4a)** + (4a2)(4d) |
| `ringarray` | 輪の DOM を敵の**添字並列配列**へ足す | **(4b)** のみ |
| `noimmune` | アンデッド / ボスの除外を落とす | **(3a)** + (3b)(4a2) |
| `nocap` | `HOLD_RING_MAX` の上限を外す | **(4c)** のみ |

⭐ `ringarray` と `nocap` と `labelhit` / `labelz` が **担当 1 本だけを狭く撃ち抜いている**のが
「節が分離している」証拠。逆に `nohold` の巻き添えが広いのは、`held` が
「輪 / 表示 / 免疫の除外」すべての土台だから(= 設計どおり)。
⛔ 巻き添えは `NEG_EXPECT` の担当表には**書いていない** —— 書くと、母集団が消えただけの
偽の赤で空振りを隠せてしまう。

### 14-4. 母集団 15 本の非退行(着地後に**直列**で再走。⛔ 期待値の変更 0 件)

**15 本すべてが着手前と完全一致。緑を赤にした本は 0。**
⭐ 件数一致で止めず、**exit コード / 集計行 / FAIL 行の集合**の 3 つを機械で突き合わせた
(件数だけ一致して中身が入れ替わる回帰は、この diff でしか捕まらない)。

| ドライバ | 着手前 → 着地後 |
|---|---|
| `verify_npc_crowd` | 32/32 → **32/32** ⭐ (1a)(2b) の当事者 |
| `verify_tavern_map` | 43/43 → **43/43** |
| `verify_recruit_talk` | 25/25 → **25/25** |
| `verify_pm_drawer_fit` | 75/79 (PENDING 4) → **75/79 (PENDING 4)** |
| `verify_prep_retire` | 30/30 → **30/30** |
| `verify_party_match_setup` | 36/36 → **36/36** |
| `driver_heromark_signplate` | 全 PASS → **全 PASS** |
| `driver_action_priority` | 92/92 → **92/92** ⭐ §2-10 の逐語アンカーが無傷 |
| `verify_cone_cast` | 19/19 → **19/19** |
| `verify_walk_block` | 22/23 → **22/23**(同じ (3d)・詳細文字列まで同一) |
| `verify_run_chronicle` | 73/73 → **73/73** |
| `driver_cast_circle` | 56/56 → **56/56** |
| `verify_enemy_name_label` | 30/30 → **30/30** |
| `driver_graph_reentry` | 57/57 → **57/57** |
| `driver_speech_v2` | 45/46 → **45/46**(同じ (A1)) |

⭐⭐ **独立源の裏付けが 2 つ取れた**(私の受入だけに頼っていない):

- `verify_walk_block (3b)` が「敵の名前札と状態アイコン列の矩形が #46 前と **最大差 0.000px**」を
  再現した ⇒ 輪を足しても敵まわりの DOM 幾何は 1px も動いていない。
- `verify_walk_block (3c)` が `enemyBadgeElements 10 本 / enemies 10 体` を報告 ⇒
  **添字並列が無傷**であることが、私の受入 (4b) とは **別のドライバ**からも確認できた。

⚠ 比較の途中で 1 度、**空文字どうしを「一致」と読む偽の緑**を作りかけた
(awk の区切りを `##### EXIT` にしていたので全ブロックが空になり、5 本が「前 [] / 後 [] → 一致」)。
⭐ 恒久教訓「`0 件` を見たら、機能が壊れたのではなく **母集団へ到達していない** を先に疑う」の
**比較器側の版**。区切りを次の `##### BEGIN` へ直して採り直した。

### 14-5. 残り = 実機体感(iPhone 縦持ちで確かめてもらう / §10 を着地後の実測で更新)

1. **頭上札の 12px が読めるか**(compact は 11px。⚠ #44 で敵の札 7.7px が未確認のまま残っている)
2. **札 4 枚が画面内で重ならないか**(patronA/B は隣接タイル、C/D も隣接)
3. ⭐⭐ **金の輪の光が強すぎて敵が読めなくならないか**(了解済みの弱点②)
   → 強すぎたら **CSS 変数 `--holdGlow` の 1 行**だけ動かす(既定 0.85)。⛔ 案の作り直しはしない
4. ⭐ **天へ伸びる光条が薄すぎないか** —— 本番の床の上で焼いた実測では**かなり控えめ**だった。
   物足りなければ同じ `--holdGlow` で上がる(⛔ 受入条件は光量を 1 つも縛っていない)
5. ⭐⭐ **同時 4 体で描画がカクつかないか**(弱点①)。上限は `HOLD_RING_MAX = 4`、
   1 体あたり DOM 6 枚 = 最大 24 枚。→ 重ければまず上限を 3 へ
6. **輪が「掛かっている」に見えるか**(モックアップと実機で印象が変わらないか)
   ⭐ desktop の実測では成立していた(環の上半分が体の後ろ・下半分が前を通っている)
7. **4 ターンの拘束が長すぎないか**(シナリオ 4 以降の勝率)
8. **「金縛り」表示が読めるか**(`STUNNED` との言い分けが伝わるか)。
   ⭐ 紫の眠りオーラは金縛り中は出なくなったので、色でも見分けが付くはず

### 14-6. 別チケット候補(#57 の範囲外・実測つき)

- ⭐⭐⭐ **在庫の総数を写経した検出器 2 本の回収**。`verify_walk_block (3d)` と
  `driver_speech_v2 (A1)` が **#53 の `swampNovice` 1 件**で同時に腐り、4 チケット生き延びている。
  ⛔ 数値を +1 して緑にしない。「総数を写経するのをやめる」形へ言い直すのが正しい直し方。
  ついでに **`enemy.cry.swampNovice` が実際に無い**(= 蛇神司祭だけ鳴かない)ので、
  台詞を 1 本足せば `driver_speech_v2` は実装側で自然に緑へ戻る。
- ⛔ `saveAbility` の実装(魔法使いの 5 呪文の flavor が現状**嘘**。§2-11 / §11 で既出)
