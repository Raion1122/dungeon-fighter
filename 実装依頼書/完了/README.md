# 実装依頼書 — 決着ぶん

親の [../README.md](../README.md) の一覧で **完了 / 見送り** になった依頼書の置き場。
**着手順の唯一の正は親の README の表**。ここは保管庫であって、読む順番を持たない。

| # | 依頼書 | 決着 | 残っている宿題 |
|---|---|---|---|
| 1 | [2026-08-20_mine-wall-clipping.md](2026-08-20_mine-wall-clipping.md) | 完了 `7c59c44` | iOS 実機 / 護衛が玉座の背後に回った絵の目視 |
| 2 | [2026-08-20_wallbox-hardcoded-72px.md](2026-08-20_wallbox-hardcoded-72px.md) | 完了 `f8c3bba` | 末尾「残った宿題」節を見よ |
| 3 | [2026-08-20_paint-mask-subtile.md](2026-08-20_paint-mask-subtile.md) | **見送り** `5cfe1e1` | ⚠ **再開の条件つき**。STEP1(道具・実測・目視)まで実施し、STEP2 のマスク編集は行わないとユーザーが決定。末尾「再開の条件」節が唯一の正 |
| 4 | [2026-08-20_bgm-mine-swap.md](2026-08-20_bgm-mine-swap.md) | 完了 `4090a99` | 実機での試聴。credit 欄の出所確認 |
| 5 | [2026-08-20_save-slots.md](2026-08-20_save-slots.md) | 完了 `dde8457` | ⚠ iOS Safari で `pagehide` / `visibilitychange` が発火するか未確認。UI は #6 が作る |
| 6 | [2026-08-20_title-screen.md](2026-08-20_title-screen.md) | 完了 `9f8b1bd` | ⚠ 実機での目視 4 件(`ゲームを起動.vbs` の手動ダブルクリック / 2 段タップの押し心地 / `.locked-out` の見え方 / 準備画面の見出しの文言)。末尾「実装結果」節に逸脱 6 点 |
| 9 | [2026-08-22_boss-latch-during-combat.md](2026-08-22_boss-latch-during-combat.md) | 完了 `24dbb60` | iOS 実機 |
| 10 | [2026-08-22_mine-s4-guard-fog.md](2026-08-22_mine-s4-guard-fog.md) | 完了 `5a0e3c3` | 末尾「実機で見てほしいこと」節 |

## 移設するときの作法

1. 親の README の表は **行を消さずリンク先だけ `完了/` へ向ける**(決定の経緯への導線を切らないため)
2. 移す .md の中の相対リンクを `](../` → `](../../` へ直す
3. その .md を**パスで指しているコード/ドライバのコメント**を grep して直す
   (実績: `js/save-slots.js` / `tools/verify_save_slots.js` / `tools/driver_dev_gate.js` /
   `tools/driver_bgm_mine.js` / `tools/driver_wallbox.js` の 5 本が指していた)
   ⭐ 指し手は依頼書ごとに違う。**移設のたびに grep で数え直す**(2026-08-22 の #6 移設では `js/hero-classes.js` / `title.html` / `tools/verify_title_screen.js` の 3 本だった)
4. この表に 1 行足す
