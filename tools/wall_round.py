#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""石壁テクスチャの「石ブロック 1 個 1 個の角」を丸めるフィルタ。
make_wall_face.py / make_wall_top.py から --round で呼ばれる。アセット製造時のみ。

ユーザー指摘 (2026-08-14):
  「壁の場所大きさ配置は、そのままで大丈夫です。真四角すぎるので、
    壁のブロックに丸みを少しだけ持たせれますか？」

⭐⭐ **大きさを変えずに角だけ落とす**のが要件なので、源画像の描き直し (ChatGPT 再発注) は
   採らない。源を差し替えると石の個数が変わり = ブロック径が動く = 「大きさはそのままで
   大丈夫」を壊す (project-room-stone-walls の実測: ブロック径は源の石の個数で決まる)。
   → 出荷済みの絵に対する**後処理**で閉じる。負のコントロールとして --round 0 では
   1 バイトも変わらない (既存 4 枚の md5 で実測済み)。

手法 = **2 値の目地マスクに対する opening** (erode -> dilate、半径 r の disc):
  1. 輝度を「ブロック尺度の局所平均」と比べて 2 値化する。明 = 石の面 / 暗 = 目地。
  2. そのマスクを opening する。erode で石が r だけ痩せ、dilate で太り戻るが、
     **凸角は disc の形にしか戻らない = 丸まる**。
  3. 「元は石だったが opening で消えた画素」= 角だけを取り出し、その画素だけを
     近傍の**目地の色** (半径 r+1 の min フィルタ) へブレンドする。
  石の面の内部・目地の内部はマスクが opening 前後で一致するので**1 ビットも変わらない**。
  目地の位置も石の中心も動かず、角が r だけ削れるだけになる。

⚠⚠ **輝度そのものをグレースケール opening してはいけない** (2026-08-14 に実測して却下)。
   写真的な粒・ヒビ・苔の斑まで「小さな明部」として除去対象になるため、沼地の立面では
   **画素の 64.2%** が動き、平均 L -12.2% / SD 33.0 -> 27.5 と**全面が暗く平らになった**。
   これは 2026-08-08 の「ただの白い幕」(SD -30%) と同型の失敗。角だけを動かしたいなら
   マスクを 2 値にして「石か目地か」の判定へ落とすこと。効いた画素の割合をログに出して
   いるのはこの罠を再発時に一目で捕まえるため (角だけなら **数 %** で収まる)。

⚠ 端は 'edge' 複製で埋める。シームレス化 (feather のクロスフェード) は**この後**に走るので、
  ここで wrap する必要はない。順序を入れ替えないこと。

⚠ ログは ASCII のみ。Windows の cp932 パイプへ日本語を混ぜると項目ごと化けて grep が死ぬ。
"""

import numpy as np


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def _disc(radius):
    """半径 radius の disc に入る (dy, dx) の一覧。"""
    r = int(np.ceil(radius))
    return [(dy, dx)
            for dy in range(-r, r + 1)
            for dx in range(-r, r + 1)
            if dy * dy + dx * dx <= radius * radius + 1e-9]


def _morph(a, offsets, op):
    """offsets 分だけずらした版を op (np.minimum / np.maximum) で畳む。"""
    h, w = a.shape
    r = max(max(abs(dy), abs(dx)) for dy, dx in offsets)
    pad = np.pad(a, r, mode="edge")
    out = None
    for dy, dx in offsets:
        v = pad[r + dy:r + dy + h, r + dx:r + dx + w]
        out = v if out is None else op(out, v)
    return out


def box_blur(a, half):
    """一辺 2*half+1 の箱ぼかし (分離可能)。half <= 0 なら素通し。"""
    half = int(half)
    if half <= 0:
        return a
    k = 2 * half + 1
    h, w = a.shape
    cs = np.cumsum(np.pad(a, ((half + 1, half), (0, 0)), mode="edge"), axis=0)
    a1 = (cs[k:, :] - cs[:-k, :]) / k
    cs = np.cumsum(np.pad(a1, ((0, 0), (half + 1, half)), mode="edge"), axis=1)
    a2 = (cs[:, k:] - cs[:, :-k]) / k
    assert a2.shape == (h, w), "box_blur が形を変えた: %s -> %s" % ((h, w), a2.shape)
    return a2


def round_blocks(rgb, radius, strength=1.0, soften=1, presmooth=2,
                 scale=10, thresh=1.0, verbose=True):
    """rgb (float32 HxWx3) の石ブロックの凸角を半径 radius で丸めて返す。

    radius   … 削る量 (出力 px)。ブロック径の 1 割前後が「少しだけ」の目安
    strength … 削りの効き (1.0 = 目地色そのもの / 0.5 = 半分だけ寄せる)
    soften   … 角マスクの箱ぼかし半幅。0 だと角がギザギザに欠ける
    presmooth… 2 値化前の箱ぼかし半幅 (粒状ノイズで判定が虫食いになるのを防ぐ)
    scale    … 「石か目地か」を測る局所平均の箱ぼかし半幅。ブロック径の半分が目安
    thresh   … 局所平均の何倍より明るければ石とみなすか
    """
    if radius <= 0:
        return rgb
    L = lum(rgb)
    Lb = box_blur(L, presmooth)
    mask = (Lb > box_blur(Lb, scale) * thresh).astype(np.float32)   # 1=石の面 / 0=目地
    disc = _disc(radius)
    opened = _morph(_morph(mask, disc, np.minimum), disc, np.maximum)
    corner = np.clip(mask - opened, 0.0, 1.0)                       # opening で消えた角だけ
    w = np.clip(box_blur(corner, soften) * float(strength), 0.0, 1.0)
    big = _disc(radius + 1.0)
    mortar = np.stack([_morph(rgb[..., c], big, np.minimum) for c in range(3)], axis=-1)
    out = np.clip(rgb * (1.0 - w)[..., None] + mortar * w[..., None], 0.0, 255.0)
    if verbose:
        Lo = lum(out)
        print("round r=%.1f strength=%.2f soften=%d scale=%d thresh=%.3f | "
              "stone %.1f%% / corner %.1f%% | meanL %.1f -> %.1f (%+.1f%%) | SD %.1f -> %.1f"
              % (radius, strength, soften, scale, thresh,
                 100.0 * float(mask.mean()), 100.0 * float((w > 0.02).mean()),
                 float(L.mean()), float(Lo.mean()),
                 100.0 * (float(Lo.mean()) / max(float(L.mean()), 1e-6) - 1.0),
                 float(L.std()), float(Lo.std())))
    return out
