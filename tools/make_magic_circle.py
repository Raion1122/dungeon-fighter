#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_magic_circle.py — 詠唱マジックサークル (術者の足元) のスプライトシートを焼く
════════════════════════════════════════════════════════════════════════════════
源: codex1/assets/magic-circle/arcane-circle-cast-6/arcane-circle-cast-frame-NN.png
    768x724 の 6 枚 (01=淡い霧 → 04=最も明るい完成形 → 06=消え際)。

出力: assets/magic_circle_anim.png  (6 コマ横ストリップ / 既定 1920x200)

■ なぜ「そのまま縮小」ではないのか
  源は 768x724 のうち上 54% が完全な透明 (最上端の画素でも y=393)。そのまま縮めると
  ・実効解像度が半分以下になる (円が小さく潰れる)
  ・「楕円の中心 = 足元に置きたい点」がフレーム内のどこかを JS 側が知らないと置けない
  の 2 つが同時に起きる。よって **全 6 コマの内容を包む箱へ寄せてから**縮小し、
  楕円中心がフレーム内の固定比 (x=0.5 / y=UP/(UP+DOWN)) に来るよう切り出す。

■ 楕円中心の決め方 (源画素での実測 / --report で再測できる)
  完成コマ (03/04) の alpha bbox 中心 = (367, 556)。01 の霧や 05 の火の粉は円の外へ
  はみ出すので**中心の推定には使わない**が、切り出し箱には必ず含める (下の検査)。

  ⚠ 箱を「内容の外接矩形ぴったり」にしてはいけない。05 のみ火の粉が上へ伸びるため、
    外接矩形に寄せると**コマごとに楕円中心の位置が変わる** = 足元で円が上下に跳ねる。
    だから箱は「中心を固定した左右対称の箱」で、内容を包めるかは事後に検査する。

使い方:
    py tools/make_magic_circle.py                # 既定値で焼く
    py tools/make_magic_circle.py --report       # 焼かずに源の実測値だけ出す
    py tools/make_magic_circle.py --scale 0.5    # 出力倍率 (既定 0.5 → 320x200/コマ)
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow が必要です: py -m pip install Pillow")
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC_DIR = os.path.join(os.path.dirname(ROOT), "codex1", "assets", "magic-circle",
                       "arcane-circle-cast-6")
OUT = os.path.join(ROOT, "assets", "magic_circle_anim.png")

FRAMES = 6
# 源での楕円中心 (完成コマ 03/04 の alpha bbox 中心の実測値)
CENTER_X, CENTER_Y = 367, 556
# 中心から見た切り出し箱 (源画素)。左右対称・上下は非対称 (火の粉は上へ伸びる)
HALF_W = 320          # → 幅 640
UP, DOWN = 256, 144   # → 高さ 400、楕円中心はフレーム上から 256/400 = 0.64
ALPHA_EPS = 8         # これ以下の alpha は「内容なし」とみなす (源の裾は極薄)


def frame_path(i):
    return os.path.join(SRC_DIR, "arcane-circle-cast-frame-%02d.png" % (i + 1))


def load_frames():
    ims = []
    for i in range(FRAMES):
        p = frame_path(i)
        if not os.path.exists(p):
            print("源が見つかりません: " + p)
            sys.exit(3)
        ims.append(Image.open(p).convert("RGBA"))
    return ims


def content_bbox(im):
    """alpha > ALPHA_EPS の外接矩形。完全透明なら None。"""
    mask = im.split()[3].point(lambda v: 255 if v > ALPHA_EPS else 0)
    return mask.getbbox()


def report(ims):
    print("源: " + SRC_DIR)
    xs0, ys0, xs1, ys1 = [], [], [], []
    for i, im in enumerate(ims):
        bb = content_bbox(im)
        xs0.append(bb[0]); ys0.append(bb[1]); xs1.append(bb[2]); ys1.append(bb[3])
        cx = (bb[0] + bb[2]) / 2.0
        cy = (bb[1] + bb[3]) / 2.0
        print("  コマ%d  size=%s bbox=%s  bbox中心=(%.1f, %.1f)" % (i + 1, im.size, bb, cx, cy))
    print("  全コマの和集合 bbox = (%d, %d, %d, %d)" % (min(xs0), min(ys0), max(xs1), max(ys1)))
    print("  採用する楕円中心   = (%d, %d)   ← 完成コマ 03/04 の bbox 中心" % (CENTER_X, CENTER_Y))
    box = (CENTER_X - HALF_W, CENTER_Y - UP, CENTER_X + HALF_W, CENTER_Y + DOWN)
    print("  切り出し箱         = %s  (%dx%d)" % (box, box[2] - box[0], box[3] - box[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=0.5, help="出力倍率 (既定 0.5)")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--report", action="store_true", help="焼かずに実測値だけ出す")
    a = ap.parse_args()

    ims = load_frames()
    if a.report:
        report(ims)
        return

    box = (CENTER_X - HALF_W, CENTER_Y - UP, CENTER_X + HALF_W, CENTER_Y + DOWN)

    # ⚠ 「箱が全コマの内容を包んでいるか」は焼く前に必ず検査する。源を差し替えた時、
    #   はみ出しは**切り口が直線になって初めて気づく**ような静かな壊れ方をする。
    for i, im in enumerate(ims):
        bb = content_bbox(im)
        if not (bb[0] >= box[0] and bb[1] >= box[1] and bb[2] <= box[2] and bb[3] <= box[3]):
            print("コマ%d の内容 %s が切り出し箱 %s からはみ出します。HALF_W/UP/DOWN を広げてください。"
                  % (i + 1, bb, box))
            sys.exit(4)

    fw = int(round((box[2] - box[0]) * a.scale))
    fh = int(round((box[3] - box[1]) * a.scale))
    sheet = Image.new("RGBA", (fw * FRAMES, fh), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        f = im.crop(box).resize((fw, fh), Image.LANCZOS)
        sheet.paste(f, (i * fw, 0))
    sheet.save(a.out)

    anchor_fy = UP / float(UP + DOWN)
    print("焼きました: %s" % a.out)
    print("  コマ  : %dx%d  x %d 枚  (シート %dx%d)" % (fw, fh, FRAMES, sheet.size[0], sheet.size[1]))
    print("  楕円中心のフレーム内比 : x=0.500  y=%.3f   ← JS の MAGIC_CIRCLE.anchorFY と一致させる" % anchor_fy)
    ring = content_bbox(ims[2])   # コマ03 = 火の粉を伴わない素の輪
    print("  輪の幅 / フレーム幅    : %.3f   ← 見かけの直径はこの比だけ小さい"
          % ((ring[2] - ring[0]) / float(box[2] - box[0])))
    print("  ファイルサイズ         : %.1f KB" % (os.path.getsize(a.out) / 1024.0))


if __name__ == "__main__":
    main()
