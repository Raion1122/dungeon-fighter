#!/usr/bin/env python3
"""スプライトシート分身(スミア)候補チェッカー — 恒久検証ツール。

各 assets/*_anim.png のタイルを解析し、1タイルに複数キャラが写り込む
「分身/スミア」(抽出時の隣接フレーム flood 巻き込みが主因)の **候補** を
機械検出する。スプライトを生成/再抽出したら **必ず** 本ツールを走らせ、
候補が出たら **目視で確認** し、本物の分身なら該当 source_images/*/_extract.py に
「隣接フレーム中点クランプ」等を入れて再抽出→クリーンになるまで直すこと。

⚠ 重要: cluster>=2 は「本物の分身(2つの同大の体断片)」だけでなく、
  尾のカール / 翼 / 触手 / 突き出した武器 / 火炎などの VFX / 2 種混載シート
  (例 rat_bat)でも高頻度に立つ = **候補≠バグ**。必ず目視で
  「2 つの同大の“体”が写っている」場合のみ分身と判定する。2nd クラスタが
  細い(=付属物・武器・VFX)なら正常。本ツールは 2nd クラスタ幅も出力し、
  `body?`(2nd >= 0.35×最大 = 体断片が疑わしい)/ `thin?`(細い付属物) の
  ヒントを付ける。

グリッド判定: 既定 rows=5・正方セル(cell=H//rows)・cols=W//cell。
  標準 anim シート = 576×480(96px/6列) と 1152×960(192px/6列)に一致。
  H%rows≠0 や W%cell≠0 の非標準サイズは「非対応・skip」(--cell/--rows で明示可)。

判定(胴体帯 = セル高 35–72% の不透明幅 width とクラスタ):
  候補(CAND):
    - clusters >= 2       … 1タイルに離れた塊が複数(付属物/VFX/多体でも立つ)
    - width > 0.90*cell   … 全幅スミア(基準非依存・分身の可能性高)
  参考(WARN):
    - width > 1.55*median … 行内で突出(ワイドな単一ポーズで誤検知しうる)

exit code: CAND が1つでもあれば 1(要目視)、無ければ 0。**exit 1 = バグ確定ではない**。

使い方:
  py tools/check_sprite_doubling.py assets/direBear_anim.png
  py tools/check_sprite_doubling.py assets/*_anim.png
  py tools/check_sprite_doubling.py --cell 96 --rows 5 assets/foo.png
"""
import argparse
import glob
import os
import sys

import numpy as np
from PIL import Image

# cp932 コンソールでも日本語/絵文字を出せるよう UTF-8 化(出力失敗での誤 exit を防ぐ)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

BAND_LO, BAND_HI = 0.35, 0.72   # 胴体帯(頭/足を避けた中央帯)
PRESENT_FRAC = 0.06             # 帯高の 6% 以上を占める列を「身体あり」とみなす
GAP = 8                         # クラスタ分割ギャップ(px)
BLOCK_CELL_FRAC = 0.90          # 幅 > 0.90*cell = 全幅スミア
WARN_MED_MULT = 1.55            # 幅 > 1.55*median = 行内突出(参考)
BODY_2ND_FRAC = 0.35            # 2nd クラスタ >= 0.35×最大 なら「体断片が疑わしい」


def band_clusters(cell_alpha, cell):
    """胴体帯の (総幅, クラスタ数, 2ndクラスタ幅) を返す。"""
    lo, hi = int(cell * BAND_LO), int(cell * BAND_HI)
    band = cell_alpha[lo:hi, :] > 128
    if band.shape[0] == 0:
        return 0, 0, 0
    colcount = band.sum(axis=0)
    present = colcount > (band.shape[0] * PRESENT_FRAC)
    xs = np.where(present)[0]
    if len(xs) == 0:
        return 0, 0, 0
    total_width = int(xs.max() - xs.min() + 1)
    spans = []
    s = prev = xs[0]
    for x in xs[1:]:
        if x - prev >= GAP:
            spans.append((s, prev))
            s = x
        prev = x
    spans.append((s, prev))
    widths = sorted((e - b + 1 for b, e in spans), reverse=True)
    second = widths[1] if len(widths) >= 2 else 0
    return total_width, len(widths), int(second)


