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

# ---- hills (遠景の丘) の確定パラメータ ---------------------------------------
# 幅 1536 は index.html の FIELD_FAR_PERIOD (index.html:4581) と**一致必須**。
# 高さ 128 は空タイルの高さ。
HILLS_SRC = os.path.join(SRC_DIR, "field_far_hills_raw.png")
HILLS_OUT = os.path.join(ASSETS, "field_far_hills.png")
HILLS_W, HILLS_H = 1536, 128

# 空モデルを当てる行数。源画 y=0..420 は雲を含むが丘は 1 画素も無い (実測: 丘の
# 立ち上がりは y=424)。ここを 437 以上にすると丘が「空」として学習され破綻する。
HILLS_SKY_FIT_ROWS = 421

# 帯の上端 (源画 y)。⚠ **この 3 定数 (BAND_Y0 / XFADE / DELTA_LO) は独立に決められない。**
#   出力側の要求は「全列の最上部不透明画素 y が 16..66」= わずか 50px の窓しかなく、
#   稜線の実測スパンがほぼそれを埋めてしまうため。効き方:
#     - 縮小率 s = (1536+XFADE)/2172 が稜線スパンを直接決める (出力スパン = 源スパン x s)。
#       **XFADE を広げるほど s が上がり、スパンが窓を食い潰す**。96 では span=49/50 で
#       max=67 となり実際に FAIL した。64 に落として span=44 まで下げてある。
#     - DELTA_LO を下げると遠くの淡い丘が早く拾われて稜線の谷が浅くなり、スパンが縮む
#       (実測 delta 10 -> 62px / 8 -> 60px / 6 -> 58px。いずれも y>=400 に限った値)。
#     - BAND_Y0 は窓の中で上下に平行移動させるだけ。
#   採用値は 3 定数の総当たり (16 通り x 3 x 3) で **上下の余裕が最大 (どちらも 3px)** に
#   なる組み合わせ。実測 min=19 / max=63。
#   ⚠ 源画を差し替えたら必ずこの総当たりからやり直すこと。1 つだけ動かしても入らない。
HILLS_BAND_Y0 = 399

# 横クロスフェード幅。全幅ユニークな絵を活かすため鏡像 (mirror_strip) は使わない。
# ⚠ 上記の通り**広げるほど稜線スパンが窓を食い潰す**ので、シームの綺麗さと高さ制約の
#   トレードオフになっている。64px は低コントラストな霞んだ丘なら継ぎ目が見えない幅。
HILLS_XFADE = 64

# α のしきい (空モデルからの輝度差)。delta_lo 未満は完全透過、delta_hi 以上で不透明。
# ⚠ delta_lo=6 は画像全体で見ると**雲**を丘として拾う値 (実測: y=35 に誤検出)。
#   ここで安全なのは帯が y>=399 に限られているからで、その範囲の空は行内 std=1.2 と
#   極めて均一 (6 = 5 sigma 相当)。**帯を上へ広げるならこの値も上げ直すこと。**
HILLS_DELTA_LO, HILLS_DELTA_HI = 6.0, 26.0

# これ未満の α は 0 に落とす。中途半端な α が散ると「最上部の不透明画素」の計測が
# 曖昧になり、driver_field_step3 の視差相関 C の前提 (丘の最小高 > 並木の最大高 53px)
# を数値で保証できなくなる。
HILLS_ALPHA_FLOOR = 0.15

