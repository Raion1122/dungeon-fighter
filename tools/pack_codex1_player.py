"""codex1 スプライト → プレイヤー(職業)規格 walk/attack シートへの変換。

敵規格 (pack_codex1_sprites.py) と違う点は 3 つだけで、あとは同じヘルパーを使う:

  1. 行数が 4 行 (敵は 5 行)。実データは **row 3 のみ**。
     index.html updateKnightSprite / updateAllySprite が `const row = 3` 固定で読む
     (FF タクティクス風に右向きだけ用意し、左向きは CSS の scaleX(-1) で反転する)。
  2. attack が **5 コマ** (敵は 6 コマ)。エンジンが
     `Math.min(4, Math.floor(progress * 5))` で引くため、6F 素材を ATTACK_KEYS で間引く。
  3. 出力が 2 ファイル (walk 576×384 / attack 480×384)。

ATTACK_KEYS = [0, 1, 2, 3, 5] は source_images/_extract_warrior_variants.py と同一。
6 コマ目 (= 出力 col 4) は「構え」に戻ったコマなので、そのままガードポーズに使える。

cast (詠唱) シートは任意の 3 枚目。ジオメトリは **walk と同じ 6F / 576×384** で、
エンジンは `Math.min(5, Math.floor(progress * 6))` で引く (index.html updateAllySprite)。
cast_dir を省くと attack_dir を流用する = 「近接モーションが素材に無く、attack 側も詠唱の
絵で代用している」ケース (僧侶)。スケール・アンカー・接地線は walk/attack と完全に共有
するので、歩き→詠唱で体の大きさも立ち位置も動かない。

使い方:
  py tools/pack_codex1_player.py --all                        # 台帳の format:"player" 全件
  py tools/pack_codex1_player.py ironvale-vanguard \
     --walk-out assets/warrior_walk.png --attack-out assets/warrior_attack.png \
     --walk-dir ironvale-vanguard/ironvale-vanguard-walk-right-6 \
     --attack-dir ironvale-vanguard/ironvale-vanguard-attack-right-6-v2-matched \
     --match-current assets/warrior_walk.png
"""
import argparse
import os
import sys

from PIL import Image

from pack_codex1_sprites import (
    DEFAULT_CODEX1_ROOT,
    _attack_scale_arg,
    _char_height,
    _load_frames,
    _pack_frame,
    _prescale,
    _warn_if_clipped,
    fit_anchor,
    layout_attack_scale_for,
    load_ledger,
    resolve_attack_scale,
    resolve_dirs,
    sheet_char_ratio,
)

ROWS = 4
CONTENT_ROW = 3
ATTACK_KEYS = [0, 1, 2, 3, 5]   # 6F -> 5F 間引き (エンジンの attack は 5 コマ)


def build_player_sheet(frames, cell, out_path):
    """cols = len(frames) の 4 行シートを組む。実データは row 3 のみ、他行は透明。"""
    cols = len(frames)
    out = Image.new("RGBA", (cell * cols, cell * ROWS), (0, 0, 0, 0))
    for c, f in enumerate(frames):
        out.paste(f, (c * cell, CONTENT_ROW * cell), f)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    out.save(out_path)
    print(f"  -> {out_path}  ({cell * cols}x{cell * ROWS})")


