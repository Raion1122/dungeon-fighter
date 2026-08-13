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

  ⚠ 72px (--tiles 4) → 53px (--tiles 3) → 36px (--tiles 2) と 3 度出荷したが、いずれも
    実機の見た目で「まだ大きい」と再指摘された (2026-08-09 / 2026-08-10)。

  ⭐⭐ 4 度目 (2026-08-10) で分かった**天井**: ブロック径は
        block = 周期_src * (tiles*96 + feather) / src幅
    なので **源画像に写っている石の個数がそのまま天井**になる。初代の源 02_top_raw.png は
    1254px に石が 6.0 個しかなく、36px より下へ行く手は
      ・--tiles 1     … 周期 96px が床グリッドと一致し、全タイルが同じ柄になる
      ・feather を削る … 数 px しか動かず、しかも継ぎ目が壊れる
    しか残っていない。**縮小レバーは尽きている** → 源を「石数の多い構図」で描き直すのが正道。
    03_top_raw_v2.png (発注文 = tools/sprite_batches/mine_wall_top_v2.txt) は石を 11.3 個に
    増やしたもので、--tiles 2 --feather 16 で **18.4px** = 36.0px のちょうど半分になる。

  ⚠ feather は「大きいほど継ぎ目が綺麗」ではない。継ぎ目の質は resize 後の石の周期と
    out+feather の位相が合うかで決まるので **値ごとに実測して選ぶ**。03_top_raw_v2 での実測は
    8=NG / 12=OK / 16=OK / 20=OK / 24=NG / 28=NG / 32=OK。安全域の中央として 16 を採った。

  ⚠ 源を差し替えたら **--gamma で明るさを前作に合わせる**こと。v2 は素のままだと平均 L=107.8
    (前作 92.4) で 17% 明るく、依頼が「大きさ」だけのときに明るさまで動くと切り分けが壊れる。
    --gamma 1.18 で 93.1 に戻る。

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

from wall_round import round_blocks


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
    p.add_argument("--round", type=float, default=0.0, help="石の凸角を丸める半径(出力px)。0=無効")
    p.add_argument("--round-strength", type=float, default=1.0, help="丸めの効き (1.0=そのまま)")
    p.add_argument("--round-soften", type=int, default=1, help="丸めマスクの箱ぼかし半幅")
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
    # ★[石の角を丸める 2026-08-14] 手法は tools/wall_round.py の docstring。
    # ⚠ **wrap_feather より前**に掛ける。後ろだと本体とテールで丸めの位相が食い違い、
    #   せっかく消した継ぎ目が縦横 1 本ずつ戻る。
    res = round_blocks(res, a.round, a.round_strength, a.round_soften)
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
