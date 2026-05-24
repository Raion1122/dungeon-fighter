# ダンジョンファイターズ — ゲームプロジェクト

D&D 3.5 準拠の 2D 見下ろし型オートバトル RPG。シャドー・オーバー・ミスタラ + プール・オブ・レイディアンスのオマージュ路線。

---

## ⚙️ Claude Code への初回起動時指示(重要)

本 CLAUDE.md は別 PC からコピペで持ち込まれている。
パス内に `PC_User` というプレースホルダが残っている場合:

1. `whoami` または `echo $USER`(Bash)/ `$env:USERNAME`(PowerShell)で本 PC のユーザー名を検出
2. 本 CLAUDE.md 内の `PC_User` を全て検出ユーザー名に置換して保存
3. Dropbox 同期パス `C:\Users\<検出ユーザー名>\Dropbox\🔷ナレッジ🔷\` が実在するか確認(ls 等)
4. 存在しなければ → 「Dropbox 同期がまだ完了していない可能性、または別ドライブにインストールされている可能性。Dropbox の保存場所をユーザーに確認してください」とユーザーに報告
5. 存在すれば → そのまま実装作業に入って OK

この手順は一度だけ実行(プレースホルダがなくなったらスキップ)。

---

## 設計仕様の参照先

ゲーム設計の全仕様は別 PC で管理されている LLM Wiki ボールト(Dropbox 同期)に格納されている。本プロジェクトの実装時は必ずそちらを参照すること。

ボールトパス:
C:\Users\PC_User\Dropbox\🔷ナレッジ🔷\wiki\dungeon-fighters\

(↑ 上記「初回起動時指示」で `PC_User` は自動置換される)

## まず読むべきドキュメント(優先順)

1. spec.md — 統合仕様書(戦闘・グリッド・装備・UI・経験値の技術仕様)
2. overview.md — プロジェクト概要・参考作品・世界観・ゲームフロー
3. classes.md — 6 職業(戦士・ドワーフ・エルフ・僧侶・魔法使い・盗賊)の詳細

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| spec.md | 戦闘システム(D&D 3.5準拠)・グリッド制マップ・装備・UI・経験値・スクロールシステム |
| overview.md | 概要・参考作品(SoM / PoR)・舞台「プラン」・黒幕「ファラクサス」・ゲームフロー |
| classes.md | 戦士・ドワーフ・エルフ・僧侶・魔法使い・盗賊 各職業のパッシブ・スキル・武器・ゲージ |
| spells.md | 魔法職 26呪文(魔法使い 11 + 僧侶 10 + エルフ 5)、スクロール拾得→永続習得システム |
| items.md | 通常装備・レア魔法アイテム(白/青/紫カラー)・スクロールアイテム |
| scenarios.md | 6 シナリオ(廃坑→森→沼地→砦→神殿→ドラゴン巣)の依頼人・モンスター・ボス・伏線 |
| dm-narration.md | ダンジョンマスター語りかけ全文(ステージ開始6 + イベント8 + フェーズ切替6 + 撤退1) |
| shadow-beast.md | シナリオ2 隠し要素「残影の獣」(第三勢力ミニボス、檻ギミック) |
| swamp-hydra.md | シナリオ3 隠し要素「沼の守護神(古代ハイドラ)」(古代信仰冒涜、多頭再生) |
| fort-golems.md | シナリオ4 隠し要素「古代王国の守護者」(派閥識別、4分岐) |
| temple-ghost.md | シナリオ5 隠し要素「神殿の高位神官の霊」(対話分岐 NPC、ファラクサス情報) |
| final-mimic.md | 最終シナリオ隠し要素「偽宝箱」(古典ミミック、軽め演出) |

## 重要な実装方針

- 戦闘ルール: D&D 3.5 SRD 準拠(イニシアチブ d20+DEX、攻撃ロール vs AC、クリティカル等)
- 呪文ダメージ: D&D 5e SRD 標準値(プレイテスト後に調整予定)
- キャラスプライト: 右向きのみ用意、左向きは反転(scaleX = -1)
- マップ: グリッド制(可変サイズ)+ フォグオブウォー
- オートバトル: 完全自動進行、プレイヤー関与は出発前準備のみ

## 既に実装済の機能(2026-04 時点)

- 戦士の通常攻撃・盾構えカウンター(カウンター強すぎ調整待ち)
- 盗賊の Hide in Shadows + Sneak Attack コンボ
- 魔法使いの Magic Missile + Sleep
- 上から見下ろし 2D アクション部分(基本動作)
- マップ 1枚

## 実装が必要な機能(未実装)

- 残り 5シナリオの実装(現在シナリオ1 マップのみ)
- 6 職業すべての完全実装(現在は戦士のみ)
- スキルスロットシステム(Lv1=1 → Lv5=3 → Lv10=5)
- スクロール拾得・「読む」コマンド・永続習得
- グリッド制戦闘
- フォグオブウォー
- DM ナレーション UI(画面上部、Noto Serif JP、タイピング 0.15秒/文字)
- フェーズ表示(🔍探索/⚔️戦闘/💤休憩)
- 各シナリオの隠し要素

## 重要な制約・注意事項

### ⚠️ Product Identity 配慮(商用配布のため)

- Beholder / Mind Flayer / Yuan-ti / Slaad / Displacer Beast などは WotC の Product Identity で SRD 不在 → 使用禁止
- ただし「残影の獣」(Lingering Shadow Beast)は Displacer Beast のオリジナル代替名として既に対応済(shadow-beast.md 参照)
- 隠し要素のモンスター(Hydra / Stone Golem / Animated Armor / Ghost / Mimic)はすべて 5e SRD 内、商用OK

### 🎯 D&D 3.5 vs 5e の使い分け

- 戦闘ルール基盤: 3.5(イニシアチブ・AC・ダメージ表記)
- モンスター・呪文・アイテム: 5e SRD ベース(より整理されている)
- ファラクサスは 3.5 ジュベナイル・レッドドラゴン CR10 ベース + ラスボス補正

### 📊 経験値設計

- D&D 3.5 経験値テーブル(累積XP = 500×Lv×(Lv-1))
- Lv1 = 0、Lv10 = 45,000 累積
- 6シナリオ + 最終 2周クリアで Lv10 到達想定

## 実装の進め方

1. 新機能を実装する前: 必ず該当する spec.md の項目を読む
2. モンスターを追加する前: scenarios.md または該当シナリオの隠し要素ファイルを参照
3. 呪文・スキルを実装する前: spells.md または classes.md を参照
4. テキスト演出を実装する前: dm-narration.md を参照(コピーで使用可能)
5. 仕様の不整合や疑問: ユーザーに質問してください、別 PC のボールトを更新して反映します

## 仕様の更新方針

- ボールトの内容を変更する場合: 別 PC(ボールト管理 PC)で編集 → Dropbox 同期で本 PC に反映
- 本ゲームプロジェクトのコード変更は本 PC で完結
- ボールトと本プロジェクトの双方向参照: ボールト = 設計、本プロジェクト = 実装

## ChatGPT 画像生成の自動化フロー

部屋画 / スプライト / 装飾アセットは、`tools/chatgpt_generate.py` を経由して
Edge + Playwright で ChatGPT を自動操作して生成する。詳細は `tools/README.md`。

### Claude (会話 AI) の動作方針

1. **プロンプト起草**: 従来通り、Claude が部屋テーマ・スプライト仕様等から ChatGPT 用プロンプトを起草し、ユーザーに提示する。
2. **ユーザー確認**: ユーザーが OK を出したら、Claude は **自動的に** Bash 経由でスクリプトを実行する。「ChatGPT に貼り付けてください」とは依頼しない。
3. **スクリプト呼び出し例**:

   ```bash
   # プロンプトを一時ファイルに書き出して実行
   py tools/chatgpt_generate.py \
     --prompt-file /tmp/sce4_room0.txt \
     --output assets/room_orc-fort_0.png \
     --timeout 200
   ```

4. **出力パス選定**:
   - 部屋画: `assets/room_<scenarioId>_<roomIdx>.png`(例: `room_orc-fort_0.png`)
   - スプライト: `source_images/<name>/<seq>_<label>.png`(例: `source_images/orc_fort_scenery/01_torch.png`)
5. **生成後**: Claude が `Read` ツールで画像確認 → ユーザーに提示 → 修正点ヒアリング or 次工程(`ROOM_PAINTINGS_DEF` 追加など)。
6. **失敗時**: 終了コード別に対処(`tools/README.md` の Exit code 表参照)。レート制限(exit 2)や生成失敗(exit 3)はユーザーに報告して判断を仰ぐ。

### 初回セットアップが未済の場合

ユーザーから「自動生成して」と要求された時点で `~/.claude/chatgpt-automation/edge-profile/` が
存在しなければ、初回ログイン手順(`tools/README.md` 参照)を案内する。

### バッチモード(同キャラ複数シートの統一感保証)

**同じキャラの walk + attack** のような「会話コンテキスト共有が欲しい」セットは、
`--prompt-batch` を使って **1 起動 = 1 新規チャット内で連投** する。これにより
ChatGPT が同じ人物として描き続けるため、attack 側で別キャラ(人間剣士など)が
出る事故を防げる。

**ルール**:

- **同じキャラ内** (walk + attack) → 1 つの jsonl にまとめる = 1 チャットで連投
- **キャラを変える時** → 別の jsonl を別起動 = 新規チャットで開始(前キャラの装備色が混入するのを防ぐ)

jsonl は `tools/sprite_batches/<characterKey>.jsonl` に置く(例: `lizardChieftain.jsonl`)。
詳細仕様は `tools/README.md` の「バッチモード」セクション参照。

```bash
py tools/chatgpt_generate.py --prompt-batch tools/sprite_batches/lizardChieftain.jsonl --timeout 240
```

### 従来の手動フローも併用可

レート制限到達時や緊急時は、Claude が起草したプロンプトをユーザーが手動で
ChatGPT に貼り付けて生成 → 手動で `assets/` に配置するフローも引き続き利用できる。

## 出典・著作権

- D&D 5.1 SRD: CC-BY 4.0
- olimot/srd-v3.5-md: OGL 1.0a
- 残影の獣などのオリジナル要素: ユーザー独自(商用利用可)
