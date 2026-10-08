# #86 名前札の職業を文字で — 「(戦士)」の段を名前の上に

- **起草**: 2026-10-05(計画窓) / **ステータス**: **完了(push 待ち)**(2026-10-09・本番 `ee203cd`・受入 `1eaf8c4` `verify_class_line`・母集団 211 腕で #86 帰属の緑→赤 0 = §12-3 / §12-4。K1 = ユーザー決定 (b) 頭が NPC のときだけ `#warriorLabel` にも段)
- **着手**: ✅ 着手可(2026-10-06)— #85 完了 `345d0f7`。受入の port base = **10574**(#85 §12)。⚠ #85 で `index.html` が動いたので §2 の行番号は関数名で引き直すこと。
- **触るファイル**: `tavern.html`(札の描き口 1 関数 + CSS 1 規則 + 撤退スイッチ + changelog)/ `index.html`(`createAllyDom` の名前札 + CSS 1 規則 + 撤退スイッチ)/ `tools/verify_hold_person.js`(既存 golden の言い直し 2 節)/ `tools/verify_class_line.js`(新規)
- ⛔ **触らないファイル(着手まで)**: `index.html` / `tavern.html` — **実装窓が #85 を実装中**。#85 は `index.html` の描画と読み込みを直し、changelog のため `tavern.html` の `changelogList` も触る。
  ⇒ 本チケットは **#85 の完了コミットを待ってから着手**する(同じファイルの並走は、ファイル単位 add でも相手のコミットへ hunk ごと入る)。

---

## 1. 目的

酒場の卓に座っている客の頭上札は、いま「🗡️ ニカ」のように**職業をアイコンで**出している。
アイコンでは職業がわかりにくい(⛏️=ドワーフ、✨=僧侶、🗝️=盗賊 は特に)。
ダンジョン内の仲間の札は**名前だけ**で、職業がまったく出ていない。

**ユーザー決定(2026-10-05)**:

- 職業を**文字で**出す。形は **2 段** = 上の段に小さく「(戦士)」、下の段に「🤝 ニカ」(🤝 は約束済みのときだけ)。
  - 不採用: 1 行の「(戦士) ニカ」— 札の幅が最大で約 2 倍になり、隣の席の札と重なる(§2-3 で実測 = PC 25px / スマホ 11px)。
  - 不採用: 1 行のまま重なる札だけ左右へ逃がす — 2 段を選んだので不要。
  - 不採用: 重なりを放置する。
- 範囲は **酒場の頭上札 + ダンジョン内の仲間(NPC)の札**の両方。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

測定時の HEAD = `e3ce2b0`(#85 着手前)。⚠ **#85 が `index.html` を触るので行番号は必ずずれる** — 着手前に関数名で引き直すこと。

### 2-1. 札を作っている場所

| ファイル:行 | 何 | 今の文字 |
|---|---|---|
| `tavern.html:8795` | `PM_CLASS_EMOJI`(職業 → アイコン表) | — |
| `tavern.html:8809-8820` | `patronLabelPaint(lb, m)` = 酒場の頭上札の文字を作る **唯一の場所**(#57 の注記どおり。初期描画 `:11098` も約束の付け外し `refreshPatronLabelFor` `:8827` / `:7320` もここを通る) | `lb.textContent = (promised ? "🤝 " : "") + (PM_CLASS_EMOJI[m.classKey] \|\| "") + " " + (m.name \|\| "")` |
| `tavern.html:6577` | `recruitClassLabel(k)` = `PARTY_SLOTS` から職業の日本語名を引く**既存の関数**(戦士 / ドワーフ / 僧侶 / 魔法使い / エルフ / 盗賊・`:4659〜4671`) | — |
| `index.html:14401-14413` | `createAllyDom` の名前札 `.allyLabel` = `<span>名前</span><span class="status-slot">` | NPC = `ally.npcName`、主人公 = `cd.name + "（あなた）"`、名前の無い仲間 = `cd.name` |
| `index.html:22334〜` | `CLASS_DEFS[k].name` = 「戦士」など(主人公の札が既にこれを使っている) | — |
| `index.html:3252` | 主人公の札 `#warriorLabel`(静的・「戦士」) | 職業名そのもの |

`createAllyDom` の呼び口は **3 か所**(`grep -n "createAllyDom(" index.html` で実測):

| 行 | 何 | `npcName` | 職業の段 |
|---|---|---|---|
| `:14457` | 闇市の召喚 | 無し | **付けない** |
| `:26989` | 廃坑で助けた従者 `servant` | 無し | **付けない** |
| `:36263` | 通常の編成(`:36238` で `npcName = m.isHero ? null : m.name`) | NPC だけ有り | **NPC だけ付ける** |

⇒ 職業の段を付ける条件 = **`!ally.isHero && ally.npcName`**。主人公は札の文字が既に職業名なので付けない。敵の札 `.enemyLabel` は対象外。

### 2-2. ⚠⚠⚠ 罠 3 つ

**(罠 A) 札の箱の大きさを 1px も変えてはいけない。** 職業の段を札の中に普通の 2 行目として入れると、箱の高さが変わって 3 つ壊れる:

- ダンジョン: `placeUnscaledUi(ally.nameLabelEl, …, 20, -28)`(`index.html:16874`)は**上端を固定**して置いている。HP バーは `-10`(`:16862`)。箱が下へ伸びると **HP バーと状態アイコン列を覆う**。
- `verify_enemy_name_label` (2c)「主人公 / NPC 仲間 / 敵の **3 種の札の高さが同じ**」が赤になる。
- 酒場: `verify_hold_person` (1d) と `verify_party_promises` が札の箱を測っている。

⇒ **職業の段は札の子要素として `position:absolute; bottom:100%` で箱の上へ浮かせる**。`getBoundingClientRect` は絶対配置の子を含まないので、箱の高さは不変。
⭐ 変異 `inline`(職業の段を普通の行にする)で装置に内蔵する。

**(罠 B) `patronLabelPaint` は `textContent =` で中身を丸ごと置き換える。** 職業の段を初期描画で 1 回だけ足すと、約束の付け外しのたびに消える。
⇒ 職業の段も **`patronLabelPaint` の中で毎回作り直す**(#57「2 箇所に書かない」の作法どおり)。
⭐ 変異 `paintonce`(初期描画でだけ足す)で装置に内蔵する — 約束 → 取り消しの後に段が消えて赤になること。

**(罠 C) 札の `textContent` は 🤝 で始まっていなければならない。** `verify_hold_person` (1f) と `verify_party_promises` は `text.indexOf('🤝') === 0` で約束の印を測っている。職業の段の要素を先頭に挿すと `textContent` が「(戦士)🤝 ニカ」になり、両方が赤になる。
⇒ DOM の順序は **[名前のテキスト][職業の段 span]**(段は絶対配置なので、DOM で後ろにあっても見た目は上に来る)。
⭐ 変異 `classfirst`(段を先頭に挿す)で装置に内蔵する。

### 2-3. 幅の実測(1 行案を不採用にした根拠)

HEAD `e3ce2b0`、実 Chrome、`tavern.html`、札の文字を書き換えて `getBoundingClientRect` で測った:

| 画面 | 今(アイコン) | 1 行「(職業) 名前」今日の客 | 1 行・最悪「🤝 (魔法使い) ガウェイン」 | 隣の席との重なり(最悪) |
|---|---|---|---|---|
| desktop 1280×900 | 59〜69px | 72〜102px | 128px | A-B **25px** / C-D **26px** |
| compact 390×844 | 36〜51px | 46〜76px | 95px | A-B **11px** / C-D **12px** |

隣どうしの席は `js/npc-crowd.js:40-49` の patronA (3,3) / patronB (4,3) と patronC (9,5) / patronD (10,5)。札の縦のずれは 10px で、札の高さ(16px)より小さい ⇒ 横に重なればそのまま文字が被る。名前は最長 5 文字(「ガウェイン」・`tavern.html:4681〜` の名前表)。

2 段にすれば下の段は「🤝 ニカ」= 今の札の幅(アイコン 1 文字分だけ減る)、上の段は「(魔法使い)」が最長 ≈ 50px で、隣の席の中心は desktop で約 103px 離れている ⇒ 重ならない(受入 (1e) で実測させる)。

**計測コマンド**(再測定するとき。使い捨て・起草窓の scratchpad にある):

    node <scratchpad>/measure_label.js
    # tavern.html を desktop / compact で開き、.patronLabel[data-patron] 4 枚の矩形を
    # 「今 / 1 行・今日の客 / 1 行・最悪」の 3 通りで測って、A-B・C-D の重なりを出す

### 2-4. 既存 golden への影響(grep で全数)

`patronLabel` / `PM_CLASS_EMOJI` / `allyLabel` の文字を読む本は 5 本(`grep -rln "patronLabel\|PM_CLASS_EMOJI\|allyLabel" tools/`):

| 本 | 何を見ているか | 影響 |
|---|---|---|
| `verify_hold_person` | (0b) 4 席の `PM_CLASS_EMOJI` が 4 種 / (1a) 札が**その席のアイコン**と名前を含む / (1d) 箱 / (1f) 🤝 が先頭 | **(0b)(1a) は必ず赤 ⇒ 言い直す**(§6)。(1d)(1f) は罠 A・C を守れば不変 |
| `verify_party_promises` | 🤝 の文字・`.promised` の class・札の枚数 | 罠 C を守れば不変 |
| `verify_member_identity` | (1d) 頭上札が `?whois=0` と完全一致(恒等) | 両腕とも職業の段が付くので不変 |
| `verify_enemy_name_label` | (2c) 3 種の札の高さが同じ / 70% の比 | 罠 A を守れば不変。職業の段の文字は **em 指定**にして `body.labelSmall`(70%)に自動で追従させる |
| `verify_walk_block` | 札の `textContent` を記録するだけ(assert なし) | 不変 |

変異アンカー: 書き換える 2 行(`patronLabelPaint` の `lb.textContent = …` と `createAllyDom` の `nameSpan.textContent = …`)を文字列で掴んでいる本は **0 本**(`grep -rlF` で実測)。

### 2-5. changelog の要否

`scripts/hooks/check_changelog.py:24` の `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ **鳴る**。
プレイヤー向けの要約は実在する(§10)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | `patronLabelPaint` を「テキスト + 職業の段 span」に。CSS `.patronLabel .labelClass` を 1 規則。撤退スイッチ `isClassLineOn()`。changelog |
| `index.html` | `createAllyDom` で NPC の札に職業の段 span。CSS `.allyLabel .labelClass` を 1 規則。撤退スイッチ |
| `tools/verify_hold_person.js` | (0b)(1a) をアイコン → 職業名へ言い直す |
| `tools/verify_class_line.js` | 新規の受入 |

⛔ `PM_CLASS_EMOJI` は**消さない**。約束の一覧の行(`tavern.html:8887` 「🗡️ ニカ（戦士）」)と肖像画の代わりの絵(`:9018`)が使っている。
⛔ 主人公の札 `#warriorLabel`・敵の札 `.enemyLabel`・#76 の脅威度の付け足し(`index.html:28454`)は触らない。

---

## 4. STEP1 — 酒場の頭上札(`tavern.html`)

```js
/* ★[#86] 職業を文字で。撤退 ?classline=0 = #57 のアイコン札へ戻す。
   ⚠ const に畳まない — 呼ぶたびに読む (isPatronLabelOn と同じ TDZ 回避の作法)。 */
function isClassLineOn() {
  try { return new URLSearchParams(location.search).get("classline") !== "0"; }
  catch (e) { return true; }
}
function patronLabelPaint(lb, m) {
  if (!lb || !m) return;
  let promised = false;
  try { promised = !!(window.DFRecruits && DFRecruits.has(m.name)); } catch (e) {}
  if (!isClassLineOn()) {
    lb.textContent = (promised ? "🤝 " : "") + (PM_CLASS_EMOJI[m.classKey] || "") + " " + (m.name || "");
  } else {
    /* ⚠⚠ 順序は [名前][職業の段] —— 札の textContent は 🤝 で始まっていなければならない
         (verify_hold_person (1f) / verify_party_promises)。段は CSS で箱の上へ浮かせる。
       ⚠ 毎回ここで作り直す —— textContent で中身ごと消えるので、初期描画だけで足すと
         約束の付け外しで段が消える。 */
    lb.textContent = (promised ? "🤝 " : "") + (m.name || "");
    const cls = document.createElement("span");
    cls.className = "labelClass";
    cls.textContent = "(" + recruitClassLabel(m.classKey) + ")";
    lb.appendChild(cls);
  }
  lb.classList.toggle("promised", promised && PROMISE_MARK_ON);   // ← 既存行のまま
}
```

CSS(`.patronLabel` の規則群の近く):

```css
/* ★[#86] 職業の段。⚠ 絶対配置 = 札の箱の大きさを 1px も変えない
   (#57 の 3 条件・verify_hold_person (1d)・verify_party_promises の箱が不変)。
   ⚠ font-size は em —— body.compact の 11px にそのまま追従させる。 */
.patronLabel .labelClass {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  font-size: 0.85em;
  line-height: 1.1;
  white-space: nowrap;
  color: #d9c9a3;
  text-shadow: 0 1px 2px rgba(0,0,0,0.95);
  pointer-events: none;
}
```

⚠ 左向きの席(patronB / patronD)は親の `.npcUnit` に `scaleX(-1)` が掛かり、`.npcUnit.faceLeft .patronLabel` が札ごと二重反転している(`:2626`)。段は札の**子**なので、この二重反転の内側に入って正しい向きになる。⇒ 段に反転を足さない(足すと鏡文字になる。受入 (1g))。
⛔ `.patronLabel` 本体の font-size / padding / top / z-index / pointer-events は 1 文字も触らない(#57 の注記)。

---

## 5. STEP2 — ダンジョン内の仲間の札(`index.html`)

`createAllyDom` の名前札(`label.appendChild(nameSpan)` の直後・`statusSlot` より前でも後でもよいが、**`statusSlot` の参照は変えない**):

```js
// ★[#86] NPC の仲間だけ、名前の上に職業の段。主人公 (札が既に職業名) / 召喚 / 従者 (npcName 無し) には付けない。
//   ⚠ 絶対配置 = 札の箱の高さが変わらない (placeUnscaledUi は上端固定 -28・HP バーは -10。
//     箱が伸びると HP バーと状態アイコンを覆う / verify_enemy_name_label (2c) の 3 種同高)。
if (CLASS_LINE_ON && !ally.isHero && ally.npcName) {
  const cls = document.createElement("span");
  cls.className = "labelClass";
  cls.textContent = "(" + cd.name + ")";
  label.appendChild(cls);
}
```

撤退スイッチ(`NAME_LABEL_ON` `:3837` と同じ型・ダンジョン内で完結):

```js
/* ══ #86 撤退スイッチ ?classline=0 — 仲間の札の職業の段を出さない ══ */
const CLASS_LINE_ON = (() => {
  try { return new URLSearchParams(window.location.search).get("classline") !== "0"; }
  catch (e) { return true; }
})();
```

CSS(`.allyLabel` の規則群の近く。⛔ 素の `.allyLabel` と `body.labelSmall .allyLabel` は 1 行も触らない = #44 の注記):

```css
/* ★[#86] 職業の段。絶対配置 = 札の箱は不変。font-size は em = body.labelSmall (70%) に自動で追従。 */
.allyLabel .labelClass {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  font-size: 0.85em;
  line-height: 1.1;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: #b8d4ea;
  text-shadow: 0 1px 2px rgba(0,0,0,0.95);
  pointer-events: none;
}
```

⚠ `.allyLabel` は `position:absolute` なので、段の基準になる(追加の `position:relative` は不要)。

---

## 6. STEP3 — 既存 golden の言い直し(`tools/verify_hold_person.js`)

- **(0b)** 「4 席の職業が相異なり、`PM_CLASS_EMOJI` のアイコンが 4 種」→「4 席の職業が相異なり、**`PARTY_SLOTS` から引いた職業名**が 4 種」。期待値は `todaysPatrons[k].classKey` → `PARTY_SLOTS.find(...).name` を**ドライバが自分で**引く(`recruitClassLabel` を呼ばない = 実装と同じ関数を写さない)。
- **(1a)** 「札のテキストが**その席の**アイコンと名前を含む」→「札の `.labelClass` が `"(" + その席の職業名 + ")"`、かつ札のテキストが**その席の**名前を含む」。
- **`?patronlabel=0` (5c-1) の腕はそのまま**。アイコンの旧挙動は新規受入の §3 が `?classline=0` で見る。
- 言い直したら、素と `--negative` の両方を走らせて担当だけが赤になることを確かめる。

---

## 7. 撤退スイッチ

- **`?classline=0`** — 酒場は #57 のアイコン札(「🗡️ ニカ」)へ、ダンジョンは名前だけの札へ戻る。
- ⚠ 判定位置 = `tavern.html` は `isClassLineOn()`(呼ぶたびに読む)/ `index.html` は `CLASS_LINE_ON`(起動時に 1 回)。
- ページ遷移をまたぐか = **またがない**。各ページが自分の URL を読む(`?heromark=0` / `?patronlabel=0` と同じ型)。酒場 → ダンジョンへ持ち越したいときは両方の URL に付ける。

---

## 8. 受入条件 — `tools/verify_class_line.js`(新規)

port base = **10574**(#85 §12)。変異は 10575 から。

方針: 酒場とダンジョンの札を**実 Chrome の DOM と `getBoundingClientRect`** で測る。職業名の期待値は**ドライバが `PARTY_SLOTS` / `CLASS_DEFS` から自分で引く**(実装が使う `recruitClassLabel` を呼ばない)。色・字の大きさの具体値は縛らない。

ダンジョンの腕は、NPC 仲間が 2 人以上いる編成で 1 シナリオを開き、最初の部屋で札が出たところで測る(起動の型は `verify_enemy_name_label` の写しでよい)。

### §0 装置

- **(0a)** 酒場で `.patronLabel[data-patron]` が 4 枚、4 席の `classKey` が相異なる(⭐ 全席が同じ職業だと「職業を取り違えた実装」でも緑になる)。
- **(0b)** ダンジョンで NPC 仲間(`!isHero && npcName`)の札が **2 枚以上**、主人公の札と名前の無い仲間(召喚または従者)の札を**それぞれ 1 枚以上**測れている(⭐ 「付けない」側の assert が空振りしないため。従者は廃坑で `servant` を出すか、召喚で作る)。
- **(0c)** pageerror 0。

### §1 酒場

- **(1a)** ★★ 4 席すべてで `.labelClass` の文字が `"(" + その席の職業名 + ")"`。
- **(1b)** 札の箱の高さが `?classline=0` の同じ席の札と一致(±0.5px)= 罠 A。
- **(1c)** `.labelClass` の下端 ≤ 札の箱の上端 + 1px、横の中心が札の中心と ±1px(上に乗っている)。
- **(1d)** 札の文字に `PM_CLASS_EMOJI` のどのアイコンも含まれない。
- **(1e)** 最悪の組み(4 席を「🤝 + 魔法使い + ガウェイン」に差し替えて `patronLabelPaint` を通す)で、隣の席(A-B・C-D)どうしの**職業の段と札の箱**が重ならない — desktop と compact の 2 画面で。
- **(1f)** 約束 → 取り消しの後も `.labelClass` が残り、札の `textContent` が約束中は 🤝 で始まり、取り消すと 🤝 を含まない = 罠 B・C。
- **(1g)** 左向きの席(patronB / patronD)の `.labelClass` の実効の横の倍率が正(`getComputedStyle` の行列を親まで掛け合わせる)= 鏡文字でない。

### §2 ダンジョン

- **(2a)** ★★ NPC 仲間の札すべてで `.labelClass` の文字が `"(" + CLASS_DEFS[その仲間の classKey].name + ")"`。
- **(2b)** 主人公の札・名前の無い仲間の札・敵の札に `.labelClass` が 0 個。
- **(2c)** NPC 仲間の札の箱の高さが `?classline=0` と一致(±0.5px)、かつ主人公 / 敵の札と同じ高さ(#44 (2c) を壊していない)= 罠 A。
- **(2d)** `.labelClass` の下端 ≤ 札の箱の上端 + 1px。

### §3 撤退

- **(3a)** `tavern.html?classline=0` → 4 席の札の `textContent` が `(🤝 ) + PM_CLASS_EMOJI[classKey] + " " + 名前` に**完全一致**、`.labelClass` が 0 個。
- **(3b)** `index.html?classline=0` → `.labelClass` が 0 個。

### ⛔ 測らないこと

- 職業の段の**色・font-size の具体値・字間**(目で直す余地を残す)。縛るのは「箱の外・上に乗っている」「箱の大きさが変わらない」「重ならない」だけ。
- 約束の一覧の行(`🗡️ ニカ（戦士）`)と肖像画の代わりの絵 — 対象外。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `inline` | 職業の段の `position:absolute` を外す(札の中の普通の行になる)— **罠 A の再現** | (1b)(1c)(2c)(2d) |
| `paintonce` | 職業の段を `patronLabelPaint` でなく初期描画でだけ足す — **罠 B の再現** | (1f) |
| `classfirst` | 段を札の先頭に挿す(`prepend`)— **罠 C の再現** | (1f) |
| `wrongclass` | 酒場の段に隣の席の `classKey` を使う | (1a) |
| `emojistay` | 段を足したうえでアイコンも残す | (1d) |
| `heroclass` | ダンジョンで主人公・名前の無い仲間にも段を付ける | (2b) |
| `mirror` | 段に `scaleX(-1)` を足す | (1g) |
| `deadswitch` | `?classline=0` を無視する | (3a)(3b) |

### 既存 golden の非退行(実装後に必ず走らせる)

名指し(着手前の色は #85 の後の HEAD で実走して控えること):

- `verify_hold_person`(素 / `--negative`)— (0b)(1a) は §6 で言い直した後の色
- `verify_party_promises`(素 / `--negative`)
- `verify_member_identity`(素)
- `verify_enemy_name_label`(素 / `--negative`)
- `verify_walk_block`(素)
- `verify_npc_crowd` / `verify_recruit_talk` / `verify_tower_mother_b`(酒場の札の隣に立つ NPC を読む本)

母集団: 酒場を開く本と仲間の札を読む本(#83 §12 の母集団の引き方 = 差分を含む関数の中のアンカー + `tavern.html` を開く本)。

⚠ 基準値は着手時に測ること。**走らせて違ったら期待値を書き換える前に理由を突き止める**。

---

## 9. 実機/実感の確認(ここが本当の受入)

- iPhone 縦(compact)で、酒場の 4 人の上の「(魔法使い)」などが読めるか(font 11px × 0.85 ≈ 9.4px)。
- ダンジョンの札は `body.labelSmall` で 70% になる ⇒ 段は ≈ 6.5px。⚠ **読めない可能性が高い** — 読めなければ §8 の「測らないこと」の範囲で font-size だけ上げる(箱の外なので他の golden は動かない)。
- 段が席札(卓の名札)や上の仲間のスプライトに被って見えないか。
- ⚠ ローカルは http 起動が必須(file:// では音が出ない)。

---

## 10. changelog(⚠ `tavern.html` / `index.html` を触るので必須)

    py tools/add_changelog.py "<b>名前札に職業を文字で表示</b> — 酒場の客とダンジョンの仲間の名前の上に「(戦士)」のように職業が出るようになった。"

---

## 11. やらないこと

- ⛔ 約束の一覧の行・肖像画の代わりの絵のアイコン(`PM_CLASS_EMOJI` の他の使い道)。
- ⛔ 主人公の札の書式(既に「戦士（あなた）」= 職業名が出ている)。
- ⛔ 敵の札(#44 / #76)。
- ⛔ 傭兵名簿パネル・マッチング画面のカード。
- ⛔ 札の位置そのもの(`top: -18px` / `placeUnscaledUi` の `-28`)。
- ⛔ **`実装依頼書/README.md` への行追加は #85 の完了後**(port base が #85 §12 で決まるため)。用意してある行:

    | 86 | [2026-10-05_class-line-label.md](2026-10-05_class-line-label.md) | **承認済** | 0% | 名前札の職業をアイコンから文字へ。酒場の客とダンジョンの NPC 仲間の札の上に小さく「(戦士)」の段(2 段)。⚠ 段は絶対配置で箱の大きさを変えない(HP バー・#44 (2c)・#57 の箱)/ `patronLabelPaint` で毎回作る / 札の文字は 🤝 で始める。`verify_hold_person` (0b)(1a) を言い直す。#85 完了で着手可。受入 `verify_class_line` の port base = #85 §12 の次。撤退 `?classline=0` |

---

## 12. 実装結果

### 12-0. 基準取り(項目1・HEAD cdebd24)

測定日 2026-10-06(実装窓・dev-loop 項目1)。本番ファイル(`index.html` / `tavern.html` / `audio.js` / `js/*` / `tools/*`)は 1 バイトも触っていない。
測定プローブ = 実装窓の scratchpad `item1/probe86.js` / `probe86b.js`(内蔵 node http・port **10611**・実 Chrome headless。§4 / §5 の CSS と描き方を**ページ内へ実行時に注入**して測る)。

⭐ `345d0f7`(#85 完了)と `cdebd24` で `index.html` `19a7304a` / `tavern.html` `673e8044` / `audio.js` `311aee29` / `js` `86e8ad50` / `tools` `00147812` / `assets` `d1b418e2` の OID が全部同じ(差分は `実装依頼書/*.md` 2 本だけ)。

#### 行番号(`e3ce2b0` → `cdebd24`)

| 何 | §2 の記載(e3ce2b0) | cdebd24 |
|---|---|---|
| `PM_CLASS_EMOJI` | tavern 8795 | **8795**(ほかの使い道 = 約束の一覧 8887 / 肖像の代わり 9018) |
| `isPatronLabelOn()` | — | **8803-8806** |
| `patronLabelPaint(lb, m)` | 8809-8820 | **8809-8820**(`lb.textContent = …` = **8813** / `.promised` の toggle = 8818) |
| `refreshPatronLabelFor(m)` | 8827 | **8822-8829**(呼び口 8827) |
| 呼び口: 初期描画 `initNpcCrowd` | 11098 | **11093-11100**(`if (isPatronLabelOn() && seatMember)` 11093 / `lb.title = recruitClassLabel(…)` 11097 / `patronLabelPaint` 11098 / `el.appendChild(lb)` 11099) |
| 呼び口: 約束の付け外し | 7320 / 8827 | **7320 = `doPromiseDisband()`(7309〜)が `patronLabelPaint` を直接呼ぶ** / 8827 = `refreshPatronLabelFor` ← `btnRecruitYes` 6628・6634 / `doPromiseDrop` 8866 |
| `PROMISE_MARK_ON` | — | **8042-8045** |
| `recruitClassLabel(k)` | 6577 | **6577-6580** |
| `PARTY_SLOTS`(職業名) | 4659〜4671 | **4658-4671** |
| 名前表 | 4681〜 | `NPC_NAMES` **4680** / `NPC_NAMES_BY_CLASS` **4691-4704** |
| CSS `.patronLabel` | — | **2602-2618**(`body.compact` 2619 / `.npcUnit.faceLeft .patronLabel` **2626** / `.promised` 2637-2641) |
| `changelogList` | — | **3334-3339** |
| `createAllyDom` | index 14401-14413 | **14461-14504**(札 = 14488-14500 / `nameSpan.textContent = …` **14492** / `label.appendChild(nameSpan)` 14493 / `statusSlot` 14495-14497 / `ally.nameLabelEl = label` 14500) |
| 呼び口 闇市の召喚 | 14457 | **14544** |
| 呼び口 廃坑の従者 `servant` | 26989 | **27076** |
| 呼び口 通常の編成 | 36263(npcName 36238) | **36350**(`ally.npcName = …` **36325**) |
| `placeUnscaledUi(ally.nameLabelEl, …, 20, -28)` | 16874 | **16961**(本体 `placeUnscaledUi` = 4655) |
| HP バー `-10` | 16862 | **16949** |
| `CLASS_DEFS` | 22334〜 | **22421〜**(6 職 22422-22514 / 従者 `servant`「商人の従者」22580 / 召喚「ゴーレム兵」22537・「アンデッド小隊」22555) |
| `#warriorLabel` | 3252 | **3252**(⚠ 中身は起動時に書き換わる = K1) |
| `NAME_LABEL_ON` | 3837 | **3873-3875** |
| CSS `.allyLabel` | — | **283-297**(`position:absolute`)/ `body.labelSmall .allyLabel` **313-318** / `.enemyLabel` 326-339 |
| #76 の脅威度 | 28454 | **28541-28560**(`loreDecorateLabel` 28543) |
| 頭の札の文字を書く所 | — | `applyLeaderStats` 20657(職業名)→ 起動時 **36290**(`headDisplayName`)/ 頭の委譲 **20267-20272** |

#### §2 の主張の実測(○ = 成立 / × = 崩れ → K)

- ○ `patronLabelPaint` が酒場の頭上札の文字を作る唯一の場所(`tavern.html` の `.patronLabel` を書く所を全数 grep。`js/` ほかの HTML は 0 件)。呼び口 3 経路(初期描画 / `doPromiseDisband` / `refreshPatronLabelFor`)もすべてここを通る。
- ○ `createAllyDom` の呼び口は 3 か所。`npcName` を持つのは通常の編成の NPC だけ(召喚・従者は `createAlly` の戻り値に `npcName` が無い = undefined)。
- ○ `recruitClassLabel` と `CLASS_DEFS[k].name` の 6 職の名前は一致(戦士 / ドワーフ / 僧侶 / 魔法使い / エルフ / 盗賊)。
- ○ 名前は最長 5 文字(「ガウェイン」のみ。⚠ `NPC_NAMES_BY_CLASS` では**僧侶**の名前 = `?namejob=0` 以外で「魔法使い + ガウェイン」は出ない。§8 (1e) の合成の最悪としては問題ない)。職業名の最長は 4 文字(魔法使い / ドワーフ)。
- ○ 隣の席 `js/npc-crowd.js:40-49`(A(3,3)/B(4,3)・C(9,5)/D(10,5))。札の中心どうしは desktop で 102.3px。
- ○ `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ 鳴る。
- ○ 罠 A の前提(実 Chrome・下の表): `.patronLabel` も `.allyLabel` も `position:absolute`(= 段の基準になる)。段を `position:absolute` で足しても札の箱の**高さは 1px も変わらない**(getBoundingClientRect は絶対配置の子を含まない)。⚠ ただし「普通の行」の振る舞いは §2-2 の書き方と違う = K2。
- ○ 罠 C: 段を後ろに付けると `textContent` = 「イレーナ(戦士)」(約束中は「🤝 イレーナ(戦士)」)= 🤝 で始まる。
- ○ (1g) 左向きの席(B / D)は札の実効の横倍率が**正**(desktop +0.825 / compact +0.674 = 舞台の縮尺そのもの)。段に `scaleX(-1)` を足すと −0.825 / −0.674 になる ⇒ 変異 `mirror` は (1g) で捕まる。⚠ 倍率は 1 ではなく舞台の縮尺が掛かる = 受入は**符号**で見ること。
- ○ (1e) 最悪の組(4 席を「🤝 ガウェイン」+「(魔法使い)」)で隣の席と重ならない: desktop A-B / C-D とも 札-札 の横の隙間 **23.9px**、札(A)-段(B) **43.2px**、段どうしは縦に重ならない(10px ずれ・段の高さ 9.3px)。compact は 札-札 **25.3px** / 札-段 **39.5px**。
- × §2-4「札を読む本は 5 本」→ **4 本**(K4)。× (0b) は「必ず赤」ではない(K5)。× `#warriorLabel` は静的な「戦士」ではない(K1)。

#### 罠 A の実測(probe86・札の箱の getBoundingClientRect)

| 画面 | 段なし(今) | 段 = absolute(§4/§5) | 段 = position:static(inline) | 段 = display:block |
|---|---|---|---|---|
| 酒場 desktop 1280×900(舞台縮尺 0.825) | h 16.5 | h **16.5**(段の下端 = 札の上端 + 0.825) | h **16.5**・幅 +23〜39px | h **25.755** |
| 酒場 compact 390×844(縮尺 0.674) | h 12.637 | h **12.637**(+0.674) | h **12.637**・幅 +17〜24px | h **19.555** |
| ダンジョン(`body.labelSmall`・NPC 3 人) | h 14.375 | h **14.375**(+**1.000**) | h **14.375**・幅 +19〜34px | h **21.563** |
| ダンジョン `?namelabel=0` | h 20 | h **20**(+**1.000**) | h **20**・幅 +27〜47px | h **30.266** |

段の文字の大きさ(computed): 酒場 10.2px(desktop)/ 9.35px(compact)、ダンジョン 6.545px(labelSmall)/ 9.35px(`?namelabel=0`)。⚠ 酒場は舞台ごと縮尺されるので**画面上は ≈ 8.4px / ≈ 6.3px**(K8)。
`.npcUnit` の矩形は段を足しても 79.2×79.2(desktop)/ 64.7×64.7(compact)のまま・札の無い NPC とも一致。

#### 崩れた主張

- **K1 ⚠⚠⚠(ユーザー判断が要る)`#warriorLabel` の中身は「戦士」で固定ではない。頭が NPC のとき、その NPC の札は `createAllyDom` を通らないので §5 では職業の段が付かない。**
  起動時に `index.html:36290` が `#warriorName` を `headDisplayName` で上書きする = 主人公が頭なら「**あなた**」、NPC が頭なら**その NPC の名前**(`applyLeaderStats` 20657 が入れた職業名は消える)。頭の委譲(20267-20272)でも同じ。`orderFormation` は前衛(戦士・ドワーフ)を先頭へ並べるので、**主人公が前衛でない編成(魔法使い・僧侶・エルフ・盗賊)では前衛の NPC が頭になる**のが普通。
  実測(probe86b・`partyMembers` を仕込んで直起動): [戦士 NPC イレーナ, 僧侶 NPC ヨナ, 魔法使い=主人公] ⇒ `heroIsHead=false`・`#warriorLabel`「イレーナ」(段なし)・仲間の札「ヨナ(僧侶)」「魔法使い（あなた）」。[戦士=主人公, ドワーフ NPC, 魔法使い NPC] ⇒ `#warriorLabel`「あなた」。
  ⇒ §2-1 の「主人公の札 `#warriorLabel`(静的・「戦士」)= 職業名そのもの」と §2-1 末尾の「主人公は札の文字が既に職業名なので付けない」は、**主人公が仲間の列にいるとき(「魔法使い（あなた）」)だけ**正しい。頭の主人公は「あなた」で職業名が出ていない。
  選択肢: (a) 依頼書どおり(頭の NPC には段を付けない・頭の主人公もそのまま)/ (b) 頭が NPC のときだけ `#warriorLabel` にも段を付ける(起動 36290 と委譲 20271 の 2 経路・撤退 `?classline=0` も効かせる)/ (c) (b) に加えて頭の主人公の「あなた」の上にも職業。⇒ **項目2 の前に決めること。**
- **K2 罠 A の「普通の行にすると箱の高さが変わる」は半分だけ正しい。** 札は `white-space: nowrap` なので、`position:absolute` を外しただけの段(inline の span)は**同じ行に並んで横に伸びる**だけで、高さは 1px も変わらない(上の表)。高さが伸びるのは段がブロック(`display:block` / `<br>`)のとき。⇒ HP バーを覆う危険は「段を div や block で足す」実装に限られる。
  ⇒ **§8 の変異 `inline`(`position:absolute` を外す)は (1c)(2d) しか赤くしない**。依頼書の担当 (1b)(2c) を赤くしたいなら、項目3 は変異を「段を普通の 2 行目にする = `display:block; position:static`」として作るか、担当表を実走で書き直すこと(⛔ 机上で書かない)。
- **K3 (1c)/(2d) の許容「段の下端 ≤ 札の上端 + 1px」は、ダンジョンで余裕が 0。** `bottom:100%` は札の**パディングの縁**から測るので、段の下端は札の上端 + **枠の太さ**になる: 酒場 0.825 / 0.674(1px × 舞台の縮尺)、ダンジョン **1.000**(labelSmall の `border-width:0.7px` は端末の 1px へ丸まる)、`?namelabel=0` も 1.000。⇒ 浮動小数の揺れで赤くなりうる。項目3 は許容を「札の上端 + `border-top-width` の実測 + 0.5px」のように**枠の実測から導出**すること(⛔ 本番の CSS を測定に合わせて変えない)。
- **K4 §2-4「札の文字を読む本は 5 本」→ 4 本。** `grep -rln "patronLabel\|PM_CLASS_EMOJI\|allyLabel\|labelClass" tools/` = `verify_hold_person` / `verify_party_promises` / `verify_member_identity` / `verify_enemy_name_label`。`verify_walk_block` は**敵の札**(`enemyLabelElements`・`tools/verify_walk_block.js:973-980`)の文字を記録しているだけで、仲間・客の札は読まない(影響なし)。
  語を広げた和集合(`nameLabelEl` / `createAllyDom` / `heroLabel` / `warriorLabel` / `recruitClassLabel` / `patronLabelPaint` / `data-patron` / `todaysPatrons` / `npcName`)で増える本 = `driver_heromark_signplate`(主人公 ally の札の矩形 = 段は付かない)/ `driver_grid_p7`(`#warriorLabel` の矩形)/ `driver_sce1_events`(DOM の撤去)/ `verify_arcane_eye`・`verify_invisibility`(`createAllyDom` を名前なしの魔法使いで呼ぶ = 段は付かない)/ `verify_recruit_talk`(`todaysPatrons`)ほか `npcName` を読む本(戦闘ログ)。どれも段の有無で読む値は変わらない見込み = 項目4 の母集団で確かめる。
  ⚠ `verify_hold_person (1d)` と `verify_party_promises (4a2)` が測っているのは **`.npcUnit` の矩形**であって札の箱ではない(`verify_hold_person.js:283-288` / `verify_party_promises.js:433-445`)。札の箱の高さを測っている既存の本は `verify_enemy_name_label (2c)` だけ。
- **K5 `verify_hold_person (0b)` は実装しても赤くならない。** (0b) が読むのは `PM_CLASS_EMOJI` の表と席の `classKey`(`verify_hold_person.js:621-626`)で、札の文字を読まない。§3 は `PM_CLASS_EMOJI` を消さないので緑のまま。**必ず赤になるのは (1a)(628-634 = 札の文字が「その席のアイコン」を含む)だけ**。§6 の (0b) の言い直しは「(1a) の装置を職業名へそろえる」ための任意の言い直しとして扱う。
  (1f)(`verify_hold_person.js:745-748`)と `verify_party_promises` (3c)(4a)(4b) は `textContent` の先頭の 🤝 を見る = 罠 C どおり。`verify_member_identity (1d)`(475・1160)は札の `textContent` と `className` を 2 腕で突き合わせる恒等 = 両腕に段が付くので不変。
- **K6(軽微)変異アンカー 0 本は実質で成立。** `grep -rlF 'nameSpan.textContent = ' tools/` は 1 件当たるが、`verify_enemy_name_label.js:288`(変異 `typekey`)の `nameSpan.textContent = def.name || "";` = **敵の札**(`index.html:13164`)で、`createAllyDom` の 14492 ではない。`lb.textContent = ` は 0 件。
  ⚠ #86 が触る領域のすぐ隣に、**1 件ちょうど**でなければならない既存の変異アンカーがある(全部いま 1 件): `verify_hold_person` の `labelz`(tavern 2607)/ `labelhit`(2608)/ `labelsib`(11099 `el.appendChild(lb);`)、`verify_party_promises` の `m4`(11093)、`verify_enemy_name_label` の `noenemycss`(326 `.enemyLabel {`)/ `nocss`(343)/ `statusdetach`(13166 `lb.appendChild(st);`)。⇒ 新しい CSS 規則や JS にこれらの行を**同じ文字列で写さない**こと。
- **K7(軽微)§2-1 の「約束の付け外し `refreshPatronLabelFor` `:8827` / `:7320`」の 7320 は `refreshPatronLabelFor` ではなく `doPromiseDisband()` が `patronLabelPaint` を直接呼ぶ口**。どちらにしても `patronLabelPaint` を通るので罠 B の設計は変わらない。
- **K8(§9 向け)酒場の段の見た目の大きさ。** §9 の「font 11px × 0.85 ≈ 9.4px」は CSS 上の値で、酒場の舞台は縮尺される(desktop 0.825 / compact 0.674)ので**画面上は compact で ≈ 6.3px**(ダンジョンの labelSmall の 6.5px とほぼ同じ)。実機で読めなければ §9 のとおり font-size だけ上げる。
- **K9(参考)** 札にはもう `title = recruitClassLabel(classKey)`(11097)= ホバーで職業名が出る(PC のみ)。
- **K10(受入の作り方)** `index.html` を直起動(`partyMembers` なし)すると `heroIsHead=true`・仲間は NPC 3 人だけで、主人公の ally(`.heroLabel`)も召喚・従者も居ない。⇒ §8 (0b) の「主人公の札」「名前の無い仲間の札」は、`partyMembers` に**前衛でない主人公**を入れる(K1 の probe86b の型)+ 召喚(`createAlly` + `createAllyDom`・`verify_invisibility.js:389` の型)で作ること。⚠ K1 の決定次第で「主人公の札」に `#warriorLabel` を含めるかが変わる。
- **K11(参考)** compact 390×844 の酒場では patronA の札が画面の左外(left −102px)にある(舞台が横にはみ出す)。幾何の assert には影響しないが、`elementFromPoint` 系で測ると当たらない。

#### 名指し golden — 着手前の色(`cdebd24`・逐次・単独・本番ツリー)

| 本 | 素: exit / 集計 / 所要 | `--negative`: exit / 結果 / 所要 |
|---|---|---|
| `verify_hold_person` | 0 / 31/31 / 10.1s | 0 / 8 本すべて担当が赤・空振り 0 / 80.3s |
| `verify_party_promises` | 0 / 35/35 / 38.9s | 0 / 9 本すべて担当が赤・空振り 0 / 547.6s |
| `verify_member_identity` | 0 / 28/28 / 139.4s | 0 / 12 本すべて担当が赤・空振り 0 / 181.9s |
| `verify_enemy_name_label` | 0 / 30/30 / 2.5s | 0 / 58/58(変異 17 本・PENDING 0)/ 14.9s |
| `verify_walk_block` | **1 / 22/23(赤 = (3d))** / 15.1s | 0 / 54/54(変異 16 本・PENDING 0)/ 50.2s |
| `verify_npc_crowd` | 0 / 33/33 / 76.4s | 0 / 58/58(変異 13 本)/ 238.1s |
| `verify_recruit_talk` | 0 / 25/25 / 44.5s | 0 / 11/11 本が期待どおり / 611.8s |
| `verify_tower_mother_b` | 0 / 22/22 / 347.8s | 0 / 11 本すべて担当が赤・担当外の赤 0 / **4160.8s** |

合計 **109.3 分**(素 11.3 分 / `--negative` 98.1 分)。8 本とも `--negative` を持つ。port: hold_person 10101〜 / party_promises 10161〜 / member_identity 10401〜 / enemy_name_label 9850〜9870 / walk_block 9410〜 / npc_crowd 9573〜9586 / recruit_talk 10020〜 / tower_mother_b 10555〜。直列なので衝突なし。試遊サーバ 8765(pid 7088)は着手前から居たもので、触っていない・使っていない。

⚠ `verify_walk_block` 素の (3d)「badge を持つ ENEMY_TYPES 定義が 44 件のまま」は実測 **47 件**で赤(期待 44 を固定値で焼いた assert = 件数が腐った型)。post85 でも同じ 22/23・exit 1 = **#86 とは無関係(型3)**。#86 は `ENEMY_TYPES` を触らない。

#### 母集団(項目4)

- **post85(208 腕・`345d0f7` で走査・緑 181 / 非緑 27)は着手前の色にそのまま流用できる。** `345d0f7`→`cdebd24` の差分は `実装依頼書/*.md` 2 本だけで、ドライバの読む木の OID が全部同じ(上)。資産 = #85 実装窓の scratchpad `item4\`(`armlist_85post.json` / `run_post85\post85.tsv` / `sweep_85post.py` / `cmp_85.py` / `pair_85.py` / `mkshadow_85.py`)。⚠ 前のセッションの scratchpad は消えうる ⇒ 項目4 は着手時に自分の scratchpad へ写すこと。
  非緑 27 腕: `driver_field_step6` / `driver_grid_p4`(exit 3)/ `driver_grid_p8` / `driver_mapdef_step1`(clone の (0b))/ `driver_mapeditor` / `driver_mapeditor_painting` / `driver_mine_wall` / `driver_monsters_griffon` / `driver_monsters_hobgoblin` / `driver_monsters_umberhulk` / `driver_sce1_events` / `driver_speech_engine` / `driver_speech_v2` / `driver_wall_props` / `probe_bandit_map`・`probe_s2_fold`・`probe_swamp_map`(引数ガードの exit 3)/ `probe_n4_stall`(正常で exit 1)/ `probe_party_size` / `sweep_recruit_balance` / `verify_codex_map_skill` / `verify_walk_block` / `verify_mage_hand --negative` / `verify_swamp_novice --negative`・`verify_fort_fold --negative`・`verify_swamp_fold --negative`(exit 3)/ `probe_s2_clear --negative`。
- `tavern.html` をコードで読む本 61 本・`index.html` をコードで読む本 149 本(コメントを剥いで数えた)は、`probe_magehand_reach`(両方)と `auto_debug_run`(index)以外**全部 post85 の腕名簿に入っている**(この 2 本は #83 / #85 でも外している)。
- #86 が触る領域(tavern の `.patronLabel` CSS・`changelogList`・`recruitClassLabel`・`PM_CLASS_EMOJI`〜`refreshPatronLabelFor`・初期描画 / index の `.allyLabel` CSS・`NAME_LABEL_ON` の周辺・`createAllyDom`)の文字列を掴む `--negative` の本 = **`verify_hold_person`**(`labelhit` / `labelz` / `labelsib`)と **`verify_party_promises`**(`m4`)。どちらの `--negative` 腕も post85 に入っている。`verify_enemy_name_label --negative`(`.enemyLabel` の CSS が `.allyLabel` の隣)も入っている。ほかの当たりは罫線 `═══` / クエリ文字列 / コメントの語で偽の当たり(`item1/anchors86b.py`)。
- **項目4 で足す腕** = ① 新規 `verify_class_line`(素 + `--negative`)② `verify_walk_block --negative`(post85 の名簿に無い。着手前の色は上の表 = 54/54・exit 0)。

### 12-1. 実装(項目2・基準 `d5f2dff`)

2026-10-06(実装窓・dev-loop 項目2)。push していない。

#### 差分の要約

| ファイル | 変更 |
|---|---|
| `tavern.html` | CSS `.patronLabel .labelClass`(`.patronLabel.promised` の直後・§4 のとおり絶対配置・`0.85em`・反転なし)/ `isClassLineOn()`(`isPatronLabelOn` の直後・呼ぶたびに URL を読む)/ `patronLabelPaint` を「`?classline=0` なら #57 の 1 行のまま、既定は `textContent = (🤝 ) + 名前` → `span.labelClass`「(職業名)」を append」(毎回作り直す = 罠 B・段は後ろ = 罠 C・職業名は `recruitClassLabel`)/ changelog 1 行 |
| `index.html` | CSS `.allyLabel .labelClass`(`body.labelSmall .allyLabel` の直後。`#warriorLabel` も class `allyLabel` なのでこの 1 規則で効く)/ `CLASS_LINE_ON`(`NAME_LABEL_ON` の直後・起動時 1 回)/ `createAllyDom` で `CLASS_LINE_ON && !ally.isHero && ally.npcName` の札に段(`statusSlot` の前・参照は不変)/ **頭の札のヘルパー `paintHeadClassLine(isNpcHead, classKey)`**(`tryPromoteNewHead` の直前)と呼び口 2 か所 |
| `tools/verify_hold_person.js` | (0b)(1a) をアイコン → 職業名へ言い直し(下) |

⛔ 触っていない: `.patronLabel` / `.allyLabel` / `body.labelSmall .allyLabel` / `#warriorLabel` 本体の規則、`PM_CLASS_EMOJI`(約束の一覧・肖像の代わりで現役)、敵の札、`placeUnscaledUi` の dy。

#### K1 の決定の反映(§11「主人公の札の書式は触らない」を上書きする分)

**ユーザー決定(2026-10-06)= (b) 頭が NPC のときだけ `#warriorLabel` にも同じ職業の段**(「(戦士)」+ 名前)。頭が主人公なら付けない(「あなた」のまま)。⇒ §11 の「⛔ 主人公の札の書式」は、**頭が NPC のとき `#warriorLabel` に段を足す分だけ**上書きされる(主人公が頭のときの書式・`#warriorName` の文字は 1 文字も変えていない)。

- 書く所は `paintHeadClassLine` の 1 つだけ。呼び口 = 起動時(`headDisplayName` を `#warriorName` へ書いた直後)と頭の委譲 `tryPromoteNewHead`(同)の 2 か所。
- **毎回作り直す**: `#warriorLabel` 直下の `.labelClass` を全部消してから、条件が立つときだけ付ける。段は `#warriorName` の兄弟なので `#warriorName.textContent` の上書きでは消えない ⇒ 明示的に消す(消さないと委譲で NPC→主人公 のとき段が残る)。
- 「NPC」の条件 = **名前のある仲間**(委譲: `!nh.isHero && !!nh.npcName` / 起動: `!headMember.isHero && !!headMember.name`)= `createAllyDom` と同じ。⚠ probe の 1 回目は `!isHero` だけで書いており、**委譲で従者 `servant`(`isSummon` でない = 頭になれる)やゴーレムが頭になると「(ゴーレム兵)」が付いた**(probe で発見 → 直した)。名前の無い頭は `headDisplayName` が既に職業名なので付けない。
- `?classline=0` で頭の段も付かない。職業名は `CLASS_DEFS[classKey].name`。

#### (0b) の判断

**言い直した。** K5 のとおり旧 (0b) は `PM_CLASS_EMOJI` の表しか読まず #86 の後も緑のままだが、(0b) の役目は「(1a) の期待値の母集団が 4 種そろっている」装置であり、(1a) の期待値がアイコンから職業名へ替わった以上、装置も同じ値(`PARTY_SLOTS` から引いた職業名が 4 種)を見ないと (1a) を守らない。アイコンの旧挙動は新規受入 §3 (`?classline=0`) が見る。
- (1a) = `.labelClass` がちょうど 1 枚・文字が `"(" + PARTY_SLOTS の職業名 + ")"`・札のテキストがその席の名前を含む。期待値は `readSeats` 内で **`PARTY_SLOTS.find` をドライバが自分で**引く(`recruitClassLabel` を呼ばない)。
- 言い直し前に素を走らせて **(1a) だけが赤**(30/31・「イグナツ(僧侶)」に ✨ が無い)を確認 → 言い直し後 31/31。`(5c-1) ?patronlabel=0` は不変。

#### probe(実装窓 scratchpad `item2/probe86i2.js`・port 10612・本番をそのまま測る = 注入なし)

- 酒場 desktop / compact × 4 席(左向き B・D を含む): 段の文字 = `PARTY_SLOTS` の職業名で全一致、札にアイコン無し、段の下端 = 札の上端 + 枠(0.825 / 0.674)、横中心 ±1px 内、**段の実効横倍率が正**(+0.825 / +0.674 = 鏡文字でない)、札の高さ = `?classline=0` と一致(16.5 / 12.637)。
- 約束 → 取り消し(`DFRecruits.add` + `refreshPatronLabelFor` → `doPromiseDrop`): 約束中「🤝 アデラ(戦士)」(🤝 先頭・段 1 枚・`.promised`)→ 取り消し後「アデラ(戦士)」(段 1 枚が残る)。高さ不変。
- `tavern.html?classline=0`: 4 席とも「🗝️ クヌート」型(`PM_CLASS_EMOJI + " " + 名前`)に**完全一致**・段 0 枚・約束中は「🤝 🗝️ クヌート」。pageerror 0。
- ダンジョン(`labelSmall`): 直起動(主人公が頭)= NPC 3 人の札に段(「トルガ(エルフ)」等)、`#warriorLabel`「あなた」段なし。召喚(ゴーレム兵)・従者(商人の従者)の札に段なし。敵の札の段 0。札の高さはどの札も 14.375 で `?classline=0` と一致。
- [戦士 NPC イレーナ, 僧侶 NPC ヨナ, 魔法使い=主人公]: `#warriorLabel`「イレーナ」+ 段「(戦士)」、主人公の札「魔法使い（あなた）」段なし。委譲 → ヨナ「(僧侶)」へ付け替え → 主人公「あなた」で**段が消える** → ゴーレム兵 段なし。`#warriorLabel` の高さは全段階 14.375。
- [戦士=主人公, ドワーフ NPC, 魔法使い NPC]: 頭「あなた」段なし → 委譲でダグ「(ドワーフ)」→ オズ「(魔法使い)」(段は常に 1 枚)。
- `index.html?classline=0`: どの編成・委譲でも `.labelClass` 0 個。

#### 変異アンカーと行末

- `tools/*.js` の全文字列リテラル(8 字以上)を `d5f2dff` と作業ツリーの `tavern.html` / `index.html` で数え比べ(`item2/anchors_diff.py`): **0 件 / 1 件だったリテラルの件数が変わったものは 0**(増えたのは `'function'` `'.patronLabel'` `'pointer-events: none;'` 等の汎用語だけ)。名指しのアンカー(tavern `z-index: 3; …[#57]` / `el.appendChild(lb);` / `if (isPatronLabelOn() && seatMember) {` / index `    .enemyLabel {` / `    body.labelSmall .enemyLabel {` / `lb.appendChild(st);` / `if (NAME_LABEL_ON) …labelSmall…`)はすべて 1 件のまま。
- 行末(`py` のバイト数え): `tavern.html` CRLF 11392 / LF のみ 0、`index.html` CRLF 41390 / LF のみ 0、`tools/verify_hold_person.js` は元から LF(0 / 1072)。

#### 名指し golden(実装後・逐次・本番ツリー)— 着手前(§12-0)と同色

| 本 | 素 | `--negative` |
|---|---|---|
| `verify_hold_person` | 0 / 31/31(言い直し後) | 0 / 8 本すべて担当が赤・空振り 0 |
| `verify_party_promises` | 0 / 35/35 | 0 / 9 本すべて担当が赤・空振り 0 |
| `verify_member_identity` | 0 / 28/28 | (省略 — 着手前 0。下) |
| `verify_enemy_name_label` | 0 / 30/30 | 0 / 58/58 |
| `verify_walk_block` | 1 / 22/23(赤 = (3d) のみ・着手前と同じ型3) | 0 / 54/54 |
| `verify_npc_crowd` | 0 / 33/33 | (省略) |
| `verify_recruit_talk` | 0 / 25/25 | (省略) |
| `verify_tower_mother_b` | 0 / 22/22 | **省略**(70 分) |

`--negative` の省略理由: `verify_tower_mother_b` の変異アンカー(塔の母の `towerMotherActive` / `towerMotherHolds` / `markTowerMotherHome` / `TOWER_MOTHER_ROW_Y` ほか)は #86 の差分の領域に 1 つも当たらず、上のアンカー件数比較でも件数変化 0。`member_identity` / `npc_crowd` / `recruit_talk` の `--negative` も同じ比較で件数変化 0 ⇒ 項目4 の母集団(post85 の名簿に全部入っている)で回す。

#### 崩れ(項目2 で見つかったもの)

- **K12(直した)頭の段の条件は `!isHero` だけでは足りない。** 委譲で従者 `servant` は頭になれる(`pickNextHeadIndex` は `isSummon` だけを除く)。⇒ 条件を「名前のある仲間」へ揃えた(上)。項目3 の受入は委譲先に従者を置いた腕で「段なし」を見ること。
- **K13(項目3 向け)段の下端は全面で「札の上端 + 枠の太さ」**(酒場 +0.825 / +0.674、ダンジョン +1.000・`#warriorLabel` も +1.000)= §12-0 K3 どおり。(1c)(2d) の許容は枠の実測から導出すること。

### 12-2. 受入(項目3・基準 `ee203cd`)

2026-10-06(実装窓・dev-loop 項目3)。新規 `tools/verify_class_line.js`(LF)。本番(`index.html` / `tavern.html` / `audio.js` / `js/*`)は 1 バイトも触っていない。push していない。

#### 装置

- port = **10574**(素)/ 変異 **10575〜10585**(11 本・`MUTATIONS` の並び順・1 変異 1 port)。ERR_UNSAFE_PORT なし。8765 は使っていない。
- `tavern.html` / `index.html` は起動時に 1 回読んで凍結し、変異はメモリ上で差し替えて配る(配信スナップショットへの実行時注入)。起動時の検算 = 注入点が原本でちょうど 1 件・注入文字列が原本に無い・行数不変・**他の `tools/*.js` に同じアンカーが無い(罠E)**。崩れたら exit 3。
- 酒場 4 腕 = desktop 1280×900 / compact 390×844 × (素 / `?classline=0`)。ダンジョン 4 腕 = 2 編成 × (素 / `?classline=0`)(K10 = `partyMembers` を自分で仕込む):
  - **N** = [戦士 NPC イレーナ, 僧侶 NPC ヨナ, 魔法使い=主人公] … 頭が NPC・主人公の札「魔法使い（あなた）」が仲間の列に居る
  - **H** = [戦士=主人公, ドワーフ NPC ダグ, 魔法使い NPC オズ] … 頭が主人公・NPC 仲間 2 人
  - 両方とも起動後に本番の factory でゴーレム兵・従者(`createAlly` + `createAllyDom`)と見える敵 1 体(`createEnemy` + `createEnemyDom`・`everSeen`)を足し、`tryPromoteNewHead` を直接呼んで**頭を全員ぶん委譲**する(N: イレーナ → ヨナ → あなた → ゴーレム兵 → 商人の従者 / H: あなた → ダグ → オズ → ゴーレム兵 → 商人の従者)。⇒ K12 の「委譲先が従者」の段階を必ず含む。
- 職業名の期待値はドライバが `PARTY_SLOTS` / `CLASS_DEFS` のデータから引く(`recruitClassLabel` を呼ばない)。

#### assert(18 本)

| 節 | 何を見るか |
|---|---|
| (0a) | [装置] 酒場 4 腕で札 4 枚・classKey 4 種・左向きの席 = patronB / patronD |
| (0b) | [装置] ダンジョン素 2 腕で NPC 仲間 ≥2(実測 3)・主人公 ≥1・ゴーレム兵 ≥1・従者 ≥1・見える敵 ≥1、N の頭 = NPC・H の頭 = 主人公、委譲に NPC→NPC / 主人公→NPC / →主人公 / →従者 / →ゴーレム兵 が全部在る |
| (0c) | [装置] pageerror 0(8 ページ) |
| (1a) | ★★ 酒場 desktop / compact × 4 席で段がちょうど 1 枚・`"(" + PARTY_SLOTS の職業名 + ")"` |
| (1b) | 札の高さ = `?classline=0` の同じ画面・同じ席(±0.5px)(16.5 / 12.637) |
| (1c) | 段の下端 ≤ 札の上端 + `border-top-width` × 実効の縦倍率 + 0.5px(K3/K13)・段の上端 < 札の上端・横中心 ±1px |
| (1d) | 札の文字に `PM_CLASS_EMOJI` のアイコンが無い(初期 8 + 約束中 / 取り消し後 16 + 解散後 8 = 32 観測) |
| (1e) | 最悪の組(4 席を `patronLabelPaint` で「ガウェイン」+ mage へ描き直し、🤝 を前置)で A-B・C-D の札 / 段の矩形が重ならない(desktop / compact)。形の確認(段が「(魔法使い)」・文字が「🤝 ガウェイン」で始まる)を併設 |
| (1f) | 4 席の 約束(`DFRecruits.add` + `refreshPatronLabelFor`)→ 取り消し(`doPromiseDrop`)と、2 席約束 → `doPromiseDisband` の後も段がちょうど 1 枚・文字が正しい・約束中は 🤝 で始まり・解くと 🤝 なし(20 観測) |
| (1g) | 左向きの席の段の実効の横倍率が正(+0.825 / +0.674・符号で見る) |
| (2a) | ★★ NPC 仲間の札(ヨナ / ダグ / オズ)で段がちょうど 1 枚・`"(" + CLASS_DEFS[classKey].name + ")"` |
| (2b) | 主人公の札・ゴーレム兵 / 従者の札・見える敵の札・`.enemyLabel` 全体に段 0 |
| (2c) | NPC 仲間の札の高さ = `?classline=0` の同じ仲間、かつ同じ腕の主人公 / 敵(/ 頭が主人公なら頭)の札と同じ(±0.5px)(全部 14.375) |
| (2d) | NPC 仲間の段の下端 ≤ 札の上端 + 枠 + 0.5px(実測 +1.000 / 許容 +1.5)・上端 < 札の上端・横中心 ±1px |
| (2e) | [K1] 頭が NPC の段階(N 起動時・N→ヨナ・H→ダグ・H→オズ = 4 段階)で `#warriorLabel` の段がちょうど 1 枚・`"(" + CLASS_DEFS[頭].name + ")"`・札の上に乗る・高さ = `?classline=0` の N 起動時の頭 |
| (2f) | [K1/K12] 頭が主人公 / ゴーレム兵 / 従者の段階(H 起動時ほか 6 段階・従者 2 回を含む)で `#warriorLabel` の段 0 |
| (3a) | `tavern.html?classline=0`: 4 席 × 2 画面が `PM_CLASS_EMOJI + " " + 名前` に完全一致・段 0、約束中は `"🤝 " + それ` に完全一致 |
| (3b) | `index.html?classline=0`: 2 編成の起動時と委譲の全 5 段階で文書中の `.labelClass` 0・仲間の札も 0 |

#### 負のコントロールの担当(`--mutate` で実走して決めた)

| 変異 | 注入 | 依頼書 §8 の予想 | 実走の担当 | 予想より広い理由 |
|---|---|---|---|---|
| `inline` | 段の規則(酒場・ダンジョン)へ `display:block; position:static; transform:none`(K2 = absolute を外すだけでは高さが変わらない) | (1b)(1c)(2c)(2d) | **(1b)(1c)(2c)(2d)(2e)** | `#warriorLabel` も `.allyLabel` = 同じ規則で頭の箱が 14.375 → 21.563。⚠ (1e) は緑(縦に伸びるだけで隣と重ならない) |
| `paintonce` | 段を初回の `patronLabelPaint` でだけ足す | (1f) | **(1e)(1f)** | (1e) の描き直し = 2 回目の描画で段が消える |
| `classfirst` | `prepend` | (1f) | **(1e)(1f)** | (1e) の文字が「(魔法使い)🤝 ガウェイン」 |
| `wrongclass` | 隣の席の classKey | (1a) | **(1a)(1f)** | (1f) も段の文字を期待値と突き合わせる |
| `emojistay` | 段 + アイコンも残す | (1d) | **(1d)(1e)** | (1e) の文字が「🤝 🔮 ガウェイン」 |
| `heroclass` | `if (CLASS_LINE_ON) {` | (2b) | (2b) | — |
| `mirror` | 段に `scaleX(-1)` | (1g) | (1g) | — |
| `deadswitch` | `?classline=0` を無視(両ファイル) | (3a)(3b) | (3a)(3b) | — |
| `headnone`(K1) | 頭の札に段を付けない | (2e) | (2e) | — |
| `headstale`(K1) | 委譲で `paintHeadClassLine` を呼ばない | (2f) | **(2e)(2f)** | NPC→NPC の委譲で前の頭の「(戦士)」が残る(「ヨナ(戦士)」) |
| `headany`(K1/K12) | `!isNpcHead` の条件を外す | (2f) | (2f) | — |

「確率で赤」はどの変異にも無い(固定の編成・固定の最悪の組から測るので決定的)。

#### 実走(本番ツリー・逐次)

| 走らせ方 | 結果 | 所要 |
|---|---|---|
| 素 ×3 | 3 回とも exit 0 / **18/18** | 14.3 / 14.7 / 14.4 秒 |
| `--negative` ×2 | 2 回とも exit 0 / 素 18/18 + **11/11 本すべて担当が赤・担当外の赤 0** | 165.3 / 165.4 秒 |

#### 崩れ(項目3 で見つかったもの)

- **K14(予想の訂正)** 依頼書 §8 の担当表は 5 本で狭かった(上の表)。どれも本物の検出か連鎖で、担当外の赤ではない。
- **K15(K11 の確認)** compact で patronA の札は画面の左外(left −102.4px)のままだが、(1e) は矩形の幾何だけで判定するので影響しない(compact の A-B の札-札の隙間 25.33px・desktop 23.92px = §12-0 の実測と一致)。`elementFromPoint` 系は使っていない。
- 本番の欠陥は見つからなかった。

#### 次

- 次の新規ドライバ base = **10586**(使った最大 port 10585 + 1)。
- 項目4 の母集団に足す腕 = `verify_class_line`(素 約 15 秒 / `--negative` 約 2.8 分)+ `verify_walk_block --negative`(§12-0)。

### 12-3. 母集団の非退行(項目4)

本番ファイル(`index.html` / `tavern.html` / `audio.js` / `js/*`)と `tools/*` は 1 バイトも触っていない(直し 0)。基準 HEAD `1eaf8c4`(本番の配信物は `ee203cd` と同じ)。

#### 腕と走らせ方

- **211 腕** = #85 の `post85`(208 腕)+ ① 新規 `verify_class_line` 素 ② 同 `--negative` ③ `verify_walk_block --negative`(post85 の名簿に無かった・§12-0)。着手前の色は §12-0 のとおり `post85.tsv` を流用した(`345d0f7` / `cdebd24` で配信物と `tools` のツリー OID が同じ ⇒ 走査し直さない)。
- `--negative` の追加はこの 2 腕だけ。`cdebd24..HEAD` の差分領域(差分を含む関数 `createAllyDom` / `tryPromoteNewHead` / `patronLabelPaint` + 各 hunk ±40 行)に `--negative` を持つ本の文字列が当たるかを洗った(実装窓の scratchpad `item4/anchorsfn86.py` → `anchorsfn86.out`)。意味のある当たりは `verify_hold_person` / `verify_party_promises` / `verify_enemy_name_label` / `verify_member_identity` ほか**名簿に `--negative` 腕が既に在る本**と新規の `verify_class_line` だけで、名簿に無い本の当たりは罫線 `═══` / `dragonfighters.` / `document.body.appendChild(el);` などの偽の当たり ⇒ 追加不要と判定。
- 直列・SKIP 再開型の走行器(`sweep_86post.py` = `sweep_85post.py` の写し)。git を読む本(`root` が `clone` / `fix` の 32 腕)は `--shared` clone `clone86`(`1eaf8c4`)で、残り 179 腕は本番ツリーで走らせた。⛔ `auto_debug_run` / `probe_magehand_reach` は走査していない(#80 からの決定・§12-0)。試遊サーバ 8765 には触れていない。
- **所要 564.6 分**(腕あたり 2.68 分)。2026-10-06 10:19 開始 → 12:22 に PC 更新のため **71 腕で一時中止**(72 腕目 `driver_monsters_hobgoblin` の途中)→ 2026-10-08 21:04 に SKIP 再開(「RESUME: 71 arms already done」)→ 10-09 04:29 完了(再開後 444.2 分)。中止中の腕は再開時に頭から走り直しており、結果の欠けは 0(`missing []`)。
- 対比較 10 走行 108.7 分(下)。

#### 結果(同じ 208 腕 + 新規 3)

| | 腕数 |
|---|---|
| 緑(着手前 → 実装後) | 181 → 183(+新規 3 = **186 / 211**・非緑 25) |
| **緑→赤** | **1**(`driver_field_step0`) |
| 赤→緑 | 3(`driver_monsters_hobgoblin` 12/14 → 14/14 / `driver_speech_engine` 16/17 → 17/17 / `driver_wall_props` 28/29 → 29/29 = #83 / #85 の項目4 で揺れと判定済みの本) |
| 両方非緑 | 24(着手前と同じ顔ぶれ・同じ exit。§12-0 の非緑 27 腕から上の赤→緑 3 本を除いたもの。`driver_mine_wall` は 64/66 → 65/66 で非緑のまま) |
| 新規 | `verify_class_line` 素 **18/18** exit 0(15.0 秒)/ 同 `--negative` exit 0(166.1 秒・11 変異すべて担当が赤)/ `verify_walk_block --negative` **54/54** exit 0(50.0 秒・§12-0 の着手前と同じ) |

- **名指し golden 8 本(§8)は全部着手前と同色**(`post86.tsv` の行で確認):

  | 本 | 素 | `--negative` |
  |---|---|---|
  | `verify_hold_person` | 0 / 31/31(clone) | 0(clone) |
  | `verify_party_promises` | 0 / 35/35 | 0(546.2 秒) |
  | `verify_member_identity` | 0 / 28/28 | 0 |
  | `verify_enemy_name_label` | 0 / 30/30 | 0 / 58/58 |
  | `verify_walk_block` | **1 / 22/23**(赤 = (3d)・着手前から同じ型3・clone) | 0 / 54/54(新規腕) |
  | `verify_npc_crowd` | 0 / 33/33 | 0 / 58/58 |
  | `verify_recruit_talk` | 0 / 25/25 | 0 |
  | `verify_tower_mother_b` | 0 / 22/22 | 0(4149.7 秒) |

  (`--negative` の要約行に出る「30/31」「6/10」などは最後に走った変異の行で、exit 0 = 全変異が担当どおり赤。)
- `driver_mapdef_step1` 207/208 は着手前と同じ(clone で走るため (0b) の固定パスが `git worktree list` に無い環境要因・#80 K25)。

#### 緑→赤と帰属(#86 帰属 0・直し 0)

対比較 = 本番 HEAD `1eaf8c4` ↔ 影 `shadow86`(本番の実体コピーで `index.html` / `tavern.html` だけ `cdebd24` の CRLF 版 = #86 が変えた配信バイトだけを戻した木・`mkshadow_86.py`)を交互に 5 対(実装窓の scratchpad `item4/pairs_g2r/pairs.tsv`)。

| 本 | 走査での赤 | 本番 5 走行 | 影 5 走行 | 判断 |
|---|---|---|---|---|
| `driver_field_step0` | (2e-desktop)「3 ウェーブ完走」`waves=2/3 reason=gameOver`(32/33)= 隊商護衛のオートプレイで PT が 2 ウェーブ目に全滅 | **5/5 緑**(33/33・519〜772 秒) | **5/5 緑**(33/33・648〜754 秒) | 揺れ |

- 届く経路: (2e) は「母集団がクエスト全体を覆っている」ことを見る装置 assert で、全滅は戦闘の乱数。#86 の差分は札の DOM(`.labelClass` の span 1 枚・絶対配置で札の箱の大きさ不変 = §12-1 / §12-2 (1b)(2c))と頭の札の段だけで、戦闘・AI・HP・移動の値には触れない。
- #85 の項目4 では同じ `driver_field_step0` が**逆向き(赤→緑)**に揺れていた(#83 の項目4 では緑→赤)= 着手前から非決定の本。
- ⇒ 本番の欠陥でも golden の腐った前提でもないので直さない。

#### 作業コピー(削除はユーザー判断・実装窓の scratchpad `…/4a3c9bb1-3cff-4574-b3f0-3e1a9f632119/scratchpad/item4/`)

`clone86` **229MB**(`1eaf8c4`・`--shared`)/ `shadow86` **291MB**(`index.html` / `tavern.html` だけ `cdebd24`)= 計 約 520MB(`du -sh` 実測)。結果は `run_post86/post86.tsv`・比較は `cmp_86.out`・対比較は `pairs_g2r/pairs.tsv`・アンカー判定は `anchorsfn86.out`。

### 12-4. 締め

- **本番**: `ee203cd`(項目2: 酒場の頭上札 + ダンジョンの NPC 仲間の札 + 頭が NPC のときの `#warriorLabel` に職業の段・撤退 `?classline=0`・changelog・`verify_hold_person` (0b)(1a) の言い直し)。**受入**: `1eaf8c4` `tools/verify_class_line.js`(18 assert・素 約 15 秒 / `--negative` 11 変異 約 166 秒・port 10574 / 10575〜10585)。**項目4**: 211 腕で #86 帰属の緑→赤 0・本番の直し 0。
- **撤退**: `?classline=0`(酒場は #57 の「🗡️ ニカ」1 行・ダンジョンは名前だけの札へ戻る)。

#### 崩れた主張(K1〜K15)

| | 中身 |
|---|---|
| K1 | `#warriorLabel` は「戦士」固定ではない(起動時に `headDisplayName` で上書き = 主人公なら「あなた」・NPC が頭ならその名前)⇒ ユーザー決定 (b) 頭が NPC のときだけ段を付ける |
| K2 | 罠 A の「普通の行にすると箱の高さが変わる」は半分だけ(`nowrap` なので inline は横に伸びるだけ)。高さが変わるのは段が block のとき |
| K3 | (1c)(2d) の許容「札の上端 + 1px」はダンジョンで余裕 0(段の下端 = 札の上端 + 枠の太さ)⇒ 許容は枠の実測から導出 |
| K4 | §2-4「札の文字を読む本は 5 本」→ 4 本(`verify_walk_block` は敵の札しか読まない) |
| K5 | `verify_hold_person` (0b) は実装しても赤くならない(必ず赤は (1a) だけ) |
| K6 | (軽微)変異アンカー 0 本は実質で成立(`nameSpan.textContent = ` の 1 件は敵の札)。隣接する既存アンカーを写さないこと |
| K7 | (軽微)§2-1 の 7320 は `refreshPatronLabelFor` ではなく `doPromiseDisband` の直呼び。罠 B の設計は不変 |
| K8 | (§9 向け)酒場の段は舞台ごと縮尺され、画面上は compact で ≈ 6.3px |
| K9 | (参考)札にはもう `title = recruitClassLabel(classKey)`(PC のホバーで職業名) |
| K10 | (受入の作り方)直起動では主人公の ally・召喚・従者が居ない ⇒ `partyMembers` を仕込み、召喚・従者は factory で足す |
| K11 | (参考)compact の酒場では patronA の札が画面の左外(left −102px) |
| K12 | (直した)頭の段の条件は `!isHero` だけでは足りない(委譲で従者・ゴーレム兵が頭になる)⇒「名前のある仲間」へ |
| K13 | (項目3 向け)段の下端は全面で「札の上端 + 枠の太さ」(+0.825 / +0.674 / +1.000) |
| K14 | (予想の訂正)§8 の変異の担当表は 5 本で狭かった(`--mutate` の実走で広げた) |
| K15 | (K11 の確認)compact の patronA は画面外のままだが (1e) は矩形の幾何だけで判定するので影響なし |

#### 依頼書からの逸脱(D1〜D5)

- **D1** §11「⛔ 主人公の札の書式」を、**頭が NPC のときだけ** `#warriorLabel` に職業の段を足す分だけ上書きした(K1・ユーザー決定 2026-10-06 (b))。書く所は `paintHeadClassLine` 1 つ・呼び口は起動時と委譲 `tryPromoteNewHead` の 2 か所。頭が主人公のときの書式・`#warriorName` の文字は不変。
- **D2** 受入に §8 の表に無い節と変異を足した: (0c) pageerror 0 / (2e)(2f) 頭の札(K1)/ 変異 `headnone` / `headstale` / `headany`(頭の札の 3 本)。
- **D3** §8 の変異の担当表を実走(`--mutate`)で広げた(K14: `inline` → +(2e) / `paintonce`・`classfirst` → +(1e) / `wrongclass` → +(1f) / `emojistay` → +(1e) / `headstale` → +(2e))。変異 `inline` は K2 のため「`position:absolute` を外す」でなく「`display:block; position:static`」で作った。
- **D4** (1c)(2d) の許容を固定の +1px でなく「札の上端 + `border-top-width` × 実効の縦倍率 + 0.5px」= 枠の実測から導出した(K3 / K13・本番の CSS は測定に合わせて変えていない)。
- **D5** `verify_hold_person` (0b) は「必ず赤」ではない(K5)が、(1a) の装置として職業名へそろえて言い直した。項目4 の着手前の色は走査し直さず `post85` を流用(配信物のツリー OID が同じ)。

#### §9 実機/目視の宿題(ユーザー担当)

- iPhone 縦(compact)の酒場で、4 人の上の「(魔法使い)」などが読めるか(画面上 ≈ **6.3px** = K8)。
- ダンジョンの札は `body.labelSmall` で 70% ⇒ 段は ≈ **6.5px**。読めなければ §9 のとおり font-size だけ上げる(箱の外なので他の golden は動かない)。
- **頭の札**(`#warriorLabel`)の段の見え方: 主人公が前衛でない編成(魔法使い・僧侶・エルフ・盗賊)で頭の NPC の上に「(戦士)」が出るか、頭が替わったとき段が正しく付け替わる / 消えるか。
- 段が席札(卓の名札)や上の仲間のスプライト・HP バーに被って見えないか。
- `?classline=0` で今の姿へ戻ること。⚠ ローカルは http 起動が必須。

#### 次

- 次の新規ドライバ base = **10586**。
- 作業コピー `clone86`(229MB)+ `shadow86`(291MB)の削除はユーザー判断(§12-3)。
- 別チケット候補: (揺れ)`driver_field_step0` (2e-desktop) は隊商護衛のオートプレイの全滅で揺れる装置 assert(#83 で緑→赤・#85 で赤→緑・#86 で緑→赤)= 全滅の走行を引き直すか、全滅を母集団から除いて数える形へ。
