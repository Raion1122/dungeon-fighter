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
  verge  路肩ストリップ   1024x96  (不透明)
  hills  遠景の丘シルエット 1536x128 (α 付き。鏡像でシームレス化)
  trees  中景の並木シルエット 1024x72 (α 付き。wrap_blend でシームレス化)

⚠ 遠景 2 枚の幅は **far=1536 / mid=1024** で、揃えてはいけない。比 3:2 なので
  3072px ごとにしか継ぎ目が揃わない (画面幅 1440 の 2 倍以上) = 継ぎ目が同期して
  「同じ景色の繰り返し」に見えるのを防いでいる。

使い方:
  py tools/make_field_layers.py verge
  py tools/make_field_layers.py verge --src <path> --out <path> --auto-band
  py tools/make_field_layers.py hills --preview <scratchpad>/hills_tiled.png
  py tools/make_field_layers.py trees --preview <scratchpad>/trees_tiled.png
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

# ---- trees (中景の並木) の確定パラメータ -------------------------------------
# 幅 1024 は index.html の FIELD_MID_PERIOD、高さ 72 は FIELD_MID_H (index.html:4569)
# と**一致必須**。⚠ far=1536 / mid=1024 の比 3:2 は意図的 — 3072px ごとにしか両レイヤの
# 継ぎ目が揃わない。ここを 1536 に「揃える」と毎タイル継ぎ目が同期して
# 「同じ景色の繰り返し」に見えるので、1024 を動かさないこと。
TREES_SRC = os.path.join(SRC_DIR, "field_mid_trees_raw2.png")
TREES_OUT = os.path.join(ASSETS, "field_mid_trees.png")
TREES_W, TREES_H = 1024, 72

# 源画 raw2 (2172x724) の実測構造:
#   y=  0..~240  空 (淡い灰。ただし**雲がある** — 行内 std 6〜13)
#   y=243..~640  並木 (丸い樹冠のドームが連なる)
#   y=645..724   手前の草地 … **出力には入れない**
# 空モデルは「樹冠が 1 画素も無い行数」で当てる。243 未満で余裕を見て 215。
TREES_SKY_FIT_ROWS = 215

# ---- 横シームレス化の方式: **全幅ユニーク + 端クロスフェード (wrap_blend)** ----
# hills と違って**鏡像を使わない**。並木は濃くて輪郭が立つので、左右対称が露骨に出る
# (hills は低コントラストな霞なので鏡像が許容できた)。
# 幅 1024 に対し源画 1900 なら s≒0.55 で、稜線スパンが窓に収まるため鏡像は不要。
TREES_XFADE = 24

# 源画の横切り出し。**右端の深い谷 (x>1900 で稜線 y=324〜329) を落とすため** x1=1900。
# ⚠ ここは「稜線スパン x 縮小率」を最小化する窓を総当たりで求めた結果 (out=41.4px)。
#   全幅 2172 だと out=47、W を 1400 まで詰めると縮小率が上がって**かえって悪化**する。
#   源画を差し替えたらこの探索をやり直すこと。
TREES_SRC_X0, TREES_SRC_X1 = 0, 1900

# α のしきい。⚠ hills (9.0) よりずっと高い 24.0 なのには理由がある:
#   raw2 の空には**雲がある**。delta 10〜18 では雲の暗部を樹冠と誤認し、稜線の
#   「最上部」が空のほうへ 90px も飛ぶ (実測: dlo=14 で 172 列が探索上限に張り付いた)。
#   dlo=24 で張り付きは 0 になり、稜線 y=243..342 = 実体のある値に落ち着く。
#   **雲のある源画では delta を上げる**のが定石。下げれば良いわけではない (hills と同じ教訓)。
TREES_DELTA_LO, TREES_DELTA_HI = 24.0, 46.0

TREES_ALPHA_FLOOR = 0.15

# 色合わせの目標 = index.html:4607 の FIELD_MID_GRAD_DAY ["#47533f", "#35402f"]。
# ⚠ 丘 (完成品の実測平均 (95.9,106.4,104.1)) より**明確に暗く・緑に**寄せること。
#   ここが甘いと丘と並木の前後関係 (空気遠近) が読めず、2 速の視差だけが浮いて見える。
TREES_TOP_TARGET = (0x47, 0x53, 0x3f)   # 樹冠側 (淡い)
TREES_BOT_TARGET = (0x35, 0x40, 0x2f)   # 裾側 (濃い)
TREES_MIN_GAIN = 0.62

