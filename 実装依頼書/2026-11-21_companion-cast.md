# #117 固定キャスト 12 人 — 仲間が名前・性格・しゃべり方を持った人物になる

- **起草**: 2026-11-21(計画窓) / **ステータス**: **承認済**(2026-11-21 ユーザー承認)
- **入力**: `dev-meetings/2026-11-21_party-banter.md` の第 2 段 開発計画書(§2 キャスト表・§3 依頼書 A・§8 リスク)
- **触るファイル**: `js/companion-cast.js`(新規)/ `js/mercenary-roster.js` / `tavern.html` / `index.html` / `js/changelog.js` / `tools/verify_companion_cast.js`(新規)/ 既存ドライバの言い直し(§8 末尾)/ `実装依頼書/README.md`
- ⛔ **触らないファイル**: なし(2026-11-21 起草時 `git status` クリーン・`origin/main..HEAD` = 0 本 = 並走窓なし)。
  ⚠ それでも `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- **後続**: #118(気づいた本人が名前を呼んで伝える)・#119(仲間が道を勧めて主人公が返事)は本チケットの**承認後に**起草する。並行して codex1 へ 2 人目のスプライト 6 体を依頼する(§11)。

---

## 1. 目的

同行の仲間は、職業ごとに 15 人ずつ(計 90 人)の名前の表から抽選され、性格(10 種)とひと言(10 種)も**名前と無関係にランダム**に付いている。しかもその性格とひと言は**酒場でしか表示されず**、ダンジョンの中では一度も使われていない(§2-1)。仲間は「抽選の誰か」で、パーティーを組んでいる手応えが無い。

本チケットは、仲間を**各職 2 人・計 12 人の固定キャスト**にする。一人ひとりに名前・性格・しゃべり方・ひと言・2 人 1 組の関係を決め、酒場の表示と**歩いている間の独り言**に使う。既存の名簿の育ち(Lv と同行回数)はキャストへ引き継ぐ。

**ユーザー決定(2026-11-21)**:

- 会議の候補から **④ 固定キャスト 12 人 + ③ 道を勧めて返事 + ② 気づいた本人が伝える** を採用(① 「名前ごとにしゃべり方の型を割り当てる」は**不採用** — 一人ひとりを人物にするため)。本チケットは ④ だけ。②③ は #118 / #119
- 同じ職の 2 人の見分け方 = **codex1 へ 2 人目のスプライト 6 体を発注**。納品までは同じ絵で動かす
- **黒い鎧のドワーフ(いまの NPC の絵 `assets/dwarf_warrior_walk.png`)の名前は「ラスムーゼン」**(ユーザー指定)
- 既存の名簿の扱いは会議で決着(§5-3): **職ごとに上位 2 人の育ちを引き継ぎ、元の名簿は消さずに写して残す**

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

起草時の HEAD = `0d1885c`。⚠ 行番号は着手時に必ず測り直すこと。

### 2-1. 性格・ひと言はダンジョンで一度も読まれていない

| ファイル:行 | 何 |
|---|---|
| `tavern.html:4970` | `NPC_NAMES`(最初期の 16 人)。`?namejob=0` の撤退先 |
| `tavern.html:4981` | `NPC_NAMES_BY_CLASS`(15 人 × 6 職)。#72 の「名前 → 職業は 1 対 1」 |
| `tavern.html:4995` 付近 | `NPC_TRAITS`(10 種)/ `NPC_LINES`(10 種) |
| `tavern.html:5065` | `makeNpcMember` — 名前は職の表から、`trait` / `line` は `pickRandom` で名前と無関係 |
| `tavern.html:5090` | `pickCompanion(classKey, usedNames)` — 名簿の在籍者 + 新顔 1 通りから一様抽選。`makeNpcMember` へ落ちる枝は 4 か所(5091 名簿 OFF / 5097 例外 / 5099 満杯でその職 0 人 / 5101 新顔) |
| `index.html:40012-40013` | `ally.npcTrait = m.trait` / `ally.npcLine = m.line` — **代入だけ。読む箇所は index.html 全文で 0 件** |

再測定:

    grep -n "npcTrait\|npcLine" index.html          # → 代入の 2 行だけ
    grep -n "makeNpcMember(\|pickCompanion(" tavern.html

### 2-2. 入口は `pickCompanion` 1 つ(呼び口の全数)

| 呼び口 | 何 |
|---|---|
| `tavern.html:5216` / `5223` `buildParty` | 撤退時(`?recruittalk=0`)の自動編成 |
| `tavern.html:9255` `drawTodaysPatrons`(9266 で `pickCompanion`) | 酒場の卓の 4 人(職は重複なし)。**既定の流れではここで会った人と同行の約束をする** |

既定の流れ(`regeneratePartyMembers` `tavern.html:7681`)では、パーティー = 主人公 + **同行の約束 `DFRecruits.all()` の人だけ**。約束は卓の 4 人から交わすので、仲間はすべて `pickCompanion` から来る。⇒ **キャストに差し替える口は `pickCompanion` の「新顔を作る枝」だけ**で足りる。

### 2-3. 各職 2 人で足りることの導出

- 卓の 4 人は**職が重複しない**(`drawTodaysPatrons` が 6 職をシャッフルして先頭 4 つ)⇒ 1 回の卓で同じ職は 1 人
- 撤退経路の `buildParty` は「前衛・中衛・後衛を 1 人ずつ埋め、残り 1 枠は全職ランダム」⇒ 仲間 3 人のうち同じ職は**最大 2 人**
- 名簿の上限 `CAP = 12`(`js/mercenary-roster.js:64`)= キャスト 12 人。全員と会えば名簿が満杯 = 新顔が要らない

### 2-4. 表示側は `trait` / `line` をそのまま読む = 表示のコードは触らなくてよい

| 場所 | 読むもの |
|---|---|
| `tavern.html:6665-6666` 名簿パネル | `m.trait` / `m.line` |
| `tavern.html:6973-6977` 声掛けダイアログ | `m.trait` / `m.line` |
| `tavern.html:7746-7747` マッチングのカード | `m.trait` / `m.line` |

⇒ `pickCompanion` が返す人物にキャストの `trait` / `line` を入れれば、表示は自動で変わる。

### 2-5. 本体への受け渡し

- 酒場は `selection.partyMembers` を**まるごと** JSON にして `sessionStorage["dragonfighters.partyMembers"]` へ(`tavern.html:8882` / `8968`)
- 同行の約束 `DFRecruits.add` も人物の項目を**まるごと**保存する(`js/recruit-candidates.js:88`)
- 本体は `index.html:39928` で読み、`index.html:40005` 付近で `allies` を作る
- ⇒ 人物に `castId` を 1 つ足せば、約束を経由しても本体まで届く。⚠ ただし名簿 `normMember`(`js/mercenary-roster.js:102`)は**知らない項目を落とす** = 名簿に `castId` は保存されない(§2-7 の罠 A)
- ⚠ `index.html` は `js/mercenary-roster.js` を**読み込んでいない**(`grep "<script src=\"js/" index.html`)。名簿の書き戻しは酒場側(`consumeResult` → `DFRoster.recordRun`)

### 2-6. 見た目 = 職ごとに実質 1 枚

- `tavern.html:9229` `PARTY_PORTRAIT_SPRITES` / `index.html:18484` `SPRITE_VARIANTS` は職ごとに 4 枠。**[0] = 主人公の絵、[1]〜[3] = 同じ NPC 用の絵**(二重定義・要同期)
- 黒い鎧のドワーフ = `assets/dwarf_warrior_walk.png`(dwarf の [1]〜[3])。主人公のドワーフ `assets/dwarf_walk.png` は赤ひげ・銀の鎧(画像を目視)
- ⇒ キャストの 1 人目 = `variant: 1`、2 人目 = `variant: 2` に固定する。2 人目の絵が届いたら **`[2]` の 1 行を差し替えるだけ**で分かれる(本チケットでは差し替えない)

### 2-7. ⚠⚠⚠ 見つけた設計上の罠

**罠 A — 名簿は知らない項目を落とす。** `normMember` は `id / classKey / name / trait / line / variant / level / runs` しか残さない。`castId` を名簿に入れても次の `load()` で消える。
⇒ **キャストは名前で引く**(キャストの名前は 12 人の中で重ならない)。`pickCompanion` が返す時点で `castId = DFCast.idOfName(name)` を付ける(名簿の枝も新顔の枝も同じ 1 行を通す)。⛔ 名簿の保存形は変えない。
⭐ 変異 `castidfromroster`(`castId` を名簿の項目から読む)で再現させる。

**罠 B — 撤退時に同名の別人が「キャスト扱い」になる。** `?cast=0` では新顔が 90 人の表から出る。表には「ダグ」「ヨナ」など**キャストと同じ名前**が入っている。本体が名前だけでキャストを引くと、撤退中の抽選のダグが独り言を話し出す。
⇒ `castId` は**酒場がキャスト ON のときだけ**付ける。本体は `castId` があるときだけキャストとして扱う(名前では引かない)。
⭐ 変異 `castbyname`(本体が `npcName` で引く)で再現させる。

**罠 C — 名簿の切り替えを `load()` で無条件に走らせると、テストの仕込みを壊す。** 既存ドライバは `DFRoster.enroll()` で任意の名前(`NPC_NAMES` の 16 人など)を仕込む(`tools/verify_member_identity.js:529` / `884`)。切り替えが毎回走ると、仕込んだ名前がキャストへ書き換わる。
⇒ 切り替えは **「写し `dragonfighters.mercRosterPreCast` が無いときに 1 回だけ」**。写しは名簿が空でも書く(空の名簿の写し = 切り替え済みの印)。ドライバの BOOT は `dragonfighters.*` を消すので、最初の `load()` で空の名簿が切り替わって印が立ち、その後の `enroll()` は切り替えに触れない。
⚠ ただし `localStorage` に旧名簿を**直接**書いてから開くドライバがあれば、そこは切り替えが走る。着手時に全 golden の仕込み方を確かめ、該当するものは §12 に書く。
⭐ 変異 `migrateevery`(印を見ずに毎回切り替える)で再現させる。

**罠 D — 「名前が同じ人」を別のキャストへ振ると入れ替わりに見える。** 旧名簿のドワーフの「ダグ」(90 人の表にいる)が Lv 最上位だと、単純に「Lv 順で 1 人目のキャスト」へ振ると**ダグがラスムーゼンになる**。
⇒ 引き継ぎは 2 段: ① 名前がキャストと一致する人は、その職の同じ名前のキャストへ ② 残りの枠を、残りの人から Lv(同じなら同行回数)の高い順に。
⭐ 変異 `noname1st`(① を外す)で再現させる。

**罠 E — `verify_member_identity` (3a) はラスムーゼンで赤くなる。** (3a) は「新顔の名前が、その職の名前表 `NPC_NAMES_BY_CLASS` に含まれる」を見る。キャスト 12 人のうち 11 人は表にいるが、**ラスムーゼンはどの表にもいない**(ユーザー指定の新しい名前)。
⇒ ⛔ 名前表にラスムーゼンを足さない(「1 職 15 人」の導出 (0b) と旧 16 人の全員残し (3c) を崩す)。(3a) を**言い直す**:「キャスト ON では新顔の名前はその職のキャスト(`DFCast` の実体)に含まれる / `?cast=0` では従来どおりその職の名前表に含まれる」。⛔ 期待値を黙って書き換えない — §12 に「なぜ言い直したか」を書く。

### 2-8. 歩いている間の独り言の置き場所

- 吹き出しは単一の行列(1 件 2 秒 + 間 260ms・`index.html:14084` の `SPEECH_MS`)。優先度 2 / 1 / 0 があり、0(環境音)は `ambient: true` で「行列が空で誰も話していないときだけ」積まれる(`sayLine` `index.html:14163`・`sayEnemyCry` `index.html:14250` が実例)
- 毎フレームの呼び口 = `updateSpeechBubbles()`(`index.html:18100`、`renderWorld` の中)
- 探索中かどうか = `currentPhase === "explore"`(`index.html:16303`)。ダイアログで時間が止まっている間は `dialogPaused === true`(`index.html:16024`)
- ⇒ 独り言は **優先度 0・`ambient: true`**。遭遇・罠・ボスなど既存のセリフを押し出さない

### 2-9. 吹き出しのドライバへの影響

`speechLog` を読むドライバは 6 本(`driver_dev_gate2` / `driver_speech_boss` / `driver_speech_engine` / `driver_speech_hooks` / `driver_speech_v2` / `verify_tower_mother_b`)。
独り言を話すのは **`castId` を持つ仲間だけ**(§2-7 罠 B)。`castId` は酒場を通らないと付かないので、`index.html` を直接起動するドライバでは独り言は**一言も出ない**。⇒ 非退行は §8 の golden で確かめる(期待値の変更は想定しない)。

### 2-10. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
プレイヤー向けの要約は実在する(仲間が 12 人の固定の顔ぶれになる・歩いている間に話す)。§10。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/companion-cast.js`(新規) | `window.DFCast`。12 人の定義(§4)・`enabled()`(`?cast=0`)・`all()` / `byId()` / `ofClass()` / `idOfName()`・独り言の表 |
| `js/mercenary-roster.js` | 切り替え(§5-3)。`load()` の先頭で 1 回だけ。撤退時の読み先(§7)。⛔ `normMember` の保存形は変えない |
| `tavern.html` | `<script src="js/companion-cast.js">` を `js/mercenary-roster.js` の**前**へ / `pickCompanion` の新顔の枝をキャストへ / 返す人物に `castId` / 名簿パネルに切り替えの知らせ 1 行 |
| `index.html` | `<script src="js/companion-cast.js">` / `ally.castId` の受け取り / 歩いている間の独り言 / `sayLine` の `opts.text` |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行 |
| `tools/verify_companion_cast.js`(新規) | 受入(§8) |
| 既存ドライバ | §2-7 罠 E の言い直し(`verify_member_identity` (3a))+ 着手時の実測で赤くなったものだけ |

