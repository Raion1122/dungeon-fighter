#!/usr/bin/env node
/*
 * verify_party_four.js — 実装依頼書 #61「全シナリオを 4 人編成へ(★連動の廃止)」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測るもの
 *   ⭐ 「**6 シナリオすべてが主人公 1 + NPC RECRUIT_MAX = 4 人で出発する**」ただ 1 点。
 *
 * ■ ⛔ 測らないもの (意図的に空けてある。ここを縛ると次のチケットが動かせなくなる)
 *   ・**難易度** — クリア率 / XP / 戦闘時間。人数の変更が易しくしたかは別チケットの仕事。
 *   ・**★ の表示文字列** — 画面に残す決定だが、文言は動かす余地を残す。
 *   ⭐ 「測らない ≠ 無防備」: ★ の**数**は (0c)(3a) が母集団の前提として読む
 *     (= 文言を変えても赤くならず、★ を全部消したら赤くなる)。
 *
 * ■ 計測機構 — ⛔ index.html を開く測定台は作れない
 *   `isRecruitOn()` / `recruitCountOf()` / `RECRUIT_MAX` / `scenarios` は **tavern.html にしか無い**。
 *   よって `verify_recruit_size.js` と同じ「**酒場のページで裸の識別子を読む**」測定台を使う:
 *     ・`window.<名前>` は classic script 直下の const/function に対して**常に undefined**。
 *       page.evaluate(() => RECRUIT_MAX) のように **裸の識別子**で読む。
 *     ・観測は**本番の関数だけ**を呼ぶ (prepScenario = sc → regeneratePartyMembers()
 *       → departToScenario())。⛔ sessionStorage への書き込みを写経すると
 *       「出発処理を一度も通さないまま緑」になる。
 *     ・出ていく遷移は index.html と world.html の **両方**を abort する
 *       (⚠ ここに正規表現リテラルを書くと `**` + `/` でブロックコメントが閉じる。実際に踏んだ)
 *       (#23 以降 world.html を 1 段挟むので index だけだと酒場タブが本当に飛ぶ)。
 *     ・URL には `?recruittalk=0`(#54 自動編成) と `?prepskip=0`(#55) を必ず足す。
 *       ⚠⚠ ただし §2 (2c) の「同行の約束」表示は **?recruittalk=0 では測れない**
 *         (#60 の世界)。**既定 ON の別腕**で測る。
 *
 * ■ 節
 *   §0 装置 (先に母集団を確かめる)  §1 本体  §2 恒等 (非退行)  §3 撤退
 *
 * ── 負のコントロール (--negative。⭐ 配信をメモリ上で差し替える) ─────────────────
 *   starlink / capout / switchdead / nolegacy / partysizeline   (対象 = tavern.html)
 *   ⚠ 置換文字列は**必ず 1 行**(CRLF/LF 混在で必ず空振りする)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと差し替わったか確認できない)。
 *   ⚠ 注入前に「1 ファイル / 1 箇所」を機械で確かめる (#62: アンカーが多重ヒットに育つと
 *     素は緑のまま `--negative` だけが exit 3 で死に、4 チケット生き延びる)。
 *
 * 使い方:
 *   node tools/verify_party_four.js               # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_party_four.js --negative    # 変異 5 本 (port 10172〜10176) が赤くなるか
 *   node tools/verify_party_four.js --negative --only capout
 *   node tools/verify_party_four.js --mutate starlink --port 10172
 * ⚠ base ポートは **10171**(枠 10171〜10180)。10161 は #60 / 10181 は #62 /
 *   8897 は verify_recruit_size が占有。⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否。
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足 / 3=アンカー腐敗・使い方の誤り
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '10171'), 10);

/* 固定 6 シナリオ。⭐ 期待**人数**はここに書かない (本番の RECRUIT_MAX / ★の数から導く)。
   ⚠ ここに書いてよいのは「母集団が誰か」だけ。数字を焼くと仕様変更で黙って腐る。 */
const SCENARIO_IDS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
/* (1c) 実際に 3 人 → 4 人へ動く 2 本 (依頼書 §2-1 の実測)。
   ⚠⚠ **集合ではなく値の向きまで測る** — 項目2 の実測で「動く id の集合」assert は
     ★連動が復活しても緑のままだった (集合が両方向で同じなので向きを検出できない)。 */
const MOVED_IDS = ['bandits-forest', 'lizard-swamp'];
/* (2a) 元から 4 人 = 両腕で人数が変わらない 4 本。 */
const UNMOVED_IDS = ['goblin-mine', 'orc-fort', 'undead-temple', 'dragon-lair'];
/* (1a2) `recruit:` の個別上書きを注入して「経路 A が本当に recruitCountOf を通っているか」を測る先。
   ⚠ goblin-mine は #8 で `recruit: 3` を持つので注入しても「元から」と区別できない。 */
