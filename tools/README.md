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

⚠ **送信できていないのに「タイムアウト」に見える罠** (2026-08-12 に実測):
応答が流れている間、ChatGPT は送信ボタンを**停止ボタンに差し替える**。この状態では
送信がボタンでも Enter でも通らないが、**本文は入力欄に入ってしまう**ので、外からは
`Timeout: no image appeared` にしか見えず 1 項目あたり `--timeout` を丸ごと空費する
(廃坑の 2 枚で 480 秒を捨てた)。対策として以下を実装済み:

- 打ち込む**前**に `_wait_idle()` で停止ボタンの消失を待つ
- 送信の成否は「ボタンを押せたか」ではなく **入力欄が空になったか** (`_try_send()`) で判定し、
  通らなければ 1 度だけ待ち直して再送、それでも駄目なら**待たずに** exit 6 で落とす
- テンプレ把握ターン (`expect_image:false`) の応答待ちは 60 秒 → **180 秒**
  (日本語の長文応答が 60 秒に収まらないのが発端だった)
- 日本語 UI では `aria-label` が「プロンプトを送信する」「ストリーミングの停止」なので、
  `SELECTORS` の `send_button` / `generating_indicator` に日本語パターンを併記してある

### 部屋 1 枚絵のテンプレ (4 種。用途で使い分ける)

| テンプレ | 比率 | 用途 | 壁 |
| --- | --- | --- | --- |
| `_TEMPLATE_room_battlemap.txt` | 10:7 | 旧単一マップの山場 | 絵に含める |
| `_TEMPLATE_room_battlemap_boss.txt` | 11:9 | 旧単一マップのボス部屋 | 絵に含める |
| `_TEMPLATE_room_beltscroll.txt` | 5:4 | ベルトスクロール版の山場 | 奥壁を絵に含める |
| `_TEMPLATE_room_node.txt` | 7:6 / 3:2 | **★P7 分岐マップのノード** | **描かない** |

★P7 のノード用だけ作法が 2 点**逆**になる (混ぜると使えない絵が出る):

- **壁を描かない**。部屋を囲む石壁はゲーム側がタイルで描くので、絵に描くと二重になる
- **四隅を暗く落とさない**。部屋が 6 行しかなく feather が 1 タイルずつ食うため、
  ビネットを入れると部屋がほぼ全部暗くなる (旧 3 種は「四隅を落として奥行き」が正)

バッチは `room_<theme>_node.jsonl` (6 本 = 1 シナリオ 1 起動)。raw は
`source_images/room_node/` へ受け、**必ず** 仕上げツールを通してから `assets/` へ置く:

```powershell
py tools/room_node_finish.py --raw source_images/room_node/room_orc-fort_n4_raw.png `
   --out assets/room_orc-fort_n4.jpg --aspect 7:6
```

中央クロップ + リサイズで厳密な比率へ揃え (7:6 → 1176x1008 / 3:2 → 1512x1008)、
**edge/center 比を実測して報告**する (0.88 未満 = ビネット混入 → 再生成)。

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

## `codex_request.py` — codex1 への依頼文を Codex CLI へ自動投下

`codex1/requests/YYYY-MM-DD_<slug>.md` に起草した依頼文を、**ユーザーが Codex の UI へ
手で貼り付けることなく** `codex exec` へ流し込むツール。依頼文の前に定型ヘッダ
(納品先 / 命名規則 / 納品前チェック)を自動で差し込み、**stdin** 経由でプロンプトを渡す。
実行中は `--json` の JSONL を逐次パースして、コマンド実行・ファイル書き込み・最終メッセージを
人間向け 1 行に整形して流す。

### 初回セットアップは**不要**

`chatgpt_generate.py` / `claude_ai_fetch.py` と違い、**専用プロファイルの用意も
`--setup` も Playwright も要らない**。理由は、codex CLI が **Codex デスクトップアプリ /
VS Code 拡張に同梱**されていて、GUI 側と次の 3 つを**そのまま共有**しているため:

| 共有されるもの | 実体 |
| --- | --- |
| 認証 | `~/.codex/auth.json` |
| skills | `~/.codex/skills/`(`dnd-monster-sprites` 等) |
| 設定(モデル等) | `~/.codex/config.toml` |

つまり **GUI の Codex にログイン済みなら、そのまま本スクリプトが動く**。
`~/.codex/auth.json` が無い場合だけ exit 1 で「デスクトップアプリでサインイン
(または `codex login`)してほしい」と案内して止まる(`--dry-run` では認証チェックしない)。

### ⚠️ 安全設計(意図的にこうしてある)

1. **作業根は常に codex1** — `-C` に `C:\Users\PC_User\Desktop\codex1` を渡す(`--cd` の既定値)。
2. **ダンジョンファイターズ本体には書かせない** — `--add-dir` を**一切付けない**ので、
   書き込み可能なのは作業根だけ。差し込みヘッダにも「`codex1` の外へは一切書き込まない」
   「本体リポジトリは読むことも書くことも不要」「台帳更新や `index.html` 差し替えは
   受け取り側の作業なので実行しない」と明記される。
3. **サンドボックス破りのフラグは実装していない** — `--sandbox` の選択肢は
   `read-only` / `workspace-write` の 2 つだけ。`danger-full-access` と
   `--dangerously-bypass-approvals-and-sandbox` 相当は**フラグごと持たせていない**ので、
   このスクリプト経由では原理的に指定できない。

### 使い方

```powershell
# 依頼文をそのまま投下 (本番)
py tools/codex_request.py --request "C:\Users\PC_User\Desktop\codex1\requests\2026-08-05_servant-npc.md"

