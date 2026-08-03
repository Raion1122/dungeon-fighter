"""「つながる水路」6 ピースのスプライトシート assets/water_kit.png を焼き込む。

背景 (なぜ手続き生成なのか):
  接続タイルは「芯 (水路の中心線) がセル辺の中点をきっかり通る」ことが絶対条件。
  画像生成 AI は **原理的にこれを満たせない** (1px 単位の幾何を指示できない・
  生成のたびに違う絵が出る = 非決定論)。水は「勾配 + 流れの筋 + 岸のにじみ」で
  構成できるので、手続き生成と相性が良い。何度走らせてもバイト単位で同じ PNG が出る。

  ⚠ 絵の出来はユーザーが実機で見て判断する。気に入らなければ下のパラメータ
    (WATER_HALF / EDGE_HALF / COL_* / STREAKS / WOBBLE_MAX) を直して再生成するだけ。

⭐ なぜ「マス正方形」のセルなのか (make_rail_kit.py と同じ設計):
  本編の情景描画は scale = displayMax / max(fr.w, fr.h) で **フレーム矩形の中心を
  タイル中心に合わせる**。1 ピース = 512 角の正方セルとして宣言し displayMax=96
  (= TILE_SIZE) を与えると 1 マスちょうどを占め、隣り合ったピースの境界は必ず一致する。

⭐⭐ 断面を「芯からの距離の絶対値 |d| だけの関数」にしてある (ミラー対称・これは仕様):
  6 ピースは「入口 → 出口」の向きを内側に持つが、敷いたときに隣のピースの向きが
  逆になる組み合わせが必ず存在する (例: 横(東西) は東→西だが、その東隣に来る
  北→東 は東へ**出て**いく)。つまり「流れの左岸・右岸」を全ピースで一貫させるのは
  **原理的に不可能**。断面を左右非対称にすると、そういう継ぎ目だけ岸が段差になる。
  → 断面を |d| の関数にすれば **24 辺すべての継ぎ目が厳密に一致**する。
     代償は水面の模様が左右対称になること。表示倍率 96/512 = 0.1875 では
     水面の幅が 30px しかないので、対称性は目で追えない (実測で確認済み)。

⭐⭐ 沿線方向のノイズは周期 512 (= 1 セル) で **完全にループ**させてある:
  各ピースは「つながる辺で s=0」「もう一方の辺で s=512」になるよう作ってあるので、
  ノイズが周期 512 なら s の値は継ぎ目をまたいで必ず連続する。ピースの向きが
  逆でも noise(0) == noise(512) なので段差は出ない。

ピース構成 (シート上の並び順 = variant index。⛔ 順番は保存値なので絶対に変えない):
    0 縦    (北+南)      … 断面をそのまま縦に押し出す
    1 横    (東+西)      … 0 を 90° 時計回り
    2 北→東 (北+東)      … 北東角を中心とする半径 256 の四分円へ逆写像
    3 東→南 (東+南)      … 2 を 90° 時計回り
    4 南→西 (南+西)      … 2 を 180°
    5 西→北 (西+北)      … 2 を 270° 時計回り (= 90° 反時計回り)
  T 字・十字・終端は作らない (railKit と同じ決定)。

使い方:
    py tools/make_water_kit.py
    py tools/make_water_kit.py --out assets/water_kit.png
    py tools/make_water_kit.py --check-only     # 書き込まず 24 辺の被覆表だけ出す
"""
from __future__ import annotations

import argparse
import hashlib
import math
import os
import random
import sys

import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(BASE)

OUT_PNG = os.path.join(PROJ, "assets", "water_kit.png")

# ── 出力の幾何 ────────────────────────────────────────────────────────────
CELL = 512                    # 1 マス = 512px 角 (railKit と同一)
RADIUS = CELL / 2.0           # カーブの半径。角から見て辺の中点までの距離
NPIECE = 6
CORE_X = CELL / 2.0           # 芯 = セル辺の中点 (縦セルなら x=256 の縦線)
S = 1.0                       # 素材空間 = セル空間 (等倍。railKit の S に相当)

# ── 断面プロファイル (d = 芯からの距離 px) ────────────────────────────────
#    0 .. WATER_HALF          水面   (α=255。中央ほど暗く深い)
#    WATER_HALF .. EDGE_HALF  浅瀬 → 濡れた岸へのグラデ (α 1→0)
#    EDGE_HALF ..             完全透明
#    ⚠ ここを動かすと --check-only の期待表 (中点 ±水面幅/2) も一緒に動く。
WATER_HALF = 80.0
EDGE_HALF = 110.0
WOBBLE_MAX = 8.0              # 岸の輪郭のゆらぎ (定規で引いた直線にしないため)

