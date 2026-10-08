# #87 判定パネルを左上へ小さく + 戦闘中は判定を出さない + 道中の宝箱を廃止

- **起草**: 2026-10-06(計画窓 claude-27) / **ステータス**: **承認済**(2026-10-06 ユーザー承認)
- **着手**: ✅ **着手可** — #86 完了(`baa5a67`・2026-10-09)。受入の port base = **10586**(#86 §12)。⚠ #86 が `index.html` を触ったので §2 の行番号は必ず引き直すこと
- **触るファイル**: `index.html` / 言い直す既存 golden(§8 末尾の表)/ `tools/verify_corner_check.js`(新規)/ 本依頼書 / `実装依頼書/README.md`
- ⛔ **触らないファイル**: `js/skill-check.js`(酒場 `tavern.html` と街道 `world.html` も読む共有ファイル。§2-1)/ `tavern.html` / `world.html`
- ⚠ 起草時点で実装窓が **#86**(`tavern.html` / `index.html`)を dev-loop 中。本チケットは **#86 完了後に着手**する。着手前に §2 の行番号を引き直すこと(#86 が `index.html` を触るので必ずずれる)。

---

## 1. 目的

道中の「探索判定」などのパネルが**画面中央を暗幕で覆って大きく**出る(幅 min(420px,90vw)・4 人編成で縦長・1 枚につき約 7 秒)。プレイの流れを毎回止めて目立ちすぎる。
加えて、戦闘が始まった瞬間に隠密判定のパネルが出る。ユーザーは「戦闘中に宝箱の判定も出る」とも感じている。

**ユーザー決定(2026-10-06)**:

