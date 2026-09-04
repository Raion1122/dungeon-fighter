#!/usr/bin/env node
/*
 * verify_road_ambush.js — 街道の襲撃 (#51 隊商が魔物に襲われている現場に居合わせる)
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-04_road-caravan-ambush.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§5 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_cone_cast.js / tools/verify_road_events.js の項目 1)。
 *
 * ■ 項目 1 (このコミット) で足したもの — **§0 装置 (0a)〜(0e) だけ**
 *     (0a) 表     … window.ROAD_EVENTS.AMBUSH が実在し、choices が
 *                   **判定つき 1 つ + 判定なし 1 つ**にちょうど分割される
 *                   (⛔ 2 を直書きせず実体から数えて整合だけ見る)。
 *                   成功文 ≠ 失敗文 / checkKey は SkillCheck.CHECKS 内 / dc は DC_TIERS 内。
 *                   ⭐ 装置としての最低条件 = ambRoll / ambSeed が関数として取れること
 *                     (依頼書 §5-1「公開は AMBUSH / ambRoll / ambSeed の 3 つ」)。
 *                     ⛔ これが無いと (0c)(0d)(0e) が全部空振りする。
 *     (0b) 写経   … world.html の **配信バイト**に AMBUSH の title / intro / label /
 *                   結末文が **1 つも出てこない** (verify_road_events (0b) と同じ物差し)。
 *     (0c) 決定論 … 襲撃が **必ず出る種**と**必ず出ない種**が両方存在する。
 *                   ⭐ 種の走査 (ambRoll の列) だけで満足せず、**実際に歩かせて**
 *                     「出る種では器が開き / 出ない種では 1 度も開かない」まで見る。
 *     (0d) 恒等   … 同じ種で ROAD_EVENTS.rnd() を N 回引いた列が、
 *                   **襲撃機能を通す前と 1 つも変わらない** (⭐ 罠 B の検出器。依頼書 §2-4)。
 *     (0e) 3 経路 … 判定なし / 判定つき成功 / 判定つき失敗 の **それぞれ**で襲撃が発火し、
 *                   結末の文が AMBUSH の実体 (result / success / fail) と一致する。
 *                   ⛔ 「発火が 1 件以上」で満足しない。
 *
 *   ⛔ §1〜§5 は**この項目では実装しない** (項目 2 / 項目 3 の担当)。全部 PENDING で並べてある。
 *   ⛔ 負のコントロール (--negative の 20 本) は **項目 4 の担当**。
 *      名前と担当節だけ下の MUT_TODO に並べてある (ポートは 1 つも開かない)。
 *
 * ■ ⭐⭐⭐ 項目 1 の時点で赤いのが**正しい** assert
 *   本番 (js/road-events.js / world.html) にはまだ AMBUSH も ambRoll も無いので:
 *     (0a) … window.ROAD_EVENTS.AMBUSH が undefined → **正しい赤**
 *     (0b) … 検索する文言が 0 本 = 母集団が立たない → **正しい赤**
 *             ⚠⚠ 依頼書は「(0b) は写経していないので緑」と予測しているが、
 *               母集団ガード (検索対象が 1 本も無いなら「出てこない」は**自明に真**) を
 *               入れると赤になる。#48 の作法どおり **assert を緩めず予測のほうを訂正**した
 *               (⛔ 母集団が立たなかったら FAIL。skip = 緑にすると assert が静かに消える)。
 *     (0c) … ambRoll が無いので種を 1 つも分類できない → **正しい赤**
 *     (0e) … 襲撃が 1 度も発火しない → **正しい赤**
 *   ⭐ 緑になるのは **(0d) だけ** (基準列は「襲撃機能を通す前」の木から採ってあるので、
 *     本番が未実装のいまは必ず一致する = 装置が正しく立っていることの証明)。
 *   ⛔ 赤を消すために本番コードを書かない (項目 2 の仕事)。
 *   ⛔ 赤を消すために assert を緩めない / skip して緑にしない。
 *
 * ■ ⚠⚠⚠ (0d) の基準列は **固定値**で持つ (走行時に自分で採って自分と比べない)
 *   実行時に基準を採り直す形にすると **永久緑**になる。下の BASE_RND は
 *   **2026-09-04 / HEAD = bdc6880 (襲撃機能を 1 バイトも入れていない木)** で実測した
 *   `ROAD_EVENTS.rnd()` の先頭 32 値そのもの。採取条件:
 *     world.html?roadseed=<種> を load → window.__world が立つまで待つ → 400ms settle →
 *     RE.rnd() を 32 回。3 種とも RE.seed()==種 / fromUrl==true / roadEvent().fired==0 /
 *     typeof RE.ambRoll==="undefined" / typeof RE.AMBUSH==="undefined" を同時に確認済み。
 *   ⛔ 項目 2 以降でこの表を採り直さないこと (採り直した瞬間に (0d)(4a) が死ぬ)。
 *
 * ■ ⭐⭐⭐ (0d) が実際に捕まえる欠陥は 3 つ。**素の boot 列だけでは足りない**
 *   1. 素の列   … 読み込みの最中に rnd() が引かれていないか (列が丸ごとずれる)
 *   2. 挟み込み … rnd() を 16 回引く → **ambRoll() を 8 回呼ぶ** → さらに 16 回引く。
 *                 連結が基準列と一致すること。⭐⭐⭐ 罠 B (`ambRnd` をやめて `rnd()` を
 *                 呼ぶ = 変異 sharedrng) は **ここでしか捕まらない** ——
 *                 boot 時点ではまだ 1 度も襲撃を振っていないので素の列は無傷に見える。
 *   3. 静的     … world.html の配信バイトに `rnd(` が **0 件** (着手前実測 = 0)。
 *                 ⭐ world.html が ambRoll を経由せず `RE.rnd()` を直接叩く形の罠 B は
 *                   1. でも 2. でも届かない (ドライバは歩かせずに測るため)。ここで塞ぐ。
 *
 * ■ 測り方の規律 (verify_road_events からそのまま継いだもの)
 *   ⛔ `?autoplay` / `opts.auto` は使わない (SkillCheck が UI を出さず即解決してしまう)。
 *   ⛔ goToPoint() / goToNode() を page.evaluate から呼ばない。⭐ **実クリックだけで歩く**。
 *   ⛔ ROAD_EVENTS.close() を evaluate から呼ばない (押し口が壊れていても永久に緑になる)。
 *   ⛔ 襲撃の id ("road_caravan_ambush") をドライバへ写経しない —— 分類は
 *      **ページの中で `ev.id === RE.AMBUSH.id`** を見る (実体から引く)。
 *   ⚠ 器を開いてから ROAD_EVENTS.ARM_MS (ゴーストクリック除け) を必ず待ってから押す。
 *   ⚠ 行き先に phlan を選ばない (enter を持つただ 1 つのノード = 着いた瞬間に town.html へ飛ぶ)。
 *   ⚠ 襲撃は **partyMembers (rich) が無いと出ない** (依頼書 §5-3 の hasRealParty)。
 *     歩行の観測では sessionStorage へ **partyMembers と partyComposition の両方**を仕込む。
 *     ⭐ (1f) はその逆 (partyMembers を空にしたら出ない) を測る = 項目 2 の担当。
 *   ⚠⚠⚠ [[project-headless-verification]] の実測 = 実プレイ系ドライバを他の headless Chrome と
 *     並走させると偽の赤が出る。**逐次で走らせること**。
 *
 * ■ ⛔ 測らないこと (依頼書 §8)
 *   AMBUSH_RATE の具体値 (0.06) / 敵の構成と count / 文言の中身 / WAGON_TARGET_CHANCE。
 *
 * ■ ⚠ ポート **9970**。変異 20 本ぶんを **9971〜9990** で予約してある
 *   (PORT_OF[k] = PORT + 1 + i なので **変異を 1 本足すごとに占有が 1 つ伸びる**)。
 *   ⭐ 撤退アーム (?ambush=0) は **クエリ**なので base と同じポートで開く = 追加のポートを取らない
 *     (#47 / #48 の「ポートは base でなく --negative で開くレンジで数える」の実践)。
 *   2026-09-04 実測 (`grep -rhoE "9[0-9]{3}" tools/*.js | sort -n | uniq | tail -25`) =
 *   既存の最大は **9960** (verify_cone_cast の撤退アーム) / 9999 は別用途。**9970〜9990 は衝突 0 本**。
 *   ⭐ 項目 1 が実際に listen するのは **9970 の 1 本だけ** (変異が 1 本も実装されていないため)。
 *
 * ■ 使い方
 *     node tools/verify_road_ambush.js               受入条件
 *     node tools/verify_road_ambush.js --negative    負のコントロール (⛔ 項目 4 が実装する)
 *     node tools/verify_road_ambush.js --headful     目で見る
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
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
const PORT = parseInt(arg('port', '9970'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 負のコントロール (--negative) — ⛔ **項目 4 の担当**。この項目では名前と担当節だけ。
//   ⛔ 20 本を表から隠さない (--negative が「実装を忘れた変異」を件数から隠さないため、
//      PENDING として毎回出す)。⭐ ポートは 1 つも開かない (from/to がまだ無い)。
//   ⚠⚠ 項目 4 が from/to を埋めるときの作法 (verify_cone_cast の起動時検算をそのまま写す):
//      ① 置換文字列は **1 行**に閉じる (world.html は CRLF / js/*.js は LF)
//      ② 置換前後で **バイト長を変える**
//      ③ 当て先は **ちょうど 1 箇所**。0 or 2 箇所なら走らせる前に exit 3
//      ④ 変異は「仕様の言葉」ではなく **その assert が実際に読む値の供給口**へ当てる
// ══════════════════════════════════════════════════════════════════════════════
const MUT_TODO = [
  ['sharedrng', ['0d', '4a'], '⭐ 罠 B の再現: ambRnd をやめて rnd() を呼ぶ'],
  ['helpnocheck', ['0a', '1a'], '⭐ 罠 C の再現: 「助けに入る」を check:false にする'],
  ['intoevents', ['4c'], '⭐ 罠 A の再現: AMBUSH を EVENTS へ push する'],
  ['worldremove', ['4b'], '⭐ 罠 D の再現: roadReturn の消費を removeItem にする'],
  ['overwritescen', ['2b'], '⭐ 罠 F の再現: currentScenario を襲撃で上書き'],
  ['nospawnresume', ['3a'], '⭐ 罠 E の再現: roadReturn を見ずに spawnFor だけ使う'],
  ['resumesticky', ['3b'], 'roadReturn を空文字で潰さない'],
  ['dismisswrite', ['1b'], '見捨てた枝でも roadBattle を書く'],
  ['nullfight', ['1a'], 'resolveSkillCheck が null でも戦闘へ行く'],
  ['nosurprise', ['1d'], 'surprise を常に true'],
  ['woundzero', ['2d'], '下限クランプを外す'],
  ['woundpartial', ['2e'], '人数不一致でも先頭から適用'],
  ['woundonlose', ['3c'], '敗北時にも roadWounds を書く'],
  ['woundtoolate', ['2c'], '消耗の適用を consumeRoadBoon の後へ動かす'],
  ['goldalways', ['2f'], '馬車全損でも clearGold を入れる'],
  ['gameoveramb', ['2g'], '街道の襲撃でも gameOver を立てる'],
  ['gameovernever', ['2g'], '7.9-3 でも gameOver を立てない'],
  ['nopartyguard', ['1f'], 'hasRealParty() を外す'],
  ['copytext', ['0b'], 'AMBUSH の文言を world.html のコメントへ写経'],
  ['boxleak', ['1g'], '器を閉じずに描き直す'],
];

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

const PAGE_PATH = '/world.html';
/* 撤退のクエリ (依頼書 §7)。§5 (5a) が項目 3/4 で使う。⭐ クエリなので追加のポートを取らない。 */
const RETREAT_QUERY = '?ambush=0';

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
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