PX_CM = 2.982                 # 物差し: キャラ体高 57px = 1.70m → 1px ≒ 2.98cm
TILE_PX = 96                  # 本編/エディタのタイル (= displayMax)

# ── 色 (沼/坑道の水。既存アセットのトーンに寄せた暗めの青緑) ─────────────
COL_DEEP = (24.0, 48.0, 58.0)       # 深部
COL_MID = (38.0, 78.0, 86.0)        # 中間
COL_SHALLOW = (70.0, 110.0, 105.0)  # 浅瀬
COL_BANK = (58.0, 52.0, 40.0)       # 岸の泥
COL_STREAK = (132.0, 176.0, 170.0)  # 流れの筋 (水面より明るい)

# ── 流れの筋。(芯からの基準距離, 強さ, にじみ幅) ──────────────────────────
#    |d| の関数なので芯の左右に対を成して出る (上のミラー対称の説明を参照)。
STREAKS = ((13.0, 0.58, 3.2), (31.0, 0.49, 3.8), (50.0, 0.40, 4.4), (67.0, 0.31, 5.0))

SEED = 20260804               # 決定論の要。ここを変えると絵が丸ごと変わる

PIECE_NAMES = ["縦(北南)", "横(東西)", "北→東", "東→南", "南→西", "西→北"]
# 各ピースがインクを持つべき辺。検算 (--check-only) の期待値。
PIECE_EDGES = [("N", "S"), ("E", "W"), ("N", "E"), ("E", "S"), ("S", "W"), ("W", "N")]
OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}

# ── 検算のしきい値 ────────────────────────────────────────────────────────
OPAQUE = 250                  # 「不透明」とみなす α
PROBE = 70.0                  # 中点 ±PROBE に不透明画素があること
                              #   = 水面幅/2 (80) からゆらぎ (8) と余裕 (2) を引いた値
CENTER_TOL = 2.0              # 不透明帯の中心が辺の中点からずれてよい量 (px)
SEAM_TOL = 24                 # 継ぎ目をまたいだ RGBA (前乗算) の最大差


# ══ ノイズ (すべて random.Random(SEED) 由来 = 決定論) ═════════════════════
def _lattice1(rng: random.Random, n: int) -> np.ndarray:
    return np.array([rng.random() for _ in range(n)], dtype=np.float64)


def _lattice2(rng: random.Random, ny: int, nx: int) -> np.ndarray:
    return np.array([[rng.random() for _ in range(nx)] for _ in range(ny)],
                    dtype=np.float64)


def _smooth(t: np.ndarray) -> np.ndarray:
    """smoothstep。格子ノイズの補間に使うと格子の筋が出にくい。"""
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _noise1(rng: random.Random, s: np.ndarray, cells: int) -> np.ndarray:
    """沿線方向 s (0..CELL) の 1 次元 value noise。**周期 CELL でループする**。"""
    lat = _lattice1(rng, cells)
    t = s / CELL * cells
    i0 = np.floor(t)
    f = _smooth(t - i0)
    i0i = np.mod(i0.astype(np.int64), cells)
    i1i = np.mod(i0i + 1, cells)
    return lat[i0i] * (1.0 - f) + lat[i1i] * f


def _noise2(rng: random.Random, s: np.ndarray, u: np.ndarray,
            cells_s: int, cells_u: int) -> np.ndarray:
    """(沿線 s, 横断 |d|) の格子 value noise。s 方向は周期 CELL でループ。"""
    lat = _lattice2(rng, cells_s, cells_u + 2)
    ty = s / CELL * cells_s
    tx = u / (CELL / 2.0) * cells_u
    y0 = np.floor(ty)
    x0 = np.floor(tx)
    fy = _smooth(ty - y0)
    fx = _smooth(tx - x0)
    y0i = np.mod(y0.astype(np.int64), cells_s)
    y1i = np.mod(y0i + 1, cells_s)
    x0i = np.clip(x0.astype(np.int64), 0, cells_u)
    x1i = np.clip(x0i + 1, 0, cells_u + 1)
    top = lat[y0i, x0i] * (1.0 - fx) + lat[y0i, x1i] * fx
    bot = lat[y1i, x0i] * (1.0 - fx) + lat[y1i, x1i] * fx
    return top * (1.0 - fy) + bot * fy


