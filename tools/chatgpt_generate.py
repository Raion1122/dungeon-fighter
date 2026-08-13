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
import json
import os
# (下の sys import 後に stdout/stderr を UTF-8 化する。理由はそこの注記)
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

# cp932 コンソールでも記号入りの文字列を出せるよう UTF-8 化。
# ⚠ これが無いと `—`(U+2014) 等を含むログ 1 行で UnicodeEncodeError が上がり、
#   **その項目が rc=6 で死ぬ** (2026-08-12 に廃坑の 2 枚を落とした)。ログ文は ASCII に
#   保つのが第一だが、保険としてここでも受ける。出典は scripts/hooks/check_changelog.py。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

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
    # ⚠ UI 言語が日本語だと aria-label が「プロンプトを送信する」で英語パターンに当たらない。
    #   2026-08-12、"Send button not found" → Enter フォールバックへ落ち、しかも直前の応答が
    #   まだ流れていて Enter も無視され、プロンプトが入力欄に残ったまま 240s 空費した。
    "send_button":           ('button[data-testid="send-button"], button[aria-label*="Send"], '
                              'button[id="composer-submit-button"], button[aria-label*="送信"]'),
    # 生成完了画像 (DALL-E 出力の URL パターン)
    # 2026 現行: chatgpt.com/backend-api/estuary/content?id=file_... 形式
    # 旧パターン (oaiusercontent / dalle / files.openai.com) も互換で残す
    "generated_image":       'img[src*="backend-api/estuary"], img[src*="oaiusercontent"], img[src*="dalle"], img[src*="files.openai.com"]',
    # 生成中インジケータ (Stop ボタン)
    # ⚠ 送信ボタンと同じ理由で日本語 UI (「ストリーミングの停止」) も併記する。ここが当たらないと
    #   「まだ流れている」を検知できず、次のプロンプトを流れている最中に打ち込んでしまう。
    "generating_indicator":  ('button[data-testid="stop-button"], button[aria-label*="Stop"], '
                              'button[aria-label*="停止"]'),
    # CAPTCHA iframe
    "captcha":               'iframe[src*="captcha"], iframe[src*="hcaptcha"], iframe[title*="captcha" i]',
    # 失敗テキストパターン
    # ⚠ UI 言語が日本語だと英語パターンに一切引っかからず、失敗を検知できないまま
    #    タイムアウトまで待ち続ける (2026-07-21 に 300s×2 を空費)。日本語も必ず併記する。
    "rate_limit_text":       ["rate limit", "usage limit", "hit the limit", "limit reached",
                              "you've reached", "try again later",
                              "上限に達し", "制限に達し", "しばらくしてから", "時間をおいて"],
    "generation_error_text": ["couldn't generate", "couldn't create", "can't generate", "can't create",
                              "unable to generate", "unable to create", "failed to generate",
                              "画像を作成できません", "画像を生成できません", "画像生成中にエラー"],
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