/* ⚠⚠⚠ 母集団が立たなかったときの返し方。⛔ 「スキップして緑」は禁止。
 *  ⭐ 本体の assert は必ずこれを通して赤を返す = detail に `population: none` が出るので
 *    「測れないから赤」と「値が悪いから赤」が記録の上で区別できる。
 *  ⚠ 項目 2 以降が §1〜§5 を実装するときも、母集団ガードが偽の枝で **必ず** これを呼ぶこと。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定パラメタ
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 街道の襲撃が使う storage のキー (依頼書 §5-5 / §6-1 / §6-4)。
 *  ⛔ assert 側に literal を散らさない = 名前が変わってもここ 1 箇所を直す。 */
const KEY_BATTLE = 'dragonfighters.roadBattle';
const KEY_RETURN = 'dragonfighters.roadReturn';
const KEY_WOUNDS = 'dragonfighters.roadWounds';
const KEY_SCEN = 'dragonfighters.currentScenario';
const KEY_GENSCEN = 'dragonfighters.generatedScenario';
const KEY_BOON = 'dragonfighters.roadBoon';
const KEY_PARTY_COMP = 'dragonfighters.partyComposition';
const KEY_PARTY_MEM = 'dragonfighters.partyMembers';

/* ⭐ 編成。⚠⚠ **2 本とも要る** ——
 *   partyComposition … ROAD_EVENTS.buildParty() が読む (判定パネルのロスター)
 *   partyMembers     … 依頼書 §5-3 の hasRealParty() が読む (**無いと襲撃が出ない**)
 *  ⛔ partyComposition で代用しない (職業キーだけでは rich な編成にならない = 依頼書 §5-3)。 */
const PARTY4 = ['warrior', 'dwarf', 'elf', 'cleric'];
const PARTY_MEMBERS = [
  { classKey: 'warrior', isHero: true, name: '勇者', level: 3 },
  { classKey: 'dwarf', name: 'グリム', level: 3 },
  { classKey: 'elf', name: 'シルフィ', level: 3 },
  { classKey: 'cleric', name: 'リタ', level: 3 },
];

/* ⭐ js/skill-check.js の d20 は **Math.random 由来**で ?roadseed の PRNG とは別系統。
 *  成功と失敗の**両方**を引くにはここを固定するしかない
 *  (⛔ js/skill-check.js は 1 バイトも触らない / ⛔ opts.auto も ?autoplay も使わない)。 */
const D20_WIN = 0.999;    /* → d20 = 20 (クリティカル成功) */
const D20_LOSE = 0.0;     /* → d20 = 1  (ファンブル失敗) */

/* ── (0d) 基準列 ─────────────────────────────────────────────────────────────
 * ⚠⚠⚠ **固定値**。2026-09-04 / HEAD = bdc6880 (襲撃機能が 1 バイトも無い木) の実測。
 *   採取: world.html?roadseed=<種> → __world が立つまで待つ → 400ms → RE.rnd() を 32 回。
 *   3 種とも RE.seed()==種 / fromUrl==true / roadEvent().fired==0 /
 *   typeof RE.ambRoll==="undefined" / typeof RE.AMBUSH==="undefined" を同時確認。
 * ⛔ **項目 2 以降で採り直さない。** 採り直した瞬間に (0d)(4a) は「自分と自分を比べる」形になり
 *   永久緑になる (依頼書 §4 の ⛔ そのもの)。 */
const RND_N = 32;          /* 1 種あたりの標本数 */
const RND_SPLIT = 16;      /* 挟み込みレグ: ここまで引いてから ambRoll を呼ぶ */
const AMB_PROBE = 8;       /* 挟み込みレグ: ambRoll() を呼ぶ回数 */
const BASE_RND = {
  7: [0.011704753153026104, 0.06195825757458806, 0.97690763277933, 0.6990287057124078,
    0.5214452685322613, 0.4055216880515218, 0.4662326325196773, 0.23992518591694534,
    0.5533256039489061, 0.729822089895606, 0.2578155610244721, 0.15594836394302547,
    0.7640898865647614, 0.5184025457128882, 0.19713726011104882, 0.3679585934150964,
    0.2932473379187286, 0.5347395255230367, 0.29633024823851883, 0.9779461044818163,
    0.2475335942581296, 0.877779595553875, 0.19079170934855938, 0.14365738607011735,
    0.1546440301463008, 0.2909512131009251, 0.5479014315642416, 0.7618736950680614,
    0.07451809011399746, 0.912940707989037, 0.5537107479758561, 0.6216248339042068],
  282: [0.40777430683374405, 0.1446307108271867, 0.9229709794744849, 0.11600858136080205,
    0.7545002282131463, 0.1188534777611494, 0.3129070873837918, 0.06703401450067759,
    0.5456868710462004, 0.7917405148036778, 0.3246378938201815, 0.733020132407546,
    0.08682905579917133, 0.057574220933020115, 0.02822994999587536, 0.11735730059444904,
    0.3071178023237735, 0.6111718157771975, 0.8848649936262518, 0.48806294007226825,
    0.6890409996267408, 0.4404337622690946, 0.6373068469110876, 0.9080638629384339,
    0.1623329147696495, 0.007549267960712314, 0.9228398934938014, 0.5054758952464908,
    0.603676495142281, 0.16355515690520406, 0.5760502018965781, 0.9136626359540969],
  20260904: [0.2836113073863089, 0.7002657032571733, 0.2636048069689423, 0.12938253255560994,
    0.4539600021671504, 0.406421143328771, 0.6441473837476224, 0.5354480571113527,
    0.10883750882931054, 0.28774678334593773, 0.8387800641357899, 0.8721048752777278,
    0.026622960343956947, 0.25313783227466047, 0.08785659773275256, 0.9977368796244264,
    0.5859071926679462, 0.8229232744779438, 0.7313378467224538, 0.2988471288699657,
    0.5563449438195676, 0.193243277259171, 0.31781989173032343, 0.635414776392281,
    0.2197718946263194, 0.1784068455453962, 0.8697180827148259, 0.44697407609783113,
    0.9239281753543764, 0.20730730262584984, 0.4951795481611043, 0.9454052308574319],
};
const RND_SEEDS = Object.keys(BASE_RND).map(Number);
/* ⭐ (0d) の 3 本目 = 静的。world.html の配信バイトに `rnd(` が **0 件**
 *  (2026-09-04 実測 `grep -c "rnd(" world.html` = 0)。⛔ ここを 1 に緩めない ——
 *  world.html が ambRoll を経由せず ROAD_EVENTS.rnd() を直接叩く形の罠 B を塞ぐ唯一の関門。 */
