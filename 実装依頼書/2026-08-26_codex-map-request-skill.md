# #24 Codex への MAP 発注を `codex-map-request` スキルへ落とす

- **起草**: 2026-08-26(計画窓) / **ステータス**: **承認済**(2026-08-26 ユーザー承認)
- **着手順**: ⭐ **本チケットが先。** 完了 → 窓更新 → #25(銀の鹿亭)。
  #25 の STEP1 が本スキルを実際に呼ぶので、順序を入れ替えないこと
- **触るファイル**:
  - 新規 `.claude/skills/codex-map-request/SKILL.md`
  - 新規 `.claude/skills/codex-map-request/references/map-brief-template.md`
  - 新規 `.claude/skills/codex-map-request/references/grid-fit-recipe.md`
  - 新規 `.claude/skills/codex-map-request/references/mask-authoring.md`
  - 改修 `tools/make_grid_map.py`(`--fit` モードの追加のみ。`GRIDS` と焼く処理は 1 行も動かさない)
  - 新規 `tools/verify_codex_map_skill.js`(受入条件の装置)
- ⛔ **触らないファイル**: 無し(2026-08-26 時点で `git status` は clean = 別窓は稼働していない)

---

## 1. 目的

`#25`(銀の鹿亭の D&D マップ化)以降、**Codex へ MAP を発注して DF のタイル格子へ乗せる**作業が
繰り返し発生する。ところがこの作法は現在**どこにも書かれていない**。実際に在るのは

- `tools/make_grid_map.py` の docstring(= 焼き方だけ。**発注の仕方は無い**)
- `codex1/requests/README.md` の「書き方の指針」(= スプライト向け。**MAP 固有の落とし穴は無い**)
- `~/.codex/skills/dnd-map-maker/SKILL.md`(= codex 側の作り方。**受け取り側の作法は無い**)

の 3 つに散っており、しかも **格子を測る道具 `fit_grid.py` は scratchpad に在ったので既に消えている**
(§2-2 で実測)。この状態で #25 に着手すると、実装窓は「納品された PNG の周期と位相をどう測るのか」
から自力で再発明することになる。

**ユーザー決定(2026-08-26)**:

- 銀の鹿亭 / 復興評議会館 / ポドルプラザの **3 か所すべてを歩ける MAP にする**(長期方針)
- 依頼書は 1 枚ずつ起こす。**まず本スキル化 → 窓更新 → #25 銀の鹿亭**の順
- ⭐ 不採用: 「#25 の中で作法もついでに書く」——`tavern.html` の大改造と同じコミットに
  混ぜると、スキルの側が「#25 でたまたまこうした」の記録に劣化する

---

## 2. 着手前の実測(この窓が本番コードと実ファイルで確かめた事実)

### 2-1. 既に在るもの / 無いもの(全数)

| 在処 | 何が書いてある | MAP 発注の作法として足りるか |
|---|---|---|
| `~/.codex/skills/dnd-map-maker/SKILL.md` (12,796 bytes) | codex 側の作図手順・overhead-view audit・生成プロンプト雛形・digital-game reuse 節 | ✅ **発注文の材料はここが唯一の正**。ただし受け取り側の話は無い |
| `~/.codex/skills/dnd-map-overlay/` | 同系統の overlay 用スキル | 参考 |
| `C:\Users\PC_User\Desktop\codex1\requests\README.md` | 命名規則 / 書き方の指針 6 項目 / 取り下げの記録 | ⚠ スプライト前提。**MAP には「焼き込み格子」の話が要る** |
| `tools/make_grid_map.py` (346 行) | 台帳 `GRIDS` / `bake()` / `verify()` / `--check` | ✅ 焼く側は完成。**測る側が無い**(§2-2) |
| `tools/probe_town_mask.js` | 本番の絵 + 本番の MASK を重ねた目視補助(assert 無し) | ✅ MASK の目視はここ |
| `tools/paint_blocked_grid.py` | タイル境界と行/列番号を焼いた作業用画像 | ⚠ `ROOM_PAINTINGS_DEF` 専用。街/酒場の MASK には使えない |
| **作法そのもの** | — | ❌ **存在しない** |

`GRIDS` の実績 4 件(`py tools/make_grid_map.py --list` の出力より):

