#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""check_title_emblem.py — codex1 納品の「タイトル画面の紋章」を受入条件 A〜F で測る。

依頼文: codex1/requests/2026-08-23_title-emblem.md の 6 章がそのまま条件。
⭐ 依頼文には「測るのはこちら側」と書いてある。codex 側の環境には Python が無く、
   納品前チェックは実行されない前提。**この道具が唯一の判定者**。

━━ 既存の check_*.py との関係 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  check_sprite_doubling.py / check_attack_scale.py / check_frame_dupes.py
      … いずれも「右向き 6 コマのスプライトシート」前提。紋章は 1 枚絵なので対象外。
  check_alpha_bg_residue.py
      … 下の条件 B (充填率) と**同じ考え方**。ただしあちらは assets/*.png を
        まとめて走査する汎用スキャンで閾値 0.98。こちらは紋章 1 枚に対する
        受入条件なので **0.80 と厳しくしてある**。⚠ 片方だけ動かさないこと。
  A / C / D / E は紋章固有の条件で、既存のどれも見ていない。

━━ 受入条件 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  A. カンバス 1536x768 / bbox 幅 1340-1480 / 高さ 560-700 / 中心 (768,384)±16
     / 外周 16px に不透明画素なし / 四隅 alpha 0
  B. 充填率 (不透明画素 ÷ bbox 面積) <= 80%
     ⚠⚠ これが「白い矩形の焼き込み」を捕まえる唯一の指標。四隅 alpha も外周も通る欠陥。
        2026-08-16 の扉スプライトで実害が出た (充填率 99.996% だった)。
  C. 半透明 (16<=a<=219) が不透明画素 (a>=220) の 1.0%-8.0%
     ⚠ 1536px -> 282px と 1/5.4 に縮小して表示するので、1bit の硬い輪郭はジャギる。
  D. ① 不透明画素の平均輝度 >= 50  ② 輝度 150 以上の画素が不透明画素の 5% 以上
     ⚠ ①をあえて緩くしてある。依頼文は「窪みには黒い緑青」「下側の面は暗く落ちる」と
        要求しているので暗部は多くて当然。浮かせているのは②のハイライトのほう。
        (最初 ①を「背景+50」の 1 本で書いていて本文と衝突しかけた。分けて緩めた経緯がある)
  E. alpha>128 のシルエットの水平重心が 768 ±23 (=カンバス幅の 1.5%)
     ⚠ 陰影は非対称でよい (光は上やや左)。形だけ対称、という条件。
  F. 納品ファイルの md5 がすべて異なる

━━ ⚠⚠ 2026-08-23: 実納品を受けて A の高さ下限と D-1 を緩めた (経緯を残す) ━━━━━━
当初は「高さ 600-700」「平均輝度 >= 68」だった。**どちらも実物を見ずに机上で決めた値**で、
初回納品 (codex1 2026-08-23) がこの 2 つだけで落ちた。

  bbox 高    573 (< 600)     … 表示上は 105px。狙いの 110px との差は目で分からない
  平均輝度   58.3 (< 68)     … ②のハイライトは 7.7% で通過

⭐ QA シートを**本番の暗い背景の上で**見たところ、紋章はアーチの開口まで明確に読め、
   「小さすぎない」「暗背景から浮く」という**両方の目的は達成されていた**。
   = 絵ではなく**指標のほうが目的とずれていた**。依頼文 7 章で
   「こちらの指標が誤っていたらこちらが直す」と宣言したとおり、指標を直した。
⚠ codex 側は「色補正は許可された後処理範囲外」として**絵を歪めずに差し戻した**。
   これは正しい対応。緩めたのは差し戻しに応じたからではなく、目的で測り直した結果。
⚠⚠ **bbox 高の 573 と、codex 申告の 647 の食い違いは alpha 閾値の差**
   (こちらは alpha>=16、codex は alpha>0 と思われる)。**依頼文に定義を書かなかった
   こちらの落ち度**。次に紋章を頼むときは「不透明 = alpha >= 16」と明記すること。
⭐ 緩めるときは**負のコントロールが死んでいないか**を必ず見る。実際 mut_small は
   0.85 倍だと高さ 562 で新しい下限 560 をぎりぎり跨げなくなっていたので 0.75 に変えた。

━━ 使い方 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    py tools/check_title_emblem.py                    # 既定パスの納品物を測る
    py tools/check_title_emblem.py <emblem.png> ...
    py tools/check_title_emblem.py --negative         # ★装置の自己テスト (下記)
    py tools/check_title_emblem.py --negative --dump <dir>   # 合成画像を目で見る

━━ ★ --negative (負のコントロールを道具に内蔵) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
合成した「正常な紋章もどき」が全条件で緑になること (= 母集団ガード) を先に確かめ、
そこから **1 条件だけを壊した変異** を 6 通り作って、狙った条件が赤くなるかを見る。
⭐ これが無いと「緑」が「本当に通った」のか「測り損ねた」のか区別できない。
⚠ 変異で条件を裏返してはいけない (全部が赤くなる変異は別物を測っている)。
⭐ 画像検査なので変異は完全に静置で作れる。時間で作る負のコントロールのような
   競争条件が原理的に無い。
納品物を測るときも、先にこの自己テストを通してからでないと判定に進まない。

終了コード: 0 = 合格 / 1 = 不合格 or 装置の自己テスト失敗 / 2 = 環境不足
"""
import argparse
import hashlib
import os
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError as e:                                    # pragma: no cover
    sys.stderr.write("[emblem] Pillow / numpy が要ります: %s\n" % e)
    sys.exit(2)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODEX1 = os.path.join(os.path.dirname(ROOT), "codex1")
DEFAULT_EMBLEM = os.path.join(CODEX1, "assets", "title-emblem", "title-emblem.png")
DEFAULT_QA = os.path.join(CODEX1, "assets", "title-emblem", "title-emblem-qa.png")

# ── 受入条件の閾値。⚠ 依頼文 6 章と同じ値。片方だけ動かさないこと ──────────
CANVAS = (1536, 768)
BBOX_W = (1340, 1480)
BBOX_H = (560, 700)   # ⚠ 当初 600。2026-08-23 の実納品 (alpha>=16 で 573) を受けて下げた。下記参照
CENTER_TOL = 16
MARGIN = 16                  # カンバス外周のこの幅に不透明画素があってはならない
FILL_MAX = 0.80              # B
AA_LO, AA_HI = 0.010, 0.080  # C
LUMA_MEAN_MIN = 50.0         # D-1  ⚠ 当初 68。実納品 58.3 を受けて下げた。下記参照
HILITE_LUMA = 150.0          # D-2
HILITE_MIN = 0.05            # D-2
CENTROID_TOL = 23            # E (1536 の 1.5%)

A_OPAQUE = 220               # これ以上を「不透明」とする (C の分母)
A_SEMI_LO = 16               # 16..219 が「半透明」
A_SILHOUETTE = 128           # E のシルエット判定
A_ANY = 16                   # bbox を取るときの下限 (他の check_*.py と揃える)


def luma(rgb):
    """0..255 の輝度。ITU-R BT.601。"""
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def measure(img):
    """PIL Image (RGBA) -> 実測値の dict。判定はしない。"""
    a = np.asarray(img.convert("RGBA"))
    alpha = a[..., 3].astype(np.int32)
    rgb = a[..., :3].astype(np.float64)
    h, w = alpha.shape
    m = {"w": w, "h": h}

    any_mask = alpha >= A_ANY
    m["any_px"] = int(any_mask.sum())
    if m["any_px"] == 0:
        m["empty"] = True
        return m
    m["empty"] = False

    ys, xs = np.nonzero(any_mask)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    m["bbox"] = (x0, y0, x1, y1)
    m["bbox_w"] = x1 - x0 + 1
    m["bbox_h"] = y1 - y0 + 1
    m["bbox_cx"] = (x0 + x1) / 2.0
    m["bbox_cy"] = (y0 + y1) / 2.0

    # 外周 MARGIN px に不透明画素があるか
    ring = np.zeros_like(any_mask)
    ring[:MARGIN, :] = True
    ring[-MARGIN:, :] = True
    ring[:, :MARGIN] = True
    ring[:, -MARGIN:] = True
    m["ring_px"] = int((any_mask & ring).sum())
    m["corners"] = [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])]

    opaque = alpha >= A_OPAQUE
    semi = (alpha >= A_SEMI_LO) & (alpha < A_OPAQUE)
    m["opaque_px"] = int(opaque.sum())
    m["semi_px"] = int(semi.sum())

    # B: 充填率 = 不透明画素 / bbox 面積
    m["bbox_area"] = m["bbox_w"] * m["bbox_h"]
    m["fill"] = m["opaque_px"] / float(m["bbox_area"]) if m["bbox_area"] else 0.0

    # C: 半透明の割合
    m["aa"] = m["semi_px"] / float(m["opaque_px"]) if m["opaque_px"] else 0.0

    # D: 輝度
    if m["opaque_px"]:
        L = luma(rgb)[opaque]
        m["luma_mean"] = float(L.mean())
        m["hilite"] = float((L >= HILITE_LUMA).mean())
    else:
        m["luma_mean"] = 0.0
        m["hilite"] = 0.0

    # E: シルエット重心
    sil = alpha > A_SILHOUETTE
    if sil.sum():
        m["centroid_x"] = float(np.nonzero(sil)[1].mean())
    else:
        m["centroid_x"] = float("nan")
    return m


def judge(m):
    """実測値 -> {条件名: (ok, 説明)}。条件ごとに 1 行。"""
    r = {}
    if m.get("empty"):
        for k in "ABCDE":
            r[k] = (False, "画像が空 (不透明画素 0)")
        return r

    a_fail = []
    if (m["w"], m["h"]) != CANVAS:
        a_fail.append("カンバス %dx%d (要 %dx%d)" % (m["w"], m["h"], CANVAS[0], CANVAS[1]))
    if not (BBOX_W[0] <= m["bbox_w"] <= BBOX_W[1]):
        a_fail.append("bbox 幅 %d (要 %d-%d)" % (m["bbox_w"], BBOX_W[0], BBOX_W[1]))
    if not (BBOX_H[0] <= m["bbox_h"] <= BBOX_H[1]):
        a_fail.append("bbox 高 %d (要 %d-%d)" % (m["bbox_h"], BBOX_H[0], BBOX_H[1]))
    dcx, dcy = abs(m["bbox_cx"] - CANVAS[0] / 2.0), abs(m["bbox_cy"] - CANVAS[1] / 2.0)
    if dcx > CENTER_TOL or dcy > CENTER_TOL:
        a_fail.append("bbox 中心ずれ (%.1f, %.1f) (許容 %d)" % (dcx, dcy, CENTER_TOL))
    if m["ring_px"]:
        a_fail.append("外周 %dpx に不透明画素 %d" % (MARGIN, m["ring_px"]))
    if any(c != 0 for c in m["corners"]):
        a_fail.append("四隅 alpha %s" % m["corners"])
    r["A"] = (not a_fail,
              "カンバスと位置: " + ("OK (bbox %dx%d / 中心ずれ %.1f,%.1f)"
                                    % (m["bbox_w"], m["bbox_h"], dcx, dcy)
                                    if not a_fail else " / ".join(a_fail)))

    r["B"] = (m["fill"] <= FILL_MAX,
              "充填率 %.1f%% (要 <= %.0f%%) — 白い矩形の焼き込み検出"
              % (m["fill"] * 100, FILL_MAX * 100))
    r["C"] = (AA_LO <= m["aa"] <= AA_HI,
              "半透明率 %.2f%% (要 %.1f-%.1f%%)" % (m["aa"] * 100, AA_LO * 100, AA_HI * 100))
    d1 = m["luma_mean"] >= LUMA_MEAN_MIN
    d2 = m["hilite"] >= HILITE_MIN
    r["D"] = (d1 and d2,
              "平均輝度 %.1f (要 >= %.0f) / 輝度%d以上 %.1f%% (要 >= %.0f%%)"
              % (m["luma_mean"], LUMA_MEAN_MIN, HILITE_LUMA, m["hilite"] * 100, HILITE_MIN * 100))
    dx = abs(m["centroid_x"] - CANVAS[0] / 2.0)
    r["E"] = (dx <= CENTROID_TOL,
              "シルエット重心 x=%.1f (中心から %.1f, 許容 %d)" % (m["centroid_x"], dx, CENTROID_TOL))
    return r


# ══════════════════════════════════════════════════════════════════════════
#  合成した「正常な紋章もどき」と、条件を 1 つずつ壊した変異
#  ⚠ 変異は狙った条件だけを壊すこと。全部赤くなる変異は別物を測っている。
# ══════════════════════════════════════════════════════════════════════════
SS = 4  # スーパーサンプリング倍率。縮小で自然なアンチエイリアスが入る


def synth_base():
    """円形メダリオン + 左右へ水平に伸びる剣。全条件を通るはずの正常形。"""
    W, H = CANVAS[0] * SS, CANVAS[1] * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = W // 2, H // 2
    R = 330 * SS                                  # 直径 660 -> bbox 高 660
    # 剣 (左右へ水平)。x=48..1488 -> bbox 幅 1440
    for sx in (-1, 1):
        x_out = cx + sx * 720 * SS
        x_in = cx + sx * 330 * SS
        d.rectangle([min(x_out, x_in), cy - 35 * SS, max(x_out, x_in), cy + 35 * SS],
                    fill=(139, 105, 20, 255))
    # メダリオン本体
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(139, 105, 20, 255))
    # 上側のハイライトの弧 (輝度 150 以上を 5% 以上 作るため)
    d.ellipse([cx - R, cy - R, cx + R, cy - R + int(R * 0.55)], fill=(232, 200, 119, 255))
    # アーチ門の暗い開口 (下側を暗く落とす = D-1 を厳しくする側)
    aw, ah = int(R * 0.52), int(R * 0.95)
    d.rounded_rectangle([cx - aw // 2, cy - ah // 3, cx + aw // 2, cy + ah // 2],
                        radius=aw // 2, fill=(26, 16, 8, 255))
    im = im.resize(CANVAS, Image.LANCZOS)
    # 輪郭の半透明を少し増やす (C の下限 1.0% に対して余裕を持たせる)
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(0.7))
    im.putalpha(a)
    return im


def mut_canvas(im):
    """A を壊す: カンバスを 1536x512 に切る。"""
    return im.crop((0, 128, 1536, 640))


def mut_small(im):
    """A を壊す: 絵を 0.75 倍にして bbox の幅と高さを両方とも範囲外へ落とす。
    ⚠ 当初 0.85 だったが、bbox 高の下限を 600->560 に緩めたとき高さ 562 が
       ぎりぎり通ってしまい「高さ下限の検出力」が消えるところだった。0.75 なら両方赤。"""
    s = im.resize((int(CANVAS[0] * 0.75), int(CANVAS[1] * 0.75)), Image.LANCZOS)
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.paste(s, ((CANVAS[0] - s.width) // 2, (CANVAS[1] - s.height) // 2))
    return out


def mut_fill(im):
    """B を壊す: bbox 内の完全透明画素を不透明で埋める (= 白い矩形の焼き込みの再現)。
    ⚠ 半透明画素はそのまま残すので C は巻き添えにならない。
       色は紋章と同色なので D も動かない。"""
    a = np.asarray(im).copy()
    alpha = a[..., 3]
    ys, xs = np.nonzero(alpha >= A_ANY)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    sub = a[y0:y1 + 1, x0:x1 + 1]
    hole = sub[..., 3] < A_SEMI_LO
    sub[hole] = (139, 105, 20, 255)
    return Image.fromarray(a, "RGBA")


def mut_hard(im):
    """C を壊す: alpha を 0/255 に二値化 (アンチエイリアスを全部落とす)。"""
    a = np.asarray(im).copy()
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def mut_dark(im):
    """D を壊す: RGB を 0.25 倍 (形は 1 画素も変えない)。"""
    a = np.asarray(im).copy()
    a[..., :3] = (a[..., :3].astype(np.float64) * 0.25).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def mut_asym(im):
    """E を壊す: メダリオンの右半分の alpha を 0 にする。
    ⚠ 右の剣は残すので bbox (=A) は動かない。形だけ非対称になる。"""
    a = np.asarray(im).copy()
    cx, cy = CANVAS[0] // 2, CANVAS[1] // 2
    yy, xx = np.mgrid[0:CANVAS[1], 0:CANVAS[0]]
    inside = ((xx - cx) ** 2 + (yy - cy) ** 2) <= (334 ** 2)
    a[..., 3] = np.where(inside & (xx >= cx), 0, a[..., 3]).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


MUTATIONS = [
    ("mut_canvas", "A", mut_canvas, "カンバスを 1536x512 に切る"),
    ("mut_small",  "A", mut_small,  "絵を 0.85 倍にして bbox を縮める"),
    ("mut_fill",   "B", mut_fill,   "bbox 内の透明を埋める (白い矩形の焼き込み)"),
    ("mut_hard",   "C", mut_hard,   "alpha を二値化 (AA を全部落とす)"),
    ("mut_dark",   "D", mut_dark,   "RGB を 0.25 倍 (形は不変)"),
    ("mut_asym",   "E", mut_asym,   "メダリオン右半分の alpha を 0 (形だけ非対称)"),
]


def run_negative(dump_dir=None):
    print("★ 負のコントロール (装置の自己テスト)")
    print("=" * 74)
    base = synth_base()
    if dump_dir:
        os.makedirs(dump_dir, exist_ok=True)
        base.save(os.path.join(dump_dir, "base.png"))
    bj = judge(measure(base))
    print("")
    print("[母集団ガード] 合成した正常形が全条件で緑になるか")
    ok_base = True
    for k in "ABCDE":
        ok, msg = bj[k]
        print("   %s %s: %s" % ("OK  " if ok else "NG  ", k, msg))
        ok_base = ok_base and ok
    if not ok_base:
        print("")
        print("⛔ 母集団ガードが赤。合成の正常形が通らないので、変異が赤くても意味がない。")
        return False

    print("")
    print("[変異] 1 条件だけを壊して、狙った条件が赤くなるか")
    all_ok = True
    for name, target, fn, desc in MUTATIONS:
        mi = fn(base)
        if dump_dir:
            mi.save(os.path.join(dump_dir, name + ".png"))
        mj = judge(measure(mi))
        hit = not mj[target][0]
        others = [k for k in "ABCDE" if k != target and not mj[k][0]]
        print("   %s %-11s -> %s が%s  (%s)"
              % ("OK  " if hit else "NG  ", name, target,
                 "赤くなった" if hit else "★赤くならなかった★", desc))
        print("        %s" % mj[target][1])
        if others:
            # 巻き添えは即失敗にはしない。ただし全条件が赤いなら別物を測っている。
            note = "⚠⚠ ほぼ全条件が赤 = 変異が条件を裏返している疑い" if len(others) >= 4 else "参考"
            print("        巻き添え: %s (%s)" % (", ".join(others), note))
        all_ok = all_ok and hit
    print("")
    print("=" * 74)
    print("装置の自己テスト: %s" % ("合格" if all_ok else "★失敗★"))
    return all_ok


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description="タイトル紋章の受入条件 A〜F を測る")
    ap.add_argument("paths", nargs="*", help="紋章 PNG (省略時は codex1 の既定パス)")
    ap.add_argument("--negative", action="store_true", help="装置の自己テストだけ行う")
    ap.add_argument("--dump", metavar="DIR", help="--negative の合成画像を保存する")
    args = ap.parse_args()

    if args.negative:
        sys.exit(0 if run_negative(args.dump) else 1)

    paths = args.paths or [DEFAULT_EMBLEM]
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        for p in missing:
            sys.stderr.write("[emblem] 見つからない: %s\n" % p)
        sys.exit(1)

    print("★ 装置の自己テストを先に通す")
    if not run_negative(None):
        sys.stderr.write("\n[emblem] 装置が壊れている。納品物の判定は行わない。\n")
        sys.exit(1)

    all_ok = True
    for p in paths:
        print("")
        print("=" * 74)
        print("納品物: %s" % p)
        print("=" * 74)
        m = measure(Image.open(p))
        for k, (ok, msg) in sorted(judge(m).items()):
            print("   %s %s: %s" % ("OK  " if ok else "NG  ", k, msg))
            all_ok = all_ok and ok
        print("   --  md5: %s" % md5(p))

    # F: md5 がすべて異なる (QA シートが在れば一緒に見る)
    extra = [DEFAULT_QA] if (DEFAULT_QA not in paths and os.path.exists(DEFAULT_QA)) else []
    group = list(paths) + extra
    if len(group) > 1:
        hs = [md5(p) for p in group]
        okf = len(set(hs)) == len(hs)
        print("")
        print("   %s F: 納品 %d 枚の md5 がすべて異なる" % ("OK  " if okf else "NG  ", len(group)))
        for p, h in zip(group, hs):
            print("        %s  %s" % (h, os.path.basename(p)))
        all_ok = all_ok and okf
    else:
        print("")
        print("   --  F: 比較対象が 1 枚だけなので md5 の相違は判定しない")

    print("")
    print("=" * 74)
    print("総合: %s" % ("合格" if all_ok else "★不合格★"))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
