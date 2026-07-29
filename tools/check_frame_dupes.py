#!/usr/bin/env python3
"""スプライトシートの「重複コマ」検出 — 同じ絵が 2 コマ以上入っているシートを洗い出す。

■ なぜ必要か (2026-07-29 に確立)
  `tools/check_attack_scale.py` は「walk 行と attack 行の体高が揃っているか」を測るが、
  **1 行の中に同じ絵が複数入っていても検知できない**。実際 dwarf-warrior の attack は
  frame-03 と frame-04 が画素完全一致で、サイズ検査を PASS したまま「動きが止まる」
  不具合として残っていた (v10d の再描画で解消)。
  検査を素通りする軸なので、**受入時にフレーム md5 を取る**のが唯一の防御になる。

■ 何を測るか
  シートを推定グリッドでセルに割り、各セルの RGBA を正規化して md5 を取る。
  同一 md5 のセルが 2 個以上ある行を「重複コマあり」として報告する。

  正規化: **alpha == 0 の画素は RGB を 0 に潰す**。抽出ツールが完全透明部分に残す
  RGB ノイズで「見た目は同一なのに md5 が違う」偽陰性を防ぐため。

■ 走査対象とグリッド (check_attack_scale.py と同じ物差しを import 共有)
  (1) 敵シート  assets/*_anim.png … 5 行 (idle/alert/walk/attack/death)。
      既定では **walk (row 2) と attack (row 3)** のみを見る。ゲーム中に実際に
      アニメーションする行だからで、idle/alert/death は元々静止コマの繰り返しが正常。
      `--all-rows` で 5 行すべてを見る。
  (2) PT/仲間ペア assets/<name>_walk.png + <name>_attack.png … 右向き行 (最終行) のみ。

■ 「重複」でないもの (誤検知として除外する)
  - **placeholder**: attack 行の全コマが walk 行 1 コマ目の完全コピー。
    「攻撃モーション未実装」という別カテゴリなので dup ではなく placeholder と報告する。
  - **完全透明セル**: フレーム数に数えない (末尾の空きコマは正常)。
  - **非標準シート**: rat_bat (32px 10x10 の 2 体混載) は実グリッドで測り直す。
    ⚠ サイレント除外は禁止 — 理由を出力に明示する。

■ 使い方
  py tools/check_frame_dupes.py                  # 全シート走査してサマリ表
  py tools/check_frame_dupes.py --all-rows       # idle/alert/death 行も見る
  py tools/check_frame_dupes.py --sheet dwarf    # 名前部分一致で絞り込み
  py tools/check_frame_dupes.py --json           # 機械可読出力 (自動検証用)
  py tools/check_frame_dupes.py --fail-on-dup    # 重複が 1 件でもあれば exit 1 (受入検査用)
  py tools/check_frame_dupes.py --include-debug  # assets/_debug_* も母集団に含める

  exit code: 0 = 正常終了 / 1 = --fail-on-dup 指定時に重複あり / 2 = 対象シートなし
"""
import argparse
import glob
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_attack_scale import (  # noqa: E402  (物差しを共有するための後置 import)
    DEBUG_PREFIX,
    ENEMY_ROW_ATTACK,
    ENEMY_ROW_WALK,
    NON_STANDARD_SHEETS,
    PAIR_ROW,
    SKIP_TOKENS,
    infer_grid_enemy,
    infer_grid_pair,
)

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROW_LABELS = ["idle", "alert", "walk", "attack", "death"]


def cell_hash(cell_rgba):
    """1 セルの正規化 md5。完全に透明なら None。"""
    a = cell_rgba[:, :, 3]
    if not a.any():
        return None
    norm = cell_rgba.copy()
    norm[a == 0] = 0          # 透明部分の RGB ノイズを潰す
    return hashlib.md5(norm.tobytes()).hexdigest()


