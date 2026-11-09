# #113 魔法の装身具を、キャラクターシートと出発画面で主人公が着脱する

- **起草**: 2026-11-10(起草窓) / **ステータス**: **承認済**(2026-11-10 ユーザー承認)
- **起草時 HEAD**: `3700c2d`(作業ツリー clean)
- **触るファイル**: `index.html` / `tavern.html` / `js/changelog.js` / `tools/verify_accessory_equip.js`(新規)
- **触らないつもりのファイル**: `js/player-sheet.js`(§2-9 のとおり供給口が汎用なので、変更なしで 5 行に増える)

---

## 1. 目的

ガントレットオブオーガパワーのような魔法の装身具を、キャラクターシートと酒場の出発画面(マッチング画面の引き出し)で付け外ししたい。

今は次の状態になっている。

- シートの装備区画は武器・防具・盾の 3 行だけで、装身具が無い(#89 が §11 で「今回はやらない」と除外した)。
- 出発画面の主人公カードには装身具の札があるが、畳まれた「装備を替える」の中にあり、押すたび次の品へ巡回するだけで、一覧が無い。
- ⚠⚠⚠ **主人公が先頭でないとき(魔法使い・僧侶・盗賊・エルフのほとんど)、酒場で着けた装身具は主人公本人ではなく先頭の NPC に付く**(§2-2 で実測)。このままシートに枠を足すと、表示と実際の効果が食い違う。

**ユーザー決定(2026-11-10)**:

- **着脱の対象は主人公だけ**。NPC の装身具は今どおり、拾ったときの自動装着のまま。⭐ 不採用 = 「どの NPC のカードからも一覧で着脱する + 1 品 1 人に揃える」(工事が大きい)。
- **潜行中のシートでも、戦闘外なら着脱できる**(武器・防具・盾と同じ規則)。外すと最大 HP が減り、着けても現在 HP は増やさない。⭐ 不採用 = 「酒場のシートだけ」。
- 「など」の範囲は、装身具 2 枠に入る全品(§2-3)。魔法の武器・防具・盾は #89 と武器防具屋の経路で既に着脱できるので手を入れない。

**起草窓の判断(承認時に確認してほしい点)**: ダイアログの説明では「仲間が着けている品は主人公の候補から外す」と書いたが、**「候補に出し、選んだら仲間から外して主人公へ移す」に変えた**。候補から外すだけだと、NPC に自動装着された品を主人公が二度と着けられなくなる(§2-7)。

---

## 2. 着手前の実測(2026-11-10・HEAD `3700c2d`)

⚠ 行番号は起草時点の値。**着手時に必ず測り直す**。

### 2-1. 装身具を読み書きする口の全数

| ファイル:行 | 何 | 今回 |
|---|---|---|
| `index.html:15003` | `currentAccessoryIndices` の初期化(`equipAccessory1/2` から) | 値はそのまま使う |
| `index.html:16678` | `getUnitAccessoryIndices(unit)` | 隣にヘルパーを足す |
| `index.html:19115` | `savePersistentAccessoryStock()`(`equipAccessory1/2` と `accessoryState` を書く) | **直す** |
| `index.html:21950` | `tryPromoteNewHead()`(頭の交代)。装身具に一切触らない | **直す** |
| `index.html:26462` | `findAccessoryRecipient()`(拾った品の装着先。頭が最優先) | **直す** |
| `index.html:39837` | `restoreAccessoryState()`(仲間の枠を職業キーで復元) | 直後に足す |
| `index.html:39883` | `applyAccessoryHpBonus()`(最大 HP の加算。潜行開始時に 1 回だけ) | 順序を守る |
| `index.html:44451-44454` | 勝利時に `equipAccessory1/2` を `currentAccessoryIndices` から書く | **直す** |
| `index.html:21767` / `:21788` | シートの供給口 `dfSheetSlots` / `dfSheetEquip` | **足す** |
| `tavern.html:7213` | `unlockedAccessoriesTV()`(所持 + 職業で絞る) | 流用 |
| `tavern.html:7226` | `tvAllyAccessoryIds(classKey)`(`accessoryState` を読むだけ) | 流用 |
| `tavern.html:7240` | `cycleAccessoryTV(slot, repaint)`(札の巡回) | **共通関数へ通す** |
| `tavern.html:8070` | `renderEquippedSummary` の装身具の札 | そのまま |
| `tavern.html:9704-9762` | 引き出しの「装備を替える」段(武器・盾・防具のみ) | **足す** |
| `tavern.html:10419` / `:10441` | シートの供給口 `dfSheetSlotsTV` / `dfSheetEquipTV` | **足す** |

`accessoryState` を書くのは今 `index.html` だけで、`tavern.html` は読むだけ。**本チケットで酒場が初めて書く**(§6 の移動のときだけ)。

### 2-2. ⚠⚠⚠ 主人公の装身具が先頭の NPC に付く(実ブラウザで実測)

`equipAccessory1 = gauntlets-ogre-power` / `equipAccessory2 = ring-protection` を種に `index.html` を開いて読んだ結果:

| ケース | heroIsHead | 先頭 (`currentAccessoryIndices`) | 主人公本人の枠 | 効く相手 |
|---|---|---|---|---|
| A 戦士の主人公 | true | ガントレット + リング | (先頭が本人) | 本人 ✅ |
| B 魔法使いの主人公 | **false** | ガントレット + リング(**戦士の NPC**) | `none, none` | **NPC** ❌ |
| C 魔法使い + `accessoryState.allies.mage=[ring-fire-resist]` | false | ガントレット + リング(ドワーフの NPC) | `ring-fire-resist`(酒場で選んでいない品) | **NPC** ❌ |
| D 盗賊 NPC 2 人 + 主人公の魔法使い + NPC の魔法使い(`allies.mage=[ring-fire-resist]` / `allies.rogue=[belt-giant-strength]`) | false | ガントレット + リング(盗賊の NPC) | `ring-fire-resist`(同職の NPC にも同じ品) | **NPC** ❌ |

原因: `currentAccessoryIndices` は「頭」の枠なのに、`tavern.html` はそれを「主人公の枠」として書いている。主人公の枠は `allies[].accessoryIndices` 側にあり、そこは `accessoryState.allies[職]` でしか埋まらない。

⇒ **主人公の枠を本人へ届ける修正を、本チケットの土台にする**(§4)。負のコントロール `seat` で再現する。

**測り直し方**: `partyComposition=["mage"]` + 上記の種で開き、`page.evaluate` で `currentAccessoryIndices` と `allies.find(a=>a.isHero).accessoryIndices` を読む(classic script 直下の `let` は文字列評価なら読める)。

### 2-3. 対象の品(実行時に数えた)

`accessories.length = 24`(`none` を含む)= **実質 23 品**。うち `relic` 付き 12(ガントレットを含む)、`classReq` 付きは `amulet-silver-tongue`(魔法使い専用)の 1 品だけ、`hpBonus` 付きは `amulet-health:8` / `relic-lizard-swamp:6` / `relic-lost-cargo:4` の 3 品。

### 2-4. ⚠⚠ 最大 HP は潜行開始時に 1 回だけ足す

`applyAccessoryHpBonus()`(`index.html:39883`)がレベル確定後に 1 回だけ加算する。途中で着脱すると増減の処理が要る。

⚠ `seatHeroAccessories`(§4)は `applyAccessoryHpBonus` より**前**に置く。後ろに置くと主人公の +HP が乗らず、先頭 NPC に乗る。

### 2-5. ⚠⚠ 頭の交代で装身具が移らない

`tryPromoteNewHead()`(`index.html:21950`)は `applyLeaderStats` で最大 HP を作り直すが、`currentAccessoryIndices` に触らない。つまり**新しい頭は死んだ頭の装身具をそのまま継ぎ、自分の枠は消える**。主人公が頭へ昇格すると本人の品が失われ、死んだ NPC の品が主人公の品として保存される。また最大 HP の作り直しで `hpBonus` が消える。

### 2-6. ⚠⚠ 帰還時に頭の枠を「主人公の枠」として保存する場所が 2 つある

- `savePersistentAccessoryStock()` の `snap.player`(`index.html:19118`)→ `equipAccessory1/2`(`:19146-19147`)
- 勝利時の直書き(`:44451-44454`)

片方だけ直すと、もう片方が帰還時に先頭 NPC の枠で上書きする。負のコントロール `winsave` で再現する。

### 2-7. ⚠⚠⚠ 拾った品が先頭 NPC へ流れ、主人公が着けられなくなる

`findAccessoryRecipient()` は `currentAccessoryIndices` を最優先で埋める。今は先頭 NPC に付いた品が `equipAccessory1/2` 経由で「主人公の品」に化けていたので問題が見えなかった。§4 で本人の枠を分けると、**後衛の主人公が拾った品はすべて先頭 NPC へ行く**ようになる。

そして NPC の着脱の口は作らない決定なので、「NPC が着けている品は候補から外す」にすると、その品は永久に主人公へ戻らない。さらに `accessoryState.allies` には今回の編成に居ない職のキーも残るので、居ない NPC が品を握り続ける。

⇒ ①拾った品は**主人公の空き枠を最優先**にする。②NPC が着けている品も候補に出し、**選んだら NPC から外して主人公へ移す**。

### 2-8. 重複の現状(実測)

- 主人公 + 同職 NPC: `allies.mage=[ring-fire-resist]` で主人公と NPC の魔法使いの**両方に同じ品が付く**(ケース D)。⇒ §4 で主人公を `allies[職]` の対象から外すと解消する。
- 同職の NPC 2 人: 1 品が 2 人に効く。⛔ **今回は直さない**(§11)。
- `snap.allies[classKey]` は後の人が上書きするので、同職 2 人の後ろが空だと品が外れる。⛔ 仲間どうしは今回直さない。ただし先頭 NPC の書き込みは「空で上書きしない」形にする(§4)。
- `accessoryIds` は多重集合。`shadow-amulet` は複数持てるので(`index.html:19127` のコメント)、移動の判定は個数で見る(`所持数 − NPC の着用数 ≥ 1` なら NPC から外さない)。同職重複で個数が水増しされている古いセーブでは外れないことがあるが、害は今の重複が続くだけなので許容する。

### 2-9. シート側は変更不要

`js/player-sheet.js:1232-1283` は `slots()` の配列を順に描き、`equip(kind, idx)` を呼ぶだけで、`kind` の種類を知らない。`data-equip-slot` / `data-stat="equip_<kind>"` / `data-equip-kind` も `kind` から作る。⇒ 供給口に `accessory1` / `accessory2` を足せば 5 行になる。「(他に所持なし)」の表示も既存のまま使える。

`dfSheetBodyEquip`(`index.html:21828`)は主人公が頭でないとき `ac: h.ac` / `dmgBonus: h.dmgBonus` をそのまま返すので、装身具の分がシートに出ない(頭のときは `currentPlayerAc()` なので出る)。⇒ §5 で足す。

### 2-10. ⚠⚠ 既存ドライバのアンカー

`tools/verify_sheet_equip.js` の変異 `tavernstale` は `tavern.html` の次の 1 行が**ちょうど 1 件**あることを要求し、崩れると exit 3 で止まる。

```
    if (pmDrawerIdx >= 0) pmRenderDrawer(pmDrawerIdx);
```

`dfSheetEquipTV` の描き直し 4 行をコピーすると 2 件になる。⇒ §6 ではヘルパーへ**移す**(文字列は 1 件のまま、字下げも 4 スペースのまま)。

同様に `index.html` 側の `CANEDIT_LINE` や `h.dmgBonus = (h.dmgBonus || 0) - (h._dmgEnhDelta || 0);...` などのアンカーも複製しない。

### 2-11. changelog の要否

`scripts/hooks/check_changelog.py:32` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` に当たるので**必須**。書ける要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | 撤退スイッチ / 主人公の枠のヘルパー / 読み込み・保存・頭の交代・拾得の修正 / シートの供給口に装身具 2 行 / 最大 HP の増減 |
| `tavern.html` | 撤退スイッチ / 主人公の装身具を変える共通関数 / シートの供給口に 2 行 / 引き出しに一覧 2 段 / 札の巡回を共通関数へ |
| `js/changelog.js` | `py tools/add_changelog.py` で 1 行 |
| `tools/verify_accessory_equip.js` | 受入ドライバ(新規) |

`tavern.html` と `index.html` の改行は CRLF。挿入の前後で `crlf==lf` を測ること。

進め方の目安: 項目1 = 着手前の測り直し + golden の基準 / 項目2 = 本体(STEP1〜3)/ 項目3 = 受入 + 変異 / 項目4 = 非退行 + §12 の書き戻し。

---

## 4. STEP1 — 主人公の枠を本人へ届ける(`index.html`)

**撤退スイッチの定数**(`:8056` の `SHEET_EQUIP_ON` の隣):

```js
/* ★#113 撤退 ?accequip=0。index は酒場からの遷移で開くのでクエリが届かない ⇒ sessionStorage へ写す (tavern と同じキー) */
const ACC_EQUIP_ON = (function () {
  try {
    if (/[?&]accequip=0(&|$)/.test(location.search)) sessionStorage.setItem("dragonfighters.accEquipOff", "1");
    return sessionStorage.getItem("dragonfighters.accEquipOff") !== "1";
  } catch (e) { return !/[?&]accequip=0(&|$)/.test(location.search); }
})();
```

**ヘルパー**(`getUnitAccessoryIndices` の直後):

```js
/* ★#113 主人公本人の装身具の枠。⭐ equipAccessory1/2 に対応するのは常にこれ */
function heroAccessoryUnit() {
  return (!ACC_EQUIP_ON || heroIsHead || !heroRef) ? "player" : heroRef;
}
function heroAccessoryIndices() { return getUnitAccessoryIndices(heroAccessoryUnit()); }
```

**読み込み**(`restoreAccessoryState` の IIFE の直後、`applyAccessoryHpBonus` より前。⚠ `restoreAccessoryState` は `accessoryStateJson` が無いと早期 return するので、別の IIFE にする):

```js
(function seatHeroAccessories() {
  if (!ACC_EQUIP_ON || heroIsHead || !heroRef) return;
  heroRef.accessoryIndices = currentAccessoryIndices.slice();      // 15003 で equipAccessory1/2 から作った値 = 主人公の品
  let ids = null;
  try { const s = JSON.parse(persistent.accessoryStateJson || "null"); ids = s && s.allies && s.allies[leaderClassKey]; } catch (e) {}
  currentAccessoryIndices = Array.isArray(ids)
    ? [accessoryIdxFromId(ids[0] || "none"), accessoryIdxFromId(ids[1] || "none")]
    : [0, 0];
  if (currentAccessoryIndices[0] !== 0 && currentAccessoryIndices[0] === currentAccessoryIndices[1]) currentAccessoryIndices[1] = 0;
})();
```

**保存**(`savePersistentAccessoryStock` の `snap` の組み立て):

```js
const snap = { player: heroAccessoryIndices().map(i => (accessories[i] || accessories[0]).id), allies: {} };
if (typeof allies !== "undefined") {
  for (const a of allies) {
    if (!a || !a.classKey) continue;
    if (ACC_EQUIP_ON && a.isHero) continue;              // ★#113 主人公は equipAccessory1/2 が権威
    snap.allies[a.classKey] = a.accessoryIndices.map(i => (accessories[i] || accessories[0]).id);
  }
}
if (ACC_EQUIP_ON && !heroIsHead) {                       // ★#113 先頭 NPC の枠は職業キーへ (空で上書きしない)
  const headIds = currentAccessoryIndices.map(i => (accessories[i] || accessories[0]).id);
  if (!snap.allies[leaderClassKey] || headIds.some(x => x !== "none")) snap.allies[leaderClassKey] = headIds;
}
```

⛔ 下の `stock` の計算は変えない(全員の装備 + `priorIds`)。

**勝利時の直書き**(`:44451-44454`): `currentAccessoryIndices[0]` / `[1]` を `heroAccessoryIndices()[0]` / `[1]` へ。

**頭の交代**(`tryPromoteNewHead` の `hp = Math.max(1, Math.min(maxHp, nh.hp || 1));` の直後):

```js
if (ACC_EQUIP_ON && Array.isArray(nh.accessoryIndices)) {   // ★#113 新しい頭は自分の品を持って頭になる
  currentAccessoryIndices = nh.accessoryIndices.slice();
  const pb = getAccessoryHpBonus("player");                  // applyLeaderStats が作り直した最大 HP へ足し直す
  if (pb > 0) { maxHp += pb; hp = Math.max(1, Math.min(maxHp, nh.hp || 1)); }
}
```

死んだ頭の品は枠から消えるが、`accessoryIds` は単調なので所持は失われない(酒場でまた着けられる)。

**拾得**(`findAccessoryRecipient` の `accDef` の直後):

```js
if (ACC_EQUIP_ON && !heroIsHead && heroRef &&
    accessoryAllowedFor(accDef, heroRef.classKey) && !hasAccessoryId(accId, heroRef)) {
  const hs = heroRef.accessoryIndices.findIndex(i => accessories[i] && accessories[i].id === "none");
  if (hs >= 0) return { kind: "ally", ally: heroRef, slot: hs };
}
```

⛔ `heroIsHead === true` の経路は 1 文字も挙動を変えない(§8 の恒等)。

---

## 5. STEP2 — ダンジョンのシートで着脱する(`index.html`)

`dfSheetSlots` の配列の末尾に、`ACC_EQUIP_ON` のときだけ `accessory1` / `accessory2` を足す。`dfSheetEquip` は `dfSheetCanEdit` の判定の**直後**に分岐する(⛔ 判定より前に置くと戦闘中に変えられてしまう)。

```js
const DF_ACC_SLOT = { accessory1: 0, accessory2: 1 };
function dfAccNote(a) {   // index の accessories[] には effect 文が無いので数値から短く作る
  if (!a || a.id === "none") return "";
  const p = [];
  if (a.dmgBonus) p.push("近接ダメージ +" + a.dmgBonus);
  if (a.acBonus) p.push("AC +" + a.acBonus);
  if (a.saveBonus) p.push("セーヴ +" + a.saveBonus);
  if (a.hpBonus) p.push("最大HP +" + a.hpBonus);
  if (a.skillBonus) p.push("技能に +");
  if (a.fireResist) p.push("炎を半減");
  if (a.freeAction) p.push("拘束無効");
  if (a.undeadDR) p.push("対アンデッド軽減");
  if (a.avoidAll || a.avoidArrow) p.push("攻撃を逸らす");
  return p.join(" ・ ");
}
/* NPC の着用 = 先頭 NPC (主人公が頭でないとき) + 主人公以外の仲間 */
function dfNpcWearers(idx) {
  const out = [];
  if (!heroIsHead) currentAccessoryIndices.forEach((v, s) => { if (v === idx) out.push({ unit: "player", slot: s }); });
  for (const a of (allies || [])) {
    if (!a || a.isHero || !Array.isArray(a.accessoryIndices)) continue;
    a.accessoryIndices.forEach((v, s) => { if (v === idx) out.push({ unit: a, slot: s }); });
  }
  return out;
}
function dfAccStockCount(id) { return (persistent.accessoryIds || []).filter(x => x === id).length; }
/* ★最大 HP の増減を持つ付け替えの唯一の口。⭐ 着けても現在 HP は増やさない (着脱で回復する抜け道を塞ぐ) */
function dfSetUnitAcc(unit, slot, idx) {
  const arr = getUnitAccessoryIndices(unit), before = getAccessoryHpBonus(unit);
  arr[slot] = idx;
  const d = getAccessoryHpBonus(unit) - before;
  if (!d) return;
  if (unit === "player") { maxHp += d; hp = Math.min(hp, maxHp); }
  else { unit.maxHp = (unit.maxHp || 0) + d; unit.hp = Math.min(unit.hp, unit.maxHp); }
}
```

- 候補: `accessories` の 1 番以降で、`dfAccStockCount(id) > 0`・主人公の職業で装備可(`accessoryAllowedFor`)・自分の両枠に入っていないもの。`current` が `none` でなければ先頭に `{ idx: 0, name: "外す", note: "" }`。
- NPC が着けている品は `note` の後ろに「(〇〇が着用中)」(`npcName || def.name`、頭なら `getLeaderName()`)。
- 付け替え: `idx !== 0` かつ `dfAccStockCount(id) - dfNpcWearers(idx).length < 1` なら、先頭の 1 件を `dfSetUnitAcc(w.unit, w.slot, 0)` で外してから、`dfSetUnitAcc(heroAccessoryUnit(), slot, idx)`。その後 `savePersistentAccessoryStock(); updateInfo();` と、開いていれば `DFSheet.render()`。
- 画面の候補と同じ検査を付け替え関数の中でもする(持っていない品・装備できない職は拒否)。

**シートの本体欄**(`dfSheetBodyEquip` の `src.unit` 分岐): `ACC_EQUIP_ON` のとき `ac: h.ac + getAccessoryAcBonus(h)` / `dmgBonus: h.dmgBonus + getAccessoryDmgBonus(h)`。

`window.__sheetEquip` に `heroAcc: () => heroAccessoryIndices().map(i => accessories[i].id)` を足す(検証用)。

---

## 6. STEP3 — 酒場のシートと出発画面(`tavern.html`)

`ACC_EQUIP_ON_TV` は §4 と同じ式・同じ sessionStorage キー。⚠ 酒場から出発する前にキーを書くので、`?accequip=0` を酒場に付ければ index まで届く。

**共通関数**(`cycleAccessoryTV` の直前)。⭐ 主人公の装身具を変える唯一の口:

```js
function tvAccStock() {
  try { const r = JSON.parse(localStorage.getItem("dragonfighters.accessoryIds") || "[]"); return Array.isArray(r) ? r : []; }
  catch (e) { return []; }
}
function tvNpcWearers(id) {
  const out = [];
  try {
    const s = JSON.parse(localStorage.getItem("dragonfighters.accessoryState") || "null");
    const al = (s && s.allies) || {};
    Object.keys(al).forEach((k) => (Array.isArray(al[k]) ? al[k] : []).forEach((v, i) => { if (v === id) out.push({ classKey: k, slot: i }); }));
  } catch (e) {}
  return out;
}
function setHeroAccessoryTV(slotIdx, id) {
  const ids = heroAccessoryIds();
  if (id !== "none") {
    if (id === ids[slotIdx === 0 ? 1 : 0]) return false;
    if (!unlockedAccessoriesTV().some(a => a.id === id)) return false;     // 所持 + 職業の検査
    const w = tvNpcWearers(id);
    if (tvAccStock().filter(x => x === id).length - w.length < 1 && w.length) {   // 余りが無いときだけ NPC から外す
      try {
        const s = JSON.parse(localStorage.getItem("dragonfighters.accessoryState") || "null");
        s.allies[w[0].classKey][w[0].slot] = "none";
        localStorage.setItem("dragonfighters.accessoryState", JSON.stringify(s));
      } catch (e) {}
    }
  }
  if (slotIdx === 0) selection.equipAccessory1 = id; else selection.equipAccessory2 = id;
  saveSelections();
  return true;
}
```

**札の巡回**: `cycleAccessoryTV` の `next` を決めた直後、`ACC_EQUIP_ON_TV` なら `setHeroAccessoryTV(slotIdx, next.id); (repaint || renderCharLoadout)(); return;`。⛔ 巡回の順序と `__equipTV.cycleAcc` の窓は変えない。

**シート**: `dfSheetSlotsTV` の末尾に 2 行足す。`idx` は `ACCESSORIES_TV` の添字、`note` は `def.effect`、候補と「外す」「(〇〇が着用中)」は §5 と同じ規則。`dfSheetEquipTV` は冒頭で分岐して `setHeroAccessoryTV` を呼ぶ。

⚠⚠ 既存の描き直し 4 行(`if (pmDrawerIdx >= 0)` から `DFSheet.render()` まで)はヘルパー `dfSheetRepaintAllTV()` へ**移して**両方から呼ぶ(§2-10)。

**引き出し**(`pmRenderDrawer` の `for (const k of KINDS)` の後、`drawer.appendChild(fold.sec)` の前)。`ACC_EQUIP_ON_TV && m.isHero` のときだけ、「装身具1」「装身具2」の `.equipGroup` を 2 つ足す。

- `id` は `pmDrawerAcc_0` / `pmDrawerAcc_1`。行は既存の `.equipItem` / `.eName` / `.eSpec` を使い、名前の色は `accColorClassTV`。
- 行 = 「外す」(装備中のときだけ)+ 候補。候補が無ければ「(他に所持なし)」。
- 押したら `setHeroAccessoryTV(s, id); pmRepaint();`(`pmRepaint` は保存・引き出し・カードを描き直す)。開いていればシートも描き直す。
- ⛔ 条件は `m.isHero`。`renderEquippedSummary` の `isHero`(職業で判定)を流用しない。主人公と同職の NPC のカードに一覧が出てしまう。
- ⭐ 段は既定で畳まれたままなので、開く前の引き出しの高さは変わらない。

---

## 7. 撤退スイッチ

- **`?accequip=0`** — シートは 3 行、引き出しに一覧なし、札は従来の巡回、index は §4 の前の配置・保存・頭の交代・拾得へ戻る。
- ⚠ 判定位置 = `index.html` と `tavern.html` の定数 1 本ずつ。sessionStorage(`dragonfighters.accEquipOff`)へ写して**ページ遷移をまたぐ**。タブを閉じると解除される。

---

## 8. 受入条件 — `tools/verify_accessory_equip.js`(新規・ポート **10780**、変異 **10781〜10790**)

実ページを開き、**シートと引き出しのボタンを実際に押して**、① localStorage ② ランタイム(`heroAccessoryIndices` / `currentAccessoryIndices` / `allies`)③ 画面の 3 つを突き合わせる。配信は起動時に凍結し、変異はメモリ上で差し替える(`verify_sheet_equip.js` の型)。

### §0 装置

- **(0a)** 主人公が頭(戦士)と頭でない(魔法使い)の両方が実際に起きている(`heroIsHead` を本番から読む)
- **(0b)** 種の 3 品以上が候補に出ている / シートの装備区画が 5 行 / 引き出しの一覧が DOM にある
- **(0c)** 全ページで pageerror 0

### §1 本人へ届く

- **(1a)** 魔法使い + ガントレット: `getAccessoryDmgBonus(heroRef) === 2`・先頭 NPC は 0
- **(1b)** 戦士: 頭に付く(従来どおり)
- **(1c)** `allies[先頭 NPC の職]` の品は先頭 NPC に付く
- **(1d)** 主人公と同職の NPC に主人公の品が重複しない
- **(1e)** `seat` の順序: `amulet-health` を着けた魔法使いの主人公の `maxHp` が +8、先頭 NPC は増えない

### §2 酒場で着脱

- **(2a)** シートのボタンで着ける → `equipAccessory1` / `selection` / シートの表示が同じ品
- **(2b)** 「外す」→ `none`
- **(2c)** 引き出しの一覧で着ける → `equipAccessory` / 引き出しの「装備中」/ カードが同じ品
- **(2d)** 引き出しを開いたままシートで変える → 引き出しが追随(逆向きも)
- **(2e)** 同じ品を 2 枠に入れられない
- **(2f)** 魔法使い専用の品は戦士の候補に出ない
- **(2g)** NPC のカードに一覧が出ない(主人公と同職の NPC のカードを含む)

### §3 ダンジョンで着脱

- **(3a)** 探索中に実タップで着ける → ランタイムの本人の枠・`equipAccessory`・シートが同じ品
- **(3b)** 主人公が頭でないとき、シートの AC / 攻撃欄に装身具の分が乗る
- **(3c)** 戦闘中は灰色・直接 `equip` は `{ok:false}` で何も書かない
- **(3d)** `amulet-health` を外す → `maxHp −8`・`hp` は `maxHp` 以下 / 着ける → `maxHp +8`・**`hp` は増えない**
- **(3e)** 着→外→着 を繰り返しても `hp` が開始時を超えない
- **(3f)** 撤退して酒場を開くと、シートで選んだ品が装備中(勝利経路は `:44451` の値で確かめる)

### §4 NPC からの移動

- **(4a)** NPC が着けている品が「(〇〇が着用中)」付きで候補に出る(酒場 / ダンジョン)
- **(4b)** 選ぶと主人公へ移り、`accessoryState` からその NPC の分が消える(酒場)/ その NPC の枠と最大 HP が戻る(ダンジョン)
- **(4c)** 今回の編成に居ない職のキーが握っている品も移せる
- **(4d)** `shadow-amulet` を 2 個持っていれば NPC から外さない

### §5 頭の交代と拾得

- **(5a)** 主人公が頭へ昇格 → 本人の品のまま・`hpBonus` が乗ったまま
- **(5b)** 後衛の主人公の空き枠へ、拾った品が最優先で入る
- **(5c)** 主人公の枠が埋まっていれば従来どおり他の人へ

### §6 恒等

- **(6a)** `heroIsHead=true` のとき、読み込み・保存の結果が `git show 3700c2d:index.html` と一致(⛔ 既定を HEAD にしない)
- **(6b)** 武器・防具・盾の付け替えで `equipAccessory1/2` と `accessoryState` が変わらない

### §7 撤退

- **(7a)** `?accequip=0`: シート 3 行・一覧なし・魔法使いの品は先頭 NPC へ(従来)
- **(7b)** 酒場の `?accequip=0` が遷移先の index に届く

### ⛔ 測らないこと

- `dfAccNote` の文面 / 一覧の行の高さや色 / 戦闘のバランス / 同職 NPC 2 人の重複(§11)

### 負のコントロール(`--negative` に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `seat` | `seatHeroAccessories` を no-op に(§2-2 の再現) | (1a) (1e) |
| `heroinallies` | 保存で `a.isHero` を飛ばさない | (1d) |
| `winsave` | `:44451` を `currentAccessoryIndices` に戻す(§2-6) | (3f) |
| `promote` | 頭の交代の追加を消す(§2-5) | (5a) |
| `recipient` | 拾得の追加を消す(§2-7) | (5b) |
| `healloop` | 着けたとき `hp` も増やす | (3d) (3e) |
| `combatacc` | 装身具の分岐を `dfSheetCanEdit` より前へ | (3c) |
| `nomove` | NPC から外さない | (4b) |
| `npcdrawer` | 引き出しの条件を職業判定にする | (2g) |
| `offleak` | sessionStorage へ写さない | (7b) |

⚠ 赤くなる節の集合は机上で決めず、`--mutate` で実走して確定する(`verify_sheet_equip.js` の `NEG_EXPECT` の作法)。

### 既存 golden の非退行

§2 の実測の時点で測った基準は §12-0 に記す。⚠ 走らせて違ったら、期待値を書き換える前に理由を突き止める。`verify_sheet_equip.js` が 5 行に増えて赤くなる場合は、製品ではなく「3 行」を前提にしている箇所かを先に確かめる。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須。

1. 魔法使いの主人公でガントレットを着け、ダンジョンで「あなた」の欄に「アクセ1」が出るか、先頭の仲間に出ないか
2. iPhone 縦持ちで、引き出しの「装備を替える」を開いて一覧が押しやすいか
3. シートの装備区画が 5 行に増えて、スクロールや見た目に無理がないか
4. 潜行中に体力の品を付け外ししたときの最大 HP の増減が自然か

---

## 10. changelog(⚠ `index.html` / `tavern.html` を触るので必須)

```
py tools/add_changelog.py "<b>魔法の装身具をシートと出発画面で着脱</b> — ガントレットなどをキャラクターシートと出発前の画面で付け外しできるように。後衛の主人公が着けた品も本人に効くようになった。"
```

---

## 11. やらないこと

- ⛔ NPC のカードからの装身具の着脱(ユーザー決定で不採用)
- ⛔ 同職 NPC 2 人に 1 品が両方効く重複、`snap.allies` の仲間どうしの上書き(§2-8)
- ⛔ `renderEquippedSummary` の札が主人公と同職の NPC のカードにも出る件(`isHero` が職業判定)
- ⛔ `ACCESSORIES_TV` と `accessories` の二重管理の解消、品の効果や強さの変更
- ⛔ 町・地方全景・タイトルのシートへの装備区画(#89 と同じく供給口を登録しない)
- ⛔ `js/player-sheet.js:1016` の射程表示の不具合(#89 §11 の別件)
- `実装依頼書/README.md` に足す行(承認時に起草窓が足す):

      | 113 | [2026-11-10_magic-item-equip.md](2026-11-10_magic-item-equip.md) | **承認済** | 0% | 魔法の装身具をシートと出発画面で主人公が着脱する。⚠⭐ 後衛の主人公の装身具が先頭 NPC に付いていた欠陥を土台で直す(`heroAccessoryIndices`)/ 保存 2 か所・頭の交代・拾得も連動 / 撤退 `?accequip=0` |

---

## 12. 実装結果

(実装窓が埋める)

### 12-0. 起草時の golden 基準(2026-11-10・HEAD `3700c2d`)

すべて素で実走した値(`--negative` は未実走)。⚠ 記録であって保証ではない。

| ドライバ | 結果 | 所要 |
|---|---|---|
| `tools/verify_sheet_equip.js` | 21/21 PENDING 0 | 164 秒 |
| `tools/verify_pm_drawer_fit.js` | 75/79 FAILED 0 **PENDING 4**(起草時点で既に PENDING 4) | 34 秒 |
| `tools/verify_prep_retire.js` | 30/30 PENDING 0 | 59 秒 |
| `tools/verify_player_sheet.js` | 73/73 PENDING 0 | 57 秒 |
| `tools/verify_clear_chests.js` | 21/21 | 10 秒 |
| `tools/verify_save_slots.js` | 30/30 | 5 秒 |
| `tools/driver_equip_compact_ios.js` | 31/31 | 16 秒 |
| `tools/verify_plaza_curio.js` | 28/28 | 34 秒 |

### 12-1. 項目1 — 着手前の実測(2026-11-10 06:58〜07:06・HEAD `9cb2c90`)

起草時 HEAD `3700c2d` との差は依頼書の追加だけで、`index.html` / `tavern.html` は同じ。測定は scratchpad のプローブとメモリ上の注入で行い、本番ファイルは触っていない。**§2 の前提は崩れておらず、§4〜§6 の設計はそのまま成立する。**

**§2-1 の行番号**: 下の 2 点を除き全行が一致。

| 依頼書の値 | 実物 | 影響 |
|---|---|---|
| `index.html:16678` `getUnitAccessoryIndices` | 宣言は **`:16677`**(`:16678` は本体の 1 行目) | なし |
| `js/player-sheet.js:1232-1283` | スロットの描画は **`:1232-1276`**(`:1280` 以降は別区画) | なし |

**§2-2 の 4 ケース**(実ブラウザ・pageerror 0): すべて再現。

| ケース | heroIsHead | 先頭 (`currentAccessoryIndices`) | 主人公本人の枠 | ダメージ修正 本人 / 先頭 |
|---|---|---|---|---|
| A 戦士 | true | ガントレット + リング(本人) | — | — / 2 |
| B 魔法使い | false | ガントレット + リング(戦士の NPC) | `none, none` | 0 / 2 |
| C 魔法使い + `allies.mage` | false | ガントレット + リング(戦士の NPC) | `ring-fire-resist` | 0 / 2 |
| D 盗賊 2 + 主人公の魔法使い + NPC の魔法使い | false | ガントレット + リング(盗賊の NPC) | `ring-fire-resist`(NPC の魔法使いにも同じ品) | 0 / 2 |

C の先頭は起草時がドワーフ、今回は戦士。`buildParty` の編成が毎回変わるためで、結論は同じ。

**§2-3 の品数**(実行時): 24(実質 23)/ `relic` 12 / `classReq` 1(`amulet-silver-tongue:mage`)/ `hpBonus` 3(`amulet-health:8` / `relic-lizard-swamp:6` / `relic-lost-cargo:4`)。index の全 id が `ACCESSORIES_TV` にある(欠け 0)。

**§2-4〜§2-11**: すべてコードで確認。

- §2-4: `applyAccessoryHpBonus` は `:39883`。§2-5: `tryPromoteNewHead` は装身具に触らない。§2-6: 保存は `:19118` → `:19146-19147` と `:44451-44454` の 2 か所。§2-7: `findAccessoryRecipient` は `:26467` で頭が最優先。§2-8: `:19127` のコメントと `stock` の多重集合を確認。
- §2-9: `js/player-sheet.js` の装備区画と `equipTap` に `kind` の分岐は無い。
- §2-10: `tavernstale` のアンカーは `tavern.html:10450` の 1 件。`CANEDIT_LINE` は `index.html:21757`、`h.dmgBonus = ...` は `:21820`。`verify_sheet_equip.js` の起動時検算で変異 10 本の注入点がすべて 1 箇所。
- §2-11: `check_changelog.py:32` で一致。

**§4〜§6 が依存する識別子**: すべて実在。⚠ `pmRepaint` だけは関数宣言でなく、`pmRenderDrawer` 内の局所 `const`(`tavern.html:9704`)。§6 の挿入位置(`:9762` の前)からは見える。新しく足す名前(`ACC_EQUIP_ON` / `seatHeroAccessories` / `setHeroAccessoryTV` / `pmDrawerAcc_` ほか)は `index.html` / `tavern.html` / `js/player-sheet.js` で 0 件。

**`seatHeroAccessories` の TDZ**: 問題なし。宣言は `leaderClassKey` `:8048` / `heroIsHead` `:8051` / `heroRef` `:8052` / `currentAccessoryIndices` `:15003`、代入は `:39731`(heroIsHead)/ `:39734`(leaderClassKey)/ `:39783`(heroRef)で、すべて置き場所(`:39861` の直後)より前。§4 の定数と IIFE を配信時にメモリ上で注入して実走した結果は次のとおり(pageerror 0)。

| 場合 | 結果 |
|---|---|
| 素(`amulet-health`・戦士の NPC が先頭・主人公の魔法使い) | 先頭 NPC の `maxHp` 68 / 主人公 30 |
| 注入(同じ種) | 先頭 NPC 60 / **主人公 38**(+8 が本人に乗る) |
| 注入(ケース D の種) | 主人公 = ガントレット + リング(ダメージ修正 2)/ 先頭の盗賊 = `belt-giant-strength` |
| 注入(ケース A の種・主人公が頭) | 素と同じ(恒等) |

**golden 8 本**(素で実走・07:05 終了 = 朝。闇市の開く 20:00〜24:59 の外)。数は §12-0 と全行一致。ログは `C:\Users\PC_User\.claude\dev-loop\r113\item1\`。

| ドライバ | 結果 | 所要 | 開始 |
|---|---|---|---|
| `tools/verify_sheet_equip.js` | 21/21 PENDING 0 | 165 秒 | 06:58:53 |
| `tools/verify_pm_drawer_fit.js` | 75/79 FAILED 0 PENDING 4 | 32 秒 | 07:01:38 |
| `tools/verify_prep_retire.js` | 30/30 PENDING 0 | 64 秒 | 07:02:10 |
| `tools/verify_player_sheet.js` | 73/73 PENDING 0 | 57 秒 | 07:03:14 |
| `tools/verify_clear_chests.js` | 21/21 | 9 秒 | 07:04:11 |
| `tools/verify_save_slots.js` | 30/30 | 5 秒 | 07:04:20 |
| `tools/driver_equip_compact_ios.js` | 31/31 | 16 秒 | 07:04:25 |
| `tools/verify_plaza_curio.js` | 28/28 | 35 秒 | 07:04:42 |

`verify_pm_drawer_fit.js` の PENDING 4 件は (3b-v1) / (3c-v1) / (2b-v4) / (2c-v4)。いずれもドライバ自身が測定不能・対象外と宣言しているもの。

**項目2 への注意**(設計は変えない。実装時に踏みやすい点)

1. §2-1 の表に無い口が 3 つある。いずれも変更は不要。
   - `index.html:19067-19100` の `shadow-amulet` の付与は、プレイヤーが相手を選ぶ `showCharChoice`。主人公の仲間枠を選べば §4 の保存で本人の品になる。
   - `index.html:26620` / `:44292` は `findAccessoryRecipient` の戻り値の受け手で、`kind: "ally"` の枝がある。§4 の `{ kind: "ally", ally: heroRef, slot }` はそのまま通る。
   - `tavern.html:5612` の `__equipTV.setHeroAcc` は検証用の窓で、`selection` へ直書きする。§6 の「唯一の口」の例外だが、プレイヤーの経路ではない。
2. `ACC_EQUIP_ON_TV` の位置は §6 に指定が無い。`cycleAccessoryTV`(`tavern.html:7240`)より前、たとえば `accColorClassTV`(`:7201`)の直前に置くと TDZ を考えなくて済む。
3. §2-7 の「編成に居ない職のキーが残る」は、`snap.allies` が保存のたびに作り直されるので**次の保存までの話**。(4c) は酒場で、前回の編成のキーが残っている状態を種にして測る。潜行中の `dfNpcWearers` は今の編成しか見ないので、§5 の判定に影響しない。
4. `heroAccessoryUnit` の `!heroRef` の枝は、ゲーム内では「主人公が頭でないのに `heroRef` が無い」形では踏まない。`onHeadDowned`(`:22006`)が主人公の頭の死をゲームオーバーにするので、主人公の品が NPC の品で上書きされる経路は無い。
5. `ACCESSORIES_TV` の `shadow-amulet` だけ `effect` が無い。§6 の `note` は空になるが、`rowEl` / 候補の描画は空の note を許す(`op.note` の判定あり)。
6. 3 行を前提にする assert は、8 本のソースの静的な確認では見つからなかった(`verify_sheet_equip.js` の `KINDS` は 3 種を名指しで読む)。§8 のとおり、確定は項目4 の実走で行う。

### 12-2. 項目2 — 本体(2026-11-10・HEAD `11e0dec` から)

§4〜§7 と §10 をコードどおりに実装した。**設計の変更は無い。** 改行は `index.html` CRLF 45348 / LF 45348、`tavern.html` CRLF 12386 / LF 12386(LF の混入なし)。

**実装の要点**

- `index.html`: `ACC_EQUIP_ON`(`SHEET_EQUIP_ON` の直後)/ `heroAccessoryUnit` と `heroAccessoryIndices` / 保存(`snap.player`・`a.isHero` を飛ばす・先頭 NPC を職業キーへ)/ 勝利時の直書き / 頭の交代 / 拾得 / `seatHeroAccessories`(`applyInitialLevels` の前 = `applyAccessoryHpBonus` より前)/ シートの 2 行 / `__sheetEquip.heroAcc`。
- `dfSheetEquip` の装身具の分岐は `if (!ce.ok) return ce;` の直後。
- `tavern.html`: `ACC_EQUIP_ON_TV`(`accColorClassTV` の直前)/ `setHeroAccessoryTV` / 札の巡回 / シートの 2 行 / 引き出しの `#pmDrawerAcc_0` `#pmDrawerAcc_1`(条件は `m.isHero`)。
- 描き直し 4 行は `dfSheetRepaintAllTV()` へ移した。`    if (pmDrawerIdx >= 0) pmRenderDrawer(pmDrawerIdx);` は 1 件のまま。
- `js/player-sheet.js` は無変更。

**依頼書に書かれていなかったので決めた点**(いずれも §5・§6 の規則の範囲内)

| 点 | 決めたこと | 理由 |
|---|---|---|
| 関数の分け方 | `dfAccCandidates` / `dfSheetAccSlots` / `dfSheetEquipAcc` / `dfAccWearerName`、酒場は `tvHeroAccCandidates` / `tvAccWearerNote` / `tvAccOptionNote` / `dfSheetAccSlotsTV` / `dfSheetEquipAccTV` | 候補の規則を、画面と付け替え関数で同じ関数にして食い違いを防ぐ |
| 酒場の「(〇〇が着用中)」 | `pmOrdered` の同職 NPC の名前、無ければ職名(`CURIO_CLASS_LABEL_TV`) | `accessoryState` には職業キーしか無く、§5 の `npcName` が引けない。マッチング前は名前が無い |
| 引き出しの「(他に所持なし)」 | 候補が 0 件なら、「外す」の行があっても出す | §6 の「候補が無ければ」の字句どおり |
| `dfSheetSlots` の 2 行 | 既存の `.map(...)` に `.concat(...)` で足す | 既存の 3 行の組み立てを触らない |

**検証**(スクリプトとログは `C:\Users\PC_User\.claude\dev-loop\r113\item2\`。リポジトリには入れていない)

| 検査 | 結果 |
|---|---|
| 煙検査 `smoke_item2.js`(実ブラウザ・390x844 タッチ) | **21/21**、pageerror 0 |
| `node tools/verify_sheet_equip.js`(素) | **21/21 PENDING 0**、163 秒、`[vet]` 変異 10 本の注入点がすべて原本でちょうど 1 箇所 |

煙検査の実測値(魔法使いの主人公 + 戦士の NPC が先頭)。

| 確かめたこと | 値 |
|---|---|
| ガントレット | `getAccessoryDmgBonus(heroRef)` 2 / 先頭 NPC 0 |
| 戦士の主人公 | `heroIsHead` true、頭に付く |
| `amulet-health` を種で着ける | 主人公 `maxHp` 30 → 38、先頭 NPC 60 のまま |
| ダンジョンのシート | 5 行、実タップで着脱、`equipAccessory1` とシートの表示が同じ品 |
| 潜行中に `amulet-health` を着ける / 外す | `maxHp` 30 → 38、`hp` は 30 のまま / `maxHp` 30 へ戻る |
| 戦闘中の直接 `equip`、未所持の品 | どちらも `{ok:false}` |
| 先頭 NPC が着けている品 | 「(N0が着用中)」付きで候補に出て、選ぶと主人公へ移る |
| 酒場のシートと引き出し | 5 行で着脱、一覧が DOM にあり押すと変わる、NPC 3 人(主人公と同職を含む)のカードに一覧なし |
| 酒場で NPC の品を移す | 「(戦士が着用中)」付きで候補に出て、`accessoryState.allies.warrior` から消える |
| `?accequip=0` | 両ページ 3 行、一覧なし、品は従来どおり先頭 NPC に付く、キーが sessionStorage に書かれる |

`verify_sheet_equip.js` は 5 行化で赤くならなかった(`KINDS` が 3 種を名指しで読むため)。

⚠ 煙検査の範囲外: 頭の交代(§8 (5a))と拾得(5b)(5c)、勝利経路の保存 (3f)、`git show 3700c2d:index.html` との恒等 (6a) は実走していない。項目3 の受入で測る。

### 12-3. 項目3 — 受入(2026-11-10・HEAD `f8e3cb1`)

`tools/verify_accessory_equip.js` を追加した(ポート 10780、変異 10781〜10790)。判定は **32 節**(§0 3 / §1 5 / §2 7 / §3 6 / §4 4 / §5 3 / §6 2 / §7 2)。**製品の欠陥は見つからず、`index.html` / `tavern.html` / `js/changelog.js` は触っていない。** ログは `C:\Users\PC_User\.claude\dev-loop\r113\item3\`。

| 検査 | 結果 |
|---|---|
| 素 3 回連続(`plain_1〜3.log`) | **32/32 FAILED 0 PENDING 0** を 3 回、各 145 秒、exit 0 |
| `--negative`(`negative.log`) | 素の基準 + 変異 **10/10 検出**、担当外の赤 0、1620 秒、exit 0 |

**変異ごとの赤くなった節**(`--mutate` の実走で決め、`--negative` の直列実行で同じ集合を再確認)

| 変異 | 赤くなった節 | §8 の表との差と理由 |
|---|---|---|
| `seat` | (1a) (1c) (1d) (1e) (3d) (4a) (4b) (4d) (5a) (5c) | 表は (1a) (1e)。主人公の品が先頭 NPC へ流れ、先頭 NPC の枠も職業キーから作られなくなる。追加の 8 節はどれも本人の枠が正しいことを前提に測っている |
| `heroinallies` | (1d) | 同じ |
| `winsave` | (3f) | 同じ |
| `promote` | (5a) | 同じ |
| `recipient` | (5b) | 同じ |
| `healloop` | (3d) (3e) (4b) | 表は (3d) (3e)。(4b) は NPC から移した `amulet-health` を着けたとき「主人公の `hp` は変わらない」も見ているため |
| `combatacc` | (3c) | 同じ |
| `nomove` | (4b) (4c) | 表は (4b)。(4c) の「編成に居ない職のキーから外す」も同じ行を通るため |
| `npcdrawer` | (2g) | 同じ |
| `offleak` | (7b) | 同じ |

**測り方で決めた点**

| 節 / 変異 | 決めたこと | 理由 |
|---|---|---|
| (2c) | 判定は localStorage・`selection`・引き出しの「装備中」・一覧の変化で取る。**カードは判定に入れていない** | カードの本文は武器・防具・盾の 3 行だけで、装身具の名前が出ない(実測 `cardHasName: false`)。§8 の「カード」は字句どおりには測れない。§1 の「カードの札」は引き出しの中の札なので、そちらで見た |
| (3f) の勝利経路 | `setItem` の書き込み列を記録し、すべて主人公の品であることを見る | `index.html:44577` の直後に `savePersistentAccessoryStock()` が同じキーを書き直すので、最終値では `winsave` が見えない。⚠ つまり `winsave` は、保存が例外で止まらない限りプレイヤーからは見えない |
| (5a) | 「`hpBonus` が乗ったまま」は、品なしで昇格した場合との差(+8)で測る | 下の別件のとおり、昇格後の `maxHp` は昇格前と同じ値にならない |
| (4c) | 編成は `selection.partyMembers` へ入れ、マッチング画面は出さずシートで測る | 判定は `accessoryState` の全キーを見るので編成の画面に依らない |
| 引き出しの行 | タッチでなく DOM の `click` | (2d) はシートの幕の下にある行を押すため。シートのボタンは実タップ |
| `combatacc` | `const ce = dfSheetCanEdit();` の行へ分岐を前置 | 行数不変で「判定より前」を作れる |
| `offleak` | 書き込み 2 行に加え、`return` の 2 行も「そのページのクエリでは撤退する」形へ変えた(計 4 か所) | 書き込みを消すだけだと酒場自身の撤退も止まり (7a) まで赤くなる。「遷移先へ届かない」欠陥だけを再現するため |

**受入で気づいた別件(#113 の範囲外・未修正)**

頭の交代で、昇格した主人公の最大 HP が Lv の分を失う。実測は魔法使いの主人公 `amulet-health` 付きで昇格前 38 → 昇格後 26(品なしは 30 → 18)。`applyLeaderStats` が `maxHp = def.hpMax` へ作り直すためで、この呼び出しは #113 の差分ではない(`3700c2d` での実走はしていない。コードの確認のみ)。品の +8 は正しく乗る。直すかどうかはユーザー判断。
