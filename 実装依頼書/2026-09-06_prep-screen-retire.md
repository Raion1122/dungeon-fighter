# #55 出発準備画面の廃止 — 設定をマッチング画面へ一本化する

- **起草**: 2026-09-06(計画窓 `claude-bb`) / **ステータス**: **承認済**(2026-09-06 ユーザー承認)
- **着手**: ✅ 可。⚠ **着手前にもう一度、§2 の行番号を本番の関数で 1 回測ること**
  (起草から時間が経つと別窓のコミットで行番号が動く。#6 は 8/8 件ズレた)
- **触るファイル**: `tavern.html` / `tools/verify_prep_retire.js`(新規)/ `tools/driver_equip_compact_ios.js`(作り直し or 退役)
- ⛔ **触らないファイル**: **該当なし**。起草時点で `git status` は自分の会議記録 1 本を除き clean、
  `origin/main..HEAD` = **0 本** = **並走窓ゼロ**(隣窓 `claude-aa` は #54 着地済で待機中)。
  ⚠ それでも `git add .` は禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- **会議記録**: [dev-meetings/2026-09-05_next-step-55.md](../dev-meetings/2026-09-05_next-step-55.md)(第1段 + 第2段 + 開発計画書)

---

## 1. 目的

受注すると **ナレ → マッチング演出 → 出発準備画面** と一直線に進み、酒場の地図へ戻る隙が無い
(#54 §2-4 が指摘した導線)。一方 #35 でマッチング画面に「出発する」ボタン(`#pmDepart`)と
ロードアウトの引き出し(`#pmDrawer`)が既に入っており、**設定の置き場が 2 つに割れている**。

本チケットは **別画面としての `#prep` を出さないようにし**、プレイヤーの設定をマッチング画面へ
一本化する。⭐ 実測(§2-2)のとおりマッチング演出は `openPrep` の**中**で await されているので、
これは **新画面の作成ではなく `openPrep` の最後の 1 行を出さないこと**に帰着する。

**ユーザー決定**:

- **(2026-09-05)** 出発準備画面の廃止を **#55 として実施**(#54 依頼書 §11 で切り出し済)
- **(2026-09-06)** 装備の着せ替えの行き先 = **マッチング画面のドロワー(`#pmDrawer`)に装備段を追加**
  - ⭐ 不採用: 酒場に「装備」の常設オーバーレイを新設(= 画面 1 枚の新設でチケットの規模が倍になる)
  - ⭐ 不採用: 両方(同じ UI を 2 箇所に出す二重実装コスト)
- **(2026-09-06 / 第2段の会議へ委任 → 会議で決着)** 事前情報チェックと敵の情報の行き先 =
  **マッチング画面「本体」へ。⚠ `#pmHeader` の外**
  - ⭐ 不採用: ドロワーへ入れる(ドロワーは**カードごと**に開閉する器で、intel は人物ごとの設定ではない)
  - ⭐ 不採用: 受注の直後に出す(`#dialog` の作り替えになる。#54 が「⛔ 流用しない」と明示した器)

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

⭐ **この節が依頼書の価値の大半。** 数値には出所を、コマンドはそのまま貼る。

### 2-1. 行番号は 15 件すべて一致(ズレ 0)

`sed -n "Np" tavern.html` で 1 行ずつ確認した。**#6 は 8/8 件ズレた前科があるので毎回測ること。**

| 行 | 内容 |
|---|---|
| `tavern.html:2258` | `#pmDrawer { max-height: 30vh; padding: 10px 11px; }`(iPhone 相当) |
| `tavern.html:2262` | `#pmInner.pmDrawerOpen #pmHeader { display: none; }` |
| `tavern.html:2263` | `#pmInner.pmDrawerOpen .pmEquip { display: none; }` |
| `tavern.html:2264` | `#pmInner.pmDrawerOpen .pmSkills { display: none; }` |
| `tavern.html:2751` | `<button id="pmDepart" type="button" hidden>出発する</button>` |
| `tavern.html:2837` | `<div id="prep">` |
| `tavern.html:2953` | `<div class="stub" id="prepEnemyInfo"></div>` |
| `tavern.html:2956` | `<div class="prepPanel" id="prepIntelPanel">` |
| `tavern.html:5847` | `async function openPrep(sc) {` |
| `tavern.html:5854` | `prepIntelUsed = { examine: false, talk: false, pray: false };` |
| `tavern.html:5855` | `prepIntelSuccess = false;   // tavern-intel v1.0: クエストごとに一発勝負 (再挑戦不可)` |
| `tavern.html:5876` | `await playPartyMatchCinematic(sc);` |
| `tavern.html:6869` | `const PM_SETUP_ON = (function () {` |
| `tavern.html:7071` | `document.getElementById("btnBack").addEventListener("click", () => {` |
| `tavern.html:7184` | `if (intelDef && intelDef.unlocksFlag) questFlags[intelDef.unlocksFlag] = !!prepIntelSuccess;` |

**再測定コマンド**:

    for n in 2258 2262 2263 2264 2751 2837 2953 2956 5847 5854 5855 5876 6869 7071 7184; do
      printf "%5s: %s\n" "$n" "$(sed -n "${n}p" tavern.html | cut -c1-120)"; done

### 2-2. ⭐ 廃止点は 1 行だけ

    tavern.html:5838   const prepEl = document.getElementById("prep");
    tavern.html:5876   await playPartyMatchCinematic(sc);   // マッチング演出 (openPrep の中)
    tavern.html:5877   await maybePlayPrepOnboarding();     // 初回のみ: 準備画面の遊び方を語り部が案内
    tavern.html:5878   prepEl.style.display = "flex";       // ← ★ここが「準備画面を出す」唯一の行
    tavern.html:7072   prepEl.style.display = "none";       // btnBack「酒場に戻る」

`prepEl.style.display` への代入は**リポジトリ全文で 2 箇所だけ**(5878 = 出す / 7072 = 消す)。

**再測定コマンド**: `grep -n "prepEl\s*=\|prepEl\.style\.display" tavern.html`

⇒ **廃止 = 5878 をスイッチで飛ばすこと。** `#prep` の DOM も CSS も 1 行も消さない。

### 2-3. ⚠⚠⚠ 罠① — golden の母集団は **11 本ではなく 17 本**

⭐⭐⭐ **起草中にこの窓自身が踏みかけた罠。** 最初 `grep -ln "#prep\|openPrep\|prepEl" tools/*.js`
で **11 本**と数え、会議にもそう報告した。**これは間違い。** 出発の口を叩くドライバは
準備画面の語を 1 度も書かずに影響を受ける。

    A = grep -ln "#prep\|openPrep\|prepEl"              tools/*.js  → 11 本
    B = grep -ln "btnDepart\|pmDepart\|departToScenario" tools/*.js  → 14 本
    A ∪ B                                                           → ★17 本

**B にしか無い 6 本(A だけ見ていたら取りこぼしていた)**:
`driver_dev_gate` / `probe_s2_clear` / `sweep_recruit_balance` / `verify_mercenary_roster` /
**`verify_player_sheet`** / `verify_title_screen`

⚠⚠ **取りこぼしの 1 本 `verify_player_sheet` は、#47 で「赤いまま出荷されていた」まさにそのドライバ。**
(`project_headless_verification` の「golden の母集団は前のチケットが数えた本数を信じるな」)

⭐ 参考: `grep -ln "tavern\.html" tools/*.js` = **46 本**、実際に goto するもの = **37 本**。
17 本はそのうち「出発の導線に触る」部分集合。⛔ 46 本全部を毎 STEP 回すのは過剰。

**再測定コマンド**:

    grep -ln "#prep\|openPrep\|prepEl"                   tools/*.js | sed 's|tools/||' | sort > /tmp/a.txt
    grep -ln "btnDepart\|pmDepart\|departToScenario"     tools/*.js | sed 's|tools/||' | sort > /tmp/b.txt
    sort -u /tmp/a.txt /tmp/b.txt          # ← 17 本

### 2-4. ⚠⚠⚠ 罠② — 母集団 **17 本の中で 2 組が同じポート**。並列化は確実に壊れる

全 126 本のうち **20 個の番号が重複**している(隣窓 `claude-aa` の報告をこちらでも同じ抽出で
全件裏取り済み)。うち**本チケットの母集団の内部**でぶつかっているのが 2 組:

| 組 | base | 備考 |
|---|---|---|
| `driver_dev_gate` × `driver_equip_compact_ios` | **8831** | ⚠ 両方が本チケットの母集団。他に `driver_field_step2` / `driver_leader_ai` も同番 = 計 4 本 |
| `driver_depart_menu_clean` × `verify_title_screen` | **8893** | ⚠ 両方が本チケットの母集団。他に `driver_paint_blocked` も同番 = 計 3 本 |

母集団 17 本の base(実測):

    8831 driver_dev_gate          8831 driver_equip_compact_ios   8843 driver_action_priority
    8893 driver_depart_menu_clean 8893 verify_title_screen        8897 verify_recruit_size
    8931 verify_mercenary_roster  9160 verify_quest_walk          9200 verify_tavern_map
    9340 sweep_recruit_balance    9345 probe_party_size           9371 probe_s2_clear
    9480 driver_party_view_reopen 9530 verify_party_match_setup   9540 verify_darkvision
    9620 verify_player_sheet     10020 verify_recruit_talk

⇒ ⛔ **17 本は必ず直列で回す。** 並列にすると 8831 と 8893 が**確実に**衝突し、偽の赤(exit=3)になる。
⭐ これは「危ない」ではなく「**壊れる**」。⛔ この対処としてポート台帳を作る/番号を振り直すのは
**本チケットの仕事ではない**(§12 参照)。

**base の抽出コマンド**(126 本すべてから。⚠ `grep -oE '99[0-9]{2}'` で数えると `hp = 9999` などの
センチネル値を拾って台帳が汚れる):

    for f in tools/*.js; do p=$(grep -oE "arg\('port', *'[0-9]+'" "$f" | head -1 | grep -oE "[0-9]+");
      [ -n "$p" ] && echo "$p $(basename $f)"; done | sort -n

### 2-5. ⚠⚠⚠ 罠③ — 「intel はクエストごとに一発勝負・再挑戦不可」は**今も嘘**

tavern.html:5855 のコメントはこう名乗っている:

    prepIntelSuccess = false;   // tavern-intel v1.0: クエストごとに一発勝負 (再挑戦不可)

**だがこの行は `openPrep()` の中にある**(`openPrep` は 5847 から)。そして戻る口は 3 行しかない:

    tavern.html:7071  document.getElementById("btnBack").addEventListener("click", () => {
    tavern.html:7072    prepEl.style.display = "none";
    tavern.html:7073    prepScenario = null;

⇒ **今日のビルドで既に「3 回失敗 → 酒場に戻る → 受け直す → intel リセット → 再挑戦」ができる。**
一発勝負は**フラグで守られていない**。守っていたのは「準備画面が一度きりの関所に見えること」だけ。

⛔ **本チケットではこれを直さない**(§12)。ただし **「intel を動かすと一発勝負が壊れる」という
反対理由は成立しない**ことを、実装窓が判断に使えるよう明記する。壊れるものは無い。既に壊れている。

### 2-6. `#prep` が抱えているのは **12 群**(#54 依頼書の「3 群」は誤り)

`sed -n '2837,2990p' tavern.html` で `id=` を全部数えた。

| # | 群 | #54 §11 の記載 | `#pmDrawer` に既にあるか | 本チケットの扱い |
|---|---|---|---|---|
| 1 | 主人公表示 `#partyComp` | — | マッチング画面が担う | **移設不要** |
| 2 | 同行者 `#partyPreview` / `#recruitCountLine` | — | 画面自体が編成表示 | **移設不要** |
| 3 | 🎴 編成を見る `#btnPartyView` | — | — | **到達不能化**(§2-7。演出の再入場口で、演出そのものが行き先になるため不要) |
| 4 | 📣 募集をかけ直す `#btnReroll` | — | ❌ なし | **移設**(`#pmDepart` の手前) |
| 5 | スキル `#skillSection` | ✅ | ✅ **あり**(`pmDrawerSkillList`) | **移設不要** |
| 6 | 魔法 `#magicSection` | ✅ | ✅ **あり**(同じ段が `renderSpellSlotItem` を呼ぶ) | **移設不要** |
| 7 | 行動優先度 `#actionPrioritySection`(#19/#34) | ❌ **記載漏れ** | ✅ **あり**(`pmDrawerAp`「傾向」段) | **移設不要** |
| 8 | 装備(武器/盾/鎧 + 道具袋 3 つ) | ✅ | ❌ なし(カードの `.pmEquip` は**表示のみ**) | **移設**(ドロワー) |
| 9 | スクロール書庫 `#scrollLibrarySection` | ❌ **記載漏れ** | ❌ なし ⚠ **永続習得の唯一の口** | **移設**(ドロワー・主人公のみ) |
| 10 | 召喚 `#summonSection` | ❌ **記載漏れ** | ❌ なし | **移設**(ドロワー・主人公のみ) |
| 11 | 敵の情報 `#prepEnemyInfo` / 事前情報チェック `#prepIntelPanel` | ✅ | ❌ なし | **移設**(マッチング画面本体・ヘッダの外) |
| 12 | dev 用 `#debugEvadeRow` / `#debugAutoplayRow` | — | ❌ なし | ⚠ **§2-9 参照** |

⭐ **良い驚き**: 5・6・7 は #35 が既に作っていた。移設が要るのは **4・8・9・10・11** の 5 群。

### 2-7. ⚠ 罠④ — マッチング演出には **review モード**があり、`#prep` から再入場している

    tavern.html:7948  // opts.review = true → 「見るだけ」モード (準備画面の 🎴 編成を見る から開き直す時)。
    tavern.html:7957    const review = !!(opts && opts.review);
    tavern.html:7975  const hintReview = setupOn ? "カードを押して設定 ・ 下のボタンで準備へ戻る" : "タップして準備へ戻る";
    tavern.html:2749  ⚠ ラベルは review モードでは「準備へ戻る」へ差し替わる (行き先が出発ではないため)

⇒ `#btnPartyView`(`tavern.html:2862`)が演出を review で開き直し、`#pmDepart` が「準備へ戻る」になる。
**`#prep` を出さなくなると、この往復そのものが消える**(演出が唯一の画面になるので「戻る先」が無い)。

⛔ **`review` の分岐を消さないこと。** `?prepskip=0` を立てたときに従来の往復が必要になる。
⭐ `#btnPartyView` は `#prep` の中にあるので、`#prep` を出さなければ自動的に到達不能になる。
**DOM もハンドラも消さない**(撤退時に生き返る必要がある)。

### 2-8. `#pmDepart` の現在の挙動 — 押しても出発しない。演出を閉じるだけ

    tavern.html:8088   const onDepart = (ev) => {
    tavern.html:8089     if (ev && ev.stopPropagation) ev.stopPropagation();
    tavern.html:8090     if (closed || phase !== "done" || !gateOpen) return;
    tavern.html:8091     close();                                   // ← 演出を閉じるだけ
    tavern.html:8098   if (departBtn) { departBtn.addEventListener("click", onDepart); departBtn.addEventListener("touchend", onDepart); }

⇒ `close()` で await が解けて `openPrep` に戻り、5877 → 5878 で準備画面が出る、という流れ。
⭐ **したがって `onDepart` を書き換える必要は無い。** 分岐点は `openPrep` の 5877-5878 だけ。

⚠⚠ **`click` と `touchend` の両方に張ってある**(コメント「片方だけだと iOS で出発できない端末が出る」)。
⛔ 移設で足すボタン(`#btnReroll` / intel の 3 ボタン)も**同じ作法に揃えること**。

### 2-9. ⚠ 罠⑤ — 初回オンボーディングのナレが「準備画面の遊び方」を語る

    tavern.html:5877   await maybePlayPrepOnboarding();   // 初回のみ: 準備画面の遊び方を語り部が案内 (スキップ可)
    tavern.html:7367   const PREP_ONBOARDING_NARRATION = [
    tavern.html:8139   async function maybePlayPrepOnboarding() {
    tavern.html:8140     const KEY = "dragonfighters.prepOnboardingSeen";

⇒ **準備画面が出なくなると、このナレは「存在しない画面の説明」になる。**
⛔ 会議でも数え漏らしていた 6 つ目の移設対象。⚠ 実装窓は `PREP_ONBOARDING_NARRATION` の**文面**を
読み、準備画面を名指ししている箇所があれば**マッチング画面の言い方へ差し替える**こと。
⛔ `dragonfighters.prepOnboardingSeen` の**キー名は変えない**(既読の人に二度語らせない)。

⚠ dev 用の `#debugEvadeRow` / `#debugAutoplayRow`(オートプレイ出発 x10 / 自動デバッグ巡回)も
`#prep` の中にある。**`driver_*` がこれらを押している可能性がある**ので、STEP0 の基準取りで
赤くなったドライバがあれば、そこが出所。⛔ dev 導線は消さずゲートの原則(`?prepskip=0` で戻る)。

### 2-10. `driver_equip_compact_ios` は **着手前から赤**(この窓が現在の木で実測)

    $ node tools/driver_equip_compact_ios.js
    [drv] label=WORKTREE root=...ダンジョンファイターズ port=8831
    [drv] 4 openPrep 到達 → 呼び出し
    DRIVER FAIL: Error: 準備画面 (#prep) が可視にならなかった — 演出の進行に失敗
        at openEquipScreen (tools/driver_equip_compact_ios.js:217:21)
    === exit: 1 ===

⭐⭐ **落ちる理由がそのまま #55 の内容**: このドライバは「`#prep` が可視になること」を待っている。
#55 の後、`#prep` は**二度と可視にならない**。⇒ **8831 の重複は真因ではない**(隣窓が `cdaaf91` の木で
単独実行しても同じ地点で落ちると実測済)。真因は #35 で `#pmDepart` の明示タップ待ちになったのに
ドライバが追随していないこと。

⇒ **本チケットはこのドライバを明示的に扱う**(§6 STEP2 / §12)。

### 2-11. 参考: 取りこぼしていた `verify_player_sheet` は現在**緑**(この窓が実測)

    $ node tools/verify_player_sheet.js
      73/73 PASSED   FAILED 0   **PENDING** 0
    === exit: 0 ===

⭐ #47 時点の赤(FAILED 4)は #48 で解消済み。**#55 は緑を赤にしてはいけない。**

### 2-12. 撤退スイッチ名と受入ドライバのポートは空いている

- `prepskip` — リポジトリ全文 grep で**未使用**(会議記録の中の提案文だけがヒット)
- **base 10050** — `tools/*.js` に 10050/10051/10052 の使用は**ゼロ**。
  高位帯は `9850 / 9880 / 9910 / 9940 / 9970 / 10020` と **30 間隔**で並んでおり、
  10020 は変異 11 本で 10031 まで占有。⇒ 10050 が慣習に沿う次の空き

### 2-13. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

⇒ `tavern.html` を触るので **鳴る = 追記必須**。
⭐ **書けるプレイヤー向けの要約は実在する**(出発前の画面が 1 枚にまとまる = 目に見える変化)。
嘘の行をでっち上げる必要は無い。文面は §11。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html` | マッチング画面本体へ 2 節追加(敵の情報 / intel)・ドロワーへ 3 段追加(装備 / 書庫 / 召喚)・`#btnReroll` 移設・`openPrep` 5878 のスイッチ化・`PREP_SKIP_ON` の追加・オンボーディング文面の差し替え |
| `tools/verify_prep_retire.js` | **新規**。base **10050**(変異 10051〜10070) |
| `tools/driver_equip_compact_ios.js` | **作り直し or 退役**(§6 STEP2 で判断。⚠ 着手前から赤) |

⛔ **`index.html` は開かない。** 準備画面もマッチング演出も `tavern.html` の中で完結する
(`PM_SETUP_ON` のコメント「ページ遷移をまたがない」)。§8 で `?prepskip=0` が遷移をまたがないことを確認済み。
⛔ **`#prep` の DOM / CSS を消さない。** 恒久方針 = dev 機能は消さずゲート。

---

## 4. STEP0 — 着手前の golden 基準(⛔ 直列)

⭐ **本チケットは STEP0 が最重要。** 母集団 17 本の**着手前の色**を記録してから 1 行も触らない。

    # ⛔ 並列にしない (8831 と 8893 が母集団の中で衝突する = §2-4)
    for d in driver_action_priority driver_depart_menu_clean driver_dev_gate \
             driver_equip_compact_ios driver_party_view_reopen probe_party_size \
             probe_s2_clear sweep_recruit_balance verify_darkvision \
             verify_mercenary_roster verify_party_match_setup verify_player_sheet \
             verify_quest_walk verify_recruit_size verify_recruit_talk \
             verify_tavern_map verify_title_screen; do
      echo "=== $d ==="; node tools/$d.js 2>&1 | tail -4; echo "exit=$?"
    done

⭐ **基準は FAILED の集合で書く**(件数だけだと腐る)。既知の赤:

- `driver_equip_compact_ios` = **exit 1**(`準備画面 (#prep) が可視にならなかった`)— 2026-09-06 実測

⛔ 「集合が増えたら自分のせい / 同じなら非退行」という #38 の NG セット diff 型で判定しない。
**1 本ずつ、赤くなった理由を突き止める。**

---

## 5. STEP1 — マッチング画面「本体」へ 敵の情報 + 事前情報チェックを移す

**置き場所**: `#pmInner` の中、`#pmColumns`(カードの列)と `#pmDepart` の間。
⚠⚠ **`#pmHeader` の中に置かない。** `tavern.html:2262` が縦持ちで
`#pmInner.pmDrawerOpen #pmHeader { display: none; }` にするので、**ドロワーを開いた瞬間に消える**。

- **敵の情報**: 現在 `tavern.html:5851` が `sc.enemies.map(e => (e.boss ? "【"+e.name+"】" : e.name)).join(" / ")` を
  `#prepEnemyInfo` の textContent に入れている。⛔ **この組み立て式を写経しない** — 同じ関数を呼ぶか、
  組み立てを 1 箇所に切り出して両方から呼ぶ(写経すると `#prep` 側と食い違う)
- **事前情報チェック**: `#prepIntelPanel` の 3 ボタン(`btnIntelExamine` / `btnIntelTalk` / `btnIntelPray`)と
  `#intelResultList`。⛔ **`prepIntelUsed` / `prepIntelSuccess` の変数と intel の判定関数は
  1 つも複製しない**(複製すると `tavern.html:7184` の `questFlags` が片方だけを見る)
- ⚠ **`click` と `touchend` の両方に張る**(§2-8。片方だけだと iOS で押せない端末が出る)
- ⚠ タップ領域 44px を確保する

⛔ **`departToScenario()`(7141)の中身は 1 行も動かさない。** `questFlags` / `pendingSummon` の
書き出し位置を変えると、intel の成否が index 側へ渡らなくなる。

---

## 6. STEP2 — ドロワーへ 装備 / 書庫 / 召喚 を足す + `#btnReroll` 移設

`pmRenderDrawer`(`tavern.html:7693` 付近)は既に「スキル段」「傾向段」の 2 段を組み立てている。
**同じ `.pmDrawerSec` / `.pmDrawerSecHead` の作りで 3 段目以降を足す。**

- **装備段**(全カード): 武器 / 盾 / 鎧 + 道具袋。⭐ **既定は畳む**(「▸ 装備を替える」)
  - ⚠⚠ **段の先頭に「現在の装備」を出す。** 理由 = `tavern.html:2263` が縦持ちで
    `.pmEquip { display: none; }` にするので、**ドロワーを開くとカードの装備表示が消える**。
    今なにを装備しているか見えないまま着せ替えることになる。`#equipEquippedSummary` 相当を流用する
- **スクロール書庫段 / 召喚段**: ⭐ **主人公のカードのみ**。根拠 = どちらも
  **パーティ全体で 1 つの状態**(書庫は `classKey` ごとの習得済み呪文、召喚は所持品)であって
  同行 NPC ごとに変わらない。既定は畳む
- **`#btnReroll`(📣 募集をかけ直す)**: `#pmDepart` の**手前**へ。⚠ 押し間違いで潜らないよう間隔を空ける
- ⛔ **`renderSkillItem` / `renderSpellSlotItem` / `apEquippedIdsFor` を複製しない。**
  ドロワーは既に準備画面と同じ部品を呼んでいる(`tavern.html:7738` 付近のコメントが明示)

**`driver_equip_compact_ios` の判断はここで下す**(§2-10 で着手前から赤):

- ⭕ **作り直す** … 「`#prep` が可視になるのを待つ」を「ドロワーの装備段が開くのを待つ」へ。
  ⭐ **こちらを既定とする**(装備 UI の iPhone 検査は #55 後こそ必要になる)
- ⭕ 退役 … `verify_prep_retire` が装備段を十分に測れると判断できた場合のみ。
  ⛔ その場合も**ファイルを消さず**、冒頭に退役理由と後継ドライバ名を書く

---

## 7. STEP3 — `openPrep` の最後の 1 行を止める(⭐ これが最後)

⭐ **順序の理由**: 先に受け皿(STEP1/STEP2)を作ってから蓋をする。逆にすると
「移設先が無いのに準備画面が消えた」中間状態がコミットに残る。

    // ── #55 撤退スイッチ ?prepskip=0 ────────────────────────────────────────
    // OFF = 従来どおり「マッチング演出 → 出発準備画面」の 2 段へ戻る。
    // ⚠ 判定はここ 1 箇所だけ (PM_SETUP_ON の作法。2 箇所で URL を読むと片方だけ直って食い違う)。
    // ⚠ ページ遷移をまたがない (演出も準備画面も tavern.html の中で完結する)。
    // ⚠ ?pmsetup=0 / ?actionpri=0 とは別物。同時指定しても矛盾しない。
    const PREP_SKIP_ON = (function () {
      try { return new URLSearchParams(window.location.search).get("prepskip") !== "0"; }
      catch (e) { return true; }
    })();

`openPrep` の末尾(現 5877-5878)を:

    await playPartyMatchCinematic(sc);
    if (PREP_SKIP_ON) { departToScenario(); return; }   // #55: 演出で完結 → そのまま出発
    await maybePlayPrepOnboarding();
    prepEl.style.display = "flex";

⛔ **`review` の分岐(§2-7)を消さない。** `?prepskip=0` のとき従来の往復が必要になる。
⛔ **`onDepart`(8088)を書き換えない。** 演出を閉じるだけの役目のままでよい(§2-8)。
⚠ **オンボーディングのナレ**(§2-9): `PREP_ONBOARDING_NARRATION`(7367)の文面を読み、
準備画面を名指ししている箇所をマッチング画面の言い方へ差し替える。
⛔ `dragonfighters.prepOnboardingSeen` の**キー名は変えない**。
⚠ 差し替えたナレをどこで再生するかも決めること(演出の前が自然)。

---

## 8. 撤退スイッチ

- **`?prepskip=0`** — 従来の「マッチング演出 → 出発準備画面」の 2 段へ戻る。
  移設した節(intel / 敵の情報 / 装備段 / 書庫段 / 召喚段 / `#btnReroll`)は**マッチング画面側にも
  出したままでよい**(二重に出ても壊れないほうが、撤退路として安全)。
  ⛔ ただし `#prep` 側の同機能が**動くこと**は必ず確かめる(§9 の (7a)(7b))
- ⚠ **判定位置** = `PREP_SKIP_ON` の 1 箇所だけ
- ⚠ **ページ遷移をまたぐか** = **またがない**。`tavern.html` の中で完結する(先例 = `?heromark=0` の
  「各ページが独立に読む」型。⛔ `?town=0` の sessionStorage へ写す型は採らない)

---

## 9. 受入条件 — `tools/verify_prep_retire.js`(新規・base **10050**)

**方針**: 「準備画面が出ない」を消極的に確かめるのではなく、**移設先で同じことができる**ことを
2 経路で突き合わせる。⛔ 「`#prep` が hidden」だけを見る assert は、**移設が 1 つも済んでいなくても緑**になる。

### ⚠ 計測機構

ドライバは `openPrep` を直接呼ぶのではなく、**`#btnAccept` の実クリックから入る**こと。
⚠ 酒場 → 出発の導線は**実測約 26 秒**(`project_next_summon_dialog_fixes` の知見)。
`getComputedStyle` を測るだけで導線に到達しない事故が実際に起きている。

### §0 装置(先に母集団を確かめる)

- **(0a)** マッチング画面(`#partyMatchOverlay`)が**可視になった回数が 1 回以上**。
  ⭐⭐⭐ **これが無いと以降の全 assert が空振りで永久緑になる**
- **(0b)** `#pmColumns` のカードが **1 枚以上**あり、うち 1 枚が `isHero`。
  ⛔ 表を写経せず、`selection.partyMembers` の実体から引いていること
- **(0c)** `SCENARIO_INTEL` に `unlocksFlag` を持つシナリオが **1 件以上**存在する
  (intel の assert が「対象シナリオ 0 件」で空振りしないこと)

### §1 移設先で intel が成立する

- **(1a)** マッチング画面上の intel 3 ボタンが**可視**で、うち 1 つを押すと `#intelResultList` に行が増える
- **(1b)** ⭐ **2 経路の突き合わせ**: 押した後に出発して `sessionStorage["dragonfighters.questFlags"]` を読み、
  `unlocksFlag` の値が **`prepIntelSuccess` と一致**する。
  ⛔ 「ボタンが押せた」だけで緑にしない(`tavern.html:7184` まで届いていることを測る)
- **(1c)** intel の 3 ボタンは **`#pmHeader` の外**にある(ドロワーを開いても消えない)。
  ⭐ **ドロワーを実際に開いた状態で**可視性を測る(§2-4 の CSS が効く条件を作る)

### §2 移設先で敵の情報が出る

- **(2a)** マッチング画面に敵の顔ぶれが出ており、**`sc.enemies` から導いた文字列と一致**する。
  ⛔ 期待値をドライバに直書きしない(実体から引く)
- **(2b)** ドロワーを開いた状態でも消えない

### §3 ドロワーの装備段

- **(3a)** カードを開くと「装備」段が存在し、**既定で畳まれている**
- **(3b)** 開くと武器/盾/鎧のリストが出て、**段の先頭に現在の装備が出ている**(§2-6 の罠への対処)
- **(3c)** ⭐ **2 経路の突き合わせ**: 装備を替えて出発し、`sessionStorage` の
  `dragonfighters.partyMembers` / 装備の保存先が**実際に変わっている**

### §4 書庫段・召喚段は主人公のカードのみ

- **(4a)** 主人公のカードのドロワーに「書庫」「召喚」段がある
- **(4b)** ⭐ **負の側**: 同行 NPC のカードのドロワーには**無い**。
  ⚠ 同行 NPC が 0 人のとき(#54 のソロ)この assert は**空振りする** → **PENDING ではなく
  「NPC を 1 人以上連れた腕」を別に立てて測る**

### §5 `#btnReroll` が移設されている

- **(5a)** マッチング画面に「募集をかけ直す」があり、押すと顔ぶれが変わりうる
- **(5b)** `#pmDepart` の**手前**にある(押し間違いの間隔)

### §6 恒等(非退行)

- **(6a)** スキル段・傾向段が**着手前と同じ**(#35/#19 の既存機能を壊していない)
- **(6b)** `departToScenario` が書く sessionStorage のキーが**増えても減ってもいない**
  (`questFlags` / `pendingSummon` / `partyMembers` / `partyComposition`)
- **(6c)** `dragonfighters.prepOnboardingSeen` のキー名が変わっていない

### §7 撤退

- **(7a)** `tavern.html?prepskip=0` → **`#prep` が可視になる**(従来の 2 段が戻る)
- **(7b)** ⭐ `?prepskip=0` のとき `#prep` 側の intel が**動く**(可視なだけでなく `questFlags` まで届く)
- **(7c)** ⭐⭐⭐ **silent fail-open の検査**: `?prepskip=0` を**外した**とき (7a) が**赤になる**。
  ⛔ 「スイッチ付きで緑」だけでは、スイッチが効いていなくても緑になる(#5 の受入条件 7 の型)

### ⛔ 測らないこと

- **見た目の寸法・余白・色**(ミサキが実機で動かす余地を残す)
- **ドロワーの段の並び順**(実機の手触りで入れ替わりうる)
- **オンボーディングのナレの文面そのもの**(語り口は調整の対象。⭐ ただし
  `prepOnboardingSeen` の**キー名**は (6c) で測る)
- **intel の再挑戦可能性**(§2-5。#55 の対象外)

### 負のコントロール(`--negative` で道具に内蔵。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nointel` | intel 3 ボタンをマッチング画面に足さない | (1a) |
| `intelghost` | ボタンは出すが `prepIntelSuccess` へ繋がない(見た目だけ) | **(1b)** ⭐ 写経 assert では捕まらない |
| `intelinheader` | ⭐⭐ **§2-4 の罠の再現**: intel を `#pmHeader` の中に置く | **(1c)** ドロワーを開くと消える |
| `enemyhardcode` | 敵の情報を固定文字列で書く | (2a) |
| `equipopen` | 装備段を既定で開いた状態にする | (3a) |
| `nosummary` | ⭐ **§2-6 の罠の再現**: 装備段の先頭に現在の装備を出さない | (3b) |
| `equipghost` | 装備を替えても保存先へ書かない | **(3c)** |
| `libraryall` | 書庫段を同行 NPC のカードにも出す | (4b) |
| `noreroll` | `#btnReroll` を移設しない | (5a) |
| `keyrename` | `prepOnboardingSeen` のキー名を変える | (6c) |
| `switchdead` | ⭐⭐⭐ **§8 の罠の再現**: `PREP_SKIP_ON` を読むが常に true を返す(スイッチが死ぬ) | **(7a)(7c)** |
| `switchtwice` | `prepskip` を 2 箇所で読む(片方だけ直る) | (7a) |

⭐ **`intelinheader` / `nosummary` / `switchdead` の 3 本が §2 の罠の再現**。必ず入れる。

### 既存 golden の非退行(⛔ 直列で 17 本)

§4 STEP0 で取った**着手前の FAILED 集合**と突き合わせる。⚠ 件数だけで判定しない。

⚠ 基準は 2026-09-06 時点の記録:

- `verify_player_sheet` = **73/73 PASSED FAILED 0 PENDING 0**(exit 0)— この窓が実測
- `driver_equip_compact_ios` = **exit 1**(`準備画面 (#prep) が可視にならなかった`)— この窓が実測。
  ⭐ **これは STEP2 で直す or 退役させるので、着地時には赤のままにしない**
- 残り 15 本 = STEP0 で取る

---

## 10. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`file://` 直開きだとナレ音声だけ無音)。

1. ⚠⚠ **iPhone 縦持ちで、主人公のドロワーの段が 5 つ**(スキル / 傾向 / 装備 / 書庫 / 召喚)になる。
   `max-height: 30vh` で読めるか。⭐ **既定で畳む設計はこの制約への回答**だが、
   **駄目なら書庫・召喚は酒場の常設オーバーレイへ移す**(§12 の退避先)
2. ドロワーを開いた状態で、敵の情報と intel が消えていないこと
3. intel 3 ボタンのタップ領域 44px
4. `#pmDepart` が親指の届く位置にあること(`#btnReroll` を隣に置いた後)
5. 装備を替えながら「今なにを装備しているか」が読めること
6. 受注 → 出発までの体感が短くなったか(#54 §2-4 の「一直線で戻る隙が無い」が解消したか)
7. 初回プレイで、オンボーディングのナレが**存在しない画面**を説明していないこと

---

## 11. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>出発の準備がマッチング画面にまとまった</b> — 仲間が集う画面で装備・スキル・下調べまで済ませて、そのまま出発できる。"

⛔ **`--no-verify` での迂回は禁止**(そもそも Claude からは実行できない)。

---

## 12. やらないこと

- ⛔ **intel の「再挑戦できてしまう」是正** → **#56 候補**。
  ⭐ 実測(§2-5): リセットは `openPrep` 内(5854-5855)、`btnBack`(7071-7073)は 3 行で何も妨げないので、
  **今日のビルドで既に再挑戦できる**。`tavern.html:5855` のコメント「クエストごとに一発勝負 (再挑戦不可)」は
  **現状と食い違っている**。⚠ 導線の変更にバランス変更を混ぜると、実機で異常が出たとき切り分け不能になる
- ⛔ **「主人公だけ先に落ちる」の是正** → **#56 候補**(#54 §11 が既に名指し。沼 6 ラン全部が
  `finalLeaderHp: 0` / `partyAlive: 3`)
- ⛔ **検証ドライバのポート台帳づくり / 20 個の重複番号の振り直し** → **別チケット**。
  ⭐ 本チケットは「17 本を直列で回す」で回避する(§2-4)。番号を振り直すと**全ドライバが同時に赤くなりうる**
- ⛔ **酒場への新規オーバーレイ新設**(書庫・召喚の移設先として検討したが、画面 1 枚の新設 =
  チケットの規模が倍。⚠ §10-1 の実機確認で駄目だった場合の**退避先**としてのみ残す)
- ⛔ **`#dialog`(依頼カード)の作り替え**(#54 が「⛔ 流用しない」と明示した器。触ると #54 の受入 25 本に響く)
- ⛔ **`#prep` の DOM / CSS の削除**(恒久方針 = dev 機能は消さずゲート)
- ⛔ **`?pmsetup=0`(#35)/ `?actionpri=0`(#19)の意味の変更**
- ⛔ **`departToScenario()` の中身の変更**(`questFlags` / `pendingSummon` の書き出し位置)
- ⛔ **`SKILL_SLOT_CURVE` / `SPELL_SLOT_CURVE_*` に触ること**(#54 §11 が既に禁じている)
- ⛔ **`index.html` を開くこと**(§3)

---

## 13. 実装結果 — ✅ 全 STEP 着地(2026-09-06 実装窓 `claude-aa`)

### コミット(起草窓が実物で照合済み・作業ツリー clean)

    1d5e050  #55 起草 — 依頼書 + 会議記録(起草窓)
    bab54cc  #55 出発準備画面の廃止 — 設定をマッチング画面へ一本化      tavern.html +399/-47
    ae58eed  #55 検証 — 受入ドライバ verify_prep_retire + 母集団の移設(7 本)   tools/ 8 ファイル

⭐ `index.html` は変更リストに **不在**(§3 の禁止どおり)。changelog も追記済み。

### 受入 `verify_prep_retire`(base 10050)

- 素 **30/30 PASSED / FAILED 0 / PENDING 0**
- `--negative` **12/12(空振り 0)**。うち 9 本が担当ラベル**だけ**を赤くした。
  巻き添えは `nointel` → (1a)(1c)(1d) と `intelinheader` → (1c)(1d)(2b) の 2 本だけで、
  どちらも構造上避けられない(ボタンごと消す / 帯ごとヘッダへ移す)
- ⭐ **`intelghost` が (1b) だけを赤くした** = §9 が「写経 assert では捕まらない」と名指しした
  経路が実際に守られていることの実証

### 母集団 17 本 → **18 本**(`verify_prep_retire` が `#prep` と `pmDepart` の両方を含むため)

    着手前 FAILED = driver_dev_gate / driver_equip_compact_ios / probe_party_size / sweep_recruit_balance
    着手後 FAILED = probe_party_size / sweep_recruit_balance          (16/18 緑)

⇒ **緑を赤にした本は 0**。差は「改善 2 本 + 新規 1 本」だけ。

### 3 分類の適用結果

**【型1】依頼書は 1 本と見ていたが、実際は 7 本。** 着手前は `#prep` が出ていたので隠れており、
STEP3 を当てた瞬間に 6 本が一斉に赤くなった(`driver_action_priority` / `driver_depart_menu_clean` /
`driver_party_view_reopen` / `verify_party_match_setup` / `verify_quest_walk` / `verify_recruit_size`)。
⭐ 引き渡し文の「B 群 14 本はどれも準備画面の可視を待っている疑い」は**当たり**だった。

- `driver_equip_compact_ios` … **作り直し**(退役させず)。測る先を `#equipWeaponList` から
  引き出しの `#pmDrawerEquip_weapon` / `#pmDrawerBag_weapon` へ移設。**測る中身は不変**。
  進め方も修正(画面中央のクリックでは #35 以後もう演出が進まない)→ exit 0
- 5 本 … URL へ `?prepskip=0` を足して母集団移設(#54 の `?recruittalk=0` と同型)→ 全部 exit 0
- ⭐⭐⭐ `verify_quest_walk` … **URL 方式が原理的に使えない。** (4c) が `d.seam.search === ''`、
  (4d) が `=== '?autoplay=10'` と**酒場の `location.search` そのもの**を assert しており、
  `?prepskip=0` を足した瞬間にその 2 本が崩れる。しかも (4d) は `reachedPrep === true` も要求する。
  ⇒ **配信バイト側で `PREP_SKIP_ON` を倒す**方式へ(本番ファイルは 1 バイトも無改変。
  アンカーが 1 箇所でなければ**走る前に exit 3**)→ 25/25 exit 0

⛔ **assert は 1 つも緩めていない。** すべて「母集団を移す」側で解いた。

**【型2】`driver_dev_gate`(exit 2)は偽の赤。** baseline worktree
`C:\...\Temp\df_devgate_baseline` が 2026-09-04 のディスク掃除で中身ごと消えており、
`tavern.html` が無い → 再利用判定に落ちず `worktree add` が「already exists」で失敗していた。
`git worktree remove --force` で掃除 → **52/52 PASSED / exit 0**。
⇒ ポート由来ではなく**環境残骸**だが、扱いは型2 と同じ(直して消える = 記録不要の赤)。

**【型3】2 本。赤の理由は 1 行で同じ。**
`probe_party_size` / `sweep_recruit_balance` は **`recruittalk` の語を 1 度も持たない**。
#54 で既定の編成が「声を掛けた相手だけ」= ソロに変わったのに、この 2 本だけ `?recruittalk=0`
(自動編成モデル)へ母集団を移していないため、装置ガードが `partySize got=1 want=4` / `want=5` で
崩れ、そこから先が全滅している。⇒ **#55 とは無関係**(どちらも `#prep` の可視を待たず
`departToScenario()` を直接呼ぶ)。直し方は #54 が確立済み → **#56 候補**。

⭐ `probe_s2_clear` は途中 exit=2 だったが、これは「本番に差分があると測らない」という #18 専用の
設計ガードで、**コミット後に緑へ戻った**(作業中はどのチケットでも赤)。

### ⚠ 依頼書が外していた点(次チケットの燃料)

1. ⭐⭐⭐ **§2-10 の型1 は 1 本ではなく 7 本**(上記)。「着手前から赤い 1 本」だけを見ていると、
   **蓋をした瞬間に一斉に赤くなる群**を見落とす。
2. ⭐⭐⭐ **依頼書が名指ししていない罠 — z-index。** `#skillCheckOverlay` は **105**、
   `#partyMatchOverlay` は **210**。事前情報チェックをマッチング画面から撃つと
   **判定カードが暗幕の下に出て見えない**。`js/skill-check.js` は `index.html` と共有なので触らず、
   `tavern.html` 側で `#skillCheckOverlay { z-index: 220 !important; }` を上書き(tavern.html:2250)。
   向こうの規則は JS が実行時に `<head>` へ足す = 後勝ちなので `!important` が要る。
   ⭐ **一般形 = 「機能を別のオーバーレイの上へ移す」ときは z-index の重なり順を必ず測る。**
3. ⭐⭐⭐ **§9「⛔ 測らないこと = 見た目の寸法・余白」は、この件では危険な指示だった。**
   帯(`#pmBrief`)と募集の口(`#pmRerollRow`)を足した結果 `#pmInner` が **1108px** に伸び、
   844/900px の画面から **`#pmDepart` が画面外へ押し出された**。これは #35 の受入 (4c) /
   #39 の (3c) が既に守っていた**既存の不変条件**で、両方が実測で赤くなった。
   ⇒ 中身は削らず `#pmInner` を `max-height:100% + overflow-y:auto`、
   `#pmDepart` を `position:sticky; bottom:0`(tavern.html:2291)に。
   ⛔ `#pmDrawer` の `max-height`(42vh / 縦持ち 30vh)は**動かしていない**
   (#35 の変異 M6 が「外すと (4c) が赤くなる」を守っている値)。
   ⭐ **教訓 = 「寸法は測らない」と書いてよいのは、その寸法を守る既存 golden が居るときだけ。**
4. **§9 の受入ドライバ既定シナリオに `orc-fort` は使えない。**
   ① `locked:true`(`unlockAfter: bandits-forest`)なので新規セーブでは `#btnAccept` のハンドラが
   `isUnlocked()` で黙って return し、症状は「導線が `prologueOverlay` のまま 120 秒」。
   ② `SCENARIO_INTEL` に `unlocksFlag` を持つのは **goblin-mine / bandits-forest / lizard-swamp の 3 本だけ**で、
   `orc-fort` には無いので §1 が原理的に測れない。⇒ `goblin-mine` を既定に。
   ⭐ **これは §9 の (0c)(0d) を書いたおかげで露見した**(母集団ガードの効用の実例)。
5. **実装で足した罠つぶし 2 件(依頼書に記載なし)**:
   - 装備を替えるたび引き出しごと描き直すので `<details>` が畳まる = 連続して着せ替えられない
     → `pmFoldOpen` で開閉を記憶
   - 装身具チップの `cycleAccessoryTV` が `renderCharLoadout` 直結 = 引き出しから押すと
     `#prep` が `display:none` なので「押しても何も起きない」ように見える → repaint を引数化
6. ✅ **§2-1 の行番号 15 件はズレ 0**。母集団 17 本と同番 2 組(8831 / 8893)も再現。
   §2-2「廃止点は 1 行」も実物どおりで、`prepEl.style.display` への代入は今も 2 箇所だけ。
7. **計測器側で踏んだ自分のバグ 4 件**(記録として): CRLF ファイルに `'\n'` の複数行アンカー /
   `?prepskip=0?recruittalk=0` の二重 `?` / `TAVERN_PATH` へ埋め込む順序 /
   `verify_recruit_size.js` が**改行混在**(CRLF 1108 + LF 9 = #54 の編集由来)で
   CRLF 正規化したアンカーが 0 ヒット。

### 残っている宿題

**実機 7 項目(§10)。** 最重要は **iPhone 縦持ちで引き出しの 5 段(スキル / 傾向 / 装備 / 書庫 / 召喚)が
読めるか**。sticky 化でヘッドレスの (4c)(3c) は緑だが、手触りは実機でしか分からない。
切り分けは `?prepskip=0`。⚠ ローカルは **http 起動が必須**。
⚠ 併せて **#54 の実機 6 項目(ソロで潜って詰まないか)も未消化**。

### #56 候補(3 件)

- **(a)** `probe_party_size` / `sweep_recruit_balance` の母集団移設(`?recruittalk=0` を足すだけ。#54 が確立済み)
- **(b)** intel の「再挑戦できてしまう」是正(§12)。
  ⭐ 起草窓の追加実測: このフラグは**隠し要素の spawn そのものをゲート**している
  (`["shadowBeast", 41, 17, "s2_beast_intel"]` @ index.html:10265 /
  `["hydra", 35, 13, "s3_hydra_intel"]` @ index.html:10290)。
  ⇒ 再挑戦できる = **隠しボスへの到達を確定で買える**。情報のおまけではない
- **(c)** 「主人公だけ先に落ちる」(§12)。
  ⭐⭐⭐ 起草窓の追加実測: これは**脆さではなく仕様**。
  `index.html:18848` = `// ── パーティ生存 / 全滅 判定 (Q1=B GO 条件: 主人公死亡 or 全滅) ──`。
  増幅要因は (i) `zonePullFor` の既定 `{ front: 0.75, mid: 1.0, rear: 1.25 }` =
  前衛は実効距離 25% 短く扱われ最も狙われる × `PARTY_ZONES` の warrior/dwarf = front、
  (ii) #54 のソロ潜行(仲間 0 人なら攻撃の 100% が主人公へ)。
  ⭐ **潰した仮説**: 「僧侶が主人公を回復しない」は**誤り** —
  `findLowestHpPartyMember()` は leader を候補に含め HP 比の昇順で選び、
  `allyCureWounds` も `target.kind === "leader"` を処理済み。罠も主人公・仲間の両方が踏む
  (index.html:25800 / :25829)
