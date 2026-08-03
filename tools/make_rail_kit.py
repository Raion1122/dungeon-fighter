"""「つながる線路」6 ピースのスプライトシート assets/mine_rail_kit.png を焼き込む。

背景 (なぜこのスクリプトが要るか):
  情景物の線路 (kind="rail") は **縦の直線 3 変種しか無い**。ユーザー要望は
  「横や曲がる部分なども欲しい (プラレールみたいに上下左右つなげれる構造)」。

  絵は **新規生成しない**。ChatGPT に描かせると画風・線幅・枕木の間隔が既存の
  廃坑タイルとそろわないうえ、生成のたびに違う絵が出る (= 非決定論)。
  既存 assets/mine_rail.png の縦直線を **幾何変換するだけ**なら画風は定義上同一で、
  何度走らせてもバイト単位で同じ PNG が出る。

⭐ なぜ「マス正方形」のセルなのか (この設計の鍵):
  本編の情景描画 (index.html:5766-5779) は

      scale = displayMax / max(fr.w, fr.h);  dx = cx - fr.w*scale/2;  dy = cy - fr.h*scale/2

  すなわち **フレーム矩形の中心をタイル中心に合わせる**。SCENERY_FRAMES は単なる
  ソース矩形であって「インクの外接矩形」である必要はないので、**1 ピース = 1 マスの
  正方形**として宣言してしまえば、隣り合ったピースの境界は必ず一致する。
  512 の正方セルに displayMax=TILE_SIZE(96) を与えると 1 マスちょうどを占める。

⭐ 縦の span は frame の 814 ではなく **インクの 806** を使う (重要):
  frames.json 由来の rail[0] = {x:80,y:94,w:350,h:814} には上下に 4px の透明余白が
  ある (実測: インク行 4..809)。814 をそのままタイル周期にすると
  セルの上辺・下辺に **インクが 1px も乗らない** → 敷き詰めたときに全接合部へ
  透明の筋が出る。インク span [4, 810) を 1 タイルに割り当てれば上辺/下辺で
  レールが必ず接する。等方 (x も y も同じ S) なので絵は歪まない。
  ⚠ 代償: 枕木の間隔は素材内では約 127.7px だが、タイルの継ぎ目だけ 167.5px に
     なる (素材の端が枕木の途中で切れていないため)。表示 96px 換算で 15px と 20px
     の差 = 長い直線でタイルごとに 1 箇所だけ枕木が疎になる。気になったら
     SRC_INK_Y0 / SRC_INK_Y1 を「枕木周期の整数倍」へ詰める (下のコメント参照)。

⚠ 既存の rail 種には一切触らない。assets/mine_rail.png は **読むだけ**。
  散布は variant = hash % frames.length なので、rail のフレーム数を増減すると
  廃坑の既存マップの見た目が変わってしまう。新しい絵は **別シート** に出す。

ピース構成 (シート上の並び順 = variant index):
    0 縦    (北+南)      … 素材をそのまま等方縮小
    1 横    (東+西)      … 0 を 90° 時計回り
    2 北→東 (北+東)      … 北東角を中心とする半径 256 の四分円へ逆写像
    3 東→南 (東+南)      … 2 を 90° 時計回り
    4 南→西 (南+西)      … 2 を 180°
    5 西→北 (西+北)      … 2 を 270° 時計回り (= 90° 反時計回り)
  T 字・十字・終端は作らない (決定済み)。

使い方:
    py tools/make_rail_kit.py
    py tools/make_rail_kit.py --src assets/mine_rail.png --out assets/mine_rail_kit.png
    py tools/make_rail_kit.py --check-only        # 書き込まず接続点の実測だけ出す
"""
from __future__ import annotations

import argparse
import hashlib
import math
import os
import sys

import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(BASE)

# ── 入出力 ────────────────────────────────────────────────────────────────
SRC_PNG = os.path.join(PROJ, "assets", "mine_rail.png")
OUT_PNG = os.path.join(PROJ, "assets", "mine_rail_kit.png")

