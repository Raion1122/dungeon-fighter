#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""make_door_sheet.py — codex1 の扉シートから assets/door_sheet.png を作る。

やることは 1 つだけ: **焼き込まれた背景を透過に戻す**。

━━ なぜ要るか (2026-08-16) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
codex1 納品の closed / locked セルには **不透明な白い矩形**が扉の背後に残っていた
(実測 362x141 = 51,040 画素ちょうど = 充填率 99.996%)。そのまま貼るとゲーム内で
閉じた扉の周りに白い枠が出る。open / broken セルは白が無いので素通しになる。

⚠ 依頼文では「背景が完全に透過していること」を明示要求していたが、納品側の自己検算
   (四隅の alpha が 0) では**四隅が矩形の外なので通ってしまう**。受け取り側で必ず剥がす。
   検出は tools/check_alpha_bg_residue.py (充填率で見る)。

━━ 剥がし方 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
セルの**外周から flood fill** し、「すでに透明」か「明るい無彩色」の画素だけを辿って
alpha=0 にする。

⚠⚠ **「明るい無彩色を一律に透過」ではいけない。** 扉の内部にも鉄の鋲のハイライトなど
   明るい画素があり、一律だと穴が開く。外周から到達できるものだけを背景とみなす。
   (CLAUDE.md の make_alpha_from_checker_bg が四隅 floodfill を使うのと同じ理由。)
⚠ 白の上に描かれた絵なので、境界 1px は白と混ざったまま残る。384px で 1px = 表示 96px では
   0.25px なので詰めない (無理に削ると輪郭が痩せてギザギザになる)。

    py tools/make_door_sheet.py                     # 既定の入出力で作る
    py tools/make_door_sheet.py --dry-run           # 書かずに数字だけ出す
"""
import argparse
import os
import sys
from collections import deque

try:
    import numpy as np
    from PIL import Image
except ImportError as e:                                    # pragma: no cover
    sys.stderr.write("[door] Pillow / numpy が要ります: %s\n" % e)
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Users\PC_User\Desktop\codex1\assets\door\door-topdown-sheet.png"
DST = os.path.join(ROOT, "assets", "door_sheet.png")
COLS = 4
NAMES = ["closed", "locked", "open", "broken"]

# 背景とみなす色。⚠ 実測: 白い矩形は RGB(254,254,254) の無彩色だった。
BG_MIN = 200        # 3 チャンネルの最小値がこれ以上
BG_CHROMA = 30      # max-min がこれ以下 (無彩色)
ALPHA_ON = 16


def strip_bg(cell):
    """1 セルの背景を外周 flood fill で透過にする。戻り値 = (新しいセル, 消した画素数)。"""
    h, w = cell.shape[:2]
    rgb = cell[:, :, :3].astype(int)
    alpha = cell[:, :, 3]
    mn, mx = rgb.min(axis=2), rgb.max(axis=2)
    passable = (alpha <= ALPHA_ON) | ((mn >= BG_MIN) & ((mx - mn) <= BG_CHROMA))

    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))

    out = cell.copy()
    killed = int((seen & (alpha > ALPHA_ON)).sum())
    out[seen, 3] = 0
    return out, killed


def stats(cell):
    a = cell[:, :, 3]
    op = a > ALPHA_ON
    n = int(op.sum())
    if n == 0:
        return "空"
    ys, xs = np.nonzero(op)
    h = int(ys.max() - ys.min() + 1)
    w = int(xs.max() - xs.min() + 1)
    return "bbox %dx%d / 不透明 %d / 充填率 %.4f" % (w, h, n, n / float(w * h))


def main():
    ap = argparse.ArgumentParser(description="codex1 の扉シートの背景を剥がして assets へ")
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--dst", default=DST)
    ap.add_argument("--dry-run", action="store_true", help="書かずに数字だけ出す")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.stderr.write("[door] 入力がありません: %s\n" % args.src)
        return 2
    a = np.array(Image.open(args.src).convert("RGBA"))
    if a.shape[1] % COLS:
        sys.stderr.write("[door] 幅 %d が %d セルで割り切れません\n" % (a.shape[1], COLS))
        return 2
    cw = a.shape[1] // COLS
    print("[door] 入力 %s  %dx%d (%d セル)" % (args.src, a.shape[1], a.shape[0], COLS))

    out = a.copy()
    total = 0
    for i, name in enumerate(NAMES):
        cell = a[:, i * cw:(i + 1) * cw]
        new, killed = strip_bg(cell)
        out[:, i * cw:(i + 1) * cw] = new
        total += killed
        print("  %-7s 剥がした %6d 画素" % (name, killed))
        print("          before: %s" % stats(cell))
        print("          after : %s" % stats(new))

    print("[door] 合計 %d 画素を透過にしました" % total)
    if args.dry_run:
        print("[door] --dry-run のため書き込みません")
        return 0
    Image.fromarray(out).save(args.dst)
    print("[door] 出力 %s" % args.dst)
    print("[door] 次: py tools/check_alpha_bg_residue.py assets/door_sheet.png --cols 4")
    return 0


if __name__ == "__main__":
    sys.exit(main())
