"""codex1 モンスタースプライト → プロジェクト標準グリッド _anim.png への変換。

codex1 リポジトリ (別 Desktop フォルダ) が用意する高精細スプライトを、ゲーム側
index.html の敵スプライト規格 (96px セル × cols 列 × 5 行) にパックする。

codex1 の提供形式 (2 世代ある。どちらも --walk-dir / --attack-dir で直接指せる):
  第1陣  <codex1>/assets/<monster>/final/walk/frame-01..06.png   (RGBA 透過)
         <codex1>/assets/<monster>/final/attack/frame-01..06.png
  第2陣  <codex1>/assets/<key>/<key>-walk-right-6/*safe-frame-01..06.png
         <codex1>/assets/<key>/<key>-attack-right-6[-v2][-large]-matched/*safe-frame-01..06.png
  第2陣はフレーム名が 4 通り (-safe- / -v2-safe- / -matched-safe- / -large-matched-safe-)
  あるため、ファイル名を組み立てず **glob** で拾う。

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

スケール方針 (--scale-from):
  both (既定・第1陣の挙動)
    walk+attack 全 12 フレームのキャラ bbox 高の最大値 H_max を基準に共通 scale を算出。
  walk (第2陣の -matched 素材向け)
    walk 6 フレームだけから H_max を取る。-matched は「体」の高さを揃えているだけで
    bbox は揃っておらず、武器の振り上げで attack の bbox は walk の最大 1.43 倍まで伸びる。
    both のままだと「剣を振り上げるキャラほど本体が縮む」ため、walk 基準が要る。

見た目サイズの不変条件 (--match-current):
  画面上のキャラ身長 = (walk H_max / cell) * displaySize。displaySize は当たり判定
  (getEnemyHitbox / OVERLAP_RADIUS_K / OVERLAP_BOSS_SIZE) の導出元なので動かしてはいけない。
  → 現行シートの walk 行から (H_max / cell) を実測して char_ratio に採用すれば、
     displaySize を一切触らずに「絵だけ差し替わる」。セル変更 (96→192) も比なので追従する。
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

DEFAULT_CODEX1_ROOT = r"C:\Users\PC_User\Desktop\codex1\assets"
ALPHA_THR = 64


def _load_frames(action_dir, n_frames=6):
    """<dir>/*frame-NN.png を RGBA で読み込む。見つからなければ空リスト。

    第2陣の素材はフレーム名が 4 通り (-safe- / -v2-safe- / -matched-safe- /
    -large-matched-safe-) あるため、名前を組み立てず glob で拾う。同ディレクトリの
    -source / -transparent / -sheet / -size-check は "frame-" を含まないので除外される。
    """
    paths = sorted(glob.glob(os.path.join(action_dir, "*frame-*.png")))
    if len(paths) != n_frames:
        print(f"  ! expected {n_frames} frames under {action_dir}, found {len(paths)}")
        return []
    return [Image.open(p).convert("RGBA") for p in paths]


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


def _anchor_x(scaled, center_mode):
    """スケール後フレームの水平アンカー位置 (この点をセル内の anchor へ合わせる)。"""
    bb = _content_bbox(scaled)
    if bb is None:
        return None
    if center_mode == "bbox":
        return (bb[0] + bb[2]) / 2.0
    return _feet_centroid_x(scaled)      # "feet" / "feet-fit"


def fit_anchor(frames, scale, cell, center_mode):
    """center_mode="feet-fit" 用: 全フレームの和集合がセル内に収まるアンカー位置を返す。

    "feet" はアンカーを常にセル中央 (cell/2) に置く。人型ならそれでよいが、尾を引きずる
    横向きの獣や、攻撃で前方へ大きく踏み込む/炎を吐くキャラでは、足元重心が絵の中心から
    ずれるため「左に無駄な余白・右がクリップ」になる。

    ここではアンカーからの最大左伸び A と最大右伸び B を全フレームで取り、
    A+B がセルに収まるならアンカーを A + 余白/2 に置く (= 和集合をセル内で中央寄せ)。
    オフセットは全フレーム一律なのでフレーム間の相対位置は変わらず、walk↔attack の
    横滑りを起こさない (bbox 中央寄せはここで滑る)。
    """
    if center_mode != "feet-fit":
        return cell / 2.0
    a = b = 0.0
    for img in frames:
        nw = max(1, int(round(img.width * scale)))
        nh = max(1, int(round(img.height * scale)))
        scaled = img.resize((nw, nh), Image.LANCZOS)
        bb = _content_bbox(scaled)
        cx = _anchor_x(scaled, center_mode)
        if bb is None or cx is None:
            continue
        a = max(a, cx - bb[0])
        b = max(b, bb[2] - cx)
    # span > cell (収まらない) 場合も同じ式でよい: はみ出しが左右へ均等に割れるだけで、
    # 片側だけがごっそり切れるのを避けられる。必要な縮小率はクリップ警告が出す。
    return a + (cell - (a + b)) / 2.0


def _pack_frame(img, scale, cell, target_feet, center_mode="feet", anchor=None):
    """1 フレームを scale 倍して cell×cell へ配置 (足元 target_feet・水平は anchor へ)。

    center_mode:
      "feet"     — 足元 25% の alpha 加重 X 重心を anchor に置く (人型の既定)。
      "bbox"     — 外接矩形の中心を anchor に置く。足元(車輪)の重心が全体の中心から
                   大きくずれる横広アセット向け。ただし攻撃で bbox が伸びるキャラでは
                   コマごとに本体が横滑りするので使わないこと。
      "feet-fit" — feet と同じアンカーだが、セル内の置き場所を fit_anchor が決める。
    anchor: セル内のアンカー X 座標。None ならセル中央 (= "feet"/"bbox" の従来挙動)。
    """
    nw = max(1, int(round(img.width * scale)))
    nh = max(1, int(round(img.height * scale)))
    scaled = img.resize((nw, nh), Image.LANCZOS)

    bb = _content_bbox(scaled)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    if bb is None:
        return canvas
    cx = _anchor_x(scaled, center_mode)
    off_y = target_feet - bb[3]          # bb[3] = スケール後キャラ最下端
    off_x = int(round((cell / 2.0 if anchor is None else anchor) - cx))
    canvas.paste(scaled, (off_x, off_y), scaled)
    return canvas


def _warn_if_clipped(frames, scale, cell, center_mode, target_feet, anchor=None):
    """パック後にキャラがセル外へはみ出す (= 無言で切れる) フレームを検出して警告。

    スケールは「高さ」だけで決まるので、横広アセット (車両・翼竜など) では幅がセルを
    はみ出しうる。さらに feet 中央寄せは重心が偏ると片側だけ切れる。
    --scale-from walk では加えて **上端** も切れうる: walk 基準でスケールを決めるため、
    武器を振り上げる attack コマは walk より背が高くなり、足元を target_feet に揃えた
    結果セル上端を突き抜ける。どれも出力画像を目視するまで気付けないので数値で検出する。
    """
    worst_l, worst_r, worst_t = cell, 0, cell
    for img in frames:
        nw = max(1, int(round(img.width * scale)))
        nh = max(1, int(round(img.height * scale)))
        scaled = img.resize((nw, nh), Image.LANCZOS)
        bb = _content_bbox(scaled)
        cx = _anchor_x(scaled, center_mode)
        if bb is None or cx is None:
            continue
        off_x = int(round((cell / 2.0 if anchor is None else anchor) - cx))
        off_y = target_feet - bb[3]
        worst_l = min(worst_l, bb[0] + off_x)
        worst_r = max(worst_r, bb[2] + off_x)
        worst_t = min(worst_t, bb[1] + off_y)
    clipped = worst_l < 0 or worst_r > cell or worst_t < 0
    if clipped:
        over_l = max(0, -worst_l)
        over_r = max(0, worst_r - cell)
        over_t = max(0, -worst_t)
        fit = char_ratio_to_fit(worst_l, worst_r, worst_t, cell, target_feet, center_mode)
        hint = ("or shift the anchor" if center_mode == "feet-fit"
                else "or try --center feet-fit")
        print(f"  ! CLIP WARNING: {over_l}px off left / {over_r}px off right / "
              f"{over_t}px off top (left={worst_l} right={worst_r} top={worst_t} "
              f"cell={cell} feet={target_feet})", file=sys.stderr)
        print(f"  ! shrink --char-ratio to about x{fit:.3f}, {hint}", file=sys.stderr)
    else:
        print(f"  fit: left={worst_l} right={worst_r} top={worst_t} (cell={cell}) OK")
    return not clipped


def char_ratio_to_fit(worst_l, worst_r, worst_t, cell, target_feet, center_mode="feet"):
    """現在の char_ratio に掛けるべき縮小係数 (1.0 なら縮小不要)。

    水平: "feet-fit" はアンカーを動かせるので「和集合の幅」がセルに収まればよい。
          固定中央寄せ ("feet"/"bbox") は「セル中心からの最大片側距離」で決まる。
    垂直: 足元 target_feet からの立ち上がり高がセル上端を超えないこと。
    厳しい方を採る。
    """
    if center_mode == "feet-fit":
        span = worst_r - worst_l
        fx = 1.0 if span <= cell else cell / span
    else:
        half = cell / 2.0
        need_x = max(half - worst_l, worst_r - half)
        fx = 1.0 if need_x <= half else half / need_x
    rise = target_feet - worst_t                   # 足元から上端までの高さ
    fy = 1.0 if rise <= target_feet else target_feet / rise
    return min(fx, fy)


def sheet_char_ratio(sheet_path, rows=5, walk_row=2):
    """現行シートの walk 行から (char_ratio, cell, H_max) を実測する (--match-current)。

    char_ratio = walk 行のキャラ bbox 高の最大値 / セル。これは画面上のキャラ身長
    (= char_ratio * displaySize) を決める比なので、この値を新素材のパックに使えば
    displaySize を触らずに見た目サイズが保たれる。
    """
    im = Image.open(sheet_path).convert("RGBA")
    cell = im.height // rows
    if cell <= 0 or im.width % cell:
        raise SystemExit(f"! {sheet_path}: {im.width}x{im.height} が {rows} 行グリッドに合わない")
    cols = im.width // cell
    h_max = 0
    for c in range(cols):
        bb = _content_bbox(im.crop((c * cell, walk_row * cell,
                                    (c + 1) * cell, (walk_row + 1) * cell)))
        if bb:
            h_max = max(h_max, bb[3] - bb[1])
    if h_max <= 0:
        raise SystemExit(f"! {sheet_path}: walk 行 (row {walk_row}) が空")
    return h_max / cell, cell, h_max


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


def _mean_rgb(frames):
    """不透明画素 (alpha > ALPHA_THR) の平均 RGB。"""
    tot = np.zeros(3, dtype=np.float64)
    n = 0
    for f in frames:
        a = np.array(f, dtype=np.float64)
        m = a[:, :, 3] > ALPHA_THR
        if not m.any():
            continue
        tot += a[:, :, :3][m].sum(axis=0)
        n += int(m.sum())
    return tot / n if n else np.zeros(3)


def _match_tint(attack, walk):
    """attack のパレットを walk に寄せる (チャンネル別ゲイン)。

    codex1 は walk と attack を別チャットで描くため、同じキャラでもパレットがドリフトする
    (stone-golem: walk = 青みグレー / attack = 青が 16% 不足してオリーブ)。両者の不透明画素の
    平均 RGB からチャンネル別ゲインを出して attack 側に掛ける。

    ⚠️ 攻撃コマに明るい VFX (炎・呪文光・火花) が乗るキャラでは、その画素が平均を汚染して
    本体の色を誤って引っ張る。VFX のあるキャラには使わないこと (既定は無補正)。
    """
    w, a = _mean_rgb(walk), _mean_rgb(attack)
    if not a.any():
        return attack
    gain = w / np.maximum(a, 1e-6)
    print(f"  attack-tint match: gain=({gain[0]:.3f}, {gain[1]:.3f}, {gain[2]:.3f})")
    out = []
    for f in attack:
        arr = np.array(f, dtype=np.float64)
        arr[:, :, :3] = np.clip(arr[:, :, :3] * gain, 0, 255)
        out.append(Image.fromarray(arr.astype(np.uint8), "RGBA"))
    return out


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


def resolve_dirs(monster, codex1_root, walk_dir=None, attack_dir=None):
    """walk / attack のフレームディレクトリを決める。

    --walk-dir / --attack-dir が与えられればそれを使う (codex1_root からの相対も可)。
    無ければ第1陣の規約 <root>/<monster>/final/{walk,attack} にフォールバックする。
    """
    def _abs(p):
        return p if os.path.isabs(p) else os.path.join(codex1_root, p)

    if walk_dir:
        return _abs(walk_dir), (_abs(attack_dir) if attack_dir else None)
    final = os.path.join(codex1_root, monster, "final")
    return os.path.join(final, "walk"), os.path.join(final, "attack")


def pack_monster(monster, out_path, codex1_root, cols, cell, char_ratio, bottom_pad_ratio,
                 center_mode="feet", attack_scale=1.0, walk_dir=None, attack_dir=None,
                 scale_from="both", attack_tint=None):
    wdir, adir = resolve_dirs(monster, codex1_root, walk_dir, attack_dir)
    walk = _load_frames(wdir, cols)
    attack = _load_frames(adir, cols) if adir else []
    if not walk:
        print(f"  ! walk frames not found under {wdir}", file=sys.stderr)
        return False

    # codex1 が walk と attack を別チャットで描くと、同じキャラでもズーム倍率が食い違う
    # ことがある (goblin-war-cart: attack のゴブリンが walk の約1.5倍)。共通スケールは
    # 「高さ」しか見ないので、この食い違いは攻撃モーション開始時のサイズ跳ねになる。
    # attack_scale で attack 側だけ先に揃えてから共通スケールへ乗せる。
    if attack:
        if attack_tint == "match":
            attack = _match_tint(attack, walk)
        attack = _prescale(attack, attack_scale)

    all_frames = walk + (attack or [])
    basis = walk if scale_from == "walk" else all_frames
    h_max = max((_char_height(f) for f in basis), default=0)
    if h_max <= 0:
        print("  ! no opaque content in frames", file=sys.stderr)
        return False
    scale = (cell * char_ratio) / h_max
    target_feet = cell - max(1, int(round(cell * bottom_pad_ratio)))
    anchor = fit_anchor(all_frames, scale, cell, center_mode)
    print(f"  {monster}: frames walk={len(walk)} attack={len(attack)} "
          f"H_max({scale_from})={h_max}px scale={scale:.4f} char_ratio={char_ratio:.4f} "
          f"target_feet={target_feet} center={center_mode} anchor_x={anchor:.1f} "
          f"attack_scale={attack_scale}")

    _warn_if_clipped(all_frames, scale, cell, center_mode, target_feet, anchor)

    walk_p = [_pack_frame(f, scale, cell, target_feet, center_mode, anchor) for f in walk]
    attack_p = ([_pack_frame(f, scale, cell, target_feet, center_mode, anchor) for f in attack]
                if attack else None)
    if not attack_p:
        print("  (attack frames not found - row3 uses walk[0] placeholder)")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    build_sheet(walk_p, attack_p, cols, cell, out_path)
    return True


LEDGER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "codex1_sprites.json")


def load_ledger():
    with open(LEDGER, encoding="utf-8") as f:
        return json.load(f)["sheets"]


def pack_from_ledger(entry, codex1_root, out_dir):
    """台帳 1 行をパックする。キーは pack_monster の引数名にそのまま対応。

    char_ratio はリテラルで持つ (--match-current の実測値を焼き込んだもの)。台帳を
    決定論的・冪等に保つため、ここでは現行シートを読み直さない。
    """
    out = os.path.join(out_dir, entry["out"])
    print(f"--- pack codex1 {entry['key']} -> {entry['out']} ---")
    return pack_monster(
        entry["key"], out, codex1_root,
        entry.get("cols", 6), entry.get("cell", 96), entry["char_ratio"],
        entry.get("bottom_pad_ratio", 0.05), entry.get("center", "feet"),
        entry.get("attack_scale", 1.0),
        entry.get("walk_dir"), entry.get("attack_dir"),
        entry.get("scale_from", "both"), entry.get("attack_tint"),
    )


def run_all(codex1_root, out_dir, only=None, fmt="enemy"):
    sheets = [s for s in load_ledger() if s.get("format", "enemy") == fmt]
    if only:
        sheets = [s for s in sheets if s["key"] in only]
    fails = [s["key"] for s in sheets if not pack_from_ledger(s, codex1_root, out_dir)]
    if fails:
        print(f"! failed: {', '.join(fails)}", file=sys.stderr)
    return not fails


def main():
    ap = argparse.ArgumentParser(description="codex1 sprite -> project _anim.png packer")
    ap.add_argument("key", nargs="?", help="ゲーム側キー兼 codex1 フォルダ名 (例: skeleton, orc)")
    ap.add_argument("out", nargs="?", help="出力 _anim.png パス (例: assets/skeleton_anim.png)")
    ap.add_argument("--all", action="store_true",
                    help="台帳 tools/codex1_sprites.json の全シートを再パックする")
    ap.add_argument("--only", nargs="+", metavar="KEY",
                    help="--all のうち指定キーだけをパックする")
    ap.add_argument("--out-dir", default=None,
                    help="--all の出力ルート (既定=リポジトリルート)。再現性検証で別所へ出す用")
    ap.add_argument("--monster", default=None,
                    help="codex1 側フォルダ名が key と異なる場合に指定")
    ap.add_argument("--codex1-root", default=DEFAULT_CODEX1_ROOT)
    ap.add_argument("--walk-dir", default=None,
                    help="walk フレームのディレクトリ (codex1-root からの相対 or 絶対)。"
                         "省略時は <monster>/final/walk")
    ap.add_argument("--attack-dir", default=None,
                    help="attack フレームのディレクトリ。省略時は <monster>/final/attack")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--cell", type=int, default=96)
    ap.add_argument("--char-ratio", type=float, default=0.86,
                    help="基準フレームがセル高に占める割合 (既定 0.86)。"
                         "--match-current を使う場合は縮小係数として掛かる")
    ap.add_argument("--match-current", default=None, metavar="SHEET",
                    help="現行シートの walk 行から char_ratio を実測して採用する。"
                         "displaySize を触らずに見た目サイズを保つための不変条件")
    ap.add_argument("--scale-from", choices=("both", "walk"), default="both",
                    help="共通スケールの基準。both=walk+attack 全フレーム (既定・第1陣)、"
                         "walk=walk のみ (第2陣の -matched 素材)")
    ap.add_argument("--bottom-pad-ratio", type=float, default=0.05)
    ap.add_argument("--center", choices=("feet", "bbox", "feet-fit"), default="feet",
                    help="水平の合わせ方。人型=feet(既定・足元重心をセル中央へ)、"
                         "横広の車両=bbox、"
                         "攻撃で前方へ大きく伸びる獣=feet-fit(足元基準のまま一律オフセットで詰める)")
    ap.add_argument("--attack-scale", type=float, default=1.0,
                    help="attack シートだけを事前縮小する倍率 (walk と別ズームで描かれた場合の補正)")
    ap.add_argument("--attack-tint", choices=("match",), default=None,
                    help="attack のパレットを walk に合わせる (別チャット生成による色ドリフト補正)。"
                         "攻撃コマに明るい VFX が乗るキャラでは平均が汚染されるので使わない")
    args = ap.parse_args()

    if args.all:
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.exit(0 if run_all(args.codex1_root, args.out_dir or repo, args.only) else 1)
    if not args.key or not args.out:
        ap.error("key と out は必須 (--all を使う場合を除く)")

    monster = args.monster or args.key
    char_ratio = args.char_ratio
    if args.match_current:
        ratio, cur_cell, cur_h = sheet_char_ratio(args.match_current)
        # --char-ratio は「実測比への縮小係数」として掛かる (既定 0.86 では意図せず縮むので
        # 明示指定が無い限り 1.0 扱いにする)
        shrink = args.char_ratio if args.char_ratio != ap.get_default("char_ratio") else 1.0
        char_ratio = ratio * shrink
        print(f"  match-current: {args.match_current} walk H_max={cur_h}px cell={cur_cell} "
              f"-> char_ratio={ratio:.4f} x{shrink:.3f} = {char_ratio:.4f}")

    print(f"--- pack codex1 {monster} -> {args.out} ---")
    ok = pack_monster(monster, args.out, args.codex1_root, args.cols, args.cell,
                      char_ratio, args.bottom_pad_ratio, args.center, args.attack_scale,
                      args.walk_dir, args.attack_dir, args.scale_from, args.attack_tint)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
