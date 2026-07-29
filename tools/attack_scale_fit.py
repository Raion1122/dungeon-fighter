#!/usr/bin/env python3
"""walk と attack の「体高」を揃えるための共有ヘルパー (source_images/*/_extract.py 用)。

■ 何のためのモジュールか
  `_extract.py` は素材 PNG から fs (= 元画像ピクセル単位の正方クロップ辺長) を決め、
  そのクロップを OUT_CELL へ縮小する。したがって

      出力上のキャラ体高  ∝  OUT_CELL / fs

  walk と attack で fs を共有しても、**素材そのものの「寄り(ズーム)」が違う**と
  出力体高はズレたままになる (実測: fs 共有済みの 6 シートが -22%〜+6% 残っていた)。
  本モジュールは **attack 側の fs だけ**を反復調整して walk の体高中央値に合わせる。

■ 不変条件 (壊すと当たり判定と絵の対応が崩れる)
  - walk 側は一切触らない。呼び出し側は walk のフレーム (または体高中央値) を
    「動かせない基準」として渡すだけ。
  - 体高の物差しは tools/check_attack_scale.py の cell_metrics を **import して共有**する。
    物差しを複製すると「直したのに WARN が消えない」が起きる。
  - fs を変えても出力上の足元位置は動かない:
      feet_out = (fs - round(fs*0.05)) / fs * OUT_CELL ≒ 0.95 * OUT_CELL   (fs 非依存)
    つまり本補正は純粋にスケールだけを動かし、立ち位置には触れない。

■ 使い方 (_extract.py 側)
    import sys, os
    sys.path.insert(0, os.path.join(BASE, "..", "..", "tools"))
    from attack_scale_fit import fit_attack_fs

    walk_frames = extract_frames(walk_path, N, ..., fs_override=shared_fs)
    attack_frames, atk_fs, d = fit_attack_fs(
        walk_frames,
        lambda fs: extract_frames(attack_path, N, ..., fs_override=fs),
        shared_fs, label="chimera")
"""
import os
import sys

import numpy as np

# tools/ を import パスへ (どの cwd から _extract.py を叩かれても動くように)
_TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
if _TOOLS_DIR not in sys.path:
    sys.path.insert(0, _TOOLS_DIR)

# 物差しは検証ツールと同一のものを共有する (複製厳禁)
from check_attack_scale import cell_metrics  # noqa: E402

DEFAULT_TOL_PCT = 1.0     # これ以下の |delta| で収束とみなす (体感閾値 5〜6% に対し十分小さい)
DEFAULT_MAX_ITER = 6
MIN_FS = 16               # 安全下限 (これ以下に縮めると素材の情報が壊れる)


def _alpha_of(img):
    return np.array(img.convert("RGBA"))[:, :, 3]


def median_body_height(frames):
    """セル画像リストの bodyH 中央値。完全透明セルは除外。frames が空/全透明なら 0.0。"""
    vals = []
    for im in frames or []:
        m = cell_metrics(_alpha_of(im))
        if m:
            vals.append(m["bodyH"])
    return float(np.median(vals)) if vals else 0.0


def edge_touch_report(frames, alpha_threshold=64):
    """フレーム群のうち、不透明画素がセルの上端/左端/右端に接している枚数を数える。

    fs を縮める (= 寄る) 補正では原理的に見切れが起こり得るので、その検出用。
    戻り値: dict(top=int, left=int, right=int, n=int)
    """
    top = left = right = 0
    n = 0
    for im in frames or []:
        a = _alpha_of(im) > alpha_threshold
        if not a.any():
            continue
        n += 1
        if a[0, :].any():
            top += 1
        if a[:, 0].any():
            left += 1
        if a[:, -1].any():
            right += 1
    return dict(top=top, left=left, right=right, n=n)


def fit_attack_fs(walk_ref, make_attack, fs_start, *, tol_pct=DEFAULT_TOL_PCT,
                  max_iter=DEFAULT_MAX_ITER, label="attack", min_fs=MIN_FS, verbose=True):
    """attack の fs を反復調整し、walk の体高中央値に合わせたフレーム群を返す。

    walk_ref   : walk のセル画像リスト、または walk の bodyH 中央値 (float)
    make_attack: fs -> attack セル画像リスト を返す callable
    fs_start   : 初期 fs (従来どおりのロジックで決めた値)

    戻り値: (frames, fs, delta_pct)
      delta_pct = (attack体高 - walk体高) / walk体高 * 100

    出力上のスケールは OUT_CELL/fs なので、attack を k 倍したければ fs を 1/k 倍する。
    そのため更新式は  fs <- fs * (attack体高 / walk体高)  になる。
    """
    target = walk_ref if isinstance(walk_ref, (int, float)) else median_body_height(walk_ref)
    if not target:
        # walk の基準が取れないなら従来挙動 (fs_start) をそのまま使う
        frames = make_attack(fs_start)
        if verbose:
            print(f"  [fit:{label}] walk 基準が取得できないため fs={fs_start} を据え置き")
        return frames, fs_start, 0.0

    fs = int(fs_start)
    best = None  # (abs_delta, frames, fs, delta)
    for it in range(max_iter):
        frames = make_attack(fs)
        atk = median_body_height(frames)
        if not atk:
            if verbose:
                print(f"  [fit:{label}] attack が全透明 (fs={fs}) — 打ち切り")
            return frames, fs, 0.0
        delta = (atk - target) / target * 100.0
        if best is None or abs(delta) < best[0]:
            best = (abs(delta), frames, fs, delta)
        if verbose:
            print(f"  [fit:{label}] iter{it}: fs={fs} bodyH walk={target:.1f} "
                  f"attack={atk:.1f} delta={delta:+.2f}%")
        if abs(delta) <= tol_pct:
            break
        new_fs = max(min_fs, int(round(fs * atk / target)))
        if new_fs == fs:
            break  # 整数丸めで動かない = 収束限界
        fs = new_fs

    _, frames, fs, delta = best
    if verbose:
        et = edge_touch_report(frames)
        print(f"  [fit:{label}] 採用 fs={fs} delta={delta:+.2f}%  "
              f"(edge touch top={et['top']}/{et['n']} left={et['left']} right={et['right']})")
    return frames, fs, delta


if __name__ == "__main__":  # 単体では何もしない (import 専用モジュール)
    print(__doc__)