const INJECT_ID = 'bandits-forest';
const DIAG_PREFIX = '[DIAG] recruit: fallback used';

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['tavern.html'];
const MUTATIONS = {
  /* M1 ★連動へ戻す = #61 を丸ごと巻き戻したのと同じ。§1 が赤くなるべき。 */
  starlink: [['    return MAX;                                                      // ★[#61] 既定 = 常に上限',
              '    return recruitCountLegacy(sc);   /* ★変異starlink — ★連動へ戻す */']],
  /* M2 上限を 4 へ外す。⚠⚠ 期待値を RECRUIT_MAX から導いている assert は**変異と一緒に動く**ので
   *   素通しする。捕まえるのは (2b) の直値 / PARTY_SIZE-1 との一致だけ (項目2 の実測)。 */
  capout: [['  const RECRUIT_MAX = 3;',
            '  const RECRUIT_MAX = 4;   /* ★変異capout — 上限を外す */']],
  /* M3 ⭐ 依頼書 §2-3 の罠の再現 = 「スイッチの意味を反転させたのに旧経路が死んでいる」。 */
  switchdead: [['    try { return new URLSearchParams(location.search).get("recruit") !== "0"; } catch (e) { return true; }',
                '    return true;   /* ★変異switchdead — 撤退スイッチを殺す */']],
  /* M4 旧経路の本体を潰す (clamp を捨てて常に上限)。⚠ [DIAG] の行はこの手前なので残る。 */
  nolegacy: [['    return Math.max(MIN, Math.min(MAX, n));',
              '    return MAX;   /* ★変異nolegacy — 旧経路を殺す */']],
  /* M5 唯一の使用点から recruitCountOf を外して PARTY_SIZE 直読みへ。
   *   ⚠ 掴む行は**項目1 で `isRecruitOn() &&` が消えた後の姿**(依頼書 §8 の表の文字列は古い)。 */
  partysizeline: [['    if (prepScenario) partySize = 1 + recruitCountOf(prepScenario);',
                   '    partySize = PARTY_SIZE;   /* ★変異partysizeline */']],
};
/* 変異 → 赤くなるべき assert id。
 * ⚠⚠⚠ **机上で書かない**。1 本ずつ実走して**実際に赤くなった id** を書く (#57 の教訓)。
 * ⚠⚠ 1 節だけに絞ると必ず外れる ⇒ ここに書いた節が赤くなることを**必須条件**にし、
 *    他の節が巻き添えで赤くなるのは**許容**する。
 * ── 2026-09-09 の実走で**実際に赤くなった集合** (爆風の広さも記録しておく) ─────────
 *   starlink      … 1a 1b 1c 1a2 1e        (5 本)
 *   capout        … 1a 1b 2a 2b            (4 本)  ⭐ 期待値を RECRUIT_MAX から導いた assert は素通し
 *   switchdead    … 1c 1e 3a 3b            (4 本)
 *   nolegacy      … 1c 1e 3a               (3 本)  ⭐ 最も狭い = 節が分離している証拠
 *   partysizeline … 1c 1a2 1e 3a 3a2 3b    (6 本)
 * ⭐ capout だけが §2 を赤くし、nolegacy が §3 だけ、starlink が §1 中心 = **節が分離している**。
 * ⚠⚠ **依頼書 §8 の変異表と実測が食い違った 2 件**:
 *   ・capout の「§1 (1b) が赤くなる」… (1b) は確かに赤いが、それは goblin-mine の
 *     `recruit: 3` が上限 4 と食い違ったからで、**期待値を RECRUIT_MAX から導いた効果ではない**。
 *     上限外しを本当に捕まえているのは (2b) の直値 + PARTY_SIZE-1 だけ。
 *   ・partysizeline の「§1 (1a) が赤くなる」… **赤くならない**。
 *     PARTY_SIZE === 1 + RECRUIT_MAX なので既定腕では人数が偶然一致する。
 *     捕まえるのは (1a2) の `recruit:` 注入と、(1c)(3a)(3a2) の 2 腕比較。
 * ⭐ (1e)(3b) が広く巻き添えになるのは設計どおり — (1e) は「2 つの腕が見分けられなくなった」、
 *   (3b) は「旧経路を通らなくなった」を、それぞれ別の言葉で言っている。 */