⛔ `NPC_NAMES` / `NPC_NAMES_BY_CLASS` / `NPC_TRAITS` / `NPC_LINES` は**中身を 1 文字も変えない**(撤退先)。
⛔ 表示側(名簿パネル・声掛け・マッチングのカード)の組み立てコードは触らない(§2-4)。
⛔ `index.html` の `NPC_NAMES` / `buildParty` / `makeNpcMember` の複製(`index.html:15076` 付近・直起動のフォールバック)は触らない。

---

## 4. キャスト 12 人(⭐ 承認対象 — 名前・性格・ひと言・独り言の全文)

「絵」の 1 人目 = `variant: 1`(いまの NPC の絵)、2 人目 = `variant: 2`(codex1 の納品までは 1 人目と同じ絵)。
`trait` は酒場の性格欄にそのまま出る文。`line` は酒場のひと言(既存の `NPC_LINES` と同じく「」付き)。`idle` は歩いている間の独り言(各 3 本)。

### 戦士(女性の絵)

**イレーナ** `irena` / variant 1 — 元衛兵隊の小隊長。ミラの元上官
- trait: `生真面目で責任感が強い`
- line: `「衛兵隊のイレーナです。足並みを揃えて参りましょう。」`
- idle:
  - `隊列を乱さないでください。`
  - `この先、見通しが悪いですね。`
  - `皆さん、怪我はありませんか。`

