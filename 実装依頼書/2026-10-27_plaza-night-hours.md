# #102 闇市は夜だけ開く — 20 時〜深夜 1 時なら誰でも入れる(変装の関門を時刻の関門へ)

- **起草**: 2026-10-27(計画窓) / **ステータス**: **承認済**(2026-10-27 ユーザー承認)
- **基準**: `3cb06b5`(clean・push 済) / 新規ドライバの port base **10641**
- **触るファイル**: `js/plaza-hours.js`(新規)・`tavern.html`・`town.html`・`index.html`・
  `tools/verify_plaza_hours.js`(新規)・既存ドライバ 10 本の種まき 1 行(§6-2)・`tools/verify_plaza_map.js`((4e) の言い直し)・
  `実装依頼書/README.md`(#102 行・起草窓が承認時に追加済み → 実装窓は進行度を更新)
- ⛔ **触らないファイル**: なし(並走している別窓なし。起草時 `git status` = clean)。
  ⛔ ただし **`js/plaza-map.js` は 1 バイトも変えない**(§2-4 罠 C)。

---

## 1. 目的

闇市(ポドルプラザ)は今、**2 段の関門**で守られている。

1. **解禁** … 依頼を累計 5 回クリアすると、酒場の「地下への石段」と港町の「怪しい石段」が現れる
2. **門番** … 入るたびに「変装の手段」を問われる。ポリモーフを習得した魔法使い/エルフか、
   `ワンドオブポリモーフ` を 1 チャージ消費しないと「人間の匂いだ。失せな」と追い返される

ユーザーの設定では、闇市は**裏社会の人間もモンスターも誰でも出入りする場所**。変装を要求するのは
設定に合わない。そこで 2 段目を「**夜(端末の時計で 20:00〜24:59 = 25 時まで)なら誰でも入れる**」へ置き換える。

**ユーザー決定(2026-10-27)**:

- **解禁(5 回クリア)は残す**。変えるのは 2 段目だけ。
- **入れるのは端末のローカル時刻 20:00〜24:59 だけ**(「20 時〜25 時」= 深夜 1 時の手前まで)。
- **昼は入り口が消える**(港町の看板も酒場の石段の札も **DOM に作らない**)。
  - ✗ 不採用「見えるが閉じている(押すと門番が『夜に来な』)」— ユーザーは秘密感を選んだ。
- **昼は誰も入れない**。ワンドオブポリモーフは**入場の役目を外す**: 低 Tier ボスからのドロップと闇市の常設在庫をやめる。
  **所持済みの杖は残す**(消さない・チャージも減らない)。ポリモーフ習得者の裏技(`hasInnateDisguise`)も入場には効かなくなる。
  - ✗ 不採用「杖を昼の入場券にする」— 昼は入り口が消えるので使う場所が無い(ユーザー確認済み)。
- **中にいる間に 1 時を過ぎても居られる**(判定は入る時だけ。追い出さない)。
- ⏭ **ポリモーフ(杖・呪文)の新しい使い道は、闇市とは別の箇所で次回以降に考える**(本チケットではやらない・§11)。

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 関門の呼び口(リポジトリ全文 grep で実測・`tools/` を除く)

| ファイル:行 | 何 |
|---|---|
| `tavern.html:5635` | `PLAZA_UNLOCK_QUEST_COUNT = 5`(**残す**) |
| `tavern.html:5639` | `loadPlazaStateTV` の既定 `{ unlocked, gatekeeperEventSeen, wandDropEnabled, everEntered, … }` |
| `tavern.html:5656-5658` | `PLAZA_ITEMS_TV.wand_polymorph`(`consumeTrigger: "onPlazaEnter", alwaysInStock: true`・効果文「ポドルプラザへの入場に必要。」) |
| `tavern.html:6076-6079` | 帰還時にクリア累計を数え、5 で `unlocked = true`(**残す**) |
| `tavern.html:10211-10216` | `hasInnateDisguise()` — mage/elf かつ polymorph 習得 |
| `tavern.html:10217-10223` | `updatePlazaDoor()` — 旧 `#plazaDoor` の display(`unlocked` だけで決める)+ `__tavernRefreshSigns()` |
| `tavern.html:10245-10249` | `playGatekeeperRejection(firstReject)`(声 `plaza_gatekeeper_reject`) |
| `tavern.html:10451-10453` | `enterPlaza` の「本物の術師か。通りな」(声 `plaza_enter_innate`) |
| `tavern.html:10457-10472` | **`onTapPlazaDoor(opts)` = 門番の判定のただ 1 か所**(innate → 杖消費 → 追い返し) |
| `tavern.html:10680-10681` | `refreshPlazaStock` が杖を `kind: "always"` で毎回在庫へ push |
| `tavern.html:10841` | 検証の窓 `__plazaTV` に `onTapPlazaDoor, enterPlaza, hasInnateDisguise, updatePlazaDoor, …` |
| `tavern.html:11056` | `initEnterVia` — 港町の石段から来たら `onTapPlazaDoor({ from: "town" })` |
| `tavern.html:11264-11267` | 地図の札の `plazaUnlocked()`(`plazaStateTV.unlocked` を読むだけ) |
| `tavern.html:11398` | `if (d.requiresPlazaUnlock && !plazaUnlocked()) return;` ← **§2-3 罠 B** |
| `tavern.html:11517` | 地図の「地下への石段」に着いたら `onTapPlazaDoor()` |
| `tavern.html:2844` | `body.tavernMapOn #plazaDoor { display: none !important; }`(地図モードでは旧扉は常に隠れる) |
| `town.html:766-772` | `plazaUnlocked()`(localStorage の `plazaState.unlocked` を読むだけ) |
| `town.html:777-827` | `buildSigns()` — 先頭で `elHud.innerHTML = ""`。看板と HUD ボタン `townHudBtn_<key>` を作る |
| `town.html:781` | `if (f.requiresPlazaUnlock && !plazaUnlocked()) return;` |
| `town.html:828` | `buildSigns();`(起動時 1 回だけ) |
| `js/town-map.js:151-155` | 施設 `plaza`「怪しい石段」`requiresPlazaUnlock: true` |
| `js/tavern-map.js:162-163` | 扉 `plaza`「地下への石段」`requiresPlazaUnlock: true` |
| `js/plaza-map.js:149-151` | 杖屋の `items: ["wand_polymorph", "wand_magic_missiles", "pearl_of_power"]` |
| `index.html:14554-14579` | `isLowTierRun` / `POLYMORPH_WAND_DROP_CHANCE` 0.15・0.06 / `maybeGrantPolymorphWand`(`wandDropEnabled` 時のみ・ボス撃破) |
| `index.html:14604-14606` | `PLAZA_ITEMS.wand_polymorph`(tavern と**二重定義・同期必須**) |
| `index.html:18330` | `maybeGrantPolymorphWand(enemy);`(呼び口はここ 1 か所) |
| `assets/voice/manifest.json:386-404` | 声 `plaza_gatekeeper_reject` / `plaza_enter_innate` / `plaza_enter_first` |

⇒ **入り口を出す/隠す判定は 3 か所だけ**(酒場の地図の札 11398・旧扉 10219・港町 781)、
**入れるかどうかの判定は `onTapPlazaDoor` の 1 か所だけ**(酒場の地図・旧扉・港町からの `enterVia` の 3 経路すべてがここを通る)。

### 2-2. ⚠⚠⚠ 罠 A — 実時計で判定すると、既存ドライバが「夜は緑・昼は赤」になる

`plazaState` を `unlocked: true` で種まきして闇市の札・入場を測っている既存ドライバが **10 本**ある(`grep -lE "unlocked: *true" tools/*.js`):

`verify_plaza_map` / `verify_plaza_crowd` / `verify_plaza_curio` / `verify_quest_visibility` / `verify_save_slots` /
`verify_town_changelog` / `verify_town_exit` / `verify_town_map` / `driver_heromark_signplate` / `driver_room_search_roll`

本チケット後、これらは**走らせた時刻しだいで結果が変わる**。起草時刻は 08:10(昼)なので、実装窓が昼に走らせれば赤、
夜に走らせれば緑 = **原因の分からない揺れ**として後のチケットを汚す。

→ **時刻の上書きを `sessionStorage` に置けるようにし(§4)、10 本すべての種まきに 1 行足す**(§6-2)。
⭐ 上書きは**ページ遷移をまたぐ**必要がある(港町の石段 → `tavern.html` の `initEnterVia` で入場判定するので、
クエリだけだと港町で開いていた闇市が酒場側で閉じる)。`?town=0` → `sessionStorage["dragonfighters.townOff"]` と同じ作法。
⭐ この罠は §8 の変異 `nocarry`(クエリを sessionStorage へ写さない)で装置に内蔵する。

### 2-3. ⚠⚠ 罠 B — `tavern.html:11398` の行は 1 文字も変えない

`tools/verify_tavern_map.js:225-227` の変異 `plazashow` が、この行を**文字列そのまま**で探して差し替える:

    from: '        if (d.requiresPlazaUnlock && !plazaUnlocked()) return;',

この行を書き換える(例: `!plazaUnlocked() || !open`)と、`verify_tavern_map --negative` の `plazashow` が
**差し替え先を見つけられず**壊れる。→ **時刻の判定は直後に別の 1 行として足す**(§5-1 ③)。
`plazaUnlocked()` の中身へ時刻を混ぜるのも禁止(名前が嘘になり、`verify_tavern_map` の `o.plazaUnlocked` 観測とずれる)。
⭐ §8 (9a) で「この行がソースのバイトにそのまま在る」を検査する。変異 `rewriteline` で赤を確かめる。

### 2-4. ⚠⚠ 罠 C — 杖を露店の `items` から外すと `verify_plaza_map` (2a) と変異 `missingitem` が壊れる

- `verify_plaza_map` (0c)(2a) は「`PLAZA_ITEMS_TV ∪ PLAZA_ITEMS_COMMON_TV` の **16 個**の id がそれぞれちょうど 1 つの露店に属す」を
  実行時とソースの 2 経路で測る。所持済みの杖を表示するため**カタログからは消せない**ので、露店から外すと 16 個のうち 1 つが余り → 赤。
- 同ドライバの変異 `missingitem`(`tools/verify_plaza_map.js:111`)は `"wand_polymorph", "wand_magic_missiles", "pearl_of_power"]` を
  文字列で探す。

**前例がある**: #97 で古い 4 品(`potion_shadow` / `fang_charm` / `cursed_blade` / `medusa_mirror`)を店に並べなくしたとき、
**露店の `items` には残し、カタログに `retired: true` を付けて在庫の抽選から外した**(`tavern.html:5676` のコメント
「⛔ 行を消さない・id を変えない = 手持ちは今までどおり効く」)。

→ 杖も同じにする: **`js/plaza-map.js` は触らない**。カタログ 2 か所(tavern/index)に `retired: true` を付け、
`refreshPlazaStock` の常設 push をやめる。
⭐ `verify_plaza_srd` (0a) が固定で見るのは「新しい 8 品が retired でない / 古い 4 品が retired」だけ
(`tools/verify_plaza_srd.js:432-444`)で、杖はどちらにも入っていない → 杖に `retired: true` を足しても (0a) は動かない。
(0b) は両ファイルの `retired` を id ごとに突き合わせる → **両方に足せば緑のまま**(片方だけだと赤 = 正しい検出)。

### 2-5. 時刻の境界

| 時刻 | 開いている? |
|---|---|
| 19:59 | ✗ |
| 20:00 | ✅ |
| 23:59 | ✅ |
| 00:00 | ✅ |
| 00:59 | ✅ |
| 01:00 | ✗ |
| 12:00 | ✗ |

式は `h >= 20 || h < 1`(`h = getHours()`、分は見ない)。

### 2-6. 境界をまたぐ瞬間(ページを開いたまま)

| 状況 | 今のコードのまま時刻判定を足すだけだと | 決め |
|---|---|---|
| 19:59 に港町を開いたまま 20:00 を過ぎる | 札は起動時 1 回しか作らない(`town.html:828`)→ 夜なのに現れない | **30 秒ごとに開閉を見て、変わったら札を作り直す**(§5-1 ⑥・§5-2 ③) |
| 00:59 に札が見えていて、01:00 過ぎに押す | 札は残っているので入れてしまう | **`onTapPlazaDoor` で入る瞬間にもう一度判定**。閉まっていたら門番の一言を出して札を消す(§5-1 ④) |
| 00:59 に港町で石段を押し、`tavern.html` が開いたのが 01:00 | 同上 | 同上(`initEnterVia` も `onTapPlazaDoor` を通るので、ここ 1 か所で拾える) |
| 闇市の中で 01:00 を過ぎる | — | **何もしない**(ユーザー決定)。tick は闇市の画面を閉じない |

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:32` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → **鳴る**(tavern/index を触る)。
プレイヤー向けの要約は実在する(入り方が変わる)。§10。

### 2-8. 既存 golden の基準値(`3cb06b5`・2026-10-27 08:10〜 = 昼に実測)

12 本すべて緑(§8 末尾の表)。⚠ 昼に測った = **今は時刻の関門が無いので昼でも緑**。実装後に昼に走らせて同じ数が出れば、罠 A の種まきが効いている証拠になる。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `js/plaza-hours.js`(新規) | 開いている時間の**唯一の正**。時刻の上書き・撤退スイッチの読み取りもここ 1 か所 |
| `tavern.html` | script 1 行 / 旧扉・地図の札に時刻判定を足す / `onTapPlazaDoor` の夜の分岐 / 店じまいの一言 / 杖の常設在庫をやめる / 30 秒 tick / 杖カタログに `retired` |
| `town.html` | script 1 行 / 看板に時刻判定を足す / 30 秒 tick |
| `index.html` | script 1 行 / `maybeGrantPolymorphWand` を止める / 杖カタログに `retired`(tavern と同期) |
| `tools/verify_plaza_hours.js`(新規) | §8 |
| 既存ドライバ 10 本 | 種まきに時刻の上書き 1 行(§6-2) |
| `tools/verify_plaza_map.js` | (4e) を「昼は港町から来ても開かない」へ言い直す(§6-3) |

⛔ **`js/plaza-map.js` / `js/town-map.js` / `js/tavern-map.js` は触らない**(`requiresPlazaUnlock` はそのまま = 「解禁」の意味を保つ)。
⛔ `tavern.html:11398` の行は 1 文字も変えない(罠 B)。

---

## 4. STEP1 — `js/plaza-hours.js`(新規)

    /**
     * js/plaza-hours.js — 闇市ポドルプラザが開いている時間の唯一の正 (#102)。
     *   20:00〜24:59 (端末のローカル時刻) だけ開く。判定は「入る瞬間」だけ (中に居る間は追い出さない)。
     *   tavern.html / town.html / index.html の 3 ページが読む。⛔ 時刻の数字を各ページへ写さない。
     *
     * 時刻の上書き (検証・dev 用): ?plazaclock=<0-23> → sessionStorage へ写す (ページ遷移をまたぐ)。
     *   ?plazaclock=real で消す。⚠ 端末の時計を変えれば同じことができるので、チートの口として塞がない。
     * 撤退: ?plazanight=0 → sessionStorage へ写す (#101 までの「変装の門番」へ戻る)。?plazanight=1 で消す。
     *   ⚠ 港町 → 酒場 → 冒険 (index) をまたいで効かせるため、?town=0 と同じ sessionStorage の作法。
     */
    (function (global) {
      "use strict";
      var OPEN_HOUR = 20, CLOSE_HOUR = 1;          // [20:00, 25:00)
      var CLOCK_KEY = "dragonfighters.plazaClock";
      var OFF_KEY = "dragonfighters.plazaNightOff";
      try {
        var q = new URLSearchParams(location.search);
        var c = q.get("plazaclock");
        if (c === "real") sessionStorage.removeItem(CLOCK_KEY);
        else if (c !== null && /^\d{1,2}$/.test(c) && Number(c) < 24) sessionStorage.setItem(CLOCK_KEY, String(Number(c)));
        var n = q.get("plazanight");
        if (n === "0") sessionStorage.setItem(OFF_KEY, "1");
        else if (n === "1") sessionStorage.removeItem(OFF_KEY);
      } catch (e) {}
      function on() {
        try { return sessionStorage.getItem(OFF_KEY) !== "1"; } catch (e) { return true; }
      }
      function hourNow() {
        try {
          var v = sessionStorage.getItem(CLOCK_KEY);
          if (v !== null && /^\d{1,2}$/.test(v)) return Number(v);
        } catch (e) {}
        return new Date().getHours();
      }
      function isOpenAt(h) { return h >= OPEN_HOUR || h < CLOSE_HOUR; }
      global.PLAZA_HOURS = {
        OPEN_HOUR: OPEN_HOUR, CLOSE_HOUR: CLOSE_HOUR, TICK_MS: 30000,
        on: on,                    // false = 撤退中 (時刻の関門なし・変装の門番)
        hourNow: hourNow,
        isOpenAt: isOpenAt,
        /** 時刻の関門を通れるか。⚠ 撤退中は常に true (= 旧来どおり時刻を見ない) */
        isOpen: function () { return !on() || isOpenAt(hourNow()); }
      };
    })(window);

- `on` / `hourNow` は**関数**(定数にしない)。検証で sessionStorage を後から書くことがあるので毎回読む。
- 読み込み位置: `tavern.html` は `js/plaza-map.js` の行(2958)の**直後**、`town.html` は `js/town-map.js`(480)の直後、
  `index.html` は 3287〜3291 の並びの末尾。
- ⭐ **部品が読めなかったとき(`window.PLAZA_HOURS` が無い)は撤退と同じ姿**へ落とす(各ページの判定関数で吸収・§5)。

---

## 5. STEP2 — 3 ページの配線(1 コミット・changelog 1 行)

### 5-1. `tavern.html`

① **判定の窓口を 2 つ**(`hasInnateDisguise` の直前あたり):

    /* ★[#102] 闇市の時刻の関門。唯一の正は js/plaza-hours.js。部品が無ければ撤退と同じ姿 (時刻を見ない)。 */
    function plazaNightOnTV() { try { return !!(window.PLAZA_HOURS && PLAZA_HOURS.on()); } catch (e) { return false; } }
    function plazaOpenNowTV() { try { return !window.PLAZA_HOURS || PLAZA_HOURS.isOpen(); } catch (e) { return true; } }

② `updatePlazaDoor()`(10219)の display を `plazaStateTV.unlocked && plazaOpenNowTV()` へ。

③ 地図の札(**11398 の行は変えずに、その直後へ 1 行足す**):

        if (d.requiresPlazaUnlock && !plazaUnlocked()) return;
        /* ★[#102] 昼は闇市の石段を DOM に作らない (時刻の判定は js/plaza-hours.js)。⚠ 上の行は変えない (verify_tavern_map の plazashow が文字列で探す) */
        if (d.requiresPlazaUnlock && !plazaOpenNowTV()) return;

④ `onTapPlazaDoor(opts)` の先頭(`from` を決めた直後)に夜の分岐。**撤退中は以下を飛ばして旧コードへ落ちる**:

    if (plazaNightOnTV()) {
      /* ★[#102] 夜なら誰でも通れる。変装 (杖・習得) は見ない・杖を消費しない。
         ⭐ 入る瞬間にもう一度時刻を見る (札を出したまま 1 時を過ぎた / 港町で押して酒場が開いたら 1 時だった)。 */
      if (!plazaOpenNowTV()) { await playPlazaClosed(); updatePlazaDoor(); return; }
      await enterPlaza({ chargeConsumed: false, innate: false, from: from });
      return;
    }

   ⛔ 旧コード(`hasInnateDisguise` → `consumeChargeTV("wand_polymorph")` → 追い返し)は**消さない**(撤退が使う)。

⑤ 店じまいの一言(`playGatekeeperRejection` の隣)。**声は付けない**(`voiceId` = null。声の追加は §11):

    async function playPlazaClosed() {
      await playPlazaOverlayNarration("📜 ポドルプラザ — 門番",
        ["……店じまいだ。日が落ちてから来な。", "(ポドルプラザが開くのは 20 時〜深夜 1 時)"], null);
    }

⑥ 30 秒 tick(`updatePlazaDoor()` の初回呼び出し 10837 の近く)。**開閉が変わったときだけ** `updatePlazaDoor()`:

    /* ★[#102] ページを開いたまま 20:00 / 01:00 をまたいだら石段を出し入れする。⚠ 闇市の中に居ても閉じない (判定は入る時だけ) */
    if (plazaNightOnTV()) {
      let lastOpen = plazaOpenNowTV();
      setInterval(function () {
        const now = plazaOpenNowTV();
        if (now !== lastOpen) { lastOpen = now; updatePlazaDoor(); }
      }, (window.PLAZA_HOURS && PLAZA_HOURS.TICK_MS) || 30000);
    }

⑦ `refreshPlazaStock`(10680-10681)の杖の常設 push を**撤退中だけ**にする:

    // ポリモーフの杖の常設在庫は #101 までの門番のため。★[#102] 夜の関門では売らない (撤退中だけ並べる)
    if (!plazaNightOnTV()) stock.push({ itemId: "wand_polymorph", price: PLAZA_ITEMS_TV.wand_polymorph.price, kind: "always" });

⑧ カタログ `PLAZA_ITEMS_TV.wand_polymorph`(5656-5658)に `retired: true` を足し、効果文から入場の一文を外す:

    wand_polymorph: { name: "ワンドオブポリモーフ", type: "key_item", maxCharges: 3, tier: 1, price: 6,
      consumeTrigger: "onPlazaEnter", alwaysInStock: true, retired: true,
      effect: "パーティ全員をモンスターの姿に変える。" },

   ⚠ `consumeTrigger` / `alwaysInStock` は撤退が使うので残す。⚠ index.html 側と**同じ文字列**にする(§2-4・verify_plaza_srd (0b))。

⑨ `__plazaTV`(10841)に `nightOn: plazaNightOnTV, openNow: plazaOpenNowTV` を足す(検証の窓)。

### 5-2. `town.html`

① script 1 行(§4)。

② `buildSigns()` の 781 行の**直後**に:

        /* ★[#102] 昼は闇市の石段を DOM に作らない (時刻の唯一の正は js/plaza-hours.js。部品が無ければ時刻を見ない) */
        if (f.requiresPlazaUnlock && window.PLAZA_HOURS && !PLAZA_HOURS.isOpen()) return;

③ 30 秒 tick。開閉が変わったら `signs = {}` に戻してから `buildSigns()`(⚠ `buildSigns` は `elHud.innerHTML = ""` で DOM を
   捨てるが、`var signs = {}`(776)の参照は残る → 作り直す前に空にする)。撤退中(`PLAZA_HOURS.on()` が false)は tick を立てない。

### 5-3. `index.html`

① script 1 行(§4)。

② `maybeGrantPolymorphWand(enemy)` の先頭に:

      if (window.PLAZA_HOURS && PLAZA_HOURS.on()) return;   // ★[#102] 夜の関門では杖を落とさない (撤退中だけ #101 までのドロップ)

③ `PLAZA_ITEMS.wand_polymorph`(14604-14606)を §5-1 ⑧ と同じ文字列へ。

⛔ `gatekeeperEventSeen` / `wandDropEnabled` の既定値・読み書きは**消さない**(撤退が使う。セーブの互換)。

---

## 6. STEP3 — 受入ドライバ + 既存ドライバの種まき

### 6-1. `tools/verify_plaza_hours.js`(新規・port 10641)— §8

### 6-2. 既存 10 本の種まきに 1 行(罠 A)

§2-2 の 10 本で、`plazaState` を `unlocked: true` で書いているのと**同じ `evaluateOnNewDocument`**(またはそれに当たる種まき)に:

    sessionStorage.setItem('dragonfighters.plazaClock', '21');   /* ★[#102] 闇市は夜だけ開く。時計で揺れないよう夜に固定 */

⚠ `verify_town_map` は種まきの前に `sessionStorage` の `dragonfighters.*` を全部消している(220 行付近)→ **消した後**に置く。
⚠ 走らせて「昼の実時計のまま」走っていないことを確かめる: 起草時刻と同じく**昼に** 10 本を走らせ、§8 末尾の基準と一致すること。

### 6-3. `tools/verify_plaza_map.js` (4e) の言い直し

今の (4e) は「杖 0・戦士だと港町から来ても開かない(門番の追い返し・`gatekeeperEventSeen` false → true)」。
夜の関門ではこれは**仕様どおり開く**ので赤になる。→ (4e) を **「昼(`plazaClock = 12`)に港町から来ても地図が開かない
(店じまいの一言)」** へ言い直す。追い返しの検査は §8 の撤退節 (Xb) が引き継ぐ。
⭐ ラベル (4e) は変えない(`ALL_LABELS` の並びを動かさない)。説明文と中身だけ変える。

---

## 7. 撤退スイッチ

- **`?plazanight=0`** — #101 までの姿: 時刻を見ない・変装の門番・杖の常設在庫・低 Tier ボスの杖ドロップ。
- ⚠ 判定位置 = `js/plaza-hours.js` の `on()` だけ。各ページは `PLAZA_HOURS.on()` を読む(`plazaNightOnTV` / town の tick / index のドロップ)。
- ⚠ ページ遷移を**またぐ**(`sessionStorage["dragonfighters.plazaNightOff"]`)。港町 → 酒場 → 冒険(index)まで効く。`?plazanight=1` で消える。
- 部品(`js/plaza-hours.js`)が読めないときも撤退と同じ姿(§4)。

---

## 8. 受入条件 — `tools/verify_plaza_hours.js`(新規・port 10641)

方針: **時刻は 2 経路で動かす**。(i) `sessionStorage.plazaClock`(上書きの経路)と、(ii) **`Date` そのものを差し替えた実時計の経路**
(上書きなし)。上書きだけで測ると「実時計を読む式が壊れていても緑」になる。観測は DOM(札の有無・`#plazaScreen` の開閉)と
`__plazaTV.state()` / `plazaInventory`(杖の本数)。**ナレの文言そのものは測らない**(§「測らないこと」)。

### ⚠ 計測機構 — `Date` の差し替え(実時計の経路)

`page.evaluateOnNewDocument` で、ページの JS より先に `Date` を差し替える。`window.__fakeNow(ms)` で時刻を後から動かせる形にする:

    await page.evaluateOnNewDocument((startMs) => {
      const RealDate = Date; let base = startMs, realAt = RealDate.now();
      const now = () => base + (RealDate.now() - realAt);
      class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
        static now() { return now(); }
      }
      window.Date = FakeDate;
      window.__fakeNow = (ms) => { base = ms; realAt = RealDate.now(); };
    }, startMs);