# 色合わせの目標 = index.html:4606 の FIELD_FAR_GRAD_DAY ["#6c7674", "#55605e"]。
# ⚠ 源画の丘は空 (輝度 212) を前提に描かれていて輝度 190->133 と**明るすぎる**。
#   ゲームの空は地平線際が #928976 (146,137,118) なので、そのまま貼ると
#   「丘が空より明るく光る」= 空気遠近が逆転する。必ず寄せること。
HILLS_TOP_TARGET = (0x6c, 0x76, 0x74)   # 稜線側 (淡い)
HILLS_BOT_TARGET = (0x55, 0x60, 0x5e)   # 裾側 (濃い)
# 2 点合わせだけだとゲインが 0.40 まで落ちて絵が潰れるので、下限を設けて
# painterly な厚塗りの陰影を残す (下限を割ったぶんは平均で合わせ直す)。
HILLS_MIN_GAIN = 0.62


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

    # ⚠ α のある画像 (hills / trees のシルエット層) を convert("RGB") してから減色すると
    #   **透過が黙って消えて不透明な板になる**。RGBA は FASTOCTREE で減色すること
    #   (MEDIANCUT は RGBA 非対応)。
    has_alpha = img.mode == "RGBA"
    for colors in (256, 192, 128, 96, 64):
        if has_alpha:
            quant = img.quantize(colors=colors, method=Image.FASTOCTREE)
        else:
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
# hills / trees 用ヘルパ (空との輝度差で α を起こす系)
# =============================================================================

def fit_sky_gradient(arr: np.ndarray, fit_rows: int, deg: int = 2) -> np.ndarray:
    """空の輝度 L(y) を多項式で当てて、全行ぶんに外挿して返す。

    空は「上から下へ滑らかに明るくなる」縦グラデなので、単一のしきい値では抜けない
    (上端で通る値は下端で空まで拾う)。行ごとの基準線を持つのが正しい。

    ⚠ 行の代表値には**中央値**を使う。平均だと雲や画面端の暗部に引きずられる。
    ⚠ fit_rows には「丘が 1 画素も無い行数」を渡すこと。丘を含めて当てると
      基準線が丘側へ引き下がり、稜線が抜けなくなる。
    """
    L = arr.mean(axis=2)
    ys = np.arange(fit_rows)
    coef = np.polyfit(ys, np.median(L[:fit_rows], axis=1), deg)
    sky = np.polyval(coef, np.arange(L.shape[0]))
    print(f"  sky model (deg={deg}, fit rows 0..{fit_rows}): "
          f"L(0)={sky[0]:.1f} L({fit_rows})={sky[fit_rows]:.1f} L(-1)={sky[-1]:.1f}")
    return sky


def build_sky_keyed_rgba(arr: np.ndarray, sky: np.ndarray, band: tuple[int, int],
                         d_lo: float, d_hi: float) -> Image.Image:
    """帯を切り出し、「空モデルよりどれだけ暗いか」で α を作った RGBA を返す。

    返す画像は **RGB がプリマルチプライ済み** (縮小で明るい空が滲み出さないように)。

    2 つの仕掛けが入っている:
      - **縦の累積 max**: α を下向きに単調非減少にする。丘の内側に明るい面 (陽の当たる
        斜面) があっても穴が空かず、かつ帯の下端が必ず不透明になる。シルエット層は
        「稜線から下は全部中身」が正しいので、これが素直な表現。
      - **color bleed**: 透過部の RGB を、その列で最初に不透明になる画素の色で塗る。
        これをやらないと、縮小時に稜線で明るい空の RGB が混ざって光る縁が出る
        (マゼンタ抜きでピンクの縁が残るのと同じ事故)。
    """
    y0, y1 = band
    rgb = arr[y0:y1].copy()
    L = rgb.mean(axis=2)
    d = sky[y0:y1, None] - L                       # 空より暗いほど大きい
    a = np.clip((d - d_lo) / (d_hi - d_lo), 0.0, 1.0)
    a = np.maximum.accumulate(a, axis=0)           # 下向きに単調非減少 = 穴を塞ぐ

    # color bleed: 列ごとに「最初に α>0 になった画素の色」を、その上の透過部へ流す。
    opaque = a > 0.0
    first = np.where(opaque.any(axis=0), np.argmax(opaque, axis=0), 0)
    ridge_rgb = rgb[first, np.arange(rgb.shape[1])]          # (W,3)
    bleed = ~opaque[..., None]
    rgb = np.where(bleed, ridge_rgb[None, :, :], rgb)

    pm = np.concatenate([rgb * a[..., None], a[..., None] * 255.0], axis=2)
    print(f"  alpha: delta {d_lo}..{d_hi} -> opaque px {(a >= 1.0).mean()*100:.1f}%, "
          f"transparent {(a <= 0.0).mean()*100:.1f}%")
    return Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA")