# ── ソース矩形。index.html の SCENERY_FRAMES.rail[0] (= 縦の直線) と同値 ──
#    ⚠ ここは「絵の切り出し位置」であって本編のカタログではない。値が食い違うと
#      下の _verify_source() が実測との不一致で落ちるので、黙ってズレることはない。
SRC_FRAME = (80, 94, 350, 814)          # x, y, w, h

# ── 素材の実測値 (py で計測。_verify_source() が毎回この通りか確認する) ──
#    インク行 = 4..809 (上下 4px は透明余白)。これを 1 タイル分の周期として使う。
#    ⚠ 枕木の間隔をそろえたい場合はここを (24.15, 790.35) 相当へ詰める
#      = 枕木中心 88..726.5 の平均間隔 127.7 × 6 = 766.2 を周期にする、という手。
#      現状はインク全体を使う (素材を 1px も捨てない) 方を採っている。
SRC_INK_Y0 = 4.0
SRC_INK_Y1 = 810.0                      # 排他 (インク行 809 の下端)
SRC_INK_X0, SRC_INK_X1 = 4, 345         # インク列 (左右余白 4/4 = 左右対称)
SRC_RAIL_CX = (85.0, 265.0)             # レール金属 2 本の中心 x (65-105 / 245-285)

# 芯 (2 本のレールの中点)。実測 (85+265)/2 = 175.0 = フレーム幅 350 の中心でもある。
CORE_X = 0.5 * (SRC_RAIL_CX[0] + SRC_RAIL_CX[1])

# ── 出力の幾何 ────────────────────────────────────────────────────────────
CELL = 512                              # 1 マス = 512px 角
RADIUS = CELL / 2.0                     # カーブの半径。角から見て辺の中点までの距離
NPIECE = 6

# 等方スケール。「素材のインク 806px = 1 タイル」なので S = 512/806 ≒ 0.6352。
#   線路幅 350 → 222px。本編では 96px タイルに対し 41.7px ≒ 実寸 1.24m、
#   軌間 (レール間 180px) は 21.4px ≒ 0.64m = 鉱山軌道の狭軌として妥当。
S = CELL / (SRC_INK_Y1 - SRC_INK_Y0)

PIECE_NAMES = ["縦(北南)", "横(東西)", "北→東", "東→南", "南→西", "西→北"]
# 各ピースがインクを持つべき辺。検算 (--check-only / 生成後の表) の期待値。
PIECE_EDGES = [("N", "S"), ("E", "W"), ("N", "E"), ("E", "S"), ("S", "W"), ("W", "N")]


# ══ 素材の読み込みと健全性チェック ═══════════════════════════════════════
def _load_frame(src_path: str) -> np.ndarray:
    """mine_rail.png から frame 0 を切り出して float64 の RGBA (H,W,4) で返す。"""
    im = Image.open(src_path).convert("RGBA")
    if im.size != (1536, 1024):
        raise SystemExit(
            f"[make_rail_kit] {src_path} が想定サイズ 1536x1024 ではない: {im.size}\n"
            "  素材が差し替わっている。SRC_FRAME と実測値の再計測が要る。")
    x, y, w, h = SRC_FRAME
    return np.asarray(im.crop((x, y, x + w, y + h)), dtype=np.float64)