- `startMs` は「その日のローカル時刻 HH:MM」を `new Date(y, m, d, HH, MM).getTime()` で作る(ドライバ側 = 同じ端末のローカル時刻)。
- ⚠ `performance.now` / `requestAnimationFrame` は触らない(歩きの補間が壊れる)。
- tick の検査 (5a) は **`TICK_MS` 30 秒 + 余裕 10 秒**まで待つ。⚠ tick を短くする上書き口は本番に作らない(待てば済む)。

### §0 装置(先に母集団を確かめる)

- **(0a)** 3 ページ(`tavern.html` / `town.html` / `index.html`)で `window.PLAZA_HOURS` が在り、`OPEN_HOUR === 20 && CLOSE_HOUR === 1`。
  ⭐ これが無いと各ページは「部品無し = 撤退と同じ姿」へ黙って落ちるので、以降の全節が別の理由で緑/赤になる。
- **(0b)** 上書きが効いている: `?plazaclock=21` で開いた `town.html` の `PLAZA_HOURS.hourNow() === 21`、
  **同じタブで `tavern.html` へ移った後も 21**(遷移をまたぐ)。⭐ 変異 `nocarry` がここを赤くする。
- **(0c)** 実時計の経路が生きている: 上書きなし・`Date` を 21:30 に差し替え → `hourNow() === 21`、12:00 に差し替え → `12`。
  ⭐ 変異 `overrideonly` がここを赤くする。

