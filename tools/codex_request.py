#!/usr/bin/env python3
r"""codex1 への依頼文を Codex CLI (codex exec) へ自動投下するスクリプト。

Claude が起草した依頼文 md (`codex1/requests/YYYY-MM-DD_<slug>.md`) の前に
定型ヘッダ (納品先 / 命名規則 / 納品前チェック) を差し込み、`codex exec` の
**stdin** へ流して実行する。ユーザーが Codex の UI へ手で貼り付ける手間を無くすのが目的。

使用例:
  依頼文をそのまま投下:
    py tools/codex_request.py --request "C:\Users\PC_User\Desktop\codex1\requests\2026-08-05_servant-npc.md"

  何を送るかだけ確認する (何も実行しない):
    py tools/codex_request.py --request <md> --dry-run

  短い指示を直接渡す (疎通確認など):
    py tools/codex_request.py --prompt-string "Reply with only the word OK." --sandbox read-only

安全側の既定 (意図的にこうしてある):
  - 作業根は常に codex1 (`-C`)。ダンジョンファイターズ本体は `--add-dir` に足さない
    = Codex から本体リポジトリへ書かせない。
  - `--sandbox` の選択肢は read-only / workspace-write のみ。
    `danger-full-access` と `--dangerously-bypass-approvals-and-sandbox` は
    **このスクリプトからは指定できない** (フラグごと持たせていない)。

Exit codes:
  0 = 成功
  1 = codex CLI が見つからない / 未ログイン
  3 = タスク失敗 (codex が非 0 で終了)
  4 = タイムアウト
  6 = その他エラー
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import List, Optional, Tuple

# cp932 コンソールでも記号入りの文字列を出せるよう UTF-8 化。
# ⚠ これが無いと `⚠`(U+26A0) や `—`(U+2014) を含むログ 1 行で UnicodeEncodeError が上がり、
#   **その項目が丸ごと死ぬ**。ここで受けるのに加え、ログファイル側も encoding="utf-8" を
#   明示すること (既定は locale = cp932 なので指定漏れが即事故になる)。
#   出典: tools/chatgpt_generate.py の同じ注記。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# === 設定 ============================================================

CODEX1_ROOT   = Path.home() / "Desktop" / "codex1"
REQUESTS_DIR  = CODEX1_ROOT / "requests"
ASSETS_DIR    = CODEX1_ROOT / "assets"
RUNS_DIR      = REQUESTS_DIR / "_runs"
CODEX_HOME    = Path.home() / ".codex"
AUTH_JSON     = CODEX_HOME / "auth.json"

DEFAULT_TIMEOUT_S = 1800
DEFAULT_SANDBOX   = "workspace-write"
SANDBOX_CHOICES   = ["read-only", "workspace-write"]  # danger-full-access は意図的に除外


# === ユーティリティ ===================================================

_LOG_LINES: List[str] = []


def log_info(msg: str) -> None:
    line = f"[codex-req] {msg}"
    _LOG_LINES.append(line)
    print(line, flush=True)


def log_err(msg: str) -> None:
    line = f"[codex-req] ERROR: {msg}"
    _LOG_LINES.append(line)
    sys.stderr.write(line + "\n")
    sys.stderr.flush()


# ⚠ `codex exec --color never` が消せるのは **codex 自身**の装飾だけ。
#   codex が起動した子プロセス (pwsh 等) が吐くエスケープはそのまま素通りしてくる。
#   2026-08-15 の実投下では PowerShell のエラー表示が `ESC[31;1m` 塗れで届き、
#   コンソールも `_runs/*.log` も **sed で落とさないと読めない**状態になった。
#   → 表示・保存の直前で SGR だけ剥がす (情報量ゼロの装飾なので落として安全)。
_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def strip_ansi(msg: str) -> str:
    return _ANSI_RE.sub("", msg)


def log_raw(msg: str) -> None:
    """codex の出力をそのまま流す (プレフィクス無し)。"""
    msg = strip_ansi(msg)
    _LOG_LINES.append(msg)
    print(msg, flush=True)


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def slugify(text: str) -> str:
    s = re.sub(r"[^0-9A-Za-z_.-]+", "-", text).strip("-")
    return (s or "run")[:60]


def write_log(slug: str, ts: str) -> Optional[Path]:
    """収集したログを requests/_runs/<ts>_<slug>.log へ UTF-8 で保存。"""
    try:
        ensure_dir(RUNS_DIR)
        path = RUNS_DIR / f"{ts}_{slug}.log"
        # ⚠ encoding="utf-8" は必須。省くと cp932 で日本語ヘッダの時点で落ちる。
        path.write_text("\n".join(_LOG_LINES) + "\n", encoding="utf-8", errors="replace")
        return path
    except Exception as e:
        sys.stderr.write(f"[codex-req] ERROR: failed to write run log: {e}\n")
        return None


# === codex.exe の解決 =================================================

def _codex_search_tiers() -> List[Tuple[str, str]]:
    """(ラベル, glob パターン) の探索順。

    ⚠ ハッシュ付きディレクトリ (`bin/8e8bf206e63ac436/`) や拡張のバージョン番号は
      アプリ更新のたびに変わる。**絶対に固定書きせず glob で解決する**こと。
    """
    tiers: List[Tuple[str, str]] = []
    localappdata = os.environ.get("LOCALAPPDATA")
    if localappdata:
        tiers.append((
            "Codex app (CODEX_CLI_PATH)",
            str(Path(localappdata) / "OpenAI" / "Codex" / "bin" / "*" / "codex.exe"),
        ))
    tiers.append((
        "VS Code extension",
        str(Path.home() / ".vscode" / "extensions" / "openai.chatgpt-*"
            / "bin" / "windows-x86_64" / "codex.exe"),
    ))
    tiers.append((
        "Microsoft Store package",
        r"C:\Program Files\WindowsApps\OpenAI.Codex_*\app\resources\codex.exe",
    ))
    return tiers


def find_codex() -> Tuple[Optional[Path], List[str]]:
    """codex.exe を探す。戻り: (見つかったパス or None, 探した場所の説明リスト)。

    優先順は _codex_search_tiers() の順 (先頭 = `~/.codex/config.toml` の
    `CODEX_CLI_PATH` が指す本命)。**同じ tier 内で複数当たったら更新日時が最も新しいもの**
    を採る (拡張が複数バージョン同居している / bin 配下に旧ハッシュが残っている場合)。
    """
    searched: List[str] = []
    for label, pattern in _codex_search_tiers():
        hits = [Path(p) for p in glob.glob(pattern)]
        hits = [p for p in hits if p.is_file()]
        searched.append(f"{label}: {pattern}  -> {len(hits)} hit(s)")
        if not hits:
            continue
        hits.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for p in hits:
            mt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime))
            searched.append(f"    {p}  (mtime {mt})")
        return hits[0], searched

    which = shutil.which("codex")
    searched.append(f"PATH (shutil.which): -> {which or 'not found'}")
    if which:
        return Path(which), searched
    return None, searched


def report_codex_missing(searched: List[str]) -> None:
    log_err("codex.exe not found. Searched:")
    for s in searched:
        log_err(f"  {s}")
    log_err("How to fix:")
    log_err("  - Install the Codex desktop app (it places codex.exe under "
            "%LOCALAPPDATA%\\OpenAI\\Codex\\bin\\<hash>\\), or")
    log_err("  - Install the VS Code extension 'openai.chatgpt' (bundles "
            "bin\\windows-x86_64\\codex.exe), or")
    log_err("  - Put codex.exe on PATH.")


# === プロンプト組み立て ===============================================

def build_header(request_label: str) -> str:
    """依頼文の前に差し込む定型ヘッダ。

    根拠: `codex1/requests/README.md` の「書き方の指針」および「命名規則」。
    依頼文ごとに書き忘れが起きる項目 (納品先 / 命名 / md5 重複チェック / 本体へ書かない)
    を毎回強制する。
    """
    df_root = Path.home() / "Desktop" / "ダンジョンファイターズ"
    return f"""# 自動投下ヘッダ (ダンジョンファイターズ側 tools/codex_request.py が付与)