def _lerp3(c0, c1, t: np.ndarray) -> np.ndarray:
    a = np.asarray(c0, dtype=np.float64)
    b = np.asarray(c1, dtype=np.float64)
    return a[None, None, :] + (b - a)[None, None, :] * t[:, :, None]


# ══ 断面素材 (= まっすぐな水路 1 タイルぶん) の生成 ═══════════════════════
def build_source() -> np.ndarray:
    """(CELL, CELL, 4) float64 RGBA。列 x が横断方向、行 y が沿線方向。

    列 x の画素中心は素材座標 x+0.5、芯は素材座標 CORE_X(=256.0) なので
    d(x) = x + 0.5 - 256.0 = x - 255.5。列 x と列 511-x の d は符号だけが逆
    ＝ **列の並びは芯について厳密にミラー対称**になる (_verify_source が確認)。
    """
    rng = random.Random(SEED)
    yy, xx = np.mgrid[0:CELL, 0:CELL]
    s = yy + 0.5
    d = (xx + 0.5) - CORE_X
    u = np.abs(d)

    # 岸の輪郭のゆらぎ。低周波 + 高周波の 2 枚。周期 CELL なので継ぎ目で連続する。
    wob = (WOBBLE_MAX * 0.72) * (2.0 * _noise1(rng, s, 5) - 1.0) \
        + (WOBBLE_MAX * 0.33) * (2.0 * _noise1(rng, s, 13) - 1.0)
    wob = np.clip(wob, -WOBBLE_MAX, WOBBLE_MAX)
    w1 = WATER_HALF + wob          # 水面の外縁
    w2 = EDGE_HALF + wob           # 岸の外縁 (ここで α=0)

    # 水面の濃淡 (3 オクターブ)。0..1 に正規化。
    n = (0.55 * _noise2(rng, s, u, 8, 5)
         + 0.30 * _noise2(rng, s, u, 17, 9)
         + 0.15 * _noise2(rng, s, u, 33, 17))

    # 流れに沿った細い明るい筋。芯からの距離を s に沿って蛇行させ、強さも揺らす。
    streak = np.zeros_like(u)
    for k, (off, amp, sig) in enumerate(STREAKS):
        wander = 7.0 * (2.0 * _noise1(rng, s, 7 + 3 * k) - 1.0)
        env = np.clip((_noise1(rng, s, 4 + 2 * k) - 0.22) / 0.55, 0.0, 1.0)
        streak += amp * env * np.exp(-(((u - (off + wander)) / sig) ** 2))
    q = np.clip(u / w1, 0.0, 1.0)                 # 0=芯 1=水面の外縁
    streak = np.clip(streak, 0.0, 1.0) * (1.0 - q ** 4)   # 岸際では筋を消す

    # 水面の色: 深部 → 中間 → 浅瀬。中央ほど暗く深い。
    water = _lerp3(COL_DEEP, COL_MID, _smooth(q / 0.55))
    water = water + (np.asarray(COL_SHALLOW, dtype=np.float64) - water) \
        * _smooth((q - 0.55) / 0.45)[:, :, None]
    water *= (1.0 + 0.20 * (n - 0.5))[:, :, None]
    water = water + (np.asarray(COL_STREAK, dtype=np.float64) - water) \
        * (0.85 * streak)[:, :, None]

    # 岸: 浅瀬 → 泥。α は 1 → 0。
    p = np.clip((u - w1) / (w2 - w1), 0.0, 1.0)
    bank = _lerp3(COL_SHALLOW, COL_BANK, _smooth(p))
    bank *= (1.0 + 0.18 * (n - 0.5))[:, :, None]

    in_water = (u <= w1)[:, :, None]
    rgb = np.where(in_water, water, bank)
    alpha = np.where(u <= w1, 255.0, 255.0 * (1.0 - _smooth(p)))
    alpha = np.where(u <= w2, alpha, 0.0)
    rgb = np.where((alpha > 0.0)[:, :, None], rgb, 0.0)

    out = np.empty((CELL, CELL, 4), dtype=np.float64)
    out[:, :, :3] = np.clip(rgb, 0.0, 255.0)
    out[:, :, 3] = np.clip(alpha, 0.0, 255.0)
    return out