def pack_player(key, walk_out, attack_out, codex1_root, cell, cols, char_ratio,
                bottom_pad_ratio=0.05, center_mode="feet", attack_scale=1.0,
                walk_dir=None, attack_dir=None, scale_from="walk",
                attack_layout_scale=None, cast_out=None, cast_dir=None):
    wdir, adir = resolve_dirs(key, codex1_root, walk_dir, attack_dir)
    walk = _load_frames(wdir, cols)
    attack = _load_frames(adir, cols) if adir else []
    if not walk:
        print(f"  ! walk frames not found under {wdir}", file=sys.stderr)
        return False
    if not attack:
        print(f"  ! attack frames not found under {adir}", file=sys.stderr)
        return False
    # 詠唱シート (任意)。cast_dir 省略時は attack_dir を流用する。
    cast, cdir = [], None
    if cast_out:
        cdir = resolve_dirs(key, codex1_root, cast_dir or attack_dir, None)[0]
        cast = _load_frames(cdir, cols)
        if not cast:
            print(f"  ! cast frames not found under {cdir}", file=sys.stderr)
            return False
    # attack_scale="auto" の体高比は **出力に載る 5 コマ** で測る (間引いた 6 コマ目を
    # 混ぜると、検証側 check_attack_scale.py が見る母集団とズレる)。
    render_scale = resolve_attack_scale(attack_scale, walk,
                                        [attack[i] for i in ATTACK_KEYS], key)
    layout_scale = layout_attack_scale_for(attack_scale, render_scale, attack_layout_scale)
    attack_layout = _prescale(attack, layout_scale)
    attack = (attack_layout if abs(render_scale - layout_scale) < 1e-9
              else _prescale(attack, render_scale))
    # cast は attack と同じ素材由来 (cast_dir 省略時) なので同じ描画倍率を掛ける。
    # 掛けないと attack だけ auto 補正され、詠唱の瞬間に体が一段跳ねる。
    cast = _prescale(cast, render_scale)

    # -matched 素材は「体」の高さだけを揃えており bbox は揃っていない。walk 基準で
    # スケールを決めないと、剣を振り上げるコマに引っ張られて本体が縮む。
    # 基準・アンカーは常に attack_layout 側で取る (auto の補正を walk へ波及させない)。
    basis = walk if scale_from == "walk" else walk + attack_layout
    h_max = max((_char_height(f) for f in basis), default=0)
    if h_max <= 0:
        print("  ! no opaque content in frames", file=sys.stderr)
        return False
    scale = (cell * char_ratio) / h_max
    target_feet = cell - max(1, int(round(cell * bottom_pad_ratio)))
    attack_sel = [attack[i] for i in ATTACK_KEYS]
    frames = walk + attack_sel
    anchor = fit_anchor(walk + [attack_layout[i] for i in ATTACK_KEYS],
                        scale, cell, center_mode)
    scale_note = (f"attack_scale={render_scale:.4f}(auto, layout={layout_scale:g})"
                  if isinstance(attack_scale, str) else f"attack_scale={render_scale:g}")
    cast_note = f" cast={len(cast)}F" if cast else ""
    print(f"  {key}: walk={len(walk)}F attack={len(attack)}F -> {len(ATTACK_KEYS)}F{cast_note} "
          f"H_max({scale_from})={h_max}px scale={scale:.4f} char_ratio={char_ratio:.4f} "
          f"target_feet={target_feet} center={center_mode} anchor_x={anchor:.1f} "
          f"{scale_note}")

    _warn_if_clipped(frames + cast, scale, cell, center_mode, target_feet, anchor)

    build_player_sheet(
        [_pack_frame(f, scale, cell, target_feet, center_mode, anchor) for f in walk],
        cell, walk_out)
    build_player_sheet(
        [_pack_frame(f, scale, cell, target_feet, center_mode, anchor) for f in attack_sel],
        cell, attack_out)
    if cast_out:
        build_player_sheet(
            [_pack_frame(f, scale, cell, target_feet, center_mode, anchor) for f in cast],
            cell, cast_out)
    return True


def pack_from_ledger(entry, codex1_root, out_dir):
    cast_out = entry.get("cast_out")
    outs = f"{entry['out']} + {entry['attack_out']}" + (f" + {cast_out}" if cast_out else "")
    print(f"--- pack codex1 {entry['key']} -> {outs} ---")
    return pack_player(
        entry["key"],
        os.path.join(out_dir, entry["out"]),
        os.path.join(out_dir, entry["attack_out"]),
        codex1_root,
        entry.get("cell", 96), entry.get("cols", 6), entry["char_ratio"],
        entry.get("bottom_pad_ratio", 0.05), entry.get("center", "feet"),
        entry.get("attack_scale", 1.0),
        entry.get("walk_dir"), entry.get("attack_dir"),
        entry.get("scale_from", "walk"),
        entry.get("attack_layout_scale"),
        os.path.join(out_dir, cast_out) if cast_out else None,
        entry.get("cast_dir"),
    )


