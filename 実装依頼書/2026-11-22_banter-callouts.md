# #118 気づいた本人が名前を呼んで伝える — 罠・宝箱・隠し扉・伝承・仲間の危機

- **起草**: 2026-11-22(計画窓) / **ステータス**: **承認済**(2026-11-22 ユーザー承認)
- **前提**: #117 固定キャスト 12 人(`ad19da5` 着地・push 済)。`js/companion-cast.js` の `DFCast` と、本体の `ally.castId` を使う。
- **触るファイル**: `js/companion-cast.js` / `index.html` / `js/changelog.js` / `tools/verify_banter_callouts.js`(新規)/ `実装依頼書/README.md`
- ⛔ **触らないファイル**: `tavern.html` / `js/mercenary-roster.js`(酒場側の変更は 0 本。castId は #117 で既に届いている)
- 並走: 起草時の `git status` はクリーン・`origin/main..HEAD` = 0 本 = 並走している窓は無い。

---

## 1. 目的

今は、罠や宝箱を見つけても、吹き出しで話すのは「生きている仲間からランダムに選ばれた誰か」です。探索判定を振ったのが盗賊のロルフでも、話すのは魔法使いかもしれません。隠し扉には吹き出しがありません。敵の正体を思い出しても、ログに 1 行出るだけです。#117 で仲間が名前と口調を持つ 12 人になったので、**見つけた本人が、その人の口調で、仲間の名前を呼んで知らせる**ようにします。仲間の HP が減ったときは、**別の仲間がその人の名前を呼んで**声を掛けます。

**ユーザー決定(2026-11-21 会議 `dev-meetings/2026-11-21_party-banter.md`・2026-11-22 着手指示)**:

- 採用 = 会議の候補 ②「気づいた本人が伝える」(#117 ④・#119 ③と合わせて 3 本に分けたうちの 2 本目)
- 伝承で伝えるのは**既存の体質だけ**(眠りの術が効く/効かない・炎/冷気/雷が効かない・和らげる)。⛔ 「弱点(ダメージ増)」はゲームに仕組みが無いので言わない(会議 M18 の決着)
- セリフは依頼書の段階で全文を書き、承認を取る(実装窓には書かせない)= §4
- 不採用 = 2 人 1 組の専用の掛け合い(ヨナとガウェインが同じ隊のときだけ、など)→ 次回以降の議題

---

## 2. 着手前の実測(2026-11-22・HEAD `ad19da5`)

### 2-1. 呼び口の全数

| ファイル:行 | 何 | 今の話し手 |
|---|---|---|
| `index.html:29128` | `applyPerceptionResult` の `sayLine("find.trap")` | `"party"` = 表示の瞬間にランダム |
| `index.html:29169` | `applyInvestigationResult` の `sayLine("find.chest")` | 同上 |
| `index.html:29144-29158` | `applyRoomSearchDoors`(隠し扉) | **吹き出し無し**(バナーと DM の語りだけ) |
| `index.html:31448` | `runLoreCheck`。成功は `updateInfo("📜 ${repName}は伝承を思い出した — …")`(`31501`)だけ | **吹き出し無し** |
| `index.html:14319` / `14334` | `checkPartySpeech` の `sayLine("combat.lowhp", …)`(本人が言う) | 本人 |

- 3 つの探索の結果の入口は `applyRoomSearchResult`(`index.html:29094`)で、呼び口は `index.html:28759` の 1 か所だけ(`grep -n "applyRoomSearchResult(" index.html` で 2 件 = 定義と呼び口)。
- 罠・宝箱・隠し扉は **1 部屋 1 ロール**(判定は 1 本で、判定者 `res.rep` は 3 つに共通)。

### 2-2. ⚠⚠⚠ 罠 A — `res.rep` は本物の仲間ではなく「判定用の写し」

`buildPerceptionParty()`(`index.html:28595`)は `{ classKey, name, isHero, skillBonus }` の**新しいオブジェクト**を並べて返します。`SkillCheck.resolveSkillCheck`(`js/skill-check.js:464` `var rep = selectRepresentative(party, checkDef)`)が返す `res.rep` は**その配列の要素そのもの**(`m === rep` で比べている・`js/skill-check.js:474`)です。本物の `ally` ではないので、`castId` も座標もありません。

⇒ 伝承(`runLoreCheck` `index.html:31470-31475`)が既にやっている**並び順の対応表**を、探索判定でも同じ形で作ります。`buildPerceptionParty()` の並びは「生きている主人公(先頭)→ 生きている仲間(`allies` の順)」なので、**同じ瞬間に**同じ条件で `units` を並べれば、要素の位置で対応が取れます。

```js
// 伝承の実例 (index.html:31470-31475)
const all = buildPerceptionParty();
const units = [];
if (hp > 0 && !gameOver) units.push("player");
for (const a of allies) if (a.alive) units.push(a);
const unitOf = new Map();
all.forEach((m, k) => unitOf.set(m, units[k]));
```

⚠ 探索判定は `party` を作ってから `await`(判定のパネル)を挟みます(`index.html:28739` → `28758`)。**対応表は `party` と同じ瞬間に作ること**。判定の後で作り直すと、待っている間に誰かが倒れて位置がずれます。
⛔ 写しに `ally` を入れない(`buildPerceptionParty` は変えない)。伝承のコメント(`index.html:31445`)の方針と同じです。
⭐ 変異 `norep` で再現します(話し手を `"party"` に戻す)。

### 2-3. ⚠⚠ 罠 B — 主人公の表示名は「あなた」

`getLeaderName()`(`index.html:22064`)は `headDisplayName` を返し、主人公なら `"あなた"` です(`index.html:8124` / `22182` / `40011`)。主人公を `{to}` に入れると「**あなたさん**、止まってください」になってしまいます。

⇒ `{to}` の候補は**名前(`npcName`)を持つ生きた仲間だけ**にします。主人公は入れません。
⇒ 主人公の HP が減ったときの声掛けは、**`{to}` を含まない行だけ**から選びます。そのため §4 の声の表は、どの場面にも `{to}` を含まない行を 1 本以上入れてあります。
⭐ 変異 `heroname` で再現します(候補に主人公を入れる)。

### 2-4. ⚠⚠ 罠 C — 声掛けを `combat.lowhp` のキーで積むと既存ドライバが赤くなる

`tools/driver_speech_v2.js:309-325` は `speechLog` の `combat.lowhp` の**本数**を数えて、1 回だけ話すラッチを確かめています。声掛けを同じキーで積むと、数がずれて赤くなります。

⇒ 声掛けは**新しいキー `ally.call`** にします。優先度は `combat.lowhp` と同じ 1 にします(`speechPrio` `index.html:14112` の 1 の行へ足す。足さないと、知らないキーとして 2 になります)。
⭐ 変異 `callkey`(キーを `combat.lowhp` に)・`callprio2`(優先度 1 の行へ足さない)で再現します。

### 2-5. ⚠ 罠 D — `checkPartySpeech` の中でレイアウトを読まない

`tools/driver_speech_v2.js:302` (F2) は、`String(window.__speech.checkParty)` に `offsetWidth|offsetHeight|getBoundingClientRect|getComputedStyle|clientWidth` が**含まれない**ことを確かめています(毎回呼ばれる関数なので、強制同期レイアウトを持ち込まないため)。
⇒ 声掛けの話し手選びは別の関数(`pickCallerFor(target)`)に置きます。その関数も、画面内の判定は既存の `speechOnScreen`(キャッシュした値しか読まない)だけを使います。

### 2-6. ⚠ 罠 E — 差し込みの印 `{to}` / `{enemy}` / `{trait}` を `SPEECH_LINES` に入れない

`sayLine(key)` を文面なしで呼ぶと `SPEECH_LINES[key]` から選ぶので、印入りの行を `SPEECH_LINES` に入れると、**どこかの呼び口が文面を渡し忘れたときに「{to}」がそのまま画面に出ます**。
⇒ キャストの声は `DFCast` の `voice` に置き、印の無い汎用の伝承の行は `index.html` の別の定数 `LORE_SHARE_LINES` に置きます。**差し込みを済ませた文を `opts.text` で渡す**(#117 の `idle.chatter` と同じ道)。`SPEECH_LINES` に足すのは印の無い `find.door` だけです。
⭐ 変異 `rawbrace`(`{trait}` を差し込まない)で再現します。受入で「表示された文に `{` が無い」を見ます。

### 2-7. ⚠ 罠 F — `DFCast` の `copyOf` が `voice` を落とすと、黙って汎用の行になる

`js/companion-cast.js` の `copyOf(c)` は項目を名指しで写しています(`id / classKey / name / trait / line / variant / idle`)。`voice` を足しても `copyOf` に足し忘れると、`byId()` が `voice` の無い人を返します。本体は「声が無い = 汎用の行」に倒れるので、**エラーも出さずに口調だけが消えます**。
⭐ 変異 `copyvoice` で再現します。

### 2-8. 伝承の体質の文は長くなり得る

`loreTraitText(e)`(`index.html:31428`)は `、` でつないだ文を返します。最長は「眠りの術が効かない、炎と冷気が効かない、雷を和らげる」のような 3 つ組です。吹き出しは狭い画面で `max-width: 200px` です(会議 §7)。
⇒ **吹き出しでは先頭の 2 つまで**にします(`loreTraitText(e).split("、").slice(0, 2).join("、")`)。ログの 1 行は今のまま全部出します。受入では「吹き出しの体質の文 = ログの体質の文の先頭 2 つ」を、2 つの経路で突き合わせます。
⇒ 種類が 2 つ以上の戦い(`g.types` が複数)は、**吹き出しでは先頭の 1 種類だけ**を言います(ログは全部)。

### 2-9. 吹き出しを読む既存ドライバ

| ドライバ | 縛っていること | #118 で動くか |
|---|---|---|
| `driver_speech_v2` | `combat.lowhp` の本数 (F1/F3)・`checkPartySpeech` のソース (F2) | 罠 C・D を守れば動かない |
| `driver_speech_hooks` | (4) `find.trap` / `find.chest` の話し手が**パーティ**(`player` か `ally`)か | 話し手は判定者 = 主人公か仲間 = 緑のまま |
| `driver_speech_engine` | `say("find.chest")` が `SPEECH_LINES` の行を出す | 文面なしで呼ぶ道は変えない = 緑のまま |
| `driver_speech_boss` / `verify_tower_mother_b` / `driver_dev_gate2` | ボスのセリフ・塔の母・開発用の門 | 触らない |
| `verify_companion_cast` | 独り言 (3a)〜(3d) | `copyOf` に `voice` を足すだけ。`idle` は変えない |

- 探索判定・扉・伝承を読むドライバ(`grep -lE "applyRoomSearchResult|applyRoomSearchDoors|runLoreCheck|__dfLore|roomSearch" tools/*.js`): `driver_doors_p6` / `driver_room_search_roll` / `verify_lore_check` / `verify_corner_check` / `verify_ambush_round` / `verify_goodberry` / `probe_s5s6_clear`。この 7 本は**どれも吹き出しを見ていない**(`grep -nE "speech|sayLine|'party'" …` で 0 件)。
- ⚠ 直起動(酒場を通らない)のドライバでは `castId` が付きません。そのため、キャストの声も声掛けも**出ません**。変わるのは「罠・宝箱の話し手が判定者になる」「隠し扉と伝承に汎用の吹き出しが出る」の 2 点だけです。

### 2-10. 数値

| 対象 | 実測値(出所) | → 採用値 |
|---|---|---|
| 行列の長さ | `SPEECH_MAX_QUEUE = 3`(`index.html:14088`) | 変えない |
| 予約の賞味期限 | `SPEECH_STALE_MS = 6000`(`index.html:14087`) | 変えない |
| 低 HP の閾値 | `SPEECH_LOWHP_RATIO = 0.25` / 再武装 `0.40`(`index.html:14101-14102`) | 声掛けも同じラッチに乗せる(新しい数字を増やさない) |
| 新しいポート | `grep -rhoE "\b1[01][0-9]{3}\b" tools/verify_*.js` で 10881 まで使用・1089x は 0 件 | 素 **10891** / 変異 **10892〜10900** |

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ `index.html` を触るので**鳴る**。プレイヤーに見える変化があるので、要約は書けます(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/companion-cast.js` | 12 人それぞれに `voice: { trap, chest, door, lore, call }`(§4 の全文)/ `copyOf` に `voice` の写しを足す。⛔ `trait` / `line` / `idle` は 1 文字も変えない(#117 で承認済み) |
| `index.html` | `banterOn()` / `SPEECH_LINES["find.door"]` / `LORE_SHARE_LINES` / `castVoiceText()` / `pickToName()` / `pickCallerFor()` / `sayLine` の `opts.meta` / 罠・宝箱・隠し扉・伝承・声掛けの呼び口 / `speechPrio` に `ally.call` |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行 |
| `tools/verify_banter_callouts.js`(新規) | 受入(§8) |

⛔ `buildPerceptionParty` / `js/skill-check.js` / `SPEECH_LINES` の既存の行 / `combat.lowhp` の呼び口 2 か所は変えない。

---

## 4. 声の表(⭐ 承認対象 — 全文)

- `{to}` = 話し手以外の、名前を持つ生きた仲間からランダムに 1 人(⛔ 主人公は入れない・§2-3)。候補がいないときは `{to}` を含まない行だけから選ぶ
- `{enemy}` = 敵の名前(`e.def.name`)/ `{trait}` = 体質の文の先頭 2 つ(§2-8)
- `call` の `{to}` = HP が減った**その人**(相手は決まっている)。相手が主人公のときは `{to}` を含まない行だけ

### 汎用(キャストでない話し手 = 主人公・`?cast=0`・直起動)

- `find.door`(`SPEECH_LINES` に足す): `壁に隙間がある…隠し扉だ。` / `この壁、動くぞ。` / `隠し扉だ。道が続いている。`
- `LORE_SHARE_LINES`(印入り・`SPEECH_LINES` には入れない): `{enemy}だ。{trait}。` / `あれは{enemy}。{trait}はずだ。` / `{enemy}か…{trait}。用心しろ。`
- 罠・宝箱は今の `SPEECH_LINES["find.trap"]` / `["find.chest"]` をそのまま使う(話し手だけが判定者になる)
- 声掛け(`call`)は汎用には無い(キャストだけ)

### 戦士

**イレーナ** `irena`(丁寧で硬い)
- trap: `{to}さん、止まってください。床に罠があります。` / `罠です。足元に注意を。` / `{to}さん、その先の床は踏まないでください。`
- chest: `宝箱を見つけました。皆で検めましょう。` / `{to}さん、こちらに箱があります。` / `勝手に開けないでください。私が見張ります。`
- door: `壁に継ぎ目があります。隠し扉です。` / `{to}さん、この壁、動きます。`
- lore: `あれは{enemy}です。{trait}。` / `{to}さん、{enemy}です。{trait}。心して参りましょう。`
- call: `{to}さん、下がってください!` / `{to}さん、私の後ろへ!` / `無理をなさらないでください!`

**ミラ** `mira`(荒っぽい)
- trap: `おっと、罠だ。{to}、踏むんじゃないよ!` / `罠だよ。面倒くさいねえ。` / `{to}、そこ止まりな! 床がおかしい!`
- chest: `宝箱だ! 先に開けるのはあたしだからね!` / `{to}、見なよ。箱だ!` / `お、いいもん見っけ!`
- door: `なんだこの壁、動くじゃないか!` / `{to}、隠し扉だ。蹴破るかい?`
- lore: `{enemy}だろ? {trait}って聞いたよ!` / `{to}、あれは{enemy}だ。{trait}。あとは殴るだけだろ!`
- call: `{to}、下がりな! あたしが前に出る!` / `{to}、死ぬんじゃないよ!` / `しっかりしな! まだ終わってないよ!`

### ドワーフ

**ラスムーゼン** `rasmussen`(極端に短い)
- trap: `……止まれ。罠だ。` / `……{to}。足元。` / `……踏むな。`
- chest: `……箱だ。` / `……{to}。開けろ。` / `……ある。`
- door: `……壁が、空だ。` / `……{to}。扉だ。`
- lore: `……{enemy}。{trait}。` / `……{to}。{enemy}だ。……{trait}。`
- call: `……{to}、下がれ。` / `……{to}。……任せろ。` / `……死ぬな。`

**ダグ** `dag`(豪快)
- trap: `おっと、罠じゃわい! {to}、踏むなよ!` / `ガハハ、こんな仕掛けで儂を騙せると思うたか!` / `{to}、そこは罠じゃ。酒が飲めなくなるぞい!`
- chest: `宝箱じゃわい! 酒代が出るぞ!` / `{to}、見ろ、箱じゃ! ガハハ!` / `中身が金貨なら一杯おごるわい!`
- door: `ガハハ、この壁は嘘をついとる。隠し扉じゃわい!` / `{to}、石の継ぎ目が新しいわい。扉じゃ!`
- lore: `ありゃあ{enemy}じゃわい! {trait}ぞ!` / `{to}、{enemy}じゃ! {trait}わい!`
- call: `{to}、下がれい! 儂が引き受けるわい!` / `{to}、こんなところで倒れるでないぞ!` / `まだ酒を奢ってもらっとらんぞ!`

### 僧侶

**ヨナ** `jona`(若く丁寧)
- trap: `{to}さん、待ってください! 罠です!` / `神よ……床に罠があります。` / `足元に気をつけてください。罠があります。`
- chest: `宝箱がありました。神の思し召しですね。` / `{to}さん、あそこに箱が。` / `宝箱です。中身はなんでしょう。`
- door: `壁の向こうに、道がありますね。` / `{to}さん、隠し扉です。`
- lore: `先生に習いました。あれは{enemy}。{trait}そうです。` / `{to}さん、{enemy}です。{trait}はずです。`
- call: `{to}さん、下がってください!` / `{to}さん、しっかりしてください!` / `神よ、どうかお守りください!`

**ガウェイン** `gawain`(重々しい)
- trap: `止まれ、{to}。床に罠が仕掛けてある。` / `罠であろう。焦れば踏むぞ。` / `若いの、その石は踏むでない。`
- chest: `宝箱か。中身は道中の糧であろう。` / `{to}、そこに箱がある。` / `慌てて開けるでないぞ。`
- door: `この壁、風が抜けておる。隠し扉であろう。` / `{to}、壁を押してみよ。道がある。`
- lore: `あれは{enemy}。{trait}であろう。` / `{to}、心せよ。{enemy}だ。{trait}。`
- call: `{to}、下がれ! 命を粗末にするでない!` / `{to}、膝をつくのはまだ早いぞ!` / `堪えよ、若いの!`

### 魔法使い

**オズ** `oz`(学者肌)
- trap: `{to}、待った。この床、仕掛けがあるね。` / `理屈で言えば、ここに罠を置くのが一番効率的だね。` / `罠だね。踏むと面倒なことになる。`
- chest: `宝箱だね。中身が書物だといいんだけど。` / `{to}、あそこに箱があるよ。` / `隠し場所としては凡庸だね。宝箱だ。`
- door: `壁の模様が途切れている。隠し扉だね。` / `{to}、この壁は見せかけだよ。`
- lore: `伝承によれば、あれは{enemy}だね。{trait}。` / `{to}、覚えておいて。{enemy}は{trait}。`
- call: `{to}、下がって! 理屈抜きで危ない!` / `{to}、一度引くんだ!` / `無茶だよ、下がって!`

**ベルント** `bernt`(皮肉)
- trap: `ふん、見え透いた罠だ。{to}、踏むなよ。` / `罠だろうよ。若い連中は足元を見ん。` / `止まれ。踏めば痛い目を見るだろうよ。`
- chest: `ふん、宝箱か。期待はせんがね。` / `{to}、そこに箱がある。開けるなら勝手にしろ。` / `宝箱だ。罠でなければ上出来だろうよ。`
- door: `ふん、壁に細工がある。隠し扉だ。` / `{to}、その壁は飾りだ。押してみろ。`
- lore: `ふん、{enemy}だ。{trait}。覚えておけ。` / `{to}、あれは{enemy}だろうよ。{trait}。`
- call: `{to}、下がれ。死んでは報酬も貰えんぞ。` / `ふん、{to}、無茶をするな。` / `引け! 若造が先に死ぬな!`

### エルフ

**ファルケ** `falke`(冷静で簡潔)
- trap: `止まれ、{to}。床の継ぎ目が新しい。` / `罠だ。静かに避けろ。` / `{to}、足を出すな。罠だ。`
- chest: `宝箱だ。慌てるな。` / `{to}、箱がある。周りを見てから開けろ。` / `隠してあった。宝箱だ。`
- door: `壁の奥から風がする。隠し扉だ。` / `{to}、ここだ。壁が動く。`
- lore: `あれは{enemy}だ。{trait}。` / `{to}、用心しろ。{enemy}だ。{trait}。`
- call: `{to}、下がれ!` / `{to}、こっちへ来い!` / `退け。無理をするな。`

**ブラン** `bran`(明るい)
- trap: `わっ、罠だ! {to}、気をつけて!` / `罠を見破るなんて、英雄みたいじゃないか!` / `{to}、そこ踏んじゃだめだよ!`
- chest: `宝箱だ! きっと伝説の品さ!` / `{to}、見て見て! 宝箱!` / `お宝発見! 歌になるぞ!`
- door: `隠し扉だ! 物語みたいだね!` / `{to}、この壁の向こう、道があるよ!`
- lore: `知ってるさ! あれは{enemy}。{trait}んだ!` / `{to}、歌で聞いたよ。{enemy}は{trait}!`
- call: `{to}、下がって! 死んじゃだめだ!` / `{to}! 英雄はここで倒れないよ!` / `しっかり! まだ歌は終わってないよ!`

### 盗賊

**ロルフ** `rolf`(軽口)
- trap: `へっ、罠だぜ。{to}、そこを踏むなよ。` / `古い手だ。罠くらい見りゃ分かるぜ。` / `{to}、止まれ。床に仕掛けがある。`
- chest: `お宝の匂いがするぜ。宝箱だ。` / `{to}、箱があるぜ。` / `へっ、隠し場所が甘いぜ。`
- door: `へっ、隠し扉だ。こういうのは見逃さねえぜ。` / `{to}、その壁、押してみな。`
- lore: `へっ、{enemy}か。{trait}ぜ。` / `{to}、覚えとけ。{enemy}は{trait}。`
- call: `{to}、下がれ! 死んだら分け前もねえぞ!` / `へっ、{to}、無理すんな!` / `一旦引け! 死に急ぐなよ!`

**クヌート** `knut`(小心で早口)
- trap: `ひっ、罠っす! {to}さん、踏まないでくださいっす!` / `床がおかしいっすよ。罠っす。` / `{to}さん、止まってっす!`
- chest: `宝箱っす! 分け前はちゃんと貰うっすよ!` / `{to}さん、箱っす、箱!` / `お宝っす……たぶん。`
- door: `ひっ、壁が動いたっす! 隠し扉っすよ!` / `{to}さん、ここ、扉っす!`
- lore: `ひっ、{enemy}っす! {trait}っすよ!` / `{to}さん、あれ{enemy}っす。{trait}って聞いたっす。`
- call: `{to}さん、下がってくださいっす!` / `ひっ、{to}さん、死なないでくださいっす!` / `こっちっす! 早く下がるっす!`

合計 = 12 人 × 13 本 = 156 本 + 汎用 6 本。
⭐ 体質の文は「〜が効かない」「〜を和らげる」「眠りの術が効く」のどれかで終わります。そのため `{trait}ぞ` / `{trait}わい` / `{trait}っすよ` / `{trait}であろう` / `{trait}はずです` / `{trait}んだ` / `{trait}ぜ` / `{trait}そうです` は、どの終わり方につないでも日本語として通ります(起草時に、3 つの終わり方を全行に当てはめて確かめました)。

---

## 5. 実装手順

### 5-1. `js/companion-cast.js`

- 12 人の各要素に `voice: { trap: [...], chest: [...], door: [...], lore: [...], call: [...] }` を足す(§4 の全文。1 文字も変えない)
- `copyOf` に `voice` の深い写しを足す(場面ごとに `slice()`)。⚠ 罠 F
- ヘッダのコメントの「公開API」に `voice` の形を 1 行足す

### 5-2. `index.html` — 吹き出しの土台(`sayLine` の近く・`index.html:14166` 付近)

```js
// ★#118 撤退スイッチ。呼ぶたびに読む (TDZ 回避・DFCast.enabled と同じ作法)
function banterOn() {
  try { return new URLSearchParams(window.location.search).get("banter") !== "0"; } catch (e) { return true; }
}
const LORE_SHARE_LINES = ["{enemy}だ。{trait}。", "あれは{enemy}。{trait}はずだ。", "{enemy}か…{trait}。用心しろ。"];
// {to} の候補 = 話し手以外の、名前を持つ生きた仲間。⛔ 主人公 ("あなた") は入れない (§2-3)
function pickToName(speaker) { ... }
// 行を選んで差し込む。to が null なら {to} を含まない行だけから選ぶ。差し込み後に "{" が残ったら null (罠 E の保険)
function fillVoice(lines, vars) { ... }
// キャストの声。unit が castId を持たない / voice が無い → null (呼び側が汎用へ倒す)
function castVoiceText(unit, scene, vars) { ... }
```

- `sayLine` に `opts.meta`(任意のオブジェクト)を足す。予約に載せ、`_renderBubble` の `logRow.meta` に写す(検証用。渡さない既存の呼び口は 1 バイトも変わらない)。meta には `{ scene, to }` を入れる
- `speechPrio` の優先度 1 の行に `key === "ally.call"` を足す(罠 C)
- `SPEECH_LINES` に `"find.door": [ …汎用 3 本… ]` を足す(印は入れない)

### 5-3. 探索判定(罠・宝箱・隠し扉)

- `index.html:28739` の `const party = buildPerceptionParty();` の直後で、伝承と同じ対応表 `unitOf` を作り(§2-2)、`.then((res) => …)` で `applyRoomSearchResult(res, …, unitOf)` に渡す
- `applyRoomSearchResult` は `const repUnit = (res.rep && unitOf) ? unitOf.get(res.rep) : null` を 3 つの関数へ渡す
- 罠・宝箱・隠し扉の吹き出しは共通の 1 関数にまとめる:

```js
function sayFind(scene, key, repUnit) {
  if (!banterOn() || !repUnit) return sayLine(key);            // ?banter=0 / 対応が取れない = 今までどおり (party・汎用)
  const to = pickToName(repUnit);
  const text = castVoiceText(repUnit, scene, { to });
  if (text) return sayLine(key, repUnit, { text, meta: { scene, to } });
  return sayLine(key, repUnit);                                // キャストでない判定者 = 汎用の行・話し手は本人
}
```

- 罠 = `sayFind("trap", "find.trap", repUnit)`、宝箱 = `sayFind("chest", "find.chest", repUnit)`、隠し扉 = `sayFind("door", "find.door", repUnit)`(⚠ 隠し扉は今まで吹き出しが無い = `?banter=0` では**何も言わない**。`banterOn()` が false なら `sayFind` を呼ばない)

### 5-4. 伝承

- `runLoreCheck` の成功の枝(`index.html:31495` 付近)で、ログの 1 行の後に 1 回だけ:
  - `e = g.rep[g.types[0]]`(先頭の 1 種類・§2-8)、`trait = loreTraitText(e).split("、").slice(0, 2).join("、")`
  - 話し手 = `unit`(既にある対応表の結果)。キャストなら `castVoiceText(unit, "lore", { to, enemy: e.def.name, trait })`、そうでなければ `fillVoice(LORE_SHARE_LINES, { enemy, trait })`
  - `sayLine("lore.share", unit, { text, meta: { scene: "lore", to, enemy: e.def.name, trait } })`
- 失敗の枝は今のまま(ログ 1 行だけ・吹き出し無し)
- `?banter=0` では何も言わない

### 5-5. 仲間の危機の声掛け

- `checkPartySpeech` の `sayLine("combat.lowhp", a)`(`index.html:14334`)と `sayLine("combat.lowhp", "player")`(`14319`)の**直後**に、`if (banterOn()) sayAllyCall(target)` を 1 行ずつ足す(`combat.lowhp` の行そのものは変えない)
- `sayAllyCall(target)`:
  - 話し手 = `pickCallerFor(target)` = `castId` を持つ生きた仲間で、`target` 本人ではない人。画面内の人を優先(`speechOnScreen`)。いなければ何もしない
  - `to` = 相手が仲間なら `target.npcName`、相手が主人公なら `null`(= `{to}` を含まない行だけ)
  - `sayLine("ally.call", caller, { text, meta: { scene: "call", to } })`
- ラッチは `combat.lowhp` のもの(`lowHpSpoken`)をそのまま使う = 25% を切った瞬間に 1 回だけ(新しい印を作らない)
- ⚠ 罠 D: `sayAllyCall` / `pickCallerFor` は `checkPartySpeech` の外に置く

---

## 6. (欠番 — 酒場側の変更は無い)

---

## 7. 撤退スイッチ

- **`index.html?banter=0`** — 罠・宝箱の話し手はランダム(`"party"`)・汎用の行に戻ります。隠し扉と伝承の吹き出しは出ず、声掛けもしません。つまり、#117 の後の姿と同じです。
- 判定位置 = `banterOn()`(呼ぶたびに URL を読む)。読むのは本体だけです。酒場からの遷移ではクエリを引き継がないので、試すときは本体を直接開きます(`?lore=0` / `?cornercheck=0` と同じ作法)。
- ⚠ `?cast=0` とは独立しています。`?cast=0` でも、判定者が話し手になること、隠し扉・伝承の汎用の吹き出しは残ります(キャストの声と声掛けだけが消えます)。

---

## 8. 受入条件 — `tools/verify_banter_callouts.js`(新規・素 port 10891 / 変異 10892〜10900)

方針: ゲームを最後まで遊ばせず、本体の関数を**直接呼んで**吹き出しの行列と `speechLog` を読みます。仕込みは `verify_companion_cast.js` の作法を流用します(`sessionStorage["dragonfighters.partyMembers"]` に `castId` 入りの人物を入れて `index.html` を開く)。乱数は `Math.random` を差し替えて固定します。

### 計測機構

- 判定の結果は**偽の `res`** を作って `applyRoomSearchResult(res, pendingTraps, …, unitOf)` を呼びます。`res.rep` には `buildPerceptionParty()` の**本物の要素**を入れ、`unitOf` は本番と同じ作り方にします。⚠ 写しの名前で探さず、配列の位置で選ぶこと。
- 隠し扉は `driver_doors_p6.js` の仕込みを流用します(隠し扉のあるノードに入る)。それが重い場合は、`setDoorState` をページ内で一時的に差し替えて true を返させても構いません。§12 にどちらを選んだかを書いてください。
- 伝承は `__dfLore.run([idx])` で呼びます。成功させるには `Math.random` を高い出目に固定します。体質の文は、ログの「📜 …伝承を思い出した — 名前: 体質」の行から**ドライバが自分で切り出します**(2 経路目)。

### §0 装置

- **(0a)** `DFCast.all()` が 12 人で、全員が `voice` の 5 場面を持ち、どの場面も 1 本以上ある。`trap` / `chest` / `door` / `lore` / `call` のどれにも `{to}` を含まない行が 1 本以上ある
- **(0b)** 起動後の `allies` のうち `castId` を持つ人が 2 人以上いる(いなければ以降は全部空振り = exit 1)
- **(0c)** `SPEECH_LINES` のどの行にも `{` が無い(罠 E)

### §1 探索判定

- **(1a)** 判定者 = キャストの仲間 A で罠を見つける → `speechLog` の最後の `find.trap` の行が `castId === A.castId`、文は「A の `voice.trap` の行に、`meta.to` を差し込んだもの」のどれかと一致する(ドライバが自分で差し込んで集合を作る)
- **(1b)** 同じことを宝箱(`find.chest` / `voice.chest`)と隠し扉(`find.door` / `voice.door`)で
- **(1c)** `meta.to` は A 以外の生きた仲間の `npcName` のどれか、または null。null のときは文に他人の名前が無い
- **(1d)** 判定者 = 主人公 → 話し手 `kind === "player"`、文は `SPEECH_LINES["find.trap"]` のどれか
- **(1e)** 判定者を変えて 30 回 → どの文にも「あなた」が無い(罠 B)。表示された文のどれにも `{` が無い(罠 E)

### §2 伝承

- **(2a)** 判定者 = キャストの仲間 B で成功 → `lore.share` の行が 1 本、`castId === B.castId`、`meta.enemy === e.def.name`、`meta.trait` = **ログの行から切り出した体質の文の先頭 2 つ**(2 経路)。文に `meta.enemy` と `meta.trait` が含まれる
- **(2b)** 失敗 → `lore.share` は 0 本(ログの「思い出せない」は 1 行出る)
- **(2c)** 種類が 2 つの戦いで成功 → `lore.share` は 1 本だけ(先頭の種類)
- **(2d)** 判定者 = 主人公 → 文は `LORE_SHARE_LINES` のどれかに差し込んだもの

### §3 声掛け

- **(3a)** キャストの仲間 A の HP を 20% にして `updateInfo` → 行列に `combat.lowhp`(話し手 A)と `ally.call`(話し手 = A 以外の `castId` を持つ仲間・優先度 1)が並ぶ。表示すると、`ally.call` の文に A の `npcName` が入っている
- **(3b)** 主人公の HP を 20% に → `ally.call` の文は `{to}` を含まない行のどれか(「あなた」が無い)
- **(3c)** `castId` を持つ生きた仲間が A だけ → `ally.call` は 0 本
- **(3d)** もう一度 `updateInfo` → `ally.call` は増えない(ラッチ)/ 全快してからまた 20% → もう 1 本
- **(3e)** `combat.lowhp` の本数は、`?banter=0` の腕と同じ(罠 C)

### §4 恒等(直起動 = castId 無し)

- **(4a)** 直起動で罠を見つける → 話し手は判定者、文は `SPEECH_LINES["find.trap"]` のどれか。仲間の HP が減っても `ally.call` は 0 本

### §5 撤退

- **(5a)** `?banter=0` → 罠の予約の `speaker === "party"`、隠し扉と伝承は 0 本、`ally.call` は 0 本

### ⛔ 測らないこと

- どの行が選ばれるかの偏り・吹き出しの見た目(§9 で目で見る)
- 1 場面あたりの本数(§4 で承認を取った数。数字で縛ると直しにくくなる)

### 負のコントロール(`--negative` に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `norep` | 探索の話し手を `"party"` に戻す(罠 A) | (1a)(1b) |
| `copyvoice` | `copyOf` で `voice` を落とす(罠 F) | (0a)(1a) |
| `heroname` | `{to}` の候補に主人公を入れる(罠 B) | (1e)(3b) |
| `callkey` | 声掛けを `combat.lowhp` のキーで積む(罠 C) | (3a)(3e) |
| `callprio2` | `speechPrio` に `ally.call` を足さない(罠 C) | (3a) |
| `callself` | 声掛けの話し手に相手本人を許す | (3a)(3c) |
| `rawbrace` | `{trait}` を差し込まない(罠 E) | (1e)(2a) |
| `loreall` | 伝承の吹き出しを種類ごとに出す / 失敗でも出す | (2b)(2c) |
| `banterleak` | `banterOn()` が URL を見ずに常に true | (5a) |

### 既存 golden の非退行

基準(#117 §12-4・2026-11-21 夜・HEAD `be151cb`):
- `driver_speech_engine` 18/18 / `driver_speech_v2` 45/46 {(A1)}(#117 の前から赤) / `driver_speech_hooks` 13/13 / `driver_speech_boss` 19/19 / `verify_tower_mother_b` 22/22 / `driver_dev_gate2` 62/62(baseline の作り方は #117 §12-4 のとおり)/ `verify_companion_cast` 24/24 / `verify_goodberry` 23/23
- 加えて、着手時に基準を取る(項目 1): `driver_doors_p6` / `driver_room_search_roll` / `verify_lore_check` / `verify_corner_check` / `verify_ambush_round`

⚠ 基準値は 2026-11-21 時点の記録です。**走らせて違ったら、期待値を書き換える前に理由を突き止めること**。期待値の変更は想定していません(§2-9)。

---

## 9. 実機/実感の確認

⚠ ローカルは http で起動すること(file:// ではナレーションの音が出ない)。
1. 酒場から出発し、罠や宝箱を見つけた人がその人の口調で話し、仲間の名前を呼ぶか
2. 戦いの始まりに、伝承を思い出した人が敵の名前と体質を言うか。ロールの吹き出しと重なって読めなくならないか
3. 仲間の HP が減ったとき、別の仲間が名前を呼ぶか。吹き出しが多すぎてうるさくないか
4. iPhone: 「ラスムーゼン」が `{to}` に入った長い行(例: クヌート「ひっ、罠っす! ラスムーゼンさん、踏まないでくださいっす!」)と、伝承の長い行が吹き出しに収まるか

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>見つけた仲間が名前を呼んで知らせる</b> — 罠・宝箱・隠し扉を見つけた本人や、敵の正体を思い出した本人が、仲間の名前を呼んで伝える。仲間が危なくなると、別の仲間が名前を呼んで声を掛ける。"

---

## 11. やらないこと

- ⛔ #119 仲間が分かれ道で道を勧める(次の依頼書)
- ⛔ 弱点(ダメージ増)の仕組み・2 人 1 組の専用の掛け合い(次回以降の議題)
- ⛔ 主人公が倒れて先頭に立った仲間(#115)をキャストの話し手として扱うこと(`castId` は `ally` にしか無い。先頭に立つと汎用の行になる。それで正しい)
- ⛔ 伝承の失敗・ミミックの看破・罠の解除・開錠の吹き出し
- ⛔ `driver_speech_v2` (A1)(敵種 9 つの鳴き声)・`driver_dev_gate2` の baseline の作り直し(#117 の別チケット候補のまま)
- ⛔ `SPEECH_MAX_QUEUE` / `SPEECH_MS` などの吹き出しの数字

---

## 12. 実装結果

### 12-1. 着手前の実測(項目 1・2026-11-22 朝・HEAD `6732996`)

コードは 1 バイトも変えていない。`6732996` は依頼書だけのコミットなので、`ad19da5` 時点の行番号がそのまま使える(ずれは下の 3 か所だけ・どれも起草時の書き間違い)。

#### 測り直し(§2)

| 節 | 主張 | HEAD の実測 | 判定 |
|---|---|---|---|
| 2-1 | 罠 `sayLine("find.trap")` `29128` / 宝箱 `29169` / 隠し扉 `applyRoomSearchDoors` `29141`(吹き出し無し)/ 低 HP `14319`・`14334` | 同じ行。隠し扉は `showBanner` + `showDMMessage`(`29149-29152`)だけ | ✅ |
| 2-1 | `runLoreCheck` `31448`・成功のログ `31501` | 定義 `31448` は同じ。成功のログは **`31502`**(`31501` は `lines` を作る `})` の行) | ✅(行 +1) |
| 2-1 | `applyRoomSearchResult` 定義 `29094`・呼び口 `28759` の 1 か所 | `grep -n "applyRoomSearchResult(" index.html` = 2 件(`28759` / `29094`) | ✅ |
| 2-2 | `buildPerceptionParty` `28595` は `{classKey,name,isHero,skillBonus}` の新しいオブジェクト / 仲間の要素には `isHero` が無い | そのとおり(`28598` 主人公・`28605` 仲間) | ✅ |
| 2-2 | `res.rep` は写しの要素そのもの | `js/skill-check.js:464` `var rep = selectRepresentative(...)`・`:475` `m === rep`(起草時の `:474` は **`:475`**)・結果へは `o.rep = rep`(`:484` / `:490` = 自動と手動の両方の道) | ✅(行 +1) |
| 2-2 | `const party = buildPerceptionParty();` `28739` → `.then` `28758` | 作るのは **`28736`**(`28739` は `baseDc`)。待つのは `await` ではなく `dfSkillCheck(...).then((res) => …)`(`28748` → `28758`)。関数は `runRoomSearchCheck()`(`28689`・async ではない)で、呼び口は毎歩の `21248` と、隠し扉が残るときだけ `await` する `42488` の 2 本 | ⚠ 行の書き間違い(中身は同じ: `unitOf` は `28736` の直後で作る) |
| 2-2 | 伝承の対応表 `31470-31475` | **`31467-31472`**(`all` → `units` → `unitOf`)。`res.rep` から `unit` を引くのは `31490`。表は技能ごとのループの中・`await dfSkillCheck`(`31484`)の前で作っている | ⚠ 行 −3(中身は同じ) |
| 2-3 | `getLeaderName` `22064` が `headDisplayName` / 主人公は「あなた」(`8124` / `22182` / `40011`) | そのとおり | ✅ |
| 2-4 | `speechPrio` `14112`・優先度 1 の行 = `combat.crit` / `combat.lowhp` / `phase.rest`(`14114`)・知らないキーは 2 | そのとおり。`ally.call` / `lore.share` / `find.door` はどこにも無い(`grep` 0 件) | ✅ |
| 2-4 | `driver_speech_v2.js:309-325` が `combat.lowhp` の本数を数える | `(F3)` の本体 = `:309-330`。主人公の HP だけを動かす・直起動 = `castId` 無し ⇒ 罠 C を守れば `ally.call` は 1 本も積まれない | ✅ |
| 2-5 | `driver_speech_v2.js:302` (F2) が `String(window.__speech.checkParty)` に `offsetWidth` 〜 `clientWidth` の 5 語が無いことを見る | `:302`。`__speech.checkParty = checkPartySpeech`(`14344`) | ✅ |
| 2-5 | `speechOnScreen` はキャッシュしか読まない | `14141`・`lightCssW/H` と `camZ` だけ(`window.innerWidth` は未設定時の保険) | ✅ |
| 2-6 | `sayLine` が文面なしなら `SPEECH_LINES` から選ぶ / `opts.text` の道 | `14166-14188`。`opts.text` があると `resolveSpeechLines` を飛ばす(`14168`)。予約は `{key,text,speaker,dropAfter,prio}` で **`meta` の欄はまだ無い**。`_renderBubble`(`14189`)の `logRow`(`14204-14205`)は `{key,text,kind,cry,at}` + キャストのときだけ `castId` | ✅(`meta` は項目 2 で足す) |
| 2-6 | `SPEECH_LINES` のどの行にも `{` が無い | `13986` からの表に `{` で始まる差し込みは 0 件。`find.trap` 4 本・`find.chest` 4 本 | ✅ |
| 2-7 | `copyOf` が名指しで写す(`voice` を落とす) | `js/companion-cast.js:100-103` `{ id, classKey, name, trait, line, variant, idle: c.idle.slice() }`・`all` / `byId` / `ofClass` が全部これを通る | ✅ |
| 2-8 | `loreTraitText` `31428` が `、` でつなぐ | そのとおり(`31428-31442`)。⚠ **ログの行は `名前 (脅威度 X): 体質` の形**(`31500`・`loreCrText` が空なら括弧ごと無い)。受入 (2a) で体質を切り出すときは「最初の `: ` の後ろ」を取ること(名前の直後で切ると括弧が混ざる)。複数の種類は ` / ` でつながる | ✅(受入への注意) |
| 2-10 | `SPEECH_MAX_QUEUE = 3` `14088` / `SPEECH_STALE_MS = 6000` `14087` / `0.25` `14101` / `0.40` `14102` | そのとおり | ✅ |
| 2-10 | 「`tools/verify_*.js` で 10881 まで使用」 | ⚠ **崩れている**: `verify_pen_sample.js` が 11025、`verify_plaza_hours.js` が 11398 を使う(10 番台の上は 10881 まで)。ただし **10891〜10900 は `tools/` `scripts/` `js/` `*.html` のどこにも無い** ⇒ 採用値 素 10891 / 変異 10892〜10900 はそのまま使える | ⚠ 根拠の文だけ誤り・結論は有効 |
| 2-11 | `check_changelog.py:32` `GAME_LOGIC = ("index.html","tavern.html","audio.js")` | `:32` に同じ定義(`:8` はドキュメント文字列の中の写し) | ✅ |
| 2-9 | 探索・扉・伝承を読むドライバ 7 本は吹き出しを見ていない | 同じ 7 本。§2-9 と同じ grep(speech / sayLine / `'party'` の 3 語)= 6 本 0 件・`probe_s5s6_clear` だけ 1 件だが CSV の列名 `'party'` で吹き出しとは無関係 | ✅ |

#### golden 13 本(HEAD `6732996`・直列・2026-11-22 06:28〜06:40 = 昼)

ログ = `C:\Users\PC_User\.claude\dev-loop\r118\item1\`(`run_golden.ps1` / `golden_raw.txt` / 各 `<driver>.log`)。

| ドライバ | 基準 | 今回 | 赤 | 備考 |
|---|---|---|---|---|
| `driver_speech_engine` | 18/18 | 18/18 | ∅ | |
| `driver_speech_v2` | 45/46 | 45/46 | {(A1)} | 既知(敵種 9 つの鳴き声が無い・#118 の範囲外) |
| `driver_speech_hooks` | 13/13 | 13/13 | ∅ | (4) の罠/宝箱は今回も出現せず = スキップ(判定成功依存) |
| `driver_speech_boss` | 19/19 | 19/19 | ∅ | |
| `verify_tower_mother_b` | 22/22 | 22/22 | ∅ | 339 秒 |
| `driver_dev_gate2` | 62/62 | 62/62 | ∅ | `--baseline %TEMP%\df_cleanup2_base_r118i1` で回し、後で `git worktree remove` 済み(既定の `df_cleanup2_base` は壊れたまま・触っていない) |
| `verify_companion_cast` | 24/24 | 24/24 | ∅ | |
| `verify_goodberry` | 23/23 | 23/23 | ∅ | |
| `driver_doors_p6` | (新) | **40/40** | ∅ | |
| `driver_room_search_roll` | (新) | **39/39** | ∅ | 夜に固定する種まき(`plazaClock=21`)を自前で持つ |
| `verify_lore_check` | (新) | **26/26** | ∅ | ⚠ 1 回目は 25/26 {(0e)}: `Failed to load resource: net::ERR_NO_BUFFER_SPACE`(直前のドライバ終了の 1 秒後に起動・Windows のソケット枯渇)。単独で再走して 26/26(`verify_lore_check.rerun.log`)。コードの赤ではない |
| `verify_corner_check` | (新) | **20/20** | ∅ | |
| `verify_ambush_round` | (新) | **18/18** | ∅ | |

**赤の集合 = { `driver_speech_v2` (A1) }**(#117 §12-4 と同じ)。

#### 項目 2 への注意

1. 行番号は上の表の HEAD の値を使う(とくに `party` は `28736`、伝承の対応表は `31467-31472`、伝承の成功ログは `31502`)。
2. `unitOf` は `28736` の直後・`28737` の `return` より後で作り、`.then` の中の `applyRoomSearchResult(...)`(`28759`)へ渡す。`42488` は `runRoomSearchCheck()` の戻り値を待つだけなので引数は変わらない。
3. `sayLine` の予約にも `logRow` にも `meta` の欄は無い ⇒ 項目 2 で予約と `_renderBubble` の `logRow` の両方へ足す(渡さない呼び口では欄ごと付けない = `castId` と同じ作法にすると既存ドライバの行の形が変わらない)。
4. 受入 (2a) の 2 経路目は `📜 …は伝承を思い出した — ` の後ろを ` / ` で割り、各要素の**最初の `: ` の後ろ**を体質の文とする(`(脅威度 X)` が名前と `:` の間に入る)。
5. 新しい受入のポート 10891〜10900 は空いている(§2-10 の根拠の文だけが誤り)。
6. golden を続けて回すとき、短いドライバの直後に `ERR_NO_BUFFER_SPACE` が出ることがある ⇒ 赤が出たら単独で 1 回再走してから判断する。
