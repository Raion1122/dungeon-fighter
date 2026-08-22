#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/make_grid_map.py — codex1 の「グリッドが焼き込まれた」バトルマップを DF のタイル格子へ乗せ直す

★[卓上グリッド P3] 何のためにあるか
    codex1 (dnd-map-maker) が納品する MAP はマス目が**絵に焼き込まれている**。しかも
    その間隔はマップごとにバラバラで、1536px の整数分割にもなっていない
    (廃坑入口 45.70x45.59 / 廃坑 38.46x41.44)。そのまま貼ると

        絵に描かれた格子 (45.7px 周期) と DF が描く格子 (96px 周期) が別の位置に出る

    = **二重グリッド**になる。P1 で全マップにマス目を引いた直後なので、これは必ず起きる。

    そこで「焼き込み線をそのまま DF のタイル境界として使う」。やることは 3 つ:

        1. 整数マスぶんだけ切り出す  (位相を捨て、左上の線をぴったり原点に置く)
        2. 縦横で**別々の倍率**でリサンプルする (非等方 = 長方形のマスを正方形へ矯正)
        3. 焼き上がりで線位置を測り直し、TILE の倍数からのズレを検算する

    ⭐ 3 が肝。「焼いたつもり」で貼ると二重グリッドは**貼ってからでないと見えない**ので、
       画像を出した時点で数値で確かめる。--check だけで焼き直さず検算もできる。

★使い方
    py tools/make_grid_map.py --list                 台帳の一覧 (実測値と換算後のマス数)
    py tools/make_grid_map.py --name mine-entrance   台帳の実測値で焼く → assets/ へ
    py tools/make_grid_map.py --all
    py tools/make_grid_map.py --name mine-entrance --tile 48     1 マス 48px で焼く
    py tools/make_grid_map.py --check assets/map_mine-entrance.jpg --tile 48
        → 既に在るファイルの検算だけ (焼かない)

★台帳 (GRIDS) の値はどこから来たか
    scratchpad の measure_grid.py → fit_grid.py (櫛形フィルタ) で当てた実測値。
    ⚠ 単一正弦波との相関では**暗い岩盤に引きずられて候補が拮抗する**。細線強調 → 周期と
      位相の総当たり (comb fit) にして初めて安定した。さらに**木板の床の縞**をグリッドと
      誤検出するので、確認は必ず「予測線を重ねた画像を目で見る」まで行うこと。

⚠ 1 マス = **5 フィート** (D&D 標準)。1 フィートではない。廃坑 39 マスを 1ft と読むと
  39ft = 家 1 軒より小さくなる、というサニティチェックで確定した。
