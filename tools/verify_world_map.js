#!/usr/bin/env node
/*
 * verify_world_map.js — 地方全景 (ワールドマップ) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-25_world-map-entry.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§8 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (依頼書 #19 でこの型が停止 0 回で完走した)。
 *
 * ■ ⭐⭐⭐ 測定は **本番で配信される `/world.html` の上で行う** (項目 2 で移行済み)
 *   項目 1 の自前ハーネス `/__world_probe__.html` は畳んだ。
 *   ⚠⚠ ハーネスは `js/world-map.js` だけを載せるので、**本番ページだけが壊れているケースを
 *      永久に緑と報告する**。world.html が出来た今はデータ層の assert も本番ページで測る
 *      (world.html が js/world-map.js を読むので window.WORLD_MAP はそのまま取れる)。
 *   ⚠ 水の測定は canvas に絵を焼いて getImageData するので **同一オリジンで配ること**
 *      (別オリジンだと canvas が汚染されて SecurityError = 測定が丸ごと空振りする)。
 *
 * ■ 項目 4 で足したもの (帰還の 3 段判定 / 結果チャネルの通し / BGM の 2 経路) — **PENDING 0 へ**
 *     (4c) 通し     … lastResult を置いて ダンジョン → world → town → tavern。**酒場のリザルトが出る**
 *     (6b) 撤退     … index.html?world=0 の dfReturnPage() → town.html (⭐ 実際に飛ばして着地も見る)
 *     (6c-index)    … index.html?town=0 → tavern.html (?world=0 の有無によらず = 2 モードとも)
 *     (8a) 経路A    … ロード時に GameAudio.playBgm へ渡った ID が "world" (スパイ)
 *     (8b) 経路B    … 最初の pointerdown 後、__bgmFileState() が world を掴んで paused:false、
 *                      かつ **assets/bgm/fierd.mp3 を実際に要求している** (リクエストログ = 別経路)
 *     (8c) 表       … BGM_FILES.world の src / credit。⛔ volume は縛らない
 *
 * ■ ⭐⭐⭐ BGM は **必ず 2 経路で測る** (#20 で実測した罠)
 *   audio.js の unlock() は `if (pendingBgm) { … playBgm(p); }` で **モジュール内部の**
 *   playBgm を呼ぶ。window.GameAudio.playBgm を包んだスパイは**この再生を永久に見られない**。
 *   逆に「鳴っているか」だけを見ると、ロード時の呼び口が 1 本死んでも緑のまま。
 *   ⭐ だから 経路A (渡した ID) と 経路B (__bgmFileState + mp3 の実要求) の両方が要る。
 *     負のコントロール spyonly が「(8a) は緑のまま (8b) だけ赤」でこれを機械証明する。
 *
 * ■ 項目 3 で足したもの (遷移 / 一回性のキー / 画面 / 撤退 / 札)
 *     (3d) 遷移     … 港町フランの札 → 歩いて town.html へ / location.search が空文字
 *     (4a) 罠 A     … exitVia="dungeon" で world をロード → 駒は SITES[scen] / **キーが残る**
 *     (4b) 対       … そのまま town.html へ → 消費されて (10,3) に立つ
 *     (5a) 画面     … 390x844 / 1440x900 で 横スクロール無し / 素の背景 5% 未満 (**画素**) / 駒が画面内
 *     (6a) 撤退     … title.html?world=0 → town.html 直行 (/world.html を 1 回も要求しない)
 *     (6c-title)    … title.html?town=0 → tavern.html (?world=0 の有無によらず)
 *     (7b-dom)(7d)(7e) 札 … ちょうど 7 枚 / 中心が自分に当たる / 6 枚は押しても遷移しない
 *
 * ■ 現時点で実際に測れるもの (項目 1 = データ層 / 項目 2 = 器)
 *     (0a) 母集団   … NODES / EDGES が空でない  ← これが無いと以降が全部空振りで永久緑
 *     (0b) 素材     … <img id="worldBg"> の naturalWidth/Height が WORLD_MAP.W/H と一致
 *     (1a) 水       … 全ノード + 全エッジ (16px 刻み) の周囲 32px 角の水率 < 40%
 *     (1b) 対照     … 海 / 湖が水と判定される  ← 検出器が全部 0 を返していないことの証明
 *     (2a) 線の本数 … 画面に描かれた線分の本数と data-edge の集合が EDGES と一致
 *     (2b) 線の端点 … 各線分の両端の**画面座標**が対応する 2 ノード (x zoom) と 2px 以内
 *     (3a) 到達性   … phlan から全ノードへ **本番の WORLD_MAP.findPath** が null を返さない
 *     (3b) 歩ける   … 全 14 ノードを実際にクリック → 駒がそのノードへ立つ (FOOT=0.93 込み)
 *     (3c) 歩けない … 線の無い座標をクリック → 駒が 1px も動かない
 *     (4s) SITES    … tavern.html の実体から抜いたシナリオ id 集合と完全一致し、
 *                      値は全部 kind:"site" の実在ノード
 *     (7a) 札の文言 … **配信中の tavern.html の `place:`** と 1 文字違わず一致
 *     (7b) 札の枚数 … kind:"site" がちょうど 7 / enter を持つのは 1 つだけ (データ側)
 *     (7c) 札の間隔 … 札どうし & 札と「絵に描かれた集落」が 96px 以上
 *     (7f) 札と駒   … 全 14 ノードに立ったときの駒の矩形が、どの札も 10% 以上は隠さない
 *       ⭐⭐⭐ (7c) とは別物。(7c) は **ノード座標**だけを見、(7d) は **札の中心の
 *       elementFromPoint** だけを見るので、札を再センタリングしても **両方緑のまま戻る**
 *       (主人公は pointer-events: none なので elementFromPoint には永久に写らない)。
 *
 * ■ ⭐⭐⭐ (2a)(2b) が実装方式を縛っている
 *   「エッジ 1 本 = DOM から個別に引ける 1 要素」でなければ本数も端点も読めない。
 *   world.html は SVG の <line data-edge="a__b"> を 1 エッジ 1 本だけ作り、
 *   縁取りは親 <g> に掛けた drop-shadow で出している (2 本目を敷くと本数が 2 倍になる)。
 *   ⭐ 端点の**画面座標**は `line.getScreenCTM()` で読む = 実装の clientFromWorld とは
 *     別経路 (ブラウザのレイアウト結果) なので、写経どうしの突き合わせにならない。
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け
 *   - 到達可能性は **自前で BFS を書かない**。`WORLD_MAP.findPath` をブラウザで呼ぶ
 *     (近傍の定義が違うだけで「歩けない道」を永久に緑と報告する恒久教訓)。
 *     ⭐ さらに「存在しないノードへは null を返す」対照を置く (常に非 null なら無力)。
 *   - 水は **人が置いたノード座標** x **codex1 が描いた画素** = 別々の作者のデータで突き合わせる。
 *     ⭐ (1b) が無いと、検出器が全部 0 を返していても (1a) が緑になる。
 *   - 札の文言は **ドライバに写経しない**。`tavern.html` を配信から読んで
 *     `id:"…" , place:"…"` を抜き、`WORLD_MAP` 側と突き合わせる = 別ファイルの実体どうし。
 *   - (7c) は「例外」を作らずに **両方向**で測る:
 *     6 つのシナリオ札は描かれた集落から 96px 以上離れ、
 *     唯一 enter を持つ札 (港町) は逆に描かれた港町の **96px 以内**に在ること。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   ルート線の色 / 太さ / 点の間隔・ノードの px 座標そのもの・`BGM_FILES.world.volume`・
 *   既存 10 曲の volume・札の説明文 (`desc`)。
 *   ⛔ **道マスクは受入条件にしない** (依頼書 §2-6: 東半分の岩肌が道と同じ色域に入る)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   port  | mutate     | 注入する欠陥                                 | 赤くなるべき節   | 状態
 *   9120  | (素)       | —                                            | —                | —
 *   9121  | sinkroute  | swamp を湖の中心 (736,480) へ移す            | (1a) / (3a) は緑 | 実装済
 *   9120  | nowater    | **ドライバの水検出器**が常に 0 を返す         | (1b) のみ        | 実装済
 *   9122  | labeldrift | mine の label を「古い坑道」へ                | (7a) のみ        | 実装済
 *   9123  | crowdsign  | temple を mine の隣 (1120,416) へ寄せる       | (7c-1) / 他は緑  | 実装済
 *   9124  | maskdrift  | **描画側の線だけ** +12px ずらす (グラフは無傷) | (2b) / 他は緑    | 実装済
 *   9125  | eatvia     | world.html に exitVia の removeItem を足す    | (4a) / (4b) は緑 | 実装済
 *   9126  | eatresult  | world.html に lastResult の removeItem を足す | (4c) のみ        | 実装済
 *   9127  | earlyworld | dfReturnPage の off 判定より前に world を返す  | (6c-index)       | 実装済
 *   9128  | silent     | world.html の playBgm 呼び口を 2 本とも消す    | (8a)(8b)         | 実装済
 *   9129  | spyonly    | pointerdown 側の unlock() だけ消す             | (8a) は緑 /(8b)  | 実装済
 *   9130  | signflat   | phlan の signDx: -72 を消す (札を再センタリング) | (7f) のみ        | 実装済
 *
 *   ⭐⭐⭐ eatvia は本チケットの核心 (依頼書 §2-2 の罠 A) の機械証明。
 *     world.html が exitVia を **peek でなく消費**すると、town.html は入口を見失い
 *     spawnFor(null) の fail-safe で **必ず酒場前 (10,3)** に立つ。行き先が「正解と同じ」
 *     なので **一見正しく見えて黙って壊れる**。
 *     → だから (4a)「world をロードしてもキーが残っている」が赤くなり、
 *       (4b)「town で消費され (10,3) に立つ」は **緑のまま**でなければならない。
 *       両方赤になったら変異が効きすぎ (peek より前で消している) = 変異点が誤り。
 *
 *   ⚠ nowater だけは **配信の差し替えではなくドライバ内の差し替え**にしてある。
 *     水検出器はドライバ側に居るので、配信スナップショットを差し替えても届かない
 *     (「その assert は配信を読むのかディスクを読むのか」を必ず確認する、の実践)。
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *
 * 使い方:
 *   node tools/verify_world_map.js               # 受入条件 (素の配信)
 *   node tools/verify_world_map.js --negative    # 負のコントロール (赤くならなければ exit 1)
 *   node tools/verify_world_map.js --mutate sinkroute   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
/* ⚠ ポートは既存ドライバと空ける。9100-9105 = driver_bgm_town / 9110-9114 = driver_bgm_title。
 *   9120-9130 が空いていることは tools 全体のポート直書きの数え上げで実測済み。 */
