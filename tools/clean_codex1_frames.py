"""codex1 の納品フレームから「浮遊ゴミ」と「マゼンタ残り」を落として -clean 派生を作る。

## なぜ要るのか (2026-09-02 実測)

codex1 の chroma-key 除去は完璧ではなく、2 種類の残骸が出ることがある。

1. **浮遊ゴミ** … 本体から切り離された数十画素の断片。町人 6 体 36 コマで **24 個**あり、
   alpha bbox を最大 **68px** 広げていた。パッカー (`pack_codex1_sprites._char_height`) は
   **bbox 高**で共通スケールを決め、`center="feet"` で bbox 下端を接地線に置くので、
   足元のゴミ 1 個で **キャラが縮んで浮く**。⚠ 見た目の面積は小さいのに幾何が壊れる。
2. **マゼンタ残り** … `#ff00ff` のクロマキーが縁に焼き残ったもの。villager 3 体で
   可視画素の **2.5〜3.4%**。⚠ **すべて alpha=255 の完全不透明**なので、
   「半透明の縁」を狙った処理では落ちない。

## なぜパッカーを直さないのか

`_load_frames` を全件で清掃すると、既に出荷済みの 44 シートの出力バイトが動きうる。
台帳は「walk 行がバイト単位で不変」を前提に組まれている (`attack_layout_scale` の項参照)。
そこで **前処理を分離**し、清掃済みフレームを `-clean` 派生フォルダへ出して台帳から指す。
`-matched` / `-aligned` と同じ、codex1 側に派生フォルダを作る既存の流儀に合わせてある。

## 使い方

    py tools/clean_codex1_frames.py --report town-keeper/town-keeper-walk-right-6-v1
    py tools/clean_codex1_frames.py town-keeper/town-keeper-walk-right-6-v1
    py tools/clean_codex1_frames.py --all-townsfolk

出力は入力と同階層の `<dirname>-clean/`。⚠ 冪等 (何度流しても同じバイトが出る)。
"""
import argparse
import glob
import os
import sys

import numpy as np
from PIL import Image

DEFAULT_CODEX1_ROOT = r"C:\Users\PC_User\Desktop\codex1\assets"

ALPHA_VISIBLE = 8       # これより大きい alpha を「見えている」とみなす
MIN_COMPONENT = 400     # これ未満の連結成分は浮遊ゴミとして落とす (全解像度の画素数)
MAGENTA_PASSES = 6      # マゼンタ画素へ周囲の色を染み込ませる回数

# 2026-09-02 に発注した町人 6 体 + それ以前から眠っていた村人 6 体
TOWNSFOLK = [
    "town-keeper/town-keeper-walk-right-6-v1",
    "town-stall/town-stall-walk-right-6-v1",
    "town-fisher/town-fisher-walk-right-6-v1",
    "town-mason/town-mason-walk-right-6-v1",
    "town-guard/town-guard-walk-right-6-v1",
    "town-commoner/town-commoner-walk-right-6-v1",
    "villager-man/villager-man-walk-right-6-v1",
    "villager-woman/villager-woman-walk-right-6-v1",
    "villager-boy/villager-boy-walk-right-6-v1",
    "villager-girl/villager-girl-walk-right-6-v1",
    "villager-old-man/villager-old-man-walk-right-6-v1",
    "villager-old-woman/villager-old-woman-walk-right-6-v1",
]


def label_components(mask):
    """4-近傍の連結成分ラベリング (行ごとの run + union-find)。scipy 非依存。

    戻り値: (labels, sizes) — labels は mask と同形の int32 (背景 0)、
    sizes は {ラベル: 画素数}。
    """
    h, w = mask.shape
    parent = [0]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    labels = np.zeros((h, w), dtype=np.int32)
    for y in range(h):
        row = mask[y]
        if not row.any():
            continue
        prev = labels[y - 1] if y > 0 else None
        x = 0
        while x < w:
            if not row[x]:
                x += 1
                continue
            x0 = x
            while x < w and row[x]:
                x += 1
            # run = [x0, x)
            above = np.unique(prev[x0:x]) if prev is not None else np.array([0])
            above = above[above > 0]
            if len(above):
                lab = int(above.min())
                for other in above[1:]:
                    union(lab, int(other))
            else:
                parent.append(len(parent))
                lab = len(parent) - 1
            labels[y, x0:x] = lab

    # ラベルの正規化 + 画素数
    flat = labels.ravel()
    nz = flat > 0
    sizes = {}
    if nz.any():
        roots = np.array([find(i) for i in range(len(parent))], dtype=np.int32)
        flat[nz] = roots[flat[nz]]
        vals, cnts = np.unique(flat[nz], return_counts=True)
        sizes = {int(v): int(c) for v, c in zip(vals, cnts)}
    return labels, sizes


def is_magenta(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 120) & (b > 120) & (g < r - 50) & (g < b - 50)


