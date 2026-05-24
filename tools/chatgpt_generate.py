#!/usr/bin/env python3
"""ChatGPT 画像生成の自動化スクリプト。

Playwright で専用 Edge プロファイルを起動し、ChatGPT Web UI に対して
プロンプト投下 → 画像生成完了待ち → 画像取得 → 指定パスへ保存。

使用例:
  初回セットアップ (ChatGPT ログイン):
    python tools/chatgpt_generate.py --setup

  プロンプト文字列を指定:
    python tools/chatgpt_generate.py \\
      --prompt-string "a red apple, top-down, painterly" \\
      --output assets/test.png

  プロンプトファイルを指定:
    python tools/chatgpt_generate.py \\
      --prompt-file prompts/sce4_room0.txt \\
      --output assets/room_orc-fort_0.png

Exit codes:
  0 = 成功
  1 = ログイン期限切れ
  2 = レート制限
  3 = 生成失敗 (リトライ済)
  4 = タイムアウト
  5 = CAPTCHA 検出
  6 = その他エラー (セレクタ変更等)
"""

from __future__ import annotations

import argparse
import base64
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

try:
    from playwright.sync_api import (
        sync_playwright,
        Page,
        BrowserContext,
        TimeoutError as PWTimeoutError,
    )
except ImportError:
    sys.stderr.write(
        "ERROR: Playwright is not installed.\n"
        "Install with:\n"
        "  pip install playwright\n"
        "  playwright install msedge\n"
    )
    sys.exit(6)


# === 設定 ============================================================

PROFILE_DIR = Path.home() / ".claude" / "chatgpt-automation" / "edge-profile"
DEBUG_DIR   = Path.home() / ".claude" / "chatgpt-automation" / "debug"
CHATGPT_URL = "https://chatgpt.com/"

# セレクタ群 — ChatGPT UI 変更時はここを更新する
SELECTORS = {
    # プロンプト入力欄 (textarea or contenteditable div)
    "prompt_input":          '#prompt-textarea, div[contenteditable="true"][data-virtualkeyboard], textarea[placeholder*="Message"]',
    # 送信ボタン
    "send_button":           'button[data-testid="send-button"], button[aria-label*="Send"]',
    # 生成完了画像 (DALL-E 出力の URL パターン)
    # 2026 現行: chatgpt.com/backend-api/estuary/content?id=file_... 形式
    # 旧パターン (oaiusercontent / dalle / files.openai.com) も互換で残す
    "generated_image":       'img[src*="backend-api/estuary"], img[src*="oaiusercontent"], img[src*="dalle"], img[src*="files.openai.com"]',
    # 生成中インジケータ (Stop ボタン)
    "generating_indicator":  'button[data-testid="stop-button"], button[aria-label*="Stop"]',
    # CAPTCHA iframe
    "captcha":               'iframe[src*="captcha"], iframe[src*="hcaptcha"], iframe[title*="captcha" i]',
    # 失敗テキストパターン
    "rate_limit_text":       ["rate limit", "usage limit", "hit the limit", "limit reached",
                              "you've reached", "try again later"],
    "generation_error_text": ["couldn't generate", "couldn't create", "can't generate", "can't create",
                              "unable to generate", "unable to create", "failed to generate"],
    # ログイン URL
    "login_url_match":       "/auth/login",
}

WAIT_DEFAULT_TIMEOUT_MS         = 30_000
GENERATION_TIMEOUT_S_DEFAULT    = 180
GENERATION_POLL_INTERVAL_S      = 2.0
TYPE_DELAY_MS                   = 2  # キー間遅延 (取りこぼし回避)
CDP_PORT                        = 9222  # Chrome DevTools Protocol ポート


# === ユーティリティ ===================================================

def log_info(msg: str) -> None:
    print(f"[chatgpt-gen] {msg}", flush=True)


def log_err(msg: str) -> None:
    sys.stderr.write(f"[chatgpt-gen] ERROR: {msg}\n")
    sys.stderr.flush()


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def save_debug(page: Page, tag: str) -> None:
    """エラー時の状況をスクショで保存。"""
    ensure_dir(DEBUG_DIR)
    ts = time.strftime("%Y%m%d_%H%M%S")
    path = DEBUG_DIR / f"{ts}_{tag}.png"
    try:
        page.screenshot(path=str(path), full_page=False)
        log_info(f"Debug screenshot: {path}")
    except Exception as e:
        log_err(f"Failed to save debug screenshot: {e}")


# === ブラウザ =========================================================

