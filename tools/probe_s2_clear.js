#!/usr/bin/env node
/*
 * probe_s2_clear.js — 実装依頼書 #18「シナリオ2 のクリア率 0% の原因調査」の測定台
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ **調査だけの道具**。本番 (index.html / tavern.html / audio.js / js/) は 1 バイトも変えない。
 *    起動時に `git diff HEAD --stat -- <本番4系統>` を引いて、空でなければ exit 2 で止まる。
 *    (前半と後半で別ビルドの混合物になると、出た差が何の差か言えなくなるため)
 *
 * ■ なぜ sweep_recruit_balance.js ではなく別の台なのか (依頼書 §4)
 *   sweep は「腕 A と腕 B のクリア率の差」を測る道具で、**負け方を見ていない**。
 *   #18 の起草前実測が出した核 = 「**全滅ではなく主人公 1 人が死んでいる**」は
 *   sweep の列 (仲間生存/XP/HP) からは読めても**機械検査されていなかった**。
 *   本台は決着を 4 分類し、敗北のたびに「そのとき仲間は何人生きていたか」を
 *   **本番の isPartyWiped() / isHeroAlive() を呼んで**突き合わせる。
 *
 * ■ 1 走行の手順 (sweep_recruit_balance.js から継承)
 *   1. dragonfighters.* / df.* を purge し prologueSeen だけ焼く
 *      ⚠ purge は **最初の document だけ** (sessionStorage の番兵)。index.html で
 *        もう一度走ると departToScenario() が置いた partyMembers を自分で消してしまう
 *   2. tavern.html?autoplay=N (+ 腕のクエリ) を開く
 *   3. 本番の関数だけを呼ぶ: prepScenario → regeneratePartyMembers() → departToScenario()
 *   4. 遷移は横取りしない。index.html への着地を mapData / heroAI で待つ
 *   5. 1 秒間隔でポーリング (⚠ 150ms の evaluate は測定対象そのものを遅くする = P9 の教訓)
 *   ⛔ index.html の直起動にしない。人数が本番と変わる (#8 の実測)。
 *
 * ■ ⭐⭐⭐ 実測で分かった罠: departToScenario() は autoplay と evade しか引き継がない
 *   (tavern.html:5414 付近)。つまり **?dndrange=0 / ?mopup=0 / ?s2fold=0 を酒場の URL に
 *   付けても index.html には届かない** (どれも index 側で location.search を読む IIFE)。
 *   → 本台は evaluateOnNewDocument + history.replaceState で index.html の
 *     location.search を**着弾前に**書き換える。ページ内スクリプトより先に走るので
 *     3870 (S2_FOLD_OFF) / 4581 (RANGE_LEGACY) / 19240 (MOPUP_OFF) の IIFE に間に合う。
 *   ⚠ 効いたかどうかは推測しない。着地後に**本番の const を裸の識別子で読んで**
 *     期待値と突き合わせる (装置 assert 0f)。読めなければ赤くなる。
 *
 * ■ 決着の 4 分類 (依頼書 §8-1)
 *   clear / defeat / stall / timeout。**stall は秒数では決めない**。
 *   localStorage["dragonfighters.debugReport"] の runs[].outcome === "aborted" と
 *   violations["stall"|"run-timeout"] だけが根拠 (⛔ 「上限秒数を超えた」= 遅いだけの走行)。
 *   ⚠ 診断は ?autoplay があれば既に動いている (index.html:3227 の __diagEnabled)。
 *     新しい計測シームを本番へ置く必要は無い = changelog ガードも鳴らない。
 *
 * ■ 装置 assert (これが無いと全部緑になる)
 *   0a 酒場側 isRecruitOn() / recruitCountOf(sc) が腕どおり
 *   0b 着地 URL が /index.html を含み scenarioId === "bandits-forest"
 *   0d ⭐ **診断が生きている**こと (debugReport が 1 走行でも読めている)。
 *      ⚠⚠ これが無いと「aborted 0 件」と「診断が起動していない」が区別できない。
 *      #18 の起草前実測は 25 走行 0 件だった = **0 件を出す検出器は母集団ガードと対**
 *   0e 入場 Lv が腕の期待値どおり (XP 焼きが効いているか)
 *   0f 腕のクエリスイッチが index 側の const へ届いているか
 *   1a 決着が 4 分類のちょうど 1 つ / 1b ページ側と debugReport の**2 経路が一致**
 *   1c stall と数えた走行は violations に stall か run-timeout を持つ
 *   2a 終了時の仲間生存数が debugReport.partyAlive と一致 (±1 はポーリングのずれ)
 *   2b ⭐ 死んだ瞬間の isPartyWiped() (**本番の関数**) と自前の生存数が矛盾しない
 *   2c 主人公の被ダメージ比が 0..1 に収まる
 *   ⚠ 母集団ガード (0c): 「何走行を集計できたか」を必ず 1 行出す。件数を出さない集計は禁止。
 *
 * ■ 負のコントロール (--negative)
 *   ⚠ 変異は**配信スナップショットをメモリ上で差し替えて**作る。本番ファイルは書き換えない。
 *   ⚠⚠ アンカー文字列が見つからなければ**空振り**なので exit 2 で止める
 *     (変異が当たらないまま「赤くならなかった」を報告するのが最悪の結果)。
 *   ⭐ stall 系は 2 本に割る。#18 の起草前実測が示すとおり**自然には停滞しない** (25 走行 0 件)
 *     ので、STUCK_ABORT_MS を 1ms へ縮めて**停滞を人工的に起こしてから**目隠しする。
 *     こうしないと「目隠ししても何も起きない = 検査力ゼロ」の負のコントロールになる。
 *
 * 使い方:
 *   node tools/probe_s2_clear.js --arm base          --runs 10
 *   node tools/probe_s2_clear.js --arm xp:1890       --runs 10     # Lv2 (廃坑 1 周ぶん)
 *   node tools/probe_s2_clear.js --arm qs:dndrange=0 --runs 10
 *   node tools/probe_s2_clear.js --arm mine          --runs 5      # 廃坑を実際に 1 周してから
 *   node tools/probe_s2_clear.js --negative
 * 腕: base / xp:<累積XP> / qs:recruit=0 / qs:dndrange=0 / qs:mopup=0 / qs:s2fold=0 / mine
 * オプション: --arm --runs(--pairs) --speed --port --max --negmax --workers --out
 *             --headful --browser --negative
 * exit 0=装置 assert が全部期待どおり / 1=装置 assert が崩れた / 2=環境不足・本番が dirty / 3=例外
 *
 * ⚠⚠ 測定中に index.html / tavern.html を編集しないこと。
 */