def cmd_generate_batch(items: list, timeout_s: int) -> int:
    """バッチ生成: 1 起動 / 1 新規チャット内で複数プロンプトを連投。

    items: list of (prompt_text, output_path_or_None, expect_image) tuples。
    同じチャット内で連投することで、ChatGPT 側の会話コンテキスト (画風 / キャラ
    記憶) が共有され、同キャラの walk + attack を「同じ人物」として描かせやすい。

    expect_image=False の項目はテキスト応答だけ待って次へ進む (テンプレ把握ターン)。
    手動運用と同じ「テンプレ把握 → キャラ指示連投」フロー対応。

    挙動 (Plan 準拠):
      - 0 (OK)        → 次の item へ
      - 1/2/5 (致命) → 即中断、残り items は [skipped] ログ + 当該 rc を全体に返す
      - 3/4/6 (失敗) → 当該 item だけスキップ、次へ。最終 exit code は 3 (部分失敗)
    """
    if not items:
        log_err("Batch is empty.")
        return 6

    log_info(f"Batch mode: {len(items)} item(s), shared chat session.")
    log_info(f"Timeout per item: {timeout_s}s")
    for i, (_, out, expect_image) in enumerate(items, 1):
        if expect_image:
            log_info(f"  [{i}] image -> {out}")
        else:
            log_info(f"  [{i}] text-only (template grasp, no image)")

    ensure_dir(DEBUG_DIR)

    seen_urls: set = set()
    had_partial_failure = False

    with sync_playwright() as p:
        browser, ctx, edge_proc = launch_browser(p, headless=False)
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            # 新規チャットへ 1 回だけ遷移
            rc = _navigate_new_chat(page)
            if rc != 0:
                log_err(f"Failed to open new chat (rc={rc}). Aborting batch.")
                for i, (_, out, expect_image) in enumerate(items, 1):
                    label = str(out) if expect_image else "(text-only)"
                    log_err(f"  [{i}] skipped: {label}")
                return rc

            for i, (prompt, output, expect_image) in enumerate(items, 1):
                if expect_image:
                    log_info(f"=== [{i}/{len(items)}] image -> {output} ===")
                else:
                    log_info(f"=== [{i}/{len(items)}] text-only (template grasp) ===")
                log_info(f"Prompt length: {len(prompt)} chars")
                try:
                    rc = _send_prompt_and_capture(
                        page, prompt, output, seen_urls, timeout_s, expect_image
                    )
                except PWTimeoutError as e:
                    log_err(f"Playwright timeout: {e}")
                    save_debug(page, f"batch-{i}-pw-timeout")
                    rc = 4
                except Exception as e:
                    log_err(f"Unexpected error: {e}")
                    save_debug(page, f"batch-{i}-unexpected")
                    rc = 6

                if rc == 0:
                    continue
                # 致命: 残り全部を skipped としてログ、即返す
                if rc in (1, 2, 5):
                    log_err(f"Fatal rc={rc} at item {i}. Skipping remaining {len(items) - i} item(s):")
                    for j in range(i, len(items)):
                        _, out_j, expect_j = items[j]
                        label = str(out_j) if expect_j else "(text-only)"
                        log_err(f"  [{j + 1}] skipped: {label}")
                    return rc
                # 部分失敗: その item だけスキップ
                log_err(f"Item {i} failed (rc={rc}). Continuing to next item.")
                had_partial_failure = True

            return 3 if had_partial_failure else 0
        finally:
            close_browser(browser, edge_proc)


