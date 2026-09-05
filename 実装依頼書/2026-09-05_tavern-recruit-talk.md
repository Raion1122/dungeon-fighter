# #54 酒場で声を掛けて仲間にする + 魔法使いのスリープ常備

- **起草**: 2026-09-05(計画窓) / **ステータス**: **承認済**(2026-09-05 ユーザー承認)
- ⚠ **起草時の禁止事項を 1 件、承認時に訂正**: §11 に「`実装依頼書/README.md` への行追加は
  #53 着地後」と書いたが、承認の時点で #53 は `04cfd45` で**着地し push 済**・作業ツリーの
  `README.md` に差分なし ⇒ **保留の理由(衝突)が存在しない**ので**即追加した**。
  ⛔ 黙って破ったのではなく、根拠を残して訂正している(索引に無いチケットは忘れられるため)。
- **会議**: `dev-meetings/2026-09-05_next-step-54.md`(第1段の候補 4 件 + 第2段の開発計画書)
- **触るファイル**: `index.html` / `tavern.html` / `js/recruit-candidates.js`(新規) /
  `tools/verify_recruit_talk.js`(新規)
- ✅ **着手可能**(2026-09-05 12:1x 実測)。#53 は `04cfd45` で **STEP1〜4 が全着地**し、
  `index.html` / `tavern.html` を**離した**(`git status` = クリーン)。
  ⚠ ただし #53 は**未 push**で実機確認 6 項目が残っている ⇒ 実装窓が同じファイルに戻る可能性はある。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit(§3)。
