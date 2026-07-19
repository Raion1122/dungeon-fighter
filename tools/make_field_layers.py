"""屋外フィールド「地平線ビュー」用のレイヤー PNG を source_images/field/ から焼き込む。

背景 (なぜこのスクリプトが要るか):
  隊商護衛シナリオ (caravan-road) の路肩 (verge) は画面上で **高さ 96px の帯**。
  以前は assets/caravan_road_wall.png (1254x1254 の正方形テクスチャ) を
  ctx.createPattern(img,"repeat") で **等倍** fill していたため、

    - 源画で 150px の葉が画面でも 150px = キャラ (96px 表示) の頭より大きい
    - パターンは 1254 で剰余されるので、**見えているのは正方形絵の下端 96px
      (全体の 7.6%) だけ** = 絵として設計した構図が一切画面に出ていない

  という二重の破綻をしていた。真因はモチーフではなく **寸法**。
  解は路肩専用の **横長ストリップ 1024x96**。1152 / 96 = 12 (余り 0) かつ
  パターン原点がワールド (0,0) なので、縦の切り出し調整コードは一切不要で
  ピクセル単位に整列する。

サブコマンド:
  verge  路肩ストリップ 1024x96 (実装済み)
  hills  遠景の丘シルエット      (項目 4 で実装。現在は TODO スタブ)
  trees  中景の並木シルエット    (項目 5 で実装。現在は TODO スタブ)

使い方:
  py tools/make_field_layers.py verge
  py tools/make_field_layers.py verge --src <path> --out <path> --auto-band
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(BASE)
SRC_DIR = os.path.join(PROJ, "source_images", "field")
ASSETS = os.path.join(PROJ, "assets")

# ---- verge (路肩) の確定パラメータ -------------------------------------------
# 源画 caravan_road_verge_raw.png = 2172x724 RGB。石壁の帯は実測 y=128..515。
# 上下に約 10px の余白を足した y=118..525 (407px) を切り出す。
#   アスペクト 2172:407 = 5.336:1 ≒ 512:96 = 5.333:1  -> 均等スケールになる
#   壁 387px -> 約 91px (96px 帯にちょうど収まる)
#   石 60..130px -> 14..31px (狙いの 20..30px)
VERGE_SRC = os.path.join(SRC_DIR, "caravan_road_verge_raw.png")
VERGE_OUT = os.path.join(ASSETS, "caravan_road_verge.png")
VERGE_BAND = (118, 525)   # (y0, y1) 源画ピクセル
VERGE_HALF_W = 512        # A の幅。最終ストリップは A ++ mirror(A) = 1024
VERGE_H = 96              # 路肩帯の高さ (index.html 側の描画ワールド y=1152..1248)

MAX_BYTES = 500 * 1024


# =============================================================================
# 共通ヘルパ (hills / trees からも使う)
# =============================================================================

def detect_band(img: Image.Image, pad: int = 10, smooth: int = 9) -> tuple[int, int]:
    """行ごとの「水平方向の輝度分散」が高い連続区間を、絵の主役の帯として返す。

    石積みの壁は行内に石とモルタルの明暗が交互に来るので分散が高く、
    べたっとした草地や土の道は分散が低い。最長の高分散ランを採用する。

    項目 4/5 (hills / trees) でシルエットの上下端を自動で当てるのにも使う。
    verge では確定値 VERGE_BAND を既定にし、これは --auto-band 時のみ使う。
    """
    arr = np.asarray(img.convert("L"), dtype=np.float64)
    var = arr.var(axis=1)
    if smooth > 1:
        var = np.convolve(var, np.ones(smooth) / smooth, mode="same")

    # 単純な中点しきい値 (分散の最小と最大の中間)
    thr = (var.min() + var.max()) / 2.0
    hot = var > thr

    best = (0, 0)
    start = None
    for y, v in enumerate(hot):
        if v and start is None:
            start = y
        elif not v and start is not None:
            if y - start > best[1] - best[0]:
                best = (start, y)
            start = None
    if start is not None and len(hot) - start > best[1] - best[0]:
        best = (start, len(hot))

    y0 = max(0, best[0] - pad)
    y1 = min(img.height, best[1] + pad)
    print(f"  detect_band: raw run y={best[0]}..{best[1]} -> padded y={y0}..{y1}")
    return y0, y1


def crop_and_scale(img: Image.Image, band: tuple[int, int],
                   out_w: int, out_h: int, tol: float = 0.02) -> Image.Image:
    """band で切り出して (out_w, out_h) へ縮小する。**均等スケールを強制**する。

    縦だけ潰すリサイズは石が楕円になるので厳禁。切り出しアスペクトと出力
    アスペクトが tol 以上ズレていたら例外にして、呼び出し側に band の
    調整を促す (黙って歪ませない)。
    """
    y0, y1 = band
    crop = img.crop((0, y0, img.width, y1))
    src_ar = crop.width / crop.height
    dst_ar = out_w / out_h
    dev = abs(src_ar - dst_ar) / dst_ar
    print(f"  crop {crop.width}x{crop.height} (ar={src_ar:.4f}) -> "
          f"{out_w}x{out_h} (ar={dst_ar:.4f}), deviation={dev*100:.2f}%")
    if dev > tol:
        raise ValueError(
            f"non-uniform scale: crop aspect {src_ar:.4f} vs target {dst_ar:.4f} "
            f"({dev*100:.1f}% > {tol*100:.0f}%). band を調整してください "
            f"(縦だけ潰すと石が楕円になるため自動では続行しません)"
        )
    return crop.resize((out_w, out_h), Image.LANCZOS)


def mirror_strip(half: Image.Image) -> Image.Image:
    """half ++ 左右反転(half) で横シームレスなストリップを作る。

    この構成なら:
      - 中央の接合部は鏡像なので構造的に連続
      - 巻き戻し端も、strip 右端 = reverse(half) の最終列 = half[0] であり
        strip 左端 = half[0] なので、同一列同士が隣接して構造的に連続
    よって **クロスフェード合成は不要** (やると絵が濁るのでやってはいけない)。
    """
    w, h = half.size
    out = Image.new(half.mode, (w * 2, h))
    out.paste(half, (0, 0))
    out.paste(half.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    return out


def save_optimized(img: Image.Image, out_path: str, max_bytes: int = MAX_BYTES) -> int:
    """PNG を保存し、max_bytes を超えていたら減色して縮める。

    assets/ は既に 142MB あり GitHub Free 枠を意識した運用なので、
    レイヤー PNG は 500KB 以下に抑える。pngquant があれば優先して使い、
    無ければ Pillow の adaptive palette で段階的に減色する。
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, optimize=True)
    size = os.path.getsize(out_path)
    print(f"  saved {out_path} ({img.width}x{img.height}, mode={img.mode}) "
          f"= {size/1024:.1f} KB")
    if size <= max_bytes:
        return size

    pq = shutil.which("pngquant")
    if pq:
        print(f"  > {max_bytes/1024:.0f} KB: running pngquant")
        subprocess.run([pq, "--force", "--skip-if-larger", "--quality=65-90",
                        "--output", out_path, out_path], check=False)
        size = os.path.getsize(out_path)
        print(f"  pngquant -> {size/1024:.1f} KB")
        if size <= max_bytes:
            return size

    for colors in (256, 192, 128, 96, 64):
        quant = img.convert("RGB").quantize(colors=colors, method=Image.MEDIANCUT)
        quant.save(out_path, optimize=True)
        size = os.path.getsize(out_path)
        print(f"  quantize({colors}) -> {size/1024:.1f} KB")
        if size <= max_bytes:
            return size

    print(f"  WARNING: still {size/1024:.1f} KB > {max_bytes/1024:.0f} KB")
    return size


