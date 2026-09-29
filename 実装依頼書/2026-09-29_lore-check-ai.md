# #76 伝承判定 — 戦いの始まりに敵の正体を思い出し、効く呪文を選ぶ

- **起草**: 2026-09-29(計画窓 = 起草窓) / **ステータス**: **完了**(2026-09-30 実装窓・項目1〜5 / 承認 2026-09-29)
- **着手**: 実装窓は**窓更新を挟んでから**着手する(2026-09-28 の恒久ルール)
- **触るファイル**: `index.html` / `tavern.html`(changelog 1 行だけ)/ `tools/verify_lore_check.js`(新規)/ `tools/probe_s5s6_clear.js`(スイッチ表に 1 キー足すだけ)
- ⛔ **触らないファイル**: `js/skill-check.js` / `js/abilities.js` / `audio.js` / `title.html` / `tavern.html` の changelog 以外(§2-9 で開く必要が無いことを確認済み)
- 並走: 実装窓(claude-74)は #75 完了後で待機中。作業ツリーは clean(2026-09-29 `git status --short` = 0 行・HEAD `ba2e258`)。
  それでも作法は守る: `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

「敵の様子を探る魔法」シリーズの **2 枚目(A-2)**。会議記録 `dev-meetings/2026-09-28_scouting-magic.md`(第 2 段 + 修正 1・2)が唯一の正。

A-1(#75)で敵に 5e SRD どおりの体質が付いた(アンデッドと構造体は眠らない / 赤竜に炎は効かない / レイスたちは冷気や雷を和らげる)。
しかし味方の AI は体質を見ていないので、**アンデッドの群れにスリープを撃って空振りし、ファラクサスにファイアボルトを撃つ**。
#75 の勝率記録では、S5 でスリープ 21 回のうち眠らなかった敵が延べ **40 体**あった(#75 §12-4)。

本チケットでは、戦いの始まりに**伝承の技能を持つ者だけが**敵の正体を思い出す判定を振り、成功したら AI がその知識で呪文を選ぶ。

**ユーザー決定(2026-09-28・会議)**:

- 伝承判定は**技能の習熟を持つ者だけが振れる**。技能は今は職業で決まる(魔法学 = 魔法使い・エルフ / 歴史 = 魔法使い / 宗教 = 僧侶)。キャラクリエイトで技能を選ぶのは別チケット。
- 判定に成功したら AI が特性を「知る」: 眠るならスリープを優先、効かない属性・眠らない相手には撃たない。失敗・技能なしなら今までどおり知らないまま選ぶ(眠らない敵にスリープを撃つこともある)。
- 表示は成功時に 1 行(「〇〇は伝承を思い出した — 奴らは炎を嫌う」のように)。誰も持っていなければ判定を出さず「正体を知る者はいない」と 1 行。
- 獣(自然の技能)は**判定の対象外**(嘘の技能で振らない)。
- **(2026-09-29 追加)判定に成功したら、その敵の脅威度(CR)も分かる**。値は **5e SRD 5.1 の CR をそのまま**使い、**ログと頭上の名前札**の両方に出す(ユーザー決定。起草者の推奨「ゲーム内の強さで決める」は不採用 ⇒ リッチは 21、ストーンゴーレムは 10 と出る)。
  名前を「見抜くまで伏せる」案は、名前を出す場所が 179 か所ある大きな改修なので**別チケット**(§11)。
- ⚠ 修正 1 の「炎に弱いなら炎を優先」は、A-1 のユーザー決定(SRD 厳守・弱点 0 件)により**該当する敵が居ない**。器(効き目の高い属性を選ぶ)は作るが、今のデータでは「効きにくい・効かない属性を避ける」側だけが発火する(§2-6)。

---

## 2. 着手前の実測(HEAD `ba2e258`・2026-09-29)

### 2-1. 会議の前提のうち、崩れていたもの(7 件)

| # | 会議記録の主張 | 実測 | 影響 |
|---|---|---|---|
| 1 | 伝承判定の差し込み口は `detectEnemyFamily` / `ENEMY_FAMILY_MSG` | `detectEnemyFamily` は `runEncounter` の**ボスが居ない枝でしか呼ばれない**(`index.html:21505`。ボスが居ると `:21497〜` の `boss_appear` 側へ行く)。⇒ **リッチ・ファラクサスの戦いでは呼ばれない** | 差し込み口は分岐の外(イニシアチブの後)。§2-2 罠 1 |
| 2 | 系統の判定を流用する | `detectEnemyFamily` は構造体・ガーゴイル・単眼の暴君・キマイラなどを `generic` に落とし、ミノタウロスを `orc` にする(`:14422〜14447`) | 伝承用に**敵キーごとの表**を新しく持つ(§2-4) |
| 3 | 呪文には属性(`element`)が付いている | 属性は**詠唱の演出 `dfPlayCast(…, { element })` にだけ**ある(`:28054` 他)。呪文の定義 `MAGE_SKILLS` / `ELF_SKILLS`(`:22197〜22310`)には無い。しかも演出の名前は `ice`、体質の表は `cold` | 呪文 → 属性の表を新しく持つ。演出の `element` を読まない。§2-2 罠 3 |
| 4 | アンデッドと分かったら僧侶がターン・アンデッドを優先する | **既にそうなっている**。`clericAI` は緊急回復 → ホールド・パーソン(アンデッドを除外)→ ターン・アンデッド(射程内にアンデッドが居れば確率ゲートなしで撃つ `:30269〜30278`) | 僧侶の AI は触らない |
| 5 | 物理に免疫の敵には魔法を優先 | 魔法使いの AI は物理と魔法を比べていない(スロットがあれば必ず呪文 → 無ければスリング)。戦士・ドワーフには魔法が無い | 本チケットでは扱わない(§11) |
| 6 | 技能は「今は持っていなくても誰でも振れる」 | 正しい。`resolveSkillCheck` は習熟で絞らず、代表と補助(Help)を全員から選ぶ(`js/skill-check.js:464〜470`)。**習熟で絞る前例**は隠密の接近 `tryStealthSurprise` の `canSneak`(`index.html:25407〜25411`) | 振る前に**習熟を持つ者だけの配列**を作って渡す。§2-2 罠 4 |
| 7 | 判定パネルが 2 枚続く(伝承 → 隠密)とテンポが落ちる | パネルは待ち 2.0 秒 + 結果 3.6 秒(`AUTO_ROLL_MS` / `RESULT_HOLD_MS` `js/skill-check.js`)。戦闘のたびに出ると重い | **パネルは出さない**(`opts.auto: true`)。出目は術者の頭上のロール吹き出しとログ 1 行で見せる(§6) |

### 2-2. ⚠⚠⚠ 見つけた設計上の罠(すべて §8 の変異に内蔵する)

**罠 1 — ボスの戦いで判定が消える**(変異 `bossbranch`)

```js
      const bossIdx = initialEngaged.find(i => enemies[i].def.maxSummons > 0 || enemies[i].def.eyeStalks);
      if (bossIdx !== undefined) {
        …narrate("boss_appear", …)
      } else {
        const fam = detectEnemyFamily(initialEngaged);   // ← :21505
        showDMMessage(ENEMY_FAMILY_MSG[fam] || …)
```

系統のメッセージの隣に判定を置くと、**伝承がいちばん効く相手(リッチ = 冷気・雷を和らげる / ファラクサス = 炎が効かない)の戦いで判定が出ない**。
⇒ 判定は分岐の外、**イニシアチブの行動順を出した後(`:21662`)・`tryStealthSurprise()`(`:21668`)の前**に置く。

**罠 2 — 何も知らない時に乱数の消費がずれる**(変異 `rngparity`)

母集団のほぼ全部の本が `index.html` の戦闘を回す。**何も知らない状態では、AI の分岐と `Math.random()` を引く回数・順序を今と 1 回も変えてはいけない**。
例: スリープの枝 `:30379〜` は今 `unstunnedEnemies.length >= 2 && Math.random() < apGateP(…)` の順で、2 体未満なら乱数を引かない。知識の判定を `Math.random()` より後ろに置くと崩れる。
⭐ 乱数がずれるのは「判定を振った時(d20 を 1 回)」と「知っている相手に対して分岐が変わった時」だけ。

**罠 3 — 演出の `element` は体質の名前と食い違う**(変異 `iceword`)

演出はコーンオブコールド・アイスストームを `'ice'` と呼ぶ(`:29093` / `:29182`)。体質の表 `ENEMY_TRAITS` は `"cold"`(`:27493〜`)。
演出から属性を拾うと `enemyElementMult(e, "ice")` が**黙って 1(等倍)を返し**、カエルム(冷気が効かない)にコーンオブコールドを撃ち続ける。
⇒ 呪文 → 属性の表(§4)は体質の表と同じ語(`fire` / `cold` / `lightning`)で書く。

**罠 4 — 習熟の無い者が代表や補助に選ばれる**(変異 `nogate`)

`resolveSkillCheck(checkKey, dc, party)` は渡された全員から代表と補助を選ぶ。`buildPerceptionParty()`(`:25213`)をそのまま渡すと、**宗教を持たない戦士が代表になってアンデッドを見抜く**。
⇒ 渡す前に `CLASS_PROFICIENCIES[m.classKey]` に技能がある者だけへ絞る。絞った結果が 0 人なら振らない(「正体を知る者はいない」の 1 行)。
⭐ 補助(Help +2)も絞った配列から選ばれる = 習熟を持つ者が 2 人いれば +2 が乗る(5e の Help と同じ)。

### 2-3. 判定の成り立ち(数字の出所)

- 判定値 = 能力修正 + 習熟 +2 + 装備(`checkScore` `js/skill-check.js:105〜112`)。能力値は `js/abilities.js:41〜48`。

| 職業 | 技能 | 能力値 | 判定値 | DC 10 の成功率 | DC 15 の成功率 |
|---|---|---|---|---|---|
| 魔法使い | 魔法学・歴史 | INT 15 → +2 | **+4** | 75%(d20 ≥ 6) | 50%(d20 ≥ 11) |
| エルフ | 魔法学 | INT 14 → +2 | **+4** | 75% | 50% |
| 僧侶 | 宗教 | WIS 15 → +2 | **+4** | 75% | 50% |

- 習熟を持つ者が 2 人いれば補助 +2 → 85% / 60%。出目 1 は必ず失敗、20 は必ず成功(`computeOutcome`)。
- **DC**: 敵の定義に脅威度(CR)が無い(51 種すべて `xp:` だけ)。⇒ **雑魚 10 / ボス格 15**(`isBossLikeDef(def)` `:32114` = `isBoss || eyeStalks || maxSummons > 0`)。1 回の判定に複数の種類が入るときは最大の DC。

### 2-4. 敵キー → 伝承の技能(51 種の振り分け)

5e の「クリーチャーの種類 → 知識の技能」に合わせる(人型 = 歴史、アンデッド = 宗教、竜・構造体・元素・異形 = 魔法学、獣・怪物 = 自然 = 対象外)。
キーは `ENEMY_TYPES`(`:9645〜`)の実物から抜いた(下のコマンド)。

| 技能 | 持ち主 | 敵キー | 数 |
|---|---|---|---|
| **歴史** | 魔法使い | goblin / goblinArcher / goblinShaman / goblinBrute / goblinRider / goblinKing / goblinChariot / hobgoblin / kobold / orc / orcGrunt / orcArcher / orcShaman / orcBerserker / garrock / bandit / banditArcher / banditMage / banditHeavy / scar / lizardWarrior / lizardHunter / lizardRaider / lizardPriest / swampNovice / lizardChieftain | 26 |
| **宗教** | 僧侶 | skeleton / zombie / skeletonArcher / wraith / lich / caelum / ghostFlame(= `isUndeadEnemy` が真の 7 キー) | 7 |
| **魔法学** | 魔法使い・エルフ | pharaxus(竜)/ stoneGolem / animatedArmor / stoneLegionary(構造体)/ gargoyle(元素)/ sovereignEye(異形)/ **hydra**(§2-8 の判断 1) | 7 |
| **対象外**(自然) | — | rat / plagueFrog / ruinSpider / direBear / chimera / griffon / umber_hulk / minotaur / shadowBeast / mimic / caravanWagon(護衛対象) | 11 |

合計 51 = `ENEMY_TYPES` のキー数(#75 §2-1 と一致)。

    awk 'NR>=9645 && NR<=10900 { if (match($0,/^      ([A-Za-z_]+): \{/,m)) {key=m[1]; ln=NR} if (key!="" && match($0,/^        name: "([^"]+)"/,n)) {printf "%s\t%d\t%s\n", key, ln, n[1]; key=""} }' index.html

### 2-5. AI の現状(何を変えるか)

| 誰 | 場所 | 今 | 本チケット |
|---|---|---|---|
| 味方の魔法使い | `mageAI` `:30350` のスリープ `:30379〜30388` | 未スタンの敵 2 体以上 & 50% | 知っていて眠らない敵は数に入れない / 知っていて**眠る**敵が 2 体以上なら 50% のゲートを外す |
| 同上 | 攻撃呪文 `:30393〜30450`(`fallbackOrder` `:30433`) | 脅威度で 1 本選ぶ。対象は最寄り `pickClosestEngagedEnemyFromAlly` `:27244` | 対象に**効かない**属性の呪文を候補から外す / 選んだ呪文より効き目の高い候補があれば差し替える |
| 味方のエルフ | `elfAI` `:31278` のライトニング・アロー `:31308〜` | 脅威度 18 以上で撃つ | 対象に雷が**効かない**と知っていれば撃たない |
| 主人公(魔法使い・エルフ) | `playerAttackTurn` の候補 `activeEquipped` → `pickLeaderAction` `:32378`(呼び口 `:32652`) | 重み付き抽選(`Math.random` をちょうど 1 回) | 効かない呪文・眠らない相手だけのスリープを候補から外す / 重みに効き目の倍率とスリープの倍率を**クランプの後**に掛ける(`AP_BOOST` `:32472` と同じ位置) |
| スリープの狙点 | `allySleep` `:28133` の 2x2 の評価 `:28188` / `:28224` | 範囲に入る敵の数 | 数えるのは「知っていて眠らない」を除いた数(撃つかどうかは変えない) |
| 僧侶 | `clericAI` `:30227` | ターン・アンデッドは既に最優先級(§2-1 #4) | **触らない** |

### 2-6. 効き目の判定は #75 の関数をそのまま使う

- `enemyElementMult(e, element)` `:27504`(0 / 0.5 / 1)と `enemySleepImmune(e)` `:27513`。窓 `window.__dfEnemyTraits` `:27521`。
- ⭐ AI は「知っている時だけ」これらを読む: `loreMult(e, spellId) = loreKnows(e) ? enemyElementMult(e, 属性) : 1`。
- `?enemytraits=0` の時は体質そのものが消える(全部等倍・全部眠る)ので、知っていても AI は何も避けない = 矛盾しない。
- 弱点(倍率 > 1)は今の表に 0 件。差し替えの規則は「倍率が最大の候補」で書くので、将来弱点を足せば「炎に弱いなら炎」がそのまま成立する(受入 §2 の (2e) で、ドライバが実行時に倍率 2 を返させて器を確かめる)。

### 2-7. 知識の持ち方

- 知っている敵キーの集合 `LORE_KNOWN` と、振った敵キーの集合 `LORE_TRIED`(どちらもページ単位)。
- `index.html` は出発のたびに読み直される(酒場 → `departToScenario()`、自動デバッグの 2 走行目も `?autodebug=resume` で読み直し)⇒ **1 回の冒険の間だけ覚えている**。ノードをまたいでも同じページなので残る。
- 1 種類につき 1 回の冒険で 1 回だけ振る(失敗したら、その冒険中は思い出せない = 5e の知識判定の作法)。
- ~~途中から加わる敵(増援・召喚)は、次の戦いの始まりまで判定しない(知らないまま扱う)。~~
  ⇒ **2026-09-29 仕様変更 (A) で取り消し**(ユーザー承認・起草窓 claude-2e 経由)。項目4 の実走で S6 竜の巣のファラクサスに判定が **0/10 回**だった(ボスは戦闘の途中で増援として合流する = §2-2 罠 1 の目的「ファラクサス戦でも振る」が不成立)。
  **新**: 戦闘の途中で合流した敵(増援・召喚された手下・戦車の乱入・暴君の手下・隊商護衛の波)のうち未判定の種類にも、合流したその場(イニシアチブの後)で判定を振る。1 種類 1 冒険 1 回(`LORE_TRIED`)・「正体を知る者はいない」は 1 冒険 1 技能 1 行・振る種類が無ければ `Math.random` を引かない(罠 2)は不変。実測と実装は §12-4b。

### 2-8. 判断を要した 4 点(起草者が決めた。変えたいなら承認時に)

1. **ハイドラを魔法学にする**。
   - 5e SRD では Hydra は「怪物(monstrosity)」= 自然の技能 = 本チケットでは対象外になる。
   - 会議(ガイウス)は「ハイドラ・竜・構造物は魔法学」と決めている。ハイドラは体質なし(= 知って分かるのは「眠る」だけ)なので、どちらでもゲームへの影響は小さい。
   - ⇒ **会議記録に合わせて魔法学**。SRD に寄せたいなら表から 1 行外すだけ。
2. **判定パネルを出さない**(§2-1 #7)。出目は頭上のロール吹き出しとログ 1 行で見せる。
   - パネルは戦闘のたびに 5.6 秒止まり、隠密の接近のパネルと続けて出る。
   - ⇒ 実機で「見せたい」となったら `opts.auto` を外すだけで戻せる形にしておく。
3. **脅威度は、SRD に元が無い敵には出さない**(§2-10 の規則 ③・17 種)。
   - 「SRD の CR をそのまま」の決定に合わせ、推測の値を SRD の値に見せかけない。ボスではゴブリンキング・ガロック・リザードマン族長・単眼の暴君が「脅威度なし」になる。
   - 近い SRD 種族の値で埋めたいなら、表に行を足すだけ(例: goblinKing → bugbear 1)。
4. **ファラクサスは Young Red Dragon(CR 10)**。
   - #75 の体質表は「Adult Red Dragon」と書いたが、体質(炎が効かない)は Young も同じなので #75 の挙動は変わらない。
   - CLAUDE.md の設計は「3.5 ジュベナイル・レッドドラゴン CR10 ベース」で、5e SRD でこれに当たるのは Young Red Dragon(CR 10)。Adult(CR 17)にしたいなら 1 行変えるだけ。

### 2-9. 触る範囲

- 判定・知識・AI はすべて `index.html` の中で閉じている。`js/skill-check.js` は API(`resolveSkillCheck` / `CLASS_PROFICIENCIES` / `CHECKS`)を使うだけで**開かない**。
- 酒場は敵のデータも AI も持っていない(#75 §2-6)⇒ `tavern.html` は changelog の 1 行だけ。
- `tools/probe_s5s6_clear.js` は勝率の記録(§8 末尾)で `?lore=0` を腕に使うため、スイッチ表 `recruit / recruittalk / dndrange / mopup / s2fold / enemytraits` に `lore` を 1 本足す(極性は `enemytraits` と同じ `=0` で false)。
- ポート: base **10471** / 変異 10472〜10479。`tools/*.js` / `*.py` で 10470 は `probe_s5s6_clear` が使用、10471〜10479 はヒット 0(`grep -hoE "10(47[0-9]|48[0-9])" tools/*.js tools/*.py` のヒットはバイト数と乱数表の小数だけ)。

### 2-10. 脅威度(CR)の表 — 5e SRD 5.1 から引いた値

- **出所**: ローカルの SRD `C:\Users\PC_User\Dropbox\🔷ナレッジ🔷\raw\srd\monsters\<slug>.md` の前付け `cr:`(Open5e・WotC SRD 5.1・CC-BY 4.0・2026-04-28 取得・322 体)。
  ⛔ 記憶で書かない。実装窓はこのファイルから引き直して表と突き合わせる(§8 (0d))。

      cd "C:/Users/PC_User/Dropbox/🔷ナレッジ🔷/raw/srd/monsters"
      for n in giant-rat goblin hobgoblin kobold skeleton zombie wraith lich ghost will-o-wisp young-red-dragon adult-red-dragon stone-golem animated-armor gargoyle minotaur hydra mimic giant-frog giant-spider chimera griffon orc bandit bandit-captain thug lizardfolk; do printf "%s=%s  " "$n" "$(grep -m1 '^cr:' $n.md | cut -d' ' -f2 | tr -d '\r')"; done

- **割り当ての規則**(起草者の判断。§2-8 の 3・4):
  ① SRD に同じクリーチャーが居る → その CR。
  ② SRD の本体の**兵種の言い換え**(弓兵・兵・狩人・襲撃者 = 武器が違うだけ)→ 本体の CR。
  ③ それ以外(呪術師・狂戦士・族長・王などの上位種 / 独自の敵 / SRD に無い敵)→ **表に載せない = 脅威度は出さない**(推測の値を SRD の値に見せかけない)。

| 敵キー | SRD の元(slug) | CR | 規則 |
|---|---|---|---|
| rat | giant-rat | 1/8 | ① |
| goblin / goblinArcher / goblinRider | goblin | 1/4 | ① / ② / ② |
| hobgoblin | hobgoblin | 1/2 | ① |
| kobold | kobold | 1/8 | ① |
| skeleton / skeletonArcher | skeleton | 1/4 | ① / ② |
| zombie | zombie | 1/4 | ① |
| wraith | wraith | 5 | ① |
| lich | lich | **21** | ① |
| caelum | ghost | 4 | ①(#75 と同じ元) |
| ghostFlame | will-o-wisp | 2 | ① |
| pharaxus | **young-red-dragon** | **10** | ①(§2-8 の 4) |
| stoneGolem | stone-golem | 10 | ① |
| animatedArmor | animated-armor | 1 | ① |
| gargoyle | gargoyle | 2 | ① |
| minotaur | minotaur | 3 | ① |
| hydra | hydra | 8 | ① |
| mimic | mimic | 2 | ① |
| plagueFrog | giant-frog | 1/4 | ① |
| ruinSpider | giant-spider | 1 | ① |
| chimera | chimera | 6 | ① |
| griffon | griffon | 2 | ① |
| orc / orcGrunt / orcArcher | orc | 1/2 | ① / ② / ② |
| bandit / banditArcher | bandit | 1/8 | ① / ② |
| banditHeavy | thug | 1/2 | ②(重装の用心棒 = Thug) |
| scar | bandit-captain | 2 | ①(盗賊頭 = Bandit Captain) |
| lizardWarrior / lizardHunter / lizardRaider | lizardfolk | 1/2 | ① / ② / ② |
| **出さない(17)** | goblinShaman / goblinBrute / goblinKing / goblinChariot / orcShaman / orcBerserker / garrock / banditMage / lizardPriest / swampNovice / lizardChieftain / stoneLegionary / sovereignEye / shadowBeast / direBear / umber_hulk / caravanWagon | — | ③ |

- 数え: 載せる 34 + 出さない 17 = 51。
- ⚠ 脅威度は**伝承の対象外(自然)の敵にも表に載っている**(ラット・ミノタウロスなど)が、判定が無いので**表示されることは無い**。表は「SRD の値」の台帳として全部書き、表示するかは「判定に成功したか」だけで決める。
- ⚠⚠ **副産物(本チケットでは直さない)**: `umber_hulk`(アンバーハルク)は**ローカルの SRD 5.1 に居ない**(`umber-hulk.md` が 0 件)。Umber Hulk は WotC の Product Identity の一覧に入っている名前なので、CLAUDE.md の「PI は使用禁止」に触れている可能性が高い ⇒ ユーザーに報告して別チケットで判断する(§11)。同じく `direBear`(Dire Bear)も 5e SRD には居ない(3.5 SRD の名前)。
- 表示の書式: ログは `スケルトン(脅威度 1/4)`、名前札は名前の後ろに小さく `CR1/4`(札の幅を抑えるため)。分数は `1/8` `1/4` `1/2` で出す(`0.25` と出さない)。

### 2-11. 名前札(#44)の作り

- 敵の名前札は `createEnemyDom` の中で 1 回だけ作られる(`index.html:12797〜12804`)。`<div class="enemyLabel" id="enemyLabel{index}">` の中に名前の `<span>`(`def.name`)と状態アイコンの枠。添字並列の配列 `enemyLabelElements`(`?namelabel=0` のときは `null` が積まれる)。
- ⇒ 脅威度は名前の `<span>` の後ろに `<span class="enemyCr">` を 1 つ足して出す。**`?namelabel=0` のとき(札が `null`)は何もしない**。
- 足す時機は 2 つ: ① 判定に成功した直後、その種類の生存敵の札へ足す ② 知っている種類の敵が後から作られた時(増援・召喚)は `createEnemyDom` の中で足す。どちらも同じ関数 `loreDecorateLabel(index)` を通す(二重に足さない = 既に `.enemyCr` があれば何もしない)。
- 既存の受入 `tools/verify_enemy_name_label.js` は札の大きさと CSS を測る(変異 `nocss` / `noenemycss` 他)。盤面で伝承判定を振らないので脅威度は出ない ⇒ 緑のままのはず。名指しの非退行に入れる。

### 2-12. changelog の要否

`scripts/hooks/check_changelog.py` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
プレイヤーに見える変化があるので要約は実在する(戦いの始まりに伝承を思い出す 1 行 / 眠らない敵にスリープを撃たない / 効かない属性の呪文を避ける)。§10 に用意した。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 撤退の定数 `LORE_ON` / 表 `LORE_SKILL_OF` `LORE_CR` / 呪文の属性表 `SPELL_ELEMENT` / 知識 `LORE_KNOWN` `LORE_TRIED` / 関数 `loreKnows` `loreMult` `loreSleepUseless` `loreCrText` `loreDecorateLabel` `runLoreCheck` / `runEncounter` の 1 行 / `createEnemyDom` の 1 行 / `.enemyCr` の CSS / `mageAI` `elfAI` `playerAttackTurn` `pickLeaderAction` `allySleep` の分岐 / 検証用の窓 `window.__dfLore` |
| `tavern.html` | `changelogList` の 1 行だけ(`py tools/add_changelog.py`) |
| `tools/verify_lore_check.js` | 新規。受入 §8 と `--negative` |
| `tools/probe_s5s6_clear.js` | スイッチ表に `lore` を 1 本(勝率の記録用) |
| `実装依頼書/2026-09-29_lore-check-ai.md` | §12 実装結果 |

⛔ `js/*.js` / `audio.js` / `title.html` / `town.html` / `world.html` は開かない。

---

## 4. STEP1 — 表と知識と判定(`window.__dfEnemyTraits` `:27521` の直後)

```js
    /* ★[#76] 伝承判定 (5e の知識判定)。⚠ 撤退 ?lore=0 で判定も知識も消える = 従来どおり AI は体質を知らない。
       ⭐ 敵キー → 技能。獣・怪物 (自然) は表に載せない = 振らない (会議決定: 嘘の技能で振らない)。
       ⛔ detectEnemyFamily を流用しない (ボス戦で呼ばれない・構造体を generic に落とす = 依頼書 §2-1)。 */
    const LORE_ON = new URLSearchParams(window.location.search).get("lore") !== "0";
    const LORE_SKILL_OF = {
      // 歴史 (人型)
      goblin: "history", goblinArcher: "history", goblinShaman: "history", goblinBrute: "history",
      goblinRider: "history", goblinKing: "history", goblinChariot: "history", hobgoblin: "history",
      kobold: "history", orc: "history", orcGrunt: "history", orcArcher: "history", orcShaman: "history",
      orcBerserker: "history", garrock: "history", bandit: "history", banditArcher: "history",
      banditMage: "history", banditHeavy: "history", scar: "history", lizardWarrior: "history",
      lizardHunter: "history", lizardRaider: "history", lizardPriest: "history", swampNovice: "history",
      lizardChieftain: "history",
      // 宗教 (アンデッド)
      skeleton: "religion", zombie: "religion", skeletonArcher: "religion", wraith: "religion",
      lich: "religion", caelum: "religion", ghostFlame: "religion",
      // 魔法学 (竜・構造体・元素・異形。hydra は会議決定 = 依頼書 §2-8)
      pharaxus: "arcana", stoneGolem: "arcana", animatedArmor: "arcana", stoneLegionary: "arcana",
      gargoyle: "arcana", sovereignEye: "arcana", hydra: "arcana",
    };
    /* 呪文 → 体質の表と同じ属性語。⚠ 演出の dfPlayCast の element ('ice' 等) を読まない (依頼書 §2-2 罠 3)。 */
    const SPELL_ELEMENT = {
      "fire-bolt": "fire", "fireball": "fire", "burning-hands": "fire",
      "lightning-bolt": "lightning", "lightning-arrow": "lightning",
      "cone-of-cold": "cold", "ice-storm": "cold",
    };
    const LORE_KNOWN = new Set();   // 思い出した敵キー (この冒険の間だけ)
    const LORE_TRIED = new Set();   // 振った敵キー (失敗しても 2 度は振らない)
    function loreKnows(e) { return LORE_ON && !!e && LORE_KNOWN.has(e.type); }
    function loreMult(e, spellId) {
      const el = SPELL_ELEMENT[spellId];
      return (el && loreKnows(e)) ? enemyElementMult(e, el) : 1;
    }
    function loreSleepUseless(e) { return loreKnows(e) && enemySleepImmune(e); }
    /* ★[#76] 脅威度 = 5e SRD 5.1 の CR そのまま (ユーザー決定)。SRD に元が無い敵は載せない = 出さない。
       ⭐ 出所: Dropbox の raw/srd/monsters/<slug>.md の cr: (依頼書 §2-10 の表)。値は小数で持ち、表示で分数へ。 */
    const LORE_CR = {
      rat: 0.125, goblin: 0.25, goblinArcher: 0.25, goblinRider: 0.25, hobgoblin: 0.5, kobold: 0.125,
      skeleton: 0.25, skeletonArcher: 0.25, zombie: 0.25, wraith: 5, lich: 21, caelum: 4, ghostFlame: 2,
      pharaxus: 10, stoneGolem: 10, animatedArmor: 1, gargoyle: 2, minotaur: 3, hydra: 8, mimic: 2,
      plagueFrog: 0.25, ruinSpider: 1, chimera: 6, griffon: 2,
      orc: 0.5, orcGrunt: 0.5, orcArcher: 0.5, bandit: 0.125, banditArcher: 0.125, banditHeavy: 0.5, scar: 2,
      lizardWarrior: 0.5, lizardHunter: 0.5, lizardRaider: 0.5,
    };
    function loreCrText(type) {   // 0.125 → "1/8"。表に無ければ "" (= 出さない)
      const cr = LORE_CR[type];
      if (cr == null) return "";
      return ({ 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" })[cr] || String(cr);
    }
```

`loreDecorateLabel(index)`: `LORE_ON` で、札 `enemyLabelElements[index]` が在り(`?namelabel=0` なら `null`)、その敵を `loreKnows` で知っていて、`loreCrText` が空でなく、札にまだ `.enemyCr` が無い時だけ、名前の `<span>` の直後へ `<span class="enemyCr">CR1/4</span>` を 1 つ差し込む。
呼び口は 2 つ: 判定の成功直後(その種類の生存敵すべて)と、`createEnemyDom` の札を作った直後(`index.html:12802` の `lb.appendChild(nameSpan);` の後。増援・召喚で後から作られた敵)。
CSS は `.enemyLabel` の近くに `.enemyCr { margin-left: .35em; font-size: .8em; opacity: .85; }` 程度(見た目は §9 で目で直す)。

`runLoreCheck()` の中身:

1. `LORE_ON` でなければ何もしない。
2. `encounterEnemyIndices` の生存敵(護衛対象 `isEscortObjective` を除く)から、`LORE_SKILL_OF` に技能があって `LORE_TRIED` に無い敵キーを集め、**技能ごと**にまとめる(1 戦で最大 3 回)。
3. 技能ごとに:
   - `buildPerceptionParty()` を、その技能の習熟を持つ者だけへ絞る(`SkillCheck.CLASS_PROFICIENCIES` で判定。罠 4)。
     `buildPerceptionParty()` は `{classKey, name}` の**写し**を作るので、頭上に吹き出しを出すために `unit`(`"player"` か ally)を足して作る(既存の呼び口は増えたキーを読まないので無害)。
   - 0 人なら振らない。キーは `LORE_TRIED` にも入れない(仲間が入れ替われば次の戦いで振れる)。ログ 1 行:「📜 この敵の正体を知る者はいない(宗教の心得が要る)」。⚠ 同じ技能で 1 回の冒険に 1 行まで(毎戦出すとうるさい)。
   - 1 人以上なら `SkillCheck.resolveSkillCheck(skill, dc, party, { auto: true })`。DC は §2-3。
     全キーを `LORE_TRIED` に入れ、成功なら `LORE_KNOWN` にも入れる。
   - 代表の頭上へ `showRollAtPlayer` / `showRollAtAlly` で `<span class="label">LORE</span>宗教 1d20(n)+b = <span class="big">total</span> vs DC d`(#49 の判定行が乗る形)。
   - ログ 1 行(`updateInfo`):
     - 成功: `📜 {代表}は伝承を思い出した — {名前}(脅威度 {CR}): {特徴} / …`。脅威度は `loreCrText` が空なら括弧ごと出さない。続けて `loreDecorateLabel` で札へ `CR…` を足す。特徴は体質から作る(眠らない → 「眠りの術が効かない」、効かない属性 → 「炎が効かない」、効きにくい属性 → 「冷気と雷を和らげる」、何も無い → 「眠りの術が効く」)。
     - 失敗: `📜 {代表}は思い出せない… ({技能} {total} < DC {dc})`。
4. 呼び口は `runEncounter` の **`updateInfo("行動順: …")` `:21662` の後・`tryStealthSurprise()` `:21668` の前**に `await runLoreCheck();` 1 行(罠 1)。

検証用の窓: `window.__dfLore = { on: LORE_ON, skillOf: LORE_SKILL_OF, cr: LORE_CR, crText: loreCrText, decorate: loreDecorateLabel, spellElement: SPELL_ELEMENT, known: LORE_KNOWN, tried: LORE_TRIED, knows: loreKnows, mult: loreMult, sleepUseless: loreSleepUseless, run: runLoreCheck };`
(classic script 直下の `const` / `function` は `window` に載らないので、明示的に載せる)

## 5. STEP2 — 魔法使い・エルフ・主人公の AI

⭐ どの変更も「**何も知らなければ今と 1 ビットも同じ**(分岐も `Math.random()` の回数も)」になるように書く(罠 2)。

### 5-1. `mageAI` のスリープ(`:30379〜30388`)

```js
      // ★[#76] 伝承で「眠らない」と知っている敵は数に入れない。「眠る」と知っている敵が 2 体以上なら確率ゲートを外す。
      //   ⚠ 何も知らなければ sleepPool === unstunnedEnemies・sure === false = 従来と同じ順で乱数を引く (依頼書 §2-2 罠 2)。
      const sleepPool = unstunnedEnemies.filter(i => !loreSleepUseless(enemies[i]));
      const sure = sleepPool.filter(i => loreKnows(enemies[i])).length >= 2;
      if (hasSleep && hasSpellSlot(ally, "sleep") && sleepPool.length >= 2
          && (sure || Math.random() < apGateP(ally, "sleep", 0.5))) {
```

### 5-2. `mageAI` の攻撃呪文(`:30418〜30450`)

- `tgtIdx` を決めた後、`attackSpells` から `loreMult(enemies[tgtIdx], id) === 0` の呪文を外す。空になったら `return false`(スリングへ)。
- 既存の規則で `spellId` を決めた後、`loreMult` が `spellId` より大きい候補が残っていれば、`fallbackOrder` の順で最初のその候補へ差し替える(効きにくい → 等倍、将来の弱点 → 弱点)。
- ⚠ 範囲呪文も「対象(最寄りの 1 体)」だけで判定する(巻き込む他の敵までは数えない)。

### 5-3. `elfAI` のライトニング・アロー(`:31308〜`)

- `tgtIdx` を決めた後、`loreMult(enemies[tgtIdx], "lightning-arrow") === 0` なら撃たずに次の枝へ落ちる。効きにくい(0.5)は撃つ(代わりの属性が無い)。

### 5-4. 主人公(`playerAttackTurn` の `activeEquipped` と `pickLeaderAction`)

- 候補の絞り(`:32620〜32648` のフィルタ)に 2 行足す: `loreMult(enemies[targetIdx], id) === 0` の呪文を外す / `sleep` は、交戦中の未スタンの生存敵が**全員** `loreSleepUseless` なら外す。
- `pickLeaderAction` の重み: `AP_BOOST` と同じ位置(クランプの**後** `:32472` の隣)で `w *= loreMult(tgt, id)`、`sleep` は「知っていて眠る」敵が 2 体以上なら `w *= LORE_SLEEP_BOOST`(= 2)。
  ⭐ 掛け算だけなので `Math.random()` の消費はちょうど 1 回のまま(`driver_leader_ai` の G2 の前提)。

### 5-5. `allySleep` の狙点(`:28188` / `:28224`)

- 狙点の**評価だけ**を「範囲に入る敵のうち `loreSleepUseless` でない数」にする(2 か所の `.length` と `enemiesInArea(...).length`)。
- `affectedIdxs`(実際にかける相手)と、撃つ・撃たないは変えない。
- ⛔ `?aoecover=0` の旧経路 `:28190〜` も同じ数え方に揃える(揃えないと撤退スイッチの組み合わせで狙点が食い違う)。

⛔ 触らない: `clericAI`(§2-1 #4)/ `apTryPreferred`(酒場で指定された技はプレイヤーの指示なので、知識で止めない)/ 道中の詠唱 / 敵の AI。

---

## 6. STEP3 — 表示

- §4 の 3. のとおり(ロールの吹き出し + ログ 1 行)。DM の語り(ペンの音)は足さない(戦闘の開始は既に系統のメッセージ・ボスの語り・隠密の判定で混んでいる)。
- ⚠ ログの文言は後で直す余地を残す(§8 の「測らないこと」)。

---

## 7. 撤退スイッチ

- **`?lore=0`** — 判定を振らず、知識も持たない = AI は今と同じ(#75 時点)。
- 判定位置: `index.html` のページ単位の定数 `LORE_ON`(STEP1)。**遷移はまたがない**(`?enemytraits=0` と同じ作法)。検証は `index.html` を直接開くか、`probe_s5s6_clear` の `evaluateOnNewDocument` + `history.replaceState` の口で index 側へ届ける。

---

## 8. 受入条件 — `tools/verify_lore_check.js`(新規・base ポート **10471**、変異は 10472〜)

**方針**: 盤面は `tools/verify_enemy_traits.js` の `openIndex` / `installProbe` / `board`(← `verify_aoe_coverage`)を流用する。`Math.random` は**列**で固定する(定数 1 つでは確率ゲートの有無を区別できない)。
AI は `mageAI` / `elfAI` を直接呼び、呼ばれた `ally*` 関数を記録する(`window.*` の差し替えで握る = `verify_cone_cast` の `quiet` の形)。主人公は `pickLeaderAction` の入力 `choices` と出力を記録する。
期待値は 2 経路: ① ページの窓 `__dfLore` / `__dfEnemyTraits` ② **ドライバが独立に持つ表**(§2-4 の 51 種の振り分けと、呪文 → 属性の 7 行)。

### §0 装置(母集団を先に確かめる)

- **(0a)** 盤面で `runLoreCheck` が実際に `resolveSkillCheck` を呼んだ(呼び出しの記録 ≥ 1)・`mageAI` がスリープと攻撃呪文を 1 回以上撃った・`elfAI` がライトニング・アローを 1 回以上撃った・`pickLeaderAction` が 1 回以上呼ばれた。
  ⭐ **これが無いと全 assert が空振りで永久緑になる。**
- **(0b)** `__dfLore` が在り `on === true`。`skillOf` の全キーが `ENEMY_TYPES` に実在し、`ENEMY_TYPES` の全 51 キーがドライバの表で「技能あり 40 / 対象外 11」に分かれる。
- **(0c)** ページの `skillOf` とドライバの表が 51 種すべてで一致・`spellElement` の 7 行が一致し、属性語はすべて `__dfEnemyTraits` の表で使われている語(fire / cold / lightning)の中にある。

- **(0d)** ページの `cr` の 34 キーが、**ドライバが起動時に `Dropbox\🔷ナレッジ🔷\raw\srd\monsters\<slug>.md` の `cr:` から読んだ値**(§2-10 の敵キー → slug の対応はドライバが独自に持つ)と一致し、「出さない」17 キーはページの表に無い。SRD のフォルダが読めない時は exit 2(環境)で止める(⛔ 緑にしない)。

### §1 判定

- **(1a)** 宗教を持たない編成(主人公 戦士 + 盗賊)× スケルトン → `resolveSkillCheck` の呼び出し 0 回・「正体を知る者はいない」が 1 行・`tried` に入らない。
- **(1b)** 僧侶が居る編成 × スケルトン → `"religion"` で 1 回呼ばれ、渡された配列の全員が宗教の習熟を持つ(戦士・盗賊が混ざっていない)。
- **(1c)** 乱数を高く固定 → `known` にスケルトン / 低く固定(出目 1)→ `tried` に入り `known` に入らない。
- **(1d)** 同じ種類との 2 戦目 → 呼び出しが増えない。
- **(1e)** 獣(ジャイアントラット)だけの戦い → 呼び出し 0・ログ 0 行。
- **(1f)** DC: ゴブリンだけ → 10 / ゴブリン + ゴブリンキング → 15(ドライバが `isBossLikeDef` を使わず定義のフラグから自分で出した値と一致)。
- **(1g)** ⭐ **ボス戦でも振る**: リッチ(`maxSummons > 0` = `boss_appear` の枝)+ スケルトンの `runEncounter` の開始 → 宗教の判定が 1 回(罠 1)。
  ✅ 起草時に実測済: `boss_appear` の枝に入る敵 = `maxSummons > 0` の goblinKing `:9766` / **lich `:9950`** / garrock `:10112` / **pharaxus `:10142`** / scar `:10343` / lizardChieftain `:10511`(すべて 2〜3)+ `eyeStalks` の sovereignEye。

- **(1h)** 脅威度の表示: スケルトンを見抜いた → ログの成功行に `1/4`、その場のスケルトン全員の札に `.enemyCr` がちょうど 1 つ(文字は `CR1/4`)。ゴブリンキング(表に無い)を見抜いた → 札に `.enemyCr` が無く、ログに「脅威度」の語が出ない。失敗した種類の札には付かない。
- **(1i)** 見抜いた種類の敵を後から作る(`createEnemy` → `enemies.push` → `createEnemyDom`)→ 札に `.enemyCr` が 1 つ。同じ敵に `decorate` を 2 回呼んでも 1 つのまま。`?namelabel=0` の腕では例外なく何も付かない。
- **(1j)**(2026-09-29 仕様変更 (A)・項目4b で追加)**戦闘中に合流した敵にも振る**: ミノタウロス 2 体の戦い(自然 = 振らない)へ本番の `mergeReinforcements` でファラクサスを合流させる → 魔法学の判定がちょうど 1 回・DC 15・習熟者だけ・札に `CR10`・吹き出しは REINFORCE の後。振る種類の無い合流(ミノタウロス)と判定済みの種類の合流(2 体目のファラクサス)は呼ばず、`Math.random` の回数が `?lore=0` の腕と同じ(ファラクサスの合流だけ +1)。(4a) の述語にも入れる。

### §2 AI

- **(2a)** スケルトン 3 体を知っている × 魔法使い(スリープ + ファイアボルト)で 20 手番 → `allySleep` 0 回。知らない時は同じ乱数列で 1 回以上。
- **(2b)** ゴブリン 3 体を知っている × 乱数 0.99 固定(= 50% のゲートなら撃たない値)→ スリープが撃たれる。知らない時は撃たれない。
- **(2c)** ファラクサスを知っている × ファイアボルト + マジックミサイル → 炎の呪文 0 回・マジックミサイルが撃たれる。知らない時はファイアボルトが撃たれる。
- **(2d)** カエルムを知っている × コーンオブコールド + ファイアボール → コーンオブコールド 0 回(冷気が効かない)。リッチを知っている × コーンオブコールド + ファイアボール → ファイアボールへ差し替わる(冷気は効きにくい・炎は等倍)。
- **(2e)** 器の確認: ドライバが実行時に `enemyElementMult` を包んで、ゴブリン × 炎で 2 を返させる → 知っていれば火の呪文へ差し替わる(将来の弱点の口)。⚠ `loreMult` が `enemyElementMult` を関数宣言の名前で呼んでいるなら `window` の差し替えが効く(#75 §12-0 (7) の `quiet` と同じ理屈)。効かない形に書いたなら、器の確認は `__dfEnemyTraits.table` を実行時に書き換える形へ変える。
- **(2f)** ウィル・オ・ウィスプを知っている × エルフ(ライトニング・アロー)→ 撃たない。知らない時は撃つ。
- **(2g)** 主人公(魔法使い): ファラクサスを知っている → `pickLeaderAction` に渡る `choices` に炎の呪文が無い / スケルトンだけを知っている → `sleep` が無い。知らない時は両方ある。
- **(2h)** 狙点: 眠らないと知っているスケルトン 3 体の塊と、ゴブリン 2 体の塊 → スリープの 2x2 がゴブリン側に落ちる。知らない時はスケルトン側。

### §3 恒等(非退行)

- **(3a)** ⭐ 何も知らない状態で、`mageAI` / `elfAI` / `pickLeaderAction` を同じ乱数列で N 手番回した「呼ばれた関数の列」と「`Math.random` を引いた回数」が、`?lore=0` の腕と完全に一致する(罠 2)。
- **(3b)** `clericAI` の呼び出し列は、知っている時と知らない時で完全に一致する(僧侶は触っていない)。

### §4 撤退

- **(4a)** `index.html?lore=0` では、(1b)(1c)(1g)(1h)(2a)(2b)(2c)(2f)(2g) の**同じ述語関数**がすべて偽になり、窓の `on === false`。
  ⭐ 「OFF で緑」ではなく、**同じ conjunction を ON と OFF の両方に当てて、OFF で崩れる**ことを確かめる(#75 (4a) と同じ形)。

### ⛔ 測らないこと

- ログとロールの吹き出しの**文言**(`LORE` のラベルと「正体を知る者はいない」の有無以外)。後で直す余地を残す。
- 成功率そのもの(d20 の分布)。判定値と DC の組は §1 と §2-3 の再計算で見る。
- 戦闘の勝敗(下の「勝率の記録」で記録するだけ)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `bossbranch` | `runLoreCheck()` の呼び口を `detectEnemyFamily` の隣(ボスの居ない枝)へ移す(罠 1) | (1g) |
| `rngparity` | スリープの枝で `Math.random()` を条件の先頭で引く(罠 2) | (3a) |
| `iceword` | `SPELL_ELEMENT` のコーンオブコールドを `"ice"` にする(罠 3) | (0c)(2d) |
| `nogate` | 習熟で絞らず `buildPerceptionParty()` をそのまま渡す(罠 4) | (1a)(1b) |
| `reroll` | `LORE_TRIED` に入れない | (1d) |
| `alwaysknow` | `loreKnows` が常に真 | (1c)(3a) |
| `familyreuse` | 技能の決め方を `detectEnemyFamily` 経由にする(構造体が `generic` = 振らない) | (0c) |
| `switchdead` | `LORE_ON` を常に真 | (4a) |
| `crguess` | 「出さない」のゴブリンキングに近い種族の値(`goblinKing: 1`)を表へ足す(規則 ③ を破る) | (0d)(1h) |
| `crdecimal` | `loreCrText` が分数へ直さず `String(cr)`(`0.25` と出る) | (1h) |
| `crdup` | `loreDecorateLabel` の「既に `.enemyCr` があれば何もしない」を外す | (1i) |
| `nomerge`(項目4b で追加) | `mergeReinforcements` の中の `await runLoreCheck(list);` を外す(§2-7 の旧仕様 = S6 でファラクサスに 0/10 回の姿) | (1j) |

⭐ `--negative` は #75 と同じく「赤の集合 = 担当」の完全一致を要求する。担当は実走で決め直してよい(#75 は 7 本中 5 本が予想より広がった)。**予想の節が実測の赤に含まれていること**だけは崩さない。

### 既存 golden の非退行(実装後に必ず走らせる)

- 名指しで確かめるもの(AI と判定に触れる本):
  - `driver_leader_ai.js`(G2 = 乱数の消費 1 回)
  - `driver_action_priority.js`(`apTryPreferred` / `pickLeaderAction` の倍率)
  - `verify_aoe_coverage.js`(スリープの狙点 §4 `:836〜857`)
  - `verify_cone_cast.js` / `verify_hold_person.js` / `verify_hold_pair.js` / `verify_spell_off.js`(`mageAI` / `clericAI` を直接回す)
  - `verify_enemy_traits.js`(15/15・`--negative` 7/7)
  - `driver_sce1_events.js`(隠密の接近の前に判定が 1 つ増える。着手前は 211/214 = 赤 3 件は #53 のキー数で無関係)
  - `driver_skillcheck_roster.js`(判定パネルの代表と補助)
  - `verify_enemy_name_label.js`(札の大きさと CSS。§2-11)
- **母集団**: `index.html` はほぼ全部の本が読み、判定は戦闘の開始で乱数を 1 回引く ⇒ dev-loop の作法どおり、項目 1 で着手前の色を控え、最後に影のツリーと交互に対比較する(#74・#75 の方式)。
  #75 の `after75.tsv`(154 腕・本番 `7402153` = 本書の起草時と配信物が同一)を着手前の色として流用できるかは、項目 1 で blob OID を追試して決める。
- `--negative` の選び直しは #75 §12-5 (2) の ④「**差分を含む関数の中のアンカー**」まで広げて機械で選ぶ(①〜③ だけだと 0 本になる = #75 の崩れ 17)。
- ⚠ 基準値は実装窓が着手時に測る。

### 勝率の記録(決裁どおり、記録するだけで調整しない)

- `tools/probe_s5s6_clear.js` に `lore` スイッチを足し、**S5 と S6 を `ON` / `?lore=0` の対で N=10 ペア**。腕は #75 と同じ `xp:<推奨>` + `qs:recruittalk=0`(4 人)。
- 記録: クリア率 / **スリープ 1 回あたりの「眠らない」体数**(#75 の S5 ON = 21 回で 40 体)/ 伝承判定の回数と成功数 / ファラクサスへの炎の IMMUNE 回数。
- ⭐ 本チケットの手応えの指標は「眠らない体数が減ったか」。自動抽選の編成に僧侶・魔法使いが居ない走行では何も起きないので、走行ごとの編成も列に残す。
- ⚠ この機械は遅い(約 2.6 倍)。40 走行で約 2 時間(#75 の実測)。

---

## 9. 実機/実感の確認

- 戦闘の始まりに出る「📜 〜は伝承を思い出した」の行が、iPhone の縦画面で読めるか(敵の名前が 3 種類並ぶと長い)。
- ロールの吹き出しが隠密の判定・恐怖のオーラと重なってうるさくないか。
- 名前札の `CR1/4` が iPhone の縦画面で読めるか・札が長くなりすぎないか(#44 の札は 70% の大きさ。長い名前の「レッドドラゴン「ファラクサス」 CR10」で確かめる)。
- リッチの「脅威度 21」が、Lv8 のパーティで倒せる相手として違和感が無いか(SRD の値そのまま = ユーザー決定。違和感があれば §2-10 の表だけ差し替える)。
- パネルを出さない判断(§2-8 の 2)でよいか。「ダイスを見せたい」ならパネルに戻す。
- ⚠ ローカルは http で起動する(file:// だと音が出ない)。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>伝承で敵の正体を見抜く</b> — 魔法使い・エルフ・僧侶が戦いの始まりに敵の伝承を思い出すことがある。思い出せば敵の脅威度が分かり、眠らない敵にスリープを撃たず、効かない属性の呪文を避ける。"

---

## 11. やらないこと

- ⛔ **キャラクリエイトでの技能選択**(5e の背景)→ 後日の別チケット(会議の決裁)。
- ⛔ **自然の判定と獣の伝承**(会議決定)。
- ⛔ **物理に免疫・耐性の敵を見て魔法を優先する**(§2-1 #5。魔法使いは既にスロットがあれば呪文を撃つ)。
- ⛔ **僧侶の AI**(ターン・アンデッドは既に最優先級 = §2-1 #4)。
- ⛔ `apTryPreferred`(酒場で指定された技)を知識で止める。
- ⛔ 判定パネルの UI 変更・`js/skill-check.js` の変更。
- ⛔ 酒場の画面に「誰が伝承を振れるか」を出す(出すなら `tavern.html` の別チケット)。
- ⛔ 弱点(2 倍)を表に足す(A-1 のユーザー決定)。
- ⛔ 探索中の詠唱・透明化・魔法の眼 → S / B / C のチケット。
- ⛔ **敵の名前を「見抜くまで伏せる」**(仮の名前で出して成功で本名へ)→ 別チケット候補。名前を出す場所が `def.name` で 179 か所・酒場の依頼札の「敵情報」にも名前が出る(2026-09-29 のユーザー判断 = 脅威度だけ本チケットへ)。
- ⛔ SRD に元が無い 17 種に推測の脅威度を付ける(§2-8 の 3)。
- ⛔ **アンバーハルク(`umber_hulk`)の Product Identity の確認と差し替え**(§2-10 の副産物)→ ユーザーに報告して別チケットで判断。`direBear` の名前も同様に確認候補。
- ⛔ S6 竜の巣が Lv10・4 人でも 0/10 の件(#75 §12-4・体質とも伝承とも無関係の別チケット候補)。
- ⛔ **`実装依頼書/README.md` への行追加**は、承認後に起草窓が引き渡しと一緒に行う。用意してある行:

    | 76 | [2026-09-29_lore-check-ai.md](2026-09-29_lore-check-ai.md) | **承認済** | 0% | 伝承判定(習熟を持つ者だけ・パネルなし)で敵の体質と脅威度(SRD 5.1 の CR そのまま・ログと名前札)を知り、魔法使い・エルフ・主人公の AI が眠らない敵へのスリープと効かない属性を避ける。⚠⚠⚠ 判定はボスの分岐の**外**(`detectEnemyFamily` はボス戦で呼ばれない)/ 何も知らなければ乱数の消費を 1 回も変えない / 呪文の属性は演出の `element` を読まない(`ice`≠`cold`)/ 渡す編成を習熟で絞る。撤退 `?lore=0`。「敵の様子を探る魔法」シリーズの A-2 |

---

## 12. 実装結果

### 12-0. 着手前の実測(項目1・HEAD c4ec84b)

⛔ 本番(`index.html` / `tavern.html` / `audio.js` / `js/*.js`)と `tools/` は 1 バイトも触っていない。変えたのは本書 §12 だけ。
`git diff --stat 7402153 c4ec84b` = `実装依頼書/` の **docs 3 本だけ**(#75 の依頼書・本書・README)⇒ **§2 の行番号は HEAD `c4ec84b` でもそのまま有効**(起草時の `ba2e258` とも配信物は同一)。
⚠ `index.html` はディスク上 **CRLF**(`git hash-object index.html` = HEAD の blob `acbc101a…`)。本書は LF。
成果物(ログ・スクリプト)= scratchpad `…/f5deb037-8f94-4cba-becc-588ea310d3ff/scratchpad/item1/`(`scope_probe.js` = ページを開いて窓・差し替え・札・判定行を実測 / `keys_check.py` / `cr_check.py` / `golden/` / `fp_compare.py`)。

#### (1) §2 の主張の突き合わせ — 成り立ったもの

- **§2-1 #1 / 罠 1** ✅ `runEncounter` `:21481`。ボスの枝 `:21499〜21503`(`bossIdx` = `maxSummons > 0 || eyeStalks`)、`detectEnemyFamily(initialEngaged)` は **else の枝の中 `:21505`**。行動順 `updateInfo("行動順: …")` `:21662` / `tryStealthSurprise()` `:21668`。
- **§2-1 #2** ✅ `detectEnemyFamily` `:14422〜14447`。構造体・ガーゴイル・単眼の暴君・キマイラ・グリフォン・残影の獣・ミミックなどは `generic`、ミノタウロスは `orc`(`:14443`)。
- **§2-1 #3 / 罠 3** ✅ 呪文の定義(`MAGE_SKILLS` `:22196`〜 / `ELF_SKILLS` `:22263`〜)に属性は無い。演出は `'ice'`(コーンオブコールド `:29093` / アイスストーム `:29182`)。体質の表は `"cold"`(`:27494〜27496`)。
- **§2-1 #4** ✅ `clericAI` `:30227`: 緊急回復 `:30242〜` → ホールド・パーソン `:30267`(`HOLD_SLOTS_ON`)→ ターン・アンデッド `:30270〜30278`(確率ゲートなし)。
- **§2-1 #6** ✅ `resolveSkillCheck` `js/skill-check.js:459`。代表 `:464`・補助 `:468` を**渡された全員から**選ぶ。`opts.auto`(または `__autoplay`)は `:482` でパネルを出さず `d20()` を**ちょうど 1 回**(`:483`)。
- **§2-1 #7** ✅ `AUTO_ROLL_MS = 2000` `:86` / `RESULT_HOLD_MS = 3600` `:93`。
- **§2-2 罠 2** ✅ スリープの枝 `:30382` = `hasSleep && hasSpellSlot(ally,"sleep") && unstunnedEnemies.length >= 2 && Math.random() < apGateP(…)`(短絡評価 = 2 体未満なら乱数を引かない)。
- **§2-3** ✅ `checkScore` `js/skill-check.js:105〜112`・能力値 `js/abilities.js:41〜48`・`CLASS_PROFICIENCIES` `:57〜64`(elf = perception/arcana・cleric = insight/religion・mage = arcana/history)・`PROFICIENCY_BONUS = 2` `:53`・`HELP_BONUS = 2` `:56`。判定値は 3 職とも +4(INT15 / INT14 / WIS15 → 5e 式 +2)。成功率 75/50%・補助込み 85/60% は再計算で一致。`isBossLikeDef` `:32114` ✅。
- **§2-4** ✅ `ENEMY_TYPES` `:9645〜10853` = **51 キー**(§2-4 の awk をそのまま実行)。表の 26 + 7 + 7 + 11 = 51・重複 0・過不足 0。`undead: true` のキー = 7(skeleton 9868 / zombie 9888 / skeletonArcher 9907 / wraith 9925 / lich 9955 / caelum 9976 / ghostFlame 10602)= 宗教の 7 キーと一致。`isUndeadEnemy` `:27484`。
  ボス格(`isBossLikeDef` が真)= goblinKing / lich / garrock / pharaxus / scar / lizardChieftain(`isBoss` + `maxSummons` 2〜3)・hydra(`isBoss` だけ)・sovereignEye(`eyeStalks`)・direBear / chimera / griffon / umber_hulk(`isBoss` + `maxSummons: 0` = 対象外の自然)。`boss_appear` の枝に入るのは §8 (1g) の 7 種どおり。敵の定義に `cr:` は 0 件。
- **§2-6** ✅ `enemyElementMult` `:27504` / `enemySleepImmune` `:27513` / `window.__dfEnemyTraits` `:27521〜27524`(`on / table / mult / sleepImmune / resolve`)。表 `ENEMY_TRAITS` `:27493〜27502` の 8 キー。
- **§2-10** ✅ SRD の `cr:` を実ファイルから読んだ(`cr_check.py`・前付けは BOM 付き CRLF・値は `0.125` 形式の小数)。§4 `LORE_CR` の 34 キーは slug 対応表(§2-10)の 34 キーと同じ集合で、**34/34 一致・不一致 0**。「出さない」17 キーとの重なり 0・和集合 = `ENEMY_TYPES` の 51 キー。分数は 1/8・1/4・1/2 の 3 種だけ。`umber-hulk.md` / `dire-bear.md` は**無い**(`dire-wolf.md` はある)。creature_type も確認: hydra = Monstrosity(§2-8 の 1 どおり)/ gargoyle = Elemental / stone-golem・animated-armor = Construct / ghost・will-o-wisp = Undead / young-red-dragon = Dragon。
- **§2-11** ✅ 札は `createEnemyDom` `:12756` の中 `:12797〜12805`(`lb.className = "enemyLabel"` `:12798` / 名前 `<span>`(クラスなし)`:12800〜12801` / **`lb.appendChild(nameSpan)` `:12802`** / 状態列 `:12803` / `enemyLabelElements.push(lb)` `:12805`)。`?namelabel=0` は `:12809` で `null` を積む(実測: 2 枚とも null)。`createEnemyDom` の呼び口 9 か所(`:13878` / `:24283` / `:24486` / `:25791` / `:26413` / `:32734` / `:33550` / `:33665` / `:33796`)は**すべて `enemies.push` の後** ⇒ `createEnemyDom` の中で `enemies[index]` が引ける。`showRollAtPlayer(html, type)` `:20599` / `showRollAtAlly(ally, html, type)` `:20622` / `updateInfo(message)` `:15772` 実在。CSS `.enemyLabel` `:326` / `body.labelSmall .enemyLabel` `:341`。
- **§2-9** ✅ ポート 10471〜10479: `tools/*.js` / `*.py` のヒット 0(10470 は `probe_s5s6_clear` `:76`)・`netstat` の LISTEN 0。
- **名前の衝突** ✅ `?lore=` / `LORE_` / `__dfLore` / `enemyCr` / `loreK*` / `runLore` は `index.html` / `tavern.html` / `audio.js` / `js/*.js` / `title/town/world.html` / `tools/*` に 0 件(`index.html:24784` のコメント「lore ナレ」1 件だけ)。ページ実測でも §4 の 13 の名前はすべて `typeof` = undefined。

#### (2) ⚠ 崩れた主張(予測の訂正。方針はどれも変えない)

1. **§2-1 #6「習熟で絞る前例は `canSneak`」** → `canSneak`(`:25408〜25410`)は「習熟者が**居るか**」のゲートで、`resolveSkillCheck` へ渡すのは**絞らない全員**(`:25404` の `party` をそのまま `:25416`)。#53 の若い司祭(`:25024` 以降)も全員を渡して `extraBonus` で寄せている。⇒ 「絞った配列を渡す」前例は無い = 本チケットが初(罠 4 の方針どおり新しく書く)。
2. **§4「`buildPerceptionParty()` は `{classKey, name}` の写し」** → 実物(`:25213〜25227`)は `{classKey, name, isHero: true, skillBonus}`(主人公)/ `{classKey, name, skillBonus}`(仲間)。しかも**主人公は `hp > 0 && !gameOver` のときだけ**入る(`:25215`)。
   → 影響(項目3): 盤面の隔離レシピ(`installProbe` の `gameOver = true`)の下では**主人公が判定の編成から消える**(実測: `SEED_PARTY` = 戦士 + 魔法使い + 僧侶 で `buildPerceptionParty()` = 魔法使い・僧侶の 2 人)。(1a)(1b) で主人公を数えるなら `runLoreCheck` を呼ぶ間だけ `gameOver = false`。
   → 影響(項目2): `unit` は `buildPerceptionParty()` 本体へ足すより、`runLoreCheck` の中で「主人公(居れば先頭)→ 生存仲間の順」に対応を取って写しへ足すほうが安全(本体は 10 か所から呼ばれ、ドライバ 2 本が中身を読む。`unit` に ally オブジェクト〔DOM を持つ〕を入れると、判定の結果 `o.rep` を `page.evaluate` で返すドライバが直列化で落ちうる)。どちらでも仕様は同じ。
3. **§4 の吹き出し「`1d20(n)+b = total vs DC d`(#49 の判定行が乗る形)」** → `rollTargetLine` `:20564` は **`1d20(<b>n</b>)` の `<b>`** と **type が `hit` / `miss` / `crit` / `fumble`** のときだけ判定行を足す(実測: `<b>` 無し = 素通し / type `skill` = 素通し / `<b>` + `hit` = 「出目 6+ → 成功 +6」が付く)。
   → 影響(項目2): 出目は `<b>` で囲み、type は成功 `hit`・失敗 `miss`(出目 20 = `crit`・1 = `fumble`)にする。
4. **§2-5 / §5-5「狙点の評価は 2 か所 `:28188` / `:28224`」** → 数える所は **5 か所**: `:28188`(初期値)/ **`:28192`(`?aoecover=0` の旧経路のループ)** / `:28220` の `foeIdxs` を読む `:28224〜28225`(比較 2 回 + 代入)/ **`:28228`(候補が 0 のときの戻り)**。`:28221` の `aoeBoxReachable(aCX, aCY, foeIdxs, rangeTiles)` も `foeIdxs` を読むが、これは「届くか」の判定なので**全員の集合のまま**にする(撃つ・撃たないは変えない = §5-5 の方針どおり)。`affectedIdxs` `:28230` と空判定 `:28231` は触らない。
5. **§8 (2c)「知らない時はファイアボルトが撃たれる」** → `mageAI` の `fallbackOrder` `:30433` は **magic-missile が fire-bolt より前**で、fire-bolt には閾値の枝も無い(`:30426〜30430`)⇒ ファイアボルト + マジックミサイルの魔法使いは**知らなくても毎回マジックミサイル**。(2c) はこの装備では差が出ない(両腕とも炎 0 回)。
   → 影響(項目3): 装備を変えて同じ主張を測る。例 ① fireball + magic-missile で threatScore ≥ 30(知らない = fireball / 知っている = 炎を外して magic-missile)② fire-bolt だけ(知っている = 候補が空 → `return false` でスリング)。
6. **§8 (2d) の暗黙の前提「知らない時はコーンオブコールドを選ぶ」** → 既定の選択は threatScore で決まる(`:30426〜30430`: ≥32 ice-storm / ≥30 fireball / ≥25 lightning-bolt / ≥25 cone-of-cold / ≥20 burning-hands / それ以外は fallbackOrder)。threatScore = 生存敵の HP 合計 + 5×体数 + ボス 20 + 窮地 10(`evaluateThreat` `:30207〜30224`)。流用元 `verify_aoe_coverage` の `board()` は敵を **maxHp = hp = 400** で置くので threatScore ≥ 400 ⇒ fireball を持っていれば**知らなくても fireball**。
   → 影響(項目3): (2d) は敵の hp を小さく置いて threatScore < 25(fallbackOrder で cone-of-cold が fireball より前)にしないと「知らない = cone / 知っている = fireball」の差が出ない。窮地 +10(PT の誰かが HP 50% 未満)に注意。(2e) はマジックミサイル + ファイアボルトなら threatScore に依らず既定 = MM なので素直に測れる。
7. **§8 (2e) の前提** → 成立。classic script 直下の**関数宣言は `window` に載る**(実測: `mageAI` / `elfAI` / `allySleep` / `enemyElementMult` / `buildPerceptionParty` / `createEnemyDom` など 29 関数すべて `typeof window[n] === "function"`)。`window.isUndeadEnemy` を差し替えると名前で呼ぶ `enemySleepImmune` の結果が変わり(skeleton: true → false)、`window.enemyElementMult` を差し替えると `resolveElementDefense` の結果が変わった(0 → IMMUNE)。⇒ `loreMult` が `enemyElementMult` を**関数宣言の名前で**呼べば、ドライバの `window.enemyElementMult` の包みが効く。
   ⚠ ただし **`resolveElementDefense` は倍率 2 を「効きにくい」扱いで半減する**(実測 `{resisted: true, dmg: 5}` = 10 の半分)⇒ (2e) は**呪文の選び方だけ**を見ること(ダメージや吹き出しは RESIST になる。将来弱点を足すなら `resolveElementDefense` 側も直す必要がある = 本チケットの範囲外)。
   ⚠ `const` / `let`(`ENEMY_TYPES` / `ENEMY_TRAITS` / `enemyLabelElements` / `encounterEnemyIndices` / `NAME_LABEL_ON`)は `window` に**無い**(裸の識別子でだけ読める)。コメント `:32172` / `:32508`「const/function は window に載らない」は function について誤り。
8. **罠 3 の補強** → 演出の `element` は冷気だけでなく**雷もずれている**: ライトニングボルト `:28988` とライトニング・アロー `:31087` は `'arcane'`。演出から拾うと雷は `'arcane'` → 等倍になり、ウィル・オ・ウィスプ(雷が効かない)に撃ち続ける。⇒ §4 の `SPELL_ELEMENT` を持つ方針で過不足なし(属性を持つ攻撃呪文は 7 本 = `SPELL_ELEMENT` の 7 行と一致。magic-missile / magic-arrow / hail-of-thorns / conjure-volley は属性なし)。
9. **行の小さな指し違い(中身は正しい)**: §2-1 #1 ボスの枝 `:21497〜` → **`:21499〜21503`** / §2-1 #3 `MAGE_SKILLS` `:22197` → **`:22196`**(`ELF_SKILLS` は `:22263〜`、最後の shadow-step `:22324`)/ §2-5・§5-4 候補のフィルタ `:32620〜32648` → **非戦士の枝 `:32627〜32646`**(戦士は `:32615〜32622`・`choices` `:32651`・呼び口 `:32652`)/ §2-1 #6 `canSneak` `:25407〜25411` → `profs` `:25407`・`canSneak` `:25408〜25410`・ゲート `:25411`。
10. **§2-9「スイッチ表 `recruit / recruittalk / dndrange / mopup / s2fold / enemytraits`」** → `probe_s5s6_clear.js` の表 `INDEX_SWITCHES` `:101〜106` は **4 本(dndrange / mopup / s2fold / enemytraits)**。recruit / recruittalk は `parseArm` `:117〜118` の別処理。
    → 影響(項目4): `lore: { name: 'LORE_ON', want: (v) => v !== '0' }` を足す。`:124` の `enemytraits` 特例(`a.traitsOn`)と `:133` の「明示が無くても ENEMY_TRAITS_ON を確かめる」行に、lore 用の同形を足すかは項目4 が決める。
11. **§2-3 の判定値は既定の 5e 式の値** → `?ability5e=0`(B/X 式・`js/abilities.js:61〜69`)では 15・14 → +1 ⇒ 判定値 +3。受入は成功率を測らない(§8「測らないこと」)ので影響なし(注意だけ)。
12. **罠 1「`:21662` の後・`:21668` の前」** → 間に `sleepMs(600)` `:21663` / `applyBattleStartConsumables()` `:21666` / `tryNegatePreemptive(units)` `:21667` がある。3 本とも `Math.random` / `d20` を引かない(実測)⇒ 間のどこに置いても乱数の順は同じ。推奨は **`tryStealthSurprise()` の直前**(`:21667` の後)。

#### (3) 実装で使う行番号(HEAD `c4ec84b` = 配信物は `7402153` と同一)

| 何 | 行 |
|---|---|
| `runEncounter` / ボスの枝 / `detectEnemyFamily` の呼び口 | `:21481` / `:21499〜21503` / `:21505`(else の中) |
| 非ボス枝の叫びの抽選(`Math.random`) | `:21512` |
| イニシアチブ `d20` / 行動順のログ / 差し込み候補 / `tryStealthSurprise()` | `:21645` / `:21662` / `:21667` の後 / `:21668` |
| `detectEnemyFamily` / `ENEMY_FAMILY_MSG` | `:14422〜14447` / `:14410〜14421` |
| `ENEMY_TYPES`(51 キー) | `:9645〜10853`(キーごとの行は scratchpad の `keys.tsv`) |
| `createEnemyDom` / 札 / 名前 span の追加 / `enemyLabelElements` | `:12756` / `:12797〜12805` / `:12802` / `:12748`(窓 `__enemyLabels` `:12752`) |
| `createEnemy` | `:12830` |
| `.enemyLabel` の CSS / 70% 版 | `:326` / `:341` |
| `NAME_LABEL_ON` | `:3752〜3753` |
| `updateInfo` / `showRollAtPlayer` / `showRollAtEnemy` / `showRollAtAlly` / `rollTargetLine` | `:15772` / `:20599` / `:20610` / `:20622` / `:20564` |
| `d20` / `rollDiceDD` / `signedDD` | `:20496` / `:20497` / `:20506` |
| `isEscortObjective` / `getLeaderName` | `:17181` / `:19706` |
| `buildPerceptionParty` / `tryStealthSurprise` | `:25213〜25227` / `:25399` |
| `isUndeadEnemy` / `ENEMY_TRAITS_ON` / 表 / `enemyElementMult` / `enemySleepImmune` / `__dfEnemyTraits` | `:27484` / `:27491〜27492` / `:27493〜27502` / `:27504` / `:27513` / `:27521〜27524`(STEP1 はこの直後) |
| `pickClosestEngagedEnemyFromAlly` | `:27244〜27257` |
| `allySleep` / ローカル `enemiesInArea` / 狙点の評価 | `:28133` / `:28154〜28166` / `:28188`・`:28192`・`:28224〜28225`・`:28228` |
| `allySleep` の命中ループ(#75 の免疫 `:28265`・`stunned` `:28270`) | `:28262〜28276` |
| `evaluateThreat` | `:30207〜30224` |
| `clericAI`(触らない) | `:30227` |
| `mageAI` / シールド / スリープ / 攻撃呪文の候補 / 対象 / 既定の選択 / `fallbackOrder` / 呼び分け | `:30350` / `:30374` / `:30380〜30388` / `:30395〜30417` / `:30419` / `:30426〜30430` / `:30433` / `:30439〜30446` |
| `elfAI` / ライトニング・アロー | `:31278` / `:31308〜31316`(対象 `:31311`) |
| `isBossLikeDef` / `apGateP` / `apTryPreferred`(乱数 `:32269`) | `:32114` / `:32167` / `:32249` |
| `pickLeaderAction` / クランプ / `AP_BOOST` / 床 / 抽選 | `:32378` / `:32471` / `:32472` / `:32474` / `:32486` |
| `playerAttackTurn` / 候補のフィルタ(非戦士)/ `choices` / 呼び口 | `:32517` / `:32627〜32646` / `:32651` / `:32652` |
| `executeSkillOn`(主人公のスリープ `:19997`) | `:19891` |
| `js/skill-check.js`: `CLASS_PROFICIENCIES` / `CHECKS`(arcana 73・history 74・religion 75)/ `checkScore` / `resolveSkillCheck` / auto の枝 | `:57` / `:67〜` / `:105` / `:459` / `:482〜488` |

#### (4) `Math.random` の順序(罠 2 の土台)

- **戦いの始まり**: 非ボス枝の叫び `:21512`(pool > 0 のとき 1 回)→ イニシアチブ `d20` × 全ユニット `:21645` → 〔#76 新: 技能ごとに `d20` 1 回(`js/skill-check.js:163` を `:483` から)。習熟者 0 人の技能は引かない〕→ `tryStealthSurprise` の `d20`(auto / autoplay なら 1 回。パネル時は演出の `Math.random` が多数 `:287` / `:297`)→ 恐怖のオーラほか。
  ⇒ 伝承判定を 1 回でも振る戦いでは、隠密の接近の出目以降が 1 つずれる(§2-2「判定を振った時」の想定どおり)。
- **`mageAI`**: ① `apTryPreferred` `:32269`(酒場の指定があり・装備・スロット・無駄打ちでないときだけ 1 回)→ ② 自己シールド `:30374`(`hasAShield && slot && acBonus<=0 && hp<70% && threat>=15` のとき 1 回。緊急シールド `:30368` は乱数なし)→ ③ **スリープ `:30382`(`hasSleep && slot && 未スタン ≥ 2` のとき 1 回)** → ④ 攻撃呪文の選択は**乱数 0**(撃った `ally*` の中で `d20` / ダメージを引く)。
- **`elfAI`**: ① `:32269` → 回復 0 → ヴォリー 0 → **ライトニング・アロー 0**(`allyLightningArrow` の中で引く)→ マジック・アロー `:31323` → ヘイル `:31333` → ハンターズ・マーク `:31343` → コードン `:31353` → エイムド `:31365` → ヘイスト `:31377`(それぞれ条件成立時 1 回)。
  ⇒ 知っていてライトニング・アローを止めると、後段の枝の乱数が引かれる(= 「分岐が変わった時」の想定どおり)。
- **主人公**: `playerAttackTurn` の粘着の脱出 `d20` `:32566`(粘着時だけ)→ `pickLeaderAction` の抽選 **ちょうど 1 回 `:32486`**(重みの掛け算は乱数を引かない)。
  ⚠ 重みが 0 になると `:32474` で `nonFinite++` と `console.warn` → `window.__leaderPickWarns` が増え、重みは床 `LEADER_W_FLOOR` に戻る(= 外れない)。⇒ 倍率 0 の呪文は重みで殺さず、§5-4 のとおり**候補のフィルタで外す**こと(重みに掛けるのは 0.5 / 1 / 将来の 2 だけ)。
- **`allySleep`**: 狙点選びは乱数 0。命中ループ `:28266` で免疫以外の敵ごとに `d20` 1 回。
- **何も知らないとき**: §5-1 の `sleepPool`(= `unstunnedEnemies` と同じ長さ)と `sure = false` なら ③ の評価順と回数は同一。§5-2〜5-5 も「倍率 1・除外 0」なら分岐不変。

#### (5) 既存 golden 11 本の着手前の色(素で 1 回ずつ・直列・HEAD `c4ec84b`)

`run_golden11.sh`(`node tools/<本>.js` を引数なしで直列)。ログ = `item1/golden/<本>.log`。指紋 = #75 の `fp74.py` で経路①(assert の並び)・経路②(判定行の多重集合)を取り、`after75.tsv` の同じ腕と突き合わせた(`fp_compare.py`)。8765 を使う本は **0 本**(全本が自前のサーバ: 8831 / 8843 / 10141 / 9940 / 10101 / 10331 / 10351 / 10459 / 8845 / 8791 / 9850)。

| 本 | port | exit | 総括行 | 秒 | `after75.tsv` の同じ腕 | 指紋 ①/② | 型 |
|---|---|---|---|---|---|---|---|
| `driver_leader_ai` | 8831 | **0** | RESULT: 42/42 passed | 32 | exit 0・42/42・32 秒 | 一致 / 一致 | 緑 |
| `driver_action_priority` | 8843 | **0** | RESULT: PASSED 92 / FAILED 0 / PENDING 0 | 65 | exit 0・92/0・65 秒 | 一致 / 一致 | 緑 |
| `verify_aoe_coverage` | 10141 | **0** | 28/28 PASSED FAILED 0 PENDING 0 | 3 | exit 0・28/28・3 秒 | 一致 / 一致 | 緑 |
| `verify_cone_cast` | 9940 | **0** | 19/19 PASSED FAILED 0 PENDING 0 | 65 | exit 0・19/19・73 秒 | 一致 / 一致 | 緑 |
| `verify_hold_person` | 10101 | **0** | 31/31 PASSED FAILED 0 PENDING 0 | 9 | exit 0・31/31・10 秒 | 一致 / 一致 | 緑 |
| `verify_hold_pair` | 10331 | **0** | 21/21 PASSED FAILED 0 PENDING 0 | 904 | exit 0・21/21・904.6 秒 | 一致 / 一致 | 緑 |
| `verify_spell_off` | 10351 | **0** | 51/51 PASSED FAILED 0 PENDING 0 | 6 | exit 0・51/51・6 秒 | 一致 / 一致 | 緑 |
| `verify_enemy_traits` | 10459 | **0** | 15/15 PASSED FAILED 0 PENDING 0 | 4 | exit 0・15/15(総括行)・4 秒 | (判定行 0 件 = `✓` 形式を `fp74` が拾わない)/ 同 | 緑 |
| `driver_sce1_events` | 8845 | **1** | `[drv] RESULT: 211/214 passed` | 50 | exit 1・211/214・49 秒 | 一致 / 一致 | **赤・型3(無関係)** |
| `driver_skillcheck_roster` | 8791 | **0** | RESULT: 13/13 passed | 4 | exit 0・13/13・4 秒 | 一致 / 一致 | 緑 |
| `verify_enemy_name_label` | 9850 | **0** | 30/30 PASSED FAILED 0 PENDING 0 | 2 | exit 0・30/30・3 秒 | 一致 / 一致 | 緑 |

⇒ 着手前の色 = **緑 10 / 赤 1(型3)**。11 本とも `after75.tsv` と**同色同数・指紋まで一致**。合計 約 1,150 秒。

- `driver_sce1_events` の赤 3 件は #75 §12-0 (9) と同じ型3(`sceneFlags` のキーが 3 本と焼かれているのに #53 の `s3_novice_swayed` で 4 本)= FAIL `(2)` / `(4d)` / `(N2-隣)`。G10 / G10b(隠密の接近)は緑。⇒ 項目5 で 211/214 から動いたら #76 を疑う。
- ⚠ `driver_sce1_events` は `SkillCheck.resolveSkillCheck` を差し替えて**呼び出し回数を assert する**(差し替え `:451` / `:729` / `:1106`・`calls.length === 0 / 1` の assert `:645〜663` / `:972〜991` / `:1453〜1459` / `:1949〜2061`)。イベントの流れの中で `runEncounter` まで進むと伝承判定の呼び出しが数に混ざる = 名指し 11 本のうち**最も踏みやすい**。
- `driver_skillcheck_roster` は `index.html` を**開かない**(エンジン単体を about:blank に注入 + `tavern.html`)⇒ #76 の `index.html` の変更では原理的に動かない(`js/skill-check.js` を触っていない証拠にだけなる)。
- `verify_enemy_traits` の変異アンカー(#75 §12-3・起動時に原本で件数 1 を検算・崩れると素でも exit 3)のうち `stunguard` は `allySleep` の `:28265` と `:28270` の逐語を握る。⇒ 項目2 は `allySleep` を触るとき、この 2 行を**書き換えず・同じ文字列を複製しない**こと。
- `verify_aoe_coverage` §4 は吹き出しの「範囲 N体」(= `affectedIdxs.length`)を読む ⇒ §5-5 の方針(`affectedIdxs` を変えない)なら不変。
- `verify_hold_pair` は実プレイ(goblin-mine を本番の戦闘で回す)を含む ⇒ 伝承判定の `d20` で乱数列がずれる本。着手前の値を控えたので、項目2 は同色同数かを見る(値のゆらぎは記録)。
- `verify_enemy_name_label` は札の大きさと CSS を測る ⇒ `.enemyCr` の CSS を足しても、盤面で判定を振らないので札の中身は変わらないはず(項目2 で確かめる)。

#### (6) `after75.tsv` の流用 — **可**(154 腕すべてを #76 の着手前の色として使う)

- 根拠(blob OID で測った。⛔ `git status` / grep では測っていない):
  - `git diff --stat 7402153 c4ec84b` = `実装依頼書/` の 3 本だけ(+720 / −2)。`git ls-tree -r 7402153` と `c4ec84b` の差も**同じ 3 本だけ**(901 項目中)。
  - `git ls-tree <rev> index.html tavern.html audio.js js tools assets` のハッシュ = `57a9ccf8…` で `7402153` / `ba2e258` / `c4ec84b` の 3 つとも同一。個別: `index.html` `acbc101a…` / `tavern.html` `f2a45902…` / `audio.js` `311aee29…` / `js` `00e2267a…` / `tools` `268a2c4b…` / `assets` `8bcc2bae…`。
  - 作業ツリー: `git hash-object` が `index.html` / `tavern.html` / `audio.js` とも HEAD の blob と一致・`git diff --stat HEAD` = 0 行。
  - `after75.tsv` は #75 §12-5 のとおり本番 HEAD `7402153` で走った(155 行 = ヘッダ + 154 腕・`started_at` 2026-09-29T01:26〜)。
  - 追試: 名指し 11 本を今走らせた結果が `after75.tsv` の同じ腕と**同色同数**(上の表)。
- ⚠ 使えるのは**素と #75 用の `--negative` の色**まで。#76 用の `--negative` の選び直し(#75 §12-5 (2) の ④「差分を含む関数の中のアンカー」)は項目5 が機械で行い、着手前の色は影のツリーとの交互の対比較で取る(#75 と同じ)。
- **項目5 の道具**(#75 の scratchpad `…/77bd3943-0319-4699-9438-549ec95bd6b8/scratchpad/item5/`):
  - 走行器 `sweep_75.py`(同じ場所の `fp74.py` を import)⇒ #76 の scratchpad へ**コピー**し、`ARMS`(`armlist_75.json` = `{arms, n_base_from_after74, neg_selected, new}`)を #76 の腕の表へ、`TSV` を `after76.tsv` へ書き換える(⛔ `after75.tsv` を上書きしない = 着手前の色そのもの)。`arm_id` の SKIP で再開できる。
  - 影のツリー `mkshadow_75.py` ⇒ コピーして `BASE = 'c4ec84b'`(#76 の前の本番)にする。戻すファイルは `git diff --name-only BASE HEAD -- index.html tavern.html audio.js js assets title.html town.html world.html` から自動で決まる(#76 なら `index.html` と `tavern.html` の 2 本)。⚠⚠ 置き場 `S` は**新しい名前にする**: #75 の `shadow/`(287 MB・#75 前の本番バイト入り)が残っており、`mkshadow` は `S` が在るとコピーを飛ばす = そのまま使うと**#75 前の本番を「#76 前」と誤認する**。
  - 対比較 `pair_75.py <outdir> <N> <book[:--negative]>…`(`SHAD` を新しい影へ)・比較 `cmp_75.py`・`--negative` の選別 `select_neg75.py` / `sel2.py` / `build_arms.py`。
  - ⚠ `fp74.py` は `✓ (id)` 形式の判定行を拾わない(`verify_enemy_traits` の `after75.tsv` の pass_count が 0 なのはこのため。総括行は 15/15)。
- 試遊サーバ 8765 は今 LISTEN 中(pid 26728 / 9600・ユーザーのもの・止めていない)。母集団の `auto_debug_run.js`(素)は既定で 8765 を立てる ⇒ 項目5 の前にユーザーの承認を取る(#75 と同じ)。

#### (7) 項目2〜5 への注意

- 項目2: `unit` の持たせ方(崩れ 2)/ 吹き出しの `<b>` と type(崩れ 3)/ 狙点の数える 5 か所と `aoeBoxReachable` は全員のまま(崩れ 4)/ 重みに 0 を掛けない(§(4))/ `verify_enemy_traits` のアンカー 2 行を書き換えない / 挿入位置は `tryStealthSurprise()` の直前(崩れ 12)/ `index.html` は CRLF。
- 項目3: `gameOver` と主人公(崩れ 2)/ (2c)(2d) は装備と threatScore を選んで差を作る(崩れ 5・6)/ (2e) は `window.enemyElementMult` の包みが効く・ダメージは半減する(崩れ 7)/ (0d) の SRD は BOM 付き CRLF・`cr:` は小数 / (2g) の主人公の対象は「武器の射程内で HP が最も低い敵」(`:32585〜32607`)で最寄りではない・射程内に居ないと `pickLeaderAction` を呼ばずに前進する / (2h) は `?aoecover=0` だと候補が対象の周り 4 通りだけ(撤退の腕で当てるなら盤面の置き方に注意)。
- 項目4: スイッチ表は 4 本(崩れ 10)。
- 項目5: `after75.tsv` を着手前の色に使う / 影は新しい置き場で `BASE = c4ec84b` / 8765 の承認。

### 12-2. 本番実装(項目2)

touched: `index.html`(+228 / −7・CRLF のまま 39,825 → 40,046 行・bare LF 0)と `tavern.html` の `changelogList` 1 行(`py tools/add_changelog.py` で §10 の文面・既定 4 件維持・CRLF のまま)だけ。`js/*.js` / `audio.js` / `title/town/world.html` / `tools/` は 0 バイト。
パッチは scratchpad `…/f5deb037-…/scratchpad/item2/patch.py`(13 か所・各アンカー `str.count == 1` を確かめて置換・LF で処理して CRLF へ戻す)。

#### (1) 実装後の行番号(項目2 のコミット時点)

| 何 | 行 |
|---|---|
| `.enemyCr` の CSS | 342(`.enemyLabel` 326 の塊の直後・`body.labelSmall .enemyLabel` の直前) |
| `createEnemyDom` / 札への呼び口 `loreDecorateLabel(index);` | 12758 / 12808(`enemyLabelElements.push(lb);` の直後 = 添字が引ける位置) |
| `runEncounter` / `detectEnemyFamily` の呼び口(else の中)/ 行動順のログ / **`await runLoreCheck();`** / `tryStealthSurprise()` | 21484 / 21508 / 21665 / **21671** / 21672 |
| `buildPerceptionParty` / `tryStealthSurprise` | 25217 / 25403 |
| `enemyElementMult` / `window.__dfEnemyTraits` | 27508 / 27525 |
| STEP1 の塊 | 27529〜27707: `LORE_ON` 27532 / `LORE_SKILL_OF` 27533 / `SPELL_ELEMENT` 27550 / `LORE_KNOWN` 27555(`LORE_TRIED` / `LORE_NOBODY_SAID` / `LORE_SLEEP_BOOST` / `LORE_SKILL_ORDER` が続く)/ `loreKnows` 27560 / `loreMult` 27562 / `loreSleepUseless` 27566 / `LORE_CR` 27569 / `loreCrText` 27577 / `loreDecorateLabel` 27584 / `loreTraitText` 27603 / `runLoreCheck` 27623 / `loreEngagedAwake` 27688 / `loreSleepAllUseless` 27693 / `loreSleepSureCount` 27698 / `window.__dfLore` 27702 / `var LORE_READY` 27707 |
| `allySleep` / `sleepWorth` / `affectedIdxs` / 免疫の `continue`(#75 のアンカー)/ stunned の書き込み | 28316 / 28373(評価 5 か所がこれを通る)/ 28417 / 28452 / 28457 |
| `evaluateThreat` / `clericAI`(不変) | 30394 / 30414 |
| `mageAI` / `sleepPool` / スリープの条件 2 行目 / `loreTgt`(効かない呪文を外す)/ `loreOrder`(差し替え) | 30537 / 30571 / 30574 / 30615 / 30641 |
| `elfAI` / ライトニング・アローの条件 | 31488 / 31523 |
| `isBossLikeDef` / `pickLeaderAction` / `AP_BOOST` の行 / `loreM` | 32325 / 32589 / 32683 / 32687 |
| `playerAttackTurn` / 候補のフィルタ 2 行 / `choices` | 32735 / 32864〜32865 / 32872 |

#### (2) §4〜§7 からの逸脱(振る舞いはすべて仕様どおり)

1. **`var LORE_READY` の門を足した**(`loreDecorateLabel` の先頭)。`createEnemyDom` は起動時の `spawnNodeEnemies()`(トップレベルの `withNodeRng(…, spawnNodeEnemies)`)で**STEP1 の塊より先に**走るため、`const LORE_ON` などを読むと TDZ の ReferenceError でページが死ぬ。`var` は巻き上げで起動時 `undefined` = 何もしない。
2. **`unit` は写しへ足さず、`runLoreCheck` の中の対応表(`Map`)で引く**(§12-0 崩れ 2 の推奨どおり)。`buildPerceptionParty()` 本体は無改造、写しの形も不変。対応は「主人公(`hp > 0 && !gameOver`)→ 生存仲間の順」で本体と同じ条件で並べる。
3. **吹き出し**は `<span class="label">LORE</span>{技能} 1d20(<b>n</b>){+b} = <span class="big">total</span> vs DC d`、type = 出目 20 `crit` / 1 `fumble` / 成功 `hit` / 失敗 `miss`(§12-0 崩れ 3)⇒ #49 の判定行「出目 N+ → 成功/失敗 ±m」が付く(実測)。
4. **技能の順は固定** `LORE_SKILL_ORDER = history → religion → arcana`(決定論のため。1 戦で最大 3 回)。判定を振ったら `sleepMs(400)`(吹き出しを見せる間。乱数は引かない)。
5. **「正体を知る者はいない」の 1 行は技能ごとに 1 回の冒険に 1 行まで**を `LORE_NOBODY_SAID`(Set)で持つ。窓 `__dfLore` に `nobodySaid` / `sleepBoost` を足した(§4 の窓の中身に追加だけ)。
6. **`mageAI` の差し替え**は「効き目が最大の候補(同値なら `fallbackOrder` と同じ順の先着)」。§5-2 の「最初のその候補」と §2-6 の「倍率が最大」が食い違うが、今のデータ(0 / 0.5 / 1)ではどちらでも同じ結果。`fallbackOrder` は else の中の定義を動かさず、同じ並びを `loreOrder` として持った(`verify_cone_cast` / `driver_action_priority` の説明が指す行を動かさないため)。
7. **`pickLeaderAction` の倍率**は `if (tgt) { … }` の中で `loreM > 0` のときだけ掛ける(0 はフィルタで外してあるが、ドライバが直接呼んだとき 0 を掛けて warn を出さない保険)。`LORE_SLEEP_BOOST` は「眠ると知っている未スタンの交戦敵 ≥ 2」で掛ける。主人公のフィルタの「全員眠らない」は未スタンの交戦敵が **1 体以上**いるときだけ真(0 体で真にすると何も知らない時にもスリープが消える = 罠 2)。
8. 特徴の文(`loreTraitText`)は体質の窓の関数(`enemyElementMult` / `enemySleepImmune`)から作る。`?enemytraits=0` では体質が無い = 「眠りの術が効く」。

#### (3) 使い捨て検証(scratchpad `item2/probe_lore.js`・port 10491・自前 http・8765 不使用)= **33/33 PASS**・ページのエラー 0

盤面 = `verify_enemy_traits` の `openIndex` / `installProbe` / `board`(2 行の床の区間を探して 2x2 を置けるようにした)+ `ally*` の非同期関数を記録器へ差し替える(`verify_cone_cast` の `quiet` の形)+ `SkillCheck.resolveSkillCheck` を包んで (技能, DC, 渡された編成の classKey, auto) を記録。主人公を編成に入れるため `run()` の間だけ `gameOver = false`。

- ① ボス戦: リッチ + スケルトンで `runEncounter` を回し `tryStealthSurprise` で止める → 宗教の判定が 1 回・DC 15(`boss_appear` の枝でも振る)。`?lore=0` では 0 回。
- ② 習熟者だけ: 宗教 → `[cleric]` / 歴史 → `[mage]` / 3 技能の混成 → `history:mage, religion:cleric, arcana:mage` の 3 回(主人公の戦士は一度も混ざらない)。僧侶が居ない → 呼び出し 0・「正体を知る者はいない」1 行・`tried` に入らない・同じ冒険の 2 戦目は行を繰り返さない。獣だけ → 呼び出し 0・ログ 0。
- ③ 成功(出目 20)→ `known` にスケルトン・その場の 2 体の札に `.enemyCr` がちょうど 1 つ(`CR1/4`)・ログ 1 行「📜 リタは伝承を思い出した — スケルトン (脅威度 1/4): 眠りの術が効かない」・吹き出しは `LORE` + 判定行「出目 6+ → 成功 +14」。失敗(出目 1)→ `tried` だけ・札なし・「思い出せない… (宗教 5 < DC 10)」・type fumble。2 戦目は振らない。ゴブリン + ゴブリンキング → DC 15・キングの札に CR なし・キングだけならログに「脅威度」なし。後から作った知っている種類の敵 → 札に CR が 1 つ・`decorate` 2 回でも 1 つ。
- ④ AI: スケルトン 3 体を知る → 20 手番で `allySleep` 0(知らない = 11)/ ゴブリンを知る × 乱数 0.99 → スリープ(知らない = 撃たない)/ ファラクサスを知る × fireball + MM(threat ≥ 30)→ MM(知らない = fireball)・fire-bolt だけ → `false`(スリング)/ カエルムを知る × cone + fireball(hp 5 = threat < 25)→ fireball(知らない = cone)/ リッチを知る → cone(0.5)から fireball(1)へ差し替え / `window.enemyElementMult` を包んでゴブリン×炎 = 2 → 知っていれば fire-bolt(知らない = MM)= 器が効く / ウィスプを知る × エルフ → LA を撃たない(知らない = 撃つ)・リッチ(雷 0.5)なら撃つ / 狙点: ゴブリン 2 体(近い)+ スケルトン 3 体(遠い 2x2)→ 知っていればゴブリン側に落ちて 2 体眠る・知らなければスケルトン側(範囲 3 体・誰も眠らない)。主人公(魔法使い)`playerAttackTurn` の `choices`: ファラクサスを知る → fire-bolt が無い / スケルトンだけを知る → sleep が無い(知らなければ両方ある)。重み: 眠ると知るゴブリン 2 体で sleep の選択 178/400(知らない = 114/400)・乱数はちょうど 1 回/呼び出し・`__leaderPickWarns` 0。
- ⑤ **何も知らない恒等**: 6 盤面 × 3 装備 × hp 2 通りの `mageAI` 8 手番・6 盤面の `elfAI` 8 手番・4 盤面の `pickLeaderAction` 30 回(計 47 列・非自明 42 列)で、呼ばれた `ally*` の列と `Math.random` の回数が `?lore=0` の腕と**全列一致**。
- ⑥ `?lore=0`: `__dfLore.on === false`・`run()` の呼び出し 0・`known` 0・札なし・`runEncounter` で判定なし。

#### (4) 名指し golden 11 本(素・HEAD `19cf889` + 本変更の作業ツリー)= 着手前と**同色同数**

| 本 | exit | 総括行 | 秒 | 着手前(§12-0 (5)) |
|---|---|---|---|---|
| `driver_leader_ai` | 0 | RESULT: 42/42 passed | 32 | 同じ |
| `driver_action_priority` | 0 | PASSED 92 / FAILED 0 / PENDING 0 | 65 | 同じ |
| `verify_aoe_coverage` | 0 | 28/28 PASSED | 3 | 同じ |
| `verify_cone_cast` | 0 | 19/19 PASSED | 86 | 同じ |
| `verify_hold_person` | 0 | 31/31 PASSED | 10 | 同じ |
| `verify_hold_pair` | 0 | 21/21 PASSED | 904 | 同じ(0・21/21・904) |
| `verify_spell_off` | 0 | 51/51 PASSED | 6 | 同じ |
| `verify_enemy_traits` | 0 | 15/15 PASSED(`--negative` 7/7・担当に完全一致・exit 0・28 秒) | 4 | 同じ |
| `driver_sce1_events` | 1 | RESULT: 211/214 passed | 48 | 同じ。FAIL は着手前と同じ (2) / (4d) / (N2-隣) の 3 件だけ(型3) |
| `driver_skillcheck_roster` | 0 | RESULT: 13/13 passed | 4 | 同じ |
| `verify_enemy_name_label` | 0 | 30/30 PASSED | 2 | 同じ |

- `driver_sce1_events` は言い直し不要だった(同色同数・FAIL の 3 件は着手前と同じ文面)。
- ログ = scratchpad `item2/golden/<本>.log`。

#### (5) 項目3 の変異アンカー(`py` の `str.count` で各 1 件・`item2/anchors.py` → `anchors.txt`)

`index.html` は CRLF。下はどれも 1 行の中で閉じる逐語(改行を含まない)。

| 変異 | アンカー(逐語) | 行 |
|---|---|---|
| `bossbranch` | 呼び口 `        await runLoreCheck();             // ★[#76] 伝承判定。⚠ ボスの分岐の外 (リッチ・ファラクサス戦でも振る = 依頼書 §2-2 罠 1)` を消し、`        const fam = detectEnemyFamily(initialEngaged);` の後ろへ移す(`runEncounter` は async なので移した先でも `await` が書ける。行数を保つなら移し先は同じ行の末尾へ連結し、元の行は空行かコメントへ) | 21671 / 21508 |
| `rngparity` | `          && (sure || Math.random() < apGateP(ally, "sleep", 0.5))) {`(条件の 2 行目)/ 1 行目 `      if (hasSleep && hasSpellSlot(ally, "sleep") && sleepPool.length >= 2` | 30574 / 30573 |
| `iceword` | `"cone-of-cold": "cold", "ice-storm": "cold",` | 27553 |
| `nogate` | `        const party = all.filter(m => (profs[m.classKey] || []).indexOf(skill) >= 0);` | 27648 |
| `reroll` | `        for (const t of g.types) LORE_TRIED.add(t);` | 27662 |
| `alwaysknow` | `    function loreKnows(e) { return LORE_ON && !!e && LORE_KNOWN.has(e.type); }` | 27560 |
| `familyreuse` | `        const skill = LORE_SKILL_OF[e.type];` | 27630 |
| `switchdead` | `new URLSearchParams(window.location.search).get("lore") !== "0";` | 27532 |
| `crguess` | `      lizardWarrior: 0.5, lizardHunter: 0.5, lizardRaider: 0.5,`(同じ行の末尾に `goblinKing: 1,` を足す) | 27575 |
| `crdecimal` | `      return ({ 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" })[cr] || String(cr);` | 27580 |
| `crdup` | `      if (lb.querySelector(".enemyCr")) return false;   // 既に付いている = 何もしない` | 27593 |

- 既存のアンカーも各 1 件のまま(実測): `verify_enemy_traits` の stunguard `        if (enemySleepImmune(t)) { immune++; immuneNames.push(t.def.name); continue; }`(28452)と書き込み `          t.stunned = Math.max(t.stunned || 0, skill.stunTarget);`(28457)/ `driver_action_priority` N1 の `if (apPrefId && id === apPrefId) w *= AP_BOOST;`(32683・クランプの直後の隣接は保った)/ `driver_field_step7` の `if (wide && !aoeBoxReachable(aCX, aCY, foeIdxs, rangeTiles))`(28702・不変)。
- ⚠ `rngparity` の注入の仕方: 2 行目を `(Math.random() < apGateP(…) || sure)` へ入れ替えるだけでは、**何も知らない時は同じ回数**(2 体未満なら 1 行目で短絡)なので (3a) が赤くならない。1 行目の先頭で引く形(例: 1 行目を `      if (Math.random() < 2 && hasSleep && …` に = 2 体未満・スロット切れでも 1 回引く)にすること。

#### (6) 崩れた主張の追加

13. **§4「`loreDecorateLabel` は `createEnemyDom` の札を作った直後に呼ぶ」をそのまま書くとページが起動時に死ぬ**(TDZ)。`createEnemyDom` は起動時 `spawnNodeEnemies()` で STEP1 の塊より前に走る。⇒ `var LORE_READY` の門(逸脱 1)。呼び口も `lb.appendChild(nameSpan)` の直後ではなく `enemyLabelElements.push(lb)` の直後(札を配列から引くため)。
14. **§5-4「`sleep` は交戦中の未スタンの生存敵が全員 `loreSleepUseless` なら外す」**を `every` で素直に書くと、未スタンの敵が 0 体のとき(全員眠っている)に**何も知らなくても**スリープが候補から消える(空配列の `every` は真)= 罠 2 に触れる。⇒ 1 体以上を条件に足した(逸脱 7)。

### 12-3. 新規受入(項目3)

touched: `tools/verify_lore_check.js`(新規・LF・1,098 行)と本書 §12-3 だけ。本番(`index.html` / `tavern.html` / `audio.js` / `js/*.js`)と既存の golden・`tools/probe_s5s6_clear.js` は 0 バイト。
走らせ方: `node tools/verify_lore_check.js`(素)/ `--negative`(素の基準 + 変異 11 本)/ `--mutate <key>`(1 本だけ手回し)/ `--only a,b`。ポート = 素 **10471**・変異 **10472〜10482**(`MUTATIONS` の並び順)。自前の http(8765 不使用)。exit 0 / 1(FAIL・空振り・担当の漏れ)/ 2(環境: puppeteer・Chrome・**SRD のフォルダが読めない**)/ 3(変異アンカーの腐敗)。

#### (1) assert の一覧 — **25 本**(§8 の 24 本 + 起動確認 (0e))

| 節 | id | 何を測るか(期待値の出所) |
|---|---|---|
| §0 | (0a) | [装置] 判定の呼び出し ≥1(走査で 40 回)・`mageAI` のスリープ ≥1(11 回)と攻撃呪文 ≥1・`elfAI` の LA ≥1・`pickLeaderAction` ≥1(120 回)・主人公の `choices` が取れた |
| | (0b) | `__dfLore` の在・`on === true`・関数 6 本・`skillOf` の全キーが `ENEMY_TYPES` に実在・`ENEMY_TYPES` 51 キー = ドライバの表 40 + 対象外 11(重複 0・過不足 0) |
| | (0c) | `skillOf` = ドライバの `DRV_SKILL`(51 種)**+ 実効の技能**(51 種を 1 種ずつ 2 体置いて `run()` した時に `resolveSkillCheck` へ渡った技能。caravanWagon は護衛対象なので振らない)+ `spellElement` 7 行 = `DRV_ELEMENT` + 属性語が `__dfEnemyTraits.table` の語(fire / cold / lightning)の中 |
| | (0d) | ページの `cr` 34 キー = **起動時に SRD の `<slug>.md` の前付け `cr:` から読んだ値**(`DRV_SLUG` 34 行・slug 26 本)・「出さない」17 キーが表に無い・34 + 17 = `ENEMY_TYPES` |
| | (0e) | [装置] 6 ページが起動・pageerror 0(favicon だけ除外)。⭐ `--negative` の起動確認(構文破壊の偽の検出を見分ける) |
| §1 | (1a) | 戦士 + 盗賊の別ページ × スケルトン → 呼び出し 0・「正体を知る者はいない」1 行・`tried` 空・2 戦目は 0 行 |
| | (1b) | 主人公 戦士 + 魔法使い + 僧侶(`gameOver = false` で主人公も編成に入る)× スケルトン → `religion` 1 回・`auto`・渡された classKey = `["cleric"]`(ドライバの習熟表 `DRV_PROF` で全員が宗教持ち) |
| | (1c) | 出目 20 → `known` にスケルトン・`knows()` 真 / 出目 1 → 呼び出し 1・`tried` に入り `known` に入らない・`knows()` 偽・札なし |
| | (1d) | 成功の後・失敗の後それぞれ同じ種類の 2 戦目 → 呼び出し 0 |
| | (1e) | ラットだけ → 呼び出し 0・ログ 0 行 |
| | (1f) | ゴブリン → DC 10 / ゴブリン + キング → DC 15 + **走査で振られた 40 回すべての DC** = 定義のフラグ(`isBoss` / `eyeStalks` / `maxSummons`)からドライバが出した値(`isBossLikeDef` を使わない) |
| | (1g) | リッチ + スケルトンの `runEncounter`(`tryStealthSurprise` で止める)→ 宗教 1 回 DC 15 + 対照: ゴブリンの `runEncounter` も歴史 1 回 |
| | (1h) | スケルトンを見抜く → 📜 行 1 つに `1/4`・2 体の札に `CR1/4` ちょうど 1 つ / ゴブリン + キング → キングの札なし / キングだけ → ログに「脅威度」なし / 出目 1 の札なし + **走査で見抜いた 40 種すべての札 = SRD の CR の分数表記か無し・ログの「脅威度 X」の有無も一致** |
| | (1i) | 知っている種類を後から作る(`createEnemy` → `enemies.push` → `createEnemyDom`)→ 札に `CR1/4` が 1 つ・`decorate` 2 回でも 1 つ(戻り値 false)/ `?namelabel=0` のページ → 判定は成功・札は `null` のまま・例外なし |
| §2 | (2a)〜(2h) | 項目2 の盤面どおり(§12-2 (3) ④)。(2c) は **fireball + MM**(threat ≥ 30)と **fire-bolt だけ**(知る = `false` / 知らない = fire-bolt)、(2d) は **hp 5 / 1** で threat < 25(§12-0 崩れ 5・6)。(2g) は主人公を魔法使いにした別ページ(ON / `?lore=0` の 2 枚)+ 重み(眠ると知るゴブリン 2 体で sleep 178/400 > 114/400・乱数 400 回・warn 0) |
| §3 | (3a) | 何も知らない: `mageAI` 36 列 + `elfAI` 6 列 + `pickLeaderAction` 4 列 + warn の 47 列が `?lore=0` と完全一致(非自明 42・スリープを含む 30) |
| | (3b) | `clericAI`: 6 盤面 × 味方の傷あり/なし × 6 手番(計 152 個)の呼び出し列と乱数の回数が「盤面の全種を知る」と「何も知らない」で完全一致。呼ばれた種類 = ホールド・パーソン / キュア・ウーンズ / ターン・アンデッド / シールド・オブ・フェイス、乱数 6 回 |
| §4 | (4a) | (1b)(1c)(1g)(1h)(2a)(2b)(2c)(2f)(2g) の**同じ述語関数**を ON と `?lore=0` へ当て、OFF で全部偽 + OFF の窓 `on === false`(#75 (4a) と同じ形) |

- 素 ×3(2026-09-29・HEAD `077c4c9` の配信物 = `index.html` は `06fd7de` と同一): **25/25 PASSED・exit 0・2.8 秒**(3 回とも同じ)。
- `--srd C:/nonexistent` → **exit 2**「(0d) SRD のフォルダ … が読めない (環境)」(緑にしない)。
- アンカーを 1 文字ずらした使い捨てのコピー → **exit 3**「変異 crdup の注入点がちょうど 1 箇所ではない (0 件)」。

#### (2) 担当表の実測(`--negative` = **11/11**・赤の集合 = 担当に完全一致・exit 0・28.8 秒)

| 変異 | 注入(配信だけ・本番は無改造) | §8 の予想 | 実測の赤(= 担当) | 差 |
|---|---|---|---|---|
| `bossbranch` | 呼び口をコメントへ・`detectEnemyFamily(initialEngaged);` の行末へ `await runLoreCheck();` | (1g) | (1g) | 同じ |
| `rngparity` | スリープの条件 1 行目の先頭に `(LORE_ON ? Math.random() < 2 : true) &&` | (3a) | (3a) | 同じ(⚠ 注入の形は崩れ 15) |
| `iceword` | `"cone-of-cold": "ice"` | (0c)(2d) | (0c)(2d) | 同じ |
| `nogate` | `const party = all;` | (1a)(1b) | (1a)(1b) | 同じ |
| `reroll` | `LORE_TRIED.add` の行をコメントへ | (1d) | **(1c)**(1d) | +1:(1c) の「出目 1 の後 `tried` に入る」 |
| `alwaysknow` | `loreKnows` = `LORE_ON && !!e`(撤退スイッチは効く形) | (1c)(3a) | **(0a)**(1c)**(1h)(2a)(2b)(2c)(2d)(2e)(2f)(2g)(2h)**(3a) | +10:「知らない時」の側が全部崩れる(スリープ 0 回 = 装置 (0a) も赤・起動時の札で失敗した種類にも CR が付く) |
| `familyreuse` | `const skill = ({goblinoid/bandit/orc/kobold/lizardman: history, undead: religion, dragon/hydra: arcana})[detectEnemyFamily([i])];` | (0c) | (0c) | 同じ(実効の技能の走査で拾う。ページの表は無傷なので**表の突き合わせだけでは空振り** = 崩れ 16) |
| `switchdead` | `… !== "0" \|\| true` | (4a) | (4a) | 同じ |
| `crguess` | `LORE_CR` に `goblinKing: 1` | (0d)(1h) | (0d)(1h) | 同じ |
| `crdecimal` | `loreCrText` = `String(cr)` | (1h) | (1h)**(1i)** | +1:(1i) の後から作った札の文字が `CR0.25` |
| `crdup` | 「既に `.enemyCr` があれば何もしない」をコメントへ | (1i) | (1i) | 同じ |

- 予想より広がったのは 3 本(reroll / alwaysknow / crdecimal)。どれも**予想の節は実測の赤に含まれる**(ドライバが起動時に `NEG_PREDICTED ⊂ NEG_EXPECT` を検算し、崩れたら exit 3)。
- 変異はすべて 1 行の中で閉じ、行数不変(起動時に原本で各 1 件・注入文字列が原本に無いことを検算)。

#### (3) 崩れた主張の追加

15. **§12-2 (5) の申し送り「rngparity は 1 行目の先頭で `Math.random()` を引く形(例 `if (Math.random() < 2 && hasSleep && …`)」では (3a) が赤くならない**。変異は配信の `index.html` に入るので ON と `?lore=0` の**両腕が同じだけ余分に引き**、(3a) の比較で差が出ない(使い捨てのコピーで実測: 赤 = なし)。⇒ #76 の経路でだけ引く形 `(LORE_ON ? Math.random() < 2 : true) &&` にした(= 「#76 の追加が乱数の順を変えた」欠陥の姿)。
16. **§8 (0c)「ページの `skillOf` とドライバの表が 51 種すべてで一致」だけでは `familyreuse` が空振りする**(変異は `runLoreCheck` の中の技能の決め方を変えるだけで `LORE_SKILL_OF` と窓は無傷)。⇒ (0c) に**実効の技能**(51 種を 1 種ずつ `run()` して `resolveSkillCheck` に渡った技能)を足した。同じ走査を (1f)(全 DC)と (1h)(全種の札)にも使う。
17. **§8 (1h) の文面だけだと `alwaysknow` の担当が (1c)(3a) に収まらない** — 「知っている」が常に真だと、盤面を作る時点(`createEnemyDom` → `loreDecorateLabel`)で失敗した種類にも札が付き、§2 の「知らない時」の側もすべて崩れる。担当は実測の 12 節にした(⛔ assert を弱めて絞っていない)。
18. **§8 (0d) の SRD の前付けは本書 §12-0「BOM 付き CRLF」とは限らない** — 322 本のうち 321 本は CRLF だが **`goblin.md` だけ LF**(BOM 付き)。ドライバは BOM を剥がし CRLF / LF の両方を受ける(値は `0.125` / `5.0` 形式 → `parseFloat`)。

#### (4) 母集団へ足す腕(項目5)

- `verify_lore_check`(素)… `node tools/verify_lore_check.js` → 総括行 `25/25 PASSED   FAILED 0   PENDING 0`・exit 0・約 3 秒。
- `verify_lore_check:--negative` … `node tools/verify_lore_check.js --negative` → `負のコントロール 11 / 11 が検出成功`・`[vet] --negative OK`・exit 0・約 29 秒。
- ⚠ 判定行は `  ✓ (id) …` 形式 = `fp74.py` の経路①/② が拾わない(#75 の `verify_enemy_traits` と同じ)。指紋は総括行で見ること。
- ⚠ Dropbox の SRD フォルダ(`C:\Users\PC_User\Dropbox\🔷ナレッジ🔷\raw\srd\monsters`)が無い機械では exit 2(環境)。影のツリーから走らせても SRD は絶対パスで読むので同じ(`--srd <dir>` で差し替え可)。
- 所要の内訳: ページ 6 枚(主 ON / 主 `?lore=0` / 主人公=魔法使い ON / 同 `?lore=0` / 戦士 + 盗賊 / `?namelabel=0`)。項目4 の走行と並走中の実測。

### 12-4. 勝率の記録(項目4)

決裁どおり**記録するだけ**で、難易度も AI も調整していない。道具 = `tools/probe_s5s6_clear.js`(コミット `077c4c9`。#75 の道具に `lore` スイッチと記録の列を足した)。

- 走らせた版: 本番 = `06fd7de`(走行中の HEAD は `077c4c9` = tools の 1 本だけ)。道具は起動時に `git diff HEAD -- index.html tavern.html audio.js js/` が空であることを確かめている。
- 設定: #75 と同じ。酒場 → `prepScenario` → `regeneratePartyMembers()` → `departToScenario()`(本番の出発)、`?autoplay=15`、**4 人編成**(`?recruittalk=0` = 従来の自動抽選)、XP は推奨 Lv で焼く(S5 = Lv8 = 28000 / S6 = Lv10 = 45000)。1 走行の上限は 1200 秒(打ち切り 0 件)。
- 腕: ON = 既定 / OFF = `?lore=0`(`--off-qs lore=0`)。着地後に `LORE_ON` と `window.__dfLore.on` を読み、腕どおりであることを確かめた(装置 assert 0f)。体質は両腕とも ON(`ENEMY_TRAITS_ON=true` も 0f で確認)。
- 並べ方: ペアごとに ON/OFF を 1 走行ずつ交互(奇数ペアは ON 先)。N = 各 10 ペア = **40 走行、装置 assert の崩れ 0 件**。
- 数え方(本番には何も置いていない。道具が着地直後に包む):
  - 伝承判定 = `SkillCheck.resolveSkillCheck` を `opts.auto === true` かつ history / religion / arcana の呼び出しだけ包み、回数・成功・DC を技能ごとに数えた。同時にログの「📜」行(思い出した / 思い出せない / 知る者はいない)を数え、**包みの回数 = 📜 の成否行の数**であることを装置 assert 0j で確かめた(40/40)。OFF 腕で判定 0 回・📜 行 0・`known` 0 であることを 0i で確かめた(20/20)。
  - スリープの「眠らない」= `allySleep` の「N体は眠らない」の N(#75 と同じ)。⚠ これは**範囲内に居た**眠らない敵の数で、狙った敵の数ではない(眠る敵を狙っても、隣のスケルトンが巻き込まれれば数える)。
  - 炎の IMMUNE = `resolveElementDefense` の「炎は通用しない!」を**敵の名前ごと**に数えた。

| シナリオ | 腕 | 走行 | クリア | 敗北 | ボス部屋到達 | 所要秒 平均 (クリア/敗北) | スリープ詠唱 / 眠らない体数 (1 回あたり) | 伝承 成功/回数 (技能) | 「知る者はいない」行 | ファラクサスへの炎 IMMUNE | RESIST |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S5 undead-temple | ON | 10 | **7/10** | 3 | 10/10 | 182 (175/199) | 17 / 30 (1.76) | 8/11(宗教 8/11) | 7 | 0 | 5 |
| S5 undead-temple | OFF | 10 | **8/10** | 2 | 10/10 | 180 (173/210) | 18 / 32 (1.78) | 0/0 | 0 | 0 | 3 |
| S6 dragon-lair | ON | 10 | **0/10** | 10 | 10/10 | 195 (—/195) | 32 / 1 (0.03) | 8/10(歴史 8/10) | 6 | 2 | 0 |
| S6 dragon-lair | OFF | 10 | **0/10** | 10 | 10/10 | 185 (—/185) | 27 / 0 (0.00) | 0/0 | 0 | 2 | 0 |

- 停滞・打ち切りは 4 腕とも 0。到達ノードは全走行 `n4>n7`。
- 検定: S5 クリア ON 7/10 vs OFF 8/10 = **Fisher の正確検定 両側 p = 1.00** / S6 は 0/10 vs 0/10(p = 1.00)。眠らない体数(詠唱回数を露出量とした条件付き二項)は S5 30/17 vs 32/18 で p = 1.00。**N=10 では ON/OFF の差はどれも検出できない。**
- 参考: #75 の S5 ON(伝承が無かった版)は 21 回で 40 体 = 1 回あたり 1.90。

ペアごとの決着(左 = ON / 右 = OFF、c = クリア / d = 敗北):
- S5: p1 cc / p2 cc / p3 cd / p4 cc / p5 **dc** / p6 cc / p7 **dc** / p8 cd / p9 **dc** / p10 cc
- S5 ON で僧侶が居た走行は **3/10**(p2 = 戦士+僧侶,僧侶,魔法使い / p3 = 戦士+ドワーフ,僧侶,魔法使い / p4 = 戦士+盗賊,僧侶,魔法使い)。**3 本ともクリア**。
- S6: 10 ペアとも dd。
- 編成: 主人公は 40 走行すべて戦士(`leaderClassKey` = warrior)。仲間 3 人の抽選に魔法使いは 40/40 で入っている。僧侶は S5 ON 3 / S5 OFF 6 / S6 ON 4 / S6 OFF 4、エルフは 7 / 5 / 7 / 5(各 10 本中)。走行ごとの編成は TSV の `hero_class` / `ally_classes` 列。

所見:
1. **S5(地下神殿)の伝承は僧侶が居ないと起きない。** アンデッドは全部「宗教」で、宗教の習熟は僧侶だけ(`CLASS_PROFICIENCIES`: 魔法使い = 魔法学・歴史 / エルフ = 知覚・魔法学)。自動抽選で ON 腕に僧侶が入ったのは 3/10 で、残り 7 本は「📜 この敵の正体を知る者はいない」が 1 行出て終わる(「知る者はいない」行 7 = 僧侶の居ない走行の数と一致)。判定が起きた 3 本は宗教 8/11 成功で、スケルトン・ゾンビなどを知った。
2. **手応えの指標「眠らない体数」は、知っている走行では確かに下がった。** 僧侶が居て判定が成功した 3 本(p2 / p3 / p4)は、スリープ詠唱が **3 本で計 1 回・眠らない 2 体**。知らない 7 本は 16 回で 28 体(1.75/回)。魔法使いは知っているとスリープ自体を撃たない方向に働いている(p2・p4 で 0 回)。⚠ ただし N=3 で、腕全体の 1 回あたり(1.76 vs 1.78)は編成の抽選に埋もれて差が出ない。**効果を測るなら編成を固定した腕**(僧侶を必ず入れる)が要る。
3. **S6(竜の巣)ではファラクサスに一度も伝承判定が振られていない(ON 10/10 本とも)。** ON で知ったのはオーク(骨の谷 n4 の歴史判定、魔法使いが振る)だけで、`__dfLore.tried` にファラクサスが入った走行は 0。魔法学の習熟者(魔法使い)は 10/10 本に居る。
   - 推定原因(本番は直していない): `runLoreCheck` は `runEncounter` の頭で `encounterEnemyIndices`(戦闘開始時の交戦敵)だけを見る。ボス部屋 n7 は護衛のミノタウロス 2 体(伝承表に無い = 振らない)がボスの手前に立ち、ファラクサスは奥(`index.html:38822〜38823`)。ファラクサスは戦闘の途中で**増援として合流**(`mergeReinforcements` `:21271`)するとみられ、この経路は伝承判定を通らない。依頼書 §2-2 罠 1 の「ファラクサス戦でも振る」は、ボスが最初の交戦に入る場合しか満たされない。⚠ 合流の経路そのものは未実測(増援のログ行を数えていない)。
   - そのため S6 の ON/OFF の差は「オークを知る」だけで、竜への炎を避ける AI の分岐は 1 度も動いていない。**ファラクサスへの炎の IMMUNE は ON 2 回・OFF 2 回で同じ**(#75 の 40 走行では 0 回。今回は 20 走行中 4 本で 1 回ずつ)。
4. **S6 は ON も OFF も 0/10**(#75 と同じ)。全走行がボス部屋に届き、ファラクサスの前で主人公が倒れる。伝承と無関係な難易度の話(#75 所見 2 の続き)。
5. 所要時間は ON がわずかに長い(S5 +2 秒 / S6 +10 秒)。伝承判定は 1 回ごとに `sleepMs(400)` を挟むので、その分は構造的に伸びる。⚠ 項目3 の検証と CPU を分け合っていたので、絶対値は割り引いて読む。

別チケット候補(項目5 / 起草窓へ):
- (A) **増援・召喚で合流した敵にも伝承判定を振る**(`mergeReinforcements` などの合流点で判定を呼ぶ)。これが無いと S6 のファラクサス戦で伝承が働かない。決めるのは起草窓(仕様判断)。
- (B) 手応えを測るなら、僧侶を必ず入れた S5 の腕(編成を固定する手段が要る。`?recruittalk=0` の抽選では 3/10)。
- (C) S6 の難易度(#75 からの持ち越し)。

道具の使い方:

    node tools/probe_s5s6_clear.js --scen undead-temple,dragon-lair --pairs 10 --off-qs lore=0 \
         --tsv <out.tsv> --detail <dir> --port 10470 --max 1200

- `--off-qs` を省くと #75 と同じ腕(OFF = `?enemytraits=0`)。TSV の既存列の並びは #75 と同じで、#76 の列は末尾に足した(`traits_arm` `lore_arm` `hero_class` `ally_classes` `lore_n` `lore_ok` `lore_by_skill` `lore_log_ok` `lore_log_fail` `lore_nobody` `lore_known` `lore_tried` `immune_by_name`)。`arm` 列はその走行の腕のキー(ON/OFF)。
- 中断しても同じコマンドで再開できる(TSV にある `run_id` = `<scen>:p<N>:<ON|OFF>` を SKIP)。今回は 40 走行で約 2 時間 5 分(`started_at` の 1 本目 00:00:20 〜 40 本目 02:01:37 UTC + 最後の 1 走行)。ポートは 10470 だけ(自前の http。試遊サーバ 8765 は使わない = 止めていない)。
- 結果の置き場(scratchpad `f5deb037…\item4\`): `winrate76.tsv`(40 行)/ `winrate76.log` / `detail\<run_id>.json` / 集計 `agg76.py`(表・Fisher・ペア別・編成)。`smoke\` は道具の確かめ(S5 1 ペア・崩れ 0)で、表には含めていない。

**仕様変更 (A) 後の追試(項目4b のコミット `986ce7d` の後・S6 × 1 ペア)**: 同じ道具・同じ設定(`--scen dragon-lair --pairs 1 --off-qs lore=0`・4 人・Lv10・道具の門「`git diff HEAD` が空」✓)で 1 ペアだけ走らせた。
ON(戦士 + 僧侶・魔法使い・魔法使い)= 敗北・ボス部屋到達・伝承 **3 回**(歴史 1/1 DC10・宗教 0/1 DC10・**魔法学 0/1 DC15**)・`tried` = **orc, pharaxus, skeleton** / OFF(戦士 + 戦士・僧侶・魔法使い)= 敗北・判定 0 回・ファラクサスへの炎 IMMUNE 1。
⇒ 項目4 の 10 本で 0 回だった**ファラクサスへの魔法学の判定が、合流の時に 1 回振られた**(出目は失敗 = DC 15 は判定値 +4 で 50%)。クリア率は問わない(記録だけ・N=1)。ログと TSV = scratchpad `f5deb037…\item4b\probe_s6_after.log` / `.tsv`。§12-4b (6) の `merge_probe.js` の 2 走行(2/2 で `tried` にファラクサス)と合わせて、仕様変更 (A) の狙いは実走で 3/3 成立。

### 12-4b. 仕様変更 (A) — 合流した敵にも伝承判定(項目4b)

touched: `index.html`(+6 / −2・CRLF のまま 40,046 → 40,050 行・bare LF 0)/ `tavern.html` の `changelogList` 先頭の #76 の行の**書き換え**(行は増やさない・既定 4 件のまま・CRLF のまま)/ `tools/verify_lore_check.js`(節 (1j) と変異 `nomerge`)/ 本書 §2-7・§8・§12-4b。`js/*.js` / `audio.js` / `title/town/world.html` / `tools/probe_s5s6_clear.js` / 既存の golden は 0 バイト。
成果物 = scratchpad `…/f5deb037-…/scratchpad/item4b/`(`merge_probe.js` = 合流の口を包んで 1 走行を記録 / `patch.py` / `s*_*.log|json` / `vlc_*.log` / `golden/`)。

#### (1) 経緯

- 項目4(§12-4 の勝率の記録・`077c4c9`)で、**S6 竜の巣の ON 10 走行すべてでファラクサスに伝承判定が 1 回も振られなかった**(`__dfLore.tried` はオークだけ。魔法学の習熟者 = 魔法使いは 10/10 本に在籍)。原因の推定 = ボス部屋ではミノタウロス(自然 = 振らない)との戦闘が先に始まり、ファラクサスは途中で増援として合流する。§2-7「途中から加わる敵は次の戦いまで判定しない」のとおりだが、§2-2 罠 1 の目的「ファラクサス戦でも振る」が実走で不成立。
- 2026-09-29、起草窓 claude-2e 経由で**ユーザーが (A) を承認**: 途中から合流した敵(増援・召喚)の未判定の種類にも振る。§2-7 の該当行は取り消し。守ること = 振る種類が無ければ `Math.random` を引かない(罠 2)/ 1 種類 1 冒険 1 回 /「正体を知る者はいない」は 1 冒険 1 技能 1 行。

#### (2) 合流経路の実測(本番を触る前・HEAD `4e738da`)

`merge_probe.js` = `probe_s5s6_clear` と同じ本番の出発(酒場 → `prepScenario` → `regeneratePartyMembers` → `departToScenario`・`?autoplay=15&recruittalk=0` = 4 人・推奨 Lv の XP)で 1 走行を回し、着地直後に `window.mergeReinforcements` / `runEncounter` / `bossTurnSummon` / `spawnMinionNearBoss` / `spawnGoblinChariot` / `spawnSovereignAddWave` / `spawnWave` / `runLoreCheck` / `SkillCheck.resolveSkillCheck` / `updateInfo` を包んで、呼ばれた順と `encounterEnemyIndices` の種類を記録した(包みが裸の呼び出しに効くことは `mergeReinforcements === window.mergeReinforcements` で確認)。

| 走行 | 編成 | 決着 | ボス部屋 n7 の入り方 |
|---|---|---|---|
| S6 `s6_a` | 戦士 + 盗賊・エルフ・魔法使い | 全滅 | `runEncounter` の初期交戦 = `[minotaur]` → **2 ラウンド目の `mergeReinforcements` で `[minotaur, pharaxus]` が合流** → 判定 0 回 |
| S6 `s6_b` | 戦士 + 僧侶・盗賊・魔法使い | 全滅 | 同じ(初期 `[minotaur]` → 合流 `[minotaur, pharaxus]`)。続いて **`bossTurnSummon`(ファラクサス)→ `spawnMinionNearBoss` がオークを作る(`encounterEnemyIndices` へは入れない)→ 次のラウンドの `mergeReinforcements` で `[orc, orc]` が合流**(3 回とも同じ形) |
| S5 `s5_a` | 戦士 + 盗賊・エルフ・魔法使い | クリア | **リッチも同じ**: 初期 `[skeleton]` → 合流 `[skeleton, lich]`(§12-4 の S5 で宗教の判定が振られたのは、道中のアンデッドが戦闘開始時の交戦に居たから) |
| S1 `s1_a` / `s1_b` | 戦士 + 魔法使いほか | クリア 2/2 | 道中の合流で goblinBrute / goblinRider / goblinArcher / goblinShaman(未判定の種類)が合流 = 旧仕様では判定しない種類があった。戦車の乱入・キングの召喚は 2 走行とも起きず |

- ⇒ 推定は**実測で確定**: ファラクサス(とリッチ)は `mergeReinforcements` で戦闘に入る。召喚(`maxSummons` のボスの `bossTurnSummon`)で生まれた手下は **`spawnMinionNearBoss` では交戦に入らず、次のラウンド頭の `detectReinforcements()` → `mergeReinforcements` を通る** = 召喚に別の口は無い。
- `encounterEnemyIndices` へ入る口の全列挙(`grep -n "encounterEnemyIndices.push\|encounterEnemyIndices = "`): 戦闘開始 `runEncounter` の `encounterEnemyIndices = initialEngaged.slice()`(`:21492`)/ 終了時の `= []`(`:21905`)/ 検証の窓 `setEncEnemies`(`:13851`)/ **戦闘中の口 4 つ**: ① `mergeReinforcements` `:21271`(呼び口 = ラウンド頭 `:21711` と掃討 `:21813`。増援とボスの召喚の手下)② `spawnGoblinChariot` `:33740`(呼び口 `:21726`・廃坑のキングの戦車の乱入)③ `spawnSovereignAddWave` `:33857`(`:21733`・単眼の暴君の手下)④ `spawnWave` `:33968`(`:21746`・隊商護衛の波)。②〜④ は `enemies.push` → `createEnemyDom` → `encounterEnemyIndices.push` → イニシアチブを自前で振る(`mergeReinforcements` と同じ手順)。
- 判断: ①〜④ はどれも「戦闘の途中で交戦に加わる敵」で、1 種類 1 冒険 1 回の門があるので振る回数は種類の数で頭打ち(波や召喚が毎ターン湧いても、判定済みの種類は振らない)⇒ 4 つとも同じ呼び出しを入れた(振る舞いの変化は「未判定の種類が合流した時に d20 が 1 回増える」だけ)。

#### (3) 実装(行番号は項目4b のコミット時点)

| 何 | 行 | 中身 |
|---|---|---|
| `runLoreCheck(onlyIdxs)` | 27624 / 走査 27628 | 対象の添字の配列を受ける。省略 = 従来どおり `encounterEnemyIndices`(戦闘開始の呼び口 `:21672` は引数なしのまま = 振る舞い不変)。走査の行は `for (const i of (onlyIdxs \|\| encounterEnemyIndices))` |
| ① `mergeReinforcements` | 21307 | 合流した全員のイニシアチブを振った後・`sortUnits()` の前に `await runLoreCheck(list);` |
| ② `spawnGoblinChariot` | 33798 | 同じ位置に `await runLoreCheck([idx]);` |
| ③ `spawnSovereignAddWave` | 33902 | `await runLoreCheck(encounterEnemyIndices.slice(encounterEnemyIndices.length - count));`(ループで末尾へ積んだ `count` 体。⚠ `slice(-count)` は `count` 0 で**全員**を返すので使わない) |
| ④ `spawnWave` | 34033 | ③ と同じ形(波の `count` は 0 が合法 = 「何も湧かない波」) |

- 罠 2: `runLoreCheck` は振る種類が無ければ `resolveSkillCheck` を呼ばず、`sleepMs` も挟まない(技能の塊が空なら素通り)⇒ 振る種類の無い合流・判定済みの種類の合流・`?lore=0` では乱数も待ち時間も今までと同じ。
- 1 種類 1 冒険 1 回(`LORE_TRIED`)・「知る者はいない」の 1 行(`LORE_NOBODY_SAID`)・習熟で絞る(罠 4)・DC(ボス格 15)・札の `CR…`(`loreDecorateLabel`)は `runLoreCheck` の中身をそのまま使う = 新しい規則は無い。
- 吹き出しの順: REINFORCE(イニシアチブ)→ LORE(判定)。
- ⚠ 変異アンカーの行は書き換えていない・複製していない(`py` の `str.count` で各 1 件: `bossbranch` の呼び口 `:21672`・`verify_enemy_traits` の stunguard 2 行・本節の `nomerge`)。`runLoreCheck` の関数宣言の行と走査の行はどの golden のアンカーでもない(`grep -rF` で tools/ scripts/ に 0 件。`verify_aoe_coverage.js:524` の同じ字面は自前の走査で、アンカーではない)。

#### (4) 受入の追加(`tools/verify_lore_check.js`)

- **(1j)**: ミノタウロス 2 体の戦い(`encounterEnemyIndices` = その 2 体)へ、本番の `mergeReinforcements(idxs, [], () => {})` で 3 段合流させる。① ミノタウロス(乱数 0.5)② ファラクサス(乱数 0.95 = 出目 20)③ 2 体目のファラクサス(判定済み)。
  - ON: ① 呼び出し 0 / ② **魔法学 1 回・DC 15(定義のフラグからドライバが出す)・渡された全員が魔法学の習熟(= 魔法使いだけ)・`auto`・`known` にファラクサス・札 = `["CR10"]`(SRD の `young-red-dragon.md` の `cr: 10` から)・吹き出しは REINFORCE の後に LORE** / ③ 呼び出し 0。
  - 乱数(罠 2): 各段の `Math.random` の回数を `?lore=0` の腕と突き合わせる — 実測 ① 1 / 1・② **2 / 1**(+1 = 判定の d20)・③ 1 / 1。
  - (4a) の述語の集合に (1j) を足した(`?lore=0` で偽)。
  - 実測の出力: `📜 ミラは伝承を思い出した — レッドドラゴン「ファラクサス」 (脅威度 10): 炎が効かない`。
- 変異 **`nomerge`**(port **10483**): ① の `await runLoreCheck(list);` をコメントへ(= §2-7 の旧仕様)。
- 担当は `--negative` の実走で決めた(予想 ⊂ 実測は起動時に検算):

| 変異 | 旧担当 | 項目4b 後の赤(= 担当) | 増えた理由 |
|---|---|---|---|
| `nogate` | (1a)(1b) | (1a)(1b)**(1j)** | 合流の判定にも魔法学を持たない戦士・僧侶が混ざる |
| `reroll` | (1c)(1d) | (1c)(1d)**(1j)** | 判定済みの 2 体目の合流でもう一度振る |
| `familyreuse` | (0c) | (0c)**(1j)** | ミノタウロスが `detectEnemyFamily` で `orc` = 歴史になり、振る種類の無いはずの合流で振る |
| `switchdead` | (4a) | **(1j)**(4a) | `?lore=0` の腕でも合流で振り、② の乱数の回数が ON と同じになる |
| `nomerge`(新) | — | **(1j)** | 予想どおり |
| 他 7 本 | — | 変化なし | — |

- 結果: 素 ×3 = **26/26 PASSED・exit 0・2.9〜3.0 秒**(3 回とも同じ)/ `--negative` = **`負のコントロール 12 / 12 が検出成功`・`[vet] --negative OK`・exit 0・32.5 秒**。既存の 25 本の assert と担当は弱めていない(広げただけ)。

#### (5) 名指し golden(素・項目4b の作業ツリー)= 着手前(§12-0 (5) / §12-2 (4))と**同色同数**

| 本 | exit | 総括行 | 秒 |
|---|---|---|---|
| `driver_leader_ai` | 0 | 42/42 passed | 32 |
| `driver_action_priority` | 0 | PASSED 92 / FAILED 0 / PENDING 0 | 65 |
| `verify_aoe_coverage` | 0 | 28/28 PASSED | 3 |
| `verify_cone_cast` | 0 | 19/19 PASSED | 76 |
| `verify_hold_person` | 0 | 31/31 PASSED | 10 |
| `verify_hold_pair` | 0 | 21/21 PASSED(実プレイ 6 走行・背景で並走) | 約 900 |
| `verify_spell_off` | 0 | 51/51 PASSED | 5 |
| `verify_enemy_traits` | 0 | 15/15 PASSED(`--negative` 7/7・exit 0・28 秒) | 5 |
| `driver_sce1_events` | 1 | 211/214 passed(FAIL は着手前と同じ (2) / (4d) / (N2-隣) の 3 件 = 型3) | 48 |
| `driver_skillcheck_roster` | 0 | 13/13 passed | 4 |
| `verify_enemy_name_label` | 0 | 30/30 PASSED | 3 |

- 追加で、書き換えた口 ②④ を踏む本のうち短い 2 本も素で走らせた: `driver_field_step5`(波の湧き位置)48/48 PASS・exit 0・4 秒 / `driver_mine_wall`(戦車の湧き)66/66 PASS・exit 0・264 秒(`after75.tsv` の同じ腕 = 48/0・66/0 と同じ)。長い `driver_field_step0` / `_step6` / `_wagon` は項目5 の母集団に任せた。

#### (6) S6 の実走(項目4b の後)

⚠ `tools/probe_s5s6_clear.js` は起動時に `git diff HEAD -- index.html tavern.html audio.js js/` が空でなければ exit 2 で止まる(記録の前後で別ビルドが混ざらないための門)⇒ コミット前の作業ツリーでは走らない。そこで同じ出発の手順の `merge_probe.js` で S6 を 2 走行した(ON・4 人・Lv10)。

| 走行 | 編成 | 決着 | ボス部屋 | `tried` |
|---|---|---|---|---|
| `s6_after_1` | 戦士 + エルフ・僧侶・魔法使い | 全滅 | 合流 `[minotaur, pharaxus]` の直後に **魔法学 DC 15 を 1 回**(「ヴァレンは思い出せない… (魔法学 12 < DC 15)」)。召喚のオークの合流では振らない(判定済み) | orc, skeleton, **pharaxus** |
| `s6_after_2` | 戦士 + 盗賊・魔法使い・魔法使い | 全滅 | 同じく **魔法学 DC 15 を 1 回**(「マグヌスは思い出せない… (魔法学 9 < DC 15)」) | orc, **pharaxus** |

⇒ **ファラクサスが `tried` に入った = 2/2**(変更前は項目4 で 0/10・本節 (2) で 0/2)。2 本とも失敗の出目(DC 15 は判定値 +4 で 50%)。道中でも n4 のスケルトンの合流で宗教の判定が振られた(`s6_after_1`)。クリア率は問わない(記録だけ)。

#### (7) 変異アンカー(逐語・`index.html` は CRLF・各 1 件)

| 変異 | アンカー | 行 |
|---|---|---|
| `nomerge` | `      await runLoreCheck(list);   // ★[#76 項目4b] 増援 (ボスの合流・召喚された手下の合流) のうち未判定の種類だけ振る` | 21307 |

- 既存 11 本(§12-2 (5))と `verify_enemy_traits` の stunguard 2 行は字面そのまま・各 1 件(行番号は `bossbranch` の呼び口が 21671 → 21672 に 1 行ずれただけ)。

#### (8) 項目5 への申し送り

- 母集団の腕の総括行が変わる: `verify_lore_check`(素)= `26/26 PASSED   FAILED 0   PENDING 0` / `verify_lore_check:--negative` = `負のコントロール 12 / 12 が検出成功`・`[vet] --negative OK: 12 本すべて…`。ポートは 10471〜10483。
- 差分を含む関数(`--negative` の母集団を選び直すときの ④): 項目2 の一覧に **`mergeReinforcements` / `spawnGoblinChariot` / `spawnSovereignAddWave` / `spawnWave` / `runLoreCheck`** を足す。②〜④ を踏む本 = `driver_field_step0` / `_step5` / `_step6` / `_wagon` / `driver_mine_wall`(`grep -l` で `spawnWave` / `spawnGoblinChariot` / `spawnSovereignAddWave` / `__waveProbe` / `__chariotProbe` / `__sovereignProbe` を引いた 5 本)。
- 乱数がずれる場面が増えた: 未判定の種類が戦闘の途中で合流したとき(廃坑の道中の合流で goblinBrute / goblinRider / goblinArcher など・竜の巣のファラクサス・神殿のリッチ)。実プレイを回す本の緑→赤は影のツリーと交互に比べて帰属を決めること。

### 12-5. 母集団の非退行(項目5) — 2026-09-29〜30 / 本番 = HEAD `986ce7d`

⛔ 本番も `tools/` も 1 バイトも触っていない(走査・再走の前後で `git status --short` = 0 行・HEAD = `986ce7d`)。変えたのは本書 §12 と台帳の `| 76 |` 行だけ。
#76 の本番の差分 = `git diff --name-only c4ec84b HEAD` のうち配信物 = `index.html` と `tavern.html`(changelog 1 行)の 2 本だけ。
成果物 = scratchpad `…/f5deb037-8f94-4cba-becc-588ea310d3ff/scratchpad/item5/`(道具は #75 の `item5/` からコピーして直したもの。`fp74.py` は sha256 `818535166700358c` のまま)。

#### (1) 腕の導出 = 160 腕(`item5/build_arms_76.py` → `armlist_76.json`)

| 枠 | 腕 | 導出 | 着手前の色 |
|---|---|---|---|
| `after75.tsv` の全腕 | 154(素 149 + `--negative` 5) | 同じ順。154 本とも HEAD に実在を assert | `after75.tsv`(§12-0 (6) で流用可と判定) |
| 新規受入 | 2 | `verify_lore_check` 素 / `--negative` | なし(緑であること) |
| `--negative`(選び直しで増えた分) | 4 | `verify_enemy_name_label` / `verify_hold_person` / `verify_road_ambush` / `verify_run_chronicle` | なし ⇒ 影のツリーとの対 |

#### (2) `--negative` の選び直し(`item5/sel2_76.py` → `select_neg76.json`)

- #75 の `sel2.py` を `BASE = c4ec84b` / `AFTER = HEAD` にして当てた。対象 = コードに `--negative` を持つ本 31 本のうちページを読む 29 本(`verify_lore_check` は正のコントロール)。
- #76 の差分を含む関数(④ の範囲)= 旧版 12 / 新版 23: `allySleep` / `elfAI` / `mageAI` / `mergeReinforcements` / `playerAttackTurn` / `runEncounter` / `spawnGoblinChariot` / `spawnSovereignAddWave` / `spawnWave` / `createEnemyDom` / `enemySleepImmune`(STEP1 の塊の挿入点)/ `pickLeaderAction` + 新版は `runLoreCheck` と STEP1 の `lore*` 関数 10 本。= 申し送りの一覧と一致。
- ⚠ #75 の選別器は「最初の `function` 宣言より前の行」(= `<style>` の CSS)を行 1 からの 1 つの範囲にしてしまう。#76 は CSS `.enemyCr` を足したので、そのままだと `js/town-map.js` / `title.html` / `display=` などの字面で **5 本が雑音で選ばれた**(`driver_heromark_signplate` / `verify_mercenary_roster` / `verify_player_sheet` / `verify_town_exit` ほか)。⇒ 最初の関数より前の行は「関数の中」に数えないよう直した。
- 選ばれた本 = 6 本: `verify_aoe_coverage` / `verify_enemy_traits`(この 2 本は `after75.tsv` に `--negative` の腕がある)+ `verify_enemy_name_label` / `verify_hold_person` / `verify_road_ambush` / `verify_run_chronicle`(新たに足した 4 腕)。`after75.tsv` の `verify_bolt_aim` / `verify_bolt_bounce` / `verify_cone_cast` の `--negative` は #76 の差分に掛からないが、着手前の色があるので腕に残した。

#### (3) 走査と所要

- `item5/sweep_76.py`(直列・毎腕後に `df_*` の居残り Chrome を掃除 = 全 160 腕で 0)。2026-09-29 19:20:53 → 2026-09-30 00:46:31(**325.6 分**・中断なし)。共通 154 腕の合計 289.8 分(`after75.tsv` 283.9 分)。打ち切りは `probe_party_size`(素)の 600 秒だけ(着手前と同じ)。
- 最長: `verify_bolt_aim` 2,239.6s / `probe_p9_tour` 1,654.7s / `driver_field_step6` 1,640.8s / `verify_run_chronicle --negative` 1,502.2s / `auto_debug_run` 952.3s(#75 721.2s・#74 1,039〜1,074s の範囲内)/ `verify_hold_pair` 904.5s。

#### (4) 色の遷移(exit code が主・共通 154 腕)

| 遷移 | 件数 | 本 |
|---|---|---|
| 緑→緑 | 136 | — |
| 赤→赤 | 14 | `driver_field_step6` 54/59 / `driver_grid_p4` exit 3 / `driver_grid_p8` 55/56 / `driver_mapeditor` 176/179 / `driver_mapeditor_painting` 105/106 / `driver_monsters_hobgoblin` 12/14 / **`driver_sce1_events` 211/214(同じ 3 件)** / `driver_speech_v2` 45/46 / `probe_bandit_map` `probe_s2_fold` `probe_swamp_map` exit 3 / `probe_party_size` 13/20 / `sweep_recruit_balance` / `verify_walk_block` 22/23 — すべて着手前と同数 |
| **緑→赤** | **3** | `driver_monsters_kobold` 12/12 → 11/12(`(e)` entries=0)/ `driver_monsters_umberhulk` 22/22 → 21/22(`(3) 再発火` maxGazesPerEnemy=1)/ `driver_speech_engine` 17/17 → 16/17(`(4) カメラが実際に動いた` camXレンジ 5.8px) |
| 赤→緑 | 1 | `probe_n4_stall`(停滞を 87 秒で捕捉 = 調査の道具) |
| 新規 | 6 | 全部 exit 0(下の表) |

| 新規の腕 | exit | 総括 | 秒 |
|---|---|---|---|
| `verify_lore_check`(素) | 0 | `26/26 PASSED   FAILED 0   PENDING 0` | 3.0 |
| `verify_lore_check --negative` | 0 | `負のコントロール 12 / 12 が検出成功` / `[vet] --negative OK: 12 本すべて担当ラベルだけが赤くなりました (空振り 0・漏れ 0)` | 32.0 |
| `verify_enemy_name_label --negative` | 0 | 58/58 PASSED | 15.0 |
| `verify_hold_person --negative` | 0 | `--negative OK: 8 本すべて担当ラベルが赤` | 80.0 |
| `verify_road_ambush --negative` | 0 | 97/97 PASSED | 460.2 |
| `verify_run_chronicle --negative` | 0 | `--negative OK: 8 本すべて担当ラベルが赤` | 1,502.2 |

- 名指し golden 11 本 = 着手前と同色同数・指紋まで一致(`driver_sce1_events` は 211/214 のまま)。
- 口②〜④を踏む本 = `driver_field_step0` 33/33 / `_step5` 48/48 / `_step6` 54/59(同じ 5 件)/ `_wagon` 18/18 / `driver_mine_wall` 66/66 — 5 本とも同色同数・指紋一致。実プレイの `verify_hold_pair` 21/21・`auto_debug_run` 緑。

#### (5) 2 経路の突き合わせ(`item5/cmp_76.py -v`)

比べられる腕 137(共通 154 − 判定行 0 行 15 − 指紋が走行ごとに動く 2)。経路① 133/137・経路② 131/137 が一致。差 = 緑→赤 3 本(値差)+ `driver_monsters_hobgoblin`(赤い assert が `(d)` 2 件 → `(e)` 2 件に入れ替わり・#74/#75 と同じ既知の形)+ `driver_field_step1`(位相の実測で本文が「予測が微小 = この位相では欠陥が物理的にほぼ無い」に替わった・合否同じ)+ `driver_grid_p5`(抽選の職業 `ally:warrior` → `ally:elf`・#73 以来の既知)。

#### (6) 緑→赤の帰属(影のツリー `item5/shadow76/` = `index.html` / `tavern.html` だけ `c4ec84b` の blob を CRLF で置いた実体コピー。blob OID = `acbc101a…` / `f2a45902…` で c4ec84b と一致・他の配信物と `js/` `assets/` は作業ツリーと同一・`tools/` 192 = 192)

| 本 | 本番(交互の対) | 影 | Fisher(両側) | 判定 |
|---|---|---|---|---|
| `driver_monsters_kobold` | 緑 6/6 | 緑 6/6 | 1.00 | 揺れ(走査の 1 回は 8 試行とも観測 0 件 = フレークの指紋) |
| `driver_speech_engine` | 緑 13/36 | 緑 15/36 | 0.81 | 揺れ(赤の形 = camXレンジ 0〜10px と ±8px の 2 件落ちが両方の木に出る。#74 の凍結・after74 でも赤) |
| `driver_monsters_umberhulk` | 緑 1/20(+ 走査 0/1) | 緑 5/20(+ `after75` 1/1) | 0.18(対だけ)/ 0.093(走査と `after75` を足す) | 揺れ・**要観察**(下) |

`driver_monsters_umberhulk (3) 再発火`(#69 以来の既知の揺れ。#74 の凍結・`after74.tsv` でも赤・`after75.tsv` だけ緑)は、20 対で本番 1 / 影 5 と本番側に寄ったが有意ではない(p = 0.18)。構造では帰属の経路を消せない:
種 = アンバーハルク 2 + ミノタウロス 1 + **コボルド 5**・編成に魔法使い(歴史の習熟)⇒ 戦闘開始で歴史の判定が 1 回(DC 10)振られ、成功するとコボルドを「眠る」と知り、魔法使いのスリープが確率ゲートなしで撃たれる(§5-1 の `sure`。アンバーハルクも眠る種類なので巻き込まれうる)。
そこで**同じ本番のバイトで ON / `?lore=0` を交互に**回し、再発火までの時間を直接測った(`item5/probe_uh.js`・ドライバと同じ種と編成・1 ページ = ドライバの 1 試行):
- 60 秒窓: 再発火 ON **13/20** / OFF **16/20**(p ≈ 0.48)。再発火までの秒の中央値 ON 45.8 / OFF 47.0 = **分布の本体は同じ**。ON は伝承の成功 17/20・スリープ 39 回 / 38 回。
- 36 秒窓(ドライバの 1 試行 ≈ 100 回 × 300ms に近い): ON **0/30** / OFF **3/30**(p = 0.24)。再発火は大半が 37 秒以降で、ドライバの観測窓の**縁の外**で起きている。
- ⇒ 判定 = **#76 に帰属する緑→赤とは言えない**(対 p = 0.18・足して 0.093・仕組みの計測 p = 0.24 / 0.48)。ただし早い裾(36 秒以内)は ON で 0 件で、仕様どおりの振る舞い(知っていればスリープを確実に撃つ)が実時間の観測窓の縁をわずかに動かしている可能性は残る ⇒ **要観察**。直すなら golden 側(観測窓を実時間でなく tick / 戦闘回数で測る = #69 の教訓)で、本チケットでは触らない(別チケット候補に挙げた)。

#### (7) 着手前の色の無い `--negative` 4 腕 + 装置の確認(影との 1 対ずつ)

| 腕 | 本番 | 影 | 経路① / ② |
|---|---|---|---|
| `verify_enemy_name_label --negative` | exit 0・58/0 | exit 0・58/0 | 一致 / 一致 |
| `verify_road_ambush --negative` | exit 0・97/0 | exit 0・97/0 | 一致 / 一致 |
| `verify_run_chronicle --negative` | exit 0・560/24 | exit 0・560/24 | 並びだけ違う / **多重集合は一致** |
| `verify_hold_person --negative` | exit 0・235/21 | exit 0・220/36 | 差は `(5a)` `(4b)` の 2 件だけ = 影に `.git` が無く `git show b1143ac:index.html` が読めない(「装置の故障」)。それを除くと各変異の赤は同一 |
| `verify_lore_check`(素・装置) | exit 0・26/26 | **exit 3**(変異 `bossbranch` の注入点 0 件) | — 影が #76 の前のバイトを配っている証拠 |

#### (8) 試遊サーバ 8765

走査の前に LISTEN を実測 = 2 系統: `cmd.exe`(pid 36320)→ `py -m http.server 8765`(18104)→ `python.exe`(**26728**)/ `cmd.exe`(34780)→ `py`(13504)→ `python.exe`(**9600**)。どちらも `ゲームを起動.vbs` と同じ `cmd /c cd /d "<リポ直下>" && (py -m http.server 8765 2>nul || python -m http.server 8765 2>nul)`。cmd → py → python の順に止めた(先に cmd を止めないと `||` の後段が立ち直る)。走査と再走をすべて終えてから、同じコマンドを `Invoke-CimMethod Win32_Process Create` でデタッチ起動(ReturnValue 0・cmd の pid 18844)。`Get-NetTCPConnection` = **`[::]:8765 LISTEN 37916`**(`python.exe -m http.server 8765`・親 38736)・`http://localhost:8765/title.html` = **200**。居残りの Chrome(`df_*`)/ node = **0**。`auto_debug_run`(素)は既定ポート 8765 のまま **exit 0**(952.3 秒)。

#### (9) ⚠ 崩れた主張(4 件)

20. **#75 の選別器 ④「関数の範囲 = 直前の `function` 宣言行から次の宣言行まで」** ⇒ 差分が最初の関数より前(`<style>` の CSS `.enemyCr`)にあると、行 1 からを 1 つの「関数」にして**雑音 5 本**を選ぶ(`js/town-map.js` / `title.html` などの字面)。最初の関数より前は数えないよう直した。
21. **「#76 用の `--negative` は `after75.tsv` の `--negative` 腕の中から選ぶ」** ⇒ 機械で選んだ 6 本のうち 4 本(`verify_enemy_name_label` / `verify_hold_person` / `verify_road_ambush` / `verify_run_chronicle`)は `after75.tsv` に `--negative` の腕が無い(= 着手前の色が無い ⇒ 影との対で見た)。`after75.tsv` の 5 腕のうち 3 本(`bolt_aim` / `bolt_bounce` / `cone_cast`)は #76 の差分に掛からない。
22. **「影のツリー = #76 の前の本番」** ⇒ `git` を読むドライバには成り立たない。影に `.git` が無いので `verify_hold_person` の `(5a)` `(4b)`(`git show b1143ac:index.html`)が「装置の故障」で赤。本番との差はこの 2 件だけで、変異の赤の集合は同一。
23. **既知の揺れの一覧はまた要約**: `driver_monsters_kobold` の `(e)`(孤立したコボルドが 8 試行とも攻撃しない = 観測 0 件)は一覧に無い(#74 の凍結・`after74`・`after75` は緑)。対では本番・影とも 6/6 緑。

#### ⇒ 判定

**160 腕(`after75.tsv` の 154 + 新規 2 + 選び直した `--negative` 4)で、#76 に帰属すると言える緑→赤は 0。** 緑→赤 3 本はすべて対で有意差なし(kobold p = 1.00・speech_engine p = 0.81・umberhulk p = 0.18 / 0.093 = 要観察)。赤→赤 14 は着手前と同数、赤→緑 1 は調査の道具。
指紋を比べられる 137 腕で経路① 133・経路② 131 が一致し、差 6 本は緑→赤 3・既知の入れ替わり 1・本文だけの差 2 で説明が付く。着手前の色の無い `--negative` 4 腕は影との対で判定行の多重集合まで同一(`hold_person` は `git` を読む 2 件を除く)。新規受入は素 26/26・`--negative` 12/12。

### 12-6. まとめ

**何を実装したか(プレイヤー向け)**

1. 戦いの始まりに、パーティの中で**習熟を持つ者だけ**が伝承判定(歴史 = 人型 / 宗教 = アンデッド / 魔法学 = 竜・構造体・元素・異形・ハイドラ)を振る。パネルは出さず自動。DC 10(ボス格 15)。
2. 見抜くと、ログに「📜 ○○は伝承を思い出した — 敵 (脅威度 X): 眠りの術が効かない / 炎が効かない …」、名前札に **脅威度(SRD 5.1 の CR そのまま・`CR1/4` など)** が付く。1 種類につき 1 冒険 1 回。習熟者が居なければ「📜 この敵の正体を知る者はいない」を 1 冒険 1 技能 1 行。
3. 知っている敵に対して、魔法使い・エルフ・主人公の AI が**眠らない敵へのスリープ**と**効かない属性**(ファラクサスへの炎など)を避け、効く呪文へ差し替える。知っている眠る敵が 2 体以上ならスリープを確実に撃つ。
4. 戦闘の途中で合流した敵(増援・ボスの合流・召喚の手下・戦車の乱入・暴君の手下・隊商護衛の波)の未判定の種類にも振る(仕様変更 (A))。
5. 撤退 **`?lore=0`**(何も知らない = 乱数の消費も今までと同じ)。

**コミット**

| 項目 | コミット | 中身 |
|---|---|---|
| 1 | `19cf889` | 着手前の実測(§12-0)・崩れ 12 件・名指し golden 11 本の色・`after75.tsv` 流用可 |
| 2 | `06fd7de` | 本番(`index.html` +228 / −7)+ changelog 1 行 |
| 4 | `077c4c9` | 勝率の記録の道具 `probe_s5s6_clear` に `lore` スイッチ |
| 3 | `4e738da` | 新規受入 `tools/verify_lore_check.js`(base 10471 / 変異 10472〜10482) |
| 4b | `986ce7d` | 仕様変更 (A) = 合流の口 4 つ + 受入 (1j) / 変異 `nomerge`(10483) |
| 5 | 本節を書いたコミット | 母集団の非退行(§12-5)+ §12-4〜§12-6 + 台帳 |

**受入の数字**

- `tools/verify_lore_check.js` 素 = **26/26 PASSED FAILED 0 PENDING 0**(項目4b で 3 回 + 項目5 の走査 1 回 + 影との対 1 回・約 3 秒)/ `--negative` = **負のコントロール 12 / 12 が検出成功・空振り 0・漏れ 0**(項目4b + 項目5・約 32 秒)。
- 名指し golden 11 本 = 項目2・項目4b・項目5 のどれでも着手前と同色同数(`driver_sce1_events` は 211/214・同じ型3 の 3 件のまま)。
- 使い捨て検証(項目2)= 33/33。
- 勝率の記録(§12-4・調整なし)= S5 ON 7/10・OFF 8/10(p = 1.00)/ S6 ON・OFF とも 0/10。仕様変更 (A) の後、S6 でファラクサスへ魔法学の判定が振られた = 3/3 走行(§12-4b (6) の 2 + §12-4 の追試 1)。
- 母集団の非退行 = **160 腕**で **#76 に帰属すると言える緑→赤 0**(§12-5。`driver_monsters_umberhulk (3)` は有意差なしだが要観察)。

**崩れた主張 = 通算 23 件**(一覧の場所: §12-0 (2) = 1〜12 / §12-2 (6) = 13〜14 / §12-3 (3) = 15〜18 / §12-4 所見 3 = 19 / §12-5 (9) = 20〜23)

| # | 主張 → 実測(一行) | 出典 |
|---|---|---|
| 1 | `canSneak` が「絞った配列を渡す」前例 → ゲートだけ。前例は無い | §12-0 (2) |
| 2 | `buildPerceptionParty()` は `{classKey, name}` → `isHero` / `skillBonus` 付き・主人公は `hp > 0 && !gameOver` のときだけ | §12-0 (2) |
| 3 | 吹き出しに判定行が乗る → `1d20(<b>n</b>)` と type hit/miss/crit/fumble のときだけ | §12-0 (2) |
| 4 | 狙点の評価は 2 か所 → 5 か所 | §12-0 (2) |
| 5 | (2c) 知らない時はファイアボルト → MM が先 = 装備を変えて測る | §12-0 (2) |
| 6 | (2d) 知らない時はコーン → threatScore 次第 = hp を小さくして測る | §12-0 (2) |
| 7 | (2e) の前提 → 成立。ただし倍率 2 は半減扱い・`const` は `window` に無い | §12-0 (2) |
| 8 | 雷の演出の `element` → `'arcane'` | §12-0 (2) |
| 9 | 行の小さな指し違い 4 か所 | §12-0 (2) |
| 10 | 道具のスイッチ表 6 本 → 4 本 | §12-0 (2) |
| 11 | 判定値 +4 → `?ability5e=0` では +3 | §12-0 (2) |
| 12 | 挿入位置は `:21662` の後・`:21668` の前 → 間の 3 本は乱数を引かない = どこでも同じ | §12-0 (2) |
| 13 | 札の直後で `loreDecorateLabel` を呼ぶ → 起動時の TDZ でページが死ぬ ⇒ `var LORE_READY` | §12-2 (6) |
| 14 | 主人公のスリープは「全員眠らない」なら外す → 空配列の `every` が真 ⇒ 1 体以上を条件に | §12-2 (6) |
| 15 | `rngparity` は 1 行目の先頭で引く → 両腕に効いて赤くならない ⇒ `LORE_ON` で条件付け | §12-3 (3) |
| 16 | (0c) は表の突き合わせで足りる → `familyreuse` が空振り ⇒ 実効の技能を走査 | §12-3 (3) |
| 17 | `alwaysknow` の担当は (1c)(3a) → 実測 12 節 | §12-3 (3) |
| 18 | SRD の前付けは BOM 付き CRLF → `goblin.md` だけ LF | §12-3 (3) |
| 19 | §2-2 罠 1「ファラクサス戦でも振る」→ §2-7(増援は次の戦いまで振らない)の下では S6 で 0/10 = ボスは合流で入る ⇒ 仕様変更 (A) | §12-4 所見 3 / §12-4b |
| 20 | 選別器 ④ の関数の範囲 → CSS(最初の関数より前)を行 1 からの範囲にして雑音 5 本 | §12-5 (9) |
| 21 | #76 用の `--negative` は `after75.tsv` の中から → 6 本中 4 本は外 | §12-5 (9) |
| 22 | 影のツリー = #76 の前の本番 → `git` を読むドライバには成り立たない(`.git` が無い) | §12-5 (9) |
| 23 | 既知の揺れの一覧 → `driver_monsters_kobold (e)` が載っていない | §12-5 (9) |

**残**

- **§9 の実機確認(ユーザー担当・そのまま)**。⚠ http 起動が必須。

**別チケット候補(本チケットでは直さない)**

- **僧侶を固定した S5 の腕** — S5 の伝承(宗教)は僧侶が居ないと起きず、自動抽選の ON 腕では 3/10。手応え(眠らない体数)を測るには編成を固定する手段が要る(§12-4 所見 1・2)。
- **S6 が Lv10・4 人でも 0/10** — #75 からの持ち越し。伝承と無関係な難易度(§12-4 所見 4)。
- **`umber_hulk` / `direBear` の Product Identity の確認** — SRD 5.1 に `umber-hulk.md` / `dire-bear.md` が無い(§12-0 (1) §2-10)。本チケットは脅威度を出さない側に置いただけ。
- **名前を伏せる案** — 見抜く前は敵の名前を伏せる(本チケットの範囲外)。
- (要観察)`driver_monsters_umberhulk (3) 再発火` の観測窓を実時間でなく tick / 戦闘回数で測る(§12-5 (6)。#69 以来の揺れで、#76 の後は 20 対で本番 1 / 影 5)。

**次の新規ドライバ base = 10484**(#76 が使ったのは 10470 = `probe_s5s6_clear`・10471〜10483 = `verify_lore_check`。10484 は `tools/*.js` `*.py` にヒット 0・LISTEN 0)。
