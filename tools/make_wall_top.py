#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ChatGPT が描いた「真上から見た石壁の天面」を、部屋を囲むリング (南/東/西/角) 用の
正方形シームレスタイルへ落とすツール。アセット製造時に 1 回走らせるだけ。

make_wall_face.py との違い (共有できない理由):
  ・あちらは立面ストリップ。縦横で倍率が違い、縦のライティングを焼き込み、横だけシームレス。
  ・こちらは見下ろしタイル。等方縮小で、縦横ともシームレス化し、ライティングは焼き込まない
    (リングは renderLighting のフォグと接地影が明暗を作るので、素材に方向光を入れると二重になる)。

なぜ縮小するのか (2026-08-09 実測):
  生成物は 1254x1254 で、天面ブロックの周期は行 231px / 列 187px。これを等倍で敷くと
  1 ブロックが 2〜2.4 タイル (192〜231px) になり、**キャラ 1 人 (体高 57px) より大きい岩**が
  並ぶ。屋外の床で 2026-07-30 に踏んだのと同じ失敗 (「地面の葉っぱが大きすぎる」の真犯人が
  等倍敷きだった) なので、ブロック 53px 前後 = 半タイルまで落とす。

  ⚠ 1 度目は 72px (--tiles 4) で出荷したが、実機の見た目で「石の画像の縮尺が大きく感じる」と
    再指摘された (2026-08-09)。72px = 3/4 タイルは**キャラの肩幅とほぼ同じ**で、見下ろしの
    石積みとしてはまだ岩が大きい。53px (--tiles 3 --feather 32) にすると「壁の厚み 1 タイルに
    石が 2 個弱」= 積んだ石として読める寸法になる。⚠ これ以上落とす (--tiles 2 = 36px) と
    反復周期が 2 タイル = 192px しかなくなり、南側 2 タイル幅のリングで繰り返しが目に付く。

  ⚠ **--block は「目標値の表示」だけで、実際に効くのは --tiles と --feather**。
    出力寸法は tiles*96 に固定 (driver_wall_face の (1c) が「正方形 かつ tile の整数倍」を
    要求する) ので、ブロック径は
        block = 周期209 * (tiles*96 + feather) / 1254
    でしか動かせない。狙いの径から tiles を逆算して渡すこと。
  ⚠⚠ **縮小は Pillow 側で行い、小さい PNG を出荷すること。** JS 側でオフスクリーン canvas へ
    縮小してから createPattern すると、renderMap に 7.5 秒級の周期スパイクが出る
    (index.html の wallTex1.onload の ⚠⚠⚠ に実測値。p50 は無傷なので目視では見つからない)。

シームレス化:
  生成物は「edges must wrap perfectly」と指示しても実際には**継ぎ目がある**
  (実測: x の段差 11.06 に対し隣接列の平均差 7.15 = 1.5倍 / y は 8.83 対 7.36)。
  そこで縦横それぞれ、リサイズ幅を `out + feather` にして余りを「次の周期の頭」として使い、
  本体の先頭 feather 行/列へクロスフェードする。これで最終画像の端と端が元画像の隣接
  行/列同士になり、repeat でどう並べても継ぎ目が出ない。
  ⚠ ミラー反転は使わない (左右上下対称が石の並びで露骨に見える)。
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def block_period(sig):
    """行(列)平均輝度の自己相関から、目地の繰り返し周期を返す。"""
    s = sig - sig.mean()
    ac = np.correlate(s, s, "full")[len(s) - 1:]
    ac = ac / ac[0]
    for i in range(20, len(ac) // 2):
        if ac[i] == ac[max(0, i - 15):i + 16].max() and ac[i] > 0.1:
            return i
    return None


def wrap_feather(a, out, feather, axis):
    """a の軸 axis を out まで詰め、端が繋がるようクロスフェードする。"""
    a = np.moveaxis(a, axis, 0)
    body = a[:out].copy()
    tail = a[out:out + feather]
    t = (np.arange(feather, dtype=np.float32) / (feather - 1))[:, None, None]
    body[:feather] = body[:feather] * t + tail * (1.0 - t)
    return np.moveaxis(body, 0, axis)


def main():
    p = argparse.ArgumentParser(description="石壁の天面 -> リング用 正方形シームレスタイル")
    p.add_argument("--src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--tiles", type=int, default=4, help="1 周期のタイル数 (出力は tiles*96 の正方形)")
    p.add_argument("--tile", type=int, default=96)
    p.add_argument("--feather", type=int, default=48, help="継ぎ目ぼかし幅")
    p.add_argument("--block", type=float, default=72.0, help="目標のブロック径(px)")
    p.add_argument("--gamma", type=float, default=1.0)
    a = p.parse_args()

    src = Image.open(a.src).convert("RGB")
    arr = np.asarray(src).astype(np.float32)
    L = lum(arr)
    pr, pc = block_period(L.mean(axis=1)), block_period(L.mean(axis=0))
    periods = [v for v in (pr, pc) if v]
    if not periods:
        print("ERROR: ブロックの周期を検出できない。天面のタイル絵ではない可能性がある。", file=sys.stderr)
        return 3
    period_src = float(np.mean(periods))

    W_out = a.tiles * a.tile
    W_r = W_out + a.feather
    print("src=%s mean L=%.1f  周期(行/列)=%s/%s -> 平均 %.1fpx"
          % (src.size, float(L.mean()), pr, pc, period_src))
    print("resize -> (%d,%d) s=%.4f  ブロック径 %.1fpx (目標 %.0f)"
          % (W_r, W_r, W_r / src.width, period_src * W_r / src.width, a.block))

    res = np.asarray(src.resize((W_r, W_r), Image.LANCZOS)).astype(np.float32)
    body = wrap_feather(res, W_out, a.feather, axis=1)     # 横
    body = wrap_feather(body, W_out, a.feather, axis=0)    # 縦
    if a.gamma != 1.0:
        body = 255.0 * np.power(np.clip(body / 255.0, 0.0, 1.0), a.gamma)
    body = np.clip(body, 0.0, 255.0)

    Lb = lum(body)
    print("出力 mean L=%.1f (床 47.2 の %.2f 倍)" % (float(Lb.mean()), float(Lb.mean()) / 47.2))
    for name, ax in (("x", 1), ("y", 0)):
        m = np.moveaxis(body, ax, 0)
        seam = float(np.abs(m[0] - m[-1]).mean())
        adj = float(np.abs(m[1:] - m[:-1]).mean())
        print("継ぎ目 %s の段差 %.2f / 隣接の平均差 %.2f (段差 <= 平均差なら見えない)" % (name, seam, adj))

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    Image.fromarray(body.astype(np.uint8), "RGB").save(a.out)
    print("saved %s (%dx%d)" % (a.out, W_out, W_out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