const PORT = parseInt(arg('port', '9120'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* 罠: 線を絵の水面へ引いてしまう。⭐ グラフの繋がりは 1 本も変えないので (3a) は緑のまま。 */
  sinkroute: {
    impl: true, file: 'js/world-map.js', targets: ['1a'],
    from: '    swamp:     { kind: "site", x:  544, y: 672, label: "沼地", desc: "湖の西に沈む湿地" },',
    to: '    swamp: { kind: "site", x: 736, y: 480, label: "沼地", desc: "湖の西に沈む湿地" },   /* mut-sinkroute 湖の中心へ沈めた */',
  },
  /* ⭐ 検出器そのものを殺す変異。(1a) は「40% 未満」なので全部 0 でも緑 = (1b) だけが気づける。 */
  nowater: { impl: true, driver: true, targets: ['1b'] },
  /* 意図的に重複させた文言 (tavern.html の place: の写し) が黙ってドリフトした状態。 */
  labeldrift: {
    impl: true, file: 'js/world-map.js', targets: ['7a'],
    from: '    mine:      { kind: "site", x: 1056, y: 352, label: "廃坑", desc: "雪山の麓に口を開けた坑道" },',
    to: '    mine: { kind: "site", x: 1056, y: 352, label: "古い坑道", desc: "雪山の麓に口を開けた坑道" },   /* mut-labeldrift */',
  },
  /* 札が寄りすぎて絵の中で潰れる。⭐ 水にも掛からず繋がりも変えないので (1a)(3a) は緑のまま。 */
  crowdsign: {
    impl: true, file: 'js/world-map.js', targets: ['7c-1'],
    from: '    temple:    { kind: "site", x: 1184, y: 416, label: "地下神殿", desc: "雪山の谷あいに埋もれた神殿" },',
    to: '    temple: { kind: "site", x: 1120, y: 416, label: "地下神殿", desc: "雪山の谷あいに埋もれた神殿" },   /* mut-crowdsign 廃坑の隣へ寄せた */',
  },
  /* ⭐⭐⭐ 罠 C の機械証明 — **描画側の線の端点だけ**を +12px ずらす。
   *  グラフ (WORLD_MAP.NODES / EDGES) は 1 バイトも触らないので、
   *  (3a) 到達性も (3b) 駒の立ち位置も緑のまま = 「線とデータを 2 つ持つとズレる」が (2b) だけに出る。
   *  ⚠ world.html 側でこの計算が 2 箇所に散ると、ここが 2 ヒットして exit 3 になる。 */
  maskdrift: {
    impl: true, file: 'world.html', targets: ['2b'],
    from: '    function edgeEnds(a, b) { return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }',
    to: '    function edgeEnds(a, b) { return { x1: a.x + 12, y1: a.y + 12, x2: b.x + 12, y2: b.y + 12 }; }   /* mut-maskdrift 描画だけ 12px ずらす */',
  },
  /* ⭐⭐⭐ 本チケットの核心 (依頼書 §2-2 の罠 A) の機械証明。
   *  world.html が一回性のキーを **peek でなく消費**した状態を作る。
   *  ⚠ 消すのは peek の**後**。そうしないと駒の立ち位置まで変わってしまい、
   *    「読めているのに消している」という現実の欠陥を再現できない (効きすぎ)。
   *  ⭐ こうすると (4a) だけが赤く、(4b) は **緑のまま**になる = 「行き先が正解と同じなので
   *    一見正しく見えて黙って壊れる」を機械で示せる。 */
  eatvia: {
    impl: true, file: 'world.html', targets: ['4a'],
    from: '    var exitVia = peekSession(EXIT_VIA_KEY);   /* ⛔ peek のみ。消費するのは town.html */',
    to: '    var exitVia = peekSession(EXIT_VIA_KEY); try { sessionStorage.removeItem(EXIT_VIA_KEY); } catch (e) {}   /* mut-eatvia 一回性キーを食う */',
  },
  /* ⭐ (4a) の対。こちらは **lastResult** を食う。exitVia には触らないので (4a)(4b) は緑のまま。
   *  ⚠ lastResult を消すと「酒場のリザルト画面が黙って出なくなる」= 画面に何も出ないので
   *    プレイ中は気づけない。本チケットで新しく壊しうる唯一の既存機能 (依頼書 §2-2)。
   *  ⚠ 消すのは peek の**後ろの行**。前に置くと駒の立ち位置まで巻き添えになる。 */
  eatresult: {
    impl: true, file: 'world.html', targets: ['4c'],
    from: '    var scenarioId = peekSession(SCENARIO_KEY);',
    to: '    var scenarioId = peekSession(SCENARIO_KEY); try { sessionStorage.removeItem("dragonfighters.lastResult"); } catch (e) {}   /* mut-eatresult リザルトを食う */',
  },
  /* ⭐⭐⭐ 罠 B の機械証明 (依頼書 §2-3) — dfReturnPage() の **?town=0 判定より前**に
   *  world.html を返してしまう。「街を丸ごと素通りする撤退スイッチ」が地図に食われて死ぬ。
   *  ⚠ 行き先が「地図」なので一見それらしく動いてしまい、?town=0 を使う人にしか刺さらない。 */
  earlyworld: {
    impl: true, file: 'index.html', targets: ['6c-index'],
    from: '    function dfReturnPage() {',
    to: '    function dfReturnPage() { return "world.html";   /* mut-earlyworld ?town=0 の判定より前に地図を返す */',
  },
  /* 呼び口の実体 playWorldBgm() を空にする = ロード時と pointerdown の **2 本とも**死ぬ。
   *  ⭐ world.html が呼び口を 1 つの関数へ畳んでいるので、1 アンカーで両方を殺せる
   *    (2 箇所へ同じ 1 行を書く実装だと、この from が 2 ヒットして exit 3 = #20 で実測)。 */
  silent: {
    impl: true, file: 'world.html', targets: ['8a', '8b'],
    from: '    function playWorldBgm() { try { if (window.GameAudio && GameAudio.playBgm) GameAudio.playBgm(WORLD_BGM_ID); } catch (e) {} }',
    to: '    function playWorldBgm() { /* mut-silent 呼び口を 2 本とも殺す */ }',
  },
  /* ⭐⭐⭐ #20 の罠の機械証明 — **呼び口は 2 本とも生きているのに音が出ない**状態。
   *  unlock() を消すと audio.js の `unlocked` が false のままなので playBgm は
   *  pendingBgm へ落ち続ける。スパイ (経路A) には "world" が届くので **(8a) は緑のまま**、
   *  実際に鳴っているかを見る (8b) だけが赤くなる。
   *  ⚠ 両方赤になったら変異が効きすぎ = アンカーが呼び口まで巻き込んでいる。 */
  spyonly: {
    impl: true, file: 'world.html', targets: ['8b'],
    from: '      try { if (window.GameAudio && GameAudio.unlock) GameAudio.unlock(); } catch (e) {}',
    to: '      /* mut-spyonly unlock() を消す = pendingBgm が永久に鳴らない */',
  },
  /* ⭐⭐⭐ 2026-08-26 に直した「主人公が港町フランの札を覆う」を **黙って戻す**変異。
   *  戻さないのは札の位置だけで、当たり判定 (44px 角) もノード座標も 1 バイトも動かない。
   *  ⭐⭐⭐ だから (7c-1)(7c-2) (ノード座標しか見ない) も (7d) (札の中心の
   *    elementFromPoint しか見ない / 駒は pointer-events: none) も **緑のまま**で、
   *    (7f) だけが気づける = この変異が (7f) の存在理由そのもの。 */
  signflat: {
    impl: true, file: 'js/world-map.js', targets: ['7f'],
    from: '    phlan:     { kind: "site", x:  416, y: 544, label: "港町フラン", desc: "船着き場と酒場。旅の起点", enter: "town.html", signDx: -72 },',
    to: '    phlan: { kind: "site", x: 416, y: 544, label: "港町フラン", desc: "船着き場と酒場。旅の起点", enter: "town.html" },   /* mut-signflat 札をノード中心へ戻した */',
  },
};
const MUT_ORDER = ['sinkroute', 'nowater', 'labeldrift', 'crowdsign', 'maskdrift',
  'eatvia', 'eatresult', 'earlyworld', 'silent', 'spyonly', 'signflat'];
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

/* 変異ソースを先に組み立てる。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。 */
const SRC = {};
const MUT_SRC = {};
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
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

/* ⭐⭐⭐ 測る対象は **本番で配信される world.html そのもの**。
 *   ⛔ 項目 1 の自前ハーネス `/__world_probe__.html` は畳んだ (本番ページだけが壊れている
 *      ケースを永久に緑と報告するため)。
 *   ⚠ 同一オリジンで配ること。別オリジンから画像を読むと canvas が汚染されて
 *      getImageData が SecurityError になり、水の測定が丸ごと空振りする。 */
const PAGE_PATH = '/world.html';

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
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
/* 書体 + 画像が届いて layout() が落ち着くまで待つ。⛔ 固定時間だけに頼らない
 *   (document.fonts.ready を先に待ってから、レイアウト 1 往復ぶんだけ寝る)。 */
async function settle(page) {
  try { await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null); } catch (e) {}
  await sleep(260);
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

/* ⭐ 「絵に描かれた集落」の位置 (依頼書 §2-5 が原寸 px から実測してタイル換算したもの)。
 *   ⚠ これは **codex1 が描いた絵の事実**であって、人が置いたノード座標とは別の作者のデータ。
 *      だから (7c) は「写経どうしの突き合わせ」にならない。単位はタイル (x64 で px)。 */
const DRAWN_SETTLEMENTS = [
  { name: '北の農村', tx: 9.5, ty: 3.5 },
  { name: '東の湖畔村', tx: 16.5, ty: 8.0 },
  { name: '南の森の村', tx: 11.0, ty: 13.0 },
  { name: '港町', tx: 5.5, ty: 8.5 },
];
const HARBOR = DRAWN_SETTLEMENTS[3];
const MIN_SIGN_GAP = 96;      // 1.5 タイル (依頼書 §8 (7c))
const WATER_MAX = 0.40;       // 依頼書 §8 (1a)
/* (7f) 札 1 枚の面積に対して主人公の矩形が覆ってよい上限。
 * ⭐ 2026-08-26 の実測から決めた: 直した後の最大は mine に立ったときの temple、
 *   signDx を消して戻すと cross_n に立ったときの phlan が跳ね上がる。その間に置く。 */
const COVER_MAX = 0.10;

// ══════════════════════════════════════════════════════════════════════════════
// 観測 (⭐ 素でも変異でも **この同じ関数**を回す)
// ══════════════════════════════════════════════════════════════════════════════
async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const m = { port: port };
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.nowater ? ' nowater' : '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  /* ⚠ 書体が後から届くと #worldTitle の高さ = insets() が動き、layout() が引き直される。
   *   その前に幾何を読むと (2b) が「書体レースのせいで」赤くなる (原理的なフレーク)。 */
  await settle(page);

  m.map = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    return {
      W: WM.W, H: WM.H,
      nodes: JSON.parse(JSON.stringify(WM.NODES)),
      edges: JSON.parse(JSON.stringify(WM.EDGES)),
      sites: JSON.parse(JSON.stringify(WM.SITES)),
      fnFindPath: typeof WM.findPath === 'function',
      fnNeighbors: typeof WM.neighbors === 'function',
      fnSpawnFor: typeof WM.spawnFor === 'function',
    };
  });

  /* ⭐⭐⭐ 到達性は **本番の findPath をブラウザで呼ぶ**。自前 BFS を書かない。 */
  m.reach = await page.evaluate(() => {
    const WM = window.WORLD_MAP, out = {};
    for (const id of Object.keys(WM.NODES)) {
      const p = WM.findPath('phlan', id);
      out[id] = (p === null) ? null : p.length;
    }
    const self = WM.findPath('phlan', 'phlan');
    return {
      paths: out,
      nullProbe: WM.findPath('phlan', '__no_such_node__') === null,
      selfEmpty: Array.isArray(self) && self.length === 0,
    };
  });

  /* ── 描画 (§0 (0b) / §2 罠 C) ───────────────────────────────────────────────
   *  ⭐ 線分の**画面座標**は line.getScreenCTM() から取る = ブラウザのレイアウト結果。
   *     期待値は WORLD_MAP.NODES から clientFromWorld() で引く = データ側。
   *     **別経路どうし**なので、描画とグラフが別データになった瞬間 (2b) が赤くなる。
   *  ⛔ ドライバに座標表を写経しない。 */
  m.render = await page.evaluate(() => {
    const WM = window.WORLD_MAP, WD = window.__world;
    const svg = document.getElementById('worldRoutes');
    const bg = document.getElementById('worldBg');
    if (!svg) return { ok: false, err: '#worldRoutes が無い' };
    const lines = Array.prototype.slice.call(svg.querySelectorAll('line'));
    const drawn = lines.map((ln) => {
      const ctm = ln.getScreenCTM();
      if (!ctm) return { edge: ln.getAttribute('data-edge'), bad: 'getScreenCTM null' };
      const p = svg.createSVGPoint();
      p.x = parseFloat(ln.getAttribute('x1')); p.y = parseFloat(ln.getAttribute('y1'));
      const s1 = p.matrixTransform(ctm);
      p.x = parseFloat(ln.getAttribute('x2')); p.y = parseFloat(ln.getAttribute('y2'));
      const s2 = p.matrixTransform(ctm);
      return { edge: ln.getAttribute('data-edge'), s1: { x: s1.x, y: s1.y }, s2: { x: s2.x, y: s2.y } };
    });
    const want = WM.EDGES.map((e) => {
      const a = WM.NODES[e[0]], b = WM.NODES[e[1]];
      return {
        edge: e[0] + '__' + e[1],
        s1: a ? WD.clientFromWorld(a.x, a.y) : null,
        s2: b ? WD.clientFromWorld(b.x, b.y) : null,
      };
    });
    return {
      ok: true, lineCount: lines.length, edgeCount: WM.EDGES.length,
      drawn: drawn, want: want,
      bgW: bg ? bg.naturalWidth : 0, bgH: bg ? bg.naturalHeight : 0,
      zoom: WD.zoom(), compact: WD.compact(), geom: WD.heroGeom(),
    };
  });

  /* ── 拠点の札 (§7 (7b-dom) / (7d)) ────────────────────────────────────────
   *  ⭐ 「札の中心」は **札自身の矩形**から採る (ノード座標ではない)。可変幅なので
   *     ノード中心と札の中心がズレる実装をすると (7d) が空振りする。
   *  ⛔ 文言をドライバに写経しない。DOM が持っている文字列を持ち帰って
   *     WORLD_MAP.NODES の label / desc と突き合わせる (実体どうしの照合)。 */
  m.signs = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    const all = Array.prototype.slice.call(document.querySelectorAll('.worldSign'));
    const rows = [];
    for (const id of Object.keys(WM.NODES)) {
      const el = document.getElementById('worldNode_' + id);
      const sign = el ? el.querySelector('.worldSign') : null;
      if (!sign) continue;
      const r = sign.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(Math.round(cx), Math.round(cy));
      const nameEl = sign.querySelector('.worldSignName');
      const descEl = sign.querySelector('.worldSignDesc');
      rows.push({
        id: id, kind: WM.NODES[id].kind,
        inNode: !!el && el.contains(sign),
        name: nameEl ? nameEl.textContent : null,
        desc: descEl ? descEl.textContent : null,
        w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
        onScreen: cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight,
        self: !!top && (top === sign || sign.contains(top)),
        top: top ? (top.id || top.className || top.tagName) : null,
        fontName: nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0,
        fontDesc: descEl ? parseFloat(getComputedStyle(descEl).fontSize) : 0,
      });
    }
    return { total: all.length, rows: rows };
  });

  /* ── (7f) 主人公が札を隠さない ──────────────────────────────────────────────
   *  ⭐⭐⭐ **実際に歩かせない**。駒の矩形はノード座標だけで決まる (placeHero が
   *     left = cx - SPRITE/2 / top = cy - SPRITE*FOOT を書く) ので、計算で 14 ノードを
   *     一度に出せる。⭐ これで **enter を持つ港町の札を押すと town.html へ飛ぶ**罠
   *     (測定ループに入れると waitForFunction が 25 秒でタイムアウトし、症状が
   *     「実装の欠陥」にしか見えない) を原理的に踏まない。
   *  ⛔ 96 / 0.93 をドライバへ写経しない — __world.heroGeom() から採る。
   *  ⭐ 札の矩形は getBoundingClientRect() を #worldStage の rect と zoom でワールド px へ
   *     逆算する (clientFromWorld の逆) = **実描画の結果**と**座標データ**の突き合わせ。 */
  m.cover = await page.evaluate(() => {
    const WM = window.WORLD_MAP, WD = window.__world;
    const g = WD.heroGeom();
    const z = WD.zoom();
    const stEl = document.getElementById('worldStage');
    if (!stEl || !z || !g) return null;
    const st = stEl.getBoundingClientRect();
    const signs = [];
    for (const id of Object.keys(WM.NODES)) {
      const el = document.getElementById('worldNode_' + id);
      const s = el ? el.querySelector('.worldSign') : null;
      if (!s) continue;
      const r = s.getBoundingClientRect();
      signs.push({ id: id, x: (r.left - st.left) / z, y: (r.top - st.top) / z,
                   w: r.width / z, h: r.height / z });
    }
    const ids = Object.keys(WM.NODES);
    const rows = [];
    for (const id of ids) {
      const n = WM.NODES[id];
      const hx = n.x - g.sprite / 2, hy = n.y - g.sprite * g.foot;
      for (const s of signs) {
        const ow = Math.max(0, Math.min(hx + g.sprite, s.x + s.w) - Math.max(hx, s.x));
        const oh = Math.max(0, Math.min(hy + g.sprite, s.y + s.h) - Math.max(hy, s.y));
        const area = s.w * s.h;
        rows.push({ at: id, sign: s.id, ow: ow, oh: oh, ratio: area > 0 ? (ow * oh) / area : 1 });
      }
    }
    return { zoom: z, geom: g, signCount: signs.length, nodeCount: ids.length,
             sizes: signs.map(s => s.id + ':' + s.w.toFixed(1) + 'x' + s.h.toFixed(1)), rows: rows };
  });

  /* 立ち位置の fail-safe。⚠ シナリオ id はドライバに写経せず tavern.html 由来のものを渡す。 */
  m.spawn = await page.evaluate((scenIds) => {
    const WM = window.WORLD_MAP;
    const byScen = {};
    for (const s of scenIds) byScen[s] = WM.spawnFor('dungeon', s);
    return {
      title: WM.spawnFor('title'),
      byScen: byScen,
      unknownVia: WM.spawnFor('__nope__'),
      missingVia: WM.spawnFor(),
      dungeonUnknownScen: WM.spawnFor('dungeon', '__nope__'),
    };
  }, opts.scenIds || []);

  /* ── 水 (経路 2 = codex1 が描いた画素) ─────────────────────────────────────
   *  依頼書 §2-6 の式:  水 = (B > R+18) && (B >= G)  →  MedianFilter(5)
   *  ⚠ boolean の median は 5x5 の多数決 (25 個中 13 個以上) と同値。
   *  ⚠ nowater 変異は **この検出器**を常に 0 にする (配信ではなくドライバ内の差し替え)。 */
  m.water = await page.evaluate(async (noWater) => {
    const WM = window.WORLD_MAP;
    const img = await new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'assets/world_region.jpg';
    });
    if (!img) return { ok: false, err: 'assets/world_region.jpg が読めない' };
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, W, H).data; }
    catch (e) { return { ok: false, err: 'getImageData: ' + String(e && e.message) }; }

    const N = W * H;
    const raw = new Uint8Array(N);
    if (!noWater) {
      for (let i = 0, p = 0; p < N; i += 4, p++) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (b > r + 18 && b >= gg) raw[p] = 1;
      }
    }
    // 5x5 の多数決 (分離可能な 2 パス)。端は edge クランプ。
    const hs = new Int32Array(N);
    for (let y = 0; y < H; y++) {
      const off = y * W;
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) { let xx = x + k; if (xx < 0) xx = 0; else if (xx >= W) xx = W - 1; s += raw[off + xx]; }
        hs[off + x] = s;
      }
    }
    const med = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) { let yy = y + k; if (yy < 0) yy = 0; else if (yy >= H) yy = H - 1; s += hs[yy * W + x]; }
        med[y * W + x] = (s >= 13) ? 1 : 0;
      }
    }
    const frac = (cx, cy) => {                       // 周囲 32px 角
      const x0 = Math.max(0, Math.round(cx) - 16), x1 = Math.min(W, Math.round(cx) + 16);
      const y0 = Math.max(0, Math.round(cy) - 16), y1 = Math.min(H, Math.round(cy) + 16);
      let c = 0;
      for (let y = y0; y < y1; y++) { const off = y * W; for (let x = x0; x < x1; x++) c += med[off + x]; }
      return c / ((x1 - x0) * (y1 - y0));
    };
    const nodes = {};
    for (const id of Object.keys(WM.NODES)) { const n = WM.NODES[id]; nodes[id] = frac(n.x, n.y); }
    const edges = [];
    for (const e of WM.EDGES) {
      const a = WM.NODES[e[0]], b = WM.NODES[e[1]];
      if (!a || !b) { edges.push({ edge: e[0] + '-' + e[1], broken: true, max: 1, pts: 0 }); continue; }
      const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      const steps = Math.max(1, Math.floor(len / 16));       // 16px 刻み
      let mx = 0, at = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const f = frac(x, y);
        if (f > mx) { mx = f; at = [Math.round(x), Math.round(y)]; }
      }
      edges.push({ edge: e[0] + '-' + e[1], len: Math.round(len * 10) / 10, pts: steps + 1, max: mx, at: at });
    }
    return {
      ok: true, W: W, H: H, nodes: nodes, edges: edges,
      sea: frac(64, 544),          // 対照: 海
      lake: frac(736, 480),        // 対照: 湖の中心
      edgePts: edges.reduce((s, e) => s + e.pts, 0),
    };
  }, !!opts.nowater);

  await page.close();
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 歩き (§3 (3b) / (3c)) — ⭐ **実際にマウスで押す**。goToNode() を直接呼ばない
 *   (呼ぶと「当たり判定が画面に出ていない」= 押せないノードを永久に緑と報告する)。
 * ⚠ 到着待ちは固定時間窓にしない。isMoving() が false になるまでポーリングする
 *   (経路の長さが 90px 〜 1,400px まで 15 倍違うので固定窓は原理的にフレークする)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const SPRITE = 96;        // 依頼書 §2-8: <class>_walk.png は 576x384 = 96px セル 6 列 x 4 行