あなたは **codex1** リポジトリ (作業根: `{CODEX1_ROOT}`) で作業しています。
下に「ダンジョンファイターズ」から届いた依頼文を貼ります。依頼文の指示に従って作業してください。
このヘッダのルールは依頼文より**優先**します。

## 1. 納品先と書き込み範囲

- 生成物はすべて `{ASSETS_DIR}` の配下に置く。
- **`{CODEX1_ROOT}` の外へは一切書き込まない。**
  特にダンジョンファイターズ本体リポジトリ (`{df_root}`) は
  **読むことも書くことも不要**です。
- 依頼文に「受け取り側の取り込み手順」(台帳 `tools/codex1_sprites.json` の更新、
  `index.html` の差し替え、`pack_codex1_player.py` の実行など) が書かれていても、
  それは**受け取り側の作業なので実行しない**。納品はアセットを置くところまで。

## 2. スプライトの命名規則 (既存規約)

依頼文に別の指定があればそちらを優先。無ければこの形:

```
assets/<key>/<key>-<motion>-right-6-v<N>/
    <key>-<motion>-right-safe-frame-01.png … <key>-<motion>-right-safe-frame-06.png
    <key>-<motion>-right-safe-sheet.png
    (-source.png / -transparent.png も既存規約どおり)
```

