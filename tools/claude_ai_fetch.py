#!/usr/bin/env python3
"""claude.ai のチャット/Projects を Claude Code から取得する CLI。

Playwright で専用 Edge プロファイル (claude.ai にログイン済) を起動し、claude.ai の
ページコンテキスト内 fetch() で内部 JSON API を叩く。CORS / Cloudflare は実ブラウザ
内 fetch なので回避できる (tools/chatgpt_generate.py の画像 DL と同じ手法)。
取得結果は markdown で claude-ai-export/ に保存し、Claude Code が Read してチェックする。

使用例:
  初回ログイン (1 回だけ):
    py tools/claude_ai_fetch.py --setup

  ログイン確認:
    py tools/claude_ai_fetch.py --check-login

  一覧:
    py tools/claude_ai_fetch.py --list-projects
    py tools/claude_ai_fetch.py --list-chats

  個別取得 (名前部分一致 or uuid):
    py tools/claude_ai_fetch.py --project "ダンジョン"
    py tools/claude_ai_fetch.py --chat "戦闘バランス"

Exit codes:
  0 = 成功
  1 = ログイン期限切れ / 未ログイン
  4 = タイムアウト
  6 = その他 (見つからない / 曖昧 / API 形不一致 / セレクタ変更等)

注意: 内部 API は非公式。エンドポイント / フィールド名が変わったら
tools/_claude_ai_inspect.py で実レスポンス形を確認して本ファイルを更新する。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

try:
    from playwright.sync_api import (
        sync_playwright,
        Page,
        TimeoutError as PWTimeoutError,
    )
except ImportError:
    sys.stderr.write(
        "ERROR: Playwright is not installed.\n"
        "  pip install playwright\n"
        "  playwright install msedge\n"
    )
    sys.exit(6)

# Windows のロケール依存出力 (cp932 等) で一覧の日本語が化けるのを防ぐため
# stdout/stderr を UTF-8 に強制する。保存する markdown は別途 encoding="utf-8" 指定。
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


# === 設定 ============================================================

PROFILE_DIR = Path.home() / ".claude" / "claude-ai-automation" / "edge-profile"
DEBUG_DIR   = Path.home() / ".claude" / "claude-ai-automation" / "debug"
CLAUDE_URL  = "https://claude.ai/"
# 既定の出力先 (リポジトリ内・.gitignore 済)。--output-dir で上書き可。
DEFAULT_EXPORT_DIR = Path("claude-ai-export")

WAIT_DEFAULT_TIMEOUT_MS = 30_000
LIST_LIMIT_DEFAULT      = 50


# === ユーティリティ ===================================================

def log_info(msg: str) -> None:
    print(f"[claude-ai] {msg}", flush=True)


def log_err(msg: str) -> None:
    sys.stderr.write(f"[claude-ai] ERROR: {msg}\n")
    sys.stderr.flush()


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def save_debug(page: Page, tag: str) -> None:
    ensure_dir(DEBUG_DIR)
    ts = time.strftime("%Y%m%d_%H%M%S")
    path = DEBUG_DIR / f"{ts}_{tag}.png"
    try:
        page.screenshot(path=str(path), full_page=False)
        log_info(f"Debug screenshot: {path}")
    except Exception as e:
        log_err(f"Failed to save debug screenshot: {e}")


def slugify(name: str, maxlen: int = 50) -> str:
    """ファイル名向けに整形。Windows 禁止文字を除去、空白は _、日本語はそのまま残す。"""
    s = (name or "").strip()
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", s)
    s = re.sub(r"\s+", "_", s)
    s = s.strip("._")
    if len(s) > maxlen:
        s = s[:maxlen].rstrip("._")
    return s or "untitled"


# === 例外 ============================================================

class LoginExpired(Exception):
    pass


class ApiError(Exception):
    def __init__(self, status: int, url: str, body: str):
        self.status = status
        self.url = url
        self.body = body
        super().__init__(f"HTTP {status} for {url}\n  body[:300]: {body[:300]}")


# === ブラウザ =========================================================

def find_msedge() -> Optional[Path]:
    for env_key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.environ.get(env_key)
        if base:
            p = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if p.exists():
                return p
    return None


def launch_browser(playwright, headless: bool = False):
    """専用プロファイルで Edge を起動 (永続コンテキスト)。chatgpt_generate.py と同型。"""
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
    return context


def navigate_claude(page: Page) -> None:
    """claude.ai を開いて同一オリジン化。未ログインなら LoginExpired。"""
    page.goto(CLAUDE_URL, wait_until="domcontentloaded", timeout=WAIT_DEFAULT_TIMEOUT_MS)
    try:
        page.wait_for_load_state("networkidle", timeout=WAIT_DEFAULT_TIMEOUT_MS)
    except PWTimeoutError:
        pass
    time.sleep(3)  # JS hydration
    if "/login" in page.url or "/auth" in page.url:
        raise LoginExpired(f"redirected to {page.url}")


def api_get(page: Page, path: str):
    """claude.ai ページ内 fetch で内部 API を叩き JSON を返す。

    非 OK は ApiError、401/403 や HTML ログインページは LoginExpired を投げる。
    """
    res = page.evaluate(
        """
        async (path) => {
            const r = await fetch(path, {
                credentials: "include",
                headers: {
                    "accept": "application/json",
                    // Web アプリと同じプラットフォーム宣言。render_all_tools と併せて
                    // アーティファクト(ファイル系ツール)ブロックを完全な形で受け取る。
                    "anthropic-client-platform": "web_claude_ai",
                },
            });
            const body = await r.text();
            return { ok: r.ok, status: r.status, url: r.url, body };
        }
        """,
        path,
    )
    status = res.get("status", 0)
    body = res.get("body") or ""
    if status in (401, 403):
        raise LoginExpired(f"HTTP {status} for {path}")
    if not res.get("ok"):
        raise ApiError(status, res.get("url", path), body)
    try:
        return json.loads(body)
    except Exception:
        # JSON でない (ログイン HTML 等)
        if "<html" in body[:200].lower() or "/login" in res.get("url", ""):
            raise LoginExpired(f"non-JSON response for {path} (login page?)")
        raise ApiError(status, res.get("url", path), body)


def resolve_org(page: Page) -> dict:
    """組織を解決。chat capability のある org を優先、無ければ先頭。"""
    orgs = api_get(page, "/api/organizations")
    if not isinstance(orgs, list) or not orgs:
        raise ApiError(0, "/api/organizations", json.dumps(orgs)[:300])
    for o in orgs:
        caps = o.get("capabilities") or []
        if "chat" in caps:
            return o
    return orgs[0]


# === データ取得 =======================================================

def fetch_conversations(page: Page, org_uuid: str) -> list:
    convs = api_get(page, f"/api/organizations/{org_uuid}/chat_conversations")
    if not isinstance(convs, list):
        raise ApiError(0, "chat_conversations", json.dumps(convs)[:300])
    convs.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
    return convs


def fetch_conversation_detail(page: Page, org_uuid: str, conv_uuid: str) -> dict:
    # render_all_tools=true を付けると、アーティファクト(create_file 等のファイル系
    # ツール)ブロックが本体込みで返る。無いと "This block is not supported..." の
    # プレースホルダに置換されてしまう (= 企画書本文が欠落する)。
    return api_get(
        page,
        f"/api/organizations/{org_uuid}/chat_conversations/{conv_uuid}"
        "?tree=True&rendering_mode=messages&render_all_tools=true",
    )


def fetch_projects(page: Page, org_uuid: str) -> list:
    projs = api_get(page, f"/api/organizations/{org_uuid}/projects")
    if not isinstance(projs, list):
        raise ApiError(0, "projects", json.dumps(projs)[:300])
    projs.sort(key=lambda c: c.get("updated_at") or c.get("created_at") or "", reverse=True)
    return projs


def fetch_project_detail(page: Page, org_uuid: str, proj_uuid: str) -> dict:
    return api_get(page, f"/api/organizations/{org_uuid}/projects/{proj_uuid}")


def fetch_project_docs(page: Page, org_uuid: str, proj_uuid: str) -> list:
    docs = api_get(page, f"/api/organizations/{org_uuid}/projects/{proj_uuid}/docs")
    return docs if isinstance(docs, list) else []


def conversations_in_project(convs: list, project_uuid: str) -> list:
    """会話リストを project_uuid で絞り込む (chat_conversations の項目が持つフィールド)。"""
    out = [c for c in convs if c.get("project_uuid") == project_uuid]
    out.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
    return out


# === markdown 整形 ====================================================

def _fence_for(content: str) -> str:
    """content 内の最長バッククォート連続 +1 のフェンスを返す (コード埋込のネスト崩れ防止)。"""
    longest = run = 0
    for ch in content:
        if ch == "`":
            run += 1
            longest = max(longest, run)
        else:
            run = 0
    return "`" * max(3, longest + 1)


def _apply_file_op(files: dict, order: list, name: str, inp: dict) -> Optional[str]:
    """ファイル系/アーティファクトのツール呼び出しを files(path->content) に反映。

    会話本文に差し込むインライン用ラベルを返す (対象外ツールは None)。
    成果物(企画書等)の本体は create_file の file_text、編集は str_replace の
    old_str→new_str で再構成する。レガシー artifacts ツールにも対応。
    """
    if not isinstance(inp, dict):
        return None
    if name == "create_file":
        path = inp.get("path") or "(no-path)"
        files[path] = inp.get("file_text") or ""
        if path not in order:
            order.append(path)
        return f"📄 **ファイル作成**: `{path}`"
    if name == "str_replace":
        # path 欠落時は直近に作成/編集したファイルを対象とみなす (編集は通常直前のファイル)
        path = inp.get("path") or (order[-1] if order else None)
        old = inp.get("old_str") or ""
        new = inp.get("new_str") or ""
        if path is None:
            return "✏️ **ファイル編集** (対象不明)"
        if path in files and old and old in files[path]:
            files[path] = files[path].replace(old, new, 1)
            return f"✏️ **ファイル編集**: `{path}`"
        if path not in files:
            files[path] = new
            order.append(path)
        return f"✏️ **ファイル編集**: `{path}` ⚠(自動再構成に一部失敗)"
    if name == "artifacts":  # レガシー artifacts ツール
        key = inp.get("title") or inp.get("id") or "artifact"
        cmd = inp.get("command")
        if cmd in ("create", "rewrite") or inp.get("content"):
            files[key] = inp.get("content") or ""
            if key not in order:
                order.append(key)
            return f"📄 **アーティファクト**: {key}"
        if cmd == "update":
            old = inp.get("old_str") or ""
            new = inp.get("new_str") or ""
            if key in files and old and old in files[key]:
                files[key] = files[key].replace(old, new, 1)
            return f"✏️ **アーティファクト編集**: {key}"
    return None


def conversation_to_md(conv: dict, org_uuid: str) -> str:
    """会話を markdown 化。content ブロックから本文 + 成果物ファイルを抽出する。

    render_all_tools=true で取得した前提 (top-level text は空で content に集約される)。
    content が無い古い形式には text フィールドでフォールバックする。
    thinking(内部推論)と tool_result は読みやすさのため省略する。
    """
    name = conv.get("name") or "(無題の会話)"
    uuid = conv.get("uuid", "")
    lines = [
        f"# {name}",
        "",
        f"- uuid: `{uuid}`",
        f"- created_at: {conv.get('created_at', '')}",
        f"- updated_at: {conv.get('updated_at', '')}",
        f"- url: https://claude.ai/chat/{uuid}",
        "",
        "---",
        "",
    ]
    files: dict = {}
    file_order: list = []
    msgs = conv.get("chat_messages") or []
    if not msgs:
        lines.append("_(メッセージなし — API レスポンスに chat_messages が含まれていません)_")
    for m in msgs:
        sender = m.get("sender")
        heading = "🧑 Human" if sender == "human" else "🤖 Assistant"
        ts = m.get("created_at", "")
        lines.append(f"## {heading}  <sub>{ts}</sub>")
        lines.append("")
        parts = []
        blocks = m.get("content") or []
        if blocks:
            for blk in blocks:
                if not isinstance(blk, dict):
                    continue
                t = blk.get("type")
                if t == "text":
                    tx = (blk.get("text") or "").strip()
                    if tx:
                        parts.append(tx)
                elif t == "tool_use":
                    label = _apply_file_op(files, file_order,
                                           blk.get("name"), blk.get("input") or {})
                    if label:
                        parts.append(label)
                # thinking / tool_result / その他はスキップ
        else:
            tx = (m.get("text") or "").strip()  # 後方互換
            if tx:
                parts.append(tx)
        body = "\n\n".join(parts).strip()
        lines.append(body if body else "_(本文なし)_")
        atts = (m.get("attachments") or []) + (m.get("files") or [])
        names = [a.get("file_name") or a.get("file_name_display") or a.get("name")
                 for a in atts if isinstance(a, dict)]
        names = [n for n in names if n]
        if names:
            lines.append("")
            lines.append("📎 添付: " + ", ".join(names))
        lines.append("")
    # 成果物ファイル (最終再構成状態)
    if file_order:
        lines += ["---", "", f"## 📎 成果物ファイル ({len(file_order)} 件 / 最終状態)", ""]
        for path in file_order:
            content = files.get(path, "")
            lines.append(f"### `{path}`")
            lines.append("")
            if path.lower().endswith((".md", ".markdown", ".txt")):
                lines.append(content.rstrip())  # markdown/テキストはそのまま挿入
            else:
                fence = _fence_for(content)
                lang = path.rsplit(".", 1)[-1] if "." in path else ""
                lines += [f"{fence}{lang}", content.rstrip(), fence]
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def project_to_md(detail: dict, docs: list, org_uuid: str,
                  conversations: Optional[list] = None) -> str:
    name = detail.get("name") or "(無題のプロジェクト)"
    uuid = detail.get("uuid", "")
    lines = [
        f"# Project: {name}",
        "",
        f"- uuid: `{uuid}`",
        f"- created_at: {detail.get('created_at', '')}",
        f"- updated_at: {detail.get('updated_at', '')}",
        f"- url: https://claude.ai/project/{uuid}",
        "",
    ]
    desc = (detail.get("description") or "").strip()
    if desc:
        lines += ["## 概要 (description)", "", desc, ""]
    instr = (detail.get("prompt_template") or "").strip()
    if instr:
        lines += ["## カスタム指示 (prompt_template)", "", instr, ""]
    lines += ["---", "", f"## 📄 Docs ({len(docs)} 件)", ""]
    if not docs:
        lines.append("_(ドキュメントなし)_")
    for d in docs:
        fn = d.get("file_name") or d.get("uuid") or "(無名)"
        content = (d.get("content") or "").rstrip()
        lines.append(f"### {fn}")
        lines.append("")
        lines.append(content if content else "_(空)_")
        lines.append("")
    # このProjectに属する会話のインデックス (project_uuid で紐付け)
    # 先頭に "" を入れて、直前行 (例: "_(ドキュメントなし)_") が "---" で
    # setext 見出し化するのを防ぐ。
    if conversations is not None:
        lines += ["", "---", "", f"## 💬 このProjectの会話 ({len(conversations)} 件)", ""]
        if not conversations:
            lines.append("_(会話なし)_")
        for c in conversations:
            nm = c.get("name") or "(無題)"
            cu = c.get("uuid", "")
            lines.append(f"- **{nm}**")
            lines.append(f"  - uuid: `{cu}`  updated_at: {c.get('updated_at', '')}")
            lines.append(f"  - url: https://claude.ai/chat/{cu}")
    return "\n".join(lines).rstrip() + "\n"


# === 名前/uuid 解決 ===================================================

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                      r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def resolve_item(items: list, query: str, kind: str) -> Optional[dict]:
    """items (uuid/name を持つ dict のリスト) から query にマッチする 1 件を返す。

    uuid 完全一致 → name 完全一致 → name 部分一致 (大小無視) の順。
    複数候補なら候補を表示して None を返す (呼び元で exit 6)。
    """
    if _UUID_RE.match(query):
        for it in items:
            if it.get("uuid") == query:
                return it
        log_err(f"{kind}: uuid '{query}' not found.")
        return None

    q = query.lower()
    exact = [it for it in items if (it.get("name") or "").lower() == q]
    if len(exact) == 1:
        return exact[0]
    partial = [it for it in items if q in (it.get("name") or "").lower()]
    if len(partial) == 1:
        return partial[0]
    if not partial:
        log_err(f"{kind}: no match for '{query}'.")
        return None
    log_err(f"{kind}: '{query}' is ambiguous ({len(partial)} matches). Specify a uuid:")
    for it in partial[:20]:
        log_err(f"  - {it.get('name')!r}  uuid={it.get('uuid')}")
    return None


# === セッションコンテキスト ===========================================

class _Session:
    """with 文で browser+page を開き、navigate して page を返す薄いラッパー。"""
    def __init__(self, headless: bool):
        self.headless = headless
        self._pw = None
        self._ctx = None

    def __enter__(self) -> Page:
        if not PROFILE_DIR.exists():
            raise LoginExpired(f"profile not found: {PROFILE_DIR} (run --setup)")
        self._pw = sync_playwright().start()
        self._ctx = launch_browser(self._pw, headless=self.headless)
        page = self._ctx.pages[0] if self._ctx.pages else self._ctx.new_page()
        navigate_claude(page)
        return page

    def __exit__(self, *exc):
        try:
            if self._ctx:
                self._ctx.close()
        except Exception:
            pass
        try:
            if self._pw:
                self._pw.stop()
        except Exception:
            pass


# === コマンド: setup / check-login ====================================

def cmd_setup() -> int:
    """初回ログイン: Edge を Playwright 経由ではなく直接 subprocess で起動。"""
    ensure_dir(PROFILE_DIR)
    msedge = find_msedge()
    if not msedge:
        log_err("msedge.exe not found. Install Microsoft Edge from https://www.microsoft.com/edge")
        return 6

    log_info("Setup mode: launching Edge DIRECTLY (not via Playwright) with profile")
    log_info(f"  msedge: {msedge}")
    log_info(f"  profile: {PROFILE_DIR}")
    log_info("=" * 60)
    log_info("HOW TO COMPLETE SETUP:")
    log_info("  1. A fresh Edge window opens at claude.ai.")
    log_info("  2. Log in (Google / email / etc.).")
    log_info("  3. CLOSE the Edge window when the chat list is visible.")
    log_info("  Session is saved automatically when Edge exits.")
    log_info("=" * 60)

    cmd = [
        str(msedge),
        f"--user-data-dir={PROFILE_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        CLAUDE_URL,
    ]
    try:
        proc = subprocess.Popen(cmd)
    except Exception as e:
        log_err(f"Failed to launch Edge: {e}")
        return 6

    log_info(f"Edge launched (pid={proc.pid}). Waiting for it to close...")
    try:
        proc.wait()
    except KeyboardInterrupt:
        try:
            proc.terminate()
        except Exception:
            pass
        return 6

    deadline = time.time() + 30 * 60
    last_log = 0.0
    while time.time() < deadline:
        if not _edge_running_on_profile():
            log_info("All Edge processes for our profile have exited.")
            break
        now = time.time()
        if now - last_log > 60:
            log_info(f"Edge still running, waiting for close "
                     f"(~{int((deadline - now) / 60)} min before timeout)")
            last_log = now
        time.sleep(3)
    else:
        log_info("Timeout reached. Profile may be partial.")

    log_info("Setup complete. Session saved to profile.")
    return 0


def _edge_running_on_profile() -> bool:
    try:
        result = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
                "Where-Object { $_.CommandLine -like '*claude-ai-automation*' } | "
                "Measure-Object | Select-Object -ExpandProperty Count"
            ],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return False
        return int(result.stdout.strip() or 0) > 0
    except Exception:
        return False


def cmd_check_login(headless: bool) -> int:
    try:
        with _Session(headless) as page:
            org = resolve_org(page)
            log_info(f"Login OK. org={org.get('name')!r} uuid={org.get('uuid')}")
            return 0
    except LoginExpired as e:
        log_err(f"Login expired or not logged in: {e}. Run --setup.")
        return 1
    except ApiError as e:
        log_err(f"API error: {e}")
        return 6
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        return 6


# === コマンド: list ===================================================

def cmd_list(kind: str, limit: int, headless: bool) -> int:
    try:
        with _Session(headless) as page:
            org = resolve_org(page)
            org_uuid = org["uuid"]
            if kind == "chats":
                items = fetch_conversations(page, org_uuid)
                label = "会話"
                tsk = "updated_at"
            else:
                items = fetch_projects(page, org_uuid)
                label = "プロジェクト"
                tsk = "updated_at"
            shown = items[:limit]
            log_info(f"{label}: {len(items)} 件 (上位 {len(shown)} 件表示)")
            for i, it in enumerate(shown, 1):
                name = it.get("name") or "(無題)"
                print(f"  {i:3d}. {name}")
                print(f"       uuid={it.get('uuid')}  {tsk}={it.get(tsk, '')}")
            if len(items) > len(shown):
                log_info(f"... 他 {len(items) - len(shown)} 件 (--limit で増やせます)")
            return 0
    except LoginExpired as e:
        log_err(f"Login expired: {e}. Run --setup.")
        return 1
    except ApiError as e:
        log_err(f"API error (endpoint may have changed — run tools/_claude_ai_inspect.py): {e}")
        return 6
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        return 6


# === コマンド: fetch chat / project ===================================

def cmd_fetch_chat(query: str, output: Optional[Path], out_dir: Path, headless: bool) -> int:
    try:
        with _Session(headless) as page:
            org = resolve_org(page)
            org_uuid = org["uuid"]
            convs = fetch_conversations(page, org_uuid)
            target = resolve_item(convs, query, "chat")
            if target is None:
                return 6
            detail = fetch_conversation_detail(page, org_uuid, target["uuid"])
            md = conversation_to_md(detail, org_uuid)
            path = output or (out_dir / f"chat_{slugify(target.get('name'))}_{target['uuid'][:8]}.md")
            ensure_dir(path.parent)
            path.write_text(md, encoding="utf-8")
            n_msgs = len(detail.get("chat_messages") or [])
            log_info(f"Saved: {path}  ({n_msgs} messages, {path.stat().st_size // 1024} KB)")
            return 0
    except LoginExpired as e:
        log_err(f"Login expired: {e}. Run --setup.")
        return 1
    except ApiError as e:
        log_err(f"API error (run tools/_claude_ai_inspect.py to re-check endpoints): {e}")
        return 6
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        return 6


def cmd_fetch_project(query: str, output: Optional[Path], out_dir: Path, headless: bool) -> int:
    try:
        with _Session(headless) as page:
            org = resolve_org(page)
            org_uuid = org["uuid"]
            projs = fetch_projects(page, org_uuid)
            target = resolve_item(projs, query, "project")
            if target is None:
                return 6
            detail = fetch_project_detail(page, org_uuid, target["uuid"])
            if not isinstance(detail, dict) or not detail.get("uuid"):
                detail = target  # 詳細が取れない場合は一覧の値で代替
            docs = fetch_project_docs(page, org_uuid, target["uuid"])
            # このProjectに属する会話の一覧 (index) も付ける
            convs = fetch_conversations(page, org_uuid)
            proj_convs = conversations_in_project(convs, target["uuid"])
            md = project_to_md(detail, docs, org_uuid, conversations=proj_convs)
            path = output or (out_dir / f"project_{slugify(target.get('name'))}_{target['uuid'][:8]}.md")
            ensure_dir(path.parent)
            path.write_text(md, encoding="utf-8")
            log_info(f"Saved: {path}  ({len(docs)} docs, {len(proj_convs)} 関連会話, "
                     f"{path.stat().st_size // 1024} KB)")
            if proj_convs:
                log_info(f"このProjectの会話本体を一括取得するには: "
                         f"--project-chats \"{target.get('name')}\"")
            return 0
    except LoginExpired as e:
        log_err(f"Login expired: {e}. Run --setup.")
        return 1
    except ApiError as e:
        log_err(f"API error (run tools/_claude_ai_inspect.py to re-check endpoints): {e}")
        return 6
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        return 6


def cmd_fetch_project_chats(query: str, out_dir: Path, headless: bool, limit: int) -> int:
    """指定 Project に属する会話を一括取得。

    project_<slug>_<uuid8>/ サブフォルダに、概要(_project.md)と会話ごとの md を保存。
    --limit を超える会話があれば上位 limit 件だけ取得し、残りはログで通知。
    """
    try:
        with _Session(headless) as page:
            org = resolve_org(page)
            org_uuid = org["uuid"]
            projs = fetch_projects(page, org_uuid)
            target = resolve_item(projs, query, "project")
            if target is None:
                return 6
            proj_uuid = target["uuid"]
            convs = fetch_conversations(page, org_uuid)
            proj_convs = conversations_in_project(convs, proj_uuid)

            sub = out_dir / f"project_{slugify(target.get('name'))}_{proj_uuid[:8]}"
            ensure_dir(sub)

            # 概要 (description / prompt_template / docs / 会話インデックス)
            detail = fetch_project_detail(page, org_uuid, proj_uuid)
            if not isinstance(detail, dict) or not detail.get("uuid"):
                detail = target
            docs = fetch_project_docs(page, org_uuid, proj_uuid)
            (sub / "_project.md").write_text(
                project_to_md(detail, docs, org_uuid, conversations=proj_convs),
                encoding="utf-8",
            )
            log_info(f"Project: {target.get('name')!r} — 会話 {len(proj_convs)} 件 "
                     f"({len(docs)} docs)")

            to_fetch = proj_convs[:limit]
            if len(proj_convs) > len(to_fetch):
                log_info(f"⚠ {len(proj_convs)} 件中 上位 {len(to_fetch)} 件のみ取得 "
                         f"(--limit で増やせます)")

            saved = 0
            for i, c in enumerate(to_fetch, 1):
                cu = c["uuid"]
                nm = c.get("name") or "(無題)"
                log_info(f"  [{i}/{len(to_fetch)}] {nm}")
                try:
                    d = fetch_conversation_detail(page, org_uuid, cu)
                    md = conversation_to_md(d, org_uuid)
                    fp = sub / f"chat_{slugify(nm)}_{cu[:8]}.md"
                    fp.write_text(md, encoding="utf-8")
                    saved += 1
                except Exception as e:  # 1 件の失敗は致命にせずスキップ
                    log_err(f"    会話 {cu} の取得失敗(スキップ): {e}")
                    continue

            log_info(f"Saved {saved}/{len(to_fetch)} chats + _project.md -> {sub}")
            return 0 if saved == len(to_fetch) else 3
    except LoginExpired as e:
        log_err(f"Login expired: {e}. Run --setup.")
        return 1
    except ApiError as e:
        log_err(f"API error (run tools/_claude_ai_inspect.py to re-check endpoints): {e}")
        return 6
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        return 6


# === エントリポイント =================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="claude.ai のチャット/Projects を取得 (Playwright + Edge)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--setup", action="store_true",
                        help="初回ログイン: Edge を起動してユーザーログインを待つ")
    parser.add_argument("--check-login", action="store_true",
                        help="ログイン引き継ぎ確認")
    parser.add_argument("--list-chats", action="store_true",
                        help="会話一覧を表示")
    parser.add_argument("--list-projects", action="store_true",
                        help="Projects 一覧を表示")
    parser.add_argument("--chat", type=str,
                        help="会話を取得 (uuid または名前部分一致) → markdown 保存")
    parser.add_argument("--project", type=str,
                        help="Project を取得 (uuid または名前部分一致) → markdown 保存 "
                             "(概要 + 属する会話の一覧インデックス付き)")
    parser.add_argument("--project-chats", type=str,
                        help="指定 Project に属する会話を一括取得 → "
                             "project_<名前>_<uuid>/ サブフォルダに会話ごと md 保存")
    parser.add_argument("--output", type=Path,
                        help="出力 markdown パス (省略時は claude-ai-export/ に自動命名)")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_EXPORT_DIR,
                        help=f"自動命名時の出力ディレクトリ (デフォルト {DEFAULT_EXPORT_DIR})")
    parser.add_argument("--limit", type=int, default=LIST_LIMIT_DEFAULT,
                        help=f"一覧表示の最大件数 (デフォルト {LIST_LIMIT_DEFAULT})")
    parser.add_argument("--headless", action="store_true",
                        help="ヘッドレスで起動 (既定は headed。Cloudflare で弾かれたら headed に戻す)")
    args = parser.parse_args()

    # 排他チェック (1 アクションのみ)
    actions = [args.setup, args.check_login, args.list_chats, args.list_projects,
               bool(args.chat), bool(args.project), bool(args.project_chats)]
    if sum(1 for a in actions if a) != 1:
        parser.error("ちょうど 1 つのアクションを指定してください "
                     "(--setup / --check-login / --list-chats / --list-projects / "
                     "--chat / --project / --project-chats)")

    if args.setup:
        return cmd_setup()
    if args.check_login:
        return cmd_check_login(args.headless)
    if args.list_chats:
        return cmd_list("chats", args.limit, args.headless)
    if args.list_projects:
        return cmd_list("projects", args.limit, args.headless)
    if args.chat:
        return cmd_fetch_chat(args.chat, args.output, args.output_dir, args.headless)
    if args.project:
        return cmd_fetch_project(args.project, args.output, args.output_dir, args.headless)
    if args.project_chats:
        return cmd_fetch_project_chats(args.project_chats, args.output_dir, args.headless, args.limit)
    return 6


if __name__ == "__main__":
    sys.exit(main())