const FOOT = 0.93;        // 依頼書 §2-8: 足元をルート上の点に置く接地比
const ROW_RIGHT = 3;      // 依頼書 §2-8: 右向きの行
const HIT_EPS = 0.5;      // px。style.left/top は文字列なので丸め誤差だけ許す
/* ⭐ #40「1 タップ = 最大 5 マス」以降、遠い拠点は 1 回では着かない → 着くまで押し直す。
 *  ⛔ 上限を外さない (無限ループは「動かなくなった実装」を隠す)。
 *  ⚠ 現行の最長経路は phlan→temple の 8 ホップ (2026-09-01 実測) なので 12 で足りる。 */
const MAX_TAPS = 12;

/* ⭐⭐⭐ #40 の余波 — **入場ノード (enter を持つ phlan) は押し直しループで測れない**。
 *  ⚠⚠⚠ あそこは「着いた瞬間に location.href が走る」ので、
 *    「heroNode() が一致するまで押す」形では一致する瞬間が永久に来ない (ページごと消える)。
 *    2026-09-02 実測: 押し直しループだけを入れた状態だと、遠くから phlan を 1 回押す
 *    3 箇所 ((4b) / (4c) の通し ③ / (3d)) のうち **遠い 2 箇所**が
 *    「遷移待ちタイムアウト」になり (4b)(4c)(4c-z)(9a) が同時に赤くなった。
 *    ⚠ 依頼書 §2-6 の「押し口はこの 2 箇所だけ」は **measureWalk / clickNode しか
 *      数えていなかった** = 実測で崩れた前提 (Promise.all で遷移を待つ 3 箇所は別勘定)。
 *  ⭐ 正解は「**細分化グラフ上で 1 つ手前の停留所まで歩いてから**、今までどおり
 *    『1 回押す → 遷移』を測る」。この最後の 1 クリックが (4b)/(3d) の主張そのもの。
 *  ⛔ assert の期待値は 1 つも変えない。⛔ 手前の id をドライバへ写経しない
 *    (ページの findWalkPath から引く)。⛔ ?walkstep=0 で逃げない。 */
async function walkNextTo(page, targetId, errs, tag) {
  const info = await page.evaluate((t) => {
    const WM = window.WORLD_MAP, W = window.__world;
    const here = W.heroNode();
    const fp = (typeof WM.findWalkPath === 'function') ? WM.findWalkPath(here, t) : WM.findPath(here, t);
    if (!fp) return { here: here, near: null, hops: null };
    return { here: here, near: (fp.length >= 2) ? fp[fp.length - 2] : here, hops: fp.length };
  }, targetId);
  /* ⚠ 手前の停留所は **刻み点のことがある** ので clientFromNode では引けない。 */
  const cli = (i) => page.evaluate((k) => {
    const W = window.__world;
    return (typeof W.clientFromPoint === 'function') ? W.clientFromPoint(k) : W.clientFromNode(k);
  }, i);
  const out = { here: info.here, near: info.near, hops: info.hops, taps: 0, landed: null };
  if (!info.near || info.near === info.here) { out.landed = info.here; return out; }
  let lastNode = info.here, pt = await cli(info.near);
  for (; out.taps < MAX_TAPS && pt; out.taps++) {
    await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
    try { await page.waitForFunction('!window.__world.isMoving()', { timeout: 40000, polling: 80 }); }
    catch (e) { errs.push(tag + '(装置) 到着待ちタイムアウト: ' + info.near); break; }
    const now = await page.evaluate(() => window.__world.heroNode());
    if (now === info.near) { out.taps++; break; }
    if (now === lastNode) break;      /* 1px も進まなくなったら打ち切り (assert 側が赤にする) */
    lastNode = now;
    pt = await cli(info.near);
  }
  try { out.landed = await page.evaluate(() => window.__world.heroNode()); } catch (e) { out.landed = null; }
  return out;
}

async function measureWalk(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + ' walk] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  const all = await page.evaluate(() => Object.keys(window.WORLD_MAP.NODES));
  /* ⚠⚠ **enter を持つノードは押した瞬間にページが遷移する** (港町フラン → town.html)。
   *   同じタブで歩き続けられないので、この関数の母集団からは外す。
   *   ⛔ 「測れないから省いた」を黙ってやらない: 外した集合を skipped として持ち帰り、
   *      (3b) が「外れているのは enter を持つノードちょうど 1 つだけ」を機械で確かめ、
   *      その 1 つは (3d) が **遷移する側**として別に測る (合わせて 14/14)。 */
  const enterIdsPage = await page.evaluate(() =>
    Object.keys(window.WORLD_MAP.NODES).filter(k => window.WORLD_MAP.NODES[k].enter !== undefined));
  const ids = opts.ids || all.filter(id => enterIdsPage.indexOf(id) < 0);
  const skipped = all.filter(id => ids.indexOf(id) < 0);
  const rows = [];
  for (const id of ids) {
    let pt = await page.evaluate((i) => window.__world.clientFromNode(i), id);
    /* 装置: そのノードが本当に画面に出ていて、押した先が自分 (か子孫) であること。
       ⛔ ここを省くと「帯の下に潜って押せない」を永久に緑と報告する。
       ⚠ **1 回目のタップの前**に採る (#40 の押し直しループを回した後だとカメラが
         動いた後の座標になり、装置が別の瞬間を測ってしまう)。 */
    const hit = await page.evaluate((i, x, y) => {
      const el = document.getElementById('worldNode_' + i);
      const top = document.elementFromPoint(Math.round(x), Math.round(y));
      return { has: !!el, onScreen: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
               self: !!el && !!top && (top === el || el.contains(top)),
               top: top ? (top.id || top.className || top.tagName) : null };
    }, id, pt.x, pt.y);
    /* ⭐ #40 以降、1 タップ = 最大 STEP_MAX_PX (320px) しか進まない → **着くまで押し直す**。
       ⛔ 上限 (MAX_TAPS) を外さない — 動かなくなった実装を無限ループで隠さないため。
       ⛔ ?walkstep=0 を URL へ足して逃げない — 本番の振る舞いを golden が測らなくなる。
       ⛔ assert の期待値 ((3b)(3z2)(7e)) は 1 つも変えていない。直したのは押し口だけ。
       ⚠⚠⚠ カメラが主人公を追うので client 座標は **毎タップ採り直す**
         (最初の pt を使い回すと 2 回目以降が的外れを押す)。 */
    let taps = 0, lastNode = null;
    for (; taps < MAX_TAPS; taps++) {
      await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
      try {
        await page.waitForFunction('!window.__world.isMoving()', { timeout: 25000, polling: 60 });
      } catch (e) { errs.push(tag + '到着待ちタイムアウト: ' + id); break; }
      const now = await page.evaluate(() => window.__world.heroNode());
      if (now === id) { taps++; break; }
      if (now === lastNode) break;      /* 1px も進まなくなったら打ち切り (assert 側が赤にする) */
      lastNode = now;
      pt = await page.evaluate((i) => window.__world.clientFromNode(i), id);
      if (!pt) { errs.push(tag + 'clientFromNode が null: ' + id); break; }
    }
    const r = await page.evaluate((i) => {
      const WM = window.WORLD_MAP, WD = window.__world;
      const n = WM.NODES[i];
      const h = document.getElementById('worldHero');
      const sh = document.getElementById('worldHeroShadow');
      return {
        id: i, node: WD.heroNode(), px: WD.heroPx(), moving: WD.isMoving(),
        /* ⭐ (7e): 押しても **歩くだけ**でページが変わらないこと。
           ⛔ 「location が変わっていない」を別ページで測り直さない — 押した直後のここで採る。 */
        path: location.pathname, search: location.search,
        kind: (WM.NODES[i] || {}).kind, hasEnter: WM.NODES[i].enter !== undefined,
        nx: n.x, ny: n.y,
        left: parseFloat(h.style.left), top: parseFloat(h.style.top),
        bp: h.style.backgroundPosition,
        shx: parseFloat(sh.style.left), shy: parseFloat(sh.style.top),
      };
    }, id);
    r.hit = hit;
    r.taps = taps;          /* ⭐ #40: 着くまでに要したタップ数 (記録用。assert の期待値ではない) */
    rows.push(r);
  }

  /* ── (3c) 線の無い座標をタップ → 1px も動かない ─────────────────────────────
   *  ⭐ 座標はドライバが決め打ちだが、「どのノードからも 100px 以上離れている」ことと
   *     「elementFromPoint が .worldNode ではない」ことを**その場で実測**してから押す。 */
  const before = await page.evaluate(() => window.__world.heroPx());
  const voids = [];
  for (const w of [[64, 544], [1440, 960]]) {
    const info = await page.evaluate((wx, wy) => {
      const WM = window.WORLD_MAP, WD = window.__world;
      let near = Infinity, who = '-';
      for (const id of Object.keys(WM.NODES)) {
        const n = WM.NODES[id];
        const d = Math.sqrt((n.x - wx) * (n.x - wx) + (n.y - wy) * (n.y - wy));
        if (d < near) { near = d; who = id; }
      }
      const c = WD.clientFromWorld(wx, wy);
      const top = document.elementFromPoint(Math.round(c.x), Math.round(c.y));
      return { wx, wy, near: near, who: who, c: c,
               onScreen: c.x >= 0 && c.y >= 0 && c.x < innerWidth && c.y < innerHeight,
               onNode: !!(top && top.closest && top.closest('.worldNode')),
               top: top ? (top.id || top.className || top.tagName) : null };
    }, w[0], w[1]);
    await page.mouse.click(Math.round(info.c.x), Math.round(info.c.y));
    voids.push(info);
  }
  await sleep(700);
  const after = await page.evaluate(() => ({ px: window.__world.heroPx(), node: window.__world.heroNode(),
                                             moving: window.__world.isMoving() }));
  await page.close();
  return { rows: rows, voids: voids, before: before, after: after, ids: ids,
           /* ⚠ subset = 呼び手が ids を明示した (負のコントロールの抜き取り)。
              そのときは「全ノードを網羅したか」ではなく「遷移するノードを含んでいないか」だけ見る。 */
           subset: !!opts.ids, skipped: skipped, enterIds: enterIdsPage, allCount: all.length };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §3 (3d) / §4 (4a)(4b) — 一回性のキーと遷移 (⭐⭐⭐ 本チケットの核心)
 * ⛔ ここで測るのは「world.html がキーを **消していない**」と「town.html が **読めている**」の
 *   2 つ。(4a) だけだと「消していないが読めてもいない」を、(4b) だけだと「world が食っても
 *   行き先が同じなので気づけない」を見逃す (依頼書 §8 が両方を要求する理由)。
 * ⚠ sessionStorage はページを開く前には書けないので、一度 world.html を開いて書き込み、
 *   **同じタブで reload** して「そのキーを持って world.html に入った」状態を作る。
 * ══════════════════════════════════════════════════════════════════════════════ */
const KEY_EXIT = 'dragonfighters.exitVia';
const KEY_SCEN = 'dragonfighters.currentScenario';

async function measureKeys(browser, port, errs, scenIds) {
  const out = { spawn: [], arrive: null, direct: null };
  const url = 'http://localhost:' + port + PAGE_PATH;
  const page = await browser.newPage();
  const tag = '[:' + port + ' keys] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let u = ''; try { u = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (u ? ' <' + u + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });

  /* ── (4a) 6 シナリオ全部で「帰ってきた場所に立つ」+「キーが残っている」 ────────
   *  ⛔ 期待するノード id をドライバに写経しない。**ページ側の WORLD_MAP.SITES** から引く。 */
  for (const scen of scenIds) {
    await page.evaluate((k1, k2, s) => {
      sessionStorage.setItem(k1, 'dungeon');
      sessionStorage.setItem(k2, s);
    }, KEY_EXIT, KEY_SCEN, scen);
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
    await settle(page);
    out.spawn.push(await page.evaluate((k1, k2, s) => ({
      scen: s,
      want: window.WORLD_MAP.SITES[s],
      node: window.__world.heroNode(),
      via: window.__world.spawnVia(),
      /* ★ 罠 A: world.html は読むだけ。消えていたらここが null になる */
      exitVia: sessionStorage.getItem(k1),
      scenario: sessionStorage.getItem(k2),
      path: location.pathname,
    }), KEY_EXIT, KEY_SCEN, scen));
  }

  /* ── (4b) そのまま港町フランの札を押す → town.html が exitVia を消費して (10,3) に立つ ──
   *  ⚠ ここは **(4a) の最後の状態のまま**続ける (別ページで作り直すと通しでなくなる)。
   *  ⭐ eatvia 変異では world が先に食っているので town は null を読む。それでも
   *     spawnFor(null) の fail-safe が (10,3) なので **(4b) は緑のまま** = 罠 A の本体。 */
  const enterId = await page.evaluate(() =>
    Object.keys(window.WORLD_MAP.NODES).find(k => window.WORLD_MAP.NODES[k].enter !== undefined));
  /* ⭐ #40: (4a) の最後は SITES[scenario] (廃坑など) に立っているので、そこから
     入場ノードまでは 1 タップでは届かない → **1 つ手前まで歩いてから**押す。
     ⛔ 期待値は 1 つも変えていない (押すのは今までどおり最後の 1 回だけ)。 */
  out.pre4b = await walkNextTo(page, enterId, errs, tag + '(4b) ');
  const pt = await page.evaluate((i) => window.__world.clientFromNode(i), enterId);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 40000 }),
    page.mouse.click(Math.round(pt.x), Math.round(pt.y)),
  ]).catch(e => errs.push(tag + '(4b) 遷移待ちタイムアウト: ' + String(e && e.message).split('\n')[0]));
  await page.waitForFunction('!!window.__town', { timeout: 20000 }).catch(() => {});
  await settle(page);
  out.arrive = await page.evaluate((k1) => ({
    path: location.pathname, search: location.search,
    hasTown: !!window.__town,
    tile: window.__town ? window.__town.heroTile() : null,
    spawnVia: window.__town ? window.__town.spawnVia() : undefined,
    /* ★ 一回性: town.html が消費したので、ここでは必ず null */
    exitVia: sessionStorage.getItem(k1),
    wantTile: (window.TOWN_MAP && window.TOWN_MAP.SPAWNS) ? window.TOWN_MAP.SPAWNS.dungeon : null,
  }), KEY_EXIT);
  await page.close();

  /* ── (3d) キーを 1 つも置かない素の入場から、港町フランの札で town.html へ ─────────
   *  ⭐ 別タブでやる (上の通しは exitVia を持っている = 入口が 2 種類あるかを見られない)。
   *  ⚠ (3d) の主張は「**location.search が空文字**」= 入口が 2 種類になっていないこと。 */
  const p2 = await browser.newPage();
  p2.on('pageerror', e => errs.push(tag + '(3d) PAGEERROR ' + e.message));
  await p2.setViewport({ width: 1280, height: 900 });
  await p2.goto(url, { waitUntil: 'load', timeout: 30000 });
  await p2.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(p2);
  /* ⭐ #40: 素の入場では駒は pier = 入場ノードの隣なので **今日どおり 0 タップ**だが、
     地図が変わったときに黙って「1 回では着かない」へ倒れないよう同じ装置を通す。 */
  out.pre3d = await walkNextTo(p2, enterId, errs, tag + '(3d) ');
  const before = await p2.evaluate(() => ({ node: window.__world.heroNode(), path: location.pathname }));
  const pt2 = await p2.evaluate((i) => window.__world.clientFromNode(i), enterId);
  const hit2 = await p2.evaluate((i, x, y) => {
    const el = document.getElementById('worldNode_' + i);
    const top = document.elementFromPoint(Math.round(x), Math.round(y));
    return { self: !!el && !!top && (top === el || el.contains(top)),
             top: top ? (top.id || top.className || top.tagName) : null };
  }, enterId, pt2.x, pt2.y);
  let navThrew = '';
  await Promise.all([
    p2.waitForNavigation({ waitUntil: 'load', timeout: 40000 }),
    p2.mouse.click(Math.round(pt2.x), Math.round(pt2.y)),
  ]).catch(e => { navThrew = String((e && e.message) || e).split('\n')[0]; });
  await settle(p2);
  out.direct = Object.assign({ enterId: enterId, from: before.node, hit: hit2, navThrew: navThrew },
    await p2.evaluate(() => ({
      path: location.pathname, search: location.search, hash: location.hash,
      hasTown: !!window.__town,
    })));
  await p2.close();
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §5 (5a) — compact でも遊べる
 * ⚠⚠⚠ **「黒帯」は幾何ではなく画素で測る。**
 *   依頼書 §2-8 は desktop を「全体が入る倍率で固定」と決めている。1536x1024 (3:2) を
 *   1440x900 (16:10) へ全部入れると **幾何的な余白は 13.3%** 出る (1280x900 で 2.5% /
 *   390x844 は compact 側の式なので 0%)。これは欠陥ではなく「地図の全体を入れる」の必然。
 *   ⭐ その余白は #worldBackdrop (同じ地図の blur + brightness 0.34) が埋めていて **黒くない**。
 *   → 測るのは「**素の背景色 #0a0805 が可視域のどれだけを占めるか**」。
 *   ⛔ 数字を下げるために desktop を「可視域を満たす」へ倒さない (地図の端が切れる)。
 * ⭐ 画素は **本番のスクリーンショットを撮り、それをページへ戻して canvas で数える**
 *   (node 側に PNG デコーダを持ち込まない。水の測定と同じ道具立て)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const RAW_BG = [10, 8, 5];         // body { background: #0a0805 } — world.html の実体

