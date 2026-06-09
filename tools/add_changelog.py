#!/usr/bin/env python3
"""銀の鹿亭の更新情報(#changelogBox)に新しい <li> を先頭追加し、最新 N 件に保つ。

使い方:
  py tools/add_changelog.py "<b>見出し</b> — 説明文"
  py tools/add_changelog.py --max 4 "<b>見出し</b> — 説明文"

方針(CLAUDE.md「更新情報(changelog)の運用」と整合):
- 文面は *プレイヤー向けに整えた日本語要約* を書く(コミット件名のコピペ禁止)。
- 先頭=最新。末尾の古い 1 件を落として既定 4 件に保つ。
- アンカーは <ul class="changelogList"> の文字列(行番号非依存)。
"""
import argparse
import re
import sys
from pathlib import Path

# Windows コンソール(cp932)でも日本語/em dash を出力できるよう UTF-8 化(出力失敗での exit1 を防ぐ)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

TAVERN = Path(__file__).resolve().parent.parent / "tavern.html"


def main() -> None:
    ap = argparse.ArgumentParser(description="更新情報に <li> を先頭追加して N 件に保つ")
    ap.add_argument("entry", help="新しい <li> の内側 HTML(<b>…</b> 可)")
    ap.add_argument("--max", type=int, default=4, help="保持する件数(既定 4)")
    ap.add_argument("--file", default=str(TAVERN), help="対象 HTML(既定 tavern.html)")
    args = ap.parse_args()

    path = Path(args.file)
    lines = path.read_text(encoding="utf-8").split("\n")

    ul_i = next((i for i, l in enumerate(lines)
                 if "changelogList" in l and "<ul" in l), None)
    if ul_i is None:
        sys.exit('error: <ul class="changelogList"> が見つかりません')
    close_i = next((j for j in range(ul_i + 1, len(lines))
                    if "</ul>" in lines[j]), None)
    if close_i is None:
        sys.exit("error: changelogList の </ul> が見つかりません")

    indent = re.match(r"\s*", lines[ul_i]).group(0) + "  "
    existing = [lines[k] for k in range(ul_i + 1, close_i) if "<li>" in lines[k]]

    entry = args.entry.strip()
    new_li = (indent + entry) if entry.startswith("<li>") else f"{indent}<li>{entry}</li>"

    new_list = ([new_li] + existing)[: max(1, args.max)]
    lines = lines[: ul_i + 1] + new_list + lines[close_i:]
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: 更新情報を追加(計 {len(new_list)} 件)\n  + {new_li.strip()}")


if __name__ == "__main__":
    main()