### §1 境界(2 経路)

- **(1a)** `PLAZA_HOURS.isOpenAt(h)` を h = 0..23 で引き、§2-5 の表(20〜23・0 が true、他は false)と一致。
- **(1b)** **DOM 経路**: 上書きなし・`Date` を 19:59 / 20:00 / 23:59 / 00:00 / 00:59 / 01:00 / 12:00 に差し替えた
  `town.html` で `#townSign_plaza` と `#townHudBtn_plaza` の有無、`tavern.html` で `#tavernDoor_plaza` の有無が (1a) と一致。
  ⭐ (1a) の写経にしない — (1b) は関数を呼ばずに DOM だけを見る。

### §2 昼は消える / 解禁は残る

- **(2a)** 昼(`plazaClock = 12`)・`unlocked: true` → 港町の看板・HUD ボタン・酒場の石段の札が **DOM に無い**。
  `?tavernmap=0` の旧扉 `#plazaDoor` は `display === "none"`。
- **(2b)** 夜(21)・`unlocked: false` → 同じく **DOM に無い**(5 回クリアの解禁は残る)。
- **(2c)** 夜(21)・`unlocked: true` → 3 つとも**在る**(`?tavernmap=0` の旧扉は `display === "flex"`)。(2a)(2b) の「無い」の空振り防止。

