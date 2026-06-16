"""claude.ai 内部 JSON API の実レスポンス形を確認する discovery ヘルパー。

ログイン済みの専用 Edge プロファイル (claude_ai_fetch.py --setup で作成) を使い、
claude.ai のページコンテキスト内で fetch() を実行して内部 API の生 JSON を表示する。
エンドポイントの URL / フィールド名が想定とずれていないかを確定するために使う。

claude_ai_fetch.py 本体を書く/直す前、または API 仕様変更が疑われる時に実行する:

    py tools/_claude_ai_inspect.py

非公式 API を叩くだけで、何も保存・変更しない (read-only)。
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright  # type: ignore
except ImportError:
    sys.stderr.write(
        "ERROR: Playwright is not installed.\n"
        "  pip install playwright\n"
        "  playwright install msedge\n"
    )
    sys.exit(6)

# Windows のロケール依存出力で日本語が化けないよう UTF-8 を強制
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

PROFILE_DIR = Path.home() / ".claude" / "claude-ai-automation" / "edge-profile"
CLAUDE_URL = "https://claude.ai/"


def find_msedge() -> Path:
    for env_key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.environ.get(env_key)
        if base:
            p = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if p.exists():
                return p
    raise RuntimeError("msedge.exe not found")


def api_get(page, path: str):
    """claude.ai ページ内 fetch で path (例 '/api/organizations') を叩いて返す。

    返り値: dict {ok, status, url, body(str)}
    """
    return page.evaluate(
        """
        async (path) => {
            const r = await fetch(path, {
                credentials: "include",
                headers: { "accept": "application/json" },
            });
            const body = await r.text();
            return { ok: r.ok, status: r.status, url: r.url, body };
        }
        """,
        path,
    )


def show(label: str, path: str, page) -> object:
    print("\n" + "=" * 70)
    print(f"GET {path}   # {label}")
    print("-" * 70)
    res = api_get(page, path)
    print(f"  status={res['status']}  ok={res['ok']}  url={res['url']}")
    body = res["body"] or ""
    try:
        parsed = json.loads(body)
    except Exception:
        print("  (non-JSON body, first 500 chars:)")
        print("  " + body[:500].replace("\n", "\n  "))
        return None
    # 整形して先頭だけ表示 (巨大配列は最初の 2 要素のキーだけ)
    if isinstance(parsed, list):
        print(f"  -> list of {len(parsed)} item(s)")
        for i, item in enumerate(parsed[:2]):
            if isinstance(item, dict):
                print(f"     [{i}] keys: {sorted(item.keys())}")
                for k in ("uuid", "name", "file_name", "summary", "updated_at", "created_at", "capabilities"):
                    if k in item:
                        v = item[k]
                        vs = json.dumps(v, ensure_ascii=False)
                        print(f"         {k}: {vs[:120]}")
            else:
                print(f"     [{i}] {repr(item)[:120]}")
    elif isinstance(parsed, dict):
        print(f"  -> dict keys: {sorted(parsed.keys())}")
        for k in ("uuid", "name", "description", "prompt_template", "settings"):
            if k in parsed:
                vs = json.dumps(parsed[k], ensure_ascii=False)
                print(f"     {k}: {vs[:200]}")
        if "chat_messages" in parsed:
            msgs = parsed["chat_messages"]
            print(f"     chat_messages: {len(msgs)} message(s)")
            if msgs:
                print(f"       msg[0] keys: {sorted(msgs[0].keys())}")
                for k in ("sender", "text", "created_at"):
                    if k in msgs[0]:
                        vs = json.dumps(msgs[0][k], ensure_ascii=False)
                        print(f"         {k}: {vs[:160]}")
                if "content" in msgs[0]:
                    blocks = msgs[0]["content"]
                    if isinstance(blocks, list) and blocks:
                        print(f"         content[0] keys: {sorted(blocks[0].keys())}")
    return parsed


def probe_raw(page, org_uuid: str, conv_uuid: str) -> None:
    """会話を rendering_mode=raw で取得し、各メッセージの content ブロック構造をダンプ。

    アーティファクト(企画書等)が tool_use ブロックのどのフィールドに入るかを確認する。
    """
    print("\n" + "=" * 70)
    print(f"RAW probe: conversation {conv_uuid}")
    print("-" * 70)
    res = api_get(
        page,
        f"/api/organizations/{org_uuid}/chat_conversations/{conv_uuid}"
        "?tree=True&rendering_mode=raw",
    )
    print(f"  status={res['status']} ok={res['ok']}")
    try:
        conv = json.loads(res["body"] or "")
    except Exception:
        print("  non-JSON:", (res["body"] or "")[:400])
        return
    # 生 JSON を %TEMP% にダンプして全文を別途精査できるようにする (調査用)
    try:
        dump_path = Path(os.environ.get("TEMP", ".")) / f"cai_raw_{conv_uuid[:8]}.json"
        dump_path.write_text(res["body"] or "", encoding="utf-8")
        print(f"  raw JSON dumped: {dump_path}")
    except Exception as e:
        print(f"  (raw dump failed: {e})")
    print(f"  top-level keys: {sorted(conv.keys())}")
    msgs = conv.get("chat_messages", [])
    print(f"  messages: {len(msgs)}")
    first_assistant_dumped = False
    for mi, m in enumerate(msgs):
        blocks = m.get("content") or []
        types = [b.get("type") for b in blocks if isinstance(b, dict)]
        txt = m.get("text") or ""
        extra = []
        for k in ("attachments", "files", "sync_sources"):
            v = m.get(k)
            if v:
                extra.append(f"{k}={len(v)}")
        print(f"  msg[{mi}] sender={m.get('sender')} keys={sorted(m.keys())}")
        print(f"        text_len={len(txt)} blocks={types} {' '.join(extra)}")
        # 最初の assistant メッセージは生 JSON を抜粋ダンプして構造を露出
        if m.get("sender") == "assistant" and not first_assistant_dumped:
            first_assistant_dumped = True
            dump = json.dumps(m, ensure_ascii=False, indent=1)
            print("    --- first assistant msg raw (first 2500 chars) ---")
            print("    " + dump[:2500].replace("\n", "\n    "))
            print("    --- end ---")


def probe_capture(page, conv_uuid: str) -> None:
    """Web アプリ自身の conversation 取得リクエスト/応答を傍受する。

    chat ページに遷移すると Web アプリが chat_conversations API を叩く。その応答は
    アーティファクト本体まで含む(Web アプリは対応ブロックを宣言しているため)。
    どんなリクエストヘッダ/クエリで叩いているか、応答に本体が入るかを確認する。
    機微なヘッダ(cookie/authorization)は値を伏字にする。
    """
    print("\n" + "=" * 70)
    print(f"CAPTURE probe: navigate to /chat/{conv_uuid} and intercept its API call")
    print("-" * 70)
    hits = []

    def on_resp(resp):
        try:
            u = resp.url
        except Exception:
            return
        if "/chat_conversations/" + conv_uuid in u:
            entry = {"url": u, "status": resp.status}
            try:
                entry["req_headers"] = dict(resp.request.headers)
            except Exception:
                entry["req_headers"] = {}
            try:
                entry["body"] = resp.text()
            except Exception as e:
                entry["body_err"] = str(e)
            hits.append(entry)

    page.on("response", on_resp)
    try:
        page.goto("https://claude.ai/chat/" + conv_uuid,
                  wait_until="networkidle", timeout=60_000)
    except Exception as e:
        print(f"  goto warn: {e}")
    time.sleep(6)

    if not hits:
        print("  (no chat_conversations request captured — Web app may use a different path)")
        return
    safe = {"accept", "content-type", "anthropic-client-platform",
            "anthropic-client-version", "anthropic-client-sha", "anthropic-anonymous-id"}
    for hi, h in enumerate(hits):
        print(f"  [{hi}] status={h['status']} url={h['url']}")
        rh = h.get("req_headers", {})
        print("       request headers (sensitive values redacted):")
        for k in sorted(rh.keys()):
            kl = k.lower()
            if kl in ("cookie", "authorization"):
                print(f"         {k}: <redacted, present len={len(rh[k])}>")
            elif kl.startswith("anthropic") or kl in safe:
                print(f"         {k}: {rh[k][:120]}")
        body = h.get("body", "")
        if body:
            dump = Path(os.environ.get("TEMP", ".")) / f"cai_capture_{conv_uuid[:8]}.json"
            try:
                dump.write_text(body, encoding="utf-8")
                print(f"       body dumped: {dump}  (len={len(body)})")
            except Exception as e:
                print(f"       body dump failed: {e}")
        elif "body_err" in h:
            print(f"       body read error: {h['body_err']}")


def main() -> int:
    # 引数: <conv_uuid> [capture]
    #   py _claude_ai_inspect.py <conv_uuid>          → 自前 fetch を raw でプローブ
    #   py _claude_ai_inspect.py <conv_uuid> capture  → Web アプリの API 応答を傍受
    conv_arg = sys.argv[1] if len(sys.argv) > 1 else None
    capture_mode = len(sys.argv) > 2 and sys.argv[2] == "capture"
    if not PROFILE_DIR.exists():
        sys.stderr.write(
            f"Profile not found: {PROFILE_DIR}\n"
            "Run `py tools/claude_ai_fetch.py --setup` first to log in.\n"
        )
        return 1
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
            page.goto(CLAUDE_URL, wait_until="domcontentloaded", timeout=30_000)
            try:
                page.wait_for_load_state("networkidle", timeout=30_000)
            except Exception:
                pass
            time.sleep(3)

            if "/login" in page.url:
                sys.stderr.write(f"Not logged in (redirected to {page.url}). Run --setup.\n")
                return 1

            orgs = show("organizations", "/api/organizations", page)
            if not isinstance(orgs, list) or not orgs:
                sys.stderr.write("Could not list organizations. Session may be invalid.\n")
                return 1
            # chat capability のある org を優先、無ければ先頭
            org = None
            for o in orgs:
                caps = o.get("capabilities") or []
                if "chat" in caps:
                    org = o
                    break
            org = org or orgs[0]
            org_uuid = org.get("uuid")
            print(f"\n[selected org] {org.get('name')!r}  uuid={org_uuid}")

            # 会話 uuid 引数ありなら該当プローブだけ実行して終了
            if conv_arg:
                if capture_mode:
                    probe_capture(page, conv_arg)
                else:
                    probe_raw(page, org_uuid, conv_arg)
                return 0

            convs = show("chat_conversations (list)",
                         f"/api/organizations/{org_uuid}/chat_conversations", page)
            if isinstance(convs, list) and convs:
                cid = convs[0].get("uuid")
                show("chat_conversation (detail)",
                     f"/api/organizations/{org_uuid}/chat_conversations/{cid}"
                     "?tree=True&rendering_mode=messages", page)

            projs = show("projects (list)",
                         f"/api/organizations/{org_uuid}/projects", page)
            if isinstance(projs, list) and projs:
                pid = projs[0].get("uuid")
                show("project (detail)",
                     f"/api/organizations/{org_uuid}/projects/{pid}", page)
                show("project docs",
                     f"/api/organizations/{org_uuid}/projects/{pid}/docs", page)

            print("\n" + "=" * 70)
            print("Discovery done. Compare the keys above with claude_ai_fetch.py.")
            return 0
        finally:
            ctx.close()


if __name__ == "__main__":
    sys.exit(main())
