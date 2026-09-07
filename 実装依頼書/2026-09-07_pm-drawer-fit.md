# #56 マッチング画面の設定引き出しが縦に潰れる — 器を伸ばして「画面 1 本スクロール」へ

- **起草**: 2026-09-07(計画窓) / **ステータス**: **承認済**(2026-09-07 ユーザー承認・「判断は任せます」)
- **触るファイル**: `tavern.html` / `tools/verify_pm_drawer_fit.js`(新規) / `tools/verify_party_match_setup.js`(変異 M6 の張り替えのみ)
- ⛔ **触らないファイル**: 起草時点で別窓の未コミット差分は **0 件**(2026-09-07 `git status --porcelain` が空・`origin/main` = `5191216`)。
  ⚠ **着手時にもう一度 `git status` を採ること**。clean の鮮度は数分で腐る([[feedback_peer_session_concurrent_repo]])。
- 🤝 **コミット / プッシュは起草窓が行う**(2026-09-07 ユーザー指示)。
  実装窓は **実装 + 検証 + `py tools/add_changelog.py` の追記まで**を済ませ、**作業ツリーに残したまま**報告すること。
  ⛔ 実装窓は `git commit` しない(起草窓が `git diff --cached` を読んでから 1 本にまとめる)。

---

## 1. 目的

ユーザー報告: **「味方の装備やスキル傾向を設定する画面が狭すぎて、見えづらい」**。

実測すると「狭い」どころではなく、**見出し行しか出ていない**。
マッチング画面(`#partyMatchOverlay`)でカードを押すと開く引き出し `#pmDrawer` は、
中身が 638〜963px あるのに、実際に表示されている高さが次のとおり:

| 画面 | 引き出しの実高 | 中身 | 見えている割合 | 事前情報を 2 件引いた後(= 報告のスクショと同じ状態) |
|---|---|---|---|---|
| デスクトップ 1280×900 | **170px** | 638px | 26.6% | **76px** (11.9%) |
| ノート 1366×768 | **38px** | 638px | 6.0% | **26px** (4.1%) |
| iPhone 縦 390×844 | **22px** | 963px | 2.3% | **22px** (2.3%) |

しかも「引き出しの中を自分でスクロールすれば読める」わけでもない。
**画面(器)をどれだけスクロールしても、いちばん下の「傾向」段は 1 ピクセルも出てこない**(§2-4)。

**ユーザー決定(2026-09-07)**:

- **採用** = 「**伸ばして画面 1 本スクロールへ**」。引き出しの内側スクロールを廃し、
  スクロールは `#pmInner` ただ 1 本にする。開いたら引き出しの頭へ自動で寄せる。
- **採用** = 「**スキル段は畳まない**」。既定で開いたまま。
  ⭐ 理由(ユーザー) = 技を選ぶのが引き出しの主目的なので、開いた瞬間に見えているべき。
  (畳めば初期高さは 638→311px / 963→323px まで落とせるが、1 タップ増えるのを嫌った)
- **不採用** = 「開いている間はカード列と見出しも畳む」。
  ⭐ さらに 335〜423px 稼げる。**今回は器だけ直す**。効果が足りなければ別チケット(§11)。
- **不採用** = 「引き出しを全画面シートにする」。
  ⭐ 既存 golden の (4c)/(3c)(= 引き出しを開いたまま出発の口が見える)が前提ごと崩れ、作業量が大きい。

---

## 2. 着手前の実測(この窓が本番コードと実ブラウザで確かめた事実)

計測は使い捨てプローブ 4 本(`%TEMP%/df_pptr/probe_pm_drawer_space{,2,3,4}.js`)。
実 Chrome を `puppeteer-core` で直駆動し、`#btnAccept` の実クリックから
マッチング演出へ到達 → カードを押して引き出しを開いて測っている。

### 2-1. ⚠⚠⚠ 真犯人は `max-height: 42vh` **ではない** — `overflow-y: auto` だった

素朴に読むと「`#pmDrawer { max-height: 42vh }`(`tavern.html:2138`) が低すぎる」に見える。
**それは間違い**。アブレーション(1 プロパティずつ当てた実測)がこうなる:

| 腕 | iPhone 390×844 の引き出し実高 | デスクトップ 1280×900 | 内側で切れている量 |
|---|---|---|---|
| A0 素のまま | 22px | 170px | 943 / 470 |
| A1 `overflow-y: visible` だけ | 253px | 378px | 702 / 250 |
| A2 `flex-shrink: 0` だけ | 253px | 378px | 712 / 262 |
| **A3 `max-height: none` だけ** | **22px** | **170px** | **943 / 470** ← 効果ゼロ |
| **A4 `overflow-y: visible` + `max-height: none`** | **965px** | **640px** | **0 / 0** |
| A5 上記 + `flex-shrink: 0` | 965px | 640px | 0 / 0 ← **A4 と 1px も違わない** |

**機構**:

