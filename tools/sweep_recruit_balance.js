#!/usr/bin/env node
/*
 * sweep_recruit_balance.js — 実装依頼書 #8「募集人数の変更に伴う難易度/XP の再調整」の測定台
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは**測定の道具**であって検出器ではない (ゲームの受入条件を持たない)。
 *   持っているのは「測定装置そのものが壊れていないか」を見る **装置 assert 5 本**だけ。
 *
 * ■ なぜ既存ドライバを流用しないのか (依頼書 §0-1 の実測)
 *   isRecruitOn() / recruitCountOf() は **tavern.html にしか無い**。
 *   auto_debug_run.js / probe_n4_stall.js は index.html を直起動するので
 *   ?recruit=0 が効かず、**両腕とも計 4 人**になる = 腕が割れない。
 *   → 正しい測定台は「酒場を本番どおり通して departToScenario() に遷移させる」。
 *
 * ■ 1 走行の手順 (依頼書 §3-1)
 *   1. dragonfighters.* / df.* を purge し prologueSeen だけ焼く
 *      ⚠ purge は **最初の document だけ**。index.html でもう一度走ると
 *        departToScenario() が置いた partyMembers を自分で消してしまう (guard 必須)
 *   2. tavern.html?autoplay=N (+ OLD 腕だけ &recruit=0) を開く
 *   3. 本番の関数だけを呼ぶ (写経しない):
 *      prepScenario = scenarios.find(...) → regeneratePartyMembers() → departToScenario()
 *   4. 遷移は横取りしない。index.html への着地を mapData / heroAI で待つ
 *   5. 1 秒間隔でポーリング (⚠ 150ms の evaluate は測定対象そのものを遅くする = P9 の教訓)
 *
 * ■ 装置 assert 5 本 (これが無いと全部緑になる)
 *   1. 酒場側 isRecruitOn() が腕どおり       … 腕が割れていないのに数字が出る
 *   2. 酒場側 recruitCountOf(sc) が期待値    … ★の読み違いに気づけない (腕に依らない値)
 *   3. 着地 URL が /index.html を含む        … 遷移していないのに「走った」ことになる
 *   4. index 側 allies.length + 1 が期待人数 … フォールバックした 4 人を新仕様として数える
 *   5. index 側 scenarioId が対象シナリオ    … 別のシナリオを測る
 *   ⚠ 母集団ガード: 「両腕とも何走行を集計できたか」を必ず 1 行出す。
 *     0 件でも「差が無かった」に見えるので、**件数を出さない集計は禁止**。
 *
 * ■ 指標は秒数で測らない (依頼書 §3-4)
 *   マシン負荷とポーリング間隔で揺れる。見るのは
 *   クリア率 / 全滅率 / 到達ノード / 仲間の生存 / 獲得XP / 主人公HP。
 *   ⚠⚠ **allies は走行中に増える**。廃坑の囚われの従者 (joinServantAlly) と闇市の召喚
 *     (executeSummon) が allies.push するので「出発時の人数」は分母に使えない。
 *     分母は必ず**終了時**から採ること (混ぜると 4/3 のような数が出る。N=2 スモークで実測)。
 *   ⚠ 全滅走行でも仲間は生きていることがある。ゲームオーバー判定は**主人公の死**だけを見るので、
 *     「仲間の生存」は難易度の指標としては鈍い。効くのは到達ノードと XP。
 *
 * ■ 負のコントロール
 *   --negative は OLD 腕から &recruit=0 を外す。装置 assert 1 と 4 が**赤くなるはず**で、
 *   赤くならなかったら「assert が空回りしている」ので exit 1 で落とす。
 *
 * 使い方:
 *   node tools/sweep_recruit_balance.js --scen bandits-forest --pairs 2      # スモーク
 *   node tools/sweep_recruit_balance.js --scen all --pairs 20 --workers 2    # 本番 (80 走行)
 *   node tools/sweep_recruit_balance.js --scen goblin-mine --pairs 1 --negative
 * オプション: --scen(all|<id>) --pairs --speed --port --max --workers --out
 *             --headful --browser --fixed-order --negative
 * exit 0=装置 assert が全部期待どおり / 1=装置 assert が崩れた / 2=環境不足 / 3=例外
 *
 * ⚠⚠ スイープ中に tavern.html / index.html を編集しないこと。
 *   前半と後半で別ビルドの混合物になり、出た差が何の差か言えなくなる。
 */