def unpremultiply(img: Image.Image) -> Image.Image:
    """プリマルチプライ RGBA を通常の RGBA へ戻す。"""
    a = np.asarray(img, dtype=np.float64)
    al = a[..., 3:4] / 255.0
    rgb = np.divide(a[..., :3], np.where(al > 0, al, 1.0))
    out = np.concatenate([rgb, a[..., 3:4]], axis=2)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def wrap_blend(img: Image.Image, fade: int, out_w: int) -> Image.Image:
    """幅 out_w+fade の絵を、左右が繋がる幅 out_w のストリップへ畳む。

    採用理由: 源画が 2172px と十分広く **全幅をユニークな絵で埋められる**ため。
    mirror_strip (A ++ 反転A) は継ぎ目が構造的にゼロだが、**稜線が左右対称になるのは
    目で分かる** — 石テクスチャと違ってシルエットは対称性が露骨に出る。

    仕組み: out_w 以降の tail は「out_w 番目以降に続くはずの絵」なので、
    先頭 fade 画素をその tail から始めて元の絵へ渡す。こうすると
    F[0] = I[out_w] が I[out_w-1] = F[out_w-1] の真の続きになり、巻き戻し端が繋がる。

    ⚠ α と RGB を別々に混ぜると縁が濁るので、**プリマルチプライして混ぜる**。
    """
    a = np.asarray(img, dtype=np.float64)
    al = a[..., 3:4] / 255.0
    pm = np.concatenate([a[..., :3] * al, a[..., 3:4]], axis=2)

    head, tail = pm[:, :out_w].copy(), pm[:, out_w:out_w + fade]
    w = np.linspace(1.0, 0.0, fade)[None, :, None]      # x=0 で tail 100% -> x=fade で 0%
    head[:, :fade] = tail * w + head[:, :fade] * (1.0 - w)

    out = Image.fromarray(np.clip(head, 0, 255).astype(np.uint8), "RGBA")
    return unpremultiply(out)


def match_vertical_gradient(img: Image.Image, top_rgb: tuple[int, int, int],
                            bot_rgb: tuple[int, int, int], min_gain: float,
                            probe: int = 8) -> Image.Image:
    """不透明部の縦グラデが top_rgb -> bot_rgb になるよう、チャネルごとに線形補正する。

    out = gain * in + offset の 1 次式なので、**厚塗りの局所的な陰影 (painterly さ) は
    そのまま残る**。トーンカーブを掛けたり単色で塗り潰したりしないこと。

    ⚠ 2 点をそのまま合わせるとゲインが 0.40 まで落ち、絵が霧のように平坦になる。
      min_gain で下限を切り、下限に当たったチャネルは**平均が目標の中点に来るよう
      offset だけで合わせ直す** (コントラストを守りつつ色域は目標へ寄せる)。
    """
    a = np.asarray(img, dtype=np.float64)
    op = a[..., 3] > 127                              # 不透明部だけで測る
    h = a.shape[0]

    # 稜線直下の probe 行 (列ごとに最初の不透明画素から) と、最下部 probe 行を代表色にする
    top_src = np.zeros(3)
    idx = np.argmax(op, axis=0)
    cols = np.where(op.any(axis=0))[0]
    samples = [a[min(idx[x] + k, h - 1), x, :3] for x in cols for k in range(probe)]
    top_src = np.mean(samples, axis=0)
    bot_src = a[h - probe:, :, :3].reshape(-1, 3).mean(axis=0)
    print(f"  color: src top={top_src.round(1)} bot={bot_src.round(1)}")

    out = a.copy()
    for c in range(3):
        span = top_src[c] - bot_src[c]
        gain = (top_rgb[c] - bot_rgb[c]) / span if abs(span) > 1e-6 else 1.0
        if gain < min_gain:                            # 潰れすぎ -> ゲインを守り平均で合わせる
            gain = min_gain
            mid_src = (top_src[c] + bot_src[c]) / 2.0
            mid_dst = (top_rgb[c] + bot_rgb[c]) / 2.0
            offset = mid_dst - gain * mid_src
        else:
            offset = top_rgb[c] - gain * top_src[c]
        out[..., c] = a[..., c] * gain + offset
        print(f"    ch{c}: gain={gain:.3f} offset={offset:+.1f}")

    out = np.clip(out, 0, 255)
    out[..., 3] = a[..., 3]
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def clamp_alpha(img: Image.Image, floor: float) -> Image.Image:
    """floor 未満の α を 0 に落とす (輪郭を確定させ、計測の曖昧さを消す)。"""
    a = np.asarray(img).copy()
    a[..., 3] = np.where(a[..., 3] < floor * 255, 0, a[..., 3])
    return Image.fromarray(a, "RGBA")