def launch_browser(playwright, headless: bool = False):
    """専用プロファイルで Edge を Playwright 経由起動 (永続コンテキスト)。

    - executable_path に実 msedge.exe を渡して「素の Edge」を強制
    - --disable-blink-features=AutomationControlled で navigator.webdriver を隠す
    - ignore_default_args で Playwright の --enable-automation を外す

    戻り値: (None, context, None)。CDP モードからの API 互換のためタプルで返す。
    終了時は close_browser(_, context, _) で context.close を呼ぶ。
    """
    ensure_dir(PROFILE_DIR)
    msedge = find_msedge()
    if not msedge:
        raise RuntimeError("msedge.exe not found")

    context = playwright.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE_DIR),
        executable_path=str(msedge),
        headless=headless,
        viewport={"width": 1280, "height": 900},
        args=[
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
        ],
        ignore_default_args=["--enable-automation"],
    )
    return None, context, None


def close_browser(browser, ctx_or_proc=None) -> None:
    """ブラウザ接続を閉じる。CDP モード時代の API 互換のため引数 2 つ取れる。

    呼出は close_browser(browser, edge_proc) または close_browser(ctx) の両方を
    受け付ける (実際にどちらが BrowserContext かを runtime で判定)。
    """
    # 渡された引数のどちらが BrowserContext かを判定して close
    for obj in (browser, ctx_or_proc):
        if obj is None:
            continue
        try:
            # BrowserContext は close メソッドあり
            obj.close()
        except Exception:
            pass


# === 失敗検知 =========================================================

def detect_failure(page: Page) -> Optional[str]:
    """現在のページ状態からエラー種別を判定。

    返り値:
      "LOGIN_EXPIRED" / "RATE_LIMIT" / "GEN_ERROR" / "CAPTCHA" / None
    """
    if SELECTORS["login_url_match"] in page.url:
        return "LOGIN_EXPIRED"

    try:
        if page.query_selector(SELECTORS["captcha"]):
            return "CAPTCHA"
    except Exception:
        pass

    body_text = ""
    try:
        body_text = (page.inner_text("body") or "").lower()
    except Exception:
        pass

    for needle in SELECTORS["rate_limit_text"]:
        if needle.lower() in body_text:
            return "RATE_LIMIT"

    for needle in SELECTORS["generation_error_text"]:
        if needle.lower() in body_text:
            return "GEN_ERROR"

    return None


# === コマンド: setup ==================================================

def find_msedge() -> Optional[Path]:
    """システムにインストールされた msedge.exe を探す。"""
    candidates = []
    for env_key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.environ.get(env_key)
        if base:
            candidates.append(Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    for p in candidates:
        if p.exists():
            return p
    return None


def cmd_setup() -> int:
    """初回ログイン: Edge を **Playwright 経由ではなく直接** subprocess で起動。

    Playwright が制御する Edge は navigator.webdriver 等のフラグで Cloudflare 等に
    自動化と検知され、ChatGPT ログインから先に進めないケースがある。setup フェーズでは
    完全に普通のユーザー操作と同じ Edge を立ち上げ、ユーザーがログイン → Edge を閉じる。
    プロファイル (Cookies/localStorage) は専用ディレクトリに保存され、以降の通常生成では
    Playwright がこのプロファイルを `launch_persistent_context` で読み込んでログイン状態を
    引き継ぐ。
    """
    ensure_dir(PROFILE_DIR)
    msedge = find_msedge()
    if not msedge:
        log_err("msedge.exe not found in standard locations.")
        log_err("Searched: %PROGRAMFILES%, %PROGRAMFILES(X86)%, %LOCALAPPDATA% under Microsoft/Edge/Application/")
        log_err("Install Microsoft Edge from https://www.microsoft.com/edge")
        return 6

    log_info(f"Setup mode: launching Edge DIRECTLY (not via Playwright) with profile")
    log_info(f"  msedge: {msedge}")
    log_info(f"  profile: {PROFILE_DIR}")
    log_info("=" * 60)
    log_info("HOW TO COMPLETE SETUP:")
    log_info("  1. A fresh Edge window will open at chatgpt.com.")
    log_info("  2. Log in (Microsoft / Google / OpenAI account).")
    log_info("  3. Optionally send a test message to verify chat works.")
    log_info("  4. CLOSE the Edge window when done.")
    log_info("  Session is saved automatically when Edge exits.")
    log_info("=" * 60)

    cmd = [
        str(msedge),
        f"--user-data-dir={PROFILE_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        CHATGPT_URL,
    ]

    try:
        proc = subprocess.Popen(cmd)
    except Exception as e:
        log_err(f"Failed to launch Edge: {e}")
        return 6

    log_info(f"Edge launched (pid={proc.pid}). Waiting for it to close...")
    # Edge は launcher プロセスがすぐ exit する設計の場合があるので、
    # proc.wait() だけでは早期終了の可能性あり。
    # 念のため: launcher が exit したら、user-data-dir 配下のプロセスをポーリング監視。
    try:
        rc = proc.wait()
    except KeyboardInterrupt:
        log_info("Interrupted, terminating Edge launcher...")
        try:
            proc.terminate()
        except Exception:
            pass
        return 6

    log_info(f"Edge launcher exited (rc={rc}). Polling for surviving Edge processes...")

    # launcher が exit しても msedge.exe 群がまだ動いてる場合は待つ
    deadline = time.time() + 30 * 60
    last_log = 0.0
    while time.time() < deadline:
        if not _edge_running_on_profile():
            log_info("All Edge processes for our profile have exited.")
            break
        now = time.time()
        if now - last_log > 60:
            remaining_min = int((deadline - now) / 60)
            log_info(f"Edge still running, waiting for close "
                     f"(~{remaining_min} min before timeout)")
            last_log = now
        time.sleep(3)
    else:
        log_info("Timeout reached. Profile may be partial.")

    log_info("Setup complete. Session saved to profile.")
    return 0


def _edge_running_on_profile() -> bool:
    """専用プロファイルを使う msedge.exe プロセスがまだ動いてるか。

    Windows-specific: WMIC で CommandLine を見る。失敗したら False を返して
    終了扱いにする (Hang を避ける)。
    """
    try:
        result = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
                "Where-Object { $_.CommandLine -like '*chatgpt-automation*' } | "
                "Measure-Object | Select-Object -ExpandProperty Count"
            ],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return False
        count = int(result.stdout.strip() or 0)
        return count > 0
    except Exception:
        return False