| キー | 素材 | 周期 | マス数 | tile | 貼り先 |
|---|---|---|---|---|---|
| `mine-entrance` | 廃坑入口.png | 45.70 x 45.59 | 33 x 22 | 64 | `room_goblin-mine_n0` |
| `mine` | 廃坑.png | 38.46 x 41.44 | 39 x 23 | 64 | `room_goblin-mine_n1` |
| `bandit-hideout` | 盗賊団のアジト.png | 30.52 x 31.14 | 52 x 26 | 48 | `room_bandits-forest_n7_map` |
| `phlan-harbor` | harbor-town-rebuilding-player-v1.png | 63.945 x 64.410 | 23 x 15 | 64 | `town_phlan` |

### 2-2. ⚠⚠⚠ 罠 A — 格子を測る道具が既に消えている

`tools/make_grid_map.py` の docstring はこう書いている:

```
★台帳 (GRIDS) の値はどこから来たか
    scratchpad の measure_grid.py → fit_grid.py (櫛形フィルタ) で当てた実測値。
```

**この 2 本はリポジトリに 1 バイトも残っていない**(実測):

```
$ git ls-files | grep -i 'fit_grid\|measure_grid'
(0 件)
$ ls tools/ | grep -i 'grid\|fit\|measure'
attack_scale_fit.py  driver_grid_*.js  make_grid_map.py  paint_blocked_grid.py
```

scratchpad はセッション固有の一時領域なので、**次に MAP を 1 枚受け取った瞬間に詰む**。
`make_grid_map.py --check` は「焼き上がりが正しいか」しか見ないので、
**焼く前の素材から `phase` / `period` / `cells` を出す口が無い**。

⭐ ただし**アルゴリズム自体は `make_grid_map.py` の中に生き残っている** —
`line_response()`(細い暗線の強調)と `comb_score()`(櫛形フィット)が `verify()` から使われている。
つまり**新しく書くのではなく、既存の 2 関数を素材へ向けて回す口を足すだけ**でよい。

### 2-3. 罠 A の再現 — 既存台帳の 6 数値を素材から復元できた ⭐⭐⭐

**基準そのものを再計算して一致を見せる**(依頼書の数字を信じずに測り直した):

| 軸 | 本窓が素材から復元した値 | 台帳 `phlan-harbor` の値 | 一致 |
|---|---|---|---|
| 縦線 周期 | **63.945 px** | 63.945 | ✅ |
| 縦線 位相 | **33.40 px** | 33.4 | ✅ |
| 縦線 マス数 | **23** | 23 | ✅ |
| 横線 周期 | **64.410 px** | 64.41 | ✅ |
| 横線 位相 | **7.25 px** | 7.25 | ✅ |
| 横線 マス数 | **15** | 15 | ✅ |

**6/6 が小数点以下まで一致**した。つまり `--fit` は「新しい測定器を発明する」のではなく
**既存台帳を再現できる復元**であり、この一致が受入条件 §8 (1a) の根拠になる。

**計測コマンド**(再測定するとき。`--fit` 実装後は `py tools/make_grid_map.py --fit <src>` が置き換える):

```bash
py -c "
import importlib.util, numpy as np
from PIL import Image
spec = importlib.util.spec_from_file_location('mgm', 'tools/make_grid_map.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
src = r'C:\Users\PC_User\Desktop\codex1\maps\harbor-town-rebuilding-player-v1.png'
gray = np.asarray(Image.open(src).convert('L'), dtype=np.float64)
for name, axis in (('tate',0), ('yoko',1)):
    resp = m.line_response(gray, axis)
    best = (-1,0,0); T = 60.0
    while T <= 68.0:
        ph = 0.0
        while ph < T:
            s = m.comb_score(resp, T, ph)
            if s > best[0]: best = (s, T, ph)
            ph += 0.05
        T += 0.005
    s,T,ph = best
    print(name, round(T,3), round(ph,2), int((len(resp)-ph)//T))
"
```

### 2-4. ⚠⚠ 罠 B — マス数は「発注する値」ではなく「測って出てくる値」

素材は 1536 x 1024 = **24 x 16 マス丁度に見える**が、実際に取れるのは **23 x 15** である。
理由は位相と周期の実測値から一意に決まる:

