# #86 名前札の職業を文字で — 「(戦士)」の段を名前の上に

- **起草**: 2026-10-05(計画窓) / **ステータス**: **承認済**(2026-10-05 ユーザー承認)・**実装中(項目1/4)**(2026-10-06・基準 `cdebd24`・§12-0。⚠ K1 = 頭の NPC の札の扱いはユーザー判断待ち)
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
