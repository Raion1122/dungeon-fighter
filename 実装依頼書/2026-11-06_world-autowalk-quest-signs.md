# #109 ワールドマップ — 遠くを 1 回押せば着くまで歩く + 札は受注中の行き先と街だけ

- **起草**: 2026-11-06(計画窓) / **ステータス**: **承認済**(2026-11-06 ユーザー承認)
- **触るファイル**: `world.html` / `tools/verify_world_autowalk.js`(新規)/ 言い直しが要る既存 golden(§2-6)/ `js/changelog.js`(任意・§10)
- ⛔ **触らないファイル**: `js/world-map.js`(NODES / EDGES / STEPS / SITES / UNLOCK は 1 バイトも変えない。`(4a)` 系が sha1 で恒等固定)・`js/road-events.js`・`index.html`・`tavern.html`
- 並走: 2026-11-06 時点で別窓の未コミット差分は無い(`git status` クリーン・HEAD `b86e1cd`)。それでも **ファイル単位 add**・`git diff --cached <file>` を読んでから commit。

---

## 1. 目的

ワールドマップは #40 から「1 タップ = 経路上の次の 1 点まで」で、遠くの拠点へ行くには同じ所を何度も押す必要がある(phlan → temple は 11 ホップ = 11 タップ)。
また、解放済みの拠点にはすべて羊皮紙の札が立つので、受けていない依頼の地の札まで並び、どこへ向かえばいいかが埋もれる。

**ユーザー要望(2026-11-06)**:

1. **遠くの点を 1 回タップしたら、そこまで自動でコマを進める。** 道中の出来事(街道の出来事・襲撃)の選択肢はその都度出してよい = 出来事が開いたら止まり、閉じたら続きを歩く。
2. **札は受注中の依頼の行き先だけに出す。** 受注していない行き先には出さない。**ただし街(港町フラン)の札は常に出す。**

**この窓の決定(既定が明らかなので聞かずに決めた。違えば該当節だけ差し替える)**:

