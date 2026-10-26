#!/usr/bin/env python3
"""更新情報(📜)の文面 js/changelog.js に新しい 1 件を先頭追加し、最新 N 件に保つ。

文面の唯一の正は js/changelog.js(#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の
両方がそこから描く。

使い方:
  py tools/add_changelog.py "<b>見出し</b> — 説明文"
  py tools/add_changelog.py --max 4 "<b>見出し</b> — 説明文"

方針(CLAUDE.md「更新情報(changelog)の運用」と整合):
- 文面は *プレイヤー向けに整えた日本語要約* を書く(コミット件名のコピペ禁止)。
- 先頭=最新。末尾の古い 1 件を落として既定 4 件に保つ。
- アンカーは `/* CHANGELOG:BEGIN */` 行と `/* CHANGELOG:END */` 行(行番号非依存)。
  その間は 1 行 1 件の JSON 文字列リテラル + 行末カンマ。
- 目印が見つからなければ error で止まる(黙って何もしない、は禁止)。
- 既存の改行コード(LF / CRLF)を保つ。
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Windows コンソール(cp932)でも日本語/em dash を出力できるよう UTF-8 化(出力失敗での exit1 を防ぐ)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

SOURCE = Path(__file__).resolve().parent.parent / "js" / "changelog.js"
BEGIN = "/* CHANGELOG:BEGIN */"
END = "/* CHANGELOG:END */"


def strip_li(entry: str) -> str:
    """`<li>…</li>` で渡されたら外側の <li> を剥がす(旧来の呼び方との互換)。"""
    m = re.fullmatch(r"<li>(.*)</li>", entry, re.S)
    return m.group(1).strip() if m else entry


def main() -> None:
    ap = argparse.ArgumentParser(description="更新情報に 1 件を先頭追加して N 件に保つ")
    ap.add_argument("entry", help="新しい 1 件の HTML 断片(<b>…</b> 可。<li>…</li> で囲んでも可)")
    ap.add_argument("--max", type=int, default=4, help="保持する件数(既定 4)")
    ap.add_argument("--file", default=str(SOURCE), help="対象ファイル(既定 js/changelog.js)")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.is_file():
        sys.exit(f"error: {path} が見つかりません")
    text = path.read_bytes().decode("utf-8")
    eol = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(eol)

    begin_i = next((i for i, l in enumerate(lines) if l.strip() == BEGIN), None)
    if begin_i is None:
        sys.exit(f"error: {path} に目印 {BEGIN} の行が見つかりません")
    end_i = next((j for j in range(begin_i + 1, len(lines)) if lines[j].strip() == END), None)
    if end_i is None:
        sys.exit(f"error: {path} に目印 {END} の行が見つかりません(BEGIN の後)")

    existing = []
    for k in range(begin_i + 1, end_i):
        s = lines[k].strip()
        if not s:
            continue
        try:
            existing.append(json.loads(s.rstrip(",")))
        except json.JSONDecodeError:
            sys.exit(f"error: {path}:{k + 1} が JSON 文字列として読めません: {s[:60]}")

    entry = strip_li(args.entry.strip())
    if not entry:
        sys.exit("error: 空の文面は追加できません")

    new_list = ([entry] + existing)[: max(1, args.max)]
    body = ["  " + json.dumps(s, ensure_ascii=False) + "," for s in new_list]
    lines = lines[: begin_i + 1] + body + lines[end_i:]
    path.write_bytes(eol.join(lines).encode("utf-8"))
    print(f"OK: 更新情報を追加(計 {len(new_list)} 件)\n  + {entry}")


if __name__ == "__main__":
    main()