def _load_batch(batch_path: Path) -> Optional[list]:
    """JSONL バッチファイルを読み込んで (prompt_text, output_path, expect_image) のリストを返す。

    各行: {"prompt_file": "<rel-path>", "output": "<rel-path>", "expect_image": true}
      - "expect_image" は省略可、デフォルト true。
      - "expect_image": false の場合は "output" は省略可 (画像保存しないため)。
    空行と # で始まる行はコメント扱いでスキップ。
    パスは batch_path の親ディレクトリではなく **CWD** からの相対 (ユーザーが
    プロジェクトルートで実行する前提)。

    expect_image=false は手動運用と同じ「テンプレ把握 → キャラ指示連投」の
    最初のターン(テンプレ把握ターン)で使う。ChatGPT に仕様を読ませて
    「把握しました」とテキスト返答してもらうだけで、画像は生成させない。
    """
    try:
        raw = batch_path.read_text(encoding="utf-8")
    except Exception as e:
        log_err(f"Failed to read batch file '{batch_path}': {e}")
        return None

    items = []
    for lineno, line in enumerate(raw.splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        try:
            obj = json.loads(s)
        except json.JSONDecodeError as e:
            log_err(f"{batch_path}:{lineno}: invalid JSON: {e}")
            return None
        pf = obj.get("prompt_file")
        op = obj.get("output")
        expect_image = bool(obj.get("expect_image", True))
        if not pf:
            log_err(f"{batch_path}:{lineno}: missing 'prompt_file'")
            return None
        if expect_image and not op:
            log_err(f"{batch_path}:{lineno}: 'output' is required when expect_image is true")
            return None
        prompt_path = Path(pf)
        try:
            prompt_text = prompt_path.read_text(encoding="utf-8").strip()
        except Exception as e:
            log_err(f"{batch_path}:{lineno}: cannot read prompt_file '{pf}': {e}")
            return None
        if not prompt_text:
            log_err(f"{batch_path}:{lineno}: prompt_file '{pf}' is empty")
            return None
        items.append((prompt_text, Path(op) if op else None, expect_image))

    if not items:
        log_err(f"{batch_path}: no valid items found (file may be empty or all comments).")
        return None
    return items


def _navigate_new_chat(page: Page) -> int:
    """新規チャットへ遷移し、入力欄が出るまで待つ。終了コードを返す (0 = OK)。

    バッチモードでは「最初の1回だけ」呼ぶ。以降は同じチャット内で連続メッセージを送る。
    """
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

    return 0


def _composer_text(page: Page) -> str:
    """入力欄に今入っている本文。取れない UI 変更時は空文字 (検算をスキップする側へ倒す)。"""
    try:
        return (page.eval_on_selector(
            SELECTORS["prompt_input"], "el => el.innerText || el.value || ''") or "").strip()
    except Exception:
        return ""


def _body_len(page: Page) -> int:
    """会話ペインの文字数。応答が流れている間だけ増え続ける。

    ⚠⚠ **完了判定を「停止ボタンの有無」に頼らない**のがこの関数の存在理由 (2026-08-12)。
      ChatGPT の UI が変わると停止ボタンのセレクタが当たらなくなり、その瞬間
      「busy でない = 書き終わった」と読んで**送信直後に完了と誤判定**する。実際そうなり、
      流れている最中に次のプロンプトを打ち込んで 2 枚とも空振りした
      (この誤判定は「一度も待たずに次へ進む」ので、ログ上は正常に見えるのが最悪)。
      文字数が伸びなくなったかどうかは DOM 構造に依存しないので、UI 変更に強い。
    """
    try:
        return len(page.inner_text("main") or "")
    except Exception:
        try:
            return len(page.inner_text("body") or "")
        except Exception:
            return -1


def _wait_idle(page: Page, timeout_s: float, quiet_polls: int = 3) -> bool:
    """直前の応答が流れ終わる (= 本文が伸びなくなる) まで待つ。戻り: 落ち着いたか。

    停止ボタンが見えている間は無条件で busy 扱いにし、見えなくなった後は
    **本文の長さが quiet_polls 回連続で変わらないこと**を完了の条件にする。
    """
    deadline = time.time() + timeout_s
    last, quiet = -1, 0
    while time.time() < deadline:
        try:
            busy = page.query_selector(SELECTORS["generating_indicator"])
        except Exception:
            busy = None
        cur = _body_len(page)
        if busy or cur != last:
            quiet = 0
        else:
            quiet += 1
            if quiet >= quiet_polls:
                return True
        last = cur
        time.sleep(1.0)
    log_info(f"Idle wait timed out after {int(timeout_s)}s (previous response may still stream)")
    return False


def _try_send(page: Page, budget_s: float = 120.0) -> bool:
    """入力欄が空になるまで送信を粘る。戻り: 送れたか。

    ⚠ 「ボタンを押せた」は送信の証拠にならない。応答が流れている間、送信ボタンは停止ボタンへ
      差し替わり、ボタンも Enter も**黙って無視される**(本文だけが入力欄に残る)。唯一信用
      できるのは入力欄が空になったかどうか。
    ⚠ セレクタが当たらない UI 変更に備え、**押し直しを繰り返す**方式にしてある
      (流れ終われば通るので、停止ボタンの正しいセレクタを知らなくても自力で回復する)。
    """
    deadline = time.time() + budget_s
    attempt = 0
    logged = False
    while time.time() < deadline:
        # ★停止ボタンが見えている = まだ流れている。この間は送信ボタンが disabled
        #   (opacity 0.35 と実測) なので、押しても Enter でも通らない。試さずに待つ。
        #   2026-08-13、砦のテンプレ応答が 3 分以上流れ続け、この待ちが無かったため
        #   「押す → 5 秒待つ」を予算いっぱい繰り返して 2 枚とも落とした。
        try:
            if page.query_selector(SELECTORS["generating_indicator"]):
                if not logged:
                    log_info("Previous response is still streaming; waiting before sending...")
                    logged = True
                time.sleep(2.0)
                continue
        except Exception:
            pass
        attempt += 1
        # 手段を 3 つ順に回す。⚠ Enter の前に**入力欄へフォーカスを戻す** (直前に送信ボタンを
        #   押していると、フォーカスがボタン上にあり Enter がボタンの再押下になってしまう)。
        way = attempt % 3
        try:
            btn = page.query_selector(SELECTORS["send_button"])
            if way == 1 and btn:
                btn.click()
            elif way == 2 and btn:
                btn.evaluate("b => b.click()")   # actionability を通さない DOM 直 click
            else:
                page.click(SELECTORS["prompt_input"])
                page.keyboard.press("Enter")
        except Exception:
            pass
        for _ in range(10):                      # 5 秒だけ入力欄の消えるのを待つ
            if not _composer_text(page):
                return True
            time.sleep(0.5)
        if attempt == 1:
            log_info("Send did not go through (composer still holds the prompt); "
                     "retrying while the previous response finishes...")
            _log_send_state(page)
    return False


def _log_send_state(page: Page) -> None:
    """送信できない瞬間の DOM 状態をログへ出す。

    ⚠ ここが無いと「押したのに送れない」の原因 (無効化されている / そもそも要素が無い /
      まだ生成中) を**画面写真から推測する**しかなくなる。2026-08-12 に 3 回それをやった。
    """
    try:
        st = page.evaluate(
            """(sels) => {
              const b = document.querySelector(sels[0]);
              const stop = document.querySelector(sels[1]);
              const cs = b ? getComputedStyle(b) : null;
              const m = document.querySelector('main');
              return {
                sendFound: !!b,
                sendId: b ? (b.id || null) : null,
                sendDisabled: b ? (b.disabled === true ||
                                   b.getAttribute('aria-disabled') === 'true') : null,
                sendOpacity: cs ? cs.opacity : null,
                sendPointer: cs ? cs.pointerEvents : null,
                stopVisible: !!stop,
                mainLen: m ? m.innerText.length : -1,
              };
            }""", [SELECTORS["send_button"], SELECTORS["generating_indicator"]])
        log_info("  send-state: " + json.dumps(st))
    except Exception as e:
        log_info(f"  send-state: unavailable ({e})")


def _send_prompt_and_capture(
    page: Page,
    prompt: str,
    output: Optional[Path],
    seen_urls: set,
    timeout_s: int,
    expect_image: bool = True,
) -> int:
    """同じ page にプロンプトを送信し、新規画像 1 枚を取得して output に保存。

    バッチで連投する場合は seen_urls に既出 URL が積まれているので、それを
    除外した新規画像のみを採用する。採用した URL は seen_urls に追加して返す。
    終了コードを返す (0 = OK)。

    expect_image=False のとき(テンプレ把握ターンなど):
      - 画像 URL を待たず、ChatGPT のテキスト応答 (generating_indicator 消失)
        を最大 60 秒だけ待って return。output 書き込みはスキップ。
      - 「これは仕様です、把握だけ」「画像生成は次のメッセージから」を伝える
        2 段階フロー (手動運用準拠) の最初のターン用。
    """
    if expect_image and output is not None:
        ensure_dir(output.parent)

    # ⚠⚠ 打ち込む前に「前のターンがまだ流れていないか」を必ず確かめる (2026-08-12)。
    #   流れている間は送信ボタンが停止ボタンに置き換わるので、送信は**ボタンでも Enter でも
    #   通らない**。それでも本文は入力欄に入るため、症状は「タイムアウト」にしか見えず、
    #   1 件あたり timeout_s を丸ごと空費する (廃坑の 2 枚で 480s を捨てた)。
    _wait_idle(page, 180)

    # 入力欄の取得 + 既存テキストクリア (再試行時 / バッチ 2 件目以降の残骸対策)
    try:
        page.click(SELECTORS["prompt_input"])
    except Exception as e:
        log_err(f"Cannot focus prompt input: {e}")
        save_debug(page, "focus-fail")
        return 6
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")

    # プロンプト投入
    # ⚠ page.keyboard.type() に "\n" を渡すと ChatGPT の入力欄は Enter = 送信 と解釈する。
    #    2026-07-27、1 行目だけが送信され残りが入力欄に取り残されたまま画像生成が走り、
    #    テンプレ把握ターンもろとも壊れた (無料枠を 1 枚溶かした)。改行は必ず Shift+Enter。
    log_info("Typing prompt...")
    for i, line in enumerate(prompt.split("\n")):
        if i:
            page.keyboard.press("Shift+Enter")
        if line:
            page.keyboard.type(line, delay=TYPE_DELAY_MS)

    # 投入後の検算: 本文が丸ごと入力欄に乗っているか (途中送信されていないか)。
    # 欠けたまま送ると生成枠を無駄に消費するので、送信前に落とす。
    try:
        typed = page.eval_on_selector(
            SELECTORS["prompt_input"], "el => el.innerText || el.value || ''"
        ) or ""
    except Exception:
        typed = ""  # 取得できない UI 変更時は検算をスキップ (従来動作へフォールバック)
    if typed:
        want = "".join(prompt.split())
        got = "".join(typed.split())
        if len(got) < len(want) * 0.9:
            log_err(
                f"Prompt truncated in composer ({len(got)}/{len(want)} chars) "
                "- aborting before send to avoid wasting a generation."
            )
            save_debug(page, "typing-truncated")
            return 6

    # 送信 (ボタンが見つかれば押す、無ければ Enter)。
    # ⚠ 送信は**押した後に入力欄が空になったか**で確かめる。押せた/押せないは送信の証拠にならない
    #   (停止ボタンが出ている間はどちらの手段も黙って無視される = 2026-08-12 の空費の原因)。
    if not _try_send(page, budget_s=timeout_s):
        log_err("Prompt was never sent (composer still not empty). Aborting this item "
                "instead of waiting out the generation timeout.")
        save_debug(page, "send-failed")
        return 6

    if not expect_image:
        # テキスト応答待ちモード (テンプレ把握ターン)。
        log_info("Prompt sent. Waiting for text-only response (no image expected)...")
        time.sleep(3)
        # ⚠⚠ 旧実装は「停止ボタンが無い = 完了」だった。UI が変わってセレクタが当たらなくなると
        #   **送信 3 秒後に必ず完了と誤判定**し、流れている最中に次のプロンプトを打ち込む
        #   (2026-08-12 に発生。ログ上は "complete" と出るので正常に見えるのが最悪)。
        #   → 完了の条件を **本文が伸びなくなったこと** に変えた (DOM 構造に依存しない)。
        #   旧値 60s も日本語の長文応答には足りなかったので 180s へ広げてある。
        text_deadline = time.time() + min(timeout_s, 180)
        last_text_log = 0.0
        last_len, quiet = -1, 0
        while time.time() < text_deadline:
            err = detect_failure(page)
            if err == "RATE_LIMIT":
                log_err("Rate limit detected during text-only wait.")
                save_debug(page, "rate-limit-text")
                return 2
            if err == "GEN_ERROR":
                log_err("ChatGPT replied with a generation error in text-only mode.")
                save_debug(page, "gen-error-text")
                return 3
            try:
                busy = page.query_selector(SELECTORS["generating_indicator"])
            except Exception:
                busy = None
            cur = _body_len(page)
            if busy or cur != last_len or cur <= 0:
                quiet = 0
            else:
                quiet += 1
                if quiet >= 4:      # 4 回連続 (約 8 秒) 伸びていない = 書き終わった
                    log_info(f"Text-only response complete (text stable at {cur} chars).")
                    return 0
            last_len = cur
            now = time.time()
            if now - last_text_log > 10:
                remaining = int(text_deadline - now)
                log_info(f"Still waiting for text response... ({remaining}s remaining)")
                last_text_log = now
            time.sleep(GENERATION_POLL_INTERVAL_S)
        # 60 秒以内に indicator が消えなかった場合も OK 扱い(次プロンプト送信で上書きされる)
        # ⚠ ここへ来ても**失敗ではない**。下流の _wait_idle と _try_send が
        #   「流れている間は送らない」で受け止めるので、そのまま次の項目へ進んでよい。
        log_info(f"Text-only wait exceeded {int(min(timeout_s, 180))}s, proceeding "
                 "(the send path waits for the stream to finish).")
        return 0

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
        # 小さなサムネイル/プレビュー (例: 512x512 の estuary file-aNU...) は除外。
        # バッチ時は既出 URL (前のプロンプトで採用済) も除外。
        try:
            elems = page.query_selector_all(SELECTORS["generated_image"])
            big_imgs = []  # (natural_width, src) のリスト
            for el in elems:
                src = el.get_attribute("src") or ""
                if not any(t in src for t in (
                    "backend-api/estuary", "oaiusercontent", "dalle", "files.openai.com"
                )):
                    continue
                if src in seen_urls:
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
                log_info(f"Image URL captured: {img_url[:80]}...")
                # ChatGPT 応答完了 (generating_indicator = Stop ボタン消失) を待つ。
                # 画像 URL は応答途中で DOM に現れることがあり、その状態で次プロンプト
                # を送ると ChatGPT が混乱する。ユーザー要望「1 個うったらレスポンス
                # 待って次」を実装。最大 30 秒待ち、それ以上は諦めて続行。
                settle_deadline = time.time() + 30
                last_settle_log = 0.0
                while time.time() < settle_deadline:
                    try:
                        busy = page.query_selector(SELECTORS["generating_indicator"])
                    except Exception:
                        busy = None
                    if not busy:
                        log_info("Generation settled (no busy indicator).")
                        break
                    now2 = time.time()
                    if now2 - last_settle_log > 5:
                        remaining_settle = int(settle_deadline - now2)
                        log_info(f"Waiting for response to settle... ({remaining_settle}s remaining)")
                        last_settle_log = now2
                    time.sleep(1.0)
                else:
                    log_info("Settle wait timed out (30s), proceeding anyway.")
                break  # polling ループ脱出 → 画像取得処理へ
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

    # (Image URL captured ログは settle wait 直前で既に出力済)

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
    seen_urls.add(img_url)
    return 0


def _run_one_generation(page: Page, prompt: str, output: Path, timeout_s: int) -> int:
    """1 回の単発生成試行: 新規チャットへ → プロンプト送信 → 画像保存。"""
    rc = _navigate_new_chat(page)
    if rc != 0:
        return rc
    return _send_prompt_and_capture(page, prompt, output, set(), timeout_s)


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
    parser.add_argument("--prompt-batch", type=Path,
                        help="JSONL バッチファイル。各行 {\"prompt_file\":\"...\",\"output\":\"...\"} を "
                             "同じ ChatGPT チャット内で順に連投する (会話コンテキスト共有でキャラ統一感を保証)")
    parser.add_argument("--output", type=Path,
                        help="出力 PNG パス (例: assets/room_X.png)。--prompt-batch 時は無視 (jsonl 側で指定)")
    parser.add_argument("--timeout", type=int, default=GENERATION_TIMEOUT_S_DEFAULT,
                        help=f"生成タイムアウト秒数 (デフォルト {GENERATION_TIMEOUT_S_DEFAULT})")
    parser.add_argument("--retries", type=int, default=1,
                        help="生成失敗時のリトライ回数 (単発モードのみ、デフォルト 1)")
    args = parser.parse_args()

    if args.setup:
        return cmd_setup()

    if args.check_login:
        return cmd_check_login()

    # --prompt-batch は単発系引数と排他
    if args.prompt_batch:
        if args.prompt_file or args.prompt_string or args.output:
            parser.error("--prompt-batch is exclusive with --prompt-file / --prompt-string / --output "
                         "(specify prompt_file and output inside the jsonl)")
        items = _load_batch(args.prompt_batch)
        if items is None:
            return 6
        return cmd_generate_batch(items, args.timeout)

    # 通常実行の引数チェック
    if not args.output:
        parser.error("--output is required for generation mode (or use --prompt-batch)")
    if not args.prompt_file and not args.prompt_string:
        parser.error("either --prompt-file or --prompt-string is required (or use --prompt-batch)")
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