- `<motion>` は `walk` / `attack` など。**右向き 6 コマのみ**
  (左向きは受け取り側で `scaleX = -1` して使うので不要)。
- walk と attack を同居させた整列フォルダ
  (`<key>-walk-attack-right-6-v<N>-aligned/`) も出す場合、
  **6 コマだけの単独フォルダを必ず別に残す**
  (受け取り側の `validate_sprite_outputs.py` は合計コマ数しか見ないため、
  12 コマ同居のフォルダしか無いと誤判定する)。
- 依頼文とその参考画像の命名は `requests/README.md` の
  `YYYY-MM-DD_<slug>.md` / `YYYY-MM-DD_<slug>-*.png` 規約に従う。

## 3. 依頼文の読み方 — `requests/README.md` の「書き方の指針」

同フォルダの `requests/README.md` に、過去の手戻り原因から作った
**「書き方の指針」**(4 項目) があります。依頼文はその形式で書かれているので、
次の指定を**推測で緩めないでください**:

1. **維持するもの**と**変えるもの**の区別
   (「同一個体・同一パレット・同一接地線」)
2. **素材座標系で書かれた数値目標**と、添えられた**検算コード**
   (「小さくして」等の定性表現ではなく実測値で指定されています)
3. **やってはいけない逃げ道**(「⛔」で先に潰してある項目)
4. **納品前チェック**(次節)

判断に迷う点があれば勝手に決めず、最終メッセージへ「決めきれなかった点」として書いてください。

## 4. 納品前チェック (必須・省略不可)

- ⚠️ **フレームの md5 がすべて異なること。**
  過去に **frame-04 を frame-03 のバイトコピーで埋めた納品**があり、
  受け取り側の整合チェックツール (`check_pose_alignment.py`) は
  **これを検知できませんでした**(重複コマは素通りします)。
  納品フォルダごとに `md5sum <dir>/*frame-*.png` 相当を実行し、
  **6 個のハッシュが全部違うこと**を確認して、その出力を最終メッセージに貼ってください。
- 依頼文に検算コードが添えられている場合は**それを実行**し、実測値を最終メッセージに貼る。
- 依頼文に個別の「納品前チェック」章がある場合はそれも全部実施する。

## 5. 最終メッセージに必ず含めるもの

1. 作成 / 更新したファイルの**絶対パス**一覧
2. 上記チェックの**実測値**(md5 一覧・検算コードの出力)
3. 依頼のうち**やらなかったこと**とその理由