'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');   /* ⚠ path.resolve 必須 (でないと全 404) */

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : dflt;
}
const has = (n) => process.argv.includes('--' + n);

const SCEN_ARG    = arg('scen', 'bandits-forest');
const PAIRS       = Math.max(1, parseInt(arg('pairs', '2'), 10));
const SPEED       = parseInt(arg('speed', '15'), 10);
const PORT        = parseInt(arg('port', '9340'), 10);
/* 1 走行の観測上限。⚠ 300 では足りない: N=2 スモークで廃坑 OLD (計4人) が 241 秒でも
 *   まだ n1 を戦っていた (打切 1 件)。打切は「クリアでも全滅でもない」ので集計を濁す。 */
const MAXS        = parseInt(arg('max', '420'), 10);
const WORKERS     = Math.max(1, parseInt(arg('workers', '1'), 10));
const HEADFUL     = has('headful');
const FIXED_ORDER = has('fixed-order');
const NEGATIVE    = has('negative');
const OUT_ARG     = arg('out', null);

/* ── 期待値表 ────────────────────────────────────────────────────────────────
 * ⭐ これは**ドライバ側が独立に持つ期待値**。tavern.html の recruitCountOf() の
 *   clamp ロジックを写経したものではない (写経すると両方同時に間違える)。
 *   ★の数はページから読んだ sc.difficulty と突き合わせるので、
 *   仕様を変えたらこの表が赤くなる = 気づける。 */
const OLD_NPC = 3;                              /* #7 以前 = PARTY_SIZE 4 - 主人公 1 */
const SCEN_TABLE = {
  /* ⚠ [#8 の調整後] newNpc は「NEW 腕 (既定 URL) の期待 NPC 数」。廃坑は #8 で
     tavern.html の goblin-mine 定義へ `recruit: 3` を入れたので ★1 の 1 ではなく 3。
     期待値を緩めたのではなく **本番の仕様が変わった** (依頼書 #8 §9-4)。
     ⚠⚠ この結果 OLD 腕 (計4人) と NEW 腕 (計4人) は**人数が同じ**になる:
        ・腕の区別は assert 1 (isRecruitOn の true/false) が単独で担う
        ・--negative では assert 4 (partySize) が赤くならない (元から同じ値なので)
          = 負のコントロールの検査力は assert 1 だけに落ちる。廃坑で --negative を
          回すときはこれを承知で読むこと (bandits-forest なら 4 も赤くなる)。
     ⭐ 調整が効いたかは「OLD と NEW の差」ではなく **調整前の NEW (クリア率 15%) と
        調整後の NEW の差**で読む。OLD と揃うことこそが狙った結果。 */
  'goblin-mine':    { stars: 1, newNpc: 3, label: '廃坑 ★1 (#8 で recruit: 3)' },
  'bandits-forest': { stars: 2, newNpc: 2, label: 'シナリオ2 ★2' },
};
const ALL_SCENS = ['bandits-forest', 'goblin-mine'];

function armsFor(scen) {
  const t = SCEN_TABLE[scen];
  return [
    /* ⚠ --negative では OLD の &recruit=0 をわざと外す → assert 1 と 4 が赤くなるはず */
    { key: 'OLD', qs: NEGATIVE ? '' : '&recruit=0', expectRecruitOn: false, expectParty: 1 + OLD_NPC },
    { key: 'NEW', qs: '',                           expectRecruitOn: true,  expectParty: 1 + t.newNpc },
  ];
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[sweep] puppeteer-core が見つかりません'); process.exit(2);
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
  console.error('[sweep] ブラウザが見つかりません'); process.exit(2);
}

/* ⚠ MIME を落とすと try/catch に飲まれて全 500 = 白紙になる */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
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

/* ── ページ側: 酒場で腕を確定して出発させる ────────────────────────────────
 * ⭐ 本番の関数だけを呼ぶ。人数の決め方も Lv の配り方も**ここで再実装しない**
 *   (手作りの partyMembers を注入すると Lv と装備が本番と別物になる)。 */
