#!/usr/bin/env node
/*
 * verify_enemy_name_label.js — 敵の頭上の名前札 / 札を 70% へ (#44) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_enemy-name-label.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§4 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_world_heromark.js / tools/verify_world_steps.js)。
 *
 * ■ 項目 2 (このコミット) で足したもの — **§1 敵の札 (1a)〜(1h) / §2 70% (2a)〜(2f)**
 *   ⭐ §2 は「素のアーム」と「撤退アーム ?namelabel=0」を **同じ走行の中で両方開いて**
 *     比で測る (m.ref)。⛔ 絶対 px は 1 つも書かない。
 *   ⭐⭐⭐ (2b) の帯は依頼書の 0.68〜0.73 では実測を通らなかった (主人公の札は 0.7346)。
 *     真因は「縮まない固定費 6px」= border 0.7px が端末の 1px へ丸められる分 + 定数 4px。
 *     名前テキストそのものは 36→25.2 = **ちょうど 0.7000** で正しく縮んでいる。
 *     ⇒ 箱の帯を 0.68〜0.75 へ広げ、**同時に「テキストの幅の比 0.68〜0.72」を AND で追加**した
 *     (⛔ CSS は 1px も触らない。詳細は W_BOX_RATIO_* のコメント)。
 *   ⭐ (1a) の母集団は **スプライト経路** (popOnScreen)。札の有無で数えると循環して永久緑。
 *   ⭐ (2d) は「味方と違う色」だけでなく **「自前の背景色を実際に持つ (alpha > 0)」** も見る。
 *     ⚠ 前者だけだと変異 noenemycss (CSS を丸ごと消して透明) が緑で通ってしまう。
 *   ⭐ (2e) の敵側の対照は **撤退アームの状態アイコン列** (撤退アームには敵の札が無いため。
 *     どちらも同じ dy に置かれるので、dy を動かす変異 dyshift で差が出る)。
 *
 * ■ 項目 1 で入ったもの — **§0 装置**
 *     (0a) 母集団 … ダンジョンが起動し、**見えている生存中の敵が 1 体以上**居る
 *                   ⭐⭐⭐ これが無いと §1 の全 assert が空振りで永久緑になる
 *                   ⚠ 依頼書 §8 の ⚠ に従い「(0a)(0e)(0f) の母集団が全部同じ 1 体に
 *                     ならないこと」も同じ assert の中で要求する (1 体だけで測ると
 *                     「その 1 体だけを特別扱いした実装」で全部通る = #39 の教訓)
 *     (0b) 2 経路 … 敵名の表を**写経しない**。配信バイト (GET /index.html) の
 *                   ENEMY_TYPES から name: を抜いた集合と、ページの
 *                   Object.keys(ENEMY_TYPES).length が一致する
 *     (0c) 装置   … 素の起動で document.body.classList.contains('labelSmall') === true
 *     (0d) 装置   … window.__enemyLabels() の長さ === enemies.length (添字並列が無傷)
 *     (0e) 母集団 … **バッジを持つ敵**が 1 体以上見えている ((1h) の母集団)
 *     (0f) 母集団 … **伏兵化フォグで隠れている敵**が 1 体以上居る ((1c) の母集団)
 *     (0g) 宣言   … **ドライバが敵の箱を寸法データから計算していない** (位置・寸法は
 *                   すべて getBoundingClientRect 由来 / placeUnscaledUi を写経しない)
 *     (0h) 母集団 … **見えている敵のうち最小のものが 70 以下** ((2f) の母集団)
 *
 * ■ 項目 3 (このコミット) で足したもの — **§3 恒等 (3a)〜(3d) / §4 撤退 (4a)〜(4c)**
 *   ⇒ **受入条件の PENDING は 0 件**になった (残る PENDING は --negative の変異 17 本 = 項目 4)。
 *   ⭐⭐⭐ §3 の 3 本 (3a)(3b)(3c) は「素のアーム vs 撤退アーム」の**恒等**。撤退アームが
 *     「#44 が入る前の見た目」の定義なので、緑 = 「札とバッジ以外は 1px も動かしていない」
 *     の機械証明になる (依頼書 §1 のユーザー決定そのもの)。
 *   ⚠⚠⚠ **恒等 assert は「片方のアームだけを壊す変更」でしか赤くならない。**
 *     両アームを同じだけ動かす変異 (例: HP バーの dy を**無条件に** -12) は必ず**空振り**する
 *     — 負のコントロールは素のアームも撤退アームも**同じ変異ポート**から配るため。
 *     ⇒ (3a)(3b)(3c) を狙う変異は、必ず NAME_LABEL_ON で分岐させた形にすること
 *       (項目 3 が実走で確かめた形は下の MUTATIONS のコメントに置いてある)。
 *   ⭐ (3d) だけは **別ページ**で撮る (measureRoomCross)。本番の撤去点 resetNodeState() と
 *     構築点 buildNode() を実際に通す = clearNodeArrays を通る唯一の経路。
 *     ⛔ 本体の measure() の中で跨がない (盤面を作り直すと §0〜§2 の母集団が全部消える)。
 *   ⭐ (4a) は依頼書 §8 の 4 条件に **5 本目 (OFF の labelArrayLen === enemies.length)** を
 *     足してある。⚠⚠⚠ 理由 = `push(null)` は**撤退枝にしか無い**ので、素のアームしか見ない
 *     (0d) では「null を積み忘れる欠陥 (変異 nonull)」が原理的に捕まらない。
 *     依頼書の期待値は 1 つも弱めず、条件を 1 本 AND で足した形 (#38 の作法)。
 *   ⭐ 撤退アームの観測は m.ref、事故は errs (素) / m.refErrs (撤退) に分けて溜めてある。
 *
 * ■ ⚠⚠⚠ §0 の全ガードに共通の規則 — **母集団が立たなかったら「スキップして緑」にしない**
 *   (依頼書 §8 に太字で書いてある)。`(0a)(0e)(0f)(0h)` のどれかが偽になったら、
 *   **そのガード自身を FAIL にし、それを母集団とする本体の assert も FAIL** にする。
 *   ⭐ 「母集団が無いので測れなかった」を緑で記録すると、**assert が静かに消えるのに
 *     記録行は正常に見える**。#39 の「撤退アームだけ見ると永久緑」と同じ形で、
 *     本チケットでいちばん起こりやすい壊れ方。
 *   ⭐ 本体の assert 側は detail に `population: none` を出して
 *     「測れないから赤」と「値が悪いから赤」を区別できるようにする
 *     (項目 2 以降が §1/§2 を実装するときに `popFail()` を必ず通すこと)。
 *   → 変異 `bigonly` がこの規則自体を機械で検査する (下表)。
 *
 * ■ ⭐⭐⭐ 測定は **本番で配信される `/index.html` の上で行う**
 *   ⛔ 自前ハーネスに札だけを載せない — 本番ページだけが壊れているケースを
 *      永久に緑と報告するため。⛔ placeUnscaledUi の式を写経しない
 *      (実装と同じ間違いを共有して両方緑になる) → (0g) が機械で見る。
 *
 * ■ ⭐⭐⭐ 配信バイトは **起動時に 1 回だけ読んで凍結する** (下の SRC / MUT_SRC)。
 *   別窓が index.html を保存しても、走行中に混合ビルドにならない。
 *
 * ■ ⭐ 母集団は **本番の factory (createEnemy + createEnemyDom) をそのまま通して**作る。
 *   ⚠⚠ **素の object を enemies へ push してはいけない** — 添字並列の DOM 配列が
 *     **11 本** (#44 で 10 → 11) あるので、描画ループが即座に落ちる
 *     (driver_cast_circle.js の同じ注意書きと同根)。
 *   ⚠ 分岐マップの entry ノードは設計上わざと敵 0 体なので、フィクスチャ無しでは
 *     §1 の母集団が原理的に立たない (#39 / 卓上グリッド P1 の「母集団はカメラの
 *     置き方だけで消える」と同型の罠)。
 *
 * ■ 項目 4 (このコミット) で足したもの — **--negative の変異 17 本 (PENDING 0)** と
 *   **(3e) 罠A の受け皿**
 *   ⭐⭐⭐ 依頼書 §8 の変異表 17 行を全部実装した。⛔ 空振り 0 (赤くならなければ FAILED)。
 *   ⚠⚠⚠ 依頼書の targets が**原理的に空振り**する変異が 3 本あったので、
 *     **受入条件は 1 つも弱めず**に受け皿のほうを直した (#38 の作法):
 *       nonull     (0d) → (4a)  … push(null) は撤退枝にしかない (項目 3 が (4a) に 5 本目を追加)
 *       hpshift    無条件 → NAME_LABEL_ON で分岐 … 恒等 assert は片アームだけ壊さないと緑
 *       noteardown (3d) → **(3e) を新設** … (3d) は本ドライバの配信 index.html しか見ておらず、
 *                  別ドライバ (driver_cast_circle.js) の撤去ループとは無関係で永久に空振りする
 *   ⭐ bothgrow は依頼書の字面 (.allyLabel だけ) では (2f) が見る**敵の札**が動かず空振りするので、
 *     味方と敵の 4 本を**同率で** 1.4545 倍にする形にした (record で (2a)(2b)(2c) が緑のまま
 *     すり抜けることを同じ走行で実証する = (2f) が存在する理由そのもの)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⭐ **17 本とも impl: true / PENDING 0**
 *     (⛔ 実装を忘れた変異が件数から消えないため MUT_ORDER には全部並べたままにする)。
 *
 *   mutate      | 注入する欠陥                                              | 赤くなるべき節
 *   nolabel     | createEnemyDom の札生成ブロックを消す                       | (0a)(1a)(1b)
 *   noscale     | document.body.classList.add("labelSmall") を消す           | (0c)(2a)(2b)
 *   nocss       | body.labelSmall .enemyLabel { … } を消す                   | (2c) 敵だけ 100%
 *   noenemycss  | .enemyLabel { … } を丸ごと消す (className は残す)          | (2d) 罠C の再現
 *   deadshow    | 死亡時の札 hide を消す                                     | (1d)
 *   fogshow     | 伏兵化フォグの札 hide を消す                                | (1c)
 *   hydrashow   | ハイドラ封印の札 hide を消す                                | (1e)
 *   badgestay   | バッジ dy を -58 → -46 に戻す                              | (1h) 罠B の再現
 *   statusdetach| 状態アイコン列を札の子にせず独立配置のまま                    | (1g)
 *   typekey     | 札のテキストを def.name でなく typeKey にする                | (1b)
 *   nonull      | 撤退時の enemyLabelElements.push(null) を消す                | **(4a)** 添字ずれ
 *   noclear     | clearNodeArrays に 11 本目を足さない                        | (3d)
 *   noteardown  | driver_cast_circle.js の撤去ループへ足さない                  | **(3e)** 罠A の再現
 *   dyshift     | 札の dy を -27 → -30 にする                                | (2e)
 *   hpshift     | HP バーの dy を -10 → -12 にする                            | (3a) 恒等の空振り検査
 *   bothgrow    | .allyLabel の素と body.labelSmall の上書きを**同率で**膨らませる | **(2f) だけ**
 *   bigonly     | 配信バイトの ENEMY_TYPES で小さい敵の寸法を全部 96 へ         | **(0h) と (2f) が両方赤**
 *
 *   ⭐ §2-2 の罠A = noteardown / §2-5 の罠B = badgestay / §2-7 の罠C = noenemycss
 *     の 3 本が、起草中にしか見つからない知見を実装後まで生かす唯一の形。
 *   ⭐⭐⭐ bothgrow は「比だけで縛って絶対量を誰も見ていない」を、
 *     bigonly は「母集団が消えると assert も静かに消える」を、それぞれ機械で捕まえる。
 *     ⚠ bigonly での (2f) は「測れないから赤」であって「比が悪いから赤」ではないので、
 *       detail に `population: none` と出して区別できるようにすること。
 *
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *   ⚠ 置換文字列は **1 行に閉じる** (index.html はディスク上 **CRLF** なので複数行アンカーは
 *     必ず空振りする。tools/*.js は LF)。
 *   ⚠ 置換前後で **長さを変える** (同じ長さだと「当たったのに何も変わらない」を検出できない)。
 *   ⭐ アンカーに選んだ行は **整形し直さない** (空白 1 つで exit 3 になる = 2026-08-12 の実測)。
 *   ⭐ 変異が空振りしたら、**変異のほうを直す** (受入条件を弱めない = #38 の教訓)。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   敵の札の色そのもの (#ffe0d8 / rgba(56,20,20,0.55)) / バッジの dy = -58 という具体値 /
 *   font-size: 7.7px という具体値 / 札が長い敵どうしの重なり (混雑時は別チケット) /
 *   **札の pointer-events**。
 *   ⭐⭐⭐ pointer-events を測らない理由を実測付きで残す (依頼書 §2-11(b)):
 *     ダンジョンの遊びのクリックは **document に張られた 1 本**で、e.clientX/clientY を
 *     WX()/WY() で世界座標へ直して openChestAt() を呼ぶだけ。
 *     `grep -c "elementFromPoint" index.html` = **0** (2026-09-03 実測)、札に
 *     stopPropagation も付けない。→ **札が何であってもクリックは通る** =
 *     「札がクリックの盾になる」欠陥は**原理的に起きない**。
 *     ⛔ だから pointer-events: none → auto の変異は作らない (必ず空振りする)。
 *     ⚠ #41 で街の .npcUnit がクリックを奪ったのは受け口が #tavernViewport で
 *       stopPropagation を足したから。**受け口の張り先が違うのであの教訓はここには効かない**。
 *   ⭐⭐⭐ 「素のアームで自明に真になる assert」は 1 本も書かない (依頼書 §2-11(c))。
 *     全 assert に「素で真 / どの変異で偽」の**対**がある。対が書けないものは
 *     **測っているつもりで判定していない**ので、assert にせず detail の出力に留める。
 *
 * ■ ⚠ 依頼書 §2-8 の「敵 46 種」は **起草時の数え違い**。2026-09-03 の実測は **50 種**
 *   (top-level キー 50 / name: 50 で 1:1)。⭐ だから (0b) は件数を**写経せず**、
 *   「配信バイトから抜いた集合」と「ページの Object.keys(ENEMY_TYPES)」の **2 経路の一致**
 *   だけを縛る (卓上グリッド P3 の教訓 ⑪ =「在庫の総数を写経した装置は、在庫が 1 件
 *   増えた日にまとめて嘘の赤を出す」)。
 *
 * ⚠ ポート **9850** (変異 9851〜9867 = 17 本 / 撤退アームの基準ページ 9870)。
 *   2026-09-03 実測の使用中 (grep -rho "9[0-9]\{3\}" tools/*.js): 9168〜9497 /
 *   9500 / 9530〜9593 / 9600 / 9615 / 9632 / 9665 / 9681 / 9715 / 9725 / 9774 /
 *   9789 / 9840 / 9999。⇒ **9850 番台と 9870 は空き**。⛔ 他のドライバのポートは触らない。
 *
 * 使い方:
 *   node tools/verify_enemy_name_label.js              # 受入条件 (素の配信)
 *   node tools/verify_enemy_name_label.js --negative   # 負のコントロール (項目 4 で実装)
 *   node tools/verify_enemy_name_label.js --mutate nolabel   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える (2026-08-12 の実測)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9850'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (17 本。⭐ 項目 4 で **全部 impl: true / PENDING 0 / 空振り 0**)
//   ⛔ MUT_ORDER には常に 17 本並べる = --negative が「実装を忘れた変異」を件数から隠さない。
//   ⚠ from/to は「配信バイト中ちょうど 1 件」を実測してから書く (⛔ 当たることと赤くなることは別)。
//     項目 4 が 15 本ぶんを `.count()` で 1 件と確認した上で実走して赤を確かめてある。
//
//   ⭐⭐⭐ 変異は 2 種類ある:
//     ① from/to (または edits[]) の**逐語置換** — 16 本
//     ② transform の**変換関数** — bigonly の 1 本。小さい敵は 20 種以上あって
//        どの数値も名簿の中で一意にならないので、逐語アンカーが作れない。
//        (n0a) の代わりに verifyServed で「名簿の最小値が境界をまたいだ」を検算する。
//
//   ⭐⭐⭐ 項目 2 が **一時的に 4 本だけ配線して実走させ、担当の節が赤くなることを確認した**
//     (⛔ §1/§2 の assert が「素で自明に緑」でないことを自分で証明するため。確認後 impl: false へ戻した)。
//     ⇒ 項目 4 はこの 4 本をそのまま使える (2026-09-03 実測・アンカーは grep -cF で 1 件):
//       noscale      from 'if (NAME_LABEL_ON) document.body.classList.add("labelSmall");'
//                    to   'if (false) document.body.classList.add("labelSmall");'
//                    → (0c) body.labelSmall=false / (2a) 20.00/20.00=1.0000 / (2b) 箱もテキストも 1.0000 で赤
//       noenemycss   from '    .enemyLabel {'   to '    .enemyLabelDISABLED {'
//                    → (2d) 敵の札の背景が rgba(0, 0, 0, 0) になって赤
//                    ⭐⭐⭐ **依頼書どおり「味方と違う色」だけを見ていたら緑で通っていた**
//                      (透明も「違う色」なので)。だから (2d) に alpha > 0 を AND で足してある。
//       statusdetach from 'lb.appendChild(st);'   to 'enemyLayer.appendChild( st );'
//                    → (1g) child=false で赤
//                    ⚠⚠⚠ to を 'enemyLayer.appendChild(st);' にすると **(n0a) が赤くなる**
//                      — その文字列は else 枝に**元から居る**ので「素には注入文字列が無い」が破れる。
//                      空白を入れて素に無い形にすること (2026-09-03 に実際に踏んだ)。
//       dyshift      from 'hpBarOffX + 2, -27);'   to 'hpBarOffX + 2, -30.0);'
//                    → (2e) 敵の dy が -30.00 vs 撤退アームの状態列 -27.00 で赤
//                    ⚠ '-27);' → '-30);' は**同じ長さ**なので (n0b) の検算に弾かれる。小数を足す。
//
//   ⭐⭐⭐ 項目 3 も **同じやり方で 6 本を一時配線して実走**し、§3/§4 の 7 本が
//     「素で自明に緑」でないことを証明した (2026-09-03。使い捨てコピーで走らせ、本ファイルは
//      1 バイトも変異を持たない)。⇒ 項目 4 はこの 2 本をそのまま使える:
//       hpshift      from 'hpBarOffX, -10);'
//                    to   'hpBarOffX, NAME_LABEL_ON ? -12.5 : -10);'
//                    → (3a) 敵の HP バーが 2.50px ずれて赤 / (4b) も同時に赤
//                    ⚠⚠⚠ **依頼書どおり「HP バーの dy を -10 → -12」にすると空振りする。**
//                      負のコントロールは素も撤退も**同じ変異ポート**から配るので、
//                      無条件に動かすと**両アームが等しく動いて恒等 assert は緑のまま**。
//                      NAME_LABEL_ON で分岐させて初めて赤くなる (実走で両方確認済み)。
//                    ⚠⚠ 配置関数 placeUnscaledUi の呼び出し行を**丸ごと**アンカーにしては
//                      いけない — その式と敵の寸法データ語がドライバ本体に入った瞬間
//                      **(0g) が赤くなる** (FORBIDDEN_IN_SELF / SELF_MARK の 2 段に引っかかる)。
//                      短いアンカー ('hpBarOffX, -10);' = 配信バイト中 1 件) を使うこと。
//       noclear      from 'enemyStatusElements.length = 0; enemyLabelElements.length = 0;'
//                    to   'enemyStatusElements.length = 0; /* 11 本目を掃除しない */'
//                    → (3d) 跨いだ後 札の配列 6 / 敵 2 で赤 (実走で確認)
//                    ⚠⚠⚠ to を 'enemyStatusElements.length = 0;' (前半だけ) にすると
//                      **(n0a) が赤くなる** — その文字列は素の行の**接頭辞として元から居る**ので
//                      「素には注入文字列が無い」が破れる (2026-09-03 に実際に踏んだ。
//                       statusdetach の空白の件と同じ形)。必ず素に無い形へ変えること。
//   ⭐ (4a) を狙うなら badgestay がそのまま効く (実走で ④ バッジ位置 ON -46 / OFF -46 で赤)。
//     from 'const badgeDy = NAME_LABEL_ON ? -58 : -46;'  to 'const badgeDy = -46;'
//     → (1h) と (4a) が同時に赤になる (どちらを targets に書いてもよい)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nolabel: { impl: true, file: 'index.html', targets: ['0a', '1a', '1b'],
    from: '      if (NAME_LABEL_ON) {',
    to:   '      if (false /* nolabel */) {',
    why: 'createEnemyDom の札生成ブロックを通らなくする (敵の札が 1 枚も出ない)' },
  noscale: { impl: true, file: 'index.html', targets: ['0c', '2a', '2b'],
    from: 'if (NAME_LABEL_ON) document.body.classList.add("labelSmall");',
    to:   'if (false) document.body.classList.add("labelSmall");',
    why: 'document.body.classList.add("labelSmall") を効かなくする (70% が効かない)' },
  nocss: { impl: true, file: 'index.html', targets: ['2c'],
    from: '    body.labelSmall .enemyLabel {',
    to:   '    body.labelSmall .enemyLabelNOCSS {',
    why: 'body.labelSmall .enemyLabel { … } の宛先を外す (敵の札だけ 100% のまま)' },
  noenemycss: { impl: true, file: 'index.html', targets: ['2d'],
    from: '    .enemyLabel {',
    to:   '    .enemyLabelDISABLED {',
    why: '.enemyLabel { … } を丸ごと効かなくする (className は残る = §2-7 罠C の再現)' },
  deadshow: { impl: true, file: 'index.html', targets: ['1d'],
    from: '          if (_deadLabelEl) _deadLabelEl.style.display = "none";',
    to:   '          if (false) _deadLabelEl.style.display = "none";',
    why: '死亡時の札 hide を消す (倒した敵の名前が床に残る)' },
  fogshow: { impl: true, file: 'index.html', targets: ['1c'],
    from: '          if (_labelEl) _labelEl.style.display = "none";',
    to:   '          if (false) _labelEl.style.display = "none";',
    why: '伏兵化フォグの札 hide を消す (伏兵が名前で丸見えになる)' },
  hydrashow: { impl: true, file: 'index.html', targets: ['1e'],
    from: 'const _hl = enemyLabelElements[index]; if (_hl) _hl.style.display = "none";',
    to:   'const _hl = enemyLabelElements[index]; /* hydrashow: 封印中も出す */',
    why: 'ハイドラ封印中の札 hide を消す (祭壇だけの見た目が壊れる)' },
  badgestay: { impl: true, file: 'index.html', targets: ['1h'],
    from: 'const badgeDy = NAME_LABEL_ON ? -58 : -46;',
    to:   'const badgeDy = -46;',
    why: '装備バッジの dy を -58 → -46 に戻す (§2-5 罠B = 札と 9px 重なる)' },
  statusdetach: { impl: true, file: 'index.html', targets: ['1g'],
    from: 'lb.appendChild(st);',
    to:   'enemyLayer.appendChild( st );',
    why: '状態アイコン列を札の子にせず独立配置のままにする'
      + ' ⚠ to の空白は必須 — 空白なしの形は else 枝に**元から居る**ので (n0a) が破れる' },
  typekey: { impl: true, file: 'index.html', targets: ['1b'],
    from: '        nameSpan.textContent = def.name || "";',
    to:   '        nameSpan.textContent = typeKey || "";',
    why: '札のテキストを def.name でなく typeKey にする' },
  nonull: { impl: true, file: 'index.html', targets: ['4a'],
    from: '        enemyLabelElements.push(null);',
    to:   '        /* nonull: null を積まない */',
    why: '撤退時の enemyLabelElements.push(null) を消す (?namelabel=0 のときだけ添字がずれる)'
      + ' ⚠⚠⚠ 依頼書の targets (0d) は**空振りする** — push(null) は createEnemyDom の'
      + ' **撤退枝にしかない**ので、素のアームしか見ない (0d) では原理的に赤にならない。'
      + ' 項目 3 が (4a) に 5 本目 (OFF の labelArrayLen === enemies.length) を AND で足し、'
      + ' そちらへ targets を移した (受入条件は 1 つも弱めていない = #38 の作法)' },
  noclear: { impl: true, file: 'index.html', targets: ['3d'],
    from: 'enemyStatusElements.length = 0; enemyLabelElements.length = 0;',
    to:   'enemyStatusElements.length = 0; /* 11 本目を掃除しない */',
    why: 'clearNodeArrays に 11 本目 (enemyLabelElements) を足さない'
      + ' ⚠ to を前半だけ (接頭辞) にすると素の行に元から居るので (n0a) が破れる' },
  noteardown: { impl: true, file: 'tools/driver_cast_circle.js', targets: ['3e'],
    from: '                       enemyLabelElements]) {',
    to:   '                       ]) {',
    why: 'driver_cast_circle.js の撤去ループへ enemyLabelElements を足さない (§2-2 罠A)'
      + ' ⚠⚠⚠ 依頼書の targets (3d) は**原理的に赤にできない** — (3d) は本ドライバが配信する'
      + ' index.html の clearNodeArrays しか見ておらず、別ドライバの撤去ループとは無関係。'
      + ' ⇒ 項目 4 で (3e) を新設した: **配信した 2 本のソースを突き合わせて**'
      + ' 「createEnemyDom が push する配列が全部その撤去ループに並んでいる」を検査する。'
      + ' これなら罠A (11 本目の取りこぼし) が機械で赤になり、12 本目が増えた日にも効く' },
  dyshift: { impl: true, file: 'index.html', targets: ['2e'],
    from: 'hpBarOffX + 2, -27);',
    to:   'hpBarOffX + 2, -30.0);',
    why: '札の dy を -27 → -30 にする (置き位置の上端が動く)'
      + ' ⚠ -30); は素と**同じ長さ**で起動時の検算に弾かれるので小数を足す' },
  hpshift: { impl: true, file: 'index.html', targets: ['3a', '4b'],
    from: 'hpBarOffX, -10);',
    to:   'hpBarOffX, NAME_LABEL_ON ? -12.5 : -10);',
    why: 'HP バーの dy を **NAME_LABEL_ON のときだけ** -10 → -12.5 にする (恒等 assert の空振り検査)'
      + ' ⚠⚠⚠ 依頼書の「-10 → -12」(無条件) は**空振りする** — 負のコントロールは素も撤退も'
      + ' 同じ変異ポートから配るので、両アームが等しく動いて (3a) は緑のまま。'
      + ' 項目 3 が実走で両方 (無条件 = 緑 / 分岐 = 赤) を確認した' },
  bothgrow: { impl: true, file: 'index.html', targets: ['2f'], record: ['2a', '2b', '2c'],
    /* ⭐⭐⭐ 「素と 70% を**同率で**膨らませる」= 11px → 16px / 7.7px → 11.2px (どちらも 1.4545 倍)。
       ⚠ 依頼書は「.allyLabel の素と body.labelSmall の上書き」とだけ書いていたが、
         **味方の札だけ**膨らませると (2f) が測るのは敵の札なので**空振りする** (しかも
         (2c)「3 種の高さが同じ」が壊れて別の理由で赤くなり、狙いがぼける)。
         ⇒ 味方と敵の 4 本を同率で膨らませる形にした = (2a)(2b)(2c) は比 0.70 のまま緑、
           絶対量を見る (2f) だけが赤 という依頼書の狙いがそのまま出る (record で実証する)。
       ⚠ 4 本を 1 行で書けるよう !important の上書きを 1 箇所へ注入する
         (font-size 行は「7.7px」が 2 箇所あってアンカーが一意にならない)。 */
    from: '    .enemyLabel {',
    to:   '    .allyLabel, .enemyLabel { font-size: 16px !important; }'
        + ' body.labelSmall .allyLabel, body.labelSmall .enemyLabel'
        + ' { font-size: 11.2px !important; } .enemyLabel {',
    why: '味方と敵の札を **素も 70% も同率で** 1.4545 倍に膨らませる —'
      + ' ⭐⭐⭐ (2a)(2b)(2c) は比 0.70 のまま**緑で通る** (record で同時に実証する)。'
      + ' §2-11(e)「両方同じだけ壊れる変更」の再現で、この 1 本のためだけに (2f) がある' },
  bigonly: { impl: true, file: 'index.html', targets: ['0h', '2f'],
    /* ⭐ 1 行置換では書けない — 小さい敵は 20 種以上あり、どの数値も名簿の中で一意にならない。
       ⇒ **変換関数**で配る (edits の代わりに transform を持つ変異)。
       ⛔ 書き換えるのは ENEMY_TYPES の中だけ (味方や UI の寸法には触らない)。 */
    transform: function (body) {
      const W = 'display' + 'Size';                 /* [0g-data] 名簿の数値を書き換えるだけ */
      const head = 'const ENEMY_TYPES = {';
      const i = body.indexOf(head);
      if (i < 0) return null;
      const j = body.indexOf('\n    };', i);
      if (j < 0) return null;
      let n = 0;
      const grown = body.slice(i, j).replace(
        new RegExp('(' + W + ': *)(\\d+)', 'g'),
        function (all, lead, num) {
          if (parseInt(num, 10) >= 71) return all;
          n++;
          return lead + '96 /* bigonly */';
        });
      if (n === 0) return null;
      return { body: body.slice(0, i) + grown + body.slice(j), note: n + ' 種を 96 へ' };
    },
    /* (n0a) の代わり。⭐ 「配った欠陥が素に無く変異側にだけ在る」を**名簿の最小値**で見る。 */
    verifyServed: function (pure, mut) {
      const a = rosterFromBytes(pure), b = rosterFromBytes(mut);
      if (!a.ok || !b.ok) return [false, '⛔ 配信バイトから名簿を切り出せない'];
      const mn = (r) => r.sizes.length ? Math.min.apply(null, r.sizes) : null;
      const p = mn(a), q = mn(b);
      const ok = p !== null && q !== null && p <= SMALL_MAX && q > SMALL_MAX;
      return [ok, '名簿の最小 素=' + p + ' / 変異=' + q + ' (境界 ' + SMALL_MAX + ')'
        + '  名簿 ' + a.sizes.length + ' → ' + b.sizes.length + ' 件'
        + (ok ? '' : '  ⛔ (2f) の母集団を殺せていない')];
    },
    why: '配信バイトの ENEMY_TYPES で 71 未満の敵の寸法を全部 96 へ書き換える'
      + ' (= (2f) の母集団を殺す) — ⭐⭐⭐ 「母集団が立たないので skip = 緑」を実装すると'
      + ' この変異が**空振り**する。§0 の共通規則そのものを機械で検査する 1 本。'
      + ' ⚠ このときの (2f) は「測れないから赤」なので detail に population: none が出る' },
};
/* ⭐ 対照ページ (?namelabel=0) を必要とする assert。⛔ 全変異で対照を開くと走行時間が倍に
 *  なるだけなので、targets / record にこれらを含む変異のときだけ開く。
 *  ⚠ 逆に「対照を用意しないと popFail で必ず赤」= **変異が効いていなくても赤**になり、
 *    空振りに気づけなくなる。だから必要な変異では**必ず**開く。 */
