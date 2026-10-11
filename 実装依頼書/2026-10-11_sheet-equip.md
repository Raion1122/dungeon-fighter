# #89 キャラクターシートから主人公の装備を変える + 表記を「キャラクターシート」へ

- **起草**: 2026-10-11(計画窓 claude-67) / **ステータス**: **承認済**(2026-10-11 ユーザー承認)
- **触るファイル**: `js/player-sheet.js` / `index.html` / `tavern.html` /
  `tools/verify_sheet_equip.js`(新規)/ `tools/verify_player_sheet.js`(区画数の直書き 11→12 のみ)
- ⛔ **触らないファイル**: なし(起草時点で作業ツリーは clean・HEAD `e7b877d`、実装窓 claude-17 は #88 を完了済み)。
  それでも `git add .` は禁止。**ファイル単位 add** で、`git diff --cached <file>` を読んでから commit する。
- ⛔ `town.html` / `world.html` / `title.html` は**開かない**(シートの JS は共有なので、装備欄はこの 3 ページでは自然に出ない設計にする = §4)。

---

## 1. 目的

キャラクターシート(`js/player-sheet.js`、#29/#36)は**見るだけ**で、装備を変えるには酒場のマッチング画面の引き出しを開くしかない。
ダンジョンの途中では装備を変える手段が無い。これを **シートの中から主人公の武器・防具・盾を付け替えられる**ようにする。
#29 の依頼書が「装備変更は最終的にシートから可能にする(ダンジョン中も含む)」(#29 :15-17・:43)と予告していた #31 にあたる。

あわせて、画面に出ている表記「📜 シート」を **「📜 キャラクターシート」** にし、開いた紙の上端にも題名「キャラクターシート」を入れる
(今の紙には題名が 1 つも無い)。

**ユーザー決定(2026-10-11)**:

- **範囲 = 酒場 + ダンジョン**。装備の表が既にあるこの 2 ページだけでシートから変更できる。
  町・地方全景・タイトルでは装備欄を**出さない**。
  ⛔ 不採用: 「全画面」= 装備の表を `js/equipment.js` へ一本化する #30 相当が先に要り、1 枚に収まらない。
  ⛔ 不採用: 「酒場だけ」= ダンジョン中に変えられないなら引き出しと同じで、作る意味が薄い。
- **戦闘中は変更不可**。探索・休憩中だけ変えられる。戦闘中は装備欄を灰色にして理由を出す。**ゲームは止めない**。
  ⛔ 不採用: 「開いている間は一時停止」「いつでも・止めない」。
- **表記 = ボタン + 紙の題名**の両方を「キャラクターシート」へ。
- 対象は**主人公 1 人**(仲間の装備は今までどおりマッチング画面の引き出しで変える)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

基準 = HEAD `e7b877d`(2026-10-11)。行番号は全部 `sed -n` で確認済み。⚠ 着手時に必ずもう一度測ること。

### 2-1. 表記の現状 — 見える文字は 1 箇所だけ

| ファイル:行 | 何 |
|---|---|
| `js/player-sheet.js:678` | `btnEl.textContent = "📜 シート";` ← **プレイヤーに見える唯一の表記** |
| `js/player-sheet.js:677` | `aria-label` = `"キャラクターシートを開く"`(既にこの名前) |
| `js/player-sheet.js:689-720` `ensureOverlay()` | `#dfSheetPaper` / 閉じる `✕`(:706-707)/ `#dfSheetBody`。**題名の要素は無い** |
| `js/player-sheet.js:2` と 5 ページの `<script>` 行のコメント | `プレイヤーシート v1 (#29)` — コメントだけ(直さなくてよい) |

⭐ **ボタンの文字や題名を assert しているドライバは 0 本**。`verify_player_sheet` が見ているのは id(`dfSheetBtn` / `dfSheetOverlay` / `dfSheetBody` / `dfSheetPaper`)・区画 id・`data-*` だけ。
→ 文字を替えても既存 golden は壊れない。ただし**幅が変わる**(§2-10)。

### 2-2. 装備はどこに持たれているか(主人公は 3 通り)

| 状態 | 装備の正 | 保存先 |
|---|---|---|
| 主人公 = 隊列の頭(`heroIsHead`、`index.html:7510`)で**戦士** | `currentWeaponIndex` / `currentArmorIndex` / `currentShieldIndex`(:13779/:13800/:13805)、表は `weapons/armors/shields`(:13757-13796) | `dragonfighters.equipWeaponIdx` / `equipArmorIdx` / `equipShieldIdx` |
| 主人公 = 頭で**戦士以外** | `allyEquipSelection[leaderClassKey]`(:23295-23324)、表は `ALLY_EQUIP_POOLS`(:23277) | `dragonfighters.allyEquip`(`persistAllyEquipSelection` :24265) |
| 主人公 = **頭でない**(`heroRef`、中衛・後衛の職) | `allyEquipSelection[cls]` を `applyAllyEquipment(heroRef, cls)`(:23328-23366)で仲間オブジェクトへ**焼き込み** | `dragonfighters.allyEquip` |

- 頭の命中・AC・ダメージは**毎回読み出し時に計算**(`currentPlayerAtkBonus` :23654 / `currentPlayerAc` :23666 / ダメージダイス :24015・:31163)
  → 索引を書き換えれば次の手番から効く。**再計算の関数は存在しない**(作らなくてよい)。
- `applyLeaderStats()`(:20718-20746)は職の素の値へ戻して **HP まで満タンにする**ので、装備変更の後で呼んではいけない。
- 武器に応じたスプライトの差し替えは無い(`updateKnightSprite` :7587 は職と変種しか見ない)= 見た目の更新は要らない。
- 盾が要るスキルは無い(`shield-bash` :23086 / 探索のカウンター `startCounterCombo` :18221 とも盾を見ない)= 盾を外してもスキルは壊れない。

### 2-3. ⚠⚠⚠ 罠 A — `applyAllyEquipment` は 2 回呼ぶと強化値が二重に乗る

```js
// index.html:23328 applyAllyEquipment(ally, classKey, selOverride)
const dmgEnhDelta = (w.enhancement - baseW.enhancement);
...
ally.dmgBonus = (ally.dmgBonus || 0) + dmgEnhDelta;   // ← 足し算で焼く
ally.ac       = (ally.ac || 10)      + acEnhDelta;
```

呼び口は出発時の 1 回だけ(:36465)。主人公が頭でないときにシートから付け替えて、もう一度そのまま呼ぶと
**前の装備の +1 が残ったまま新しい +1 が足される**。
→ **付け替えの前に、前回の差分を引いてから**呼ぶ(差分は `ally._dmgEnhDelta` / `ally._acEnhDelta` に退避済み)。
⭐ §8 の変異 `stack` で再現する。

### 2-4. ⚠⚠⚠ 罠 B — 帰還時の「出発時より下げない」が、シートで下げた装備を元に戻し、拾った品を消す

```js
// index.html:40688-40702 (勝利) / :40838-40840 (撤退) も同じ形
const winSafeWeaponIdx = Math.max(currentWeaponIndex, startedWithWeaponIdx);
localStorage.setItem("dragonfighters.weaponIdx",      String(winSafeWeaponIdx));   // 所持の高水位
localStorage.setItem("dragonfighters.equipWeaponIdx", String(winSafeWeaponIdx));   // 装備の選択
```

今までは「ラン中に装備が下がる」のは事故だけだったので、これで守れていた。シートから**わざと**下げると次の 2 つが起きる。

1. **下げた装備が帰還時に出発時の品へ戻る**(選択 `equip*Idx` まで max を取っているため)。
2. **ラン中に拾った上位品が消える**。例: 出発時 1 → 宝箱で 3 に上がる(:24648 で `weaponIdx=3` が即書かれる)→ シートで 1 に戻す
   → 帰還時に `weaponIdx = max(1, 1) = 1` で**上書き**。拾った品が酒場に出なくなる。
   (防具だけは :40696 で既に `readStoredIdx` との max を取っているが、武器と盾は取っていない)

→ 決める: **選択 `equip*Idx` は `current*Index` をそのまま書く**(シートで変えたらそれが正)。
**高水位 `weaponIdx` / `armorIdx` / `shieldIdx` は `max(current, startedWith, 保存済みの値)`** にして、下がらないようにする。
⭐ 変異 `maxmerge`(1. の再現)と `hwmloss`(2. の再現)を §8 に入れる。
⚠ コメント :40686-40687 が言う「戦士の武器が下がると酒場の `min(allyWeapon, inventory.weaponIdx)` で仲間装備も clip される」は高水位の話なので、高水位を下げなければ守られたまま。

### 2-5. ⚠⚠ 罠 C — 「戦闘中か」は表示のフェーズだけでは判定できない

- `PHASE_LABELS`(:14964)は `explore` / `combat` / `rest` の 3 つ、`currentPhase`(:15063)、`setPhase()`(:15081)。
- `runEncounter` は勝ったとき `setPhase("rest")`(:22414)を**戦闘の後片付けの途中で**呼ぶ。この時点ではまだ `encounterActive === true`。
  `finally` で `encounterActive = false`(:22485)→ `setPhase("explore")`(:22500)。
- → 変更できる条件は **`!encounterActive && !encounterRunning`**(:21120-21121)にする。`currentPhase !== "combat"` だけだと、勝った直後の間に変更できてしまう。
- ⭐ 変異 `phaseonly` で再現する。
- ゲームはシートを開いても止まらない(`dialogPaused` :14786 はシートと無関係)。ユーザー決定どおり**止めない**。
  シートを開いたまま戦闘が始まることがあるので、**戦闘の開始と終了で装備欄を描き直す**(開いていれば)。

### 2-6. 両手武器と盾 — 酒場には規則があり、ダンジョンには無い

- 酒場: `dfEquip(charKey, kind, idx)`(`tavern.html:6776-6789`)が「両手武器を持つと盾は『なし』へ」「両手武器中は盾を付けられない」を守る。
- ダンジョン: 同じ判定関数 `dfIsTwoHanded` / `dfWeaponLocksShield`(`index.html:13887-13899`)は定義だけあって**呼ばれていない**
  (コメント「将来の in-game 装備変更/表示に備える」)。
- → ダンジョン側の付け替えでもこの規則を通す。⭐ 変異 `twohand` で再現する。

### 2-7. 選べる品(所持品)— ダンジョンは所持の一覧を読んでいない

- 酒場の所持判定は `dfIsOwnedTier(kind, tier, item)`(`tavern.html:5213`)。
  ① gated(マジックアイテム)は名前で `dragonfighters.ownedGatedNames` を見る ② それ以外は `dragonfighters.ownedEquip[slot]` に段が入っているか。
  `loadOwnedEquip()`(:5136-5167)は、`_hwm` より上へ高水位が上がった分(gated でないもの)を所持へ足す。
- ダンジョン(`index.html`)は **`ownedEquip` を 1 回も読んでいない**(`grep -n ownedEquip index.html` はコメントの 1 件 :24285 だけ)。
  知っているのは装備中の索引と高水位だけ。
- → ダンジョン側に「この主人公の職で選べる品」を返す関数を 1 本作る。**規則は酒場の `dfIsOwnedTier` + `loadOwnedEquip` の高水位の足し込みと同じ**にし、
  §8 で**酒場の `window.__equipTV` / `dfIsOwnedTier` と同じ localStorage の上で突き合わせる**(写経のずれを機械で止める)。
  ⭐ 変異 `ownedleak`(gated を段番号で所持扱いにする)で再現する。
- ダンジョン中に拾った品(宝箱・ドロップ)は高水位を即時に書くので、上の規則でそのまま選べるようになる。
  ⚠ ダンジョン側は `ownedEquip` を**書かない**(書くのは酒場の `loadOwnedEquip` の仕事のまま)。

### 2-8. シートの今の約束 — 開閉で localStorage を書かない

- `verify_player_sheet` の **(4d)**(:1902)と **(9b)**(:2237)が「シートの開閉で `dragonfighters.` のキーが 1 本も**増えない**」を見ている(キー名の集合の比較。値の変化は見ない)。
- 装備を付け替えると書くのは**既にあるキー**(`equip*Idx` / `allyEquip`)の値だけ = 2 つとも緑のまま、のはず。
  ⚠ ただし `allyEquip` が未作成のセーブでは**キーが増える**。開閉だけでは書かないので (4d)(9b) には当たらないが、§8 (3b) で「付け替えで増えてよいキー」を名指しで固定する。
- **(0s9)**(:1389)が区画数を `11` で 3 箇所直書き → 装備区画を足すと**必ず赤くなる**(退行ではない)。11→12 へ直す。⛔ 他の期待値は変えない。
  ⚠ 装備区画は提供関数があるページだけ `avail` になるので、(0s9) が数えるのが「定義の数」か「出ている数」かを項目1 で読んでから直すこと。
- 直近の記録: `verify_player_sheet` **73/73 PASSED / PENDING 0**(2026-09-16 `2026-09-16_lightning-bolt-aim.md:628`)。⚠ それ以降の記録が無い → 項目1 で測り直す。
- シートを読み込む他のドライバ: `tools/verify_darkvision.js`(:72・:416・:904-915、記録 25/25)。

### 2-9. シートの「武器」行は今も嘘を出している(この機会に直す)

`index.html:20245-20247` の体の提供関数:

```js
weaponName: (src.def && src.def.weaponName) || null,   // ← CLASS_DEFS の「職の初期武器名」
armorName:  (src.def && src.def.armorName)  || null,
atkBonus: st.atkBonus, dmgDice: st.dmgDice, dmgBonus: st.dmgBonus,   // ← 頭のときは装備の強化値が入っていない
```

装備欄から付け替えても「攻撃 & 呪文発動」区画の武器名は変わらない、という食い違いが**必ず見える**。
→ 頭のときは `getCurrentWeapon()/getCurrentArmor()` の名前と `currentPlayerAc()` / `currentPlayerAtkBonus()` / `currentPlayerDmgBonus()`、
頭でないときは `heroRef.weaponName` / `heroRef.armorName` を返すように直す。

### 2-10. 表記を長くすると幅が変わる

- ボタンは `#dfSheetBtn`(CSS `js/player-sheet.js:442-450`、15px・padding 左右 14px)。置き場所は `pickHost()`(:647-653)= `#partyPanel`(ダンジョン)/ 表示中の `#townHud`(町の compact)/ それ以外は `body` へ固定。
- `#townHud`(`town.html:292-312`)は `flex-wrap: wrap` なので、ボタンが長くなると**折り返して帯が 2 段になる**ことがある。
- 「シート」3 文字 → 「キャラクターシート」9 文字。⚠ 390px 幅で入るかは**本番で描いてみないと測れない**(#15 の教訓)→ §8 (5b) で測り、
  はみ出したら **K として止めてユーザーに聞く**(勝手に文字を縮めたり省略したりしない)。

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → `index.html` と `tavern.html` を触るので**鳴る**。
プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/player-sheet.js` | ボタン文字・紙の題名・装備区画 `dfSheetSecEquip`(提供関数がある時だけ出す)・`setEquipProvider()` を公開 |
| `index.html` | 装備の提供関数(選べる品・付け替え・変更できるか)・罠 A/B/C の手当て・両手武器の規則・体の提供関数の武器名/AC の修正・戦闘の開始/終了での描き直し |
| `tavern.html` | 装備の提供関数(`dfEquip` へ委ねる)・付け替え後の描き直し(引き出し・カード) |
| `tools/verify_sheet_equip.js` | 新規(受入 + `--negative`) |
| `tools/verify_player_sheet.js` | (0s9) の区画数 `11` → `12`(3 箇所)だけ |

⛔ `town.html` / `world.html` / `title.html` は開かない。装備の提供関数を登録しないので、装備区画は `avail=false` で自然に出ない(#36 の `avail/blank/inDom` の仕組みに乗せる)。

---

## 4. STEP1 — シート側(`js/player-sheet.js`)

1. **ボタン**: `:678` を `"📜 キャラクターシート"` へ。`aria-label`(:677)はそのまま。
2. **題名**: `ensureOverlay()` で `#dfSheetPaper` の先頭(閉じる `✕` の隣、`#dfSheetBody` の前)に `<h2 id="dfSheetTitle">キャラクターシート</h2>`。
   書体は紙の他の見出しに合わせる。`?sheet5e=0`(v1)でも出す。
3. **装備区画** `dfSheetSecEquip`(見出し「装備」)を `SECTION_DEFS_V2` の **「攻撃 & 呪文発動」の直後(B 段)** に足す。
   ⛔ 既存 11 区画の id と順序は変えない(:137 のコメントどおり、ドライバが依存している)。
   `?sheet5e=0` の v1(5 区画)には**足さない**(v1 は撤退用の旧体裁なので 1px も変えない = #36 の規律)。
4. **提供関数** `DFSheet.setEquipProvider(p)` を公開 API(:1205-1229)へ足す。`p` の形:

   ```js
   {
     // 変更できるか。{ ok: true } か { ok: false, reason: "戦闘中は装備を変えられない" }
     canEdit: function () { ... },
     // 3 つ(武器・防具・盾)。各 slot = { kind, label, current: {idx, name, note}, options: [{idx, name, note}], locked, lockReason }
     slots: function () { ... },
     // 付け替え。{ ok: true } か { ok: false, reason }。成功したらシートは自分で render() し直す
     equip: function (kind, idx) { ... }
   }
   ```

   - 提供関数が無いページでは区画を出さない(`avail=false`)。
   - 各スロットは「今の装備名 + 説明」を 1 行、その下に**選べる品のボタン列**(タップで付け替え)。
     `canEdit().ok === false` のときは列全体を灰色・押せなくし、`reason` を 1 行出す。
   - 盾が両手武器で塞がっているときは盾の列を灰色にして `lockReason` を出す。
   - タップは既存の `onTap()`(click + touchend の重複除け)を使う。
   - ⛔ **開閉では何も書かない**(§2-8 の約束)。書くのは `equip()` を呼んだときだけ。
5. 冒頭コメント :18-21 の「v1 は閲覧専用。装備欄は出さない」を、今回の姿(酒場とダンジョンだけ装備区画を出す・#89)へ直す。

## 5. STEP2 — ダンジョン側(`index.html`)

1. **選べる品** `dfSheetOwnedOptions(kind)`: 主人公の職のプール(戦士なら `weapons/armors/shields`、それ以外は `ALLY_EQUIP_POOLS[cls]`)から、
   §2-7 の規則(酒場の `dfIsOwnedTier` + 高水位の足し込みと同じ)で所持している段を返す。今の装備は除く(酒場の `renderEquipSlot` と同じ)。
2. **変更できるか**: `!encounterActive && !encounterRunning`(§2-5)。主人公が倒れているときも不可(理由「倒れている」)。
3. **付け替え** `dfSheetEquip(kind, idx)`:
   - 所持していない段・変更できない時は `{ok:false}` で何もしない(**画面だけでなく関数の中でも**守る)。
   - 両手武器の規則(§2-6)を `dfWeaponLocksShield` で通す。
   - 主人公の 3 通り(§2-2)で書き先を分ける:
     - 頭 + 戦士 → `current*Index` を書き、`equip*Idx` を保存。
     - 頭 + 戦士以外 → `allyEquipSelection[leaderClassKey]` を書き、`persistAllyEquipSelection()`。
     - 頭でない → `allyEquipSelection[cls]` を書き、**前回の差分を `heroRef` から引いてから** `applyAllyEquipment(heroRef, cls)`(罠 A)、`persistAllyEquipSelection()`。
   - ⚠ 主人公が戦闘中に頭へ昇格する(`tryPromoteNewHead` :20319)と 3 通りのどれに当たるかが変わる。判定は**付け替えのたびに** `heroIsHead` / `heroRef` / `leaderClassKey` から引き直す(覚えておかない)。
   - その後 `updateInfo()`(→ `renderPartyStatuses()`)と、開いていればシートの `render()`。
   - ⚠ 職ごとの選択なので、同じ職の NPC 仲間が居ても**その NPC の今の数値は変わらない**(出発時に焼いてある)。次の出発からは同じ選択になる = 酒場と同じ挙動。そのままでよい。
4. **帰還時の保存**(罠 B、:40688-40702 と :40838-40850): 選択 `equip*Idx` は `current*Index` をそのまま、高水位は `max(current, startedWith, 保存済み)`。
5. **戦闘の開始と終了**で、シートが開いていれば `render()`(装備欄の灰色を切り替える)。
6. **体の提供関数**(:20218-20256)の武器名・防具名・AC・命中・ダメージを §2-9 のとおり実際の装備から返す。
7. `DFSheet.setEquipProvider({...})` を体の提供関数の隣で登録。

## 6. STEP3 — 酒場側(`tavern.html`)

1. 提供関数を登録。主人公の職 = `getHeroClass()`(:9965)。
   - `canEdit` は常に `{ok:true}`。
   - `slots` は `CHAR_EQUIP[cls]` と `getEquipSelection(cls)`、所持は `dfIsOwnedTier`、盾の塞がりは `dfShieldLocked(cls)`。
   - `equip` は **`dfEquip(cls, kind, idx)` へ委ねる**(規則を写経しない)→ `saveSelections()` → 引き出しが開いていれば `pmRenderDrawer(pmDrawerIdx)` + `pmRefreshCards()`、準備画面が出ていれば `renderCharLoadout()`。
2. ⚠ `tavern.html` は CRLF。編集は `py` でバイト単位か Edit で(memory `feedback_crlf_python_patch`)。

---

## 7. 撤退スイッチ

- **`?sheetequip=0`** — 装備区画を出さない(提供関数を登録しない)・罠 B の保存の変更も従来の `Math.max` へ戻す・§2-9 の体の表示も従来へ戻す。
  ⛔ 表記(ボタン・題名)は戻さない(文字だけなので撤退の対象にしない)。
- ⚠ 判定位置 = `index.html` と `tavern.html` がそれぞれ自分の `location.search` を読む(ページ単位で完結・遷移をまたがない = `?heromark=0` と同じ作法)。

---

## 8. 受入条件 — `tools/verify_sheet_equip.js`(新規・素 port **10606**、変異 10607〜)

測り方: 本番の 2 ページを実際に開き、**シートの装備区画のボタンを押して**付け替え、
①localStorage ②ページのランタイム(`current*Index` / `allyEquipSelection` / `heroRef`)③シートの表示 の 3 つを突き合わせる。
主人公が頭の場合(戦士)と頭でない場合(後衛の職)の**両方**を母集団にする。

### §0 装置

- **(0a)** 2 ページとも `DFSheet.setEquipProvider` が呼ばれ、装備区画が DOM にあり、各スロットの選べる品が **1 つ以上**ある(セーブを仕込んで作る)。⭐ これが無いと全 assert が空振りする。
- **(0b)** 主人公が頭のケースと頭でないケースが**実際に両方起きた**(`heroIsHead` を本番から読む)。
- **(0c)** 町・地方全景・タイトルでは装備区画が DOM に無い(提供関数が無い)。

### §1 付け替えが効く

- **(1a)** ダンジョンの探索中に武器を付け替えると、localStorage の選択・ランタイムの索引・シートの表示名の 3 つが同じ品を指す。
- **(1b)** 頭のとき: `currentPlayerAc()` / `currentPlayerAtkBonus()` が新しい装備の強化値ぶん変わる(素の品 → +1 の品で +1)。
- **(1c)** 頭でないとき: 品 A → 品 B → 品 A と付け替え直すと、`heroRef.ac` / `heroRef.dmgBonus` が最初の値へ**ぴったり**戻る(罠 A)。
- **(1d)** 両手武器を持つと盾が「なし」になり、盾の列が灰色(ダンジョンと酒場の両方)。
- **(1e)** 酒場で付け替えると、マッチング画面の引き出しとカードが同じ品を出す。

### §2 戦闘中は変えられない

- **(2a)** 戦闘中(`encounterActive`)はボタンが押せず、理由の行が出る。`equip()` を直接呼んでも `{ok:false}` で何も書かない。
- **(2b)** 勝った直後の `rest` 表示で `encounterActive` がまだ真の間も変えられない(罠 C)。
- **(2c)** 戦闘が終わって探索に戻ると、開いたままのシートの装備欄が押せるに戻る。

### §3 所持と保存

- **(3a)** ダンジョンの選べる品の一覧が、同じ localStorage を読んだ**酒場の `dfIsOwnedTier`** の結果と一致する(gated を含むセーブで)。
- **(3b)** 付け替えで書かれるキーは `equip*Idx` か `allyEquip` だけ(名指し)。開閉だけでは 0 本(§2-8)。
- **(3c)** シートで装備を下げて帰還すると、次の酒場で下げた品が装備中(罠 B の 1)。
- **(3d)** ラン中に宝箱で上位品を得てからシートで下げて帰還しても、酒場でその上位品が選べる(罠 B の 2)。

### §4 体の表示

- **(4a)** 「攻撃 & 呪文発動」区画の武器名・防具名が、装備区画の今の装備名と一致する(§2-9)。

### §5 表記と幅

- **(5a)** ボタンの文字が「📜 キャラクターシート」、紙の題名が「キャラクターシート」(5 ページすべて)。
- **(5b)** 390x844 で、ボタンが置き場所(`#partyPanel` / `#townHud` / 画面)からはみ出さない。`#townHud` の段数が変わったら**記録して K として報告**(赤にはしないが黙って通さない)。

### §6 撤退

- **(6a)** `?sheetequip=0` で装備区画が無く、帰還時の保存が従来の `Math.max` に戻る。同じ (3c) の手順を当てると**赤になる**ことで確かめる(OFF で緑、ではなく)。

### ⛔ 測らないこと

- 装備区画の見た目の細部(行の高さ・色)。目で直す余地を残す。
- 戦闘のバランス(装備を替えた後の勝率)。

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `stack` | 罠 A: 前回の差分を引かずに `applyAllyEquipment` を呼ぶ | (1c) |
| `maxmerge` | 罠 B-1: 帰還時の `equip*Idx` を `Math.max` のまま | (3c) |
| `hwmloss` | 罠 B-2: 高水位を `max(current, startedWith)` だけで書く | (3d) |
| `phaseonly` | 罠 C: 変更できる条件を `currentPhase !== "combat"` だけに | (2b) |
| `combatopen` | 変更できる条件を常に真に | (2a) |
| `twohand` | ダンジョン側で両手武器の規則を通さない | (1d) |
| `ownedleak` | gated を段番号で所持扱いにする | (3a) |
| `tavernstale` | 酒場で付け替えた後に引き出しを描き直さない | (1e) |
| `oldname` | 体の提供関数を `CLASS_DEFS` の武器名のまま | (4a) |
| `label` | ボタンの文字を「📜 シート」へ戻す | (5a) |

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_player_sheet.js` → **73/73**(2026-09-16 の記録。(0s9) を 12 へ直した上で。⚠ 項目1 で現在値を測り直す)・`--negative` 111/111
- `node tools/verify_darkvision.js` → 25/25
- `node tools/verify_party_match_setup.js` → 36/36(引き出しの描き直し)
- `node tools/verify_town_map.js` → 85/85(`#townHud` の幅)
- `node tools/verify_title_screen.js` → 86/86
- 直近のチケットと同じく**母集団**で #89 帰属の緑→赤が 0 であること(post88 の母集団を流用)。

⚠ 基準値は 2026-10-11 時点の記録(多くは更に古い)。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認

- iPhone 縦で「📜 キャラクターシート」ボタンが読めて押せるか(ダンジョンの `#partyPanel`・町の帯)。
- 装備区画のボタンを指で押して付け替えられるか(click と touchend の二重発火で 2 回付け替わらないか)。
- ダンジョンで開いたまま戦闘に入ったとき、灰色になるのが分かるか。

---

## 10. changelog(`index.html` と `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>キャラクターシートから装備を変えられるように</b> — 酒場とダンジョンの探索中に、シートから主人公の武器・防具・盾を付け替えられる(戦闘中は不可)。"

---

## 11. やらないこと

- ⛔ **装備の表の一本化**(`js/equipment.js`、#30 相当)。町・地方全景・タイトルでの装備表示もしない。
- ⛔ **装飾品(アクセサリー 2 枠)と道具袋**の付け替え。今回は武器・防具・盾の 3 つだけ。
- ⛔ **仲間の装備**をシートから変えること(シートは主人公 1 人のもの)。
- ⛔ シートを開いている間の一時停止(ユーザー決定で不採用)。
- ⛔ `js/player-sheet.js:1016` の射程表示の不具合(`b.weaponRange === "ranged"` が実際の値 `melee/medium/long/bow` と合わず常に「近接」)— 別チケット。
- ⛔ コメント内の「プレイヤーシート」の書き換え(見えない文字なので触らない)。
- README の一覧に足す行(承認時に起草窓が足す):

    | 89 | [2026-10-11_sheet-equip.md](2026-10-11_sheet-equip.md) | **承認済** | 0% | キャラクターシートから主人公の武器・防具・盾を付け替え(酒場 + ダンジョンの探索中)+ 表記を「キャラクターシート」へ。⚠⚠⚠ `applyAllyEquipment` は 2 回呼ぶと強化値が二重 / 帰還時の `Math.max` が下げた装備を戻し拾った品を消す / 「戦闘中」は `encounterActive` で見る(勝った直後の rest は戦闘中)。撤退 `?sheetequip=0` |

---

## 12. 実装結果

### 12-0 基準取り(項目1・2026-10-11 worker)

- **HEAD** `76e2e6a`。`e7b877d..HEAD` は md 2 本だけ(本依頼書 + README)。本番 6 ファイル + `js/` の blob は e7b877d == HEAD == 作業ツリー。
- **§2 の行番号・コード片はすべて一致**(player-sheet.js / index.html / tavern.html の全参照を `sed -n` で確認)。
  `applyAllyEquipment(` の呼び口 = :36465 の 1 件 / `ownedEquip` in index.html = :24285 のコメント 1 件 / `dfIsTwoHanded`・`dfWeaponLocksShield` の呼び口 0 /
  `setPhase("combat")` は :22063 の 1 箇所 / 罠 C(:22414 rest → :22485 `encounterActive=false` → :22500)も記述どおり。

#### 崩れた主張(K)

| K | 依頼書の主張 | 実測 | 実装への影響 |
|---|---|---|---|
| K1 | §3/§2-8: `verify_player_sheet` は (0s9) の 11→12 だけ直す・他の期待値は変えない | (0s9) は**定義の数**を数える(`SECTION_IDS` / `__state().sections` 全件 / shown+hidden の和。スタブページ)⇒ 11→12 は正しい。**だが (2c)(:1640-1683)** がページごとの hidden 集合を厳密比較 + 伏せ計 `hiddenWant=20` で見ている。装備区画は town/world/title で hidden ⇒ 伏せ計 20→23 で必ず赤 | (2c) も言い直しが要る: `hiddenWantOf` に「装備の供給口が無いページ(index/tavern 以外)は `dfSheetSecEquip`」を規則で足し、`hiddenWant` 20→23(STALE 側 22→25)。`allShown===1` は不変。(8a) v1 は不変 |
| K2 | §2-6/§8 (1d)・変異 `twohand`: ダンジョンでも両手武器の規則を通す | index の 7 表(`weapons` + `ALLY_EQUIP_POOLS` 6 職)すべてで `dfWeaponLocksShield` が **false**(実測)。酒場で盾を塞ぐのは `DWARF_WEAPONS[1]`「戦斧」だけ(tavern.html:4361 の flavor)で、index の写し :23124 は flavor も `twoHanded` も持たない | (1d) と `twohand` にダンジョン側の母集団が無い。index :23124 の戦斧に `twoHanded: true`(か酒場と同じ flavor)を足して同期する必要あり(他の呼び口 0 = 戦闘へ波及しない)。種 = ドワーフ頭 + 戦斧 + 盾 |
| K3 | §2-4 罠 B: 帰還時の書き方を直せば「拾った品が消える」は防げる | (a) 敵ドロップ `tryEquipOnLeader`(:18401-18421)は `current*Index` を上げるだけで localStorage を書かない(帰還時の max だけが拾っていた)。(b) 宝箱(:24648-24710)は `current+1` を渡し高水位を素の `setItem` で書く ⇒ 装備を下げた状態で開けると保存済み高水位を**下げる**。例「1 → 宝箱で 3」は起きない(+1 ずつ) | 高水位 = `max(runMax, startedWith, 保存済み)`(`runMax` = ラン中の `current*Index` の最大)にし、宝箱の書き込みは `bumpStoredIdx` へ |
| K4 | §8 (3d): ラン中に宝箱で上位品を得る | #87 で道中の宝箱は既定で廃止(`ROAD_CHEST_ON` index.html:3592-3596)。残るのは森の鍵束と竜の巣の財宝だけ | (3d) は `?roadchest=0` を付けるか、ドロップ / 注入で作る |
| K5 | §2-10/§8 (5b): 見るのは置き場所からのはみ出しと `#townHud` の段数 | はみ出しは 0。**だが酒場の「✨ 依頼を引く」(`#btnDrawQuest`)をさらに覆う**。390x844: 押せる面積 53% → **24%**(残りは上端 9px の帯)、重なり 86x26 → 140x26。1280x900: 80% → 59%、中心点が `#btnDrawQuest` → `#dfSheetBtn` に変わる。title 390 の「はじめから」も下端 9px で 6% → 11% | **ユーザー判断待ち**(位置を動かす / 受け入れる)。文字は縮めない |
| K6 | §2-10: 長くすると `#townHud` が 2 段になることがある | 390 では**書き換え前から 2 段**(子 4・行 top 744/796・高さ 108)。書き換え後も 2 段・108 のまま | 段数の変化は無し |

軽微(詳細メモ): K7 戦士の選べる品は本表 `weapons/armors/shields` で作る(`WARRIOR_ALLY_*` は gated を持たない。他 5 職の index/tavern 表は名前・gated とも一致を実測)/
K8 戦闘終了の描き直しは `setPhase` でなく :22485 の直後へ(`setPhase("explore")` は gameOver / dungeonCleared では呼ばれない)。

#### 幅の実測(390x844・isMobile・`#dfSheetBtn` の textContent だけ実行時に書き換え)

| ページ | 置き場所 | ボタン幅 前→後 | 置き場所の余り(後) | 段数・重なり |
|---|---|---|---|---|
| index | `#partyPanel`(compact ドロワー 300px) | 281 → 281(列 flex で全幅。scrollW 277 = clientW 277) | 3px | 文字は収まる |
| tavern | body 固定 | 102 → 191.4(右端 120 → 209.4) | 180.6px | K5 |
| town | `#townHud` | 102 → 191.4 | 89.3px | 2 段 → 2 段・高さ 108 → 108 |
| world | body 固定 | 102 → 191.4 | 180.6px | 固定 UI との重なり 0 |
| title | body 固定 | 102 → 191.4 | 180.6px | `.slotBtn` 下端 9px |

5 ページとも pageerror 0・ボタン中心は覆われていない。

#### 既存 golden の現在値(HEAD `76e2e6a`)

`verify_player_sheet` 73/73(PENDING 0)・`--negative` 111/111 / `verify_darkvision` 25/25 / `verify_party_match_setup` 36/36 /
`verify_town_map` 85/85 / `verify_title_screen` 86/86 — **全部記録どおり**、exit 0。

#### 母集団の pre

**post88(212 腕・e7b877d で走査)をそのまま pre に流用可**(e7b877d..HEAD は md のみ)。clone は #89 の HEAD で作り直し、
影のツリーで戻すのは `js/player-sheet.js` / `index.html` / `tavern.html`。`verify_player_sheet` は RESTATED 扱い((0s9) + K1 の (2c))。
⚠ post88 に `verify_player_sheet --negative` の腕は無い(#89 で player-sheet.js を触るので個別に回すこと)。

### 12-1 項目2a — STEP1 (シート) + STEP2 (ダンジョン)(2026-10-11 worker)

- 範囲: `js/player-sheet.js` / `index.html` / `tools/verify_player_sheet.js`((0s9)(2c) の言い直し)。酒場 STEP3 と K5 は項目2b。
- 採用した K: **K1** (0s9) 11→12 + (2c) に「装備の供給口が無いページは `dfSheetSecEquip` を伏せる」を**供給口の有無**で足す。
  ⚠ 伏せ計は依頼の「20→23」ではなく **`20 + 供給口の無いページ数`** で導出 = 項目2a 時点は **24**(酒場もまだ無い)、項目2b で自動的に 23。
  代わりに「index は供給口あり / town・world・title は無し」を独立 assert で固定(自己参照の永久緑を防ぐ)。
  **K2** 戦斧に `twoHanded: true`。**K3** 帰還時は `dfReturnEquipValues()` 1 本(高水位 = max(current, runMax, 出発時, 保存済み) / 選択 = current そのまま)、
  ラン中の最高値 `dfRunMaxIdx` を持つ。宝箱 3 + マジックアイテム(戦士)2 の高水位の書き込み計 5 箇所を `bumpStoredIdx` へ。**K7** 戦士は本表。
  **K8** 描き直しは `encounterActive = true/false` の直後 + `runEncounter(...).finally` の `encounterRunning = false` の直後
  (⚠ :22485 の時点では encounterRunning がまだ真なので、押せるに戻るのは finally 側)。
- 依頼書からの逸脱: ① 宝箱だけでなくマジックアイテム(戦士)の高水位の書き込み 2 箇所も bump へ(同じ穴)。
  ② 撤退 `?sheetequip=0` は bump も従来の `setItem` へ戻す。③ 頭でない戦士(稀)は選べる段を `WARRIOR_ALLY_*` の長さで打ち切る(焼き込み先の表が短いため)。
- 検証: 自分用プローブ 32/32(390x844、付け替えの 3 経路一致・戦闘中の灰色と関数内ガード・rest 表示中も不可・頭でない主人公の A→B→A・両手武器・
  `?sheetequip=0`・町/地方/タイトル/酒場に区画なし)+ 実戦闘 2 回で灰色⇔押せるが即時に切り替わる(不一致サンプル 0)。
- golden(最終・K5 拡張の後): verify_player_sheet 73/73・--negative 111/111・verify_title_screen 86/86・darkvision 25/25・
  town_map 85/85・party_match_setup 36/36 = 6 本とも exit 0。既存ドライバの変異アンカー 217 件の出現回数は HEAD と同じ。
  ⚠ 置き場所の計算に切り捨て関数を書くと (0s13)(シートのコード部に Math.floor 禁止)が赤くなる = 書かない。
  (経緯) K5 拡張の前は **verify_title_screen が exit 3**(受入条件 3 の startNewGame :806 でタイムアウト)。真因 = ボタンの文字が長くなり、
  800x600 の title.html で fixed のボタン (x18-209, y542-582) が **スロット 1 の「はじめから」(x30-247, y555-598) の中心を覆う**
  (旧文字 x18-120 では中心は自分自身)。旧文字に戻すと 86/86 = 帰属は表記の変更だけ。
- **K5 拡張(ユーザー決定 2026-10-11)**: 表記は「📜 キャラクターシート」のまま。画面固定で置くページ(酒場・タイトル・地方全景)では
  ボタンを押せる物と重ならない場所へ移す。ダンジョン(#partyPanel)と町(#townHud・デスクトップの町の左下も)は従来のまま。
  - 実装 = `js/player-sheet.js` の `autoPlace()`(`rehome()` から。読み込み直後 / 800ms / 2500ms / load / resize)。
    四隅から縁へ 8px ずつ内側へずらす候補を「動かす量が小さい順」に試し、押せる物(button / a[href] / [onclick] / [role=button] /
    input / select / textarea / summary / label[for] / cursor:pointer / 固定 UI。画面の半分以上を占める床・幕は除く)との重なり面積 0 の最初の点。
    縦スクロールするページは文書に absolute(上の隅優先)。安全領域は env(safe-area-inset-*) を実測して余白 18px に足す。ページ側 HTML は無変更。
  - 実測(scratchpad `probe_k5.js`、重なり面積の最大 / はみ出し / ボタン中心が最前面 / pageerror):
    酒場 390x844 = 右下+32 (181,754)-(372,794)・800x600 = 右上+48 (591,66)-(782,106)・1280x800 = 右下+32 (1071,710)-(1262,750) /
    タイトル 390x844・800x600 = 文書の左上 (18,18)-(209,58) absolute(スクロール 0/25/50/75/100% の 5 点とも重なり 0)・1280x800 = 左下 (18,742)-(209,782) /
    地方全景 3 幅とも左下(390: (18,786)-(209,826))。9 点すべて重なり 0・はみ出し 0・中心が最前面・pageerror 0。

### 12-2 項目2b — STEP3 (酒場)(2026-10-11 worker)

- 範囲: `tavern.html`(供給口 + カードの描き直し + changelog の文面)/ `tools/verify_player_sheet.js`((7b) の言い直し + (2c) に酒場の供給口の固定)。
- 実装: `getHeroClass()` の直後に供給口 (`dfSheetSlotsTV` / `dfSheetEquipTV` / `dfSheetCanEditTV` = 常に ok)。職 = `getHeroClass`・表 = `CHAR_EQUIP`・
  所持 = `dfIsOwnedTier(kind, i, item)`・盾の塞がり = `dfShieldLocked`・付け替え = `dfEquip` へ委譲 → `saveSelections()` → 引き出し (`pmDrawerIdx >= 0`) なら
  `pmRenderDrawer` + カードの `pmRefreshCards` / 準備画面 (#prep が flex) なら `renderCharLoadout` → シートの render。持っていない段・装備中の段は関数の中で `{ok:false}`。
  slots の形と note の式はダンジョン (`dfSheetSlots` / `dfSheetItemNote`) と同じ。撤退 `?sheetequip=0` = 登録しない。検証の窓 `window.__sheetEquipTV`。
- 崩れ **K9**: `pmRefreshCards()`(= 各カードの refresh)は **技の行しか描き直していなかった**(`refresh: renderSkills`)。カードの装備 3 行は fill で 1 回描くだけ
  ⇒ §6 のとおり呼んでもカードは古い品のまま ((1e) が赤)。既存の引き出しからの付け替えも同じ欠陥。⇒ カード内に `renderEquipRows()` を切り出し、
  refresh = 装備の行 + 技の行(行の数・構造は不変 = カードの高さは変わらない)。
- **(7b) の言い直し(承認済・K1 と同じ扱い)**: 「B 段は index だけ」の固定表 → 「B 段 = index か、本番から読んだ `hasEquipProvider` が真のページ」で導出。
  ページ名で酒場を A/B/C にしない。代わりに (2c) へ「酒場は供給口あり」を独立 assert で足した。emptycol 変異は town/world/title の B 段で赤のまま
  (17 変異すべて赤 = 捕捉力は落ちていない)。(2c) の伏せ計は予告どおり 24 → **23**。
- changelog: 2a の行を新しい行を足さずに完成文面へ(「酒場とダンジョンの探索中に…」)。件数 4 のまま。
- 検証: 自分用プローブ 19/19(390x844。酒場で区画が出る / 開閉で書かない / 選べる品 = `dfIsOwnedTier`(gated 入りのセーブ)/ 関数内で未所持・装備中を拒否 /
  実タップで localStorage = `getEquipSelection` = シート / 引き出しを開いたまま付け替え → 引き出しの「装備中」とカードが同じ品 / 酒場の選択がダンジョンの
  シートに出る(戦士 = equip*Idx・魔法使い = allyEquip の同じ形)/ 両手武器で盾なし + 灰色 + 拒否 / `?sheetequip=0` で区画なし)。
  変異 2 本(引き出しを描き直さない / カードを描き直さない)で該当 assert が赤になるのを確認。酒場のボタンの重なり 3 幅とも 0(位置は 2a と同じ)。
- golden: verify_player_sheet 73/73・--negative 111/111・party_match_setup 36/36・darkvision 25/25・title_screen 86/86・town_map 85/85・
  class_line 18/18・quest_draw 18/18・corner_check 20/20・pm_drawer_fit 75/79 (PENDING 4 = 既知)・member_identity 28/28・party_promises 35/35・
  driver_party_view_reopen 35/35 = 全部 exit 0。

### 12-3 項目3 受入(2026-10-11 worker)

- 新規 `tools/verify_sheet_equip.js`。素 port **10606** / 変異 **10607〜10616**(10 本・MUTATIONS の並び順)。次の新規ドライバ base = **10617**。
  変異は index.html / tavern.html / js/player-sheet.js の配信スナップショットへ実行時に注入(本番ファイルは無変更・行数不変・原本でちょうど 1 件・他ドライバとアンカーの重なり 0 を起動時に検算)。
- **素 21/21 PASSED**(§0 5・§1 5・§2 3・§3 4・§4 1・§5 2・§6 1)。`--negative` **10/10**(必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤、NEG_MAYBE は全部空)。
  `--negative` を 2 回続けて走らせて 2 回とも exit 0・担当の赤も同じ(揺れなし)。所要: 素 約 165 秒 / `--negative` 約 32 分。
- 測り方の要点:
  - 付け替えはすべてシートの装備区画のボタンを**実タップ**(390x844 isMobile。座標から visualViewport.offsetLeft/Top を引く)。主人公 = 戦士(頭)と魔法使い(頭でない)の 2 腕で、(0b) が本番の `heroIsHead` で両方起きたことを固定。
  - (2a)(2b)(2c) は合成(`encounterActive` + `currentPhase` を立てて render)と、`?autoplay=4` の**実戦闘**を開いたままのシートで 100ms ごとに標本する 2 経路。
    上限 150 秒で、(0d) が「戦闘が始まり探索へ戻った」を assert(実測: 戦闘開始 22〜26 秒・rest 表示中の標本 4 前後)。
  - (3a) は gated を含む同じセーブ(高水位 5・所持名 フロストブランドだけ)で、戦士 / 盗賊の全段について ダンジョンの `__sheetEquip.isOwned` = 酒場の `__equipTV.isOwnedFor`、選べる品 = 所持 − 装備中 = シートの DOM。
    母集団: 戦士の gated 武器で所持 1・未所持 2。
  - (3c)(3d)(6a) の帰還は本物の `#retreatBtn` の click(→ `dfReturnEquipValues` → localStorage → world.html)の後、同じタブで tavern.html を開いて読む。
  - ⭐ **(3d) の作り方**: `?roadchest=0` は使わず、本番の宝箱の開封関数 `discoverChest({loot:{kind:"weapon"}, el:null})` を探索開始前に直接呼ぶ
    (current 1 → 2、`bumpStoredIdx` で高水位 `weaponIdx` = 2 が即時に書かれる)→ シートで 1 に下げる → 撤退 → 酒場で tier 2 が所持・選べる品(関数と DOM)に在る。
    盤面の箱へ歩かせる手順(K4)を避けて決定的にした。
  - (6a) は `(3c)` と**同じ判定関数 `judge3c`** を `?sheetequip=0` の帰還に当て、偽になる(equipWeaponIdx が Math.max で 2 へ戻る)ことで確かめる。OFF では装備区画が無いので、付け替えは `__sheetEquip.equip` を直接呼ぶ。
  - (5b) の押せる物の判定はドライバに独立に書いた(本番の autoPlace は呼ばない)。酒場・タイトル・地方全景 × 3 幅 = 9 点で重なり面積 0・はみ出し 0・中心が最前面(縦スクロールするページは 5 点)。
    ダンジョン(#partyPanel)・町 × 390x844 / 1280x800 = 4 点で置き場所と画面からはみ出さない・文字が切れない。座標は焼いていない。

#### 崩れた §8 の主張(K)

| K | §8 の主張 | 実測 | 扱い |
|---|---|---|---|
| K10 | 変異 `phaseonly` は (2b) だけ赤 | **(2a) も赤**。`runEncounter` は `encounterActive = true` → `dfSheetRefresh()` → `setPhase("combat")` の順(同期)。phase だけを見ると、描き直しの時点ではまだ explore なので、開いたままのシートが**実戦闘の間ずっと押せるまま**(実戦闘の標本 21/21 が押せる) | 欠陥そのものの見え方で決定的 ⇒ 担当 = (2a)(2b) |
| K11 | 変異 `combatopen` は (2a) だけ赤 | (2b) も赤(合成の rest 表示でも canEdit が真) | 担当 = (2a)(2b) |
| K12 | 変異 `oldname` は (4a) だけ赤 | **(1b) も赤**。`eqv = null` は §2-9 の AC(`ac: eqv ? eqv.ac : st.ac`)まで素の値へ戻すので、シートの AC 欄 ≠ `currentPlayerAc()` | 担当 = (1b)(4a) |

- 本番の欠陥: なし(素で 21/21・本番 3 ファイルは無変更)。
- 既存の名指し golden(本番を変えていないので確認だけ): verify_player_sheet 73/73・verify_party_match_setup 36/36・verify_title_screen 86/86 = 3 本とも exit 0。