const KICK = (sid) => {
  const out = { err: '' };
  try {
    out.recruitOn = (typeof isRecruitOn === 'function') ? isRecruitOn() : null;
    const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === sid) : null;
    if (!sc) { out.err = 'scenario not found: ' + sid; return out; }
    out.difficulty = sc.difficulty || null;
    out.stars = (String(sc.difficulty || '').match(/★/g) || []).length;
    out.decided = (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null;
    prepScenario = sc;
    regeneratePartyMembers();
    out.tavernNpc = (selection.partyMembers || []).filter(m => m && !m.isHero).length;
    departToScenario();
    out.kicked = true;
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ── ページ側: index の軽い観測 (1 秒ごと) ──────────────────────────────────
 * ⚠ 裸の識別子で読む。window.<名前> では読めない (classic script 直下の let は window に載らない)。
 * ⚠ playerHp という識別子は**存在しない**。主人公 HP は裸の hp。 */
const TICK = () => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  return {
    allies:  g(() => allies.length, -1),
    alive:   g(() => allies.filter(a => a.hp > 0).length, -1),
    scen:    g(() => scenarioId, null),
    node:    g(() => currentNodeId, null),
    over:    g(() => !!gameOver, false),
    cleared: g(() => !!dungeonCleared, false),
    hp:      g(() => (typeof hp === 'number' ? Math.round(hp) : null), null),
    xp:      g(() => earnedXpThisRun, null),
    lvls:    g(() => allies.map(a => a.level), null),
  };
};

/* ── 1 走行 ─────────────────────────────────────────────────────────────── */
async function runOnce(browser, scen, arm, pair) {
  const rec = {
    scen, pair, arm: arm.key, ok: false, asserts: {}, endReason: null,
    metrics: {}, nodesSeen: [], pageerrors: [], elapsedS: 0, err: '',
  };
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', e => { if (rec.pageerrors.length < 5) rec.pageerrors.push(e.message); });

    /* ⚠ guard 必須: index.html でもう一度走ると departToScenario() の handoff を消してしまう */
    await page.evaluateOnNewDocument(() => {
      try {
        if (sessionStorage.getItem('__dfSweepPurged')) return;
        [localStorage, sessionStorage].forEach(s => Object.keys(s).forEach(k => {
          if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
        }));
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem('__dfSweepPurged', '1');
      } catch (e) {}
    });

    const tavUrl = 'http://localhost:' + PORT + '/tavern.html?autoplay=' + SPEED + arm.qs;
    await page.goto(tavUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    /* 酒場のシームが揃うまで待つ (固定 sleep で誤魔化さない) */
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof selection !== 'undefined'"
      + " && selection && Array.isArray(selection.partyComposition)", { timeout: 30000 });

    const kick = await page.evaluate(KICK, scen);
    rec.tavern = kick;
    if (kick.err) { rec.err = '酒場: ' + kick.err; return rec; }

    /* 装置 assert 1 / 2 (酒場側) */
    rec.asserts['1_isRecruitOn'] = {
      got: kick.recruitOn, want: arm.expectRecruitOn, ok: kick.recruitOn === arm.expectRecruitOn };
    const t = SCEN_TABLE[scen];
    rec.asserts['2_recruitCountOf'] = {
      got: kick.decided, want: t.newNpc, stars: kick.stars, wantStars: t.stars,
      ok: kick.decided === t.newNpc && kick.stars === t.stars };

    /* 遷移は横取りしない。index.html への着地を待つ */
    let landed = null;
    try {
      await page.waitForFunction("typeof mapData !== 'undefined' && typeof heroAI === 'function'",
        { timeout: 60000 });
      landed = page.url();
    } catch (e) {
      landed = 'TIMEOUT url=' + page.url();
      rec.err = '着地せず: ' + landed;
    }
    rec.landed = landed;
    rec.asserts['3_landedIndex'] = { got: landed, want: '.../index.html',
      ok: /\/index\.html/.test(String(landed)) };
    if (!rec.asserts['3_landedIndex'].ok) return rec;

    const first = await page.evaluate(TICK);
    rec.first = { allies: first.allies, party: first.allies + 1, lvls: first.lvls };
    rec.asserts['4_partySize'] = {
      got: first.allies + 1, want: arm.expectParty, ok: (first.allies + 1) === arm.expectParty };
    rec.asserts['5_scenarioId'] = { got: first.scen, want: scen, ok: first.scen === scen };

    /* ── 走行の観測 (1 秒間隔) ── */
    const t0 = Date.now();
    let last = first;
    const seen = [];
    const push = (n) => { if (n != null && seen[seen.length - 1] !== n) seen.push(n); };
    push(first.node);
    while ((Date.now() - t0) / 1000 < MAXS) {
      await sleep(1000);
      last = await page.evaluate(TICK);
      push(last.node);
      if (last.over || last.cleared) break;
    }
    rec.elapsedS = Math.round((Date.now() - t0) / 1000);
    rec.nodesSeen = seen;
    rec.endReason = last.cleared ? 'clear' : (last.over ? 'wipe' : 'timeout');
    /* ⚠⚠ allies は走行中に**増える**。廃坑の囚われの従者 (joinServantAlly) と
     *   闇市の召喚 (executeSummon) が allies.push するので、開始 3 人が終了 4 人になる。
     *   → 「仲間の生存」の分母は**終了時**から採ること。開始の分母と終了の分子を混ぜると
     *     4/3 のような有り得ない数が出る (N=2 スモークで実際に出した)。 */
    rec.metrics = {
      cleared: !!last.cleared, over: !!last.over,
      node: last.node, alive: last.alive,
      alliesStart: first.allies, alliesEnd: last.allies,
      joined: last.allies - first.allies,
      xp: (typeof last.xp === 'number' ? last.xp : null),
      hp: (typeof last.hp === 'number' ? last.hp : null),
    };
    rec.ok = Object.keys(rec.asserts).every(k => rec.asserts[k].ok);
  } catch (e) {
    rec.err = String((e && e.message) || e);
  } finally {
    try { await page.close(); } catch (e) {}
  }
  return rec;
}