**ミラ** `mira` / variant 2 — 元衛兵隊。命令より先に体が動く
- trait: `血の気が多くすぐ突っ込む`
- line: `「あたしが前に出る。あんたは後ろで見てな!」`
- idle:
  - `退屈だね。早く何か出てこないかな。`
  - `隊長の真似して歩くの、疲れるんだよ。`
  - `腕がなまっちまう。`

### ドワーフ

**ラスムーゼン** `rasmussen` / variant 1 / **黒い鎧(ユーザー指定)** — 鉱山の最奥で働いていた寡黙な戦士。ダグの尻拭い役
- trait: `無口で何を考えているか読めない`
- line: `「……ラスムーゼンだ。……行くぞ。」`
- idle:
  - `……。`
  - `……岩の匂いが変わった。`
  - `……気を抜くな。`

**ダグ** `dag` / variant 2 — ラスムーゼンと同じ鉱山の出。稼いだ金はその日のうちに酒になる
- trait: `酒好きで宵越しの金を持たない`
- line: `「ガハハ! 稼いだら一杯やろうじゃわい!」`
- idle:
  - `帰ったら樽ごと飲むんじゃわい。`
  - `ガハハ、こういう穴蔵は落ち着くのう。`
  - `腹が減ったのう……。`

### 僧侶

**ヨナ** `jona` / variant 1 — 若い見習い僧。ガウェインの弟子
- trait: `信心深く事あるごとに祈る`
- line: `「神のご加護がありますように。よろしくお願いします。」`
- idle:
  - `神よ、どうか皆をお守りください。`
  - `先生なら、ここでどうされるでしょう。`
  - `暗いところは、少し苦手です。`

**ガウェイン** `gawain` / variant 2 — 剣を置いて神に仕える元騎士の老司祭。ヨナの師
- trait: `元騎士の厳格な老司祭`
- line: `「傷を負ったら言うがよい。癒やすのが我が務めであろう。」`
- idle:
  - `若いの、足元を見て歩け。`
  - `昔は剣を振るっておったものだ。`
  - `焦るでない。道は逃げぬ。`

### 魔法使い

**オズ** `oz` / variant 1 — 若い学者肌の魔法使い。ベルントを「先生」と呼ぶ
- trait: `理屈っぽいが頼りになる`
- line: `「伝承によれば、この依頼は危険だ。だからこそ興味深いね。」`
- idle:
  - `この石組み、かなり古い時代のものだね。`
  - `理屈で考えれば、出口はあっちのはずだ。`
  - `先生に見せたい書物が増えたよ。`

**ベルント** `bernt` / variant 2 — 皮肉屋の老魔術師。オズの元師匠
- trait: `皮肉屋だが腕は確か`
- line: `「ふん、若造の子守りか。報酬が良ければ構わんだろうよ。」`
- idle:
  - `ふん、湿気で巻物が傷む。`
  - `年寄りに階段を歩かせるとはな。`
  - `急いだところで、罠が増えるだけだろうよ。`

### エルフ

**ファルケ** `falke` / variant 1 — 森番だった弓の名手。ブランの兄貴分
- trait: `慎重で石橋を叩いて渡る`
- line: `「ファルケだ。音を立てずに歩け。それだけ守ってくれ。」`
- idle:
  - `静かに。……気のせいか。`
  - `風が止んだ。用心しろ。`
  - `ブラン、はしゃぐな。`