# 高さの窓。**min_top=19 は driver_field_step3 の C (視差相関) の前提から来る硬い制約**:
#   「丘の最小高 > 並木の最大高」で、完成した丘の最小高は 74px (実測)。
#   よって並木の最大高は 53px = 上端 y >= 19。**破ると実際に -65px で FAIL した記録がある。**
# max_top=68 は「稜線スパン 41.4px を窓 49px の中央に置く」ための上限。
# 結果は上端 y≒22..64 (樹冠高 50..8px) で、19 まで 3px 弱の余裕がある
# (リサンプルで実測 +2〜3px 乗る前例があるため、この余裕は意図的)。
TREES_MIN_TOP, TREES_MAX_TOP = 19, 68

# ---- hills (遠景の丘) の確定パラメータ ---------------------------------------
# 幅 1536 は index.html の FIELD_FAR_PERIOD (index.html:4581) と**一致必須**。
# 高さ 128 は空タイルの高さ。
HILLS_SRC = os.path.join(SRC_DIR, "field_far_hills_raw2.png")
HILLS_OUT = os.path.join(ASSETS, "field_far_hills.png")
HILLS_W, HILLS_H = 1536, 128

# 空モデルを当てる行数。源画 raw2 (1983x793) は y=0..380 が無地の曇り空 (行内 std=2〜3)、
# y=385 から地面が立ち上がる。ここを 385 以上にすると地面が「空」として学習され破綻する。
HILLS_SKY_FIT_ROWS = 375

# ---- 横シームレス化の方式: **鏡像 (A ++ 左右反転A, A=768)** ------------------
# 第 1 候補だった「全幅ユニーク + 端クロスフェード」は **高さ制約で破綻する**ため不採用。
# 理由 (raw2 での実測。ここが今回いちばんの勘所):
#   出力幅が 1536 に固定されている以上、縮小率 s = 出力幅 / 源画幅 は一意に決まり、
#   **出力の稜線スパン = 源画の稜線スパン x s も一意に決まる = 調整の自由度が無い**。
#     raw2 の稜線スパン = 62px (源画 1983 幅、delta 8〜12 でほぼ下限)
#     全幅ユニークだと s = (1536+XFADE)/1983 >= 0.7746 なので出力スパン >= 48.0px
#     一方 window は「top y が 16..66」= わずか 50px。リサンプルで実測 +2〜3px 乗る
#     (raw1 で予測 46.6 -> 実測 49 の前例) ので、**XFADE=0 でも入らない**。
#   左右を削っても改善しない: 稜線の最高 (x=1130) と最低 (x=780) が画像中央にあり、
#   端を削ると幅が減って s が上がり **かえって悪化**する (実測 L120R120 で出力 56.9px)。
#   -> 源画 1 枚ぶんを 768px に畳んで鏡像で 1536 にすると s=0.3873、出力スパン 24px。
#      窓 50px に対して余裕が生まれ、かつ継ぎ目は構造的にゼロになる。
# ⚠ 代償: 稜線が左右対称になる。低コントラストで霞んだ丘なので実用上は目立たないが、
#   **項目5 の並木 (mid) でこれを真似しないこと** — 並木は濃くて輪郭が立つので対称性が
#   露骨に出る。並木は幅 1024 で源画 1983 なら s=0.516 と余裕があるため wrap_blend で足りる。
HILLS_MIRROR = True
HILLS_HALF_W = HILLS_W // 2        # 鏡像の片側 = 768

# 鏡像の**折り返し軸をどこに置くか**。ここが対称性の見え方を決める決定的な要素。
#   mirror_strip(A) の折り返し軸は A の左端と右端の 2 本 (中央の継ぎ目 = A の右端、
#   巻き戻し端 = A の左端)。**稜線の傾きが 0 でない点で折り返すと、そこに稜線の
#   V 字 / Λ 字の折れが立って「鏡だ」と一目で分かる**。逆に傾き 0 の点 (丘の頂・谷底) で
#   折り返すと、稜線はそのまま滑らかに続いて見え、対称性がほとんど気付かれない。
#   源画の稜線を 81px 移動平均で均して |傾き| を測り、左右それぞれで 0 の点を選んだ:
#     x= 88  稜線 y=393 (丘の頂、傾き 0.000)
#     x=1880 稜線 y=421 (平坦、傾き 0.000)
#   ⚠ 素の端 (x=0, x=1982) は傾きが -0.074 / +0.086 あり、実際に巻き戻し端へ Λ 字の
#     折れが出た。**源画を差し替えたらこの 2 点を測り直すこと。**
HILLS_SRC_X0, HILLS_SRC_X1 = 88, 1880