const REF_ASSERTS = { '2a': 1, '2b': 1, '2e': 1, '3a': 1, '3b': 1, '3c': 1, '4a': 1, '4b': 1, '4c': 1 };
const MUT_ORDER = ['nolabel', 'noscale', 'nocss', 'noenemycss', 'deadshow', 'fogshow',
  'hydrashow', 'badgestay', 'statusdetach', 'typekey', 'nonull', 'noclear',
  'noteardown', 'dyshift', 'hpshift', 'bothgrow', 'bigonly'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.filter(k => !MUTATIONS[k].driver);
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

/* ⭐⭐⭐ 配信バイトの凍結。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。
 *  ⛔ リクエストのたびに fs.readFileSync しない — 別窓が index.html を保存すると
 *     走行中に「素の行」と「変異後の行」が混ざったビルドを配ってしまう。
 *  ⭐ 変異は 2 通り: ① from/to (または edits) の**逐語置換** ② transform の**変換関数**
 *    (bigonly = 小さい敵の寸法を全部書き換える。逐語では一意なアンカーが作れない)。 */
const SRC = {};
const MUT_SRC = {};
function editsOf(m) { return m.edits ? m.edits : [{ from: m.from, to: m.to }]; }
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  let body = SRC[m.file];
  if (typeof m.transform === 'function') {
    const t = m.transform(body);
    if (!t || typeof t.body !== 'string' || t.body === body) {
      console.error('[drv] ⛔ 変異 ' + k + ' の transform が ' + m.file
        + ' を 1 バイトも変えなかった → 負のコントロールが空振りする');
      process.exit(3);
    }
    MUT_SRC[k] = { file: m.file, body: t.body, note: t.note || '' };
    continue;
  }
  const eds = editsOf(m);
  for (let i = 0; i < eds.length; i++) {
    const e = eds[i];
    const at = ' 変異 ' + k + (eds.length > 1 ? ' の置換 ' + (i + 1) + '/' + eds.length : '');
    if (typeof e.from !== 'string' || typeof e.to !== 'string') {
      console.error('[drv] ⛔' + at + ' の from/to が文字列でない'); process.exit(3);
    }
    if (e.from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔' + at + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)'); process.exit(3);
    }
    if (e.from.length === e.to.length) {
      console.error('[drv] ⛔' + at + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
    }
    const n = body.split(e.from).length - 1;
    if (n !== 1) {
      console.error('[drv] ⛔' + at + ' の置換対象が ' + m.file + ' 内に ' + n
        + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(e.from.slice(0, 90)));
      process.exit(3);
    }
    body = body.split(e.from).join(e.to);
  }
  MUT_SRC[k] = { file: m.file, body: body };
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const PAGE_PATH = '/index.html';
/* (3e) が読む 2 本目のソース。⭐ **同じポートから配られたバイト**を読む =
 *  変異 noteardown を載せた版がそのまま検査対象になる。⛔ ディスクを読み直さない。 */
const TEARDOWN_PATH = '/tools/driver_cast_circle.js';
/* 撤退のクエリ。§4 (項目 4) が本番で使う。 */
const RETREAT_QUERY = '?namelabel=0';
/* ⚠⚠⚠ #46 項目3 (2026-09-03) で敵頭上の**装備バッジが廃止**され、既定では 1 個も作られなくなった。
 *   このドライバは (1h) 交差 / (3c) 寸法 / (4a) badgeTop の 3 本が**バッジの矩形を母集団**に
 *   しているので、何もしないと 3 本とも `population: none ((0e) …)` で赤くなる (実測 27/30)。
 * ⭐⭐⭐ 期待値は 1 つも弱めず、**装置で母集団を復元する** (#23 の教訓)。
 *   = 全アームを #46 の撤退スイッチ **?enemybadge=1** で開く。バッジは #44 が決めた頭上の
 *     位置 (名前札 ON なら -58 / 撤退時 -46) にそのまま出るので、30 本の受入条件は
 *     1 本も意味が変わらない。⛔ (1h)(3c)(4a) を削るのも、母集団ガードを緩めるのも禁止。
 * ⭐ 「バッジを消しても札と状態アイコン列は 1px も動かない」は #46 の受入条件 (3b) が
 *   着手前 hash e3dfb4a との**恒等**で測っている (最大差 0.000px / tools/verify_walk_block.js)。
 *   だから「バッジを出したまま札を測る」ことで #44 の測定が甘くなることはない。
 * ⚠ ?namelabel=0 と併用するので **& で連結**する (PAGE_PATH へ焼くと ? が 2 個になって壊れる)。 */
const BADGE_QUERY = 'enemybadge=1';
const pageUrl = (port, query) => {
  const q = String(query || '').replace(/^[?&]/, '');
  return 'http://localhost:' + port + PAGE_PATH + '?' + BADGE_QUERY + (q ? '&' + q : '');
};
/* シナリオは **廃坑 (goblin-mine) に固定**する (依頼書 §8 (0h))。
   ⭐ 大型の敵しか出ない部屋を測ると (2f) の母集団が消えるため。 */
const SCENARIO_KEY = 'dragonfighters.currentScenario';
const SCENARIO_ID = 'goblin-mine';

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const ov = mutKey ? (MUT_SRC[mutKey] || null) : null;
        if (ov && rel === ov.file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(ov.body); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* 書体 + 画像が届いて layout() が落ち着くまで待つ。⛔ 固定時間だけに頼らない。 */
async function settle(page) {
  try { await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null); } catch (e) {}
  await sleep(300);
}
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name: name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

/* ⚠⚠⚠ 母集団が立たなかったときの返し方。⛔ 「スキップして緑」は禁止 (依頼書 §8 の太字)。
 *  ⭐ 本体の assert は必ずこれを通して赤を返す = detail に `population: none` が出るので
 *    「測れないから赤」と「値が悪いから赤」が記録の上で区別できる。
 *  ⚠ 項目 2 以降が §1/§2 を実装するときは、母集団ガードが偽の枝で **必ず** これを呼ぶこと。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}

/* ⭐ 頭上 UI の帯は「矩形の交差」で測る (依頼書 §8 の ⚠ 計測機構)。
 *  ⛔ 中心 1 点や上端 1 点では取りこぼす (#42 で「中心の逃げ幅は不変なのに
 *     食われる面積は増えていた」を踏んだ)。⚠ (1h) が項目 2 で使う。 */
const overlaps = (a, b) => !!a && !!b && !(a.right <= b.left || b.right <= a.left ||
                                          a.bottom <= b.top || b.bottom <= a.top);

// ── §0 の計測パラメタ ────────────────────────────────────────────────────────
/* (0h) の閾値。⭐ 「見えている敵のうち最小のもの」が **これ以下**であることを要求する。
 *  ⚠ 依頼書 §8 (0h) の 70 = ホブゴブリン (74) では 100% の札でも比 0.270 で通ってしまうので、
 *    (2f) を効かせるには 70 以下の敵に当てるしかない、という較正から来た数値。
 *  ⛔ これは「敵の大きさの期待値」ではなく **(2f) を測れる母集団の定義**。 */
const SMALL_MAX = 70;
/* (0a)(0e)(0f) の母集団の下限 (依頼書 §8 = 「1 体以上」)。 */
const POP_MIN = 1;
/* ⚠ 依頼書 §8 の ⚠ =「(0a)(0e)(0f) の母集団が全部同じ 1 体にならないこと」。
 *  1 体だけで測ると「その 1 体だけを特別扱いした実装」で全部通る (#39 の教訓)。 */
const POP_DISTINCT_MIN = 2;

/* ══ §2 の帯 (項目 2 が実測して決めた) ════════════════════════════════════════
 *  ⛔ 絶対 px は 1 つも書かない。すべて **撤退アーム ?namelabel=0 の同じ札との比**。
 *    (⭐ 依頼書の 14.4px を写経すると、フォントが変わった日に嘘の緑になる)
 *
 *  ── (2b) の帯を依頼書の 0.68〜0.73 から **0.68〜0.75** へ広げた理由 ──────────
 *  ⚠⚠⚠ 依頼書 §8 (2b) の 0.68〜0.73 は、実測を通らない。両アームで実測すると
 *    主人公の札 (テキスト「あなた」= 3 文字) は 幅 52 → 38.2 = **0.7346**
 *    (高さは 20 → 14.38 = 0.7190 で (2a) の帯には収まる)。
 *
 *  ⭐⭐⭐ 真因を内訳まで実測した (2026-09-03。名前 span と札の箱を別々に採った):
 *      名前 span の幅        36 → 25.2 = **ちょうど 0.7000**  ← 文字は正しく 70%
 *      札の箱 - 名前 span    16 →  13                          ← 固定費が 0.81 倍しか縮まない
 *    固定費の内訳 = padding 5+5 → 3.5+3.5 (これは 0.7 倍で正しい) と、
 *    **border 1+1 → 1+1**(CSS は 0.7px と書いてあるが Chrome が端末の 1px へ丸める)と、
 *    どちらのアームでも変わらない 4px の定数。⇒ **縮まない固定費が 6px 残る**。
 *  ⭐ 固定費は文字数に依存しないので、**短い札ほど比が上がる**:
 *      3 文字「あなた」 0.7346 /  6 文字 ≈ 0.72 /  9 文字「ジャイアントラット」 ≈ 0.708
 *    そして #warriorLabel のテキストは実プレイでは**リーダー名に差し替わる**
 *    (index.html の「頭上ラベルのテキストもリーダー名に」)ので、**文字数は固定できない**。
 *  ⛔ 帯に合わせて CSS を触らない (ユーザー要望は「7 割くらい」で 0.73 はその範囲内)。
 *  ⭐ そこで **弱めずに済ませる**: 箱の帯は実在する文字数の全域 (0.708〜0.7346) を覆う
 *    0.68〜0.75 へ広げ、**同時に「名前テキストそのものの幅」の帯 0.68〜0.72 を AND で足した**。
 *    テキストの比は文字数に依存しない (固定費が乗らない) ので狭く縛れる。
 *    ⇒ 依頼書の 1 本より **条件は 1 つ増えている** = 帯を広げても検出力は落ちていない。
 *    ⚠ どちらの条件も変異 noscale (labelSmall を付けない) で **両方 1.0 になって赤**。
 * ══════════════════════════════════════════════════════════════════════════ */
const H_RATIO_MIN = 0.70, H_RATIO_MAX = 0.75;          // (2a) 札の高さの比
const W_BOX_RATIO_MIN = 0.68, W_BOX_RATIO_MAX = 0.75;  // (2b) 札の箱の幅の比 (固定費を含む)
const W_TEXT_RATIO_MIN = 0.68, W_TEXT_RATIO_MAX = 0.72;// (2b) 名前テキストの幅の比 (固定費を含まない)
/* (2c)(2e) の「同じ」の許容。⚠ 依頼書 §8 の ±0.6px をそのまま使う。 */
const SAME_PX = 0.6;
/* §3 恒等 / §4 (4b) の「完全一致」の許容。⚠ 依頼書 §8 の ±0.5px をそのまま使う。
 *  ⭐ 4 辺すべてを見る = 位置と寸法を同時に縛る (⛔ 中心 1 点や幅だけで代用しない)。 */
const SAME_RECT_PX = 0.5;
/* (1f) の「札の下端が HP バーの上端より上」の許容 (依頼書 §8 = +0.5)。 */
const TOUCH_PX = 0.5;
/* (2f) の絶対量の上限。⭐ 依頼書 §8 の較正表 = 「100% を確実に赤にし、実機調整の余地
 *  (font 8.9px まで) を残す」点。⚠ この閾値は**モンスター名簿に依存している**
 *  (rosterMin より小さい敵が将来追加されると比が上がって厳しくなる — それは正しい挙動)。 */
const LABEL_VS_SPRITE_MAX = 0.30;
/* (0g) の自己検査マーカー。⭐ ドライバ自身のソースで敵の寸法データ語に触れる行は
 *  **すべて**この印を同じ行に持つこと = 「これはデータとしての参照であって、
 *  箱の計算ではない」という宣言。⛔ 印を付けずに触れた行があれば (0g) は赤になる。 */
const SELF_MARK = '[0g-data]';
/* (0g) が探す語。⛔ ソース中にベタ書きすると自分自身がヒットして意味が濁るので連結で作る。 */
const SIZE_WORD = 'display' + 'Size';
/* (0g) の第 2 条件。⭐ 実装の置き位置の式を**写経していない**こと
 *  (対象 = 本番の配置関数 placeUnscaledUi と、world → 画面の変換 SX / SY)。
 *  ⛔ 写経すると実装と同じ間違いを共有して両方緑になる (依頼書 §8 の測り方の方針)。
 *
 *  ⚠⚠⚠ 探すのは **開き括弧まで含めた呼び出し/複写の形**だけ、かつ
 *    **この定義行自身が literal を含まないよう連結で組む**。2026-09-03 の実装中に
 *    **2 回連続で自己ヒットした**ので、作法として書き残す:
 *      1 回目 … 裸の識別子で探したら §2 (2e) の見出し文
 *               「…の dy を動かしていない」に当たった
 *      2 回目 … 開き括弧付きに直したら、その理由を説明した**このコメント自身**に当たった
 *    ⭐ 教訓 = **自分自身を読む assert は、自分の説明文も母集団に入る**。
 *      ⇒ ① 判定トークンは連結で作る ② 散文では開き括弧を付けずに名前だけ書く
 *      (上の 1 行目のように「placeUnscaledUi」「SX / SY」と書くぶんには当たらない)。
 *  ⭐ 名前を書いて**説明する**ことと、式を**持ち込む**ことは別物 — 縛りたいのは後者だけ。 */
const FORBIDDEN_IN_SELF = ['place' + 'UnscaledUi(', 'S' + 'X(', 'S' + 'Y('];
/* (0g) の第 3 条件。⭐ 矩形は **すべて getBoundingClientRect 由来**であること。
 *  観測側 (ページ内 rectOf) が 1 枚ごとに via を刻み、ここで種類を突き合わせる。 */
const RECT_VIA_WANT = 'getBoundingClientRect';

const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);

