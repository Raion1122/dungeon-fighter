# -*- coding: utf-8 -*-
"""★P7: 分岐マップのノード用 1 枚絵: raw PNG -> 出荷用 JPEG に仕上げる。

ノードの部屋は **7x6 (7:6)** と **9x6 (3:2)** の 2 種類しかなく、絵は tileBounds =
部屋の rect ぴったりに貼られる (index.html の ROOM_PAINTINGS_DEF の "n4"/"n7")。
ChatGPT (DALL-E) は 1024x1024 / 1536x1024 など**決まった寸法でしか返さない**ので、
ここで中央クロップ + リサイズして厳密な比率へ揃える。

  7:6 -> 1176x1008   (168 px/タイル)
  3:2 -> 1512x1008   (168 px/タイル)

画面上の実寸は 7x96=672 / 9x96=864 px なので 1.75 倍。拡大にならないので十分。

⚠ JPEG で問題ない: ローダー (loadRoomPaintings) がオフスクリーン canvas へ焼き直して
  四辺に feather を掛けるので、元画像の α は使われない。

⚠ **縁が暗い絵は不合格**。ノードの部屋は 6 行しかなく feather が 1 タイルずつ食うので、
  周辺減光 (ビネット) を入れると部屋がほぼ全部暗くなる。テンプレでも禁止しているが、
  DALL-E は放っておくと四隅を落とすので、ここで **edge/center 比を必ず実測**して報告する。

使い方:
    py tools/room_node_finish.py \
       --raw source_images/room_node/room_orc-fort_n4_raw.png \
       --out assets/room_orc-fort_n4.jpg --aspect 7:6
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageStat

# cp932 コンソールでも記号入りの日本語を出せるよう UTF-8 化。
# ⚠ これが無いと `⚠`(U+26A0) や `—`(U+2014) を print した瞬間に UnicodeEncodeError で
#   **落ちる** (2026-08-12 に踏んだ。しかも落ちるのが警告を出す行なので、
#   「一番知らせたい時にだけツールが死ぬ」という最悪の壊れ方をする)。
#   出典は scripts/hooks/check_changelog.py の同じ処理。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 比率 -> 出荷寸法。★index.html の tileBounds (7x6 / 9x6) と対応する唯一の表
SIZES = {"7:6": (1176, 1008), "3:2": (1512, 1008)}
# 縁が中央よりこれ以上暗いと「ビネットが入っている」= 貼ると部屋が暗くなる
EDGE_MIN = 0.88


def edge_center(im):
    """(全体平均 / 中央 60% 平均, 中央 60% 平均)。1 未満 = 縁が中央より暗い。

    ⚠ ベルトスクロール版 (room_beltscroll_finish.py) では「1 未満 = 奥行きが出ている」= 良い
      指標だったが、**ノードの絵では逆に不合格の指標**になる (上の注記の理由)。
      同じ式でも意味が反転するので、しきい値をここに持つ。
    """
    W, H = im.size
    g = im.convert("L")
    c = ImageStat.Stat(g.crop((int(W * .2), int(H * .2), int(W * .8), int(H * .8)))).mean[0]
    return (ImageStat.Stat(g).mean[0] / c if c else 0.0), c


def band_means(im):
    """上下左右の縁 12% 帯の平均輝度。壁や暗い枠が紛れ込んでいないかの手掛かり。"""
    W, H = im.size
    g = im.convert("L")
    t = int(H * .12)
    s = int(W * .12)
    m = lambda box: ImageStat.Stat(g.crop(box)).mean[0]
    return {"top": m((0, 0, W, t)), "bottom": m((0, H - t, W, H)),
            "left": m((0, 0, s, H)), "right": m((W - s, 0, W, H))}


def _fit_gamma(im, target):
    """中央 60% の平均輝度が target になるガンマを二分探索して適用した画像を返す。

    ★なぜプロンプトでなくコードで直すか (2026-08-12 の実測):
      「もっと明るく」「255 段階で 50〜63 では暗すぎた」と**実測値まで書いて指示しても**
      DALL-E の出力は 63→66 / 51→58 しか動かなかった (同じ指示でビネットは 0.78→0.98 と
      直ったので、伝わっていないのではなく**明るさだけ効かない**)。
      構図はプロンプト、階調はコード、と役割を分けるのが確実。
    ⚠ target は勘で決めない。**同じテーマの既存 1 枚絵を同じ式で測った値**に合わせる
      (--match)。既存 12 枚の中央 60% 平均は中央値 92.4 / 範囲 58-141 と幅があるので、
      全体の平均へ寄せると廃坑だけ浮く。
    """
    lo, hi = 0.20, 3.00
    for _ in range(24):
        g = (lo + hi) / 2
        lut = [min(255, int(round(255.0 * ((i / 255.0) ** g)))) for i in range(256)]
        cur = im.point(lut * 3)
        _, mean = edge_center(cur)
        if mean < target:
            hi = g          # ガンマを下げる = 明るくする
        else:
            lo = g
    g = (lo + hi) / 2
    lut = [min(255, int(round(255.0 * ((i / 255.0) ** g)))) for i in range(256)]
    return im.point(lut * 3), g


def center_crop_to(im, ratio_w, ratio_h):
    """中央クロップで指定の比率へ。⚠ ここでは拡大しない (画素を捏造しない)。"""
    W, H = im.size
    if W * ratio_h > H * ratio_w:          # 横が余っている -> 左右を削る
        nw, nh = int(round(H * ratio_w / ratio_h)), H
    else:                                   # 縦が余っている -> 上下を削る
        nw, nh = W, int(round(W * ratio_h / ratio_w))
    x0, y0 = (W - nw) // 2, (H - nh) // 2
    return im.crop((x0, y0, x0 + nw, y0 + nh)), (x0, y0, nw, nh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--aspect", required=True, choices=sorted(SIZES.keys()))
    ap.add_argument("--quality", type=int, default=88)
    # ★階調合わせ。--match が優先 (同じテーマの既存 1 枚絵を同じ式で測って目標にする)
    ap.add_argument("--match", default=None,
                    help="この画像の中央60%%平均へ明るさを合わせる (例 assets/room_goblin-mine_1_bs.jpg)")
    ap.add_argument("--target-mean", type=float, default=None,
                    help="中央60%%平均の目標値を直接指定 (--match が無いときだけ使う)")
    a = ap.parse_args()

    raw = Path(a.raw)
    if not raw.exists():
        print(f"[finish] ERROR: raw が見つかりません: {raw}")
        return 2
    im = Image.open(raw).convert("RGB")
    print(f"[finish] raw   : {raw.name}  {im.size[0]}x{im.size[1]}")

    rw, rh = (int(x) for x in a.aspect.split(":"))
    im2, box = center_crop_to(im, rw, rh)
    print(f"[finish] crop  : x={box[0]} y={box[1]}  {box[2]}x{box[3]}  (比 {a.aspect})")

    W, H = SIZES[a.aspect]
    im3 = im2.resize((W, H), Image.LANCZOS)

    target = a.target_mean
    if a.match:
        ref = Path(a.match)
        if not ref.exists():
            print(f"[finish] ERROR: --match の参照が見つかりません: {ref}")
            return 2
        _, target = edge_center(Image.open(ref).convert("RGB"))
        print(f"[finish] match : {ref.name} の中央60%={target:.1f} に合わせます")
    if target:
        _, before = edge_center(im3)
        cand, g = _fit_gamma(im3, target)
        # ⚠⚠ **暗くする方向 (g >= 1.0) には効かせない**。この補正は「1 回目が暗すぎて使えない」
        #   を直すために入れたもので、明るい絵を参照へ引き下げる用途では**害の方が大きい**:
        #   ガンマで暗くすると中央と縁の差が開き、ビネットが増幅される
        #   (神殿 n4 で raw 147.6 → 78.8 に落とした結果 edge/center が 0.789 まで悪化した)。
        #   ゲーム側がフォグと光で暗くするので、明るめに残す方が安全。
        if g >= 1.0:
            print(f"[finish] gamma : 見送り (g={g:.3f} >= 1.0)。中央60%={before:.1f} は参照 "
                  f"{target:.1f} より明るいので触らない")
        else:
            im3 = cand
            _, after = edge_center(im3)
            print(f"[finish] gamma : {g:.3f}  中央60% {before:.1f} -> {after:.1f}")

    ratio, cmean = edge_center(im3)
    bands = band_means(im3)
    print(f"[finish] 明るさ: 中央60%={cmean:.1f}  edge/center={ratio:.3f}"
          f"  帯 上={bands['top']:.0f} 下={bands['bottom']:.0f}"
          f" 左={bands['left']:.0f} 右={bands['right']:.0f}")
    if ratio < EDGE_MIN:
        print(f"[finish] ⚠ 縁が暗い (edge/center {ratio:.3f} < {EDGE_MIN})。"
              "ノードの部屋は 6 行しかなく feather で縁が溶けるため、"
              "ビネットが入ると部屋がほぼ全部暗くなります → 再生成を推奨")

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    im3.save(out, "JPEG", quality=a.quality, optimize=True)
    kb = out.stat().st_size // 1024
    print(f"[finish] out   : {out}  {W}x{H}  {kb} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