# 帯の上端 (源画 y)。既定では auto_band_y0() が**シルエットを窓 16..66 の中央へ**
# 自動で置く (手で合わせると源画差替のたびに総当たりが要るため)。--band-y0 で上書き可。
HILLS_BAND_Y0 = None

# 全幅ユニーク方式のクロスフェード幅 (HILLS_MIRROR=False のときだけ使う)。
# 項目5 の並木はこちらを使う想定なので経路ごと残してある。
HILLS_XFADE = 64

# α のしきい (空モデルからの輝度差)。delta_lo 未満は完全透過、delta_hi 以上で不透明。
# ⚠ raw2 では delta 8〜12 が稜線スパンの下限 (62px)。6 まで下げると空のムラを拾って
#   スパンが 66px へ**広がる** (低いほど良いわけではない)。9 は下限帯の中央。
HILLS_DELTA_LO, HILLS_DELTA_HI = 9.0, 26.0

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


def measure_ridge(arr: np.ndarray, sky: np.ndarray, delta_lo: float,
                  search_top: int) -> np.ndarray:
    """列ごとの「空モデルより delta_lo 以上暗くなる最初の y」= 稜線を返す (源画座標)。

    search_top より上は無視する。空のムラや雲を稜線と誤認させないため。
    """
    L = arr.mean(axis=2)
    m = L < (sky[:, None] - delta_lo)
    m[:search_top] = False
    return np.argmax(m, axis=0)


def auto_band_y0(ridge: np.ndarray, scale: float, out_h: int,
                 min_top: int, max_top: int) -> int:
    """シルエットが窓 [min_top, max_top] の**中央**に来る帯上端 y を計算する。

    手で band_y0 を合わせると源画を差し替えるたびに総当たりが要る (raw1 では実際に
    16 通り x 3 x 3 を回した)。稜線さえ測れば一意に決まるので自動化する。
    """
    r_min, r_max = int(ridge.min()), int(ridge.max())
    span_out = (r_max - r_min) * scale
    target_top = (min_top + max_top) / 2.0 - span_out / 2.0
    y0 = int(round(r_min - target_top / scale))
    slack = (max_top - min_top) - span_out
    print(f"  auto band_y0: ridge src y={r_min}..{r_max} (span {r_max-r_min}px) "
          f"x s={scale:.4f} -> 出力 span={span_out:.1f}px, 窓 {max_top-min_top}px, "
          f"余裕={slack:.1f}px -> band_y0={y0}")
    if slack < 0:
        raise ValueError(
            f"稜線スパン {span_out:.1f}px が窓 {max_top-min_top}px に入らない。"
            f"鏡像 (--mirror) で縮小率を上げるか、より平坦な稜線の源画が要る"
        )
    return y0


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


