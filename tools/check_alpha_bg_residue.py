#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""check_alpha_bg_residue.py — 透過 PNG に「背景が焼き込まれたまま」の素材を見つける。

━━ なぜ要るか (2026-08-16 扉スプライトの実害) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
codex1 納品の `door-topdown-closed.png` / `-locked.png` には **不透明な白い背景矩形**が
焼き込まれたまま入っており、ゲーム内で閉じた扉の周りに白い枠が出た。依頼文では
「背景が完全に透過していること」を明示的に要求していたのに、受け取り側の検査は
**1 つも気づけなかった**:

  中央帯が埋まっているか  → 白い矩形が埋めるので OK で通る
  外周 8px に不透明画素   → 矩形は内側から始まるので OK で通る
  四隅の alpha が 0       → 四隅は矩形の外なので OK で通る
  半透明画素の割合        → 白の**内側は alpha=255** なので半透明として数えられず OK で通る

⭐⭐⭐ 証拠は最初から出力に出ていた: **不透明画素 51,040 に対し bbox が 362x141 = 51,042**
= **充填率 99.996%**。蝶番が突き出し板の端が丸い扉のシルエットが、自分の bbox を
埋め切ることは原理的にありえない (open は 73% / broken は 62%)。
→ **「切り抜き素材なのに bbox を埋めている」= 背景が残っている**、が唯一の直接的な検出器。

⚠ 「白いか」で判定しないこと。背景が黒/灰/テーマ色のこともあり、白で絞ると次の 1 件を逃す。
   色は補助情報として出すだけで、**判定は充填率で行う**。

━━ 使い方 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    py tools/check_alpha_bg_residue.py                 # assets/*.png を全部見る
    py tools/check_alpha_bg_residue.py assets/door_sheet.png --cols 4
    py tools/check_alpha_bg_residue.py --thresh 0.985 --verbose

終了コード: 0 = 検出なし / 1 = 検出あり / 2 = 環境不足 (Pillow, numpy)
"""
import argparse
import glob
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError as e:                                    # pragma: no cover
    sys.stderr.write("[bgres] Pillow / numpy が要ります: %s\n" % e)
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "tools", "codex1_sprites.json")

# 判定の閾値。⚠ 実測で決めた値であって好みではない。
FILL_THRESH = 0.98      # 切り抜き素材の不透明画素が bbox を埋める率がこれ以上なら背景が残っている
MIN_OPAQUE = 400        # これ未満の小片は形が単純すぎて充填率が当てにならないので見ない
ALPHA_ON = 16           # 「不透明」とみなす alpha の下限 (他の check_*.py と揃える)


def cols_from_ledger():
    """台帳から {assets/xxx.png: cols} を作る。⚠ 無くても動く (cols=1 として扱う)。"""
    out = {}
    try:
        with open(LEDGER, encoding="utf-8") as f:
            for s in json.load(f).get("sheets", []):
                for key in ("out", "attack_out"):
                    p = s.get(key)
                    if p and s.get("cols"):
                        out[p.replace("\\", "/")] = int(s["cols"])
    except Exception:
        pass
    return out


def describe_bg(rgb, mask):
    """背景とおぼしき画素の色を一言で。⚠ **判定には使わない** (色は素材ごとに違う)。"""
    if not mask.any():
        return ""
    px = rgb[mask]
    mean = px.mean(axis=0)
    chroma = float((px.max(axis=1) - px.min(axis=1)).mean())
    tone = "無彩色" if chroma <= 20 else "有彩色"
    return " 平均RGB=(%d,%d,%d) %s" % (mean[0], mean[1], mean[2], tone)


def check_cell(a, label, thresh):
    """1 セルを見る。戻り値 = (ng, 一行の説明)。"""
    alpha = a[:, :, 3]
    opaque = alpha > ALPHA_ON
    n_op = int(opaque.sum())
    n_clear = int((alpha == 0).sum())
    if n_op < MIN_OPAQUE:
        return False, "%s  skip (不透明 %d < %d)" % (label, n_op, MIN_OPAQUE)
    if n_clear == 0:
        # 透明画素が 1 つも無い = そもそも切り抜き素材ではない (床/壁テクスチャ・部屋絵)
        return False, "%s  skip (完全不透明 = 切り抜き素材ではない)" % label
    ys, xs = np.nonzero(opaque)
    h = int(ys.max() - ys.min() + 1)
    w = int(xs.max() - xs.min() + 1)
    fill = n_op / float(w * h)
    ng = fill >= thresh
    note = ""
    if ng:
        # 「外周 1 列が同じ色で一周しているか」= 矩形背景の典型。補助情報として出す。
        box = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        edge = np.zeros(box.shape[:2], dtype=bool)
        edge[0, :] = edge[-1, :] = True
        edge[:, 0] = edge[:, -1] = True
        note = describe_bg(box[:, :, :3].astype(int), edge & (box[:, :, 3] > ALPHA_ON))
    line = "%s  bbox %dx%d / 不透明 %d = 充填率 %.4f%s" % (label, w, h, n_op, fill, note)
    return ng, line


def main():
    ap = argparse.ArgumentParser(
        description="透過 PNG に背景が焼き込まれていないかを充填率で見る")
    ap.add_argument("paths", nargs="*", help="対象 PNG (省略時 assets/*.png)")
    ap.add_argument("--cols", type=int, default=None,
                    help="横に N 分割してセルごとに見る (省略時は台帳 / 1)")
    ap.add_argument("--thresh", type=float, default=FILL_THRESH,
                    help="充填率がこれ以上なら背景残りとみなす (既定 %.2f)" % FILL_THRESH)
    ap.add_argument("--verbose", action="store_true", help="合格したものも全部出す")
    args = ap.parse_args()

    ledger = cols_from_ledger()
    paths = args.paths or sorted(glob.glob(os.path.join(ROOT, "assets", "*.png")))
    if not paths:
        sys.stderr.write("[bgres] 対象がありません\n")
        return 2

    bad, seen = [], 0
    for p in paths:
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        try:
            im = Image.open(p).convert("RGBA")
        except Exception as e:
            print("  ?? %s  読めません (%s)" % (rel, e))
            continue
        a = np.array(im)
        cols = args.cols or ledger.get(rel, 1)
        if cols > 1 and a.shape[1] % cols:
            print("  ?? %s  幅 %d が cols=%d で割り切れません -> 1 枚として見ます"
                  % (rel, a.shape[1], cols))
            cols = 1
        cw = a.shape[1] // cols
        for i in range(cols):
            seen += 1
            label = rel if cols == 1 else "%s [cell %d/%d]" % (rel, i + 1, cols)
            ng, line = check_cell(a[:, i * cw:(i + 1) * cw], label, args.thresh)
            if ng:
                bad.append(line)
                print("  NG %s" % line)
            elif args.verbose:
                print("  ok %s" % line)

    print("")
    print("[bgres] %d セルを検査 / 背景残りの疑い %d 件 (閾値 %.3f)"
          % (seen, len(bad), args.thresh))
    if bad:
        # ⚠ 出力に非 ASCII 記号を混ぜないこと。Windows の cp932 コンソールでは
        #   U+26A0 等が UnicodeEncodeError で落ち、検出したのに終了コードを返せなくなる。
        print("[bgres] !! 切り抜き素材なのに不透明画素が自分の bbox をほぼ埋めています。")
        print("[bgres]    背景が焼き込まれたままの可能性が高いので、暗い床の上へ合成して目視してください。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