const BASE_WORLD_RND = 0;

/* ── (0c) 種の走査 ───────────────────────────────────────────────────────────
 * ⭐ 1 種 = 1 回の page.goto。ambRoll() を SCAN_K 回引いた列で分類する:
 *     出る種   = どこかで true (⭐ 早く出る種ほど歩数が少なくて済むので firstFire 昇順で選ぶ)
 *     出ない種 = SCAN_K 回すべて false
 * ⛔ 「ambRoll の列」だけで (0c) を緑にしない —— **実際に歩かせた結果**と突き合わせる
 *   (ambRoll は真でも world.html が呼んでいなければ襲撃は起きない)。
 * ⚠ AMBUSH_RATE の具体値は測らない (依頼書 §8「⛔ 測らないこと」)。ここで使うのは
 *   「両方の腕が実在する」ことだけ。 */
const SCAN_SEEDS = [7, 282, 20260904, 1, 2, 3, 4, 5, 6, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const SCAN_K = 12;         /* 1 走行で踏みうる「襲撃を振る停留所」の上限の目安 */
const SCAN_WANT_FIRE = 2;  /* これだけ集まったら打ち切る */
const SCAN_WANT_QUIET = 2;
const SCAN_EARLY = 2;      /* firstFire がこれ以下の種を「早く出る種」として優先する */

/* ── 歩行 ────────────────────────────────────────────────────────────────────
 * ⚠ 行き先に phlan を選ばない (着いた瞬間に town.html へ飛び、以後の測定が全部死ぬ)。
 * ⭐ DEST_FIRE は近め (2 タップで届く)、DEST_QUIET は遠め (停留所を多く踏ませて
 *   「出ない」の母集団を厚くする)。verify_road_events の SEED_NEAR / SEED_MAIN と同じ考え方。 */
const DEST_FIRE = 'swamp';
const DEST_QUIET = 'fort';
const SEED_FALLBACK = 7;   /* ⭐ 種を分類できないとき (= 本番未実装) でも歩行ハーネスを 1 回通す */
const MAX_TAPS = 24;
const TAP_SETTLE_MS = 140;
const ARM_PAD_MS = 200;    /* ROAD_EVENTS.ARM_MS への上乗せ (#35 のゴーストクリック除け) */
const QUIET_MIN_ARRIVALS = 3;   /* ⛔ 1 歩も進まずに「出なかった」を緑にしない */

// ══════════════════════════════════════════════════════════════════════════════
// 観測の下回り
// ══════════════════════════════════════════════════════════════════════════════
async function safeEval(page, fn, a) {
  try { return await page.evaluate(fn, a); } catch (e) { return null; }
}
function hookErrors(page, errs, tag) {
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
}
async function openWorld(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  hookErrors(page, errs, '[:' + port + (opts.query || '') + ' ' + (opts.tag || 'boot') + '] ');
  /* ⭐ 編成の仕込みは **遷移前**。⚠ localStorage はプロファイル共有なので、
     指定が無い走行では明示的に消す (前の走行の残りが次の走行の期待値を汚す)。 */
  await page.evaluateOnNewDocument((s) => {
    try {
      if (s.comp) sessionStorage.setItem(s.kComp, JSON.stringify(s.comp));
      else sessionStorage.removeItem(s.kComp);
    } catch (e) {}
    try {
      if (s.mem) sessionStorage.setItem(s.kMem, JSON.stringify(s.mem));
      else sessionStorage.removeItem(s.kMem);
    } catch (e) {}
    try { localStorage.removeItem(s.kComp); } catch (e) {}
  }, { kComp: KEY_PARTY_COMP, kMem: KEY_PARTY_MEM,
    comp: opts.comp || null, mem: opts.mem || null });
  if (typeof opts.force === 'number') {
    await page.evaluateOnNewDocument((v) => { Math.random = function () { return v; }; }, opts.force);
  }
  await page.setViewport(opts.viewport || { width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);
  return page;
}
async function readPlay(page) {
  /* ⚠ try/catch は必須。ページが world.html を離れると evaluate は
     "Execution context was destroyed" で **投げる**。⭐ 投げたら dead 扱いで返す。 */
  try {
    return await page.evaluate(() => {
      const W = window.__world;
      if (!W) return { dead: true, path: location.pathname, search: location.search };
      return {
        dead: false, node: W.heroNode(), px: W.heroPx(),
        arrivals: W.arrivalCount(), last: W.lastArrival(),
        askOpen: W.askOpen(), moving: W.isMoving(),
        walkOff: W.walkStepOff(),
        road: (typeof W.roadEvent === 'function') ? W.roadEvent() : null,
        path: location.pathname, search: location.search,
      };
    });
  } catch (e) {
    return { dead: true, path: '(evaluate 失敗: ' + String(e && e.message).slice(0, 80) + ')', search: '' };
  }
}
/* 襲撃が書く storage の実体。⛔ 「書いていない」を言うために **毎回**読む。 */
async function readAmbStorage(page) {
  return safeEval(page, (K) => {
    const g = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    const o = {};
    Object.keys(K).forEach(n => { o[n] = g(K[n]); });
    return o;
  }, { battle: KEY_BATTLE, ret: KEY_RETURN, wounds: KEY_WOUNDS,
    scen: KEY_SCEN, gen: KEY_GENSCEN, boon: KEY_BOON });
}
async function waitStill(page) {
  try {
    await page.waitForFunction('!window.__world || !window.__world.isMoving()',
      { timeout: 40000, polling: 60 });
    return true;
  } catch (e) { return false; }
}
/* 停留所 id を 1 回押す (client 座標はその都度ページから引く)。
   ⛔ goToPoint を evaluate から呼ばない (当たり判定が壊れていても永久に緑になる)。 */
async function tapPoint(page, id, why) {
  const before = await readPlay(page);
  if (before.dead) {
    return { ok: false, id: id, why: why, before: before, after: before,
      err: 'ページが world.html を離れている: ' + before.path };
  }
  const pt = await safeEval(page, i => window.__world.clientFromPoint(i), id);
  if (!pt) {
    return { ok: false, id: id, why: why, before: before, after: before,
      err: 'clientFromPoint が null: ' + id };
  }
  await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
  const still = await waitStill(page);
  await sleep(TAP_SETTLE_MS);
  const after = await readPlay(page);
  return {
    ok: still && !after.dead, id: id, why: why, before: before, after: after,
    err: !still ? '到着待ちタイムアウト'
      : (after.dead ? 'タップ後にページが遷移した: ' + after.path : null),
  };
}
async function eventState(page) {
  return safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    const box = document.getElementById('worldEventBox');
    const ov = document.getElementById('skillCheckOverlay');
    const t = document.getElementById('worldEventTitle');
    const x = document.getElementById('worldEventText');
    return {
      open: !!(RE && typeof RE.isOpen === 'function' && RE.isOpen()),
      boxShow: !!(box && box.classList.contains('show')),
      title: t ? t.textContent : null,
      text: x ? x.textContent : null,
      btns: Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'))
        .map(b => b.textContent),
      overlayShow: !!(ov && ov.classList.contains('show')),
      /* ⭐ 「いま開いているのは襲撃か」は **ページの実体**から引く
         (⛔ ドライバへ id を写経しない)。 */
      current: (RE && typeof RE.current === 'function' && RE.current()) ? RE.current().id : null,
      ambushId: (RE && RE.AMBUSH) ? RE.AMBUSH.id : null,
    };
  });
}
async function clickEventBtn(page, label) {
  const r = await safeEval(page, (lab) => {
    const bs = Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'));
    const b = lab ? bs.filter(x => x.textContent === lab)[0] : bs[0];
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
  }, label || null);
  if (!r) return false;
  await page.mouse.click(Math.round(r.x), Math.round(r.y));
  return true;
}
/* 開いている器を 1 つ畳む。mode: 'none' = 判定なしの枝 / 'check' = 判定つきの枝。
   ⛔ ROAD_EVENTS.close() を evaluate から呼ばない (押し口が壊れていても永久に緑になる)。
   ⛔ 「先へ進む」は押さない —— 押すと (判定つきの枝では) index.html へ遷移してしまい、
      §0 の観測 (結末の文 / storage) が採れなくなる。遷移は (1e) の担当 = 項目 2。 */
