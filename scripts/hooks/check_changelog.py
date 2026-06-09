#!/usr/bin/env python3
"""pre-commit ガード: ゲームロジック(index.html / tavern.html / audio.js)を変更したのに
更新情報(#changelogBox の changelogList)が更新されていない場合、commit を中止する。

scripts/hooks/pre-commit から呼ばれる(git config core.hooksPath scripts/hooks)。
方針は CLAUDE.md「更新情報(changelog)の運用」を参照。

トリガー範囲(過剰検知を避けるため限定):
  index.html / tavern.html / audio.js のみ。
  assets/*.png 追加のみ・tools/*・scripts/*・CLAUDE.md・検証ドライバ変更では強制しない。
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
BLOCK_RE = re.compile(r'<ul class="changelogList">(.*?)</ul>', re.S)


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8")


def changelog_block(ref: str):
    """ref 例: ':tavern.html'(ステージ済)/ 'HEAD:tavern.html'。見つからなければ None。"""
    r = git("show", ref)
    if r.returncode != 0:
        return None
    m = BLOCK_RE.search(r.stdout)
    return m.group(1).strip() if m else None


def main() -> None:
    staged = git("diff", "--cached", "--name-only").stdout.split()
    touched_logic = [f for f in staged if os.path.basename(f) in GAME_LOGIC]
    if not touched_logic:
        sys.exit(0)  # ロジック変更なし → スルー

    staged_block = changelog_block(":tavern.html")
    head_block = changelog_block("HEAD:tavern.html")
    # 判定不能(tavern.html 未ステージ / 初回コミット等)は安全側でブロックしない
    if staged_block is None or head_block is None:
        sys.exit(0)
    if staged_block != head_block:
        sys.exit(0)  # 更新情報が変わっている → OK

    sys.stderr.write(
        "\n⛔ 更新情報(changelog)が未更新です。\n"
        f"   変更されたロジック: {', '.join(touched_logic)}\n"
        "   銀の鹿亭の更新情報(#changelogBox)も必ず更新してからコミットしてください。\n"
        '   例) py tools/add_changelog.py "<b>見出し</b> — 説明"\n'
        "   (原則 --no-verify での迂回は禁止。詳細は CLAUDE.md)\n\n"
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
