# tools/

ChatGPT 画像生成を VSCode / Claude Code から自動化するためのスクリプト群。

## `chatgpt_generate.py`

Playwright で専用 Edge プロファイルを操作し、ChatGPT に対してプロンプト投下 →
画像生成完了待ち → 画像取得 → 指定パスへ保存。

### 初回セットアップ(1 回のみ、ユーザー操作)

PowerShell:

```powershell
# Playwright Python のインストール
pip install playwright

# Edge ドライバの初回インストール
playwright install msedge

# 専用プロファイルで Edge を起動し、ChatGPT に手動ログイン
py tools/chatgpt_generate.py --setup
# → Edge が開く → ChatGPT にログイン (Microsoft アカウント等)
# → テストメッセージで動作確認
# → ターミナルに戻って Enter
```

> **注意**: Playwright が制御するのは「専用プロファイル」の Edge だが、日常使いの Edge
> が起動中だと一部のプロセスを共有する。`--setup` や通常実行を行うときは、可能なら
> 既存の Edge ウィンドウを **すべて閉じてから** 起動するのが安全(タブを失わないよう、
> 「閉じる前にタブの復元」設定の確認推奨)。

セッションは `~/.claude/chatgpt-automation/edge-profile/` に保存され、
以後は自動でログイン状態が維持される(期限切れまで通常 30 日以上)。

### 通常実行

プロンプト文字列を直接指定:

```powershell
py tools/chatgpt_generate.py `
  --prompt-string "a red apple, top-down, painterly" `
  --output assets/test.png
```

プロンプトファイルを指定(長文向き):

```powershell
py tools/chatgpt_generate.py `
  --prompt-file prompts/sce4_room0.txt `
  --output assets/room_orc-fort_0.png `
  --timeout 200
```

### 主要オプション

| オプション | 役割 | デフォルト |
| --- | --- | --- |
| `--setup` | 初回ログイン用 | (off) |
| `--prompt-file <path>` | プロンプトファイルパス | — |
| `--prompt-string <text>` | プロンプト文字列 | — |
| `--output <path>` | 出力 PNG パス | (必須) |
| `--timeout <sec>` | 生成タイムアウト秒数 | 180 |
| `--retries <n>` | 生成失敗時の再試行回数 | 1 |

### Exit code

| code | 意味 | 対処 |
| ---: | --- | --- |
| 0 | 成功 | — |
| 1 | ログイン期限切れ | `--setup` を再実行 |
| 2 | レート制限 | ChatGPT 無料枠の DALL-E 日次上限。翌日まで待つ |
| 3 | 生成失敗(リトライ済) | プロンプト見直し |
| 4 | タイムアウト | `--timeout` を伸ばす、または手動継続 |
| 5 | CAPTCHA 検出 | 表示された Edge ウィンドウで手動解決 |
| 6 | その他(セレクタ変更等) | デバッグスクショ確認、セレクタ更新 |

エラー時のスクリーンショットは `~/.claude/chatgpt-automation/debug/<timestamp>_<tag>.png` に保存される。

### セレクタが壊れたとき

ChatGPT の UI が更新されると、入力欄や送信ボタンの DOM 構造が変わって動かなくなる場合がある。
その場合は `chatgpt_generate.py` 冒頭の `SELECTORS` 辞書を更新する。

更新手順:

1. `py tools/chatgpt_generate.py --setup` で Edge を開く(必要なら再ログイン)
2. ChatGPT 画面上で F12 → 入力欄や送信ボタンを inspect
3. CSS セレクタを取得して `SELECTORS["prompt_input"]` 等を更新
4. 短いプロンプトでテスト

### デバッグ用補助ツール

- **`tools/_debug_inspect.py`**: 最新チャット履歴を Playwright で開き、ページ内の全 `<img>`
  要素の `src` / サイズ / alt をダンプ。画像 URL パターンが変わった時(`SELECTORS["generated_image"]`
  の更新が必要な時)に使う。`py tools/_debug_inspect.py` で実行。
- **`tools/_check_cookies.py`**: 専用プロファイルの Cookies DB を SQLite で開いて
  ChatGPT/OpenAI/Auth0 ドメインの Cookie 一覧を表示(暗号値は表示しない)。ログインが正しく
  保存されてるかの調査に使う。`py tools/_check_cookies.py` で実行。
- **`tools/chatgpt_generate.py --check-login`**: 画像生成せずログイン引き継ぎだけ検証
  (DALL-E 無料枠を消費しない)。

### ChatGPT 無料枠の制限

DALL-E 3 生成は 1 日 3-5 枚程度に制限される(時期により変動)。
本スクリプトはレート制限を即検知して exit 2 で停止するため、
無駄に試行を繰り返さない設計。

大量生成が必要な場合は数日に分けて実行するか、ChatGPT Plus を検討。

### Claude (会話 AI) からの呼び出し

CLAUDE.md の「ChatGPT 画像生成の自動化フロー」セクション参照。
Claude がプロンプトを起草 → ユーザー承認 → Claude が Bash で本スクリプトを実行 →
保存後 Claude が `Read` ツールで画像確認、という流れ。
