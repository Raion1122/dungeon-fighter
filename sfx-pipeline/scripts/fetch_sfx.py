"""fetch_sfx.py — CC0 効果音パックの取得・展開 (spec C-3、任意ルート)。

data/sfx-sources.json の packs を順に取得し sfx-pipeline/raw/packs/<name>/ に展開する。
- URL は実行時に検証する。直リンク zip が取れない/404 のパックは警告してスキップ
  (パイプラインは止めない)。取れなかった ID は build_sfx.py 側で inbox 待ちになる。
- 効果音ラボ / OtoLogic / 魔王魂 等は規約・サイト負荷の配慮から自動取得しない。
  これらは人間が raw/inbox/<id>/ に手動投入する (inbox 方式)。

第1次素材は Kenney CC0 パック + inbox でひと通り揃う想定。requests が無い/未導入なら
このスクリプトはスキップし、inbox 運用のみで build_sfx.py を回せる。

使い方:
  py sfx-pipeline/scripts/fetch_sfx.py
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

try:
    import requests  # type: ignore
except ImportError:
    requests = None

PIPELINE_DIR = Path(__file__).resolve().parent.parent
SOURCES = PIPELINE_DIR / "data" / "sfx-sources.json"
PACKS = PIPELINE_DIR / "raw" / "packs"


def looks_like_zip(content: bytes) -> bool:
    return content[:2] == b"PK"


def fetch_pack(pk) -> bool:
    name, url = pk.get("name"), pk.get("url", "")
    dest = PACKS / name
    if dest.exists() and any(dest.iterdir()):
        print(f"  skip {name} (展開済み)")
        return True
    if not url or not url.lower().endswith(".zip"):
        # ページURLしか分からないパックは自動取得不可 → inbox/手動DL待ち
        print(f"  SKIP {name}: 直リンク zip が未確定 ({url}) → 公式ページから手動DLし inbox 運用")
        return False
    try:
        r = requests.get(url, timeout=60)
        if not r.ok or not looks_like_zip(r.content):
            print(f"  SKIP {name}: 取得失敗 status={getattr(r, 'status_code', '?')}")
            return False
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            z.extractall(dest)
        print(f"  OK   {name}: 展開 → {dest.relative_to(PIPELINE_DIR)}")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  SKIP {name}: {e}")
        return False


def main() -> int:
    if requests is None:
        print("requests 未導入のため自動取得をスキップ (pip install requests)。inbox 運用で build_sfx.py を実行してください。")
        return 0
    data = json.loads(SOURCES.read_text(encoding="utf-8"))
    PACKS.mkdir(parents=True, exist_ok=True)
    ok = 0
    print("CC0 パック取得:")
    for pk in data.get("packs", []):
        if fetch_pack(pk):
            ok += 1
    print(f"取得成功 {ok}/{len(data.get('packs', []))} パック。次に build_sfx.py を実行してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
