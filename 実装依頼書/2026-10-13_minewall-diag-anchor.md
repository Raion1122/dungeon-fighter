# #93 driver_mine_wall の (6a) を時間しだいの [DIAG] から切り離す + 変異アンカーの自己検査を全変異へ(tools のみ)

- **起草**: 2026-10-13(起草窓) / **ステータス**: **承認済**(2026-10-13 ユーザー承認)
- **触るファイル**: `tools/driver_mine_wall.js` / 本依頼書 / `実装依頼書/README.md`(完了時の行更新)
- ⛔ **触らないファイル**: `index.html` / `tavern.html` / `audio.js` / `js/*`(**読むだけ**)。
  ⛔ `tools/driver_field_step6.js` は**実装窓が #92 で編集中**(本チケットは一度も開かない)。`tools/driver_grid_s2.js` も**読むだけ**。
  `git add .` 禁止・**ファイル単位 add**・`git diff --cached <file>` を読んでから commit。
- 新しいポート = **10628**(変異 `diagfake` の子プロセス)。**次の base = 10629**。

---

## 1. 目的

#91 の §12 に残った別チケ候補 2 件(ユーザー決定 2026-10-13「2 件まとめて起草」)。

- **K4** — `driver_mine_wall` の `(6a) 測定ページで pageerror / console.error が出ていない` が、素で**ときどき赤**になる
  (#91 の記録 = 素 5 回中 1 回 `[DIAG][stall] 探索停滞: 10秒間動きなし @ (2016,1056)`)。本番の欠陥ではなく、
  **測定ページの裏で走り続ける Lv10 の実プレイが、時間しだいで自動デバッグの critical を鳴らす**のを (6a) が数えている(§2)。
- **K5** — 変異アンカーの自己検査(#91 で足した「新しいアンカーが他の tools に出てこない」)は、**既存 5 変異を対象外**にしている。
  理由は `noring`/`ringall` のアンカーが `driver_grid_s2.js` にも在るから。⇒ 既知の共有を**名指しの許可表**にして、全 6 変異を検査に入れる。

**起草窓の判断(2026-10-13)**:

- ⭐ K4 採用: (6a) が数えない対象を **`[DIAG][stall]` と `[DIAG][combat-no-round]` の 2 種だけ**に絞って除外する(除外した件数はログに出す)。
  それ以外の `[DIAG]` critical・pageerror・普通の console.error は今までどおり赤。
- K4 不採用 A: **`[DIAG]` を全部除外**((6b) と同じ形)—— 測定ページで本当に鳴った別種の critical まで消える。⇒ 変異 `diagfake` でこの罠を検査する(§6)。
- K4 不採用 B: **測定ページから `?diag=1` を外す** —— `window.__graphRun`(`index.html:40691`)ほか測定が頼る検証シームが生えなくなる。
- K4 不採用 C: **ゲーム側に検出器ごとの停止スイッチを足す** —— `index.html` を触る = changelog が要るのにプレイヤー向けの要約が実在しない(CLAUDE.md の禁止)。
- K5 採用: 許可表 `KNOWN_SHARED_ANCHORS` を**両方向**で検査する(許可表に無い衝突 = vetFail / 許可表に書いたのに実際は衝突していない = vetFail = 表が腐ったら止まる)。
- K5 不採用: `driver_grid_s2.js` 側のアンカーを書き換えて衝突を消す —— 2 本が同じ本番の 1 行を測っているのは正しい(その行が動けば両方赤くなるべき)。消すべきは「黙って対象外」のほう。

---

## 2. 着手前の実測(起草窓が本番コードと実走で確かめた事実・基準 `dc45bd5`)

### 2-0. 今の色(素・順番に 3 回)

    node tools/driver_mine_wall.js      # 既定 9080〜9085

| 回 | 結果 | 所要 | (6a) |
|---|---|---|---|
| 1 | 67/67 | 251 s | 緑 |
| 2 | 67/67 | 214 s | 緑 |
| 3 | 67/67 | 245 s | 緑 |

⇒ #91 の 5 回中 1 回と合わせて **8 回中 1 回赤**。率は小さい数での観測なので受入の固定値にしない。

### 2-1. (6a) が何を数えているか

- `tools/driver_mine_wall.js:303-310` `bootPage` — `console` の `type() === 'error'` を `Failed to load resource` 以外ぜんぶ `errs` へ積む。
- `:939-940` (6a) = `errs.length === 0`。`:941-944` (6b) は実プレイページ(`playErrs`)だけを見て **`[DIAG]` を全部除外**している(注記 `:574-577`)。
- `errs` に積むページ(すべて `?diag=1`): `:604` 主ページ(§1〜§2b を通しで測る・最後まで開いたまま)/ `:638` A/B の `?paintring=0` / `:756,:760` 他シナリオ / `:792` / `:811` / `:887` 既存変異。
- #91 の赤の発生源は `[:9080?diag=1&intel=0&roadchest=0]` = **`:604` の主ページ**。

### 2-2. ⚠⚠⚠ 主ページの裏では Lv10 の実プレイが進み、時間しだいの検出器が鳴る

- 自動デバッグは `?diag=1` で起動(`index.html:3539` `window.__diagEnabled = …`・`:41282` で休眠判定)。検査は `:41704` の 500ms interval。
  critical は `record()`(`:41343-41362`)が **`console.error("[DIAG][" + id + "]", …)`** で出す(`:41352`)。
- 時間しだいで鳴る critical は 2 種:
  - `stall` `:41519-41541` — 探索中に `playerX/Y` が 10 秒(500ms × 20)同じ。
  - `combat-no-round` `:41506-41507` — ラウンドが 15 秒進まない。⚠ #91 K2 で「Lv10 では 1 ラウンドが最大 17 秒」と実測済(閾値を素で超えうる)。
- 検出器ごとの停止スイッチは無い(`setupDiagnostics` は `__diagEnabled` だけで決まる)。
- **起草窓のプローブ**(主ページと同じ `?diag=1&intel=0&roadchest=0`・xp 45000・`startGame()` → ダイアログを閉じる → `__graphRun.enter('n1','right')` → 90 秒放置):
  **2 回とも `[DIAG][combat-no-round] ラウンドが15秒進行せず` が console.error で出た**(57.7 s / 63.2 s)。n1 で敵 10 体と戦闘が続いている。
  ⇒ 素のドライバで (6a) が緑なのは、測定の手順が主ページの戦闘の進み方を偶然そらしているだけ。**同じ型の赤が stall 以外でも出うる**。
- プローブ: scratchpad `k45/probe_stall.js`(`node probe_stall.js <port> <秒> n1`)。

### 2-3. K5 — 変異アンカーの衝突(全 tools の文字列で数えた)

| 変異 | アンカー(`index.html` の 1 行) | index.html | 他の tools |
|---|---|---|---|
| noring | `const sealing = !!(p.sealRing && !PAINT_RING_OFF);`(`index.html:7149`) | 1 | **`driver_grid_s2.js:195`** |
| ringall | (noring と同じ行) | 1 | **`driver_grid_s2.js:195`** |
| centeronly | `for (const t of unitBodyTiles(def, tx, ty)) if (isTileWall(t.tx, t.ty)) return false;` | 1 | なし |
| nofallback | `const per = (def.trampleTiles \|\| 4);` | 1 | なし |
| nomass | `return !!(def && (def.isBoss \|\| def.heavyOverlap === true \|\| def.displaySize >= OVERLAP_BOSS_SIZE));` | 1 | なし |
| nochariot(#91) | `return king.hp <= king.maxHp * CHARIOT_HP_TRIGGER;` | 1 | なし(既に検査済) |

- 今の自己検査 `tools/driver_mine_wall.js:154-170` は `NEW_MUT_ORDER`(nochariot)だけを回す(注記 `:155-156`)。
- 衝突は**1 行・1 本だけ**(`driver_grid_s2.js` の自前の `noring` 変異が同じ行を握っている)。

**計測コマンド**(再測定するとき・リポジトリ直下で):

    node -e "const fs=require('fs'),path=require('path');const src=fs.readFileSync('tools/driver_mine_wall.js','utf8');const M=eval('('+/const MUTATIONS = (\{[\s\S]*?\n\});/.exec(src)[1]+')');const idx=fs.readFileSync('index.html','utf8');const peers=fs.readdirSync('tools').filter(f=>/\.(js|mjs|py|ps1)$/.test(f)&&f!=='driver_mine_wall.js');for(const k in M){const core=M[k][0].trim();console.log(k,idx.split(M[k][0]).length-1,peers.filter(f=>fs.readFileSync(path.join('tools',f),'utf8').indexOf(core)>=0).join(',')||'-')}"

### 2-4. changelog の要否

`scripts/hooks/check_changelog.py:24` `GAME_LOGIC = ("index.html", "tavern.html", "audio.js")` → tools だけなので**鳴らない・書かない**。

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `tools/driver_mine_wall.js` | ① (6a) の除外を 2 種の id に絞って足す ② 変異 `diagfake`(子プロセス・port 10628) ③ 自己検査を全 6 変異へ + `KNOWN_SHARED_ANCHORS` ④ 冒頭の注記(ポート表・`--negative` の説明) |
| 本依頼書 | §12 実装結果 |
| `実装依頼書/README.md` | 完了時の #93 行更新 |

---

## 4. STEP1 — (6a) を時間しだいの [DIAG] から切り離す(K4)

```js
/* ★[#93 K4] 測定ページ (?diag=1) の裏では Lv10 の実プレイが進み続け、自動デバッグの
 *   「時間しだい」の critical が鳴りうる (stall = 探索中 10 秒静止 / combat-no-round = ラウンド 15 秒)。
 *   どちらも測定の手順が作った状態で、測っている規則とは無関係。⚠ 除外するのはこの 2 種だけ —
 *   [DIAG] を全部消すと、測定ページで本当に鳴った別種の critical まで見えなくなる (変異 diagfake が検査)。 */
const DIAG_TIMING_IDS = /\[DIAG\]\[(stall|combat-no-round)\]/;
const timingDiag = errs.filter(e => DIAG_TIMING_IDS.test(e));
const realErrs   = errs.filter(e => !DIAG_TIMING_IDS.test(e));
check('(6a) 測定ページで pageerror / console.error が出ていない (時間しだいの [DIAG] 2 種を除く)',
  realErrs.length === 0,
  realErrs.slice(0, 6).join(' | ') + (timingDiag.length ? ' / 除外した時間しだいの [DIAG] ' + timingDiag.length + ' 件' : ''));
```

- ⭐ 除外した件数は**緑のときもログに出す**(`console.log`)。「8 回に 1 回」が実際に何件消えているかを後で読めるように。
- ⛔ (6b)(`[DIAG]` 全除外)は変えない。⛔ (6a) の判定名は**接頭辞 `(6a)` を保つ**(母集団走査の突き合わせが判定名の頭で引く)。

## 5. STEP2 — 変異アンカーの自己検査を全 6 変異へ(K5)

`:154-170` のブロックを、既存 5 変異(`MUTATIONS` の `[from, to]`)と新変異(`NEW_MUTATIONS` の `{from, to}`)の**両方**を回す形へ。

```js
/* ★[#93 K5] 既知の共有アンカー。同じ本番の 1 行を 2 本が測るのは正しい (その行が動けば両方赤くなるべき)。
 *   ⚠ 表は**両方向**で検査する: 表に無い衝突 = vetFail / 表に書いたのに実際は衝突していない = vetFail (表が腐ったら止まる)。 */
const KNOWN_SHARED_ANCHORS = {
  '        const sealing = !!(p.sealRing && !PAINT_RING_OFF);': ['driver_grid_s2.js'],   // noring / ringall
};
```

- 判定は「アンカー(`trim()` 後)を含む他の tools の集合」=== 「許可表の集合」(無ければ空集合)。
- `index.html` に**ちょうど 1 回**も全 6 変異で見る(既存 5 変異は今、起動時には数えていない = (0a) の注入結果で間接にしか見ていない)。
- ⚠ 走査対象は今と同じ `fs.readdirSync(__dirname)` の `.js/.mjs/.py/.ps1`(自分自身を除く)。

## 6. STEP3 — `--negative` に `diagfake` を足す

#91 の子プロセス方式(`:180-230`)に乗せる。ただし `diagfake` は**配信を変えない**(ドライバ側の注入)ので、`NEW_MUTATIONS`(`index.html` の書き換え)とは別の表 `DRIVER_MUTATIONS` に置く。

- `--mutate diagfake` の子は、`:604` の主ページを起こした直後に
  `page.evaluate(() => console.error('[DIAG][fakecrit] 注入した critical (#93 diagfake)'))` を 1 回実行し、`playHits.diagfake = 1` を立てる(親の「注入行の実行 回数」判定に乗る)。
- `NEW_MUT_PORT.diagfake = 10628`。`NEG_EXPECT.diagfake = [L6A]`(L6A = §4 の (6a) の判定名の定数)。
- ⭐ これが §1 不採用 A の罠(`[DIAG]` を全部除外すると本物の critical も消える)の再現。除外を `[DIAG]` 全体へ広げると (6a) が緑のまま = 変異が空振りして exit 1。
- ⚠ 起動時の vet(「変異のアンカーが index.html に 1 回」「注入文字列が原本に無い」)は `NEW_MUTATIONS` だけに掛ける。`DRIVER_MUTATIONS` には掛けない(index.html を触らないので)。

---

## 7. 撤退スイッチ

本番の挙動は 1 バイトも変えないので**ゲーム側の撤退スイッチは無い**。撤退 = `git revert`。

---

## 8. 受入条件

### §0 装置

- 既存の (0a)/(0b) が全緑のまま(既存 5 変異の配信が成立している)。
- 起動時の vet が全 6 変異を見ていることをログに出す(`[vet] アンカー自己検査: 6 変異 / 既知の共有 1 行 (driver_grid_s2.js)`)。

### §1 本体

- **(6a)** 素で緑。除外した時間しだいの [DIAG] の件数がログに出る。
- 自己検査: **実装時に 1 回だけ手で**、`KNOWN_SHARED_ANCHORS` から `driver_grid_s2.js` を抜く → 起動時に vetFail(exit 2)、元へ戻す → 通る、を確かめて §12 に書く(恒久の装置にはしない)。

### §2 非退行

- `node tools/driver_mine_wall.js` → **67/67**(判定の本数は変えない)を **3 回連続**。
- `node tools/driver_mine_wall.js --negative` → 既存 5 + `nochariot` + **`diagfake`** = **7/7 が担当どおり**。
  ⚠ `diagfake` の担当は (6a) **だけ**(他の判定が赤くなったら「担当が絞れていない」で ✗ = 今の親の判定がそのまま効く)。
- `node tools/driver_grid_s2.js` → 今と同じ本数(⛔ 開かずに走らせるだけ)。
- ⚠ 基準は 2026-10-13 の 3 回(67/67)。違ったら期待値を書き換える前に理由を突き止める。

### ⛔ 測らないこと

- 時間しだいの [DIAG] が何回鳴ったか(率)。ログに出すだけ。
- 自動デバッグの閾値(10 秒 / 15 秒)そのもの —— `index.html` の話で本チケットの範囲外。

---

## 9. 実機/実感の確認

なし(tools のみ)。

---

## 10. changelog

不要(§2-4)。

---

## 11. やらないこと

- ⛔ `combat-no-round` の閾値 15 秒を Lv10 向けに直すこと(#91 K2 の申し送り。`index.html` = 別件)。
- ⛔ 測定ページの実プレイを止めること(敵を消す・ループを凍らせる)—— 測定は本番の関数を呼んでいるだけだが、凍らせ方しだいで測る盤面が動く。
- ⛔ `driver_grid_s2.js` の変異アンカーの書き換え(§1 K5 不採用)。
- ⛔ 他の本の (6a) 相当(`?diag=1` のページで console.error を数える本は他にもある)への横展開 —— 赤の実例が出てから 1 本ずつ。
- ⛔ `tools/driver_field_step6.js`(#92 実装中)。
- `実装依頼書/README.md` へ足す行(起草コミットで追加):

    | 93 | [2026-10-13_minewall-diag-anchor.md](2026-10-13_minewall-diag-anchor.md) | **承認済** | 0% | driver_mine_wall の (6a) を時間しだいの [DIAG](stall / combat-no-round)から切り離す + 変異アンカーの自己検査を全 6 変異へ(tools のみ)。⚠ 測定ページの裏で Lv10 の実プレイが進み、時間しだいの critical が鳴るのが真因(stall だけでなく combat-no-round も実測で鳴る)。⭐ 除外は 2 種だけ・変異 diagfake で「全部除外」の罠を検査・共有アンカーは許可表を両方向で。新 port 10628・次 base 10629 |

---

## 12. 実装結果

(実装窓が埋める)
