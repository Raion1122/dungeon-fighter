"""Cookies DB を読んで ChatGPT/OpenAI 関連エントリを表示 (デバッグ用)。

Cookie の生値・暗号値は表示せず、ホスト名・Cookie 名・サイズだけ確認する。
"""
import sqlite3
import shutil
import sys
from pathlib import Path

PROFILE = Path.home() / ".claude" / "chatgpt-automation" / "edge-profile"
DB = PROFILE / "Default" / "Network" / "Cookies"

if not DB.exists():
    print(f"NOT FOUND: {DB}")
    sys.exit(1)

tmp = Path.home() / "AppData" / "Local" / "Temp" / "_chk_cookies.db"
shutil.copyfile(DB, tmp)

conn = sqlite3.connect(str(tmp))
c = conn.cursor()
c.execute(
    "SELECT host_key, name, length(value) AS vlen, length(encrypted_value) AS evlen "
    "FROM cookies "
    "WHERE host_key LIKE '%chatgpt%' OR host_key LIKE '%openai%' OR host_key LIKE '%auth0%' "
    "ORDER BY host_key, name"
)
rows = c.fetchall()
print(f"ChatGPT/OpenAI/Auth0 related cookies in dedicated profile: {len(rows)}")
for h, n, vl, evl in rows:
    print(f"  {h:30s}  {n:40s}  v={vl} ev={evl}")
conn.close()

try:
    tmp.unlink()
except Exception:
    pass