"""

import argparse
import os
import sys

# Windows コンソール (cp932) でも em dash や日本語を出せるよう UTF-8 化。
# ⚠ tools/add_changelog.py と同じ理由・同じ書き方。cp932 は U+2014 (—) を持たないので、
#   台帳の desc に em dash を 1 つ書いただけで **焼く前に UnicodeEncodeError で死ぬ**
#   (2026-08-19 に実際に踏んだ)。文面の側を ASCII へ寄せて回避すると同じ罠を次で踏む。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = r"C:\Users\PC_User\Desktop\codex1\maps"
OUT_DIR = os.path.join(ROOT, "assets")

DEFAULT_TILE = 96          # ★index.html の TILE_SIZE と同じ。焼き上がりはこの倍数に線が乗る


# ──────────────────────────────────────────────────────────────────────────────
# 台帳 — codex1 納品 MAP の実測値
#   ⚠ ここは「測った結果」であって設定ではない。素材を差し替えたら測り直すこと
#     (fit_grid.py を scratchpad へ戻して回す。台帳の数値を勘で動かさない)。
# ──────────────────────────────────────────────────────────────────────────────
GRIDS = {
    "mine-entrance": {
        "src": "廃坑入口.png",
        "out": "room_goblin-mine_n0",     # ★貼り先 = 廃坑グラフの起点ノード n0「坑道の入口」
        "desc": "廃坑の入口 (森の街道 + 採掘キャンプ + 坑道の口)",
        # 位相 = 左上から最初の線までの px / 周期 = 線の間隔 px
        "phase": (9.00, 3.00),
        "period": (45.700, 45.590),
        "cells": (33, 22),
        "tile": 64,
    },
    "mine": {
        "src": "廃坑.png",
        "out": "room_goblin-mine_n1",   # ★[P4] 貼り先 = 廃坑グラフの n1「見張りの詰所」
        "desc": "廃坑の坑道内部 (坑口を抜けた直後の広間 — 絵の左辺に外光と草)",
        "phase": (8.75, 36.25),
        "period": (38.460, 41.440),
        "cells": (39, 23),
        "tile": 64,
        # ⚠ 非正方 7.7%。横へ伸ばす矯正になるが、焚き火の石組みで目視して許容と判断済み
    },
    "bandit-hideout": {
        "src": "盗賊団のアジト.png",
        "out": "room_bandits-forest_n7_map",   # ★貼り先 = 森グラフのボスノード n7
        "desc": "盗賊団のアジト (森の街道 + 橋 + 丸太柵の野営地)",
        # ⚠ phase の Y は元絵の位相 16.20 に 2 行ぶん (2 x 31.140) を足した値。
        #    MAP_H=28 に載せるため元絵の上 2 行を捨てる = そのぶん位相を進める。
        "phase": (21.50, 78.48),
        "period": (30.5150, 31.1400),
        "cells": (52, 26),        # ★元絵は 52x30。上下 2 行ずつ (樹冠のみ) を捨てた
        "tile": 48,               # ⚠ 64 にしない。2.10x = 台帳が却下した水増し比率
        # 異方性 2.05% (廃坑の 7.75% よりずっと小さい) = 矯正はほぼ見えない
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# なぜ 1 マス 64px で焼くのか (TILE_SIZE=96 なのに)
#   素材の情報量は **45.7 px/マス** しかない。96px で焼くと 2.1 倍の水増しで、
#   ファイルだけ 1.80 MB へ膨らむ (既存の部屋絵は 0.35〜0.67 MB)。
#   実測した 3 案:
#       48px/マス … 1584x1056 / 0.62 MB / 1 タイル 0.87 KB  ほぼ等倍だが 1:1 で粗い
#       64px/マス … 2112x1408 / 0.97 MB / 1 タイル 1.37 KB  ← 採用
#       96px/マス … 3168x2112 / 1.80 MB / 1 タイル 2.53 KB  最も綺麗だが水増し
#   既存 jpg の密度が約 1.9 KB/タイルなので、64px は**それより軽い**まま 96px に近い見た目。
#
#   ⚠ 「NEAREST の倍率が整数でないと焼き込み線の幅が脈打つ」という仮説は**外れ**だった。
#     48/64/96 を本番と同じ NEAREST で 96px/タイルへ拡大して線幅を実測すると
#     sd = 1.05 / 1.09 / 0.98 とほぼ同じ (線幅の揺れは元絵の筆致由来で、倍率のせいではない)。
#     この仮説で解像度を決めないこと。
# ──────────────────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────────────────
# 焼き上がりの検算 — 焼き込み線が TILE の倍数に乗っているか
#   ⚠ 「実装とドライバが同じ規則を持つか」ではなく **画像そのものの性質**を測る。
#     切り出し座標を写経して突き合わせても、両方が同じ誤りだと永久に通ってしまう。
#
#   ⚠⚠ **ピーク計数で測ってはいけない** (2026-08-17 に実際に踏んだ)。初版は
#     「暗いピークを拾い、96 の倍数から ±3px 以内が 8 割か」で数えていたが、廃坑入口では
#     縦線を 43 本検出した (格子は 34 本しかない)。余分な 9 本は**右手の崖の岩肌と木立の
#     縦構造**で、これが中央値を 8.00px まで押し上げて **正しく焼けている画像を NG と報告した**。
#     櫛形フィット (周期と位相の総当たり) は「周期的に並んでいるものだけ」に反応するので、
#     周期性を持たない岩肌は score を下げこそすれ答えをずらさない。
#
#   ⭐ 出す数値は 3 つ。どれか 1 つでは足りない:
#       ① 累積ドリフト … |周期 - tile| x マス数 を**ワールド px** (TILE_SIZE 換算) で見る。
#          「マップの反対端で焼き込み線と DF の線が何 px ずれるか」= 目に見える量そのもの
#       ② 位相ズレ    … 同じくワールド px 換算。原点側のズレ
#       ③ 固定/自由の score 比 … 「TILE 固定の格子が、最良の格子とほぼ同じだけ絵を説明するか」
#          ①②が良くても③が低ければ、そもそも格子を捉えられていない (母集団が空の合図)
#
#   ⚠⚠ 判定はすべて **ワールド px** で行う (焼き上がりの px ではない)。焼き上がりの px で
#     閾値を置くと、tile を 96 → 64 と小さくしただけで相対誤差が 1.5 倍になり、
#     **同じ絵が tile を変えただけで赤くなる**。実際 64px で焼いたとき score 比が
#     85.3% と閾値ぎりぎりになり、台帳の周期を小数第 4 位まで追う誘惑が生まれた
#     (追ったら横が行き過ぎ 63.951 になり縦は 94.8% → 91.5% と悪化 = 元絵の格子が
#      そもそも完全な等間隔ではないので、小数を追うのは測定器への過学習だった)。
#   ⚠ ③ は「格子を捉えられているか」の門番であって精度の物差しではない。精度は ① が見る。
#     ③ に精度まで担わせると、上のような「閾値に合わせて素材をいじる」圧力が生まれる。
# ──────────────────────────────────────────────────────────────────────────────
def line_response(gray, axis):
    """細い暗線の強さ。axis=0 → 縦線 (列ごと), axis=1 → 横線 (行ごと)"""
    p = gray.mean(axis=0) if axis == 0 else gray.mean(axis=1)
    k = 13
    kern = np.ones(k) / k
    base = np.convolve(np.pad(p, (k // 2, k // 2), mode="edge"), kern, mode="valid")[:len(p)]
    return np.clip(base - p, 0, None)      # 周囲より暗いほど大きい


def comb_score(resp, period, phase):
    """周期 period・位相 phase の櫛が拾う平均輝度差 (大きいほど格子がそこに在る)"""
    idx = np.round(np.arange(phase, len(resp) - 0.5, period)).astype(int)
    idx = idx[(idx >= 0) & (idx < len(resp))]
    return resp[idx].mean() if len(idx) >= 5 else -1.0


# 閾値の根拠 — 勘で置かない。以下は 2026-08-17 に廃坑入口で実測して決めた値。
#
#   ★ドリフト 4.0 world-px の根拠は 3 つ:
#     ① **元絵の格子そのものが不規則**。同じ素材の縦周期を 2 通りで測ると
#        全面の細かい櫛形フィット = 45.576px / 焼き上がりから逆算 = 45.641px と
#        0.065px 食い違う。22 マス分で **1.4 world-px**。つまりこれ以下の精度を
#        要求しても、素材の側にその精度が存在しない (小数を追うのは測定器への過学習)。
#     ② **最大ドリフトはフェザー帯に落ちる**。ドリフトは切り出し原点から蓄積するので
#        最悪は右下隅だが、1 枚絵は外周 1 タイルが alpha フェザーで最も薄い場所。
#     ③ **現実の失敗は数十 px 単位**。「別のマップの周期を流用した」(45.70 vs 38.46 = 19%)
#        「マス数を読み違えた」といった実際に起きる誤りは 30〜100 world-px のズレを生む。
#        2px と 4px の間で捕まる/逃すような失敗モードは存在しない。
#   ⚠ 位相はドリフトと違い**マップ全域に一様に効く**ので、こちらは 2.0 のまま締めておく。
TOL_DRIFT_WORLD = 4.0      # マップの反対端でのズレ (ワールド px)
TOL_PHASE_WORLD = 2.0      # 原点側のズレ (ワールド px)。全域に効くので締める
TOL_SCORE_RATIO = 0.70     # 「そもそも格子を捉えているか」の門番 (精度は上の 2 本が見る)


def verify(img, tile, label=""):
    """焼き上がり画像の格子を櫛形フィットで測る。戻り値は軸ごとの dict。"""
    gray = np.asarray(img.convert("L"), dtype=np.float64)
    world = DEFAULT_TILE / tile          # 焼き上がり px → ワールド px の換算
    result = {}
    for name, axis in (("縦線", 0), ("横線", 1)):
        resp = line_response(gray, axis)
        # ① 自由フィット (周期 ±4%)。粗く当ててから周りを詰める 2 段
        #    ⚠ 1 段目を粗くしすぎると別の極大へ吸い込まれるので、刻みは周期の 0.5% まで
        def sweep(t_lo, t_hi, t_step, ph_step, seed):
            best = seed
            T = t_lo
            while T <= t_hi:
                ph = 0.0
                while ph < T:
                    s = comb_score(resp, T, ph)
                    if s > best[0]:
                        best = (s, T, ph)
                    ph += ph_step
                T += t_step
            return best
        best = sweep(tile * 0.96, tile * 1.04, tile * 0.005, 0.25, (-1.0, tile, 0.0))
        best = sweep(best[1] - tile * 0.006, best[1] + tile * 0.006, 0.005, 0.1, best)
        free_score, free_T, _ = best

        # ② TILE 固定 (= 本番で貼る条件そのもの) での最良位相
        fix_score, fix_ph = -1.0, 0.0
        ph = 0.0
        while ph < tile:
            s = comb_score(resp, tile, ph)
            if s > fix_score:
                fix_score, fix_ph = s, ph
            ph += 0.1
        dev = fix_ph if fix_ph <= tile / 2 else fix_ph - tile     # 0 からの符号つきズレ
        ratio = fix_score / free_score if free_score > 0 else 0.0

        cells = len(resp) / tile                       # この軸のマス数
        drift = abs(free_T - tile) * cells * world     # 反対端でのズレ (ワールド px)
        phase_w = abs(dev) * world
        ok = (drift <= TOL_DRIFT_WORLD and phase_w <= TOL_PHASE_WORLD
              and ratio >= TOL_SCORE_RATIO)
        result[name] = {"period": float(free_T), "phase_dev": float(dev),
                        "drift_world": float(drift), "phase_world": float(phase_w),
                        "ratio": float(ratio), "ok": ok}
        print(f"    {'OK ' if ok else 'NG '}{label}{name}: 周期 {free_T:.3f}px (目標 {tile}) → "
              f"端の累積ドリフト {drift:.2f}world-px (許容 {TOL_DRIFT_WORLD}) / "
              f"位相ズレ {phase_w:.2f}world-px (許容 {TOL_PHASE_WORLD}) / "
              f"score比 {ratio*100:.1f}% (許容 {TOL_SCORE_RATIO*100:.0f}%以上)")
    return result


# ──────────────────────────────────────────────────────────────────────────────
# 焼き直し本体
# ──────────────────────────────────────────────────────────────────────────────
def bake(spec, tile, out_dir, quality, fmt):
    src = os.path.join(SRC_DIR, spec["src"])
    if not os.path.exists(src):
        raise SystemExit(f"素材が見つかりません: {src}")
    im = Image.open(src).convert("RGB")

    (phx, phy), (perx, pery), (cols, rows) = spec["phase"], spec["period"], spec["cells"]
    left, top = phx, phy
    right, bottom = phx + perx * cols, phy + pery * rows
    if right > im.width + 0.5 or bottom > im.height + 0.5:
        raise SystemExit(f"切り出し範囲が素材 {im.size} をはみ出します: "
                         f"({left:.2f},{top:.2f})-({right:.2f},{bottom:.2f})")

    ow, oh = cols * tile, rows * tile
    # ★box= に小数を渡し、resize と切り出しを **1 回の LANCZOS** で済ませる
    #   (crop → resize の 2 段にすると整数へ丸められて位相が最大 0.5px ずれる)
    baked = im.resize((ow, oh), Image.LANCZOS, box=(left, top, right, bottom))

    sx, sy = ow / (right - left), oh / (bottom - top)
    print(f"--- {spec['out']}  ({spec['desc']})")
    print(f"    素材   = {spec['src']}  {im.width}x{im.height}")
    print(f"    切出し = ({left:.2f}, {top:.2f}) - ({right:.2f}, {bottom:.2f})"
          f"  = {right-left:.1f} x {bottom-top:.1f}px")
    print(f"    マス数 = {cols} x {rows}  (5ft/マス なら {cols*5} ft x {rows*5} ft)")
    print(f"    倍率   = 横 x{sx:.4f} / 縦 x{sy:.4f}  → 非等方の歪み {abs(sx/sy-1)*100:.2f}%")
    print(f"    焼上り = {ow} x {oh}  (1 マス {tile}px)")

    res = verify(baked, tile)

    ext = "jpg" if fmt == "jpeg" else "png"
    out = os.path.join(out_dir, f"{spec['out']}.{ext}")
    os.makedirs(out_dir, exist_ok=True)
    if fmt == "jpeg":
        baked.save(out, "JPEG", quality=quality, subsampling=0, optimize=True)
    else:
        baked.save(out, "PNG", optimize=True)
    size_mb = os.path.getsize(out) / 1024 / 1024
    print(f"    出力   = {out}  ({size_mb:.2f} MB)")

    ok = all(v["ok"] for v in res.values())
    if not ok:
        print("    ⚠ 検算 NG — 焼き込み線がタイル境界に乗っていません。台帳の実測値を測り直すこと")
    return ok


def main():
    ap = argparse.ArgumentParser(description="codex1 の焼き込みグリッド MAP を DF のタイル格子へ乗せ直す")
    ap.add_argument("--name", help=f"台帳のキー ({' / '.join(GRIDS)})")
    ap.add_argument("--all", action="store_true", help="台帳の全件を焼く")
    ap.add_argument("--list", action="store_true", help="台帳の一覧を出す")
    ap.add_argument("--check", help="既に在る画像の検算だけ行う (焼かない)")
    ap.add_argument("--tile", type=int, default=None,
                    help=f"1 マスの px (既定 = 台帳の tile / --check では {DEFAULT_TILE})")
    ap.add_argument("--out-dir", default=OUT_DIR, help="出力先 (既定 assets/)")
    ap.add_argument("--format", choices=("jpeg", "png"), default="jpeg", help="出力形式 (既定 jpeg)")
    ap.add_argument("--quality", type=int, default=82, help="JPEG 品質 (既定 82)")
    args = ap.parse_args()

    if args.list:
        for k, s in GRIDS.items():
            c, r = s["cells"]
            px, py = s["period"]
            print(f"{k:16s} {s['src']:12s} 周期 {px:.2f}x{py:.2f}px → {c}x{r} マス "
                  f"({c*5}ft x {r*5}ft) → {s['out']}.jpg @{s['tile']}px  {s['desc']}")
        return 0

    if args.check:
        tile = args.tile or DEFAULT_TILE
        path = args.check if os.path.isabs(args.check) else os.path.join(ROOT, args.check)
        im = Image.open(path).convert("RGB")
        print(f"--- 検算のみ: {path}  {im.width}x{im.height}  (1 マス {tile}px 想定)")
        if im.width % tile or im.height % tile:
            print(f"    ⚠ 寸法が {tile} の倍数ではありません "
                  f"({im.width/tile:.2f} x {im.height/tile:.2f} マス)")
        res = verify(im, tile)
        return 0 if all(v["ok"] for v in res.values()) else 1

    targets = list(GRIDS) if args.all else ([args.name] if args.name else [])
    if not targets:
        ap.error("--name / --all / --list / --check のどれかを指定してください")
    bad = 0
    for name in targets:
        if name not in GRIDS:
            raise SystemExit(f"台帳に無いキーです: {name}  (--list で一覧)")
        if not bake(GRIDS[name], args.tile or GRIDS[name]["tile"], args.out_dir,
                    args.quality, args.format):
            bad += 1
        print()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
