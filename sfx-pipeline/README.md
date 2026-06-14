# sfx-pipeline — 効果音 調達・整形パイプライン

CC0 素材パック / 手動投入素材 (inbox) を **取得 → 選定 → ffmpeg 正規化 → mp3 → manifest → クレジット記録**
まで自動化する。`voicevox-pipeline/` と同じ構成・思想 (Python + ffmpeg)。

ゲーム本体 (`audio.js`) は起動時に `assets/sfx/sfx-manifest.json` を読み込み、登録済み ID は
**サンプル素材**を、未登録 ID は従来どおり**合成音**を鳴らす (フォールバック)。manifest が無くても
ゲームは合成音で正常動作する。

## 構成

```
sfx-pipeline/
  data/sfx-sources.json   # 取得定義: packs(CC0 DL候補) + mapping(ID→素材glob + volume/pitchVar/loop)
  scripts/
    sfx_common.py         # ffmpeg ラッパ (loudnorm 正規化 / ffprobe 長さ取得)
    fetch_sfx.py          # CC0 パック取得・展開 (任意ルート、raw/packs/ へ)
    build_sfx.py          # 整形・登録 (inbox 優先 → 正規化 → assets/sfx/ + manifest + CREDITS + report)
  raw/                    # ★gitignore: 元素材。コミットは整形後 mp3 のみ
    inbox/<id>/           # 人間が手動DLした素材を置く場所 (パック素材より優先)
    packs/<name>/         # fetch_sfx.py が展開する CC0 パック
  sfx-report.md           # 充足 ID / inbox 待ち ID の一覧 (自動生成)
```

出力先 (リポジトリにコミットされる):
```
assets/sfx/
  sfx-manifest.json       # ゲームが読む索引
  combat/  sword_swing_1.mp3, hit_flesh_1.mp3, ...
  ui/      ui_tap.mp3, coin.mp3, ...
  ambient/ fire_loop.mp3, tavern_amb.mp3, ...
  CREDITS.md              # ID / 採用ファイル / 出典 / ライセンス (自動生成)
```

## 前提

- **ffmpeg / ffprobe を PATH に通す** (例: `winget install Gyan.FFmpeg`)。iOS で再生できない wav/ogg を
  そのまま配信しないため、mp3 への変換に必須。
- 自動取得 (fetch) を使う場合のみ `pip install requests`。inbox 運用だけなら不要。

## 使い方

```bash
# 1. (任意) CC0 パックを自動取得
py sfx-pipeline/scripts/fetch_sfx.py

# 2. inbox に不足素材を置く (効果音ラボ / OtoLogic / 魔王魂 等は必ず手動DL→inbox)
#    例: sfx-pipeline/raw/inbox/sword_swing/ に *.wav/*.mp3 を 3 つ

# 3. 整形・登録 (冪等。再実行しても重複しない)
py sfx-pipeline/scripts/build_sfx.py
#    → assets/sfx/ に mp3 + manifest + CREDITS、sfx-report.md に充足状況
```

`sfx-report.md` の「inbox 待ち」を見て不足分を inbox に置き、再実行する運用。

## 調達ルールの要点 (詳細は ../Downloads/sfx-spec.md A 節)

| 区分 | 対象 | 方法 |
|---|---|---|
| 完全自動 | Kenney (CC0), OpenGameArt (CC0) | `sfx-sources.json` の packs に直リンク zip → fetch_sfx.py |
| inbox 方式 | 効果音ラボ, OtoLogic, 魔王魂, くらげ工匠 | 機械的取得はしない。人間が DL し `raw/inbox/<id>/` に配置 |

- freesound は **CC0 フィルタを掛けたもののみ** 採用。
- クレジット必須素材 (OtoLogic / 魔王魂 等) を使ったら、`assets/sfx/CREDITS.md` 自動追記に加え、
  ゲーム内設定画面 (`audio.js` openSettings 末尾、VOICEVOX 表記の隣) にも追記する。
- `raw/` は **コミットしない** (再配布リスク・容量増の回避)。コミットは整形後 mp3 のみ。