const MUT_EXPECT = {
  starlink:      ['1a', '1b', '1c'],
  capout:        ['2b'],
  switchdead:    ['3a'],
  nolegacy:      ['3a'],
  partysizeline: ['1a2', '1c', '3a'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  /* ⚠ 変異ごとに**原本**を読み直す。変異後のバッファを使い回すと、同じアンカーを共有する
   *   2 本目が「注入点 0 箇所」= 偽のアンカー腐敗 exit 3 になる (#56 の教訓)。 */
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of MUTATIONS[key]) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → 差し替わったか確認できない');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  _mutCache[key] = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey)[rel]); return;
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
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// ★判定本体 (Node 側の純関数。⛔ 空入力では必ず false = 空で緑になる測定器を作らない)
//   ⭐⭐ 「スイッチを外すと期待値が変わる」は **assert 本体を共有しないと空振りする**。
//     判定は judgePartySizes ただ 1 本。(1a) と (3a) が同じ関数に違う期待表を渡すだけで、
//     共有が空振りしていないことは (1e) が「腕を取り違えると落ちる」で証明する。
// ══════════════════════════════════════════════════════════════════════════════
function judgePartySizes(rows, expected) {
  const ids = Object.keys(expected || {});
  const diffs = [];
  ids.forEach(id => {
    const r = (rows || []).find(x => x.id === id);
    if (!r)               { diffs.push(id + ': 観測なし'); return; }
    if (r.wrote !== true) { diffs.push(id + ': 出発処理が partyMembers を書いていない'); return; }
    if (r.npc !== expected[id]) diffs.push(id + ': NPC ' + r.npc + ' (期待 ' + expected[id] + ')');
  });
  return { ok: ids.length > 0 && (rows || []).length === ids.length && diffs.length === 0, diffs };
}
/* 期待表は**本番の RECRUIT_MAX から組み立てる**。⛔ 3 を直書きしない (依頼書 §8 (0b))。 */
function uniformExpectation(ids, npcMax) {
  const o = {}; ids.forEach(id => { o[id] = npcMax; }); return o;
}
/* ★連動 (= ?recruit=0 で戻る姿) の期待表を **シナリオ表そのものから**導く。
   ⭐ 2 経路突き合わせの片方は「変異が触れない場所」でなければ意味がない (#58 の教訓):
     ここは difficulty / recruit という**定義データ**を読むので、
     recruitCountOf / recruitCountLegacy / isRecruitOn を壊す変異はこの表を動かせない。 */
function legacyExpectation(meta, npcMax) {
  const clamp = (n) => Math.max(1, Math.min(npcMax, Math.floor(n)));
  const o = {};
  (meta || []).forEach(m => { o[m.id] = (m.recruit !== null) ? clamp(m.recruit) : clamp(m.stars); });
  return o;
}
/* 隊列の述語。⛔ 並び**文字列**は run ごとに変わる (NPC の職抽選が乱択) ので逐語で縛らない。
   front → mid → rear の **単調非減少**だけを見る。
   ⚠ 全員 front だと自明にソート済み = 何も証明しないので maxDistinct >= 2 を必ず要求する。 */
const ZONE_RANK = { front: 0, mid: 1, rear: 2 };
function judgeFormation(rows) {
  const bad = []; let maxDistinct = 0;
  (rows || []).forEach(r => {
    const zs = String(r.zones || '').split('>').filter(Boolean);
    if (!zs.length) { bad.push(r.id + ': zone が空'); return; }
    const ranks = zs.map(z => (Object.prototype.hasOwnProperty.call(ZONE_RANK, z) ? ZONE_RANK[z] : -1));
    if (ranks.some(v => v < 0)) { bad.push(r.id + ': 未知の zone ' + r.zones); return; }
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] < ranks[i - 1]) { bad.push(r.id + ': ' + r.zones); break; }
    }
    maxDistinct = Math.max(maxDistinct, new Set(zs).size);
  });
  return { ok: (rows || []).length > 0 && bad.length === 0 && maxDistinct >= 2, bad, maxDistinct };
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入本体
// ══════════════════════════════════════════════════════════════════════════════
async function runSuite(browser, port, label) {
  const R = [], errs = [], consoleLines = [];
  const check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
    console.log('  ' + (cond ? 'PASS' : 'FAIL') + ' (' + id + ') ' + name + (detail !== undefined ? '  — ' + detail : ''));
  };
  const base = 'http://127.0.0.1:' + port;
  const PURGE_MARK = '__dfPurgedOnce';

  /* ⚠⚠ #54: 既定の編成は「酒場で声を掛けた相手だけ」= 誰も誘っていなければソロ。
       自動編成 (主人公 1 + 抽選 NPC) は ?recruittalk=0 でのみ生きている。
     ⚠⚠ #55: 出発準備画面 (#prep) は既定の導線から外れた ⇒ ?prepskip=0。
     ⛔ どちらかを外すと母集団が消えて**全 assert が空振りで永久緑**になる。 */
  const withArms = (p) => {
    let q = p + (p.indexOf('?') >= 0 ? '&' : '?') + 'recruittalk=0';
    if (String(q).indexOf('tavern.html') >= 0) q += '&prepskip=0';
    return q;
  };
  async function openPage(pathQuery, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    const navBlocked = [];
    page.__navBlocked = navBlocked;
    page.on('pageerror', e => errs.push('PAGEERROR ' + pathQuery + ' :: ' + e.message));
    page.on('console', m => { consoleLines.push(m.text()); });
    await page.evaluateOnNewDocument((cfg) => {
      try {
        if (sessionStorage.getItem(cfg.mark)) return;   // ⚠ purge は 1 タブ 1 回だけ
        var kill = function (store) {
          Object.keys(store).forEach(function (k) {
            if (k.indexOf('df.') === 0) store.removeItem(k);
            if (k.indexOf('dragonfighters.') === 0) store.removeItem(k);
          });
        };
        kill(localStorage); kill(sessionStorage);
        localStorage.setItem('dragonfighters.prologueSeen', '1');   // 前口上は測定対象外
        sessionStorage.setItem(cfg.mark, '1');
      } catch (e) {}
    }, { mark: PURGE_MARK });
    /* ⚠⚠⚠ **world.html を含めること**。#23 以降、出発は地方全景を 1 段挟むので
         index だけを abort していると酒場タブが本当に飛び、以降の evaluate が全部
         "Execution context was destroyed" で倒れる。 */
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame() && /\/(index|world)\.html/.test(r.url())) {
          navBlocked.push(r.url()); r.abort('aborted'); return;
        }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });
    const url = base + (opts.rawUrl ? pathQuery : withArms(pathQuery));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(opts.settle || 900);
    return page;
  }

  /* 観測本体。**本番の関数だけ**を呼ぶ。
     ⛔ sessionStorage への書き込みを写経すると出発処理を一度も通さないまま緑になる。 */
  async function observeDepartSizes(page, ids) {
    return page.evaluate((idList) => {
      const out = { rows: [], threw: '', sawIds: [] };
      try {
        for (const id of idList) {
          const sc = scenarios.find(s => s.id === id);
          if (!sc) { out.rows.push({ id, wrote: false, total: -1, npc: -1, missing: true }); continue; }
          prepScenario = sc;                                          // openPrep(sc) 相当
          regeneratePartyMembers();                                   // ★本番の再抽選
          sessionStorage.removeItem('dragonfighters.partyMembers');   // 前周の値を残さない
          departToScenario();                                         // ★本番の出発処理
          const raw = sessionStorage.getItem('dragonfighters.partyMembers');
          let arr = null; try { arr = JSON.parse(raw); } catch (e) {}
          const ok = Array.isArray(arr);
          out.rows.push({
            id,
            wrote:   raw !== null,
            total:   ok ? arr.length : -1,
            npc:     ok ? arr.length - 1 : -1,                                  // 経路 A
            heroes:  ok ? arr.filter(m => m && m.isHero).length : -1,
            zones:   ok ? arr.map(m => m && m.zone).join('>') : '',
            decided: (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null,   // 経路 B
            difficulty: sc.difficulty === undefined ? '(なし)' : sc.difficulty,
          });
          out.sawIds.push(id);
        }
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    }, ids);
  }

  /* シナリオ定義そのもの (★の数 / recruit: の有無) と、本番の定数を裸の識別子で読む。 */
  async function readMeta(page) {
    return page.evaluate(() => {
      const out = { threw: '', seam: {}, list: [] };
      try {
        out.seam = {
          scenarios:          typeof scenarios,
          scenarioCount:      (typeof scenarios === 'object' && scenarios) ? scenarios.length : -1,
          recruitCountOf:     typeof recruitCountOf,
          recruitCountLegacy: typeof recruitCountLegacy,
          isRecruitOn:        typeof isRecruitOn,
          departToScenario:   typeof departToScenario,
          regenerate:         typeof regeneratePartyMembers,
          typeofMAX:          typeof RECRUIT_MAX,
          RECRUIT_MAX:        (typeof RECRUIT_MAX === 'number') ? RECRUIT_MAX : null,
          typeofPARTY_SIZE:   typeof PARTY_SIZE,
          PARTY_SIZE:         (typeof PARTY_SIZE === 'number') ? PARTY_SIZE : null,
          onWindowMAX:        typeof window.RECRUIT_MAX,
          recruitOn:          (typeof isRecruitOn === 'function') ? isRecruitOn() : null,
          allIds:             scenarios.map(s => s.id),
        };
        out.list = scenarios.map(s => ({
          id: s.id,
          difficulty: (typeof s.difficulty === 'string') ? s.difficulty : null,
          stars: (typeof s.difficulty === 'string') ? (s.difficulty.match(/★/g) || []).length : -1,
          recruit: (typeof s.recruit === 'number' && isFinite(s.recruit)) ? s.recruit : null,
        }));
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
  }

  /* シナリオ定義の `recruit:` を **ランタイムで**差し替える (value=null で撤去)。
     ⛔ ソースを書き換えて測らない (作業ツリーが汚れる & 配信差し替えと二重になる)。 */
  async function setRecruit(page, id, value) {
    return page.evaluate((cfg) => {
      const sc = scenarios.find(s => s.id === cfg.id);
      if (!sc) return { found: false };
      const had = Object.prototype.hasOwnProperty.call(sc, 'recruit');
      if (cfg.value === null) delete sc.recruit; else sc.recruit = cfg.value;
      return { found: true, hadBefore: had, now: (typeof sc.recruit === 'number') ? sc.recruit : null };
    }, { id, value });
  }

  const dump = (rows) => (rows || []).map(r =>
    r.id + '(' + r.difficulty + ')=計' + r.total + '人/NPC' + r.npc + '/決定' + r.decided).join('  ');
  const rowOf = (rows, id) => (rows || []).find(r => r.id === id) || null;

  // ══ §0 装置 (先に母集団を確かめる) ══════════════════════════════════════════
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  const pageDef = await openPage('/tavern.html');
  const meta = await readMeta(pageDef);
  const LIVE_MAX  = meta.seam.RECRUIT_MAX;
  const LIVE_SIZE = meta.seam.PARTY_SIZE;
  const meta6 = (meta.list || []).filter(m => SCENARIO_IDS.indexOf(m.id) >= 0);
  console.log('       seam = ' + JSON.stringify(meta.seam));
  console.log('       シナリオ表 = ' + JSON.stringify(meta6));

  check('0a', '★装置: scenarios が ' + SCENARIO_IDS.length + ' 件 / recruitCountOf が function / RECRUIT_MAX が数値 — 裸の識別子で読めた (これが無いと全 assert が空振りで永久緑)',
    meta.threw === '' && meta.seam.scenarios === 'object'
    && meta.seam.scenarioCount === SCENARIO_IDS.length
    && SCENARIO_IDS.every(id => (meta.seam.allIds || []).indexOf(id) >= 0)
    && meta.seam.recruitCountOf === 'function' && meta.seam.recruitCountLegacy === 'function'
    && meta.seam.isRecruitOn === 'function' && meta.seam.departToScenario === 'function'
    && meta.seam.regenerate === 'function'
    && meta.seam.typeofMAX === 'number' && typeof LIVE_MAX === 'number'
    && meta.seam.onWindowMAX === 'undefined'   // classic script 直下の const なので window には出ない
    && meta.seam.recruitOn === true,           // 既定腕 = ★連動を廃止した姿
    'threw=' + (meta.threw || 'なし') + ' / ids=' + JSON.stringify(meta.seam.allIds)
    + ' / RECRUIT_MAX=' + LIVE_MAX + ' / isRecruitOn()=' + meta.seam.recruitOn);

  const EXPECT_DEFAULT = uniformExpectation(SCENARIO_IDS, LIVE_MAX);
  const EXPECT_LEGACY  = legacyExpectation(meta6, LIVE_MAX);
  console.log('       既定腕の期待表 = ' + JSON.stringify(EXPECT_DEFAULT));
  console.log('       ?recruit=0 腕の期待表 (★の数から導出) = ' + JSON.stringify(EXPECT_LEGACY));

  /* (0b) ⭐ 期待値 3 を写経していないことの証明 = 期待表が **LIVE_MAX の関数**であること
     (定数表なら LIVE_MAX+1 を渡しても値が変わらない)。 */
  const probeTable = uniformExpectation(SCENARIO_IDS, LIVE_MAX + 1);
  check('0b', '★装置: 既定腕の期待値を写経していない — 期待表は本番の RECRUIT_MAX から組み立てた関数の出力',
    typeof LIVE_MAX === 'number' && LIVE_MAX >= 2
    && Object.keys(EXPECT_DEFAULT).length === SCENARIO_IDS.length
    && SCENARIO_IDS.every(id => EXPECT_DEFAULT[id] === LIVE_MAX)
    && SCENARIO_IDS.every(id => probeTable[id] === LIVE_MAX + 1),
    'RECRUIT_MAX=' + LIVE_MAX + ' → 期待表 ' + JSON.stringify(EXPECT_DEFAULT)
    + ' / +1 を渡すと ' + JSON.stringify(probeTable));

  /* (0c) ⭐ ★連動を廃止したことに意味がある母集団か。全部 ★RECRUIT_MAX 以上なら何も証明しない。 */
  const weak = meta6.filter(m => m.stars >= 0 && m.stars < LIVE_MAX);
  check('0c', '★装置: ★が RECRUIT_MAX (' + LIVE_MAX + ') 未満のシナリオが 2 件以上実在する (= 廃止に意味がある母集団)',
    weak.length >= 2,
    '該当 ' + weak.length + ' 件 = ' + JSON.stringify(weak.map(m => m.id + ':' + m.difficulty + '(★' + m.stars + ')')));

  /* (0d) 撤退腕の期待表が 1 種類の値に潰れていると、(3a) の一致が自明になって何も測らない。 */
  const legacyDistinct = new Set(Object.values(EXPECT_LEGACY));
  check('0d', '★装置: ?recruit=0 腕の期待表が 1 種類の値に潰れていない (潰れると撤退の検査が自明になる)',
    legacyDistinct.size >= 2 && Object.keys(EXPECT_LEGACY).length === SCENARIO_IDS.length,
    '値の種類 = ' + JSON.stringify([...legacyDistinct]) + ' / 表 = ' + JSON.stringify(EXPECT_LEGACY));

  // ══ §1 本体 ════════════════════════════════════════════════════════════════
  console.log('\n[drv] §1 本体 — 6 シナリオすべてが 主人公1 + NPC' + LIVE_MAX + ' で出発する  ' + label);
  const rowsDef = (await observeDepartSizes(pageDef, SCENARIO_IDS));
  /* ⚠ location.href への代入は **同期では飛ばない**。evaluate が返った直後に navBlocked を
     読むと必ず 0 件になり「横取りが空振り」の偽の赤になる (verify_recruit_size で実測済み)。
     ⚠ 6 回出発しても abort は 1 件しか立たない (同じ tick の代入は最後の 1 本に畳まれる)
       ので、閾値は >= 1 + 「まだ酒場に居る」で押さえる。 */
  await sleep(900);
  console.log('       既定腕 = ' + dump(rowsDef.rows));
  console.log('       遷移の横取り = ' + pageDef.__navBlocked.length + ' 件 / 現在地 = ' + pageDef.url());
  const jDef = judgePartySizes(rowsDef.rows, EXPECT_DEFAULT);

  check('1a', '★経路A: 実際に編成された partyMembers が 6 件とも 計' + (LIVE_MAX + 1) + '人 (NPC' + LIVE_MAX + ')',
    jDef.ok && rowsDef.threw === '' && rowsDef.rows.every(r => r.heroes === 1)
    && rowsDef.sawIds.length === SCENARIO_IDS.length
    && pageDef.__navBlocked.length >= 1 && /\/tavern\.html/.test(pageDef.url()),
    (jDef.diffs.length ? '差分 ' + JSON.stringify(jDef.diffs) : '全 6 件一致')
    + ' / threw=' + (rowsDef.threw || 'なし') + ' / 踏んだ id=' + rowsDef.sawIds.length
    + ' / 出発の遷移=' + pageDef.__navBlocked.length + ' 回 / 現在地=' + pageDef.url());

  check('1b', '★経路B: recruitCountOf(sc) の直呼びが 6 件とも RECRUIT_MAX (' + LIVE_MAX + ')',
    rowsDef.rows.length === SCENARIO_IDS.length && rowsDef.rows.every(r => r.decided === LIVE_MAX),
    rowsDef.rows.map(r => r.id + '=' + r.decided).join(' '));

  check('1b2', '★2 経路の突き合わせ: 経路A (出発した人数-1) と 経路B (recruitCountOf) が 6 件とも一致',
    rowsDef.rows.length === SCENARIO_IDS.length && rowsDef.rows.every(r => r.npc === r.decided),
    rowsDef.rows.map(r => r.id + ':A' + r.npc + '/B' + r.decided).join(' '));

  /* (1c) ⚠⚠ **値の向きまで書く**。「動く id の集合」だけでは ★連動が復活しても緑のまま
     (集合が両方向で同じなので向きを検出できない = 項目2 の実測)。 */
  const pageOff = await openPage('/tavern.html?recruit=0');
  const metaOff = await readMeta(pageOff);
  const rowsOff = (await observeDepartSizes(pageOff, SCENARIO_IDS));
  console.log('       ?recruit=0 腕 = ' + dump(rowsOff.rows));
  const movedDetail = MOVED_IDS.map(id => {
    const a = rowOf(rowsOff.rows, id), b = rowOf(rowsDef.rows, id);
    return id + ': ?recruit=0 で計' + (a && a.total) + '人(NPC' + (a && a.npc) + ')'
         + ' → 無指定で計' + (b && b.total) + '人(NPC' + (b && b.npc) + ')';
  }).join(' / ');
  const movedOk = metaOff.seam.recruitOn === false && MOVED_IDS.every(id => {
    const a = rowOf(rowsOff.rows, id), b = rowOf(rowsDef.rows, id);
    const m = meta6.find(x => x.id === id);
    if (!a || !b || !m) return false;
    return a.wrote === true && b.wrote === true
        && a.npc === m.stars && a.total === 1 + m.stars       // ?recruit=0 → ★の数 (森/沼 = 2)
        && b.npc === LIVE_MAX && b.total === 1 + LIVE_MAX     // 無指定 → 上限 (= 3)
        && b.npc > a.npc && b.total > a.total;                // ⭐ 向き: 増える方向にだけ動く
  });
  check('1c', '★森と沼が実際に 3 人 → 4 人へ動いた (?recruit=0 で ★の数 / 無指定で RECRUIT_MAX。⭐ 向きまで測る)',
    movedOk, movedDetail + ' / ?recruit=0 の isRecruitOn()=' + metaOff.seam.recruitOn);

  const form = judgeFormation(rowsDef.rows);
  check('1d', '★隊列は 4 人でも front → mid → rear を保つ (単調非減少 + zone が 2 種類以上ある行が実在)',
    form.ok, '崩れ=' + JSON.stringify(form.bad) + ' / 最大 zone 種類=' + form.maxDistinct
    + ' / 実際の並び=' + rowsDef.rows.map(r => r.id + ':' + r.zones).join(' '));

  /* (1a2) ⭐ 経路A が本当に recruitCountOf を通っているかの検査。
     PARTY_SIZE === 1 + RECRUIT_MAX なので、既定腕の**人数だけ**では
     「partySize = PARTY_SIZE 直読み」と区別できない (partysizeline がそれ)。
     ⇒ `recruit:` を RECRUIT_MAX-1 で注入し、出発人数が **1 減って戻る**ことを見る。 */
  const pageInj = await openPage('/tavern.html');
  const injBefore = await observeDepartSizes(pageInj, [INJECT_ID]);
  const setA = await setRecruit(pageInj, INJECT_ID, LIVE_MAX - 1);
  const injAfter = await observeDepartSizes(pageInj, [INJECT_ID]);
  const setB = await setRecruit(pageInj, INJECT_ID, null);
  const injBack = await observeDepartSizes(pageInj, [INJECT_ID]);
  const rB = rowOf(injBefore.rows, INJECT_ID), rA = rowOf(injAfter.rows, INJECT_ID), rR = rowOf(injBack.rows, INJECT_ID);
  check('1a2', '★経路A は本当に recruitCountOf を通っている — ' + INJECT_ID + ' へ recruit:' + (LIVE_MAX - 1) + ' を注入すると出発人数が 1 減り、撤去で戻る',
    LIVE_MAX >= 2 && setA.found === true && setA.hadBefore === false && setB.found === true
    && !!rB && !!rA && !!rR
    && rB.wrote === true && rA.wrote === true && rR.wrote === true
    && rB.npc === LIVE_MAX && rA.npc === LIVE_MAX - 1 && rR.npc === LIVE_MAX
    && rA.total === rB.total - 1 && rR.total === rB.total,
    '注入前 計' + (rB && rB.total) + '人(NPC' + (rB && rB.npc) + ') → 注入後 計' + (rA && rA.total)
    + '人(NPC' + (rA && rA.npc) + ') → 撤去後 計' + (rR && rR.total) + '人(NPC' + (rR && rR.npc) + ')');

  /* (1e) 判定本体を共有していることが**空振りしていない**ことの証明。
     ⭐ 同じ judgePartySizes に「腕を取り違えた期待表」を渡したら必ず落ちる。 */
  const crossA = judgePartySizes(rowsDef.rows, EXPECT_LEGACY);   // 既定腕に ★の数の表 → 落ちるべき
  const crossB = judgePartySizes(rowsOff.rows, EXPECT_DEFAULT);  // 撤退腕に 一律の表 → 落ちるべき
  const emptyC = judgePartySizes([], EXPECT_DEFAULT);            // 空の母集団 → 落ちるべき
  check('1e', '★装置: 判定本体 (judgePartySizes) は恒真ではない — 腕を取り違えた期待表と空の母集団では必ず落ちる',
    crossA.ok === false && crossB.ok === false && emptyC.ok === false,
    '既定腕×★の表=' + crossA.ok + ' / 撤退腕×一律の表=' + crossB.ok + ' / 空=' + emptyC.ok);

  // ══ §2 恒等 (非退行) ═══════════════════════════════════════════════════════
  console.log('\n[drv] §2 恒等 (非退行)  ' + label);
  const sameDetail = UNMOVED_IDS.map(id => {
    const a = rowOf(rowsOff.rows, id), b = rowOf(rowsDef.rows, id);
    return id + ':?recruit=0=' + (a && a.total) + '人/無指定=' + (b && b.total) + '人';
  }).join(' ');
  check('2a', '★元から 4 人の 4 本 (廃坑・砦・神殿・竜の巣) は ?recruit=0 と無指定で人数が同じ',
    UNMOVED_IDS.every(id => {
      const a = rowOf(rowsOff.rows, id), b = rowOf(rowsDef.rows, id);
      return !!a && !!b && a.wrote === true && b.wrote === true && a.total === b.total && a.npc === b.npc;
    }), sameDetail);

  /* (2b) ⚠⚠ ここだけは **RECRUIT_MAX から導出しない**。導出すると capout (上限を 4 へ外す変異) が
     期待値ごと動いて素通しする (項目2 の実測)。⇒ 直値 3 と PARTY_SIZE-1 の両方で縛る。 */
  check('2b', '★上限を外していない: RECRUIT_MAX === 3 (直値) かつ PARTY_SIZE - 1 === RECRUIT_MAX',
    LIVE_MAX === 3 && typeof LIVE_SIZE === 'number' && LIVE_SIZE - 1 === LIVE_MAX,
    'RECRUIT_MAX=' + LIVE_MAX + ' / PARTY_SIZE=' + LIVE_SIZE);

  /* (2c) 「同行の約束: n / 3 人」の表示が RECRUIT_MAX から導かれている (#54 の不変条件)。
     ⚠⚠⚠ この節は **?recruittalk=0 の腕では測れない** (自動編成には約束の UI が無い)。
       #60 の verify_party_promises と同じ **既定 ON の腕**で測る ⇒ rawUrl。
     ⚠ #60 の教訓「引き直しの契機を通さないと偽の値を読む」: markup の初期値は
       `🤝 0 / 3` と焼いてあるので、**わざと壊してから本番の描画関数を呼び直す**。 */
  const pagePro = await openPage('/tavern.html', { rawUrl: true });
  const pro = await pagePro.evaluate(() => {
    const out = { threw: '', max: null, seam: {}, badge: null, sub: null, before: {} };
    try {
      out.max = (typeof RECRUIT_MAX === 'number') ? RECRUIT_MAX : null;
      out.seam = { paint: typeof paintPromisesBadge, render: typeof renderPromisesPanel,
                   countNow: typeof recruitCountNow,
                   promisesOn: (typeof PROMISES_ON !== 'undefined') ? PROMISES_ON : null };
      const b = document.getElementById('promisesBadge');
      const s = document.getElementById('promisesSub');
      out.before = { badge: b ? b.textContent : null, sub: s ? s.textContent : null };
      // ★引き直しの契機を通した証拠を作る (markup の焼き値をそのまま読むのを防ぐ)
      if (b) b.textContent = '__CLOBBER__';
      if (s) s.textContent = '__CLOBBER__';
      paintPromisesBadge();      // ★本番
      renderPromisesPanel();     // ★本番
      out.badge = b ? b.textContent : null;
      out.sub   = s ? s.textContent : null;
    } catch (e) { out.threw = String((e && e.message) || e); }
    return out;
  });
  const denom = (s) => { const m = /\/\s*(\d+)/.exec(String(s || '')); return m ? Number(m[1]) : null; };
  console.log('       約束の表示 (既定 ON 腕) = badge "' + pro.badge + '" / sub "' + pro.sub + '"'
    + ' / 上書き前 = ' + JSON.stringify(pro.before) + ' / seam=' + JSON.stringify(pro.seam));
  check('2c', '★「同行の約束: n / RECRUIT_MAX 人」の分母が本番の RECRUIT_MAX から導かれている (#54 の不変条件。⭐ 既定 ON の腕で測る)',
    pro.threw === '' && pro.seam.paint === 'function' && pro.seam.render === 'function'
    && pro.seam.promisesOn === true && pro.max === LIVE_MAX
    && pro.badge !== '__CLOBBER__' && pro.sub !== '__CLOBBER__'   // 本番の描画関数が実際に書いた
    && denom(pro.badge) === LIVE_MAX && denom(pro.sub) === LIVE_MAX
    && /同行の約束/.test(String(pro.sub || '')),
    'badge 分母=' + denom(pro.badge) + ' / sub 分母=' + denom(pro.sub) + ' / RECRUIT_MAX=' + pro.max
    + ' / threw=' + (pro.threw || 'なし'));

  // ══ §3 撤退 ════════════════════════════════════════════════════════════════
  console.log('\n[drv] §3 撤退 (?recruit=0 = ★連動へ戻る)  ' + label);
  const jOff = judgePartySizes(rowsOff.rows, EXPECT_LEGACY);
  check('3a', '★?recruit=0 で 6 件が ★の数へ戻る (廃坑は recruit:3 の上書きで 3。期待表はシナリオ定義から導出)',
    jOff.ok && rowsOff.threw === '' && metaOff.seam.recruitOn === false,
    (jOff.diffs.length ? '差分 ' + JSON.stringify(jOff.diffs) : '全 6 件一致')
    + ' / 期待 ' + JSON.stringify(EXPECT_LEGACY) + ' / threw=' + (rowsOff.threw || 'なし'));

  check('3a2', '★?recruit=0 の腕でも 経路A と 経路B が 6 件とも一致する (partySize の行が recruitCountOf を通っている)',
    rowsOff.rows.length === SCENARIO_IDS.length && rowsOff.rows.every(r => r.npc === r.decided),
    rowsOff.rows.map(r => r.id + ':A' + r.npc + '/B' + r.decided).join(' '));

  /* (3b) `[DIAG] recruit: fallback used` は **?recruit=0 のとき・生成クエストのときだけ** 1 行出る。
     ⭐⭐ 「ログが出た」を件数の絶対値で測らない。区間を 3 つに割って**差分**で見る
       (「X したから今の状態」と「元から同じ状態」は区別できない)。 */
  const diagSince = (from) => consoleLines.slice(from).map(s => String(s).trim())
    .filter(s => s.indexOf(DIAG_PREFIX) === 0);
  // 区間0: difficulty を持つ固定シナリオでは出ない (無条件に出しているのではない)
  const d0 = consoleLines.length;
  await observeDepartSizes(pageOff, [INJECT_ID]);
  await sleep(500);
  const diag0 = diagSince(d0);
  // 区間1: 生成クエストを **作るだけ** (人数はまだ決めない)
  const d1 = consoleLines.length;
  const gen = await pageOff.evaluate(() => {
    const out = { threw: '', seam: {}, probe: null };
    try {
      out.seam = { QuestGen: typeof QuestGen, buildPlazaSynthetic: typeof buildPlazaSynthetic };
      const q = QuestGen.generateQuest(3, { source: 'plaza' });
      q._sentence = QuestGen.buildSentence(q);
      const s = buildPlazaSynthetic(q);          // ★本番の 生成クエスト → シナリオ 変換
      window.__synthPF = s;
      out.probe = { id: s.id,
                    hasDifficulty: Object.prototype.hasOwnProperty.call(s, 'difficulty'),
                    hasRecruit:    Object.prototype.hasOwnProperty.call(s, 'recruit') };
    } catch (e) { out.threw = String((e && e.message) || e); }
    return out;
  });
  await sleep(500);
  const diag1 = diagSince(d1);
  // 区間2: 本番の再抽選 + 出発処理 (人数を決めるのはここ)
  const d2 = consoleLines.length;
  const genDep = await pageOff.evaluate(() => {
    const out = { threw: '', row: null };
    try {
      const s = window.__synthPF;
      prepScenario = s;
      regeneratePartyMembers();
      sessionStorage.removeItem('dragonfighters.partyMembers');
      departToScenario();
      const raw = sessionStorage.getItem('dragonfighters.partyMembers');
      let arr = null; try { arr = JSON.parse(raw); } catch (e) {}
      out.row = { id: s.id, wrote: raw !== null, total: Array.isArray(arr) ? arr.length : -1 };
    } catch (e) { out.threw = String((e && e.message) || e); }
    return out;
  });
  await sleep(600);
  const diag2 = diagSince(d2);
  console.log('       DIAG 行数: 固定シナリオ=' + diag0.length + ' / 作るだけ=' + diag1.length
    + ' / 出発=' + diag2.length + (diag2.length ? '  実文 = "' + diag2[0] + '"' : ''));
  console.log('       生成クエスト = ' + JSON.stringify(gen.probe) + ' / seam=' + JSON.stringify(gen.seam));
  check('3b', '★?recruit=0 で [DIAG] recruit: fallback used が **生成クエストのときだけ** 1 行出る (固定シナリオ 0 行 / 作るだけ 0 行 / 出発 1 行)',
    gen.threw === '' && genDep.threw === '' && gen.seam.QuestGen === 'object'
    && !!gen.probe && gen.probe.hasDifficulty === false && gen.probe.hasRecruit === false
    && diag0.length === 0 && diag1.length === 0 && diag2.length === 1
    && diag2[0].indexOf('id=' + gen.probe.id) >= 0,
    '固定=' + diag0.length + ' 作成=' + diag1.length + ' 出発=' + diag2.length
    + ' / 出た行 = ' + JSON.stringify(diag2) + ' / threw=' + (gen.threw || genDep.threw || 'なし'));

  await pageDef.close(); await pageOff.close(); await pageInj.close(); await pagePro.close();
  return { results: R, errs: errs };
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_party_four_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
    defaultViewport: { width: 1280, height: 900 },
  });
  const servers = [];
  let exitCode = 0;
  try {
    if (flag('negative')) {
      const srv0 = await startServer(PORT, null); servers.push(srv0);
      console.log('\n════ 素の 1 本 (基準) ════');
      const baseRun = await runSuite(browser, PORT, '(素)');
      const baseFail = baseRun.results.filter(r => !r.ok).map(r => r.id);
      if (baseFail.length) {
        console.log('\n⛔ 素の実行で FAIL がある (' + baseFail.join(',') + ') — 先にそれを直すこと');
        exitCode = 1;
      }
      const only = (arg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
      const order = only.length ? MUT_ORDER.filter(k => only.indexOf(k) >= 0) : MUT_ORDER;
      const report = [];
      for (let i = 0; i < order.length; i++) {
        const key = order[i], port = PORT + 1 + MUT_ORDER.indexOf(key);
        const srv = await startServer(port, key); servers.push(srv);
        console.log('\n════ 変異 ' + key + ' (port ' + port + ') ════');
        let failed = [];
        try {
          const run = await runSuite(browser, port, '[変異 ' + key + ']');
          failed = run.results.filter(r => !r.ok).map(r => r.id);
        } catch (e) {
          /* ⭐ 変異でドライバ自身が落ちるのも「検出できた」= 期待どおり。理由を必ず出す。 */
          failed = ['THREW'];
          console.log('  (変異でドライバが例外: ' + String((e && e.message) || e) + ')');
        }
        const want = MUT_EXPECT[key] || [];
        const hit = want.filter(id => failed.indexOf(id) >= 0);
        /* ⚠⚠⚠ 「何かが赤くなった」で満足しない。**期待した節が赤くなったか**まで見る
         *   (素は緑のまま変異だけ空振り、という型をここで捕まえる)。 */
        const ok = (want.length > 0 && hit.length === want.length) || failed.indexOf('THREW') >= 0;
        report.push({ key, want, failed, hit, ok });
        console.log('  ⇒ 変異 ' + key + ': 期待 ' + JSON.stringify(want) + ' / 実際に赤 ' + JSON.stringify(failed) +
                    ' / 命中 ' + JSON.stringify(hit) + ' → ' + (ok ? 'OK (検出できた)' : '⛔ 空振り'));
        if (!ok) exitCode = 1;
      }
      console.log('\n════════════════════════════════════════');
      console.log('  負のコントロール ' + report.filter(r => r.ok).length + ' / ' + report.length + ' が検出成功');
      for (const r of report) if (!r.ok) console.log('   ⛔ ' + r.key + ' が空振り (期待 ' + r.want.join(',') + ')');
      console.log('════════════════════════════════════════');
    } else {
      const srv = await startServer(PORT, MUTATE); servers.push(srv);
      const run = await runSuite(browser, PORT, MUTATE ? '[変異 ' + MUTATE + ']' : '');
      const okN = run.results.filter(r => r.ok).length, ngN = run.results.length - okN;
      console.log('\n[drv] pageerror = ' + run.errs.length + (run.errs.length ? ' ' + JSON.stringify(run.errs.slice(0, 4)) : ''));
      console.log('\n════════════════════════════════════════');
      console.log('  PASS ' + okN + ' / FAIL ' + ngN + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
      if (ngN) {
        console.log('  --- FAIL 一覧 ---');
        for (const r of run.results) if (!r.ok) console.log('   ・(' + r.id + ') ' + r.name + (r.detail ? '  — ' + r.detail : ''));
      }
      console.log('════════════════════════════════════════');
      if (ngN && !MUTATE) exitCode = 1;
    }
  } catch (e) {
    console.error('[drv] 例外: ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    await browser.close().catch(() => {});
    servers.forEach(s => { try { s.close(); } catch (e) {} });
  }
  process.exit(exitCode);
})();