def _verify_source(frame: np.ndarray) -> None:
    """素材が計測したときと同じ絵か確認する。

    ⚠ ここを省くと、素材差し替え時に「歪んだ線路が黙って生成される」事故になる。
       接続点の位置は CORE_X とインク span から決まるので、絵が変われば全部ズレる。
    """
    a = frame[:, :, 3]
    ink = a > 16
    rows = np.nonzero(ink.any(axis=1))[0]
    cols = np.nonzero(ink.any(axis=0))[0]
    got = (int(rows.min()), int(rows.max()), int(cols.min()), int(cols.max()))
    want = (int(SRC_INK_Y0), int(SRC_INK_Y1) - 1, SRC_INK_X0, SRC_INK_X1)
    if got != want:
        raise SystemExit(
            f"[make_rail_kit] frame 0 のインク範囲が実測時と違う\n"
            f"  期待 (row0,row1,col0,col1) = {want}\n  実際 = {got}\n"
            "  素材が差し替わった。SRC_INK_* / SRC_RAIL_CX / CORE_X を測り直すこと。")
    # レール金属 2 本 = 縦にほぼ全長つながっている列。芯の位置の裏取り。
    tall = np.nonzero(ink.sum(axis=0) > 0.9 * frame.shape[0])[0]
    if tall.size == 0:
        raise SystemExit("[make_rail_kit] 縦に貫くレール列が見つからない (素材が別物)")
    gap = np.nonzero(np.diff(tall) > 1)[0]
    if gap.size != 1:
        raise SystemExit(f"[make_rail_kit] レールが 2 本に分かれていない (連続塊 {gap.size + 1} 個)")
    left, right = tall[: gap[0] + 1], tall[gap[0] + 1:]
    cx = (0.5 * (left[0] + left[-1]), 0.5 * (right[0] + right[-1]))
    if abs(cx[0] - SRC_RAIL_CX[0]) > 1.0 or abs(cx[1] - SRC_RAIL_CX[1]) > 1.0:
        raise SystemExit(
            f"[make_rail_kit] レール中心が実測時と違う 期待 {SRC_RAIL_CX} / 実際 {cx}")


# ══ サンプラ ═════════════════════════════════════════════════════════════
def _bilinear_premul(frame: np.ndarray, sx: np.ndarray, sy: np.ndarray,
                     valid: np.ndarray) -> np.ndarray:
    """frame を (sx, sy) で bilinear サンプルして uint8 RGBA を返す。

    ⚠ **アルファを前乗算してから補間する**。しないと透明画素の RGB (抽出時に
       0 や黒が入っている) が混ざり、輪郭に暗いフリンジが出る。
    ⚠ 座標はピクセル**中心**基準 (整数座標 n の中心は n+0.5) なので 0.5 を引く。
    """
    h, w = frame.shape[0], frame.shape[1]
    a = frame[:, :, 3:4] / 255.0
    prem = np.concatenate([frame[:, :, :3] * a, frame[:, :, 3:4]], axis=2)  # (H,W,4)

    u = sx - 0.5
    v = sy - 0.5
    x0 = np.floor(u)
    y0 = np.floor(v)
    fx = (u - x0)[:, :, None]
    fy = (v - y0)[:, :, None]
    x0i = np.clip(x0.astype(np.int64), 0, w - 1)
    y0i = np.clip(y0.astype(np.int64), 0, h - 1)
    x1i = np.clip(x0i + 1, 0, w - 1)
    y1i = np.clip(y0i + 1, 0, h - 1)

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


def make_straight(frame: np.ndarray) -> np.ndarray:
    """index 0 = 縦 (北+南)。芯が x=CELL/2 を縦に貫き、上辺から下辺まで届く。"""
    px, py = _cell_centers()
    sx = CORE_X + (px - CELL / 2.0) / S      # 横断方向: 芯からのズレを等方で戻す
    sy = SRC_INK_Y0 + py / S                 # 沿線方向: インク span 全体を 1 タイルに
    valid = (sx >= 0.0) & (sx <= SRC_FRAME[2])
    return _bilinear_premul(frame, sx, sy, valid)