def clean_frame(im, min_component=MIN_COMPONENT, magenta_passes=MAGENTA_PASSES):
    """1 コマを清掃して (新しい RGBA, 落としたゴミ数, 直したマゼンタ画素数) を返す。"""
    a = np.array(im.convert("RGBA"))
    rgb = a[..., :3].astype(np.int16)
    al = a[..., 3]

    # --- 1. 浮遊ゴミ: 最大成分から切り離された小さい塊を透明にする ---
    mask = al > ALPHA_VISIBLE
    labels, sizes = label_components(mask)
    dropped = 0
    if sizes:
        keep = {lab for lab, n in sizes.items() if n >= min_component}
        if not keep:                       # 全部が閾値未満なら最大だけ残す
            keep = {max(sizes, key=sizes.get)}
        drop_labels = [lab for lab in sizes if lab not in keep]
        dropped = len(drop_labels)
        if drop_labels:
            bad = np.isin(labels, drop_labels)
            al = np.where(bad, 0, al).astype(np.uint8)
            rgb = np.where(bad[..., None], 0, rgb)

    # --- 2. マゼンタ残り: 周囲の非マゼンタ色を染み込ませる (alpha は動かさない) ---
    vis = al > ALPHA_VISIBLE
    bad = vis & is_magenta(rgb)
    fixed = int(bad.sum())
    for _ in range(magenta_passes):
        if not bad.any():
            break
        good = vis & ~bad
        acc = np.zeros(rgb.shape, dtype=np.int32)
        cnt = np.zeros(al.shape, dtype=np.int32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1),
                       (1, 1), (1, -1), (-1, 1), (-1, -1)):
            g = np.roll(np.roll(good, dy, axis=0), dx, axis=1)
            c = np.roll(np.roll(rgb, dy, axis=0), dx, axis=1)
            acc += np.where(g[..., None], c, 0)
            cnt += g.astype(np.int32)
        fillable = bad & (cnt > 0)
        if not fillable.any():
            break
        rgb = np.where(fillable[..., None], acc // np.maximum(cnt, 1)[..., None], rgb)
        bad = bad & ~fillable

    out = np.dstack([rgb.astype(np.uint8), al]).astype(np.uint8)
    return Image.fromarray(out, "RGBA"), dropped, fixed


def frames_of(d):
    return sorted(glob.glob(os.path.join(d, "*frame-*.png")))


def process(rel, root, report_only, min_component, magenta_passes):
    src = rel if os.path.isabs(rel) else os.path.join(root, rel)
    fs = frames_of(src)
    if not fs:
        print("  ! frames not found under %s" % src, file=sys.stderr)
        return False
    dst = src.rstrip("/\\") + "-clean"
    if not report_only:
        os.makedirs(dst, exist_ok=True)
    tot_drop = tot_fix = 0
    shrink = 0
    for f in fs:
        im = Image.open(f).convert("RGBA")
        before = im.split()[3].point(lambda p: 255 if p > ALPHA_VISIBLE else 0).getbbox()
        cleaned, dropped, fixed = clean_frame(im, min_component, magenta_passes)
        after = cleaned.split()[3].point(lambda p: 255 if p > ALPHA_VISIBLE else 0).getbbox()
        if before and after:
            shrink = max(shrink,
                         max(after[0] - before[0], after[1] - before[1],
                             before[2] - after[2], before[3] - after[3]))
        tot_drop += dropped
        tot_fix += fixed
        if not report_only:
            cleaned.save(os.path.join(dst, os.path.basename(f)))
    print("  %-52s specks=%2d  magenta_px=%6d  bbox 縮み最大 %3dpx%s"
          % (os.path.basename(src), tot_drop, tot_fix, shrink,
             "" if report_only else "  -> " + os.path.basename(dst)))
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dirs", nargs="*", help="codex1 ルートからの相対パス (絶対でも可)")
    ap.add_argument("--all-townsfolk", action="store_true", help="町人 12 セットを一括で")
    ap.add_argument("--codex1-root", default=DEFAULT_CODEX1_ROOT)
    ap.add_argument("--report", action="store_true", help="測るだけで書き出さない")
    ap.add_argument("--min-component", type=int, default=MIN_COMPONENT)
    ap.add_argument("--magenta-passes", type=int, default=MAGENTA_PASSES)
    args = ap.parse_args()

    targets = list(args.dirs)
    if args.all_townsfolk:
        targets = TOWNSFOLK + targets
    if not targets:
        ap.error("ディレクトリか --all-townsfolk が要ります")

    print("clean_codex1_frames: min_component=%d magenta_passes=%d%s"
          % (args.min_component, args.magenta_passes, "  [REPORT ONLY]" if args.report else ""))
    ng = 0
    for rel in targets:
        if not process(rel, args.codex1_root, args.report,
                       args.min_component, args.magenta_passes):
            ng += 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