'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   /* ⚠ path.resolve 必須 (スラッシュのまま持つと
                                                 path.join の返す区切りと startsWith が一致せず全 404) */

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : dflt;
}
const has = (n) => process.argv.includes('--' + n);

const ARM_ARG  = arg('arm', 'base');
/* ⚠ 依頼書 §8 の実行例が --pairs と書いているので別名で受ける (本台は単腕なので実体は走行数) */
const RUNS     = Math.max(1, parseInt(arg('runs', arg('pairs', '3')), 10));
const SPEED    = parseInt(arg('speed', '15'), 10);
const PORT     = parseInt(arg('port', '9371'), 10);
const MAXS     = parseInt(arg('max', '420'), 10);
const NEGMAXS  = parseInt(arg('negmax', '240'), 10);
const WORKERS  = Math.max(1, parseInt(arg('workers', '1'), 10));
const HEADFUL  = has('headful');
const NEGATIVE = has('negative');
const OUT_ARG  = arg('out', null);

const SCEN = 'bandits-forest';
const MINE = 'goblin-mine';

/* ── ドライバが独立に持つ期待値 ────────────────────────────────────────────
 * ⭐ index.html の XP_THRESHOLDS を写経したものではなく、D&D 3.5 の累積式
 *   「Lv N の累積XP = (N-1)*N/2 * 1000」から出している (両方同時に間違えないため)。
 * ⭐ 期待 NPC 数と★は #8 の装置 assert 2 と同じ独立表。仕様を変えたらここが赤くなる。 */
function expectLevelFromXp(xp) {
  let lv = 1;
  for (let n = 2; n <= 10; n++) if (xp >= (n - 1) * n / 2 * 1000) lv = n;
  return lv;
}
const S2_EXPECT = { stars: 2, npc: 2, label: 'シナリオ2 ★2 (盗賊団のアジト)' };

/* ── 腕 ───────────────────────────────────────────────────────────────────── */
const INDEX_SWITCHES = { dndrange: 'RANGE_LEGACY', mopup: 'MOPUP_OFF', s2fold: 'S2_FOLD_OFF' };

function parseArm(spec) {
  const a = { spec, tavernQs: '', indexQs: null, xpSeed: null, mine: false,
              expectRecruitOn: true, expectLevel: 1, expectLevelMin: null, expectSwitch: null };
  if (spec === 'base') return a;
  if (spec === 'mine') {
    /* 腕 C: 廃坑を**実際に**1 周してから続けて出発する。装備と金貨も本物になる。
     * ⚠ 廃坑は同じ Lv1 で 2/3 しかクリアしない (#18 §2-6) ので、
     *   **クリアできた走行だけ**を母集団にする (失敗を混ぜると入場状態が腕の中で割れる)。 */
    a.mine = true; a.expectLevel = null; a.expectLevelMin = 2; return a;
  }
  let m = /^xp:(\d+)$/.exec(spec);
  if (m) { a.xpSeed = parseInt(m[1], 10); a.expectLevel = expectLevelFromXp(a.xpSeed); return a; }
  m = /^qs:([A-Za-z0-9_]+)=([A-Za-z0-9_]+)$/.exec(spec);
  if (m) {
    const k = m[1], v = m[2];
    if (k === 'recruit') { a.tavernQs = '&recruit=' + v; a.expectRecruitOn = (v !== '0'); return a; }
    if (INDEX_SWITCHES[k]) {
      a.indexQs = { k: k, v: v };
      a.expectSwitch = { name: INDEX_SWITCHES[k], want: (v === '0') };
      return a;
    }
    console.error('[probe] 未知のクエリ腕: ' + spec
      + '  (使えるのは recruit / ' + Object.keys(INDEX_SWITCHES).join(' / ') + ')');
    console.error('  ⚠ 表に無いスイッチを黙って通すと「腕が割れていないのに数字が出る」ので止めています。');
    process.exit(2);
  }
  console.error('[probe] 腕の書式が不正: ' + spec + '  (base / xp:<数> / qs:<key>=<値> / mine)');
  process.exit(2);
}

/* ── 配信スナップショットの変異 (負のコントロール専用) ─────────────────────
 * ⚠ 本番ファイルは読むだけで書き換えない。差し替えるのは HTTP で返す文字列だけ。
 * ⚠⚠ want と実際の出現数が違ったら **空振り**なので即座に止める。 */
const SNAPSHOT_MUTATIONS = {
  nodiag: {
    file: 'index.html', want: 2,
    find: 'window.__diagEnabled = !!',
    repl: 'window.__diagEnabled = false && !!',
    note: '診断を眠らせる (?autoplay は残す = 走行は進むがレポートが出ない)',
  },
  stallabort: {
    file: 'index.html', want: 1,
    find: 'const STUCK_ABORT_MS = 90000;',
    repl: 'const STUCK_ABORT_MS = 1;',
    note: '進行ウォッチドッグを 1ms へ = 停滞を人工的に起こす',
  },
};

function loadMutation(key) {
  const m = SNAPSHOT_MUTATIONS[key];
  const src = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  const n = src.split(m.find).length - 1;
  if (n !== m.want) {
    console.error('[probe] ⛔ 変異アンカーの空振り: ' + key + ' は "' + m.find + '" が '
      + m.want + ' 回のはずが ' + n + ' 回でした (' + m.file + ')');
    console.error('  ⚠ 本番が変わった可能性。アンカーを直してから測ってください。');
    console.error('  ⛔ このまま走らせると「赤くならなかった」が変異の空振りなのか');
    console.error('     assert の空回りなのか区別できなくなります。');
    process.exit(2);
  }
  return { file: '/' + m.file, body: src.split(m.find).join(m.repl) };
}