/* ── 集計 ───────────────────────────────────────────────────────────────── */
const median = (a) => {
  const v = a.filter(x => typeof x === 'number' && isFinite(x)).slice().sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) * 5) / 10;
};
const pct = (n, d) => d ? (Math.round(n / d * 1000) / 10) + '%' : '—';

function summarize(runs, scen) {
  const lines = [];
  const t = SCEN_TABLE[scen];
  lines.push('');
  lines.push('══ 集計: ' + scen + ' (' + t.label + ') ══');

  const mine = runs.filter(r => r.scen === scen);
  const broken = mine.filter(r => !r.ok);
  const perr = mine.filter(r => r.pageerrors.length);

  /* ⚠ 母集団ガード: 件数を出さない集計は禁止 */
  const okBy = {};
  for (const k of ['OLD', 'NEW']) okBy[k] = mine.filter(r => r.arm === k && r.ok);
  lines.push('  母集団ガード: OLD ' + okBy.OLD.length + '/' + PAIRS
    + ' / NEW ' + okBy.NEW.length + '/' + PAIRS
    + '   (装置assert崩れ ' + broken.length + ' 件 / pageerror ' + perr.length + ' 件)');
  if (broken.length) {
    for (const r of broken.slice(0, 6)) {
      const bad = Object.keys(r.asserts).filter(k => !r.asserts[k].ok)
        .map(k => k + '(got=' + JSON.stringify(r.asserts[k].got) + ' want=' + JSON.stringify(r.asserts[k].want) + ')');
      lines.push('    ⛔ pair' + r.pair + ' ' + r.arm + ': '
        + (bad.length ? bad.join(' , ') : (r.err || '不明')));
    }
    if (broken.length > 6) lines.push('    … 他 ' + (broken.length - 6) + ' 件');
  }
  if (!okBy.OLD.length || !okBy.NEW.length) {
    lines.push('  ⛔ 片腕が 0 件 → 比較は成立しない (「差が無かった」ではない)');
    return lines;
  }

  lines.push('  腕   出発   n   クリア   全滅    打切    途中合流  仲間生存(中央)  XP(中央)  主人公HP(中央)');
  for (const k of ['OLD', 'NEW']) {
    const rs = okBy[k];
    const n = rs.length;
    const clear = rs.filter(r => r.endReason === 'clear').length;
    const wipe  = rs.filter(r => r.endReason === 'wipe').length;
    const to    = rs.filter(r => r.endReason === 'timeout').length;
    const party = rs[0].first.party;
    /* ⚠ 分母は**終了時**の allies (途中合流ぶんを数え落とさないため) */
    const joined = rs.filter(r => r.metrics.joined > 0).length;
    const aliveMed = median(rs.map(r => r.metrics.alive));
    const denomMed = median(rs.map(r => r.metrics.alliesEnd));
    lines.push('  ' + k.padEnd(4) + ' ' + ('計' + party + '人').padEnd(6) + ' ' + String(n).padEnd(3)
      + ' ' + pct(clear, n).padEnd(8) + ' ' + pct(wipe, n).padEnd(7) + ' ' + pct(to, n).padEnd(7)
      + ' ' + (joined + '/' + n).padEnd(9)
      + ' ' + (aliveMed + '/' + denomMed).padEnd(15)
      + ' ' + String(median(rs.map(r => r.metrics.xp))).padEnd(9)
      + ' ' + String(median(rs.map(r => r.metrics.hp))));
  }

  /* 到達ノード = どこで折れたかが本体 */
  for (const k of ['OLD', 'NEW']) {
    const dist = {};
    for (const r of okBy[k]) {
      const key = r.metrics.node
        + (r.endReason === 'clear' ? '(clear)' : r.endReason === 'timeout' ? '(打切)' : '');
      dist[key] = (dist[key] || 0) + 1;
    }
    const s = Object.keys(dist).sort().map(x => x + ':' + dist[x]).join('  ');
    lines.push('  到達ノード ' + k + ': ' + (s || '—'));
  }

  /* ペア比較 (両腕とも装置 assert を通った組だけ) */
  let both = 0, oldOnly = 0, newOnly = 0, neither = 0;
  for (let p = 1; p <= PAIRS; p++) {
    const o = okBy.OLD.find(r => r.pair === p), nw = okBy.NEW.find(r => r.pair === p);
    if (!o || !nw) continue;
    const oc = o.endReason === 'clear', nc = nw.endReason === 'clear';
    if (oc && nc) both++; else if (oc) oldOnly++; else if (nc) newOnly++; else neither++;
  }
  const pairsOk = both + oldOnly + newOnly + neither;
  lines.push('  ペア比較(両腕とも集計可): ' + pairsOk + ' 組 → 両方クリア ' + both
    + ' / OLDのみ ' + oldOnly + ' / NEWのみ ' + newOnly + ' / 両方だめ ' + neither);
  return lines;
}