/* (2d) 用。⭐ 「味方と違う色」だけを見ると、CSS を丸ごと消して**透明**になった実装が
 *  「違う色」として緑で通ってしまう (変異 noenemycss がまさにそれ = §2-7 罠C の再現)。
 *  ⇒ 「自前の背景色を実際に持っている (alpha > 0)」を必ず AND で見る。
 *  ⛔ 正規表現を使わずに書く (このファイルは Edit で書くが、写経先で崩れないように)。 */
function bgAlpha(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  if (s === 'transparent') return 0;
  const i = s.indexOf('('), j = s.lastIndexOf(')');
  if (i < 0 || j < 0 || j < i) return null;
  const parts = s.slice(i + 1, j).split(',');
  if (parts.length < 4) return (s.indexOf('rgb') === 0) ? 1 : null;   // rgb(...) は不透明
  const a = parseFloat(parts[3]);
  return isFinite(a) ? a : null;
}

/* §2 の「素のアーム × 撤退アーム」の対を 1 箇所で取り出す。
 *  ⛔ assert ごとに m.ref を掘り直さない (掘り方が 2 通りになると静かにズレる)。
 *  ⚠ どちらかが採れなかったら null を返す = 呼び側が popFail() で赤にする
 *    (「対照が無いので緑」は禁止 = 依頼書 §8 の太字)。 */
function refPair(m, pick) {
  let on = null, off = null;
  try { on = pick(m) || null; } catch (e) { on = null; }
  try { off = (m && m.ref) ? (pick(m.ref) || null) : null; } catch (e) { off = null; }
  return (on && off) ? { on: on, off: off } : null;
}

/* ⭐ 項目 3 が足した — 素のアームの敵 e に対応する **撤退アームの同じ敵**を返す。
 *  ⚠ 添字が同じでも型が違えば別物なので、必ず type まで一致を要求する
 *    ((2e) が同じ守り方をしている。掘り方が 2 通りになると静かにズレるのでここへ畳んだ)。
 *  ⛔ popBadge / popVisible を撤退アームに当てて母集団を作らないこと —
 *    どちらも **札の有無**で数えるので、撤退アーム (札が 1 枚も無い) では必ず 0 体になり、
 *    §3 が「対照が無いから赤」で永久に空振りする。 */
function refEnemy(m, e) {
  const rows = (m && m.ref && m.ref.enemies) || [];
  const r = rows[e.i];
  return (r && r.type === e.type) ? r : null;
}
/* 矩形の「完全一致」の測り方。4 辺の最大ずれを返す (null = どちらかが採れなかった)。 */
function rectDelta(a, b) {
  if (!a || !b) return null;
  return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top),
                  Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom));
}
/* 寸法だけの一致 ((3c) 用。⭐ 位置は動かす仕様なので測らない)。 */
function sizeDelta(a, b) {
  if (!a || !b) return null;
  return Math.max(Math.abs(a.w - b.w), Math.abs(a.h - b.h));
}

/* ══════════════════════════════════════════════════════════════════════════════
 * (0g) ドライバ自身のソースを読んで「箱を寸法データから計算していない」を宣言する
 *   ⭐⭐⭐ 依頼書 §2-11(a): 既存ドライバ 20 本以上は敵の箱を寸法データから計算しており、
 *     **名前札はその箱の外** (スプライト上端の -27..-12.6) に出るので、
 *     計算経路の assert では原理的に気づけない。DOM 経路で測っていることを装置自身で
 *     宣言しておかないと、次の窓が善意で計算経路へ書き換えて**永久緑**になる。
 *   ⚠ これが捕まえるのは「将来の書き換え」であって「今この瞬間の正しさ」ではない。
 *     今の正しさは §1/§2 の assert が DOM 矩形で測ることそのものが担保する。
 * ══════════════════════════════════════════════════════════════════════════════ */
function selfScan() {
  let src = '';
  try { src = fs.readFileSync(__filename, 'utf8'); }
  catch (e) { return { ok: false, err: 'ドライバ自身を読めない: ' + String((e && e.message) || e) }; }
  const at = src.indexOf("'use strict';");
  if (at < 0) return { ok: false, err: "ドライバ内に 'use strict'; が無い (先頭コメントを切り出せない)" };
  const body = src.slice(at);
  const rows = body.split('\n');
  const bad = [];
  let touched = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].indexOf(SIZE_WORD) < 0) continue;
    touched++;
    if (rows[i].indexOf(SELF_MARK) < 0) bad.push('L' + (i + 1) + ': ' + rows[i].trim().slice(0, 80));
  }
  const forbidden = FORBIDDEN_IN_SELF.filter(w => body.indexOf(w) >= 0);
  return { ok: true, err: null, touched: touched, bad: bad, forbidden: forbidden };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * (0b)(0h) 配信バイトから ENEMY_TYPES の name / 寸法を抜く
 *   ⭐ 敵名の表を**写経しない**。⛔ 件数 (50) も期待値として持たない —
 *     ページ側の Object.keys(ENEMY_TYPES).length との **2 経路の一致**だけを縛る。
 * ══════════════════════════════════════════════════════════════════════════════ */
