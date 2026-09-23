# #72 誰が来るのか分かるようにする(名前・職業・Lv の表示 + 名前とジョブの固定 + 引き出しの Lv 判定の是正)

- **起草**: 2026-09-19(起草窓 `claude-cc` / セッション `0e9709e5`) / **ステータス**: **承認済**(2026-09-19 ユーザー承認)
- **着手**: ⏸ **#71 の着地後**(同じ `tavern.html` を changelog 経由で触るため)
- **基準コミット**: `e8f230e`(⚠ #71 実装中のため HEAD は動く。⛔ 行番号は**識別子で引き直す**)
- **触るファイル**: `tavern.html` / `tools/verify_member_identity.js`(新規・base **10401**) / `実装依頼書/README.md`
- ⭐ **`index.html` は触らない**(§2-1 で確認。本体側の Lv 判定は**既に本人の Lv を見ており正しい**)。
  ⚠ ただし changelog(`tools/add_changelog.py`)が `tavern.html` を書くので、`tavern.html` は必ず触る。
- ⛔ **着手は #71 の着地後**(#71 が `index.html` と changelog 経由で `tavern.html` を触っている)。
  `git add .` 禁止・ファイル単位 add・`git add <paths> && git commit -m ... -- <paths>` の 1 複合コマンド。

---

## 1. 目的

ユーザー報告「**シナリオ2 でライトニングボルトを全く撃たない**」(2026-09-19)の原因を追った結果、
**引き出しで 11 個配分しても、出撃する魔法使いが Lv2 なら本体が配分ごと捨てている**ことが実測で判明した。
さらに、その原因を追う過程で「**誰が来るのか分からない**」という、より根の深い問題が見えた:

- マッチング画面のカードに **Lv が出ていない**(名前と職業は出ている)。
- 引き出しの見出しは「魔法使い — ロルフ」だが、**そのロルフの Lv が分からない**。
- 名前は職業と無関係な共有プールから引かれるので、**同名で職業違いの人物が複数生まれる**
  (ユーザーの言葉: 「ロルフはジョブ違いで、何人かいるし。わかり辛いね」)。

**ユーザー決定(2026-09-19)**:

- 「今後、職業と名前、レベルをわかりやすくしよう。」
- 「マッチング画面で、レベル見れる形にしてほしい。」
- 「なんなら、酒場ですでに、名前は出てるけど、名前職業レベル全部見れる感じにしてほしいかも。」
- 「それと、**名前とジョブは固定**にしよう」
- ⛔ 不採用: 巻物のドロップ率の変更(「ドロップ率に不満はないです」)。
- ⛔ 不採用: Lv 不足の呪文を一覧から消す(⭐ `[Lv3 必要]` を**見せる**ほうが「あと 1 レベルで使える」が伝わる。
  §5-2 で判定 Lv を直せば、この表示が初めて正しく機能する)。

---

## 2. 着手前の実測(起草窓が `e8f230e` の本番コードとヘッドレスで確かめた事実)

> ⚠⚠⚠ **行番号の読み方(2026-09-20 に全参照を引き直した)**
> 本節以下の行番号は **基準 `a93e0fd`**(= #71 着地後の `origin/main`)へ更新済み。
> ⛔ **行番号は従、識別子(逐語)が主。** 着手時は必ず逐語で引き直してから使うこと。
>
> - `index.html` は #71 項目2(`515122f` / `a137740`)で **一律 +40** ずれた(起草時 `7dae29e` → 現在)。
> - `tavern.html` は #71 で**ずれていない**(変更は changelog の 2 行追加 / 2 行削除で差し引き 0。**10,751 行で不変**)。
> - ⚠ ただし `tavern.html` には **起草時からの誤りが 5 箇所**あり、2026-09-20 に訂正した
>   (`:4622`→`:4621` / `:7428`→`:7429` / `:7850`→`:7839` / `:8800`→`:8798` / `:8801`→`:8799`)。
>   ⭐ これは**ドリフトではなく最初から違っていた**もの。⇒ 着手時の引き直しは「動いたか」ではなく
>   **「そもそも合っているか」**を見ること。
> - ⭐⭐⭐ **「その語で一意に引ける」も要約である。アンカーに採る前に件数を数える。**
>   例: `getLevelFromXP(inventory.xp)` は `tavern.html` に **8 箇所**あって一意にならない。
>   `const lv = getLevelFromXP(inventory.xp);` まで含めて **ちょうど 1 件**。

### 2-1. ⚠⚠⚠ 実測: Lv2 の魔法使いは、11 個配分しても 1 枚も持てない

ユーザー提供のスクリーンショットと**同じ配分**(スリープ 1 + ライトニングボルト 11、主人公 Lv7)を作り、
魔法使いの Lv だけを振って `equippedSkills` / `spellSlots` を読んだ(scratchpad の使い捨てプローブ・4 ページとも起動確認済):

| 魔法使いの Lv | 実際に組まれた `equippedSkills` | `spellSlots` |
|---|---|---|
| **2** | `["sleep"]` | `{sleep:1}` ← ★ **LB 11 個が丸ごと消滅** |
| 3 | `["sleep","lightning-bolt"]` | `{sleep:1, lightning-bolt:4}` |
| 4 | `["sleep","lightning-bolt"]` | `{sleep:1, lightning-bolt:5}` |
| 7 | `["sleep","lightning-bolt"]` | `{sleep:1, lightning-bolt:9}` |

落としているのは `initAllySpellSlots` の **`if (lv < lvReq) continue;`**(`index.html:14014`〜`:14015`。
`initLeaderSpellSlots` 側は `:20075`〜`:20076`)。`continue` なので**その呪文の配分が丸ごと飛ぶ**。
`lightning-bolt` の `levelReq: 3` は `index.html:22212`。

⭐ **アンカー(逐語・基準 `a93e0fd`)**: `if (lv < lvReq) continue;` は `index.html` に **2 件**
(ally 側 `:14015` / leader 側 `:20076`)。`"lightning-bolt": {` は **1 件**(`:22209`、`levelReq` は `:22212`)。
⚠ `index.html` は**オブジェクトキー形式**なので `grep 'id: "lightning-bolt"'` は **0 件**を返す
(`id:` 形式は `tavern.html` だけ)。⛔ 0 件を不在の根拠にしない。

⭐ **本体は正しい** —— 判定に使っているのは**その仲間自身の Lv**(`ally.level`)であって主人公 Lv ではない。

### 2-2. ⚠⚠⚠ 真の欠陥: 引き出しは「主人公の Lv」で判定している

同じ関数の中に、**正しい情報と間違った情報が 41 行違いで同居**している(`tavern.html`・基準 `a93e0fd`):

    :8757   title.textContent = slot.name + " — " + (m.isHero ? "あなた" : (m.name || slot.name));
            ↑ m = その回に実際に来る本人 (m.level を持っている)
    :8798   const lv = getLevelFromXP(inventory.xp);              ← ★ 真因はこの 1 行 (主人公の Lv)
    :8799   const totalMax = getMaxSpellSlotsForClassTV(classKey, lv);
    :8800   const arr = Array.isArray(selection.partySkills[classKey]) ? selection.partySkills[classKey] : [];
    :8801   const totalUsed = isAutoSlotClassTV(classKey) ? totalMax : arr.length;
    :8802   magics.forEach(sk => listEl.appendChild(renderSpellSlotItem(sk, classKey, totalUsed, totalMax, lv)));

`renderSpellSlotItem`(`:7404`)は受け取った `currentLv` で
`const lvOk = currentLv >= lvReq;`(**`:7411`**)を判定し、偽なら `.full`(選択不可)+ `[LvN 必要]` の赤バッジを出す
(**`:7429`** の `const lvLock = !lvOk ? ... [Lv${lvReq} 必要] ... : "";`)。
⇒ **主人公が Lv7 なら、Lv2 の仲間の行にも `[Lv3 必要]` が出ず、11 個置けてしまう。**
もう 1 つの判定は **`:7839`** の `const playerLv = getLevelFromXP(inventory.xp);`。
⚠ 起草時に書いた `:7850` は**その値を受け取る `renderSpellSlotItem` の呼び口**であって判定行ではない
(2026-09-20 に逐語で引き直して訂正)。

⭐ **正しい関数は既にある**: `memberLevelOf(classKey)`(`tavern.html:4850`)。準備画面の表示 Lv はこちらを使っており、
コメント(`:4835`)にも「準備画面が表示 Lv を引くとき」と明記されている。**引き出しだけが主人公 Lv を見ている。**

⭐ これは #70 が直した「引き出しで 0 にしたのに 0 が守られない」の**鏡像**(UI の約束と本体の解釈のズレ)。

### 2-3. 仲間の Lv はどこから来るか(主人公 Lv ではない)

- `assignCompanionLevels`(`tavern.html:7932`)… `questLevel` → `QuestGen.qGetTier()` → 帯から抽選。
  `BAND = { tier1: [2,4], tier2: [5,8], tier3: [9,10], tier4: [10,10] }`。
- `qGetTier(level)` は `level <= 4` で **tier1**。シナリオ2(`bandits-forest`)の `recommendedLevel` は **4**
  ⇒ **帯は `[2,4]`**。主人公 Lv は `clampCompanionLevel` の**上限**にしか効かない。
- 名簿の顔は**振り直さない**(`:7945`)。名簿の Lv は **生還 3 回ごとに +1**
  (`js/mercenary-roster.js:63` `RUNS_PER_LEVEL = 3` / `LEVEL_MAX = 10`)。
- ⇒ **主人公が Lv7 でも、来る魔法使いは Lv2 でありうる**。

### 2-4. いま「名前・職業・Lv」がどこに出ているか(全数)

| 画面 | 名前 | 職業 | Lv | 場所 |
|---|---|---|---|---|
| マッチングのカード | ✅ | ✅ | ❌ | `tavern.html:9065`〜`:9073`(`nameEl` / `classEl`。⭐ `m.level` はその場にある) |
| マッチングの引き出しの見出し | ✅ | ✅ | ❌ | `:8757` |
| 酒場の声掛けダイアログ | ✅ | ✅ | ❌ | `:6371`〜`:6372`(`recruitName` / `recruitRole`) |
| 傭兵名簿パネル | ✅ | ✅ | ✅ | `:6061` 付近(`職業 / Lv◯ / 同行 ◯ 回`)⇒ **ここだけ既に 3 点そろっている** |

### 2-5. ⚠⚠ 名前は職業と無関係な共有プールから引かれる(= 同名・別職が生まれる)

    tavern.html:4584  const NPC_NAMES = [ ... 16 名 ... ];        // ⚠ 職業と無関係な共有プール
    tavern.html:4621  function pickUniqueName(usedSet) { ... }    // ⚠ 一意なのは **1 編成の中だけ**
    tavern.html:4627  function makeNpcMember(classKey, usedSet) { ... name: pickUniqueName(usedSet) ... }

⇒ 別の回・別の職に同じ名前が付く。⚠ これが効いている既知の穴が **2 つ**:

- `tavern.html:9088` のコメント: 「⚠⚠ 判定は `DFRecruits.has(m.name)` = **名前引き**。**同名の別人が名簿に居ると両方に付く**。
  ⭐ 卓は 4 席・上限は RECRUIT_MAX (3 人) なので実害の出る確率は無視できる ⇒ **許容する**」
  ⇒ ⚠ **2026-09-19 にユーザーが実際に踏んだ**(「ロルフはジョブ違いで、何人かいるし」)。許容の前提が崩れている。
- `js/recruit-candidates.js:31`〜`:38` / `:77` / `:89` / `:101`: **同一人物の判定キーが `name`**
  (`has(name)` / `add` は同名を弾く / `remove(name)`)。モジュールの注記も
  「`pickUniqueName()` が 1 回の抽選内で名前を重複させないので、卓の 4 人の中では name で一意」
  と、**1 編成内でしか成り立たない前提**を明示している。

⇒ ⭐ **「名前とジョブを固定」は、この弱い前提を正す修正でもある**(名前が人物を一意に決めるようになる)。

### 2-6. 未習得の呪文は一覧に出ない(ユーザーの質問への答え)

`tavern.html:8795` / `:7831` とも `slot.skillPool.filter(sk => sk.mpCost > 0 && isSpellKnownTV(...))`
⇒ **未習得の呪文は一覧から除外される**(選べない行として出るのではなく、**出ない**)。
⚠ 一方 **Lv 不足は除外されない**(出たうえで `.full` + `[LvN 必要]`)。この非対称は意図的
(⭐ 「あと 1 レベルで使える」を見せるため)なので**保つ**。

### 2-7. changelog / 行末 / ポート

- `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html","tavern.html","audio.js")` ⇒ **鳴る**(`tavern.html` を触る)。
  書けるプレイヤー向けの要約は実在する(§10)。
- `tavern.html` は**純 CRLF**(⛔ 改行を `grep` で測らない。`py` のバイト数えで確認すること)。
- ポート: #71 が **10371〜10383** を使用済み、起草窓の #72 プローブが **10391 帯**を使用済み ⇒ 本チケットの
  新規ドライバは **base 10401**(変異 10402〜10413)。⚠ 着手時に空きを再確認する。
  ⭐ #71 項目5 の申し送り: **10401 の次に空くのは 10411 以降**。⛔ 10391 を空きとして再利用しない。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | 柱1 表示(カード / 引き出し見出し / 声掛け)・柱2 判定 Lv の是正・柱3 名前プールの職業別化・changelog |
| `tools/verify_member_identity.js` | 新規(base 10401) |
| `実装依頼書/README.md` | ✅ **2026-09-20 に起草窓が #72 行を追加済み**(#71 着地により制約は解除)|

⛔ `index.html` は触らない(§2-1 で本体側は正しいと確認済み)。⛔ `js/recruit-candidates.js` と
`js/mercenary-roster.js` は**読むだけ**に留める(保存形を変えない。§5-3 参照)。

---

## 4. STEP1 — 着手前の基準取り(本番も tools も 1 バイトも触らない)

1. `git log --oneline -1` / `git status --short` を記録。**#71 は 2026-09-20 に着地済み**(`a93e0fd` = `origin/main`)。
2. 母集団を 3 段の union で導出(⛔ 本数を定数で焼かない):
   - 触る語 — `grep -ln "pmDrawer\|pmName\|pmClass\|renderSpellSlotItem\|memberLevelOf\|NPC_NAMES\|pickUniqueName\|DFRecruits\|DFRoster" tools/*.js`
   - `tavern.html` を読む本
   - 測定器のソースを読む測定器
3. **§2-1 の表を本番で再現**する(Lv2/3/4 の 3 腕で `equippedSkills` を読む)。⚠ 再現しなければ実装へ進まず §12-0 に理由を書いて止まる。
4. **引き出しが主人公 Lv を使っている**ことを実測で示す(主人公 Lv7 × 仲間 Lv2 で `[Lv3 必要]` が**出ない**ことを DOM で確認)。

---

## 5. STEP2 — 実装

### 5-1. 柱1: 名前・職業・Lv を出す(撤退 `?whois=0`)

- **マッチングのカード**(`tavern.html:9065`〜`:9073`): `classEl` を `職業 + " Lv" + <本人の Lv>` にする。
  ⭐ `m.level` がその場にある。⛔ 名前の行(`nameEl`)は触らない(主人公は「職業(あなた)」のまま)。
- **引き出しの見出し**(`:8757`): `slot.name + " — " + 名前 + " Lv" + <本人の Lv>`。
- **酒場の声掛けダイアログ**(`:6372` `recruitRole`): `職業 + " Lv" + <本人の Lv>` を先頭に置き、`trait` は従来どおり後ろへ。
- ⛔ **Lv の出所は 1 箇所に集約する**: `memberLevelOf(classKey)`(§5-2 と同じ関数)。
  ⚠ 声掛けダイアログは「まだ編成に居ない相手」なので `m.level` を直接読む必要がある ⇒ 引き方を 1 つのヘルパへ畳む。
- ⛔ **傭兵名簿パネルは触らない**(既に 3 点そろっている。`:6061`)。

### 5-2. 柱2: 引き出しの判定 Lv を本人へ(撤退 `?drawerlv=0`)

**`tavern.html:8798` と `:7839` の 2 箇所**(⚠ 起草時は `:8800` / `:7850` と書いていたが、
**どちらも判定行ではなかった**。2026-09-20 に逐語で引き直して訂正):

    :8798   const lv       = getLevelFromXP(inventory.xp);   // 変更前 ← アンカー (この逐語で 1 件)
            const lv       = memberLevelOf(classKey);        // 変更後
    :7839   const playerLv = getLevelFromXP(inventory.xp);   // 変更前 ← アンカー (この逐語で 1 件)
            const playerLv = memberLevelOf(slot.classKey);   // 変更後

⚠ `:7839` 側の引数は周辺が使っている **`slot.classKey`**(`:7831` / `:7850` で実測)。`:8798` 側は `classKey`。
⚠ 主人公なら `memberLevelOf` が `getLevelFromXP(inventory.xp)` を返すので、**主人公の挙動は不変**。

- ⚠ `memberLevelOf`(`:4850`)は「主人公なら `getLevelFromXP(inventory.xp)`、NPC なら clamp 済の本人 Lv」を返す
  ⇒ **主人公が呪文職のときの挙動は 1 ビットも変わらない**(これを §8 の恒等 assert にする)。
- これで Lv 不足の呪文に `[Lv3 必要]` が出て `.full` になり、**そもそも置けなくなる**。
- ⚠ `totalMax = getMaxSpellSlotsForClassTV(classKey, lv)` も同じ Lv を使う ⇒ **枠の上限も本人基準**になる。
  ⛔ 既に上限を超えて保存されている古いセーブを**壊さない**(読み込み側は本体の `upperCap` が切る = §2-1 の実測どおり)。

### 5-3. 柱3: 名前とジョブを固定(撤退 `?namejob=0`)

- `NPC_NAMES`(`:4584`)を**職業別の名前リスト**へ置き換える(例: 6 職 × 6 名 = 36 名)。
  `pickUniqueName(usedSet)` → `pickUniqueName(classKey, usedSet)` とし、**その職の名前だけ**から引く。
- ⭐ これにより「ある名前 = 常に同じ職業」となり、`DFRecruits.has(name)` / `DFRoster` の**名前キーが人物を一意に決める**
  ようになる(§2-5 の 2 つの穴が同時に塞がる)。
- ⛔ **保存形は変えない**(`js/recruit-candidates.js` / `js/mercenary-roster.js` の `{name, classKey, ...}` はそのまま)。
- ⚠⚠ **既存セーブの扱い**: 名簿に旧規則の顔(ある名前 × 別の職業)が既に居ると、新しい規則と矛盾する。
  ⇒ **移行はしない**(古い顔はそのまま残す)。⛔ 名簿を書き換える実装にしないこと。
  代わりに §8 で「**新しく作られる顔は必ず職業別リストから引かれる**」だけを assert する。
- ⚠ 名前の総数が減ると編成内の重複回避(`usedSet`)が詰まる ⇒ **1 職あたり 4 名以上**にする
  (卓は 4 席・同職が複数来る可能性があるため)。

### 5-4. changelog

§10 の 1 行を `py tools/add_changelog.py` で足す。

---

## 6. STEP3 — 既存 golden の言い直し(必要なものだけ)

- ⚠ **赤くなった assert の ID を控えてから**言い直す(#60 の教訓)。予想で書き換えない。
- 腐りうる本(着手前に色を採る): `verify_party_match_setup`(実座標クリック 4 箇所)/ `verify_darkvision`(同 1 箇所)/
  `verify_pm_drawer_fit`(引き出しの高さ)/ `verify_mercenary_roster` / `verify_recruit_talk` / `verify_recruit_size`。
- ⭐⭐⭐ **文字を足すと行が折り返して高さが変わり、実座標クリックの golden が赤くなる**(#56 は器のスクロールで 6 本赤)。
  ⇒ 柱1 は **`inline` のまま**・**枠線の太さを変えない**(#70 項目2 の実測で「縦が 1px も伸びなければ全部無傷」)。

---

## 7. 撤退スイッチ(3 本)

- **`?whois=0`** — 名前・職業・Lv の表示を従来へ(Lv を出さない)。
- **`?drawerlv=0`** — 引き出しの判定 Lv を主人公 Lv へ戻す。
- **`?namejob=0`** — 名前プールを共有 16 名へ戻す。
- 判定位置 = `tavern.html` の定数 3 本。⚠ マッチング画面は `tavern.html` 内で完結するのでページ遷移をまたがない。

---

## 8. 受入条件 — `tools/verify_member_identity.js`(新規・base 10401 / 変異 10402〜10413)

⚠⚠⚠ **3 つの柱は「もう片方を止めた腕」で測る**(#70/#71 の教訓)。表示の柱が判定の柱に救われて緑、を防ぐ。

### ⚠ 計測機構

- 酒場は `tavern.html` を直接開く。⛔ **`openPrep` を経由して編成を仕込まない**
  (`tavern.html:6444` は `:6468` で `regeneratePartyMembers()` を無条件に呼び、仕込んだ顔ぶれが消える)。
- 「素の状態」は **`localStorage` を消すのではなく、酒場が書くものを再現する**
  (⭐ #72 の起草中に踏んだ教訓: **「消す」は「素」ではない**。`partySkills` を消すと `hasPreset` が偽になり、
  実プレイと違う経路 `defaultCasterMap` を通ってしまう)。

### §0 装置

- **(0a)** 引き出しが実際に開き、対象職の行が **1 行以上**描画されている(⛔ 0 行なら全 assert が空振り)。
- **(0b)** 期待値を**盤面から導出**する(⛔ Lv や呪文名を表に写経しない。仕込んだ `m.level` から導く)。
- **(0c)** 変異ページが実際に起動している(⭐ `document.title` が空でないことまで見る。
  **「変数が見えない」は「ページが空」と区別できない** = 起草中に実際に 2 回誤診した)。
- **(0d)** 「呼ばれた/在る」で緑にせず**値**を見る(表示なら**テキストの逐語**、判定なら**行の class**)。

### §1 表示(柱1・`?drawerlv=0&namejob=0` の腕で)

- **(1a)** 仲間の Lv を 2 にした腕で、マッチングのカードに **`Lv2` の逐語**が出る。`?whois=0` では出ない。
- **(1b)** 引き出しの見出しに **名前 + Lv** が出る。⭐ 2 経路: 見出しのテキストと、仕込んだ `m.level` の一致。
- **(1c)** 声掛けダイアログの `recruitRole` に **職業 + Lv** が出る。
- **(1d)** 傭兵名簿パネルの表示は **1 バイトも変わらない**(恒等)。

### §2 判定 Lv(柱2・`?whois=0&namejob=0` の腕で)

- **(2a)** 主人公 Lv7 × 仲間の魔法使い Lv2 で、ライトニングボルトの行に **`[Lv3 必要]` が出て `.full` が付く**。
  `?drawerlv=0` では**出ない**(= 現在の欠陥の再現)。
- **(2b)** その状態で **+ ボタンを押しても個数が増えない**(置けない)。
- **(2c)** 仲間の魔法使いを Lv3 にすると `[Lv3 必要]` が消え、置ける。
- **(2d)** **主人公が魔法使いのときは 1 ビットも変わらない**(恒等。`memberLevelOf` が主人公 Lv を返すため)。
- **(2e)** 枠の上限 `totalMax` が本人基準になる(Lv2 の仲間で上限が主人公 Lv7 の値でない)。

### §3 名前とジョブ(柱3・`?whois=0&drawerlv=0` の腕で)

- **(3a)** 新しく作られた NPC の名前が、**その職業の名前リストに含まれる**(⛔ 名前の表を写経せず、
  実際のリストから導出して照合)。
- **(3b)** 同じ名前が**2 つの職業に現れない**(名前 → 職業の写像が単射)。⚠ 編成を N 回作って集める。
- **(3c)** `?namejob=0` では従来どおり共有プールから引かれる。
- **(3d)** 既存の名簿データを**書き換えていない**(保存形の恒等)。

### §4 恒等(非退行)

- **(4a)** 3 本とも 0 にすると、着手前と**同じ DOM テキスト**になる。
- **(4b)** 引き出しの**高さが変わっていない**(§6 の実座標クリック対策。⭐ #70 項目2 と同じ測り方)。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 何をする | 担当(⚠ 机上で書かず実走で決める) |
|---|---|---|
| `lvhero` | 判定 Lv を主人公へ戻す(現在の欠陥の再現) | (2a)(2b) |
| `lvnoshow` | カードの Lv を消す | (1a) |
| `headnolv` | 見出しの Lv を消す | (1b) |
| `sharedpool` | 名前プールを共有へ戻す | (3a)(3b) |
| `capfromhero` | 枠の上限だけ主人公 Lv のまま | (2e) |
| `rosterwrite` | 名簿の保存形を書き換える | (3d) |
| `switchdead` | 撤退判定を常に真に | (4a) |

⚠⚠⚠ 変異の逐語は**実装後に取り直す**(#70 項目2 で、本体を言い直した結果アンカーが 1 箇所に減った実例あり)。

### 既存 golden の非退行

- 母集団を §4-2 の定義で導出し、全数・同じ順で直列再走。**2 経路**(assert id の指紋 + 判定行の多重集合)。
- ⭐⭐⭐ 比較器は「① これから当てる母集団と同じ広さで自己検証 → ② 変えていないはずの本で差 0」の順で先に通す
  (#70 項目5 の拡張版 `fp70e.py` を使う。⛔ 項目3 版は 10 書式を落とす)。
- ⚠ 既知フレーク **7 本**: `probe_n4_stall` / `driver_field_wagon` / `monsters_chimera` / `monsters_hobgoblin` /
  `monsters_griffon` / `verify_run_chronicle` / `driver_speech_engine`。⭐ **「安定した赤」も安定とは限らない**。
- ⚠ `driver_action_priority --negative` は #35 以来**着手前から exit 1**。本チケットの責任ではない。

### ⛔ 測らないこと

- 実プレイでの「ライトニングボルトを撃った回数」(⭐ 本チケットは**置けるかどうか**までを直す。
  撃ち方は #71 の担当)。
- 名前の見た目・語感。
- 仲間の Lv 抽選の帯(`[2,4]`)そのもの。⇒ §11。

---

## 9. 実機/実感の確認(ここが本当の受入)

1. マッチング画面で、4 人のカードに **職業・名前・Lv** が出ているか。
2. Lv2 の魔法使いが来た回に、引き出しでライトニングボルトが **`[Lv3 必要]` で置けない**ようになっているか。
3. 同じ名前の別職が出てこないか(数回出撃して確認)。
4. ⭐ 「置いたのに撃たない」が**起きなくなった**か(置けないので、期待が裏切られない)。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

- `<li><b>仲間の名前・職業・レベルがひと目で分かるように</b> — マッチング画面のカードと設定の見出しにレベルを表示。</li>`
- `<li><b>レベルの足りない呪文は置けなくなった</b> — これまでは置けてしまい、出撃すると黙って外れていた。</li>`

---

## 11. やらないこと(別チケット送り)

- ⛔ **仲間の Lv 抽選の帯の見直し**(シナリオ2 が `[2,4]` なのが妥当かはバランスの話)。
- ⛔ **巻物のドロップ率**(ユーザー明言: 「ドロップ率に不満はないです」)。
- ⛔ **Lv 不足の呪文を一覧から消す**(§1 の不採用理由)。
- ⛔ **既存の名簿データの移行**(§5-3)。
- ⛔ **`DEFAULT_KNOWN.mage` にライトニングボルトを足す**(スクロール設計と衝突する。必要になれば別チケットで諮る)。
- ✅ **`実装依頼書/README.md` の #72 行は 2026-09-20 に起草窓が追加済み**(#71 が `a93e0fd` で着地したため)。起草時の文面は下記(⚠ 実際に足した行は「承認済・着手可」と行番号の注記を加えた版):

      | 72 | [2026-09-19_member-identity-level.md](2026-09-19_member-identity-level.md) | 起草(未承認) | 0% | 誰が来るのか分かるようにする。マッチングのカード・引き出しの見出し・声掛けに **名前/職業/Lv** を出す + 引き出しの Lv 判定を**主人公 Lv から本人の Lv へ**(⚠⚠⚠ 実測: 仲間が Lv2 だと 11 個配分しても `equippedSkills` が `["sleep"]` になり LB が丸ごと消える)+ **名前とジョブを固定**(⚠ 同名別職が `DFRecruits` の名前キーを壊していた)。撤退 `?whois=0` / `?drawerlv=0` / `?namejob=0`。受入 `tools/verify_member_identity.js`(base 10401) |

---

## 12. 実装結果

<実装窓が埋める>

---

### 12-0. 着手前の実測(項目1 / 2026-09-21・実装窓 セッション `b34987cb-…`)

⛔ 本項目は **測るだけ**。`index.html` / `tavern.html` / `audio.js` / `js/` / `tools/` は 1 バイトも触っていない
(証拠 = 本コミットの変更は本 `.md` 1 ファイルのみ。作業物は全部 scratchpad `…/b34987cb-…/scratchpad/item1/`)。
⭐ 行番号は **基準 `0e8370d`**(= `a93e0fd` と `tavern.html` / `index.html` の blob 同一)。⛔ 使う前に識別子で引き直すこと。

#### (1) 状態

| 項目 | 実測 |
|---|---|
| HEAD | `0e8370d`(`#72 引き渡し — 台帳へ #72 行 + 依頼書のアンカーを識別子主体へ …`) |
| 作業ツリー | clean(`git status --short` が空) |
| 並走 | `tools/*.js` を回す node **0 本**(MCP サーバのみ)。LISTEN は 8765(ユーザーの `py -m http.server` ×2)/ 9010・9180(Logitech G HUB)/ 9222(別用途の Chrome)= **着手前から居たもの。落としていない** |
| `tavern.html` | **10,751 行 / 651,187 bytes / 純 CRLF**(CRLF 10,751・単独 LF 0・単独 CR 0。`py` のバイト数え) |
| 本 `.md` | **純 LF**(LF 362・CRLF 0)⇒ 本節も LF で書いた |

#### (2) ⭐⭐⭐ 基準は流用できる(blob OID の追試・4 回目の流用)

    git rev-parse <commit>:<path>     # b3643c8 (= #71 項目5 の走査の木) と HEAD 0e8370d
    git diff --name-status b3643c8..HEAD   # => 実装依頼書/*.md 3 本だけ

| 対象 | `b3643c8` = `HEAD` | 判定 |
|---|---|---|
| `index.html` | `6b5cf38ec5072f522d06c71b5fcca943fdcb5aca` | ✅ 一致 |
| `tavern.html` | `4243b34f39004a7cf5903e5644e22a9eed7e11a9` | ✅ 一致 |
| `audio.js` | `b3aaa1fd2b93a379877fd6b861e01213386e5c61` | ✅ 一致 |
| `js/` (tree) | `b77037d0682d3555d746593c252d22ca425eeb69` | ✅ 一致 |
| `tools/` (tree) | `29b6ecbae563d8dd0e065a743654e79cdda47201` | ✅ 一致 |

- ⭐ 走査の時刻でも裏を取った: #71 項目5 の走査 `sweep71.py` の開始 = 2026-09-20 09:20、`b3643c8` のコミット = 09:11、
  次のコミット `4f4a35f`(15:59)は `.md` だけ ⇒ **走査は `b3643c8` の木を測っている**。
- ⭐ 差分の `.md` 3 本をコードで読む測定器は **0 本**(`pop72.py` の「流用の前提」検査。`verify_eol_doorfix` は
  `git diff HEAD` の**作業ツリー差分**を見るだけで `.md` の中身は読まない — ⚠ ただし項目5 の走査は**コミット後の clean な木で**回すこと。
  配信物が未コミットだと `(1e-1)` が赤くなる)。
- ⚠⚠ **流用元の取り違えに注意**: 正 = **#71 項目5 の実測** `…/e41839df-…/scratchpad/item5/result71.tsv`(158 腕 @`b3643c8`)。
  ⛔ #71 **項目1** の `…/663bb36c-…/item1/baseline71.tsv` は **#71 実装前の木**(`verify_bolt_bounce` が載っていない)なので使わない。
- 流用元は `item1/from71/` へ**コピーして退避**した(ログ 158 本 + 再走 `rerun/` 10 本 + `result71.tsv` / 比較器)。

#### (3) 母集団 = **59 本**(⛔ 定数で焼かず、§4-2 の 3 段 + 導線の補助段で導出)

導出器 = `item1/pop72.py`(#71 の `pop71.py` を土台に本数の定数を消したもの)。判定は**コメントを落としてから**。

| 段 | 定義 | 実測 |
|---|---|---|
| 段1 | 触る語 = 依頼書 §4-2 の 9 語 + #72 が触る/守る識別子 25 語(`recruitRole` `recruitName` `pmRenderDrawer` `makeNpcMember` `pickCompanion` `assignCompanionLevels` `clampCompanionLevel` `getMaxSpellSlotsForClassTV` `skillLimitForClass` `buildParty` `drawTodaysPatrons` `todaysPatrons` `regeneratePartyMembers` `renderCharLoadout` `magicList` `spellCountItem` `levelReq` `必要]` `MAGE_SKILLS_UI` `mrMeta` `patronLabel` `getLevelFromXP` `whois` `drawerlv` `namejob`) | **21 本**(9 語だけなら **11 本**) |
| 段2 | `tavern.html` を読む本 | **48 本** |
| 段2b(補助) | 導線で酒場へ入る頁(`town.html` / `title.html` / `world.html`)を読む本 | 24 本(段2 に無いのは 9 本) |
| 段3 | 測定器のソースを読む測定器(`tools/` 前置)/ 段3'(前置なしも数える広い側) | 5 本 / 9 本 |
| **union** | | **59 本**(`tools/*.js` 149 本中 90 本が圏外)。⚠ 依頼書の字義どおりの 3 段だけなら **51 本** |

- ⭐ **段2b だけが持ち込んだ本 = 6 本**(`driver_bgm_title` / `driver_heromark_signplate` / `probe_paint_overlay` /
  `probe_town_mask` / `verify_road_ambush` / `verify_road_events`)。**段3/3' だけ = 2 本**(`driver_mapeditor_painting` /
  `verify_enemy_name_label`)。段1 だけ = 0 本。
- 語ごとの本数: `recruitRole` **0 本** / `必要]` **0 本** / `assignCompanionLevels` 0 本 / `drawTodaysPatrons` 0 本 /
  `whois` `drawerlv` `namejob` 各 0 本(= 新しい撤退の語は先客なし)。
- 参考: `index.html` を読む本は 134 本(#72 は `index.html` を触らないので母集団へは入れていない)。
- 出力 = `item1/pop72_union.txt` / `item1/pop72_stages.json`。

#### (4) 基準 TSV = `item1/baseline72.tsv`

- #71 項目5 の 158 腕を流用 + **基準に無かった腕を HEAD `0e8370d` で実走して足した**(`item1/sweep72.py` / ログ `item1/run72/logs/`)。
  足した腕の決め方(⛔ 目視でなく機械): ① 母集団の本なのに基準に 1 行も無い本の素の腕、
  ② 母集団の本で **`tavern.html` を変異させる `--negative` を持つのに**基準に `--negative` の腕が無い本の `--negative` の腕。
- 足した腕 = **16 腕**(素 3 = `driver_bgm_title` / `probe_town_mask` / `verify_road_events`、`--negative` 13)。
  所要 **5,371.5 秒(89.5 分)**。重い腕 = `verify_party_promises --negative` **2,430.5 秒** / `verify_run_chronicle --negative` **1,664.3 秒**。
  ⚠ 走査の安全弁(1 腕 2,400 秒で打ち切り)に `verify_party_promises --negative` が掛かりそうだったので、途中で走査を止めて上限を 5,400 秒へ上げ、
  **その腕を頭から撮り直した**(打ち切りの記録は残していない。前半の走査ログは `item1/run72_console_part1.log`)。
- 足した 16 腕の色: **15 腕 exit 0**(`--negative` は全部「空振り 0」/「検出成功」系の総括)。
  **`driver_party_view_reopen --negative` だけ exit 1** — この本の `--negative` は**自己判定を持たず**、変異 5 本を同時注入して赤の数を出すだけ
  (ヘッダの期待 = 7 本赤 / 実測 = **6 本赤 29/35**。`(3b)` が緑。#72 以前からの状態 = 着手前の色として記録)。
- 合計 = **174 行**(#71 由来 158 + #72 追加 16)。**母集団 59 本 / 83 腕、欠落 0**。
- 母集団の **非 0 exit の腕 = 7**(⛔ 散文の一覧ではなくこの 7 腕と突き合わせる): `driver_action_priority --negative`(#35 以来・0.1 秒)/
  `driver_mapeditor` / `driver_mapeditor_painting` / `sweep_recruit_balance` / `driver_monsters_umberhulk` /
  `probe_party_size`(600 秒で打ち切り = 自力で終わらない)/ `driver_party_view_reopen --negative`(上記)。
- ⚠ 走査中の 20:19:39 に**身に覚えのない未追跡ファイル** `実装依頼書/2026-09-21_pen-narration.md` が現れた(起草窓の新しい依頼書と思われる)。
  本項目は触っていない・コミットに含めない。走査の前後で `tools/*.js` を回す他窓の node は 0 本だった。

#### (5) 比較器の番人(⭐⭐⭐ 順序のある 1 つ)

比較器 = `item1/fp72e.py`(= #71 項目1 の `fp71e.py` の**無改変コピー**。`cmp` で同一)。
- **① 同じ広さの自己検証** — `baseline72.tsv` の母集団の **83 腕すべて**の基準ログに当てた: ログ実在 **83/83**、判定行 **7,593 行** / assert id **7,308 個**、
  **「マーカーはあるのに 0 行」= 0 件**。判定行 0 の 4 腕(`driver_action_priority --negative` / `probe_paint_overlay` / `sweep_recruit_balance` /
  `probe_town_mask`)は**ログにマーカーがそもそも無い**腕 = 比較器の盲点 ⇒ exit + 総括行で突き合わせる。⇒ ① PASS。
- **② 変えていないはずの本で差 0** — HEAD `0e8370d` で `verify_mercenary_roster`(素)と `verify_spell_off`(素)を**実走**し、`b3643c8` の基準ログと突き合わせた:
  `verify_mercenary_roster` 経路1(id 指紋)44 = 44・経路2(判定行の多重集合)44 = 44 **差 0** / `verify_spell_off` 51 = 51・51 = 51 **差 0**(どちらも exit 0)。
  ⇒ ② PASS。⭐ blob OID の追試(静的)を、#72 が触る語を読む本 2 本の実走(動的)でも裏付けた。ログ = `item1/gate/`。

#### (6) ⭐ 依頼書 §2-1 の表は **そのまま再現した**(`index.html` 直起動・主人公 Lv7)

プローブ = `item1/probe72.js --mode level --port 10414`(起草窓の `probe_bolt_level.js` を土台に、主人公 XP を
105000 = Lv10 から **21000 = Lv7** へ、装置「仕込んだ名前と Lv が `allies` に載った」「`document.title` が空でない」を足した)。

| 魔法使いの Lv | `equippedSkills` | `maxSpellSlots` | 装置 |
|---|---|---|---|
| **2** | `["sleep"]` | `{sleep:1}` ← LB 11 個が丸ごと消える | title=「ダンジョンファイターズ - 剣盾画像版」/ 主人公 Lv(index)=7 / 仕込みが載った=true |
| 3 | `["sleep","lightning-bolt"]` | `{sleep:1, lightning-bolt:4}` | 同上 |
| 4 | `["sleep","lightning-bolt"]` | `{sleep:1, lightning-bolt:5}` | 同上 |
| 7 | `["sleep","lightning-bolt"]` | `{sleep:1, lightning-bolt:9}` | 同上 |

⇒ **依頼書 §2-1 の表と 4 腕とも一致**。本体(`initAllySpellSlots` `index.html:14014`〜`:14015`)は**各仲間自身の `ally.level`** で判定している
(下の論点① でも、同職 2 人が各自の Lv で判定されることを確認)。**⇒ 再現した = 項目2a へ進む前提の 1 つ目は成立**。

#### (7) 引き出しは主人公 Lv で判定している — **DOM で示せた。ただし LB では示せない**(⚠ 崩れた主張 1〜4 の根)

プローブ = `item1/probe72.js --mode drawer --port 10415`。酒場 `tavern.html` を直に開き、既存シーム `window.__pmTest.play(sc)` で
演出だけを開いた(⛔ `openPrep` は通さない)。仲間の魔法使い「ロルフ」は **`level: 2` + `mercId`**(名簿の顔の形)。

| 腕 | 主人公 Lv | ロルフの Lv | LB の行 | アイスストーム(`levelReq: 7`)の行 | 枠の上限 | + を押す |
|---|---|---|---|---|---|---|
| A | **7** | 2 | バッジ無し・`.full` 無し | **バッジ無し**・`.full` 無し | 10(= Lv7 の値。Lv2 なら 4) | LB **1 → 2**(置けた) |
| B | **5** | 2 | バッジ無し | **`[Lv7 必要]` + `.full`** | 8 | LB 1 → 2 |
| C | **1** | 2 (clamp で 1) | **バッジ無し**(⚠ 主人公 Lv1 でも出ない) | `[Lv7 必要]` + `.full` | 3 | LB 1 → 2 |
| E | 7 | 2 | スクショと同じ **LB 11 個**・バッジ無し | バッジ無し | 10 | 12 個 ≥ 10 で + は全部無効 |
| F | 7 | 2 | 配分 5 個(Lv2 の上限 4 を超過)でも **+ が有効** | — | **10** | LB 0 → 1(計 6 個) |

- ⭐ **A と B は仲間(Lv2)が同じで主人公だけが違う** ⇒ アイスストームのバッジは**主人公 Lv に追随**している
  = 判定 Lv は主人公 Lv(`tavern.html:8798` `const lv = getLevelFromXP(inventory.xp);`)。F 腕が枠の上限(`:8799`)も主人公基準であることを示す。
- ⚠⚠⚠ **LB の行には主人公 Lv1 でも `[Lv3 必要]` が出ない(C 腕)。** 真因 = **酒場の鏡 `MAGE_SKILLS_UI` の `lightning-bolt`
  (`tavern.html:4489`)に `levelReq` が無い**。`renderSpellSlotItem` は `const lvReq = sk.levelReq || 1;`(`:7410`)なので LB は常に Lv1 扱い。
  本体 `index.html:22212` は `levelReq: 3`。鏡の欠落は LB だけでなく **ファイアボール(本体 3 / 鏡 無し)・コーンオブコールド(本体 5 / 鏡 無し)** の計 3 呪文
  (`item1/lvreq72.txt` = 両ファイルの呪文 27 種を突き合わせた全数表。他の 24 種は一致)。
  ⭐ 本体の LB と鏡の LB は**同じコミット `d433c3b`(2026-05-30)で同時に生まれ、鏡は最初から `levelReq` を持っていなかった**(`git log -S`)。
  ⇒ **柱2(判定 Lv を本人へ)だけでは LB の行に `[Lv3 必要]` は一度も出ない。**
- 同じ引き出しの中で Lv の出所が**すでに割れている**: 見出し下の `スキル (2/1)`(`:8782` `skillLimitForClass` = `memberLevelOf` = **仲間 Lv2**)と、
  呪文段の枠 10(**主人公 Lv7**)が同居している。さらに傾向段の候補 `apEquippedIdsFor`(`:7622`)は僧侶の自動配分を**主人公 Lv** で引く
  (= 依頼書が挙げていない 3 箇所目の主人公 Lv。`getLevelFromXP(inventory.xp)` は全 8 箇所で、残りは `memberLevelOf` 自身 `:4853` /
  出発の clamp `:7983` `:8084` / 闇市の依頼生成 `:9610` `:9887`)。

#### (8) ⚠⚠⚠ マッチング画面の時点で、新顔の仲間には **Lv がまだ無い**(崩れた主張 5〜8・11 の根)

- `makeNpcMember`(`:4627`)は `level` を持たない。Lv を決めるのは **出発の瞬間** `departToScenario` → `assignCompanionLevels`(`:7984`)と
  `departAutoDebug`(`:8085`)だけ。名簿から来た顔(`pickCompanion` の名簿の枝 `:4666`〜`:4668`)だけが `level` を持って画面に来る。
- 実測(`item1/probe72.js --mode sample`・まっさらな名簿):
  `buildParty` の NPC **0 / 720,000 人**(2 腕 × 6 主人公職 × 20,000 編成 × 3 人)、卓の 4 人 `drawTodaysPatrons` **0 / 80,000 人**が `level` を持たない。
  声掛けダイアログの実物(`--mode drawer` の最後)も `level=(未定義) mercId=(未定義)`。
- D 腕(ロルフから `level` を外した = 新顔の形): `memberLevelOf('mage')` は **7(主人公 Lv へフォールバック `:4857`)**、見出し下は `スキル (2/4)`。
  ⇒ **柱2 を `memberLevelOf` で直しても新顔は主人公 Lv で判定されたまま**。柱1 で `memberLevelOf` の値を出すと**主人公の Lv を表示し、
  出発時に帯 `[2,4]` から別の Lv が振られる**(表示が嘘になる)。ユーザーのスクショの状況(主人公 Lv7 で LB 11 個 → 出発で Lv2)は、
  新顔でも名簿の顔でも起きる。

#### (9) 論点① — 同じ職が 2 席に座るか(⛔ 仕様は決めない。事実だけ)

| 経路 | 実測 |
|---|---|
| 既定(声掛け ON) | 卓の 4 人は 6 職から**重複なし**(20,000/20,000)。**主人公の職が卓に居る確率 ≈ 66.3〜67.1%**(= 4/6)。**`DFRecruits.add` に職の検査が無い**(`js/recruit-candidates.js:83`〜`:96`)⇒ 実測で魔法使いを 2 人誘えて、主人公が魔法使いなら編成は **魔法使い 3 人**になった。酒場を開き直すたびに卓は引き直されるので、別の日に同職を誘い足せる |
| `?recruittalk=0`(`buildParty`) | 同職 2 人の編成 **≈ 49.4〜50.5%**(6 主人公職 × 20,000 × 2 回)。うち主人公と同職 ≈ 16.2〜17.0% / NPC どうし ≈ 32.6〜33.7% / 魔法使い 2 人 ≈ 16.1〜17.0%。**3 人以上は 0 件**(最大多重度 2) |
| `memberLevelOf(classKey)` | **職で先頭 1 人**(`ms.find`)。主人公が先頭なら主人公 Lv(`orderFormation` は安定ソートで同 zone は主人公が先 = 実測 `["warrior","mage★","mage"]` → 7)。NPC 2 人なら先頭の Lv(並べ替えると 2 ↔ 4 に入れ替わる) |
| `pmRenderDrawer(idx)` の `m` | **開いた本人**(`pmOrdered[idx]`)。G 腕でロルフ(Lv2)とミラ(Lv4)を別々に開き、`openedMember` がそれぞれ正しく出た。⚠ ただし判定は両方とも主人公 Lv7。⭐ 同職 2 人のとき引き出しに **`⚠ この設定は 魔法使い 2 人に共通で適用されます`**(`pmDrawerNote` `:8771`〜`:8778`)が**既に出る**(既存の製品挙動) |
| 本体 `initAllySpellSlots` | 同職 2 人とも**同じ** `partySkills[classKey]`(`heroMap`)を受け、**各自の `ally.level`** で `levelReq` を判定(`index.html:35094`〜`:35108`)。実測: ロルフ Lv2 → `["sleep"]` / ミラ Lv4 → sleep 1 + LB 5。主人公魔法使い Lv7 + NPC 魔法使い Lv2 → 主人公 LB 9 / NPC は sleep のみ |

#### (10) 論点② — `tavern.html:7839` は既定の画面遷移で届くか

プローブ = `item1/probe72.js --mode prep --port 10416`(`renderCharLoadout` をページのメモリ上で包んで呼び出しを数え、`departToScenario` の遷移だけ止めた)。

- `:7839` は `renderCharLoadout()`(`:7777`)の中。**`openPrep` が毎回 1 回だけ無条件に呼ぶ**(`:6472`・その時 `activeCharTab` = 主人公の職 `:6467`)。
  ⇒ **既定の経路でも実行はされる**が、描き先の `#prep` は**不可視のまま**(P1 / P2 とも `#prep` 可視 = false、`#pmDepart` を押すと
  `departToScenario` が 1 回呼ばれて終わる)。主人公が魔法使いなら `playerLv` = 主人公 Lv = `memberLevelOf('mage')`(主人公が先頭)= **恒等**。
- **目に見えて届くのは `?prepskip=0`(#55 の撤退)だけ**: `#pmDepart` の後に `#prep` が可視になり、職業タブ(6 職)の「魔法使い」を実クリックすると
  `:7839` が走る。実測: 主人公 Lv7 × 仲間の魔法使い Lv2 で、アイスストームに `[Lv7 必要]` が**出ない**(= 主人公 Lv で判定。LB は鏡の欠落で元から出ない)。
- ほかに検証シーム `window.__equipTV.setTab`(`:5098`)が `renderCharLoadout` を直に呼ぶ(`driver_action_priority` / `driver_equip_compact_ios` が使用)。
- 別件(⛔ 触らない): `renderCharLoadout` の `magicHint` の「(使用 n/M スロット)」(`:7853`〜`:7858`)は直後の `:7871` が「(スキル枠と共有)」で必ず上書きする = **一度も見えない文言**。

#### (11) 引き出し・カード・声掛けの寸法の基準(§8 (4b)。#56 / #70 と同じ `#pmDrawer` の `rect.height` / `scrollHeight` / `clientHeight`)

演出を**最初からその寸法で**開いて採った(⚠ 開いてから縮めると畳まれる = #39 の罠)。仲間 = 戦士(主人公)/ 魔法使い Lv2 / 僧侶 / エルフ。

| 画面 | カードの高さ | 引き出し `rect.h` / `sh` / `ch`(戦士・魔法使い・僧侶・エルフ) | 見出し帯 / 見出し文字 |
|---|---|---|---|
| 1280x900 | 334.6 ×4 | 639.7/638/638・580.3/578/578・518.5/516/516・501.6/500/500 | 44 / 20.3(`lh=20.25`) |
| 1366x768 | 334.6 ×4 | 同上 | 同上 |
| 390x844 | 312.1・312.1・358.6・358.6 | 965.2/963/963・919.8/918/918・748.8/747/747・715.1/713/713 | 同上 |
| 390x667 | 同上 | 同上 | 同上 |

- ⭐ **仮の追記**(⛔ 本番は無傷。開いているページの DOM だけ): カードの職業行・引き出しの見出し・`#recruitRole` の文字の後ろに `" Lv10"` を足しても
  **高さは 4 画面とも 1px も変わらなかった**(職業行 18→18 / カード 334.6→334.6・312.1→312.1・358.6→358.6 / 見出し 20.25→20.25 /
  引き出し全体も不変 / `#recruitRole` 20→20・ダイアログ 266.2→266.2)。⇒ **柱1 を inline の文字で足す限り、§6 の実座標クリックの型は踏まない見込み**
  (見出しの `scrollWidth` = `clientWidth` = 97〜148px で、器にまだ余白がある)。

#### (12) 腐りうる本・腐りうる assert(依頼書 §6 + 母集団全体を逐語で読んだ結果)

名指しの 6 本の基準の色(`baseline72.tsv`):

| 本 | 素 | `--negative` |
|---|---|---|
| `verify_party_match_setup` | 36/36 exit 0(99.8 秒) | exit 0(798.5 秒) |
| `verify_darkvision` | 25/25 exit 0 | 38/38 exit 0 |
| `verify_pm_drawer_fit` | 75/79 PENDING 4 exit 0 | exit 0(631.5 秒) |
| `verify_mercenary_roster` | 44/44 exit 0 | exit 0(216.1 秒・10 本とも担当ラベルが赤 = 空振り 0)。⭐ #71 の基準に無かった腕を本項目で HEAD 実走して足した |
| `verify_recruit_talk` | 25/25 exit 0 | exit 0(810.2 秒) |
| `verify_recruit_size` | 91/91 exit 0 | (`--negative` を持たない) |

**逐語で読んでいる assert の全数**(`item1/anchors72.py` = 「#72 が触る関数まるごとの行」を文字列で握るリテラルを全 149 本から機械で探した結果 + 語ごとの読み取り):

| # | 本:行 | assert / 装置 | 何を比べているか | #72 のどの柱で腐るか |
|---|---|---|---|---|
| 1 | `verify_darkvision.js:1179`〜`:1211` | **(3a)** | カードの `.pmName` / **`.pmClass`** / `.pmEquipRow` / `.pmSkillsVal` を**着手前 hash の同時配信**と 1 文字比較(`:1198`) | **柱1**(職業行に Lv を足すと型1 の赤) |
| 2 | `verify_party_match_setup.js:746`〜`:750` | **(0b)** | 全確定後の **`.pmClass` の並び** === `PARTY_SLOTS[].name` の並び(実体) | **柱1**(同上) |
| 3 | `verify_mercenary_roster.js:461` / `:659`〜`:663` | **(0c)** | `NPC_NAMES.length`(16)> `DFRoster.CAP`(12) | **柱3**(`NPC_NAMES` を職業別オブジェクトにすると `.length` が消えて赤。平らな配列のままなら生存するが、「名簿が満杯でも名前が衝突しない」の意味が職業別プールでは崩れる) |
| 4 | `verify_mercenary_roster.js:145`〜`:162` | **計測シーム 4 本(素の腕でも注入)** | `pickCompanion` の 4 行(`tavern.html:4653` `:4661` `:4663` `:4664`)を逐語で握る | **柱3**(この 4 行を 1 文字でも触ると**素の腕が exit 3**) |
| 5 | `verify_mercenary_roster.js:301`〜`:308` | 変異 `alwaysroster` | 注入するコードが `pickUniqueName(usedNames)`(**1 引数**)を呼ぶ | **柱3**(署名を `(classKey, usedSet)` にすると変異の意味が変わる = `--negative` の担当節が動く) |
| 6 | `verify_mercenary_roster.js:1240`〜`:1241` | **(2e)(2z3)** | `memberLevelOf(pick.classKey)` / `skillLimitForClass(pick.classKey)` を**職業キーで**呼ぶ | **柱1/2**(`memberLevelOf` を member 受けへ変えると赤 ⇒ 職業キー版は委譲で残す) |
| 7 | `verify_bolt_aim.js:162`〜`:165` | 変異 `flavor3` | `tavern.html:4489` の **LB の行を 1 行まるごと**逐語で握る | **(7) の鏡を直すなら**(LB 行へ `levelReq: 3` を足すと `--negative` が exit 3。素は緑のまま = #60 の型)。(3a) `:984`〜`:990` は flavor だけ読むので生存 |
| 8 | `verify_party_promises.js:770`〜`:779` | **(4c)** | **`.pmName` のテキスト** === `DFRecruits` の名前 | 柱1 で Lv を**名前の行へ**入れると赤(⇒ 依頼書 §5-1 の「`nameEl` は触らない」は必須) |
| 9 | `driver_party_view_reopen.js:495`〜`:498` | **(3b)** | `.pmName`(主人公以外)=== 実体の名前 | 同上 |
| 10 | `verify_pm_drawer_fit.js:382`〜`:391` | `findHeroCard`(装置) | 引き出しの見出しの **`/あなた/`** で主人公のカードを引く | 柱1 で見出しから「あなた」を消すと装置が死ぬ(残せば生存) |
| 11 | `verify_recruit_size.js:722`〜`:727` | (D) の根拠コメント | 「名前は `NPC_NAMES` 16 個から一様」⇒「11 サンプル中 2 種類以上」 | 柱3 でコメントの前提が腐る(assert は 1 職 4 名以上なら生存) |
| 12 | `verify_spell_off.js:568`〜`:599` | (1a) | `renderSpellSlotItem` を**自分の `lv`(主人公 Lv10)で直に呼び**、期待集合を `sk.levelReq \|\| 1` から導出 | 生存見込み(期待値が表から導出される。鏡へ `levelReq` を足しても Lv10 では変わらない) |
| 13 | `verify_party_match_setup.js:784`〜`:785` / `:939`〜`:940` | (2a) / (5b) | `#pmDrawer .skillItem.full:not(.selected)` を押し所に選ぶ(無ければ `.skillItem`)/ `#skillList` の非 `.full` | 生存見込み(`.full` が増減しても代替がある) |

- ⭐ **読む本が 0 本のもの**: `#recruitRole` の文字 / 引き出しの `[LvN 必要]` の文字 / `pickUniqueName` の一意性(`alwaysroster` の注入を除く)。
  ⇒ 柱1 の声掛けダイアログと柱2 のバッジは **既存 golden の空白地帯**(受入 = 項目4 が初めての網になる)。
- 試験データとして名前を直書きしている本(`NPC_NAMES` を読むのではない): `'ロルフ'` を**戦士**に使う `driver_heromark_signplate.js:456` /
  `'ミラ'` を**魔法使い**に使う `verify_aoe_coverage.js:254` `verify_bolt_aim.js:716` `:1069` `verify_bolt_bounce.js:668` `verify_cone_cast.js:639`
  `verify_hold_pair.js:677` `verify_recruit_talk.js:293`。どれも注入した名前をそのまま使うので柱3 では赤くならない(新しい名前表と職が食い違うだけ)。

#### (13) ⭐ 崩れた主張 — **12 件**(根は 6 つ)

| # | 依頼書の主張 | 実測 | 根 |
|---|---|---|---|
| 1 | §2-2「⇒ 主人公が Lv7 なら、Lv2 の仲間の行にも `[Lv3 必要]` が出ず、11 個置けてしまう」 | 出ないのは本当だが**理由が違う**。酒場の鏡 `MAGE_SKILLS_UI` の LB(`:4489`)に `levelReq` が無く、`sk.levelReq \|\| 1` で**常に Lv1 扱い**。主人公 Lv1 の C 腕でも出ない | A |
| 2 | §5-2「これで Lv 不足の呪文に `[Lv3 必要]` が出て `.full` になり、そもそも置けなくなる」 | **LB / ファイアボール / コーンオブコールドでは出ない**(鏡に `levelReq` が無い 3 呪文)。出るのは鏡が `levelReq` を持つ呪文だけ(アイスストーム 7 等) | A |
| 3 | §4 STEP1-4「主人公 Lv7 × 仲間 Lv2 で `[Lv3 必要]` が**出ない**ことを DOM で確認(= 主人公 Lv を使っている証拠)」 | LB の行では**主人公 Lv を何にしても出ない**ので証拠にならない。⇒ 本項目はアイスストーム(鏡 `levelReq: 7`)で A 腕 / B 腕を比べて示した | A |
| 4 | §8 (2a)(2b)(2c) / §10 の 2 行目「レベルの足りない呪文は置けなくなった」 | 柱2 だけでは LB で (2a)(2c) は赤/緑に分かれず、changelog の 2 行目も LB について**嘘**になる | A |
| 5 | §2-4 表「マッチングのカード … ⭐ `m.level` はその場にある」 | **新顔には無い**(`makeNpcMember` は `level` を持たない。NPC 0/720,000・卓 0/80,000)。持つのは名簿の顔だけ | B |
| 6 | §5-1「(カード)⭐ `m.level` がその場にある」 | 同上 | B |
| 7 | §5-1「声掛けダイアログは … `m.level` を直接読む必要がある」 | 卓の相手は新顔なら `level` 未定義(実物 `level=(未定義)`)⇒ 読む値が無い | B |
| 8 | §2-2「正しい関数は既にある: `memberLevelOf(classKey)`」+ §5-1「Lv の出所は `memberLevelOf(classKey)` に集約」 | 新顔では **主人公 Lv を返す**(D 腕 = 7)。同職 2 人では**先頭 1 人**の Lv(G 腕: ミラ Lv4 を開いても 2) | B + C |
| 9 | §2-2「**引き出しだけ**が主人公 Lv を見ている」 | 引き出しの中で割れている: 見出し下の `スキル (n/limit)` は既に仲間 Lv(`skillLimitForClass`)、呪文段は主人公 Lv。さらに `apEquippedIdsFor`(`:7622`)も主人公 Lv(僧侶の自動配分)。準備画面 `:7839` も主人公 Lv | D |
| 10 | §5-3「⇒ `DFRecruits.has(name)` / `DFRoster` の名前キーが**人物を一意に決める**ようになる(§2-5 の 2 つの穴が同時に塞がる)」 | 職業別の名前表は「名前 → 職」を一意にするが「名前 → 人物」は一意にしない: `pickUniqueName` が避けるのは**その編成で使った名前だけ**(`:4623`)、`DFRoster.enroll` は同名を弾かない(`js/mercenary-roster.js:174`〜`:190`)。**実測**(`item1/probe72.js --mode names`・本番の口 `DFRoster.enroll` で名簿に魔法使い 11 人を入れて 20,000 回): 別の職の新顔(戦士)が名簿の魔法使いと同名 **13,699 / 20,000 = 68.5%**(≈ 11/16)、**同じ職の新顔**(`pickCompanion('mage')` の新顔の枝)が名簿の魔法使いと同名 **1,106 / 1,635 = 67.6%**、`enroll` は同名を受け入れる(名簿に「ロルフ」が 2 人並んだ)。⇒ 職業別の名前表にしても、**名簿の人数(`CAP` 12)が 1 職の名前数を超えると同名・同職の別人は必ず生まれうる**。「人物を一意に」には名簿の名前も避ける等の追加が要る | E |
| 11 | §2-3「仲間の Lv はどこから来るか」(Lv が決まる時点の記述が無い) | Lv が決まるのは**出発の瞬間だけ**(`:7984` / `:8085`)。酒場の卓・声掛け・マッチング画面・引き出しの時点では新顔の Lv は**存在しない** = 本チケットの 3 柱すべての前提 | B |
| 12 | §8「⚠ 既知フレーク **7 本**」 | **9 本**(#71 で `driver_monsters_kobold` / `auto_debug_run` が加わった。キューが正) | F |

- 根: **A** = 酒場の呪文表の鏡に `levelReq` が無い(LB・ファイアボール・コーンオブコールド)/ **B** = 新顔の Lv は出発まで無い /
  **C** = `memberLevelOf` は職で引く / **D** = 主人公 Lv を読む箇所は依頼書の 2 箇所より多い / **E** = 名前の一意性は編成の中だけ / **F** = 一覧の鮮度。

#### ✅ 崩れなかった主張(確認できたもの)

- §2-1 の表(4 腕とも完全一致)/ 本体は各仲間自身の Lv で判定(同職 2 人でも各自)/ `if (lv < lvReq) continue;` が配分ごと飛ばす。
- §2-2 / §2-4〜§2-6 の行番号と逐語(基準 `a93e0fd` = `0e8370d` で全部一致。親の追試と同じ)。
- §2-3 の帯 `BAND` と `qGetTier(level)`(`level <= 4` で tier1)、`bandits-forest` の `recommendedLevel: 4`(`:3543`)、名簿の成長 `RUNS_PER_LEVEL = 3` / `LEVEL_MAX = 10`(`js/mercenary-roster.js:60` / `:63`)。
- §2-6 未習得は一覧から除外・Lv 不足は `.full` + バッジで出す(B 腕のアイスストーム)。
- §5-2「主人公なら `memberLevelOf` が主人公 Lv を返す ⇒ 主人公の挙動は不変」(H 腕 / 主人公が同 zone の先頭)。
- §5-2「既に上限を超えて保存されている古いセーブは本体の `upperCap` が切る」(`index.html:14007` / `:14018`)。
- §8 計測機構「`openPrep`(`:6444`)は `:6468` で `regeneratePartyMembers()` を無条件に呼ぶ」。
- §6「文字を足すと折り返して高さが変わる」は**起きうる型**だが、Lv の数文字では**起きなかった**((11) の仮の追記)。

#### ▶ 項目2a / 2b / 3 / 4 / 5 への申し送り

1. ⚠⚠⚠ **項目2a の着手前にユーザー判断が要るのは 2 点**(⛔ 項目1 は測るだけなので決めていない):
   - **(α) 酒場の鏡へ `levelReq` を足すか**(LB 3 / ファイアボール 3 / コーンオブコールド 5 = 本体と同値)。足さないと柱2 は LB で効かない。
     ⚠ 足すと `verify_bolt_aim --negative` の変異 `flavor3` のアンカー(LB 行まるごと)が腐る(項目3 で言い直し)。
   - **(β) 新顔の Lv をいつ決めるか**。今は出発の瞬間。柱1(表示)も柱2(判定)も**画面の時点で Lv が要る**。
     候補の例: (i) 受注〜マッチング画面を開く前に `assignCompanionLevels` と同じ規則で振り、出発では振り直さない /
     (ii) 未確定の間は Lv を出さず判定も主人公 Lv のまま(= 新顔ではユーザーの事故が残る)/ (iii) その他。
     ⚠ (i) は `verify_mercenary_roster (2c)(2e)` / `verify_recruit_size` / `sweep_recruit_balance` の前提(出発で Lv が決まる)に触れる。
2. 同職 2 人: 引き出しは開いた本人 `m` を握れる(`pmOrdered[idx]`)が、配分 `partySkills[classKey]` は職単位。
   既に `pmDrawerNote`「⚠ この設定は 魔法使い 2 人に共通で適用されます」が出る。本体は各自の Lv で切る。
   ⇒ 「どちらの Lv で引き出しを縛るか」は仕様判断(依頼書にも無い)。声掛け経路でも同職 2〜3 人は**作れる**(`DFRecruits.add` に職の検査が無い)。
3. `:7839` は既定でも毎回 1 回実行される(不可視・主人公の職 = 恒等)。**見えるのは `?prepskip=0` だけ**。受入で測るなら `?prepskip=0` の腕が要る。
4. 腐りうる assert は (12) の 13 行。**型1 で確実に赤くなるのは柱1 の 2 本**(`verify_darkvision (3a)` / `verify_party_match_setup (0b)`)。
   柱3 は `verify_mercenary_roster` の**素の腕の計測シーム 4 本**を触ると exit 3 になる(`pickCompanion` の 4 行は触らないこと)。
5. 受入(項目4)の仕込み手順(本項目で実走して通ったもの・`item1/probe72.js` の `openTavern` / `playForced` / `READ_DRAWER`):
   - `tavern.html` を直に開く(既定 URL のままでよい。`__pmTest.play` は `regeneratePartyMembers` を呼ばない)。
   - document-start で**一度だけ**(`evaluateOnNewDocument` + タブの sessionStorage の印): `dragonfighters.*` を全消去 →
     `dragonfighters.prologueSeen` / `prepOnboardingSeen` = `"1"`、`dragonfighters.xp` = `"21000"`(Lv7)、
     `dragonfighters.knownSpells` = `{"mage":["magic-missile","sleep","fire-bolt","arcane-shield","lightning-bolt","fireball","ice-storm"]}`
     (⚠ LB を習得にしないと LB の行そのものが引き出しに出ない = `:8795` の `isSpellKnownTV`)。`partySkills` は仕込まない(酒場が既定を組む)。
   - 起動待ち = `typeof openPrep==='function' && typeof scenarios!=='undefined' && window.__pmTest`。
   - `selection.partyComposition=['warrior']` / `selection.partyMembers=[主人公 {classKey:'warrior',isHero:true,name:null,zone:'front',variant:0}, {classKey:'mage',isHero:false,name:'ロルフ',level:2,mercId:9001,zone:'rear',variant:1,trait:null,line:null}, …]` /
     `selection.partySkills.mage=[…]` → `__pmTest.play(scenarios.find(s=>s.id==='bandits-forest'))`(await しない)→ `#pmDepart` 可視まで待つ →
     `.pmColumn[data-member-idx=i]` を `el.click()` → 約 380ms 待って `#pmDrawer .skillItem.spellCountItem` を読む(LB は `.sName` に「ライトニングボルト」)。
   - ⚠ 新顔の形 = `level` 無し / 名簿の顔の形 = `mercId` + `level`。**両方の腕を持つこと**(D 腕で新顔は主人公 Lv へ落ちる)。
6. ポート: プローブは **10414 / 10415 / 10416 / 10417 / 10418** を使い、全部解放済み。`tools/*.js` に `1040x`〜`1042x` の先客は無い
   (⚠ 10401〜10413 は項目4 の予約)。
7. 既知フレーク **9 本**・既知の赤は `baseline72.tsv` の非 0 exit の腕で突き合わせる(散文の一覧を使わない)。

---

### 12-0 追補(項目2a / 2026-09-21・実装窓 セッション `b34987cb-…`)— 柱2 + (α)(β)(γ) + 撤退 `?drawerlv=0`

⭐ 行番号は **本コミット後の `tavern.html`**(純 CRLF・10,848 行・bare LF 0・bare CR 0 を `py` のバイト数えで確認)。⛔ 使う前に逐語で引き直すこと。
変更ファイル = `tavern.html` + 本 `.md` のみ(`index.html` / `js/` / `tools/` は 1 バイトも触っていない)。changelog = §10 の 2 行目を `py tools/add_changelog.py` で追加。

#### (1) 撤退スイッチ `?drawerlv=0`

- 判定の逐語 = `try { return new URLSearchParams(location.search).get("drawerlv") !== "0"; }` — **1 件**(`:4500`。関数 `function isDrawerLvOn() {` `:4499`)。
  const に畳まず呼ぶたびに URL を読む(`isPatronLabelOn` / `isHoldPairOnTV` と同じ TDZ 回避の作法)。
- `isDrawerLvOn()` の出現 = **6 件**: 定義 `:4499` / (α) の撤退 `:4511` `if (!isDrawerLvOn()) {` / `skillLimitForClass` `:4904` /
  準備画面の判定 `:7885` / (β) の有効条件 `:8021` `function isEarlyLevelOn() { return isDrawerLvOn(); }` / 引き出しの判定 `:8891`。
- 0 で戻るもの = (α)(β)(γ) の 3 つとも。⭐ 実測: 着手前 `0e8370d` の `tavern.html` を CRLF に戻して影の配信(`/__base__/tavern.html`)したページと
  `?drawerlv=0` の現行ページで、全カードの引き出し innerHTML・カード列 innerHTML・`JSON.stringify(selection)`(新顔の level 無し)・
  `JSON.stringify(MAGE_SKILLS_UI)` が **完全一致**(probe ident (d) 名簿の魔法使い Lv2 + 新顔 2 人 / (d2) 同職 2 人)。
  比較器の負の対照 = スイッチ ON では同じ盤面で食い違う(d-neg)。影の配信は影のページに新ヘルパが無いことで確認(0c-ident)。

#### (2) ヘルパ(Lv の引き方を 1 つの口へ)

| ヘルパ | 行 | 中身 |
|---|---|---|
| `levelOfMember(m)` | `:4877` | 主人公 → `getLevelFromXP(inventory.xp)` / NPC で数値 level → `clampCompanionLevel(level, 主人公 Lv)` / 未確定・m 無し → 主人公 Lv(= 0e8370d の `memberLevelOf` 後半そのまま) |
| `memberLevelOf(classKey)` | `:4885` | `return levelOfMember(ms.find(x => x && x.classKey === classKey));` へ委譲して残す(`verify_mercenary_roster (2e)(2z3)` が職キーで呼ぶ)。0e8370d の実装を写した旧版とランダム編成 2,000 通り × 6 職 × 3 腕で **食い違い 0**(probe sample (i)) |
| `lowestLevelOfClass(classKey)` | `:4896` | (γ) その職の `levelOfMember` の最小。その職が居なければ主人公 Lv |
| `skillLimitForClass(classKey)` | `:4903` | `skillSlotsForLevel(isDrawerLvOn() ? lowestLevelOfClass(classKey) : memberLevelOf(classKey))` |

- ⭐ **`skillLimitForClass` を最低 Lv 側へ寄せた理由**: 本体 `index.html` は技(非呪文)も同職の全員へ同じ `partySkills[classKey]` を渡し、
  **各自の Lv で** `slice(0, skillSlotsForLevel(ally.level || headLevel))` する(`index.html:35079`〜`:35081` / `:35117`)。
  ⇒ 先頭 1 人の Lv で枠を出すと、低 Lv の同職は後ろの技を出撃で黙って失う = 呪文と同じ型。(γ) の「置いたものは全員が必ず持てる」と整合させた。
  単独の職では `lowestLevelOfClass` = `memberLevelOf` なので値は変わらない。実測 (probe core f4): 主人公の戦士 Lv7 + 仲間の戦士 Lv2 →
  両カードとも `スキル (3/1)`(`?drawerlv=0` で `(3/4)`)。⚠ 既に上限を超えて置かれている技は消さない(`3/1` のまま表示・外せる)。
- `clampCompanionLevel` の呼び口コメント(`:4856`)の ② を `levelOfMember()` へ書き換えた(呼ぶのは assignCompanionLevels と levelOfMember の 2 つ)。

#### (3) 判定 2 箇所(実装後の逐語)

- 引き出し `function pmRenderDrawer(idx)`(`:8831`): `const lv = isDrawerLvOn() ? lowestLevelOfClass(classKey) : getLevelFromXP(inventory.xp);` `:8891`(1 件)。
  直後の `const totalMax = getMaxSpellSlotsForClassTV(classKey, lv);` も同じ Lv = **枠の上限も最低 Lv 基準**。
- 準備画面 `function renderCharLoadout()`(`:7822`): `const playerLv = isDrawerLvOn() ? lowestLevelOfClass(slot.classKey) : getLevelFromXP(inventory.xp);` `:7885`(1 件)。
  見えるのは `?prepskip=0` だけ(probe prep: LB `[Lv3 必要]` + `.full`・`&drawerlv=0` で出ない)。
- 旧逐語 `const lv = getLevelFromXP(inventory.xp);` / `const playerLv = getLevelFromXP(inventory.xp);` は **0 件**。
  `getLevelFromXP(inventory.xp)` は 8 → **9 件**(`:4878` levelOfMember / `:7667` apEquippedIdsFor / `:7885` / `:8031` fixCompanionLevelsEarly /
  `:8072` 出発 / `:8175` 自動デバッグ / `:8891` / `:9707` `:9984` 闇市)。

#### (4) (α) 呪文表の levelReq 同期

- `MAGE_SKILLS_UI` の 3 行へ `levelReq`: fireball **3**(`:4488`)/ lightning-bolt **3**(`:4489`)/ cone-of-cold **5**(`:4490`)。
  本体の値は `index.html` の `"fireball": {` `:22202`(`levelReq: 3` `:22205`)/ `"lightning-bolt": {` `:22209`(`:22212`)/ `"cone-of-cold": {` `:22216`(`:22219`)で実測。
- 撤退 = `:4511` `if (!isDrawerLvOn()) {` … `delete s.levelReq;`(isHoldPairOnTV と同じ「行に新しい値・撤退で戻す」作法)。
- ⭐ **`.levelReq` の読み手の全数**: `tavern.html` は `renderSpellSlotItem` の `const lvReq = sk.levelReq || 1;`(`:7455`)**1 件だけ**
  (`lvReq|levelReq` の grep は表の行・#59 のコメント・この 1 行のみ)。`js/*.js` は **0 件**(`levelReq` / `skillPool` / `SKILLS_UI` / `mpCost` いずれも 0)。
  skill オブジェクトを返す `getSkillTV`(`:5347`)の呼び手は `.name` しか読まない / `apEquippedIdsFor`・`pmEquippedSkillNames`・`loadSelections` の validIds は
  id だけ ⇒ **自動装備・行動の優先度の候補・保存の読み込みは不変**。
- 影響: `renderSpellSlotItem` を呼ぶ 2 箇所(引き出し / 準備画面)で、判定 Lv が 3 未満なら LB・ファイアボール、5 未満ならコーンオブコールドの行に
  `[LvN 必要]` + `.full` + ＋無効。⚠ **主人公の魔法使い本人にも効く**(主人公 Lv1 では主人公の 1 枚だけが変わる = probe ident (c-info))。
  本体の `initLeaderSpellSlots` も同じ `if (lv < lvReq) continue;` なので是正の向き。
- ⚠ 既知: `verify_bolt_aim.js:162`〜`:165` の変異 `flavor3` が LB 行を 1 行まるごと握っているので、`--negative` は **exit 3**
  (2.0 秒・§0e のアンカー検算で停止 = 他の 9 変異も走らない)。⛔ 本項目では直していない(項目3)。

#### (5) (β) 新顔の Lv をマッチング画面で決める

- ヘルパ(`:8009`〜`:8050`): `function isEarlyLevelOn() { return isDrawerLvOn(); }`(`:8021` = **有効条件の唯一の口**。項目2b が `?whois` を足すときはここを広げる)/
  `let earlyLvQuest = null;`(`:8022`)/ `let earlyLvByPerson = new Map();`(`:8023`)/ `const earlyLvFixed = new WeakSet();`(`:8024`)/
  `function earlyQuestKeyOf(sc, questLevel)`(`:8025`・鍵 = `[sc.id, sc.place, sc.title, questLevel].join("|")`)/ `function fixCompanionLevelsEarly(sc)`(`:8028`)。
- 抽選は **`assignCompanionLevels()` そのもの**(同じ帯・同じ clamp。写しを作らない)。振るのは「level を持たない非主人公」だけ
  (名簿の顔 = mercId + level と、level を持って来た顔 = 検証の仕込みには触らない ⇒ `verify_party_match_setup (5a)` の「selection が 1 バイトも変わらない」も生存)。
  「職|名前」で覚え、同じ依頼なら覚えた Lv を返す。依頼の鍵が変われば覚えを捨てて振り直す(自分で決めた顔も振り直す)。
- 呼び口 = 2 件: `function playPartyMatchCinematic(sc, opts)`(`:9208`)の `fixCompanionLevelsEarly(sc);`(`:9247`・カードを描く前・review でも呼ぶ)/
  `pmRebuildRef`(募集のかけ直し)の `:9431`(probe reroll: `?recruittalk=0` の「📣 募集をかけ直す」で作り直した新顔にも Lv)。出発では呼ばない。
- 出発 `function departToScenario(autoplayOverride)`(`:8053`):
  `const toRoll = isEarlyLevelOn() ? selection.partyMembers.filter(m => !earlyLvFixed.has(m)) : selection.partyMembers;`(`:8074`)→
  `assignCompanionLevels(toRoll, questLevelOf(prepScenario, heroLv), heroLv);`(`:8075`)。名簿登録(`DFRoster.enroll`)は従来どおりこの **後**。
  マッチング画面を通らずに `departToScenario()` を直に呼ぶ既存ドライバでは WeakSet が空 ⇒ 全員を従来どおり振る(乱数の消費も同じ)。
  自動デバッグ `:8176` `assignCompanionLevels(selection.partyMembers, heroLv, heroLv);` は無改変。
- 目印 = **ページの中の WeakSet と Map だけ**(⛔ member へフィールドを足していない)。保存形の実測(probe beta (g1)〜(g4)):
  出発で焼かれる `sessionStorage` `dragonfighters.partyMembers` の各メンバーのキー集合 = 着手前と同じ(主人公 `classKey,isHero,level,line,name,trait,variant,zone` / NPC は + `mercId`)・
  名簿 `dragonfighters.mercRoster` の各人 = `classKey,id,level,line,name,runs,trait,variant`(着手前と同じ)・同行候補 `dragonfighters.recruitCandidates` は
  マッチング画面を 4 回開いても **1 バイトも変わらない**・マッチング画面の時点の member のキー = 同行候補のキー + `level` だけ。
- 本番の `openPrep` 経路の実測(probe beta・主人公 Lv7): 画面の時点で新顔 3 人に Lv(bandits-forest = tier1 [2,4])→ 酒場へ戻って同じ依頼を 2 回受け直しても
  3 回とも同じ Lv → 別の依頼(lizard-swamp = tier2、Lv7 で clamp ⇒ [5,7])で振り直し → 出発後の sessionStorage と名簿の Lv = 画面の Lv。
- ⚠ 覚えはこのページの中だけ。酒場を出て(街/地図へ)戻ってから同じ依頼を受けると振り直される(同じ訪問の中で #60 の「酒場へ戻る」から受け直す限りは振り直さない)。
  ⇒ ユーザー決定の文言は満たすが、ページ遷移をまたぐ持ち越しは作っていない(保存キーを増やさないため)。⚠ 鍵は 1 つだけ: A → B → A と受け直すと A も振り直し。

#### (6) (γ) 同職は最も低い Lv(probe core)

- 主人公の魔法使い Lv7 + 仲間 Lv2 → **両方**のカードで LB `[Lv3 必要]`・上限 4(f1)/ 仲間 Lv2 と Lv4 → Lv4 の人の引き出しでも `[Lv3 必要]`(f2)/
  主人公 Lv7 + 仲間 Lv4 → LB は置けるがアイスストームは両方で `[Lv7 必要]`(f3)/ 戦士 2 人 → 技の枠 `(3/1)`(f4)。`?drawerlv=0` では全部主人公 Lv7(f1-off / f4 off)。

#### (7) `apEquippedIdsFor`(`:7665`・僧侶)— ⛔ 触っていない(判断を親へ)

- `:7667` `const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));` は **同じ欠陥**(主人公 Lv で僧侶の自動配分を引く)。効く先 = 引き出しの傾向段の候補と、
  カードの「技」行(`pmEquippedSkillNames` `:8736` が流用)。仲間の僧侶 Lv2 × 主人公 Lv7 なら、その人が持たない Lv3+ の呪文(ターンアンデッド / ホールド・パーソン /
  ストライキング / キュア・モデレート)が候補とカードに出る。一方で引き出しの行(`renderSpellSlotItem`)は本項目で Lv2 判定になった ⇒ **同じ画面で行とカードが食い違う**。
- 直すなら 1 行(`getClericSlotsTV(isDrawerLvOn() ? lowestLevelOfClass(classKey) : getLevelFromXP(inventory.xp))`)。⚠ 準備画面の行動の優先度 (#19) も読むので
  `driver_action_priority` 等を母集団へ足して測る必要がある ⇒ 本項目の範囲外として親へ。

#### (8) 受入プローブ(`scratchpad/item2a/probe72_2a.js`・ポート 10421〜10426・全部解放済み)

| mode | port | 結果 | 見たもの |
|---|---|---|---|
| core | 10421 | **15/15** | (a-new) マッチングで**実際に振られた**新顔 Lv2 で LB `[Lv3 必要]` + `.full` + ＋無効・押しても増えない / (a-roster) 名簿の顔 level=2 も同じ / (b) 振られた Lv4・名簿 Lv3 なら置ける / (2e) Lv2 の上限 4 で＋無効(主人公 Lv7 なら 10)/ review と出発で振り直さない(出発後 level=2)/ (f1)〜(f4) / off の腕は欠陥の再現 |
| ident | 10422 | **8/8** | (c) 主人公だけの魔法使い(仲間は非呪文職)で 4 枚全部が 0e8370d と完全一致(Lv7 / Lv5)/ (c-npc) 仲間の僧侶・エルフ Lv2 の 2 枚だけが変わる / (c-info) 主人公 Lv1 は (α) で主人公の 1 枚が変わる / (d)(d2) `?drawerlv=0` 完全一致 / (d-neg) |
| beta | 10423 | **11/11** | 本番の `openPrep` → 酒場へ戻る → 受け直し → 出発((5) の実測)/ (e-off) 影と off は従来どおり出発で振る / (g1)〜(g4) 保存形 |
| sample | 10424 | **5/5** | (h) 8 依頼 × 600 回 × 主人公 Lv10 / Lv3 で値の集合 = §2-3 の BAND ∩ ≤主人公 Lv(tier1 {2,3,4} / tier2 {5..8} / tier3 {9,10} / tier4 {10}・Lv3 は clamp)/ 3 人が独立に振られる(全員同じ 91/900 = 0.101 ≒ 1/9)/ off では 1 人も振らない / (i) memberLevelOf 恒等 |
| prep | 10425 | **1/1** | `?prepskip=0` の準備画面でも LB `[Lv3 必要]`・`&drawerlv=0` で出ない |
| reroll | 10426 | **1/1** | `?recruittalk=0` の「📣 募集をかけ直す」で作り直した新顔にもカードを描く前に Lv |

- ⚠ 測定の罠(1 件): `page.setRequestInterception` の `abort()` を既定(`'failed'`)のままにすると、出発の遷移がエラーページへ差し替わり `sessionStorage` が null で読める
  ⇒ `abort('aborted')`(`verify_recruit_size` と同じ作法)で直した。

#### (9) 既存 golden の色(`scratchpad/item2a/golden2a.tsv`・比較器 = 項目1 の `gate72.py --pair`・基準 = `item1/baseline72.tsv`)

| 本 | 腕 | 色 | 基準との突き合わせ |
|---|---|---|---|
| verify_mercenary_roster | 素 | 44/44 exit 0 | id 指紋 44=44 / 判定行 44=44 **差 0** |
| verify_mercenary_roster | --negative | exit 0(10 本とも赤) | 440=440 **差 0** |
| verify_recruit_size | 素 | 91/91 exit 0 | **差 0** |
| sweep_recruit_balance | 素 | exit 1(装置 assert 崩れ 4/4) | **基準と同じ赤**(同じ 4 行 `4_partySize(got=1 …)` / `2_recruitCountOf(got=3 want=2)`)。比較器の盲点の腕 = 総括行で突き合わせ |
| verify_bolt_aim | --negative | **exit 3**(§0e で `flavor3` のアンカー腐敗) | **想定内の赤**(本項目 (α) が LB 行を書き換えた)。⛔ 直していない = 項目3 |
| verify_party_match_setup | 素 | 36/36 | **差 0** |
| verify_pm_drawer_fit | 素 | 75/79 PENDING 4 | **差 0** |
| verify_darkvision / verify_spell_off / driver_party_view_reopen / verify_recruit_talk / verify_party_promises | 素 | 25/25・51/51・35/35・25/25・35/35 | 全部 **差 0** |

#### (10) 崩れた主張 — 項目2a で新たに **3 件**

| # | 主張 | 実測 |
|---|---|---|
| 1 | §5-2「主人公なら `memberLevelOf` が主人公 Lv を返す ⇒ 主人公が呪文職のときの挙動は 1 ビットも変わらない」/ §8 (2d) | ユーザー決定 (α)(γ) の後は**条件付き**。(α) で主人公の魔法使い Lv1〜2 は LB・ファイアボール、Lv1〜4 はコーンオブコールドに `[LvN 必要]` が出る(ident (c-info))。(γ) で同職の仲間が低 Lv なら主人公の引き出しも縛られる(core f1)。⇒ 恒等は「主人公 Lv ≥ 5(コーンオブコールド未習得なら ≥ 3)かつ同職の仲間なし」でだけ成り立つ(ident (c)(c2) はこの条件で 4 枚完全一致) |
| 2 | 項目2a の指示 (c)「主人公だけの魔法使い(同職の仲間なし)の引き出し DOM が着手前とテキスト完全一致」 | 主人公の 1 枚は一致するが、**同じ画面の仲間の僧侶・エルフ**の引き出しは変わる(柱2 は魔法使い専用ではなく呪文職の NPC 全員に効く)⇒ 全枚一致は仲間を非呪文職にした腕でだけ成り立つ(ident (c) / (c-npc)) |
| 3 | §1 / §2 / §8 は LB(魔法使い)だけを受入に挙げている | 同じ是正が僧侶・エルフの NPC にも出る: エルフ Lv2 は枠 2(`SPELL_SLOT_CURVE_ELF[2]`)なので既定配分 3 個で＋が全部無効 / 僧侶 Lv2 はターンアンデッド・ホールド・パーソンに `[Lv3 必要]`(ident (c-npc))。本体の切り方と一致する是正だが §8 に名前が無い = 項目4 の受入の空白地帯候補 |

---

### 12-0 追補(項目2b / 2026-09-22・実装窓 セッション `b34987cb-…`)— 柱1 表示 + 撤退 `?whois=0` + (β) の有効条件 + 僧侶の自動配分

⭐ 行番号は **本コミット後の `tavern.html`**(純 CRLF・10,914 行・bare LF 0・bare CR 0 を `py` のバイト数えで確認)。⛔ 使う前に逐語で引き直すこと。
変更ファイル = `tavern.html`(+71/-5)+ 本 `.md` のみ(`index.html` / `js/` / `tools/` は 1 バイトも触っていない)。
changelog = 親の指示の文面(§10 の 1 行目 +「一度一緒に戦った仲間は、酒場で声を掛けたときにもレベルが分かる。」)を `py tools/add_changelog.py` で追加(4 件維持・最古の #70 の行が落ちた)。

#### (1) 撤退スイッチ `?whois=0`

- 判定の逐語 = `try { return new URLSearchParams(location.search).get("whois") !== "0"; }` — **1 件**(`:4519`。関数 `function isWhoisOn() {` `:4518` = `isDrawerLvOn` `:4509` の直後)。const に畳まず呼ぶたびに URL を読む(isDrawerLvOn と同じ TDZ 回避の作法)。
- `isWhoisOn()` の出現 = **5 件**: 定義 `:4518` / 声掛け `:6451` / (β) の有効条件 `:8061` / 引き出しの見出し `:8893` / カード `:9225`。
- 0 で戻るもの = カードの `.pmLv`・見出しの `.pmDrawerLv`・声掛けの「職業 Lv◯」の 3 つ(どれも **要素ごと・文字ごと作らない**)。
- (β) の有効条件 = `function isEarlyLevelOn() { return isDrawerLvOn() || isWhoisOn(); }`(`:8061`・1 件)⇒ 新顔の Lv をマッチング画面で決めるのが止まるのは `?drawerlv=0` と `?whois=0` の **両方** が 0 のときだけ。
- `isDrawerLvOn()` の出現は 6 → **7 件**(`:4509` 定義 / `:4530` (α) の撤退 / `:4933` `skillLimitForClass` / **`:7706` `apEquippedIdsFor`(本項目 (7))** / `:7924` 準備画面 / `:8061` (β) / `:8943` 引き出し)。
- 実測(probe ident **7/7**):
  - `?whois=0` と 影 `f5fe8bc`(`/__base__/`): 名簿の魔法使い Lv2 + 新顔 2 人(マッチングで振る。`play` の同期部分だけ決定論の乱数に差し替えて両頁を同じ Lv に振った)/ 同職 2 人 + 新顔 で、カード列 innerHTML・4 枚の引き出し innerHTML・`selection`(振られた Lv 含む)・`MAGE_SKILLS_UI` が **完全一致**((f1)(f2))。
  - `?whois=0&drawerlv=0` と 影 `0e8370d`(`/__base0__/`): 名簿の魔法使い Lv2 + 新顔の僧侶/エルフ / 同職 2 人 + 仲間の僧侶 Lv2 で **完全一致**((f4)(f5)。新顔は画面の時点で振られない = level 無し)。
  - 比較器の負の対照 (f-neg): スイッチ ON では同じ盤面で 4 枚とも食い違う。影の配信の検算 (0c-ident): `f5fe8bc` は `isWhoisOn` 無し・`lowestLevelOfClass` 有り / `0e8370d` はどちらも無し。
  - ⚠ **(f3) `?whois=0` 単独は「主人公 Lv より低い仲間の僧侶」が居ると `f5fe8bc` と違う**: 違うのは僧侶のカードの「技」行と僧侶の引き出しの傾向段だけ(= (7) は柱2 側 = `?drawerlv=0` に属するため。`selection` は一致)。

#### (2) 表示の DOM(実装後の逐語)

| 画面 | 形 | 行 |
|---|---|---|
| マッチングのカード | `.pmClass` = テキストノード「職名」+ テキストノード `" "` + `<span class="pmLv">Lv◯</span>`。例「魔法使い Lv2」/ 主人公「戦士 Lv7」。`.pmName`(名前の行)は無改変 | `classEl.textContent = classJa;` `:9218` の直後 `:9219`〜`:9232`(`const cardLv = isWhoisOn() ? shownLevelOf(m) : null;` `:9225` / `lvEl.className = "pmLv";` `:9229`)。CSS `.pmLv { color: #e8dcc0; font-weight: 700; }` `:2243` |
| 引き出しの見出し | `#pmDrawerTitle` = テキストノード「職名 — 名前(主人公は あなた)」+ `" "` + `<span class="pmDrawerLv">Lv◯</span>`。Lv = **開いた本人** | `title.textContent = slot.name + " — " + …` `:8888` の直後 `:8889`〜`:8900`(`const titleLv = isWhoisOn() ? shownLevelOf(m) : null;` `:8893` / `titleLvEl.className = "pmDrawerLv";` `:8897`)。CSS `.pmDrawerLv { letter-spacing: 0; }` `:2316` |
| 酒場の声掛け | `#recruitRole` の textContent = `職名 + " Lv" + ◯ + " — " + 性格`(**名簿の顔だけ**)/ 初めての顔は従来の `職名 + " — " + 性格` | `const recruitLv = (isWhoisOn() && m.mercId != null && typeof m.level === "number" && m.level > 0) ? levelOfMember(m) : null;` `:6451` / 代入 `:6452`〜`:6453` |

- **Lv の出所**: カードと見出しは `function shownLevelOf(m)` `:4908`(主人公か数値の level を持つ顔なら `levelOfMember(m)`、未確定なら `null` = 出さない)。声掛けは上の条件のときだけ `levelOfMember(m)`。⛔ `m.level` をそのまま出す箇所は 0(probe card (a-hero): 主人公の `m.level` は `undefined` のままカードに「戦士 Lv7」/ (a-clamp): 名簿の保存 Lv9 の僧侶は主人公 Lv7 のとき「僧侶 Lv7」)。
- ⚠ マッチング画面では `fixCompanionLevelsEarly` がカードを描く前に振るので、`shownLevelOf` が `null` を返す顔は実際には出ない(`null` は保険)。

#### (3) カードの設計判断 — `.pmClass` の **中** の inline `<span class="pmLv">`

| 候補 | 高さ | 読みやすさ | 受入での測りやすさ | 採否 |
|---|---|---|---|---|
| 兄弟の新しい行(`.pmClass` の下) | ✗ 縦 flex で 1 行増える = カードが伸びる | ○ | ○ | 不採用 |
| `.pmClass` の textContent へ直に「 Lv2」 | ○ 0px | △ 職名と同じ色・太さで埋もれる | △ 正規表現で切り出すしかない | 不採用 |
| **`.pmClass` の中の `<span class="pmLv">`** | **○ 0px(4 画面で実測)** | **○ 色 `#e8dcc0` + 太字で Lv だけ立つ** | **○ 職名 = 先頭テキストノード / Lv = `.pmLv` を構造で分けて読める** | **採用** |
| CSS `::after { content: attr(data-lv) }` | ○ | ○ | ✗ textContent に出ない = 受入が逐語を読めず、`verify_darkvision (3a)` / `verify_party_match_setup (0b)` を「変わっていない」と **誤って緑** にする | 不採用 |

- ⚠ `.pmClass` の textContent が「魔法使い Lv2」になるので **`verify_party_match_setup (0b)` と `verify_darkvision (3a)` は型1 の赤**((8))。⭐ 言い直し(項目3)は「`.pmClass` の先頭テキストノード」または「`.pmClass` から `.pmLv` を除いた文字」で職名を取れば、元の意味(職業の並び / 着手前と 1 文字も違わない)をそのまま保てる。
- 見出しも同じ形(テキスト + `<span class="pmDrawerLv">`)。字間だけ 0: 縦持ち 390px の見出しの置き場は **228px**(引き出しの幅 − 閉じるボタン − gap)で、最長の「ドワーフ — ガウェイン Lv10」は字間 2px のままだと **227px(余白 1px)**。字間 0 で **219px**(実測 sw)。

#### (4) 注記(`pmDrawerNote`)へ「低い Lv で判定」を **足さなかった** 理由

- pre probe(現行 DOM への仮の追記・本番は無傷): 候補 4 つ(「(いちばん低い Lv に合わせて判定)」「(判定はいちばん低い Lv)」「(低い Lv で判定)」「・判定は最も低い Lv」)が **すべて**、縦持ち 390px で注記 **18 → 36px**(2 行)・引き出し **+18px**。desktop 2 画面は 1 行のまま(注記の幅 1010px)。「ドワーフ 3 人」の文でも同じ ⇒ 指示どおり足していない。
- その結果、同職 2 人以上では **見出しの Lv と行の `[LvN 必要]` が食い違う**(probe card (b-dup): 主人公 Lv7 / ロルフ Lv2 / ミラ Lv4 で、ミラの見出し「魔法使い — ミラ Lv4」+ LB 行 `[Lv3 必要]`・`.full`)。注記「⚠ この設定は 魔法使い 3 人に共通で適用されます」は従来どおり出る。

#### (5) 寸法(probe dims 5/5 + pre)— 測り方は項目1 (11) と同じ(viewport は幅と高さだけ・演出を最初からその寸法で開く)

| 画面 | カード rect.h | 引き出し rect.h(戦士・魔法使い・僧侶・エルフ) | 見出し h | 声掛けダイアログ(名簿の顔 120 組) |
|---|---|---|---|---|
| 1280x900 | 334.6 ×4 | 639.7 / 580.3 / 518.5 / 501.6 | 20.3 | 全組 不変 |
| 1366x768 | 334.6 ×4 | 同上 | 20.3 | 全組 不変 |
| 390x844 | 312.1・312.1・358.6・358.6 | 965.2 / 919.8 / 748.8 / 715.1 | 20.3 | ⚠ **8 組が +20.0px** |
| 390x667 | 同上 | 同上 | 20.3 | ⚠ 同じ 8 組が +20.0px |

- 表の値 = 項目1 の編成(戦士★ / 魔法使い ロルフ Lv2 / 僧侶 リタ Lv2 / エルフ エル Lv2・配分 sleep+LB・主人公 Lv7)を `?drawerlv=0` で開いた腕 (A)。**項目1 の基準寸法と 4 画面とも完全一致**、Lv を出す現行と出さない影 `f5fe8bc` で カード rect.h・職業行 h(18)・引き出し rect.h / scrollHeight / clientHeight・見出し h が **完全一致**。
- 同じ一致を 4 画面 × さらに 3 編成で確認: (B) 既定・僧侶を主人公と同じ Lv7 / (C) 最長の名前 + 全員 Lv10(見出し「ドワーフ — あなた Lv10」「ドワーフ — ガウェイン Lv10」「魔法使い — ベルント Lv10」sw 185 / 219 / 203・h 20.3)/ (D) 同職 2 人(注記つきの引き出し)。
- ⚠⚠ **(E) = 項目1 の編成を既定で(僧侶 Lv2 < 主人公 Lv7)開くと、カードが縮む**: desktop 334.6 → **319.1**(4 枚)・compact 358.6 → **327.6**(僧侶の段の 2 枚)。**Lv の文字ではなく (7) の効果**(僧侶の「技」行が「キュア・ライトウーンズ・シールド・オブ・フェイス・ターンアンデッド・ホールド・パーソン」→「キュア・ライトウーンズ・シールド・オブ・フェイス」)。引き出しの寸法は影と一致。
  ⚠ E の僧侶の引き出し 501.6(desktop)/ 715.1(compact)は **影 `f5fe8bc` も同じ** = 項目2a の時点で項目1 の 518.5 / 748.8 から変わっていた(2a の申し送りには無い。項目1 の数字と一致するのは `?drawerlv=0` の腕)。
- ⚠ 測り方の注意: 同じ編成でも 390px を `isMobile: true, hasTouch: true` で開くとカード 343.1 / 引き出し 1444.9 など **別の値** になる(pre と dims 1 回目)。項目1 の基準と比べるときは viewport に幅と高さだけを渡すこと。
- ⚠⚠ **声掛けダイアログは 390px で不変ではない**: 6 職 × 性格 10 × Lv{2,10} の 120 組のうち **8 組**(ドワーフ/魔法使い × 「無口で何を考えているか読めない」は Lv2 でも・Lv10 では 魔法使い × 「やたらお調子者で場を和ませる」「酒好きで宵越しの金を持たない」「夢見がちで英雄譚に憧れている」/ エルフ × 「無口…」)で役割の行が 2 行に折り返し、`#recruitBox` が **293.4 → 313.4px**(差は全部ちょうど 1 行)。役割の行の幅は **281px**(`width: min(460px, 90vw)` − padding 32×2 − 枠)。
  - 不変にする手は「性格を `…` で切る」か「Lv を名前の行へ移す」しか無く、どちらも指示(「職業 Lv◯」を先頭・性格は従来どおり後ろ)と食い違う ⇒ **自然な折り返しのまま** にした。
  - 根拠: 声掛けダイアログを押す既存 golden は `verify_recruit_talk` / `verify_hold_person` の 2 本で、**どちらも `el.click()`**(実座標クリック 0 本)。名簿の顔を卓に座らせてダイアログを開く既存 golden は 0 本(`mercRoster` を仕込むのは `verify_mercenary_roster` だけで、ダイアログは開かない)。`#recruitRole` を読む既存 golden も 0 本。
  - ⇒ 親の (e)「声掛けダイアログが 4 画面で不変」は **desktop 2 画面では成立・縦持ち 2 画面では 8/120 組で不成立**(崩れた主張 1)。⛔ ユーザーが「折り返さない」を望むなら別の見た目(Lv を名前の行へ / 性格を省略)を諮ること。

#### (6) 声掛けダイアログ(probe dialog 9/9)

- 名簿を満杯(12 人 = 6 職 × 2)にすると `pickCompanion` の新顔の枝が消え、卓の 4 席が全員名簿の顔になる(装置 (c-0))。そのうえで `todaysPatrons` の実物の席に `openRecruitDialog` を開いた:
  「戦士 Lv2 — 無口で何を考えているか読めない」「魔法使い Lv5 — 血の気が多くすぐ突っ込む」「僧侶 Lv7 — 金にがめついが約束は守る」「エルフ Lv2 — 無口で…」(Lv = 仕込んだ level を主人公 Lv7 で clamp した値 = `levelOfMember(m)` の 2 経路一致)。
- (c-clamp) 本物の抽選 `drawTodaysPatrons()` で引いた **保存 Lv9** のイレーナ(ドワーフ)は「ドワーフ Lv7 — やたらお調子者で場を和ませる」= カードと同じ clamp 済みの値。⚠ **傭兵名簿パネルは保存値の「Lv9」** を出す(`.mrMeta` は無改変)⇒ 名簿の Lv が主人公 Lv を超えるときだけ 2 つの表示が食い違う(崩れた主張 4)。
- (c-new) 名簿が空 = 4 席とも新顔(level も mercId も無い)⇒ Lv 無しの「職名 — 性格」。(c-off) `?whois=0` は名簿の顔でも Lv 無し。
- (d) 決定論の乱数(ページの最初から)で卓の顔ぶれを影と揃え、**傭兵名簿パネル(`#rosterBody` innerHTML 3,309 字 / `#rosterSub`)・卓の頭上札 4 枚(`.patronLabel` の文字・class・`data-patron`・pointer-events)が ON でも `?whois=0` でも `f5fe8bc` と完全一致**。`?whois=0` のダイアログ(名前・役割・台詞・約束の行)も完全一致。

#### (7) `apEquippedIdsFor`(僧侶の自動配分)— 親の追加(項目2a の申し送り)

- 逐語: `const auto = getClericSlotsTV(isDrawerLvOn() ? lowestLevelOfClass(classKey) : getLevelFromXP(inventory.xp));` `:7706`(関数 `function apEquippedIdsFor(slot, classKey) {` `:7700`)。旧逐語 `const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));` は **0 件**。
- probe cleric: 主人公 Lv7 × 仲間の僧侶 Lv2(呪文 9 種を習得済みにした盤面)で、カードの「技」行 = `CLERIC_SLOTS_TABLE[id][2] > 0` から導いた集合「キュア・ライトウーンズ・ブレス・シールド・オブ・フェイス」と一致・傾向段の候補も同じ 3 id・`[LvN 必要]` の付く 6 呪文はどちらにも出ない((g1)(g2)(g3))。`?drawerlv=0` と影 `f5fe8bc` は 9 呪文 = 直す前の欠陥の再現((g-off)(g-base))。主人公が僧侶で同職なし = 影と同じ((g-hero))。
- ⚠ **主人公の僧侶 Lv7 + 仲間の僧侶 Lv2 では、主人公のカードの「技」行も Lv2 の 3 呪文**((g-dup))。本体 `index.html` の僧侶は自動配分を **各自の Lv で** 組む(主人公は戦闘で 9 呪文を持つ)が、`pmEquippedSkillNames(classKey)` は **職単位** で 1 つの列しか返せない ⇒ (γ) と同じく「全員が必ず持つ集合」を出した。傾向(`selection.actionPriority.cleric`)も職単位なので、候補を最低 Lv に揃えるのは (γ) と整合する。
- ⚠⚠ **副作用(記録・判断材料)**: 傾向段は既存の正規化 `if (row[sit.key] && ids.indexOf(row[sit.key]) < 0) { row[sit.key] = null; dirty = true; }`(引き出し `:9100` / 準備画面 `:7845`)で「今の候補に無い保存値を おまかせ へ戻して保存」する。(7) で僧侶の候補が最低 Lv の集合に減るので、**保存済みの僧侶の傾向(例: ホールド・パーソン)は、仲間の僧侶 Lv2 が居る編成で僧侶の引き出しを開いた瞬間に `null` へ書き戻され、`localStorage` `dragonfighters.actionPriority` にも保存される**(probe cleric (g-ap): ON `["hold-person","hold-person"]` → `[null,null]` / `?drawerlv=0` と影 `f5fe8bc` は残る)。仲間の僧侶が居なくなっても戻らない(値が消える)。⇒ 主人公が僧侶 Lv7 で仲間の僧侶 Lv2 を連れた回に、主人公の「ボスにはホールド・パーソン」の指示も消える。(γ)「全員が必ず持てるものだけ」と同じ向きだが、**保存値を壊す** 点は 2a の「既に上限を超えて置かれている技は消さない」と逆 ⇒ 親 / ユーザーの判断材料(⛔ 本項目では正規化に手を入れていない)。
- ⚠ **カードの高さ**: (5) の (E)。

#### (8) 既存 golden の色(`scratchpad/item2b/golden2b.tsv`・比較器 = 項目1 の `gate72.py --pair`・基準 = `item1/baseline72.tsv`)

| 本 | 腕 | 色 | 基準との突き合わせ(経路1 = assert id の指紋 / 経路2 = 判定行の多重集合) | 型 |
|---|---|---|---|---|
| `verify_party_match_setup` | 素 | **exit 1・35/36** | 差 2 / 2 = **(0b) だけ** PASS→FAIL(「カード=["戦士 Lv5","僧侶 Lv3","僧侶 Lv4","魔法使い Lv3"] / 実体=["戦士","僧侶","僧侶","魔法使い"]」) | **型1**(`tools/verify_party_match_setup.js:746`〜`:750`・`.pmClass` の並び === `PARTY_SLOTS[].name`。職業行に Lv が入った)⇒ 項目3 |
| `verify_party_match_setup` | --negative | exit 0(8 本とも担当が赤・空振り 0) | 差 16 = 8 腕それぞれの (0b) PASS→FAIL だけ | 型1 の持ち越し(担当ラベルは全部赤のまま) |
| `verify_darkvision` | 素 | **exit 1・24/25** | 差 2 / 3(+RECAP)= **(3a) だけ** PASS→FAIL(「#0 .pmClass "戦士 Lv5" ≠ "戦士" …」4 枚とも `.pmClass` だけ。`.pmName` / `.pmEquipRow` / `.pmSkillsVal` は一致) | **型1**(`tools/verify_darkvision.js:1179`〜`:1211`・比較 `:1198`・抽出 `:677` / `:825`)⇒ 項目3 |
| `verify_darkvision` | --negative | **exit 1・37/38** | 差 2 / 3 = (3a) だけ | 型1(素と同じ 1 本) |
| `verify_spell_off` | 素 | exit 0・51/51 | 差 0 / 0 | — |
| `verify_spell_off` | --negative | **exit 1(2.0 秒)・12 変異すべて exit 3** | 基準 624 id → 0(変異が 1 本も走らない) | **型1 = 変異 `apcand` のアンカー腐敗**。`tools/verify_spell_off.js:219`〜`:222` が `'      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));'` を握り、各変異の子プロセスが **全変異のアンカーを原本で健在チェック** するので 1 本の腐敗で 12 本とも exit 3 ⇒ 項目3 で本項目 (7) の `:7706` の行へ言い直す |
| `driver_action_priority` | 素 | exit 0・92/92 | 差 0 / 0 | — |
| `driver_action_priority` | --negative | exit 1(2.0 秒) | 基準と逐語で同じ「負のコントロール N3 の注入点が 2 箇所 (期待 1)」(#35 以来) | 既知の赤 |
| `verify_mercenary_roster` | 素 | exit 0・44/44 | 差 0 / 0 | — |
| `verify_mercenary_roster` | --negative | exit 0(10 本とも担当が赤・空振り 0) | 差 4 = 変異 `alwaysroster` の腕の **担当外** (2z3)(2e) が基準 FAIL → 今回 PASS | 乱数の揺れ: (2e) の区画は `grow()`(乱数の出発)で育てた名簿の人数で分岐し、同じ走行の中でも腕ごとに 9〜12 人と揺れる。基準の腕は 11 人 → 変異が Lv1 の新顔を足して付随赤 / 今回と再走 1 回は 12 人(満杯)で付随赤なし。担当ラベル (0a)(5a) は両方赤。本項目の変更から (2e) への経路は無い(`memberLevelOf` / `skillLimitForClass` は無改変) |
| `verify_pm_drawer_fit` | 素 / --negative | exit 0・75/79 PENDING 4 / 9 本とも担当が赤 | 差 0 / 0・0 / 0 | — |
| `verify_recruit_talk` / `verify_party_promises` / `driver_party_view_reopen` / `verify_recruit_size` / `verify_hold_person` / `verify_prep_retire` / `driver_equip_compact_ios` | 素 | 25/25・35/35・35/35・91/91・31/31・30/30・31/31 すべて exit 0 | すべて **差 0 / 0** | — |

- 実座標クリックの golden(`verify_party_match_setup` (3a)〜(4b) / `verify_pm_drawer_fit` の 4 画面)は、カードの Lv と (7) の縮みの両方を含む盤面(`verify_party_match_setup` の編成 = 主人公 戦士 Lv5 + 僧侶 Lv3・Lv4 + 魔法使い Lv3)で緑のまま。
- ⛔ `tools/` は 1 バイトも直していない。赤の 3 本(素 2 + `verify_spell_off --negative`)はすべて型1 = 項目3 の言い直し対象(2a からの `verify_bolt_aim --negative` exit 3 と合わせて 4 本)。
- ⚠ 既知フレーク 9 本は本項目の golden に含めていない(名指し + 本項目の行を読む本だけ)。

#### (9) 受入プローブ(`scratchpad/item2b/probe72_2b.js`・ポート 10427〜10432・全部解放済み)

| mode | port | 結果 | 見たもの |
|---|---|---|---|
| pre | 10427 | 記録 | 実装前に候補の文字を現行 DOM へ仮に足した 4 画面の高さ(カード 0px / 見出し 0px・最悪 227/228px / 注記 390px で +18px / ダイアログ 390px で一部 +20px) |
| card | 10428 | **14/14** | (a-new) マッチングで **実際に振られた** 新顔 Lv2 のカード「魔法使い Lv2」/ (a-hero) 主人公「戦士 Lv7」(`m.level` は undefined のまま)/ (b-new)(b-hero) 見出し「魔法使い — ヨナ Lv2」「戦士 — あなた Lv7」(見出しの文字と `levelOfMember` の 2 経路)/ (a-roster)(b-roster) 名簿の顔 / (a-clamp) 保存 Lv9 → Lv7 / (a-off)(b-off) `?whois=0` で `.pmLv` 0 個・見出しに Lv 無し / (a-name) `.pmName` は ON と OFF で同一 / (a-dl0) `?drawerlv=0` でも表示は同じ / (b-dup) 見出しと行の食い違い |
| dialog | 10429 | **9/9** | (6) |
| dims | 10430 | **5/5** | (5)(うち 2 本は [記録]: (e-7) カードの縮み / (e-dialog-compact) 8/120 組) |
| ident | 10431 | **7/7** | (1) |
| depart | 10427 | **3/3** | (f6) `?whois=0&drawerlv=0` と `0e8370d` は本番の `openPrep` → 出発で同じ挙動(画面で振らず出発で帯 [2,4])・出発で焼くキー集合と名簿のキー集合も同じ / (f7) `?drawerlv=0` 単独は表示 ON なので画面で振り出発で振り直さない |
| cleric | 10432 | **10/10**(g-ap 含む) | (7) |

#### (10) 崩れた主張 — 項目2b で新たに **7 件**(累計 **22**)

| # | 主張 | 実測 |
|---|---|---|
| 1 | 項目1 (11)「`" Lv10"` を DOM で足しても **4 画面とも** 高さ 0px(`#recruitRole` 20→20・ダイアログ 266.2→266.2)」・親の (e)「声掛けダイアログが 4 画面で不変」 | 項目1 の声掛けの実測は **既定の 1280x900・卓の 1 席だけ** だった。縦持ち 390px では名簿の顔 120 組中 8 組で +20.0px((5))。カード・見出しは 4 画面とも 0px で成立 |
| 2 | 親の (e)「カードの高さを 1px も変えない」 | Lv の表示では 0px で成立。ただし親の追加 (7) で、主人公 Lv より低い仲間の僧侶が居るとカードが **縮む**(334.6→319.1 / 358.6→327.6)((5) E) |
| 3 | 親の (f)「`?whois=0` で `f5fe8bc` と DOM 完全一致」 | (7) は `?drawerlv=0` 側なので、主人公 Lv より低い仲間の僧侶が居る盤面では僧侶の「技」行と傾向段が違う((1) f3)。それ以外の盤面では完全一致 |
| 4 | §2-4 / §5-1「傭兵名簿パネルは ⇒ ここだけ既に 3 点そろっている(触らない)」 | パネルは保存値の Lv、カード・見出し・声掛けは主人公 Lv で clamp した Lv ⇒ 名簿の Lv が主人公 Lv を超えると食い違う(イレーナ 保存 Lv9 → 声掛け Lv7)((6)) |
| 5 | 項目1 (11)「見出しの `scrollWidth` = `clientWidth` = 97〜148px で、器にまだ余白がある」 | 測った名前が短かっただけ。縦持ちの置き場 228px に対し最長の「ドワーフ — ガウェイン Lv10」は字間 2px のままで 227px(余白 1px)⇒ Lv の字間を 0 にして 219px((3)) |
| 6 | 項目2a の申し送り / 親「(7) は 1 行・`?drawerlv=0` で従来に戻ること」 | 表示は 1 行で揃い `?drawerlv=0` で戻る。ただし既存の傾向の正規化を通して **保存済みの僧侶の傾向を `null` へ書き換えて保存する**(g-ap)⇒ 一度書き換わると `?drawerlv=0` でも戻らない((7)) |
| 7 | 親の (e) の基準寸法「引き出し desktop 639.7/580.3/**518.5**/501.6・compact 965.2/919.8/**748.8**/715.1」(= 項目1・`0e8370d`) | `f5fe8bc`(2a 後)の既定では、項目1 の編成の僧侶 Lv2 の引き出しが **501.6 / 715.1** に変わっていた(2a の申し送りに無い)。項目1 の数字がそのまま出るのは `?drawerlv=0` の腕だけ((5)) |

#### ▶ 項目2c / 3 / 4 / 5 への申し送り

1. **項目3(golden の言い直し)= 型1 の赤 3 本 + 2a の 1 本**:
   - `verify_party_match_setup.js:746`〜`:750` (0b): 職名は `.pmClass` の **先頭テキストノード**(または `.pmLv` を除いた文字)で取る。`--negative` の 8 腕の (0b) も同時に直る。
   - `verify_darkvision.js:677` / `:825` の `cls: txt(c.querySelector('.pmClass'))` → 同じく職名だけを取り、(3a) `:1198` の 1 文字比較の意味(着手前と職名が同じ)を保つ。⭐ Lv の比較は影(着手前)に無いので (3a) の外で。
   - `verify_spell_off.js:219`〜`:222` 変異 `apcand`: from = `'      const auto = getClericSlotsTV(isDrawerLvOn() ? lowestLevelOfClass(classKey) : getLevelFromXP(inventory.xp));'`(`tavern.html:7706`・1 件)。to は「`getClericSlotsTV` を通さず `CLERIC_SLOTS_TABLE` を直読み」の意味を保ち、Lv の式は from と同じにする(担当が赤くなるかを実走で確かめる)。
   - 2a の `verify_bolt_aim.js:162`〜`:165` 変異 `flavor3`(LB 行)。
2. **項目2c(柱3)**: 本項目は `pickCompanion` の 4 行(`verify_mercenary_roster` の計測シーム)を触っていない(素 44/44 で確認)。changelog の柱1 行 = `<li><b>仲間の名前・職業・レベルがひと目で分かるように</b> — マッチング画面のカードと設定の見出しにレベルを表示。一度一緒に戦った仲間は、酒場で声を掛けたときにもレベルが分かる。</li>`(`tavern.html` の `changelogList` の先頭)を進化させる。
3. **項目4(受入 `tools/verify_member_identity.js`)**:
   - DOM の形: カード `.pmColumn .pmClass` の先頭テキストノード = 職名 / `.pmClass .pmLv` の textContent = `"Lv" + n`(`?whois=0` では `.pmLv` が 0 個)。見出し `#pmDrawerTitle` = `職名 + " — " + (主人公は "あなた" / 名前) + " " + <span class="pmDrawerLv">Lv n</span>`。声掛け `#recruitRole` = `職名 + " Lv" + n + " — " + 性格`(名簿の顔 = `mercId != null` かつ数値の `level` のときだけ)。
   - 期待値の導き方: 主人公 Lv は XP から(21000 = Lv7 / 45000 = Lv10)、名簿の顔は `min(保存 level, 主人公 Lv)`、新顔はマッチング画面で振られた `selection.partyMembers[i].level`(2 経路目 = `levelOfMember(pmOrdered[i])`)。
   - 仕込み: 卓の 4 席を名簿の顔にするには **名簿を満杯(CAP 12・6 職 × 2)** にする(新顔の枝が消える)。保存 Lv > 主人公 Lv の席は本物の `drawTodaysPatrons()` を引き直して得る。影との DOM 比較で卓を揃えるには `evaluateOnNewDocument` で決定論の `Math.random` を入れる(卓・名簿パネル・頭上札が一致した)。新顔の Lv を影と揃えるには `__pmTest.play` の **同期部分だけ** 決定論の乱数に差し替える。
   - 寸法: viewport は **幅と高さだけ**(`isMobile` / `hasTouch` を付けると値が変わる)。声掛けダイアログは 390px で 8/120 組が +20px(受入で「不変」を assert しないこと。するなら desktop だけ)。
   - 変異の候補(逐語は本コミットで取り直し済み): `lvnoshow` = `lvEl.textContent = "Lv" + cardLv;`(`:9230`)/ `headnolv` = `titleLvEl.textContent = "Lv" + titleLv;`(`:8898`)/ 撤退の `switchdead` = `get("whois") !== "0"`(`:4519`・1 件)/ 声掛け = `const recruitLv = (isWhoisOn() && m.mercId != null && typeof m.level === "number" && m.level > 0) ? levelOfMember(m) : null;`(`:6451`)。
   - (7) の網: 仲間の僧侶 Lv2 のカードの「技」行 = `CLERIC_SLOTS_TABLE[id][2] > 0` から導く集合(呪文名に「・」が入るので「技」行を「・」で割らない)。
4. **項目5(母集団)**: 本項目で新しく読まれうる要素 = `.pmClass` の文字 / `#pmDrawerTitle` の文字 / `#recruitRole` / `apEquippedIdsFor` の行。golden は §(8) の 19 腕で色を控えた(比較器 `item2b/gate2b.py` = `item1/gate72.py` の `pair` を無改変 import)。⚠ 走査はコミット後の clean な木で。
5. ポート: プローブは **10427〜10432** を使い全部解放済み(`depart` は 10427 を再利用)。**10401〜10413 は未使用**(項目4 予約)。

---

### 12-0 追補(項目2b2 / 2026-09-22・実装窓 セッション `b34987cb-…`)— 項目2b (7) の副作用の直し: カードの「技」行は本人の Lv・傾向の候補は主人公 Lv(保存値を消さない)+ 同職の注記の言い換え + changelog の 2a 行を進化

⭐ 行番号は **本コミット後の `tavern.html`**(純 CRLF・**10,934 行**・bare LF 0・bare CR 0 を `py` のバイト数えで確認)。⛔ 使う前に逐語で引き直すこと。
変更ファイル = `tavern.html`(+35/-15)+ 本 `.md` のみ(`index.html` / `audio.js` / `js/` / `tools/` は 1 バイトも触っていない)。
置換は `scratchpad/item2b2/patch72_2b2.py`(7 箇所・各アンカーの件数 1 を assert・`wb`)。影 = 着手前 `fcde6a9` の `tavern.html` を `item2b2/base_tavern_fcde6a9.html` へ退避(blob `798e31c` を `git hash-object` で一致確認)。

#### (1) 親の決定と実装の形(実装後の逐語)

親の決定(2026-09-22): ① カードの「技」行は **そのカードの本人の Lv**(僧侶 = 自動配分職)/ ② 傾向欄の候補は **2b の前 = `f5fe8bc` と同じ主人公 Lv**(保存値を消さない。低 Lv の僧侶に使えない呪文が候補に残るのは許容 =「指示は傾向です」)。

| 何 | 逐語 | 行 |
|---|---|---|
| 関数 | `function apEquippedIdsFor(slot, classKey, ownLv) {`(3 引数目 `ownLv` は省略可) | `:7700` |
| 傾向段の候補 = 主人公 Lv | `      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));` ⭐ **`f5fe8bc` の逐語そのもの**(1 件) | `:7711` |
| カード用の Lv | `      const pool = (typeof ownLv === "number" && ownLv > 0) ? getClericSlotsTV(ownLv) : auto;` | `:7712` |
| 絞り込み(1 本のまま) | `        .filter(sk => (pool[sk.id] \|\| 0) > 0 && isSpellKnownTV(classKey, sk.id))` | `:7714` |
| カード | `function pmEquippedSkillNames(classKey, m) {` / `const ownLv = (m && isAutoSlotClassTV(classKey) && isDrawerLvOn()) ? levelOfMember(m) : undefined;` / `try { ids = apEquippedIdsFor(slot, classKey, ownLv) \|\| []; } catch (e) { ids = []; }` | `:8786` / `:8789` / `:8791` |
| カードの呼び口 | `const names = pmEquippedSkillNames(m.classKey, m);`(`renderSkills` = `fill` と同期 `pmRefreshCards` の両方がここを通る) | `:9218` |
| 同職の注記 | `note.textContent = (isWhoisOn() && isDrawerLvOn())` → `"⚠ " + slot.name + " " + sameCount + " 人に共通・判定は" + (sameCount === 2 ? "低い方の" : "最も低い") + " Lv" + lowestLevelOfClass(classKey)` / 撤退時は従来の `"⚠ この設定は " + … + " 人に共通で適用されます"` | `:8937`〜`:8939` |

- 旧逐語(2b)`getClericSlotsTV(isDrawerLvOn() ? lowestLevelOfClass(classKey) : getLevelFromXP(inventory.xp))` は **0 件**。
- ⭐ `driver_action_priority` の負のコントロール N3 のアンカー `const equippedIds = apEquippedIdsFor(slot, classKey);` は **2 件のまま・逐語不変**(`:7815` 準備画面 / `:9075` 引き出し。どちらも Lv を渡さない = 主人公 Lv)。
- 出現数: `isDrawerLvOn()` 7 → **8 件**(`:4509` 定義 / `:4530` (α) / `:4933` `skillLimitForClass` / `:7930` 準備画面 / `:8067` (β) / **`:8789` カード** / **`:8937` 注記** / `:8963` 引き出し。2b の `:7706` は消えた)。`isWhoisOn()` 5 → **6 件**(`:8937` 注記を追加)。`getLevelFromXP(inventory.xp)` は 9 行のまま。
- 正規化の行(触っていない): 準備画面 `:7851` / 引き出し `:9120` の `if (row[sit.key] && ids.indexOf(row[sit.key]) < 0) { row[sit.key] = null; dirty = true; }`。

設計の候補(採否):

| 候補 | 絞り込みの口 | `apcand` のアンカー | 採否 |
|---|---|---|---|
| **A. `apEquippedIdsFor` に省略可の `ownLv`・主人公 Lv の行は `f5fe8bc` の逐語のまま** | 1 本(`pmEquippedSkillNames` の注記「唯一の正は apEquippedIdsFor」を保つ) | **生き返る**(`fcde6a9` 0 件 → 1 件 = `f5fe8bc` と同じ) | **採用** |
| B. カード専用の関数を別に書く | 2 本(同じ `.filter` の写し = 口が増えるたびに漏れる型) | 生き返る | 不採用 |
| C. `ownLv` を 1 行の式に畳む(`getClericSlotsTV(ownLv == null ? 主人公 Lv : ownLv)`) | 1 本 | 腐ったまま(項目3 の言い直しが要る) | 不採用 |

#### (2) (a) 保存済みの僧侶の傾向が消えない(probe keep **10/10**・port 10434)

仕込み: `dragonfighters.actionPriority` = `{"cleric":{"general":"hold-person","mob":null,"boss":"hold-person","travel":null}}`・主人公 Lv7・仲間の僧侶 Lv2(`hold-person` は Lv2 の集合に無い)。読む点 = `localStorage` の general/boss と画面の `select`。

| 腕 | 経路 | 現行 | `?drawerlv=0` | 影 `fcde6a9`(負の対照) |
|---|---|---|---|---|
| M | マッチング(`__pmTest.play`)→ 僧侶の引き出し → 全員の引き出し | 3 時点とも `hold-person`・select も `hold-person` (a1) | 同じ (a1-dl0) | 僧侶の引き出しを開いた瞬間に `[null,null]` を保存 (a1-neg) |
| H | 主人公の僧侶 + 名簿の僧侶 Lv2 を **本番の `openPrep`** で → 両方の僧侶の引き出し | 残る・両方の select が `hold-person` (a2) | — | **`openPrep` の時点で既に `null`**(見えない準備画面の描画 = 主人公の職のタブの正規化)(a2-neg) |
| P | `?prepskip=0` の準備画面で「僧侶」のタブを押す | 残る・`#apRows` の select が `hold-person` (a3) / 主人公が僧侶でも残る (a3-hero) | — | タブを押した瞬間に `null` (a3-neg) |

⭐ 2b の副作用①は **マッチング画面を開くだけでなく `openPrep` の見えない描画でも起きていた**(H 腕の影)= 主人公が僧侶なら、依頼を受けて低 Lv の僧侶が来た時点で消えていた。

#### (3) (b)(c) カードの「技」行 = 本人の Lv(probe cards **12/12**・port 10435)

期待値は **同じページの `getClericSlotsTV(本人の Lv)`** から導き(本人の Lv = 主人公は XP、仲間は `min(level, 主人公 Lv)`)、2 経路目 = `CLERIC_SLOTS_TABLE[id][Lv] > 0` の直読み − 除外リスト。⛔ 写経しない。僧侶の呪文 9 種を習得済みにした盤面。

| 腕 | 結果 |
|---|---|
| (b1) 主人公の僧侶 Lv7 + 仲間の僧侶 Lv2 | 主人公のカード = Lv7 の 9 呪文 / 仲間 = Lv2 の 3 呪文(キュア・ライトウーンズ・ブレス・シールド・オブ・フェイス) |
| (b-sync) 同職 2 枚の同期 | 仲間の引き出しで「ブレス」の「使わない」を押す → 両カードが描き直され、**各カードは自分の Lv の集合** からブレスだけが消える(主人公 8 呪文 / 仲間 2 呪文)→ 主人公の引き出しから戻すと元どおり |
| (b1-dl0) `?drawerlv=0` | 両カードとも主人公 Lv7 の集合(従来) |
| (b1-neg) 影 `fcde6a9` | 主人公のカードも Lv2 の 3 呪文(= 2b の副作用②の再現) |
| (b1-whois0) `?whois=0` | 本人の Lv(この直しは `?drawerlv=0` の側) |
| (c1) 主人公は戦士 Lv7・仲間の僧侶 Lv2 と Lv4 | Lv2 のカード = 3 呪文 / Lv4 のカード = 7 呪文(`?drawerlv=0` では両方 Lv7 の集合) |
| (c2) 仲間の僧侶 1 人 Lv2 | 3 呪文 |

#### (4) (d) 撤退の恒等(probe ident **5/5**・port 10436)

| 比較 | 盤面 | 結果 |
|---|---|---|
| (d1) 現行 `?drawerlv=0` vs `f5fe8bc` `?drawerlv=0` | 低 Lv の僧侶 / 主人公の僧侶 + 仲間の僧侶 Lv2 / 同職の魔法使い + 僧侶 Lv4(名簿の顔だけ) | 表示の Lv(`.pmLv` / `.pmDrawerLv` と直前の `" "`)を両方から剥いで(現行 8 個 / 影 0 個)、カード列・全員の引き出し・`selection`・`MAGE_SKILLS_UI`・保存済みの傾向が **完全一致** |
| (d2) 現行 `?whois=0&drawerlv=0` vs `0e8370d` | 上の 2 盤面 + 新顔 2 人の盤面 | **剥がさずに完全一致** |
| (d3) [記録] 現行 `?whois=0` vs `f5fe8bc` | 低 Lv の僧侶(Lv2 / Lv4) | 引き出し(傾向段の候補を含む)・`selection`・保存済みの傾向は一致。違うのは **主人公より低 Lv の僧侶のカードの「技」行だけ**(= 本項目の直し。`f5fe8bc` は主人公 Lv の集合) |
| (d-neg) 比較器の負の対照 | 現行(既定)vs `f5fe8bc` `?drawerlv=0` | 剥いでも引き出し 3 枚とカードが食い違う = 比較器は空振りしない |

- ⚠ (d1) を名簿の顔だけで測った理由: 現行の `?drawerlv=0` は `?whois` が ON なので (β) が生きて、新顔に画面の時点で Lv を振る(`isEarlyLevelOn() = isDrawerLvOn() \|\| isWhoisOn()`)。`f5fe8bc` の `?drawerlv=0` は振らない ⇒ 新顔を入れると `selection` が別物になる(差は 2b の (β) の拡張由来で本項目ではない)。新顔を含む恒等は (d2) で押さえた。

#### (5) 同職の注記 — **採用**(言い換え・追記ではない)

採った文面: 同職 2 人 =「⚠ 魔法使い 2 人に共通・判定は低い方の Lv2」/ 3 人 =「⚠ 魔法使い 3 人に共通・判定は最も低い Lv2」(Lv = `lowestLevelOfClass` = 行の判定 Lv)。`?whois=0` / `?drawerlv=0` では従来の「⚠ この設定は 魔法使い 2 人に共通で適用されます」(`?drawerlv=0` では判定が主人公 Lv に戻るので「低い方」が嘘になる)。

- ⭐ **先に `tools/*.js` でこの注記の文面を読む assert を数えた** = **1 本 1 assert**: `verify_party_match_setup (4b)`(`:1042`〜`:1050`。注記が出るか + 文面に `'2'` を含むか。新しい文面も「2 人」を含む)。`pmDrawerNote` / `人に共通` / `sameCount` を逐語で握る変異アンカーは 0 本。
- 実装前の測定(probe **notepre**・port 10433): 現行の引き出しの注記へ候補を仮に差し、6 職名 × 2/3 人 × Lv2/Lv10 = 24 組 × 画面ごとに注記 `rect.h`・引き出し `rect.h` / `scrollHeight` / `clientHeight` と文字の自然幅(nowrap)を測った。注記の置き場 = desktop 1010px / 390px 326px、フォント 12px。

| 候補 | 例(Lv2) | 最大幅 Lv2 / Lv10 | 従来(最大 270.9px)より広い組 | 高さが変わる組(4 画面 / isMobile 2 画面) | 採否 |
|---|---|---|---|---|---|
| **K1** | ⚠ 魔法使い 2 人に共通・判定は低い方の Lv2 | **243.4 / 248.2** | **0/12** | **0 / 0** | **採用**(親の例文) |
| K2 | ⚠ この設定は魔法使い 2 人に共通・判定は低い方の Lv2 | 303.4 / 308.2 | 12/12 | 0 / 0 | 不採用(「同じ幅以内」を満たさない) |
| K3 | ⚠ 魔法使い 2 人に共通・低い方の Lv2 で判定 | 246.4 / 251.2 | 0/12 | 0 / 0 | 次点 |
| ADD(追記) | 従来の文面 +「(判定はいちばん低い Lv2)」 | 411.2 / 416 | 12/12 | **390px で 12/12 が 18→36px**(desktop は 0) | 不採用(= 2b の実測の再現 = 測定は空振りしない) |

- 実装後の本物(probe **note**・port 10433): **4/4**(192 ページ・772 秒)。
  - (e-note-text) 本物の文面が 6 職 × 2/3 人 × Lv2/Lv10 × 4 画面 = **96 組すべて** で期待と一致(職名 = `PARTY_SLOTS[].name`・Lv = 盤面から導いた最低 Lv と `lowestLevelOfClass` の 2 経路)。例「⚠ 戦士 2 人に共通・判定は低い方の Lv2」「⚠ 戦士 2 人に共通・判定は低い方の Lv10」「⚠ 戦士 3 人に共通・判定は最も低い Lv2」。
  - (e-note-h) 同じ 96 組で、**同じ引き出しの注記を従来の文面へ戻したとき** と注記 `rect.h`(18)・引き出し `rect.h` / `scrollHeight` / `clientHeight` が **1px も変わらない**(食い違い 0 組。注記の置き場 desktop 1010px / 390px 326px)。
  - (e-note-off) `?whois=0` / `?drawerlv=0` は 1280x900・390x844 × 6 職 × 2/3 人 = **48 組すべて従来の文面**。
  - (e-note-mobile) [記録] `isMobile` / `hasTouch` を付けた 390x844 / 390x667 でも 48/48 で高さ不変・文面一致。

#### (6) (f) カードの高さ(probe cards・4 画面・viewport は幅と高さだけ)

| 画面 | 主人公が戦士 + 仲間の僧侶 Lv2(項目1 の編成・僧侶 9 呪文習得) 現行 = 2b / 2a | 主人公の僧侶 Lv7 + 仲間の僧侶 Lv2 現行 / 2b / 2a |
|---|---|---|
| 1280x900 | 319.1 ×4 = 319.1 ×4 / 396.7 ×4 | 396.7 ×4 / 319.1 ×4 / 396.7 ×4 |
| 1366x768 | 同上 | 同上 |
| 390x844 | 312.1・312.1・343.1・343.1 = 同 / 312.1・312.1・467.2・467.2 | 467.2・467.2・312.1・312.1 / 343.1・343.1・312.1・312.1 / 467.2・467.2・312.1・312.1 |
| 390x667 | 同上 | 同上 |

- (f1) 主人公が戦士の編成: **全カード(主人公のカードを含む)の高さと「技」行が 2b と 4 画面で完全一致**(仲間の僧侶のカードは 2b と同じ Lv2 の集合)。
- (f2) [記録] 主人公が僧侶 + 低 Lv の仲間の僧侶: 主人公のカードは 9 呪文の行に戻るので **2b より高く、2a(`f5fe8bc`)と同じ高さ**(desktop は 4 枚とも 396.7・compact は主人公の段の 2 枚が 467.2)。⚠ 数値は僧侶の呪文 9 種を習得済みにした盤面(項目1 (11) の 334.6 は既定の習得)。

#### (7) `tools/*.js` の逐語アンカーの全数(⭐ 項目1 の走査器の盲点を 1 つ潰した)

- `item2b2/anchors2b2.py`: 全 `tools/*.js` の文字列リテラル(14 字以上)のうち `fcde6a9` か現行の `tavern.html` に現れるもの **1,565 個** について出現回数を比べた ⇒ **変わったのは 1 個だけ** = `verify_spell_off.js:221` 変異 `apcand` の from `'      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));'`(`fcde6a9` 0 件 → 現行 **1 件** = `f5fe8bc` 1 件)。他のアンカー(N3 の 2 件を含む)は件数不変。
- ⚠⚠ **走査器の盲点**: 最初に項目1 の `anchors72.py` と同じ正規表現(単引用符・二重引用符・バッククォートの 3 枝を 1 本の交替にしたもの)で走らせたら **993 個しか拾わず、`apcand` も見えなかった**。真因 = バッククォートの枝が **行をまたげる** ので、コメントの中の Markdown 風のバッククォート(`` `dragonfighters.clericSpellsOff` `` 等)どうしを 1 つのリテラルとして組にし、その間の引用符リテラルを **丸ごと飲み込む**(finditer は重ならない)。3 種を独立に走査すると 1,565 個。
- ⇒ 項目1 の `anchors72.py` を同じ直しで `0e8370d` に当て直した(`item2b2/anchors72_fixed.py`・出力 `anchors72_fixed_diff.txt`): 項目1 (12) の表の元になった 34 件に対し **49 件(+15 件・9 本)**。増えた分(`0e8370d` の件数 → 現行の件数):
  - `verify_mercenary_roster.js:228` `if (m && typeof m.level === "number" && m.level > 0) return clampCompanionLevel(m.level, heroLv);`(1 → 1。2a で `levelOfMember` へ移ったが逐語は健在)/ `:268` `full = roster.length >= DFRoster.CAP;`(`pickCompanion`・1 → 1)/ `:314` `        m.level = clampCompanionLevel(m.level, heroLevel);`(`assignCompanionLevels`・1 → 1)
  - `verify_party_four.js:95` `    if (prepScenario) partySize = 1 + recruitCountOf(prepScenario);`(`regeneratePartyMembers`・1 → 1)
  - `verify_spell_off.js:217` `    const autoShown = (isAuto && known && !clericOff) ? autoFromTable : 0;` / `:255` `    const isOff = isSpellOffOnTV() && (isAuto ? clericOff : (usable && cnt <= 0));`(`renderSpellSlotItem`・各 1 → 1)
  - `verify_prep_retire.js:171` `    if (m.isHero) {`(4 → 4)/ `verify_hold_person.js:608` `?recruittalk=0` / `driver_field_step7.js:956` / `verify_bolt_aim.js:164`〜`:165` / `:987`(`lightning-bolt` と flavor3 の断片 `',   mpCost: 6, flavor: '` = 1 → **0**。2a からの既知の腐敗)
  - ⇒ flavor3 の断片以外は **全部健在**。⚠ **項目2c(柱3)は `pickCompanion` / `assignCompanionLevels` を触るなら `verify_mercenary_roster.js:268` / `:314` も握られている**(項目1 の表 #4 の計測シーム 4 本 `:145`〜`:162` とは別)。

#### (8) 既存 golden の色(`scratchpad/item2b2/golden2b2.tsv`・比較器 = 項目1 の `gate72.py --pair`(`item2b2/gate2b2.py`)・基準 = `item1/baseline72.tsv`)

20 腕を直列で実走(`golden2b2.py`・2b の 19 腕 + `verify_bolt_aim --negative`・所要約 51 分)。

| 本 | 腕 | 色 | 基準との突き合わせ(経路1 = assert id の指紋 / 経路2 = 判定行の多重集合) | 型 / 2b との比較 |
|---|---|---|---|---|
| `verify_party_match_setup` | 素 | exit 1・35/36 | 差 2 / 2 = **(0b) だけ** PASS→FAIL | 2b からの型1(`.pmClass` の職名に Lv)= 2b と同じ。⭐ 注記の文面を読む **(4b) は緑**(「注記="⚠ 盗賊 2 人に共通・判定は低い方の Lv5" / 食い違い 0 件」) |
| `verify_party_match_setup` | --negative | exit 0(8 本とも担当が赤・空振り 0) | 差 16 = 8 腕の (0b) だけ | 2b と同じ |
| `verify_darkvision` | 素 / --negative | exit 1・24/25 / exit 1・37/38 | 差 2 / 3(+RECAP)= **(3a) だけ** | 2b からの型1 = 2b と同じ(編成に僧侶が居ないので「技」行は不変) |
| **`verify_spell_off`** | **--negative** | **exit 0・12 本とも担当が赤(空振り 0)** | **差 0 / 0**(624 = 624 / 665 = 665) | ⭐ **2b の赤(12 変異すべて exit 3)が消えた** = 変異 `apcand` のアンカーが生き返った |
| `verify_spell_off` | 素 | exit 0・51/51 | 差 0 / 0 | — |
| `driver_action_priority` | 素 / --negative | exit 0・92/92 / exit 1 | 差 0 / 0・`--negative` のログは基準と **バイト同一**(「負のコントロール N3 の注入点が 2 箇所 (期待 1)」= #35 以来の既知の赤) | N3 のアンカーの逐語は不変(2 件のまま) |
| `verify_mercenary_roster` | 素 / --negative | exit 0・44/44 / exit 0(10 本とも担当が赤) | 差 0 / 差 4 | `--negative` の差 4 は 2b と同じ `alwaysroster` の腕の担当外 (2e)(2z3) の揺れ(基準 FAIL → 今回 PASS・名簿の人数の乱数)。本項目から経路なし |
| `verify_pm_drawer_fit` | 素 / --negative | exit 0・75/79 PENDING 4 / exit 0(9 本とも担当が赤) | 差 0 / 0・0 / 0 | — |
| `verify_recruit_talk` / `verify_party_promises` / `driver_party_view_reopen` / `verify_recruit_size` / `verify_hold_person` / `verify_prep_retire` / `driver_equip_compact_ios` | 素 | 25/25・35/35・35/35・91/91・31/31・30/30・31/31 すべて exit 0 | すべて **差 0 / 0** | — |
| `verify_bolt_aim` | --negative | exit 3(2.0 秒・§0e で `flavor3` のアンカー腐敗) | 基準 197 id → 9 | 2a からの既知(型1・項目3)。本項目は触っていない |

- ⛔ `tools/` は 1 バイトも直していない。赤は全部 2a / 2b からの持ち越し(型1)で、本項目で **増えた赤は 0**・**消えた赤が 1**(`verify_spell_off --negative`)。
- ⚠ 既知フレーク 9 本は本項目の golden に含めていない(名指し + 本項目の行を読む本だけ)。
- 実座標で叩く golden(`verify_party_match_setup` (3a)〜(4b) / `verify_pm_drawer_fit` の 4 画面)は、本項目のカード(僧侶 Lv3 と Lv4 が別々の集合)と新しい注記の盤面で緑のまま。

#### (9) changelog(新しい行は足さず、項目2a の行を進化)

- 前: `<li><b>レベルの足りない呪文は置けなくなった</b> — これまでは置けてしまい、出撃すると黙って外れていた。</li>`
- 後(`:3330`・`py` のバイト置換で件数 1 を assert): `<li><b>レベルの足りない呪文は置けなくなった</b> — これまでは置けてしまい、出撃すると黙って外れていた。同じ職が複数いるときは、いちばん低いレベルで判定 (注記に表示)。僧侶のカードには、その人が実際に使える呪文が並ぶ。</li>`
- ⭐ 副作用①(保存した傾向が消える)の直しは書いていない: 2b は未 push(`origin/main` = `0e8370d`)で、プレイヤーはその欠陥を一度も見ていない ⇒ 「消えなくなった」はプレイヤーにとって真実の変化ではない。書いたのは出荷版(`0e8370d`)から見て本当に変わる 2 点(注記 / 僧侶のカード)だけ。
- `tools/*.js` で `changelogList` やこの行の文面を読む本は 0 本。

#### (10) 崩れた主張 — 項目2b2 で新たに **5 件**(累計 **27**)

| # | 主張 | 実測 |
|---|---|---|
| 1 | キュー(2b の申し送り)/ 親「`verify_spell_off --negative` の変異 `apcand` は 2b で腐っている — この項目でさらに動くのは構わない(項目3 が最終形へ言い直す)」/ 2b (8)「項目3 で `:7706` の行へ言い直す」 | 傾向の候補を `f5fe8bc` の主人公 Lv へ戻したので、アンカーの行は `f5fe8bc` の逐語のまま **生き返った**(0 → 1 件・(7))。golden も `verify_spell_off --negative` が exit 0・12 本とも担当が赤・基準と差 0 へ戻った((8)) ⇒ **項目3 の `apcand` の言い直しは不要** |
| 2 | 項目1 (12)「逐語で読んでいる assert の全数(`anchors72.py` = 全 149 本から機械で探した結果)」 | 走査器の正規表現の盲点(バッククォートの枝が行をまたいで引用符リテラルを飲み込む)で **15 件(9 本)を落としていた**((7))。いまは全部健在(flavor3 の断片を除く)だが、表は全数ではなかった |
| 3 | 親の (f)「主人公カードの高さが 2b と同じ」 | 主人公が戦士の編成では成立 (f1)。**主人公の僧侶 + 低 Lv の仲間の僧侶** では主人公のカードが 9 呪文の行に戻るので 2b より高く、2a と同じ高さ (f2) = 条件付き |
| 4 | 親の (d)「`?drawerlv=0` で `f5fe8bc` と DOM 完全一致」 | `?drawerlv=0` 単独では表示(`?whois`)が ON なので `.pmLv` / `.pmDrawerLv` が残り、字義どおりには一致しない。さらに (β) も ON のまま(`isEarlyLevelOn() = isDrawerLvOn() \|\| isWhoisOn()`)なので、新顔を含む盤面では `selection` も `f5fe8bc` の `?drawerlv=0` と違う。成立するのは「表示の Lv を剥いで・名簿の顔だけの盤面で」(d1)と、`?whois=0&drawerlv=0` = `0e8370d`(d2) |
| 5 | 2b (7)「保存済みの僧侶の傾向は、仲間の僧侶 Lv2 が居る編成で **僧侶の引き出しを開いた瞬間に** `null` へ書き戻され」 | 引き金はもう 1 つあった: 主人公が僧侶なら **本番の `openPrep` の見えない準備画面の描画だけで**(何も開かずに)消えていた(keep (a2-neg))。⇒ 受入で副作用①の網を張るなら、引き出しを開く腕だけでなく `openPrep` の腕が要る |

- 根: 1 = 前の項目の予測(直し方で結果が変わる)/ 2 = 測定器の盲点(要約の欠落)/ 3・4 = 親の受入条件の字義が盤面・スイッチの組み合わせで条件付き / 5 = 副作用の引き金の数え落とし。

#### ▶ 項目2c / 3 / 4 / 5 への申し送り

1. **項目3(golden の言い直し)**: 言い直しが要るのは 2b からの型1 = `verify_party_match_setup (0b)` / `verify_darkvision (3a)`(素・`--negative` とも)と 2a からの `verify_bolt_aim --negative`(`flavor3`)。本項目の golden((8))で確かめた赤はこの 3 本だけで、増えた赤は 0。
   ⭐ `verify_spell_off --negative` の `apcand` は本項目で生き返った(言い直し不要)。注記の文面を読む `verify_party_match_setup (4b)` は「注記が出る + 文面に `'2'`」なので新しい文面でも緑。
2. **項目2c(柱3)**: ⚠ `pickCompanion` / `assignCompanionLevels` / `levelOfMember` を触るなら、項目1 の表に無かったアンカー `verify_mercenary_roster.js:268`(`full = roster.length >= DFRoster.CAP;`)/ `:314`(`        m.level = clampCompanionLevel(m.level, heroLevel);`)/ `:228`(`if (m && typeof m.level === "number" && m.level > 0) return clampCompanionLevel(m.level, heroLv);`)と `verify_party_four.js:95` も握られている((7))。changelog は柱1 の行(`仲間の名前・職業・レベルがひと目で分かるように`)を進化させる(2a の行は本項目で進化済み)。
3. **項目4(受入 `tools/verify_member_identity.js`)**:
   - (a) の網: `dragonfighters.actionPriority` に `hold-person`(general/boss)を仕込み、主人公 Lv7 + 仲間の僧侶 Lv2 で ① マッチング → 僧侶の引き出し ② **主人公が僧侶で本番の `openPrep`**(何も開かずに消える経路)③ `?prepskip=0` の準備画面の僧侶のタブ、の後も `localStorage` が残ること。
   - (b)(c) の網: カードの「技」行 = `getClericSlotsTV(本人の Lv)` から導いた集合(本人の Lv = 主人公は XP・仲間は `min(level, 主人公 Lv)`)。⚠ 呪文名に「・」が入るので「・」で割らずに連結文字列で比べる。同期は引き出しの `.clericOffBtn` を押して両カードを描き直させる。
   - 注記の網: `#pmDrawerNote` の textContent = `"⚠ " + 職名 + " " + n + " 人に共通・判定は" + (n === 2 ? "低い方の" : "最も低い") + " Lv" + 最低 Lv`(`?whois=0` / `?drawerlv=0` では従来の文面)。
   - 変異の候補(逐語は本コミットで取り直し済み): `cardhero` = `:7712` の `? getClericSlotsTV(ownLv) : auto;` を `? auto : auto;` に(カードが主人公 Lv へ戻る = (b) が赤)/ `cardlow` = `:8789` の `levelOfMember(m)` を `lowestLevelOfClass(classKey)` に(2b の形 = 主人公のカードが低 Lv)/ `apclamp` = `:7711` を `lowestLevelOfClass(classKey)` 版に(= 2b の副作用① = (a) が赤。⚠ この行は `verify_spell_off` の `apcand` と同じアンカー = 別の本なので衝突はしないが、同じ本の中で 2 変異に使うなら原本に対して健在チェック)/ `notelv` = `:8938` の `lowestLevelOfClass(classKey)` を `levelOfMember(m)` に(開いた本人の Lv = 同職で嘘)/ `notesw` = `:8937` の `(isWhoisOn() && isDrawerLvOn())` を `(isWhoisOn())` に(`?drawerlv=0` で「低い方」が残る)。
   - 寸法: viewport は幅と高さだけ(`isMobile` / `hasTouch` で値が変わる)。僧侶の習得状況でカードの高さが変わる(9 呪文習得 396.7 / 既定 334.6)。
4. **項目5(母集団)**: 本項目で新しく読まれうる要素 = `.pmSkillsVal`(僧侶のカードの行)/ `#pmDrawerNote` の文 / `apEquippedIdsFor` の 3 引数目。⭐ 「逐語で握る本」を数えるときは引用符 3 種を **独立に** 走査すること(`item2b2/anchors2b2.py` / `anchors72_fixed.py`)。1 本の交替の正規表現はバッククォートの枝が行をまたいで他を飲み込む。
5. プローブ = `…/scratchpad/item2b2/probe72_2b2.js`(mode notepre / note ポート 10433・keep 10434・cards 10435・ident 10436・全部解放済み)/ 影 `item2b2/base_tavern_fcde6a9.html`(798e31c)+ `item2b/base_tavern_f5fe8bc.html`(2092fc5)・`item2b/base_tavern_0e8370d.html`(4243b34)/ `golden2b2.py` `gate2b2.py` / 置換 `patch72_2b2.py`。**10401〜10413 は未使用**(項目4 予約)。

---

### 12-0 追補(項目2c / 2026-09-22・実装窓 セッション `b34987cb-…`)— 柱3 名前とジョブの固定 + 撤退 `?namejob=0` + 名簿・約束の名前を新顔に使わない + changelog の柱1 行を進化

⭐ 行番号は **本コミット後の `tavern.html`**(純 CRLF・**10,994 行**・bare LF 0・bare CR 0 を `py` のバイト数えで確認)。⛔ 使う前に逐語で引き直すこと。
変更ファイル = `tavern.html`(+63/-3)+ 本 `.md` のみ(`index.html` / `audio.js` / `js/` / `tools/` は 1 バイトも触っていない)。
置換は `scratchpad/item2c/patch72_2c.py`(4 箇所・各アンカーの件数 1 を assert・`wb`・置換後に入れた語を読み返して数えた)。
影 = 着手前 `a79ae83` の `tavern.html` を `item2c/base_tavern_a79ae83.html` へ退避(作業ツリーの複製。`git hash-object` = HEAD の blob `bdabc28`・CRLF 10,934 行)。

#### (1) 撤退スイッチ `?namejob=0`

- 判定の逐語 = `try { return new URLSearchParams(location.search).get("namejob") !== "0"; }` — **1 件**(`:4527`。関数 `function isNameJobOn() {` `:4526` = `isWhoisOn` の直後)。const に畳まず呼ぶたびに URL を読む(`isDrawerLvOn` / `isWhoisOn` と同じ TDZ 回避の作法)。
- `isNameJobOn` の出現 = **2 行**(定義 `:4526` / `pickUniqueName` の中 `:4720`)。
- 0 で戻るもの = ① 新顔の名前を職業別の表から引く ② 名簿と約束に居る名前を新顔に使わない、の 2 つ。0 のときは `pickUniqueName` の従来の本体 4 行(`a79ae83` と逐語同じ)を通る = **乱数の消費順も同じ**((6) の (3c) で実証)。

#### (2) 名前の表(全文・`const NPC_NAMES_BY_CLASS = {` `:4643`)

| 職 | 名前(15 名。**太字** = 旧 `NPC_NAMES` の 16 名) |
|---|---|
| 戦士 `warrior` | **イレーナ** **ミラ** **セシリア** **リーゼ** **ニカ** **ソフィ** アデラ ゲルダ ヒルデ マルタ ヴェラ オルガ ザラ カーラ ブリタ |
| ドワーフ `dwarf` | **ダグ** **トルガ** ハルガン ブルム ゴルム ドラン カルグ グンナル ケルド ボドリ オルドル スヴェン ロッグ ヨルム ガンド |
| 僧侶 `cleric` | **ヨナ** **ガウェイン** シメオン ダミアン ゲオルク トビアス パウル イグナツ ラザロ ルーカス テオ アベル ヨアヒム サウル ペトル |
| 魔法使い `mage` | **オズ** **ベルント** ゼノン カスパル イザーク エメリク ヘルマン ユリウス アルド マグヌス ロタール オットー ルドルフ ヘクター ギデオン |
| エルフ `elf` | **ファルケ** **ブラン** エリオン タリシン ロシエル セラン ナイエル ネリス ラエル エルダン フィラン ソレル ヴァレン アエリス ティリク |
| 盗賊 `rogue` | **ロルフ** **クヌート** ヴィンス ディーノ キース マルコ ラッセル ゲイル フィン ジェド ザック ベック ドミニク サイラス ティボー |

- 90 名・表どうしで重複 0・旧 16 名は全員残した(馴染みの名前を消さない)。**NPC の絵に合わせた**: 仲間の戦士の絵は女性(`assets/warrior_npcfemale_walk.png`)、他の 5 職の仲間の絵は男性 ⇒ 旧 16 名の女性名 6 つは戦士へ、男性名 10 は 2 つずつ他の 5 職へ。
- 候補の検算(`item2c/names72.py`): 新しく足した 74 名は `*.html` / `js/*.js` に **0 回**(ゲーム内の他の固有名詞と衝突しない。最初の案の「リアン」は `tavern.html:3808` の敵「祈りを捧げる従軍司祭リアン」と重なったので「ネリス」へ、「イルマ」は「タイルマップ」の部分文字列だったので「ブリタ」へ替えた)。名前どうしの部分一致 0。最長は旧名の「ガウェイン」(5 字)で、新しい名前はすべて 4 字以下。
- ⚠ 旧 `NPC_NAMES`(16 名・`:4632`)は **撤退先としてそのまま残した**(`tools/verify_mercenary_roster.js:461` / `(0c)` が `NPC_NAMES.length` を読む = 16 > CAP 12 で生存)。

#### (3) 1 職あたりの数の導出(式と実測)

| 量 | 実測 / 読んだ実装 |
|---|---|
| ① 1 編成に同じ職の **新顔** が何人来うるか | `?recruittalk=0` の `buildParty`(4 人): 仲間の同職は **最大 2 人**(6 主人公職 × 20,000 編成で 1 人 66〜67% / 2 人 33〜34% / 3 人以上 0)・主人公込みでも最大 2。既定の卓 `drawTodaysPatrons` は 6 職から **重複なし 20,000/20,000**。声掛けで同職を 3 人誘えるが(`DFRecruits.add` に職の検査なし)、誘った人はもう名前を持っている = 新しい名前は要らない |
| ② 名簿に同じ職が最大何人入りうるか | **職ごとの上限は無い**(`js/mercenary-roster.js` の `enroll` の門番は `if (r.list.length >= CAP) return null;` だけ)。実測: 魔法使いだけで 12 人(= CAP)入り、13 人目は `null`。⭐ ただし **新顔が作られるのは `pickCompanion` の新顔の枝 = 名簿が満杯でないとき(在籍 ≤ CAP − 1 = 11)** か、満杯かつその職の未使用の名簿の顔が 0 人のときだけ(`:4758`〜`:4763`) |
| ③ 除外で使えなくなる名前 | 名簿の全員(≤ 11・どの職でも)+ 約束の新顔(≤ `RECRUIT_MAX` = 3。名簿の顔の約束は名簿と重なるので数えない)+ この編成で使った名前 |

- 式: その職で塞がる名前の数 E ≤ **(CAP − 1) + RECRUIT_MAX = 11 + 3 = 14**(既定の卓。卓は同職が 1 席だけなので「この編成で使った同職の新顔」は 0)/ E ≤ (CAP − 1) + (同職の仲間の最大 2 − 1) = 12(`?recruittalk=0`・約束は使われない)。満杯の枝(n ≤ 0)ではその職の名簿の新規則の顔はこの編成で使用済みの 1 人まで + 旧規則の名前(旧 16 名のうちその職の表に入った数 ≤ 6)+ 約束 3 ≤ 10。
  ⇒ **N ≥ E + 1 = 15 = CAP − 1 + RECRUIT_MAX + 1**。表の各職 15 名はこの式の値(受入プローブ (n0b) はページの `DFRoster.CAP` / `RECRUIT_MAX` から導いて 15 と照合)。
- 実測(probe excl (3b'-B)): 名簿に魔法使い 11 人(表の 1〜11 番目)+ 約束に魔法使いの新顔 3 人(12〜14 番目)= 導出の上限の盤面で、新しく作られた魔法使い **2,298 人がすべて 15 番目の「ギデオン」**・名簿 / 約束との衝突 0。⇒ 15 名なら通常のプレイで ① の段が空になることは無い。
- ⚠ 依頼書 §5-3 の「1 職あたり 4 名以上(例 6 × 6)」は **除外を入れない場合の編成内の一意** の話で、名簿との一意まで求めると足りない((10) の 1)。

#### (4) 除外の仕様と退避(実装後の逐語)

| 何 | 逐語 | 行 |
|---|---|---|
| 名簿と約束の名前 | `function namesTakenTV() {` … `DFRoster.all()` と `DFRecruits.all()` の `name`(どの職でも・読むだけ) | `:4696`(約束の行 `:4699`) |
| 職の表から 1 名 | `function pickClassNameTV(list, usedSet) {` … `let pool = list.filter(function (n) { return !usedSet.has(n) && !taken.has(n); });`(`:4709`)→ 空なら `list.filter(… !usedSet.has(n))` → 空なら `list` → `pool[Math.floor(Math.random() * pool.length)]` | `:4707` |
| 入口 | `function pickUniqueName(usedSet, classKey) {` / `const byClass = (classKey && isNameJobOn()) ? NPC_NAMES_BY_CLASS[classKey] : null;` / 表が無ければ従来の 4 行 | `:4719` / `:4720` |
| 呼び口 | `name: pickUniqueName(usedSet, classKey),`(`makeNpcMember` の中・`pickUniqueName` の呼び口はこの 1 件だけ) | `:4730` |

- 乱数は **1 名につき 1 回だけ**(⛔ 引き直しのループを作らない = 無限ループの余地が無い)。退避は ① 誰とも重ならない → ② 名簿・約束の人との同名は許す(この編成の中では一意)→ ③ 同じ職の名前の重複も許す(旧 `guard < 50` と同じ「重複したまま返す」)。**どの段でも職の表の外へは出ない** ⇒ 退避しても名前 → 職業の単射は崩れない。
- 約束(`DFRecruits`)の名前も避ける理由: 親の指示は「名簿に居る名前」だが、`DFRecruits.has(name)`(マッチングのカードの「🤝 酒場で声を掛けた」`:9335` / 頭上札の 🤝 `patronLabelPaint`)は名前引きなので、約束した新顔(まだ名簿に居ない)と同名の新顔が卓に座ると、その別人にも 🤝 が付く。依頼書 §5-3 の「`DFRecruits.has(name)` が人物を一意に決める」を成り立たせるには約束も避ける必要がある。
- `?roster=0` / `?recruittalk=0` ではそれぞれの `all()` が空を返す = その保管庫は使われていないので避けない。
- 引数の順を `(usedSet, classKey)` にした理由 = 1 引数の既存の呼び(`tools/verify_mercenary_roster.js:306` の変異 `alwaysroster` が注入する `pickUniqueName(usedNames)`)を壊さないため。1 引数では従来どおり共有 16 名(probe excl (3b'-B2) `one` = 旧 16 名のどれか)。
- ⛔ `pickCompanion` の 4 行(計測シーム `:4753` / `:4761` / `:4763` / `:4764`)・`full = roster.length >= DFRoster.CAP;`(`:4758`)・出発の clamp `m.level = clampCompanionLevel(m.level, heroLevel);`(`:8097`)・`levelOfMember` の clamp 行(`:4960`)・`verify_party_four.js:95` が握る `if (prepScenario) partySize = 1 + recruitCountOf(prepScenario);`(`:7018`)は **1 文字も触っていない**(除外は `pickUniqueName` / `makeNpcMember` の側だけ)。

#### (5) 名前の生成口の全数と `index.html` の写しの到達性

| 生成口 | 呼ばれ方 | 本項目 |
|---|---|---|
| `tavern.html` `pickUniqueName` `:4719` | 呼び口 1 件 = `makeNpcMember` `:4730`(+ tools の変異 `alwaysroster` が 1 引数で注入) | 職の表 + 除外 |
| `tavern.html` `makeNpcMember` `:4727` | `pickCompanion` の 4 枝(名簿 OFF / 例外 / 満杯かつ 0 人 / 新顔)= `makeNpcMember(classKey, usedNames)` **4 件** | 変更なし(中の `pickUniqueName` へ職を渡すだけ) |
| `tavern.html` `pickCompanion` `:4752` | `buildParty` の 2 件(`:4878` / `:4885`)・`drawTodaysPatrons` の 1 件(`:8581`) | 無改変 |
| `buildParty` `:4863` | `regeneratePartyMembers` の `?recruittalk=0` の枝 `:7032` | 無改変 |
| `drawTodaysPatrons` `:8570` | 酒場の初期化 `todaysPatrons = drawTodaysPatrons();` `:10736` | 無改変 |
| #41 の酒場・街の NPC 群 `js/npc-crowd.js` | 名前を持たない(配置と台詞だけ)。`town.html` / `world.html` / `battle.html` に名前の生成は 0 件 | 対象外 |
| **`index.html` の写し** `NPC_NAMES` `:13448` / `pickUniqueName` `:13478` / `makeNpcMember` `:13484` / `buildParty` `:13493` | 呼び口は `formation = orderFormation(buildParty(heroOld));` `:34991` の 1 件だけ = `sessionStorage` の `dragonfighters.partyMembers` が無い / 壊れているときのフォールバック | ⛔ 触っていない(依頼書 §3) |

- **実プレイでは写しに届かない**: `index.html` へ入る口は ① 酒場の `departToScenario`(`partyMembers` を `:8197` で書いてから `:8260` world / `:8263` index へ遷移)② 自動デバッグ `departAutoDebug`(`:8283` で書いてから `:8286`)③ `world.html:1247`(目的地の入場。`questDest` が要る = 酒場が `:8254` で `partyMembers` の **後** に書く)④ `world.html:1458`(街道の襲撃の戦闘。`hasRealParty()` `:1395` が真のときだけ `:1413`)の 4 つで、どれも `partyMembers` が同じタブに在る。消す口は 0 件(`removeItem("dragonfighters.partyMembers")` は全 html / js で 0)。
- 実測(probe store `reach`・port 10440): (r1) 本番の `departToScenario` は遷移(world.html)の前に `partyMembers` を焼く / (r2) 同じタブで `index.html` を開くと `allies` の `npcName` は `partyMembers` そのもの(「僧侶 ラザロ / エルフ ソレル / 魔法使い ユリウス」= 新しい表の名前)/ (r3) `partyMembers` の無い新しいタブで `index.html` を **直に** 開いたときだけ写しが組む(「エルフ ロルフ / 僧侶 ブラン / 魔法使い ヨナ」= 共有 16 名・新しい表と職が食い違う)。⇒ 直起動・検証ドライバだけの道 = **blocked にしない**。

#### (6) 受入プローブ(`scratchpad/item2c/probe72_2c.js`・ポート 10437〜10440・全部解放済み)

| mode | port | 結果 | 見たもの |
|---|---|---|---|
| names | 10437 | **14/14** | (n0b) 表の実物(6 職 × 15 名・重複 0・旧 16 名を含む・15 = ページの CAP / RECRUIT_MAX から導出)/ (3a) `makeNpcMember` / `pickCompanion` 各 18,000・卓 24,000・`buildParty` 54,000・`regeneratePartyMembers` 13,500 の新顔がすべてその職の表(表はページの実物と照合)/ (3a-load) 本番の酒場の読み込み 24 回 × 4 席と頭上札 / (3b) 名前 → 職業が単射(90 種・2 職に出た名前 0)/ (3b-cover) どの職も 15 名を全部使う / (3c-neg) `?namejob=0` と影は共有 16 名で単射でない(16 名全部が 6 職に出る = 比較器は空振りしない) |
| excl | 10438 | **16/16** | (3b'-A) 名簿に旧規則の顔 8 人(ロルフ × 魔法使い / 戦士・ミラ = 盗賊・オズ = 僧侶 …)+ 約束 2 人で新顔 20,961 人の衝突 0(影 11,777 / 21,217・`?namejob=0` 11,779 / 21,083 = 負の対照)/ (3b'-B) 導出の上限の盤面 / (3b'-B2) 退避 ②③ が即座に返り職の表の中 / (3b'-C) 名簿を魔法使い 12 人で満杯 → 卓 2,000 回が 4 席とも埋まり魔法使いの席は毎回名簿の顔 / (3b'-D) 満杯(戦士 6 + ドワーフ 6)で `buildParty` 12,000 回 / (3b'-E)[記録] 8 人編成 × 名簿に盗賊 11 人 = 退避 ② の発生 0・止まらない / (① 実測)(② 実測) / (3b-loop) 600 日の遊びの模擬(卓 → 声掛け → 出発で名簿へ → 満杯で見送り)で新顔 701 人の衝突 0・単射・名簿に同名 2 人の日 0(`?recruittalk=0` も 401 人で同じ。影は 334 衝突・16 名全部が複数職・同名の日 299 / 300)/ (3d-read) 生成で保存物は 1 バイトも変わらない |
| ident | 10439 | **6/6** | (3c) `?namejob=0` = `a79ae83`: 決定論の乱数(ページの最初から + evaluate の頭で入れ直し)で、卓の init の 4 席と頭上札・卓 300 回・`makeNpcMember` / `pickCompanion` 各 240・`buildParty` 360 の列(1,140 件・名前 2,760 個)が **完全一致**(旧規則の名簿 5 人 + 約束 1 人を仕込んだ盤面)/ (3c-rt0) `&recruittalk=0` の `buildParty` / `regeneratePartyMembers` の列 960 件も一致 / (4a) `?whois=0&drawerlv=0&namejob=0` = `0e8370d`: 同じ列 + `buildParty` の新顔の編成でマッチング画面のカード列・4 枚の引き出し・`selection` が完全一致(`&recruittalk=0` も)/ (3c-neg) スイッチ ON は同じ乱数で 2 件目から食い違う |
| store | 10440 | **13/13**(store 5・reach 4・dims 4) | (3d) 保存物 ((7)) / (r1)〜(r3) ((5)) / 寸法 ((8)) |

#### (7) (3d) 名簿・約束の保存物は 1 バイトも変わらない(probe store)

- 旧規則の顔 8 人(ロルフ × 2 職・recordRun で runs / level も動かした)の名簿と、約束 2 人(名簿の顔 1 + 旧規則の新顔「リーゼ = 魔法使い」)を本番の口で作り、その保存文字列を仕込んだ。
- 酒場の読み込み・卓 300 回・新顔 1,200 人のあとも `mercRoster` / `recruitCandidates` の文字列が仕込みと **バイト一致**(現行 / 影とも)。
- 本物のダイアログ(`openRecruitDialog` → `#btnRecruitYes`)で卓の新顔を誘う: 既存の約束 2 件はバイト一致・足した 1 件のキー集合と値の型 `classKey:string,isHero:boolean,line:string,name:string,trait:string,variant:number,zone:string` は影 `a79ae83` と同じ。
- 本番の `departToScenario`: 名簿の既存 8 人はバイト一致(**旧規則の同名 2 人も残る = 移行しない**・同名の組 1)・新しく載った 2 人のキー集合 `classKey,id,level,line,name,runs,trait,variant` と `sessionStorage` の `partyMembers` 4 人のキー集合・型は影と同じ。新しく載った人(魔法使い アルド)は名簿の誰とも同名にならない。
- ⭐ member へフィールドを足していない・保存キーを増やしていない(読むのは `DFRoster.all()` / `DFRecruits.all()` だけ)。

#### (8) 寸法(probe store `dims`・viewport は幅と高さだけ)

- 90 名 × 4 画面(1280x900 / 1366x768 / 390x844 / 390x667)・主人公 Lv10・仲間 Lv10(名簿の顔の形)で、**カードの高さ・名前の行の高さ・引き出しの見出しの高さ・引き出しの高さ** が「1 文字の名前(ダ)」の同じ編成と **360 / 360 で完全一致**。見出しの最長は 4 画面とも「魔法使い — ベルント Lv10」sw 203(項目2b の最悪「ドワーフ — ガウェイン Lv10」219 / 置き場 228 より短い。ガウェインは僧侶へ移ったので「ドワーフ — ガウェイン」はもう出ない)。
  ⚠ 見出しは中身に合わせて縮む要素なので `sw ≤ cw` は弱い(常に等しい)。効いている判定は **高さの一致**(折り返したら 20.3 から伸びる)。
- 声掛けダイアログ(1280x900 / 390x844): 90 名で `#recruitName` の高さ・`#recruitBox` の高さが 1 文字の名前と同じ(崩れ 0)。
- [記録] 卓の頭上札 `.patronLabel` の幅: 90 名の最大は旧名の「ガウェイン」(1280x900 で 78.4 / 390x844 で 58.2)= 旧 16 名の最長を超える名前 0。

#### (9) 既存 golden の色(`scratchpad/item2c/golden2c.tsv`・比較器 = 項目1 の `gate72.py --pair`(`item2c/gate2c.py`)・基準 = `item1/baseline72.tsv`)

25 腕を直列で実走(`golden2c.py`・所要約 44 分)。母集団 = 名指し 8 本 + 名前の生成口・表示を読む本(`anchors2c.py` の識別子走査)+ 名前をリテラルで持つ本のうち `tavern.html` を読む軽いもの + `--negative` 4 本。

| 本 | 腕 | 色 | 基準との突き合わせ(経路1 = assert id の指紋 / 経路2 = 判定行の多重集合) | 型 / 備考 |
|---|---|---|---|---|
| `verify_mercenary_roster` | 素 | exit 0・44/44 | 差 0 / 0 | ⭐ 計測シーム 4 本(`:4753` / `:4761` / `:4763` / `:4764` を逐語で握る)は生存 = 素の腕が exit 3 にならない。`(0c)` も緑(16 > 12) |
| `verify_mercenary_roster` | --negative | exit 0(10 本とも担当が赤・空振り 0) | 差 4 = 変異 `alwaysroster` の腕の **担当外** (2z3)(2e) が基準 FAIL → 今回 PASS | 2b / 2b2 と同じ乱数の揺れ(`grow()` の名簿の人数)。`alwaysroster` の注入 `pickUniqueName(usedNames)`(1 引数)は本項目の後も動き、担当 (0a)(5a) は赤 |
| `verify_recruit_talk` | 素 / --negative | 25/25 / 変異 11/11 が期待どおり | 差 0 / 0 | 卓の 4 席は新しい表の名前(「ゲイル/rogue」「オズ/mage」「サウル/cleric」…) |
| `verify_recruit_size` | 素 | exit 0・91/91 | 差 0 / 0 | (D) の「11 サンプル中 2 種類以上」も緑。⚠ 根拠コメント `:723`「名前は NPC_NAMES 16 個から一様」は腐った(assert は生存) |
| `verify_party_four` | 素 / --negative | 17/17 / 負のコントロール 5/5 | 差 0 / 0 | `:95` のアンカー健在 |
| `verify_party_promises` | 素 | exit 0・35/35 | 差 0 / 0 | `seedRecruits` の `pickCompanion` は約束の名前を避けるようになったが緑 |
| `driver_party_view_reopen` | 素 | exit 0・35/35 | 差 0 / 0 | — |
| `verify_party_match_setup` | 素 | exit 1・35/36 | 差 2 / 2 = **(0b) だけ** | 2b からの型1(本項目で増えていない) |
| `sweep_recruit_balance` | 素 | exit 1(装置 assert 崩れ 4/4) | 基準と **逐語で同じ 4 行**(`4_partySize(got=1 …)` / `2_recruitCountOf(got=3 want=2)`) | 既知の赤(比較器の盲点の腕 = 総括行で突き合わせ) |
| `verify_hold_person` | 素 / --negative | 31/31 / 8 本とも担当が赤 | 差 0 / 0 | 頭上札(`todaysPatrons`)を読む本 |
| `verify_prep_retire` | 素 | exit 0・30/30 | 差 0 / 0 | `.pmName` を読む本 |
| `verify_darkvision` | 素 | exit 1・24/25 | 差 2 / 3 = **(3a) だけ** | 2b からの型1(`.pmName` は固定の注入名なので不変・`.pmClass` の Lv だけ) |
| `verify_spell_off` | 素 | exit 0・51/51 | 差 0 / 0 | `makeNpcMember` を直に呼ぶ本(名前が職の表から出るようになったが緑) |
| `verify_npc_crowd` / `verify_quest_walk` | 素 | 33/33 / 25/25 | 差 0 / 0 | — |
| `verify_road_ambush` / `verify_road_boon` | 素 | 41/41 / 20/20 | 差 0 / 0 | — |
| `driver_heromark_signplate` / `driver_equip_compact_ios` / `verify_aoe_coverage` / `verify_bolt_bounce` | 素 | 46 id / 31/31 / 28/28 / 15/15 | 差 0 / 0 | 名前をリテラルで持つ本(注入名をそのまま使う) |
| `probe_s2_clear` | 素 | exit 2(2.0 秒) | 基準 exit 0 | ⚠ **未コミットの木では走らない**: 自己ガード「本番に差分があります。#18 は本番を 1 バイトも変えない調査チケットです」(`git diff HEAD` を見る)。コミット後の clean な木で再走 → (9-b) |

- ⛔ `tools/` は 1 バイトも直していない。本項目で **増えた赤は 0**。赤は 2b からの型1 の 2 本(`verify_party_match_setup (0b)` / `verify_darkvision (3a)`)と既知の `sweep_recruit_balance` だけ。
- **(9-b)** `probe_s2_clear` をコミット `58e7eaa` の後の clean な木で再走: **exit 0・「✓ 全 3 走行が装置 assert を通りました」**(100.0 秒)・基準と経路1 4 = 4 / 経路2 4 = 4 **差 0**。⇒ 母集団 25 腕すべてで本項目由来の赤 0。
- 走らせなかった本(理由): `verify_bolt_aim` 素(2,241 秒)/ `verify_hold_pair` 素(904 秒)= 名前を注入してそのまま使い、酒場の名前の生成口を通らない / `verify_cone_cast` / `driver_leader_ai` = `tavern.html` を読まない(`driver_leader_ai` の「ミラ」は「ミラー」の部分一致)/ `probe_party_size` = 基準で 600 秒打ち切りの既知の赤。⇒ 項目5 の全数走査で色を採る。
- ⚠ 既知フレーク 9 本は本項目の golden に含めていない。

#### (10) 崩れた主張 — 項目2c で新たに **6 件**(累計 **33**)

| # | 主張 | 実測 |
|---|---|---|
| 1 | §5-3「例: 6 職 × 6 名 = 36 名」「⇒ **1 職あたり 4 名以上**にする」 | 4〜6 名で守れるのは **編成の中の一意** だけ。名簿の名前も避けて「名前が人物を 1 人に決める」まで求めると、名簿に同じ職が 11 人(職ごとの上限は無い)+ 約束 3 人で 14 名がふさがる ⇒ **15 名が要る**((3))。6 名では名簿に同職 6 人で尽きる |
| 2 | §5-3「(**卓は 4 席・同職が複数来る可能性がある**ため)」 | 卓の 4 席は 6 職から **重複なし**(20,000 / 20,000)。同職の新顔が 1 編成に 2 人来うるのは `?recruittalk=0` の `buildParty` だけ(最大 2)。声掛けで同職を 3 人誘えるが、誘った人は既に名前を持つ |
| 3 | §5-3「`pickUniqueName(usedSet)` → **`pickUniqueName(classKey, usedSet)`** とし」 | この順にすると既存の 1 引数の呼び(`tools/verify_mercenary_roster.js:306` の変異 `alwaysroster` が注入する `pickUniqueName(usedNames)`)で `usedSet` が `undefined` になり `usedSet.has` で例外 = 編成ごと例外(ドライバの注記が「§1 §3d §4 まで巻き添えで全滅して何を検出したのか判らなくなる」と避けている形)⇒ **`(usedSet, classKey)`** にした |
| 4 | §5-3「`NPC_NAMES` を職業別の名前リストへ **置き換える**」 | 置き換えると撤退 `?namejob=0` の戻り先と `verify_mercenary_roster (0c)` の `NPC_NAMES.length` が消える ⇒ **残して足した**(親の指示どおり) |
| 5 | §7「判定位置 = `tavern.html` の **定数** 3 本」 | 3 本とも **呼ぶたびに URL を読む関数**(`isWhoisOn` / `isDrawerLvOn` / `isNameJobOn`)。`pickUniqueName` は `regeneratePartyMembers` → `pickCompanion` → `makeNpcMember` 経由で上流から先に呼ばれうるので、const に畳むと TDZ(`pickCompanion` の注記と同じ理由) |
| 6 | `js/mercenary-roster.js:34`〜`:37`「上限が 12 人である理由 … **12 < 16 なので、名簿が満杯でも名前が衝突しない**」/ `verify_mercenary_roster (0c)` の見出し「(= 名簿が満杯でも名前が衝突しない、の根拠)」 | **着手前から不成立**: 新顔は名簿の名前を避けていなかった(影 `a79ae83` で名簿 8 人 + 約束 2 人の盤面の新顔 21,217 人中 **11,777 人** が同名 / 600 日の模擬で名簿に同名 2 人の日 **299 / 300**)。本項目で衝突を無くしたのは表の大きさではなく **除外**。⛔ `js/` と `tools/` は触っていない(注記の言い直しは項目3 / 5 の判断)。`(0c)` の assert 自体は 16 > 12 で緑のまま |

- 根: 1・2 = 数の根拠の取り違え(編成の中の一意と人物の一意)/ 3 = 既存の呼び口の数え落とし / 4 = 撤退先と golden の読み手の数え落とし / 5 = 作法の記述の鮮度 / 6 = モジュールの注記が測られていなかった。
- ⭐ 残る穴(移行しない決定のため・記録): 名簿に **旧規則の同名 2 人**(例: ロルフ = 魔法使い と ロルフ = 戦士)が既に居る場合、その 2 人どうしの `DFRecruits.has(name)` の曖昧さは残る(同じ抽選の卓には `usedNames` で同時に座らないが、片方を約束した日に、別の日の卓にもう片方が座ると 🤝 が付く)。新しく作られる顔からは生まれない。

#### ▶ 項目3 / 4 / 5 への申し送り

1. **項目3(golden の言い直し)**: 本項目で **増えた赤は 0**(golden 25 腕・(9))。言い直しの対象は 2b / 2a からの型1 の 3 本のまま(`verify_party_match_setup (0b)` / `verify_darkvision (3a)` / `verify_bolt_aim --negative` の `flavor3`)。 腐ったのは注記・コメントだけ: `js/mercenary-roster.js:34`〜`:37` / `verify_mercenary_roster (0c)` の見出し / `verify_recruit_size.js:723` の「名前は NPC_NAMES 16 個から一様」(assert は 1 職 15 名でも生存)/ `js/recruit-candidates.js:31`〜`:34`(「卓の 4 人の中では name で一意」= いまは名簿・約束とも一意)。⛔ js は読むだけの約束なので、直すなら別の判断。
2. **項目4(受入 `tools/verify_member_identity.js`)**:
   - (3a)(3b): 表は `NPC_NAMES_BY_CLASS` をページから読む(⛔ 写経しない)。数の期待 = `DFRoster.CAP - 1 + RECRUIT_MAX + 1`。生成口 = `makeNpcMember` / `pickCompanion` / `drawTodaysPatrons`(既定)/ `buildParty` / `regeneratePartyMembers`(`?recruittalk=0`)+ 本番の酒場の読み込みの `todaysPatrons`。
   - (3b') 除外の網: 名簿へ旧規則の顔(`DFRoster.enroll` で別の職に旧名)+ 約束(`DFRecruits.add`)を仕込み、新顔の名前がそれらと重ならない。上限の盤面(同職 11 + 約束 3)で新顔が 15 番目の 1 名に落ちる。遊びの模擬(卓 → 約束 → 出発の `enroll` → 見送り)が一番強い網(影では同名の日 299 / 300)。
   - (3c): 決定論の乱数はページの最初から(`evaluateOnNewDocument`)入れれば卓の init まで揃う。その後の列は evaluate の頭で入れ直す(非同期の `Math.random` 消費を挟まない)。
   - 変異の候補(逐語は本コミットで取り直し済み・各 1 件): `sharedpool` = `const byClass = (classKey && isNameJobOn()) ? NPC_NAMES_BY_CLASS[classKey] : null;`(`:4720`)の `NPC_NAMES_BY_CLASS[classKey]` を `null` に((3a)(3b) が赤)/ `noexcl` = `let pool = list.filter(function (n) { return !usedSet.has(n) && !taken.has(n); });`(`:4709`)の `&& !taken.has(n)` を外す((3b') が赤・(3a)(3b) は緑のまま = 柱3 の 2 本目を分けて測れる)/ `nocands` = `namesTakenTV` の約束の行(`:4699`)を外す(約束の網だけが赤)/ `switchdead` = `get("namejob") !== "0"`(`:4527`)/ `rosterwrite` は `js/mercenary-roster.js` 側(本項目は触っていない)。
   - 寸法: 新しい名前はすべて 4 字以下で、見出し・カード・声掛け・頭上札とも旧 16 名の最長(ガウェイン)を超えない((8))。
3. **項目5(母集団)**: 本項目で新しく読まれうるもの = `NPC_NAMES_BY_CLASS` / `isNameJobOn` / `namesTakenTV` / `pickClassNameTV` / `?namejob`。`tools/*.js` で読む本は **0 本**(`item2c/anchors2c.py`・引用符 3 種を独立に走査)。14 字以上の文字列リテラル 1,566 個のうち `a79ae83` → 現行で件数が変わったのは 6 個で、どれも URL の断片・メッセージ・`index.html` への注入の断片(`'?recruittalk=0'` × 4 本・`'sessionStorage '`・`' }); } catch (e) {}'`)= `tavern.html` のアンカーではない。名前をリテラルで持つ本は 9 本(「ミラ」= 魔法使いの注入 7 本・「ロルフ」= 戦士の注入 1 本・「ブラン」は「フロストブランド」の部分一致)で、どれも **注入した名前をそのまま使う** ので表と職が食い違っても赤くならない。
4. ポート: プローブは **10437〜10440** を使い全部解放済み。**10401〜10413 は未使用**(項目4 予約)。プローブ = `…/scratchpad/item2c/probe72_2c.js` / 置換 `patch72_2c.py` / 走査 `anchors2c.py` `names72.py` / golden `golden2c.py` `gate2c.py` `golden2c.tsv` / 影 `item2c/base_tavern_a79ae83.html`(bdabc28)。

---

### 12-0 追補(項目3 / 2026-09-22・実装窓 セッション `b34987cb-…`)— 既存 golden の言い直し(型1 の 3 本)+ 名指し 6 本の非退行 + 腐ったコメントの訂正

⛔ 本番(`index.html` / `tavern.html` / `audio.js`)は **1 バイトも触っていない**(証拠 = `git diff --stat 3be110c..249af2f -- index.html tavern.html audio.js` が空・blob `6b5cf38` / `05b986a` / `b3aaa1f` が前後で同一)。
変更ファイル = `tools/` 5 本(言い直し 3 本 + コメントだけ 2 本)+ `js/` 2 本(**コメントだけ**)+ 本 `.md`。コミット = `249af2f`(コード)+ 本追補(`.md` のみ)。
⭐ 行番号は `249af2f` の `tools/*.js`(純 LF)/ `js/*.js`(純 CRLF)。⛔ 使う前に逐語で引き直すこと。作業物 = `…/b34987cb-…/scratchpad/item3/`。
置換 = `item3/patch3.py`(11 箇所・各 old の件数 1 を assert・バイトで読み書き・ファイルの改行 LF / CRLF に合わせる)。

#### (1) 着手前の色(HEAD `3be110c`・clean な木・`item3/pre.tsv`)

| 本 | 腕 | 色(所要) | 赤い assert id と理由(ログの逐語) |
|---|---|---|---|
| `verify_party_match_setup` | 素 | exit 1・**35/36**(100.0 秒) | `[FAILED]  (0b) [装置] 全確定後のカードの職業の並びが selection.partyMembers の職業と一致 (表を写経していない証明)  -- カード=["戦士 Lv5","ドワーフ Lv2","エルフ Lv3","魔法使い Lv4"] / 実体=["戦士","ドワーフ","エルフ","魔法使い"] / 確定 4/4` |
| `verify_party_match_setup` | --negative | exit 0・8 本とも担当が赤(800.1 秒) | 8 腕すべてで `(0b)` が担当外の赤(`赤くなったラベル=(0b),(1a),…` 〜 `(0b),(1f)`)。基準と差 16 = 8 腕の `(0b)` PASS→FAIL だけ |
| `verify_darkvision` | 素 | exit 1・**24/25**(80.0 秒) | `FAILED (3a) ★.pmName / .pmClass / .pmEquipRow / .pmSkillsVal のテキストが着手前と 1 文字も違わない  — ⛔ #0 .pmClass "戦士 Lv5" ≠ "戦士" / #1 .pmClass "ドワーフ Lv5" ≠ "ドワーフ" / #2 .pmClass "エルフ Lv5" ≠ "エルフ" / #3 .pmClass "盗賊 Lv5" ≠ "盗賊"` |
| `verify_darkvision` | --negative | exit 1・**37/38**(282.1 秒) | 同じ `(3a)` 1 本(12 変異はすべて担当が赤) |
| `verify_bolt_aim` | --negative | **exit 3**(2.0 秒) | `⛔ flavor3     tavern.html:null  範囲の先頭 1 箇所 (13 行) / 範囲内 0 行 / ファイル全体 0 行` → `[drv] ⛔ 変異アンカーが 1 本腐っている (flavor3) → 負のコントロールが空振りするので走らせない`(残り 9 変異も 1 本も走っていない) |
| `verify_bolt_aim` | 素 | **exit 1・22/23**(2,242.8 秒) | `NG  (0e) [装置] 変異 10 本の注入点が、原本の「属する範囲」の中でちょうど 1 行 (⭐ 腐ると --negative が走る前に exit 3。素の側でも赤で見えるようにする)`。⚠⚠ **素も赤だった**((8) の 1)。実プレイの節 (1a)〜(5a) は基準と全部同じ(経路1 差 3 = `(0e)` PASS→FAIL + 監査行 `OK flavor3` の消失) |

- 比較器 = 項目1 の `item1/gate72.py`(`fp72e.py` を無改変 import)を phase 別に回す `item3/gate3.py`(`item2c/gate2c.py` の写し)。基準 = `item1/baseline72.tsv`。
- ⭐ 赤は **予想どおりの 3 本 + 予想に無かった `verify_bolt_aim` 素 1 腕**。どれも型1(本番の #72 の変更そのものが測定点を動かした)で、本番の欠陥ではない。

#### (2) 言い直し 3 本 — 前後の逐語と「なぜ弱めていないか」

⭐ 3 本とも **比べる相手と期待値は 1 文字も変えていない**。変えたのは「どこを読むか(測定点)」だけで、剥いだもの(`.pmLv`)を黙って捨てないための **装置条件を足した**(条件の数は増えただけ・減った条件は 0)。
⛔ assert のラベル(= 判定行の id と本文)は 3 本とも逐語で不変 ⇒ 2 経路の指紋はラベルを軸に基準と突き合わせられる。

**① `tools/verify_party_match_setup.js` (0b)**(PROBE `:307`〜`:317` / 判定 `:768`〜`:779`)

- 前(`3be110c`): 抽出 `classesJa:  cols.map((c) => txt(c.querySelector('.pmClass'))),` / 条件 `sorted(sReady.classesJa) === sorted(truth.classJa) && sReady.nCols === truth.keys.length && sReady.nFilled === sReady.nCols`(**3 条件**)
- 後(`249af2f`):
  - 抽出 `classesJa` = `.pmClass` の **先頭テキストノード**(`(f && f.nodeType === 3) ? String(f.nodeValue).trim() : ''`)/ `classRest` = `.pmClass` を複製して `.pmLv` を全部外した残りの textContent / `classLv` = `.pmClass .pmLv` の文字の並び
  - 条件 `sorted(sReady.classesJa) === sorted(truth.classJa) && sReady.nCols === truth.keys.length && sReady.nFilled === sReady.nCols && restOk && lvShape`(**5 条件**)。
    `restOk` = `classRest[i] === classesJa[i]`(全カード)/ `lvShape` = 各カードの `.pmLv` が 0〜1 個で `/^Lv\d+$/`。
- なぜ弱めていないか: 比べる相手(`selection.partyMembers` → `PARTY_SLOTS[].name` の職名)は同じ。職名は前と同じく「カードに描かれた文字」から取る(写経しない)。
  旧が捕まえられた食い違い(職名の後ろに何かが足された / 職名が違う)は `restOk` と `sorted(...)` で今も捕まる。新しく入った `.pmLv` は「職名の後ろに `" " + LvN` がちょうど 1 つ」の形でだけ許す。
  `?whois=0` では `.pmLv` が 0 個 ⇒ `restOk` は textContent そのもの・`lvShape` は空で真 = 旧と同じ判定に戻る。

**② `tools/verify_darkvision.js` (3a)**(抽出 `:825`〜`:837` / 判定 `:1191`〜`:1242` 付近・比較の行 `if (x.cls !== y.cls)` `:1210` は無改変)

- 前: 抽出 `cls:    txt(c.querySelector('.pmClass')),` を着手前 `f80a03c` の同時配信と 1 文字比較(#72 の `" Lv5"` で 4 枚とも赤)。
- 後: `cls:    noLv(c.querySelector('.pmClass')),`(`.pmLv` を剥いだ残り)+ `clsFull`(剥ぐ前)+ `lv`(`.pmLv` の文字)。(3a) に装置 3 条件を足した:
  ① 現行の `.pmLv` は 1 枚に 0〜1 個・`/^Lv\d+$/` / ② `clsFull === (lv.length ? cls + ' ' + lv[0] : cls)`(剥いだのは Lv の文字だけ)/ ③ 基準のカードに `.pmLv` が 0 枚(`.pmSight` の「基準が本当に着手前か」と同じ型)。
  成功時の詳細に `(現行の .pmLv 4 枚 [#72] は剥いで比べた: Lv5,Lv5,Lv5,Lv5 / 基準 0 枚)` を出す(黙って捨てない)。
- なぜ弱めていないか: (3a) が守るのは「視界 (#39) を足しても既存の 4 器(`.pmName` / `.pmClass` / `.pmEquipRow` / `.pmSkillsVal`)の文字が着手前と 1 文字も違わない」。#72 の `.pmLv` は `.pmSight` と同じ「後から足したもの」なので、`.pmSight` を比べる相手から外していたのと同じ扱いで剥ぐ。職名の文字そのものは今も着手前と 1 文字比較。
- ⚠ `:677`(`openPrep` 経由の演出のカード)の `cls` は **触っていない**: 読み手は (0d) の詳細の表示だけ(`(職: ドワーフ Lv5)`)で、`fp72e` は詳細を ` — ` で切るので 2 経路のどちらにも入らない((8) の 2)。

**③ `tools/verify_bolt_aim.js` 変異 `flavor3`**(`:162`〜`:168`)

- 前 from: `'    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, flavor: "敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },'`(原本に **0 行**)
- 後 from: `'    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, levelReq: 3, flavor: "敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },'`
- 後 to: `'    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, levelReq: 3, flavor: "直線 3 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },   /* ★変異flavor3 */'`
- 原本での健在チェック(`item3/chk_flavor3.py`・§0e と同じ規則): scope `  const MAGE_SKILLS_UI = [` は 1 箇所(`tavern.html:4490`〜`:4502`・13 行)、新しい from は **ちょうど 1 行**(`:4497`・範囲内)、旧 from は 0 行。
- なぜ弱めていないか: 変異の意味(「鏡の flavor だけ 3 タイルのまま」)は同じ。to にも `levelReq: 3` を残した = 変異が動かすのは flavor の文字だけ(Lv の判定・`[Lv3 必要]` は素のまま)。担当表 `NEG_EXPECT.flavor3 = ['(3a)']` は無改変。

#### (3) 装置条件が空振りしないことの単体確認(`item3/unit3.js`・合成 DOM・**15/15**)

⭐ 写経しない: ドライバのソースから PROBE 関数 / (0b) の `restOk`・`lvShape` と条件式 / darkvision のカード抽出関数 / (3a) の assert 関数を **文字列で切り出して** about:blank の合成カードに当てた(切り出しに失敗したら exit 3)。

| 合成カード(4 枚のうち 1 枚を崩す) | (0b) | (3a) | 期待 |
|---|---|---|---|
| 職名 + `" "` + `.pmLv`(本番の形) | 緑 | 緑 | 緑 |
| `.pmLv` 無し(`?whois=0` の形) | 緑 | 緑 | 緑 |
| 職名の後ろにゴミ(`戦士 <span class="pmLv">Lv5</span>X`) | 赤(rest=`"戦士 X"`) | 赤 | 赤 |
| 職名が `.pmLv` の中へ逃げた | 赤(先頭テキストノード = 空) | 赤(器が空 + 形) | 赤 |
| `.pmLv` が 2 個 | 赤(`lvShape`) | 赤(形) | 赤 |
| `.pmLv` の中身が `Lv5!` | 赤(`lvShape`) | 赤(形) | 赤 |
| 職名が違う(魔法使い → 盗賊) | 赤(`sorted`) | 赤(`.pmClass "盗賊" ≠ "魔法使い"`) | 赤 |
| (3a) のみ: 基準側にも `.pmLv` | — | 赤(`基準のカードに .pmLv が 4 枚ある = 基準が着手前ではない`) | 赤 |

#### (4) 腐ったコメントの訂正(⛔ コメント行だけ・コードは 1 文字も変えない)

| 場所 | 前 | 後(要旨) |
|---|---|---|
| `js/mercenary-roster.js:34`〜`:44`(冒頭の「上限が 12 人である理由」) | `NPC_NAMES は 16 要素しかなく … 12 < 16 なので、名簿が満杯でも名前が衝突しない。` | #72 の着手前から不成立(新顔は名簿の名前を避けていなかった・実測 11,777 / 21,217)。#72 からは職ごとの表 `NPC_NAMES_BY_CLASS`(1 職 15 名)+ 名簿・約束の名前を使わない(`namesTakenTV` / `pickClassNameTV`)= 根拠は除外。⚠ 逆向きの依存: 1 職 15 名 = `CAP - 1 + RECRUIT_MAX + 1` ⇒ CAP を増やすなら表も増やす |
| `js/mercenary-roster.js:62`〜`:63`(`var CAP = 12;` `:64` の直前) | `/* 在籍の上限。⭐ NPC_NAMES = 16 より小さいことが「名前が衝突しない」の根拠。 */` | 「成り立っていなかった(冒頭参照。根拠は tavern.html の除外 = namesTakenTV)」 |
| `js/recruit-candidates.js:28`〜`:30` | `⛔ Lv の確定   … assignCompanionLevels() が出発時に確定する唯一の口 (#38)` | 「確定する唯一の口」+「#72 から新顔の Lv は出発時ではなくマッチング画面で振る(`fixCompanionLevelsEarly` がこれを呼ぶ・出発では振り直さない)」⭐ 親の一覧に無かった 5 件目((8) の 3) |
| `js/recruit-candidates.js:33`〜`:39` | `⭐ pickUniqueName() が 1 回の抽選内で名前を重複させないので、卓の 4 人の中では name で一意になる。` | 抽選内の一意 + #72 から新顔は名簿・約束の名前を使わない ⇒ 名簿・約束の人とも name で一意。⚠ 例外 = #72 より前に名簿へ入った同名の 2 人(移行しない決定) |
| `tools/verify_mercenary_roster.js:659`〜`:667`((0c) `:668` の直前) | (コメント無し。ラベルの括弧が `(= 名簿が満杯でも名前が衝突しない、の根拠)`) | ラベルの括弧が着手前から不成立であること・根拠は除外であること・assert の中身は生きていること・**ラベルの文字列は変えていない理由**(コードは 1 文字も変えない約束)をコメントで添えた((8) の 4) |
| `tools/verify_recruit_size.js:722`〜`:732`((D) の根拠) | `goblin-mine は NPC 1 人で、名前は NPC_NAMES 16 個から一様 … 1/48 … (1/48)^10 ≒ 6e-17` | 前提が 2 つとも古い(NPC は #8 で 3 人・#61 で全依頼 RECRUIT_MAX 人 / 名前は #72 から職ごとの表から除外つきで一様)。閾値は変えない。実測 = 11 サンプル中 11 種(★1 NPC 3 人 / ★2 注入 2 人・基準 `b3643c8` と 2c の後で同じ)((8) の 5) |

- **コメントだけであることの証明**(`item3/comment_only.py`): HEAD の blob と作業ツリーから JS のコメントを剥ぎ(文字列 `''` `""` `` ` `` と正規表現リテラルの中は剥がない)、空白を畳んだトークン列を比べた ⇒ `js/mercenary-roster.js` / `js/recruit-candidates.js` / `tools/verify_mercenary_roster.js` / `tools/verify_recruit_size.js` の 4 本とも **IDENTICAL**。
  比較器の負の対照(`--selftest`): コメントを変えると IDENTICAL・コードを 1 文字変えると DIFFERENT・文字列の中の `//` を変えると DIFFERENT。言い直した 3 本は DIFFERENT(= 比較器は変更を見逃さない)。
- `git diff --numstat 3be110c..249af2f -- js/` = `mercenary-roster.js` +11 / −3・`recruit-candidates.js` +8 / −3。`-` 行と `+` 行はすべて `/* … */` の中(冒頭の見出しコメントの行と、`var CAP` 直前の 2 行コメント)。`js/` は置換後も **純 CRLF**(`mercenary-roster.js` CRLF 260 / LF 260・`recruit-candidates.js` CRLF 128 / LF 128・bare 0)。
- 機械検査される文字列を踏んでいないこと(`item3/chk_anchors_js.py --disk`): `tools/*.js` の 14 字以上の文字列リテラル(引用符 3 種を独立に走査)のうち `js/` 2 本 + `tavern.html` + `index.html` に現れる **1,198 個**の出現回数が HEAD と作業ツリーで **1 つも変わらない**(`badprefix` の `var KEY = "dragonfighters.mercRoster";` を含む)。
  ⚠ 下書きの段階では `recruit-candidates.js` の字下げ 20 空白が 16 空白の文字列リテラル 1 個と一致して 0→1 になった ⇒ 字下げを 5 空白へ直して 0 件にした(その字下げを読む本は無いが、数を 0 に揃えた)。

#### (5) 作業中の色(未コミットの木 `3be110c+dirty`・`item3/wip.tsv`)

| 本 | 腕 | 色 | 基準と(経路1 / 経路2) |
|---|---|---|---|
| `verify_bolt_aim` | --negative | exit 0・**10 / 10 が検出成功**(144.0 秒) | 197 = 197 / 229 = 229 **差 0**(着手前は exit 3 で 9 id) |
| `verify_party_match_setup` | 素 | exit 0・36/36 | **差 0 / 0** |
| `verify_darkvision` | 素 | exit 0・25/25 | **差 0 / 0** |
| `verify_mercenary_roster` | 素 | exit 0・44/44(js のコメントを変えた後の確認) | **差 0 / 0** |

#### (6) 最終の色 — 名指し 6 本 + `verify_bolt_aim`(⭐ コミット `249af2f` の後の **clean な木**・`item3/post.tsv`・13 腕を直列)

| 本 | 素(所要) | 素 vs 基準(経路1 / 経路2) | `--negative`(所要) | neg vs 基準(経路1 / 経路2) |
|---|---|---|---|---|
| `verify_party_match_setup` | exit 0・**36/36**(100.0 秒) | 36 = 36 / 36 = 36 **差 0** | exit 0・8 本とも担当が赤(800.2 秒) | 288 = 288 / 288 = 288 **差 0**(着手前は差 16) |
| `verify_darkvision` | exit 0・**25/25**(80.0 秒) | 25 = 25 / 25 = 25 **差 0** | exit 0・**38/38**(282.1 秒) | 38 = 38 / 38 = 38 **差 0** |
| `verify_pm_drawer_fit` | exit 0・75/79 PENDING 4(70.0 秒) | 79 = 79 / 79 = 79 **差 0** | exit 0・9 本とも担当が赤(630.1 秒) | 720 = 720 / 822 = 822 **差 0** |
| `verify_mercenary_roster` | exit 0・44/44(20.0 秒) | 44 = 44 / 44 = 44 **差 0** | exit 0・10 本とも担当が赤(190.0 秒) | 440 = 440 / 440 = 440 **差 4**(= `alwaysroster` の腕の担当外 (2z3)(2e) が基準 FAIL → 今回 PASS・(7)) |
| `verify_recruit_talk` | exit 0・25/25(64.0 秒) | 25 = 25 / 25 = 25 **差 0** | exit 0・**11/11 本が期待どおり**(812.2 秒) | 36 = 36 / 36 = 36 **差 0** |
| `verify_recruit_size` | exit 0・91/91(72.0 秒) | 91 = 91 / 91 = 91 **差 0** | (`--negative` を持たない) | — |
| `verify_bolt_aim` | exit 0・**23/23**(2,242.7 秒) | 33 = 33 / 33 = 33 **差 0**(着手前は `(0e)` だけ赤の 22/23) | exit 0・**10 / 10 が検出成功**(144.0 秒) | 197 = 197 / 229 = 229 **差 0** |

- **`--negative` の全変異の担当の色**(本コミット後):
  - `verify_bolt_aim`(10 本・`負のコントロール 10 / 10 が検出成功`): reach3 担当 (1b),(5a) / 赤 (1a),(1b),(1c2),(1d),(1e),(1f),(1g),(1h),(5a)・rays8 (1a) / 赤 (1a),(1d),(1f),(1g),(1h)・nowall (1d2) / 赤 (1d),(1d2),(1f),(1h)・dmgray (1e),(1f) / 赤 (1c2),(1d),(1d2),(1e),(1f)・norange (1c2) / 赤 (1c2)・hardcode10 (5a) / 赤 (5a)・vetogone (1g) / 赤 (1g)・switchdead (4a) / 赤 (0a),(1a),(1b),(4a)・endstale (1h) / 赤 (1h)・**flavor3 (3a) / 赤 (3a)**(起動確認は 10 本とも OK)。
  - `verify_party_match_setup`(8 本): M1 → (1a),(2z),(2a),(2b) / M2 → (2b-2) / M3 → (3d),(4a) / M4 → (4a) / M5 → (5b) / M6 → (4c) / M7 → (3b) / M8 → (1f)(担当はすべて赤)。⭐ 着手前は 8 腕すべてに担当外の `(0b)` が混じっていた ⇒ **0 腕**。
  - `verify_darkvision`(12 本): `neg-shadowsight` / `flatsight` / `emptysight` / `wrongft` / `elfdark` / `dropsheetrow` / `dropcardsight` / `droprostersight` / `droptitlesight` / `legacydrop`(対象外の確認)/ `noretreat` / `retreatkills` がすべて PASSED(= 担当の節が赤)。(3a) を担当する変異は元から無い(素の節として毎回測られる)。
  - `verify_pm_drawer_fit`(9 本): maxonly / ovback / maxback (1a-v1)・compactback (1a-v3)・noscroll (3a-v1)・norestore (3b-v3)・stickydead (4a-v1)・switchdead / switchtwice (6a-v1) がすべて担当を赤。
  - `verify_mercenary_roster`(10 本): badprefix → (3a),(3c),(3b) / nolevelclamp → (2e) / fadeclose → (4c) / noretreatswitch → (6a),(5a) / nocap → (3d) / reuseid → (3e) / defeatgrows → (2b),(2f2) / alwaysroster → (0a),(5a) / noclamp → (2c) / switchleak → (3c)。⭐ `badprefix` の注入先 `js/mercenary-roster.js` は本項目でコメントを変えたファイル ⇒ **アンカーは健在**(注入されて担当が赤)。
  - `verify_recruit_talk`: `負のコントロール: 11/11 本が期待どおり`。

#### (7) `verify_mercenary_roster --negative` の揺れの記録(2b 以来の既知)

- 10 腕それぞれの `(2z1) [母集団] §2 の名簿に 1 人以上いる  -- 在籍 N 人`: badprefix **12** / nolevelclamp **12** / fadeclose **8** / noretreatswitch **12** / nocap **11** / reuseid **11** / defeatgrows **9** / alwaysroster **12** / noclamp **11** / switchleak **11** ⇒ **8〜12 人**(⚠ 2b の記録「9〜12」より下へ 1 人広い)。
- `alwaysroster` の腕は今回 **12 人(満杯)** ⇒ 担当外の (2z3)(2e) は緑 = 基準の腕(`item1/run72` @`0e8370d`・在籍 11 人で (2z3)(2e) が赤)と差 4。2b / 2b2 / 2c の golden と同じ向き・同じ 4 行。担当の (0a)(5a) は両方とも赤。
- 本項目の変更(`js/` 2 本と `tools/verify_mercenary_roster.js` は **コメントだけ**)からこの区画への経路は無い(`comment_only.py` で IDENTICAL)。

#### (8) 崩れた主張 — 項目3 で新たに **6 件**(累計 **39**)

| # | 主張 | 実測 |
|---|---|---|
| 1 | 項目1 §12-0 (12) の 7「(LB 行へ `levelReq: 3` を足すと)`--negative` が exit 3。**素は緑のまま** = #60 の型」/ キュー「型1 の赤 = 3 本(`verify_bolt_aim` は `--negative`)」 | `verify_bolt_aim` は §0e の監査を **素でも** `(0e)` として判定する(`R.check('(0e)', …, AUDIT_BAD.length === 0, …)` `:1427` 付近)⇒ **素も 2a から赤**(着手前 22/23・2,242.8 秒)。2a〜2c は素を走らせていなかった(2c「未走 = `verify_bolt_aim` 素」)。言い直し後は **23/23・基準と差 0**((6)) |
| 2 | キュー / 2b の申し送り「`verify_darkvision` (3a)(抽出 `:677` / `:825`・比較 `:1198`)」 | (3a) が読むのは `:825`(`probeTavernNR` の決定論の編成)だけ。`:677`(`openPrep` 経由の演出)の `cls` は (0d) の詳細の表示にしか使われず、`fp72e` は詳細を ` — ` で切るので 2 経路のどちらにも入らない ⇒ 触っていない |
| 3 | 2c の申し送り「腐ったのは注記・コメントだけ」(4 箇所) | 5 箇所目 = `js/recruit-candidates.js:28`「`assignCompanionLevels()` が **出発時に** 確定する唯一の口」。2a の (β) で新顔の Lv はマッチング画面で振る(`fixCompanionLevelsEarly` → `assignCompanionLevels`)⇒ 本項目で訂正 |
| 4 | 項目3 の指示「`tools/verify_mercenary_roster.js` の (0c) の **見出しコメント**」 | (0c) の「見出し」はコメントではなく `check()` の **ラベルの文字列 = コード**。「コメント行だけ・コードは 1 文字も変えない」を守り、ラベルは残して直前にコメントを添えた ⇒ **ログのラベルには古い括弧「(= 名簿が満杯でも名前が衝突しない、の根拠)」が表示され続ける**(括弧は ` — ` の後ろなので 2 経路の指紋には入らない = 変えても指紋は動かない。直すかは判断待ち) |
| 5 | 2c の申し送り「`verify_recruit_size.js:723` の『名前は NPC_NAMES 16 個から一様』が腐った」 | 同じ根拠コメントのもう 1 つの前提「goblin-mine は NPC 1 人」は **#8(NPC 3 人)/ #61(全依頼 RECRUIT_MAX 人)の時点で既に古かった**(同じドライバの `:785`〜`:796` がそう書いている)⇒ 1/48 の見積もりは #72 以前から不成立。両方を書き直した(実測 = 11 サンプル中 11 種) |
| 6 | メモ `project_headless_verification.md`(#55 の節)「`verify_recruit_size.js` = CRLF 1108 + LF 9(混在)」 | いまは **純 LF**(LF 1,392 / CRLF 0 / bare CR 0・#65 の行末の一本化の後)。`tools/*.js` の 5 本はすべて純 LF・`js/*.js` の 2 本は純 CRLF(`.gitattributes` の宣言どおり) |

- 根: 1 = 「素 / --negative のどちらが何を判定するか」の読み落とし(装置の監査が素にも出ている)/ 2 = 行番号の一覧の粒度(抽出点と比較点の対応を読んでいない)/ 3・5 = 腐ったコメントの数え落とし(語で探すと、同じ段落の別の前提を見落とす)/ 4 = 「見出し」がコメントかコードかの取り違え / 6 = メモの鮮度。

#### ▶ 項目4 / 5 への申し送り

1. **言い直した assert の新しい逐語と行(`249af2f`)**:
   - `verify_party_match_setup` (0b): PROBE `classesJa` `:307`(先頭テキストノード)/ `classRest` `:311` / `classLv` `:317`・条件 `const restOk = …` `:768` / `const lvShape = …` `:770` / `check('(0b) [装置] …'` `:772`(`&& restOk && lvShape,` `:774`)。ラベルは不変。
   - `verify_darkvision` (3a): 抽出 `const noLv = (e) => {` `:825` / `cls:    noLv(c.querySelector('.pmClass')),` `:835` / `clsFull` `:836` / `lv` `:837`・判定 `['3a', …` `:1191` / `if (x.cls !== y.cls)` `:1210`(無改変)/ 装置 `} else if (x.clsFull !== (lv.length ? x.cls + ' ' + lv[0] : x.cls)) {` `:1227` / `const bLv = …` `:1231`。
   - `verify_bolt_aim` `flavor3`: `:166`〜`:168`(from / to とも `levelReq: 3, ` 入り)。アンカー = `tavern.html:4497`(scope `:4490`〜`:4502`)。
2. **変異アンカーの健在状況(本コミット後の実走)**: `verify_bolt_aim` §0e 10 / 10 OK / `verify_party_match_setup` M1〜M8 / `verify_darkvision` 12 本 / `verify_pm_drawer_fit` 9 本 / `verify_mercenary_roster` 10 本(`js/mercenary-roster.js` の `badprefix` / `noretreatswitch-2` / `nocap-1〜3` / `reuseid-1〜3` / `defeatgrows` を含む)/ `verify_recruit_talk` 11 本 — **全部健在・空振り 0**。
3. **項目4(受入)へ**: `.pmClass` を読むなら (0b) と同じ形(職名 = 先頭テキストノード・Lv = `.pmClass .pmLv`・「剥いだ残り = 職名」を装置に)。装置が空振りしないことは `item3/unit3.js` の型(ドライバのソースから関数を切り出して合成 DOM に当てる)で安く示せる。
4. **項目5(母集団)へ**: 本項目で色が動いた腕 = `verify_party_match_setup` 素 / `--negative`・`verify_darkvision` 素 / `--negative`・`verify_bolt_aim` 素 / `--negative`(いずれも着手前の赤 → 基準と差 0 へ)。⭐ 走査は **コミット後の clean な木** で。`verify_mercenary_roster --negative` の差 4 は (7) の揺れ(在籍 8〜12)。
5. 道具(`…/scratchpad/item3/`): `run3.py`(直列走行・TSV)/ `gate3.py`(`gate72.pair` を phase 別に)/ `patch3.py`(置換 11 箇所)/ `chk_flavor3.py` / `chk_anchors_js.py`(`--disk`)/ `comment_only.py`(`--selftest`)/ `unit3.js`。ログ = `pre/` `wip/` `post/`。ポートは新しく取っていない(`unit3.js` は about:blank)。**10401〜10413 は未使用**(項目4 予約)。

---

### 12-0 追補(項目4 / 2026-09-22・実装窓 セッション `b34987cb-…`)— 受入 `tools/verify_member_identity.js` の新設 + `verify_mercenary_roster (0c)` のラベルの括弧

⛔ 本番(`index.html` / `tavern.html` / `audio.js`)と `js/` は **1 バイトも触っていない**(証拠 = 本コミットの変更は `tools/verify_member_identity.js`(新規)・`tools/verify_mercenary_roster.js`(2 行)・本 `.md` の 3 本だけ)。
⭐ 行番号は HEAD `837d36d` の `tavern.html`(純 CRLF・10,994 行)。⛔ 使う前に逐語で引き直すこと。作業物 = `…/b34987cb-…/scratchpad/item4/`(`try*.log` / `explore/` / `wip_*.log`)。

#### (1) 道具の形

- `node tools/verify_member_identity.js`(素)/ `--negative`(変異 12 本)/ `--mutate <key>`(変異 1 本 × 全ユニットの手回し = 担当表を実走で決める口)/ `--units a,b`(素の一部)。
  ポート = **10401**(素)/ 変異 **10402〜10413**(`MUTATIONS` の並び順)。exit 0 / 1(FAIL・空振り)/ 2(環境・例外)/ 3(変異アンカーの腐敗)。
- 型 = `verify_bolt_bounce` と同じ(ブラウザ 1 つ・変異ごとに配信スナップショットだけを差し替えるサーバ・**範囲つきの行単位アンカー監査**・`--negative` の先頭で「素の基準」を走らせ赤なら変異を走らせない・起動確認 = (0c))。
- 14 ユニット / 26 ページ。1 ユニット = 1〜4 ページで、データを置くだけ。判定は最後の `judge()` が **走ったユニットの分だけ** 出す(`--negative` は変異ごとに要るユニットだけ走らせる)。
- 仕込み = 項目1〜3 のプローブの型(document-start で `dragonfighters.*` を消してから仕込む・`__pmTest.play` でマッチング画面だけを開く・出発の遷移は `abort('aborted')`・viewport は幅と高さだけ)。
  全呪文を習得にした `knownSpells` は **meta ユニットがページの `PARTY_SLOTS` から読んで** 作る(⛔ 呪文 ID を写経しない)。
- 行末 = **純 LF**(`.gitattributes` の既定 `* text=auto eol=lf` = `tools/verify_bolt_bounce.js` と同じ。`py` のバイト数えで CRLF 0)。`node --check` 通過。

#### (2) assert 一覧(28 本 = §0 6 + §1 4 + §2 10 + §3 5 + §4 2 + (0f))

| id | 腕 | 何を見るか(値) |
|---|---|---|
| (0a) | 全部 | 開いた引き出し 73 回すべてで `pmDrawerIdx` = 押したカード・測る直前に `#pmDrawer` へ置いた番兵が消えた・行 ≥ 1(呪文職は個数の行 ≥ 1) |
| (0b) | 既定 | 主人公 Lv = ページの `getLevelFromXP(21000)` = 7(> 仕込みの Lv2)/ 職名 = `PARTY_SLOTS` / 名前表 = `NPC_NAMES_BY_CLASS`(6 職 × **`DFRoster.CAP − 1 + RECRUIT_MAX + 1` = 15**・ページの定数から)/ 本体 `index.html` の LB の `levelReq` がファイルから 1 箇所で読める(= 3) |
| (0c) | 全部 | 26 ページすべて `document.title` が空でなく、#72 のヘルパ 8 つ(`levelOfMember` `shownLevelOf` `lowestLevelOfClass` `isWhoisOn` `isDrawerLvOn` `isNameJobOn` `pickClassNameTV` `fixCompanionLevelsEarly`)が在る |
| (0d) | 全部 | 番兵: カード列 `#pmColumns`(マッチングを開くたび)/ 声掛けの `#recruitRole`(開くたび)へ置いた番兵を本番の口が消した・書き換えた。以降は値(テキストの逐語 / 行の class / localStorage の文字列)で比べる |
| (0e) | 素のみ | 変異 12 本の注入点が原本の「属する範囲」の中でちょうど 1 行(素の側でも赤で見える = `verify_bolt_aim (0e)` と同じ設計) |
| (0f) | 全部 | pageerror / console.error 0(favicon の 404 だけ除外) |
| (1a) | A1 / A0 | カード `.pmClass` = 先頭テキストノード「職名」+ `.pmLv` 1 個「Lv本人」・剥いだ残り = 職名・`levelOfMember` と一致。本人の Lv = 主人公 XP / 名簿の顔 = min(保存 Lv, 主人公 Lv)(保存 Lv9 の僧侶 → Lv7)/ 新顔 = マッチングで振られた Lv。A0 では `.pmLv` 0 個 |
| (1b) | A1 / A0 | 見出し「職名 — 名前 LvN」(主人公は「あなた」)= 先頭テキストノード + `.pmDrawerLv` の逐語 + `levelOfMember(開いた本人)`。A0 では Lv 無し |
| (1c) | A1 / A0 | 声掛け: 名簿の顔(満杯の名簿 = 卓 4 席とも名簿の顔)=「職名 LvN — 性格」・保存 Lv9 のドワーフ(本物の `drawTodaysPatrons` で引いた)=「ドワーフ Lv7 — …」/ 初めての顔(空の名簿)= Lv 無し / A0 = 名簿の顔でも Lv 無し |
| (1d) | A1 vs A0 | 同じ乱数の種で `#rosterBody` innerHTML(3,501 字)・`#rosterSub`・頭上札 4 枚・卓の席が完全一致 |
| (2a) | A2 / A0 | 主人公 Lv7 × 名簿の魔法使い Lv2: LB に `[Lv3 必要]` + `.full` + ＋無効(3 = **本体 `index.html` をファイルから読んだ値**・酒場の表も同値)/ A0 はバッジ無し(欠陥の再現) |
| (2b) | A2 / A0 | その状態で LB の ＋ → 個数不変 / A0 は +1 |
| (2c) | A2 | 名簿の魔法使い Lv3: バッジ無し・＋ で +1 |
| (2d) | A2 vs A0 | 主人公が魔法使い Lv7・仲間は戦士/ドワーフ/盗賊: 4 枚の引き出しの innerHTML が完全一致(条件 = 主人公 Lv ≥ 5 を assert に含む) |
| (2e) | A2 / A0 | 仲間 Lv2 の上限 `getMaxSpellSlotsForClassTV(魔法使い, 2)` = 4 まで埋める → マジックミサイルの ＋ 無効・押しても不変(主人公基準なら 10)/ A0 は ＋ 有効で +1 |
| (2f) | A2 / N / A1 | A2: 主人公の魔法使い Lv7 + 仲間 Lv2 で **両方** の引き出しの LB に `[Lv3 必要]` + `.full`。注記の逐語: N で 2 人 =「⚠ 魔法使い 2 人に共通・判定は低い方の Lv2」/ 3 人 =「⚠ 魔法使い 3 人に共通・判定は最も低い Lv2」/ A2・A1 は「⚠ この設定は 魔法使い 2 人に共通で適用されます」 |
| (2g) | A2 | 新顔の魔法使い: マッチングの同期区間の乱数 0.999 で振られた Lv(= 同じページの `assignCompanionLevels` で求めた帯の上端 4)が画面の時点で在り、出発の乱数を 0(= 振り直せば必ず帯の下端 2)に固定しても `sessionStorage` の level が 4 のまま |
| (2h) | A2 / A0 | 名簿の僧侶 Lv2 / エルフ Lv2(全呪文習得)の `[LvN 必要]` + `.full` の行の集合 = `skillPool` の levelReq > 本人の Lv から導いた集合 / A0 は主人公 Lv から導いた集合(集合どうしが違う盤面) |
| (2i) | A2 | 主人公の僧侶 Lv7 + 名簿の僧侶 Lv2: 各カードの「技」行 = `getClericSlotsTV(本人 Lv)` の名前の「・」連結(2 経路目 = `CLERIC_SLOTS_TABLE` の直読み − 除外)・2 人の集合が違う |
| (2j) | A2 | 保存済みの `actionPriority.cleric` general/boss = `hold-person`: M(マッチング → 僧侶 Lv2 の引き出し → 全員の引き出し)の 4 時点 / H(主人公が僧侶 + 名簿の僧侶 Lv2 を **本番の `openPrep`**・両方の僧侶の引き出し)の 3 時点で localStorage と select が `hold-person`(装置: Lv2 の自動配分に `hold-person` が無い) |
| (2k) | 既定 | (α) `MAGE_SKILLS_UI` の levelReq = 本体 `index.html` の値(本体に levelReq がある 5 呪文: fireball 3 / LB 3 / cone 5 / burning-hands 1 / ice-storm 7) |
| (3a) | A3 / A3+`recruittalk=0` | 新顔の名前 ∈ その職の `NPC_NAMES_BY_CLASS`(`makeNpcMember` 1,200 / `pickCompanion` 1,200 / 卓 1,600 / `buildParty` 3,600 / `regeneratePartyMembers` 900) |
| (3b) | 同上 | 名前 → 職業が単射(90 種・2 職に出た名前 0)+ どの職も 15 名を全部使う |
| (3b') | 同上 | 旧規則の名簿 8 人(共有 16 名の先頭 8 名を表と別の職で本番の `DFRoster.enroll`)+ 約束 2 人で、新顔が名簿・約束の名前を使わない(衝突 0)/ 上限の盤面(名簿に魔法使い CAP−1 = 11 人 + 約束に魔法使いの新顔 RECRUIT_MAX = 3 人)で新しい魔法使いは表の 15 番目の 1 名だけ |
| (3c) | A0 | 新顔の名前はすべて共有 16 名・2 職に出た名前 16・旧規則の名簿と同名の新顔が出る(= 従来の姿・比較器の負の対照を兼ねる) |
| (3d) | A3 | 本番の口で作った名簿(旧規則の同名 2 人を含む 9 人・`recordRun` 済み)と約束の文字列が、読み込み・卓の抽選 200 回・`makeNpcMember` / `pickCompanion` 各 360 回の後もバイト一致 / 声掛けで足した 1 件のキー集合と型 = 本番の `makeNpcMember` で作った約束と同じ / 出発後: 既存 9 人はバイト一致(同名 2 人も残る)・新しい 2 人のキー = 既存のキー・`partyMembers` のキー = `makeHeroMember` + level / `makeNpcMember` + level + mercId |
| (4a) | A0 | ① カード・見出しに Lv 無し ② `MAGE_SKILLS_UI` から (α) の levelReq(fireball / LB / cone)が外れている ③ 魔法使い・僧侶・エルフの判定と枠の上限が主人公 Lv ④ 新顔の Lv は画面では無く出発で帯の中に振られる ⑤ 僧侶のカード = 主人公 Lv の集合 ⑥ 名前は共有 16 名 |
| (4b) | A1 vs A0 | 最悪の見出し「ドワーフ — ガウェイン Lv10」を含む編成で、カード rect.h・職業行 h・引き出し rect.h / scrollHeight / clientHeight・見出し h が **4 画面**(1280x900 / 1366x768 / 390x844 / 390x667)で完全一致(装置: A1 は `.pmLv` 4 + 見出しの Lv 4・A0 は 0) |

#### (3) 依頼書 §8 の原案からの読み替え(⭐ どれも期待値を弱めていない)

1. **注記の新しい文面は §2 の腕では測れない** ⇒ (2f) の注記は N(`?namejob=0`)の腕へ。注記の条件は `(isWhoisOn() && isDrawerLvOn())`(`tavern.html:8997`)なので `?whois=0` を含む §2 の腕では従来の文面が正しい。⇒ (2f) は「A2 と A1 では従来の文面」も同時に assert した(撤退の片側だけが 0 のときに「低い方」が漏れない網)。
2. **(1b) の 2 経路目は「仕込んだ m.level」でなく `levelOfMember(開いた本人)`** — 主人公の `m.level` は出発まで `undefined`・保存 Lv9 の名簿の顔は Lv7 と出る((7) の 2)。期待値は盤面(保存 Lv と主人公 Lv の min)から導き、`levelOfMember` と見出しの文字の両方と突き合わせた。
3. **(2d) の恒等は条件付き**(項目2a の崩れた主張 1・2)⇒ 仲間を呪文を持たない職にし、主人公 Lv ≥ 5 を assert の条件に入れた。
4. **(2a)(2c)(2k) の期待値の出所は本体 `index.html`**(ファイルから正規表現で読む)。⭐ 酒場の表から導くと、変異 `lvreqdrop`(LB の levelReq を外す)で「バッジが無い = 期待もバッジ無し」になって **空振りする**(期待値と実装が同じ誤りを持つ型)。ユーザー決定 (α) は「本体と同値」なので、本体を oracle にした。
5. **(2g) は「出発で振り直せば必ず別の値になる」盤面で測る** — 乱数任せだと振り直しても 1/3 で同じ値になり、「振り直さない」を示せない。⇒ マッチングの同期区間 = 0.999(帯の上端)・出発 = 0(帯の下端)に固定し、上端 ≠ 下端を装置に入れた。上端/下端は同じページの `assignCompanionLevels` を空の顔に当てて求めた(⛔ 帯 [2,4] を写経しない)。
6. **(4a) は影の配信ではなく「0e8370d の性質」6 つ**(指示で許可)。影との DOM 完全一致は項目2a〜2c のプローブで既に示してあるので、受入では **性質の逆向き**(撤退で何が戻るか)を独立に言う。
7. **(3d) の「従来の形」は写経せず本番の工場から導く** — `partyMembers` のキー = `makeHeroMember` / `makeNpcMember` のキー + level (+ mercId)、名簿の新しい人のキー = 既存の人のキー、約束のキー = 本番の `makeNpcMember` で作った約束のキー。
8. **openPrep を 1 腕だけ通す** — §8 計測機構の「⛔ openPrep を経由して編成を仕込まない」は `selection.partyMembers` への仕込みが消えるという意味。(2j) H は項目2b2 の副作用の引き金(openPrep の見えない準備画面の描画)そのものを測るので、顔ぶれは `dragonfighters.recruitCandidates`(約束 = openPrep が組み直す元)で仕込んだ。
9. **(4b) は 4 画面**(指示の最低 2 画面を超えた)— DIMS ユニットは 4 画面 × 2 腕 = 8 ページで 54.0 秒((5))。
10. **§8 の変異表の担当は実走で差し替えた**((4))。

#### (4) 変異の担当表(⭐ 机上で書かず `--mutate <key>` で全ユニットを 1 本ずつ実走・HEAD `837d36d` の上・ログ `item4/explore/`)

| 変異 | 注入点(`tavern.html`・範囲の先頭) | 何をする | 全ユニットで赤くなった集合 | `--negative` のユニット / 担当 |
|---|---|---|---|---|
| `lvhero` | `:9023` `pmRenderDrawer` | 判定 Lv を主人公へ(§2-2 の欠陥) | (2a)(2b)(2e)(2h)(2f) | P2,P0 / (2a)(2b)(2e)(2h) |
| `capfromhero` | `:9024` 同上 | 枠の上限だけ主人公 Lv | **(2e) だけ**(最も鋭い) | P2,P0 / (2e) |
| `lvreqdrop` | `:4497` `MAGE_SKILLS_UI` | (α) LB の levelReq を外す | (2a)(2b)(2f)(2k)(4a) ※ | P2,P0 / (2a)(2b)(2k)(4a) |
| `lvnoshow` | `:9310` `buildPmColumn` | カードの Lv の文字を消す | (1a) | P1,P0 / (1a) |
| `headnolv` | `:8970` `pmRenderDrawer` | 見出しの Lv の文字を消す | (1b) | P1,P0 / (1b) |
| `sharedpool` | `:4720` `pickUniqueName` | 職業別の表を使わない | (3a)(3b)(3b') | S3 / (3a)(3b)(3b') |
| `noexcl` | `:4709` `pickClassNameTV` | 名簿・約束の名前を避けない | **(3b') だけ**(柱3 の 2 本目を分けて測れた) | S3 / (3b') |
| `earlyoff` | `:8135` `fixCompanionLevelsEarly` | (β) 画面で Lv を決めない | (1a)(1b)(2g) | P1,P0,P2g / (1a)(1b)(2g) |
| `cardhero` | `:7772` `apEquippedIdsFor` | 僧侶のカードを主人公 Lv の集合へ | (2i) | P2i / (2i) |
| `apclamp` | `:7771` 同上 | 傾向段の候補を最低 Lv へ(2b の副作用①) | (2j)(4a) ※ | P2j / (2j) |
| `rosterwrite` | `:4698` `namesTakenTV` | 名前を避けるついでに名簿を書き換える(= §5-3 が禁じた移行) | (3d) | S3d / (3d) |
| `switchdead` | `:4510` `:4519` `:4527`(3 行) | 撤退判定 3 本を常に真 | (1a)(1b)(1c)(2a)(2b)(2e)(2h)(2f)(3c)(4a)(4b) | P0,P1 / (1a)(1b)(3c)(4a) |

- ※ `lvreqdrop` の (4a) = ② が「既定の腕の表と比べて (α) の levelReq が A0 で外れている」を見るので、既定の腕の LB から levelReq が消えると崩れる巻き添え。`apclamp` の (4a) = ⑤ A0 の僧侶のカードも `auto` の行を通るので最低 Lv の集合になる巻き添え。
- `switchdead` で (1d) だけ緑 = 傭兵名簿パネルは表示の柱を持たない(恒等の網として正しい)。
- **候補から外した変異**(ポート 12 本の上限): `notesw`(注記の条件)・`notelv`・`dialoglv`(声掛けの条件)・`rerolldepart`(出発の `toRoll` を全員に)。⇒ (2f) の注記・(1c)・(2g) の「振り直さない」半分には専用の変異が無い。代わりに assert 自身が **腕の間の対照** を持つ((2f) は N と A2/A1 で文面が逆・(1c) は名簿の顔と初めての顔と A0 で逆・(2g) は出発の乱数を固定して「振り直せば必ず別の値」)。`earlyoff` は (2g) を「画面に Lv が無い」側で赤くする。
- ⭐ 範囲つきの行単位監査が **自分の誤りを実行前に捕まえた**: `lvnoshow` の範囲を最初 `playPartyMatchCinematic`(`:9354`)と書いたら `(0e)` が赤(範囲内 0 行・全体 1 行)。カードの行は `buildPmColumn(m, i)`(`:9234`)の中だった。

#### (5) 色(未コミットの木・`837d36d` + 本項目の 3 ファイル)

| 腕 | 色 | 所要 |
|---|---|---|
| 素 | **exit 0・28/28 PASSED** | 156.3 秒(26 ページ。重いユニット = P2j 30 秒(openPrep)/ DIMS 54 秒 / P2f 21 秒) |
| `--negative` | **exit 0・負のコントロール 12 / 12 が検出成功**(空振り 0・起動確認 12/12 OK)・素の基準 22/22 | 216.2 秒 |

- 素の最終の色(**コミット後の clean な木で 3 回**)と `--negative` の最終の色は、本コミットの後に追補する(下の (8))。

#### (6) `verify_mercenary_roster (0c)` のラベルの括弧(親の判断・項目3 の申し送り 4)

- 前: `(= 名簿が満杯でも名前が衝突しない、の根拠)` / 後: `(= CAP を写経していないことの装置。名前が衝突しない根拠はこの大小ではなく tavern.html の除外 namesTakenTV / pickClassNameTV = #72)`。assert id `(0c)`・比較の式・`上限を写経していない — ` までは 1 文字も変えていない。
- 直前のコメントの最後の 1 行「⛔ ラベルの文字列は変えていない …」は **嘘になるので** 「⭐ [#72 項目4] ラベルの括弧(` — ` の後ろ)だけを事実に合わせて言い直した …」へ置き換えた(変更は 2 行・`git diff --stat` = 2 insertions / 2 deletions・純 LF のまま 1,603 行)。
- 実走(未コミットの木): **exit 0・44/44**。基準 `item1/from71/logs/verify_mercenary_roster_base.log` と `item1/gate72.py --pair` で **経路1(assert id の指紋)44 = 44 差 0 / 経路2(判定行の多重集合)44 = 44 差 0**(判定行は ` — ` の前で切るので括弧は指紋に入らない)。

#### (7) 崩れた主張 — 項目4 で新たに **3 件**(累計 **42**)

| # | 主張 | 実測 |
|---|---|---|
| 1 | 項目4 の指示「§2 判定 Lv(柱2。`?whois=0&namejob=0` の腕で): … (2f) … 注記「⚠ 魔法使い 2 人に共通・判定は低い方の Lv2」の逐語」 | 注記の新しい文面は `(isWhoisOn() && isDrawerLvOn())` のときだけ(`:8997`)。§2 の腕(`?whois=0`)では **従来の文面「⚠ この設定は 魔法使い 2 人に共通で適用されます」が正しい**。⇒ 新しい文面は N(`?namejob=0`)の腕で測り、§2 の腕では従来の文面を assert した((3) の 1) |
| 2 | 依頼書 §8 (1b)「⭐ 2 経路: 見出しのテキストと、**仕込んだ `m.level`** の一致」 | 主人公の `m.level` は出発まで `undefined`、名簿の保存 Lv9 の顔は見出しに Lv7(clamp)。仕込んだ `m.level` と一致するのは「非主人公かつ保存 Lv ≤ 主人公 Lv」のときだけ。⇒ 2 経路目は `levelOfMember(開いた本人)`(項目2b の実装どおり)+ 盤面から導いた min(保存 Lv, 主人公 Lv) |
| 3 | 項目4 の指示「(4b) … **4 画面は重いので**、少なくとも 1280x900 と 390x844 の 2 画面で」 | 4 画面 × 2 腕 = 8 ページで 54.0 秒(素の全体 156.3 秒)。⇒ 4 画面とも測った((3) の 9)。⚠ 見積もりの鮮度(この機械の遅さが効くのは実プレイを回す本で、酒場の DOM だけを読む本では効かなかった) |

- 根: 1 = 撤退スイッチの組み合わせの読み落とし(注記は表示 × 判定の交差)/ 2 = 「保存値 = 表示値」の取り違え(clamp と主人公の undefined)/ 3 = 見積もりの鮮度。

#### (8) 最終の色 — コミット `49b82cc` の後の **clean な木**(`git status --short` = 起草窓の未追跡 `2026-09-21_pen-narration.md` だけ)・`item4/post/`

| 腕 | 色 | 所要 |
|---|---|---|
| 素 1 回目 | **exit 0・28/28 PASSED** | 157 秒 |
| 素 2 回目 | **exit 0・28/28 PASSED** | 157 秒 |
| 素 3 回目 | **exit 0・28/28 PASSED** | 156 秒 |
| `--negative` | **exit 0・負のコントロール 12 / 12 が検出成功**(担当 = 実際に赤くなった集合が 12 本とも完全一致・起動確認 12/12 OK)・素の基準 22/22 | 216 秒 |
| `verify_mercenary_roster` 素 | **exit 0・44/44** | 19 秒 |

- **色の安定**: 素の 3 回を `item1/gate72.py --pair` で突き合わせ — 1 回目 vs 2 回目・1 回目 vs 3 回目とも **経路1(assert id の指紋)40 = 40 差 0 / 経路2(判定行の多重集合)40 = 40 差 0**(40 = 判定 28 + §0e の監査行 12)。ユニットごとの所要も 3 回で ±0.2 秒(DIMS 53.9〜54.1 / P2j 30.0〜30.1 / P2f 20.9)。
- `verify_mercenary_roster` 素: 基準 `item1/from71/logs/verify_mercenary_roster_base.log` と **経路1 44 = 44 差 0 / 経路2 44 = 44 差 0**(未コミットの木の (6) と同じ)。

#### ▶ 項目5 への申し送り

1. **新しいドライバ** `tools/verify_member_identity.js`: 素 **28/28**(約 156 秒・26 ページ)/ `--negative` **12/12**(約 216 秒)。**`tavern.html` を配信し `index.html` をファイルとして読む**(index は配信しない)⇒ 母集団の段2(`tavern.html` を読む本)に入る。`git` の状態は見ない(未コミットの木でも同じ色)。
2. **逐語で握る `tavern.html` の行 = 14 行**(変異 12 本・`switchdead` は 3 行)。**`tavern.html` を触るチケットはこれを数える**(`(0e)` が素でも赤で見える = `verify_bolt_aim` と同じ)。
3. ポート: **10401〜10413 を使用**。`tools/*.js` で 10384 以上の数字を持つのはこの本の 10401 / 10413 だけ(実測)。⭐ 次の新規ドライバは **10441 以降**(項目1〜2c のプローブが 10414〜10440 を実使用 = #71 の「プローブが使った帯を空きと書かない」に倣う)。
4. `verify_mercenary_roster`: (0c) のラベルの括弧が変わった(指紋は不変・差 0)。`--negative` の既知の揺れ((2e)(2z3) の差 4・在籍 8〜12)は本項目と無関係。
5. 乱数に依存する assert は (1a)(1b) の新顔の Lv(値は何でもよい = 振られたことだけを見る)と (3a)(3b) の被覆(1 職 15 名 × 約 400 回で漏れる確率 ≈ 0)だけ。卓の顔ぶれ ((1c)(1d)) と (2g) は乱数を固定している。

### 12-1. 総括(項目5 / 2026-09-23・実装窓 セッション `b34987cb-…`)— 母集団の非退行 + 全体の総括 + 台帳

⚠ 走査は **2026-09-22 08:15 に開始 → 09:3x にユーザー指示(PC シャットダウン)で 54 腕めで中止 → 2026-09-23 19:16 に再開 → 22:49 に完走**。
中断の間に HEAD は `92f0867` → `19d9ef1`(起草窓の #73 依頼書の**新規追加 1 本だけ**)へ進んだが、**本番 3 ファイル・`js/`・`tools/` の blob は `92f0867` と同一**
(当 worker が再開時に追試)⇒ **blob 比較の正は `92f0867`**。再開時に作業ツリー clean・`py -m http.server 8765` を立て直し、
配信物 8 本(`tavern.html` / `index.html` / `audio.js` / `js/` 2 本 / `town.html` / `world.html` / `title.html`)が作業ツリーと **sha256 でバイト一致**することを確かめてから走らせた。

#### (a) 母集団の非退行 — 結果

| 項目 | 実測 |
|---|---|
| 母集団 | **60 本 / 85 腕**(⛔ 本数は `item5/pop72f.py` で最終 HEAD から導出。段1 **22** / 段2 **49** / 段2b 24 / 段3 5 / 段3' 9 の union = 60。字義どおりの 3 段なら 52。`tools/*.js` **150 本**中 **90 本**が圏外)。項目1 の 59 本 83 腕 + 新設 `verify_member_identity` の素 / `--negative` = **増えた本 1・減った本 0** |
| 走行 | **85 / 85 腕・未走行 0**(直列・⛔ `timeout` で包まない)。所要 **289.1 分**(中断前 54 腕 76.3 分 + 再開後 31 腕 212.8 分) |
| 打ち切り | **1 腕** = `probe_party_size`(600 秒・自力で終わらない。**基準も同じ扱い**で exit 1 / 600.2 秒) |
| 判定行 / assert id | 今回の総数 **7,801 行 / 7,491 id** |
| **経路①**(assert id の指紋) | **差 8**(新 FAIL id **2** / 消えた id **0** / 増えた id **0**) |
| **経路②**(判定行の多重集合) | **生の行差 8** = **構造差 8 + 値差 0**(⛔ 正規化して消さず分類。恒等式 `生の行差 = 構造差 + 値差` を腕ごとに assert) |
| 群ごと | intended **構造 2 / 値 0** ・ flaky **構造 6 / 値 0** ・ **third(第三者の golden)構造 0 / 値 0** ⭐ これが「緑→赤 0」の最も強い根拠 |
| 基準と完全一致 | **81 / 83 腕** が「2 経路とも差 0 **かつ** exit も同じ」 |
| 非 0 exit | **8 腕**(基準は 7 腕)。増えた 1 腕 = `driver_monsters_griffon`(既知フレーク・(b) で決着)。残り 7 腕は**基準と同じ** = `driver_action_priority --negative`(#35 以来)/ `driver_mapeditor` / `driver_mapeditor_painting` / `sweep_recruit_balance` / `driver_monsters_umberhulk` / `probe_party_size` / `driver_party_view_reopen --negative` |
| 新設ドライバ(母集団の新規 2 腕) | `verify_member_identity` 素 **exit 0・28/28 PASSED FAILED 0**(157.1 秒・判定行 40)/ `--negative` **exit 0・12 本すべて担当ラベルが赤くなった(空振り 0)**(216.1 秒・判定行 168) |

##### 差のある腕は 2 つだけ(⛔ 散文でなく `cmp72f.json` から引いた)

| 腕 | 群 | exit | 経路① | 経路② | 中身 |
|---|---|---|---|---|---|
| `driver_monsters_griffon`(素) | flaky | **1**(基準 0) | 6 | 6 = 構造 6 + 値 0 | `(3) swoop` ×2 + `(4) 回帰 ミノタウロス` が PASS→FAIL(17/17 → 14/17)⇒ **(b) で決着** |
| `verify_mercenary_roster --negative` | intended | **0**(基準 0) | 2 | 2 = 構造 2 + 値 0 | **装置 assert `(2z3)`**「主人公 Lv・名簿 Lv の状態を実際に作れて、スロット数が違う」が **FAIL→PASS**(= 基準側が赤かった向き)。総括行は両方 `--negative OK: 10 本とも担当ラベルが赤くなりました (空振り 0)` で**同一**。名簿の抽選(在籍 8〜12)に依存する既知の揺れ(項目3 で観測済) |

- ⭐ **項目4 が予想した「(0c) のラベルの括弧を変えても指紋は動かない」は的中**(` — ` の後ろなので `id_of` が落とす)。実測でも `verify_mercenary_roster` **素**は差 0、`--negative` で動いたのは `(0c)` ではなく `(2z3)` だった。
- ⚠⚠ **`verify_mercenary_roster --negative` は既知フレーク 9 本の一覧に入っていない**が、装置 assert が乱数の名簿抽選に依存するため色の内訳が揺れる。⇒ **次のチケットへの申し送り = 既知フレークは 9 本 + この 1 腕**(exit は揺れないので「赤い本」ではなく「内訳が揺れる腕」)。

##### 圏外(`in_pop72=no`)の確認 — アンカー走査の判定を実走で裏取り

`item5/anchors72_final.py`(引用符 3 種を**独立に**走査・14 字以上)は「`0e8370d` → HEAD で出現回数が動いたリテラルの持ち主 **11 本**、うち母集団の外は `driver_field_step7` / `verify_bolt_bounce` の **2 本**だけ。どちらも動いたのは `'lightning-bolt'`(= 呪文 ID・`index.html` 用)」と出した。⛔ 机上で「圏外だから安全」で済ませず、**3 腕を実走**した:

| 腕 | exit(基準) | 秒(基準) | 経路① | 経路② |
|---|---|---|---|---|
| `driver_field_step7`(素) | **0**(0) | 245.2(245.3) | **0** | **0** |
| `verify_bolt_bounce`(素) | **0**(0) | 7.9(8.0) | **0** | **0** |
| `verify_bolt_bounce --negative` | **0**(0) | 67.0(67.1) | **0** | **0** |

⇒ **3 / 3 腕とも差 0**。母集団の切り方(`item5/pop72f.py` の 3 段)は**この 2 本を落として正しかった**ことが実走で裏付いた。

#### (b) 色が動いた腕の決着 — `driver_monsters_griffon`(素)

**結論 = 既知フレーク。#72 由来ではない。** 根拠を 3 本立てた(⛔ 再走の色だけで決めない)。

**① 構造(いちばん強い)**: 赤くなった 3 本の assert はすべて **`pageA` = `index.html?autoplay=20&magesleep=0`** の上で判定される(`tools/driver_monsters_griffon.js:160`)。
`index.html` が読み込む外部ファイルは `audio.js` + `js/` の 7 本(`abilities` / `skill-check` / `save-slots` / `hero-classes` / `class-sight` / `player-sheet` / `df-mapdef`)で、
**`index.html` 本体を含む 9 本すべての blob OID が `0e8370d` と HEAD で同一**(実測)。#72 が触った `js/` 2 本(`mercenary-roster` / `recruit-candidates`・**コメントのみ**)は
`tavern.html` だけが読み、`index.html` は読まない。⇒ **`pageA` のバイト面は #72 の前と 1 バイトも違わない = この 3 本の assert は #72 の変更を原理的に見られない**。
なお `tools/driver_monsters_griffon.js` 自身も `0e8370d..HEAD` で **0 ファイル**(触っていない)。

**② 再走 + 凍結指紋**: HEAD の木で再走 2 回とも **赤**(15/17・凍結指紋との差 経路① 4 / 経路② 4)⇒ **再走だけでは切り分けられない**(#69 の教訓どおり)⇒ ③ へ。

**③ 影のツリー**(`item5/shadow0e8370d/`): `tavern.html` を **`0e8370d` の版(git の LF を CRLF へ戻してバイト一致を確認)** に差し替え、
`js/` 2 本も `0e8370d` へ戻し、**`tools/` は実体コピー**(187 本・シンボリックリンク不可)、`assets/` だけジャンクション。
`index.html` / `audio.js` / `town` / `world` / `title` / `js/` は HEAD と sha256 一致(= どのみち `0e8370d` と同一)。

| 走行 | HEAD の木 | 影(#72 の前) |
|---|---|---|
| 単独で 5〜6 回 | 14 / 15 / 15 / 15 / 15 / 17 | 17 / 14 / 14 / 17 / 17 |
| **交互に 4 組**(機械の状態のドリフトを相殺) | 17 / 15 / 15 / 14 | 15 / 14 / 14 / 15 |
| 合計 | **10 走行中 緑 1**(17/17) | **9 走行中 緑 3** |

- ⭐⭐⭐ **両側とも緑にも赤にも転ぶ**。しかも赤いときの**ラベルと数値は完全に同一**:
  `❌ (3) swoop: グリフォン が rear/mid を実際に狙う (>=1回) — grifRearMid=0/8` /
  `❌ (3) … grif=0/8(0.00) vs mino=0/0(0.00)` / `❌ (4) 回帰: … front=null rear=null (entries=0)`。
- ⭐ **赤の正体は「装置が 1 件も観測できなかった」**(`entries=0` / `mino=0/0`)= 挙動の退行ではなく**採取の取りこぼし**。⚠ 単独走行では影が緑寄り・交互では両方赤寄りで、**機械の負荷に連動**する。
- ⚠⚠ ⇒ 「HEAD が 10 回中 9 回赤・影が 9 回中 6 回赤」という**率の差**は残るが、①(バイト面が同一)により **#72 に帰属させる経路が存在しない**。⭐⭐⭐ 教訓 = **率の差だけでは帰属できない。帰属は「その assert が触れているバイトが動いたか」で決める**。

#### ⇒ **結論: #72 由来の緑→赤は 0 件**(第三者の golden の構造差 0 行 / 意図した差は新設 2 腕のみ / 色が動いた 1 腕は ①②③ でフレークと決着)

#### (c) コミットの一覧(`5f97978` 〜 本コミット・全部未 push)

| コミット | 項目 | 触ったファイル | 要点(1 行) |
|---|---|---|---|
| `5f97978` | 1 | 本 `.md` | 着手前の基準取り(母集団 59 本 83 腕・#71 の実測 TSV を blob OID の追試で流用)+ §2-1 の表を 4 腕とも再現 + 論点①②の実測。崩れた主張 12 件 ⇒ ユーザー判断 (α)(β)(γ) へ |
| `f5fe8bc` | 2a | `tavern.html` + `.md` | **柱2** 引き出しの判定 Lv を本人へ(同職は最も低い Lv)+ (α) 呪文表の levelReq 同期 + (β) 新顔の Lv をマッチング画面で確定 + 撤退 `?drawerlv=0` + changelog 2 行目 |
| `fcde6a9` | 2b | `tavern.html` + `.md` | **柱1** カードの職業行 / 引き出しの見出し / 声掛け(名簿の顔だけ)に Lv + 撤退 `?whois=0` + (β) の有効条件を whois へ + 僧侶の自動配分も最低 Lv(⚠ 副作用あり → 2b2)+ changelog 1 行目 |
| `a79ae83` | 2b2 | `tavern.html` + `.md` | 2b の副作用の直し: カードの「技」行は本人の Lv / 傾向の候補は主人公 Lv のまま(保存値を消さない)+ 同職の注記を同じ幅で言い換え + changelog 2 行目を進化 |
| `58e7eaa` | 2c | `tavern.html` + `.md` | **柱3** 職業別の名前表 6 職 × 15 名 + 名簿・約束の名前を新顔に使わない + 撤退 `?namejob=0` + changelog 1 行目を進化 |
| `3be110c` | 2c 追補 | `.md` | `probe_s2_clear` をコミット後の clean な木で再走(exit 0・基準と差 0) |
| `249af2f` | 3 | `tools/` 5 本 + `js/` 2 本(コメントのみ) | 型1 の赤 3 本の言い直し(測定点の移動 + 装置条件の追加・期待値とラベルは不変)+ 腐ったコメント 5 箇所 |
| `837d36d` | 3 追補 | `.md` | 着手前の色 / 言い直しの前後の逐語 / 最終の色(13 腕すべて exit 0・基準と差 0) |
| `49b82cc` | 4 | `tools/verify_member_identity.js`(新規)+ `tools/verify_mercenary_roster.js` 2 行 + `.md` | 受入 素 28/28・`--negative` 12/12 + `(0c)` のラベルの括弧を事実へ |
| `92f0867` | 4 追補 | `.md` | コミット後の clean な木で 素 3 回 28/28(指紋 差 0)/ `--negative` 12/12 |
| 本コミット | 5 | `.md` + `実装依頼書/README.md` の `\| 72 \|` 行 | 母集団の非退行(本節)+ 台帳 |

- 本番の差分の総量(`0e8370d..92f0867`): `tavern.html` +269 / −26(純 CRLF・10,751 → 10,994 行)/ `index.html`・`audio.js` は **0**(blob `6b5cf38` / `b3aaa1f` のまま)/ `js/` 2 本はコメントのみ / `tools/` 5 本の言い直し + 新規 1 本。

#### (d) ユーザー決定と、親が途中で足した判断

| # | 決定 | 由来 | 実装 |
|---|---|---|---|
| (α) | 酒場の呪文表 `MAGE_SKILLS_UI` を **本体に合わせる**(fireball 3 / LB 3 / cone-of-cold 5) | 項目1 の崩れた主張 1〜4(鏡に `levelReq` が無く、LB は常に Lv1 扱い = 柱2 だけでは `[Lv3 必要]` が一度も出ない) | 2a。撤退 `?drawerlv=0` で 3 行から外す |
| (β) | 新顔の Lv は **マッチング画面で決め、出発では振り直さない**。酒場の声掛けでは **名簿の顔にだけ** Lv を出す | 項目1 の崩れた主張 5〜8・11(新顔は出発の瞬間まで Lv を持たない) | 2a(抽選は `assignCompanionLevels` そのもの)+ 2b(有効条件 = `isDrawerLvOn() \|\| isWhoisOn()`) |
| (γ) | 同職が複数いるとき、引き出しの判定と枠の上限は **その職の最も低い Lv** | 項目1 の論点①(同職 2 人は既定経路でも起きる) | 2a(`lowestLevelOfClass`)。注記は 2b2 で「⚠ 魔法使い 2 人に共通・判定は低い方の Lv2」 |
| 親 1 | 2b に **僧侶の自動配分(`apEquippedIdsFor`)も最低 Lv** を同梱 → **副作用**(保存済みの傾向が `null` に書き戻され消える / 主人公のカードまで低 Lv の集合 / カードが縮む)→ **2b2 で直した**: カードの「技」行は本人の Lv・傾向の候補は 2a と同じ主人公 Lv(保存値を消さない) | 2a の申し送り (7) | 2b → 2b2。⭐ 2b は未 push のまま 2b2 で直したので、プレイヤーは副作用を一度も見ていない(changelog にも書いていない) |
| 親 2 | 柱3 の除外に **約束(`DFRecruits`)の名前も入れる**(依頼書 / 親の指示は「名簿の名前」) | 2c の worker の拡張。`DFRecruits.has(name)` は名前引きなので、約束した新顔と同名の別人が卓に座ると 🤝 が付く | 2c(`namesTakenTV` の約束の行)。受入 (3b') と変異 `noexcl` が網 |

#### (e) 崩れた主張 — 累計 **46**(項目1 **12** / 2a 3 / 2b 7 / 2b2 5 / 2c 6 / 3 6 / 4 3 / **5 4**)

| # | 主張 | 実測 |
|---|---|---|
| 1 | 項目4 の申し送り 3「次の新規ドライバは **10441 以降**」 | 起草窓が #73(`実装依頼書/2026-09-21_pen-narration.md`・`19d9ef1` でコミット済)で **base 10441 / 変異 10442〜10450 を予約**した。⇒ **#73 の次に起こすチケットは 10451 以降**。⭐ 根 = 「空き番号」は他窓が同時に予約しうる = **測った瞬間に古くなる要約** |
| 2 | キュー「母集団の全数直列再走は #71 で 363.4 分(158 腕)。⇒ **項目5 は 6 時間超**を見込む」 | 実測 **289.1 分 = 4.8 時間**。⚠ **腕あたりは逆に遅い**(#71 = 2.30 分/腕 → #72 = **3.40 分/腕**)が、腕数が 158 → **85** と少ない。⭐ 根 = 母集団の広さを見ずに前チケットの総分数を写した |
| 3 | キュー「⚠ 既知フレーク **9 本**」 | `verify_mercenary_roster --negative` も**色の内訳が揺れる**(装置 assert `(2z3)` が名簿の抽選 = 在籍 8〜12 に依存)。exit は揺れないので「赤い本」ではないが **2 経路の差としては出る** ⇒ 一覧は「**exit が揺れる 9 本** + **内訳が揺れる 1 腕**」と言い直す |
| 4 | 再開メモ / 親の指示「2 回とも赤なら **影のツリー**で『#72 の前でも同じ色か』を確かめる」(= 影が二値の答えを返す前提) | **影も緑と赤の両方に転んだ**(9 走行中 緑 3)。⇒ 影のツリーだけでは決着しない。決着したのは **①「その assert が触れているバイトが `0e8370d` と同一」という構造の証明**。⭐⭐⭐ 根 = **非決定な本には「基準の色」という単一の値が存在しない**(影は「もう一方の分布」を見せるだけ) |

#### (f) 残った穴(⛔ 本チケットでは直さない・次の起草の材料)

| # | 穴 | 出所 | 影響 |
|---|---|---|---|
| 1 | **名簿に残る旧規則の同名の顔** | 項目2c(移行しない決定・依頼書 §11)。実測: 既存 8 人に同名の組 1 | `DFRecruits.has(name)` は名前引きなのでその組だけ 🤝 が曖昧。**新しく作られる顔からは二度と生まれない** |
| 2 | **声掛けダイアログが 390px で 8/120 組 折り返す** | 項目2b(desktop 2 画面は不変・縦持ち 2 画面で 8/120) | 見た目だけ。⛔ 直すなら別の版(Lv を名前の行へ / 性格を省略)をユーザーに諮る |
| 3 | **傾向(自動配分)の候補は主人公 Lv のまま** | 項目2b2(2b で本人 Lv にしたら**保存済みの傾向が消える**退行 ⇒ 戻した) | 僧侶の「候補」は主人公 Lv の集合。カードの「技」行と引き出しの判定は本人 Lv(是正済み) |
| 4 | **`index.html` の `NPC_NAMES` の写し**(`:13448` / `pickUniqueName` `:13478` / `makeNpcMember` `:13484` / `buildParty` `:13493`) | 項目2c。依頼書 §3 で `index.html` は範囲外 | 到達するのは `sessionStorage` の `partyMembers` が無い / 壊れているときのフォールバックだけ(呼び口 `:34991` の 1 件)。そこだけ旧・共有プール |
| 5 | **仲間の Lv 抽選の帯(`[2,4]` 等)** | 依頼書 §11(やらないこと) | バランスの話。#61 の「難易度・XP」の宿題と同じ束 |
| 6 | **名簿パネルの保存 Lv と clamp 後の Lv の食い違い** | 項目2b の崩れた主張 4 | `.mrMeta` は保存値(例 Lv9)、カード / 見出し / 声掛けは clamp 後(主人公 Lv7 なら Lv7)。⇒ **名簿 Lv > 主人公 Lv のときだけ** 2 つの表示が違う |
| 7 | **(β) の「覚え」はページの中だけ** | 項目2a(`:722`) | 酒場を出て(街 / 地図へ)戻ってから同じ依頼を受け直すと Lv は振り直される。同じ訪問の中(#60 の「酒場へ戻る」)では振り直さない |
| 8 | **受入に専用の変異が無い 4 つ**(`notesw` / `notelv` / `dialoglv` / `rerolldepart`) | 項目4(ポート 12 本の上限) | (2f) の注記・(1c) の声掛け・(2g) の「振り直さない」の半分は **腕の間の対照**だけが網(assert 自身が持つ) |
| 9 | ⚠⚠⚠ **LB の `[Lv3 必要]` は、実機の既定では見えない** | 項目1 の崩れた主張 1〜4 | `DEFAULT_KNOWN.mage` にライトニングボルトは無く、入手はボス巻物のみ(依頼書 §11 で「足さない」と決定)⇒ **巻物で習得していない限り一覧に出ない**。既定で `[Lv3 必要]` が見えるのは **僧侶 Lv2 のターンアンデッド / ホールド・パーソン**(エルフ Lv2 は枠 2 で＋が全部無効)。⭐ §9 の 2 を書き直した根拠 |

#### (g) 実機 / 実感の確認 — **§9 を実装後の事実へ書き直した版**

⚠ **`http://127.0.0.1:<port>/tavern.html` で開くこと**(`file://` 直開きはナレーション音声が無音になる。`py -m http.server`)。

| # | 見るもの | どう見えれば OK | ⚠ 注意 |
|---|---|---|---|
| 1 | **マッチング画面のカード** | 4 枚の職業行が「**職名 Lv◯**」(Lv だけ淡い金 `#e8dcc0` の太字)。主人公も「戦士 Lv7」のように出る | 名前の行(`.pmName`)は従来どおり。カードの高さは着手前と同じ |
| 2 | **引き出しの見出し** | カードを開くと「**職名 — 名前 Lv◯**」(主人公は「— あなた」)。Lv は**開いた本人**の Lv | 名簿の顔の保存 Lv が主人公 Lv を超えるときは主人公 Lv に丸めた値が出る((f) 6) |
| 3 | **Lv 不足の呪文が置けない** | ⚠⚠⚠ **ライトニングボルトでは既定では確かめられない**((f) 9)。⇒ **僧侶**の仲間が Lv2 で来た回に引き出しを開き、**ターンアンデッド / ホールド・パーソン**が `[Lv3 必要]` になって **＋ が押せない**こと。エルフ Lv2 なら枠が 2 なので既定配分 3 個で **＋が全部無効** | ライトニングボルトで見たいなら、先に**ボス巻物で習得**しておく(`DEFAULT_KNOWN.mage` に無いのは仕様・依頼書 §11) |
| 4 | **名前とジョブが固定** | 数回出撃して、**同じ名前の別職が出てこない**こと。さらに **名簿の仲間 / 同行を約束した相手と同じ名前の新顔も出ない** | 名簿に**着手前から**居る同名の組はそのまま残る((f) 1) |
| 5 | **酒場の声掛け** | 一度一緒に戦った顔(名簿の顔)だけ「**職名 Lv◯ — 性格**」。初めての顔は従来どおり「職名 — 性格」 | 390px の縦持ちでは 120 組中 8 組で役割の行が 2 行に折り返す((f) 2) |
| 6 | **Lv は出発で振り直されない** | マッチング画面で見えた Lv のまま出撃し、戦闘中の仲間の強さがカードと一致する | 酒場を出て戻ると振り直される((f) 7) |
| 7 | ⭐ **「置いたのに撃たない」が消えた** | Lv 不足の呪文は**置けない**ので、出撃後に黙って外れることが無い | 本チケットは**置けるかどうか**まで。撃ち方は #71 |
| 8 | **撤退スイッチ** | `?whois=0` = Lv 表示だけ戻る / `?drawerlv=0` = 判定 Lv が主人公へ戻る(+ 呪文表の `levelReq` も戻る)/ `?namejob=0` = 名前が共有プールへ戻る。**3 本とも 0** にすると着手前と同じ DOM | ⚠ 新顔の Lv をマッチング画面で決めるのが止まるのは **`?whois=0` と `?drawerlv=0` の両方が 0** のときだけ(`isEarlyLevelOn()`) |