def check_sheet(path, rows, cell_override):
    """1 シートを解析。非対応レイアウトは None を返す。"""
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    if cell_override:
        cell = cell_override
    elif H % rows == 0:
        cell = H // rows
    else:
        return None
    if cell <= 0 or W % cell != 0 or H % cell != 0:
        return None
    cols = W // cell
    r = H // cell
    alpha = np.array(im)[:, :, 3]

    stats = {}
    for rr in range(r):
        for c in range(cols):
            ca = alpha[rr * cell:(rr + 1) * cell, c * cell:(c + 1) * cell]
            stats[(rr, c)] = band_clusters(ca, cell)

    widths = [w for (w, _, _) in stats.values() if w > 0]
    median = int(np.median(widths)) if widths else 0

    flags = []  # (rr, c, width, clusters, second, kind, hint)
    for (rr, c), (w, cl, second) in stats.items():
        kind = hint = None
        if cl >= 2:
            kind = "CAND:clusters"
            largest = w if second == 0 else max(w - second, second)  # 目安
            hint = "body?" if second >= largest * BODY_2ND_FRAC else "thin?"
        elif w > cell * BLOCK_CELL_FRAC:
            kind, hint = "CAND:full-smear", "body?"
        elif median and w > median * WARN_MED_MULT:
            kind, hint = "WARN:wide-pose", "wide?"
        if kind:
            flags.append((rr, c, w, cl, second, kind, hint))
    return dict(W=W, H=H, cell=cell, rows=r, cols=cols, median=median, flags=flags)


def main():
    ap = argparse.ArgumentParser(description="スプライトシート分身候補チェッカー")
    ap.add_argument("paths", nargs="+", help="assets/*_anim.png 等(glob 可)")
    ap.add_argument("--rows", type=int, default=5, help="行数(既定 5)")
    ap.add_argument("--cell", type=int, default=0, help="正方セル px を明示(0=H//rows で自動)")
    ap.add_argument("--quiet", action="store_true", help="clean シートは出力しない")
    a = ap.parse_args()

    files = []
    for p in a.paths:
        g = sorted(glob.glob(p))
        files.extend(g if g else [p])

    any_cand = False
    skipped = []
    checked = 0
    for path in files:
        if not os.path.exists(path):
            print(f"  ?? {path}: not found")
            continue
        res = check_sheet(path, a.rows, a.cell)
        if res is None:
            skipped.append(path)
            continue
        checked += 1
        cands = [f for f in res["flags"] if f[5].startswith("CAND")]
        warns = [f for f in res["flags"] if f[5].startswith("WARN")]
        if cands:
            any_cand = True
        if cands or warns:
            mark = "❓" if cands else "⚠"
            print(f"  {mark} {os.path.basename(path)} "
                  f"({res['cols']}x{res['rows']} cell{res['cell']} med{res['median']}):")
            for rr, c, w, cl, second, kind, hint in sorted(res["flags"]):
                extra = f" 2nd={second}" if cl >= 2 else ""
                print(f"      row{rr} col{c}: w={w} clusters={cl}{extra}  [{kind} {hint}]")
        elif not a.quiet:
            print(f"  ✅ {os.path.basename(path)} "
                  f"({res['cols']}x{res['rows']} cell{res['cell']}): clean")

    print("-" * 60)
    print(f"checked={checked}  candidate-sheets={'YES(要目視)' if any_cand else 'none'}  "
          f"skipped(non-standard layout)={len(skipped)}")
    for s in skipped:
        print(f"    skip: {os.path.basename(s)} (pass --cell/--rows)")
    print("※ 候補=要目視。2つの同大の“体”なら分身→_extract.pyに中点クランプ。"
          "細い2nd(尾/翼/触手/武器/VFX)や多体シートは正常。")
    sys.exit(1 if any_cand else 0)


if __name__ == "__main__":
    main()