def decontaminate_edges(img: Image.Image, opaque_thr: float = 0.95,
                        probe: int = 4, smooth: int = 15) -> Image.Image:
    """半透明の縁に残った**空の色を取り除き**、近傍の樹冠の色へ置き換える。

    なぜ必要か (ここを飛ばすと切り抜き画像の典型的な安っぽさになる):
      α を「空との輝度差」で起こす方式では、稜線の半透明画素の RGB に
      **源画の空の明るい色がそのまま残る**。空 (輝度 133) の上に置く分には
      同系色なので見えないが、**ゲーム内で並木の背後にあるのは空ではなく丘
      (輝度 ~100)** なので、そこへ重ねると縁だけが明るく浮いて光輪になる。
      実測 (修正前): 縁の合成後輝度 112.8 vs 丘 99.5 = +13.3、丘より明るい縁が
      75.8%、最大 +46.1。木の本体が 64.9 なので **縁が本体より 48 も明るい**。

    ⚠ **縁の検査を空の上でやってはいけない。** 空は汚染色とほぼ同じ明るさなので
      汚染が完全に隠れる (実際にそれで一度見落とした)。必ず実際の背景 = 丘の上で測る。

    やること: 各列で「最初に不透明 (α>=opaque_thr) になる画素」の少し下から樹冠の
    色を採り、その列の半透明画素の RGB をその色で置き換える。**α は一切触らない**ので
    シルエットの形も高さも変わらない。結果、縁は「半透明の木の色」になり、背後が
    空でも丘でも自然に沈む。

    α は build_sky_keyed_rgba の縦累積 max により**列ごとに単調非減少**なので、
    透過→不透明の遷移は各列に 1 回だけ = 列ごとに参照色 1 つで過不足なく足りる。

    ⚠ 参照色の横平滑化は **wrap (巻き戻し) で畳む**こと。端を複製で埋めると
      col0 と col1023 の参照色がずれて、せっかくの継ぎ目のなさが壊れる。
    """
    a = np.asarray(img, dtype=np.float64)
    h, w = a.shape[:2]
    al = a[..., 3] / 255.0
    op = al >= opaque_thr

    has = op.any(axis=0)
    top = np.argmax(op, axis=0)                       # 列ごとの最初の不透明行

    # 参照色 = 不透明境界の 1 行下から probe 行ぶんの平均 (境界そのものは避ける)
    ref = np.zeros((w, 3))
    for x in range(w):
        if has[x]:
            y0 = min(top[x] + 1, h - 1)
            ref[x] = a[y0:min(y0 + probe, h), x, :3].mean(axis=0)
    if not has.all():
        # 不透明画素が 1 つも無い列は最近傍の有効列から借りる (谷が極端に深い場合の保険)
        idx = np.where(has)[0]
        if idx.size == 0:
            raise ValueError("不透明な画素が 1 つも無い (α しきい値が高すぎる)")
        for x in np.where(~has)[0]:
            ref[x] = ref[idx[np.argmin(np.abs(idx - x))]]
        print(f"  decontaminate: 不透明画素の無い列 {int((~has).sum())} 件を近傍で補間")

    # 横平滑化 (wrap)。列ごとの参照色がばらつくと縁がちらつくため。
    if smooth > 1:
        pad = smooth // 2
        ext = np.concatenate([ref[-pad:], ref, ref[:pad]], axis=0)
        k = np.ones(smooth) / smooth
        ref = np.stack([np.convolve(ext[:, c], k, mode="valid") for c in range(3)],
                       axis=1)[:w]

    edge = al < opaque_thr
    out = a.copy()
    out[..., :3] = np.where(edge[..., None], ref[None, :, :], a[..., :3])
    out[..., 3] = a[..., 3]                            # α は不変

    band = edge & (al > 0.05)
    if band.any():
        before = a[..., :3][band]
        after = out[..., :3][band]
        bl = before @ [0.299, 0.587, 0.114]
        al_ = after @ [0.299, 0.587, 0.114]
        print(f"  decontaminate: 縁 {int(band.sum())}px の RGB 輝度 "
              f"{bl.mean():.1f} -> {al_.mean():.1f} (空の色を樹冠色へ置換)")
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def clamp_alpha(img: Image.Image, floor: float) -> Image.Image:
    """floor 未満の α を 0 に落とす (輪郭を確定させ、計測の曖昧さを消す)。"""
    a = np.asarray(img).copy()
    a[..., 3] = np.where(a[..., 3] < floor * 255, 0, a[..., 3])
    return Image.fromarray(a, "RGBA")


