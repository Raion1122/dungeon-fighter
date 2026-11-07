# #111 コボルドの巣穴の隠し要素「卵の親」— 赤い卵を持ち帰った後、祭壇に若い赤竜が居る

- **起草**: 2026-11-07(起草窓) / **ステータス**: **承認済**(2026-11-07 ユーザー承認)
- **着手**: ✅ 素材そろい(2026-11-07 納品・受け取り検算合格 = §2-9 の表)。実装開始はユーザーの指示を待つ
- **基準 HEAD**: `62f500a`(#110 項目3・push 済)。並走窓なし(`git status` クリーン)
- **触るファイル**: `index.html`(本体)/ `js/changelog.js`(1 行)/ `tools/codex1_sprites.json`(台帳 1 行)/ `assets/redDragonWyrmling_anim.png`(新規)/
  `tools/verify_egg_parent.js`(新規)/ 言い直しが要った既存 golden(§8 の予告の範囲だけ)/ 本書 §12 / `実装依頼書/README.md` の #111 行
- ⛔ **触らないファイル**: `tavern.html` / `town.html` / `world.html` / `title.html` / `audio.js` / `js/world-map.js` / `js/df-mapdef.js` / `js/save-slots.js` / `js/road-events.js`
  (§2-1 のとおり、印は既に `localStorage` にあり、index だけで読める = 酒場もワールドマップも 1 バイトも変えずに済む)

---

## 1. 目的

#103 で出荷した「コボルドの巣穴」の祭壇には赤い卵があり、勝つと持ち帰って印 `dragonfighters.redEgg = "1"` が付く。
酒場の主人が初回だけ青ざめるが、**それ以外に意味が無い**(#103 §11 で「卵の効果は作らない」と決めた伏線のまま)。

本件で、その卵に初めて意味を持たせる。**卵を持ち帰った後でもう一度巣穴へ行くと、祭壇の間に卵の親 = 若い赤竜
(5e SRD の Red Dragon Wyrmling)が居て、族長たちと一緒に襲ってくる。** 倒すと隠し要素を倒した回として扱われ、
#108 のクリア時の宝箱で巣穴の伝承の品(ブーツオブエルヴンカインド)が出やすくなる。
本筋外の 6 か所に隠し要素を 1 つずつ足す流れ(会議 `dev-meetings/2026-11-04_hidden-and-loot.md` 候補③)の第 1 弾。

**ユーザー決定(2026-11-07・起草前のダイアログ)**:

- **出る条件 = 卵を持ち帰った後**(印 `dragonfighters.redEgg === "1"` のときだけ)。初回(Lv2 の初仕事)は今のまま。
  ⛔ 不採用: 「酒場の噂で」(既存の隠し要素の形だが、卵の伏線と無関係になる)/「毎回出る」(Lv2 の初仕事に CR4 は重く、隠しでもなくなる)
- **絵 = codex1 に専用のスプライトを依頼**。⛔ 不採用: ファラクサス(`pharaxus_anim.png`)を小さく流用(ラスボスと同じ絵が先に出てしまう)
- **必ず戦う**(族長たちと同じ 1 つの戦闘)。⛔ 不採用: 「卵を返せば去る」選択肢(選択肢の器が要り、仕事が大きくなる)

**筋書き(起草で決めた)**: 親は**祭壇の卵を温めている**(会議の言い方どおり)。卵を奪われた後、コボルドたちは次の卵を捧げ、
今度は親竜がそれを守っている。⇒ 勝利の一言「祭壇の上に、赤い卵が 1 つ残されていた。」は**そのままで筋が通る**
(§2-2 の罠 ① で `checkDungeonClear` を触れないことと両立させた)。

---

## 2. 着手前の実測(基準 HEAD `62f500a`・2026-11-07)

### 2-1. 卵の印は既に localStorage にある — 読む口は index だけで足りる

| ファイル:行 | 何 |
|---|---|
| `tavern.html:6226-6240` | `RED_EGG_KEY = "dragonfighters.redEgg"`・`markRedEgg()` が帰還で `"1"` を書く(2 回目以降も `"1"` のまま)。接頭辞 `dragonfighters.` = 記録スロットに載る |
| `tavern.html:6297` | `if (r.scenarioId === "kobold-warren") markRedEgg();` = 巣穴のクリアの帰還だけで立つ |
| `index.html:21424-21428` | 勝利の一言 `showDMMessage("祭壇の上に、赤い卵が 1 つ残されていた。…")`(`checkDungeonClear` の中) |
| `grep -n "redEgg\|RED_EGG" index.html` | **index は印を 1 度も読んでいない**(`__redEggNarrated` の検証シームだけ) |

⇒ index と tavern は同じ origin なので、**index が `localStorage.getItem("dragonfighters.redEgg") === "1"` を読むだけで条件が立つ**。
酒場からの受け渡し(`questFlags`)は使わない(理由は §2-2 ②)。

**巣穴は 2 回目も受けられる**: 卓の抽選 `boardFacts()`(`tavern.html:11572`)の母集団は `unlocked`(解放済み)で、クリア済みを外さない。巣穴は `side: true`・`locked: false`(`tavern.html:3789-3793`)。

### 2-2. ⚠⚠⚠ 設計上の罠 5 つ(全部 §8 の変異に翻訳する)

**① 既存の検証が「触らない約束の関数」の中身を握っている**(`grep -n "KEEP_FNS\|SOURCE_FNS\|FIRE_FNS" tools/*.js`):

| ドライバ | 握っている関数 |
|---|---|
| `verify_frost_hold.js:173-175` (6b)(3h) | `pickBossAction` `tryReflectEnemySpell` `tryCounterEnemySpell` `counterspellWanted` `resolveElementDefense` `hagMistPassage` **`checkDungeonClear` `defeatEnemy` `runEncounter`** `checkTrapTrigger` / **`hydraFireBreath` `applyFireBreathToAlly`** |
| `verify_witch_hut.js:350-351` (6b) | `initSwampNovice` … `inflictWoundsTouch` **`checkDungeonClear`** |

⇒ **この 5 関数(`defeatEnemy` / `checkDungeonClear` / `runEncounter` / `hydraFireBreath` / `applyFireBreathToAlly`)は 1 バイトも変えない。** 本件はこう避ける:

- 倒したときの一言 = `defeatEnemy` に分岐を足さず、**`ENEMY_TYPES` の `deathLine` の欄**で出す(`index.html:19178` が「ボスでない敵の `deathLine`」を字幕で出す既存の道。カエルム・ミミックと同じ)
- 勝利の一言 = **今のまま**(§1 の筋書き)
- 隠し要素の印 = `defeatEnemy` の中の `markHiddenFoeSlain(enemy)` は触らず、**配列 `HIDDEN_FOE_TYPES`(`index.html:15333`・関数の外)に 1 語足す**
- 火の息 = `hydraFireBreath` を**呼ぶだけ**(中身は変えない)。入口は `enemyAttackTurn`(握られていない)に新しい分岐(③)

**② 直起動では噂の門が全開になる** — `questFlagOn`(`index.html:12491-12496`)は `questFlagsPresent` が偽(酒場を通らない直起動 = ほぼ全部の検証ドライバ)なら**常に真**。
親竜を `SCENARIO_NODE_EXTRAS` の 4 要素目のフラグ(酒場の `questFlags`)で門にすると、**`verify_kobold_warren.js` を含む直起動のドライバ全部で祭壇の間に親竜が湧き**、(0b)(2b)(3a) 等が崩れる。
⇒ 門は **`localStorage` の印を index がページの読み込み時に 1 回読む**。直起動の新しいプロフィール = 印なし = 今と同じ顔ぶれ。
(`verify_kobold_warren.js:453-460` の `prep()` は毎ページ `localStorage.clear()` してから始まる = (4c) で立った印が後のページへ漏れない。項目1 で実走して確かめる)

**③ 冷気の息の入口の行は別のドライバの錨** — `verify_frost_hold.js:257` が `index.html` の
`      if (!def.isBoss && def.breathDice && def.breathElement === "cold") {` を 1 行置換で変異させる。
⇒ この行を `=== "cold" || === "fire"` に**広げない**。火の分岐は**その if ブロックの閉じ括弧の直後に別の if として足す**。

**④ 台帳まわりの 2 行も錨** — `driver_graph_p6.js:110`(変異 `noextraspawn`)が `nodeSpawnsFor` の
`      return base.concat(ex.spawns.filter(sp => questFlagOn(sp[3])));`(`index.html:12710`)を、
`verify_mage_hand.js:184` が `      const t = SCENARIO_NODE_EXTRAS[_builtinScenId];`(`index.html:12649`)を握る。
⇒ この 2 行は触らない。`SCENARIO_NODE_EXTRAS`(`index.html:12615`)に**キー `"kobold-warren"` を 1 つ足すだけ**。

**⑤ 竜の語りを引くと「最後の戦い」と言われる** — `detectEnemyFamily`(`index.html:16115-16136`)で `pharaxus` は `fam = "dragon"`、
その語りは「業火の気配。赤竜だ。**これが最後の戦い** — 怯むな。」(`index.html:16111`)。
⇒ 親竜は**家系の表に足さない**(`generic` に落ちる。祭壇の間はコボルド 4 体が多数 = 戦闘の語りは今どおり「コボルド」)。

### 2-3. 置き場所 — 祭壇の間 n1(`buildKoboldWarrenRun`・`index.html:43562-43597`)

座標は **global = 絵ローカル + (17, 6)**。マスク `n1big.blocked`(`index.html:6889-6912`)で読んだ:

| 何 | 絵ローカル | global | 出所 |
|---|---|---|---|
| 入場 | (2,7) | (19,13) | `start: { tx: 19, ty: 13 }` |
| 族長 | (17,7) | (34,13) | `boss: [34, 13, "koboldChief"]` |
| 手下 3 | (16,5) (16,9) (15,7) | (33,11) (33,15) (32,13) | `slots` |
| 祭壇と卵 | col 18-21 / row 4-11 | col 35-38 / row 10-17 | マスクは全部 `#` |
| **親竜(第 1 案)** | **(17,11)** | **(34,17)** | マスク row 11 = `.#######..........####.` の col 17 = `.`(col 18 から祭壇の `#`)= 祭壇の南の端の前 |
| 親竜(予備案) | (17,4) | (34,10) | row 4 = `.###....##........####.` の col 17 = `.` = 祭壇の北の端の前 |

- 入場からの距離 = (34,17)-(19,13) = **15.5 タイル**(≥ 13 = 入場の語りの最中に戦闘が始まらない。#103 と同じ物差し)
- 族長との距離 4 タイル・手下 (33,15) と 2.2 タイル ⇒ DETECTION_RANGE 12.5 の内 = **族長たちと同じ 1 つの戦闘**
- ⚠ 起草はマスクの文字で読んだだけ。**本番の `isTileWall` と `aStar`(入場 → 親竜)は項目1 で測る**。体の箱(`displaySize`・`bodyRatio*`)が決まると壁に食い込むことがある(CLAUDE.md「displaySize は当たり判定に直結」)→ 食い込んだら予備案へ

### 2-4. SRD の数値(出所 = ボールト `raw/srd/monsters/red-dragon-wyrmling.md`)

| SRD | → `ENEMY_TYPES.redDragonWyrmling` |
|---|---|
| Medium Dragon・CR 4 | `LORE_CR` に `redDragonWyrmling: 4` / `LORE_SKILL_OF` は `"arcana"`(`pharaxus` と同じ・`index.html:31030`) |
| AC 17 / HP 75 (10d8+30) | `ac: 17` / `hp: 75` |
| STR 19 (+4) / DEX 10 (+0) | `str: 4` / `dex: 0` |
| Bite +6・1d10+4 piercing **+ 1d6 fire** | `atkBonus: 6` / `dmgDice: "1d10"` / `dmgBonus: 4`。⛔ **1d6 の火の上乗せは作らない**(敵の噛みつきに属性の上乗せの欄が無い = §11) |
| Fire Breath (Recharge 5-6)・15ft cone・DEX DC13・7d6・半減 | `breathDice: "7d6"` / `breathDC: 13` / `breathBlast: 3` / `breathElement: "fire"`。⛔ 円錐にしない(冬狼と同じ 3x3・#107 §2-5) |
| Damage Immunities: fire | `ENEMY_TRAITS` に `redDragonWyrmling: { immune: ["fire"] }`(`pharaxus` の行の隣・`index.html:30980`) |
| XP 1100 | **`xp: 600`**(同じ CR4 のカエルム `caelum` が 600。ゲームの XP は SRD そのままではない: 冬狼 CR3 = 350・ミミック CR2 = 450) |

- `isBoss` は**付けない**(ボスは族長のまま)。⇒ 単頭ボスのブレスの分岐(`def.isBoss && !def.multiHead && def.breathDice`)には入らない。`breathChance` も付けない
- `speed` / 間合い / 拍子 / `displaySize` / `bodyRatio*` はスプライトの納品後に項目1 で決める(冬狼の 130 = Large。若い竜は Medium だが翼と尾があるので 100〜120 の帯を目安に、画面上の身長を測って決める)
- `deathLine`(倒したときの字幕): **「…卵を…返せ……」**(短い竜の言葉。字幕は `「…」 — 若い赤竜(…)` の形で出る)
- 名前 `name: "若い赤竜(レッド・ドラゴン・ワームリング)"`・`flavor: "祭壇の卵を温めていた赤い竜の子。小さくとも炎の息を吐く"`
- 鳴き声 `"enemy.cry.redDragonWyrmling": ["グルルル……!", "キシャアアッ!"]`(`index.html:13990` の `enemy.cry.kobold` の隣)

### 2-5. 火の息 — 冬狼の再充填の型 + `hydraFireBreath` を呼ぶ

冬狼の分岐(`index.html:38945-38962`)の写し。違いは **呼ぶ関数が `hydraFireBreath(idx)`**(火の演出・半減・文言・年代記は全部そのまま)と、印の名前だけ。

```js
      // ── ★[#111] ボスでない敵の火の息 (若い赤竜・Recharge 5-6) ──
      // ⭐ 冷気の分岐 (直前の if) の行は verify_frost_hold の錨 = 広げずに別の if で足す (依頼書 #111 §2-2 ③)。
      // ⭐ 息の本体は hydraFireBreath を呼ぶだけ (⛔ 中身を変えない = verify_frost_hold (3h))。d6 は親竜の手番の中だけで振る。
      if (!def.isBoss && def.breathDice && def.breathElement === "fire") {
        enemy.__wyrmTurn = (enemy.__wyrmTurn || 0) + 1;
        if (enemy.__fireBreathSpent) {
          const r = rollDiceDD(1, 6).total;
          const back = r >= 5;
          if (back) enemy.__fireBreathSpent = false;
          window.__fireBreathProbe.push({ site: "recharge", enemyIdx: idx, turn: enemy.__wyrmTurn, d6: r, ready: back });
        }
        if (!enemy.__fireBreathSpent) {
          enemy.__fireBreathSpent = true;
          window.__fireBreathProbe.push({ site: "breath", enemyIdx: idx, turn: enemy.__wyrmTurn });
          await hydraFireBreath(idx);
          return;                                  // このターンは息で消費 (噛まない)
        }
        window.__fireBreathProbe.push({ site: "bite", reason: "spent", enemyIdx: idx, turn: enemy.__wyrmTurn });
      }
```

- `window.__fireBreathProbe = window.__fireBreathProbe || [];` を `__coldBreathProbe` の宣言(`index.html:37091`)の隣に。⛔ ゲームの判定には使わない
- ⚠ `hydraFireBreath` は着弾の中心を `pickEnemyTarget` で取る = 3x3 が空振りする場合は無い(冬狼の「空なら噛む」は要らない)。
  ⚠ `hydraFireBreath` は `enemy.breathCooldown = 1` を立てるが、それを読むのはボスのブレスの分岐だけ = 親竜には効かない(項目2 で確かめる)
- 今 `breathElement === "fire"` を持つ敵は 0 体(`grep -n 'breathElement' index.html` = 冬狼の `"cold"` 1 か所だけ)= 既存の敵は 1 体もこの分岐を通らない

### 2-6. 隠し要素としての扱い(#108 と巻物)

| 口 | 今 | 本件 |
|---|---|---|
| `HIDDEN_FOE_TYPES`(`index.html:15333`) | `["goblinChariot", "shadowBeast", "stoneGolem", "caelum", "mimic"]` | 末尾に `"redDragonWyrmling"` ⇒ 倒した回は `clearChestRelicP()`(`index.html:44141`)が `CLEAR_CHEST_RELIC_P_HIDDEN` を返す = 巣穴の伝承の品が出やすい |
| `maybeGrantScrollDrop` の `hidden`(`index.html:15347-15348`) | 多頭・ゴーレム・残影の獣・カエルム・ミミック・霊 | **`enemy.type === "redDragonWyrmling"` を足す** = 他の隠し要素と同じ巻物の確定ドロップ(uncommon 30 / rare 70)。既存の敵の扱いは 1 つも変わらない |

### 2-7. 開幕の語り(出るときだけ 1 行足す)

`SCENARIO_NARRATIONS["kobold-warren"]`(`index.html:16347-16352`)は 4 行。読むのは `initScenarioNarration`(`index.html:45091`)。
親竜が出る回だけ、**3 行目(コボルドの説明)と 4 行目(「さあ、穴へ降りろ。」)の間に 1 行**:

> 「巣穴の奥から、コボルドのものではない低い唸りが響いた。卵を奪われた何かが、祭壇で君たちを待っている。」

- 足し方: オブジェクトの字面は変えず、宣言の直後に `if (EGG_PARENT_ON) SCENARIO_NARRATIONS["kobold-warren"].splice(3, 0, "…");`(`initScenarioNarration` は握られていないが、触らずに済む)
- ⚠ 語りの各行に音声 id が振られているかを項目1 で確かめる(振られていれば行の添字がずれる = 足す位置を末尾の前ではなく「後に別の `showDMMessage`」へ変える)

### 2-8. changelog の要否

`scripts/hooks/check_changelog.py:32` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **`index.html` を触るので鳴る**。
プレイヤー向けの要約は実在する(新しい敵が出る)。隠し要素なので**中身を言い切らない**文面にする(§10)。

### 2-9. 素材 1 本(承認後に起草窓が依頼文を起草する・#107 と同じ流れ)

| 素材 | 依頼文(予定) | 注意(#107 の冬狼 v1→v3 で踏んだもの・最初から全部入れる) |
|---|---|---|
| 若い赤竜 walk 6 + attack 6 | `codex1/requests/2026-11-07_red-dragon-wyrmling.md`(`dnd-monster-sprites` スキル) | 怖い感じに。**ファラクサス(成竜)と同じ種の、小さく若い個体**に見えること(⛔ 同じ絵の縮小にしない)。**walk と attack を 1 つの会話・同じ 1 頭で**(v2 で別個体化)・**体に黒い塊を入れない**(v1)・**本体の端の切れ**(霜の巨人 v1/v2)・赤い体 = クロマキーは緑(絵から緑を締め出す)。受入 = 冬狼 v3 §3 の物差し全部(`palette` の差 ≤ 10・`black_blob` ≤ 20・`body_edge_runs` < 12・縁の緑み 0・md5 12/12)。幅の上限は四つ足 + 翼で walk ≤ 1.90 / attack ≤ 2.20(ファラクサスの実測 1.54 を参考に添える) |

⚠ 取り込み(台帳 `tools/codex1_sprites.json` 1 行・`pack_codex1_sprites.py`・`check_sprite_doubling.py` / `check_alpha_bg_residue.py`・**本番の暗い土の床の上での目視**)は項目1 の仕事。

**納品(2026-11-07・起草窓の受け取り検算)**:

| 素材 | 使うもの | 受け取り側の実測 |
|---|---|---|
| 若い赤竜 | `codex1/assets/red-dragon-wyrmling/red-dragon-wyrmling-walk-attack-right-6-aligned/`(**v1**・本番 470 秒) | 依頼文の Python の検算をそのまま実行(codex 側は Python が無く JS へ移植 → **全値一致**): **256x180** x 12・接地線 spread 1・高さ中央値の差 −4.94%(上限 5% のすれすれ)・最大高 1.000・walk 幅 1.802・attack 幅 1.864・連結成分 各 1・切り口 0・縁の緑み 0・黒い塊 ≤ 3px・本体の端 ≤ 10px・**同じ個体の色の差 9.8 / 8.8**(上限 10 のすれすれ・目視では同じ 1 頭)・md5 12/12。目視 = QA シートの暗い土と明るい石の上で縁の膜なし・若い竜に見える(頭が大きめ・短い角・たたんだ翼)。codex の注意 = `check_pose_alignment` の attack sink ratio 0.865(推奨 0.88・exit 0) |

⚠ **キャンバスが 256x180 と小さい**(体の高さ H_w = 81px。冬狼は 768x720)。⇒ 項目1 で `pack_codex1_sprites.py` の 192px セルへ詰めたとき**拡大になる**かを確かめ、ぼやけるなら本番の `displaySize` で目視して判断する(ぼやけが目立てば codex1 へ大きなキャンバスでの v2 を頼む)。
⚠ 下見の生成絵(本番とは別の回)で、頭の後ろに角と翼が重なって「頭が 2 つ」に見えかけたコマがあった。本番の納品では目視で問題なし。`check_sprite_doubling.py` は項目1 で必ず通す。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | ① `ENEMY_TYPES.redDragonWyrmling`(§2-4)② `ENEMY_TRAITS` / `LORE_CR` / `LORE_SKILL_OF` 各 1 行 ③ `enemy.cry.redDragonWyrmling` 1 行 ④ 門 `EGG_PARENT_ON` と `SCENARIO_NODE_EXTRAS["kobold-warren"]`(§4)⑤ `HIDDEN_FOE_TYPES` に 1 語・`maybeGrantScrollDrop` の `hidden` に 1 項(§2-6)⑥ 火の息の分岐 + `__fireBreathProbe`(§2-5)⑦ 開幕の語り 1 行(§2-7)⑧ 検証シーム `__koboldWarrenTV.eggParent`(読み取り専用) |
| `assets/redDragonWyrmling_anim.png` | 新規(項目1 で取り込み) |
| `tools/codex1_sprites.json` | 1 行 |
| `js/changelog.js` | 1 行(`py tools/add_changelog.py`) |
| `tools/verify_egg_parent.js` | 新規(port base **10740**。既存の最大 = `verify_world_autowalk.js` の 1073x 台) |

⛔ `defeatEnemy` / `checkDungeonClear` / `runEncounter` / `hydraFireBreath` / `applyFireBreathToAlly` は開いても**編集しない**(§2-2 ①)。
⛔ `index.html:12649` / `:12710` / 冷気の分岐の入口の行は編集しない(§2-2 ③④)。

---

## 4. 本体 — 門と置き場所(`index.html`)

```js
    /* ★[#111] コボルドの巣穴の隠し要素「卵の親」。赤い卵を持ち帰った印 (tavern.html の markRedEgg) があるときだけ、
     *   祭壇の間 n1 に若い赤竜が居る。⭐ 門は localStorage の印をページの読み込みで 1 回読む
     *   (⛔ questFlagOn の 4 要素目にしない = 直起動で全開になり、巣穴の検証全部に竜が湧く。依頼書 #111 §2-2 ②)。
     *   撤退 ?eggparent=0 (このページだけで読む)。 */
    const EGG_PARENT_ON = (() => {
      try {
        if (new URLSearchParams(location.search).get("eggparent") === "0") return false;
        return localStorage.getItem("dragonfighters.redEgg") === "1";
      } catch (e) { return false; }
    })();
```

- 宣言は `SCENARIO_NODE_EXTRAS`(`index.html:12615`)より**前**。台帳には次の 1 キーを足す(⚠ 他のキーの字面・順序は動かさない):

```js
      /* ★[#111] 卵の親。印が無い回は空 = n1 の顔ぶれは #103 のまま。座標は依頼書 #111 §2-3 (絵ローカル (17,11))。 */
      "kobold-warren": EGG_PARENT_ON ? { n1: { spawns: [["redDragonWyrmling", 34, 17]] } } : {},
```

- 4 要素目は**置かない**(`questFlagOn(undefined)` = 真 = 台帳に載っていれば出る。門は上の三項だけ)
- `nodeExtrasFor` は `_builtinScenId`(`index.html:3901`)で引く。巣穴が `_builtinScenId === "kobold-warren"` で走ることを項目1 で確かめる

---

## 5. 本体 — 敵・息・隠し要素・語り

§2-4〜§2-7 のとおり。乱数の約束:
- ⭐ 親竜の d6・DEX セーヴは**親竜の手番の中だけ**で振る。印が無い回は親竜が居ない = **既存の全シナリオの乱数列は 1 ビットも動かない**(§8 §6 の恒等で縛る)
- ⚠ 印がある回の巣穴は、n1 のスポーンの並びの末尾に 1 体増える(`base.concat` の後ろ)= n1 の手下と族長の座標・乱数は印なしと同じ

---

## 6. 素材の取り込み(項目1)

codex1 の納品(§2-9)を受けて: `tools/codex1_sprites.json` へ 1 行 → `pack_codex1_sprites.py` → `assets/redDragonWyrmling_anim.png`(1152x960・192px・6 列 = 冬狼と同じ形式)→
`check_sprite_doubling.py` / `check_alpha_bg_residue.py` → **祭壇の間の暗い土の床の上で目視**(族長と並べて大きさの釣り合い・ファラクサスと別の個体に見えるか)。
`displaySize` と `bodyRatio*` は row2(移動中の行)の alpha bbox で測る(#107 §12-1 (4) と同じ手順)。

---

## 7. 撤退スイッチ

- **`index.html?eggparent=0`** — 印があっても親竜が居ない・開幕の語りは 4 行のまま(= #110 時点の巣穴と同じ)
- ⚠ 判定位置 = `EGG_PARENT_ON`(index の読み込み時に 1 回)。**ページ遷移はまたがない**(巣穴の潜行は index 1 枚で完結する。酒場から付ける口は作らない = `tavern.html` を触らないため)
- `HIDDEN_FOE_TYPES` / 巻物 / 息の分岐は撤退で消さない(親竜が居なければ誰も通らない)

---

## 8. 受入条件 — `tools/verify_egg_parent.js`(新規・port base **10740**)

方針: 直起動の index で **印を種まきした腕 / しない腕 / `?eggparent=0` の腕**を並べ、本番の `buildNode` → `ENEMY_SPAWNS` → `enemies` を数える。
息は本番の `enemyAttackTurn` を回して `__fireBreathProbe` を読み、d6 は呼び出しの間だけ差し替える(冬狼の (3b) と同じ作り)。
数値は**ボールトの SRD の md をドライバが読んで** `ENEMY_TYPES` と突き合わせる(⛔ ドライバに 75 / 17 を写経しない)。

### §0 装置
- **(0a)** `__koboldWarrenTV.eggParent`・`ENEMY_TYPES.redDragonWyrmling`・`window.__fireBreathProbe`・`HIDDEN_FOE_TYPES` が見える
- **(0b)** 印あり腕の n1 で、族長 1・コボルド 3・親竜 1 が**台帳(`nodeSpawnsFor("n1")`)と実体(`enemies`)の両方**に居る ⭐ これが無いと §1 の「0 体」が全部空振りで緑になる
- **(0c)** 全ページで pageerror 0 件
- **(0d)** SRD の md が読めて、AC / HP / CR / 息のダイス / DC / 火の完全耐性が 1 つも欠けずに取れる

### §1 門
- **(1a)** 印なし → n0・n1 とも親竜 0 体。n1 の顔ぶれと座標が #110 時点(`git show 62f500a:index.html` を `?__base=1` で配る)と同じ
- **(1b)** 印 `"1"` → n1 にちょうど 1 体・n0 に 0 体
- **(1c)** 印 `"0"` / `"true"` / 空文字 → 0 体(`=== "1"` だけで開く)
- **(1d)** 印 `"1"` + `?eggparent=0` → 0 体・開幕の語りは 4 行
- **(1e)** 他のシナリオ 2 本(廃坑 / 塔の母)は印 `"1"` でも顔ぶれが変わらない

### §2 置き場所
- **(2a)** 親竜のタイルが本番の `isTileWall` で床・祭壇の矩形(global col 35-38 / row 10-17)の外
- **(2b)** 本番の `aStar` で n1 の入場 → 親竜が通る・入場からの距離 ≥ 13 タイル
- **(2c)** 族長と親竜が同じ 1 つの戦闘に入る(本番の索敵で、族長が交戦したとき親竜も `encounter` に居る)

### §3 数値(2 経路: SRD の md / `ENEMY_TYPES`)
- **(3a)** AC・HP・命中・噛みつきのダイスと修正・息のダイスと DC・`breathElement === "fire"`・`isBoss` が偽・`breathChance` が無い
- **(3b)** `ENEMY_TRAITS` の火の完全耐性・`LORE_CR === 4`・`LORE_SKILL_OF === "arcana"`
- **(3c)** `detectEnemyFamily` が親竜だけの交戦で `"dragon"` を返さない(§2-2 ⑤)

### §4 火の息
- **(4a)** 最初の手番で息(probe `site: "breath"`)・同じ手番に噛まない
- **(4b)** 次の手番から d6 を 1 回ずつ振り、1〜4 なら噛む(`site: "bite"`)・5〜6 ならその手番に息(d6 を 4 → 5 の順に差し替えて確かめる)
- **(4c)** 息の中で `hydraFireBreath` が呼ばれ、パーティの HP が減る(DEX セーヴを 1 と 20 に差し替えて、成功は半減)
- **(4d)** 既存の息持ち(ファラクサス・ハイドラ・キマイラ・冬狼)は火の分岐の probe に 1 件も出ない

### §5 隠し要素
- **(5a)** 本番の `defeatEnemy` で親竜を倒す → `isHiddenFoe` が真・`clearChestRelicP() === CLEAR_CHEST_RELIC_P_HIDDEN`
- **(5b)** 同じく巻物の確定ドロップが `hidden` の重み(`pickScrollId` に渡る重みを記録して見る)
- **(5c)** 倒したときの字幕に `deathLine` が出る(`showDMMessage` を包んで記録)
- **(5d)** 印ありの巣穴の勝利で、勝利の一言(`__redEggNarrated`)は今と同じ文で出る

### §6 恒等
- **(6a)** ⭐ `defeatEnemy` / `checkDungeonClear` / `runEncounter` / `hydraFireBreath` / `applyFireBreathToAlly` のソースが `62f500a` と同じ(§2-2 ①)
- **(6b)** `index.html:12649` / `:12710` / 冷気の分岐の入口の 3 行が `62f500a` と同じ字面(§2-2 ③④)
- **(6c)** 印なしの巣穴 n1 と廃坑 1 ノードで、同じ種のスポーン後の `Math.random` の次の値が `62f500a` と同じ

### 負のコントロール(`--negative`。担当の節は**机上で書かず `--mutate` で 1 本ずつ実走して決める**・#107 の作法)

| 変異 | 注入する欠陥 | 赤くなるべき節(見込み) |
|---|---|---|
| `flaggate` | ⭐ 門を `questFlagOn` の 4 要素目に置き換える(§2-2 ② の罠そのもの) | (1a)(1c) |
| `anymark` | `=== "1"` を「印が null でない」へ | (1c) |
| `noretire` | `?eggparent=0` を読まない | (1d) |
| `n0spawn` | 台帳のキーを n0 へ | (1b)(2b) |
| `altartile` | 座標を祭壇の上 (36,13) へ | (2a) |
| `bossflag` | `isBoss: true` を付ける | (3a)(4a) |
| `alwaysbreath` | 再充填の d6 を見ずに毎手番吐く | (4b) |
| `coldwiden` | ⭐ 火の分岐を足さず冷気の入口の行を `"cold" \|\| "fire"` に広げる(§2-2 ③) | (6b)(4c) |
| `defeatedit` | ⭐ `defeatEnemy` に親竜の語りの分岐を 1 行足す(§2-2 ①) | (6a) |
| `notHidden` | `HIDDEN_FOE_TYPES` に足さない | (5a) |
| `dragonfam` | `detectEnemyFamily` で親竜を `"dragon"` へ(§2-2 ⑤) | (3c) |
| `nofireimmune` | `ENEMY_TRAITS` の行を消す | (3b) |

- 罠 E の自己検査を入れる(本ドライバのアンカーが他の `tools/*.js` に出ない・注入点がちょうど 1 か所)

### 既存 golden の非退行(項目1 で基準を測り、項目4 で走らせる)

`verify_kobold_warren.js`・`verify_frost_hold.js`・`verify_witch_hut.js`・`verify_clear_chests.js`・`driver_graph_p6.js`・`verify_mage_hand.js`・
`verify_counterspell.js` / `verify_run_chronicle.js` / `driver_cast_circle.js`(`hydraFireBreath` を握る 3 本)。
⚠ 起草窓は本数と基準値を**測っていない**(全部で数時間かかる)。**項目1 で `62f500a` の値を測って §12-1 に書く**。走らせて違ったら、期待値を書き換える前に理由を突き止める。
⭐ 予告: 印を種まきしない限り、上の全部が**変わらない**はず(§2-2 ②)。赤くなったらそれ自体が設計の誤り。

### ⑤ 強さ(⛔ assert しない・値を変えない・判断はユーザー)
- 印ありの巣穴 Lv2・Lv4 の 4 人・各 N=10: クリア率 / 全滅率 / 所要 / 残り HP / 倒れた人数 / **息の回数・巻き込んだ人数・息で倒れた回数**。比較 = 印なしの巣穴 Lv2 N=10 を同じ道具で
- ⚠ CR4 の息 7d6(平均 24・3x3)は Lv2 には重い見込み。弱めるかどうかは数字を見てユーザーが決める

### ⛔ 測らないこと
- 親竜の HP / 攻撃の値の良し悪し(⑤ はユーザー判断)・息の演出の細部・`deathLine` と開幕の 1 行の言い回し

---

## 9. 実機 / 実感

- 卵を持ち帰ってからもう一度巣穴へ行き、開幕の 1 行で「何かが居る」と伝わるか・祭壇の前の若い竜がファラクサスと別の個体に見えるか(大きさ・色)・
  息が「竜の息」に見えるか・倒したときの「…卵を…返せ……」が読めるか・宝箱でブーツが出やすくなったと感じるか(回数を数えなくてよい)
- ⚠ ローカルは http 起動(file:// では音が出ない)

---

## 10. changelog(⚠ `index.html` を触るので必須)

```bash
py tools/add_changelog.py "<b>コボルドの巣穴に新しい秘密</b> — 祭壇の赤い卵を持ち帰った者がもう一度巣穴を訪れると、何かが待っている。"
```

---

## 10b. 項目の割り方(dev-loop 4 項目)

| 項目 | 中身 | 終わりの印 |
|---|---|---|
| 1 着手前の実測 + 素材の取り込み | §2 を測り直す(行番号・`isTileWall` / `aStar` で置き場所・語りの音声 id・`_builtinScenId`)・golden の基準を `62f500a` で測る・シートの取り込みと目視・`displaySize` | §12-1 に実測表・台帳 1 行・シート 1 枚 |
| 2 本体 | §4〜§7 を全部・changelog 1 行 | 煙検査(印ありの巣穴を 1 本通す)+ 予告どおりの非退行 |
| 3 受入 | `tools/verify_egg_parent.js`・⑤ 強さ | 素 N/N × 3・`--negative` 全変異 OK |
| 4 非退行 + 記録 | §8 の golden を全部・§12・README の行・`CLAUDE.md` の「本筋外の行き先」の行に隠し要素の型の 1 文(門は localStorage・握られた関数を避ける) | 全部緑 |

---

## 11. やらないこと

- ⛔ 卵を返す / 見逃す選択肢(ユーザー決定)・卵の売買・卵から竜が孵る後日談・酒場の主人の新しい一言(`tavern.html` を触らない)
- ⛔ 噛みつきの 1d6 の火の上乗せ(敵の属性上乗せの器は今無い)・円錐の息・飛行
- ⛔ `hydraFireBreath` / `applyFireBreathToAlly` の共通化・引数化(#107 §2-5 と同じ)/ 冷気の分岐との統合
- ⛔ 親竜を `isBoss` にする・ボス曲や恐怖のオーラ(`fearDC`)を付ける
- ⛔ 巣穴の推奨 Lv・初回の顔ぶれ・族長の強さの見直し(#103 の ⑤ は別件)
- ⛔ 残りの本筋外 5 か所(塔の母・積み荷・墓所・魔女・霜の巨人)の隠し要素 → 1 か所 = 1 チケットで続ける
- ⛔ 砦の守護者の復活・依頼札の達成印・#108 の確率の調整(別の候補)
- ⛔ 触らない: §冒頭の「触らないファイル」・`defeatEnemy` / `checkDungeonClear` / `runEncounter` / `hydraFireBreath` / `applyFireBreathToAlly`
- `実装依頼書/README.md` の #111 行は**承認時に起草窓が足す**(並走窓なし):

```
| 111 | [2026-11-07_kobold-egg-parent.md](2026-11-07_kobold-egg-parent.md) | **承認済** | 0% | コボルドの巣穴の隠し要素「卵の親」= 赤い卵の印 (localStorage) があるときだけ祭壇の間に若い赤竜 (SRD Red Dragon Wyrmling・火の息 Recharge 5-6)。⚠⚠ 門は questFlagOn にしない (直起動で全開)・defeatEnemy / checkDungeonClear / runEncounter / hydraFireBreath は verify_frost_hold が握る = 触らない |
```

---

## 12. 記録欄

### 12-0. 起草で会議から変えた点(承認時に確認)

- 会議の「卵を温めている親」を、**卵を持ち帰った後の 2 回目以降**に出す形へ(ユーザー決定)。勝利の一言を変えずに済む筋書き(親が次の卵を守っている)にした
- 倒したときの語りは `defeatEnemy` に足さず `deathLine` の欄で(§2-2 ①)。酒場の主人の新しい一言は入れない

### 12-1〜12-4. 実装窓の記録(項目1〜4)

(実装窓が埋める)