- `#pmInner`(`tavern.html:2023-2038`) は `display:flex; flex-direction:column;`
  **`max-height: 100%` + `overflow-y: auto`**(#55 が入れた)。
- 子は全員 `flex-shrink: 1`(既定)。中身が器を超えると、まず**子が縮む**。
- **`overflow-y: auto` を持つ flex 子は、自動最小サイズ(`min-height:auto`)が 0 になる。**
  ⇒ `#pmDrawer` だけが「いくらでも縮める子」になり、**収縮の全量を 1 人で吸う**。
- 裏取り = 兄弟の `#pmBrief` は `overflow: visible` なので `min-height:auto` = min-content に守られ、
  146px(事前情報 2 件で 240px)を**まったく譲っていない**。同じ flex 子なのに挙動が真逆。

⭐ **したがって直す行は 2 つ**(`max-height` と `overflow-y`)。
⛔ **`flex-shrink: 0` は書かない** —— A5 = A4 で、1px も効果が無い(書くと「効いている風の死んだ行」が増える)。
⭐ この罠は §8 の負のコントロール **`maxonly`**(max-height だけ消して overflow-y を残す)として装置に内蔵する。

**再測定コマンド**(アブレーション):

    # %TEMP%/df_pptr で
    node probe_pm_drawer_space4.js

### 2-2. ⭐⭐⭐ #35 の変異 M6 は【着手前から】空振りしている

実走した:

    node tools/verify_party_match_setup.js --negative --only M6
    → exit 1
      [driver] RESULT: PASSED 36 / FAILED 0 / PENDING 0   (合計 36)
      [driver] --negative: 注入=M6,M6 / 赤くなったラベル=(なし)
      [driver] 空振り: M6→(4c) , M6→(4c)

M6 は「`#pmDrawer` から `max-height` / `overflow-y` を外すと **(4c) が赤くなる**」ことを守る変異
(`tools/verify_party_match_setup.js:61-63` / `:177-185`)。**もう赤くならない**。

理由 = **#55 が守り方を差し替えたから**。

- `#pmDepart { position: sticky; bottom: 0; z-index: 2; }`(`tavern.html:2291`)
- `#pmInner { max-height: 100%; overflow-y: auto; }`(`tavern.html:2036-2037`)

この 2 つが入った時点で、引き出しがどれだけ伸びても**出発の口は画面内に貼り付いたまま**になった。
M6 が守っていたのは **もう存在しない不変条件**。
⇒ **#56 が壊すのではない。既に壊れているものを、#56 のついでに狙い直す**(§6)。

⚠⚠⚠ **さらに悪い**: M6 のアンカー 2 本は **#56 が消す行そのもの**。

| ファイル:行 | アンカー文字列 |
|---|---|
| `tools/verify_party_match_setup.js:181` | `'      max-height: 42vh;\r\n      overflow-y: auto;\r\n'` |
| `tools/verify_party_match_setup.js:184` | `'      #pmDrawer { max-height: 30vh; padding: 10px 11px; }'` |

放置すると `mutate()` が「注入点が 0 箇所(期待 1)」で **exit 3** になり、
`verify_party_match_setup.js --negative` が**走らなくなる**(空振り → アンカー腐敗へ悪化)。

⭐ ちなみに `:185` の置換後の文字列は `'      #pmDrawer { padding: 10px 11px; }'` ——
**#56 が本番に書こうとしている姿と同じ**。変異が本番へ昇格する形になっている。

### 2-3. 反実仮想「内側スクロールを廃す」を当てても (4c)/(3c) は壊れない(16 通り実測)

`#pmDrawer{max-height:none; overflow-y:visible; flex-shrink:0}` を注入した状態で、
既存 (4c) と同型の検査(`#pmDepart` が画面内 かつ `elementFromPoint` が `pmDepart` に命中)を回した:

| 画面 | 素 | 事前情報 2 件 | 折り畳み段を全部開いた最悪ケース |
|---|---|---|---|
| iPhone 390×844 | pass / hit=pmDepart | pass | pass (引き出し 1505px) |
| ノート 1366×768 | pass | pass | pass (1028px) |
| デスクトップ 1280×900 | pass | pass | pass (1028px) |
| 極小 390×667 | pass | pass | pass (1505px) |

`#pmDrawer` の横スクロール((4d) 同型)も **4 画面 × 4 状態すべてで発生しない**。

**再測定コマンド**:

    node probe_pm_drawer_space3.js

### 2-4. 今日は「傾向」段が **原理的に読めない**

`#pmDrawerAp`(引き出しの最下段)を、**器 `#pmInner` を最後までスクロールしてから**測った:

| 状態 | 傾向段が全部見える | 一部でも見える |
|---|---|---|
| 着手前(4 画面とも) | ✗ | **✗** ← カケラも出ない |
| 反実仮想 D 後 | **✓** | ✓ |
| 反実仮想 D + 全段展開 | ✓ (390×667 だけ ✗) | ✓ |

⭐ 「見えづらい」の客観的な言い換え = **器をスクロールしても届かない。
22〜170px の細い窓を自分で見つけて、その中でスクロールするしかない**。

⚠ 390×667 で全段を開いた最悪ケースだけは、直しても傾向段が 1 画面に収まらない
(中身 1503px を 667px の窓に入れるので原理的)。**受入条件から外す**(§8)。

### 2-5. 自動スクロール式の実測

    inner.scrollTop += drawer.getBoundingClientRect().top - inner.getBoundingClientRect().top;

| 画面 | 当てる前の drawerTop − innerTop | scrollTop | 当てた後 | 出発の口 | 傾向段 |
|---|---|---|---|---|---|
| デスクトップ 1280×900 | 414px | 414 | **0px** | 命中したまま | **全部見える** |
| iPhone 390×844 | 435px | 435 | **0px** | 命中したまま | あと 130px 分スクロールが要る |

⭐ **「上端そろえ」を採る**(`block:'nearest'` 相当の最小スクロールではなく)。
設定に使える縦を最大化するのが本チケットの目的そのものだから。カードは上へスクロールすれば戻る。
⛔ `element.scrollIntoView()` は使わない —— スクロール可能な**祖先を全部**動かす。
`#partyMatchOverlay` は `position:fixed` だが、裏の `tavern.html` の document は生きている。

### 2-6. 引き出しの中身の内訳(なぜ 638px / 963px になるか)

主人公(戦士)・折り畳み段は既定どおり畳んだ状態:

| 段 | デスクトップ | iPhone 縦 |
|---|---|---|
| `pmDrawerHead`(見出し + 閉じる) | 44 | 44 |
| スキル段(`pmDrawerSec`) | **327** | **640** ← `.skillList` が 1 列になる |
| `pmDrawerEquip`(装備を替える・畳) | 47 | 47 |
| `pmDrawerLibrary`(書庫・畳) | 0 | 0 ← スクロール未所持だと段ごと消える |
| `pmDrawerSummon`(召喚・畳) | 0 | 0 |
| `pmDrawerAp`(傾向) | 169 | 185 |
| **合計** | **638** | **963** |
| 折り畳み段を全部開くと | 1002 | 1503 |

職業別(デスクトップ): 戦士 638 / 盗賊 578 / 魔法使い 524 / 僧侶・エルフ 500。
**いちばん高いのは主人公の戦士**(技 10 本 + 書庫 + 召喚)。受入条件は戦士で測る。

### 2-7. ⚠ 新ドライバのポートは **10081**(10080 は使えない)

[[project_headless_verification]] の台帳は「高位帯は 30 間隔・次の空きは 10050」で、
#55 が 10050 を取った。素直に 10080 を取ると **Chrome が拒否する**:

    FATAL Error: net::ERR_UNSAFE_PORT at http://localhost:10080/tavern.html

10080 は Chrome の制限ポート。**10081 は実測で通った**(プローブ 4 本とも 10081)。
既存の最大は 10050 なので衝突なし(`arg('port', '...')` 抽出で確認)。

### 2-8. 母集団(既存 golden)

⚠ [[project_headless_verification]] の教訓「1 本の grep で母集団を決めるな」に従い和集合で取った:

| 数え方 | 本数 |
|---|---|
| `grep -l 'pmDrawer\|pmInner\|pmDepart' tools/*.js` | **9** |
| `grep -l 'tavern\.html' tools/*.js` | **47** |

**必ず回す 9 本**: `driver_action_priority` / `driver_depart_menu_clean` / `driver_equip_compact_ios` /
`driver_party_view_reopen` / `verify_darkvision` / `verify_party_match_setup` / `verify_prep_retire` /
`verify_quest_walk` / `verify_recruit_size`。

**着手前の実走**(2026-09-07・逐次・この窓が測定):

| ドライバ | 着手前の結果 | 所要 |
|---|---|---|
| `verify_party_match_setup` | **36/36** PASSED / FAILED 0 / PENDING 0 (exit 0) | 100s |
| `verify_party_match_setup --negative --only M6` | ⛔ **exit 1 — 空振り: M6→(4c)**(素の assert は 36/36) | — |
| `verify_prep_retire` | **30/30** PASSED / FAILED 0 / PENDING 0 (exit 0) | 147s |
| `driver_action_priority` | **92/92** PASSED / FAILED 0 / PENDING 0 (exit 0) | 122s |
| `driver_party_view_reopen` | **35/35** PASSED / FAILED 0 / PENDING 0 (exit 0) | 72s |
| `verify_darkvision` | **25/25** PASSED / FAILED 0 / PENDING 0 (exit 0) | 79s |
| `verify_quest_walk` | **25/25** PASSED / FAILED 0 / PENDING 0 (exit 0) | 209s |
| `driver_equip_compact_ios` | **exit 0**(件数は未採取・下の ⚠ 参照) | 46s |
| `driver_depart_menu_clean` | **exit 0**(同上) | 126s |
| `verify_recruit_size` | **exit 0**(同上) | 68s |

⭐ **着手前の赤の集合 = { `verify_party_match_setup --negative` の M6 空振り } の 1 件だけ。**
素の assert は 9 本すべて緑。⇒ **これ以外のラベルが赤くなったら #56 のせい**。

⚠ **3 本は総括行の書式が違って件数を採り損ねた**(exit だけ記録)。
`driver_depart_menu_clean` / `verify_recruit_size` は `══════════ 結果: N/M PASS ══════════`、
`driver_equip_compact_ios` は `=== <LABEL>: N/M PASS ===`。**`PASSED` で grep すると 0 件**になる。
件数まで採るなら `PASS` で拾うこと(⭐ 母集団の記録が痩せる典型なので、STEP0 で採り直すこと)。

**再測定コマンド**(⚠ 逐次。並列はポート衝突で偽の赤を生む):

    for d in driver_action_priority driver_depart_menu_clean driver_equip_compact_ios \
             driver_party_view_reopen verify_darkvision verify_party_match_setup \
             verify_prep_retire verify_quest_walk verify_recruit_size ; do
      node tools/$d.js > /dev/null 2>&1 ; echo "$d exit=$?" ; done

⚠ **「着手前から赤」は 3 分類してから記録する**(#55 の作法)。
現時点で判明している型:

- **型: 前のチケットが負のコントロールを空振りにした** = `verify_party_match_setup --negative`
  (M6 → (4c)。§2-2。#56 の STEP3 で回収する)

⛔ `probe_party_size` / `sweep_recruit_balance` は #54 由来で赤いままだが **9 本にも
   「必ず回す」にも入れない**(§11)。混同しないこと。

### 2-9. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ:

    GAME_LOGIC = ("index.html", "tavern.html", "audio.js")

`tavern.html` を触るので **鳴る**。
⭐ **書けるプレイヤー向けの要約は実在する**(見た目が実際に変わる)。§10 に文面を用意した。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tavern.html:2132-2141` | `#pmDrawer` から `max-height: 42vh;` と `overflow-y: auto;` を**削除**し、撤退用の上書き規則を足す |
| `tavern.html:2323` | compact の `#pmDrawer { max-height: 30vh; padding: 10px 11px; }` から `max-height` を外す |
| `tavern.html:7050` 付近 | `PM_FIT_ON`(`?pmfit=0`)の判定を 1 箇所だけ足し、OFF のとき `body.pmFitOff` を付ける |
| `tavern.html:7829` / `:7849` / `:7863` | 開いたら引き出しの頭へ寄せる / 閉じたら戻す(+ 覚える変数) |
| `tools/verify_pm_drawer_fit.js` | **新規**。受入ドライバ(port 10081) |
| `tools/verify_party_match_setup.js:177-185` | 変異 **M6 を狙い直す**(§6)。⛔ assert 本体は 1 行も触らない |

⛔ **`index.html` / `audio.js` / `js/*` は開かない。**
⛔ **`#pmIntelResultList { max-height: 17vh; overflow-y: auto; }`(`tavern.html:2244`) は触らない。**
  これは `#pmBrief` の**中**にあり、`#pmBrief` 自身が `overflow:visible` で min-content に守られているので
  §2-1 の病理を起こしていない(実測 146px / 事前情報 2 件で 240px を保持)。
⛔ **`#pmInner` の `max-height: 100%` / `overflow-y: auto`(`:2036-2037`) は動かさない。**
  ⭐ これが「1 本のスクロール」の本体。消すと出発の口が画面外へ出る(#55 が実測済み)。
⛔ **`#pmDepart { position: sticky; bottom: 0; z-index: 2; }`(`:2291`) は動かさない。**
  ⭐ これが (4c)/(3c) を守っている実体(§2-2)。
⛔ **`実装依頼書/README.md` の #56 行は着地してから足す**(文面は §11)。

---

## 4. STEP1 — 器を伸ばす(CSS)

### 4-1. 基底(`tavern.html:2132`)

**今**:

    #pmDrawer {
      width: 100%;
      padding: 12px 14px;
      background: var(--pm-panel);
      border: 1px solid var(--pm-border);
      border-radius: 10px;
      max-height: 42vh;
      overflow-y: auto;
      text-align: left;
    }

**こうする**:

    /* #56: 引き出しは【縮まない・自分ではスクロールしない】。スクロールは #pmInner ただ 1 本。
       ⚠⚠⚠ overflow-y を消すのが本体。max-height だけ消しても 1px も直らない
         (実測: A3 = max-height:none だけ → iPhone 22px のまま)。理由 = overflow-y:auto を持つ
         flex 子は自動最小サイズが 0 になり、#pmInner の収縮を 1 人で全部吸うから。
       ⛔ flex-shrink: 0 は書かない —— overflow を visible へ戻した時点で min-height:auto が
         最小サイズを守るので、足しても 1px も変わらない (実測 A4 == A5)。
       ⚠ 出発の口は #pmDepart の position:sticky (:2291) が守る。⛔ あれを消さないこと。 */
    #pmDrawer {
      width: 100%;
      padding: 12px 14px;
      background: var(--pm-panel);
      border: 1px solid var(--pm-border);
      border-radius: 10px;
      text-align: left;
    }
    /* #56 撤退 ?pmfit=0: #35 当時の「引き出しの中でスクロール」へ戻す。
       ⭐ 既定を新しい姿にして、古い姿を上書き規則で復元する向きにしてある
         (JS が死んでも直った姿のまま = fail-open が安全側)。 */
    body.pmFitOff #pmDrawer { max-height: 42vh; overflow-y: auto; }

### 4-2. compact(`tavern.html:2323`)

**今**:

      #pmDrawer { max-height: 30vh; padding: 10px 11px; }

**こうする**(padding は無条件のまま残す):

      #pmDrawer { padding: 10px 11px; }
      body.pmFitOff #pmDrawer { max-height: 30vh; }

⚠ `@media (max-width: 720px)` の**中**に置くこと。基底の `body.pmFitOff #pmDrawer` より
後ろに来るので 30vh が勝つ(#35 が「390px では 30vh が勝つ」と実測したのと同じ順序)。

### 4-3. 撤退スイッチの判定(`tavern.html:7050` 付近・`PM_SETUP_ON` の隣)

    /* ══ #56 撤退スイッチ ?pmfit=0 ════════════════════════════
       OFF = 引き出しが自分の中でスクロールする #35 当時の姿へ戻る (自動スクロールもしない)。
       ⚠ 判定はここ 1 箇所だけ (PM_SETUP_ON / PREP_SKIP_ON と同じ作法)。
       ⚠ ページ遷移をまたがない (演出は tavern.html の中で完結する)。 */
    const PM_FIT_ON = (function () {
      try { return new URLSearchParams(window.location.search).get("pmfit") !== "0"; }
      catch (e) { return true; }
    })();
    if (!PM_FIT_ON) { try { document.body.classList.add("pmFitOff"); } catch (e) {} }

---

## 5. STEP2 — 開いたら引き出しの頭へ寄せる / 閉じたら戻す

### 5-1. `pmOpenDrawer`(`tavern.html:7849`)

`pmRenderDrawer(idx);` の**後**に足す。⚠ `pmDrawerIdx = idx;` より**前**に「閉じていたか」を採る
(カード A → カード B と渡り歩くとき、途中の位置を覚え直さないため)。

    function pmOpenDrawer(idx) {
      const drawer = document.getElementById("pmDrawer");
      if (!drawer || !pmOrdered[idx]) return;
      const wasClosed = (pmDrawerIdx < 0);            // ★#56
      pmDrawerIdx = idx;
      ...
      pmRenderDrawer(idx);
      /* ★#56: 開いた引き出しの頭を器の上端へ寄せる。
         ⚠⚠ requestAnimationFrame が要る —— hidden を外した直後はレイアウトが確定しておらず、
           rect を読むと 0 が返る run がある。
         ⛔ drawer.scrollIntoView() は使わない (スクロール可能な祖先を全部動かす。
            裏の tavern.html の document まで動いてしまう)。 */
      const inner56 = document.getElementById("pmInner");
      if (PM_FIT_ON && inner56) {
        if (wasClosed) pmScrollBeforeOpen = inner56.scrollTop;
        requestAnimationFrame(function () {
          inner56.scrollTop += drawer.getBoundingClientRect().top - inner56.getBoundingClientRect().top;
        });
      }
      pmLoadoutRepaint = function () { ... };          // 既存のまま
    }

`pmDrawerIdx` の隣(`tavern.html:7829` 付近)に置く:

    let pmScrollBeforeOpen = null;   // ★#56 引き出しを開く前の #pmInner のスクロール位置

### 5-2. `pmCloseDrawer`(`tavern.html:7863`)

`drawer.hidden = true; drawer.innerHTML = "";` の**後**に足す(中身が消えて器が縮んでから戻す):

    /* ★#56: 開く前の位置へ戻す。⚠ 先に中身を消しておかないと、
       ブラウザが縮んだ内容に合わせて scrollTop を丸めるので戻し切れない。 */
    if (PM_FIT_ON && inner && pmScrollBeforeOpen != null) {
      const back56 = pmScrollBeforeOpen;
      pmScrollBeforeOpen = null;
      requestAnimationFrame(function () { inner.scrollTop = back56; });
    }

⛔ **なめらかスクロール(`behavior:'smooth'`)にするかは目で決める。受入条件では測らない**(§8)。

---

## 6. STEP3 — `verify_party_match_setup.js` の変異 M6 を狙い直す

⛔ **assert 本体(`(4c)` / `(4d)` を含む 36 本)は 1 行も触らない。** 変異の定義だけを張り替える。

### 6-1. 何が起きているか(§2-2 の再掲)

- M6 は「`max-height` / `overflow-y` を外すと (4c) が赤くなる」を守っていた。
- **#55 が `#pmDepart` を sticky にした時点で、それは成り立たなくなった**(実測 exit 1・空振り)。
- **#56 はその行を本番から消す**ので、放置すると空振り → **アンカー腐敗(exit 3)** へ悪化する。

### 6-2. こう張り替える(`tools/verify_party_match_setup.js:177-185`)

**今 (4c) を守っている実体**は `#pmDepart { position: sticky; bottom: 0; z-index: 2; }`。
そこを潰す 1 本へ差し替える:

    /* M6 (#56 で張り替え) — (4c) を守っている実体は #pmDepart の sticky。
       ⚠⚠⚠ 旧 M6 (#pmDrawer の max-height / overflow-y を外す) は #55 が sticky を入れた
         時点で【空振り】になっていた (2026-09-07 実走で確認: 注入しても赤くならない)。
         #56 がその行を本番から消したので、旧アンカーは exit 3 になる。 */
    mutate('M6 (#pmDepart から position:sticky を外す ← これが (4c) を守っている実体)',
      '    #pmDepart { position: sticky; bottom: 0; z-index: 2; }',
      '    #pmDepart { position: static; }');

⚠ **アンカーは実ファイルから 1 文字ずつ写すこと**(`tavern.html:2291`。インデントは半角 4)。
⚠ `NEG_EXPECT.M6` は `['(4c)']` のまま。
⚠⚠ **机上で決めない**。張り替えたら必ず `--negative --only M6` を実走し、
  **本当に (4c) だけが赤くなったか**を見てから表を確定する。赤くならなければ別の潰し方を探す
  (候補: `#pmInner` の `overflow-y: auto` を `visible` にする = 器がスクロールしなくなる)。

---

## 7. 撤退スイッチ

- **`?pmfit=0`** — 引き出しが `max-height 42vh`(compact 30vh)+ 内側スクロールの **#35 当時の姿**へ戻り、
  開いたときの自動スクロールも起きない。
- ⚠ **判定位置** = `tavern.html:7050` 付近の `PM_FIT_ON` ただ 1 箇所。そこから `body.pmFitOff` を付ける。
- ⚠ **ページ遷移をまたがない**。演出も準備画面も `tavern.html` の中で完結するので sessionStorage への写しは要らない
  (`?pmsetup=0` / `?prepskip=0` と同じ扱い)。
- ⭐ **既定を新しい姿にして、古い姿を `body.pmFitOff` の上書きで復元する向き**にしてある。
  JS が落ちてもクラスが付かない = 直った姿のまま。逆向き(新しい姿をクラスで足す)にすると
  **silent fail-open で潰れたままになる**([[project_shipping_cleanup_devgate]] の教訓)。

---

## 8. 受入条件 — `tools/verify_pm_drawer_fit.js`(新規・port **10081**)

測るのは「**引き出しが自分の中で中身を切っていないこと**」と「**器をスクロールすれば最下段まで届くこと**」の 2 点。
⭐ 高さの**絶対値**は測らない(端末とフォントで動く)。測るのは **中身と器の関係**だけ。

### ⚠ 計測機構(既存ドライバの写経では動かない点)

- **入口は `#btnAccept` の実クリック**。`openPrep` を直に呼ぶと本物の導線を 1 つも通らない。
  `tools/verify_prep_retire.js:294-350` の `acceptToCinema()` をそのまま流用してよい。
- **`?recruittalk=0` を付ける**。#54 の自動編成モデルになり、主人公 + NPC が必ず 4 枚並ぶ。
  ⚠⚠ **付けないと演出へ到達せず 120 秒でタイムアウトする**(2026-09-07 に実測で踏んだ)。
- **カードは `#pmColumns .pmColumn` を `click()`**。⛔ 画面中央は叩かない(#35 以後そこは死んでいる)。
- **測るのは主人公(0 番・戦士)のカード**。中身がいちばん高い(§2-6)。
- **ポートは 10081**。⚠ 10080 は `ERR_UNSAFE_PORT` で Chrome が拒否する(§2-7)。
- 配信バイトは起動時に凍結する(別窓が同じリポを触っても、この run が読むのは 1 枚)。
- `tavern.html` は **ディスク上 CRLF**。複数行アンカーは `\r\n` で書く。

    const CRLF = FROZEN['/tavern.html'].includes('\r\n') ? '\r\n' : '\n';

### 測る画面

| 記号 | viewport | 何のため |
|---|---|---|
| V1 | 1280×900 | ユーザーの報告環境に近い |
| V2 | 1366×768 | いちばん潰れていた(38px) |
| V3 | 390×844 | iPhone 縦(compact の 30vh 規則が効く) |
| V4 | 390×667 | 極小。⚠ **最悪ケースの (2c) だけ対象外**(§2-4) |

### §0 装置(先に母集団を確かめる)

- **(0a)** 4 画面すべてでマッチング演出へ到達し、`#pmDepart` の hidden が外れ、
  カードを 1 枚押して `#pmDrawer` が可視 + `.pmColumn.pmOpen` が**ちょうど 1 枚**。
  到達までの ms とクリック回数を必ず出す。
  ⭐ **これが無いと以降が全部空振りで永久緑になる。**
- **(0b)** 開いた引き出しの **中身 `scrollHeight` が 400px 以上**ある。
  ⭐ 「潰れていない」を測る前に、**潰れうるだけの中身が実在する**ことを確かめる。
  (実測 = 戦士で 638px(V1/V2) / 963px(V3/V4)。閾値 400 は余裕を持たせた値)
- **(0c)** 引き出しの段の id が実体から引けている: `pmDrawerHead` / `pmDrawerSkillList` /
  `pmDrawerEquip` / `pmDrawerAp` が**全部存在する**。⛔ 表を写経しない。

### §1 引き出しが自分の中で中身を切っていない

- **(1a)** 4 画面すべてで `#pmDrawer.scrollHeight - #pmDrawer.clientHeight === 0`。
- **(1b)** 同じことを**別経路**で: `Math.abs(getBoundingClientRect().height - scrollHeight) <= 2`。
  ⭐ (1a) は `clientHeight`、(1b) は `getBoundingClientRect()`。**片方の写経にしない**
  (実装とドライバが同じ間違いを共有すると両方緑になる)。
- **(1c)** 折り畳み段を**全部開いた最悪ケース**でも (1a) が成立(4 画面)。

### §2 器をスクロールすれば最下段まで届く

- **(2a)** `#pmInner.scrollTop = scrollHeight` にしたとき、`#pmDrawerAp`(傾向段)が
  **完全に viewport 内**(`top >= 0 && bottom <= innerHeight`)。4 画面。
  ⭐ 着手前は 4 画面とも **一部すら見えない**(§2-4)。ここが本チケットの心臓。
- **(2b)** 同じ状態で `#pmDrawerEquip` の `summary` も viewport 内。
- **(2c)** 折り畳み段を全部開いた最悪ケースでも (2a) が成立。
  ⚠ **V4(390×667) は対象外**。中身 1503px を 667px に入れるのは原理的に不可能(§2-4)。
  ⛔ 「対象外」をドライバのコメントに書くこと。黙って抜くと次の人が母集団の痩せを疑う。

### §3 開いたら引き出しが見える位置へ寄る

- **(3a)** カードを押した直後、`|#pmDrawer.top − #pmInner.top| <= 2`(上端そろえ)。4 画面。
- **(3b)** `#pmDrawerClose` を押すと、`#pmInner.scrollTop` が**開く前の値**へ戻る。
  ⭐ 測り方 = 開く前に器を 100px スクロールしておき、開いて閉じたら 100 に戻ることを見る
  (0 に戻る実装だと赤くなる = 「戻す」と「先頭へ飛ぶ」を取り違えない)。
- **(3c)** カード A → カード B と**閉じずに渡り歩いて**から閉じても、(3b) の値に戻る
  (途中の位置を覚え直していないこと)。

### §4 出発の口は死なない(既存 (4c)/(3c) の再測)

- **(4a)** 引き出しを開いたまま `#pmDepart` が viewport 内 かつ
  `document.elementFromPoint(中心)` が `pmDepart` に命中。**4 画面 × {素 / 全段開} = 8 通り**。
- **(4b)** `#pmDrawer.scrollWidth <= #pmDrawer.clientWidth`(横スクロールを起こさない)。4 画面。

### §5 恒等(非退行)

- **(5a)** 引き出しの段の**並びと id**が着手前と 1 つも変わっていない:
  `pmDrawerHead → (pmDrawerNote) → pmDrawerSec(スキル) → pmDrawerEquip → pmDrawerLibrary →
   pmDrawerSummon → pmDrawerAp`(主人公・戦士のとき)。
- **(5b)** `#pmIntelResultList` の computed `max-height` が **17vh 相当のまま**(⛔ 触らない対象)。
- **(5c)** `#pmInner` の computed `overflow-y === 'auto'` かつ
  `#pmDepart` の computed `position === 'sticky'`(⛔ 触らない対象)。
- **(5d)** 引き出しを一度も開かずに出発したとき `selection` と `localStorage` が 1 バイトも変わらない
  (既存 (5a) と同型。CSS 変更が保存へ漏れていないこと)。

### §6 撤退

- **(6a)** `tavern.html?pmfit=0&recruittalk=0` → `#pmDrawer` が再び内側で切れる
  (`scrollHeight - clientHeight > 0`)かつ実高が V1 で 42vh 相当・V3 で 30vh 相当に頭打ち。
- **(6b)** `?pmfit=0` では開いた直後に器がスクロールしない(`#pmInner.scrollTop === 0`)。
- **(6c)** `?pmfit=0` でも `#pmDepart` は押せる(= (4a) と同じ検査が通る)。

### ⛔ 測らないこと

- **引き出しの配色・余白・角丸**(#35 STEP3 が目で決めた領域)。
- **スクロールがなめらかかどうか**(`behavior:'smooth'` の有無)。目で決める余地を残す。
- **引き出しの高さの絶対値**。端末とフォントで動く。測るのは中身と器の**関係**だけ。
- **カード列(`#pmColumns`)と下ごしらえ帯(`#pmBrief`)の高さ**。今回は触らない(§11)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

⚠⚠ **下表は予想。机上で確定させない。** `--only <tag>` で **1 本ずつ**走らせ、
実際に赤くなったラベルを見てから書き換えること(巻き添えは列挙しない)。

| 変異 | 注入する欠陥 | 赤くなるべき(予想) |
|---|---|---|
| **`maxonly`** ⭐⭐⭐ | **`max-height` だけ消して `overflow-y: auto` を残す**(= 素朴な直し方) | (1a)(1b)(2a) |
| `ovback` | `#pmDrawer` に `overflow-y: auto` を戻す | (1a)(1b)(2a) |
| `maxback` | `max-height: 42vh` を戻す(overflow は visible のまま) | (1a)(1b)(1c) |
| `compactback` | **compact の 30vh だけ**戻す | V3/V4 の (1a) だけ(V1/V2 は緑のまま) |
| `noscroll` | `pmOpenDrawer` の自動スクロール 1 行を外す | (3a) |
| `norestore` | `pmCloseDrawer` の復元を外す | (3b) |
| `rafless` | 自動スクロールを `requestAnimationFrame` 抜きで即時実行 | (3a) ← ⚠ 赤くならない run があるなら表から外す |
| `stickydead` | `#pmDepart` の `position: sticky` を外す | (4a) |
| `switchdead` | `?pmfit=0` を無視する(`PM_FIT_ON` を常に true) | (6a)(6b) |
| `switchtwice` | `body.pmFitOff` は付くが CSS 側の上書き規則が無い | (6a) |

⭐ **`maxonly` が最重要**。§2-1 の罠(「max-height が犯人」と読むと 1px も直らない)を機械で守る。
⭐ `compactback` は「基底だけ直して compact を忘れる」を捕まえる。
  #35 の M6 が「42vh だけ消しても 390px では赤くならない」と実測したのと**同じ非対称**。

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ **逐次で回すこと**(並列はポート衝突で偽の赤を生む)。

    for d in driver_action_priority driver_depart_menu_clean driver_equip_compact_ios \
             driver_party_view_reopen verify_darkvision verify_party_match_setup \
             verify_prep_retire verify_quest_walk verify_recruit_size ; do
      node tools/$d.js ; echo "$d exit=$?" ; done
    node tools/verify_party_match_setup.js --negative --only M6      # ★ STEP3 の受入

期待値は §2-8 の表(2026-09-07 実測)。
⚠ **走らせて違ったら、期待値を書き換える前に理由を突き止める。**
⚠ **赤の集合(件数ではなくラベルの集合)で比べる**。着手前の集合に無いラベルが増えたら #56 のせい。

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは **http 起動が必須**(`py -m http.server`)。`file://` ではナレ音声が鳴らない。

1. **iPhone 縦持ち**で受注 → カードを押す。**技の一覧が最初の画面に出ているか**(いちばん効くはず: 22px → 965px)。
2. 同じく iPhone で、指で下へスクロールして **「傾向」の 4 行が読めるか**。
3. 引き出しを開いた瞬間、**カード列が上へ流れていく動きが唐突すぎないか**(なめらかにするか判断)。
4. 「閉じる」を押したときに**元の位置へ戻るのが自然か**、それとも先頭へ戻ってほしいか。
5. デスクトップで **カードが見えなくなること**が気にならないか(気になるなら §11 の「上を畳む」案へ)。
6. 事前情報を 1〜3 件引いてから引き出しを開き、**帯が長くなっても読めるか**。
7. カード A → カード B と渡り歩いたとき、**スクロール位置が飛びすぎないか**。

---

## 10. changelog(⚠ `tavern.html` を触るので必須)

    py tools/add_changelog.py "<b>仲間の設定欄が画面いっぱいに開くように</b> — 装備・スキル・傾向の一覧が細い帯に潰れなくなり、いちばん下の行まで読めるようになりました。"

---

## 11. やらないこと

- ⛔ **カード列と見出しを、引き出しを開いている間だけ畳む**。実測で 335〜423px 稼げるが、
  ユーザーが今回は「器だけ直す」を選んだ。**効果が足りなければ #57 として起こす**。
- ⛔ **スキル段を既定で畳む**。ユーザーが明示的に不採用(開いた瞬間に見えているべき)。
- ⛔ **引き出しの全画面シート化**。(4c)/(3c) を作り直す必要があり別チケット。
- ⛔ **`#pmIntelResultList` の 17vh を触る**。§2-1 の病理を起こしていない(実測)。
- ⛔ **`#pmBrief` / `#pmColumns` / `#pmHeader` の高さを触る**。
- ⛔ **`probe_party_size` / `sweep_recruit_balance` の母集団移設**(#54 由来で赤い 2 本)。
  ⭐ 直し方は 1 行(`?recruittalk=0` を足す)と分かっているが、#56 の母集団ではない。
  **着手前の赤として記録だけして、#56 のせいにしない**。
- ⛔ **`verify_party_match_setup.js` の assert 本体(36 本)を触る**。張り替えるのは変異 M6 の定義だけ。
- ⛔ **`実装依頼書/README.md` への行追加**(着地してから)。用意してある行:

    | 56 | [2026-09-07_pm-drawer-fit.md](2026-09-07_pm-drawer-fit.md) | **承認済** | 0% | マッチング画面の設定引き出しが 22〜170px に潰れる欠陥。器の内側スクロールを廃して #pmInner 1 本へ。撤退 `?pmfit=0`。⭐⭐⭐ 真犯人は `max-height` ではなく **`overflow-y:auto`**(flex 子の自動最小サイズが 0 になり収縮を全部吸う)—— max-height だけ消しても 1px も直らない。⭐⭐ #35 の変異 M6 は **#55 の sticky 化で着手前から空振り**(実走 exit 1)、しかもアンカーが #56 の削除行なので放置すると exit 3。⚠ 新ドライバの port は **10081**(10080 は `ERR_UNSAFE_PORT`)。 |

---

## 12. 実装結果

(実装窓が埋める)

⭐ **依頼書が外していた点を必ず書く。** 特に:

- §8 の負のコントロール表は**予想**である。`--only` で 1 本ずつ確定した実際の対応を書き直すこと。
- `rafless` が赤くならなかった場合、`requestAnimationFrame` が本当に要るのかを実測で判定して書く。
- §2-8 の 9 本の期待値が実走で違ったら、**理由**まで書く。