async function resolveOpenBox(page, mode, armWait, evDef) {
  const st0 = await eventState(page);
  if (!st0 || !st0.open) return null;
  const rec = { mode: mode, event: st0.current, title: st0.title, intro: st0.text,
    btns: st0.btns, isAmbush: !!(st0.ambushId && st0.current === st0.ambushId), why: '' };
  await sleep(armWait);
  /* 押す選択肢は **ページの実体**から引く (⛔ 「1 番目」で決め打ちしない)。 */
  const label = await safeEval(page, (o) => {
    const RE = window.ROAD_EVENTS;
    let ev = null;
    if (RE.AMBUSH && RE.AMBUSH.id === o.id) ev = RE.AMBUSH;
    else if (typeof RE.byId === 'function') ev = RE.byId(o.id);
    if (!ev) return null;
    const c = (ev.choices || []).filter(x => !!x.check === o.want)[0];
    return c ? c.label : null;
  }, { id: st0.current, want: mode === 'check' });
  rec.label = label;
  if (!label) { rec.why = '選択肢が引けない (id=' + st0.current + ')'; return rec; }
  await clickEventBtn(page, label);
  if (mode === 'check') {
    try {
      await page.waitForFunction(
        "!!document.getElementById('skillCheckOverlay') && document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 9000, polling: 60 });
      rec.panel = await safeEval(page, () => {
        const ov = document.getElementById('skillCheckOverlay');
        const rows = Array.prototype.slice.call(ov.querySelectorAll('.scRoster .scRow'));
        return { rows: rows.length,
          names: rows.map(r => ((r.querySelector('.scName') || {}).textContent || '').trim()) };
      });
    } catch (e) { rec.panel = null; rec.why += ' 判定パネルが出ない'; }
    /* AUTO_ROLL_MS(2000) → 演出 → RESULT_HOLD_MS(3600) で自動的に閉じる。⛔ 尺は触らない。 */
    try {
      await page.waitForFunction(
        "!document.getElementById('skillCheckOverlay') || !document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 25000, polling: 100 });
    } catch (e) { rec.why += ' 判定が閉じない'; }
  }
  /* 結末の 1 文 + 「先へ進む」の 1 ボタンへ変わるのを待つ。 */
  try {
    await page.waitForFunction(
      "(function(){var b=document.getElementById('worldEventBtns');return !!b && b.children.length===1;})()",
      { timeout: 12000, polling: 80 });
  } catch (e) { rec.why += ' 結末が出ない'; }
  const st1 = await eventState(page);
  rec.resultText = st1 ? st1.text : null;
  rec.doneBtns = st1 ? st1.btns : null;
  /* ⭐ 結末の文が **AMBUSH の実体のどれ**と一致するか。⛔ 文言をドライバへ写経しない。 */
  if (rec.isAmbush && evDef) {
    const cCheck = (evDef.choices || []).filter(c => c.check)[0] || {};
    const cPlain = (evDef.choices || []).filter(c => !c.check)[0] || {};
    rec.matched = (rec.resultText === cCheck.success) ? 'success'
      : (rec.resultText === cCheck.fail) ? 'fail'
        : (rec.resultText === cPlain.result) ? 'result' : null;
  }
  return rec;
}
/* 街道の出来事 (#45 の 6 件) が先に開いたときは、判定なしの枝で畳んで歩行を続ける。
   ⛔ ここで恩恵は付かない (check:false の枝は boonOf が null を返す = #47 の規律)。 */
async function dismissRoadEvent(page, armWait) {
  const rec = await resolveOpenBox(page, 'none', armWait, null);
  if (!rec) return null;
  /* ⚠⚠⚠ **結末の画面でも armAt はリセットされる** (js/road-events.js の paint() が
     showResult からも呼ばれる)。ここで待たずに押すとゴーストクリック除けに弾かれ、
     器が開いたままになって歩行が止まる (2026-09-04 の初回実走で実際に踏んだ:
     「街道の出来事を畳めなかった」でタップ 2 回目で停止した)。 */
  await sleep(armWait);
  await clickEventBtn(page, null);   /* 「先へ進む」 (1 ボタンなので先頭でよい) */
  await sleep(220);
  const st = await eventState(page);
  rec.closed = !!(st && !st.open);
  return rec;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 A) 素のページ — (0a)(0b) の材料
// ══════════════════════════════════════════════════════════════════════════════
async function measureBoot(browser, port, errs) {
  const page = await openWorld(browser, port, errs, { tag: 'boot' });
  const out = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS, SC = window.SkillCheck, WM = window.WORLD_MAP;
    const A = RE ? RE.AMBUSH : undefined;
    const strOf = (v) => (typeof v === 'string' ? v : null);
    const cs = (A && Array.isArray(A.choices)) ? A.choices : [];
    /* ⭐ (0b) が world.html の配信バイトを全文検索する文言。**実体から組む**
       (⛔ ドライバへ 1 文字も写経しない)。 */
    const strings = [];
    if (A) {
      if (strOf(A.title)) strings.push(['AMBUSH.title', A.title]);
      if (strOf(A.intro)) strings.push(['AMBUSH.intro', A.intro]);
      cs.forEach((c, i) => {
        if (strOf(c.label)) strings.push(['choices[' + i + '].label', c.label]);
        ['result', 'success', 'fail'].forEach(k => {
          if (strOf(c[k])) strings.push(['choices[' + i + '].' + k, c[k]]);
        });
      });
    }
    return {
      reType: typeof RE,
      seam: {
        AMBUSH: typeof A, ambRoll: RE ? typeof RE.ambRoll : 'undefined',
        ambSeed: RE ? typeof RE.ambSeed : 'undefined',
        rnd: RE ? typeof RE.rnd : 'undefined', open: RE ? typeof RE.open : 'undefined',
        showResult: RE ? typeof RE.showResult : 'undefined',
      },
      ambush: A ? {
        id: A.id || null, checkKey: A.checkKey || null, dc: A.dc || null,
        nChoices: cs.length,
        choices: cs.map(c => ({
          label: strOf(c.label), check: !!c.check,
          result: strOf(c.result), success: strOf(c.success), fail: strOf(c.fail),
        })),
      } : null,
      strings: strings,
      checkKeys: (SC && SC.CHECKS) ? Object.keys(SC.CHECKS) : null,
      dcTiers: (SC && SC.DC_TIERS) ? Object.keys(SC.DC_TIERS) : null,
      /* ⭐ 記録のみ (⛔ 判定しない) — AMBUSH が EVENTS に混ざっていないか。判定は (4c) の担当。 */
      eventIds: (RE && RE.EVENTS) ? RE.EVENTS.map(e => e.id) : null,
      pop: WM ? {
        ways: Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'way').length,
        sites: Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'site').length,
        steps: Object.keys(WM.STEPS || {}).length,
      } : null,
      heroNode: window.__world.heroNode(),
      /* 撤退の腕が読めるか (⛔ ここでは判定しない。(5a) は項目 3/4 の担当)。 */
      roadAmbushSeam: (window.__world && typeof window.__world.roadAmbush === 'function')
        ? 'function' : 'undefined',
    };
  });
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 B) (0d) 恒等 — 素の列 + **挟み込み**の列
//   ⭐⭐⭐ 挟み込みが罠 B (sharedrng) の唯一の検出器。boot の列だけでは無傷に見える。
// ══════════════════════════════════════════════════════════════════════════════
async function measureRnd(browser, port, errs, seed) {
  const out = { seed: seed };
  /* ① 素の列 (読み込み中に rnd() が引かれていないか) */
  {
    const page = await openWorld(browser, port, errs, { tag: 'rnd', query: '?roadseed=' + seed });
    out.plain = await safeEval(page, (n) => {
      const RE = window.ROAD_EVENTS;
      if (!RE || typeof RE.rnd !== 'function') return null;
      const v = []; for (let i = 0; i < n; i++) v.push(RE.rnd());
      return { values: v, seed: RE.seed(), fromUrl: RE.seedFromUrl() };
    }, RND_N);
    await page.close();
  }
  /* ② 挟み込み: RND_SPLIT 回 → ambRoll を AMB_PROBE 回 → 残りを引く */
  {
    const page = await openWorld(browser, port, errs, { tag: 'rnd2', query: '?roadseed=' + seed });
    out.split = await safeEval(page, (o) => {
      const RE = window.ROAD_EVENTS;
      if (!RE || typeof RE.rnd !== 'function') return null;
      const v = []; for (let i = 0; i < o.split; i++) v.push(RE.rnd());
      let calls = 0; const rolls = [];
      if (typeof RE.ambRoll === 'function') {
        for (let i = 0; i < o.probe; i++) { rolls.push(!!RE.ambRoll()); calls++; }
      }
      let ambSeed = null;
      if (typeof RE.ambSeed === 'function') { try { ambSeed = RE.ambSeed(); } catch (e) { ambSeed = null; } }
      for (let i = o.split; i < o.n; i++) v.push(RE.rnd());
      return { values: v, calls: calls, rolls: rolls, ambSeed: ambSeed, seed: RE.seed() };
    }, { n: RND_N, split: RND_SPLIT, probe: AMB_PROBE });
    await page.close();
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 C) (0c) 種の走査 — 「必ず出る種」と「必ず出ない種」を探す
//   ⛔ ここで見つけただけでは (0c) は緑にしない。歩行 (観測 D) と突き合わせる。
// ══════════════════════════════════════════════════════════════════════════════
async function measureScan(browser, port, errs) {
  const out = { supported: null, probed: 0, rows: [], fire: [], quiet: [] };
  for (const seed of SCAN_SEEDS) {
    const page = await openWorld(browser, port, errs, { tag: 'scan', query: '?roadseed=' + seed });
    const r = await safeEval(page, (k) => {
      const RE = window.ROAD_EVENTS;
      if (!RE || typeof RE.ambRoll !== 'function') {
        return { supported: false, type: RE ? typeof RE.ambRoll : 'no-RE' };
      }
      const v = []; for (let i = 0; i < k; i++) v.push(!!RE.ambRoll());
      return { supported: true, rolls: v };
    }, SCAN_K);
    await page.close();
    out.probed++;
    if (!r || !r.supported) {
      out.supported = false;
      out.why = 'ROAD_EVENTS.ambRoll が関数でない (typeof = ' + ((r && r.type) || '?') + ')';
      return out;   /* ⭐ 1 回で打ち切る (本番未実装なら 24 回開いても同じ) */
    }
    out.supported = true;
    const first = r.rolls.indexOf(true);
    out.rows.push({ seed: seed, first: first, nTrue: r.rolls.filter(Boolean).length });
    if (first >= 0) out.fire.push({ seed: seed, first: first });
    else out.quiet.push({ seed: seed });
    const earlyFire = out.fire.filter(f => f.first <= SCAN_EARLY).length;
    if (earlyFire >= SCAN_WANT_FIRE && out.quiet.length >= SCAN_WANT_QUIET) break;
  }
  out.fire.sort((a, b) => a.first - b.first);
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 D) 歩行 — 実クリックだけで歩き、襲撃の器が開いたら押す
//   ⭐ 分類 (襲撃 か 街道の出来事 か) は **ページの中で ev.id === RE.AMBUSH.id** を見る。
//   ⚠ 途中で街道の出来事 (#45 の 6 件) が開いたら判定なしの枝で畳んで歩き続ける。
// ══════════════════════════════════════════════════════════════════════════════
async function measureAmbush(browser, port, errs, opts) {
  opts = opts || {};
  const seed = opts.seed;
  const dest = opts.dest || DEST_FIRE;
  const mode = opts.mode || 'none';
  const query = '?roadseed=' + seed + (opts.extraQuery || '');
  const out = { label: opts.label || '', seed: seed, dest: dest, mode: mode, query: query,
    taps: [], arrivals: [], opens: [], ambushOpens: 0, roadOpens: 0, amb: null };
  const page = await openWorld(browser, port, errs, {
    tag: 'walk', query: query, force: opts.force,
    comp: opts.noParty ? null : PARTY4, mem: opts.noParty ? null : PARTY_MEMBERS,
  });
  out.storagePre = await readAmbStorage(page);
  /* ⭐⭐⭐ 器が **開いた瞬間**を同期で捕まえる。⚠ MutationObserver では間に合わない
     (rAF の 1 ブロックの中で「開く → stopWalk()」まで走り切る)。
     ⛔ これは「駆動」ではなく「計測」。歩くのは実クリックだけ。 */
  await safeEval(page, () => {
    window.__ambOpen = [];
    const RE = window.ROAD_EVENTS;
    if (!RE || typeof RE.open !== 'function') return;
    const ambId = (RE.AMBUSH && RE.AMBUSH.id) || null;
    const orig = RE.open;
    RE.open = function (ev, cb) {
      const rec = { id: (ev && ev.id) || null, isAmbush: !!(ambId && ev && ev.id === ambId),
        at: null, moving: !!(window.__world && window.__world.isMoving()),
        askOpen: !!(window.__world && window.__world.askOpen()) };
      try {
        const la = window.__world.lastArrival();
        rec.at = la ? la.at : null;
      } catch (e) {}
      const ret = orig.apply(this, arguments);
      try {
        const b = document.getElementById('worldEventBox');
        rec.boxShow = !!(b && b.classList.contains('show'));
      } catch (e) {}
      window.__ambOpen.push(rec);
      return ret;
    };
  });
  /* AMBUSH の実体 (結末の文の突き合わせ用)。⛔ ドライバへ写経しない。 */
  out.evDef = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    if (!RE || !RE.AMBUSH) return null;
    const A = RE.AMBUSH;
    return { id: A.id, choices: (A.choices || []).map(c => ({
      label: c.label, check: !!c.check, result: c.result, success: c.success, fail: c.fail })) };
  });
  out.start = await readPlay(page);
  out.destPick = await safeEval(page, (d) => {
    const WM = window.WORLD_MAP, W = window.__world;
    const from = W.heroNode();
    return { from: from, dest: d, hops: (WM.findWalkPath(from, d) || []).length };
  }, dest);
  const armWait = ((await safeEval(page, () => (window.ROAD_EVENTS && window.ROAD_EVENTS.ARM_MS) || 0)) || 0)
    + ARM_PAD_MS;
  out.armWait = armWait;

  if (out.destPick && out.destPick.hops > 0) {
    let lastNode = null;
    for (let i = 0; i < MAX_TAPS; i++) {
      const t = await tapPoint(page, dest, 'tap#' + (i + 1));
      out.taps.push({ ok: t.ok, err: t.err || null,
        at: (t.after && !t.after.dead && t.after.last) ? t.after.last.at : null,
        node: (t.after && !t.after.dead) ? t.after.node : null });
      if (!t.ok) break;
      if (t.after.last) out.arrivals.push(t.after.last.at);
      const st = await eventState(page);
      if (st && st.open) {
        const isAmb = !!(st.ambushId && st.current === st.ambushId);
        if (isAmb) {
          out.amb = await resolveOpenBox(page, mode, armWait, out.evDef);
          out.storagePost = await readAmbStorage(page);
          out.endAtOpen = await readPlay(page);
          break;   /* ⭐ 襲撃を観測したらそこで止める (「先へ進む」は押さない = §0 の範囲) */
        }
        const r = await dismissRoadEvent(page, armWait);
        if (!r || !r.closed) { out.stuck = '街道の出来事を畳めなかった'; break; }
      }
      if (t.after.node === dest) break;
      if (t.after.node === lastNode) break;   /* 進まなくなった */
      lastNode = t.after.node;
    }
  } else {
    out.stuck = '行き先まで経路が無い: ' + JSON.stringify(out.destPick);
  }
  out.opens = (await safeEval(page, () => window.__ambOpen || [])) || [];
  out.ambushOpens = out.opens.filter(o => o.isAmbush).length;
  out.roadOpens = out.opens.filter(o => !o.isAmbush).length;
  if (!out.storagePost) out.storagePost = await readAmbStorage(page);
  out.end = await readPlay(page);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 小道具