### §3 夜は誰でも入れる

- **(3a)** 夜・**戦士・杖 0・習得なし**・`gatekeeperEventSeen: false` → 酒場の石段を押す(`__plazaTV.onTapPlazaDoor()`)→ `#plazaScreen` が開き、
  `#plazaViewport .mwStage` が在る。`gatekeeperEventSeen` は **false のまま**(追い返しを経ていない)。
- **(3b)** 夜・戦士・杖 0 → 港町から入る(`sessionStorage enterVia = "plaza"` を置いて `tavern.html`)→ 開く・(2,9) に立つ。
- **(3c)** 夜・戦士・**杖 [3,3]** → 入った後も `plazaInventory.wand_polymorph` が **[3,3] のまま**(消費しない・消えない)。
- **(3d)** 夜・**魔法使い + polymorph 習得** → 入れる。「本物の術師か」の一言を挟まない(オーバーレイが出ないまま開く)。

### §4 入る瞬間の再判定

- **(4a)** `Date` を 00:59:50 で `tavern.html` を開く → 石段の札が在る → `__fakeNow` で 01:00:10 へ → `onTapPlazaDoor()` →
  `#plazaScreen` は**開かない**・店じまいのオーバーレイ(`#prologueOverlay` が表示された)を経る・その後 `#tavernDoor_plaza` が **DOM から消える**。
