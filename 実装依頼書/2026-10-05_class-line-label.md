# #86 名前札の職業を文字で — 「(戦士)」の段を名前の上に

- **起草**: 2026-10-05(計画窓) / **ステータス**: **承認済**(2026-10-05 ユーザー承認)
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

(実装窓が埋める)
