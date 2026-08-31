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

- 戦士の通常攻撃・盾構えカウンター(2026-06-08 バランス調整済: 被弾ごと50%発動+近接間合い限定。プレイヤー/NPC仲間 共通)
- 盗賊の Hide in Shadows + Sneak Attack コンボ
- 魔法使いの Magic Missile + Sleep
- 上から見下ろし 2D アクション部分(基本動作)
- マップ 1枚
- ⚠ **2026-08-31 訂正(#39 §2-1)**: 次の 3 つは長らく下の「未実装」欄に残っていたが、
  実測の結果 **出荷済み**だった。⭐ 教訓 = 「その語で grep して 0 件」を未実装の根拠にしない
  (`fogOfWar` は単語が無かっただけ)。**振る舞いの名前**で探すこと。
  - **フォグオブウォー** … `index.html` `renderLighting()`。暗幕を `destination-out` で削る
    **3 状態**(未探索 α=255 / 探索の記憶 α=178 / 現在視界 α≈0)。`exploredTiles`(累積)と
    `visibleTiles`(毎更新クリア)。屋外テーマだけ無効
  - **DM ナレーション UI** … `index.html` `#dmNarration` + `Noto Serif JP`。
    タイピングは `NARRATION_CHAR_MS = 70`(設計書の 0.15 秒から実プレイ向けに短縮済)
  - **フェーズ表示** … `index.html` `#phaseIcon` / `#phaseText` + `PHASE_LABELS`
    (🔍探索 / ⚔️戦闘 / 💤休憩 の 3 状態)

## 実装が必要な機能(未実装)

- 残り 5シナリオの実装(現在シナリオ1 マップのみ)
- 6 職業すべての完全実装(現在は戦士のみ)
- スキルスロットシステム(Lv1=1 → Lv5=3 → Lv10=5)
- スクロール拾得・「読む」コマンド・永続習得
- グリッド制戦闘
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

## 更新情報(changelog)の運用 ⚠️ コミット時必須

銀の鹿亭(`tavern.html`)右上の「📜 更新情報」(`#changelogBox` の `changelogList`)は、
**コミット/プッシュの度に必ず最新化する**(ユーザー要望: 毎回必ず更新)。仕組みは
A(Claude 手順)+ B(チェックフック)の二重化(方式 D)。

- **書く内容**: *プレイヤー向けに整えた日本語要約*。コミット件名(開発者語彙)のコピペは禁止。
  先頭 = 最新、既定 4 件維持(古いものを 1 件落とす)。例:
  `<li><b>古代ハイドラに火炎ブレスを追加</b> — 頭が多いほど高確率で全体に炎を吐く。</li>`
- **手順(A)**: `index.html` / `tavern.html` / `audio.js` のロジックを変更したコミットでは、
  コミット前に必ず 1 行追記する。ヘルパー:
  ```bash
  py tools/add_changelog.py "<b>見出し</b> — 説明文"
  ```
- **機械強制(B)**: `scripts/hooks/pre-commit`(`core.hooksPath=scripts/hooks` 経由)が、
  上記3ファイルを変更したのに `changelogList` が未更新のコミットを**中止**する。
  検査本体は `scripts/hooks/check_changelog.py`。
- **`--no-verify` での迂回は禁止**。⚠⚠⚠ **そもそも Claude からは実行できない**(2026-08-23 実測)。
  ハーネス側のフック `pre:bash:block-no-verify` が `--no-verify` / `-n` / `-c core.hooksPath=` を
  **全部ハードブロック**し、`settings.json` での無効化・免除口の追加・env 経由の迂回も
  すべて分類器に拒否される。**ユーザーが手で叩く以外に通す道は無い**。
- ⭐⭐⭐ **したがって「プレイヤーに見える変化が 1 つも無いのに `index.html` /
  `tavern.html` / `audio.js` を触る」設計は、そもそも採らないこと。**
  調査チケットの計測シームのように書ける要約が実在しない変更は、**本番ファイルに置かず
  検証ツール側へ寄せる**(例: ドライバの配信スナップショットへ実行時に注入する)。
  ⛔ 嘘のプレイヤー向け行をでっち上げて通すのは禁止。
- **初回セットアップ(済)**: `git config core.hooksPath scripts/hooks`。
  別マシンで開発する場合は各クローンで一度だけ実行する。
- **トリガー範囲**: `index.html` / `tavern.html` / `audio.js` のみ。`assets/*.png` 追加のみ・
  `tools/*`・`scripts/*`・CLAUDE.md・検証ドライバの変更では強制しない(過剰検知の回避)。

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

**手動運用準拠の 2 段階フロー (2026-05-25 確立)**: 共通仕様テンプレ
`tools/sprite_batches/_TEMPLATE_common_spec.txt` を 1 ターン目で「画像生成なし
(`expect_image: false`)で把握」してもらい、2 ターン目以降で「○○の右歩き 6 コマ」の
極短指示で生成する。これで DALL-E のモデルシート化事故や人間剣士事故を回避できる
(2026-05-25 試行で実証、過去最良結果)。

jsonl は `tools/sprite_batches/<characterKey>.jsonl` に置く(例: `lizardChieftain.jsonl`、
テンプレ把握 + walk + attack の 3 行構成)。詳細仕様は `tools/README.md` の
「バッチモード」セクション参照。

```bash
py tools/chatgpt_generate.py --prompt-batch tools/sprite_batches/lizardChieftain.jsonl --timeout 240
```

**生成後の抽出**: ChatGPT が RGB PNG にチェック柄背景を埋め込んでくる場合、
`source_images/enemy_lizardChieftain/_extract.py` の `make_alpha_from_checker_bg`
関数(四隅 floodfill で明度高・無彩色領域を透過化)で背景除去 → `assets/<name>_anim.png`
を出力する。新キャラ追加時はこの extract.py をコピー流用。

### 従来の手動フローも併用可

レート制限到達時や緊急時は、Claude が起草したプロンプトをユーザーが手動で
ChatGPT に貼り付けて生成 → 手動で `assets/` に配置するフローも引き続き利用できる。

## Codex 自動依頼フロー

キャラ/モンスターのスプライトは、ChatGPT ではなく **codex1**(別リポジトリの
アセット工房)へ依頼文を出して作ってもらう。その依頼文を `tools/codex_request.py` 経由で
**Codex CLI (`codex exec`) へ自動投下**する。詳細は `tools/README.md`。

⚠️ **「依頼文を書いてユーザーが codex1 へ手渡しする」旧運用は、この自動投下に置き換わった。**
起草→承認 の 2 段階は変わらないが、投下は Claude が自分で実行する
(「Codex に貼り付けてください」とは依頼しない)。

### Claude (会話 AI) の動作方針

1. **依頼文の起草**: `C:\Users\PC_User\Desktop\codex1\requests\YYYY-MM-DD_<slug>.md` に起草する。
   作法(命名規則・「書き方の指針」4 項目・納品前チェック)は
   **同フォルダの `README.md` が唯一の正**。着手前に必ず読むこと。
2. **ユーザー承認**: 起草した依頼文をユーザーに提示し、OK を取る。
3. **自動投下**: 承認後、Claude が **自動的に** Bash で実行する。

   ```bash
   py tools/codex_request.py --request "C:\Users\PC_User\Desktop\codex1\requests\2026-08-05_servant-npc.md"
   ```

   **推奨**: 初回投下は `--sandbox read-only` で下見(何を作ろうとしているかを
   最終メッセージで確認)→ 問題なければ既定の `workspace-write` で本番投下。
   送信内容だけ確かめたい時は `--dry-run`(codex を起動しない)。
4. **納品物の確認**: 納品されたシート/フレームを `Read` ツールで目視確認し、
   **必ず** 分身チェックと背景残りチェックを通す。

   ```bash
   py tools/check_sprite_doubling.py
   py tools/check_alpha_bg_residue.py        # 透過 PNG に背景が焼き込まれていないか
   ```

   ⚠⚠ **目視は「本番の背景の上」で行うこと。** 2026-08-16 の扉スプライトは、納品 PNG を
   単体で眺めている限り正常に見えたが、**扉の背後に不透明な白い矩形**が焼き込まれており、
   暗い石床へ置いた瞬間に白枠として出た。透過 PNG の欠陥は**背景色しだいで見えなくなる**。
   ⚠ この欠陥は「四隅の alpha が 0」「外周に不透明画素なし」「半透明率」のどれでも
   検出できない (矩形は内側から始まり、内部は alpha=255)。効くのは
   `check_alpha_bg_residue.py` の**充填率** = 「切り抜き素材なのに不透明画素が
   自分の bbox をほぼ埋めている」だけ。

5. **取り込み**: 台帳 `tools/codex1_sprites.json` へ追記し、
   `codex1/requests/README.md` の一覧表のステータスを「依頼中」→「完了」に更新する。

### 初回セットアップは不要

`chatgpt_generate.py` と違い、**専用プロファイルも Playwright も `--setup` も要らない**。
codex CLI は Codex デスクトップアプリ / VS Code 拡張に同梱されており、認証
`~/.codex/auth.json`・skills `~/.codex/skills/`・設定 `~/.codex/config.toml` を
**GUI とそのまま共有**しているため、GUI にログイン済みならすぐ動く。
`~/.codex/auth.json` が無い時だけ exit 1 で止まるので、その時はユーザーに
Codex アプリへのサインインを依頼する。

### ⚠️ 安全設計(勝手に緩めない)

- 作業根は常に **codex1**(`--cd` の既定 = `C:\Users\PC_User\Desktop\codex1`)。
- **ダンジョンファイターズ本体には書かせない**(`--add-dir` を付けないので
  書き込み可能なのは作業根だけ)。納品はアセットを置くところまでで、
  台帳更新や `index.html` の差し替えは**受け取り側=こちらの作業**。
- 既定サンドボックスは `workspace-write`。選べるのは `read-only` / `workspace-write` の
  2 つだけで、`danger-full-access` や `--dangerously-bypass-approvals-and-sandbox` 相当は
  **フラグごと実装していない**。「サンドボックスを外せば通る」という回避は取らないこと。

### 失敗時

終了コード別に対処(`tools/README.md` の Exit code 表参照)。
1 = codex CLI 未検出/未ログイン、3 = タスク失敗、4 = タイムアウト、6 = その他。
実行ログと codex の最終メッセージは `codex1/requests/_runs/` に
`<timestamp>_<slug>.log` / `<timestamp>_<slug>.last.md` として残るので、
失敗時はまずこれを `Read` する。

## 出典・著作権

- D&D 5.1 SRD: CC-BY 4.0
- olimot/srd-v3.5-md: OGL 1.0a
- 残影の獣などのオリジナル要素: ユーザー独自(商用利用可)
