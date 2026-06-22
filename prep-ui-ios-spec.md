# prep-ui-ios-spec.md — 出発準備（編成）UI の iPhone 実機完成＋初見オンボーディング 仕様書

> 出典: 開発会議 2026-06-22（第1段 → 候補④選択 → 第2段 開発計画書）。記録: `dev-meetings/2026-06-22_次の一手.md`
> 対象ファイル: `tavern.html`（準備画面本体）／ `index.html`・`tavern.html`（viewport・タップCSS）／ `audio.js`（解錠は流用のみ）
> ⚠ 行番号は調査時点（2026-06-22）の概算。巨大ファイル・編集で前後するため、**必ずシンボル名で grep して現在位置を確認してから編集すること。**

## 0. 目的・背景
本編6シナリオ＋最終、闇市ポドルプラザ（M0〜M9）まで完成済み。残課題「iPhone編成UIの実機確認」を仕上げる。実体は `tavern.html` の**出発準備画面**（6職から主人公を選ぶグリッド＋仲間プレビュー＋装備/スキルタブ）。新ゲーム機能は足さず、(A) iPhone Safari 実機フィットと (B) 初回のみの語り部オンボーディングに集中する。

## 1. スコープ
### やる
- **Phase 1: 実機フィット** — viewport メタ追加（index/tavern 両方）、準備画面のタップ領域・縦持ちレイアウト・可読性の点検と調整、主人公選択／「仲間を引き直す」の視認性向上。
- **Phase 2: 初回オンボーディング** — 初回のみ・スキップ可の語り部ナレーション（"主人公を選び、仲間を募り、出発せよ"）を `openPrep()` 初回表示時に出す。

### やらない（次回議題へ切り出し）
- 仲間の手動並べ替え／ドラッグ&ドロップ／隊列入れ替え（新インタラクション）。
- 編成人数の変更（`PARTY_SIZE=4` 据え置き）。
- 編成ロジック定数・関数の挙動変更（§5 の同期対象は非変更）。

## 2. 現状の実コード地図（概算行・必ずシンボルで再確認）
### 準備画面本体（tavern.html）
- 入口: `openPrep(scenario)` 〜L2909、`prepEl.style.display="flex"` 〜L2937。初回描画で `renderPartyComposition()`（〜L2927）／`renderPartyPreview()`（本体 L3008-3038）／`renderCharTabs()`（本体 L3119-3145）を呼ぶ。
- HTML: `<div class="partyComp" id="partyComp">` 〜L1262。CSS `.partyComp` L567-572（`grid-template-columns: repeat(6,1fr)` 〜L569）、`.partyMemberToggle` L573-619。
- 主人公選択: `.partyMemberToggle` クリック → `selectHero(classKey)` 〜L2969-2990。
- 仲間再抽選: `#btnReroll`（HTML 〜L1268）→ `regeneratePartyMembers()`（〜L2945-3005）＋ `renderPartyPreview()`。
- 装備/スキルタブ: `.partyTabs` HTML L1273-1314 ／ `renderCharTabs()` L3119-3145。

### iOS / タッチの既存パターン
- **`<meta name="viewport">` は index.html・tavern.html とも存在しない（最重要・要追加）。**
- タップ拡大: index.html `@media (hover:none)` L786-801 ／ tavern.html L677-727（`.partyMemberToggle` を min-height:80px・padding:18px 等 L709-716）。
- `@media (max-width:768px)`: index.html L773-801。
- `user-select:none`: index.html L29 ／ tavern.html L29。`-webkit-tap-highlight-color:transparent`: js/skill-check.js L142。
- AudioContext 解錠: audio.js `unlock()` L107-119。トリガ index.html L8737(click)/L8759(mousedown)、tavern.html L3871。→ **流用のみ（変更不要）**。

### オンボーディングに流用する仕組み（tavern.html）
- `playNarration(段落配列, voiceIdPrefix)` L3721-3755（音声あり=声長に同期、なし=クリック送り）。`typeNarrationParagraph()` L3701-3711。
- モーダル: `#prologueOverlay`（CSS L999-1011 ／ HTML L1209-1220, z-index 200）。子: `#dmNarration`/`#dmBody`/`#dmHint`。
- 初回フラグの前例: `localStorage "dragonfighters.prologueSeen"`（判定 L3854-3858 ／ 保存 L3880）、`plazaStateTV.everEntered`（L3947-3958）。

### 状態の保存と戦闘への受け渡し（本案では非変更）
- localStorage: `dragonfighters.partyComposition`(L2714) / `dragonfighters.partySkills`(L2712) / `dragonfighters.allyEquip`(L2713)。
- handoff: tavern.html L3624-3625 が sessionStorage に `dragonfighters.partyMembers`/`partyComposition` を保存 → index.html L18747-18756 で復元。

### 二重ファイル同期（本案では“触らない”対象）
- 定数: index.html L5653-5687 ／ tavern.html L2231-2243（`ALL_CLASS_KEYS`/`PARTY_ZONES`/`ZONE_ORDER`/`PARTY_SIZE=4`/`NPC_NAMES`/`NPC_TRAITS`/`NPC_LINES`/`VARIANT_COUNT`）。
- 関数: `makeHeroMember`/`makeNpcMember`/`buildParty`/`orderFormation`/`pickRandom`/`pickVariant`（index.html L5593-5755 ／ tavern.html L2246-2321）。同期注意コメント tavern.html L2230。

