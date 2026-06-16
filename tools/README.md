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

---

## `claude_ai_fetch.py` — claude.ai のチャット/Projects を取得

claude.ai 側で進めている企画・指示書(チャットや Projects)を、この Claude Code から
**直接見に行ってチェック**するためのツール。`chatgpt_generate.py` と同じ「専用 Edge
プロファイル + Playwright」方式で claude.ai にログイン済みブラウザを開き、claude.ai の
**内部 JSON API** をページ内 `fetch()`(`credentials: include`)で叩いて取得 → markdown
で `claude-ai-export/` に保存する。CORS / Cloudflare は実ブラウザ内 fetch なので回避できる。

> **claude.ai のチャット/Projects を読む公式 API は存在しない**(Anthropic API と
> claude.ai は別物)。これは自分のアカウントの自分のコンテンツを読む個人利用ツール。
> 内部 API は **非公式**なので、UI/API 仕様変更で動かなくなったら下記の inspect ヘルパーで
> 実レスポンス形を確認して本ファイルを更新する。

### 初回セットアップ(1 回のみ、ユーザー操作)

```powershell
# Playwright は chatgpt_generate.py と共用 (未導入なら pip install playwright && playwright install msedge)

# 専用プロファイルで Edge を起動し、claude.ai に手動ログイン
py tools/claude_ai_fetch.py --setup
# → Edge が開く → claude.ai にログイン → チャット一覧が見えたら Edge を閉じる
```

セッションは `~/.claude/claude-ai-automation/edge-profile/`(ChatGPT 用とは**別**)に保存される。

### 使い方

```powershell
py tools/claude_ai_fetch.py --check-login              # ログイン確認

py tools/claude_ai_fetch.py --list-projects           # Projects 一覧 (name + uuid)
py tools/claude_ai_fetch.py --list-chats              # 会話一覧 (新しい順)

# 個別取得 (名前部分一致 or uuid)。claude-ai-export/ に自動命名 md を保存
py tools/claude_ai_fetch.py --project "ダンジョン"   # 概要 + 属する会話の一覧 index
py tools/claude_ai_fetch.py --chat "戦闘バランス"

# 指定 Project に属する会話を「一括」取得 (会話本体を全部 md 化)
py tools/claude_ai_fetch.py --project-chats "ダンジョン"
#   → claude-ai-export/project_<名前>_<uuid8>/ に _project.md + chat_*.md 群

# 出力先を明示
py tools/claude_ai_fetch.py --chat <uuid> --output claude-ai-export/my_chat.md
```

`--project` は概要 + ナレッジ文書 + **そのProjectに属する会話の一覧(index)** を 1 ファイルに、
`--project-chats` はさらに **各会話の本体まで一括ダウンロード** する(件数は `--limit` で上限)。
会話と Project の紐付けは会話側の `project_uuid` フィールドで判定する。

会話取得では、Claude が会話中に作成した **アーティファクト(企画書などのファイル)本体** も
取り込む。内部的に `render_all_tools=true` で取得し(これが無いと本体が
「This block is not supported on your current device yet」のプレースホルダに化ける)、
`create_file` / `str_replace`(レガシー `artifacts` ツールも)を**最終状態に再構成**して、
各会話 md 末尾の「📎 成果物ファイル」セクションに出力する。thinking(内部推論)は省略する。

名前は **部分一致 → uuid 解決**(曖昧なら候補一覧を出して中断するので uuid で再指定)。

### オプション

| オプション | 役割 | デフォルト |
| --- | --- | --- |
| `--setup` | 初回ログイン用 | (off) |
| `--check-login` | ログイン引き継ぎ確認 | (off) |
| `--list-chats` / `--list-projects` | 一覧表示 | — |
| `--chat <uuid\|名前>` / `--project <uuid\|名前>` | 個別取得 → md 保存 | — |
| `--project-chats <uuid\|名前>` | 指定 Project の会話を一括取得 → サブフォルダに md 群 | — |
| `--output <path>` | 出力 md パス | 自動命名 |
| `--output-dir <dir>` | 自動命名時の保存先 | `claude-ai-export/` |
| `--limit <n>` | 一覧の最大件数 | 50 |
| `--headless` | ヘッドレス起動(Cloudflare で弾かれたら headed に戻す) | (off=headed) |

> アクションはちょうど 1 つだけ指定する(複数同時は不可)。

### Exit code