**ブラン** `bran` / variant 2 — 英雄譚に憧れる若いエルフ。ファルケに叱られてばかり
- trait: `夢見がちで英雄譚に憧れている`
- line: `「この冒険はきっと歌になるさ! よろしくね!」`
- idle:
  - `この話、帰ったら歌にしようかな。`
  - `ねえ、英雄ってこういう道を歩くんだよね?`
  - `ファルケはいつも怖い顔してるなあ。`

### 盗賊

**ロルフ** `rolf` / variant 1 — 皮肉屋だが面倒見のいい盗賊。クヌートの昔の相棒
- trait: `皮肉屋だが面倒見はいい`
- line: `「へっ、またお守り役か。まあいい、ついて来な。」`
- idle:
  - `へっ、静かすぎて逆に気味が悪いぜ。`
  - `鍵があったら俺に任せな。`
  - `クヌートの奴、また借金増やしてねえだろうな。`

**クヌート** `knut` / variant 2 — 小心で早口の盗賊。ロルフに借りがある
- trait: `金にがめついが約束は守る`
- line: `「ひっ、分け前はちゃんと貰うっすよ! 約束は守るっすから!」`
- idle:
  - `お宝の匂いがするっす……たぶん。`
  - `ひっ、今なんか動いたっすよね?`
  - `ロルフさん、借りはそのうち返すっすから。`

⭐ 既存の性格の表 `NPC_TRAITS` のうち「やたらお調子者で場を和ませる」はキャストに使わない。表に無い性格は 3 つ(イレーナ・ガウェイン・ベルント)。
⭐ 「トルガ」はキャストから外れ、撤退先の 90 人の表にだけ残る。
⚠ 独り言の中で仲間の名前(「ブラン」「ファルケ」「クヌート」「ロルフ」「先生」「隊長」)を呼ぶものは、**その相手が同じ隊にいなくても**話す(本チケットでは条件を付けない)。相手がいるときだけ話す形は #118 の名前の差し込みと一緒に検討する。

---

## 5. 実装手順

### 5-1. `js/companion-cast.js`(新規)

- クラシックスクリプト。公開は末尾で `global.DFCast = { ... }`(`js/mercenary-roster.js` と同じ作法)
- `enabled()` = `?cast=0` 以外は true。**呼ぶたびに URL を読む**(`isRecruitOn` と同じ TDZ 回避)
- `CAST` = §4 の 12 人。1 人 = `{ id, classKey, name, trait, line, variant, idle: [...] }`。並びは職ごとに 1 人目 → 2 人目
- `all()` / `byId(id)` / `ofClass(classKey)`(並び順のまま 2 人)/ `idOfName(name)`(無ければ null)
- ⛔ `enabled()` を `all()` 等の中で見ない(データの読み出しは常にできる。判定は呼び出し側)

### 5-2. `tavern.html` — `pickCompanion` の新顔の枝

- `<script src="js/companion-cast.js">` を `js/mercenary-roster.js` の**前**に足す(切り替えが `DFCast` を読むため)
- キャスト ON(`window.DFCast && DFCast.enabled()`)のとき、新顔は `makeNpcMember` ではなく**キャストから**作る:
  1. その職のキャストのうち、`usedNames` にも名簿にも同行の約束にもいない人(名簿・約束の名前は既存の `namesTakenTV()` を使う)
  2. 退避: `usedNames` にいない人(名簿・約束との重複を許す。`pickClassNameTV` の ② と同じ考え)
  3. 退避: 職のキャストの誰か(`pickClassNameTV` の ③ と同じ「重複したまま返す」)
  - 乱数は 1 回だけ(⛔ 引き直しのループを作らない)
  - 返す人物 = `{ classKey, isHero:false, zone, name, trait, line, variant, castId }`(`trait` / `line` / `variant` はキャストのもの)
- 名簿の枝(`vets` から引く)の戻り値にも `castId: DFCast.idOfName(v.name)` を足す(キャスト ON のときだけ。OFF なら付けない = 罠 B)
- 名簿 OFF の枝(`?roster=0`・`tavern.html:5091`)と例外の枝(5097): 既定案 = **キャスト ON ならキャストから作る**(名簿は「覚える」機能、キャストは「誰がいるか」なので独立)。着手時に問題が出たら §12 に書いて判断を仰ぐ

### 5-3. `js/mercenary-roster.js` — 名簿の切り替え(1 回だけ・元を残す)

`load()` の先頭で、**キャスト ON かつ `window.DFCast` がある かつ 写し `dragonfighters.mercRosterPreCast` が無い**ときだけ:

1. 今の名簿の生の文字列を、そのまま `dragonfighters.mercRosterPreCast` へ写す(名簿が無ければ空の名簿の JSON を写す = 切り替え済みの印)
2. 職ごとに、そのキャスト 2 人へ枠を割り当てる(罠 D):
   - ① 名前がキャストと一致する在籍者を、同じ名前のキャストへ(⚠ 職も一致するときだけ)
   - ② 残りの枠へ、残りの在籍者を Lv の高い順(同じなら `runs` の多い順、さらに同じなら `id` の小さい順)に
   - 引き継ぐのは **`id` / `level` / `runs`**。`name` / `trait` / `line` / `variant` はキャストのものにする
   - 枠に入らなかった在籍者は名簿から外す(写しには残っている)
3. 同行の約束(`dragonfighters.recruitCandidates`)から、**キャストにいない名前**の人を外す
   - ⚠ 約束はキャストの名前に置き換えない(引き継ぎ先が名簿と食い違う恐れがある。外すだけ)
4. 引き継いだ人が 1 人以上いたら、`dragonfighters.castNotice = "1"` を書く(§5-4 の知らせ用)
5. 以降は通常の読み込みへ

- ⛔ `next`(id の単調増加)は元の値を保つ
- ⛔ 切り替えは `load()` 以外から走らせない(`all()` / `enroll()` などはすべて `load()` を通るので、それで足りる)
- ⭐ 前置詞は `dragonfighters.` のまま = セーブスロット(`js/save-slots.js` の `keysOf()` の前置詞総なめ)にそのまま乗る。スロットを切り替えて読んだときは、そのスロットで 1 回だけ走る
- `DFCast` が読み込まれていないページでは何もしない(現状、名簿を読むのは酒場だけ)

### 5-4. 酒場で 1 回だけ知らせる