- ⛔ `ROOM_PAINTINGS_DEF` / `tools/make_grid_map.py` の `GRIDS` / `nodeSpawnsFor` /
  `js/df-mapdef.js` は **1 バイトも触らない**(#53 の領分)。

---

## 1. 目的

同行 NPC は**出発ボタンを押した瞬間に勝手に決まる**。名簿(#38 `DFRoster`)に顔は残るのに、
プレイヤーは「この人を連れて行く」と**指名できない**。一方で酒場には冒険者が 4 人立っているのに、
彼らは `say:` の一言を返すだけで仲間にはならない。**この 2 つが繋がっていない。**

あわせて、序盤の魔法使いが**スリープを撃てない**。呪文も関数も実装済みで、Lv1 の呪文枠も 3 個あるのに、
**`DEFAULT_KNOWN.mage` に sleep が無く `isSpellKnown` の完全ゲートで落ちる**うえ、
枠は `magic-missile ×2 + fire-bolt ×1` で埋まりきっている(§2-3)。

**ユーザー決定(2026-09-05)**:

- ⭐ **声を掛けるのは「受注前」。** 先に酒場で声を掛けて**次の冒険の同行候補**にし、受注すると
  マッチング画面にその顔が映る。
  ⭐ 不採用になった案 = 「受注後に酒場へ戻って誘う」(受注は `openPrep` の中で
  ナレ → マッチング演出 → 準備画面と一気に進み、酒場の地図へ戻る隙が無い。§2-4)
- ⭐ **誘えるのは「今日卓に居る 4 人」**(`patronA`-`D`)。
  ⭐ 不採用 = 名簿 12 人を全員並べる案(出発前の作業が「12 人を吟味する人事画面」になる)
- ⭐ **一人でも潜れてよい。** 誰も誘わずソロで出発できる。
  ⛔ 「誰も連れずに出発できない」ゲートは**作らない**
- ⭐ **クエストクリア後にいったん解散**(候補はクリア。名簿には残る)
- ⭐ **出発準備画面の廃止は #55 へ切り出す**(§11)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 参照先(⚠ 行番号は動く。**識別子で引くこと**)

⚠⚠⚠ #53 が `index.html` / `tavern.html` を STEP1〜4 で伸ばし続けている。
**行番号を書いても着手時にはズレる。** 下表の左列は `grep -n` の当て先であって行番号ではない。
参考行は **`dc41303` 時点**。

| 引く識別子(`grep -n` の当て先) | ファイル | 何 | 参考行 |
|---|---|---|---|
| `function skillSlotsForLevel` | index.html | 枠カーブ(⚠ tavern.html にも**二重定義**) | 12244 |
| `const SKILL_SLOT_CURVE` | index.html | `[0,1,1,2,2,3,3,4,4,5,5]` | 12243 付近 |
| `const heroSkillSlots = skillSlotsForLevel(` | index.html | 主人公の暫定枠(⚠ **warrior 固定**) | 21759 |
| `? skillSlotsForLevel(headLevel) : 3;` | index.html | 頭の枠 | 33330 |
| `ally.equippedSkills = ally.equippedSkills.slice(0, skillSlotsForLevel(` | index.html | ⭐ **最終の切り詰め** | 33408 |
| `"sleep": {` | index.html | `MAGE_SKILLS` の中身 | 21129 付近 |
| `const hasSleep = ally.equippedSkills.includes("sleep")` | index.html | 既存の読み口 | 28533 付近 |
| `defaultSkills: ["magic-missile", "fire-bolt", "arcane-shield"]` | index.html | mage の初期スキル | 20932 付近 |
| `function recruitCountOf` | tavern.html | 応募人数(⚠ `MIN = 1`) | 4173 付近 |
| `function buildParty` | tavern.html | 主人公 + NPC を組む | 4236 |
| `function regeneratePartyMembers` | tavern.html | ⭐ **`buildParty` の唯一の呼び口** | 6031 |
| `selection.partyMembers = orderFormation(buildParty(` | tavern.html | 実体の代入 | 6041 |
| `async function openPrep` | tavern.html | 受注 → 準備画面 | 5613 付近 |
| `function playPartyMatchCinematic` | tavern.html | マッチング演出 | 7685 |
| `const PM_SETUP_ON` | tavern.html | #35 撤退(⭐ **既定 ON**) | 6639 |
| `function renderRecruitCountLine` | tavern.html | 「この依頼に応じた冒険者: N 人」 | 6045 付近 |
| `(function initNpcCrowd` | tavern.html | 酒場 NPC の生成(⭐ **click 済み**) | 8966 付近 |
| `var TAVERN = [` | js/npc-crowd.js | 酒場 NPC 8 人の配置 | 38 |
| `global.DFRoster = {` | js/mercenary-roster.js | 公開 API | 238 |

**再測定コマンド**:

    git show HEAD:index.html  > /tmp/idx.html && grep -n '<識別子>' /tmp/idx.html
    git show HEAD:tavern.html > /tmp/tav.html && grep -n '<識別子>' /tmp/tav.html

⚠⚠⚠ **別窓が編集中なので、作業ツリーを `grep -rn` してはいけない。**
この窓は実際に一度やって WIP 込みの行番号を掴んだ(21787 と出たが HEAD では 21759)。
**必ず `git show HEAD:` 側で測る。**

### 2-2. ⚠⚠⚠ 罠 A — `partyComposition` は後方互換の写し。正は `partyMembers`

    tavern.html  let partyComposition = ["warrior"];   // 主人公のみ (仲間は出発時にNPC自動編成)
    tavern.html  if (hero) partyComposition = [hero];   // 先頭=主人公だけ採用
    tavern.html  // 新方式: rich なパーティ構成(隊列順 [0]=頭)を渡す。partyComposition は後方互換で classKey 配列を併記
    tavern.html  sessionStorage.setItem("...partyComposition", JSON.stringify(selection.partyMembers.map(m => m.classKey)));

⇒ **`partyComposition` は主人公 1 人しか保持しない。** 誘った仲間を積む先は
**`selection.partyMembers`**(rich = 名前・職業・Lv・variant を持つ)。

⭐ **他チケットが既に同じ罠を踏んで注記を残している**:

    tools/verify_road_ambush.js
      ⛔ partyComposition で代用しない (職業キーだけでは rich な編成にならない = 依頼書 §5-3)
    js/road-events.js / world.html にも同趣旨

⇒ §8 の負のコントロール `compnotmembers` として装置に内蔵する。

### 2-3. ⚠⚠⚠ 罠 B — 魔法使いは **`SKILL_SLOT_CURVE` の管轄外**。関門は `isSpellKnown` の完全ゲート

⛔⛔ **起草時の記述は誤りだった**(実装窓が STEP0 で実測して訂正。予測のほうを訂正している)。
誤: 「Lv1 の枠は 1 個。slice が 4 箇所あるので、slice の後に足し戻す」
正: 以下のとおり **別系統**であり、slice は mage に 1 度も効かない。

| 項目 | 実測 |
|---|---|
| `SKILL_SLOT_CURVE` の適用先 | **マーシャル職のみ**(`["warrior","dwarf","rogue"].includes(...)` が 3 箇所。うち 1 つは `if (!...) continue`) |
| キャスターの頭の枠 | **3 固定**(`headSkillSlots` の三項演算子の else 側) |
| 魔法使いの呪文枠の正 | **`SPELL_SLOT_CURVE_MAGE = [0,3,4,5,6,8,9,10,12,13,15]`** ⇒ **Lv1 は 3 枠** |
| 本当の関門 | **`isSpellKnown` の完全ゲート**(6 箇所)。`DEFAULT_KNOWN.mage` に sleep が無い |
| Lv1 NPC 魔法使いの実体 | **`{magic-missile: 2, fire-bolt: 1}`**(arcane-shield は枠が尽きて 0) |
| MP | **Phase 2-J で廃止**。`sleep` の `mpCost: 6` は名残で障害ではない |

⭐ 同じ鎖(`knownSpells` → `partySkills` → `allocMap` → `equippedSkills`)は
**#50 の `tools/verify_cone_cast.js:618-650` が既に文書化**しており、バーニングハンズで同じ穴を踏んでいる。

⭐⭐⭐ **一般形の教訓**: CLAUDE.md §2-1「その語で grep して 0 件」を未実装の根拠にするな、には**裏返し**がある —
**「その語で grep して N 件あっても、その N 件が対象に効くとは限らない」**。
呼び口を数えたら、**その呼び口のガード条件まで読む**こと。起草はこれを怠って §2-3 を丸ごと外した。

#### ⚠⚠ 実装窓が追加で見つけた「写し」2 件(⭐ index.html だけ直しても片手落ち)

| 写し | 場所 | 効く相手 |
|---|---|---|
| `DEFAULT_KNOWN_TV` | `tavern.html`(「index.html DEFAULT_KNOWN と同期」と自ら明記) | 酒場の巻物一覧の `[習得済み]` 表示 |
| `PARTY_SLOTS[mage].defaults` | `tavern.html` | `selection.partySkills.mage` の初期値 = **主人公が魔法使いのときの権威** |

⚠⚠⚠ さらに **`partySkills` は localStorage に永続化**され、読み込み時に `slot.defaults` を
**置換する(和集合ではない)**。⇒ `defaults` を変えるだけでは **既存セーブに 1 ミリも効かない**。
⭐ `knownSpells` だけが「毎ロード和集合(自己修復)」なので、起草の「移行コードは不要」は
**knownSpells については正しく、partySkills については誤り**。

#### ⭐⭐⭐ 配分は「順序」で決まる。しかも **経路ごとに譲る呪文が違う**

呪文枠は先頭から `take = Math.min(n, upperCap - used)` で配られ、Lv1 は `upperCap = 3`。
⇒ sleep は **index 1** に挿す(末尾に置くと枠が尽きて**黙って落ちる**)。

| 経路 | 積み方 | 従来 | (A) 適用後 | 譲るのは |
|---|---|---|---|---|
| NPC 仲間(`defaultCasterMap`) | **2 枠ずつ** | `{mm:2, fb:1}` | **`{mm:2, sleep:1}`** | fire-bolt |
| 主人公(酒場の `partySkills`) | **1 枠ずつ** | `{mm:1, fb:1, as:1}` | **`{mm:1, sleep:1, fb:1}`** | arcane-shield |

⭐ 「同じ (A) でも譲る呪文が違う」のは積み方の差。⛔ 片方の実測をもう片方の根拠にしないこと。


### 2-4. 受注フローの実測(⭐ 声掛けを「受注前」にした理由)

    openPrep(sc):
      prepScenario = sc
      regeneratePartyMembers()          ← ★ここで仲間が抽選される
        let partySize = PARTY_SIZE (=4)
        if (isRecruitOn() && prepScenario) partySize = 1 + recruitCountOf(prepScenario)
        selection.partyMembers = orderFormation(buildParty(heroKey, partySize))
      renderPartyComposition() / renderPartyPreview() / renderCharTabs() / renderCharLoadout()
      await playQuestAcceptNarration(sc)     受注ナレ
      await playPartyMatchCinematic(sc)      ★マッチング演出(確定済みの仲間を順に開示)
      await maybePlayPrepOnboarding()
      prepEl.style.display = "flex"          準備画面

⇒ **受注すると準備画面まで一気に進み、酒場の地図へ戻る隙が無い。**
⇒ 声掛けは**受注前**にする(ユーザー決定)。

⭐⭐⭐ **マッチング演出は 1 行も変えなくてよい。** `playPartyMatchCinematic` は
「**確定済みの**仲間を順に開示する(乱数・編成は非改変)」ので、`selection.partyMembers` が
「誘った人」になっていれば**そのまま映る**。ユーザー要望「マッチングの画面で、先ほど声を掛けた
仲間が映る」は既存演出が満たす。

### 2-5. ⭐ ソロ(NPC 0 人)は `buildParty` の側では成立する

    function recruitCountOf(sc) { const MIN = 1, MAX = 3, ... return Math.max(MIN, Math.min(MAX, n)); }
    function buildParty(heroClassKey, partySize = PARTY_SIZE) {
      const members = [makeHeroMember(heroClassKey)];
      ...
      for (const zone of ZONE_ORDER) { if (members.length >= partySize) break; ... }

⇒ `recruitCountOf` の下限が 1 なので `partySize = 1 + 1 = 2` が今日までの最小 =
**主人公 1 人だけの潜行は今日まで一度も存在しない**。
⭐ ただし `buildParty(heroKey, 1)` を通せば `members.length >= 1` で即 break =
**主人公だけの配列が正しく返る**。`buildParty` 側の改修は不要。

⚠ **未確認 = 下流(index.html)が 1 人パーティを扱えるか。** STEP3 で実測すること
(隊列の zone 充足・`orderFormation`・`heroRef` / `heroIsHead` の分岐)。

### 2-6. ⭐ 人数表示は自動で正しくなる

    // ⛔ PARTY_SIZE (定数4) からも recruitCountOf() の再計算からも導かない。画面に出す数は
    //   **実体の selection.partyMembers そのもの** から数える。
    function renderRecruitCountLine(members) {
      const npc = (members || []).filter(m => m && !m.isHero).length;
      el.textContent = `この依頼に応じた冒険者: ${npc} 人`;

⇒ 誘った人数がそのまま出る。**この関数は触らない。**
⚠ ただし文言「この依頼に**応じた**冒険者」は募集モデルの言い回し。声掛けモデルでは
「**同行する**冒険者」の方が正しい ⇒ STEP4 で文言だけ検討(⛔ 数の出し方は変えない)。

### 2-7. 酒場 NPC の実測(⭐ 素材は揃っている)

`js/npc-crowd.js` の `TAVERN`:

| key | tile | 備考 |
|---|---|---|
| `keeper` | [11, 1] | 店主。⛔ 誘えない |
| `patronA` | [ 3, 3] | ⭐ **冒険者スプライト** |
| `patronB` | [ 4, 3] | ⭐ **冒険者スプライト** |
| `patronC` | [ 9, 5] | ⭐ **冒険者スプライト** |
| `patronD` | [10, 5] | ⭐ **冒険者スプライト** |
| `drunk` | [ 1, 5] | 酔漢。今回は誘えない(§11) |

> 酒場の客 4 人 (patronA-D) と drunk だけは「**客が冒険者なのは正しい**」ので据え置き。
> ⭐ 街からは冒険者が 1 人も居なくなった。 — `js/npc-crowd.js` の STEP4 注記

⇒ 2026-09-02 に街の NPC を町人 12 種へ差し替えた際、**酒場の 4 人だけ意図的に冒険者のまま
残されていた**。仲間候補の絵が既に卓に座っている。

**不変条件(⛔ 配置データを触らない理由)**:

- (I1) stand の tile は**歩けないタイル**でなければならない
- (I2) stand の tile は**マンハッタン距離 2 以内に歩けるマスを持つ**
- (I5) スプライト矩形が**どの札の矩形とも交差しない**(⚠ 既存 golden 4 本が
  「札の中心の `elementFromPoint` が自分自身」を測っている)

⇒ ⭐ **(I2) が保証されているので、立ち位置(`enter`)を手で書かなくてよい。**
実行時に「距離 2 以内の歩けるマス」を引けばよい。`verify_npc_crowd.js` が
既に (I2) を検査している(`/* 可視条件 = マンハッタン距離 2 以内に歩けるマスが 1 つ以上ある */`)。

⭐ **NPC は既にクリック可能**(`initNpcCrowd` 内に `el.addEventListener("click", ...)`)。
`say:` の一言を出す口が既にある = そこへ分岐を足すだけ。

### 2-8. `DFRoster` の公開 API(js/mercenary-roster.js)

    global.DFRoster = { KEY, CAP (=12), LEVEL_MAX, RUNS_PER_LEVEL,
                        enabled, load, save, all, enroll, recordRun, release, _wipe }

- **解散のタイミング** = 帰還時に `DFRoster.recordRun(r.roster.ids, r.roster.survived === true)`
  (`r.roster` が無い = `?roster=0` で潜った / 旧セーブ なら何もしない)
- ⛔ 名簿は**装備を持たない**(権威は `allyEquip[classKey]`)。「誰が来るか」だけ
- ⚠ `enroll` は新顔の登録。**新顔の生成は呼び出し側(`makeNpcMember`)の仕事**

⛔⛔ **前置詞 `dragonfighters.` を変えないこと。** `js/save-slots.js` の `keysOf()` が
前置詞総なめなので、これを守るだけで snapshot / wipeLive / switchTo が**コードを 1 行も
書かずに正しくなる**(mercenary-roster.js の冒頭が明記)。⇒ 同行候補のキーも同じ前置詞にする。

**候補の構造(合成値)**:

    localStorage["dragonfighters.recruitCandidates"]
      = [{ id: "mrc_0001", name: "<名前>", classKey: "cleric", level: 2 }]

### 2-9. changelog の要否

    scripts/hooks/check_changelog.py
      GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

⇒ **鳴る**(`index.html` と `tavern.html` を両方触る)。
⭐ **書けるプレイヤー向けの要約が実在する**(嘘をでっち上げる必要が無い):

- 「魔法使いが最初からスリープを唱えるようになった」
- 「酒場の冒険者に声を掛けて、次の冒険に誘えるようになった」

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/recruit-candidates.js` | **新規**。同行候補の保管庫(⛔ 前置詞 `dragonfighters.` を守る)。`js/mercenary-roster.js` と同じ作法 = HTML に写しを作らない |
| `tavern.html` | ① `<script src="js/recruit-candidates.js">` ② 今日の 4 人の抽選と着席 ③ NPC の click に勧誘分岐 ④ `regeneratePartyMembers()` が候補を優先 ⑤ 撤退 `?recruittalk=0` ⑥ changelog 1〜2 行 |
| `index.html` | ① mage の sleep 常備(slice の後段に 1 関数) ② 撤退 `?magesleep=0` |
| `tools/verify_recruit_talk.js` | **新規**。受入ドライバ(base port **9940** / 変異 9941〜9960) |

⛔ **`ROOM_PAINTINGS_DEF` / `tools/make_grid_map.py` / `nodeSpawnsFor` / `js/df-mapdef.js` は開かない**(#53 の領分)。
⛔ **`js/npc-crowd.js` の配置データ(tile / dx / dy)は 1 バイトも触らない**(§2-7 の不変条件と golden 4 本)。
⛔ **`renderRecruitCountLine` の数の出し方は変えない**(§2-6)。
⛔ **`playPartyMatchCinematic` は触らない**(§2-4。既存のまま要望を満たす)。

### ✅ 着手のタイミング(2026-09-05 12:1x に解けた)

⭐ #53 は `04cfd45` で **STEP1〜4 が全着地**し、`index.html` / `tavern.html` を離した
(`git status` = クリーン)。⇒ **着手可能。**

⚠ ただし #53 は**未 push**で、実機/実感の 6 項目が残っている。実装窓がその修正で
同じファイルへ戻る可能性はあるので、**着手直前にもう一度確認する**:

    git status --short          # index.html / tavern.html に M が無いこと
    git log --oneline -3        # #53 の STEP4 (04cfd45) が入っていること

⚠⚠ ファイル単位 add でも「相手が同じファイルを add する」事故は防げない。
M が付いていたら**着手を待つ**(⛔ `git add .` は常に禁止)。

### ⭐ #53 が `nodeSpawnsFor` に足したもの(実装窓からの申し送り)

`nodeSpawnsFor` に `applySwampNoviceOutcome` が **1 本**入った。
⇒ 本チケットは同関数を**触らない**方針なので衝突しないが、**触る必要が出たら先に一声かける**。

---

## 4. STEP1 — (B) 魔法使いのスリープ常備(`index.html`)

⭐ **枠カーブに 1 ビットも触らない。** slice を全部通した**後**に足し戻す。

    /* ★[#54] 魔法使いのスリープ常備。⭐ スキル枠 (SKILL_SLOT_CURVE) は 1 ビットも触らない。
     *   Lv1 の枠は 1 個しかないので、defaultSkills に足すだけでは slice で切られて効かない
     *   (依頼書 §2-3)。よって「slice の**後**に足し戻す」形にする。
     * ⛔ 一般機構にしない — 魔法使いの sleep 1 件だけの穴。職業ごとの常備スキルを作ると
     *   枠の意味が消える。
     * ⚠ 撤退 ?magesleep=0 で従来 (magic-missile だけ) へ戻る。 */
    const MAGE_SLEEP_ON = (() => {
      try { return new URLSearchParams(window.location.search).get("magesleep") !== "0"; }
      catch (e) { return true; }
    })();
    function withInnateSleep(classKey, skills) {
      if (!MAGE_SLEEP_ON) return skills;
      if (classKey !== "mage") return skills;
      if (!Array.isArray(skills)) return skills;
      if (skills.includes("sleep")) return skills;        // 既に入っていれば触らない (二重化しない)
      return skills.concat(["sleep"]);
    }

**呼ぶ場所 = §2-3 の 4 経路の末尾**(⚠ 4 箇所とも `withInnateSleep` を 1 回通す):

1. `const heroSkillSlots = ...` の枝(⚠ `WARRIOR_SKILLS` 固定なので mage では素通り。**確認だけ**)
2. 頭・酒場カスタム `partySkillsMap[leaderClassKey]...slice(0, headSkillSlots)`
3. 頭・クラス既定 `[...def.defaultSkills].slice(0, headSkillSlots)`
4. 仲間 `ally.equippedSkills.slice(0, skillSlotsForLevel(...))` ← ⭐ **最後に必ず通る**

⚠ 4 で通せば 2/3 は不要かもしれない。**実測して最小の呼び口数に絞る**
(⛔ 「念のため全部に入れる」をしない。呼び口が増えると二重化の事故が起きる)。

⛔ `defaultSkills` の配列は**触らない**(触ると酒場 UI の初期選択が変わり、#38/#35 の golden に響く)。

**STEP1 の完了条件**: Lv1 の魔法使い(主人公 / NPC 仲間の**両方**)が `equippedSkills` に
`sleep` を持ち、`magic-missile` も**失っていない**こと。`?magesleep=0` で従来へ戻ること。

---

## 5. STEP2 — 今日の 4 人を卓に座らせる(`tavern.html` / 新規 js。見た目だけ)

⭐ **まだ話しかけられない状態を先に作る。** 着席の抽選と、勧誘のロジックを分けて着地させないと、
赤が出たときに「抽選のせい」か「勧誘のせい」か切り分けられない。

- `DFRoster.all()` から 4 人を抽選して `patronA`-`D` の**見た目**(名前・職業)に反映
- ⭐ **名簿が空なら `makeNpcMember(classKey, usedSet)` で新顔を作る**
  (`regeneratePartyMembers` の既存の枝と同じ作法。「名簿が空なら必ず makeNpcMember に落ちる =
  従来と 1 バイトも変わらない」)
- ⛔ `tile` / `dx` / `dy` / `sprite` は**触らない**。差し替えるのは「誰が座っているか」だけ
- ⚠ 抽選の種は**酒場に入るたび**か**1 日 1 回**か → 起草の決定 = **酒場を開くたびに引き直す**
  (「今日は誰が来てるかな」がのぞく理由になる、という会議の狙いに合う)

**STEP2 の完了条件**: `verify_npc_crowd.js` が緑のまま(⚠ 配置を触っていないので当然だが、
**スプライトの差し替えで矩形が変わっていないこと**を測る)。

---

## 6. STEP3 — (A) 声を掛けて同行候補にする(`tavern.html`)

### 6-1. 撤退スイッチ

    /* ★[#54] 酒場の声掛け勧誘の撤退スイッチ。?recruittalk=0 で従来の自動編成へ戻る。
     * ⚠ 読むのはここ 1 箇所。分岐も「着席」「click 分岐」「regeneratePartyMembers」の 3 箇所だけ。
     * ⚠ dev チートではなく退避口なので __dfDevCheat では包まない。
     * ⚠ ページ遷移をまたがない (酒場ページ内で完結)。 */
    const RECRUIT_TALK_ON = (() => {
      try { return new URLSearchParams(location.search).get("recruittalk") !== "0"; }
      catch (e) { return true; }
    })();

### 6-2. 立ち位置は (I2) から実行時に導出する

⛔ `enter` を手で書かない。NPC の `tile` から**マンハッタン距離 2 以内の歩けるマス**を
探して、そこへ `walkTo(c, r, cb)` で歩く(`goToTable` と同じ型)。
⚠ 見つからなければ**その場で対話を開く**(`goToTable` の `if (!ok)` と同じ fail-open)。

### 6-3. 対話

既存の `#choiceDialog`(全選択ダイアログの共用器)を使う。⚠ 2 択:

- **誘う** → 承諾の台詞(「同道させてもらおう」「よろしくたのむ」等)+ 同行候補に追加
- **やめておく** → 何もしない

⚠ 上限 = **`recruitCountOf(sc)` ではない**。受注前なのでシナリオが決まっていない。
⇒ 起草の決定 = **上限 3 人**(`recruitCountOf` の `MAX` と同値。`MAX` を実体から読むこと。
⛔ 数字 3 を写経しない)。受注時に `recruitCountOf(sc)` が上限を下回ったら**先頭から切る**。

### 6-4. `regeneratePartyMembers()` が候補を優先する

    // 既存:
    //   selection.partyMembers = orderFormation(buildParty(heroKey, partySize));
    // ★[#54]: 候補が居ればそれを使い、居なければ **ソロ**(従来の自動抽選には落ちない)

⭐⭐⭐ **起草の決定 = 候補 0 人なら「ソロ」。従来の自動抽選には落ちない。**
理由 = 自動抽選が残ると「誘う意味が無い」。⚠ ただしこれは**大きな挙動変更**なので、
`?recruittalk=0` で従来へ完全に戻れることを STEP3 の完了条件にする。
⚠ ユーザーは「一人でも潜れてしまうで OK」と決裁済み(§1)。

⚠⚠ **積む先は `selection.partyMembers`(rich)。** ⛔ `partyComposition` に積まない(§2-2)。

⚠ 候補は帰還時にクリアする(= 解散)。⭐ 名簿 `DFRoster` には `recordRun` で残るので、
次の潜行でまた卓に座り得る。

**STEP3 の完了条件**: 誘った人がマッチング画面に映る / 誰も誘わなければソロで潜れる /
`?recruittalk=0` で従来の自動編成に戻る。

---

## 7. STEP4 — 台詞・表示・ドライバ・締め

- 承諾/辞退の台詞(⚠ セリフ吹き出しは**優先度 3 段 + クールダウンの単一キュー**。
  勧誘を最優先で差し込むと既存の雑談が詰まる ⇒ 実機で確認)
- 「あと何人誘えるか」の表示
- ⚠ `renderRecruitCountLine` の**文言のみ**検討(⛔ 数の出し方は触らない。§2-6)
- `tools/verify_recruit_talk.js` の完成 + 既存 golden の再測
- changelog 2 行

---

## 8. 受入条件 — `tools/verify_recruit_talk.js`(新規 / base port **9940** / 変異 9941〜9960)

測るのは「**誘った人が実際に潜行へ行くか**」と「**枠を触らずに sleep が入るか**」。
⛔ 演出の見栄え(台詞の間・吹き出しの位置)は測らない。

### §0 装置(先に母集団を確かめる)

- **(0a)** 卓に座っている冒険者が **4 人**取れていること
  ⭐ これが無いと「誰も誘えない = 全 assert が空振り」で永久緑になる
- **(0b)** 候補の一覧を**実体**(`selection.partyMembers`)から引いていること。
  ⛔ 表を写経しない

### §1 (B) スリープ常備

- **(1a)** Lv1 の**主人公**魔法使いの `equippedSkills` に `sleep` が入る
- **(1b)** Lv1 の**NPC 仲間**の魔法使いの `equippedSkills` に `sleep` が入る
- **(1c)** `magic-missile` を**失っていない**(足し戻しであって置き換えではない)
- **(1d)** ⭐ **`SKILL_SLOT_CURVE` が 1 ビットも変わっていない**(枠を触らない証拠)
- **(1e)** 魔法使い**以外**の職業の `equippedSkills` が 1 件も変わらない(2 経路で突き合わせ)

### §2 (A) 声掛け

- **(2a)** 卓の冒険者に話しかけると同行候補に入る
- **(2b)** 受注後の `selection.partyMembers` に**誘った人が含まれる**(名前で一致)
- **(2c)** ⭐ **誘っていない人は含まれない**(自動抽選に落ちていないこと)
- **(2d)** 誰も誘わずに受注 → `partyMembers` が**主人公 1 人**
- **(2e)** ⭐ マッチング画面に誘った人の名前が出る(既存演出が拾えている証拠)
- **(2f)** クリア帰還後に候補が空になっている(= 解散)

### §3 恒等(非退行)

- **(3a)** `js/npc-crowd.js` の `tile` / `dx` / `dy` が 1 件も変わっていない
- **(3b)** `renderRecruitCountLine` の出す数が `partyMembers` の NPC 数と一致

### §4 撤退

- **(4a)** `tavern.html?recruittalk=0` → 従来の自動編成(`1 + recruitCountOf(sc)` 人)
- **(4b)** `index.html?magesleep=0` → 魔法使いの `equippedSkills` に `sleep` が**入らない**
- **(4c)** ⭐ 2 本が**独立**であること(片方を切っても他方が効く)

### ⛔ 測らないこと

- 承諾の台詞の**文面**(実機で言い回しを調整する余地を残す)
- 吹き出しの表示位置・間
- 「今日の 4 人」の抽選が**どの 4 人**か(乱数。⭐ 測るのは「4 人取れること」だけ)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

⚠⚠⚠ **#53 の教訓**: 変異は「赤くなったか」ではなく**「期待した assert が赤くなったか」**まで
機械で見ること(`MUT_EXPECT`)。#53 は起草時の対応表が 2 件空振りした。

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `compnotmembers` | 誘った人を `partyComposition` にだけ積み `partyMembers` に積まない(⭐ **§2-2 の罠の再現**) | (2b)(2e) |
| `sleepbeforeslice` | `withInnateSleep` を slice の**前**で呼ぶ(⭐ **§2-3 の罠の再現**) | (1a)(1b) |
| `sleepall` | `classKey !== "mage"` のガードを外す | (1e) |
| `curvebump` | `SKILL_SLOT_CURVE[1]` を 2 にして枠で解決する | (1d) |
| `fallbackauto` | 候補 0 人のとき従来の自動抽選へ落とす | (2c)(2d) |
| `nodisband` | 帰還時に候補をクリアしない | (2f) |
| `notalkgate` | `RECRUIT_TALK_ON` を無視する | (4a) |
| `nomagegate` | `MAGE_SLEEP_ON` を無視する | (4b) |
| `movetile` | `npc-crowd` の `tile` を 1 マス動かす | (3a) |

### 既存 golden の非退行(⚠ **STEP0 で着手前に 1 回、締めでもう 1 回**)

    node tools/verify_npc_crowd.js
    node tools/verify_recruit_size.js
    node tools/verify_mercenary_roster.js
    node tools/verify_party_match_setup.js
    node tools/verify_quest_walk.js
    node tools/driver_party_view_reopen.js
    node tools/driver_depart_menu_clean.js
    node tools/verify_tavern_map.js

⚠⚠⚠ **`verify_recruit_size.js` は「この依頼に応じた冒険者 N 人」と `#partyPreview > div` の
行数を測っている**(依頼書 #7 の (B2))。⇒ **勧誘で人数が変わると赤くなる可能性が高い。**
⛔ **assert を緩める前に、着手前の本数を STEP0 で記録し、赤が「本件の意図した変化」か
「壊した」かを切り分けること。**

⚠ 基準値は 2026-08-23 の記録(`verify_recruit_size` 82/82 等)で**既に腐っている可能性が高い**。
STEP0 の実走が唯一の正。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` ではナレ音声が鳴らない)。

- 卓の冒険者のタップ領域が **44px 以上**あるか(スプライト 96px だが隣接 NPC との間隔を実測)
- ⚠⚠⚠ **golden 4 本が「札の中心の `elementFromPoint` が自分自身」を測っている。**
  NPC をタップ可能にすると戻りが変わりうる — STEP0 で着手前実測 → 各 STEP で再測
- 承諾の吹き出しが既存の雑談キューを詰まらせないか
- 縦持ちで「あと何人誘えるか」が読めるか
- ⭐⭐⭐ **ソロで潜って本当に遊べるか**(難易度)。

  ⚠⚠ **参考実測(2026-09-05 実装窓 / #53 の副作用確認。素の腕 3 + `?swampmap=0` の腕 3)**:

      node tools/auto_debug_run.js --scen lizard-swamp --runs 3
      node tools/auto_debug_run.js --scen lizard-swamp --runs 3 --qs "swampmap=0"

  6 ランとも完走・critical 0 だが **6 ランとも敗北**。⭐ **これは 4 人編成での数字**。

  ⭐⭐⭐ **敗因の内訳がここでは決定的に重要**: `finalLeaderHp: 0` / `partyAlive: 3` =
  **仲間 3 人が生きているのに、主人公だけ落ちて敗北している。**
  ⇒ **ソロはこれより厳しい。** 4 人編成ですら主人公が真っ先に落ちるので、
  ソロには「仲間が肩代わりする」余地が **ゼロ**。

  ⚠ レポートの `R<n>` は**部屋番号ではなく戦闘ラウンド数**(実装窓が自分の誤読を訂正した)。
  15 秒で終わったランは n4 へ到達すらしていない。

  ⛔ **それでもゲートは作らない**(ユーザー決裁済み)。難易度は遊んでから調整する話であって、
  「連れて行けと強制する」話ではない。
  ⭐ 実機で確認するのは「ソロが**勝てるか**」ではなく「ソロで**詰まないか**」
  (敗北して帰還できるか / 進行不能にならないか)。

  ⭐ 「主人公だけ先に落ちる」自体は **本チケットの責任ではない**(リーダー AI / 前衛の
  立ち位置の話)。⇒ 別チケットの題材として §11 に記録した。

  ⚠⚠⚠ **対比を取るときの前提(実装窓が見つけた本物の穴)**: フリーズ復帰の URL は
  `?autodebug=resume` **だけ**で `--qs` も `--scen` も落ちる。⇒ 復帰が 1 回でも起きたランは、
  そこから先が**黙って「スイッチ無し」の腕**になる。**`critical 0`(= 復帰が起きていない)を
  確認してから比べること。** これは #54 の負のコントロールで撤退スイッチの腕を回すときにも効く。
- Lv1 の魔法使いがスリープを撃つのを実際に見る

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>魔法使いが最初からスリープを唱える</b> — 序盤の群れを眠らせて切り抜けられるようになった。"
    py tools/add_changelog.py "<b>酒場の冒険者を次の冒険に誘える</b> — 卓に座っている者へ声を掛けると、同道を申し出て次の潜行についてくる。"

---

## 11. やらないこと

- ⛔ **出発準備画面の廃止** → **#55 へ切り出し**(ユーザー決定 2026-09-05)。
  ⚠ 廃止は技術的には可能(#35 の `PM_SETUP_ON` が**既定 ON** で `#pmDepart`「出発する」が既にある)。
  ただし失われるものの行き先を決める必要がある = 事前情報チェック(調べる/話す/祈る)/ 敵の情報 /
  装備・スキル・魔法の設定 UI。**既存検証ドライバ 9 本・110 箇所が準備画面を測っている**
  (`verify_party_match_setup` 34 / `verify_quest_walk` 16 / `driver_party_view_reopen` 14 /
  `verify_recruit_size` 10 / `driver_equip_compact_ios` 10 / 他 4 本)
- ⛔ **名簿 12 人を全員酒場に並べる**(会議でノエルが反対。出発前が人事画面になる)
- ⛔ **`drunk`(酔漢)を誘えるようにする**(今回は patronA-D の 4 人だけ)
- ⛔ **職業ごとの常備スキルという一般機構**(mage の sleep 1 件だけの穴に留める)
- ⛔ **`SKILL_SLOT_CURVE` の職業別化**(UI・戦闘・NPC の 3 経路が読む)
- ⛔ **仲間を死なせる / 断られる演出**(名簿は alive/dead を意図的に持たない)
- ⛔ **「主人公だけ先に落ちる」の是正** → **別チケットの題材**(#56 候補)。
  ⭐ 実測(§9)= 沼の 6 ラン**すべて**が `finalLeaderHp: 0` / `partyAlive: 3` =
  **仲間 3 人が健在なのに主人公だけ落ちて敗北**している。これはリーダー AI / 前衛の立ち位置の
  問題であって、本チケットが作る欠陥ではない。⚠ ただし**ソロ潜行を許すと直撃する**ので、
  #54 の実機確認で「ソロで詰まないか」を見た結果しだいでは、次の一手の最有力候補になる。
- ⛔ **`scroll-sleep` の再編成**(ユーザー決裁 2026-09-05 = **今は残す**)。
  sleep を初期習得にすると common の巻物枠が 1 つ実質死ぬが、⭐ **壊れない**ことは確認済
  (`learnScroll` が `{learned:false, already:true}` を返し、一覧が `[習得済み]` を出す)。
  巻物の再編成は #54 のスコープを広げるので**別チケット**。
- ⛔ **`実装依頼書/README.md` への行追加**(#53 着地後)。用意してある行:

    | 54 | [2026-09-05_tavern-recruit-talk.md](2026-09-05_tavern-recruit-talk.md) | **承認済**(2026-09-05) / **着手は #53 着地待ち** | 0% | 酒場の卓に座る冒険者へ**受注前に**声を掛けて同行候補にし、受注するとマッチング画面にその顔が映る + 魔法使いの sleep 常備。⭐ 骨格は #38 `DFRoster` に既にあり、足りないのは**選択権だけ**。⚠⚠⚠ 積む先は `partyMembers`(`partyComposition` は後方互換の写し)。⚠⚠⚠ Lv1 の枠は 1 個なので `defaultSkills` に sleep を足しても効かない(slice の**後**に足し戻す)。撤退 `?recruittalk=0` / `?magesleep=0` の 2 本 |

---

## 12. 実装結果

(実装窓が埋める)

### 12-0. STEP0 の着手前実測(⚠ **着手して最初にやること**)

⚠ §8 の golden 8 本を**着手前に 1 回**走らせ、本数をここに記録する。
特に `verify_recruit_size` は本件で赤くなる見込みがあるので、**着手前の本数**が無いと
「本件が壊した」のか「元から赤い」のか切り分けられない。

**実測日**: 2026-09-05(実装窓) / **基準の木**: `8852c98`(= `00c486d` 起草 + `8852c98` #53 §12-5 の記録。
`index.html` / `tavern.html` は `04cfd45` から 1 バイトも動いていない)

#### ⭐⭐⭐ 母集団を数え直した — §8 の 8 本は**部分集合**だった

依頼書は golden を 8 本と名指ししたが、**#54 は「候補 0 人ならソロ」= 出発人数が変わる改造**なので、
人数と装備スキルを測るドライバは全部が候補になる。`grep -l` で数え直した結果:

    grep -l "tavern\.html"     tools/*.js   → 45 本(⚠ コメントも拾うので過大)
    grep -l "partyMembers"     tools/*.js   → 21 本
    grep -l "equippedSkills"   tools/*.js   →  6 本

⇒ §8 の 8 本に、`partyMembers` / `equippedSkills` を測る 16 本を足して **24 本**で基準を採った。
⭐ 根拠 = [[project_headless_verification]] の「**前のチケットが数えた本数を信じるな**」
(#45/#46 が 7 本と思っていた母集団の実測は 13 本で、取りこぼした 1 本が**赤いまま出荷**されていた)。

#### 基準(素の腕のみ / `--negative` は回していない)

| ドライバ | exit | 基準 |
|---|---|---|
| `verify_npc_crowd` | 0 | **32/32** PASSED / FAILED 0 / PENDING 0 |
| `verify_recruit_size` | 0 | **82/82** PASS ⭐ 2026-08-23 の記録 82 は**腐っていない** |
| `verify_mercenary_roster` | 0 | **44/44**(0 FAILED / 0 PENDING) |
| `verify_party_match_setup` | 0 | **36** PASSED / 0 FAILED / 0 PENDING |
| `verify_quest_walk` | 0 | **25/25** PASSED |
| `driver_party_view_reopen` | 0 | **35/35** PASSED |
| `driver_depart_menu_clean` | 0 | **41/41** PASS |
| `verify_tavern_map` | 0 | **43/43** PASSED |
| `driver_action_priority` | 0 | **92** PASSED / 0 FAILED |
| `verify_darkvision` | 0 | **25/25** PASSED |
| `verify_player_sheet` | 0 | **73/73** PASSED ⭐ #47 で赤かった件は解消済 |
| `verify_run_chronicle` | 0 | **73** PASSED / 0 FAILED |
| `verify_road_boon` | 0 | **20/20** PASSED |
| `verify_cone_cast` | 0 | **19/19** PASSED |
| `verify_road_ambush` / `verify_save_slots` / `driver_field_step7` / `driver_heromark_signplate` / `driver_trap_weaponize` / `driver_monsters_chimera` / `driver_monsters_griffon` | 0 | 全て exit 0 |

#### ⚠⚠ 着手前から赤い / 止まる 3 本(⛔ 後で見つけても本件のせいにしない)

1. **`driver_monsters_umberhulk`** — **21/22**。FAILED = `(3) 再発火: 同一 enemyIdx が2回以上 gaze
   (gazeCooldown 明けに再発火) — maxGazesPerEnemy=1`。⭐ アンバーハルクの凝視クールダウンの話で
   **#54 とは無関係**。

2. **`driver_equip_compact_ios`** — exit 1。`準備画面 (#prep) が可視にならなかった — 演出の進行に失敗`。
   ⭐⭐⭐ **フレークではない**(同じ地点で 2 回再現)。さらに **`cdaaf91`(#52 = #53 より前)の木を
   `--root` で配信しても同じ地点で落ちる** ⇒ **#52 / #53 / #54 のいずれでもなく、もっと古い赤**。
   ⚠ 仮説(未検証・本チケットでは追わない): ドライバは画面中央を 45 回タップして演出を送る実装だが、
   #35 のマッチング演出が `#pmDepart`「出発する」の明示タップ待ちになったため、
   **中央タップでは進まなくなった** = 壊れているのは機能ではなく**ドライバ側の進め方**の疑い。
   ⇒ 別チケットの題材(§11 の #56 候補と同じ扱い)。
   ⚠⚠ **本チケットは `openPrep` を触る**ので、締めで赤くても**本件の仕業ではない**基準がここ。

3. **`probe_party_size`** — exit 124。⭐ **中身は全 OK**(`(2a)(2b)(2z1)〜(2z5)(4z0)` 全て OK が出ている)。
   出力を終えた後に終了せず、実装窓のラッパの **600 秒タイムアウト**で切られただけ。
   ⇒ 赤ではない。締めで比べるときは**タイムアウト前提**で回すこと。

---

### 12-0b. ⭐⭐⭐ §2-3(スリープ常備)の中核の前提が崩れた — 予測のほうを訂正する

⛔ assert を緩めていない。**依頼書の予測が誤りで、本番コードのほうが正しい。**
すべて `git show HEAD:index.html`(`8852c98`)の実測。

#### (1) `SKILL_SLOT_CURVE` は魔法使いに適用されない(マーシャル職専用)

- `headSkillSlots = ["warrior","dwarf","rogue"].includes(leaderClassKey) ? skillSlotsForLevel(headLevel) : 3`
  ⇒ **キャスターの頭は 3 固定**。枠カーブを読まない。
- 依頼書が「⭐ 最後に必ず通る」とした仲間の slice ループは、冒頭が
  `if (!["warrior","dwarf","rogue"].includes(ally.classKey)) continue;`
  ⇒ **mage は 1 度も通らない**。
- 魔法使いの枠の正は **`SPELL_SLOT_CURVE_MAGE = [0,3,4,5,6,8,9,10,12,13,15]`**
  ⇒ **Lv1 の枠は 1 個ではなく 3 個**。

#### (2) `withInnateSleep` を slice の後に挿す案は、魔法使いに届かない

仲間 mage の `equippedSkills` の**最終的な書き手**は `initAllySpellSlots` で、
`ally.equippedSkills = Object.keys(allocMap)` と**丸ごと上書き**する(slice 群より後段)。

#### (3) ⭐⭐⭐ 本当の関門は `isSpellKnown` の完全ゲート

    const DEFAULT_KNOWN = { mage: ["magic-missile", "fire-bolt", "arcane-shield"], ... };

`sleep` が入っていないので、`initLeaderSpellSlots` / `initAllySpellSlots` の両方が
`if (!isSpellKnown(classKey, id)) continue;   // 完全ゲート` で落とす。
⭐ **先行事例**: #50 の `tools/verify_cone_cast.js:618-650` が同じ鎖
(`knownSpells` → `partySkills` → `allocMap` → `equippedSkills`)を既に文書化しており、
バーニングハンズで**同じ穴**を踏んでいる。⇒ 写経すべきはこちら。

#### (4) 「Lv1 では magic-missile だけ」も違う

`defaultCasterMap` が defaultSkills の `mpCost > 0` を **2 枠ずつ**積み、`upperCap = 3` で切るので、
Lv1 の NPC 魔法使いの実体は **`{magic-missile: 2, fire-bolt: 1}` /
`equippedSkills = ["magic-missile","fire-bolt"]`**(arcane-shield は 0 枠で落ちる)。
⭐ ついでに **MP は Phase 2-J で完全廃止**(`maxMp = 0`)なので、`sleep` の `mpCost: 6` は**名残**であり障害ではない。

#### ⇒ 受入条件・変異への波及

- (1d)「`SKILL_SLOT_CURVE` が 1 ビットも変わっていない」は番人として残せるが、
  **「枠で解決していない証拠」にはならない**。効く番人は **`SPELL_SLOT_CURVE_MAGE` の凍結**。
- 変異 `sleepbeforeslice` / `curvebump` は**別機構**を叩いており、`MUT_EXPECT` が空振りする。
  ⇒ **`nosleepknown`(`DEFAULT_KNOWN.mage` から sleep を抜く)/ `magecurvebump`
  (`SPELL_SLOT_CURVE_MAGE[1]` を 3→4)** へ差し替える。

#### ⏸ 仕様判断待ち(起草窓 + ユーザーへ送付済 2026-09-05)

Lv1 の枠 3 個は `magic-missile ×2 + fire-bolt ×1` で**埋まりきっている**。sleep を入れるには
何かが 1 枠譲る必要がある。(A) `mm×2 + sleep×1` / (B) `mm×1 + fb×1 + sleep×1` /
(C) `SPELL_SLOT_CURVE_MAGE[1]` を 3→4。**実装窓の推奨は (A)**
(Lv1 では fire-bolt と magic-missile が**両方とも単体攻撃**で役割が重複しており、失うものが最小)。

⚠ 併せて: `SCROLL_CATALOG` に **`scroll-sleep`(common)が実在**する。sleep を初期習得にすると
この巻物は「習得済み」表示の空振り品になる(⭐ `learnScroll` は `{learned:false, already:true}` を返し、
一覧は `[習得済み]` を出すので**事故にはならない**)。扱いは STEP1 で決める。

---

### 12-0c. ⭐ STEP2 の分岐は依頼書の内部矛盾だった(実装窓が決着させた)

§5 は「`DFRoster.all()` から 4 人を抽選して patronA-D の見た目(**名前・職業**)に反映」と書きつつ、
同じ節で「⛔ `sprite` は触らない」と書いている。**職業はスプライトが表しているので両立しない。**

⇒ 実測で決着: `tavern.html` に **`PARTY_PORTRAIT_SPRITES[classKey][variant]`** が既にあり、
**現在の卓の 4 人はこの表の `variant = 1` と完全一致**する。

| 席 | 現在のスプライト | = 表の |
|---|---|---|
| `patronA` | `dwarf_warrior_walk.png` | `dwarf[1]` |
| `patronB` | `rogue_male_walk.png` | `rogue[1]` |
| `patronC` | `cleric_npcmale_walk.png` | `cleric[1]` |
| `patronD` | `elf_male_walk.png` | `elf[1]` |

⇒ **職業に応じて `PARTY_PORTRAIT_SPRITES` を引く**形にすれば、(dwarf,1)(rogue,1)(cleric,1)(elf,1) を
引いた場合に**現在と 1 バイトも変わらない**(= 恒等が保証される)。新しい表は要らない。
⭐ 「⛔ sprite を触らない」の禁止は**幾何**(tile / dx / dy)に向けられたものと解釈する。
スプライト画像の差し替えは `el.style.width/height = SPRITE` 固定なので**矩形を変えない**
⇒ 不変条件 (I5) と golden 4 本に触れない。

⚠ ただし `say:` は席ごとの性格台詞で、職業が変わると食い違う(例: `patronD`
「森の依頼なら、私に一言あってもよかろうに」= エルフ前提)。
⭐ `verify_npc_crowd` は**吹き出しの文面を `js/npc-crowd.js` の `say` と突き合わせる**
(データ側を読んで比較する自己整合な作り)ので、**`say` の文面を書き換えても緑のまま**。
⛔ 逆に「吹き出しを抽選した人物の `line` にする」と、データと食い違って**必ず赤くなる**。
⇒ STEP2 では `say` を**職業に依らない中立な文面**へ書き換える(⛔ `tile` / `dx` / `dy` は触らない)。


---

### 12-1. STEP1 着地 — 魔法使いのスリープ常備((A) 採用)

**仕様判断**: ユーザー決裁 2026-09-05 = **(A) `magic-missile ×2 + sleep ×1`** / 巻物は**今は残す**。

#### 触った 4 箇所(⛔ 枠のカーブは 1 ビットも触っていない)

| ファイル | 変更 |
|---|---|
| `index.html` | `isMageSleepOn()` / `withInnateSleepList()` を新設し、**`DEFAULT_KNOWN.mage`** に sleep を挿す(完全ゲートを通す) |
| `index.html` | **`CLASS_DEFS.mage.defaultSkills`** に sleep を index 1 で挿す(NPC キャスターの枠配分) |
| `tavern.html` | **`DEFAULT_KNOWN_TV.mage`**(写し)に同じ処理 — 片方だけだと「戦闘では撃てるのに酒場では未習得に見える」 |
| `tavern.html` | `loadSelections()` の末尾で **保存済み `partySkills.mage`** にも常備を確保(⚠ これが無いと既存セーブに効かない) |

⭐ `DEFAULT_KNOWN` 側は移行コード不要(`loadKnownSpells` が毎ロード和集合を取る自己修復)。
⚠ `partySkills` 側は**置換**なので、上表 4 行目が要る。

#### 実測(プローブ 11/11 PASS)

    [実測] NPC 魔法使い(素)   skills=["magic-missile","sleep"]  slots={"magic-missile":2,"sleep":1}
    [実測] NPC 魔法使い(撤退) skills=["magic-missile","fire-bolt"] slots={"magic-missile":2,"fire-bolt":1}
    [実測] 酒場 partySkills.mage  素=[mm,sleep,fb,as] / 撤退=[mm,fb,as]
    [実測] 主人公=魔法使い slots  素={"magic-missile":1,"sleep":1,"fire-bolt":1}
                                  撤退={"magic-missile":1,"fire-bolt":1,"arcane-shield":1}

| 受入 | 結果 |
|---|---|
| (1a) 主人公が魔法使いのとき呪文枠に sleep | ✅ |
| (1b) NPC 仲間の魔法使いの `equippedSkills` に sleep | ✅ |
| (1c) `magic-missile` を失っていない | ✅ |
| (1c2) (A) の配分どおり NPC = `{mm:2, sleep:1}` | ✅ |
| (1d) `SKILL_SLOT_CURVE` が 1 ビットも変わっていない | ✅ `[0,1,1,2,2,3,3,4,4,5,5]` |
| (1d2) `SPELL_SLOT_CURVE_MAGE` が 1 ビットも変わっていない | ✅ `[0,3,4,5,6,8,9,10,12,13,15]` |
| (1e) 魔法使い以外の職の `equippedSkills` が不変 | ✅ 素と撤退で一致 |
| (1f) 既存セーブの `partySkills` にも常備が入る | ✅ index 1 |
| (1g) 酒場側の習得ゲートにも sleep | ✅ |
| (4b) 撤退 `?magesleep=0` で 3 経路とも sleep 無し | ✅ |
| (Z) pageerror 0 件 | ✅ |

⚠⚠ **譲る呪文が経路で違う**(NPC = fire-bolt / 主人公 = arcane-shield)。積み方が 2 枠ずつと
1 枠ずつで違うため。⭐ ユーザー決裁 (A) の「Lv1 で fire-bolt が出なくなる」は **NPC 経路の話**で、
主人公経路では **fire-bolt は残り arcane-shield が譲る**(= (A) の意図より損失が小さい)。

---

### 12-2. STEP3 着地 — 声を掛けて同行候補にする + 単身出発の確認(ユーザー決定 C)

#### 実装

| ファイル | 変更 |
|---|---|
| `js/recruit-candidates.js` | **新規**。同行候補の保管庫 `window.DFRecruits`。⛔ 上限をここに持たない(`add(member, cap)` で受け取る) |
| `tavern.html` | `#recruitDialog`(勧誘)/ `#soloConfirm`(単身確認)/ `RECRUIT_MAX` の持ち上げ / NPC タップの振り分け / `regeneratePartyMembers` / 帰還時の解散 |

⭐ **`#choiceDialog` は酒場に存在しなかった**(index.html 側の器)。`openDialog` は依頼カード専用で
`clientName` / `metaReward` / `metaEnemies` を前提にしており、`verify_quest_walk` /
`verify_recruit_size` が中身を測っている ⇒ **専用の `#recruitDialog` を新設**した。

⭐ **`recruitCountOf` の `MAX` は関数ローカル**で外から読めなかった。ドライバの変異アンカーに
使われていないことを確認したうえで **`RECRUIT_MAX` をモジュール定数へ持ち上げ**、
clamp 上限と勧誘上限が同じ 1 箇所を読むようにした(⛔ 数字 3 の写経を避ける)。

⚠⚠ **単身確認は `openPrep()` の中に入れていない。** あそこは検証ドライバが直接呼ぶ状態遷移で、
待ちを挟むと 7 本が黙ってハングする ⇒ **UI のクリック経路にだけ**置いた。

#### 実測(プローブ 9/9 PASS)

| 受入 | 結果 |
|---|---|
| (2a) 卓の冒険者に話しかけると勧誘ダイアログ | ✅ A/B/C とも |
| (2b) 受注後の `partyMembers` に誘った人(名前一致) | ✅ |
| (2c) 誘っていない人は含まれない | ✅ 主人公 1 + 誘った 3 = 4 人ちょうど |
| (2d) 誰も誘わず受注 → 主人公 1 人(ソロ) | ✅ |
| (2g) 上限 3 人・4 人目は押せない | ✅ 「同行の約束: 3 / 3 人」 |
| (4a) 撤退 `?recruittalk=0` で従来の自動編成(4 人) | ✅ |
| (4a2) 撤退では従来どおり一言だけ | ✅ |
| (Z) pageerror 0 件 | ✅ |

#### ⚠ `?recruit=0`(#7 の撤退スイッチ)についての訂正

実装窓は一度「`?recruit=0` が死んだ」と報告したが、**誤り**。#54 の下では
`partySize = PARTY_SIZE (4)` ⇒ 上限 3 = `RECRUIT_MAX` となり、意味は
「**依頼の重さで誘った仲間の上限を減らさない**」として正しく生きている。
赤かったのは golden が旧モデルの人数を期待していたからで、**コード修正は不要だった**。

---

### 12-3. ⭐⭐⭐ golden 7 本の赤 — 切り分けと処理(⛔ 1 つも緩めていない)

「候補 0 人ならソロ」は**出発人数を変える**ので、依頼書が予告した `verify_recruit_size` 1 本では
済まなかった。**7 本・約 62 assert** が赤くなった。1 本ずつ真因を測って処理した。

| ドライバ | 真因 | 処理 |
|---|---|---|
| `driver_monsters_chimera` / `griffon` | ⭐⭐⭐ **STEP3 ではなく STEP1**。両者は `partyMembers` を**自分で仕込む**ので `regeneratePartyMembers` を通らない。真因は **Lv8 の魔法使いが敵を眠らせ、敵の行動サンプルが枯れた**こと(決定打 = `mino=0/0 entries=0` = 敵が 1 度も攻撃していない) | URL に `&magesleep=0` を付けて**交絡を実験的に統制** |
| `verify_npc_crowd` | 卓の 4 人が「押すと吹き出し」から「押すと勧誘」に変わった(意図)+ ダイアログが残って以降のクリックを塞ぐ(連鎖) | §3 の測定を `?recruittalk=0` の腕へ移設 |
| `verify_recruit_size` / `verify_mercenary_roster` / `driver_party_view_reopen` / `verify_party_match_setup` | 自動編成モデルを測っており、それが既定の腕から消えた | URL 構築点 1 箇所ずつに `withAutoParty()` |
| `verify_quest_walk` / `driver_depart_menu_clean` | 実際に「引き受ける」を押すので**単身確認**に止められた(`受注=null`) | `soloWarnSeen` を仕込む(`prologueSeen` と同じ「一度きりの案内」枠) |

⭐⭐ **一度失敗した直し方も記録する**: `verify_npc_crowd` で最初に「4 席を母集団から外す」を
試したが、**酒場 compact で画面内に押せる 2 人目が居なくなり (3b) が `second=null` で落ちた**
= 母集団が痩せて別の赤を生んだ。⇒ 撤回して腕の移設にした。
⭐ 教訓 = 「母集団を絞る」直し方は、**絞った先の母集団がまだ十分かを測ってから**採ること。

#### 最終状態(24 本)

**基準と完全一致 20 本。**残り 4 本はすべて **#54 以前からの状態**:

| ドライバ | 状態 |
|---|---|
| `driver_equip_compact_ios` | 着手前から赤(`cdaaf91` でも同じ。§12-0 参照) |
| `driver_monsters_umberhulk` | 着手前から 21/22(凝視クールダウン) |
| `probe_party_size` | 中身は全 OK。ラッパのタイムアウトで exit 124 |
| `driver_monsters_griffon` | ⭐ **統計的フレーク**(3 回走らせて 15/17 → 17/17 → 17/17)。`magesleep=0` の統制でサンプルは 0/4 → 0/12 へ回復済み。zone 重みが front=1.25 なので「rear/mid を 1 回以上」は元々出にくい ⇒ **別チケットの題材**(サンプル数を増やすか、率で測る) |