async function measureViewports(browser, port, errs, sizes) {
  const rows = [];
  for (const s of sizes) {
    const page = await browser.newPage();
    const tag = '[:' + port + ' ' + s.w + 'x' + s.h + '] ';
    page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
    page.on('console', mm => {
      if (mm.type() !== 'error') return;
      let u = ''; try { u = (mm.location() && mm.location().url) || ''; } catch (e) {}
      if (/\/favicon\.ico$/.test(u)) return;
      errs.push(tag + 'CONSOLE ' + mm.text() + (u ? ' <' + u + '>' : ''));
    });
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1,
      isMobile: !!s.mobile, hasTouch: !!s.mobile });
    await page.goto('http://localhost:' + port + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
    await settle(page);

    const geo = await page.evaluate(() => {
      const WD = window.__world, WM = window.WORLD_MAP;
      const h = document.getElementById('worldHero');
      const r = h.getBoundingClientRect();
      const de = document.documentElement, bd = document.body;
      return {
        vw: innerWidth, vh: innerHeight,
        compact: WD.compact(), zoom: WD.zoom(), insets: WD.insets(),
        /* ① 横スクロールバー: 文書の幅が窓を超えていないこと (body も html も見る) */
        scrollW: Math.max(de.scrollWidth, bd.scrollWidth),
        scrollH: Math.max(de.scrollHeight, bd.scrollHeight),
        /* ③ 駒が画面内 (矩形が可視域と交わる。左右上下どこかへ出ていたら赤) */
        hero: { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height },
        heroInside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        /* 幾何の余白 (記録用。⛔ これで合否を決めない) */
        stageW: WM.W * WD.zoom(), stageH: WM.H * WD.zoom(),
        backdrop: (function () {
          const b = document.getElementById('worldBackdrop');
          if (!b) return null;
          const br = b.getBoundingClientRect();
          return { w: br.width, h: br.height, covers: br.left <= 0 && br.top <= 0
            && br.right >= innerWidth && br.bottom >= innerHeight };
        })(),
      };
    });

    /* ② 素の背景色が見えている画素の割合 (本番のスクリーンショットを画素で数える) */
    const shot = await page.screenshot({ encoding: 'base64' });
    const pix = await page.evaluate(async (b64, raw) => {
      const img = await new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = () => res(null);
        im.src = 'data:image/png;base64,' + b64;
      });
      if (!img) return { ok: false, err: 'スクリーンショットを読み込めない' };
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      let d;
      try { d = g.getImageData(0, 0, cv.width, cv.height).data; }
      catch (e) { return { ok: false, err: 'getImageData: ' + String(e && e.message) }; }
      const N = cv.width * cv.height;
      let bare = 0, vdark = 0;
      const seen = new Set();
      for (let i = 0, p = 0; p < N; i += 4, p++) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (r === raw[0] && gg === raw[1] && b === raw[2]) bare++;
        if (r <= 12 && gg <= 12 && b <= 12) vdark++;
        if (seen.size < 400) seen.add((r << 16) | (gg << 8) | b);
      }
      return { ok: true, W: cv.width, H: cv.height, N: N,
               bare: bare, bareFrac: bare / N, vdark: vdark, vdarkFrac: vdark / N,
               colors: seen.size };
    }, shot, RAW_BG);

    await page.close();
    rows.push({ label: s.w + 'x' + s.h + (s.mobile ? ' (縦持ち)' : ' (desktop)'), size: s, geo: geo, pix: pix });
  }
  return rows;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §6 (6a) / (6c-title) — 撤退スイッチ (title.html 側)
 * ⭐ 「world.html を経由しない」は **リクエストログ**で見る。着地点だけでは
 *   「一度 world.html へ行ってから town.html へ落ちた」を素通りさせてしまう。
 * ⚠ ?title=0 は読み込み中に location.replace() するので goto が reject し得る。
 *   そこだけ握って readyState をポーリングする (無条件 try/catch にしない)。
 * ══════════════════════════════════════════════════════════════════════════════ */
