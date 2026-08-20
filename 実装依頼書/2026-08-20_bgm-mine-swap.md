# 廃坑の BGM を 3 曲へ差し替える(入口 / 坑内 / グリクス戦)

- **ステータス**: **承認済(着手可)**(2026-08-20 ユーザー依頼。判断は起草側に一任された)
- **起草日**: 2026-08-20
- **対象**: `audio.js` / `index.html` / `assets/bgm/`(mp3 を 3 本追加)
- **元の要望(逐語)**:
  > 廃坑入る前のＭＡＰをデスクトップフォルダのＢＧＭフォルダの中の「d1.mp3」
  > 廃坑の中のBGMを「haikou.mp3」グリクス戦を「boss01.mp3」に変更してほしい。

---

## 目的

廃坑シナリオの BGM を、場面ごとに 3 曲へ分ける。

| 場面 | 曲 | 今 |
|---|---|---|
| 廃坑に入る前のマップ = **n0「坑道の入口」**(空の下の採掘キャンプ) | **d1.mp3** | `dungeon_normal` |
| 廃坑の中 = **n1「坑道の奥」** | **haikou.mp3** | `dungeon_normal` |
| **グリクス戦**(玉座の間) | **boss01.mp3** | `boss_battle`(全シナリオ共通) |

⚠ 「廃坑に入る前のマップ」= **n0**、という読みで書いてある。n0 は絵が空の下の採掘キャンプ
(`outdoor: true`)で、坑口をくぐる前の場所そのもの。もし意図が屋外フィールド(街道)や酒場だったら、
着手前にユーザーへ確認すること — その場合は `SCENE_BGM` ではなく別の入口になる。

---

## 素材(実在を確認済み)