```
(1536 - 33.40) / 63.945 = 23.49  → 整数マスは 23
(1024 -  7.25) / 64.410 = 15.78  → 整数マスは 15
```

codex の描く格子は 64.000px 丁度ではないし、左上から始まってもいない。
だから **依頼文に「24 x 16 マスで納品せよ」と書いても、その通りには焼けない**。
⭐ 正しい発注は「**1 マス 64px 相当の格子で、1536x1024**」であって、
**マス数は受け取ってから測って決める**。スキルはこの順序を明記すること。

⚠ `phlan-harbor` の切り出しで捨てた端(左 33.4 / 右 31.9 / 上 7.3 / 下 50.6px)は
どれも岩・水・建物の外壁で歩ける床が 0 マスだった(#12 で目視確認済)。
つまり **発注文には「外周 1 マスは捨てられても構わない飾りにせよ」**と書く必要がある。

### 2-5. ⚠⚠ 罠 C — 過去に実際に起きた「機械チェックが本文に勝つ」事故

`codex1/requests/README.md` の「書き方の指針」6 が名指しで記録している(2026-08-16 扉 v2):

> 本文には「`open` の右端は**切り口ではなく自由端の小口**」と書いたのに、
> 受入条件へ「端の標準偏差 5px 以上」を課したため、**指標に合わせて割られた**扉が納品された。
> これは納品側でなく**依頼側の誤り**。

MAP では同じ事故が「**格子を濃く**」で起きうる。格子線を濃くする数値目標を書くと、
codex は**格子を強調するために床の階調を潰す**方向へ寄せる。
⭐ スキルの雛形には「指標と本文が食い違ったら**閾値をいじらず数値で差し戻してほしい**」を
**必ず入れる**(扉 v3 で実際に正しく差し戻ってきた実績がある)。

### 2-6. 投下の実務(既に確立済み・変えない)

```bash
py tools/codex_request.py --request "<md への絶対パス>" --dry-run           # ヘッダ全文を読む
py tools/codex_request.py --request "<md への絶対パス>" --sandbox read-only # 下見
py tools/codex_request.py --request "<md への絶対パス>"                     # 本番 (workspace-write)
```

- 作業根は常に `C:\Users\PC_User\Desktop\codex1`(`--cd` 既定)。本体には書かせない
- ログは `codex1/requests/_runs/<timestamp>_<slug>.log` / `.last.md`
- ⭐⭐⭐ **投下前に必ず `--dry-run` でヘッダ全文を読む**(定型ヘッダが依頼文より優先される)

### 2-7. changelog の要否

`scripts/hooks/check_changelog.py:24` を読んだ結果:

```python
GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
```

本チケットが触るのは `.claude/skills/**` と `tools/**` だけなので **鳴らない**。
⭐ したがって `tools/make_grid_map.py` に `--fit` を足すのは**本番ファイルを触らずに済む**
正しい寄せ先である(CLAUDE.md の「調査シームは検証ツール側へ寄せる」に一致)。

### 2-8. 既存 golden(本チケットは 1 本も触らない)

本チケットは `index.html` / `tavern.html` / `town.html` / `world.html` / `js/**` を
**1 バイトも変更しない**ので、既存ドライバは原理的に影響を受けない。
それでも §8 で 2 本だけ走らせて「触っていないこと」を実証する。

| ドライバ | 期待 | 測定日 |
|---|---|---|
| `tools/verify_quest_walk.js` | **25/25 PENDING 0** / `--negative` **46/46 PENDING 0** | **2026-08-26 本窓で実測** |
| `tools/verify_recruit_size.js` | **82/82** | **2026-08-26 本窓で実測** |

---

## 3. 変更範囲

| ファイル | 変更 |
|---|---|
| `.claude/skills/codex-map-request/SKILL.md` | **新規**。発注 → 受入 → 焼き付け → MASK の 4 段を 1 枚に |
| `.claude/skills/codex-map-request/references/map-brief-template.md` | **新規**。codex への依頼文の雛形(そのまま埋めれば出せる形) |
| `.claude/skills/codex-map-request/references/grid-fit-recipe.md` | **新規**。測る/焼く/検算のコマンドと閾値の根拠 |
| `.claude/skills/codex-map-request/references/mask-authoring.md` | **新規**。MASK の書き方と目視の作法 |
| `tools/make_grid_map.py` | `--fit <src>` を追加。⛔ `GRIDS` / `bake()` / `verify()` の**中身は 1 行も変えない** |
| `tools/verify_codex_map_skill.js` | **新規**。受入条件の装置(`--negative` 内蔵) |

⛔ `index.html` / `tavern.html` / `town.html` / `world.html` / `js/**` / `assets/**` は開かない。
⛔ `codex1/` へは何も書かない(本チケットは発注しない。作法を書くだけ)。

---

## 4. STEP1 — `tools/make_grid_map.py` に `--fit` を足す

`argparse` へ 2 引数、`main()` へ 1 分岐、モジュール末尾へ 1 関数。**既存の関数は触らない**。

⚠ 行番号は**必ずズレる前提**で扱うこと。2026-08-26 時点の目安は
`add_argument` 群 = 306〜312 行付近 / `if args.check:` = 322 行付近だが、
着手時に `grep -n 'add_argument\|if args.check' tools/make_grid_map.py` で測り直す。

```python
# ── argparse へ 2 行 ────────────────────────────────────────────────
ap.add_argument("--fit", help="素材画像の焼き込み格子を測って GRIDS 用の値を出す (焼かない)")
ap.add_argument("--fit-around", type=float, default=None,
                help="--fit の探索中心 px (既定 = --tile / 未指定なら 32〜120 を粗く走査)")

# ── main() の --check 分岐の**直前**へ ──────────────────────────────
if args.fit:
    return fit(args.fit, args.tile, args.fit_around)
```

```python
def fit(path, tile, around):
    """素材の焼き込み格子を櫛形フィットで測り、GRIDS へ貼れる形で出す。

    ⭐⭐⭐ 新しい測定器ではない。verify() が使っている line_response / comb_score を
       **素材へ向けて**回すだけ。だから既存台帳 phlan-harbor の 6 数値を復元できる
       (依頼書 #24 §2-3 = 受入条件 (1a) の根拠)。

    ⚠⚠ マス数は入力ではなく出力。(len - phase) // period の整数部が答え。
       1536x1024 の素材でも 24x16 にはならず 23x15 になる (#24 §2-4)。
    """
    src = path if os.path.isabs(path) else os.path.join(SRC_DIR, path)
    if not os.path.exists(src):
        alt = path if os.path.isabs(path) else os.path.join(ROOT, path)
        if not os.path.exists(alt):
            raise SystemExit(f"素材が見つかりません: {path}")
        src = alt
    im = Image.open(src).convert("RGB")
    gray = np.asarray(im.convert("L"), dtype=np.float64)
    print(f"--- 格子フィット: {src}  {im.width}x{im.height}")

    # 探索範囲。中心が与えられていればその ±6%、無ければ 32〜120px を粗く走査してから詰める
    center = around if around else (float(tile) if tile else None)
    out = {}
    for name, axis, key in (("縦線", 0, "x"), ("横線", 1, "y")):
        resp = line_response(gray, axis)
        lo, hi = (center * 0.94, center * 1.06) if center else (32.0, 120.0)
        # 粗 → 細 の 2 段。⚠ 1 段目を粗くしすぎると別の極大へ吸い込まれる (verify と同じ理由)
        best = (-1.0, lo, 0.0)
        step = max(0.05, (hi - lo) / 400.0)
        T = lo
        while T <= hi:
            ph = 0.0
            while ph < T:
                s = comb_score(resp, T, ph)
                if s > best[0]:
                    best = (s, T, ph)
                ph += 0.25
            T += step
        lo2, hi2 = best[1] - 0.30, best[1] + 0.30
        T = lo2
        while T <= hi2:
            ph = 0.0
            while ph < T:
                s = comb_score(resp, T, ph)
                if s > best[0]:
                    best = (s, T, ph)
                ph += 0.05
            T += 0.005
        score, period, phase = best
        n = int((len(resp) - phase) // period)      # ⚠ round() にしない (#24 §2-4 / 変異 fitceil)
        out[key] = {"period": round(period, 3), "phase": round(phase, 2),
                    "cells": n, "score": round(score, 3)}
        print(f"    {name}: 周期 {period:8.3f}px / 位相 {phase:6.2f}px / "
              f"整数マス {n:3d} / score {score:.3f}")

    print()
    print("    GRIDS へ貼る形:")
    print(f'        "phase":  ({out["x"]["phase"]:.2f}, {out["y"]["phase"]:.2f}),')
    print(f'        "period": ({out["x"]["period"]:.3f}, {out["y"]["period"]:.3f}),')
    print(f'        "cells":  ({out["x"]["cells"]}, {out["y"]["cells"]}),')
    print()
    print("    ⚠ マス数は測って出てきた値。発注時に決めた数と違っていても、こちらが正しい。")
    print("    ⚠ 貼ったら必ず --name <キー> で焼き、末尾の検算 3 指標が OK になることを見る。")
    return 0
```

⛔ **`DEFAULT_TILE` / `TOL_*` / `GRIDS` / `bake()` / `verify()` を動かさないこと。**
`--fit` は読むだけの追加であり、既存 4 件の焼き上がりは 1 バイトも変わってはならない
(受入条件 (3a) がこれを SHA-256 で見る)。

⚠ 実装前に **HEAD 側で既存 4 件を焼いて SHA-256 を控える**こと:

```bash
py tools/make_grid_map.py --all --out-dir "<scratchpad>/base" > "<scratchpad>/base.log"
py -c "import hashlib,glob,os; [print(os.path.basename(p), hashlib.sha256(open(p,'rb').read()).hexdigest()[:16]) for p in sorted(glob.glob(r'<scratchpad>/base/*.jpg'))]"
```

---

## 5. STEP2 — `.claude/skills/codex-map-request/SKILL.md`

`impl-request` と同じ構成(`SKILL.md` + `references/`)。frontmatter は `name` / `description`。

`description` に入れる発動トリガー(日本語 + 英語の両方。既存 2 スキルと同じ作法):

> 「MAP を発注して」「codex にマップ頼んで」「バトルマップ作って」「部屋の地図を作りたい」
> 「歩けるマップにしたい」「グリッドマップを焼いて」など、codex1 の `dnd-map-maker` へ
> MAP を発注し、納品物を DF のタイル格子へ乗せる意図。
> Use this skill to commission a top-down grid map from codex1 and bake it onto the DF tile grid.

本文に必ず入れる 4 段(⭐ **順序を動かさない**。実装窓が同じ順で読む前提):

### 段 1. 発注する前に決める 5 つ

| 決める | なぜ |
|---|---|
| **用途**(部屋絵 / 街 / 屋内 / 屋外) | `tile` と貼り先が決まる |
| **貼り先の変数名** | `GRIDS` の `out` になる。後から変えると台帳と assets が食い違う |
| **1 マス px**(48 / 64 / 96) | ⚠ **素材の情報量より大きくしない**。`make_grid_map.py` の「なぜ 1 マス 64px で焼くのか」節が唯一の正 |
| **歩ける床の割合** | 卓や柱で埋めすぎると findPath が通らない |
| **捨ててよい外周** | ⚠ 切り出しは必ず端を捨てる(#24 §2-4)。捨てる帯に歩ける床を置かせない |

⛔ **マス数はここで決めない**(#24 §2-4 = 罠 B)。決めるのは「1 マス px」と「画像の寸法」だけ。

### 段 2. 依頼文を起草 → `--dry-run` → `read-only` 下見 → 本番投下

`references/map-brief-template.md` を埋めて `codex1/requests/YYYY-MM-DD_<slug>.md` へ置く。
⭐⭐⭐ **投下前に必ず `--dry-run` でヘッダ全文を読む**(定型ヘッダが依頼文より優先される)。
⭐ ユーザー承認を取ってから投下する(起草 → 承認 → 投下の 3 段は変えない)。

### 段 3. 納品を受け入れる(⚠ ここが一番よく飛ばされる)

```bash
py tools/make_grid_map.py --fit "<納品 png>" --tile 64          # 周期/位相/マス数を測る
# → 出た 3 行を GRIDS へ貼る
py tools/make_grid_map.py --name <キー>                          # 焼く + 末尾で自動検算
py tools/make_grid_map.py --check assets/<out>.jpg --tile 64     # 焼き上がりだけ再検算
```

検算の 3 指標(`make_grid_map.py` の `verify()` が唯一の正。⛔ 閾値を勝手に緩めない):

| 指標 | 許容 | 意味 |
|---|---|---|
| 累積ドリフト | 4.0 world-px | マップの反対端で焼き込み線と DF の線が何 px ずれるか |
| 位相ズレ | 2.0 world-px | 原点側のズレ。**全域に一様に効く**ので締めてある |
| score 比 | 70% 以上 | 「そもそも格子を捉えているか」の門番。**精度の物差しではない** |

⚠⚠ **ピーク計数で測らない**(2026-08-17 に実際に踏んだ。廃坑入口で崖の岩肌を格子と誤検出し、
**正しく焼けている画像を NG と報告した**)。

⚠ 納品物が透過 PNG を含むなら `py tools/check_alpha_bg_residue.py` も通す
(⚠⚠⚠ 透過 PNG の欠陥は背景色しだいで不可視。効くのは**充填率**だけ)。

### 段 4. MASK を書く

- 1 文字 = 1 マス。**歩けない理由を 1 語にまとめない**(`js/town-map.js` の `LEGEND` が実例:
  水 `~` / 建物 `B` / 露店 `s` / 瓦礫 `r` / 岩・樹 `^` を分けている)
- ⚠⚠ **絵が半マスずれることがある**。港町の南橋は橋板が row 9 の下半分と row 10 の上半分に
  またがっていた(水の割合 row9 = 26.7% / row10 = 28.3%)。**面積比では決まらない** —
  決めるのは「足元をタイル中心に置く」という描画側の規則
- ⚠ 経路探索は **4 近傍**(`js/town-map.js` の `findPath`。#12 で「8 近傍」という前提が崩れた)
- 目視は `tools/probe_town_mask.js` の作法(**本番の絵 + 本番の MASK をブラウザに読ませる**)。
  ⛔ 道具の中に MASK を書き写さない(両方同じ誤りだと永久に気づけない)

---

## 6. STEP3 — `references/` 3 枚

| ファイル | 中身 |
|---|---|
| `map-brief-template.md` | codex への依頼文の雛形。`~/.codex/skills/dnd-map-maker/SKILL.md` の generation prompt template を土台に、**受け取り側の必須要件**(1 マス px 相当の等間隔格子 / 外周 1 マスは捨ててよい飾り / 文字を焼かない / 厳密な真俯瞰 / トークンを置かない)を追記。末尾に「⭐ 指標と本文が食い違ったら**閾値をいじらず数値で差し戻してほしい**」を必ず置く(#24 §2-5)。⛔ **マス数を書く欄を作らない** |
| `grid-fit-recipe.md` | `--fit` → `GRIDS` → `--name` → `--check` の 4 コマンドと、3 指標の閾値の**根拠**(`make_grid_map.py` の該当コメントを引く)。⭐ **`phlan-harbor` の 6 数値を復元するコマンドを「動作確認用の既知解」として載せる**(道具が壊れていないことを 1 コマンドで確かめられる) |
| `mask-authoring.md` | MASK の書き方 / `LEGEND` を分ける理由 / 半マスずれの実例 / findPath は 4 近傍 / `probe_*_mask.js` の作法 / ⚠ 施設は `enter`(歩いて入るタイル)と `sign`(札を浮かせるタイル)を分けて持つ |

---

## 7. 撤退スイッチ

**本チケットには撤退スイッチが要らない**(本番の実行経路を 1 バイトも変えないため)。

- スキルは呼ばなければ発動しない
- `--fit` は新しいサブコマンドで、既存の `--name` / `--all` / `--check` / `--list` の経路に入らない
- ⚠ 万一 `--fit` の追加が既存経路を壊した場合の指標は受入条件 (3a)(既存 4 件の焼き上がりが
  SHA-256 で同一)。ここが赤なら `--fit` の追加そのものを revert する

---

## 8. 受入条件 — `tools/verify_codex_map_skill.js`(新規)

ブラウザを使わない **Node だけのドライバ**でよい(本チケットは DOM を触らない)。
`child_process.execFileSync` で `py tools/make_grid_map.py ...` を回して出力を読む。

測るのは「**スキルが在ること**」ではなく「**スキルが主張していることが本当か**」。
⛔ SKILL.md の文字列一致だけで緑にしない — それは写経の検査であって、作法の検査ではない。

### §0 装置(先に母集団を確かめる)

- **(0a)** `make_grid_map.py` を実際に読んで `GRIDS` のキーが **4 件以上**在ることを確認。
  ⭐ **これが無いと以下の assert が全部空振りで永久緑になる**
- **(0b)** `SRC_DIR`(`C:\Users\PC_User\Desktop\codex1\maps`)配下に `GRIDS` の `src` が
  **全件実在**する(1 件でも欠けたら以降の測定は母集団未到達 → PENDING を出して FAIL)

### §1 `--fit` が既存台帳を復元する(⭐ 本体)

- **(1a)** `py tools/make_grid_map.py --fit harbor-town-rebuilding-player-v1.png --tile 64` の出力が
  `GRIDS["phlan-harbor"]` の `phase` / `period` / `cells` **6 値すべてと一致**する
  (period ±0.01 / phase ±0.05 / cells は完全一致)
  ⭐ **2 経路の突き合わせ**: 期待値をドライバに直書きせず、**`make_grid_map.py` から `GRIDS` を
  読み出して**比べる。片方の写経にしない
- **(1b)** 同じことを `mine-entrance`(周期 45.70)でも行う。**`--tile 64` を渡しても 45.7 へ落ちる**
  = 探索範囲が中心に張り付いていないこと
- **(1c)** `--fit` は **`assets/` に 1 ファイルも書かない**(実行前後で `assets/` の
  ファイル名 + サイズ + mtime の一覧が完全一致)

### §2 マス数が「出力」であることの明示

- **(2a)** `--fit harbor-...png --tile 64` の出力に **`1536/64 = 24` ではなく `23`** が出ている
  ⭐ この 1 本が「マス数を発注時に決めてはいけない」を機械で固定する
- **(2b)** `SKILL.md` に「マス数は測って出てくる値」という趣旨の記述が在り、かつ
  `references/map-brief-template.md` に **マス数を書かせる欄が無い**

### §3 恒等(非退行)

- **(3a)** `--fit` を足す前後で、既存 4 件を `--name` で焼き直した結果が **SHA-256 で同一**
  (⚠ HEAD 側の sha は §4 の手順で**着手前に**控えておく)
- **(3b)** `py tools/make_grid_map.py --list` の出力が HEAD と 1 文字も違わない
- **(3c)** `DEFAULT_TILE` / `TOL_DRIFT_WORLD` / `TOL_PHASE_WORLD` / `TOL_SCORE_RATIO` の
  4 定数が HEAD と同値

### §4 スキルが実際に読み込める形をしている

- **(4a)** `SKILL.md` の frontmatter に `name: codex-map-request` と `description` が在る
- **(4b)** `references/` の 3 枚が実在し、`SKILL.md` から**全部リンクされている**
  (リンク切れ 0 件 / 参照されていない孤児 0 件)

### ⛔ 測らないこと

- **SKILL.md の文面そのもの**(語り口・見出しの並び)。文章は後から良くする余地を残す
- **`--fit` の score の絶対値**。素材ごとに桁が違うので閾値化しない
  (見るのは「台帳を復元できたか」だけ)
- **codex への実投下**。ドライバは `codex_request.py` を 1 度も起動しない
  (レート制限と課金があるうえ、納品は非決定的)

### 負のコントロール(`--negative` で道具に内蔵する。赤くならなければ exit 1)

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `fitcenter` | `--fit` の探索範囲を `±6%` から `±0.5%` へ狭める | **(1b)** — 45.70px の素材が 64px 付近に張り付いて復元できない |
| `fitceil` | マス数の計算を `//`(切り捨て)から `round()` へ | **(2a)** — 23 が 24 になる = **§2-4 の罠 B の再現** ⭐ |
| `fitwrite` | `--fit` の末尾で `bake()` も呼ぶ(「ついでに焼く」親切) | **(1c)** — 読むだけのはずが `assets/` を書き換える |
| `toltweak` | `TOL_SCORE_RATIO` を 0.70 → 0.40 へ緩める | **(3c)** — 閾値の無断緩和 |
| `orphanref` | `SKILL.md` から `references/mask-authoring.md` へのリンクを 1 本消す | **(4b)** — 孤児が 1 件出る |

⭐ **§2-2 の罠(測定器が消える)を再現する変異**は `fitcenter` が担う:
「探索の中心を tile に固定してしまうと、tile と周期が違う素材で測れなくなる」は、
汎用だった `fit_grid.py` が失われた事故の**構造そのもの**である。

⚠ 変異は**配信スナップショットではなくファイルのコピーへ**注入する
(Python なので実行時注入ができない)。`<scratchpad>/mut/make_grid_map.py` を作って
そちらを回すこと。⛔ 本番ファイルを書き換えて戻す方式は採らない(中断で壊れる)。

### 既存 golden の非退行(実装後に必ず走らせる)

- `node tools/verify_quest_walk.js` → **25/25 PENDING 0**(2026-08-26 本窓で実測)
- `node tools/verify_recruit_size.js` → **82/82**(2026-08-26 本窓で実測)

⚠ 本チケットは本番ファイルを触らないので、**この 2 本が赤くなったら実装が範囲を越えている**。
⚠ 基準値は 2026-08-26 時点の記録。走らせて違ったら期待値を書き換える前に理由を突き止める。

---

## 9. 実機/実感の確認

**無し**(プレイヤーに見える変化が 1 つも無いチケット)。

代わりに **スキルの実地試験を #25 で行う**: #25 の STEP1 は本スキルを呼んで
銀の鹿亭の MAP を発注する。そこで詰まった箇所が、そのままスキルの欠陥である。
⭐ #25 の「実装結果」節に **「スキルのどこが足りなかったか」を必ず書く**こと。

---

## 10. changelog

**不要。** `scripts/hooks/check_changelog.py:24` の `GAME_LOGIC` は
`("index.html", "tavern.html", "audio.js")` で、本チケットが触るのは
`.claude/skills/**` と `tools/**` のみ。フックは鳴らない(§2-7)。

⛔ 鳴らないので `add_changelog.py` を**呼ばないこと**。プレイヤーに見える変化が無いのに
更新情報へ 1 行足すのは、CLAUDE.md が名指しで禁じている「嘘の要約」に当たる。

---

## 11. やらないこと

- ⛔ **codex への実投下**。本チケットは作法を書くだけ。発注は #25 の STEP1 で行う
- ⛔ **`GRIDS` への新規エントリ追加**。銀の鹿亭の分は #25 が足す
- ⛔ **`tools/paint_blocked_grid.py` の汎用化**(現状 `ROOM_PAINTINGS_DEF` 専用)。
  街/酒場用の作業用画像が欲しくなったら別チケット
- ⛔ **`codex1/requests/README.md` の書き換え**。あちらは codex1 側の正であり、
  こちらから MAP 固有の話を差し込むと二重管理になる。スキルの `references/` から**参照**する
- ⛔ **`~/.codex/skills/dnd-map-maker/` の編集**。codex 側の資産であり本リポジトリの管轄外
- ✅ **`実装依頼書/README.md` の #24 行は承認時(2026-08-26)に追加済み**。並走窓が無いため
  保留不要だった(#19 / #22 と同じ判断)。**実装完了後はステータスと進行度だけ更新する**。追加した行:

    | 24 | [2026-08-26_codex-map-request-skill.md](2026-08-26_codex-map-request-skill.md) | **承認済** | 0% | Codex へ MAP を発注して DF のタイル格子へ乗せる作法を `.claude/skills/codex-map-request/` へ。⚠⚠⚠ **格子を測る `fit_grid.py` は scratchpad に在ったので既に消えている**(`git ls-files` で 0 件)→ `make_grid_map.py` に `--fit` を足して復元。⭐⭐⭐ アルゴリズムは `line_response`/`comb_score` として生き残っていたので**新規発明ではなく復元**であり、`phlan-harbor` の 6 数値(33.40/7.25/63.945/64.410/23/15)を**小数点以下まで再現**できた = 受入条件 (1a) の根拠。⚠⚠ **マス数は発注する値ではなく測って出てくる値**(1536x1024 でも 24x16 ではなく **23x15**)→ 変異 `fitceil` が機械証明。changelog は鳴らない |

---

## 12. 実装結果

(実装窓が埋める)
