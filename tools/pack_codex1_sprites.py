"""codex1 モンスタースプライト → プロジェクト標準グリッド _anim.png への変換。

codex1 リポジトリ (別 Desktop フォルダ) が用意する高精細スプライトを、ゲーム側
index.html の敵スプライト規格 (96px セル × cols 列 × 5 行) にパックする。

codex1 の提供形式:
  <codex1>/assets/<monster>/final/walk/frame-01..06.png    (RGBA 透過・端に非透過画素なし)
  <codex1>/assets/<monster>/final/attack/frame-01..06.png

既存の source_images/enemy_*/_extract.py と違い、入力は既に
  (a) 透過済み  → チェック柄背景除去 不要
  (b) 個別フレーム分割済み → フレーム重心検出 不要
なので、処理は「共通スケール決定 → LANCZOS 縮小 → 足元揃え・水平中央でセルへ配置 →
5 行グリッド組み立て」だけで済む。

出力レイアウト (build_enemy_anim_sheet 準拠):
  row 0: idle   (walk frame[0] プレースホルダ)
  row 1: alert  (walk frame[0] プレースホルダ)
  row 2: walk   (walk 6F)
  row 3: attack (attack 6F)
  row 4: death  (walk frame[0] プレースホルダ)

使い方:
  py tools/pack_codex1_sprites.py skeleton assets/skeleton_anim.png
  py tools/pack_codex1_sprites.py orc assets/orc_anim.png --char-ratio 0.86
  # codex1 のフォルダ名とゲームキーが違う場合は --monster で codex1 側名を指定
  py tools/pack_codex1_sprites.py goblin assets/goblin_anim.png --monster goblin

スケール方針:
  walk+attack 全 12 フレームのキャラ bbox 高の最大値 H_max を基準に、
  「H_max がセル高の char_ratio を占める」よう共通 scale を算出し全フレームへ一律適用。
  → walk と attack でキャラの大きさが揃い、攻撃時に武器が伸びるコマも相対比を保つ。
  (既存 _extract.py の shared_fs / normalize_attack_to_walk_height と同じ意図を、
   個別フレーム前提で単純化したもの)
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

DEFAULT_CODEX1_ROOT = r"C:\Users\PC_User\Desktop\codex1\assets"
ALPHA_THR = 64


def _load_frames(action_dir, n_frames=6):
    """final/<action>/frame-01..06.png を RGBA で読み込む。存在しなければ空リスト。"""
    frames = []
    for i in range(1, n_frames + 1):
        p = os.path.join(action_dir, f"frame-{i:02d}.png")
        if not os.path.exists(p):
            print(f"  ! missing {p}")
            return []
        frames.append(Image.open(p).convert("RGBA"))
    return frames


def _content_bbox(img):
    """alpha>ALPHA_THR の外接矩形 (x0,y0,x1,y1) を返す。無ければ None。"""
    a = np.array(img)[:, :, 3]
    ys, xs = np.where(a > ALPHA_THR)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _char_height(img):
    bb = _content_bbox(img)
    return (bb[3] - bb[1]) if bb else 0


def _feet_centroid_x(img):
    """キャラ足元(下部 25%)の alpha 加重 X 重心。武器を持つ腕に引っ張られないよう
    下半身で水平中心を取る。無ければ bbox 中央を返す。"""
    a = np.array(img)[:, :, 3]
    bb = _content_bbox(img)
    if bb is None:
        return None
    x0, y0, x1, y1 = bb
    h = y1 - y0
    band_top = int(y1 - max(1, round(h * 0.25)))
    band = a[band_top:y1, :] > ALPHA_THR
    col = band.sum(axis=0)
    if col.sum() == 0:
        return (x0 + x1) / 2.0
    return float((np.arange(len(col)) * col).sum() / col.sum())


def _pack_frame(img, scale, cell, target_feet, center_mode="feet"):
    """1 フレームを scale 倍して cell×cell へ配置 (足元 target_feet・水平中央)。

    center_mode:
      "feet" — 足元 25% の alpha 加重 X 重心を cell 中央に置く (人型の既定)。
      "bbox" — 外接矩形の中心を cell 中央に置く。車両など、足元(車輪)の重心が
               全体の中心から大きくずれる横広アセット向け。feet だと本体が
               セル外へはみ出してクリップされる。
    """
    nw = max(1, int(round(img.width * scale)))
    nh = max(1, int(round(img.height * scale)))
    scaled = img.resize((nw, nh), Image.LANCZOS)

    bb = _content_bbox(scaled)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    if bb is None:
        return canvas
    feet_y = bb[3]                       # スケール後キャラ最下端
    cx = (bb[0] + bb[2]) / 2.0 if center_mode == "bbox" else _feet_centroid_x(scaled)
    off_y = target_feet - feet_y
    off_x = int(round(cell / 2.0 - cx))
    canvas.paste(scaled, (off_x, off_y), scaled)
    return canvas


def _warn_if_clipped(frames, scale, cell, center_mode):
    """パック後にキャラがセル外へはみ出す (= 無言で切れる) フレームを検出して警告。

    スケールは「高さ」だけで決まるので、横広アセット (車両など) では幅がセルを
    はみ出しうる。さらに feet 中央寄せは重心が偏ると片側だけ切れる。どちらも
    出力画像を目視するまで気付けないため、ここで数値的に検出する。
    """
    worst_l, worst_r = cell, 0
    for img in frames:
        nw = max(1, int(round(img.width * scale)))
        nh = max(1, int(round(img.height * scale)))
        scaled = img.resize((nw, nh), Image.LANCZOS)
        bb = _content_bbox(scaled)
        if bb is None:
            continue
        cx = (bb[0] + bb[2]) / 2.0 if center_mode == "bbox" else _feet_centroid_x(scaled)
        off_x = int(round(cell / 2.0 - cx))
        worst_l = min(worst_l, bb[0] + off_x)
        worst_r = max(worst_r, bb[2] + off_x)
    if worst_l < 0 or worst_r > cell:
        over_l = max(0, -worst_l)
        over_r = max(0, worst_r - cell)
        fit = char_ratio_to_fit(worst_l, worst_r, cell)
        print(f"  ! CLIP WARNING: {over_l}px off left / {over_r}px off right "
              f"(left={worst_l} right={worst_r} cell={cell})", file=sys.stderr)
        print(f"  ! shrink --char-ratio to about x{fit:.2f}, or try --center bbox",
              file=sys.stderr)
    else:
        print(f"  fit: left={worst_l} right={worst_r} (cell={cell}) OK")


def char_ratio_to_fit(worst_l, worst_r, cell):
    """現在の char_ratio に掛けるべき縮小係数 (1.0 なら縮小不要)。"""
    half = cell / 2.0
    need = max(half - worst_l, worst_r - half)   # 中心からの最大片側距離
    return 1.0 if need <= half else half / need


def build_sheet(walk_frames, attack_frames, cols, cell, out_path):
    W, H = cell * cols, cell * 5
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    placeholder = walk_frames[0] if walk_frames else None
    rows = [
        [placeholder] * cols,                                            # idle
        [placeholder] * cols,                                            # alert
        list(walk_frames),                                               # walk
        list(attack_frames) if attack_frames else [placeholder] * cols,  # attack
        [placeholder] * cols,                                            # death
    ]
    for r, row in enumerate(rows):
        for c, frame in enumerate(row):
            if frame is None:
                continue
            out.paste(frame, (c * cell, r * cell), frame)
    out.save(out_path)
    print(f"  -> {out_path}  ({W}x{H})")


def _prescale(frames, factor):
    """attack シートだけを事前縮小する (codex1 が walk と別ズームで描いた場合の補正)。"""
    if not frames or abs(factor - 1.0) < 1e-6:
        return frames
    out = []
    for f in frames:
        nw = max(1, int(round(f.width * factor)))
        nh = max(1, int(round(f.height * factor)))
        out.append(f.resize((nw, nh), Image.LANCZOS))
    return out


def pack_monster(monster, out_path, codex1_root, cols, cell, char_ratio, bottom_pad_ratio,
                 center_mode="feet", attack_scale=1.0):
    mono_dir = os.path.join(codex1_root, monster, "final")
    walk = _load_frames(os.path.join(mono_dir, "walk"), cols)
    attack = _load_frames(os.path.join(mono_dir, "attack"), cols)
    if not walk:
        print(f"  ! walk frames not found under {mono_dir}/walk", file=sys.stderr)
        return False

    # codex1 が walk と attack を別チャットで描くと、同じキャラでもズーム倍率が食い違う
    # ことがある (goblin-war-cart: attack のゴブリンが walk の約1.5倍)。共通スケールは
    # 「高さ」しか見ないので、この食い違いは攻撃モーション開始時のサイズ跳ねになる。
    # attack_scale で attack 側だけ先に揃えてから共通スケールへ乗せる。
    if attack:
        attack = _prescale(attack, attack_scale)

    # 共通スケール: walk+attack 全フレームのキャラ最大高が cell*char_ratio を占める
    all_frames = walk + (attack or [])
    h_max = max((_char_height(f) for f in all_frames), default=0)
    if h_max <= 0:
        print("  ! no opaque content in frames", file=sys.stderr)
        return False
    scale = (cell * char_ratio) / h_max
    target_feet = cell - max(1, int(round(cell * bottom_pad_ratio)))
    print(f"  {monster}: frames walk={len(walk)} attack={len(attack)} "
          f"H_max={h_max}px scale={scale:.4f} char_ratio={char_ratio} "
          f"target_feet={target_feet} center={center_mode} attack_scale={attack_scale}")

    _warn_if_clipped(all_frames, scale, cell, center_mode)

    walk_p = [_pack_frame(f, scale, cell, target_feet, center_mode) for f in walk]
    attack_p = [_pack_frame(f, scale, cell, target_feet, center_mode) for f in attack] if attack else None
    if not attack_p:
        print("  (attack frames not found - row3 uses walk[0] placeholder)")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    build_sheet(walk_p, attack_p, cols, cell, out_path)
    return True


def main():
    ap = argparse.ArgumentParser(description="codex1 sprite -> project _anim.png packer")
    ap.add_argument("key", help="ゲーム側キー兼 codex1 フォルダ名 (例: skeleton, orc)")
    ap.add_argument("out", help="出力 _anim.png パス (例: assets/skeleton_anim.png)")
    ap.add_argument("--monster", default=None,
                    help="codex1 側フォルダ名が key と異なる場合に指定")
    ap.add_argument("--codex1-root", default=DEFAULT_CODEX1_ROOT)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--cell", type=int, default=96)
    ap.add_argument("--char-ratio", type=float, default=0.86,
                    help="最も背の高いフレームがセル高に占める割合 (既定 0.86)")
    ap.add_argument("--bottom-pad-ratio", type=float, default=0.05)
    ap.add_argument("--center", choices=("feet", "bbox"), default="feet",
                    help="水平中央寄せの基準。人型=feet(既定)、車両など横広=bbox")
    ap.add_argument("--attack-scale", type=float, default=1.0,
                    help="attack シートだけを事前縮小する倍率 (walk と別ズームで描かれた場合の補正)")
    args = ap.parse_args()

    monster = args.monster or args.key
    print(f"--- pack codex1 {monster} -> {args.out} ---")
    ok = pack_monster(monster, args.out, args.codex1_root, args.cols, args.cell,
                      args.char_ratio, args.bottom_pad_ratio, args.center, args.attack_scale)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