async function measureTitleDest(browser, port, errs, query, from) {
  const entry = (from || '/title.html') + query;
  const page = await browser.newPage();
  const tag = '[:' + port + ' ' + entry + '] ';
  const reqs = [];
  page.on('request', r => { try { reqs.push(new URL(r.url()).pathname); } catch (e) {} });
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  await page.setViewport({ width: 1280, height: 900 });
  let navThrew = '';
  try {
    await page.goto('http://localhost:' + port + entry, { waitUntil: 'load', timeout: 30000 });
  } catch (e) { navThrew = String((e && e.message) || e).split('\n')[0]; }
  await page.waitForFunction(() => document.readyState !== 'loading', { timeout: 20000 }).catch(() => {});
  await sleep(900);
  const at = await page.evaluate(() => ({ path: location.pathname, search: location.search }));
  await page.close();
  return { query: query, path: at.path, search: at.search, navThrew: navThrew,
           reqs: reqs, sawWorld: reqs.some(p => /\/world\.html$/.test(p)) };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §6 (6b) / (6c-index) — 撤退スイッチ (index.html 側 = ダンジョンからの帰還)
 * ⭐ **返り値を読むだけで済ませない。** dfReturnPage() の文字列だけ見ると、呼び口が
 *   死んでいても / 返り先が 404 でも緑になる。返り値を読んだうえで **実際に飛ばして着地**を見る。
 * ⚠ dfReturnPage() は副作用 (townOff / worldOff / exitVia の書き込み) を持つが冪等なので、
 *   読み取り 1 回 + 遷移 1 回で 2 度呼んでも状態は変わらない。
 * ⚠ index.html は classic script 直下の function 宣言なので **window に載る** (実測済み)。
 *   ⛔ RUN のような const とは違うので `window.` を外す必要は無い。
 * ══════════════════════════════════════════════════════════════════════════════ */
async function measureReturnDest(browser, port, errs, query) {
  const entry = '/index.html' + query;
  const page = await browser.newPage();
  const tag = '[:' + port + ' ' + entry + '] ';
  const reqs = [];
  page.on('request', r => { try { reqs.push(new URL(r.url()).pathname); } catch (e) {} });
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let u = ''; try { u = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (u ? ' <' + u + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  let ret = null, navThrew = '';
  try {
    await page.goto('http://localhost:' + port + entry, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('typeof window.dfReturnPage === "function"', { timeout: 25000 });
    ret = await page.evaluate(() => window.dfReturnPage());
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      page.evaluate(() => { window.location.href = window.dfReturnPage(); }),
    ]);
  } catch (e) { navThrew = String((e && e.message) || e).split('\n')[0]; }
  await page.waitForFunction(() => document.readyState !== 'loading', { timeout: 20000 }).catch(() => {});
  await sleep(800);
  const at = await page.evaluate(() => ({ path: location.pathname, search: location.search }));
  await page.close();
  /* ⚠ 起点の /index.html は当然リクエストに入るので、着地側だけを見る指標として
   *   「world.html を要求したか」を持ち帰る (6a) と同じ形)。 */
  return { query: query, ret: ret, path: at.path, search: at.search, navThrew: navThrew,
           reqs: reqs, sawWorld: reqs.some(p => /\/world\.html$/.test(p)) };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §4 (4c) — 結果チャネルの通し検査 (ダンジョン → world → town → tavern)
 * ⭐⭐⭐ **本チケットで新しく壊しうる唯一の既存機能。** lastResult は
 *   index.html:35409 が書き、**tavern.html:4121 が消費**する。間に world.html を 1 枚
 *   挟むので、地図が消してしまうと「酒場のリザルト画面が黙って出なくなる」。
 *   ⚠ 画面に何も出ないという壊れ方なので、プレイしていても気づけない。
 * ⭐ 4 つの停留所すべてで lastResult の生死を採り、最後に **酒場のバナーの実文字列**まで見る
 *   (「消費された」だけだと、どこかで消えていても最後は同じ null になって見分けられない)。
 * ⚠ 置くのは cleared ではなく **retreated**。cleared にすると tavern 側が
 *   progress.cleared / plazaState を書き換えてしまい、検証がプロファイルを汚す。
 * ══════════════════════════════════════════════════════════════════════════════ */
const KEY_RESULT = 'dragonfighters.lastResult';
/* ⭐ ドライバが置いた一意の文字列。酒場のバナーにそのまま出るので、
 *   「バナーが出た」を **本文の照合**で確かめられる (要素の有無だけだと弱い)。 */
const RESULT_TITLE = '通し検査の依頼';

async function measureResultChannel(browser, port, errs) {
  const tag = '[:' + port + ' 4c] ';
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let u = ''; try { u = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (u ? ' <' + u + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  const out = { threw: '' };
  try {
    // ── ① ダンジョン (index.html) — リザルトを書いて帰還する ────────────────
    await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('typeof window.dfReturnPage === "function"', { timeout: 25000 });
    out.dungeon = await page.evaluate((k, title, scen) => {
      sessionStorage.setItem(k, JSON.stringify({
        scenarioId: scen, scenarioTitle: title, cleared: false, defeated: false, retreated: true,
      }));
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      return { path: location.pathname, next: window.dfReturnPage(), lastResult: sessionStorage.getItem(k) };
    }, KEY_RESULT, RESULT_TITLE, 'goblin-mine');

    // ── ② 地方全景 (world.html) — ⛔ ここが消してはいけない ────────────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      page.evaluate(() => { window.location.href = window.dfReturnPage(); }),
    ]);
    await page.waitForFunction('!!window.__world', { timeout: 20000 }).catch(() => {});
    await settle(page);
    out.world = await page.evaluate((k) => ({
      path: location.pathname, search: location.search,
      node: window.__world ? window.__world.heroNode() : null,
      lastResult: sessionStorage.getItem(k),
      exitVia: sessionStorage.getItem('dragonfighters.exitVia'),
    }), KEY_RESULT);

    // ── ③ 港町フラン (town.html) — 札を実クリックして入る ──────────────────
    const enterId = await page.evaluate(() =>
      Object.keys(window.WORLD_MAP.NODES).find(k => window.WORLD_MAP.NODES[k].enter !== undefined));
    /* ⭐ #40: 帰還直後の駒は SITES["goblin-mine"] = 廃坑なので 1 タップでは港町へ届かない。
       ⛔ ここを直さないと通しが例外で止まり (4c)(4c-z) が **通しの中身を 1 つも測れないまま**赤くなる。 */
    out.pre = await walkNextTo(page, enterId, errs, tag);
    const pt = await page.evaluate((i) => window.__world.clientFromNode(i), enterId);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      page.mouse.click(Math.round(pt.x), Math.round(pt.y)),
    ]);
    await page.waitForFunction('!!window.__town', { timeout: 20000 }).catch(() => {});
    await settle(page);
    out.town = await page.evaluate((k) => ({
      path: location.pathname, tile: window.__town ? window.__town.heroTile() : null,
      lastResult: sessionStorage.getItem(k),
    }), KEY_RESULT);

    // ── ④ 銀の鹿亭 (tavern.html) — 立て札を実クリックして入る ──────────────
    const sp = await page.evaluate(() => {
      const el = document.getElementById('townSign_tavern');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    out.signFound = !!sp;
    if (sp) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
        page.mouse.click(Math.round(sp.x), Math.round(sp.y)),
      ]);
    }
    /* ⚠ バナーは consumeResult() から setTimeout(…, 100) で出るので、固定時間で読まずに
     *   **出るまでポーリング**する (出なければそのまま assert に落とす)。 */
    await page.waitForFunction((t) => Array.prototype.some.call(
      document.querySelectorAll('body > div'), d => d.textContent && d.textContent.indexOf(t) >= 0),
      { timeout: 15000 }, RESULT_TITLE).catch(() => {});
    out.tavern = await page.evaluate((k, t) => {
      const hits = Array.prototype.filter.call(document.querySelectorAll('body > div'),
        d => d.textContent && d.textContent.indexOf(t) >= 0);
      return { path: location.pathname, search: location.search,
        banners: hits.length, text: hits.length ? hits[0].textContent.slice(0, 80) : null,
        lastResult: sessionStorage.getItem(k) };
    }, KEY_RESULT, RESULT_TITLE);
  } catch (e) { out.threw = String((e && e.message) || e).split('\n')[0]; }
  await page.close();
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §8 BGM — ⭐⭐⭐ **2 経路**で測る (経路A = 渡した ID / 経路B = 実際に鳴っているか)
 *   経路A は evaluateOnNewDocument で window.GameAudio に **setter を仕掛け**、audio.js 末尾の
 *   `global.GameAudio = GameAudio;` が走った瞬間に playBgm を包む
 *   (page.evaluate で後から包むと **ロード時の 1 本が原理的に見えない**)。
 *   経路B は __bgmFileState() に加えて **mp3 を実際に要求したか** をリクエストログで見る
 *   (テーブルの src を読み直すと「写経どうしの突き合わせ」になるため、ネットワーク側から採る)。
 * ⚠ ジェスチャは **実座標クリック**。ただし押す場所は「線もノードも無い所」を
 *   その場で実測してから押す (ノードを押すと駒が歩き出して測りたい経路と関係ない差が入る)。
 * ══════════════════════════════════════════════════════════════════════════════ */
async function measureBgm(browser, port, errs) {
  const tag = '[:' + port + ' bgm] ';
  const page = await browser.newPage();
  const reqs = [];
  page.on('request', r => { try { reqs.push(new URL(r.url()).pathname); } catch (e) {} });
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let u = ''; try { u = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (u ? ' <' + u + '>' : ''));
  });
  await page.evaluateOnNewDocument(() => {
    window.__bgmCalls = [];
    window.__spyInstalled = false;
    let _ga;
    Object.defineProperty(window, 'GameAudio', {
      configurable: true,
      get() { return _ga; },
      set(v) {
        _ga = v;
        if (v && typeof v.playBgm === 'function') {
          const ob = v.playBgm;
          v.playBgm = function (n) { try { window.__bgmCalls.push(n); } catch (e) {} return ob.apply(this, arguments); };
          window.__spyInstalled = true;
        }
      },
    });
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.GameAudio && !!window.__world', { timeout: 20000 });
  await settle(page);

  const out = {};
  out.spyInstalled = await page.evaluate(() => window.__spyInstalled === true);
  /* ★ どのクリックよりも前に採る = 「ロード時に渡した ID」(経路A) */
  out.loadCalls = await page.evaluate(() => window.__bgmCalls.slice());
  out.files = await page.evaluate(() => { try { return window.GameAudio.__bgmFiles(); } catch (e) { return []; } });
  out.beforeState = await page.evaluate(() => {
    try { return window.GameAudio.__bgmFileState(); } catch (e) { return { err: String(e && e.message) }; }
  });
  out.trackBefore = reqs.some(p => /\/assets\/bgm\/fierd\.mp3$/.test(p));

  /* ジェスチャの位置は「線もノードも無い所」を実測してから決める (⛔ 決め打ちで押さない)。 */
  const gp = await page.evaluate(() => {
    const WM = window.WORLD_MAP, WD = window.__world;
    const c = WD.clientFromWorld(64, 544);          // 海。(3c) と同じ「線の無い座標」
    let near = Infinity, who = '-';
    for (const id of Object.keys(WM.NODES)) {
      const n = WM.NODES[id];
      const d = Math.sqrt((n.x - 64) * (n.x - 64) + (n.y - 544) * (n.y - 544));
      if (d < near) { near = d; who = id; }
    }
    const top = document.elementFromPoint(Math.round(c.x), Math.round(c.y));
    return { c: c, near: near, who: who,
      onScreen: c.x >= 0 && c.y >= 0 && c.x < innerWidth && c.y < innerHeight,
      onNode: !!(top && top.closest && top.closest('.worldNode')),
      top: top ? (top.id || top.className || top.tagName) : null };
  });
  out.gesture = gp;
  await page.mouse.click(Math.round(gp.c.x), Math.round(gp.c.y));
  /* ⚠ 鳴り出すまでポーリング。鳴らなければ待ち切って、そのまま assert に落とす。 */
  await page.waitForFunction(() => {
    try { const s = window.GameAudio.__bgmFileState(); return !!s && !!s.id && s.paused === false; }
    catch (e) { return false; }
  }, { timeout: 9000 }).catch(() => {});
  out.afterCalls = await page.evaluate(() => window.__bgmCalls.slice());
  out.state = await page.evaluate(() => {
    try { return window.GameAudio.__bgmFileState(); } catch (e) { return { err: String(e && e.message) }; }
  });
  out.heroNode = await page.evaluate(() => window.__world.heroNode());
  await page.close();
  out.sawTrack = reqs.some(p => /\/assets\/bgm\/fierd\.mp3$/.test(p));
  return out;
}

/* ⭐ 札の文言の唯一の正 = 配信中の tavern.html の実体。⛔ ドライバに文字列を写経しない。 */
async function readTavernPlaces(port) {
  const r = await httpGet('http://localhost:' + port + '/tavern.html');
  const re = /id:\s*"([a-z0-9-]+)"\s*,\s*place:\s*"([^"]+)"/g;
  const map = {}; const order = [];
  let mm;
  while ((mm = re.exec(r.body)) !== null) { map[mm[1]] = mm[2]; order.push(mm[1]); }
  return { status: r.status, bytes: r.body.length, map: map, order: order };
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (⭐ 1 つの assert = 1 つの純粋な述語。素でも変異でも同じ式を回す)
// ══════════════════════════════════════════════════════════════════════════════
const px = (t) => t * 64;
const hypot = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const siteIds = (m) => Object.keys(m.map.nodes).filter(id => m.map.nodes[id].kind === 'site');
const enterIds = (m) => Object.keys(m.map.nodes).filter(id => m.map.nodes[id].enter !== undefined);

