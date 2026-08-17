#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/paint_blocked_grid.py — 1 枚絵の「障害物マスク (blocked)」を書くための作業用画像を出す

★[卓上グリッド P2b] 何のためにあるか
    ROOM_PAINTINGS_DEF[theme][key].blocked は 1 文字 = 1 タイルの行文字列で、
    山場の絵なら 20x16 = 320 セルある。**素の絵を眺めて 320 セルを間違えずに拾うのは無理**。
    そこで「絵の上にタイル境界と行/列番号を焼いた画像」を出し、それを見ながら書く。

★使い方
    py tools/paint_blocked_grid.py --theme goblin-mine --key 1
        → out/paint_blocked/goblin-mine_1_grid.png    (作業用画像)
          out/paint_blocked/goblin-mine_1_blocked.txt (index.html へ貼る雛形)

    py tools/paint_blocked_grid.py --list            全エントリの一覧 (theme / key / 何タイル / 現在の #)
    py tools/paint_blocked_grid.py --all             全エントリぶん一気に出す
    py tools/paint_blocked_grid.py --theme X --key 1 --rows 0-7
        → 行 0..7 だけを大きく出す (行数の多い絵を分割して読むため)

⚠ 現在の blocked が入っているエントリは、そのセルを**半透明の赤**で塗って出す。
   「書いたつもりがずれている」を目で確かめる用 (書き足しの反復に使う)。

⚠⚠ 座標系は **絵ローカル** (左上のタイルが 0,0)。blocked はこの座標で書く。
   絵がマップ上のどこへ貼られるか (tileBounds の絶対座標) は雛形の見出しに出すが、
   マスクはローカルで書く — 絵は 2 経路 (絵側の tileBounds へ / 部屋の rect へ) で貼られ、
   絶対座標で書くと mapDef 経路でずれるため (js/df-mapdef.js の節頭を参照)。

⚠ ROOM_PAINTINGS_DEF は index.html から**実行時に読む**。ここに表を写経しない
   (写経した瞬間に本編の差し替えへ追従しなくなる = df-mapdef.js と同じ判断)。
"""

import argparse
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_HTML = os.path.join(ROOT, "index.html")
OUT_DIR = os.path.join(ROOT, "out", "paint_blocked")
CATALOG_MARK = "const ROOM_PAINTINGS_DEF = {"
BLOCK_CHAR = "#"          # ★js/df-mapdef.js の PAINTING_BLOCK_CHAR と同じ綴り


# ──────────────────────────────────────────────────────────────────────────────
# index.html から ROOM_PAINTINGS_DEF を読む
#   ⚠ 失敗は必ず例外で落とす。None を返して握り潰すと「書式が変わった」に気づけない
#     (df-mapdef.js の parsePaintingCatalog とまったく同じ判断)。
# ──────────────────────────────────────────────────────────────────────────────
def slice_balanced_brace(text, i):
    """text[i] が '{' のとき、対応する '}' までを返す (文字列リテラル内の波括弧は無視)."""
    if text[i] != "{":
        raise ValueError("開き波括弧の位置が違います")
    depth, j, quote = 0, i, None
    while j < len(text):
        ch = text[j]
        if quote:
            if ch == "\\":
                j += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
        j += 1
    raise ValueError("ROOM_PAINTINGS_DEF の { } が閉じていません")


def strip_comments(s):
    """// 行コメントと /* ブロックコメント */ を落とす (文字列リテラルは守る)."""
    out, i, quote = [], 0, None
    while i < len(s):
        ch = s[i]
        if quote:
            out.append(ch)
            if ch == "\\" and i + 1 < len(s):
                out.append(s[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "\"'":
            quote = ch
            out.append(ch)
            i += 1
            continue
        if s.startswith("//", i):
            j = s.find("\n", i)
            i = len(s) if j < 0 else j
            continue
        if s.startswith("/*", i):
            j = s.find("*/", i + 2)
            if j < 0:
                raise ValueError("ブロックコメントが閉じていません")
            i = j + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def parse_catalog(path=INDEX_HTML):
    """-> [{theme, key, src, bounds:(r1,c1,r2,c2), blocked:[str]|None}] (定義順)"""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    i = text.find(CATALOG_MARK)
    if i < 0:
        raise ValueError('index.html に "%s" がありません (書式が変わった可能性)' % CATALOG_MARK)
    body = strip_comments(slice_balanced_brace(text, i + len(CATALOG_MARK) - 1))

    entries = []
    # テーマ: "goblin-mine": { … }
    for m in re.finditer(r'["\']([\w\-]+)["\']\s*:\s*\{', body):
        theme = m.group(1)
        block = slice_balanced_brace(body, m.end() - 1)
        # エントリ: 1: { … } / n4: { … } / "2": { … }
        for em in re.finditer(r'(?:["\']?(\w+)["\']?)\s*:\s*\{', block):
            key = em.group(1)
            eb = slice_balanced_brace(block, em.end() - 1)
            sm = re.search(r'src\s*:\s*["\']([^"\']+)["\']', eb)
            bm = re.search(r'tileBounds\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]', eb)
            if not sm or not bm:
                continue
            km = re.search(r'blocked\s*:\s*\[(.*?)\]', eb, re.S)
            blocked = re.findall(r'["\']([^"\']*)["\']', km.group(1)) if km else None
            entries.append({
                "theme": theme, "key": key, "src": sm.group(1),
                "bounds": tuple(int(x) for x in bm.groups()),
                "blocked": blocked,
            })
    if not entries:
        raise ValueError("ROOM_PAINTINGS_DEF から 1 枚も取り出せませんでした")
    return entries


def entry_wh(e):
    r1, c1, r2, c2 = e["bounds"]
    return (c2 - c1 + 1, r2 - r1 + 1)     # (tw, th)


# ──────────────────────────────────────────────────────────────────────────────
# 作業用画像
# ──────────────────────────────────────────────────────────────────────────────
def pick_font(size):
    for name in ("consola.ttf", "arial.ttf", "DejaVuSansMono.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render(e, scale, row_lo, row_hi, out_png):
    tw, th = entry_wh(e)
    src_path = os.path.join(ROOT, e["src"].replace("/", os.sep))
    if not os.path.exists(src_path):
        raise FileNotFoundError("絵がありません: " + src_path)
    img = Image.open(src_path).convert("RGB").resize((tw * scale, th * scale), Image.LANCZOS)

    row_lo = max(0, row_lo)
    row_hi = min(th - 1, row_hi)
    if row_lo > row_hi:
        raise ValueError("--rows の範囲が空です")
    nrows = row_hi - row_lo + 1

    gutter = max(34, scale // 2)          # 行番号を書く左の余白 / 列番号を書く上の余白
    W, H = gutter + tw * scale, gutter + nrows * scale
    canvas = Image.new("RGB", (W, H), (24, 24, 28))
    canvas.paste(img.crop((0, row_lo * scale, tw * scale, (row_hi + 1) * scale)), (gutter, gutter))

    d = ImageDraw.Draw(canvas, "RGBA")
    font = pick_font(max(11, scale // 4))

    # 既存 blocked を半透明の赤で塗る (書いたつもりがずれていないか目で確かめる用)
    rows = e["blocked"]
    if rows and len(rows) == th:
        for r in range(row_lo, row_hi + 1):
            for c in range(min(tw, len(rows[r]))):
                if rows[r][c] != BLOCK_CHAR:
                    continue
                x0 = gutter + c * scale
                y0 = gutter + (r - row_lo) * scale
                d.rectangle([x0, y0, x0 + scale - 1, y0 + scale - 1], fill=(255, 40, 40, 96))

    # タイル境界。5 マスごとに濃く (卓上マップの慣習 = D&D のバトルマップと同じ読み方)
    for c in range(tw + 1):
        x = gutter + c * scale
        strong = (c % 5 == 0)
        d.line([(x, gutter), (x, H)], fill=(255, 255, 255, 190 if strong else 90),
               width=2 if strong else 1)
    for r in range(row_lo, row_hi + 2):
        y = gutter + (r - row_lo) * scale
        strong = (r % 5 == 0)
        d.line([(gutter, y), (W, y)], fill=(255, 255, 255, 190 if strong else 90),
               width=2 if strong else 1)

    # 行番号 (左) / 列番号 (上)。★絵ローカル座標 = blocked を書く座標
    for c in range(tw):
        d.text((gutter + c * scale + scale // 2, gutter // 2), str(c),
               fill=(255, 226, 120), font=font, anchor="mm")
    for r in range(row_lo, row_hi + 1):
        d.text((gutter // 2, gutter + (r - row_lo) * scale + scale // 2), str(r),
               fill=(255, 226, 120), font=font, anchor="mm")

    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    canvas.save(out_png)
    return out_png, (tw, th)


def template_text(e):
    """index.html へ貼る雛形。既存 blocked があればそれを、無ければ全部 '.' で出す."""
    tw, th = entry_wh(e)
    rows = e["blocked"] if (e["blocked"] and len(e["blocked"]) == th) else ["." * tw] * th
    r1, c1, r2, c2 = e["bounds"]
    head = ("        // %s / %s — %d×%d タイル (tileBounds [%d,%d,%d,%d])。'%s' = 通れない\n"
            % (e["theme"], e["key"], tw, th, r1, c1, r2, c2, BLOCK_CHAR))
    body = "        blocked: [\n"
    for i, row in enumerate(rows):
        body += '          "%s",   // %d\n' % (row.ljust(tw, ".")[:tw], i)
    body += "        ],\n"
    return head + body


def main():
    ap = argparse.ArgumentParser(description="1 枚絵の障害物マスクを書くための作業用画像を出す")
    ap.add_argument("--theme", help="テーマ id (例: goblin-mine)")
    ap.add_argument("--key", help="部屋キー (例: 1 / 2 / n4 / n7)")
    ap.add_argument("--all", action="store_true", help="全エントリぶん出す")
    ap.add_argument("--list", action="store_true", help="一覧だけ出して終わる")
    ap.add_argument("--scale", type=int, default=64, help="1 タイルあたりの px (既定 64)")
    ap.add_argument("--rows", default=None, help="行範囲 R1-R2 に絞る (例: 0-7)")
    ap.add_argument("--out-dir", default=OUT_DIR)
    a = ap.parse_args()

    entries = parse_catalog()

    if a.list:
        # ⚠ 見出しは ASCII のまま。Windows コンソール (cp932) で日本語を混ぜると化ける。
        print("theme                key   tiles    src                                   blocked#")
        for e in entries:
            tw, th = entry_wh(e)
            rows = e["blocked"]
            n = sum(r.count(BLOCK_CHAR) for r in rows) if rows else 0
            bad = bool(rows) and not (len(rows) == th and all(len(r) == tw for r in rows))
            print("%-20s %-5s %2dx%-3d  %-37s %4d%s"
                  % (e["theme"], e["key"], tw, th, e["src"], n, "  ⚠寸法不一致" if bad else ""))
        return 0

    if a.all:
        targets = entries
    else:
        if not a.theme or not a.key:
            ap.error("--theme と --key を指定するか、--all / --list を使ってください")
        targets = [e for e in entries if e["theme"] == a.theme and e["key"] == str(a.key)]
        if not targets:
            print("該当なし: %s / %s  (--list で一覧)" % (a.theme, a.key), file=sys.stderr)
            return 2

    row_lo, row_hi = 0, 10 ** 9
    if a.rows:
        m = re.match(r"^(\d+)-(\d+)$", a.rows)
        if not m:
            ap.error("--rows は R1-R2 の形で指定してください")
        row_lo, row_hi = int(m.group(1)), int(m.group(2))

    for e in targets:
        stem = "%s_%s" % (e["theme"], e["key"])
        if a.rows:
            stem += "_r%d-%d" % (row_lo, row_hi)
        png = os.path.join(a.out_dir, stem + "_grid.png")
        try:
            png, (tw, th) = render(e, a.scale, row_lo, row_hi, png)
        except FileNotFoundError as ex:
            print("skip %s: %s" % (stem, ex), file=sys.stderr)
            continue
        txt = os.path.join(a.out_dir, "%s_%s_blocked.txt" % (e["theme"], e["key"]))
        with open(txt, "w", encoding="utf-8") as f:
            f.write(template_text(e))
        print("%s  (%dx%d タイル)\n  %s\n  %s" % (stem, tw, th, png, txt))
    return 0


if __name__ == "__main__":
    sys.exit(main())