# === コマンド: check-login ============================================

def cmd_check_login() -> int:
    """ログイン引き継ぎ確認: Playwright で profile を読み込んで ChatGPT を開き、
    プロンプト入力欄が見えるかだけ確認する。画像生成しない (DALL-E 枠を消費しない)。

    結果:
      0 = ログイン OK (入力欄検出)
      1 = ログイン期限切れ or 保存されていない
      6 = その他エラー
    """
    log_info(f"Login check: launching Edge via Playwright with profile {PROFILE_DIR}")

    if not PROFILE_DIR.exists():
        log_err(f"Profile dir does not exist: {PROFILE_DIR}")
        log_err("Run --setup first.")
        return 1

    with sync_playwright() as p:
        browser, ctx, edge_proc = launch_browser(p, headless=False)
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(CHATGPT_URL, wait_until="domcontentloaded", timeout=WAIT_DEFAULT_TIMEOUT_MS)
            try:
                page.wait_for_load_state("networkidle", timeout=WAIT_DEFAULT_TIMEOUT_MS)
            except PWTimeoutError:
                pass

            time.sleep(3)  # JS hydration 待ち

            # 失敗検知
            err = detect_failure(page)
            if err == "LOGIN_EXPIRED":
                log_err(f"Login expired or not saved. Current URL: {page.url}")
                save_debug(page, "check-login-expired")
                return 1
            if err == "CAPTCHA":
                log_err("CAPTCHA detected. Playwright control is being challenged.")
                save_debug(page, "check-login-captcha")
                return 5

            # ログイン状態判定: 入力欄 + 「ログイン」ボタンが画面上に同居してたら未ログイン
            # (未ログイン状態でも入力欄は存在し、誰でも触れる)
            try:
                login_btn = page.query_selector('button:has-text("ログイン"), button:has-text("Log in")')
                signup_btn = page.query_selector('button:has-text("無料でサインアップ"), button:has-text("Sign up")')
            except Exception:
                login_btn = signup_btn = None

            input_elem = page.query_selector(SELECTORS["prompt_input"])
            if input_elem and not (login_btn or signup_btn):
                log_info(f"Login OK. Prompt input found, no login/signup buttons visible. URL: {page.url}")
                save_debug(page, "check-login-ok")
                return 0
            elif login_btn or signup_btn:
                log_err(f"NOT logged in: login/signup buttons visible on page. URL: {page.url}")
                save_debug(page, "check-login-not-logged-in")
                return 1
            elif not input_elem:
                log_err(f"Prompt input NOT found. URL: {page.url}")
                save_debug(page, "check-login-no-input")
                if "/auth/login" in page.url or "/login" in page.url:
                    log_err("Login page detected - session not preserved.")
                    return 1
                return 6
            return 6
        finally:
            close_browser(browser, edge_proc)


