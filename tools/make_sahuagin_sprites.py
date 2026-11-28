#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make_sahuagin_sprites.py — 近海の難破船 (sea-wreck) 専用のサハギン・スプライトを
既存のリザードマン・スプライトから「海の魚人」調に色変換して生成する。

⭐ なぜ色変換か:
  サハギンは 5e SRD 内のモンスターだが、本作には専用の描き下ろしが無い。
  60 分のブリッジ作業・非対話モードでは ChatGPT / Codex の描き下ろし (起草→承認が要る)
  を回せないため、既存の鱗人スプライト (= 画風が確定していて浮かない) を土台に
  「沼の緑 → 深海の青緑」へ寄せた専用アセットを手続き的に作る。
  シート幾何 (frameW/H・cols・displaySize) を一切変えないので描画はそのまま動く。

変換:
  1) 緑帯の画素だけ色相をシアン/ティールへ回す (沼の緑 → 海の青緑)。
  2) 不透明画素の全体に薄いティールのウォッシュ (15%) を掛けて水棲感を統一。
  3) 明度をわずかに落として「水中の冷たさ」を出す。
  4) α (切り抜き) はそのまま温存。
"""
import sys, os
import numpy as np
from PIL import Image

SRC_DST = [
    ("assets/lizardWarrior_anim.png",   "assets/sahuagin_anim.png"),
    ("assets/lizardChieftain_anim.png", "assets/sahuaginChieftain_anim.png"),
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def recolor(src_path, dst_path):
    im = Image.open(src_path).convert("RGBA")
    r, g, b, a = im.split()
    rgb_hsv = Image.merge("RGB", (r, g, b)).convert("HSV")
    H, S, V = [np.asarray(ch).astype(np.float32) for ch in rgb_hsv.split()]

    # --- 1) 緑帯 (H 0-255 で約 40-135 ≒ 56°-190°) を青寄りのシアン (約 140 ≒ 198°) へ回す (沼の緑 → 深海の青緑) ---
    green = (H >= 40) & (H <= 135)
    # 緑の中心 (~80) を 140 付近 (シアン〜青緑) へ集めつつ、帯の広がりは 0.30 に圧縮
    H[green] = 140.0 + (H[green] - 80.0) * 0.30
    # 青緑なので彩度を上げると「海の生き物」感が出る
    S[green] = np.clip(S[green] * 1.18, 0, 255)

    H = np.clip(H, 0, 255).astype(np.uint8)
    S = np.clip(S, 0, 255).astype(np.uint8)
    V = np.clip(V * 0.92, 0, 255).astype(np.uint8)  # 全体を少し暗く (水中)

    hsv2 = Image.merge("HSV", [Image.fromarray(ch, "L") for ch in (H, S, V)])
    out_rgb = np.asarray(hsv2.convert("RGB")).astype(np.float32)

    # --- 2) 不透明画素へティールのウォッシュ (22%) ---
    alpha = np.asarray(a).astype(np.float32) / 255.0
    teal = np.array([18.0, 96.0, 142.0], dtype=np.float32)  # 深海の青緑 (やや青寄り)
    wash = 0.22 * (alpha > 0.0)[..., None]
    out_rgb = out_rgb * (1.0 - wash) + teal[None, None, :] * wash
    out_rgb = np.clip(out_rgb, 0, 255).astype(np.uint8)

    out = np.dstack([out_rgb, np.asarray(a)])
    Image.fromarray(out, "RGBA").save(dst_path)
    # 透過・不透明画素数を報告 (背景焼き込みが無いかの目安)
    opaque = int((alpha > 0.5).sum())
    print(f"  {os.path.basename(src_path)} -> {os.path.basename(dst_path)}  size={im.size} opaque_px={opaque}")


def main():
    for src, dst in SRC_DST:
        sp = os.path.join(ROOT, src)
        dp = os.path.join(ROOT, dst)
        if not os.path.exists(sp):
            print("MISSING:", sp); sys.exit(2)
        recolor(sp, dp)
    print("done")


if __name__ == "__main__":
    main()