---

# ここから依頼文: {request_label}

"""


def build_prompt(header: str, body: str) -> str:
    return header + body.rstrip() + "\n"


# === argv 組み立て ====================================================

def build_argv(
    codex: Path,
    workdir: Path,
    sandbox: str,
    last_message_file: Path,
    model: Optional[str],
) -> List[str]:
    """`codex exec` の argv を組み立てる。プロンプトは `-` で stdin から読ませる。

    ⚠ `--add-dir` は付けない = 書き込み可能なのは作業根 (codex1) だけ。
    ⚠ `--dangerously-*` 系は一切付けない (このスクリプトには選択肢が無い)。
    """
    argv = [
        str(codex), "exec",
        "--json",                                  # JSONL を stdout へ
        "--color", "never",                        # ANSI エスケープでログを汚さない
        "-C", str(workdir),
        "-s", sandbox,
        "-o", str(last_message_file),
    ]
    if model:
        argv += ["-m", model]
    if not (workdir / ".git").exists():
        # 作業根が git リポジトリでない場合だけ緩める (codex1 は git 管理下なので通常は付かない)
        argv.append("--skip-git-repo-check")
    argv.append("-")                               # PROMPT を stdin から読む
    return argv


# === JSONL イベントの整形 =============================================

def _short(text: object, limit: int = 400) -> str:
    s = str(text).replace("\r", "")
    if "\n" not in s:
        s = " ".join(s.split())
    if len(s) > limit:
        return s[:limit] + f" …(+{len(s) - limit} chars)"
    return s


def _describe_item(item: dict, prefix: str) -> str:
    itype = item.get("item_type") or item.get("type") or "(unknown item)"
    if itype in ("command_execution", "local_shell_call", "exec"):
        cmd = item.get("command")
        if isinstance(cmd, list):
            cmd = subprocess.list2cmdline([str(c) for c in cmd])
        rc = item.get("exit_code")
        tail = "" if rc is None else f"  (exit={rc})"
        return f"{prefix} exec: {_short(cmd, 300)}{tail}"
    if itype in ("file_change", "patch_apply", "apply_patch"):
        changes = item.get("changes") or item.get("files") or []
        parts = []
        if isinstance(changes, list):
            for ch in changes:
                if isinstance(ch, dict):
                    parts.append(f"{ch.get('kind') or ch.get('type') or 'change'}:{ch.get('path')}")
                else:
                    parts.append(str(ch))
        elif isinstance(changes, dict):
            for path, ch in changes.items():
                kind = ch.get("type") if isinstance(ch, dict) else "change"
                parts.append(f"{kind}:{path}")
        return f"{prefix} write: " + (", ".join(parts) if parts else _short(changes, 300))
    if itype in ("agent_message", "assistant_message"):
        return f"{prefix} message: {_short(item.get('text') or item.get('message'), 500)}"
    if itype == "reasoning":
        return f"{prefix} reasoning: {_short(item.get('text') or item.get('summary'), 200)}"
    if itype == "todo_list":
        items = item.get("items") or []
        done = sum(1 for t in items if isinstance(t, dict) and t.get("completed"))
        return f"{prefix} todo: {done}/{len(items)} done"
    if itype in ("mcp_tool_call", "tool_call"):
        return f"{prefix} tool: {item.get('server', '')}.{item.get('tool', item.get('name', ''))}"
    if itype == "error":
        return f"{prefix} error: {_short(item.get('message'), 500)}"
    # ⚠ 未知の item も種別と中身の頭を必ず出す (握りつぶさない)
    return f"{prefix} {itype}: {_short(json.dumps(item, ensure_ascii=False), 300)}"


def describe_event(obj: object) -> Optional[str]:
    """JSONL 1 行を人間向けの 1 行へ。未知の型でも**種別だけは必ず返す**。

    codex のイベント schema はバージョンで変わる (旧 `{"msg":{"type":...}}` /
    新 `{"type":"item.completed","item":{...}}` の両方が存在する) ので、
    どちらでも読めるようにしてある。
    """
    if not isinstance(obj, dict):
        return f"[event] non-object: {_short(json.dumps(obj, ensure_ascii=False))}"

    body = obj.get("msg") if isinstance(obj.get("msg"), dict) else obj
    etype = body.get("type") or obj.get("type") or "(no type)"

    # --- 新 schema: item.* ---
    if isinstance(etype, str) and etype.startswith("item."):
        item = body.get("item")
        if isinstance(item, dict):
            phase = etype.split(".", 1)[1]
            if phase in ("started", "updated"):
                itype = item.get("item_type") or item.get("type")
                # started 段階の本文系は中身が空なので落とす (completed 側で出る)
                if itype in ("reasoning", "agent_message", "assistant_message"):
                    return None
                return _describe_item(item, f"[{phase}]")
            return _describe_item(item, "[done]")
        return f"[event] {etype}"

    # --- 旧 schema / トップレベルイベント ---
    if etype in ("exec_command_begin", "exec_command"):
        cmd = body.get("command")
        if isinstance(cmd, list):
            cmd = subprocess.list2cmdline([str(c) for c in cmd])
        return f"[exec] {_short(cmd, 300)}"
    if etype == "exec_command_end":
        return f"[exec] exit={body.get('exit_code')}"
    if etype in ("patch_apply_begin", "turn_diff"):
        changes = body.get("changes") or {}
        if isinstance(changes, dict) and changes:
            return "[write] " + ", ".join(str(k) for k in changes.keys())
        return f"[event] {etype}"
    if etype in ("agent_message", "assistant_message"):
        return f"[message] {_short(body.get('message') or body.get('text'), 500)}"
    if etype in ("agent_reasoning", "agent_reasoning_delta", "agent_message_delta",
                 "agent_reasoning_section_break"):
        return None  # 逐次デルタは冗長なので落とす (完了イベント側で出る)
    if etype in ("token_count", "turn.completed", "usage"):
        usage = body.get("usage") or body.get("info") or {}
        if isinstance(usage, dict) and usage:
            keep = {k: v for k, v in usage.items()
                    if k in ("input_tokens", "output_tokens", "cached_input_tokens",
                             "total_token_usage", "last_token_usage")}
            return f"[usage] {_short(json.dumps(keep, ensure_ascii=False), 200)}" if keep else None
        return None
    if etype in ("task_started", "thread.started", "session_configured", "turn.started"):
        return f"[event] {etype}"
    if etype in ("task_complete", "turn_complete"):
        return "[event] task_complete"
    if etype in ("error", "stream_error"):
        return f"[error] {_short(body.get('message') or body, 500)}"

    return f"[event] {etype}: {_short(json.dumps(body, ensure_ascii=False), 200)}"


# === 実行 =============================================================

_LOGIN_HINTS = ("not logged in", "please log in", "run `codex login`", "codex login",
                "unauthorized", "authentication failed", "401 unauthorized")


def _pump(stream, q: "queue.Queue") -> None:
    try:
        for line in stream:
            q.put(line.rstrip("\r\n"))
    except Exception as e:
        q.put(f"[codex-req] ERROR: stream read failed: {e}")
    finally:
        q.put(None)


def _kill_tree(proc: subprocess.Popen) -> None:
    """孫プロセス (codex が起動したシェル) ごと落とす。

    ⚠ proc.kill() だけだと codex の子シェルが生き残り、出力が後から混ざる。
    """
    try:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True, timeout=20)
    except Exception:
        pass
    try:
        proc.kill()
    except Exception:
        pass


def run_codex(argv: List[str], prompt: str, timeout_s: int,
              last_message_file: Path) -> int:
    """codex exec を起動し、JSONL を逐次パースして進捗を流す。終了コードを返す。"""
    log_info(f"Running: {subprocess.list2cmdline(argv)}")
    log_info(f"Prompt: {len(prompt)} chars via stdin, timeout {timeout_s}s")

    try:
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,   # stderr も同じ行ストリームへ (JSON でない行は raw 表示)
            # ⚠ encoding/errors の明示は必須。既定は locale (cp932) なので、
            #   日本語ヘッダの書き込みや codex 側の記号出力でデコードが落ちる。
            encoding="utf-8",
            errors="replace",
            text=True,
            bufsize=1,
        )
    except Exception as e:
        log_err(f"Failed to launch codex: {e}")
        return 6

    try:
        proc.stdin.write(prompt)
        proc.stdin.close()
    except Exception as e:
        log_err(f"Failed to write prompt to stdin: {e}")
        _kill_tree(proc)
        return 6

    q: "queue.Queue" = queue.Queue()
    threading.Thread(target=_pump, args=(proc.stdout, q), daemon=True).start()

    deadline = time.time() + timeout_s
    saw_login_error = False
    last_heartbeat = time.time()
    timed_out = False

    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            timed_out = True
            break
        try:
            line = q.get(timeout=min(2.0, remaining))
        except queue.Empty:
            now = time.time()
            if now - last_heartbeat > 60:
                log_info(f"Still running... ({int(deadline - now)}s remaining)")
                last_heartbeat = now
            continue
        if line is None:
            break
        last_heartbeat = time.time()

        stripped = line.strip()
        if not stripped:
            continue
        low = stripped.lower()
        if any(h in low for h in _LOGIN_HINTS):
            saw_login_error = True

        if stripped.startswith("{"):
            try:
                obj = json.loads(stripped)
            except json.JSONDecodeError:
                log_raw(f"[raw] {stripped}")
                continue
            desc = describe_event(obj)
            if desc:
                log_raw(desc)
        else:
            # JSONL でない行 (stderr 由来の警告など) は握りつぶさずそのまま出す
            log_raw(f"[raw] {stripped}")

    if timed_out:
        log_err(f"Timeout after {timeout_s}s. Killing the codex process tree.")
        _kill_tree(proc)
        try:
            proc.wait(timeout=15)
        except Exception:
            pass
        return 4

    try:
        rc = proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        log_err("codex did not exit after closing its output. Killing.")
        _kill_tree(proc)
        return 6

    # 最終メッセージ
    if last_message_file.exists():
        try:
            final = last_message_file.read_text(encoding="utf-8", errors="replace").strip()
        except Exception as e:
            final = f"(failed to read: {e})"
        log_info("=" * 60)
        log_info("FINAL MESSAGE:")
        for ln in final.splitlines():
            log_raw(ln)
        log_info("=" * 60)
        log_info(f"Last message saved: {last_message_file}")
    else:
        log_err(f"No last-message file was produced at {last_message_file}")

    if rc == 0:
        log_info("codex exec finished successfully (exit=0).")
        return 0

    log_err(f"codex exec failed (exit={rc}).")
    if saw_login_error:
        log_err("Output mentions authentication. Sign in to Codex (the desktop app or "
                "`codex login`) so that ~/.codex/auth.json is refreshed.")
        return 1
    return 3


# === コマンド =========================================================

def cmd_run(args: argparse.Namespace) -> int:
    # --- プロンプト本文 ---
    if args.request:
        req = Path(args.request)
        if not req.is_file():
            log_err(f"Request file not found: {req}")
            return 6
        try:
            body = req.read_text(encoding="utf-8")
        except Exception as e:
            log_err(f"Failed to read request file '{req}': {e}")
            return 6
        request_label = str(req)
        slug = slugify(req.stem)
    else:
        body = args.prompt_string
        request_label = "(--prompt-string)"
        slug = "prompt-string"

    body = body.strip()
    if not body:
        log_err("Request body is empty.")
        return 6

    workdir = Path(args.cd)
    if not workdir.is_dir():
        log_err(f"Working root does not exist: {workdir}")
        return 6

    prompt = build_prompt(build_header(request_label), body)

    # --- codex.exe 解決 ---
    codex, searched = find_codex()
    if codex is None:
        report_codex_missing(searched)
        return 1
    for s in searched:
        log_info(f"search: {s}")
    log_info(f"codex.exe: {codex}")

    ts = time.strftime("%Y%m%d_%H%M%S")
    last_message_file = RUNS_DIR / f"{ts}_{slug}.last.md"
    argv = build_argv(codex, workdir, args.sandbox, last_message_file, args.model)

    if args.dry_run:
        print("=" * 70, flush=True)
        print("DRY RUN - nothing is executed.", flush=True)
        print("=" * 70, flush=True)
        print("argv:", flush=True)
        for i, a in enumerate(argv):
            print(f"  [{i}] {a}", flush=True)
        print("", flush=True)
        print("command line:", flush=True)
        print("  " + subprocess.list2cmdline(argv), flush=True)
        print("", flush=True)
        print(f"stdin: {len(prompt)} chars (UTF-8)", flush=True)
        print("=" * 70, flush=True)
        print("PROMPT (full):", flush=True)
        print("=" * 70, flush=True)
        print(prompt, flush=True)
        print("=" * 70, flush=True)
        print(f"run log would be:      {RUNS_DIR / (ts + '_' + slug + '.log')}", flush=True)
        print(f"last message would be: {last_message_file}", flush=True)
        return 0

    if not AUTH_JSON.exists():
        log_err(f"Codex auth file not found: {AUTH_JSON}")
        log_err("Sign in to the Codex desktop app (or run `codex login`) first.")
        write_log(slug, ts)
        return 1

    ensure_dir(RUNS_DIR)
    log_info(f"Request: {request_label}")
    log_info(f"Working root (-C): {workdir}")
    log_info(f"Sandbox (-s): {args.sandbox}")
    log_info("Extra writable dirs (--add-dir): none "
             "(the Dungeon Fighters repo is intentionally NOT writable)")

    # ログには「実際に送った全文」を必ず残す (後から何を頼んだか再現できるように)
    _LOG_LINES.append("=" * 70)
    _LOG_LINES.append("PROMPT (full):")
    _LOG_LINES.append("=" * 70)
    _LOG_LINES.append(prompt)
    _LOG_LINES.append("=" * 70)

    started = time.time()
    try:
        rc = run_codex(argv, prompt, args.timeout, last_message_file)
    except KeyboardInterrupt:
        log_err("Interrupted by user.")
        rc = 6
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        rc = 6

    log_info(f"Elapsed: {time.time() - started:.1f}s, exit={rc}")
    path = write_log(slug, ts)
    if path:
        print(f"[codex-req] Run log: {path}", flush=True)
    return rc


# === エントリポイント =================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="codex1 への依頼文を Codex CLI (codex exec) へ自動投下する",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--request", type=str,
                        help="依頼文 md のパス (例: codex1/requests/2026-08-05_servant-npc.md)")
    parser.add_argument("--prompt-string", type=str,
                        help="依頼文の代わりに直接渡す文字列 (--request と排他)")
    parser.add_argument("--dry-run", action="store_true",
                        help="組み立てた argv と送信プロンプト全文を表示して何も実行しない")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S,
                        help=f"タイムアウト秒数 (デフォルト {DEFAULT_TIMEOUT_S})")
    parser.add_argument("--model", type=str, default=None,
                        help="モデル指定 (省略時は ~/.codex/config.toml の設定)")
    parser.add_argument("--sandbox", choices=SANDBOX_CHOICES, default=DEFAULT_SANDBOX,
                        help=f"サンドボックス (デフォルト {DEFAULT_SANDBOX})。"
                             "danger-full-access は意図的に選べない")
    parser.add_argument("--cd", type=str, default=str(CODEX1_ROOT),
                        help=f"Codex の作業根 (デフォルト {CODEX1_ROOT})")
    args = parser.parse_args()

    if bool(args.request) == bool(args.prompt_string):
        parser.error("exactly one of --request / --prompt-string is required")

    return cmd_run(args)


if __name__ == "__main__":
    sys.exit(main())
