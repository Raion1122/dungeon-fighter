# dev-meetings — 開発会議の記録

`dev-meeting` スキル（`.claude/skills/dev-meeting/`）で開催した開発会議の出力を、後から見返せるように保存するフォルダ。

## 運用ルール

- **1議題＝1ファイル**。命名は `YYYY-MM-DD_<議題の短いslug>.md`。
- **第1段（発散会議）** を開いたら、対話ログ＋実装候補一覧をそのファイルに保存する。
- **第2段（収束会議）** の開発計画書は、**同じファイルに追記**する（第1段の下に続ける）。
  これで「候補 → 決定 → 開発計画書」が1ファイルで時系列に追える。
- チャットに表示した内容と保存内容は同一でよい。

## ファイル構成の目安

```
dev-meetings/
  README.md                         ← このファイル
  2026-06-22_次の一手.md             ← 第1段の候補一覧（後で第2段の計画書を追記）
  YYYY-MM-DD_<議題>.md               ← 以降の会議
```

## 関連

- スキル本体: `.claude/skills/dev-meeting/SKILL.md`
- ペルソナ定義: `.claude/skills/dev-meeting/references/agents.md`
- 出力テンプレート: `.claude/skills/dev-meeting/references/output-format.md`
