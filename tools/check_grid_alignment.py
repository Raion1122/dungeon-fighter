#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""焼き上がりの **タイル境界が、絵に描かれた格子線の上に在るか** を測る。

★ なぜ make_grid_map.py の --check と別に要るのか
  --check (verify) の「位相ズレ」は **格子線が 1 種類しか無い素材**を前提にしている。
  銀の鹿亭 (GRIDS["stag-tavern"]) の焼き上がりには 3 種類の暗い横線が同居する:

      24px 間隔 = 板張りの継ぎ目 / 48px 間隔 = 素材の基本格子 / 96px = DF のタイル境界

  周期 96 の櫛はこのどれにも等しく当たるので、位相 0 / 24 / 48 / 72 のスコアが並ぶ。
  実測では 縦 47.50 / 横 24.50 を返して NG になったが、**タイル境界は線の上に在った**
  (96px 刻みの線を重ねた目視で確認)。つまりこれは素材の欠陥ではなく指標の誤報。

★ ここで測るもの (⭐ 「唯一の格子か」ではなく「境界が線の上か」を問う)
  位相を 0 に固定した櫛のスコアが、全位相を掃引した最大値に対して何 % かを見る。
  タイル境界が線の上に在れば、たとえ他の位相と同点でも **最大値と並ぶ**。
  ⛔ 「位相 0 が唯一の最大」を要求しないこと。半マス線を持つ絵では原理的に成立しない。

★ 線の拾い方 (⚠ ここを素朴にやると板の継ぎ目に負ける)
  行ごとに局所暗線応答を出し、**行方向の中央値**を取る。
  格子線は全高で連続するので中央値が高く、板の継ぎ目や家具の輪郭は途切れるので消える。
  ⛔ 列平均を先に取ってから応答を出さないこと (それが make_grid_map.line_response で、
     連続性の情報が平均に溶けてしまう)。

★ 負のコントロール (⭐ 道具が生きていることを 1 コマンドで示す)
      py tools/check_grid_alignment.py assets/town_phlan.jpg  --tile 64 --shift 16   -> NG
      py tools/check_grid_alignment.py assets/tavern_map.jpg  --tile 96 --shift 24   -> NG
  2026-08-27 実測:
      phlan       素 94.1% / 83.5% (OK)   1/4 ずらし  8.0% /  8.1% (NG)
      stag-tavern 素 78.0% / 82.5% (OK)   1/4 ずらし  9.8% / 70.9% (NG)
  ⚠⚠ 上の最後の 70.9% が **この道具の限界**。銀の鹿亭の床は板の継ぎ目が 24px 間隔
     (= 1/4 タイル) で走っているので、横方向は 24px ずらしても「線の上」に見える。
     ⭐ 縦は板と直交するので格子線しか無く、9.8% まで落ちて正しく捕まえる。
     → **横だけを見て合否を決めないこと。** 判定は縦横の AND。

使い方:
    py tools/check_grid_alignment.py assets/tavern_map.jpg --tile 96
    py tools/check_grid_alignment.py assets/town_phlan.jpg --tile 64     # 既知解 (phlan)

終了コード: 0 = OK / 1 = NG / 2 = 使い方の誤り
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ★ 判定は「位相 0 が **線の上** か」であって「位相 0 が唯一の最大か」ではない。
#   ⛔ 最大値との比を見る設計にすると、半マス線を持つ絵 (stag-tavern) では
#      正しく合っていても 83% しか出ず、原理的に通らない (2026-08-27 に実測して却下)。
#   ⭐ 代わりに **全位相を掃引したスコア分布の中で、位相 0 が上位何 % か** を見る。
#      線の上なら上位に来る。隙間なら下位に沈む。同点の線が何本あっても影響しない。
# ⛔ 「上位何 %」で測るのも却下 (2026-08-27 実測)。±win px ぶんの位相が同点になるので、
#    順位は窓幅と周期の比だけで決まってしまい、既知解 phlan が上位 17% で落ちた。
# ⭐ 採るのは **スコアの下限〜上限に対する相対位置**。線の上なら上限側、隙間なら下限側。
#    実測: phlan 縦 94.1% / 横 83.5%  ・  stag-tavern 縦 78.0% / 横 82.5%
#          偽の位相 (1/4 タイルずらし) では 20% 未満まで落ちる (負のコントロール)。
TOL_PHASE_POS = 0.70
LINE_WIN = 2                # 期待位置の ±2px で線を探す (線幅と副画素配置の吸収)