# 何を送るか (argv + プロンプト全文) だけ確認する。codex は起動しない
py tools/codex_request.py --request <md> --dry-run

# 下見: 書き込みを禁じて調査だけさせる
py tools/codex_request.py --request <md> --sandbox read-only

# 短い指示を直接渡す (疎通確認)
py tools/codex_request.py --prompt-string "Reply with only the word OK." --sandbox read-only
```

> **推奨**: 初めて投下する依頼文は、まず `--sandbox read-only` で下見させて
> 「何を作ろうとしているか」を最終メッセージで確認してから、
> 既定の `workspace-write` で本番投下する。

### 主要オプション

| オプション | 役割 | デフォルト |
| --- | --- | --- |
| `--request <path>` | 依頼文 md のパス | — |
| `--prompt-string <text>` | 依頼文の代わりに直接渡す文字列 | — |
| `--dry-run` | 組み立てた argv と送信プロンプト全文を表示して何も実行しない | (off) |
| `--timeout <sec>` | タイムアウト秒数 | 1800 |
| `--model <name>` | モデル指定 | 省略時 `~/.codex/config.toml` の設定 |
| `--sandbox <mode>` | `read-only` / `workspace-write` のみ | `workspace-write` |
| `--cd <dir>` | Codex の作業根 | `C:\Users\PC_User\Desktop\codex1` |

> `--request` と `--prompt-string` は**ちょうど 1 つだけ**指定する(両方 / どちらも無しは
> `parser.error` で弾かれる)。

実際に起動するのは
`codex exec --json --color never -C <作業根> -s <sandbox> -o <last.md> [-m <model>] -`
で、プロンプトは末尾の `-` により **stdin から**読ませる(長い依頼文がコマンドライン長や
シェルのエスケープに巻き込まれないため)。作業根が git 管理下でない場合だけ
`--skip-git-repo-check` が付く。

### 実行ログの出力先

codex1 側の `requests/_runs/` に、1 実行あたり 2 ファイルを残す:

| ファイル | 内容 |
| --- | --- |
| `_runs/<YYYYmmdd_HHMMSS>_<slug>.log` | **実際に送ったプロンプト全文** + 整形済み進捗ログ |
| `_runs/<YYYYmmdd_HHMMSS>_<slug>.last.md` | codex の最終メッセージ(`codex exec -o` の出力) |

`<slug>` は依頼文のファイル名(拡張子なし)由来。`--prompt-string` の時は `prompt-string`。
どちらも `encoding="utf-8"` 固定で書く(cp932 のままだと日本語ヘッダの時点で落ちるため)。

### codex.exe の解決 — 固定書きしない

アプリ更新のたびに**ハッシュ付きディレクトリ**(`bin\8e8bf206e63ac436\`)や拡張の
バージョン番号が変わるため、パスは**必ず glob で探索**する。優先順:

1. Codex デスクトップアプリ: `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`
2. VS Code 拡張: `~\.vscode\extensions\openai.chatgpt-*\bin\windows-x86_64\codex.exe`
3. Microsoft Store 版: `C:\Program Files\WindowsApps\OpenAI.Codex_*\app\resources\codex.exe`
4. PATH(`shutil.which("codex")`)

**同じ段で複数ヒットしたら更新日時が最も新しいものを採る**(旧ハッシュの残骸や
複数バージョン同居の拡張を踏まないため)。見つからない場合は探した場所を全部ログに出して
exit 1 で止まる。

### Exit code

| code | 意味 | 対処 |
| ---: | --- | --- |
| 0 | 成功(`--dry-run` も 0) | — |
| 1 | codex CLI が見つからない / 未ログイン(`~/.codex/auth.json` 無し・認証エラー) | Codex デスクトップアプリでサインイン、または `codex login` |
| 3 | タスク失敗(codex が非 0 で終了) | `_runs/*.log` と `.last.md` で失敗内容を確認、依頼文を見直す |
| 4 | タイムアウト | `--timeout` を伸ばす(プロセスツリーごと `taskkill /T` で落とす) |
| 6 | その他(依頼文が無い/空・作業根が無い・起動失敗・中断) | エラー文のとおり修正 |

### Claude (会話 AI) からの呼び出し

CLAUDE.md の「Codex 自動依頼フロー」セクション参照。
Claude が `requests/YYYY-MM-DD_<slug>.md` に依頼文を起草 → ユーザー承認 →
Claude が Bash で本スクリプトを実行 → 納品物を `Read` / `check_sprite_doubling.py` で確認 →
台帳 `tools/codex1_sprites.json` と `requests/README.md` の一覧表を更新、という流れ。

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

---

## `make_grid_map.py` — codex1 の卓上 MAP を DF のタイル格子へ乗せ直す

★[卓上グリッド P3] codex1 (dnd-map-maker) の納品 MAP は**マス目が絵に焼き込まれている**。
間隔はマップごとにバラバラで 1536px の整数分割でもない(廃坑入口 45.70×45.59 /
廃坑 38.46×41.44)。そのまま貼ると絵の格子と DF の 96px 格子が別位置に出る = **二重グリッド**。

そこで「焼き込み線をそのまま DF のタイル境界として使う」ように焼き直す:

1. 整数マスぶんだけ切り出す(位相を捨て、左上の線を原点へ)
2. 縦横で**別々の倍率**でリサンプル(非等方 = 長方形のマスを正方形へ矯正)
3. 焼き上がりの線位置を測り直して**検算**する

```bash
py tools/make_grid_map.py --list                     # 台帳 (実測値 → マス数 → 出力先)
py tools/make_grid_map.py --name mine-entrance       # 焼く → assets/room_goblin-mine_n0.jpg
py tools/make_grid_map.py --check assets/room_goblin-mine_n0.jpg --tile 64   # 検算だけ
```

| 台帳キー | 素材 | 周期 | マス数 | 出力 |
|---|---|---|---|---|
| `mine-entrance` | `廃坑入口.png` | 45.70×45.59 | **33×22**(165ft×110ft) | `assets/room_goblin-mine_n0.jpg` @64px |
| `mine` | `廃坑.png` | 38.46×41.44(非正方 7.7%) | **39×23**(195ft×115ft) | `assets/map_mine.jpg` @64px |

⚠ **1 マス = 5 フィート**(D&D 標準)。1ft ではない。
⚠ 台帳の周期・位相は「測った結果」であって設定ではない。素材を差し替えたら測り直す。
⚠ 素材を差し替えたのに焼き直しを忘れると、周期 45.7px のまま貼られて二重線になる。

### 解像度を 64px/マスにした理由

素材の情報量は **45.7 px/マス**しかない。実測した 3 案:

| tile | 寸法 | JPEG q82 | 1 タイルあたり | 備考 |
|---|---|---|---|---|
| 48 | 1584×1056 | 0.62 MB | 0.87 KB | ほぼ等倍だが 1:1 で粗い |
| **64** | **2112×1408** | **0.97 MB** | **1.37 KB** | ← 採用 |
| 96 | 3168×2112 | 1.80 MB | 2.53 KB | 最も綺麗だが 2.1 倍の水増し |

既存 jpg の密度が約 1.9 KB/タイルなので、64px は**それより軽い**まま 96px に近い見た目。
⚠ 「NEAREST の倍率が整数でないと焼き込み線の幅が脈打つ」という仮説は**外れ**だった
(48/64/96 を本番と同じ NEAREST で 96px/タイルへ拡大して線幅を測ると sd = 1.05/1.09/0.98
とほぼ同じ。線幅の揺れは元絵の筆致由来)。この仮説で解像度を決めないこと。

### 検算の読み方(3 つとも見る。1 つでは足りない)

| 指標 | 意味 | 許容 |
|---|---|---|
| 端の累積ドリフト | \|周期 − tile\| × マス数 を**ワールド px** 換算 = マップの反対端でのズレ | 4.0 |
| 位相ズレ | 原点側のズレ(全域に一様に効くので厳しめ) | 2.0 |
| score 比 | TILE 固定の格子が最良の格子とほぼ同じだけ絵を説明するか = **格子を捉えているか**の門番 | 70% |

⚠⚠ **ピーク計数で測ってはいけない**。初版は「暗いピークが 96 の倍数から ±3px 以内か」で
数えていたが、崖の岩肌と木立の縦構造まで拾って縦線を 43 本検出し(格子は 34 本)、
**正しく焼けている画像を NG と報告した**。櫛形フィットは周期性のある物にしか反応しない。
⚠⚠ 判定はすべて**ワールド px** で行う。焼き上がり px で閾値を置くと、tile を 96 → 64 に
しただけで相対誤差が 1.5 倍になり **同じ絵が tile を変えただけで赤くなる**。
⚠ 小数を追わない。同じ素材の縦周期を 2 通りで測ると 45.576 / 45.641 と 0.065px 食い違う
(= 元絵の格子自体が約 1.4 world-px 不規則)。それ以下の精度は素材の側に存在しない。

### 検証と負のコントロール

負のコントロール: `node tools/driver_graph_p7.js --mutate n0aspect`(宣言した `tileBounds` と
実画素を食い違わせる → (5c) が赤くなる)。焼き直しそのものは `--check` に位相をずらした
画像を食わせれば赤くなる(±5px / 半マス / 3% 伸長の 3 種で実測済み)。

---

## `paint_blocked_grid.py` — 1 枚絵の障害物マスクを書くための作業用画像

★[卓上グリッド P2] `ROOM_PAINTINGS_DEF[theme][key].blocked`(1 文字 = 1 タイルの行文字列・
`#` = 通れない)を書くための支援ツール。山場の絵は 20×16 = **320 セル**あり、素の絵を
眺めて間違えずに拾うのは無理なので、**タイル境界と行/列番号を焼いた画像**を出す。

```bash
py tools/paint_blocked_grid.py --list                              # 在庫一覧 (寸法と現在の # 数)
py tools/paint_blocked_grid.py --theme goblin-mine --key 1         # 作業用画像 + 貼り付け雛形
py tools/paint_blocked_grid.py --theme goblin-mine --key 1 --rows 2-8 --scale 96   # 行を絞って拡大
py tools/paint_blocked_grid.py --all                               # 24 枚ぶん一気に
```

出力先は `out/paint_blocked/`(`.gitignore` 済み・再生成できるのでコミットしない):

| ファイル | 中身 |
|---|---|
| `<theme>_<key>_grid.png` | 絵 + タイル境界(5 マスごとに濃い線)+ 行/列番号。**既に書いた `#` は半透明の赤**で重ねるので、書いた場所がずれていないか目で確かめられる |
| `<theme>_<key>_blocked.txt` | `index.html` へそのまま貼れる `blocked: [ … ]` の雛形 |

⚠ 座標系は **絵ローカル**(左上のタイルが 0,0)。絵は 2 経路(絵側の `tileBounds` へ /
部屋の `rect` へ)で貼られるので、絶対座標で書くと mapDef 経路でずれる。
⚠ `ROOM_PAINTINGS_DEF` は `index.html` から実行時に読む(表を写経しない)。

### マスクを書くときの約束(`index.html` の節頭が唯一の正)

1. **外周 1 タイルは塞がない** — alpha フェザー帯で下の床と混ざるうえ、廊下が部屋の縁で接する
2. 地面に**平置き**の物(板・鎖・布・小石)は塞がない。塞ぐのは立っている物だけ
3. 迷ったら塞がない(すり抜けは見た目の粗、塞ぎすぎは詰み)
4. **入口レーン(絵ローカルの行 8-10 の両端)は塞がない**

### 検証

`node tools/driver_paint_blocked.js`(65 assert)。マスクの解釈規則・本編への適用・
**起点からボス/全部屋/全スポーンへ BFS が届くか**(6 シナリオ × `?paintblock=0` とのペア比較)・
門前ガード・撤退スイッチ・画像ロード非依存・lint・分岐ノードを測る。
負のコントロールは `--mutate nomask|noapply|offbyone|blockstart|blockstartnoguard`。