- **(4b)** 港町経由: `plazaClock = 12` で `enterVia = "plaza"` を置いて `tavern.html` を開く → 開かない(§6-3 の (4e) と同じ現象を別ドライバで)。

### §5 開いたまま境界をまたぐ

- **(5a)** `Date` 19:59:50 で `town.html` → 看板なし → `__fakeNow` で 20:00:10 → **40 秒以内**に `#townSign_plaza` が現れる。
  酒場も同様(`#tavernDoor_plaza`)。
- **(5b)** 逆向き: 00:59:50 → 01:00:10 → 40 秒以内に消える(港町・酒場)。
- **(5c)** 港町で作り直した後も、看板は**ちょうど 1 枚**(`querySelectorAll('[data-facility="plaza"]')` が看板 1 + HUD 1)。
  ⭐ `signs = {}` の戻し忘れ・二重生成の検出。

### §6 中に居れば 1 時を過ぎても居られる

- **(6a)** 00:59:00 に入る → `__fakeNow` で 01:00:30 → 40 秒待つ → `#plazaScreen` は**開いたまま**・露店の札を押して歩ける(`openStall` が立つ)。

### §7 杖の供給が止まる

- **(7a)** 夜の関門(撤退なし)で `refreshPlazaStock()` を 50 回 → 在庫に `wand_polymorph` が **0 回**。母集団: 同じ 50 回で `potion_healing`(always)は 50 回在る。
- **(7b)** `index.html` で `plazaState.wandDropEnabled = true`・`Math.random = () => 0`・ボスの敵オブジェクトで `maybeGrantPolymorphWand` →
  杖が**増えない**。(撤退の (Xc) と対)