# === コマンド: generate ===============================================

def cmd_generate(prompt: str, output: Path, timeout_s: int, retries: int) -> int:
    """通常生成: プロンプト送信 → 画像完成待ち → ダウンロード → 保存。"""
    log_info(f"Output: {output}")
    log_info(f"Prompt length: {len(prompt)} chars")
    log_info(f"Timeout: {timeout_s}s, retries: {retries}")

    ensure_dir(output.parent)
    ensure_dir(DEBUG_DIR)

    with sync_playwright() as p:
        browser, ctx, edge_proc = launch_browser(p, headless=False)
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            attempt = 0
            while attempt <= retries:
                attempt += 1
                log_info(f"Attempt {attempt}/{retries + 1}")
                try:
                    rc = _run_one_generation(page, prompt, output, timeout_s)
                except PWTimeoutError as e:
                    log_err(f"Playwright timeout: {e}")
                    save_debug(page, "pw-timeout")
                    rc = 4
                except Exception as e:
                    log_err(f"Unexpected error: {e}")
                    save_debug(page, "unexpected")
                    rc = 6

                if rc == 0:
                    return 0
                # ログイン期限/レート制限/CAPTCHA はリトライ無意味
                if rc in (1, 2, 5):
                    return rc
                # 残りはリトライ
                if attempt > retries:
                    return rc
                log_info(f"Retrying after exit_code={rc}...")
                time.sleep(2)
            return 6
        finally:
            close_browser(browser, edge_proc)


def _run_one_generation(page: Page, prompt: str, output: Path, timeout_s: int) -> int:
    """1 回の生成試行。終了コードを返す。"""
    # 新規チャットへ
    page.goto(CHATGPT_URL, wait_until="domcontentloaded", timeout=WAIT_DEFAULT_TIMEOUT_MS)
    try:
        page.wait_for_load_state("networkidle", timeout=WAIT_DEFAULT_TIMEOUT_MS)
    except PWTimeoutError:
        pass  # networkidle 取れなくても続行

    # ログイン期限・CAPTCHA を先に検知
    err = detect_failure(page)
    if err == "LOGIN_EXPIRED":
        log_err("Login expired. Re-run with --setup to re-authenticate.")
        return 1
    if err == "CAPTCHA":
        log_err("CAPTCHA detected. Solve it manually in the browser window.")
        save_debug(page, "captcha")
        return 5

    # プロンプト入力欄を待つ
    try:
        page.wait_for_selector(SELECTORS["prompt_input"], timeout=WAIT_DEFAULT_TIMEOUT_MS)
    except PWTimeoutError:
        log_err(f"Prompt input not found. Selector may be stale: {SELECTORS['prompt_input']}")
        save_debug(page, "no-input")
        return 6

    # 既存テキストをクリア (再試行時の残骸対策)
    page.click(SELECTORS["prompt_input"])
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")

    # プロンプト投入
    log_info("Typing prompt...")
    page.keyboard.type(prompt, delay=TYPE_DELAY_MS)

    # 送信 (ボタンが見つかれば押す、無ければ Enter)
    sent = False
    try:
        send_btn = page.wait_for_selector(SELECTORS["send_button"], timeout=5_000)
        if send_btn:
            send_btn.click()
            sent = True
    except PWTimeoutError:
        pass
    if not sent:
        log_info("Send button not found, falling back to Enter key")
        page.keyboard.press("Enter")

    log_info("Prompt sent. Waiting for image generation...")

    # 生成完了を polling で待つ
    deadline = time.time() + timeout_s
    img_url: Optional[str] = None
    last_progress_log = 0.0
    while time.time() < deadline:
        # 失敗テキストの即時検知
        err = detect_failure(page)
        if err == "RATE_LIMIT":
            log_err("Rate limit detected (ChatGPT free tier DALL-E cap reached?)")
            save_debug(page, "rate-limit")
            return 2
        if err == "GEN_ERROR":
            log_err("ChatGPT replied with a generation error.")
            save_debug(page, "gen-error")
            return 3

        # 画像出現確認 — フル画像 (naturalWidth >= 1024) のみを採用、
        # 小さなサムネイル/プレビュー (例: 512x512 の estuary file-aNU...) は除外
        try:
            elems = page.query_selector_all(SELECTORS["generated_image"])
            big_imgs = []  # (natural_width, src) のリスト
            for el in elems:
                src = el.get_attribute("src") or ""
                if not any(t in src for t in (
                    "backend-api/estuary", "oaiusercontent", "dalle", "files.openai.com"
                )):
                    continue
                try:
                    nw = el.evaluate("el => el.naturalWidth") or 0
                except Exception:
                    nw = 0
                if nw >= 1024:
                    big_imgs.append((nw, src))
            if big_imgs:
                # 最大サイズの画像 (生成本体) を採用
                big_imgs.sort(reverse=True)
                img_url = big_imgs[0][1]
                break
        except Exception:
            pass

        # 進捗ログ (10秒ごと)
        now = time.time()
        if now - last_progress_log > 10:
            remaining = int(deadline - now)
            log_info(f"Still waiting... ({remaining}s remaining)")
            last_progress_log = now

        time.sleep(GENERATION_POLL_INTERVAL_S)

    if not img_url:
        log_err(f"Timeout: no image appeared within {timeout_s}s.")
        save_debug(page, "timeout")
        return 4

    log_info(f"Image URL captured: {img_url[:80]}...")

    # ブラウザ内 fetch で画像取得 (CORS 回避)
    try:
        data_url = page.evaluate(
            """
            async (url) => {
                const r = await fetch(url, { credentials: "include" });
                if (!r.ok) throw new Error("fetch HTTP " + r.status);
                const b = await r.blob();
                return await new Promise((res, rej) => {
                    const fr = new FileReader();
                    fr.onload = () => res(fr.result);
                    fr.onerror = () => rej(fr.error);
                    fr.readAsDataURL(b);
                });
            }
            """,
            img_url,
        )
    except Exception as e:
        log_err(f"Failed to fetch image via browser: {e}")
        save_debug(page, "fetch-fail")
        return 6

    if not isinstance(data_url, str) or "," not in data_url:
        log_err("Unexpected data URL format from fetch.")
        return 6

    # base64 デコードして保存
    b64 = data_url.split(",", 1)[1]
    try:
        output.write_bytes(base64.b64decode(b64))
    except Exception as e:
        log_err(f"Failed to write output file: {e}")
        return 6

    size_kb = output.stat().st_size // 1024
    log_info(f"Saved: {output} ({size_kb} KB)")
    return 0