/* ── 本番が dirty でないことの確認 (受入条件 3a) ───────────────────────────── */
function productionDiff() {
  /* ⭐ `git diff` ではなく `git diff HEAD` を引く (staged な変更も拾う = 依頼書より厳しい側) */
  try {
    return execFileSync('git', ['diff', 'HEAD', '--stat', '--',
      'index.html', 'tavern.html', 'audio.js', 'js/'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { return 'GIT-ERROR: ' + ((e && e.message) || e); }
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
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
  console.error('[probe] ブラウザが見つかりません'); process.exit(2);
}

/* ⚠ MIME を落とすと try/catch に飲まれて全 500 = 白紙になる */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* 変異はプロセス内の 1 変数。負のコントロールは直列に回すので競合しない */
let ACTIVE_SNAPSHOT = null;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (ACTIVE_SNAPSHOT && u === ACTIVE_SNAPSHOT.file) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(ACTIVE_SNAPSHOT.body); return;
        }
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

/* ── ページ側 ①: 起動前の仕込み ─────────────────────────────────────────────
 * ⚠ guard 必須: index.html でもう一度走ると departToScenario() の handoff を消してしまう。
 * ⭐ indexQs は history.replaceState で入れる。evaluateOnNewDocument はページ内の
 *   どのスクリプトよりも先に走るので、location.search を読む IIFE に間に合う。 */
function BOOT(cfg) {
  try {
    if (!sessionStorage.getItem('__dfProbePurged')) {
      [localStorage, sessionStorage].forEach(function (s) {
        Object.keys(s).forEach(function (k) {
          if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
        });
      });
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (cfg.xpSeed != null) localStorage.setItem('dragonfighters.xp', String(cfg.xpSeed));
      sessionStorage.setItem('__dfProbePurged', '1');
    }
  } catch (e) {}
  try {
    if (cfg.indexQs && /index\.html$/.test(location.pathname)) {
      const sp = new URLSearchParams(location.search);
      if (sp.get(cfg.indexQs.k) !== cfg.indexQs.v) {
        sp.set(cfg.indexQs.k, cfg.indexQs.v);
        history.replaceState(null, '', location.pathname + '?' + sp.toString());
      }
    }
  } catch (e) {}
}

/* ── ページ側 ②: 酒場で腕を確定して出発させる ──────────────────────────────
 * ⭐ 本番の関数だけを呼ぶ。人数の決め方も Lv の配り方も**ここで再実装しない**
 *   (手作りの partyMembers を注入すると Lv と装備が本番と別物になる)。 */
const KICK = (sid) => {
  const out = { err: '' };
  try {
    out.recruitOn = (typeof isRecruitOn === 'function') ? isRecruitOn() : null;
    const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === sid) : null;
    if (!sc) { out.err = 'scenario not found: ' + sid; return out; }
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

/* ── ページ側 ③: index の観測 (1 秒ごと) ────────────────────────────────────
 * ⚠ 裸の識別子で読む。window.<名前> では読めない (classic script 直下の let/const は
 *   グローバル語彙環境に載るだけで window には載らない)。
 * ⚠ playerHp という識別子は**存在しない**。主人公 (隊列の頭) の HP は裸の hp。
 * ⭐ isHeroAlive() / isPartyWiped() は**本番の関数をそのまま呼ぶ**。式をここへ写経すると
 *   本番が変わっても両方が同時にずれて気づけない (依頼書 §8-2b)。 */
const TICK = () => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const encIdx = g(() => encounterEnemyIndices.slice(), []);
  return {
    scen:    g(() => scenarioId, null),
    node:    g(() => currentNodeId, null),
    over:    g(() => !!gameOver, false),
    cleared: g(() => !!dungeonCleared, false),
    shown:   g(() => !!resultShown, false),
    heroIsHead: g(() => !!heroIsHead, null),
    headHp:  g(() => (typeof hp === 'number' ? hp : null), null),
    headMax: g(() => (typeof maxHp === 'number' ? maxHp : null), null),
    allies:  g(() => allies.map(a => ({
               hp: (typeof a.hp === 'number' ? a.hp : null),
               maxHp: (typeof a.maxHp === 'number' ? a.maxHp : null),
               alive: !!a.alive, isHero: !!a.isHero,
               level: (a.level == null ? null : a.level) })), []),
    /* 本番の関数の存在そのものを装置 assert にする (読めないまま null を集めるのが最悪) */
    fnOk:    g(() => (typeof isHeroAlive === 'function' && typeof isPartyWiped === 'function'), false),
    heroAlive: g(() => isHeroAlive(), null),
    wiped:     g(() => isPartyWiped(), null),
    heroLevel: g(() => getLevelFromXP(currentTotalXp || 0), null),
    xp:      g(() => earnedXpThisRun, null),
    enemyTotal: g(() => enemies.length, -1),
    /* ⭐ 勝利条件と同じ述語で数える (index.html:17746 の enemies.every(!alive || passiveNpc)) */
    enemyLeft:  g(() => enemies.filter(e => e.alive && !e.passiveNpc).length, -1),
    /* ⚠ isBoss は敵**インスタンス**ではなく def に載っている (index.html:15671 の
     *   `enemy.def && enemy.def.isBoss` が本番の読み口)。e.isBoss で読むと全走行
     *   「ボス 0 体」になり、⭐「ボス撃破後に残敵を掃討しきれず負ける」(#18 §2-4) が
     *   丸ごと見えなくなる。スモーク 1 走行で実際に踏んだ。
     * ⚠ passiveNpc は逆にインスタンス側 (勝利条件 index.html:17746 がそう読む)。 */
    bossTotal:  g(() => enemies.filter(e => e.def && e.def.isBoss).length, -1),
    bossAlive:  g(() => enemies.filter(e => e.def && e.def.isBoss && e.alive).length, -1),
    encN:       encIdx.length,
    encNames:   g(() => encIdx.map(i => {
                  const e = enemies[i];
                  return e ? ((e.def && e.def.name) || e.name || '?') : '?'; }), []),
    sw: {
      RANGE_LEGACY: g(() => RANGE_LEGACY, null),
      MOPUP_OFF:    g(() => MOPUP_OFF, null),
      S2_FOLD_OFF:  g(() => S2_FOLD_OFF, null),
    },
    search: g(() => location.search, ''),
  };
};

/* ── ページ側 ④: 診断レポートを小さく読む ─────────────────────────────────── */
const READ_REPORT = () => {
  try {
    const r = JSON.parse(localStorage.getItem('dragonfighters.debugReport') || 'null');
    if (!r) return null;
    return {
      hasCurrent: !!r.current,
      curViol: r.current ? Object.keys(r.current.violations || {}) : [],
      runs: (r.runs || []).map(x => ({
        outcome: x.outcome || null, scen: x.scenarioId || null,
        partyAlive: (typeof x.partyAlive === 'number' ? x.partyAlive : null),
        leaderHp: (typeof x.finalLeaderHp === 'number' ? x.finalLeaderHp : null),
        viol: Object.keys(x.violations || {}),
      })),
    };
  } catch (e) { return null; }
};

/* ── 目隠し (負のコントロールの駆動側) ─────────────────────────────────────── */
function blindTick(t, blind) {
  if (blind === 'wipe') {
    /* 「仲間の生存数」を常に 0 と報告させる。⭐ 本番の isPartyWiped() は触らないので、
     *   自前の数え (0) と本番の判定 (偽) が矛盾する = 2b が赤くなるはず。 */
    return Object.assign({}, t, { allies: t.allies.map(a => Object.assign({}, a, { alive: false })) });
  }
  return t;
}
function blindReport(rep, blind) {
  if (!rep) return rep;
  if (blind === 'stallRound') {
    /* outcome:"aborted" を defeat へ丸める → ページ側 (まだ gameOver でない) と食い違う = 1b */
    return Object.assign({}, rep, { runs: rep.runs.map(r =>
      r.outcome === 'aborted' ? Object.assign({}, r, { outcome: 'defeat' }) : r) });
  }
  if (blind === 'stallViol') {
    /* aborted は残したまま violations から停滞の証拠だけ落とす = 1c */
    const strip = (v) => v.filter(x => x !== 'stall' && x !== 'run-timeout');
    return Object.assign({}, rep, { curViol: strip(rep.curViol),
      runs: rep.runs.map(r => Object.assign({}, r, { viol: strip(r.viol) })) });
  }
  return rep;
}

/* ── 1 レグ (1 シナリオぶんの潜行) を観測する ───────────────────────────────── */
async function observeLeg(page, scen, ctx) {
  const leg = { scen, ticks: 0, elapsedS: 0, first: null, last: null,
                deathSnap: null, encPeak: { n: -1, names: [] },
                dmg: { hero: 0, party: 0, ratio: null },
                report: null, reportRaw: null, reportRun: null, nodes: [] };

  const first = await page.evaluate(TICK);
  leg.first = first;

  /* 被ダメージの追跡。⚠ 回復とレベルアップで HP は増えるので**減った分だけ**足す。
   * ⚠⚠ allies は走行中に増える (廃坑の囚われの従者 / 闇市の召喚)。index で対応付け、
   *   新しく増えた枠は「その時点の HP から」数え始める (増分を被弾に数えない)。 */
  let prevHead = first.headHp;
  let prevAlly = first.allies.map(a => a.hp);
  let headDmg = 0;
  const allyDmg = first.allies.map(() => 0);
  const heroIsHead = first.heroIsHead;

  const t0 = Date.now();
  let last = first;
  const pushNode = (n) => { if (n != null && leg.nodes[leg.nodes.length - 1] !== n) leg.nodes.push(n); };
  pushNode(first.node);

  while ((Date.now() - t0) / 1000 < ctx.maxS) {
    await sleep(1000);
    let t = await page.evaluate(TICK);
    leg.ticks++;
    t = blindTick(t, ctx.blind);

    if (typeof t.headHp === 'number' && typeof prevHead === 'number' && t.headHp < prevHead)
      headDmg += (prevHead - t.headHp);
    prevHead = (typeof t.headHp === 'number') ? t.headHp : prevHead;
    for (let i = 0; i < t.allies.length; i++) {
      const cur = t.allies[i].hp;
      if (i < prevAlly.length) {
        if (typeof cur === 'number' && typeof prevAlly[i] === 'number' && cur < prevAlly[i])
          allyDmg[i] = (allyDmg[i] || 0) + (prevAlly[i] - cur);
      } else { allyDmg[i] = 0; }   /* 途中合流: この時点から数え始める */
    }
    prevAlly = t.allies.map(a => a.hp);

    if (t.encN > leg.encPeak.n) leg.encPeak = { n: t.encN, names: t.encNames.slice(0, 14) };
    pushNode(t.node);

    /* ⭐ 主人公が落ちた**瞬間**を捕まえる (本番の isHeroAlive() で判定)。
     *   ここで「そのとき仲間は何人生きていたか」を採るのが #18 の核。 */
    if (!leg.deathSnap && t.fnOk && t.heroAlive === false) {
      leg.deathSnap = {
        atS: Math.round((Date.now() - t0) / 1000),
        alliesAlive: t.allies.filter(a => a.alive).length,
        alliesTotal: t.allies.length,
        wiped: t.wiped, headHp: t.headHp,
        enemyLeft: t.enemyLeft, bossAlive: t.bossAlive, bossTotal: t.bossTotal,
      };
    }

    last = t;
    if (t.over || t.cleared) break;
    /* ⭐ 停滞で強制終了された走行はページ側のフラグが立たない。診断が run を締めたら抜ける
     *   (これが無いと stall 走行が毎回 --max 秒を食い潰す)。 */
    const rp = await page.evaluate(READ_REPORT);
    if (rp && rp.runs.length > ctx.reportBase) { leg.reportRaw = rp; break; }
  }
  leg.elapsedS = Math.round((Date.now() - t0) / 1000);
  leg.last = last;

  /* finalizeRun は resultShown の後 (500ms 間隔の setInterval) なので少し待って拾う */
  for (let i = 0; i < 16; i++) {
    const rp = await page.evaluate(READ_REPORT);
    leg.reportRaw = rp;
    if (rp && rp.runs.length > ctx.reportBase) break;
    await sleep(500);
  }
  const rep = blindReport(leg.reportRaw, ctx.blind);
  leg.report = rep;
  leg.reportRun = (rep && rep.runs.length > ctx.reportBase) ? rep.runs[rep.runs.length - 1] : null;

  const party = headDmg + allyDmg.reduce((s, x) => s + (x || 0), 0);
  const heroD = heroIsHead ? headDmg
    : allyDmg.reduce((s, x, i) => s + ((first.allies[i] && first.allies[i].isHero) ? (x || 0) : 0), 0);
  leg.dmg = { hero: heroD, party: party, ratio: party > 0 ? Math.round(heroD / party * 1000) / 1000 : null };
  return leg;
}

/* ── 決着の 4 分類 ──────────────────────────────────────────────────────────
 * ⛔ 「上限秒数を超えた」だけで停滞と数えない (遅いだけの走行と混ざる)。
 *   停滞の根拠は debugReport の outcome:"aborted" と violations だけ。 */
function classify(leg) {
  const rr = leg.reportRun;
  const viol = (rr ? rr.viol : (leg.report ? leg.report.curViol : [])) || [];
  const stallEvidence = viol.indexOf('stall') >= 0 || viol.indexOf('run-timeout') >= 0;
  if (rr && rr.outcome === 'aborted') return 'stall';
  if (leg.last.cleared) return 'clear';
  if (leg.last.over) return 'defeat';
  if (stallEvidence) return 'stall';
  return 'timeout';
}

/* ── 1 走行 ─────────────────────────────────────────────────────────────── */
async function runOnce(browser, arm, idx, neg) {
  const rec = { idx, arm: arm.spec, neg: (neg ? neg.key : null), ok: false, asserts: {},
                outcome: null, discarded: null, pageerrors: [], err: '', elapsedS: 0 };
  const page = await browser.newPage();
  const maxS = neg ? NEGMAXS : MAXS;
  const blind = neg ? (neg.blind || null) : null;
  try {
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', e => { if (rec.pageerrors.length < 5) rec.pageerrors.push(e.message); });

    const bootCfg = {
      xpSeed: (neg && neg.drop === 'xpSeed') ? null : arm.xpSeed,   /* ⭐ xpseedoff: 黙って無効化 */
      indexQs: arm.indexQs,
    };
    await page.evaluateOnNewDocument(BOOT, bootCfg);

    const tavQs = (neg && neg.drop === 'recruitQs') ? '' : arm.tavernQs;  /* ⭐ norecruitarm */
    const tavUrl = 'http://localhost:' + PORT + '/tavern.html?autoplay=' + SPEED + tavQs;

    const waitTavern = "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof selection !== 'undefined'"
      + " && selection && Array.isArray(selection.partyComposition)";
    const waitIndex = "typeof mapData !== 'undefined' && typeof heroAI === 'function'";

    /* ── 腕 C: 先に廃坑を 1 周させる (装備と金貨も本物にする) ── */
    if (arm.mine) {
      await page.goto(tavUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(waitTavern, { timeout: 30000 });
      const k0 = await page.evaluate(KICK, MINE);
      if (k0.err) { rec.err = '廃坑の出発: ' + k0.err; return rec; }
      try { await page.waitForFunction(waitIndex, { timeout: 60000 }); }
      catch (e) { rec.err = '廃坑へ着地せず'; return rec; }
      const rpM = await page.evaluate(READ_REPORT);
      const mineLeg = await observeLeg(page, MINE,
        { maxS: maxS, blind: null, reportBase: rpM ? rpM.runs.length : 0 });
      rec.mine = { outcome: classify(mineLeg), elapsedS: mineLeg.elapsedS, xp: mineLeg.last.xp };
      if (rec.mine.outcome !== 'clear') {
        /* ⚠ 廃坑は同じ Lv1 で 2/3 しかクリアしない (#18 §2-6)。失敗を混ぜると入場状態が割れる */
        rec.discarded = 'mine-not-cleared(' + rec.mine.outcome + ')';
        return rec;
      }
      /* クリア報酬 (xp/gold/装備) が localStorage へ落ちるのを待つ */
      for (let i = 0; i < 20; i++) {
        const seeded = await page.evaluate(() => {
          try { return Number(localStorage.getItem('dragonfighters.xp')) || 0; } catch (e) { return 0; }
        });
        if (seeded > 0) { rec.mine.storedXp = seeded; break; }
        await sleep(500);
      }
      if (!rec.mine.storedXp) { rec.discarded = 'mine-xp-not-persisted'; return rec; }
    }

    /* ── 本命: シナリオ2 へ出発 ── */
    await page.goto(tavUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(waitTavern, { timeout: 30000 });

    const kick = await page.evaluate(KICK, SCEN);
    rec.tavern = kick;
    if (kick.err) { rec.err = '酒場: ' + kick.err; return rec; }

    /* (0a) 腕が本当に割れているか */
    rec.asserts['0a_recruitArm'] = {
      got: { recruitOn: kick.recruitOn, decided: kick.decided, stars: kick.stars },
      want: { recruitOn: arm.expectRecruitOn, decided: S2_EXPECT.npc, stars: S2_EXPECT.stars },
      ok: kick.recruitOn === arm.expectRecruitOn
          && kick.decided === S2_EXPECT.npc && kick.stars === S2_EXPECT.stars };

    let landed = null;
    try { await page.waitForFunction(waitIndex, { timeout: 60000 }); landed = page.url(); }
    catch (e) { landed = 'TIMEOUT url=' + page.url(); rec.err = '着地せず: ' + landed; }
    rec.landed = landed;

    const rp0 = await page.evaluate(READ_REPORT);
    const reportBase = rp0 ? rp0.runs.length : 0;

    const t0 = await page.evaluate(TICK);
    rec.entry = { level: t0.heroLevel, headMax: t0.headMax, heroIsHead: t0.heroIsHead,
                  allies: t0.allies.length, allyLvls: t0.allies.map(a => a.level),
                  search: t0.search, sw: t0.sw, fnOk: t0.fnOk,
                  enemyTotal: t0.enemyTotal, enemyLeft: t0.enemyLeft };

    /* (0b) 着地 */
    rec.asserts['0b_landed'] = {
      got: { url: landed, scen: t0.scen }, want: { url: '.../index.html', scen: SCEN },
      ok: /\/index\.html/.test(String(landed)) && t0.scen === SCEN };

    /* (0e) 入場 Lv が腕どおり */
    rec.asserts['0e_entryLevel'] = (arm.expectLevel != null)
      ? { got: t0.heroLevel, want: arm.expectLevel, ok: t0.heroLevel === arm.expectLevel }
      : { got: t0.heroLevel, want: '>=' + arm.expectLevelMin,
          ok: typeof t0.heroLevel === 'number' && t0.heroLevel >= arm.expectLevelMin };

    /* (0f) クエリ腕が index 側の const へ届いているか */
    if (arm.expectSwitch) {
      const got = t0.sw[arm.expectSwitch.name];
      rec.asserts['0f_indexSwitch'] = {
        got: { name: arm.expectSwitch.name, value: got, search: t0.search },
        want: arm.expectSwitch.want, ok: got === arm.expectSwitch.want };
    }

    /* (2b の前提) 本番の関数が読めているか */
    rec.asserts['2b_prodFnReadable'] = { got: t0.fnOk, want: true, ok: t0.fnOk === true };

    /* 負のコントロールは入口 assert が既に赤ければ走らせずに戻す (時間の節約) */
    if (neg && neg.expectRed.some(k => rec.asserts[k] && !rec.asserts[k].ok)) {
      rec.outcome = 'skipped-entry-red';
      rec.ok = Object.keys(rec.asserts).every(k => rec.asserts[k].ok);
      return rec;
    }
    if (!rec.asserts['0b_landed'].ok) return rec;

    const leg = await observeLeg(page, SCEN, { maxS: maxS, blind: blind, reportBase: reportBase });
    rec.elapsedS = leg.elapsedS;
    rec.outcome = classify(leg);
    rec.leg = {
      nodes: leg.nodes, ticks: leg.ticks, encPeak: leg.encPeak, dmg: leg.dmg,
      deathSnap: leg.deathSnap,
      end: { cleared: leg.last.cleared, over: leg.last.over, shown: leg.last.shown,
             headHp: leg.last.headHp, node: leg.last.node, xp: leg.last.xp,
             alliesAlive: leg.last.allies.filter(a => a.alive).length,
             alliesTotal: leg.last.allies.length,
             enemyLeft: leg.last.enemyLeft, enemyTotal: leg.last.enemyTotal,
             bossAlive: leg.last.bossAlive, bossTotal: leg.last.bossTotal },
      report: leg.reportRun,
      reportSeen: leg.report ? { runs: leg.report.runs.length, hasCurrent: leg.report.hasCurrent } : null,
    };

    /* (0d) ⭐ 診断が生きている = 「aborted 0 件」を主張してよい母集団か */
    const seen = leg.report ? (leg.report.runs.length + (leg.report.hasCurrent ? 1 : 0)) : 0;
    rec.asserts['0d_diagAlive'] = { got: seen, want: '>=1', ok: seen >= 1 };

    /* (1a) 4 分類のちょうど 1 つ + 矛盾していない */
    rec.asserts['1a_outcomeOne'] = {
      got: { outcome: rec.outcome, cleared: leg.last.cleared, over: leg.last.over },
      want: 'clear|defeat|stall|timeout かつ cleared と over が同時に立たない',
      ok: ['clear', 'defeat', 'stall', 'timeout'].indexOf(rec.outcome) >= 0
          && !(leg.last.cleared && leg.last.over) };

    /* (1b) ⭐ 2 経路の突き合わせ。⛔ 片方の写経にしない */
    const pageSide = leg.last.cleared ? 'clear' : (leg.last.over ? 'defeat' : 'running');
    const repSide = leg.reportRun ? leg.reportRun.outcome : null;
    const AGREE = { clear: 'clear', defeat: 'defeat', aborted: 'running', budget: 'running' };
    rec.asserts['1b_outcomeXcheck'] = {
      got: { page: pageSide, report: repSide },
      want: 'clear↔clear / defeat↔defeat / aborted↔running',
      ok: repSide ? (AGREE[repSide] === pageSide) : (rec.outcome === 'timeout') };

    /* (1c) stall と数えた走行は停滞の証拠を持つ */
    const viol = (leg.reportRun ? leg.reportRun.viol : (leg.report ? leg.report.curViol : [])) || [];
    rec.asserts['1c_stallHasViolation'] = {
      got: { outcome: rec.outcome, viol: viol }, want: 'stall なら violations に stall|run-timeout',
      ok: rec.outcome !== 'stall' || viol.indexOf('stall') >= 0 || viol.indexOf('run-timeout') >= 0 };

    /* (2a) 終了時の仲間生存数を診断側と突き合わせる (±1 はポーリングのずれ) */
    const mineAlive = rec.leg.end.alliesAlive;
    const theirs = leg.reportRun ? leg.reportRun.partyAlive : null;
    rec.asserts['2a_partyAliveXcheck'] = {
      got: { probe: mineAlive, report: theirs }, want: '差が 1 以内',
      ok: (theirs == null) ? (rec.outcome === 'timeout') : Math.abs(mineAlive - theirs) <= 1 };

    /* (2b) ⭐ 死んだ瞬間の本番 isPartyWiped() と自前の生存数が矛盾しない */
    const ds = leg.deathSnap;
    rec.asserts['2b_wipedIdentity'] = ds
      ? { got: { wiped: ds.wiped, alliesAlive: ds.alliesAlive, alliesTotal: ds.alliesTotal, headHp: ds.headHp },
          want: 'allies>0 かつ headHp<=0 のとき wiped === (alliesAlive===0)',
          ok: !(ds.alliesTotal > 0 && ds.headHp != null && ds.headHp <= 0)
              || (ds.wiped === (ds.alliesAlive === 0)) }
      : { got: null, want: 'clear 以外なら死亡スナップショットが在る', ok: rec.outcome === 'clear' };

    /* (2c) 被ダメージ比の破綻検知 */
    const r = leg.dmg.ratio;
    rec.asserts['2c_dmgRatio'] = { got: r, want: 'null または 0..1', ok: r == null || (r >= 0 && r <= 1) };

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

function summarize(runs, arm) {
  const L = [];
  L.push('');
  L.push('══ 集計: ' + SCEN + ' (' + S2_EXPECT.label + ')  腕 = ' + arm.spec + ' ══');
  const broken  = runs.filter(r => !r.ok && !r.discarded);
  const dropped = runs.filter(r => r.discarded);
  const perr    = runs.filter(r => r.pageerrors.length);
  const good    = runs.filter(r => r.ok && !r.discarded);

  /* ⚠ 母集団ガード (0c): 件数を出さない集計は禁止 */
  L.push('  集計できた走行: ' + good.length + '/' + runs.length
    + '   (装置assert崩れ ' + broken.length + ' 件 / 母集団から除外 ' + dropped.length
    + ' 件 / pageerror ' + perr.length + ' 件)');
  for (const r of dropped.slice(0, 6)) L.push('    ▽ run' + r.idx + ' 除外: ' + r.discarded);
  for (const r of broken.slice(0, 8)) {
    const bad = Object.keys(r.asserts).filter(k => !r.asserts[k].ok)
      .map(k => k + '(got=' + JSON.stringify(r.asserts[k].got) + ')');
    L.push('    ⛔ run' + r.idx + ': ' + (bad.length ? bad.join(' , ') : (r.err || '不明')));
  }
  if (!good.length) {
    L.push('  ⛔ 集計できた走行が 0 件 → これは「差が無かった」ではない');
    return L;
  }

  const n = good.length;
  const by = (o) => good.filter(r => r.outcome === o).length;
  L.push('  決着: clear ' + by('clear') + ' (' + pct(by('clear'), n) + ')'
    + ' / defeat ' + by('defeat') + ' (' + pct(by('defeat'), n) + ')'
    + ' / stall ' + by('stall') + ' (' + pct(by('stall'), n) + ')'
    + ' / timeout ' + by('timeout') + ' (' + pct(by('timeout'), n) + ')');

  /* ⭐ #18 の核: 敗北の実体は「全滅」か「主人公 1 人の死」か */
  const lost = good.filter(r => r.outcome !== 'clear' && r.leg && r.leg.deathSnap);
  const heroDown = lost.filter(r => r.leg.deathSnap.alliesAlive >= 1).length;
  const trueWipe = lost.filter(r => r.leg.deathSnap.wiped === true).length;
  L.push('  ⭐ 敗北の実体: 主人公落ち(仲間生存≧1) ' + heroDown + '/' + lost.length
    + ' / 真の全滅(isPartyWiped) ' + trueWipe + '/' + lost.length
    + '   死亡時の仲間生存(中央) ' + median(lost.map(r => r.leg.deathSnap.alliesAlive))
    + '/' + median(lost.map(r => r.leg.deathSnap.alliesTotal)));

  L.push('  入場: Lv中央 ' + median(good.map(r => r.entry.level))
    + ' / 主人公maxHP中央 ' + median(good.map(r => r.entry.headMax))
    + ' / 仲間Lv中央 ' + median(good.reduce((s, r) => s.concat(r.entry.allyLvls || []), []))
    + ' / 出発人数中央 ' + median(good.map(r => r.entry.allies + 1)) + '人'
    + ' / 入場時に場に居る敵(中央) ' + median(good.map(r => r.entry.enemyLeft)));

  const ratios = good.map(r => r.leg && r.leg.dmg ? r.leg.dmg.ratio : null).filter(x => x != null);
  L.push('  被弾比 主人公/パーティ: 中央 ' + median(ratios)
    + '  (比を出せた走行 ' + ratios.length + '/' + n + ')');

  const peaks = good.map(r => r.leg ? r.leg.encPeak.n : null);
  const worst = good.slice().sort((a, b) =>
    ((b.leg ? b.leg.encPeak.n : -1) - (a.leg ? a.leg.encPeak.n : -1)))[0];
  L.push('  同時交戦の最大: 中央 ' + median(peaks)
    + ' / 最大 ' + Math.max.apply(null, peaks.filter(x => typeof x === 'number').concat([-1])));
  if (worst && worst.leg) L.push('    最大時の敵: ' + (worst.leg.encPeak.names.join(',') || '—'));

  const bossDead = good.filter(r => r.leg && r.leg.end.bossTotal > 0 && r.leg.end.bossAlive === 0).length;
  L.push('  終了時の残敵(中央) ' + median(good.map(r => r.leg ? r.leg.end.enemyLeft : null))
    + ' / 敵総数(中央) ' + median(good.map(r => r.leg ? r.leg.end.enemyTotal : null))
    + '   ボス撃破 ' + bossDead + '/' + n);

  L.push('  到達ノード: ' + (() => {
    const d = {};
    for (const r of good) { const k = (r.leg ? r.leg.end.node : '?') + ':' + r.outcome; d[k] = (d[k] || 0) + 1; }
    return Object.keys(d).sort().map(k => k + '×' + d[k]).join('  ');
  })());
  L.push('  XP(中央) ' + median(good.map(r => r.leg ? r.leg.end.xp : null))
    + ' / 主人公HP(中央) ' + median(good.map(r => r.leg ? r.leg.end.headHp : null))
    + ' / 所要秒(中央) ' + median(good.map(r => r.elapsedS)));
  return L;
}

/* ── 負のコントロール ───────────────────────────────────────────────────────
 * ⭐ 「変異を入れたら**赤くなるべき節が実際に赤くなる**」ことを確かめる。
 *   赤くならなければ assert が空回りしている = exit 1。 */
const NEG_CONTROLS = [
  { key: 'norecruitarm', arm: 'qs:recruit=0', drop: 'recruitQs',
    expectRed: ['0a_recruitArm'], note: '腕から &recruit=0 を外す' },
  { key: 'nodiag', arm: 'base', snapshot: 'nodiag',
    expectRed: ['0d_diagAlive'], note: '配信スナップショットで診断を眠らせる' },
  { key: 'xpseedoff', arm: 'xp:1890', drop: 'xpSeed',
    expectRed: ['0e_entryLevel'], note: 'XP 焼きを黙って無効化' },
  { key: 'stallblind', arm: 'base', snapshot: 'stallabort', blind: 'stallRound',
    expectRed: ['1b_outcomeXcheck'], note: '停滞を人工的に起こし aborted を defeat へ丸める' },
  { key: 'stallviolblind', arm: 'base', snapshot: 'stallabort', blind: 'stallViol',
    expectRed: ['1c_stallHasViolation'], note: '停滞は残し violations だけ落とす' },
  { key: 'wipeblind', arm: 'base', blind: 'wipe',
    expectRed: ['2a_partyAliveXcheck', '2b_wipedIdentity'], anyOf: true,
    note: '仲間の生存数を常に 0 と報告させる' },
];

async function runNegative(browser) {
  console.log('\n[negative] 変異 ' + NEG_CONTROLS.length
    + ' 本 (依頼書の 5 本 + stall は (1b)/(1c) を別々に赤くするので 2 本に割った)');
  const results = [];
  for (const c of NEG_CONTROLS) {
    ACTIVE_SNAPSHOT = c.snapshot ? loadMutation(c.snapshot) : null;
    const arm = parseArm(c.arm);
    console.log('\n  ── ' + c.key + ' (' + c.note + ')  腕=' + c.arm
      + '  赤くなるべき: ' + c.expectRed.join(c.anyOf ? ' か ' : ' と '));
    /* wipeblind は「敗北した走行」が要る。クリア率 0% なので通常 1 走行で足りるが、
     * 万一クリアしたら検査力ゼロなので**黙って通さず**やり直す。 */
    let rec = null, tries = 0;
    for (;;) {
      tries++;
      rec = await runOnce(browser, arm, tries, c);
      if (c.key !== 'wipeblind' || rec.outcome !== 'clear' || tries >= 3) break;
      console.log('    ↻ クリアしてしまったので再試行 (敗北走行が無いと検査力ゼロ)');
    }
    const red = c.expectRed.filter(k => rec.asserts[k] && !rec.asserts[k].ok);
    const fired = c.anyOf ? red.length >= 1 : red.length === c.expectRed.length;
    const missing = c.expectRed.filter(k => !rec.asserts[k]);
    console.log('    決着=' + (rec.outcome || 'ERR') + '  赤くなった節: ' + (red.join(' , ') || 'なし')
      + (missing.length ? '   ⚠ 評価されなかった節: ' + missing.join(',') : '')
      + (rec.err ? '   err=' + rec.err : ''));
    for (const k of red) console.log('      ' + k + ' got=' + JSON.stringify(rec.asserts[k].got));
    results.push({ key: c.key, fired: fired, red: red, missing: missing, outcome: rec.outcome, err: rec.err });
  }
  ACTIVE_SNAPSHOT = null;
  console.log('\n[negative] 結果');
  let bad = 0;
  for (const r of results) {
    console.log('  ' + (r.fired ? '✓' : '⛔') + ' ' + r.key
      + '  ' + (r.fired ? '赤くなった (' + r.red.join(',') + ')' : '赤くならなかった'));
    if (!r.fired) bad++;
  }
  if (bad) {
    console.log('\n[negative] ⛔ ' + bad + ' 本が赤くならなかった = assert が測定装置を守れていない');
    process.exit(1);
  }
  console.log('\n[negative] ✓ 全 ' + results.length + ' 本が期待どおり赤くなった (assert は空回りしていない)');
  process.exit(0);
}

/* ── 本体 ───────────────────────────────────────────────────────────────── */
(async () => {
  const arm = parseArm(ARM_ARG);

  /* 受入条件 (3a): 本番が dirty なら測らない */
  const diff = productionDiff();
  console.log('[probe] 本番の差分 (git diff HEAD -- index.html tavern.html audio.js js/): '
    + (diff ? '\n' + diff : '空 ✓'));
  if (diff) {
    console.error('[probe] ⛔ 本番に差分があります。#18 は「本番を 1 バイトも変えない」調査チケットです。');
    console.error('  ⚠ このまま測ると前半と後半が別ビルドの混合物になり、出た差が何の差か言えなくなります。');
    process.exit(2);
  }

  if (NEGATIVE) {
    /* 使う変異のアンカーを**先に全部**検算する (走らせてから空振りに気づくのを防ぐ) */
    for (const k of Object.keys(SNAPSHOT_MUTATIONS)) loadMutation(k);
    console.log('[probe] 変異アンカー ' + Object.keys(SNAPSHOT_MUTATIONS).length + ' 本すべて検算 ✓');
  }

  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const makeProfile = require('./_pptr_profile');

  console.log('[probe] 腕=' + arm.spec + '  走行=' + (NEGATIVE ? NEG_CONTROLS.length : RUNS)
    + '  autoplay=' + SPEED + '  1走行上限=' + (NEGATIVE ? NEGMAXS : MAXS) + '秒'
    + '  worker=' + (NEGATIVE ? 1 : WORKERS) + '  port=' + PORT);
  if (arm.indexQs) console.log('        index 側スイッチ: ?' + arm.indexQs.k + '=' + arm.indexQs.v
    + ' → ' + arm.expectSwitch.name + ' が ' + arm.expectSwitch.want + ' になるはず'
    + '  (⚠ departToScenario は引き継がないので replaceState で入れる)');
  if (arm.xpSeed != null) console.log('        XP 焼き: ' + arm.xpSeed
    + ' → 入場 Lv' + arm.expectLevel + ' のはず');
  if (arm.mine) console.log('        腕 C: 廃坑を実際に 1 周してから出発 (クリアできた走行だけ集計)');

  let srv;
  try { srv = await startServer(PORT); }
  catch (e) {
    console.error('[probe] ポート ' + PORT + ' を開けません (別の測定が走っていませんか): ' + e.message);
    process.exit(2);
  }

  if (NEGATIVE) {
    const profile = makeProfile('df_probe_s2_neg_');
    const browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
             '--user-data-dir=' + profile] });
    try { await runNegative(browser); }
    finally { try { await browser.close(); } catch (e) {} srv.close(); }
    return;
  }

  const runs = [];
  let cursor = 0, done = 0;
  async function worker(widx) {
    const profile = makeProfile('df_probe_s2_' + widx + '_');
    const browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
             '--user-data-dir=' + profile] });
    try {
      for (;;) {
        const i = cursor++;
        if (i >= RUNS) break;
        const r = await runOnce(browser, arm, i + 1, null);
        runs.push(r); done++;
        const e = (r.leg ? r.leg.end : {});
        const ds = (r.leg ? r.leg.deathSnap : null);
        console.log('  [' + String(done).padStart(3) + '/' + RUNS + '] '
          + (r.discarded ? '▽' : (r.ok ? '✓' : '⛔')) + ' run' + r.idx
          + ' → ' + (r.discarded || r.outcome || 'ERR')
          + ' Lv' + (r.entry ? r.entry.level : '?')
          + ' 計' + (r.entry ? r.entry.allies + 1 : '?') + '人'
          + ' 仲間生存=' + (ds ? ds.alliesAlive + '/' + ds.alliesTotal
                              : (e.alliesAlive + '/' + e.alliesTotal))
          + ' 残敵=' + (e.enemyLeft === undefined ? '?' : e.enemyLeft)
          + ' ボス=' + (e.bossTotal ? (e.bossAlive ? '生存' : '撃破') : '—')
          + ' 交戦最大=' + (r.leg ? r.leg.encPeak.n : '?')
          + ' 被弾比=' + (r.leg && r.leg.dmg ? r.leg.dmg.ratio : '?')
          + ' (' + r.elapsedS + '秒)' + (r.err ? '  ' + r.err : ''));
      }
    } finally { try { await browser.close(); } catch (e) {} }
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  srv.close();

  runs.sort((a, b) => a.idx - b.idx);
  summarize(runs, arm).forEach(l => console.log(l));

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const outPath = OUT_ARG || path.join(os.tmpdir(),
    'df_probe_s2_' + arm.spec.replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp + '.json');
  try {
    fs.writeFileSync(outPath, JSON.stringify({
      arm: arm.spec, runs: RUNS, speed: SPEED, maxS: MAXS, workers: WORKERS,
      productionDiff: diff, data: runs }, null, 1), 'utf8');
    console.log('\n[probe] 生データ: ' + outPath);
  } catch (e) { console.log('\n[probe] 生データの書き出しに失敗: ' + e.message); }

  const broken = runs.filter(r => !r.ok && !r.discarded);
  if (broken.length) {
    console.log('\n[probe] ⛔ 装置 assert が崩れた走行が ' + broken.length + '/' + runs.length + ' 件あります');
    process.exit(1);
  }
  console.log('\n[probe] ✓ 全 ' + runs.filter(r => !r.discarded).length + ' 走行が装置 assert を通りました');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(3); });