`dragonfighters.castNotice` が `"1"` のとき、名簿パネル(`#rosterOverlay`)を開いたら一覧の上に 1 行出して、キーを消す:

    仲間の顔ぶれが 12 人に決まりました。以前の仲間の育ち(Lv・同行回数)は、同じ職の仲間へ引き継いでいます。

- ⛔ 新しいオーバーレイやトーストは作らない

### 5-5. `index.html` — `castId` の受け取りと歩いている間の独り言

- `<script src="js/companion-cast.js">` を足す(`js/save-slots.js` の近く)
- `index.html:40011` 付近: `ally.castId = m.isHero ? null : (m.castId || null);`(⛔ `npcName` から引かない = 罠 B)
- `sayLine` に `opts.text` を 1 か所だけ足す: `opts.text` が文字列なら `SPEECH_LINES` を引かずにそれを使う。⛔ `opts.text` を渡さない既存の呼び口の振る舞いは変えない
- 独り言 `tickIdleChatter()`:
  - 呼び口は `updateSpeechBubbles();`(`index.html:18100`)の**直後に 1 行**
  - 条件: `currentPhase === "explore"` / `!dialogPaused` / `!gameOver` / 今の時刻が次の予定時刻を過ぎている
  - 話し手: 生きている `allies` のうち `castId` を持ち、画面内(`speechOnScreen`)にいる人からランダム。いなければ予定を少し先へずらすだけ
  - 文面: `DFCast.byId(castId).idle` からランダム。同じ人の直前の 1 本は避ける
  - 積み方: `sayLine("idle.chatter", ally, { text, ambient: true, prio: 0 })`
  - 間隔: 次の予定 = 今 + **25〜45 秒のランダム**(遊んで調整する数値)。最初の 1 本は本体の開始から 15 秒以上あと
  - `castId` を持つ仲間がいなければ何もしない(= `?cast=0` や直起動では一言も出ない)

---

## 6. 項目の割り方(dev-loop 用・1 依頼書 = 4 項目)

1. **着手前の実測 + golden の基準** — §2 の行番号を測り直す / §8 の golden を着手時 HEAD で全部走らせて基準を記録(数字ではなく**落ちている項目の集合**で)/ 罠 C の「旧名簿を直接書くドライバ」の有無を調べる
2. **本体** — §5-1〜§5-5 / 撤退 `?cast=0` / changelog
3. **受入** — `tools/verify_companion_cast.js`(素 + `--negative`)
4. **非退行 + 文書** — golden の再走と言い直し(罠 E)/ 依頼書 §12 / README の #117 行を完了へ

---

## 7. 撤退スイッチ