const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', '[装置] WORLD_MAP.NODES / EDGES が 0 件でない (これが無いと以降の全 assert が空振りで永久緑)',
    m => [Object.keys(m.map.nodes).length > 0 && m.map.edges.length > 0,
      'nodes=' + Object.keys(m.map.nodes).length + ' edges=' + m.map.edges.length]],
  ['0d', '[装置] 公開シグネチャが揃っている (findPath / neighbors / spawnFor)',
    m => [m.map.fnFindPath && m.map.fnNeighbors && m.map.fnSpawnFor,
      JSON.stringify({ findPath: m.map.fnFindPath, neighbors: m.map.fnNeighbors, spawnFor: m.map.fnSpawnFor })]],
  ['0b', '素材が 1536x1024 で読めている (<img id="worldBg"> の naturalWidth/Height を DOM から)'
    + ' ⛔ 期待値は直書きせず WORLD_MAP.W/H と突き合わせる',
    m => [m.render.ok === true && m.render.bgW > 0 && m.render.bgH > 0
      && m.render.bgW === m.map.W && m.render.bgH === m.map.H,
      'img=' + m.render.bgW + 'x' + m.render.bgH + ' / WORLD_MAP=' + m.map.W + 'x' + m.map.H]],

  // ── §1 ルートは水の上を通らない ────────────────────────────────────────────
  ['1z', '[装置] 絵の画素を実際に読めて、サンプル点の母集団が空でない',
    m => [m.water.ok === true && m.water.edgePts >= 100 && Object.keys(m.water.nodes).length === Object.keys(m.map.nodes).length,
      m.water.ok ? ('edgePts=' + m.water.edgePts + ' nodes=' + Object.keys(m.water.nodes).length
        + ' img=' + m.water.W + 'x' + m.water.H) : String(m.water.err)]],
  ['1a', '全ノード + 全エッジ (16px 刻み) の周囲 32px 角の水率が 40% 未満 (⛔ 例外なし)',
    m => {
      if (!m.water.ok) return [false, String(m.water.err)];
      const badN = Object.keys(m.water.nodes).filter(id => m.water.nodes[id] >= WATER_MAX)
        .map(id => id + '=' + (m.water.nodes[id] * 100).toFixed(1) + '%');
      const badE = m.water.edges.filter(e => e.max >= WATER_MAX)
        .map(e => e.edge + '=' + (e.max * 100).toFixed(1) + '%@' + JSON.stringify(e.at));
      let worst = 0, who = '-';
      for (const id of Object.keys(m.water.nodes)) if (m.water.nodes[id] > worst) { worst = m.water.nodes[id]; who = 'node:' + id; }
      for (const e of m.water.edges) if (e.max > worst) { worst = e.max; who = 'edge:' + e.edge; }
      return [badN.length === 0 && badE.length === 0,
        '最悪 ' + (worst * 100).toFixed(1) + '% (' + who + ')'
        + (badN.length + badE.length ? '  ⛔ ' + badN.concat(badE).join(' ') : '')];
    }],
  ['1b', '[対照] 海 (64,544) の水率 > 90% / 湖の中心 (736,480) > 60% (検出器が全部 0 を返していない)',
    m => [m.water.ok === true && m.water.sea > 0.90 && m.water.lake > 0.60,
      m.water.ok ? ('海=' + (m.water.sea * 100).toFixed(1) + '% 湖=' + (m.water.lake * 100).toFixed(1) + '%')
        : String(m.water.err)]],

  // ── §2 線とグラフが同一データ (罠 C) ───────────────────────────────────────
  ['2a', '画面に描かれた線分の本数が EDGES.length と一致し、data-edge の集合も EDGES と一致する',
    m => {
      if (!m.render.ok) return [false, String(m.render.err)];
      const got = m.render.drawn.map(d => d.edge).slice().sort();
      const want = m.render.want.map(d => d.edge).slice().sort();
      return [m.render.edgeCount > 0 && m.render.lineCount === m.render.edgeCount
        && JSON.stringify(got) === JSON.stringify(want),
        '線分=' + m.render.lineCount + ' / EDGES=' + m.render.edgeCount
        + (JSON.stringify(got) === JSON.stringify(want) ? '' : '  ⛔ 集合違い got=' + JSON.stringify(got))];
    }],
  ['2b', '各線分の両端の画面座標が、対応する 2 ノードの座標 (x zoom) と 2px 以内で一致する'
    + ' (⛔ ドライバに座標表を写経せず WORLD_MAP から引く)',
    m => {
      if (!m.render.ok) return [false, String(m.render.err)];
      const by = {};
      for (const d of m.render.drawn) by[d.edge] = d;
      let matched = 0, worst = 0, who = '-';
      const bad = [];
      for (const w of m.render.want) {
        const d = by[w.edge];
        if (!d || d.bad || !w.s1 || !w.s2) { bad.push(w.edge + ':' + ((d && d.bad) || '線分が無い')); continue; }
        matched++;
        const e1 = Math.max(Math.abs(d.s1.x - w.s1.x), Math.abs(d.s1.y - w.s1.y));
        const e2 = Math.max(Math.abs(d.s2.x - w.s2.x), Math.abs(d.s2.y - w.s2.y));
        const e = Math.max(e1, e2);
        if (e > worst) { worst = e; who = w.edge; }
        if (e > 2) bad.push(w.edge + '=' + e.toFixed(2) + 'px');
      }
      return [m.render.want.length > 0 && matched === m.render.want.length && bad.length === 0,
        '照合 ' + matched + '/' + m.render.want.length + ' zoom=' + m.render.zoom.toFixed(4)
        + ' 最大ズレ ' + worst.toFixed(2) + 'px (' + who + ')'
        + (bad.length ? '  ⛔ ' + bad.slice(0, 6).join(' ') : '')];
    }],

  // ── §3 歩ける / 歩けない ───────────────────────────────────────────────────
  ['3z', '[装置] findPath が「存在しないノード」には null を返し、同じノードには [] を返す (常に非 null ではない)',
    m => [m.reach.nullProbe === true && m.reach.selfEmpty === true,
      'nullProbe=' + m.reach.nullProbe + ' selfEmpty=' + m.reach.selfEmpty]],
  ['3a', 'phlan から全ノードへ本番の WORLD_MAP.findPath が null を返さない (孤立ノード 0 件)',
    m => {
      const bad = Object.keys(m.reach.paths).filter(id => m.reach.paths[id] === null);
      return [bad.length === 0 && Object.keys(m.reach.paths).length === Object.keys(m.map.nodes).length,
        '到達 ' + (Object.keys(m.reach.paths).length - bad.length) + '/' + Object.keys(m.map.nodes).length
        + (bad.length ? '  ⛔ 孤立=' + bad.join(',') : '')];
    }],

  ['3z2', '[装置] 駒の幾何が依頼書 §2-8 どおり (96px セル / FOOT 0.93 / 右向き行 3 = backgroundPosition Y -288px)',
    m => {
      const g = m.render.geom || {};
      const bp = (m.walk && m.walk.rows.length) ? m.walk.rows[m.walk.rows.length - 1].bp : '';
      const okBp = /(^|\s)-?0px\s+-288px$/.test(bp) || /-288px$/.test(bp);
      return [g.sprite === SPRITE && g.foot === FOOT && g.rowRight === ROW_RIGHT && okBp,
        JSON.stringify(g) + ' backgroundPosition="' + bp + '"'];
    }],
  ['3b', 'ノードをタップ → 駒がそのノードの座標に立つ (FOOT=0.93 の接地込み) — 全ノードで測る',
    m => {
      if (!m.walk) return [false, 'walk 未測定'];
      const bad = [];
      for (const r of m.walk.rows) {
        const why = [];
        if (!r.hit.has) why.push('要素が無い');
        if (!r.hit.onScreen) why.push('画面外');
        if (!r.hit.self) why.push('押した先が別要素(' + r.hit.top + ')');
        if (r.node !== r.id) why.push('heroNode=' + r.node);
        if (Math.abs(r.px.x - r.nx) > HIT_EPS || Math.abs(r.px.y - r.ny) > HIT_EPS) why.push('px=' + r.px.x + ',' + r.px.y);
        if (Math.abs(r.left - (r.nx - SPRITE / 2)) > HIT_EPS) why.push('left=' + r.left);
        if (Math.abs(r.top - (r.ny - SPRITE * FOOT)) > HIT_EPS) why.push('top=' + r.top + ' 期待=' + (r.ny - SPRITE * FOOT));
        if (Math.abs(r.shx - r.nx) > HIT_EPS || Math.abs(r.shy - r.ny) > HIT_EPS) why.push('shadow=' + r.shx + ',' + r.shy);
        if (why.length) bad.push(r.id + '[' + why.join('/') + ']');
      }
      /* ⭐ 母集団から外れているのは **enter を持つノードちょうど 1 つ**だけ。
         それは押すと遷移してしまい同じタブで歩き続けられないので、(3d) が別に測る。
         ⛔ 「測れないから省いた」を黙って許さないための装置 (外した集合を突き合わせる)。
         ⚠ 負のコントロールが ids を明示して抜き取る場合だけは網羅を問わない
           (代わりに「遷移するノードを混ぜていない」= 途中でタブが飛ばないことを確かめる)。 */
      const skipOk = m.walk.subset
        ? m.walk.ids.every(id => m.walk.enterIds.indexOf(id) < 0)
        : JSON.stringify(m.walk.skipped.slice().sort())
          === JSON.stringify(m.walk.enterIds.slice().sort());
      return [m.walk.rows.length === m.walk.ids.length && m.walk.rows.length > 0
        && bad.length === 0 && skipOk,
        m.walk.rows.length + '/' + m.walk.allCount + ' ノードを実クリック (残り '
        + JSON.stringify(m.walk.skipped) + ' は遷移するので (3d) が測る)'
        + (skipOk ? '' : '  ⛔ 外した集合が enter の集合と違う enter=' + JSON.stringify(m.walk.enterIds))
        + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' ') : '  全部その座標へ接地')];
    }],
  ['3d', '★港町フランの札をタップ → 歩いてから town.html へ遷移し、**location.search が空文字** '
    + '(⛔ 遷移先にクエリを足していない = 入口が 2 種類になっていない)',
    m => {
      if (!m.keys || !m.keys.direct) return [false, 'keys 未測定'];
      const d = m.keys.direct;
      const ok = d.hit.self === true && d.from !== d.enterId
        && /\/town\.html$/.test(d.path) && d.search === '' && d.hash === ''
        && d.hasTown === true;
      return [ok, JSON.stringify({ 押した札: d.enterId, 出発ノード: d.from, 着地: d.path,
        search: d.search, town側のシームが居る: d.hasTown, 押した先: d.hit.top,
        navThrew: d.navThrew || '' })];
    }],
  ['3c', '線の無い座標をタップ → 駒が 1px も動かない (⛔ 隣接まで寄せる救済を入れていない)',
    m => {
      if (!m.walk) return [false, 'walk 未測定'];
      const v = m.walk.voids;
      const usable = v.filter(x => x.onScreen && !x.onNode && x.near >= 100);
      const moved = Math.abs(m.walk.after.px.x - m.walk.before.x) + Math.abs(m.walk.after.px.y - m.walk.before.y);
      return [usable.length === v.length && v.length >= 2 && moved === 0 && m.walk.after.moving === false,
        '試行 ' + v.length + ' 点 (最近ノードまで '
        + v.map(x => x.who + ' ' + x.near.toFixed(0) + 'px' + (x.onNode ? '/⛔ノードの上' : '')).join(', ')
        + ') 移動量=' + moved + 'px'];
    }],

  // ── §4 立ち位置 / SITES の健全性 ───────────────────────────────────────────
  ['4s-1', 'WORLD_MAP.SITES のキー集合が tavern.html のシナリオ id 集合と完全一致 (⛔ ドライバに写経しない)',
    m => {
      const a = Object.keys(m.map.sites).slice().sort();
      const b = Object.keys(m.tavern.map).slice().sort();
      return [a.length > 0 && JSON.stringify(a) === JSON.stringify(b),
        'world=' + JSON.stringify(a) + ' tavern=' + JSON.stringify(b)];
    }],
  ['4s-2', 'SITES の値が全部 NODES に実在し、かつ kind === "site" (依頼書 §5-3 の存在しない id の訂正)',
    m => {
      const bad = Object.keys(m.map.sites).filter(k => {
        const n = m.map.nodes[m.map.sites[k]];
        return !n || n.kind !== 'site';
      }).map(k => k + '->' + m.map.sites[k]);
      return [Object.keys(m.map.sites).length > 0 && bad.length === 0,
        bad.length ? '⛔ ' + bad.join(' ') : JSON.stringify(m.map.sites)];
    }],
  ['4s-3', 'spawnFor の fail-safe: 未知の via / 欠損 / 未知のシナリオ id は phlan、title は pier',
    m => {
      const s = m.spawn;
      const ok = s.title === 'pier' && s.unknownVia === 'phlan' && s.missingVia === 'phlan'
        && s.dungeonUnknownScen === 'phlan'
        && Object.keys(s.byScen).length > 0
        && Object.keys(s.byScen).every(k => s.byScen[k] === m.map.sites[k]);
      return [ok, JSON.stringify(s)];
    }],

  ['4z', '[装置] (4a) の母集団が空でない — 6 シナリオ全部で world.html を再入場できている',
    m => {
      if (!m.keys) return [false, 'keys 未測定'];
      const s = m.keys.spawn;
      return [s.length >= 6 && s.every(r => /\/world\.html$/.test(r.path) && !!r.want),
        s.length + ' シナリオ / ' + JSON.stringify(s.map(r => r.scen + '->' + r.want))];
    }],
  ['4a', '★exitVia="dungeon" + currentScenario を置いて world.html をロード → 駒は '
    + 'WORLD_MAP.SITES[scenario] のノードに立ち、**exitVia が "dungeon" のまま残っている** '
    + '(⛔ world.html は一回性のキーを消さない = 依頼書 §2-2 の罠 A)',
    m => {
      if (!m.keys) return [false, 'keys 未測定'];
      const bad = [];
      for (const r of m.keys.spawn) {
        const why = [];
        if (r.node !== r.want) why.push('駒=' + r.node + ' 期待=' + r.want);
        if (r.exitVia !== 'dungeon') why.push('⛔ exitVia が食われた=' + JSON.stringify(r.exitVia));
        if (r.scenario !== r.scen) why.push('⛔ currentScenario が食われた=' + JSON.stringify(r.scenario));
        if (why.length) bad.push(r.scen + '[' + why.join('/') + ']');
      }
      return [m.keys.spawn.length > 0 && bad.length === 0,
        bad.length ? '⛔ ' + bad.join(' ') : m.keys.spawn.length + ' シナリオとも '
          + '駒が SITES[scenario] に立ち、exitVia / currentScenario が残っている'];
    }],
  ['4b', '★そのまま town.html へ遷移 → **town.html が exitVia を消費**し、主人公が '
    + 'TOWN_MAP.SPAWNS.dungeon (10,3) 酒場前に立つ '
    + '(⭐ (4a) だけだと「消していないが読めてもいない」を見逃すので両方測る)',
    m => {
      if (!m.keys || !m.keys.arrive) return [false, 'keys 未測定'];
      const a = m.keys.arrive;
      const want = a.wantTile;
      const ok = /\/town\.html$/.test(a.path) && a.search === '' && a.hasTown === true
        && !!want && !!a.tile && a.tile.c === want[0] && a.tile.r === want[1]
        /* ★一回性: town.html を通り抜けた後は必ず消えている */
        && a.exitVia === null;
      return [ok, JSON.stringify({ 着地: a.path, search: a.search, 立ち位置: a.tile,
        期待: want, town側が読んだ入口: a.spawnVia, 遷移後のexitVia: a.exitVia })];
    }],

  ['4c-z', '[装置] (4c) の通しが 4 つの停留所すべてに着いている (index → world → town → tavern)',
    m => {
      if (!m.result) return [false, 'result 未測定'];
      const r = m.result;
      const ok = !r.threw && r.dungeon && r.world && r.town && r.tavern
        && /\/index\.html$/.test(r.dungeon.path) && /\/world\.html$/.test(r.world.path)
        && /\/town\.html$/.test(r.town.path) && /\/tavern\.html$/.test(r.tavern.path)
        && r.signFound === true;
      return [ok, JSON.stringify({ 起点: r.dungeon && r.dungeon.path, 地図: r.world && r.world.path,
        街: r.town && r.town.path, 酒場: r.tavern && r.tavern.path,
        銀の鹿亭の札: r.signFound, threw: r.threw })];
    }],
  ['4c', '★lastResult を置いて **ダンジョン → world → town → tavern** と通し、'
    + '**酒場のリザルト画面 (バナー) が出る** = lastResult が生き延びた '
    + '(⛔ world.html も town.html も消さない / 消費するのは tavern.html:4121 ただ 1 つ)',
    m => {
      if (!m.result) return [false, 'result 未測定'];
      const r = m.result;
      if (r.threw) return [false, '⛔ 通しが例外で止まった: ' + r.threw];
      const why = [];
      if (r.dungeon.next !== 'world.html') why.push('dfReturnPage()=' + JSON.stringify(r.dungeon.next));
      if (r.world.exitVia !== 'dungeon') why.push('⛔ exitVia=' + JSON.stringify(r.world.exitVia));
      if (r.world.lastResult === null) why.push('⛔ world.html が lastResult を食った');
      if (r.town.lastResult === null) why.push('⛔ town.html までに lastResult が消えた');
      if (!r.tavern.banners) why.push('⛔ 酒場にリザルトのバナーが出ない');
      else if (String(r.tavern.text).indexOf(RESULT_TITLE) < 0) why.push('バナーの本文が違う="' + r.tavern.text + '"');
      if (r.tavern.lastResult !== null) why.push('⛔ 酒場が消費していない (一回性が壊れている)');
      return [why.length === 0, why.length ? why.join(' / ')
        : 'world("' + r.world.node + '") / town' + JSON.stringify(r.town.tile)
          + ' を通り抜けて lastResult が生存 → 酒場のバナー「' + r.tavern.text + '」→ 消費されて null'];
    }],

  // ── §5 compact でも遊べる ──────────────────────────────────────────────────
  ['5z', '[装置] 2 点とも実際に画素を数えられていて、単色の空撮りではない (色数 > 8)',
    m => {
      if (!m.views) return [false, 'views 未測定'];
      const bad = m.views.filter(v => !v.pix.ok || v.pix.colors <= 8)
        .map(v => v.label + ':' + (v.pix.ok ? ('色数=' + v.pix.colors) : v.pix.err));
      return [m.views.length === 2 && bad.length === 0,
        m.views.map(v => v.label + ' ' + v.pix.W + 'x' + v.pix.H + ' 色数=' + v.pix.colors).join(' / ')
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['5a', '★390x844 (縦持ち) / 1440x900 (desktop) の 2 点で ①横スクロールバーが出ない '
    + '②素の背景色 #0a0805 が可視域の 5% 未満 (⚠ 幾何の余白ではなく**画素**で測る。'
    + '余白は #worldBackdrop が埋めている) ③駒が画面内',
    m => {
      if (!m.views) return [false, 'views 未測定'];
      const bad = [], note = [];
      for (const v of m.views) {
        const why = [];
        if (v.geo.scrollW > v.geo.vw) why.push('横スクロール scrollW=' + v.geo.scrollW + '>' + v.geo.vw);
        if (!v.pix.ok) why.push('画素を数えられない: ' + v.pix.err);
        else if (v.pix.bareFrac >= 0.05) why.push('素の背景 ' + (v.pix.bareFrac * 100).toFixed(2) + '%');
        if (!v.geo.heroInside) why.push('駒が画面外 ' + JSON.stringify(v.geo.hero));
        const gap = 1 - (Math.min(v.geo.stageW, v.geo.vw) * Math.min(v.geo.stageH, v.geo.vh))
          / (v.geo.vw * v.geo.vh);
        note.push(v.label + ' zoom=' + v.geo.zoom.toFixed(3) + ' compact=' + v.geo.compact
          + ' 素の背景=' + (v.pix.ok ? (v.pix.bareFrac * 100).toFixed(2) + '%' : 'NA')
          + ' (参考: 画面全体に対する地図の外側 ' + (gap * 100).toFixed(1) + '% / 極暗画素 '
          + (v.pix.ok ? (v.pix.vdarkFrac * 100).toFixed(2) + '%' : 'NA') + ')');
        if (why.length) bad.push(v.label + '[' + why.join('/') + ']');
      }
      return [m.views.length === 2 && bad.length === 0,
        note.join(' / ') + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],

  // ── §6 撤退 ────────────────────────────────────────────────────────────────
  ['6a', '★title.html?world=0 → **town.html へ直行**し、/world.html を 1 回も要求しない。'
    + 'かつ ?world=0 が無ければ world.html を経由する (= スイッチが本当にスイッチである)',
    m => {
      if (!m.dest) return [false, 'dest 未測定'];
      const off = m.dest['?title=0&world=0'], on = m.dest['?title=0'];
      if (!off || !on) return [false, 'dest の母集団が足りない'];
      const ok = /\/town\.html$/.test(off.path) && off.search === '' && off.sawWorld === false
        && /\/world\.html$/.test(on.path) && on.sawWorld === true;
      return [ok, JSON.stringify({ '?world=0あり': { 着地: off.path, search: off.search, world要求: off.sawWorld },
        '?world=0なし': { 着地: on.path, world要求: on.sawWorld } })];
    }],
  ['6z', '[装置] world.html を直接開いても ?world=0 なら town.html へ replace する / '
    + 'クエリ無しでは地図に留まる (撤退口が地図側にも在り、かつ常時発動していない)',
    m => {
      if (!m.dest) return [false, 'dest 未測定'];
      const off = m.dest['world.html?world=0'], on = m.dest['world.html'];
      if (!off || !on) return [false, 'dest の母集団が足りない'];
      return [/\/town\.html$/.test(off.path) && off.search === ''
        && /\/world\.html$/.test(on.path),
        JSON.stringify({ 'world.html?world=0': off.path, 'world.html': on.path })];
    }],
  ['6c-title', '★title.html?town=0 → **tavern.html** (?world=0 の有無によらず = 2 モードとも)。'
    + '⭐ 「?world=0 で緑」ではなく **状態の conjunction が崩れる**ことを見る '
    + '(?town=0 が無い 2 モードは酒場に着かない)',
    m => {
      if (!m.dest) return [false, 'dest 未測定'];
      const k = ['?title=0&town=0', '?title=0&town=0&world=0', '?title=0', '?title=0&world=0'];
      const d = k.map(q => m.dest[q]);
      if (d.some(x => !x)) return [false, 'dest の母集団が足りない: ' + JSON.stringify(k.filter(q => !m.dest[q]))];
      const toTavern = (x) => /\/tavern\.html$/.test(x.path) && x.search === '';
      const ok = toTavern(d[0]) && toTavern(d[1]) && !toTavern(d[2]) && !toTavern(d[3]);
      return [ok, JSON.stringify(k.reduce((a, q, i) => { a[q] = d[i].path; return a; }, {}))];
    }],

  ['6z2', '[装置] index.html 側の 4 モードとも dfReturnPage() を実際に呼べ、遷移が例外なく完了している',
    m => {
      if (!m.ret) return [false, 'ret 未測定'];
      const ks = Object.keys(m.ret);
      const bad = ks.filter(q => !m.ret[q].ret || m.ret[q].navThrew !== '')
        .map(q => q + ':' + JSON.stringify(m.ret[q].ret) + (m.ret[q].navThrew ? ' threw=' + m.ret[q].navThrew : ''));
      return [ks.length === 4 && bad.length === 0,
        ks.map(q => 'index.html' + q + '→' + m.ret[q].ret).join(' / ')
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['6b', '★index.html?world=0 の dfReturnPage() → **town.html** で、/world.html を 1 回も要求しない。'
    + 'かつ ?world=0 が無ければ world.html を経由する (= スイッチが本当にスイッチである)'
    + ' ⭐ 返り値だけでなく **実際に飛ばして着地**も見る',
    m => {
      if (!m.ret) return [false, 'ret 未測定'];
      const off = m.ret['?world=0'], on = m.ret[''];
      if (!off || !on) return [false, 'ret の母集団が足りない'];
      const ok = off.ret === 'town.html' && /\/town\.html$/.test(off.path) && off.search === ''
        && off.sawWorld === false
        && on.ret === 'world.html' && /\/world\.html$/.test(on.path) && on.sawWorld === true;
      return [ok, JSON.stringify({ '?world=0あり': { 返り値: off.ret, 着地: off.path, world要求: off.sawWorld },
        'クエリ無し': { 返り値: on.ret, 着地: on.path, world要求: on.sawWorld } })];
    }],
  ['6c-index', '★index.html?town=0 の dfReturnPage() → **tavern.html** (?world=0 の有無によらず = 2 モードとも)。'
    + '⭐ 「?world=0 で緑」ではなく **状態の conjunction が崩れる**ことを見る '
    + '(?town=0 が無い 2 モードは酒場に着かない)。⛔ 判定順を逆にすると罠 B で撤退路が死ぬ',
    m => {
      if (!m.ret) return [false, 'ret 未測定'];
      const k = ['?town=0', '?town=0&world=0', '', '?world=0'];
      const d = k.map(q => m.ret[q]);
      if (d.some(x => !x)) return [false, 'ret の母集団が足りない: ' + JSON.stringify(k.filter(q => !m.ret[q]))];
      const toTavern = (x) => x.ret === 'tavern.html' && /\/tavern\.html$/.test(x.path)
        && x.search === '' && x.sawWorld === false;
      const ok = toTavern(d[0]) && toTavern(d[1]) && !toTavern(d[2]) && !toTavern(d[3]);
      return [ok, JSON.stringify(k.reduce((a, q, i) => {
        a['index.html' + q] = d[i].ret + ' → ' + d[i].path; return a; }, {}))];
    }],

  // ── §7 拠点の札 ────────────────────────────────────────────────────────────
  ['7z', '[装置] 配信中の tavern.html から id/place を 6 組以上抜けている (正規表現が空振りしていない)',
    m => [m.tavern.status === 200 && m.tavern.bytes > 100000 && m.tavern.order.length >= 6,
      'status=' + m.tavern.status + ' bytes=' + m.tavern.bytes + ' pairs=' + m.tavern.order.length
      + ' ' + JSON.stringify(m.tavern.map)]],
  ['7a', '★6 つの label が tavern.html の place: と 1 文字違わず一致する (別ファイルの実体どうしの照合)',
    m => {
      const bad = [];
      for (const k of Object.keys(m.map.sites)) {
        const n = m.map.nodes[m.map.sites[k]];
        const want = m.tavern.map[k];
        if (!n || want === undefined || n.label !== want) bad.push(k + ': world="' + (n && n.label) + '" tavern="' + want + '"');
      }
      return [Object.keys(m.map.sites).length > 0 && bad.length === 0,
        bad.length ? '⛔ ' + bad.join(' / ') : Object.keys(m.map.sites).length + ' 件一致'];
    }],
  ['7b-data', 'kind === "site" がちょうど 7 件 / enter を持つのはただ 1 つで、それはシナリオ拠点ではない / enter にクエリが無い',
    m => {
      const sites = siteIds(m), ents = enterIds(m);
      const scenTargets = Object.keys(m.map.sites).map(k => m.map.sites[k]);
      const one = ents.length === 1 ? ents[0] : null;
      const ok = sites.length === 7 && one !== null
        && m.map.nodes[one].kind === 'site'
        && scenTargets.indexOf(one) < 0
        && String(m.map.nodes[one].enter).indexOf('?') < 0;
      return [ok, 'site=' + sites.length + ' enter=' + JSON.stringify(ents)
        + (one ? ' -> "' + m.map.nodes[one].enter + '"' : '')];
    }],
  ['7c-1', '札どうしの距離が 96px 以上',
    m => {
      const ids = siteIds(m), bad = [];
      let mn = Infinity, who = '-';
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = m.map.nodes[ids[i]], b = m.map.nodes[ids[j]];
        const d = hypot(a.x, a.y, b.x, b.y);
        if (d < mn) { mn = d; who = ids[i] + '<->' + ids[j]; }
        if (d < MIN_SIGN_GAP) bad.push(ids[i] + '<->' + ids[j] + '=' + d.toFixed(1) + 'px');
      }
      return [ids.length >= 2 && bad.length === 0,
        '最小 ' + (isFinite(mn) ? mn.toFixed(1) : '-') + 'px (' + who + ')'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['7c-2', '6 つのシナリオ札が「絵に描かれた集落」4 つから 96px 以上離れている',
    m => {
      const targets = Object.keys(m.map.sites).map(k => m.map.sites[k]);
      const bad = []; let mn = Infinity, who = '-';
      for (const id of targets) {
        const n = m.map.nodes[id]; if (!n) continue;
        for (const s of DRAWN_SETTLEMENTS) {
          const d = hypot(n.x, n.y, px(s.tx), px(s.ty));
          if (d < mn) { mn = d; who = id + '<->' + s.name; }
          if (d < MIN_SIGN_GAP) bad.push(id + '<->' + s.name + '=' + d.toFixed(1) + 'px');
        }
      }
      return [targets.length > 0 && bad.length === 0,
        '最小 ' + (isFinite(mn) ? mn.toFixed(1) : '-') + 'px (' + who + ')'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['7b-dom', '★札の DOM が **ちょうど 7 枚**。kind === "site" の件数と一致し、way には 1 枚も無く、'
    + 'enter を持つのは 1 つだけ。文言は js/world-map.js の label / desc そのまま (⛔ 写経しない)',
    m => {
      if (!m.signs) return [false, 'signs 未測定'];
      const sites = siteIds(m), ents = enterIds(m);
      const got = m.signs.rows.map(r => r.id).slice().sort();
      const want = sites.slice().sort();
      const bad = [];
      for (const r of m.signs.rows) {
        const n = m.map.nodes[r.id];
        if (r.kind !== 'site') bad.push(r.id + ':kind=' + r.kind);
        if (!r.inNode) bad.push(r.id + ':.worldNode の子でない');
        if (r.name !== n.label) bad.push(r.id + ':name="' + r.name + '" != label="' + n.label + '"');
        if ((n.desc || null) !== (r.desc || null)) bad.push(r.id + ':desc ズレ "' + r.desc + '"');
      }
      const ok = m.signs.total === 7 && m.signs.rows.length === sites.length && sites.length === 7
        && JSON.stringify(got) === JSON.stringify(want) && ents.length === 1
        && got.indexOf(ents[0]) >= 0 && bad.length === 0;
      return [ok, '.worldSign=' + m.signs.total + ' / kind:"site"=' + sites.length
        + ' / enter=' + JSON.stringify(ents)
        + (bad.length ? '  ⛔ ' + bad.slice(0, 5).join(' ') : '  文言も label/desc と一致')];
    }],
  ['7d', '★札の中心の elementFromPoint が **自分自身か子孫** (他の要素の下に潜っていない)'
    + ' ⚠ 中心は「ノード座標」ではなく **札自身の矩形**から採る (可変幅なのでズレうる)',
    m => {
      if (!m.signs) return [false, 'signs 未測定'];
      const bad = m.signs.rows.filter(r => !r.onScreen || !r.self)
        .map(r => r.id + '[' + (r.onScreen ? '' : '画面外/') + '押した先=' + r.top + ']');
      return [m.signs.rows.length === 7 && bad.length === 0,
        m.signs.rows.length + ' 枚とも自分に当たる  実効文字高 name/desc='
        + (m.signs.rows[0] ? (m.signs.rows[0].fontName * m.render.zoom).toFixed(1) + 'px/'
          + (m.signs.rows[0].fontDesc * m.render.zoom).toFixed(1) + 'px (zoom '
          + m.render.zoom.toFixed(3) + ')' : '-')
        + '  札の寸法=' + JSON.stringify(m.signs.rows.map(r => r.id + ':' + r.w + 'x' + r.h))
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['7e', '★港町フラン **以外**の札をタップ → 歩くだけで location が変わらない (6 枚とも)'
    + ' ⛔ 依頼の受注は今日どおり酒場 (依頼書 §12-3)',
    m => {
      if (!m.walk) return [false, 'walk 未測定'];
      const rows = m.walk.rows.filter(r => r.kind === 'site');
      const bad = [];
      for (const r of rows) {
        if (r.hasEnter) bad.push(r.id + ':enter を持つのにこの母集団に居る');
        if (!/\/world\.html$/.test(r.path)) bad.push(r.id + ':' + r.path + ' へ遷移した');
        if (r.search !== '') bad.push(r.id + ':search="' + r.search + '"');
        if (r.node !== r.id) bad.push(r.id + ':歩けていない heroNode=' + r.node);
      }
      return [rows.length === 6 && bad.length === 0,
        rows.length + ' 枚 (' + rows.map(r => r.id).join(',') + ') を実クリック'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '  全部 world.html のまま歩いただけ')];
    }],
  ['7f', '★主人公が札を隠さない — 全 14 ノードに立ったときの駒の矩形が、どの .worldSign とも '
    + '**札の面積の ' + (COVER_MAX * 100).toFixed(0) + '% 以上**は重ならない'
    + ' ⛔ 96px / 0.93 をドライバへ写経せず __world.heroGeom() から採る'
    + ' ⭐ 実際に歩かせず座標から出す (enter を持つ港町の札は押すと town.html へ遷移してしまう)',
    m => {
      if (!m.cover) return [false, 'cover 未測定'];
      if (m.cover.signCount !== 7 || m.cover.nodeCount !== 14) {
        return [false, '⛔ 母集団が壊れている 札=' + m.cover.signCount + '/7 ノード='
          + m.cover.nodeCount + '/14 (装置の cleared 仕込みが効いていない可能性)'];
      }
      const bad = m.cover.rows.filter(r => r.ratio >= COVER_MAX)
        .map(r => r.at + ' に立つと ' + r.sign + ' の札を ' + (r.ratio * 100).toFixed(1)
          + '% 覆う (' + r.ow.toFixed(1) + 'x' + r.oh.toFixed(1) + 'px)');
      const top3 = m.cover.rows.slice().sort((a, b) => b.ratio - a.ratio).slice(0, 3)
        .map(r => r.at + '->' + r.sign + '=' + (r.ratio * 100).toFixed(1) + '%('
          + r.ow.toFixed(1) + 'x' + r.oh.toFixed(1) + 'px)');
      return [bad.length === 0,
        m.cover.nodeCount + ' ノード x ' + m.cover.signCount + ' 枚 = ' + m.cover.rows.length
        + ' 組を照合 (sprite=' + m.cover.geom.sprite + ' foot=' + m.cover.geom.foot
        + ' 上限=' + (COVER_MAX * 100).toFixed(0) + '%)  重なりの上位 3 件: ' + top3.join(' ')
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  // ── §8 BGM (⭐⭐⭐ 2 経路) ──────────────────────────────────────────────────
  ['8z', '[装置] playBgm のスパイが本当に掛かっていて (evaluateOnNewDocument)、'
    + 'ジェスチャを送った点は「線もノードも無い所」= 駒を歩かせていない',
    m => {
      if (!m.bgm) return [false, 'bgm 未測定'];
      const g = m.bgm.gesture;
      const ok = m.bgm.spyInstalled === true && m.bgm.files.length > 0
        && g.onScreen === true && g.onNode === false && g.near >= 100;
      return [ok, 'spy=' + m.bgm.spyInstalled + ' 曲数=' + m.bgm.files.length
        + ' ジェスチャ点: 最近ノード ' + g.who + ' まで ' + g.near.toFixed(0) + 'px 押した先=' + g.top
        + ' / 押した後の駒=' + m.bgm.heroNode];
    }],
  ['8a', '★[経路A] ロード時に GameAudio.playBgm へ渡った ID が **"world"** '
    + '(⛔ どのクリックよりも前に採る = 呼び口が生きていることの証明)',
    m => {
      if (!m.bgm) return [false, 'bgm 未測定'];
      const c = m.bgm.loadCalls;
      return [m.bgm.spyInstalled === true && c.length === 1 && c[0] === 'world',
        'ロード時の呼び=' + JSON.stringify(c) + ' / ジェスチャ後=' + JSON.stringify(m.bgm.afterCalls)];
    }],
  ['8b', '★[経路B] 最初の pointerdown の後、__bgmFileState() が **world を掴んで paused:false** で、'
    + 'かつ **assets/bgm/fierd.mp3 を実際に要求している** '
    + '(⚠⚠⚠ (8a) だけでは足りない — unlock() はモジュール内部の playBgm を呼ぶので'
    + 'スパイからは pendingBgm 経由の再生が永久に見えない = #20 で実測)',
    m => {
      if (!m.bgm) return [false, 'bgm 未測定'];
      const s = m.bgm.state || {};
      const ok = s.id === 'world' && s.srcId === 'world' && s.paused === false
        && m.bgm.sawTrack === true;
      return [ok, 'ジェスチャ前=' + JSON.stringify(m.bgm.beforeState)
        + ' / 後=' + JSON.stringify(s)
        + ' / fierd.mp3 を要求した=' + m.bgm.sawTrack + ' (前=' + m.bgm.trackBefore + ')'];
    }],
  ['8c', 'BGM_FILES.world の src / credit が assets/bgm/fierd.mp3 / "魔王魂" '
    + '(⛔ volume は assert しない — 地図は安全地帯なので耳で下げてよい。数値であることだけ見る)',
    m => {
      if (!m.bgm) return [false, 'bgm 未測定'];
      const f = m.bgm.files.filter(x => x.id === 'world')[0];
      if (!f) return [false, '⛔ BGM_FILES に world が無い ids=' + JSON.stringify(m.bgm.files.map(x => x.id))];
      const ok = f.src === 'assets/bgm/fierd.mp3' && f.credit === '魔王魂'
        && typeof f.volume === 'number' && f.volume > 0 && f.volume <= 1;
      return [ok, JSON.stringify(f) + '  (volume は縛らない = 0 < v <= 1 だけ)'];
    }],

  ['7c-3', '[対照] 唯一 enter を持つ札は逆に「絵に描かれた港町」の 96px 以内に在る (例外扱いではなく実測で縛る)',
    m => {
      const ents = enterIds(m);
      if (ents.length !== 1) return [false, 'enter=' + JSON.stringify(ents)];
      const n = m.map.nodes[ents[0]];
      const d = hypot(n.x, n.y, px(HARBOR.tx), px(HARBOR.ty));
      return [d < MIN_SIGN_GAP, ents[0] + ' <-> 描かれた港町 = ' + d.toFixed(1) + 'px'];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_worldmap_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_world_map.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   '
    + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
    + '   (nowater はドライバ内の差し替え)');

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    /* ⭐ --autoplay-policy=no-user-gesture-required + --mute-audio で **経路B が headless でも
     *   実際に取れる** (#20 で実測: paused:false まで届く)。「headless では鳴っているか
     *   分からない」は思い込みだった。⚠ audio.js の `unlocked` は unlock() でしか true に
     *   ならないので、このフラグを足してもロード時の 1 本は pendingBgm へ落ちたまま
     *   = (8a)/(8b) の切り分け (spyonly) はそのまま成立する。 */
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  /* ══ 装置: 測定タブへ「6 シナリオ クリア済み」を焼く (実装依頼書 #23 §2-6) ══════
     ⭐⭐⭐ #23 で world.html の札が **解放段階に応じて出る**ようになった。ヘッドレスの
       素のプロファイルは localStorage["dragonfighters.cleared"] が未設定 = 解放は廃坑だけ
       なので、何も仕込まないと札が **2 枚**になり (7b-dom)/(7d) の母集団 (7 枚) が壊れる。
     ⛔ **これは退行ではないので assert の文面と本数は 1 つも減らさない。**
       直すのは測定ページの仕込みだけ = 母集団のほうを復元する。
     ⚠⚠ world.html を開く箇所は 1 つではない (札の測定 / (7e) の実クリック / compact の
       ビューポート / BGM の (8z)(8a)(8b) …)。1 箇所だけ仕込むと (7b-dom) は緑になるのに
       (7d) が赤のまま、という割れ方をする → **browser.newPage を 1 回だけ包む**。
     ⛔ 6 本を直書きしない。⭐ 唯一の正は配信中の tavern.html の scenarios[] で、
       readTavernPlaces() が既にその順序を持っている (#23 の readTavernScenarios と同じ作法)。 */
  const CLEARED_ALL = (await readTavernPlaces(PORT)).order;
  const CLEARED_KEY = 'dragonfighters.cleared';
  const _newPage = browser.newPage.bind(browser);
  browser.newPage = async function () {
    const p = await _newPage();
    await p.evaluateOnNewDocument((k, v) => {
      try { localStorage.setItem(k, v); } catch (e) {}
    }, CLEARED_KEY, JSON.stringify(CLEARED_ALL));
    return p;
  };
  console.log('[drv]   [装置] 測定タブへ ' + CLEARED_KEY + '=' + JSON.stringify(CLEARED_ALL)
    + ' を仕込む (#23 §2-6 — 札 7 枚の母集団を復元)');

  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('§0 装置 — 母集団と変異アンカー');
      const tav = await readTavernPlaces(PORT);
      const m = await measure(browser, PORT, errs, { scenIds: tav.order });
      m.tavern = tav;
      m.walk = await measureWalk(browser, PORT, errs, {});
      m.keys = await measureKeys(browser, PORT, errs, tav.order);
      m.views = await measureViewports(browser, PORT, errs,
        [{ w: 390, h: 844, mobile: true }, { w: 1440, h: 900 }]);
      m.dest = {};
      for (const q of ['?title=0', '?title=0&world=0', '?title=0&town=0', '?title=0&town=0&world=0']) {
        m.dest[q] = await measureTitleDest(browser, PORT, errs, q);
      }
      /* 地図そのものを直接開いたときの撤退口 (town.html の ?town=0 と同じ形の自衛)。 */
      m.dest['world.html?world=0'] = await measureTitleDest(browser, PORT, errs, '?world=0', PAGE_PATH);
      m.dest['world.html'] = await measureTitleDest(browser, PORT, errs, '', PAGE_PATH);
      /* ⭐ 帰還側 (index.html の dfReturnPage) は title 側と **別の関数**で測る。
         title は自分で replace するが、index は呼び口 4 箇所から呼ばれる関数なので
         「返り値を読む」+「実際に飛ばす」の 2 段が要る。 */
      m.ret = {};
      for (const q of ['', '?world=0', '?town=0', '?town=0&world=0']) {
        m.ret[q] = await measureReturnDest(browser, PORT, errs, q);
      }
      m.result = await measureResultChannel(browser, PORT, errs);
      m.bgm = await measureBgm(browser, PORT, errs);
      for (const key of ['0a', '0d', '0b']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      for (const k of MUT_SERVED) {
        check('(0c-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' 内にちょうど 1 箇所ヒットする', true,
          '起動時ガードを通過 (0 件 or 2 件以上なら exit 3)');
      }
      check('(0c-nowater) [装置] nowater はドライバ内の検出器を差し替える (配信アンカー不要)', true,
        '⚠ 水検出器はドライバ側に居るので配信差し替えでは届かない');
      check('(0c) [装置] 変異アンカーの実装漏れが 0 件 (PENDING の変異が残っていない)',
        MUT_TODO.length === 0, MUT_TODO.length ? '⛔ 未実装=' + MUT_TODO.join(' / ')
          : MUT_ORDER.length + ' 本すべて実装済 (' + MUT_ORDER.join(' / ') + ')');

      mark('§1 ルートは水の上を通らない (2 経路)');
      for (const key of ['1z', '1a', '1b']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] エッジごとの最大水率:');
      for (const e of (m.water.edges || [])) {
        console.log('         ' + e.edge + '  len=' + e.len + ' pts=' + e.pts + '  max=' + (e.max * 100).toFixed(1) + '%');
      }

      mark('§2 線とグラフが同一データ (罠 C)');
      for (const key of ['2a', '2b']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }

      mark('§3 歩ける / 歩けない');
      for (const key of ['3z', '3a', '3z2', '3b', '3c', '3d']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }

      mark('§4 一回性のキーを壊していない (罠 A) — 本チケットの核心');
      for (const key of ['4s-1', '4s-2', '4s-3', '4z', '4a', '4b', '4c-z', '4c']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }

      mark('§5 compact でも遊べる');
      for (const key of ['5z', '5a']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }

      mark('§6 撤退');
      for (const key of ['6a', '6z', '6c-title']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] 入口ごとの行き先 (依頼書 §7 の 2x2 + 地図側の自衛):');
      for (const q of Object.keys(m.dest)) {
        console.log('         ' + (q.indexOf('world.html') === 0 ? q : 'title.html' + q)
          + '  →  ' + m.dest[q].path
          + '  (world.html を要求した=' + m.dest[q].sawWorld + ')');
      }
      for (const key of ['6z2', '6b', '6c-index']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] ダンジョンからの帰還 (index.html の dfReturnPage / 依頼書 §7 の 2x2):');
      for (const q of Object.keys(m.ret)) {
        console.log('         index.html' + q + '  →  返り値 "' + m.ret[q].ret + '"  →  着地 ' + m.ret[q].path
          + '  (world.html を要求した=' + m.ret[q].sawWorld + ')');
      }

      mark('§7 拠点の札 7 枚');
      for (const key of ['7z', '7a', '7b-data', '7b-dom', '7c-1', '7c-2', '7c-3', '7d', '7e', '7f']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      if (m.cover) {
        console.log('       [記録] 札の実寸 (ワールド px) — ' + m.cover.sizes.join(' / '));
        console.log('       [記録] 駒 ' + m.cover.geom.sprite + 'px 角 (接地比 '
          + m.cover.geom.foot + ') と札の重なり 上位 5 件:');
        for (const r of m.cover.rows.slice().sort((a, b) => b.ratio - a.ratio).slice(0, 5)) {
          console.log('         ' + r.at + ' に立つ → ' + r.sign + ' の札を '
            + (r.ratio * 100).toFixed(1) + '% (' + r.ow.toFixed(1) + 'x' + r.oh.toFixed(1) + 'px)');
        }
      }

      mark('§8 BGM (2 経路)');
      for (const key of ['8z', '8a', '8b', '8c']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] BGM_FILES の在庫 (⛔ volume は縛らない = 耳で動かしてよい):');
      for (const f of m.bgm.files) {
        console.log('         ' + f.id + '  ' + f.src + '  volume=' + f.volume + '  credit="' + f.credit + '"');
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない', errs.length === 0, errs.slice(0, 6).join(' | '));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      mark('変異が素の配信に無く、変異ポートにだけ載っていること');
      for (const k of MUT_SERVED) {
        const f = '/' + MUT_SRC[k].file;
        const pure = await httpGet('http://localhost:' + PORT + f);
        const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
        check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
          pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
        check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
          pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
      }

      mark('欠陥を注入すると担当の節が赤くなること');
      const tav = await readTavernPlaces(PORT);
      for (const k of MUT_IMPL) {
        const negErrs = [];
        const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
        const m = await measure(browser, port, negErrs, { scenIds: tav.order, nowater: (k === 'nowater') });
        m.tavern = tav;
        /* ⭐⭐⭐ maskdrift だけは「駒の立ち位置は無傷」まで実測する = 罠 C の機械証明。
         *   描画側だけをずらしたので (2b) は赤 / (3b) は緑、が成り立たなければ変異点が誤り。
         *   ⚠ 全 14 ノードは時間が掛かるので、離れた 3 ノードに絞る (母集団は detail に出す)。 */
        /* ⚠ phlan は押すと town.html へ遷移してしまうので、この母集団には入れない
         *   (本体側の (3b) も同じ理由で外し、代わりに (3d) が遷移を測っている)。 */
        if (k === 'maskdrift') m.walk = await measureWalk(browser, port, negErrs, { ids: ['forest', 'swamp', 'lakeside'] });
        /* ⭐⭐⭐ eatvia は「(4a) だけ赤 / (4b) は緑のまま」まで実測する = 罠 A の機械証明。
         *   両方赤なら変異が効きすぎ (peek より前で消している) = 変異点が誤り。 */
        if (k === 'eatvia') m.keys = await measureKeys(browser, port, negErrs, tav.order);
        /* ⭐⭐⭐ eatresult は「(4c) だけ赤 / (4a)(4b) は緑のまま」まで実測する。
         *   食うのは lastResult だけで exitVia には触れない = 壊れ方の切り分けを機械で示す。 */
        if (k === 'eatresult') {
          m.result = await measureResultChannel(browser, port, negErrs);
          m.keys = await measureKeys(browser, port, negErrs, tav.order);
        }
        /* ⭐⭐⭐ earlyworld は罠 B の機械証明。index.html だけを差し替えるので
         *   world.html 側の本体 assert は全部緑のまま = 巻き込み検査がそれを見る。 */
        if (k === 'earlyworld') {
          m.ret = {};
          for (const q of ['', '?world=0', '?town=0', '?town=0&world=0']) {
            m.ret[q] = await measureReturnDest(browser, port, negErrs, q);
          }
        }
        /* ⭐⭐⭐ spyonly が #20 の罠の再現。「(8a) は緑のまま (8b) だけ赤」でなければ
         *   変異が効きすぎ = アンカーが呼び口まで巻き込んでいる。 */
        if (k === 'silent' || k === 'spyonly') m.bgm = await measureBgm(browser, port, negErrs);
        for (const key of MUTATIONS[k].targets) {
          const a = ASSERT_OF[key];
          const r = a[2](m);
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        /* ⭐ 「効きすぎていないこと」まで見る。担当外の本体 assert は緑のままであるべき。 */
        const collateral = ['0a', '0b', '1a', '2a', '2b', '3a', '7a', '7c-1', '7c-2']
          .concat(k === 'maskdrift' ? ['3b', '3c'] : [])
          /* ⭐⭐⭐ 罠 A の本体: world が exitVia を食っても、town は fail-safe で同じ (10,3) に
           *   立つので **(4b) は緑のまま** = 「一見正しく見えるので黙って壊れる」。
           *   ここを巻き込み検査に入れておくことで、その性質そのものを機械で押さえる。 */
          .concat(k === 'eatvia' ? ['3d', '4b'] : [])
          /* ⭐ eatresult は lastResult だけを食う。exitVia の道 ((4a)(4b)) は無傷であるべき。 */
          .concat(k === 'eatresult' ? ['4a', '4b', '3d'] : [])
          /* ⭐ silent / spyonly でもスパイの装置 (8z) と曲の表 (8c) は無傷であるべき。
             ⭐⭐⭐ spyonly はさらに **(8a) が緑のまま**であることが罠の本体そのもの。 */
          .concat(k === 'silent' ? ['8z', '8c'] : [])
          .concat(k === 'spyonly' ? ['8z', '8c', '8a'] : [])
          /* ⭐⭐⭐ signflat の本体: 札を再センタリングしても **(7b-dom) も (7d) も緑のまま**。
             (7b-dom) は枚数と文言、(7d) は札の中心の elementFromPoint しか見ておらず、
             主人公は pointer-events: none なのでそこには永久に写らない。
             ここを巻き込み検査に入れることで「既存の assert では戻ったことに気づけない」
             という (7f) の存在理由そのものを機械で押さえる。 */
          .concat(k === 'signflat' ? ['7b-dom', '7d'] : [])
          .filter(key => MUTATIONS[k].targets.indexOf(key) < 0);
        const broke = collateral.filter(key => ASSERT_OF[key][2](m)[0] === false);
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (' + collateral.join('/') + ')',
          broke.length === 0, broke.length ? '⛔ 巻き込み=' + broke.join(',') : '巻き込み 0 件');
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why);
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