def _verify_source(src: np.ndarray) -> None:
    """素材が「芯についてミラー対称」「芯が不透明」であることの裏取り。

    ⚠ ここが崩れると継ぎ目に段差が出る (上の設計メモを参照)。黙って崩れないよう
       生成のたびに実測する。
    """
    if not np.array_equal(src, src[:, ::-1, :]):
        bad = float(np.max(np.abs(src - src[:, ::-1, :])))
        raise SystemExit(f"[make_water_kit] 断面が芯についてミラー対称でない (最大差 {bad})")
    core = src[:, CELL // 2 - 1:CELL // 2 + 1, 3]
    if float(core.min()) < 255.0:
        raise SystemExit(f"[make_water_kit] 芯が不透明でない (最小 α {core.min()})")
    far = src[:, 0, 3]
    if float(far.max()) != 0.0:
        raise SystemExit(f"[make_water_kit] セル西端に水が残っている (最大 α {far.max()})")


# ══ サンプラ ═════════════════════════════════════════════════════════════
def _bilinear_premul(src: np.ndarray, sx: np.ndarray, sy: np.ndarray,
                     valid: np.ndarray) -> np.ndarray:
    """src を (sx, sy) で bilinear サンプルして uint8 RGBA を返す。

    ⚠ **アルファを前乗算してから補間する**。しないと透明画素の RGB (0) が混ざり、
       輪郭に暗いフリンジが出る。
    ⚠ 座標はピクセル**中心**基準 (整数座標 n の中心は n+0.5) なので 0.5 を引く。
    ⭐ y (沿線方向) は **wrap** する。素材のノイズが周期 CELL なので、端の行は
       反対側の行へつながるのが正しい (clamp だと最終行だけ模様が寝る)。
    """
    h, w = src.shape[0], src.shape[1]
    a = src[:, :, 3:4] / 255.0
    prem = np.concatenate([src[:, :, :3] * a, src[:, :, 3:4]], axis=2)

    u = sx - 0.5
    v = sy - 0.5
    x0 = np.floor(u)
    y0 = np.floor(v)
    fx = (u - x0)[:, :, None]
    fy = (v - y0)[:, :, None]
    x0i = np.clip(x0.astype(np.int64), 0, w - 1)
    x1i = np.clip(x0i + 1, 0, w - 1)
    y0i = np.mod(y0.astype(np.int64), h)
    y1i = np.mod(y0i + 1, h)

    p00 = prem[y0i, x0i]
    p10 = prem[y0i, x1i]
    p01 = prem[y1i, x0i]
    p11 = prem[y1i, x1i]
    top = p00 * (1.0 - fx) + p10 * fx
    bot = p01 * (1.0 - fx) + p11 * fx
    out = top * (1.0 - fy) + bot * fy

    out[~valid] = 0.0
    oa = out[:, :, 3]
    scale = np.where(oa > 0.5, 255.0 / np.maximum(oa, 1e-9), 0.0)[:, :, None]
    rgb = np.clip(out[:, :, :3] * scale, 0.0, 255.0)
    res = np.empty((sx.shape[0], sx.shape[1], 4), dtype=np.uint8)
    res[:, :, :3] = np.rint(rgb).astype(np.uint8)
    res[:, :, 3] = np.rint(np.clip(oa, 0.0, 255.0)).astype(np.uint8)
    return res


def _cell_centers():
    yy, xx = np.mgrid[0:CELL, 0:CELL]
    return xx + 0.5, yy + 0.5


def make_straight(src: np.ndarray) -> np.ndarray:
    """index 0 = 縦 (北+南)。芯が x=CELL/2 を縦に貫き、上辺から下辺まで届く。"""
    px, py = _cell_centers()
    sx = CORE_X + (px - CELL / 2.0) / S      # 横断方向 (= 恒等写像)
    sy = py / S                              # 沿線方向 (素材 1 枚 = 1 タイル)
    valid = (sx >= 0.0) & (sx <= CELL)
    return _bilinear_premul(src, sx, sy, valid)


def make_curve_ne(src: np.ndarray) -> np.ndarray:
    """index 2 = 北→東。北東角 (CELL, 0) を中心とする半径 CELL/2 の四分円へ逆写像。

    北辺の中点 (256,0) も東辺の中点 (512,256) も角から距離 256 なので、この四分円は
    両方の辺の中点をきれいに通る = 直線ピースと芯がそろう。断面は半径方向の
    オフセットそのものなので、水路の幅はカーブでも厳密に一定になる。

    沿線方向は θ(0..90°) を素材の y に線形対応させる (railKit と同じ)。
    弧長 402px を 512 に伸ばすので、流れの筋はカーブで約 21% 詰まる。
    """
    px, py = _cell_centers()
    dx = px - CELL                            # 常に < 0 (セル内)
    dy = py - 0.0                             # 常に > 0
    r = np.hypot(dx, dy)
    # atan2(dy, -dx): 北辺で 0、東辺で π/2。セル内では必ず [0, π/2] に入る。
    t = np.arctan2(dy, -dx) / (math.pi / 2.0)
    sx = CORE_X + (r - RADIUS) / S
    sy = t * CELL
    valid = (sx >= 0.0) & (sx <= CELL) & (t >= 0.0) & (t <= 1.0)
    return _bilinear_premul(src, sx, sy, valid)


def build_sheet(src: np.ndarray) -> np.ndarray:
    """6 ピースを横一列に並べた (512, 3072, 4) の uint8 を返す。"""
    ns = make_straight(src)
    ne = make_curve_ne(src)
    # np.rot90(k=1) は画面上で反時計回り 90°。k=-1 が時計回り。
    pieces = [
        ns,                          # 0 縦   (北+南)
        np.rot90(ns, k=-1),          # 1 横   (東+西)  縦を時計回り
        ne,                          # 2 北→東
        np.rot90(ne, k=-1),          # 3 東→南 (北→東 を時計回り)
        np.rot90(ne, k=2),           # 4 南→西
        np.rot90(ne, k=1),           # 5 西→北 (= 270° 時計回り)
    ]
    return np.ascontiguousarray(np.concatenate(pieces, axis=1))


# ══ 接続点の実測 (生成物が本当に「つながる」かを数値で出す) ═══════════════
def edge_rgba(sheet: np.ndarray, idx: int, edge: str) -> np.ndarray:
    """ピース idx の指定辺 (N/E/S/W) に沿った RGBA 列 (CELL, 4)。

    N/S は西→東、E/W は北→南 の順。隣り合う 2 セルは同じ物理位置が同じ index に
    なるので、そのまま要素ごとに比べれば継ぎ目の一致が測れる。
    """
    cell = sheet[:, idx * CELL:(idx + 1) * CELL, :]
    if edge == "N":
        return cell[0, :, :]
    if edge == "S":
        return cell[CELL - 1, :, :]
    if edge == "W":
        return cell[:, 0, :]
    if edge == "E":
        return cell[:, CELL - 1, :]
    raise ValueError(edge)


def _run(mask: np.ndarray):
    """1 次元 bool の非ゼロ範囲 (lo, hi) を返す。無ければ None。"""
    nz = np.nonzero(mask)[0]
    if nz.size == 0:
        return None
    return int(nz.min()), int(nz.max())


def report_edges(sheet: np.ndarray) -> bool:
    """24 辺 (6 セル × 4 辺) の被覆表を出し、期待表と全件一致するかを返す。

    期待表:
      - variant のマスクが立っている辺 … 辺の中点 ±(水面幅/2) に不透明画素があり、
        不透明帯の中心が中点と一致し、水面幅・水路幅が公称 ± ゆらぎに収まる。
      - 立っていない辺 … α が 1 画素も無い。
    """
    mid = CELL / 2.0 - 0.5                        # 辺の中点 (画素 index 基準)
    lo_i = int(round(mid - PROBE))
    hi_i = int(round(mid + PROBE))
    op_lo = 2.0 * (WATER_HALF - WOBBLE_MAX) - 4.0     # 144 - 4 = 140
    op_hi = 2.0 * (WATER_HALF + WOBBLE_MAX) + 4.0     # 176 + 4 = 180
    ink_lo = 2.0 * (EDGE_HALF - WOBBLE_MAX) - 4.0     # 204 - 4 = 200
    ink_hi = 2.0 * (EDGE_HALF + WOBBLE_MAX) + 4.0     # 236 + 4 = 240

    print(f"  期待: 接続辺 = 中点{mid:.1f} ±{PROBE:.0f} が α>={OPAQUE} / "
          f"不透明幅 {op_lo:.0f}..{op_hi:.0f} / 水路幅 {ink_lo:.0f}..{ink_hi:.0f} / "
          f"非接続辺 = α 皆無")
    print("  piece            edge  ink   ink extent   幅   不透明 extent  幅   中心    ±probe")
    ok = True
    for i in range(NPIECE):
        for e in ("N", "E", "S", "W"):
            prof = edge_rgba(sheet, i, e)[:, 3].astype(np.int64)
            want = e in PIECE_EDGES[i]
            ink = _run(prof > 0)
            opa = _run(prof >= OPAQUE)
            probe = int(prof[lo_i]) >= OPAQUE and int(prof[hi_i]) >= OPAQUE
            if ink is None:
                desc = "   (none)      -        (none)       -      -      -"
                good = not want
            else:
                iw = ink[1] - ink[0] + 1
                if opa is None:
                    ow, oc, otxt = 0, float("nan"), "  (none)      0"
                else:
                    ow = opa[1] - opa[0] + 1
                    oc = (opa[0] + opa[1]) / 2.0
                    otxt = f"{opa[0]:3d}..{opa[1]:3d}  {ow:4d}"
                desc = (f"{ink[0]:3d}..{ink[1]:3d}  {iw:4d}   {otxt}  "
                        f"{oc:6.1f}  {'YES' if probe else ' NO'}")
                good = bool(want and probe and opa is not None
                            and abs(oc - mid) <= CENTER_TOL
                            and op_lo <= ow <= op_hi and ink_lo <= iw <= ink_hi)
            ok &= good
            print(f"  {i} {PIECE_NAMES[i]:<12s} {e}   {'YES' if ink else ' no'}  {desc}"
                  f"   {'OK' if good else '*** NG (expect ' + ('water' if want else 'empty') + ')'}")
    return bool(ok)


def report_seams(sheet: np.ndarray) -> bool:
    """つながりうる全ての辺の組で、継ぎ目をまたいだ RGBA の差を測る。

    ミラー対称の断面 + 周期 CELL のノイズなので、どの向きの組み合わせでも
    差は「1 行ぶんのノイズの変化」しか出ないはず。段差が出たら設計が崩れている。
    RGB は前乗算で比べる (α が小さい領域の RGB は意味を持たないため)。
    """
    worst, worst_txt = 0, "-"
    for i in range(NPIECE):
        for e in PIECE_EDGES[i]:
            for j in range(NPIECE):
                if OPPOSITE[e] not in PIECE_EDGES[j]:
                    continue
                pa = edge_rgba(sheet, i, e).astype(np.float64)
                pb = edge_rgba(sheet, j, OPPOSITE[e]).astype(np.float64)
                qa = np.concatenate([pa[:, :3] * pa[:, 3:4] / 255.0, pa[:, 3:4]], axis=1)
                qb = np.concatenate([pb[:, :3] * pb[:, 3:4] / 255.0, pb[:, 3:4]], axis=1)
                dmax = int(np.rint(np.abs(qa - qb).max()))
                if dmax > worst:
                    worst, worst_txt = dmax, f"{i}{e} | {j}{OPPOSITE[e]}"
    ok = worst <= SEAM_TOL
    print(f"  継ぎ目 (18 接合 × 両向き) の最大 RGBA 差 = {worst}  "
          f"(最悪 {worst_txt} / 許容 {SEAM_TOL})  {'OK' if ok else '*** NG'}")
    return ok


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="つながる水路 6 ピースのシートを焼き込む")
    ap.add_argument("--out", default=OUT_PNG, help="出力 (既定 assets/water_kit.png)")
    ap.add_argument("--check-only", action="store_true",
                    help="書き込まずに接続点の実測だけ出す")
    args = ap.parse_args(argv)

    src = build_source()
    _verify_source(src)
    sheet = build_sheet(src)

    print(f"[make_water_kit] 手続き生成 seed={SEED} (画像 AI 不使用・決定論)")
    print(f"  断面 |d|: 0..{WATER_HALF:.0f} 水面 / {WATER_HALF:.0f}..{EDGE_HALF:.0f} 浅瀬→岸 "
          f"(α 1→0) / {EDGE_HALF:.0f}.. 透明   岸のゆらぎ ±{WOBBLE_MAX:.0f}px")
    for label, half in (("水面", WATER_HALF), ("水路", EDGE_HALF)):
        disp = 2 * half * TILE_PX / CELL
        print(f"  {label}幅 {2 * half:.0f}px / セル{CELL} → 本編 {TILE_PX}px タイルで "
              f"{disp:.2f}px ≒ {disp * PX_CM:.0f}cm")
    print(f"  sheet {sheet.shape[1]}x{sheet.shape[0]} ({NPIECE} pieces)")
    ok = report_edges(sheet)
    ok &= report_seams(sheet)

    if args.check_only:
        print("  (--check-only: 書き込みなし)")
        return 0 if ok else 1

    Image.fromarray(sheet, "RGBA").save(args.out, "PNG", optimize=True)
    with open(args.out, "rb") as fp:
        digest = hashlib.sha256(fp.read()).hexdigest()
    print(f"  wrote {os.path.relpath(args.out, PROJ)}  sha256={digest}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