置き場: `C:\Users\PC_User\Desktop\BGM\`

| ファイル | サイズ | 長さ | 音圧(統合ラウドネス) |
|---|---|---|---|
| `d1.mp3` | 1,069,557 B | 66 秒 | **−17.3 LUFS** |
| `haikou.mp3` | 1,406,014 B | 87 秒 | **−12.6 LUFS** |
| `boss01.mp3` | 2,962,494 B | 185 秒 | **−11.2 LUFS** |

計 **5.44 MB** を `assets/bgm/` へ追加する(現在 10.3 MB → 15.7 MB)。GitHub Free 枠には十分収まる。

⚠ **既存の 4 曲は 1 本も消さない**。`maou_game_dangeon22.mp3`(= `dungeon_normal`)は森と沼地がまだ使う。

---

## 事実(コードを読んで確認済み)

### B1 BGM の決まり方は「シナリオ単位で 1 曲」+「ボス部屋だけ差し替え」

```js
// index.html:12812  シナリオ → BGM キー
const SCENE_BGM = {
  "goblin-mine": "dungeon_normal", "bandits-forest": "dungeon_normal", "lizard-swamp": "dungeon_normal",
  "orc-fort": "dungeon_climax", "undead-temple": "dungeon_climax",
  "dragon-lair": "pharaxus_stage",
};
// index.html:12835  実際に鳴らすキー
function currentBgmId() {
  const sb = sceneBgmId();
  if (window.__inBossRoom && sb && sb !== "pharaxus_stage") return "boss_battle";
  return sb;
}
```

→ **ノードの区別が無い**ので、今は n0 も n1 も同じ曲。ここに**ノード単位の枝を足す**のが今回の中身。

### B2 ⚠⚠ `boss_battle` は 5 シナリオ共有

`currentBgmId()` はボス部屋で**無条件に `"boss_battle"`** を返す。ここを `boss01` に差し替えると
**盗賊/沼地/砦/神殿のボス曲まで全部変わる**。**シナリオ別のボス曲テーブル**にして、
廃坑だけ上書きすること(既定は今までどおり `boss_battle`)。

### B3 曲が切り替わる瞬間は既に配線済み — 新しい発火点を作らない

- **ノード遷移**: `placeNodeParty` → `setPhase("explore")`(`index.html:31737` 付近)。
  `setPhase` は毎回 `bgm(currentBgmId())` を呼ぶので、`currentBgmId()` をノード対応にするだけで n0→n1 で曲が変わる。
- **ボス戦**: `window.__inBossRoom` の**唯一の書き込み点**は `syncBossRoomFlag`(`index.html:31851`)。
  大部屋では「玉座へ 8 タイル以内」で初めて真になる(P8-2。撤退は `?bossapproach=0`)。
  つまり **boss01 は玉座に近づいた瞬間から鳴る** — 「グリクス戦」の意図と合う。
- `playBgm` は ID で dedup するので、同じ ID を渡し続ける限り曲は途切れない。

### B4 音量は曲ごとに `volume` で決まる(実測から算出済み)

`BGM_FILES` の `volume` は per-track の係数(マスター/ミュートはバス側で別に掛かる)。
既存 `dungeon_normal` の実効音量は **−15.5 LUFS × 0.60 = −19.9 LUFS 相当**。これを探索の基準にする。

| キー | 曲 | 実測 | **指定する volume** | 実効 |
|---|---|---|---|---|
| `mine_entrance` | d1.mp3 | −17.3 | **0.74** | −19.9(基準どおり) |
| `mine_depths` | haikou.mp3 | −12.6 | **0.43** | −19.9(基準どおり) |
| `mine_boss` | boss01.mp3 | −11.2 | **0.52** | −16.9(基準 +3 dB) |

導出は `volume = 10^((目標 − 実測) / 20)`。
⚠ 既存の `boss_battle` は実効 −10.6 = 探索より **9.3 dB も大きい**。同じ差にすると廃坑だけ突出するので、
**ボスは +3 dB に留めてある**。ここは耳で最終判断してよい(下の「試聴確認」参照)。

---

## 変更範囲

**触る**

| 場所 | 何を |
|---|---|
| `assets/bgm/` | `d1.mp3` / `haikou.mp3` / `boss01.mp3` を追加(名前は変えない) |
| `audio.js:313-316` `BGM_FILES` | `mine_entrance` / `mine_depths` / `mine_boss` の 3 エントリを追加 |
| `index.html:12812` 付近 | ノード別 BGM の表とシナリオ別ボス曲の表を追加 |
| `index.html:12835` `currentBgmId` | 上の 2 表を引く |
| `tavern.html` の `changelogList` | **必須**(`index.html` と `audio.js` を変えるので pre-commit が止める)。`py tools/add_changelog.py` |

**触らない**

- 既存 4 エントリ(`dungeon_normal` / `dungeon_climax` / `boss_battle` / `pharaxus_stage`)の `src` と `volume`
- `SCENE_BGM` の他 5 シナリオの行
- 合成 BGM(`TRACKS`)の系統。今回は mp3 レイヤーだけ
- `setPhase` / `syncBossRoomFlag` / `playBgm` の呼び出し構造(B3 — 発火点は既にある)

---

## 実装方針

### STEP1 — 素材を入れる

`C:\Users\PC_User\Desktop\BGM\` から `assets/bgm/` へ 3 本コピーする。**リネームしない**
(ユーザーがこの名前で指示しているので、追跡できる名前を保つ)。

### STEP2 — `BGM_FILES` に 3 エントリ

```js
mine_entrance: { src: "assets/bgm/d1.mp3",      loop: true, volume: 0.74, credit: "" },
mine_depths:   { src: "assets/bgm/haikou.mp3",  loop: true, volume: 0.43, credit: "" },
mine_boss:     { src: "assets/bgm/boss01.mp3",  loop: true, volume: 0.52, credit: "" },
```

⚠⚠ **`credit` を勝手に埋めない**。既存 4 曲は「魔王魂」「ユーフルカ」と出典が入っている。この 3 曲の出所は
未確認なので、**ユーザーに確認して埋める**(下の「未決事項」)。分からないまま `"魔王魂"` 等と書かないこと。

### STEP3 — ノード別 + シナリオ別ボス曲

```js
// シナリオ+ノード → BGM キー。指定が無ければ SCENE_BGM の既定へ落ちる
const NODE_BGM = { "goblin-mine": { n0: "mine_entrance" } };   // n0 以外は既定 = mine_depths
const SCENARIO_BOSS_BGM = { "goblin-mine": "mine_boss" };      // 未指定は従来どおり boss_battle
```

- `SCENE_BGM["goblin-mine"]` を `"dungeon_normal"` → **`"mine_depths"`** に変える(= 廃坑の既定は坑内曲)。
  こうすると `?minefold=0` の旧 5 ノード構成(n0 / n1 / n4 / n5 / n7)でも **n0 だけ入口曲・残りは坑内曲**で正しく鳴る。
  **ノード id を 1 つずつ列挙しない**(旧経路のノードを書き漏らすと無言で `dungeon_normal` に戻る)。
- `currentBgmId()`:

  ```js
  const sb = sceneBgmId();                                   // ← NODE_BGM を先に引くように改修
  if (window.__inBossRoom && sb && sb !== "pharaxus_stage")
    return SCENARIO_BOSS_BGM[scenarioId] || "boss_battle";
  return sb;
  ```

- ⚠ **生成クエスト(`_genScenario`)の枝は触らない**。あちらは tier で `dungeon_normal`/`dungeon_climax` を選ぶ経路で、
  `scenarioId` が別物になる(`shouldSpawnChariot` が同じ理由で `scenarioId` を見ている)。

### STEP4 — 撤退スイッチ

**`?minebgm=0`** … `NODE_BGM` と `SCENARIO_BOSS_BGM` を無視して従来どおりへ戻す。
`?paintblock=0` 等と同じ作法(退避口なので `__dfDevCheat` ではゲートしない)。

---

## 受入条件 — `tools/driver_bgm_mine.js`(新規)

音は headless で聴けないので、**「どのキーを渡したか」で測る**。`GameAudio.playBgm` を包んで呼ばれた ID を記録する。

### §0 装置
- (0a) 記録シームが 1 回以上 ID を捉えている(空振りしていない)

### §1 廃坑
- (1a) n0 に居る間、渡される ID が **`mine_entrance`**
- (1b) n1 へ遷移した直後、渡される ID が **`mine_depths`**
- (1c) 玉座へ 8 タイル以内に入った後、渡される ID が **`mine_boss`**
- (1d) `?minefold=0`(旧 5 ノード)でも n0 = `mine_entrance` / n1・n4・n5 = `mine_depths` / n7 = `mine_boss`

### §2 恒等(他シナリオに副作用ゼロ)
- (2a) 森 / 沼地 の探索が **`dungeon_normal`** のまま
- (2b) 砦 / 神殿 の探索が **`dungeon_climax`** のまま
- (2c) 森 / 沼地 / 砦 / 神殿 のボス部屋が **`boss_battle`** のまま
- (2d) 竜の巣が探索もボスも **`pharaxus_stage`** の通し(切替なし)のまま
- (2e) 生成クエストが tier どおりの ID のまま
- (2f) `?minebgm=0` で廃坑が全部 `dungeon_normal` / `boss_battle` に戻る

### §3 素材
- (3a) `BGM_FILES` の 7 エントリすべてについて、`src` のファイルが **実在する**(404 で無音にならない)
  ⚠ mp3 の読み込み失敗は**静かに無音になる**だけで、画面には何も出ない。必ず存在を測ること。

### 負のコントロール

| 変異 | 注入する欠陥 | 赤くなるべき節 |
|---|---|---|
| `nonodebgm` | `NODE_BGM` を常に空 | §1a |
| `bossglobal` | ボス曲をシナリオ別にせず `mine_boss` 固定 | §2c |
| `badsrc` | `mine_depths` の `src` を存在しないパスへ | §3a |

---

## 試聴確認(実装後に必ず。ここが本当の受入)

⚠ **`file://` 直開きでは音が出ない**。必ず http で起動すること(`ゲームを起動.vbs` かローカルサーバ)。

