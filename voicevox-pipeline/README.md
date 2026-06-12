# VOICEVOX ナレーション音声生成パイプライン

ダンジョンファイターズの「DM ナレーション(道中の語り)」と「クエスト受注ナレ」を
VOICEVOX で**事前生成**し、ゲームが再生する mp3 + manifest を `assets/voice/` に書き出すツール一式。
**実行時 API 呼び出しはしない**(ビルド前に静的ファイルとして用意)。

## できること
- `data/script.json`(台本)の各行を VOICEVOX で合成 → `assets/voice/<category>/<id>.mp3`
- `assets/voice/manifest.json`(ゲームが読む id→ファイル索引)を更新
- text + パラメータのハッシュで**差分生成**(変更の無い行はスキップ)

## 前提
- **VOICEVOX ENGINE** をローカル起動(既定 `http://127.0.0.1:50021`)
  - 入手: https://voicevox.hiroshiba.jp/ (アプリ同梱、または ENGINE 単体)
- **Python 3.10+** … `pip install requests`(他は標準ライブラリ)
- **ffmpeg / ffprobe** … mp3/ogg 変換と長さ取得に必須。**⚠ 現状この PC には未インストール**。
  - 導入例(Windows): `winget install Gyan.FFmpeg` 等で入れて PATH を通す
  - ※ iOS Safari は ogg を再生できないため **mp3 を既定**とする。**wav は配信しない**。

## 使い方
```bash
# 1. VOICEVOX ENGINE を別ターミナルで起動
# 2. 青山龍星の各スタイル ID が script.json と一致するか確認
py voicevox-pipeline/scripts/generate.py --list-speakers
# 3. 全生成(既定 mp3 出力、中間 wav は自動削除、出力先 assets/voice/)
py voicevox-pipeline/scripts/generate.py
# 4. dungeon だけ再生成
py voicevox-pipeline/scripts/generate.py --category dungeon
# 5. 特定行だけ再生成
py voicevox-pipeline/scripts/generate.py --only dungeon_intro_goblin-mine_0
```

## 主な引数
| 引数 | 既定 | 説明 |
|---|---|---|
| `--engine-url` | `http://127.0.0.1:50021` | ENGINE の URL |
| `--script` | `data/script.json` | 台本 |
| `--out` | `<repo>/assets/voice` | 出力先(ゲーム配信ディレクトリ)|
| `--category` | `all` | `quest` / `dungeon` / `all` |
| `--only <id>` | — | 特定 id だけ再生成 |
| `--format` | `mp3` | `mp3` / `ogg` / `wav`(iOS 対応で mp3 既定)|
| `--keep-wav` | off | 中間 wav を残す(通常は付けない)|
| `--list-speakers` | — | 青山龍星のスタイル ID 一覧表示 |
| `--list-all-speakers` | — | ENGINE の全話者(キャラ名 / スタイル / ID)一覧表示。複数話者の採用検討・ID 確認用 |

## 台本 (`data/script.json`)
- `speakers`: 用途エイリアス → VOICEVOX スタイル ID(複数キャラを使用)
  - DM・ナレーション系(青山龍星):
    - `narrator: 13`(ノーマル / 受注汎用・語り部依頼)
    - `dungeon_master: 84`(しっとり / 道中の語り・依頼人紹介ナレ・既定)
    - `dungeon_master_whisper: 86`(囁き / 警告・予約)
  - 依頼人ボイス(別キャラで声を使い分け):
    - `client_merchant: 11`(玄野武宏 ノーマル / 商人ボルダック・監視員ケネット)
    - `client_captain: 21`(剣崎雌雄 ノーマル / 自警団長ロダン)
    - `client_elder: 16`(九州そら ノーマル / 村の長老マリア。行 `overrides` で速度・音高を下げ老女寄せ)
    - `client_priest: 53`(麒ヶ島宗麟 ノーマル / 司祭マーテル)
- `defaults`: `speedScale` / `pitchScale` / `intonationScale` / `volumeScale`
- `lines[]`: `{ id, category, speaker, text, overrides? }`
  - id 規則: ダンジョン導入 = `dungeon_intro_<scenarioId>_<段落index>`、受注 = `quest_accept_00N`
  - **本文はゲーム側 `index.html` の `SCENARIO_NARRATIONS` と一致させること**
    (検証 `driver_voice` で本文ドリフトを検査)

## manifest.json(ゲームが読む索引)
```json
{
  "dungeon_intro_goblin-mine_0": {
    "category": "dungeon",
    "file": "dungeon/dungeon_intro_goblin-mine_0.mp3",
    "text": "君たちは、街道沿いの廃坑へとたどり着いた。",
    "speaker": 84,
    "durationSec": 2.1,
    "hash": "…"
  }
}
```
ゲームは `assets/voice/` + `file` を解決して再生(`durationSec` は ffprobe 取得、取れなければ null)。

## ゲーム側の参照(実装済み)
- `index.html` / `tavern.html` が起動時に `assets/voice/manifest.json` を fetch
  (`GameAudio.loadVoiceManifest`)
- 導入ナレは段落頭で `dungeon_intro_<scenarioId>_<i>` を再生、受注は準備画面で `quest_accept_00N`
- **音声が未生成でもテキストのみで正常動作**(フォールバックで無音 no-op)
- 音量は ⚙ 設定の「ボイス音量」/「マスター音量」/「ミュート」に連動
- iOS Safari: 最初のタップで `AudioContext` を unlock 済み(既存の操作起点 unlock を共有)

## GitHub Pages 配信
- mp3 と manifest は**コミットする**(Pages から**相対パス**配信。先頭 `/` の絶対パスは使わない)
- 中間 **wav はコミットしない**(リポジトリの `.gitignore` に `*.wav`)
- **台本が固まってから音声をまとめてコミット**(mp3 はバイナリ差分が効かず、再生成のたびに履歴が膨らむため)
- 容量目安: 1 本 20〜60KB、27 本でも合計数 MB 未満。Pages(推奨 1GB)に十分余裕

## クレジット(必須)
- **VOICEVOX:青山龍星** … 詳細と規約確認 TODO は [`CREDITS.md`](CREDITS.md) 参照。
  クレジット画面に表示すること。