## 3. 変更仕様

### Phase 1: 実機フィット
**1-1. viewport メタ追加（最優先・最大効果）**
- index.html と tavern.html の `<head>` に追加:
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- 追加後、まず**これ単独**で実機/レスポンシブ確認。横スクロール・はみ出し・極端な縮小が出る箇所を記録。

**1-2. 準備画面の実機調整（崩れた箇所のみ個別に）**
- `.partyComp`（6職グリッド）が縦持ち幅で潰れないか確認。必要なら狭幅向けに列を折り返す `@media`（例: `repeat(3,1fr)`×2段）を追加（**列数CSSのみ。職データ・ロジックは不変**）。
- `.partyMemberToggle`・`#btnReroll`・「出発する」・`.partyTabs` のタップ領域を実機確認し、`@media (hover:none)` 既存方針に合わせ 44pt 以上を担保。
- 仲間プレビュー（`renderPartyPreview` 出力）と装備/スキルタブが縦持ちで読める・スクロールできることを確認。
- 「仲間を引き直す」が初見で気づけるか（ラベル/配置/コントラスト）を点検。必要なら見出しか一言を添える（テキストのみ・日本語）。

### Phase 2: 初回オンボーディング
- 新フラグ: `localStorage "dragonfighters.prepOnboardingSeen"`（`prologueSeen` と同パターン）。
- `openPrep()` の初回表示時、フラグ未設定なら `playNarration()` で1〜2段落の語り部口上を表示してからフラグを立てる。文例（語り部トーン・説明書臭くしない）:
  - 「まずは旗頭を選べ。お主が誰として戦うかだ。」
  - 「仲間は集いに応じて馳せ参じる。気に入らねば“引き直す”がよい。支度が済めば、出発を。」
- 必須要件: **初回のみ／いつでもスキップ可（クリックで送れる）／二度目以降は出さない・戻りプレイヤーを止めない**。
- 酒場オープニング（`prologueSeen`）と二重で長くならないよう、表示は「準備画面を初めて開いた時」に限定する。
- 任意: ナレに音声を付けるなら VOICEVOX ローカル生成（登録不要・自動）。無くてもよい（テキスト送りで成立）。

## 4. 非機能・素材
- 素材調達: なし（純UI/案内）。外部サイト不使用。アカウント登録必須・有料・ログイン必須サイトは使わない。
- 日本語のみ。Product Identity / WotC ファンポリシー順守（本案はUIのみで抵触なし）。

## 5. 二重ファイル同期ルール（厳守）
- **両方に入れる**: viewport メタ。index と tavern 双方に同種要素があるタップ系/レイアウトCSSは双方を調整。
- **触らない**: §2「同期定数/関数」。これらを変更しないことを規律とし、変更が必要に見えたら一旦止めて再検討（スコープ外）。

## 6. iOS Safari 受け入れ条件（実機 or Safari レスポンシブ）
- [ ] viewport 追加後、準備画面に意図しない横スクロール・極端な縮小が無い。
- [ ] 主要タップ要素（職トグル／引き直す／出発する／タブ）が指で押せる（≒44pt 以上）。
- [ ] 縦持ち portrait で準備画面が破綻せず、必要箇所がスクロールで到達できる。
- [ ] タップで AudioContext が解錠し、ナレ音声・SFX が鳴る（無音化しない）。
- [ ] 初回オンボーディングが「初回のみ・スキップ可・二度目は非表示」で動作（`prepOnboardingSeen`）。
- [ ] 既存の出発フロー（`partyMembers` の sessionStorage 受け渡し → 戦闘）が回帰なく動く。

## 7. 実装ステップ（順序）
1. 現状の準備画面を iPhone 実機 / Safari レスポンシブで確認、破綻点を洗い出す。
2. viewport メタを両ファイルに追加 → 再確認（最大効果を先に・差分を見る）。
3. 崩れた箇所だけ CSS（列折返し / タップ / 可読性）を個別調整。編成定数は触らない。
4. `prepOnboardingSeen` フラグ＋`openPrep()` 初回の `playNarration()` 案内を実装（スキップ可）。
5. §6 受け入れ条件を通しで確認。フラグ動作は headless 検証ドライバ（puppeteer-core、`%TEMP%/df_pptr`）で回帰可。
6. コミット: index.html/tavern.html を変更するため、**changelog（tavern.html の更新情報）を1行追記**（CLAUDE.md 必須ルール、`py tools/add_changelog.py "<b>…</b> — …"`）。pre-commit フックが未更新を弾く。

## 8. リスクと対策
- viewport 追加でレイアウト崩れ → viewport 単独で差分確認 → 崩れ箇所のみ個別調整（一括変更しない）。
- オンボが戻りプレイヤーの邪魔 → 初回フラグ＋スキップ可を必須に。
- ドラッグ並べ替え要望の再燃 → 次回議題として明確に保留（スコープ膨張防止）。
- 行番号ズレ → 必ずシンボル名で grep して現在位置を確認してから編集。