def row_hashes(rgba, cell, cols, row):
    """1 行分の [(frame_index, md5)] (透明セルは除外)。"""
    y0, y1 = row * cell, (row + 1) * cell
    out = []
    for c in range(cols):
        h = cell_hash(rgba[y0:y1, c * cell:(c + 1) * cell])
        if h:
            out.append((c, h))
    return out


def dup_groups(hashes):
    """[(frame_index, md5)] -> 同一 md5 で 2 コマ以上ある組のリスト [[idx,...], ...]。"""
    by = {}
    for idx, h in hashes:
        by.setdefault(h, []).append(idx)
    return [sorted(v) for v in by.values() if len(v) >= 2]


def scan_row(rgba, cell, cols, row, label):
    hashes = row_hashes(rgba, cell, cols, row)
    groups = dup_groups(hashes)
    return dict(
        row=row, label=label,
        frames=len(hashes),
        distinct=len({h for _, h in hashes}),
        dup_groups=groups,
        dup_frames=sum(len(g) - 1 for g in groups),
    )


def scan_enemy(path, name, all_rows):
    img = Image.open(path).convert("RGBA")
    W, H = img.size
    rgba = np.array(img)

    if name in NON_STANDARD_SHEETS:
        spec = NON_STANDARD_SHEETS[name]
        cell, cols = spec["cell"], spec["cols"]
        rows = []
        for cname, base in sorted(spec.get("creatures", {"": 0}).items(), key=lambda kv: kv[1]):
            for i, lab in enumerate(ROW_LABELS):
                if not all_rows and lab not in ("walk", "attack"):
                    continue
                r = base + i
                if (r + 1) * cell > H:
                    continue
                rows.append(scan_row(rgba, cell, cols, r, f"{cname}:{lab}" if cname else lab))
        return dict(sheet=name, kind="anim", size=f"{W}x{H}", cell=cell, cols=cols,
                    nonstandard=spec["reason"], rows=rows, placeholder=False)

    grid = infer_grid_enemy(W, H)
    if not grid:
        return dict(sheet=name, kind="anim", size=f"{W}x{H}", skip="grid not inferable")
    cell, nrows, cols = grid

    atk_hashes = row_hashes(rgba, cell, cols, ENEMY_ROW_ATTACK)
    ref = cell_hash(rgba[ENEMY_ROW_WALK * cell:(ENEMY_ROW_WALK + 1) * cell, 0:cell])
    placeholder = bool(ref) and bool(atk_hashes) and {h for _, h in atk_hashes} == {ref}

    wanted = range(nrows) if all_rows else (ENEMY_ROW_WALK, ENEMY_ROW_ATTACK)
    rows = []
    for r in wanted:
        if r >= nrows:
            continue
        lab = ROW_LABELS[r] if r < len(ROW_LABELS) else f"row{r}"
        rows.append(scan_row(rgba, cell, cols, r, lab))
    return dict(sheet=name, kind="anim", size=f"{W}x{H}", cell=cell, cols=cols,
                rows=rows, placeholder=placeholder)


def scan_pair(wpath, apath, name):
    wimg = Image.open(wpath).convert("RGBA")
    aimg = Image.open(apath).convert("RGBA")
    gw, ga = infer_grid_pair(*wimg.size), infer_grid_pair(*aimg.size)
    if not gw or not ga:
        return dict(sheet=name, kind="pair", skip="grid not inferable")
    cw, rw, colw = gw
    ca, ra, cola = ga
    roww = min(PAIR_ROW, rw - 1)
    rowa = min(PAIR_ROW, ra - 1)
    wa = np.array(wimg)
    aa = np.array(aimg)
    atk_hashes = row_hashes(aa, ca, cola, rowa)
    rows = [
        scan_row(wa, cw, colw, roww, "walk"),
        scan_row(aa, ca, cola, rowa, "attack"),
    ]
    ref = cell_hash(wa[roww * cw:(roww + 1) * cw, 0:cw])
    placeholder = bool(ref) and bool(atk_hashes) and {h for _, h in atk_hashes} == {ref}
    return dict(sheet=name, kind="pair",
                size=f"{wimg.size[0]}x{wimg.size[1]} + {aimg.size[0]}x{aimg.size[1]}",
                cell=cw, cols=colw, rows=rows, placeholder=placeholder)