def make_curve_ne(frame: np.ndarray) -> np.ndarray:
    """index 2 = 北→東。北東角 (CELL, 0) を中心とする半径 CELL/2 の四分円へ逆写像。

    北辺の中点 (256,0) も東辺の中点 (512,256) も角から距離 256 なので、
    この四分円は両方の辺の中点をきれいに通る = 直線ピースと芯がそろう。

    沿線方向は θ(0..90°) を素材の y(インク span) に線形対応させる。こうすると
    **1 タイルあたりの枕木の本数が直線と同じ**になり、枕木は外周ほど間隔が
    広がる扇形に開く = 実物の軌道と同じ挙動。
    """
    px, py = _cell_centers()
    dx = px - CELL                            # 常に < 0 (セル内)
    dy = py - 0.0                             # 常に > 0
    r = np.hypot(dx, dy)
    # atan2(dy, -dx): 北辺で 0、東辺で π/2。セル内では必ず (0, π/2) に入る。
    t = np.arctan2(dy, -dx) / (math.pi / 2.0)
    sx = CORE_X + (r - RADIUS) / S
    sy = SRC_INK_Y0 + t * (SRC_INK_Y1 - SRC_INK_Y0)
    valid = (sx >= 0.0) & (sx <= SRC_FRAME[2]) & (t >= 0.0) & (t <= 1.0)
    return _bilinear_premul(frame, sx, sy, valid)


def build_sheet(frame: np.ndarray) -> np.ndarray:
    """6 ピースを横一列に並べた (512, 3072, 4) の uint8 を返す。"""
    ns = make_straight(frame)
    ne = make_curve_ne(frame)
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
def edge_profile(sheet: np.ndarray, idx: int, edge: str) -> np.ndarray:
    """ピース idx の指定辺 (N/E/S/W) に沿ったアルファ 1 次元プロファイル (長さ CELL)。"""
    cell = sheet[:, idx * CELL:(idx + 1) * CELL, 3]
    if edge == "N":
        return cell[0, :]
    if edge == "S":
        return cell[CELL - 1, :]
    if edge == "W":
        return cell[:, 0]
    if edge == "E":
        return cell[:, CELL - 1]
    raise ValueError(edge)


def report_edges(sheet: np.ndarray) -> bool:
    """4 辺のインク被覆を表で出し、PIECE_EDGES と全件一致するかを返す。"""
    print("  piece            edge  ink   extent        width  center  maxA")
    ok = True
    for i in range(NPIECE):
        for e in ("N", "E", "S", "W"):
            p = edge_profile(sheet, i, e)
            nz = np.nonzero(p > 0)[0]
            want = e in PIECE_EDGES[i]
            has = nz.size > 0
            if has:
                lo, hi = int(nz.min()), int(nz.max())
                desc = f"{lo:3d}..{hi:3d}   {hi - lo + 1:5d}  {(lo + hi) / 2:6.1f}  {int(p.max()):4d}"
            else:
                desc = "   (none)       -       -     -"
            good = (has == want)
            ok &= good
            print(f"  {i} {PIECE_NAMES[i]:<12s} {e}   {'YES' if has else ' no'}  {desc}"
                  f"   {'OK' if good else '*** NG (expect ' + ('ink' if want else 'empty') + ')'}")
    return bool(ok)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="つながる線路 6 ピースのシートを焼き込む")
    ap.add_argument("--src", default=SRC_PNG, help="素材 (既定 assets/mine_rail.png)")
    ap.add_argument("--out", default=OUT_PNG, help="出力 (既定 assets/mine_rail_kit.png)")
    ap.add_argument("--check-only", action="store_true",
                    help="書き込まずに接続点の実測だけ出す")
    args = ap.parse_args(argv)

    frame = _load_frame(args.src)
    _verify_source(frame)
    sheet = build_sheet(frame)

    print(f"[make_rail_kit] src={os.path.relpath(args.src, PROJ)} frame={SRC_FRAME}")
    print(f"  ink span y=[{SRC_INK_Y0:.0f},{SRC_INK_Y1:.0f}) core x={CORE_X:.1f} "
          f"scale S={S:.6f} (= {CELL}/{SRC_INK_Y1 - SRC_INK_Y0:.0f})")
    print(f"  線路幅 {SRC_FRAME[2] * S:.1f}px / セル{CELL} → 本編 96px タイルで "
          f"{SRC_FRAME[2] * S * 96 / CELL:.1f}px ≒ {SRC_FRAME[2] * S * 96 / CELL * 2.982:.0f}cm")
    print(f"  sheet {sheet.shape[1]}x{sheet.shape[0]} ({NPIECE} pieces)")
    ok = report_edges(sheet)

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
