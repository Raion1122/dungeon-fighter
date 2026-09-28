# #76 伝承判定 — 戦いの始まりに敵の正体を思い出し、効く呪文を選ぶ

- **起草**: 2026-09-29(計画窓 = 起草窓) / **ステータス**: **承認済**(2026-09-29 ユーザー承認)
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
- 途中から加わる敵(増援・召喚)は、次の戦いの始まりまで判定しない(知らないまま扱う)。

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
