#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ChatGPT が描いた「石積み壁の正面図」を、index.html の北壁矩形 (幅 96px x 高さ 192px) 用の
横シームレスなストリップへ落とすツール。アセット製造時に 1 回走らせるだけで、
ゲーム実行時には使わない。

なぜ専用の後処理が要るのか (2026-08-09 実測):
  北壁の立面は 192px の高さで描かれるが、カメラは MAP_USED (床の外接矩形) の内側しか
  映さないようクランプされている (index.html の computeCameraTarget (3b))。1 ノード = 7x6 の
  部屋では画面に入る壁の高さが

      壁が映る高さ = (usableH - 部屋の高さ 576px) / 2

  で決まり、実測で **27px (1280x800) 〜 85px (958x749)** しかない。つまり 192px のうち
  下 14〜44% だけが可視で、**上半分に何を描いても原理的に一度も見えない**。
  そのため:
    ・上 112px は闇へ落とす (Pass 1a が壁セルへ敷く純黒の天井へ自然に溶ける)
    ・下端に必ず「基礎の暗い帯 + その上のふち明かり」を焼き込む
      → 可視域が 27px しかない最悪ケースでも水平線が 1 本出て「壁」と読める
    ・コースの高さを 32px 前後まで縮める (可視 42px に横目地が 1 本入る寸法)

  ⚠ コースを大きくしてはいけない。57px などにすると可視域にブロック 1 枚の面しか入らず、
    横目地が 1 本も見えないので**また「平らな幕」に戻る**。これが 2026-08-08 の
    `壁1.png` + wallTint 実装が失敗した幾何的な理由。

  ⭐⭐ 逆に、**--course をいくら下げても効かなくなる床がある** (2026-08-10 実測)。
        H_r = max(height, src高 * course / course_src)
    の max があるので、course が小さいほど H_r は height(192) に張り付き、そこから先は
        実コース高 = course_src * 192 / src高
    で固定される。初代の源 01_face_raw.png は 1024px に 9.2 コース (course_src=111px) しか
    無いので **21.4px が床** = 24.0px から 11% しか細かくできない。
    → **源に写っているコース数がそのまま天井**。04_face_raw_v2.png
    (発注文 = tools/sprite_batches/mine_wall_face_v2.txt) は 15.5 コース (course_src=66px) に
    増やしたもので、--tiles 5 --course 12.9 で **12.9px** = 24.0px のほぼ半分になる。

  ⚠ course は「下端 (= 床線) が横目地に乗る」値を選ぶ。H_r が 192 に張り付く領域では乗らない
    ことが多い (v2 では --course 12 が `目地: False`)。ログの `crop y0=... 目地: True/False` を
    見て、**True になる最小の course** を採ること (v2 では 12.9)。

寸法の決め方:
  ・横は tiles * 96 (既定 7 タイル = 672px)。1 ノードの部屋幅とちょうど一致するので、
    通常ノードでは横方向の繰り返しが**一度も画面に出ない**。
  ・縦横で倍率を変える (anisotropic)。横は「7 タイル + 継ぎ目ぼかし」に合わせ、縦は
    「コース 32px」に合わせる。結果ブロックは横長 (約 70x32) になるが、実際の石積みも
    2:1 前後なので破綻しない。等倍に揃えるとコースが大きすぎて上の罠に落ちる。

横シームレス化:
  リサイズ幅を `tiles*96 + feather` にして余った右側 feather 列を「次の周期の頭」として使い、
  本体の左端 feather 列へクロスフェードする。これで最終画像の列 W-1 と列 0 が元画像の
  隣接列同士になり、tx 方向にどう並べても継ぎ目が出ない。
  ⚠ ミラー反転で継ぎ目を消してはいけない (左右対称が石積みのコースで露骨に見える)。
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