def verify_silhouette(img: Image.Image, min_top: int, max_top: int,
                      bottom_solid: int, band_var: str = "HILLS_BAND_Y0") -> None:
    """全列の「最上部の不透明画素の y」を実測し、要求窓に入っているか検査する。

    ⚠ この検査は driver_field_step3 の C (視差相関) の成立条件
      「丘の最小高 (実測 74px) > 並木の最大高 (53px)」から来ている。**破ると実際に
      -65px で FAIL した記録がある**ので、緩めたり握り潰したりしないこと。

    bottom_solid は「下端から何 px を全列不透明として要求するか」。
    ⚠ hills は 62 固定だったが、**並木は樹冠の谷が深いぶん必然的に小さくなる**ので
      層ごとに渡す (hills の 62 をそのまま並木へ当てると必ず落ちる)。
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

    bottom = a[img.height - bottom_solid:, :, 3]
    if (bottom == 0).any():
        raise ValueError(
            f"下端 {bottom_solid}px に透過画素が {int((bottom == 0).sum())} 個ある")
    print(f"  [verify] 下端 {bottom_solid}px = 全列不透明 OK")

    if lo < min_top or hi > max_top:
        raise ValueError(
            f"シルエット高さが窓外: top y min={lo} max={hi} (要求 {min_top}..{max_top})。"
            f"{band_var} を調整してください (下げるとシルエットが低くなる)"
        )
    print("  [verify] PASS")


def verify_hills(img: Image.Image, min_top: int, max_top: int) -> None:
    """hills 用の薄いラッパ (下端 62px 固定)。既存の呼び出しを壊さないため残す。"""
    verify_silhouette(img, min_top, max_top, bottom_solid=62,
                      band_var="HILLS_BAND_Y0")

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

    # 0) 横方向の切り出し。**鏡像の折り返し軸を稜線の傾き 0 の点に置く**ため
    #    (HILLS_SRC_X0/X1 のコメント参照)。ここを素の端のままにすると巻き戻し端に
    #    Λ 字の折れが立ち、対称であることが一目で分かってしまう。
    x0, x1 = args.src_x0, args.src_x1 if args.src_x1 > 0 else src.width
    arr = arr[:, x0:x1]
    print(f"  src crop x={x0}..{x1} (width {arr.shape[1]}) = 折り返し軸を稜線の平坦点へ")

    # 1) 空のモデル。行ごとの中央値を 2 次で当てる (空は上から下へ滑らかに明るくなる)。
    #    ⚠ 中央値を使うのは、雲があっても行の代表値がずれないため。
    sky = fit_sky_gradient(arr, args.sky_fit_rows)

    # 2) 帯を切る。**均等スケール**なので、源画側の帯高は中間画像の幅から一意に決まる。
    #    鏡像方式は源画 1 枚を片側 768px に畳むため縮小率が倍になり、稜線スパンが半分になる
    #    (= 高さ制約が通る唯一の道。上の HILLS_MIRROR のコメント参照)。
    inter_w = HILLS_HALF_W if args.mirror else HILLS_W + args.xfade
    src_w = arr.shape[1]
    band_h = int(round(src_w * HILLS_H / inter_w))
    scale = inter_w / src_w

    ridge = measure_ridge(arr, sky, args.delta_lo, args.sky_fit_rows)
    y0 = args.band_y0 if args.band_y0 is not None else \
        auto_band_y0(ridge, scale, HILLS_H, args.min_top, args.max_top)
    band = (y0, y0 + band_h)
    mode = f"mirror half={inter_w}" if args.mirror else f"unique+xfade{args.xfade}"
    print(f"  band = {band} (h={band_h}, {mode} -> intermediate {inter_w}x{HILLS_H}, "
          f"s={scale:.4f})")

    # 3) α を「空モデルからの暗さ」で起こす (帯の中だけ。帯の外の空のムラは無関係)。
    rgba = build_sky_keyed_rgba(arr, sky, band, args.delta_lo, args.delta_hi)

    # 4) 均等スケール。⚠ α のある画像を素の RGBA で縮小すると、稜線で
    #    「明るい空の RGB」が混ざって光る縁が出る = マゼンタ縁と同じ事故。
    #    color bleed 済み + プリマルチプライで縮小して回避する。
    #    (帯は 3) で切り出し済みなので band=(0, band_h) を渡す。アスペクト保護はここで効く)
    inter = crop_and_scale(rgba, (0, band_h), inter_w, HILLS_H)
    inter = unpremultiply(inter)

    # 5) 横シームレス化。
    if args.mirror:
        # A ++ 左右反転A。中央も巻き戻し端も構造的に連続なので**クロスフェードは不要**
        # (mirror_strip の docstring 参照。かけると絵が濁るだけ)。
        strip = mirror_strip(inter)
        print(f"  mirror {inter_w} -> {strip.width}x{strip.height} (継ぎ目は構造的にゼロ)")
    else:
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
    """中景の並木シルエット 1024x72 (α 付き) を焼く。

    流れは hills と同じ (空との輝度差で α を起こす) だが、**3 点だけ意図的に違う**:

      1. **鏡像を使わない** (wrap_blend で全幅ユニーク)。並木は濃くて輪郭が立つので
         左右対称が露骨に出る。hills の鏡像は「低コントラストな霞」だから許容できた。
      2. **delta_lo が 24.0 と高い** (hills は 9.0)。源画の空に雲があるため。
         低い delta では雲の暗部を樹冠と誤認する (TREES_DELTA_LO のコメント参照)。
      3. **源画を x=0..1900 に切る**。右端の深い谷を落とすと稜線スパンが 47->41px に縮み、
         高さの窓に余裕が生まれる。

    ⚠ 源画 raw (1 回目) は**針葉樹の尖った林冠 + 分厚い雲**で却下した。DALL-E は
      否定語をまとめて無視するので、raw2 では「丸いドーム / ブロッコリーの列」
      「のっぺりした灰色の壁のような空」と**肯定形で形を名指し**して通した。
      源画を作り直すときはこの言い回しを崩さないこと (source_images/field/_prompt_mid_trees.txt)。
    """
    print("--- trees (中景の並木シルエット) ---")
    src = Image.open(args.src).convert("RGB")
    print(f"  src {os.path.basename(args.src)}: {src.width}x{src.height} {src.mode}")

    arr = np.asarray(src, dtype=np.float64)

    # 0) 横の切り出し (深い谷を落として稜線スパンを縮める)
    x0c, x1c = args.src_x0, args.src_x1 if args.src_x1 > 0 else src.width
    arr = arr[:, x0c:x1c]
    print(f"  src crop x={x0c}..{x1c} (width {arr.shape[1]}) = 稜線スパンの最小窓")

    # 1) 空のモデル (行ごとの中央値を 2 次で当てる)
    sky = fit_sky_gradient(arr, args.sky_fit_rows)

    # 2) 帯を切る。**均等スケール**なので源画側の帯高は中間画像の幅から一意に決まる。
    inter_w = TREES_W + args.xfade
    src_w = arr.shape[1]
    band_h = int(round(src_w * TREES_H / inter_w))
    scale = inter_w / src_w

    ridge = measure_ridge(arr, sky, args.delta_lo, args.sky_fit_rows)
    y0 = args.band_y0 if args.band_y0 is not None else \
        auto_band_y0(ridge, scale, TREES_H, args.min_top, args.max_top)
    band = (y0, y0 + band_h)
    print(f"  band = {band} (h={band_h}, unique+xfade{args.xfade} -> "
          f"intermediate {inter_w}x{TREES_H}, s={scale:.4f})")

    # 3) α を「空モデルからの暗さ」で起こす (縦の累積 max で下端まで中身が詰まる)
    rgba = build_sky_keyed_rgba(arr, sky, band, args.delta_lo, args.delta_hi)

    # 4) 均等スケール (color bleed 済み + プリマルチプライのまま縮小して光る縁を防ぐ)
    inter = crop_and_scale(rgba, (0, band_h), inter_w, TREES_H)
    inter = unpremultiply(inter)

    # 5) 横シームレス化 = wrap_blend (鏡像は使わない。冒頭 docstring の 1. 参照)
    strip = wrap_blend(inter, args.xfade, TREES_W)
    print(f"  wrap-blend {inter_w} -> {strip.width}x{strip.height} (fade {args.xfade}px)")

    # 5.5) **縁の色の汚染除去**。ここを飛ばすと樹冠の輪郭に明るい光輪が立つ。
    #      色寄せ (6) の**前**に置くこと: match_vertical_gradient は「最初の不透明画素の
    #      すぐ下」を稜線側の代表色として測るので、汚染された明るい色のまま測ると
    #      ゲイン/オフセットがその分ずれる。
    if not args.no_decontaminate:
        strip = decontaminate_edges(strip, opaque_thr=args.opaque_thr)

    # 6) 色を FIELD_MID_GRAD へ寄せる (丘より暗く・緑に = 空気遠近)
    if not args.no_color_match:
        strip = match_vertical_gradient(strip, TREES_TOP_TARGET, TREES_BOT_TARGET,
                                        min_gain=args.min_gain)

    # 7) 微小 α を落として輪郭を確定させる
    strip = clamp_alpha(strip, TREES_ALPHA_FLOOR)

    save_optimized(strip, args.out)

    out = Image.open(args.out)
    # 下端の全列不透明チェックは「樹冠の最も低い列」まで = height - max_top。
    verify_silhouette(out, args.min_top, args.max_top,
                      bottom_solid=TREES_H - args.max_top,
                      band_var="TREES_BAND_Y0")

    # 丘との前後関係 (空気遠近) を数値で確認する。目視だけだと必ず見落とす。
    a = np.asarray(out.convert("RGBA"), dtype=np.float64)
    op = a[..., 3] > 127
    mean = a[..., :3][op].mean(axis=0)
    print(f"  [verify] 不透明部 平均 RGB = {mean.round(1)} "
          f"(丘 = (95.9, 106.4, 104.1))")
    print(f"  [verify] 丘との差 = {(mean - np.array([95.9, 106.4, 104.1])).round(1)} "
          f"(全チャネル負 = 並木のほうが暗い = 手前に見える)")

    if args.preview:
        tile_preview(out, args.preview, times=3)
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
                   help="源画から切り出す帯の上端 y (既定 = 窓の中央へ自動配置)")
    p.add_argument("--src-x0", type=int, default=HILLS_SRC_X0,
                   help="源画の横切り出し左端 (鏡像の折り返し軸。稜線の傾き 0 の点に置く)")
    p.add_argument("--src-x1", type=int, default=HILLS_SRC_X1,
                   help="源画の横切り出し右端 (0 = 画像の右端まで)")
    p.add_argument("--xfade", type=int, default=HILLS_XFADE,
                   help="横シームレス化のクロスフェード幅 (--no-mirror のときだけ有効)")
    p.add_argument("--mirror", action="store_true", default=HILLS_MIRROR,
                   help="鏡像 (A ++ 反転A, A=768) で継ぎ目ゼロにする。既定 ON")
    p.add_argument("--no-mirror", dest="mirror", action="store_false",
                   help="全幅ユニーク + 端クロスフェードにする (raw2 では高さ制約で破綻する)")
    p.add_argument("--sky-fit-rows", type=int, default=HILLS_SKY_FIT_ROWS,
                   help="空モデルを当てる行数 (地面が 1 画素も無い行数を渡すこと)")
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

    p = sub.add_parser("trees", help="中景の並木シルエット 1024x72 (α 付き) を生成")
    p.add_argument("--src", default=TREES_SRC)
    p.add_argument("--out", default=TREES_OUT)
    p.add_argument("--band-y0", type=int, default=None,
                   help="源画から切り出す帯の上端 y (既定 = 窓の中央へ自動配置)")
    p.add_argument("--src-x0", type=int, default=TREES_SRC_X0,
                   help="源画の横切り出し左端")
    p.add_argument("--src-x1", type=int, default=TREES_SRC_X1,
                   help="源画の横切り出し右端 (0 = 画像の右端まで。既定は深い谷を落とす 1900)")
    p.add_argument("--xfade", type=int, default=TREES_XFADE,
                   help="横シームレス化のクロスフェード幅 (並木は鏡像を使わない)")
    p.add_argument("--sky-fit-rows", type=int, default=TREES_SKY_FIT_ROWS,
                   help="空モデルを当てる行数 (樹冠が 1 画素も無い行数を渡すこと)")
    p.add_argument("--delta-lo", type=float, default=TREES_DELTA_LO,
                   help="雲のある源画なので hills より高い (下げると雲を樹冠と誤認する)")
    p.add_argument("--delta-hi", type=float, default=TREES_DELTA_HI)
    p.add_argument("--min-gain", type=float, default=TREES_MIN_GAIN)
    p.add_argument("--no-color-match", action="store_true",
                   help="FIELD_MID_GRAD への色寄せをしない (源画の色を確認したいとき)")
    p.add_argument("--no-decontaminate", action="store_true",
                   help="縁の色の汚染除去をしない (光輪が出るので比較検証のときだけ)")
    p.add_argument("--opaque-thr", type=float, default=0.95,
                   help="これ以上の α を「樹冠本体」とみなす (汚染除去の参照色の採取元)")
    p.add_argument("--min-top", type=int, default=TREES_MIN_TOP,
                   help="全列の最上部不透明画素 y の下限 (driver_field_step3 C の前提)")
    p.add_argument("--max-top", type=int, default=TREES_MAX_TOP)
    p.add_argument("--preview", default=None,
                   help="横 3 タイルの目視確認画像の出力先 (assets/ には置かないこと)")
    p.set_defaults(func=cmd_trees)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