def verify_hills(img: Image.Image, min_top: int, max_top: int) -> None:
    """全列の「最上部の不透明画素の y」を実測し、要求窓に入っているか検査する。

    ⚠ この検査は driver_field_step3 の C (視差相関) の成立条件
      「丘の最小高 > 並木の最大高 (53px)」から来ている。**破ると実際に -65px で FAIL した
      記録がある**ので、緩めたり握り潰したりしないこと。
    """
    a = np.asarray(img)
    op = a[..., 3] > 0
    if not op.any(axis=0).all():
        raise ValueError(f"完全に透明な列がある: {(~op.any(axis=0)).sum()} 列")
    tops = np.argmax(op, axis=0)
    lo, hi = int(tops.min()), int(tops.max())
    print(f"  [verify] silhouette top y: min={lo} max={hi} mean={tops.mean():.1f} "
          f"(required {min_top}..{max_top})")
    print(f"  [verify] => 下端からの高さ {img.height - hi}..{img.height - lo}px "
          f"(要求 {img.height - max_top}..{img.height - min_top}px)")

    # 下端 62px が全列不透明であること (並木より必ず高い = 視差相関の前提)
    bottom = a[img.height - 62:, :, 3]
    if (bottom == 0).any():
        raise ValueError(f"下端 62px に透過画素が {int((bottom == 0).sum())} 個ある")
    print("  [verify] 下端 62px = 全列不透明 OK")

    if lo < min_top or hi > max_top:
        raise ValueError(
            f"シルエット高さが窓外: top y min={lo} max={hi} (要求 {min_top}..{max_top})。"
            f"HILLS_BAND_Y0 を調整してください (下げると丘が低くなる)"
        )
    print("  [verify] PASS")

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
    """遠景の丘シルエット 1536x128 (α 付き) を焼く。

    ⚠ **マゼンタの色キーは使っていない。** 承認済みプロンプトは #FF00FF のクロマキー背景を
      指示しているが、DALL-E はこれを完全に無視して「空を描いた普通の風景画」を返してきた
      (よくある失敗モード)。ただし返ってきた絵自体は狙い通りの painterly / 低コントラスト /
      灰緑だったため、**再生成せず「空との輝度差」で α を起こす方式に切り替えた**。
      これは色キーより安全でもある — 画像のどこにもマゼンタが入らないので、
      「地平線際にピンクの縁が残る」フリンジ事故が原理的に起こり得ない。

    源画 field_far_hills_raw.png = 2172x724 RGB の実測構造:
      y=  0..~435  空 (行内 std < 3 の滑らかなグラデ。輝度は 195 -> 213 で地平線へ向け明るくなる)
      y=437..~648  丘 (std が 7 -> 16 へ跳ね上がる)
      y=650..724   手前の平坦な地面 (std < 1) … **出力には入れない**
    """
    print("--- hills (遠景の丘シルエット) ---")
    src = Image.open(args.src).convert("RGB")
    print(f"  src {os.path.basename(args.src)}: {src.width}x{src.height} {src.mode}")

    arr = np.asarray(src, dtype=np.float64)

    # 1) 空のモデル。行ごとの中央値を 2 次で当てる (空は上から下へ滑らかに明るくなる)。
    #    ⚠ 中央値を使うのは、雲があっても行の代表値がずれないため。
    sky = fit_sky_gradient(arr, HILLS_SKY_FIT_ROWS)

    # 2) 帯を切る。出力 1536x128 に横クロスフェード分 N を足した (1536+N)x128 へ
    #    **均等スケール**するので、源画側の帯高は width*128/(1536+N) で一意に決まる。
    inter_w = HILLS_W + args.xfade
    band_h = int(round(src.width * HILLS_H / inter_w))
    band = (args.band_y0, args.band_y0 + band_h)
    print(f"  band = {band} (h={band_h}, xfade={args.xfade} -> intermediate {inter_w}x{HILLS_H})")

    # 3) α を「空モデルからの暗さ」で起こす (帯の中だけ。帯の上の雲は無関係)。
    rgba = build_sky_keyed_rgba(arr, sky, band, args.delta_lo, args.delta_hi)

    # 4) 均等スケール。⚠ α のある画像を素の RGBA で縮小すると、稜線で
    #    「明るい空の RGB」が混ざって光る縁が出る = マゼンタ縁と同じ事故。
    #    color bleed 済み + プリマルチプライで縮小して回避する。
    #    (帯は 3) で切り出し済みなので band=(0, band_h) を渡す。アスペクト保護はここで効く)
    inter = crop_and_scale(rgba, (0, band_h), inter_w, HILLS_H)
    inter = unpremultiply(inter)

    # 5) 横シームレス化。**全幅ユニーク + 端のクロスフェード**を採る (鏡像は使わない)。
    strip = wrap_blend(inter, args.xfade, HILLS_W)
    print(f"  wrap-blend {inter_w} -> {strip.width}x{strip.height} (fade {args.xfade}px)")

    # 6) 色を FIELD_FAR_GRAD へ寄せる (空気遠近)。
    if not args.no_color_match:
        strip = match_vertical_gradient(strip, HILLS_TOP_TARGET, HILLS_BOT_TARGET,
                                        min_gain=args.min_gain)

    # 7) 微小 α を落として輪郭を確定させる (中途半端な α が残ると計測が曖昧になる)
    strip = clamp_alpha(strip, HILLS_ALPHA_FLOOR)

    save_optimized(strip, args.out)
    verify_hills(Image.open(args.out), args.min_top, args.max_top)

    if args.preview:
        tile_preview(Image.open(args.out), args.preview, times=3)
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

    p = sub.add_parser("hills", help="遠景の丘シルエット 1536x128 (α 付き) を生成")
    p.add_argument("--src", default=HILLS_SRC)
    p.add_argument("--out", default=HILLS_OUT)
    p.add_argument("--band-y0", type=int, default=HILLS_BAND_Y0,
                   help="源画から切り出す帯の上端 y (可動域は 398..403 と狭い)")
    p.add_argument("--xfade", type=int, default=HILLS_XFADE,
                   help="横シームレス化のクロスフェード幅")
    p.add_argument("--delta-lo", type=float, default=HILLS_DELTA_LO)
    p.add_argument("--delta-hi", type=float, default=HILLS_DELTA_HI)
    p.add_argument("--min-gain", type=float, default=HILLS_MIN_GAIN)
    p.add_argument("--no-color-match", action="store_true",
                   help="FIELD_FAR_GRAD への色寄せをしない (源画の色を確認したいとき)")
    p.add_argument("--min-top", type=int, default=16,
                   help="全列の最上部不透明画素 y の下限 (driver_field_step3 C の前提)")
    p.add_argument("--max-top", type=int, default=66)
    p.add_argument("--preview", default=None,
                   help="横 3 タイルの目視確認画像の出力先 (assets/ には置かないこと)")
    p.set_defaults(func=cmd_hills)

    p = sub.add_parser("trees", help="中景の並木シルエット (項目 5 / TODO)")
    p.set_defaults(func=cmd_trees)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
