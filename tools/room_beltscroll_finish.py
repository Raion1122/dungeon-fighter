# -*- coding: utf-8 -*-
"""ベルトスクロール版の部屋 1 枚絵: raw PNG -> 出荷用 JPEG に仕上げる。

ChatGPT が返す raw は「壁の根元 (= 奥の壁と床の境目)」が仕様の 12% より必ず低い位置
(= 壁が厚い) に出る。実測: 廃坑 22.9% / 盗賊の森 28.1%。壁帯が 2 タイル (192px) を超えると
キャラクターが壁に埋まるので、**上端をクロップして根元を 12% へ持ち上げる**のがこの工程。

  t = (b - target) / (1 - target) * H     (b = 現在の根元比, target = 0.12)

クロップで失われるのは壁の頂部だが、そこは描画時に feather (75px) で天井の黒へ溶ける
領域なので実害はない。クロップ後は tileBounds と同じ 5:4 へリサイズして JPEG 化する
(ローダーがオフスクリーンへ焼き直すので元画像の α は使われない = JPEG で問題ない)。

使い方:
    py tools/room_beltscroll_finish.py \
       --raw source_images/room_beltscroll/room_bandits-forest_1_raw.png \
       --out assets/room_bandits-forest_1_bs.jpg
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageStat


def _row_luminance(im, c0=0.30, c1=0.70):
    """中央 40% の列だけを使った行平均輝度。左右端の小物に引きずられないため。"""
    g = im.convert("L")
    W, H = g.size
    px = g.load()
    x0, x1 = int(W * c0), int(W * c1)
    return [sum(px[x, y] for x in range(x0, x1)) / (x1 - x0) for y in range(H)]


def wall_base_ratio(im, search_hi=0.55, k=8):
    """壁の根元 (行平均輝度が最も急に立ち上がる行) を画像高に対する比で返す。

    painterly な軟らかい遷移なので 1 行差分ではなく前後 k 行の平均差で見る。
    探索は上から search_hi までに限る (手前の焚火などを根元と誤認しないため)。
    """
    rows = _row_luminance(im)
    H = len(rows)
    best, best_y = -1e9, 0
    for y in range(k, int(H * search_hi) - k):
        d = sum(rows[y + 1:y + 1 + k]) / k - sum(rows[y - k:y]) / k
        if d > best:
            best, best_y = d, y
    return best_y / H, best_y


def edge_center(im):
    """全体平均 / 中央 60% 平均。1 未満 = 縁が中央より暗い (奥行きが出ている)。

    ⚠ 絶対値の合格線は引けない。**同じシナリオの旧画像との相対**で見ること。
    """
    W, H = im.size
    g = im.convert("L")
    c = ImageStat.Stat(g.crop((int(W * .2), int(H * .2), int(W * .8), int(H * .8)))).mean[0]
    return ImageStat.Stat(g).mean[0] / c if c else 0.0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", required=True, type=Path, help="ChatGPT が返した raw PNG")
    ap.add_argument("--out", required=True, type=Path, help="出荷用 JPEG の出力先")
    ap.add_argument("--target", type=float, default=0.12,
                    help="壁の根元を置く高さ比 (既定 0.12 = テンプレの立面 12%%)")
    ap.add_argument("--crop-top", type=int, default=None,
                    help="上端クロップ量を px で直接指定し --target の推定を上書きする。"
                         "⚠ ここの推定器と検証ドライバ (driver_room_beltscroll.js の B2) は "
                         "別のエッジを掴むことがある (森は raw 推定 12%% でもドライバ実測 160px)。"
                         "最終的な正はドライバの paintWallBaseY=192±20 なので、外れたら "
                         "t = (y_raw - 0.125*H) / 0.875 を解いてここへ渡し、raw から作り直す")
    ap.add_argument("--size", default="1500x1200", help="出力サイズ (既定 1500x1200 = 5:4)")
    ap.add_argument("--quality", type=int, default=88, help="JPEG 品質 (既定 88)")
    ap.add_argument("--dry-run", action="store_true", help="計測だけして書き込まない")
    a = ap.parse_args(argv)

    if not a.raw.is_file():
        print("ERROR: raw not found: %s" % a.raw, file=sys.stderr)
        return 2
    ow, oh = (int(v) for v in a.size.lower().split("x"))

    im = Image.open(a.raw).convert("RGB")
    W, H = im.size
    b, y = wall_base_ratio(im)
    print("raw        : %s  %dx%d" % (a.raw, W, H))
    print("  wall_base: y=%d = %.1f%%   edge/center=%.3f" % (y, b * 100, edge_center(im)))

    top = 0
    if a.crop_top is not None:
        top = max(0, min(H - 1, a.crop_top))
        print("  crop top : %dpx  (--crop-top で明示指定 = ドライバ実測に合わせた値)" % top)
    elif b > a.target:
        top = int(round((b - a.target) / (1 - a.target) * H))
        print("  crop top : %dpx  (壁の頂部が落ちるが feather で黒へ溶ける領域)" % top)
    else:
        print("  crop top : 0px  (根元が既に目標以下 = 床が増えるだけなので触らない)")

    cropped = im.crop((0, top, W, H))
    out_im = cropped.resize((ow, oh), Image.LANCZOS)

    b2, y2 = wall_base_ratio(out_im)
    print("out        : %s  %dx%d" % (a.out, ow, oh))
    print("  wall_base: y=%d = %.1f%%   edge/center=%.3f" % (y2, b2 * 100, edge_center(out_im)))
    if abs(b2 - a.target) > 0.03:
        print("  WARN: 目標 %.0f%% から %.1fpt ずれている。絵を目視で確認すること。"
              % (a.target * 100, abs(b2 - a.target) * 100))

    if a.dry_run:
        print("  (dry-run: 書き込みなし)")
        return 0

    a.out.parent.mkdir(parents=True, exist_ok=True)
    out_im.save(a.out, "JPEG", quality=a.quality, subsampling=0, optimize=True)
    print("  saved    : %d KB" % (a.out.stat().st_size // 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