- **(7c)** カタログ: 両ファイルのソースのバイトで `wand_polymorph` の定義に `retired: true`、効果文に「入場」の語が無い。実行時の `PLAZA_ITEMS_TV.wand_polymorph.retired === true`。

### §8 恒等(非退行)

- **(8a)** `js/plaza-map.js` / `js/town-map.js` / `js/tavern-map.js` のバイトが `3cb06b5` と一致(`git show`)。
- **(8b)** `PLAZA_UNLOCK_QUEST_COUNT === 5`(両ファイルのソース)。

### §9 罠 B

- **(9a)** 配信中の `tavern.html` のバイトに `        if (d.requiresPlazaUnlock && !plazaUnlocked()) return;` が**ちょうど 1 回**在る。

### §X 撤退

- **(Xa)** `town.html?plazanight=0`・昼(12)・`unlocked: true` → 看板が**在る**。同じタブで `tavern.html` へ → 石段の札が在る(遷移をまたぐ)。
- **(Xb)** 撤退・戦士・杖 0 → `onTapPlazaDoor()` → 開かない・`gatekeeperEventSeen` false → true(#101 までの追い返し)。
- **(Xc)** 撤退・杖 [3] → 入れる・杖が [2] に減る。`refreshPlazaStock()` の在庫に `wand_polymorph`(always)が在る。
  `index.html`(同じタブ)で (7b) と同じ条件 → 杖が 1 本増える。
- **(Xd)** `?plazanight=1` で戻すと夜の関門へ戻る(昼は看板なし)。

### ⛔ 測らないこと

- 店じまいの一言・初回ナレの**文言**(耳/目で直す余地を残す)。測るのは「オーバーレイを経た / 経ていない」だけ。
- 30 秒という tick の**長さそのもの**(40 秒以内に変わることだけ見る)。
- 闇市の中の品・露店・住人の挙動(既存ドライバの担当)。

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nocarry` | `plaza-hours.js` がクエリを sessionStorage へ写さない(その場の変数だけ) | (0b)・(Xa) ← **罠 A** |
| `overrideonly` | `hourNow` が上書き無しのとき常に 21 を返す | (0c)・(1b) |
| `closeoff` | `CLOSE_HOUR` の比較を `h <= 1` にする | (1a)・(1b) |
| `daysign` | town.html の時刻の 1 行を外す | (1b)・(2a) |
| `notap` | `onTapPlazaDoor` の再判定(`if (!plazaOpenNowTV())`)を外す | (4a)・(4b) |
| `notick` | tavern/town の setInterval を立てない | (5a)・(5b) |
| `stilldisguise` | 夜の分岐を外す(旧の門番のまま) | (3a)・(3b) |
| `kickout` | tick で開閉が変わったら `closePlaza()` も呼ぶ | (6a) |
| `stillstock` | 杖の常設 push を無条件に戻す | (7a) |
| `dropalive` | `maybeGrantPolymorphWand` の先頭の return を外す | (7b) |
| `rewriteline` | 11398 の行を `if (d.requiresPlazaUnlock && (!plazaUnlocked() \|\| !plazaOpenNowTV())) return;` に書き換え、直後の 1 行を消す | (9a) ← **罠 B** |
| `retiredone` | tavern.html 側だけに `retired: true`(index は付けない) | (7c) |

⭐ 変異は**配信スナップショットをメモリ上で差し替える**(本番ファイルを書き換えない)。port は 10641 を順に使う(`verify_town_changelog` と同じ作法)。

### 既存 golden の非退行(実装後に必ず走らせる)

⚠ 基準値は **2026-10-27 08:10〜(昼)・`3cb06b5`** の実測。**走らせて違ったら、期待値を書き換える前に理由を突き止める**。
⭐ 実装後も**昼に**走らせる(罠 A の種まき漏れは昼にしか出ない)。

| ドライバ | `3cb06b5` の実測(2026-10-27 08:10〜08:17・昼) | 本チケットでの扱い |
|---|---|---|
| `tools/verify_plaza_map.js` | **43/43**(節 27) | 種まき + (4e) 言い直し。⭐ #101 の教訓: town.html を丸ごとバイト比較する (5b) があるので必ず走らせる |
| `tools/verify_plaza_crowd.js` | **41/41** | 種まき |
| `tools/verify_plaza_curio.js` | **28/28** | 種まき |
| `tools/verify_plaza_srd.js` | **27/27** | 種まき不要(杖の `retired` で (0b) が両ファイル一致のまま緑であること) |
| `tools/verify_town_map.js` | **85/85** | 種まき(sessionStorage を消した**後**) |
| `tools/verify_town_exit.js` | **素 23/23** | 種まき |
| `tools/verify_tavern_map.js` | **47/47** | 種まき不要。⭐ **`--negative` も走らせる**(変異 `plazashow` が罠 B の行を見つけられること) |
| `tools/verify_quest_visibility.js` | **素 39/39** | 種まき |
| `tools/verify_save_slots.js` | **30/30** | 種まき |
| `tools/verify_town_changelog.js` | **56/56** | 種まき |
| `tools/driver_heromark_signplate.js` | **46/46** | 種まき |
| `tools/driver_room_search_roll.js` | **39/39** | 種まき |

計測コマンド(再測定するとき・1 本ずつ順に。並列にすると port がぶつかる):

    for d in verify_plaza_map verify_plaza_crowd verify_plaza_curio verify_plaza_srd verify_town_map verify_town_exit verify_tavern_map verify_quest_visibility verify_save_slots verify_town_changelog driver_heromark_signplate driver_room_search_roll; do node tools/$d.js > /tmp/$d.log 2>&1; echo "$d rc=$? :: $(grep -E '[0-9]+ */ *[0-9]+' /tmp/$d.log | tail -1)"; done

---

## 9. 実機/実感の確認(ここが本当の受入)

⚠ ローカルは http 起動が必須(file:// では音が出ない)。

- PC: 昼に港町・酒場を開き、闇市の石段が**無い**ことを見る。端末の時計を 20 時過ぎへ(または `?plazaclock=21`)→ 石段が現れ、戦士・杖なしで入れる。
- 開いたまま 1 時をまたいで(`?plazaclock` ではなく端末の時計で)石段が消えること・中に居れば追い出されないこと。
- iPhone: 夜に港町から入れる。
- 杖を持っていたセーブで、入った後も杖の本数が変わらないこと。

---

## 10. changelog(⚠ `tavern.html` / `index.html` を触るので必須・STEP2 のコミットで)

    py tools/add_changelog.py "<b>闇市は夜だけ開くように</b> — 20時〜深夜1時なら、変装なしで誰でもポドルプラザへ入れる。昼は入り口が消える。"

---

## 11. やらないこと

- ⛔ **ポリモーフ(杖・呪文)の新しい使い道** — 闇市とは別の箇所で、次回以降に別チケット(ユーザー指示 2026-10-27)。
  本チケットでは杖を「持っているだけの品」にするだけ。巻物 `scroll-polymorph` の扱いも変えない。
- ⛔ 店じまいの一言の**声**(VOICEVOX)。今回は文字だけ(`voiceId` = null)。
- ⛔ 使わなくなった声 `plaza_gatekeeper_reject` / `plaza_enter_innate` と mp3 の削除(撤退が使う)。
- ⛔ `gatekeeperEventSeen` / `wandDropEnabled` の削除・セーブの移行(撤退が使う)。
- ⛔ 解禁(5 回クリア)したことを知らせる演出の追加。昼に解禁すると夜まで入り口が見えないが、今回はそのまま。
- ⛔ 闇市の中で「閉店まであと何分」を出す等の時計表示。
- ⛔ `js/plaza-map.js` の杖屋の `items` から杖を外すこと(罠 C)。

`実装依頼書/README.md` に足す行:

    | 102 | [2026-10-27_plaza-night-hours.md](2026-10-27_plaza-night-hours.md) | **承認済** | 0% | 闇市は夜(20 時〜深夜 1 時)だけ開き誰でも入れる。昼は入り口が DOM に無い。杖は入場に使わず供給も止める(所持は残す)。⚠ 既存 10 本に時計の種まき(罠 A)・⭐ tavern.html:11398 の行は不変(罠 B)・plaza-map.js 不変(罠 C)・撤退 ?plazanight=0 |

---

## 12. 実装結果

(実装窓が埋める)