// ══════════════════════════════════════════════════════════════════════════════
function eqNums(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function firstDiff(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return -1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return (a.length === b.length) ? -1 : n;
}
function nOf(hay, needle) { return String(hay).split(needle).length - 1; }
const legOf = (m, k) => (m.legs && m.legs[k]) ? m.legs[k] : null;

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 — [id, 見出し, m => [ok, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 (先に母集団を確かめる) ────────────────────────────────────────
  ['0a', '[装置] window.ROAD_EVENTS.AMBUSH が実在し、choices が **判定つき 1 つ + 判定なし 1 つ**に'
    + 'ちょうど分割される (⛔ 2 を直書きせず実体から数えて整合だけ見る) / 成功文 ≠ 失敗文 /'
    + ' checkKey は SkillCheck.CHECKS 内・dc は DC_TIERS 内 / ambRoll・ambSeed が関数'
    + '  ⭐⭐⭐ これが無いと (0c)(0d)(0e) と §1〜§5 の全 assert が空振りする',
    (m) => {
      const b = m.boot;
      if (!b) return popFail('(0a) world.html の起動', 'measureBoot が値を返していない');
      const s = b.seam || {};
      const A = b.ambush;
      if (!A) {
        return [false, 'typeof window.ROAD_EVENTS = ' + b.reType
          + ' / typeof ROAD_EVENTS.AMBUSH = ' + s.AMBUSH
          + ' / ambRoll = ' + s.ambRoll + ' / ambSeed = ' + s.ambSeed
          + '  ⛔ 襲撃の表が本番に無い = 依頼書 §5-1 の AMBUSH / ambRoll / ambSeed が未実装'];
      }
      const cs = A.choices || [];
      const withCheck = cs.filter(c => c.check);
      const plain = cs.filter(c => !c.check);
      /* ⛔ 件数を直書きせず、**分割が漏れなく 1 対 1 か**だけを見る。 */
      const splitOk = (withCheck.length + plain.length === cs.length)
        && withCheck.length === 1 && plain.length === 1;
      const c1 = withCheck[0] || {}, c0 = plain[0] || {};
      const textOk = !!c1.success && !!c1.fail && c1.success !== c1.fail && !!c0.result;
      const keyOk = !!(b.checkKeys && A.checkKey && b.checkKeys.indexOf(A.checkKey) >= 0);
      const dcOk = !!(b.dcTiers && A.dc && b.dcTiers.indexOf(A.dc) >= 0);
      const seamOk = s.ambRoll === 'function' && s.ambSeed === 'function';
      const ok = splitOk && textOk && keyOk && dcOk && seamOk;
      const inEvents = !!(b.eventIds && b.eventIds.indexOf(A.id) >= 0);
      return [ok,
        'id=' + JSON.stringify(A.id) + ' checkKey=' + JSON.stringify(A.checkKey)
        + ' dc=' + JSON.stringify(A.dc)
        + ' / choices ' + cs.length + ' 件 (判定つき ' + withCheck.length
        + ' / 判定なし ' + plain.length + ')'
        + ' / 成功文≠失敗文=' + (c1.success !== c1.fail)
        + ' / checkKey∈CHECKS=' + keyOk + ' dc∈DC_TIERS=' + dcOk
        + ' / seam ambRoll=' + s.ambRoll + ' ambSeed=' + s.ambSeed
        + '  [記録・⛔判定しない] AMBUSH は EVENTS に混ざっているか = ' + inEvents
        + ' ((4c) の担当)'
        + (ok ? '' : '  ⛔ '
          + (!splitOk ? '選択肢の分割が 判定つき1+判定なし1 になっていない ' : '')
          + (!textOk ? '成功文/失敗文/判定なしの結末文のどれかが欠けている (or 成功文=失敗文) ' : '')
          + (!keyOk ? 'checkKey が CHECKS 外 (⚠ survival / nature は存在せず判定ごと静かに消える) ' : '')
          + (!dcOk ? 'dc が DC_TIERS 外 ' : '')
          + (!seamOk ? 'ambRoll / ambSeed が公開されていない' : ''))];
    }],

  ['0b', '[装置] 襲撃の文言は js/road-events.js から引いている — world.html の **配信バイト**に'
    + ' AMBUSH の title / intro / label / 結末文が 1 つも出てこない'
    + ' (⛔ 写経の検出。verify_road_events (0b) と同じ物差し。変異 copytext が番人)',
    (m) => {
      if (typeof m.served !== 'string' || !m.served.length)
        return [false, 'world.html の配信バイトを読めていない'];
      const b = m.boot;
      const strs = (b && b.strings) ? b.strings : [];
      /* ⛔ 短すぎる語は誤検出になるので 4 文字以上だけ見る。 */
      const checked = strs.filter(s => typeof s[1] === 'string' && s[1].length >= 4);
      /* ⭐⭐⭐ 母集団ガード — 検索する文言が 0 本なら「出てこない」は **自明に真**。
         AMBUSH 1 件につき最低 4 本 (title / intro / label x2) は必ず在る。
         ⚠⚠ 依頼書は「(0b) は緑」と予測しているが、本番未実装のいまは母集団が立たない。
           #48 の作法どおり **assert を緩めず予測のほうを訂正**する (⛔ skip = 緑にしない)。 */
      const MIN_STRINGS = 4;
      const enough = !!(b && b.ambush) && checked.length >= MIN_STRINGS;
      if (!enough) {
        return popFail('(0b) 検索する文言',
          '検索対象が ' + checked.length + ' 本 (期待 >= ' + MIN_STRINGS + ')'
          + ' — AMBUSH が未実装なので「写経していない」は自明に真になる'
          + ' / world.html 配信 ' + m.served.length + 'B');
      }
      const hits = checked.filter(s => m.served.indexOf(s[1]) >= 0);
      return [hits.length === 0,
        'world.html 配信 ' + m.served.length + 'B / 検索した文言 ' + checked.length + ' 本'
        + ' (title + intro + label + 結末文) / 母集団ガード=' + enough
        + (hits.length
          ? ' / ⛔ 写経ヒット ' + hits.length + ' 本: '
            + hits.slice(0, 3).map(s => s[0] + '=' + JSON.stringify(s[1].slice(0, 20))).join(' , ')
          : ' / ヒット 0 本')];
    }],

  ['0c', '[母集団] 決定論の腕が両方立つ — 襲撃が **必ず出る種**と**必ず出ない種**が'
    + '両方存在し、**実際に歩かせて**「出る種では器が開く / 出ない種では 1 度も開かない」'
    + 'ところまで確かめられる  ⛔ どちらか片方しか作れないなら §1〜§5 は全部空振りする',
    (m) => {
      const sc = m.scan;
      if (!sc || sc.supported !== true) {
        return popFail('(0c) 種の走査',
          ((sc && sc.why) || 'ROAD_EVENTS.ambRoll が無い')
          + ' — 種を 1 つも分類できないので「出る種 / 出ない種」を作れない');
      }
      const fireLeg = legOf(m, 'fireNone');
      const quietLeg = legOf(m, 'quiet');
      const scanOk = sc.fire.length >= 1 && sc.quiet.length >= 1;
      const fireOk = !!(fireLeg && fireLeg.ambushOpens >= 1);
      const quietOk = !!(quietLeg && quietLeg.ambushOpens === 0
        && (quietLeg.arrivals || []).length >= QUIET_MIN_ARRIVALS);
      const ok = scanOk && fireOk && quietOk;
      return [ok,
        '走査 ' + sc.probed + ' 種 → 出る種 ' + sc.fire.length + ' / 出ない種 ' + sc.quiet.length
        + ' (先頭: ' + JSON.stringify(sc.rows.slice(0, 6)) + ')'
        + '  / 歩行[出る種 ' + (fireLeg ? fireLeg.seed : '—') + '→' + (fireLeg ? fireLeg.dest : '—')
        + '] 襲撃 ' + (fireLeg ? fireLeg.ambushOpens : '—') + ' 件'
        + ' / 出来事 ' + (fireLeg ? fireLeg.roadOpens : '—') + ' 件'
        + ' / 到着 ' + (fireLeg ? (fireLeg.arrivals || []).length : '—') + ' 件'
        + '  / 歩行[出ない種 ' + (quietLeg ? quietLeg.seed : '—') + '→' + (quietLeg ? quietLeg.dest : '—')
        + '] 襲撃 ' + (quietLeg ? quietLeg.ambushOpens : '—') + ' 件'
        + ' / 到着 ' + (quietLeg ? (quietLeg.arrivals || []).length : '—')
        + ' 件 (期待 >= ' + QUIET_MIN_ARRIVALS + ')'
        + (ok ? '' : '  ⛔ '
          + (!scanOk ? '走査で片方の腕しか作れていない ' : '')
          + (!fireOk ? '出る種で歩かせても器が 1 度も開かない (world.html が ambRoll を呼んでいない疑い) ' : '')
          + (!quietOk ? '出ない種の歩行が短すぎる or 襲撃が出てしまった' : ''))];
    }],

  ['0d', '[恒等] 既存の引きが 1 つも動いていない — 同じ種で ROAD_EVENTS.rnd() を ' + RND_N
    + ' 回引いた列が、**襲撃機能を通す前に採った固定の基準列**と完全一致する。'
    + ' ①素の列 ②' + RND_SPLIT + ' 回引いて ambRoll() を ' + AMB_PROBE + ' 回呼んでから残りを引いた列'
    + ' ③world.html の配信バイトの rnd 呼び出しが ' + BASE_WORLD_RND + ' 件'
    + '  ⭐⭐⭐ 罠 B (依頼書 §2-4) の検出器。②が無いと sharedrng は無傷に見える',
    (m) => {
      const rows = m.rnd || [];
      if (!rows.length) return popFail('(0d) rnd の観測', 'measureRnd が 1 種も返していない');
      const det = [];
      let ok = true, calls = 0;
      for (const r of rows) {
        const base = BASE_RND[r.seed];
        const p = r.plain, s = r.split;
        const pOk = !!(p && eqNums(p.values, base));
        const sOk = !!(s && eqNums(s.values, base));
        if (s) calls += s.calls;
        if (!pOk || !sOk) ok = false;
        det.push('種 ' + r.seed + ': 素=' + (pOk ? '一致' : '⛔不一致@' + firstDiff(p ? p.values : null, base))
          + ' 挟込=' + (sOk ? '一致' : '⛔不一致@' + firstDiff(s ? s.values : null, base))
          + ' (ambRoll ' + (s ? s.calls : 0) + ' 回'
          + (s && s.rolls && s.rolls.length ? ' → ' + JSON.stringify(s.rolls) : '')
          + (s && s.ambSeed !== null && s.ambSeed !== undefined ? ' / ambSeed=' + s.ambSeed : '')
          + ')');
      }
      /* ③ 静的 — world.html が ambRoll を経由せず rnd() を直接叩く形の罠 B を塞ぐ。 */
      const worldRnd = (typeof m.served === 'string') ? nOf(m.served, 'rnd' + '(') : -1;
      const staticOk = worldRnd === BASE_WORLD_RND;
      if (!staticOk) ok = false;
      return [ok,
        det.join(' | ')
        + ' / world.html の rnd 呼び出し = ' + worldRnd + ' 件 (着手前 ' + BASE_WORLD_RND + ' 件)'
        + '  [記録] ambRoll を呼べた合計 ' + calls + ' 回'
        + (calls === 0 ? ' (⚠ 本番未実装のあいだは 0 = 挟み込みレグはまだ罠 B を測っていない。'
          + '(0a) が赤いことでそれが分かる)' : '')
        + (ok ? '' : '  ⛔ 既存の乱数列が動いた = 罠 B (依頼書 §2-4)。'
          + 'ambRnd 専用ストリームを使わず rnd() を共有している疑い')];
    }],

  ['0e', '[母集団] 3 経路の腕が全部立つ — **判定なし / 判定つき成功 / 判定つき失敗**の'
    + 'それぞれで襲撃が発火し、結末の文が AMBUSH の実体 (result / success / fail) と一致する'
    + '  ⛔ 「発火が 1 件以上」で満足しない (依頼書 §4)',
    (m) => {
      const want = [['fireNone', 'none', 'result', '判定なし'],
        ['fireWin', 'check', 'success', '判定つき成功'],
        ['fireLose', 'check', 'fail', '判定つき失敗']];
      const rows = want.map(w => {
        const L = legOf(m, w[0]);
        const a = L ? L.amb : null;
        return { tag: w[3], leg: w[0], ran: !!L, fired: !!(L && L.ambushOpens >= 1),
          matched: a ? a.matched : null, wantMatch: w[2],
          ok: !!(L && L.ambushOpens >= 1 && a && a.matched === w[2]),
          why: (a && a.why) ? a.why : '' };
      });
      if (!rows.some(r => r.ran)) {
        return popFail('(0e) 3 経路の歩行', '1 本も走っていない');
      }
      if (!rows.some(r => r.fired)) {
        return popFail('(0e) 襲撃の発火',
          '3 経路とも器が 1 度も開かない — ' + ((m.scan && m.scan.supported === true)
            ? '出る種で歩いても world.html が襲撃を出していない'
            : 'ROAD_EVENTS.ambRoll が無い (本番未実装)')
          + ' / 走った腕 = ' + rows.filter(r => r.ran).map(r => r.tag).join(' , '));
      }
      const ok = rows.every(r => r.ok);
      return [ok, rows.map(r => '[' + r.tag + '] '
        + (r.ran ? (r.fired ? '発火○' : '発火✕') : '未実行')
        + ' 結末=' + JSON.stringify(r.matched) + '(期待 ' + r.wantMatch + ')'
        + (r.why ? ' ⛔' + r.why : '')).join('  |  ')
        + (ok ? '' : '  ⛔ 3 経路の全部で襲撃が発火し、正しい結末の文が出るまでは'
          + ' (1a)(1d)(2c) は空振りする')];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 節の枠組み (⭐ 後続の項目は keys へキーを足し、pend から同じキーを外すだけでよい)
//   ⛔ keys と pend の両方に同じキーを置かないこと (数が合わなくなる)。
//   ⛔ 節ごと削除しないこと — 削ると「宣言してから実装する」型そのものが消える。
// ══════════════════════════════════════════════════════════════════════════════
const SECTIONS = [
  { title: '§0 装置 (先に母集団を確かめる) — ⭐ ここが立たないと §1〜§5 は全部空振りで永久緑',
    keys: ['0a', '0b', '0c', '0d', '0e'], pend: [] },

  { title: '§1 街道側 (js/road-events.js + world.html) — ⛔ 項目 2 の担当',
    keys: [], pend: [
      ['1a', '3 経路 — 判定なし / 判定つき成功 / 判定つき失敗 の**全部**を実際に押して観測する', '項目 2'],
      ['1b', '見捨てたときは 1 バイトも書かない — roadBattle も roadReturn も生えない', '項目 2'],
      ['1c', '助けたときだけ書かれる — roadBattle に waves が **1 件**、roadReturn が刻み点 id', '項目 2'],
      ['1d', '奇襲は成否で変わる — d20=20 と d20=1 で roadBattle.surprise が **true / false** に割れる', '項目 2'],
      ['1e', '遷移先 — location.search === "" の index.html (⛔ クエリを足していない)', '項目 2'],
      ['1f', '編成が無ければ出ない — partyMembers を空にすると襲撃が 0 件', '項目 2'],
      ['1g', '器が 390x844 に収まる (⭐ EVENTS に入れていないので verify_road_events (1d) は襲撃を測らない'
        + ' = **ここで測らないと誰も測らない**)', '項目 2'],
    ] },

  { title: '§2 潜行側 (index.html) — ⛔ 項目 3 の担当',
    keys: [], pend: [
      ['2a', '消費 — roadBattle が removeItem され、waves が 1 件のシナリオが立つ', '項目 3'],
      ['2b', '本命が汚れない — 走行の前後で currentScenario / generatedScenario が **1 バイトも変わらない**', '項目 3'],
      ['2c', '消耗の往復 — 勝利後に roadWounds が書かれ、次の起動でその比率どおりの hp で始まる'
        + ' (⭐ 書かれた JSON の比率 と 実際の hp/maxHp の 2 経路で突き合わせる)', '項目 3'],
      ['2d', '下限 — 比率 0 を注入しても hp は **1 以上**', '項目 3'],
      ['2e', '人数不一致は丸ごと捨てる — n を偽装すると消耗が 1 も適用されない', '項目 3'],
      ['2f', '馬車全損で金貨が 0 — 馬車を殺して勝つと clearGold 分が入らない', '項目 3'],
      ['2g', '馬車全損で gameOver が立たない (⛔ 7.9-3 側は従来どおり立つ = **両方**測る)', '項目 3'],
    ] },

  { title: '§3 帰還 — ⛔ 項目 3 の担当',
    keys: [], pend: [
      ['3a', '襲撃地点に戻る — 勝って帰ると __world.heroNode() が**襲撃した刻み点**', '項目 3'],
      ['3b', '一回性 — もう一度 world.html を開くと roadReturn は空で、従来の spawnFor に戻る', '項目 3'],
      ['3c', '負けたら港町 — 敗北で帰ると phlan、かつ roadWounds が**書かれていない**', '項目 3'],
      ['3d', '依頼の目印が残る — 帰還後も questDest が生きている', '項目 3'],
    ] },

  { title: '§4 恒等 (非退行) — ⛔ 項目 3 の担当',
    keys: [], pend: [
      ['4a', '既存の引きが不変 — (0d) を本実装後にもう一度 (⭐ 罠 B の本検査)', '項目 3'],
      ['4b', 'world.html の storage の数 — sessionStorage.removeItem が**依然 1 件**・localStorage 0 件', '項目 3'],
      ['4c', '既存 6 件が同じ — EVENTS の id 集合・件数・地形割りが着手前と一致', '項目 3'],
    ] },

  { title: '§5 撤退 ' + RETREAT_QUERY + ' — ⛔ 項目 3 の担当'
      + ' (⚠⚠⚠ 撤退アームだけを受入条件にしない = #39 の「永久緑」の轍)',
    keys: [], pend: [
      ['5a', 'world.html' + RETREAT_QUERY + ' → 襲撃 0 件・キー 0 バイト・既存の出来事は従来どおり出る', '項目 3'],
      ['5b', 'index.html' + RETREAT_QUERY + ' → roadBattle を注入しても通常の潜行が立つ', '項目 3'],
    ] },
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_roadamb_');
  const browserPath = findBrowser();
  /* ⚠ ポートは **MUT_TODO の並び**で固定的に割り当てる (実装の増減で番号が動かないように)。
     PORT_OF[k] = PORT + 1 + i → 9971〜9990 が変異 20 本ぶんの予約。
     ⭐ 項目 1 は 1 本も実装していないので **listen するのは base の 9970 だけ**。 */
  const PORT_OF = {};
  MUT_TODO.forEach((row, i) => { PORT_OF[row[0]] = PORT + 1 + i; });

  console.log('=== verify_road_ambush.js' + (NEGATIVE ? '  [負のコントロール]' : '') + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   撤退アーム: 同じポートの ' + RETREAT_QUERY
    + ' (クエリなので追加のポートを取らない)');
  console.log('[drv]   変異の予約: ' + (PORT + 1) + '〜' + (PORT + MUT_TODO.length)
    + ' (' + MUT_TODO.length + ' 本 / ⛔ 項目 4 の担当なので 1 本も listen しない)');

  const servers = [await startServer(PORT)];
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];
  try {
    if (NEGATIVE) {
      // ══ 負のコントロール = ⛔ 項目 4 の担当。名前と担当節だけ並べる ═══════════
      mark('負のコントロール (⛔ 項目 4 が実装する。いまは 1 本も注入しない)');
      for (const row of MUT_TODO) {
        pending('(neg-' + row[0] + ') 変異 ' + row[0] + ' → (' + row[1].join(')(') + ') が赤くなる',
          row[2] + '   [予約ポート ' + PORT_OF[row[0]] + ']');
      }
    } else {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      const served = await httpGet('http://localhost:' + PORT + PAGE_PATH);
      const m = { served: served.body, errs: errs, legs: {} };

      m.boot = await measureBoot(browser, PORT, errs);
      m.rnd = [];
      for (const s of RND_SEEDS) m.rnd.push(await measureRnd(browser, PORT, errs, s));
      m.scan = await measureScan(browser, PORT, errs);

      /* ⭐ 歩行の腕。種を分類できたときだけ 3 経路 + 静けさの 4 本を走らせる。
         ⛔ 分類できないとき (= 本番未実装) でも **1 本は歩かせる** —— 歩行ハーネスそのものが
            立っていることを記録に残すため (⛔ ただし (0c)(0e) は緑にしない)。 */
      const fireSeed = (m.scan && m.scan.fire && m.scan.fire.length) ? m.scan.fire[0].seed : null;
      const quietSeed = (m.scan && m.scan.quiet && m.scan.quiet.length) ? m.scan.quiet[0].seed : null;
      m.seedPick = { fire: fireSeed, quiet: quietSeed,
        fallback: (fireSeed === null) ? SEED_FALLBACK : null };
      if (fireSeed !== null) {
        m.legs.fireNone = await measureAmbush(browser, PORT, errs,
          { label: '判定なし', seed: fireSeed, dest: DEST_FIRE, mode: 'none' });
        m.legs.fireWin = await measureAmbush(browser, PORT, errs,
          { label: '判定つき成功', seed: fireSeed, dest: DEST_FIRE, mode: 'check', force: D20_WIN });
        m.legs.fireLose = await measureAmbush(browser, PORT, errs,
          { label: '判定つき失敗', seed: fireSeed, dest: DEST_FIRE, mode: 'check', force: D20_LOSE });
      } else {
        m.legs.fireNone = await measureAmbush(browser, PORT, errs,
          { label: '判定なし (⚠ 出る種が無いので既定の種で歩行ハーネスだけ通す)',
            seed: SEED_FALLBACK, dest: DEST_FIRE, mode: 'none' });
      }
      if (quietSeed !== null) {
        m.legs.quiet = await measureAmbush(browser, PORT, errs,
          { label: '出ない種', seed: quietSeed, dest: DEST_QUIET, mode: 'none' });
      }

      for (const sec of SECTIONS) {
        if (sec.keys.length === 0 && sec.pend.length === 0) continue;
        mark(sec.title);
        for (const key of sec.keys) {
          const a = ASSERT_OF[key];
          if (!a) { pending('(' + key + ') ⛔ SECTIONS に載っているが ASSERTS に無い', '配線漏れ'); continue; }
          const r = a[2](m);
          check('(' + a[0] + ') ' + a[1], r[0], r[1]);
        }
        for (const p of sec.pend) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      // ── 記録 (⛔ 期待値ではない。読み解き用 / 項目 2 への材料) ────────────────
      mark('[記録] 装置の下見 (⛔ 判定しない)');
      const b = m.boot || {};
      console.log('       ROAD_EVENTS = ' + b.reType + ' / seam = ' + JSON.stringify(b.seam));
      console.log('       AMBUSH = ' + JSON.stringify(b.ambush));
      console.log('       CHECKS = ' + JSON.stringify(b.checkKeys));
      console.log('       DC_TIERS = ' + JSON.stringify(b.dcTiers));
      console.log('       EVENTS の id = ' + JSON.stringify(b.eventIds));
      console.log('       停留所の実体 = ' + JSON.stringify(b.pop) + ' / 起点 = ' + b.heroNode);
      console.log('       __world.roadAmbush = ' + b.roadAmbushSeam + ' (⛔ 依頼書は要求していない)');
      console.log('       種の走査 = ' + JSON.stringify(m.seedPick)
        + ' / supported=' + (m.scan ? m.scan.supported : null)
        + (m.scan && m.scan.why ? ' (' + m.scan.why + ')' : '')
        + ' / 走査 ' + (m.scan ? m.scan.probed : 0) + ' 種');
      for (const k of Object.keys(m.legs)) {
        const L = m.legs[k];
        console.log('       [歩行 ' + k + '] ' + L.label + '  種=' + L.seed + ' → ' + L.dest
          + '  タップ ' + L.taps.length + ' / 到着 ' + L.arrivals.length
          + ' / 器 ' + L.opens.length + ' (襲撃 ' + L.ambushOpens + ' / 出来事 ' + L.roadOpens + ')'
          + (L.stuck ? '  ⛔ ' + L.stuck : ''));
        console.log('         到着列 = ' + JSON.stringify(L.arrivals.slice(0, 10))
          + '  終点 = ' + (L.end && !L.end.dead ? L.end.node : '(離脱 ' + (L.end || {}).path + ')'));
        console.log('         storage(後) = ' + JSON.stringify(L.storagePost));
        if (L.amb) console.log('         襲撃の器 = ' + JSON.stringify(L.amb).slice(0, 400));
      }
      mark('[記録] pageerror / console.error');
      console.log('       ' + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 8).join('\n         ') : ''));
    }
  } finally {
    try { await browser.close(); } catch (e) {}
    for (const s of servers) { try { s.close(); } catch (e) {} }
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + (pend.length ? '   **PENDING** ' + pend.length + ' 件' : ''));
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