- 「受注中」の判定 = **`questDest`(sessionStorage)**。封蝋(#64)・入場確認(#23)と **同じ式** にする → 「札が立つ ⟺ 封蝋が付く ⟺ 押して入れる」。
  ⛔ 器 `activeQuest`(localStorage)では判定しない(#64 §2-4 の罠 B と同じ理由 = タブを開き直すと「札はあるのに入れない」が起きる)。
- 「街」= **SITES に居ない拠点**(今日は `phlan` だけ)。⭐ 規則で書くので、将来 SITES に居ない街を足せば自動で札が立つ。
  `village_s`(南の村)/ `lakeside`(湖畔の集落)/ `pier`(港の倉庫街)は名前は集落だが **依頼の地**(SITES に居る)なので、受注していなければ札は出ない。
- 不採用: 「受けられる依頼の地は全部出す(今日どおり)」= 要望の否定 /「歩き出したら途中で止められない」= 別の点を押せば行き先が差し替わる今日の挙動を残す。

---

## 2. 着手前の実測(2026-11-06・HEAD `b86e1cd`)

### 2-1. 1 タップ = 1 ホップの核心は 1 行

| ファイル:行 | 何 |
|---|---|
| `world.html:1552` `goToPoint(id)` | 押し口(拠点 `click` → `goToNode` → ここ / 刻み点 `click` → ここ)。全部ここへ合流 |
| `world.html:1556` | `walkStepOff ? WM.findPath(...) : WM.findWalkPath(...)` |
| `world.html:1561` | ★ `var hop = walkStepOff ? path : path.slice(0, 1);` ← 1 ホップ制限 |
| `world.html:1563-1567` | `walkPath(hop, …)` の到着で `elGoal` を(着いていれば)消し `onArriveStep(last, id)` |
| `world.html:1523` `onArriveStep(atId, destId)` | 着いた点で ①押した行き先の拠点なら入場(`onArriveNode`)②襲撃 `maybeRoadAmbush` ③街道の出来事 `maybeRoadEvent`。**今日は戻り値なし** |
| `world.html:1180` `walkPath(ids, onArrive)` | 先頭で `stopWalk()` = **別の点を押せば今の歩きは打ち切られる**(今日の挙動・残す) |

撤退 `?walkstep=0`(#40)はすでに「経路全部を 1 回で歩く」が、**出来事を 1 回も振らない**(`maybeRoadEvent` / `maybeRoadAmbush` の先頭 `if (walkStepOff) return false;` = `world.html:1344` / `:1441`)。だから「`walkStepOff` を既定にする」では要望 1 の後半(出来事はその都度)を満たさない。

### 2-2. ⚠⚠⚠ 罠 A — 「出来事が閉じたら続きを歩く」の再開口は 1 つしか無い

- 街道の出来事: `open` → 選択 → `finishRoadEvent`(`world.html:1378`)→ **`RE.showResult(ev, text, null, boon)`**(同関数の末尾)。
  `js/road-events.js:675` `showResult(ev, text, onDone, boon)` は「先へ進む」ボタンで `close(); onDone()` を呼ぶ。**今日は `onDone` が `null`**。
  → 再開はこの `null` を「続きを歩く関数」へ差し替える **1 か所だけ**。⛔ `js/road-events.js` は触らない。
- 襲撃: 戦う枝は `location.href = "index.html"` でページを去る(`world.html:1491`)。world に残る枝(逃げる等)があれば、その結果の「先へ進む」でも再開する(実装窓が `onAmbushChoice` / `finishRoadAmbush` の枝を読んで全部に付ける)。
- **出来事が開かなかった点**では止まらずそのまま次へ。

### 2-3. ⚠⚠⚠ 罠 B — 古い歩きの「続き」が新しい行き先を上書きする

歩いている途中に別の点を押す / 出来事の再開関数が後から呼ばれる と、**前の行き先へ向かう続き**が走って新しい行き先を奪う。
→ `goToPoint` ごとに **歩きの番号(トークン)** を 1 つ進め、続きは「自分の番号がまだ最新のときだけ」動く。
⭐ §8 の変異 `staletoken` として装置に内蔵する。

### 2-4. ⚠ 罠 C — 中継の拠点で入場させない(#40 の 2026-09-01 実測の再来)

`onArriveStep` の入場は `lastArrival.arrived && WM.has(atId)` = **押した行き先に着いたときだけ**。自動で歩き続けても `destId` を元の行き先のまま渡し続ければ、通りすがりの `phlan`(`enter` を持つ唯一の点)で `town.html` へ飛ばない。
⛔ 続きのホップで `destId` を「次の 1 点」に書き換えないこと(変異 `passenter`)。

### 2-5. 札の出し方(今日)

| ファイル:行 | 何 |
|---|---|
| `world.html:1039` `isNodeRevealed(id)` | `questWalkOff` なら true / SITES に居なければ true(= phlan)/ それ以外は `WM.isRevealed(sc, clearedList)`(解放の鎖) |
| `world.html:1071-1072` | `shown = isNodeRevealed(id)`、`className = "worldNode worldNode-" + (site && shown ? "site" : "way")` |
| `world.html:1078` | `shown` のときだけ `title` 属性(hover で地名が漏れない) |
| `world.html:1082-1123` | `site && shown` のときだけ `.worldSign`(札)を el の 2 人目の子として足す。封蝋 `.worldSeal` は `questDest` 一致のときだけ札の子 |
| `world.html:1622` `__world.revealed()` | `isNodeRevealed` の結果をドライバへ出す |
| `tavern.html:8867` | `sessionStorage.setItem("dragonfighters.questDest", prepScenario.id)` = 出発時に書かれる唯一の口 |
| `world.html:1279` | 「入る」で `questDest` を消費する唯一の口 |

→ 札の条件を `isNodeRevealed(id)` から **新関数 `isSignShown(id)`** へ差し替える:

    /* ★[#109] 札を立てるか。⭐ 街 (SITES に居ない拠点) は常に立てる。
       依頼の地は「解放済み かつ 受注中の行き先」だけ。式は封蝋・入場と同じ (questDest)。 */
    function isSignShown(id) {
      if (!isNodeRevealed(id)) return false;
      if (questSignOff || questWalkOff) return true;     /* 撤退 = 今日の姿 */
      var sc = WM.scenarioOfNode(id);
      if (!sc) return true;                              /* 街 = phlan */
      return !!questDest && sc === questDest;
    }

⛔ `isNodeRevealed` と `__world.revealed()` は **意味を変えない**(解放の鎖の検査 = verify_quest_walk が握る)。札用に `__world.signed()` を **足す**。
⭐ 札の無い依頼の地は今日の「未解放」と同じ体裁(`worldNode-way` + `title` なし)。**当たり判定 44px と `data-node` / `data-kind` は変えない**(#23 罠 A)= 押せば今日どおりそこへ歩ける(入れはしない)。

### 2-6. 札・押し口を握る既存 golden(実測: `grep -c`)

| ドライバ | worldSign | questDest | goToNode/Point | 予想 |
|---|---|---|---|---|
| verify_world_map | 9 | 0 | 1 | ⚠ 札を押す・数える節が **questDest 無し**で走る → 札が phlan の 1 枚になり赤の見込み |
| verify_world_heromark | 16 | 0 | 1 | ⚠ 同上 |
| verify_world_steps | 18 | 0 | 4 | ⚠ 札 + **1 ホップ前提** (3a)(3c)(3d)(4b) と変異 `fullwalk` / `hopnone` が直撃 |
| verify_quest_walk | 18 | 48 | 2 | ⚠ 「.worldSign を DOM で数えて 7」(`world.html:1114` のコメント)= 解放済み全部を数えている |
| verify_quest_visibility | 8 | 22 | 1 | 封蝋の節は questDest あり。札の枚数を数えていれば赤 |
| verify_frost_hold / lost_cargo / silent_tomb / witch_hut | 2 / 2 / 2 / 4 | 1〜2 | 2〜5 | 自分の地の札を見る節が questDest 無しなら赤 |
| verify_road_events / road_boon / road_ambush | 0 | 2 / 2 / 9 | 4 / 3 / 2 | 札は見ない。**1 タップ = 1 ホップ**で停留所を数えていれば赤 |

⭐ 言い直しの方針(実装窓が項目 1 で 1 本ずつ実測して決める):
- **その節が「札そのもの」を測っている** → 期待値を新しい規則へ言い直す(phlan + 受注先)。
- **その節は札を「押す的」として使っているだけ** → 種まきに `?questsign=0` を足す(撤退で今日の姿)か、`questDest` を種まく。⛔ 期待値を緩めて通さない。
- **1 ホップ前提の節** → `?autowalk=0`(§7)を種まきに足して今日の姿で測る。自動歩行そのものは新ドライバが測る。
⚠ 言い直しは本数と節番号を §12 に全部書く。

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **`world.html` は鳴らない**。
ただしプレイヤーに見える変化なので、書ける要約は実在する。§10 の 1 行を入れる(ユーザーの「毎回更新」要望に沿う)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `world.html` | ① `goToPoint` を「点ごとに出来事を振り、開かなければ次のホップへ・開いたら止まって閉じたら続き」へ(トークン付き)② `isSignShown` を足して `buildNodes` の `shown` を差し替え ③ 撤退 2 本 ④ `__world` に `autoWalkOn()` / `walkToken()` / `signed()` を足す |
| `tools/verify_world_autowalk.js` | 新規受入。port base **10720** |
| 既存 golden | §2-6 の方針で言い直し / 種まき |
| `js/changelog.js` | §10 |

⛔ `js/world-map.js` / `js/road-events.js` / `index.html` / `tavern.html` は開かない。

---

## 4. STEP1 — 自動で歩き続ける(`world.html` `goToPoint`)

方針: **1 ホップずつ歩く今日の仕組み(`world.html:1561` の 1 行)はそのまま**残し、着いた点で出来事が開かなかったら **自分で次のホップを呼ぶ**。`?autowalk=0` のときだけ「次のホップを呼ばない」= #40 の姿。

    var walkSeq = 0;                     /* ★[#109] 歩きの番号 (罠 B) */
    var autoResume = null;               /* 出来事が閉じたら呼ぶ続き。無ければ null */

    function goToPoint(id) {
      ...(今日どおり: 存在確認 / 同じ点なら onArriveNode / path が引けなければ false / elGoal を出す)...
      var my = ++walkSeq;
      autoResume = null;
      stepToward(id, my);
      return true;
    }
    function stepToward(id, my) {
      if (my !== walkSeq) return;                         /* 古い続きは捨てる (罠 B) */
      var path = walkStepOff ? WM.findPath(heroNodeId, id) : WM.findWalkPath(heroNodeId, id);
      if (!path || !path.length) return;
      var hop = walkStepOff ? path : path.slice(0, 1);    /* ⛔ 今日の 1 行のまま */
      var last = hop[hop.length - 1];
      walkPath(hop, function () {
        if (my !== walkSeq) return;
        if (last === id) elGoal.classList.remove("show");
        var opened = onArriveStep(last, id);              /* ⛔ destId は id のまま (罠 C) */
        if (last === id || walkStepOff || !AUTO_WALK_ON) return;
        if (opened) { autoResume = function () { stepToward(id, my); }; return; }
        stepToward(id, my);
      });
    }

- `onArriveStep` は **入場 / 襲撃 / 出来事のどれかを開いたら true** を返すよう直す(`maybeRoadAmbush` / `maybeRoadEvent` はもう boolean を返している)。
- `finishRoadEvent` の `RE.showResult(ev, text, null, boon)` の `null` を `function () { var f = autoResume; autoResume = null; if (f) f(); }` へ(罠 A)。襲撃で world に残る枝も同じ。
- ⛔ 歩く速さ `PX_PER_MS = 0.18` / `PX_PER_FRAME = 34` は動かさない。
- ⛔ 刻み点マーカー・`elGoal` の体裁は変えない。
- ⭐ 目的地に着いた後は今日どおり(拠点なら入場判定、刻み点なら止まる)。
- ⚠ 点ごとに `stopWalk()` → 次の `walkPath` で歩きアニメが 1 フレームだけ止まって見える可能性がある。目で気になるなら §9 で判断(⛔ 受入では測らない)。

## 5. STEP2 — 札は受注中の行き先と街だけ(`world.html` `buildNodes`)

§2-5 の `isSignShown` を `isNodeRevealed` の下に足し、`buildNodes` の `var shown = isNodeRevealed(id);` を `isSignShown(id)` へ。封蝋の条件式は変えない(札がある依頼の地 ⟹ 受注先なので必ず封蝋も付く。phlan には付かない)。

## 6. STEP3 — ドライバ用の窓

`__world` に `autoWalkOn()` / `walkToken()`(= walkSeq)/ `signed()`(= `Object.keys(NODES).filter(isSignShown)`)を足す。⛔ 既存のメンバは名前も意味も変えない。

---

## 7. 撤退スイッチ(2 本・独立)

- **`?autowalk=0`** — 1 タップ = 1 ホップ(#40 の姿)へ戻る。
- **`?questsign=0`** — 解放済みの依頼の地すべてに札(今日の姿)へ戻る。
- ⚠ 判定位置 = `world.html` の `?walkstep=0`(`world.html:1055` 付近)と同じ書き方。ページ遷移をまたぐ = **sessionStorage へ写す**(酒場 → 出発 → world の導線はクエリを持ち越せない・#12 の作法)。キーは `dragonfighters.autoWalkOff` / `dragonfighters.questSignOff`。
- ⛔ `?walkstep=0` / `?questwalk=0` / `?questmark=0` / `?roadevent=0` と相乗りさせない。

---

## 8. 受入条件 — `tools/verify_world_autowalk.js`(新規・port base 10720)

方針: 歩きは `__world.goToPoint` と **拠点 el の DOM クリック** の 2 経路で起こし、**`arrivalCount()` / `lastArrival()` / `heroNode()`** と **DOM の `.worldSign`** で突き合わせる。出来事は `?roadseed=N` で決定論にする。

### §0 装置

- **(0a)** phlan → temple の `findWalkPath` が 2 ホップ以上(遠い行き先が実在する。#42 実測 11)。
- **(0b)** 出来事が少なくとも 1 回開く seed を見つけてから §2 を測る(0 回なら exit 3 = 空振り)。
- **(0c)** `.worldSign` が 1 枚以上ある(phlan)。

### §1 自動歩行

- **(1a)** `?roadevent=0` で phlan から temple を **1 回だけ**押す → 待つ → `heroNode() === "temple"`、`arrivalCount()` = 経路のホップ数(= `findWalkPath` の長さ)。
- **(1b)** 着いた後に `askOpen()` が true(受注先なら)/ 受注先でなければ false。
- **(1c)** 途中に `phlan` を通る経路(pier → forest)で `location.pathname` が `world.html` のまま(罠 C)。
- **(1d)** 歩いている途中に別の点を押す → 最後に着いたのは **後から押した点**(罠 B)。

### §2 出来事で止まって続く

- **(2a)** 出来事が開いた時点で `isMoving()` false・`heroNode()` は経路の途中。
- **(2b)** 選択 → 「先へ進む」 → そのまま目的地まで歩いて着く(もう 1 回押さない)。
- **(2c)** 1 本の歩きの中で同じ点で 2 回開かない(`roadVisited` の今日の約束)。

### §3 札

- **(3a)** `questDest` 無し → `.worldSign` は phlan の 1 枚だけ、`signed()` も `["phlan"]`。
- **(3b)** `questDest = "goblin-mine"` → 札は phlan と mine の 2 枚、mine の札に `.worldSeal`。
- **(3c)** 札の無い解放済みの拠点(forest 等)も **押せば歩いて行ける**(`data-node` / 当たり判定は残る)が入場ダイアログは開かない。
- **(3d)** `revealed()` は今日と同じ集合(解放の鎖の意味は変えていない)。

### §4 撤退

- **(Xa)** `?autowalk=0` → 1 タップで `arrivalCount()` が 1 だけ増える。
- **(Xb)** `?questsign=0` → 札は今日どおり解放済み全部。
- **(Xc)** 2 本は独立(片方だけ立てても他方は新しい姿)。

### ⛔ 測らないこと

- 歩く速さ・カメラの追い方・点ごとの一瞬の止まり・札の見た目(目で動かす余地を残す)。

### 負のコントロール(`--negative`。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `onehop` | 自動の続きを呼ばない(今日の姿) | (1a)(2b) |
| `staletoken` | 続きでトークンを見ない(罠 B) | (1d) |
| `passenter` | 続きのホップで destId を次の 1 点へ書き換える(罠 C) | (1c) |
| `noresume` | `showResult` の onDone を null のまま(罠 A) | (2b) |
| `noeventstop` | 出来事が開いても止まらず歩き続ける | (2a) |
| `allsigns` | `isSignShown` を `isNodeRevealed` のまま | (3a)(3b) |
| `nophlan` | 街も受注判定にかける | (3a)(0c) |
| `deadnode` | 札の無い拠点の当たり判定を消す | (3c) |

### 既存 golden の非退行

§2-6 の表の 12 本 + 全数走査。⚠ 予想は 2026-11-06 の grep からの推定。**走らせて赤なら期待値を書き換える前に理由を突き止め、「言い直し / 種まき」のどちらにしたかを節番号つきで §12 に書く**。

---

## 9. 実機/実感の確認(ここが本当の受入)

- iPhone 縦: 遠くの拠点を 1 回押す → 止まらず歩く・出来事で止まる・「先へ進む」で続く、が気持ちよいか。点ごとの一瞬の止まりが目立たないか。
- 受注していない状態で地図を開いたとき、港町の札しか無くて迷わないか(迷うなら別チケット)。
- ⚠ ローカルは http 起動(file:// 直開きは音が出ない)。PC は Ctrl+F5。

---

## 10. changelog(`world.html` はフック対象外だが書く)

    py tools/add_changelog.py "<b>地図は 1 回押せば着くまで歩く</b> — 道中の出来事では立ち止まり、選んだら続きを歩く。札は受けた依頼の行き先と港町だけに。"

---

## 11. やらないこと

- ⛔ 歩く速さの変更・早送りボタン。
- ⛔ 受注していない行き先を「薄い札」で出す等の中間案(実機で迷ったら別チケット)。
- ⛔ 街(`town.html`)・酒場・闇市の地図の歩き方。
- ⛔ `js/world-map.js` の NODES / SITES / UNLOCK への変更(街の印フィールド等を足さない。街の判定は「SITES に居ない」の規則で足りる)。
- `実装依頼書/README.md` に足す行:

    | 109 | [2026-11-06_world-autowalk-quest-signs.md](2026-11-06_world-autowalk-quest-signs.md) | **承認済** | 0% | ワールドマップ: 遠くを 1 回押せば着くまで歩く(出来事で止まり「先へ進む」で続き)+ 札は受注中の行き先(`questDest`)と街(SITES に居ない拠点)だけ。⚠⚠ 再開口は `showResult` の onDone 1 か所 / 歩きのトークンで古い続きを捨てる / 続きでも destId を書き換えない(通りすがりの phlan で町へ飛ぶ)。撤退 `?autowalk=0` / `?questsign=0`。新 driver `verify_world_autowalk` port base 10720 |

---

## 12. 実装結果

### 12-1. 着手前の実測(項目 1)

測った日時 2026-11-06 18:20〜19:05・HEAD `383f9d0`。⭐ `git diff b86e1cd 383f9d0 --stat` = 依頼書と README の 2 本だけ ⇒ **`world.html` / `js/road-events.js` / `js/world-map.js` は起草時と 1 バイトも違わない**(§2 の行番号はそのまま有効)。

#### (1) §2 の前提の測り直し(`world.html`)

| 何 | 依頼書 | 実測 | ずれ |
|---|---|---|---|
| `goToPoint(id)` | :1552 | :1552 | なし |
| `walkStepOff ? findPath : findWalkPath` | :1556 | :1556 | なし |
| ★ 1 ホップ制限 `var hop = walkStepOff ? path : path.slice(0, 1);` | :1561 | :1561 | なし |
| `walkPath(hop, …)` の到着で elGoal を消し `onArriveStep(last, id)` | :1563-1567 | :1563-1567 | なし |
| `onArriveStep(atId, destId)` | :1523 | :1523(入場 :1537 → 襲撃 :1540 → 出来事 :1543)。**戻り値なし**(入場の枝も `return;` だけ) | なし |
| `walkPath(ids, onArrive)` 先頭の `stopWalk()` | :1180 | :1180 / :1181。⭐ 到着の `pendingArrive()` は `stopWalk()`(:1213 = `moving=false`)の**後**に同期で呼ばれる ⇒ 続きのホップで `maybeRoad*` の `if (moving)` 門は通る。ホップ間で `isMoving()` が false に見える瞬間は **無い**(器が開いたときだけ止まる) | なし |
| `maybeRoadEvent` の `if (walkStepOff) return false;` | :1344 | :1342 / :1344。戻り値は **boolean**(true は :1359 だけ・他は全部 false) | なし |
| `maybeRoadAmbush` の `if (walkStepOff) return false;` | :1441 | :1439 / :1441。戻り値は **boolean**(true は :1453 だけ) | なし |
| `finishRoadEvent` 末尾 `RE.showResult(ev, text, null, boon)` | :1378 | :1378 / **:1390** | なし |
| `js/road-events.js` `showResult(ev, text, onDone, boon)` | :675 | :675。「先へ進む」= `close(); if (typeof onDone === "function") onDone();`(:678)⇒ **null は黙って何もしない**・関数なら閉じた後に 1 回 | なし |
| `isNodeRevealed(id)` | :1039 | :1039-1044 | なし |
| `buildNodes` の `shown` / className | :1071-1072 | :1071 / :1072 | なし |
| `title` 属性 | :1078 | :1078 | なし |
| 札 `.worldSign`(el の 2 人目の子)/ 封蝋 `.worldSeal` | :1082-1123 | :1082-1123(封蝋の条件 :1117 = `isQuestMarkOn() && !questWalkOff && questDest && scenarioOfNode(id) === questDest`) | なし |
| `__world.revealed()` | :1622 | :1622 | なし |
| `?walkstep=0` の判定 | :1055 付近 | :1055-1062(クエリ → `sessionStorage.setItem(WALK_STEP_OFF_KEY,"1")` → `getItem === "1"` を読む)= §7 の撤退 2 本はこの形を写す | なし |
| 「入る」で `questDest` を消費 | :1279 | :1279(`bindAsk(elAskYes, …)` の中・唯一) | なし |
| 出発で `questDest` を書く唯一の口 | `tavern.html:8867` | `tavern.html:8867` | なし |
| 「街」= SITES に居ない拠点 | phlan だけ | `kind:"site"` 13 個 − SITES 12 個 = **phlan だけ**(`js/world-map.js:206-218`) | なし |

#### (2) ⚠⚠ 依頼書と食い違う事実(項目 2 の着手前に決めること)

- **A. ⚠⚠⚠ `__world` の窓は 3 本のドライバがキー集合で恒等固定している** — §6 の `autoWalkOn()` / `walkToken()` / `signed()` を足すと、それだけで次の 3 節が赤くなる(§2-6 の表に無い)。
  - `verify_road_events` **(4b)**(`tools/verify_road_events.js:1605-1612`)= KEEP 25 個 + 足されたのは `['roadEvent']` だけ
  - `verify_world_heromark` **(3a)**(`:1296-1334`・`NEW_SEAM_KEYS = ['heroMarkGeom','heroMarkOn','roadEvent']` :492)= `c1c85e0` から増えたキーがこの 3 つちょうど
  - `verify_quest_visibility` **(5a)**(`:1083-1091`)= `SEAM26` と完全一致・26 個
  - `world.html:972`(#64)と `:1669-1675`(#51)のコメントも「`__world` に窓を足さない(26 個で恒等固定)」と明記。#51 / #64 はどちらも **窓を足さずに DOM とストレージで観測**した前例。
  - 選択肢: **(i) 窓を足す** → 上の 3 節を「#109 の 3 本も許す」へ言い直す(3 本の言い直しを §12 に書く)/ **(ii) 窓を足さない** → 新ドライバは札を DOM(`.worldSign` の親の `data-node`)で数え、撤退は URL / sessionStorage(`dragonfighters.autoWalkOff`)で、トークン(罠 B)は (1d) の振る舞いと変異 `staletoken` で測る(既存 golden の言い直し 0)。
  - ⭐ 項目 1 の推奨 = **(ii)**(#51 / #64 の前例どおり・受入条件の意味は変わらず、観測の口だけが変わる)。⛔ どちらにするかは項目 2 の着手前に決める(項目 1 は設計を変えていない)。
- **B. `__world.goToPoint` は無い** — §8 の「`__world.goToPoint` と拠点 el の DOM クリックの 2 経路」の前者は **`__world.goToNode`**(:1648。中身は `goToPoint` そのもの = 刻み点 id も受ける :1571)。新ドライバはこちらを使う。
- **C. 襲撃の再開口は 1 か所だけ**(§2-2 の「world に残る枝が何本か」の答え)— 下の (3)。
- **D. 札に覆われた点(`COVERED_BY_SIGN = { temple: 'lakeside' }`・`verify_world_map.js:392` / `verify_quest_walk.js:936` / `verify_world_steps.js:844`)** — #106 で「神殿の点は湖畔の集落の札の下 = 神殿は自分の札を押して歩く」と決めた組。新規則では **`questDest = "witch-hut"` のとき湖畔の札だけが立ち、神殿の札は無い** ⇒ 神殿の点を押すと湖畔の札に当たって湖畔へ歩く(神殿へは刻み点経由でしか行けない)。受注地でない神殿へ入る用は無いので受入は変えないが、**§9 の実機で目に入れる候補**。ほかの `questDest` / 受注なしでは湖畔の札が消えるので神殿の点がむしろ露出する(既存ドライバの `pressPointOf` は `coverGone` の枝で点を押す = 壊れない)。

#### (3) 出来事・襲撃の閉じ口(項目 2 で「続き」を付ける場所)

| 器 | 枝 | 閉じ口 | world に残るか | 再開を付けるか |
|---|---|---|---|---|
| 街道の出来事(#45/#47) | 全枝(判定なし / 判定つき成功 / 失敗 / `resolveSkillCheck` が null) | `finishRoadEvent` → **:1390** `RE.showResult(ev, text, null, boon)` | 残る | ★ **付ける**(`null` → 続きを呼ぶ関数) |
| 街道の襲撃(#51) | 見捨てる(`check:false`「見つからぬよう街道を外れて通り過ぎる」) | `finishRoadAmbush` → `fight=false` → **:1488** `RE.showResult(ev, text, null, null); return;` | 残る | ★ **付ける** |
| 〃 | 判定つきだが `SkillCheck` が無い / `resolveSkillCheck` が null を返した | 同じ **:1488**(`fight = !!(choice && choice.check && outcome)` が false) | 残る | ★ 同じ 1 か所で済む |
| 〃 | 判定つき「茂みから回り込み、隙を突く」で結果が出た(成否とも) | **:1491** `RE.showResult(ev, text, function () { location.href = "index.html"; }, null)` | **去る**(戦闘へ) | ⛔ 付けない(ページが消える) |

⇒ 再開口は **:1390 と :1488 の 2 か所**(枝ごとに書き分ける必要は無い)。`js/road-events.js` は 1 バイトも触らずに済む(`showResult` が onDone を関数なら呼ぶ・`open` は onChoice を呼ぶだけ)。
⚠ `resolveSkillCheck` の Promise が reject した場合は今日も結末が出ない(器は開いたまま)= 続きも呼ばれない。今日と同じなので変えない。

#### (4) 既存 golden の母集団(和集合)と基準

母集団の取り方 = `grep -lE 'worldSign|questDest|goToNode|goToPoint|world\.html|arrivalCount|revealed\(|askOpen|__world|worldNode|walkstep|worldSeal|clientFromNode|worldEventBox|ROAD_EVENTS|roadseed' tools/*.js` = **32 本**(= `world\.html` 単独の 32 本と同じ集合 ⇒ 上限が見えている)。
- 札・歩き・`__world` を実際に叩く本 = §2-6 の 12 本 **+ 4 本**: `verify_kobold_warren`(`worldNode-site` の class を (1a)(4b) で見る)/ `verify_tower_mother`(同 (4a))/ `verify_town_exit`(phlan を押す)/ `verify_title_screen`(phlan を押す)。
- 残り 16 本は world.html を開いても **シート / BGM / 名簿 / 数値**を測るだけ(`verify_player_sheet` / `verify_ability_scores` / `verify_darkvision` / `verify_mercenary_roster` / `verify_run_chronicle` / `verify_sheet_equip` / `verify_synth_bgm` / `verify_scene_bgm` / `verify_corner_check` / `verify_eol_doorfix` / `verify_declared_traps` / `verify_member_identity` / `verify_party_four` / `verify_recruit_size` / `verify_tower_mother_b`(world.html はアンカーの一意性の検算だけ)/ `probe_paint_overlay`)。項目 4 の全数走査で回す。

基準(素の走行・`--negative` なし・直列・各ドライバの既定ポート・`timeout` で包まない・PowerShell)。ログ = `C:\Users\PC_User\.claude\dev-loop\r109\item1\`(`run_baseline.ps1` / `summary.txt` / `<driver>.log`)。

| ドライバ | port | exit | 集計 | 秒 |
|---|---|---|---|---|
| `verify_world_map` | 9120 | 0 | 57/57 | 81 |
| `verify_world_heromark` | 9490 | 0 | 18/18 | 10 |
| `verify_world_steps` | 9600 | 0 | 33/33 | 63 |
| `verify_quest_walk` | 9160 | 0 | 25/25 | 140 |
| `verify_quest_visibility` | 10221 | 0 | 素 39/39 | 17 |
| `verify_frost_hold` | 10690 | **1** | **26/27** | 128 |
| `verify_lost_cargo` | 10653 | 0 | 22/22 | 176 |
| `verify_silent_tomb` | 10664 | 0 | 24/24 | 273 |
| `verify_witch_hut` | 10677 | 0 | 29/29 | 470 |
| `verify_road_events` | 9760 | 0 | 25/25 | 81 |
| `verify_road_boon` | 9790 | 0 | 20/20 | 68 |
| `verify_road_ambush` | 9970 | 0 | 41/41 | 68 |
| `verify_kobold_warren` | 10642 | 0 | 21/21 | 105 |
| `verify_tower_mother` | 10538 | 0 | 19/19 | 123 |
| `verify_town_exit` | 9460 | 0 | 素 23/23 | 7 |
| `verify_title_screen` | 8893 | 0 | 86/86 | 66 |

- ⚠ **着手前から赤 = `verify_frost_hold` (6b) の 1 本だけ**。分類 = **型 3(#109 に帰属しない)**。理由 1 行: (6b) は「触らない約束の関数のソースが `0298eca` と同じ」を縛り、`defeatEnemy` だけ長さ 6517 → 6596(`same:false`)= #108 項目 3(`614270e`)が `defeatEnemy` に `markHiddenFoeSlain(enemy);` を 1 行足したため。#108 は `verify_frost_hold` を「触らないファイル」にしていて非退行の一覧に入れていなかった ⇒ **#108 から赤いまま出荷されている**(製品の不具合ではなく期待表の基準が古い)。#109 は `index.html` に触れないので帰属経路が無い。⇒ **非退行の判定 = `verify_frost_hold` の FAILED の集合が {(6b)} から増えない**。(6b) の言い直しは #109 の範囲外(別チケット / 起草窓へ申し送り)。
- 時刻で色が変わる本は無かった(闇市の `plazaClock` を握る本は母集団に居ない)。

#### (5) 項目 2 / 3 で赤くなる節の予告と直し方(静的に読んだ予告。⚠ 実走で確かめてから §12 に確定を書く)

方針の型: **【種 A】** 1 ホップ前提の節 → その腕の URL に `?autowalk=0` / **【種 S】** 札を押す的・札の幾何・解放の鎖を札で数える節 → `?questsign=0`(または `questDest` を種まき)/ **【言】** 札そのものの枚数を新規則で言い直す / **【窓】** (2)-A で (i) を選んだときだけ言い直す。

| ドライバ | 節 | 何を測っているか | 予告 | 予定 |
|---|---|---|---|---|
| `verify_world_map` | (7b-dom)(7d)(7e)(7f)(7c-1/2 が DOM なら) | 札 13 枚の DOM・中心の命中・押しても遷移しない・駒が札を隠さない | 項目 3 で赤(cleared 焼き込みだけで questDest 無し ⇒ 札 1 枚) | 種 S(札の幾何は全 13 枚が母集団) |
| 〃 | (3b)(3d)(4b)(4c) | 押し直しループ / 1 つ手前まで歩いてから phlan を 1 回押す | 項目 2 で **緑の見込み**(着いたら抜けるループ・ホップ間で `isMoving` が false にならない)。`dismissRoadEvent` の「先へ進む」で続きが走るが、次のクリックで行き先を差し替えるだけ | 実走で確認。赤なら種 A |
| `verify_world_heromark` | (1c) | 実クリック 3 回 = 3 ホップ(`okTaps === HOPS`) | 項目 2 で赤(1 回目で行き先まで歩き切る) | 種 A |
| 〃 | (1e)(3b)(4c) | ▽ と 13 枚の札の非交差 / 札 13 枚 / 撤退でも 13 枚 | 項目 3 で赤 | 種 S |
| 〃 | (3a) | `__world` のキー集合 | (2)-A (i) を選んだときだけ赤 | 窓 |
| `verify_world_steps` | (3a)(3b)(3c)(3d)(4a)(4b) + 変異 `fullwalk` / `hopnone` | 1 タップ = 1 刻み・押した回数 = ホップ数・arrivalCount が 1 ずつ | 項目 2 で赤 | 種 A |
| 〃 | (3a)(3b) の「神殿の札を押す」/ (2d)(5c) 札 13 枚 | 札を押す的・札との非干渉・札の枚数 | 項目 3 で赤 | 種 S |
| 〃 | (6a)〜(6d) | `?walkstep=0` | 緑の見込み(walkStepOff の枝は経路全部を 1 回で歩くまま) | — |
| `verify_quest_walk` | (0b)(2a)(2b) | cleared で札の DOM 枚数が変わる = 解放の鎖を札で数える | 項目 3 で赤 | 種 S(鎖の意味は `revealed()` のまま・§8 (3d) と整合) |
| 〃 | (3d)(3e) | 母集団ガード `signCount === 13` / 13 枚の中心の命中 | 項目 3 で赤 | 種 S |
| 〃 | (3a)(3b)(3c)(4b) | 受注地の札を押す / `?questwalk=0` で 13 枚 | 緑の見込み(受注地には札がある・`questWalkOff` は isSignShown で今日の姿) | — |
| `verify_quest_visibility` | (0c)(3b) | 素で 13 枚 / 封蝋を足しても 13 枚のまま | 項目 3 で赤 | 種 S((3b) は「封蝋で枚数が動かない」が主張 = 撤退の姿で測れば意味が保てる) |
| 〃 | (5a) | `__world` 26 個 | (2)-A (i) のときだけ赤 | 窓 |
| `verify_frost_hold` / `lost_cargo` / `silent_tomb` / `witch_hut` | frost (1b)(1c) / cargo (1c)(1d)(1f)(4b) / tomb (1d)(1f)(4b) / hut (1c)(1d)(1f)(4b) | 解放の後に `worldNode-site` + 札「地名」が立つ・札どうしの交わり 0 | 項目 3 で赤(questDest 無しの腕) | 種 S(主張は「解放されると拠点として立つ」と「札が混まない」= 全札が母集団) |
| 〃 | frost (1e) / cargo (1g) / tomb (1g) / hut (1g) | 受注 = その地で `goToNode` + 押し直しループ(250ms で heroNode を拾う)・通りすがりの拠点で開かない | 緑の見込み(questDest あり・`WORLD_Q = ?roadevent=0&ambush=0`・通過点の滞在 ≥ 1 ホップ分 ≈ 0.5〜0.9 秒 > 250ms) | 実走で確認 |
| `verify_kobold_warren` | (1a)(4b) | `village_s` が `worldNode-site`(DOM) | 項目 3 で赤 | 種 S |
| `verify_tower_mother` | (4a) の素の腕 `W4` | `pass_n` が `worldNode-site` | 項目 3 で赤 | 種 S |
| `verify_road_events` | (0d)(3a)(3d)(4c)(0c) と実クリックの走行全体 | 1 タップ = 1 停留所(`arrivals` の増分がちょうど 1)・往復の再訪 | 項目 2 で赤((4c) は確実) | 種 A(`PAGE_PATH = '/world.html'` :316 の腕へ) |
| 〃 | (4b) | `__world` 26 個 | (2)-A (i) のときだけ赤 | 窓 |
| `verify_road_boon` / `verify_road_ambush` | 実クリックで停留所を 1 つずつ踏む走行(boon (0c)(0d)(1a)(3a) / ambush (0e)(1a)〜(1g)(3a)) | 1 タップ = 1 停留所 | 項目 2 で赤の疑い | 種 A(`PAGE_PATH` :363 / :454) |
| `verify_town_exit` / `verify_title_screen` | phlan を押す | 主人公は phlan に立っている ⇒ `goToPoint` の「同じ点」の枝 = 入場 | 緑の見込み | — |

- ⚠ 種 A / 種 S を足すのは **その腕の URL だけ**(`?autowalk=0` / `?questsign=0` は sessionStorage へ写るので、同じタブでの遷移も撤退のまま)。⛔ 期待値を緩めない。⛔ `?walkstep=0` / `?questwalk=0` と相乗りさせない。
- ⭐ 自動歩行と新しい札の規則そのものは新ドライバ `verify_world_autowalk`(port base 10720)が測る。種まきで逃がした節の主張が新ドライバのどこで測られているかを項目 4 で対応表にする。

### 12-2. 自動歩行(項目 2)

日時 2026-11-06 19:10〜・基準 HEAD `0a1ecd6`。ログ = `C:\Users\PC_User\.claude\dev-loop\r109\item2\`。

#### (1) ✅ ユーザー決定(§6 を上書き)

- **`__world` に窓を足さない**(`autoWalkOn` / `walkToken` / `signed` は作らない)。`__world` の 26 個固定を `verify_road_events` (4b)・`verify_world_heromark` (3a)・`verify_quest_visibility` (5a) が握っているため(§12-1 (2)-A の (ii))。既存メンバも名前・意味を変えていない。
  ⇒ 項目 3 / 4 は札を DOM(`.worldSign` の親の `data-node`)で、撤退を URL / sessionStorage(`dragonfighters.autoWalkOff`)で、トークン(罠 B)を振る舞いと変異で測る。

#### (2) `world.html` の変更(CRLF のまま)

| 行 | 何 |
|---|---|
| :1063-1076 | 撤退 `?autowalk=0` — `?walkstep=0` と同じ書き方(クエリ → `sessionStorage["dragonfighters.autoWalkOff"]="1"` → `getItem !== "1"` を `AUTO_WALK_ON` へ)。他の撤退スイッチとは相乗りしない |
| :1405 | 罠 A 再開口 1/2: 街道の出来事 `RE.showResult(ev, text, resumeAutoWalk, boon)`(旧 `null`) |
| :1505 | 罠 A 再開口 2/2: 襲撃で world に残る枝 `RE.showResult(ev, text, resumeAutoWalk, null)`(旧 `null`)。⛔ 戦う枝(index.html へ移る)は触らない |
| :1540-1565 | `onArriveStep` が **器を開いたら true** を返す(入場 `return true` / 襲撃 `return isRoadBoxShown()` / 出来事 `return maybeRoadEvent(atId)`) |
| :1571-1591 | `walkSeq`(罠 B のトークン)・`autoResume`・`resumeAutoWalk()`・`isRoadBoxShown()` |
| :1592-1612 | `goToPoint(id)` — 今日どおり(存在確認 / 同じ点なら入場 / 経路なしは false / elGoal)+ `my = ++walkSeq; autoResume = null; stepToward(id, my)` |
| :1613-1629 | `stepToward(id, my)` — §4 の設計どおり。⛔ `path.slice(0, 1)`(:1618)はそのまま・⛔ destId は元の行き先のまま(罠 C) |

⭐ 依頼書の設計から足した 2 点(実走で見つけた):

- **A. 歩いている最中に「いま発った点」を押すと引き返す**(`goToPoint` :1603 / `stepToward` :1616)。`heroNodeId` は次の点に着くまで「発った点」のままなので、その点を押すと経路が `[]` になり `goToPoint` が false を返していた。#40 では 1 ホップで止まるので目立たなかったが、自動歩行では **押しても止まらず元の行き先まで歩き切る**(スモーク (B) で赤を実測)。⇒ `id === heroNodeId && moving` のときだけ経路を `[id]` にして引き返す。⚠ 変異アンカー `if (path === null || path.length === 0) return false;`(`verify_world_steps` hopnone)は 1 字も変えずに残した。
- **B. 撤退 `?roadevent=0` 中の襲撃で止まらない**(`onArriveStep` :1561)。`?roadevent=0` では器 `#worldEventBox` が DOM に無いので、襲撃を振っても何も開かない(今日も見えない)。そのとき `true` を返すと自動歩行が続きを待ったまま止まる ⇒ 襲撃は **実際に器が開いたか** で答える(スモーク (F2))。

⛔ 変えていないもの: `PX_PER_MS` / `PX_PER_FRAME`・刻み点マーカー・`elGoal` の体裁・`walkPath` 先頭の `stopWalk()`・`maybeRoadEvent` / `maybeRoadAmbush` の中身・`js/road-events.js` / `js/world-map.js` / `index.html` / `tavern.html`。

changelog: `js/changelog.js` へ「<b>地図は 1 回押せば着くまで歩く</b> — 道中の出来事では立ち止まり、選んだら続きを歩く。」(4 件維持)。⭐ 札の文は項目 3 で §10 の全文へ差し替える(項目 2 単独で嘘にしないため)。

#### (3) 既存 golden — 種まき 5 本 + 変異アンカーの追従 2 本(⛔ 期待値は 1 本も緩めていない)

赤は **実走で確かめてから**種をまいた(`item2\pre\` = 種まき前の実走。⚠ 走行中に上の A / B を足したので、最終判定は (4) の post 走行)。

| ドライバ | 種まき前の赤 | 型 | 直し |
|---|---|---|---|
| `verify_world_heromark` | **(1c)**(1 回目で 13 ホップ先まで歩き切り、2 回目のタップが空振り) | 種 A | `PLAY_QUERY` を `?roadevent=0&autowalk=0` へ(実操作の腕だけ) |
| `verify_world_steps` | **(3a)(3b)(3c)(4b)(6b)**(+ 起動時 exit 3 = hopnone のアンカー消失 → A の書き方を変えて解消) | 種 A | `measurePlay` の素 / 変異の 2 か所を `?autowalk=0`、(6b) の素のアーム(on)は **sessionStorage で**撒く((6c) が「素のアームに search が無い」を縛るため URL にしない)。⛔ `?walkstep=0` の off / reopen アームには足さない |
| `verify_road_events` | **(3a)(4c)(5b)(5c)** | 種 A | `measurePlay` の query に `&autowalk=0`(`walkstep=0` の腕を除く) |
| `verify_road_ambush` | **(0c)(1f)(5a)(9b)**((9b) は #51 の (1f)(5a) が赤いことの集計) | 種 A | `measureAmbush` の query に `&autowalk=0`(`walkstep=0` の腕を除く) |
| `verify_witch_hut` | **(1f)**(「神殿の札を押し続けると着く」の母集団 `presses.length >= 2` が 1 回で着いて崩れる) | 種 A | その押す腕だけ `WORLD_Q + '&autowalk=0'` |
| `verify_road_ambush` | (素は緑) 変異 `dismisswrite` のアンカーが消える(`null` → `resumeAutoWalk`) | アンカー追従 | from / to を新しい行へ。`--negative --mut dismisswrite` で (1b) が赤 = 生きている |
| `verify_silent_tomb` | (素は緑) 変異 `passopen` のアンカーが消える(`return;` → `return true;`) | アンカー追従 | from / to を新しい行へ。`--negative --only passopen` で (1g) が赤 = 生きている |

- 予告どおり **緑のまま**だった本: `verify_world_map`(3b)(3d)(4b)(4c) を含む全節・`verify_road_boon`(予告は「赤の疑い」→ 実測 20/20)・`verify_quest_walk` / `verify_quest_visibility` / `verify_lost_cargo` / `verify_silent_tomb` / `verify_kobold_warren` / `verify_tower_mother` / `verify_town_exit` / `verify_title_screen`。
- 変異の生存: `verify_world_steps --negative` = **56/56**(`fullwalk` → (3a)(3b)(3c)(6b)、`hopnone` → (3a)(3c) が種まき後も赤)。
- アンカー走査(全 `tools/*.js` の文字列リテラルのうち旧 `world.html` に在ったものの出現数の増減)で、変異アンカーが消えたのは上の 2 本だけ(残りはコメント語の数え上げで、変異の注入先ではない)。走査器 = `item2\anch.js`。

#### (4) 検証

- スモーク `item2\smoke_autowalk.js`(port 10731・使い捨て)= **PASS 11 / FAIL 0**:
  (A) `?roadevent=0` で phlan→temple を `goToNode` 1 回 → temple・arrivalCount 11 = `findWalkPath` 長 11 / (B) 歩行中にいま発った forest を押す → forest に着いて留まる / (B2) 歩行中に pier を押す → pier(phlan を通っても町へ飛ばない)/ (C) pier→forest は phlan を通っても `world.html` のまま / (D) `?roadseed=1` で forest__farm_n@1 の出来事で止まる(1.5 秒待っても動かない)→ 判定なしの枝 →「先へ進む」→ temple まで(arrivalCount 11)/ (F) `?roadseed=6` + 編成あり: 襲撃(見捨てる)と出来事 2 回で毎回止まり、毎回「先へ進む」で続いて temple / (F2) `?roadevent=0` + 編成ありで襲撃が当たる種でも止まらず temple / (E) `?autowalk=0` で 1 ホップだけ・sessionStorage に `"1"`・クエリ無しの再読込でも撤退のまま / pageerror 0。
- 非退行 16 本(post・種まき後・直列・既定ポート): 下の (5)。

#### (5) 非退行 16 本(post = 最終コード・種まき後・2026-11-06 19:56〜20:27・`item2\post\summary.txt`)

| ドライバ | exit | 集計 | 種まき前 (pre) |
|---|---|---|---|
| `verify_world_map` | 0 | 57/57 | 0 |
| `verify_world_heromark` | 0 | 18/18 | 1 ((1c)) |
| `verify_world_steps` | 0 | 33/33 | 3 → 素 1 ((3a)(3b)(3c)(4b)(6b)) |
| `verify_quest_walk` | 0 | 25/25 | 0 |
| `verify_quest_visibility` | 0 | 39/39 | 0 |
| `verify_frost_hold` | 1 | 26/27 = FAILED **{(6b)}**(§12-1 の基準と同じ集合・#109 に帰属しない) | 1 ({(6b)}) |
| `verify_lost_cargo` | 0 | 22/22 | 0 |
| `verify_silent_tomb` | 0 | 24/24 | 0 |
| `verify_witch_hut` | 0 | 29/29 | 1 ((1f)) |
| `verify_road_events` | 0 | 25/25 | 1 ((3a)(4c)(5b)(5c)) |
| `verify_road_boon` | 0 | 20/20 | 0 |
| `verify_road_ambush` | 0 | 41/41 | 1 ((0c)(1f)(5a)(9b)) |
| `verify_kobold_warren` | 0 | 21/21 | 0 |
| `verify_tower_mother` | 0 | 19/19 | 0 |
| `verify_town_exit` | 0 | 23/23 | 0 |
| `verify_title_screen` | 0 | 86/86 | 0 |

⇒ 合格(frost_hold は {(6b)} から増えず・他 15 本は全緑)。

#### (6) 項目 3 / 4 への申し送り

- 新しい関数: `resumeAutoWalk()` :1583 / `isRoadBoxShown()` :1587 / `goToPoint(id)` :1592 / `stepToward(id, my)` :1613 / 撤退 `AUTO_WALK_OFF_KEY` :1069・`AUTO_WALK_ON` :1075。
- 変異の注入先の候補(どれも world.html にちょうど 1 回):
  - `onehop` … `        if (last === id || walkStepOff || !AUTO_WALK_ON) return;` → `return;`
  - `passenter` … `var opened = onArriveStep(last, id);` → `onArriveStep(last, last)`
  - `noresume` … `RE.showResult(ev, text, resumeAutoWalk, boon);` → `null`
  - `noeventstop` … `if (opened) { autoResume = function () { stepToward(id, my); }; return; }` → 外す(器が開いても歩き続ける)
  - `staletoken` … ⚠⚠ トークン検査を外すだけでは **空振りする**: 別の点を押すと `walkPath` の `pendingArrive` 差し替えと `goToPoint` の `autoResume = null` が古い続きを先に殺すため。赤くする筋 = 「出来事の器が開いて立ち止まる → (器を閉じずに) `__world.goToNode(別の点)` → 新しい歩きの最中に器の『先へ進む』」を作り、変異は **2 か所のトークン検査 + `goToPoint` の `autoResume = null;`** をまとめて外す(どれか 1 つでも残ると古い続きは止まる)。
- 撤退は sessionStorage へ写る ⇒ 同じタブの再読込も撤退のまま。⚠ 撤退を立てる腕は別タブで(素の腕へ漏らさない)。