def collect(assets_dir, name_filter, include_debug, all_rows):
    def excluded(name):
        if any(t in name for t in SKIP_TOKENS):
            return True
        if not include_debug and name.startswith(DEBUG_PREFIX):
            return True
        return bool(name_filter) and name_filter.lower() not in name.lower()

    out = []
    for path in sorted(glob.glob(os.path.join(assets_dir, "*_anim.png"))):
        name = os.path.basename(path)[: -len("_anim.png")]
        if excluded(name):
            continue
        out.append(scan_enemy(path, name, all_rows))

    for wpath in sorted(glob.glob(os.path.join(assets_dir, "*_walk.png"))):
        base = wpath[: -len("_walk.png")]
        apath = base + "_attack.png"
        name = os.path.basename(base)
        if excluded(name):
            continue
        if not os.path.exists(apath):
            out.append(dict(sheet=name, kind="pair", skip="attack シートが存在しない"))
            continue
        out.append(scan_pair(wpath, apath, name))
    return out


def total_dups(rec):
    return sum(r["dup_frames"] for r in rec.get("rows", []))


def print_table(records, all_rows):
    bad = [r for r in records if total_dups(r) > 0]
    ph = [r for r in records if r.get("placeholder")]
    skipped = [r for r in records if r.get("skip")]
    ns = [r for r in records if r.get("nonstandard")]

    print(f"■ 走査 {len(records)} シート "
          f"(行: {'全5行' if all_rows else 'walk + attack のみ'})")
    print()
    if bad:
        print("── 重複コマあり ─────────────────────────────────────────")
        print(f"{'sheet':24s} {'kind':5s} {'row':10s} {'frames':>6s} {'distinct':>8s}  dup groups")
        for r in sorted(bad, key=lambda x: -total_dups(x)):
            for row in r["rows"]:
                if not row["dup_groups"]:
                    continue
                gs = " ".join("{" + ",".join(str(i) for i in g) + "}" for g in row["dup_groups"])
                print(f"{r['sheet']:24s} {r['kind']:5s} {row['label']:10s} "
                      f"{row['frames']:6d} {row['distinct']:8d}  {gs}")
        print()
    else:
        print("重複コマ: 0 件\n")

    if ph:
        print("── placeholder (attack 行が walk 1 コマ目の完全コピー = 攻撃モーション未実装) ──")
        for r in ph:
            print(f"  {r['sheet']} ({r['kind']})")
        print()
    if skipped:
        print("── skip ────────────────────────────────────────────────")
        for r in skipped:
            print(f"  {r['sheet']:24s} {r['skip']}")
        print()
    if ns:
        print("── non-standard (実グリッドで測り直し) ─────────────────")
        for r in ns:
            print(f"  {r['sheet']:24s} {r['nonstandard']}")
        print()

    print(f"合計: 重複ありシート {len(bad)} / 走査 {len(records)}"
          f" (placeholder {len(ph)} / skip {len(skipped)})")
    return len(bad)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", default=os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets"))
    ap.add_argument("--sheet", default="", help="名前部分一致で絞り込み")
    ap.add_argument("--all-rows", action="store_true", help="idle/alert/death 行も見る")
    ap.add_argument("--include-debug", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--fail-on-dup", action="store_true")
    args = ap.parse_args()

    records = collect(args.assets, args.sheet, args.include_debug, args.all_rows)
    if not records:
        print("対象シートなし", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(records, ensure_ascii=False, indent=2))
        nbad = sum(1 for r in records if total_dups(r) > 0)
    else:
        nbad = print_table(records, args.all_rows)
    return 1 if (args.fail_on_dup and nbad) else 0


if __name__ == "__main__":
    sys.exit(main())
