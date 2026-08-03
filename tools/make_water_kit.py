"""「つながる水路」6 ピースのスプライトシート assets/water_kit.png を焼き込む。

⭐⭐ ハイブリッド方式 (2026-08-04 の作り直し):
  **水面の質感だけを ChatGPT に描かせ、水路の形・岸・接続点はこのコードで切り抜く。**

  なぜ「水路の絵そのもの」を AI に描かせないのか:
    接続タイルは「芯 (水路の中心線) がセル辺の中点をきっかり通る」ことが絶対条件。
    画像生成 AI は **原理的にこれを満たせない** (1px 単位の幾何を指示できない・
    生成のたびに違う絵が出る = 非決定論)。よって **幾何はコード / 質感は AI** に分ける。

  素材の流れ (source_images/ は .gitignore 対象なので 2 段構えにしてある):
    1. 依頼文        tools/sprite_batches/water_surface.txt
    2. 生の生成物    source_images/water_surface/01_water.png   … git 管理外
    3. --prepare-from で焼く  tools/water_surface_src.png       … **commit 対象**
    4. 通常実行はこの 3 だけを読む ⇒ **リポジトリ単独で決定論的に再生成できる**
       (生の AI PNG が失われても assets/water_kit.png は同じバイトで再生成される)

⚠ 旧版 (手続き生成のみ) は 2026-08-04 の iOS 実機で「水が管に見える」と却下された。
  原因は 3 つとも **円柱の陰影そのもの** だった:
    ① 断面が中央ほど暗く縁ほど明るいなめらかなグラデ = 円柱の塗り方
    ② 明るい筋が芯から一定距離を **全長にわたって平行に** 走る = 円柱のハイライト線
    ③ 幅がほぼ一定 (WOBBLE_MAX が 8px しかなかった)
  今回の対処:
    ① 断面を **ほぼ平坦** にし、**水際に細い暗線** を入れた (最大の realism 手がかり)
    ② 平行な筋 (旧 STREAKS) を **全廃** し、AI テクスチャの蛇行する波紋に置き換えた
    ③ WOBBLE_MAX 8 → 14 + うねりに高周波 octave を追加
       ⚠ 接続辺は必ず s=0/512 なので **幅は全継ぎ目で同一** になる。低周波だけだと
         1 タイルに 1 個の膨らみ = 数珠つなぎに見えるので、高周波を足して崩す。

⭐ なぜ「マス正方形」のセルなのか (make_rail_kit.py と同じ設計):
  本編の情景描画は scale = displayMax / max(fr.w, fr.h) で **フレーム矩形の中心を
  タイル中心に合わせる**。1 ピース = 512 角の正方セルとして宣言し displayMax=96
  (= TILE_SIZE) を与えると 1 マスちょうどを占め、隣り合ったピースの境界は必ず一致する。

⭐⭐ 断面を「芯からの距離の絶対値 |d| だけの関数」にしてある (ミラー対称・これは仕様):
  各辺で「辺に沿った位置 → 素材の列」の向きを + / - で表すと、隣り合うタイルは
  共有する辺で同じ向きでなければならない。N を持つ駒 {P0,P2,P5} と S を持つ駒
  {P0,P3,P4} は総当たりで隣接しうるので **横辺は全部同じ向き σ_h**、同様に
  **縦辺は全部同じ向き σ_v** でなければならない。ところが四分円の半径写像
  sx = 256 + ε(r-256) を解くと
      P2 (北→東, 中心 NE): (N,E) = ('-','+') か ('+','-')  ⇒ σ_h ≠ σ_v
      P3 (東→南, 中心 SE): (E,S) = ('-','-') か ('+','+')  ⇒ σ_h = σ_v
  となり **両方を満たす解は存在しない**。つまり左岸・右岸を作り分けることは
  原理的に不可能で、断面を |d| の関数にする (= ミラー対称) しか道がない。
  → **AI テクスチャも芯について必ずミラーする** (_fold_and_loop がやる)。

⭐⭐⭐ ミラーが必須であることから、絵づくりの制約が 1 つ導かれる (2026-08-04 に実測で判明):
  **テクスチャは「自分の鏡像と区別がつかない」細かさでなければならない。**
  原画をそのまま使うと、渦や光の筋が芯で折り返して **蝶ネクタイ形の motif** になり、
  それが 1 タイル (96px) ごとに反復して「数珠つなぎ」に見える (旧「管」と同じくらい人工的)。
  縮小してタイリングする案も試したが、ミラー + 2 軸の周期 = 壁紙群になり
  **レース (魚の鱗) 状の規則格子**になって不採用。
  → 採った形:
     ① 原画は **低域 (TEX_LOWPASS_PX より粗い成分) を落として** 筆致だけ使う
     ② 失われた生気は **手続きの細粒 (GRAIN)** で足す (2〜4 表示px = 鏡像でも判別不能)
     ③ ⭐ **リアリズムの主役は「s (沿線方向) だけの関数」に置く**。s だけの関数は
        u に依らないので **ミラーに完全に無害** = motif を一切作らない。
        淀みと早瀬の明暗 (DEPTH) ・幅のうねり (WOBBLE) がこれに当たる。

⭐⭐ 沿線方向のノイズは周期 512 (= 1 セル) で **完全にループ**させてある:
  各ピースは「つながる辺で s=0」「もう一方の辺で s=512」になるよう作ってあるので、
  周期 512 なら s の値は継ぎ目をまたいで必ず連続する。ピースの向きが逆でも
  noise(0) == noise(512) なので段差は出ない。
  → **AI テクスチャは s 方向にクロスフェードでループ化する** (_fold_and_loop がやる)。
     AI に完全な seamless は期待しない。

ピース構成 (シート上の並び順 = variant index。⛔ 順番は保存値なので絶対に変えない):
    0 縦    (北+南)      … 断面をそのまま縦に押し出す
    1 横    (東+西)      … 0 を 90° 時計回り
    2 北→東 (北+東)      … 北東角を中心とする半径 256 の四分円へ逆写像
    3 東→南 (東+南)      … 2 を 90° 時計回り
    4 南→西 (南+西)      … 2 を 180°
    5 西→北 (西+北)      … 2 を 270° 時計回り (= 90° 反時計回り)
  T 字・十字・終端は作らない (railKit と同じ決定)。

⚠⚠ **同名 PNG の中身を変えたら index.html の `?v=` を必ず上げること**。
  assets/water_kit.png は初版 (c8e45b6) では `?v=` 無しで参照していたため、
  ユーザーの iOS Safari は旧「管」の水をキャッシュしたまま新版を取りに行かない
  ＝ 「直したのに実機で何も変わらない」という気づけない欠陥になる。
  現在は `src: "assets/water_kit.png?v=2"`。追随先は index.html 1 箇所 +
  tools/driver_mapeditor_waterkit.js 2 箇所 (変異アンカーと §1 1d)。

使い方:
    py tools/make_water_kit.py
    py tools/make_water_kit.py --out assets/water_kit.png
    py tools/make_water_kit.py --check-only     # 書き込まず 24 辺の被覆表だけ出す
    # AI 素材を差し替えたとき (これだけは source_images/ を読む。1 回で済む)
    py tools/make_water_kit.py --prepare-from source_images/water_surface/01_water.png

  絵を意図的に変えたあと (忘れると「赤いまま安定」する):
    py tools/make_water_kit.py --check-only
    node tools/driver_mapeditor_waterkit.js --update-golden
    git diff tools/goldens/ をレビュー → commit
    ⭐ golden の "game-goblin-mine" が**変わっていないこと**を必ず確認する
       (= 既定 6 シナリオが 1 ドットも変わっていない証明)
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

# ── AI 水面テクスチャ ─────────────────────────────────────────────────────
#    tools/water_surface_src.png は「芯の左半分だけ」(256 列) を持つ。右半分は
#    _fold_and_loop がミラーで作る (上の設計メモを参照)。行は CELL + LOOP_FADE で、
#    余分な LOOP_FADE 行が s 方向のクロスフェード用の“のりしろ”。
TEX_SRC_PNG = os.path.join(BASE, "water_surface_src.png")
LOOP_FADE = 128               # s 方向ループ化のクロスフェード長 (行)
#    ⛔ TEX_LOWPASS_KEEP を 1.0 に戻すと「蝶ネクタイ motif」が復活する (上の設計メモ③)
TEX_LOWPASS_PX = 16           # これより粗い成分を「低域」とみなす (素材 px)
TEX_LOWPASS_KEEP = 0.30       # 低域を何割残すか (0 = 筆致だけ / 1 = 原画そのまま)
TEX_GAIN = 1.45               # 残した筆致 (高域) の強さ

TEX_SOFT = 10.0               # 筆致の soft-clip。孤立した強いハイライトを圧縮する。
                              #   ⛔ 大きくすると「目」型 motif が復活する: AI 原画の
                              #     光の点が芯で対になり、1 タイルごとに同じ位置へ出る
                              #     (実測。低域カット幅や細粒を振っても消えなかった)

# ── 手続きの細粒と、s だけの明暗 (どちらもミラーに無害) ────────────────────
GRAIN_CELLS = ((48, 0.60), (96, 0.40))   # (s 方向の格子数, 重み)。48 -> 2 表示px
GRAIN_AMP = 0.055             # 細粒の振幅 (水面の明るさに対する比)
DEPTH_CELLS = ((6, 1.00), (17, 0.45))    # 淀み (暗く深い) と早瀬 (明るい) の周期
DEPTH_AMP = 0.20              # ⭐ s だけの関数なので motif を作らない = 主役にできる

# ── ⭐⭐ 横断方向の波紋 (チェブロン)。ミラー対称なのに人工的に見えない唯一の構造 ──
#    位相を phase = s + CHEVRON_PX * (|d|/WATER_HALF)^2 にすると、等値線が
#    **左右対称の V 字** になる。鏡像にしても V 字は V 字なので motif にならない。
#    しかも _noise1 は引数について周期 CELL なので phase をずらしても継ぎ目は安全
#    (noise1(0 + k u^2) == noise1(512 + k u^2))。
#    ＝ 「波紋は横断方向に走る」という物理も同時に満たす (旧版の平行な縦筋は逆だった)。
RIPPLE_CELLS = ((11, 0.55), (23, 0.30), (43, 0.15))
RIPPLE_AMP = 0.15             # 波紋の明暗
CHEVRON_PX = 34.0             # V 字の開き。岸で位相が何 px 遅れるか
GLINT_MIX = 0.30              # 波頭のきらめきの強さ (0 で無し)
COL_GLINT = (146.0, 186.0, 184.0)   # 波頭のきらめき

# ── ⭐⭐ 水際の小石 (2026-08-04 ユーザー要望。1 回目の実機で「まだ管っぽい」を受けて) ──
#    残っていた「管」の読みの正体は **水際の縁が滑らかで一様な輪になっていること**
#    ＝ 円柱の縁の描き方そのもの。小石を散らすとその輪が壊れ、「地面に掘れた流れ」に読める。
#    ⭐ |d| の関数なので **両岸に対で出る**。実際の川も両岸に砂利があるので鏡像でも
#      自然に見える (チェブロン波紋と同じ「対称でも人工的に見えない」構造)。
#    ⚠ **α は一切変えない**。色だけで描くので report_edges の実測値 (不透明幅 / 水路幅 /
#      中心) が 1px も動かない ＝ しきい値の再調整が要らない。
#    ⚠ 密にしすぎると小石が連なって **また「輪」になる**。1 タイル (表示 96px) に
#      片側 PEBBLE_N 個 = 6.8 表示px 間隔、石の直径 1.5〜3.4 表示px で隙間が空く量。
#    ⚠⚠ 6 倍 NEAREST (= 実ピクセル) で見て決めた。**2 倍の滑らか拡大では判定できない**
#      (初回の設定は 3 倍表示では良さそうに見えたが、実ピクセルでは
#       「配管のリベット」に見えていた。原因 3 つとも下に潰した)
#    ⛔ 接地の暗い輪を強くするな (表示 2px の石には解像せず、ただ暗い点になる)
#    ⛔ offset を岸側 (正) へ伸ばすな (α が薄い岸に乗ると茶床に沈んで灰色の点になる)
#    ⛔ 水中側に**広く**散らすこと。狭くすると石が縁に一列に並んで
#      今度は「明るい輪」= やはり円柱のハイライトに見える
PEBBLE_N = 24                 # 1 セル (= 512 素材px = 表示 96px) あたりの個数
PEBBLE_R = (3.0, 9.5)         # 半径 (素材px)。3.4〜10.6cm の砂利に相当
PEBBLE_OFFSET = (-30.0, 3.0)  # 水際 w1 からのずれ。負 = 水中側 / 正 = 岸側
PEBBLE_MIX = 0.75             # 石の面の混ぜ量
PEBBLE_SUBMERGED = 0.95       # 水中の石は水を透かすので少しだけ淡くする倍率
PEBBLE_SHADE = 0.10           # 接地の暗い輪 (⛔ 上げるとリベットになる)
COL_PEBBLE = (138.0, 128.0, 110.0)  # 濡れた小石 (明るい灰褐色)

# ── 断面プロファイル (d = 芯からの距離 px) ────────────────────────────────
#    0 .. WATER_HALF          水面   (α=255。**ほぼ平坦** = 管に見せないため)
#    WATER_HALF               水際の細い暗線 (realism の主役)
#    WATER_HALF .. EDGE_HALF  濡れた泥 → 乾いた岸へのグラデ (α 1→0)
#    EDGE_HALF ..             完全透明
#    ⚠ ここを動かすと --check-only の期待表 (中点 ±水面幅/2) も一緒に動く。
WATER_HALF = 80.0
EDGE_HALF = 110.0
WOBBLE_MAX = 14.0             # 岸の輪郭のゆらぎ (定規で引いた直線にしないため)
WATERLINE_SIG = 3.6           # 水際の暗線の幅 (素材 px。表示で約 1.4px)
WATERLINE_DEPTH = 0.55        # 暗線の濃さ (0 = 無し / 1 = COL_WATERLINE そのもの)
SHALLOW_FROM = 0.74           # q(=|d|/w1) がこれを超えたら浅瀬の明るみを混ぜる
SHALLOW_MIX = 0.34            # 浅瀬の混ぜ量 (大きくすると断面が再び「管」に近づく)

PX_CM = 2.982                 # 物差し: キャラ体高 57px = 1.70m → 1px ≒ 2.98cm
TILE_PX = 96                  # 本編/エディタのタイル (= displayMax)

# ── 色 (沼/坑道の水。既存アセットのトーンに寄せた暗めの青緑) ─────────────
COL_WATER = (36.0, 66.0, 74.0)      # 水面の**平均**色。AI テクスチャをここへ寄せる
COL_SHALLOW = (62.0, 92.0, 88.0)    # 岸ぎわの浅瀬 (わずかに混ぜるだけ)
COL_WATERLINE = (12.0, 22.0, 26.0)  # 水際の細い暗線
COL_WET = (34.0, 40.0, 38.0)        # 水際の濡れた泥
COL_BANK = (58.0, 52.0, 40.0)       # 乾いた岸の泥

SEED = 20260804               # 決定論の要。うねりのノイズだけがこれを使う

PIECE_NAMES = ["縦(北南)", "横(東西)", "北→東", "東→南", "南→西", "西→北"]
# 各ピースがインクを持つべき辺。検算 (--check-only) の期待値。
PIECE_EDGES = [("N", "S"), ("E", "W"), ("N", "E"), ("E", "S"), ("S", "W"), ("W", "N")]
OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}

# ── 検算のしきい値 ────────────────────────────────────────────────────────
OPAQUE = 250                  # 「不透明」とみなす α
PROBE = 60.0                  # 中点 ±PROBE に不透明画素があること
                              #   = 水面幅/2 (80) からゆらぎ (14) と余裕 (6) を引いた値
CENTER_TOL = 2.0              # 不透明帯の中心が辺の中点からずれてよい量 (px)
OPAQUE_SHOULDER = 12          # α>=OPAQUE の帯は水面より少しはみ出す。その許容幅。
                              #   α は w1 の外側で 255*(1-smooth(p)) と落ちるので
                              #   250 に達するのは w1 + 0.081*(w2-w1) 付近 = 片側最大 5px。
# ⚠⚠ 継ぎ目は **α (幾何) と RGB (絵) を分けて測る**。旧版は RGBA をまとめた max 1 つで
#    測っていたが、AI の筆致テクスチャでは **1 行ぶんの絵の変化だけで max が 79** になり、
#    しかも「ループ化を切る」負のコントロールの方が max 27 と小さくなった (実測)。
#    ＝ max は判別力を持たない。実測値 (2026-08-04):
#        現行          α max= 1 / RGB max=79 p99=17
#        ループ化なし   α max= 1 / RGB max=27 p99=19   ← α では区別できない
#        うねり非周期   α max=48 / RGB max=79 p99=22   ← α だけがはっきり反応する
SEAM_ALPHA_TOL = 6            # α の最大差。幅の食い違いは 255 として出るのでここは厳しく
SEAM_RGB_P99_TOL = 30         # 前乗算 RGB の p99 (= 絵の 1 行ぶんの変化。max は使わない)
# ⭐ s 方向のループは継ぎ目からは測れない (上表) ので **素材自身で自己校正して測る**。
#    「行511 → 行0 の差」÷「隣り合う行の差の平均」。連続していれば 1 前後。
#    実測: ループ化あり 0.93 / ループ化なし 1.76 → 1.30 で確実に分離する。
#    絵を差し替えても自己校正されるのでしきい値が陳腐化しない。
LOOP_RATIO_MAX = 1.30


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
    """(沿線 s, 横断 |d|) の格子 value noise。s 方向は周期 CELL でループ。

    ⭐ **u = |d| の関数**なので芯についてミラー対称。細粒 (2〜4 表示px) にしか
       使わないので、鏡像になっていても目では判別できない。
    """
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


def _along(rng: random.Random, s: np.ndarray, octaves) -> np.ndarray:
    """s だけの関数の合成 (-1..+1 目安)。⭐ u に依らないのでミラーに完全に無害。"""
    acc = np.zeros_like(s)
    norm = 0.0
    for cells, ratio in octaves:
        acc += ratio * (2.0 * _noise1(rng, s, cells) - 1.0)
        norm += ratio
    return acc / max(norm, 1e-9)


def _wobble(rng: random.Random, s: np.ndarray, octaves) -> np.ndarray:
    """(格子数, 振幅比) の列から ±WOBBLE_MAX に収まるうねりを合成する。

    ⚠ 高周波の octave が要る。接続辺は必ず s=0/512 なので **幅は全継ぎ目で同一**
      になり、低周波だけだと 1 タイルに 1 個の膨らみ = 数珠つなぎに見える。
    """
    acc = np.zeros_like(s)
    for cells, ratio in octaves:
        acc += (WOBBLE_MAX * ratio) * (2.0 * _noise1(rng, s, cells) - 1.0)
    return np.clip(acc, -WOBBLE_MAX, WOBBLE_MAX)


def _pebbles(rng: random.Random, s: np.ndarray, u: np.ndarray,
             w1col: np.ndarray):
    """水際に小石を散らし (石の面, 接地の暗い輪) のマスクを返す。

    ⭐ u = |d| の関数なので **両岸に対で出る** (PEBBLE_N の注を参照)。
    ⚠ s 方向は **周期 CELL の最短距離**で測るので、継ぎ目をまたぐ小石も割れない
      (石の中心が s=0 付近にあっても、前のタイルの末尾と後ろのタイルの先頭に
       ちゃんと半分ずつ出る)。
    ⚠ 石は重なりうるので **max で合成**する (加算だと重なった所だけ真っ黒になる)。
    ⚠ rng はモジュール共通。**必ず最後に引くこと** — 途中に挟むと後続の
      うねり/波紋の乱数列がずれて絵が丸ごと変わる。
    """
    core = np.zeros_like(u)
    ring = np.zeros_like(u)
    for _ in range(PEBBLE_N):
        si = rng.random() * CELL
        r = PEBBLE_R[0] + rng.random() * (PEBBLE_R[1] - PEBBLE_R[0])
        off = PEBBLE_OFFSET[0] + rng.random() * (PEBBLE_OFFSET[1] - PEBBLE_OFFSET[0])
        asp = 0.72 + rng.random() * 0.70          # 沿線方向の伸び (真円にしない)
        ui = float(w1col[int(si) % CELL]) + off   # その s での水際に乗せる
        ds = np.abs(s - si)
        ds = np.minimum(ds, CELL - ds)
        t = (ds / (r * asp)) ** 2 + ((u - ui) / r) ** 2
        core = np.maximum(core, np.clip(1.0 - t, 0.0, 1.0) ** 0.55)
        ring = np.maximum(ring, np.exp(-((np.sqrt(t) - 1.05) / 0.30) ** 2))
    return core, ring


def _lerp3(c0, c1, t: np.ndarray) -> np.ndarray:
    a = np.asarray(c0, dtype=np.float64)
    b = np.asarray(c1, dtype=np.float64)
    return a[None, None, :] + (b - a)[None, None, :] * t[:, :, None]


# ══ AI 水面テクスチャの読み込みと下ごしらえ ═══════════════════════════════
def prepare_source(raw_path: str, out_path: str = TEX_SRC_PNG) -> None:
    """生の AI PNG から commit 用の素材 tools/water_surface_src.png を焼く。

    正方形へ中央クロップ → (CELL, CELL+LOOP_FADE) へ LANCZOS リサイズ →
    **左半分 (256 列) だけ**を保存する。右半分はミラーで作るので保存しない。
    LANCZOS は決定論なので、同じ生 PNG からは常に同じバイトが出る。
    """
    im = Image.open(raw_path).convert("RGB")
    if im.width != im.height:
        side = min(im.size)
        left = (im.width - side) // 2
        top = (im.height - side) // 2
        im = im.crop((left, top, left + side, top + side))
    im = im.resize((CELL, CELL + LOOP_FADE), Image.LANCZOS)
    im = im.crop((0, 0, CELL // 2, CELL + LOOP_FADE))
    im.save(out_path, "PNG", optimize=True)
    with open(out_path, "rb") as fp:
        digest = hashlib.sha256(fp.read()).hexdigest()
    print(f"[make_water_kit] prepared {os.path.relpath(out_path, PROJ)} "
          f"{im.width}x{im.height}  sha256={digest}")
    print(f"  (生素材 {os.path.relpath(raw_path, PROJ)} は git 管理外。"
          f"上のファイルを commit すること)")


def _load_prepared() -> np.ndarray:
    """tools/water_surface_src.png を (CELL+LOOP_FADE, CELL/2, 3) float64 で返す。"""
    want = (CELL // 2, CELL + LOOP_FADE)
    if not os.path.exists(TEX_SRC_PNG):
        raise SystemExit(
            f"[make_water_kit] 水面素材が無い: {os.path.relpath(TEX_SRC_PNG, PROJ)}\n"
            f"  → py tools/make_water_kit.py "
            f"--prepare-from source_images/water_surface/01_water.png")
    im = Image.open(TEX_SRC_PNG).convert("RGB")
    if im.size != want:
        raise SystemExit(
            f"[make_water_kit] 水面素材のサイズが {im.size} で期待 {want} と違う "
            f"(--prepare-from で焼き直すこと)")
    return np.asarray(im, dtype=np.float64)


def _suppress_lowpass(arr: np.ndarray) -> np.ndarray:
    """原画の低域 (TEX_LOWPASS_PX より粗い成分) を TEX_LOWPASS_KEEP まで薄め、
    残った筆致 (高域) を TEX_GAIN 倍する。

    ⛔ これを省くと芯の折り返しで「蝶ネクタイ motif」が出て 96px ごとに反復する
       (モジュール冒頭の設計メモ③)。決定論 (縮小 → 拡大は LANCZOS/BICUBIC 固定)。
    """
    h, w = arr.shape[0], arr.shape[1]
    k = TEX_LOWPASS_PX
    im = Image.fromarray(np.clip(arr, 0.0, 255.0).astype(np.uint8), "RGB")
    small = im.resize((max(1, w // k), max(1, h // k)), Image.LANCZOS)
    lp = np.asarray(small.resize((w, h), Image.BICUBIC), dtype=np.float64)
    mean = arr.reshape(-1, 3).mean(axis=0)[None, None, :]
    # ⛔ soft-clip は必須。原画の孤立したハイライトをそのまま通すと、芯で対になって
    #    「目」型 motif になり 1 タイルごとに同じ位置へ反復する (TEX_SOFT の注を参照)。
    dev = TEX_SOFT * np.tanh((arr - lp) / TEX_SOFT)
    return mean + TEX_LOWPASS_KEEP * (lp - mean) + TEX_GAIN * dev


def _prefilter_rgb(rgb: np.ndarray) -> np.ndarray:
    """表示 Nyquist より細かい成分を落とす (見えないのに PNG の容量だけ食うため)。

    本編の表示倍率は 96/512 = 0.1875 なので、**5.3 素材px より細かい成分は
    ブラウザの縮小で平均化されて 1 ドットも見えない**。焼く前に落とすと絵は
    変わらないまま PNG が小さくなる。SCENERY_SHEETS は eager 読み込み
    (index.html の `s.img.src = s.src`) なので、既定 6 シナリオが waterKit を
    使わなくても全プレイヤーがこの PNG を落とす ＝ 容量は素直に効く。

    ⚠ **α には掛けない**。掛けると水際の立ち上がりが鈍って帯の幅が変わり、
      report_edges の実測値 (不透明幅・水路幅) が動いてしまう。
    ⚠ x 方向は畳み込みのあと (r + r[:, ::-1]) / 2 で **厳密なミラー対称へ戻す**。
      IEEE754 の加算は可換 (a+b == b+a が厳密) なので np.array_equal を必ず通る。
    """
    k = np.array([1.0, 4.0, 6.0, 4.0, 1.0]) / 16.0     # 二項フィルタ σ≈1.0
    out = rgb
    for _ in range(2):                                  # 2 回 ≒ σ1.4 ≒ 3px 相当まで落とす
        acc = np.zeros_like(out)
        for i, w in enumerate(k):                       # 沿線方向は wrap (周期 CELL)
            acc += w * np.roll(out, i - 2, axis=0)
        out = acc
        acc = np.zeros_like(out)
        for i, w in enumerate(k):                       # 横断方向は端をクランプ
            acc += w * out[:, np.clip(np.arange(CELL) + (i - 2), 0, CELL - 1), :]
        out = 0.5 * (acc + acc[:, ::-1, :])             # ★ 厳密なミラー対称へ戻す
    return out


def _verify_loop(tex: np.ndarray) -> None:
    """s 方向のループを **素材自身で自己校正して** 実測する (LOOP_RATIO_MAX を参照)。

    ⚠ 継ぎ目 (report_seams) では測れない: 絵が統計的に均質だと「ループ化なし」でも
      継ぎ目の差はほとんど増えないため (実測済み)。だから素材側で直接測る。
    """
    adj = float(np.abs(np.diff(tex, axis=0)).mean())
    wrap = float(np.abs(tex[0] - tex[CELL - 1]).mean())
    ratio = wrap / max(adj, 1e-9)
    if ratio > LOOP_RATIO_MAX:
        raise SystemExit(
            f"[make_water_kit] 素材が s 方向にループしていない "
            f"(wrap {wrap:.3f} / 隣接 {adj:.3f} = {ratio:.3f} > {LOOP_RATIO_MAX})")


def _fold_and_loop(half: np.ndarray) -> np.ndarray:
    """(CELL+LOOP_FADE, CELL/2, 3) → (CELL, CELL, 3)。

    x: 芯 (x=CELL/2) について **厳密に** ミラー (同じ float をそのまま並べるので
       _verify_source の np.array_equal を必ず通る)。
    y: 周期 CELL で完全ループ。末尾 LOOP_FADE 行 (のりしろ) を頭へクロスフェード
       するので、行 CELL-1 の次が行 0 につながる。
    """
    L = LOOP_FADE
    base = half[:CELL]                                  # (CELL, 256, 3)
    tail = half[CELL:CELL + L]                          # (L,    256, 3)
    w = (np.arange(L, dtype=np.float64) / L)[:, None, None]
    head = base[:L] * w + tail * (1.0 - w)
    left = np.concatenate([head, base[L:]], axis=0)      # (CELL, 256, 3)
    return np.ascontiguousarray(
        np.concatenate([left, left[:, ::-1, :]], axis=1))  # (CELL, CELL, 3)


# ══ 断面素材 (= まっすぐな水路 1 タイルぶん) の生成 ═══════════════════════
def build_source() -> np.ndarray:
    """(CELL, CELL, 4) float64 RGBA。列 x が横断方向、行 y が沿線方向。

    列 x の画素中心は素材座標 x+0.5、芯は素材座標 CORE_X(=256.0) なので
    d(x) = x + 0.5 - 256.0 = x - 255.5。列 x と列 511-x の d は符号だけが逆
    ＝ **列の並びは芯について厳密にミラー対称**になる (_verify_source が確認)。

    ⭐ ここが ChatGPT 素材との唯一の接点。**変換の下流** (make_straight /
       make_curve_ne / build_sheet / report_edges) は素材の作り方に一切依存しない。
    ⚠ ただし **report_seams のしきい値だけは素材の性質に依存する**。手続きノイズなら
       RGBA の max 1 つで足りたが、筆致テクスチャでは max が判別力を失った
       (SEAM_ALPHA_TOL の注に実測値)。素材を差し替えたらここは必ず再校正する。
    """
    rng = random.Random(SEED)
    tex = _fold_and_loop(_suppress_lowpass(_load_prepared()))
    _verify_loop(tex)

    yy, xx = np.mgrid[0:CELL, 0:CELL]
    s = yy + 0.5
    d = (xx + 0.5) - CORE_X
    u = np.abs(d)

    # 岸の輪郭のうねり。水面の縁と岸の外縁で **別のノイズ** を使う (完全な相似形に
    # すると「一定断面を押し出した管」に見えるため)。どちらも周期 CELL。
    w1 = WATER_HALF + _wobble(rng, s, ((5, 0.50), (13, 0.32), (29, 0.18)))
    w2 = EDGE_HALF + _wobble(rng, s, ((7, 0.48), (17, 0.34), (31, 0.18)))
    w2 = np.maximum(w2, w1 + 6.0)          # 岸が水面へ食い込まないための下限

    # AI テクスチャの平均色を COL_WATER へ寄せる。**偏差はそのまま残す** ので
    # 筆致 (低域を抜いた後の細かい濃淡) は原画のまま生き、色調だけこちらで握れる。
    tmean = tex.reshape(-1, 3).mean(axis=0)
    tex_n = (tex - tmean[None, None, :]) \
        + np.asarray(COL_WATER, dtype=np.float64)[None, None, :]
    # 岸の泥を単調な塗りにしないための明暗 (おおむね [-1, 1])。
    lum = (tex.mean(axis=2) - float(tex.mean())) / 64.0

    # 水面: **断面はほぼ平坦**。岸ぎわだけわずかに浅瀬を混ぜる。
    q = np.clip(u / w1, 0.0, 1.0)
    sh = _smooth((q - SHALLOW_FROM) / (1.0 - SHALLOW_FROM))
    water = tex_n + (np.asarray(COL_SHALLOW, dtype=np.float64) - tex_n) \
        * (SHALLOW_MIX * sh)[:, :, None]

    # ⭐ リアリズムの主役 = **s だけの明暗** (淀みは暗く深く、早瀬は明るい)。
    #    u に依らないのでミラーに完全に無害 = motif を一切作らない。
    depth = 1.0 + DEPTH_AMP * _along(rng, s, DEPTH_CELLS)
    # 手続きの細粒。原画の低域を抜いたぶんの生気をここで足す (1〜2 表示px)。
    grain = np.zeros_like(u)
    gnorm = 0.0
    for cells, ratio in GRAIN_CELLS:
        grain += ratio * (2.0 * _noise2(rng, s, u, cells, max(3, cells // 2)) - 1.0)
        gnorm += ratio
    water = water * (depth * (1.0 + GRAIN_AMP * grain / max(gnorm, 1e-9)))[:, :, None]

    # ⭐⭐ 横断方向の波紋 (チェブロン)。位相に |d|^2 を足すと等値線が左右対称の V 字に
    #     なるので、ミラーでも「V 字のまま」= 人工的に見えない (上の設計メモ参照)。
    phase = s + CHEVRON_PX * (u / WATER_HALF) ** 2
    ripple = _along(rng, phase, RIPPLE_CELLS)
    fade = 1.0 - q ** 4                                   # 岸ぎわでは波紋を消す
    water = water * (1.0 + RIPPLE_AMP * ripple * fade)[:, :, None]
    # 波頭のきらめき。V 字の頂点に乗るので鏡像でも「波に当たった光」に見える。
    crest = np.clip(ripple, 0.0, 1.0) ** 3 * fade
    water = water + (np.asarray(COL_GLINT, dtype=np.float64) - water) \
        * (GLINT_MIX * crest)[:, :, None]

    # 岸: 濡れた泥 → 乾いた泥。α は 1 → 0。
    p = np.clip((u - w1) / (w2 - w1), 0.0, 1.0)
    bank = _lerp3(COL_WET, COL_BANK, _smooth(p)) * (1.0 + 0.26 * lum)[:, :, None]

    rgb = np.where((u <= w1)[:, :, None], water, bank)

    # ⭐ 水際の細い暗線。**リアルに見えるかどうかの主役**なので水側/岸側の
    #    両方にまたがって当てる (実際の水縁は濡れて暗く落ちる)。
    line = np.exp(-(((u - w1) / WATERLINE_SIG) ** 2))
    rgb = rgb + (np.asarray(COL_WATERLINE, dtype=np.float64) - rgb) \
        * (WATERLINE_DEPTH * line)[:, :, None]

    # ⭐⭐ 水際の小石。**滑らかで一様な縁を壊す** = 残っていた「管」の読みへの直接の対処。
    #     水際の暗線の**後**に当てて石が縁の上に乗るようにする。α は触らない。
    #     ⚠ rng を引くのはここが最後 (_pebbles の注を参照)。
    p_core, p_ring = _pebbles(rng, s, u, w1[:, 0])
    rgb = rgb * (1.0 - PEBBLE_SHADE * p_ring)[:, :, None]
    p_mix = PEBBLE_MIX * np.where(u <= w1, PEBBLE_SUBMERGED, 1.0)   # 水中の石は淡く
    rgb = rgb + (np.asarray(COL_PEBBLE, dtype=np.float64) - rgb) \
        * (p_mix * p_core)[:, :, None]

    rgb = _prefilter_rgb(rgb)          # 見えない高域を落として PNG を小さくする

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
    弧長 402px を 512 に伸ばすので、水面の模様はカーブで約 21% 詰まる。
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
    op_lo = 2.0 * (WATER_HALF - WOBBLE_MAX) - 4.0                    # 132 - 4 = 128
    op_hi = 2.0 * (WATER_HALF + WOBBLE_MAX) + OPAQUE_SHOULDER        # 188 + 12 = 200
    ink_lo = 2.0 * (EDGE_HALF - WOBBLE_MAX) - 4.0                    # 192 - 4 = 188
    ink_hi = 2.0 * (EDGE_HALF + WOBBLE_MAX) + 4.0                    # 248 + 4 = 252

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
    """つながりうる全ての辺の組で、継ぎ目をまたいだ差を **α と RGB に分けて** 測る。

    ⚠⚠ α と RGB では判別力が正反対なので絶対に合算しない (SEAM_ALPHA_TOL の注を参照)。
      α  = 幾何。幅が食い違えばそのまま 255 として出るので **これが要石**。
      RGB = 絵。筆致テクスチャでは 1 行ぶんの変化だけで max が 79 まで出るので
            **max は使わず p99** で測る。
    RGB は前乗算で比べる (α が小さい領域の RGB は意味を持たないため)。
    """
    a_worst, a_txt = 0.0, "-"
    rgb_vals = []
    for i in range(NPIECE):
        for e in PIECE_EDGES[i]:
            for j in range(NPIECE):
                if OPPOSITE[e] not in PIECE_EDGES[j]:
                    continue
                pa = edge_rgba(sheet, i, e).astype(np.float64)
                pb = edge_rgba(sheet, j, OPPOSITE[e]).astype(np.float64)
                da = float(np.abs(pa[:, 3] - pb[:, 3]).max())
                if da > a_worst:
                    a_worst, a_txt = da, f"{i}{e} | {j}{OPPOSITE[e]}"
                qa = pa[:, :3] * pa[:, 3:4] / 255.0
                qb = pb[:, :3] * pb[:, 3:4] / 255.0
                rgb_vals.append(np.abs(qa - qb).ravel())
    rgb = np.concatenate(rgb_vals)
    r_p99 = float(np.percentile(rgb, 99))
    a_ok = a_worst <= SEAM_ALPHA_TOL
    r_ok = r_p99 <= SEAM_RGB_P99_TOL
    print(f"  継ぎ目 (18 接合 × 両向き) α 最大差 = {a_worst:.0f} "
          f"(最悪 {a_txt} / 許容 {SEAM_ALPHA_TOL})  {'OK' if a_ok else '*** NG'}")
    print(f"                          RGB p99 = {r_p99:.1f} "
          f"(max {rgb.max():.0f} は参考値 / 許容 {SEAM_RGB_P99_TOL})  "
          f"{'OK' if r_ok else '*** NG'}")
    return bool(a_ok and r_ok)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="つながる水路 6 ピースのシートを焼き込む")
    ap.add_argument("--out", default=OUT_PNG, help="出力 (既定 assets/water_kit.png)")
    ap.add_argument("--check-only", action="store_true",
                    help="書き込まずに接続点の実測だけ出す")
    ap.add_argument("--prepare-from", metavar="RAW_PNG",
                    help="生の AI PNG から tools/water_surface_src.png を焼き直して終了")
    args = ap.parse_args(argv)

    if args.prepare_from:
        prepare_source(args.prepare_from)
        return 0

    src = build_source()
    _verify_source(src)
    sheet = build_sheet(src)

    print(f"[make_water_kit] ハイブリッド (水面 = AI テクスチャ / 幾何 = コード) "
          f"seed={SEED}")
    print(f"  素材 {os.path.relpath(TEX_SRC_PNG, PROJ)} "
          f"(左半分 {CELL // 2}x{CELL + LOOP_FADE}・のりしろ {LOOP_FADE} 行) "
          f"低域 {TEX_LOWPASS_PX}px を {TEX_LOWPASS_KEEP} 残し筆致 x{TEX_GAIN}")
    print(f"  細粒 ±{GRAIN_AMP:.3f} / s だけの明暗 ±{DEPTH_AMP:.2f} "
          f"(どちらもミラーに無害)")
    print(f"  断面 |d|: 0..{WATER_HALF:.0f} 水面 (ほぼ平坦) / 水際に暗線 "
          f"σ={WATERLINE_SIG:.1f} 濃さ{WATERLINE_DEPTH:.2f} / "
          f"{WATER_HALF:.0f}..{EDGE_HALF:.0f} 濡れ泥→岸 (α 1→0) / "
          f"{EDGE_HALF:.0f}.. 透明   うねり ±{WOBBLE_MAX:.0f}px")
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