- **`?cast=0`** — 新顔は 90 人の表から(#72 の姿)/ 名簿の切り替えをしない / `castId` を付けない(⇒ 本体の独り言も出ない)
  - 名簿の読み先: 写し `dragonfighters.mercRosterPreCast` が**あれば写しを読み書きする**(切り替え前の名簿で遊べる)。無ければ今の名簿をそのまま
  - ⚠ 撤退中に写しへ書いた変化は、スイッチを戻すとキャストの名簿には反映されない(2 つの名簿は別々に進む)。仕様として §12 に書く
- ⚠ 判定位置 = `DFCast.enabled()`(`js/companion-cast.js`)。**呼ぶたびに読む**。
  ページ遷移はまたがない — 酒場が判定して `castId` を付けるかどうかで本体の振る舞いが決まるので、本体は URL を読まない(罠 B と同じ理由)

---

## 8. 受入条件 — `tools/verify_companion_cast.js`(新規・ポート 素 **10871** / 変異 **10872〜**)

方針: キャストの中身は**ページの `DFCast` の実体から読む**(⛔ ドライバに 12 人の表を写経しない)。酒場の抽選は `pickCompanion` / `drawTodaysPatrons` を**本番の口のまま**回し、名簿の切り替えは `localStorage` に旧名簿を仕込んで**同じタブで開き直して**測る(⚠ BOOT の purge は `sessionStorage` の印で 1 回だけ = 同じタブの `reload()` なら仕込みが残る。`project_headless_verification` の罠)。

### §0 装置(先に母集団を確かめる)

- **(0a)** `DFCast` が酒場と本体の両方に読み込まれ、`all().length === 12`・6 職 × 2 人・名前が 12 通り(重複なし)
- **(0b)** キャストの名前のうち、`NPC_NAMES_BY_CLASS` のその職の表に**いない**名前がちょうど 1 つ(ラスムーゼン)= 罠 E の母集団。0 なら (3a) の言い直しが空振りしている
- **(0c)** 卓の抽選を 200 回回して、キャスト 12 人全員が 1 回以上出る(母集団が 12 人いることの実測)

### §1 新顔はキャストから

- **(1a)** 名簿が空のとき、卓の 4 人 × 200 回の全員の名前が `DFCast` にいて、その人の職と一致する(⭐ 職は `pickCompanion` の引数と人物の `classKey` の**両方**で突き合わせる)
- **(1b)** 返された人物の `trait` / `line` / `variant` が `DFCast.byId(castId)` と一致する
- **(1c)** 名簿に 1 人目がいるとき、新顔の枝からは 2 人目しか出ない(同じ人が 2 人にならない)
- **(1d)** 名簿の枝から来た人にも `castId` が付いている(罠 A — 名簿に `castId` は保存されていないのに付く)

### §2 名簿の切り替え

- **(2a)** 旧名簿を仕込む: ドワーフ 3 人(「ダグ」Lv3 runs 9 / 「ハルガン」Lv5 / 「ブルム」Lv2)+ 戦士 1 人(「アデラ」Lv4)。酒場を開き直すと:
  - ダグ → ダグ(名前一致・Lv3 のまま)/ ハルガン → ラスムーゼン(残り枠・Lv5)/ ブルム → 名簿から消える / アデラ → イレーナ(Lv4)
  - 引き継いだ人の `id` / `level` / `runs` が元と一致・`name` / `trait` / `line` / `variant` はキャスト
- **(2b)** 写し `dragonfighters.mercRosterPreCast` が**仕込んだ文字列と完全一致**
- **(2c)** もう一度開き直しても名簿が変わらない(1 回だけ)
- **(2d)** 同行の約束にキャスト外の名前とキャストの名前を 1 人ずつ仕込むと、キャスト外だけ外れる
- **(2e)** 空の名簿で開くと、写しが空の名簿として書かれ、知らせのキーは書かれない
- **(2f)** 名簿パネルを開くと知らせの 1 行が出て、2 回目は出ない

### §3 本体

- **(3a)** 酒場から出発すると、本体の仲間全員(主人公を除く)が `castId` を持ち、`DFCast.byId(castId).name === ally.npcName`
- **(3b)** 探索中、時計を進めて独り言が `speechLog` に 1 本以上出る。話し手が `castId` を持つ仲間で、文面がその人の `idle` に含まれる
- **(3c)** 独り言の優先度が 0 で、遭遇のセリフ(`encounter.*`)が積まれたときに押し出されない
- **(3d)** 戦闘中(`currentPhase === "combat"`)と選択肢の表示中(`dialogPaused`)は独り言が出ない

### §4 恒等(非退行)

- **(4a)** `index.html` を直接起動(酒場を通らない)したとき、独り言が一言も出ない(`castId` が無い)
- **(4b)** `sayLine` の既存の呼び口(`opts.text` を渡さない)の振る舞いが変わらない — 既存キーで積んだ文が `SPEECH_LINES` から来る

### §5 撤退

- **(5a)** `tavern.html?cast=0` → 新顔の名前が `NPC_NAMES_BY_CLASS` のその職の表から(#72 の姿)・`castId` が付かない
- **(5b)** `?cast=0` で旧名簿を仕込んで開くと、切り替えが走らない(写しが書かれない・名簿がそのまま)
- **(5c)** 切り替え済みの状態で `?cast=0` で開くと、名簿が写しの中身を返す
- **(5d)** `?cast=0` で出発すると、本体で独り言が出ない(仲間の名前がキャストと同じでも — 罠 B)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `castidfromroster` ⭐罠A | `castId` を名簿の項目から読む(= 常に undefined) | (1d)(3a) |
| `castbyname` ⭐罠B | 本体が `castId` ではなく `npcName` でキャストを引く | (5d) |
| `migrateevery` ⭐罠C | 写しの有無を見ずに毎回切り替える | (2c) |
| `noname1st` ⭐罠D | 名前一致の段 ① を外す | (2a) |
| `nocopy` | 写しを書かない | (2b)(2e)(5c) |
| `keeprecruit` | 約束からキャスト外を外さない | (2d) |
| `idleincombat` | 独り言の `currentPhase` の条件を外す | (3d) |
| `idleprio2` | 独り言を優先度 2 で積む | (3c) |
| `oldnewface` | 新顔の枝を `makeNpcMember` のままにする | (0c)(1a) |
| `nocastoff` | `?cast=0` を見ない | (5a)(5b) |

### 既存 golden の非退行(実装後に必ず走らせる)

着手時 HEAD で全部走らせて**落ちている項目の集合**を記録し、実装後と比べる(#38 の作法 — 数字の一致ではなく集合の一致)。

| ドライバ | なぜ |
|---|---|
| `tools/verify_member_identity.js` | 名前の表・名前 → 職。⚠ (3a) は罠 E で言い直す |
| `tools/verify_mercenary_roster.js` | 名簿の出し入れ。切り替えの印(罠 C)が仕込みを壊さないこと |
| `tools/verify_party_promises.js` | 同行の約束(#60) |
| `tools/verify_recruit_talk.js` | 卓の 4 人と声掛け(#54) |
| `tools/verify_recruit_size.js` | 同行人数 |
| `tools/verify_class_line.js` | 卓の札の職名(#86) |
| `tools/verify_darkvision.js` | 名簿パネルの視界(#39)— §5-4 の知らせの 1 行と同じパネル |
| `tools/verify_hold_person.js` | 名前の表を参照している |
| `tools/driver_speech_engine.js` / `driver_speech_v2.js` / `driver_speech_hooks.js` / `driver_speech_boss.js` | `sayLine` に `opts.text` を足す・独り言の行列 |
| `tools/verify_tower_mother_b.js` / `tools/driver_dev_gate2.js` | `speechLog` を読む |
| `tools/verify_goodberry.js` | 直前のチケット(`0d1885c`) |

⚠ 基準値は着手時に採る(起草時には走らせていない)。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

### ⛔ 測らないこと

- 独り言の**間隔の数字**(25〜45 秒)と**本数**。遊んで動かす余地を残す。測るのは「出る / 出ない / 押し出さない」の向きだけ
- 独り言・性格・ひと言の**文面そのもの**(§4 の全文は承認対象であって assert 対象ではない。ドライバはページの `DFCast` から読む)

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須(file:// ではナレーションが鳴らない)。

1. 既存のセーブで酒場を開く → 名簿パネルに知らせが 1 回出る。育っていた仲間の Lv がキャストに引き継がれている
2. 卓の 4 人がキャストの名前で座り、声掛けのダイアログの性格とひと言がその人らしい
3. ダンジョンを歩いていると、ときどき仲間が独り言を言う。うるさすぎ / 少なすぎないか(25〜45 秒)
4. iPhone の狭い画面で、いちばん長い名前「ラスムーゼン」の札と、独り言の吹き出しが崩れない
5. 同じ職の 2 人が同じ顔なのが気にならないか(codex1 の納品まで)

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>仲間が 12 人の決まった顔ぶれに</b> — 酒場で出会う仲間が、名前と性格と口ぐせを持った 12 人になった。ダンジョンを歩いている間、ときどき独り言も言う。"

---

## 11. やらないこと

- ⛔ **気づいた本人が名前を呼んで伝える**(罠・宝箱・隠し扉・伝承・仲間の HP が減ったとき)= **#118**。本チケットでは `sayLine` に `opts.text` を足すだけで、`{to}` などの差し込みは作らない
- ⛔ **仲間が道を勧めて主人公が返事をする** = **#119**。`chooseExit` は開かない
- ⛔ **2 人目のスプライト 6 体の取り込み**。codex1 への依頼文は計画窓が別に起草する(CLAUDE.md の Codex 自動依頼フロー)。本チケットは `variant: 2` で引く作りにするだけ
- ⛔ 主人公(頭)がキャストの NPC に交代したとき(#115 の昇格)の独り言。話すのは `allies` の仲間だけ
- ⛔ 2 人 1 組の専用の掛け合い(ヨナとガウェインが同じ隊にいるとき等)= 会議の「次回以降の議題」
- ⛔ キャストの生い立ちを酒場で読めるようにする = 同上
- ⛔ 名前の表(90 人)・性格の表・ひと言の表の中身の変更・削除(撤退先)
- ⛔ 名簿の保存形 `normMember` の項目追加
- `実装依頼書/README.md` への行(承認時に計画窓が足す):

    | 117 | [2026-11-21_companion-cast.md](2026-11-21_companion-cast.md) | **承認済** | 0% | 仲間を各職 2 人・計 12 人の固定キャストにする(名前・性格・ひと言・歩いている間の独り言)。⚠⭐ キャストは名前で引き `castId` は酒場が付ける(名簿は知らない項目を落とす / 撤退中の同名の別人を拾わない)/ 名簿の切り替えは写しが無いときに 1 回だけ・元は `mercRosterPreCast` に残す / ラスムーゼンは名前表に無い = #72 (3a) を言い直す / 撤退 `?cast=0` |

---

## 12. 実装結果

### 12-1. 着手前の実測 + golden の基準(項目 1・着手時 HEAD = `e6246bf`)

生ログ・走らせた台本は `C:\Users\PC_User\.claude\dev-loop\r117\item1\`(`run_golden.ps1` / `golden_raw.txt` / `summary.txt` / 各ドライバの `.log` / `remeasure*.log` / `trapC.log`)。

#### (1) §2 の測り直し — 行番号は起草時(`0d1885c`)からずれていない

| 主張 | 測った値(`e6246bf`) | 判定 |
|---|---|---|
| 2-1 `NPC_NAMES` / `NPC_NAMES_BY_CLASS` / `NPC_TRAITS` / `NPC_LINES` | `tavern.html:4970` / `4981` / `4995` / `4998` | ✅ |
| 2-1 `makeNpcMember` / `pickCompanion` / 新顔へ落ちる 4 枝 | `5065` / `5090` / 枝 `5091`・`5097`・`5099`・`5101`(名簿の枝の return は `5104-5106`、`level` と `mercId` も返す) | ✅ |
| 2-1 `npcTrait` / `npcLine` | `index.html:40012-40013` の代入 2 行だけ。読む箇所 0 件 | ✅ |
| 2-2 呼び口 | `buildParty` `5201`(呼び `5216` / `5223`)・`drawTodaysPatrons` `9255`(呼び `9266`)・`regeneratePartyMembers` `7681` | ✅ |
| 2-3 `CAP = 12` | `js/mercenary-roster.js:64` | ✅ |
| 2-4 表示 | `tavern.html:6665-6666` / `6973-6977` / `7746-7747` | ✅ |
| 2-5 受け渡し | `tavern.html:8882` / `8968`・`js/recruit-candidates.js:88` `add`・`index.html:39928` 読み・`40004-40017` で `allies` を作る・`normMember` `js/mercenary-roster.js:102` | ✅ |
| 2-5 `index.html` は名簿を読まない | `<script src="js/` に `mercenary-roster.js` / `recruit-candidates.js` は無い(`39947` はコメント) | ✅ |
| 2-6 絵 | `tavern.html:9229` `PARTY_PORTRAIT_SPRITES`(dwarf は `9231`)/ `index.html:18484` `SPRITE_VARIANTS`(dwarf の [1]〜[3] = `18508-18510`) | ✅ |
| 2-8 吹き出し | `SPEECH_MS` `14084`・`sayLine` `14163`・`sayEnemyCry` `14241`(`ambient` は `14252`)・`speechOnScreen` `14140`・`updateSpeechBubbles` 定義 `14206` / 呼び `18100`(`renderWorld` `18082` の中)・`dialogPaused` `16024`・`gameOver` `14520`・`speechLog` `14105` | ✅ |
| 2-9 `speechLog` を読むドライバ 6 本 | `driver_dev_gate2` / `driver_speech_boss` / `driver_speech_engine` / `driver_speech_hooks` / `driver_speech_v2` / `verify_tower_mother_b` | ✅ |
| 2-10 changelog | `scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` | ✅ |
| 既存の `castId` / `DFCast` / `mercRosterPreCast` | 本番・ドライバとも 0 件 | ✅(新しく作る) |

訂正・補足(どれも設計は崩さない):

- **2-8**: `index.html:16303` は `let currentPhase = "explore";` の**宣言**であって比較ではない。`currentPhase === "explore"` という比較は本番に 0 件(既存の書き方は `currentPhase !== "explore"` `36558` / `=== "combat"` `8351`)。切り替えは `setPhase` `16335`
- **2-8 ⚠ `sayLine` の順番**: `sayLine` は先頭で `resolveSpeechLines(triggerKey)` を引き、**行が無ければ `return false`**(`14165-14166`)。`idle.chatter` は `SPEECH_LINES` に無いので、`opts.text` の分岐は**この行より前**で効かせないと独り言が一言も出ない。また `speechPrio("idle.chatter")` は既定で **2** を返す(`14111-14115`)ので `prio: 0` の明示は必須(§5-5 のとおり)
- **2-2 補足**: 新顔の枝 `makeNpcMember` は `pickUniqueName` の中で `usedNames.add` する。キャストの新顔の枝も `usedNames.add(name)` を自分で行うこと(⛔ 忘れると 1 回の編成で同じキャストが 2 人になり (1c) が赤)
- **5-3 補足**: `DFRoster._wipe()` は `KEY` だけを消す(`js/mercenary-roster.js:243`)。写しを `_wipe` で消すようにすると、`_wipe` → `enroll()` で仕込むドライバ(`verify_member_identity.js:517` / `880`)で次の `load()` が切り替えを走らせる。⛔ `_wipe` に写しを巻き込まない
- **5-3 補足**: モジュールの頭書き `js/mercenary-roster.js:50-52`「読み込んだだけでは localStorage に一切書き込まない」は、§5-3(空の名簿でも写しを書く)で**偽になる**。頭書きを直すこと(文書の嘘を残さない)

#### (2) golden 15 本の基準(着手時 HEAD `e6246bf`・2026-11-21 20:43〜20:58 に走らせた)

| ドライバ | 結果 | 赤の集合 |
|---|---|---|
| `verify_member_identity` | 28/28 | ∅ |
| `verify_mercenary_roster` | 44/44 | ∅ |
| `verify_party_promises` | 35/35 | ∅ |
| `verify_recruit_talk` | 25/25 | ∅ |
| `verify_recruit_size` | 91/91 | ∅ |
| `verify_class_line` | 18/18 | ∅ |
| `verify_darkvision` | 25/25 | ∅ |
| `verify_hold_person` | 31/31 | ∅ |
| `driver_speech_engine` | 18/18 | ∅ |
| `driver_speech_v2` | **45/46** | **{(A1)}** |
| `driver_speech_hooks` | 13/13 | ∅ |
| `driver_speech_boss` | 19/19 | ∅ |
| `verify_tower_mother_b` | 22/22 | ∅ |
| `driver_dev_gate2` | 62/62 | ∅ |
| `verify_goodberry` | 23/23 | ∅ |

**着手前からの赤 = { `driver_speech_v2` (A1) } の 1 件だけ。** 中身は「全敵種に `enemy.cry.<type>` がある」で、鳴き声が無いのは `koboldChief` / `plaguePriest` / `mummy` / `greenHag` / `frostGiant` / `winterWolf` / `swampNovice` / `wyvern` / `wyvernBoss`(#103〜#107 で足した行き先の敵種)。#117 とは無関係 = 基準として残す(別チケット候補)。

- ⚠ **時間帯**: 走らせたのは**夜**(闇市が開いている 20:00〜24:59 の帯)。項目 4 の再走が昼になる場合、酒場に触れる本(`verify_recruit_talk` / `verify_party_promises` / `verify_member_identity` ほか)で差が出たら、まず時刻差(CLAUDE.md #102 節)を疑う。今回の 15 本は時刻での赤は無かった
- ⚠ **`driver_dev_gate2` の装置の不調(本番の不具合ではない)**: 1 回目は rc=3 で 0 判定。`%TEMP%\df_cleanup2_base` が `index.html` の無い半端な状態で残り(git の worktree 登録は生きている)、`prepareBaseline()` が「再利用」にも「作り直し」にも入らず `worktree add` が「already exists」で落ちる。`--baseline <新しいパス>` で再走して 62/62。再走用の worktree は走らせた後に `git worktree remove` 済み。項目 4 でも同じ症状なら `node tools/driver_dev_gate2.js --baseline "%TEMP%\df_cleanup2_base_r117"` で回す

#### (3) 罠 C — 旧名簿を localStorage へ**直接**書いてから開くドライバ

`grep -n "mercRoster" tools/*.js` で名簿のキーに触れるのは `verify_member_identity` / `verify_mercenary_roster` / `verify_darkvision`(`DFRoster` 経由)の 3 本だけ。仕込み方を 1 本ずつ見た:

| ドライバ | 仕込み方 | 切り替えの影響 |
|---|---|---|
| ⚠⚠ `verify_member_identity.js` ユニット **S3d**(`877-938`) | 1 枚目のタブで `DFRoster.enroll()` して**生の文字列を取り出し**、2 枚目のタブを `baseLs(..., { 'dragonfighters.mercRoster': seed.r, 'dragonfighters.recruitCandidates': seed.c })`(`893`)で開く。`seedOnce`(`339-350`)が `dragonfighters.*` を全部消してから入れる = **写し `mercRosterPreCast` は入らない** | **切り替えが走る**。判定 **(3d)**(`1317`)は「読み込み・抽選・出発の後も名簿と約束が 1 バイトも変わらない」(`895` `afterLoad.r === sr`)を見る ⇒ **キャスト ON では赤になるのが正しい**。項目 4 で言い直しが要る(案: 仕込みに写し(空の名簿の JSON)を足して「切り替え済みの世界で名簿が変わらない」に絞る / または S3d を `?cast=0` の腕で回す)。⛔ 期待値を黙って書き換えない |
| ⚠ `verify_mercenary_roster.js` | 仕込みは本番の口(`grow` = 酒場を回す・`DFRoster.load()/save()` の往復 `1171` / `1227`)。直接書きは無い。同じタブの `reload()`(`542`)は印が残るので切り替えは走らない | 罠 C 自体の影響は無い。**ただし別の罠を見つけた**(下の (4)) |
| `verify_darkvision.js` | 酒場を開いてから `DFRoster.enroll()`(`582` / `780`)。`localStorage.clear()`(`384` / `896`)は index / 5 ページの探りで、名簿を入れていない | 影響なし(最初の `load()` で空の名簿の印が立ち、その後の `enroll()` は切り替えに触れない) |

`dragonfighters.recruitCandidates` を `setItem` で直接書くドライバは 0 本(S3d の `baseLs` 経由だけ)。

#### (4) ⚠⚠ 新たに見つけた罠 F — 写しのキー名が「`mercRoster` を含むキーは 1 本」の判定に当たる

`verify_mercenary_roster.js` は名簿のキーを `Object.keys(localStorage).filter(k => k.indexOf('mercRoster') >= 0)` で数える(`464` / `996` / `1286`)。§5-3 の写し **`dragonfighters.mercRosterPreCast` もこの部分一致に当たる**ので:

- **(3a)**(`1300`)「名簿のキーが localStorage に**ちょうど 1 本**」→ 2 本になり**赤**
- **(3c)**(`1307`)「`DFSlots.snapshot()` の data に名簿キーが**ちょうど 1 本**」→ 2 本になり**赤**
- (3b)(`1312`)wipeLive 後 0 本 → 写しも `dragonfighters.` なので消える = 緑のまま
- (6a)(`1046`)`?roster=0` でキー 0 本 → `?roster=0` では `all()` が `load()` を呼ばないので写しは書かれない見込み = 緑のまま(⚠ `load()` を直接呼ぶ口を足すと赤になる)
- 変異 `switchleak`(`318-326`)も `"mercRoster"` の部分一致で名簿を落とす = 写しも一緒に落ちる(変異としては効いたまま)

項目 2 で選ぶこと(どちらでも §5-3 の設計は成り立つ):

- **案 1(推奨)**: 写しのキー名を `mercRoster` を含まない名前にする(例 `dragonfighters.preCastRoster`)。⇒ (3a)(3c) は言い直し不要。依頼書 §5-3 / §7 / §8 (2b)(2e)(5c) のキー名をそろえて書き換え、ここに理由を書く
- 案 2: キー名は依頼書のまま、項目 4 で `verify_mercenary_roster` の (3a)(3c) を「名簿の本体キー `DFRoster.KEY` がちょうど 1 本」へ言い直す

### 12-2. (項目 2 — 本体)

### 12-3. (項目 3 — 受入)

### 12-4. (項目 4 — 非退行 + 文書)