- **道中(`index.html`)の判定パネルは画面左上に小さく出す。** 暗幕は無し。罠を見つけたときの「解除する / 迂回する」の選択も左上に小さく出す。
- **戦闘中は宝箱と隠密の判定パネルを出さない。** 隠密判定は**裏で振り、結果を頭上の吹き出しとログで見せる**(#76 伝承判定と同じ作法)。奇襲の仕組みは残す。
  - 不採用: 「左上の小パネルで出す」「奇襲そのものを廃止」
- **道中の宝箱をすべて廃止する**(玄室宝箱・隠し宝箱・廃坑の寄り道宝箱)。宝箱の置き方は後日、専用のチケットで考え直す。
  - **残すもの**: 竜の巣のボス部屋の財宝(囮の宝箱 3 個 + ミミック = final-mimic.md の隠し要素)と、森の**鍵束の宝箱**(残影の獣の檻を開けるための導線)。
  - 不採用: 「鍵束も消す」「全部消す」
- **消えた宝箱のぶんは、クリア時の金貨で補う**(#51 街道の襲撃の `clearGold` と同じ方式)。
  - 不採用: 「何もしない」

---

## 2. 着手前の実測(HEAD `cdebd24`・作業ツリー clean。⚠ #86 着手後は行番号がずれる)

### 2-1. 判定パネルの実体は共有 js にある

- 本体は `js/skill-check.js`(518 行)。読むページは 3 枚: `index.html:3085` / `tavern.html:2841`(マッチング画面の事前情報チェック)/ `world.html:622`(街道の出来事 #45)。
- DOM は `ensurePanel()`(js:263)が組み立てる:
  `#skillCheckOverlay > #skillCheckCard > img.scIcon / .scTitle / .scFlavor / .scMeta / .scRoster(.scRow…) / .scResult / button#scRollBtn / .scHint`
- CSS は `ensureStyles()`(js:208-260)が実行時に `<head>` へ注入する。
  - `#skillCheckOverlay{position:fixed;inset:0;z-index:105;display:none;align-items:center;justify-content:center;background:rgba(8,6,2,0.55)}`
  - `#skillCheckCard{width:min(420px,90vw); border 6px; padding 18px 20px 16px}`
  - アイコン 56px、タイトル 18px、ダイス 34px。狭幅用の @media は無い。
- 時間: 自動ロールまで `AUTO_ROLL_MS=2000`(js:86)、結果を出しておく時間 `RESULT_HOLD_MS=3600`(js:94)。1 枚 ≈ 6.8〜7.1 秒。
- 進める操作は 3 つ。オーバーレイ全面の click(js:450)/ Enter・Space / `#scRollBtn`。`opts.auto` または autoplay のときは UI を出さずに即決する(js:482)。
- ⭐ **前例**: `tavern.html:2416` が `#skillCheckOverlay { z-index: 220 !important; }` で**ページ側から上書き**している。
  ⇒ **本チケットも `index.html` 側の CSS 上書きで済ませ、`js/skill-check.js` は触らない。** 酒場と街道のパネルは 1 バイトも変えない。
  上書きの規則には `!important`(または詳細度)が要る。JS の規則が後から注入されて後勝ちになるため。

### 2-2. 呼び口の全数(`SkillCheck.resolveSkillCheck(` = index 12 か所 + tavern 1 + world 2)

| index.html:行 | 呼び元の関数 | 判定 | 戦闘中に出るか(現状) |
|---|---|---|---|
| 26020 | `runRoomSearchCheck()`(25961) | 探索判定(知覚 / 捜査) | 入口 25962 で `encounterActive \|\| encounterRunning` を弾いている。⚠ ただし §2-3 の穴あり |
| 26109 | `tryStealthSurprise()`(26086) | **隠密判定** | **出る**。`runEncounter` の 22158 で `encounterActive=true`(21971)の後に await される |
| 26191 | `runTrapDisarmCheck()`(26139) | 罠解除 | 入口 26140 で弾いている |
| 26385 | `tryPickLock(chest)`(26369) | 開錠(宝箱) | 唯一の呼び元 `tryDiscoverChest`(24492・400ms の interval)が 24494 で弾く。敵が 640px 以内なら保留 |
| 25682 / 26628 / 27171 / 27585 | #53 若い司祭 / Sce1 EV-2 / 従者 / グリクス | 接近の対話・イベント | 戦闘外 |
| 28618 | `runLoreCheck()`(28582) | 伝承 #76 | **`auto:true`(パネル無し)= 隠密を直すときの手本** |
| 37423 / 37428 | `tryUnlockDoor()` | 扉の開錠 / 体当たり | 戦闘外 |
| 38010 | `revealExitHints()` | 知覚(出口ヒント) | 戦闘外 |

- **左上へ移すのは index.html のパネル全部**(上の 11 種すべてが同じ `#skillCheckOverlay` を使う)。種類ごとに分けない。
- 戦闘中にパネルが出る経路は、コード上は**隠密だけ**。

### 2-3. ⚠⚠⚠ 「戦闘中に宝箱の判定が出た」の正体 = 非 await の穴

`heroSlideOneTileExplore`(19731 付近)の現状:

```js
if (typeof runRoomSearchCheck === "function") runRoomSearchCheck();   // ← await しない
if (typeof runTrapDisarmCheck === "function") runTrapDisarmCheck();
if (typeof checkTrapTrigger === "function") checkTrapTrigger();
await exploreAllyTurn(oldPlayerTile);
await exploreEnemyTurn();      // ← dialogPaused を見ない
```

- パネルを出している呼び元は `skillCheckActive=true; dialogPaused=true` を立てる。`moveEnemies`(19009)はそれで止まる。
- ところが `exploreAllyTurn` / `exploreEnemyTurn` は `dialogPaused` を見ない。そのため**パネル表示中も敵が 1 マス詰めてきて**、閉じた瞬間に交戦が始まる。
- 探索判定の flavor は、罠が無い部屋では「床や壁を入念に調べる。隠された宝や…」になる。これが「戦闘中の宝箱判定」に見えた、と推定する。
- **決定**: 本チケットで穴をふさぐ。探索ターンの仲間・敵の手番は、`skillCheckActive` の間は待つ。
  - 方法は実装窓が選んでよい。(a) `runRoomSearchCheck` が返す Promise を await する、(b) explore 側で `skillCheckActive` が落ちるのを待つ、のどちらか。
  - ⭐ この穴を戻す変異を §8 の `--negative` に内蔵する(`noawait`)。

### 2-4. 罠の選択肢は全ダイアログ共用の器にある

- `runTrapDisarmCheck()` の 26163-26170:
  - メイジハンドなし: `showChoice("見つけた罠を解除しますか?", "解除する", "迂回する")`
  - メイジハンドあり: `showCharChoice(msg, [解除する, メイジハンドで解除する — 失敗しても傷を負わない], "迂回する (Esc)")`
- 器 `#choiceDialog` は `showChoice`(14670)/ `showCharChoice`(14726)が遅延生成する。
  - CSS(1960-2082)は下端のログ枠の帯。`body.choice-open` でログを `visibility:hidden` にする。
  - 檻・霊・スクロール・分岐ノード・Sce1 イベント・メイジハンドが**共用**している。
- ⚠ **`#choiceDialog` 自体を動かすと全ダイアログが左上へ飛ぶ。** ⇒ **決定**: 罠の 2 か所だけ、左上の小さな器へ出す(新しい器、または `#choiceDialog` に罠専用の class)。他のダイアログは 1 px も動かさない。
- `showChoice` に自動タイマーは無く、押すまで待つ(`dialogPaused=true`)。これは**左上へ移しても変えない**。autoplay は即 true(14672)。
- ⚠ `verify_mage_hand` (7d) は「`showChoice` が今の 3 引数で 1 回」を argc で測っている(tools/verify_mage_hand.js:403, 846)。器を変えると赤くなるので言い直しが要る(§8 末尾)。

### 2-5. 左上の空き(衝突)

- `#partyToggleBtn` ☰: `body.ui-collapsed`(スマホは常に / PC で畳んだとき)のとき `position:fixed; top:11px; left:calc(11px + safe-area); z-index:61; 44×44`(2233)。
- PC で展開しているとき: `#partyPanel` が `left:0; width:var(--ui-menu-w)=280px; z-index:10`(2199)。世界の左上は x=280 から始まる。畳むと `--ui-menu-w=0`(`computeUiMetrics` 7583)。
- 上中央の帯: `#battleBanner` top 60 / `#dmMessage` top 90 / `#eyeScoutPanel` top 172(いずれも中央)。右上: `#phaseIndicator`・⚙。
- **採用値**:
  - 位置: `left = var(--ui-menu-w) + 8px`。top は展開時 8px、`ui-collapsed` のときは ☰ の下(11 + 44 + 8 = 63px)。
  - 幅: 最大 260px。中央上の帯と横で重ならないこと。
  - z-index: 105 のまま(☰ の 61 より上)。

### 2-6. 宝箱の湧き口(配列は `roomChests` 1 本・24115)

| 湧き口 | 種類 | 今回 |
|---|---|---|
| `spawnRoomChests()` 24336 | 玄室宝箱(`loot` ノード・5×5 以上・50%・80% 施錠) | **廃止** |
| `spawnHiddenChests()` 24379 | 隠し宝箱(`hiddenChestCount`: 廃坑 2 / 森 3 / 沼 3 / 砦 4 / 神殿 4 / 竜 5 / 塔 3 / 自作依頼 2) | **廃止**。⚠ ただし同じ関数内の 24420-24438 にある**鍵束の宝箱**(森 + 盗賊同行 + `s2_beast_intel`)は**残す** |
| `spawnExplorationChests()` 24450 | 探索発見ルート | 対象外。`EVENT_ITEMS=[]` なので常に 0 個 = 不変 |
| `spawnDetourChests()` 36582 | 廃坑 n1 の寄り道 4 個(`?detour=0` あり) | **廃止**(宝箱だけ。寄り道の矢印やルートは実装窓が見て判断し、§12 に書く) |
| `spawnDragonHoard()` 24684 | 竜の巣ボスの囮 3 + ミミック | **残す** |

- ⚠⚠ `spawnTraps` は同じ kind 関門(`js/df-mapdef.js:2091-2114`・`search` ノード)を共有している。**kind や除外集合をいじると罠まで消える。** ⇒ 湧き口の関数の中でスイッチを見る。
- ⚠⚠ 宝箱は `withNodeRng` の中で湧く。`Math.random` の消費が減ると、後続(檻・ハイドラ・竜の財宝・従者)の乱数列がずれる。
  - **決定**: 抽選は今どおり回し、配列へ push する直前で捨てる(乱数の消費を変えない)。
  - これが難しい箇所があれば、ずれを許して §12 に書く。ずれで golden が揺れたら、帰属は影のツリーで切り分ける(恒例の手順)。
- 探索判定(`runRoomSearchCheck`)は罠の発見を兼ねているので**残す**。
  - **決定**: 罠も鍵束もミミックも無い部屋では振らない(「隠された宝や…」の空振りパネルを出さない)。
  - 実装窓は、判定の対象を何で数えているかを読んでから決め、§12 に書く。

### 2-7. 宝箱の中身と金貨の補填

- `pickChestLoot()`(24302): 金貨小 33%(10-20G)/ 金貨大 17%(30-50G)/ 武器 12% / 防具 12% / 盾 10% / 巻物 12% / 空 4% / マジックアイテム 0.5%。
- 金貨の期待値 = 0.16 × 15 + 0.17 × 40 ≈ **9.2G / 箱**(巻物・装備の価値は含まない)。
- 補填の口は既にある: 勝利処理 40524 の `clearGold`(`currentScenario.clearGold > 0 && !escortWagonLost()`)。前例は 2 つ。
  - 街道の襲撃 `_roadBattle.clearGold`(11380)
  - 塔の母 `clearGold: 300`(11335)
- **決定(初期値・プレイテストで調整)**:
  - 各シナリオの `clearGold` に「**そのシナリオで消えた宝箱の期待個数 × 25G**」を**加算**する。25G は金貨の期待値 9.2G に装備・巻物のぶんを上乗せした丸め値。
  - 期待個数は項目 1 で実測する。目安は `hiddenChestCount` + loot ノードの玄室の数 × 0.5 + 寄り道 4(廃坑のみ)。
  - 既に `clearGold` を持つシナリオは、その値に足す。
  - ⛔ 巻物・装備の代わりは入れない(後日の宝箱チケットで考える)。巻物は今後もボス・隠し要素の敵・酒場の巻物の棚 #77 から手に入る。

### 2-8. 撤退スイッチの作法 / changelog

- 作法: `const X_ON = new URLSearchParams(window.location.search).get("xxx") !== "0";`(例: `LORE_ON` 28489・`BOARD_FADE_ON` 3521)。判定パネル・宝箱・隠密の専用スイッチはまだ無い。
- `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` ⇒ `index.html` を触るので**鳴る**。プレイヤー向けの要約は実在する(§10)。

### 2-9. 次の port base

tools/ の最大は 10573(#85)。#86 は base 10574 で変異数が未確定。`probe_magehand_reach.js` が 10600 を使う。
⇒ **#87 の base は #86 完了時の「次の新規ドライバ base」**。10600 を避けること。
⇒ **確定(2026-10-09)= 10586**(#86 の変異は 10575〜10585)。変異は 10587〜(10 本なら 10596 まで)。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `index.html` | CSS 上書き(左上の小パネル)/ 罠の選択の左上の器 / `tryStealthSurprise` を `auto:true` + 吹き出し・ログ / 探索ターンの穴 / 宝箱 3 口の停止(鍵束・竜の財宝は残す)/ `clearGold` の加算 / 撤退 2 本 / changelog |
| `tools/verify_corner_check.js` | 新規受入 |
| 既存 golden | §8 末尾の表を言い直す |

⛔ `js/skill-check.js` / `tavern.html` / `world.html` は開かない。酒場と街道のパネルは不変を受入で守る(§8 (5a))。

---

## 4. STEP1 — 判定パネルを左上へ小さく(`index.html` の CSS だけ)

- `index.html` の `<style>` に、`!important` 付きで上書きを足す:
  - `#skillCheckOverlay`: `inset:auto; background:transparent; pointer-events:none; top/left は §2-5`。`display` は JS が切り替えるので**触らない**。
  - `#skillCheckCard`: `pointer-events:auto; width:260px 以下`。アイコン 28px 前後・タイトル 13px 前後・flavor は 1 行に詰めるか非表示・行の高さとダイスを縮める。数値は実装窓が目で決める。
  - ⭐ 左上の小パネルは**縦の高さを測って §8 に書く**こと。4 人編成で 300px を超えるなら、さらに詰める。
- 閉じ方は今の「カード上の click / Enter・Space / 自動」のまま。暗幕が無くなるので、カードの外の click は**ゲームへ通す**(`pointer-events:none`)。
- 待ち時間(2000 / 3600ms)とゲームの一時停止(呼び元の `dialogPaused`)は**変えない**。

## 5. STEP2 — 罠の「解除する / 迂回する」を左上へ

- `runTrapDisarmCheck()` の 2 か所(`showChoice` / `showCharChoice`)だけ、左上の小さな器で出す。器の位置・幅は STEP1 のパネルと揃える。
- 罠の判定パネルと選択が同時に出ることは無い(選択 → 判定の順)。同じ場所に順に出ればよい。
- 押すまで待つ・`dialogPaused`・Esc で迂回・autoplay は即 true。この 4 つは今のまま。
- ⛔ `#choiceDialog` の CSS と、他の呼び元は触らない。

## 6. STEP3 — 戦闘中は判定パネルを出さない + 道中の宝箱を廃止 + 金貨の補填

1. `tryStealthSurprise()` の `resolveSkillCheck` 呼び出しに `auto:true` を渡す。結果は**頭上の吹き出し + 戦闘ログ**で見せる(`runLoreCheck` の作法を写す)。奇襲の効果(成功時の処理)は 1 バイトも変えない。
2. §2-3 の穴をふさぐ。
3. 念のための門を 1 つ置く: index.html でパネルを出す経路は、`encounterActive || encounterRunning` の間は `auto:true` で即決し、UI を出さない。宝箱の開錠も含む。
   - ⭐ 置き場所は呼び元ごとに書かず、**1 か所**にする(`resolveSkillCheck` を呼ぶ index 側の薄いラッパ、など)。実装窓が選んで §12 に書く。
4. 宝箱: `spawnRoomChests` / `spawnHiddenChests`(鍵束を除く)/ `spawnDetourChests` を止める(§2-6 の乱数の決定に従う)。
5. 金貨: §2-7 の加算。

---

## 7. 撤退スイッチ

- **`?cornercheck=0`** — STEP1・STEP2・STEP3 の 1〜3 を従来へ戻す(中央の大パネル / 罠は下の帯 / 戦闘開始時に隠密パネル)。⚠ §2-3 の穴ふさぎは不具合の修正なので戻さない。
- **`?roadchest=0`** — STEP3 の 4・5 を従来へ戻す(宝箱が湧く / `clearGold` の加算なし)。⭐ 「宝箱が 1 個以上」を測る既存 golden(§8 末尾)は、この腕で走らせて言い直すのが最小の手当て。
- 判定位置: `index.html` の頭でそれぞれ 1 回読む。ページ遷移はまたがない(index.html の中で完結)。

---

## 8. 受入条件 — `tools/verify_corner_check.js`(新規・base **10586**)

DOM の矩形と呼び出しの記録を 2 経路で突き合わせる。どの判定パネルが・どこに・戦闘中かどうかを測る。

### §0 装置

- **(0a)** 探索判定のパネルが**実際に 1 回以上表示された**(`#skillCheckOverlay` が display≠none になった回数 ≥ 1)。これが 0 なら全 assert が空振りになる。
- **(0b)** 戦闘開始時の隠密判定の呼び出しを 1 回以上捉えた(盗賊入り編成で)。
- **(0c)** 罠の選択の器が 1 回以上出た。

### §1 左上

- **(1a)** パネルの矩形: `left ≥ --ui-menu-w`・`top < 80px`・`width ≤ 260px`・`right < 画面幅の 50%`。PC 展開 / `ui-collapsed` の 2 姿勢で測る。
- **(1b)** collapsed のとき ☰ の矩形と交わらない。上中央の `#battleBanner` / `#dmMessage` とも交わらない。
- **(1c)** オーバーレイが画面全体を覆っていない(暗幕なし・`pointer-events` が素通し)。

### §2 罠

- **(2a)** 罠の選択の矩形が §1 と同じ左上の帯にある。メイジハンドあり / なしの 2 腕で測る。
- **(2b)** 他の `#choiceDialog` の利用者(例: スクロールの選択)は従来の下端の帯のまま。

### §3 戦闘中

- **(3a)** `encounterActive` の間、パネルの表示回数が 0。隠密判定は呼ばれ、結果がログ / 吹き出しに出る(2 経路)。
- **(3b)** 探索判定のパネル表示中、敵のタイルが動かない(§2-3 の穴)。

### §4 宝箱

- **(4a)** 7 シナリオ + 自作依頼で、道中の `roomChests` が 0 個。
- **(4b)** 竜の巣のボスノードの財宝は 4 個のまま(ミミック 1 を含む)。鍵束の宝箱は条件がそろえば 1 個。
- **(4c)** 勝利時の金貨に、§2-7 の加算ぶんが入っている(`?roadchest=0` の腕との差で測り、絶対量も併記する)。

### §5 恒等

- **(5a)** `tavern.html` / `world.html` の `#skillCheckOverlay` は従来どおり中央・暗幕あり(矩形で測る)。
- **(5b)** 罠の数(`spawnTraps` の結果)が `?roadchest=0` の腕と同じ。

### §6 撤退

- **(6a)** `?cornercheck=0` → 中央の大パネル・罠は下の帯・戦闘開始時に隠密パネルが出る。
- **(6b)** `?roadchest=0` → 道中の宝箱が湧き、`clearGold` は従来値。

### ⛔ 測らないこと

- パネル内の文字サイズ・アイコンの大きさ(目で決める)。
- 25G という単価そのもの(プレイテストで動かす)。

### 負のコントロール(`--negative` に内蔵する)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `centered` | 上書き CSS を外す | (1a)(1c) |
| `veil` | 暗幕の背景だけ戻す | (1c) |
| `trapband` | 罠の選択を `#choiceDialog` の帯へ戻す | (2a) |
| `allchoice` | `#choiceDialog` 全体を左上へ動かす | (2b) |
| `stealthpanel` | 隠密の `auto:true` を外す | (3a) |
| **`noawait`** | §2-3 の穴を戻す | (3b) |
| `chests` | 宝箱の停止を外す | (4a) |
| `hoardgone` | 竜の財宝まで止める | (4b) |
| `trapsgone` | kind 関門で止める(罠も消える) | (5b) |
| `nogold` | 金貨の加算を外す | (4c) |

### 既存 golden の言い直し / 非退行(項目 1 で着手前の色を取る)

| 本 | 理由 | 手当て |
|---|---|---|
| `driver_graph_kinds` / `driver_graph_run` / `driver_grid_p9` / `driver_grid_s2` (13e) / `driver_mapdef_step1` (G8)(4b) / `verify_fort_fold` 4a / `verify_swamp_fold` 3d / `verify_temple_fold` 4b / `verify_dragon_fold` 4a / `verify_tower_mother` (2c) | 「宝箱が 1 個以上」 | `?roadchest=0` の腕で走らせる、または 0 個を期待する形へ言い直す |
| `verify_mage_hand` (7a)(7d)(11a) / `verify_mage_hand_reach` / `driver_trap_disarm` / `driver_grid_p5` | 罠の選択の器と引数 | 新しい器で読み直す |
| `driver_skillcheck_roster` / `driver_fix4_help_bonus` / `verify_road_*` / `verify_prep_retire` | パネルの DOM・z | index の分は構造不変のはず。崩れたら理由を §12 へ |
| `verify_invisibility` (2a) / `verify_lore_check` / `driver_sce1_events` | 隠密の呼び方 | `optKeys` が両方そろうか確認 |
| パネルを click で閉じる装置(`driver_bgm_mine` ほか 8 本) | overlay の click | カード上の click で閉じられることを確認 |

⚠ 本数と色は 2026-10-06 時点の実測ではなく、起草時の grep による。**項目 1 で走らせ直して確定する。** 母集団の非退行は恒例どおり(post86 流用 + 影 / clone)。

---

## 9. 実機/実感の確認(ここが本当の受入)

- PC と iPhone 縦で、左上のパネルが小さすぎて読めない / 邪魔、になっていないか。
- 罠の「解除する / 迂回する」を左上で押せるか(指で押せる 44px 前後か)。
- 戦闘開始時の奇襲の吹き出しで、何が起きたか伝わるか。
- クリア金貨の補填の量(宝箱が無くなって物足りないか)。
- ⚠ ローカルは http 起動で。

---

## 10. changelog(⚠ `index.html` を触るので必須)

    py tools/add_changelog.py "<b>判定は画面左上に小さく</b> — 探索や罠の判定が画面の隅に出るようになり、戦闘中は判定の窓を出さない。道中の宝箱はいったん無くし、そのぶんクリア報酬の金貨を増やした。"

---

## 11. やらないこと

- ⛔ 宝箱の新しい置き方(後日の専用チケット)。巻物・装備の代わりの入手口も同じ。
- ⛔ 酒場(`tavern.html`)と街道(`world.html`)の判定パネル。
- ⛔ `js/skill-check.js` の既定値(待ち時間・構造)。
- ⛔ 罠以外の選択ダイアログ(檻・霊・スクロール・分岐ノード・Sce1 イベント)の位置。
- ⛔ 伝承判定 #76 の見せ方。
- ⛔ **`実装依頼書/README.md` への行追加**(#86 着地後)。用意してある行:

    | 87 | [2026-10-06_corner-check-no-road-chests.md](2026-10-06_corner-check-no-road-chests.md) | **承認済** | 0% | 判定パネルを左上へ小さく(暗幕なし・`index.html` の CSS 上書きだけ = 酒場と街道は不変)+ 罠の解除/迂回も左上 + 戦闘中は判定パネルを出さない(隠密は裏で振って吹き出し)+ 道中の宝箱を廃止してクリア金貨で補う(竜の財宝・鍵束は残す)。⚠⚠ 探索ターンの非 await の穴(パネル中に敵が動く)を直す / 宝箱は乱数の消費を変えずに捨てる / kind 関門で止めると罠も消える。撤退 `?cornercheck=0` / `?roadchest=0`。#86 完了で着手可 |

---

## 12. 実装結果

(実装窓が埋める)