def main():
    ap = argparse.ArgumentParser(description="codex1 sprite -> player walk/attack sheets")
    ap.add_argument("key", nargs="?", help="codex1 フォルダ名 (例: ironvale-vanguard)")
    ap.add_argument("--all", action="store_true",
                    help='台帳 tools/codex1_sprites.json の format:"player" 全件をパック')
    ap.add_argument("--out-dir", default=None,
                    help="--all の出力ルート (既定=リポジトリルート)")
    ap.add_argument("--walk-out", default=None)
    ap.add_argument("--attack-out", default=None)
    ap.add_argument("--cast-out", default=None,
                    help="詠唱シート (6F/576×384) の出力先。省略時は出力しない")
    ap.add_argument("--codex1-root", default=DEFAULT_CODEX1_ROOT)
    ap.add_argument("--walk-dir", default=None)
    ap.add_argument("--attack-dir", default=None)
    ap.add_argument("--cast-dir", default=None,
                    help="詠唱フレーム置場 (省略時は --attack-dir を流用)")
    ap.add_argument("--cell", type=int, default=96)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--char-ratio", type=float, default=0.60,
                    help="walk の最も背の高いコマがセル高に占める割合 (既定 0.60)")
    ap.add_argument("--match-current", default=None, metavar="SHEET",
                    help="現行 walk シート (4行/row3) から char_ratio を実測して採用する")
    ap.add_argument("--scale-from", choices=("both", "walk"), default="walk")
    ap.add_argument("--bottom-pad-ratio", type=float, default=0.05)
    ap.add_argument("--center", choices=("feet", "bbox", "feet-fit"), default="feet")
    ap.add_argument("--attack-scale", type=_attack_scale_arg, default=1.0,
                    help='数値 or "auto" (walk/attack の体高比から自動算出)')
    ap.add_argument("--attack-layout-scale", type=float, default=None,
                    help='--attack-scale auto のときのレイアウト凍結倍率 (既定 1.0)')
    args = ap.parse_args()

    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if args.all:
        sheets = [s for s in load_ledger() if s.get("format") == "player"]
        out_dir = args.out_dir or repo
        fails = [s["key"] for s in sheets if not pack_from_ledger(s, args.codex1_root, out_dir)]
        if fails:
            print(f"! failed: {', '.join(fails)}", file=sys.stderr)
        sys.exit(1 if fails else 0)

    if not args.key:
        ap.error("key は必須 (--all を使う場合を除く)")
    if not args.walk_out or not args.attack_out:
        ap.error("--walk-out と --attack-out が必要 (--all なら台帳から解決)")

    char_ratio = args.char_ratio
    if args.match_current:
        ratio, cur_cell, cur_h = sheet_char_ratio(args.match_current, rows=ROWS,
                                                  walk_row=CONTENT_ROW)
        char_ratio = ratio
        print(f"  match-current: {args.match_current} walk H_max={cur_h}px cell={cur_cell} "
              f"-> char_ratio={ratio:.4f}")

    outs = f"{args.walk_out} + {args.attack_out}" + (f" + {args.cast_out}" if args.cast_out else "")
    print(f"--- pack codex1 {args.key} -> {outs} ---")
    ok = pack_player(args.key, args.walk_out, args.attack_out, args.codex1_root,
                     args.cell, args.cols, char_ratio, args.bottom_pad_ratio,
                     args.center, args.attack_scale, args.walk_dir, args.attack_dir,
                     args.scale_from, args.attack_layout_scale,
                     args.cast_out, args.cast_dir)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
