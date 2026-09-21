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