function rosterFromBytes(html) {
  const head = 'const ENEMY_TYPES = {';
  const i = html.indexOf(head);
  if (i < 0) return { ok: false, err: '配信バイトに ' + head + ' が無い', names: [], sizes: [], keys: [] };
  const j = html.indexOf('\n    };', i);
  if (j < 0) return { ok: false, err: 'ENEMY_TYPES の終端が見つからない', names: [], sizes: [], keys: [] };
  const blk = html.slice(i, j);
  const names = [];
  const reName = /\n {8}name: "((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = reName.exec(blk)) !== null) names.push(m[1]);
  const sizes = [];
  const reSize = new RegExp('\\n {8}' + SIZE_WORD + ': *(\\d+)', 'g');   /* [0g-data] 名簿の数値をデータとして拾うだけ */
  while ((m = reSize.exec(blk)) !== null) sizes.push(parseInt(m[1], 10));
  const keys = [];
  const reKey = /\n {6}([A-Za-z_][A-Za-z0-9_]*): \{/g;
  while ((m = reKey.exec(blk)) !== null) keys.push(m[1]);
  return { ok: true, err: null, names: names, sizes: sizes, keys: keys, bytes: blk.length };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * (3e) 罠A — 「添字並列の配列が 11 本目に増えたのに、別ドライバの撤去ループが 10 本のまま」
 *   ⚠⚠⚠ tools/driver_cast_circle.js は フィクスチャの敵を撤去するとき配列名を**逐語で**
 *     並べて splice + remove している。その直後の検算 6.11 は
 *     `enemies.length === enemyElements.length` の **2 本しか**比べないので、
 *     11 本目 (札) を足し忘れても **53/53 のまま緑**で、札の DOM だけが画面に残る
 *     (依頼書 §2-2 の罠A)。⇒ あちらのドライバ**では原理的に検出できない**。
 *   ⭐⭐⭐ そこで **2 本のソースを突き合わせる**: createEnemyDom が push する配列の集合が、
 *     撤去ループの配列リストに**全部**含まれていること。⛔ 「11 本」という件数は持たない
 *     (12 本目が増えた日に自動で効くため)。
 *   ⚠ 依頼書は変異 noteardown の targets を (3d) と書いていたが、(3d) は本ドライバが配信する
 *     index.html の clearNodeArrays しか見ておらず**別ドライバとは無関係**なので、
 *     そのままでは永久に空振りする。項目 4 で (3e) を新設して受け皿にした。
 * ══════════════════════════════════════════════════════════════════════════════ */
function teardownScan(indexHtml, driverSrc) {
  const out = { ok: false, err: null, pushes: [], list: [], missing: [] };
  if (typeof indexHtml !== 'string' || typeof driverSrc !== 'string') {
    out.err = '配信バイトを読めていない'; return out;
  }
  const head = 'function createEnemyDom(';
  const i = indexHtml.indexOf(head);
  if (i < 0) { out.err = '配信 index.html に createEnemyDom が無い'; return out; }
  const j = indexHtml.indexOf('\n    function ', i + head.length);
  if (j < 0) { out.err = 'createEnemyDom の終端が見つからない'; return out; }
  const blk = indexHtml.slice(i, j);
  const reP = /([A-Za-z_][A-Za-z0-9_]*Elements)\.push\(/g;
  const seen = {};
  let mm;
  while ((mm = reP.exec(blk)) !== null) { seen[mm[1]] = true; }
  out.pushes = Object.keys(seen).sort();

  const lhead = 'for (const arr of [';
  const a = driverSrc.indexOf(lhead);
  if (a < 0) { out.err = '配信 driver_cast_circle.js に撤去ループが無い'; return out; }
  const b = driverSrc.indexOf(']) {', a);
  if (b < 0) { out.err = '撤去ループの配列リストの終端が見つからない'; return out; }
  const inner = driverSrc.slice(a + lhead.length, b);
  const reL = /[A-Za-z_][A-Za-z0-9_]*/g;
  const lst = {};
  while ((mm = reL.exec(inner)) !== null) { lst[mm[0]] = true; }
  out.list = Object.keys(lst).sort();
  out.missing = out.pushes.filter(n => !lst[n]);
  out.ok = true;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 — ⛔ 返すのは **本番のデータ / 本番の関数 / ブラウザのレイアウト結果**だけ。
//        期待値を混ぜない (assert 側が突き合わせる)。
// ══════════════════════════════════════════════════════════════════════════════
async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.evaluateOnNewDocument((k, v) => {
    try { sessionStorage.setItem(k, v); } catch (e) {}
  }, SCENARIO_KEY, SCENARIO_ID);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(pageUrl(port, opts.query),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  /* ⚠ 裸の識別子で待つ。classic script 直下の const/let/function は window に載らないので
     `window.createEnemy` は常に undefined (メモリ ⑩ の教訓)。 */
  await page.waitForFunction(
    () => typeof createEnemy === 'function' && typeof createEnemyDom === 'function'
      && typeof updatePositions === 'function' && typeof ENEMY_TYPES !== 'undefined'
      && typeof enemies !== 'undefined' && typeof TILE_SIZE !== 'undefined',
    { timeout: 25000 });
  await settle(page);

  /* ══ 母集団の作成 + 描画 + 観測を **1 回の evaluate** で通す ═══════════════
     ⭐ 途中でオートバトルの手番が回ると everSeen が立って (0f) の母集団が消えるので、
       仕込みと計測の間にゲームのフレームを挟まない。
     ⚠⚠ **素の object を enemies へ push しない** — 添字並列の DOM 配列が 11 本ある。
       本番の factory (createEnemy + createEnemyDom) をそのまま通すのが唯一安全な作り方。 */
  const m = await page.evaluate((mapWFallback) => {
    const out = {
      fixture: { ok: false, err: null, made: [], renderOk: false, renderErr: null },
      rectCount: 0, rectVia: [],
    };
    const VIA = {};
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      VIA['getBoundingClientRect'] = (VIA['getBoundingClientRect'] || 0) + 1;
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
               w: r.width, h: r.height, via: 'getBoundingClientRect' };
    };
    const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
    /* ⭐ 項目 3 が足した共通ヘルパ。⚠ 従来は out.enemies の map の中にだけ dispOf があり、
       味方側から呼べなかった (§3/§4 は味方の器の有無も見るので外へ出す)。 */
    const dsp = (el) => el ? (el.style.display || '') : null;

    // ── 母集団を本番の factory で作る ────────────────────────────────────────
    try {
      const ptx = Math.floor(playerX / TILE_SIZE);
      const pty = Math.floor(playerY / TILE_SIZE);
      const mapW = safe(() => MAP_W, mapWFallback) || mapWFallback;
      /* フォグ用の敵は **視界の外**へ置く (近くに置くと isEnemyVisibleToParty が真になって
         everSeen が立ち、(0f) の母集団が消える)。⭐ 盤の反対側の端を選ぶ。 */
      const farX = (ptx < mapW / 2) ? (mapW - 3) : 2;
      const plan = [
        { key: 'rat', tx: ptx + 2, ty: pty, mode: 'visible' },            // 最小 = (0h) の母集団
        { key: 'goblin', tx: ptx + 3, ty: pty + 1, mode: 'visible' },
        { key: 'hobgoblin', tx: ptx + 4, ty: pty - 1, mode: 'visible' },  // badge 持ち = (0e)
        { key: 'goblin', tx: farX, ty: pty, mode: 'fog' },                // (0f)
        { key: 'hydra', tx: ptx + 6, ty: pty + 3, mode: 'sealed' },       // (1e)
        { key: 'kobold', tx: ptx + 2, ty: pty + 2, mode: 'dead' },        // (1d)
      ];
      for (const p of plan) {
        if (!ENEMY_TYPES[p.key]) { out.fixture.err = '未知の敵キー ' + p.key; break; }
        const idx = enemies.length;
        const e = createEnemy(p.key, p.tx, p.ty);
        if (p.mode === 'visible') { e.everSeen = true; e.state = 'idle'; }
        else if (p.mode === 'fog') { e.everSeen = false; e.state = 'idle'; }
        else if (p.mode === 'sealed') { e.everSeen = true; e.inactive = true; }
        else if (p.mode === 'dead') { e.everSeen = true; e.alive = false; }
        enemies.push(e);
        createEnemyDom(idx, e.def, p.key);
        out.fixture.made.push({ idx: idx, key: p.key, mode: p.mode });
      }
      out.fixture.ok = !out.fixture.err && out.fixture.made.length === plan.length;
    } catch (err) { out.fixture.err = String((err && err.message) || err); }

    // ── 本番の描画ループを 1 回通す ──────────────────────────────────────────
    try { updatePositions(); out.fixture.renderOk = true; }
    catch (err) { out.fixture.renderErr = String((err && err.message) || err); }

    // ── 観測 ────────────────────────────────────────────────────────────────
    const labels = safe(() => (typeof window.__enemyLabels === 'function') ? window.__enemyLabels() : null, null);
    out.seamTypes = {
      enemyLabels: typeof window.__enemyLabels,
      nameLabelOn: typeof window.__nameLabelOn,
    };
    out.nameLabelOn = safe(() => window.__nameLabelOn(), null);
    out.labelArrayLen = Array.isArray(labels) ? labels.length : null;
    out.enemyCount = enemies.length;
    out.bodyHasLabelSmall = document.body.classList.contains('labelSmall');
    out.enemyTypeKeyCount = safe(() => Object.keys(ENEMY_TYPES).length, null);
    out.scenarioId = safe(() => sessionStorage.getItem('dragonfighters.currentScenario'), null);
    out.enemyLabelDomCount = document.querySelectorAll('.enemyLabel').length;
    out.enemyStatusSlotDomCount = document.querySelectorAll('.enemy-status-slot').length;

    /* 敵 1 体ぶんの生の観測。⛔ ここでは判定しない (assert 側が突き合わせる)。 */
    out.enemies = enemies.map((e, i) => {
      const lb = (labels && labels[i]) || null;
      const el = document.getElementById('enemy' + i);
      const hp = document.getElementById('hpBar' + i);
      const bd = document.getElementById('enemyBadge' + i);
      const st = document.getElementById('enemyStatus' + i);
      const dispOf = (x) => x ? (x.style.display || '') : null;
      const protectedNpc = !!(e.inactive || e.passiveNpc || (e.def && e.def.isNpcSpirit));
      return {
        i: i,
        type: e.type,
        name: (e.def && e.def.name) || null,
        size: (e.def && e.def.displaySize) || null,   /* [0g-data] データとしての参照。箱は rectOf で採る */
        alive: !!e.alive,
        inactive: !!e.inactive,
        isHydra: !!(e.def && e.def.isHydra),
        everSeen: !!e.everSeen,
        state: e.state || null,
        hasBadge: !!(e.def && e.def.badge),
        protectedNpc: protectedNpc,
        labelPresent: !!lb,
        labelDisplay: dispOf(lb),
        labelText: lb ? (lb.textContent || '') : null,
        labelNameText: (lb && lb.firstChild) ? (lb.firstChild.textContent || '') : null,
        labelBg: lb ? getComputedStyle(lb).backgroundColor : null,
        statusIsChildOfLabel: !!(lb && st && lb.contains(st)),
        spriteDisplay: dispOf(el),
        badgeDisplay: dispOf(bd),
        rectLabel: rectOf(lb),
        rectSprite: rectOf(el),
        rectHp: rectOf(hp),
        rectBadge: rectOf(bd),
        /* ⭐ 項目 2 が足した観測。(2e) 用 — 撤退アームには敵の札が 1 枚も無いので、
           **同じ dy に置かれる状態アイコン列**が唯一の対照になる (§5-3 の else 枝)。 */
        rectStatus: rectOf(st),
        statusDisplay: dispOf(st),
        statusClass: st ? st.className : null,
      };
    });

    /* 味方側 (§2 の対照で使う)。⛔ 項目 1 では判定しない = 記録だけ。 */
    const heroLabel = document.getElementById('warriorLabel');
    out.heroLabel = { present: !!heroLabel, rect: rectOf(heroLabel),
      bg: heroLabel ? getComputedStyle(heroLabel).backgroundColor : null };
    /* ⭐ 項目 2 が足した観測。(2b) の 2 本目の条件 = **名前テキストそのものの幅**。
       ⚠ 札の箱の幅には「縮まない固定費」が乗る (下の W_BOX_RATIO_* のコメント参照) ので、
         文字数に依存しない測定点として名前 span を併置する。 */
    const heroName = document.getElementById('warriorName');
    out.heroName = { present: !!heroName, rect: rectOf(heroName),
      text: heroName ? (heroName.textContent || '') : null };
    const allyLabels = Array.prototype.slice.call(document.querySelectorAll('.allyLabel'))
      .filter(x => x.id !== 'warriorLabel');
    out.allyLabels = allyLabels.map(x => ({ rect: rectOf(x), bg: getComputedStyle(x).backgroundColor }));

    /* ⭐ 項目 3 が足した観測 — §3 恒等 (3a)(3b) / §4 (4b) の**味方側**。
       主人公は #player (スプライト) と #warriorHpBar (HP バー) の 2 枚。
       ⚠ NPC 仲間 (#ally<i> / #allyHpBar<i>) は**顔ぶれが毎回ランダム**なので、
         恒等の対照に使えるのは「両アームで同じ添字が同じ職を指したとき」だけ。
         判定は assert 側で行い、ここでは職キーを添えて生のまま返す。 */
    const playerEl = document.getElementById('player');
    const warriorHp = document.getElementById('warriorHpBar');
    out.player = {
      rectSprite: rectOf(playerEl), rectHp: rectOf(warriorHp),
      spriteDisplay: dsp(playerEl), hpDisplay: dsp(warriorHp),
    };
    out.allies = safe(() => allies.map((a, i) => {
      const ae = document.getElementById('ally' + i);
      const ah = document.getElementById('allyHpBar' + i);
      return { i: i, classKey: a.classKey || null, isHero: !!a.isHero, alive: !!a.alive,
               rectSprite: rectOf(ae), rectHp: rectOf(ah),
               spriteDisplay: dsp(ae), hpDisplay: dsp(ah) };
    }), []);

    out.rectCount = VIA['getBoundingClientRect'] || 0;
    out.rectVia = Object.keys(VIA);
    return out;
  }, 72);

  await page.close();
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * (3d) 「部屋を 1 つ跨いだあと」の観測 — ⭐ **別ページで撮る**
 *   ⚠ 既存の measure() は 1 部屋しか見ておらず、clearNodeArrays を一度も通らない。
 *     ⇒ ここだけは本番の撤去点 resetNodeState() と構築点 buildNode() を実際に通す
 *     (index.html の enterNode() が跨ぐときに呼ぶのと**同じ 2 本**。dev シーム
 *      ?renode=N の中身も `resetNodeState(); buildNode(null);` そのもの)。
 *   ⛔ 本体の measure() の中でやらない — 盤面を作り直すと §0〜§2 の母集団が全部消える。
 *   ⭐ 跨ぐ前に敵を 2 体足しておく = 「clearNodeArrays に掃除すべき中身があった」を保証する
 *     (⚠ 掃除対象が空の状態で測ると `0 === 0` で永久緑になる)。
 * ══════════════════════════════════════════════════════════════════════════════ */
async function measureRoomCross(browser, port, errs) {
  const page = await browser.newPage();
  const tag = '[:' + port + ' roomCross] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.evaluateOnNewDocument((k, v) => {
    try { sessionStorage.setItem(k, v); } catch (e) {}
  }, SCENARIO_KEY, SCENARIO_ID);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(pageUrl(port, ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof createEnemy === 'function' && typeof createEnemyDom === 'function'
      && typeof updatePositions === 'function' && typeof resetNodeState === 'function'
      && typeof buildNode === 'function' && typeof enemies !== 'undefined',
    { timeout: 25000 });
  await settle(page);

  const r = await page.evaluate(() => {
    const out = { seeded: 0, seedErr: null, crossed: false, crossErr: null, before: null, after: null };
    /* ⭐ 添字並列の配列 11 本の長さを**記録として**採る (判定は enemies との一致で行う)。
       ⚠ ここは「どこがズレたか」を人が読むための detail 用。⛔ この表を判定に使わない
       (12 本目が足された日に静かに取りこぼすので、判定は下の 2 条件だけに寄せてある)。 */
    const snap = () => {
      const labels = (typeof window.__enemyLabels === 'function') ? window.__enemyLabels() : null;
      const lens = {};
      const len = (k, a) => { try { lens[k] = a.length; } catch (e) { lens[k] = null; } };
      len('enemyElements', enemyElements); len('hpBarElements', hpBarElements);
      len('hpFillElements', hpFillElements); len('hitSparkElements', hitSparkElements);
      len('coinElements', coinElements); len('weaponDropElements', weaponDropElements);
      len('armorDropElements', armorDropElements); len('alertMarkElements', alertMarkElements);
      len('enemyBadgeElements', enemyBadgeElements); len('enemyStatusElements', enemyStatusElements);
      lens.enemyLabelElements = Array.isArray(labels) ? labels.length : null;
      return {
        enemies: enemies.length,
        labelArrayLen: Array.isArray(labels) ? labels.length : null,
        labelDom: document.querySelectorAll('.enemyLabel').length,
        statusSlotDom: document.querySelectorAll('.enemy-status-slot').length,
        enemySpriteDom: document.querySelectorAll('.enemy').length,
        arrays: lens,
      };
    };
    try {
      const tx = Math.floor(playerX / TILE_SIZE), ty = Math.floor(playerY / TILE_SIZE);
      const plan = [{ k: 'goblin', dx: 2, dy: 0 }, { k: 'hobgoblin', dx: 3, dy: 1 }];
      for (const p of plan) {
        if (!ENEMY_TYPES[p.k]) { out.seedErr = '未知の敵キー ' + p.k; break; }
        const idx = enemies.length;
        const e = createEnemy(p.k, tx + p.dx, ty + p.dy);
        e.everSeen = true; e.state = 'idle';
        enemies.push(e);
        createEnemyDom(idx, e.def, p.k);
        out.seeded++;
      }
      updatePositions();
    } catch (err) { out.seedErr = String((err && err.message) || err); }
    out.before = snap();
    /* ── 本番の「部屋を跨ぐ」2 本を実際に通す ── */
    try { resetNodeState(); buildNode(null); updatePositions(); out.crossed = true; }
    catch (err) { out.crossErr = String((err && err.message) || err); }
    out.after = snap();
    return out;
  });

  await page.close();
  return r;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
/* 母集団の導出はここに 1 箇所だけ置く。⛔ assert ごとに数え直さない
   (数え方が 2 通りになると (0a) と (1a) が別の母集団を見て静かにズレる)。 */
function popVisible(m) {
  return (m.enemies || []).filter(e => e.alive && e.labelPresent && e.labelDisplay !== 'none');
}
function popBadge(m) {
  return popVisible(m).filter(e => e.hasBadge && e.badgeDisplay !== 'none');
}
function popFog(m) {
  return (m.enemies || []).filter(e => e.alive && !e.everSeen && e.state === 'idle'
    && !e.protectedNpc && e.spriteDisplay === 'none');
}
/* ⭐⭐⭐ 項目 2 が足した母集団 — **スプライト経路**で「画面に出ている生存敵」を数える。
 *  ⚠⚠⚠ popVisible は **札の有無**で数えているので、(1a)「見えている生存敵**すべて**に
 *    札がある」をそれで測ると**循環する**: 札を作らない実装では母集団からも消えるので、
 *    「札が無い敵」が 1 体も残らず永久緑になる。
 *  ⇒ (1a)(1b)(1f)(1g) の母集団はこちら (敵の絵が画面に出ているか) を使い、
 *    **2 通りの数え方が一致すること**を (1a) の中で併せて見る。 */
function popOnScreen(m) {
  return (m.enemies || []).filter(e => e.alive && e.spriteDisplay !== 'none');
}
/* (1d) の母集団 = 倒した敵。 */
function popDead(m) {
  return (m.enemies || []).filter(e => !e.alive);
}
/* (1e) の母集団 = 封印中のハイドラ。 */
function popSealed(m) {
  return (m.enemies || []).filter(e => e.isHydra && e.inactive);
}
/* (0h) と (2f) が **同じ 1 体**を指すための導出。⛔ 2 箇所で数え直さない
 *  (数え方が 2 通りになると「(0h) は rat を見て (2f) は hobgoblin を見る」が静かに起きる)。 */
function smallestVisible(m) {
  let min = null;
  for (const e of popVisible(m)) {
    if (!isFiniteNum(e.size)) continue;                  /* [0g-data] 名簿の数値をデータとして読むだけ */
    if (min === null || e.size < min.size) min = e;      /* [0g-data] 同上。箱は rectOf で採る */
  }
  return min;
}

const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', '[母集団] ダンジョンが起動し、**見えている生存中の敵が ' + POP_MIN + ' 体以上**居る'
    + ' (⚠ かつ (0a)(0e)(0f) の母集団が全部同じ 1 体でない)'
    + ' ⭐⭐⭐ これが無いと §1 の全 assert が空振りで永久緑になる',
    m => {
      if (!m.fixture || !m.fixture.ok) {
        return popFail('母集団の仕込み', 'createEnemy/createEnemyDom が通らなかった: '
          + (m.fixture && m.fixture.err) + '  made=' + JSON.stringify(m.fixture && m.fixture.made));
      }
      if (!m.fixture.renderOk) {
        return popFail('描画', 'updatePositions() が例外で落ちた: ' + m.fixture.renderErr);
      }
      const vis = popVisible(m), bdg = popBadge(m), fog = popFog(m);
      /* ⚠ 依頼書 §8 の ⚠ = 3 つの母集団が全部同じ 1 体にならないこと。
         ⭐ 「別々の敵が居る」を **相異なる添字の総数**で数える。 */
      const idx = {};
      for (const e of vis.concat(bdg, fog)) idx[e.i] = true;
      const distinct = Object.keys(idx).length;
      const ok = vis.length >= POP_MIN && distinct >= POP_DISTINCT_MIN;
      return [ok,
        '見えている生存敵 ' + vis.length + ' 体 ' + JSON.stringify(vis.map(e => e.type))
        + '  / (0a)+(0e)+(0f) の相異なる敵 ' + distinct + ' 体 (下限 ' + POP_DISTINCT_MIN + ')'
        + '  / 仕込み ' + JSON.stringify(m.fixture.made.map(x => x.key + ':' + x.mode))
        + (ok ? '' : '  ⛔ ' + (vis.length < POP_MIN ? '見えている敵が居ない' : '母集団が同じ敵に偏っている'))];
    }],

  ['0b', '[2 経路] 敵名の表を**写経していない** — 配信バイト (GET /index.html) の ENEMY_TYPES'
    + ' から抜いた name の集合と、ページの Object.keys(ENEMY_TYPES).length が一致する'
    + ' ⭐ 件数そのものは期待値に持たない (⚠ 依頼書 §2-8 の「46 種」は起草時の数え違いで実測 50 種)',
    m => {
      const r = m.roster;
      if (!r || !r.ok) return [false, '⛔ 配信バイトから ENEMY_TYPES を切り出せない: ' + (r && r.err)];
      const nNames = r.names.length, nKeys = r.keys.length, nPage = m.enemyTypeKeyCount;
      const uniq = {};
      for (const s of r.names) uniq[s] = true;
      const dup = nNames - Object.keys(uniq).length;
      const ok = nNames > 0 && nNames === nKeys && nNames === nPage;
      return [ok,
        '配信バイト: name ' + nNames + ' 件 / top-level キー ' + nKeys + ' 件'
        + '  ページ: Object.keys(ENEMY_TYPES) ' + nPage + ' 件'
        + '  (同名の重複 ' + dup + ' 件 / 切り出した ' + r.bytes + 'B)'
        + '  例: ' + JSON.stringify(r.names.slice(0, 3))
        + (ok ? '' : '  ⛔ 3 つの数が一致しない = 抜き方かページのどちらかが壊れている')];
    }],

  ['0c', "[装置] 素の起動で document.body.classList.contains('labelSmall') === true"
    + ' (= 70% の上書きが効く状態になっている)',
    m => {
      const ok = m.bodyHasLabelSmall === true && m.nameLabelOn === true;
      return [ok,
        'body.labelSmall=' + JSON.stringify(m.bodyHasLabelSmall)
        + '  __nameLabelOn()=' + JSON.stringify(m.nameLabelOn) + ' (' + m.seamTypes.nameLabelOn + ')'
        + (ok ? '' : '  ⛔ 素のアームで 70% が効いていない')];
    }],

  ['0d', '[装置] window.__enemyLabels() の長さ === enemies.length'
    + ' (⚠⚠⚠ 添字並列が崩れていない = 撤退時の push(null) を含めて 11 本目が揃っている)',
    m => {
      const fnOk = m.seamTypes.enemyLabels === 'function';
      const ok = fnOk && isFiniteNum(m.labelArrayLen) && m.labelArrayLen === m.enemyCount;
      return [ok,
        '__enemyLabels() の長さ ' + JSON.stringify(m.labelArrayLen)
        + ' / enemies.length ' + m.enemyCount
        + '  (シームの型 ' + m.seamTypes.enemyLabels + ')'
        + '  .enemyLabel の DOM 総数 ' + m.enemyLabelDomCount
        + (ok ? '' : '  ⛔ 添字並列が崩れている (別の敵の札を指す)')];
    }],

  ['0e', '[母集団] **バッジを持つ敵**が ' + POP_MIN + ' 体以上見えている ((1h) の母集団)',
    m => {
      const bdg = popBadge(m);
      if (bdg.length < POP_MIN) {
        return popFail('(0e) バッジ持ちの敵',
          '見えている生存敵 ' + popVisible(m).length + ' 体のうち badge 持ちは ' + bdg.length + ' 体  '
          + JSON.stringify(popVisible(m).map(e => e.type + ':' + e.hasBadge + ':' + e.badgeDisplay)));
      }
      return [true, 'バッジを持つ見えている敵 ' + bdg.length + ' 体 '
        + JSON.stringify(bdg.map(e => e.type))
        + '  (badge の display=' + JSON.stringify(bdg.map(e => e.badgeDisplay)) + ')'];
    }],

  ['0f', '[母集団] **伏兵化フォグで隠れている敵**が ' + POP_MIN + ' 体以上居る ((1c) の母集団)',
    m => {
      const fog = popFog(m);
      if (fog.length < POP_MIN) {
        return popFail('(0f) 伏兵化フォグの敵',
          'alive && !everSeen && state==="idle" && !protectedNpc && スプライトが none の敵が 0 体'
          + '  (全敵の everSeen=' + JSON.stringify((m.enemies || []).map(e => e.type + ':' + e.everSeen)) + ')');
      }
      return [true, 'フォグで隠れている敵 ' + fog.length + ' 体 ' + JSON.stringify(fog.map(e => e.type))
        + '  (札の display=' + JSON.stringify(fog.map(e => e.labelDisplay)) + ')'];
    }],

  ['0g', '[宣言] **ドライバが敵の箱を寸法データから計算していない** — 位置・寸法はすべて'
    + ' getBoundingClientRect 由来で、実装の置き位置の式も写経していない'
    + ' ⭐⭐⭐ 次の窓が善意で計算経路へ書き換えると永久緑になるのを防ぐ (依頼書 §2-11(a))',
    m => {
      const s = m.selfScan;
      if (!s || !s.ok) return [false, '⛔ ドライバ自身を検査できない: ' + (s && s.err)];
      const viaOk = Array.isArray(m.rectVia) && m.rectVia.length === 1
        && m.rectVia[0] === RECT_VIA_WANT && m.rectCount > 0;
      const ok = s.bad.length === 0 && s.forbidden.length === 0 && viaOk;
      return [ok,
        '採った矩形 ' + m.rectCount + ' 枚 / 由来 ' + JSON.stringify(m.rectVia)
        + '  ドライバ本体で寸法データ語に触れた行 ' + s.touched + ' 行 (すべて ' + SELF_MARK + ' 付き: '
        + (s.bad.length === 0 ? 'はい' : 'いいえ') + ')'
        + '  写経禁止語の混入 ' + JSON.stringify(s.forbidden)
        + (s.bad.length ? '  ⛔ 印の無い行: ' + s.bad.slice(0, 4).join(' | ') : '')
        + (viaOk ? '' : '  ⛔ 矩形の由来が getBoundingClientRect 一本でない')];
    }],

  ['0h', '[母集団] **見えている敵のうち最小のものが ' + SMALL_MAX + ' 以下**'
    + ' ((2f) の母集団。⚠⚠⚠ 立たなければ (0h) 自身と (2f) の**両方**を FAIL にする)',
    m => {
      const vis = popVisible(m);
      if (vis.length < POP_MIN) {
        return popFail('(0h) 見えている敵', '(0a) が立っていないので最小値を採れない');
      }
      /* ⭐ 導出は smallestVisible() の 1 箇所だけ ((2f) と必ず同じ 1 体を指すため)。 */
      const min = smallestVisible(m);
      if (min === null) return popFail('(0h) 敵の寸法', '見えている敵から数値の寸法を採れなかった');
      const roster = (m.roster && m.roster.ok) ? m.roster.sizes : [];
      const rosterMin = roster.length ? Math.min.apply(null, roster) : null;
      const ok = min.size <= SMALL_MAX;
      /* ⭐ detail に 3 つを必ず出す (閾値の意味を後から追える形にする)。
         ⚠ 閾値 0.30 ((2f) 側) は**モンスター名簿に依存している**。rosterMin より小さい敵が
           将来追加されると比が上がって (2f) は厳しくなる — それは正しい挙動だが、
           依存していること自体を記録に残す。 */
      return [ok,
        'booted シナリオ=' + JSON.stringify(m.scenarioId)
        + '  minEnemyKey=' + JSON.stringify(min.type)
        + '  minDisplaySize=' + min.size                     /* [0g-data] 記録に出す実測値 */
        + '  rosterMin=' + JSON.stringify(rosterMin) + ' (名簿 ' + roster.length + ' 件の最小)'
        + '  見えている敵の寸法 ' + JSON.stringify(vis.map(e => e.type + ':' + e.size))
        + (ok ? '' : '  ⛔ 最小の敵が ' + SMALL_MAX + ' より大きい = (2f) は自明に緑になるので測れない')];
    }],

  // ── §1 敵の札 ──────────────────────────────────────────────────────────────
  ['1a', '見えている生存敵**すべて**に札があり、テキストが enemies[i].def.name と一致'
    + ' (DOM 経路 × ページのデータ経路)'
    + ' ⭐ 母集団は**スプライト経路** — 札の有無で数えると循環して永久緑になる',
    m => {
      const shown = popOnScreen(m);
      if (shown.length < POP_MIN) {
        return popFail('(1a) 画面に出ている生存敵',
          'スプライトが display:none でない生存敵が 0 体  '
          + JSON.stringify((m.enemies || []).map(e => e.type + ':alive=' + e.alive
            + ':sprite=' + JSON.stringify(e.spriteDisplay))));
      }
      const noLabel = shown.filter(e => !(e.labelPresent && e.labelDisplay !== 'none'));
      const wrongText = shown.filter(e => e.labelPresent && e.labelNameText !== e.name);
      /* ⭐ 2 通りの数え方 (スプライト経路 / 札経路) が一致することも同じ assert で見る。
         ⚠ 一致しない = どちらかの母集団が静かにズレている。 */
      const byLabel = popVisible(m).length;
      const agree = shown.length === byLabel;
      const ok = noLabel.length === 0 && wrongText.length === 0 && agree;
      return [ok,
        '画面に出ている生存敵 ' + shown.length + ' 体 '
        + JSON.stringify(shown.map(e => e.type + '=' + (e.labelNameText === null ? 'なし' : e.labelNameText)))
        + '  / 札経路の母集団 ' + byLabel + ' 体 (一致: ' + (agree ? 'はい' : '⛔ いいえ') + ')'
        + (noLabel.length ? '  ⛔ 札が無い/隠れている: '
            + JSON.stringify(noLabel.map(e => e.type + ':present=' + e.labelPresent
              + ':display=' + JSON.stringify(e.labelDisplay))) : '')
        + (wrongText.length ? '  ⛔ 名前が def.name と違う: '
            + JSON.stringify(wrongText.map(e => e.labelNameText + ' ≠ ' + e.name)) : '')];
    }],

  ['1b', 'その札のテキストが (0b) の**配信バイト由来の名前集合**に含まれる'
    + ' (⭐ 2 経路目。実装が def.name でなく type キーを書いていたらここで落ちる)',
    m => {
      const r = m.roster;
      if (!r || !r.ok || !r.names.length) {
        return popFail('(0b) 配信バイト由来の名前集合',
          '切り出せなかった: ' + (r && r.err) + ' / 件数 ' + (r && r.names ? r.names.length : 'なし'));
      }
      const shown = popOnScreen(m);
      if (shown.length < POP_MIN) {
        return popFail('(1a) 画面に出ている生存敵', 'スプライトが出ている生存敵が 0 体');
      }
      const set = {};
      for (const s of r.names) set[s] = true;
      const bad = shown.filter(e => !(typeof e.labelNameText === 'string'
        && e.labelNameText.length > 0 && set[e.labelNameText] === true));
      const ok = bad.length === 0;
      return [ok,
        '配信バイトの名前 ' + r.names.length + ' 件と突き合わせた札 ' + shown.length + ' 枚 '
        + JSON.stringify(shown.map(e => e.labelNameText))
        + (ok ? '' : '  ⛔ 名前集合に無い (type キーを書いている疑い): '
            + JSON.stringify(bad.map(e => e.type + '→' + JSON.stringify(e.labelNameText))))];
    }],

  ['1c', '伏兵化フォグで隠れている敵の札は display:none (母集団 = (0f))'
    + ' ⭐ 札が伏兵の居場所を漏らさない',
    m => {
      const fog = popFog(m);
      if (fog.length < POP_MIN) {
        return popFail('(0f) 伏兵化フォグの敵',
          'alive && !everSeen && state==="idle" && スプライトが none の敵が 0 体');
      }
      const bad = fog.filter(e => !(e.labelPresent && e.labelDisplay === 'none'));
      const ok = bad.length === 0;
      return [ok,
        'フォグの敵 ' + fog.length + ' 体 '
        + JSON.stringify(fog.map(e => e.type + ':' + JSON.stringify(e.labelDisplay)))
        + (ok ? '' : '  ⛔ 札が漏れている: '
            + JSON.stringify(bad.map(e => e.type + ':present=' + e.labelPresent
              + ':display=' + JSON.stringify(e.labelDisplay))))];
    }],

  ['1d', '倒した敵の札は display:none (⭐ 名前が床に残らない)',
    m => {
      const dead = popDead(m);
      if (dead.length < POP_MIN) {
        return popFail('(1d) 倒した敵',
          'alive === false の敵が 0 体  '
          + JSON.stringify((m.enemies || []).map(e => e.type + ':alive=' + e.alive)));
      }
      const bad = dead.filter(e => !(e.labelPresent && e.labelDisplay === 'none'));
      const ok = bad.length === 0;
      return [ok,
        '倒した敵 ' + dead.length + ' 体 '
        + JSON.stringify(dead.map(e => e.type + ':' + JSON.stringify(e.labelDisplay)))
        + (ok ? '' : '  ⛔ 札が残っている: '
            + JSON.stringify(bad.map(e => e.type + ':' + JSON.stringify(e.labelDisplay))))];
    }],

  ['1e', '封印中のハイドラの札は出ない (⭐ 祭壇だけの見た目が壊れない)',
    m => {
      const sealed = popSealed(m);
      if (sealed.length < POP_MIN) {
        return popFail('(1e) 封印中のハイドラ',
          'isHydra && inactive の敵が 0 体  '
          + JSON.stringify((m.enemies || []).map(e => e.type + ':hydra=' + e.isHydra
            + ':inactive=' + e.inactive)));
      }
      const bad = sealed.filter(e => !(e.labelPresent && e.labelDisplay === 'none'));
      const ok = bad.length === 0;
      return [ok,
        '封印中のハイドラ ' + sealed.length + ' 体 '
        + JSON.stringify(sealed.map(e => e.type + ':' + JSON.stringify(e.labelDisplay)))
        + (ok ? '' : '  ⛔ 札が出ている: '
            + JSON.stringify(bad.map(e => e.type + ':' + JSON.stringify(e.labelDisplay))))];
    }],

  ['1f', '札の下端が HP バーの上端より**上**: label.bottom <= hpBar.top + ' + TOUCH_PX
    + ' (⭐ 味方は元から 2px 食い込んでいたが、敵は新規なので最初から正しくできる)',
    m => {
      const rows = popOnScreen(m).filter(e => e.rectLabel && e.rectHp
        && e.rectLabel.h > 0 && e.rectHp.h > 0);
      if (rows.length < POP_MIN) {
        return popFail('(1f) 札と HP バーが両方出ている敵',
          '画面に出ている生存敵 ' + popOnScreen(m).length + ' 体のうち、札と HP バーの矩形が'
          + '両方 0 でないものが 0 体');
      }
      const bad = rows.filter(e => !(e.rectLabel.bottom <= e.rectHp.top + TOUCH_PX));
      const ok = bad.length === 0;
      return [ok,
        rows.length + ' 体の「HP バー上端 - 札下端」= '
        + JSON.stringify(rows.map(e => e.type + ':'
          + (e.rectHp.top - e.rectLabel.bottom).toFixed(2) + 'px'))
        + '  (正の値 = 札が上にある)'
        + (ok ? '' : '  ⛔ 食い込んでいる: ' + JSON.stringify(bad.map(e => e.type)))];
    }],

  ['1g', '状態アイコン列が札の**子**:'
    + " labelEl.contains(document.getElementById('enemyStatus'+i))"
    + ' (⭐ 味方と同じ 2 段構成。独立配置のままだとバッジと 9px 重なる = §2-5 罠B)',
    m => {
      const shown = popOnScreen(m);
      if (shown.length < POP_MIN) {
        return popFail('(1a) 画面に出ている生存敵', 'スプライトが出ている生存敵が 0 体');
      }
      const bad = shown.filter(e => !e.statusIsChildOfLabel);
      const ok = bad.length === 0;
      return [ok,
        shown.length + ' 体 '
        + JSON.stringify(shown.map(e => e.type + ':child=' + e.statusIsChildOfLabel
          + ':class=' + JSON.stringify(e.statusClass)))
        + '  (.enemy-status-slot の DOM 総数 ' + m.enemyStatusSlotDomCount + ')'
        + (ok ? '' : '  ⛔ 札の子になっていない: ' + JSON.stringify(bad.map(e => e.type)))];
    }],

  ['1h', '装備バッジの矩形と札の矩形が**交差しない** (母集団 = (0e))'
    + ' ⛔ 中心 1 点や上端 1 点では取りこぼすので、矩形の交差で測る',
    m => {
      const bdg = popBadge(m).filter(e => e.rectBadge && e.rectLabel
        && e.rectBadge.h > 0 && e.rectLabel.h > 0);
      if (bdg.length < POP_MIN) {
        return popFail('(0e) バッジ持ちの敵',
          '見えている生存敵 ' + popVisible(m).length + ' 体のうち、バッジと札の矩形が'
          + '両方 0 でないものが 0 体  '
          + JSON.stringify(popVisible(m).map(e => e.type + ':badge=' + e.hasBadge)));
      }
      const bad = bdg.filter(e => overlaps(e.rectBadge, e.rectLabel));
      const ok = bad.length === 0;
      return [ok,
        'バッジ持ち ' + bdg.length + ' 体の「札上端 - バッジ下端」= '
        + JSON.stringify(bdg.map(e => e.type + ':'
          + (e.rectLabel.top - e.rectBadge.bottom).toFixed(2) + 'px'))
        + '  (正の値 = バッジが札より上で離れている)'
        + (ok ? '' : '  ⛔ 交差している: ' + JSON.stringify(bad.map(e => e.type
            + ' badge=' + JSON.stringify([e.rectBadge.top, e.rectBadge.bottom])
            + ' label=' + JSON.stringify([e.rectLabel.top, e.rectLabel.bottom]))))];
    }],

  // ── §2 70% ────────────────────────────────────────────────────────────────
  ['2a', '味方の札の**高さ**が ' + RETREAT_QUERY + ' の同じ札の '
    + H_RATIO_MIN + '〜' + H_RATIO_MAX + ' 倍'
    + ' (⭐ 絶対 px を書かない。対照は同じドライバの中で両方開いて採る)',
    m => {
      const p = refPair(m, x => (x.heroLabel && x.heroLabel.rect) || null);
      if (!p) {
        return popFail('(2a) 撤退アームの対照',
          RETREAT_QUERY + ' 側の主人公の札を採れなかった (ref=' + (m.ref ? 'あり' : 'なし') + ')');
      }
      if (!(p.off.h > 0)) return popFail('(2a) 撤退アームの対照', '撤退アームの札の高さが 0');
      const r = p.on.h / p.off.h;
      const ok = r >= H_RATIO_MIN && r <= H_RATIO_MAX;
      return [ok,
        '素 ' + p.on.h.toFixed(2) + 'px / 撤退 ' + p.off.h.toFixed(2) + 'px = ' + r.toFixed(4)
        + '  (帯 ' + H_RATIO_MIN + '〜' + H_RATIO_MAX + ')'
        + (ok ? '' : '  ⛔ 帯の外')];
    }],

  ['2b', '味方の札の**幅**が ' + RETREAT_QUERY + ' の同じ札の '
    + W_BOX_RATIO_MIN + '〜' + W_BOX_RATIO_MAX + ' 倍、**かつ**名前テキストそのものの幅が '
    + W_TEXT_RATIO_MIN + '〜' + W_TEXT_RATIO_MAX + ' 倍'
    + ' (⭐ 箱の比は縮まない固定費 6px のせいで文字数に依存する。テキストの比は依存しない'
    + ' — 依頼書の 1 本を 2 本の AND にしたので、帯を広げても検出力は落ちていない)',
    m => {
      const box = refPair(m, x => (x.heroLabel && x.heroLabel.rect) || null);
      const txt = refPair(m, x => (x.heroName && x.heroName.rect) || null);
      if (!box || !txt) {
        return popFail('(2b) 撤退アームの対照',
          '箱=' + (box ? 'あり' : 'なし') + ' / 名前テキスト=' + (txt ? 'あり' : 'なし')
          + ' (ref=' + (m.ref ? 'あり' : 'なし') + ')');
      }
      if (!(box.off.w > 0) || !(txt.off.w > 0)) {
        return popFail('(2b) 撤退アームの対照',
          '撤退アームの幅が 0 (箱 ' + box.off.w + ' / テキスト ' + txt.off.w + ')');
      }
      const rb = box.on.w / box.off.w;
      const rt = txt.on.w / txt.off.w;
      const okB = rb >= W_BOX_RATIO_MIN && rb <= W_BOX_RATIO_MAX;
      const okT = rt >= W_TEXT_RATIO_MIN && rt <= W_TEXT_RATIO_MAX;
      const ok = okB && okT;
      return [ok,
        '箱 ' + box.on.w.toFixed(2) + '/' + box.off.w.toFixed(2) + ' = ' + rb.toFixed(4)
        + ' (帯 ' + W_BOX_RATIO_MIN + '〜' + W_BOX_RATIO_MAX + ' ' + (okB ? 'OK' : '⛔') + ')'
        + '   テキスト ' + txt.on.w.toFixed(2) + '/' + txt.off.w.toFixed(2) + ' = ' + rt.toFixed(4)
        + ' (帯 ' + W_TEXT_RATIO_MIN + '〜' + W_TEXT_RATIO_MAX + ' ' + (okT ? 'OK' : '⛔') + ')'
        + '   [記録] 縮まない固定費 = 箱 - テキスト: 素 '
        + (box.on.w - txt.on.w).toFixed(2) + 'px / 撤退 ' + (box.off.w - txt.off.w).toFixed(2) + 'px'];
    }],

  ['2c', '主人公 #warriorLabel / NPC 仲間 .allyLabel / 敵 .enemyLabel の **3 種の高さが同じ**'
    + ' (±' + SAME_PX + 'px) ⭐「敵の札だけ 100% のまま」を捕まえる'
    + ' ⚠ 3 種が揃わなければ比べられないので母集団ごと FAIL にする',
    m => {
      const hero = (m.heroLabel && m.heroLabel.rect && m.heroLabel.rect.h > 0)
        ? m.heroLabel.rect.h : null;
      const npc = (m.allyLabels || []).filter(a => a.rect && a.rect.h > 0).map(a => a.rect.h);
      const en = popOnScreen(m).filter(e => e.rectLabel && e.rectLabel.h > 0)
        .map(e => e.rectLabel.h);
      if (hero === null || npc.length === 0 || en.length === 0) {
        return popFail('(2c) 3 種の札',
          '主人公=' + (hero === null ? 'なし' : hero.toFixed(2) + 'px')
          + ' / NPC 仲間 ' + npc.length + ' 枚 / 敵 ' + en.length + ' 枚 — 3 種が揃わないと比べられない');
      }
      const all = [hero].concat(npc, en);
      const spread = Math.max.apply(null, all) - Math.min.apply(null, all);
      const ok = spread <= SAME_PX;
      return [ok,
        '主人公 ' + hero.toFixed(2) + 'px / NPC 仲間 '
        + JSON.stringify(npc.map(v => +v.toFixed(2))) + ' / 敵 '
        + JSON.stringify(en.map(v => +v.toFixed(2)))
        + '  ばらつき ' + spread.toFixed(2) + 'px (許容 ' + SAME_PX + ')'
        + (ok ? '' : '  ⛔ どれかの札だけ大きさが違う')];
    }],

  ['2d', '敵の札が**自前の背景色を実際に持ち** (alpha > 0)、それが味方の札と**異なる**'
    + ' (⭐ §2-7 の .heroLabel 事故 = className だけ書いて CSS が 0 行、を捕まえる。'
    + ' ⚠⚠⚠「違う色」だけを見ると、CSS を丸ごと消して透明になった実装が緑で通る)',
    m => {
      const allyBg = (m.heroLabel && m.heroLabel.bg) || null;
      const shown = popOnScreen(m).filter(e => typeof e.labelBg === 'string' && e.labelBg.length > 0);
      if (!allyBg || shown.length < POP_MIN) {
        return popFail('(2d) 札の背景色',
          '味方の札の背景=' + JSON.stringify(allyBg) + ' / 背景色を採れた敵の札 ' + shown.length + ' 枚');
      }
      const allyA = bgAlpha(allyBg);
      if (!(allyA > 0)) {
        return popFail('(2d) 味方の札の背景色',
          '味方の札が透明 (' + JSON.stringify(allyBg) + ') なので「違う色」の対照にならない');
      }
      const noBg = shown.filter(e => !(bgAlpha(e.labelBg) > 0));
      const same = shown.filter(e => e.labelBg === allyBg);
      const ok = noBg.length === 0 && same.length === 0;
      return [ok,
        '味方 ' + JSON.stringify(allyBg) + ' (alpha ' + allyA + ')  敵 '
        + JSON.stringify(shown.map(e => e.labelBg).filter((v, i, a) => a.indexOf(v) === i))
        + (noBg.length ? '  ⛔ 背景色が無い (CSS が効いていない): '
            + JSON.stringify(noBg.map(e => e.type + ':' + JSON.stringify(e.labelBg))) : '')
        + (same.length ? '  ⛔ 味方と同じ色: ' + JSON.stringify(same.map(e => e.type)) : '')];
    }],

  ['2e', '札の**上端** (top) が ' + RETREAT_QUERY + ' と**同じ** (±' + SAME_PX + 'px)'
    + ' = 配置関数の dy を動かしていない'
    + ' ⭐ 敵の札は撤退アームに 1 枚も無いので、**同じ dy に置かれる状態アイコン列**を対照にする',
    m => {
      const hero = refPair(m, x => (x.heroLabel && x.heroLabel.rect) || null);
      if (!hero) {
        return popFail('(2e) 撤退アームの対照',
          '主人公の札を両アームで採れなかった (ref=' + (m.ref ? 'あり' : 'なし') + ')');
      }
      const dHero = Math.abs(hero.on.top - hero.off.top);
      const refRows = (m.ref && m.ref.enemies) || [];
      const pairs = [];
      for (const e of popOnScreen(m)) {
        const r = refRows[e.i];
        if (!r || r.type !== e.type) continue;              // ⚠ 添字がズレていたら比べない
        if (!e.rectLabel || !e.rectSprite || !r.rectStatus || !r.rectSprite) continue;
        if (!(e.rectLabel.h > 0) || !(e.rectSprite.h > 0) || !(r.rectSprite.h > 0)) continue;
        pairs.push({ t: e.type,
          on: e.rectLabel.top - e.rectSprite.top,
          off: r.rectStatus.top - r.rectSprite.top });
      }
      if (pairs.length < POP_MIN) {
        return popFail('(2e) 敵の dy の対照',
          '撤退アームの状態アイコン列と突き合わせられる敵が 0 体'
          + '  (素 ' + popOnScreen(m).length + ' 体 / 撤退アームの敵 ' + refRows.length + ' 体)');
      }
      const bad = pairs.filter(p => Math.abs(p.on - p.off) > SAME_PX);
      const ok = dHero <= SAME_PX && bad.length === 0;
      return [ok,
        '味方の札の上端 素 ' + hero.on.top.toFixed(2) + ' / 撤退 ' + hero.off.top.toFixed(2)
        + ' = 差 ' + dHero.toFixed(2) + 'px'
        + '   敵の dy (札上端 - スプライト上端) 素 vs 撤退の状態列: '
        + JSON.stringify(pairs.map(p => p.t + ':' + p.on.toFixed(2) + ' vs ' + p.off.toFixed(2)))
        + (ok ? '' : '  ⛔ '
            + (dHero > SAME_PX ? '味方の札の上端が動いた ' : '')
            + (bad.length ? '敵の dy が動いた: ' + JSON.stringify(bad.map(p => p.t
                + ' 差 ' + (p.on - p.off).toFixed(2) + 'px')) : ''))];
    }],

  ['2f', '⭐⭐⭐ **絶対量の歯止め** — 見えている最小の敵について'
    + ' 札の高さ ÷ その敵のスプライトの高さ <= ' + LABEL_VS_SPRITE_MAX + ' (母集団 = (0h))'
    + ' ⭐ ① 札 = CSS 由来 / ② スプライト = 敵の寸法データ由来 の**完全に独立した 2 経路**なので、'
    + ' (2a)(2b) の「比」をすり抜ける「素と 70% を同率で膨らませる」変更をここで落とせる',
    m => {
      const min = smallestVisible(m);
      if (min === null) {
        return popFail('(0h) 見えている最小の敵',
          '見えている敵から数値の寸法を採れなかった (見えている生存敵 ' + popVisible(m).length + ' 体)');
      }
      if (!(min.size <= SMALL_MAX)) {                       /* [0g-data] (0h) と同じ母集団の条件 */
        return popFail('(0h) 最小の敵が ' + SMALL_MAX + ' 以下',
          '最小は ' + min.type + ' = ' + min.size          /* [0g-data] 記録に出す実測値 */
          + ' — 大きい敵しか居ない場面で測ると (2f) は自明に緑になる');
      }
      const lab = min.rectLabel, spr = min.rectSprite;
      if (!lab || !spr || !(lab.h > 0) || !(spr.h > 0)) {
        return popFail('(2f) 最小の敵の矩形',
          '札の高さ ' + JSON.stringify(lab && lab.h) + ' / スプライトの高さ '
          + JSON.stringify(spr && spr.h) + ' — どちらかが 0 では比が採れない');
      }
      const ratio = lab.h / spr.h;
      const ok = ratio <= LABEL_VS_SPRITE_MAX;
      return [ok,
        '最小の敵 ' + min.type + ' — 札 ' + lab.h.toFixed(2) + 'px (CSS 由来) ÷ スプライト '
        + spr.h.toFixed(2) + 'px (寸法データ由来) = ' + ratio.toFixed(4)
        + '  (上限 ' + LABEL_VS_SPRITE_MAX + ')'
        + (ok ? '' : '  ⛔ 札が敵に対して大きすぎる = ユーザーが訴えた量そのもの')];
    }],

  // ── §3 恒等 (非退行) ───────────────────────────────────────────────────────
  /* ⭐⭐⭐ §3 の 3 本は「素のアーム vs 撤退アーム」の**恒等**。撤退アームが
   *   「#44 が入る前の見た目」の定義なので、ここが緑 = 「札とバッジ以外は 1px も
   *   動かしていない」の機械証明になる (依頼書 §1 のユーザー決定そのもの)。
   * ⚠⚠⚠ 恒等 assert は **片方のアームだけを壊す変更**でしか赤くならない。
   *   両アームを同じだけ動かす変異 (例: HP バーの dy を無条件に -12) は**空振りする**
   *   ので、変異は必ず撤退フラグで分岐させる形にすること (項目 4 への申し送り)。 */
  ['3a', 'HP バー (味方 #warriorHpBar / 敵 .enemyHpBar) の矩形が ' + RETREAT_QUERY
    + ' と**完全一致** (±' + SAME_RECT_PX + 'px)'
    + ' ⭐ 70% にしたのは札だけ = HP バー (52x8 / 60x10) は 1px も動いていないことの宣言',
    m => {
      const hero = refPair(m, x => (x.player && x.player.rectHp) || null);
      const rows = [];
      for (const e of popOnScreen(m)) {
        const r = refEnemy(m, e);
        if (!r || !e.rectHp || !r.rectHp || !(e.rectHp.h > 0) || !(r.rectHp.h > 0)) continue;
        rows.push({ t: e.type, d: rectDelta(e.rectHp, r.rectHp) });
      }
      const heroOk = !!hero && hero.on.h > 0 && hero.off.h > 0;
      if (!heroOk || rows.length < POP_MIN) {
        return popFail('(3a) 両アームで採れた HP バー',
          '主人公 #warriorHpBar = ' + (hero ? (hero.on.h.toFixed(2) + 'px / 撤退 '
            + hero.off.h.toFixed(2) + 'px') : 'どちらかのアームで採れず')
          + ' / 突き合わせられた敵 ' + rows.length + ' 体'
          + ' (素の画面上の敵 ' + popOnScreen(m).length + ' 体 / 撤退アームの敵 '
          + (((m.ref && m.ref.enemies) || []).length) + ' 体)');
      }
      const dHero = rectDelta(hero.on, hero.off);
      const bad = rows.filter(x => x.d > SAME_RECT_PX);
      const ok = dHero <= SAME_RECT_PX && bad.length === 0;
      return [ok,
        '主人公の HP バー 4 辺の最大ずれ ' + dHero.toFixed(2) + 'px'
        + '   敵 ' + rows.length + ' 体 '
        + JSON.stringify(rows.map(x => x.t + ':' + x.d.toFixed(2) + 'px'))
        + '  (許容 ' + SAME_RECT_PX + ')'
        + (ok ? '' : '  ⛔ HP バーが動いている: '
            + (dHero > SAME_RECT_PX ? '主人公 ' + dHero.toFixed(2) + 'px ' : '')
            + JSON.stringify(bad.map(x => x.t + ' ' + x.d.toFixed(2) + 'px')))];
    }],

  ['3b', 'スプライト (味方 #player / 敵 .enemy) の矩形が ' + RETREAT_QUERY
    + ' と**完全一致** (±' + SAME_RECT_PX + 'px)'
    + ' ⭐ 依頼書 §1「大きいのは敵ではなく札」— 敵の絵は 1 体も触っていないことの宣言',
    m => {
      const hero = refPair(m, x => (x.player && x.player.rectSprite) || null);
      const rows = [];
      for (const e of popOnScreen(m)) {
        const r = refEnemy(m, e);
        if (!r || !e.rectSprite || !r.rectSprite
          || !(e.rectSprite.h > 0) || !(r.rectSprite.h > 0)) continue;
        rows.push({ t: e.type, d: rectDelta(e.rectSprite, r.rectSprite),
          wh: e.rectSprite.w.toFixed(1) + 'x' + e.rectSprite.h.toFixed(1) });
      }
      const heroOk = !!hero && hero.on.h > 0 && hero.off.h > 0;
      if (!heroOk || rows.length < POP_MIN) {
        return popFail('(3b) 両アームで採れたスプライト',
          '主人公 #player = ' + (hero ? (hero.on.w.toFixed(2) + 'x' + hero.on.h.toFixed(2)
            + ' / 撤退 ' + hero.off.w.toFixed(2) + 'x' + hero.off.h.toFixed(2)) : 'どちらかのアームで採れず')
          + ' / 突き合わせられた敵 ' + rows.length + ' 体'
          + ' (素の画面上の敵 ' + popOnScreen(m).length + ' 体)');
      }
      const dHero = rectDelta(hero.on, hero.off);
      const bad = rows.filter(x => x.d > SAME_RECT_PX);
      const ok = dHero <= SAME_RECT_PX && bad.length === 0;
      return [ok,
        '主人公 #player の 4 辺の最大ずれ ' + dHero.toFixed(2) + 'px'
        + '   敵 ' + rows.length + ' 体 '
        + JSON.stringify(rows.map(x => x.t + '(' + x.wh + '):' + x.d.toFixed(2) + 'px'))
        + '  (許容 ' + SAME_RECT_PX + ')'
        + (ok ? '' : '  ⛔ スプライトが動いた/大きさが変わった: '
            + (dHero > SAME_RECT_PX ? '主人公 ' + dHero.toFixed(2) + 'px ' : '')
            + JSON.stringify(bad.map(x => x.t + ' ' + x.d.toFixed(2) + 'px')))];
    }],

  ['3c', '装備バッジの**寸法** (w x h) が ' + RETREAT_QUERY + ' と**完全一致** (±'
    + SAME_RECT_PX + 'px) — ⭐ 位置 (top) は札の上へ動かすので**測らない**。'
    + '「動かしたのは位置だけで、絵文字の大きさは 1px も変えていない」という宣言'
    + ' (⚠ 位置が実際に動いたことは (4a) の badgeTop が測る)',
    m => {
      const rows = [];
      for (const e of popOnScreen(m)) {
        if (!e.hasBadge || e.badgeDisplay === 'none') continue;
        const r = refEnemy(m, e);
        if (!r || r.badgeDisplay === 'none') continue;
        if (!e.rectBadge || !r.rectBadge || !(e.rectBadge.h > 0) || !(r.rectBadge.h > 0)) continue;
        if (!e.rectSprite || !r.rectSprite) continue;
        rows.push({ t: e.type, d: sizeDelta(e.rectBadge, r.rectBadge),
          wh: e.rectBadge.w.toFixed(1) + 'x' + e.rectBadge.h.toFixed(1),
          onDy: e.rectBadge.top - e.rectSprite.top,
          offDy: r.rectBadge.top - r.rectSprite.top });
      }
      if (rows.length < POP_MIN) {
        return popFail('(0e) バッジ持ちの敵',
          '両アームでバッジの矩形を採れた敵が 0 体  素の画面上の敵 '
          + JSON.stringify(popOnScreen(m).map(e => e.type + ':badge=' + e.hasBadge
            + ':display=' + JSON.stringify(e.badgeDisplay))));
      }
      const bad = rows.filter(x => x.d > SAME_RECT_PX);
      const ok = bad.length === 0;
      return [ok,
        'バッジ ' + rows.length + ' 枚の寸法のずれ '
        + JSON.stringify(rows.map(x => x.t + '(' + x.wh + '):' + x.d.toFixed(2) + 'px'))
        + '  (許容 ' + SAME_RECT_PX + ')'
        + '   [記録・⛔ 判定しない] 位置 (バッジ上端 - スプライト上端) 素 vs 撤退: '
        + JSON.stringify(rows.map(x => x.t + ':' + x.onDy.toFixed(1) + ' vs ' + x.offDy.toFixed(1)))
        + (ok ? '' : '  ⛔ 寸法が変わった: ' + JSON.stringify(bad.map(x => x.t + ' ' + x.d.toFixed(2) + 'px')))];
    }],

  ['3d', '部屋を 1 つ跨いだあと enemyLabelElements.length === enemies.length かつ'
    + ' .enemyLabel の DOM 総数 <= 敵の数'
    + ' (⭐ clearNodeArrays の 11 本目の足し忘れと、札の DOM が enemyLayer の外へ'
    + ' 出た場合の取りこぼしを捕まえる)',
    m => {
      const rc = m.roomCross;
      if (!rc) return popFail('(3d) 部屋跨ぎの観測', 'measureRoomCross を通していない');
      if (rc.seedErr) return popFail('(3d) 跨ぐ前の仕込み', String(rc.seedErr));
      if (!rc.crossed) {
        return popFail('(3d) 部屋跨ぎ',
          '本番の撤去点/構築点が例外で落ちた: ' + rc.crossErr);
      }
      const b = rc.before, a = rc.after;
      if (!b || !a) return popFail('(3d) 前後のスナップ', 'before/after のどちらかが採れなかった');
      /* ⚠⚠⚠ 掃除すべき中身が無い状態で測ると `0 === 0` / `0 <= 0` で永久緑になる。 */
      if (!(b.enemies >= 1) || !(b.labelArrayLen >= 1)) {
        return popFail('(3d) 跨ぐ前の母集団',
          '跨ぐ前の enemies=' + b.enemies + ' / 札の配列=' + JSON.stringify(b.labelArrayLen)
          + ' — 掃除すべき中身が無い状態では clearNodeArrays の足し忘れを検出できない'
          + '  (仕込めた敵 ' + rc.seeded + ' 体)');
      }
      if (!(a.enemies >= 1)) {
        return popFail('(3d) 跨いだ後の母集団',
          '作り直した部屋に敵が 1 体も居ない (enemies=' + a.enemies + ')'
          + ' — 敵 0 体では長さの一致が自明に成立してしまう');
      }
      const okLen = a.labelArrayLen === a.enemies;
      const okDom = a.labelDom <= a.enemies;
      const ok = okLen && okDom;
      return [ok,
        '跨ぐ前 enemies=' + b.enemies + ' 札の配列=' + b.labelArrayLen + ' 札の DOM=' + b.labelDom
        + '  →  跨いだ後 enemies=' + a.enemies + ' 札の配列=' + JSON.stringify(a.labelArrayLen)
        + ' 札の DOM=' + a.labelDom + ' (敵スプライトの DOM=' + a.enemySpriteDom + ')'
        + '   [記録] 添字並列 11 本の長さ ' + JSON.stringify(a.arrays)
        + (okLen ? '' : '  ⛔ 札の配列の長さが敵の数と違う (clearNodeArrays の足し忘れ)')
        + (okDom ? '' : '  ⛔ 札の DOM が敵の数より多い (跨いでも消えていない)')];
    }],

  ['3e', 'createEnemyDom が push する添字並列の配列が、**tools/driver_cast_circle.js の'
    + ' フィクスチャ撤去ループ**に 1 本残らず並んでいる (⭐ 配信した 2 本のソースの突き合わせ)'
    + ' ⚠⚠⚠ 罠A — あちらの検算 6.11 は enemies と enemyElements の 2 本しか比べないので、'
    + ' 11 本目 (札) を足し忘れても 53/53 のまま緑で札の DOM だけが残る。'
    + ' ⛔ 件数 (11) は期待値に持たない = 12 本目が増えた日にも自動で効く',
    m => {
      const t = m.teardown;
      if (!t || !t.ok) return popFail('(3e) 2 本のソース', (t && t.err) || '突き合わせられなかった');
      if (t.pushes.length < 2 || t.list.length < 2) {
        return popFail('(3e) 突き合わせる母集団',
          'createEnemyDom の push ' + t.pushes.length + ' 本 / 撤去ループ ' + t.list.length + ' 本'
          + ' — どちらかが空では取りこぼしを検出できない');
      }
      const ok = t.missing.length === 0;
      return [ok,
        'createEnemyDom が push する配列 ' + t.pushes.length + ' 本 / 撤去ループの配列 '
        + t.list.length + ' 本  ' + JSON.stringify(t.pushes)
        + (ok ? '  (取りこぼし 0)' : '  ⛔ 撤去ループに無い: ' + JSON.stringify(t.missing)
            + ' → その DOM だけが画面に残る (罠A)')];
    }],

  // ── §4 撤退 ────────────────────────────────────────────────────────────────
  ['4a', 'index.html' + RETREAT_QUERY + ' の 5 条件 { enemyLabelCount, allyLabelH,'
    + ' statusIsChild, badgeTop, labelArrayLen } が **ON と OFF で対になっている**'
    + ' ⭐⭐⭐ 撤退アームだけを見る assert は永久緑になる (実装が丸ごと壊れていても OFF は'
    + ' 0 個 / 子でない / 100% で通る) → **素のアームの対照を同じ assert の中に同居させる**',
    m => {
      if (!m.ref) return popFail('(4a) 撤退アーム', RETREAT_QUERY + ' の観測が無い');
      const on = m, off = m.ref;
      const onShown = popOnScreen(on), offShown = popOnScreen(off);
      if (onShown.length < POP_MIN || offShown.length < POP_MIN) {
        return popFail('(4a) 両アームの画面上の敵',
          '素 ' + onShown.length + ' 体 / 撤退 ' + offShown.length + ' 体');
      }
      // ① 札の枚数 — ON は敵の数だけ出て、OFF は 1 枚も作られない
      const c1 = on.enemyLabelDomCount > 0 && off.enemyLabelDomCount === 0;
      // ② 70% の効き — ON だけ body.labelSmall が付き、札の高さが OFF の 0.7 倍
      const hp = refPair(m, x => (x.heroLabel && x.heroLabel.rect) || null);
      const hr = (hp && hp.off.h > 0) ? (hp.on.h / hp.off.h) : null;
      const c2 = on.bodyHasLabelSmall === true && off.bodyHasLabelSmall === false
        && on.nameLabelOn === true && off.nameLabelOn === false
        && hr !== null && hr >= H_RATIO_MIN && hr <= H_RATIO_MAX;
      // ③ 状態アイコン列の親 — ON は札の子 / OFF は独立配置 (.enemy-status-slot)
      const onChild = onShown.filter(e => e.statusIsChildOfLabel).length;
      const offChild = offShown.filter(e => e.statusIsChildOfLabel).length;
      const offSlotClassOk = offShown.every(e => e.statusClass === 'enemy-status-slot');
      const c3 = onChild === onShown.length && offChild === 0 && offSlotClassOk;
      // ④ バッジの位置 — ON は OFF より**上**へ退避している (⛔ -58 という具体値は測らない)
      const dys = [];
      for (const e of onShown) {
        if (!e.hasBadge || e.badgeDisplay === 'none') continue;
        const r = refEnemy(m, e);
        if (!r || r.badgeDisplay === 'none') continue;
        if (!e.rectBadge || !r.rectBadge || !e.rectSprite || !r.rectSprite) continue;
        dys.push({ t: e.type,
          on: e.rectBadge.top - e.rectSprite.top,
          off: r.rectBadge.top - r.rectSprite.top });
      }
      if (dys.length < POP_MIN) {
        return popFail('(4a) ④ バッジ持ちの敵',
          '両アームでバッジの位置を採れた敵が 0 体  '
          + JSON.stringify(onShown.map(e => e.type + ':badge=' + e.hasBadge)));
      }
      const c4 = dys.every(d => d.on < d.off - SAME_PX);
      // ⑤ ⭐ 撤退アームでも添字並列が崩れていない (= push(null) が効いている)
      //    ⚠⚠⚠ (0d) は素のアームしか見ないので、null を積み忘れる欠陥は**ここでしか捕まらない**
      const c5 = isFiniteNum(off.labelArrayLen) && off.labelArrayLen === off.enemyCount;
      const ok = c1 && c2 && c3 && c4 && c5;
      return [ok,
        '① 札の枚数 ON=' + on.enemyLabelDomCount + ' / OFF=' + off.enemyLabelDomCount
        + ' ' + (c1 ? 'OK' : '⛔')
        + '   ② labelSmall ON=' + on.bodyHasLabelSmall + '/OFF=' + off.bodyHasLabelSmall
        + ' 札の高さ比 ' + (hr === null ? 'なし' : hr.toFixed(4))
        + ' (帯 ' + H_RATIO_MIN + '〜' + H_RATIO_MAX + ') ' + (c2 ? 'OK' : '⛔')
        + '   ③ 状態列が札の子 ON=' + onChild + '/' + onShown.length
        + ' OFF=' + offChild + '/' + offShown.length
        + ' OFF の class=' + JSON.stringify(offShown.map(e => e.statusClass)
          .filter((v, i, a) => a.indexOf(v) === i)) + ' ' + (c3 ? 'OK' : '⛔')
        + '   ④ バッジ位置 (上端 - スプライト上端) '
        + JSON.stringify(dys.map(d => d.t + ':ON ' + d.on.toFixed(1) + ' / OFF ' + d.off.toFixed(1)))
        + ' ' + (c4 ? 'OK (ON が上)' : '⛔')
        + '   ⑤ OFF の札配列 ' + JSON.stringify(off.labelArrayLen) + ' / 敵 ' + off.enemyCount
        + ' ' + (c5 ? 'OK' : '⛔ push(null) の取りこぼし = 撤退時だけ添字がずれる')];
    }],

  ['4b', RETREAT_QUERY + ' でも **HP バーとスプライトの器が全部そのまま在り**、矩形が'
    + ' 素のアームと一致する (±' + SAME_RECT_PX + 'px)'
    + ' ⭐「撤退のしすぎ」= 札を止めたつもりで HP バーや絵まで消した実装をここで落とす',
    m => {
      if (!m.ref) return popFail('(4b) 撤退アーム', RETREAT_QUERY + ' の観測が無い');
      const off = m.ref;
      const onShown = popOnScreen(m), offShown = popOnScreen(off);
      if (onShown.length < POP_MIN) {
        return popFail('(4b) 素のアームの画面上の敵', '0 体では撤退側と突き合わせられない');
      }
      /* ① 撤退アームの器が在ること (⛔ 「無いから比べられないので緑」にしない) */
      const p = off.player || {};
      const heroAlive = !!(p.rectSprite && p.rectSprite.h > 0 && p.spriteDisplay !== 'none'
        && p.rectHp && p.rectHp.h > 0 && p.hpDisplay !== 'none');
      const lost = offShown.filter(e => !(e.rectSprite && e.rectSprite.h > 0
        && e.rectHp && e.rectHp.h > 0));
      const sameCount = onShown.length === offShown.length;
      /* ② 矩形が一致すること (味方 2 枚 + 敵 2 枚ずつ) */
      const rows = [];
      for (const e of onShown) {
        const r = refEnemy(m, e);
        if (!r) continue;
        rows.push({ t: e.type, spr: rectDelta(e.rectSprite, r.rectSprite),
          hp: rectDelta(e.rectHp, r.rectHp) });
      }
      const onP = m.player || {};
      const dSpr = rectDelta(onP.rectSprite, p.rectSprite);
      const dHp = rectDelta(onP.rectHp, p.rectHp);
      if (dSpr === null || dHp === null || rows.length < POP_MIN
        || rows.some(x => x.spr === null || x.hp === null)) {
        return popFail('(4b) 両アームで採れた器',
          '主人公 スプライト=' + JSON.stringify(dSpr) + ' HP バー=' + JSON.stringify(dHp)
          + ' / 突き合わせられた敵 ' + rows.length + ' 体 (素 ' + onShown.length
          + ' 体 / 撤退 ' + offShown.length + ' 体)');
      }
      const bad = rows.filter(x => x.spr > SAME_RECT_PX || x.hp > SAME_RECT_PX);
      const ok = heroAlive && lost.length === 0 && sameCount
        && dSpr <= SAME_RECT_PX && dHp <= SAME_RECT_PX && bad.length === 0;
      return [ok,
        '撤退アームの器: 主人公のスプライト/HP バー ' + (heroAlive ? '両方あり' : '⛔ 欠けている')
        + ' / 画面上の敵 素 ' + onShown.length + ' 体 vs 撤退 ' + offShown.length + ' 体 '
        + (sameCount ? 'OK' : '⛔')
        + (lost.length ? '  ⛔ 器が欠けた敵: ' + JSON.stringify(lost.map(e => e.type)) : '')
        + '   矩形のずれ: 主人公 スプライト ' + dSpr.toFixed(2) + 'px / HP バー ' + dHp.toFixed(2) + 'px'
        + '   敵 ' + JSON.stringify(rows.map(x => x.t + ':絵 ' + x.spr.toFixed(2)
          + '/HP ' + x.hp.toFixed(2)))
        + '  (許容 ' + SAME_RECT_PX + ')'
        + (bad.length ? '  ⛔ ずれた敵: ' + JSON.stringify(bad.map(x => x.t)) : '')];
    }],

  ['4c', RETREAT_QUERY + ' で pageerror / console.error が 0 件'
    + ' (⭐ 素のアームの事故も**同じ assert の中で**見る — 撤退側だけを見ると、'
    + '素のアームが例外だらけでも緑になる)',
    m => {
      const on = m.errs || [], off = m.refErrs || [];
      /* ⚠ 「事故が 0 件」は器が動いていないと自明に真になるので、
         **両アームが実際にダンジョンを組み上げたこと**を母集団として要求する。 */
      const booted = !!(m.fixture && m.fixture.ok && m.fixture.renderOk)
        && !!(m.ref && m.ref.fixture && m.ref.fixture.ok && m.ref.fixture.renderOk);
      if (!booted) {
        return popFail('(4c) 両アームの起動',
          '素 ' + JSON.stringify(m.fixture && { ok: m.fixture.ok, render: m.fixture.renderOk })
          + ' / 撤退 ' + JSON.stringify(m.ref && m.ref.fixture
            && { ok: m.ref.fixture.ok, render: m.ref.fixture.renderOk }));
      }
      const ok = on.length === 0 && off.length === 0;
      return [ok,
        '素のアーム ' + on.length + ' 件 / 撤退アーム ' + RETREAT_QUERY + ' ' + off.length + ' 件'
        + (ok ? '' : '\n         ' + on.concat(off).slice(0, 8).join('\n         '))];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// まだ実装されていない受入条件 (⛔ 件数から隠さない = pending() で必ず出す)
//   ⭐ 最終項目の完了条件 = **PENDING 0**。
//   ⛔ ここに置いたキーは ASSERT_OF に無いので、実装したら必ず PENDINGS から外して
//     本体の配線 (['1a','1b', …] の並び) へキーを足すこと (両方やらないと数が合わない)。
//   ⛔ 空になっても配列ごと削除しないこと (削ると PENDING という 3 値そのものが消える)。
//   ⚠⚠⚠ 実装するとき、母集団ガードが偽の枝では **必ず popFail() を通す**
//     (「母集団が無いので緑」は禁止 = 依頼書 §8 の太字。変異 bigonly がこれを検査する)。
//   ⭐ 交差の判定には上の overlaps() を使う ((1h))。⛔ 中心 1 点や上端 1 点で代用しない。
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 項目 3 で **受入条件の PENDING は 0 件**になった (§0〜§4 をすべて実装した)。
 *  ⛔ 配列ごと削除しないこと — 削ると PENDING という 3 値そのものが消え、
 *    次に受入条件を足す窓が「宣言してから実装する」型を使えなくなる。
 *  ⚠ --negative 側の変異 17 本は MUT_TODO が別に PENDING を出す (項目 4 の担当)。 */
const PENDINGS = [];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_enemynamelabel_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  /* ⚠ ポートは **MUT_ORDER の並び**で固定的に割り当てる (impl の増減で番号が動かないように)。
     9851〜9867 が変異 17 本ぶん。撤退アームの基準ページは 9870。 */
  MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
  const RETREAT_PORT = PORT + 20;

  console.log('=== verify_enemy_name_label.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   撤退アーム:' + RETREAT_PORT + ' (' + RETREAT_QUERY + ')'
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない = 項目 4 の担当)'));

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (!NEGATIVE) servers.push(await startServer(RETREAT_PORT, null));
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('§0 装置 — 母集団と 2 経路 (⭐ ここが立たないと §1〜§4 は全部空振りで永久緑)');
      const m = await measure(browser, PORT, errs, {});
      /* ⭐⭐⭐ §2 の対照 = **同じドライバの中で撤退アームも開く**。
         ⚠ 事故は別の配列で受ける (素のアームの (4c) と混ぜない = 項目 4 が両方使う)。
         ⚠ 撤退アームは配信バイトが素と同じ RETREAT_PORT。負のコントロールでは
           **変異ポートの ?namelabel=0** を対照にする (下の負のコントロール側を参照) —
           そうしないと noscale/dyshift が「対照が無いから赤」で空振りする。 */
      m.refErrs = [];
      m.ref = await measure(browser, RETREAT_PORT, m.refErrs, { query: RETREAT_QUERY });
      /* ⭐ 項目 3: (4c) が両アームの事故を assert に昇格させるので、素の事故も m に載せる。 */
      m.errs = errs;
      /* ⭐ 項目 3: (3d) だけは **部屋を跨いだ別ページ**で撮る (本体の母集団を壊さないため)。
         ⚠ 事故は素のアームの errs と同じ籠へ入れる = 跨ぎで例外が出たら (4c) も赤になる。 */
      m.roomCross = await measureRoomCross(browser, PORT, errs);
      /* ⭐ (0b)(0h) の 2 経路目 = **配信バイト**。⛔ ディスクを読み直さない
         (走行中に別窓が保存すると混合ビルドを測ることになる)。 */
      const served = await httpGet('http://localhost:' + PORT + PAGE_PATH);
      m.roster = rosterFromBytes(served.body);
      m.servedBytes = served.body.length;
      /* ⭐ (3e) の 2 本目 = 同じポートから配られた tools/driver_cast_circle.js。 */
      const servedTd = await httpGet('http://localhost:' + PORT + TEARDOWN_PATH);
      m.teardown = teardownScan(served.body, servedTd.body);
      /* ⭐ (0g) の自己検査。⛔ 「DOM で測っている」を口約束にしない。 */
      m.selfScan = selfScan();

      for (const key of ['0a', '0b', '0c', '0d', '0e', '0f', '0g', '0h']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      console.log('       [記録] §0 の母集団 (⛔ 期待値ではない。読み解き用):');
      console.log('         配信バイト ' + m.servedBytes + 'B / ENEMY_TYPES を '
        + (m.roster.ok ? m.roster.bytes + 'B 切り出し' : '⛔ 切り出せず: ' + m.roster.err));
      for (const e of (m.enemies || [])) {
        console.log('         #' + e.i + ' ' + e.type
          + '  size=' + e.size                                  /* [0g-data] 記録行 */
          + ' alive=' + e.alive + ' everSeen=' + e.everSeen + ' inactive=' + e.inactive
          + ' badge=' + e.hasBadge
          + '  sprite.display=' + JSON.stringify(e.spriteDisplay)
          + '  label=' + (e.labelPresent ? ('あり display=' + JSON.stringify(e.labelDisplay)
            + ' ' + (e.rectLabel ? (e.rectLabel.w.toFixed(1) + 'x' + e.rectLabel.h.toFixed(1) + 'px') : '—')
            + ' text=' + JSON.stringify((e.labelNameText || '').slice(0, 14))
            + ' statusIsChild=' + e.statusIsChildOfLabel) : '⛔ 無い'));
      }
      console.log('         主人公の札 ' + (m.heroLabel.present && m.heroLabel.rect
        ? (m.heroLabel.rect.w.toFixed(1) + 'x' + m.heroLabel.rect.h.toFixed(1) + 'px  bg=' + m.heroLabel.bg)
        : '⛔ 無い') + '   NPC 仲間の札 ' + m.allyLabels.length + ' 枚');
      console.log('         撤退アーム ' + RETREAT_QUERY + ' — 主人公の札 '
        + (m.ref && m.ref.heroLabel && m.ref.heroLabel.rect
          ? (m.ref.heroLabel.rect.w.toFixed(1) + 'x' + m.ref.heroLabel.rect.h.toFixed(1) + 'px')
          : '⛔ 無い')
        + ' / .enemyLabel の DOM 総数 ' + (m.ref ? m.ref.enemyLabelDomCount : '—')
        + ' / .enemy-status-slot の DOM 総数 ' + (m.ref ? m.ref.enemyStatusSlotDomCount : '—')
        + ' / 事故 ' + (m.refErrs ? m.refErrs.length : '—') + ' 件');

      mark('§1 敵の札 — 正しい敵に / 正しい名前で / 他の頭上 UI と重ならずに 出ているか');
      for (const key of ['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§2 70% — ⛔ 絶対 px を書かず、撤退アーム ' + RETREAT_QUERY + ' の同じ札との比で測る');
      for (const key of ['2a', '2b', '2c', '2d', '2e', '2f']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§3 恒等 (非退行) — ⭐ 撤退アームが「#44 が入る前の見た目」の定義。'
        + 'ここが緑 = 札とバッジ以外は 1px も動かしていない');
      for (const key of ['3a', '3b', '3c', '3d', '3e']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§4 撤退 ' + RETREAT_QUERY
        + ' — ⭐⭐⭐ 撤退アームだけを見る assert は永久緑なので、素の対照を同居させる');
      for (const key of ['4a', '4b', '4c']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }
      if (PENDINGS.length === 0) {
        mark('未実装の受入条件 (⛔ 件数から隠さない)');
        console.log('       受入条件の PENDING は 0 件 — §0〜§4 をすべて実装済み'
          + '  (--negative 側の変異は ' + MUT_IMPL.length + '/' + MUT_ORDER.length
          + ' 本が実装済み / 未実装 ' + MUT_TODO.length + ' 本)');
      }

      /* ⭐ (4c) が assert として両アームの事故を見ているが、**中身は記録にも残す**
         (⛔ 黙って捨てない = silent fail-open を作らない)。 */
      mark('事故の記録 (判定は (4c)。⛔ ここで黙って捨てない)');
      console.log('       素のアーム (部屋跨ぎのページを含む) の pageerror / console.error: '
        + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 6).join('\n         ') : ''));
      console.log('       撤退アーム ' + RETREAT_QUERY + ': '
        + (m.refErrs ? m.refErrs.length : '—') + ' 件'
        + (m.refErrs && m.refErrs.length ? '\n         ' + m.refErrs.slice(0, 6).join('\n         ') : ''));
      console.log('       主人公 #player ' + (m.player && m.player.rectSprite
        ? (m.player.rectSprite.w.toFixed(1) + 'x' + m.player.rectSprite.h.toFixed(1) + 'px')
        : '⛔ 無い')
        + ' / #warriorHpBar ' + (m.player && m.player.rectHp
          ? (m.player.rectHp.w.toFixed(1) + 'x' + m.player.rectHp.h.toFixed(1) + 'px') : '⛔ 無い')
        + ' / NPC 仲間 ' + ((m.allies || []).length) + ' 人 '
        + JSON.stringify((m.allies || []).map(a => a.classKey + (a.isHero ? '(頭)' : ''))));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          if (typeof MUTATIONS[k].verifyServed === 'function') {
            /* ⭐ 変換関数で配る変異 (bigonly) は逐語の注入文字列を持たないので、
               「配った欠陥が素に無く変異側にだけ在る」を**意味の側**で検算する。 */
            const v = MUTATIONS[k].verifyServed(pure.body, mut.body);
            check('(n0a-' + k + ') 変換で配った欠陥が素に無く、変異側にだけ在る', v[0],
              f + '  ' + v[1] + (MUT_SRC[k].note ? '  [' + MUT_SRC[k].note + ']' : ''));
          } else {
            const eds = editsOf(MUTATIONS[k]);
            const bad = eds.filter(e =>
              !(pure.body.split(e.to).length - 1 === 0 && mut.body.split(e.to).length - 1 === 1));
            check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある'
              + (eds.length > 1 ? ' (置換 ' + eds.length + ' 箇所すべて)' : ''),
              bad.length === 0,
              f + (bad.length ? '  ⛔ 当たっていない置換: '
                + bad.map(e => JSON.stringify(String(e.to).slice(0, 50))).join(' / ') : ''));
          }
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length,
            '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
          const mm = await measure(browser, port, negErrs, {});
          /* ⚠⚠⚠ 対照は **変異ポートの ?namelabel=0**。素のページを対照にすると
             noscale/dyshift が「変異側だけ壊れた」ではなく「両方壊れた」に見えたり、
             逆に対照を用意しないと (2a)(2b)(2e) が popFail で必ず赤になり、
             **変異が効いていなくても赤 = 空振り**に気づけなくなる。
             ⭐ 対照が要らない変異では開かない (17 本フルで 14 ページぶんの節約)。
             ⛔ 「要らない」の判断は REF_ASSERTS の 1 箇所だけ = 判定と同じ表を見る。 */
          const wantRef = MUTATIONS[k].targets.concat(MUTATIONS[k].record || [])
            .some(t => REF_ASSERTS[t]);
          if (wantRef) {
            mm.refErrs = [];
            mm.ref = await measure(browser, port, mm.refErrs, { query: RETREAT_QUERY });
          }
          mm.errs = negErrs;
          /* ⭐ 項目 3: (3d) を担当する変異のときだけ、部屋跨ぎのページも開く。
             ⛔ 全変異で開くと走行時間が 1.5 倍になるだけで何も測れない
             (跨ぎを見る assert は (3d) の 1 本しかない)。 */
          if (MUTATIONS[k].targets.indexOf('3d') >= 0) {
            mm.roomCross = await measureRoomCross(browser, port, negErrs);
          }
          const servedNeg = await httpGet('http://localhost:' + port + PAGE_PATH);
          mm.roster = rosterFromBytes(servedNeg.body);
          mm.servedBytes = servedNeg.body.length;
          const servedNegTd = await httpGet('http://localhost:' + port + TEARDOWN_PATH);
          mm.teardown = teardownScan(servedNeg.body, servedNegTd.body);
          mm.selfScan = selfScan();
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](mm);
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
              r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
          }
          /* ⭐⭐⭐ record = 「この変異では**緑のまま通ってしまう**節」を同じ走行で実証する。
             ⛔ 判定はしない (記録)。bothgrow が「比だけ見る (2a)(2b)(2c) をすり抜けるのに
             絶対量を見る (2f) だけが落とす」= (2f) が存在する理由そのものを紙に残すため。 */
          for (const key of (MUTATIONS[k].record || [])) {
            const a = ASSERT_OF[key];
            if (!a) continue;
            const r = a[2](mm);
            console.log('       [記録・⛔ 判定しない] 変異 ' + k + ' でも ('
              + key + ') は ' + (r[0] ? '緑のまま' : '⛔ 赤になった') + '  — ' + r[1]);
          }
        }
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⛔ 件数から隠さない)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file + ']');
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length);
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (最終項目の完了条件 = ここが 0 件):');
    for (const b of pend) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