/* ── 本体 ───────────────────────────────────────────────────────────────── */
(async () => {
  const scens = (SCEN_ARG === 'all') ? ALL_SCENS.slice() : [SCEN_ARG];
  for (const s of scens) {
    if (!SCEN_TABLE[s]) {
      console.error('[sweep] 期待値表に無いシナリオ: ' + s
        + '  (表にあるのは ' + Object.keys(SCEN_TABLE).join(' / ') + ')');
      console.error('  ⚠ 表を足さずに測ると「★の読み違い」に気づけないので、わざと止めています。');
      process.exit(2);
    }
  }

  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const makeProfile = require('./_pptr_profile');

  const total = scens.length * PAIRS * 2;
  console.log('[sweep] シナリオ=' + scens.join(',') + '  ペア=' + PAIRS + '  腕=2  → ' + total + ' 走行');
  console.log('        autoplay=' + SPEED + '  1走行上限=' + MAXS + '秒  worker=' + WORKERS
    + '  port=' + PORT + (NEGATIVE ? '   ★負のコントロール (OLD から &recruit=0 を外す)' : ''));

  let srv;
  try { srv = await startServer(PORT); }
  catch (e) {
    console.error('[sweep] ポート ' + PORT + ' を開けません (別のスイープが走っていませんか): ' + e.message);
    process.exit(2);
  }

  /* 仕事 = (シナリオ, ペア番号)。⭐ ペアは 1 worker の中で連続して回す
   *   (OLD/NEW を同一マシン負荷で対にするため。worker をまたぐと対が壊れる) */
  const jobs = [];
  for (const scen of scens) for (let p = 1; p <= PAIRS; p++) jobs.push({ scen, pair: p });

  const runs = [];
  let done = 0;
  let cursor = 0;
  async function worker(widx) {
    const profile = makeProfile('df_sweeprecruit' + widx + '_');
    const browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
             '--user-data-dir=' + profile] });
    try {
      for (;;) {
        const i = cursor++;
        if (i >= jobs.length) break;
        const job = jobs[i];
        /* ⭐ 腕の順を組ごとに入れ替える (常に OLD が先だと順序の効果と腕の効果が混ざる)。
         *   --fixed-order で従来どおり OLD→NEW に固定できる。 */
        const arms = armsFor(job.scen);
        const order = (!FIXED_ORDER && job.pair % 2 === 0) ? [arms[1], arms[0]] : arms;
        for (const arm of order) {
          const r = await runOnce(browser, job.scen, arm, job.pair);
          r.orderFirst = order[0].key;
          runs.push(r);
          done++;
          const m = r.metrics || {};
          console.log('  [' + String(done).padStart(3) + '/' + total + '] ' + (r.ok ? '✓' : '⛔') + ' '
            + job.scen + ' pair' + job.pair + ' ' + arm.key
            + ' 計' + (r.first ? r.first.party : '?') + '人'
            + ' → ' + (r.endReason || 'ERR')
            + ' node=' + (m.node === undefined ? '?' : m.node)
            + ' 生存=' + (m.alive === undefined ? '?' : m.alive) + '/' + (m.alliesEnd === undefined ? '?' : m.alliesEnd)
            + (m.joined > 0 ? '(+' + m.joined + '合流)' : '')
            + ' HP=' + (m.hp === undefined ? '?' : m.hp) + ' XP=' + (m.xp === undefined ? '?' : m.xp)
            + ' (' + r.elapsedS + '秒)'
            + (r.err ? '  ' + r.err : ''));
        }
      }
    } finally { try { await browser.close(); } catch (e) {} }
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  srv.close();

  for (const scen of scens) summarize(runs, scen).forEach(l => console.log(l));

  /* 生データは毎回**新しいファイル名**へ (依頼書 §3-6) */
  /* ⚠ slice(0,15) にすると ISO のミリ秒直前の '.' まで拾って `..json` になる (スモークで実測) */
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   /* YYYYMMDDhhmmss (UTC) */
  const outPath = OUT_ARG || path.join(os.tmpdir(),
    'df_sweep_recruit_' + scens.join('+') + '_' + stamp + (NEGATIVE ? '_NEG' : '') + '.json');
  try {
    fs.writeFileSync(outPath, JSON.stringify({
      scens, pairs: PAIRS, speed: SPEED, maxS: MAXS, workers: WORKERS,
      negative: NEGATIVE, fixedOrder: FIXED_ORDER, runs }, null, 1), 'utf8');
    console.log('\n[sweep] 生データ: ' + outPath);
  } catch (e) { console.log('\n[sweep] 生データの書き出しに失敗: ' + e.message); }

  const broken = runs.filter(r => !r.ok);
  if (NEGATIVE) {
    /* 負のコントロール: OLD 腕の assert 1 / 4 が**赤くなるはず**。緑のままなら assert が空回り */
    const oldRuns = runs.filter(r => r.arm === 'OLD');
    const fired = oldRuns.filter(r =>
      (r.asserts['1_isRecruitOn'] && !r.asserts['1_isRecruitOn'].ok) ||
      (r.asserts['4_partySize'] && !r.asserts['4_partySize'].ok));
    console.log('\n[negative] OLD 腕 ' + oldRuns.length + ' 走行のうち '
      + fired.length + ' 走行で装置 assert 1/4 が赤くなりました');
    if (oldRuns.length && fired.length === oldRuns.length) {
      console.log('[negative] ✓ 装置 assert は空回りしていない');
      process.exit(0);
    }
    console.log('[negative] ⛔ 赤くならなかった = assert が測定装置を守れていない');
    process.exit(1);
  }
  if (broken.length) {
    console.log('\n[sweep] ⛔ 装置 assert が崩れた走行が ' + broken.length + '/' + runs.length + ' 件あります');
    process.exit(1);
  }
  console.log('\n[sweep] ✓ 全 ' + runs.length + ' 走行が装置 assert を通りました');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(3); });
