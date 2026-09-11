#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ツリーの行末が .gitattributes の宣言どおりかを検査する道具。

出典: 実装依頼書/2026-09-10_eol-unify-and-door-fixture.md 5-3 (#65 項目3b で裁定 (C) へ改訂)

肝 = 本番ツリーにも隔離ワークツリーにも同じものを当てられること。
#64 は git worktree add が core.autocrlf=true の下で 389 ファイルを CRLF 化し、
LF を含む変異アンカーが全部空振りして偽の EXIT=3 を出した。
この道具はその「作った直後の byte 比較」を機械化する側の半分にあたる。

注意 (2 経路): 期待の行末は .gitattributes の写経ではなく
`git check-attr eol` の答えから引く。宣言と git の解釈が食い違ったとき
(書式ミス / パターンの取りこぼし) に気づけるのはこの 2 経路構成だけ。
受入 (0b) がこれを要求している。

注意 (grep 禁止): 行末は grep で測らない。LF しか無いファイルに対して
「CR 行数 = 総行数」という真逆の答えが返る (#65 項目1 が実際に踏んだ)。
ここでは 'rb' で読んだバイトを数える。

裁定 (C) = 既定 LF + 配信物だけ CRLF (2026-09-11 / #65 項目3b):
  ⭐⭐⭐ .gitattributes は「全部同じにする」ものではなく
     **道具が実際に書き出す姿を宣言する**もの、という原理で決めた。
     (例: tools/_golden.js:157 は常に LF で書くので tools/goldens/ は LF が正)
  ⇒ 2026-09-11 実測で **追跡 840 本 = binary 363 / テキスト 477 が全部宣言どおり**に
     なった (食い違い 0)。ship 22 / hook 2 / other 453。

判定の強さ (⭐ 裁定 (C) で other を「報告のみ」から**致命へ格上げ**した):
  ship  ... 配信物 (ブラウザが実際に読む root/*.html, root/*.js, js/**/*.js, **/*.css)
            食い違いは致命。行末が動くと変異アンカーと golden が黙って空振りする。
  hook  ... scripts/hooks/* (git が core.hooksPath 経由で起動するシェルスクリプト)
            食い違いは致命。shebang が CRLF になると Git Bash が
            bad interpreter で落ち、changelog ガードが黙って死ぬ (2-6)。
  other ... md / txt / jsonl / py / json ほか。**致命**。
            ⭐ 旧 (全部 CRLF) の宣言では other が 374 本も食い違っていたので
            「報告のみ」にするしかなかった。裁定 (C) は宣言をディスクに合わせたので
            食い違いは 0 本 = 縛れる。ここを緩いままにすると 453 本が
            **黙って漂流できる穴**になる。
            ⛔ 緑にするために検査対象を狭めないこと。逃がすなら --lenient で明示的に。

終了コード:
  0 ... 一致 (致命カテゴリに食い違いなし)
  1 ... 食い違いあり
  2 ... 環境不備 (git が無い / リポジトリでない / .gitattributes が無い / 対象 0 本)
"""

import argparse
import json
import os
import subprocess
import sys

EXIT_OK, EXIT_MISMATCH, EXIT_ENV = 0, 1, 2

SHIP_EXT = (".html", ".css")


def _git(root, *args, stdin=None):
    return subprocess.run(
        ["git", "-C", root, "-c", "core.quotepath=off"] + list(args),
        input=stdin, capture_output=True,
    )


def classify(rel):
    """配信物 / git フック / それ以外 を path で分ける (拡張子だけでは分けられない)。

    tools/*.js はドライバであって配信物ではない。拡張子で切ると 141 本の
    ドライバが致命カテゴリに入り、この道具が永久に赤くなる。
    """
    low = rel.lower()
    if low.startswith("scripts/hooks/"):
        return "hook"
    head, tail = os.path.split(low)
    if head == "":                                   # リポジトリ直下
        if tail.endswith(SHIP_EXT) or tail.endswith(".js"):
            return "ship"
    if head == "js" or head.startswith("js/"):       # js/ 配下のモジュール
        if tail.endswith(".js"):
            return "ship"
    if tail.endswith(".css"):
        return "ship"
    return "other"


def expected_eol(root, paths):
    """git check-attr の答えから期待の行末を引く (.gitattributes の写経をしない)。"""
    payload = ("\0".join(paths) + "\0").encode("utf-8")
    p = _git(root, "check-attr", "-z", "--stdin", "text", "eol", stdin=payload)
    if p.returncode != 0:
        return None, p.stderr.decode("utf-8", "replace")
    toks = p.stdout.decode("utf-8", "replace").split("\0")
    attrs = {}
    i = 0
    while i + 2 < len(toks):
        path, name, value = toks[i], toks[i + 1], toks[i + 2]
        attrs.setdefault(path, {})[name] = value
        i += 3
    return attrs, None


def read_eol(abspath):
    with open(abspath, "rb") as f:
        data = f.read()
    if b"\0" in data:
        return "binary", 0, 0, 0
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n") - crlf
    cr = data.count(b"\r") - crlf
    if crlf == 0 and lf == 0 and cr == 0:
        return "none", 0, 0, 0            # 改行を 1 つも持たない = どちらとも言えない
    if lf == 0 and cr == 0:
        return "crlf", crlf, lf, cr
    if crlf == 0 and cr == 0:
        return "lf", crlf, lf, cr
    return "mixed", crlf, lf, cr


def main(argv=None):
    ap = argparse.ArgumentParser(description="ツリーの行末が .gitattributes どおりか検査する")
    ap.add_argument("root", nargs="?", default=None,
                    help="検査するツリーの根 (既定 = このスクリプトを含むリポジトリの根)")
    ap.add_argument("--all", action="store_true",
                    help="(裁定 (C) 以降は既定と同じ。後方互換のため残してある no-op)")
    ap.add_argument("--lenient", action="store_true",
                    help="other (md/txt/jsonl/py/json) の食い違いを報告のみに落とす "
                         "= 裁定 (C) 以前の既定。⛔ 常用しない")
    ap.add_argument("--list", action="store_true", help="一致したファイルも 1 行ずつ出す")
    ap.add_argument("--json", action="store_true", help="機械可読なサマリを最後に 1 行出す")
    # ⭐ 2026-09-11 実測 = テキスト 477 本。既定 1 では「0 本を検査して全部緑」を
    #   実質塞げていなかった (1 本でも通る)。実測の 8 割強を下限にして本当の番人にする。
    #   ⚠ 依頼書 8 (0a) の「700 本以上」は誤り — 700 は binary 込みでも届かない数で、
    #     png/jpg/mp3 を除いた実測は 477 本 (#65 項目3b で訂正)。
    ap.add_argument("--min-text", type=int, default=400,
                    help="検査対象のテキストファイルがこの本数を下回ったら環境不備 (既定 400)")
    args = ap.parse_args(argv)

    root = args.root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root = os.path.abspath(root)

    if not os.path.isdir(root):
        print("[check_tree_eol] ENV: root が存在しない: %s" % root)
        return EXIT_ENV
    probe = _git(root, "rev-parse", "--show-toplevel")
    if probe.returncode != 0:
        print("[check_tree_eol] ENV: git リポジトリではない / git が無い: %s"
              % probe.stderr.decode("utf-8", "replace").strip())
        return EXIT_ENV
    if not os.path.isfile(os.path.join(root, ".gitattributes")):
        print("[check_tree_eol] ENV: .gitattributes が無い (行末の宣言が存在しない): %s" % root)
        return EXIT_ENV

    p = _git(root, "ls-files", "-z")
    if p.returncode != 0:
        print("[check_tree_eol] ENV: ls-files 失敗: %s" % p.stderr.decode("utf-8", "replace"))
        return EXIT_ENV
    tracked = [x for x in p.stdout.decode("utf-8", "replace").split("\0") if x]
    if not tracked:
        print("[check_tree_eol] ENV: 追跡ファイルが 0 本")
        return EXIT_ENV

    attrs, err = expected_eol(root, tracked)
    if attrs is None:
        print("[check_tree_eol] ENV: check-attr 失敗: %s" % err)
        return EXIT_ENV

    counts = {"tracked": len(tracked), "missing": 0, "binary": 0, "text": 0, "noeol": 0,
              "unconstrained": 0}
    per_cat = {"ship": [0, 0], "hook": [0, 0], "other": [0, 0]}   # [ok, mismatch]
    bad = []

    for rel in tracked:
        abs_path = os.path.join(root, rel.replace("/", os.sep))
        if not os.path.isfile(abs_path):
            counts["missing"] += 1
            continue
        a = attrs.get(rel, {})
        text_attr, eol_attr = a.get("text", "unspecified"), a.get("eol", "unspecified")
        if text_attr == "unset":                     # binary マクロ = -text -diff
            counts["binary"] += 1
            continue
        actual, crlf, lf, cr = read_eol(abs_path)
        cat = classify(rel)
        if actual == "binary":
            # 宣言は text なのに中身に NUL がある = 宣言と実体の食い違い
            counts["binary"] += 1
            bad.append((cat, rel, eol_attr, "NUL-bytes", 0, 0, 0))
            per_cat[cat][1] += 1
            continue
        counts["text"] += 1
        if eol_attr not in ("crlf", "lf"):
            counts["unconstrained"] += 1             # 期待が決まらない = 縛れない
            continue
        if actual == "none":
            counts["noeol"] += 1                     # 改行なし = どちらでも矛盾しない
            continue
        if actual == eol_attr:
            per_cat[cat][0] += 1
            if args.list:
                print("  ok   [%-5s] %-60s %s" % (cat, rel, actual))
        else:
            per_cat[cat][1] += 1
            bad.append((cat, rel, eol_attr, actual, crlf, lf, cr))

    if counts["text"] < args.min_text:
        print("[check_tree_eol] ENV: 検査したテキストファイルが %d 本 (< --min-text %d) "
              "= 0 本を検査して全部緑になる形" % (counts["text"], args.min_text))
        return EXIT_ENV

    # ⭐ 裁定 (C): 宣言がディスクと一致しているので 3 カテゴリとも致命が既定。
    #   --all は「other も致命」を意味していた旧フラグ = 今は既定と同じ (no-op)。
    fatal_cats = ("ship", "hook") if args.lenient else ("ship", "hook", "other")
    fatal = [b for b in bad if b[0] in fatal_cats]
    advisory = [b for b in bad if b[0] not in fatal_cats]

    print("[check_tree_eol] root=%s" % root)
    print("[check_tree_eol] tracked=%d binary=%d text=%d (改行なし %d / 期待未定 %d / 不在 %d)"
          % (counts["tracked"], counts["binary"], counts["text"],
             counts["noeol"], counts["unconstrained"], counts["missing"]))
    for cat in ("ship", "hook", "other"):
        ok, ng = per_cat[cat]
        print("[check_tree_eol]   %-5s  一致 %4d / 食い違い %4d%s"
              % (cat, ok, ng, "   <- 致命" if cat in fatal_cats else "   (報告のみ)"))
    for cat, rel, want, got, crlf, lf, cr in sorted(bad):
        mark = "FATAL" if cat in fatal_cats else "warn "
        print("  %s [%-5s] %-58s want=%-4s got=%-6s (crlf=%d lf=%d cr=%d)"
              % (mark, cat, rel, want, got, crlf, lf, cr))

    rc = EXIT_MISMATCH if fatal else EXIT_OK
    print("[check_tree_eol] RESULT: %s   致命 %d 件 / 報告のみ %d 件"
          % ("OK" if rc == EXIT_OK else "MISMATCH", len(fatal), len(advisory)))

    if args.json:
        print("[check_tree_eol] JSON " + json.dumps({
            "root": root, "counts": counts,
            "per_category": {k: {"ok": v[0], "mismatch": v[1]} for k, v in per_cat.items()},
            "fatal": [{"category": c, "path": r, "want": w, "got": g}
                      for c, r, w, g, _a, _b, _c in fatal],
            "advisory": [{"category": c, "path": r, "want": w, "got": g}
                         for c, r, w, g, _a, _b, _c in advisory],
            "exit": rc,
        }, ensure_ascii=False, sort_keys=True))
    return rc


if __name__ == "__main__":
    sys.exit(main())
