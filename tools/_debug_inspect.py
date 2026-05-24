"""ChatGPT の最新チャットを開いて、img 要素を全部ダンプ (デバッグ用)。

ログイン引き継ぎ済の前提。最新チャット (red apple 等) を開いて、画像 src を抽出 →
正規パターン (oaiusercontent/dalle/files.openai.com) でマッチしないものを発見。
"""
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright  # type: ignore

PROFILE_DIR = Path.home() / ".claude" / "chatgpt-automation" / "edge-profile"
DEBUG_DIR = Path.home() / ".claude" / "chatgpt-automation" / "debug"
CHATGPT_URL = "https://chatgpt.com/"


def find_msedge() -> Path:
    import os
    for env_key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.environ.get(env_key)
        if base:
            p = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if p.exists():
                return p
    raise RuntimeError("msedge.exe not found")


def main():
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    msedge = find_msedge()
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            executable_path=str(msedge),
            headless=False,
            viewport={"width": 1280, "height": 900},
            args=[
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled",
            ],
            ignore_default_args=["--enable-automation"],
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(CHATGPT_URL, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=30_000)
            time.sleep(2)

            # 左サイドバーから最新チャットをクリック
            print("Looking for recent chats in sidebar...")
            sidebar_links = page.query_selector_all('nav a[href^="/c/"]')
            print(f"  Found {len(sidebar_links)} chat links in sidebar")
            if sidebar_links:
                first = sidebar_links[0]
                href = first.get_attribute("href")
                title = (first.inner_text() or "").strip()[:60]
                print(f"  Opening (via direct goto): {href} ({title!r})")
                full_url = "https://chatgpt.com" + href
                page.goto(full_url, wait_until="domcontentloaded", timeout=30_000)
                try:
                    page.wait_for_load_state("networkidle", timeout=30_000)
                except Exception:
                    pass
                time.sleep(3)

            # スクショ
            shot = DEBUG_DIR / "_debug_inspect.png"
            page.screenshot(path=str(shot), full_page=True)
            print(f"Screenshot: {shot}")

            # すべての img 要素の src を収集
            imgs = page.eval_on_selector_all(
                "img",
                """(els) => els.map(el => ({
                    src: el.src,
                    alt: el.alt || '',
                    w: el.naturalWidth,
                    h: el.naturalHeight,
                }))""",
            )
            print(f"\nFound {len(imgs)} <img> elements:")
            for i, info in enumerate(imgs):
                src = info["src"] or ""
                summary = src
                if len(src) > 110:
                    summary = src[:60] + "..." + src[-40:]
                print(f"  [{i:2d}] {info['w']}x{info['h']} alt={info['alt']!r}")
                print(f"       src={summary}")
        finally:
            ctx.close()


if __name__ == "__main__":
    main()
