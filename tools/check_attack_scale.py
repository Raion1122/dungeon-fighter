#!/usr/bin/env python3
"""walk / attack の「体高」比較チェッカー — 攻撃モーション時のサイズ変動を機械計測する。

■ 何を測るツールか
  キャラが攻撃モーションに切り替わった瞬間、見かけの大きさが変わる不具合がある。
  本ツールは各スプライトシートの **walk 行** と **attack 行** の「体の高さ (bodyH)」の
  中央値を比べ、`delta = (attack - walk) / walk` を出す。|delta| が閾値 (既定 5%) を
  超えたシートを WARN として報告する。

■ 実測で確定済みの前提 (2026-07-29 / 母集団 72 シート・測り直し不要)
  - 攻撃コマは平均で「小さくなる」= 体高 median 約 -2.7%
  - **足元は既に合っている** (feet の差は median 0px) → 位置ではなく純粋にスケールの問題
  - 体感で気づく閾値 ≈ ±5〜6%
  - 病気は 2 系統:
      A系 = tools/pack_codex1_sprites.py が共通スケール 1 個で素材のズーム差を素通し
      B系 = source_images/*/_extract.py が walk と attack を独立にスケール決定
  - ❌ 否定済みの仮説 (蒸し返さないこと):
      「武器で bbox が伸びる」(bboxH と体高は r=0.92 で同符号) / レイヤー分離 / 固定ピボット
  - ❌ 使用禁止の指標: shoulderW と torsoDiag
      (攻撃で腕を広げるので +8%〜+100% 汚染される。だから **高さ** で測る)

■ 測定アルゴリズム
  各セルについて:
    - alpha > 64 を不透明とみなす
    - 行 y ごとの不透明画素数 cnt[y] を数える
    - top    = cnt[y] >= max(cnt) * 0.25 を満たす **最上行** (= 頭頂)
               ※ 25% 閾値は武器・角・尻尾などの「細い突起」を頭頂と誤認しないため
    - bottom = 不透明画素が 1 個でもある **最下行** (= bbox 下端 = 足元)
    - bodyH  = bottom - top + 1
  行 (walk 行 / attack 行) ごとに **全フレームの bodyH の中央値** を取り、
  delta = (median(attack) - median(walk)) / median(walk) を算出する。
  参考値として bboxH (不透明の最上行〜最下行) と feet (= bottom) も出す。

■ 走査対象とグリッド
  (1) 敵シート  assets/*_anim.png … 1 枚に 5 行 (idle / alert / walk / attack / death)。
      **walk = row 2 / attack = row 3** (0-indexed。index.html の updateEnemyAnim と一致)。
      セルは 96px が基本だが 192px (大型) や 64px も混在するため **必ず実画像から推定** する。
  (2) PT/仲間ペア assets/<name>_walk.png と assets/<name>_attack.png が **両方ある** もの。
      どちらも右向き行 (= 最終行、標準は row 3) のみが実データ。
      標準は walk 576x384 (96px x 6F) / attack 480x384 (96px x 5F) だが、これも実画像から推定。

  グリッド推定はハードコードせず、画像サイズから求める:
      敵シート  … 5 行構成が前提なので cell = H // 5 を第一候補にし、
                   割り切れない/列が合わない場合のみ約数法へフォールバック
      ペア      … 約数法 (W と H の共通約数のうち「列数 >= 4」を満たす最大の cell)
                   例 576x384 -> 96 (6 列 4 行) / 480x384 -> 96 (5 列 4 行) / 1152x192 -> 192 (6 列 1 行)

■ 除外条件
  - 完全に透明なセル (不透明画素ゼロ) はフレーム数に数えない
  - **placeholder**: attack 行の全フレームが walk 行の 1 コマ目の完全コピーになっている
    シートは「攻撃モーション未実装」なので比較対象から外し、その旨を出力に明示する
  - **non-standard**: 「1 体 × 5 行」の前提を満たさないシート (NON_STANDARD_SHEETS)。
    行同士の体高比較が原理的に成立しないので比較対象から外す。⚠ サイレント除外は禁止で、
    skip 理由と「実グリッドで測り直した参考値」を必ず出力する
  - fx_ を含む名前 / explosion を含む名前 (人型でない VFX シート) は skip
  - `_debug_*` (index.html/tavern.html から一切参照されていない検証用ダンプ。中身は
    banditHeavy / banditMage / lizardWarrior / scar の 2 倍スケール複製) も既定で skip。
    母集団を二重計上させないため。見たいときは --include-debug。

■ 使い方
  py tools/check_attack_scale.py                 # 全シート走査してサマリ表
  py tools/check_attack_scale.py --threshold 5   # WARN 閾値(%) 変更 (既定 5.0)
  py tools/check_attack_scale.py --sheet goblin  # 名前部分一致で絞り込み
  py tools/check_attack_scale.py --json          # 機械可読出力 (自動検証用)
  py tools/check_attack_scale.py --fail-on-warn  # WARN が 1 件でもあれば exit 1 (回帰検知)
  py tools/check_attack_scale.py --include-debug # assets/_debug_* も母集団に含める

  exit code: 0 = 正常終了 / 1 = --fail-on-warn 指定時に WARN あり / 2 = 対象シートなし
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

# cp932 コンソールでも日本語を出せるよう UTF-8 化 (出力失敗での誤 exit を防ぐ)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ALPHA_THRESHOLD = 64      # これより大きい alpha を「不透明」とみなす
HEAD_FRAC = 0.25          # 頭頂判定: 行の不透明画素数が最大値の 25% 以上
ENEMY_ROWS = 5            # 敵 anim シートの標準行数 (idle/alert/walk/attack/death)
ENEMY_ROW_WALK = 2
ENEMY_ROW_ATTACK = 3
PAIR_ROW = 3              # PT ペアシートの右向き行 (行数が足りなければ最終行へクランプ)
MIN_COLS = 4              # 約数法でセルを決める際に要求する最小列数
BIG_DELTA = 10.0          # サマリで「>10%」として数える閾値 (%)
SKIP_TOKENS = ("fx_", "explosion")   # 人型でない VFX シート
DEBUG_PREFIX = "_debug_"             # 未参照の検証用ダンプ (既定で母集団から外す)


# ── 標準前提から外れるシートの明示的な例外 ──────────────────────────
# assets/*_anim.png の前提は「1 体 × 5 行 (idle/alert/walk/attack/death)」で、
# セルは H//5 から推定する。この前提を満たさないシートは
# **推定グリッドがそもそも実フレーム境界と一致しない**ため行同士の体高比較が
# 原理的に成立しない。ここに理由付きで登録し、比較対象 (OK/WARN) から外す。
#
# ⚠ サイレント除外は禁止。skip 理由と「実グリッドで測り直した参考値」を必ず出力すること
#   (次にこの表を見た人が「WARN を直し忘れている」と誤解しないため)。
NON_STANDARD_SHEETS = {
    # ── rat_bat: 「直すべき絵の不具合」ではなく **計測アーティファクト** ────────
    # assets/rat_bat_anim.png は 320x320 に **32px フレームを 10 列 x 10 行** 並べた
    # 2 体混載シート (index.html ENEMY_TYPES.rat = frameW/frameH:32, cols:10, rowOffset:0)。
    #   rows 0-4 = ジャイアントラット / rows 5-9 = コウモリ (各 idle/alert/walk/attack/death)
    # 既定の推定 (cell = H//5 = 64px) だと 1 セルに実フレームが 2x2 個入るので、
    # 「walk 行」  = rat death + bat idle
    # 「attack 行」= bat alert + bat walk
    # という無関係な組み合わせを比べることになる。かつて出ていた +22.58% はこれが原因。
    #
    # 実グリッド (32px x 10 列) で測り直すと:
    #   rat  walk 9.0px -> attack 8.5px (= -5.56%)  … 差は **0.5px**。32px 素材の量子化下限で、
    #        displaySize 54 でも画面上 0.84px。体感閾値 (5〜6%) の「%」は満たしても実体がない。
    #   bat  walk 7.0px -> attack 10.0px            … 翼を広げる攻撃モーションなので当然増える。
    # さらに決定的な事実として index.html の rat は hasAttackAnim を持たない (contactDamage) ため
    # **attack 行 (row 3) はゲーム中に一度も描画されない** (updateEnemyAnim の row=3 分岐は
    # `enemy.state === "attack" && def.hasAttackAnim` が条件)。bat 側 (rows 5-9) は
    # どの ENEMY_TYPES からも参照されていない。
    # → PNG は正常。**後処理で縮小してはいけない** (無関係な行同士の比率を焼き付けることになる)。
    "rat_bat": dict(
        cell=32, cols=10,
        creatures={"rat": 0, "bat": 5},   # 各生き物の 5 行ブロックの先頭 row
        reason="mixed-subject (32px 10x10 の 2 体混載: rat rows0-4 / bat rows5-9)。"
               "行同士の体高比較は成立しない",
    ),
}


# ── グリッド推定 ────────────────────────────────────────────────
def divisor_cell(W, H, min_cols=MIN_COLS):
    """W と H の共通約数のうち「列数 >= min_cols」を満たす最大のセル px を返す。"""
    for c in range(min(W, H), 0, -1):
        if W % c == 0 and H % c == 0 and W // c >= min_cols:
            return c
    return None


def infer_grid_enemy(W, H):
    """敵 anim シートのグリッド (cell, rows, cols)。5 行構成を第一候補にする。"""
    if H % ENEMY_ROWS == 0:
        cell = H // ENEMY_ROWS
        if cell > 0 and W % cell == 0:
            return cell, ENEMY_ROWS, W // cell
    cell = divisor_cell(W, H)
    if not cell:
        return None
    return cell, H // cell, W // cell


def infer_grid_pair(W, H):
    """PT ペアシートのグリッド (cell, rows, cols)。約数法。"""
    cell = divisor_cell(W, H)
    if not cell:
        return None
    return cell, H // cell, W // cell


# ── 計測 ────────────────────────────────────────────────────────
def cell_metrics(cell_alpha):
    """1 セルの (bodyH, bboxH, feet)。完全に透明なら None。"""
    cnt = (cell_alpha > ALPHA_THRESHOLD).sum(axis=1)
    peak = int(cnt.max()) if cnt.size else 0
    if peak <= 0:
        return None
    ys = np.where(cnt > 0)[0]
    bbox_top, bottom = int(ys[0]), int(ys[-1])
    # 頭頂 = 「幅のある行」の最上端 (細い突起 = 武器/角/尻尾 を頭頂と誤認しない)
    top = int(np.where(cnt >= peak * HEAD_FRAC)[0][0])
    return dict(bodyH=bottom - top + 1, bboxH=bottom - bbox_top + 1, feet=bottom)


def row_metrics(alpha, cell, cols, row):
    """1 行分の全フレームの計測値リスト (透明セルは除外)。"""
    out = []
    y0, y1 = row * cell, (row + 1) * cell
    for c in range(cols):
        m = cell_metrics(alpha[y0:y1, c * cell:(c + 1) * cell])
        if m:
            out.append(m)
    return out


def median_of(records, key):
    return float(np.median([r[key] for r in records])) if records else 0.0


def is_placeholder(rgba_w, cell_w, row_w, rgba_a, cell_a, cols_a, row_a):
    """attack 行の全フレームが walk 行の 1 コマ目と画素完全一致なら True。"""
    if cell_w != cell_a:
        return False
    ref = rgba_w[row_w * cell_w:(row_w + 1) * cell_w, 0:cell_w]
    ya0, ya1 = row_a * cell_a, (row_a + 1) * cell_a
    for c in range(cols_a):
        if not np.array_equal(rgba_a[ya0:ya1, c * cell_a:(c + 1) * cell_a], ref):
            return False
    return True


def build_record(name, kind, walk_img, walk_grid, row_w, atk_img, atk_grid, row_a, threshold):
    """1 シート (または 1 ペア) の計測レコードを組み立てる。"""
    cell_w, rows_w, cols_w = walk_grid
    cell_a, rows_a, cols_a = atk_grid
    rgba_w = np.array(walk_img)
    rgba_a = rgba_w if atk_img is walk_img else np.array(atk_img)

    rec = dict(sheet=name, kind=kind, cell=cell_w, cols=cols_w,
               row_walk=row_w, row_attack=row_a, verdict="skip", reason="")

    if row_w >= rows_w or row_a >= rows_a:
        rec["reason"] = f"row out of range (rows_walk={rows_w} rows_attack={rows_a})"
        return rec

    mw = row_metrics(rgba_w[:, :, 3], cell_w, cols_w, row_w)
    ma = row_metrics(rgba_a[:, :, 3], cell_a, cols_a, row_a)
    rec["frames_walk"], rec["frames_attack"] = len(mw), len(ma)
    if not mw or not ma:
        rec["reason"] = "empty row (no opaque frames)"
        return rec

    if is_placeholder(rgba_w, cell_w, row_w, rgba_a, cell_a, cols_a, row_a):
        rec["verdict"] = "placeholder"
        rec["reason"] = "attack row is a pixel-exact copy of walk frame 0"

    wb, ab = median_of(mw, "bodyH"), median_of(ma, "bodyH")
    rec["walk_bodyH_median"] = wb
    rec["attack_bodyH_median"] = ab
    rec["delta_pct"] = round((ab - wb) / wb * 100.0, 2) if wb else 0.0

    wx, ax = median_of(mw, "bboxH"), median_of(ma, "bboxH")
    rec["walk_bboxH_median"], rec["attack_bboxH_median"] = wx, ax
    rec["bbox_delta_pct"] = round((ax - wx) / wx * 100.0, 2) if wx else 0.0

    wf, af = median_of(mw, "feet"), median_of(ma, "feet")
    rec["walk_feet_median"], rec["attack_feet_median"] = wf, af
    rec["feet_delta_px"] = round(af - wf, 1)

    if rec["verdict"] != "placeholder":
        rec["verdict"] = "WARN" if abs(rec["delta_pct"]) > threshold else "OK"
    return rec


def nonstandard_record(name, img, spec):
    """NON_STANDARD_SHEETS のシートの skip レコード。

    比較対象からは外すが、**実グリッドで測り直した参考値**を per_creature に同梱する
    (除外をサイレントにしないため。--json でもそのまま読める)。
    """
    cell, cols = spec["cell"], spec["cols"]
    alpha = np.array(img)[:, :, 3]
    rows = alpha.shape[0] // cell
    info = []
    for label, off in spec["creatures"].items():
        rw, ra = off + ENEMY_ROW_WALK, off + ENEMY_ROW_ATTACK
        if ra >= rows:
            continue
        mw = row_metrics(alpha, cell, cols, rw)
        ma = row_metrics(alpha, cell, cols, ra)
        wb, ab = median_of(mw, "bodyH"), median_of(ma, "bodyH")
        info.append(dict(
            creature=label, row_walk=rw, row_attack=ra,
            walk_bodyH_median=wb, attack_bodyH_median=ab,
            delta_pct=round((ab - wb) / wb * 100.0, 2) if wb else 0.0,
            feet_delta_px=round(median_of(ma, "feet") - median_of(mw, "feet"), 1)))
    return dict(sheet=name, kind="anim", verdict="skip", reason=spec["reason"],
                nonstandard=True, cell=cell, cols=cols, per_creature=info)


# ── 収集 ────────────────────────────────────────────────────────
def collect(assets_dir, name_filter, threshold, include_debug=False):
    records = []

    def excluded(name):
        if any(t in name for t in SKIP_TOKENS):
            return True
        if not include_debug and name.startswith(DEBUG_PREFIX):
            return True
        return bool(name_filter) and name_filter.lower() not in name.lower()

    # (1) 敵シート assets/*_anim.png
    for path in sorted(glob.glob(os.path.join(assets_dir, "*_anim.png"))):
        name = os.path.basename(path)[: -len("_anim.png")]
        if excluded(name):
            continue
        img = Image.open(path).convert("RGBA")
        # 標準前提を満たさないシートは推定グリッドを使わず、理由付きで比較対象から外す
        if name in NON_STANDARD_SHEETS:
            records.append(nonstandard_record(name, img, NON_STANDARD_SHEETS[name]))
            continue
        grid = infer_grid_enemy(*img.size)
        if not grid:
            records.append(dict(sheet=name, kind="anim", verdict="skip",
                                reason=f"grid not inferable from {img.size[0]}x{img.size[1]}"))
            continue
        records.append(build_record(name, "anim", img, grid, ENEMY_ROW_WALK,
                                    img, grid, ENEMY_ROW_ATTACK, threshold))

    # (2) PT/仲間ペア assets/<name>_walk.png + <name>_attack.png
    for wpath in sorted(glob.glob(os.path.join(assets_dir, "*_walk.png"))):
        base = wpath[: -len("_walk.png")]
        apath = base + "_attack.png"
        if not os.path.exists(apath):
            continue
        name = os.path.basename(base)
        if excluded(name):
            continue
        wimg = Image.open(wpath).convert("RGBA")
        aimg = Image.open(apath).convert("RGBA")
        gw, ga = infer_grid_pair(*wimg.size), infer_grid_pair(*aimg.size)
        if not gw or not ga:
            records.append(dict(sheet=name, kind="pair", verdict="skip",
                                reason="grid not inferable"))
            continue
        records.append(build_record(name, "pair", wimg, gw, min(PAIR_ROW, gw[1] - 1),
                                    aimg, ga, min(PAIR_ROW, ga[1] - 1), threshold))
    return records


def summarize(records, threshold):
    cmp_ = [r for r in records if r["verdict"] in ("OK", "WARN")]
    deltas = [r["delta_pct"] for r in cmp_]
    return dict(
        total=len(records),
        compared=len(cmp_),
        ok=sum(1 for r in cmp_ if r["verdict"] == "OK"),
        warn=sum(1 for r in cmp_ if r["verdict"] == "WARN"),
        over_big=sum(1 for d in deltas if abs(d) > BIG_DELTA),
        placeholder=sum(1 for r in records if r["verdict"] == "placeholder"),
        skipped=sum(1 for r in records if r["verdict"] == "skip"),
        median_delta_pct=round(float(np.median(deltas)), 2) if deltas else 0.0,
        min_delta_pct=round(min(deltas), 2) if deltas else 0.0,
        max_delta_pct=round(max(deltas), 2) if deltas else 0.0,
        threshold_pct=threshold,
        big_threshold_pct=BIG_DELTA,
    )


def print_table(records, summary, threshold):
    print(f"{'sheet':<26} {'kind':<5} {'walk':>7} {'attack':>7} {'delta%':>8} "
          f"{'bbox%':>7} {'feetdx':>7}  verdict")
    print("-" * 88)
    for r in records:
        if "delta_pct" not in r:
            print(f"{r['sheet']:<26} {r.get('kind',''):<5} {'-':>7} {'-':>7} {'-':>8} "
                  f"{'-':>7} {'-':>7}  skip ({r.get('reason','')})")
            continue
        mark = {"WARN": "!", "placeholder": "-", "skip": "?"}.get(r["verdict"], " ")
        print(f"{r['sheet']:<26} {r['kind']:<5} {r['walk_bodyH_median']:>7.1f} "
              f"{r['attack_bodyH_median']:>7.1f} {r['delta_pct']:>+8.2f} "
              f"{r['bbox_delta_pct']:>+7.2f} {r['feet_delta_px']:>+7.1f}  {mark}{r['verdict']}")
    print("-" * 88)
    print(f"total={summary['total']}  compared={summary['compared']}  "
          f"OK={summary['ok']}  WARN(|d|>{threshold:g}%)={summary['warn']}  "
          f"|d|>{BIG_DELTA:g}%={summary['over_big']}  "
          f"placeholder={summary['placeholder']}  skip={summary['skipped']}")
    print(f"median delta = {summary['median_delta_pct']:+.2f}%   "
          f"min = {summary['min_delta_pct']:+.2f}%   max = {summary['max_delta_pct']:+.2f}%")
    print("※ delta<0 = 攻撃コマの方が小さい。体感閾値は約 ±5〜6%。"
          "feetdx≒0 なら位置ではなくスケールの問題 (実測どおり)。")
    # 除外はサイレントにしない: 理由 + 実グリッドでの参考値を必ず出す
    for r in records:
        if not r.get("nonstandard"):
            continue
        print(f"※ skip: {r['sheet']} — {r['reason']}")
        for i in r.get("per_creature", []):
            print(f"    参考(実グリッド {r['cell']}px x {r['cols']}列): {i['creature']:<4}"
                  f" walk row{i['row_walk']}={i['walk_bodyH_median']:.1f}px"
                  f" -> attack row{i['row_attack']}={i['attack_bodyH_median']:.1f}px"
                  f"  delta={i['delta_pct']:+.2f}%  feetdx={i['feet_delta_px']:+.1f}")


def main():
    ap = argparse.ArgumentParser(
        description="walk/attack 体高比較チェッカー (攻撃モーションのサイズ変動を計測)")
    ap.add_argument("--assets", default=None,
                    help="assets ディレクトリ (既定: リポジトリ直下の assets/)")
    ap.add_argument("--threshold", type=float, default=5.0,
                    help="WARN 閾値 (%%)。既定 5.0")
    ap.add_argument("--sheet", default=None, help="シート名の部分一致で絞り込み")
    ap.add_argument("--json", action="store_true", help="機械可読 JSON で出力")
    ap.add_argument("--fail-on-warn", action="store_true",
                    help="WARN が 1 件でもあれば exit 1")
    ap.add_argument("--include-debug", action="store_true",
                    help="assets/_debug_* (未参照の検証用ダンプ) も母集団に含める")
    a = ap.parse_args()

    assets = a.assets or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
    if not os.path.isdir(assets):
        print(f"assets ディレクトリが見つかりません: {assets}", file=sys.stderr)
        sys.exit(2)

    records = collect(assets, a.sheet, a.threshold, a.include_debug)
    if not records:
        print("対象シートがありません (--sheet の絞り込みが厳しすぎる可能性)", file=sys.stderr)
        sys.exit(2)

    # 悪いものが目に付くよう |delta| 降順。計測不能 (skip) は末尾へ。
    records.sort(key=lambda r: (-abs(r["delta_pct"]) if "delta_pct" in r else 1e9))
    summary = summarize(records, a.threshold)

    if a.json:
        print(json.dumps(dict(summary=summary, sheets=records),
                         ensure_ascii=False, indent=2))
    else:
        print_table(records, summary, a.threshold)

    sys.exit(1 if (a.fail_on_warn and summary["warn"]) else 0)


if __name__ == "__main__":
    main()