from wall_round import round_blocks


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def find_joint_rows(L, min_gap):
    """横目地 (モルタルの暗い line) の行番号を返す。行平均輝度の局所最小を拾う。"""
    rs = np.convolve(L.mean(axis=1), np.ones(5) / 5, mode="same")
    half = max(3, int(min_gap // 2))
    rows = []
    for y in range(3, len(rs) - 3):
        lo, hi = max(0, y - half), min(len(rs), y + half + 1)
        if rs[y] == rs[lo:hi].min() and (not rows or y - rows[-1] > min_gap * 0.6):
            rows.append(y)
    return rows


def smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def main():
    p = argparse.ArgumentParser(description="石壁の正面図 -> 北壁用 横シームレスストリップ")
    p.add_argument("--src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--tiles", type=int, default=7, help="横の周期 (タイル数)")
    p.add_argument("--tile", type=int, default=96)
    p.add_argument("--height", type=int, default=192, help="北壁矩形の高さ (index.html と一致必須)")
    p.add_argument("--feather", type=int, default=48, help="横の継ぎ目ぼかし幅")
    p.add_argument("--course", type=float, default=32.0, help="目標のコース高さ(px)")
    p.add_argument("--fade-to", type=int, default=112, help="この行より上を闇へ落とす")
    p.add_argument("--dark-top", type=float, default=0.06, help="最上部の明るさ倍率")
    p.add_argument("--plinth", type=int, default=10, help="最下部の基礎(暗い帯)の高さ")
    p.add_argument("--gamma", type=float, default=0.85, help="中間調の持ち上げ (1未満で明るく)")
    p.add_argument("--cool", type=float, default=1.05, help="青へ寄せる倍率 (寒色 = 暖色の床と分離)")
    p.add_argument("--round", type=float, default=0.0, help="石の凸角を丸める半径(出力px)。0=無効")
    p.add_argument("--round-strength", type=float, default=1.0, help="丸めの効き (1.0=そのまま)")
    p.add_argument("--round-soften", type=int, default=1, help="丸めマスクの箱ぼかし半幅")
    a = p.parse_args()

    src = Image.open(a.src).convert("RGB")
    arr = np.asarray(src).astype(np.float32)
    joints = find_joint_rows(lum(arr), min_gap=40)
    if len(joints) < 2:
        print("ERROR: 横目地を検出できない。正面図ではない可能性がある。", file=sys.stderr)
        return 3
    course_src = float(np.median(np.diff(joints)))

    W_out = a.tiles * a.tile
    W_r = W_out + a.feather
    sy = a.course / course_src
    H_r = max(a.height, int(round(src.height * sy)))
    print("src=%s course_src=%.1fpx joints=%s" % (src.size, course_src, joints))
    print("resize -> (%d,%d)  sx=%.4f sy=%.4f  course_out=%.1fpx"
          % (W_r, H_r, W_r / src.width, H_r / src.height, course_src * H_r / src.height))

    res = np.asarray(src.resize((W_r, H_r), Image.LANCZOS)).astype(np.float32)

    # 縦の切り出し位置: ストリップの下端 (= 床線) が横目地に一致する y0 を選ぶ
    jr = [int(round(j * H_r / src.height)) for j in joints]
    cands = [j - a.height for j in jr if 0 <= j - a.height <= H_r - a.height]
    y0 = max(cands) if cands else H_r - a.height
    print("crop y0=%d (下端 y=%d が目地: %s)  内側の目地(相対)=%s"
          % (y0, y0 + a.height, bool(cands), [j - y0 for j in jr if 0 < j - y0 < a.height]))
    img = res[y0:y0 + a.height, :, :].copy()

    # ★[石の角を丸める 2026-08-14] ユーザー指摘「真四角すぎるので、壁のブロックに丸みを
    #   少しだけ持たせれますか」。詳細と手法は tools/wall_round.py の docstring。
    # ⚠ **クロスフェードより前**に掛ける。後ろに回すと左端 feather 列だけ丸めが二重に
    #   掛かった絵と混ざり、横の継ぎ目に縦の筋が出る。
    # ⚠ **縦のライティングより前**に掛ける。後ろだと基礎の暗い帯 (v[lip:] *= 0.60) が
    #   「暗い = 目地」と判定され、床際の 1 コースだけ角が過剰に削れる。
    img = round_blocks(img, a.round, a.round_strength, a.round_soften)

    # 横シームレス化: 余りの feather 列を本体の左端へクロスフェード
    body = img[:, :W_out, :].copy()
    tail = img[:, W_out:W_out + a.feather, :]
    t = (np.arange(a.feather, dtype=np.float32) / (a.feather - 1))[None, :, None]
    body[:, :a.feather, :] = body[:, :a.feather, :] * t + tail * (1.0 - t)

    # 縦のライティング: 上を闇へ / 下端に基礎の帯とふち明かり
    y = np.arange(a.height, dtype=np.float32)
    v = a.dark_top + (1.0 - a.dark_top) * smoothstep(y / float(a.fade_to))
    lip = a.height - a.plinth                       # 基礎の上端 = ふち明かりの行
    v[lip:] *= 0.60                                 # 床と接する基礎は暗く沈める
    v[max(0, lip - 3):lip] *= 1.28                  # その直上に明るいふち = 水平線を必ず 1 本出す
    body *= v[:, None, None]

    # 中間調の持ち上げ + 寒色寄せ (床の暖色ブラウンと色相でも分離させる)
    body = 255.0 * np.power(np.clip(body / 255.0, 0.0, 1.0), a.gamma)
    body[..., 0] *= 0.97
    body[..., 2] *= a.cool
    body = np.clip(body, 0.0, 255.0)

    # 検証用の実測値
    Lb = lum(body)
    for band in (27, 42, 85):
        print("可視 %dpx のときの平均 L = %.1f" % (band, float(Lb[a.height - band:, :].mean())))
    seam = float(np.abs(body[:, 0, :] - body[:, W_out - 1, :]).mean())
    adj = float(np.abs(body[:, 1:, :] - body[:, :-1, :]).mean())
    print("継ぎ目の段差 %.2f / 隣接列の平均差 %.2f (段差 <= 平均差なら継ぎ目は見えない)" % (seam, adj))

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    Image.fromarray(body.astype(np.uint8), "RGB").save(a.out)
    print("saved %s (%dx%d)" % (a.out, W_out, a.height))
    return 0


if __name__ == "__main__":
    sys.exit(main())
