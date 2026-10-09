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

### 12-0. 基準取り(項目1・HEAD f0a9626)

測定日 2026-10-09(実装窓・dev-loop 項目1)。本番ファイル(`index.html` / `tavern.html` / `world.html` / `audio.js` / `js/*` / `tools/*`)は 1 バイトも触っていない。
測定プローブ = 実装窓の scratchpad `item1/`(`probe87a.js` 宝箱の湧き口をノード単位で数える・port **10621** / `probe87b.js`・`probe87e.js` 左上の矩形・仮の上書き CSS・§2-3 の穴・戦闘中の隠密・隠し扉・port **10622** / `anchors87.py` = #87 の領域を文字列で握る tools の洗い出し)。いずれも内蔵 node http + 実 Chrome headless、CSS と関数の包みは**ページ内へ実行時に注入**しただけ。

⭐ `baa5a67`(#86 完了)・`1eaf8c4`(post86 の走査点)と `f0a9626` で `index.html` `a81f6f71` / `tavern.html` `b2bfb137` / `world.html` `45c2e152` / `audio.js` `311aee29` / `js` `86e8ad50` / `tools` `b9fe4e53` / `assets` `d1b418e2` の OID が全部同じ(差分は `実装依頼書/*.md` だけ)。

#### 行番号(§2 の `cdebd24` → `f0a9626`。#86 で index は概ね +56 行)

| 何 | §2 の記載 | f0a9626 |
|---|---|---|
| `js/skill-check.js` の `AUTO_ROLL_MS` / `RESULT_HOLD_MS` | 86 / 94 | **86 / 93**(全 518 行) |
| 同 `ensureStyles()` / CSS を head へ足す行 | 208-260 | **208-261**(`document.head.appendChild(st)` **260** = 初回のパネル表示時に注入 ⇒ index の `<style>` より後勝ち ⇒ 上書きは `!important` 必須) |
| 同 `ensurePanel()` / `showPanelAndRoll()` | 263 / — | **263** / **325**(`ov.classList.add("show")` 386) |
| 同 overlay の click / keydown / ボタン | 450 | **450 / 451 / 452** |
| 同 auto 即決 | 482 | **482**(`global.__autoplay \|\| opts.auto` ⇒ `d20()` 1 回で即決・UI を出さない) |
| skill-check.js を読む行 | index 3085 / tavern 2841 / world 622 | index **3103** / tavern **2858** / world **622** |
| tavern の z-index 上書き(前例) | 2416 | **2416** `#skillCheckOverlay { z-index: 220 !important; }` |
| `runRoomSearchCheck()` / 呼び口 | 25961 / 26020 | **26017** / **26076**(Promise を返す・`skillCheckActive=true; dialogPaused=true` 26072-26073・finally で両方 false 26088-26091) |
| 判定対象の収集 | — | 罠 **26036** / 隠し宝箱 26038 / ミミック 26040 / 隠し扉 **26049** / 4 種とも 0 なら return **26056-26057** |
| `tryStealthSurprise()` / 呼び口 | 26086 / 26109 | **26142** / **26165**(opts = title / flavor / voiceIds の 3 キー) |
| `runEncounter()` / `encounterActive = true` / 伝承 / 隠密の await | 21971 / 22158 | **22026** / **22027** / `await runLoreCheck()` **22213** / `await tryStealthSurprise()` **22214** |
| `runTrapDisarmCheck()` / showCharChoice / showChoice / 判定 | 26139 / 26163-26170 | **26195** / **26221** / **26226** / **26247** |
| `tryPickLock()` / 呼び口 / `tryDiscoverChest()` | 26369 / 26385 / 24492 | **26425** / **26441** / **24548**(encounter ガード 24550・skillCheckActive 24552・`tryPickLock(chest)` 24584) |
| 若い司祭 / Sce1 EV-2 / 従者 / グリクス | 25682 / 26628 / 27171 / 27585 | `runNoviceDialog` 25713→**25738** / `runMineWatchEvent` 26649→**26684** / `runServantEvent` 27188→**27227** / `runGrixEvent` 27607→**27641** |
| `runLoreCheck()`(auto の手本) | 28582 / 28618 | **28638** / **28674**(`{ auto: true }`) |
| `tryUnlockDoor()` | 37423 / 37428 | **37462** → **37480 / 37485** |
| `revealExitHints()` | 38010 | **38042** → **38067** |
| `heroSlideOneTileExplore()` | 19731 付近 | **19735**(非 await の 2 行 = **19764 / 19765**・`await exploreAllyTurn` 19767・`await exploreEnemyTurn` 19768) |
| `exploreAllyTurn()` / `exploreEnemyTurn()` | — | **19276** / **19332**(どちらも `dialogPaused` / `skillCheckActive` を見ない) |
| `moveEnemies()` | 19009 | **19039**(19042 で `dialogPaused \|\| narrationHold \|\| narrationPlaying` なら停止。heroAI 19780 もこのループの中 19248) |
| `let dialogPaused` / `let skillCheckActive` | — | **14695** / **25920** |
| `showChoice()` / `showCharChoice()` / `setChoiceOpen()` | 14670 / 14726 | **14703** / **14759** / **14700** |
| `#choiceDialog` の CSS | 1960-2082 | **1993-2101**(基本 1993・`.show` 2023・`body.choice-open` 2052・狭幅 @media 2081-2101) |
| `--ui-menu-w` / `#partyPanel` / `#partyToggleBtn`(collapsed) / `computeUiMetrics()` | 2199 / 2233 / 7583 | `:root` **20** / **2217** / **2252** / **7608** |
| `#battleBanner` / `#dmMessage` / `#eyeScoutPanel` / `#phaseIndicator` | — | **2963** / **933** / **3089** / **1057**(狭幅 1091) |
| `roomChests` / `CHEST_SPAWN_CHANCE`・`CHEST_LOCK_CHANCE` | 24115 | **24171** / 24175・24176 |
| `pickChestLoot()` | 24302 | **24355** |
| `spawnRoomChests()` / `spawnHiddenChests()`(鍵束) / `spawnExplorationChests()` | 24336 / 24379(24420-24438) / 24450 | **24392** / **24435**(鍵束 **24480-24496**) / **24506** |
| `spawnDragonHoard()` / `spawnDetourChests()` | 24684 / 36582 | **24740** / **36639** |
| `spawnNodeEntities()`(呼ぶ順) | — | **36595-36621**(RoomChests 36597 → Traps 36599 → Hidden 36601 → Exploration 36603 → 檻・守護者ほか → DragonHoard 36618 → Detour 36620 =「必ず最後」) |
| `withNodeRng()` / `makeNodeRng()` | — | **11607** / **11598**(種 = `ノードid + "/entities"` だけ = シナリオに依らない) |
| `spawnTraps()` | — | **25859**(`roomChests` を見ない) |
| kind 関門 | df-mapdef.js:2091-2114 | **js/df-mapdef.js:2086-2114**(`KIND_SPAWNS_TRAPS` 2086 / `KIND_SPAWNS_ROOM_CHESTS` 2087 / `excludedRoomIdxForKind` 2109 / `chestExcludedRoomIdxForKind` 2112)・index の `applyNodeKindExclusions` **5136** / `NODE_EXTRA_SPAWN_KINDS` **4412-4448** |
| `SCENARIOS` | — | **11217-11364**(塔の母 `clearGold: 300` **11360**) |
| 街道の襲撃 / 生成クエストの `currentScenario` | 11380 | **11389-11413**(`clearGold` 11405) / **11414-11446**(⚠ `clearGold` の欄が無い = K11) |
| 勝利の金貨 | 40524 | **40581-40583**(`const clearGold = (currentScenario && currentScenario.clearGold > 0 && !escortWagonLost())` / `earnedGold = coins + clearGold`) |
| 寄り道 `DETOUR_OFF` / `detourTable()` / `detourNodeDef()` / `offerDetour()` / `tickNodeChoice()` | — | **4459** / **39072** / **39108**(`if (DETOUR_OFF \|\| MINE_FOLD_OFF) return null;` 39109) / **38677** / **38703** |
| 撤退スイッチの手本 | `LORE_ON` 28489 / `BOARD_FADE_ON` 3521 | `LORE_ON` **28545** / `BOARD_FADE_ON` **3539**(`const X_ON = new URLSearchParams(window.location.search).get("x") !== "0";`)/ #86 は関数型 **3895-3898** |

#### §2 の主張の実測(○ = 成立 / × = 崩れ → K)

| § | 主張 | 実測 | 判定 |
|---|---|---|---|
| 2-1 | 本体は `js/skill-check.js`・3 枚が読む・DOM 構造・CSS は実行時注入 | 上表のとおり。DOM は `#skillCheckOverlay > #skillCheckCard > img.scIcon / .scTitle / .scFlavor / .scMeta / .scRoster / .scResult / button#scRollBtn / .scHint` のまま | ○ |
| 2-1 | overlay `inset:0; z-index:105; background:rgba(8,6,2,0.55)`・card `width:min(420px,90vw)`・border 6・padding 18/20/16・アイコン 56・タイトル 18・ダイス 34・狭幅 @media 無し | 実 Chrome: overlay = 画面全体 / 背景 `rgba(8, 6, 2, 0.55)` / pointer-events auto / z 105。カード **472×527.5**(1280×900)・**390×527.5**(390×844 = 90vw に border/padding が乗って画面幅に張り付く)・4 人編成の結果表示時 495.5 | ○ |
| 2-1 | 1 枚 ≈ 6.8〜7.1 秒 | 2000 + 出目アニメ(60ms × 16〜21 + 180)+ 3600 = 6.74〜7.04 秒 | ○ |
| 2-1 | 進める操作 3 つ・auto/autoplay は即決 | ○。overlay の click は `ov.addEventListener`(450)= カードの上の click は**バブリングで overlay の listener に届く**。overlay を `pointer-events:none` にしても届く(実測: 仮の上書き CSS でカードを実クリック → ロール → 再クリックで閉じる、3 姿勢とも) | ○ |
| 2-1 | tavern 2416 が上書きの前例 | ○(2416)。注入 `<style>` は**最初のパネル表示時**に head 末尾へ足される(260)⇒ 同じ詳細度なら JS 側が後勝ち ⇒ `!important` が必要 | ○ |
| 2-2 | 呼び口 = index 12 + tavern 1 + world 2 | index 12 / tavern 1(`runPrepIntel` 7473)/ world 2(`onRoadChoice` 1349・`onAmbushChoice` 1444) | ○(数え方は K1) |
| 2-2 | 戦闘中に出る経路は隠密だけ | ○。他 11 口はどれも encounter ガードの内側(探索判定 26018・罠 26196・開錠は `tryDiscoverChest` 24550・司祭は `tryApproachNovice`・Sce1 3 本は `tryInteractSce1Event`・扉と出口ヒントは `tickNodeChoice` 38707)。**実測 (B3)**: `encounterActive = true` で `tryStealthSurprise()` を呼ぶと**パネルが出る**(`#skillCheckOverlay.show`・タイトル「隠密判定」・opts = title / flavor / voiceIds・auto なし) | ○ |
| 2-3 | 非 await の穴でパネル表示中に敵が 1 マス詰める | **ヘッドレスで再現した (B2・probe87e)**。沼 n4・主ループを `narrationHold = true` で凍結・追跡状態の lizardRaider を主人公の 5 マス東へ置き `heroSlideOneTileExplore` を直に呼ぶ ⇒ t=2102ms 探索判定のパネルが出る(敵 (17,13)・dialogPaused=true)→ t=4090ms `exploreEnemyTurn` 開始(パネル表示中・dialogPaused=true)→ t=4652ms 終了で敵 **(16,13)** = 1 マス詰めた・パネルはまだ表示中 | ○ |
| 2-3 | 穴の範囲 = 探索判定 | 罠の選択と開錠でも同じ穴(K2) | × K2 |
| 2-4 | 罠の 2 か所・`#choiceDialog` の CSS 範囲・共用 | ○(行番号は上表)。共用の呼び元 = `maybeOfferRestSummon` 14612(召喚スクロール・autoSkipMs)/ `maybeDropShadowAmulet` 17781 / 檻 `tryInteractCage` 25140・25148 / `offerMageHand` 25333 / 霊 `runCaelumDialog` 25483 / 祭壇 `runAltarDialog` 25585 / 司祭 `runNoviceDialog` 25719 / 罠 26221・26226 / Sce1 `runMineWatchEvent` 26653・`runServantEvent` 27192・`runGrixEvent` 27614 / 出口 `chooseExit` 37623 | ○ |
| 2-4 | `verify_mage_hand` (7d) が argc を測る | ○ `tools/verify_mage_hand.js:403`(showChoice を包んで `argc` を記録)/ **:846-847**(3 引数で 1 回)/ (7a) **:857** / (11a) **:815**。押下は `clickChoice()` **:508-524** が `#choiceDialog.show` の中の button を探す(K4) | ○ |
| 2-5 | 左上の衝突物の値 | ○(下の矩形表)。狭幅の `#phaseIndicator` が ☰ の下 63px 案と重なる(K5)。(1b) は幾何的に成立しない姿勢がある(K6) | × K5・K6 |
| 2-6 | 湧き口 5 つ・配列は `roomChests` 1 本 | ○ | ○ |
| 2-6 | 期待個数の目安 = hiddenChestCount(廃坑 2 …)+ 玄室 × 0.5 + 寄り道 4 | 既定の盤面で**実際に湧く数は別物**(K7・下の表)。廃坑は隠し宝箱 0・寄り道 4 だけ / 玄室宝箱は全シナリオ 0 | × K7 |
| 2-6 | kind 関門を spawnTraps と共有 | ○(df-mapdef.js 2086-2114。`excludedRoomIdxForKind` は罠・隠し宝箱・探索宝箱の 3 本共通) | ○ |
| 2-6 | push 直前で捨てれば乱数の消費は変わらない | 湧き口ごとに判定(下の「乱数」)。3 口とも消費は不変。ただし `roomChests` の**占有**を読む後段がある(K8) | ○(条件つき K8) |
| 2-6 | 罠も鍵束もミミックも無い部屋では振らない(新しい条件) | 判定対象は**罠・隠し宝箱(鍵束を含む)・ミミック・隠し扉の 4 種**で、4 種とも 0 なら**今すでに振らない**(26056-26057)。宝箱が消えれば自然に成立する(K9) | × K9(条件の追加は不要) |
| 2-7 | `pickChestLoot` の分布・金貨 EV ≈ 9.2G | 分布は ○(24355-24375)。EV ≈ 11.7G(K10・25G の丸めには影響しない) | △ K10 |
| 2-7 | 補填の口 `clearGold`・前例 2 つ | ○(40581)。生成クエストの `currentScenario`(11414-11446)は `clearGold` を**写さない** ⇒ 今のままでは 0(K11)。既定シナリオの `currentScenario` は `SCENARIOS[id]` **そのもの**(11448-11449) | × K11 |
| 2-7 | clearGold を持たないシナリオでも勝利処理が動くか | ○ `currentScenario.clearGold > 0` だけを見る ⇒ 値さえ入れば廃坑なども払われる。`escortWagonLost()`(34956)は馬車の無い盤面では常に false | ○ |
| 2-8 | 撤退スイッチの作法 / changelog が鳴る | ○(上表)/ `scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")`・`core.hooksPath = scripts/hooks` | ○ |
| 2-9 | tools の最大 / 10600 | `arg('port', …)` の最大 = **10574**(`verify_class_line`・変異 10575〜10585)/ 10600 = `probe_magehand_reach`。`grep "1058[6-9]\|1059[0-9]" tools/*.js` は `verify_class_line.js:65` のコメント(「次の base = 10586」)だけ ⇒ **10586〜10599 は空き**。Chrome の制限ポートはこの帯に無い(近いのは 10080 のみ) | ○ |

#### 左上の矩形(probe87e・実 Chrome・沼・4 人編成・`startGame` は呼ばず `#phaseIndicator.show` だけ付けた)

| 要素 | desktop 1280×900(展開・`--ui-menu-w`=280) | desktop 畳み(`ui-collapsed`・0) | compact 390×844(`ui-compact`+`ui-collapsed`・0) |
|---|---|---|---|
| `#partyToggleBtn` ☰ | display:none | (11,11)-(55,55) z61 | (11,11)-(55,55) z61 |
| `#partyPanel` | (0,0)-(280,900) z10 | display:none | (-300,0)-(0,844) z41(ドロワー収納) |
| `#phaseIndicator` | (1096.6,12)-(1266,52) z50 | 同左 | **(44.1,8)-(345.9,72)** z50 = 上中央・幅 302 |
| `#settingsBtn` ⚙ | (1073.7,11)-(1108,38) z60 | 同左 | (338,11)-(382,55) |
| `#battleBanner`(.show) | (587,68)-(693,91) z50 | 同左 | (142,68)-(248,91) |
| `#dmMessage`(.show・2 行の文) | **(320,82)-(960,160)** z80 | 同左 | **(26,82)-(364,184)** |
| `#eyeScoutPanel`(.show・3 体) | (534,172)-(746,270) z81 | 同左 | **(97.5,172)-(292.5,343)** |
| `#dmNarration`(起動直後に表示中) | (228,36)-(1052,249) z100 | 同左 | (-16,36)-(406,269) |
| 判定パネル(今) | overlay 全面・カード (404,186)-(876,714) | 同左 | カード (0,158)-(390,686) |
| 判定パネル(仮の上書き CSS ※) | (288,8)-(548,312) **h 304**(結果表示時 289) | (8,63)-(268,367) | (8,63)-(268,367) |

※ 仮の上書き = 幅 260・padding 8/10・アイコン 28・タイトル 13・flavor 非表示・行 11px・ダイス 22・ボタン 12px(実装の値ではない。高さの見積り用)。overlay は `pointer-events:none` / 背景透明、カードの外の点(画面右寄り中央)の `elementFromPoint` は `HTML`(ゲーム側)、カードの上は card の子(3 姿勢とも)。
⇒ **4 人編成で 304px > 300px**(依頼書 §4「300px を超えるならさらに詰める」に該当)。ロール前はボタン行、結果表示時は結果行がある。

#### 消える宝箱の個数(probe87a・本番の入口 `buildNode(resolveNodeMapDef(id), id)` で全ノードを組み、湧き口の関数を包んで増分を数えた)

⚠ ノードの乱数は `makeNodeRng(ノードid + "/entities")` = **ノード id だけで決まる決定論**(実プレイでも毎回同じ)。玄室宝箱の 50% 抽選は「n4/entities」「n7/entities」「n0/entities」の先頭の乱数で決まり、どれも外れ ⇒ 既定では**玄室宝箱は全シナリオ 0 個**。

| シナリオ(既定 = 分岐グラフ) | ノード(kind・兼務) | 玄室 | 隠し | 鍵束 | 寄り道 | 竜の財宝 | 罠 | **消える個数** | 読みでの算出 |
|---|---|---|---|---|---|---|---|---|---|
| 廃坑 `goblin-mine` | n0 start / n1 boss(兼務なし) | 0 | **0** | — | **4**(n1) | — | **0** | **4** | n0/n1 とも search/loot を兼ねない ⇒ `hiddenChestCount: 2` と `trapCount: 3` は既定では**使われない**(K7) |
| 森 `bandits-forest` | n7 boss + [search, loot] | 0 | 3 | 1(盗賊同行 + 噂。残す) | — | — | 4 | **3** | 3 + 0.5(玄室 1 室 × 50% → 決定論で外れ) |
| 沼 `lizard-swamp` | n4 start + [search, loot] / n6 event / n7 boss | 0 | 3 | — | — | — | 4 | **3** | 3 + 0.5 → 0 |
| 砦 `orc-fort` | n4 + [search, loot] / n7 | 0 | 4 | — | — | — | 5 | **4** | 4 + 0.5 → 0 |
| 神殿 `undead-temple` | n4 + [search, loot] / n7 | 0 | 4 | — | — | — | 5 | **4** | 4 + 0.5 → 0 |
| 竜 `dragon-lair` | n4 + [search, loot] / n7 boss | 0 | 5 | — | — | 3 + ミミック 1(残す) | 6 | **5** | 5 + 0.5 → 0 |
| 塔の母 `tower-mother` | n0 + [search, loot] / n1 | 0 | 3 | — | — | — | 4 | **3** | 3 + 0.5 → 0 |
| 生成クエスト(単一マップ・2 部屋) | tier1〜4 を各 3 回 | 0 | 2 / 3 / 4 / 5 | — | — | — | 3〜6 | **= hiddenChestCount** | 玄室は除外 {0,1} で候補 0・隠し宝箱は部屋 0 に全数(12 回とも一致) |
| 隊商護衛 / 街道の襲撃 | — | 0 | 0 | — | — | — | 0 | **0** | `hiddenChestCount = 0`(tavern 10182 / js/road-events.js 486) |
| (参考)`?graph=0` の単一マップ | 7 シナリオ | 0 | = hiddenChestCount | 森+盗賊 1 | — | 竜 3+1 | = trapCount | 廃坑 2 / 森 3 / 沼 3 / 砦 4 / 神殿 4 / 竜 5 / 塔 3 | 撤退口なので補填表の基準にはしない |

- 隠し扉: 既定 7 シナリオの全ノードで **0 枚**(probe87b B4。扉そのものは 0〜2 枚・施錠 1 枚は沼 n4)。
- 生成クエストの `hiddenChestCount` は tier で **2 / 3 / 4 / 5**(`tavern.html` 3885-3909 の `DATA.tiers` → `combatParams()` 4273)。依頼書の「自作依頼 2」は index 側の既定値(`_genScenario.hiddenChestCount || 2` 11423)。

#### 金貨の補填(案 = 現値 + 消える個数 × 25G)

| シナリオ | 現 `clearGold` | 消える個数 | 加算 | 加算後 |
|---|---|---|---|---|
| 廃坑 | なし(0) | 4(寄り道) | +100 | **100** |
| 森 | なし | 3 | +75 | **75** |
| 沼 | なし | 3 | +75 | **75** |
| 砦 | なし | 4 | +100 | **100** |
| 神殿 | なし | 4 | +100 | **100** |
| 竜 | なし | 5 | +125 | **125** |
| 塔の母 | 300 | 3 | +75 | **375** |
| 生成クエスト tier1〜4 | なし(欄も無い・K11) | 2 / 3 / 4 / 5 | +50 / +75 / +100 / +125 | 50 / 75 / 100 / 125 |
| 隊商護衛・街道の襲撃 | なし / 80(js/road-events.js 487) | 0 | 0 | 不変 |

⚠ 個数は「盤面に湧く数」。隠し宝箱は探索判定に勝たないと見つからない(宝箱だけの部屋は DC = perceptionDC − 2・罠の部屋は perceptionDC)ので、**実際に手に入っていた期待個数はこれより少ない**(25G の丸めで吸収する前提。単価は §8 で測らない)。

#### 乱数(§2-6 の決定を湧き口ごとに判定)

`spawnNodeEntities` の中の `Math.random` の消費順: RoomChests(部屋ごとに 50% 抽選 1 → 当たれば床選び 1・施錠 1・`pickChestLoot` 1〜2)→ Traps(候補数 −1 回のシャッフル)→ Hidden(候補数 −1 回のシャッフル → 箱ごとに施錠 1・`pickChestLoot` 1〜2 → 鍵束 1)→ Exploration(`EVENT_ITEMS = []` で即 return・0 回)→ 檻・守護者ほか → DragonHoard(ボスノードだけ)→ Detour(箱ごとに施錠 1・`pickChestLoot` 1〜2)。

| 湧き口 | push 直前で捨てたときの消費 | 占有への影響 | 判定 |
|---|---|---|---|
| `spawnRoomChests` | 不変(抽選・床・施錠・中身を全部引いた後で捨てる) | `spawnHiddenChests` の候補が `roomChests` のタイルを避ける(24450-24452)⇒ **search を兼ねるノードで玄室宝箱が実際に湧いたときだけ**、隠し宝箱の候補数 = シャッフルの消費が変わる。既定は全ノード 0 個なので発生しない。`spawnTraps` は `roomChests` を見ない | 可 |
| `spawnHiddenChests`(鍵束以外) | 不変(シャッフル後、箱ごとの施錠・中身を引いてから捨てる) | 鍵束の空きタイル `usedTiles`(24482)が `roomChests` から作られる ⇒ 捨てた箱のタイルが空き扱いになり**鍵束の位置だけ動く**(消費は 1 回のまま) | 可(鍵束の位置は K8) |
| `spawnDetourChests` | 不変 | 末尾なので後段なし | 可(寄り道の扱いは下) |
| `spawnDragonHoard` | 残す | `isOccupied` が `roomChests` を見るが、ボスノードには隠し宝箱が湧かない(既定) | 残す |

- 別解: 3 口とも今どおり push させ、`spawnNodeEntities` の**末尾(spawnDetourChests の後)で 1 回だけ**「捨てる箱」を `roomChests` から抜いて DOM も外す。占有も含めて**全部の位置が 1 ビットも動かない**(配列は `splice` / `length = 0` で identity を保つ。`roomChest<idx>` の DOM id と `saveNodeState` の添字はビルドごとに決定論なので整合する)。
- `spawnTraps` の個数・位置はどちらの方法でも不変(消費順が同じ + `roomChests` を読まない)⇒ §8 (5b) は位置まで一致を要求できる。

#### 廃坑 n1 の寄り道(§2-6 の判断材料)

- 寄り道スポットの中身は**宝箱だけ**(`spawnDetourChests` の注記 36624「寄り道に『行った甲斐』を持たせる唯一の中身」)。羊皮紙のヒントも「道具が置きっぱなし」「トロッコが並んでいる」= 宝を匂わせる文。s4 は「玉座の間の前を横切る」危険つき(`detourTable()` 39072〜 の s4 行)。
- 宝箱を止めて矢印だけ残すと、**空の場所へ歩かせる選択肢**が 4 本残る(s4 は危険だけが残る)。
- ⇒ **推奨: 宝箱と一緒に寄り道の提示も止める**(`?roadchest=0` で戻す)。止め方は `detourNodeDef()` に「宝箱停止中は null」を**別の行で**足すのが最小(`?detour=0` と同じ盤面 = P8 の盤面)。⚠ `if (DETOUR_OFF || MINE_FOLD_OFF) return null;`(39109)と `if (chest.detourSpot) continue;`(19677)は `driver_grid_p9` の内蔵変異 `nodetour` / `foldleak` / `navchest` が逐語で握っているので**書き換えない**。
- 影響: `driver_grid_p9` / `probe_p9_tour` は寄り道の周回そのものを測る ⇒ `?roadchest=0` の腕へ移す(期待値は 1 文字も変えない)。廃坑の補填 +100G はこの 4 個ぶん。

#### 崩れた主張(K1〜K14)

- **K1(軽微)** world.html の呼び口は `SC.resolveSkillCheck(`(1349 / 1444)なので、`SkillCheck.resolveSkillCheck(` の grep では 0 件。数(2)は正しい。
- **K2 ⚠ §2-3 の穴は探索判定だけではない。** `runTrapDisarmCheck()`(19765)も await されず、罠の選択(押すまで無期限)の間に仲間・敵の手番が 1 回走る。`tryPickLock` は別の 400ms interval(`tryDiscoverChest`)から来るので、探索ターンの途中で開錠パネルが開くこともある。⇒ (a)「2 つの呼び出しを await する」だけでは開錠の経路が残る。(b)「`exploreAllyTurn` の前(19766 と 19767 の間)で `skillCheckActive` が落ちるまで待つ」なら 3 経路とも塞がる(罠の選択中も `skillCheckActive = true` 26213)。⭐ 推奨 = **(b)**。⚠ (a) にすると、探索判定の直後の同じ歩で罠の選択が出る(今は `skillCheckActive` で弾かれて次の歩)= 挙動が 1 つ増える。変異 `noawait` は「待ちの 1 行を消す」で作れる。再現の型は B2(`narrationHold = true` で主ループだけ凍結 + `gameStarted = true` + 追跡状態の敵 + `heroSlideOneTileExplore` を直に呼ぶ)。⚠ `startGame()` を呼ぶと heroAI が勝手に歩いてゲーム自身の探索判定パネルが同時に開き、測定が汚れる(probe87b で踏んだ: 2 枚目のパネルが 1 枚目の dismiss タイマーで閉じる = `ov._dismissTimer` の上書き。#87 とは無関係の既存の性質で、ゲームは `skillCheckActive` で二重表示を防いでいる)。
- **K3(参考)** 隠密は `skillCheckActive` を立てない(26142-26185)。`auto: true` にすれば無関係になる。`auto` にすると `showPanelAndRoll` の行ごとの d20 とアニメの `Math.random` を引かなくなる ⇒ 戦闘の乱数列がずれる(戦闘は元から非決定)。戦闘開始が約 7 秒早くなる。
- **K4 ⚠ 罠の選択を「新しい器」にすると既存 golden が詰まる。** ダイアログを閉じる装置は `#choiceDialog .choiceButtons button` の末尾を押す(`driver_bgm_mine.js:222` / `verify_tower_mother.js:652` / `verify_walk_block.js:1015` / `verify_tower_mother_b.js` / `driver_encounter_mopup` / `driver_mine_wall` / `driver_wallbox`)、`verify_mage_hand` の `clickChoice()` は `#choiceDialog.show` の中の button を探す。⇒ **推奨 = `#choiceDialog` の器のまま罠のときだけ class を足す**(例 `.cornerChoice` を開く直前に付け、閉じたら外す)。`showChoice` / `showCharChoice` の引数は変えない(4 引数目を足すと `verify_mage_hand` (7d) の argc = 3 が赤)。class の付け外しを呼ぶ側の行で行えば (7a)(7d)(11a) は言い直し不要の見込み。⚠ `setChoiceOpen(true)` はログ枠を伏せる(2052)ので、左上の罠の選択中も下のログが消える — 伏せるかは実装窓が決める(`#choiceDialog` の CSS は触らない約束なので、伏せないなら class 付きのときに `body.choice-open` を立てない分岐が要る)。
- **K5 ⚠ 狭幅では ☰ の下 63px が `#phaseIndicator` と重なる。** compact の `#phaseIndicator` は上中央の札 (44,8)-(346,72)(1091 の @media・font 30px)。top 63 のパネルは x 8-268 で 9px 重なる(パネル z105 が上)。⇒ compact は top ≥ **80**(72 + 8)。desktop の畳み(☰ 55・`#phaseIndicator` は右上)は 63 で衝突なし。
- **K6 ⚠⚠ (1b)「上中央の `#battleBanner` / `#dmMessage` と交わらない」は幾何的に成立しない姿勢がある(要判断)。** desktop 展開: `#dmMessage` (320-960 × 82-160)とパネル (288-548 × 8-312) が x 320-548 で重なる(最大 680px 幅なら左端 300)。compact: `#dmMessage` (26-364 × 82-184)・`#battleBanner` (142-248 × 68-91)・`#eyeScoutPanel` (97-293 × 172-343) がパネル (8-268 × 80-384) と重なる(390px の画面では中央の帯が左上まで届く)。desktop 畳みでは重ならない。
  罠解除は `showDMMessage("罠の機構に手を伸ばす…", 1800)`(26244)の直後に判定パネルを出す = **実際に同時に出る**。パネル(z105)が DM 文(z80)の左を隠す。
  選択肢: (a) (1b) を「☰ / compact の `#phaseIndicator` と交わらない + desktop 畳みでは上中央の帯と交わらない」へ言い直し、展開・compact の DM 文との重なりはパネルが上で受け入れる / (b) パネルを DM 文の下へ逃がす(desktop top ≥ 168・compact ≥ 192 = compact で 4 人 300px が画面の下半分まで来る)/ (c) DM 文側を動かす(⛔ 依頼書の範囲外)。⭐ 推奨 = (a)。**項目3 の受入を書く前に決めること**(項目2 の実装は位置の値を選ぶだけなので止まらない)。
- **K7 ⚠ 消える宝箱の個数(§2-6/§2-7 の目安)は既定の盤面と合わない。** 廃坑は隠し宝箱 0(n0 start / n1 boss = search を兼ねない)で寄り道 4 だけ ⇒ 2 + 4 = 6 ではなく **4**。玄室宝箱は全シナリオで 0(loot を兼ねるノードは 50% 抽選がノード id の決定論で外れる・loot 専用ノードは畳みで消えた)⇒「玄室の数 × 0.5」は 0。補填表は上の実測で書く。
- **K8(条件)** push 直前で捨てる方式は乱数の消費を変えないが、`roomChests` の占有を読む後段(隠し宝箱の候補 24450-24452・鍵束の `usedTiles` 24482・竜の財宝の `isOccupied`)が「捨てた箱」を見なくなる。既定で効くのは**鍵束の位置**だけ(森 + 盗賊 + 噂)。⇒ 位置まで守るなら「捨てた箱のタイルを局所配列で `usedTiles` に足す」か「末尾で一括で抜く」(上の別解)。
- **K9 ⚠ 「罠も鍵束もミミックも無い部屋では振らない」は条件の追加が要らない。** 判定対象は罠・隠し宝箱(鍵束を含む)・ミミック・**隠し扉**の 4 種で、4 種とも 0 なら 26056-26057 で return 済み。宝箱が消えれば、既定で探索判定が出るのは罠のある部屋(森 n7・沼/砦/神殿/竜 n4・塔 n0)と竜 n7(ミミック)だけ。廃坑は罠も 0 なので**一度も出ない**。⛔ 隠し扉を条件から外さないこと(P6 の隠し扉は探索判定でしか見つからない・`tickNodeChoice` 38757 が await している。既定は 0 枚だが `?xxfold=0` の旧構成と自作マップで使う)。「隠された宝や…」の文は竜 n7(ミミックだけの部屋)で今後も出る。
- **K10(軽微)** 金貨の期待値は 9.2G ではなく ≈ 11.7G(金貨小の帯 0.005〜0.33 = 32.5% × 15 + 金貨大 17% × 40)。25G の丸めの根拠は変わらない。
- **K11 ⚠ 生成クエストは `clearGold` が勝利処理まで届かない。** `currentScenario` を組む 11414-11446 に `clearGold` の欄が無い(`tavern.html` の `gen` にも無い・`tavern.html` は触らない約束)。⇒ 加算は **index 側で `hiddenChestCount` から求める**。既定シナリオは `currentScenario === SCENARIOS[id]` なので、`SCENARIOS` へ値を書くか勝利処理で足すかのどちらでも払われる。⭐ 推奨 = 勝利処理の 1 か所で `clearGold` に加算額を足す(`?roadchest=0` で 0)。その場合も 40581 の行は**書き換えない**(K12)。
- **K12 ⚠ #87 の領域を逐語で握る既存の負のコントロール(`anchors87.py`)。素は緑のまま `--negative` / 内蔵変異だけが exit 3 になる型なので、下の行は文字列を変えずに残し、足す処理は別の行に書く。**
  - `verify_road_ambush` 変異 `goldalways`(`tools/verify_road_ambush.js:290`)= 40581 `        const clearGold = (currentScenario && currentScenario.clearGold > 0 && !escortWagonLost())`
  - `verify_invisibility` = `tryStealthSurprise` の 6 行(26147 `if (targets.length === 0) return false;` / 26155 `if (!canSneak) {` / 26159 `if (!invisCaster) return false;` / 26167 flavor の三項 / 26173 `const n = applySurpriseStun(targets);` / 26183 `if (invisCaster) setPartyInvisible(false);`)⇒ `auto: true` は**新しい行**で足す
  - `verify_mage_hand` = 26220 `        if (handCaster) {` と 26222「メイジハンドで解除する — 失敗しても傷を負わない」
  - `verify_arcane_eye` 変異 `nopause` = `const prevSk = skillCheckActive, prevDp = dialogPaused;` + 改行 + `skillCheckActive = true; dialogPaused = true;` を **count: 2** で握る(37926-37927 / 37975-37976)⇒ 薄いラッパや待ちの関数に**この 2 行の形を写さない**(3 件になると exit 3)
  - `driver_grid_p9` / `probe_p9_tour` = 39109 / 19677 / 寄り道の台帳 s3 の行
  - `verify_lore_check` = 22213 `await runLoreCheck();` の行 / `verify_tower_mother` = 4446 / `verify_dragon_fold` = 24777・4441 / `driver_doors_p6` = 38757 / `driver_mapdef_step1` = 24398 `ROOM_CHEST_EXCLUDED_ROOMS.has(i)` と `_genScenario.trapCount || 3` / `driver_choice_logslot` = `#choiceDialog` の CSS 3 行(触らない約束どおり)
- **K13 ⚠ §8 の言い直し表に無い本: `verify_tower_mother_b` (1h)** は `SCENARIOS['tower-mother'].clearGold === 300` **かつ** `lastResult.gold − coins === clearGold` を測る(`tools/verify_tower_mother_b.js:100 / 517 / 700-702`)。`SCENARIOS` を 375 にしても、勝利処理で +75 しても赤 ⇒ `?roadchest=0` の腕で走らせるか、加算額を差し引く形へ言い直す。
- **K14(装置)** 判定パネルを閉じる既存の装置は全部 `ov.click()`(DOM の合成 click = 当たり判定を通らない)なので、overlay を `pointer-events:none` にしても閉じられる。カードを座標で実クリックする本は 0 本。

#### ゲートの置き場所(§6-3)の判断材料

- 12 口のうち 11 口は呼び元で encounter を弾いている。戦闘中に届くのは隠密だけ。
- 既存の tools 10 本が `SkillCheck.resolveSkillCheck` を**プロパティごと差し替えて**出目を決めている(`driver_room_search_roll` / `driver_trap_disarm` / `driver_sce1_events` / `driver_doors_p6` / `verify_lore_check` / `verify_mage_hand` / `verify_arcane_eye` / `verify_road_ambush` / `verify_swamp_novice` / `probe_s5s6_clear`)。⇒ 薄いラッパは**呼んだ時点で `window.SkillCheck.resolveSkillCheck` を引く**こと(関数を変数に握ると差し替えが効かなくなる)。
- `verify_invisibility` (2a) は 2 腕の opts のキー集合の一致を見る ⇒ 隠密は 2 腕とも同じキー(`auto` を足すなら常に足す)にすれば不変。

#### 名指し golden — 着手前の色(`f0a9626`・逐次・単独・本番ツリー・2026-10-09 07:00〜08:55)

§8 末尾の表の本は全部実在(名前の訂正なし。`verify_road_*` = `verify_road_ambush` / `verify_road_boon` / `verify_road_events`)。「パネルを click で閉じる装置」は `ov.click()` を持つ本 = `driver_bgm_mine` / `driver_encounter_mopup` / `driver_mine_wall` / `driver_wallbox` / `verify_tower_mother` / `verify_tower_mother_b` / `verify_walk_block` / `verify_prep_retire` / `verify_road_ambush`(+ probe 3 本)。表に無いが #87 の真ん中を測る `driver_room_search_roll`(1 部屋 1 ロールの呼び出し回数)/ `driver_choice_logslot`(`#choiceDialog` の帯)/ `driver_scroll_autoskip` も足した。**45 腕・146.4 分**(`--negative` を持つ本は `--negative` も。`verify_tower_mother_b --negative`(69 分)と `verify_walk_block --negative` は post86 の色を使い、走らせていない)。試遊サーバ 8765 は着手時に LISTEN 0 件で、触っていない。

| 本 | 素: exit / 集計 / 秒 | `--negative`: exit / 結果 / 秒 | post86 と |
|---|---|---|---|
| `driver_trap_disarm` | 0 / 44/44 / 0.9 | — | 同 |
| `driver_skillcheck_roster` | 0 / 13/13 / 3.9 | — | 同 |
| `driver_fix4_help_bonus` | 0 / 13/13 / 3.9 | — | 同 |
| `driver_room_search_roll` | 0 / 39/39 / 1.0 | — | 同 |
| `driver_choice_logslot` | 0 / 29/29 / 5.1 | — | 同 |
| `driver_scroll_autoskip` | 0 / 9/9 / 3.9 | — | 同 |
| `driver_grid_s2` | 0 / 124/124 / 5.5 | — | 同 |
| `driver_wallbox` | 0 / 28/28 / 5.9 | — | 同 |
| `driver_bgm_mine` | 0 / 37/37 / 11.1 | — | 同 |
| `verify_fort_fold` | 0 / 30/30 / 1.3 | **3** / 変異 `addn6` のアンカーが 3 箇所 / 3.8 | 同(型3・下) |
| `verify_swamp_fold` | 0 / 30/30 / 2.2 | **3** / 変異 `entryn0` のアンカーが 4 箇所 / 11.2 | 同(型3・下) |
| `verify_dragon_fold` | 0 / 35/35 / 1.2 | 0 / 全変異が担当どおり / 8.3(再走 2 回とも)※ | 同 |
| `verify_lore_check` | 0 / 26/26 / 3.1 | 0 / 全変異が担当どおり / 33.3 | 同 |
| `verify_walk_block` | **1 / 22/23**(赤 = (3d) badge 定義 44 件の固定値・実測 47)/ 15.1 | (post86: 0 / 54/54) | 同(型3・#86 §12-0) |
| `driver_mapdef_step1` | 0 / 208/208 / 19.0 | — | post86 は clone で 207/208(環境要因 #80 K25)・本番ツリーでは満点 |
| `driver_graph_kinds` | 0 / 66/66 / 37.6 | — | 同 |
| `driver_sce1_events` | **1 / 211/214**(赤 = (2)(4d)(N2-隣): sceneFlags に `s3_novice_swayed` が 4 本目として居る = 「キー 3 本」の固定値)/ 48.3 | — | 同(型3。#87 は sceneFlags を触らない) |
| `driver_graph_run` | 0 / 99/99 / 64.2 | — | 同 |
| `verify_mage_hand_reach` | 0 / 11/11 / 14.4 | 0 / 全変異が担当どおり / 96.1 | 同 |
| `verify_prep_retire` | 0 / 30/30 / 58.6 | 0 / 全変異が担当どおり / 741.7 | 同 |
| `verify_road_ambush` | 0 / 41/41 / 67.4 | 0 / 97/97 / 456.7 | 同 |
| `verify_road_boon` | 0 / 20/20 / 69.6 | 0 / 48/48 / 186.6 | 同 |
| `verify_road_events` | 0 / 25/25 / 83.5 | 0 / 43/43 / 134.3 | 同 |
| `verify_temple_fold` | 0 / 24/24 / 170.6 | 0 / 全変異が担当どおり / 1363.6 | 同 |
| `verify_tower_mother` | 0 / 19/19 / 121.5 | 0 / 全変異が担当どおり / 1119.5 | 同 |
| `verify_mage_hand` | 0 / 32/32 / 139.6 | **0** / 12 本すべて担当だけが赤 / 1869.4 | post86 は `--negative` exit 1(`rollbackleak`)= 揺れ(#86 §12-0 の非緑 27 腕の 1 本) |
| `verify_invisibility` | 0 / 27/27 / 143.5 | 0 / 全変異が担当どおり / 159.0 | 同 |
| `driver_grid_p5` | 0 / 103/103 / 167.8 | — | 同 |
| `driver_mine_wall` | **1 / 64/66**(赤 = (4z)(4z2)「戦車が実際に乱入した」= 観測そのものが無い)/ 245.8 | — | post86 も非緑(65/66)= 実プレイ観測窓の揺れ(既知の非緑) |
| `verify_tower_mother_b` | 0 / 22/22 / 349.2 | (post86: 0) | 同 |
| `driver_encounter_mopup` | 0 / 36/36 / 320.3 | — | 同 |
| `driver_grid_p9` | 0 / 52/52 / 420.0 | — | 同 |

※ `verify_dragon_fold --negative` は連続走行の中で 1 回だけ **exit −1073740791(0xC0000409)・4.4 秒**で node ごと落ちた(§7 の途中・赤い assert 無し = 型2 の偽の赤)。単独で 2 回走らせ直して 2 回とも exit 0(8.3 / 8.2 秒)。post86 も exit 0。
- 型3(真に無関係・記録して進む): `verify_fort_fold --negative` / `verify_swamp_fold --negative` の exit 3 = 変異アンカーが畳みで多重ヒットに腐った(「1 ファイル / 3・4 箇所 → 空振り」)。素の assert は満点。post86 でも同じ。#87 は `buildFortRun` / `buildSwampRun` を触らない。`verify_walk_block` (3d) / `driver_sce1_events` (2)(4d)(N2-隣) は件数を固定値で焼いた assert の腐り。
- ⇒ **着手前の非緑は素 3 本(walk_block・sce1_events・mine_wall)+ `--negative` 2 腕(fort/swamp_fold)で、全部 post86 と同じ顔ぶれ**。#87 が構造的に殺す型1 はこの時点では 0 本(下は実装後に赤くなる予告)。

#### 実装後に赤くなる予告(§8 末尾の表を実測で訂正)

| 本 | 赤くなる assert(着手前の実測値) | 理由 | 手当て(推奨) |
|---|---|---|---|
| `verify_fort_fold` (4a) | n4: 罠 5 / 宝箱 **4** | 宝箱 1 個以上を要求 | `?roadchest=0` の腕(兼務宣言を測る assert なので旧経路に固定) |
| `verify_swamp_fold` (3d) | n4: 罠 4 / 宝箱 **3** | 同 | 同 |
| `verify_temple_fold` (4b) | n4: 罠 5 / 宝箱 **4**(buildNode + autoplay の 2 経路) | 同 | 同 |
| `verify_dragon_fold` (4a) | n4: 罠 6 / 宝箱 **5** | 同 | 同(竜の財宝 4 個は残る) |
| `verify_tower_mother` (2c) | n0: `{"traps":4,"chests":3}` | 同 | 同 |
| `verify_tower_mother_b` (1h) | `clearGold === 300` かつ `gold − coins === 300` | **§8 の表に無い**(K13) | `?roadchest=0` の腕 / 加算額を差し引く形 |
| `driver_graph_kinds` / `driver_graph_run` / `driver_grid_s2` (13e) / `driver_mapdef_step1` (G8)(4b) | 宝箱の個数・位置 | §8 のとおり | `?roadchest=0` |
| `driver_grid_p9`(+ `probe_p9_tour`) | 寄り道 4 か所の周回と箱 | 寄り道も止めるなら(推奨)周回が消える | `?roadchest=0`(内蔵変異のアンカー 39109 / 19677 は**書き換えない**) |
| `verify_mage_hand` (7a)(7d)(11a) / `verify_mage_hand_reach` / `driver_trap_disarm` / `driver_grid_p5` | — | `#choiceDialog` の器と 3 引数のまま罠に class を足すなら**赤くならない見込み**(K4) | 器を新しくするなら `clickChoice()` を読み直す |
| `driver_skillcheck_roster` / `driver_fix4_help_bonus` / `verify_road_*` / `verify_prep_retire` | — | パネルの DOM・閉じ方(`ov.click()`)は不変 = 赤くならない見込み | 崩れたら §12 へ |
| `verify_invisibility` (2a) / `verify_lore_check` / `driver_sce1_events` | — | (2a) は 2 腕の opts キー集合の一致 ⇒ 隠密に常に `auto` を足せば不変。`--negative` のアンカー 6 行(K12)を守ること | — |
| `driver_room_search_roll` | 1 部屋 1 ロールの回数 | 隠し宝箱の部屋が消えると母集団が痩せうる | 実装後に色を見る(⛔ 期待値を下げない) |

#### 母集団(項目5)

- **post86(211 腕・`1eaf8c4` で走査)は着手前の色にそのまま流用できる。** `1eaf8c4` / `baa5a67` / `f0a9626` で `index.html` / `tavern.html` / `world.html` / `audio.js` / `js` / `tools` の OID が全部同じ(差分は `実装依頼書/*.md` だけ)。資産 = #86 実装窓の scratchpad `4a3c9bb1-…/scratchpad/item4/`(`armlist_86post.json` = `{"arms": [[book.js, arg, "base"|"neg", "prod"|"clone"|"fix"], …](211 腕), "note"}` / `run_post86/post86.tsv` / `sweep_86post.py` / `run_all86post.ps1` / `cmp_86.py` / `pair_85.py` / `mkshadow_86.py`)。⚠ 前のセッションの scratchpad は消えうる ⇒ 項目5 の着手時に自分の scratchpad へ写す。
- #87 の語(`skillCheckOverlay` / `scRollBtn` / `resolveSkillCheck` / `roomChests` / `spawn*Chests` / `hiddenChestCount` / `mimicChest` / `.roomChest` / `choiceDialog` / `showChoice` / `showCharChoice` / `clearGold` / `tryStealthSurprise` / `runRoomSearchCheck` / `runTrapDisarmCheck` / `heroSlideOneTileExplore` / `exploreEnemyTurn` / `detourSpotsFor`)を読む tools = **69 本**。`probe_magehand_reach`(#80 からの除外)以外の **68 本は全部 armlist に入っている**。
- `--negative` を持つ本で #87 の領域を逐語で握るもの(K12)= `verify_road_ambush` / `verify_invisibility` / `verify_mage_hand` / `verify_arcane_eye` / `verify_lore_check` / `verify_tower_mother(_b)` / `verify_dragon_fold` / `verify_mage_hand_reach` — どれも `--negative` 腕が armlist に在る。`driver_grid_p9` / `driver_mapdef_step1` / `driver_choice_logslot` / `driver_doors_p6` は内蔵変異(素の腕の中で走る)。
- **項目5 で足す腕** = 新規 `verify_corner_check` の素 + `--negative`(2 腕 → 213 腕)。
- port: 10586 と 10596 で実 Chrome の goto が通ることを実測(`ERR_UNSAFE_PORT` なし・`item1/portcheck.js`)。

### 12-1. 項目2 — 判定パネルを左上へ + 罠の選択を左上へ + 戦闘中は判定を出さない + 探索ターンの穴 + 撤退 `?cornercheck=0`(2026-10-09・基準 `23925bf`)

触ったファイル = `index.html`(+109 / −12)/ `tavern.html`(changelog の `<li>` 1 本だけ)/ 本依頼書。⛔ `js/skill-check.js` / `world.html` / 宝箱・`clearGold`・`?roadchest` は触っていない(項目3)。tools の言い直しは **0 本**(下の非退行で赤くなった本が無い)。index / tavern とも行末は全部 CRLF のまま(index 41487/41487・tavern 11392/11392)。

#### 実装の要点(行番号は作業ツリー = この項目の commit)

| 何 | 行 | 中身 |
|---|---|---|
| STEP1 CSS | **3099-3133** | `</style>` の直前。`html.dfCornerCheck #skillCheckOverlay { inset:auto; top:8px; left:calc(var(--ui-menu-w) + 8px); background:transparent; pointer-events:none; align-items/justify-content:flex-start }`(全部 `!important`・`display` は触らない)/ `html.dfCornerCheck body.ui-collapsed …{ top:63px }` / `@media (max-width:768px)` で 80px(K15)/ カード 260px・padding 6/9/5・border 3・アイコン 22px を左へ float・タイトル 13px・flavor 非表示・行 11px・ダイス 20px |
| STEP2 CSS | **3134-3152** | `body.dfCornerChoice #choiceDialog`(位置・幅はパネルと同じ / `transform:none; transition:none` / ボタンは縦積み・min-height 44px)+ `body.dfCornerChoice.choice-open #combatLog, … #hpMiniBar { visibility: visible; }`(左上なのでログ枠は伏せない)。⛔ `#choiceDialog` の基本の CSS(1993-2101)は 1 バイトも変えていない |
| 撤退スイッチ | **3585-3591** | `const CORNER_CHECK_ON = new URLSearchParams(window.location.search).get("cornercheck") !== "0";` + `if (CORNER_CHECK_ON) document.documentElement.classList.add("dfCornerCheck");`(#85 の `BOARD_FADE_ON` の注記ブロックの直前に別ブロックで挿した = #85 のアンカーは無傷) |
| STEP3-2 穴 | **19828** | `heroSlideOneTileExplore` の `checkTrapTrigger()` と `await exploreAllyTurn(oldPlayerTile);` の間に `        await waitSkillCheckIdle();   // ★[#87] …`(1 行)。K2 の推奨 (b) |
| 門 + 待ち | **25983-25997** | `function dfSkillCheck(checkKey, dc, party, opts)` = `CORNER_CHECK_ON && (encounterActive \|\| encounterRunning) && !(opts && opts.auto)` なら `opts = Object.assign({}, opts, { auto: true })` → **呼んだ時点で** `window.SkillCheck.resolveSkillCheck(...)`。`async function waitSkillCheckIdle()` = `while (skillCheckActive && !gameOver) await new Promise(r => setTimeout(r, 40));`(立っていなければ 1 tick も待たない) |
| 呼び口 12 本 | 25800 / 26153 / 26242 / 26344 / 26538 / 26781 / 27324 / 27738 / 28771 / 37577 / 37582 / 38164 | `SkillCheck.resolveSkillCheck(` → `dfSkillCheck(`(引数は 1 文字も変えていない)。入口のガード `window.SkillCheck && SkillCheck.resolveSkillCheck` は従来のまま |
| STEP3-1 隠密 | **26246 / 26249 / 26266-26281** | opts に**新しい行** `            auto: CORNER_CHECK_ON,   // ★[#87] …`(撤退でもキーは常に在る = verify_invisibility (2a) のキー集合は 2 腕で一致)/ `catch` の次に新しい行 `        if (res && CORNER_CHECK_ON) showStealthRoll(res, party);` / `function showStealthRoll(res, party)` = runLoreCheck と同じ並び(主人公 → 生存仲間)で代表の頭上へ `<span class="label">STEALTH</span>隠密 1d20(…)±b = total vs DC`。ログは既存の `updateInfo`(成功 / 失敗)がそのまま出す。K12 の 6 行は無傷・奇襲の効果は不変 |
| STEP2 罠 | **26314 / 26324** | `let viaHand = false;` の次 `      if (CORNER_CHECK_ON) document.body.classList.add("dfCornerChoice");` / 罠の `} catch (e) { goDisarm = false; }` の次 `      document.body.classList.remove("dfCornerChoice");`(catch が全部受けるので必ず通る)。`showChoice` / `showCharChoice` の引数・本体は不変(verify_mage_hand (7d) argc = 3 のまま) |

- 門の置き場所の判断: 呼び口へ個別に `auto` を書かず、index の 12 口を薄いラッパ 1 本へ寄せた。tools の 10 本の「`SkillCheck.resolveSkillCheck` を差し替えて出目を決める」は、ラッパが呼ぶたびにプロパティを引くので全部そのまま効く(下の非退行で実証)。
- ⚠ 二重の守り: 戦闘中の隠密は (i) opts の `auto: CORNER_CHECK_ON` と (ii) 門 の 2 段で止まる。**(i) だけを外しても (ii) が止めるので見た目は変わらない**(K16)。

#### 実測(scratchpad `item2/probe87_2.js`・port 10623・沼・4 人編成 = 戦士 / 盗賊 / 僧侶 / 魔法使い・実 Chrome headless)

判定パネル(探索判定・アイコンあり・4 人のロスター。本物の `SkillCheck.resolveSkillCheck`):

| 姿勢 | `--ui-menu-w` | overlay = card の矩形 | 高さ ロール前 / 結果表示 | 背景 | overlay の pointer-events | カードの外の点 | カード上の点 |
|---|---|---|---|---|---|---|---|
| PC 展開 1280×900 | 280px | (288,8)-(548,240.3) | **232.3 / 222.3** | `rgba(0,0,0,0)` | none | `HTML`(ゲームへ届く) | カード内 |
| PC 畳み 1280×900 | 0px | (8,63)-(268,295.3)・☰ (11,11)-(55,55) と交わらない | 232.3 / 222.3 | 同 | none | `HTML` | カード内 |
| compact 390×844 | 0px | (8,80)-(268,312.3)・`#phaseIndicator` (44.1,8)-(345.9,72) と交わらない | 232.3 / 222.3 | 同 | none | `HTML` | カード内 |

- ⇒ **4 人編成で縦 232.3px(< 300)**。3 姿勢ともカード上の**実クリック**(page.mouse)でロール → 結果 → 再クリックで閉じた(`show` = false・Promise が結果を返した)。z-index 105 のまま。
- 罠の選択(`runTrapDisarmCheck` を直に呼ぶ・隣に発見済みの罠・`resolveSkillCheck` は固定の失敗):

| 姿勢 | メイジハンドなし | メイジハンドあり | ボタン |
|---|---|---|---|
| PC 展開 | (288,8)-(548,148.2) | (288,8)-(548,208.2) | 234×44 ×2 / 234×44・234×54・234×44 |
| PC 畳み | (8,63)-(268,203.2) | (8,63)-(268,263.2) | 同 |
| compact | (8,80)-(268,220.2) | (8,80)-(268,280.2) | 同 |

  - 開いている間 `body.dfCornerChoice` = true・`dialogPaused` = true・ログ枠 `visibility: visible`・画面右寄りの点は器に当たらない。Esc で迂回 → `dfCornerChoice` = false・`dialogPaused` / `skillCheckActive` = false・判定 0 回。
  - 続けて罠以外の `showChoice`(檻の問いを模した文)を開くと**従来の下の帯**: PC 展開 (280,730)-(1280,900) / 畳み (0,730)-(1280,900) / compact (0,660)-(390,844)・ログ枠 hidden(= 着手前と同じ)。
- 戦闘中の隠密(`startGame` → `encounterActive = true` + 交戦敵 1 体 → `tryStealthSurprise()`): パネル表示 **0 回**・`resolveSkillCheck` 1 回 `stealth`・opts のキー `auto,flavor,title,voiceIds`・`auto` = true・所要 15ms(従来はパネル 1 枚 ≈ 7 秒)・吹き出し `STEALTH 隠密 1d20(9)+6 = 15 vs DC 15`(+ #49 の判定行)・ログ「ニカ が気配を殺して接近! 敵 1体 の隙を突いた (隠密 15 ≧ DC 15) …」。
- 門: 同じ戦闘中に `dfSkillCheck('sleightOfHand', …, { title, voiceIds })`(auto なし = 開錠と同じ形)→ 本体へ `auto: true` が付いて届き、パネル 0・即決。
- 穴(B2 と同じ型: `narrationHold = true` + `gameStarted = true` + 追跡状態の lizardRaider を主人公の 5 マス東 + `heroSlideOneTileExplore` を直に呼ぶ): パネル表示 t=2187〜9187ms(100ms 刻みのサンプル 71 個)の間、敵は **(17,13) のまま**。`exploreEnemyTurn` の開始は t=11185(パネル閉・`skillCheckActive` = false)→ 終了で (16,13)。⇒ 着手前(B2: パネル表示中の t=4090 に敵の手番が始まり (16,13) へ詰めた)から直った。
- `?cornercheck=0` の腕: `html` に class なし / overlay は全面 (0,0)-(1280,900)・背景 `rgba(8, 6, 2, 0.55)`・pointer-events auto・カード 472×527.5(compact 390×527.5)= 着手前と同じ / 罠の選択は 6 腕とも下の帯(`dfCornerChoice` は一度も付かない・ログ hidden)/ 戦闘中の隠密はパネルが出る(opts の `auto` = false・キー集合は同じ 4 つ)・門も素通し(開錠形の呼び出しでパネルが出た)/ **穴ふさぎは撤退でも効く**(敵の手番はパネルが閉じた後 t=10870)。

#### 既存 golden の非退行(変更後・逐次・本番ツリー・2026-10-09 10:06〜12:06・52 腕)

§12-0 の 45 腕 + `verify_swamp_novice` / `driver_doors_p6` / `driver_action_priority`(素 + `--negative`)/ `verify_arcane_eye`(素 + `--negative`)/ `verify_walk_block --negative`。走行中 `index.html` は不変(着手時に hash を控えてから回した)。

- **素は全部、着手前と同じ色。** 緑のまま: driver_trap_disarm 44/44 / driver_skillcheck_roster 13/13 / driver_fix4_help_bonus 13/13 / driver_room_search_roll 39/39 / driver_choice_logslot 29/29 / driver_scroll_autoskip 9/9 / driver_grid_s2 124/124 / driver_wallbox 28/28 / driver_bgm_mine 37/37 / verify_fort_fold 30 / verify_swamp_fold 30 / verify_dragon_fold 35 / verify_lore_check 26/26 / driver_mapdef_step1 208/208 / driver_graph_kinds 66/66 / driver_graph_run 99/99 / verify_swamp_novice 34 / driver_doors_p6 40/40 / driver_action_priority 92 / verify_arcane_eye 34/34 / verify_mage_hand_reach 11/11 / verify_prep_retire 30/30 / verify_road_ambush 41/41 / verify_road_boon 20/20 / verify_road_events 25/25 / verify_temple_fold 24 / verify_tower_mother 19/19 / verify_mage_hand 32/32 / verify_invisibility 27/27 / driver_grid_p5 103 / verify_tower_mother_b 22/22 / driver_encounter_mopup 36/36 / driver_grid_p9 52/52。
- 非緑の素は着手前と同じ顔ぶれ・同じ理由: `verify_walk_block` (3d)(badge 44→47)/ `driver_sce1_events` (2)(4d)(N2-隣)(sceneFlags 4 本目)。`driver_mine_wall` は今回 **66/66 緑**(着手前 64/66 は観測窓の揺れ = 既知)。
- `--negative`: verify_lore_check / verify_mage_hand_reach / verify_dragon_fold / verify_invisibility(9/9)/ verify_road_events / verify_road_boon / verify_walk_block(54/54)/ verify_arcane_eye(10/10・`nopause` の count 2 は無傷)/ verify_road_ambush(97/97・`goldalways` 無傷)/ verify_prep_retire / verify_tower_mother(9/9)/ verify_temple_fold / verify_mage_hand(**12/12**・`trapchoice` は (7d)(11a) を担当どおり赤 = 罠の 3 引数と `if (handCaster) {` のアンカーが生きている)はすべて exit 0。fort / swamp_fold の exit 3 は着手前と同じ(型3・畳みで多重ヒット)。
  - ⚠ `verify_lore_check --negative` は連続走行の中で 1 回だけ exit 1(変異 `crguess` で担当外の (1j) が赤 = 「again」の乱数 `nR` が [2,1])。**単独で 2 回走らせ直して 2 回とも exit 0**(12/12)⇒ 型2(偽の赤)。#87 の差分は伝承の経路に `dfSkillCheck` の名前替えしか入れておらず、伝承は元から `auto: true` なので門も効かない。
  - `driver_action_priority --negative` は exit 1・0.1 秒(N3 のアンカー `const equippedIds = apEquippedIdsFor(slot, classKey);` が `tavern.html` に 2 箇所)。**`git show HEAD:tavern.html` でも 2 箇所** = 着手前からの腐り(型3・#35 以来の既知。post86 の母集団にこの腕は無い)。#87 の tavern の差分は changelog の 1 行だけ。
- ⇒ **言い直した golden は 0 本**。(1) 判定パネルの DOM は不変で、既存の閉じ装置は `ov.click()`(K14)なので pointer-events:none でも閉じる。(2) 罠は `#choiceDialog` の器と 3 引数のまま(K4)で、`clickChoice()` / `.choiceButtons button` の押し方がそのまま通る。(3) 隠密の opts には `auto` を**常に**足したので、verify_invisibility (2a) のキー集合は 2 腕で一致する。
- ⭐ 副作用: `verify_invisibility` の素が **143.5 → 24.2 秒**。戦闘開始の隠密パネル(≈ 7 秒 × 回数)が消えたから(K3 の予告どおり。戦闘開始が約 7 秒早まる)。

#### 新たな崩れ(K15〜)

- **K15** `#phaseIndicator` が上中央の札になるのは `@media (max-width: 768px)`(index 1091 付近)で、`ui-compact`(560px)より広い。⇒ パネルと罠の器の top 80px は **768px 以下**で切った。561〜768px の PC 幅でも札と交わらない。
- **K16 ⚠ 隠密は二重の守り。** opts の `auto: CORNER_CHECK_ON`(26246)だけを外しても、門 `dfSkillCheck`(25987-25990)が戦闘中なので `auto` を足し直す ⇒ パネルは出ない。§8 の変異 `stealthpanel` を「26246 の行を消す」だけで作ると (3a) は**空振り**する。⇒ 項目4 は (a) 門を通る前の opts を測る(`window.dfSkillCheck` は function 宣言 = 差し替え可・tryStealthSurprise が渡した opts に `auto` が在るかを見る)か、(b) 変異で 26246 と門の条件を同時に外すか、を選ぶ。memory の「二重の守りは後段へ届いた回数で測る」の型。
- **K17** 判定が `auto` になると `showPanelAndRoll` の d20 / アニメの `Math.random` を引かない(K3 の再確認)。戦闘中の乱数列は着手前とずれる(戦闘は元から非決定)。既存 golden で赤くなった本は 0。
- **K18** 穴ふさぎの待ちは `skillCheckActive` だけを見る。罠の選択・開錠(`tryPickLock`)・Sce1 / 司祭の対話・出口ヒント・扉の開錠も同じフラグを立てるので、探索ターンの途中でそれらが開けば全部待つ。autoplay では判定が microtask で解けるので待ちは 40ms × 1 回(探索判定が出た歩だけ)。フラグが落ちない経路は `gameOver` で抜ける。`skillCheckActive = true` を含む 11 行はどれも対で false に戻す(finally / 直後の行)= 立てっぱなしの既存経路は無い。
