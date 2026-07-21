#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""闇市の依頼札 STEP2 — 討伐対象の挿絵を「札に貼る紙片」へ焼き込むビルド。

  source_images/quest_foe_art/<NN>_<familyId>.png  (ChatGPT 生成の正方形ペン画 約 1254px)
    → assets/quest_foe_<familyId>.jpg              (5:4 の横長・グレースケール JPEG)

⚠ 正方形を横長にするので【クロップではなくパディング】する。5:4 (1.25) は 1:1 より横に
   広いので、左右へ紙色を足せば絵は 1px も失われない。逆に高さを削るクロップにすると
   立ち姿 (熊・グリフォン・オーク) の頭と足から先に消える。

⚠ 生成ごとに原画の余白量がばらつく (胸像の 04 と全身の 11 では被写体の占有率が倍違う)。
   そのまま並べると札ごとに絵の大きさが揃わないので、【インクの外接矩形で切り詰めてから
   一定率の余白を足し直す】= 被写体基準で正規化する。

⚠ 余白は【純白】= 原画の紙と同じ色にする。札側の CSS が sepia+brightness で帯ごと古紙色へ
   落とすので、余白と原画の地が同色でないと継ぎ目が出る。

⚠ グレースケール (mode="L") で出す。原画は白黒ペン画で色情報を持たないため、カラー JPEG は
   クロマ成分に純粋な無駄を払うだけになる。

sovereign-eye (単眼の暴君) は表に載せない。掲示板がボスの正体を伏せる仕様なので、
挿絵そのものを持たせない判断 (2026-07-22)。
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が要る: py -m pip install Pillow")

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "source_images" / "quest_foe_art"
OUT_DIR = ROOT / "assets"

# (familyId, 原画ファイル名)。familyId は tavern.html の FAMILIES[].id と一致させる。
# 連番は生成順で、03 = sovereign-eye が欠番なのは上記のとおり意図的。
ENTRIES = [
    ("goblin",         "01_goblin.png"),
    ("caravan-escort", "02_caravan-escort.png"),
    ("bandit",         "04_bandit.png"),
    ("lizard",         "05_lizard.png"),
    ("orc-undead",     "06_orc-undead.png"),
    ("chimera-beast",  "07_chimera-beast.png"),
    ("griffon-aerie",  "08_griffon-aerie.png"),
    ("umber-delve",    "09_umber-delve.png"),
    ("ruin-beasts",    "10_ruin-beasts.png"),
    ("frontier-beast", "11_frontier-beast.png"),
]

ASPECT_W, ASPECT_H = 5, 4
INK_THRESHOLD = 245   # これより暗い画素をインクとみなす (原画の地は 250 以上)
MARGIN_RATIO = 0.05   # 切り詰めた後に足し直す余白 (帯の高さに対する比)


def build_one(src: Path, dst: Path, width: int, quality: int) -> int:
    img = Image.open(src).convert("L")

    # インクの外接矩形で切り詰める (原画ごとにばらつく余白を捨てて被写体基準に揃える)
    ink = img.point(lambda v: 255 if v < INK_THRESHOLD else 0)
    bbox = ink.getbbox()
    if bbox:
        img = img.crop(bbox)

    height = round(width * ASPECT_H / ASPECT_W)
    margin = round(height * MARGIN_RATIO)
    fit_w, fit_h = width - margin * 2, height - margin * 2
    scale = min(fit_w / img.width, fit_h / img.height)
    img = img.resize((max(1, round(img.width * scale)),
                      max(1, round(img.height * scale))), Image.LANCZOS)

    canvas = Image.new("L", (width, height), 255)
    canvas.paste(img, ((width - img.width) // 2, (height - img.height) // 2))
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
    return dst.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser(description="依頼札の討伐対象イラストを assets へ焼き込む")
    # 既定 512x410 / q82 = 10 枚で約 460KB。札の内寸は iPhone 縦持ちで約 263px なので約 2 倍。
    #   実測: 640/q82=714KB, 640/q70=577KB, 512/q82=460KB, 512/q76=407KB。
    #   闇市は plaza_bg.png (2.19MB) を既に抱えているため、幅を削る方が品質を削るより効いた
    #   (クロスハッチングは JPEG のリンギングを誘うので品質側は落としすぎない)。
    ap.add_argument("--width", type=int, default=512, help="出力幅 px (既定 512 / 高さは 5:4)")
    ap.add_argument("--quality", type=int, default=82, help="JPEG 品質 (既定 82)")
    args = ap.parse_args()

    total, missing = 0, []
    for family_id, src_name in ENTRIES:
        src = SRC_DIR / src_name
        if not src.exists():
            missing.append(src_name)
            continue
        dst = OUT_DIR / f"quest_foe_{family_id}.jpg"
        size = build_one(src, dst, args.width, args.quality)
        total += size
        print(f"  {dst.name:34s} {size/1024:7.1f} KB")

    print(f"合計 {total/1024:.1f} KB / {len(ENTRIES) - len(missing)} 枚")
    if missing:
        print("原画が無い: " + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