1. 廃坑を開始 → n0 で **d1** が鳴るか
2. 坑口を抜けて n1 へ → **haikou** に切り替わるか(切り替わりが唐突すぎないか)
3. 玉座へ近づく → **boss01** に切り替わるか
4. **3 曲の音量差が不自然でないか**。B4 の数値は計算で合わせただけなので、
   耳で違ったら `volume` を動かしてよい(そのとき §1〜§3 の assert は 1 つも変わらない)
5. d1 は 66 秒と短い。**ループの継ぎ目が耳につかないか**も見る

---

## 未決事項(ユーザーに確認する)

- **3 曲の出典**。`credit` フィールドに何と書くか(既存は「魔王魂」「ユーフルカ」)。
  CLAUDE.md に「出典・著作権」の節があり、商用配布を前提にしているので**推測で埋めない**。
  ⚠ 現状 `credit` を画面に出す UI は無い(コード内の記録用)。だから急がないが、空のままにもしない。

---

## やらないこと

- 既存 4 曲を消さない / `src`・`volume` を変えない
- 他 5 シナリオの BGM 割当を変えない
- 合成 BGM(`TRACKS`)を触らない
- 酒場 / 闇市 / タイトルの BGM を触らない(今回は潜行中だけ)
- mp3 をリネーム・再エンコード・音量正規化しない(`volume` 係数で合わせる)