def report_mean_rgb(img: Image.Image) -> tuple[int, int, int]:
    """平均 RGB を実測して返す。

    index.html 側の FIELD_HAZE_RGB_DAY / DUSK (地平線際の霞の色) を、実際に
    敷く路肩の色へ追随させるために使う。現在の値は旧・生垣由来 (30,48,16)。
    """
    arr = np.asarray(img.convert("RGB"), dtype=np.float64)
    mean = tuple(int(round(v)) for v in arr.reshape(-1, 3).mean(axis=0))
    print(f"  mean RGB = {mean}")
    return mean  # type: ignore[return-value]


def tile_preview(img: Image.Image, out_path: str, times: int = 3) -> str:
    """横に times 回タイルした目視確認用画像を書き出す。

    ⚠ assets/ には置かないこと (既に 142MB)。scratchpad へ出す。
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    w, h = img.size
    out = Image.new(img.mode, (w * times, h))
    for i in range(times):
        out.paste(img, (i * w, 0))
    out.save(out_path)
    print(f"  preview -> {out_path} ({out.width}x{out.height})")
    return out_path


# =============================================================================
# サブコマンド
# =============================================================================

def cmd_verge(args: argparse.Namespace) -> int:
    print("--- verge (路肩ストリップ) ---")
    src = Image.open(args.src)
    print(f"  src {os.path.basename(args.src)}: {src.width}x{src.height} {src.mode}")

    band = detect_band(src) if args.auto_band else VERGE_BAND
    print(f"  band = {band} ({'auto' if args.auto_band else 'fixed'})")

    half = crop_and_scale(src, band, VERGE_HALF_W, VERGE_H)
    strip = mirror_strip(half)
    print(f"  strip = A ++ mirror(A) = {strip.width}x{strip.height}")

    # α は不要 (路肩は不透明で塗る帯)。RGB のまま出す。
    strip = strip.convert("RGB")
    save_optimized(strip, args.out)
    report_mean_rgb(strip)

    if args.preview:
        tile_preview(Image.open(args.out), args.preview, times=3)
    return 0


def cmd_hills(args: argparse.Namespace) -> int:
    # TODO (項目 4): 遠景の丘。単色の抜き色背景に描かせたシルエットを色キーで
    # 抜き -> 目標寸法 (幅 1536) へ均等スケール -> mirror_strip で横シームレス化。
    # 共通ヘルパ detect_band / crop_and_scale / mirror_strip / save_optimized が
    # そのまま使える。⚠ 丘を実行時の別 α レイヤにしないこと (実測 2.4->5.4ms)。
    # PNG は 2 枚に分けるが、焼き込み時に合成する。
    print("hills: TODO (項目 4 で実装)")
    return 0


def cmd_trees(args: argparse.Namespace) -> int:
    # TODO (項目 5): 中景の並木。hills と同じ流れだが幅 1024 (far=1536 / mid=1024。
    # 「両方 1024」だと継ぎ目が揃ってしまうので不採用)。
    print("trees: TODO (項目 5 で実装)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("verge", help="路肩ストリップ 1024x96 を生成")
    p.add_argument("--src", default=VERGE_SRC)
    p.add_argument("--out", default=VERGE_OUT)
    p.add_argument("--auto-band", action="store_true",
                   help="石壁の帯を行ごとの分散で自動検出する (既定は確定値 y=118..525)")
    p.add_argument("--preview", default=None,
                   help="横 3 タイルの目視確認画像の出力先 (assets/ には置かないこと)")
    p.set_defaults(func=cmd_verge)

    p = sub.add_parser("hills", help="遠景の丘シルエット (項目 4 / TODO)")
    p.set_defaults(func=cmd_hills)

    p = sub.add_parser("trees", help="中景の並木シルエット (項目 5 / TODO)")
    p.set_defaults(func=cmd_trees)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
