#!/usr/bin/env python3
"""pre-commit ガード: ゲームロジック(index.html / tavern.html / audio.js)を変更したのに
更新情報(文面の唯一の正 = js/changelog.js の目印の間)が更新されていない場合、commit を中止する。

scripts/hooks/pre-commit から呼ばれる(git config core.hooksPath scripts/hooks)。
方針は CLAUDE.md「更新情報(changelog)の運用」を参照。

トリガー範囲(過剰検知を避けるため限定):
  index.html / tavern.html / audio.js のみ。
  assets/*.png 追加のみ・tools/*・scripts/*・CLAUDE.md・検証ドライバ変更では強制しない。

判定(#101 §2-2):
  HEAD に js/changelog.js が無い(移行コミット)   → 通す
  HEAD にはあるのに、ステージ版で目印が見つからない → ⛔ 止める(「目印が見つからない」)
    ⚠ ここを「判定不能なので通す」にすると、目印の綴りを 1 文字違えただけで
      以後すべてのコミットが無言で通る(チェックが死んでも誰も気づかない)。
  両方見つかって同じ                                → 止める(未更新)
  両方見つかって違う                                → 通す
"""
import os
import re
import subprocess
import sys

# cp932 コンソールでも日本語メッセージを出せるよう UTF-8 化(出力失敗での誤exitを防ぐ)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

GAME_LOGIC = ("index.html", "tavern.html", "audio.js")
SOURCE = "js/changelog.js"
BLOCK_RE = re.compile(r"/\* CHANGELOG:BEGIN \*/(.*?)/\* CHANGELOG:END \*/", re.S)

MISSING = object()  # ファイル自体が無い


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8")


def changelog_block(ref: str):
    """ref 例: ':js/changelog.js'(ステージ済)/ 'HEAD:js/changelog.js'。
    ファイルが無ければ MISSING、目印が見つからなければ None、見つかれば目印間の文字列。"""
    r = git("show", ref)
    if r.returncode != 0:
        return MISSING
    m = BLOCK_RE.search(r.stdout.replace("\r\n", "\n"))
    return m.group(1).strip() if m else None


def main() -> None:
    staged = git("diff", "--cached", "--name-only").stdout.split()
    touched_logic = [f for f in staged if os.path.basename(f) in GAME_LOGIC]
    if not touched_logic:
        sys.exit(0)  # ロジック変更なし → スルー

    head_block = changelog_block("HEAD:" + SOURCE)
    if head_block is MISSING:
        sys.exit(0)  # 移行コミット(HEAD に js/changelog.js がまだ無い)→ 通す

    staged_block = changelog_block(":" + SOURCE)
    if staged_block is MISSING or staged_block is None or head_block is None:
        sys.stderr.write(
            "\n⛔ js/changelog.js に BEGIN/END の目印が見つかりません。\n"
            f"   変更されたロジック: {', '.join(touched_logic)}\n"
            "   /* CHANGELOG:BEGIN */ と /* CHANGELOG:END */ の 2 行を元の綴りに戻してください\n"
            "   (目印が無いと更新情報の検査ができないため、通さずに止めています)。\n"
            "   (--no-verify での迂回は禁止。詳細は CLAUDE.md)\n\n"
        )
        sys.exit(1)

    if staged_block != head_block:
        sys.exit(0)  # 更新情報が変わっている → OK

    sys.stderr.write(
        "\n⛔ js/changelog.js の更新情報が未更新です。\n"
        f"   変更されたロジック: {', '.join(touched_logic)}\n"
        "   更新情報(酒場と港町の 📜)も必ず更新してからコミットしてください。\n"
        '   例) py tools/add_changelog.py "<b>見出し</b> — 説明"\n'
        "   (--no-verify での迂回は禁止。詳細は CLAUDE.md)\n\n"
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