def robust_line_response(gray, axis, k=13):
    """線ごとに暗線応答を出し、線方向の **中央値** を返す。

    axis=0 -> 縦線 (x の関数) / axis=1 -> 横線 (y の関数)
    """
    a = gray if axis == 0 else gray.T          # 走査は常に行方向
    pad = k // 2
    kern = np.ones(k) / k
    resp = np.empty_like(a)
    for i in range(a.shape[0]):
        row = a[i]
        base = np.convolve(np.pad(row, (pad, pad), mode="edge"), kern, mode="valid")[:len(row)]
        resp[i] = np.clip(base - row, 0, None)
    return np.median(resp, axis=0)


def comb(resp, period, phase, win=LINE_WIN):
    """周期 period・位相 phase の櫛が拾う平均。

    ⚠ 期待位置ちょうどの 1 画素だけを見ないこと。線幅は 1〜2px あり、焼き直しで
      副画素にずれるので、0.5px の差だけでスコアが 1 割動いてしまう (実測)。
      ±win px の最大値を取ると、これが消える。
    """
    n = int((len(resp) - phase) // period) + 1
    vals = []
    for k in range(n):
        c = int(round(phase + k * period))
        lo, hi = max(0, c - win), min(len(resp), c + win + 1)
        if lo < hi:
            vals.append(resp[lo:hi].max())
    return float(np.mean(vals)) if len(vals) >= 3 else -1.0


def check_axis(gray, axis, tile, name, shift=0):
    resp = robust_line_response(gray, axis)
    if shift:
        resp = resp[shift:]                     # 負のコントロール用に位相をずらす
    phases = np.arange(0.0, tile, 0.5)
    scores = np.array([comb(resp, tile, float(ph)) for ph in phases])
    s0 = comb(resp, tile, 0.0)
    lo, hi = float(scores.min()), float(scores.max())
    pos = (s0 - lo) / (hi - lo) if hi > lo else 0.0
    ok = pos >= TOL_PHASE_POS
    print("    %s %s: 位相 0 の相対位置 %.1f%% (許容 %.0f%% 以上)  "
          "score %.2f  [隙間 %.2f 〜 線 %.2f]"
          % ("OK " if ok else "NG ", name, pos * 100, TOL_PHASE_POS * 100, s0, lo, hi))
    return ok


def main():
    ap = argparse.ArgumentParser(
        description="焼き上がりのタイル境界が、絵に描かれた格子線の上に在るかを測る")
    ap.add_argument("image", help="焼き上がりの画像 (assets/*.jpg)")
    ap.add_argument("--tile", type=int, required=True, help="1 マスの px (焼いたときの値)")
    ap.add_argument("--inset", type=int, default=None,
                    help="外周から除く px (既定 = tile 1 枚分)。⭐ 外周の壁には格子が描かれていない")
    ap.add_argument("--shift", type=int, default=0,
                    help="⭐ 負のコントロール: 測る前に位相を N px ずらす。"
                         "正しく焼けた画像なら tile/4 で必ず NG になる (道具が生きている証拠)")
    args = ap.parse_args()

    path = args.image if os.path.isabs(args.image) else os.path.join(ROOT, args.image)
    if not os.path.exists(path):
        print("画像が見つかりません: %s" % path)
        return 2
    im = Image.open(path).convert("L")
    gray = np.asarray(im, dtype=np.float64)
    inset = args.inset if args.inset is not None else args.tile
    print("--- 格子の位置合わせ: %s  %dx%d  (1 マス %dpx / 外周 %dpx を除く)"
          % (path, im.width, im.height, args.tile, inset))
    if im.width % args.tile or im.height % args.tile:
        print("    ⚠ 寸法が %d の倍数ではありません" % args.tile)

    # ⚠ 外周の壁には格子が描かれていないので、そのぶんだけ内側で測る。
    #   inset は tile の倍数にしておくこと (位相 0 が保存される)。
    inset = (inset // args.tile) * args.tile
    band = gray[inset:gray.shape[0] - inset, inset:gray.shape[1] - inset]
    if band.size == 0 or min(band.shape) < args.tile * 3:
        print("    ⚠ 測れる領域が狭すぎます (--inset を小さくしてください)")
        return 2

    okv = check_axis(band, 0, args.tile, "縦線", args.shift)
    okh = check_axis(band, 1, args.tile, "横線", args.shift)
    if okv and okh:
        print("    ⭐ タイル境界は描かれた格子線の上に在ります")
        return 0
    print("    ⚠ タイル境界が線から外れています。台帳の phase を測り直してください")
    return 1


if __name__ == "__main__":
    sys.exit(main())