| code | 意味 | 対処 |
| ---: | --- | --- |
| 0 | 成功 | — |
| 1 | ログイン期限切れ / 未ログイン | `--setup` を再実行 |
| 3 | 一部の会話取得に失敗(`--project-chats` で部分失敗) | ログで失敗した会話を確認、再実行 |
| 4 | タイムアウト | 再実行 / ネットワーク確認 |
| 6 | その他(見つからない / 曖昧 / API 形不一致 等) | エラー文と `_claude_ai_inspect.py` を確認 |

出力先 `claude-ai-export/` は `.gitignore` 済(私的内容なのでコミットしない)。

### `_claude_ai_inspect.py` — 内部 API の形を確認する discovery ヘルパー

内部 API のエンドポイント / フィールド名が想定とずれていないか確認する read-only ツール。
何も保存・変更せず、`/api/organizations` 以下の生 JSON のキーを標準出力にダンプする。
本体が `exit 6`(API 形不一致)で落ちる時に実行して、`claude_ai_fetch.py` の
`fetch_*` / `*_to_md` を実レスポンスに合わせて更新する。

```powershell
py tools/_claude_ai_inspect.py
```

### Claude (会話 AI) からの呼び出し

ユーザーが「claude.ai の○○の企画/チャットを見て」と言ったら、Claude が本スクリプトを
Bash で実行(`--list-*` で当たりを付け → `--project`/`--chat` で取得)→ 保存された
`claude-ai-export/*.md` を `Read` して内容をチェック・要約する。

---

## `auto_debug_run.js` — 自動デバッグ巡回ランナー

ゲームを**無人で連続自動プレイ**させ、`index.html` 内の不変条件ウォッチドッグが
検出した異常を回収して要約する Node スクリプト。`index.html?autodebug=N` を駆動する。

### 何を検出するか (in-game ウォッチドッグ)

`?autoplay` / `?autodebug` / `?diag=1` のいずれかで起動し、500ms ごとに4カテゴリを検査:

- **致命系**: JSクラッシュ / 探索10秒停滞 / 戦闘45秒超(無限ループ疑い) / ラウンド停滞
- **状態整合性**: HP・AC・座標の NaN / HP>maxHP / マップ範囲外 / 呪文スロット範囲外
- **ライフサイクル**: 敵の死亡反転 / 全滅未検出 / 結果画面の二重発火
- **進行バランス**: 戦闘長すぎ / ダメージ0停滞 / XP・金貨の異常減少 / DOM・fxリーク / フレーム落ち

検出結果は `localStorage["dragonfighters.debugReport"]`・画面パネル(バッククォートで開閉)・
console に出力される。本ランナーは加えて**静的アセットの 404/読込失敗**も収集する
(JS例外ではないので in-game 診断では拾えない軸)。

### 初回セットアップ (puppeteer-core を scratch dir に導入。repo には入れない)

```powershell
# scratch dir に puppeteer-core を入れる (Chromium 同梱版ではなく軽量版)
$d = "$env:TEMP\df_pptr"; New-Item -ItemType Directory -Force $d | Out-Null
Push-Location $d; npm init -y | Out-Null; npm i puppeteer-core; Pop-Location
```

ランナーは `%TEMP%\df_pptr\node_modules\puppeteer-core` を自動で探すため、上記後は
追加指定なしで動く。別の場所に入れた場合は `PPTR_DIR=<dir>` 環境変数で指定。
ブラウザは Edge → Chrome の順で自動検出 (無ければ `--browser <path>`)。

### 実行

```powershell
# 全6シナリオを 6 ラン巡回 (速度x15、ヘッドレス)
node tools/auto_debug_run.js

node tools/auto_debug_run.js --runs 12              # 12 ラン
node tools/auto_debug_run.js --scen goblin-mine --runs 3   # 1シナリオ固定
node tools/auto_debug_run.js --headful              # ブラウザ画面を表示して観察
```

オプション: `--runs N` `--speed N` `--scen <id>` `--cycle all|impl` `--port P`
`--out <file>` `--headful` `--timeout-min N` `--browser <path>`

完了するとラン別の outcome・違反集計・404 一覧を標準出力に要約し、
全レポート JSON を `%TEMP%\df_auto_debug_report.json` (既定) に保存する。
レポートが30秒停止 (タブ凍結疑い) すると `?autodebug=resume` で次ランへ自動復帰する。

### Claude からの呼び出し (巡回デバッグ)

ユーザーが「巡回デバッグして」と要求したら、Claude が本スクリプトを Bash で実行 →
標準出力の要約と `df_auto_debug_report.json` を `Read` → critical を抜き出して報告する。
MCP ブラウザ拡張ブリッジは環境により弾かれる (ERR_BLOCKED_BY_CLIENT) ため、
本ランナー (puppeteer-core 直駆動) を一次手段とする。