# === エントリポイント =================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="ChatGPT 画像生成の自動化 (Playwright + Edge)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--setup", action="store_true",
                        help="初回ログイン用: Edge を起動してユーザーログインを待つ")
    parser.add_argument("--check-login", action="store_true",
                        help="ログイン引き継ぎ確認 (画像生成しない、DALL-E 枠消費なし)")
    parser.add_argument("--prompt-file", type=Path,
                        help="プロンプトファイルパス (UTF-8)")
    parser.add_argument("--prompt-string", type=str,
                        help="プロンプト文字列 (--prompt-file と排他)")
    parser.add_argument("--output", type=Path,
                        help="出力 PNG パス (例: assets/room_X.png)")
    parser.add_argument("--timeout", type=int, default=GENERATION_TIMEOUT_S_DEFAULT,
                        help=f"生成タイムアウト秒数 (デフォルト {GENERATION_TIMEOUT_S_DEFAULT})")
    parser.add_argument("--retries", type=int, default=1,
                        help="生成失敗時のリトライ回数 (デフォルト 1)")
    args = parser.parse_args()

    if args.setup:
        return cmd_setup()

    if args.check_login:
        return cmd_check_login()

    # 通常実行の引数チェック
    if not args.output:
        parser.error("--output is required for generation mode")
    if not args.prompt_file and not args.prompt_string:
        parser.error("either --prompt-file or --prompt-string is required")
    if args.prompt_file and args.prompt_string:
        parser.error("--prompt-file and --prompt-string are mutually exclusive")

    if args.prompt_file:
        try:
            prompt = args.prompt_file.read_text(encoding="utf-8")
        except Exception as e:
            log_err(f"Failed to read prompt file '{args.prompt_file}': {e}")
            return 6
    else:
        prompt = args.prompt_string

    prompt = prompt.strip()
    if not prompt:
        log_err("Prompt is empty.")
        return 6

    return cmd_generate(prompt, args.output, args.timeout, args.retries)


if __name__ == "__main__":
    sys.exit(main())
