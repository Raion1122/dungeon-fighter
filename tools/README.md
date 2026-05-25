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
| `--check-login` | ログイン引き継ぎ確認のみ (DALL-E 枠消費なし) | (off) |
| `--prompt-file <path>` | 単発: プロンプトファイルパス | — |
| `--prompt-string <text>` | 単発: プロンプト文字列 | — |
| `--prompt-batch <path>` | バッチ: JSONL ファイル。同じチャット内で連投 | — |
| `--output <path>` | 単発: 出力 PNG パス (バッチ時は jsonl 内で指定) | 単発で必須 |
| `--timeout <sec>` | 生成タイムアウト秒数 (バッチでは項目ごと) | 180 |
| `--retries <n>` | 単発: 生成失敗時の再試行回数 | 1 |

### バッチモード (`--prompt-batch`)

**同じキャラの walk + attack** のような「会話コンテキスト共有が欲しい」セットは、
JSONL バッチで連投する。1 起動で 1 つの新規チャットを開き、各項目を続けて投下するため、
ChatGPT 会話側の画風・キャラ記憶を引き継いでスプライト統一感を保てる。

**運用方針**: 同じキャラ内なら 1 チャット、キャラを変える時は別の jsonl で別チャットを開く。

**手動運用準拠の 2 段階フロー (2026-05-25 確立)**: 共通仕様テンプレを 1 ターン目で
「画像生成なしで把握」してもらい、2 ターン目以降で「○○の右歩き 6 コマ」のような
極短い指示で生成する。これで DALL-E が「テンプレを画像化」してしまう事故
(モデルシート化、人間剣士事故)を回避できる。`expect_image: false` フィールドで
画像生成ターンとテキスト把握ターンを使い分ける。

例: `tools/sprite_batches/lizardChieftain.jsonl` (テンプレ把握 + walk + attack の 3 行)

```jsonl
# 族長 — 1 チャットで「テンプレ把握 → walk → attack」を連投。
{"prompt_file": "tools/sprite_batches/_TEMPLATE_common_spec.txt", "expect_image": false}
{"prompt_file": "source_images/enemy_lizardChieftain/_prompt_walk.txt",   "output": "source_images/enemy_lizardChieftain/族長歩き.png"}
{"prompt_file": "source_images/enemy_lizardChieftain/_prompt_attack.txt", "output": "source_images/enemy_lizardChieftain/族長攻撃.png"}
```

実行:

```powershell
py tools/chatgpt_generate.py --prompt-batch tools/sprite_batches/lizardChieftain.jsonl --timeout 240
```

JSONL 仕様:

- 1 行 = 1 項目、`{"prompt_file": "<UTF-8テキストファイル相対パス>", "output": "<出力PNG相対パス>", "expect_image": <bool>}`
- `expect_image`: 省略時 `true`。`false` の場合は画像生成を待たず、テキスト応答が
  返ってきたら次の項目に進む(テンプレ把握ターン用)。`false` の時は `output` 省略可。
- `#` で始まる行・空行はコメント扱いでスキップ
- パスは **CWD からの相対** (ユーザーがプロジェクトルートで実行する前提)

エラーハンドリング:

- 致命的失敗(login_expired / rate_limit / captcha) → 即中断し、残り項目を `[skipped]` でログ出力
- 部分失敗(gen_error / timeout / その他) → 該当項目だけスキップして次へ、最終 exit code は `3`

### Exit code

| code | 意味 | 対処 |
| ---: | --- | --- |
| 0 | 成功 (全項目) | — |
| 1 | ログイン期限切れ | `--setup` を再実行 |
| 2 | レート制限 | ChatGPT 無料枠の DALL-E 日次上限。翌日まで待つ |
| 3 | 生成失敗(単発リトライ済 / バッチで部分失敗あり) | プロンプト見直し、ログで失敗項目を確認 |
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
